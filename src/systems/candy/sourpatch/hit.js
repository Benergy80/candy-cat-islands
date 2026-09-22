// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KID — GETTING HIT (wave 2 weapons contract).
//
// sourPatch.hit(kidRef, { weapon, power, from:{x,z}, kind }) lands here. Every
// reaction is cartoon and bloodless; nothing here is ever gory, the worst that
// happens to a Sour Patch Kid is that it becomes a puddle of sugar and sulks
// about it for twenty-five seconds.
//
//   salt shaker  (throw) → SHRIEK, fizz, shrink, sink into a sugar puddle,
//                          respawn at its own front door after 25 s
//   spray bottle /
//   lemon spritzer (spray) → the same melt, but wet: steam, wobble, "TOO SOUR"
//   bat / hammer (melee) → punted in a parabola away from `from` with a star
//                          burst, lands, dizzy 3 s, then flees (day) or goes
//                          straight back to hunting (night)
//   gumball      (throw) → stunned 2 s, wobbling, cross-eyed
//   anything else        → a generic flinch, and no exception
//
// Night rule: two hits inside 10 seconds and that kid is DONE — it gives up,
// walks home, and stays in for the rest of the night.
//
// The reaction owns the kid while it runs: brain(k) returns true and sourpatch
// skips the day/night brain for that kid. Nothing is allocated per frame.
// ─────────────────────────────────────────────────────────────────────────────
import { clamp, damp } from '../../../core/util.js';

export const RESPAWN_SEC = 25;      // sugar puddle → front door
const GIVEUP_WINDOW = 10;           // hit twice inside this and it goes home
const GIVEUP_HITS = 2;

const _o = {};                      // shared particle options bag — never allocate
function bag() { for (const k in _o) delete _o[k]; return _o; }

/** weapon id (+ kind) → reaction. Unknown weapons flinch; nothing throws. */
export function classify(weapon, kind) {
  const w = String(weapon || '').toLowerCase();
  if (w.includes('salt')) return 'dissolve';
  if (w.includes('spray') || w.includes('lemon') || w.includes('spritz') || w.includes('juice')) return 'melt';
  if (w.includes('fire') || w.includes('caramel') || w.includes('flame') || w.includes('torch')) return 'melt';
  if (w.includes('bat') || w.includes('hammer') || w.includes('mallet') || w.includes('club') || w.includes('candy_cane')) return 'bonk';
  if (w.includes('gumball') || w.includes('sling') || w.includes('gum') || w.includes('pebble') || w.includes('jawbreaker')) return 'stun';
  if (kind === 'spray') return 'melt';
  if (kind === 'melee') return 'bonk';
  if (kind === 'throw') return 'stun';
  return 'flinch';
}

/**
 * D = { kids, V, rand, phase(), groundY, canStand(x,z), dist2d, moveTo, faceThing,
 *       say, puff, playerPos(), homeSpot(k) }
 */
export function createHits(ctx, D) {
  const { kids, V, rand } = D;
  const counts = { dissolve: 0, melt: 0, bonk: 0, stun: 0, flinch: 0 };
  const byWeapon = Object.create(null);
  let total = 0, dissolvedTotal = 0, gaveUpTotal = 0, stomps = 0;
  let elapsed = 0;

  const P = () => ctx.systems.particles;
  const line = (pool, k) => pool[(k.lineIdx++) % pool.length];

  // ── particle beats ─────────────────────────────────────────────────────────
  function fizz(k, wet) {
    const o = bag();
    o.x = k.x + (rand() - 0.5) * 0.4; o.y = k.y + 0.55 + rand() * 0.7; o.z = k.z + (rand() - 0.5) * 0.4;
    if (wet) {
      // steam off a melting gummy: a fat column, not a sparkle
      o.shape = 'puff'; o.count = 4; o.color = [0xffffff, 0xeafff2, 0xfdffd6];
      o.speed = 0.5; o.up = 1.8; o.life = 1.3; o.lifeVar = 0.3; o.size = 0.40; o.sizeEnd = 1.15;
      o.gravity = 1.4; o.drag = 1.2; o.spread = 0.4; o.alpha = 0.55; o.fadeOut = 0.6;
      P()?.burst(o);
      const s = bag();
      s.x = o.x; s.y = o.y; s.z = o.z; s.shape = 'sparkle'; s.blend = 'add'; s.count = 2;
      s.color = [0xfdff8a, 0xffffff]; s.speed = 2.0; s.up = 1.0; s.life = 0.45; s.size = 0.5;
      s.sizeEnd = 0.02; s.gravity = -2; s.drag = 2; s.spread = 0.4; s.alpha = 1;
      P()?.burst(s);
      return;
    }
    o.shape = 'sparkle'; o.blend = 'add'; o.count = 6; o.color = [0xffffff, 0xeaf6ff, 0xfff3d8];
    o.speed = 2.8; o.up = 1.2; o.life = 0.55; o.lifeVar = 0.35; o.size = 0.58; o.sizeEnd = 0.02;
    o.gravity = -2.5; o.drag = 2.0; o.spread = 0.55; o.spin = 1.4; o.alpha = 1; o.fadeOut = 0.5;
    P()?.burst(o);
  }

  /** The sugar puddle it leaves behind: flat decals that stick to the ground. */
  function puddle(k) {
    const g = D.groundY(k.x, k.z);
    const o = bag();
    o.x = k.x; o.y = g + 0.14; o.z = k.z; o.count = 14; o.shape = 'soft'; o.flat = true;
    o.ground = 'stick'; o.floorY = g + 0.07;
    o.color = [k.color, 0xffffff, 0xfff0f8]; o.colorEnd = 0xffffff;
    o.speed = 1.5; o.up = 0.55; o.life = 7.5; o.lifeVar = 0.25;
    o.size = 0.5; o.sizeEnd = 0.92; o.sizeVar = 0.35;
    o.gravity = -7; o.drag = 0.6; o.spread = 0.3; o.alpha = 0.8; o.fadeIn = 0.06; o.fadeOut = 0.72;
    P()?.burst(o);
    P()?.ripple(k.x, g + 0.09, k.z, { ringColor: 0xffffff, ringSize: 2.8, ringLife: 1.1 });
  }

  /** BONK. A ring of fat stars, the oldest gag in the book. */
  function bonkStars(k) {
    const o = bag();
    o.x = k.x; o.y = k.y + 1.35 * k.scale; o.z = k.z; o.count = 14;
    o.shape = 'sparkle'; o.blend = 'add';
    o.color = [0xfff2a8, 0xffd23a, 0xffffff, 0xffb43a];
    o.speed = 5.2; o.up = 0.9; o.life = 0.7; o.lifeVar = 0.3;
    o.size = 0.95; o.sizeEnd = 0.05; o.sizeVar = 0.3;
    o.gravity = -3; o.drag = 1.8; o.spread = 0.3; o.spin = 2.4; o.alpha = 1; o.fadeOut = 0.55;
    P()?.burst(o);
  }

  /** The little stars that circle a dizzy head. */
  function dizzyStar(k, a) {
    const o = bag();
    o.x = k.x + Math.cos(a) * 0.52; o.y = k.y + 1.62 * k.scale; o.z = k.z + Math.sin(a) * 0.52;
    o.count = 1; o.shape = 'sparkle'; o.blend = 'add'; o.color = [0xffe27a, 0xfff6c8];
    o.speed = 0.1; o.up = 0.2; o.life = 0.55; o.size = 0.46; o.sizeEnd = 0.05;
    o.gravity = 0.4; o.drag = 1.5; o.spread = 0.05; o.spin = 1.2; o.alpha = 1; o.fadeOut = 0.6;
    P()?.burst(o);
  }

  function impact(k, color, count = 10) {
    const o = bag();
    o.x = k.x; o.y = k.y + 1.0 * k.scale; o.z = k.z; o.count = count;
    o.color = color; o.speed = 3.0; o.up = 0.8; o.life = 0.55; o.size = 0.18;
    o.gravity = -6; o.spread = 0.5; o.alpha = 0.9;
    P()?.burst(o);
  }

  // ── entering a reaction ────────────────────────────────────────────────────
  function clear(k) {
    k.hurt = null; k.air = 0; k.hurtHead = false;
  }
  function enter(k, mode, dur, extra) {
    const h = { mode, t: 0, dur, cause: '', fx: k.x, fz: k.z, vx: 0, vz: 0, vy: 0, spin: 0, fizzT: 0, said: false };
    if (extra) Object.assign(h, extra);
    k.hurt = h; k.air = k.air || 0;
    k.state = 'idle';           // cancel steal/photobomb: they have other problems
    k.gotHat = false;
    return h;
  }

  function resolve(ref) {
    if (ref == null) return null;
    if (typeof ref === 'number') return kids[ref] || null;
    if (typeof ref === 'string') {
      const id = ref.startsWith('sourpatch_') ? Number(ref.slice(10)) : NaN;
      if (Number.isFinite(id)) return kids[id] || null;
      const low = ref.toLowerCase();
      return kids.find((k) => k.name.toLowerCase() === low) || null;
    }
    if (typeof ref === 'object') {
      if (kids.includes(ref)) return ref;
      if (Number.isFinite(ref.i) && kids[ref.i]) return kids[ref.i];
      if (Number.isFinite(ref.ki) && kids[ref.ki]) return kids[ref.ki];   // interaction entry
      if (ref.kid && kids.includes(ref.kid)) return ref.kid;
    }
    return null;
  }

  const melting = (k) => !!k.hurt && (k.hurt.mode === 'dissolve' || k.hurt.mode === 'gone' || k.hurt.mode === 'reform');

  // ── the public hook ────────────────────────────────────────────────────────
  function hit(kidRef, opts) {
    const k = resolve(kidRef);
    if (!k) return false;
    if (melting(k)) return false;                       // already a puddle
    // Already mid-punt: the same blow arriving twice (a stomp that both the
    // weapons system and our own 'player:stomp' listener saw, an area hit that
    // overlaps a melee arc) must not count as a second hit toward giving up.
    if (k.hurt && k.hurt.mode === 'fly' && k.hurt.t < 0.25) {
      return { i: k.i, name: k.name, reaction: 'bonk', weapon: String(opts?.weapon || ''), kind: String(opts?.kind || ''), gaveUp: !!k.gaveUp, streak: k.hitStreak || 0, duplicate: true };
    }
    const o = opts || {};
    const weapon = o.weapon == null ? '' : String(o.weapon);
    const kind = o.kind == null ? '' : String(o.kind);
    const power = Number.isFinite(o.power) ? clamp(o.power, 0.2, 4) : 1;
    const pp = D.playerPos();
    const fx = Number.isFinite(o.from?.x) ? o.from.x : (pp ? pp.x : k.x);
    const fz = Number.isFinite(o.from?.z) ? o.from.z : (pp ? pp.z : k.z + 1);
    const react = classify(weapon, kind);
    const night = D.phase() === 'hunting';

    total++;
    counts[react] = (counts[react] || 0) + 1;
    const wk = weapon || kind || 'unknown';
    byWeapon[wk] = (byWeapon[wk] || 0) + 1;

    // ── "two hits in ten seconds and I'm going home" ───────────────────────
    if (elapsed - (k.lastHitAt ?? -99) <= GIVEUP_WINDOW) k.hitStreak = (k.hitStreak || 0) + 1;
    else k.hitStreak = 1;
    k.lastHitAt = elapsed;
    k.hitsTaken = (k.hitsTaken || 0) + 1;
    let gaveUpNow = false;
    if (night && !k.gaveUp && k.hitStreak >= GIVEUP_HITS && react !== 'dissolve' && react !== 'melt') {
      k.gaveUp = true; gaveUpTotal++; gaveUpNow = true;
    }

    // knock direction: away from the swing
    let ax = k.x - fx, az = k.z - fz;
    const ad = Math.hypot(ax, az) || 1;
    ax /= ad; az /= ad;

    switch (react) {
      case 'dissolve':
      case 'melt': {
        const wet = react === 'melt';
        const h = enter(k, 'dissolve', wet ? 2.0 : 1.6, { cause: wet ? 'spray' : 'salt', fx, fz });
        h.fizzT = 0;
        D.say(k, line(wet ? V.MELT : V.SHRIEK, k), true);
        k.mouthOpen = 1; k.mouthWide = 1; k.squash = -0.22;
        impact(k, wet ? [0xfdff8a, 0xffffff, 0xd8ffe8] : [0xffffff, 0xeaf2ff], 16);
        dissolvedTotal++;
        ctx.events.emit('sourpatch:dissolved', { i: k.i, name: k.name, x: k.x, z: k.z, weapon, cause: h.cause });
        ctx.systems.ui?.toast(wet
          ? 'Sour Patch Kid melted. It\'ll be back. They always come back.'
          : 'Sour Patch Kid dissolved. It\'ll be back. They always come back.', 4.5);
        // the neighbours scatter
        for (const o2 of kids) {
          if (o2 === k || o2.hurt || D.dist2d(o2.x, o2.z, k.x, k.z) > 7) continue;
          if (rand() < 0.6) enter(o2, 'flee', 2.4 + rand() * 1.6, { fx: k.x, fz: k.z });
        }
        break;
      }
      case 'bonk': {
        const sp = 7.2 + power * 2.4;
        const h = enter(k, 'fly', 3.0, { fx, fz });
        h.vx = ax * sp; h.vz = az * sp; h.vy = 6.2 + power * 1.6;
        h.spin = (rand() < 0.5 ? -1 : 1) * (5 + rand() * 3);
        bonkStars(k);
        k.squash = -0.26; k.hop = 0;
        D.say(k, line(V.BONK, k), true);
        ctx.events.emit('sourpatch:bonk', { i: k.i, name: k.name, x: k.x, z: k.z, weapon });
        break;
      }
      case 'stun': {
        enter(k, 'stun', 2.0, { fx, fz });
        k.squash = -0.18;
        impact(k, [0xff6fb0, 0xffd23a, 0xffffff], 12);
        // shoved back a step, not launched
        k.x += ax * 0.45; k.z += az * 0.45;
        D.say(k, line(V.STUN, k), true);
        break;
      }
      default: {
        enter(k, 'flinch', 0.6, { fx, fz });
        k.squash = -0.14;
        D.puff(k, 6, 1.1);
        D.say(k, line(V.FLINCH, k));
        break;
      }
    }

    if (gaveUpNow) {
      D.say(k, line(V.GIVEUP, k), true);
      ctx.systems.ui?.toast(`${k.name} gives up and goes home. The rest are still hungry.`, 3.5);
      ctx.events.emit('sourpatch:gaveup', { i: k.i, name: k.name });
    }
    ctx.events.emit('sourpatch:hit', { i: k.i, name: k.name, weapon, kind, reaction: react, gaveUp: !!k.gaveUp });
    return { i: k.i, name: k.name, reaction: react, weapon, kind, gaveUp: !!k.gaveUp, streak: k.hitStreak };
  }

  /** A stomp shockwave: everyone inside r gets knocked over and sees stars. */
  function stomp(x, z, r = 6) {
    stomps++;
    let n = 0;
    for (const k of kids) {
      if (melting(k) || k.vis < 0.35) continue;
      const d = D.dist2d(k.x, k.z, x, z);
      if (d > r) continue;
      const f = 1 - d / Math.max(0.5, r);
      let ax = k.x - x, az = k.z - z;
      const ad = Math.hypot(ax, az) || 1; ax /= ad; az /= ad;
      const h = enter(k, 'fly', 3.0, { fx: x, fz: z });
      h.vx = ax * (3.4 + f * 4.5); h.vz = az * (3.4 + f * 4.5); h.vy = 3.6 + f * 3.4;
      h.spin = (rand() < 0.5 ? -1 : 1) * (3 + rand() * 3);
      k.squash = -0.22;
      bonkStars(k);
      n++;
      if (n === 1) D.say(k, line(V.BONK, k), true);
    }
    if (n) ctx.events.emit('sourpatch:stomped', { x, z, r, kids: n });
    return n;
  }

  // ── the reaction brain ─────────────────────────────────────────────────────
  /** Returns true when the reaction owns this kid's movement/pose this frame. */
  function brain(k, dt, t, p, dp) {
    // a kid that has given up walks home the moment nothing else is happening
    if (!k.hurt && k.gaveUp && D.phase() === 'hunting') enter(k, 'gohome', 30);
    const h = k.hurt;
    if (!h) return false;
    h.t += dt;
    k.hurtHead = false;

    switch (h.mode) {
      // ── fizz, shrink, sink, puddle ──────────────────────────────────────
      case 'dissolve': {
        const wet = h.cause === 'spray';
        const prog = clamp(h.t / h.dur, 0, 1);
        k.moving = 0; k.gaitAmp = 0; k.armMode = 'up'; k.hurtHead = true;
        k.vis = Math.max(0.02, 1 - prog);                   // shrinks away, evenly
        k.air = -0.34 * prog * prog;                        // and sinks in
        k.mouthOpen = 0.9; k.mouthWide = 1; k.lean = 0.05;
        const wob = (wet ? 26 : 32) * (1 - prog * 0.5);
        k.sway = Math.sin(h.t * wob) * 0.34 * (1 - prog * 0.4);
        k.headRoll = Math.sin(h.t * wob + 1.1) * 0.36 * (1 - prog * 0.4);
        k.lookX = Math.sin(h.t * 17) * 0.8; k.lookY = 0.4;
        k.blink = 0;
        h.fizzT -= dt;
        if (h.fizzT <= 0) { h.fizzT = wet ? 0.10 : 0.07; fizz(k, wet); }
        if (prog >= 1) {
          puddle(k);
          k.vis = 0; k.air = 0;
          const home = D.homeSpot(k);
          k.x = home.x; k.z = home.z; k.groundY = D.groundY(k.x, k.z); k.y = k.groundY;
          h.mode = 'gone'; h.t = 0; h.dur = Math.max(1, RESPAWN_SEC - h.dur);
        }
        return true;
      }
      // ── twenty-five seconds of being a puddle ───────────────────────────
      case 'gone': {
        k.vis = 0; k.moving = 0; k.gaitAmp = 0; k.air = 0; k.hurtHead = true;
        const home = D.homeSpot(k);
        k.x = home.x; k.z = home.z;
        if (h.t >= h.dur) {
          h.mode = 'reform'; h.t = 0; h.dur = 0.9;
          k.yaw = k.desYaw = Math.atan2(p.x - k.x, p.z - k.z);
          k.squash = -0.24; k.hopT = 0;
          D.puff(k, 14, 0.9);
          const o = bag();
          o.x = k.x; o.y = k.y + 0.8; o.z = k.z; o.count = 12; o.shape = 'sparkle'; o.blend = 'add';
          o.color = [k.color, 0xffffff]; o.speed = 2.6; o.up = 1.2; o.life = 0.8; o.size = 0.6;
          o.sizeEnd = 0.04; o.gravity = -2; o.drag = 1.6; o.spread = 0.4; o.alpha = 1;
          P()?.burst(o);
          ctx.events.emit('sourpatch:respawn', { i: k.i, name: k.name, x: k.x, z: k.z });
        }
        return true;
      }
      case 'reform': {
        k.vis = Math.min(1, h.t / h.dur);
        k.moving = 0; k.gaitAmp = 0; k.armMode = 'up'; k.hurtHead = true;
        k.headRoll = Math.sin(h.t * 9) * 0.2 * (1 - h.t / h.dur);
        k.mouthWide = 0.8;
        if (!h.said && h.t > 0.25) { h.said = true; D.say(k, line(V.REFORM, k)); }
        if (h.t >= h.dur) { k.vis = 1; clear(k); }
        return true;
      }
      // ── punted across the village ───────────────────────────────────────
      case 'fly': {
        h.vy -= 26 * dt;
        k.air += h.vy * dt;
        const nx = k.x + h.vx * dt, nz = k.z + h.vz * dt;
        if (D.canStand(nx, nz)) { k.x = nx; k.z = nz; }
        else { h.vx *= -0.35; h.vz *= -0.35; }             // bonk off the scenery
        k.yaw += h.spin * dt; k.desYaw = k.yaw;
        k.moving = 0; k.gaitAmp = 0; k.armMode = 'run'; k.lean = 0.55; k.hurtHead = true;
        k.mouthOpen = 0.85; k.mouthWide = 0.9; k.headPitch = -0.25; k.headRoll = 0;
        h.fizzT -= dt;
        if (h.fizzT <= 0) { h.fizzT = 0.07; fizz(k, false); }
        if (k.air <= 0 && h.vy < 0) {
          k.air = 0; k.squash = -0.28; k.hop = 0;
          D.puff(k, 10, 0.25);
          P()?.dust?.(k.x, D.groundY(k.x, k.z) + 0.1, k.z, { count: 8, color: 0xffe9f4, size: 0.4 });
          h.mode = 'dizzy'; h.t = 0; h.dur = 3.0; h.said = false;
        }
        return true;
      }
      // ── three seconds of seeing stars ───────────────────────────────────
      case 'dizzy': {
        k.moving = 0; k.gaitAmp = 0; k.armMode = 'free'; k.air = 0; k.hurtHead = true;
        k.yaw += dt * 1.3; k.desYaw = k.yaw;
        k.headRoll = Math.sin(h.t * 7) * 0.42;
        k.sway = Math.sin(h.t * 5.4) * 0.26;
        k.lean = damp(k.lean, 0.12, 4, dt);
        k.lookX = Math.sin(h.t * 9) * 0.9; k.lookY = Math.cos(h.t * 7.2) * 0.4;
        k.mouthOpen = 0.35; k.mouthWide = 0.6; k.blink = 0;
        h.fizzT -= dt;
        if (h.fizzT <= 0) { h.fizzT = 0.16; dizzyStar(k, h.t * 4.2); }
        if (!h.said && h.t > 0.8) { h.said = true; D.say(k, line(V.DIZZY, k)); }
        if (h.t >= h.dur) {
          if (D.phase() === 'hunting' && !k.gaveUp) clear(k);           // right, where were we
          else { h.mode = 'flee'; h.t = 0; h.dur = 5.0; }
        }
        return true;
      }
      // ── legging it ──────────────────────────────────────────────────────
      case 'flee': {
        const away = Math.atan2(k.x - h.fx, k.z - h.fz);
        D.moveTo(k, k.x + Math.sin(away) * 8, k.z + Math.cos(away) * 8, 5.4, dt);
        k.armMode = 'run'; k.lean = 0.34; k.gaitAmp = Math.max(k.gaitAmp, 0.9);
        k.mouthOpen = 0.6; k.mouthWide = 0.85; k.air = 0;
        if (h.t >= h.dur) clear(k);
        return true;
      }
      // ── stunned: planted, wobbling, cross-eyed ──────────────────────────
      case 'stun': {
        const f = 1 - clamp(h.t / h.dur, 0, 1);
        k.moving = 0; k.gaitAmp = 0; k.armMode = 'free'; k.air = 0; k.hurtHead = true;
        k.sway = Math.sin(h.t * 13) * 0.28 * f;
        k.headRoll = Math.sin(h.t * 10.5 + 1) * 0.34 * f;
        k.lookX = Math.sin(h.t * 12) * 0.85; k.lookY = Math.sin(h.t * 8) * 0.4;
        k.lean = damp(k.lean, 0.08, 4, dt);
        k.mouthOpen = 0.3 * f; k.mouthWide = 0.5; k.blink = 0;
        if (h.t >= h.dur) {
          if (D.phase() === 'hunting' && !k.gaveUp) clear(k);
          else { h.mode = 'flee'; h.t = 0; h.dur = 3.0; }
        }
        return true;
      }
      // ── a poke with something it doesn't recognise ───────────────────────
      case 'flinch': {
        const f = 1 - clamp(h.t / h.dur, 0, 1);
        k.moving = 0; k.gaitAmp = 0; k.air = 0;
        k.lean = -0.30 * f;                              // recoil
        k.headRoll = Math.sin(h.t * 20) * 0.18 * f;
        k.mouthWide = 0.8; k.armMode = 'up';
        if (h.t >= h.dur) clear(k);
        return true;
      }
      // ── "fine. FINE. i'm going home." ───────────────────────────────────
      case 'gohome': {
        k.armMode = 'free'; k.air = 0; k.lean = 0.1;
        const d = D.moveTo(k, k.home.x, k.home.z, 5.2, dt);
        k.crouch = damp(k.crouch, 0.2, 3, dt);
        if (d < 1.2 || h.t > h.dur) {
          if (k.vis > 0.9) D.puff(k, 10, 0.8);
          k.vis = Math.max(0, k.vis - dt * 2.4);
          k.moving = 0;
          if (k.vis <= 0.01) { h.mode = 'sulk'; h.t = 0; h.dur = 1e9; }
        }
        return true;
      }
      case 'sulk': {
        k.vis = 0; k.moving = 0; k.gaitAmp = 0; k.air = 0; k.hurtHead = true;
        k.x = k.home.x; k.z = k.home.z;
        return true;
      }
      default: clear(k); return false;
    }
  }

  return {
    hit, stomp, brain, classify, clear,
    melting,
    resolve,
    /** true while the kid is out of the game (puddle / sulking at home) */
    absent: (k) => !!k.hurt && (k.hurt.mode === 'gone' || k.hurt.mode === 'sulk'),
    tick(dt) { elapsed += dt; },
    /** phase changes wipe the small reactions but never interrupt a dissolve */
    reset(keepMelt = true) {
      for (const k of kids) {
        if (keepMelt && melting(k)) continue;
        if (k.hurt) clear(k);
        k.gaveUp = false; k.hitStreak = 0;
      }
    },
    counters: () => ({
      hits: total, byReaction: { ...counts }, byWeapon: { ...byWeapon },
      dissolved: dissolvedTotal, gaveUp: gaveUpTotal, stomps,
    }),
  };
}
