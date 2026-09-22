// ─────────────────────────────────────────────────────────────────────────────
// THE BIG FLING — LANDMARKS.catapult (120, 78), on the flattened core.
//
// A yarn-and-timber counterweight siege engine: an A-frame of fat timbers, a
// throwing arm with a fish crate bolted to the business end, a ball of yarn the
// size of a cow as the counterweight, and a sign that says UNDER REPAIR
// (FOREVER). Bolt, the mechanic, has been asleep on the sled since Tuesday.
//
// Broken until story flag `helper_3` (Rusty finds the winch):
//   before → "The winch is missing. Rusty might know."
//   after  → "Board the Big Fling" → ratchet down, 3-2-1, and a 175-unit
//            parabola west over the sea to a splash landing on the Candyland
//            shore near (-50, 45) → escape:success { route: 'catapult' }.
//
// Draw calls: base 1 · arm 1 · yarn 1 · winch 1 · rope 1 · sign 1 · cat 1 = 7
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CAT, CANDY } from '../../core/palette.js';
import { clamp, smoothstep, damp } from '../../core/util.js';
import { B, catGeo, signMesh } from './parts.js';
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
  base.beam([-2.3, 1.35, -2.6], [2.3, 1.35, -2.6], 0.5, TIMBER_DK);     // the bar the yarn slams into
  base.box(1.9, 0.55, 0.75, 0x6a5a52, 0, 1.75, -2.6);                   // old cushion, well punished
  // winch cradle at the back (empty until Rusty finds the drum)
  for (const s of [-1, 1]) base.box(0.5, 1.5, 0.5, TIMBER, s * 1.25, 1.35, -4.2);
  base.box(3.4, 0.3, 0.7, TIMBER_DK, 0, 2.2, -4.2);
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
  ab.beam([0, -CW - 0.4, 0], [0, ARM, 0], 0.52, TIMBER);                 // the lever
  ab.beam([0, -CW - 0.4, 0], [0, ARM, 0], 0.30, TIMBER_DK);              // (a second, thinner spine reads as a lashed pair)
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
  const yarnBall = yb.build('bigfling_yarn');
  yarnBall.position.set(0, -CW - 0.35, 0);
  arm.add(yarnBall);

  // ── winch drum: only exists after Rusty finds it (helper_3) ─────────────────
  const wb = new B();
  wb.cyl(0.55, 0.55, 2.1, 10, TIMBER_DK, 0, 0, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) wb.cyl(0.78, 0.78, 0.22, 10, IRON, s * 1.0, 0, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 5; i++) wb.torus(0.60, 0.06, 4, 10, YARN_2, -0.7 + i * 0.35, 0, 0, 0, 0, Math.PI / 2);
  const winch = wb.build('bigfling_winch');
  winch.position.set(0, 2.0, -4.2);
  group.add(winch);
  // the CRANK is the missing part (Rusty finds it) — the drum itself always
  // sits in its cradle, because a winch-shaped hole is not a mechanism
  const hbb = new B();
  hbb.cyl(0.10, 0.10, 0.9, 6, IRON, 1.5, 0, 0, 0, 0, Math.PI / 2);
  hbb.box(0.16, 0.9, 0.16, IRON, 1.95, -0.4, 0);
  hbb.sph(0.18, 6, 4, CANDY.gummyRed, 1.95, -0.85, 0);
  const crank = hbb.build('bigfling_crank');
  crank.position.set(0, 2.0, -4.2);
  group.add(crank);

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
    { text: 'UNDER REPAIR', size: 62, color: '#b0202e' },
    { text: '(forever)', size: 44, color: '#3b2415' },
  ];
  const SIGN_FIXED = [
    { text: 'THE BIG FLING', size: 56, color: '#3b2415' },
    { text: 'no refunds', size: 40, color: '#b0202e' },
  ];
  const sign = signMesh(2.5, 1.25, SIGN_BROKEN, { bg: '#efd9ad' });
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
  let yarnSpin = 0, creak = 0;
  const from = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const seat = { x: 0, y: 0, z: 0 };
  let gulls = false, cine = null;

  function setPhase(p) { phase = p; pt = 0; beat = 0; }

  // ── interaction (interaction/story/ui are created after us — wire on ready) ─
  const spot = { x: lm.x - sa * 8.4, z: lm.z - ca * 8.4 };   // behind the machine, at the ladder
  let gate = null;
  function refreshGate() {
    if (!gate) return;
    gate.label = fixed() ? 'Board the Big Fling' : 'Inspect the Big Fling';
  }
  crank.visible = false;
  rope.visible = false;
  ctx.events.on('world:ready', () => {
    gate = ctx.systems.interaction?.register({
      id: 'escape_catapult',
      x: spot.x, z: spot.z, r: 4.2,
      label: 'Inspect the Big Fling',
      onInteract() {
        if (phase || vehicleBusy(ctx)) return;
        if (!fixed()) {
          ui()?.say('The winch is missing. Rusty might know.', { speaker: 'Bolt', duration: 3.6 });
          parts()?.burst({ x: lm.x, y: my + 2.4, z: lm.z, count: 7, color: [0xdfe6ff, 0xffffff], speed: 0.7, life: 1.6, size: 0.34, gravity: 0.5, spread: 0.6 });
          return;
        }
        route.start();
      },
    }) || null;
    crank.visible = fixed();
    if (fixed()) sign.userData.repaint(SIGN_FIXED, { bg: '#e6f2d8' });
    refreshGate();
    story()?.once('helper_3', () => {
      crank.visible = true;
      sign.userData.repaint(SIGN_FIXED, { bg: '#e6f2d8' });
      refreshGate();
      ui()?.toast('Rusty screws the winch back on. It even has a handle.');
      parts()?.burst({ x: lm.x, y: my + 2.4, z: lm.z, count: 22, color: [0xffd24a, 0xff5a8a, 0xffffff], speed: 3.2, life: 1.1, size: 0.3, gravity: -5, spread: 0.9 });
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
    tris: Math.round(base.tris() + ab.tris() + yb.tris() + wb.tris()), meshes: 7,
  }));

  /** Idle life: the arm creaks, the yarn drifts, Bolt breathes. */
  function idle(dt) {
    const t = ctx.state.elapsed;
    {
      if (!phase) {
        armA = damp(armA, A_IDLE + Math.sin(t * 0.5) * 0.035, 2.2, dt);
        yarnSpin = damp(yarnSpin, 0, 1.4, dt);
      }
      arm.rotation.x = armA;
      yarnBall.rotation.x = yarnSpin;
      yarnBall.rotation.z = Math.sin(t * 0.31) * 0.12;
      winch.rotation.x = (phase === 'lower' || phase === 'count') ? -ctx.state.elapsed * 5.5 : Math.sin(t * 0.4) * 0.06;
      crank.rotation.x = winch.rotation.x;
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
      rope.visible = rigged && crank.visible;
      if (rope.visible) {
        const ly = PIVOT + ARM * Math.cos(armA), lz = ARM * Math.sin(armA);
        stretchRope(0, 2.0, -4.2, 0, ly, lz, 0.085);
      }
    }
  }

  return route;
}
