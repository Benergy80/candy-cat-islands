// ── The cats that physically stop you leaving ────────────────────────────────
// Every actor here borrows a slot from the shared instanced cat pool, so the
// whole cast costs one draw call. Each factory returns { update(dt), ... }.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, damp, clamp, rng, hash, smoothstep } from '../../../core/util.js';
import { CAT } from '../../../core/palette.js';
import { paint, place } from './catmesh.js';
import { SPOTS } from './scenery.js';

const CENTRE = { x: 150, z: 0 };
export const FURS = [CAT.furOrange, CAT.furGrey, CAT.furWhite, CAT.furCalico, CAT.furTabby, CAT.furBlack];

export function inlandDir(x, z) {
  const dx = CENTRE.x - x, dz = CENTRE.z - z, d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
}
/** Walk inland from (x,z) until the ground is comfortably dry. */
export function safeBeachPoint(world, x, z, minH = 1.6) {
  const d = inlandDir(x, z);
  for (let s = 0; s <= 40; s += 1.2) {
    const nx = x + d.x * s, nz = z + d.z * s;
    if (world.height(nx, nz) > minH) return { x: nx + d.x * 1.5, z: nz + d.z * 1.5 };
  }
  return { x: x + d.x * 12, z: z + d.z * 12 };
}

/** Walk SEAWARD from (x,z) to the last bit of dry sand — where a crowd gathers. */
export function shorePoint(world, x, z, minH = 0.4) {
  const d = inlandDir(x, z);
  if (world.height(x, z) < minH) {            // already offshore: come back in
    for (let s = 0; s <= 60; s += 1.0) {
      const nx = x + d.x * s, nz = z + d.z * s;
      if (world.height(nx, nz) > minH + 0.5) return { x: nx, z: nz };
    }
    return { x: x + d.x * 20, z: z + d.z * 20 };
  }
  for (let s = 0; s <= 70; s += 1.0) {
    const nx = x - d.x * s, nz = z - d.z * s;
    if (world.height(nx, nz) < minH) return { x: nx + d.x * 1.8, z: nz + d.z * 1.8 };
  }
  return { x, z };
}

// ── A tiny walker used by greeters / lantern cats / rope crew ────────────────
export function makeActor(env, fur, x, z, opts = {}) {
  const a = {
    slot: env.pool.alloc(fur), x, z, ry: opts.ry ?? Math.PI, y: 0, phase: Math.random() * 6.28,
    scale: opts.scale ?? 1, show: opts.show ?? true, hop: 0, tilt: 0, squash: 1, speed: opts.speed ?? 2.4,
    sit: opts.sit ?? false, yOffset: 0,
  };
  a.moveTo = (tx, tz, dt, speed = a.speed) => {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d < 0.08) return 0;
    const step = Math.min(d, speed * dt);
    a.x += dx / d * step; a.z += dz / d * step;
    a.ry = Math.atan2(dx, dz);
    a.hop += dt * 11;
    return d;
  };
  a.face = (tx, tz) => { a.ry = Math.atan2(tx - a.x, tz - a.z); };
  a.draw = () => {
    if (!a.show || a.scale <= 0.001) { env.pool.hide(a.slot); return; }
    const gh = env.world.height(a.x, a.z);
    a.y = Math.max(gh, 0.02) + a.yOffset;
    const bob = Math.abs(Math.sin(a.hop)) * 0.16 * (a.sit ? 0 : 1);
    env.pool.set(a.slot, { x: a.x, y: a.y + bob, z: a.z, ry: a.ry, tilt: a.tilt, scale: a.scale, squash: a.squash * (a.sit ? 0.82 : 1) });
  };
  return a;
}

// ═══ GREETER ESCORT ══════════════════════════════════════════════════════════
export function createGreeters(env) {
  let cats = null, t = 0, state = 'idle', lineAt = 0, lineIdx = 0;
  const LINES = [
    ['Pumpkin', 'A human! A real one! Walk this way, walk this way —'],
    ['Pumpkin', 'Do not look at the sea. There is nothing there. Just sea.'],
    ['Dumpling', 'You will LOVE it here. Everyone does. Eventually.'],
    ['Pumpkin', 'The plaza! Our plaza. Now YOUR plaza. Forever your plaza.'],
  ];
  const target = { x: 78, z: 18 };
  return {
    get active() { return state !== 'idle' && state !== 'done'; },
    get state() { return state; },
    start(px, pz) {
      if (state !== 'idle') return;
      const d = inlandDir(px, pz);
      cats = [
        makeActor(env, CAT.furOrange, px - d.z * 1.9 - d.x * 1.2, pz + d.x * 1.9 - d.z * 1.2, { speed: 3.0 }),
        makeActor(env, CAT.furGrey, px + d.z * 1.9 - d.x * 1.2, pz - d.x * 1.9 - d.z * 1.2, { speed: 3.0, scale: 0.92 }),
      ];
      state = 'escort'; t = 0; lineAt = 0.4; lineIdx = 0;
    },
    /** park them in the plaza forever */
    settle() { if (state === 'escort') state = 'done'; },
    update(dt, ctx) {
      if (!cats) return;
      const p = ctx.systems.player?.position; if (!p) return;
      t += dt;
      if (state === 'escort') {
        if (lineIdx < LINES.length && t > lineAt) { env.say(LINES[lineIdx][1], LINES[lineIdx][0]); lineIdx++; lineAt = t + 5.2; }
        const behind = Math.hypot(p.x - cats[0].x, p.z - cats[0].z);
        const arrived = Math.hypot(target.x - cats[0].x, target.z - cats[0].z) < 3.2;
        for (let i = 0; i < cats.length; i++) {
          const c = cats[i], s = i ? -1 : 1;
          if (arrived) { c.face(p.x, p.z); c.hop += dt * 6; }
          else if (behind < 13) {
            const dx = target.x - c.x, dz = target.z - c.z, d = Math.hypot(dx, dz) || 1;
            c.moveTo(target.x - dz / d * 1.9 * s, target.z + dx / d * 1.9 * s, dt);
          } else { c.face(p.x, p.z); c.hop += dt * 3; }   // "we'll wait!"
          c.draw();
        }
        if (arrived && Math.hypot(p.x - target.x, p.z - target.z) < 9) {
          state = 'done';
          env.particles?.burst({ x: target.x, y: env.world.height(target.x, target.z) + 1.6, z: target.z, count: 90, color: [0xffd86b, 0xff7aa2, 0x7fe3a8, 0x6fc7ff], speed: 7, life: 1.9, size: 0.3, gravity: -4.5, spread: 5 });
          env.onEscorted?.();
        }
      } else {
        // ambient plaza greeters, waving at nothing
        for (let i = 0; i < cats.length; i++) {
          const c = cats[i];
          c.hop += dt * (2.2 + i * 0.4); c.face(p.x, p.z);
          c.squash = 1 + Math.sin(t * 2 + i) * 0.04;
          c.draw();
        }
      }
    },
  };
}

// ═══ WAVE OF CATS ════════════════════════════════════════════════════════════
export function createWave(env, count = 12) {
  const R = rng(hash('cat-wave'));
  const cats = [];
  for (let i = 0; i < count; i++) {
    // two tight rows so twelve cats read as one crowd, not twelve dots
    const c = makeActor(env, FURS[i % FURS.length], 0, 0, { show: false });
    const col = Math.floor(i / 2), row = i % 2;
    c.lat = (col - (count / 2 - 1) / 2) * 1.35 + (row ? 0.62 : -0.62) + R.range(-0.18, 0.18);
    c.fwd = (row ? -1.75 : 0) + R.range(-0.45, 0.45);
    c.spin = R.range(12, 17); c.sc = R.range(0.95, 1.25);
    cats.push(c);
  }
  let t = 0, active = false, origin = { x: 0, z: 0 }, dir = { x: 1, z: 0 }, cool = 0, pushed = 0;
  const DUR = 3.4, SPEED = 8.2, START = -8.5;
  return {
    get active() { return active; },
    get ready() { return !active && cool <= 0; },
    trigger(px, pz) {
      if (active || cool > 0) return false;
      dir = inlandDir(px, pz); origin = { x: px, z: pz };
      active = true; t = 0; pushed = 0;
      for (const c of cats) { c.show = true; c.scale = c.sc; c.tilt = 0; }
      env.toast('Whoa! Watch the kitties!');
      env.shake(0.55, 0.7);
      env.tumble(1.15);
      return true;
    },
    update(dt, ctx) {
      if (cool > 0) cool -= dt;
      if (!active) return;
      t += dt;
      const waveS = START + SPEED * t;
      const p = ctx.systems.player?.position;
      // sweep the player inland on the front of the crowd
      if (p && !ctx.systems.player.onFerry) {
        const ps = (p.x - origin.x) * dir.x + (p.z - origin.z) * dir.z;
        if (waveS + 1.4 > ps && waveS < 26) {
          const want = waveS + 1.4;
          const perpX = -dir.z, perpZ = dir.x;
          const pp = (p.x - origin.x) * perpX + (p.z - origin.z) * perpZ;
          const nx = origin.x + dir.x * want + perpX * pp;
          const nz = origin.z + dir.z * want + perpZ * pp;
          if (env.world.height(nx, nz) > -0.5) { p.x = nx; p.z = nz; pushed += SPEED * dt; }
          if (pushed > 1 && pushed < 1 + SPEED * dt * 1.2) env.particles?.burst({ x: p.x, y: p.y + 0.3, z: p.z, count: 14, color: [0xf0dcae, 0xffffff], speed: 3, life: 0.6, size: 0.22, gravity: -5, spread: 1.2 });
        }
      }
      const front = Math.atan2(dir.x, dir.z);
      for (const c of cats) {
        const s = waveS + c.fwd;
        c.x = origin.x + dir.x * s - dir.z * c.lat;
        c.z = origin.z + dir.z * s + dir.x * c.lat;
        c.ry = front + Math.sin(t * 5 + c.phase) * 0.22;
        // galloping, not tumbling — the cat silhouette has to survive
        const gall = Math.sin(t * c.spin + c.phase);
        c.tilt = 0.22 + gall * 0.34;
        c.squash = 1 + gall * 0.16;
        c.yOffset = Math.abs(gall) * 0.52;
        c.hop = 0;
        c.scale = c.sc * smoothstep(0, 0.25, t) * (1 - smoothstep(DUR - 0.5, DUR, t));
        c.draw();
        if (Math.random() < dt * 3.5) env.particles?.burst({ x: c.x, y: env.world.height(c.x, c.z) + 0.15, z: c.z, count: 3, color: [0xf0dcae, 0xfff6e2], speed: 2.2, life: 0.5, size: 0.2, gravity: -5, spread: 0.8 });
      }
      if (t > DUR) { active = false; cool = 7; for (const c of cats) { c.show = false; env.pool.hide(c.slot); } }
    },
  };
}

// ═══ THE NEIGHBOURS NOTICE ═══════════════════════════════════════════════════
// Wave 2: the escape system fires 'escape:start' when the visitor gets into a
// catapult / canoe / flying machine. The cats do not chase (the routes own that
// beat) — they come out of the houses, trot down to the water and WATCH, which
// is somehow worse. Fades itself out after ~11 s and gives the slots back.
export function createNoticers(env, count = 5) {
  const R = rng(hash('cat-noticers'));
  const cats = [];
  for (let i = 0; i < count; i++) {
    const c = makeActor(env, FURS[(i + 2) % FURS.length], 0, 0, { show: false, speed: 5.6 });
    c.scale = 0; c.lat = (i - (count - 1) / 2) * 2.6 + R.range(-0.5, 0.5);
    c.wave = R.range(0.8, 1.4); c.sc = R.range(0.9, 1.15);
    cats.push(c);
  }
  let state = 'off', t = 0, dir = { x: 1, z: 0 }, shore = { x: 0, z: 0 };
  const DUR = 9.5;
  return {
    get active() { return state !== 'off'; },
    /** Somebody is leaving from (px,pz): the neighbourhood comes out to watch. */
    alert(px, pz) {
      if (state !== 'off') return false;
      dir = inlandDir(px, pz);                              // towards the island centre
      shore = shorePoint(env.world, px, pz);
      for (let i = 0; i < cats.length; i++) {
        const c = cats[i];
        const back = 9 + R.range(0, 6);                     // they start up in the town
        c.x = shore.x + dir.x * back - dir.z * c.lat;
        c.z = shore.z + dir.z * back + dir.x * c.lat;
        c.show = true; c.scale = 0; c.squash = 1; c.tilt = 0; c.hop = i * 1.4;
      }
      state = 'run'; t = 0;
      return true;
    },
    stop() { state = 'fade'; t = 0; },
    update(dt, ctx) {
      if (state === 'off') return;
      t += dt;
      const ramp = state === 'fade' ? Math.max(0, 1 - t * 1.6) : Math.min(1, t * 2.2);
      if (state === 'fade' && ramp <= 0) {
        state = 'off';
        for (const c of cats) { c.show = false; env.pool.hide(c.slot); }
        return;
      }
      let allIn = true;
      for (let i = 0; i < cats.length; i++) {
        const c = cats[i];
        const tx = shore.x - dir.z * c.lat, tz = shore.z + dir.x * c.lat;
        if (state === 'run') {
          const d = c.moveTo(tx, tz, dt);
          if (d > 0.9) allIn = false;
          else { c.face(shore.x - dir.x * 10, shore.z - dir.z * 10); c.hop += dt * 2.2; }
        } else {
          // at the water's edge, watching you go, occasionally waving a paw
          c.face(shore.x - dir.x * 14, shore.z - dir.z * 14);
          c.hop += dt * 2.0;
          c.tilt = Math.sin(t * c.wave * 2.4 + i) * 0.16;
          c.squash = 1 + Math.sin(t * 1.6 + i) * 0.05;
        }
        c.scale = c.sc * ramp;
        c.draw();
      }
      if (state === 'run' && (allIn || t > 5.5)) { state = 'watch'; }
      if (state === 'watch' && t > DUR) { state = 'fade'; t = 0; }
    },
  };
}

// ═══ LIFEGUARD ═══════════════════════════════════════════════════════════════
export function createLifeguard(env) {
  const ctx = env.ctx;
  const home = { x: SPOTS.tower.x, z: SPOTS.tower.z };
  const homeY = env.world.height(home.x, home.z) + 3.47;
  const cat = makeActor(env, 0xf7d48a, home.x, home.z, { speed: 15 });
  cat.yOffset = 0; cat.sit = true;
  // red float ring, its own (single) mesh so it can follow him
  const ringParts = [
    paint(new THREE.TorusGeometry(0.62, 0.22, 6, 12), 0xe8452f),
    place(paint(new THREE.TorusGeometry(0.63, 0.23, 6, 12), CAT.cream), 0, 0, 0, 0, Math.PI / 4, 0),
  ];
  const ring = new THREE.Mesh(mergeGeometries(ringParts, false), mat(0xffffff, { vertexColors: true, flatShading: true, roughness: 0.6 }));
  ring.name = 'containment-ring'; ring.castShadow = true; ring.rotation.x = Math.PI / 2;
  ctx.scene.add(ring);

  let state = 'tower', t = 0, cool = 0, target = { x: 0, z: 0 }, drop = null;
  return {
    get busy() { return state !== 'tower'; },
    get ready() { return state === 'tower' && cool <= 0; },
    rescue(px, pz) {
      if (!this.ready) return false;
      state = 'dash'; t = 0; target = { x: px, z: pz };
      env.say('Nope nope nope — hold still, I am TRAINED!', 'Lifeguard Paws');
      return true;
    },
    update(dt, ctx) {
      if (cool > 0) cool -= dt;
      t += dt;
      const p = ctx.systems.player?.position;
      if (state === 'tower') {
        cat.x = home.x; cat.z = home.z; cat.sit = true;
        cat.ry = -0.7 + Math.sin(t * 0.35) * 0.9;
        const gh = env.world.height(cat.x, cat.z);
        cat.yOffset = homeY - Math.max(gh, 0.02);
        cat.draw();
        ring.position.set(home.x + 1.45, gh + 1.0, home.z + 1.1);
        ring.rotation.set(Math.PI / 2, 0, 0.25);
      } else if (state === 'dash') {
        cat.sit = false; cat.yOffset = 0;
        if (p) { target.x = p.x; target.z = p.z; }
        const d = cat.moveTo(target.x, target.z, dt, 17);
        cat.tilt = Math.sin(t * 22) * 0.12;
        cat.draw();
        ring.position.set(cat.x, cat.y + 0.5, cat.z);
        ring.rotation.set(Math.PI / 2 + 0.25, cat.ry, 0);
        env.particles?.burst({ x: cat.x, y: 0.15, z: cat.z, count: 3, color: [0xffffff, 0xbfeaff], speed: 2.6, life: 0.5, size: 0.2, gravity: -5, spread: 0.9 });
        if (d < 1.6) {
          state = 'haul'; t = 0;
          drop = safeBeachPoint(env.world, cat.x, cat.z, 1.7);
          env.particles?.burst({ x: cat.x, y: 0.2, z: cat.z, count: 70, color: [0xffffff, 0xbfeaff, 0x6fc7ff], speed: 8, life: 1.1, size: 0.3, gravity: -9, spread: 1.6 });
          env.shake(0.5, 0.5);
          if (p) { ctx.systems.player.teleport(drop.x, drop.z); }
          env.say('No swimming! The water is… wet.', 'Lifeguard Paws');
          env.toast('Rescued. You did not need rescuing.');
          env.tumble(0.9);
          env.onRescued?.();
        }
      } else if (state === 'haul') {
        cat.x = damp(cat.x, drop.x + 1.6, 4, dt); cat.z = damp(cat.z, drop.z + 1.2, 4, dt);
        cat.face(p?.x ?? drop.x, p?.z ?? drop.z); cat.hop += dt * 4; cat.draw();
        ring.position.set(cat.x, cat.y + 0.75, cat.z); ring.rotation.set(Math.PI / 2, cat.ry, 0);
        if (t > 2.4) { state = 'return'; t = 0; }
      } else {
        cat.sit = false; cat.yOffset = 0;
        const d = cat.moveTo(home.x, home.z, dt, 9); cat.draw();
        ring.position.set(cat.x, cat.y + 0.75, cat.z); ring.rotation.set(Math.PI / 2, cat.ry, 0);
        if (d < 0.5) { state = 'tower'; cool = 3; }
      }
    },
  };
}

// ═══ RAFTS ═══════════════════════════════════════════════════════════════════
function raftMesh(scene, withMast) {
  const parts = [];
  for (let i = 0; i < 5; i++) parts.push(place(paint(new THREE.CylinderGeometry(0.24, 0.24, 3.0, 6), i % 2 ? 0x9c6b42 : 0xb07c4e), (i - 2) * 0.5, 0, 0, Math.PI / 2, 0, 0));
  parts.push(place(paint(new THREE.BoxGeometry(2.6, 0.1, 0.22), 0x6b4a30), 0, 0.24, 1.0));
  parts.push(place(paint(new THREE.BoxGeometry(2.6, 0.1, 0.22), 0x6b4a30), 0, 0.24, -1.0));
  if (withMast) {
    parts.push(place(paint(new THREE.CylinderGeometry(0.07, 0.08, 2.4, 5), 0x8d5a34), 0, 1.2, 0));
    parts.push(place(paint(new THREE.PlaneGeometry(1.3, 1.0), CAT.cream), 0.66, 1.75, 0, 0, Math.PI / 2, 0));
  }
  parts.push(place(paint(new THREE.TorusGeometry(0.3, 0.07, 4, 8), 0xd8c9a0), 0, 0.16, 1.35, Math.PI / 2, 0, 0));
  const m = new THREE.Mesh(mergeGeometries(parts, false), mat(0xffffff, { vertexColors: true, flatShading: true, roughness: 0.85, side: THREE.DoubleSide }));
  m.castShadow = true; m.receiveShadow = true; m.name = 'containment-raft';
  scene.add(m);
  return m;
}

function createRope(scene, color = 0xe3d6b4) {
  // 7.5 cm of rope: thin enough to read as rope, thick enough to survive the
  // game camera at 46 units (at 0.055 it vanished into the palm shadows)
  const g = new THREE.CylinderGeometry(0.075, 0.075, 1, 5);
  g.translate(0, 0.5, 0);
  const m = new THREE.Mesh(g, mat(color, { roughness: 0.9 }));
  m.visible = false; m.name = 'containment-rope'; scene.add(m);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  return {
    mesh: m,
    set(ax, ay, az, bx, by, bz) {
      a.set(ax, ay, az); b.set(bx, by, bz); d.subVectors(b, a);
      const len = d.length(); if (len < 0.01) return;
      m.position.copy(a); m.scale.set(1, len, 1);
      m.quaternion.setFromUnitVectors(up, d.normalize());
      m.visible = true;
    },
    hide() { m.visible = false; },
  };
}

/**
 * A raft you can board. kind 'rope'  → drifts 6u, cats reel it back.
 *                       kind 'paw'   → drifts 20u, the sea objects.
 */
export function createRaft(env, spot, kind, paw) {
  const ctx = env.ctx;
  const mesh = raftMesh(ctx.scene, kind === 'paw');
  const home = { x: spot.x, z: spot.z };
  const dir = inlandDir(home.x, home.z);
  const out = { x: -dir.x, z: -dir.z };                 // seaward
  const OUT_DIST = kind === 'paw' ? 20 : 6;
  const rope = kind === 'rope' ? createRope(ctx.scene) : null;
  const crew = kind === 'rope' ? [makeActor(env, CAT.furTabby, 0, 0, { show: false }), makeActor(env, CAT.furBlack, 0, 0, { show: false })] : null;
  const winch = kind === 'rope' ? SPOTS.winch : null;
  // the rope is tied to the WINCH DRUM (scenery.js puts it 2.6 u out in front of
  // the hut, facing SE) and it is never hidden: a raft you can see is already
  // tethered is the whole joke, and the critics could not find the winch.
  const drum = winch ? { x: winch.x + Math.sin(Math.PI * 0.25) * 2.6, z: winch.z + Math.cos(Math.PI * 0.25) * 2.6 } : null;

  let s = 0, state = 'moored', t = 0;
  const baseY = () => Math.max(env.world.height(home.x + out.x * s, home.z + out.z * s), 0.0);
  const api = {
    mesh, get state() { return state; }, get riding() { return state === 'drift' || state === 'stuck' || state === 'back'; },
    pos() { return { x: home.x + out.x * s, z: home.z + out.z * s }; },
    board() {
      if (state !== 'moored') return false;
      state = 'drift'; t = 0; s = 0;
      const pl = ctx.systems.player; if (pl) pl.locked = true;
      if (kind === 'rope') { env.say('It floats! It actually floats! Goodbye, Cat Island!', 'You'); }
      else { env.say('No cats. No signs. No rope. …This might be it.', 'You'); }
      return true;
    },
    update(dt, ctx) {
      t += dt;
      const pl = ctx.systems.player;
      if (state === 'drift') {
        s = Math.min(OUT_DIST, s + dt * (kind === 'paw' ? 4.2 : 2.2));
        if (kind === 'paw' && t > 2.6 && t < 2.6 + dt * 1.5) env.say('It is working. It is actually working.', 'You');
        if (s >= OUT_DIST - 0.01) { state = 'stuck'; t = 0; if (kind === 'paw') paw?.rise(home.x + out.x * (s + 9), home.z + out.z * (s + 9)); else env.toast('…the rope goes taut.'); }
      } else if (state === 'stuck') {
        if (kind === 'rope') {
          if (t > 1.0 && crew[0].show === false) { for (let i = 0; i < 2; i++) { crew[i].show = true; crew[i].x = winch.x + i * 1.4 - 0.7; crew[i].z = winch.z + 1.6; } env.say('Oh no! Your raft came UNTIED. Terrible.', 'Harbour Crew'); }
          if (t > 1.9) { state = 'back'; t = 0; }
        } else {
          if (paw && paw.landed) { state = 'back'; t = 0; }
          else if (t > 3.2) { state = 'back'; t = 0; }
        }
      } else if (state === 'back') {
        const rate = kind === 'paw' ? 7.0 : 2.6;
        s = Math.max(0, s - dt * rate);
        if (kind === 'rope') for (let i = 0; i < 2; i++) { const c = crew[i]; c.hop += dt * 9; c.face(home.x + out.x * s, home.z + out.z * s); c.tilt = Math.sin(t * 12 + i) * 0.18; }
        if (s <= 0.01) {
          state = 'moored';
          if (pl) { pl.locked = false; const d = safeBeachPoint(env.world, home.x, home.z, 1.4); pl.teleport(d.x, d.z); }
          if (kind === 'rope') { env.toast('“Fixed it for you!”'); for (const c of crew) { c.show = false; env.pool.hide(c.slot); } }
          else { env.toast('Nice try. Score: 1 – 0 cats.'); }
          env.onEscapeFailed?.(kind);
          t = 0;
        }
      }
      // draw — a raft FLOATS, so it never rides higher than the waterline even if
      // the spot it was placed on turns out to be a hand's width of dry sand
      const px = home.x + out.x * s, pz = home.z + out.z * s;
      const bob = Math.sin(ctx.state.elapsed * 1.7) * 0.07;
      const y = Math.min(baseY(), 0.22) + 0.16 + bob;
      mesh.position.set(px, y, pz);
      mesh.rotation.set(Math.sin(ctx.state.elapsed * 1.3) * 0.05, Math.atan2(out.x, out.z), Math.cos(ctx.state.elapsed * 1.1) * 0.05);
      if (api.riding && pl) { pl.position.set(px, y + 0.55, pz); }
      if (rope) {
        rope.set(drum.x, env.world.height(drum.x, drum.z) + 1.05, drum.z, px, y + 0.32, pz);
        if (crew) for (const c of crew) c.draw();
      }
    },
  };
  return api;
}

// ═══ THE GIANT PAW FROM THE SEA ══════════════════════════════════════════════
export function createPaw(env) {
  const parts = [];
  parts.push(place(paint(new THREE.SphereGeometry(4.4, 12, 8), CAT.furOrange), 0, 0, 0, 0, 0, 0, 1.25, 0.85, 1.0));
  for (let i = 0; i < 4; i++) {
    const a = -0.95 + i * 0.63;
    parts.push(place(paint(new THREE.SphereGeometry(1.5, 8, 6), CAT.furOrange), Math.sin(a) * 4.6, 1.3, Math.cos(a) * 4.6));
    parts.push(place(paint(new THREE.ConeGeometry(0.45, 1.5, 5), CAT.cream), Math.sin(a) * 5.9, 1.6, Math.cos(a) * 5.9, 0, -0.9, a));
  }
  parts.push(place(paint(new THREE.CylinderGeometry(3.6, 4.0, 9.0, 12), CAT.furOrange), 0, -5.0, -1.4));
  for (let i = 0; i < 3; i++) parts.push(place(paint(new THREE.TorusGeometry(3.9, 0.45, 5, 14), CAT.furTabby), 0, -2.2 - i * 2.4, -1.4, Math.PI / 2, 0, 0));
  const mesh = new THREE.Mesh(mergeGeometries(parts, false), mat(0xffffff, { vertexColors: true, flatShading: true, roughness: 0.9 }));
  mesh.castShadow = true; mesh.name = 'containment-paw';
  mesh.position.set(0, -60, 0); mesh.visible = false;
  env.ctx.scene.add(mesh);

  let state = 'down', t = 0, at = { x: 0, z: 0 }, ry = 0;
  return {
    mesh, get landed() { return state === 'push' || state === 'sink'; }, get active() { return state !== 'down'; },
    rise(x, z) {
      if (state !== 'down') return;
      at = { x, z }; state = 'rise'; t = 0;
      ry = Math.atan2(150 - x, 0 - z);
      mesh.visible = true;
      env.shake(1.2, 1.4);
      env.say('…', 'You');
      env.particles?.burst({ x, y: 0.2, z, count: 140, color: [0xffffff, 0xbfeaff, 0x6fc7ff], speed: 13, life: 1.8, size: 0.42, gravity: -8, spread: 7 });
      env.toast('Something very large is politely intervening.');
    },
    update(dt, ctx) {
      if (state === 'down') return;
      t += dt;
      if (state === 'rise') {
        const k = smoothstep(0, 1.1, t);
        mesh.position.set(at.x, -13 + k * 15.5, at.z);
        mesh.rotation.set(-0.35 + k * 0.3, ry, 0);
        if (t > 1.1) { state = 'push'; t = 0; env.shake(0.8, 0.9); }
      } else if (state === 'push') {
        const k = smoothstep(0, 2.6, t);
        const d = inlandDir(at.x, at.z);
        mesh.position.set(at.x + d.x * 19 * k, 2.5 - k * 1.2, at.z + d.z * 19 * k);
        mesh.rotation.set(-0.05 - k * 0.5, ry, Math.sin(t * 3) * 0.06);
        if (t > 2.7) { state = 'sink'; t = 0; }
      } else {
        const k = smoothstep(0, 1.4, t);
        mesh.position.y = 1.3 - k * 16;
        if (t > 1.4) { state = 'down'; mesh.visible = false; mesh.position.set(0, -60, 0); }
      }
    },
  };
}

// ═══ CURFEW: LANTERN CATS ════════════════════════════════════════════════════
const WATCH_FURS = [CAT.furWhite, CAT.furCalico, CAT.furOrange, CAT.furGrey];

export function createCurfew(env, count = 6) {
  const cats = [];
  for (let i = 0; i < count; i++) {
    const c = makeActor(env, WATCH_FURS[i % WATCH_FURS.length], 0, 0, { show: false, speed: 4.6 });
    c.lantern = i; c.scale = 0; c.ang = (i / count) * Math.PI * 2;
    cats.push(c);
  }
  const HOME = { x: SPOTS.guestNook.x, z: SPOTS.guestNook.z };   // your bed, in Whisker Heights
  let state = 'off', t = 0, said = false;
  return {
    get active() { return state === 'on'; },
    /**
     * Curfew starts wherever you happen to be standing, so the watch has to
     * already be on its ring around you — walking them in from their parked
     * position (the world origin) meant they never arrived at all.
     */
    begin(px, pz) {
      if (state === 'on') return;
      state = 'on'; t = 0; said = false;
      for (let i = 0; i < cats.length; i++) {
        const c = cats[i];
        c.ang = (i / cats.length) * Math.PI * 2;
        c.x = px + Math.cos(c.ang) * 5.2; c.z = pz + Math.sin(c.ang) * 5.2;
        c.scale = 0; c.show = true; c.hop = i * 1.7;       // scale ramps them in
      }
    },
    end() { if (state === 'off') return; state = 'fade'; t = 0; },
    update(dt, ctx) {
      if (state === 'off') { for (const c of cats) if (c.scale > 0) { c.scale = 0; env.pool.hide(c.slot); env.lanterns.hide(c.lantern); } return; }
      t += dt;
      const p = ctx.systems.player?.position; if (!p) return;
      const target = state === 'on' ? Math.min(1, t * 1.1) : Math.max(0, 1 - t * 1.4);
      if (state === 'fade' && target <= 0) { state = 'off'; return; }
      if (state === 'on' && !said && t > 0.9) {
        said = true;
        env.say('Curfew, friend! Bed is this way. Your bed. The bed we made for you.', 'Lantern Watch');
        env.toast('Curfew: the lantern cats will walk you home.');
      }
      const toHome = Math.hypot(p.x - HOME.x, p.z - HOME.z);
      const hx = (HOME.x - p.x) / (toHome || 1), hz = (HOME.z - p.z) / (toHome || 1);
      // gentle, deniable nudging
      if (state === 'on' && toHome > 16 && !ctx.systems.player.locked) { p.x += hx * 1.15 * dt; p.z += hz * 1.15 * dt; }
      for (let i = 0; i < cats.length; i++) {
        const c = cats[i];
        c.show = true; c.scale = target * 0.98;
        c.ang += dt * 0.42;
        const r = 4.6 + Math.sin(t * 0.8 + i) * 0.6;
        const tx = p.x + Math.cos(c.ang) * r + hx * 2.2;
        const tz = p.z + Math.sin(c.ang) * r + hz * 2.2;
        // a lantern cat will follow you anywhere except into the sea
        if (env.world.height(tx, tz) > 0.4) c.moveTo(tx, tz, dt, 6.5);
        c.face(p.x, p.z);
        c.draw();
        if (c.scale > 0.05) env.lanterns.set(c.lantern, { x: c.x + Math.sin(c.ry + 1.4) * 0.5, y: c.y + 0.66, z: c.z + Math.cos(c.ry + 1.4) * 0.5, ry: c.ry, scale: 1.35 * c.scale });
        else env.lanterns.hide(c.lantern);
      }
    },
  };
}

// ═══ SET DRESSING CATS (clerk, napper, loungers, bus-stop, mayor) ════════════
export function createResidents(env) {
  const world = env.world;
  // Mr. Sardine: a loaf of cat, parked exactly across the tunnel mouth.
  const TARCH = Math.PI * 0.25 - Math.PI + 0.25;                 // the arch's facing
  const tnx = Math.sin(TARCH), tnz = Math.cos(TARCH);
  const napper = makeActor(env, CAT.furWhite, SPOTS.tunnel.x + tnx * 1.25, SPOTS.tunnel.z + tnz * 1.25, { sit: true });
  napper.ry = TARCH + Math.PI / 2; napper.squash = 0.58; napper.scale = 1.3;
  const clerkBase = { x: SPOTS.office.x + Math.sin(Math.PI * 0.25) * 1.62, z: SPOTS.office.z + Math.cos(Math.PI * 0.25) * 1.62 };
  const clerk = makeActor(env, CAT.furCalico, clerkBase.x, clerkBase.z, { sit: true });
  clerk.yOffset = 1.05; clerk.ry = Math.PI * 0.25;
  const bus = makeActor(env, CAT.furBlack, SPOTS.busStop.x + 0.4, SPOTS.busStop.z + 0.2, { sit: true });
  bus.yOffset = 0.72; bus.ry = Math.PI * 0.25;
  const loungers = [];
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.6;
    const lx = SPOTS.loungers.x + Math.cos(a) * 2.0, lz = SPOTS.loungers.z + Math.sin(a) * 2.0;
    const c = makeActor(env, FURS[i], lx, lz, { sit: true });
    c.yOffset = 0.5; c.tilt = -0.32; c.ry = i * 1.3 + Math.PI * 0.25; loungers.push(c);
  }
  const mayor = makeActor(env, CAT.furWhite, 0, 0, { show: false, speed: 4.2 });
  mayor.scale = 1.18;
  let mayorState = 'off', mt = 0, mtarget = { x: 0, z: 0 };
  let clerkHidden = false;

  return {
    napper, clerk, mayor,
    hideNapper() { napper.show = false; env.pool.hide(napper.slot); },
    napperAwake: false,
    summonMayor(px, pz) {
      if (mayorState !== 'off') return;
      const d = inlandDir(px, pz);
      mayor.x = px + d.x * 12; mayor.z = pz + d.z * 12; mayor.show = true; mayorState = 'come'; mt = 0;
      mtarget = { x: px, z: pz };
    },
    get mayorArrived() { return mayorState === 'here'; },
    update(dt, ctx) {
      const e = ctx.state.elapsed;
      const p = ctx.systems.player?.position;
      // napping cat: breathing, or padding away once bribed
      if (napper.show) {
        if (this.napperAwake) {
          const d = napper.moveTo(SPOTS.tunnel.x + tnz * 6.5 + tnx * 3.0, SPOTS.tunnel.z - tnx * 6.5 + tnz * 3.0, dt, 2.2);
          napper.sit = false; napper.squash = 1; napper.scale = 1.15;
          if (d < 0.2) { napper.sit = true; napper.squash = 0.7; napper.ry = Math.PI * 0.25; }
        } else {
          napper.squash = 0.58 + Math.sin(e * 1.4) * 0.045;
        }
        napper.draw();
      }
      // clerk: "on break" — bobs behind the glass, or gone entirely
      if (!clerkHidden) { clerk.squash = 1 + Math.sin(e * 1.1) * 0.06; clerk.ry += Math.sin(e * 0.5) * 0.004; clerk.draw(); }
      bus.squash = 1 + Math.sin(e * 0.9 + 1) * 0.05; bus.ry = Math.PI * 0.25 + Math.sin(e * 0.3) * 0.5; bus.draw();
      for (let i = 0; i < loungers.length; i++) { const c = loungers[i]; c.squash = 1 + Math.sin(e * 0.8 + i * 2) * 0.05; c.draw(); }
      if (mayorState === 'come' && p) {
        mt += dt;
        const d = mayor.moveTo(mtarget.x + 2.2, mtarget.z + 2.2, dt, 5.0);
        mayor.draw();
        if (d < 2.6 || mt > 6) { mayorState = 'here'; }
      } else if (mayorState === 'here') {
        mayor.hop += dt * 3; if (p) mayor.face(p.x, p.z);
        mayor.squash = 1 + Math.sin(ctx.state.elapsed * 2) * 0.05; mayor.draw();
      }
    },
    setClerkHidden(v) { clerkHidden = v; if (v) env.pool.hide(clerk.slot); },
  };
}
