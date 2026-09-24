// ─────────────────────────────────────────────────────────────────────────────
// TIGERS — what the citizens of Cat Island are between 20:00 and 05:30.
//
// Nobody mentions it in the morning. The barista still has her visor on.
//
// Three parts live here:
//   1. TIME + NAMES  — isTigerTime(h), the "Tigerlily, formerly Barista Mocha"
//                      naming, and the coat swap (fur atlas row 3).
//   2. THE DRIVER    — poses and animation for the quadruped rig built in
//                      citizens/tigerrig.js. The cat scales away, the tiger
//                      scales up, and the swap happens inside a puff of fur.
//                      Prowl, stalk, gather, spring, sit-and-stare, roar.
//   3. THE BRAIN     — loose packs prowling the streets, a stalk from ~18 u, a
//                      rush inside 8 u, and a scruff-carry the citizens system
//                      turns into a bedtime cutscene.
// ─────────────────────────────────────────────────────────────────────────────
import { lerp, clamp, damp, smoothstep } from '../../../core/util.js';
import { tileUV, TIGER_OF } from './fur.js';
import { TP, goHome, tigerEyeHex } from './tigerrig.js';

export const TIGER_ON = 20, TIGER_OFF = 5.5;
/** Off-duty tigers (all but the three hunters) keep at least this far from the visitor, centre to centre. */
export const BERTH = 7.0;
export const MORPH_SECS = 2.0;

/** True between 20:00 and 05:30 — the hours the island grows stripes. */
export function isTigerTime(h) { return h >= TIGER_ON || h < TIGER_OFF; }

// ── names ────────────────────────────────────────────────────────────────────
const TIGER_NAMES = [
  'Tigerlily', 'Bengal Sue', 'Sabre', 'Marmalade Death', 'Nine-Stripe',
  'The Orange Menace', 'Velvet Teeth', 'Miss Amber', 'Old Stripe', 'Kettle',
  'Bright Eyes', 'Sultan', 'Mrs. Claw', 'Paprika', 'Big Sorrow', 'Lantern',
  'Tabitha Fang', 'Monsoon', 'Lord Whisker-Death', 'Cinnamon', 'Dusk',
  'Tiny Terrible', 'The Manager', 'Hush', 'Moonshadow', 'Jaws McFluff',
  'Persimmon Doom', 'Gladys', 'Salt', 'Nutmeg', 'The Considerable',
  'Sundown', 'Ivory', 'Mrs. Teeth', 'Copper', 'Regina', 'Sixteen',
  'Bramblestripe', 'Custard', 'Growlford', 'Petal', 'Vesper',
];

/** Stable, silly, and always says who it used to be. */
export function tigerNameFor(cat, i) {
  const base = TIGER_NAMES[i % TIGER_NAMES.length];
  return { short: base, full: `${base}, formerly ${cat.name}` };
}

// ── coat swap ────────────────────────────────────────────────────────────────
export function setCoat(cat, striped) {
  const rig = cat.rig; if (!rig || !rig.coat) return;
  const uv = tileUV(striped ? (TIGER_OF[cat.pattern] || 'tiger_orange') : cat.pattern);
  for (let i = 0; i < rig.coat.length; i++) rig.coat[i][0].setTile(rig.coat[i][1], uv);
  cat.striped = !!striped;
}

/**
 * The actual change of body. The cat's eyes, pupils, whiskers and hat are
 * BORROWED by the tiger's skull (a sphere is a sphere, and the visor is the
 * joke); everything else on the cat rig simply scales to nothing.
 */
export function setForm(cat, striped) {
  setCoat(cat, striped);
  const TG = cat.rig.tiger; if (!TG) return;
  const eye = striped ? tigerEyeHex(cat.pattern) : (cat.spec.eye ?? 0xb8e04a);
  if (cat.rig.eyeSlots) for (const [p, i] of cat.rig.eyeSlots) p.setColor(i, eye);
  if (striped) { for (const o of TG.borrow) TG.headPivot.add(o); }
  else {
    for (const o of TG.borrow) goHome(o);
    cat.rig.root.scale.setScalar(cat.spec.size ?? 1);
    TG.root.scale.setScalar(0);
    TG.root.updateMatrixWorld(true);
  }
  cat.formed = !!striped;
}

/** Absolute root scale of this cat once fully striped. Buff cats are worst. */
export function tigerScale(cat) {
  const s = cat.spec.size ?? 1;
  return (0.56 + 0.62 * s) * (cat.spec.build === 'buff' ? 1.09 : 1);
}
/** Shoulder height of a full-grown tiger, in world units. */
export function tigerBackY(cat) { return (TP.spineY + 0.48) * tigerScale(cat); }
/** Where the jaws are — the scruff-carry hangs the visitor off this point. */
export function mouthPoint(cat, out) {
  const T = tigerScale(cat) * Math.max(0.25, cat.tigerK || 0);
  const z = TP.spineZ + TP.neckZ + TP.headZ + TP.muzzleZ + 0.20;
  const y = TP.spineY + TP.neckY + TP.headY + TP.muzzleY;
  out.x = cat.x + Math.sin(cat.yaw) * z * T;
  out.y = cat.y + y * T;
  out.z = cat.z + Math.cos(cat.yaw) * z * T;
  return out;
}

// ── poses ────────────────────────────────────────────────────────────────────
// crouch lowers the spine · sit folds the hind legs · tail is an offset from
// "back and slightly down" · ear is how far the ears pin back · mouth opens
// the jaw · stride/freq drive the gait · roll is the shoulder-blade swagger.
// The TAIL is a J, never a pole: the base droops back and DOWN from the rump
// (tail < 0), and every segment after it curls the tip back up (curl > 0).
// Laid straight back at hip height a 1.8-u tail read as a broom handle
// sticking out of the tiger. `wrap` (sitting, lying) sweeps it round the flank.
const TREST = {
  crouch: 0, sit: 0, rear: 0, tail: -0.9, curl: 0.28, swish: 0.8, freq: 1.35, stride: 0.38,
  roll: 1, mouth: 0.02, ear: 0, headY: 0, headZ: 0, pitch: 0, eye: 1, wiggle: 0, bound: 0, chest: 0, wrap: 0,
};
const TPOSE = {
  prowl:  { crouch: 0.10, tail: -1.20, curl: 0.38, swish: 0.55, freq: 1.30, stride: 0.42, roll: 1.30 },
  stalk:  { crouch: 0.28, tail: -0.95, curl: 0.22, swish: 1.7, freq: 0.92, stride: 0.30, roll: 1.75, headY: -0.14, headZ: 0.10, ear: 0.30, pitch: 0.12 },
  crouch: { crouch: 0.46, tail: -0.90, curl: 0.16, swish: 3.0, freq: 0, stride: 0, roll: 0, headY: -0.20, headZ: 0.15, ear: 0.55, pitch: 0.16, wiggle: 1, mouth: 0.15 },
  rush:   { crouch: 0.04, tail: -0.62, curl: 0.12, swish: 0.9, freq: 3.2, stride: 0.66, roll: 0.7, mouth: 0.55, ear: 0.70, bound: 1, pitch: 0.06 },
  roar:   { crouch: -0.05, tail: 0.62, curl: 0.20, swish: 2.2, freq: 0, stride: 0, roll: 0, mouth: 1, ear: 1, headY: 0.17, pitch: -0.36, rear: 0.12, chest: 1 },
  sit:    { sit: 1, tail: -0.55, curl: 0.30, wrap: 1, swish: 0.35, freq: 0, stride: 0, chest: 0.25 },
  watch:  { sit: 1, tail: -0.55, curl: 0.28, wrap: 1, swish: 0.24, freq: 0, stride: 0, eye: 1.12, chest: 0.30 },
  carry:  { crouch: 0.02, tail: -0.70, curl: 0.34, swish: 0.8, freq: 1.65, stride: 0.44, roll: 1.0, mouth: 0.55, headY: 0.11, pitch: -0.14 },
  yawn:   { sit: 0.9, tail: -0.55, curl: 0.30, wrap: 1, swish: 0.3, freq: 0, stride: 0, mouth: 1, pitch: -0.32, eye: 0.04, ear: 0.22 },
  flinch: { crouch: -0.07, rear: 0.24, tail: 0.66, curl: 0.10, swish: 2.4, freq: 1.2, stride: 0.30, ear: 1, pitch: -0.20, mouth: 0.45 },
  hiss:   { crouch: 0.08, tail: 0.58, curl: 0.10, swish: 2.8, freq: 0, stride: 0, ear: 1, mouth: 0.9, chest: 0.6, pitch: -0.12 },
  flee:   { crouch: 0.05, tail: -1.00, curl: 0.10, swish: 0.6, freq: 3.0, stride: 0.58, roll: 0.6, ear: 0.9 },
  stun:   { crouch: 0.22, tail: -1.10, curl: 0.18, swish: 0.5, freq: 0, stride: 0, ear: 0.55, eye: 0.42, pitch: 0.20 },
  sulk:   { sit: 1, tail: -0.60, curl: 0.30, wrap: 1, swish: 0.2, freq: 0, stride: 0, ear: 0.6, eye: 0.5, pitch: 0.28 },
  sleep:  { crouch: 0.60, tail: -0.70, curl: 0.20, wrap: 1.2, swish: 0.14, freq: 0, stride: 0, eye: 0.02, pitch: 0.26 },
};
// Pose vectors (Contract J): fixed-shape objects written by named fields, every
// TPOSE pre-expanded against TREST — the for-in damping boxed a number per key.
function tposeVec() {
  return {
    crouch: 0,
    sit: 0,
    rear: 0,
    tail: -0.9,
    curl: 0.28,
    swish: 0.8,
    freq: 1.35,
    stride: 0.38,
    roll: 1,
    mouth: 0.02,
    ear: 0,
    headY: 0,
    headZ: 0,
    pitch: 0,
    eye: 1,
    wiggle: 0,
    bound: 0,
    chest: 0,
    wrap: 0,
  };
}
function setTPose(o, F) {
  o.crouch = F.crouch;
  o.sit = F.sit;
  o.rear = F.rear;
  o.tail = F.tail;
  o.curl = F.curl;
  o.swish = F.swish;
  o.freq = F.freq;
  o.stride = F.stride;
  o.roll = F.roll;
  o.mouth = F.mouth;
  o.ear = F.ear;
  o.headY = F.headY;
  o.headZ = F.headZ;
  o.pitch = F.pitch;
  o.eye = F.eye;
  o.wiggle = F.wiggle;
  o.bound = F.bound;
  o.chest = F.chest;
  o.wrap = F.wrap;
}
function dampTPose(a, t, f) {
  a.crouch += (t.crouch - a.crouch) * f;
  a.sit += (t.sit - a.sit) * f;
  a.rear += (t.rear - a.rear) * f;
  a.tail += (t.tail - a.tail) * f;
  a.curl += (t.curl - a.curl) * f;
  a.swish += (t.swish - a.swish) * f;
  a.freq += (t.freq - a.freq) * f;
  a.stride += (t.stride - a.stride) * f;
  a.roll += (t.roll - a.roll) * f;
  a.mouth += (t.mouth - a.mouth) * f;
  a.ear += (t.ear - a.ear) * f;
  a.headY += (t.headY - a.headY) * f;
  a.headZ += (t.headZ - a.headZ) * f;
  a.pitch += (t.pitch - a.pitch) * f;
  a.eye += (t.eye - a.eye) * f;
  a.wiggle += (t.wiggle - a.wiggle) * f;
  a.bound += (t.bound - a.bound) * f;
  a.chest += (t.chest - a.chest) * f;
  a.wrap += (t.wrap - a.wrap) * f;
}
const TFULL = {};
for (const k in TPOSE) { const f = tposeVec(); for (const q in TREST) f[q] = TPOSE[k][q] !== undefined ? TPOSE[k][q] : TREST[q]; TFULL[k] = f; }

const POSE_OF = {
  prowl: 'prowl', stalk: 'stalk', crouch: 'crouch', rush: 'rush', roar: 'roar', carry: 'carry',
  yawn: 'yawn', flinch: 'flinch', hiss: 'hiss', flee: 'flee', stun: 'stun', dizzy: 'stun',
  sulk: 'sulk', sit: 'sit', watch: 'watch', gossip: 'sit', groom: 'sit',
  sleep: 'sleep', loaf: 'sleep', sunbathe: 'sleep', nip: 'sleep', curl: 'sit', squat: 'sit',
};

const TAIL_BACK = -1.62;          // rotation.x that lays the tail straight back
const _v = { x: 0, y: 0, z: 0 };
const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

/**
 * Drive one citizen's tiger. k = 0 (cat) → 1 (tiger). Runs at the end of the
 * cat animator, so the cat rig is already posed and we only have to take it
 * away: the cat grows and fades out, the tiger grows and fades in.
 */
export function applyTiger(c, k, el, dt, ctx) {
  const R = c.rig, TG = R.tiger;
  if (!TG) return;
  const tg = c.tg || (c.tg = { a: tposeVec(), t: tposeVec(), snap: true, gait: c.ph, swishPh: c.ph * 2, mv: 0, blinkT: c.seed * 4, blink: 0, off: false });
  const size = c.spec.size ?? 1;

  if (k <= 0.0008) {
    if (!tg.off) { tg.off = true; R.root.scale.setScalar(size); TG.root.scale.setScalar(0); TG.root.updateMatrixWorld(true); }
    return;
  }
  tg.off = false;

  const T = tigerScale(c);
  const vis = smoothstep(0.34, 0.66, k);
  // the cat swells for a moment and is gone; the tiger arrives already big
  R.root.scale.setScalar(size * (1 + k * 0.75) * (1 - vis));
  if (vis <= 0.0005) { TG.root.scale.setScalar(0); TG.root.updateMatrixWorld(true); return; }

  // ── pose targets ───────────────────────────────────────────────────────────
  let key = POSE_OF[c.pose];
  if (!key) key = c.moving ? 'prowl' : 'sit';
  const t = tg.t, a = tg.a;
  setTPose(t, TFULL[key] || TFULL.prowl);
  if (tg.snap) { setTPose(a, t); tg.snap = false; } else dampTPose(a, t, 1 - Math.exp(-7.5 * dt));
  tg.mv = damp(tg.mv, c.moving ? 1 : 0, 8, dt);

  // ── gait: diagonal pairs, heavy and slow ───────────────────────────────────
  tg.gait += dt * a.freq * 2.35;
  tg.swishPh += dt * (1.3 + a.swish * 1.5);
  const sw = Math.sin(tg.gait) * a.stride * tg.mv;
  const bob = tg.mv * (Math.abs(Math.sin(tg.gait * 2)) * 0.030 + a.bound * Math.max(0, Math.sin(tg.gait)) * 0.095);
  const breath = Math.sin(el * 1.6 + c.ph) * 0.014;

  // ── root ───────────────────────────────────────────────────────────────────
  const root = TG.root;
  root.position.set(c.x, c.y + (c.air || 0), c.z);
  root.rotation.set(0, c.yaw, 0);
  root.scale.setScalar(T * lerp(0.52, 1, k) * vis);

  // ── spine: the crouch, the shoulder roll, the pre-pounce wiggle ────────────
  const sp = TG.spine;
  const wig = a.wiggle;
  const spineY = TP.spineY - a.crouch - a.sit * 0.20;
  sp.position.set(0, spineY + bob + wig * Math.abs(Math.sin(el * 13 + c.ph)) * 0.020, TP.spineZ);
  sp.rotation.x = -a.sit * 0.36 - a.rear * 0.85 + a.crouch * 0.16
    + tg.mv * a.bound * Math.sin(tg.gait * 2) * 0.085 + breath * 0.5;
  sp.rotation.y = tg.mv * Math.sin(tg.gait) * 0.05 * a.roll + wig * Math.sin(el * 7.5 + c.ph) * 0.10;
  sp.rotation.z = tg.mv * Math.sin(tg.gait) * 0.075 * a.roll;
  TG.bodyN.scale.set(1 + breath + a.chest * 0.07, 1 - breath * 0.6 + a.chest * 0.05, 1);

  // ── legs ───────────────────────────────────────────────────────────────────
  // Each leg is scaled to exactly reach the ground from wherever the pitching,
  // bobbing spine has carried its socket — otherwise a tiger that lifts its
  // chest to sit ends up standing on air, which it did.
  const bodyY = sp.position.y;
  const cs = Math.cos(sp.rotation.x), sn = Math.sin(sp.rotation.x);
  const reach = (ly, lz, swing, lo, hi) => {
    const y = bodyY + ly * cs - lz * sn;
    return clamp(y / (TP.legLen * Math.max(0.55, Math.cos(swing))), lo, hi);
  };
  const fL = -sw + a.rear * 0.95 - a.sit * 0.04, fR = sw + a.rear * 0.95 - a.sit * 0.04;
  TG.shL.rotation.set(fL, 0, 0.05); TG.shR.rotation.set(fR, 0, -0.05);
  TG.shL.scale.set(1, reach(TP.shY, TP.shZ, fL, 0.45, 1.30), 1);
  TG.shR.scale.set(1, reach(TP.shY, TP.shZ, fR, 0.45, 1.30), 1);
  // the hind legs fold right up under a sitting tiger; the hock takes the weight
  const hL = sw * 0.85 + a.sit * 1.05, hR = -sw * 0.85 + a.sit * 1.05;
  TG.hipL.rotation.set(hL, 0, 0.09); TG.hipR.rotation.set(hR, 0, -0.09);
  const hf = 1 - a.sit * 0.42;
  TG.hipL.scale.set(1, reach(TP.hipY, TP.hipZ, hL, 0.34, 1.30) * hf, 1);
  TG.hipR.scale.set(1, reach(TP.hipY, TP.hipZ, hR, 0.34, 1.30) * hf, 1);

  // ── neck + skull ───────────────────────────────────────────────────────────
  const nk = TG.neck;
  nk.position.set(0, TP.neckY + a.headY, TP.neckZ + a.headZ);
  // keep the head level-ish however the spine is tipped: a stalking cat carries
  // its skull low and FLAT, which is most of what makes it read as a stalk
  nk.rotation.x = a.pitch + a.sit * 0.10 - sp.rotation.x * 0.55 + Math.sin(el * 1.15 + c.ph) * 0.02;

  let hy = 0;
  if (c.lookAt) {
    const want = wrapPi(Math.atan2(c.lookAt.x - c.x, c.lookAt.z - c.z) - c.yaw);
    if (Math.abs(want) < 1.35) hy = clamp(want, -0.58, 0.58) * 0.85;
  }
  const hp = TG.headPivot;
  hp.rotation.set(-a.crouch * 0.20 + a.rear * 0.35, hy + tg.mv * Math.sin(tg.gait) * -0.05, Math.sin(el * 0.7 + c.ph) * 0.03);
  hp.scale.setScalar(TP.headScale * (1 + a.chest * 0.03));

  // ears: small, round, and flat to the skull when it means it
  c.flick = Math.max(0, (c.flick || 0) - dt * 2.2);
  TG.earL.rotation.set(-0.06 + a.ear * 0.95 + c.flick * 0.7, 0.20, 0.34 + a.ear * 0.60);
  TG.earR.rotation.set(-0.06 + a.ear * 0.95, -0.20, -0.34 - a.ear * 0.60);

  // jaw
  TG.jawN.rotation.x = 0.04 + a.mouth * 0.78;
  TG.muzzleN.position.set(0, TP.muzzleY - a.mouth * 0.012, TP.muzzleZ);

  // ── borrowed face: big eyes, slit pupils, long whiskers, the same hat ──────
  tg.blinkT -= dt;
  if (tg.blinkT <= 0) { tg.blinkT = 2.4 + c.seed * 5.5; tg.blink = 0.17; }
  let bf = 1;
  if (tg.blink > 0) { tg.blink -= dt; bf = smoothstep(0, 0.055, Math.abs(tg.blink - 0.085)); }
  const open = clamp(a.eye * bf, 0.04, 1.25);
  const EX = TP.eyeX, EY = TP.eyeY, EZ = TP.eyeZ;
  // a hard inward slant under the brow is most of what stops a big round eye
  // reading as a kitten's
  const tilt = 0.30 + a.ear * 0.16;
  R.eyeL.position.set(-EX, EY, EZ); R.eyeR.position.set(EX, EY, EZ);
  R.eyeL.rotation.set(0, 0, tilt); R.eyeR.rotation.set(0, 0, -tilt);
  R.eyeL.scale.set(1.34, 1.26 * open, 0.80); R.eyeR.scale.set(1.34, 1.26 * open, 0.80);
  R.pupL.position.set(-EX, EY, EZ + 0.052); R.pupR.position.set(EX, EY, EZ + 0.052);
  R.pupL.rotation.set(0, 0, tilt); R.pupR.rotation.set(0, 0, -tilt);
  R.pupL.scale.set(0.38, 1.60 * open, 0.82); R.pupR.scale.set(0.38, 1.60 * open, 0.82);
  R.whisk.position.set(0, -0.168, 0.400); R.whisk.scale.set(1.05, 0.85, 1.00);
  // The hat stays on — that is the joke — but it was made for a head a third
  // this size, so it PERCHES. Sat on the CROWN it sliced straight through both
  // ears (the ears live at y 0.30, z −0.045 and are 0.36 across), so it rides
  // forward on the BROW instead, tipped over one eye: clear of the ears in z,
  // small enough in x, and considerably funnier.
  if (TG.hat) { TG.hat.position.set(0.018, 0.300, 0.300); TG.hat.rotation.set(0.46, 0.05, 0.11); TG.hat.scale.setScalar(0.66); }

  // ── tail: long, heavy, black-tipped, and never still ───────────────────────
  // (base: droop back-and-down; segments: the tip curls up and lashes. A
  //  sitting tiger's tail reaches the ground and sweeps round one flank.)
  const swish = Math.sin(tg.swishPh) * a.swish;
  const side = c.seed > 0.5 ? 1 : -1;
  TG.tailBase.rotation.set(TAIL_BACK + a.tail * 0.62 - a.curl * 0.30, 0, swish * 0.16 + a.wrap * side * 0.30);
  for (let i = 1; i < TG.tailSegs.length; i++) {
    const s = TG.tailSegs[i], w = i / (TG.tailSegs.length - 1);   // the tip does most of the lashing
    s.rotation.set(a.curl * (i === 1 ? 0.7 : 1.0) * (1 - a.wrap * 0.35) + Math.sin(tg.swishPh * 0.8 - i * 0.5) * 0.06,
      0, Math.sin(tg.swishPh - i * 0.55) * (0.10 + 0.10 * w) * a.swish + a.wrap * side * 0.34);
  }

  root.updateMatrixWorld(true);

  // ── eye glow: two additive sprites, billboarded, so they carry at 30 m ─────
  const cam = ctx.camera;
  const gs = 0.185 * T * vis * clamp(open * 1.4, 0.2, 1.3);
  for (let i = 0; i < 2; i++) {
    const n = TG.glow[i];
    _v.x = (i ? EX : -EX); _v.y = EY; _v.z = EZ + 0.09;
    n.position.set(_v.x, _v.y, _v.z).applyMatrix4(hp.matrixWorld);
    n.quaternion.copy(cam.quaternion);
    n.scale.set(gs, gs, gs);
    n.updateMatrix(); n.matrixWorld.copy(n.matrix);
  }
}

// ═══ THE BRAIN ═══════════════════════════════════════════════════════════════
const TAU = Math.PI * 2;

/** Shared prowl state: a handful of packs drifting along the island's streets,
 *  and one that LURKS: it owns Purrliament Square after dark, working slowly
 *  round the edge of the flagstones and sitting down to stare at intervals
 *  (a lit square with nobody in it at 22:00 was the least frightening place
 *  on the island). `ring` = [inner, outer] slot radius round a fixed centre. */
export function createPackState(world, rand) {
  const ROUTES = ['cat_main', 'cat_park', 'cat_gym', 'cat_harbor'];
  const packs = [];
  const SQ = world.LANDMARKS && world.LANDMARKS.town_square;
  for (let i = 0; i < 6; i++) {
    if (i === 5 && SQ) {
      packs.push({ id: i, route: 'square', path: null, ring: [10.5, 15.0], t: 0, dir: rand() < 0.5 ? -1 : 1,
        x: SQ.x, z: SQ.z, wait: 0, rot: rand() * TAU, cyc: rand() * 10 });
      continue;
    }
    // one pack always works Main Street — that is where the visitor walks — but
    // only one: twenty tigers converging on the same paving slab was a rug.
    const route = i === 0 ? 'cat_main' : ROUTES[i % ROUTES.length];
    const path = world.PATHS.find((p) => p.id === route);
    // the harbour pack turns round at the top of the harbour road instead of
    // halting on Welcome Plaza, where the Main Street pack already passes (two
    // packs parked round one fountain was the heap by the MISSING board)
    const t0 = route === 'cat_harbor' ? 0.24 : 0.04;
    const t = i === 0 ? 0.52 : t0 + rand() * (0.96 - t0);
    const q = world.pointOnPolyline(path.points, t);
    packs.push({ id: i, route, path, t, t0, dir: rand() < 0.5 ? -1 : 1, x: q.x, z: q.z, wait: 0 });
  }
  return {
    packs,
    update(dt) {
      for (const p of packs) {
        if (p.ring) {
          // round the square at a slow walk (~0.7 u/s at the edge), then a halt
          if (p.wait > 0) { p.wait -= dt; continue; }
          p.rot += p.dir * dt * 0.05;
          p.cyc += dt;
          if (p.cyc > 16) { p.cyc = 0; p.wait = 6 + rand() * 6; if (rand() < 0.3) p.dir = -p.dir; }
          continue;
        }
        if (p.wait > 0) { p.wait -= dt; continue; }
        p.t += p.dir * dt * 0.012;
        if (p.t > 0.96) { p.t = 0.96; p.dir = -1; p.wait = 3 + rand() * 7; }
        if (p.t < p.t0) { p.t = p.t0; p.dir = 1; p.wait = 3 + rand() * 7; }
        const q = world.pointOnPolyline(p.path.points, p.t);
        p.x = q.x; p.z = q.z;
      }
    },
  };
}

/**
 * One tiger's plan for this frame. Returns a plan object in the same shape the
 * rest of the brain uses, plus (rarely) `catch: true` when it has you.
 */
export function tigerPlan(c, h, ctx, S, T) {
  const p = ctx.systems.player?.position;
  const pack = T.packs.packs[c.packIdx % T.packs.packs.length];
  // phyllotaxis, not a fraction of TAU: slots 0, 3, 6 … used to land on exactly
  // the same angle AND the same radius, and seven tigers stood inside each other
  // slotRot: S.settle turns a tiger's place in the formation when its spot
  // keeps landing inside a building (it turns around and tries elsewhere)
  const ang = c.packSlot * 2.39996 + (pack.ring ? pack.rot : S.elapsed * 0.10) + (c.slotRot || 0);
  const spread = pack.ring
    ? pack.ring[0] + (((c.packSlot * 7) % 5) / 4) * (pack.ring[1] - pack.ring[0]) + c.seed * 0.6
    : 4.2 + ((c.packSlot * 7) % 5) * 2.6 + c.seed * 1.2;
  let hx = pack.x + Math.cos(ang) * spread, hz = pack.z + Math.sin(ang) * spread;
  // Off duty, a tiger gives the visitor a WIDE berth: a place in the pack that
  // would put it within BERTH of him slides out to that ring. Only the three
  // hunters come closer (a pack halted on the plaza he is standing in used to
  // sit down all round him, a metre off, and the frame was fur).
  // (out on the tiger's OWN side of him: told to go round him to the far side
  //  of the ring, a tiger in a narrow street walked back and forth past him)
  if (p && c.huntRank >= 3) {
    const ox = hx - p.x, oz = hz - p.z, od = Math.hypot(ox, oz);
    if (od < BERTH) {
      let ux = c.x - p.x, uz = c.z - p.z; const ul = Math.hypot(ux, uz);
      if (ul > 1e-3) { ux /= ul; uz /= ul; } else { ux = Math.sin(ang); uz = Math.cos(ang); }
      hx = p.x + ux * BERTH; hz = p.z + uz * BERTH;
    }
  }

  // currently carrying the visitor home by the scruff
  if (c.carryTo) return { act: 'post', x: c.carryTo.x, z: c.carryTo.z, pose: 'carry', speed: 3.4 };

  // dawn: one big yawn on the spot before the stripes go away
  if (c.yawnUntil > S.elapsed) return { act: 'post', x: c.x, z: c.z, pose: 'yawn', face: c.faceDir, hold: 1 };
  // just transformed: announce it
  if (c.roarUntil > S.elapsed) {
    const f = p ? Math.atan2(p.x - c.x, p.z - c.z) : c.faceDir;
    return { act: 'post', x: c.x, z: c.z, pose: 'roar', face: f };
  }

  // spooked by a spray bottle / a bat / the wave-3 arsenal / a visitor who is
  // currently a STAR: back off, and keep backing off (see catCitizens.hit)
  if (c.fxUntil > S.elapsed && c.fxKind) {
    const k = c.fxKind;
    // (`hold`: on the spot, wherever a knockback has carried it)
    if (k === 'stun' || k === 'spin' || k === 'bonk') return { act: 'post', x: c.x, z: c.z, pose: 'stun', face: c.faceDir, hold: 1 };
    if (k === 'stuck') return { act: 'post', x: c.x, z: c.z, pose: 'crouch', face: c.faceDir, hold: 1 };
    if (k === 'stagger' || k === 'hiss') return { act: 'post', x: c.x, z: c.z, pose: k === 'hiss' ? 'hiss' : 'flinch', face: c.faceDir, hold: 1 };
    let a = Math.atan2(c.x - c.fxX, c.z - c.fxZ);
    if (k === 'panic') a += Math.sin(S.elapsed * 3.1 + c.ph * 5) * 1.1;
    const run = k === 'flee' || k === 'scared' || k === 'panic';
    return { act: 'post', x: c.x + Math.sin(a) * 10, z: c.z + Math.cos(a) * 10, pose: run ? 'flee' : 'flinch', speed: run ? 5.6 : 5.0 };
  }

  // Only the three nearest tigers work the visitor. Twenty of them converging
  // at once was a pile of fur with a hat in it, and you could not see the town.
  //
  // PERSONAL SPACE. A tiger does not stand on you. The hunters hold a RING
  // round the visitor — 4 to 6 u out, centre to centre, so a muzzle stays 2–3
  // m off him — circling low, crouching, sitting to stare. Only the nearest
  // one ever closes the gap, and only in one committed spring (gather, wiggle,
  // LAUNCH) when it can actually catch him: never while he is a star, rolling
  // (i-frames), already caught, or in the grace after arriving / waking up /
  // a jumped clock — then it stays on the ring with the others, crouched and
  // lashing its tail, which is the frightening part anyway. (citizens.js
  // separateTigers() backs this with a hard 2-u exclusion round him.)
  const pl = ctx.systems.player;
  const hunting = p && ctx.state.island === 'cat' && !pl.onFerry
    && !T.carrying && c.huntRank < 3
    && !ctx.systems.powerups?.active;              // nobody hunts a STAR (Contract B)
  if (hunting) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    const toP = Math.atan2(p.x - c.x, p.z - c.z);
    const canCatch = S.elapsed > T.graceUntil && !pl.invulnerable && !pl.locked;
    const R = 4.8 + c.huntRank * 0.7 + c.seed * 0.5;
    if (canCatch && c.huntRank === 0 && d < 8.5) {
      if (d < 2.4) return { act: 'post', x: p.x, z: p.z, pose: 'rush', catch: true, spring: 1, speed: 5.4 };
      // gather, then spring. A cat that walks calmly into you is not a threat;
      // a cat that goes flat, wiggles, and LAUNCHES is the whole scene.
      const phase = (S.elapsed * 0.42 + c.seed * 3) % 1;
      if (phase < 0.30) return { act: 'post', x: c.x, z: c.z, pose: 'crouch', face: toP };
      return { act: 'post', x: p.x, z: p.z, pose: 'rush', spring: 1, speed: 4.4 + (c.spec.size ?? 1) * 0.6 };
    }
    if (d < R + 3.5) {
      // on the ring: crouch, sit and stare, then pad a little way round him
      const cyc = (S.elapsed * 0.15 + c.seed * 3.7) % 1;
      const inside = d < R - 0.8;
      if (!inside && cyc < 0.30) return { act: 'post', x: c.x, z: c.z, pose: 'crouch', face: toP };
      if (!inside && cyc < 0.48) return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: toP };
      const b = Math.atan2(c.x - p.x, c.z - p.z), da = (inside ? 0.15 : 0.55) * (c.seed > 0.5 ? 1 : -1);
      // (ax, az: the same step the other way round him — navigate() takes it
      //  when this side is a shopfront, and sits the tiger down if both are)
      return { act: 'post', x: p.x + Math.sin(b + da) * R, z: p.z + Math.cos(b + da) * R, pose: 'stalk', speed: inside ? 2.4 : 1.2,
        ring: 1, ax: p.x + Math.sin(b - da) * R, az: p.z + Math.cos(b - da) * R };
    }
    if (d < 18) {
      // stalk: circle in, slow, low, never in a straight line — and every few
      // seconds stop dead and stare at you, which is worse
      const cyc = (S.elapsed * 0.14 + c.seed * 2) % 1;
      if (cyc < 0.20) return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: toP };
      const a = Math.atan2(c.x - p.x, c.z - p.z) + 0.42 * (c.seed > 0.5 ? 1 : -1);
      const r = Math.max(R, d - 5.0);
      return { act: 'post', x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r, pose: 'stalk', speed: 1.5 };
    }
  }
  // off duty: prowl the pack's beat, and about a third of them sit and stare
  // whenever the pack halts, which is the bit that makes a street feel watched
  // (the square's lurkers sit more often than they walk)
  if (pack.wait > 0 && c.seed < (pack.ring ? 0.62 : 0.38) && Math.hypot(hx - c.x, hz - c.z) < 2.6) {
    const f = p && Math.hypot(p.x - c.x, p.z - c.z) < 40 ? Math.atan2(p.x - c.x, p.z - c.z) : c.faceDir;
    return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: f };
  }
  return { act: 'post', x: hx, z: hz, pose: 'prowl', speed: 1.4 + c.seed * 0.5 };
}

export { clamp, damp };
