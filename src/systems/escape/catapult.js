// ─────────────────────────────────────────────────────────────────────────────
// THE BIG FLING — LANDMARKS.catapult (120, 78), on the flattened core.
//
// A yarn-and-timber counterweight siege engine: an A-frame of fat timbers, a
// throwing arm with a fish crate bolted to the business end, a ball of yarn the
// size of a cow as the counterweight, and a sign that says UNDER REPAIR
// (FOREVER). Bolt, the mechanic, has been asleep on the sled since Tuesday.
//
// Broken until story flag `helper_3`. Two ways to get it (wave 3, Contract D):
//   · the WINCH is a real object: a brass drum with a crank, glowing, on the
//     quay beside Rusty's crate under the harbour road, with a sign and a teal
//     light column. E picks it up (inventory tool 'winch', worn on the back),
//     carry it up the harbour road, E at the empty cradle behind the machine
//     installs it → helper_3;
//   · or pay Rusty three candy and he fetches it for you (his old route).
//   before → "The winch is missing. It's on the quay by Rusty's crate."
//   after  → "Board the Big Fling" → ratchet down, 3-2-1, and a 175-unit
//            parabola west over the sea to a splash landing on the Candyland
//            shore near (-50, 45) → escape:success { route: 'catapult' }.
//
// Draw calls at the machine: base 1 · arm 1 · yarn 1 · winch 1 · rope 1 ·
//   sign 1 · cat 1 · fingerpost site 1 (+ ghost 1 while you carry the winch).
// At the quay: site 1 · winch 1 · beam 1.  On your back: 1.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CAT, CANDY } from '../../core/palette.js';
import { clamp, smoothstep, damp } from '../../core/util.js';
import {
  B, catGeo, signMesh, winchGeo, glowMat, beamField, Site, signAtlas, winchSpot, itemSpot,
  nearestPathPoint, yawTo, readYaw, armYaw, mapMarker, ensureWinchItem, rustyHint, drainRustyHints,
  colorGlowMat, nightSign, poolMesh,
} from './parts.js';
import { createRider, beachPoint, vehicleBusy, clearSpot, clearanceClaim } from './ride.js';

const SCALE = 1.50;         // big enough that the crate rides above the palm fronds
const PIVOT = 4.4;          // axle height above the sled
const ARM = 6.4;            // pivot → crate
const CW = 2.3;             // pivot → yarn counterweight
// RESTING: the arm stands OUT TO SEA. At −0.55 the crate leaned back over the
// harbour path — a siege engine apparently aimed at the town it lives in. The
// throwing sweep still runs A_LOAD → A_STOP, so the idle pose is simply the
// far end of that arc, which is also where a real trebuchet sits once it has
// thrown: counterweight down, arm up and over the target.
const A_IDLE = 0.52;
const A_LOAD = -2.25;       // ratcheted down: the crate is at step-in height
const A_STOP = 0.78;        // where the arm slams into the crossbar
const A_FIRE = 0.30;        // the rider leaves the crate here
const FLIGHT = 5.6;         // seconds in the air
const GRAV = 16;            // comic gravity — a 70-unit-high arc
const SPLASH = { x: -50, z: 45 };

const TIMBER = 0x8d5a34, TIMBER_DK = 0x6b4126, IRON = 0x4a4a54;
const YARN = 0xff7aa8, YARN_2 = 0xffdc5c;

export function create(ctx, api) {
  const { scene, world } = ctx;
  ctx.colliders = ctx.colliders || [];
  const base0 = world.LANDMARKS.catapult;
  // WHERE THE SLED STANDS. The cat_catapult path ENDS at the landmark centre
  // and runs away north-west, and the ground falls into the sea seven units
  // south (z ≥ +9 is already under water), so the old spot put the base beams
  // across the path and the new one very nearly in the surf. (+6, −4) is the
  // dry shoulder between the two: 6.9 units off the path centreline, 13 from
  // the waterline, still inside the flattened core.
  const lm = clearSpot(ctx, base0.x + 6.0, base0.z - 4.0, { radius: 2.5, step: 0.5, need: 7, minH: 3.0, pull: 0.35, pad: 2.6 });
  const my = world.height(lm.x, lm.z);
  const aim = Math.atan2(SPLASH.x - lm.x, SPLASH.z - lm.z);   // local +Z points at Candyland
  const sa = Math.sin(aim), ca = Math.cos(aim);

  const rider = createRider(ctx);
  const beach = beachPoint(world, SPLASH.x, SPLASH.z, -1, -0.42, 1.5);

  // ── build ──────────────────────────────────────────────────────────────────
  const group = new THREE.Group();
  group.position.set(lm.x, my, lm.z);
  group.rotation.y = aim;
  group.scale.setScalar(SCALE);
  scene.add(group);

  const base = new B();
  // sled runners + deck planks
  for (const s of [-1, 1]) base.beam([s * 2.3, 0.28, -4.6], [s * 2.3, 0.28, 3.6], 0.55, TIMBER_DK);
  for (let i = 0; i < 6; i++) base.box(5.2, 0.24, 0.62, TIMBER, 0, 0.62, -4.2 + i * 1.6);
  // A-frame uprights + crossbar
  for (const s of [-1, 1]) {
    base.beam([s * 2.3, 0.7, -1.9], [s * 1.15, PIVOT, 0], 0.60, TIMBER);
    base.beam([s * 2.3, 0.7, 1.9], [s * 1.15, PIVOT, 0], 0.60, TIMBER);
    base.box(0.42, 0.42, 1.5, TIMBER_DK, s * 1.9, 1.9, 0.0, 0.42);      // knee brace
    base.cyl(0.20, 0.20, 0.5, 6, IRON, s * 1.3, PIVOT, 0, 0, 0, Math.PI / 2);  // bearing block
  }
  base.cyl(0.26, 0.26, 3.2, 8, IRON, 0, PIVOT, 0, 0, 0, Math.PI / 2);   // axle
  // TORSION BUNDLE: a fat skein of yarn wound on the axle with two twisting
  // levers through it — the thing that makes the machine read as a MECHANISM
  // and not as a plank on a stick.
  for (const s of [-1, 1]) {
    base.cyl(0.62, 0.62, 0.9, 10, YARN, s * 0.85, PIVOT, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 7; i++) base.torus(0.64, 0.075, 4, 10, i % 2 ? YARN_2 : 0xffffff, s * 0.85, PIVOT, 0, 0, 0, Math.PI / 2 + i * 0.26);
    base.cyl(0.09, 0.09, 1.9, 6, TIMBER_DK, s * 0.85, PIVOT + 0.1, 0, 0.5 + s * 0.3, 0, 0);   // twisting lever
    base.box(0.5, 0.14, 0.14, IRON, s * 0.85, PIVOT + 0.72, 0.55 * s, 0, 0, 0);               // pawl
  }
  // the ratchet wheel the pawl bites on
  base.cyl(0.8, 0.8, 0.16, 12, 0x9aa3b0, -1.45, PIVOT, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 10; i++) base.box(0.22, 0.22, 0.14, 0xb8c0cc, -1.45, PIVOT + Math.cos(i * 0.63) * 0.82, Math.sin(i * 0.63) * 0.82, 0, 0, i * 0.63);
  // The bar the yarn slams into, and its cushion. Both sit TANGENT to the
  // counterweight at rest (A_IDLE): the ball's centre is then at (0, 2.10,
  // −1.32) with r 1.3, and the contact normal points (0, −0.55, −0.835). The
  // old bar and cushion stood inside the ball (0.4 u deep), which read as a
  // sphere clipping through the timbers. The bar rests on the deck planks.
  base.beam([-2.3, 0.97, -3.03], [2.3, 0.97, -3.03], 0.5, TIMBER_DK);
  base.box(1.9, 0.5, 0.8, 0x6a5a52, 0, 1.2455, -2.611, 0.988);          // old cushion, well punished
  for (const s of [-1, 1]) base.box(0.34, 0.5, 0.34, IRON, s * 2.05, 0.97, -3.03);   // iron end caps
  // winch cradle at the back: two posts with iron bearing caps and a low rail
  // (EMPTY until somebody brings the winch back from the quay)
  for (const s of [-1, 1]) {
    base.box(0.5, 1.5, 0.5, TIMBER, s * 1.25, 1.35, -4.2);
    base.box(0.6, 0.22, 0.6, IRON, s * 1.25, 2.16, -4.2);
  }
  base.box(2.9, 0.26, 0.6, TIMBER_DK, 0, 0.95, -4.2);
  // a ladder, because the crate is nine feet up
  for (const s of [-1, 1]) base.beam([s * 0.55, 0.2, -5.2], [s * 0.55, 3.1, -4.3], 0.16, TIMBER);
  for (let i = 0; i < 5; i++) base.box(1.3, 0.12, 0.16, TIMBER_DK, 0, 0.5 + i * 0.62, -5.02 + i * 0.18);
  // spare yarn, a bucket, a pile of broken crates
  base.sph(0.55, 7, 5, YARN_2, -3.1, 0.55, -2.2);
  base.sph(0.42, 7, 5, 0x6ad0ff, -3.4, 0.42, -0.9);
  base.cyl(0.42, 0.34, 0.7, 8, IRON, 3.2, 0.35, -1.4);
  base.box(1.1, 0.7, 0.9, TIMBER, 3.2, 0.35, 1.2, 0.2, 0.4);
  base.box(1.0, 0.6, 0.8, TIMBER_DK, 3.5, 0.9, 1.0, -0.3, 0.9, 0.2);
  const baseMesh = base.build('bigfling_base');
  group.add(baseMesh);

  // ── the arm (pivots about local X at y = PIVOT) ─────────────────────────────
  const arm = new THREE.Group();
  arm.position.set(0, PIVOT, 0);
  arm.rotation.x = A_IDLE;
  group.add(arm);

  const ab = new B();
  // The lever stops ON the counterweight (its top is at −CW − 0.35 + 1.3), bolted
  // through an iron cap — it used to run straight through the ball's centre.
  ab.beam([0, -CW + 0.92, 0], [0, ARM, 0], 0.52, TIMBER);                // the lever
  ab.beam([0, -CW + 0.92, 0], [0, ARM, 0], 0.30, TIMBER_DK);             // (a second, thinner spine reads as a lashed pair)
  for (let i = 0; i < 5; i++) ab.torus(0.34, 0.07, 4, 8, YARN_2, 0, -1.2 + i * 1.6, 0, Math.PI / 2);  // yarn lashings
  ab.box(1.0, 0.34, 1.0, IRON, 0, 0, 0);                                 // hub
  // fish crate, open top, at the tip
  ab.crate(1.6, 1.15, 1.6, 0.17, TIMBER, 0, ARM + 0.55, 0);
  ab.box(1.62, 0.16, 0.2, CAT.teal, 0, ARM + 0.72, 0.72);                // painted band
  ab.box(1.62, 0.16, 0.2, CAT.teal, 0, ARM + 0.28, 0.72);
  ab.sph(0.22, 6, 4, 0xbfe6ff, 0.35, ARM + 0.18, -0.3, [1.6, 0.7, 0.9]); // a forgotten fish
  ab.cone(0.2, 0.28, 4, 0xbfe6ff, 0.72, ARM + 0.18, -0.3, 0, 0, Math.PI / 2);
  // THE SLING. Four yarn cords off the tip into a leather pouch that hangs
  // under the crate — the payload end of the mechanism, and the thing that
  // tells you which way this machine throws.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    ab.beam([sx * 0.62, ARM - 0.05, sz * 0.62], [sx * 0.34, ARM - 1.45, sz * 0.34], 0.055, YARN_2);
  }
  ab.sph(0.62, 8, 5, 0x8a5a34, 0, ARM - 1.72, 0, [1.15, 0.62, 1.15]);
  ab.torus(0.6, 0.07, 4, 10, YARN_2, 0, ARM - 1.5, 0, Math.PI / 2);
  ab.sph(0.3, 7, 5, CANDY.gummyBlue, 0.1, ARM - 1.78, -0.1, [1, 0.8, 1]);   // one loose gumball left in it
  const armMesh = ab.build('bigfling_arm');
  arm.add(armMesh);

  // counterweight: a cow-sized ball of yarn that spins as it falls
  const yb = new B();
  yb.sph(1.30, 12, 9, YARN, 0, 0, 0);
  for (let i = 0; i < 9; i++) yb.torus(1.29, 0.095, 4, 14, i % 3 === 0 ? 0xffffff : (i % 3 === 1 ? YARN_2 : 0xfff0f5), 0, 0, 0, i * 0.9, i * 0.45, i * 0.37);
  yb.cyl(0.15, 0.15, 0.9, 6, IRON, 0, 1.5, 0);
  yb.cyl(0.4, 0.5, 0.14, 8, IRON, 0, 1.27, 0);                          // the cap the lever bolts to
  const yarnBall = yb.build('bigfling_yarn');
  yarnBall.position.set(0, -CW - 0.35, 0);
  arm.add(yarnBall);

  // WARM FILL. At dusk the timbers went near-black and the frame, arm, cradle
  // and ladder merged into one silhouette. One shared material that EMITS a
  // warm share of each vertex colour after dark (the lanterns' light, faked
  // without a PointLight) keeps every part its own colour.
  const fillMat = colorGlowMat(0xffb070, { roughness: 0.78, intensity: 0 });
  for (const m of [baseMesh, armMesh, yarnBall]) { m.material.dispose(); m.material = fillMat; }

  // two work lanterns on posts: one by the ladder (lights the winch and the
  // boarding spot), one at the front corner; each throws a pool on the ground
  const LAMPS = [[-2.05, -6.1, 1], [3.1, 2.5, -1]];      // local x, z, which way the arm reaches
  const lamps = new B();
  for (const [lx, lz, dir] of LAMPS) {
    const hx = lx + dir * 0.62;
    lamps.cyl(0.1, 0.13, 2.5, 6, TIMBER_DK, lx, 1.25, lz);
    lamps.box(0.86, 0.12, 0.12, TIMBER_DK, lx + dir * 0.34, 2.4, lz);
    lamps.box(0.05, 0.22, 0.05, IRON, hx, 2.24, lz);
    lamps.cone(0.21, 0.18, 6, IRON, hx, 2.1, lz);
    lamps.cyl(0.15, 0.15, 0.34, 6, 0xffe2a8, hx, 1.84, lz);
    lamps.cyl(0.17, 0.17, 0.06, 6, IRON, hx, 1.64, lz);
  }
  const lampMat = colorGlowMat(0xffffff, { roughness: 0.6, intensity: 0.3 });
  const lampMesh = new THREE.Mesh(lamps.geometry(), lampMat);
  lampMesh.name = 'bigfling_lanterns'; lampMesh.castShadow = true; lampMesh.receiveShadow = true;
  group.add(lampMesh);
  const toWorld = (lx, lz) => [lm.x + (lx * ca + lz * sa) * SCALE, lm.z + (-lx * sa + lz * ca) * SCALE];
  const lampPools = poolMesh(ctx, LAMPS.map(([lx, lz, dir]) => { const [x, z] = toWorld(lx + dir * 0.8, lz); return { x, z, r: 3.0 }; }), 0xffb45a, { name: 'bigfling_lamp_pools' });

  // ── the winch: the SAME brass drum you carry up from the quay, installed ────
  // Hidden until helper_3. Its crank sits outboard of the +X cradle post.
  const WINCH_S = 1.25;
  const wb = winchGeo({ crankX: 1.28 });
  const winchMat = glowMat(0xffa030, { intensity: 0.2 });
  const winch = new THREE.Mesh(wb.geometry(), winchMat);
  winch.name = 'bigfling_winch'; winch.castShadow = true; winch.receiveShadow = true;
  winch.scale.setScalar(WINCH_S);
  winch.position.set(0, 2.0, -4.2);
  group.add(winch);
  // a teal ghost of it in the empty cradle while you are carrying the real one
  const ghost = new THREE.Mesh(winch.geometry, new THREE.MeshBasicMaterial({
    color: 0x5fe0ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  ghost.scale.setScalar(WINCH_S); ghost.position.copy(winch.position);
  ghost.visible = false; ghost.renderOrder = 3;
  ghost.userData.noRay = true; ghost.userData.noFade = true;
  group.add(ghost);

  // rope from the winch to the crate (only while cocked)
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 6),
    new THREE.MeshStandardMaterial({ color: YARN_2, roughness: 0.95, flatShading: true }),
  );
  rope.castShadow = true; rope.visible = false;
  group.add(rope);
  const ROPE_UP = new THREE.Vector3(0, 1, 0);
  const _d = new THREE.Vector3();
  function stretchRope(ax, ay, az, bx, by, bz, thick) {
    rope.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    _d.set(bx - ax, by - ay, bz - az);
    const L = _d.length() || 0.001;
    rope.scale.set(thick, L, thick);
    rope.quaternion.setFromUnitVectors(ROPE_UP, _d.divideScalar(L));
  }

  // ── sign ───────────────────────────────────────────────────────────────────
  const signPost = new B();
  for (const s of [-1, 1]) signPost.cyl(0.11, 0.13, 2.6, 6, TIMBER_DK, s * 0.95, 1.3, 0);
  const signFrame = signPost.build('bigfling_signpost');
  signFrame.position.set(-3.6, 0, -2.6);
  signFrame.rotation.y = Math.PI - 0.45;      // faces the way you walk in
  group.add(signFrame);
  const SIGN_BROKEN = [
    { text: 'WINCH MISSING', size: 58, color: '#b0202e' },
    { text: "it's on the quay", size: 40, color: '#3b2415' },
    { text: "by Rusty's crate", size: 36, color: '#6b4a30' },
  ];
  const SIGN_FIXED = [
    { text: 'THE BIG FLING', size: 56, color: '#3b2415' },
    { text: 'no refunds', size: 40, color: '#b0202e' },
  ];
  const sign = signMesh(2.5, 1.25, SIGN_BROKEN, { bg: '#efd9ad' });
  const signNight = nightSign(sign, 0.5);
  sign.position.set(-3.6, 3.05, -2.6);
  sign.rotation.y = Math.PI - 0.45;
  group.add(sign);

  // ── Bolt, the mechanic, asleep ─────────────────────────────────────────────
  const cat = catGeo(CAT.furGrey, 'doze', { stripe: 0x5d5d68 }).build('bigfling_bolt');
  const BOLT = { x: 1.45, y: 0.74, z: 0.9 };
  cat.position.set(BOLT.x, BOLT.y, BOLT.z);
  cat.rotation.y = -1.15;
  cat.scale.setScalar(1.3);
  group.add(cat);
  const wrench = new B().box(0.12, 0.7, 0.12, IRON, 0, 0, 0).box(0.32, 0.2, 0.13, IRON, 0, 0.36, 0).build('bigfling_wrench');
  wrench.position.set(2.0, 0.78, 0.0);
  wrench.rotation.set(1.5, 0.4, 0.2);
  group.add(wrench);

  ctx.colliders.push({ x: lm.x, z: lm.z, r: 3.0 * SCALE });
  ctx.colliders.push({ x: lm.x + sa * 3.4 * SCALE, z: lm.z + ca * 3.4 * SCALE, r: 1.7 * SCALE });
  // CLEARANCE CLAIM. cat/nature re-tests every plant against the oriented BOX
  // colliders in ctx.colliders on world:ready, so this box is how a builder
  // says "nothing grows on my launch pad" after the palms are already planted.
  // h is absolute and under the ground: player.js drops it on the first test,
  // so it is a claim and never a wall.
  clearanceClaim(ctx, lm.x, lm.z, 24, 26, aim, 'catapult_pad');

  // ── helpers ────────────────────────────────────────────────────────────────
  const ui = () => ctx.systems.ui;
  const parts = () => ctx.systems.particles;
  const story = () => ctx.systems.story;
  const fixed = () => !!story()?.get('helper_3');

  /** World position of the crate floor for an arm angle. */
  function seatAt(a, out = { x: 0, y: 0, z: 0 }) {
    const ly = (PIVOT + ARM * Math.cos(a) + 0.30) * SCALE;
    const lz = ARM * Math.sin(a) * SCALE;
    out.x = lm.x + sa * lz; out.y = my + ly; out.z = lm.z + ca * lz;
    return out;
  }

  // ── state ──────────────────────────────────────────────────────────────────
  let armA = A_IDLE, armVel = 0, phase = null, pt = 0, beat = 0;
  let yarnSpin = 0, creak = 0, popT = 1;
  const from = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const seat = { x: 0, y: 0, z: 0 };
  let gulls = false, cine = null;

  function setPhase(p) { phase = p; pt = 0; beat = 0; }

  // ── interaction (interaction/story/ui are created after us — wire on ready) ─
  const spot = { x: lm.x - sa * 8.4, z: lm.z - ca * 8.4 };   // behind the machine, at the ladder
  let gate = null;
  let W = null;                                              // the winch trail (below)
  function refreshGate() {
    if (!gate) return;
    const want = fixed() ? 'Board the Big Fling' : (W?.carrying() ? 'Install the winch' : 'Inspect the Big Fling');
    if (gate.label === want) return;
    gate.label = want;
    // interaction.update only calls ui.prompt when the NEAREST entry changes,
    // so a relabel while you stand at the ladder never reached the pill
    // ('Install the winch' stayed up after the install). Push it ourselves.
    try { if (ctx.systems.interaction?.nearest?.() === gate) ctx.systems.ui?.prompt?.(gate.label, gate); } catch (e) { /* the pill is decoration */ }
  }
  winch.visible = false;
  rope.visible = false;
  ctx.events.on('world:ready', () => {
    gate = ctx.systems.interaction?.register({
      id: 'escape_catapult',
      x: spot.x, z: spot.z, r: 4.2,
      label: 'Inspect the Big Fling',
      onInteract() {
        if (phase || vehicleBusy(ctx)) return;
        if (!fixed()) {
          if (W?.carrying()) { W.install(); return; }
          ui()?.say("Mrrf. Winch is missing. Left it on the quay by Rusty's crate. Down the harbour road. Bring it here, I'm not getting up.", { speaker: 'Bolt', duration: 5 });
          W?.hint();
          parts()?.burst({ x: lm.x, y: my + 2.4, z: lm.z, count: 7, color: [0xdfe6ff, 0xffffff], speed: 0.7, life: 1.6, size: 0.34, gravity: 0.5, spread: 0.6 });
          return;
        }
        route.start();
      },
    }) || null;
    winch.visible = fixed();
    if (fixed()) sign.userData.repaint(SIGN_FIXED, { bg: '#e6f2d8' });
    refreshGate();
    story()?.once('helper_3', () => {
      const byYou = !!W?.installing;
      W?.fixedElsewhere();
      winch.visible = true; popT = 0;
      sign.userData.repaint(SIGN_FIXED, { bg: '#e6f2d8' });
      refreshGate();
      ui()?.toast(byYou ? 'CLUNK. Winch installed. Board at the ladder.' : 'Rusty screws the winch back on. It even has a handle.', 5.5, { icon: 'spark' });
      const wx = lm.x - sa * 4.2 * SCALE, wz = lm.z - ca * 4.2 * SCALE;
      parts()?.burst({ x: wx, y: my + 3.0, z: wz, count: 26, color: [0xffd24a, 0xff5a8a, 0xffffff, 0x5fe0ff], speed: 3.6, life: 1.1, size: 0.3, gravity: -5, spread: 0.9 });
      parts()?.dust?.(wx, my + 0.4, wz, { count: 14 });
      if (byYou) {
        ctx.systems.camera?.shake?.(0.5, 0.35);
        ui()?.say("…oh. You found it. Right. Ladder's round the back. Knees in, eyes shut. No refunds.", { speaker: 'Bolt', duration: 5 });
        ui()?.setObjective?.('Board The Big Fling', 'E at the ladder behind the machine');
      }
    });
  });

  // ── the ride ───────────────────────────────────────────────────────────────
  const route = {
    id: 'catapult',
    label: 'The Big Fling',
    ready: () => fixed(),
    get active() { return !!phase; },
    spot,

    start() {
      const pl0 = ctx.systems.player;
      if (!pl0 || phase || vehicleBusy(ctx)) return false;
      from.copy(pl0.position);
      api.start('catapult', { label: 'The Big Fling' });
      ui()?.banner('The Big Fling', 'yarn-powered · cat-certified · no refunds');
      ui()?.say('Knees in. Eyes shut. See you never.', { speaker: 'Bolt', duration: 3.8 });
      setPhase('lower');
      if (gate) gate.enabled = false;
      return true;
    },

    update(dt) {
      idle(dt);
      if (W) { try { W.update(dt); } catch (err) { if (!W.__warned) { W.__warned = true; console.error('[escape/catapult] winch trail', err); } } }
      refreshGate();
      if (!phase) return;
      pt += dt;
      if (phase === 'lower') {
        const k = smoothstep(0, 1, clamp(pt / 1.5, 0, 1));
        armA = A_IDLE + (A_LOAD - A_IDLE) * k;
        if (pt > beat) {           // ratchet clicks
          beat = pt + 0.16;
          parts()?.burst({ x: lm.x - sa * 4.2, y: my + 2.2, z: lm.z - ca * 4.2, count: 2, color: [0xffd24a], speed: 1.4, life: 0.35, size: 0.14, gravity: -6, spread: 0.2 });
        }
        if (pt >= 1.5) {
          seatAt(armA, seat);
          rider.mount('catapult', from.x, from.y, from.z, 2.6);
          rider.pose('sit');
          setPhase('board');
        }
      } else if (phase === 'board') {
        const k = smoothstep(0, 1, clamp(pt / 0.9, 0, 1));
        seatAt(armA, seat);
        rider.place(
          from.x + (seat.x - from.x) * k,
          from.y + (seat.y - from.y) * k + Math.sin(k * Math.PI) * 0.9,
          from.z + (seat.z - from.z) * k,
          aim,
        );
        if (pt >= 0.9) { setPhase('count'); ui()?.toast('3…', 0.8); }
      } else if (phase === 'count') {
        armA = A_LOAD - 0.10 * smoothstep(0, 1, clamp(pt / 2.2, 0, 1));   // tensioning
        seatAt(armA, seat);
        rider.place(seat.x, seat.y, seat.z, aim);
        if (beat === 0 && pt > 0.85) { beat = 1; ui()?.toast('2…', 0.8); }
        if (beat === 1 && pt > 1.7) { beat = 2; ui()?.toast('1…', 0.8); }
        if (pt >= 2.5) {
          setPhase('swing');
          ctx.systems.camera?.shake(1.3, 0.8);
          parts()?.burst({ x: lm.x, y: my + 1.0, z: lm.z, count: 30, color: [0xd8c7a8, 0xf3ead8, 0x8d5a34], speed: 6.5, life: 0.9, size: 0.42, sizeEnd: 1.1, gravity: -3, spread: 1.6, alpha: 0.6 });
          parts()?.burst({ x: lm.x, y: my + 3.4, z: lm.z, count: 16, color: [0xffd24a, 0xff5a8a], speed: 5.0, life: 0.8, size: 0.22, gravity: -9, spread: 1.2 });
        }
      } else if (phase === 'swing') {
        const u = clamp(pt / 0.34, 0, 1);
        armA = A_LOAD + (A_STOP - A_LOAD) * Math.pow(u, 1.55);
        yarnSpin += dt * 26;
        if (armA >= A_FIRE) {
          // leave the crate; solve the parabola to the Candyland shallows
          seatAt(A_FIRE, seat);
          pos.set(seat.x, seat.y + 0.5, seat.z);
          vel.set(
            (SPLASH.x - pos.x) / FLIGHT,
            (-0.35 - pos.y + 0.5 * GRAV * FLIGHT * FLIGHT) / FLIGHT,
            (SPLASH.z - pos.z) / FLIGHT,
          );
          rider.pose('flail');
          gulls = false;
          cine = ctx.systems.camera?.cinematic({
            target: () => [pos.x, pos.y + 1.2, pos.z],
            azimuth: 0.28, elevation: 0.30, distance: 54, fov: 34,
            duration: FLIGHT + 2.4, in: 0.55, hold: FLIGHT + 1.0, out: 0.85,
          });
          setPhase('fly');
        } else {
          seatAt(armA, seat);
          rider.place(seat.x, seat.y, seat.z, aim);
        }
      } else if (phase === 'fly') {
        vel.y -= GRAV * dt;
        pos.addScaledVector(vel, dt);
        rider.place(pos.x, pos.y, pos.z, aim + Math.sin(pt * 6.5) * 0.35);
        if (pt > beat) {
          beat = pt + 0.09;
          parts()?.burst({ x: pos.x, y: pos.y, z: pos.z, count: 2, color: [0xffffff, 0xffe9a8], speed: 1.1, life: 0.9, size: 0.26, sizeEnd: 0.6, gravity: -0.6, spread: 0.5, alpha: 0.65 });
        }
        if (!gulls && pt > 1.25) {                       // over the fish harbour: gulls scatter
          gulls = true;
          parts()?.burst({ x: pos.x + 6, y: pos.y - 4, z: pos.z + 3, count: 16, color: [0xffffff, 0xe7eef7], speed: 9, up: 1.5, life: 2.4, size: 0.6, sizeEnd: 0.3, gravity: 1.2, drag: 0.6, spread: 5, shape: 'leaf', spin: 3 });
          ui()?.toast('Somewhere below, every gull in Fish Harbor changes career.');
        }
        if (pt >= FLIGHT || pos.y <= -0.3) {
          pos.y = -0.35;
          rider.place(pos.x, pos.y, pos.z, aim);
          parts()?.splash(pos.x, 0.05, pos.z, { count: 46, speed: 7.5, ringSize: 9 });
          parts()?.burst({ x: pos.x, y: 0.3, z: pos.z, count: 26, color: [0xffffff, 0xbfe6ff], speed: 5.5, life: 1.1, size: 0.36, gravity: -9, spread: 1.4 });
          ctx.systems.camera?.shake(1.0, 0.7);
          setPhase('wade');
        }
      } else if (phase === 'wade') {
        const k = smoothstep(0, 1, clamp(pt / 1.6, 0, 1));
        const x = SPLASH.x + (beach.x - SPLASH.x) * k;
        const z = SPLASH.z + (beach.z - SPLASH.z) * k;
        const gy = Math.max(world.height(x, z), -0.35);
        pos.set(x, gy, z);                      // keep the cinematic on the visitor
        rider.place(x, gy, z, Math.atan2(beach.x - SPLASH.x, beach.z - SPLASH.z));
        if (pt > beat) {
          beat = pt + 0.22;
          parts()?.burst({ x, y: 0.06, z, count: 5, color: [0xffffff, 0xcdeafd], speed: 2.0, life: 0.5, size: 0.2, gravity: -8, spread: 0.5 });
        }
        if (pt >= 1.6) {
          route.stop();
          ui()?.card({ title: 'ESCAPED', body: 'You escaped Cat Island. For now.', buttons: [{ label: 'For now.' }] });
          ui()?.toast('Score: 1 – 1.', 5);
          api.success('catapult', { landing: { x: beach.x, z: beach.z } });
        }
      }
    },

    stop() {
      if (rider.riding) rider.unmount(beach.x, beach.z);
      cine?.cancel?.(); cine = null;
      phase = null;
      if (gate) gate.enabled = true;
      refreshGate();
    },
  };
  api.register('catapult', route);
  console.warn('[escape/catapult]', JSON.stringify({
    at: [+lm.x.toFixed(1), +lm.z.toFixed(1)], clear: +(lm.clear ?? 0).toFixed(2), aim: +aim.toFixed(2),
    scale: SCALE, splash: [SPLASH.x, SPLASH.z], beach: [+beach.x.toFixed(1), +beach.z.toFixed(1)],
    tris: Math.round(base.tris() + ab.tris() + yb.tris() + wb.tris()), meshes: 8,
  }));

  // ── THE WINCH TRAIL (Contract D) ─────────────────────────────────────────────
  try {
    W = createWinchTrail(ctx, {
      spot, fixed, lm, my, aim, SCALE,
      cradle: { x: lm.x - sa * 4.2 * SCALE, z: lm.z - ca * 4.2 * SCALE },
      ghost, winchGeometry: winch.geometry, winchMat,
      install() { story()?.set('helper_3', true); },
    });
  } catch (err) { console.error('[escape/catapult] winch trail failed', err); }
  route.winch = W;
  // the lantern posts are solid (pushed after the winch trail placed its sign,
  // so that search is exactly as it was)
  for (const [lx, lz] of LAMPS) { const [x, z] = toWorld(lx, lz); ctx.colliders.push({ x, z, r: 0.28 }); }

  /** Idle life: the arm creaks, the yarn drifts, Bolt breathes. */
  function idle(dt) {
    const t = ctx.state.elapsed;
    {
      const night = 1 - (ctx.state.daylight ?? 1);
      const fl = 0.95 + 0.05 * Math.sin(t * 6.1) * Math.sin(t * 2.3);
      fillMat.emissiveIntensity = 0.36 * night;
      lampMat.emissiveIntensity = (0.3 + 1.5 * night) * fl;
      lampPools.set(0.85 * night * fl);
      signNight(night);
      if (!phase) {
        armA = damp(armA, A_IDLE + Math.sin(t * 0.5) * 0.035, 2.2, dt);
        yarnSpin = damp(yarnSpin, 0, 1.4, dt);
      }
      arm.rotation.x = armA;
      yarnBall.rotation.x = yarnSpin;
      yarnBall.rotation.z = Math.sin(t * 0.31) * 0.12;
      winch.rotation.x = (phase === 'lower' || phase === 'count') ? -ctx.state.elapsed * 5.5 : Math.sin(t * 0.4) * 0.06;
      ghost.rotation.x = winch.rotation.x;
      if (popT < 1) {                                   // the install CLUNK: drop in, squash, settle
        popT = Math.min(1, popT + dt / 0.55);
        const k = popT, bounce = Math.sin(k * Math.PI * 2.2) * (1 - k) * 0.18;
        winch.position.y = 2.0 + (1 - Math.min(1, k * 2.2)) * 1.6 + bounce;
        winch.scale.set(WINCH_S * (1 + bounce * 0.6), WINCH_S * (1 - bounce * 0.9), WINCH_S * (1 + bounce * 0.6));
      }
      // Bolt: slow breathing + the occasional dream-twitch
      const breath = 1 + Math.sin(t * 1.05) * 0.045;
      cat.scale.set(1.25, 1.25 * breath, 1.25);
      cat.position.y = 0.9 + Math.sin(t * 1.05) * 0.03;
      creak -= dt;
      if (creak <= 0 && !phase) {
        creak = 3.4 + (Math.sin(t * 0.7) + 1) * 1.6;
        parts()?.burst({
          x: lm.x + Math.sin(aim + 2.1) * 2.6, y: my + 1.9, z: lm.z + Math.cos(aim + 2.1) * 2.6,
          count: 3, color: [0xdfe6ff, 0xffffff], speed: 0.35, up: 1.2, life: 2.2, size: 0.3, sizeEnd: 0.62,
          gravity: 0.35, spread: 0.35, alpha: 0.5,
        });
      }
      // the rope is only rigged while she is cocked
      const rigged = phase === 'board' || phase === 'count' || phase === 'lower';
      rope.visible = rigged && winch.visible;
      if (rope.visible) {
        const ly = PIVOT + ARM * Math.cos(armA), lz = ARM * Math.sin(armA);
        stretchRope(0, 2.0, -4.2, 0, ly, lz, 0.085);
      }
    }
  }

  return route;
}

// ═════════════════════════════════════════════════════════════════════════════
// THE WINCH TRAIL (wave 3, Contract D).
//   quay  → a brass winch on a pallet beside Rusty's crate, "WINCH — property
//           of The Big Fling" sign, teal light column + sparkles, map marker.
//   E     → carried: inventory tool 'winch', a small copy strapped to the
//           visitor's back, a teal ghost in the catapult's empty cradle, the
//           map marker moves to the machine, the objective says where.
//   E at the machine (the gate by the ladder) → installed → story helper_3.
// Rusty's three-candy tier still works: he fetches it for you (fixedElsewhere).
// ═════════════════════════════════════════════════════════════════════════════
const WINCH_HEX = 0x5fe0ff;

function createWinchTrail(ctx, M) {
  const world = ctx.world;
  const story = () => ctx.systems.story;
  const ui = () => ctx.systems.ui;
  const fx = () => ctx.systems.particles;
  const atlas = signAtlas();
  const S = winchSpot(ctx);
  const group = new THREE.Group(); group.name = 'escape_winch';
  ctx.scene.add(group);
  const cosR = Math.cos(S.ry), sinR = Math.sin(S.ry);
  const Wd = (lx, lz) => [S.x + lx * cosR + lz * sinR, S.z - lx * sinR + lz * cosR];

  // ── the quay: pallet, sign, a coil of rope (one mesh) ──────────────────────
  const site = new Site();
  const PLANK = 0x9a7a4a, PLANK2 = 0x86653c, POST = 0x5b3b24;
  for (const z of [-0.55, 0.55]) site.box(2.1, 0.16, 0.22, POST, 0, 0.0, z);            // runners
  for (let i = 0; i < 5; i++) site.box(0.38, 0.1, 1.5, i % 2 ? PLANK : PLANK2, -0.84 + i * 0.42, 0.13, 0);
  site.torus(0.3, 0.09, 5, 12, 0xc9b184, 0.72, 0.26, 0.5, Math.PI / 2);                 // rope coil
  site.torus(0.2, 0.08, 5, 10, 0xc9b184, 0.72, 0.4, 0.5, Math.PI / 2);
  // the sign stands behind it, facing the road; LOST KEY? on its back
  const SZ = -1.45;
  for (const x of [-1.2, 1.2]) site.cyl(0.1, 0.12, 2.9, 6, POST, x, 0.95, SZ);
  site.box(2.5, 1.3, 0.1, POST, 0, 1.75, SZ);
  site.box(2.7, 0.14, 0.4, 0x2f7fa0, 0, 2.46, SZ);
  site.face('winchsign', 2.36, 1.18, 0, 1.75, SZ + 0.06);
  site.face('poster', 0.82, 1.12, 0, 1.75, SZ - 0.06, Math.PI);
  const quay = site.build('winch_quay');
  quay.castShadow = false;                 // a pallet and a board: its shadow pass is not worth a call
  const gy = S.gy;
  quay.position.set(S.x, gy, S.z);
  quay.rotation.y = S.ry;
  group.add(quay);
  for (const x of [-1.2, 1.2]) { const [px, pz] = Wd(x, SZ); ctx.colliders.push({ x: px, z: pz, r: 0.26 }); }
  const winchCol = { x: S.x, z: S.z, r: 1.05 };
  ctx.colliders.push(winchCol);
  clearanceClaim(ctx, S.x - sinR * 0.4, S.z - cosR * 0.4, 5.2, 4.8, S.ry, 'winch_quay');

  // ── the winch on the pallet ────────────────────────────────────────────────
  const QS = 1.15;
  const qb = winchGeo({ stand: true });
  const qWinch = new THREE.Mesh(qb.geometry(), M.winchMat);
  qWinch.name = 'winch_item'; qWinch.castShadow = false; qWinch.receiveShadow = true;   // the pallet grounds it
  qWinch.userData.noFade = true;
  const QY = gy + 0.18 + 0.68 * QS;
  qWinch.position.set(S.x, QY, S.z);
  qWinch.rotation.y = 0.18;                 // three-quarter view, crank toward the default lens
  qWinch.scale.setScalar(QS);
  group.add(qWinch);

  const beams = beamField(ctx);
  const beamSlot = beams.add(WINCH_HEX, { x: S.x, y: gy + 0.03, z: S.z, height: 17, width: 3.0, pool: 2.1 });

  // ── the copy you wear ──────────────────────────────────────────────────────
  const backGeo = winchGeo({}).geometry();
  const back = new THREE.Mesh(backGeo, M.winchMat);
  back.name = 'winch_on_back'; back.castShadow = true; back.visible = false;
  back.userData.noFade = true;
  back.scale.setScalar(0.5);
  let backParent = null;

  // ── the fingerpost at the machine: WINCH ← the quay · INSTALL → the back ────
  const post = (() => {
    const sp = itemSpot(ctx, 121.8, 74.8, { radius: 4, need: 0.8, pathMin: 0.6, pathMax: 3.2, minH: 1.2, pull: 0.25, farSide: true, avoid: [{ x: M.lm.x, z: M.lm.z, r: 5.2 }] });
    const f = new Site();
    const py = world.height(sp.x, sp.z);
    const WOOD = 0x6b4a30;
    f.cyl(0.15, 0.19, 4.5, 6, WOOD, sp.x, py + 1.8, sp.z);
    f.sph(0.26, 8, 6, 0x2f7fa0, sp.x, py + 4.1, sp.z);
    const arms = [{ name: 'quay', tx: S.x, tz: S.z, y: 3.55 }, { name: 'back', tx: M.spot.x, tz: M.spot.z, y: 2.8 }];
    for (const a of arms) {
      const yaw = armYaw(sp.x, sp.z, a.tx, a.tz);
      f.arm(a.name, 2.9, 0.64, sp.x + Math.cos(yaw) * 1.3, py + a.y, sp.z - Math.sin(yaw) * 1.3, yaw);
    }
    const np = nearestPathPoint(world, sp.x, sp.z, 'cat');
    const r = readYaw(sp.x, sp.z, np.x, np.z);
    f.box(0.92, 1.04, 0.08, WOOD, sp.x + Math.sin(r) * 0.2, py + 1.25, sp.z + Math.cos(r) * 0.2, 0, r);
    f.face('wposter', 0.84, 0.95, sp.x + Math.sin(r) * 0.25, py + 1.25, sp.z + Math.cos(r) * 0.25, r);
    f.face('wposter', 0.84, 0.95, sp.x + Math.sin(r) * 0.15, py + 1.25, sp.z + Math.cos(r) * 0.15, r + Math.PI);
    const m = f.build('winch_catapult_post');
    m.castShadow = false;
    ctx.scene.add(m);
    ctx.colliders.push({ x: sp.x, z: sp.z, r: 0.35 });
    m.userData.at = sp;
    return m;
  })();

  // ── state ──────────────────────────────────────────────────────────────────
  let state = 'quay';                 // quay → carried → installed
  let entry = null, emitter = null, markerT = -1, beamK = 1, ghostK = 0;
  const inv = () => ctx.systems.inventory;

  function syncMarker() {
    if (state === 'installed') { mapMarker(ctx, { id: 'winch', remove: true }); return; }
    if (state === 'carried') mapMarker(ctx, { id: 'winch', x: M.cradle.x, z: M.cradle.z, glyph: 'winch', label: 'Install the winch' });
    else mapMarker(ctx, { id: 'winch', x: S.x, z: S.z, glyph: 'winch', label: 'Catapult winch' });
  }
  function stopSparkles() { if (emitter) { emitter.stop?.(); emitter = null; } }
  function strapOn(on) {
    const pl = ctx.systems.player;
    const torso = pl?.visitor?.nodes?.torso;
    const parent = torso || pl?.group || null;
    if (on && parent) {
      if (backParent !== parent) { parent.add(back); backParent = parent; }
      if (torso) { back.position.set(0, 0.36, -0.52); back.rotation.set(0.12, 0, 0); }
      else { back.position.set(0, 1.05, -0.5); back.rotation.set(0.12, 0, 0); }
      back.visible = true;
    } else back.visible = false;
  }
  function dropFromBag() {
    const I = inv();
    if (!I) return;
    try {
      if (I.count?.('winch') > 0) I.spend?.('winch', I.count('winch'));
      else I.spend?.('winch', 1);
      const i = I.items?.findIndex?.((it) => it.id === 'winch' && !(it.count > 0));
      if (i >= 0) I.items.splice(i, 1);
      if (I.held === 'winch') I.setHeld?.(null);
      ctx.events.emit('inventory:change', { itemId: 'winch' });
    } catch (e) { /* inventory is not ours — never throw from here */ }
  }
  function pickUp() {
    if (state !== 'quay' || M.fixed()) return;
    state = 'carried';
    if (entry) entry.enabled = false;
    qWinch.visible = false;
    winchCol.r = 0;                                  // nothing solid left on the pallet
    stopSparkles();
    strapOn(true);
    fx()?.burst?.({ x: S.x, y: QY, z: S.z, count: 22, color: [0x9ff0ff, 0xffffff, 0xffc86a], speed: 3.0, up: 1.2, life: 0.8, size: 0.24, sizeEnd: 0.04, gravity: -4, drag: 1.6, spread: 0.7, shape: 'sparkle', blend: 'add' });
    fx()?.dust?.(S.x, gy + 0.2, S.z, { count: 10 });
    ensureWinchItem(ctx);
    try { inv()?.add?.('winch', 1); } catch (e) {}
    story()?.set('winch_carried', true);
    syncMarker();
    ui()?.toast('WINCH! Carry it up the harbour road to The Big Fling and press E at the empty cradle behind it.', 6.5, { icon: 'spark' });
    ui()?.setObjective?.('Carry the winch to The Big Fling', 'up the harbour road from Fish Harbor · E at the cradle');
    ctx.events.emit('escape:item', { item: 'winch', state: 'carried' });
  }
  function toInstalled() {
    state = 'installed';
    strapOn(false);
    qWinch.visible = false; winchCol.r = 0;
    if (entry) entry.enabled = false;
    stopSparkles();
    post.visible = false;                            // the arrows are stale now
    syncMarker();
  }

  ctx.events.on('world:ready', () => {
    ensureWinchItem(ctx);
    const wp = { x: S.x, z: S.z, y: QY }, _wp = { x: 0, y: QY, z: 0 };
    entry = ctx.systems.interaction?.register?.({
      id: 'winch_quay', x: S.x, z: S.z, y: QY, promptH: 1.25, r: 2.8,
      label: 'Pick up the winch', onInteract: () => pickUp(),
      getPos() {                         // same prompt-priority bias as the key
        const q = ctx.systems.player?.position;
        if (!q) return wp;
        const dx = S.x - q.x, dz = S.z - q.z, d = Math.hypot(dx, dz);
        if (d < 0.001) return wp;
        const k = Math.min(1.2, d * 0.5);
        _wp.x = S.x - dx / d * k; _wp.z = S.z - dz / d * k;
        return _wp;
      },
    }) || null;
    if (M.fixed()) toInstalled();
    else {
      emitter = fx()?.emitter?.({
        x: S.x, y: gy + 1.2, z: S.z, rate: 6, area: 0.6, areaY: 0.5,
        color: [0x9ff0ff, 0xffffff, 0x5fe0ff], shape: 'sparkle', blend: 'add',
        speed: 0.12, vy: 1.6, vyJitter: 0.5, gravity: 0.3, drag: 0.2,
        life: 3.2, lifeVar: 0.3, size: 0.28, sizeEnd: 0.05, sizeVar: 0.4, range: 80,
      }) || null;
    }
    syncMarker();
    markerT = 2.0;
    rustyHint(ctx, (first) => {
      if (state === 'quay' && !M.fixed()) {
        return first
          ? "And that brass thing glowing next to my crate? Bolt's winch, off The Big Fling. He put it down to have a nap in 2019. Carry it up the harbour road and the catapult works. Lift with your knees."
          : "The winch is still right there by my crate. Up the harbour road with it. The catapult. The big stupid wooden one.";
      }
      if (state === 'carried') return "Catapult's up the road, past the fish. Slot it in the empty cradle round the back. Mind Bolt, he bites in his sleep.";
      return null;
    });
  });

  const api = {
    spot: S, post,
    get state() { return state; },
    /** Same as pressing E at the quay (tests + views). */
    take: () => pickUp(),
    carrying: () => state === 'carried' || (state !== 'installed' && !!inv()?.has?.('winch') && inv()?.def?.('winch')?.kind === 'tool'),
    get installing() { return state === 'installing'; },
    /** E at the machine while carrying. */
    install() {
      if (state === 'installed' || M.fixed()) return;
      state = 'installing';
      dropFromBag();
      strapOn(false);
      M.install();                                   // → helper_3 → fixedElsewhere()
      if (state !== 'installed') toInstalled();
      ctx.events.emit('escape:item', { item: 'winch', state: 'installed' });
    },
    /** helper_3 got set (by us, or by Rusty's candy route). */
    fixedElsewhere() {
      if (state === 'installed') return;
      if (state === 'carried') {
        dropFromBag();
        ui()?.toast("Rusty's gull lifts the winch off your back. It is installed. Allegedly.", 5);
      }
      toInstalled();
    },
    /** Bolt said the winch is missing: point the way. */
    hint() {
      if (state === 'quay') {
        ui()?.toast("The winch is on the quay by Rusty's crate, down the harbour road — look for the teal light (M: map).", 6, { icon: 'spark' });
        syncMarker();
      }
    },
    update(dt) {
      const c = ctx;
      const t = c.state.elapsed;
      const night = 1 - (c.state.daylight ?? 1);
      atlas.night(night);
      if (markerT > 0 && (markerT -= dt) <= 0) syncMarker();
      drainRustyHints(ctx, dt);
      M.winchMat.emissiveIntensity = 0.26 + 0.62 * night + (state === 'quay' ? Math.sin(t * 2.6) * 0.08 : 0);
      if (state === 'carried' && back.visible === false) strapOn(true);   // player rebuilt? re-strap

      // a small rattle every few seconds, as if it wanted to be picked up
      if (state === 'quay') {
        const k = Math.max(0, Math.sin(t * 1.3)) ** 24;
        qWinch.rotation.z = Math.sin(t * 40) * 0.03 * k;
      }
      // the ghost in the cradle breathes while the real one is on your back
      ghostK = damp(ghostK, state === 'carried' ? 1 : 0, 4, dt);
      M.ghost.visible = ghostK > 0.02;
      if (M.ghost.visible) M.ghost.material.opacity = ghostK * (0.5 + 0.25 * Math.sin(t * 3.4));

      beamK = damp(beamK, state === 'quay' ? 1 : 0, 2.5, dt);
      beams.set(beamSlot, beamK < 0.01 ? 0 : beamK * (0.9 + 0.6 * night) * (0.9 + 0.1 * Math.sin(t * 2.0)));
    },
  };
  console.warn('[escape/winch]', JSON.stringify({
    quay: [+S.x.toFixed(1), +S.z.toFixed(1)], clear: +S.clear.toFixed(2), edge: +S.edge.toFixed(2), fallback: S.fallback,
    hideout: [+S.hideout.x.toFixed(1), +S.hideout.z.toFixed(1)], cradle: [+M.cradle.x.toFixed(1), +M.cradle.z.toFixed(1)],
    install: [+M.spot.x.toFixed(1), +M.spot.z.toFixed(1)], post: [+post.userData.at.x.toFixed(1), +post.userData.at.z.toFixed(1)],
    winchTris: Math.round(qb.tris()),
  }));
  return api;
}
