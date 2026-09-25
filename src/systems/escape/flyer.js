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
//   Leave her more than 120 u from you for 60 s and Wingnut tows her back to
//   the field (wave 4: close by, she waits for you; she is the ride home).
//
//   route API (ctx.systems.escape.routes.flyer): start() · stop() · active ·
//   phase ('run'|'air'|'roll'|'sink'|null) · state (the flight state) ·
//   thermals · spot · home {x, z, y, yaw, deck} · contacts {bonk, hard} ·
//   parked {t, away, dist} · corridor(opts) · debugCorridorShow(on) ·
//   debugFly(x, z, y, yaw, hold) · debugRelease() · debugPark(x, z, yaw).
//   Exported: FLIGHT (tuning), RUNWAY, stepFlight(), climbProfile(), bite(),
//   THERMAL_SITES. Events: 'flyer:contact' {kind:'bonk'|'hard', x, y, z}.
//   Map markers: 'flyer' (glyph plane) always, 'thermal_<id>' while airborne.
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
// WAVE 4 — Contract L, THE RUNWAY POINTS AT CANDYLAND. The take-off corridor
// (a 90 u × 26 u box along the runway whose floor climbs at her REAL climb
// rate: stepFlight with W held and a flap every 0.35 s) was measured against
// every collider and world.height for every bearing within ±30° of the true
// bearing to Sugar Pier (-50, 26), and for pads slid up to 12 u around Wing Nut
// Field. From the old pad (210.4, 10.1) no bearing was clear without help: a
// Whisker Heights house (190, 20, roof 15.7) sat 7–12 u off the centreline at
// 8–15 u out, where she is still on the grass, and Purrliament's teal tower
// (168.5, -0.5, 35 u) stood dead ahead of anything between -10° and -20°.
// Starting the roll 4 u further back (east) lifts her 7 u clear over the
// house, so the runway now points EXACTLY at Sugar Pier (0°) and threads the
// gap between the house and the tower: no fixed collider comes within 3 u of
// the climb line anywhere in the box, and nothing tall enough to matter lies
// within 16 u of the centreline. The field is re-laid for it: the workshop,
// sign and windsock sit behind the start, the bunting and the marker cones
// line the box edges (±13.9 u), the plank runway is a walkable deck, a
// "TAKE-OFF" arrow is painted on it (luminous after dark, with runway lamps),
// and the clearance claim is the corridor itself (26 u wide, from 10 u behind
// the start to 36 u out; beyond that she is 40+ u up). route.corridor()
// re-runs the measurement live; route.debugCorridorShow(true) draws it.
// Wingnut now tows her home only when she has been left more than 120 u from
// the visitor for 60 s, so a machine parked on Candyland is the ride back.
// Both directions fire the shared escape events (see finishLanding).
//
// WAVE 4 polish ("a fun game with a scary side"): the plank runway is twice
// as long (level to 13 u, then down the field's dip to 28.6 u) with a candy-
// stripe centreline, piano-key thresholds and the lettering moved past the
// wingtips; a three-cat ground crew with flags and glowing wands; tall grass
// and wildflowers down both edges (the claim had mown the strip bare); runway
// lamps that throw warm pools of light after dark with a chase running toward
// the far end; and at night, from the field only, THE WATCHER: a cat's head
// the size of a house that rises over Main Street's roofs at the end of the
// runway and looks at you with amber eyes, and sinks away when you take off
// or walk toward it. Gliding, the wings now hold out nearly flat.
//
// Draw calls: frame · crank · wing×2 · prop · airflow (ribbons + streaks, in
//   flight only) · field · sock · helmet · cat · signpost · sign · runway
//   paint (lettering, arrow, centreline, lamps) · sway (crew arms + flags,
//   grass, flowers) · thermal motes · thermal shells · horizon apron (lens
//   above 45 u only) = 17 by day; + runway glow (after lamps-on) + the
//   watcher (night, lens at the field) = 19
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAT, CANDY } from '../../core/palette.js';
import { clamp, damp, smoothstep, rng, hash } from '../../core/util.js';
import { B, catGeo, signMesh } from './parts.js';
import { createRider, vehicleBusy, clearanceClaim } from './ride.js';

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

// ── WAVE 4: the runway (measured; see the header and route.corridor()) ─────
export const RUNWAY = {
  PAD: { x: 214.2, z: 6.3 },      // where she rests and the roll starts
  TARGET: { x: -50, z: 26 },      // Sugar Pier: the runway points straight at it
  LEN: 90, WIDTH: 26, MARGIN: 3,  // the take-off corridor box, and the clearance it must keep
  CLAIM: [-10, 36],               // nature cleared (local z) from behind the workshop to 36 u out
  EDGE: 13.9,                     // bunting + marker cones, just outside the box
};

/**
 * Her real climb out of Wing Nut Field, as a pure function of the flight
 * model: the take-off roll exactly as tick() runs it (1.3 s of pedalling, then
 * the 0.9 u hop at vy 6.4), then stepFlight() with pitch `inY` held and a flap
 * every `flapEvery` s (counted from the moment E is pressed). Returns a flat
 * array [a0, h0, a1, h1, ...]: ground distance along the heading → feet above
 * the deck.
 */
export function climbProfile(flapEvery = 0.35, inY = 1, len = 140, dt = 1 / 30) {
  const out = [];
  let t = 0, pt = 0, a = 0;
  while (pt < 1.3) {
    pt += dt; t += dt;
    const k = clamp(pt / 1.3, 0, 1);
    a += F_.CRUISE * 0.9 * smoothstep(0, 1, k) * dt;
    out.push(a, 0);
  }
  const P = { x: 0, y: 0.9, z: a, yaw: 0, vy: 6.4, speed: F_.CRUISE * 0.9, pitch: 0, turn: 0, bank: 0,
    energy: 1, boostT: 0, boostCd: 0, flapCd: 0, sinceFlap: 9, flapped: false, boosted: false };
  let beat = Math.floor(t / flapEvery);
  for (let i = 0; i < 4000 && P.z < len; i++) {
    t += dt;
    const b = Math.floor(t / flapEvery);
    stepFlight(P, 0, inY, b !== beat, false, 0, dt);
    beat = b;
    out.push(P.z, Math.max(0, P.y));
  }
  return out;
}
/** Feet height (above the deck) at ground distance `a` on a climbProfile(). */
export function profileAt(prof, a) {
  if (!(a > 0)) return 0;
  for (let i = 0; i < prof.length; i += 2) if (prof[i] >= a) return prof[i + 1];
  return prof[prof.length - 1];
}

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
  // WAVE 4: the pad is a MEASURED spot, not a search (a clearSpot() hunt used
  // to wander a metre or two with every change to the vegetation), and the
  // runway points straight at Sugar Pier from it.
  const PAD = { x: RUNWAY.PAD.x, z: RUNWAY.PAD.z, y: world.height(RUNWAY.PAD.x, RUNWAY.PAD.z) };
  const HOME_YAW = Math.atan2(RUNWAY.TARGET.x - PAD.x, RUNWAY.TARGET.z - PAD.z);

  const rider = createRider(ctx);
  // createRider pushed its seat walkable last; our own ground probe skips it
  const riderWalk = ctx.walkables[ctx.walkables.length - 1];
  /** local (x, z) on the pad → world (the pad is rotated to HOME_YAW). */
  const CY = Math.cos(HOME_YAW), SY = Math.sin(HOME_YAW);
  const locX = (lx, lz) => PAD.x + CY * lx + SY * lz;
  const locZ = (lx, lz) => PAD.z - SY * lx + CY * lz;
  /** world → pad-local lateral (x) and along-runway (z) */
  const toLX = (dx, dz) => CY * dx - SY * dz;
  const toLZ = (dx, dz) => SY * dx + CY * dz;
  /** terrain under a pad-local point, relative to the pad */
  const locH = (lx, lz) => world.height(locX(lx, lz), locZ(lx, lz)) - PAD.y;

  // ── the runway deck: planks you (and she) roll on ─────────────────────────
  // Wave-4 polish: TWICE as long (to 28.6 u, most of the way to Purrliament's
  // tower), so the field reads as a runway instead of a jetty with grass
  // after it. The first 16 u (to z = 13, as the old deck + kicker did) are
  // level at the highest ground under them: she hops at ~7.3 u, so the roll
  // the corridor was measured for is unchanged, and the lettering lies flat
  // where the runway camera can read it. Past that the field dips ~2 u and
  // the planks ramp down it (never steeper than SLOPE) and then follow the
  // grass to the end. It is a ctx.walkables deck (Contract A): the visitor
  // walks ON it and the machine's take-off roll follows it.
  // (the back end stops 1.5 u behind her tail: Not-An-Exit Beach's sign forest
  // starts just behind it, and THE CURRENT IS BAD should not stand on a plank)
  const RW0 = -3.4, RW1 = 28.6, RWW = 4.4, Z_LEVEL = 13.0, SLOPE = 0.26, DSTEP = 0.5;
  let deckTop = 0;
  for (let lz = RW0; lz <= Z_LEVEL + 1e-6; lz += 0.8) for (let lx = -RWW / 2; lx <= RWW / 2 + 1e-6; lx += RWW / 4) deckTop = Math.max(deckTop, locH(lx, lz));
  const DECK = deckTop + 0.14;                       // plank top of the level part, above PAD.y
  const NPROF = Math.round((RW1 - RW0) / DSTEP) + 1;
  const PROF = new Float32Array(NPROF), GLO = new Float32Array(NPROF);
  for (let i = 0; i < NPROF; i++) {
    const z = RW0 + i * DSTEP;
    let g = -Infinity;
    for (let lx = -RWW / 2 - 0.2; lx <= RWW / 2 + 0.2 + 1e-6; lx += (RWW + 0.4) / 4) for (let dz = -0.4; dz <= 0.41; dz += 0.4) g = Math.max(g, locH(lx, z + dz));
    GLO[i] = g + 0.14;
    PROF[i] = z <= Z_LEVEL ? DECK : Math.max(GLO[i], DECK - (z - Z_LEVEL) * SLOPE);
  }
  for (let pass = 0; pass < 3; pass++) {           // ease the ground-following part, never into the grass
    for (let i = 1; i < NPROF - 1; i++) if (RW0 + i * DSTEP > Z_LEVEL + DSTEP) PROF[i] = Math.max(GLO[i], (PROF[i - 1] + 2 * PROF[i] + PROF[i + 1]) / 4);
  }
  /** plank top (above PAD.y) at pad-local z */
  const deckAt = (lz) => {
    if (lz <= Z_LEVEL) return DECK;
    const f = clamp((lz - RW0) / DSTEP, 0, NPROF - 1), i = Math.min(NPROF - 2, Math.floor(f));
    return PROF[i] + (PROF[i + 1] - PROF[i]) * (f - i);
  };
  const slopeAt = (lz) => (deckAt(lz + 0.25) - deckAt(lz - 0.25)) / 0.5;
  const runwayWalk = {
    test(x, z) {
      const dx = x - PAD.x, dz = z - PAD.z;
      if (dx * dx + dz * dz > 1060) return null;     // cheap reject (the deck is ≤ 32.5 u from the pad)
      const lx = toLX(dx, dz); if (lx < -RWW / 2 - 0.1 || lx > RWW / 2 + 0.1) return null;
      const lz = toLZ(dx, dz); if (lz < RW0 - 0.1 || lz > RW1 + 0.1) return null;
      return PAD.y + deckAt(lz);
    },
  };
  ctx.walkables.push(runwayWalk);

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

  // ── the field (wave 4 re-lay) ──────────────────────────────────────────────
  // Pad-local frame: +z runs down the runway toward Sugar Pier, +x is the
  // Whisker Heights (south) side. Nothing solid lies in the take-off box
  // (|x| < 13, z > 0) where she is still low: Wingnut's workshop, the sign and
  // the windsock sit BEHIND the start, the bunting, the marker cones and two
  // of the ground crew stand just outside the box edges, the grass and the
  // flowers have no colliders, and the marshaller stands past the end of the
  // planks (33 u out), where route.corridor() has her 38 u above his hat.
  const EDGE = RUNWAY.EDGE;
  const own = (c, tag) => { c.tag = 'flyer:' + tag; ctx.colliders.push(c); return c; };
  const gb = new B();
  // Wingnut's workshop: behind the start on the south side, the one corner
  // of the field the beach's sign forest leaves free, and the foreground of
  // the default camera, so he watches his runway with you
  const WS = { x: 5.2, z: -6.6 };
  const wsy = (dx, dz) => locH(WS.x + dx, WS.z + dz);
  gb.box(2.4, 0.16, 1.1, WOOD, WS.x, wsy(0, 0) + 0.95, WS.z);                              // bench top
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.16, 1.3, 0.16, 0x6b4126, WS.x + sx * 1.0, wsy(sx, sz * 0.4) + 0.3, WS.z + sz * 0.42);
  gb.box(0.9, 0.7, 0.9, WOOD, WS.x - 2.1, wsy(-2.1, 0.6) + 0.35, WS.z + 0.6);               // crate
  gb.box(0.62, 0.10, 0.46, 0xf3ead8, WS.x - 2.1, wsy(-2.1, 0.6) + 0.76, WS.z + 0.6, 0, 0.3); // THE book
  gb.box(0.62, 0.06, 0.46, CANDY.gummyBlue, WS.x - 2.1, wsy(-2.1, 0.6) + 0.70, WS.z + 0.6, 0, 0.3);
  gb.cyl(0.34, 0.30, 0.5, 8, STEEL, WS.x + 1.9, wsy(1.9, -1.1) + 0.25, WS.z - 1.1);          // paint tin
  gb.cyl(0.09, 0.09, 1.9, 6, STEEL, WS.x + 2.4, wsy(2.4, 0.9) + 0.75, WS.z + 0.9);           // helmet peg
  for (let i = 0; i < 7; i++) {                                                             // scattered wing nuts
    const a = i * 1.7, wx = WS.x + Math.cos(a) * (1.6 + i * 0.3), wz = WS.z + Math.sin(a) * (1.8 + i * 0.25);
    gb.torus(0.16, 0.06, 4, 6, CANDY.gummyYellow, wx, locH(wx, wz) + 0.1, wz, Math.PI / 2);
  }
  // windsock pole, behind the start on the north side
  const SOCK = { x: -8.6, z: -1.6 };
  gb.cyl(0.13, 0.16, 4.6, 6, WOOD, SOCK.x, locH(SOCK.x, SOCK.z) + 2.3, SOCK.z);
  // THE RUNWAY: a hand-built plank deck (warm boards in three tones laid across
  // the run, each tilted to the deck's slope; red edge boards; a candy-striped
  // skirt down into the grass wherever the field falls away), no grass poking
  // through anywhere along its 32 u.
  for (let z = RW0 + 0.26, i = 0; z < RW1 - 0.1; z += 0.52, i++) {                          // the planks
    const tone = i % 3 === 0 ? 0xd9a064 : i % 3 === 1 ? 0xc98a4e : 0xe0ae72;
    gb.box(RWW, 0.16, 0.5, tone, 0, deckAt(z) - 0.08, z, -Math.atan(slopeAt(z)));
  }
  for (let z0 = RW0; z0 < RW1 - 1e-3; z0 += 2) {                                            // the bed, sunk into the slope
    const z1 = Math.min(RW1, z0 + 2), zc = (z0 + z1) / 2, top = deckAt(zc) - 0.12;
    let gmin = Infinity;
    for (let lz = z0; lz <= z1 + 1e-6; lz += 0.5) for (let lx = -RWW / 2; lx <= RWW / 2 + 1e-6; lx += RWW / 2) gmin = Math.min(gmin, locH(lx, lz));
    const h = Math.max(0.3, top - gmin + 0.5);
    gb.box(RWW - 0.2, h, z1 - z0 + 0.05, 0x6e4326, 0, top - h / 2, zc, -Math.atan(slopeAt(zc)));
  }
  for (const s of [-1, 1]) {
    for (let z0 = RW0; z0 < RW1 - 1e-3; z0 += 1) {                                          // red edge boards
      const zc = (z0 + Math.min(RW1, z0 + 1)) / 2;
      gb.box(0.22, 0.24, Math.min(RW1, z0 + 1) - z0 + 0.03, RIB, s * (RWW / 2 + 0.08), deckAt(zc) - 0.06, zc, -Math.atan(slopeAt(zc)));
    }
    for (let z = RW0 + 0.35, i = 0; z < RW1; z += 0.7, i++) {                               // the striped skirt
      const top = deckAt(z) - 0.1;
      const g = Math.min(locH(s * (RWW / 2 + 0.2), z - 0.33), locH(s * (RWW / 2 + 0.2), z + 0.33));
      const h = Math.max(0.16, top - g + 0.35);
      gb.box(0.08, h, 0.66, i % 2 ? 0xfff3de : RIB, s * (RWW / 2 + 0.2), top - h / 2, z);
    }
  }
  for (const e of [RW0, RW1]) {
    const top = deckAt(e) - 0.1, ez = e + Math.sign(e) * 0.14;
    for (let x = -RWW / 2 + 0.35, i = 0; x < RWW / 2; x += 0.7, i++) {
      const h = Math.max(0.16, top - locH(x, ez) + 0.35);
      gb.box(0.66, h, 0.08, i % 2 ? 0xfff3de : RIB, x, top - h / 2, ez);
    }
  }
  gb.box(RWW - 0.3, 0.1, 0.22, CANDY.gummyYellow, 0, deckAt(RW1) + 0.01, RW1 - 0.12);       // the yellow nose board
  gb.box(RWW - 0.3, 0.1, 0.22, CANDY.gummyYellow, 0, DECK + 0.01, RW0 + 0.12);              // …and the tail board

  // Placement guard for everything new on the field: clear of every solid
  // world collider that will still be standing after the corridor claim mows
  // the strip (small circles inside the claim are nature it is about to blank).
  const CLAIM_HALF = RUNWAY.WIDTH / 2 + 1.5;
  function clearOf(lx, lz, r) {
    const wx = locX(lx, lz), wz = locZ(lx, lz);
    const cols = ctx.colliders;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!c || c.claim || c.solid === false || (typeof c.tag === 'string' && c.tag.startsWith('flyer:'))) continue;
      if (typeof c.h === 'number' && c.h < -50) continue;
      const dx = wx - c.x, dz = wz - c.z;
      if (c.box) {
        if (!(c.w > 0 && c.d > 0)) continue;
        const cr = Math.cos(c.rot || 0), sr = Math.sin(c.rot || 0);
        if (Math.abs(dx * cr + dz * sr) < c.w / 2 + r && Math.abs(-dx * sr + dz * cr) < c.d / 2 + r) return false;
      } else if (c.r > 0.05) {
        if (c.r < 1.2) {
          const clx = toLX(c.x - PAD.x, c.z - PAD.z), clz = toLZ(c.x - PAD.x, c.z - PAD.z);
          if (Math.abs(clx) < CLAIM_HALF && clz > RUNWAY.CLAIM[0] - 1.5 && clz < RUNWAY.CLAIM[1] + 1.5) continue;
        }
        if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return false;
      }
    }
    return true;
  }

  // BUNTING down both edges of the take-off box: painted poles, sagging
  // strings, candy pennants. It marks the zone the corridor keeps clear. The
  // north line now runs the length of the new runway; the south line stops
  // where Whisker Heights' front garden (a tree, then a house) takes over.
  const FLAGS = [CANDY.gummyRed, CANDY.gummyYellow, CANDY.gummyBlue, CANDY.gummyGreen, CANDY.gummyOrange, CANDY.gummyPurple];
  const POLE_ALL = [-2.6, 3.4, 9.4, 15.4, 21.4, 27.4], POLE_H = 3.1, SAG = 0.6;
  const poles = [];
  for (const s of [-1, 1]) {
    const px = s * EDGE;
    const pz = [];
    for (const z of POLE_ALL) { if (!clearOf(px, z, 0.9)) break; pz.push(z); }
    const gy = pz.map((z) => locH(px, z));
    for (let k = 0; k < pz.length; k++) {
      const y0 = gy[k];
      gb.cyl(0.10, 0.12, POLE_H + 0.9, 6, 0xfff3de, px, y0 + POLE_H / 2 - 0.45, pz[k]);
      gb.cyl(0.13, 0.13, 0.34, 6, RIB, px, y0 + POLE_H * 0.55, pz[k]);
      gb.cyl(0.13, 0.13, 0.34, 6, RIB, px, y0 + POLE_H * 0.25, pz[k]);
      gb.sph(0.2, 6, 5, RIB, px, y0 + POLE_H + 0.05, pz[k]);
      poles.push([px, pz[k]]);
    }
    for (let k = 0; k < pz.length - 1; k++) {
      const z0 = pz[k], z1 = pz[k + 1], ya = gy[k], yb = gy[k + 1];
      const yAt = (t) => ya + (yb - ya) * t + POLE_H - 0.1 - SAG * 4 * t * (1 - t);
      for (let j = 0; j < 4; j++) {
        const ta = j / 4, tb = (j + 1) / 4;
        gb.beam([px, yAt(ta), z0 + (z1 - z0) * ta], [px, yAt(tb), z0 + (z1 - z0) * tb], 0.05, 0x5a3a22);
      }
      for (let f = 0; f < 7; f++) {
        const t = (f + 0.5) / 7;
        gb.add(new THREE.ConeGeometry(0.3, 0.62, 3), FLAGS[(f + k * 2 + (s > 0 ? 3 : 0)) % FLAGS.length],
          px, yAt(t) - 0.33, z0 + (z1 - z0) * t, Math.PI, 0, 0, [0.22, 1, 1]);
      }
    }
  }
  // MARKER CONES carry the edges on past the bunting to the end of the mown
  // strip: candy-striped, knee-high, the last pair wearing a little flag.
  const cones = [];
  for (const s of [-1, 1]) for (const czl of [32.5, RUNWAY.CLAIM[1]]) {
    const cxl = s * EDGE;
    if (!clearOf(cxl, czl, 0.8)) continue;
    const y0 = locH(cxl, czl);
    gb.cyl(0.46, 0.5, 0.12, 8, 0xfff3de, cxl, y0 + 0.06, czl);
    gb.cone(0.38, 0.9, 8, CANDY.gummyOrange, cxl, y0 + 0.55, czl);
    gb.cyl(0.25, 0.3, 0.16, 8, 0xfffaf0, cxl, y0 + 0.5, czl);
    if (czl === RUNWAY.CLAIM[1]) {
      gb.cyl(0.05, 0.05, 1.5, 5, 0x5a3a22, cxl, y0 + 1.5, czl);
      gb.add(new THREE.ConeGeometry(0.34, 0.9, 3), CANDY.gummyRed, cxl, y0 + 2.0, czl + 0.45, Math.PI / 2, 0, 0, [0.22, 1, 1]);
    }
    cones.push([cxl, czl]);
  }

  // THE GROUND CREW: three cats in hi-vis who take the job extremely
  // seriously. Two flag cats just outside the north edge of the box (the
  // starter with a chequered flag, then one with a red flag; the south edge
  // is Whisker Heights' gardens) and a marshaller past the far end with two
  // wands that glow after dark. Bodies are static (here, in the field mesh);
  // their arms, poles, flags and wands are in the SWAY mesh below and move.
  const CREW_S = 1.35;
  const CREW = [
    { x: -15.0, z: 9.0, fur: CAT.furOrange, stripe: 0xb05a1c, kind: 'check' },
    { x: -15.0, z: 21.5, fur: CAT.furGrey, stripe: 0x55565e, kind: 'red' },
    { x: 0, z: 33.4, fur: CAT.furCalico, stripe: 0x8a5a2a, kind: 'wands' },
  ];
  for (const c of CREW) {
    for (let k = 0; k < 8 && !clearOf(c.x, c.z, 0.8); k++) c.z += c.kind === 'wands' ? -0.8 : 1.0;
    c.y = locH(c.x, c.z);
    // face the machine (and the lens behind her), turned a little toward the
    // runway, so the flags held out over the grass face down the field
    c.face = c.kind === 'wands' ? Math.PI : Math.PI - 0.35 * Math.sign(-c.x);
    const cb = catGeo(c.fur, 'sit', { stripe: c.stripe });
    cb.box(0.62, 0.2, 0.5, 0xffd21e, 0, 0.62, 0.02);                  // hi-vis vest (it is a sash)
    cb.box(0.64, 0.05, 0.52, 0xeef2f5, 0, 0.62, 0.02);                // reflective band
    cb.sph(0.2, 7, 4, 0xff8a1e, 0, 1.2, 0.2, [1.05, 0.55, 1.05]);     // a little hard hat
    cb.box(0.44, 0.04, 0.1, 0xff8a1e, 0, 1.12, 0.42);                 // its brim
    for (const g of cb.parts) { g.scale(CREW_S, CREW_S, CREW_S); g.rotateY(c.face); g.translate(c.x, c.y, c.z); gb.parts.push(g); }
  }

  const field = gb.build('flyer_field');
  field.position.set(PAD.x, PAD.y, PAD.z);
  field.rotation.y = HOME_YAW;
  scene.add(field);

  // ── RUNWAY PAINT (one mesh, one 512×1024 CanvasTexture atlas) ─────────────
  // Wave-4 polish: the lettering used to sit under the parked wings (from the
  // runway camera the spar crossed it: "to Can_land"). It now starts 8.3 u
  // out, past the wingtips' shadow on the planks, still on the level part of
  // the deck so it is not foreshortened away: TAKE-OFF / TO THE / CANDY /
  // KINGDOM, stretched along the run like real runway lettering, then the big
  // arrow on the ramp, a candy-stripe CENTRELINE from her nose to the end,
  // piano-key thresholds at both ends, and the runway LAMPS (cream studs on
  // the edge boards, green at the start, red at the far end). The paint is its
  // own emissive map: after dark it glows like luminous paint.
  const LAMPS = [];                                   // pad-local {x, y, z, kind: 0 cream | 1 red | 2 green, ph}
  const paint = (() => {
    const CW = 512, CH = 1024;
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    const g = c.getContext('2d');
    g.clearRect(0, 0, CW, CH);
    g.lineJoin = 'round';
    // ARROW (region 8..248 × 8..504), pointing at the canvas top = the far end
    const R_ARROW = [8, 8, 248, 504], acx = 128;
    g.beginPath();
    g.moveTo(acx, 30); g.lineTo(236, 206); g.lineTo(acx + 48, 184); g.lineTo(acx + 48, 488);
    g.lineTo(acx - 48, 488); g.lineTo(acx - 48, 184); g.lineTo(20, 206); g.closePath();
    g.lineWidth = 14; g.strokeStyle = '#4a2a14'; g.stroke();
    g.fillStyle = '#ffd23a'; g.fill();
    g.lineWidth = 6; g.strokeStyle = '#fff4c8'; g.beginPath(); g.moveTo(acx, 70); g.lineTo(acx, 470); g.stroke();
    // LETTERING (region 264..504 × 8..504), stretched ×2.5 along the run, on a
    // dark painted panel so it reads on sunlit planks as well as after dark
    const R_TEXT = [264, 8, 504, 504];
    g.fillStyle = '#3a2748';
    g.beginPath(); g.roundRect ? g.roundRect(270, 14, 228, 484, 26) : g.rect(270, 14, 228, 484); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#fff3de'; g.stroke();
    const word = (txt, px, yc, fill) => {
      let size = px; const font = (n) => `900 ${n}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
      g.font = font(size);
      const w = g.measureText(txt).width; if (w > 216) { size = Math.floor(size * 216 / w); g.font = font(size); }
      g.save(); g.translate(384, yc); g.scale(1, 2.5);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 4.5; g.strokeStyle = '#4a2a14'; g.strokeText(txt, 0, 0);
      g.fillStyle = fill; g.fillText(txt, 0, 0);
      g.restore();
    };
    word('TAKE-OFF', 60, 72, '#fffaf0');
    word('TO THE', 30, 184, '#fffaf0');
    word('CANDY', 50, 296, '#ffd23a');
    word('KINGDOM', 50, 426, '#ffd23a');
    // CANDY STRIPE tile (64×64 inside a padded 80×80 block, seamless diagonals)
    const R_STRIPE = [8, 520, 72, 584];
    {
      const im = g.createImageData(80, 80);
      for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
        const k = (y * 80 + x) * 4, red = ((x + y + 128) % 32) < 16;
        im.data[k] = red ? 228 : 255; im.data[k + 1] = red ? 52 : 243; im.data[k + 2] = red ? 58 : 222; im.data[k + 3] = 255;
      }
      g.putImageData(im, 0, 512);
    }
    // solid patches: piano keys, and the three lamp colours
    const patch = (x, col) => { g.fillStyle = col; g.fillRect(x, 520, 32, 32); return [x + 16, 536]; };
    const P_KEY = patch(96, '#fff3de'), P_LAMP = patch(144, '#fff1c2'), P_RED = patch(184, '#ff5a4a'), P_GRN = patch(224, '#7dffa0');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;

    const geos = [];
    const pushGeo = (pos, nor, uv, idx) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geos.push(geo);
    };
    /** a painted strip lying on the deck from z0 (near) to z1 (far); R = canvas region [x0,y0,x1,y1] */
    const strip = (z0, z1, xc, w, R, eps = 0.014) => {
      const n = Math.max(1, Math.ceil((z1 - z0) / 0.4));
      const pos = [], nor = [], uv = [], idx = [];
      const u0 = (R[0] + 1) / CW, u1 = (R[2] - 1) / CW, vN = 1 - (R[3] - 1) / CH, vF = 1 - (R[1] + 1) / CH;
      for (let i = 0; i <= n; i++) {
        const t = i / n, z = z0 + (z1 - z0) * t, y = deckAt(z) + eps, v = vN + (vF - vN) * t;
        pos.push(xc + w / 2, y, z, xc - w / 2, y, z);   // the viewer faces +z: his left is +x = texture left
        nor.push(0, 1, 0, 0, 1, 0);
        uv.push(u0, v, u1, v);
        if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      }
      pushGeo(pos, nor, uv, idx);
    };
    const solid = (geo, P) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, P[0] / CW, 1 - P[1] / CH); geos.push(geo); };
    strip(8.3, 12.95, 0, 3.8, R_TEXT);                            // the lettering: past the wings, still on the level
    strip(13.9, 22.6, 0, 3.5, R_ARROW);                           // the arrow, long: it lies on the ramp
    for (let z = -2.9; z < 7.3; z += 1.0) strip(z, z + 0.94, 0, 0.36, R_STRIPE);     // centreline, nose to lettering
    for (let z = 23.1; z < 27.2; z += 1.0) strip(z, z + 0.94, 0, 0.36, R_STRIPE);    // …arrow to the far threshold
    for (const [z0, z1] of [[-3.3, -2.35], [27.4, 28.4]]) {       // piano-key thresholds
      for (let k = 0; k < 6; k++) {
        const x = -1.75 + k * 0.7;
        if (Math.abs(x) < 0.3) continue;
        const pos = [], nor = [], uv = [], idx = [];
        const u = P_KEY[0] / CW, v = 1 - P_KEY[1] / CH;
        for (const zz of [z0, z1]) { const y = deckAt(zz) + 0.014; pos.push(x + 0.22, y, zz, x - 0.22, y, zz); nor.push(0, 1, 0, 0, 1, 0); uv.push(u, v, u, v); }
        idx.push(0, 1, 3, 0, 3, 2);
        pushGeo(pos, nor, uv, idx);
      }
    }
    // the lamps: cream studs on both edge boards, a green bar behind the
    // start and a red bar just past the far end (on the grass)
    const lamp = (lx, ly, lz, kind) => {
      const gl = new THREE.CylinderGeometry(0.15, 0.2, 0.22, 7);
      gl.translate(lx, ly + 0.11, lz);
      solid(gl, kind === 1 ? P_RED : kind === 2 ? P_GRN : P_LAMP);
      LAMPS.push({ x: lx, y: ly + 0.14, z: lz, kind, ph: clamp((lz - RW0) / (RW1 - RW0), 0, 1) });
    };
    for (const s of [-1, 1]) for (let z = RW0 + 0.4; z <= RW1 - 0.2; z += 2.4) lamp(s * (RWW / 2 + 0.08), deckAt(z) + 0.06, z, 0);
    for (let k = 0; k < 5; k++) { const x = -1.9 + k * 0.95; lamp(x, locH(x, RW1 + 0.7), RW1 + 0.7, 1); }
    for (let k = 0; k < 5; k++) { const x = -1.9 + k * 0.95; lamp(x, locH(x, RW0 - 0.6), RW0 - 0.6, 2); }
    const geo = mergeGeometries(geos, false);
    for (const q of geos) q.dispose();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.06,
      roughness: 0.8, metalness: 0, alphaTest: 0.45,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    m.name = 'flyer_runway_paint';
    m.receiveShadow = true; m.castShadow = false;
    m.position.set(PAD.x, PAD.y, PAD.z);
    m.rotation.y = HOME_YAW;
    scene.add(m);
    return m;
  })();
  let paintGlow = -1;

  // ── SWAY: the ground crew's arms, flags and wands, and the tall grass and
  // wildflowers along both edges of the runway (ONE draw call, pad frame).
  // Every vertex carries aSway = (kind, arm/height weight, cloth weight,
  // phase) and aDir = (sway dir xz, cloth normal xz); the vertex shader waves
  // them. kind 1 = grass/flower, 2 = arm + pole + flag, 3 = the same, lit
  // (the marshaller's wands glow after dark).
  const swayU = { uTime: { value: 0 }, uNight: { value: 0 } };
  const sway = (() => {
    const R = rng(hash('flyer-runway-meadow'));
    const parts = [];
    const tag = (geo, fn) => {
      const n = geo.attributes.position.count, p = geo.attributes.position;
      const a = new Float32Array(n * 4), d = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) fn(p.getX(i), p.getY(i), p.getZ(i), a, d, i * 4);
      geo.setAttribute('aSway', new THREE.BufferAttribute(a, 4));
      geo.setAttribute('aDir', new THREE.BufferAttribute(d, 4));
      return geo;
    };
    // ── the crew's arms, poles, flags and wands (built in each cat's own frame)
    CREW.forEach((c, ci) => {
      const t = new B(), LIGHT = 0xfff6ea, lit = new Set();
      // flag cats hold the flag out on the runway side (the arm whose world direction points at the centreline)
      const sides = c.kind === 'wands' ? [-1, 1] : [c.x < 0 ? -1 : 1];
      for (const s of sides) {
        const hi = c.kind === 'wands' ? [s * 0.52, 1.22, 0.26] : [s * 0.40, 1.3, 0.24];
        t.beam([s * 0.24, 0.66, 0.16], hi, 0.13, c.fur);
        t.sph(0.1, 5, 4, LIGHT, hi[0] + s * 0.01, hi[1] + 0.05, hi[2] + 0.01);
        if (c.kind === 'wands') {
          t.cyl(0.065, 0.075, 0.8, 6, 0xff7a1a, s * 0.68, 1.6, 0.28, 0, 0, -s * 0.45);
          lit.add(t.parts[t.parts.length - 1]);
        } else {
          t.beam([s * 0.42, 1.0, 0.26], [s * 0.44, 2.4, 0.24], 0.055, 0x5a3a22);
          if (c.kind === 'check') {
            for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) t.box(0.19, 0.16, 0.03, (i + j) % 2 ? 0x24242a : 0xfaf6ee, s * (0.54 + i * 0.19), 2.26 - j * 0.16, 0.24);
          } else {
            t.box(0.76, 0.48, 0.03, CANDY.gummyRed, s * 0.84, 2.1, 0.24);
            t.box(0.76, 0.1, 0.035, 0xffd23a, s * 0.84, 2.1, 0.24);
          }
        }
      }
      const cf = Math.cos(c.face), sf = Math.sin(c.face);
      for (const geo of t.parts) {
        const kind = lit.has(geo) ? 3 : 2;
        tag(geo, (x, y, z, a, d, k) => {
          const s = x < 0 ? -1 : 1;
          const arm = clamp((y - 0.66) / 1.7, 0, 1.3), cloth = clamp((Math.abs(x) - 0.46) / 0.76, 0, 1) * (y > 1.8 ? 1 : 0);
          a[k] = kind; a[k + 1] = arm; a[k + 2] = cloth; a[k + 3] = ci * 1.9;
          // sway along the cat's own x (mirrored per arm for the marshaller), cloth along its z
          const m = c.kind === 'wands' ? s : 1;
          d[k] = cf * m; d[k + 1] = -sf * m; d[k + 2] = sf; d[k + 3] = cf;
        });
        geo.scale(CREW_S, CREW_S, CREW_S); geo.rotateY(c.face); geo.translate(c.x, c.y, c.z);
        parts.push(geo);
      }
    });
    // ── tall grass + wildflowers
    const WIND = [0.8, 0.6];
    const BLADE_LO = [0x3f6b28, 0x4f7a2e, 0x5b8a34], BLADE_HI = [0xa9cf55, 0xc3dc6a, 0x8fbf4a];
    const FLOWER = [0xff7fb0, 0xffd84a, 0xfff6ea, 0xb99cff, 0xff9a3c];
    const cLo = new THREE.Color(), cHi = new THREE.Color();
    const tuft = (cx, cz, n, hMax) => {
      const y0 = locH(cx, cz) - 0.04;
      const pos = [], col = [], uv = [], idx = [];
      for (let i = 0; i < n; i++) {
        const bx = cx + R.range(-0.28, 0.28), bz = cz + R.range(-0.28, 0.28), ang = R() * Math.PI;
        const hw = R.range(0.05, 0.09), h = R.range(0.55, 1.0) * hMax;
        const lx = Math.cos(ang) * hw, lz = Math.sin(ang) * hw;
        const tx = bx + R.range(-0.25, 0.25), tz = bz + R.range(-0.25, 0.25);
        const b = pos.length / 3;
        pos.push(bx - lx, y0, bz - lz, bx + lx, y0, bz + lz, tx, y0 + h, tz);
        cLo.setHex(BLADE_LO[i % 3]); cHi.setHex(BLADE_HI[(i + 1) % 3]);
        col.push(cLo.r, cLo.g, cLo.b, cLo.r, cLo.g, cLo.b, cHi.r, cHi.g, cHi.b);
        uv.push(0, 0, 0, 0, 0, 0);
        idx.push(b, b + 1, b + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const ph = R() * 6.28;
      parts.push(tag(geo, (x, y, z, a, d, k) => { a[k] = 1; a[k + 1] = clamp((y - y0) / 0.9, 0, 1.2); a[k + 2] = 0; a[k + 3] = ph; d[k] = WIND[0]; d[k + 1] = WIND[1]; d[k + 2] = 0; d[k + 3] = 0; }));
    };
    const flowers = (cx, cz, n) => {
      const t = new B();
      const y0 = locH(cx, cz);
      for (let i = 0; i < n; i++) {
        const fx = cx + R.range(-0.5, 0.5), fz = cz + R.range(-0.5, 0.5), h = R.range(0.35, 0.62);
        t.cyl(0.02, 0.03, h, 3, 0x4f7a2e, fx, y0 + h / 2 - 0.02, fz);
        t.sph(0.13, 4, 2, FLOWER[R.int(0, FLOWER.length - 1)], fx, y0 + h + 0.02, fz, [1, 0.6, 1]);
      }
      const ph = R() * 6.28;
      for (const geo of t.parts) parts.push(tag(geo, (x, y, z, a, d, k) => { a[k] = 1; a[k + 1] = clamp((y - y0) / 0.6, 0, 1.2); a[k + 2] = 0; a[k + 3] = ph; d[k] = WIND[0]; d[k + 1] = WIND[1]; d[k + 2] = 0; d[k + 3] = 0; }));
    };
    const busy = (x, z) => {
      if (Math.abs(x) < RWW / 2 + 0.55) return true;                         // the deck
      if (Math.hypot(x - WS.x, z - WS.z) < 3.4 || Math.hypot(x - SOCK.x, z - SOCK.z) < 0.9) return true;
      if (Math.hypot(x - 10.8, z + 1.2) < 1.6) return true;                  // the sign
      for (const c of CREW) if (Math.hypot(x - c.x, z - c.z) < 1.1) return true;
      return !clearOf(x, z, 0.35);
    };
    const MOB = MOBILE ? 0.5 : 1;
    // a dense band hugging both edges of the deck…
    for (const s of [-1, 1]) {
      for (let z = -2.4; z < RW1 + 1.2; z += 0.95 / MOB) {
        const x = s * R.range(2.85, 4.4), zz = z + R.range(-0.3, 0.3);
        if (busy(x, zz)) continue;
        tuft(x, zz, R.int(4, 7), R.range(0.8, 1.15));
        if (R() < 0.45) { const fx = s * R.range(2.9, 4.8), fz = zz + R.range(-0.6, 0.6); if (!busy(fx, fz)) flowers(fx, fz, R.int(2, 5)); }
      }
    }
    // …and meadow patches out across the mown strip, so the field is not bare
    for (let p = 0; p < 18 * MOB; p++) {
      const s = p % 2 ? 1 : -1, px = s * R.range(5.2, 12.2), pz = R.range(-1, 34);
      for (let k = 0; k < 6; k++) {
        const x = px + R.range(-1.4, 1.4), z = pz + R.range(-1.4, 1.4);
        if (busy(x, z)) continue;
        if (k % 3 === 2) flowers(x, z, R.int(3, 6)); else tuft(x, z, R.int(4, 7), R.range(0.7, 1.05));
      }
    }
    const geo = mergeGeometries(parts, false);
    for (const q of parts) q.dispose();
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = swayU.uTime; sh.uniforms.uNight = swayU.uNight;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aSway;\nattribute vec4 aDir;\nuniform float uTime;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vGlow = 0.0;
          if (aSway.x > 0.5 && aSway.x < 1.5) {
            float ph = aSway.w + transformed.x * 0.35 + transformed.z * 0.22;
            float sw = sin(uTime * 1.7 + ph) * 0.7 + sin(uTime * 2.9 + ph * 1.3) * 0.3;
            transformed.xz += aDir.xy * sw * aSway.y * 0.14;
          } else if (aSway.x > 1.5) {
            transformed.xz += aDir.xy * sin(uTime * 2.3 + aSway.w) * aSway.y * 0.32;
            transformed.xz += aDir.zw * sin(uTime * 7.5 - aSway.z * 5.5 + aSway.w) * aSway.z * 0.13;
            if (aSway.x > 2.5) vGlow = 1.0;
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * vGlow * (0.15 + uNight * 2.4);');
    };
    mat.customProgramCacheKey = () => 'flyer_sway_v1';
    const m = new THREE.Mesh(geo, mat);
    m.name = 'flyer_sway';
    m.castShadow = false; m.receiveShadow = true;
    m.position.set(PAD.x, PAD.y, PAD.z);
    m.rotation.y = HOME_YAW;
    m.userData.noOcclude = true;
    scene.add(m);
    return m;
  })();

  // ── THE WATCHER (after dark): something at the end of the runway ─────────
  // Light horror. From Wing Nut Field at night, far down the runway past
  // Purrliament's roofs, a cat's head the size of a house rises very slowly
  // over Main Street and looks at you: a black silhouette with a cold moonlit
  // rim, two amber eyes with slit pupils, big paws hooked over the rooftops.
  // It blinks. It tilts its head. It watches the visitor. It never comes
  // closer: walk down the runway toward it, or take off, and it sinks back
  // down behind the town as if it had never been there. At dusk only its ears
  // show. One draw call (the eye halos live in the glow mesh below); it only
  // exists while the lens is at the field after lamps-on.
  const WATCH = { a: 122, l: 4.5, eyeY: 16.5, s: 1.75, sink: 44 };
  const WEYE = { L: new THREE.Vector3(-4.3, 0.6, 8.25), R: new THREE.Vector3(4.3, 0.6, 8.25) };
  const watchU = {
    uBlink: { value: 1 }, uGlow: { value: 0 }, uEyeL: { value: WEYE.L }, uEyeR: { value: WEYE.R }, uEyeRad: { value: new THREE.Vector2(2.7, 1.55) },
    uFogC: { value: new THREE.Color(0x32315d) }, uFogN: { value: 60 }, uFogF: { value: 260 }, uRim: { value: new THREE.Vector3(0.10, 0.12, 0.30) },
  };
  const watcher = (() => {
    const wp = [];
    const add = (geo, part, x, y, z, sx, sy, sz, rx = 0, rz = 0) => {
      geo.scale(sx, sy, sz); if (rz) geo.rotateZ(rz); if (rx) geo.rotateX(rx); geo.translate(x, y, z);
      geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(part), 1));
      wp.push(geo);
    };
    const SPH = (ws, hs) => new THREE.SphereGeometry(1, ws, hs);
    add(SPH(20, 14), 0, 0, 0, 0, 11.8, 9.4, 9.2);                              // skull
    add(SPH(12, 8), 0, 0, -3.8, 7.4, 4.6, 3.0, 3.4);                           // muzzle
    add(SPH(16, 10), 0, 0, -15, -5, 15, 11, 11);                               // shoulders
    for (const s of [-1, 1]) {
      add(SPH(12, 8), 0, s * 7.0, -3.4, 1.8, 6.5, 5.0, 5.0);                   // cheek fluff
      const ear = new THREE.ConeGeometry(1, 1, 4, 1); ear.rotateY(Math.PI / 4);
      add(ear, 0, s * 6.6, 8.6, -1.0, 4.8, 10.5, 2.6, -0.12, -s * 0.36);       // ears, leaning out
      add(SPH(14, 10), 1, s * 4.3, 0.6, 8.25, 2.7, 1.55, 0.9, 0, s * 0.2);     // eyes, outer corners up
      add(SPH(10, 8), 2, s * 4.3, 0.6, 8.95, 0.42, 1.45, 0.5);                 // slit pupils
      add(SPH(12, 8), 0, s * 12.5, -4.8, 6.0, 4.2, 2.4, 4.8);                  // paws on the rooftops
      for (let k = -1; k <= 1; k++) {
        add(SPH(8, 6), 0, s * 12.5 + k * 1.8, -5.4, 10.0, 1.4, 1.2, 1.4);      // toes
        add(new THREE.ConeGeometry(1, 1, 5), 3, s * 12.5 + k * 1.8, -6.5, 11.0, 0.28, 1.3, 0.28, Math.PI * 0.85);  // claws
      }
    }
    const geo = mergeGeometries(wp, false);
    for (const q of wp) q.dispose();
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      uniforms: watchU,
      vertexShader: /* glsl */`
        attribute float aPart;
        uniform float uBlink; uniform vec3 uEyeL; uniform vec3 uEyeR; uniform vec2 uEyeRad;
        varying float vPart; varying vec3 vN; varying vec3 vW; varying float vDepth; varying float vEyeD;
        void main(){
          vec3 p = position; vPart = aPart; vEyeD = 0.0;
          if (aPart > 0.5 && aPart < 2.5) {
            vec3 c = p.x < 0.0 ? uEyeL : uEyeR;
            vEyeD = length((p.xy - c.xy) / uEyeRad);
            p.y = c.y + (p.y - c.y) * uBlink;
          }
          vec4 w = modelMatrix * vec4(p, 1.0);
          vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          vec4 mv = viewMatrix * w; vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uGlow; uniform vec3 uFogC; uniform float uFogN; uniform float uFogF; uniform vec3 uRim;
        varying float vPart; varying vec3 vN; varying vec3 vW; varying float vDepth; varying float vEyeD;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float ndv = abs(dot(normalize(vN), V));
          float rim = pow(1.0 - ndv, 2.6);
          float f = smoothstep(uFogN, uFogF, vDepth);
          vec3 col;
          if (vPart < 0.5) {
            col = vec3(0.006, 0.005, 0.012) + uRim * rim;
            col = mix(col, uFogC, f * 0.45);
          } else if (vPart < 1.5) {
            col = mix(vec3(1.0, 0.86, 0.36) * 2.6, vec3(1.0, 0.42, 0.05) * 1.3, smoothstep(0.15, 1.0, vEyeD)) * uGlow;
            col = max(col, vec3(0.012, 0.008, 0.004));
          } else if (vPart < 2.5) {
            col = vec3(0.02, 0.006, 0.0);
          } else {
            col = vec3(0.30, 0.29, 0.36) * (0.35 + rim);
            col = mix(col, uFogC, f * 0.45);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'flyer_watcher';
    m.rotation.order = 'YXZ';
    m.scale.setScalar(WATCH.s);
    m.castShadow = false; m.receiveShadow = false;
    m.userData.noOcclude = true; m.userData.noFade = true;
    m.raycast = () => {};
    m.visible = false;
    scene.add(m);
    return m;
  })();
  const WBASE = { x: locX(WATCH.l, WATCH.a), z: locZ(WATCH.l, WATCH.a) };
  let watchRise = 0, watchForce = -1, watchNight = 0, blinkT = 0, blinkNext = 3.5, blinkN = 0;
  const RB = rng(hash('flyer-watcher-blink'));

  // ── GLOW: runway lamp halos + warm light pools on the planks and the grass,
  // and the watcher's eye halos (ONE additive draw call, after lamps-on only).
  // A slow "rabbit" chase of light runs down the lamps toward the far end
  // every 2.6 s: the one lit strip on the field, pointing at the dark.
  const glowU = { uTime: { value: 0 }, uLamp: { value: 0 }, uEye: { value: 0 }, uWatch: { value: watcher.matrixWorld } };
  const glow = (() => {
    const pos = [], aC = [], aP = [], col = [], idx = [];
    const COL = [[1.0, 0.80, 0.50], [1.0, 0.25, 0.18], [0.45, 1.0, 0.55]];
    const PCOL = [[1.0, 0.62, 0.30], [0.95, 0.16, 0.10], [0.22, 0.75, 0.32]];
    const surf = (lx, lz) => {
      let h = locH(lx, lz);
      if (Math.abs(lx) <= RWW / 2 + 0.3 && lz >= RW0 - 0.05 && lz <= RW1 + 0.05) h = Math.max(h, deckAt(lz));
      return h;
    };
    const quad = (x, y, z, size, kind, ph, c) => {
      const b = pos.length / 3;
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(x, y, z); aC.push(cx, cy, kind, size); aP.push(ph, 0); col.push(c[0], c[1], c[2]); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (const L of LAMPS) {
      // halo (billboard) at the bulb
      quad(locX(L.x, L.z), PAD.y + L.y + 0.1, locZ(L.x, L.z), L.kind ? 0.62 : 0.55, 0, L.ph, COL[L.kind]);
      // the pool: a 7×7 patch draped over the planks and the grass
      const PR = L.kind ? 1.5 : 2.1, N = 6, b = pos.length / 3;
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const u = i / N * 2 - 1, v = j / N * 2 - 1, lx = L.x + u * PR, lz = L.z + v * PR;
        pos.push(locX(lx, lz), PAD.y + surf(lx, lz) + 0.05, locZ(lx, lz));
        aC.push(u, v, 1, PR); aP.push(L.ph, 0); col.push(...PCOL[L.kind]);
      }
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = b + j * (N + 1) + i;
        idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2);
      }
    }
    // the watcher's two eye halos (positions in ITS frame; uWatch carries them)
    for (const e of [WEYE.L, WEYE.R]) quad(e.x, e.y, e.z + 0.8, 5.2 * WATCH.s, 2, 0, [1.0, 0.55, 0.12]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aC', new THREE.Float32BufferAttribute(aC, 4));
    geo.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 2));
    geo.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: glowU,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      vertexShader: /* glsl */`
        uniform float uTime; uniform float uLamp; uniform float uEye; uniform mat4 uWatch;
        attribute vec4 aC; attribute vec2 aP; attribute vec3 aCol;
        varying vec3 vCol; varying float vA; varying vec2 vUv; varying float vKind;
        void main(){
          float kind = aC.z;
          vKind = kind; vUv = aC.xy; vCol = aCol;
          float w = fract(uTime * 0.385) * 1.4 - 0.2;
          float chase = exp(-pow((w - aP.x) * 9.0, 2.0));
          float flick = 0.93 + 0.07 * sin(uTime * 13.0 + aP.x * 40.0);
          if (kind < 0.5) {
            vec4 mv = viewMatrix * vec4(position, 1.0);
            float s = aC.w * (1.0 + chase * 0.6);
            mv.xy += aC.xy * s; mv.z += s * 0.9;
            gl_Position = projectionMatrix * mv;
            vA = uLamp * (0.6 + 1.0 * chase) * flick;
          } else if (kind < 1.5) {
            gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
            vA = uLamp * (0.5 + 0.45 * chase) * flick;
          } else {
            vec4 mv = viewMatrix * (uWatch * vec4(position, 1.0));
            mv.xy += aC.xy * aC.w;
            gl_Position = projectionMatrix * mv;
            vA = uEye;
          }
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol; varying float vA; varying vec2 vUv; varying float vKind;
        void main(){
          float r2 = dot(vUv, vUv);
          if (r2 > 1.0) discard;
          float a;
          if (vKind < 0.5) a = pow(1.0 - r2, 2.4) * 0.8 + exp(-r2 * 26.0) * 1.3;
          else if (vKind < 1.5) a = (1.0 - r2) * (1.0 - r2) * 0.75;
          else a = pow(1.0 - r2, 3.0) * 0.55 + exp(-r2 * 14.0) * 0.5;
          a *= vA;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vCol, a);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'flyer_runway_glow';
    m.frustumCulled = false;            // the eye halos ride the watcher's matrix
    m.renderOrder = 6;
    m.castShadow = false; m.receiveShadow = false;
    m.userData.noOcclude = true; m.userData.noFade = true;
    m.raycast = () => {};
    m.visible = false;
    scene.add(m);
    return m;
  })();

  // windsock (a flapping cone of stripes)
  const wb = new B();
  for (let i = 0; i < 4; i++) wb.add(new THREE.CylinderGeometry(0.42 - i * 0.06, 0.48 - i * 0.06, 0.42, 8, 1, true), i % 2 ? CANDY.gummyOrange : 0xffffff, 0, 0, -0.25 - i * 0.42, Math.PI / 2);
  const sock = wb.build('flyer_sock', { side: THREE.DoubleSide });
  sock.position.set(locX(SOCK.x, SOCK.z), PAD.y + locH(SOCK.x, SOCK.z) + 4.3, locZ(SOCK.x, SOCK.z));
  scene.add(sock);

  // the helmet (cat-sized, hanging on its peg)
  const hb = new B();
  hb.sph(0.30, 8, 5, CANDY.gummyRed, 0, 0, 0, [1, 0.8, 1.1]);
  hb.box(0.34, 0.06, 0.24, 0xffffff, 0, 0.06, 0.26);
  for (const s of [-1, 1]) hb.cone(0.12, 0.2, 4, CANDY.gummyRed, s * 0.17, 0.24, -0.02, 0, 0, s * 0.3);
  const helmet = hb.build('flyer_helmet');
  const hx = locX(WS.x + 2.4, WS.z + 0.9), hz = locZ(WS.x + 2.4, WS.z + 0.9);
  helmet.position.set(hx, world.height(hx, hz) + 1.75, hz);
  scene.add(helmet);

  // the cat who read one book, sitting on his bench, watching his runway,
  // waiting to be proved right
  const cat = catGeo(CAT.furCalico, 'sit', { stripe: 0xa06a30 }).build('flyer_wingnut');
  const cx = locX(WS.x + 0.3, WS.z), cz = locZ(WS.x + 0.3, WS.z);
  cat.position.set(cx, PAD.y + wsy(0.3, 0) + 1.03, cz);
  cat.rotation.y = HOME_YAW - 0.46;        // looking down the runway
  cat.scale.setScalar(1.25);
  scene.add(cat);

  // ── sign ───────────────────────────────────────────────────────────────────
  const SIGN_POST_X = 1.47;
  const sp = new B();
  // the posts FLANK the board (±1.47, just outside its ±1.39 timber edge):
  // at ±1.0 they crossed the double-faced board and ate the ends of every line.
  // (sunk 0.45 u: the field falls 0.28 u across the board; tops tucked under
  // the cap rail at 3.6)
  for (const s of [-1, 1]) sp.cyl(0.10, 0.12, 4.07, 6, 0x6b4126, s * SIGN_POST_X, 1.585, 0);
  sp.box(2.78, 1.43, 0.07, 0x6b4126, 0, 2.9, 0);                        // the board's timber edge
  sp.box(2 * SIGN_POST_X + 0.3, 0.12, 0.2, RIB, 0, 3.66, 0);            // a red cap rail over both posts
  const signPost = sp.build('flyer_signpost');
  // local x 17.8, not 10.8: at 10.8 a post stood at lateral 11.5 u, inside the take-off corridor
  // (WIDTH/2 + MARGIN = 16 u) and route.corridor() reported it as a blocker (WAVE 4 integration).
  const sgx = locX(17.8, -1.2), sgz = locZ(17.8, -1.2);
  const sgy = world.height(sgx, sgz);
  signPost.position.set(sgx, sgy, sgz);
  signPost.rotation.y = 0.85;
  scene.add(signPost);
  const sign = signMesh(2.6, 1.25, [
    { text: 'WING NUT FIELD', size: 50, color: '#3b2415' },
    // Contract P: the candy island is the Candy Kingdom on anything painted.
    { text: 'runway → the Candy Kingdom', size: 30, color: '#b0202e' },
    { text: 'flight school · 1 lesson', size: 24, color: '#6b4126' },
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
  for (const s of [-1, 1]) own({ x: sgx + s * SIGN_POST_X * Math.cos(0.85), z: sgz - s * SIGN_POST_X * Math.sin(0.85), r: 0.35 }, 'signpost');

  // the machine is solid where she stands (moved when she is parked elsewhere)
  let machineCol = own({ x: PAD.x, z: PAD.z, r: 1.5 }, 'machine');
  // CLEARANCE CLAIM = THE CORRIDOR. cat/nature runs before us and re-tests
  // every instance against the oriented BOX colliders in ctx.colliders on
  // world:ready (blanking anything within its 1.5 u pad of the box), so this
  // box mows the take-off strip: 26 u wide (everything centred within ±14.8
  // goes, bunting line included), from 10 u behind the start (the workshop) to
  // 36 u out, where even a lazy climb is above the treetops. h is absolute
  // and below the ground, so player.js drops it instantly and ride.js retires
  // it after world:ready: it is a claim, never a wall.
  // (box convention: lx = dx·cos(rot) + dz·sin(rot), so the pad frame is rot = -HOME_YAW)
  {
    const z0 = RUNWAY.CLAIM[0], z1 = RUNWAY.CLAIM[1], zc = (z0 + z1) / 2;
    clearanceClaim(ctx, locX(0, zc), locZ(0, zc), RUNWAY.WIDTH, z1 - z0, -HOME_YAW, 'flyer_corridor');
  }
  // workshop: the bench and the crate are low props you can stand on (Contract A)
  own({ x: locX(WS.x, WS.z), z: locZ(WS.x, WS.z), w: 2.5, d: 1.2, rot: -HOME_YAW, box: true, h: 1.03 }, 'bench');
  own({ x: locX(WS.x - 2.1, WS.z + 0.6), z: locZ(WS.x - 2.1, WS.z + 0.6), w: 0.95, d: 0.95, rot: -HOME_YAW, box: true, h: 0.8 }, 'crate');
  own({ x: locX(WS.x + 2.4, WS.z + 0.9), z: locZ(WS.x + 2.4, WS.z + 0.9), r: 0.2 }, 'helmet_peg');
  own({ x: locX(SOCK.x, SOCK.z), z: locZ(SOCK.x, SOCK.z), r: 0.22 }, 'windsock');
  for (const [lx, lz] of poles) own({ x: locX(lx, lz), z: locZ(lx, lz), r: 0.32 }, 'bunting_pole');
  for (const [lx, lz] of cones) own({ x: locX(lx, lz), z: locZ(lx, lz), r: 0.45 }, 'marker_cone');
  for (const c of CREW) own({ x: locX(c.x, c.z), z: locZ(c.x, c.z), r: 0.55 }, 'ground_crew');

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
  let flapPhase = 0, propSpin = 0, wingBeat = 0, tuck = 0, fold = 0, glide = 0;
  let milestone = 0, feather = 0, fromCat = false, bonkCd = 0, warned = 0;
  let gate = null, worldCols = null, parkedT = 0;
  const TOW_DIST = 120, TOW_T = 60;                 // wave 4: Wingnut's rope has a long memory
  const PARK = { t: 0, away: false, dist: 0 };
  const CONTACTS = { bonk: 0, hard: 0 };
  const CONTACT_EV = { kind: '', x: 0, y: 0, z: 0 };
  let fromIsland = null;                            // where this flight took off ('cat' | 'candy' | null)
  const contact = (kind) => {
    CONTACTS[kind]++;
    CONTACT_EV.kind = kind; CONTACT_EV.x = S.x; CONTACT_EV.y = S.y; CONTACT_EV.z = S.z;
    ctx.events.emit('flyer:contact', CONTACT_EV);
  };
  let fogSaved = undefined, fogOn = false, camSaved = null, camChecked = false, flyElevBase = null, flyElevSet = -1;
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
    // (+ a glider's slight nose-down while gliding, which also tips the
    // canvas toward the chase camera behind and above her)
    const attitude = -(S.pitch * 0.75 + clamp(S.vy / 34, -0.28, 0.32)) + glide * 0.1;
    flyer.rotation.set(phase === 'air' ? attitude : S.pitch, S.yaw, S.bank);
    // Wave-4 polish: a GLIDE is a glide. The wings used to keep a ±26° idle
    // beat in the air, so a chase-cam frame caught a steep V seen edge-on (two
    // red sticks, the pink canvas gone). Gliding she now holds them out nearly
    // flat (the dihedral eased ~15°) with a small flutter; flapping and the
    // take-off roll beat as before.
    const amp = (phase ? 0.12 : 0.42) + wingBeat * 0.8;
    const flap = Math.sin(flapPhase) * amp * (1 - tuck * 0.8) + wingBeat * 0.18 + glide * 0.32;
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
    flapPhase = 0; wingBeat = 0; tuck = 0; glide = 0;
  }

  /**
   * The watcher: rises only after lamps-on, only while the LENS is at the
   * field and the visitor is on it, never while she flies. Slow up (≈ 4.5 s),
   * quicker down; blinks (now and then twice), tilts its head, turns a little
   * to keep the visitor in view. No allocations.
   */
  function watcherUpdate(dt, t, lamp) {
    const nightK = smoothstep(0.35, 0.95, lamp);
    watchNight = nightK;
    let want = 0;
    if (nightK > 0.001 && !phase) {
      const cp = ctx.camera.position, p = ctx.systems.player?.position;
      const camD = Math.hypot(cp.x - PAD.x, cp.z - PAD.z);
      const pD = p ? Math.hypot(p.x - PAD.x, p.z - PAD.z) : 999;
      if (camD < 90 && pD < 38) want = 1;
    }
    if (watchForce >= 0) watchRise = watchForce;
    else if (want > watchRise) watchRise = Math.min(want, watchRise + dt * 0.22);
    else watchRise = Math.max(want, watchRise - dt * (phase ? 1.4 : 0.45));
    const e = smoothstep(0, 1, watchRise) * nightK;
    const on = e > 0.004;
    watcher.visible = on;
    if (!on) { glowU.uEye.value = 0; return; }
    blinkT += dt;
    let lid = 1;
    if (blinkT > blinkNext) {
      const bt = blinkT - blinkNext;
      lid = 1 - Math.sin(clamp(bt / 0.22, 0, 1) * Math.PI);
      if (bt > 0.22) { blinkT = 0; blinkN++; blinkNext = blinkN % 4 === 3 ? 0.3 : RB.range(2.6, 6.0); }
    }
    watchU.uBlink.value = Math.max(0.06, lid);
    watchU.uGlow.value = nightK * (0.85 + 0.15 * Math.sin(t * 0.9)) * smoothstep(0.3, 0.8, watchRise);
    glowU.uEye.value = watchU.uGlow.value * lid;
    watcher.position.set(WBASE.x, WATCH.eyeY - WEYE.L.y * WATCH.s - (1 - e) * WATCH.sink, WBASE.z);
    let track = 0;
    const p = ctx.systems.player?.position;
    if (p) {
      let d = Math.atan2(p.x - WBASE.x, p.z - WBASE.z) - (HOME_YAW + Math.PI);
      d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
      track = clamp(d, -0.25, 0.25);
    }
    watcher.rotation.set(0.1 + Math.sin(t * 0.21) * 0.03, HOME_YAW + Math.PI + track + Math.sin(t * 0.13) * 0.04, Math.sin(t * 0.33) * 0.12);
    const fog = scene.fog;
    if (fog) { watchU.uFogC.value.copy(fog.color); watchU.uFogN.value = fog.near; watchU.uFogF.value = fog.far; }
  }

  function moveCollider(px, pz) {
    // moved IN PLACE: player/ground.js reads geometry and the solid flag live and its
    // rolling validator re-bins a collider that moved (the swap back from the
    // rider's empty list also rebuilds the hash outright)
    machineCol.x = px; machineCol.z = pz; machineCol.solid = true;
  }

  /** wheel her back to Wing Nut Field */
  function goHome() {
    S.x = PAD.x; S.z = PAD.z; S.y = groundAt(PAD.x, PAD.z) + SEAT; S.yaw = HOME_YAW;   // on the planks
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
    const bx = locX(WS.x - 2.1, WS.z + 0.6), bz = locZ(WS.x - 2.1, WS.z + 0.6);
    ctx.systems.interaction?.register({
      id: 'escape_flyer_book',
      x: bx, z: bz, r: 1.9,
      label: 'Read the book',
      onInteract() {
        ui()?.say('Chapter One: Birds. Warm air rises. Point it where you want to go. Land anywhere. That is the whole book.', { speaker: 'Wingnut', duration: 5 });
      },
    });
    // Wingnut himself: runway talk by day, something less cheerful after dark
    let chat = 0;
    const DAY = [
      'I pointed the runway at the Candy Kingdom. The book says: point it where you want to go.',
      'Hold W, flap hard off the end. That house is shorter than it looks. Mostly.',
      'My ground crew have flags. They do not know what the flags mean. Neither do I. Very professional.',
      'Leave her anywhere. If you wander off for good, I come and fetch her. I have a rope.',
    ];
    const NIGHT = [
      'The runway lamps are for you. The two lights at the end of the runway are not mine.',
      'Do not wave at it. It waves back.',
      'Fly at night if you like. It never follows the machine. It only ever watches the field.',
      'Just do not land where the grass is giggling.',
    ];
    ctx.systems.interaction?.register({
      id: 'escape_flyer_wingnut',
      x: cx, z: cz, r: 2.4,
      label: 'Talk to Wingnut',
      onInteract() {
        const lines = ctx.state.isNight ? NIGHT : DAY;
        ui()?.say(lines[chat++ % lines.length], { speaker: 'Wingnut', duration: 4.8 });
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
  let quietUntil = -1;                            // debugQuiet(): screenshot hush, see the route API
  ctx.events.on('ui:say', (e) => {
    const hush = (phase === 'air' && FLY.alt > 20) || ctx.state.elapsed < quietUntil;
    if (!hush || !e || !e.speaker || e.speaker === 'Wingnut') return;
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
  function cameraFollow(dt, alt = 0) {
    const cam = ctx.systems.camera;
    if (!cam?.setParams) return;
    if (!camSaved) {
      // The camera honours the flight (Contract E: 44 / 0.38 / 40). At cruise
      // height (70 → 150 u) its flyElev eases up to 0.46, so the chase lens
      // looks down onto the canvas instead of along it (edge-on wings read as
      // two red sticks); restored on landing. Below 70 u it is the contract's 0.38.
      if (flyElevBase === null) { const b = cam.params?.flyElev; if (typeof b !== 'number') return; flyElevBase = b; }
      const want = flyElevBase + 0.08 * smoothstep(70, 150, alt);
      if (Math.abs(want - flyElevSet) > 0.002) { flyElevSet = want; cam.setParams({ flyElev: want }); }
      return;
    }
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
    if (flyElevBase !== null) { try { ctx.systems.camera?.setParams?.({ flyElev: flyElevBase }); } catch (e) {} flyElevBase = null; flyElevSet = -1; }
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
      contact('bonk');
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
    const az = ctx.systems.camera?.current?.azimuth ?? ctx.systems.camera?.params?.azimuth;   // the lens bearing in every mode (params.azimuth is stale in mode 2)
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
    const from = fromIsland;
    fromIsland = null;
    if (isl === 'candy' && from === 'cat') {
      fromCat = false;
      ui()?.card?.({ title: 'ESCAPED', body: 'You escaped Cat Island. For now.', buttons: [{ label: 'For now.' }] });
      ui()?.toast('The ornithopter lands on frosting. The book was right. (She will wait here for you.)', 5);
      api.success('flyer', { to: 'candy', from: 'cat', landing: { x: off.x, z: off.z } });
    } else if (isl === 'cat' && from === 'candy') {
      // Contract L: the ride home counts too. The shared event goes out when
      // the round-trip counter can read it as a RETURN: cat/containment (as of
      // wave 3) books every escape:success as a new ESCAPE unless it is the
      // same route it is already waiting on, so a return by air after leaving
      // by canoe would lose the round trip. Until containment says it reads
      // {to:'cat'} (acceptsReturnSuccess), its own island watch closes the
      // trip and we only send the event when it is harmless.
      ui()?.toast('Back on Cat Island. The cats left the porch light on for you.', 5);
      const cc = ctx.systems.catContainment;
      let away = null;
      try { away = cc?.state?.away ?? null; } catch (e) { away = null; }
      if (!cc || cc.acceptsReturnSuccess === true || away === 'flyer') {
        api.success('flyer', { to: 'cat', from: 'candy', landing: { x: off.x, z: off.z } });
      }
    } else if (isl === 'candy') {
      ui()?.toast('Landed in the Candy Kingdom. E to take off again.', 4);
    } else {
      ui()?.toast('You landed. Technically. (E to fly again)', 4);
    }
  }

  function touchdown(g) {
    // hard contact bounces; gentle contact rolls to a stop
    if (S.vy < -7.5 && S.speed > 0) {
      contact('hard');
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

  // ── THE TAKE-OFF CORRIDOR (measurement + a debug overlay) ─────────────────
  // A LEN × WIDTH box from the start of the roll along the runway, its floor
  // climbing at her real climb rate (climbProfile: the roll, the hop, W held, a
  // flap every 0.35 s). A collider is a BLOCKER when its footprint enters the
  // box and its top comes within MARGIN of her feet over it; the terrain is a
  // blocker past the runway the same way. Tops: h ≤ 1.6 is Contract A's
  // height above the ground, 1.6 < h < 1e4 the absolute top, and anything
  // else is read off the drawn geometry with a downward ray (the same rays
  // name what they hit, so a report says WHAT is in the way).
  const CORR_DENY = /^(sky|clouds|seaMist|planes|terrain|particles|sourpatch|sugarfin|candy|underseaCave|cave_|inventory|powerups|weapons|cat_citizens|escape_item_beams|world_lamp|flyer_(thermal|horizon|airflow|corridor|watcher|runway_glow|sway)|containment-(cats|glow|ring|paw|raft|rope|fish))/;
  function corridor(o = {}) {
    const yaw = o.yaw ?? HOME_YAW;
    const px = o.pad?.x ?? PAD.x, pz = o.pad?.z ?? PAD.z;
    const LEN = o.len ?? RUNWAY.LEN, HALF = (o.width ?? RUNWAY.WIDTH) / 2, M = o.margin ?? RUNWAY.MARGIN;
    const prof = climbProfile(o.flapEvery ?? 0.35, o.pitch ?? 1, LEN + 12);
    const base = o.pad ? world.height(px, pz) + 0.14 : PAD.y + DECK;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const cols = worldCols || ctx.colliders;
    // meshes the rays may hit: everything solid-looking near the corridor
    const cand = [], sph = new THREE.Sphere(), R = LEN + HALF + 10;
    const mx = px + fx * LEN / 2, mz = pz + fz * LEN / 2;
    scene.updateMatrixWorld();
    for (const top of scene.children) {
      if (CORR_DENY.test(top.name || '')) continue;
      top.traverse((k) => {
        if (!k.isMesh || !k.visible || !k.geometry || CORR_DENY.test(k.name || '')) return;
        if (k.isInstancedMesh) { if (!k.boundingSphere) k.computeBoundingSphere(); sph.copy(k.boundingSphere); }
        else { if (!k.geometry.boundingSphere) k.geometry.computeBoundingSphere(); sph.copy(k.geometry.boundingSphere); }
        sph.applyMatrix4(k.matrixWorld);
        if (Math.hypot(sph.center.x - mx, sph.center.z - mz) - sph.radius > R) return;
        cand.push(k);
      });
    }
    const rc = new THREE.Raycaster(), O = new THREE.Vector3(), D = new THREE.Vector3(0, -1, 0);
    const nameOf = (ob) => { let n = ob.name || ob.type; for (let q = ob.parent; q && q !== scene; q = q.parent) if (q.name) n = q.name + '/' + n; return n; };
    const drawn = (x, z) => {
      O.set(x, 500, z); rc.set(O, D);
      const g0 = world.height(x, z);
      for (const h of rc.intersectObjects(cand, false)) if (h.point.y > g0 + 0.15) return { y: h.point.y, name: nameOf(h.object) };
      return null;
    };
    const blockers = [];
    let checked = 0, minGap = Infinity;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!c || c.claim || c === machineCol) continue;
      if (typeof c.h === 'number' && c.h < -50) continue;
      let a0 = Infinity, a1 = -Infinity, l0 = Infinity, l1 = -Infinity;
      const ca = (c.x - px) * fx + (c.z - pz) * fz, cl = (c.x - px) * rx + (c.z - pz) * rz;
      if (c.box) {
        if (!(c.w > 0 && c.d > 0)) continue;
        const cr = Math.cos(c.rot || 0), sr = Math.sin(c.rot || 0);
        for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) {
          const lx = sx * c.w / 2, lz = sz * c.d / 2;
          const wx = c.x + lx * cr - lz * sr - px, wz = c.z + lx * sr + lz * cr - pz;
          const a = wx * fx + wz * fz, l = wx * rx + wz * rz;
          if (a < a0) a0 = a; if (a > a1) a1 = a; if (l < l0) l0 = l; if (l > l1) l1 = l;
        }
      } else {
        if (!(c.r > 0)) continue;
        a0 = ca - c.r; a1 = ca + c.r; l0 = cl - c.r; l1 = cl + c.r;
      }
      if (!(a1 > 0 && a0 < LEN && l1 > -HALF && l0 < HALF)) continue;
      checked++;
      const g0 = world.height(c.x, c.z);
      let top, kind, name = c.tag || null;
      if (typeof c.h === 'number' && c.h <= 1.6) { top = g0 + c.h; kind = 'low'; }
      else if (typeof c.h === 'number' && c.h < 1e4) { top = c.h; kind = 'abs'; }
      else {
        kind = 'solid'; top = -Infinity;
        const k = 0.35;
        const probe = c.box
          ? [[0, 0], [k, k], [k, -k], [-k, k], [-k, -k]].map(([u, v]) => { const cr = Math.cos(c.rot || 0), sr = Math.sin(c.rot || 0); const lx = u * c.w, lz = v * c.d; return [c.x + lx * cr - lz * sr, c.z + lx * sr + lz * cr]; })
          : [[c.x, c.z], [c.x + c.r * 0.7, c.z], [c.x - c.r * 0.7, c.z], [c.x, c.z + c.r * 0.7], [c.x, c.z - c.r * 0.7]];
        if (o.drawn === false) top = Infinity;
        else for (const [qx, qz] of probe) { const q = drawn(qx, qz); if (q && q.y > top) { top = q.y; if (!c.tag) name = q.name; } }
        if (top === -Infinity) { top = g0 + 2; kind = 'solid-undrawn'; }
      }
      const feet = base + profileAt(prof, Math.max(0, a0));
      const gap = feet - top;
      if (gap < minGap) minGap = gap;
      if (gap < M) {
        if (!name && o.names !== false) { const q = drawn(c.x, c.z); if (q) name = q.name; }
        const lat = l0 <= 0 && l1 >= 0 ? 0 : Math.min(Math.abs(l0), Math.abs(l1));
        blockers.push({ kind, name, x: +c.x.toFixed(2), z: +c.z.toFixed(2), shape: c.box ? `box ${c.w.toFixed(1)}×${c.d.toFixed(1)}` : `r ${c.r.toFixed(2)}`,
          a: +Math.max(0, a0).toFixed(1), lat: +lat.toFixed(1), top: +top.toFixed(2), feet: +feet.toFixed(2), gap: +gap.toFixed(2) });
      }
    }
    // the ground itself, past the end of the deck. Level or falling ground
    // just past the lip is where every take-off happens (she is only a hop
    // up), so only ground that RISES above the deck can block: a hill, a bluff.
    let terrainGap = Infinity, terrainAt = null, terrainRise = -Infinity;
    for (let a = Z_LEVEL; a <= LEN; a += 1) {
      const feet = base + profileAt(prof, a);
      for (let l = -HALF; l <= HALF + 1e-6; l += 2) {
        const h = world.height(px + fx * a + rx * l, pz + fz * a + rz * l);
        if (h - base > terrainRise) terrainRise = h - base;
        if (h <= base + 0.5) continue;
        if (feet - h < terrainGap) { terrainGap = feet - h; terrainAt = [a, l]; }
      }
    }
    if (terrainGap < M) blockers.push({ kind: 'terrain', name: 'world.height', a: terrainAt[0], lat: Math.abs(terrainAt[1]), gap: +terrainGap.toFixed(2) });
    blockers.sort((p, q) => p.a - q.a);
    const samples = [];
    for (let a = 0; a <= LEN; a += 10) samples.push([a, +(profileAt(prof, a)).toFixed(1)]);
    return {
      yaw: +yaw.toFixed(4), bearingDeg: +(yaw * 180 / Math.PI).toFixed(2),
      toTarget: +((yaw - Math.atan2(RUNWAY.TARGET.x - px, RUNWAY.TARGET.z - pz)) * 180 / Math.PI).toFixed(2),
      pad: { x: +px.toFixed(2), z: +pz.toFixed(2), deck: +base.toFixed(2) }, len: LEN, width: HALF * 2, margin: M,
      climb: samples, checked, blockers, minGap: +minGap.toFixed(2), terrainGap: Number.isFinite(terrainGap) ? +terrainGap.toFixed(2) : null, terrainRise: +terrainRise.toFixed(2),
      clear: blockers.length === 0,
    };
  }
  let corrGroup = null;
  function corridorShow(on) {
    if (!on) { if (corrGroup) corrGroup.visible = false; return false; }
    if (corrGroup) { scene.remove(corrGroup); corrGroup.traverse((k) => { k.geometry?.dispose?.(); k.material?.dispose?.(); }); }
    const res = corridor();
    const LEN = RUNWAY.LEN, HALF = RUNWAY.WIDTH / 2;
    const prof = climbProfile(0.35, 1, LEN + 12);
    const base = PAD.y + DECK;
    const W = (lx, lz, y) => [locX(lx, lz), y, locZ(lx, lz)];
    const grp = new THREE.Group(); grp.name = 'flyer_corridor_debug';
    // the climb floor: a translucent ribbon HALF either side of her line
    const pos = [], idx = [];
    for (let a = 0, i = 0; a <= LEN; a += 2, i++) {
      const y = base + profileAt(prof, a);
      pos.push(...W(-HALF, a, y), ...W(HALF, a, y));
      if (a > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setIndex(idx);
    const floor = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    floor.renderOrder = 6; grp.add(floor);
    // the box outline on the ground, posts up to the floor, and her flight line
    const lp = [];
    const gnd = (lx, lz) => world.height(locX(lx, lz), locZ(lx, lz)) + 0.25;
    for (const s of [-1, 1]) for (let a = 0; a < LEN; a += 3) { const b = Math.min(LEN, a + 3); lp.push(...W(s * HALF, a, gnd(s * HALF, a)), ...W(s * HALF, b, gnd(s * HALF, b))); }
    for (const a of [0, LEN]) lp.push(...W(-HALF, a, gnd(-HALF, a)), ...W(HALF, a, gnd(HALF, a)));
    for (let a = 0; a <= LEN; a += 15) for (const s of [-1, 1]) lp.push(...W(s * HALF, a, gnd(s * HALF, a)), ...W(s * HALF, a, base + profileAt(prof, a)));
    for (const s of [-1, 1]) for (let a = 0; a < LEN; a += 2) lp.push(...W(s * HALF, a, base + profileAt(prof, a)), ...W(s * HALF, a + 2, base + profileAt(prof, a + 2)));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1b8fb8, fog: false })));
    const fl = [];
    for (let a = 0; a < LEN; a += 1) fl.push(...W(0, a, base + profileAt(prof, a) + 1.2), ...W(0, a + 1, base + profileAt(prof, a + 1) + 1.2));
    const flg = new THREE.BufferGeometry(); flg.setAttribute('position', new THREE.Float32BufferAttribute(fl, 3));
    grp.add(new THREE.LineSegments(flg, new THREE.LineBasicMaterial({ color: 0xffd23a, fog: false })));
    // anything in the way: a red column
    for (const b of res.blockers) {
      if (b.x === undefined) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, Math.max(2, b.top - world.height(b.x, b.z)), 8), new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.6, fog: false }));
      m.position.set(b.x, (b.top + world.height(b.x, b.z)) / 2, b.z); grp.add(m);
    }
    grp.traverse((k) => { k.userData.noOcclude = true; k.userData.noFade = true; k.frustumCulled = false; });
    scene.add(grp);
    corrGroup = grp;
    return res;
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
    /** Wing Nut Field: where she rests, which way the runway points, the deck height. */
    home: { x: PAD.x, z: PAD.z, y: PAD.y, yaw: HOME_YAW, deck: PAD.y + DECK, runway: { from: RW0, to: RW1, level: Z_LEVEL, width: RWW } },
    /** 'bonk' (low over a roof or a trunk) and 'hard' (a bounced touchdown) since load */
    contacts: CONTACTS,
    /** abandonment clock: seconds she has been > 120 u from the visitor, and how far */
    parked: PARK,
    corridor: (o) => corridor(o),
    debugCorridorShow: (on = true) => corridorShow(on),
    /** The thing at the end of the runway: rise 0..1, night 0..1, where it stands. */
    watcher: { get rise() { return watchRise; }, get night() { return watchNight; }, get visible() { return watcher.visible; }, x: WBASE.x, z: WBASE.z, eyeY: WATCH.eyeY },
    /** Screenshot hook: pin the watcher's rise (0..1; null/-1 hands it back to the field logic). Night still gates it. */
    debugWatcher(v = 1) { watchForce = (v === null || v < 0) ? -1 : clamp(+v, 0, 1); return { rise: watchRise, night: watchNight }; },
    /**
     * Screenshot hook: for `sec` seconds drop every spoken line but Wingnut's
     * (the airborne hush). A view that teleports straight onto Cat Island
     * triggers containment's first-arrival greeters ("A human!") — a line
     * nobody hears in play, where you arrive by ferry at the pier.
     */
    debugQuiet(sec = 8) { quietUntil = ctx.state.elapsed + sec; try { ui()?.clear?.(); } catch (e) { /* optional */ } return true; },

    /** Board. `quiet` (screenshot hooks only) skips the take-off fanfare. */
    start(quiet = false) {
      const pl = ctx.systems.player;
      if (!pl || phase || vehicleBusy(ctx)) return false;
      resetFlight();
      S.y = groundAt(S.x, S.z) + SEAT;          // she stays wherever she last landed
      setFlyer();
      phase = 'run'; pt = 0; airT = 0; milestone = 0; hold = false;
      fromIsland = world.islandAt(S.x, S.z);
      fromCat = fromIsland === 'cat';
      // Contract L: boarding fires escape:start in both directions. From
      // Candyland it carries arrived:'cat' (the cave's return-trip convention),
      // so containment reads it as a homecoming, not an escape to shout about.
      if (!quiet && fromIsland === 'cat') api.start('flyer', { label: 'The Flying Machine', from: 'cat', to: 'candy' });
      else if (!quiet && fromIsland === 'candy') api.start('flyer', { label: 'The Flying Machine', from: 'candy', to: 'cat', arrived: 'cat' });
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
      // runway paint + lamps: luminous after dark, on the town's lamp schedule;
      // the lamp pools, the crew's wands, the meadow's sway and the watcher
      {
        const lamp = ctx.systems.sky?.lampMix ?? clamp((1 - (ctx.state.daylight ?? 1)) * 1.25, 0, 1);
        const gI = 0.06 + lamp * 1.25;
        if (Math.abs(gI - paintGlow) > 0.004) { paintGlow = gI; paint.material.emissiveIntensity = gI; }
        swayU.uTime.value = t; swayU.uNight.value = lamp;
        glowU.uTime.value = t; glowU.uLamp.value = clamp(lamp * 1.25, 0, 1);
        watcherUpdate(dt, t, lamp);
        glow.visible = glowU.uLamp.value > 0.01 || glowU.uEye.value > 0.005;
      }

      if (!phase) {
        glide = damp(glide, 0, 3, dt);
        propSpin += dt * 0.35;
        flapPhase = Math.sin(t * 0.45) * 0.25;
        wingBeat = damp(wingBeat, 0, 3, dt);
        S.energy = Math.min(1, S.energy + F_.E_PARKED * dt);
        fold = damp(fold, Math.hypot(S.x - PAD.x, S.z - PAD.z) > 8 ? 1 : 0, 2.5, dt);
        setFlyer();
        sock.rotation.y = HOME_YAW + Math.sin(t * 0.5) * 0.35;
        sock.rotation.x = Math.sin(t * 1.9) * 0.14;
        helmet.rotation.z = Math.sin(t * 1.1) * 0.09;
        // ABANDONED → Wingnut tows her home. Wave 4: only when she has been left
        // more than TOW_DIST from the visitor for TOW_T seconds straight. Parked
        // on Candyland near you, she waits: she is your ride back.
        const away = Math.hypot(S.x - PAD.x, S.z - PAD.z) > 8;
        const p = ctx.systems.player?.position;
        PARK.away = away;
        if (away && p) {
          PARK.dist = Math.hypot(p.x - S.x, p.z - S.z);
          if (PARK.dist > TOW_DIST) parkedT += dt; else parkedT = 0;
          if (parkedT > TOW_T) {
            goHome();
            if (gate) gate.label = 'Board the flying machine';
            ui()?.toast('Wingnut towed the flying machine back to Wing Nut Field. (He has a rope.)', 4);
          }
        } else parkedT = 0;
        PARK.t = parkedT;
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
        glide = 0;
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
        glide = damp(glide, 0, 4, dt);
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
          milestone = -1; fromIsland = null;
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
      glide = damp(glide, hold || S.sinceFlap > 0.7 ? 1 : 0, 3, dt);
      let thNow = 0;
      if (hold) {
        // screenshot autopilot: hold position, keep everything else alive
        S.vy = 0; S.speed = F_.CRUISE; S.bank = damp(S.bank, 0, 3, dt);
        flapPhase += dt * 6; propSpin += dt * 34; wingBeat = damp(wingBeat, 0.12, 3, dt);
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
      cameraFollow(dt, alt);
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
      if (!hold && fromCat && milestone === 1 && S.x < -30) { milestone = 2; ui()?.toast('The Candy Kingdom below. Glide down and land anywhere.', 5); }
      if (!hold && fromIsland === 'candy' && milestone === 0 && S.x > -30) { milestone = 1; ui()?.toast('Open sea. Cat Island is the one with the lights on.'); }
      if (!hold && fromIsland === 'candy' && milestone === 1 && S.x > 40) { milestone = 2; ui()?.toast('Cat Island below. Wing Nut Field is the striped runway, east of the square.', 5); }

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
      phase = null; fromIsland = null;
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
      fromCat = false; fromIsland = null; milestone = 0;
      try { ui()?.clear?.(); } catch (e) { /* optional */ }
      flapPhase = ((x * 0.37 + z * 0.23 + y * 0.051) % 6.2832 + 6.2832) % 6.2832;
      wingBeat = 0.12; glide = 1;
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
    pad: [+PAD.x.toFixed(1), +PAD.z.toFixed(1)], yaw: +HOME_YAW.toFixed(4), deck: +(PAD.y + DECK).toFixed(2), claim: [RUNWAY.WIDTH, RUNWAY.CLAIM[1] - RUNWAY.CLAIM[0]],
    span: 11.2, ceiling: F_.CEIL, cruise: F_.CRUISE, thermals: thermals.map((t) => [t.id, t.x, t.z]), meshes: 17, night: 19, apron: !!domeU,
    runway: [RW0, RW1, +(PAD.y + deckAt(RW1)).toFixed(2)], lamps: LAMPS.length, crew: CREW.map((c) => [+c.x.toFixed(1), +c.z.toFixed(1)]),
    tris: { field: Math.round(field.geometry.index ? field.geometry.index.count / 3 : 0), sway: Math.round(sway.geometry.index.count / 3), glow: Math.round(glow.geometry.index.count / 3), watcher: Math.round(watcher.geometry.index.count / 3) },
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
