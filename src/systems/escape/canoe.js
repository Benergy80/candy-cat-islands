// ─────────────────────────────────────────────────────────────────────────────
// THE CANOE — Smuggler's Cove, LANDMARKS.canoe_cove (236, 44).
//
// A dugout canoe with a candy-wrapper sail, pulled up behind two boulders at the
// waterline (243, 44). Until story flag `helper_1` there is only a tarp over it
// ("It's just a tarp. Definitely."); Rusty's first candy buys the reveal.
//
// Paddling: WASD steers (A/D yaw, W/S paddle), Space = a big stroke. ~6 u/s,
// the hull rocks and yaws, wake rings trail behind, and the canoe beaches itself
// the moment it touches land — Candyland shore → escape:success { route:'canoe' },
// Cat Island shore → you are simply back where you started, which is the joke.
//
// Draw calls: hull 1 · sail 1 · paddle 1 · rocks 1 · tarp 1 · sign 1 = 6
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CAT, CANDY } from '../../core/palette.js';
import { clamp, damp, rng, hash } from '../../core/util.js';
import { B, signMesh } from './parts.js';
import { createRider, beachPoint, vehicleBusy } from './ride.js';

const CRUISE = 6.0;         // u/s with W held
const STROKE = 4.2;         // Space burst
const TURN = 1.15;          // rad/s
const LAND_H = 0.20;        // ground height that counts as "beached"
const HULL_Y = 0.16;        // waterline offset of the hull floor

// PAINTED, not carved. A sage-brown dugout lying in the grass reads as a seed
// pod; a red-and-cream hull with a candy-striped gunwale reads as a boat
// somebody loves and the cats have not found yet.
const HULL = 0xd8382f, HULL_LT = 0xf7ebd2, TRIM = 0xffd21e, WOOD = 0xc07a44, WOOD_DK = 0x7b4a28;
const ROCK = 0x8d95a0, ROCK_DK = 0x6e7883;

export function create(ctx, api) {
  const { scene, world } = ctx;
  ctx.colliders = ctx.colliders || [];
  const lm = world.LANDMARKS.canoe_cove;
  const rnd = rng(hash('smugglers-cove'));

  const rider = createRider(ctx);

  // the waterline just east of the cove, then back up the sand a little: a
  // beached canoe lies ALONG the shore, not nose-down the slope
  let sx = lm.x, sz = lm.z + 0.4;
  for (let s = 0; s < 24; s += 0.5) { sx = lm.x + s; if (world.height(sx, sz) < 0.05) break; }
  const SHORE = sx;
  // Back off the water only until the sand is dry — 0.85 put her four metres up
  // the GRASS, which is why she read as beached inland. 0.30 is the wet sand at
  // the top of the wash: bow in the water, stern on the beach.
  for (let s = 0; s < 6; s += 0.2) { sx = SHORE - s; if (world.height(sx, sz) > 0.14) break; }
  const HOME = { x: sx, z: sz };

  // ── the canoe ──────────────────────────────────────────────────────────────
  const canoe = new THREE.Group();
  scene.add(canoe);

  const hb = new B();
  const LEN = 3.0;
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * 2 - 1;                  // -1 … 1
    const w = 1.00 * Math.sqrt(Math.max(0.02, 1 - t * t * 0.94));
    const z = t * LEN;
    hb.box(w * 2, 0.20, 0.84, HULL_LT, 0, 0.10, z);                      // cream floorboards
    for (const s of [-1, 1]) hb.box(0.16, 0.60, 0.84, HULL, s * w, 0.40, z, 0, 0, s * 0.13);
  }
  // bow + stern points, gunwale rim, thwarts
  for (const s of [-1, 1]) hb.cone(0.72, 1.6, 4, HULL, 0, 0.38, s * (LEN + 0.66), Math.PI / 2 * s, Math.PI / 4);
  // CANDY-STRIPE GUNWALE: alternating red and cream blocks down both rails
  for (const s of [-1, 1]) for (let i = 0; i < 14; i++) {
    hb.box(0.28, 0.19, 0.48, i % 2 ? HULL_LT : HULL, s * 0.96, 0.70, -3.2 + i * 0.5);
  }
  // THWARTS — three of them, cream, standing proud of the rails so they read
  for (const z of [-1.55, 0.0, 1.55]) {
    hb.box(2.25, 0.17, 0.36, HULL_LT, 0, 0.71, z);
    for (const s of [-1, 1]) hb.box(0.2, 0.3, 0.4, WOOD_DK, s * 0.92, 0.56, z);     // knees
  }
  hb.box(1.7, 0.13, 0.56, TRIM, 0, 0.82, -1.55);                         // painted seat pad
  hb.box(0.5, 0.5, 0.12, TRIM, 0, 0.62, LEN + 0.55);                     // a yellow blaze on the bow
  // a coil of rope and a bailing tin, because someone lives in this thing
  hb.torus(0.30, 0.07, 4, 10, CANDY.gummyYellow, 0.0, 0.30, 2.5, Math.PI / 2);
  hb.cyl(0.22, 0.20, 0.30, 8, 0xb8bec6, -0.35, 0.30, 2.0);
  const hull = hb.build('canoe_hull');
  canoe.add(hull);

  // candy-wrapper sail on a short mast: a flattened triangle with bright slabs
  // glued to both faces, so it reads as a sweet wrapper from any angle.
  const sb = new B();
  sb.cyl(0.075, 0.09, 3.1, 6, WOOD_DK, 0, 1.55, 0);
  sb.add(new THREE.ConeGeometry(1.22, 2.7, 3), CANDY.gummyRed, 0, 1.85, 0.30, 0, 0, 0, [1, 1, 0.14]);
  for (let i = 0; i < 4; i++) {
    const c = [CANDY.gummyYellow, 0xffffff, CANDY.gummyBlue, CANDY.gummyGreen][i];
    for (const s of [-1, 1]) sb.box(1.45 - i * 0.31, 0.19, 0.05, c, 0, 1.05 + i * 0.52, 0.30 + s * 0.21);
  }
  const sail = sb.build('canoe_sail', { side: THREE.DoubleSide });
  sail.position.set(0, 0.68, 0.6);
  canoe.add(sail);

  // the paddle (animated during strokes)
  const pb = new B();
  pb.cyl(0.055, 0.055, 1.9, 6, WOOD, 0, 0, 0);
  pb.box(0.34, 0.62, 0.07, CAT.teal, 0, -1.05, 0);
  const paddle = pb.build('canoe_paddle');
  paddle.position.set(0.0, 0.86, -0.4);
  paddle.rotation.set(0, 0, Math.PI / 2 - 0.12);      // stowed ACROSS the thwarts
  canoe.add(paddle);

  // ── the hiding place: boulders + a tarp ────────────────────────────────────
  const rb = new B();
  // The boulders were authored to HIDE her, and they did — from the player too,
  // once Rusty pulls the tarp. She lies bow-east along the waterline now, so the
  // rocks stand off both quarters (±z, along the shore) and leave the seaward
  // and landward sightlines open.
  const rocks = [[-0.8, -5.4, 1.7], [0.4, 5.6, 1.45], [-3.0, -6.6, 1.15], [-2.6, 6.4, 1.0], [1.6, -7.4, 0.85]];
  for (const [dx, dz, r] of rocks) {
    const h = world.height(HOME.x + dx, HOME.z + dz);
    rb.sph(r, 7, 5, rnd() < 0.5 ? ROCK : ROCK_DK, dx, Math.max(h - world.height(HOME.x, HOME.z), -0.2) + r * 0.42, dz,
      [1, 0.72 + rnd() * 0.3, 1 + rnd() * 0.3]);
  }
  const rockMesh = rb.build('cove_rocks');
  rockMesh.position.set(HOME.x, world.height(HOME.x, HOME.z), HOME.z);
  scene.add(rockMesh);
  for (const [dx, dz, r] of rocks) ctx.colliders.push({ x: HOME.x + dx, z: HOME.z + dz, r: r * 0.8 });

  const tb = new B();
  tb.sph(1.5, 8, 5, 0x7d8a72, 0, 0.0, 0, [1.0, 0.46, 2.9]);
  tb.box(3.0, 0.10, 0.5, 0x69755f, 0, 0.52, -1.6, 0.1);
  tb.box(3.0, 0.10, 0.5, 0x69755f, 0, 0.50, 1.4, -0.08);
  for (const s of [-1, 1]) tb.sph(0.2, 5, 4, 0x4d4a42, s * 1.5, 0.06, s * 2.2);
  const tarp = tb.build('cove_tarp');
  scene.add(tarp);

  // ── the painter: a rope from the bow to a stake in the sand ───────────────
  // (a boat nobody tied up has drifted away; a boat with a painter is WAITING)
  const stakeB = new B();
  stakeB.cyl(0.13, 0.09, 1.5, 6, WOOD_DK, 0, 0.55, 0, 0.22, 0, 0.16);
  stakeB.box(0.34, 0.1, 0.34, TRIM, 0, 1.2, 0, 0.22, 0, 0.16);
  stakeB.torus(0.22, 0.05, 4, 10, CANDY.gummyYellow, 0, 0.95, 0.06, 0.6);
  const stake = stakeB.build('cove_stake');
  scene.add(stake);
  const painter = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 5),
    new THREE.MeshStandardMaterial({ color: CANDY.gummyYellow, roughness: 0.95, flatShading: true }),
  );
  painter.castShadow = true; scene.add(painter);
  const _ROPE_UP = new THREE.Vector3(0, 1, 0), _rd = new THREE.Vector3();
  function rigPainter() {
    const bx = pos.x + Math.sin(yaw) * (LEN + 0.8), bz = pos.z + Math.cos(yaw) * (LEN + 0.8);
    const by = canoe.position.y + 0.7;
    const ax = stake.position.x, ay = stake.position.y + 1.0, az = stake.position.z;
    painter.position.set((ax + bx) / 2, (ay + by) / 2 + 0.12, (az + bz) / 2);
    _rd.set(bx - ax, by - ay, bz - az);
    const L = _rd.length() || 0.001;
    painter.scale.set(0.05, L, 0.05);
    painter.quaternion.setFromUnitVectors(_ROPE_UP, _rd.divideScalar(L));
  }

  // ── the boarding ring: where you stand to take her ────────────────────────
  const ringB = new B();
  for (let i = 0; i < 3; i++) ringB.torus(1.5 - i * 0.42, 0.075 - i * 0.015, 4, 22, i % 2 ? 0xffffff : CANDY.gummyYellow, 0, 0.06 + i * 0.005, 0, Math.PI / 2);
  for (let i = 0; i < 8; i++) ringB.box(0.16, 0.05, 0.42, CANDY.gummyRed, Math.cos(i * 0.785) * 1.82, 0.07, Math.sin(i * 0.785) * 1.82, 0, -i * 0.785, 0);
  const ring = ringB.build('cove_ring');
  scene.add(ring);

  // ── sign ───────────────────────────────────────────────────────────────────
  const spb = new B();
  spb.cyl(0.10, 0.12, 2.2, 6, WOOD_DK, 0, 1.1, 0);
  const signPost = spb.build('cove_signpost');
  const SIGN_YAW = 0.95;                 // square-on to the default iso camera
  const sgx = lm.x + 3.2, sgz = lm.z - 5.4, sgy = world.height(sgx, sgz);
  signPost.position.set(sgx, sgy, sgz);
  scene.add(signPost);
  const sign = signMesh(2.4, 1.1, [
    { text: "SMUGGLER'S COVE", size: 46, color: '#3b2415' },
    { text: 'nothing here', size: 38, color: '#b0202e' },
  ], { bg: '#e2d0a6' });
  sign.position.set(sgx, sgy + 2.35, sgz);
  sign.rotation.y = SIGN_YAW;
  signPost.rotation.y = SIGN_YAW;
  scene.add(sign);

  // ── state ──────────────────────────────────────────────────────────────────
  const ui = () => ctx.systems.ui;
  const parts = () => ctx.systems.particles;
  const story = () => ctx.systems.story;
  const found = () => !!story()?.get('helper_1');

  let pos = { x: HOME.x, z: HOME.z };
  let yaw = Math.PI / 2 - 0.18;         // BOW TO THE SEA (east): she is pointed out, ready to shove off
  let speed = 0, turn = 0, riding = false;
  let wake = 0, strokeT = -9, paddleSwing = 0, roll = 0;
  let gate = null, tarpGate = null, camDist = null;

  function setCanoe(t) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    canoe.rotation.y = yaw;
    canoe.rotation.z = roll;
    if (riding || world.height(pos.x, pos.z) < LAND_H) {
      const bob = Math.sin(t * 1.55 + pos.x * 0.1) * 0.055 + Math.sin(t * 2.7) * 0.02;
      canoe.position.set(pos.x, HULL_Y + bob, pos.z);
      canoe.rotation.x = Math.sin(t * 1.25 + 1.1) * 0.035 - speed * 0.012;
    } else {
      // hauled out: sit her ON the sand and let the hull follow the slope
      const hb = world.height(pos.x + sy * 3.0, pos.z + cy * 3.0);
      const hs = world.height(pos.x - sy * 3.0, pos.z - cy * 3.0);
      canoe.position.set(pos.x, Math.max((hb + hs) * 0.5, 0.04) + 0.06, pos.z);
      canoe.rotation.x = Math.atan2(hs - hb, 6.0);
    }
  }
  canoe.rotation.order = 'YXZ';
  tarp.rotation.order = 'YXZ';

  function deckY() { return canoe.position.y + 0.80; }

  // ── wiring (interaction / story / ui exist only after world:ready) ─────────
  ctx.events.on('world:ready', () => {
    tarpGate = ctx.systems.interaction?.register({
      id: 'escape_canoe_tarp',
      getPos: () => pos, x: HOME.x, z: HOME.z, r: 3.4,
      label: 'Look under the suspicious tarp',
      onInteract() { ui()?.say("It's just a tarp. Definitely.", { speaker: 'A passing cat', duration: 3.2 }); },
    }) || null;
    gate = ctx.systems.interaction?.register({
      id: 'escape_canoe',
      getPos: () => pos, x: HOME.x, z: HOME.z, r: 3.4,
      label: 'Take the canoe',
      onInteract() { route.start(); },
    }) || null;
    applyFound(false);
    story()?.once('helper_1', () => applyFound(true));
  });

  function applyFound(announce) {
    const f = found();
    canoe.visible = f;
    stake.visible = f; painter.visible = f; ring.visible = f;
    tarp.visible = !f;
    if (gate) gate.enabled = f;
    if (tarpGate) tarpGate.enabled = !f;
    if (announce) {
      ui()?.toast('Rusty pulls the tarp off. There is, in fact, a canoe.');
      ui()?.banner("Smuggler's Cove", 'one (1) boat, unattended');
      parts()?.burst({
        x: HOME.x, y: 1.2, z: HOME.z, count: 26, color: [0x7d8a72, 0xffffff, CANDY.gummyYellow],
        speed: 4.2, life: 1.4, size: 0.4, gravity: -4, spread: 1.6, spin: 3, shape: 'confetti',
      });
    }
  }
  // stake up the beach off the stern quarter; ring where you stand to board
  const stkX = HOME.x - Math.sin(yaw) * 4.6 - 1.2, stkZ = HOME.z - Math.cos(yaw) * 4.6 + 1.4;
  stake.position.set(stkX, world.height(stkX, stkZ) - 0.1, stkZ);
  const rngX = HOME.x - 0.6, rngZ = HOME.z - 3.0;
  let ringY = Math.max(world.height(rngX, rngZ), 0.1) + 0.05;
  ring.position.set(rngX, ringY, rngZ);

  tarp.position.set(HOME.x, world.height(HOME.x, HOME.z) + 0.32, HOME.z);
  tarp.rotation.y = yaw;
  tarp.rotation.x = Math.atan2(
    world.height(HOME.x - Math.sin(yaw) * 3, HOME.z - Math.cos(yaw) * 3) - world.height(HOME.x + Math.sin(yaw) * 3, HOME.z + Math.cos(yaw) * 3), 6.0);
  canoe.visible = false;
  setCanoe(0);

  // ── the route ──────────────────────────────────────────────────────────────
  const route = {
    id: 'canoe',
    label: 'The Canoe',
    ready: () => found(),
    get active() { return riding; },
    spot: HOME,

    start() {
      const pl = ctx.systems.player;
      if (!pl || riding || !found() || vehicleBusy(ctx)) return false;
      riding = true;
      painter.visible = false; ring.visible = false;
      speed = 0; turn = 0; roll = 0;
      // point her at the open sea and shove off
      if (world.height(pos.x, pos.z) > LAND_H) {
        yaw = Math.PI / 2;
        for (let s = 0.5; s <= 18; s += 0.5) {
          const x = pos.x + Math.sin(yaw) * s, z = pos.z + Math.cos(yaw) * s;
          if (world.height(x, z) < -0.25) { pos = { x, z }; break; }
        }
      }
      api.start('canoe', { label: 'The Canoe' });
      ui()?.banner('The Canoe', 'six knots, downhill, with a tailwind');
      ui()?.toast('WASD paddles and steers · Space = a big stroke');
      setCanoe(ctx.state.elapsed);
      rider.mount('canoe', pos.x, deckY(), pos.z, 2.6);
      rider.pose('paddle');
      const cam = ctx.systems.camera;
      if (cam) { camDist = cam.params.distance; cam.setParams({ distance: 30 }); }
      parts()?.splash(pos.x, 0.05, pos.z, { count: 16, speed: 3 });
      return true;
    },

    update(dt) {
      const t = ctx.state.elapsed;
      if (!riding) {
        setCanoe(t);
        paddle.position.set(0, 0.86, -0.4);
        paddle.rotation.set(0, 0, Math.PI / 2 - 0.12 + Math.sin(t * 0.6) * 0.02);   // stowed across the thwarts
        rigPainter();
        ring.position.y = ringY + Math.sin(t * 1.6) * 0.03;
        return;
      }

      // ── steering ────────────────────────────────────────────────────────
      const inp = ctx.input;
      let ax = inp.axis();
      if (!ax.active && (inp.virtual.x || inp.virtual.y)) ax = { x: inp.virtual.x, y: inp.virtual.y, active: true };
      turn = damp(turn, ax.active ? ax.x * TURN : 0, 6, dt);
      yaw += turn * dt;

      const drive = ax.active ? (ax.y > 0.1 ? CRUISE : (ax.y < -0.1 ? -CRUISE * 0.42 : 0)) : 0;
      speed = damp(speed, drive, drive === 0 ? 0.85 : 2.0, dt);

      // Space = one big stroke (the wave-2 "use held item" key)
      if (inp.pressed.has('Space') && t - strokeT > 0.5) {
        strokeT = t; paddleSwing = 1;
        speed = clamp(speed + STROKE, -3, 11.5);
        const px = pos.x + Math.sin(yaw + 1.4) * 0.9, pz = pos.z + Math.cos(yaw + 1.4) * 0.9;
        parts()?.splash(px, 0.06, pz, { count: 12, speed: 3.4, ringSize: 2.6 });
      }
      speed = clamp(speed, -3, 11.5);

      // ── move, and never leave the water ─────────────────────────────────
      const nx = pos.x + Math.sin(yaw) * speed * dt;
      const nz = pos.z + Math.cos(yaw) * speed * dt;
      const gh = world.height(nx, nz);
      if (gh > LAND_H && speed > 0) { pos.x = nx; pos.z = nz; beach(); return; }
      if (gh > LAND_H) { speed *= 0.2; }        // backing into the beach: just stop
      else { pos.x = nx; pos.z = nz; }

      // soft world bound, so you cannot paddle to Norway
      const far = Math.hypot(pos.x, pos.z);
      if (far > 330) {
        yaw += Math.PI * dt * 0.8;
        if (wake < t) ui()?.toast('The sea just keeps going. Turn back.');
      }

      // ── feel ────────────────────────────────────────────────────────────
      roll = damp(roll, -turn * 0.22 + Math.sin(t * 1.7) * 0.05, 5, dt);
      paddleSwing = damp(paddleSwing, 0, 5.5, dt);
      const cadence = Math.sin(t * 4.4) * clamp(Math.abs(speed) / CRUISE, 0, 1);
      paddle.rotation.x = 0.4 + cadence * 0.55 - paddleSwing * 0.9;
      paddle.rotation.z = -0.55 + cadence * 0.2;
      paddle.position.set(0.65 * (Math.sin(t * 2.2) > 0 ? 1 : -1), 0.95, -1.1);
      sail.rotation.z = Math.sin(t * 1.3) * 0.06 - turn * 0.12;
      setCanoe(t);

      // wake rings + bow spray
      if (t > wake && Math.abs(speed) > 0.8) {
        wake = t + 0.26;
        const bx = pos.x - Math.sin(yaw) * 3.4, bz = pos.z - Math.cos(yaw) * 3.4;
        parts()?.ripple(bx, 0.045, bz, { ringSize: 2.6 + Math.abs(speed) * 0.35, ringLife: 1.5 });
        if (speed > 4) parts()?.burst({ x: pos.x + Math.sin(yaw) * 3.2, y: 0.16, z: pos.z + Math.cos(yaw) * 3.2, count: 3, color: [0xffffff, 0xcdeafd], speed: 1.6, life: 0.45, size: 0.16, gravity: -9, spread: 0.4 });
      }

      rider.place(pos.x, deckY(), pos.z, yaw);
    },

    stop() {
      if (!riding) return;
      riding = false;
      if (found()) { painter.visible = true; ring.visible = true; }
      ringY = Math.max(world.height(pos.x - 0.6, pos.z - 3.0), 0.1) + 0.05;
      stake.position.set(pos.x - Math.sin(yaw) * 4.6 - 1.2, world.height(pos.x - Math.sin(yaw) * 4.6 - 1.2, pos.z - Math.cos(yaw) * 4.6 + 1.4) - 0.1, pos.z - Math.cos(yaw) * 4.6 + 1.4);
      ring.position.set(pos.x - 0.6, ringY, pos.z - 3.0);
      const cam = ctx.systems.camera;
      if (cam && camDist != null) { cam.setParams({ distance: camDist }); camDist = null; }
      if (rider.riding) rider.unmount(pos.x, pos.z);
    },
  };

  /** Run her up the sand wherever she touched. */
  function beach() {
    const b = beachPoint(world, pos.x, pos.z, Math.sin(yaw), Math.cos(yaw), 0.9, 12);
    pos.x = b.x; pos.z = b.z;
    speed = 0;
    setCanoe(ctx.state.elapsed);
    parts()?.splash(pos.x, 0.06, pos.z, { count: 20, speed: 3.6, ringSize: 4 });
    parts()?.burst({ x: pos.x, y: 0.2, z: pos.z, count: 14, color: [0xf3ead8, 0xd8c7a8], speed: 2.4, life: 0.9, size: 0.4, sizeEnd: 0.9, gravity: -2, spread: 1.2, alpha: 0.5 });
    ctx.systems.camera?.shake(0.32, 0.35);

    // stand the visitor a step up the beach, facing inland
    const out = beachPoint(world, pos.x, pos.z, Math.sin(yaw), Math.cos(yaw), 1.4, 10);
    route.stop();
    ctx.systems.player?.teleport(out.x, out.z);

    const isl = world.islandAt(out.x, out.z);
    if (isl === 'candy') {
      ui()?.card({ title: 'ESCAPED', body: 'You escaped Cat Island. For now.', buttons: [{ label: 'For now.' }] });
      ui()?.toast('The canoe grounds itself on frosting. You are home.', 5);
      api.success('canoe', { landing: { x: out.x, z: out.z } });
    } else if (isl === 'cat') {
      ui()?.toast('You have landed back on Cat Island. Several cats applaud.', 4.5);
      ui()?.say('Lovely paddling. Same time tomorrow?', { speaker: 'A cat on the beach', duration: 3.4 });
    } else {
      ui()?.toast('Land. Of a sort.');
    }
  }

  api.register('canoe', route);
  console.warn('[escape/canoe]', JSON.stringify({
    home: [+HOME.x.toFixed(1), +HOME.z.toFixed(1)], groundAtHome: +world.height(HOME.x, HOME.z).toFixed(2),
    cruise: CRUISE, rocks: rocks.length, meshes: 6,
  }));
  return route;
}
