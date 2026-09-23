// ─────────────────────────────────────────────────────────────────────────────
// VOLLEY — the wave-3 weapons (Contract C), driven by weapons.js.
//
//   jawbreaker_cannon  'cannon'      a heavy striped ball, 28 u/s, bounces twice,
//                                    big knockback + a splash for anyone beside
//   licorice_whip      'whip'        4.4 u lash, 70° arc: the rope uncoils out
//                                    of the fist, cracks, and hits everything in it
//   poprocks           'poprocks'    lobbed pouch, 3 u fizz AOE + a second of
//                                    crackling after it lands
//   bubblegum_blower   'gum'         a slow growing bubble; whoever it touches is
//                                    stuck in a pink puddle (the enemy holds 4 s)
//   marshmallow_launcher 'marshmallow' soft ranged bonk, bounces off the target
//                                    and off the ground, lies there a moment
//   peppermint_boomerang 'boomerang' elliptical loop out to 11 u and back to
//                                    wherever you are now; hits each target once
//   water_balloon      'water'       lob, 2.4 u splash; cats flee, kids shrink,
//                                    and salt patches in the splash fizz away
//
// Every hit goes through weapons.strike(target, { weapon: <hit name>, power,
// from:{x,z}, kind }) so the enemy systems get the canonical names. One
// InstancedMesh per projectile shape, drawn ONLY while something of that shape
// is in the air; the lash and the boomerang are single meshes, same rule.
// No allocation per frame: projectiles are recycled records, particle option
// bags are reused, the boomerang's hit list is a Set cleared per throw.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mat, clamp, lerp, smoothstep } from '../../core/util.js';
import { buildProjectile, applyPickupGlow } from './items.js';

const CANNON = { speed: 28, vy: 2.2, g: 8, r: 0.24, range: 24, hitR: 1.05, splash: 1.9 };
const WHIP = { range: 4.4, arc: Math.PI * 70 / 180, dur: 0.34 };
const POP = { range: 8, flight: 0.62, arc: 2.3, area: 3.0, crackles: 7, crackleDur: 1.1 };
// `home`: rad/s the soft, slow shots steer toward the target they were aimed
// at — a Sour Patch Kid wanders ~2 u sideways in the 0.4 s a marshmallow is
// in the air, and a soft weapon that whiffs every time is no weapon at all
const GUM = { speed: 13, vy: 0.9, life: 1.15, hitR: 1.05, home: 2.6 };
const MARSH = { speed: 21, vy: 3.4, g: 13, r: 0.16, hitR: 1.1, rest: 2.4, home: 2.4 };
const RANG = { reach: 11, width: 2.3, dur: 1.35, hitR: 1.3 };
const BALLOON = { range: 7.5, flight: 0.56, arc: 1.9, area: 2.4 };
const CAP = 12;
// What each shape looks like in the air: trail colour/width/length, the
// muzzle burst colour, and how much bigger than the baked mesh it flies
// (the mesh is modelled at hand size; in flight it has to read at 31 u).
// Trail ages are set so that at the moment of impact the ribbon still reaches
// (fading) back toward the shooter: one still frame shows who fired at whom.
const LOOK = {
  jaw: { trail: 0xff3b6b, w: 0.7, age: 0.5, flash: 0xff4fa0, scale: 1.7 },
  gum: { trail: 0xff5fb8, w: 0.6, age: 0.55, flash: 0xff7ac8, scale: 1.3 },
  marsh: { trail: 0x4fb4ff, w: 0.56, age: 0.4, flash: 0x7fd0ff, scale: 1.9 },
  pouch: { trail: 0xff3f9a, w: 0.56, age: 0.55, flash: 0xff3f9a, scale: 1.7 },
  balloon: { trail: 0x2f9bff, w: 0.6, age: 0.55, flash: 0x2f9bff, scale: 1.7 },
};
const POP_STARS = [0xff3f9a, 0xff5fb0, 0x5fd8ff, 0xff3f9a, 0xffe23a, 0xff5fb0];

export function createVolley(ctx, K) {
  const world = ctx.world;
  const P = () => ctx.systems.particles;
  const FX = K.fx;                                          // inventory/fx.js (may be null)
  const group = new THREE.Group();
  group.name = 'weapons-volley';
  K.group.add(group);

  // ── meshes ─────────────────────────────────────────────────────────────────
  const projMat = applyPickupGlow(
    mat(0xffffff, { vertexColors: true, roughness: 0.36, metalness: 0 }),
    { rim: 0.35, glow: 1.2 },
  );
  const pools = {};
  for (const key of ['jaw', 'gum', 'marsh', 'pouch', 'balloon']) {
    const { geo } = buildProjectile(key);
    const m = new THREE.InstancedMesh(geo, projMat, CAP);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.castShadow = false; m.count = 0; m.visible = false;
    m.userData.noRay = true; m.userData.noFade = true;
    m.name = 'volley:' + key;
    group.add(m);
    pools[key] = { mesh: m, n: 0 };
  }
  const rang = new THREE.Mesh(buildProjectile('rang').geo, projMat);
  rang.visible = false; rang.castShadow = true; rang.userData.noRay = true; rang.userData.noFade = true;
  rang.scale.setScalar(1.8);                                   // ~1.1 u across: reads at 31 u
  group.add(rang);
  const lash = new THREE.Mesh(buildProjectile('lash').geo, projMat);
  lash.visible = false; lash.castShadow = true; lash.userData.noRay = true; lash.userData.noFade = true;
  group.add(lash);

  // ── recycled projectile records ────────────────────────────────────────────
  const live = [];
  const spare = [];
  function take() {
    const s = spare.pop() || {};
    for (const k in s) s[k] = undefined;
    live.push(s);
    return s;
  }
  function retire(i) { spare.push(live[i]); live.splice(i, 1); }

  // reusable particle option bag (never allocate in update)
  const _o = {};
  function bag() { for (const k in _o) delete _o[k]; return _o; }
  const _hand = new THREE.Vector3();
  const _m4 = new THREE.Matrix4(), _pv = new THREE.Vector3(), _qv = new THREE.Quaternion(), _sv = new THREE.Vector3(), _ev = new THREE.Euler();

  const groundY = (x, z) => {
    const h = world.height(x, z);
    return h < 0 ? 0 : h;
  };
  /** Solid prop in the way? Uses the player's collision core when it exists (Contract A). */
  function wallHit(x, z, r) {
    const po = ctx.systems.player?.pushOut;
    if (typeof po !== 'function') return null;
    try {
      const res = po(x, z, r);
      if (res && res.hit) return res;
    } catch (e) { K.warn('pushOut', e); }
    return null;
  }
  /** Nearest target along the step from (px,pz) to (x,z), within r. */
  function sweep(px, pz, x, z, r, skip) {
    for (const t of K.targets()) {
      if (skip && skip.has(t.ref)) continue;
      for (let k = 0; k <= 2; k++) {
        const ux = px + (x - px) * (k / 2), uz = pz + (z - pz) * (k / 2);
        if (Math.hypot(t.x - ux, t.z - uz) <= r) return t;
      }
    }
    return null;
  }
  const info = (weapon, power, fx, fz, kind = 'throw') => ({ weapon, power, from: { x: fx, z: fz }, kind });
  /** The enemy object (not the recycled target record) nearest inside the aim cone. */
  function lockOn(pl, d, range, cosMin) {
    let best = null, bd = Infinity;
    for (const t of K.targets()) {
      const dx = t.x - pl.x, dz = t.z - pl.z, dist = Math.hypot(dx, dz);
      if (dist > range || dist < 0.2 || (dx * d.x + dz * d.z) / dist < cosMin) continue;
      if (dist < bd) { bd = dist; best = t.ref; }
    }
    return best;
  }
  /** Turn a shot's horizontal velocity toward its locked target, at most `rate` rad/s. */
  function steer(s, rate, dt) {
    const r = s.lock;
    if (!r || s.scored) return;
    const tx = r.x ?? r.pos?.x, tz = r.z ?? r.pos?.z;
    if (tx === undefined || tz === undefined) return;
    const sp = Math.hypot(s.vx, s.vz);
    if (sp < 0.5) return;
    const want = Math.atan2(tx - s.x, tz - s.z), cur = Math.atan2(s.vx, s.vz);
    let da = want - cur;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > 1.4) { s.lock = null; return; }            // flew past it: stop chasing
    const a = cur + clamp(da, -rate * dt, rate * dt);
    s.vx = Math.sin(a) * sp; s.vz = Math.cos(a) * sp;
  }
  /** Muzzle burst + a trail for a fresh projectile record. */
  function launch(s, m, dx, dz) {
    const L = LOOK[s.kind];
    if (!FX || !L) return;
    FX.muzzle(m.x + dx * 0.35, m.y + 0.02, m.z + dz * 0.35, L.flash, 1.5);
    s.tr = FX.trail(L.trail, L.w, L.age);
    FX.trailPush(s.tr, s.x, s.y, s.z);
  }

  // ── particle beats ─────────────────────────────────────────────────────────
  const JAW_COLORS = [0xff2d4a, 0xfff2a8, 0x2f56ff, 0x5be27a, 0xb35bff, 0xffffff];
  function shards(x, y, z, n = 18) {
    const o = bag();
    o.x = x; o.y = y; o.z = z; o.count = n; o.shape = 'confetti'; o.color = JAW_COLORS;
    o.speed = 5.2; o.up = 1.6; o.life = 0.9; o.lifeVar = 0.3; o.size = 0.26; o.sizeVar = 0.3;
    o.gravity = -11; o.drag = 1.2; o.spread = 0.4; o.spin = 9; o.alpha = 1; o.fadeOut = 0.35;
    P()?.burst(o);
  }
  function bonk(x, y, z, big) {
    const o = bag();
    o.x = x; o.y = y; o.z = z; o.count = big ? 16 : 8; o.shape = 'sparkle'; o.blend = 'add';
    o.color = [0xffe23a, 0xfff6b0, 0xffffff]; o.speed = big ? 5.4 : 3.2; o.up = 1.0; o.life = 0.6; o.lifeVar = 0.3;
    o.size = big ? 0.8 : 0.5; o.sizeEnd = 0.05; o.gravity = -4; o.drag = 2.2; o.spread = 0.4; o.spin = 3; o.alpha = 1;
    P()?.burst(o);
  }
  function dust(x, y, z, n = 6, color = 0xe8dcc8) {
    const o = bag();
    o.x = x; o.y = y + 0.1; o.z = z; o.count = n; o.shape = 'puff'; o.color = [color, 0xffffff];
    o.speed = 1.8; o.up = 0.6; o.life = 0.6; o.lifeVar = 0.3; o.size = 0.3; o.sizeEnd = 0.9; o.sizeVar = 0.4;
    o.gravity = -0.5; o.drag = 3; o.spread = 0.4; o.alpha = 0.55; o.fadeOut = 0.6;
    P()?.burst(o);
  }
  function smoke(x, y, z, dx, dz) {
    const o = bag();
    o.x = x + dx * 0.9; o.y = y; o.z = z + dz * 0.9; o.count = 10; o.shape = 'puff';
    o.color = [0xffffff, 0xffe6f2, 0xdfe8ff]; o.colorEnd = 0xffffff;
    o.speed = 2.2; o.up = 0.8; o.life = 0.7; o.lifeVar = 0.3; o.size = 0.35; o.sizeEnd = 1.3; o.sizeVar = 0.4;
    o.gravity = 0.6; o.drag = 2.8; o.spread = 0.5; o.alpha = 0.7; o.fadeOut = 0.6;
    P()?.burst(o);
    const s = bag();
    s.x = x + dx * 0.7; s.y = y; s.z = z + dz * 0.7; s.count = 8; s.shape = 'sparkle'; s.blend = 'add';
    s.color = [0xffd23a, 0xff8cc8, 0xffffff]; s.speed = 3.6; s.life = 0.3; s.size = 0.55; s.sizeEnd = 0.04;
    s.gravity = 0; s.drag = 4; s.spread = 0.3;
    P()?.burst(s);
  }
  function fizzPop(x, y, z, big) {
    const o = bag();
    o.x = x; o.y = y; o.z = z; o.count = big ? 22 : 7; o.shape = 'sparkle'; o.blend = 'add';
    o.color = [0xff5fb0, 0x5fd8ff, 0xffe23a, 0xffffff]; o.speed = big ? 4.6 : 2.6; o.up = 1.4;
    o.life = big ? 0.7 : 0.45; o.lifeVar = 0.3; o.size = big ? 0.7 : 0.48; o.sizeEnd = 0.03;
    o.gravity = -3; o.drag = 2; o.spread = big ? 0.8 : 0.3; o.spin = 4; o.alpha = 1; o.flicker = true;
    P()?.burst(o);
    if (big) {
      const c = bag();
      c.x = x; c.y = y; c.z = z; c.count = 14; c.shape = 'confetti'; c.color = [0xff3f9a, 0x3aa8ff, 0xffe23a];
      c.speed = 4; c.up = 2; c.life = 0.8; c.size = 0.16; c.gravity = -10; c.spread = 0.5; c.spin = 12;
      P()?.burst(c);
    }
  }
  function gumSplat(x, y, z, stuck) {
    const o = bag();
    o.x = x; o.y = y; o.z = z; o.count = 12; o.shape = 'puff'; o.color = [0xff8cc8, 0xffc4e4, 0xffffff];
    o.speed = 2.6; o.up = 0.8; o.life = 0.5; o.size = 0.3; o.sizeEnd = 0.8; o.gravity = -3; o.drag = 2.4; o.spread = 0.5; o.alpha = 0.85;
    P()?.burst(o);
    P()?.ripple?.(x, groundY(x, z) + 0.08, z, { ringColor: 0xff8cc8, ringSize: 2.6, ringLife: 0.6 });
    if (stuck) {                                          // the pink puddle the kid is stuck in
      const g = groundY(x, z);
      const d = bag();
      d.x = x; d.y = g + 0.1; d.z = z; d.count = 7; d.shape = 'pool'; d.flat = true; d.ground = 'stick'; d.floorY = g + 0.06;
      d.color = [0xff6fb8, 0xff8cc8]; d.speed = 0.5; d.up = 0.1; d.life = 4.2; d.size = 0.9; d.sizeEnd = 1.3; d.sizeVar = 0.3;
      d.gravity = -6; d.drag = 2; d.spread = 0.5; d.alpha = 0.85; d.fadeIn = 0.05; d.fadeOut = 0.25;
      P()?.burst(d);
    }
  }
  function marshPuff(x, y, z) {
    const o = bag();
    o.x = x; o.y = y; o.z = z; o.count = 10; o.shape = 'soft'; o.color = [0xffffff, 0xfff0f6];
    o.speed = 2.8; o.up = 0.9; o.life = 0.45; o.size = 0.3; o.sizeEnd = 0.08; o.gravity = -6; o.drag = 1.6; o.spread = 0.3; o.alpha = 0.95;
    P()?.burst(o);
  }
  function waterSplash(x, y, z, big) {
    const Pp = P();
    if (!Pp) return;
    Pp.splash?.(x, y + 0.1, z, { count: big ? 34 : 16, speed: big ? 5.4 : 3.6, color: 0x9fe0ff, ringColor: 0xd8f4ff, ringSize: big ? 6 : 3.4, ringLife: 0.9 });
    const o = bag();
    o.x = x; o.y = y + 0.3; o.z = z; o.count = big ? 16 : 8; o.shape = 'puff'; o.color = [0xbfeaff, 0xffffff];
    o.speed = 2.4; o.up = 1.2; o.life = 0.6; o.size = 0.4; o.sizeEnd = 1.1; o.gravity = -2; o.drag = 2.4; o.spread = 0.6; o.alpha = 0.55;
    Pp.burst(o);
    if (big && y > 0.2) {                                 // the wet patch left on the ground
      const d = bag();
      d.x = x; d.y = y + 0.08; d.z = z; d.count = 9; d.shape = 'pool'; d.flat = true; d.ground = 'stick'; d.floorY = y + 0.05;
      d.color = [0x3a7fc8, 0x4f8fd8]; d.speed = 1.4; d.up = 0.1; d.life = 3.6; d.size = 1.0; d.sizeEnd = 1.5; d.sizeVar = 0.3;
      d.gravity = -6; d.drag = 2; d.spread = 1.0; d.alpha = 0.45; d.fadeIn = 0.05; d.fadeOut = 0.5;
      Pp.burst(d);
    }
  }
  function trail(x, y, z, colors, size = 0.34, n = 1) {
    const o = bag();
    o.x = x; o.y = y; o.z = z; o.count = n; o.shape = 'sparkle'; o.blend = 'add'; o.color = colors;
    o.speed = 0.4; o.life = 0.32; o.size = size; o.sizeEnd = 0.02; o.gravity = 0; o.drag = 3; o.spread = 0.12;
    P()?.burst(o);
  }

  // ── state that outlives a projectile ───────────────────────────────────────
  const crackles = [];          // pop-rock afterglow: [{ x, y, z, t, next, left }]
  const rangState = { out: false, t: 0, ox: 0, oz: 0, dx: 0, dz: 0, rx: 0, rz: 0, reach: RANG.reach, side: 1, hits: new Set(), x: 0, y: 0, z: 0, px: 0, pz: 0, spin: 0, trailT: 0, hitsN: 0, tr: -1 };
  const lashState = { on: false, t: 0, yaw: 0, hit: false, tr: -1, cracked: false };

  function emitUse(id, hit, hits, kind, x, z) {
    ctx.events.emit('weapon:use', { weapon: id, hit, hits, kind, x, z });
  }

  // ── firing (called at the release frame of the arm animation) ──────────────
  function fire(mode, id, def, d, m, pl) {
    const hitName = def.hit || id;
    const power = def.power ?? 1.5;
    switch (mode) {
      case 'cannon': {
        let dx = d.x, dz = d.z;
        const a = K.aimAt(pl, d, CANNON.range, 0.55);
        if (a) { const l = Math.hypot(a.x - m.x, a.z - m.z) || 1; dx = (a.x - m.x) / l; dz = (a.z - m.z) / l; }
        const s = take();
        s.kind = 'jaw'; s.id = id; s.hit = hitName; s.power = power;
        s.x = m.x + dx * 0.5; s.y = m.y + 0.05; s.z = m.z + dz * 0.5; s.px = s.x; s.pz = s.z; s.x0 = pl.x; s.z0 = pl.z;
        s.vx = dx * CANNON.speed; s.vy = CANNON.vy; s.vz = dz * CANNON.speed; s.t = 0; s.life = 2.4;
        s.bounces = 0; s.hits = 0; s.spin = 0; s.scored = false;
        launch(s, m, dx, dz);
        smoke(m.x, m.y, m.z, dx, dz);
        ctx.systems.camera?.shake?.(0.22, 0.22);
        return 0;
      }
      case 'whip': {
        const pos = ctx.systems.player?.position || pl;
        let hits = 0;
        for (const t of K.targets()) {
          const tx = t.x - pos.x, tz = t.z - pos.z;
          const dist = Math.hypot(tx, tz);
          if (dist > WHIP.range || dist < 0.01) continue;
          if ((tx * d.x + tz * d.z) / dist < Math.cos(WHIP.arc / 2)) continue;
          K.strike(t, info(hitName, power, pos.x, pos.z, 'melee'));
          bonk(t.x, groundY(t.x, t.z) + 1.0, t.z, false);
          hits++;
        }
        lashState.on = true; lashState.t = 0; lashState.yaw = Math.atan2(d.x, d.z); lashState.hit = hits > 0;
        if (FX) { FX.trailEnd(lashState.tr); lashState.tr = FX.trail(0xff2d4a, 0.46, 0.2); }
        for (const t of K.targets()) {                        // a comic star on everyone it caught
          const tx = t.x - pos.x, tz = t.z - pos.z, dist = Math.hypot(tx, tz);
          if (dist > WHIP.range || dist < 0.01 || (tx * d.x + tz * d.z) / dist < Math.cos(WHIP.arc / 2)) continue;
          FX?.bonk(t.x, groundY(t.x, t.z) + 1.2, t.z, 0xffe23a, 1.5);
        }
        emitUse(id, hitName, hits, 'melee', pos.x, pos.z);
        return hits;
      }
      case 'poprocks':
      case 'balloon': {
        const R = mode === 'poprocks' ? POP : BALLOON;
        const a = K.aimAt(pl, d, R.range + 1.5, 0.6);
        const tx = a ? a.x : m.x + d.x * R.range, tz = a ? a.z : m.z + d.z * R.range;
        const s = take();
        s.kind = mode === 'poprocks' ? 'pouch' : 'balloon'; s.id = id; s.hit = hitName; s.power = power; s.lob = true;
        s.x0 = m.x; s.y0 = m.y; s.z0 = m.z; s.x1 = tx; s.z1 = tz; s.y1 = groundY(tx, tz) + 0.12;
        s.x = m.x; s.y = m.y; s.z = m.z; s.t = 0; s.life = R.flight; s.arc = R.arc; s.spin = 0;
        launch(s, m, d.x, d.z);
        return 0;
      }
      case 'gum': {
        let dx = d.x, dz = d.z;
        const a = K.aimAt(pl, d, GUM.speed * GUM.life, 0.55);
        if (a) { const l = Math.hypot(a.x - m.x, a.z - m.z) || 1; dx = (a.x - m.x) / l; dz = (a.z - m.z) / l; }
        const s = take();
        s.kind = 'gum'; s.id = id; s.hit = hitName; s.power = power;
        s.x = m.x + dx * 0.6; s.y = m.y + 0.02; s.z = m.z + dz * 0.6; s.px = s.x; s.pz = s.z; s.x0 = pl.x; s.z0 = pl.z;
        s.vx = dx * GUM.speed; s.vy = GUM.vy; s.vz = dz * GUM.speed; s.t = 0; s.life = GUM.life; s.spin = 0;
        s.lock = lockOn(pl, d, GUM.speed * GUM.life, 0.55);
        launch(s, m, dx, dz);
        gumSplat(m.x + dx * 0.6, m.y, m.z + dz * 0.6, false);
        return 0;
      }
      case 'marsh': {
        let dx = d.x, dz = d.z;
        const a = K.aimAt(pl, d, 16, 0.55);
        if (a) { const l = Math.hypot(a.x - m.x, a.z - m.z) || 1; dx = (a.x - m.x) / l; dz = (a.z - m.z) / l; }
        const s = take();
        s.kind = 'marsh'; s.id = id; s.hit = hitName; s.power = power;
        s.x = m.x + dx * 0.6; s.y = m.y; s.z = m.z + dz * 0.6; s.px = s.x; s.pz = s.z; s.x0 = pl.x; s.z0 = pl.z;
        s.vx = dx * MARSH.speed; s.vy = MARSH.vy; s.vz = dz * MARSH.speed; s.t = 0; s.life = 2.2;
        s.bounces = 0; s.scored = false; s.rest = 0; s.spin = 0; s.hits = 0;
        s.lock = lockOn(pl, d, 16, 0.55);
        launch(s, m, dx, dz);
        marshPuff(m.x + dx * 0.7, m.y, m.z + dz * 0.7);
        return 0;
      }
      case 'boomerang': {
        const R = rangState;
        const a = K.aimAt(pl, d, RANG.reach + 1, 0.6);
        let dx = d.x, dz = d.z, reach = RANG.reach;
        if (a) {
          const l = Math.hypot(a.x - pl.x, a.z - pl.z) || 1;
          // the loop's apex (u = 0.5, zero lateral offset) lands ON the target
          dx = (a.x - pl.x) / l; dz = (a.z - pl.z) / l; reach = clamp(l + 0.2, 4, RANG.reach + 1);
        }
        R.out = true; R.t = 0; R.ox = m.x; R.oz = m.z; R.dx = dx; R.dz = dz; R.reach = reach;
        R.side = 1; R.hits.clear(); R.hitsN = 0; R.spin = 0; R.trailT = 0; R.id = id; R.hit = hitName; R.power = power;
        R.x = m.x; R.y = m.y; R.z = m.z; R.px = m.x; R.pz = m.z;
        rang.visible = true;
        if (FX) {
          FX.muzzle(m.x + dx * 0.4, m.y, m.z + dz * 0.4, 0x3fe07a, 1.4);
          FX.trailEnd(R.tr); R.tr = FX.trail(0xff1f3f, 0.74, 0.45); FX.trailPush(R.tr, R.x, R.y, R.z);
        }
        return 0;
      }
      default: return 0;
    }
  }

  /** A modal weapon that cannot fire again yet (the boomerang is still out). */
  const busy = (mode) => mode === 'boomerang' && rangState.out;
  /** Should the held mesh be hidden right now (it is in the air)? */
  const handEmpty = (mode) => mode === 'boomerang' && rangState.out;

  // ── landings ───────────────────────────────────────────────────────────────
  function landLob(s) {
    const x = s.x1, z = s.z1, y = s.y1;
    if (s.kind === 'pouch') {
      fizzPop(x, y + 0.3, z, true);
      if (FX) {                                               // the pink crackle-burst
        FX.sprite(FX.CELL.burst, x, y + 0.7, z, 0xff3f9a, 0.9, 2.8, 0.3, false, 1, 0, 0.45);
        FX.ring(x, y, z, 0xff3f9a, POP.area * 2.1, 0.55);
        FX.splat(x, y + 0.06, z, 0xff5fb0, POP.area * 1.5, POP.crackleDur + 0.3, true, 0.7);
        for (let k = 0; k < 4; k++) {
          const a = k * 1.7 + x, r = POP.area * 0.55;
          FX.sparkle(x + Math.cos(a) * r, y + 0.5 + (k % 2) * 0.4, z + Math.sin(a) * r, POP_STARS[k], 1.3, 0.3);
        }
      }
      P()?.ripple?.(x, y + 0.05, z, { ringColor: 0xff8cd9, ringSize: POP.area * 2.2, ringLife: 0.7 });
      const n = K.hitArea(x, z, POP.area, info(s.hit, s.power, x, z, 'throw'));
      crackles.push({ x, y, z, t: 0, next: 0.1, left: POP.crackles });
      emitUse(s.id, s.hit, n, 'throw', x, z);
    } else {
      waterSplash(x, Math.max(0, y - 0.1), z, true);
      if (FX) {                                               // the blue splash ring
        const gy = Math.max(0, y - 0.1);
        FX.ring(x, gy, z, 0x2f9bff, BALLOON.area * 2.3, 0.6);
        FX.ring(x, gy + 0.02, z, 0x9fe0ff, BALLOON.area * 1.3, 0.42);
        FX.drops(x, gy + 0.75, z, 0x2f9bff, 2.6);
        FX.splat(x, gy + 0.05, z, 0x2f7fe0, BALLOON.area * 1.4, 2.6, true, 0.7);
      }
      const n = K.hitArea(x, z, BALLOON.area, info(s.hit, s.power, x, z, 'throw'));
      // water takes salt back down, same as the spray bottle
      const sp = K.saltPatches;
      for (let i = sp.length - 1; i >= 0; i--) {
        const p = sp[i];
        if (Math.hypot(p.x - x, p.z - z) > BALLOON.area + p.r * 0.5) continue;
        sp.splice(i, 1);
        K.fizz(p.x, p.y, p.z);
      }
      emitUse(s.id, s.hit, n, 'throw', x, z);
    }
  }

  // ── frame ──────────────────────────────────────────────────────────────────
  function update(dt) {
    const t = ctx.state.elapsed;
    for (const k in pools) pools[k].n = 0;

    for (let i = live.length - 1; i >= 0; i--) {
      const s = live[i];
      s.t += dt;
      let done = false;

      if (s.lob) {                                              // pop rocks / balloons
        const u = clamp(s.t / s.life, 0, 1);
        s.x = lerp(s.x0, s.x1, u); s.z = lerp(s.z0, s.z1, u);
        s.y = lerp(s.y0, s.y1, u) + Math.sin(u * Math.PI) * s.arc;
        s.spin += dt * (s.kind === 'pouch' ? 11 : 4);
        if (s.kind === 'pouch' && ((t * 30) | 0) % 2 === 0) trail(s.x, s.y, s.z, [0xff5fb0, 0x5fd8ff, 0xffe23a], 0.3);
        FX?.trailPush(s.tr, s.x, s.y, s.z);
        if (u >= 1) { landLob(s); done = true; }
      } else if (s.kind === 'jaw') {
        s.vy -= CANNON.g * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        s.spin += dt * Math.hypot(s.vx, s.vz) * 1.6;
        FX?.trailPush(s.tr, s.x, s.y, s.z);
        if (!s.scored) {
          const tg = sweep(s.px, s.pz, s.x, s.z, CANNON.hitR, null);
          if (tg) {
            s.scored = true;
            K.strike(tg, info(s.hit, s.power, s.x0, s.z0, 'throw'));
            let n = 1;
            for (const o of K.targets()) {                     // the splash: anyone beside it
              if (o.ref === tg.ref || Math.hypot(o.x - s.x, o.z - s.z) > CANNON.splash) continue;
              K.strike(o, info(s.hit, s.power * 0.45, s.x, s.z, 'throw')); n++;
            }
            shards(s.x, s.y, s.z, 20); bonk(s.x, s.y + 0.4, s.z, true);
            if (FX) {                                         // the white sugar puff
              const gy = groundY(s.x, s.z);
              FX.puff(s.x, s.y + 0.35, s.z, 0xffffff, 2.8, 0.75);
              FX.bonk(s.x, s.y + 0.6, s.z, 0xffd21f, 1.9);
              FX.ring(s.x, gy, s.z, 0xff4fa0, 4.2, 0.5);
            }
            ctx.systems.camera?.shake?.(0.3, 0.25);
            emitUse(s.id, s.hit, n, 'throw', s.x, s.z);
            s.vx *= -0.22; s.vz *= -0.22; s.vy = 4.2;         // it rebounds off whoever it hit
          }
        }
        const w = wallHit(s.x, s.z, CANNON.r);
        if (w && s.y < groundY(s.x, s.z) + 3) {
          const nx = w.x - s.x, nz = w.z - s.z, nl = Math.hypot(nx, nz) || 1;
          const vn = (s.vx * nx + s.vz * nz) / nl;
          if (vn < 0) { s.vx -= 1.6 * vn * nx / nl; s.vz -= 1.6 * vn * nz / nl; }
          s.x = w.x; s.z = w.z; s.vx *= 0.5; s.vz *= 0.5;
          dust(s.x, s.y - 0.2, s.z, 5); shards(s.x, s.y, s.z, 5);
        }
        const g = groundY(s.x, s.z);
        if (s.y <= g + CANNON.r) {
          const sp = Math.hypot(s.vx, s.vz);
          if (s.bounces < 2 && sp > 3) {
            s.y = g + CANNON.r; s.vy = Math.abs(s.vy) * 0.42 + 1.4; s.vx *= 0.62; s.vz *= 0.62; s.bounces++;
            if (world.height(s.x, s.z) < 0.1) waterSplash(s.x, 0, s.z, false); else dust(s.x, g, s.z, 7);
            FX?.ring(s.x, g, s.z, 0xff4fa0, 1.9, 0.35);
          } else {
            shards(s.x, g + 0.2, s.z, 14); dust(s.x, g, s.z, 6);
            if (FX) { FX.puff(s.x, g + 0.4, s.z, 0xffffff, 1.9, 0.6); FX.ring(s.x, g, s.z, 0xff4fa0, 2.6, 0.45); }
            done = true;
          }
        }
        if (s.t >= s.life) { shards(s.x, s.y, s.z, 10); done = true; }
        if (done && !s.scored) emitUse(s.id, s.hit, 0, 'throw', s.x, s.z);
        s.px = s.x; s.pz = s.z;
      } else if (s.kind === 'gum') {
        s.vy += 0.5 * dt;                                       // bubbles drift up a touch
        steer(s, GUM.home, dt);
        s.x += s.vx * dt; s.y += s.vy * dt + Math.sin(t * 9 + i) * 0.01; s.z += s.vz * dt;
        const grow = 0.45 + 0.75 * smoothstep(0, 0.6, s.t);
        FX?.trailPush(s.tr, s.x, s.y, s.z);
        const tg = sweep(s.px, s.pz, s.x, s.z, GUM.hitR + grow * 0.25, null);
        if (tg) {
          K.strike(tg, info(s.hit, s.power, s.x0, s.z0, 'throw'));
          gumSplat(tg.x, groundY(tg.x, tg.z) + 0.8, tg.z, true);
          if (FX) {                                           // SPLAT, and the puddle they are stuck in
            const gy = groundY(tg.x, tg.z);
            FX.splat(tg.x, gy + 1.0, tg.z, 0xff5fb8, 2.4, 0.5, false, 0.5);
            FX.splat(tg.x, gy + 0.06, tg.z, 0xff6fb8, 2.6, 4.0, true, 0.85);
            FX.ring(tg.x, gy, tg.z, 0xff7ac8, 3.2, 0.45);
          }
          emitUse(s.id, s.hit, 1, 'throw', tg.x, tg.z);
          done = true;
        } else if (wallHit(s.x, s.z, 0.3) || s.y < groundY(s.x, s.z) + 0.2 || s.t >= s.life) {
          gumSplat(s.x, s.y, s.z, false);
          FX?.splat(s.x, s.y, s.z, 0xff5fb8, 1.6, 0.4, false, 0.5);
          emitUse(s.id, s.hit, 0, 'throw', s.x, s.z);
          done = true;
        }
        s.px = s.x; s.pz = s.z;
      } else if (s.kind === 'marsh') {
        if (s.rest > 0) {                                        // lying in the grass, soon a puff
          s.rest -= dt;
          if (s.rest <= 0) { marshPuff(s.x, s.y, s.z); done = true; }
        } else {
          s.vy -= MARSH.g * dt;
          if (s.bounces === 0) steer(s, MARSH.home, dt);
          s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
          s.spin += dt * 9;
          FX?.trailPush(s.tr, s.x, s.y, s.z);
          if (!s.scored) {
            const tg = sweep(s.px, s.pz, s.x, s.z, MARSH.hitR, null);
            if (tg) {
              s.scored = true;
              K.strike(tg, info(s.hit, s.power, s.x0, s.z0, 'throw'));
              marshPuff(s.x, s.y, s.z); bonk(s.x, s.y + 0.3, s.z, false);
              if (FX) {                                       // BOING: a soft puff with a blue rim
                FX.puff(s.x, s.y + 0.25, s.z, 0xcfeaff, 2.2, 0.6);
                FX.bonk(s.x, s.y + 0.55, s.z, 0xffe23a, 1.4);
                FX.ring(s.x, groundY(s.x, s.z), s.z, 0x4fb4ff, 2.8, 0.45);
              }
              emitUse(s.id, s.hit, 1, 'throw', s.x, s.z);
              s.vx *= -0.28; s.vz *= -0.28; s.vy = 4.6;       // BOING
            }
          }
          const w = wallHit(s.x, s.z, MARSH.r);
          if (w && s.y < groundY(s.x, s.z) + 3) { s.vx *= -0.35; s.vz *= -0.35; s.x = w.x; s.z = w.z; marshPuff(s.x, s.y, s.z); }
          const g = groundY(s.x, s.z);
          if (s.y <= g + MARSH.r) {
            s.y = g + MARSH.r;
            if (s.bounces < 2 && Math.abs(s.vy) > 2) {
              s.vy = Math.abs(s.vy) * 0.5; s.vx *= 0.55; s.vz *= 0.55; s.bounces++; marshPuff(s.x, g + 0.1, s.z);
              FX?.ring(s.x, g, s.z, 0x4fb4ff, 1.5, 0.3);
            }
            else {
              s.vx = 0; s.vz = 0; s.vy = 0; s.rest = world.height(s.x, s.z) < 0.1 ? 0.01 : MARSH.rest;
              FX?.trailEnd(s.tr); s.tr = -1;
              if (!s.scored) emitUse(s.id, s.hit, 0, 'throw', s.x, s.z);
            }
          }
          if (s.t >= s.life && s.rest <= 0) { marshPuff(s.x, s.y, s.z); done = true; }
          s.px = s.x; s.pz = s.z;
        }
      }

      if (done) { FX?.trailEnd(s.tr); retire(i); continue; }

      // draw it
      const pool = pools[s.kind];
      if (pool && pool.n < CAP) {
        _pv.set(s.x, s.y, s.z);
        const big = LOOK[s.kind]?.scale ?? 1;
        let sc = big;
        if (s.kind === 'gum') sc = big * (0.45 + 0.75 * smoothstep(0, 0.6, s.t));
        if (s.kind === 'balloon') {                              // wobbly water
          const w = Math.sin(s.t * 26) * 0.12;
          _sv.set(big * (1 + w), big * (1 - w), big * (1 + w));
        } else _sv.setScalar(sc);
        _ev.set(s.kind === 'marsh' || s.kind === 'pouch' ? s.spin : 0, s.kind === 'jaw' ? 0 : s.spin * 0.5, s.kind === 'jaw' ? -s.spin : 0);
        _qv.setFromEuler(_ev);
        _m4.compose(_pv, _qv, _sv);
        pool.mesh.setMatrixAt(pool.n++, _m4);
      }
    }
    for (const k in pools) {
      const pl = pools[k];
      pl.mesh.count = pl.n; pl.mesh.visible = pl.n > 0;
      if (pl.n) pl.mesh.instanceMatrix.needsUpdate = true;
    }

    // ── pop-rock afterglow ─────────────────────────────────────────────────
    for (let i = crackles.length - 1; i >= 0; i--) {
      const c = crackles[i];
      c.t += dt;
      if (c.t >= c.next) {
        c.next = c.t + POP.crackleDur / POP.crackles;
        const a = c.t * 7.3 + c.left * 2.1, r = POP.area * (0.25 + 0.6 * ((c.left * 0.37) % 1));
        fizzPop(c.x + Math.cos(a) * r, c.y + 0.25, c.z + Math.sin(a) * r, false);
        FX?.sparkle(c.x + Math.cos(a) * r, c.y + 0.45, c.z + Math.sin(a) * r, POP_STARS[c.left % POP_STARS.length], 1.25, 0.3);
        if (--c.left <= 0) crackles.splice(i, 1);
      }
    }

    // ── the boomerang ─────────────────────────────────────────────────────
    const R = rangState;
    if (R.out) {
      R.t += dt;
      const u = clamp(R.t / RANG.dur, 0, 1);
      const pl = ctx.systems.player?.position;
      // an ellipse: out along the right-hand side, back along the left, and
      // it comes home to wherever you are NOW, not where you threw it
      const home = smoothstep(0.45, 1, u);
      const bx = lerp(R.ox, pl ? pl.x : R.ox, home), bz = lerp(R.oz, pl ? pl.z : R.oz, home);
      const fwd = R.reach * Math.sin(Math.PI * u), lat = RANG.width * Math.sin(2 * Math.PI * u);
      const rx = R.dz, rz = -R.dx;                             // right-hand side of the throw
      R.x = bx + R.dx * fwd + rx * lat;
      R.z = bz + R.dz * fwd + rz * lat;
      R.y = (pl ? pl.y : groundY(R.x, R.z)) + 1.15 + 0.55 * Math.sin(Math.PI * u);
      R.spin += dt * 19;
      // multi-hit: every target once per throw
      for (const tg of K.targets()) {
        if (R.hits.has(tg.ref)) continue;
        if (Math.hypot(tg.x - R.x, tg.z - R.z) > RANG.hitR) continue;
        R.hits.add(tg.ref); R.hitsN++;
        K.strike(tg, info(R.hit, R.power, R.x, R.z, 'throw'));
        bonk(tg.x, groundY(tg.x, tg.z) + 1.1, tg.z, false);
        if (FX) { FX.bonk(tg.x, groundY(tg.x, tg.z) + 1.2, tg.z, 0xff1f3f, 1.7); FX.swirl(R.x, R.y, R.z, 0xff1f3f, 1.2); }
      }
      // a wall sends it home early
      if (u < 0.5 && wallHit(R.x, R.z, 0.35)) { R.t = RANG.dur - R.t; dust(R.x, R.y - 0.3, R.z, 4, 0xffffff); }
      R.trailT -= dt;
      if (R.trailT <= 0) { R.trailT = 0.035; trail(R.x, R.y, R.z, [0xff1f3f, 0xffffff, 0x6bff9a], 0.42); }
      rang.position.set(R.x, R.y, R.z);
      // banked 40 degrees toward the camera side so it reads as a spinning
      // wheel of stripes, not a sliver seen edge-on
      rang.rotation.set(-Math.PI / 2 + 0.7, 0, R.spin);
      FX?.trailPush(R.tr, R.x, R.y, R.z);
      if (u >= 1) {
        R.out = false; rang.visible = false;
        trail(R.x, R.y, R.z, [0x6bff9a, 0xffffff], 0.6, 6);
        if (FX) { FX.trailEnd(R.tr); FX.swirl(R.x, R.y, R.z, 0xff1f3f, 1.5); FX.sparkle(R.x, R.y + 0.3, R.z, 0x3fe07a, 1.2); }
        emitUse(R.id, R.hit, R.hitsN, 'throw', R.x, R.z);
      }
    }

    // ── the lash ──────────────────────────────────────────────────────────
    if (lashState.on) {
      const L = lashState;
      L.t += dt;
      const u = L.t / WHIP.dur;
      if (u >= 1) { L.on = false; lash.visible = false; FX?.trailEnd(L.tr); L.tr = -1; }
      else {
        K.handPos(_hand);
        // uncoil fast (0..0.35), hang at full stretch for the crack, reel in
        const reach = WHIP.range * (u < 0.35 ? smoothstep(0, 0.35, u) : 1 - smoothstep(0.55, 1, u) * 0.9);
        const sweepA = lerp(0.75, -0.3, smoothstep(0, 0.5, u));   // swings across the arc
        lash.position.copy(_hand);
        lash.rotation.set(0.12 + 0.25 * Math.sin(u * Math.PI), L.yaw + sweepA, 0, 'YXZ');
        lash.scale.set(1.15, 1.15, Math.max(0.05, reach));
        lash.visible = true;
        if (FX && L.tr >= 0) {                                   // the swoosh the tip draws
          const pitch = 0.12 + 0.25 * Math.sin(u * Math.PI);
          const yaw = L.yaw + sweepA, hr = reach * Math.cos(pitch);
          FX.trailPush(L.tr, _hand.x + Math.sin(yaw) * hr, _hand.y - Math.sin(pitch) * reach, _hand.z + Math.cos(yaw) * hr);
        }
        if (!L.cracked && u >= 0.35) {
          L.cracked = true;
          const tipX = _hand.x + Math.sin(L.yaw + sweepA) * reach, tipZ = _hand.z + Math.cos(L.yaw + sweepA) * reach;
          const o = bag();
          o.x = tipX; o.y = _hand.y - 0.35; o.z = tipZ; o.count = 12; o.shape = 'sparkle'; o.blend = 'add';
          o.color = [0xffffff, 0xfff2a8, 0xff3b5c]; o.speed = 4.2; o.up = 0.6; o.life = 0.35; o.size = 0.7; o.sizeEnd = 0.02;
          o.gravity = 0; o.drag = 3.2; o.spread = 0.2; o.alpha = 1;
          P()?.burst(o);
          P()?.ripple?.(tipX, groundY(tipX, tipZ) + 0.08, tipZ, { ringColor: 0xfff2d8, ringSize: 2.4, ringLife: 0.35 });
          if (FX) {                                           // CRACK
            FX.sprite(FX.CELL.burst, tipX, _hand.y - 0.35, tipZ, 0xffd21f, 0.6, 1.9, 0.24, false, 1, 0, 0.4);
            FX.ring(tipX, groundY(tipX, tipZ), tipZ, 0xff2d4a, 2.6, 0.35);
          }
        }
      }
      if (!L.on) L.cracked = false;
    }
  }

  return {
    group, fire, busy, handEmpty, update,
    get rangOut() { return rangState.out; },
    stats() {
      let calls = 0, inAir = 0;
      for (const k in pools) if (pools[k].mesh.visible) { calls++; inAir += pools[k].n; }
      if (rang.visible) { calls++; inAir++; }
      if (lash.visible) calls++;
      return { calls, inAir, crackles: crackles.length };
    },
  };
}
