// MODE 4 — FIRST PERSON (BRIEF WAVE 5, Contract Q camera (a); Ben: "there should also be a 1st person
// view option"). camera.js owns WHEN it runs (key 4 / the chip, on foot and unowned — a vehicle, the flight,
// an interior, the ferry or a lock fall back to mode 1's framing exactly as mode 2 does); this file owns
// WHAT it is:
//   · the lens at the visitor's eyes, carried by his own NECK: the head node's origin (visitor.js's neck
//     pivot, which the walk's lean, the duck's chest-forward crouch and the slide's lean-back all move) +
//     NECK_EYE up + FWD ahead along the look — 1.55 u over his feet, 0.1 u ahead, standing. A body that
//     leans or crouches carries the eye with it: an eye placed by constants sat BEHIND his neck while he
//     ran (the lean put the collar in the frame) and INSIDE his shirt while he ducked. Tumbles (the roll,
//     the double-jump flip) spin the head through 360°: the eye does not ride that loop, it sinks to a
//     steady ROLL height instead (blended by how far the head is off upright).
//   · looking DOWN the head tips over the chest (REACH / DROP × −sin pitch): the eye leans out ahead of his
//     collar and a little down, so the shoulders and the neck stump never fill the frame and, at the
//     bottom of the range, his own shoes stand at the frame's lower edge. The lean-out never carries the
//     eye into a solid (player.pushOut, a WALL_R circle; retracts at once, grows back eased).
//     The height is eased (λ EYE_L, never more than EYE_LAG behind) so a step onto a kerb or a low prop is
//     a glide, not a pop; x/z exact (a lagging eye sees into him)
//   · the look: a drag with ANY button (input.js pointer.dragDX/DY — left, right, middle, and touch.js's
//     right-thumb drag, which writes pointer.orbit + dragDX/DY) turns it; across = yaw (YAW_K rad/px — the
//     orbit's own 0.006, drag right turns right, as the orbit and the V look do), up/down = pitch (PITCH_K,
//     the orbit's 0.004, drag up looks up), pitch clamped +70° up / −80° down (at −80° his shoes stand at
//     the frame's lower edge). Q / E turn 45° (eased; E defers to "interact" as everywhere). The wheel (and
//     the touch pinch, which writes input.wheel) zooms the lens FOV_MIN..FOV_MAX. Tap V levels the pitch.
//   · WASD walks relative to the look: camera.js sets controlAzimuth = the look's yaw (no basisRate chase)
//     and turns him (player.facing) to the look, so a click / X throws where you are looking
//   · his head and hat hidden (the head rig node scaled to nothing and restored EXACTLY on leaving; found
//     through player.visitor.nodes, else by name in player.group); body, arms and the held item stay
//   · the look's yaw uses camera.js's azimuth convention: the lens looks along (−sin az, −cos az), so
//     leaving for mode 1/2/3 with params.azimuth = az frames him from straight behind the way he looked.
// Nothing here allocates per frame.
import * as THREE from 'three';
import { clamp, damp } from '../../core/util.js';

export const FP = Object.freeze({
  EYE: 1.55,                    // u over his feet, standing (BRIEF: "lens at the visitor's eyes (1.55 u)")
  NECK_EYE: 0.294,              // u the eye sits over his neck pivot (idle neck 1.230–1.281, mean 1.256 → 1.55)
  FWD: 0.1,                     // u ahead of the neck, along the look (his eyes sit in front of the neck)
  RIG_F: [-0.25, 0.5],          // clamp on the neck's own forward offset (a slide leans it back, a sprint forward)
  RIG_Y: [0.3, 1.5],            // …and on its height over his feet
  REACH: 0.55, DROP: 0.1,       // u the eye leans out / sinks at a straight-down look (× −sin pitch)
  WALL_R: 0.24,                 // u of clear ground the leaning eye keeps from any solid (the near plane + a hair)
  REACH_L: 6, REACH_FREE: 0.3,  // λ: a lean-out a wall cut short grows back (toward the lean + REACH_FREE); it
                                // retracts at once
  DUCK: 0.62,                   // no rig: u the eye drops while he ducks or slides…
  ROLL: 0.75,                   // …and while he rolls (also the steady tumble eye: EYE − ROLL over his feet…)
  TUMBLE_F: 0.5,                // …and this far ahead of FWD: out in front of the tucked, spinning ball
  TUMBLE_L: 12,                 // λ: into / out of the steady tumble eye
  EYE_L: 14, EYE_LAG: 0.3,      // eye height ease: λ, and the most it may trail his real eye height
  PITCH_MAX: 70 * Math.PI / 180,    // looking up
  PITCH_DOWN: 80 * Math.PI / 180,   // looking down (the lean-out keeps his collar out of the frame to here)
  PITCH0: -0.08,                // a fresh look: level, a hair down (the path ahead reads, the horizon stays)
  YAW_K: 0.006, PITCH_K: 0.004,     // rad per px of drag — the orbit's own rates (camera.js), so a drag
                                    // turns the same in every mode (200 px ≈ 1.2 rad)
  FOV: 60, FOV_MIN: 34, FOV_MAX: 76, FOV_L: 9,
  WHEEL_K: 0.02,                // ° of FOV per wheel delta unit (a notch ≈ 100 → 2°)
  TURN_T: 0.3,                  // s: Q / E's eased 45° turn
  LEVEL_L: 7,                   // λ: tap V levels the pitch
  NEAR: 0.2,                    // the lens's near plane while it sits in his head (walls he stands 0.45 u off)
  HEAD_GAP: 1.0,                // u: while a shot has carried the lens this far out of his head, the head shows
});
const HIDDEN = 1e-4;            // the visitor's own "hidden part" scale (player/visitor.js HIDDEN)
const HEAD_NAME = /(^|[_\s-])(head|hat)([_\s-]|$)/i;
const ease = (t) => t * t * (3 - 2 * t);
const clampPitch = (p) => clamp(p, -FP.PITCH_DOWN, FP.PITCH_MAX);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export function createFirstPerson(ctx) {
  const st = {
    az: 0, pitch: FP.PITCH0, fov: FP.FOV, fovGoal: FP.FOV,
    eyeY: NaN, eyeH: FP.EYE,
    reach: NaN, tumble: NaN, lean: 0,  // the wall's cap on the lean-out (u), the tumble blend, the lean-out used (u)
    turnTotal: 0, turnDone: 1, turnT: 1,
    level: false,
  };
  const eye = new THREE.Vector3();
  const neck = new THREE.Vector3();
  const pOut = { x: 0, z: 0, hit: false };
  const quat = new THREE.Quaternion();
  const eul = new THREE.Euler(0, 0, 0, 'YXZ');

  // ── his head: hidden while the lens sits in it ───────────────────────────
  const saved = [];             // { o, x, y, z }: the scale each hidden node had
  let headHidden = false;
  const found = [];
  function isAncestor(a, o) { for (let n = o.parent; n; n = n.parent) if (n === a) return true; return false; }
  function headNodes() {
    found.length = 0;
    const pl = ctx.systems.player;
    const nodes = pl?.visitor?.nodes;
    // the rig's head node carries the eyes, brows, mouth AND the hat (visitor.js): one scale hides them all
    if (nodes?.head?.isObject3D) found.push(nodes.head);
    else if (nodes?.hat?.isObject3D) found.push(nodes.hat);
    if (!found.length && pl?.group?.traverse) {
      pl.group.traverse((o) => { if (o !== pl.group && o.name && HEAD_NAME.test(o.name)) found.push(o); });
      // a node under another found node goes with it (scaling both would square the collapse, harmlessly,
      // but restoring the child after its parent must not matter either way: keep the outermost only)
      for (let i = found.length - 1; i >= 0; i--) {
        const o = found[i];
        for (let j = 0; j < found.length; j++) if (j !== i && isAncestor(found[j], o)) { found.splice(i, 1); break; }
      }
    }
    return found;
  }
  function hideHead(on) {
    if (on === headHidden) return headHidden;
    if (on) {
      const list = headNodes();
      saved.length = 0;
      for (const o of list) { saved.push({ o, x: o.scale.x, y: o.scale.y, z: o.scale.z }); o.scale.setScalar(HIDDEN); }
      headHidden = saved.length > 0;
      return headHidden;
    }
    for (const s of saved) s.o.scale.set(s.x, s.y, s.z);
    saved.length = 0; headHidden = false;
    return false;
  }

  // ── the look ──────────────────────────────────────────────────────────────
  /** A fresh first-person look along `az` (camera.js's azimuth convention). */
  function begin(az, pitch = FP.PITCH0) {
    st.az = wrap(az); st.pitch = clampPitch(pitch);
    st.turnTotal = 0; st.turnDone = 1; st.turnT = 1; st.level = false;
    st.eyeY = NaN; st.reach = NaN; st.tumble = NaN;
  }
  function turn(d) { st.turnTotal = st.turnTotal * (1 - st.turnDone) + d; st.turnDone = 0; st.turnT = 0; }
  /** Set the look outright (views, debug): az / pitch in radians; at = [x, y, z] aims the eye at a point. */
  function set(o, pl) {
    if (!o) return;
    if (Array.isArray(o.at) && pl?.position) {
      // [x, y, z] aims the eye at that point; [x, z] turns toward it and keeps the pitch
      const P = pl.position, flat = o.at.length === 2;
      const dx = o.at[0] - P.x, dz = (flat ? o.at[1] : o.at[2]) - P.z;
      st.az = Math.atan2(dx, dz) + Math.PI;
      if (!flat) st.pitch = clampPitch(Math.atan2(o.at[1] - (P.y + FP.EYE), Math.hypot(dx, dz)));
      st.az = wrap(st.az);
    }
    if (Number.isFinite(o.az)) st.az = wrap(o.az);
    if (Number.isFinite(o.yaw)) st.az = wrap(st.az + o.yaw);
    if (Number.isFinite(o.pitch)) st.pitch = clampPitch(o.pitch);
    if (Number.isFinite(o.fov)) { st.fovGoal = clamp(o.fov, FP.FOV_MIN, FP.FOV_MAX); st.fov = st.fovGoal; }
    st.turnTotal = 0; st.turnDone = 1; st.turnT = 1; st.level = false;
  }
  /** One frame of look input. busyE: something is in reach, so E is "interact", not a turn. */
  function input(dt, inp, busyE) {
    const P = inp.pointer;
    const dx = P.dragDX || 0, dy = P.dragDY || 0;
    if (dx || dy) {
      st.az = wrap(st.az - dx * FP.YAW_K);
      st.pitch = clampPitch(st.pitch - dy * FP.PITCH_K);
      st.level = false;
    }
    if (inp.pressed.has('KeyQ')) turn(+Math.PI / 4);
    if (inp.pressed.has('KeyE') && !busyE) turn(-Math.PI / 4);
    if (st.turnT < 1) {
      st.turnT = Math.min(1, st.turnT + dt / FP.TURN_T);
      const e = ease(st.turnT);
      st.az = wrap(st.az + st.turnTotal * (e - st.turnDone)); st.turnDone = e;
    }
    if (inp.pressed.has('KeyV')) st.level = true;
    if (st.level) {
      st.pitch = damp(st.pitch, 0, FP.LEVEL_L, dt);
      if (Math.abs(st.pitch) < 1e-3) { st.pitch = 0; st.level = false; }
    }
    if (inp.wheel) st.fovGoal = clamp(st.fovGoal + inp.wheel * FP.WHEEL_K, FP.FOV_MIN, FP.FOV_MAX);
    if (st.fov !== st.fovGoal) {
      st.fov = damp(st.fov, st.fovGoal, FP.FOV_L, dt);
      if (Math.abs(st.fov - st.fovGoal) < 1e-3) st.fov = st.fovGoal;
    }
  }
  /**
   * How far (u, ≤ want) the eye may lean out along (dx, dz) from (x, z) before a WALL_R circle there
   * would touch a solid. One pushOut when the whole lean is clear (the usual case); else a 5-step
   * bisection (≤ 6 calls, ≈ 0.1 ms), so the limit slides smoothly as he walks up to a wall.
   */
  function clearReach(pl, x, z, dx, dz, want) {
    if (!(want > 1e-3) || typeof pl.pushOut !== 'function') return want;
    pl.pushOut(x + dx * want, z + dz * want, FP.WALL_R, pOut);
    if (!pOut.hit) return want;
    let lo = 0, hi = want;
    for (let i = 0; i < 5; i++) {
      const m = (lo + hi) * 0.5;
      pl.pushOut(x + dx * m, z + dz * m, FP.WALL_R, pOut);
      if (pOut.hit) hi = m; else lo = m;
    }
    return lo;
  }
  /**
   * The eye this frame: position (world) and orientation, from his neck and the look. dt ≤ 0 settles the
   * eye at once (a cut). Returns `eye`; the orientation is in `quat`.
   */
  function pose(dt, pl) {
    const P = pl.position;
    const cutNow = !(dt > 0);
    const dirX = -Math.sin(st.az), dirZ = -Math.cos(st.az);
    // ── the neck: off the rig (his lean, crouch and slide), or constants when there is no rig ──
    const low = (pl.ducking || pl.sliding ? FP.DUCK : 0) + (pl.rolling ? FP.ROLL : 0);
    let hGoal = FP.EYE - Math.min(FP.ROLL, low), fRig = 0;
    const head = pl.visitor?.nodes?.head;
    if (head?.isObject3D) {
      head.updateWorldMatrix(true, false);          // player.js posed him this frame; the render has not run yet
      const m = head.matrixWorld.elements;
      neck.set(m[12], m[13], m[14]);
      const upDot = m[5] / (Math.hypot(m[4], m[5], m[6]) || 1);    // the head's own up (scale-free), · world up
      const tGoal = pl.rolling ? 1 : clamp((0.8 - upDot) / 0.4, 0, 1);
      st.tumble = cutNow || st.tumble !== st.tumble ? tGoal : damp(st.tumble, tGoal, FP.TUMBLE_L, dt);
      const rigH = clamp(neck.y - P.y, FP.RIG_Y[0], FP.RIG_Y[1]) + FP.NECK_EYE;
      const rigF = clamp((neck.x - P.x) * dirX + (neck.z - P.z) * dirZ, FP.RIG_F[0], FP.RIG_F[1]);
      const k = st.tumble;
      hGoal = rigH + (FP.EYE - FP.ROLL - rigH) * k;
      fRig = rigF + (FP.TUMBLE_F - rigF) * k;
    }
    // ── the head tipping over the chest as the look drops (a tumble's eye is out ahead already) ──
    const s = Math.max(0, -Math.sin(st.pitch)) * (1 - (st.tumble === st.tumble ? st.tumble : 0));
    hGoal -= FP.DROP * s;
    const want = fRig + FP.REACH * s;               // the lean ahead of the plain eye (FWD), before any wall
    let lean = want;
    if (want > 0) {
      // st.reach is the WALL's cap on the lean, not the lean: it drops to a blocked limit at once and, once
      // clear, rises (eased) to a little above the lean wanted, so a free look pitches with no lag at all
      const ok = clearReach(pl, P.x + dirX * FP.FWD, P.z + dirZ * FP.FWD, dirX, dirZ, want);
      const cap = ok < want ? ok : want + FP.REACH_FREE;
      st.reach = cutNow || st.reach !== st.reach || cap < st.reach ? cap : damp(st.reach, cap, FP.REACH_L, dt);
      lean = Math.min(want, st.reach);
    } else st.reach = FP.REACH_FREE;
    st.lean = lean;
    // ── height: eased (a kerb is a glide), never more than EYE_LAG behind; x/z exact ──
    st.eyeH = cutNow ? hGoal : damp(st.eyeH, hGoal, 10, dt);
    const wantY = P.y + st.eyeH;
    if (cutNow || st.eyeY !== st.eyeY) st.eyeY = wantY;
    else {
      st.eyeY = damp(st.eyeY, wantY, FP.EYE_L, dt);
      st.eyeY = clamp(st.eyeY, wantY - FP.EYE_LAG, wantY + FP.EYE_LAG);
    }
    const f = FP.FWD + lean;
    eye.set(P.x + dirX * f, st.eyeY, P.z + dirZ * f);
    quat.setFromEuler(eul.set(st.pitch, st.az, 0, 'YXZ'));
    return eye;
  }

  return {
    state: st, eye, quat,
    begin, set, input, pose, hideHead,
    get headHidden() { return headHidden; },
    /** player.facing that looks the way the lens does (his +z is his front; the lens looks along −sin/−cos az). */
    facing() { return wrap(st.az + Math.PI); },
  };
}
