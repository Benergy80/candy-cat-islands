// ─────────────────────────────────────────────────────────────────────────────
// PARTICLES — pooled, instanced, 2 draw calls, zero per-frame allocation.
//
// Rendering: every particle is one instanced quad with a shape mask evaluated in
// the fragment shader (soft puff, 4-point sparkle, confetti chip, ripple ring,
// petal/leaf, heart, paw print, smoke puff). Two pools = two draw calls:
// NORMAL-blended (dust, smoke, mist, petals, confetti, decals) and
// ADDITIVE (sparkles, fireflies, glints, moths). Both respect scene fog —
// additive fades to nothing in fog instead of adding the fog colour.
//
// ── Public API ───────────────────────────────────────────────────────────────
//  burst(opts)                      – one-shot puff of `count` particles
//  emitter(opts) → { stop(), set(x,y,z), opts }   – continuous, `rate`/second
//  sparkle(x, y, z, color?)         – twinkly additive star burst
//  dust(x, y, z, opts?)             – low, soft ground dust
//  splash(x, y, z, opts?)           – water droplets + a ground ripple ring
//  hearts(x, y, z, color?)          – floating hearts
//  confetti(x, y, z, opts?)         – spinning paper chips
//  smoke(opts) → emitter            – slow rising, expanding, fading puffs
//  ripple(x, y, z, opts?)           – single expanding flat ring
//  footprint(x, y, z, angle, opts?) – pooled flat decal that fades out
//  sprinkleShower(seconds?)         – trigger the Candyland confetti-rain weather
//  stats()                          – { normal, additive, cap, calls }
//  SHAPES                           – shape-name → index map
//
// opts (all optional):
//   x, y, z, count, rate, follow()
//   spread          legacy box jitter        area / areaY   disc + vertical scatter
//   speed, up, vy, vyJitter                  gravity, drag, wind
//   life, lifeVar                            size, sizeEnd, sizeVar
//   color | [colors], colorEnd               alpha, fadeIn, fadeOut
//   spin, sway, swayFreq                     shape, blend ('add'|'normal')
//   flat (lie in XZ plane), flicker, ground ('kill'|'stick'), floorY
//   age0 (0..0.95: born mid-life, fast-forwarded — used to prime a fresh scene)
//   range (emitters only: stop spawning past this distance from the camera
//          target; default 150 units, pass 0 to always spawn)
//
// Events consumed: 'player:step', 'player:splash', 'player:teleport', 'cat:step'
// (with graceful fallbacks so footsteps/splashes work even if nobody emits them).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, hash } from '../core/util.js';
import { Pool, SHAPES, FLAG_FLAT, FLAG_FLICKER, FLAG_GROUNDKILL, FLAG_STICK, writeColor } from './particles/pool.js';
import { createAmbient } from './particles/ambient.js';
import { createEvents } from './particles/events.js';

const CAP_NORMAL = 2400;
const CAP_ADD = 1600;
const TAU = Math.PI * 2;

// ── MOBILE TIER (ctx.state.mobile, read once at create; BRIEF Contract I) ────
// Pools at 40% (960 / 640), every one-shot burst and every registered emitter
// at half strength, and the authored ambient layers thinned at the SOURCE (their
// rates), so a phone never has to recycle live particles to stay under the cap
// — recycling is what would make a field flicker. The lamp-anchored glows keep
// their full rate: they cycle through their anchors and a thinner rate would
// leave some lamps dark, and on a phone they carry the night glow that the
// point lights no longer do.
const MOBILE_CAP_SCALE = 0.4;
const MOBILE_BURST_SCALE = 0.5;       // one-shot bursts (count), min 1
const MOBILE_BURST_MAX = 160;         // was 400: no additive over-draw storms
const MOBILE_EMIT_SCALE = 0.5;        // emitter()/smoke() rates from other systems
const MOBILE_AMBIENT = [
  // [id pattern, rate scale] — first match wins; the default is 0.45
  [/lamp_halos|bulb_halos|light_pools/, 1],     // anchor-cycled: keep every lamp lit
  [/smoke|steam/, 0.6],                          // columns: thinner, still columns
  [/prints/, 0.6],
  [/fireflies|glints|sparkles|moths/, 0.4],      // additive specks — the over-draw
];
const MOBILE_AMBIENT_DEFAULT = 0.45;
const MOBILE_EVERY_SCALE = 1.8;       // `every: [a, b]` burst timers → fewer bursts

export function create(ctx) {
  const rnd = rng(hash('particles'));
  const MOBILE = !!ctx.state.mobile;
  const capN = MOBILE ? Math.round(CAP_NORMAL * MOBILE_CAP_SCALE) : CAP_NORMAL;
  const capA = MOBILE ? Math.round(CAP_ADD * MOBILE_CAP_SCALE) : CAP_ADD;
  const emitScale = MOBILE ? MOBILE_EMIT_SCALE : 1;
  const normal = new Pool(capN, false, 'normal');
  const additive = new Pool(capA, true, 'additive');
  ctx.scene.add(normal.mesh, additive.mesh);

  let windX = 0.4, windZ = -0.15;

  // ── spawning ───────────────────────────────────────────────────────────────
  function pickColor(spec) {
    if (Array.isArray(spec)) return spec[(rnd() * spec.length) | 0];
    return spec;
  }

  /** Spawn exactly one particle from an options bag. Never allocates. */
  function spawn(o) {
    const shapeName = o.shape;
    const sh = shapeName === undefined ? 0 : (SHAPES[shapeName] ?? 0);
    const add = o.blend ? o.blend === 'add' : (sh === SHAPES.sparkle);
    const P = add ? additive : normal;
    const i = P.alloc();
    const i3 = i * 3, i4 = i * 4;

    // position
    let x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0;
    if (o.area) { const a = rnd() * TAU, d = o.area * Math.sqrt(rnd()); x += Math.cos(a) * d; z += Math.sin(a) * d; }
    if (o.areaY) y += (rnd() - 0.5) * o.areaY;
    if (o.spread) { const s = o.spread; x += (rnd() - 0.5) * s; y += (rnd() - 0.5) * s * 0.5; z += (rnd() - 0.5) * s; }
    P.pos[i3] = x; P.pos[i3 + 1] = y; P.pos[i3 + 2] = z;

    // velocity
    const sp = o.speed ?? 3;
    const lat = o.lateral ?? 1;
    P.vel[i3] = (rnd() - 0.5) * sp * lat;
    P.vel[i3 + 2] = (rnd() - 0.5) * sp * lat;
    P.vel[i3 + 1] = o.vy !== undefined
      ? o.vy + (rnd() - 0.5) * (o.vyJitter ?? 0)
      : (rnd() * 0.8 + 0.2) * sp * (o.up ?? 1);

    // life / size
    const life = (o.life ?? 0.8) * (o.lifeVar ? 1 + (rnd() - 0.5) * 2 * o.lifeVar : 1);
    P.age[i] = 0; P.life[i] = Math.max(0.05, life);
    const sVar = o.sizeVar ? 1 + (rnd() - 0.5) * 2 * o.sizeVar : 1;
    const s0 = (o.size ?? 0.25) * sVar;
    P.size0[i] = s0;
    // A round sprite with no authored sizeEnd used to hold full size until the
    // frame it vanished, so a one-shot burst from another system read as a field
    // of flat saturated pin-dots lying on the ground rather than as a flourish
    // (measured on midday Main Street: 60 live 0.28-unit discs from
    // cat/containment.js's welcome confetti). Short-lived ROUND shapes now taper
    // to 45 % and twinkle out. Anything that authors sizeEnd, or that lives long
    // enough to be an ambient layer, is untouched.
    const roundish = sh === SHAPES.soft || sh === SHAPES.sparkle || sh === SHAPES.glow;
    P.size1[i] = o.sizeEnd !== undefined ? o.sizeEnd * sVar
      : (roundish && P.life[i] < 3 ? s0 * 0.45 : s0);

    // colour
    writeColor(pickColor(o.color ?? 0xffffff), P.c0, i3);
    if (o.colorEnd !== undefined) writeColor(pickColor(o.colorEnd), P.c1, i3);
    else { P.c1[i3] = P.c0[i3]; P.c1[i3 + 1] = P.c0[i3 + 1]; P.c1[i3 + 2] = P.c0[i3 + 2]; }
    P.col[i3] = P.c0[i3]; P.col[i3 + 1] = P.c0[i3 + 1]; P.col[i3 + 2] = P.c0[i3 + 2];

    // dynamics
    P.alpha[i] = o.alpha ?? 1;
    P.grav[i] = o.gravity ?? -6;
    P.drag[i] = o.drag ?? 0;
    P.wind[i] = o.wind ?? 0;
    P.sway[i] = o.sway ?? 0;
    P.swayF[i] = o.swayFreq ?? 1.1;
    P.phase[i] = rnd() * TAU;
    P.rot[i] = o.rotation !== undefined ? o.rotation : rnd() * TAU;
    P.spin[i] = (o.spin ?? 0) * (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.8);
    P.fadeIn[i] = o.fadeIn ?? 0.12;
    P.fadeOut[i] = o.fadeOut ?? 0.35;
    P.floorY[i] = o.floorY ?? -1e9;
    P.shape[i] = sh;
    // priming (opts.age0 = 0..0.95): born part-way through life and
    // fast-forwarded along its ballistic path, so a primed plume reads as a
    // column instead of a blob sitting on the vent. Used by ambient.prime().
    if (o.age0) {
      const a = Math.min(0.95, o.age0) * P.life[i];
      P.age[i] = a;
      const vx = P.vel[i3], vy = P.vel[i3 + 1], vz = P.vel[i3 + 2], g = P.grav[i];
      const dmp = 1 / (1 + P.drag[i] * a * 0.5);
      P.pos[i3] += vx * a * dmp;
      P.pos[i3 + 1] += (vy + 0.5 * g * a) * a * dmp;
      P.pos[i3 + 2] += vz * a * dmp;
      P.vel[i3 + 1] = vy + g * a;
    }
    let flags = 0;
    if (o.flat) flags |= FLAG_FLAT;
    if (o.flicker) flags |= FLAG_FLICKER;
    if (o.ground === 'kill') flags |= FLAG_GROUNDKILL;
    else if (o.ground === 'stick') flags |= FLAG_STICK;
    P.flags[i] = flags;

    // seed the instance attrs so a particle is correct on its very first frame
    P.attr[i4] = s0; P.attr[i4 + 1] = P.rot[i]; P.attr[i4 + 2] = 0; P.attr[i4 + 3] = sh + (o.flat ? 16 : 0);
    return i;
  }

  // ── emitters ───────────────────────────────────────────────────────────────
  // An emitter runs forever until stop(), but it only SPAWNS while the observer
  // is within `range` (default 150 units — well past the point where a 0.2-unit
  // quad is sub-pixel). Registered emitters on the far island therefore cost
  // nothing. Pass range: 0 to opt out.
  const EMITTER_RANGE = 150;
  const emitters = [];
  function emitter(o) {
    const e = { o, acc: 0, dead: false, handle: null };
    e.handle = {
      opts: o, e,
      stop() { e.dead = true; },
      set(x, y, z) { o.x = x; o.y = y; o.z = z; },
    };
    emitters.push(e);
    return e.handle;
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  const _o = {}; // scratch options bag reused by the helpers (no per-call garbage)
  function reset(shape, blend) {
    for (const k in _o) delete _o[k];
    _o.shape = shape; if (blend) _o.blend = blend;
    return _o;
  }

  function burst(o) {
    const n = MOBILE
      ? Math.min(MOBILE_BURST_MAX, Math.max(1, Math.round((o.count ?? 12) * MOBILE_BURST_SCALE)))
      : Math.min(400, o.count ?? 12);
    for (let i = 0; i < n; i++) spawn(o);
  }

  function sparkle(x, y, z, color = 0xffffff, count = 8) {
    const o = reset('sparkle', 'add');
    o.x = x; o.y = y; o.z = z; o.color = color; o.count = count;
    o.speed = 1.6; o.up = 0.7; o.life = 0.75; o.lifeVar = 0.35; o.size = 0.55; o.sizeVar = 0.35;
    o.sizeEnd = 0.06; o.gravity = -1.2; o.drag = 2.2; o.spread = 0.5; o.spin = 1.4; o.alpha = 1;
    o.fadeIn = 0.08; o.fadeOut = 0.5;
    burst(o); return o;
  }

  function dust(x, y, z, opts) {
    const o = reset('puff');
    o.x = x; o.y = y; o.z = z; o.count = opts?.count ?? 7;
    o.color = opts?.color ?? 0xd8c7a8; o.colorEnd = opts?.colorEnd ?? 0xf3ead8;
    o.speed = opts?.speed ?? 1.1; o.up = 0.55; o.life = 0.85; o.lifeVar = 0.3;
    o.size = opts?.size ?? 0.5; o.sizeEnd = (opts?.size ?? 0.5) * 2.6; o.sizeVar = 0.4;
    o.gravity = 0.6; o.drag = 3.2; o.spread = 0.45; o.spin = 0.7;
    o.alpha = opts?.alpha ?? 0.42; o.fadeIn = 0.1; o.fadeOut = 0.7; o.wind = 0.25;
    burst(o); return o;
  }

  function splash(x, y, z, opts) {
    const o = reset('soft');
    o.x = x; o.y = y; o.z = z; o.count = opts?.count ?? 14;
    o.color = opts?.color ?? 0xd8f4ff; o.colorEnd = 0xffffff;
    o.speed = opts?.speed ?? 3.4; o.up = 1.5; o.life = 0.6; o.lifeVar = 0.3;
    o.size = 0.22; o.sizeEnd = 0.08; o.sizeVar = 0.5;
    o.gravity = -14; o.drag = 0.4; o.spread = 0.35; o.alpha = 0.85;
    o.fadeIn = 0.05; o.fadeOut = 0.4; o.ground = 'kill'; o.floorY = y - 0.25;
    burst(o);
    ripple(x, y + 0.03, z, opts);
    return o;
  }

  function ripple(x, y, z, opts) {
    const o = reset('ring');
    o.x = x; o.y = y; o.z = z; o.count = 1; o.flat = true;
    o.color = opts?.ringColor ?? 0xffffff; o.speed = 0; o.vy = 0; o.gravity = 0;
    o.life = opts?.ringLife ?? 0.9; o.size = 0.5; o.sizeEnd = opts?.ringSize ?? 3.4;
    o.alpha = 0.5; o.fadeIn = 0.08; o.fadeOut = 0.85; o.rotation = 0;
    burst(o); return o;
  }

  function hearts(x, y, z, color = 0xff6f9c, count = 5) {
    const o = reset('heart');
    o.x = x; o.y = y; o.z = z; o.count = count; o.color = color; o.colorEnd = 0xffc2d8;
    o.speed = 0.5; o.up = 1.2; o.life = 1.9; o.lifeVar = 0.25; o.size = 0.5; o.sizeEnd = 0.85;
    o.sizeVar = 0.3; o.gravity = 0.8; o.drag = 1.4; o.spread = 0.5; o.sway = 0.7; o.swayFreq = 2.2;
    o.alpha = 0.95; o.fadeIn = 0.12; o.fadeOut = 0.45; o.rotation = 0; o.spin = 0.5;
    burst(o); return o;
  }

  const CONFETTI_COLORS = [0xff3355, 0x3aa8ff, 0xffe23a, 0x5be27a, 0xb35bff, 0xff8c1a];
  function confetti(x, y, z, opts) {
    const o = reset('confetti');
    o.x = x; o.y = y; o.z = z; o.count = opts?.count ?? 26;
    o.color = opts?.color ?? CONFETTI_COLORS;
    o.speed = opts?.speed ?? 5; o.up = 1.3; o.life = opts?.life ?? 1.8; o.lifeVar = 0.3;
    o.size = opts?.size ?? 0.34; o.sizeVar = 0.3; o.gravity = opts?.gravity ?? -7;
    o.drag = 1.1; o.spread = opts?.spread ?? 0.6; o.spin = 7; o.sway = 1.1; o.swayFreq = 3.4;
    o.alpha = 1; o.fadeIn = 0.03; o.fadeOut = 0.3; o.wind = 0.5;
    if (opts?.floorY !== undefined) { o.floorY = opts.floorY; o.ground = 'kill'; }
    burst(o); return o;
  }

  /** Continuous smoke column. Pass { x, y, z, rate, size, color, rise, spread }. */
  function smoke(opts = {}) {
    const o = {
      shape: 'puff', blend: 'normal',
      x: opts.x ?? 0, y: opts.y ?? 0, z: opts.z ?? 0,
      rate: opts.rate ?? 5,
      color: opts.color ?? 0xe8e2d6, colorEnd: opts.colorEnd ?? 0xffffff,
      speed: opts.speed ?? 0.22, lateral: 1, vy: opts.rise ?? 1.1, vyJitter: 0.35,
      life: opts.life ?? 3.4, lifeVar: 0.25,
      size: opts.size ?? 0.9, sizeEnd: opts.sizeEnd ?? (opts.size ?? 0.9) * 3.6, sizeVar: 0.25,
      gravity: opts.gravity ?? 0.35, drag: 0.55, spread: opts.spread ?? 0.35,
      alpha: opts.alpha ?? 0.30, fadeIn: 0.18, fadeOut: 0.55,
      spin: 0.35, wind: opts.wind ?? 0.9, sway: opts.sway ?? 0.25, swayFreq: 0.8,
      follow: opts.follow,
    };
    return emitter(o);
  }

  /** Pooled ground decal that fades. `angle` rotates the print to face the walk direction. */
  function footprint(x, y, z, angle = 0, opts) {
    const o = reset('print');
    o.x = x; o.y = y + 0.07; o.z = z; o.count = 1; o.flat = true;
    o.color = opts?.color ?? 0x6b563f; o.colorEnd = opts?.colorEnd ?? o.color;
    o.speed = 0; o.vy = 0; o.gravity = 0; o.life = opts?.life ?? 5.5;
    o.size = opts?.size ?? 0.42; o.sizeEnd = (opts?.size ?? 0.42) * 1.08;
    o.alpha = opts?.alpha ?? 0.3; o.fadeIn = 0.04; o.fadeOut = 0.75; o.rotation = angle;
    burst(o); return o;
  }

  // ── API object (built before ambient so ambient can use it) ────────────────
  const api = {
    SHAPES, burst, emitter, sparkle, dust, splash, ripple, hearts, confetti, smoke, footprint,
    get wind() { return { x: windX, z: windZ }; },
    stats() {
      const live = normal.count + additive.count;
      return {
        normal: normal.count, additive: additive.count, live, triangles: live * 2,
        cap: capN + capA, emitters: emitters.length,
        calls: (normal.count > 0 ? 1 : 0) + (additive.count > 0 ? 1 : 0),
      };
    },
    /** Internal: spawn a single particle (used by the ambient author). */
    one: spawn,
  };

  const ambient = createAmbient(ctx, api);
  if (MOBILE) {
    // thin the authored layers at their source (rates are read live every frame
    // and by prime(), so this is the whole change — no per-frame cost)
    for (const f of ambient.effects) {
      if (f.every) { f.every = [f.every[0] * MOBILE_EVERY_SCALE, f.every[1] * MOBILE_EVERY_SCALE]; continue; }
      if (typeof f.rate !== 'number') continue;
      let k = MOBILE_AMBIENT_DEFAULT;
      for (const [re, v] of MOBILE_AMBIENT) if (re.test(f.id || '')) { k = v; break; }
      f.rate *= k;
    }
  }
  api.sprinkleShower = (sec) => ambient.sprinkleShower(sec);
  api.ambient = ambient;
  api.pools = { normal, additive };
  // Gameplay-event flourishes (burn embers, stomp ring, vehicle trails, interior
  // sunbeam dust). Built last so it can use the whole public API above, and
  // defensively so a throw in an event handler cannot take the system down.
  let fxEvents = null;
  try { fxEvents = createEvents(ctx, api); api.events = fxEvents; }
  catch (err) { console.error('[particles] event FX failed to create', err); }
  console.warn(`[particles] 2 draw calls max (normal+additive instanced quads) · ${ambient.effects.length} ambient effects`
    + ` · caps ${capN}/${capA} particles (2 tris each) · 0 per-frame allocations${MOBILE ? ' · mobile tier (bursts ×0.5, emitters ×0.5, ambient thinned)' : ''}`);

  // ── player / NPC feedback events ───────────────────────────────────────────
  const world = ctx.world;
  let sawStepEvent = false, strideAcc = 0, lastFootLeft = false, splashCool = 0;
  // player.js emits { x, y, z, side, running } — no `facing`, so read the live
  // facing off the player system and use `side` for which foot printed.
  ctx.events.on('player:step', (p) => {
    sawStepEvent = true;
    const pl = ctx.systems.player;
    stepAt(
      p?.x ?? pl?.position.x ?? 0,
      p?.z ?? pl?.position.z ?? 0,
      p?.facing ?? pl?.facing ?? 0,
      p?.y, p?.side,
    );
  });
  ctx.events.on('player:splash', (p) => {
    const pl = ctx.systems.player?.position;
    splash(p?.x ?? pl?.x ?? 0, p?.y ?? 0.05, p?.z ?? pl?.z ?? 0);
  });
  ctx.events.on('player:teleport', (p) => {
    const pl = ctx.systems.player?.position;
    poof(p?.x ?? pl?.x ?? 0, (p?.y ?? pl?.y ?? 0) + 0.9, p?.z ?? pl?.z ?? 0);
  });
  ctx.events.on('cat:step', (p) => { if (p) dustStep(p.x, p.y ?? world.height(p.x, p.z), p.z, 0.55); });

  function dustStep(x, y, z, scale = 1) {
    const o = reset('puff');
    o.x = x; o.y = y + 0.08; o.z = z; o.count = 4;
    o.color = 0xcdbb9c; o.colorEnd = 0xf6efe0;
    o.speed = 0.8 * scale; o.up = 0.5; o.life = 0.7; o.lifeVar = 0.3;
    o.size = 0.34 * scale; o.sizeEnd = 1.15 * scale; o.sizeVar = 0.35;
    o.gravity = 0.5; o.drag = 3.6; o.spread = 0.3; o.spin = 0.8;
    o.alpha = 0.36; o.fadeIn = 0.08; o.fadeOut = 0.72; o.wind = 0.3;
    burst(o);
  }

  function stepAt(x, z, facing, y, side) {
    const h = y !== undefined ? y : world.height(x, z);
    const island = world.islandAt(x, z);
    dustStep(x, h, z, island === 'candy' ? 0.9 : 1);
    // left/right foot, with a little stagger and splay so a walk leaves a
    // believable trail instead of a ruler-straight row of identical stamps
    let off;
    if (side === 1 || side === -1) off = side * 0.24;
    else { lastFootLeft = !lastFootLeft; off = lastFootLeft ? 0.24 : -0.24; }
    off *= 0.85 + rnd() * 0.3;
    // lateral offset is perpendicular to the walk direction (sin f, cos f), so
    // left and right feet straddle the line of travel instead of stamping it
    const fx = x + Math.cos(facing) * off + (rnd() - 0.5) * 0.12;
    const fz = z - Math.sin(facing) * off + (rnd() - 0.5) * 0.12;
    // A FLAT quad rotated by r points its +y edge at (-sin r, cos r) in world
    // XZ (see shaders.js), so the toes only face the direction of travel when
    // the angle is NEGATED. Before this the whole trail was mirrored and the
    // paws pointed across the path. Each foot also splays outwards a little.
    const splay = facing + (off > 0 ? 0.16 : -0.16) + (rnd() - 0.5) * 0.16;
    footprint(fx, h, fz, -splay, island === 'candy' ? FOOT_CANDY : FOOT_CAT);
    if (island === 'candy' && ctx.state.daylight > 0.2 && rnd() < 0.25) {
      sparkle(x, h + 0.25, z, 0xfff0b0, 2);
    }
  }
  // 0.5 units ≈ 20 px at the game camera: below that the four toes merge into a
  // blob. Frosting takes a pinker, slightly deeper print than cat flagstones.
  const FOOT_CANDY = { color: 0xa8768f, alpha: 0.3, size: 0.52, life: 6 };
  const FOOT_CAT = { color: 0x64533e, alpha: 0.27, size: 0.48, life: 5 };

  function poof(x, y, z) {
    const o = reset('puff');
    o.x = x; o.y = y; o.z = z; o.count = 22;
    o.color = 0xffffff; o.colorEnd = 0xffd9ef;
    o.speed = 4.2; o.up = 0.8; o.life = 0.8; o.lifeVar = 0.3;
    o.size = 0.6; o.sizeEnd = 2.0; o.sizeVar = 0.4;
    o.gravity = 1.4; o.drag = 4.5; o.spread = 0.7; o.spin = 1.2;
    o.alpha = 0.75; o.fadeIn = 0.04; o.fadeOut = 0.6;
    burst(o);
    sparkle(x, y, z, 0xfff2b8, 10);
  }
  api.poof = poof;

  // ── update ─────────────────────────────────────────────────────────────────
  function update(dt, ctx) {
    const el = ctx.state.elapsed;
    windX = 0.55 + Math.sin(el * 0.13) * 0.45 + Math.sin(el * 0.041) * 0.25;
    windZ = -0.18 + Math.cos(el * 0.097) * 0.4;

    // the vertex shader needs the drawing-buffer height to know how many pixels
    // wide a sprite actually is (sub-3px quads are grown + faded, never drawn as
    // hard chips). Cheap read, no allocation.
    const vh = ctx.renderer.domElement.height || 1000;
    normal.mat.uniforms.uViewH.value = vh;
    additive.mat.uniforms.uViewH.value = vh;

    // ambient first: it resolves the observer point that the emitter cull uses
    ambient.update(dt, ctx);
    const obs = ambient.obs;
    if (fxEvents) fxEvents.update(dt, ctx);

    // emitters
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      if (e.dead) { emitters[i] = emitters[emitters.length - 1]; emitters.pop(); continue; }
      const o = e.o;
      if (o.follow) { const p = o.follow(); if (p) { o.x = p.x; o.y = p.y; o.z = p.z; } }
      const cull = o.range === undefined ? EMITTER_RANGE : o.range;
      if (cull > 0) {
        const dx = obs.x - (o.x ?? 0), dz = obs.z - (o.z ?? 0);
        if (dx * dx + dz * dz > cull * cull) { e.acc = 0; continue; }
      }
      e.acc += dt * (o.rate ?? 8) * emitScale;
      let guard = 0;
      while (e.acc >= 1 && guard++ < 24) { e.acc -= 1; spawn(o); }
      if (e.acc > 4) e.acc = 0;
    }

    // player footstep / splash fallbacks (used until someone emits the events)
    const pl = ctx.systems.player;
    if (pl?.position && !pl.onFerry) {
      const v = pl.velocity;
      const sp = Math.hypot(v.x, v.z);
      if (!sawStepEvent && sp > 1.2 && !pl.locked) {
        strideAcc += sp * dt;
        if (strideAcc > 1.55) {
          strideAcc = 0;
          stepAt(pl.position.x, pl.position.z, Math.atan2(v.x, v.z));
        }
      }
      splashCool -= dt;
      const h = world.height(pl.position.x, pl.position.z);
      if (h < 0.12 && sp > 1.5 && splashCool <= 0) {
        splashCool = 0.28;
        splash(pl.position.x, 0.06, pl.position.z, SPLASH_SEA);
      }
    }

    normal.simulate(dt, el, windX, windZ);
    additive.simulate(dt, el, windX, windZ);
  }
  const SPLASH_SEA = { count: 10, color: 0xcaf0ff, ringColor: 0xffffff, ringSize: 2.6, ringLife: 0.8 };

  api.update = update;
  return api;
}
