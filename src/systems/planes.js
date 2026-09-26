// ─────────────────────────────────────────────────────────────────────────────
// PLANES — the sky over both islands is inhabited (WAVE 3 · Contract F)
//
//   BANNER BIPLANE  a candy-cane biplane (span 6.9 u: banded wings, spiral
//                   fuselage, peppermint cowl) flown by a gummy bear in goggles
//                   and a streaming scarf who waves at you. Tows a 21 u banner —
//                   "WELCOME TO CANDYLAND" by day, "BE HOME BEFORE DARK" once the
//                   lamps come on — round the rim of Candyland at 45-50 u (35-40 u
//                   over the rim meadows; one lap ≈ 46 s). Every 40 s it drops a
//                   wrapped sweet on a peppermint parachute; the sweet lands as a
//                   real inventory pickup (no respawn, ≤ 3 waiting).
//   MEOW AIR JET    a white-and-orange airliner with cat ears on the nose, a
//                   curling cat's TAIL for a fin and MEOW AIR in big letters down
//                   both flanks. Crosses both islands at 110 u every 90 s on a new
//                   lane each pass — picked to dodge the clouds — laying two soft,
//                   puffy contrails that spread, drift and fade.
//   CATBLIMP        a pink-and-mint gored blimp with a cat face and twitching
//                   ears; "SUGAR" on the port flank, "CATNIP" to starboard (the
//                   letters glow at night); rounded gondola with striped awnings,
//                   a cat captain looking out of the front window (a passenger to
//                   starboard), bunting, big engine pods with pusher props, and
//                   rounded fins. Drifts a slow oval over the strait at 59-62 u.
//   PAPER PLANES    three giant paper darts (6.2 u; pink ruled paper, a Meow
//                   Donald's menu, sky-blue) circling Welcome Plaza (78,18) at
//                   20-24 u over the cobbles, follow-the-leader, with a
//                   loop-the-loop every lap (tops out at 30 u).
//
// You see them by holding L (look up), from the flying machine, in overviews —
// and in the ordinary game camera through their soft ground shadows (the
// biplane's cross sweeping over you) and the parachutes drifting down. They
// see through HALF the scene fog (so they stay crisp), and a sky-bounce fill
// lights the undersides the ground sees. Every one carries red (port) / green
// (starboard) wingtip lights and a white strobe after dark.
//
// HOW IT IS DRAWN (5 draw calls, ~13k triangles, zero cast shadows)
//   • body   ONE SkinnedMesh for every opaque aircraft part. Each aircraft,
//            propeller, ear, paper plane, banner segment, the pilot's scarf and
//            waving paw, and the parachute is a bone; bones are not in the scene
//            graph — update() writes their matrixWorld directly (rigid parts
//            have identity bind inverses, so each part is authored in its own
//            bone's frame).
//   • decal  a second SkinnedMesh on the SAME skeleton for everything that
//            needs a texture: the rippling banner (a 9-bone chain that follows
//            the biplane's own flight path, with a travelling wave), SUGAR /
//            CATNIP flank lettering, MEOW AIR livery, gondola windows. One
//            1024² CanvasTexture atlas + a matching emissive atlas.
//   • fx     soft contrail tubes + propeller blur discs (streaks that turn with
//            the blades), CPU-written vertex-alpha strips.
//   • lights nav lights / beacons / strobes as additive points (night only).
//   • blobs  soft ground shadows (instanced, 6 quads; leaning with the sun, day only).
//
// API  ctx.systems.planes
//   aircraft            live { biplane, jet, blimp, paper:[3] } → {x,y,z,heading[,active]}
//   drops               pickups this system registered (inventory objects)
//   hold                true = aircraft stop advancing (props/ripple still run)
//   debugTeleport(name, t, hold?, lane?)  put 'biplane'|'blimp'|'jet'|'paper' at path
//                       parameter t∈[0,1) (jet: fraction of pass `lane`, default the current one)
//   debugPose({ biplane, blimp, jet, paper, jetLane }, hold=true)   several at once (views)
//   debugLookUp(name)   aim the game camera at an aircraft with the hold-L lens (views)
//   debugFrame(name, {rel, az, el, dist, fov, dx, dy, dz})  park the free camera on an aircraft (views)
//   debugTeleport('jet', [x, z])  put the jet abeam of (x,z) on its current lane
//   debugDrop(x, z, k)  hang a parachute over (x,z) at fall fraction k (0..1)
//   dropCandy()         release a parachute from the biplane now → bool
//   where(name) → {x,y,z} · pathPoint(name, t) → {x,y,z}
//   clearance() → min clearance of each route over terrain + measured landmark tops
//   stats() → { calls, tris, bones }
// EVENTS  'planes:drop' {x,z} (release; x,z = landing spot) · 'planes:landed' {x,z,id}
//         'planes:flyover' {name:'biplane'|'jet'} when one passes over the visitor
//         (also calls ctx.systems.audio?.play?.('plane'|'jet') if audio grows that API)
// Views   tools/views/planes.json · tools/views/air_routes.json
//
// WAVE 4 · Contract L — AIR ROUTES (the same builder owns escape/blimp.js and
// escape/biplane.js, which hold the rides; this file flies the aircraft)
//   BLIMP SCHEDULE  two mooring masts: Sugar Pier (nose north to a mast on the
//                   beach, the rope ladder landing on the planks) and Fish Harbor
//                   (nose east to a mast on the lawn). Each pass: nose in, moor
//                   20 s (ladder drops, props idle, letters lit after dark),
//                   back off, climb, drift to the other mast (speed 4.6).
//                   planes.blimp = { moored:'candy'|'cat'|null, eta(mast),
//                   departIn, ladder (0..1), phase, leg, seat(out), foot(mast),
//                   masts, cycle } — day AND night.
//   BIPLANE PLAN    the banner biplane circles Candyland and, by day only, drops
//                   in on its fuel stop (AIR.strip, south of Gumdrop Village):
//                   lands, taxis to the candy pump, refuels 25 s with the engine
//                   off and the banner laid out on the grass, takes off and
//                   rejoins its loop. With a passenger aboard he flies to Wing
//                   Nut Field instead, stops, lets you off, and flies home.
//                   planes.biplane = { mode, phase, refuelLeft, eta(), stopped,
//                   wait(s), board(), release(), seat(out), pilot(out), ... }
//                   The fuel stop's ground is planes.air.strip.pad (buildPad: one
//                   raised slab over the RENDERED terrain mesh's envelope — no
//                   ground pokes through it); the taxi tracks, the pump hose and
//                   the laid-out banner rest on it (air.strip.restH). The tow rope
//                   runs through a knot bone: it sags in the air and, parked, drops
//                   off the tail onto the ground and along to the lead pole; in
//                   flight the banner streams at (nearly) the plane's height
//                   instead of hanging off a climb-out like a sea anchor.
//   summonJet({x,y,z}, {hold}) → Promise  the MEOW AIR jet leaves its lane,
//                   banks round the point, slows to a hover 12 u above it with a
//                   rope ladder trailing to y, holds ≈ 8 s, climbs out east. The
//                   promise resolves (with {x,y,z,top}) when the ladder is at the
//                   point. planes.jetState · jetHold(s) · jetGo()
//   debug hooks     debugBlimp('candy'|'cat'|'mid'|'midBack', k) ·
//                   debugBiplane('approach'|'refuel'|'ferry'|'dropoff'|'home', k) ·
//                   debugSummon(x, y, z, 'hover'|'approach'|'depart')
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, hash, clamp, lerp, smoothstep, TAU } from '../core/util.js';

const G = 9.8;
// Decorative sky furniture never takes part in raycasts: weapons.js casts
// against the whole scene, and a SkinnedMesh would CPU-skin every vertex of a
// world-sized bounding sphere for each shot.
const NO_RAY = () => {};
const UP = new THREE.Vector3(0, 1, 0);

// Tallest things in the world, measured 2026-09-22 with a max-height grid over
// every mesh in the scene (4 u cells). Routes keep ≥ 30 u over these.
export const OBSTACLE_TOPS = [
  { id: 'frosting_lookout', x: -182, z: -57, r: 12, top: 46.7 },
  { id: 'candy_palace', x: -150, z: -36, r: 16, top: 45.3 },
  { id: 'watchtower', x: 214, z: 30, r: 8, top: 38.4 },
  { id: 'giant_cupcake', x: -88, z: -18, r: 12, top: 37.8 },
  { id: 'clock_mast', x: 168, z: -1, r: 6, top: 35.5 },
  { id: 'purrliament', x: 152, z: -10, r: 9, top: 27.8 },
  { id: 'gummy_grandfather', x: -228, z: -16, r: 8, top: 27.8 },
  { id: 'yarn_ball', x: 188, z: -63, r: 9, top: 27.2 },
];

// ── authored routes ──────────────────────────────────────────────────────────
// Closed centripetal Catmull-Rom loops through [x, y, z]; y is absolute.
export const ROUTES = {
  // Round the rim of Candyland, clockwise on the map, low enough to read from
  // the ground (45-50 u, i.e. 35-40 u over the rim meadows) and never closer
  // than 30 u to anything under it: measured 2026-09-22 against a 2-u max-height
  // grid of every mesh in the scene (8 u footprint). It stays well clear of the
  // palace, the lookout on Frosting Peak and the Great Cupcake.
  biplane: {
    speed: 13,
    pts: [
      [-60, 50.5, 34], [-80, 46, 62], [-120, 45, 80], [-168, 45, 76], [-214, 45, 56],
      [-248, 46, 18], [-247, 46, -30], [-224, 46, -80], [-172, 46, -99], [-122, 47, -90],
      [-82, 50.5, -64], [-54, 47, -22],
    ],
  },
  // A slow oval over the strait: Sugar Pier's end ↔ Main Street, 60 u.
  blimp: {
    speed: 4.6,
    pts: [
      [-30, 60, 22], [-16, 61, -28], [28, 62, -52], [78, 62, -40], [108, 61, -6],
      [106, 60, 44], [72, 59, 78], [20, 60, 84], [-20, 60, 64],
    ],
  },
  // Tight circles over the open cobbles of Welcome Plaza (ground 4.5): 20-24 u
  // above them, the loop-the-loop topping out at 30 u.
  paper: { x: 78, z: 18, r: 12.5, alt: 44, loopR: 3.8, speed: 9, loopTime: 2.6, loopAt: 1.2, delays: [0, 0.95, 1.9], lateral: [0, 3.0, -3.0] },
  jet: { alt: 110, speed: 64, period: 90, half: 560, first: 10 },
};

// ── WAVE 4 · the ground end of the air routes ───────────────────────────────
// Masts: `foot` is where the rope ladder lands (where you board); the blimp
// hangs `LAD_BACK` ahead of it and the mast stands under its nose. Sugar Pier's
// foot is ON the pier planks (deck = terrain at [x, z] + lift, as pier.js
// builds it). The strip: centre, axis angle (0 = east, + toward south), size.
export const AIR = {
  masts: {
    candy: { foot: [-44, 22.2], heading: Math.PI, label: 'Sugar Pier', island: 'candy', to: 'cat', deck: [-46, 22, 0.62] },
    cat: { foot: [97, 60], heading: Math.PI / 2, label: 'Fish Harbor', island: 'cat', to: 'candy' },
  },
  ladder: 7.4,                       // rope ladder, balcony floor → ground
  // measured (tools/_tmp/air/probe_strip.mjs): no wall, house or big trunk within
  // the runway + 3.5 u of wing room, nor on the apron south of its west end
  strip: { x: -146, z: 72, ang: 0.2618, len: 46, wid: 9, apron: -1 },
  refuel: 25,                        // seconds at the pump
};

// ── the AIRFIELD PAD (the fuel stop's ground) ────────────────────────────────
// The runway and apron used to be drapes sampled from world.height every 2 u.
// The terrain MESH is not world.height: terrain/ground.js triangulates it on its
// own 208-quad grid per island (size = radius × 2.36; each quad split b–c), so
// between samples the ground rode up to 0.22 u over the drape and cut jagged
// holes through the lawn, the apron tiles, the threshold bars and the banner.
// Now the pad is ONE raised slab: its top is a 1 u grid laid over the DILATED
// upper envelope of that exact mesh (every pad vertex clears the mesh by LIFT
// everywhere within 1.5 u of it, i.e. over every triangle it belongs to — no
// poke-through anywhere), smoothed upward, with the apron's fall toward the
// beach held to APRON_FALL. biplane.js draws it (top, skirt, kerb), registers
// it as a walkable, and the taxi tracks + the grounded banner sit on it.
// Frame: a = along the runway (east-ish), k = toward the apron (k = side·apron).
export const PAD_SPEC = { G: 1, margin: 2, lift: 0.16, apronK: 11.5, apronA: -1, apronFall: 0.28, dilate: 1.5, smooth: 3 };
/** Exact height of the rendered terrain mesh at (x, z) (setup-time sampler; caches its vertices). */
export function terrainMeshSampler(world) {
  const SEG = 208, cache = new Map(), grids = {};
  for (const id of ['candy', 'cat']) {
    const isl = world.ISLANDS[id]; const size = isl.radius * 2.36;
    grids[id] = { x0: isl.center.x - size / 2, z0: isl.center.z - size / 2, step: size / SEG, tag: id === 'cat' ? 1 : 0 };
  }
  const V = (g, i, j) => {
    i = Math.max(0, Math.min(SEG, i)); j = Math.max(0, Math.min(SEG, j));
    const key = (g.tag * 512 + i) * 512 + j;
    let h = cache.get(key);
    if (h === undefined) { h = world.height(g.x0 + i * g.step, g.z0 + j * g.step); cache.set(key, h); }
    return h;
  };
  return (x, z) => {
    const g = x < 0 ? grids.candy : grids.cat;
    const fx = (x - g.x0) / g.step, fz = (z - g.z0) / g.step, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = V(g, i, j), b = V(g, i + 1, j), c = V(g, i, j + 1);
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    const d = V(g, i + 1, j + 1);
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
}
/** Build the pad heightfield for AIR.strip (pure; runs once at setup). */
export function buildPad(world, strip, o = {}) {
  const S = { ...PAD_SPEC, ...o };
  const SU = { x: Math.cos(strip.ang), z: Math.sin(strip.ang) }, SN = { x: Math.sin(strip.ang), z: -Math.cos(strip.ang) };
  const AS = strip.apron ?? -1, HL = strip.len / 2, HW = strip.wid / 2;
  const { G, margin: MG, lift: LIFT, apronK: APK, apronA: APA } = S;
  const A0 = -HL - MG, K0 = -HW - MG;
  const NA = Math.round((2 * HL + 2 * MG) / G) + 1, NK = Math.round((APK + HW + 2 * MG) / G) + 1;
  const meshH = S.meshH || terrainMeshSampler(world);
  const toX = (a, k) => strip.x + SU.x * a + SN.x * k * AS, toZ = (a, k) => strip.z + SU.z * a + SN.z * k * AS;
  // 1. the mesh on a fine lattice (0.25 u) over the grid + the dilation margin
  const FS = 0.25, FM = Math.ceil(S.dilate / FS);
  const FA = (NA - 1) * G / FS + 1 + 2 * FM, FK = (NK - 1) * G / FS + 1 + 2 * FM;
  const F = new Float32Array(FA * FK);
  for (let i = 0; i < FA; i++) for (let j = 0; j < FK; j++) {
    const a = A0 + (i - FM) * FS, k = K0 + (j - FM) * FS;
    F[i * FK + j] = meshH(toX(a, k), toZ(a, k));
  }
  // 2. dilated envelope at every pad vertex (+ world.height: what walkers stand on)
  const E = new Float32Array(NA * NK), H = new Float32Array(NA * NK);
  const R2 = (S.dilate / FS) * (S.dilate / FS), step = G / FS;
  for (let i = 0; i < NA; i++) for (let j = 0; j < NK; j++) {
    const ci = FM + i * step, cj = FM + j * step;
    let m = -Infinity;
    for (let di = -FM; di <= FM; di++) for (let dj = -FM; dj <= FM; dj++) {
      if (di * di + dj * dj > R2) continue;
      const h = F[(ci + di) * FK + cj + dj]; if (h > m) m = h;
    }
    const a = A0 + i * G, k = K0 + j * G;
    E[i * NK + j] = Math.max(m, world.height(toX(a, k), toZ(a, k))) + LIFT;
  }
  // 3. smoothed upward (never below the envelope), then the apron's fall held
  H.set(E);
  const T = new Float32Array(NA * NK);
  const at = (A, i, j) => A[Math.max(0, Math.min(NA - 1, i)) * NK + Math.max(0, Math.min(NK - 1, j))];
  const blur = () => {
    for (let i = 0; i < NA; i++) for (let j = 0; j < NK; j++) {
      let s = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) s += at(H, i + di, j + dj) * (2 - Math.abs(di)) * (2 - Math.abs(dj));
      T[i * NK + j] = Math.max(E[i * NK + j], s / 16);
    }
    H.set(T);
  };
  for (let n = 0; n < S.smooth; n++) blur();
  const jEdge = Math.round((HW - K0) / G);
  for (let i = 0; i < NA; i++) {
    const top = H[i * NK + jEdge];
    for (let j = jEdge + 1; j < NK; j++) H[i * NK + j] = Math.max(H[i * NK + j], top - S.apronFall * (j - jEdge) * G);
  }
  blur();
  // sampling (the SAME triangle split biplane.js draws: (00,10,01) + (10,11,01))
  const hAK = (a, k) => {
    const fi = Math.max(0, Math.min(NA - 1.0001, (a - A0) / G)), fj = Math.max(0, Math.min(NK - 1.0001, (k - K0) / G));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const h00 = H[i * NK + j], h10 = H[(i + 1) * NK + j], h01 = H[i * NK + j + 1];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    const h11 = H[(i + 1) * NK + j + 1];
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  };
  const insideAK = (a, k, pad = 0) => (Math.abs(a) <= HL + pad && Math.abs(k) <= HW + pad) || (a >= -HL - pad && a <= APA + pad && k >= HW - pad && k <= APK + pad);
  const toAK = (x, z, out) => { const dx = x - strip.x, dz = z - strip.z; out.a = dx * SU.x + dz * SU.z; out.k = (dx * SN.x + dz * SN.z) * AS; return out; };
  const _ak = { a: 0, k: 0 };
  return {
    spec: S, G, A0, K0, NA, NK, H, E, HL, HW, APK, APA, AS, SU, SN, meshH, toX, toZ, toAK, hAK, insideAK,
    /** Pad top at (x, z), or null off the pad (pad = extra margin, u). */
    at(x, z, pad = 0) { toAK(x, z, _ak); return insideAK(_ak.a, _ak.k, pad) ? hAK(_ak.a, _ak.k) : null; },
    /** Pad top where there is pad, else the terrain mesh (setup-time). */
    ground(x, z) { toAK(x, z, _ak); return insideAK(_ak.a, _ak.k, 0.25) ? hAK(_ak.a, _ak.k) : meshH(x, z); },
  };
}

/** Arc-length LUT of a closed Catmull-Rom loop. at(s, out) wraps s. */
export function buildLoop(pts, n = 2048) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  curve.arcLengthDivisions = 4000;
  const len = curve.getLength();
  const P = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { curve.getPointAt(i / n, v); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
  return {
    len, n, P,
    at(s, out) {
      let f = (s / len) % 1; if (f < 0) f += 1; f *= n;
      const i0 = Math.floor(f) % n, t = f - Math.floor(f), i1 = (i0 + 1) % n;
      out.x = P[i0 * 3] + (P[i1 * 3] - P[i0 * 3]) * t;
      out.y = P[i0 * 3 + 1] + (P[i1 * 3 + 1] - P[i0 * 3 + 1]) * t;
      out.z = P[i0 * 3 + 2] + (P[i1 * 3 + 2] - P[i0 * 3 + 2]) * t;
      return out;
    },
  };
}

/** Paper plane j's position at time t (ground circle + a loop-the-loop per lap). */
export function paperPos(t, j, out) {
  const R = ROUTES.paper;
  const w = R.speed / R.r;                          // rad/s round the plaza
  const tt = t - R.delays[j];
  const th = w * tt;
  const rr = R.r + R.lateral[j];
  const c = Math.cos(th), s = Math.sin(th);
  let x = R.x + rr * c, z = R.z + rr * s;
  let y = R.alt + 1.3 * Math.sin(th * 2 + 0.4) + 0.4 * Math.sin(tt * 1.7 + j);
  // loop window: once per lap, loopTime seconds long, starting at angle loopAt
  const lapT = TAU / w;
  let m = (tt - R.loopAt / w) % lapT; if (m < 0) m += lapT;
  if (m < R.loopTime) {
    const ph = TAU * m / R.loopTime;
    const k = R.loopR;
    // forward along the circle's tangent (-s, c), up by the loop
    x += -s * k * Math.sin(ph); z += c * k * Math.sin(ph);
    y += k * (1 - Math.cos(ph));
  }
  out.x = x; out.y = y; out.z = z;
  return out;
}

// ── palette (sRGB hex; vertex colours are converted to linear on the way in) ─
const C = {
  red: 0xe8263f, white: 0xfff8ee, pink: 0xffb3d1, mint: 0xa8f0d1, choc: 0x4a2a17, lic: 0x1a1218,
  gold: 0xffd23a, orange: 0xff8c1a, bear: 0xff9a1f, bearLight: 0xffc070, glass: 0xcfefff,
  jetWhite: 0xfbf8f2, jetOrange: 0xf0963c, jetTabby: 0xd8742a, navy: 0x1d3557, grey: 0x8a8a94, earPink: 0xffa3b8,
  gummy: 0xff3355, cream: 0xfff4e6, cocoa: 0x7a4a2a, eye: 0x1a1218, nose: 0xff7fa6,
  paperW: 0xffc4dd, paperY: 0xffd95a, paperB: 0xa9dcff, mdRed: 0xe0453a, blueLine: 0x4aa2ff, peach: 0xff7fa8,
  creaseW: 0xd98aae, creaseY: 0xd09a30, creaseB: 0x6fa6d8,
  capBlue: 0x2c4a86, tabby: 0xf29a3a, tabbyDark: 0xc8661e, brass: 0xe8b64a,
};

// ── geometry kit: merged, skinned, per-triangle coloured ─────────────────────
const _c = new THREE.Color();
const _v = new THREE.Vector3(), _n = new THREE.Vector3();
function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
class Kit {
  constructor() { this.P = []; this.N = []; this.C = []; this.U = []; this.SI = []; this.SW = []; this.I = []; this.GL = []; this.FL = []; this.glow = 0; this.fill = 0; }
  get count() { return this.P.length / 3; }
  vert(x, y, z, nx, ny, nz, col, u, v, b0, b1 = 0, w1 = 0) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(col.r, col.g, col.b); this.U.push(u, v);
    this.SI.push(b0, b1, 0, 0); this.SW.push(1 - w1, w1, 0, 0); this.GL.push(this.glow); this.FL.push(this.fill);
  }
  /** Rigid part. color: hex or fn(x,y,z [part-local centroid], X,Y,Z [aircraft-local]) → hex. */
  part(geo, m, color, bone, { flip = false, both = false, b1 = 0, w1 = 0 } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pre = g.attributes.position.array.slice();
    if (m) g.applyMatrix4(m);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const fn = typeof color === 'function' ? color : null;
    if (!fn) _c.setHex(color);
    for (let i = 0; i < p.length; i += 9) {
      if (fn) {
        _c.setHex(fn((pre[i] + pre[i + 3] + pre[i + 6]) / 3, (pre[i + 1] + pre[i + 4] + pre[i + 7]) / 3, (pre[i + 2] + pre[i + 5] + pre[i + 8]) / 3,
          (p[i] + p[i + 3] + p[i + 6]) / 3, (p[i + 1] + p[i + 4] + p[i + 7]) / 3, (p[i + 2] + p[i + 5] + p[i + 8]) / 3));
      }
      const order = flip ? [0, 6, 3] : [0, 3, 6];
      for (const j of order) { const s = flip ? -1 : 1; this.vert(p[i + j], p[i + j + 1], p[i + j + 2], n[i + j] * s, n[i + j + 1] * s, n[i + j + 2] * s, _c, 0, 0, bone, b1, w1); }
      if (both) for (const j of [0, 6, 3]) this.vert(p[i + j], p[i + j + 1], p[i + j + 2], -n[i + j], -n[i + j + 1], -n[i + j + 2], _c, 0, 0, bone, b1, w1);
    }
    geo.dispose(); if (g !== geo) g.dispose();
  }
  /** One flat triangle; a/b/c = [x,y,z]; bones per corner; both = also the back face. */
  tri(a, b, c, color, bones, both = true) {
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _n.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _v.cross(_n).normalize();
    _c.setHex(color);
    const bs = Array.isArray(bones) ? bones : [bones, bones, bones];
    this.vert(...a, _v.x, _v.y, _v.z, _c, 0, 0, bs[0]); this.vert(...b, _v.x, _v.y, _v.z, _c, 0, 0, bs[1]); this.vert(...c, _v.x, _v.y, _v.z, _c, 0, 0, bs[2]);
    if (both) { this.vert(...a, -_v.x, -_v.y, -_v.z, _c, 0, 0, bs[0]); this.vert(...c, -_v.x, -_v.y, -_v.z, _c, 0, 0, bs[2]); this.vert(...b, -_v.x, -_v.y, -_v.z, _c, 0, 0, bs[1]); }
  }
  /** A square rope/strut whose two ends ride two different bones. */
  link(boneA, a, boneB, b, hw, color, dirHint = [0, 0, -1]) {
    const d = new THREE.Vector3(...dirHint).normalize();
    const u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize().multiplyScalar(hw);
    const w = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar(hw);
    const ring = (p) => [[p[0] + u.x + w.x, p[1] + u.y + w.y, p[2] + u.z + w.z], [p[0] - u.x + w.x, p[1] - u.y + w.y, p[2] - u.z + w.z],
      [p[0] - u.x - w.x, p[1] - u.y - w.y, p[2] - u.z - w.z], [p[0] + u.x - w.x, p[1] + u.y - w.y, p[2] + u.z - w.z]];
    const A = ring(a), B = ring(b);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.tri(A[i], A[j], B[j], color, [boneA, boneA, boneB], true);
      this.tri(A[i], B[j], B[i], color, [boneA, boneB, boneB], true);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.GL, 1));
    g.setAttribute('aFill', new THREE.Float32BufferAttribute(this.FL, 1));
    if (this.I.length) g.setIndex(this.I);
    return g;
  }
}

/** Swept, tapered wing slab centred on x=0 (span along x, chord along z). */
function sweptWing(span, thick, chord, sweep, taper) {
  const g = new THREE.BoxGeometry(span, thick, chord, 2, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), f = Math.abs(x) / (span / 2);
    p.setZ(i, z * (1 - taper * f) + chord * 0.5 * taper * f - Math.abs(x) * sweep);
  }
  g.computeVertexNormals();
  return g;
}
/** A cylinder from a to b (aircraft-local). */
function tube(a, b, r0, r1 = r0, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = new THREE.Vector3().subVectors(B, A); const L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  return { g, m: new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)) };
}

/**
 * A ROPE LADDER skinned between two bones: `top` (f = 0) and `bot` (f = 1).
 * Every vertex sits at the SAME local offset in both bones' frames and is
 * weighted (1 − f, f), so linear-blend skinning places rung i at the lerp of
 * the two bone origins — the ladder unrolls, swings and stretches with no
 * rung ever squashing. Both bones carry the vehicle's rotation.
 */
function ladder(kit, top, bot, rungs, halfW, rungCol, ropeCol) {
  const col = new THREE.Color();
  const quad = (a, b, c, d, n, fa, fb, hex) => {      // a,b at fraction fa · c,d at fb
    col.setHex(hex);
    const V = (p, f) => kit.vert(p[0], p[1], p[2], n[0], n[1], n[2], col, 0, 0, top, bot, f);
    V(a, fa); V(b, fa); V(c, fb); V(a, fa); V(c, fb); V(d, fb);
  };
  const R = 0.075;
  for (const sx of [-1, 1]) {                        // two licorice ropes, cut at every rung
    const x = sx * halfW;
    for (let i = 0; i < rungs; i++) {
      const fa = i / rungs, fb = (i + 1) / rungs;
      const c = [[x - R, 0, -R], [x + R, 0, -R], [x + R, 0, R], [x - R, 0, R]];
      const N = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
      for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4]; quad(a, b, b, a, N[k], fa, fb, ropeCol); }
    }
  }
  for (let i = 1; i <= rungs; i++) {                 // candy-stick rungs, alternate red / cream
    const f = (i - 0.35) / rungs;
    const g = new THREE.BoxGeometry(halfW * 2 + 0.1, 0.13, 0.17);
    kit.part(g, null, i % 2 ? rungCol : C.white, top, { b1: bot, w1: f });
  }
}

// ── atlas (map + emissive) ───────────────────────────────────────────────────
const AT = 1024;
// 16 px gutters between cells so mipmaps never bleed one cell into the next
const RECT = {
  bannerDay: [0, 0, 1024, 120], bannerNight: [0, 136, 1024, 120],
  sugar: [0, 272, 640, 120], catnip: [0, 408, 640, 120],
  meow: [0, 544, 1024, 200], paw: [656, 272, 112, 112], gondola: [784, 272, 240, 60],
};
const FAT = '"Arial Black", "Trebuchet MS", system-ui, sans-serif';
/** atlas uv for a rect at (u,v) ∈ [0,1]², u left→right, v bottom→top. */
function uvAt(rect, u, v) { const [x, y, w, h] = rect; return [(x + 2 + u * (w - 4)) / AT, 1 - (y + 2 + (1 - v) * (h - 4)) / AT]; }

function fitFont(g, text, maxW, px, weight = '900') {
  let size = px;
  for (; size > 12; size -= 2) { g.font = `${weight} ${size}px ${FAT}`; if (g.measureText(text).width <= maxW) break; }
  return size;
}
function makeAtlas(renderer) {
  const cv = document.createElement('canvas'); cv.width = AT; cv.height = AT;
  const gv = document.createElement('canvas'); gv.width = AT; gv.height = AT;
  const g = cv.getContext('2d'), e = gv.getContext('2d');
  g.clearRect(0, 0, AT, AT); e.fillStyle = '#000'; e.fillRect(0, 0, AT, AT);
  g.textAlign = e.textAlign = 'center'; g.textBaseline = e.textBaseline = 'middle';
  g.lineJoin = e.lineJoin = 'round';

  const stripes = (ctx2, x, y, w, h, a, b, step = 24) => {
    ctx2.save(); ctx2.beginPath(); ctx2.rect(x, y, w, h); ctx2.clip();
    ctx2.fillStyle = a; ctx2.fillRect(x, y, w, h); ctx2.fillStyle = b;
    for (let i = -h; i < w + h; i += step * 2) { ctx2.beginPath(); ctx2.moveTo(x + i, y + h); ctx2.lineTo(x + i + step, y + h); ctx2.lineTo(x + i + step + h, y); ctx2.lineTo(x + i + h, y); ctx2.fill(); }
    ctx2.restore();
  };
  // ── banner, day: cream cloth, candy-stripe hems, red letters ──
  {
    const [x, y, w, h] = RECT.bannerDay;
    g.fillStyle = '#fff7ea'; g.fillRect(x, y, w, h);
    stripes(g, x, y, w, 14, '#e8263f', '#fff7ea', 14); stripes(g, x, y + h - 14, w, 14, '#e8263f', '#fff7ea', 14);
    // Contract P: the longer name. The cloth is 25 u (was 21) and the letters
    // are set 0.8-condensed into the same row, so on the cloth they stand
    // ~93 % as tall as the old WELCOME TO CANDYLAND and just as wide-set.
    const txt = 'WELCOME TO THE CANDY KINGDOM', tw = w - 144;
    const s = fitFont(g, txt, tw / 0.8, 80);
    g.lineWidth = 7; g.strokeStyle = '#7a1024'; g.strokeText(txt, x + w / 2, y + h / 2 + 3, tw);
    g.fillStyle = '#e8263f'; g.fillText(txt, x + w / 2, y + h / 2 + 3, tw);
    // gumdrops at both ends
    for (const [cx, col] of [[x + 28, '#5be27a'], [x + 53, '#3aa8ff'], [x + w - 28, '#ffe23a'], [x + w - 53, '#b35bff']]) {
      g.fillStyle = col; g.beginPath(); g.arc(cx, y + h / 2 + 8, 13, Math.PI, 0); g.lineTo(cx + 13, y + h / 2 + 18); g.lineTo(cx - 13, y + h / 2 + 18); g.fill();
    }
    void s;
  }
  // ── banner, night: plum cloth, glowing letters, and a pair of eyes at each end ──
  {
    const [x, y, w, h] = RECT.bannerNight;
    g.fillStyle = '#2b1842'; g.fillRect(x, y, w, h);
    stripes(g, x, y, w, 12, '#2b1842', '#6a3a8e', 12); stripes(g, x, y + h - 12, w, 12, '#2b1842', '#6a3a8e', 12);
    const txt = 'BE HOME BEFORE DARK';
    fitFont(g, txt, w - 170, 80); e.font = g.font;
    g.lineWidth = 6; g.strokeStyle = '#120818'; g.strokeText(txt, x + w / 2, y + h / 2 + 3);
    g.fillStyle = '#ffe9a8'; g.fillText(txt, x + w / 2, y + h / 2 + 3);
    e.fillStyle = '#d9b860'; e.fillText(txt, x + w / 2, y + h / 2 + 3);
    for (const cx of [x + 48, x + w - 48]) {
      for (const dx of [-12, 12]) {
        g.fillStyle = '#c8ff3a'; g.beginPath(); g.ellipse(cx + dx, y + h / 2, 8, 5, 0, 0, TAU); g.fill();
        e.fillStyle = '#b8ff2a'; e.beginPath(); e.ellipse(cx + dx, y + h / 2, 8, 5, 0, 0, TAU); e.fill();
        g.fillStyle = '#120818'; g.fillRect(cx + dx - 1.5, y + h / 2 - 4, 3, 8);
      }
    }
  }
  // ── blimp lettering: fat letters with a cream outline, transparent ground ──
  for (const [key, txt, fill, glow] of [['sugar', 'SUGAR', '#ff2f5c', '#ff5c8a'], ['catnip', 'CATNIP', '#23a04a', '#5dff8f']]) {
    const [x, y, w, h] = RECT[key];
    fitFont(g, txt, w - 40, 112); e.font = g.font;
    g.lineWidth = 16; g.strokeStyle = '#fff8ee'; g.strokeText(txt, x + w / 2, y + h / 2 + 5);
    g.lineWidth = 5; g.strokeStyle = '#3a1020'; g.strokeText(txt, x + w / 2, y + h / 2 + 5);
    g.fillStyle = fill; g.fillText(txt, x + w / 2, y + h / 2 + 5);
    e.fillStyle = glow; e.fillText(txt, x + w / 2, y + h / 2 + 5);
  }
  // ── MEOW AIR fuselage flank (symmetric, reads both sides): an orange cheat-
  //    line low down, a row of windows, and the name BIG above them — it is the
  //    one thing anyone should be able to read off the jet ──
  {
    const [x, y, w, h] = RECT.meow;
    g.fillStyle = '#f0963c'; g.fillRect(x, y + h - 30, w, 18);
    g.fillStyle = '#1d3557'; g.fillRect(x, y + h - 12, w, 6);
    for (let i = 0; i < 26; i++) {
      const cx = x + 30 + i * ((w - 60) / 25);
      g.fillStyle = '#1d3557'; g.beginPath(); g.roundRect(cx - 8, y + h - 62, 16, 22, 7); g.fill();
      e.fillStyle = '#ffcf6a'; e.beginPath(); e.roundRect(cx - 7, y + h - 61, 14, 20, 6); e.fill();
    }
    const txt = 'MEOW AIR';
    fitFont(g, txt, 790, 150); e.font = g.font;
    const ty = y + 70;
    g.lineWidth = 12; g.strokeStyle = '#fbf8f2'; g.strokeText(txt, x + w / 2, ty);
    g.lineWidth = 5; g.strokeStyle = '#0e1d33'; g.strokeText(txt, x + w / 2, ty);
    g.fillStyle = '#e8741c'; g.fillText(txt, x + w / 2, ty);
    e.fillStyle = '#7a4a18'; e.fillText(txt, x + w / 2, ty);      // logo lights after dark
    // a cat head either side of the name
    for (const cx of [x + w / 2 - 462, x + w / 2 + 462]) {
      g.fillStyle = '#1d3557'; g.beginPath(); g.arc(cx, ty + 4, 34, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(cx - 32, ty - 8); g.lineTo(cx - 24, ty - 44); g.lineTo(cx - 6, ty - 24); g.fill();
      g.beginPath(); g.moveTo(cx + 32, ty - 8); g.lineTo(cx + 24, ty - 44); g.lineTo(cx + 6, ty - 24); g.fill();
      g.fillStyle = '#f0963c'; g.beginPath(); g.arc(cx, ty + 4, 27, 0, TAU); g.fill();
      g.fillStyle = '#1d3557'; g.fillRect(cx - 14, ty - 2, 7, 11); g.fillRect(cx + 7, ty - 2, 7, 11);
      g.beginPath(); g.moveTo(cx - 5, ty + 14); g.lineTo(cx + 5, ty + 14); g.lineTo(cx, ty + 20); g.fill();
    }
  }
  // ── paw print for the jet's belly ──
  {
    const [x, y] = RECT.paw;
    g.fillStyle = '#fff8ee';
    g.beginPath(); g.ellipse(x + 56, y + 70, 27, 23, 0, 0, TAU); g.fill();
    for (const [dx, dy] of [[-30, 34], [-11, 21], [11, 21], [30, 34]]) { g.beginPath(); g.ellipse(x + 56 + dx, y + dy + 4, 10, 12.5, dx * 0.01, 0, TAU); g.fill(); }
  }
  // ── gondola windows ──
  {
    const [x, y, w, h] = RECT.gondola;
    for (let i = 0; i < 4; i++) {
      const cx = x + 32 + i * 64;
      g.fillStyle = '#fff4e6'; g.beginPath(); g.roundRect(cx - 26, y + 6, 52, h - 12, 12); g.fill();
      g.fillStyle = '#2a3d66'; g.beginPath(); g.roundRect(cx - 20, y + 12, 40, h - 24, 9); g.fill();
      g.fillStyle = '#9fd4ff'; g.fillRect(cx - 14, y + 16, 6, 10);
      e.fillStyle = '#ffc860'; e.beginPath(); e.roundRect(cx - 20, y + 12, 40, h - 24, 9); e.fill();
    }
  }
  const mk = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
    t.needsUpdate = true; return t;
  };
  return { map: mk(cv), glow: mk(gv) };
}

function makeBlobTexture() {
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 128;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 384, 128);
  g.filter = 'blur(2px)'; g.fillStyle = '#fff';
  // cell 0: a plane seen from above, nose at the top — chunky, so it reads on busy ground
  g.fillRect(53, 8, 22, 108); g.fillRect(6, 30, 116, 28); g.fillRect(34, 94, 60, 18);
  g.filter = 'none';
  // cell 1: soft ellipse
  const rg = g.createRadialGradient(192, 64, 4, 192, 64, 60);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.55, 'rgba(255,255,255,0.85)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(128, 0, 128, 128);
  // cell 2: a paper dart from above, nose at the top
  g.filter = 'blur(2px)'; g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(256 + 64, 6); g.lineTo(256 + 118, 120); g.lineTo(256 + 64, 104); g.lineTo(256 + 10, 120); g.closePath(); g.fill();
  g.filter = 'none';
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

// ── the system ───────────────────────────────────────────────────────────────
export function create(ctx) {
  const world = ctx.world;
  const group = new THREE.Group();
  group.name = 'planes';
  group.userData.noRay = true;
  group.userData.noFade = true; group.userData.noOcclude = true;
  ctx.scene.add(group);

  const bLoop = buildLoop(ROUTES.biplane.pts);

  // ── bones ──────────────────────────────────────────────────────────────────
  const K = 9;                 // banner bones
  const BANNER_L = 25, BANNER_H = 3.3, SEG = BANNER_L / (K - 1);
  const ROPE = 9, SAG = 3.3;   // path distance to the banner pole, and how far below the path it hangs
  const TOW_TAIL = [0, -0.05, -2.66], TOW_POLE = [0, BANNER_H / 2 + 0.22, 0.14];
  // in the air the banner streams out behind at (nearly) the plane's own
  // height: its path history is pulled this far toward the plane's altitude,
  // so a climb-out no longer hangs it 15 u below the plane like a sea anchor
  const STREAM = 0.78;
  const B = {}; let nb = 0;
  B.biplane = nb++; B.prop = nb++; B.banner = nb; nb += K;
  for (const k of ['jet', 'blimp', 'blimpPropL', 'blimpPropR', 'earL', 'earR', 'paper0', 'paper1', 'paper2', 'candy', 'canopy', 'scarf', 'wave',
    'ladM0', 'ladM1', 'ladJ0', 'ladJ1', 'hoseA', 'hoseM', 'hoseB', 'beaconC', 'beaconK', 'ropeM']) B[k] = nb++;
  const bones = [], inv = [];
  for (let i = 0; i < nb; i++) { const b = new THREE.Bone(); b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; b.name = 'planes_bone' + i; bones.push(b); inv.push(new THREE.Matrix4()); }
  for (let k = 0; k < K; k++) inv[B.banner + k].makeTranslation(0, 0, k * SEG);
  const skeleton = new THREE.Skeleton(bones, inv);
  const BM = bones.map((b) => b.matrixWorld);       // write targets
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -600, 0);

  // ── build the body ─────────────────────────────────────────────────────────
  const kb = new Kit();
  const kd = new Kit();
  const lights = [];           // [bone, x, y, z, hexColour, mode, size, phase]

  // BIPLANE ── +Z forward, +Y up, +X = port (left wing). Span 6.9 u: a candy-
  // cane biplane — white upper wing with red bands, red lower wing with white
  // bands, a spiral-striped fuselage, a peppermint cowl, and a gummy bear in
  // goggles and a streaming scarf sitting up in the open cockpit, waving.
  {
    const b = B.biplane;
    kb.fill = 0.3;                // sky-bounce on the undersides: they are what the ground sees
    kb.glow = 0.16;               // and a candy-lantern glow after dark, so it is not a black cut-out
    const spiral = (x, y, z) => ((Math.floor(y * 1.6 + (Math.atan2(z, x) / TAU) * 2 + 8) % 2) ? C.red : C.white);
    kb.part(new THREE.CylinderGeometry(0.8, 0.34, 4.7, 14, 10), M(0, 0.05, -0.3, Math.PI / 2), spiral, b);  // fuselage z ∈ [-2.65, 2.05]
    // peppermint cowl: a squashed dome in red/white wedges, gold ring, gold spinner
    kb.part(new THREE.SphereGeometry(0.84, 16, 10), M(0, 0.05, 2.05, 0, 0, 0, 1, 1, 0.62),
      (x, y) => ((Math.floor((Math.atan2(y, x) / TAU + 0.5) * 10) % 2) ? C.red : C.white), b);
    kb.part(new THREE.TorusGeometry(0.8, 0.09, 6, 20), M(0, 0.05, 1.95), C.gold, b);
    kb.glow = 0.4;
    kb.part(new THREE.ConeGeometry(0.3, 0.62, 10), M(0, 0.05, 2.78, Math.PI / 2), C.gold, b);
    kb.glow = 0.16;
    // wings: box + elliptical tip caps, banded along the span
    const band = (a, c) => (x) => ((Math.floor((x + 31) / 0.62) % 2) ? a : c);
    const wing = (w, y, z, chord, colFn, capCol) => {
      kb.part(new THREE.BoxGeometry(w, 0.22, chord, 10, 1, 1), M(0, y, z), colFn, b);
      for (const sx of [-1, 1]) {
        kb.part(new THREE.CylinderGeometry(chord / 2, chord / 2, 0.22, 12, 1, false, sx > 0 ? 0 : Math.PI, Math.PI),
          M(sx * w / 2, y, z, 0, 0, 0, 0.46, 1, 1), capCol, b);
      }
    };
    wing(6.2, 1.44, 0.55, 1.5, band(C.red, C.white), C.red);          // upper: white with red bands
    wing(5.4, -0.36, 0.62, 1.34, band(C.white, C.red), C.red);        // lower: red with white bands
    kb.glow = 0;
    for (const sx of [-1, 1]) for (const dz of [0.12, 0.98]) kb.part(new THREE.BoxGeometry(0.16, 1.58, 0.16), M(sx * 2.35, 0.54, dz), C.lic, b);
    for (const sx of [-1, 1]) kb.part(new THREE.BoxGeometry(0.13, 0.86, 0.13), M(sx * 0.42, 1.0, 0.62, 0, 0, -sx * 0.25), C.lic, b);
    // peppermint roundels on the upper wing's top and the lower wing's belly
    const mint = (x, y, z) => ((Math.floor((Math.atan2(z, x) / TAU + 0.5) * 8) % 2) ? C.red : C.white);
    for (const sx of [-1, 1]) {
      kb.part(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), M(sx * 2.0, 1.56, 0.55), mint, b);
      kb.part(new THREE.CylinderGeometry(0.52, 0.52, 0.05, 16), M(sx * 1.75, -0.48, 0.62), mint, b);
    }
    // tail: banded stabiliser + a red fin with a gumdrop cap
    kb.part(new THREE.BoxGeometry(2.6, 0.14, 1.0, 6, 1, 1), M(0, 0.14, -2.45), band(C.red, C.white), b);
    kb.part(new THREE.BoxGeometry(0.15, 1.35, 1.05), M(0, 0.8, -2.47), (x, y) => (y > 0.2 ? C.red : C.white), b);
    kb.part(new THREE.SphereGeometry(0.36, 8, 6), M(0, 1.45, -2.55, 0, 0, 0, 0.42, 0.75, 1.2), C.gummy, b);
    // undercarriage: licorice wheels with gold hubs
    for (const sx of [-1, 1]) {
      kb.part(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 12), M(sx * 0.95, -1.15, 0.95, 0, 0, Math.PI / 2), C.lic, b);
      kb.part(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 8), M(sx * 0.95, -1.15, 0.95, 0, 0, Math.PI / 2), C.gold, b);
      kb.part(new THREE.BoxGeometry(0.12, 0.9, 0.12), M(sx * 0.66, -0.72, 0.95, 0, 0, sx * 0.45), C.lic, b);
    }
    kb.part(new THREE.BoxGeometry(1.9, 0.1, 0.1), M(0, -1.15, 0.95), C.lic, b);
    // open cockpit (behind the upper wing, so the pilot is never hidden by it)
    kb.part(new THREE.TorusGeometry(0.47, 0.09, 6, 16), M(0, 0.64, -0.82, Math.PI / 2), C.choc, b);
    kb.part(new THREE.BoxGeometry(0.72, 0.34, 0.05), M(0, 0.84, -0.3, -0.42), C.glass, b);   // windscreen
    // the pilot: a gummy bear, head well above the rim
    kb.fill = 0.34;
    kb.part(new THREE.SphereGeometry(0.4, 10, 8), M(0, 0.72, -0.86), C.bear, b);                   // body
    kb.part(new THREE.SphereGeometry(0.45, 12, 10), M(0, 1.2, -0.84), C.bear, b);                  // head
    for (const sx of [-1, 1]) kb.part(new THREE.SphereGeometry(0.17, 8, 6), M(sx * 0.31, 1.58, -0.88), C.bear, b);  // round ears
    kb.part(new THREE.SphereGeometry(0.2, 8, 6), M(0, 1.06, -0.46, 0, 0, 0, 1.05, 0.8, 0.9), C.bearLight, b);  // muzzle
    kb.part(new THREE.SphereGeometry(0.075, 6, 4), M(0, 1.12, -0.29), C.lic, b);                  // nose
    kb.part(new THREE.TorusGeometry(0.455, 0.055, 6, 20), M(0, 1.3, -0.84, Math.PI / 2), C.choc, b);   // goggle strap
    for (const sx of [-1, 1]) {
      kb.glow = 0.5;
      kb.part(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), M(sx * 0.18, 1.3, -0.44, Math.PI / 2), C.glass, b);  // lenses
      kb.glow = 0;
      kb.part(new THREE.TorusGeometry(0.16, 0.05, 6, 12), M(sx * 0.18, 1.3, -0.4), C.gold, b);       // brass rims
    }
    kb.part(new THREE.TorusGeometry(0.33, 0.11, 6, 14), M(0, 0.92, -0.84, Math.PI / 2), C.red, b);   // scarf round the neck
    // the scarf's streaming tail and a waving paw each ride their own bone
    kb.part(new THREE.BoxGeometry(0.2, 0.08, 1.6, 1, 1, 6), M(0, 0, -0.8),
      (x, y, z) => ((Math.floor((z + 4) / 0.32) % 2) ? C.red : C.white), B.scarf);
    kb.part(new THREE.CylinderGeometry(0.1, 0.13, 0.62, 8), M(0, 0.31, 0), C.bear, B.wave);
    kb.part(new THREE.SphereGeometry(0.15, 8, 6), M(0, 0.66, 0), C.bearLight, B.wave);
    kb.fill = 0.3;
    // WAVE 4: the PASSENGER SEAT — a candy-striped deckchair strapped to the
    // fuselage behind the pilot (for one visitor, one sweet, one promise), and
    // the gold filler cap the pump's hose screws onto
    {
      const deck = (x, y, z) => ((Math.floor((z + 8) / 0.2) % 2) ? C.red : C.white);
      kb.part(new THREE.BoxGeometry(0.92, 0.2, 0.96), M(0, 0.47, -1.78), C.lic, b);                         // saddle
      kb.part(new THREE.BoxGeometry(0.86, 0.09, 0.88, 1, 1, 5), M(0, 0.6, -1.7, 0.05), deck, b);            // seat
      kb.part(new THREE.BoxGeometry(0.86, 0.95, 0.09, 1, 5, 1), M(0, 1.02, -2.2, -0.34), (x, y) => ((Math.floor((y + 8) / 0.19) % 2) ? C.red : C.white), b);   // back
      for (const sx of [-1, 1]) {
        kb.part(new THREE.BoxGeometry(0.1, 0.1, 0.8), M(sx * 0.47, 0.86, -1.75), C.gold, b);                // arm rests
        kb.part(new THREE.BoxGeometry(0.08, 0.34, 0.08), M(sx * 0.47, 0.7, -1.42), C.gold, b);
      }
      kb.part(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), M(0, 0.88, 1.3), C.gold, b);                 // filler cap
    }
    // propeller (own bone, hub at the origin, spins about +Z) — the blur disc is in fx
    kb.part(new THREE.BoxGeometry(0.24, 3.1, 0.09), null, (x, y) => ((Math.floor(y * 2.2 + 20) % 2) ? C.red : C.white), B.prop);
    kb.part(new THREE.SphereGeometry(0.16, 6, 4), M(0, 0, 0.06), C.gold, B.prop);
    // banner pole + gumdrop weight (on banner bone 0) and the tow rope
    kb.part(new THREE.BoxGeometry(0.18, BANNER_H + 0.6, 0.18), M(0, 0.05, 0.12), C.lic, B.banner);
    kb.part(new THREE.SphereGeometry(0.36, 8, 6), M(0, -BANNER_H / 2 - 0.42, 0.12, 0, 0, 0, 1, 0.8, 1), C.gummy, B.banner);
    // the tow rope: two spans through a free knot (ropeM) — it sags in the air
    // and, with the banner laid out at the pump, drops off the tail onto the
    // ground and runs along it to the lead pole
    kb.link(b, TOW_TAIL, B.ropeM, [0, 0, 0], 0.08, C.lic, [0, 0, -1]);
    kb.link(B.ropeM, [0, 0, 0], B.banner, TOW_POLE, 0.08, C.lic, [0, 0, -1]);
    kb.part(new THREE.SphereGeometry(0.13, 6, 4), null, C.lic, B.ropeM);
    kb.fill = 0;
    // nav lights: red to port, green to starboard, a white strobe on the fin, a red belly beacon
    lights.push([b, 3.5, 1.44, 0.55, 0xff2a2a, 0, 1.25, 0], [b, -3.5, 1.44, 0.55, 0x2aff5a, 0, 1.25, 0.3],
      [b, 0, 1.72, -2.58, 0xffffff, 2, 1.25, 0.15], [b, 0, -0.62, -0.9, 0xff3030, 1, 1.0, 0.55]);
  }

  // BANNER CLOTH (decal) — both faces, blended across the 9-bone chain
  const bannerVerts = [];      // [index, u, v, face]
  {
    const NU = 40, NV = 2;
    for (const face of [1, -1]) {
      const base = kd.count;
      for (let j = 0; j <= NV; j++) {
        for (let i = 0; i <= NU; i++) {
          const u = i / NU, v = j / NV;
          const z = -u * BANNER_L, y = (v - 0.5) * BANNER_H;
          const f = u * (K - 1); const k = Math.min(K - 2, Math.floor(f)); const w = f - k;
          _c.setHex(0xffffff);
          bannerVerts.push([kd.count, u, v, face]);
          kd.vert(face * 0.03, y, z, face, 0, 0, _c, 0, 0, B.banner + k, B.banner + k + 1, w);
        }
      }
      for (let j = 0; j < NV; j++) {
        for (let i = 0; i < NU; i++) {
          const a = base + j * (NU + 1) + i, b2 = a + 1, c2 = a + NU + 1, d = c2 + 1;
          if (face > 0) kd.I.push(a, b2, d, a, d, c2); else kd.I.push(a, d, b2, a, c2, d);
        }
      }
    }
  }

  // JET ── MEOW AIR
  {
    const b = B.jet;
    kb.fill = 0.26;
    const belly = (x, y, z, X, Y) => (Y < -0.42 ? C.jetOrange : C.jetWhite);
    kb.part(new THREE.CylinderGeometry(1.1, 1.1, 11, 14, 4), M(0, 0, 0.5, Math.PI / 2), belly, b);
    kb.part(new THREE.SphereGeometry(1.1, 14, 8), M(0, 0, 6.0, 0, 0, 0, 1, 1, 2.0),
      (x, y, z, X, Y, Z) => (Z > 6.9 && Z < 7.9 && Y > 0.1 ? C.navy : (Y < -0.42 ? C.jetOrange : C.jetWhite)), b);
    kb.part(new THREE.CylinderGeometry(1.1, 0.42, 3.8, 14, 2), M(0, 0.22, -6.9, Math.PI / 2 - 0.06), belly, b);
    for (const sx of [-1, 1]) {
      kb.part(new THREE.ConeGeometry(0.52, 1.0, 4), M(sx * 0.62, 1.22, 4.8, 0, Math.PI / 4, -sx * 0.28), C.jetOrange, b);
      kb.part(new THREE.ConeGeometry(0.3, 0.6, 4), M(sx * 0.6, 1.2, 5.05, 0, Math.PI / 4, -sx * 0.28), C.earPink, b);
    }
    kb.part(sweptWing(15.2, 0.28, 2.9, 0.42, 0.45), M(0, -0.5, 1.0), (x) => (Math.abs(x) > 6.1 ? C.jetOrange : C.jetWhite), b);
    kb.part(sweptWing(5.8, 0.2, 1.6, 0.5, 0.4), M(0, 0.45, -7.5), (x) => (Math.abs(x) > 2.1 ? C.jetOrange : C.jetWhite), b);
    for (const sx of [-1, 1]) {
      kb.part(new THREE.CylinderGeometry(0.6, 0.5, 2.4, 12), M(sx * 3.4, -1.2, 1.05, Math.PI / 2), C.grey, b);
      kb.part(new THREE.CylinderGeometry(0.63, 0.63, 0.22, 12), M(sx * 3.4, -1.2, 2.3, Math.PI / 2), C.jetOrange, b);
      kb.part(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 10), M(sx * 3.4, -1.2, 2.42, Math.PI / 2), C.lic, b);
      kb.part(new THREE.BoxGeometry(0.22, 0.55, 1.3), M(sx * 3.4, -0.72, 1.2), C.grey, b);
    }
    // the fin is a cat's tail: tabby-ringed, curling forward, white tip
    const pts = [[0, 0.7, -6.3], [0, 2.1, -7.5], [0, 3.5, -8.1], [0, 4.8, -7.9], [0, 5.6, -7.1], [0, 5.75, -6.15]];
    for (let i = 0; i < pts.length - 1; i++) {
      const r0 = 0.62 - i * 0.05, r1 = 0.62 - (i + 1) * 0.05;
      const { g, m } = tube(pts[i], pts[i + 1], r0, r1, 10);
      kb.part(g, m, i === pts.length - 2 ? C.jetWhite : (i % 2 ? C.jetTabby : C.jetOrange), b);
      if (i > 0) kb.part(new THREE.SphereGeometry(r0, 10, 6), M(...pts[i]), i % 2 ? C.jetTabby : C.jetOrange, b);
    }
    kb.part(new THREE.SphereGeometry(0.4, 10, 6), M(...pts[pts.length - 1]), C.jetWhite, b);
    // livery panels (decal): MEOW AIR both flanks, paw on the belly
    for (const side of [1, -1]) {
      const NU = 12, NV = 4, base = kd.count, z0 = -4.6, z1 = 4.6, a0 = -0.42, a1 = 1.1, r = 1.135;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const u = i / NU, v = j / NV, z = z0 + (z1 - z0) * (side > 0 ? 1 - u : u), a = a0 + (a1 - a0) * v;
        const [U, V] = uvAt(RECT.meow, u, v);
        _c.setHex(0xffffff);
        kd.vert(side * r * Math.cos(a), r * Math.sin(a), z + 0.5, side * Math.cos(a), Math.sin(a), 0, _c, U, V, b);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = base + j * (NU + 1) + i, b2 = a + 1, c2 = a + NU + 1, d = c2 + 1;
        kd.I.push(a, b2, d, a, d, c2);     // u runs nose→tail on port, tail→nose on starboard: outward both sides
      }
    }
    {
      const base = kd.count; _c.setHex(0xffffff);
      const q = [[-0.62, -0.9], [0.62, -0.9], [0.62, 3.3], [-0.62, 3.3]];
      const uvq = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let i = 0; i < 4; i++) { const [U, V] = uvAt(RECT.paw, uvq[i][0], uvq[i][1]); kd.vert(q[i][0], -1.15, q[i][1], 0, -1, 0, _c, U, V, b); }
      kd.I.push(base, base + 1, base + 2, base, base + 2, base + 3);   // faces −Y (seen from the ground)
    }
    kb.fill = 0;
    const tipZ = -1.0;          // swept tip: 1.0 − 7.6·0.42 + taper shift ≈ −1.5 … −0.9
    lights.push([b, 7.7, -0.5, tipZ - 0.6, 0xff2a2a, 0, 1.7, 0], [b, -7.7, -0.5, tipZ - 0.6, 0x2aff5a, 0, 1.7, 0.5],
      [b, 7.6, -0.5, tipZ - 0.9, 0xffffff, 2, 1.6, 0.1], [b, -7.6, -0.5, tipZ - 0.9, 0xffffff, 2, 1.6, 0.1],
      [b, 0, -1.25, 0.8, 0xff3030, 1, 1.6, 0.2], [b, 0, 1.18, 1.8, 0xff3030, 1, 1.5, 0.65], [b, 0, 6.3, -6.15, 0xffffff, 2, 1.5, 0.4]);
  }

  // CATBLIMP
  const BLIMP_R = 4.2, BLIMP_L = 12.5;
  // the balcony deck (blimp frame): the passenger stands on it, the ladder
  // hangs off its back edge. LAD_BACK = how far the ladder foot is behind the
  // envelope's centre; NOSE = centre → mast contact.
  const BAL = { y: -6.2, z: -3.25 }, LAD_TOP = { y: -6.3, z: -4.05 }, LAD_BACK = 4.05, NOSE = 12.85;
  const blimpRadius = (z) => { const t = z / BLIMP_L; let r = BLIMP_R * Math.sqrt(Math.max(0, 1 - t * t)); if (z < 0) r *= 1 - 0.22 * t * t; return r; };
  {
    const b = B.blimp;
    const env = new THREE.SphereGeometry(1, 20, 14);
    env.rotateX(Math.PI / 2);
    const p = env.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) * BLIMP_L; const t = z / BLIMP_L; const k = z < 0 ? 1 - 0.22 * t * t : 1;
      p.setXYZ(i, p.getX(i) * BLIMP_R * k, p.getY(i) * BLIMP_R * k, z);
    }
    env.computeVertexNormals();
    kb.glow = 0.34;               // a paper-lantern blimp after dark
    kb.part(env, null, (x, y, z) => {
      if (z > 11.2 || z < -11.8) return C.cream;
      return (Math.floor((Math.atan2(y, x) / TAU + 0.5) * 14 + 0.5) % 2) ? C.pink : C.mint;
    }, b);
    kb.glow = 0;
    // cat face on the nose
    for (const sx of [-1, 1]) {
      // the eyes: black by day; after dark they light up amber round a slit
      // pupil (glow × lampMix) — a lantern blimp that is looking at you
      kb.glow = 60;
      kb.part(new THREE.SphereGeometry(0.72, 10, 8), M(sx * 1.3, 1.05, 10.98, 0, 0, 0, 1, 1, 0.7), 0x201a06, b);
      kb.glow = 0;
      kb.part(new THREE.BoxGeometry(0.17, 0.92, 0.06), M(sx * 1.3, 1.05, 11.47, 0, sx * 0.12, 0), C.eye, b);
      kb.part(new THREE.SphereGeometry(0.22, 6, 5), M(sx * 1.18, 1.32, 11.35), 0xffffff, b);
      for (const k of [-1, 0, 1]) kb.part(new THREE.BoxGeometry(2.3, 0.14, 0.14), M(sx * 2.05, -0.15 + k * 0.32, 11.25, 0, sx * 0.35, sx * k * 0.2), C.lic, b);
    }
    kb.part(new THREE.SphereGeometry(0.42, 8, 6), M(0, 0.1, 12.35, 0, 0, 0, 1.2, 0.8, 0.8), C.nose, b);
    kb.part(new THREE.BoxGeometry(1.0, 0.13, 0.13), M(0, -0.55, 12.12), C.lic, b);
    kb.fill = 0.22;
    // tail fins: chunky rounded paddles (half-buried ellipsoids, swept back),
    // gummy red with a cream tip — never flat slabs
    const finGeo = (h) => {
      const g = new THREE.SphereGeometry(1, 12, 8); const q = g.attributes.position;
      for (let i = 0; i < q.count; i++) {
        const y = q.getY(i);
        q.setXYZ(i, q.getX(i) * 0.34, y * h, q.getZ(i) * 2.3 - 0.62 * Math.max(0, y) * h);
      }
      g.computeVertexNormals(); return g;
    };
    // band edges sit on the sphere's latitude rows (cos 45°, cos 67.5°), so no row is split into a zigzag
    const fin = (h) => (x, y) => (y > 0.66 * h ? C.cream : (y > 0.42 * h ? C.mint : C.gummy));
    const rTail = blimpRadius(-9.6);
    kb.glow = 0.14;
    kb.part(finGeo(3.4), M(0, rTail - 0.2, -9.6), fin(3.4), b);
    kb.part(finGeo(2.9), M(0, -rTail + 0.2, -9.6, 0, 0, Math.PI), fin(2.9), b);
    for (const sx of [-1, 1]) kb.part(finGeo(3.4), M(sx * (rTail - 0.2), 0, -9.6, 0, 0, -sx * Math.PI / 2), fin(3.4), b);
    kb.glow = 0;
    // the gondola: a rounded car (superellipsoid), cream over a cocoa keel with
    // a pink sash, candy-striped awnings over the windows, and a cat looking
    // out of the front window on each side (the port one is the captain)
    const GZ = 0.9, GY = -5.3, GH = [1.45, 1.0, 3.3];
    {
      const g = new THREE.BoxGeometry(2, 2, 2, 6, 8, 10); const q = g.attributes.position;
      for (let i = 0; i < q.count; i++) {
        const x = q.getX(i), y = q.getY(i), z = q.getZ(i);
        const n = Math.pow(Math.abs(x) ** 6 + Math.abs(y) ** 6 + Math.abs(z) ** 6, 1 / 6);
        q.setXYZ(i, x / n * GH[0], y / n * GH[1], z / n * GH[2]);
      }
      g.computeVertexNormals();
      kb.part(g, M(0, GY, GZ), (x, y) => (y > -0.26 ? C.cream : (y > -0.52 ? C.pink : C.cocoa)), b);   // row edges at ±0.25/0.5 of the half-height
    }
    for (const dz of [-1.2, 3.1]) for (const sx of [-1, 1]) kb.part(new THREE.BoxGeometry(0.22, 0.75, 0.22), M(sx * 0.7, -4.15, dz, 0, 0, sx * 0.25), C.choc, b);
    // WAVE 4: the OBSERVATION BALCONY at the back of the car — a wafer deck
    // with a candy-cane rail, where the rope ladder hangs and a passenger rides
    {
      const BZ = BAL.z, BY = BAL.y;
      kb.part(new THREE.BoxGeometry(1.95, 0.2, 1.62), M(0, BY - 0.1, BZ), C.cocoa, b);
      kb.part(new THREE.BoxGeometry(1.85, 0.06, 1.52, 1, 1, 6), M(0, BY + 0.01, BZ), (x, y, z) => ((Math.floor((z + 8) / 0.26) % 2) ? 0xe9b877 : 0xd89a5a), b);
      const cane = (x, y) => ((Math.floor((y + 20) / 0.22) % 2) ? C.red : C.white);
      for (const [px, pz] of [[-0.9, -0.74], [0.9, -0.74], [-0.9, 0.62], [0.9, 0.62], [-0.36, -0.74], [0.36, -0.74]]) {
        kb.part(new THREE.CylinderGeometry(0.075, 0.075, 1.0, 8, 4), M(px, BY + 0.5, BZ + pz), cane, b);
        kb.part(new THREE.SphereGeometry(0.11, 8, 6), M(px, BY + 1.02, BZ + pz), C.gold, b);
      }
      for (const sx of [-1, 1]) kb.part(new THREE.BoxGeometry(0.09, 0.09, 1.36), M(sx * 0.9, BY + 0.95, BZ - 0.06), C.red, b);   // side rails
      for (const sx of [-1, 1]) kb.part(new THREE.BoxGeometry(0.54, 0.09, 0.09), M(sx * 0.63, BY + 0.95, BZ - 0.74), C.red, b);   // rear rail, a gap for the ladder
      kb.part(new THREE.BoxGeometry(0.86, 0.12, 0.12), M(0, BY - 0.06, BZ - 0.8), C.gold, b);                               // ladder bar
    }
    for (const sx of [-1, 1]) {
      // awning over the windows, sloping out and down
      kb.part(new THREE.BoxGeometry(0.66, 0.09, 4.2, 1, 1, 8), M(sx * 1.62, -4.6, 0.05, 0, 0, -sx * 0.55),
        (x, y, z) => ((Math.floor((z + 10) / 0.525) % 2) ? C.red : C.white), b);   // stops short of the front window: that one is the captain's
      // engine pod on an outrigger behind the car, pusher prop at its tail
      kb.part(new THREE.BoxGeometry(2.1, 0.26, 0.66), M(sx * 2.1, -5.15, -2.55, 0, sx * 0.35, 0), C.choc, b);
      kb.part(new THREE.CylinderGeometry(0.8, 0.56, 2.5, 12), M(sx * 3.1, -5.15, -3.5, Math.PI / 2), C.gummy, b);
      kb.part(new THREE.SphereGeometry(0.8, 12, 8), M(sx * 3.1, -5.15, -2.25, 0, 0, 0, 1, 1, 0.62), C.cream, b);
      kb.part(new THREE.TorusGeometry(0.74, 0.09, 6, 16), M(sx * 3.1, -5.15, -2.95), C.gold, b);
      // a cat in the front window, looking out (captain's hat to port)
      const cx = sx * 1.45, cy = -5.1, cz = 2.8, k = 1.3;      // head scale
      const fur = sx > 0 ? C.tabby : C.grey;
      kb.part(new THREE.SphereGeometry(0.46 * k, 12, 8), M(cx, cy, cz), fur, b);
      kb.part(new THREE.SphereGeometry(0.22 * k, 8, 6), M(cx + sx * 0.36 * k, cy - 0.12 * k, cz, 0, 0, 0, 0.8, 0.75, 1.2), C.cream, b);
      kb.part(new THREE.SphereGeometry(0.08 * k, 6, 4), M(cx + sx * 0.55 * k, cy - 0.04 * k, cz), C.nose, b);
      for (const dz of [-0.17, 0.17]) {
        kb.part(new THREE.SphereGeometry(0.085 * k, 6, 4), M(cx + sx * 0.41 * k, cy + 0.1 * k, cz + dz * k), C.eye, b);
        kb.part(new THREE.ConeGeometry(0.2 * k, 0.42 * k, 4), M(cx + sx * 0.05, cy + 0.46 * k, cz + dz * 1.6 * k, dz * 1.2, Math.PI / 4, 0), fur, b);
      }
      kb.part(new THREE.SphereGeometry(0.19, 8, 6), M(cx + sx * 0.35, cy - 0.62, cz + 0.55), fur, b);    // paw on the sill
      if (sx > 0) {
        kb.part(new THREE.CylinderGeometry(0.36 * k, 0.36 * k, 0.12, 12), M(cx, cy + 0.44 * k, cz), C.capBlue, b);
        kb.part(new THREE.CylinderGeometry(0.27 * k, 0.3 * k, 0.22, 12), M(cx, cy + 0.44 * k + 0.16, cz), C.white, b);
        kb.part(new THREE.BoxGeometry(0.14, 0.12, 0.14), M(cx + 0.33 * k, cy + 0.46 * k, cz), C.gold, b);
      }
    }
    // bunting: two strings of flags, envelope → gondola nose and gondola tail → envelope
    {
      const FLAG = [C.pink, C.mint, C.gold, 0x6ec3ff, C.red];
      const string = (a, c, sag) => {
        const n = Math.max(2, Math.round(Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) / 0.72));
        const P = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          P.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t]);
        }
        for (let i = 0; i < n; i++) {
          kb.link(b, P[i], b, P[i + 1], 0.045, C.lic, [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1], P[i + 1][2] - P[i][2]]);
          const m = [(P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2 - 0.62, (P[i][2] + P[i + 1][2]) / 2];
          kb.tri(P[i], P[i + 1], m, FLAG[i % FLAG.length], b);
        }
      };
      const zf = 8.6, zb = -7.4;
      string([0, -blimpRadius(zf) + 0.25, zf], [0, -4.5, GZ + GH[2] - 0.35], 0.5);
      string([0, -4.5, GZ - GH[2] + 0.35], [0, -blimpRadius(zb) + 0.25, zb], 0.45);
    }
    kb.fill = 0;
    // ears (own bones so they can twitch), pivot at the base
    kb.glow = 0.3;
    for (const [bone] of [[B.earL, 1], [B.earR, -1]]) {
      kb.part(new THREE.ConeGeometry(1.15, 2.1, 4), M(0, 1.0, 0, 0, Math.PI / 4, 0), (x, y, z, X, Y, Z) => C.pink, bone);
      kb.part(new THREE.ConeGeometry(0.62, 1.3, 4), M(0, 0.78, 0.42, 0, Math.PI / 4, 0), C.earPink, bone);
    }
    kb.glow = 0;
    // pusher props
    for (const bone of [B.blimpPropL, B.blimpPropR]) {
      kb.part(new THREE.BoxGeometry(0.26, 2.7, 0.08), null, (x, y) => ((Math.floor(y * 2 + 20) % 2) ? C.gummy : C.cream), bone);
      kb.part(new THREE.SphereGeometry(0.24, 8, 6), null, C.gold, bone);
    }
    // lettering (decal): SUGAR to port (+X), CATNIP to starboard (−X)
    for (const [side, rect] of [[1, RECT.sugar], [-1, RECT.catnip]]) {
      const NU = 18, NV = 4, base = kd.count, z0 = -6.4, z1 = 7.6, a0 = -0.36, a1 = 0.36;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const u = i / NU, v = j / NV;
        const z = side > 0 ? z1 - (z1 - z0) * u : z0 + (z1 - z0) * u;
        const a = a0 + (a1 - a0) * v, r = blimpRadius(z) + 0.08;
        const [U, V] = uvAt(rect, u, v);
        _c.setHex(0xffffff);
        kd.vert(side * r * Math.cos(a), r * Math.sin(a), z, side * Math.cos(a), Math.sin(a), 0, _c, U, V, b);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = base + j * (NU + 1) + i, b2 = a + 1, c2 = a + NU + 1, d = c2 + 1;
        kd.I.push(a, b2, d, a, d, c2);     // u runs nose→tail on port, tail→nose on starboard: outward both sides
      }
    }
    // gondola windows (decal), both sides
    for (const side of [1, -1]) {
      const base = kd.count; _c.setHex(0xffffff);
      const zs = side > 0 ? [3.3, -1.3] : [-1.3, 3.3];
      const q = [[zs[0], -5.5], [zs[1], -5.5], [zs[1], -4.78], [zs[0], -4.78]];
      const uvq = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let i = 0; i < 4; i++) { const [U, V] = uvAt(RECT.gondola, uvq[i][0], uvq[i][1]); kd.vert(side * 1.468, q[i][1], q[i][0], side, 0, 0, _c, U, V, b); }
      kd.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    // nav lights: red to port and green to starboard on the side fins' tips and
    // the gondola nose, white tail strobe, red beacons top and bottom
    const finTip = rTail - 0.2 + 3.3;
    lights.push([b, 0, 4.4, 0.5, 0xff3030, 1, 2.0, 0.4], [b, 0, 0.4, -12.9, 0xffffff, 2, 1.7, 0.0],
      [b, finTip, 0, -11.6, 0xff2a2a, 0, 1.6, 0], [b, -finTip, 0, -11.6, 0x2aff5a, 0, 1.6, 0],
      [b, 1.25, -5.6, 3.95, 0xff2a2a, 0, 1.1, 0], [b, -1.25, -5.6, 3.95, 0x2aff5a, 0, 1.1, 0],
      [b, 0, -6.25, 1.0, 0xff3030, 1, 1.5, 0.75]);
  }

  // PAPER PLANES — giant darts (5.3 u nose to tail) with a real dihedral, so
  // the centre fold reads as a valley and the wing folds as creases; printed
  // ruled lines / a menu band on top; lit from within (paper is translucent),
  // so they stay paper-white or pastel from below too.
  const PS = 2.0;
  {
    const looks = [[C.paperW, C.blueLine, C.creaseW], [C.paperY, C.mdRed, C.creaseY], [C.paperB, C.peach, C.creaseB]];   // pink ruled, menu yellow, sky blue
    const S = (p) => [p[0] * PS, p[1] * PS, p[2] * PS];
    const mix3 = (A, Bp, Cp, u, v, lift) => [A[0] + u * (Bp[0] - A[0]) + v * (Cp[0] - A[0]), A[1] + u * (Bp[1] - A[1]) + v * (Cp[1] - A[1]) + lift, A[2] + u * (Bp[2] - A[2]) + v * (Cp[2] - A[2])];
    kb.fill = 0.62; kb.glow = 0.3;              // translucent by day, pale in moonlight
    for (let j = 0; j < 3; j++) {
      const b = B['paper' + j];
      const [wc, kc, cc] = looks[j];
      const nose = S([0, 0.02, 1.65]), tc = S([0, -0.03, -1.45]), kbt = S([0, -0.5, -1.45]);
      for (const sx of [1, -1]) {
        const ml = S([sx * 0.52, 0.13, -1.45]), tl = S([sx * 1.38, 0.44, -1.45]);
        kb.tri(nose, tc, ml, wc, b); kb.tri(nose, ml, tl, wc, b);      // inner + outer panel: the fold between them is a crease
        // printing on the outer panel: two ruled lines (white), one fat menu band (yellow), one stripe (blue)
        const bands = j === 0 ? [[0.3, 0.06], [0.64, 0.06]] : j === 1 ? [[0.36, 0.26]] : [[0.5, 0.12]];
        for (const [f, wdt] of bands) {
          kb.tri(mix3(nose, ml, tl, 0.1, 0.06, 0.03), mix3(nose, ml, tl, 1 - f, f, 0.03), mix3(nose, ml, tl, 1 - f - wdt, f + wdt, 0.03), kc, b);
        }
      }
      kb.tri(nose, kbt, tc, cc, b);                                   // keel
      kb.tri([nose[0], nose[1] + 0.03, nose[2] - 0.1], [tc[0] + 0.1, tc[1] + 0.035, tc[2]], [tc[0] - 0.1, tc[1] + 0.035, tc[2]], cc, b);   // the centre fold
      // glow-stick wingtips (the one concession to aviation law) and a tail blinker
      lights.push([b, 1.38 * PS, 0.44 * PS, -1.45 * PS, 0xff3a3a, 0, 0.8, j * 0.3], [b, -1.38 * PS, 0.44 * PS, -1.45 * PS, 0x3aff6a, 0, 0.8, j * 0.3],
        [b, 0, 0.05, -1.45 * PS, 0xffffff, 2, 0.75, j * 0.37]);
    }
    kb.fill = 0; kb.glow = 0;
  }

  // PARACHUTE SWEET
  {
    const cb = B.candy, pb = B.canopy;
    kb.glow = 0.55;               // a sweet you can find in the dark
    kb.part(new THREE.SphereGeometry(0.46, 12, 8), M(0, 0, 0, 0, 0, 0, 1.4, 1, 1), (x, y, z) => ((Math.floor(x * 5 + Math.atan2(z, y) + 20) % 2) ? C.gummy : C.white), cb);
    kb.part(new THREE.ConeGeometry(0.34, 0.52, 7), M(0.9, 0, 0, 0, 0, Math.PI / 2), C.gold, cb);
    kb.part(new THREE.ConeGeometry(0.34, 0.52, 7), M(-0.9, 0, 0, 0, 0, -Math.PI / 2), C.gold, cb);
    kb.glow = 0;
    const canopy = new THREE.SphereGeometry(1.8, 14, 5, 0, TAU, 0, Math.PI / 2);
    canopy.scale(1, 0.62, 1);
    kb.part(canopy, null, (x, y, z) => ((Math.floor((Math.atan2(z, x) / TAU + 0.5) * 14) % 2) ? C.red : C.white), pb, { both: true });
    kb.part(new THREE.SphereGeometry(0.2, 6, 4), M(0, 1.15, 0), C.gold, pb);
    for (const [x, z] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) kb.link(pb, [x, 0, z], cb, [x * 0.12, 0.38, z * 0.12], 0.035, C.lic, [x, -2.4, z]);
    lights.push([cb, 0, 0, 0, 0xff6fb0, 0, 1.3, 0]);
  }

  // WAVE 4: rope ladders (blimp balcony · jet belly), the pump hose (three
  // bones: nozzle · sag · filler cap; parked under the world when not in use)
  kb.fill = 0.25;
  ladder(kb, B.ladM0, B.ladM1, 13, 0.42, C.red, C.lic);
  ladder(kb, B.ladJ0, B.ladJ1, 18, 0.46, C.jetOrange, C.navy);
  kb.link(B.hoseA, [0, 0, 0], B.hoseM, [0, 0, 0], 0.11, 0x3fbf6a, [0, 0, 1]);
  kb.link(B.hoseM, [0, 0, 0], B.hoseB, [0, 0, 0], 0.11, 0x3fbf6a, [0, 0, 1]);
  kb.fill = 0;
  // mooring-mast beacons (static bones, placed once) — red, slow pulse, night only
  lights.push([B.beaconC, 0, 0, 0, 0xff3030, 1, 2.2, 0.1], [B.beaconK, 0, 0, 0, 0xff3030, 1, 2.2, 0.6]);

  // ── meshes ─────────────────────────────────────────────────────────────────
  const bodyGeo = kb.build();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0, emissive: 0x1b1418 });
  const uGlow = { value: 0 };
  // Sky-bounce fill: faces turned away from the sun get lit by the sky (the
  // aircraft are nearly always seen from BELOW, i.e. their shadow side), and
  // paper is translucent. uSunV is the sun in view space, uDay the daylight.
  const uSunV = { value: new THREE.Vector3(0, 1, 0) }, uDay = { value: 1 };
  // Aircraft read through HALF the scene's distance fog: a biplane 100 u up
  // should look like a biplane, not a grey speck (sky.js patches fog_fragment
  // for aerial perspective; scaling the depth keeps that look, just further out).
  const FOG_K = '0.5';
  const fogVert = (vs) => vs.replace('#include <fog_vertex>', '#include <fog_vertex>\n#ifdef USE_FOG\nvFogDepth *= ' + FOG_K + ';\n#endif');
  const FILL_GLSL = '(0.35 + 0.65 * (1.0 - max(dot(normal, uSunV), 0.0)))';
  bodyMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = uGlow; sh.uniforms.uSunV = uSunV; sh.uniforms.uDay = uDay;
    sh.vertexShader = fogVert(sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nattribute float aFill;\nvarying float vGlow;\nvarying float vFill;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvGlow = aGlow;\nvFill = aFill;'));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform float uDay;\nuniform vec3 uSunV;\nvarying float vGlow;\nvarying float vFill;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * (vGlow * uGlow + vFill * uDay * ' + FILL_GLSL + ');');
  };
  bodyMat.customProgramCacheKey = () => 'planes_body_glow_v2';
  const body = new THREE.SkinnedMesh(bodyGeo, bodyMat);
  body.name = 'planes_body';

  const atlas = makeAtlas(ctx.renderer);
  const decalGeo = kd.build();
  const decalMat = new THREE.MeshStandardMaterial({
    map: atlas.map, emissiveMap: atlas.glow, emissive: 0xffffff, emissiveIntensity: 0,
    roughness: 0.72, metalness: 0, alphaTest: 0.45, side: THREE.FrontSide,
  });
  decalMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunV = uSunV; sh.uniforms.uDay = uDay;
    sh.vertexShader = fogVert(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDay;\nuniform vec3 uSunV;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.3 * uDay * ' + FILL_GLSL + ';');
  };
  decalMat.customProgramCacheKey = () => 'planes_decal_v2';
  const decal = new THREE.SkinnedMesh(decalGeo, decalMat);
  decal.name = 'planes_decal';
  for (const m of [body, decal]) {
    m.bindMode = THREE.DetachedBindMode;
    m.bind(skeleton, new THREE.Matrix4());
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    m.userData.noFade = true; m.userData.noOcclude = true; m.userData.noInstOcclude = true; m.userData.noRay = true;
    m.raycast = NO_RAY;
    group.add(m);
  }

  // banner UVs: day / night rows of the atlas
  const bannerUV = decalGeo.attributes.uv;
  function setBannerText(night) {
    const rect = night ? RECT.bannerNight : RECT.bannerDay;
    for (const [i, u, v, face] of bannerVerts) { const [U, V] = uvAt(rect, face > 0 ? u : 1 - u, v); bannerUV.setXY(i, U, V); }
    bannerUV.needsUpdate = true;
  }
  let bannerNight = null;

  // ── fx: contrails + prop blur discs ───────────────────────────────────────
  // Contrails: per engine a chain of rings, each ring 5 verts (left, centre,
  // right, up, down) with alpha only at the centre, so the two crossed strips
  // read as a soft round tube from any angle instead of a flat ribbon.
  // Prop discs: a centre + four rings (hub, blade body, tip band, soft edge),
  // with two bright streaks that trail each blade and turn with it.
  const TM = 48;                          // contrail segments per engine
  const TV = 5;                           // verts per contrail ring
  const DISC = 24;                        // verts per disc ring
  const DR = [0.3, 0.84, 0.97, 1.06];     // disc ring radii (× prop radius)
  const nTrail = 2 * (TM + 1) * TV;
  const nDiscV = 1 + DR.length * DISC;
  const nDisc = 3 * nDiscV;
  const fxPos = new Float32Array((nTrail + nDisc) * 3);
  const fxCol = new Float32Array((nTrail + nDisc) * 4).fill(1);
  const fxIdx = [];
  for (let e = 0; e < 2; e++) for (let i = 0; i < TM; i++) {
    const a = (e * (TM + 1) + i) * TV, n = a + TV;       // 0 L · 1 C · 2 R · 3 U · 4 D
    for (const [p, q] of [[0, 1], [1, 2], [3, 1], [1, 4]]) fxIdx.push(a + p, a + q, n + q, a + p, n + q, n + p);
  }
  const trailIdxCount = fxIdx.length;
  const DISCS = [[B.prop, 1.62, 1], [B.blimpPropL, 1.45, 1], [B.blimpPropR, 1.45, -1]];
  for (let d = 0; d < 3; d++) {
    const c0 = nTrail + d * nDiscV, dir = DISCS[d][2];
    const ring = (k, i) => c0 + 1 + k * DISC + (i % DISC);
    for (let i = 0; i < DISC; i++) fxIdx.push(c0, ring(0, i), ring(0, i + 1));
    for (let k = 0; k < DR.length - 1; k++) for (let i = 0; i < DISC; i++) fxIdx.push(ring(k, i), ring(k + 1, i), ring(k + 1, i + 1), ring(k, i), ring(k + 1, i + 1), ring(k, i + 1));
    fxCol.set([1, 0.97, 0.97, 0.16], c0 * 4);
    for (let i = 0; i < DISC; i++) {
      // the blades lie along ±Y of the prop bone (θ = 90°, 270°); a streak trails each
      const th = i / DISC * TAU;
      let lobe = 0;
      for (const tb of [Math.PI / 2, Math.PI * 1.5]) { let dlt = ((tb - th) * dir) % TAU; if (dlt < 0) dlt += TAU; lobe = Math.max(lobe, Math.exp(-dlt * 1.9)); }
      fxCol.set([1, 0.95, 0.96, 0.2 + 0.4 * lobe], ring(0, i) * 4);
      fxCol.set([1, 0.92, 0.94, 0.3 + 0.5 * lobe], ring(1, i) * 4);
      fxCol.set([1, 0.42, 0.5, 0.62 + 0.25 * lobe], ring(2, i) * 4);
      fxCol.set([1, 0.62, 0.66, 0], ring(3, i) * 4);
    }
  }
  for (let i = 0; i < nTrail; i++) fxCol[i * 4 + 3] = 0;
  const fxGeo = new THREE.BufferGeometry();
  fxGeo.setAttribute('position', new THREE.BufferAttribute(fxPos, 3).setUsage(THREE.DynamicDrawUsage));
  fxGeo.setAttribute('color', new THREE.BufferAttribute(fxCol, 4).setUsage(THREE.DynamicDrawUsage));
  fxGeo.setIndex(fxIdx);
  fxGeo.setDrawRange(trailIdxCount, Infinity);
  // forceSinglePass: three r170 would draw this DoubleSide transparent twice a
  // frame (back, then front faces); the trails and rings read the same in one.
  const fxMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, forceSinglePass: true });
  fxMat.onBeforeCompile = (sh) => { sh.vertexShader = fogVert(sh.vertexShader); };
  fxMat.customProgramCacheKey = () => 'planes_fx_v2';
  const fx = new THREE.Mesh(fxGeo, fxMat);
  fx.name = 'planes_fx'; fx.frustumCulled = false; fx.renderOrder = 2;
  fx.userData.noFade = true; fx.userData.noOcclude = true; fx.raycast = NO_RAY;
  group.add(fx);
  const discLocal = [];                   // unit ring directions
  for (let i = 0; i < DISC; i++) discLocal.push([Math.cos(i / DISC * TAU), Math.sin(i / DISC * TAU)]);

  // ── nav lights ──────────────────────────────────────────────────────────────
  const NL = lights.length;
  const lPos = new Float32Array(NL * 3), lCol = new Float32Array(NL * 3), lBlink = new Float32Array(NL * 3);
  lights.forEach((l, i) => { _c.setHex(l[4]); lCol.set([_c.r, _c.g, _c.b], i * 3); lBlink.set([l[5], l[7], l[6]], i * 3); });
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3).setUsage(THREE.DynamicDrawUsage));
  lGeo.setAttribute('aCol', new THREE.BufferAttribute(lCol, 3));
  lGeo.setAttribute('aBlink', new THREE.BufferAttribute(lBlink, 3));
  const lMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 800 }, uFogFar: { value: 500 } },
    vertexShader: /* glsl */`
      attribute vec3 aCol; attribute vec3 aBlink;
      uniform float uTime, uNight, uScale, uFogFar;
      varying vec3 vCol; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float t = uTime + aBlink.y;
        float on;
        if (aBlink.x > 1.5) { float f = fract(t * 0.9); on = step(f, 0.045) + step(abs(f - 0.13), 0.03); }
        else if (aBlink.x > 0.5) { float f = fract(t * 0.75); on = smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.18, 0.34, f)); }
        else { on = 0.88 + 0.12 * sin(t * 7.0); }
        float d = max(-mv.z, 0.1);
        vA = clamp(on, 0.0, 1.0) * uNight * (1.0 - smoothstep(uFogFar * 1.4, uFogFar * 2.6, d));
        vCol = aCol;
        gl_PointSize = clamp(aBlink.z * 1.9 * uScale / d, 6.0, 72.0) * (0.5 + 0.5 * clamp(on, 0.0, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float core = 1.0 - smoothstep(0.0, 0.32, r);
        float halo = 1.0 - smoothstep(0.15, 1.0, r);
        float a = (core * 0.9 + halo * halo * 0.55) * vA;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vCol * a + vec3(core * vA * 0.55), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const navPoints = new THREE.Points(lGeo, lMat);
  navPoints.name = 'planes_lights'; navPoints.frustumCulled = false; navPoints.renderOrder = 3;
  navPoints.userData.noFade = true; navPoints.userData.noOcclude = true; navPoints.raycast = NO_RAY;
  group.add(navPoints);
  const lightLocal = lights.map((l) => new THREE.Vector3(l[1], l[2], l[3]));

  // ── blob shadows ──────────────────────────────────────────────────────────
  const NBLOB = 6;             // biplane, banner, blimp, paper ×3
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(Math.PI / 2);
  const aCell = new THREE.InstancedBufferAttribute(new Float32Array([0, 1, 1, 2, 2, 2]), 1);
  const aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(NBLOB), 1).setUsage(THREE.DynamicDrawUsage);
  blobGeo.setAttribute('aCell', aCell); blobGeo.setAttribute('aAlpha', aAlpha);
  const blobMat = new THREE.MeshBasicMaterial({
    map: makeBlobTexture(), color: 0x140a20, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, forceSinglePass: true,   // flat decal: one pass
  });
  blobMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;\nattribute float aAlpha;\nvarying float vBlobA;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x = (vMapUv.x + aCell) / 3.0;\nvBlobA = aAlpha;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBlobA;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vBlobA;');
  };
  blobMat.customProgramCacheKey = () => 'planes_blob_v2';
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, NBLOB);
  blobs.name = 'planes_blobs'; blobs.frustumCulled = false; blobs.castShadow = false; blobs.receiveShadow = false;
  blobs.userData.noFade = true; blobs.userData.noOcclude = true; blobs.userData.noInstOcclude = true;
  blobs.renderOrder = 1; blobs.raycast = NO_RAY;
  group.add(blobs);

  // ── state ───────────────────────────────────────────────────────────────────
  let T = 0;                               // flight clock (stops while paused or held)
  let TR = 0;                              // rotor / ripple clock (stops only while paused)
  let tP = 0;                              // paper clock offset
  let jetOff = ROUTES.jet.period - ROUTES.jet.first;
  const api = {};
  const air = {
    biplane: { x: 0, y: 0, z: 0, heading: 0 }, jet: { x: 0, y: 0, z: 0, heading: 0, active: false },
    blimp: { x: 0, y: 0, z: 0, heading: 0 }, paper: [0, 1, 2].map(() => ({ x: 0, y: 0, z: 0, heading: 0 })),
  };

  // scratch
  const p0 = new THREE.Vector3(), pA = new THREE.Vector3(), pB = new THREE.Vector3(), f = new THREE.Vector3();
  const acc = new THREE.Vector3(), up = new THREE.Vector3(), xa = new THREE.Vector3(), ya = new THREE.Vector3();
  const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), q1 = new THREE.Quaternion(), s1 = new THREE.Vector3(), v1 = new THREE.Vector3();
  const bannerP = Array.from({ length: K + 2 }, () => new THREE.Vector3());
  const tangent = new THREE.Vector3(), nrm = new THREE.Vector3(), side = new THREE.Vector3();
  const jetA = new THREE.Vector3(), jetDir = new THREE.Vector3(), jetSide = new THREE.Vector3();
  let jetLane = -1, jetLen = 1;
  const tint = new THREE.Color(), white = new THREE.Color(0xffffff), nightTint = new THREE.Color(0x707c9c);   // moonlit contrails
  const e1 = new THREE.Euler();
  const EARS = [[B.earL, 1, 0], [B.earR, -1, 2.1]];
  const PAPER = [B.paper0, B.paper1, B.paper2];

  function pose(m, pos, fwd, upHint) {
    xa.crossVectors(upHint, fwd); if (xa.lengthSq() < 1e-8) xa.set(1, 0, 0); xa.normalize();
    ya.crossVectors(fwd, xa).normalize();
    m.makeBasis(xa, ya, fwd).setPosition(pos);
  }
  const heading = (fw) => Math.atan2(fw.x, fw.z);
  const store = (o, pos, fw) => { o.x = pos.x; o.y = pos.y; o.z = pos.z; o.heading = heading(fw); };
  const wrapA = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
  const lerpA = (a, b, k) => a + wrapA(b - a) * k;
  const gH = (x, z) => world.height(x, z);

  // ════════════════════════════════════════════════════════════════════════════
  // WAVE 4 · FLIGHT TRACKS — open Catmull-Rom tracks through authored points
  // [x, y, z, v, ground], resampled by arc length. `v` is the target speed at
  // that point (interpolated in v² over arc length: constant acceleration, so
  // a 0 really stops); a run of ground points is draped on the terrain at the
  // biplane's wheel height. Built once (setup only allocates).
  // ════════════════════════════════════════════════════════════════════════════
  const BW = 1.62;                          // biplane origin above the grass, wheels down
  function buildTrack(pts, n = 768) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
    const SUB = 40, M = (pts.length - 1) * SUB;
    const tl = new Float32Array(M + 1);
    const q = new THREE.Vector3(), q0 = new THREE.Vector3();
    curve.getPoint(0, q0);
    let L = 0;
    for (let i = 1; i <= M; i++) { curve.getPoint(i / M, q); L += q.distanceTo(q0); tl[i] = L; q0.copy(q); }
    const cs = pts.map((_, i) => tl[i * SUB]);
    const P = new Float32Array(n * 3), V = new Float32Array(n), Gd = new Float32Array(n);
    let k = 0, c = 0;
    for (let j = 0; j < n; j++) {
      const sj = L * j / (n - 1);
      while (k < M - 1 && tl[k + 1] < sj) k++;
      const fk = clamp((sj - tl[k]) / Math.max(1e-6, tl[k + 1] - tl[k]), 0, 1);
      curve.getPoint((k + fk) / M, q);
      while (c < pts.length - 2 && cs[c + 1] <= sj) c++;
      const u = clamp((sj - cs[c]) / Math.max(1e-6, cs[c + 1] - cs[c]), 0, 1);
      const va = pts[c][3], vb = pts[c + 1][3];
      V[j] = Math.sqrt(Math.max(0, va * va + (vb * vb - va * va) * u));
      const g = pts[c][4] && pts[c + 1][4];
      if (g) q.y = Math.max(restH(q.x, q.z), 0.2) + BW;
      Gd[j] = g ? 1 : 0;
      P[j * 3] = q.x; P[j * 3 + 1] = q.y; P[j * 3 + 2] = q.z;
    }
    const at = (s, out) => {
      const fs = clamp(s / L, 0, 1) * (n - 1), i0 = Math.min(n - 2, Math.floor(fs)), t = fs - i0, a = i0 * 3, b = a + 3;
      out.x = P[a] + (P[b] - P[a]) * t; out.y = P[a + 1] + (P[b + 1] - P[a + 1]) * t; out.z = P[a + 2] + (P[b + 2] - P[a + 2]) * t;
      return out;
    };
    const lin = (A, s) => { const fs = clamp(s / L, 0, 1) * (n - 1), i0 = Math.min(n - 2, Math.floor(fs)), t = fs - i0; return A[i0] + (A[i0 + 1] - A[i0]) * t; };
    return { len: L, n, P, pts, at, speed: (s) => lin(V, s), ground: (s) => lin(Gd, s) };
  }
  /** Trapezoid speed profile: distance covered after tau s (accelerate ta, cruise v, brake td). */
  function trap(tau, L, v, ta, td) {
    const Tt = L / v + (ta + td) / 2;
    if (tau <= 0) return 0;
    if (tau < ta) return 0.5 * v / ta * tau * tau;
    if (tau < Tt - td) return 0.5 * v * ta + v * (tau - ta);
    if (tau < Tt) { const r = Tt - tau; return L - 0.5 * v / td * r * r; }
    return L;
  }
  function trapV(tau, L, v, ta, td) {
    const Tt = L / v + (ta + td) / 2;
    if (tau <= 0 || tau >= Tt) return 0;
    if (tau < ta) return v * tau / ta;
    if (tau > Tt - td) return v * (Tt - tau) / td;
    return v;
  }

  // ── biplane loop helpers (setup-time) ─────────────────────────────────────────
  function loopS(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < bLoop.n; i++) { const dx = bLoop.P[i * 3] - x, dz = bLoop.P[i * 3 + 2] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    return best / bLoop.n * bLoop.len;
  }
  const loopPt = (s) => bLoop.at(s, new THREE.Vector3());
  const loopTan = (s) => { const a = bLoop.at(s - 2, new THREE.Vector3()), b = bLoop.at(s + 2, new THREE.Vector3()); return b.sub(a).setY(0).normalize(); };

  // ── the fuel stop's frame: along = the runway axis (east-ish), side + = north ─
  const STR = AIR.strip;
  const SU = { x: Math.cos(STR.ang), z: Math.sin(STR.ang) }, SN = { x: Math.sin(STR.ang), z: -Math.cos(STR.ang) };
  const SP = (a, sd) => [STR.x + SU.x * a + SN.x * sd, STR.z + SU.z * a + SN.z * sd];
  // the airfield pad (see buildPad): the wheels roll on IT, not on the terrain under it
  const PAD = buildPad(world, STR);
  const meshH = PAD.meshH;
  /** Where wheels / a laid-out banner rest: the pad, a walkable deck (Wing Nut
   *  Field's planks), else the higher of the rendered mesh and world.height. */
  const restH = (x, z, decks = true) => {
    const p = PAD.at(x, z, 0.3);
    if (p !== null) return p;
    let h = Math.max(gH(x, z), meshH(x, z));
    if (decks) {
      const ws = ctx.walkables;
      if (ws) for (let i = 0; i < ws.length; i++) {
        const w = ws[i]; if (!w || !w.test || w.air) continue;
        const t = w.test(x, z);
        if (typeof t === 'number' && t === t && t > h && t < h + 2.5) h = t;
      }
    }
    return h;
  };
  const AIRP = (a, sd, dy, v) => { const [x, z] = SP(a, sd); return [x, Math.max(gH(x, z), 0.5) + dy, z, v, 0]; };
  const GNDP = (a, sd, v) => { const [x, z] = SP(a, sd); return [x, restH(x, z, false) + BW, z, v, 1]; };
  const AS = STR.apron ?? -1;                // which side of the runway the apron is on (−1 = south, the beach side)
  const PARK = { a: -12, s: 5.2 * AS };      // parked: nose +along, on the apron beside the runway
  const PUMP = { a: -8.6, s: 8.6 * AS };     // the candy pump, clear of the wingtip
  const pumpXZ = SP(PUMP.a, PUMP.s);
  const parkXZ = SP(PARK.a, PARK.s);
  const S_EXIT = loopS(-57, 2), S_REJOIN = loopS(-160, 77), S_HOME = loopS(-100, 71);
  const tracks = {};
  {
    const E0 = loopPt(S_EXIT), ET = loopTan(S_EXIT);
    // LAND: leave the loop over Sugar Pier's beach heading south, a descending
    // right turn over the sea onto the runway's extended centreline, touch down
    // westbound, roll out, a tight right U-turn onto the apron, stop at the pump
    tracks.land = buildTrack([
      [E0.x, E0.y, E0.z, 13, 0],
      [E0.x + ET.x * 20, E0.y - 5, E0.z + ET.z * 20, 13, 0],
      [-62, 38, 46, 12.5, 0],
      [-66, 31, 66, 12, 0],
      [-74, 24, 81, 11.5, 0],
      AIRP(62, 0, 17, 11),
      AIRP(42, 0, 9, 10),
      AIRP(27, 0, 3.6, 9),
      GNDP(16, 0, 8),
      GNDP(-4, 0, 3.4),
      GNDP(-13, 0, 2.6),
      GNDP(-17.2, 2.1 * AS, 2.2),
      GNDP(-16.4, 4.7 * AS, 2.0),
      GNDP(PARK.a, PARK.s, 0),
    ]);
    // DEPART: taxi off the apron (swinging clear of the pump), line up, roll
    // east, lift off at the far end, then a climbing right-hand teardrop over
    // the sea back onto the loop heading west
    const HEAD = [
      GNDP(PARK.a, PARK.s, 0),
      GNDP(-9.4, 3.3 * AS, 2.2),
      GNDP(-5, 0.8 * AS, 2.8),
      GNDP(0, 0, 3.4),
      GNDP(9, 0, 7.8),
      GNDP(20, 0, 11),
      AIRP(31, 0, 4.5, 12.5),
      AIRP(46, 0, 11, 13),
    ];
    tracks.head = HEAD;
    const J = loopPt(S_REJOIN), JT = loopTan(S_REJOIN);
    tracks.depart = buildTrack([
      ...HEAD,
      [-80, 22, 94, 13, 0],
      [-84, 30, 112, 13, 0],
      [-104, 36, 118, 13, 0],
      [-124, 41, 104, 13, 0],
      [J.x - JT.x * 22, J.y - 1, J.z - JT.z * 22, 13, 0],
      [J.x, J.y, J.z, 13, 0],
    ]);
  }
  // FERRY + HOME (Wing Nut Field) are built on first use: they need the flying
  // machine's pad and runway bearing, which exist only once escape/flyer.js has.
  function wingnutFrame() {
    const lm = world.LANDMARKS.flyer_pad;
    const fr = ctx.systems.escape?.routes?.flyer || ctx.systems.escape?.api?.routes?.flyer;
    const sp = fr?.home || fr?.spot;
    const pad = { x: Number.isFinite(sp?.x) ? sp.x : lm.x, z: Number.isFinite(sp?.z) ? sp.z : lm.z };
    // the take-off corridor points from the pad toward Candyland (flyer.js
    // publishes it as route.home.yaw, measured clear for 90 u × 26 u)
    const yaw = [fr?.home?.yaw, fr?.runway?.yaw, fr?.runwayYaw, sp?.yaw].find((v) => Number.isFinite(v));
    let dx, dz;
    if (Number.isFinite(yaw)) { dx = Math.sin(yaw); dz = Math.cos(yaw); }
    else { const pier = world.LANDMARKS.candy_dock; dx = pier.x - pad.x; dz = pier.z - pad.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    // step off / turn round on whichever side is emptier
    const cols = ctx.colliders || [];
    const busy = (x, z) => { let n = 0; for (const c of cols) { if (!c || c.solid === false || c.claim) continue; if (Math.hypot(c.x - x, c.z - z) < 7 + (c.r || 0)) n++; } return n; };
    const nL = { x: -dz, z: dx };
    const stopX = pad.x + dx * 16, stopZ = pad.z + dz * 16;
    const sgn = busy(stopX + nL.x * 5, stopZ + nL.z * 5) <= busy(stopX - nL.x * 5, stopZ - nL.z * 5) ? 1 : -1;
    return { pad, d: { x: dx, z: dz }, n: { x: nL.x * sgn, z: nL.z * sgn }, bearingFrom: Number.isFinite(yaw) ? 'flyer' : 'pier' };
  }
  function buildWingnut() {
    const W = wingnutFrame();
    const Pp = (r, sd = 0) => [W.pad.x + W.d.x * r + W.n.x * sd, W.pad.z + W.d.z * r + W.n.z * sd];
    const A = (r, dy, v, sd = 0) => { const [x, z] = Pp(r, sd); return [x, Math.max(gH(x, z), 0.5) + dy, z, v, 0]; };
    const Gp = (r, v, sd = 0) => { const [x, z] = Pp(r, sd); return [x, restH(x, z) + BW, z, v, 1]; };
    // across the strait south of the paper planes, then down the flying
    // machine's own take-off corridor (kept clear by its builder) onto the grass
    tracks.ferry = buildTrack([
      ...tracks.head,
      // wave-hopping at ~20 u: the blimp's crossings keep their gondola above 30 u,
      // and this line stays wide of both mast approaches and the paper planes
      [-70, 18, 88, 13, 0],
      [-22, 18, 80, 13, 0],
      [24, 22, 56, 13, 0],
      [62, 28, 38, 13, 0],
      A(100, 26, 12),
      A(64, 13, 11),
      A(42, 5, 9.5),
      Gp(32, 8.5),
      Gp(21, 3.4),
      Gp(16, 0),
    ]);
    const J = loopPt(S_HOME), JT = loopTan(S_HOME);
    tracks.home = buildTrack([
      Gp(16, 0),
      Gp(17.8, 2.0, 2.2),
      Gp(16.4, 2.2, 4.6),
      Gp(19, 2.0, 5.2),
      Gp(24, 3.4, 2.6),
      Gp(34, 8, 0.6),
      Gp(46, 11.5),
      A(58, 5, 12.5),
      A(82, 15, 13),
      [96, 22, 30, 13, 0],
      [40, 20, 40, 13, 0],
      [0, 20, 58, 13, 0],
      [-36, 22, 80, 13, 0],
      [J.x - JT.x * 24, J.y, J.z - JT.z * 24, 13, 0],
      [J.x, J.y, J.z, 13, 0],
    ]);
    tracks.wingnut = W;
    const [sx, sz] = Pp(16);
    tracks.stop = { x: sx, z: sz, off: Pp(16, -3.6), d: W.d };
    return true;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BIPLANE — loop, fuel stop, passenger flights
  // ════════════════════════════════════════════════════════════════════════════
  const BP = {
    mode: 'loop', phase: 'loop', s: 0, tr: null, u: 0, v: ROUTES.biplane.speed,
    refuelLeft: 0, waitLeft: 0, waitUsed: 0, refT: 0, dropT: 0, sinceStop: 999, stops: 0,
    passenger: false, released: false, prop: 0, propRate: 31, engine: 1, groundK: 0,
    skipped: 0, lastSkip: '', loopV: ROUTES.biplane.speed, slot: -1,
  };
  // ── the fuel-stop TIMETABLE ────────────────────────────────────────────────
  // A day is DAY_LENGTH_SEC (300 s); the street lamps are off 05:59 → 18:49
  // (sky/palette lampMixAt > 0.5), i.e. ≈ 160 s of daylight. A stop is the
  // approach (≈ 27 s) + 25 s at the pump ≈ 4.2 game hours, and from the end of
  // one refuel to the next S_EXIT crossing is the climb-out (≈ 23 s) + the rim
  // (≈ 34 s at cruise). Two stops a day only fit when the first approach starts
  // right as the lamps go out — but a lap (≈ 46 s) and a day (300 s) never
  // line up, so a plane that simply takes "the first crossing after dawn"
  // drifts to one stop a day (measured: 293 s apart). So he keeps a timetable:
  // two SLOTS a day (approach starts ≈ 06:04 and ≈ 14:27), and while he flies
  // the rim he trims his cruise (0.8 – 1.3 × 13 u/s) to cross S_EXIT on the
  // next one. A slot is served once; a late plane (a charter, a long wait)
  // takes it up to MAX_LATE after, but only if the whole stop — approach AND
  // refuel — sits between lamps-off and lamps-on (never after lampsOn, and he
  // never extends a wait past it either: see wait()). Frozen time (the title,
  // views, tests) keeps the simple rule: every lap, while the frozen hour is
  // inside the window.
  const HPS = 24 / world.DAY_LENGTH_SEC;             // game hours per second
  const V0 = ROUTES.biplane.speed, VMIN = V0 * 0.8, VMAX = V0 * 1.3;
  const STOP_MIN = 20;                               // at least this long on the loop between stops
  const LAMP_OFF = 6.0, LAMP_ON = 18.75;             // lampsOn flips at 05:58.5 / 18:49.5 (≈ 1 s of margin)
  const trackTime = (tr) => { let t = 0; for (let u = 0; u < tr.len; u += 0.25) t += 0.25 / Math.max(0.45, tr.speed(u)); return t; };
  const LAND_ALL = trackTime(tracks.land);           // approach start → at the pump (s)
  const STOP_H = (LAND_ALL + AIR.refuel) * HPS;      // approach start → refuel over (h)
  const DAY_FROM = LAMP_OFF, DAY_TO = LAMP_ON - STOP_H;   // an approach may START in [DAY_FROM, DAY_TO]
  const SLOTS = [LAMP_OFF + 0.06, DAY_TO - 0.12];    // approach-start hours
  const EARLY = 0.05, MAX_LATE = 3.6;                // a slot is due from −EARLY to +MAX_LATE hours
  const served = [false, false];
  const LOOP_L = bLoop.len;
  const exitDist = (s) => { const d = (((S_EXIT - s) % LOOP_L) + LOOP_L) % LOOP_L; return d > 1e-3 ? d : LOOP_L; };
  /** a − b in hours, wrapped into (−12, 12]. */
  const hdiff = (a, b) => { let d = (((a - b) % 24) + 24) % 24; return d > 12 ? d - 24 : d; };
  BP.s = S_EXIT - 12 * V0;                            // (views / the title: frozen time stops on the first lap)
  function stopWindow(h = ctx.state.time ?? 12) {
    return h >= DAY_FROM && h <= DAY_TO && !(ctx.systems.sky?.lampsOn ?? false);
  }
  /** The slot a crossing at hour h would serve, or −1. */
  function dueSlot(h) {
    for (let i = 0; i < SLOTS.length; i++) { const d = hdiff(h, SLOTS[i]); if (!served[i] && d >= -EARLY && d <= MAX_LATE) return i; }
    return -1;
  }
  /** Forget a served slot once the clock is well away from it (so it comes round tomorrow). */
  function tidySlots(h) {
    for (let i = 0; i < SLOTS.length; i++) { const d = hdiff(h, SLOTS[i]); if (d < -1 || d > MAX_LATE + 1) served[i] = false; }
  }
  /** Seconds from now to the slot he should aim for next (0 = one is due and
   *  still catchable flat out from `d0` short of S_EXIT: go). */
  function slotAhead(h, d0) {
    let T = Infinity;
    const hArr = h + d0 / VMAX * HPS;
    for (let i = 0; i < SLOTS.length; i++) {
      const d = hdiff(h, SLOTS[i]);
      if (!served[i] && d >= -EARLY && d <= MAX_LATE && hdiff(hArr, SLOTS[i]) <= MAX_LATE && hArr <= DAY_TO) return 0;
      let ahead = -d; if (ahead <= 0) ahead += 24;
      const t = ahead / HPS; if (t < T) T = t;
    }
    return T;
  }
  /** Cruise speed on the rim: arrive at S_EXIT exactly on the next slot (laps
   *  chosen so the speed stays nearest 13 u/s), or flat out when late. */
  function loopSpeed() {
    if (ctx.state.timeFrozen) return V0;
    const d0 = exitDist(BP.s), T = slotAhead(ctx.state.time ?? 12, d0);
    if (!(T < Infinity)) return V0;
    if (T * VMAX <= d0) return VMAX;
    let best = VMAX, err = Infinity;
    for (let n = 0; n < 16; n++) {
      const v = (d0 + n * LOOP_L) / T;
      if (v > VMAX) break;
      if (v >= VMIN && Math.abs(v - V0) < err) { err = Math.abs(v - V0); best = v; }
    }
    return best;
  }
  function startTrack(name, phase, u0 = 0) {
    const tr = tracks[name];
    if (!tr) return false;
    BP.mode = 'track'; BP.phase = phase; BP.tr = tr; BP.u = u0; BP.v = tr.speed(u0);
    ctx.events.emit('planes:biplane', { phase });
    return true;
  }
  function toLoop(s, overshoot = 0) {
    BP.mode = 'loop'; BP.phase = 'loop'; BP.tr = null; BP.s = s + overshoot; BP.v = BP.loopV = ROUTES.biplane.speed;
    ctx.events.emit('planes:biplane', { phase: 'loop' });
  }
  // the banner rides the plane's own recent path (a ring of samples every
  // HSTEP of travel), so it trails it through every turn, down onto the grass
  // at the fuel stop, and back up again on take-off
  const HN = 320, HSTEP = 0.35;
  const HX = new Float32Array(HN), HY = new Float32Array(HN), HZ = new Float32Array(HN);
  let hHead = 0, hCount = 0;
  function histPush(x, y, z) { hHead = (hHead + 1) % HN; HX[hHead] = x; HY[hHead] = y; HZ[hHead] = z; if (hCount < HN) hCount++; }
  function histMaybe(x, y, z) {
    if (!hCount) { histPush(x, y, z); return; }
    const dx = x - HX[hHead], dy = y - HY[hHead], dz = z - HZ[hHead];
    if (dx * dx + dy * dy + dz * dz >= HSTEP * HSTEP) histPush(x, y, z);
  }
  /** Refill the history from a path sampler (debug jumps / teleports). */
  function histFill(sample, span = 60) {
    hCount = 0; hHead = 0;
    for (let d = span; d >= 0; d -= HSTEP) { sample(d, v1); histPush(v1.x, v1.y, v1.z); }
  }
  const BAN_D = new Float32Array(K + 2), BFLAT = new Float32Array(K);
  for (let k = 0; k < K; k++) BAN_D[k + 1] = ROPE + k * SEG;
  BAN_D[0] = ROPE - 1.5; BAN_D[K + 1] = ROPE + (K - 1) * SEG + 1.5;
  /** Points on the travelled path at distances BAN_D behind (px,py,pz), in one walk. */
  function histWalk(px, py, pz) {
    let ax = px, ay = py, az = pz, accD = 0, j = hHead, i = 0, k = 0;
    while (k < K + 2) {
      if (i >= hCount) { bannerP[k].set(ax, ay, az); k++; continue; }
      const bx = HX[j], by = HY[j], bz = HZ[j];
      const L = Math.hypot(bx - ax, by - ay, bz - az);
      if (accD + L >= BAN_D[k] && L > 1e-6) {
        const t = (BAN_D[k] - accD) / L;
        bannerP[k].set(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
        k++; continue;
      }
      accD += L; ax = bx; ay = by; az = bz; i++; j = (j - 1 + HN) % HN;
    }
  }

  function stepBiplane(dt) {
    if (dt <= 0) return;
    if (BP.mode === 'loop') {
      const h = ctx.state.time ?? 12, frozen = !!ctx.state.timeFrozen;
      if (!frozen) tidySlots(h);
      // trim the cruise toward the timetable (eased: no visible lurch)
      BP.loopV += (loopSpeed() - BP.loopV) * Math.min(1, dt * 0.9);
      const sp = BP.loopV, s0 = BP.s;
      BP.s += sp * dt; BP.v = sp;
      BP.sinceStop += dt;
      const L = bLoop.len;
      const a = ((s0 % L) + L) % L, b = a + sp * dt;
      const crossed = (a <= S_EXIT && b > S_EXIT) || (a <= S_EXIT + L && b > S_EXIT + L);
      if (crossed) {
        const slot = frozen ? -1 : dueSlot(h);
        if (BP.sinceStop < STOP_MIN) BP.lastSkip = 'recent';
        else if (!stopWindow(h)) { BP.lastSkip = 'night'; BP.skipped++; }
        else if (!frozen && slot < 0) BP.lastSkip = 'timetable';
        else {
          if (slot >= 0) served[slot] = true;
          BP.slot = slot;
          const over = b > S_EXIT + L ? b - S_EXIT - L : b - S_EXIT;
          startTrack('land', 'approach', over);
        }
      }
      return;
    }
    const tr = BP.tr;
    if (BP.phase === 'refuel') {
      // the clock jumped into lamp-time while he sat at the pump (a debug
      // setTime, a wake-up skip): he never refuels under the lamps — off he goes
      if (!ctx.state.timeFrozen && (ctx.systems.sky?.lampsOn ?? false)) { BP.refuelLeft = 0; BP.waitLeft = 0; }
      if (BP.refuelLeft > 0) BP.refuelLeft = Math.max(0, BP.refuelLeft - dt);
      else if (BP.waitLeft > 0) BP.waitLeft = Math.max(0, BP.waitLeft - dt);
      // engine off at the pump; it coughs back to life 2.5 s before he rolls
      BP.refT += dt;
      const left = BP.refuelLeft + BP.waitLeft;
      BP.engine = Math.max(smoothstep(2.5, 0.2, left), 1 - smoothstep(0, 1.6, BP.refT));
      if (left <= 0) {
        BP.stops++; BP.sinceStop = 0;
        if (BP.passenger && (tracks.ferry || buildWingnut())) startTrack('ferry', 'ferry');
        else { BP.passenger = false; startTrack('depart', 'depart'); }
      }
      return;
    }
    if (BP.phase === 'dropoff') {
      BP.dropT += dt;
      BP.engine = 0.35;
      if (BP.released || BP.dropT > 16) { BP.released = false; BP.passenger = false; startTrack('home', 'home'); }
      return;
    }
    BP.engine = 1;
    // a crawl floor: tracks start (and some end) at 0 — v² interpolation would never leave / reach them
    BP.v = Math.max(0.45, tr.speed(BP.u));
    BP.u += BP.v * dt;
    if (BP.u >= tr.len - 0.03) {
      const over = BP.u - tr.len;
      if (BP.phase === 'approach') {
        BP.u = tr.len; BP.v = 0; BP.phase = 'refuel'; BP.refuelLeft = AIR.refuel; BP.waitLeft = 0; BP.waitUsed = 0; BP.refT = 0;
        ctx.events.emit('planes:biplane', { phase: 'refuel' });
      } else if (BP.phase === 'depart') toLoop(S_REJOIN, Math.max(0, over));
      else if (BP.phase === 'ferry') {
        BP.u = tr.len; BP.v = 0; BP.phase = 'dropoff'; BP.dropT = 0; BP.released = false;
        ctx.events.emit('planes:biplane', { phase: 'dropoff' });
      } else if (BP.phase === 'home') { BP.sinceStop = 0; toLoop(S_HOME, Math.max(0, over)); }
    }
  }

  // ── BIPLANE + BANNER (pose) ───────────────────────────────────────────────────
  function flyBiplane(t, w, dt) {
    const sp = Math.max(BP.v, 0.001);
    let gk = 0;
    if (BP.mode === 'loop') {
      const s = BP.s, d = 7;
      bLoop.at(s - d, pA); bLoop.at(s, p0); bLoop.at(s + d, pB);
      f.subVectors(pB, pA).normalize();
      acc.copy(pB).add(pA).addScaledVector(p0, -2).multiplyScalar(sp * sp / (d * d));
      up.set(0, G, 0).add(acc).normalize();
      p0.y += 0.45 * Math.sin(t * 0.8);
    } else {
      const tr = BP.tr, u = BP.u;
      gk = tr.ground(u);
      const d = gk > 0.5 ? 1.2 : 4;
      tr.at(u - d, pA); tr.at(u, p0); tr.at(u + d, pB);
      if (u + d > tr.len) { f.subVectors(p0, pA); } else if (u - d < 0) { f.subVectors(pB, p0); } else f.subVectors(pB, pA);
      f.normalize();
      acc.copy(pB).add(pA).addScaledVector(p0, -2).multiplyScalar(sp * sp / (d * d));
      if (u + d > tr.len || u - d < 0) acc.set(0, 0, 0);
      up.set(0, G, 0).addScaledVector(acc, 1 - gk).normalize();
      if (gk < 0.5) p0.y += 0.3 * Math.sin(t * 0.8) * (1 - gk);
      // a taildragger sits nose-up on the grass; the tail lifts as she gathers speed
      const tail = gk * (0.2 * (1 - smoothstep(6, 10.5, sp)));
      if (tail > 0) { f.y = 0; f.normalize(); f.y = Math.tan(tail); f.normalize(); }
    }
    BP.groundK = gk;
    pose(BM[B.biplane], p0, f, up);
    store(air.biplane, p0, f);
    histMaybe(p0.x, p0.y, p0.z);
    // propeller: stops at the pump (engine off), idles on the ground
    const rate = 31 * clamp(BP.engine, 0, 1) * (gk > 0.5 && sp < 4 ? 0.55 : 1);
    BP.propRate = rate;
    BP.prop = (BP.prop + rate * dt) % TAU;
    m1.makeRotationZ(BP.prop).setPosition(0, 0.05, 2.66);
    BM[B.prop].multiplyMatrices(BM[B.biplane], m1);
    // the pilot's scarf streams and snaps (droops when parked); the other paw waves at whoever is below
    const flap = 1 - 0.8 * (BP.phase === 'refuel' || BP.phase === 'dropoff' ? 1 : 0);
    m1.makeRotationFromEuler(e1.set(0.1 + (0.1 * Math.sin(w * 13.1)) * flap + (1 - flap) * 0.9, (0.22 + 0.26 * Math.sin(w * 9.3)) * flap, 0.3 * Math.sin(w * 17.3) * flap)).setPosition(0.12, 0.92, -1.14);
    BM[B.scarf].multiplyMatrices(BM[B.biplane], m1);
    m1.makeRotationFromEuler(e1.set(0.25, 0, -(0.6 + 0.42 * Math.sin(w * 5.2)))).setPosition(0.4, 0.98, -0.8);
    BM[B.wave].multiplyMatrices(BM[B.biplane], m1);
    // banner: on the travelled path ROPE + k·SEG behind, a wave running down it;
    // below ~6 u over the grass it lies down flat, face up
    histWalk(p0.x, p0.y, p0.z);
    const grounded = gk > 0.5 || BP.phase === 'refuel' || BP.phase === 'dropoff';
    for (let k = 0; k < K; k++) {
      const P = bannerP[k + 1];
      tangent.subVectors(bannerP[k], bannerP[k + 2]); tangent.y = 0;
      if (tangent.lengthSq() < 1e-6) tangent.set(Math.sin(air.biplane.heading), 0, Math.cos(air.biplane.heading));
      tangent.normalize();
      nrm.set(-tangent.z, 0, tangent.x);
      // (airborne: world.height is plenty — and never grows the mesh sampler's vertex cache in flight)
      const g = Math.max(grounded ? restH(P.x, P.z, true) : gH(P.x, P.z), 0.1);
      const flat = 1 - smoothstep(g + BW + 2.2, g + BW + 5.2, P.y);
      const kk = k / (K - 1);
      const lat = ((0.08 + 0.8 * Math.pow(kk, 1.25)) * Math.sin(w * 8.2 - k * 0.95) + 0.3 * kk * Math.sin(w * 1.7 - k * 0.4)) * (1 - flat);
      P.addScaledVector(nrm, lat);
      const py = P.y + (p0.y - P.y) * STREAM * (1 - flat);
      const hang = Math.max(py - SAG + (0.45 * Math.sin(t * 0.8 - 0.3) - 0.35 * kk + 0.16 * kk * Math.sin(w * 10.5 - k * 1.4)) * (1 - flat), g + 0.4);
      // laid out: on whatever it rests on, lifted clear of the rise to its neighbours
      let gl = g;
      if (flat > 0.01) {
        const Pa = bannerP[k], Pb = bannerP[k + 2];
        gl = Math.max(g, restH((P.x + Pa.x) * 0.5, (P.z + Pa.z) * 0.5, grounded), restH((P.x + Pb.x) * 0.5, (P.z + Pb.z) * 0.5, grounded));
      }
      P.y = hang + (gl + 0.1 + 0.05 * Math.sin(w * 2.1 - k) * (1 - flat) - hang) * flat;
      BFLAT[k] = flat;
    }
    for (let k = 0; k < K; k++) {
      const P = bannerP[k + 1];
      if (k === 0) f.subVectors(P, bannerP[2]); else f.subVectors(bannerP[k], P);
      if (f.lengthSq() < 1e-8) f.copy(tangent);
      f.normalize();
      const fl = BFLAT[k];
      side.set(-f.z, 0, f.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      up.copy(UP).multiplyScalar(1 - fl).addScaledVector(side, fl);
      if (up.lengthSq() < 1e-6) up.copy(UP);
      pose(BM[B.banner + k], P, f, up.normalize());
    }
    // the tow rope's knot: half-way and sagging in the air; laid out, it sits
    // on the ground ~2.4 u behind the tail, so the rope drops off the tail and
    // runs along the ground to the lead pole
    bpLocal(TOW_TAIL[0], TOW_TAIL[1], TOW_TAIL[2], pA);
    pB.set(TOW_POLE[0], TOW_POLE[1], TOW_POLE[2]).applyMatrix4(BM[B.banner]);
    const fl0 = BFLAT[0];
    v1.addVectors(pA, pB).multiplyScalar(0.5);
    v1.y -= 0.5 + 0.12 * Math.sin(w * 3.1);
    if (fl0 > 0.001) {
      const dx = pB.x - pA.x, dz = pB.z - pA.z, dh = Math.hypot(dx, dz) || 1, kx = Math.min(2.4, dh * 0.45) / dh;
      const gx = pA.x + dx * kx, gz = pA.z + dz * kx;
      const gy = Math.max(restH(gx, gz, grounded), restH((gx + pB.x) * 0.5, (gz + pB.z) * 0.5, grounded)) + 0.12;
      v1.x += (gx - v1.x) * fl0; v1.y += (gy - v1.y) * fl0; v1.z += (gz - v1.z) * fl0;
    }
    f.subVectors(pB, pA); if (f.lengthSq() < 1e-8) f.set(0, 0, 1); f.normalize();
    pose(BM[B.ropeM], v1, f, Math.abs(f.y) > 0.95 ? side.set(1, 0, 0) : UP);
  }

  /** Where the pilot's head is / the passenger seat is (world). */
  function bpLocal(x, y, z, out) { return out.set(x, y, z).applyMatrix4(BM[B.biplane]); }

  // ── JET ──────────────────────────────────────────────────────────────────────
  // Each pass gets a fresh seeded lane; of eight seeded candidates it takes the
  // one that stays furthest from the clouds (sky.clouds, read from their live
  // instance matrices) over the middle 600 u, so the jet and its contrail never
  // plough through a cloud where you can see it.
  const CLOUD_C = [];                      // scratch: [x, y, z, s] × n (filled per lane, reused)
  function readClouds() {
    let n = 0;
    const kids = ctx.systems.sky?.clouds?.group?.children;
    if (!kids) return 0;
    for (const mesh of kids) {
      const arr = mesh.instanceMatrix?.array; if (!arr) continue;
      for (let i = 0; i < mesh.count; i++) {
        const o = i * 16, sc = Math.hypot(arr[o], arr[o + 1], arr[o + 2]);
        if (sc < 1) continue;
        CLOUD_C[n * 4] = arr[o + 12]; CLOUD_C[n * 4 + 1] = arr[o + 13]; CLOUD_C[n * 4 + 2] = arr[o + 14]; CLOUD_C[n * 4 + 3] = sc; n++;
      }
    }
    return n;
  }
  function laneMargin(nc, ax, y, az, dx, dz, half) {
    let best = 999;
    for (let i = 0; i < nc; i++) {
      const px = CLOUD_C[i * 4] - ax, pz = CLOUD_C[i * 4 + 2] - az, s = CLOUD_C[i * 4 + 3];
      const along = px * dx + pz * dz;
      if (along < half - 330 || along > half + 330) continue;
      const lat = Math.abs(px * dz - pz * dx) - (s * 1.05 + 12);
      const vert = Math.abs(CLOUD_C[i * 4 + 1] - y) - (s * 0.55 + 6);
      best = Math.min(best, Math.max(lat, vert * 2));
    }
    return best;
  }
  function jetLaneFor(k) {
    const J = ROUTES.jet;
    const r = rng(hash('planes-jet') + k * 7919);
    const nc = readClouds();
    let best = -Infinity, bAng = 0, bCx = 0, bCz = 0, bY = J.alt;
    for (let c = 0; c < 8; c++) {
      const ang = r.range(-0.42, 0.42) + (k % 2 ? Math.PI : 0);
      const cx = r.range(-30, 30), cz = r.range(-45, 45), y = J.alt + r.range(-4, 6);
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const m = nc ? laneMargin(nc, cx - dx * J.half, y, cz - dz * J.half, dx, dz, J.half) : 0;
      if (m > best + 1e-6) { best = m; bAng = ang; bCx = cx; bCz = cz; bY = y; }
      if (!nc) break;
    }
    jetDir.set(Math.cos(bAng), 0, Math.sin(bAng));
    jetA.set(bCx - jetDir.x * J.half, bY, bCz - jetDir.z * J.half);
    jetSide.crossVectors(UP, jetDir).normalize();
    jetLen = J.half * 2;
    jetLane = k;
  }
  let trailOn = false;
  /** Contrails: two strips behind the engines laid along the lane; `head` is
   *  how far along the lane the jet got, `tau` the lane clock (age = tau − x/v). */
  function drawTrail(head, tau) {
    const J = ROUTES.jet;
    const maxAge = 11, trailLen = Math.min(J.speed * maxAge, jetLen);
    const alive = tau < head / J.speed + maxAge;
    if (!alive) { if (trailOn) { fxGeo.setDrawRange(trailIdxCount, Infinity); trailOn = false; } return; }
    if (!trailOn) { fxGeo.setDrawRange(0, Infinity); trailOn = true; }
    for (let e = 0; e < 2; e++) {
      const ex = e ? -3.4 : 3.4;
      for (let i = 0; i <= TM; i++) {
        const xL = head - (i / TM) * trailLen;
        const x = Math.max(0, xL);
        const age = tau - x / J.speed;
        let a = 0.78 * smoothstep(0.03, 0.35, age) * (1 - smoothstep(maxAge * 0.35, maxAge, age)) * (0.86 + 0.14 * Math.sin(x * 0.13 + e * 2.3));
        if (xL < 0 || age < 0) a = 0;
        // puffs are fixed in the air (phase from distance along the lane), and spread with age
        const w = (0.45 + age * 0.46) * (1 + 0.3 * Math.sin(x * 0.19 + e * 1.9));
        const drift = Math.sin(age * 0.45 + x * 0.035 + e) * age * 0.16;
        v1.copy(jetA).addScaledVector(jetDir, x).addScaledVector(jetSide, ex + drift);
        v1.y += -1.2 + age * 0.1;
        const o = (e * (TM + 1) + i) * TV, P = o * 3;
        fxPos[P] = v1.x + jetSide.x * w; fxPos[P + 1] = v1.y; fxPos[P + 2] = v1.z + jetSide.z * w;
        fxPos[P + 3] = v1.x; fxPos[P + 4] = v1.y; fxPos[P + 5] = v1.z;
        fxPos[P + 6] = v1.x - jetSide.x * w; fxPos[P + 7] = v1.y; fxPos[P + 8] = v1.z - jetSide.z * w;
        fxPos[P + 9] = v1.x; fxPos[P + 10] = v1.y + w * 0.8; fxPos[P + 11] = v1.z;
        fxPos[P + 12] = v1.x; fxPos[P + 13] = v1.y - w * 0.8; fxPos[P + 14] = v1.z;
        fxCol[(o + 1) * 4 + 3] = a;           // only the core is opaque: the edges fade to nothing
      }
    }
  }
  function flyJet(t, dt) {
    if (SUMN.on) { flySummon(t, dt); return; }
    const J = ROUTES.jet;
    const jt = t + jetOff;
    const k = Math.floor(jt / J.period), tau = jt - k * J.period;
    if (k !== jetLane) jetLaneFor(k);
    const D = tau * J.speed;
    if (D <= jetLen) {
      p0.copy(jetA).addScaledVector(jetDir, D);
      up.copy(UP).addScaledVector(jetSide, 0.04 * Math.sin(t * 0.5));
      pose(BM[B.jet], p0, jetDir, up.normalize());
      store(air.jet, p0, jetDir); air.jet.active = true;
    } else { BM[B.jet].copy(HIDDEN); air.jet.active = false; }
    BM[B.ladJ0].copy(HIDDEN); BM[B.ladJ1].copy(HIDDEN);
    drawTrail(Math.min(D, jetLen), tau);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // summonJet — MEOW AIR answers a flare (Contract L, for the ending)
  // The jet leaves its lane where it is (or comes in from the west if it is
  // between passes), banks round the point at 64 u/s, spirals in slowing to a
  // hover 12 u over it with the rope ladder unrolled to the point, holds, then
  // climbs away east off the map. Everything is on the planes clock (T), so a
  // stepped screenshot run replays it exactly.
  // ════════════════════════════════════════════════════════════════════════════
  const SUMN = {
    on: false, phase: null, tr: null, dep: null, u: 0, v: 0, hold: 8, holdT: 0, depT: 0, ladK: 0,
    target: new THREE.Vector3(), promise: null, resolve: null, resolved: false,
    trailHead: 0, trailTau0: 0, trailT0: 0, hoverH: 0, info: null,
  };
  const SUM_DEC = 7.5;                       // braking into the hover, u/s²
  function summonJet(p, opts = {}) {
    try {
      const x = Number(p?.x), y = Number(p?.y), z = Number(p?.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return Promise.resolve(null);
      if (SUMN.on && SUMN.phase !== 'depart' && SUMN.target.distanceTo(v1.set(x, y, z)) < 1) {
        if (Number.isFinite(opts.hold)) SUMN.hold = Math.max(0.5, opts.hold);
        return SUMN.promise;
      }
      // where the jet is now (mid-crossing), else a fresh entry from the west
      let sx, sy, sz, dx, dz;
      if (!SUMN.on && air.jet.active) { sx = air.jet.x; sy = air.jet.y; sz = air.jet.z; dx = jetDir.x; dz = jetDir.z; }
      else if (SUMN.on) { sx = air.jet.x; sy = air.jet.y; sz = air.jet.z; dx = Math.sin(air.jet.heading); dz = Math.cos(air.jet.heading); }
      else { sx = x - 430; sy = ROUTES.jet.alt; sz = z - 60; dx = 0.99; dz = 0.14; }
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      // freeze the lane's contrail where it is and let it age out
      if (!SUMN.on) {
        const J = ROUTES.jet, jt = T + jetOff, k = Math.floor(jt / J.period), tau = jt - k * J.period;
        SUMN.trailHead = Math.min(tau * J.speed, jetLen); SUMN.trailTau0 = tau; SUMN.trailT0 = T;
      }
      const pts = [[sx, sy, sz]];
      const s1x = sx + dx * 150, s1z = sz + dz * 150, s1y = Math.max(y + 55, sy - 8);
      pts.push([s1x, s1y, s1z]);
      // bank round the point: an arc (R 95) that tightens into a spiral and
      // arrives heading roughly east (so the climb-out needs no second turn)
      const a0 = Math.atan2(s1z - z, s1x - x);
      const best = (sense) => { const aF = sense > 0 ? -Math.PI / 2 : Math.PI / 2; let sw = ((sense * (aF - a0)) % TAU + TAU) % TAU; if (sw < Math.PI * 0.8) sw += TAU; return sw; };
      const sense = best(1) <= best(-1) ? 1 : -1, sweep = best(sense);
      const nArc = Math.max(4, Math.ceil(sweep / 0.55));
      for (let i = 1; i <= nArc; i++) {
        const k = i / nArc, a = a0 + sense * sweep * k;
        const R = k < 0.55 ? 95 : lerp(95, 11, smoothstep(0.55, 1, k));
        pts.push([x + Math.cos(a) * R, lerp(s1y, y + 16, smoothstep(0, 1, k)), z + Math.sin(a) * R]);
      }
      pts.push([x, y + 12, z]);
      SUMN.tr = buildTrack(pts.map((q) => [q[0], q[1], q[2], 64, 0]), 1024);
      SUMN.on = true; SUMN.phase = 'approach'; SUMN.u = 0; SUMN.v = ROUTES.jet.speed; SUMN.holdT = 0; SUMN.depT = 0; SUMN.ladK = 0;
      SUMN.hold = Number.isFinite(opts.hold) ? Math.max(0.5, opts.hold) : 8;
      SUMN.target.set(x, y, z); SUMN.resolved = false; SUMN.dep = null; SUMN.info = null;
      SUMN.promise = new Promise((res) => { SUMN.resolve = res; });
      ctx.events.emit('planes:summon', { phase: 'approach', x, y, z });
      return SUMN.promise;
    } catch (err) {
      console.warn('[planes] summonJet failed', err?.message || err);
      return Promise.resolve(null);
    }
  }
  const jetLadTop = new THREE.Vector3(), jetLadBot = new THREE.Vector3();
  function flySummon(t, dt) {
    const S = SUMN, P = S.target;
    // the lane's contrail, frozen at its head, ageing away
    drawTrail(S.trailHead, S.trailTau0 + (T - S.trailT0));
    if (S.phase === 'approach') {
      const L = S.tr.len;
      S.v = Math.max(0.9, Math.min(ROUTES.jet.speed, Math.sqrt(2 * SUM_DEC * Math.max(0, L - S.u))));
      S.u += S.v * dt;
      if (S.u >= L - 0.05) { S.u = L; S.phase = 'hover'; S.holdT = 0; S.hoverH = air.jet.heading; ctx.events.emit('planes:summon', { phase: 'hover', x: P.x, y: P.y, z: P.z }); }
    } else if (S.phase === 'hover') {
      S.holdT += dt;
      if (S.resolved && S.holdT >= S.hold) {
        S.phase = 'depart'; S.depT = 0;
        const h = S.hoverH, dx = Math.sin(h), dz = Math.cos(h);
        S.dep = buildTrack([[P.x, P.y + 12, P.z, 1, 0], [P.x + dx * 40, P.y + 20, P.z + dz * 40, 30, 0],
          [P.x + 150, P.y + 48, P.z + dz * 30, 60, 0], [P.x + 420, P.y + 110, P.z, 72, 0], [P.x + 900, P.y + 170, P.z - 20, 72, 0]], 512);
        S.u = 0;
        ctx.events.emit('planes:summon', { phase: 'depart', x: P.x, y: P.y, z: P.z });
      }
    } else if (S.phase === 'depart') {
      S.depT += dt;
      S.v = Math.min(72, 1 + S.depT * S.depT * 2.2);
      S.u += S.v * dt;
      if (S.u >= S.dep.len - 0.05) {
        // back to the timetable: the next ordinary crossing in ~25 s
        S.on = false; S.phase = null;
        const J = ROUTES.jet, kNext = Math.floor((T + jetOff) / J.period) + 2;
        jetOff = kNext * J.period - 25 - T;
        fxGeo.setDrawRange(trailIdxCount, Infinity); trailOn = false;
        ctx.events.emit('planes:summon', { phase: 'gone' });
        flyJet(t, 0);
        return;
      }
    }
    // pose
    const hover = S.phase === 'hover';
    const tr = S.phase === 'depart' ? S.dep : S.tr, u = S.u, d = Math.max(2, Math.min(12, S.v * 0.25));
    if (hover) {
      p0.set(P.x + 0.25 * Math.sin(t * 0.7), P.y + 12 + 0.3 * Math.sin(t * 1.1), P.z + 0.25 * Math.cos(t * 0.6));
      const h = S.hoverH + 0.04 * Math.sin(t * 0.45);
      f.set(Math.sin(h), 0.1, Math.cos(h)).normalize();
      up.copy(UP).addScaledVector(side.set(Math.cos(h), 0, -Math.sin(h)), 0.05 * Math.sin(t * 0.8)).normalize();
    } else {
      tr.at(u - d, pA); tr.at(u, p0); tr.at(u + d, pB);
      if (u + d > tr.len) f.subVectors(p0, pA); else if (u - d < 0) f.subVectors(pB, p0); else f.subVectors(pB, pA);
      f.normalize();
      acc.copy(pB).add(pA).addScaledVector(p0, -2).multiplyScalar(S.v * S.v / (d * d));
      if (u + d > tr.len || u - d < 0) acc.set(0, 0, 0);
      up.set(0, G, 0).add(acc).normalize();
      // nose up as she brakes into the hover (the cat-tail fin wags for balance)
      const flare = S.phase === 'approach' ? 0.22 * (1 - smoothstep(4, 40, S.v)) : 0.18 * smoothstep(0, 1.5, S.depT) * (1 - smoothstep(4, 9, S.depT));
      if (flare > 0) { const fy = f.y; f.y = 0; f.normalize(); f.y = Math.tan(Math.atan(fy) + flare); f.normalize(); }
    }
    pose(BM[B.jet], p0, f, up);
    store(air.jet, p0, f); air.jet.active = true;
    // the rope ladder: unrolls over the last stretch, hangs to the point, reels in on the way out
    if (S.phase === 'approach') S.ladK = smoothstep(S.tr.len - 75, S.tr.len - 4, S.u);
    else if (hover) S.ladK = Math.min(1, S.ladK + dt * 0.8);
    else S.ladK = Math.max(0, S.ladK - dt * 0.55);
    if (S.ladK > 0.01) {
      m1.makeTranslation(0, -1.1, 0.4);
      BM[B.ladJ0].multiplyMatrices(BM[B.jet], m1);
      const e = BM[B.ladJ0].elements;
      jetLadTop.set(e[12], e[13], e[14]);
      const L = (jetLadTop.y - P.y) * S.ladK;
      jetLadBot.set(jetLadTop.x - f.x * 1.2 * S.ladK * (hover ? 0.2 : 1), jetLadTop.y - L, jetLadTop.z - f.z * 1.2 * S.ladK * (hover ? 0.2 : 1));
      if (hover) { jetLadBot.x += 0.12 * Math.sin(t * 1.3); jetLadBot.z += 0.12 * Math.cos(t * 1.1); }
      BM[B.ladJ1].copy(BM[B.ladJ0]);
      BM[B.ladJ1].elements[12] = jetLadBot.x; BM[B.ladJ1].elements[13] = jetLadBot.y; BM[B.ladJ1].elements[14] = jetLadBot.z;
    } else { BM[B.ladJ0].copy(HIDDEN); BM[B.ladJ1].copy(HIDDEN); }
    if (hover && S.ladK >= 0.999 && !S.resolved) {
      S.resolved = true;
      S.info = { x: P.x, y: P.y, z: P.z, top: { x: jetLadTop.x, y: jetLadTop.y, z: jetLadTop.z }, jet: { x: p0.x, y: p0.y, z: p0.z, heading: air.jet.heading } };
      ctx.events.emit('planes:summon', { phase: 'ladder', x: P.x, y: P.y, z: P.z });
      try { S.resolve?.(S.info); } catch { /* the caller's problem */ }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BLIMP SCHEDULE (Contract L) — two moorings, two legs, one cycle
  //   [0, dw)            moored at Sugar Pier (ladder down, props idling)
  //   [dw, dw+AB)        unmoor (back off + climb, still facing the mast), pivot,
  //                      drift the strait, line up, nose in at Fish Harbor
  //   [dw+AB, 2dw+AB)    moored at Fish Harbor
  //   [2dw+AB, P)        back again
  // A pure function of the planes clock: renders and eta() agree exactly.
  // ════════════════════════════════════════════════════════════════════════════
  const BLS = { dwell: 20, rev: 8, back: 14, lift: 8, pivot: 9, acc: 6, dec: 13, v: ROUTES.blimp.speed };
  const MI = {};
  for (const [name, m] of Object.entries(AIR.masts)) {
    const fx = Math.sin(m.heading), fz = Math.cos(m.heading);
    const fy = m.deck ? gH(m.deck[0], m.deck[1]) + m.deck[2] : gH(m.foot[0], m.foot[1]);
    const cx = m.foot[0] + fx * LAD_BACK, cz = m.foot[1] + fz * LAD_BACK, cy = fy + AIR.ladder - LAD_TOP.y;
    const tx = cx + fx * NOSE, tz = cz + fz * NOSE;
    MI[name] = {
      name, label: m.label, island: m.island, to: m.to, heading: m.heading, fx, fz,
      foot: { x: m.foot[0], y: fy, z: m.foot[1] }, centre: { x: cx, y: cy, z: cz },
      top: { x: tx, y: cy + 0.1, z: tz }, base: { x: tx, y: gH(tx, tz), z: tz },
    };
  }
  function blimpLeg(from, to, mids) {
    const A = MI[from], Bm = MI[to];
    const Q = [A.centre.x - A.fx * BLS.back, A.centre.y + BLS.lift, A.centre.z - A.fz * BLS.back];
    const pts = [Q, ...mids,
      [Bm.centre.x - Bm.fx * 36, Bm.centre.y + 7, Bm.centre.z - Bm.fz * 36],
      [Bm.centre.x - Bm.fx * 17, Bm.centre.y + 1.8, Bm.centre.z - Bm.fz * 17],
      [Bm.centre.x, Bm.centre.y, Bm.centre.z]].map((p) => [p[0], p[1], p[2], BLS.v, 0]);
    const tr = buildTrack(pts, 1024);
    const Tc = tr.len / BLS.v + (BLS.acc + BLS.dec) / 2;
    return { from, to, A, B: Bm, Q, tr, Tc, T: BLS.rev + Tc };
  }
  // mooring-mast beacons sit on top of the masts escape/blimp.js builds under these points
  BM[B.beaconC].makeTranslation(MI.candy.top.x, MI.candy.top.y + 2.35, MI.candy.top.z);
  BM[B.beaconK].makeTranslation(MI.cat.top.x, MI.cat.top.y + 2.35, MI.cat.top.z);
  const LEG = {
    // over open water the gondola stays above ~30 u (the biplane's passenger
    // runs wave-hop underneath at ~20 u)
    cat: blimpLeg('candy', 'cat', [[-26, 36, 44], [6, 50, 52], [36, 42, 60]]),
    candy: blimpLeg('cat', 'candy', [[70, 38, 76], [34, 50, 82], [-4, 50, 74], [-28, 40, 64]]),
  };
  const CYC = { dw: BLS.dwell, ab: LEG.cat.T, ba: LEG.candy.T };
  CYC.P = 2 * CYC.dw + CYC.ab + CYC.ba;
  CYC.catAt = CYC.dw + CYC.ab;
  // the first mooring at Sugar Pier comes ~45 s into the game — after the
  // opening cinematic has landed on the visitor, not in the middle of it
  let blimpOff = CYC.P - 45;
  const BS = { phase: 'moored', mast: null, leg: null, dwellT: 0, dwellLeft: 0, ladK: 0, t: 0, x: 0, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, transit: 0, prop: 0 };
  function blimpSample(tb, o) {
    const Pc = CYC.P, t = ((tb % Pc) + Pc) % Pc;
    o.t = t; o.speed = 0; o.transit = 0; o.leg = null; o.mast = null; o.ladK = 0; o.dwellT = 0; o.dwellLeft = 0;
    let m = null, leg = null, lt = 0;
    if (t < CYC.dw) { m = MI.candy; o.dwellT = t; }
    else if (t < CYC.catAt) { leg = LEG.cat; lt = t - CYC.dw; }
    else if (t < CYC.catAt + CYC.dw) { m = MI.cat; o.dwellT = t - CYC.catAt; }
    else { leg = LEG.candy; lt = t - CYC.catAt - CYC.dw; }
    if (m) {
      o.phase = 'moored'; o.mast = m.name; o.dwellLeft = CYC.dw - o.dwellT;
      o.ladK = smoothstep(0.8, 3.2, o.dwellT) * (1 - smoothstep(CYC.dw - 2.8, CYC.dw - 0.5, o.dwellT));
      // weathervaning a hair about the mast head, breathing
      o.heading = m.heading + 0.02 * Math.sin(tb * 0.37);
      o.x = m.top.x - Math.sin(o.heading) * NOSE; o.z = m.top.z - Math.cos(o.heading) * NOSE;
      o.y = m.centre.y + 0.08 * Math.sin(tb * 0.6);
      o.pitch = 0;
      return o;
    }
    o.leg = leg.to;
    const A = leg.A;
    if (lt < BLS.rev) {                        // backing off the mast and climbing, still facing it
      o.phase = 'unmoor';
      const k = smoothstep(0, 1, lt / BLS.rev);
      o.x = lerp(A.centre.x, leg.Q[0], k); o.y = lerp(A.centre.y, leg.Q[1], k); o.z = lerp(A.centre.z, leg.Q[2], k);
      o.heading = A.heading; o.pitch = 0.04 * Math.sin(Math.PI * k);
      o.speed = BLS.back / BLS.rev * 6 * k * (1 - k);
      return o;
    }
    o.phase = 'cruise';
    const tau = lt - BLS.rev, L = leg.tr.len;
    const s = trap(tau, L, BLS.v, BLS.acc, BLS.dec);
    o.speed = trapV(tau, L, BLS.v, BLS.acc, BLS.dec);
    leg.tr.at(s, p0); leg.tr.at(s - 4, pA); leg.tr.at(s + 4, pB);
    const th = Math.atan2(pB.x - pA.x, pB.z - pA.z);
    let h = lerpA(A.heading, th, smoothstep(0, BLS.pivot, tau));
    h = lerpA(h, leg.B.heading, smoothstep(leg.Tc - 7, leg.Tc, tau));
    o.transit = smoothstep(0, 7, tau) * (1 - smoothstep(leg.Tc - 9, leg.Tc - 1, tau));
    o.heading = h + 0.05 * Math.sin(tb * 0.23) * o.transit;
    o.x = p0.x; o.z = p0.z; o.y = p0.y + 0.9 * Math.sin(tb * 0.31) * o.transit;
    o.pitch = clamp((pB.y - pA.y) / 8, -0.3, 0.3) * 0.4 + 0.03 * Math.sin(tb * 0.27) * o.transit;
    return o;
  }
  function blimpEta(mast) {
    if (BS.mast === mast) return 0;
    const Pc = CYC.P, start = mast === 'candy' ? 0 : CYC.catAt;
    return ((start - BS.t) % Pc + Pc) % Pc;
  }
  const blimpLadTop = new THREE.Vector3(), blimpLadBot = new THREE.Vector3();
  let blimpLadForce = -1;                      // ≥ 0: hold the ladder at this deployment (rides)
  function flyBlimp(tb, w, dt) {
    const o = blimpSample(tb, BS);
    f.set(Math.sin(o.heading) * Math.cos(o.pitch), Math.sin(o.pitch), Math.cos(o.heading) * Math.cos(o.pitch));
    p0.set(o.x, o.y, o.z);
    pose(BM[B.blimp], p0, f, UP);
    store(air.blimp, p0, f);
    // props: idle at the mast, spool up to cruise
    const rate = 3 + 16 * clamp(Math.max(o.transit, o.speed / BLS.v), 0, 1);
    o.prop = (o.prop + rate * dt) % TAU;
    m1.makeRotationZ(o.prop).setPosition(3.1, -5.15, -4.9); BM[B.blimpPropL].multiplyMatrices(BM[B.blimp], m1);
    m1.makeRotationZ(-o.prop + 0.7).setPosition(-3.1, -5.15, -4.9); BM[B.blimpPropR].multiplyMatrices(BM[B.blimp], m1);
    for (let i = 0; i < 2; i++) {
      const bone = EARS[i][0], sx = EARS[i][1], ph = EARS[i][2];
      const flick = Math.pow(Math.max(0, Math.sin(w * 0.83 + ph)), 18);
      const r = blimpRadius(5.8);
      q1.setFromEuler(e1.set(-0.25 - flick * 0.5, 0, -sx * (0.38 + flick * 0.35)));
      m1.compose(v1.set(sx * r * 0.55, r * 0.8, 5.8), q1, s1.set(1, 1, 1));
      BM[bone].multiplyMatrices(BM[B.blimp], m1);
    }
    // the rope ladder: unrolls from the balcony to the mast's foot while moored
    const k = blimpLadForce >= 0 ? blimpLadForce : o.ladK;
    const mi = MI[o.mast || 'candy'];
    m1.makeTranslation(0, LAD_TOP.y, LAD_TOP.z);
    BM[B.ladM0].multiplyMatrices(BM[B.blimp], m1);
    const e = BM[B.ladM0].elements;
    blimpLadTop.set(e[12], e[13], e[14]);
    if (k > 0.01 && o.mast) {
      blimpLadBot.set(lerp(e[12], mi.foot.x, k), lerp(e[13], mi.foot.y + 0.06, k), lerp(e[14], mi.foot.z, k));
      BM[B.ladM1].copy(BM[B.ladM0]);
      BM[B.ladM1].elements[12] = blimpLadBot.x; BM[B.ladM1].elements[13] = blimpLadBot.y; BM[B.ladM1].elements[14] = blimpLadBot.z;
    } else { blimpLadBot.copy(blimpLadTop); BM[B.ladM0].copy(HIDDEN); BM[B.ladM1].copy(HIDDEN); }
  }

  // ── the pump hose: nozzle → sag → filler cap, only while he is refuelling ────
  const pumpNozzle = new THREE.Vector3();
  {
    const [px, pz] = pumpXZ;
    const dx = parkXZ[0] + SU.x * 1.3 - px, dz = parkXZ[1] + SU.z * 1.3 - pz, l = Math.hypot(dx, dz) || 1;
    pumpNozzle.set(px + dx / l * 0.78, restH(px, pz, false) + 1.5, pz + dz / l * 0.78);
  }
  const hoseP = new THREE.Vector3(), hoseQ = new THREE.Vector3(), hoseM = new THREE.Vector3();
  function flyHose() {
    const on = BP.phase === 'refuel' && BP.refT > 1.4 && BP.refuelLeft + BP.waitLeft > 1.2;
    if (!on) { BM[B.hoseA].copy(HIDDEN); BM[B.hoseM].copy(HIDDEN); BM[B.hoseB].copy(HIDDEN); return; }
    hoseP.copy(pumpNozzle);
    bpLocal(0, 0.95, 1.3, hoseQ);
    hoseM.addVectors(hoseP, hoseQ).multiplyScalar(0.5);
    hoseM.y = Math.min(hoseP.y, hoseQ.y) - 0.9;
    f.subVectors(hoseM, hoseP).normalize(); pose(BM[B.hoseA], hoseP, f, UP);
    f.subVectors(hoseQ, hoseP).normalize(); pose(BM[B.hoseM], hoseM, f, UP);
    f.subVectors(hoseQ, hoseM).normalize(); pose(BM[B.hoseB], hoseQ, f, UP);
  }

  // ── blimp API ─────────────────────────────────────────────────────────────────
  const blimpApi = {
    masts: MI,
    /** 'candy' | 'cat' while moored at that mast, else null. */
    get moored() { return BS.mast; },
    /** Seconds until the blimp next moors at `mast` (0 while it is there). */
    eta: (mast) => blimpEta(mast),
    /** Seconds until it casts off (0 when not moored). */
    get departIn() { return BS.mast ? BS.dwellLeft : 0; },
    get dwellT() { return BS.dwellT; },
    get dwell() { return CYC.dw; },
    get cycle() { return CYC.P; },
    /** Ladder deployment 0..1 (1 = down to the mast's foot). */
    get ladder() { return blimpLadForce >= 0 ? blimpLadForce : BS.ladK; },
    /** 'moored' | 'unmoor' | 'cruise' */
    get phase() { return BS.phase; },
    /** The mast it is flying to (null while moored). */
    get leg() { return BS.leg; },
    get heading() { return BS.heading; },
    get speed() { return BS.speed; },
    get altitude() { return BS.y; },
    /** The passenger's standing spot on the balcony (world), and which way to face. */
    seat(out) { out.set(0.05, BAL.y + 0.02, BAL.z + 0.2).applyMatrix4(BM[B.blimp]); out.facing = BS.heading + Math.PI / 2; return out; },
    ladderTop(out) { return out.copy(blimpLadTop); },
    ladderBottom(out) { return out.copy(blimpLadBot); },
    foot: (mast) => MI[mast]?.foot || null,
    /** Hold the ladder at k (0..1) regardless of the schedule, or null to release. */
    holdLadder(k = null) { blimpLadForce = k == null ? -1 : clamp(k, 0, 1); },
    get matrix() { return BM[B.blimp]; },
  };

  // ── biplane API ───────────────────────────────────────────────────────────────
  let LAND_TD = 0, LAND_T = 0;
  {
    const L = tracks.land;
    for (let s = 0; s < L.len; s += 0.5) { if (L.ground(s) > 0.5) { LAND_TD = s; break; } LAND_T += 0.5 / Math.max(1, L.speed(s)); }
  }
  const LAP_T = bLoop.len / ROUTES.biplane.speed;
  const HOURS_PER_S = HPS;
  const S_HOME_D = exitDist(S_HOME), S_REJOIN_D = exitDist(S_REJOIN);
  function biplaneEta() {
    if (BP.phase === 'refuel') return 0;
    if (BP.phase === 'approach') {
      let t = 0; for (let s = BP.u; s < LAND_TD; s += 1) t += 1 / Math.max(1, BP.tr.speed(s));
      return t;
    }
    // back on the loop first (from a departure or a passenger run)
    let t0 = 0, d0 = exitDist(BP.s), since = BP.sinceStop;
    if (BP.mode === 'track') {
      const left = Math.max(0, BP.tr.len - BP.u);
      const homeT = tracks.home ? tracks.home.len / 12 : 0;
      t0 = left / 12 + (BP.phase === 'ferry' ? 8 + homeT : BP.phase === 'dropoff' ? 8 + homeT : 0);
      d0 = BP.phase === 'depart' ? S_REJOIN_D : S_HOME_D; since = 0;
    }
    const hour = ctx.state.time ?? 12;
    if (ctx.state.timeFrozen) {
      // frozen clock: every lap, while the frozen hour is inside the window
      if (!(hour >= DAY_FROM && hour <= DAY_TO)) return Infinity;
      let tc = t0 + d0 / V0;
      while (since + tc - t0 < STOP_MIN) tc += LAP_T;
      return tc + LAND_T;
    }
    // running clock: the timetable. The soonest he can cross S_EXIT is flat
    // out from here; on the loop he aims at the slot itself.
    const tMin = t0 + d0 / VMAX;
    let best = Infinity;
    for (let i = 0; i < SLOTS.length; i++) {
      const d = hdiff(hour, SLOTS[i]);
      const dueNow = !served[i] && d >= -EARLY && d <= MAX_LATE;
      let ahead = -d; if (ahead <= 0) ahead += 24;
      // occurrences: due now (maybe late) · the next one · the one after
      for (let k = dueNow ? 0 : 1; k < 3; k++) {
        const ts = k === 0 ? -d / HPS : (ahead + 24 * (k - 1)) / HPS;
        const tc = Math.max(ts, tMin);
        const hc = (((hour + tc * HPS) % 24) + 24) % 24, late = hdiff(hc, SLOTS[i]);
        if (late < -EARLY || late > MAX_LATE || !(hc >= DAY_FROM && hc <= DAY_TO)) continue;
        if (tc < best) best = tc;
        break;
      }
    }
    return best < Infinity ? best + LAND_T : Infinity;
  }
  const biplaneApi = {
    /** 'loop' | 'track' */
    get mode() { return BP.mode; },
    /** 'loop' | 'approach' | 'refuel' | 'depart' | 'ferry' | 'dropoff' | 'home' */
    get phase() { return BP.phase; },
    get stopped() { return BP.phase === 'refuel' || BP.phase === 'dropoff'; },
    get onGround() { return BP.groundK > 0.5; },
    get speed() { return BP.v; },
    get heading() { return air.biplane.heading; },
    /** Seconds of refuelling (plus any wait he agreed to) left. */
    get refuelLeft() { return BP.phase === 'refuel' ? BP.refuelLeft + BP.waitLeft : 0; },
    get passenger() { return BP.passenger; },
    get stops() { return BP.stops; },
    /** Seconds to the next touchdown at the fuel stop (0 while there, Infinity: not today). */
    eta: biplaneEta,
    /** True while a fuel stop can still start today (approaches start 06:00 – ≈ 14:34). */
    get flyingToday() { const h = ctx.state.time ?? 12; return h < DAY_TO && !(ctx.systems.sky?.lampsOn ?? ctx.state.isNight); },
    /** Approach-start window (hours) and the two daily slots he steers for. */
    window: { from: DAY_FROM, to: DAY_TO, slots: SLOTS.slice() },
    /** Timetable state (tests): which slots are served, the cruise he is flying. */
    get timetable() { return { slots: SLOTS.slice(), served: served.slice(), loopV: +BP.loopV.toFixed(2), lastSkip: BP.lastSkip, slot: BP.slot }; },
    /** He waits (while you talk / climb in): extend the stop, ≤ 40 s per stop,
     *  and never past lamps-on (the field goes dark; he will not sit there). */
    wait(sec = 6) {
      if (BP.phase !== 'refuel') return false;
      let room = Math.max(0, 40 - BP.waitUsed);
      if (!ctx.state.timeFrozen) {
        const toLamps = hdiff(LAMP_ON, ctx.state.time ?? 12) / HPS - BP.refuelLeft - BP.waitLeft;
        room = Math.min(room, Math.max(0, toLamps));
      }
      const add = Math.min(room, Math.max(0, sec - BP.waitLeft - BP.refuelLeft));
      if (add > 0) { BP.waitLeft += add; BP.waitUsed += add; }
      return true;
    },
    /** A passenger climbs into the deckchair (refuel only): he flies to Wing Nut Field. */
    board() { if (BP.phase !== 'refuel') return false; BP.passenger = true; if (!tracks.ferry) buildWingnut(); return true; },
    unboard() { if (BP.phase === 'refuel') BP.passenger = false; return true; },
    /** The passenger is off at Wing Nut Field: he goes home. */
    release() { if (BP.phase === 'dropoff') BP.released = true; return true; },
    /** Rider (feet) position in the deckchair, facing the nose. */
    seat(out) { bpLocal(0, 0.62 - 0.72, -1.66, out); out.facing = air.biplane.heading; return out; },
    /** The pilot's head (for talking). */
    pilot(out) { return bpLocal(0, 1.2, -0.84, out); },
    park: { x: parkXZ[0], z: parkXZ[1], heading: Math.atan2(SU.x, SU.z) },
    pump: { x: pumpXZ[0], z: pumpXZ[1], y: restH(pumpXZ[0], pumpXZ[1], false), nozzle: pumpNozzle },
    /** Wing Nut Field's drop-off: { x, z, off:[x,z], d } (built on first use). */
    get dropoff() { if (!tracks.stop) buildWingnut(); return tracks.stop; },
    get tracks() { return tracks; },
  };

  // ── PAPER PLANES ─────────────────────────────────────────────────────────────
  function flyPaper(t, w, cam) {
    const e = 0.05;
    for (let j = 0; j < 3; j++) {
      paperPos(t - e, j, pA); paperPos(t, j, p0); paperPos(t + e, j, pB);
      f.subVectors(pB, pA).normalize();
      acc.copy(pB).add(pA).addScaledVector(p0, -2).multiplyScalar(1 / (e * e));
      up.set(0, G, 0).add(acc).normalize();
      pose(BM[PAPER[j]], p0, f, up);
      // paper flutter: a little roll about the nose
      m1.makeRotationZ(0.1 * Math.sin(w * 11 + j * 2.1) + 0.05 * Math.sin(w * 23 + j));
      BM[PAPER[j]].multiply(m1);
      // never through the lens: a plane inside 18 u of the camera shrinks away
      // (gone by 9 u) instead of filling the frame with a pastel triangle
      if (cam) {
        const dc = p0.distanceTo(cam.position);
        if (dc < 18) { const k = Math.max(0.001, clamp((dc - 9) / 9, 0, 1)); const kk = k * k * (3 - 2 * k); m1.makeScale(kk, kk, kk); BM[PAPER[j]].multiply(m1); }
      }
      store(air.paper[j], p0, f);
    }
  }

  // ── CANDY DROPS ──────────────────────────────────────────────────────────────
  const DROP_EVERY = 40, DROP_MAX_WAITING = 3, DROP_MAX_TOTAL = 60, CANDY_LIFT = 1.55;
  const drop = { active: false, t: 0, T: 1, x0: 0, y0: 0, z0: 0, xl: 0, zl: 0, yl: 0, vx: 0, vz: 0, landed: false, t2: 0, side: 1 };
  let dropClock = DROP_EVERY - 22;        // first drop ~22 s in
  let dropSeq = 0;
  const drops = [];
  const NO_DROP = ['candy_village', 'candy_palace', 'giant_cupcake', 'candy_dock', 'chocolate_lake', 'sour_shrine'];
  function landingOk(x, z) {
    if (world.islandAt(x, z) !== 'candy') return false;
    if (!world.isFreeGround(x, z, { pathMargin: 0.2, riverMargin: 1.6, avoidLandmarks: true, minHeight: 1.1 })) return false;
    for (const id of NO_DROP) { const l = world.LANDMARKS[id]; if (l && Math.hypot(x - l.x, z - l.z) < l.r + 4) return false; }
    const cols = ctx.colliders || [];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.box) {
        const ca = Math.cos(c.rot || 0), sa = Math.sin(c.rot || 0), dx = x - c.x, dz = z - c.z;
        if (Math.abs(dx * ca + dz * sa) < (c.w || 1) / 2 + 1.6 && Math.abs(-dx * sa + dz * ca) < (c.d || 1) / 2 + 1.6) return false;
      } else if (Math.hypot(x - c.x, z - c.z) < (c.r || 0) + 1.6) return false;
    }
    for (const w of ctx.walkables || []) { const wy = w.test?.(x, z); if (wy != null && wy > world.height(x, z) + 0.6) return false; }
    return true;
  }
  function findLanding(x, z) {
    if (landingOk(x, z)) return [x, z];
    for (let r = 3; r <= 30; r += 3) for (let a = 0; a < 12; a++) {
      const ang = a / 12 * TAU + r * 0.37, px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
      if (landingOk(px, pz)) return [px, pz];
    }
    return null;
  }
  function waiting() { let n = 0; for (const p of drops) if (p && !p.taken) n++; return n; }
  function startDrop(x0, y0, z0, xl, zl, vx, vz, k0 = 0) {
    const yl = world.height(xl, zl) + CANDY_LIFT;
    Object.assign(drop, { active: true, t: 0, x0, y0, z0, xl, zl, yl, vx, vz, landed: false, t2: 0, side: (dropSeq % 2) ? 1 : -1 });
    drop.T = 1.2 + Math.max(2, (y0 - 4.5 - yl) / 3.1);
    drop.t = k0 * drop.T;
  }
  function releaseFromBiplane() {
    if (drop.active || BP.mode !== 'loop') return false;
    if (waiting() >= DROP_MAX_WAITING || dropSeq >= DROP_MAX_TOTAL) return false;
    const a = air.biplane;
    if (world.islandAt(a.x, a.z) !== 'candy') return false;
    const fx0 = Math.sin(a.heading), fz0 = Math.cos(a.heading);
    const spot = findLanding(a.x + fx0 * 12, a.z + fz0 * 12);
    if (!spot) return false;
    startDrop(a.x, a.y - 1.3, a.z, spot[0], spot[1], fx0 * ROUTES.biplane.speed, fz0 * ROUTES.biplane.speed);
    ctx.events.emit('planes:drop', { x: spot[0], z: spot[1] });
    return true;
  }
  function land() {
    const inv = ctx.systems.inventory;
    const id = 'planes_drop_' + (++dropSeq);
    let p = null;
    try {
      p = inv?.registerPickup?.({ id, x: drop.xl, z: drop.zl, itemId: 'candy', n: 1, label: 'Pick up the air-dropped sweet', variant: 'wrapper', tint: 0xff4f9a }) || null;
    } catch (err) { console.warn('[planes] registerPickup failed', err?.message || err); }
    if (p) {
      drops.push(p);
      p.mapId = id;              // inventory.take() removes a pickup's own map marker
      try { ctx.systems.ui?.addMapMarker?.({ id, x: drop.xl, z: drop.zl, glyph: 'candy', label: 'Air-dropped sweet' }); } catch { /* optional */ }
    }
    const pl = ctx.systems.player?.position;
    if (pl && Math.hypot(pl.x - drop.xl, pl.z - drop.zl) < 70) ctx.systems.ui?.toast?.('Air drop! A sweet on a parachute just landed nearby.', 3.2);
    ctx.events.emit('planes:landed', { x: drop.xl, z: drop.zl, id });
  }

  function flyDrop(dt) {
    if (!drop.active) { BM[B.candy].copy(HIDDEN); BM[B.canopy].copy(HIDDEN); return; }
    const d = drop;
    if (!d.landed) {
      d.t += dt;
      const k = Math.min(1, d.t / d.T);
      const inert = (1 - Math.exp(-2.2 * d.t)) / 2.2 * (1 - k);
      const e = smoothstep(0, 1, k);
      const sway = Math.sin(d.t * 1.6) * 0.7 * Math.min(1, d.t / 2) * (1 - k * 0.6);
      const hx = d.x0 + (d.xl - d.x0) * e + d.vx * inert * 0.35;
      const hz = d.z0 + (d.zl - d.z0) * e + d.vz * inert * 0.35;
      const fall = d.t < 1.2 ? 1.8 * d.t * d.t : 2.6 + (d.t - 1.2) * ((d.y0 - 2.6 - d.yl) / Math.max(0.1, d.T - 1.2));
      const y = Math.max(d.yl, d.y0 - fall);
      const open = smoothstep(0.35, 1.3, d.t);
      const swing = Math.sin(d.t * 1.6 + 0.6) * 0.16 * open;
      q1.setFromEuler(e1.set(0, d.t * 0.5 + d.side, swing));
      m1.compose(v1.set(hx + sway, y, hz), q1, s1.set(1, 1, 1));
      BM[B.candy].copy(m1);
      m2.compose(v1.set(0, 2.6 * (0.55 + 0.45 * open), 0), q1.identity(), s1.set(0.15 + 0.85 * open, 0.2 + 0.8 * open, 0.15 + 0.85 * open));
      BM[B.canopy].multiplyMatrices(m1, m2);
      if (k >= 1) { d.landed = true; d.t2 = 0; land(); }
    } else {
      d.t2 += dt;
      // the sweet is now the inventory's; the canopy settles and crumples
      BM[B.candy].copy(HIDDEN);
      const c = Math.min(1, d.t2 / 0.9);
      q1.setFromEuler(e1.set(0, d.side, 0.4 * c));
      const gy = world.height(d.xl, d.zl);
      m1.compose(v1.set(d.xl + 1.2 * c, lerp(d.yl + 2.6, gy + 0.2, c), d.zl), q1, s1.set(1 + 0.25 * c, 1 - 0.85 * c, 1 + 0.25 * c));
      BM[B.canopy].copy(m1);
      if (d.t2 > 2.4) { d.active = false; }
    }
  }

  // ── per-frame helpers ────────────────────────────────────────────────────────
  const BLUR = new Float32Array([1, 1, 1]);   // per disc: 0 = blades still (no blur disc)
  function writeProps() {
    BLUR[0] = smoothstep(7, 16, BP.propRate);
    BLUR[1] = BLUR[2] = smoothstep(5, 12, 3 + 16 * clamp(Math.max(BS.transit, BS.speed / BLS.v), 0, 1));
    for (let d = 0; d < 3; d++) {
      const bone = DISCS[d][0], r = DISCS[d][1] * BLUR[d];
      const m = BM[bone].elements;
      const c0 = nTrail + d * nDiscV;
      // a hair in front of the blades so the two never z-fight
      const ox = m[8] * 0.06 + m[12], oy = m[9] * 0.06 + m[13], oz = m[10] * 0.06 + m[14];
      fxPos[c0 * 3] = ox; fxPos[c0 * 3 + 1] = oy; fxPos[c0 * 3 + 2] = oz;
      for (let k = 0; k < DR.length; k++) {
        const rk = r * DR[k];
        for (let i = 0; i < DISC; i++) {
          const lx = discLocal[i][0] * rk, ly = discLocal[i][1] * rk, o = (c0 + 1 + k * DISC + i) * 3;
          fxPos[o] = m[0] * lx + m[4] * ly + ox; fxPos[o + 1] = m[1] * lx + m[5] * ly + oy; fxPos[o + 2] = m[2] * lx + m[6] * ly + oz;
        }
      }
    }
  }
  const blobM = new THREE.Matrix4();
  // lean: 1 = cast along the true sun direction, 0 = straight down. A shadow
  // 40 u from its aircraft reads as a stray smudge, so they lean only partway.
  const LK = world.LAKE;
  const groundY = (x, z, decks) => {            // terrain, the sea, Chocolate Lake's surface
    let h = Math.max(world.height(x, z), 0.12);
    if (decks) {                                // …and plaza floors / decks / low props (Contract A)
      const gh = ctx.systems.player?.groundHeight?.(x, z);
      if (typeof gh === 'number' && gh === gh) h = Math.max(h, gh);
    }
    return (LK && Math.hypot(x - LK.x, z - LK.z) < LK.r + 1) ? Math.max(h, LK.surface ?? 0) : h;
  };
  function blob(i, pos, hd, w, l, alpha, sun, lean) {
    if (alpha <= 0.002 || !sun || sun.y < 0.2) { aAlpha.array[i] = 0; return; }
    const kx = sun.x * lean / sun.y, kz = sun.z * lean / sun.y;
    let h = groundY(pos.x, pos.z, false);
    let gx = pos.x - kx * (pos.y - h), gz = pos.z - kz * (pos.y - h);
    h = groundY(gx, gz, false); gx = pos.x - kx * (pos.y - h); gz = pos.z - kz * (pos.y - h);
    h = groundY(gx, gz, true);
    q1.setFromAxisAngle(UP, hd);
    blobM.compose(v1.set(gx, h + 0.35, gz), q1, s1.set(w, 1, l));
    blobs.setMatrixAt(i, blobM);
    aAlpha.array[i] = alpha * clamp(1.3 - (pos.y - h) / 200, 0.35, 1) * smoothstep(0.2, 0.42, sun.y);
  }

  let markerT = 0, overB = false, overJ = false;
  function flyover(name) {
    ctx.events.emit('planes:flyover', { name });
    try { ctx.systems.audio?.play?.(name === 'jet' ? 'jet' : 'plane'); } catch { /* audio is optional */ }
  }
  const mkBiplane = { id: 'plane_biplane', x: 0, z: 0, glyph: 'plane', label: 'Banner biplane' };
  const mkBlimp = { id: 'plane_blimp', x: 0, z: 0, glyph: 'plane', label: 'SUGAR / CATNIP blimp' };

  function update(dt, c) {
    const st = c.state;
    const run = !st.paused, adv = run && !api.hold;
    if (run) { TR += dt; if (!api.hold) T += dt; }
    const t = T, tr = TR;           // tr: rotor / ripple / flutter clock, keeps running under hold
    const rdt = run ? dt : 0;
    stepBiplane(adv ? dt : 0);
    flyBiplane(t, tr, rdt);
    flyHose();
    flyJet(t, adv ? dt : 0);
    flyBlimp(t + blimpOff, tr, rdt);
    flyPaper(t + tP, tr, c.camera);
    // drops
    if (!st.paused) {
      dropClock += dt;
      if (dropClock >= DROP_EVERY && !api.hold) { if (releaseFromBiplane()) dropClock = 0; else dropClock = DROP_EVERY - 3; }
      flyDrop(dt);
    }
    writeProps();
    fxGeo.attributes.position.needsUpdate = true;
    if (trailOn) fxGeo.attributes.color.needsUpdate = true;

    // light: contrail tint, glow, nav lights
    const sky = c.systems.sky;
    const day = st.daylight ?? 1;
    const lamp = sky?.lampMix ?? (st.isNight ? 1 : 0);
    tint.copy(nightTint).lerp(white, clamp(day * 1.2, 0, 1));
    if (sky?.horizonColor) tint.lerp(sky.horizonColor, 0.18 * (1 - Math.abs(day * 2 - 1)));
    fxMat.color.copy(tint);
    decalMat.emissiveIntensity = 1.6 * lamp;
    uGlow.value = lamp;
    uDay.value = clamp(day * 1.3, 0, 1);
    if (sky?.sunDir) uSunV.value.copy(sky.sunDir).transformDirection(c.camera.matrixWorldInverse);
    bodyMat.emissive.setRGB(0.012 + 0.02 * day, 0.009 + 0.015 * day, 0.012 + 0.015 * day);
    const night = sky?.lampsOn ?? st.isNight;
    if (night !== bannerNight) { bannerNight = night; setBannerText(night); }
    const nightK = clamp(Math.max(lamp, 1 - day * 1.6), 0, 1);
    navPoints.visible = nightK > 0.01;
    if (navPoints.visible) {
      for (let i = 0; i < NL; i++) { v1.copy(lightLocal[i]).applyMatrix4(BM[lights[i][0]]); lPos[i * 3] = v1.x; lPos[i * 3 + 1] = v1.y; lPos[i * 3 + 2] = v1.z; }
      lGeo.attributes.position.needsUpdate = true;
      const u = lMat.uniforms;
      u.uTime.value = tr; u.uNight.value = nightK;
      const cam = c.camera;
      u.uScale.value = c.renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360));
      u.uFogFar.value = c.scene.fog ? c.scene.fog.far : 600;
    }
    // soft ground shadows
    const sun = sky?.sunDir;
    // as dark as the world's own cast shadows, or it does not read as one
    const sa = 0.86 * clamp(day * 1.4 - 0.2, 0, 1);
    blob(0, air.biplane, air.biplane.heading, 7.2, 6.0, sa, sun, 0.5);
    v1.set(0, 0, 0).applyMatrix4(BM[B.banner + (K >> 1)]);
    p0.set(v1.x, v1.y, v1.z);
    const bh = Math.atan2(BM[B.banner].elements[12] - BM[B.banner + K - 1].elements[12], BM[B.banner].elements[14] - BM[B.banner + K - 1].elements[14]);
    blob(1, p0, bh, 1.9, BANNER_L * 0.92, sa * 0.8, sun, 0.5);
    blob(2, air.blimp, air.blimp.heading, 9.5, 27, sa * 0.9, sun, 0.5);
    for (let j = 0; j < 3; j++) blob(3 + j, air.paper[j], air.paper[j].heading, 2.9 * PS, 3.3 * PS, sa * 0.85, sun, 0.2);
    blobs.instanceMatrix.needsUpdate = true; aAlpha.needsUpdate = true;
    blobs.visible = sa > 0.002;

    // fly-overs: a hook for audio / ambient chatter (edge-triggered, no allocation while idle)
    const pl = c.systems.player?.position;
    if (pl) {
      const nb = Math.hypot(air.biplane.x - pl.x, air.biplane.z - pl.z) < 45;
      const nj = air.jet.active && Math.hypot(air.jet.x - pl.x, air.jet.z - pl.z) < 90;
      if (nb && !overB) flyover('biplane');
      if (nj && !overJ) flyover('jet');
      overB = nb; overJ = nj;
    }

    // map markers (the map updates a marker in place when the id repeats)
    markerT -= dt;
    if (markerT <= 0) {
      markerT = 0.25;
      const ui = c.systems.ui;
      for (let i = 0; i < drops.length; i++) {       // belt and braces: a taken sweet leaves the map
        const p = drops[i];
        if (p.taken && !p._mapGone) { p._mapGone = true; try { ui?.removeMapMarker?.(p.mapId || p.id); } catch { /* optional */ } }
      }
      if (typeof ui?.addMapMarker === 'function') {
        try {
          mkBiplane.x = air.biplane.x; mkBiplane.z = air.biplane.z; ui.addMapMarker(mkBiplane);
          mkBlimp.x = air.blimp.x; mkBlimp.z = air.blimp.z;
          mkBlimp.label = BS.mast === 'candy' ? 'SUGAR blimp · boarding at Sugar Pier' : BS.mast === 'cat' ? 'SUGAR blimp · boarding at Fish Harbor'
            : BS.leg === 'cat' ? 'SUGAR blimp · bound for Fish Harbor' : 'SUGAR blimp · bound for Sugar Pier';
          ui.addMapMarker(mkBlimp);
        } catch { /* the map is optional */ }
      }
    }
  }

  // ── public API ───────────────────────────────────────────────────────────────
  Object.assign(api, {
    group, aircraft: air, drops, hold: false, routes: ROUTES,
    meshes: { body, decal, fx, lights: navPoints, blobs },
    update,
    debugTeleport(name, t = 0, hold = false, lane = null) {
      const at = Array.isArray(t) ? t : null;       // jet only: [x, z] = put it abeam of that point
      t = at ? 0 : ((Number(t) % 1) + 1) % 1;
      if (name === 'biplane') { toLoop(t * bLoop.len); histFill((d, o) => bLoop.at(BP.s - d, o)); }
      else if (name === 'blimp') blimpOff = t * CYC.P - T;
      else if (name === 'paper') { const w = ROUTES.paper.speed / ROUTES.paper.r; tP = t * TAU / w - T; }
      else if (name === 'jet') {
        const J = ROUTES.jet; const k = lane != null ? Math.max(0, Math.floor(lane)) : Math.max(0, Math.floor((T + jetOff) / J.period));
        if (at) { jetLaneFor(k); t = clamp(((at[0] - jetA.x) * jetDir.x + (at[1] - jetA.z) * jetDir.z) / jetLen, 0, 0.999); }
        jetOff = k * J.period + t * (2 * J.half) / J.speed - T;
      }
      if (hold) api.hold = true;
      update(0, ctx);
      return api.where(name);
    },
    setHold(v = true) { api.hold = !!v; },
    /** Several at once, for views: debugPose({ biplane: 0.76, blimp: 0.2, jet: 0.5, paper: 0.1 }, hold). */
    debugPose(map = {}, hold = true) {
      for (const [n, t] of Object.entries(map)) if (n !== 'jetLane') api.debugTeleport(n, t, false, n === 'jet' ? (map.jetLane ?? 1) : null);
      if (hold) api.hold = true;
      return map;
    },
    /** Screenshot helper: turn the game camera toward an aircraft and hold the
     *  same lens as holding L (elevation 0.15, fov 44, pitch 0.30). */
    debugLookUp(name = 'biplane', seconds = 30) {
      const cam = ctx.systems.camera, pl = ctx.systems.player?.position, a = api.where(name);
      if (!cam || !pl || !a) return null;
      const dx = a.x - pl.x, dz = a.z - pl.z, d = Math.hypot(dx, dz) || 1;
      const azimuth = Math.atan2(-dx / d, -dz / d);
      cam.setParams?.({ azimuth }); cam.snap?.();
      cam.cinematic?.({ azimuth, elevation: 0.15, fov: 44, pitch: 0.30, duration: seconds, in: 0.05, hold: seconds - 0.3, out: 0.25 });
      return { azimuth, dist: d };
    },
    /** Screenshot helper: park the free camera on an aircraft. rel = azimuth
     *  relative to its heading (π/2 = its port side, -π/2 starboard, 0 behind). */
    debugFrame(name = 'biplane', o = {}) {
      const cam = ctx.systems.camera, a = api.where(name);
      if (!cam?.setFree || !a) return null;
      const v = { target: [a.x + (o.dx || 0), a.y + (o.dy || 0), a.z + (o.dz || 0)], azimuth: o.az ?? (a.heading + (o.rel ?? Math.PI / 2)),
        elevation: o.el ?? 0.12, distance: o.dist ?? 40, fov: o.fov ?? 40 };
      cam.setFree(v);
      return v;
    },
    debugDrop(x, z, k = 0.5) {
      const y0 = world.height(x, z) + 48;
      startDrop(x - 6, y0, z - 4, x, z, 8, 5, clamp(k, 0, 0.98));
      flyDrop(0);
      return { x, z, y: BM[B.candy].elements[13] };
    },
    dropCandy() { dropClock = 0; return releaseFromBiplane(); },
    where(name) {
      if (name === 'shadow') {                      // the biplane's ground shadow (views)
        blobs.getMatrixAt(0, m2); const e = m2.elements;
        return { x: +e[12].toFixed(2), y: +e[13].toFixed(2), z: +e[14].toFixed(2), heading: air.biplane.heading, alpha: +aAlpha.array[0].toFixed(3) };
      }
      const a = name === 'paper' ? air.paper[0] : air[name];
      return a ? { x: +a.x.toFixed(2), y: +a.y.toFixed(2), z: +a.z.toFixed(2), heading: +a.heading.toFixed(3) } : null;
    },
    pathPoint(name, t) {
      const o = new THREE.Vector3();
      if (name === 'biplane') bLoop.at(t * bLoop.len, o);
      else if (name === 'blimp') { const tmp = blimpSample(t * CYC.P, { prop: 0 }); o.set(tmp.x, tmp.y, tmp.z); }
      else if (name === 'paper') { const w = ROUTES.paper.speed / ROUTES.paper.r; paperPos(t * TAU / w, 0, o); }
      return { x: o.x, y: o.y, z: o.z };
    },
    /** Minimum clearance of each route over terrain and the measured landmark tops. */
    clearance() {
      const out = {};
      const test = (name, sampler, n, foot) => {
        let min = Infinity, at = null;
        for (let i = 0; i < n; i++) {
          const p = sampler(i / n);
          let top = world.height(p.x, p.z);
          for (const o of OBSTACLE_TOPS) if (Math.hypot(p.x - o.x, p.z - o.z) < o.r + foot) top = Math.max(top, o.top);
          const cl = p.y - top;
          if (cl < min) { min = cl; at = { x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +p.y.toFixed(1), over: +top.toFixed(1) }; }
        }
        out[name] = { min: +min.toFixed(1), at };
      };
      test('biplane', (u) => api.pathPoint('biplane', u), 600, 4);
      // the blimp is only held to the rule in open cruise (it moors at masts by design)
      test('blimp', (u) => { const q = blimpSample(u * CYC.P, { prop: 0 }); return q.phase === 'cruise' && q.transit > 0.9 ? q : { x: 0, y: 999, z: 0 }; }, 900, 13);
      test('jet', (u) => ({ x: -560 + 1120 * u, y: ROUTES.jet.alt - 4, z: 0 }), 400, 8);
      return out;
    },
    // ── WAVE 4 · Contract L ───────────────────────────────────────────────────
    air: { masts: MI, strip: { ...STR, along: SU, north: SN, park: { x: parkXZ[0], z: parkXZ[1], heading: Math.atan2(SU.x, SU.z) }, pump: { x: pumpXZ[0], z: pumpXZ[1] }, at: (a, sd) => SP(a, sd), pad: PAD, restH } },
    blimp: blimpApi,
    biplane: biplaneApi,
    summonJet,
    /** Keep the summoned jet hovering `s` more seconds (from now). */
    jetHold(sec = 4) { if (SUMN.on && SUMN.phase === 'hover') SUMN.hold = SUMN.holdT + Math.max(0, sec); return SUMN.on; },
    /** Let the summoned jet go now (once its ladder has reached the point). */
    jetGo() { if (SUMN.on && SUMN.phase === 'hover') SUMN.hold = 0; return SUMN.on; },
    jetStateNow() {
      return {
        mode: SUMN.on ? SUMN.phase : (air.jet.active ? 'lane' : 'idle'),
        x: air.jet.x, y: air.jet.y, z: air.jet.z, heading: air.jet.heading, speed: SUMN.on ? SUMN.v : ROUTES.jet.speed,
        target: SUMN.on ? { x: SUMN.target.x, y: SUMN.target.y, z: SUMN.target.z } : null,
        holdLeft: SUMN.on && SUMN.phase === 'hover' ? Math.max(0, SUMN.hold - SUMN.holdT) : 0,
        ladder: { k: SUMN.ladK, top: { x: jetLadTop.x, y: jetLadTop.y, z: jetLadTop.z }, bottom: { x: jetLadBot.x, y: jetLadBot.y, z: jetLadBot.z } },
      };
    },
    /** Views: park the blimp at 'candy' | 'cat' (k = fraction of the mooring),
     *  'mid' | 'midBack' (k = fraction of the crossing), or a cycle fraction. */
    debugBlimp(where = 'candy', k = 0.5, hold = true) {
      let tb;
      if (where === 'candy') tb = clamp(k, 0, 1) * CYC.dw;
      else if (where === 'cat') tb = CYC.catAt + clamp(k, 0, 1) * CYC.dw;
      else if (where === 'mid') tb = CYC.dw + BLS.rev + clamp(k, 0, 1) * LEG.cat.Tc;
      else if (where === 'midBack') tb = CYC.catAt + CYC.dw + BLS.rev + clamp(k, 0, 1) * LEG.candy.Tc;
      else tb = (((Number(where) || 0) % 1) + 1) % 1 * CYC.P;
      blimpOff = tb - T;
      if (hold) api.hold = true;
      update(0, ctx);
      return { t: tb, phase: BS.phase, mast: BS.mast, x: +BS.x.toFixed(1), y: +BS.y.toFixed(1), z: +BS.z.toFixed(1) };
    },
    /** Views: put the biplane at 'approach' | 'refuel' | 'ferry' | 'dropoff' |
     *  'home' | 'depart' (k = fraction of that leg; refuel: of the 25 s). The
     *  banner history is replayed so it trails (or lies) where it should. */
    debugBiplane(phase = 'refuel', k = 0.3, hold = true) {
      const dt = 1 / 30;
      BP.engine = 1;
      const replay = (name, ph, uTo) => {
        startTrack(name, ph, 0);
        const tr = tracks[name];
        if (name === 'land') histFill((d, o) => bLoop.at(S_EXIT - d, o));
        else histFill((d, o) => tr.at(Math.max(0, -d), o), 6);
        let n = 0;
        while (BP.u < uTo && n++ < 20000) { BP.v = Math.max(0.45, tr.speed(BP.u)); BP.u = Math.min(uTo, BP.u + BP.v * dt); flyBiplane(T, TR, dt); }
      };
      if (phase === 'approach') replay('land', 'approach', clamp(k, 0, 1) * tracks.land.len);
      else if (phase === 'refuel' || phase === 'dropoff') {
        if (phase === 'dropoff' && !tracks.ferry) buildWingnut();
        replay(phase === 'refuel' ? 'land' : 'ferry', phase === 'refuel' ? 'approach' : 'ferry', (phase === 'refuel' ? tracks.land : tracks.ferry).len);
        BP.u = BP.tr.len; BP.v = 0; BP.phase = phase;
        // (held views never step the plane: set the engine the stop would have by now,
        // or the propeller keeps its taxi blur disc — a pink bubble round the nose)
        if (phase === 'refuel') {
          BP.refuelLeft = AIR.refuel * (1 - clamp(k, 0, 1)); BP.waitLeft = 0; BP.refT = AIR.refuel - BP.refuelLeft;
          BP.engine = Math.max(smoothstep(2.5, 0.2, BP.refuelLeft), 1 - smoothstep(0, 1.6, BP.refT));
        } else { BP.dropT = 0; BP.released = false; BP.passenger = true; BP.engine = 0.35; }
        ctx.events.emit('planes:biplane', { phase });
      } else if (phase === 'ferry' || phase === 'home') {
        if (!tracks.ferry) buildWingnut();
        replay(phase, phase, clamp(k, 0, 1) * tracks[phase].len);
        if (phase === 'ferry') BP.passenger = true;
      } else if (phase === 'depart') replay('depart', 'depart', clamp(k, 0, 1) * tracks.depart.len);
      else { toLoop(clamp(k, 0, 1) * bLoop.len); histFill((d, o) => bLoop.at(BP.s - d, o)); }
      if (hold) api.hold = true;
      update(0, ctx);
      return { phase: BP.phase, x: +air.biplane.x.toFixed(1), y: +air.biplane.y.toFixed(1), z: +air.biplane.z.toFixed(1), heading: +air.biplane.heading.toFixed(3) };
    },
    /** Views: summon the jet to (x, y, z) and run it forward to 'approach' |
     *  'hover' (ladder down) | 'depart' without rendering. */
    debugSummon(x = 0, y = 60, z = 22, phase = 'hover', hold = true) {
      summonJet({ x, y, z });
      const dt = 1 / 30;
      let n = 0;
      const done = () => (phase === 'approach' ? SUMN.u > SUMN.tr.len * 0.6 : phase === 'hover' ? SUMN.phase === 'hover' && SUMN.ladK >= 1 : SUMN.phase === 'depart' && SUMN.depT > 3);
      while (SUMN.on && !done() && n++ < 6000) { T += dt; TR += dt; flyJet(T, dt); }
      if (hold) api.hold = true;
      update(0, ctx);
      return api.jetStateNow();
    },
    stats() {
      const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
      return { calls: [body, decal, fx, navPoints, blobs].filter((m) => m.visible).length, tris: Math.round(tris(bodyGeo) + tris(decalGeo) + fxIdx.length / 3 + NBLOB * 2), bones: nb };
    },
  });

  // (Object.assign would have frozen a getter's first value)
  Object.defineProperty(api, 'jetState', { get: () => api.jetStateNow(), enumerable: true });

  setBannerText(false); bannerNight = false;
  update(0, ctx);
  console.warn(`[planes] 4 aircraft · ${api.stats().tris} tris · ≤5 draw calls (body, decal, fx, lights, blobs) · ${nb} bones`);
  return api;
}
