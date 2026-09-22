// THE VISITOR — a chunky procedural tourist. Built from primitives, baked into
// ~14 vertex-coloured meshes (one per animated rig node) and posed procedurally.
//
// Proportions: feet at y=0, eyes at ~1.47, top of head 1.74, hat crown ~1.89.
// The head is scaled 1.09 on top of that: at 25 units the face has to win the
// silhouette, or a critic reads the tourist as one more cat.
//
// PROFILE DISCIPLINE: the head is an ellipsoid (semi-axes 0.275 / 0.283 / 0.267)
// and every feature is placed against surf(x,y) — the skin's z at that point —
// and env(y) — the furthest z at that height over all x, i.e. the profile
// outline. Off-centre features (eyes, cheeks) must stay inside env() or they
// bulge out of the head when you see the visitor side-on; only the nose is
// allowed to break it, because noses do.
import * as THREE from 'three';
import { part, limb } from './geo.js';
import { clamp, damp, lerp, TAU } from '../../core/util.js';

// ── palette (5 hues: blue, red, yellow, cream, skin/brown) ────────────────────
const C = {
  skin: 0xf3c79c, skinDark: 0xe0ab7e, blush: 0xff8fa0,
  hair: 0x6b4226, hairLit: 0x7d5230,
  shirtA: 0xfff6e6, shirtB: 0x3a6ea5,   // sailor stripes
  shorts: 0xd8412f, shortsDark: 0xb52f20,
  hat: 0xffd23a, hatShade: 0xf0b81e, band: 0xd8412f,
  pack: 0x3a6ea5, packDark: 0x2b5680, packBuckle: 0xffd23a,
  shoe: 0xfff6e6, shoeSole: 0xd8412f,
  camBody: 0x33333d, camTop: 0x6d7078, camLens: 0x8fb8d8, camGlass: 0x1b2a38, strap: 0xd8412f,
  harness: 0x7a4a2a,                    // one brown band across the stripes, not six navy ones
  eyeWhite: 0xffffff, pupil: 0x241b1f, spark: 0xffffff,
  mouth: 0x8f3040, tongue: 0xe0647a,
};

const HIP_Y = 0.60, TORSO_Y = 0.68, SHO_Y = 1.12, SHO_X = 0.335, SHO_Z = 0.035, NECK_Y = 1.24;
const SHO_L = SHO_Y - TORSO_Y;     // shoulder pivot, torso-local
const NECK_L = NECK_Y - TORSO_Y;   // neck pivot, torso-local
const HEAD_C = 0.18;               // head centre, head-local → abs 1.42
const HEAD_R = 0.275;              // x semi-axis; scale below gives y 0.283 / z 0.267
const HEAD_S = [1, 1.03, 0.97];
const HEAD_SCALE = 1.09;           // whole head, so the human face wins at game distance
const HAT_Y = HEAD_C + 0.145;      // brim plane
// THE BRIM. At the gameplay stop (31 u, 0.64 rad) the lens looks DOWN at the
// hat, so a wide brim is a yellow disc with legs under it: the critics could not
// find a face. The brim lost 28% of its radius, the hat is tipped further back,
// it no longer casts (its shadow was what put the face in the dark) and the head
// carries a standing HEAD_UP tilt — together that is a face, not a hat.
const HAT_TILT = -0.44;            // brim tipped well back so the iso camera sees the face
const HEAD_UP = 0.11;              // …and the chin comes up to meet the lens
// Stripes at 31 units: 4.9 cm bands are sub-pixel and grey out into putty. Wider
// bands keep the sailor shirt as the colour hook the silhouette is read by.
const STRIPE = { size: 0.078, offset: 0.018, colors: [C.shirtA, C.shirtB] };
const KNEE_Y = -0.245;             // knee pivot, thigh-local (foot lift shortens this)
const SOLE = -0.355;               // sole plane, shank-local
const SOLE_CLEAR = 0.016;          // the shoes hover a hair above the ground, never in it

// ── head surface maths (the whole face is authored against these) ─────────────
// HS = ellipsoid semi-axes. surf(x,y) = the skin's z at that point; env(y) = the
// furthest z at that height over ALL x, i.e. the profile silhouette. A feature
// off the mid-line may poke past surf() but must stay inside env() or it breaks
// the head's outline when you see the visitor side-on.
const HS = [HEAD_R * HEAD_S[0], HEAD_R * HEAD_S[1], HEAD_R * HEAD_S[2]];
const surf = (x, y) => HS[2] * Math.sqrt(Math.max(0, 1 - (x / HS[0]) ** 2 - (y / HS[1]) ** 2));
const env = (y) => surf(0, y);
const EYE_X = 0.126, EYE_Y = 0.030;    // eyes sit wide (more profile slack) and low
const MOUTH_Y = -0.112;

/** A curved band cut out of the head sphere — used for brows and hair. */
function shell(b, color, { r, yc, xc, w, h, seg = 8 }) {
  const r0 = HEAD_R + r;
  const y0 = yc / HEAD_S[1];
  const ct = clamp(y0 / r0, -0.999, 0.999);
  const th = Math.acos(ct), st = Math.sin(th) || 1e-3;
  const ring = r0 * st;                              // circle radius at this latitude
  const d = Math.asin(clamp(xc / ring, -0.999, 0.999));
  const dPhi = w / ring / 2, dTh = h / ring / 2;
  for (const s of [-1, 1]) {
    const phi = Math.PI / 2 + s * d;
    b.add(new THREE.SphereGeometry(r0, seg, 2, phi - dPhi, dPhi * 2, th - dTh, dTh * 2), color,
      { pos: [0, HEAD_C, 0], scale: HEAD_S });
  }
  return b;
}

export function createVisitor() {
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  const torsoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  const hatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.70, metalness: 0 });
  const eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0 });
  const faceMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 });

  const root = new THREE.Group();          // yaw = facing
  const lean = new THREE.Group();          // slope tilt + lean into velocity
  const bob = new THREE.Group();           // vertical bob + squash/stretch
  root.add(lean); lean.add(bob);

  // ── legs (shorts leg is part of the leg, so it can never clip the thigh) ───
  function makeLeg(side) {
    const hip = new THREE.Group(); hip.position.set(side * 0.163, HIP_Y, 0);
    const knee = new THREE.Group(); knee.position.set(0, KNEE_Y, 0);
    const b1 = part();
    // hip ball in shorts colour: rotating a sphere about its own centre is
    // invisible, so the shorts/thigh joint stays seamless at any swing.
    b1.add(new THREE.SphereGeometry(0.158, 14, 10), C.shorts, { pos: [0, 0, 0] });
    b1.add(new THREE.CylinderGeometry(0.152, 0.142, 0.13, 14), C.shorts, { pos: [0, -0.062, 0] });
    b1.add(new THREE.CylinderGeometry(0.146, 0.146, 0.026, 14), C.shortsDark, { pos: [0, -0.122, 0] });
    limb(b1, C.skin, { len: 0.245, r0: 0.118, r1: 0.107 });
    const b2 = part();
    limb(b2, C.skin, { len: 0.225, r0: 0.107, r1: 0.092 });
    b2.add(new THREE.CylinderGeometry(0.110, 0.124, 0.090, 10), C.shirtA, { pos: [0, -0.200, 0] });   // sock cuff
    // REAL SHOES. Big white sneakers on a red sole: at 31 units the feet are the
    // only thing that touches the ground, so they have to be a shape (and a
    // colour) of their own instead of a skin-coloured smudge.
    b2.blob(0.140, [1.16, 0.66, 1.86], C.shoe, { pos: [0, -0.268, 0.066] });
    b2.blob(0.138, [1.20, 0.33, 1.82], C.shoeSole, { pos: [0, -0.310, 0.066] });
    b2.blob(0.086, [1.10, 0.86, 0.92], C.shoe, { pos: [0, -0.252, 0.196] });    // toe cap
    b2.add(new THREE.BoxGeometry(0.036, 0.030, 0.12), C.shoeSole, { pos: [0, -0.238, 0.150], rot: [0.12, 0, 0] }); // laces flash
    const m1 = b1.mesh(bodyMat), m2 = b2.mesh(bodyMat);
    hip.add(m1); hip.add(knee); knee.add(m2);
    return { hip, knee, side, x: side * 0.163, lift: 0, tgt: 0 };
  }
  const legL = makeLeg(-1), legR = makeLeg(1);
  bob.add(legL.hip, legR.hip);

  // ── torso (shirt + shorts + backpack + camera) ─────────────────────────────
  const torso = new THREE.Group(); torso.position.set(0, TORSO_Y, 0);
  {
    const b = part();
    const y = (abs) => abs - TORSO_Y;
    // shorts — hem stops above the hip balls so the legs articulate cleanly
    b.add(new THREE.CylinderGeometry(0.288, 0.322, 0.23, 16), C.shorts, { pos: [0, y(0.745), 0] });
    b.add(new THREE.SphereGeometry(0.30, 16, 8), C.shorts, { pos: [0, y(0.825), 0], scale: [1, 0.52, 0.96] });
    b.add(new THREE.CylinderGeometry(0.322, 0.316, 0.05, 16), C.shortsDark, { pos: [0, y(0.638), 0] });
    // belt
    b.add(new THREE.TorusGeometry(0.292, 0.033, 6, 18), C.shirtA, { pos: [0, y(0.87), 0], rot: [Math.PI / 2, 0, 0] });
    b.add(new THREE.BoxGeometry(0.08, 0.075, 0.05), C.hat, { pos: [0, y(0.87), 0.29] });
    // striped shirt
    b.add(new THREE.CylinderGeometry(0.315, 0.296, 0.33, 20, 12, true), C.shirtA, { pos: [0, y(1.005), 0], bands: STRIPE });
    b.add(new THREE.SphereGeometry(0.316, 20, 10), C.shirtA, { pos: [0, y(1.155), 0], scale: [1.01, 0.38, 0.96], bands: STRIPE });
    b.add(new THREE.CylinderGeometry(0.302, 0.306, 0.05, 20), C.shirtB, { pos: [0, y(0.855), 0] });
    // neck
    b.add(new THREE.CylinderGeometry(0.098, 0.118, 0.17, 12), C.skinDark, { pos: [0, y(1.215), 0] });
    // backpack — narrower and tucked in so the arms clear it on the backswing
    b.blob(0.19, [1.0, 1.10, 0.58], C.pack, { pos: [0, y(1.00), -0.285], seg: 14 });
    b.blob(0.193, [1.0, 0.46, 0.62], C.packDark, { pos: [0, y(1.105), -0.28], seg: 14 });
    b.blob(0.044, [1, 0.8, 1], C.packBuckle, { pos: [0, y(0.99), -0.40] });
    // TWO SHAPES ON THE CHEST, NOT TWELVE. The old rig wore six strap boxes, two
    // buckles, a camera body, a top plate, a wind lever and a shutter button:
    // at 31 units that is one brown smear across the one thing that identifies
    // the visitor — the sailor stripes. It is now a single dark harness band
    // (one shape) with the camera hung on it (the other), both low enough that
    // the striped chest and shoulders stay the colour hook.
    b.add(new THREE.TorusGeometry(0.318, 0.048, 6, 20), C.harness, { pos: [0, y(0.975), 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.97] });
    b.add(new THREE.BoxGeometry(0.090, 0.072, 0.07), C.packBuckle, { pos: [0.150, y(0.975), 0.285] });
    // the camera: one block, one bright lens. Nothing smaller than 4 cm survives
    // the trip to the game camera, so nothing smaller is modelled.
    b.add(new THREE.BoxGeometry(0.235, 0.165, 0.115), C.camBody, { pos: [0, y(0.905), 0.285] });
    b.add(new THREE.BoxGeometry(0.245, 0.050, 0.122), C.camTop, { pos: [0, y(0.982), 0.285] });
    b.add(new THREE.CylinderGeometry(0.056, 0.056, 0.065, 14), C.camBody, { pos: [0, y(0.905), 0.335], rot: [Math.PI / 2, 0, 0] });
    b.add(new THREE.TorusGeometry(0.056, 0.015, 6, 16), C.camLens, { pos: [0, y(0.905), 0.368] });
    b.add(new THREE.CylinderGeometry(0.043, 0.043, 0.014, 14), C.camGlass, { pos: [0, y(0.905), 0.370], rot: [Math.PI / 2, 0, 0] });
    torso.add(b.mesh(torsoMat));
  }
  bob.add(torso);

  // ── arms (pivot pushed out and forward so the swing clears the backpack) ──
  function makeArm(side) {
    const sh = new THREE.Group(); sh.position.set(side * SHO_X, SHO_L, SHO_Z);
    const el = new THREE.Group(); el.position.set(0, -0.195, 0);
    const b1 = part();
    b1.add(new THREE.SphereGeometry(0.115, 12, 9), C.shirtB, { pos: [0, 0, 0] });
    limb(b1, C.shirtB, { len: 0.195, r0: 0.096, r1: 0.088 });
    b1.add(new THREE.CylinderGeometry(0.092, 0.092, 0.033, 10), C.shirtA, { pos: [0, -0.183, 0] });
    const b2 = part();
    limb(b2, C.skin, { len: 0.185, r0: 0.081, r1: 0.072 });
    b2.blob(0.10, [1, 1.05, 0.85], C.skin, { pos: [0, -0.225, 0.01] });
    const m1 = b1.mesh(bodyMat), m2 = b2.mesh(bodyMat);
    sh.add(m1); sh.add(el); el.add(m2);
    return { sh, el };
  }
  const armL = makeArm(-1), armR = makeArm(1);
  torso.add(armL.sh, armR.sh);

  // ── head ───────────────────────────────────────────────────────────────────
  const head = new THREE.Group(); head.position.set(0, NECK_L, 0);
  head.scale.setScalar(HEAD_SCALE);
  torso.add(head);
  {
    const b = part();
    b.add(new THREE.SphereGeometry(HEAD_R, 22, 16), C.skin, { pos: [0, HEAD_C, 0], scale: HEAD_S });
    b.blob(0.168, [1.0, 0.80, 0.98], C.skin, { pos: [0, HEAD_C - 0.166, 0.042], seg: 14 });           // jaw
    b.blob(0.085, [1.0, 0.62, 0.72], C.skin, { pos: [0, HEAD_C - 0.196, 0.148], seg: 12 });           // chin
    for (const s of [-1, 1]) b.blob(0.066, [0.52, 1.0, 0.82], C.skin, { pos: [s * 0.266, HEAD_C + 0.004, -0.020] });
    for (const s of [-1, 1]) b.blob(0.028, [0.5, 0.8, 0.7], C.skinDark, { pos: [s * 0.280, HEAD_C, -0.020] });
    // nose — the one feature that is SUPPOSED to break the profile, so make it
    // unmistakable: a rounded wedge on the mid-line, sitting below the eye line
    // (up between the eyes it reads as a ridge, not a nose)
    b.blob(0.050, [0.95, 0.80, 1.20], C.skin, { pos: [0, HEAD_C - 0.040, env(-0.040) - 0.032], seg: 12 });
    b.blob(0.018, [1.5, 0.50, 0.55], C.skinDark, { pos: [0, HEAD_C - 0.068, env(-0.068) - 0.002] });  // nostril shade
    for (const s of [-1, 1]) {
      const bx = 0.185, by = -0.062, bz = surf(bx, by);
      const k = 1 - 0.040 / Math.hypot(bx, by, bz);       // sink along the normal
      b.blob(0.050, [1, 1, 1], C.blush, { pos: [s * bx * k, HEAD_C + by * k, bz * k], seg: 10 });
    }
    // hair: back shell + side tufts + a nape tuft tucked flush to the skull
    b.add(new THREE.SphereGeometry(HEAD_R + 0.018, 20, 12, Math.PI / 2 + 0.92, TAU - 1.84, 0, 1.55), C.hair, { pos: [0, HEAD_C, 0], scale: HEAD_S });
    for (const s of [-1, 1]) b.blob(0.072, [0.5, 1.25, 0.9], C.hair, { pos: [s * 0.242, HEAD_C - 0.025, 0.05] });
    b.blob(0.085, [0.95, 0.62, 0.52], C.hair, { pos: [0, HEAD_C - 0.150, -0.182] });
    head.add(b.mesh(bodyMat));
  }
  // eyes — one node so blinking scales both. Set wide, where the ellipsoid has
  // slack between surf() and env(), so the lens+pupil stack reads big from the
  // front and still never breaks the silhouette in profile.
  const eyes = new THREE.Group(); eyes.position.set(0, HEAD_C + EYE_Y, 0); head.add(eyes);
  {
    const b = part();
    const zW = surf(EYE_X, EYE_Y) - 0.028;     // white, sunk into the socket
    for (const s of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.080, 14, 11), C.eyeWhite, { pos: [s * EYE_X, 0, zW], scale: [1, 1.02, 0.50] });
      b.add(new THREE.SphereGeometry(0.046, 12, 10), C.pupil, { pos: [s * (EYE_X + 0.002), -0.004, zW + 0.028], scale: [1, 1.02, 0.55] });
      b.add(new THREE.SphereGeometry(0.014, 8, 6), C.spark, { pos: [s * (EYE_X + 0.016), 0.026, zW + 0.038] });
      b.add(new THREE.SphereGeometry(0.009, 6, 5), C.spark, { pos: [s * (EYE_X - 0.022), -0.022, zW + 0.042] });
    }
    const m = b.mesh(eyeMat); m.receiveShadow = false; m.userData.faceDetail = true; eyes.add(m);
  }
  // brows — curved shells cut from the head sphere, so they can never float
  const brows = new THREE.Group(); brows.position.set(0, 0, 0); head.add(brows);
  {
    const b = part();
    shell(b, C.hair, { r: 0.010, yc: 0.148, xc: 0.122, w: 0.140, h: 0.036 });
    const m = b.mesh(faceMat); m.receiveShadow = false; m.userData.faceDetail = true; brows.add(m);
  }
  // mouths (smile / open "o"). The smile is a row of beads each planted ON the
  // head ellipsoid — a torus ring floats off a curved face at the corners and
  // pops through it in the middle; beads cannot detach at any angle.
  const mouth = new THREE.Group(); mouth.position.set(0, HEAD_C + MOUTH_Y, 0); head.add(mouth);
  const smile = (() => {
    const b = part();
    for (let i = 0; i <= 5; i++) {
      const u = i / 2.5 - 1;                    // -1 … 1
      const x = u * 0.078, y = 0.026 * u * u;   // corners lifted = smile
      b.add(new THREE.SphereGeometry(0.024, 9, 7), C.mouth,
        { pos: [x, y, surf(x, MOUTH_Y + y) - 0.009 - 0.012 * u * u], scale: [1, 0.92, 0.90] });
    }
    const m = b.mesh(faceMat); m.receiveShadow = false; m.userData.faceDetail = true; return m;
  })();
  const oh = (() => {
    const b = part();
    b.add(new THREE.SphereGeometry(0.066, 14, 10), C.mouth, { pos: [0, 0.002, surf(0, MOUTH_Y) - 0.030], scale: [0.98, 1.0, 0.62] });
    b.add(new THREE.SphereGeometry(0.038, 10, 8), C.tongue, { pos: [0, -0.032, surf(0, MOUTH_Y) - 0.002], scale: [1.05, 0.55, 0.35] });
    const m = b.mesh(faceMat); m.receiveShadow = false; m.userData.faceDetail = true; return m;
  })();
  oh.visible = false;
  mouth.add(smile, oh);

  // ── hat ────────────────────────────────────────────────────────────────────
  const hat = new THREE.Group(); hat.position.set(0, HAT_Y, -0.035); head.add(hat);
  {
    const b = part();
    b.add(new THREE.CylinderGeometry(0.276, 0.300, 0.05, 20), C.hat, { pos: [0, 0, 0] });
    b.add(new THREE.TorusGeometry(0.296, 0.030, 5, 22), C.hatShade, { pos: [0, -0.006, 0], rot: [Math.PI / 2, 0, 0] });
    b.add(new THREE.CylinderGeometry(0.232, 0.284, 0.170, 18), C.hat, { pos: [0, 0.090, 0] });
    b.add(new THREE.SphereGeometry(0.232, 18, 8), C.hat, { pos: [0, 0.172, 0], scale: [1, 0.46, 1] });
    b.add(new THREE.CylinderGeometry(0.280, 0.288, 0.062, 18), C.band, { pos: [0, 0.042, 0] });
    // sunglasses pushed up onto the crown — a dark human-shaped accent that no
    // cat in this game owns, and the cheapest "tourist" tell at any distance
    for (const s of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.060, 12, 9), C.camGlass, { pos: [s * 0.100, 0.058, 0.256], scale: [1, 0.80, 0.34] });
      b.add(new THREE.TorusGeometry(0.056, 0.012, 5, 14), C.camTop, { pos: [s * 0.100, 0.058, 0.264], scale: [1, 0.82, 0.5] });
      b.add(new THREE.BoxGeometry(0.026, 0.040, 0.100), C.camTop, { pos: [s * 0.190, 0.055, 0.212], rot: [0, -s * 0.78, 0] });  // temple arm
    }
    b.add(new THREE.BoxGeometry(0.056, 0.022, 0.05), C.camTop, { pos: [0, 0.064, 0.262] });                                     // bridge
    const hatMesh = b.mesh(hatMat);
    // The brim used to cast a hard shadow straight down the face — a hat with a
    // dark hole under it. The ground shadow it loses is 12 cm wide and the head
    // below it still casts; the face it buys back is the whole character.
    hatMesh.castShadow = false;
    hat.add(hatMesh);
  }
  hat.rotation.x = HAT_TILT;

  // ── THROUGH-GEOMETRY SILHOUETTE — the visitor is never lost ────────────────
  // The camera's capsule sweep moves the lens around big meshes, but it cannot
  // see instanced palm fronds and it cannot dolly past a plinth the visitor is
  // standing behind. So the body is drawn a SECOND time, flat cream-amber,
  // where — and only where — something is in front of it:
  //   depthTest ON with depthFunc = GreaterDepth, depthWrite OFF. A fragment
  //   passes exactly when the depth buffer already holds something NEARER, i.e.
  //   that pixel of the visitor is hidden. Nothing in front of him? Nothing
  //   draws, and the pass is free.
  // The catch is that the body occludes ITSELF (the far arm behind the chest,
  // the head behind the brim), which would paint cream over a perfectly visible
  // visitor. Hence SIL_PUSH: the silhouette is shifted SIL_PUSH units toward the
  // lens in VIEW space by the vertex shader, which is more than the body's own
  // depth, so self-occlusion can never trigger it — only a real blocker at
  // least SIL_PUSH in front does. MeshBasicMaterial + toneMapped:false means it
  // reads the same at midnight as at noon.
  const SIL_PUSH = 0.75;
  const silMat = new THREE.MeshBasicMaterial({
    color: 0xffab45, transparent: true, opacity: 0.76,
    depthWrite: false, depthTest: true, depthFunc: THREE.GreaterDepth,
    fog: false, toneMapped: false, side: THREE.FrontSide,
  });
  silMat.onBeforeCompile = (sh) => {
    sh.uniforms.silPush = { value: SIL_PUSH };
    if (!sh.vertexShader.includes('#include <project_vertex>')) return;    // never break the render
    sh.vertexShader = 'uniform float silPush;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n\tmvPosition.z += silPush;\n\tgl_Position = projectionMatrix * mvPosition;',
    );
  };
  silMat.customProgramCacheKey = () => 'visitor-silhouette';
  const silMeshes = [];
  {
    const hosts = [];
    root.traverse((o) => { if (o.isMesh && !o.userData.faceDetail && !o.userData.silhouette) hosts.push(o); });
    for (const o of hosts) {
      const g = new THREE.Mesh(o.geometry, silMat);
      g.name = 'visitor_silhouette';
      g.position.copy(o.position); g.quaternion.copy(o.quaternion); g.scale.copy(o.scale);
      g.castShadow = false; g.receiveShadow = false; g.frustumCulled = false;
      g.renderOrder = 9990;                       // after every opaque and every ghosted blocker
      g.userData.silhouette = true; g.userData.noFade = true; g.userData.noOcclude = true; g.userData.noShadow = true;
      o.parent.add(g);
      silMeshes.push(g);
    }
  }

  // ── animation state ────────────────────────────────────────────────────────
  const st = {
    phase: 0, seg: 0, blink: 0, blinkNext: 2.2, lookYaw: 0, lookPitch: 0, lookT: 1.6,
    lookTgtYaw: 0, lookTgtPitch: 0, sq: 0, sqV: 0, emo: 'neutral', emoMix: { happy: 0, scared: 0 },
    trot: 0,
    // wave-2 moves: every one of these is a 0..1 blend weight over the walk cycle
    leanX: 0, leanZ: 0, slideK: 0, stompK: 0, rollK: 0, flipK: 0, spinCur: 0,
  };
  // where each sole actually is in the world — player.js samples the ground
  // under it and hands back a per-foot lift, so a shoe never sinks into a step,
  // a deck or a hillside. Read off the real matrices: an analytic version of
  // this missed the lean/roll/squash and let the shoe dip 8 cm on a slope.
  const worldFeet = [{ x: 0, y: 0, z: 0, lift: 0 }, { x: 0, y: 0, z: 0, lift: 0 }];
  const _sole = new THREE.Vector3();

  const api = {
    group: root, root, nodes: { lean, bob, torso, head, hat, eyes, brows, mouth, legL, legR, armL, armR },
    materials: { bodyMat, torsoMat, hatMat, eyeMat, faceMat },
    setEmotion(e) { st.emo = (e === 'happy' || e === 'scared') ? e : 'neutral'; },
    getEmotion() { return st.emo; },
    /** Per-foot ground correction in world units (0 = leg at full length),
     *  applied by shortening the shin — invisible at these magnitudes. A foot
     *  that is INSIDE the ground is lifted this same frame (a damped rise lags
     *  the swing and the shoe dips ~8 cm under a fast stride); coming back down
     *  is damped in update(), where a snap would read as a twitch. */
    setFootLift(l, r) {
      legL.tgt = clamp(l || 0, 0, 0.16); legR.tgt = clamp(r || 0, 0, 0.16);
      for (const L of [legL, legR]) if (L.tgt > L.lift) { L.lift = L.tgt; L.knee.position.y = KNEE_Y + L.lift; }
    },
    /** 0 = day, 1 = deep night. Keeps the hat + stripes the brightest thing on screen. */
    setNightGlow(k) {
      const n = clamp(k, 0, 1);
      // Emissive is a floor, not the light: the visitor's own warm PointLight
      // (see player.js) does the lifting, so keep these low — a grey-blue
      // emissive strong enough to be seen washes the red shorts out to putty.
      hatMat.emissive.setRGB(n * 0.30, n * 0.215, n * 0.055);
      torsoMat.emissive.setRGB(n * 0.105, n * 0.100, n * 0.110);
      bodyMat.emissive.setRGB(n * 0.085, n * 0.062, n * 0.046);
      eyeMat.emissive.setRGB(n * 0.100, n * 0.100, n * 0.110);
      faceMat.emissive.setRGB(n * 0.075, n * 0.048, n * 0.044);
    },

    /** The through-geometry silhouette pass: its meshes + the shared material,
     *  so the owner can tune the colour or switch it off (a free camera framing
     *  the island does not want a cream ghost floating in it). */
    silhouette: { material: silMat, meshes: silMeshes },
    setSilhouette(on) { const v = on !== false; for (const m of silMeshes) m.visible = v; return v; },
    get silhouetteOn() { return silMeshes.length > 0 && silMeshes[0].visible; },

    /**
     * Pose the rig. `s` = { elapsed, speed, moving, turnRate, accel, hop, wade,
     *   slopePitch, slopeRoll, locked, landed, tookOff }
     * Returns { step: 0|-1|1 } — nonzero on a footfall (side of the planted foot).
     */
    update(dt, s) {
      const sp = s.speed || 0;
      const moving = sp > 0.35 && !s.locked;
      const run = clamp((sp - 6.2) / 5.0, 0, 1);
      const moveAmt = clamp(sp / 5.0, 0, 1);
      let step = 0;

      // ── gait phase ───────────────────────────────────────────────────────
      const turning = Math.abs(s.turnRate || 0) > 1.3 && sp < 3.0 && !s.locked;   // pivot shuffle
      st.trot = damp(st.trot, turning ? 1 : 0, 8, dt);
      if (moving) st.phase += dt * (1.4 + sp * 1.78);
      else if (st.trot > 0.05) st.phase += dt * 6.2 * st.trot;
      else st.phase = damp(st.phase, Math.round(st.phase / Math.PI) * Math.PI, 6, dt);
      if (st.phase > TAU * 4096) { st.phase -= TAU * 4096; st.seg = Math.floor(st.phase / Math.PI); }
      const seg = Math.floor(st.phase / Math.PI);
      if (seg !== st.seg) { if ((moving || st.trot > 0.4) && s.hop <= 0.001) step = (seg % 2 === 0) ? 1 : -1; st.seg = seg; }

      const gait = moving ? 1 : st.trot * 0.45;
      const sw = Math.sin(st.phase);
      const legAmp = (0.20 + moveAmt * 0.44 + run * 0.18) * gait;
      const kneeAmp = 0.42 + run * 0.62;

      // legs: swing + knee bend (knee only folds backwards)
      legL.hip.rotation.x = -sw * legAmp;
      legR.hip.rotation.x = sw * legAmp;
      legL.knee.rotation.x = Math.max(0, -Math.sin(st.phase + 1.15)) * kneeAmp * gait + 0.04;
      legR.knee.rotation.x = Math.max(0, Math.sin(st.phase + 1.15)) * kneeAmp * gait + 0.04;
      legL.hip.rotation.z = -0.055 - (1 - gait) * 0.02; legR.hip.rotation.z = 0.055 + (1 - gait) * 0.02;
      // ground clamp from last frame: shorten the shin rather than float the body
      for (const L of [legL, legR]) {
        const tgt = s.hop > 0.001 ? 0 : L.tgt;
        L.lift = tgt > L.lift ? tgt : damp(L.lift, tgt, 12, dt);
        L.knee.position.y = KNEE_Y + L.lift;
      }

      // arms: big readable arcs, swung wide of the torso/backpack silhouette so
      // the limbs are legible as limbs at 25 units
      const armAmp = (0.23 + moveAmt * 0.62 + run * 0.42) * gait;
      const idleArm = Math.sin(s.elapsed * 1.5) * 0.022 * (1 - gait);
      armL.sh.rotation.x = sw * armAmp + idleArm;
      armR.sh.rotation.x = -sw * armAmp - idleArm;
      const armOut = 0.35 + run * 0.13 + (1 - gait) * 0.03 + moveAmt * 0.07;
      armL.sh.rotation.z = -armOut - Math.max(0, sw) * 0.08 * gait;
      armR.sh.rotation.z = armOut + Math.max(0, -sw) * 0.08 * gait;
      const elbow = 0.22 + run * 0.85 * gait;
      armL.el.rotation.x = -(elbow + Math.max(0, sw) * 0.45 * gait);
      armR.el.rotation.x = -(elbow + Math.max(0, -sw) * 0.45 * gait);

      // ── body bob / squash / lean ─────────────────────────────────────────
      const bobAmp = (0.018 + moveAmt * 0.045 + run * 0.03) * gait;
      const bobY = (0.5 - 0.5 * Math.cos(st.phase * 2)) * bobAmp;
      const breathe = Math.sin(s.elapsed * 1.55) * 0.012 * (1 - gait);
      const hop = s.hop || 0;

      // squash & stretch spring, kicked by acceleration and landings
      st.sqV += (-st.sq * 210 - st.sqV * 19) * dt;
      st.sqV += clamp((s.accel || 0) * 0.028, -1.6, 1.6) * dt * 26;
      if (s.landed) st.sqV -= 9.5;
      if (s.tookOff) st.sqV += 7.0;
      st.sq = clamp(st.sq + st.sqV * dt, -0.12, 0.13);
      const sq = st.sq + (hop > 0.01 ? 0.07 : 0);
      bob.scale.set(1 - sq * 0.55, 1 + sq, 1 - sq * 0.55);
      bob.position.y = bobY + breathe + SOLE_CLEAR;
      bob.rotation.z = sw * 0.05 * gait + Math.sin(s.elapsed * 0.7) * 0.012 * (1 - gait) - clamp((s.turnRate || 0) * 0.035, -0.14, 0.14);
      torso.rotation.y = -sw * 0.13 * gait;
      torso.rotation.x = 0.02 + moveAmt * 0.04 * gait;
      torso.scale.y = 1 + Math.sin(s.elapsed * 1.55) * 0.024 * (1 - gait);
      torso.scale.x = torso.scale.z = 1 - Math.sin(s.elapsed * 1.55) * 0.013 * (1 - gait);

      // lean into velocity + terrain slope (kept in st so the tumbles below can
      // add to it without feeding their own rotation back into the damp)
      const leanX = clamp(moveAmt * 0.10 + run * 0.14 + (s.accel || 0) * 0.006, -0.10, 0.30) * gait;
      st.leanX = damp(st.leanX, leanX + (s.slopePitch || 0) * 0.55, 9, dt);
      st.leanZ = damp(st.leanZ, (s.slopeRoll || 0) * 0.55 - clamp((s.turnRate || 0) * 0.045, -0.18, 0.18), 9, dt);
      lean.rotation.x = st.leanX;
      lean.rotation.z = st.leanZ;

      // ── head: counter-sway, look-around, emotion ─────────────────────────
      st.lookT -= dt;
      if (st.lookT <= 0) {
        const r = Math.sin(s.elapsed * 12.9898 + st.phase) * 43758.5453;
        const f = r - Math.floor(r);
        if (moving) { st.lookTgtYaw = (f - 0.5) * 0.5; st.lookTgtPitch = 0; st.lookT = 1.6 + f * 2.2; }
        else if (st.lookTgtYaw !== 0 || st.lookTgtPitch !== 0) { st.lookTgtYaw = 0; st.lookTgtPitch = 0; st.lookT = 1.4 + f * 2.6; }
        else { st.lookTgtYaw = (f - 0.5) * 1.5; st.lookTgtPitch = (f - 0.5) * 0.34; st.lookT = 0.9 + f * 1.4; }
      }
      st.lookYaw = damp(st.lookYaw, st.lookTgtYaw, 4.5, dt);
      st.lookPitch = damp(st.lookPitch, st.lookTgtPitch, 4.5, dt);
      head.rotation.y = st.lookYaw + sw * 0.055 * gait;
      // HEAD_UP: the chin is carried a few degrees up all the time, so the lens
      // (which looks down at 0.64 rad) gets face and not scalp.
      head.rotation.x = -HEAD_UP + st.lookPitch - leanX * 0.7 + Math.sin(st.phase * 2 + 1) * 0.02 * gait;
      head.rotation.z = -sw * 0.03 * gait;
      head.position.y = NECK_L - bobY * 0.22;

      // hat flap
      hat.rotation.x = HAT_TILT - run * 0.09 - Math.abs(Math.sin(st.phase)) * 0.05 * run - hop * 0.22;
      hat.rotation.z = Math.sin(st.phase * 2 + 0.6) * 0.04 * run;
      hat.position.y = HAT_Y + Math.max(0, Math.sin(st.phase * 2)) * 0.014 * run + hop * 0.022;

      // blink
      st.blinkNext -= dt;
      if (st.blinkNext <= 0) { st.blink = 0.15; st.blinkNext = 2.0 + ((Math.sin(s.elapsed * 3.13) + 1) * 2.2); }
      if (st.blink > 0) st.blink -= dt;
      const lid = st.blink > 0 ? clamp(Math.abs(st.blink - 0.075) / 0.075, 0.08, 1) : 1;

      // emotion blend
      const tHappy = st.emo === 'happy' ? 1 : 0, tScared = st.emo === 'scared' ? 1 : 0;
      st.emoMix.happy = damp(st.emoMix.happy, tHappy, 8, dt);
      st.emoMix.scared = damp(st.emoMix.scared, tScared, 8, dt);
      const H = st.emoMix.happy, S = st.emoMix.scared;
      const tremble = S * Math.sin(s.elapsed * 26) * 0.012;
      eyes.scale.set(1 + S * 0.22, lid * (1 - H * 0.34 + S * 0.28), 1 + S * 0.14);
      eyes.position.y = HEAD_C + EYE_Y + H * 0.010 + S * 0.004 + tremble * 0.3;
      brows.rotation.x = -S * 0.115 + H * 0.045;       // slides the shells up the skull
      brows.rotation.z = tremble * 0.6;
      mouth.scale.set(1 + H * 0.35 - S * 0.1, 1 + H * 0.25, 1);
      mouth.position.y = HEAD_C + MOUTH_Y - H * 0.008 + S * 0.006;
      smile.visible = S < 0.5;
      oh.visible = S >= 0.5;
      head.position.x = tremble; head.position.z = tremble * 0.5;

      // ── wave-2 moves ─────────────────────────────────────────────────────
      // Everything above is the walk cycle. Everything below BLENDS OVER it by
      // weight, so a duck that is 40% in is 40% of the way to the crouch and
      // the legs are still walking. Order = priority: the later the pose, the
      // more it wins. Tumbles (roll, flip) rotate the body about its belly —
      // hence the pivot shuffle between `lean` and `bob`, without which the
      // visitor cartwheels around his own heels.
      const duckW = clamp(s.duck || 0, 0, 1);
      const rollOn = (s.roll ?? -1) >= 0, flipOn = (s.flip ?? -1) >= 0;
      st.slideK = damp(st.slideK, s.slide ? 1 : 0, s.slide ? 16 : 7, dt);
      st.stompK = damp(st.stompK, s.stomp ? 1 : 0, 18, dt);
      st.rollK = damp(st.rollK, rollOn ? 1 : 0, rollOn ? 24 : 9, dt);
      st.flipK = damp(st.flipK, flipOn ? 1 : 0, flipOn ? 22 : 8, dt);
      const poseW = clamp(s.poseK || 0, 0, 1);

      const ex = { drop: 0, leanX: 0, headX: 0 };
      const blend = (w, t) => {
        if (w <= 0.002) return;
        const L = (a, b) => a + (b - a) * w;
        legL.hip.rotation.x = L(legL.hip.rotation.x, t.hipL ?? t.hip ?? 0);
        legR.hip.rotation.x = L(legR.hip.rotation.x, t.hipR ?? t.hip ?? 0);
        legL.knee.rotation.x = L(legL.knee.rotation.x, t.kneeL ?? t.knee ?? 0);
        legR.knee.rotation.x = L(legR.knee.rotation.x, t.kneeR ?? t.knee ?? 0);
        legL.hip.rotation.z = L(legL.hip.rotation.z, -(t.hipZ ?? 0.055));
        legR.hip.rotation.z = L(legR.hip.rotation.z, (t.hipZ ?? 0.055));
        armL.sh.rotation.x = L(armL.sh.rotation.x, t.shL ?? t.sh ?? 0);
        armR.sh.rotation.x = L(armR.sh.rotation.x, t.shR ?? t.sh ?? 0);
        armL.sh.rotation.z = L(armL.sh.rotation.z, -(t.shZ ?? 0.35));
        armR.sh.rotation.z = L(armR.sh.rotation.z, (t.shZ ?? 0.35));
        armL.el.rotation.x = L(armL.el.rotation.x, t.elL ?? t.el ?? -0.22);
        armR.el.rotation.x = L(armR.el.rotation.x, t.elR ?? t.el ?? -0.22);
        torso.rotation.x = L(torso.rotation.x, t.torsoX ?? 0.02);
        torso.rotation.y = L(torso.rotation.y, t.torsoY ?? 0);
        ex.drop = L(ex.drop, t.drop || 0);
        ex.leanX = L(ex.leanX, t.leanX || 0);
        ex.headX = L(ex.headX, t.headX || 0);
      };

      // DUCK — knees folded under, chest forward, head up: half height, and the
      // silhouette still reads as a person and not a ball.
      blend(duckW * (1 - st.slideK) * (1 - st.rollK), {
        // measured against the rig: pelvis 0.60, thigh 0.245, shank+sole 0.355 —
        // hip -1.15 / knee 2.05 folds the legs enough to drop the body 0.38
        // (head 1.74 → ~1.30) with the soles still inside the foot-clamp's reach.
        hip: -1.15, knee: 2.05, hipZ: 0.18, sh: 0.30, shZ: 0.46, el: -0.95,
        torsoX: 0.34, drop: 0.38, leanX: 0.06, headX: -0.26,
      });
      // SLIDE — one leg out, one tucked, weight back, arms trailing.
      blend(st.slideK, {
        hipL: -1.32, hipR: -0.55, kneeL: 0.22, kneeR: 1.75, hipZ: 0.22,
        sh: 1.25, shZ: 0.60, el: -0.30, torsoX: 0.10, drop: 0.62, leanX: -0.52, headX: -0.18,
      });
      // STOMP — legs snapped straight down, arms thrown up. Sells the slam.
      blend(st.stompK, {
        hip: -0.18, knee: 0.12, hipZ: 0.02, sh: -2.75, shZ: 0.28, el: -0.20,
        torsoX: 0.06, leanX: 0.10, headX: 0.12,
      });
      // ROLL — tucked ball; FLIP — showier, legs together, arms in.
      blend(st.rollK, {
        hip: -1.72, knee: 2.10, hipZ: 0.10, sh: -0.55, shZ: 0.16, el: -1.65,
        torsoX: 0.55, drop: -0.10, headX: 0.30,
      });
      blend(st.flipK * (1 - st.rollK), {
        hip: -1.25, knee: 1.55, hipZ: 0.08, sh: -1.35, shZ: 0.22, el: -1.25,
        torsoX: 0.30, drop: -0.14, headX: 0.22,
      });

      // riding poses (a vehicle owns the body: canoe seat, catapult cup, wings)
      if (poseW > 0.002 && s.pose && s.pose !== 'stand') {
        const t = s.elapsed || 0;
        const P = {
          sit: { hip: -1.42, knee: 1.42, hipZ: 0.20, sh: 0.20, shZ: 0.34, el: -0.62, torsoX: 0.04, drop: 0.06, headX: -0.06 },
          paddle: {
            hip: -1.40, knee: 1.40, hipZ: 0.24, torsoX: 0.10, drop: 0.06, leanX: 0.08,
            shL: -0.85 + Math.sin(t * 3.4) * 0.55, shR: -0.85 - Math.sin(t * 3.4) * 0.55,
            shZ: 0.30, elL: -0.75, elR: -0.75, torsoY: Math.sin(t * 3.4) * 0.22,
          },
          fly: {
            hip: 0.42, knee: 0.18, hipZ: 0.10, sh: -1.55, shZ: 1.45, el: -0.10,
            torsoX: -0.10, leanX: -0.55, drop: 0.0, headX: 0.34,
          },
          flail: {
            hipL: -0.85 + Math.sin(t * 9) * 0.5, hipR: -0.85 - Math.sin(t * 9) * 0.5, knee: 0.95, hipZ: 0.18,
            shL: -2.35 + Math.sin(t * 11) * 0.9, shR: -2.35 - Math.sin(t * 11) * 0.9, shZ: 0.55, el: -0.70,
            torsoX: 0.12, drop: 0.02, headX: 0.10,
          },
        }[s.pose];
        if (P) blend(poseW, P);
      }

      // ACTION — the right arm only (weapons). Blended on last so it survives
      // whatever pose you are in: you can swing a bat while sitting in a canoe.
      const act = s.action;
      if (act && act.dur > 0) {
        const u = clamp(act.t / act.dur, 0, 1);
        const w = clamp(Math.min(u / 0.12, (1 - u) / 0.20), 0, 1);
        let shX = -1.2, shZ = 0.30, elX = -0.5, twist = 0;
        if (act.kind === 'swing') {
          shX = u < 0.28 ? lerp(0.2, -2.45, u / 0.28) : u < 0.62 ? lerp(-2.45, 1.05, (u - 0.28) / 0.34) : lerp(1.05, 0.35, (u - 0.62) / 0.38);
          elX = u < 0.28 ? -1.25 : -0.18;
          twist = u < 0.28 ? -0.32 * (u / 0.28) : lerp(-0.32, 0.40, clamp((u - 0.28) / 0.34, 0, 1));
          shZ = 0.22;
        } else if (act.kind === 'throw') {
          shX = u < 0.38 ? lerp(0.2, -2.15, u / 0.38) : u < 0.58 ? lerp(-2.15, 0.95, (u - 0.38) / 0.20) : lerp(0.95, 0.30, (u - 0.58) / 0.42);
          elX = u < 0.38 ? lerp(-0.4, -1.55, u / 0.38) : -0.12;
          twist = u < 0.38 ? -0.38 * (u / 0.38) : lerp(-0.38, 0.34, clamp((u - 0.38) / 0.20, 0, 1));
          shZ = 0.26;
        } else {                               // spray: arm out, nozzle shaking
          shX = -1.42 + Math.sin((s.elapsed || 0) * 34) * 0.045;
          elX = -0.22; shZ = 0.20; twist = -0.10;
        }
        armR.sh.rotation.x += (shX - armR.sh.rotation.x) * w;
        armR.sh.rotation.z += (shZ - armR.sh.rotation.z) * w;
        armR.el.rotation.x += (elX - armR.el.rotation.x) * w;
        torso.rotation.y += (twist - torso.rotation.y) * w;
      }

      // Tumbles rotate the whole body about the belly, not the heels. The angle
      // follows the move's own progress and is NEVER scaled by the blend weight:
      // a finished tumble sits at exactly TAU, which is the identity, so letting
      // the weight fade it would spin the visitor a second time, backwards.
      const spinW = Math.max(st.rollK, st.flipK);
      const spinT = TAU * clamp(rollOn ? s.roll : flipOn ? s.flip : 0, 0, 1);
      if (spinT === 0 && st.spinCur > TAU * 0.7) st.spinCur = 0;
      st.spinCur = damp(st.spinCur, spinT, 26, dt);
      const spin = st.spinCur;
      const pivot = 0.86 * spinW;
      lean.position.y = pivot;
      bob.position.y = bobY + breathe + SOLE_CLEAR - pivot - ex.drop;
      lean.rotation.x = st.leanX + ex.leanX + spin;
      head.rotation.x += ex.headX;

      return { step };
    },
    /** Both soles in WORLD space (+ the lift already applied to each), for the
     *  caller's ground clamp. Call after the root has been positioned. */
    feetWorld() {
      root.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) {
        const L = i ? legR : legL;
        _sole.set(0, SOLE, 0.055);
        L.knee.localToWorld(_sole);
        const f = worldFeet[i];
        f.x = _sole.x; f.y = _sole.y; f.z = _sole.z; f.lift = L.lift;
      }
      return worldFeet;
    },
    reset() {
      st.phase = 0; st.seg = 0; st.sq = 0; st.sqV = 0; st.lookYaw = st.lookTgtYaw = 0; st.lookPitch = st.lookTgtPitch = 0;
      for (const L of [legL, legR]) { L.lift = L.tgt = 0; L.knee.position.y = KNEE_Y; }
    },
  };
  api.setNightGlow(0);
  return api;
}

export { C as VISITOR_COLORS };
