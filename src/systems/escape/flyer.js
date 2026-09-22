// ─────────────────────────────────────────────────────────────────────────────
// THE FLYING MACHINE — Wing Nut Field, LANDMARKS.flyer_pad (210, 12).
//
// A pedal ornithopter built by a cat who read one book (the book is still there,
// on a crate, open at page one): a bicycle frame, two enormous candy-wrapper
// wings on a rocker, a propeller, and a helmet you cannot wear because it is
// cat-sized.
//
// Flying: Space flaps (up impulse), W/S pitch, A/D yaw, forward speed a constant
// 9 u/s, gravity pulls the whole silly thing down the moment you stop flapping.
//   land on Candyland   → escape:success { route: 'flyer' }
//   land anywhere else  → you landed. Technically.
//   land in the sea     → fade out, wake up back on the pad, damp.
//
// Draw calls: frame 1 · wing×2 · prop 1 · field 1 · sign 1 · helmet 1 = 7
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CAT, CANDY } from '../../core/palette.js';
import { clamp, damp, smoothstep } from '../../core/util.js';
import { B, catGeo, signMesh } from './parts.js';
import { createRider, beachPoint, vehicleBusy, clearSpot, clearanceClaim } from './ride.js';

const FWD = 11.0;           // constant forward speed, airborne
const FLAP_V = 8.5;         // upward impulse per flap
const FLAP_CD = 0.32;       // seconds between useful flaps
const GRAV = 5.5;
const TURN = 1.05;          // rad/s
const VY_MIN = -13, VY_MAX = 16;
const CEILING = 170;        // cardboard wings, thin air: you cannot flap to the moon (but you can get close)
const SEAT = 0.55;          // rider's feet above the machine origin

// CANARY. The machine used to be a dark red frame with rainbow wings, parked
// in the shade of a bush — the darkest object in its own frame. It is now the
// brightest: yellow frame, white wings, red ribs, and a propeller you can count
// the blades on from the path.
const FRAME = 0xffd21e, FRAME_DK = 0xe0a800, STEEL = 0x7d8590, RUBBER = 0x2b2b30, WOOD = 0x8d5a34;
const RIB = 0xe03a2f, SAIL = 0xfffaf0;
const WRAP = [CANDY.gummyYellow, CANDY.gummyBlue, CANDY.gummyGreen, CANDY.gummyPurple, CANDY.gummyOrange];

export function create(ctx, api) {
  const { scene, world } = ctx;
  ctx.colliders = ctx.colliders || [];
  const lm = world.LANDMARKS.flyer_pad;
  // The clearance claim below opens the ground, so this only has to dodge the
  // last metre or two — a 7-unit search used to walk the machine off the
  // landmark entirely and out of its own camera view.
  const clear = clearSpot(ctx, lm.x, lm.z, { radius: 2.5, step: 0.5, need: 7, minH: 1.2, pull: 0.35, pad: 2.4 });
  const PAD = { x: clear.x, z: clear.z, y: world.height(clear.x, clear.z) };
  const HOME_YAW = -Math.PI * 0.72;       // nose WSW: toward Candyland, and broadside
                                          // to the default iso camera so the wings read as wings

  const rider = createRider(ctx);
  /** local (x, z) on the pad → world (the pad is rotated to HOME_YAW). */
  const CY = Math.cos(HOME_YAW), SY = Math.sin(HOME_YAW);
  const locX = (lx, lz) => PAD.x + CY * lx + SY * lz;
  const locZ = (lx, lz) => PAD.z - SY * lx + CY * lz;

  // ── the machine ────────────────────────────────────────────────────────────
  const flyer = new THREE.Group();
  flyer.position.set(PAD.x, PAD.y, PAD.z);
  flyer.rotation.order = 'YXZ';
  flyer.rotation.y = HOME_YAW;
  scene.add(flyer);

  const fb = new B();
  // wheels (rolling along local Z): torus in the XY plane + spokes
  for (const wz of [-1.15, 1.15]) {
    fb.torus(0.56, 0.12, 6, 14, RUBBER, 0, 0.56, wz);
    fb.torus(0.44, 0.05, 4, 12, 0xd8d8e0, 0, 0.56, wz);
    for (let i = 0; i < 6; i++) fb.box(0.05, 0.92, 0.05, 0xd8d8e0, 0, 0.56, wz, 0, 0, i * 0.52);
    fb.cyl(0.10, 0.10, 0.22, 6, STEEL, 0, 0.56, wz, 0, 0, Math.PI / 2);
  }
  // diamond frame
  fb.beam([0, 0.56, -1.15], [0, 1.24, -0.12], 0.11, FRAME);
  fb.beam([0, 0.56, 1.15], [0, 1.16, 0.52], 0.11, FRAME);
  fb.beam([0, 0.56, -1.15], [0, 0.62, 0.10], 0.11, FRAME);
  fb.beam([0, 1.24, -0.12], [0, 1.16, 0.52], 0.11, FRAME);
  fb.beam([0, 0.62, 0.10], [0, 1.16, 0.52], 0.11, FRAME);
  fb.box(0.44, 0.22, 0.94, RIB, 0, 1.34, -0.24, -0.12);                   // saddle (red, so the seat reads)
  fb.cyl(0.07, 0.07, 1.3, 6, STEEL, 0, 1.38, 0.62, 0, 0, Math.PI / 2);    // handlebars
  for (const s of [-1, 1]) fb.sph(0.11, 5, 4, CANDY.gummyRed, s * 0.62, 1.38, 0.62, [1, 1, 1.5]);
  fb.beam([0, 1.16, 0.52], [0, 1.42, 0.60], 0.10, STEEL);
  // cranks + pedals
  fb.cyl(0.17, 0.17, 0.20, 8, STEEL, 0, 0.62, 0.10, 0, 0, Math.PI / 2);
  // mast up to the wing rocker
  fb.beam([0, 1.24, -0.12], [0, 2.48, -0.05], 0.13, FRAME);
  fb.beam([0, 0.62, 0.10], [0, 2.46, -0.02], 0.09, STEEL);
  fb.cyl(0.17, 0.17, 0.9, 8, STEEL, 0, 2.52, -0.04, 0, 0, Math.PI / 2);   // rocker pin
  // tail feathers, for luck
  for (let i = -1; i <= 1; i++) fb.add(new THREE.ConeGeometry(0.34, 1.3, 3), WRAP[(i + 3) % 5], i * 0.30, 0.95, -1.85, Math.PI / 2.1, 0, i * 0.35, [1, 1, 0.2]);
  const frame = fb.build('flyer_frame');
  flyer.add(frame);

  // crank + pedals spin as a unit
  const cb = new B();
  for (const s of [-1, 1]) {
    cb.box(0.11, 0.52, 0.11, STEEL, 0, s * 0.26, s * 0.13);
    cb.box(0.20, 0.13, 0.42, RIB, 0, s * 0.50, s * 0.26);          // the pedal
    cb.box(0.22, 0.05, 0.10, 0xfffaf0, 0, s * 0.50, s * 0.26);     // its white tread
  }
  const crank = cb.build('flyer_crank');
  crank.position.set(0, 0.62, 0.10);
  flyer.add(crank);

  // ── wings: candy-wrapper panels on a swept, dihedral spar ──────────────────
  // Six panels stepping out and UP, chord tapering to a point, scalloped
  // trailing edge — so from above it reads as a bird, not a rainbow plank.
  const SKIN = [SAIL, 0xfff3de, SAIL];
  function makeWing(side) {
    const w = new B();
    w.beam([0, 0, 0], [side * 4.7, 2.15, -1.05], 0.19, FRAME_DK);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const px = side * (0.55 + t * 4.05);
      const py = 0.10 + t * t * 0.55 + t * 1.55;
      const pz = -0.10 - t * 1.0;
      const chord = 2.7 - t * 2.25;
      const roll = side * (0.34 + t * 0.20);
      w.add(new THREE.BoxGeometry(0.98, 0.08, chord), SKIN[i % 3], px, py, pz, 0, 0, roll);
      // RED RIBS. White panels alone read as one pale blade; the ribs are what
      // say "wing" at forty units. One per panel, plus a red leading edge.
      w.box(0.12, 0.11, chord * 0.96, RIB, px, py + 0.05, pz, 0, 0, roll);
      w.box(1.0, 0.11, 0.15, RIB, px, py + 0.05, pz - chord * 0.46, 0, 0, roll);
      // scalloped trailing edge: this is a sweet wrapper, after all
      const scal = i < 4 ? 1 : 0;
      for (let k = -scal; k <= scal; k++) w.sph(0.17 - t * 0.05, 5, 4, SKIN[(i + 1) % 3], px + k * 0.33, py - 0.02, pz + chord * 0.5, [1, 0.45, 1]);
    }
    // pointed tip + a ribbon streamer
    w.add(new THREE.ConeGeometry(0.5, 1.9, 4), SAIL, side * 5.05, 2.22, -1.25, 0, 0, side * 1.4, [1, 1, 0.3]);
    w.sph(0.22, 6, 5, RIB, side * 5.6, 2.3, -1.35);
    const m = w.build('flyer_wing' + (side > 0 ? 'R' : 'L'), { side: THREE.DoubleSide });
    m.position.set(side * 0.30, 2.52, -0.04);
    return m;
  }
  const wingL = makeWing(-1), wingR = makeWing(1);
  flyer.add(wingL, wingR);

  // ── propeller ──────────────────────────────────────────────────────────────
  const pb = new B();
  pb.cyl(0.26, 0.30, 0.36, 10, STEEL, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    pb.box(0.30, 2.5, 0.09, i % 2 ? SAIL : RIB, 0, 0, 0, 0, 0, i * 1.5708);
    pb.box(0.14, 0.5, 0.11, i % 2 ? RIB : SAIL, 0, 1.05, 0, 0, 0, i * 1.5708);   // tip flash
  }
  pb.sph(0.26, 8, 6, CANDY.gummyYellow, 0, 0, 0.2, [1, 1, 1.4]);
  const prop = pb.build('flyer_prop');
  prop.position.set(0, 1.55, 1.86);
  flyer.add(prop);

  // ── the field: windsock, workbench, the one book, the tiny helmet ──────────
  const gb = new B();
  gb.cyl(0.13, 0.16, 4.6, 6, WOOD, 2.8, 2.3, -3.2);                        // windsock pole
  gb.box(2.4, 0.16, 1.1, WOOD, -3.2, 0.95, 1.6);                           // bench top
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.16, 0.95, 0.16, 0x6b4126, -3.2 + sx * 1.0, 0.48, 1.6 + sz * 0.42);
  gb.box(0.9, 0.7, 0.9, WOOD, -3.4, 0.35, -1.4);                           // crate
  gb.box(0.62, 0.10, 0.46, 0xf3ead8, -3.4, 0.76, -1.4, 0, 0.3);            // THE book
  gb.box(0.62, 0.06, 0.46, CANDY.gummyBlue, -3.4, 0.70, -1.4, 0, 0.3);
  gb.cyl(0.34, 0.30, 0.5, 8, STEEL, -1.9, 0.25, 2.2);                      // paint tin
  for (let i = 0; i < 7; i++) {                                            // scattered wing nuts
    const a = i * 1.7;
    gb.torus(0.16, 0.06, 4, 6, CANDY.gummyYellow, Math.cos(a) * (2.2 + i * 0.35), 0.1, Math.sin(a) * (2.4 + i * 0.3), Math.PI / 2);
  }
  gb.cyl(0.09, 0.09, 1.5, 6, STEEL, 2.0, 0.75, 2.4);                       // helmet peg
  // THE PAD: a swept sand strip with two wheel ruts and marker cones, so the
  // machine stands on a runway in the sun instead of in the grass under a bush
  gb.box(4.6, 1.6, 11.0, 0xe6d3a6, 0, -0.75, 0.5);          // bedded deep into the slope
  gb.box(4.0, 0.14, 10.4, 0xf0e2c2, 0, 0.09, 0.5);
  for (const s of [-1, 1]) gb.box(0.34, 0.10, 9.6, 0xcbb488, s * 1.05, 0.14, 0.5);
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) gb.cone(0.24, 0.58, 6, i % 2 ? CANDY.gummyOrange : 0xfffaf0, s * 2.45, 0.36, -4.4 + i * 3.0);
  }
  const field = gb.build('flyer_field');
  field.position.set(PAD.x, PAD.y, PAD.z);
  field.rotation.y = HOME_YAW;
  scene.add(field);

  // windsock (a flapping cone of stripes)
  const wb = new B();
  for (let i = 0; i < 4; i++) wb.add(new THREE.CylinderGeometry(0.42 - i * 0.06, 0.48 - i * 0.06, 0.42, 8, 1, true), i % 2 ? CANDY.gummyOrange : 0xffffff, 0, 0, -0.25 - i * 0.42, Math.PI / 2);
  const sock = wb.build('flyer_sock', { side: THREE.DoubleSide });
  sock.position.set(locX(2.8, -3.2), PAD.y + 4.3, locZ(2.8, -3.2));
  scene.add(sock);

  // the helmet (cat-sized, hanging on its peg)
  const hb = new B();
  hb.sph(0.30, 8, 5, CANDY.gummyRed, 0, 0, 0, [1, 0.8, 1.1]);
  hb.box(0.34, 0.06, 0.24, 0xffffff, 0, 0.06, 0.26);
  for (const s of [-1, 1]) hb.cone(0.12, 0.2, 4, CANDY.gummyRed, s * 0.17, 0.24, -0.02, 0, 0, s * 0.3);
  const helmet = hb.build('flyer_helmet');
  const hx = locX(2.0, 2.4), hz = locZ(2.0, 2.4);
  helmet.position.set(hx, PAD.y + 1.55, hz);
  scene.add(helmet);

  // the cat who read one book, sitting on the bench, waiting to be proved right
  const cat = catGeo(CAT.furCalico, 'sit', { stripe: 0xa06a30 }).build('flyer_wingnut');
  const cx = locX(-2.3, -2.4), cz = locZ(-2.3, -2.4);
  cat.position.set(cx, world.height(cx, cz), cz);
  cat.rotation.y = HOME_YAW + 2.5;
  cat.scale.setScalar(1.25);
  scene.add(cat);

  // ── sign ───────────────────────────────────────────────────────────────────
  const sp = new B();
  for (const s of [-1, 1]) sp.cyl(0.10, 0.12, 2.5, 6, 0x6b4126, s * 1.0, 1.25, 0);
  const signPost = sp.build('flyer_signpost');
  const sgx = locX(5.4, 0), sgz = locZ(5.4, 0);
  const sgy = world.height(sgx, sgz);
  signPost.position.set(sgx, sgy, sgz);
  signPost.rotation.y = 0.85;
  scene.add(signPost);
  const sign = signMesh(2.6, 1.25, [
    { text: 'WING NUT FIELD', size: 50, color: '#3b2415' },
    { text: 'flight school · 1 lesson', size: 34, color: '#b0202e' },
  ], { bg: '#f2e6c4' });
  sign.position.set(sgx, sgy + 2.9, sgz);
  sign.rotation.y = 0.85;              // square-on to the default iso camera
  scene.add(sign);

  ctx.colliders.push({ x: PAD.x, z: PAD.z, r: 1.5 });
  // CLEARANCE CLAIM. cat/nature runs before us and re-tests every instance
  // against the oriented BOX colliders in ctx.colliders on world:ready, so a
  // box published here clears the field. h is absolute and below the ground, so
  // player.js drops it instantly — it is a claim, never a wall.
  clearanceClaim(ctx, PAD.x, PAD.z, 22, 26, HOME_YAW, 'flyer_pad');
  ctx.colliders.push({ x: locX(-3.2, 1.6), z: locZ(-3.2, 1.6), r: 1.3 });

  // ── state ──────────────────────────────────────────────────────────────────
  const ui = () => ctx.systems.ui;
  const parts = () => ctx.systems.particles;

  let phase = null, pt = 0;
  let x = PAD.x, z = PAD.z, y = PAD.y, yaw = HOME_YAW;
  let vy = 0, pitch = 0, bank = 0, turn = 0;
  let flapT = -9, flapPhase = 0, propSpin = 0, wingBeat = 0;
  let camDist = null, gate = null, milestone = 0, feather = 0;

  function ground(px, pz) { return world.height(px, pz); }

  function setFlyer() {
    flyer.position.set(x, y - SEAT, z);
    flyer.rotation.set(pitch, yaw, bank);
    const flap = Math.sin(flapPhase) * (0.42 + wingBeat * 0.55) + wingBeat * 0.18;
    wingL.rotation.z = flap;
    wingR.rotation.z = -flap;
    wingL.rotation.x = flap * 0.22;
    wingR.rotation.x = flap * 0.22;
    prop.rotation.z = propSpin;
    crank.rotation.x = propSpin * 0.45;
  }

  /** flight state only — leaves the machine where it is parked */
  function resetFlight() { vy = 0; pitch = 0; bank = 0; turn = 0; flapPhase = 0; wingBeat = 0; }
  /** wheel her back to Wing Nut Field */
  function goHome() {
    x = PAD.x; z = PAD.z; y = PAD.y + SEAT; yaw = HOME_YAW;
    resetFlight(); setFlyer();
  }
  goHome();

  ctx.events.on('world:ready', () => {
    gate = ctx.systems.interaction?.register({
      id: 'escape_flyer',
      getPos: () => ({ x, z }), x: PAD.x, z: PAD.z, r: 3.8,
      label: 'Board the flying machine',
      onInteract() { route.start(); },
    }) || null;
    ctx.systems.interaction?.register({
      id: 'escape_flyer_helmet',
      x: hx, z: hz, r: 2.2,
      label: 'Try on the helmet',
      onInteract() {
        ui()?.say('It is cat-sized. Your head is not.', { duration: 3.0 });
        parts()?.hearts(hx, PAD.y + 2.1, hz, CANDY.gummyRed, 3);
      },
    });
    ctx.systems.interaction?.register({
      id: 'escape_flyer_book',
      x: cx, z: cz, r: 2.6,
      label: 'Read the book',
      onInteract() {
        ui()?.say('Chapter One: Birds. That is the whole book.', { speaker: 'Wingnut', duration: 3.8 });
      },
    });
  });

  function land() {
    const isl = world.islandAt(x, z);
    const spot = beachPoint(world, x, z, Math.sin(yaw), Math.cos(yaw), 0.8, 6);
    phase = null;
    if (camDist != null) { ctx.systems.camera?.setParams({ distance: camDist }); camDist = null; }
    rider.unmount(spot.x, spot.z);
    if (gate) gate.enabled = true;
    ctx.systems.camera?.shake(0.4, 0.4);
    parts()?.burst({ x, y: ground(x, z) + 0.2, z, count: 18, color: [0xd8c7a8, 0xf3ead8], speed: 3.2, life: 0.9, size: 0.45, sizeEnd: 1.1, gravity: -3, spread: 1.3, alpha: 0.5 });
    if (isl === 'candy') {
      ui()?.card({ title: 'ESCAPED', body: 'You escaped Cat Island. For now.', buttons: [{ label: 'For now.' }] });
      ui()?.toast('The ornithopter lands on frosting. The book was right.', 5);
      api.success('flyer', { landing: { x: spot.x, z: spot.z } });
    } else {
      ui()?.toast('You landed. Technically.', 4);
    }
  }

  const route = {
    id: 'flyer',
    label: 'The Flying Machine',
    ready: () => true,
    get active() { return !!phase; },
    spot: PAD,

    start() {
      const pl = ctx.systems.player;
      if (!pl || phase || vehicleBusy(ctx)) return false;
      resetFlight();
      y = world.height(x, z) + SEAT;          // she stays wherever she last landed
      setFlyer();
      phase = 'run'; pt = 0; milestone = 0;
      api.start('flyer', { label: 'The Flying Machine' });
      ui()?.banner('The Flying Machine', 'built by a cat who read one book');
      ui()?.toast('Space flaps · WASD steers · gravity does the rest');
      rider.mount('flyer', x, y, z, 2.6);
      rider.pose('pedal');
      const cam = ctx.systems.camera;
      if (cam) { camDist = cam.params.distance; cam.setParams({ distance: 34 }); }
      if (gate) gate.enabled = false;
      return true;
    },

    update(dt) {
      const t = ctx.state.elapsed;
      if (!phase) {
        propSpin += dt * 0.35;
        flapPhase = Math.sin(t * 0.45) * 0.25;
        wingBeat = damp(wingBeat, 0, 3, dt);
        setFlyer();
        sock.rotation.y = HOME_YAW + Math.sin(t * 0.5) * 0.35;
        sock.rotation.x = Math.sin(t * 1.9) * 0.14;
        helmet.rotation.z = Math.sin(t * 1.1) * 0.09;
        return;
      }
      pt += dt;

      const inp = ctx.input;
      let ax = inp.axis();
      if (!ax.active && (inp.virtual.x || inp.virtual.y)) ax = { x: inp.virtual.x, y: inp.virtual.y, active: true };

      if (phase === 'run') {
        // pedal down the field: prop spins up, wings start beating
        const k = clamp(pt / 1.3, 0, 1);
        propSpin += dt * (6 + k * 46);
        flapPhase += dt * (3 + k * 9);
        wingBeat = damp(wingBeat, k, 6, dt);
        const sp = FWD * smoothstep(0, 1, k);
        x += Math.sin(yaw) * sp * dt; z += Math.cos(yaw) * sp * dt;
        y = ground(x, z) + SEAT;
        pitch = damp(pitch, -0.08, 4, dt);
        setFlyer();
        rider.place(x, y, z, yaw);
        if (pt > 0.55 && feather < t) {
          feather = t + 0.18;
          parts()?.burst({ x, y: y - SEAT + 0.2, z, count: 3, color: [0xd8c7a8, 0xf3ead8], speed: 1.8, life: 0.6, size: 0.3, sizeEnd: 0.7, gravity: -3, spread: 0.6, alpha: 0.45 });
        }
        if (pt >= 1.3) {
          // a real hop off the grass, so one bump in the ground cannot end the flight
          phase = 'air'; pt = 0; vy = 6.4; y = ground(x, z) + SEAT + 0.9;
          ui()?.say('IT WORKS. Briefly!', { speaker: 'Wingnut', duration: 3.0 });
          parts()?.sparkle(x, y + 2.4, z, CANDY.gummyYellow, 14);
        }
        return;
      }

      if (phase === 'sink') {
        // in the drink: fade, then wake up back on the pad
        y = damp(y, -1.2, 2.4, dt);
        pitch = damp(pitch, 0.9, 3, dt);
        setFlyer();
        rider.place(x, Math.max(y, -0.6), z, yaw);
        if (pt > 1.0 && milestone === 0) {
          milestone = 1;
          const px = PAD.x, pz = PAD.z;
          goHome();
          if (camDist != null) { ctx.systems.camera?.setParams({ distance: camDist }); camDist = null; }
          rider.unmount(px + Math.cos(HOME_YAW) * 2.4, pz - Math.sin(HOME_YAW) * 2.4);
          ctx.systems.camera?.snap?.();
          ui()?.fade(false, 0.5);
          ui()?.toast('The manual said nothing about water.', 5);
          phase = null;
          if (gate) gate.enabled = true;
        }
        return;
      }

      // ── airborne ────────────────────────────────────────────────────────
      turn = damp(turn, ax.active ? ax.x * TURN : 0, 5, dt);
      yaw += turn * dt;
      bank = damp(bank, -turn * 0.45, 4, dt);
      const pitchIn = ax.active ? ax.y : 0;
      pitch = damp(pitch, -pitchIn * 0.30, 3.5, dt);

      const alt = y - Math.max(ground(x, z), 0);
      if (inp.pressed.has('Space') && t - flapT > FLAP_CD) {
        flapT = t;
        // the higher you get the less the wings bite — a soft ceiling near 170
        const bite = clamp(1 - (alt - CEILING * 0.7) / (CEILING * 0.55), 0.06, 1);
        vy = Math.max(vy, 0) + FLAP_V * bite;
        wingBeat = 0.35 + bite * 0.8;
        parts()?.burst({
          x: x + Math.cos(yaw) * 4.2, y: y + 1.9, z: z - Math.sin(yaw) * 4.2,
          count: 5, color: [0xffffff, CANDY.gummyYellow, CANDY.gummyBlue], speed: 2.6, life: 1.3,
          size: 0.34, sizeEnd: 0.14, gravity: -1.6, drag: 1.2, spread: 0.8, shape: 'leaf', spin: 2.4,
        });
        parts()?.sparkle(x, y + 1.6, z, CANDY.gummyYellow, 5);
      }
      vy = clamp(vy - GRAV * dt + pitchIn * 2.2 * dt, VY_MIN, VY_MAX);
      if (alt > CEILING) vy -= (alt - CEILING) * 0.5 * dt;      // thin air drags you back down
      { const cam = ctx.systems.camera; if (cam) { const want = clamp(34 + alt * 0.42, 34, 96); if (Math.abs(cam.params.distance - want) > 0.5) cam.setParams({ distance: want }); } }
      wingBeat = damp(wingBeat, 0.18, 3.2, dt);
      flapPhase += dt * (5.5 + wingBeat * 9);
      propSpin += dt * 34;

      x += Math.sin(yaw) * FWD * dt;
      z += Math.cos(yaw) * FWD * dt;
      y += vy * dt;

      const g = ground(x, z);
      setFlyer();
      rider.place(x, y, z, yaw);

      // trailing sparkle so you can read the flight path from a distance
      if (t > feather) {
        feather = t + 0.14;
        parts()?.burst({ x, y: y + 0.7, z, count: 1, color: [0xffffff, 0xffe9a8], speed: 0.5, life: 1.2, size: 0.26, sizeEnd: 0.5, gravity: -0.4, spread: 0.4, alpha: 0.5 });
      }
      // hint when you cross the shoreline
      if (milestone === 0 && x < 40) { milestone = 1; ui()?.toast('Open sea. Keep flapping.'); }
      if (milestone === 1 && x < -30) { milestone = 2; ui()?.toast('Candyland below. STOP FLAPPING to come down.', 5); }

      // soft bounds
      if (Math.abs(z) > 220 || x < -300 || x > 330) { yaw += Math.PI * dt * 0.7; }

      if (pt < 0.4) return;                 // clearance window: no landing on take-off
      if (g <= 0.25 && y - SEAT <= 0.35) {   // the sea
        phase = 'sink'; pt = 0; milestone = 0;
        parts()?.splash(x, 0.06, z, { count: 40, speed: 6.5, ringSize: 7 });
        ctx.systems.camera?.shake(0.8, 0.5);
        ui()?.fade(true, 0.55);
        return;
      }
      if (y - SEAT <= g + 0.15) { y = g + SEAT; setFlyer(); land(); }
    },

    stop() {
      if (!phase) return;
      phase = null;
      if (camDist != null) { ctx.systems.camera?.setParams({ distance: camDist }); camDist = null; }
      if (rider.riding) rider.unmount(PAD.x, PAD.z);
      goHome();
      if (gate) gate.enabled = true;
    },
  };

  api.register('flyer', route);
  console.warn('[escape/flyer]', JSON.stringify({
    pad: [+PAD.x.toFixed(1), +PAD.z.toFixed(1)], clear: +(clear.clear ?? 0).toFixed(2),
    span: 11.2, ceiling: CEILING, fwd: FWD, meshes: 10,
  }));
  return route;
}
