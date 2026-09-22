// ─────────────────────────────────────────────────────────────────────────────
// EVENT FX — the wave-2 flourishes that hang off gameplay events.
//
// DIVISION OF LABOUR (checked against the code, not guessed):
//   weapons.js ALREADY draws the primary hit FX for every weapon —
//     stars()     yellow BONK stars + chips   ('weapon:use' kind 'melee', bat)
//     saltBurst() white crystal burst         (salt shaker lob / salt gun patch)
//     mist()      blue-white spray cone       ('weapon:use' kind 'spray')
//     fizz()      spritzer fizz
//     fireBurst() fire flash + ash puffs      (burn(), before 'weapon:burn')
//   …so this module NEVER redraws them. It only adds what nothing else draws:
//     · the part of a burn that OUTLIVES the flash — fire tongues, lingering
//       embers and a smouldering ash column (weapons' ash burst is a one-shot)
//     · the stomp DUST RING (player.js throws grains; nothing draws the ring)
//     · the landing puff (player.js puffs on jump, not on landing)
//     · a vehicle trail that FOLLOWS the rider while ctx.state.vehicle is set
//       (the routes draw one-shot launch/paddle/flap bursts, never a trail)
//     · sunbeam dust inside an interior
//
// Everything here is pooled through the same two draw calls as the rest of the
// system, option bags are allocated once, and every emitter is on a timer or a
// stop condition so nothing can leak.
// ─────────────────────────────────────────────────────────────────────────────
import { rng, hash, clamp } from '../../core/util.js';

const TAU = Math.PI * 2;

export function createEvents(ctx, api) {
  const world = ctx.world;
  const rnd = rng(hash('particles-events'));
  const timers = [];                       // { t, fn } on the game clock
  const after = (t, fn) => { timers.push({ t, fn }); return fn; };
  const player = () => ctx.systems.player;

  // ═══════════════════════════════════════════════════════════════════════════
  // THE CARAMELIZER — what is still burning after the flash
  // ═══════════════════════════════════════════════════════════════════════════
  const MAX_FIRES = 3;
  const fires = [];                        // [{ handles: [...] }]

  function burnAt(x, z, r) {
    const y = Math.max(world.height(x, z), 0) + 0.15;
    const rad = clamp(r ?? 3, 1, 7);
    while (fires.length >= MAX_FIRES) stopFire(fires[0]);

    // 1. FIRE TONGUES — upright pointed leaves, so a flame licks instead of
    //    puffing (rotation 0 + spin 0 keeps the point up; a tumbling flame
    //    reads as confetti). Additive, so overlapping tongues go white-hot.
    const tongues = api.emitter({
      shape: 'leaf', blend: 'add', color: [0xffd23a, 0xff8a1a, 0xff5a1a], colorEnd: 0xff3a14,
      x, y: y + 0.15, z, area: rad * 0.42, rate: 16,
      speed: 0.25, lateral: 1, vy: 2.3, vyJitter: 0.9, gravity: 1.1, drag: 1.3,
      life: 0.6, lifeVar: 0.35, size: 0.72, sizeVar: 0.45, sizeEnd: 0.12,
      alpha: 0.85, fadeIn: 0.1, fadeOut: 0.5, rotation: 0, spin: 0, flicker: true, range: 90,
    });
    // 2. EMBERS — the bit the critics missed: sparks that go on rising and
    //    winking for three seconds after the flash has gone.
    const embers = api.emitter({
      shape: 'sparkle', blend: 'add', color: [0xffb03a, 0xff6a1a, 0xffe08a],
      x, y: y + 0.25, z, area: rad * 0.5, rate: 10,
      speed: 0.4, lateral: 1, vy: 1.2, vyJitter: 0.8, gravity: 0.55, drag: 0.9,
      life: 1.8, lifeVar: 0.5, size: 0.22, sizeVar: 0.5, sizeEnd: 0.02,
      alpha: 1, fadeIn: 0.1, fadeOut: 0.55, flicker: true, sway: 0.6, swayFreq: 3.1,
      wind: 0.7, range: 90,
    });
    // 3. SMOULDER — a thin, dirty, wind-bent ash column over the scorch mark.
    const smoulder = api.emitter({
      shape: 'puff', blend: 'normal', color: [0x413830, 0x62564a], colorEnd: 0x8d8073,
      x, y: y + 0.3, z, area: rad * 0.38, rate: 4,
      speed: 0.16, lateral: 1, vy: 0.85, vyJitter: 0.3, gravity: 0.28, drag: 0.7,
      life: 2.9, lifeVar: 0.35, size: 0.38, sizeVar: 0.4, sizeEnd: 1.5,
      alpha: 0.3, fadeIn: 0.22, fadeOut: 0.62, spin: 0.3, wind: 1.5, sway: 0.25, swayFreq: 0.7,
      range: 90,
    });
    const fire = { handles: [tongues, embers, smoulder] };
    fires.push(fire);
    after(0.85, () => { tongues.stop(); });
    after(3.2, () => { embers.stop(); });
    after(4.8, () => stopFire(fire));
  }
  function stopFire(fire) {
    if (!fire) return;
    for (const hnd of fire.handles) hnd.stop();
    const i = fires.indexOf(fire); if (i >= 0) fires.splice(i, 1);
  }
  ctx.events.on('weapon:burn', (p) => {
    if (!p) return;
    burnAt(p.x ?? 0, p.z ?? 0, p.r);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STOMP — the ring, not the cloud
  // ═══════════════════════════════════════════════════════════════════════════
  // player.js already throws a low spray of grains outward. What was missing is
  // the SHOCK RING: a flat dust ring running out along the ground plus a rim of
  // slow puffs, which is what makes the AOE readable from the iso camera.
  const rimO = {
    shape: 'puff', blend: 'normal', color: 0xd9c6a4, colorEnd: 0xf2e7d2, count: 1,
    speed: 0.5, lateral: 1, vy: 0.8, vyJitter: 0.4, gravity: 0.5, drag: 3.4,
    life: 0.8, lifeVar: 0.3, size: 0.34, sizeVar: 0.35, sizeEnd: 1.5,
    alpha: 0.4, fadeIn: 0.08, fadeOut: 0.7, spin: 0.8, wind: 0.4, x: 0, y: 0, z: 0,
  };
  function stompAt(x, z, r = 3, yIn) {
    const y = (yIn ?? world.height(x, z)) + 0.06;
    r = clamp(r, 1.2, 8);
    const cat = world.islandAt(x, z) === 'cat';
    api.ripple(x, y + 0.02, z, { ringColor: cat ? 0xd9c8ac : 0xf0dcc6, ringSize: r * 2.05, ringLife: 0.62 });
    rimO.color = cat ? 0xcdb99a : 0xe8d4b6;
    rimO.colorEnd = cat ? 0xefe4d2 : 0xfff2e2;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + rnd() * 0.35;
      const d = r * (0.5 + rnd() * 0.22);
      rimO.x = x + Math.cos(a) * d; rimO.z = z + Math.sin(a) * d; rimO.y = y;
      api.burst(rimO);
    }
  }
  ctx.events.on('player:stomp', (p) => {
    const pl = player()?.position;
    stompAt(p?.x ?? pl?.x ?? 0, p?.z ?? pl?.z ?? 0, p?.r ?? 3, p?.y);
  });

  // ── landing (not a stomp): one small puff under the feet ───────────────────
  ctx.events.on('player:land', (p) => {
    if (p?.stomp) return;
    const pl = player()?.position;
    const x = p?.x ?? pl?.x ?? 0, z = p?.z ?? pl?.z ?? 0;
    const y = (p?.y ?? world.height(x, z)) + 0.05;
    const cat = world.islandAt(x, z) === 'cat';
    api.dust(x, y, z, {
      count: 5, size: 0.26, speed: 1.0, alpha: 0.3,
      color: cat ? 0xcdb99a : 0xe8d6bc, colorEnd: cat ? 0xf0e6d6 : 0xfff3e4,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VEHICLES — a trail that follows the rider
  // ═══════════════════════════════════════════════════════════════════════════
  // The routes draw their own one-shot launch / paddle / landing bursts. None of
  // them leaves anything BEHIND the vehicle, so a flight reads as a static pose
  // sliding over the sea. This attaches a following emitter for as long as
  // ctx.state.vehicle is set, and takes it away the moment the rider is down.
  const _follow = { x: 0, y: 0, z: 0 };
  let trail = null;                 // { kind, handles:[...], smoke?, spark?, grace }
  let lastX = 0, lastZ = 0, lastY = 0, speed = 0, haveLast = false;

  const TRAIL = {
    catapult: () => ([
      // rope smoke + scorched-arm smoke streaming off the seat
      api.emitter({
        shape: 'puff', blend: 'normal', color: [0x9a9186, 0xc3bab0], colorEnd: 0xe6e0d6,
        rate: 0, speed: 0.4, lateral: 1, vy: 0.5, vyJitter: 0.4, gravity: 0.3, drag: 1.0,
        life: 1.9, lifeVar: 0.35, size: 0.42, sizeVar: 0.4, sizeEnd: 2.1,
        alpha: 0.34, fadeIn: 0.12, fadeOut: 0.6, spin: 0.4, wind: 0.8, range: 0,
        follow: () => _follow,
      }),
      api.emitter({
        shape: 'sparkle', blend: 'add', color: [0xffd24a, 0xff8a3a, 0xfff0b0],
        rate: 0, speed: 1.2, lateral: 1, vy: -0.2, vyJitter: 0.8, gravity: -1.4, drag: 1.6,
        life: 0.7, lifeVar: 0.45, size: 0.22, sizeVar: 0.5, sizeEnd: 0.02,
        alpha: 1, fadeIn: 0.06, fadeOut: 0.55, flicker: true, range: 0,
        follow: () => _follow,
      }),
    ]),
    canoe: () => ([
      // wake foam off the stern: flat, low, dying the instant it touches the sea
      api.emitter({
        shape: 'soft', blend: 'normal', color: [0xffffff, 0xdff2ff], colorEnd: 0xffffff,
        rate: 0, speed: 0.7, lateral: 1, vy: 0.5, vyJitter: 0.4, gravity: -3.2, drag: 1.4,
        life: 0.9, lifeVar: 0.4, size: 0.24, sizeVar: 0.55, sizeEnd: 0.6,
        alpha: 0.55, fadeIn: 0.06, fadeOut: 0.6, spread: 0.7, ground: 'kill', floorY: -0.05,
        range: 0, follow: () => _follow,
      }),
    ]),
    flyer: () => ([
      // a feather comes loose every second or so and tumbles away behind you
      api.emitter({
        shape: 'leaf', blend: 'normal', color: [0xfffaf0, 0xf3e7d2, 0xe6d8bd], colorEnd: 0xfffdf6,
        rate: 0, speed: 0.5, lateral: 1, vy: -0.3, vyJitter: 0.4, gravity: -0.35, drag: 1.2,
        life: 5.5, lifeVar: 0.3, size: 0.34, sizeVar: 0.3, alpha: 0.95,
        fadeIn: 0.05, fadeOut: 0.3, spin: 1.8, sway: 1.9, swayFreq: 1.3, wind: 0.8,
        ground: 'kill', floorY: -0.4, range: 0, follow: () => _follow,
      }),
    ]),
  };

  function startTrail(kind) {
    if (trail && trail.kind === kind) { trail.grace = 6; return; }
    stopTrail();
    const make = TRAIL[kind];
    if (!make) return;
    const pl = player()?.position;
    _follow.x = pl?.x ?? 0; _follow.y = pl?.y ?? 0; _follow.z = pl?.z ?? 0;
    trail = { kind, handles: make(), grace: 14, life: 0 };
    haveLast = false;
  }
  function stopTrail() {
    if (!trail) return;
    for (const hnd of trail.handles) hnd.stop();
    trail = null;
  }
  ctx.events.on('escape:start', (p) => { if (p?.route) startTrail(p.route); });
  ctx.events.on('vehicle:board', (p) => { if (p?.type) startTrail(p.type); });
  ctx.events.on('vehicle:unboard', () => stopTrail());
  ctx.events.on('escape:success', () => stopTrail());

  function updateTrail(dt) {
    if (!trail) return;
    const pl = player();
    const pos = pl?.position;
    trail.life += dt;
    const riding = !!ctx.state.vehicle || !!pl?.onVehicle;
    if (!riding) {
      trail.grace -= dt;
      if (trail.grace <= 0) { stopTrail(); return; }
    } else {
      trail.grace = 2.5;
    }
    if (trail.life > 120) { stopTrail(); return; }     // hard leak stop
    if (!pos) return;

    if (haveLast && dt > 1e-4) {
      const dx = pos.x - lastX, dy = pos.y - lastY, dz = pos.z - lastZ;
      speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
    }
    lastX = pos.x; lastY = pos.y; lastZ = pos.z; haveLast = true;

    // the trail hangs BEHIND the rider, which is where a trail lives
    const f = pl?.facing ?? 0;
    const bx = -Math.sin(f), bz = -Math.cos(f);
    const H = trail.handles;
    if (trail.kind === 'catapult') {
      _follow.x = pos.x + bx * 0.8; _follow.y = pos.y + 0.5; _follow.z = pos.z + bz * 0.8;
      const fast = clamp(speed * 0.9, 0, 22);
      H[0].opts.rate = riding ? 1.2 + fast : 0;
      H[1].opts.rate = riding ? fast * 0.55 : 0;
    } else if (trail.kind === 'canoe') {
      _follow.x = pos.x + bx * 1.9; _follow.y = 0.14; _follow.z = pos.z + bz * 1.9;
      H[0].opts.rate = riding && speed > 1.1 ? clamp(speed * 1.2, 0, 10) : 0;
    } else {
      _follow.x = pos.x + bx * 1.6; _follow.y = pos.y + 0.9; _follow.z = pos.z + bz * 1.6;
      H[0].opts.rate = riding ? clamp(0.8 + speed * 0.16, 0, 3.5) : 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERIORS — dust in the sunbeam
  // ═══════════════════════════════════════════════════════════════════════════
  // ONE emitter, tiny motes, confined to a narrow shaft offset from the middle
  // of the room (the direction is hashed off the room id so every room's beam
  // falls from a different window and the same room is always the same).
  let beam = null;
  const BEAM_DAY = [0xfff0c8, 0xffe6ad, 0xfff8e2];
  const BEAM_NIGHT = [0xdfe6ff, 0xc9d6f4, 0xeef2ff];
  function beamAt(x0, z0, id = 'room', floorY) {
    beam?.stop();
    const a = (hash(String(id)) % 360) * Math.PI / 180;
    const x = x0 + Math.cos(a) * 2.0, z = z0 + Math.sin(a) * 2.0;
    // An interior can sit on a raised floor (the palace hall is ~9 units up), so
    // the floor the PLAYER is standing on wins over the terrain underneath it.
    const g = Math.max(world.height(x, z), 0, floorY ?? -1e9);
    beam = api.emitter({
      shape: 'soft', blend: 'add', color: BEAM_DAY, colorEnd: 0xfff6e2,
      x, y: g + 1.9, z, area: 0.85, areaY: 2.9, rate: 6,
      speed: 0.06, lateral: 1, vy: -0.05, vyJitter: 0.08, gravity: 0.004, drag: 0.2,
      life: 6.5, lifeVar: 0.4, size: 0.14, sizeVar: 0.6, sizeEnd: 0.09,
      alpha: 0.6, fadeIn: 0.3, fadeOut: 0.45, sway: 0.16, swayFreq: 0.5, wind: 0.04,
      range: 40,
    });
    return beam;
  }
  ctx.events.on('interior:enter', (p) => {
    const pl = player()?.position;
    beamAt(p?.x ?? pl?.x ?? 0, p?.z ?? pl?.z ?? 0, p?.id ?? 'room', pl ? pl.y - 0.15 : undefined);
  });
  ctx.events.on('interior:exit', () => { beam?.stop(); beam = null; });

  // ═══════════════════════════════════════════════════════════════════════════
  function update(dt) {
    for (let i = timers.length - 1; i >= 0; i--) {
      const t = timers[i];
      t.t -= dt;
      if (t.t <= 0) { timers.splice(i, 1); try { t.fn(); } catch (e) { /* never take the frame down */ } }
    }
    updateTrail(dt);
    if (beam) {
      // a sunbeam by day, a shaft of moonlight after dark
      beam.opts.color = ctx.state.daylight > 0.35 ? BEAM_DAY : BEAM_NIGHT;
      beam.opts.rate = 4 + 3 * clamp(ctx.state.daylight, 0, 1);
    }
  }

  return {
    update,
    // exposed so the screenshot harness can fire them from tools/views
    // ("call": { "particles.events.burnAt": [x, z, r] }) and so other systems
    // can reuse the ring / beam without going through an event
    burnAt, stompAt, beamAt, startTrail, stopTrail,
    get trailKind() { return trail?.kind || null; },
    get fires() { return fires.length; },
    get beamOn() { return !!beam; },
  };
}
