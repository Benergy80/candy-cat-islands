// ─────────────────────────────────────────────────────────────────────────────
// WORLD MAP — the single shared source of truth for layout.
// Every system (terrain, vegetation, architecture, NPCs, ferry, UI) reads from
// here so that placements agree. Do NOT change island centers/radii without
// telling the orchestrator; ADD landmarks/paths freely (append, don't rename).
//
// Coordinates: X east, Z south (three.js default: +Z toward the default camera),
// Y up. Sea level y = 0. One unit ≈ 1 meter; the player is ~1.7 units tall.
// ─────────────────────────────────────────────────────────────────────────────
import { Simplex2 } from './noise.js';

export const SEA_LEVEL = 0;
export const DAY_LENGTH_SEC = 300; // one full day/night cycle (debug can override)

export const ISLANDS = {
  candy: { id: 'candy', name: 'The Candy Kingdom', center: { x: -150, z: 0 }, radius: 118, seed: 11 },
  cat:   { id: 'cat',   name: 'Cat Island',       center: { x:  150, z: 0 }, radius: 118, seed: 23 },
};

// Named places. `r` is an approximate zone radius. Builders should place their
// content relative to these so everything lines up.
export const LANDMARKS = {
  // ── Candyland ──────────────────────────────────────────────────────────────
  candy_dock:      { island: 'candy', x: -42,  z: 22,  r: 12, label: 'Sugar Pier' },
  candy_village:   { island: 'candy', x: -140, z: 40,  r: 34, label: 'Gumdrop Village' },
  gummy_forest:    { island: 'candy', x: -200, z: -20, r: 42, label: 'Gummy Forest' },
  frosting_peak:   { island: 'candy', x: -175, z: -62, r: 30, label: 'Frosting Peak' },
  lollipop_meadow: { island: 'candy', x: -110, z: -45, r: 30, label: 'Lollipop Meadow' },
  chocolate_lake:  { island: 'candy', x: -200, z: 48,  r: 17, label: 'Chocolate Lake' },
  giant_cupcake:   { island: 'candy', x: -88,  z: -18, r: 14, label: 'The Great Cupcake' },
  gumdrop_cliffs:  { island: 'candy', x: -222, z: 18,  r: 22, label: 'Gumdrop Cliffs' },
  river_mouth:     { island: 'candy', x: -98,  z: 72,  r: 10, label: 'Syrup Delta' },
  sour_shrine:     { island: 'candy', x: -218, z: -44, r: 8,  label: '???' },
  // ── Cat Island ─────────────────────────────────────────────────────────────
  cat_dock:        { island: 'cat', x: 42,  z: 22,  r: 12, label: 'Arrivals Pier' },
  welcome_plaza:   { island: 'cat', x: 78,  z: 18,  r: 16, label: 'Welcome Plaza' },
  meow_donalds:    { island: 'cat', x: 128, z: -24, r: 16, label: "Meow Donald's" },
  main_street:     { island: 'cat', x: 118, z: 0,   r: 30, label: 'Main Street' },
  town_square:     { island: 'cat', x: 152, z: 6,   r: 22, label: 'Purrliament Square' },
  residential:     { island: 'cat', x: 178, z: 48,  r: 36, label: 'Whisker Heights' },
  cat_park:        { island: 'cat', x: 140, z: -58, r: 30, label: 'Catnip Commons' },
  cat_gym:         { island: 'cat', x: 198, z: -26, r: 18, label: 'Muscle Beach Gym' },
  fish_harbor:     { island: 'cat', x: 100, z: 58,  r: 20, label: 'Fish Harbor' },
  lighthouse:      { island: 'cat', x: 218, z: 30,  r: 10, label: 'The Watchtower' },
  yarn_hill:       { island: 'cat', x: 188, z: -64, r: 18, label: 'Yarn Hill' },
  escape_beach:    { island: 'cat', x: 228, z: -6,  r: 10, label: 'Not-An-Exit Beach' },
  // ── Wave 2: ways back + palace ─────────────────────────────────────────────
  candy_palace:    { island: 'candy', x: -150, z: -36, r: 24, label: 'The Candy Palace' },
  cave_entrance:   { island: 'cat', x: 188, z: -64, r: 6,  label: '???' },          // under the yarn ball, leads under the sea to the palace cellar
  catapult:        { island: 'cat', x: 120, z: 78,  r: 10, label: 'The Big Fling' },
  canoe_cove:      { island: 'cat', x: 236, z: 44,  r: 8,  label: 'Smuggler\'s Cove' },
  flyer_pad:       { island: 'cat', x: 210, z: 12,  r: 8,  label: 'Wing Nut Field' },
  helper_cat:      { island: 'cat', x: 92,  z: 44,  r: 5,  label: 'Under the Quay' },
};

// Walkable paths (polylines). Terrain renders them (licorice on Candyland,
// pawprint cobbles on Cat Island); NPCs walk along them.
export const PATHS = [
  { id: 'candy_main', island: 'candy', width: 3.2, points: [[-42,22],[-70,30],[-100,38],[-140,40],[-170,30],[-200,48]] },
  { id: 'candy_north', island: 'candy', width: 2.6, points: [[-140,40],[-125,0],[-110,-45],[-140,-70],[-175,-62]] },
  { id: 'candy_forest', island: 'candy', width: 2.4, points: [[-170,30],[-185,0],[-200,-20],[-218,-44]] },
  { id: 'candy_cupcake', island: 'candy', width: 2.4, points: [[-70,30],[-85,5],[-88,-18],[-110,-45]] },
  { id: 'candy_delta', island: 'candy', width: 2.2, points: [[-100,38],[-98,55],[-98,72]] },
  { id: 'cat_main', island: 'cat', width: 4.0, points: [[42,22],[60,20],[78,18],[100,6],[118,0],[152,6],[178,48]] },
  { id: 'cat_park', island: 'cat', width: 3.0, points: [[118,0],[128,-24],[140,-58],[188,-64]] },
  { id: 'cat_gym', island: 'cat', width: 3.0, points: [[152,6],[175,-10],[198,-26],[228,-6]] },
  { id: 'cat_harbor', island: 'cat', width: 3.0, points: [[78,18],[90,40],[100,58]] },
  { id: 'cat_lighthouse', island: 'cat', width: 2.4, points: [[178,48],[200,40],[218,30]] },
  { id: 'candy_palace', island: 'candy', width: 3.0, points: [[-110,-45],[-130,-40],[-150,-36]] },
  { id: 'cat_catapult', island: 'cat', width: 2.4, points: [[100,58],[110,70],[120,78]] },
];

// Candy river: from Frosting Peak down to the Syrup Delta.
export const RIVER = { island: 'candy', width: 5.5, points: [[-172,-52],[-158,-34],[-146,-12],[-134,12],[-118,36],[-106,54],[-98,72],[-90,92]] };

// Ferry route between the two piers (the ferry system may add curvature).
export const FERRY_ROUTE = { from: [-30, 22], to: [30, 22] };

export const PLAYER_START = { x: -50, z: 26 };

// ── Height field ─────────────────────────────────────────────────────────────
const shapeNoise = new Simplex2(101);
const hillNoise = new Simplex2(202);
const detailNoise = new Simplex2(303);

function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function gauss(x, z, cx, cz, sigma) { const dx = x - cx, dz = z - cz; return Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma)); }

function distToPolyline(x, z, pts) {
  let best = Infinity, bestT = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const vx = bx - ax, vz = bz - az; const wx = x - ax, wz = z - az;
    const L = vx * vx + vz * vz; let t = L > 0 ? (wx * vx + wz * vz) / L : 0; t = Math.max(0, Math.min(1, t));
    const dx = ax + vx * t - x, dz = az + vz * t - z; const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) { best = d; bestT = (i + t) / (pts.length - 1); }
  }
  return { d: best, t: bestT };
}

// Ellipse radii per island (wider than tall) + small coastline wobble + a
// land lobe under each pier so the docks sit on a real shore.
const DOCK_LOBES = { candy: { x: -56, z: 22, s: 16 }, cat: { x: 56, z: 22, s: 16 } };
export const LAKE = { x: -200, z: 48, r: 15, surface: 2.0, floor: 0.8 };

function rawEdge(x, z, island) {
  const isl = ISLANDS[island];
  const dx = (x - isl.center.x) / 1.08, dz = (z - isl.center.z) / 0.86;
  const d = Math.sqrt(dx * dx + dz * dz);
  const ang = Math.atan2(dz, dx);
  const wobble = 0.9 + 0.13 * shapeNoise.fbm(Math.cos(ang) * 1.9 + isl.seed, Math.sin(ang) * 1.9 + isl.seed * 0.5, 3);
  return 1 - d / (isl.radius * wobble); // >0 inside
}

/** 0..1 land mask for an island (1 = well inland, 0 = sea). */
export function islandMask(x, z, island) {
  let m = smoothstep(-0.05, 0.2, rawEdge(x, z, island));
  const lobe = DOCK_LOBES[island];
  const g = gauss(x, z, lobe.x, lobe.z, lobe.s);
  m = Math.max(m, smoothstep(0.25, 0.75, g));
  return m;
}

/** Which island (if any) a point is on. Returns 'candy' | 'cat' | null. */
export function islandAt(x, z) {
  if (x < 0 && islandMask(x, z, 'candy') > 0.02) return 'candy';
  if (x > 0 && islandMask(x, z, 'cat') > 0.02) return 'cat';
  return null;
}

/** Terrain height in world units at (x, z). Below 0 is under the sea. */
export function height(x, z) {
  const mC = islandMask(x, z, 'candy');
  const mK = islandMask(x, z, 'cat');
  const m = Math.max(mC, mK);
  const near = Math.max(smoothstep(-0.35, -0.02, rawEdge(x, z, 'candy')), smoothstep(-0.35, -0.02, rawEdge(x, z, 'cat')));
  const seabed = -7 + 5.2 * near + 0.8 * hillNoise.fbm(x * 0.02, z * 0.02, 2);
  if (m <= 0) return seabed;
  const rolling = 0.5 + 0.5 * hillNoise.fbm(x * 0.016, z * 0.016, 4);
  let h = 2.4 + 4.2 * rolling * m;
  // Candyland features
  h += 13 * gauss(x, z, -175, -62, 26) * mC;        // Frosting Peak
  h += 4.5 * gauss(x, z, -222, 18, 16) * mC;        // Gumdrop Cliffs
  // Cat Island features
  h += 7 * gauss(x, z, 188, -64, 22) * mK;          // Yarn Hill
  h += 5 * gauss(x, z, 218, 30, 14) * mK;           // Lighthouse bluff
  h += 2 * gauss(x, z, 152, 6, 30) * mK;            // gentle town rise
  h -= 1.2 * gauss(x, z, 100, 58, 12) * mK;         // harbor lowland
  // Chocolate Lake basin: explicit bowl so the water surface (LAKE.surface) sits below the rim.
  if (mC > 0) {
    const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (dl < LAKE.r + 7) { const t = smoothstep(LAKE.r + 7, LAKE.r - 5, dl); h = h + (LAKE.floor - h) * t; }
  }
  // River valley carve (Candyland)
  if (mC > 0) {
    const rv = distToPolyline(x, z, RIVER.points);
    const carve = smoothstep(RIVER.width * 1.5, 0, rv.d);
    h -= carve * (1.7 + 0.9 * rv.t);
  }
  // Flatten landmark cores so buildings sit level.
  if (flatsEnabled) for (const lm of LANDMARK_FLATS) {
    const w = smoothstep(lm.r, lm.r * 0.55, Math.hypot(x - lm.x, z - lm.z));
    if (w > 0) h = h + (lm.h - h) * w * 0.85;
  }
  h += 0.3 * detailNoise.fbm(x * 0.12, z * 0.12, 2) * m;
  // beach roll-off into the sea
  const shore = smoothstep(0, 0.4, m);
  return seabed + (h - seabed) * shore;
}

// Landmark cores that get flattened to a given height (computed lazily so
// that flats agree with the surrounding terrain).
const LANDMARK_FLATS = [];
let flatsEnabled = false;
(function initFlats() {
  const flatIds = ['candy_village', 'giant_cupcake', 'meow_donalds', 'town_square', 'residential', 'cat_gym', 'welcome_plaza', 'fish_harbor', 'sour_shrine', 'candy_dock', 'cat_dock', 'candy_palace', 'catapult', 'flyer_pad'];
  for (const id of flatIds) {
    const lm = LANDMARKS[id];
    LANDMARK_FLATS.push({ x: lm.x, z: lm.z, r: lm.r, h: 0 });
  }
  // Base height = average of a few samples around the core, with flats disabled.
  for (const f of LANDMARK_FLATS) {
    let sum = 0, n = 0;
    for (let a = 0; a < 6; a++) { const ang = a / 6 * Math.PI * 2; sum += height(f.x + Math.cos(ang) * f.r * 0.35, f.z + Math.sin(ang) * f.r * 0.35); n++; }
    sum += height(f.x, f.z); n++;
    f.h = Math.max(1.6, sum / n);
  }
  flatsEnabled = true;
})();

/** Surface normal at (x,z) via finite differences. */
export function normal(x, z, eps = 0.5) {
  const hx = height(x + eps, z) - height(x - eps, z);
  const hz = height(x, z + eps) - height(x, z - eps);
  const nx = -hx / (2 * eps), nz = -hz / (2 * eps);
  const len = Math.hypot(nx, 1, nz);
  return { x: nx / len, y: 1 / len, z: nz / len };
}

/** Slope 0..1 (0 = flat). */
export function slope(x, z) { return 1 - normal(x, z).y; }

/** Distance to nearest path and which path. */
export function nearestPath(x, z, island) {
  let best = { d: Infinity, path: null, t: 0 };
  for (const p of PATHS) {
    if (island && p.island !== island) continue;
    const r = distToPolyline(x, z, p.points);
    if (r.d < best.d) best = { d: r.d, path: p, t: r.t };
  }
  return best;
}
export function onPath(x, z, margin = 0) { const n = nearestPath(x, z); return n.path ? n.d < n.path.width * 0.5 + margin : false; }
export function riverDist(x, z) { return distToPolyline(x, z, RIVER.points).d; }
export function distToLandmark(x, z, id) { const l = LANDMARKS[id]; return Math.hypot(x - l.x, z - l.z); }

/** Is this a reasonable place for a prop? (on land, not in water/river/path/landmark core). */
export function isFreeGround(x, z, opts = {}) {
  const { pathMargin = 1.0, riverMargin = 1.5, avoidLandmarks = true, minHeight = 0.6 } = opts;
  const h = height(x, z);
  if (h < minHeight) return false;
  if (onPath(x, z, pathMargin)) return false;
  if (x < 0 && riverDist(x, z) < RIVER.width * 0.5 + riverMargin) return false;
  if (avoidLandmarks) {
    for (const f of LANDMARK_FLATS) if (Math.hypot(x - f.x, z - f.z) < f.r * 0.7) return false;
  }
  return true;
}

export function pointOnPolyline(pts, t) {
  const n = pts.length - 1; const s = Math.min(n - 1e-6, Math.max(0, t * n));
  const i = Math.floor(s); const f = s - i;
  return { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, z: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f };
}
