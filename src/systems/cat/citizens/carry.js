// ─────────────────────────────────────────────────────────────────────────────
// BEDTIME — the scruff-carry as ONE continuous cinematic (docs/BRIEF.md
// Contract N). Not death: bedtime. The visitor never leaves the jaws until the
// lights are out.
//
//   1. CATCH   (0.9 s)  pounce contact, a shake, “Got you. Come on. Bed.”, and
//                       he goes limp in the scruff (knees up, a little swing).
//   2. CARRY   (6–14 s) the tiger walks the REAL way to the guest house at
//                       4.2 u/s — a route pulled out of the tigers' own flow
//                       field (citizens/nav.js), corners rounded, every frame
//                       through settle() (Contract A: pushOut + groundInfo) —
//                       no timeout. The lens rides one long cinematic on the
//                       jaws (11 → 9 u, elevation 0.32, a slow orbit ≤ 30°);
//                       the two nearest tigers fall in behind: the escort.
//                       A walk longer than LONG_L gets ONE dip to black
//                       (“later”) to LONG_LEFT u from the door — still in the
//                       jaws, both of them moved along the route together.
//                       After the rainbow bridge the raid (citizens/raid.js)
//                       carries him over the arc and hands its carrier over
//                       here at the Cat end (fromRaid): the same dip, the same
//                       last stretch.
//   3. ARRIVAL (≈ 2.5 s) at the guest house door it pauses, the door opens
//                       (catArchitecture.openDoor('guest')), and it walks him
//                       in to the bedside (catContainment.spots.bed, the
//                       house's 'guest' room for the frame of reference).
//   4. TUCK    (2.6 s)  the 'tuck' pose (tiger.js): head right down over the
//                       pillow; he slides from the jaws onto it, lying back,
//                       and the blanket comes up — one bent quad, one draw
//                       call, only while it is needed. A purr.
//   5. LIGHTS OUT (1.2 s) the bedside lamp (one of the NPCs' two PointLights,
//                       borrowed) dims and the screen fades to black WITH him
//                       still in bed; only once the fade is full: 06:00.
//   6. WAKE-UP (3.6 s)  he sits up in bed at dawn, a cat asleep on his feet,
//                       “You slept. Everyone is very glad.” Then he is his own
//                       again, standing at the bedside (endCarry restores
//                       every player field this touched).
//
// Skip: any key / click after CATCH → a 0.6-s fade, and in the dark he is put
// straight into bed (LIGHTS OUT), still never dropped. Paused (ctx.state
// .paused): every clock here stops and he stays exactly where he hangs.
// Deterministic: no randomness; the route is a BFS over the colliders.
//
// API (catCitizens.carry): active · stage · carrier · grip · mouth · gripErr ·
//   maxGripErr · route · stats() · skip() · debug(o) (see there)
// Events: 'cats:carry' { stage, raid }  (catch · carry · cut · arrive · tuck ·
//   dark · wake · done)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { clamp, smoothstep } from '../../../core/util.js';
import { tigerScale } from './tiger.js';
import { TP, tigerEyeHex } from './tigerrig.js';
import { dampAngle, wrapPi } from './brain.js';

const SPEED = 4.2;              // u/s: the carry (Contract N)
const GAIT_K = SPEED / 3.4;     // the 'carry' pose's cadence was drawn for 3.4 u/s
const CATCH_SECS = 0.9;
const LONG_L = 52;              // a walk longer than this (≈ 12 s) gets one edit…
const LONG_AT = 5.0;            // …this far into it…
const LONG_LEFT = 30;           // …to this far (≈ 7 s) from the doorstep
const CUT_DIP = 0.45, CUT_LIFT = 0.6;
const DOOR_OUT = 2.6;           // the doorstep: this far out of the door, on its axis
const DOOR_EARLY = 5.5;         // the door swings open this far (u) before they reach the step
const APPROACH_OUT = 3.6, APPROACH_ANG = 0.75;   // the walk's last leg: up the path to the step from this far out, ≤ this far off the door's axis
const IN_SPEED = 3.6;           // u/s up the step and in through the door
const TUCK_SECS = 3.2, REL0 = 0, REL1 = 1.45, BLANKET0 = 1.1, BLANKET1 = 2.2;
const TUCK_IN = 0.8;            // the cut into the room opens this far into the tuck (him mid-way onto the pillow)
const DARK_SECS = 1.2;
const WAKE_SECS = 3.8;
const SKIP_FADE = 0.6;
const CAM_D0 = 11, CAM_D1 = 9, CAM_EL = 0.32, CAM_EL_CATCH = 0.5, ORBIT_MAX = 30 * Math.PI / 180;
// the carry's lens rides BESIDE them — a side profile, a touch ahead of it
// (CAM_FRONT off the heading: the jaws on his collar, his legs dangling under
// its chin, read from the side; from the front he covered its mouth and sat
// on its chest, and its whiskers grew out of his head), drifting round to
// square-on (CAM_FRONT + ORBIT_DRIFT, within ORBIT_MAX) over the walk, turning
// with the route at a walk
const CAM_FRONT = 1.2, ORBIT_DRIFT = 0.36, CAM_TURN = 0.8;
// he is turned this far from profile TOWARD the lens (his face 3/4 on to it)
const TURN_IN = 0.45;
// Framing knobs (debug: catCitizens.carry.tune). kitten: after the catch's
// kick he hangs limp with his knees tucked up, a scruffed kitten (the raid's
// hang over the rainbow) — legs straight down read as a man standing beside
// the tiger. door*: the doorstep shot (off the door's axis, elevation,
// distance, how far the aim leans to the door).
// wake*: the dawn shot (off the bed's axis toward the window side,
// elevation, max distance — clamped inside the room —, aim along the bed and
// up); sleepY: the sleeper's loaf over the blanket top.
const TUNE = { kitten: true, doorOff: 1.2, doorEl: 0.28, doorDist: 13, doorFocus: 0.5, wakeOff: 0.95, wakeEl: 0.38, wakeDist: 6.8, wakeAt: -0.17, wakeY: 1.75, sleepY: -0.1 };
const NECK = 1.24, NECK_BACK = 0.10;            // his collar, from his feet (player/visitor.js)
// His body's box in its own frame (feet at the origin, facing +z), per riding
// pose, measured off the skinned mesh (player/visitor.js: 44k vertices — far
// too many to bound every frame): [x0, y0, z0, x1, y1, z1]. Its eight corners,
// turned with him, are how low he reaches — the ground and the bed are kept
// out of every one (clearance()). 'flail' is padded: the kick moves.
const PBOX = {
  sit: [-0.57, 0.14, -0.44, 0.58, 1.89, 0.56],     // knees up (the scruffed kitten)
  stand: [-0.58, 0.02, -0.44, 0.58, 1.97, 0.39],   // legs straight (lying in bed)
  flail: [-0.64, -0.08, -0.44, 0.66, 1.93, 0.66],  // the startled kick
};
const HEEL_CAP = 0.42;                          // the most the catch may hold his heels up off the jaws
const FLOOR_CLEAR = 0.02;
const FLAIL_SECS = 0.55;                        // the catch: a startled kick, then limp
const CATCH_HEAD = 0.35, CATCH_HEAD_RATE = 30;  // the catch: the carrier's head comes up this fast, this long
// the catch's push-in from the gameplay lens: quick — a 0.7-s ease carried
// the lens through the street's awnings and roofs on its way down to him
const CATCH_IN = 0.22;
const TWIST = 0.7;                              // his body turned toward profile for the carry lens
const MAXP = 480;                               // route points (after rounding: ≤ 5 per corner)
const LAMP_ON = 7.5;                            // the bedside lamp's borrowed PointLight
const ESCORT_GAP = 4.4;
// THE DOORSTEP is a TRIPOD OUTSIDE, side on to the door (pickDoorTripod:
// every framing round it scored from where its lens would stand — the step,
// him going in, the last of the walk up to it): the shot cuts to it this far
// out, and its lens holds while the tiger walks up the step and ducks in
// through the lit doorway with him hanging from its jaws. THE ROOM's tripod
// (pickRoomTripod) is the tuck, cut to as he goes through the doorway. The
// camera never crosses the door (from behind the open leaf it filmed a
// near-black slab for the payoff of the whole carry).
const APPROACH_L = 7.5, DOOR_LEAD = 13;
const LENS_RAYS_T = 24;                         // rays a frame for the tripod searches

// the bed, as containment/scenery.js draws it (y above the room's floor)
const MATTRESS = 0.855, BLANKET_TOP = 1.07;
const BED_HALF = 1.5, BED_HALF_W = 1.0;         // along its axis (3.0 long) · across it (the frame, 2.0)
// lying in it he sinks into the mattress this far (his back; the blanket and
// the made-up bed cover it) — the tuck lowers him onto the bed no deeper
const LIE_SINK = 0.32;
const WAKE_GRACE = 0.6;                         // the wake-up: a held key only gets him up after this

const LINE_CATCH = '“Got you. Come on. Bed.”';
const LINES_CARRY = ['“Shh. Everyone’s asleep. Nearly everyone.”', '“You were outside. At NIGHT. Imagine.”', '“Nearly home. Your room is ready. It always was.”'];
const LINE_TUCK = '“There. Tucked in. Nobody gets out of tucked in.”';
const LINE_WAKE = 'You slept. Everyone is very glad.';

export function createBedtime(ctx, H) {
  const { world } = ctx;
  const S = H.S;
  const pl = () => ctx.systems.player;
  const ui = () => ctx.systems.ui;
  const cam = () => ctx.systems.camera;

  // ── state ──────────────────────────────────────────────────────────────────
  const B = {
    on: false, stage: null, t: 0, age: 0, cat: null, raid: false, name: null,
    keepTiger: false, escort: [], sleeper: null, sleepUntil: 0,
    mode: 'hang', k: 1, tuckU: 0, blanket: 0, blanketLen: 2.05,
    s: 0, cut: null, skip: null, lines: 0, black: false, fadeReq: 0,
    o: null, cine: null, az0: 0, camAz: 0, side: 0, camD: CAM_D0,
    gripErr: 0, maxGripErr: 0, frames: 0, lampK: 0, lampWant: 0,
    routeOK: false, routeTries: 0, arriveI: 0, doorOpen: false,
    savedFacing: 0, pDown: false, lastStage: null, fadeDir: 0, fadeT: 0, fadeDur: 0,
    win: [0, 0, 0, 0], clock: 0,
  };
  // the grip and the jaws, this frame (verifier: |grip − mouth| stays < 0.5)
  const grip = { x: 0, y: 0, z: 0 }, mouthNow = { x: 0, y: 0, z: 0 };

  // ── the route: flow field → string-pulled polyline → rounded corners ──────
  const R = { x: new Float32Array(MAXP), z: new Float32Array(MAXP), cum: new Float32Array(MAXP), n: 0, L: 0, seg: 0 };
  const _t = { x: 0, z: 0 };
  function railPush(x, z) {
    if (R.n >= MAXP) return;
    if (R.n > 0 && (R.x[R.n - 1] - x) ** 2 + (R.z[R.n - 1] - z) ** 2 < 0.04) return;
    R.x[R.n] = x; R.z[R.n] = z; R.n++;
  }
  function railFinish() {
    // round every corner (≤ 1.4 u in along each leg): a tiger does not turn
    // on a pin, and a sharp heading change swung the visitor like a flag
    if (R.n >= 3 && (R.n - 2) * 5 + 2 <= MAXP) {
      const xs = Array.from(R.x.subarray(0, R.n)), zs = Array.from(R.z.subarray(0, R.n));
      R.n = 0;
      railPush(xs[0], zs[0]);
      for (let i = 1; i < xs.length - 1; i++) {
        const ax = xs[i - 1], az = zs[i - 1], bx = xs[i], bz = zs[i], cx = xs[i + 1], cz = zs[i + 1];
        const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz);
        const r1 = Math.min(1.4, l1 * 0.4), r2 = Math.min(1.4, l2 * 0.4);
        if (l1 < 1e-3 || l2 < 1e-3) { railPush(bx, bz); continue; }
        const px = bx - (bx - ax) / l1 * r1, pz = bz - (bz - az) / l1 * r1;
        const qx = bx + (cx - bx) / l2 * r2, qz = bz + (cz - bz) / l2 * r2;
        railPush(px, pz);
        for (let k = 1; k < 4; k++) {                 // a quadratic Bézier through the corner
          const u = k / 4, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
          railPush(px * w0 + bx * w1 + qx * w2, pz * w0 + bz * w1 + qz * w2);
        }
        railPush(qx, qz);
      }
      railPush(xs[xs.length - 1], zs[zs.length - 1]);
    }
    R.cum[0] = 0;
    for (let i = 1; i < R.n; i++) R.cum[i] = R.cum[i - 1] + Math.hypot(R.x[i] - R.x[i - 1], R.z[i] - R.z[i - 1]);
    R.L = R.n > 1 ? R.cum[R.n - 1] : 0;
    R.seg = 0;
  }
  /** Point at arc length s (clamped). out = { x, z }. */
  function railAt(s, out) {
    if (R.n < 2) { out.x = R.n ? R.x[0] : 0; out.z = R.n ? R.z[0] : 0; return out; }
    s = clamp(s, 0, R.L);
    let i = clamp(R.seg, 0, R.n - 2);
    while (i < R.n - 2 && R.cum[i + 1] < s) i++;
    while (i > 0 && R.cum[i] > s) i--;
    R.seg = i;
    const l = R.cum[i + 1] - R.cum[i], u = l > 1e-6 ? (s - R.cum[i]) / l : 0;
    out.x = R.x[i] + (R.x[i + 1] - R.x[i]) * u; out.z = R.z[i] + (R.z[i + 1] - R.z[i]) * u;
    return out;
  }
  /** Heading (yaw) of the rail at s, looking `ahead` u on. */
  const _h0 = { x: 0, z: 0 }, _h1 = { x: 0, z: 0 };
  function railYaw(s, ahead, fallback) {
    railAt(s, _h0); const seg = R.seg; railAt(Math.min(R.L, s + ahead), _h1); R.seg = seg;
    const dx = _h1.x - _h0.x, dz = _h1.z - _h0.z;
    if (dx * dx + dz * dz < 1e-6) {
      railAt(Math.max(0, s - ahead), _h1); R.seg = seg;
      const bx = _h0.x - _h1.x, bz = _h0.z - _h1.z;
      return bx * bx + bz * bz < 1e-6 ? fallback : Math.atan2(bx, bz);
    }
    return Math.atan2(dx, dz);
  }
  /** Build the walk from (x,z) to the doorstep. False = try again next frame
   *  (the nav grid spends at most one BFS every other frame).
   *  The pack grid first (0.8-u torso, 0.75-u cells); if the doorstep is not
   *  on the same piece of ground as the catch — garden fences round the guest
   *  house's green close the gates in that grid — the carry's own finer,
   *  slimmer grid (citizens.js navFine) at 0.6 then 0.45; failing even that,
   *  the reachable ground nearest the door and one straight last leg.
   *  B.routeMode says which: 'nav' · 'fine' · 'slim' · 'rim' · 'line'. */
  const _nw = { x: 0, z: 0, d: 0 };
  let fineFrame = 0;
  function trace(N, f, x, z) {
    let cx = x, cz = z;
    for (let it = 0; it < 160; it++) {
      if (!N.next(f, cx, cz, 48, _nw)) return false;
      if ((_nw.x - cx) ** 2 + (_nw.z - cz) ** 2 < 0.01) return _nw.d === 0;
      railPush(_nw.x, _nw.z);
      cx = _nw.x; cz = _nw.z;
      if (_nw.d === 0) return true;
    }
    return false;
  }
  /** The junction (→ _jn) between the pack grid's field fM (from him) and
   *  the fine grid's field fF (from the door), inside the window. */
  const _jn = { x: 0, z: 0 }, _cc = { x: 0, z: 0 };
  function junction(N, fM, F, fF, wx0, wz0, wx1, wz1) {
    const D = N.dims, dM = fM.d, dF = fF.d;
    if (!D || !dM || !dF) return false;
    const gx0 = Math.max(0, Math.floor((wx0 - D.X0) / D.C)), gx1 = Math.min(D.NX - 1, Math.floor((wx1 - D.X0) / D.C));
    const gz0 = Math.max(0, Math.floor((wz0 - D.Z0) / D.C)), gz1 = Math.min(D.NZ - 1, Math.floor((wz1 - D.Z0) / D.C));
    const cF = F.dims.C;
    let best = Infinity;
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const i = gz * D.NX + gx, a = dM[i];
      if (a === 0xffff) continue;
      const x = D.X0 + (gx + 0.5) * D.C, z = D.Z0 + (gz + 0.5) * D.C;
      const j = F.cellOf(x, z);
      if (j < 0 || dF[j] === 0xffff) continue;
      const cost = a * D.C + dF[j] * cF * 2.0;
      if (cost < best) { best = cost; _jn.x = x; _jn.z = z; }
    }
    return best < Infinity;
  }
  /** trace() from (x,z) DOWN field f to its source (him), appended to the
   *  rail reversed — the walk from him out to (x,z), (x,z) itself excluded. */
  const _rv = [];
  function traceRev(N, f, x, z) {
    _rv.length = 0;
    let cx = x, cz = z, ok = false;
    for (let it = 0; it < 160; it++) {
      if (!N.next(f, cx, cz, 48, _nw)) break;
      if ((_nw.x - cx) ** 2 + (_nw.z - cz) ** 2 < 0.01) { ok = _nw.d === 0; break; }
      _rv.push(_nw.x, _nw.z);
      cx = _nw.x; cz = _nw.z;
      if (_nw.d === 0) { ok = true; break; }
    }
    if (!ok) return false;
    // (the last point is his own cell: he is already R[0])
    for (let k = _rv.length - 4; k >= 0; k -= 2) railPush(_rv[k], _rv[k + 1]);
    return true;
  }
  function buildRoute(x, z) {
    const t0 = performance.now();
    B.routeFrames = (B.routeFrames || 0) + 1;
    const ok = buildRoute0(x, z);
    const ms = performance.now() - t0;
    B.routeMs = (B.routeMs || 0) + ms;
    if (ms > (B.routeMax || 0)) B.routeMax = ms;
    return ok;
  }
  function buildRoute0(x, z) {
    const ds = house().step;
    R.n = 0;
    railPush(x, z);
    B.routeMode = 'line'; B.fineR = 0;
    const N = H.nav();
    let done = false;
    if (N && N.built) {
      // (the tigers spend the grid's one-BFS-per-two-frames budget every frame,
      //  and this runs before the frame counter moves on: a carry starting is
      //  rare enough to take a turn of its own — the source never moves, so
      //  the field is cached until the grid is rebuilt)
      const f = N.field('bedtime', ds.x, ds.z, 1.0, S.frame + 2);
      if (!f) { if (++B.routeTries < 30) return false; }
      else if (N.distAt(f, x, z) < Infinity) {
        done = trace(N, f, x, z);
        if (done) B.routeMode = 'nav'; else { R.n = 0; railPush(x, z); }
      }
    }
    if (!done && typeof H.navFine === 'function') {
      const M = 28;
      const wx0 = Math.min(x, ds.x) - M, wz0 = Math.min(z, ds.z) - M, wx1 = Math.max(x, ds.x) + M, wz1 = Math.max(z, ds.z) + M;
      B.win[0] = wx0; B.win[1] = wz0; B.win[2] = wx1; B.win[3] = wz1;
      // the wide streets as far as they go: the pack grid's field from HIM
      // (null for a frame or two: the grid's BFS budget)
      const fM = N && N.built ? N.field('bedtime-him', x, z, 0.3, S.frame + 2) : null;
      if (N && N.built && !fM && ++B.routeTries < 60) { R.n = 0; railPush(x, z); return false; }
      for (const r of [0.6, 0.45]) {
        const F = H.navFine(wx0, wz0, wx1, wz1, r);
        if (!F) { R.n = 0; railPush(x, z); return false; }   // still building (a quota a frame): next frame
        const f = F.field('bedtime', ds.x, ds.z, 0.05, (fineFrame += 4));
        if (!f) continue;
        // the JUNCTION: pack-grid ground he can be walked to that the fine
        // field reaches, cheapest by (street walk + 2 × lane walk) — so the
        // carry keeps to the streets and takes the narrow way only for the
        // last stretch into the green, not as a short cut down an alley
        if (fM && junction(N, fM, F, f, wx0, wz0, wx1, wz1)) {
          const jx = _jn.x, jz = _jn.z;
          R.n = 0; railPush(x, z);
          if (traceRev(N, fM, jx, jz) && (railPush(jx, jz), trace(F, f, jx, jz))) { done = true; B.fineR = r; B.routeMode = r > 0.5 ? 'street+fine' : 'street+slim'; break; }
        }
        if (!(F.distAt(f, x, z) < Infinity)) continue;
        R.n = 0; railPush(x, z);
        if (trace(F, f, x, z)) { done = true; B.fineR = r; B.routeMode = r > 0.5 ? 'fine' : 'slim'; break; }
      }
      if (!done) {
        // a catch inside a fenced pocket (a garden whose gate is too narrow
        // even for the slim grid): the nearest ground the doorstep's field
        // reaches, one VAULT over the fence to it (scanHops), then the field
        const F = H.navFine(wx0, wz0, wx1, wz1, 0.45);
        const fd = F && F.built ? F.field('bedtime', ds.x, ds.z, 0.05, (fineFrame += 4)) : null;
        if (fd) {
          let bd = Infinity, found = false;
          for (let q = 1; q <= 64 && !found; q++) {
            F.forRing(x, z, q, (qx, qz) => {
              if (!F.reached(fd, qx, qz)) return false;
              const e = (qx - x) ** 2 + (qz - z) ** 2;
              if (e < bd) { bd = e; _t.x = qx; _t.z = qz; found = true; }
              return false;
            });
          }
          if (found) {
            const hx = _t.x, hz = _t.z;
            R.n = 0; railPush(x, z); railPush(hx, hz);
            if (trace(F, fd, hx, hz)) { done = true; B.fineR = 0.45; B.routeMode = 'hop'; } else { R.n = 0; railPush(x, z); }
          }
        }
      }
    }
    // THE LAST LEG straight up the garden path to the door, square to the
    // house: the route's own last metres dropped for a point out on the
    // door's axis — the tiger walks up and in in profile to the doorstep's
    // lens (along the house front it walked AT one lens or away from another)
    // (on the side the walk comes from, ≤ APPROACH_ANG off the axis: coming
    //  along the house front it swings out onto the path and up it, rather
    //  than past the step and back)
    if (HS.door) {
      let k = R.n - 1;
      while (k > 0 && Math.hypot(R.x[k] - ds.x, R.z[k] - ds.z) < APPROACH_OUT + 1.6) k--;
      const qx = R.x[k] - ds.x, qz = R.z[k] - ds.z;
      const th = clamp(Math.atan2(qx * HS.lx + qz * HS.lz, qx * HS.ox + qz * HS.oz), -APPROACH_ANG, APPROACH_ANG);
      approachPt(th, _ap);
      // (only if that way up is walkable: a garden bench across it, the route's own)
      let ok = freeAt(_ap.x, _ap.z, 0.5);
      for (let u = 0.25; ok && u < 1; u += 0.25) if (!freeAt(R.x[k] + (_ap.x - R.x[k]) * u, R.z[k] + (_ap.z - R.z[k]) * u, 0.45)) ok = false;
      if (ok) { R.n = k + 1; if (Math.hypot(R.x[k] - _ap.x, R.z[k] - _ap.z) > 0.5) railPush(_ap.x, _ap.z); }
    }
    railPush(ds.x, ds.z);
    railFinish();
    scanHops();
    B.routeOK = true;
    return true;
  }
  /** Where the rail crosses ground not even a slim tiger fits (a garden fence
   *  on a 'hop' route; anything on a 'line'): those spans are VAULTED —
   *  airborne, as a wedged tiger bounds out (citizens.js startLeap). The
   *  first and last 1.2 u are the catch and the doorstep (a torso beside a
   *  wall), never a vault. */
  const HOP = new Float32Array(16);
  function scanHops() {
    B.hopN = 0;
    // (on the grid the route was drawn on: its own legs are line-of-sight
    //  there, so only a leg it could not draw — out of a fenced garden, onto
    //  the ground it reaches — shows up; a 'nav' route has none)
    if (!B.fineR || typeof H.navFine !== 'function' || R.n < 2) return;
    const F = H.navFine(B.win[0], B.win[1], B.win[2], B.win[3], B.fineR);
    if (!F) return;
    let a = -1;
    const seg = R.seg;
    for (let s = 1.2; s <= R.L - 1.2 + 1e-6; s += 0.25) {
      railAt(s, _h0);
      const open = F.isOpen(_h0.x, _h0.z) || world.height(_h0.x, _h0.z) < 0.55;   // (a pier's deck)
      if (!open && a < 0) a = s;
      else if (open && a >= 0) { if (s - a >= 0.5 && B.hopN < 8) { HOP[B.hopN * 2] = a; HOP[B.hopN * 2 + 1] = s; B.hopN++; } a = -1; }
    }
    if (a >= 0 && R.L - 1.2 - a >= 0.5 && B.hopN < 8) { HOP[B.hopN * 2] = a; HOP[B.hopN * 2 + 1] = R.L - 1.2; B.hopN++; }
    R.seg = seg;
  }
  /** The vault's height at arc length s (0 = on the ground). */
  function hopAt(s) {
    for (let i = 0; i < B.hopN; i++) {
      const a = HOP[i * 2] - 0.9, b = HOP[i * 2 + 1] + 0.9;
      if (s > a && s < b) { const u = (s - a) / (b - a); return clamp(1.0 + 0.35 * (b - a), 1.3, 2.4) * 4 * u * (1 - u); }
    }
    return 0;
  }

  // ── the last leg: up the garden path to the step ───────────────────────────
  /** The approach point θ off the door's axis (toward the room's +x side). */
  function approachPt(th, out) {
    const ux = HS.ox * Math.cos(th) + HS.lx * Math.sin(th), uz = HS.oz * Math.cos(th) + HS.lz * Math.sin(th);
    out.x = HS.step.x + ux * APPROACH_OUT; out.z = HS.step.z + uz * APPROACH_OUT;
    return out;
  }
  /** Where the rail's last leg begins: its last point further than the leg
   *  from the step (null: none). */
  function tailStart() {
    let k = R.n - 1;
    while (k > 0 && Math.hypot(R.x[k] - HS.step.x, R.z[k] - HS.step.z) < APPROACH_OUT + 1.6) k--;
    return R.n > 1 && k >= 0 ? { k, x: R.x[k], z: R.z[k] } : null;
  }
  /** Re-lay the rail's tail up a leg at θ (the doorstep lens's own: see
   *  pickDoorTripod) — only if the carry has not reached it yet. */
  const _ap = { x: 0, z: 0 };
  function retail(th) {
    const t = tailStart(); if (!t || !Number.isFinite(th)) return false;
    if (R.cum[t.k] < B.s + 0.3) return false;
    approachPt(th, _ap);
    R.n = t.k + 1;
    const px = R.x[t.k], pz = R.z[t.k], ax = _ap.x, az = _ap.z, sx = HS.step.x, sz = HS.step.z;
    const l1 = Math.hypot(ax - px, az - pz), l2 = Math.hypot(sx - ax, sz - az);
    if (l1 > 0.3 && l2 > 0.3) {
      // (the corner at the approach point rounded, as railFinish rounds them)
      const r1 = Math.min(1.4, l1 * 0.4), r2 = Math.min(1.4, l2 * 0.4);
      const qx = ax - (ax - px) / l1 * r1, qz = az - (az - pz) / l1 * r1, ex = ax + (sx - ax) / l2 * r2, ez = az + (sz - az) / l2 * r2;
      railPush(qx, qz);
      for (let k = 1; k < 4; k++) { const u = k / 4, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u; railPush(qx * w0 + ax * w1 + ex * w2, qz * w0 + az * w1 + ez * w2); }
      railPush(ex, ez);
    } else railPush(ax, az);
    railPush(sx, sz);
    for (let i = t.k + 1; i < R.n; i++) R.cum[i] = R.cum[i - 1] + Math.hypot(R.x[i] - R.x[i - 1], R.z[i] - R.z[i - 1]);
    R.L = R.cum[R.n - 1]; R.seg = clamp(R.seg, 0, Math.max(0, R.n - 2));
    scanHops();
    B.legTh = th;
    return true;
  }

  // ── the house: door, doorstep, room frame, bed, the way in ─────────────────
  const HS = { ok: false, ver: -1, step: { x: 0, z: 0 }, door: null, room: null,
    bx: 0, bz: 0, fy: 0, hx: 0, hz: -1, lx: 1, lz: 0, ox: 0, oz: 1, inside: [], side: { x: 0, z: 0, yaw: 0 },
    lamp: { x: 0, y: 0, z: 0 }, focus: { x: 0, y: 0, z: 0 } };
  /** Everything about the guest house the carry needs, read once (after
   *  world:ready every system has placed its things). */
  function house() {
    if (HS.ok) return HS;
    const spots = ctx.systems.catContainment?.spots;
    const bed = spots?.bed && Number.isFinite(spots.bed.x) ? spots.bed : H.bedFallback;
    const arch = ctx.systems.catArchitecture;
    const room = (arch?.interiors || []).find((r) => r && r.id === 'guest') || null;
    const door = (arch?.doors || []).find((d) => d && d.id === 'guest') || null;
    HS.room = room; HS.door = door;
    HS.bx = bed.x; HS.bz = bed.z;
    // the room frame (catArchitecture's: local +x along the front wall, +z out of it)
    const ry = room ? (room.rot || 0) : Math.PI * 0.75;
    const c = Math.cos(ry), s = Math.sin(ry);
    HS.ox = s; HS.oz = c;                            // out of the front wall
    HS.lx = c; HS.lz = -s;                           // along it (room-local +x)
    HS.hx = -s; HS.hz = -c;                          // bed axis, toward the headboard (the back wall)
    HS.fy = room && Number.isFinite(room.floorY) ? room.floorY : Math.max(world.height(bed.x, bed.z), 0.2);
    const W = (lx, lz, out) => { out.x = (room ? room.x : bed.x) + lx * c + lz * s; out.z = (room ? room.z : bed.z) - lx * s + lz * c; return out; };
    // room-local coordinates of the bed
    let blx = 0.35, blz = -2.3;
    if (room) { const dx = bed.x - room.x, dz = bed.z - room.z; blx = dx * c - dz * s; blz = dx * s + dz * c; }
    const hd = room ? room.d / 2 : 4;
    // the doorstep: out of the door on its axis (else in front of the bed)
    if (door && Number.isFinite(door.x)) {
      const dy = door.base ?? ry, sx = Math.sin(dy), sz = Math.cos(dy);
      HS.step.x = door.x + sx * DOOR_OUT; HS.step.z = door.z + sz * DOOR_OUT;
    } else W(blx - 1.2, hd + DOOR_OUT, HS.step);
    // the bedside: where a tiger actually fits in the room beside the bed
    // (its torso and its haunches clear of the furniture — the interior's
    // cabinet and post stand on one side), the door's side first, its jaws
    // toward the pillow; else the old mark on the far side
    const dlx = door && room ? ((door.x - room.x) * c - (door.z - room.z) * s) : blx - 2.6;
    const q = { x: 0, z: 0 }, pw = { x: 0, z: 0 };
    const sides = dlx < blx ? [-1, 1] : [1, -1];
    HS.sd = 0;
    // (standing well out from the bed, turned 45° in toward the pillow — its
    // forelegs beside the frame, not planted through him, and its face to the
    // tuck's lens at the foot of the bed; stood close in and faced into the
    // bed at 57°, its paw and head went through his arm and chest)
    for (const sd of sides) {
      for (const [lat, b] of [[2.05, 0.05], [2.05, -0.4], [2.05, 0.5], [1.85, 0.05], [1.85, -0.4], [1.85, 0.5], [1.85, -0.8], [1.85, 0.9]]) {
        W(blx + sd * lat, blz + b, q);
        W(blx + sd * (lat - 1.4), blz + b - 1.4, pw);
        const fx = pw.x - q.x, fz = pw.z - q.z, fl = Math.hypot(fx, fz) || 1;
        if (!freeAt(q.x, q.z, 0.72) || !freeAt(q.x - fx / fl * 1.0, q.z - fz / fl * 1.0, 0.6)) continue;
        HS.side.x = q.x; HS.side.z = q.z; HS.side.yaw = Math.atan2(fx, fz); HS.sd = sd;
        break;
      }
      if (HS.sd) break;
    }
    if (!HS.sd) {
      HS.sd = 1;
      W(blx + 1.95, blz + 0.75, HS.side);
      W(blx + 0.55, blz - 0.62, pw);
      HS.side.yaw = Math.atan2(pw.x - HS.side.x, pw.z - HS.side.z);
    }
    // the way in: the threshold, a pace inside, (round the foot of the bed
    // if the bedside is the far one), beside the bed, the bedside — every
    // via point one a tiger fits at
    HS.inside.length = 0;
    if (room) {
      const via = (lx, lz, r) => { W(lx, lz, q); if (freeAt(q.x, q.z, r)) HS.inside.push({ x: q.x, z: q.z }); };
      HS.inside.push(W(dlx, hd + 0.35, { x: 0, z: 0 }));
      via(dlx, hd - 0.9, 0.6);
      if ((dlx < blx ? -1 : 1) !== HS.sd) via(blx, blz + BED_HALF + 1.3, 0.6);
      via(blx + HS.sd * 1.85, blz + BED_HALF + 0.5, 0.6);
    }
    HS.inside.push({ x: HS.side.x, z: HS.side.z });
    // the bedside lamp containment draws (scenery.js: bd − lx·1.55 + hx·1.05, 0.75 up)
    HS.lamp.x = bed.x - HS.lx * 1.55 + HS.hx * 1.05; HS.lamp.z = bed.z - HS.lz * 1.55 + HS.hz * 1.05; HS.lamp.y = HS.fy + 1.35;
    HS.ok = true;
    return HS;
  }
  const bedPt = (a, out) => { out.x = HS.bx + HS.hx * a; out.z = HS.bz + HS.hz * a; return out; };
  /** Arc length of the rail point nearest (x, z). */
  function arcNear(x, z) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < R.n; i++) { const e = (R.x[i] - x) ** 2 + (R.z[i] - z) ** 2; if (e < bd) { bd = e; bi = i; } }
    return R.cum[bi] || 0;
  }
  /** Does a body of radius r fit at (x,z) on the room's floor? (pushOut, the
   *  feet lent the floor's height as settle() does) */
  const _fo = { x: 0, z: 0, hit: false };
  function freeAt(x, z, r) {
    const p = pl(); if (!p || typeof p.pushOut !== 'function') return true;
    const P = p.position, keep = P.y;
    P.y = HS.fy;
    try { p.pushOut(x, z, r, _fo); } finally { P.y = keep; }
    return !_fo.hit;
  }

  // ── the visitor: hanging / lying / sitting ─────────────────────────────────
  const _m = { x: 0, y: 0, z: 0 };
  /** Where the jaws are: the rig's own head (tigerrig.js — the pose's head
   *  lift and pitch, the gait's bob), else tiger.js mouthPoint's static
   *  geometry (with a raider's deck pitch). */
  const _mv = new THREE.Vector3();
  function mouthOf(c, out, rig = true) {
    const TG = rig ? (c.rig?.tiger || c.TG) : null;
    if (TG && TG.headPivot && (c.tigerK ?? 1) > 0.5) {
      TG.headPivot.updateWorldMatrix(true, false);
      _mv.set(0, TP.muzzleY - 0.06, TP.muzzleZ + 0.14).applyMatrix4(TG.headPivot.matrixWorld);
      out.x = _mv.x; out.y = _mv.y; out.z = _mv.z;
      return out;
    }
    const T = tigerScale(c) * Math.max(0.25, c.tigerK ?? 1);
    const z = (TP.spineZ + TP.neckZ + TP.headZ + TP.muzzleZ + 0.20) * T;
    const y = (TP.spineY + TP.neckY + TP.headY + TP.muzzleY) * T;
    const p = c.slope || 0, cp = Math.cos(p), sp = Math.sin(p);
    const yy = y * cp - z * sp, zz = y * sp + z * cp;
    out.x = c.x + Math.sin(c.yaw) * zz; out.y = c.y + (c.air || 0) + yy; out.z = c.z + Math.cos(c.yaw) * zz;
    return out;
  }
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _hq = new THREE.Quaternion(), _lq = new THREE.Quaternion(), _sq = new THREE.Quaternion();
  const _hp = new THREE.Vector3(), _lp = new THREE.Vector3(), _sp = new THREE.Vector3(), _v = new THREE.Vector3(), _cl = new THREE.Vector3();
  const _gi = {};
  function floorAt(x, z) {
    const p = pl();
    if (p && typeof p.groundInfo === 'function') {
      const P = p.position, keep = P.y;
      P.y = world.height(x, z);
      try { p.groundInfo(x, z, _gi); } finally { P.y = keep; }
      if (Number.isFinite(_gi.h)) return _gi.h;
    }
    return world.height(x, z);
  }
  function insideRoom(x, z) {
    const r = HS.room; if (!r) return false;
    const dx = x - r.x, dz = z - r.z, c = Math.cos(r.rot || 0), s = Math.sin(r.rot || 0);
    return Math.abs(dx * c - dz * s) < r.w / 2 && Math.abs(dx * s + dz * c) < r.d / 2;
  }
  /** How far (u, on the ground) from (x,z) along bearing az before leaving
   *  the guest room's floor, `margin` short of its walls (∞ with no room). */
  function roomRun(x, z, az, margin) {
    const r = HS.room; if (!r) return Infinity;
    const c = Math.cos(r.rot || 0), s = Math.sin(r.rot || 0);
    const dx = x - r.x, dz = z - r.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
    const sx = Math.sin(az), sz = Math.cos(az), ux = sx * c - sz * s, uz = sx * s + sz * c;
    const hw = r.w / 2 - margin, hd = r.d / 2 - margin;
    let t = Infinity;
    if (ux > 1e-6) t = Math.min(t, (hw - lx) / ux); else if (ux < -1e-6) t = Math.min(t, (-hw - lx) / ux);
    if (uz > 1e-6) t = Math.min(t, (hd - lz) / uz); else if (uz < -1e-6) t = Math.min(t, (-hd - lz) / uz);
    return Math.max(1.5, t);
  }
  /** THE SCRUFF (as citizens/raid.js): the jaws at his collar, the rest of him
   *  hanging from it LIMP — legs straight down, arms hanging (after the
   *  catch's startled kick) — facing the way the tiger goes, a little swing
   *  about the grip; swung back under its chin if his feet would touch down. */
  function hangPose(c, outP, outQ, dip) {
    mouthOf(c, _m);
    _m.y -= dip;
    const el = B.clock;                              // (the carry's own clock: it stops when paused)
    const amp = c.moving ? 1 : 0.55;
    const swing0 = -0.08 + Math.sin(el * 2.3 + (c.ph || 0)) * 0.16 * amp;
    const sway = Math.sin(el * 1.6 + (c.ph || 0) * 0.7) * 0.12 * amp;
    // turned part-way into profile for the lens (B.twist, eased in update):
    // a kitten in the jaws reads from the side, not face-on in front of them
    const yaw = c.yaw + (B.twist || 0);
    let need = 0;
    for (let i = 0; i < 7; i++) {
      _e.set(swing0 + i * 0.11, yaw, sway);
      outQ.setFromEuler(_e);
      _v.set(0, NECK, -NECK_BACK).applyQuaternion(outQ);
      outP.set(_m.x - _v.x, _m.y - _v.y, _m.z - _v.z);   // (the collar IS the grip)
      // his feet swung forward under its chin until every corner of him
      // clears the ground (and the bed) by a hand
      need = clearance(outP, outQ, 0.08);
      if (need <= 0) break;
    }
    // the pounce's first frame or two: the head is still coming up (fast —
    // CATCH_HEAD_RATE) and is lower than his collar; his heels stay on the
    // ground (the jaws a hand under the collar, never his shoes in the paving)
    if (need > 0) outP.y += Math.min(need, HEEL_CAP);
  }
  /** The body box for the pose he is in (and, for a moment after a change,
   *  the one he is leaving: the rig blends between them). */
  const _pb = [0, 0, 0, 0, 0, 0];
  function poseBox() {
    const a = PBOX[B.poseNow] || PBOX.stand;
    const b = B.clock - (B.poseAt || 0) < 0.7 ? (PBOX[B.posePrev] || a) : a;
    for (let i = 0; i < 3; i++) { _pb[i] = Math.min(a[i], b[i]); _pb[i + 3] = Math.max(a[i + 3], b[i + 3]); }
    return _pb;
  }
  /** Keep up with the pose he is in (late(): whoever set it — this, the raid). */
  function notePose(name) {
    if (name !== B.poseNow) { B.posePrev = B.poseNow || name; B.poseNow = name; B.poseAt = B.clock; }
  }
  /** Is (x,z) over the guest bed? */
  function overBed(x, z) {
    const dx = x - HS.bx, dz = z - HS.bz;
    return Math.abs(dx * HS.hx + dz * HS.hz) < BED_HALF && Math.abs(dx * HS.lx + dz * HS.lz) < BED_HALF_W;
  }
  /** How far (u) the lowest corner of his body at (P, Q) is under the ground
   *  (or the bed, which he may sink into no deeper than LIE_SINK) plus
   *  `clear`. ≤ 0: every corner is clear. Only the low corners look up the
   *  ground (groundInfo): 2–4 lookups, not 8. */
  const _cy = new Float32Array(8), _cx = new Float32Array(8), _cz = new Float32Array(8);
  function clearance(P, Q, clear = FLOOR_CLEAR) {
    const b = poseBox();
    let lo = Infinity;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? b[3] : b[0], i & 2 ? b[4] : b[1], i & 4 ? b[5] : b[2]).applyQuaternion(Q);
      _cx[i] = P.x + _v.x; _cy[i] = P.y + _v.y; _cz[i] = P.z + _v.z;
      if (_cy[i] < lo) lo = _cy[i];
    }
    let need = -Infinity;
    for (let i = 0; i < 8; i++) {
      if (_cy[i] > lo + 0.6) continue;
      let f = floorAt(_cx[i], _cz[i]);
      if (HS.ok && overBed(_cx[i], _cz[i])) f = Math.max(f, HS.fy + MATTRESS - LIE_SINK);
      const d = f + clear - _cy[i];
      if (d > need) need = d;
    }
    return need;
  }
  /** Lying on his back in the bed, head on the pillow, feet to the foot. */
  function liePose(outP, outQ) {
    const yaw = Math.atan2(-HS.hx, -HS.hz);
    _e.set(-Math.PI / 2 + 0.16, yaw, 0);
    outQ.setFromEuler(_e);
    bedPt(-0.5, _t);
    outP.set(_t.x, HS.fy + MATTRESS + 0.14, _t.z);
  }
  /** Sitting up against the pillows, legs under the blanket. */
  function sitPose(outP, outQ) {
    const yaw = Math.atan2(-HS.hx, -HS.hz);
    const el = B.clock;                              // (the carry's own clock: it stops when paused)
    _e.set(-0.14 + Math.sin(el * 0.9) * 0.015, yaw + Math.sin(el * 0.37) * 0.05, 0);
    outQ.setFromEuler(_e);
    bedPt(0.62, _t);
    outP.set(_t.x, HS.fy + MATTRESS - 0.5, _t.z);
  }

  // ── the blanket: one bent quad, pulled up from the foot of the bed ─────────
  const blanket = (() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = '#7fbfb2'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#6aa99c'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    g.strokeStyle = '#f6ecd2'; g.lineWidth = 2; g.setLineDash([3, 3]);
    g.strokeRect(1, 1, 62, 62); g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke();
    g.setLineDash([]); g.fillStyle = '#f2a0b4';                           // a little fish per square
    for (const [x, y] of [[16, 16], [48, 48]]) { g.beginPath(); g.ellipse(x, y, 7, 4, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x - 12, y - 4); g.lineTo(x - 12, y + 4); g.fill(); }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    // 7 across × 9 along; z runs 0 (the foot) → 1 (the turn-down), scaled per frame
    const NX = 7, NZ = 9, W = 2.02;
    const pos = new Float32Array(NX * NZ * 3), uv = new Float32Array(NX * NZ * 2), idx = [];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const u = i / (NX - 1) * 2 - 1, v = j / (NZ - 1), k = j * NX + i;
      const hump = Math.pow(Math.max(0, 1 - u * u), 0.55) * 0.26;           // over his body
      const drape = -0.26 * smoothstep(0.7, 1, Math.abs(u));                 // down the mattress sides
      const foot = j === 0 ? -0.24 : 0;                                      // over the end of the bed
      pos[k * 3] = u * W / 2; pos[k * 3 + 1] = hump + drape + foot; pos[k * 3 + 2] = v;
      uv[k * 2] = (u + 1) * 1.5; uv[k * 2 + 1] = v * 3;
      if (i < NX - 1 && j < NZ - 1) idx.push(k, k + NX, k + 1, k + 1, k + NX, k + NX + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }));
    m.name = 'cat_bedtime_blanket'; m.visible = false; m.receiveShadow = true; m.castShadow = false;
    m.userData.noFade = true; m.frustumCulled = false;
    H.group.add(m);
    return m;
  })();
  // ── his shadow on the ground while he hangs ────────────────────────────────
  // The tigers each stand on a soft contact shadow; he had none, so his boots
  // a metre over the paving read as boots ON the paving — 'walked home', not
  // carried. A soft dark disc on the ground straight under him (one quad, one
  // draw call, only while he hangs), fainter and wider the higher he swings.
  const hangShadow = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: 0x0b0914, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.name = 'cat_bedtime_shadow'; m.visible = false; m.userData.noFade = true; m.userData.noOcclude = true; m.renderOrder = 1; m.frustumCulled = false;
    H.group.add(m);
    return m;
  })();
  const _hs = new THREE.Vector3();
  function placeHangShadow(P, Q, on) {
    if (!on) { if (hangShadow.visible) hangShadow.visible = false; return; }
    _hs.set(0, 0.55, 0.12).applyQuaternion(Q).add(P);            // (his seat, knees up)
    const f = floorAt(_hs.x, _hs.z), h = Math.max(0, _hs.y - f);
    const k = clamp(1 - (h - 0.4) / 2.6, 0.3, 1);
    hangShadow.position.set(_hs.x, f + 0.035, _hs.z);
    hangShadow.scale.setScalar(0.5 + 0.22 * h);
    hangShadow.material.opacity = 0.46 * k;
    hangShadow.visible = true;
  }
  function setBlanket(p, len) {
    B.blanket = p;
    if (p <= 0.002) { if (blanket.visible) blanket.visible = false; return; }
    bedPt(-BED_HALF - 0.02, _t);
    blanket.position.set(_t.x, HS.fy + BLANKET_TOP + 0.05, _t.z);
    blanket.rotation.set(0, Math.atan2(HS.hx, HS.hz), 0);
    blanket.scale.set(1, 1, Math.max(0.02, p * len));
    blanket.visible = true;
  }

  // ── the lens ───────────────────────────────────────────────────────────────
  const aim = { x: 0, y: 0, z: 0 }, _foc = { x: 0, y: 0, z: 0 };
  let focusK = 0;                          // 0: the jaws · 1: the bed (arrival → tuck)
  function aimAt() {
    const c = B.cat;
    if (c) { mouthOf(c, _m, false); _m.y += 0.3 * tigerScale(c) - 0.35; }   // (steady; a touch under the jaws: him)
    else { _m.x = HS.bx; _m.y = HS.fy + 1.2; _m.z = HS.bz; }
    const k = focusK;
    aim.x = _m.x + (_foc.x - _m.x) * k;
    aim.y = _m.y + 0.1 + (_foc.y - _m.y - 0.1) * k;
    aim.z = _m.z + (_foc.z - _m.z) * k;
    return aim;
  }
  /** A hard cut on the running shot (the long walk's dip): the same framing
   *  re-issued with in: 0.01. (camera.snap() would DROP the cinematic.) */
  function recut() {
    if (!B.o) return;
    const o = Object.assign({}, B.o); o.in = 0.01;
    startShot(o);
  }
  function startShot(o) {
    const c = cam(); if (!c || typeof c.cinematic !== 'function') { B.o = null; B.cine = null; return; }
    B.o = o;
    try { B.cine = c.cinematic(o) || null; } catch (e) { B.o = null; B.cine = null; }
  }
  function liveAzimuth() {
    const P = pl()?.position, C = ctx.camera?.position;
    if (!P || !C) return cam()?.params?.azimuth ?? 0.78;
    const dx = C.x - P.x, dz = C.z - P.z;
    return dx * dx + dz * dz > 1e-4 ? Math.atan2(dx, dz) : (cam()?.params?.azimuth ?? 0.78);
  }

  // ── fades ──────────────────────────────────────────────────────────────────
  // Full black = the ui's promise has resolved, or (a synchronous step loop
  // never runs the microtask) the fade has had its whole duration plus a frame
  // of the ui's own updates. Counted in real frames: the ui fades while paused.
  function fade(toBlack, secs) {
    const u = ui();
    const id = ++B.fadeReq;
    B.fadeDir = toBlack ? 1 : 0; B.fadeT = 0; B.fadeDur = secs;
    if (toBlack) B.black = false;
    const f = u?.fade ? u.fade(toBlack, secs) : Promise.resolve();
    if (toBlack) Promise.resolve(f).then(() => { if (B.fadeReq === id) B.black = true; }, () => { if (B.fadeReq === id) B.black = true; });
  }
  function fadeClock(dt) {
    if (B.fadeDir !== 1 || B.black) return;
    B.fadeT += dt;
    if (B.fadeT >= B.fadeDur + Math.max(0.06, dt * 1.5)) B.black = true;
  }

  // ── lights out: two eyes in the dark ───────────────────────────────────────
  // The fade is black, and the tiger is still there, sitting up by the bed,
  // watching him fall asleep: two cold eyes (its own eyeshine) open in the
  // black where its head was, blink once, and close — then 06:00. Own DOM
  // over the ui's fade (z 92), pointer-free; nothing is drawn in the scene.
  const EYES_HOLD = 1.1;                          // the black held this long for them
  const EYES = { el: null, l: null, r: null, x: 0, y: 0, sp: 40, hex: '', on: false };
  function eyesBuild() {
    if (EYES.el || typeof document === 'undefined') return EYES.el;
    const root = ctx.uiRoot || document.body; if (!root) return null;
    const el = document.createElement('div');
    el.className = 'cci cci-carry-eyes';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:93;pointer-events:none;opacity:0;display:none;';
    const eye = () => {
      const e = document.createElement('div');
      e.style.cssText = 'position:absolute;border-radius:50%;transform-origin:50% 50%;';
      const pu = document.createElement('div');
      pu.style.cssText = 'position:absolute;left:43%;top:8%;width:14%;height:84%;border-radius:50%;background:#07060b;';
      e.appendChild(pu); el.appendChild(e);
      return e;
    };
    EYES.l = eye(); EYES.r = eye();
    root.appendChild(el);
    EYES.el = el;
    return el;
  }
  const _ev = new THREE.Vector3(), _ew = new THREE.Vector3();
  /** Where they open: its head, as the lens sees it at the moment the room goes black. */
  function eyesPlace(c) {
    const cm = ctx.camera, R0 = ctx.renderer; if (!cm || !c) return false;
    const TG = c.rig?.tiger || c.TG;
    if (TG?.headPivot) TG.headPivot.getWorldPosition(_ev); else mouthOf(c, _ev);
    const T = tigerScale(c);
    _ev.y += 0.12 * T;
    _ew.copy(_ev).project(cm);
    if (!(_ew.z < 1) || Math.abs(_ew.x) > 1.1 || Math.abs(_ew.y) > 1.1) { _ew.set(0, 0.1, 0); }
    const W = R0?.domElement?.clientWidth || window.innerWidth, Hh = R0?.domElement?.clientHeight || window.innerHeight;
    EYES.x = clamp((_ew.x * 0.5 + 0.5) * W, W * 0.2, W * 0.8); EYES.y = clamp((0.5 - _ew.y * 0.5) * Hh, Hh * 0.2, Hh * 0.75);
    // their spacing: the head's own width at that depth
    const D = Math.max(1, cm.position.distanceTo(_ev));
    const pxu = Hh / (2 * D * Math.tan(THREE.MathUtils.degToRad(cm.fov || 42) / 2));
    EYES.sp = clamp(0.36 * T * pxu, 22, 120);
    const hx = tigerEyeHex(c.pattern || c.spec?.pattern).toString(16).padStart(6, '0');
    EYES.hex = '#' + hx;
    const el = eyesBuild(); if (!el) return false;
    const w = EYES.sp * 0.62, h = EYES.sp * 0.34;
    for (const [e, sd] of [[EYES.l, -1], [EYES.r, 1]]) {
      e.style.left = (sd * EYES.sp / 2 - w / 2).toFixed(1) + 'px'; e.style.top = (-h / 2).toFixed(1) + 'px';
      e.style.width = w.toFixed(1) + 'px'; e.style.height = h.toFixed(1) + 'px';
      e.style.background = `radial-gradient(ellipse at 50% 50%, #ffffff 0%, ${EYES.hex} 38%, ${EYES.hex}00 74%)`;
      e.style.boxShadow = `0 0 ${(EYES.sp * 0.3).toFixed(0)}px ${(EYES.sp * 0.06).toFixed(0)}px ${EYES.hex}88`;
    }
    el.style.left = EYES.x.toFixed(1) + 'px'; el.style.top = EYES.y.toFixed(1) + 'px';
    return true;
  }
  /** Their beat, on the dark's clock t: open (as the fade closes), a blink, shut. */
  function eyesAt(t) {
    const E0 = DARK_SECS - 0.42;
    if (!EYES.on && t >= E0 && t < DARK_SECS + EYES_HOLD) EYES.on = eyesPlace(B.cat);
    if (!EYES.on || !EYES.el) return;
    const op = smoothstep(E0, E0 + 0.3, t) * (1 - smoothstep(DARK_SECS + EYES_HOLD - 0.12, DARK_SECS + EYES_HOLD, t));
    const b0 = DARK_SECS + 0.32;                  // the blink
    let open = smoothstep(E0, E0 + 0.25, t);
    if (t > b0 && t < b0 + 0.2) open *= Math.abs(t - (b0 + 0.08)) / (t < b0 + 0.08 ? 0.08 : 0.12);
    open *= 1 - smoothstep(DARK_SECS + EYES_HOLD - 0.45, DARK_SECS + EYES_HOLD - 0.15, t);   // …and the lids come down
    EYES.el.style.display = op > 0.003 ? 'block' : 'none';
    EYES.el.style.opacity = op.toFixed(3);
    const sy = 'scaleY(' + Math.max(0.04, open).toFixed(3) + ')';
    EYES.l.style.transform = sy; EYES.r.style.transform = sy;
  }
  function eyesOff() {
    EYES.on = false;
    if (EYES.el && EYES.el.style.display !== 'none') { EYES.el.style.display = 'none'; EYES.el.style.opacity = '0'; }
  }

  // ── the pickups, out of the cutscene ───────────────────────────────────────
  // A star's rainbow ring, an ammo orb and its ground ring sliding through the
  // carry read as game furniture left on over a cutscene. While he is carried
  // (and in bed) the pickups' own top-level groups are hidden — just their
  // visibility, put back exactly as it was the moment he is his own again
  // (powerups.js also refuses to collect for a carried visitor).
  const PICKUP_GROUPS = ['powerups', 'inventory', 'inventory-markers'];
  const HID = { on: false, list: [] };
  function hidePickups(on) {
    if (on === HID.on) return;
    HID.on = on;
    if (on) {
      HID.list.length = 0;
      for (const n of PICKUP_GROUPS) {
        const g = ctx.scene?.getObjectByName?.(n);
        if (g && g.parent === ctx.scene) { HID.list.push(g, g.visible); g.visible = false; }
      }
    } else {
      for (let i = 0; i < HID.list.length; i += 2) HID.list[i].visible = HID.list[i + 1];
      HID.list.length = 0;
    }
  }

  // ── the escort: the two nearest tigers fall in behind ──────────────────────
  function pickEscort(x, z) {
    for (const e of B.escort) release(e);
    B.escort.length = 0;
    const cats = H.cats;
    const cand = [];
    for (const o of cats) {
      if (o === B.cat || !(o.tigerK > 0.5) || (o.hideK || 0) >= 0.5 || o.spec.fixed || o.carryTo) continue;
      const d2 = (o.x - x) ** 2 + (o.z - z) ** 2;
      if (d2 < 45 * 45) cand.push({ o, d2 });
    }
    cand.sort((a, b) => a.d2 - b.d2 || (a.o.key < b.o.key ? -1 : 1));
    for (let i = 0; i < Math.min(2, cand.length); i++) {
      const o = cand[i].o;
      o.scriptPlan = { act: 'post', x: o.x, z: o.z, pose: 'prowl', speed: SPEED, face: o.faceDir, esc: i + 1 };
      o.think = 0; o.navHoldUntil = 0; o.giveX = NaN;
      B.escort.push(o);
    }
  }
  function release(o) { if (!o) return; o.scriptPlan = null; o.think = 0; o.giveX = NaN; }
  /** Escort i's offset across the route (+: the lens's side): on the far side
   *  of the carry from the lens, which rides beside them — padding along
   *  BEHIND the carrier in the frame, never a dark flank in the foreground. */
  function escortLat(i) { return B.side ? -B.side * (1.3 + 0.9 * i) : (i ? -1.1 : 1.1); }
  function wakeSleeper() { if (B.sleeper) { release(B.sleeper); B.sleeper = null; } }
  const _ep = { x: 0, z: 0 };
  /** Where escort i waits while he is put to bed: on the lawn BEHIND the
   *  carrier, flanking the way in, sitting up and looking at the door — in
   *  the doorstep shot's background, never between its lens (low, along the
   *  house front) and the jaws. Resolved against the colliders once. */
  const WAIT = [{ x: 0, z: 0, ok: false }, { x: 0, z: 0, ok: false }];
  function escortWait(i, out) {
    const bw = B.wait && B.wait[i ? 1 : 0];            // (picked round the doorstep's tripod)
    if (bw) { out.x = bw.x; out.z = bw.z; return out; }
    const w = WAIT[i ? 1 : 0];
    if (!w.ok) {
      const side = i ? -1 : 1;
      let x = HS.step.x + HS.ox * 4.2 + HS.lx * side * 2.2, z = HS.step.z + HS.oz * 4.2 + HS.lz * side * 2.2;
      if (typeof H.resolveSpot === 'function') { const q = H.resolveSpot(x, z, 2.5, 0.8); if (q) { x = q[0]; z = q[1]; } }
      w.x = x; w.z = z; w.ok = true;
    }
    out.x = w.x; out.z = w.z;
    return out;
  }
  function updateEscort() {
    const c = B.cat; if (!c) return;
    for (let i = 0; i < B.escort.length; i++) {
      const o = B.escort[i], P = o.scriptPlan; if (!P) continue;
      let tx, tz, face;
      if (B.stage === 'arrive' || B.stage === 'tuck' || B.stage === 'dark') {
        // waiting at the door, one either side of it, looking in
        escortWait(i, _ep); tx = _ep.x; tz = _ep.z;
        face = Math.atan2(HS.step.x - HS.ox * DOOR_OUT - tx, HS.step.z - HS.oz * DOOR_OUT - tz);
      } else {
        const back = B.s - ESCORT_GAP * (i + 1);
        if (back > 0 && B.stage === 'carry') { railAt(back, _ep); tx = _ep.x; tz = _ep.z; face = railYaw(back, 1.5, c.yaw); }
        else { tx = c.x - Math.sin(c.yaw) * ESCORT_GAP * (i + 1); tz = c.z - Math.cos(c.yaw) * ESCORT_GAP * (i + 1); face = c.yaw; }
        // (on the far side of the carry from the lens, which rides beside
        //  them: the escort padding along BEHIND the carrier in the frame,
        //  never a dark flank filling the foreground)
        const away = escortLat(i);
        tx += Math.cos(face) * away; tz -= Math.sin(face) * away;
      }
      const d = Math.hypot(tx - o.x, tz - o.z);
      P.x = tx; P.z = tz; P.face = face;
      if (d < 0.9) { P.hold = 1; P.pose = B.stage === 'carry' || B.stage === 'catch' ? 'watch' : 'sit'; }
      else { P.hold = 0; P.pose = d > 7 ? 'rush' : 'prowl'; P.speed = d > 7 ? 7.2 : d > 3 ? SPEED * 1.2 : SPEED; }
    }
  }

  // ── the carrier on its rail ────────────────────────────────────────────────
  const rail = { act: 'rail', x: 0, z: 0, pose: 'carry', moving: false, face: 0, speed: SPEED };
  function drive(c, dt, speed, pose) {
    const p = railAt(B.s, _t);
    // the route is drawn on the carry's slim grid, narrower than the tiger's
    // own body resolve (settle): where they disagree the body is pushed off
    // the rail — so it keeps a decaying share of last frame's push instead of
    // snapping back onto the rail to be shoved again (a 0.2-s shudder of up
    // to 1.7 u south of the guest house on a long walk)
    let ox = 0, oz = 0;
    if (B.railPrev && d0(dt)) {
      ox = (c.x - B.rpx) * 0.86; oz = (c.z - B.rpz) * 0.86;
      const l = Math.hypot(ox, oz); if (l > 2) { ox *= 2 / l; oz *= 2 / l; }
    }
    c.x = p.x + ox; c.z = p.z + oz;
    B.rpx = p.x; B.rpz = p.z; B.railPrev = true;
    const yaw = railYaw(B.s, 1.8, c.yaw);
    c.faceDir = yaw;
    // the vault: airborne over the fence, him swinging under its chin
    const air = B.stage === 'carry' ? hopAt(B.s) : 0;
    if (air > 0 || c.railHop) {
      if (air > 0 && !c.railHop) B.hops++;
      c.railHop = air > 0; c.air = air; c.airV = 0;
      if (air > 0) { pose = 'bound'; c.y = Math.max(0.15, world.height(c.x, c.z)); }
    }
    rail.x = p.x; rail.z = p.z; rail.face = yaw; rail.moving = speed > 0; rail.pose = pose; rail.speed = speed || SPEED;
    c.moving = speed > 0;
    c.gaitK = speed > 0 ? speed / 3.4 : 1;
    if (B.raid) {
      c.pose = pose;
      c.yaw = dampAngle(c.yaw, yaw, c.moving ? 7 : 5, dt);
      c.slope += (0 - (c.slope || 0)) * (1 - Math.exp(-6 * dt));
      c.plan = rail;
      H.settle(c, dt, rail);
    }
  }
  /** Hold the carrier where it is (a pose, a facing). */
  function hold(c, dt, pose, face) {
    B.railPrev = false;
    rail.x = c.x; rail.z = c.z; rail.face = face; rail.moving = false; rail.pose = pose; rail.speed = 0;
    c.faceDir = face; c.moving = false; c.gaitK = 1;
    if (B.raid) {
      c.pose = pose; c.yaw = dampAngle(c.yaw, face, 5, dt);
      c.plan = rail;
      H.settle(c, dt, rail);
    }
  }
  const d0 = (dt) => dt > 0;
  /** Put the carrier somewhere at once (a cut): the body forgets where it was. */
  function place(c, x, z, yaw) {
    B.railPrev = false;
    c.x = x; c.z = z; c.yaw = yaw; c.faceDir = yaw;
    c.sx = NaN; c.sz = NaN; c.settleT = 0; c.gy = undefined; c.gyT = 0; c.kvx = 0; c.kvz = 0; c.leapT = 0;
    c.trapT = 0; c.trapX = NaN; c.wdX = NaN; c.touchT = 0; c.yawLock = undefined; c.faceHoldUntil = 0; c.wedgedUntil = 0;
    c.railHop = false; c.air = 0; c.airV = 0;
    c.y = floorAt(x, z);
    rail.x = x; rail.z = z; rail.face = yaw;
  }

  // ── the lens's sight lines ─────────────────────────────────────────────────
  // A framing is scored before it is used (the catch, the doorstep): rays from
  // where its lens would stand to him, the jaws and the door, and eight more
  // spread over the frame, against the drawn scene round them (the camera's
  // own triangle accelerator, camera.accel) and the terrain (its heightfield,
  // marched). A ray is blocked by anything it meets short of the subject — not
  // the ground it grazes at his feet, not a cat. The collider cylinders cannot
  // see a fan-light, an awning or a roof: this can. A search runs as a JOB, a
  // fixed number of rays a frame (deterministic, a few ms at most), the best
  // framing so far applied as it goes; the lens eases toward it.
  const _rc = new THREE.Raycaster(), _rh = [], _rsph = new THREE.Sphere();
  const _lo = new THREE.Vector3(), _ld = new THREE.Vector3(), _lf = new THREE.Vector3(), _lr = new THREE.Vector3(), _lu = new THREE.Vector3(), _lt = new THREE.Vector3();
  const _UP = new THREE.Vector3(0, 1, 0);
  // (inst: the instanced props round the spot — lamp posts, trees, bollards —
  //  as world boxes, six floats each, and the mesh each came from: a thin
  //  post the triangle list never held stood between the catch's lens and him)
  const OCC = { list: [], x: NaN, z: NaN, r: 0, rays: 0, ms: 0, inst: new Float32Array(6 * 512), instO: [], instN: 0 };
  const WOCC = { list: [], x: NaN, z: NaN, r: 0, ms: 0, inst: new Float32Array(6 * 512), instO: [], instN: 0 };   // (the walk plan's own)
  let occNow = OCC;                                          // what rayHit tests (its list and its boxes)
  // A cat is never a wall to these searches (they skip every NPC), but a tiger
  // standing where the shot WILL have it — the carrier at a pose it has not
  // reached yet — is: spheres, each tested only on the rays it can stand in.
  const SPH = new Float32Array(4 * 256);
  let sphN = 0, sphA = 0, sphB = 0;
  const FRAME = [[-0.62, -0.42], [0, -0.5], [0.62, -0.42], [-0.72, 0.08], [0.72, 0.08], [-0.52, 0.5], [0, 0.56], [0.52, 0.5]];
  const LENS_RAYS = 18;                                 // rays a frame for a framing search
  // never a wall: the sky, the sea and its mist, the terrain's own meshes (the
  // heightfield stands in for them, at no cost), the flyer's shells, fx
  const NOT_WALL = /^(sky|cloud|star|sun|moon|sea|ocean|water|terrain_|seamist|flyer_|weapon-fx)|spill/i;
  /** The drawn meshes within r of (x,z) that can stand in a lens's way. */
  function gatherOcc(x, z, r, extra = null, O = OCC, leaf = false) {
    const t0 = performance.now();
    O.list.length = 0; O.x = x; O.z = z; O.r = r; O.instN = 0; O.instO.length = 0;
    // (extra: a rig that DOES count — the carrier, when the question is
    //  whether its own head stands between the lens and him)
    if (extra) {
      extra.updateMatrixWorld(true);
      extra.traverse((o) => { if (o.isMesh && o.visible && o.geometry && !o.isInstancedMesh) O.list.push(o); });
    }
    const skip = new Set([H.group, pl()?.group, ...(typeof H.npcGroups === 'function' ? H.npcGroups() : [])]);
    // (the guest door's leaf: it swings open before any of these shots — a
    //  search from inside the room takes it as it will stand then: leafOpen)
    if (!leaf && HS.door?.holder) skip.add(HS.door.holder);
    if (!leaf && HS.door?.pair) skip.add(HS.door.pair);
    const acc = cam()?.accel;
    const st = [ctx.scene];
    while (st.length) {
      const o = st.pop();
      if (!o || skip.has(o) || o.visible === false) continue;
      const kids = o.children;
      for (let i = 0; i < kids.length; i++) st.push(kids[i]);
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry || o.userData?.silhouette) continue;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.depthWrite === false || m.transparent || m.blending === THREE.AdditiveBlending) continue;
      if (NOT_WALL.test(o.name || '')) continue;
      if (o.isInstancedMesh) { gatherInst(o, x, z, r, O); continue; }
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingSphere || g.boundingSphere.radius > 400) continue;
      _rsph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      if (Math.hypot(_rsph.center.x - x, _rsph.center.z - z) > r + _rsph.radius) continue;
      O.list.push(o);
      if (acc && acc.eligible?.(o) && !acc.ready?.(o)) acc.want?.(o);    // (the next search has its tree)
    }
    O.ms = performance.now() - t0;
  }
  /** The instances of cloud o within r of (x,z), as world boxes (their
   *  geometry's box through each instance's matrix): anything a hand or more
   *  tall — a post, a trunk, a bush — never a flat decal. */
  const _im = new THREE.Matrix4(), _ib = new THREE.Box3(), _ic = new THREE.Vector3();
  function gatherInst(o, x, z, r, O) {
    const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox; if (!bb || !(o.count > 0)) return;
    if (!o.boundingSphere) { try { o.computeBoundingSphere(); } catch (e) { return; } }
    if (o.boundingSphere) { _rsph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld); if (Math.hypot(_rsph.center.x - x, _rsph.center.z - z) > r + _rsph.radius) return; }
    const A = O.inst, n = o.count, gr = bb.getSize(_ic).length() * 0.5;
    for (let i = 0; i < n && O.instN < 512; i++) {
      o.getMatrixAt(i, _im); _im.premultiply(o.matrixWorld);
      const e = _im.elements;
      if (Math.hypot(e[12] - x, e[14] - z) > r + gr * 2) continue;
      _ib.copy(bb).applyMatrix4(_im);
      if (_ib.max.y - _ib.min.y < 0.35 || _ib.isEmpty()) continue;
      const j = O.instN * 6;
      A[j] = _ib.min.x; A[j + 1] = _ib.min.y; A[j + 2] = _ib.min.z; A[j + 3] = _ib.max.x; A[j + 4] = _ib.max.y; A[j + 5] = _ib.max.z;
      O.instO[O.instN++] = o;
    }
  }
  /** Where the ray L + d·t (t in [t0, t1]) enters box j of O.inst (∞: it misses). */
  function boxHit(A, j, L, d, t0, t1) {
    for (let k = 0; k < 3; k++) {
      const o = k === 0 ? L.x : k === 1 ? L.y : L.z, v = k === 0 ? d.x : k === 1 ? d.y : d.z;
      const lo = A[j + k], hi = A[j + 3 + k];
      if (Math.abs(v) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
      let ta = (lo - o) / v, tb = (hi - o) / v;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) return Infinity;
    }
    return t0;
  }
  const drawn = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  /** What stands between L and T (short of T by `pad`): the distance from L
   *  of the first thing drawn (or the hillside) the ray meets — Infinity when
   *  clear. The ground where the ray grazes it (≤ 0.45 over the floor there)
   *  does not count. nearest: the nearest such hit, not just the first found. */
  function rayHit(L, T, pad, nearest = false) {
    _ld.subVectors(T, L); const D = _ld.length(); if (D < pad + 0.3) return Infinity;
    _ld.divideScalar(D);
    OCC.rays++;
    let far = D - pad, best = Infinity;
    for (let d = 0.8; d < far - 1.2; d += 0.8) {
      const x = L.x + _ld.x * d, y = L.y + _ld.y * d, z = L.z + _ld.z * d;
      if (y < world.height(x, z) - 0.25) { OCC.by = 'terrain@' + d.toFixed(1); if (!nearest) return d; best = d; far = d; break; }
    }
    // a tiger where the shot will have it (SPH, this ray's own sphA..sphB)
    for (let i = sphA; i < sphB; i++) {
      const j = i * 4, cx = SPH[j] - L.x, cy = SPH[j + 1] - L.y, cz = SPH[j + 2] - L.z, r = SPH[j + 3];
      const tc = cx * _ld.x + cy * _ld.y + cz * _ld.z, d2 = cx * cx + cy * cy + cz * cz - tc * tc;
      if (d2 >= r * r) continue;
      const hw = Math.sqrt(r * r - d2), te = Math.max(0, tc - hw);
      if (te >= far || tc + hw <= 0.25 || te >= best) continue;
      best = te; OCC.by = 'tiger@' + te.toFixed(1);
      if (!nearest) return best;
    }
    _rc.ray.set(L, _ld); _rc.near = 0.25; _rc.far = far;
    const cm = cam(), acc = cm?.accel;
    // the camera's near-lens clip discards a patched mass (a house, a
    // district's bulk) nearer the lens than this outright — not a wall here
    const nc = 0.88 * clamp(0.36 * D, 2, 10);
    // the instanced props (their boxes): hit where the ray enters one, not
    // at a graze of the ground at his feet, not what the near-lens clip takes
    const IO = occNow, IA = IO.inst;
    for (let i = 0; i < IO.instN; i++) {
      const t = boxHit(IA, i * 6, L, _ld, 0.25, Math.min(far, best));
      if (t === Infinity) continue;
      const hx = L.x + _ld.x * t, hy = L.y + _ld.y * t, hz = L.z + _ld.z * t;
      if (hy - floorAt(hx, hz) <= 0.45) continue;
      const o = IO.instO[i];
      if (t < nc && cm?.isPatched?.(o)) continue;
      if (!drawn(o)) continue;
      best = t; OCC.by = (o.name || 'instanced') + '#box@' + t.toFixed(1);
      if (!nearest) return best;
    }
    const list = occNow.list;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!drawn(o)) continue;
      _rh.length = 0;
      try { if (acc) acc.raycast(o, _rc, _rh); else o.raycast(_rc, _rh); } catch (e) { continue; }
      for (let k = 0; k < _rh.length; k++) {
        const h = _rh[k];
        if (h.distance >= best || h.point.y - floorAt(h.point.x, h.point.z) <= 0.45) continue;
        if (h.distance < nc && cm?.isPatched?.(o)) continue;
        best = h.distance; OCC.by = (o.name || o.type) + '@' + h.distance.toFixed(1);
        if (!nearest) return best;
      }
    }
    return best;
  }
  /** How badly a framing is blocked: 1 for each subject point it cannot see;
   *  for each of the eight frame rays that meets something in front of the
   *  subject, up to 0.25 — the whole of it for a blocker in the first 35% of
   *  the way (it fills the frame: a neighbour's porch, a roof over the lens),
   *  nothing past 70% (the set round him: the house's own front receding
   *  beside the door). 0 = clean. (A: the aim; subj:
   *  points; stops once past `cut`) */
  function lensScore(A, az, el, dist, subj, cut = Infinity) {
    const ce = Math.cos(el);
    _lo.set(A.x + Math.sin(az) * ce * dist, A.y + Math.sin(el) * dist, A.z + Math.cos(az) * ce * dist);
    let s = 0;
    const why = OCC.why; if (why) why.length = 0;
    for (let i = 0; i < subj.length; i++) { if (rayHit(_lo, subj[i], 0.55) < Infinity) { s += 1; if (why) why.push('s' + i + ':' + OCC.by); } if (s >= cut) return s; }
    _lf.subVectors(A, _lo).normalize(); _lr.crossVectors(_lf, _UP).normalize(); _lu.crossVectors(_lr, _lf);
    const cm = ctx.camera, tv = Math.tan(((cm?.fov || 50) * Math.PI / 180) / 2), th = tv * (cm?.aspect || 1.6);
    for (let i = 0; i < FRAME.length; i++) {
      const sx = FRAME[i][0] * th * dist, sy = FRAME[i][1] * tv * dist;
      _lt.set(A.x + _lr.x * sx + _lu.x * sy, A.y + _lr.y * sx + _lu.y * sy, A.z + _lr.z * sx + _lu.z * sy);
      const hd = rayHit(_lo, _lt, 1.3, true);
      if (hd < Infinity) {
        const w = 0.25 * clamp((0.7 - hd / _lo.distanceTo(_lt)) / 0.35, 0, 1);
        s += w; if (why) why.push('f' + i + ':' + OCC.by + '=' + w.toFixed(2));
      }
      if (s >= cut) return s;
    }
    return s;
  }
  /** Start a search over framings { az, el, dist, pen } round aim A (pen: how
   *  far each strays from the authored framing — they are tried in that
   *  order): the least blocked plus its pen wins, a clean one ends it. apply(k)
   *  is called with each new best (the first: the authored one). */
  function lensJob(tag, A, subj, cands, apply, o = {}) {
    cands.sort((a, b) => a.pen - b.pen);
    // (o.fn: a scorer of its own — the tripods', whose subjects carry weights
    //  and spheres; o.then: called with the job once it is done)
    B.lensJob = { tag, A: A ? A.clone() : null, subj: o.fn ? subj : subj.map((v) => v.clone()), cands, i: 0, best: null, bs: Infinity, apply, rays: 0, ms: OCC.ms, frames: 0,
      fn: o.fn || null, then: o.then || null, budget: o.budget || LENS_RAYS, pre: o.pre || null, post: o.post || null };
    stepLens();
  }
  function stepLens() {
    const J = B.lensJob; if (!J) return;
    const t0 = performance.now(), r0 = OCC.rays;
    occNow = OCC;
    J.frames++;
    if (J.pre) J.pre();
    try {
      while (J.i < J.cands.length && OCC.rays - r0 < J.budget) {
        const k = J.cands[J.i++];
        if (k.pen >= J.bs) { J.i = J.cands.length; break; }
        const s = (J.fn ? J.fn(k, J.bs - k.pen) : lensScore(J.A, k.az, k.el, k.dist, J.subj, J.bs - k.pen)) + k.pen;
        k.score = s;
        if (s < J.bs) { J.bs = s; J.best = k; J.apply(k); }
        if (s - k.pen <= 0) { J.i = J.cands.length; break; }
      }
    } finally { if (J.post) J.post(); }       // (the door leaf, put back whatever happens)
    const dms = performance.now() - t0;
    J.rays += OCC.rays - r0; J.ms += dms; J.maxMs = Math.max(J.maxMs || 0, dms);
    if (J.i >= J.cands.length) {
      const b = J.best;
      (B.lensPick || (B.lensPick = {}))[J.tag] = { frames: J.frames, rays: J.rays, ms: +J.ms.toFixed(1), maxMs: +(J.maxMs || 0).toFixed(1), n: J.cands.length, occ: OCC.list.length, score: +J.bs.toFixed(2),
        pick: b ? (b.P ? { P: [+b.P.x.toFixed(2), +b.P.y.toFixed(2), +b.P.z.toFixed(2)], off: b.off, side: b.side, el: b.el, dist: b.dist, lx: b.lx, lz: b.lz, h: b.h } : { az: +b.az.toFixed(2), el: b.el, dist: b.dist, off: b.off, side: b.side }) : null };
      B.lensLast = J;
      B.lensJob = null;
      if (J.then) J.then(J);
    }
  }
  /** Run whatever search is queued to the end, now (debug beats, views). */
  function runJobsNow() {
    for (let n = 0; B.lensJob && n < 50; n++) { B.lensJob.budget = 1e9; stepLens(); }
  }

  // ── the tripods: the doorstep's, the room's ────────────────────────────────
  function sphPush(x, y, z, r) { if (sphN >= 256) return; const i = sphN * 4; SPH[i] = x; SPH[i + 1] = y; SPH[i + 2] = z; SPH[i + 3] = r; sphN++; }
  // a tiger's body in its own frame, × its scale: [forward, up, radius]
  const BODY_SPH = [[-0.62, 0.95, 0.5], [0, 0.95, 0.52], [0.56, 1.02, 0.5]];
  /** A tiger standing at (x, y, z) facing yaw, as spheres (T: its scale;
   *  head: the head's centre, or null). */
  function tigerSph(T, x, y, z, yaw, head) {
    const sx = Math.sin(yaw), cz = Math.cos(yaw);
    for (let i = 0; i < BODY_SPH.length; i++) { const b = BODY_SPH[i]; sphPush(x + sx * b[0] * T, y + b[1] * T, z + cz * b[0] * T, b[2] * T); }
    if (head) sphPush(head.x, head.y, head.z, 0.42 * T);
  }
  /** The centre of the head behind jaws J (a tiger facing yaw). */
  function headBehind(J, yaw, T, out) { return out.set(J.x - Math.sin(yaw) * 0.32 * T, J.y + 0.1 * T, J.z - Math.cos(yaw) * 0.32 * T); }
  /** The rig's lift of the jaws over tiger.js's static geometry (the pose's
   *  raised head), in the carrier's own frame: measured now, applied wherever
   *  a search stands it (jawsAt). */
  const LIFT = { fw: 0, lt: 0, oy: 0.3 };
  function measureLift(c) {
    mouthOf(c, _s0); mouthOf(c, _s1, false);
    const s0 = Math.sin(c.yaw), c0 = Math.cos(c.yaw), ox = _s0.x - _s1.x, oz = _s0.z - _s1.z, oy = _s0.y - _s1.y;
    // (a carrier just put somewhere — a cut, a staged beat — has a rig that
    //  has not caught up yet: its jaws are where it WAS; keep the last lift)
    if (Math.hypot(ox, oy, oz) > 1.2) return;
    LIFT.fw = ox * s0 + oz * c0; LIFT.lt = ox * c0 - oz * s0; LIFT.oy = oy;
  }
  /** Where its jaws would be — the carrier standing at (x,z) facing yaw
   *  (rig: with the pose's lift; else the static point aimAt() uses). */
  function jawsAt(c, x, z, yaw, out, rig = true) {
    const T = tigerScale(c) * Math.max(0.25, c.tigerK ?? 1);
    const zz = (TP.spineZ + TP.neckZ + TP.headZ + TP.muzzleZ + 0.20) * T + (rig ? LIFT.fw : 0);
    const yy = (TP.spineY + TP.neckY + TP.headY + TP.muzzleY) * T + (rig ? LIFT.oy : 0);
    const lt = rig ? LIFT.lt : 0, s = Math.sin(yaw), co = Math.cos(yaw);
    out.x = x + s * zz + co * lt; out.y = floorAt(x, z) + yy; out.z = z + co * zz - s * lt;
    return out;
  }
  /** 2-D distance from (x,z) to the segment a→b (its parameter clamped to t0..t1). */
  function segDist(x, z, ax, az, bx, bz, t0 = 0, t1 = 1) {
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, t0, t1);
    return Math.hypot(x - ax - vx * t, z - az - vz * t);
  }
  /** How badly a lens at P is blocked: each subject { p, w, s0, s1 } it cannot
   *  see costs w (the spheres s0..s1 in that ray's way too); each frame
   *  { A, w } is eight rays over the frame round aim A, as lensScore's. */
  function tripodScore(P, subj, frames, fov, cut) {
    let s = 0;
    const why = OCC.why;
    for (let i = 0; i < subj.length; i++) {
      const q = subj[i];
      sphA = q.s0 || 0; sphB = q.s1 || 0;
      const h = rayHit(P, q.p, 0.55);
      sphA = 0; sphB = 0;
      if (h < Infinity) { s += q.w; if (why) why.push(q.tag + ':' + OCC.by); }
      if (s >= cut) return s;
    }
    for (let i = 0; i < frames.length; i++) {
      s += frameRays(P, frames[i].A, frames[i].w, fov, why, frames[i].s0 || 0, frames[i].s1 || 0);
      if (s >= cut) return s;
    }
    return s;
  }
  function frameRays(P, A, w, fov, why, sa = 0, sb = 0) {
    _lf.subVectors(A, P); const dist = _lf.length(); if (dist < 0.5) return 0;
    _lf.divideScalar(dist); _lr.crossVectors(_lf, _UP).normalize(); _lu.crossVectors(_lr, _lf);
    const tv = Math.tan((fov * Math.PI / 180) / 2), th = tv * (ctx.camera?.aspect || 1.6);
    let s = 0;
    for (let i = 0; i < FRAME.length; i++) {
      const sx = FRAME[i][0] * th * dist, sy = FRAME[i][1] * tv * dist;
      _lt.set(A.x + _lr.x * sx + _lu.x * sy, A.y + _lr.y * sx + _lu.y * sy, A.z + _lr.z * sx + _lu.z * sy);
      // (sa..sb: a tiger where the shot will have it fills the frame too)
      sphA = sa; sphB = sb;
      const hd = rayHit(P, _lt, 1.3, true);
      sphA = 0; sphB = 0;
      if (hd < Infinity) {
        // (in full to 45% of the way — a neighbour's wall at half-way filled
        //  half a frame; nothing past 85%: the set round him, the house's own
        //  front receding beside the door)
        const k = w * clamp((0.85 - hd / P.distanceTo(_lt)) / 0.4, 0, 1);
        s += k; if (why && k > 0) why.push('f' + i + ':' + OCC.by + '=' + k.toFixed(2));
      }
    }
    return s;
  }
  const _tp = new THREE.Vector3();
  /** Point the running shot from a tripod at T onto aimAt(). */
  function tripodAngles(T) {
    if (!B.o || !T) return;
    const A = aimAt(), dx = T.x - A.x, dy = T.y - A.y, dz = T.z - A.z, D = Math.max(1e-3, Math.hypot(dx, dy, dz));
    B.o.azimuth = Math.atan2(dx, dz); B.o.elevation = Math.asin(clamp(dy / D, -0.2, 0.99)); B.o.distance = D;
  }
  /** Cut the running shot to a tripod (it holds its authored angles: the
   *  anti-occlusion tilt and the see-through window are the follow lens's,
   *  and these framings were searched for a clear view). */
  function cutTo(T) {
    if (!B.o || !T) return;
    B.o.noTilt = true;
    tripodAngles(T);
    // (a cut to a lens further out: the follow lens's occlusion dolly would
    //  ease out to it over half a second — a zoom after the cut. snap()
    //  settles the lens state in one go, and drops the running shot, which is
    //  re-issued at once, this frame: the lens never shows the follow framing)
    try { cam()?.snap?.(); } catch (e) { /* camera gone */ }
    recut();
  }
  /** THE DOORSTEP'S TRIPOD. Searched as the walk comes within APPROACH_L of
   *  the step (update 'carry'; on arrival if the walk was shorter), cut to
   *  once found. Every framing round the door — both sides, nearer to or
   *  further off its axis, closer, higher, lower — is stood where its lens
   *  would be with the carrier ON the step, and scored from there for the
   *  jaws and him on the step, the doorway, him going in at the door, him in
   *  the jaws on the last of the walk (the carrier's own body in the way of a
   *  lens it walks away from), and anything filling the frame at the lens.
   *  A lens within 4.8 u of the path is out (the near-lens clip would turn
   *  the tiger walking past it to glass). inPath: the rail is already the
   *  way in (no walk up to it to score). */
  function pickDoorTripod(inPath = false) {
    const c = B.cat; if (!c) return;
    B.doorTried = true; B.doorTripod = null; B.doorCut = false; B.doorJob = true;
    measureLift(c);
    const T = tigerScale(c), a = Math.atan2(HS.ox, HS.oz), yawIn = Math.atan2(-HS.ox, -HS.oz);
    // (the collider runs, as the old pick: a mild preference for the side
    //  with the longer clear view along the house front)
    const cur = wrapPi((B.o ? B.o.azimuth : a) - a) >= 0 ? 1 : -1;
    const D0 = TUNE.doorDist + 1.5;
    const r1 = clearRun(a + cur * TUNE.doorOff, D0), r2 = clearRun(a - cur * TUNE.doorOff, D0);
    B.doorSide = r2 > r1 + 1.0 ? -cur : cur;
    B.doorRuns = [+r1.toFixed(1), +r2.toFixed(1)];
    gatherOcc(HS.step.x, HS.step.z, TUNE.doorDist + APPROACH_L + 6);
    sphN = 0;
    const V = () => new THREE.Vector3();
    const Js = jawsAt(c, HS.step.x, HS.step.z, yawIn, V());
    const Dw = V().set(HS.step.x - HS.ox * (DOOR_OUT - 0.8), HS.fy + 1.6, HS.step.z - HS.oz * (DOOR_OUT - 0.8));
    // the carrier's own body, on the step and a stride on (facing in): a
    // lens behind it saw its rump, him hidden in front of its chest — the
    // searches skip every cat, so it stands in as spheres
    const sS0 = sphN; tigerSph(T, HS.step.x, floorAt(HS.step.x, HS.step.z), HS.step.z, yawIn, null); const sS1 = sphN;
    const ix = HS.step.x - HS.ox * 1.4, iz = HS.step.z - HS.oz * 1.4;
    const sI0 = sphN; tigerSph(T, ix, floorAt(ix, iz), iz, yawIn, null); const sI1 = sphN;
    const subj = [{ p: Js, w: 1, s0: sS0, s1: sS1, tag: 'jaws' }, { p: V().set(Js.x, Js.y - 0.75, Js.z), w: 1, s0: sS0, s1: sS1, tag: 'him' }, { p: Dw, w: 0.6, s0: sS0, s1: sS1, tag: 'door' }];
    const app = [], near = [];
    B.escAt = null;
    if (!inPath) {
      const seg = R.seg;
      // (the walk up to it, every couple of metres: a porch lamp's post
      //  between two samples stood across him for half a second)
      for (const q of [APPROACH_L, APPROACH_L - 1.5]) {
        if (R.L < q + 0.5) continue;
        const sq = R.L - q; railAt(sq, _t); const y = railYaw(sq, 1.8, c.yaw), x = _t.x, z = _t.z;
        if (Math.hypot(x - HS.step.x, z - HS.step.z) < APPROACH_OUT + 1.6) continue;   // (the last leg is each lens's own: legs below)
        const J = jawsAt(c, x, z, y, V());
        const s0 = sphN; tigerSph(T, x, floorAt(x, z), z, y, headBehind(J, y, T, V()));
        // (the escort padding behind it, as updateEscort walks them)
        for (let i = 0; i < B.escort.length; i++) {
          const e = B.escort[i], back = sq - ESCORT_GAP * (i + 1); if (back <= 0) continue;
          railAt(back, _ep); const f = railYaw(back, 1.5, y), lat = escortLat(i), ex = _ep.x + Math.cos(f) * lat, ez = _ep.z - Math.sin(f) * lat;
          const Te = tigerScale(e); jawsAt(e, ex, ez, f, _s2, false);
          tigerSph(Te, ex, floorAt(ex, ez), ez, f, headBehind(_s2, f, Te, V()));
        }
        const s1 = sphN;
        subj.push({ p: J, w: 0.35, s0, s1, tag: 'upJ' + q.toFixed(0) }, { p: V().set(J.x, J.y - 0.75, J.z), w: 0.6, s0, s1, tag: 'upM' + q.toFixed(0) });
        // (a hand either side of him along the walk: a thin post slips between single rays)
        const ox = Math.cos(y) * 0.5, oz = -Math.sin(y) * 0.5;
        subj.push({ p: V().set(J.x + ox, J.y - 0.75, J.z + oz), w: 0.3, s0, s1, tag: 'upM+' + q.toFixed(0) }, { p: V().set(J.x - ox, J.y - 0.75, J.z - oz), w: 0.3, s0, s1, tag: 'upM-' + q.toFixed(0) });
        app.push({ x, z, y });
      }
      // where the escort will stand when the carrier stops on the step
      B.escAt = B.escort.map((e, i) => { const back = Math.max(0, R.L - ESCORT_GAP * (i + 1)); railAt(back, _ep); const f = railYaw(back, 1.5, c.yaw), lat = escortLat(i); return { x: _ep.x + Math.cos(f) * lat, z: _ep.z - Math.sin(f) * lat, f }; });
      for (let q = 0; q <= Math.min(R.L - B.s, APPROACH_L + 2); q += 1) { railAt(R.L - q, _t); if (Math.hypot(_t.x - HS.step.x, _t.z - HS.step.z) >= APPROACH_OUT + 1.6) near.push(_t.x, _t.z); }
      R.seg = seg;
    }
    near.push(HS.step.x, HS.step.z);
    // the aim the shot holds on the step (aimAt(): the static jaws, a touch
    // under; TUNE.doorFocus of the way to the door)
    const k0 = TUNE.doorFocus, jy = Js.y - LIFT.oy + 0.3 * T - 0.25;
    const A = V().set(Js.x + (HS.step.x - HS.ox * DOOR_OUT - Js.x) * k0, jy + (HS.fy + 1.5 - jy) * k0, Js.z + (HS.step.z - HS.oz * DOOR_OUT - Js.z) * k0);
    const fov = ctx.camera?.fov || 42;
    const cands = [];
    // him going IN: the carrier a stride past the step, his collar at the
    // door's outer face — the last frame before the cut into the room
    const Jg = jawsAt(c, HS.step.x - HS.ox * 1.4, HS.step.z - HS.oz * 1.4, yawIn, V());
    // (and the way in, for the lens's distance from the tiger's body: the
    //  near-lens clip dithers anything patched nearer than ≈ 3.6 u — the
    //  tiger's flank walked past a lens turned to glass)
    for (let q = 0; q <= 1.6; q += 0.4) near.push(HS.step.x - HS.ox * q, HS.step.z - HS.oz * q);
    // the way the tiger comes up to the step: the lens wants to be SQUARE to
    // it — the tiger in profile along the last of the walk, him dangling
    // under its chin (a lens it walks toward had him covering its mouth, a
    // lens it walks away from saw its rump) — and still see the doorway
    // THE LAST LEG IS THE LENS'S: for a lens at φ off the door's axis the
    // walk's last leg comes up the path at θ = φ ∓ 90° (≤ APPROACH_ANG off the
    // axis) — square to the lens, the tiger in profile — and the rail's tail
    // is re-laid to it when the shot cuts there (retail). Each leg: its
    // approach point walkable and the way to it from the route clear, three
    // samples of the tiger on it (its body as spheres), him and a hand either
    // side of him at each.
    const tail = tailStart(), legs = new Map();
    // (the leg stays between the door's axis and the side the walk comes in
    //  from — a leg out on the far side sent the tiger across the front of
    //  the house and back, walking away from the lens)
    let thIn = 0;
    if (tail) { const qx = tail.x - HS.step.x, qz = tail.z - HS.step.z; thIn = Math.atan2(qx * HS.lx + qz * HS.lz, qx * HS.ox + qz * HS.oz); }
    const thLo = Math.max(-APPROACH_ANG, Math.min(thIn, 0) - 0.3), thHi = Math.min(APPROACH_ANG, Math.max(thIn, 0) + 0.3);
    const legFor = (phi) => {
      let th = phi - Math.sign(phi) * Math.PI / 2;
      const prof = th >= thLo && th <= thHi;
      th = clamp(th, thLo, thHi);
      const key = th.toFixed(3);
      let L = legs.get(key);
      if (L) return L;
      const Ap = approachPt(th, V());
      let ok = inPath || freeAt(Ap.x, Ap.z, 0.5);
      if (ok && !inPath && tail) for (let u = 0.25; u < 1; u += 0.25) if (!freeAt(tail.x + (Ap.x - tail.x) * u, tail.z + (Ap.z - tail.z) * u, 0.45)) { ok = false; break; }
      if (!ok) return railLeg();                     // (no way up that side of the path: the route's own)
      const hy = Math.atan2(HS.step.x - Ap.x, HS.step.z - Ap.z), subs = [], pts = [];
      if (!inPath) for (const f of [0.1, 0.5, 0.9]) {
        const x = Ap.x + (HS.step.x - Ap.x) * f, z = Ap.z + (HS.step.z - Ap.z) * f;
        const J = jawsAt(c, x, z, hy, V());
        const s0 = sphN; tigerSph(T, x, floorAt(x, z), z, hy, headBehind(J, hy, T, V())); const s1 = sphN;
        const ox = Math.cos(hy) * 0.5, oz = -Math.sin(hy) * 0.5;
        subs.push({ p: J, w: 0.3, s0, s1, tag: 'legJ' + f }, { p: V().set(J.x, J.y - 0.75, J.z), w: 0.6, s0, s1, tag: 'legM' + f },
          { p: V().set(J.x + ox, J.y - 0.75, J.z + oz), w: 0.3, s0, s1, tag: 'legM+' + f }, { p: V().set(J.x - ox, J.y - 0.75, J.z - oz), w: 0.3, s0, s1, tag: 'legM-' + f });
        pts.push(x, z, J.x, J.z);
      }
      L = { th, prof, ok, hy, subs, pts };
      legs.set(key, L);
      return L;
    };
    // the route's own last leg (as buildRoute laid it), for a lens whose
    // square leg cannot be walked
    let RLEG = null;
    const railLeg = () => {
      if (RLEG) return RLEG;
      const subs = [], pts = [], seg = R.seg;
      let hy = yawIn;
      if (!inPath) for (const q of [4.0, 2.2, 0.6]) {
        if (R.L < q + 0.3) continue;
        railAt(R.L - q, _t); const x = _t.x, z = _t.z, y = railYaw(R.L - q, 1.8, yawIn); hy = y;
        const J = jawsAt(c, x, z, y, V());
        const s0 = sphN; tigerSph(T, x, floorAt(x, z), z, y, headBehind(J, y, T, V())); const s1 = sphN;
        const ox = Math.cos(y) * 0.5, oz = -Math.sin(y) * 0.5;
        subs.push({ p: J, w: 0.3, s0, s1, tag: 'railJ' + q }, { p: V().set(J.x, J.y - 0.75, J.z), w: 0.6, s0, s1, tag: 'railM' + q },
          { p: V().set(J.x + ox, J.y - 0.75, J.z + oz), w: 0.3, s0, s1, tag: 'railM+' + q }, { p: V().set(J.x - ox, J.y - 0.75, J.z - oz), w: 0.3, s0, s1, tag: 'railM-' + q });
        pts.push(x, z, J.x, J.z);
      }
      R.seg = seg;
      RLEG = { th: NaN, prof: false, ok: true, hy, subs, pts };
      return RLEG;
    };
    for (const side of [cur, -cur]) for (const off of [TUNE.doorOff, 0.95, 0.6, 1.4, 0.35]) for (const dist of [10.5, 8.5, 7, TUNE.doorDist]) for (const el of [TUNE.doorEl, 0.42, 0.6, 0.78]) {
      const az = a + side * off, ce = Math.cos(el);
      const P = V().set(A.x + Math.sin(az) * ce * dist, A.y + Math.sin(el) * dist, A.z + Math.cos(az) * ce * dist);
      const leg = legFor(side * off);
      if (!leg.ok) continue;
      let dn = Infinity;
      for (let i = 0; i < near.length; i += 2) dn = Math.min(dn, Math.hypot(P.x - near[i], P.z - near[i + 1]));
      for (let i = 0; i < leg.pts.length; i += 2) dn = Math.min(dn, Math.hypot(P.x - leg.pts[i], P.z - leg.pts[i + 1]));
      if (dn < 4.8) continue;
      let pen = (side !== B.doorSide ? 0.2 : 0) + Math.abs(off - TUNE.doorOff) * 0.5 + (TUNE.doorDist - dist) * 0.06 + Math.abs(el - TUNE.doorEl) * 0.5;
      // (a lens the tiger walks AWAY from sees its back: him hidden in front
      //  of its chest; one it walks AT, him sitting on its chest)
      for (const q of app) { const dx = P.x - q.x, dz = P.z - q.z, l = Math.hypot(dx, dz) || 1, f = (dx * Math.sin(q.y) + dz * Math.cos(q.y)) / l; if (f < -0.1) pen += 0.9 * (-f - 0.1); }
      { const dx = P.x - HS.step.x, dz = P.z - HS.step.z, l = Math.hypot(dx, dz) || 1; pen += 1.4 * Math.abs((dx * Math.sin(leg.hy) + dz * Math.cos(leg.hy)) / l); }
      if (P.y < world.height(P.x, P.z) + 1.7) pen += 1;
      // him going in (and a little either side of him, across the line of
      // sight: he swings, he is turned toward the lens — a ray that clears a
      // wall's edge by a hair is no clear view of him)
      const own = [{ p: Jg, w: 0.5, s0: sI0, s1: sI1, tag: 'inJ' }, { p: V().set(Jg.x, Jg.y - 0.75, Jg.z), w: 1, s0: sI0, s1: sI1, tag: 'inM' }];
      for (const [Q, tg, a0, a1] of [[Jg, 'inM', sI0, sI1], [Js, 'him', sS0, sS1]]) {
        const dx = Q.x - P.x, dz = Q.z - P.z, l = Math.hypot(dx, dz) || 1, ux = -dz / l * 0.55, uz = dx / l * 0.55;
        own.push({ p: V().set(Q.x + ux, Q.y - 0.75, Q.z + uz), w: 0.5, s0: a0, s1: a1, tag: tg + '+' }, { p: V().set(Q.x - ux, Q.y - 0.75, Q.z - uz), w: 0.5, s0: a0, s1: a1, tag: tg + '-' });
      }
      for (const q of leg.subs) own.push(q);
      cands.push({ P, az, el, dist, side, off, tag: 'door', pen, own, th: leg.th });
    }
    const frames = [{ A, w: 0.25 }];
    const score = (k, cut) => { const s1 = tripodScore(k.P, subj, frames, fov, cut); return s1 >= cut ? s1 : s1 + tripodScore(k.P, k.own, [], fov, cut - s1); };
    B.doorProbe2 = { A: A.toArray().map((v) => +v.toFixed(2)), subj: subj.map((q) => q.tag), n: cands.length };
    lensJob('door', null, subj, cands, (k) => { B.doorPick = k; }, { fn: score, budget: LENS_RAYS_T + 16, then: (J) => {
      B.doorJob = false; B.doorDbg = { J, subj, frames, fov };
      const k = J.best; if (!k) return;
      // (the shot already on the search's best-so-far: it stays there)
      if (B.doorCut && B.doorTripod) { const T0 = B.doorTripod; if (Math.hypot(T0.x - k.P.x, T0.y - k.P.y, T0.z - k.P.z) > 1e-3) { pickEscortWaits(new THREE.Vector3(T0.x, T0.y, T0.z), [Js, k.own[1].p, Dw]); pickRoomTripod('T'); return; } }
      B.doorSide = k.side; B.doorLens = { off: k.off, el: k.el, dist: k.dist };
      B.doorTripod = { x: k.P.x, y: k.P.y, z: k.P.z }; B.doorTh = k.th;
      pickEscortWaits(k.P, [Js, k.own[1].p, Dw]);
      pickRoomTripod('T');
    } });
  }
  /** Where the escort waits while he is put to bed: on the lawn off the step,
   *  looking at the door — never in the doorstep tripod's sight lines (its
   *  lens to the jaws, to him glancing back, to the doorway), nor at its
   *  lens, nor on the step. (An escort's head filled the lens beside him.) */
  function pickEscortWaits(P, pts) {
    B.wait = [];
    for (let i = 0; i < 2; i++) {
      const side = i ? -1 : 1;
      // (best: where it already is when the carrier stops — padding behind on
      //  the way up — and it just sits; else round the lawn off the step)
      const at = B.escAt && B.escAt[i];
      const x0 = at ? at.x : HS.step.x + HS.ox * 4.2 + HS.lx * side * 2.2, z0 = at ? at.z : HS.step.z + HS.oz * 4.2 + HS.lz * side * 2.2;
      const spots = [];
      if (at) for (const b of [0, 1.5, 3, 5]) for (const l of [0, 1.8, -1.8, 3.2, -3.2]) spots.push([at.x - Math.sin(at.f) * b + Math.cos(at.f) * l, at.z - Math.cos(at.f) * b - Math.sin(at.f) * l]);
      for (const o of [4.2, 5.6, 3.2, 7.0, 8.5]) for (const l of [2.2, 3.6, 5.0, 0.8, 6.4]) for (const sg of [side, -side]) spots.push([HS.step.x + HS.ox * o + HS.lx * sg * l, HS.step.z + HS.oz * o + HS.lz * sg * l]);
      let best = null, bc = Infinity;
      for (let [x, z] of spots) {
        if (typeof H.resolveSpot === 'function') { const q = H.resolveSpot(x, z, 2.5, 0.8); if (!q) continue; x = q[0]; z = q[1]; }
        if (Math.hypot(x - P.x, z - P.z) < 6 || Math.hypot(x - HS.step.x, z - HS.step.z) < 2.6) continue;
        let bad = false;
        for (const u of B.wait) if (Math.hypot(x - u.x, z - u.z) < 2.6) bad = true;
        // (a tiger is a big thing: 3 u clear of every sight line, to a little past him)
        for (const q of pts) if (segDist(x, z, P.x, P.z, q.x, q.z, 0.05, 1.15) < 3.0) bad = true;
        if (bad) continue;
        const cst = Math.hypot(x - x0, z - z0);
        if (cst < bc) { bc = cst; best = { x, z }; }
      }
      // (nowhere clear near the step: well out on the lawn)
      B.wait.push(best || { x: HS.step.x + HS.ox * 10 + HS.lx * side * 3, z: HS.step.z + HS.oz * 10 + HS.lz * side * 3 });
    }
  }
  /** The guest door's leaf, stood open (as it will be when the room's shot
   *  runs) for the length of a search step — and put back. */
  const LEAF = { on: false, a: 0, b: 0 };
  function leafOpen(on) {
    const d = HS.door; if (!d || !d.holder || !Number.isFinite(d.swing)) return;
    if (on && !LEAF.on) {
      LEAF.on = true; LEAF.a = d.holder.rotation.y; d.holder.rotation.y = d.base + d.swing;
      if (d.pair) { LEAF.b = d.pair.rotation.y; d.pair.rotation.y = d.base + (d.swing2 ?? -d.swing); }
    } else if (!on && LEAF.on) {
      LEAF.on = false; d.holder.rotation.y = LEAF.a;
      if (d.pair) d.pair.rotation.y = LEAF.b;
    } else return;
    d.holder.updateMatrixWorld(true); d.pair?.updateMatrixWorld(true);
  }
  /** THE ROOM'S TRIPOD — the tuck. Searched as soon as the doorstep's is
   *  found, a lens INSIDE the guest room under its ceiling. The camera never
   *  crosses the door: the doorstep's tripod watches the tiger take him in
   *  through the lit doorway, and the shot CUTS here — the carrier at the
   *  bedside with him in its jaws over the pillow (update 'arrive'). Scored
   *  for him on the pillow with the carrier's head bowed over it (head, neck,
   *  shoulders as spheres: a lens on the tiger's side of the bed saw the back
   *  of its head), its face, him hanging at the bedside; its frame clear of
   *  anything at the lens, the carrier's own body counted (a foreleg beside
   *  the lens was a dark wedge over a third of the frame); and no lens within
   *  TUCK_CLEAR of the carrier (the camera's near-lens clip dithers a body
   *  that close into shards). A grid over the room's floor at three heights,
   *  across the bed from the tiger (or at its foot) preferred. */
  const ROOM_H = [3.4, 4.0, 2.8];
  const FOOT_C = Math.cos(0.45), FOOT_S = Math.sin(0.45);   // (the tuck's lens: off the bed's axis, away from the tiger)
  const TUCK_CLEAR = 3.0;
  function pickRoomTripod() {
    const c = B.cat, r = HS.room; if (!c || !r) return;
    B.tuckTripod = null; B.roomJob = true;
    const T = tigerScale(c), V = () => new THREE.Vector3();
    gatherOcc(r.x, r.z, Math.hypot(r.w, r.d) / 2 + DOOR_OUT + 4, null, OCC, true);
    sphN = 0;
    const subj = [];
    // at the bedside, hanging (in front of its chest: its body behind him)
    const Jb = jawsAt(c, HS.side.x, HS.side.z, HS.side.yaw, V());
    let s0 = sphN; tigerSph(T, HS.side.x, HS.fy, HS.side.z, HS.side.yaw, null); let s1 = sphN;
    subj.push({ p: V().set(Jb.x, Jb.y - 0.75, Jb.z), w: 0.5, s0, s1, tag: 'bedside' });
    // lying on the pillow, the tiger's head bowed over his collar
    liePose(_lp, _lq);
    const head = V().set(0, NECK + 0.28, -0.05).applyQuaternion(_lq).add(_lp);
    const chest = V().set(0, 0.85, 0).applyQuaternion(_lq).add(_lp);
    const col = V().set(0, NECK, -NECK_BACK).applyQuaternion(_lq).add(_lp);
    const tx = HS.side.x - col.x, tz = HS.side.z - col.z, tl = Math.hypot(tx, tz) || 1;
    const hc = V().set(col.x + tx / tl * 0.3 * T, col.y + 0.55 * T, col.z + tz / tl * 0.3 * T);
    const sy = Math.sin(HS.side.yaw), cy = Math.cos(HS.side.yaw);
    // (its head dipped to the pillow and its neck first, then its body and
    //  its head lifted clear of him for the rest of the shot — the 'bedside'
    //  pose: measured off the rig, 1.2 ahead and 0.94 up, × its scale — so
    //  its face can be scored without the dipped head in the way)
    s0 = sphN;
    sphPush(hc.x, hc.y, hc.z, 0.42 * T);
    sphPush((hc.x + HS.side.x + sy * 0.56 * T) / 2, (hc.y + HS.fy + 1.02 * T) / 2, (hc.z + HS.side.z + cy * 0.56 * T) / 2, 0.38 * T);   // (its neck)
    const sB = sphN;
    tigerSph(T, HS.side.x, HS.fy, HS.side.z, HS.side.yaw, null);
    const hb = V().set(HS.side.x + sy * 1.2 * T, HS.fy + 0.94 * T, HS.side.z + cy * 1.2 * T);
    sphPush(hb.x, hb.y, hb.z, 0.55 * T);
    s1 = sphN;
    // its face: just off the lifted head, toward his collar (seen past its skull, not through it)
    const fd = V().subVectors(col, hb); fd.y = 0; fd.normalize();
    const face = V().set(hb.x + fd.x * 0.62 * T, hb.y - 0.05 * T, hb.z + fd.z * 0.62 * T);
    subj.push({ p: head, w: 1, s0, s1, tag: 'pillow' }, { p: chest, w: 0.7, s0, s1, tag: 'chest' }, { p: face, w: 0.6, s0: sB, s1, tag: 'face' });
    const Ab = V(); bedPt(0.55, Ab); Ab.y = HS.fy + 1.2;
    const frames = [{ A: Ab, w: 0.3, s0, s1 }];
    const fov = ctx.camera?.fov || 42;
    const cr = Math.cos(r.rot || 0), sr = Math.sin(r.rot || 0), hw = r.w / 2 - 0.9, hd = r.d / 2 - 0.9;
    const top = (Number.isFinite(r.y) && Number.isFinite(r.h) ? r.y + r.h : HS.fy + 5.9) - HS.fy - 1.2;
    const sdx = HS.side.x - HS.bx, sdz = HS.side.z - HS.bz, sdl = Math.hypot(sdx, sdz) || 1;
    const cands = [];
    for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 5; iz++) for (let ih = 0; ih < ROOM_H.length; ih++) {
      const lx = -hw + ix * hw / 2, lz = -hd + iz * hd / 2;
      const x = r.x + lx * cr + lz * sr, z = r.z - lx * sr + lz * cr;
      const P = V().set(x, HS.fy + Math.min(ROOM_H[ih], top), z);
      if (!freeAt(x, z, 0.45) || Math.hypot(x - head.x, z - head.z) < 2.6) continue;
      // (never within TUCK_CLEAR of the carrier's body, head or neck)
      let dt = Infinity;
      for (let i = s0; i < s1; i++) { const j = i * 4; dt = Math.min(dt, Math.hypot(P.x - SPH[j], P.y - SPH[j + 1], P.z - SPH[j + 2]) - SPH[j + 3]); }
      if (dt < TUCK_CLEAR) continue;
      const bd = Math.hypot(x - HS.bx, z - HS.bz);
      let pen = ih * 0.08 + 0.05 * Math.abs(bd - 4.6) + (overBed(x, z) ? 0.4 : 0);
      pen += 0.8 * Math.max(0, ((x - HS.bx) * sdx + (z - HS.bz) * sdz) / (sdl * Math.max(1, bd)));   // (on the tiger's side of the bed)
      // from the foot of the bed, a little to the far side of it from the
      // tiger: him lying up the bed to the pillow, the tiger beside it
      // leaning over him — not across the bed, its bulk between (the lens
      // looking back over the pillow had its head filling half the frame)
      { const ux = x - head.x, uz = z - head.z, ul = Math.hypot(ux, uz) || 1;
        const dx = -HS.hx * FOOT_C - sdx / sdl * FOOT_S, dz = -HS.hz * FOOT_C - sdz / sdl * FOOT_S;
        pen += 0.7 * (1 - (ux * dx + uz * dz) / ul) + 0.08 * Math.abs(ul - 5.2); }
      cands.push({ P, tag: 'roomT', pen, lx: +lx.toFixed(2), lz: +lz.toFixed(2), h: +(P.y - HS.fy).toFixed(2) });
    }
    (B.roomProbe || (B.roomProbe = {})).T = { subj: subj.map((q) => q.tag), n: cands.length };
    lensJob('roomT', null, subj, cands, (k) => { B.roomPick = k; }, { fn: (k, cut) => tripodScore(k.P, subj, frames, fov, cut), budget: LENS_RAYS_T,
      pre: () => leafOpen(true), post: () => leafOpen(false), then: (J) => {
        (B.roomDbg || (B.roomDbg = {})).T = { J, subj, frames, fov };
        B.roomJob = false;
        const k = J.best;
        if (k) B.tuckTripod = { x: k.P.x, y: k.P.y, z: k.P.z };
      } });
  }
  // ── the walk's sight lines, planned ahead ──────────────────────────────────
  // The lead lens is predicted along the route every WP_DS u — its azimuth
  // eased as update() eases it, its elevation and distance as update() sets
  // them — and the rays from where it will stand to the jaws, him and his
  // feet are tested. Where something stands in them (a lamp post, a porch, a
  // tree) the lens is steered round it: for each blocked run, the least swing
  // (WCAND: azimuth, elevation) that clears the most of it, eased in over
  // WP_RAMP u before the run and out over WP_RAMP after (walkBias). Runs on
  // its own occluder list (WOCC) at WALK_RAYS a frame, well ahead of him.
  const WP_DS = 1.0, WP_MAX = 320, WP_RAMP = 4.5, WALK_RAYS = 32;
  // (the frame's own near-lens test: four rays, left, right, low, high — a
  //  wall at the lens that does not stand between it and him still fills the frame)
  const WFRAME = [[-0.72, 0.08], [0.72, 0.08], [0, -0.5], [0, 0.56]];
  // (swings in FRONT-ward units: + round toward the carry's front — his face
  //  and the jaws on his collar — only a little the other way: swung round
  //  behind it, its head stood between the lens and his chest, and the
  //  see-through window cut it to glass)
  // (a third term: the lens brought IN, × that of its distance — between a
  //  street's shopfronts a side-on lens fits closer in, where 10 u out it
  //  stood inside a shop and the plan swung it round to his front)
  // (last resorts: the OTHER side of the walk — round through his front —
  //  where a house stands all along this side: beside the guest house the
  //  lens stood inside it)
  const WCAND = [[0, 0], [0.22, 0], [0, 0, 0.62], [-0.22, 0], [0, 0.12], [0.22, 0, 0.62], [0, 0.12, 0.62], [0.44, 0], [-0.22, 0, 0.62], [0.22, 0.12], [0.66, 0], [0.44, 0, 0.62], [-0.22, 0.12], [0.44, 0.12], [0.9, 0], [0, 0.24], [2.5, 0], [2.5, 0, 0.62], [2.5, 0.12]];
  /** Candidate k's azimuth swing, signed for the side the lens rides on. */
  const wAz = (k) => (B.side ? -B.side : 1) * WCAND[k][0];
  const wDk = (k) => WCAND[k][2] ?? 1;
  const WP = { n: 0, i: 0, s: new Float32Array(WP_MAX), az: new Float32Array(WP_MAX), el: new Float32Array(WP_MAX), d: new Float32Array(WP_MAX), mask: new Uint32Array(WP_MAX), runs: [], done: true, gi: -1, rays: 0, ms: 0, blocked: 0, frames: 0 };
  const leadAzAt = (s, t, c) => railYaw(s, 6, c.yaw) + B.side * (CAM_FRONT + ORBIT_DRIFT * smoothstep(0, 10, t));
  function planWalk(c, s0, s1) {
    WP.n = 0; WP.i = 0; WP.runs.length = 0; WP.done = true; WP.gi = -1; WP.rays = 0; WP.ms = 0; WP.maxMs = 0; WP.blocked = 0; WP.frames = 0; WP.phase = 1; WP.stuck = 0;
    if (!c || !(s1 > s0 + 1)) return;
    measureLift(c);
    let az = B.camAz, el = B.elBase ?? CAM_EL, t = B.t;
    const kA = 1 - Math.exp(-CAM_TURN * WP_DS / SPEED), kE = 1 - Math.exp(-1.1 * WP_DS / SPEED);
    const seg = R.seg;
    for (let s = s0; s <= s1 && WP.n < WP_MAX; s += WP_DS) {
      const i = WP.n++;
      if (i > 0) { t += WP_DS / SPEED; az += wrapPi(leadAzAt(s, t, c) - az) * kA; el += (CAM_EL - el) * kE; }
      WP.s[i] = s; WP.az[i] = az; WP.el[i] = el; WP.d[i] = CAM_D0 + (CAM_D1 - CAM_D0) * smoothstep(0, 1, s / Math.max(1, R.L)); WP.mask[i] = 0;
    }
    R.seg = seg;
    WP.done = WP.n === 0;
  }
  const _wA = new THREE.Vector3(), _wJ = new THREE.Vector3(), _wM = new THREE.Vector3(), _wF = new THREE.Vector3(), _wP = new THREE.Vector3();
  /** Is sample i clear with the lens swung by (daz, del)? (the scene round
   *  it gathered first: WOCC, a group of 8 samples at a time) */
  function walkTest(c, i, daz, del, u = 0, dk = 1) {
    // (u: that far on toward sample i+1 — the verify pass looks between samples)
    const j = Math.min(WP.n - 1, i + 1), sv = WP.s[i] + (WP.s[j] - WP.s[i]) * u;
    const g = Math.floor(i / 8);
    if (g !== WP.gi) { WP.gi = g; railAt(WP.s[Math.min(WP.n - 1, g * 8 + 4)], _t); gatherOcc(_t.x, _t.z, 6 + CAM_D0 + 5, null, WOCC); occNow = WOCC; }
    railAt(sv, _t); const y = railYaw(sv, 1.8, c.yaw), x = _t.x, z = _t.z;
    jawsAt(c, x, z, y, _wJ);
    jawsAt(c, x, z, y, _wA, false); _wA.y += 0.3 * tigerScale(c) - 0.25;
    _wM.set(_wJ.x, _wJ.y - 0.75, _wJ.z); _wF.set(_wJ.x, _wJ.y - 1.45, _wJ.z);
    const a = WP.az[i] + wrapPi(WP.az[j] - WP.az[i]) * u + daz, e = WP.el[i] + (WP.el[j] - WP.el[i]) * u + del, d = (WP.d[i] + (WP.d[j] - WP.d[i]) * u) * dk, ce = Math.cos(e);
    _wP.set(_wA.x + Math.sin(a) * ce * d, _wA.y + Math.sin(e) * d, _wA.z + Math.cos(a) * ce * d);
    return rayHit(_wP, _wJ, 0.55) === Infinity && rayHit(_wP, _wM, 0.55) === Infinity && rayHit(_wP, _wF, 0.55) === Infinity && frameNear(_wP, _wA) <= 1;
  }
  /** The run whose steer is the one applied at s (as walkBias picks it). */
  function runAt(s) {
    let best = null, w = 0;
    for (let i = 0; i < WP.runs.length; i++) {
      const r = WP.runs[i];
      const k = s < r.sa ? smoothstep(r.sa - WP_RAMP, r.sa, s) : s > r.sb ? 1 - smoothstep(r.sb, r.sb + WP_RAMP, s) : 1;
      const m = k * (Math.abs(r.daz) + r.del + (1 - (r.dk ?? 1)));
      if (m > w) { w = m; best = r; }
    }
    return best;
  }
  function stepWalk() {
    if (WP.done) return;
    const c = B.cat; if (!c) { WP.done = true; return; }
    const t0 = performance.now(), r0 = OCC.rays, keep = occNow, seg = R.seg;
    occNow = WOCC;
    WP.frames++;
    while (OCC.rays - r0 < WALK_RAYS && !WP.done) {
      if (WP.phase !== 2) {
        // PASS 1: every sample as planned; a blocked one, every swing
        if (WP.i >= WP.n) { walkRuns(); WP.phase = 2; WP.i = 0; WP.pass = 0; WP.changed = false; WP.gi = -1; continue; }
        const i = WP.i;
        let m = 0;
        for (let k = 0; k < WCAND.length; k++) {
          const clear = walkTest(c, i, wAz(k), WCAND[k][1], 0, wDk(k));
          if (clear) m |= 1 << k;
          if (k === 0 && clear) break;               // (clear as it stands: nothing to steer round)
        }
        WP.mask[i] = m;
        if (!(m & 1)) WP.blocked++;
        WP.i++;
      } else {
        // PASS 2: the steer as it is actually applied — in its ramps a sample
        // stands at part of the swing; blocked there but clear at the full
        // swing, the run holds the full swing over it (a few passes)
        if (WP.i >= WP.n) {
          if (WP.changed && WP.pass < 8) { WP.pass++; WP.i = 0; WP.changed = false; continue; }
          WP.done = true; break;
        }
        const i = WP.i++;
        for (const u of [0, 0.5]) {
          const j = Math.min(WP.n - 1, i + 1), sv = WP.s[i] + (WP.s[j] - WP.s[i]) * u;
          const r = runAt(sv); if (!r) continue;
          walkBias(sv, _wb);
          if (Math.abs(_wb.az - r.daz) < 1e-3 && Math.abs(_wb.el - r.del) < 1e-3 && Math.abs(_wb.dk - (r.dk ?? 1)) < 1e-3 && u === 0 && sv >= r.sa + WP_DS - 1e-3 && sv <= r.sb - WP_DS + 1e-3) continue;   // (held in full on its own run: pass 1 said)
          if (walkTest(c, i, _wb.az, _wb.el, u, _wb.dk)) continue;
          if (walkTest(c, i, r.daz, r.del, u, r.dk ?? 1)) {
            if (sv < r.sa) r.sa = sv - WP_DS * 0.5; else if (sv > r.sb) r.sb = sv + WP_DS * 0.5;
            r.ext = (r.ext || 0) + 1; WP.changed = true;
          } else if (r.alts && r.ai + 1 < r.alts.length) {
            // (neither: this swing's way in or out crosses something — the
            //  run's next swing that cleared it, from its own bounds again)
            r.ai++; const k = r.alts[r.ai];
            r.daz = wAz(k); r.del = WCAND[k][1]; r.dk = wDk(k); r.sa = r.sa0; r.sb = r.sb0; r.ext = 0;
            WP.changed = true;
          } else WP.stuck = (WP.stuck || 0) + 1;
        }
      }
    }
    R.seg = seg; occNow = keep;
    const dms = performance.now() - t0;
    WP.ms += dms; WP.maxMs = Math.max(WP.maxMs || 0, dms); WP.rays += OCC.rays - r0;
  }
  /** How many of WFRAME's rays, from a lens at P aimed at A, meet something
   *  in the first 45% of the way. */
  function frameNear(P, A) {
    _lf.subVectors(A, P); const dist = _lf.length(); if (dist < 0.5) return 0;
    _lf.divideScalar(dist); _lr.crossVectors(_lf, _UP).normalize(); _lu.crossVectors(_lr, _lf);
    const cm = ctx.camera, tv = Math.tan(((cm?.fov || 42) * Math.PI / 180) / 2), th = tv * (cm?.aspect || 1.6);
    let n = 0;
    for (let i = 0; i < WFRAME.length; i++) {
      const sx = WFRAME[i][0] * th * dist, sy = WFRAME[i][1] * tv * dist;
      _lt.set(A.x + _lr.x * sx + _lu.x * sy, A.y + _lr.y * sx + _lu.y * sy, A.z + _lr.z * sx + _lu.z * sy);
      const hd = rayHit(P, _lt, 1.3, true);
      if (hd < 0.45 * P.distanceTo(_lt)) n++;
      if (n > 1) return n;
    }
    return n;
  }
  /** The blocked runs (a lone clear sample inside one is part of it), each
   *  with the one swing that clears the most of it. */
  function walkRuns() {
    WP.runs.length = 0;
    let a = -1;
    for (let i = 0; i <= WP.n; i++) {
      const bl = i < WP.n && !(WP.mask[i] & 1);
      if (bl) { if (a < 0) a = i; continue; }
      if (a < 0) continue;
      if (i + 1 < WP.n && !(WP.mask[i + 1] & 1)) continue;
      let b = i - 1; while (b > a && (WP.mask[b] & 1)) b--;
      const alts = [];
      for (let k = 1; k < WCAND.length; k++) {
        let n = 0; for (let j = a; j <= b; j++) if (WP.mask[j] & (1 << k)) n++;
        // (a swing that clears under half of it is no answer: the camera's own window then)
        if (n * 2 >= b - a + 1) alts.push([k, n]);
      }
      alts.sort((p, q) => q[1] - p[1] || p[0] - q[0]);
      if (alts.length) {
        const k = alts[0][0], sa = WP.s[a] - WP_DS, sb = WP.s[b] + WP_DS;
        WP.runs.push({ sa, sb, sa0: sa, sb0: sb, daz: wAz(k), del: WCAND[k][1], dk: wDk(k), n: b - a + 1, cleared: alts[0][1], alts: alts.map((q) => q[0]), ai: 0 });
      }
      a = -1;
    }
  }
  const _wb = { az: 0, el: 0, dk: 1 };
  function walkBias(s, out) {
    let az = 0, el = 0, dk = 1, w = 0;
    for (let i = 0; i < WP.runs.length; i++) {
      const r = WP.runs[i];
      const k = s < r.sa ? smoothstep(r.sa - WP_RAMP, r.sa, s) : s > r.sb ? 1 - smoothstep(r.sb, r.sb + WP_RAMP, s) : 1;
      const m = k * (Math.abs(r.daz) + r.del + (1 - (r.dk ?? 1)));
      if (m > w) { w = m; az = r.daz * k; el = r.del * k; dk = 1 - (1 - (r.dk ?? 1)) * k; }
    }
    out.az = az; out.el = el; out.dk = dk;
    return out;
  }

  // ── the lens's bearings ────────────────────────────────────────────────────
  /** Which side of the carry the lens rides on: the one nearer where the
   *  gameplay lens already is (the least swing). */
  function leadSide(c) {
    const h0 = railYaw(B.s, 6, c.yaw);
    const a1 = Math.abs(wrapPi(h0 + CAM_FRONT - B.camAz)), a2 = Math.abs(wrapPi(h0 - CAM_FRONT - B.camAz));
    B.side = a1 <= a2 ? 1 : -1;
  }
  /** The lead bearing now: beside where the route goes next (a side profile,
   *  a touch ahead), plus the slow drift round to square-on (≤ ORBIT_MAX). */
  function leadAz(c) {
    const h = railYaw(B.s, 6, c.yaw);
    return h + B.side * (CAM_FRONT + ORBIT_DRIFT * smoothstep(0, 10, B.t));
  }
  /** At the doorstep: well round to the side of the door — the tiger in
   *  profile at the threshold, him hanging under its chin, the door swinging
   *  open beside them, the light spilling. The side is the one with the
   *  longer clear sight line along the house front (B.doorSide, picked once
   *  on arrival): the guest house's west flank is a few metres from its
   *  neighbour's wall, and a lens there filmed the neighbour's clapboard. */
  function doorAz() {
    const a = Math.atan2(HS.ox, HS.oz);
    return a + (B.doorSide || 1) * (B.doorLens ? B.doorLens.off : TUNE.doorOff);
  }
  const doorEl = () => (B.doorLens ? B.doorLens.el : TUNE.doorEl);
  const doorDist = () => (B.doorLens ? B.doorLens.dist : TUNE.doorDist);
  /** How far a low lens at bearing az from the doorstep sees before a solid
   *  collider (benches and planters are looked over). */
  function clearRun(az, max) {
    const sx = Math.sin(az), sz = Math.cos(az);
    for (let d = 1.5; d <= max; d += 0.75) if (!freeAt(HS.step.x + sx * d, HS.step.z + sz * d, 0.35)) return d;
    return max;
  }
  function pickDoorSide() {
    const a = Math.atan2(HS.ox, HS.oz);
    const cur = wrapPi(B.o ? B.o.azimuth - a : 0) >= 0 ? 1 : -1;
    const D = TUNE.doorDist + 1.5;
    const r1 = clearRun(a + cur * TUNE.doorOff, D), r2 = clearRun(a - cur * TUNE.doorOff, D);
    B.doorSide = r2 > r1 + 1.0 ? -cur : cur;
    B.doorRuns = [+r1.toFixed(1), +r2.toFixed(1)];
    B.doorLens = null;
    // …and then the SIGHT LINES, which the collider runs cannot see: the
    // house's own front (its fan-light, its window bay) stood across the
    // town-side lens and hid him behind the jamb. Every framing round the
    // door — both sides, nearer to or further off its axis, closer, higher,
    // lower — is scored from where its lens would stand, and the least
    // blocked (the authored one when it is clean) is the doorstep shot.
    const c = B.cat; if (!c) return;
    gatherOcc(HS.step.x, HS.step.z, TUNE.doorDist + 8);
    // scored where the shot is held: the carrier ON the doorstep, facing in
    // (it is still a pace or more out when this runs) — its jaws there, as the
    // rig holds them now (the head's lift over the static geometry kept)
    mouthOf(c, _s0); mouthOf(c, _s1, false);
    const s0 = Math.sin(c.yaw), c0 = Math.cos(c.yaw), ox = _s0.x - _s1.x, oy = _s0.y - _s1.y, oz = _s0.z - _s1.z;
    const fw = ox * s0 + oz * c0, lt = ox * c0 - oz * s0;          // the rig's lift, in the carrier's own frame
    const kx = c.x, kz = c.z, ky = c.y, kw = c.yaw, yaw = Math.atan2(-HS.ox, -HS.oz);
    c.x = HS.step.x; c.z = HS.step.z; c.y = floorAt(HS.step.x, HS.step.z); c.yaw = yaw;
    const A = doorAim(c, _da);
    mouthOf(c, _s0, false);
    c.x = kx; c.z = kz; c.y = ky; c.yaw = kw;
    const s1 = Math.sin(yaw), c1 = Math.cos(yaw);
    _s0.x += fw * s1 + lt * c1; _s0.z += fw * c1 - lt * s1; _s0.y += oy;
    A.x += (fw * s1 + lt * c1) * (1 - TUNE.doorFocus); A.z += (fw * c1 - lt * s1) * (1 - TUNE.doorFocus); A.y += oy * (1 - TUNE.doorFocus);
    _s1.set(_s0.x, _s0.y - 0.75, _s0.z);               // his middle
    _s2.set(HS.step.x - HS.ox * (DOOR_OUT - 0.8), HS.fy + 1.6, HS.step.z - HS.oz * (DOOR_OUT - 0.8));   // the doorway (out of its reveal)
    const cands = [];
    for (const side of [cur, -cur]) for (const off of [TUNE.doorOff, 0.8, 1.4, 0.5]) for (const dist of [TUNE.doorDist, 10.5, 8.5]) for (const el of [TUNE.doorEl, 0.42, 0.18]) {
      cands.push({ az: a + side * off, el, dist, side, off, tag: 'door',
        pen: (side !== B.doorSide ? 0.2 : 0) + Math.abs(off - TUNE.doorOff) * 0.5 + (TUNE.doorDist - dist) * 0.06 + Math.abs(el - TUNE.doorEl) * 0.8 });
    }
    lensJob('door', A, [_s0, _s1, _s2], cands, (k) => { B.doorSide = k.side; B.doorLens = { off: k.off, el: k.el, dist: k.dist }; });
  }
  const _da = new THREE.Vector3(), _s0 = new THREE.Vector3(), _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3();
  /** Where the doorstep shot aims (as aimAt() will, focus TUNE.doorFocus on
   *  the door) with the carrier where it is now. */
  function doorAim(c, out) {
    mouthOf(c, _m, false); _m.y += 0.3 * tigerScale(c) - 0.35;
    const fx = HS.step.x - HS.ox * DOOR_OUT, fz = HS.step.z - HS.oz * DOOR_OUT, fy = HS.fy + 1.5, k = TUNE.doorFocus;
    return out.set(_m.x + (fx - _m.x) * k, _m.y + 0.1 + (fy - _m.y - 0.1) * k, _m.z + (fz - _m.z) * k);
  }
  /** In the room: from the door side and the front, across the bed at the
   *  tiger leaning over the pillow (the shell has gone: he is inside). */
  function roomAz() { const k = -(HS.sd || 1) * 0.85; return Math.atan2(HS.lx * k + HS.ox * 0.6, HS.lz * k + HS.oz * 0.6); }
  /** The room framing's distance (the no-tripod fallback): never further
   *  than the room's own walls — a lens out past the front wall filmed the
   *  wall's cut caps, blue slabs across the bed. */
  const TUCK_EL = 0.66;
  function roomDist(want, az, el) { return Math.min(want, roomRun(_foc.x, _foc.z, az, 0.5) / Math.max(0.3, Math.cos(el))); }
  /** Is he at the guest room's threshold — his feet (where late() hung him
   *  last frame) within a frame's walk, and a hand, of its floor? The house
   *  counts him inside from there, and its shell fades round him. */
  function atThreshold() {
    const r = HS.room, P = pl()?.position;
    if (!r || !P) return B.s >= (B.sDoor || 0);
    const c = Math.cos(r.rot || 0), s = Math.sin(r.rot || 0), dx = P.x - r.x, dz = P.z - r.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < r.w / 2 + 0.5 && Math.abs(lz) < r.d / 2 + 0.3;
  }
  /** THE CUT INTO THE ROOM: he is through the doorway; the carrier is at the
   *  bedside with him still in its jaws over the pillow, its head still up
   *  (the tuck lowers it), the lamp lit — and the shot is on the tuck's
   *  tripod. (The walk across the room happens in the cut.) */
  function cutIn(c) {
    B.inCut = true;
    if (c) {
      place(c, HS.side.x, HS.side.z, HS.side.yaw);
      hold(c, 0, 'carry', HS.side.yaw);
      if (B.raid) { c.pose = 'carry'; c.yaw = HS.side.yaw; }
    }
    B.s = R.L;
    B.lampK = Math.max(B.lampK, 0.85); B.lampWant = 1;
    focusK = 0.85; bedPt(0.55, _foc); _foc.y = HS.fy + 1.2;
    setStage('tuck');
    // (the shot opens on the tuck itself — its head right down over the
    //  pillow, him already turned onto his back, halfway from its jaws to the
    //  pillow: from the foot of the bed a carrier stood at the bedside with
    //  him hanging in front of its chest hid him behind its shoulder)
    B.t = TUCK_IN;
    // (late() this very frame lays him as the tuck has him by now, not
    //  hanging legs-down from jaws already at the pillow)
    B.tuckU = smoothstep(REL0, REL1, B.t); B.mode = B.tuckU >= 1 ? 'bed' : 'tuck';
    if (c) { hold(c, 0, 'tuck', HS.side.yaw); if (c.tg) c.tg.snap = true; }
    if (B.o && B.tuckTripod) { B.tuckOn = true; B.tripod = { ...B.tuckTripod }; cutTo(B.tripod); }
    else if (B.o) {
      B.o.azimuth = roomAz(); B.o.elevation = TUCK_EL; B.o.distance = roomDist(8.4, B.o.azimuth, TUCK_EL); B.o.noTilt = true;
      try { cam()?.snap?.(); } catch (e) { /* camera gone */ }
      recut();
    }
  }

  // ── start ──────────────────────────────────────────────────────────────────
  function takePlayer() {
    const p = pl(); if (!p) return;
    B.savedFacing = Number.isFinite(p.facing) ? p.facing : 0;
    p.locked = true; p.onFerry = true;
    p.setEmotion?.('scared');
    p.setPose?.('flail');                            // a startled kick (limp at FLAIL_SECS)
    B.limp = false;
    p.velocity?.set?.(0, 0, 0);
  }
  function goLimp() { if (B.limp) return; B.limp = true; pl()?.setPose?.(TUNE.kitten ? 'sit' : 'stand'); }
  function begin(c, o = {}) {
    house();
    B.on = true; B.cat = c; B.raid = !!o.raid; B.name = c.tiger || { short: c.name, full: c.name };
    B.keepTiger = true; B.t = 0; B.age = 0; B.s = 0; B.cut = null; B.skip = null; B.skipQueued = false; B.lines = 0; B.purred = false;
    B.mode = 'hang'; B.k = 1; B.tuckU = 0; B.black = false; B.routeOK = false; B.routeTries = 0; B.arriveI = 0; B.twist = 0; B.railPrev = false;
    B.maxGripErr = 0; B.gripErr = 0; B.frames = 0; B.lampK = 0; B.lampWant = 0; B.doorOpen = false;
    B.bodyErr = 0; B.maxBodyErr = 0; B.routeMode = null; B.hopN = 0; B.hops = 0; B.routeMs = 0; B.routeMax = 0; B.routeFrames = 0;
    B.pDown = !!ctx.input?.pointer?.down;
    B.doorLens = null; B.catchLens = null; B.lensPick = null; B.lensJob = null; B.inCut = false; B.tripod = null;
    B.doorTripod = null; B.doorCut = false; B.doorJob = false; B.doorTried = false; B.doorPick = null; B.roomJob = false; B.roomPick = null; B.doorTh = NaN; B.legTh = NaN;
    B.wait = null; B.wbAz = 0; B.wbEl = 0; B.wbDk = 1; B.elBase = CAM_EL;
    B.tuckTripod = null; B.tuckOn = false; B.escAt = null; B.eyes = false; B.keyOn = false;
    eyesOff();
    WP.n = 0; WP.i = 0; WP.done = true; WP.runs.length = 0;
    focusK = 0;
    setBlanket(0, 1);
    c.carryTo = { x: HS.step.x, z: HS.step.z };
    c.scriptPlan = rail; c.plan = rail; c.think = 0; c.homing = false;
    rail.x = c.x; rail.z = c.z; rail.face = c.yaw; rail.moving = false; rail.pose = 'carry';
    H.T.carrying = B;
    B.az0 = liveAzimuth(); B.camAz = B.az0; B.side = 0; B.camD = CAM_D0;
    // (the catch from a little higher — over the street's clutter — easing
    //  down to the carry's 0.32 once they walk)
    // (noTilt: the shot owns its angles, and — held — it shuts the camera's
    //  see-through window, which otherwise cut an ellipse round his chest out
    //  of everything nearer the lens: the tiger's own head, in the jaws beside
    //  him, went to glass. The lens is steered clear of walls instead: the
    //  catch's search, the walk plan, the tripods)
    startShot({ target: aimAt, distance: CAM_D0, elevation: o.raid ? CAM_EL : CAM_EL_CATCH, azimuth: B.az0, duration: 36000, in: o.camIn ?? CATCH_IN, hold: 35998, out: 1.0, noTilt: true });
  }
  /** The town's catch (citizens.js startCarry). */
  function start(c) {
    const p = pl(); if (!p || B.on) return false;
    takePlayer();
    begin(c);
    // the head comes up out of the pounce at once (tiger.js c.poseRate): the
    // jaws at his collar from the first frames, so his heels never have to be
    // held on the paving with the jaws a stride under his collar
    c.poseRate = CATCH_HEAD_RATE;
    pickCatchLens(c);
    // nothing said before the catch plays over it (the hush takes the rest)
    try { ui()?.clear?.(); } catch (e) { /* no ui */ }
    setStage('catch');
    ctx.systems.ui?.say(LINE_CATCH, { speaker: B.name.full });
    ctx.systems.camera?.shake?.(0.45, 0.5);
    ctx.systems.audio?.play?.('growl');
    // the pounce's contact: a scuff of dust at his heels and a few quick glints
    // at the collar — never a white cloud round him (the old 24-puff burst
    // filled the catch shot and hid the tiger saying its line)
    const PS = ctx.systems.particles;
    mouthOf(c, _m);
    PS?.burst?.({ x: _m.x, y: _m.y - 0.1, z: _m.z, count: 7, shape: 'sparkle', blend: 'add', color: [0xffe9a8, 0xfff4e0], speed: 1.4, life: 0.45, size: 0.12, gravity: 0, spread: 0.25 });
    ctx.events.emit('cats:caught', { cat: c, name: B.name.full });
    const st = ctx.systems.story;
    st?.set?.('carried_home', (st.get?.('carried_home') || 0) + 1);
    pickEscort(c.x, c.z);
    return true;
  }
  /** The catch's lens: from the tiger's SIDE (the jaws closing on his collar
   *  in profile — from where the gameplay lens stood, behind him, the tiger
   *  was a grey ear behind his helmet while it said its line), the side
   *  nearer the gameplay lens first, a little over the street's clutter — on
   *  Main Street the lens 0.5 up over the shopfronts looked down through the
   *  awnings and the roofs: round the street, or lower, under them. */
  function pickCatchLens(c) {
    if (!B.o) return;
    gatherOcc(c.x, c.z, CAM_D0 + 6);
    const A = _da.copy(aimAt());
    // (the jaws where the carry pose will hold them — the pounce's head is
    //  still low on this frame — and him hanging from them, and a little
    //  either side of him: a lamp post between the rays hid his whole chest)
    jawsAt(c, c.x, c.z, c.yaw, _s0);
    _s1.set(_s0.x, _s0.y - 0.75, _s0.z);
    const T = tigerScale(c);
    _s2.set(c.x, c.y + 1.1 * T, c.z);                  // the tiger's shoulders
    const sx = Math.cos(c.yaw) * 0.45, sz = -Math.sin(c.yaw) * 0.45;
    const sub = [_s0, _s1, _s2, new THREE.Vector3(_s1.x + sx, _s1.y, _s1.z + sz), new THREE.Vector3(_s1.x - sx, _s1.y, _s1.z - sz), new THREE.Vector3(_s1.x, _s1.y - 0.55, _s1.z)];
    const cands = [];
    const near = Math.abs(wrapPi(c.yaw + Math.PI / 2 - B.az0)) <= Math.abs(wrapPi(c.yaw - Math.PI / 2 - B.az0)) ? 1 : -1;
    for (const sd of [near, -near]) for (const k of [0, -1, 1, -2, 2, -3]) for (const el of [0.32, 0.2, CAM_EL_CATCH]) for (const dist of [CAM_D1, CAM_D0]) {
      // (k < 0: a little ahead of its shoulder, toward his face)
      const az = c.yaw + sd * (Math.PI / 2 + k * 0.22);
      cands.push({ az, el, dist, tag: 'catch',
        pen: (sd !== near ? 0.25 : 0) + Math.abs(k) * 0.1 + (k > 0 ? 0.08 : 0) + Math.abs(el - 0.32) * 0.4 + (dist - CAM_D1) * 0.03 });
    }
    // (the shot eases toward the best so far: update() 'catch')
    lensJob('catch', A, sub, cands, (b) => { B.catchLens = { az: b.az, el: b.el, dist: b.dist }; });
  }
  /** The raid hands its carrier over at the Cat end of the rainbow (or, with
   *  dark: true, in the dark it already faded to — a skip, or no bridge). */
  function fromRaid(c, o = {}) {
    if (B.on) return false;
    const p = pl(); if (!p) return false;
    try {                                            // (the raid carrier's own lines stay queued)
      const q = ui()?.sayQueue, who = c.tiger?.full;
      if (Array.isArray(q)) for (let i = q.length - 1; i >= 0; i--) if (q[i] && q[i].speaker && q[i].speaker !== who) q.splice(i, 1);
    } catch (e) { /* optional */ }
    p.locked = true; p.onFerry = true;
    B.savedFacing = Number.isFinite(p.facing) ? p.facing : 0;
    c.mode = 'rail';
    begin(c, { raid: true, camIn: 0.01 });
    B.raid = true; B.limp = false;
    if (o.dark) { B.black = true; tuckNow(); return true; }
    setStage('carry');
    if (B.o) B.o.noTilt = false;                     // (the walk: see update 'catch')
    B.elBase = B.o ? B.o.elevation : CAM_EL;
    B.cut = { phase: 'wait', t: 0 };                 // the dip comes at once: the rainbow is behind him
    pickEscort(c.x, c.z);
    return true;
  }

  // ── stages ─────────────────────────────────────────────────────────────────
  function setStage(s) {
    B.stage = s; B.t = 0;
    ctx.events.emit('cats:carry', { stage: s, raid: B.raid });
  }
  function say(line) { ctx.systems.ui?.say?.(line, { speaker: B.name?.full || 'THE NIGHT WATCH' }); }
  function openDoor(v) {
    B.doorOpen = v;
    try { ctx.systems.catArchitecture?.openDoor?.('guest', v); } catch (e) { /* no house */ }
  }
  /** Skip / the raid's dark: straight to LIGHTS OUT — he is in bed, the
   *  carrier at the bedside, the blanket up, all in the dark. */
  function tuckNow() {
    const c = B.cat;
    if (c) {
      place(c, HS.side.x, HS.side.z, HS.side.yaw);
      hold(c, 0, 'tuck', HS.side.yaw);
      if (B.raid) { c.pose = 'tuck'; c.yaw = HS.side.yaw; }
    }
    for (let i = 0; i < B.escort.length; i++) {
      const o = B.escort[i];
      escortWait(i, _ep);
      place(o, _ep.x, _ep.z, Math.atan2(HS.step.x - HS.ox * DOOR_OUT - _ep.x, HS.step.z - HS.oz * DOOR_OUT - _ep.z));
    }
    B.mode = 'bed'; B.tuckU = 1; B.limp = true;
    pl()?.setPose?.('stand');
    setBlanket(1, 2.05);
    focusK = 1; bedPt(0.7, _foc); _foc.y = HS.fy + 1.2;
    B.lampK = 0; B.lampWant = 0;
    B.eyes = false; eyesOff();                       // (a skip goes straight through the dark)
    setStage('dark');
    B.t = DARK_SECS;
  }
  function wakeUp() {
    const c = B.cat;
    // the carrier: a cat again, asleep on his feet (a raider goes home;
    // then it is the neighbour whose house is nearest the guest house)
    B.keepTiger = false;
    for (const e of B.escort) { release(e); e.carryTo = null; }
    B.escort.length = 0;
    let sleeper = null;
    if (c && !B.raid) { c.carryTo = null; c.gaitK = 1; sleeper = c; }
    if (B.raid) {
      if (c) { c.carryTo = null; c.gaitK = 1; }
      try { H.raidEnd?.(); } catch (e) { /* the raid is its own */ }
      let bd = Infinity;
      for (const o of H.cats) {
        if (o.spec.crowd || o.spec.fixed || o.sched === 'kitten' || o.spec.noTiger) continue;
        const d = (o.home[0] - HS.bx) ** 2 + (o.home[1] - HS.bz) ** 2;
        if (d < bd) { bd = d; sleeper = o; }
      }
    }
    B.sleeper = sleeper;
    if (sleeper) {
      // curled on his feet, its sleeping face turned to the wake-up's lens
      // (which stands inside the room — see below — so nothing cuts it)
      bedPt(-0.95, _t);
      const face = Math.atan2(-HS.hx, -HS.hz) + TUNE.wakeOff * 0.8;
      sleeper.scriptPlan = { act: 'post', x: _t.x, z: _t.z, y: HS.fy + BLANKET_TOP + TUNE.sleepY, pose: 'sleep', face, hold: 1, raised: 1 };
      sleeper.think = 0;
    }
    ctx.state.time = 6;
    ctx.events.emit('time:set', 6);
    H.snap(6);
    if (sleeper) { sleeper.x = sleeper.scriptPlan.x; sleeper.z = sleeper.scriptPlan.z; sleeper.y = sleeper.scriptPlan.y; }
    B.sleepUntil = S.elapsed + 40;
    openDoor(false);
    B.cat = null;                                    // (it is asleep on the bed now)
    B.mode = 'sit';
    const p = pl();
    p?.setPose?.('sit');
    p?.setEmotion?.('neutral');
    // HIS OWN AGAIN, still sitting up in the bed: the controls are his from
    // the first frame of the morning (late() keeps him sitting there); the
    // first step, 'Get up' or WAKE_SECS stands him at the bedside (finish)
    if (p) { p.locked = false; p.onFerry = false; p.velocity?.set?.(0, 0, 0); }
    setBlanket(1, 1.72);
    // the shot: from the window side of the foot of the bed (TUNE.wakeOff off
    // its axis), a little above them — him sitting up AND the cat asleep on
    // his feet in the upper two-thirds, clear of the dialogue box
    const az = Math.atan2(-HS.hx, -HS.hz) + TUNE.wakeOff;
    bedPt(TUNE.wakeAt, _foc); _foc.y = HS.fy + TUNE.wakeY; focusK = 1;
    // the lens stays INSIDE the room: a wall between it and the bed opens the
    // camera's see-through window round him, and the window (discarding what
    // stands a pace in front of him) or the wall (round it) cut the sleeping
    // cat on his feet down to a head and two paws
    const wakeD = Math.min(TUNE.wakeDist, roomRun(_foc.x, _foc.z, az, 0.45) / Math.cos(TUNE.wakeEl));
    // (in: 0.01 IS the cut — never camera.snap() under a shot: snap() drops
    //  the running cinematic outright and the lens falls back to the follow)
    startShot({ target: _foc, distance: wakeD, elevation: TUNE.wakeEl, azimuth: az, duration: 36000, in: 0.01, hold: 35998, out: 1.2 });
    // a warm morning glow in the room — the borrowed lamp moved off the
    // bedside to the window side of the foot of the bed, between the lens and
    // the cat asleep on his feet: a key on its face (a black cat in the town's
    // wake-up was an unlit shape filling a third of the frame)
    {
      const ce = Math.cos(TUNE.wakeEl), lx = _foc.x + Math.sin(az) * ce * wakeD, ly = _foc.y + Math.sin(TUNE.wakeEl) * wakeD, lz = _foc.z + Math.cos(az) * ce * wakeD;
      bedPt(-0.95, _t); const sy = HS.fy + BLANKET_TOP + 0.4;
      HS.key = { x: _t.x + (lx - _t.x) * 0.42, y: sy + (ly - sy) * 0.42 + 0.9, z: _t.z + (lz - _t.z) * 0.42 };
      B.keyOn = true;
    }
    B.lampK = 0.62; B.lampWant = 0.62;
    fade(false, 1.2);
    try { ctx.systems.ui?.clear?.(); } catch (e) { /* no ui */ }
    // (anchored to the bed he is sitting up in: by name the ui finds the
    //  house's own door marker, 12 u off, and — now that he is unlocked from
    //  the first frame — closed the line on the frame it opened. And said
    //  from the bed: a staged wake-up had him on the lawn until late(), and
    //  the ui closed the line for his having 'walked off' 13 u)
    if (p?.position) { sitPose(_sp, _sq); p.position.copy(_sp); }
    ctx.systems.ui?.say?.(LINE_WAKE, { speaker: 'THE GUEST HOUSE', pos: { x: HS.bx, z: HS.bz } });
    ctx.systems.ui?.banner?.('06:00', 'Everyone is a normal size again. Nobody mentions it.', 4.0, 'cat');
    setStage('wake');
  }
  /** Out of bed: every player field this touched, back as it was. */
  function finish() {
    const p = pl();
    const cn = cam();
    try { B.cine?.cancel?.(); } catch (e) { /* camera gone */ }
    B.o = null; B.cine = null;
    setBlanket(0, 1);
    B.lampK = 0; B.lampWant = 0;
    if (p) {
      // standing at the bedside, on the window side, facing the door
      const x = HS.bx + HS.lx * 1.9 - HS.hx * 0.2, z = HS.bz + HS.lz * 1.9 - HS.hz * 0.2;
      p.onFerry = false; p.locked = false;
      p.setPose?.('stand'); p.setEmotion?.(null);
      p.setSilhouette?.(!cn?.isFree?.());
      if (p.position) p.position.y = HS.fy + 0.2;
      p.teleport?.(x, z);
      const face = Math.atan2(HS.ox - HS.lx * 0.4, HS.oz - HS.lz * 0.4);
      p.facing = face;
      p.velocity?.set?.(0, 0, 0);
      const g = p.group;
      if (g) { g.rotation.set(0, face, 0); if (p.position) g.position.copy(p.position); }
    }
    if (cn && !B.cine) { /* the cancelled shot eases the lens home */ }
    H.T.carrying = null;
    H.T.graceUntil = S.elapsed + 45;
    B.on = false; B.cat = null; B.keyOn = false;
    eyesOff(); hidePickups(!!H.raidCarrying?.()); hangShadow.visible = false;
    setStage('done');
    B.stage = null;
  }
  function abort() {
    // (something took the carrier away mid-carry: a debug reset) — nothing is dropped
    // mid-air: he is put down where he is, himself again
    const p = pl();
    try { B.cine?.cancel?.(); } catch (e) { /* camera gone */ }
    for (const e of B.escort) release(e);
    B.escort.length = 0;
    if (B.cat) { B.cat.railHop = false; B.cat.air = 0; B.cat.poseRate = 0; }
    // a dip to black this started (a skip, the long walk's cut, lights out)
    // is lifted: the screen never stays dark over a carry that is gone
    if (B.fadeDir === 1 || B.black) { B.fadeReq++; B.fadeDir = 0; B.black = false; try { ui()?.fade?.(false, 0.35); } catch (e) { /* no ui */ } }
    if (B.cat && !B.raid) { B.cat.scriptPlan = null; B.cat.carryTo = null; B.cat.gaitK = 1; }
    setBlanket(0, 1);
    if (p) {
      p.onFerry = false; p.locked = false; p.setPose?.('stand'); p.setEmotion?.(null);
      if (p.position) { p.position.y = floorAt(p.position.x, p.position.z); p.teleport?.(p.position.x, p.position.z); }
      const g = p.group; if (g) g.rotation.set(0, p.facing ?? 0, 0);
    }
    H.T.carrying = null;
    B.on = false; B.cat = null; B.stage = null; B.o = null; B.cine = null; B.lensJob = null; B.keyOn = false;
    eyesOff(); hidePickups(!!H.raidCarrying?.()); hangShadow.visible = false;
    B.doorJob = false; B.roomJob = false; WP.done = true;
    ctx.events.emit('cats:carry', { stage: 'abort', raid: B.raid });
  }

  // ── the hush: nobody else talks over this ──────────────────────────────────
  // (as the flyer's airborne hush: a line from anyone but the carrier or the
  //  house is dropped the moment it is said; speaker-less narration stays)
  ctx.events.on('ui:say', (e) => {
    if (!B.on || !e || !e.speaker) return;
    if (e.speaker === B.name?.full || e.speaker === 'THE GUEST HOUSE') return;
    const u = ui(); if (!u) return;
    try {
      const q = u.sayQueue, txt = String(e.text);
      const i = Array.isArray(q) ? q.findIndex((x) => x && x.text === txt) : -1;
      if (i >= 0) q.splice(i, 1); else u.clear?.();
    } catch (err) { /* optional */ }
  });

  // ── the prompt: E (any key) skips — and nothing else near him answers E ────
  // The interaction system picks the NEAREST entry; this one stands on him, so
  // while he is carried a press never opens a door, starts a chat or climbs
  // into the bed containment offers — it is the skip. (the raid's carry too)
  let blocker = null, blockLabel = '';
  function syncBlocker() {
    const I = ctx.systems.interaction;
    if (!blocker && I && typeof I.register === 'function') {
      blocker = I.register({ id: 'cat_carry_skip', r: 1e6, label: 'Skip to bedtime', enabled: false,
        getPos: () => pl()?.position || _far, onInteract: () => {} });
    }
    if (!blocker) return;
    const raidC = !B.on && !!H.raidCarrying?.();
    const on = raidC || (B.on && B.stage !== null);
    const label = B.stage === 'wake' ? 'Get up' : 'Skip to bedtime';
    if (blocker.enabled !== on) blocker.enabled = on;
    if (label !== blockLabel) {
      blockLabel = label; blocker.label = label;
      if (on && I?.nearest?.() === blocker) ui()?.prompt?.(label, blocker);
    }
  }
  const _far = { x: 1e9, z: 1e9 };

  // ── per frame ──────────────────────────────────────────────────────────────
  const _ax = { x: 0, y: 0, active: false };
  function wantsSkip() {
    const inp = ctx.input; if (!inp) return false;
    const down = !!inp.pointer?.down, edge = down && !B.pDown;
    B.pDown = down;
    return (inp.pressed && inp.pressed.size > 0) || edge;
  }
  function update(dt) {
    // the dawn sleeper gets up once he has gone, or after a while
    if (!B.on && B.sleeper) {
      const P = pl()?.position, sl = B.sleeper;
      if (!P || S.elapsed > B.sleepUntil || (P.x - HS.bx) ** 2 + (P.z - HS.bz) ** 2 > 49 || sl.scriptPlan?.pose !== 'sleep') wakeSleeper();
    }
    syncBlocker();
    hidePickups(B.on || !!H.raidCarrying?.());
    // a star brushed in the jaws (powerups collects for a 'riding' visitor,
    // and the carry rides him on onFerry) is not a star: nobody flees a
    // tiger mid-carry. (A catch never starts with one active.)
    if ((B.on || H.raidCarrying?.()) && ctx.systems.powerups?.active) { try { ctx.systems.powerups.end?.(); B.starsDropped = (B.starsDropped || 0) + 1; } catch (e) { /* optional */ } }
    if (!B.on) return;
    fadeClock(dt);
    const paused = !!ctx.state.paused;
    const d = paused ? 0 : dt;
    const c = B.cat;
    if (B.raid && c && c.mode !== 'rail' && B.stage !== 'wake' && !(B.stage === 'dark' && B.t >= DARK_SECS)) { abort(); return; }
    if (!B.raid && c && c.scriptPlan !== rail && B.stage !== 'wake') { abort(); return; }
    B.t += d; B.age += d; B.clock += d;
    const skipNow = !paused && wantsSkip();
    if (B.lensJob && !paused) stepLens();

    // skip: any key after CATCH → fade, and in the dark straight into bed
    // (a press during the catch itself is kept, and honoured when it ends)
    if (skipNow && B.stage === 'catch') B.skipQueued = true;
    if ((skipNow || B.skipQueued) && !B.skip && B.age > CATCH_SECS && (B.stage === 'carry' || B.stage === 'arrive' || B.stage === 'tuck')) {
      B.skipQueued = false; B.skip = { t: 0 }; fade(true, SKIP_FADE);
    }
    if (B.skip) {
      B.skip.t += d;
      if (B.skip.t > SKIP_FADE + 0.05 && (B.black || B.skip.t > SKIP_FADE + 0.8)) { B.skip = null; B.cut = null; tuckNow(); return; }
    }

    switch (B.stage) {
      case 'catch': {
        hold(c, d, 'carry', c.faceDir);
        if (B.t >= CATCH_HEAD && c.poseRate) c.poseRate = 0;
        // the catch's framing (pickCatchLens), eased to as the search finds it
        const CL = B.catchLens;
        if (CL && B.o) {
          const lam = B.t < 0.1 ? 1 : 1 - Math.exp(-5 * d);
          B.o.azimuth += wrapPi(CL.az - B.o.azimuth) * lam;
          B.o.elevation += (CL.el - B.o.elevation) * lam;
          B.o.distance += (CL.dist - B.o.distance) * lam;
          B.az0 = B.o.azimuth; B.camAz = B.o.azimuth; B.camD = B.o.distance;
        }
        if (B.t >= FLAIL_SECS) goLimp();
        if (!B.routeOK) buildRoute(c.x, c.z);
        if (B.t >= CATCH_SECS && B.routeOK) {
          setStage('carry');
          leadSide(c);
          // (the walk lets the camera's see-through window back in: from
          //  beside them the tiger is never in front of his chest, and in
          //  Whisker Heights' lanes a house can still stand in the way)
          if (B.o) B.o.noTilt = false;
          if (R.L > LONG_L) B.cut = { phase: 'wait', t: 0 };
          B.elBase = B.o ? B.o.elevation : CAM_EL;
          // the walk's sight lines, up to the long walk's dip (then again after it) or the doorstep's tripod
          planWalk(c, 0, B.cut ? Math.min(R.L - APPROACH_L, (LONG_AT + CUT_DIP) * SPEED + 3) : R.L - APPROACH_L);
        }
        break;
      }
      case 'carry': {
        if (!B.limp && !B.raid) goLimp();
        if (!B.routeOK) { if (!buildRoute(c.x, c.z)) { hold(c, d, 'carry', c.faceDir); break; } }
        B.s = Math.min(R.L, B.s + (hopAt(B.s) > 0 ? SPEED * 1.7 : SPEED) * d);
        // ONE edit on a long walk: a dip to black, and they are LONG_LEFT u from the door
        const C = B.cut;
        if (C) {
          C.t += d;
          if (C.phase === 'wait' && (B.raid ? C.t >= 0 : B.t >= LONG_AT) && R.L - B.s > LONG_LEFT + 6) { C.phase = 'down'; C.t = 0; fade(true, CUT_DIP); }
          else if (C.phase === 'wait' && R.L - B.s <= LONG_LEFT + 6) B.cut = null;
          if (C.phase === 'down' && C.t > CUT_DIP + 0.05 && (B.black || C.t > CUT_DIP + 0.6)) {
            B.s = Math.max(B.s, R.L - LONG_LEFT);
            const p = railAt(B.s, _t);
            place(c, p.x, p.z, railYaw(B.s, 1.8, c.yaw));
            for (let i = 0; i < B.escort.length; i++) {
              const o = B.escort[i], back = Math.max(0, B.s - ESCORT_GAP * (i + 1));
              railAt(back, _ep);
              const f = railYaw(back, 1.5, c.yaw), side = i ? -1 : 1;
              place(o, _ep.x + Math.cos(f) * side * 1.1, _ep.z - Math.sin(f) * side * 1.1, f);
            }
            if (B.raid && !B.escort.length) pickEscort(c.x, c.z);
            goLimp();                                  // (the raid carried him knees-up; in the dark he goes limp)
            B.t = Math.max(B.t, LONG_AT);
            if (B.side === 0) leadSide(c);
            B.camAz = leadAz(c);
            B.elBase = B.o ? B.o.elevation : CAM_EL;
            // (the walk from here, planned now: the cut lands on the steered framing)
            planWalk(c, B.s, R.L - APPROACH_L);
            for (let k = 0; k < 8 && WP.phase !== 2 && !WP.done; k++) stepWalk();
            walkBias(B.s, _wb); B.wbAz = _wb.az; B.wbEl = _wb.el; B.wbDk = _wb.dk;
            if (B.o) { B.o.azimuth = B.camAz + B.wbAz; B.o.elevation = B.elBase + B.wbEl; }
            recut();
            fade(false, CUT_LIFT);
            C.phase = 'done';
            ctx.events.emit('cats:carry', { stage: 'cut', raid: B.raid });
          }
        }
        drive(c, d, d > 0 ? SPEED : 0, 'carry');
        // the door swings open AHEAD of them (it is expecting him): the tiger
        // walks straight up the step and in, never stopping on it
        if (!B.doorOpen && (!C || C.phase === 'done') && R.L - B.s < DOOR_EARLY) { openDoor(true); ctx.systems.audio?.play?.('door'); B.lampWant = 1; }
        // a line or two on the way, from the jaws
        if (B.lines === 0 && B.t > 2.2 && !(C && C.phase === 'down')) { B.lines = 1; say(LINES_CARRY[B.raid ? 2 : 0]); }
        if (B.lines === 1 && R.L - B.s < 14 && !B.raid) { B.lines = 2; say(LINES_CARRY[1]); }
        // the doorstep's tripod: searched as they come within APPROACH_L of
        // the step (never before the long walk's dip: it moves them), cut to
        // once found — its lens waits at the door as the tiger walks up
        const settled = !C || C.phase === 'done';
        // (searched a few metres ahead of the cut: it is a big search)
        if (settled && !B.doorTried && !B.lensJob && R.L - B.s < APPROACH_L + DOOR_LEAD) pickDoorTripod();
        // (cutting to it: the rail's last leg re-laid square to its lens)
        if (settled && B.doorTripod && !B.doorCut && B.o && R.L - B.s < APPROACH_L) { B.doorCut = true; retail(B.doorTh); cutTo(B.doorTripod); }
        // (the search still running as they reach the cut: its best so far)
        if (settled && !B.doorTripod && B.doorPick && !B.doorCut && B.o && R.L - B.s < APPROACH_L - 1.5) { const k = B.doorPick; B.doorTripod = { x: k.P.x, y: k.P.y, z: k.P.z }; B.doorTh = k.th; B.doorCut = true; retail(k.th); cutTo(B.doorTripod); }
        if (!paused) stepWalk();
        if (B.o && B.doorCut) tripodAngles(B.doorTripod);
        else if (B.o) {
          // the lens: 11 → 9 u along the walk, orbiting slowly (≤ 30°), and
          // steered round what the plan found in its way (walkBias)
          const k = smoothstep(0, 1, B.s / Math.max(1, R.L));
          const dBase = CAM_D0 + (CAM_D1 - CAM_D0) * k;
          B.elBase += (CAM_EL - B.elBase) * (1 - Math.exp(-1.1 * d));
          B.camAz += wrapPi(leadAz(c) - B.camAz) * (1 - Math.exp(-CAM_TURN * d));
          walkBias(B.s, _wb);
          const lw = 1 - Math.exp(-12 * d);
          B.wbAz += (_wb.az - B.wbAz) * lw; B.wbEl += (_wb.el - B.wbEl) * lw; B.wbDk = (B.wbDk ?? 1) + (_wb.dk - (B.wbDk ?? 1)) * lw;
          B.o.azimuth = B.camAz + B.wbAz;
          B.o.elevation = B.elBase + B.wbEl;
          B.o.distance = dBase * B.wbDk;
        }
        if (B.s >= R.L - 0.02 && !(C && C.phase === 'down')) {
          B.cut = null;
          setStage('arrive');
          // the way in, as a second (short) rail: doorstep → threshold → the bedside
          R.n = 0; railPush(c.x, c.z); railPush(HS.step.x, HS.step.z);
          for (const q of HS.inside) railPush(q.x, q.z);
          railFinish();
          B.hopN = 0; if (c.railHop) { c.railHop = false; c.air = 0; }
          B.sStep = arcNear(HS.step.x, HS.step.z);
          B.sDoor = HS.inside.length > 1 ? arcNear(HS.inside[0].x, HS.inside[0].z) : B.sStep + DOOR_OUT;
          B.atStep = 0;
          B.s = 0;
          B.arriveAz0 = B.o ? B.o.azimuth : B.az0;
          // (a walk shorter than APPROACH_L, or its search still running: the
          //  tripod is searched now — the old framing only if there is none)
          if (!B.doorTried && !B.lensJob) pickDoorTripod(true);
          else if (!B.doorTripod && !B.doorJob && !B.lensJob) pickDoorSide();
        }
        break;
      }
      case 'arrive': {
        goLimp();
        // THE WAY IN, filmed from OUTSIDE: the doorstep's tripod holds, side
        // on, as the tiger walks straight up the step and ducks in through
        // the lit doorway with him hanging from its jaws — it never stops on
        // the step (standing there, his feet a hand over the tread, he read
        // as walked home, not carried). The door swung open ahead of them
        // (update 'carry'); only a short walk waits for it here.
        if (!B.doorOpen) { openDoor(true); ctx.systems.audio?.play?.('door'); }
        if (!B.lampWant) B.lampWant = 1;                     // somebody left the lamp on for you
        const toStep = B.sStep || 0;
        const leaf = HS.door && Number.isFinite(HS.door.t) ? HS.door.t : 1;
        const waiting = B.s >= toStep - 0.02 && leaf < 0.55 && B.t < 1.2;
        if (!waiting) B.s = Math.min(R.L, B.s + IN_SPEED * d);
        const moving = d > 0 && B.s < R.L - 0.02 && !waiting;
        if (moving) drive(c, d, IN_SPEED, 'carry');
        else hold(c, d, 'carry', railYaw(B.s, 1.8, c.yaw));
        // the lens: the doorstep's tripod (cut to on the approach), the aim
        // leaning onto the doorway as they go in — never following him in
        // through the wall
        const lam = 1 - Math.exp(-2.4 * d);
        focusK += (TUNE.doorFocus - focusK) * lam;
        _foc.x = HS.step.x - HS.ox * DOOR_OUT; _foc.z = HS.step.z - HS.oz * DOOR_OUT; _foc.y = HS.fy + 1.5;
        if (B.o && B.doorTripod && !B.doorCut) { B.doorCut = true; cutTo(B.doorTripod); }
        if (B.o && B.doorCut) tripodAngles(B.doorTripod);
        else if (B.o) {
          B.o.azimuth += wrapPi(doorAz() - B.o.azimuth) * lam;
          B.o.elevation += (doorEl() - B.o.elevation) * lam;
          B.o.distance += (doorDist() - B.o.distance) * lam;
        }
        // THE CUT, to the warm room: as he goes through the doorway — before
        // he is inside the room, where the house's shell turns to glass round
        // anyone in it (seen from out here, the whole front wall would ghost)
        if (!B.inCut && (atThreshold() || B.s >= R.L - 0.02 || B.t > 4.5)) cutIn(c);
        break;
      }
      case 'tuck': {
        // (its head right down over the pillow while it lets go of him; then
        //  lifted clear of him, leaning over the bed edge looking down at him —
        //  its face over him, not its skull through his chest)
        hold(c, d, B.t > REL1 + 0.1 ? 'bedside' : 'tuck', HS.side.yaw);
        B.tuckU = smoothstep(REL0, REL1, B.t);
        B.mode = B.tuckU <= 0 ? 'hang' : B.tuckU >= 1 ? 'bed' : 'tuck';
        if (B.tuckU > 0.35) pl()?.setPose?.('stand');
        setBlanket(smoothstep(BLANKET0, BLANKET1, B.t), 2.05);
        if (B.lines < 3 && B.t > 0.2) { B.lines = 3; say(LINE_TUCK); }
        if (B.t > 1.5 && !B.purred) {
          B.purred = true;
          ctx.systems.audio?.play?.('purr');
          mouthOf(c, _m);
          ctx.systems.particles?.burst?.({ x: _m.x, y: _m.y - 0.2, z: _m.z, count: 10, shape: 'sparkle', blend: 'add', color: [0xffe0a8, 0xfff4e0, 0xffc0d8], speed: 0.6, life: 1.6, size: 0.14, gravity: 0.5, spread: 0.6 });
        }
        {
          // the aim: the pillow, and a third of the way to the tiger's head
          // bowed over it — its face in the shot with him, not off its edge
          const kf = 1 - Math.exp(-3 * d); bedPt(0.55, _t);
          const TG = c?.rig?.tiger || c?.TG;
          let hx = _t.x, hy = HS.fy + 1.2, hz = _t.z;
          if (TG?.headPivot) { TG.headPivot.getWorldPosition(_hs); hx = _hs.x; hy = _hs.y; hz = _hs.z; }
          const tx = _t.x + (hx - _t.x) * 0.33, ty = HS.fy + 1.2 + (hy - HS.fy - 1.2) * 0.33, tz = _t.z + (hz - _t.z) * 0.33;
          _foc.x += (tx - _foc.x) * kf; _foc.z += (tz - _foc.z) * kf; _foc.y += (ty - _foc.y) * kf;
        }
        if (B.o && B.tuckTripod && !B.tuckOn) { B.tuckOn = true; B.tripod = { ...B.tuckTripod }; cutTo(B.tripod); }
        if (B.o && B.tripod) {
          // the tuck's tripod, held (it was searched for this: the pillow with
          // the tiger's head bowed over it): panning down onto the bed as the
          // aim eases over, pushing in a little
          focusK += (0.85 + 0.15 * smoothstep(0, 1, B.t) - focusK) * (1 - Math.exp(-3 * d));
          const A = aimAt(), k = 0.12 * smoothstep(0, TUCK_SECS, B.t), T = B.tripod;
          _tp.set(T.x + (A.x - T.x) * k, T.y + (A.y - T.y) * k, T.z + (A.z - T.z) * k);
          tripodAngles(_tp);
        } else if (B.o) {
          focusK = 0.85 + 0.15 * smoothstep(0, 1, B.t);
          const lam = 1 - Math.exp(-2.2 * d);
          B.o.azimuth += wrapPi(roomAz() - B.o.azimuth) * lam;
          B.o.elevation += (TUCK_EL - B.o.elevation) * lam;
          B.o.distance += (roomDist(8.4, B.o.azimuth, B.o.elevation) - B.o.distance) * lam;
        }
        if (B.t >= TUCK_SECS) { B.purred = false; setStage('dark'); fade(true, DARK_SECS); B.lampWant = 0; B.eyes = true; EYES.on = false; }
        break;
      }
      case 'dark': {
        if (c) hold(c, d, 'watch', HS.side.yaw);
        B.mode = 'bed';
        // lights out: the lamp dims ahead of the fade; its eyes in the black
        // (EYES_HOLD); only a full fade moves the clock
        if (B.eyes) eyesAt(B.t);
        if (B.t >= DARK_SECS + (B.eyes ? EYES_HOLD : 0) && B.black && !paused) { eyesOff(); wakeUp(); }
        else if (B.t > DARK_SECS + 2.5 && !paused) { B.black = true; }
        break;
      }
      case 'wake': {
        B.mode = 'sit';
        // (he is unlocked: a step — a held one only once the dark has begun
        //  to lift, so a key still down from the carry does not end it —, any
        //  key or click after that, or the beat running out: out of bed)
        const inp = ctx.input;
        let step = false;
        if (!paused && B.t > WAKE_GRACE && inp && !(inp.moveLock > 0)) {
          step = typeof inp.axisRaw === 'function' ? inp.axisRaw(_ax).active : !!inp.axis?.().active;
          const v = inp.virtual;                     // (the touch stick, as player.js reads it)
          if (!step && v && (Math.abs(v.x) > 0.2 || Math.abs(v.y) > 0.2)) step = true;
        }
        if ((B.t >= WAKE_SECS || step || (skipNow && B.t > WAKE_GRACE)) && !paused) finish();
        break;
      }
    }
    // his turn (hangPose): whichever way the lens looks at him — the catch,
    // the walk, the doorstep — his side to it and his face a little round
    // toward it (TURN_IN from profile), never his back (≤ TWIST off the
    // tiger's heading); square for the tuck
    let twW = 0;
    if (c && B.o && (B.stage === 'carry' || B.stage === 'catch' || B.stage === 'arrive')) {
      const rel = wrapPi(B.o.azimuth - c.yaw);
      twW = clamp(rel - Math.sign(rel || 1) * (Math.PI / 2 - TURN_IN), -TWIST, TWIST);
    }
    B.twist = (B.twist || 0) + (twW - (B.twist || 0)) * (1 - Math.exp(-2.5 * d));
    if (B.on) updateEscort();
    // the borrowed lamp: up as he is walked in, down with the lights
    if (B.lampK !== B.lampWant) {
      const r = B.lampWant > B.lampK ? 1.6 : 1.1;
      B.lampK = B.lampWant > B.lampK ? Math.min(B.lampWant, B.lampK + d * r) : Math.max(B.lampWant, B.lampK - d * r);
    }
  }

  // ── late: the last word on where he is (camera:update, after player.js) ────
  const _q = new THREE.Quaternion();
  function late() {
    const L = H.lamps ? H.lamps[lampIdx()] : H.lamp;
    if (L) {
      if (B.on && B.lampK > 0.001) {
        const K = B.keyOn && HS.key ? HS.key : HS.lamp;
        L.position.set(K.x, K.y, K.z);
        L.color.setHex(B.keyOn ? 0xffd9b0 : 0xffc27a);
        L.intensity = LAMP_ON * B.lampK;
        L.visible = true;
      }
    }
    if (!B.on) return;
    const p = pl(); if (!p) return;
    const g = p.group, c = B.cat;
    notePose(p.pose || 'stand');
    let P = _hp, Q = _hq;
    if (B.mode === 'hang' && c) {
      hangPose(c, _hp, _hq, 0);
    } else if (B.mode === 'tuck' && c) {
      // THE TUCK: laid down by the scruff. He turns about his collar — from
      // hanging to lying — AHEAD of the collar leaving the jaws for the pillow,
      // so his feet swing up over the mattress while the head is still coming
      // down; and at no frame is any corner of him under the floor or deeper
      // in the bed than he will lie (clearance: the floor off the bed, the
      // mattress less LIE_SINK over it). u = 0 is the hang, u = 1 the lie.
      const u = B.tuckU;
      hangPose(c, _hp, _hq, 0);
      liePose(_lp, _lq);
      const eq = smoothstep(0, 0.62, u), ec = smoothstep(0.08, 1, u);
      _sq.copy(_hq).slerp(_lq, eq);
      _v.set(0, NECK, -NECK_BACK).applyQuaternion(_hq).add(_hp);        // the collar in the jaws
      _cl.set(0, NECK, -NECK_BACK).applyQuaternion(_lq).add(_lp);       // …and on the pillow
      _cl.lerp(_v, 1 - ec);
      _cl.y += Math.sin(Math.PI * ec) * 0.12;
      _sp.copy(_cl).sub(_v.set(0, NECK, -NECK_BACK).applyQuaternion(_sq));
      const need = clearance(_sp, _sq);
      if (need > 0) _sp.y += need;
      P = _sp; Q = _sq;
    } else if (B.mode === 'sit') {
      sitPose(_sp, _sq); P = _sp; Q = _sq;
    } else {
      liePose(_lp, _lq); P = _lp; Q = _lq;
    }
    p.position.copy(P);
    p.velocity?.set?.(0, 0, 0);
    if (g) { g.position.copy(P); g.quaternion.copy(Q); }
    placeHangShadow(P, Q, B.mode === 'hang' && !!c && (B.stage === 'catch' || B.stage === 'carry' || B.stage === 'arrive' || B.stage === 'tuck'));
    // his through-geometry silhouette (player/visitor.js, re-armed by the
    // player every frame) is the follow camera's backstop: here he is MEANT
    // to be behind the jaws, under the blanket, under a sleeping cat — the
    // amber ghost painted a flat orange blob over each. The shot is on him.
    p.setSilhouette?.(false);
    // the grip, measured (verifier): his collar against the jaws
    if (c && (B.mode === 'hang' || (B.mode === 'tuck' && B.tuckU < 0.02))) {
      _v.set(0, NECK, -NECK_BACK).applyQuaternion(Q).add(P);
      grip.x = _v.x; grip.y = _v.y; grip.z = _v.z;
      mouthOf(c, mouthNow);
      B.gripErr = Math.hypot(grip.x - mouthNow.x, grip.y - mouthNow.y, grip.z - mouthNow.z);
      if (B.gripErr > B.maxGripErr) B.maxGripErr = B.gripErr;
    } else B.gripErr = 0;
    // the body against its rail (verifier: settle() should never have to
    // shove a carrier off the route it walks)
    if (c && B.routeOK && (B.stage === 'carry' || B.stage === 'arrive') && R.n > 1 && !B.skip) {
      const seg = R.seg; railAt(B.s, _br); R.seg = seg;
      B.bodyErr = Math.hypot(c.x - _br.x, c.z - _br.z);
      if (B.bodyErr > B.maxBodyErr) B.maxBodyErr = B.bodyErr;
    } else B.bodyErr = 0;
    B.frames++;
  }
  const _br = { x: 0, z: 0 };
  /** Does the carrier keep its stripes? (a carry that runs past 05:30) */
  function keepsTiger(c) { return B.on && B.keepTiger && B.cat === c; }
  /** Is the borrowed lamp this system's right now? */
  /** Is NPC lamp i (citizens.js's two PointLights) this system's right now?
   *  The bedside lamp borrows the second while the carrier is still outside
   *  (the first keeps its warm key on the carrier and him), the first once
   *  the shot is in the room. */
  function ownsLamp(i = 0) { return B.on && B.lampK > 0.001 && i === lampIdx(); }
  const lampIdx = () => (H.lamps && H.lamps.length > 1 && !B.inCut && B.stage !== 'wake' && B.stage !== 'dark' && B.stage !== 'tuck' ? 1 : 0);
  /** The carrier, for the first lamp's warm key (catch, walk, doorstep). */
  function litCarrier() { return B.on && B.cat && (B.stage === 'catch' || B.stage === 'carry' || B.stage === 'arrive') ? B.cat : null; }

  // ── debug / views ──────────────────────────────────────────────────────────
  /**
   * Stage a beat for a render or a probe (the view's own frames then run it):
   *   { beat: 'catch', at: [x, z] }   a tiger springs on him at (x,z) (default: Main Street)
   *   { beat: 'carry', at }           the same; let the frames carry him (≥ 30 frames past the catch)
   *   { beat: 'arrive' }              caught 7 u short of the guest house door
   *   { beat: 'tuck' }                at the bedside, the tuck about to begin
   *   { beat: 'dark' }                the lights going out (tuck done)
   *   { beat: 'wake' }                06:00, sitting up, the cat on his feet
   *   key: 'mayor' — which citizen does the carrying (default: the nearest tiger)
   * Returns the stage, or a reason.
   */
  function debug(o = {}) {
    if (B.on) abort();
    wakeSleeper();
    try { H.raidEnd?.(); } catch (e) { /* (a clean stage: no raid's shot or party left over from another view) */ }
    house();
    const p = pl(); if (!p) return 'no player';
    p.locked = false; p.onFerry = false; p.invulnerable = false;
    H.T.graceUntil = -1;
    const hour = ctx.state.time;
    H.snap(hour);
    const beat = o.beat || 'catch';
    let x, z;
    if (beat === 'arrive' || beat === 'tuck' || beat === 'dark' || beat === 'wake') {
      // on the lane, 7 u out along the way to the door (or in front of it)
      x = HS.step.x + HS.ox * 7; z = HS.step.z + HS.oz * 7;
    } else { x = o.at?.[0] ?? 116; z = o.at?.[1] ?? 1; }
    if (p.position) p.position.y = world.height(x, z);
    // (staging only: the teleport's arrival poof — a white cloud round him —
    //  is not part of the catch; the event is held back for this one call)
    const em = ctx.events.emit;
    ctx.events.emit = function (n, ...a) { return n === 'player:teleport' ? undefined : em.call(this, n, ...a); };
    try { p.teleport?.(x, z); } finally { ctx.events.emit = em; }
    try { ctx.systems.powerups?.end?.(); } catch (e) { /* no stars */ }
    // the carrier: a named citizen, or the nearest tiger
    let c = o.key ? H.cats.find((k) => k.key === o.key) : null;
    if (!c) {
      let bd = Infinity;
      for (const k of H.cats) {
        if (!(k.tigerK > 0.5) || k.spec.fixed || (k.hideK || 0) >= 0.5) continue;
        const dd = (k.x - x) ** 2 + (k.z - z) ** 2;
        if (dd < bd) { bd = dd; c = k; }
      }
    }
    if (!c) return 'no tiger (is it tiger time?)';
    // the pounce: facing him, its jaws at his collar
    const face = o.face ?? (Math.atan2(HS.step.x - x, HS.step.z - z) + (o.turn ?? 0.6));
    const reach = (TP.spineZ + TP.neckZ + TP.headZ + TP.muzzleZ + 0.2) * tigerScale(c);
    place(c, x - Math.sin(face) * (reach + 0.05), z - Math.cos(face) * (reach + 0.05), face);
    const q = H.resolveSpot ? H.resolveSpot(c.x, c.z, 2, 0.8) : [c.x, c.z];
    c.x = q[0]; c.z = q[1];
    c.plan = null; c.think = 0;
    start(c);
    if (beat === 'catch' || beat === 'carry') return B.stage;
    // arrival: straight onto the last stretch
    let tries = 0;
    while (!B.routeOK && tries++ < 120) { S.frame += 2; buildRoute(c.x, c.z); }
    setStage('carry');
    B.cut = null;
    // (arrive: o.back u short of the step — the doorstep's tripod already up,
    //  the door swinging open ahead of them; the beats after it: at the step)
    B.s = Math.max(0, R.L - (beat === 'arrive' ? (o.back ?? 4) : 0.5));
    const pp = railAt(B.s, _t);
    place(c, pp.x, pp.z, railYaw(B.s, 1.8, c.yaw));
    pickEscort(c.x, c.z);
    B.age = CATCH_SECS + 0.1;
    B.limp = false; goLimp();
    if (B.o) { B.o.in = 0.01; B.o.distance = CAM_D1; B.o.elevation = CAM_EL; }
    // (the catch's line is long gone by the doorstep: the one said on the way)
    try { ui()?.clear?.(); } catch (e) { /* no ui */ }
    B.lines = 2;
    if (beat === 'arrive') {
      // the lens as the real walk leaves it at the door (on the doorstep's
      // tripod, searched here and now), the escort already on the lawn
      if (B.o) {
        pickDoorTripod(B.s >= R.L - 0.6); runJobsNow();
        focusK = TUNE.doorFocus; _foc.x = HS.step.x - HS.ox * DOOR_OUT; _foc.z = HS.step.z - HS.oz * DOOR_OUT; _foc.y = HS.fy + 1.5;
        if (B.doorTripod) { B.doorCut = true; cutTo(B.doorTripod); }
        else { pickDoorSide(); runJobsNow(); B.o.azimuth = doorAz(); B.o.elevation = doorEl(); B.o.distance = doorDist(); }
      }
      for (let i = 0; i < B.escort.length; i++) {
        const e = B.escort[i]; escortWait(i, _ep);
        place(e, _ep.x, _ep.z, Math.atan2(HS.step.x - HS.ox * DOOR_OUT - _ep.x, HS.step.z - HS.oz * DOOR_OUT - _ep.z));
      }
      say(LINES_CARRY[1]);
      return B.stage;
    }
    // tuck / dark / wake: at the bedside already
    place(c, HS.side.x, HS.side.z, HS.side.yaw);
    for (let i = 0; i < B.escort.length; i++) {
      const e = B.escort[i];
      escortWait(i, _ep);
      place(e, _ep.x, _ep.z, Math.atan2(HS.step.x - HS.ox * DOOR_OUT - _ep.x, HS.step.z - HS.oz * DOOR_OUT - _ep.z));
    }
    openDoor(true);
    B.lampWant = 1; B.lampK = 1;
    focusK = 0.85; bedPt(0.55, _foc); _foc.y = HS.fy + 1.2;
    // (the room's tripod, as the real walk in leaves it)
    measureLift(c); pickRoomTripod(); runJobsNow();
    if (B.tuckTripod) { B.inCut = true; B.tuckOn = true; B.tripod = { ...B.tuckTripod }; cutTo(B.tripod); }
    else if (B.o) { B.o.azimuth = roomAz(); B.o.elevation = TUCK_EL; B.o.distance = roomDist(8.4, B.o.azimuth, TUCK_EL); }
    setStage('tuck');
    B.t = o.t ?? TUCK_IN;
    if (c.tg) c.tg.snap = true;
    if (beat === 'tuck') return B.stage;
    B.t = TUCK_SECS; B.tuckU = 1; B.mode = 'bed'; setBlanket(1, 2.05); p.setPose?.('stand');
    B.lines = 3; say(LINE_TUCK);
    setStage('dark'); fade(true, DARK_SECS); B.lampWant = 0;
    if (beat === 'dark') return B.stage;
    B.black = true; B.t = DARK_SECS;
    wakeUp();
    ui()?.fade?.(false, 0.01);
    return B.stage;
  }

  /** Stop whatever is running (a debug staging elsewhere): he is put down, himself. */
  function reset() {
    if (B.on) { abort(); try { ui()?.clear?.(); } catch (e) { /* (a staged carry's line left on screen over the next staging) */ } }
    wakeSleeper();
  }

  return {
    start, fromRaid, update, late, debug, keepsTiger, ownsLamp, litCarrier, reset,
    skip() { if (B.on && !B.skip && B.stage !== 'catch' && B.stage !== 'dark' && B.stage !== 'wake') { B.skip = { t: 0 }; fade(true, SKIP_FADE); return true; } return false; },
    /** Debug: the doorstep framing's knobs (see TUNE). */
    tune: TUNE,
    /** Debug: the last framing search — every candidate tried, with its score (allocates). */
    get lensLast() { const J = B.lensLast; return J ? { tag: J.tag, bs: J.bs, tried: J.cands.filter((k) => k.score !== undefined).map((k) => ({ az: k.az !== undefined ? +k.az.toFixed(2) : undefined, P: k.P ? k.P.toArray().map((v) => +v.toFixed(2)) : undefined, el: k.el, dist: k.dist, off: k.off, side: k.side, lx: k.lx, lz: k.lz, h: k.h, pen: +k.pen.toFixed(2), score: +k.score.toFixed(2) })) } : null; },
    /** Debug / QA: score a framing round aim [x,y,z] now: { score } (1 a blocked subject point, 0.25 a blocked frame ray). */
    lensScore(aim, az, el, dist, subj) {
      const A = new THREE.Vector3(aim[0], aim[1], aim[2]);
      gatherOcc(A.x, A.z, dist + 6);
      OCC.why = [];
      const score = lensScore(A, az, el, dist, (subj || [aim]).map((q) => new THREE.Vector3(q[0], q[1], q[2])));
      const why = OCC.why; OCC.why = null;
      return { score, why };
    },
    /** Debug: re-score the doorstep tripod's pick now, ray by ray (allocates). */
    doorWhy() {
      const Dd = B.doorDbg; if (!Dd || !Dd.J.best) return null;
      gatherOcc(HS.step.x, HS.step.z, TUNE.doorDist + APPROACH_L + 6);
      const k = Dd.J.best, rows = [];
      for (const q of [...Dd.subj, ...k.own]) {
        sphA = q.s0 || 0; sphB = q.s1 || 0; OCC.by = '';
        const h = rayHit(k.P, q.p, 0.55); sphA = 0; sphB = 0;
        rows.push([q.tag, q.p.toArray().map((v) => +v.toFixed(2)), h === Infinity ? '-' : OCC.by]);
      }
      OCC.why = []; const f = frameRays(k.P, Dd.frames[0].A, 0.25, Dd.fov, OCC.why); const fw = OCC.why; OCC.why = null;
      return { P: k.P.toArray().map((v) => +v.toFixed(2)), score: k.score, pen: k.pen, rows, frames: +f.toFixed(2), fwhy: fw, occ: OCC.list.length, occNames: [...new Set(OCC.list.map((o) => o.name))].slice(0, 40) };
    },
    /** Debug: re-score the room tripod's candidates now, ray by ray (allocates). */
    roomWhy(all = false, kind = 'D') {
      const Dd = B.roomDbg?.[kind], r = HS.room; if (!Dd || !r) return null;
      gatherOcc(r.x, r.z, Math.hypot(r.w, r.d) / 2 + DOOR_OUT + 4, null, OCC, true);
      leafOpen(true);
      const out = [];
      for (const k of (all ? Dd.J.cands : [Dd.J.best]).filter(Boolean)) {
        const rows = [];
        for (const q of Dd.subj) { sphA = q.s0 || 0; sphB = q.s1 || 0; OCC.by = ''; const h = rayHit(k.P, q.p, 0.55); sphA = 0; sphB = 0; if (h < Infinity) rows.push(q.tag + ':' + OCC.by); }
        OCC.why = []; const f = Dd.frames.reduce((a, F) => a + frameRays(k.P, F.A, F.w, Dd.fov, OCC.why), 0); const fw = OCC.why; OCC.why = null;
        out.push({ lx: k.lx, lz: k.lz, h: k.h, pen: +k.pen.toFixed(2), score: k.score !== undefined ? +k.score.toFixed(2) : null, blocked: rows, frames: +f.toFixed(2), fwhy: fw.slice(0, 6) });
      }
      leafOpen(false);
      return out;
    },
    /** Debug: the walk plan, as applied, tested at every sample and half-sample: [s, bias, clear]. */
    walkEval() {
      const c = B.cat; if (!c || !WP.n) return null;
      const keep = occNow, seg = R.seg, out = []; WP.gi = -1;
      for (let i = 0; i < WP.n; i++) for (const u of [0, 0.5]) {
        const j = Math.min(WP.n - 1, i + 1), sv = WP.s[i] + (WP.s[j] - WP.s[i]) * u;
        walkBias(sv, _wb);
        out.push([+sv.toFixed(1), +_wb.az.toFixed(2), walkTest(c, i, _wb.az, _wb.el, u, _wb.dk) ? 1 : 0]);
      }
      occNow = keep; R.seg = seg; WP.gi = -1;
      return out;
    },
    /** Debug: re-test the walk plan's sample i (every swing) and say what blocks each ray. */
    walkProbe(i) {
      const c = B.cat; if (!c || !(i < WP.n)) return null;
      const seg = R.seg; railAt(WP.s[i], _t); const y = railYaw(WP.s[i], 1.8, c.yaw), x = _t.x, z = _t.z; R.seg = seg;
      jawsAt(c, x, z, y, _wJ); jawsAt(c, x, z, y, _wA, false); _wA.y += 0.3 * tigerScale(c) - 0.25;
      _wM.set(_wJ.x, _wJ.y - 0.75, _wJ.z); _wF.set(_wJ.x, _wJ.y - 1.45, _wJ.z);
      gatherOcc(x, z, 6 + CAM_D0 + 5, null, WOCC); const keep = occNow; occNow = WOCC;
      const out = { s: WP.s[i], az: WP.az[i], el: WP.el[i], d: WP.d[i], mask: WP.mask[i], J: _wJ.toArray(), occ: WOCC.list.length, c: [] };
      for (let k = 0; k < WCAND.length; k++) {
        const a = WP.az[i] + wAz(k), e = WP.el[i] + WCAND[k][1], d = WP.d[i] * wDk(k), ce = Math.cos(e);
        _wP.set(_wA.x + Math.sin(a) * ce * d, _wA.y + Math.sin(e) * d, _wA.z + Math.cos(a) * ce * d);
        const r = [];
        for (const T of [_wJ, _wM, _wF]) { OCC.by = ''; const h = rayHit(_wP, T, 0.55); r.push(h === Infinity ? '-' : OCC.by); }
        out.c.push({ k, P: _wP.toArray().map((v) => +v.toFixed(2)), r });
      }
      occNow = keep;
      return out;
    },
    /** Debug: the doorstep search's aim and subject points, as it would take them now. */
    get doorProbe() {
      const c = B.cat; if (!c) return null;
      const A = doorAim(c, new THREE.Vector3()); mouthOf(c, _s0);
      const a = Math.atan2(HS.ox, HS.oz);
      return { aim: A.toArray(), subj: [_s0.toArray(), [_s0.x, _s0.y - 0.75, _s0.z], [HS.step.x - HS.ox * (DOOR_OUT - 0.8), HS.fy + 1.6, HS.step.z - HS.oz * (DOOR_OUT - 0.8)]], axis: a };
    },
    get active() { return B.on; },
    get stage() { return B.stage; },
    get carrier() { return B.cat; },
    get grip() { return grip; },
    get mouth() { return mouthNow; },
    get gripErr() { return B.gripErr; },
    get maxGripErr() { return B.maxGripErr; },
    get sleeper() { return B.sleeper; },
    get route() { return { n: R.n, L: +R.L.toFixed(1), s: +B.s.toFixed(1), mode: B.routeMode, step: { x: +HS.step.x.toFixed(2), z: +HS.step.z.toFixed(2) } }; },
    /** Debug: the route's points [[x, z], …] (allocates). */
    routePoints() { const a = []; for (let i = 0; i < R.n; i++) a.push([+R.x[i].toFixed(2), +R.z[i].toFixed(2)]); return a; },
    get house() { house(); return { bed: { x: HS.bx, z: HS.bz }, step: { ...HS.step }, side: { ...HS.side }, fy: HS.fy, lamp: { ...HS.lamp }, room: !!HS.room, door: !!HS.door }; },
    stats() { return { stage: B.stage, t: +B.t.toFixed(2), raid: B.raid, s: +B.s.toFixed(1), L: +R.L.toFixed(1), route: B.routeMode, routeMs: +(B.routeMs || 0).toFixed(1), routeFrames: B.routeFrames, routeMax: +(B.routeMax || 0).toFixed(1), hops: B.hops, doorSide: B.doorSide, doorRuns: B.doorRuns, doorLens: B.doorLens, catchLens: B.catchLens, lensPick: B.lensPick, gripErr: +B.gripErr.toFixed(3), maxGripErr: +B.maxGripErr.toFixed(3), bodyErr: +(B.bodyErr || 0).toFixed(3), maxBodyErr: +(B.maxBodyErr || 0).toFixed(3), mode: B.mode, blanket: +B.blanket.toFixed(2), lamp: +B.lampK.toFixed(2), escort: B.escort.map((e) => e.key), black: B.black, frames: B.frames,
      doorTripod: B.doorTripod ? [+B.doorTripod.x.toFixed(2), +B.doorTripod.y.toFixed(2), +B.doorTripod.z.toFixed(2)] : null, doorCut: !!B.doorCut,
      inCut: !!B.inCut, doorTh: Number.isFinite(B.doorTh) ? +B.doorTh.toFixed(2) : null, legTh: Number.isFinite(B.legTh) ? +B.legTh.toFixed(2) : null,
      tuckTripod: B.tuckTripod ? [+B.tuckTripod.x.toFixed(2), +B.tuckTripod.y.toFixed(2), +B.tuckTripod.z.toFixed(2)] : null, tuckOn: !!B.tuckOn,
      tripod: B.tripod ? [+B.tripod.x.toFixed(2), +B.tripod.y.toFixed(2), +B.tripod.z.toFixed(2)] : null,
      wait: B.wait ? B.wait.map((w) => [+w.x.toFixed(1), +w.z.toFixed(1)]) : null,
      walk: { pred: WP.n ? (() => { let i = 0; while (i < WP.n - 1 && WP.s[i + 1] <= B.s) i++; return { s: +WP.s[i].toFixed(1), az: +WP.az[i].toFixed(3), camAz: +B.camAz.toFixed(3), el: +WP.el[i].toFixed(3), elBase: +(B.elBase || 0).toFixed(3) }; })() : null, n: WP.n, done: WP.done, blocked: WP.blocked, rays: WP.rays, ms: +WP.ms.toFixed(1), frames: WP.frames, runs: WP.runs.map((r) => ({ sa: +r.sa.toFixed(1), sb: +r.sb.toFixed(1), daz: r.daz, del: r.del, n: r.n, cleared: r.cleared, ext: r.ext || 0 })), stuck: WP.stuck || 0, phase: WP.phase, maxMs: +(WP.maxMs || 0).toFixed(1), bias: [+(B.wbAz || 0).toFixed(3), +(B.wbEl || 0).toFixed(3)] } }; },
    blanket,
  };
}
