// ─────────────────────────────────────────────────────────────────────────────
// THE FLYING MACHINE — Wing Nut Field, LANDMARKS.flyer_pad (210, 12).
//
// A pedal ornithopter built by a cat who read one book (the book is still there,
// on a crate, open at page one): a bicycle frame, two enormous candy-wrapper
// wings on a rocker, a propeller, and a helmet you cannot wear because it is
// cat-sized.
//
// WAVE 3 — Contract E. She is now a proper (silly) glider:
//   Space        flap (costs ENERGY; tired legs flap weakly)
//   W / S        pitch: W floats (slow, minimum sink), S dives (fast, drops);
//                ×1.5 response, and the nose AUTO-LEVELS when you let go
//   A / D        banked turns (the machine rolls into the turn)
//   Shift / X    BOOST dash: 1.5 s, 12 s cooldown
//   gliding and THERMALS restore energy. Six warm-air columns (gold shimmer
//   motes) rise over the Great Cupcake, the Candy Palace, the Yarn Ball, the
//   Watchtower, Meow Donald's and Catnip Commons; circle inside one to climb.
//   Soft ceiling 330 u: the wings bite less and less above ~170, and past 330
//   the thin air pulls you back down.
//   LAND ANYWHERE on either island (or a pier, or the lake): gentle contact
//   rolls her to a stop, you step off, E remounts. Hard contact (vy < −7.5)
//   bounces. The sea sends you home damp. Low over a town she bumps over
//   walls and trunks instead of passing through them (colliders + their tops),
//   and when parked she folds her wings and becomes a solid collider.
//   Leave her lying about for 60 s and Wingnut tows her back to the field.
//
//   route API (ctx.systems.escape.routes.flyer): start() · stop() · active ·
//   phase ('run'|'air'|'roll'|'sink'|null) · state (the flight state) ·
//   thermals · spot · debugFly(x, z, y, yaw, hold) · debugRelease() ·
//   debugPark(x, z, yaw). Exported: FLIGHT (tuning), stepFlight(), bite(),
//   THERMAL_SITES. Map markers: 'flyer' (glyph plane) always, 'thermal_<id>'
//   while airborne.
//
//   ctx.state.flying = { alt, y, speed, vy, energy, heading, thermal, boost }
//   while airborne, null otherwise (the camera frames flight from it, the map
//   widens its explored radius). HUD: altitude tape + energy bar + boost chip
//   in its own DOM under ctx.uiRoot.
//
//   Fog: sky.js measures fog from the CAMERA, so a lens 150+ u up sees every
//   piece of ground past fog.near and the sea turns into one flat haze sheet
//   ("ground + sea vanish"). While airborne we raise ctx.state.fogScale with
//   the camera height (sky.js already honours it) and cap it so fog.far stays
//   inside the camera far plane; the old value is restored on touchdown. In
//   the same frame (sky runs first) the flyer also pushes fog.near out with
//   the lens height (the islands under you stay saturated) and warms the haze
//   toward the dome's horizon colour; sky.js rewrites all of it every frame.
//   HORIZON APRON: a background disc that carries the fogged sea past the far
//   plane to the true horizon and blends into the dome's horizon (see below),
//   so a high lens never sees the sea mesh end in a hard line or a corner.
//
// WAVE 3 polish: candy-wrapper canvas wings (pink / tangerine cells, cream
// battens), wingtip ribbons + speed streaks, the flap caught at a different
// beat per shot, soft tapered swirling thermals, a plank runway with bunting,
// a double-faced sign, a smaller HUD, the rider stepping off on the camera's
// side of the machine (so it is never ghosted between lens and rider), the
// fallback chase camera looking down more steeply the higher she flies, and
// ground chatter dropped while she is more than 20 u up.
//
// Draw calls: frame · crank · wing×2 · prop · airflow (ribbons + streaks, in
//   flight only) · field · sock · helmet · cat · signpost · sign · thermal
//   motes · thermal shells · horizon apron (lens above 45 u only) = 15
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAT, CANDY } from '../../core/palette.js';
import { clamp, damp, smoothstep } from '../../core/util.js';
import { B, catGeo, signMesh } from './parts.js';
import { createRider, vehicleBusy, clearSpot, clearanceClaim } from './ride.js';

// ── flight tuning (exported so a node script can fly the model headless) ────
export const FLIGHT = {
  CRUISE: 12.5,        // u/s level glide
  SLOW: 9.0,           // W held: floaty, minimum sink
  DIVE: 22.0,          // S held
  BOOST_ADD: 15.0,     // extra u/s while boosting
  BOOST_T: 1.5, BOOST_CD: 12.0,
  FLAP_V: 8.5,         // vy impulse per flap at full bite + full energy
  FLAP_CD: 0.30,
  VY_MAX: 18, VY_MIN: -18,
  SINK: -2.7,          // level glide sink
  SINK_SLOW: -2.0,     // W held
  SINK_DIVE: -10.0,    // S held
  RELAX_UP: 1.0,       // how fast a flap's climb decays back to the glide
  RELAX_DN: 1.0,       // how fast a fall recovers to the glide
  CEIL: 330,           // soft ceiling (absolute y)
  BITE_LO: 190, BITE_HI: 380,
  PITCH_MAX: 0.45,     // 0.30 × 1.5
  PITCH_RATE: 5.25,    // 3.5 × 1.5
  LEVEL_RATE: 2.4,     // auto-level when W/S released
  TURN: 1.15, BANK: 0.62,
  E_FLAP: 0.0135,      // ≈ 74 flaps from a full tank
  E_GLIDE: 0.05,       // per second, after 0.8 s without flapping
  E_THERMAL: 0.30,     // per second at the heart of a thermal
  E_PARKED: 0.25,
  THERMAL_R: 14, THERMAL_LIFT: 8.0, THERMAL_TOP: 330,
};
const F_ = FLIGHT;

/** How well the wings bite at absolute height y (1 below 190 → 0.19 at 330 → 0.06 at 380). */
export function bite(y) { return clamp(1 - 0.94 * smoothstep(F_.BITE_LO, F_.BITE_HI, y), 0.06, 1); }

/**
 * One physics step. Pure: mutates the flight state `s` only.
 *   s   { x, y, z, yaw, vy, speed, pitch, turn, bank, energy, boostT, boostCd,
 *         flapCd, sinceFlap, flapped, boosted }
 *   inX turn (-1..1, +1 = right), inY pitch (+1 = nose up), flap/boost = edge
 *   th  thermal strength 0..1 at the current position
 */
export function stepFlight(s, inX, inY, flap, boost, th, dt) {
  s.flapped = false; s.boosted = false;
  // pitch: W/S with ×1.5 response, auto-level on release
  s.pitch = damp(s.pitch, inY * F_.PITCH_MAX, inY ? F_.PITCH_RATE : F_.LEVEL_RATE, dt);
  const up = Math.max(s.pitch, 0) / F_.PITCH_MAX, down = Math.max(-s.pitch, 0) / F_.PITCH_MAX;
  // banked turns: D = right = yaw decreasing (forward is (sin yaw, cos yaw))
  s.turn = damp(s.turn, -inX * F_.TURN, 4.2, dt);
  s.yaw += s.turn * dt;
  s.bank = damp(s.bank, (-s.turn / F_.TURN) * F_.BANK, 3.6, dt);
  // boost dash
  if (s.boostCd > 0) s.boostCd = Math.max(0, s.boostCd - dt);
  if (boost && s.boostCd <= 0) { s.boostT = F_.BOOST_T; s.boostCd = F_.BOOST_CD; s.vy = Math.max(s.vy, 0) + 2.5; s.boosted = true; }
  if (s.boostT > 0) s.boostT = Math.max(0, s.boostT - dt);
  const boosting = s.boostT > 0;
  // airspeed
  let vT = F_.CRUISE - up * (F_.CRUISE - F_.SLOW) + down * (F_.DIVE - F_.CRUISE);
  if (boosting) vT += F_.BOOST_ADD;
  s.speed = damp(s.speed, vT, boosting ? 3.5 : 1.1, dt);
  // the glide the machine relaxes toward
  let sinkT = F_.SINK + up * (F_.SINK_SLOW - F_.SINK) + down * (F_.SINK_DIVE - F_.SINK);
  sinkT += th * F_.THERMAL_LIFT * (1 - smoothstep(F_.THERMAL_TOP - 45, F_.THERMAL_TOP + 12, s.y));
  if (boosting) sinkT += 1.5;
  sinkT -= Math.abs(s.bank) * 0.8;                          // a steep bank costs a little lift
  if (s.y > F_.CEIL) sinkT -= (s.y - F_.CEIL) * 0.16;       // thin air
  // flap
  s.flapCd -= dt; s.sinceFlap += dt;
  if (flap && s.flapCd <= 0) {
    s.flapCd = F_.FLAP_CD; s.sinceFlap = 0;
    const eff = 0.3 + 0.7 * smoothstep(0, 0.3, s.energy);
    s.vy = Math.min(F_.VY_MAX, Math.max(s.vy, -1) + F_.FLAP_V * bite(s.y) * eff);
    s.energy = Math.max(0, s.energy - F_.E_FLAP);
    s.flapped = true;
  }
  const k = s.vy > sinkT ? F_.RELAX_UP : F_.RELAX_DN;
  s.vy += (sinkT - s.vy) * (1 - Math.exp(-k * dt));
  s.vy = clamp(s.vy, F_.VY_MIN, F_.VY_MAX);
  // energy: gliding and warm air give it back
  if (s.sinceFlap > 0.8) s.energy += F_.E_GLIDE * dt;
  s.energy = Math.min(1, s.energy + th * F_.E_THERMAL * dt);
  // integrate
  s.x += Math.sin(s.yaw) * s.speed * dt;
  s.z += Math.cos(s.yaw) * s.speed * dt;
  s.y += s.vy * dt;
}

// The six thermals, and what is warming each one.
export const THERMAL_SITES = [
  { id: 'giant_cupcake', name: 'The Great Cupcake', joke: 'Warm air off the Great Cupcake. It is still baking.' },
  { id: 'candy_palace', name: 'The Candy Palace', joke: 'The palace kitchens are on. Up you go.' },
  { id: 'yarn_hill', name: 'The Yarn Ball', joke: 'Static lift off the Yarn Ball. Your hair is standing up.' },
  { id: 'lighthouse', name: 'The Watchtower', joke: 'Heat off the Watchtower lamp. The cats keep it very bright.' },
  { id: 'meow_donalds', name: "Meow Donald's", joke: "Meow Donald's fryer vents. The whole sky smells of fish." },
  { id: 'cat_park', name: 'Catnip Commons', joke: 'Catnip Commons. Something down there is fermenting.' },
];

const SEAT = 0.55;          // rider's feet above the machine origin

// CANARY. The machine used to be a dark red frame with rainbow wings, parked
// in the shade of a bush — the darkest object in its own frame. It is now the
// brightest: yellow frame, white wings, red ribs, and a propeller you can count
// the blades on from the path.
const FRAME = 0xffd21e, FRAME_DK = 0xe0a800, STEEL = 0x7d8590, RUBBER = 0x2b2b30, WOOD = 0x8d5a34;
const RIB = 0xe03a2f, SAIL = 0xfffaf0;
// WAVE 3 polish: the canvas. White sailcloth vanished into the milky sea and
// sky at altitude and left two bare red-and-yellow ladders; the skin is now a
// candy wrapper of hot pink and tangerine cells with cream battens, which
// reads against blue water, green lawn and pink frosting alike.
const CANVAS = [0xff4f8b, 0xffa23a], BATTEN = 0xfff3de;
const WRAP = [CANDY.gummyYellow, CANDY.gummyBlue, CANDY.gummyGreen, CANDY.gummyPurple, CANDY.gummyOrange];

export function create(ctx, api) {
  const { scene, world } = ctx;
  ctx.colliders = ctx.colliders || [];
  // Contract I: the phone tier gets fewer thermal motes and wind streaks
  const MOBILE = !!ctx.state.mobile;
  const MOTES_PER = MOBILE ? 150 : 260;
  const lm = world.LANDMARKS.flyer_pad;
  // The clearance claim below opens the ground, so this only has to dodge the
  // last metre or two — a 7-unit search used to walk the machine off the
  // landmark entirely and out of its own camera view.
  const clear = clearSpot(ctx, lm.x, lm.z, { radius: 2.5, step: 0.5, need: 7, minH: 1.2, pull: 0.35, pad: 2.4 });
  const PAD = { x: clear.x, z: clear.z, y: world.height(clear.x, clear.z) };
  const HOME_YAW = -Math.PI * 0.72;       // nose WSW: toward Candyland, and broadside
                                          // to the default iso camera so the wings read as wings

  const rider = createRider(ctx);
  // createRider pushed its seat walkable last; our own ground probe skips it
  const riderWalk = ctx.walkables[ctx.walkables.length - 1];
  /** local (x, z) on the pad → world (the pad is rotated to HOME_YAW). */
  const CY = Math.cos(HOME_YAW), SY = Math.sin(HOME_YAW);
  const locX = (lx, lz) => PAD.x + CY * lx + SY * lz;
  const locZ = (lx, lz) => PAD.z - SY * lx + CY * lz;

  // ── the machine ────────────────────────────────────────────────────────────
  const flyer = new THREE.Group();
  flyer.name = 'flyer';
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
      const cv = CANVAS[i % 2], cv2 = CANVAS[(i + 1) % 2];
      // the canvas cell: thick enough to read edge-on from the chase camera
      w.add(new THREE.BoxGeometry(1.02, 0.14, chord), cv, px, py, pz, 0, 0, roll);
      // a cream batten on the cell's outboard edge, so the wing reads as
      // stitched cells of colour rather than one plank
      const bx = px + side * 0.47 * Math.cos(roll), by = py + side * 0.47 * Math.sin(roll);
      w.box(0.11, 0.19, chord * 0.97, BATTEN, bx, by + 0.02, pz, 0, 0, roll);
      // red leading edge
      w.box(1.04, 0.2, 0.2, RIB, px, py + 0.03, pz - chord * 0.47, 0, 0, roll);
      // scalloped trailing edge: this is a sweet wrapper, after all
      const scal = i < 4 ? 1 : 0;
      for (let k = -scal; k <= scal; k++) w.sph(0.19 - t * 0.05, 5, 4, cv2, px + k * 0.33, py - 0.02, pz + chord * 0.5, [1, 0.5, 1]);
    }
    // pointed tip + the knot the ribbon streamer is tied to
    w.add(new THREE.ConeGeometry(0.5, 1.9, 4), CANVAS[0], side * 5.05, 2.22, -1.25, 0, 0, side * 1.4, [1, 1, 0.3]);
    w.sph(0.24, 6, 5, CANDY.gummyYellow, side * 5.6, 2.3, -1.35);
    const m = w.build('flyer_wing' + (side > 0 ? 'R' : 'L'), { side: THREE.DoubleSide });
    m.position.set(side * 0.30, 2.52, -0.04);
    m.rotation.order = 'YXZ';
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

  // ── AIRFLOW: wingtip ribbons + speed streaks (ONE draw call) ──────────────
  // A frozen flight frame used to say nothing about motion: the same V of
  // wings, no blur, no wind. Two candy-striped ribbons tied to the wingtips
  // stream and twist behind her (their roots follow the flapping tips, fed in
  // as uniforms), and thin wind streaks slide past the machine faster the
  // faster she goes. Flyer-local space, so pitch and bank carry them along.
  const RIB_SEG = MOBILE ? 10 : 16, STREAKS = MOBILE ? 14 : 26;
  const airflow = (() => {
    const nV = 2 * (RIB_SEG + 1) * 2 + STREAKS * 4;
    const pos = new Float32Array(nV * 3), aA = new Float32Array(nV * 4), aB = new Float32Array(nV * 4);
    const idx = [];
    let v = 0;
    for (const side of [-1, 1]) {
      const base = v;
      for (let i = 0; i <= RIB_SEG; i++) {
        for (const across of [-1, 1]) { aA.set([side, i / RIB_SEG, across, 0], v * 4); v++; }
        if (i < RIB_SEG) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    let s = 0x5f3759df >>> 0;
    const rnd = () => { s = (Math.imul(s ^ (s >>> 13), 0x5bd1e995) + 0x6d2b79f5) >>> 0; return s / 4294967296; };
    for (let k = 0; k < STREAKS; k++) {
      // a hollow sleeve of air around the machine, never through her body
      const ang = rnd() * Math.PI * 2, rad = 2.4 + rnd() * 5.2;
      const sx = Math.cos(ang) * rad * 1.25, sy = 1.4 + Math.sin(ang) * rad * 0.7;
      const ph = rnd(), len = 1.6 + rnd() * 2.4;
      const a = v;
      for (const t of [0, 1]) for (const across of [-1, 1]) { aA.set([0, t, across, 1], v * 4); aB.set([sx, sy, ph, len], v * 4); v++; }
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aA', new THREE.BufferAttribute(aA, 4));
    geo.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uAir: { value: 0 }, uSpeed: { value: 0 }, uBoost: { value: 0 }, uLight: { value: 1 },
        uTipL: { value: new THREE.Vector3(-5.6, 4.8, -1.4) }, uTipR: { value: new THREE.Vector3(5.6, 4.8, -1.4) },
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: /* glsl */`
        uniform float uTime; uniform float uAir; uniform float uSpeed; uniform float uBoost;
        uniform vec3 uTipL; uniform vec3 uTipR;
        attribute vec4 aA; attribute vec4 aB;
        varying float vA; varying float vT; varying float vKind; varying float vAcross;
        void main(){
          vT = aA.y; vKind = aA.w; vAcross = aA.z;
          if (aA.w < 0.5) {
            // RIBBON: trails from the tip, waves, twists about its own axis
            float side = aA.x; float t = aA.y;
            vec3 root = side < 0.0 ? uTipL : uTipR;
            float L = 3.4 + uSpeed * 2.2 + uBoost * 1.5;
            float wv = uTime * 8.5 - t * 5.5 + side * 1.7;
            vec3 p = root + vec3(side * 0.35 * t + sin(wv) * 0.45 * t,
                                 sin(wv * 0.83 + 1.3) * 0.38 * t - t * t * 0.55,
                                 -t * L);
            float tw = t * 2.8 + uTime * 4.5 + side;
            p += vec3(cos(tw), sin(tw), 0.0) * aA.z * 0.24 * (1.0 - 0.5 * t);
            vA = uAir * (1.0 - smoothstep(0.72, 1.0, t));
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          } else {
            // STREAK: a thin camera-facing dash sliding aft along the body axis
            float span = 30.0;
            float zf = fract(aB.z - uTime * (0.55 + uSpeed * 0.8 + uBoost * 0.9));
            float z = zf * span - span * 0.5;
            float len = aB.w * (0.7 + uSpeed * 1.1 + uBoost * 1.2);
            vec4 va = modelViewMatrix * vec4(aB.x, aB.y, z, 1.0);
            vec4 vb = modelViewMatrix * vec4(aB.x, aB.y, z - len, 1.0);
            vec3 mid = mix(va.xyz, vb.xyz, aA.y);
            vec3 sd = normalize(cross(vb.xyz - va.xyz, mid) + vec3(1e-5));
            float w = 0.075 * (1.0 + uBoost * 0.6) * max(1.0, -mid.z / 40.0);
            gl_Position = projectionMatrix * vec4(mid + sd * aA.z * w, 1.0);
            vA = uAir * smoothstep(0.0, 0.25, zf) * (1.0 - smoothstep(0.65, 1.0, zf))
               * (0.16 + 0.34 * uSpeed + 0.35 * uBoost);
          }
        }`,
      fragmentShader: /* glsl */`
        uniform float uLight;
        varying float vA; varying float vT; varying float vKind; varying float vAcross;
        void main(){
          vec3 col;
          float a = vA;
          if (vKind < 0.5) {
            float st = step(0.5, fract(vT * 4.5));
            col = mix(vec3(1.0, 0.31, 0.55), vec3(1.0, 0.95, 0.86), st) * uLight;
          } else {
            col = vec3(1.0, 0.98, 0.94) * mix(0.55, 1.0, uLight);
            a *= 1.0 - vAcross * vAcross * 0.6;
          }
          if (a < 0.01) discard;
          gl_FragColor = vec4(col, a);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'flyer_airflow';
    m.frustumCulled = false;            // the shader builds every vertex
    m.renderOrder = 5;
    m.visible = false;
    m.userData.noOcclude = true; m.userData.noFade = true;
    flyer.add(m);
    return m;
  })();
  const aU = airflow.material.uniforms;
  const TIP = new THREE.Vector3();

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
  // THE RUNWAY (wave 3 polish). It used to be a plain cream box on the grass.
  // Now it is a hand-built plank deck: warm boards in two tones laid across
  // the run, red edge boards, a candy-striped skirt where the slope shows the
  // side, white centre dashes, a yellow take-off chevron, a little ramp lip at
  // the end, and bunting strung between painted poles down both sides.
  const RW0 = -4.8, RW1 = 9.6, RWW = 4.4, RWL = RW1 - RW0, RWC = (RW0 + RW1) / 2;
  gb.box(RWW - 0.2, 1.8, RWL - 0.2, 0x6e4326, 0, -0.84, RWC);               // bed, sunk into the slope
  for (let z = RW0 + 0.26, i = 0; z < RW1 - 0.1; z += 0.52, i++) {          // the planks
    const tone = i % 3 === 0 ? 0xd9a064 : i % 3 === 1 ? 0xc98a4e : 0xe0ae72;
    gb.box(RWW, 0.16, 0.47, tone, 0, 0.06, z);
  }
  for (const s of [-1, 1]) {
    gb.box(0.22, 0.24, RWL, RIB, s * (RWW / 2 + 0.08), 0.08, RWC);            // red edge boards
    // candy-striped skirt: vertical slats down the exposed side
    for (let z = RW0 + 0.35, i = 0; z < RW1; z += 0.7, i++) gb.box(0.08, 1.7, 0.66, i % 2 ? 0xfff3de : RIB, s * (RWW / 2 + 0.2), -0.85, z);
  }
  for (const e of [RW0, RW1]) for (let x = -RWW / 2 + 0.35, i = 0; x < RWW / 2; x += 0.7, i++) gb.box(0.66, 1.7, 0.08, i % 2 ? 0xfff3de : RIB, x, -0.85, e + Math.sign(e) * 0.14);
  for (const z of [-3.4, 2.2, 4.0, 5.8]) gb.box(0.26, 0.03, 1.05, 0xfffaf0, 0, 0.155, z);   // centre dashes
  for (const s of [-1, 1]) gb.box(1.5, 0.03, 0.34, CANDY.gummyYellow, s * 0.55, 0.16, 7.7, 0, s * 0.62, 0);   // chevron ^
  gb.box(RWW - 0.4, 0.14, 1.3, 0xc98a4e, 0, 0.28, RW1 + 0.55, -0.3, 0, 0);   // ramp lip
  gb.box(RWW - 0.4, 0.05, 0.22, CANDY.gummyYellow, 0, 0.47, RW1 + 1.12, -0.3, 0, 0);
  // bunting: painted poles, sagging strings, candy pennants
  const FLAGS = [CANDY.gummyRed, CANDY.gummyYellow, CANDY.gummyBlue, CANDY.gummyGreen, CANDY.gummyOrange, CANDY.gummyPurple];
  // (the flight line sits outside the 11-unit wingspan: a take-off run must
  // never swipe the pennants off their string)
  const POLE_Z = [-4.4, 0.4, 5.2, 9.9], POLE_H = 2.5, SAG = 0.5;
  for (const s of [-1, 1]) {
    const px = s * 6.4;
    for (const pz of POLE_Z) {
      gb.cyl(0.09, 0.11, POLE_H + 0.9, 6, 0xfff3de, px, POLE_H / 2 - 0.45, pz);
      gb.cyl(0.12, 0.12, 0.3, 6, RIB, px, POLE_H * 0.55, pz);
      gb.sph(0.16, 6, 5, RIB, px, POLE_H + 0.05, pz);
    }
    for (let k = 0; k < POLE_Z.length - 1; k++) {
      const z0 = POLE_Z[k], z1 = POLE_Z[k + 1];
      const yAt = (t) => POLE_H - 0.1 - SAG * 4 * t * (1 - t);
      for (let j = 0; j < 4; j++) {
        const ta = j / 4, tb = (j + 1) / 4;
        gb.beam([px, yAt(ta), z0 + (z1 - z0) * ta], [px, yAt(tb), z0 + (z1 - z0) * tb], 0.05, 0x5a3a22);
      }
      for (let f = 0; f < 6; f++) {
        const t = (f + 0.5) / 6;
        gb.add(new THREE.ConeGeometry(0.24, 0.5, 3), FLAGS[(f + k * 2 + (s > 0 ? 3 : 0)) % FLAGS.length],
          px, yAt(t) - 0.27, z0 + (z1 - z0) * t, Math.PI, 0, 0, [0.22, 1, 1]);
      }
    }
  }
  for (const s of [-1, 1]) gb.cone(0.26, 0.62, 6, CANDY.gummyOrange, s * 1.9, 0.46, RW1 + 1.8);
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
  const cx = locX(-3.3, -2.6), cz = locZ(-3.3, -2.6);
  cat.position.set(cx, world.height(cx, cz), cz);
  cat.rotation.y = HOME_YAW + 2.5;
  cat.scale.setScalar(1.25);
  scene.add(cat);

  // ── sign ───────────────────────────────────────────────────────────────────
  const sp = new B();
  for (const s of [-1, 1]) sp.cyl(0.10, 0.12, 3.5, 6, 0x6b4126, s * 1.0, 1.75, 0);
  sp.box(2.78, 1.43, 0.07, 0x6b4126, 0, 2.9, 0);                        // the board's timber edge
  sp.box(2.9, 0.12, 0.2, RIB, 0, 3.66, 0);                              // a red cap rail
  const signPost = sp.build('flyer_signpost');
  const sgx = locX(8.2, 1.2), sgz = locZ(8.2, 1.2);
  const sgy = world.height(sgx, sgz);
  signPost.position.set(sgx, sgy, sgz);
  signPost.rotation.y = 0.85;
  scene.add(signPost);
  const sign = signMesh(2.6, 1.25, [
    { text: 'WING NUT FIELD', size: 50, color: '#3b2415' },
    { text: 'flight school · 1 lesson', size: 34, color: '#b0202e' },
  ], { bg: '#f2e6c4' });
  // DOUBLE-FACED. A single DoubleSide plane showed its back as mirror
  // writing ('DJEIF TUN'); now the same painted face is glued back to back
  // (front-side only), so the board reads correctly from both sides.
  {
    const g0 = sign.geometry, g1 = g0.clone();
    g0.translate(0, 0, 0.045);
    g1.rotateY(Math.PI); g1.translate(0, 0, -0.045);
    sign.geometry = mergeGeometries([g0, g1], false);
    g0.dispose(); g1.dispose();
    sign.material.side = THREE.FrontSide;
  }
  sign.position.set(sgx, sgy + 2.9, sgz);
  sign.rotation.y = 0.85;              // square-on to the default iso camera
  scene.add(sign);
  for (const s of [-1, 1]) ctx.colliders.push({ x: sgx + s * Math.cos(0.85), z: sgz - s * Math.sin(0.85), r: 0.35 });

  // the machine is solid where she stands (moved when she is parked elsewhere)
  let machineCol = { x: PAD.x, z: PAD.z, r: 1.5 };
  ctx.colliders.push(machineCol);
  // CLEARANCE CLAIM. cat/nature runs before us and re-tests every instance
  // against the oriented BOX colliders in ctx.colliders on world:ready, so a
  // box published here clears the field. h is absolute and below the ground, so
  // player.js drops it instantly — it is a claim, never a wall.
  clearanceClaim(ctx, PAD.x, PAD.z, 22, 26, HOME_YAW, 'flyer_pad');
  ctx.colliders.push({ x: locX(-3.2, 1.6), z: locZ(-3.2, 1.6), r: 1.3 });
  for (const s of [-1, 1]) for (const pz of POLE_Z) ctx.colliders.push({ x: locX(s * 6.4, pz), z: locZ(s * 6.4, pz), r: 0.32 });

  // ── THERMALS: six columns of rising warm-air motes (one Points draw call) ──
  const thermals = [];
  for (const site of THERMAL_SITES) {
    const L = world.LANDMARKS[site.id];
    if (!L) continue;
    const base = Math.max(world.height(L.x, L.z), 0) + 4;
    thermals.push({ ...site, x: L.x, z: L.z, base, seen: false });
  }
  const thermalMotes = (() => {
    const n = thermals.length * MOTES_PER;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4), top = new Float32Array(n);
    let s = 0x9e3779b9 >>> 0;
    const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let k = 0;
    for (const th of thermals) {
      for (let i = 0; i < MOTES_PER; i++, k++) {
        pos[k * 3] = th.x; pos[k * 3 + 1] = th.base; pos[k * 3 + 2] = th.z;
        seed[k * 4] = rnd();                                   // phase along the column
        seed[k * 4 + 1] = rnd() * Math.PI * 2;                 // angle
        seed[k * 4 + 2] = Math.sqrt(rnd());                    // radius fraction
        seed[k * 4 + 3] = rnd();                               // size / hue
        top[k] = F_.THERMAL_TOP - th.base;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setAttribute('aTop', new THREE.BufferAttribute(top, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uPx: { value: 800 }, uFly: { value: 0 }, uNight: { value: 0 },
        uR: { value: F_.THERMAL_R },
      },
      transparent: true, depthWrite: false,
      // Three kinds of point share the one draw call: STREAKS riding three
      // helical arms (the column reads as a slow warm spiral from 300 u away),
      // loose streaks between them, and big faint HAZE puffs (≈22%) that give
      // the column a body. Streaks never shrink below 2.5 px, so a column on
      // the far island is still a column.
      vertexShader: /* glsl */`
        uniform float uTime; uniform float uPx; uniform float uFly; uniform float uR;
        attribute vec4 aSeed; attribute float aTop;
        varying float vA; varying float vHue; varying float vHaze;
        void main(){
          float haze = step(0.78, aSeed.w);
          float arm = step(aSeed.z, 0.78) * (1.0 - haze);
          float h = fract(aSeed.x + uTime * mix(0.020 + aSeed.w * 0.012, 0.007, haze));
          float a0 = mix(aSeed.y, floor(aSeed.y * 0.4775) * 2.0944 + (aSeed.z - 0.39) * 0.9, arm);
          float ang = a0 + uTime * 0.32 + h * 9.0;
          float rf = mix(aSeed.z, 0.72 + aSeed.z * 0.2, arm);
          float r = uR * rf * mix(0.35 + 0.55 * h, 0.30 + 0.40 * h, haze);
          vec3 p = vec3(position.x + cos(ang) * r, position.y + h * aTop, position.z + sin(ang) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = max(-mv.z, 1.0);
          float sz = mix((0.6 + aSeed.w * 0.8) * (1.0 + uFly * 0.8), 9.0 + aSeed.z * 7.0, haze);
          gl_PointSize = clamp(sz * uPx / d, mix(2.5, 3.0, haze), mix(34.0, 150.0, haze));
          float fadeIn = smoothstep(0.0, 0.16, h);
          float fadeOut = 1.0 - smoothstep(0.50, 0.97, h);
          float farFade = 1.0 - smoothstep(600.0, 880.0, d);
          float nearFade = smoothstep(mix(6.0, 22.0, haze), mix(20.0, 70.0, haze), d);
          vA = fadeIn * fadeOut * farFade * nearFade * mix(mix(0.75, 1.0, uFly), mix(0.10, 0.20, uFly), haze);
          vHue = aSeed.w; vHaze = haze;
        }`,
      fragmentShader: /* glsl */`
        uniform float uNight;
        varying float vA; varying float vHue; varying float vHaze;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          // streaks are tall thin dashes (warm air rising); haze is a soft disc
          float e = mix((c.x * c.x * 8.0 + c.y * c.y * 1.15) * 4.0, dot(c, c) * 4.0, vHaze);
          if (e > 1.0) discard;
          float fall = mix(pow(1.0 - e, 1.3), (1.0 - e) * (1.0 - e), vHaze);
          vec3 gold = vec3(1.0, 0.80, 0.32), peach = vec3(1.0, 0.62, 0.50), cream = vec3(1.0, 0.96, 0.84);
          vec3 col = mix(gold, peach, smoothstep(0.30, 0.75, vHue));
          col = mix(col, cream, (1.0 - vHaze) * smoothstep(0.55, 1.0, 1.0 - e) * 0.7);
          col = mix(col, mix(cream, gold, 0.3), vHaze * 0.8);   // haze is shimmer, not smoke
          // after dark the air glows amber (a plain brightness boost clipped to white)
          col = mix(col, vec3(1.0, 0.62, 0.26), uNight * 0.55) * mix(1.0, 1.12, uNight);
          gl_FragColor = vec4(col, vA * fall);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'flyer_thermals';
    pts.frustumCulled = false;          // the vertex shader lifts motes 300 u above their base
    pts.renderOrder = 4;                // after the sea (2) and the column body (3)
    scene.add(pts);
    return pts;
  })();
  const tU = thermalMotes.material.uniforms;

  // …and the column's BODY: one open, double-sided funnel per thermal, merged
  // into one mesh. Wave-3 polish: the old shell brightened at its silhouette
  // (a rim term), so from the side it read as a flat translucent slab with
  // hard edges and cut-off ends. Now the alpha is CENTRE-weighted (it falls to
  // zero at the silhouette), three helical bands wind up it, the funnel widens
  // as it climbs, and both ends fade out over a long ramp: a soft, tapered,
  // swirling column. Faint from the ground, a clear golden pillar from the air,
  // gone within 25 u of the lens so you never fly into a wall of gauze.
  const thermalShell = (() => {
    const geos = [];
    for (const th of thermals) {
      const H = F_.THERMAL_TOP - th.base;
      const g = new THREE.CylinderGeometry(F_.THERMAL_R * 1.15, F_.THERMAL_R * 0.4, H, 18, 12, true);
      g.translate(th.x, th.base + H / 2, th.z);
      geos.push(g);
    }
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: tU.uTime, uFly: tU.uFly, uNight: tU.uNight },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        varying vec3 vW; varying vec3 vN; varying vec2 vUv;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uFly; uniform float uNight;
        varying vec3 vW; varying vec3 vN; varying vec2 vUv;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float ndv = abs(dot(normalize(vN), V));
          // soft body: dense where you look through the middle, nothing at the edge
          float body = smoothstep(0.08, 0.85, ndv);
          // three helical bands climbing and turning
          float sw = sin((vUv.x * 3.0 + vUv.y * 2.4 - uTime * 0.10) * 6.2832);
          float swirl = 0.30 + 0.70 * smoothstep(-0.35, 1.0, sw);
          float vert = smoothstep(0.0, 0.26, vUv.y) * (1.0 - smoothstep(0.40, 0.97, vUv.y));
          float d = distance(cameraPosition, vW);
          float nearF = smoothstep(25.0, 95.0, d);
          float farF = 1.0 - smoothstep(700.0, 880.0, d);
          float a = body * swirl * vert * nearF * farF * mix(0.06, 0.20, uFly);
          if (a < 0.003) discard;
          vec3 col = mix(vec3(1.0, 0.78, 0.44), vec3(1.0, 0.95, 0.84), swirl * 0.55);
          col = mix(col, vec3(1.0, 0.58, 0.24), uNight * 0.6);     // amber after dark, not grey
          a *= mix(1.0, 0.8, uNight);
          gl_FragColor = vec4(col, a);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'flyer_thermal_shell';
    // AFTER the sea: terrain_sea is transparent at renderOrder 2 and writes
    // depth, so a column body drawn before it was painted over wherever there
    // was water behind it; that is what cut the columns off in hard lines.
    m.renderOrder = 3;
    m.userData.noOcclude = true; m.userData.noFade = true;   // never a camera blocker
    scene.add(m);
    return m;
  })();

  // ── HORIZON APRON (wave-3 polish: "the sea stops at a hard straight edge") ─
  // A camera 150+ u up sees the sea only out to the far plane (900 u), which
  // at that height is 10-20 degrees BELOW the horizon; above that line the
  // sky dome's below-horizon grey showed as a flat band, and the sea mesh's own
  // corners showed where it ends (±940 x / ±800 z). The apron is a huge disc at
  // sea level under the camera, drawn right after the dome as a BACKGROUND
  // layer (no depth test, so everything real draws over it and it can never
  // hide anything), with its far vertices pinned inside the far plane so it
  // runs out to the true horizon. It paints the far sea fogged exactly the way
  // the real sea is (same fog uniforms, same aerial desaturation), so the seam
  // where the real sea is clipped is invisible, and toward the horizon it
  // becomes the dome itself: the same horizon colour, warm sun band and glow
  // line (it shares the dome's uniform objects), so water fades into sky with
  // no line. Only drawn when the lens is above ~45 u. One draw call.
  const domeU = (() => {
    let u = null;
    try { ctx.systems.sky?.group?.traverse?.((o) => { if (!u && o.name === 'skyDome' && o.material?.uniforms?.uHor) u = o.material.uniforms; }); } catch (e) { u = null; }
    return u;
  })();
  const apron = (() => {
    const DU = (k, v) => (domeU && domeU[k]) ? domeU[k] : { value: v };
    const RADII = [0, 30, 70, 130, 210, 320, 460, 640, 860, 1150, 1550, 2100, 2900, 4100, 6000, 9000, 14000, 22000, 34000];
    const SEG = 64;
    const pos = new Float32Array(RADII.length * SEG * 3);
    for (let r = 0; r < RADII.length; r++) {
      for (let a = 0; a < SEG; a++) {
        const k = (r * SEG + a) * 3, ang = a / SEG * Math.PI * 2;
        pos[k] = Math.cos(ang) * RADII[r]; pos[k + 1] = 0; pos[k + 2] = Math.sin(ang) * RADII[r];
      }
    }
    const idx = [];
    for (let r = 0; r < RADII.length - 1; r++) {
      for (let a = 0; a < SEG; a++) {
        const i0 = r * SEG + a, i1 = r * SEG + (a + 1) % SEG, j0 = i0 + SEG, j1 = i1 + SEG;
        idx.push(i0, i1, j0, i1, j1, j0);        // counter-clockwise seen from above
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHor: DU('uHor', new THREE.Vector3(0.9, 0.95, 0.98)), uHalo: DU('uHalo', new THREE.Vector3(1, 0.95, 0.8)),
        uHaloS: DU('uHaloS', 0.3), uBand: DU('uBand', new THREE.Vector3(1, 0.9, 0.7)), uBandS: DU('uBandS', 0.35),
        uBandY: DU('uBandY', 0.03), uBandW: DU('uBandW', 11), uLine: DU('uLine', new THREE.Vector3(1, 0.95, 0.85)),
        uLineS: DU('uLineS', 0.3), uSunDir: DU('uSunDir', new THREE.Vector3(0, 1, 0)), uBandDir: DU('uBandDir', new THREE.Vector3(0, 1, 0)),
        uFogCol: { value: new THREE.Vector3(0.8, 0.86, 0.88) }, uSea: { value: new THREE.Vector3(0.30, 0.52, 0.66) },
        uFogN: { value: 100 }, uFogF: { value: 800 }, uFar: { value: 900 }, uCamY: { value: 100 }, uOn: { value: 0 },
      },
      depthTest: false, depthWrite: false, fog: false, toneMapped: false,
      // blended but kept in the OPAQUE list (transparent:false), so the
      // renderOrder below puts it straight after the dome and before any world
      transparent: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */`
        varying vec3 vW; varying float vDepth;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec4 mv = viewMatrix * w;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
          // never far-clipped: the apron has to reach the horizon
          if (gl_Position.w > 0.0) gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99999);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform vec3 uHor, uHalo, uBand, uLine, uSunDir, uBandDir, uFogCol, uSea;
        uniform float uHaloS, uBandS, uBandY, uBandW, uLineS, uFogN, uFogF, uFar, uCamY, uOn;
        varying vec3 vW; varying float vDepth;
        float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main(){
          vec3 d = normalize(vW - cameraPosition);
          float h = min(d.y, -1e-4);
          // the sky dome's horizon, carried on below the horizon along this
          // bearing (sky/dome.js terms, same uniforms). The dome darkens its
          // below-horizon half; the apron does not, so the far water lifts
          // into the bright horizon instead of sinking into a grey band.
          vec3 dome = uHor;
          float sd = max(dot(d, uSunDir), 0.0);
          dome = mix(dome, uHalo, clamp((pow(sd, 5.0) * 0.75 + pow(sd, 40.0) * 0.55) * uHaloS, 0.0, 0.95));
          vec2 dz = normalize(d.xz + 1e-5);
          vec2 sz = normalize(uBandDir.xz + 1e-5);
          float az = max(dot(dz, sz), 0.0);
          float band = pow(az, 2.2) * exp(-abs(h - uBandY) * uBandW);
          dome = mix(dome, uBand, clamp(band * uBandS, 0.0, 0.9));
          float lineW = exp(-abs(h + 0.009) * 34.0) * 0.86 + exp(-abs(h + 0.011) * 150.0) * 0.70;
          dome = mix(dome, uLine, clamp(lineW * (0.58 + 0.48 * pow(az, 1.6)) * uLineS, 0.0, 0.90));
          // the far sea, fogged exactly like the real one (sky.js fog chunk)
          float f = smoothstep(uFogN, uFogF, vDepth);
          float aer = smoothstep(uFogN * 0.70, uFogF * 0.62, vDepth);
          vec3 sea = mix(uSea, vec3(dot(uSea, vec3(0.2126, 0.7152, 0.0722))), aer * 0.55);
          sea = mix(sea, uFogCol, f);
          // below where the real sea is clipped it IS the sea; toward the
          // horizon it gives way to the sky
          float hClip = -uCamY / uFar;
          float w = smoothstep(hClip * 0.98, hClip * 0.06, h);
          vec3 col = mix(sea, dome, w);
          col += (hash12(gl_FragCoord.xy) - 0.5) * (1.6 / 255.0);
          gl_FragColor = vec4(col, uOn);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'flyer_horizon_apron';
    m.frustumCulled = false;
    m.renderOrder = -999;               // the dome is -1000
    m.visible = false;
    m.castShadow = false; m.receiveShadow = false;
    m.userData.noOcclude = true; m.userData.noFade = true;
    scene.add(m);
    return m;
  })();
  const pU = apron.material.uniforms;
  const FOGC = { r: 0, g: 0, b: 0 };
  function apronUpdate() {
    const cam = ctx.camera, camY = cam.position.y;
    const on = smoothstep(45, 80, camY);
    apron.visible = on > 0.002;
    if (!apron.visible) return;
    apron.position.set(cam.position.x, 0, cam.position.z);
    pU.uOn.value = on;
    pU.uCamY.value = Math.max(camY, 1);
    pU.uFar.value = cam.far;
    const fog = scene.fog;
    if (fog) {
      pU.uFogN.value = fog.near; pU.uFogF.value = fog.far;
      fog.color.getRGB(FOGC, THREE.SRGBColorSpace);
      pU.uFogCol.value.set(FOGC.r, FOGC.g, FOGC.b);
    } else { pU.uFogN.value = 1e5; pU.uFogF.value = 2e5; }
  }

  /** Lift strength 0..1 at (px, pz), and which thermal gives it. */
  let thermalHere = null;
  function thermalAt(px, pz) {
    let best = 0; thermalHere = null;
    for (let i = 0; i < thermals.length; i++) {
      const th = thermals[i];
      const d = Math.hypot(px - th.x, pz - th.z);
      const s = 1 - smoothstep(F_.THERMAL_R * 0.55, F_.THERMAL_R * 1.3, d);
      if (s > best) { best = s; thermalHere = th; }
    }
    return best;
  }

  // ── HUD (own DOM) ──────────────────────────────────────────────────────────
  const hud = makeHud(ctx);

  // ── state ──────────────────────────────────────────────────────────────────
  const ui = () => ctx.systems.ui;
  const parts = () => ctx.systems.particles;

  const S = {                                   // the flight state stepFlight() mutates
    x: PAD.x, y: PAD.y, z: PAD.z, yaw: HOME_YAW, vy: 0, speed: 0, pitch: 0, turn: 0, bank: 0,
    energy: 1, boostT: 0, boostCd: 0, flapCd: 0, sinceFlap: 9, flapped: false, boosted: false,
  };
  const FLY = { alt: 0, y: 0, speed: 0, vy: 0, energy: 1, heading: 0, thermal: 0, boost: false };
  let phase = null, pt = 0, airT = 0;
  let flapPhase = 0, propSpin = 0, wingBeat = 0, tuck = 0, fold = 0;
  let milestone = 0, feather = 0, fromCat = false, bonkCd = 0, warned = 0;
  let gate = null, worldCols = null, parkedT = 0;
  let fogSaved = undefined, fogOn = false, camSaved = null, camChecked = false;
  const CAMP = { azimuth: 0, elevation: 0.38 }, GP = { x: 0, z: 0 };
  ctx.state.flying = null;
  let shiftWas = false, hold = false, warmT = 0;
  const touchUI = ctx.state.touch ?? (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

  // reusable particle option blocks (burst() reads them synchronously)
  const P_TRAIL = { x: 0, y: 0, z: 0, count: 1, color: [0xffffff, 0xffe9a8], speed: 0.5, life: 1.2, size: 0.26, sizeEnd: 0.5, gravity: -0.4, spread: 0.4, alpha: 0.5 };
  const P_FLAP = { x: 0, y: 0, z: 0, count: 5, color: [0xffffff, CANDY.gummyYellow, CANDY.gummyBlue], speed: 2.6, life: 1.3, size: 0.34, sizeEnd: 0.14, gravity: -1.6, drag: 1.2, spread: 0.8, shape: 'leaf', spin: 2.4 };
  const P_DUST = { x: 0, y: 0, z: 0, count: 18, color: [0xd8c7a8, 0xf3ead8], speed: 3.2, life: 0.9, size: 0.45, sizeEnd: 1.1, gravity: -3, spread: 1.3, alpha: 0.5 };
  const P_BOOST = { x: 0, y: 0, z: 0, count: 3, color: [0xffffff, CANDY.gummyPink ?? 0xff8fc0, CANDY.gummyYellow], speed: 1.2, life: 0.7, size: 0.5, sizeEnd: 0.1, gravity: 0, drag: 2, spread: 0.6, alpha: 0.8 };
  const P_WARM = { x: 0, y: 0, z: 0, count: 2, color: [0xffd27a, 0xffb08a], speed: 1.4, up: 1.2, life: 1.0, size: 0.4, sizeEnd: 0.1, gravity: -2.5, spread: 1.6, alpha: 0.7 };

  /** Terrain, or a walkable deck / pier, or inland water — never our own seat. */
  function groundAt(px, pz) {
    let h = world.height(px, pz);
    const ws = ctx.walkables || [];
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (w === riderWalk || !w || !w.test) continue;
      const t = w.test(px, pz);
      if (typeof t === 'number' && Number.isFinite(t) && t > h) h = t;
    }
    if (h > 0.25) {                       // inland water (lake / river): she floats on it
      const wl = ctx.systems.terrain?.waterLevelAt?.(px, pz);
      if (typeof wl === 'number' && wl > h) h = wl;
    }
    return h;
  }

  function setFlyer() {
    flyer.position.set(S.x, S.y - SEAT, S.z);
    // nose up on W and while climbing; roll into turns
    const attitude = -(S.pitch * 0.75 + clamp(S.vy / 34, -0.28, 0.32));
    flyer.rotation.set(phase === 'air' ? attitude : S.pitch, S.yaw, S.bank);
    const flap = Math.sin(flapPhase) * (0.42 + wingBeat * 0.55) * (1 - tuck * 0.8) + wingBeat * 0.18;
    // parked away from the field she folds her wings up like a resting moth,
    // so an 11-unit span never spears the lollipops around her
    wingL.rotation.z = (flap - tuck * 0.25) * (1 - fold) - 1.12 * fold;
    wingR.rotation.z = (-flap + tuck * 0.25) * (1 - fold) + 1.12 * fold;
    wingL.rotation.x = flap * 0.22;
    wingR.rotation.x = flap * 0.22;
    wingL.rotation.y = -tuck * 0.55;          // swept back for the boost dash
    wingR.rotation.y = tuck * 0.55;
    prop.rotation.z = propSpin;
    crank.rotation.x = propSpin * 0.45;
  }

  /** Ribbons + streaks: follow the flapping wingtips, fade in with flight. */
  function airflowUpdate(dt) {
    const air = phase === 'air' ? 1 : phase === 'run' ? clamp(pt / 1.3, 0, 1) * 0.6 : 0;
    aU.uAir.value = damp(aU.uAir.value, air, air > aU.uAir.value ? 3 : 5, dt);
    airflow.visible = aU.uAir.value > 0.01;
    if (!airflow.visible) return;
    aU.uTime.value = ctx.state.elapsed;
    aU.uSpeed.value = clamp((S.speed - 6) / 20, 0, 1.4);
    aU.uBoost.value = damp(aU.uBoost.value, S.boostT > 0 ? 1 : 0, 6, dt);
    aU.uLight.value = 0.4 + 0.6 * (ctx.state.daylight ?? 1);
    TIP.set(-5.6, 2.3, -1.35).applyEuler(wingL.rotation).add(wingL.position);
    aU.uTipL.value.copy(TIP);
    TIP.set(5.6, 2.3, -1.35).applyEuler(wingR.rotation).add(wingR.position);
    aU.uTipR.value.copy(TIP);
  }

  /** flight state only — leaves the machine where it is parked */
  function resetFlight() {
    S.vy = 0; S.pitch = 0; S.bank = 0; S.turn = 0; S.speed = 0; S.boostT = 0; S.flapCd = 0; S.sinceFlap = 9;
    flapPhase = 0; wingBeat = 0; tuck = 0;
  }

  function moveCollider(px, pz) {
    // moved IN PLACE: player/ground.js reads geometry and the solid flag live and its
    // rolling validator re-bins a collider that moved (the swap back from the
    // rider's empty list also rebuilds the hash outright)
    machineCol.x = px; machineCol.z = pz; machineCol.solid = true;
  }

  /** wheel her back to Wing Nut Field */
  function goHome() {
    S.x = PAD.x; S.z = PAD.z; S.y = PAD.y + SEAT; S.yaw = HOME_YAW;
    resetFlight(); setFlyer();
    moveCollider(PAD.x, PAD.z);
    parkedT = 0;
    markMap();
  }
  goHome();

  function markMap() {
    try { ui()?.addMapMarker?.({ id: 'flyer', x: S.x, z: S.z, glyph: 'plane', label: 'Flying machine' }); } catch (e) { /* optional */ }
  }
  function thermalMarkers(on) {
    for (const th of thermals) {
      try {
        if (on) ui()?.addMapMarker?.({ id: 'thermal_' + th.id, x: th.x, z: th.z, glyph: 'thermal', label: 'Thermal · ' + th.name });
        else ui()?.removeMapMarker?.('thermal_' + th.id);
      } catch (e) { /* optional */ }
    }
  }

  ctx.events.on('world:ready', () => {
    gate = ctx.systems.interaction?.register({
      id: 'escape_flyer',
      getPos: () => { GP.x = S.x; GP.z = S.z; return GP; }, x: PAD.x, z: PAD.z, r: 3.8,
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
        ui()?.say('Chapter One: Birds. Warm air rises. Land anywhere. That is the whole book.', { speaker: 'Wingnut', duration: 4.6 });
      },
    });
    markMap();
  });

  // ── GROUND CHATTER ─────────────────────────────────────────────────────────
  // Ground NPCs notice the visitor by map distance alone, so at 150 u a cat or
  // a kid below still starts "Oh! A human!" and the dialogue box sat over the
  // landing target in most flight frames. Nobody down there can be heard up
  // here: while she is airborne more than 20 u above the ground, a spoken line
  // from anyone but Wingnut is dropped the moment it is said (queued → removed
  // from the queue; shown → the box is cleared). Speaker-less narration and
  // toasts are untouched.
  ctx.events.on('ui:say', (e) => {
    if (phase !== 'air' || !(FLY.alt > 20) || !e || !e.speaker || e.speaker === 'Wingnut') return;
    const u = ui(); if (!u) return;
    try {
      const q = u.sayQueue, txt = String(e.text);
      const i = Array.isArray(q) ? q.findIndex((x) => x && x.text === txt) : -1;
      if (i >= 0) q.splice(i, 1); else u.clear?.();
    } catch (err) { /* optional */ }
  });

  // ── fog + camera while airborne ────────────────────────────────────────────
  function fogUpdate() {
    if (!fogOn) { fogSaved = ctx.state.fogScale; fogOn = true; }
    const camY = ctx.camera.position.y;
    let fs = 1 + clamp((camY - 30) / 60, 0, 2.3);
    // keep fog.far inside the camera's far plane, or the sea gets a hard edge
    const fog = scene.fog;
    const cur = Math.max(1, ctx.state.fogScale || 1);
    if (fog && fog.far > 0) {
      const baseFar = fog.far / (1 + (cur - 1) * 0.68);
      const maxFar = ctx.camera.far - 25;
      const fsCap = 1 + Math.max(0, maxFar / baseFar - 1) / 0.68;
      fs = Math.min(fs, fsCap);
    }
    // (sky.js reads fogScale next frame: clouds and mist follow it)
    ctx.state.fogScale = Math.max(1, fs);
    // …and THIS frame, straight after sky.js wrote scene.fog (sky runs first):
    // a lens this high looks at ground 200-600 u away, so haze has to start
    // with the height (the islands under you stay saturated instead of washing
    // out to white), end just inside the far plane (so the real sea is fully
    // hazed where it is clipped and meets the horizon apron seamlessly), and
    // take on the dome's own horizon colour, a warm sky gradient rather than
    // sky.js's darker ground-level sea haze. Sky rewrites all three next frame.
    if (!fog) return;
    const wA = smoothstep(30, 90, camY);
    if (wA <= 0) return;
    const far = Math.min(ctx.camera.far - 25, Math.max(fog.far, 520 + camY * 1.6));
    const near = Math.min(far - 280, Math.max(fog.near, camY * 1.35 + 30));
    fog.far += (far - fog.far) * wA;
    fog.near += (near - fog.near) * wA;
    if (domeU) {
      const hz = domeU.uHor.value, k = 0.6 * wA;
      fog.color.getRGB(FOGC, THREE.SRGBColorSpace);
      fog.color.setRGB(FOGC.r + (hz.x - FOGC.r) * k, FOGC.g + (hz.y - FOGC.g) * k, FOGC.b + (hz.z - FOGC.b) * k, THREE.SRGBColorSpace);
    }
  }
  function fogRestore() {
    if (!fogOn) return;
    ctx.state.fogScale = fogSaved; fogOn = false; fogSaved = undefined;
  }
  function cameraCheck() {
    // Contract E: the camera honours ctx.state.flying (distance 44, elevation
    // 0.38, FOV 40). If this camera build does not, frame the flight ourselves.
    camChecked = true;
    const cam = ctx.systems.camera;
    if (!cam?.params || typeof cam.setParams !== 'function') return;
    if (ctx.camera.fov >= 33) return;
    // (azimuth is NOT saved: on landing the lens stays behind the machine
    // instead of whipping back to wherever it pointed before take-off)
    camSaved = { distance: cam.params.distance, elevation: cam.params.elevation, fov: cam.params.fov };
    cam.setParams({ distance: 44, elevation: 0.38, fov: 40 });
    CAMP.azimuth = cam.params.azimuth;
    CAMP.elevation = 0.38;
  }
  /**
   * Fallback framing only: trail the lens behind the heading, a little off the
   * tail (a three-quarter rear view shows the wing planform, not two edge-on
   * spars), and look down more steeply the higher she climbs: at 300 u a
   * 0.38 rad lens stares at haze 850 u away; 0.62 keeps the islands under you
   * in the frame.
   */
  function cameraFollow(dt) {
    const cam = ctx.systems.camera;
    if (!camSaved || !cam?.setParams) return;
    let d = (S.yaw + Math.PI - 0.3) - CAMP.azimuth;
    d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    CAMP.azimuth += d * (1 - Math.exp(-1.6 * dt));
    const elT = 0.38 + 0.24 * smoothstep(40, 300, S.y);
    CAMP.elevation += (elT - CAMP.elevation) * (1 - Math.exp(-1.2 * dt));
    cam.setParams(CAMP);
  }
  function cameraRestore() {
    camChecked = false;
    if (camSaved) { try { ctx.systems.camera?.setParams?.(camSaved); } catch (e) {} camSaved = null; }
  }

  function endFlight() {
    ctx.state.flying = null;
    flyer.userData.noFade = false; flyer.userData.noOcclude = false;
    fogRestore(); cameraRestore(); thermalMarkers(false);
    hud.show(false);
  }

  /** Solid for a flying machine? (claims, low props, open doors are not) */
  function solidCol(c) {
    if (!c || c === machineCol || c.solid === false) return false;
    if (typeof c.h === 'number' && (c.h <= 1.6 || c.h < -50)) return false;
    return true;
  }
  /** Top of a solid collider in world Y (absolute h, or a size guess). */
  function colTop(c, guess) {
    if (typeof c.h === 'number' && c.h > 1.6 && c.h < 1e4) return c.h;
    return world.height(c.x, c.z) + guess;
  }

  /** Push a parked machine out of anything solid (walls, trunks, rocks). */
  function settle(px, pz, r) {
    const cols = worldCols || ctx.colliders;
    let ox = px, oz = pz;
    for (let it = 0; it < 6; it++) {
      let moved = false;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (!solidCol(c)) continue;
        if (c.box) {
          if (!(c.w > 0 && c.d > 0)) continue;
          const dx = ox - c.x, dz = oz - c.z;
          if (dx * dx + dz * dz > (c.w + c.d + r * 2) ** 2) continue;
          const cr = Math.cos(c.rot || 0), sr = Math.sin(c.rot || 0);
          const lx = dx * cr + dz * sr, lz = -dx * sr + dz * cr;
          const hw = c.w / 2 + r, hd = c.d / 2 + r;
          if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
            let nx = lx, nz = lz;
            if (hw - Math.abs(lx) < hd - Math.abs(lz)) nx = Math.sign(lx || 1) * hw; else nz = Math.sign(lz || 1) * hd;
            ox = c.x + nx * cr - nz * sr; oz = c.z + nx * sr + nz * cr; moved = true;
          }
        } else if (c.r > 0) {
          const dx = ox - c.x, dz = oz - c.z, rr = c.r + r;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-3; ox = c.x + dx / d * rr; oz = c.z + dz / d * rr; moved = true; }
        }
      }
      if (!moved) break;
    }
    return { x: ox, z: oz };
  }

  /** Low over a town: bounce off walls / big trunks instead of flying through them. */
  function bonk() {
    const cols = worldCols; if (!cols) return false;
    const feet = S.y - SEAT;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!solidCol(c)) continue;
      let nx = 0, nz = 0, hit = false, top = 0;
      const dx = S.x - c.x, dz = S.z - c.z;
      if (c.box) {
        if (!(c.w > 0 && c.d > 0)) continue;
        const reach = (c.w + c.d) * 0.5 + 1.6;
        if (dx * dx + dz * dz > reach * reach) continue;
        const cr = Math.cos(c.rot || 0), sr = Math.sin(c.rot || 0);
        const lx = dx * cr + dz * sr, lz = -dx * sr + dz * cr;
        const hw = c.w / 2 + 1.0, hd = c.d / 2 + 1.0;
        if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
          hit = true; top = colTop(c, clamp(Math.max(c.w, c.d) * 0.9, 4, 24));
          let ln = 0, lm2 = 0;
          if (hw - Math.abs(lx) < hd - Math.abs(lz)) ln = Math.sign(lx || 1); else lm2 = Math.sign(lz || 1);
          nx = ln * cr - lm2 * sr; nz = ln * sr + lm2 * cr;
        }
      } else if (c.r >= 1.1) {
        const rr = c.r + 1.0;
        if (dx * dx + dz * dz < rr * rr) {
          hit = true; top = colTop(c, clamp(c.r * 2.4, 4, 30));
          const d = Math.hypot(dx, dz) || 1e-3; nx = dx / d; nz = dz / d;
        }
      }
      if (!hit) continue;
      if (feet > top) continue;                                 // cleared the roof
      // BUMP OVER IT: push out, slide along the wall (never a U-turn), and hop
      // up toward the roofline — the machine scrambles over a house like a
      // startled hen instead of passing through it or ping-ponging off it
      S.x += nx * 0.8; S.z += nz * 0.8;
      let fx = Math.sin(S.yaw), fz = Math.cos(S.yaw);
      const dn = fx * nx + fz * nz;
      if (dn < -0.35) {
        fx -= dn * nx; fz -= dn * nz;
        if (fx * fx + fz * fz > 0.04) S.yaw = Math.atan2(fx, fz);
      }
      if (feet - world.height(S.x, S.z) < 4.5) {
        // coming in to land: a hedge or a wall just ends the roll-out early —
        // she stops beside it and settles, she does not bounce back up
        S.speed *= 0.25; S.vy = Math.min(S.vy, -1.5);
      } else {
        S.speed *= 0.8;
        S.vy = Math.max(S.vy, clamp((top - feet) * 0.9 + 2.5, 3, 7));
      }
      S.energy = Math.max(0, S.energy - 0.03);
      ctx.systems.camera?.shake?.(0.35, 0.3);
      P_DUST.x = S.x; P_DUST.y = S.y + 1.2; P_DUST.z = S.z; P_DUST.count = 10;
      parts()?.burst(P_DUST);
      if (!(warned & 8)) { warned |= 8; ui()?.toast('BONK. Fly over the roofs, not through them.', 3); }
      return true;
    }
    return false;
  }

  // Where the rider climbs down, in the machine's own frame (lx across the
  // wings, lz along the body), picked from the direction of the LENS: fore or
  // aft of the machine on the camera's side, nudged a little toward it. The
  // wings are lateral, so they can never be between the camera and her rider
  // (stepping off sideways put her under a spread wing, and the camera ghosted
  // half the machine). Only then the other spots.
  const STEP_OFF = [[1, 1, 1.2, 3.7], [-1, 1, 1.2, 3.7], [1, -1, 1.2, 3.7], [1, 1, 3.3, 1.2], [-1, 1, 3.3, 1.2], [-1, -1, 1.2, 3.7]];
  /** Bearing from (x, z) toward the lens: the camera's azimuth (it sits at
   *  target + (sin az, cos az) · d), or its live position as a fallback. */
  function camBearing(x, z) {
    const az = ctx.systems.camera?.params?.azimuth;
    if (Number.isFinite(az)) return az;
    const cp = ctx.camera.position;
    return Math.atan2(cp.x - x, cp.z - z);
  }
  function stepOff() {
    const az = camBearing(S.x, S.z), cx = Math.sin(az), cz = Math.cos(az);
    const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
    const sf = fx * cx + fz * cz >= 0 ? 1 : -1, sr = rx * cx + rz * cz >= 0 ? 1 : -1;
    for (const [kr, kf, ax, af] of STEP_OFF) {
      const lx = kr * sr * ax, lz = kf * sf * af;
      const px = S.x + rx * lx + fx * lz, pz = S.z + rz * lx + fz * lz;
      if (world.height(px, pz) > 0.35) return settle(px, pz, 0.5);
    }
    for (let r = 3; r <= 24; r += 1.5) {
      for (let a = 0; a < 12; a++) {
        const px = S.x + Math.cos(a * 0.5236) * r, pz = S.z + Math.sin(a * 0.5236) * r;
        if (world.height(px, pz) > 0.5) return settle(px, pz, 0.5);
      }
    }
    return { x: S.x, z: S.z };
  }

  function finishLanding() {
    const isl = world.islandAt(S.x, S.z);
    phase = null;
    endFlight();
    const off = stepOff();
    rider.unmount(off.x, off.z);
    worldCols = null;
    // park her clear of walls, on real ground (or floating on the lake)
    const pk = settle(S.x, S.z, 1.8);
    S.x = pk.x; S.z = pk.z; S.y = groundAt(S.x, S.z) + SEAT;
    resetFlight(); setFlyer();
    moveCollider(S.x, S.z);
    parkedT = 0;
    markMap();
    if (gate) { gate.enabled = true; gate.label = 'Fly the machine again'; }
    if (isl === 'candy' && fromCat) {
      fromCat = false;
      ui()?.card?.({ title: 'ESCAPED', body: 'You escaped Cat Island. For now.', buttons: [{ label: 'For now.' }] });
      ui()?.toast('The ornithopter lands on frosting. The book was right.', 5);
      api.success('flyer', { landing: { x: off.x, z: off.z } });
    } else if (isl === 'candy') {
      ui()?.toast('Landed on Candyland. E to take off again.', 4);
    } else {
      ui()?.toast('You landed. Technically. (E to fly again)', 4);
    }
  }

  function touchdown(g) {
    // hard contact bounces; gentle contact rolls to a stop
    if (S.vy < -7.5 && S.speed > 0) {
      S.y = g + SEAT + 0.05;
      S.vy = Math.min(-S.vy * 0.38, 5.5);
      S.speed *= 0.7; S.energy = Math.max(0, S.energy - 0.08);
      ctx.systems.camera?.shake?.(0.7, 0.4);
      P_DUST.x = S.x; P_DUST.y = g + 0.2; P_DUST.z = S.z; P_DUST.count = 24;
      parts()?.burst(P_DUST);
      if (!(warned & 16)) { warned |= 16; ui()?.toast('Ow. Pull up (W) before the ground, not after.', 3.5); }
      return;
    }
    phase = 'roll'; pt = 0;
    S.y = g + SEAT; S.vy = 0;
    ctx.state.flying = null;
    ctx.systems.camera?.shake?.(0.3, 0.3);
    P_DUST.x = S.x; P_DUST.y = g + 0.2; P_DUST.z = S.z; P_DUST.count = 18;
    parts()?.burst(P_DUST);
  }

  const route = {
    id: 'flyer',
    label: 'The Flying Machine',
    ready: () => true,
    get active() { return !!phase; },
    get phase() { return phase; },
    get state() { return S; },
    thermals,
    spot: PAD,

    /** Board. `quiet` (screenshot hooks only) skips the take-off fanfare. */
    start(quiet = false) {
      const pl = ctx.systems.player;
      if (!pl || phase || vehicleBusy(ctx)) return false;
      resetFlight();
      S.y = groundAt(S.x, S.z) + SEAT;          // she stays wherever she last landed
      setFlyer();
      phase = 'run'; pt = 0; airT = 0; milestone = 0; hold = false;
      fromCat = world.islandAt(S.x, S.z) === 'cat';
      if (fromCat && !quiet) api.start('flyer', { label: 'The Flying Machine' });
      if (!quiet) ui()?.banner('The Flying Machine', 'built by a cat who read one book');
      if (!quiet) ui()?.toast(touchUI
        ? 'A flaps · stick steers + pitches · B boosts · ride the warm air'
        : 'Space flaps · W/S pitch · A/D bank · Shift boost · ride the warm air', 5);
      // the machine's own circle must not shove her rider
      machineCol.solid = false;
      worldCols = ctx.colliders;
      rider.mount('flyer', S.x, S.y, S.z, 2.6);
      rider.pose('sit');
      flyer.userData.noFade = true; flyer.userData.noOcclude = true;
      if (gate) gate.enabled = false;
      hud.show(true);
      thermalMarkers(true);
      return true;
    },

    update(dt) {
      route.tick(dt);
      airflowUpdate(dt);
      apronUpdate();
    },

    tick(dt) {
      const t = ctx.state.elapsed;
      tU.uTime.value = t;
      tU.uNight.value = 1 - (ctx.state.daylight ?? 1);
      tU.uFly.value = damp(tU.uFly.value, phase === 'air' || phase === 'run' ? 1 : 0, 2, dt);
      const ch = ctx.renderer.domElement.height || 800;
      tU.uPx.value = ch * 0.5 / Math.tan(ctx.camera.fov * Math.PI / 360);

      if (!phase) {
        propSpin += dt * 0.35;
        flapPhase = Math.sin(t * 0.45) * 0.25;
        wingBeat = damp(wingBeat, 0, 3, dt);
        S.energy = Math.min(1, S.energy + F_.E_PARKED * dt);
        fold = damp(fold, Math.hypot(S.x - PAD.x, S.z - PAD.z) > 8 ? 1 : 0, 2.5, dt);
        setFlyer();
        sock.rotation.y = HOME_YAW + Math.sin(t * 0.5) * 0.35;
        sock.rotation.x = Math.sin(t * 1.9) * 0.14;
        helmet.rotation.z = Math.sin(t * 1.1) * 0.09;
        // abandoned away from the field → Wingnut tows her home after 60 s
        const away = Math.hypot(S.x - PAD.x, S.z - PAD.z) > 8;
        const p = ctx.systems.player?.position;
        if (away && p) {
          if (Math.hypot(p.x - S.x, p.z - S.z) > 18) parkedT += dt; else parkedT = 0;
          if (parkedT > 60) {
            goHome();
            if (gate) gate.label = 'Board the flying machine';
            ui()?.toast('Wingnut towed the flying machine back to Wing Nut Field.', 4);
          }
        }
        return;
      }
      pt += dt;

      const inp = ctx.input, keys = inp.keys;
      let ix = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      let iy = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      if (!ix && !iy && inp.virtual && (inp.virtual.x || inp.virtual.y)) { ix = clamp(inp.virtual.x, -1, 1); iy = clamp(inp.virtual.y, -1, 1); }
      const shiftNow = keys.has('ShiftLeft') || keys.has('ShiftRight');
      // touch: the joystick holds Shift past 0.85, so boost lives on the B button (KeyX)
      const boostReq = inp.pressed.has('KeyX') || (!touchUI &&
        (inp.pressed.has('ShiftLeft') || inp.pressed.has('ShiftRight') || (shiftNow && !shiftWas)));
      shiftWas = shiftNow;
      const flapReq = inp.pressed.has('Space');

      if (phase === 'run') {
        // pedal down the field: prop spins up, wings start beating; A/D steer
        const k = clamp(pt / 1.3, 0, 1);
        fold = damp(fold, 0, 6, dt);                 // wings open as she rolls
        propSpin += dt * (6 + k * 46);
        flapPhase += dt * (3 + k * 9);
        wingBeat = damp(wingBeat, k, 6, dt);
        S.yaw -= ix * 0.9 * dt;
        S.speed = F_.CRUISE * 0.9 * smoothstep(0, 1, k);
        S.x += Math.sin(S.yaw) * S.speed * dt; S.z += Math.cos(S.yaw) * S.speed * dt;
        S.y = Math.max(groundAt(S.x, S.z), 0.1) + SEAT;
        S.pitch = damp(S.pitch, -0.08, 4, dt);
        setFlyer();
        rider.place(S.x, S.y, S.z, S.yaw);
        if (pt > 0.55 && feather < t) {
          feather = t + 0.18;
          P_DUST.x = S.x; P_DUST.y = S.y - SEAT + 0.2; P_DUST.z = S.z; P_DUST.count = 3;
          parts()?.burst(P_DUST);
        }
        if (pt >= 1.3) {
          // a real hop off the grass, so one bump in the ground cannot end the flight
          phase = 'air'; pt = 0; airT = 0; S.vy = 6.4; S.y += 0.9; S.pitch = 0;
          ui()?.say('IT WORKS. Chapter One was RIGHT!', { speaker: 'Wingnut', duration: 3.0 });
          parts()?.sparkle(S.x, S.y + 2.4, S.z, CANDY.gummyYellow, 14);
        }
        hud.update(S, 0, 0);
        return;
      }

      if (phase === 'roll') {
        // gentle landing: roll to a stop along the ground, wings settling —
        // and stop dead against anything solid rather than roll through it
        S.speed = damp(S.speed, 0, 2.6, dt);
        const px = S.x, pz = S.z;
        S.x += Math.sin(S.yaw) * S.speed * dt; S.z += Math.cos(S.yaw) * S.speed * dt;
        if (world.height(S.x, S.z) < 0.35) { S.x = px; S.z = pz; S.speed = 0; }   // never roll off the beach
        const st = settle(S.x, S.z, 1.3);
        if (st.x !== S.x || st.z !== S.z) { S.x = st.x; S.z = st.z; S.speed = 0; }
        S.y = groundAt(S.x, S.z) + SEAT;
        S.pitch = damp(S.pitch, 0, 4, dt); S.bank = damp(S.bank, 0, 4, dt); tuck = damp(tuck, 0, 4, dt);
        wingBeat = damp(wingBeat, 0, 3, dt); flapPhase += dt * 3 * (S.speed / F_.CRUISE);
        propSpin += dt * S.speed * 2;
        setFlyer();
        rider.place(S.x, S.y, S.z, S.yaw);
        hud.update(S, 0, 0);
        if (S.speed < 0.6 || pt > 2.2) finishLanding();
        return;
      }

      if (phase === 'sink') {
        // in the drink: fade, then wake up back on the pad
        S.y = damp(S.y, -1.2, 2.4, dt);
        S.pitch = damp(S.pitch, 0.9, 3, dt);
        setFlyer();
        rider.place(S.x, Math.max(S.y, -0.6), S.z, S.yaw);
        if (pt > 1.0 && milestone >= 0) {
          milestone = -1;
          goHome();
          const off = stepOff();                 // on the lens's side of the pad, as on landing
          rider.unmount(off.x, off.z);
          worldCols = null;
          ctx.systems.camera?.snap?.();
          ui()?.fade?.(false, 0.5);
          ui()?.toast('The manual said nothing about water.', 5);
          phase = null;
          if (gate) { gate.enabled = true; gate.label = 'Board the flying machine'; }
        }
        return;
      }

      // ── airborne ────────────────────────────────────────────────────────
      airT += dt;
      fold = 0;
      let thNow = 0;
      if (hold) {
        // screenshot autopilot: hold position, keep everything else alive
        S.vy = 0; S.speed = F_.CRUISE; S.bank = damp(S.bank, 0, 3, dt);
        flapPhase += dt * 9; propSpin += dt * 34; wingBeat = damp(wingBeat, 0.45, 3, dt);
      } else {
        const th = thNow = thermalAt(S.x, S.z);
        stepFlight(S, ix, iy, flapReq, boostReq, th, dt);
        if (S.flapped) {
          wingBeat = 0.35 + bite(S.y) * 0.8;
          P_FLAP.x = S.x + Math.cos(S.yaw) * 4.2; P_FLAP.y = S.y + 1.9; P_FLAP.z = S.z - Math.sin(S.yaw) * 4.2;
          parts()?.burst(P_FLAP);
          parts()?.sparkle(S.x, S.y + 1.6, S.z, CANDY.gummyYellow, 5);
        }
        if (S.boosted) {
          ctx.systems.camera?.shake?.(0.25, 0.4);
          parts()?.sparkle(S.x, S.y + 1.2, S.z, 0xffffff, 16);
          if (!(warned & 1)) { warned |= 1; ui()?.toast('WHEEE. (Boost recharges in 12 s)', 2.5); }
        }
        if (th > 0.3 && thermalHere) {
          if (!thermalHere.seen) { thermalHere.seen = true; ui()?.toast('THERMAL ↑ ' + thermalHere.joke, 4); }
          if (t > warmT) {
            warmT = t + 0.12;
            P_WARM.x = S.x; P_WARM.y = S.y - 1.5; P_WARM.z = S.z;
            parts()?.burst(P_WARM);
          }
        }
        if (S.energy < 0.12 && !(warned & 2)) { warned |= 2; ui()?.toast('Legs like jelly. GLIDE to get your breath back, or find warm air.', 4); }
        if (S.energy > 0.5) warned &= ~2;
        if (S.y > 300 && !(warned & 4)) { warned |= 4; ui()?.toast('The air is thin up here. Even the book stops at 330.', 4); }
        tuck = damp(tuck, S.boostT > 0 ? 1 : 0, 6, dt);
        wingBeat = damp(wingBeat, S.sinceFlap > 1.2 ? 0.05 : 0.18, 3.2, dt);
        flapPhase += dt * ((S.sinceFlap > 1.2 ? 1.4 : 5.5) + wingBeat * 9);
        propSpin += dt * (24 + S.speed * 1.2);
      }
      const g = groundAt(S.x, S.z);
      const alt = S.y - SEAT - Math.max(g, 0);

      // soft bounds: past the edge of the world, bank back toward the islands
      const ex = S.x / 330, ez = S.z / 230;
      if (!hold && ex * ex + ez * ez > 1) {
        const want = Math.atan2(-S.x, -S.z);
        let d = want - S.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        S.yaw += clamp(d, -1, 1) * 1.1 * dt;
        if (!(warned & 32)) { warned |= 32; ui()?.toast('That way is the edge of the map. There is no map. Turning back.', 3.5); }
      } else if (ex * ex + ez * ez < 0.8) warned &= ~32;

      // low over rooftops: bounce off walls instead of flying through them
      if (!hold) { bonkCd -= dt; if (alt < 26 && bonkCd <= 0 && bonk()) bonkCd = 0.45; }

      setFlyer();
      rider.place(S.x, S.y, S.z, S.yaw);

      // the contract for the camera / map / everyone else
      FLY.alt = alt; FLY.y = S.y; FLY.speed = S.speed; FLY.vy = S.vy; FLY.energy = S.energy;
      FLY.heading = S.yaw; FLY.thermal = thNow; FLY.boost = S.boostT > 0;
      ctx.state.flying = FLY;
      fogUpdate();
      if (!camChecked && airT > 0.6) cameraCheck();
      cameraFollow(dt);
      hud.update(S, alt, FLY.thermal);

      // trailing sparkle so you can read the flight path from a distance
      if (t > feather) {
        feather = t + (S.boostT > 0 ? 0.05 : 0.14);
        const P = S.boostT > 0 ? P_BOOST : P_TRAIL;
        P.x = S.x; P.y = S.y + 0.7; P.z = S.z;
        parts()?.burst(P);
      }
      // hints when you cross the strait
      if (!hold && fromCat && milestone === 0 && S.x < 40) { milestone = 1; ui()?.toast('Open sea. Keep flapping, or glide.'); }
      if (!hold && fromCat && milestone === 1 && S.x < -30) { milestone = 2; ui()?.toast('Candyland below. Glide down and land anywhere.', 5); }

      if (hold || airT < 0.4) return;             // clearance window: no landing on take-off
      if (g <= 0.25 && S.y - SEAT <= 0.35) {       // the sea
        phase = 'sink'; pt = 0; milestone = 0;
        endFlight();
        parts()?.splash?.(S.x, 0.06, S.z, { count: 40, speed: 6.5, ringSize: 7 });
        ctx.systems.camera?.shake?.(0.8, 0.5);
        ui()?.fade?.(true, 0.55);
        return;
      }
      if (S.y - SEAT <= g + 0.15) touchdown(g);
    },

    stop() {
      if (!phase) return;
      phase = null;
      endFlight();
      if (rider.riding) rider.unmount(PAD.x, PAD.z);
      worldCols = null;
      goHome();
      if (gate) gate.enabled = true;
    },

    // ── debug / screenshot hooks (views call these through escape.routes.flyer) ──
    /** Put her in the air at (x, y, z) heading `yaw`; `holdPos` freezes her there. */
    debugFly(x, z, y = 150, yaw = -Math.PI / 2, holdPos = true) {
      if (!phase && !route.start(true)) return false;
      phase = 'air'; pt = 1; airT = 0; hold = !!holdPos;
      // a screenshot flight is a moment deep into a flight, not a take-off:
      // no escape bookkeeping, no take-off chatter still on screen, and the
      // wings caught at a beat that depends on where she is (so two views
      // never show the identical pose)
      fromCat = false; milestone = 0;
      try { ui()?.clear?.(); } catch (e) { /* optional */ }
      flapPhase = ((x * 0.37 + z * 0.23 + y * 0.051) % 6.2832 + 6.2832) % 6.2832;
      wingBeat = 0.45;
      S.x = x; S.z = z; S.y = y; S.yaw = yaw; S.vy = 0; S.speed = F_.CRUISE; S.energy = 0.72;
      setFlyer(); rider.place(S.x, S.y, S.z, S.yaw);
      // publish the flight BEFORE snapping, so the camera snaps to flight framing
      FLY.alt = S.y - SEAT - Math.max(groundAt(S.x, S.z), 0); FLY.y = S.y; FLY.speed = S.speed; FLY.vy = 0;
      FLY.energy = S.energy; FLY.heading = S.yaw; FLY.thermal = 0; FLY.boost = false;
      ctx.state.flying = FLY;
      ctx.systems.camera?.snap?.();
      return true;
    },
    /** Release the screenshot hold (the machine flies on from where she is). */
    debugRelease() { hold = false; },
    /** Park her at (x, z) as if she had just landed there. */
    debugPark(x, z, yaw = HOME_YAW) {
      if (phase) route.stop();
      S.x = x; S.z = z; S.yaw = yaw;
      const pk = settle(x, z, 1.8); S.x = pk.x; S.z = pk.z; S.y = groundAt(S.x, S.z) + SEAT;
      resetFlight(); setFlyer(); moveCollider(S.x, S.z); markMap();
      const off = stepOff();
      ctx.systems.player?.teleport?.(off.x, off.z);
      if (gate) gate.label = 'Fly the machine again';
      return { x: S.x, z: S.z };
    },
  };

  api.register('flyer', route);
  console.warn('[escape/flyer]', JSON.stringify({
    pad: [+PAD.x.toFixed(1), +PAD.z.toFixed(1)], clear: +(clear.clear ?? 0).toFixed(2),
    span: 11.2, ceiling: F_.CEIL, cruise: F_.CRUISE, thermals: thermals.map((t) => [t.id, t.x, t.z]), meshes: 15, apron: !!domeU,
  }));
  return route;
}

// ── HUD: altitude tape + energy bar + boost chip (own DOM, own <style>) ─────
function makeHud(ctx) {
  const root = ctx.uiRoot;
  if (!root || typeof document === 'undefined') return { show() {}, update() {} };
  if (!document.getElementById('fly-hud-style')) {
    const st = document.createElement('style');
    st.id = 'fly-hud-style';
    st.textContent = `
#ui .fly-hud { position: fixed; left: 14px; top: 50%; z-index: 4; display: flex; gap: 9px; padding: 8px 10px 8px 8px;
  background: linear-gradient(180deg, rgba(255,250,241,.88), rgba(255,238,219,.84)); border: 2.5px solid var(--edge, #2b2442);
  border-radius: 14px; box-shadow: var(--lift, 0 3px 0 rgba(43,36,66,.34), 0 10px 24px rgba(14,8,26,.4)); color: var(--ink, #2f2748);
  font-family: var(--fbody, "Nunito", "Trebuchet MS", system-ui, sans-serif); pointer-events: none !important;
  transform: translate(-130%, -50%); opacity: 0; transition: transform .35s cubic-bezier(.2,.9,.3,1.15), opacity .25s; }
#ui .fly-hud * { pointer-events: none !important; }
#ui .fly-hud.on { transform: translate(0, -50%); opacity: 1; }
#ui .fly-tape { position: relative; width: 14px; height: 124px; border: 2.5px solid var(--edge, #2b2442); border-radius: 10px; overflow: hidden;
  background: linear-gradient(0deg, #9fdcf0 0%, #cdeefa 45%, #efe6ff 88%, #f7d9ea 100%); }
#ui .fly-ceil { position: absolute; left: 0; right: 0; top: 0; height: 8.3%; border-bottom: 2px solid var(--pink, #ef4f84);
  background: repeating-linear-gradient(45deg, rgba(47,39,72,.32) 0 3px, transparent 3px 7px); }
#ui .fly-tick { position: absolute; left: 0; width: 6px; height: 2px; background: rgba(47,39,72,.45); }
#ui .fly-mark { position: absolute; left: -3px; right: -3px; height: 6px; margin-bottom: -3px; bottom: 0; border-radius: 3px;
  background: var(--pink, #ef4f84); border: 1.5px solid var(--edge, #2b2442); }
#ui .fly-col { display: flex; flex-direction: column; justify-content: space-between; min-width: 92px; }
#ui .fly-eb { font: 800 8.5px/1 var(--fbody, sans-serif); letter-spacing: .16em; text-transform: uppercase; color: var(--ink-soft, #6d5f86); }
#ui .fly-alt b { display: block; font: 800 25px/0.95 var(--fdisp, "Baloo 2", sans-serif); color: var(--ink, #2f2748); margin-top: 3px; }
#ui .fly-alt b small { font-size: 11px; margin-left: 2px; color: var(--ink-soft, #6d5f86); }
#ui .fly-vs { font: 800 10px/1 var(--fbody, sans-serif); color: var(--ink-soft, #6d5f86); margin-top: 2px; }
#ui .fly-bar { position: relative; height: 10px; margin-top: 4px; border: 2px solid var(--edge, #2b2442); border-radius: 999px; overflow: hidden; background: #efe3d4; }
#ui .fly-bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: 0 50%;
  background: linear-gradient(90deg, #ffb13b, #ffd84a 60%, #fff08a); }
#ui .fly-bar.low i { background: linear-gradient(90deg, #ef4f84, #ff8a6a); }
#ui .fly-boost { display: flex; align-items: center; gap: 5px; margin-top: 5px; font: 800 10px/1 var(--fbody, sans-serif); letter-spacing: .08em; }
#ui .fly-key { min-width: 30px; height: 16px; padding: 0 5px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  border: 2px solid var(--edge, #2b2442); border-radius: 6px; background: #fff; box-shadow: 0 2px 0 var(--edge, #2b2442); font: 800 9px/1 var(--fbody, sans-serif); }
#ui .fly-cd { position: relative; flex: 1; height: 7px; border-radius: 999px; background: #e6d8c8; overflow: hidden; }
#ui .fly-cd i { position: absolute; inset: 0; transform-origin: 0 50%; background: var(--teal, #1f8b86); }
#ui .fly-boost.ready .fly-key { background: var(--gold, #ffc94a); }
#ui .fly-therm { margin-top: 5px; padding: 3px 6px; border-radius: 999px; border: 2px solid var(--edge, #2b2442); background: #ffe3ae;
  font: 800 10px/1 var(--fbody, sans-serif); letter-spacing: .1em; text-align: center; opacity: 0; transition: opacity .2s; }
#ui .fly-therm.on { opacity: 1; }
@media (max-height: 520px), (max-width: 640px) {
  #ui .fly-hud { left: 8px; top: 42%; transform: translate(-130%, -50%) scale(.72); transform-origin: 0 50%; }
  #ui .fly-hud.on { transform: translate(0, -50%) scale(.72); }
}`;
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'cci fly-hud';
  el.setAttribute('aria-hidden', 'true');
  const ticks = [60, 120, 180, 240, 300].map((v) => `<i class="fly-tick" style="bottom:${(v / 360 * 100).toFixed(1)}%"></i>`).join('');
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  el.innerHTML = `<div class="fly-tape"><div class="fly-ceil"></div>${ticks}<i class="fly-mark"></i></div>
<div class="fly-col">
  <div class="fly-alt"><span class="fly-eb">Altitude</span><b>0<small>u</small></b><div class="fly-vs">level</div></div>
  <div><span class="fly-eb">Energy</span><div class="fly-bar"><i></i></div></div>
  <div class="fly-boost"><span class="fly-key">${touch ? 'B' : 'SHIFT'}</span><div class="fly-cd"><i></i></div></div>
  <div class="fly-therm">Thermal ↑</div>
</div>`;
  root.appendChild(el);
  const mark = el.querySelector('.fly-mark');
  const num = el.querySelector('.fly-alt b');
  const vs = el.querySelector('.fly-vs');
  const bar = el.querySelector('.fly-bar'), fill = bar.querySelector('i');
  const boost = el.querySelector('.fly-boost'), cd = el.querySelector('.fly-cd i');
  const therm = el.querySelector('.fly-therm');
  let on = false, lastAlt = -1, lastMark = -1, lastE = -1, lastCd = -1, lastVs = '', low = false, ready = null, thOn = false;
  return {
    show(v) { if (v !== on) { on = v; el.classList.toggle('on', v); } },
    update(S, alt, th) {
      if (!on) return;
      const a = Math.max(0, Math.round(S.y));
      if (a !== lastAlt) { lastAlt = a; num.firstChild.nodeValue = String(a); }
      const m = Math.round(clamp(S.y / 360, 0, 1) * 1000) / 10;
      if (m !== lastMark) { lastMark = m; mark.style.bottom = m + '%'; }
      const w = S.vy > 1.2 ? 'climbing' : S.vy < -4 ? 'diving' : S.vy < -0.8 ? 'gliding' : 'level';
      if (w !== lastVs) { lastVs = w; vs.firstChild.nodeValue = w; }
      const e = Math.round(S.energy * 100) / 100;
      if (e !== lastE) { lastE = e; fill.style.transform = 'scaleX(' + e + ')'; }
      if ((S.energy < 0.2) !== low) { low = S.energy < 0.2; bar.classList.toggle('low', low); }
      const c = Math.round((1 - S.boostCd / FLIGHT.BOOST_CD) * 50) / 50;
      if (c !== lastCd) { lastCd = c; cd.style.transform = 'scaleX(' + c + ')'; }
      if ((S.boostCd <= 0) !== ready) { ready = S.boostCd <= 0; boost.classList.toggle('ready', ready); }
      if ((th > 0.3) !== thOn) { thOn = th > 0.3; therm.classList.toggle('on', thOn); }
    },
  };
}
