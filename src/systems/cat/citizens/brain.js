// ─────────────────────────────────────────────────────────────────────────────
// CAT BRAIN — schedules, steering and body animation.
//
// Every cat runs: globalBeat (island-wide beats: 7am sprint, noon sunbathe,
// 14:00 nap wave, 18:00 promenade, night watch) → role SCHEDULE → act handler
// (post / wander / patrol / promenade / sprint / kitten / shadow / watch) →
// pose targets → damped rig application.
//
// WAVE 3 (Contract A — ground & collision): the act handlers only PROPOSE a
// move. `S.settle(c, dt, plan)` (citizens.js) then runs the move through the
// player's shared ground core — pushOut against every SOLID collider, feet on
// groundInfo().h (terrain, deck, or the TOP of a low prop) — before the rig is
// posed, so what is drawn is always the resolved position. A push reports back
// as `c.bumped` (+ the push normal c.bnx/c.bnz) and the planners here treat it
// as "turn around": wander re-picks a target away from the obstacle, patrols
// swap lanes and then reverse, a walk to a mark that stays blocked gives up
// and idles where it stands.
// ─────────────────────────────────────────────────────────────────────────────
import { damp, lerp, clamp, smoothstep } from '../../../core/util.js';
import { TAIL_REST } from './rig.js';
import { applyTiger } from './tiger.js';

const TAU = Math.PI * 2;
const TIGER_PS = 3.6;         // a tiger walks round the visitor inside this (centre to centre)
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const dampAngle = (a, b, l, dt) => a + wrapPi(b - a) * (1 - Math.exp(-l * dt));

// ── pose library ─────────────────────────────────────────────────────────────
// Every field is a damped target. Missing fields fall back to REST.
const REST = {
  rootDY: 0, offZ: 0, pitch: 0, roll: 0, sx: 1, sy: 1, sz: 1,
  legFwd: 0, legHide: 0, walk: 0, armFwdL: 0, armFwdR: 0, armOutL: 0.06, armOutR: 0.06,
  headPitch: 0, headYaw: 0, headRoll: 0, earBack: 0, eyeOpen: 1,
  tailLift: 0, tailCurl: 0.28, tailSwish: 1, flex: 0,
};

// tailLift is measured from TAIL_REST (near-vertical): negative lays the tail
// back and down, positive tips it forward over the spine.
export const POSES = {
  stand: {},
  work: { armFwdL: -0.55, armFwdR: -0.6, headPitch: 0.22, tailSwish: 0.8 },
  sit: { rootDY: -0.16, legFwd: 1.15, legHide: 0, sy: 0.97, tailCurl: 0.52, tailSwish: 0.6, armFwdL: -0.12, armFwdR: -0.12 },
  loaf: { rootDY: -0.30, legHide: 1, sx: 1.16, sy: 0.74, sz: 1.12, headPitch: 0.14, earBack: 0.18, eyeOpen: 0.12, tailLift: 0.82, tailCurl: 0.62, tailSwish: 0.25, armFwdL: -1.3, armFwdR: -1.3, armOutL: -0.05, armOutR: -0.05 },
  sleep: { rootDY: -0.33, legHide: 1, sx: 1.2, sy: 0.70, sz: 1.16, headPitch: 0.3, earBack: 0.3, eyeOpen: 0, tailLift: 0.92, tailCurl: 0.7, tailSwish: 0.12, armFwdL: -1.35, armFwdR: -1.35, armOutL: -0.08, armOutR: -0.08 },
  sunbathe: { rootDY: 0.18, offZ: 0.70, pitch: -1.42, legHide: 0, legFwd: -0.55, armFwdL: 1.5, armFwdR: 1.5, armOutL: 0.75, armOutR: 0.75, eyeOpen: 0.1, headPitch: -0.25, sx: 1.1, sy: 0.92, tailSwish: 0.3, tailLift: -0.96 },
  groom: { rootDY: -0.16, legFwd: 1.1, headPitch: 0.55, armFwdR: -2.45, armOutR: -0.38, tailSwish: 0.5, tailCurl: 0.5 },
  // NIP: flat on the back in the catnip, paws in the air, rolling gently from
  // side to side, eyes screwed shut, entirely unavailable for conversation.
  nip: { rootDY: -0.20, offZ: 0.34, pitch: -1.22, roll: 0.30, legHide: 0, legFwd: -0.92,
         armFwdL: 1.80, armFwdR: 1.80, armOutL: 0.88, armOutR: 0.88, eyeOpen: 0.06,
         headPitch: -0.30, headRoll: 0.26, earBack: 0.44, sx: 1.12, sy: 0.90, sz: 1.06,
         tailLift: -0.88, tailCurl: 0.18, tailSwish: 0.45 },
  stretch: { pitch: 0.30, rootDY: -0.06, sy: 1.16, armFwdL: -1.9, armFwdR: -1.9, headPitch: -0.3, tailLift: -1.11, tailSwish: 0.4 },
  wave: { armFwdR: -2.15, armOutR: 0.9, headPitch: -0.06, tailSwish: 1.5, tailLift: 0.1 },
  flex: { armFwdL: -1.5, armFwdR: -1.5, armOutL: 1.34, armOutR: 1.34, flex: 1, sx: 1.06, headPitch: -0.1, tailSwish: 1.2, tailLift: 0.12 },
  lift: { armOutL: 0.22, armOutR: 0.22, flex: 0.6, tailSwish: 0.7 },
  press: { armFwdL: -2.5, armFwdR: -2.5, armOutL: 0.46, armOutR: 0.46, flex: 1, sy: 1.02, headPitch: -0.14, tailSwish: 1.0 },
  spot: { armFwdL: -1.5, armFwdR: -1.5, armOutL: 0.3, armOutR: 0.3, headPitch: -0.2, legFwd: 0.25, tailSwish: 0.8 },
  // ALTERNATING CURL: one paw at the shoulder, one hanging. The dumbbell in
  // each hand swaps ends on a 3.7 s cycle; the chest puffs on the up-beat.
  curl: { armFwdR: -1.55, armOutR: 0.16, armFwdL: -0.30, armOutL: 0.16, headPitch: -0.06, flex: 0.55, sx: 1.03, tailSwish: 1.1, tailLift: 0.08 },
  // GOBLET SQUAT: weights hanging at the hips, chest up, hips dropping.
  squat: { rootDY: -0.22, legFwd: 0.42, pitch: 0.20, armFwdL: -0.10, armFwdR: -0.10, armOutL: 0.26, armOutR: 0.26,
           headPitch: -0.24, flex: 0.8, sy: 0.94, tailLift: -0.55, tailCurl: 0.12, tailSwish: 0.7 },
  fiddle: { armFwdL: -2.1, armOutL: -0.12, armFwdR: -1.5, armOutR: 0.52, headPitch: 0.14, headRoll: 0.30, tailSwish: 1.6, tailLift: 0.1 },
  play: { tailSwish: 2.2, headPitch: -0.12, armFwdL: -0.4, armFwdR: -0.4, tailLift: 0.15 },
  chase: { pitch: 0.20, headPitch: -0.16, tailLift: -0.45, tailCurl: 0.16, tailSwish: 2.6, armFwdL: -0.5, armFwdR: -0.5 },
  chat: { armFwdR: -0.95, armOutR: 0.38, headPitch: -0.07, tailSwish: 1.8, tailLift: 0.14 },
  gossip: { rootDY: -0.16, legFwd: 1.15, sy: 0.97, pitch: 0.11, headPitch: -0.04, armFwdL: -0.62, armFwdR: -0.3, armOutR: 0.3, tailCurl: 0.55, tailSwish: 1.4 },
  queue: { headPitch: -0.04, armFwdL: -0.3, armFwdR: -0.3, tailLift: -0.22, tailSwish: 0.55 },
  sip: { armFwdR: -1.95, armOutR: 0.04, headPitch: 0.14, tailSwish: 0.8 },
  hoist: { armFwdR: -1.2, armOutR: 0.2, headPitch: -0.05, tailSwish: 0.9, tailLift: 0.1 },
  watch: { rootDY: -0.16, legFwd: 1.15, sy: 0.97, tailCurl: 0.55, tailSwish: 0.18, eyeOpen: 1.08, earBack: -0.12, armFwdL: -0.12, armFwdR: -0.12 },
  hold: { armFwdR: -0.7, armOutR: 0.1 },
  point: { armFwdR: -1.45, armOutR: 0.28, headPitch: -0.05 },
  // ── being hit (see catCitizens.hit) ──────────────────────────────────────
  hiss: { earBack: 1.0, headPitch: -0.14, sx: 1.12, sy: 1.04, tailLift: 0.55, tailCurl: 0.1, tailSwish: 2.6,
          armFwdL: -0.85, armOutL: 0.62, armFwdR: -0.85, armOutR: 0.62, eyeOpen: 1.1 },
  flee: { pitch: 0.24, headPitch: 0.04, earBack: 0.9, tailLift: -0.95, tailCurl: 0.12, tailSwish: 0.5,
          armFwdL: -0.35, armFwdR: -0.35, eyeOpen: 1.1 },
  sulk: { rootDY: -0.16, legFwd: 1.15, sy: 0.97, earBack: 0.72, headPitch: 0.3, eyeOpen: 0.45,
          tailCurl: 0.72, tailSwish: 0.22, armFwdL: -0.1, armFwdR: -0.1 },
  dizzy: { rootDY: -0.07, roll: 0.1, headRoll: 0.32, earBack: 0.55, eyeOpen: 0.4,
           armFwdL: -0.5, armOutL: 0.7, armFwdR: -0.5, armOutR: 0.7, tailSwish: 0.7, tailLift: -0.4 },
  // wave 3 weapons (Contract C): the licorice whip STAGGERS, bubblegum STICKS
  stagger: { pitch: -0.14, roll: 0.2, headRoll: -0.3, headPitch: -0.12, earBack: 0.85, eyeOpen: 1.12,
             armFwdL: -0.35, armOutL: 1.05, armFwdR: -0.35, armOutR: 1.05, tailLift: 0.35, tailCurl: 0.08, tailSwish: 2.2 },
  stuck: { pitch: 0.22, rootDY: -0.05, earBack: 0.8, eyeOpen: 1.12, headPitch: 0.18,
           armFwdL: -1.25, armOutL: 0.55, armFwdR: -1.25, armOutR: 0.55, legFwd: 0.2,
           tailLift: -0.2, tailCurl: 0.1, tailSwish: 2.6 },
};

// ── pose vectors (Contract J frame-rate pass) ────────────────────────────────
// animate() used to fill `t` from POSES and damp `a` toward it with for-in
// loops over computed keys: every keyed store boxed a fresh number (~70 KB of
// garbage a frame across the town). Now both are fixed-shape objects written by
// named fields, and every pose is pre-expanded against REST once at load.
// dampPose(a, t, f) with f = 1 − e^(−λ·dt) is exactly util.damp per field.
function poseVec() {
  return {
    rootDY: 0,
    offZ: 0,
    pitch: 0,
    roll: 0,
    sx: 1,
    sy: 1,
    sz: 1,
    legFwd: 0,
    legHide: 0,
    walk: 0,
    armFwdL: 0,
    armFwdR: 0,
    armOutL: 0.06,
    armOutR: 0.06,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    earBack: 0,
    eyeOpen: 1,
    tailLift: 0,
    tailCurl: 0.28,
    tailSwish: 1,
    flex: 0,
  };
}
function setPose(o, F) {
  o.rootDY = F.rootDY;
  o.offZ = F.offZ;
  o.pitch = F.pitch;
  o.roll = F.roll;
  o.sx = F.sx;
  o.sy = F.sy;
  o.sz = F.sz;
  o.legFwd = F.legFwd;
  o.legHide = F.legHide;
  o.walk = F.walk;
  o.armFwdL = F.armFwdL;
  o.armFwdR = F.armFwdR;
  o.armOutL = F.armOutL;
  o.armOutR = F.armOutR;
  o.headPitch = F.headPitch;
  o.headYaw = F.headYaw;
  o.headRoll = F.headRoll;
  o.earBack = F.earBack;
  o.eyeOpen = F.eyeOpen;
  o.tailLift = F.tailLift;
  o.tailCurl = F.tailCurl;
  o.tailSwish = F.tailSwish;
  o.flex = F.flex;
}
function dampPose(a, t, f) {
  a.rootDY += (t.rootDY - a.rootDY) * f;
  a.offZ += (t.offZ - a.offZ) * f;
  a.pitch += (t.pitch - a.pitch) * f;
  a.roll += (t.roll - a.roll) * f;
  a.sx += (t.sx - a.sx) * f;
  a.sy += (t.sy - a.sy) * f;
  a.sz += (t.sz - a.sz) * f;
  a.legFwd += (t.legFwd - a.legFwd) * f;
  a.legHide += (t.legHide - a.legHide) * f;
  a.walk += (t.walk - a.walk) * f;
  a.armFwdL += (t.armFwdL - a.armFwdL) * f;
  a.armFwdR += (t.armFwdR - a.armFwdR) * f;
  a.armOutL += (t.armOutL - a.armOutL) * f;
  a.armOutR += (t.armOutR - a.armOutR) * f;
  a.headPitch += (t.headPitch - a.headPitch) * f;
  a.headYaw += (t.headYaw - a.headYaw) * f;
  a.headRoll += (t.headRoll - a.headRoll) * f;
  a.earBack += (t.earBack - a.earBack) * f;
  a.eyeOpen += (t.eyeOpen - a.eyeOpen) * f;
  a.tailLift += (t.tailLift - a.tailLift) * f;
  a.tailCurl += (t.tailCurl - a.tailCurl) * f;
  a.tailSwish += (t.tailSwish - a.tailSwish) * f;
  a.flex += (t.flex - a.flex) * f;
}
const FULL = {};
for (const k in POSES) { const f = poseVec(); for (const q in REST) f[q] = POSES[k][q] !== undefined ? POSES[k][q] : REST[q]; FULL[k] = f; }
const _look = { x: 0, y: 0, z: 0 };

// ── world helpers ────────────────────────────────────────────────────────────
export function pathById(world, id) { return world.PATHS.find((p) => p.id === id); }

function ptOn(world, path, t) { return world.pointOnPolyline(path.points, clamp(t, 0, 1)); }

// ── schedules ────────────────────────────────────────────────────────────────
// Each returns { act, x, z, pose, face, speed, ... }
export const SCHEDULES = {
  clerk(c, h) {
    if (h >= 21.5 || h < 6) return post(c, 'sit', c.face);
    return post(c, h % 2 < 1 ? 'stand' : 'work', c.face);
  },
  gossip(c, h) {
    if (h >= 21 || h < 6.5) return post(c, 'loaf', c.face);
    return post(c, 'sit', c.face);
  },
  shopkeep(c, h) {
    if (h >= 21 || h < 6) return post(c, 'loaf', c.face);
    const s = Math.floor(h * 2 + c.seed * 9) % 6;
    return post(c, s < 3 ? 'work' : s === 3 ? 'sit' : s === 4 ? 'hold' : 'groom', c.face);
  },
  work(c, h) {
    if (h >= 22 || h < 5.5) return post(c, 'sleep', c.face);
    return post(c, 'work', c.face);
  },
  wander(c, h, ctx, S) {
    if (h >= 21.5 || h < 6.5) return post(c, 'loaf', c.face);
    return { act: 'wander', r: 7, pose: 'stand', speed: 1.5 };
  },
  pace(c, h) {
    if (h >= 21.5 || h < 7) return post(c, 'loaf', c.face);
    return { act: 'wander', r: 5, pose: 'work', speed: 1.7 };
  },
  mayor(c, h) {
    if (h >= 21 || h < 6.5) return post(c, 'loaf', c.face);
    if (h >= 8 && h < 12) return post(c, 'wave', c.face);
    if (h >= 15.5 && h < 18) return post(c, 'wave', c.face);
    return post(c, 'stand', c.face);
  },
  officer(c, h, ctx, S) {
    if (h >= 19.5 || h < 5.5) { const m = mark(S, 44, 24); return { act: 'post', x: m.x, z: m.z, pose: 'sit', face: 3.9, speed: 2.3 }; }
    return { act: 'patrol', path: 'cat_main', t0: 0.02, t1: 0.42, speed: 2.0, pose: 'stand' };
  },
  jog(c, h) {
    if (h >= 22 || h < 5.5) return post(c, 'loaf', c.face);
    return { act: 'patrol', path: 'cat_main', t0: 0.08, t1: 0.80, speed: 4.6, pose: 'stand' };
  },
  postcat(c, h) {
    if (h >= 20 || h < 6) return post(c, 'loaf', c.face);
    return { act: 'patrol', path: 'cat_main', t0: 0.12, t1: 0.62, speed: 2.6, pose: 'hold' };
  },
  commuter(c, h) {
    if (h >= 21 || h < 6.5) return post(c, 'loaf', c.face);
    if (h >= 7 && h < 9) return { act: 'patrol', path: 'cat_main', t0: 0.28, t1: 0.72, speed: 1.9, pose: 'hold', once: 1 };
    if (h >= 17 && h < 18.5) return { act: 'patrol', path: 'cat_main', t0: 0.28, t1: 0.72, speed: 1.9, pose: 'hold', once: 1 };
    return post(c, 'hold', c.face);
  },
  musician(c, h) {
    if (h >= 22 || h < 7) return post(c, 'loaf', c.face);
    return post(c, 'fiddle', c.face);
  },
  gym(c, h, ctx, S) {
    if (h >= 23 || h < 5) return post(c, 'sleep', c.face);
    const slot = Math.floor(h * 1.5 + c.seed * 7) % 3;
    return post(c, slot === 0 ? 'lift' : slot === 1 ? 'flex' : 'spot', c.face);
  },
  keeper(c, h, ctx, S) {
    if (h >= 18.3 || h < 6.2) { const m = mark(S, 216.5, 29.5); return { act: 'post', x: m.x, z: m.z, pose: 'stand', face: 1.1, speed: 2.1 }; }
    return post(c, h % 3 < 1.2 ? 'sit' : 'stand', c.face);
  },
  beach(c, h) {
    if (h >= 22 || h < 6) return post(c, 'loaf', c.face);
    return post(c, h % 4 < 2 ? 'sit' : 'point', c.face);
  },
  kitten(c, h, ctx, S) {
    if (h >= 20.5 || h < 7) return post(c, 'sleep', c.face);
    return { act: 'kitten', pose: 'play', speed: 3.4 };
  },
  /** Rusty never leaves the crate under the quay. Rusty has tried leaving. */
  rusty(c, h) {
    const pose = (h >= 23 || h < 6) ? 'loaf' : (Math.floor(h * 1.5 + c.seed * 5) % 5 === 0 ? 'groom' : 'sit');
    return { act: 'post', x: c.home[0], z: c.home[1], pose, face: c.face, speed: 1.6, glide: 1, raised: 1, y: c.seatY };
  },
  watch(c, h) {
    if (h >= 19.6 || h < 5.4) return { act: 'watch', pose: 'watch' };
    if (h >= 13 && h < 17) return post(c, 'loaf', c.face);
    return { act: 'wander', r: 6, pose: 'stand', speed: 1.3 };
  },
};

const post = (c, pose, face, speed) => ({ act: 'post', x: c.home[0], z: c.home[1], pose, face, speed: speed ?? 1.8 });
/** A hard-coded schedule spot, pushed clear of whatever was built on it (S.mark
 *  caches citizens.js's resolveSpot); without S the authored spot is used. */
const _mk = { x: 0, z: 0 };
function mark(S, x, z) {
  if (S && typeof S.mark === 'function') return S.mark(x, z);
  _mk.x = x; _mk.z = z; return _mk;
}

/**
 * What a cat does for the next few seconds after somebody sprays / bats / salts
 * it (see catCitizens.hit). Overrides staging, schedules and beats.
 */
function hitPlan(c, S) {
  // `hold`: react ON THE SPOT, wherever a knockback carries you — the spot is
  // not a mark to walk back to (a bonked cat used to stroll back to where it
  // was standing when the marshmallow landed)
  switch (c.fxKind) {
    case 'stun': case 'spin': case 'bonk':
      return { act: 'post', x: c.x, z: c.z, pose: 'dizzy', face: c.faceDir, hold: 1 };
    case 'stagger': return { act: 'post', x: c.x, z: c.z, pose: 'stagger', face: c.faceDir, hold: 1 };
    // gum: feet glued to a pink puddle
    case 'stuck': return { act: 'post', x: c.x, z: c.z, pose: 'stuck', face: c.faceDir, hold: 1 };
    case 'sulk': return { act: 'post', x: c.x, z: c.z, pose: 'sulk', face: c.faceDir, hold: 1 };
    case 'hiss': {
      const a = Math.atan2(c.fxX - c.x, c.fxZ - c.z);
      return { act: 'post', x: c.x, z: c.z, pose: 'hiss', face: a, hold: 1 };
    }
    case 'panic': {
      // pop rocks: fizzing scatter — away from the pop, zig-zagging, fast
      const a = Math.atan2(c.x - c.fxX, c.z - c.fxZ) + Math.sin(S.elapsed * 3.3 + c.ph * 5) * 1.15;
      return { act: 'post', x: c.x + Math.sin(a) * 6, z: c.z + Math.cos(a) * 6, pose: 'flee', speed: 5.4 };
    }
    default: {
      // flee / scared (invincible visitor): straight away from the source, fast, tail down
      const a = Math.atan2(c.x - c.fxX, c.z - c.fxZ);
      return { act: 'post', x: c.x + Math.sin(a) * 9, z: c.z + Math.cos(a) * 9, pose: 'flee', speed: c.fxKind === 'scared' ? 5.4 : 4.7 };
    }
  }
}

/** Island-wide beats that override a cat's normal day. */
export function globalBeat(c, h, ctx, S) {
  const T = c.tags || {};
  if (T.sprinter && h >= 6.9 && h < 7.95) return { act: 'patrol', path: 'cat_gym', t0: 0.58, t1: 0.99, speed: 6.2, pose: 'stand' };
  if (T.sunbather && h >= 11.6 && h < 13.5) return { act: 'post', x: c.sunSpot[0], z: c.sunSpot[1], pose: 'sunbathe', face: c.face, speed: 1.6, perch: !!c.perch };
  if (T.napper && h >= 14 && h < 15.6) return { act: 'post', x: c.napSpot[0], z: c.napSpot[1], pose: 'sleep', face: c.face, speed: 1.6 };
  if (T.promenade && h >= 18 && h < 19.45) return { act: 'promenade', speed: 1.45, pose: 'stand' };
  if (T.nightwatch && (h >= 19.6 || h < 5.4)) return { act: 'watch', pose: 'watch' };
  return null;
}

// ── steering ─────────────────────────────────────────────────────────────────
/**
 * Nearest point on a solid, and how deep we are inside its personal space.
 * ctx.colliders holds BOTH circles {x,z,r} and oriented boxes {x,z,w,d,rot,box}
 * (see the collision contract in the brief). The brain used to read `o.r` for
 * everything, which is NaN on a box, so every wall, bench, awning post and
 * shopfront on the island was invisible to the citizens and they strolled
 * straight through it. Boxes are reduced to their nearest surface point here.
 */
function solidPush(o, x, z, out) {
  if (o.solid === false) return 1e9;                   // an open door: not there at all
  if (o.box) {
    const dx = x - o.x, dz = z - o.z;
    const cs = Math.cos(o.rot || 0), sn = Math.sin(o.rot || 0);
    const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
    const hx = o.w * 0.5, hz = o.d * 0.5;
    const qx = clamp(lx, -hx, hx), qz = clamp(lz, -hz, hz);
    let ox = lx - qx, oz = lz - qz;
    if (ox === 0 && oz === 0) {                       // inside: exit the near face
      if (hx - Math.abs(lx) < hz - Math.abs(lz)) ox = (lx < 0 ? -1 : 1) * 0.001;
      else oz = (lz < 0 ? -1 : 1) * 0.001;
    }
    out.x = ox * cs - oz * sn; out.z = ox * sn + oz * cs;
    const d = Math.hypot(out.x, out.z);
    if (d > 1e-4) { out.x /= d; out.z /= d; } else { out.x = 0; out.z = 1; }
    return d;                                          // distance to the surface
  }
  if (!(o.r > 0)) return 1e9;
  const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz);
  if (d < 1e-4) { out.x = 0; out.z = 1; return 0; }
  out.x = dx / d; out.z = dz / d;
  return d - o.r;
}
const _push = { x: 0, z: 0 };
const _st = { x: 0, z: 0 };

function step(c, tx, tz, speed, dt, ctx, S) {
  const dx = tx - c.x, dz = tz - c.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.28) { c.moving = false; return true; }
  let ux = dx / d, uz = dz / d;
  // Only the solids near this cat (citizens.js keeps a coarse hash of
  // ctx.colliders with LOW props left out — those are walked ON, not around).
  // Scanning all ~3,800 colliders per walking cat per frame was most of the
  // brain's cost.
  const cols = S && S.solidsNear ? S.solidsNear(c.x, c.z) : ctx.colliders;
  const tiger = c.tigerK > 0.5;
  // A tiger has no marks, prowls everywhere and gets a wide berth round
  // everything. A house cat's marks are authored right up against counters,
  // shopfronts and decks, so walls only ever DEFLECT it (the into-the-wall part
  // of its heading is removed) — they never push it away from where it is
  // going. Near the goal avoidance fades out: the hard pushOut in S.settle is
  // what keeps bodies out of props; steering only keeps them from grinding.
  const padC = tiger ? 1.25 : 0.8;
  const near = Math.min(1, d / 1.6);
  // (the live `solid` rules — a deck's gated rail — are judged by THIS body's
  //  feet, as citizens.js pushAll does: the player's position is lent c.y,
  //  a tiger's 0.4 u higher for its height — citizens.js TIGER_GATE_LIFT)
  const Pl = ctx.systems.player?.position, lend = !!Pl && c.y === c.y && c.y > -1e8 && c.y < 1e8, keepY = lend ? Pl.y : 0;
  if (lend) Pl.y = c.y + (tiger ? 0.4 : 0);
  try {
  if (cols) for (let i = 0; i < cols.length; i++) {
    const o = cols[i];
    if (!S?.solidsNear && S?.isLow && S.isLow(o)) continue;
    const gap = solidPush(o, c.x, c.z, _push);
    if (o.box && !tiger) {
      const pad = 0.5 + (c.rad || 0.3);
      if (gap < pad) {
        const dn = ux * _push.x + uz * _push.z;
        if (dn < 0) { const k = Math.min(1, (pad - Math.max(gap, 0)) / pad * 1.7); ux -= dn * _push.x * k; uz -= dn * _push.z * k; }
      }
      continue;
    }
    if (gap < padC) { const w = (padC - Math.max(gap, 0)) / padC * 2.2 * near; ux += _push.x * w; uz += _push.z * w; }
  }
  } finally { if (lend) Pl.y = keepY; }
  // one tiger ahead in its lane (a narrow passage, a pack on the move): step
  // aside early — head-on, both keep to their right — instead of meeting nose
  // to nose and shoving until the watchdog sits one of them down
  if (tiger && S && S.tigerSteer) {
    const l0 = Math.hypot(ux, uz) || 1; _st.x = ux / l0; _st.z = uz / l0;
    S.tigerSteer(c, _st); ux = _st.x; uz = _st.z;
  }
  // personal space from the player. A house cat edges away inside 1.5 u. A
  // tiger (unless it is springing at him) WALKS ROUND him inside TIGER_PS:
  // the part of its heading that points at him turns into a sidestep, on the
  // side its goal lies — so a prowler bound for the far end of Main Street
  // passes him at arm's length instead of shouldering through (or, with the
  // hard exclusion in citizens.js, walking in place against it).
  const p = ctx.systems.player?.position;
  if (p && !tiger) { const ox = c.x - p.x, oz = c.z - p.z; const od = Math.hypot(ox, oz); if (od < 1.5 && od > 1e-3) { ux += ox / od * 1.4; uz += oz / od * 1.4; } }
  else if (p && tiger && !(c.plan && (c.plan.spring || c.plan.catch)) && !c.carryTo) {
    const ox = c.x - p.x, oz = c.z - p.z, od = Math.hypot(ox, oz);
    if (od < TIGER_PS && od > 1e-3) {
      const nx = ox / od, nz = oz / od, dn = ux * nx + uz * nz;
      if (dn < 0) {
        let tx = -nz, tz = nx; const along = tx * ux + tz * uz;
        if (along < 0 || (Math.abs(along) < 0.05 && c.seed < 0.5)) { tx = -tx; tz = -tz; }
        ux += -dn * nx + tx * -dn; uz += -dn * nz + tz * -dn;
      }
      if (od < 2.8) { const w = (2.8 - od) / 2.8 * 0.8; ux += nx * w; uz += nz * w; }
    }
  }
  const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
  const s = Math.min(speed * dt, d);
  const nx = c.x + ux * s, nz = c.z + uz * s;
  if (ctx.world.height(nx, nz) > 0.35) { c.x = nx; c.z = nz; }
  else { c.x += uz * s * 0.6; c.z -= ux * s * 0.6; }  // slide along the shore
  c.faceDir = Math.atan2(ux, uz);
  c.moving = true;
  c.gaitSpeed = speed;
  return false;
}

/** True once this cat has been blocked long enough on its way to (x,z) to give
 *  up and idle where it stands (S.settle counts the blocked time). */
const gaveUp = (c, x, z) => c.giveX === x && c.giveZ === z;

// ── per-cat update ───────────────────────────────────────────────────────────
export function updateCat(c, dt, ctx, S) {
  const h = ctx.state.time;
  const world = ctx.world;

  // 1. decide -----------------------------------------------------------------
  c.think -= dt;
  if (c.think <= 0) {
    c.think = c.tigerK > 0.5 ? 0.12 : 0.35 + c.seed * 0.4;
    let plan = null;
    // a scripted beat owns the cat outright (citizens/carry.js: the carrier on
    // its rail, the escort, the cat asleep on the visitor's feet at dawn)
    if (c.scriptPlan) plan = c.scriptPlan;
    // after dark the tiger brain owns the cat completely
    if (!plan && c.tigerK > 0.55 && S.tigerPlan) plan = S.tigerPlan(c, h, ctx, S);
    if (!plan && c.fxUntil > S.elapsed) plan = hitPlan(c, S);
    if (!plan && c.talkUntil > S.elapsed) plan = { act: 'talk', pose: c.talkPose || 'stand' };
    // authored social staging wins: pairs, queues, the gym crew, the night watch
    if (!plan && S.stage) plan = S.stage(c, h, S.elapsed);
    if (!plan) plan = globalBeat(c, h, ctx, S);
    if (!plan && c.tags?.curious && S.playerNear(c, 22) && h > 7 && h < 20) plan = { act: 'shadow', pose: 'stand', speed: 2.6 };
    if (!plan) plan = (SCHEDULES[c.sched] || SCHEDULES.wander)(c, h, ctx, S);
    c.plan = plan;
  }
  const plan = c.plan || { act: 'post', x: c.home[0], z: c.home[1], pose: 'stand' };
  let pose = plan.pose || 'stand';
  c.moving = false;
  if (!plan.perch) c.onPerch = false;
  // on a bench / deck / pavement slab the body must never drop below the surface
  c.noSink = !!(plan.perch || plan.raised);
  c.lookKey = plan.look || null;

  // 2. act --------------------------------------------------------------------
  // (every move below is only a proposal: S.settle resolves it against the
  //  solids and puts the feet on the ground before the rig is posed)
  const bump = c.bumped && S.elapsed >= (c.bumpCool || 0);
  if (bump) c.bumpCool = S.elapsed + 1.1;
  switch (plan.act) {
    case 'talk': {
      const p = ctx.systems.player.position;
      c.faceDir = Math.atan2(p.x - c.x, p.z - c.z);
      break;
    }
    case 'post': {
      if (plan.hold) { if (plan.face !== undefined) c.faceDir = plan.face; break; }
      // blocked for too long on the way here: stop pushing, idle where we are
      if (gaveUp(c, plan.x, plan.z)) { if (plan.face !== undefined) c.faceDir = plan.face; break; }
      // Sunbathers claim a real rooftop / sill / bench and staged cats claim an
      // authored mark: once close enough they glide onto it (S.settle lets a
      // cat bound for a raised mark climb onto the prop it touches).
      if (plan.perch || plan.glide) {
        const d = Math.hypot(plan.x - c.x, plan.z - c.z);
        if (d < 5.5) {
          // (arrive EXACTLY: an endless asymptotic creep would count as a move
          //  every frame and re-run the collision resolve for nothing)
          if (d < 0.03) { c.x = plan.x; c.z = plan.z; }
          else { const k = Math.min(1, dt * 3.0); c.x += (plan.x - c.x) * k; c.z += (plan.z - c.z) * k; }
          c.onPerch = !!plan.perch && d < 1.4;
          if (d > 0.45) { c.moving = true; pose = 'stand'; c.faceDir = Math.atan2(plan.x - c.x, plan.z - c.z); }
          else if (plan.face !== undefined) c.faceDir = plan.face;
          break;
        }
      }
      c.onPerch = false;
      const done = step(c, plan.x, plan.z, plan.speed ?? 1.8, dt, ctx, S);
      if (done) { if (plan.face !== undefined) c.faceDir = plan.face; }
      else if (!(c.tigerK > 0.5) && pose !== 'flee') pose = 'stand';   // prowl/stalk/rush ARE walks; so is running away
      break;
    }
    case 'wander': {
      // bumped into something: turn around — a fresh target on the far side
      // of the push, so the cat walks AWAY from the prop it just met
      if (bump && !c.wIdle) {
        const a = Math.atan2(c.bnx || 0, c.bnz || 1) + (S.rand() - 0.5) * 1.7;
        const r = 2 + S.rand() * 3;
        c.wx = c.x + Math.sin(a) * r; c.wz = c.z + Math.cos(a) * r;
        c.wanderT = 2 + S.rand() * 3;
      }
      if (!c.wanderT || c.wanderT <= 0) {
        c.wanderT = 3 + S.rand() * 6;
        const a = S.rand() * TAU, r = S.rand() * (plan.r || 6);
        c.wx = c.home[0] + Math.cos(a) * r; c.wz = c.home[1] + Math.sin(a) * r;
        c.wIdle = S.rand() < 0.45;
      }
      c.wanderT -= dt;
      if (c.wIdle) { pose = c.idlePose; }
      else { const done = step(c, c.wx, c.wz, plan.speed ?? 1.5, dt, ctx, S); if (!done) pose = 'stand'; else pose = c.idlePose; }
      break;
    }
    case 'patrol': case 'promenade': {
      const path = pathById(world, plan.path || 'cat_main');
      const t0 = plan.t0 ?? 0.2, t1 = plan.t1 ?? 0.8;
      if (c.pathT === undefined || c.pathId !== (plan.path || 'cat_main')) { c.pathId = plan.path || 'cat_main'; c.pathT = t0 + (t1 - t0) * c.seed; c.pathDir = c.seed > 0.5 ? 1 : -1; }
      // bumped: first try the other side of the street, and if that is
      // blocked too inside a few seconds, turn round and walk back
      if (bump) {
        if (S.elapsed - (c.laneSwapAt ?? -99) < 3.5) { c.pathDir = -(c.pathDir || 1); c.laneSwapAt = -99; }
        else { c.lane = c.lane > 0 ? -0.9 : 0.9; c.laneSwapAt = S.elapsed; }
      }
      const sp = plan.speed ?? 1.6;
      c.pathT += c.pathDir * sp * dt * 0.0045;
      if (c.pathT > t1) { c.pathT = t1; c.pathDir = -1; }
      if (c.pathT < t0) { c.pathT = t0; c.pathDir = 1; }
      const q = ptOn(world, path, c.pathT);
      step(c, q.x + c.lane, q.z + c.lane * 0.4, sp * 1.4, dt, ctx, S);
      if (sp > 3.4) pose = 'stand';
      break;
    }
    case 'sprint': break;
    case 'rail': {
      // the body is moved along its route by citizens/carry.js (x, z set
      // before this runs); the plan only says how it looks doing it
      c.moving = !!plan.moving;
      if (plan.face !== undefined) c.faceDir = plan.face;
      if (plan.speed) c.gaitSpeed = plan.speed;
      break;
    }
    case 'kitten': {
      // A proper game of tag: every kitten runs the same ring at the same speed,
      // staggered by index, so they chase each other's tails in a line.
      const hub = S.kittenHub;
      const R = 2.8 + (c.kitIdx % 2) * 1.5;
      const a = S.elapsed * 1.15 - (c.kitIdx || 0) * 0.62;
      const tx = hub.x + Math.cos(a) * R, tz = hub.z + Math.sin(a) * R;
      step(c, tx, tz, plan.speed ?? 3.4, dt, ctx, S);
      if (c.moving) pose = 'chase';
      break;
    }
    case 'shadow': {
      const p = ctx.systems.player.position;
      const toCat = Math.atan2(c.x - p.x, c.z - p.z);
      const seen = Math.cos(wrapPi(toCat - (ctx.systems.player.facing || 0))) > 0.55;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (seen) { pose = c.seed < 0.5 ? 'groom' : 'sit'; c.faceDir = toCat + Math.PI * 0.55; c.busted = 1; }
      else if (d > 6.5) { step(c, p.x, p.z, plan.speed ?? 2.6, dt, ctx, S); c.busted = 0; }
      else { c.faceDir = Math.atan2(p.x - c.x, p.z - c.z); pose = 'stand'; }
      break;
    }
    case 'watch': {
      const p = ctx.systems.player?.position;
      const done = gaveUp(c, c.home[0], c.home[1]) || step(c, c.home[0], c.home[1], 1.9, dt, ctx, S);
      if (done && p) c.faceDir = Math.atan2(p.x - c.x, p.z - c.z);
      if (!done) pose = 'stand';
      break;
    }
  }

  // boomerang: spun on the spot, winding down (animate skips the yaw damping)
  c.spinning = c.fxKind === 'spin' && c.fxUntil > S.elapsed;

  // 3. settle: resolve against solids, feet on the ground (citizens.js) ------
  if (S.settle) S.settle(c, dt, plan);

  // idle flavour: swap in sit/groom/stretch now and then when just standing
  if (pose === 'stand' && !c.moving) {
    c.idleT -= dt;
    if (c.idleT <= 0) { c.idleT = 4 + S.rand() * 9; c.idlePose = S.pick(c.idleSet); }
    pose = c.idlePose;
  } else if (pose === 'stand') { c.idleT = Math.min(c.idleT, 1.2); c.idlePose = 'stand'; }

  c.pose = pose;
  animate(c, dt, ctx, S);
}

// ── animation ────────────────────────────────────────────────────────────────
function animate(c, dt, ctx, S) {
  const r = c.rig;
  let a = c.a, t = c.t;
  if (!t || t.flex === undefined) t = c.t = poseVec();
  if (!a || a.flex === undefined) { a = c.a = poseVec(); c.aSnap = true; }   // (citizens.js resets c.a = {} to snap)
  const el = S.elapsed;
  setPose(t, FULL[c.pose] || FULL.stand);

  // walking overlay
  const walking = c.moving ? 1 : 0;
  t.walk = walking;
  if (walking) { t.legHide = 0; t.rootDY = Math.max(t.rootDY, 0); }
  c.gait += dt * (walking ? 3.1 + (c.gaitSpeed || 1.8) * 1.55 : 0);

  // pose-specific cycles
  if (c.pose === 'wave') { t.armFwdR = -2.05 - Math.sin(el * 5.6 + c.ph) * 0.22; t.armOutR = 0.9 + Math.sin(el * 5.6 + c.ph) * 0.28; }
  if (c.pose === 'lift') { const s = Math.sin(el * 2.4 + c.ph); t.armFwdL = -1.0 - s * 1.15; t.armFwdR = -1.0 - s * 1.15; t.rootDY = -0.05 + s * 0.05; t.sy = 1 + s * 0.04; }
  if (c.pose === 'press') { const s = Math.sin(el * 1.9 + c.ph); t.armFwdL = -2.15 - s * 0.55; t.armFwdR = -2.15 - s * 0.55; t.rootDY = -0.04 - Math.max(0, -s) * 0.06; t.flex = 0.7 + s * 0.3; }
  if (c.pose === 'chat') { t.armFwdR = -0.85 + Math.sin(el * 3.4 + c.ph) * 0.45; t.headPitch = -0.05 + Math.sin(el * 2.2 + c.ph) * 0.09; }
  if (c.pose === 'gossip') { t.armFwdL = -0.62 + Math.sin(el * 3.8 + c.ph) * 0.30; t.headYaw = Math.sin(el * 1.7 + c.ph) * 0.16; t.headPitch = -0.04 + Math.sin(el * 3.8 + c.ph) * 0.07; }
  if (c.pose === 'queue') { t.headYaw = Math.sin(el * 0.7 + c.ph) * 0.22; t.rootDY = Math.abs(Math.sin(el * 0.9 + c.ph)) * 0.02; }
  if (c.pose === 'hoist') { t.armFwdR = -1.2 + Math.sin(el * 1.1 + c.ph) * 0.12; }
  if (c.pose === 'flex') { const s = Math.sin(el * 1.6 + c.ph); t.armOutL = 1.34 + s * 0.14; t.armOutR = 1.34 + s * 0.14; t.flex = 0.8 + s * 0.4; t.headYaw = Math.sin(el * 0.8 + c.ph) * 0.22; }
  if (c.pose === 'spot') { const s = Math.sin(el * 2.1 + c.ph); t.armFwdL = -1.45 - s * 0.3; t.armFwdR = -1.45 - s * 0.3; t.rootDY = -0.02 - Math.abs(s) * 0.06; }
  if (c.pose === 'curl') {
    const s = Math.sin(el * 1.7 + c.ph);
    t.armFwdR = -1.15 - s * 1.15; t.armFwdL = -1.15 + s * 1.15;
    t.flex = 0.45 + Math.abs(s) * 0.55; t.headPitch = -0.05 - s * 0.06;
    t.sx = 1.03 + Math.abs(s) * 0.03;
  }
  if (c.pose === 'nip') {
    const s = Math.sin(el * 0.85 + c.ph);
    t.roll = 0.30 * s; t.headRoll = 0.28 * s; t.headYaw = 0.22 * Math.sin(el * 0.55 + c.ph);
    t.armFwdL = 1.80 + Math.sin(el * 1.5 + c.ph) * 0.28;
    t.armFwdR = 1.80 + Math.sin(el * 1.5 + c.ph + 2.1) * 0.28;
    t.legFwd = -0.92 + Math.sin(el * 1.2 + c.ph + 1.1) * 0.20;
  }
  if (c.pose === 'squat') {
    const s = Math.max(0, Math.sin(el * 1.45 + c.ph));
    t.rootDY = -0.10 - s * 0.34; t.legFwd = 0.22 + s * 0.74; t.pitch = 0.10 + s * 0.26;
    t.sy = 0.97 - s * 0.09; t.flex = 0.4 + s * 0.6; t.headPitch = -0.24 - s * 0.10;
  }
  if (c.pose === 'fiddle') { t.armFwdR = -1.0 + Math.sin(el * 7.5 + c.ph) * 0.42; t.headRoll = 0.3 + Math.sin(el * 2.2) * 0.06; }
  if (c.pose === 'work') { t.armFwdL = -0.5 + Math.sin(el * 3.1 + c.ph) * 0.35; t.armFwdR = -0.55 + Math.sin(el * 3.1 + c.ph + 1.9) * 0.35; }
  if (c.pose === 'play') { t.rootDY = Math.abs(Math.sin(el * 6 + c.ph)) * 0.10; }
  if (c.pose === 'point') { t.armFwdR = -1.45 + Math.sin(el * 1.1 + c.ph) * 0.22; t.headYaw = Math.sin(el * 0.6 + c.ph) * 0.35; }
  if (c.pose === 'dizzy') { t.headRoll = 0.30 * Math.sin(el * 7.0 + c.ph); t.headYaw = 0.26 * Math.sin(el * 4.4 + c.ph); t.roll = 0.10 * Math.sin(el * 5.0); }
  if (c.pose === 'flee') { t.headYaw = Math.sin(el * 2.6 + c.ph) * 0.34; t.tailSwish = 0.5 + Math.abs(Math.sin(el * 4)) * 0.3; }
  if (c.pose === 'hiss') { const s = Math.abs(Math.sin(el * 9 + c.ph)); t.sx = 1.12 + s * 0.06; t.headPitch = -0.14 - s * 0.06; }
  if (c.pose === 'stagger') { t.roll = 0.24 * Math.sin(el * 6.5 + c.ph); t.headRoll = -0.3 * Math.sin(el * 6.5 + c.ph + 0.8); t.pitch = -0.14 + 0.08 * Math.sin(el * 4.1); }
  if (c.pose === 'stuck') { const s = Math.sin(el * 11 + c.ph); t.roll = 0.10 * s; t.pitch = 0.22 + 0.06 * Math.abs(s); t.armFwdL = -1.25 + s * 0.35; t.armFwdR = -1.25 - s * 0.35; }

  // breathing
  const breath = Math.sin(el * (c.pose === 'sleep' || c.pose === 'loaf' ? 1.1 : 2.0) + c.ph);
  t.sy *= 1 + breath * (c.pose === 'sleep' ? 0.045 : 0.014);
  t.sx *= 1 - breath * 0.008;

  // Look at the cat you are talking to, otherwise at the player when close.
  // Clamped gently: a full 50° head turn hides the face from the camera, and the
  // face is the whole point.
  let look = null;
  if (c.lookKey && S.byKey) { const o = S.byKey(c.lookKey); if (o) { look = _look; _look.x = o.x; _look.y = o.y + 1.15 * (o.spec?.size ?? 1); _look.z = o.z; } }
  if (!look) look = c.lookAt;
  if (look) {
    const want = wrapPi(Math.atan2(look.x - c.x, look.z - c.z) - c.yaw);
    // past ~70° a cat would turn its whole body, not its neck — and a head
    // twisted that far hides the face from the camera entirely.
    if (Math.abs(want) < 1.25) {
      t.headYaw += clamp(want, -0.62, 0.62) * 0.7;
      t.headPitch -= clamp((look.y - (c.y + 1.2)) * 0.3, -0.3, 0.35);
    }
  } else if (!c.moving && c.tigerK < 0.5 && c.pose !== 'sleep' && c.pose !== 'loaf' && c.pose !== 'sunbathe') {
    // THE CAMERA IS ALWAYS ABOVE AND BEHIND. At the game's own pitch (0.64 rad)
    // a cat looking straight ahead shows the camera the top of its skull and
    // nothing else, so an idle citizen drifts its head a few degrees toward
    // whoever is watching and lifts its chin. Small — this is a glance, not a
    // stare, and it must never fight an authored `look`.
    const cam = ctx.camera;
    if (cam) {
      const want = wrapPi(Math.atan2(cam.position.x - c.x, cam.position.z - c.z) - c.yaw);
      const gaze = 0.50 + 0.10 * Math.sin(el * 0.37 + c.ph);
      t.headYaw += clamp(want, -0.62, 0.62) * gaze;
      t.headPitch -= 0.20;
    }
  }

  // never let a pose sink the body through a bench seat / deck / pavement slab
  if (c.noSink) { t.rootDY = Math.max(t.rootDY, 0); t.offZ = Math.min(t.offZ, 0.18); }

  // damp everything (first frame snaps, so nothing starts as NaN)
  const L = 9;
  if (c.aSnap !== false) { setPose(a, t); c.aSnap = false; } else dampPose(a, t, 1 - Math.exp(-L * dt));

  // ── apply ──
  const groundY = c.y;
  const bob = (c.moving ? Math.abs(Math.sin(c.gait)) * 0.045 : 0) + (c.air || 0);
  // (yawLock: S.settle found that the turn it was about to make would put a
  //  tiger's head or haunches into a wall, and chose this heading instead)
  if (c.yawLock !== undefined) { c.yaw = wrapPi(c.yawLock); c.yawLock = undefined; if (c.spinning) c.faceDir = c.yaw; }
  else if (c.spinning) { c.yaw = wrapPi(c.yaw + dt * (6 + 14 * clamp((c.fxUntil - el) / 1.4, 0, 1))); c.faceDir = c.yaw; }
  else c.yaw = dampAngle(c.yaw, c.faceDir, c.moving ? 7 : 5, dt);
  r.root.rotation.set(a.pitch, c.yaw, a.roll, 'YXZ');
  r.root.position.set(c.x + Math.sin(c.yaw) * a.offZ, groundY + a.rootDY + bob, c.z + Math.cos(c.yaw) * a.offZ);

  const bb = c.bodyBase;
  r.bodyMesh.scale.set(bb.x * a.sx, bb.y * a.sy, bb.z * a.sz);
  r.torso.rotation.x = a.pitch * -0.15 + (c.moving ? Math.sin(c.gait * 2) * 0.03 : 0);
  r.torso.rotation.z = c.moving ? Math.sin(c.gait) * 0.045 : 0;

  const swing = Math.sin(c.gait) * 0.72 * a.walk;
  r.legL.rotation.x = a.legFwd + swing;
  r.legR.rotation.x = a.legFwd - swing;
  r.armL.rotation.x = a.armFwdL - swing * 0.55;
  r.armR.rotation.x = a.armFwdR + swing * 0.55;
  r.armL.rotation.z = -a.armOutL;
  r.armR.rotation.z = a.armOutR;

  const hide = 1 - a.legHide * 0.96;
  const lb = c.limbBase;
  r.legL.userData.mesh.scale.set(lb[0].x, lb[0].y * hide, lb[0].z);
  r.legR.userData.mesh.scale.set(lb[1].x, lb[1].y * hide, lb[1].z);

  r.headPivot.rotation.set(a.headPitch, a.headYaw, a.headRoll);

  // ears: idle flicks
  c.flickT -= dt;
  if (c.flickT <= 0) { c.flickT = 2.5 + S.rand() * 6; c.flick = 0.35; }
  c.flick = Math.max(0, c.flick - dt * 2.2);
  r.earL.rotation.x = -0.10 - a.earBack + c.flick * 0.9;
  r.earR.rotation.x = -0.10 - a.earBack;
  r.earL.rotation.z = 0.22 + a.earBack * 0.6;
  r.earR.rotation.z = -0.22 - a.earBack * 0.6;

  // eyes: blink + night dilation
  c.blinkT -= dt;
  if (c.blinkT <= 0) { c.blinkT = 2.2 + S.rand() * 5.5; c.blink = 0.18; }
  let open = a.eyeOpen;
  if (c.blink > 0) { c.blink -= dt; open *= smoothstep(0, 0.06, Math.abs(c.blink - 0.09)); }
  open = clamp(open, 0.02, 1.15);
  const ES = r.eyeS || [0.95, 1, 0.55], PS = r.pupS || [1, 1.02, 1];
  r.eyeL.scale.set(ES[0], ES[1] * open, ES[2]); r.eyeR.scale.set(ES[0], ES[1] * open, ES[2]);
  const slit = lerp(0.26, 0.96, 1 - ctx.state.daylight) * PS[0];
  const pz = lerp(0.34, 0.50, 1 - ctx.state.daylight) * PS[2];
  r.pupL.scale.set(slit, open * PS[1], pz); r.pupR.scale.set(slit, open * PS[1], pz);

  // tail
  const ts = a.tailSwish;
  r.tailBase.rotation.x = TAIL_REST + a.tailLift;
  r.tailBase.rotation.z = Math.sin(el * 2.0 + c.ph) * 0.32 * ts;
  for (let i = 1; i < r.tailSegs.length; i++) {
    const s = r.tailSegs[i];
    s.rotation.x = a.tailCurl * (i === 1 ? 1 : 0.85);
    s.rotation.z = Math.sin(el * 2.0 - i * 0.7 + c.ph) * 0.20 * ts;
  }

  // buff bulk pulse
  if (r.delts) {
    const f = 1 + a.flex * 0.22 + Math.sin(el * 3.1 + c.ph) * 0.02;
    r.delts[0].scale.setScalar(1.12 * f); r.delts[1].scale.setScalar(1.12 * f);
    r.delts[2].scale.setScalar(0.80 * (1 + a.flex * 0.46));
    r.delts[3].scale.setScalar(0.80 * (1 + a.flex * 0.46));
    if (r.fores) { const g = 0.62 * (1 + a.flex * 0.30); r.fores[0].scale.setScalar(g); r.fores[1].scale.setScalar(g); }
  }
  if (r.bow) r.bow.rotation.z = 0.25 + (c.pose === 'fiddle' ? Math.sin(el * 7.5 + c.ph) * 0.3 : 0);

  // ── and after dark, all of that is packed away and something else stands up ─
  if (r.tiger) applyTiger(c, smoothstep(0, 1, c.tigerK), el, dt, ctx);

  r.root.updateMatrixWorld(true);
}

export { wrapPi, solidPush, step, dampAngle };
