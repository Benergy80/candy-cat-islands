// ─────────────────────────────────────────────────────────────────────────────
// CAT ISLAND NATURE — placement engine.
// Pure maths, no THREE: importable from node for map checks
// (`node src/systems/cat/nature/place.js` prints a coverage report).
// Everything is seeded, so renders are deterministic.
// ─────────────────────────────────────────────────────────────────────────────
import * as W from '../../../core/world.js';
import { rng, hash } from '../../../core/util.js';

export const TAU = Math.PI * 2;
export const ISLE = { x: 150, z: 0, zs: 0.82 };

// Landmark cores the architecture agent owns: keep the inner fraction clear.
export const CORES = {
  town_square: 0.55, main_street: 0.55, meow_donalds: 0.58, residential: 0.55,
  cat_gym: 0.58, welcome_plaza: 0.6, fish_harbor: 0.6, cat_dock: 0.8, lighthouse: 0.62,
};
export function inCore(x, z) {
  for (const id in CORES) {
    const l = W.LANDMARKS[id];
    if (Math.hypot(x - l.x, z - l.z) < l.r * CORES[id]) return true;
  }
  return false;
}

// ── shoreline ────────────────────────────────────────────────────────────────
const SHORE_N = 256, SHORE = new Float32Array(SHORE_N);
(function initShore() {
  for (let i = 0; i < SHORE_N; i++) {
    const a = (i / SHORE_N) * TAU, ca = Math.cos(a), sa = Math.sin(a) * ISLE.zs;
    let lo = 40, hi = 150;
    for (let k = 0; k < 22; k++) {
      const r = (lo + hi) / 2;
      if (W.height(ISLE.x + ca * r, ISLE.z + sa * r) > 0.9) lo = r; else hi = r;
    }
    SHORE[i] = lo;
  }
})();
/** Distance from island centre to the waterline at angle a. */
export function shoreRadius(a) {
  const f = ((a / TAU) % 1 + 1) % 1 * SHORE_N, i = Math.floor(f), t = f - i;
  return SHORE[i] * (1 - t) + SHORE[(i + 1) % SHORE_N] * t;
}
/** Point `inset` units inland (negative = out to sea) from the waterline. */
export function shorePoint(a, inset = 0) {
  const r = shoreRadius(a) - inset;
  return { x: ISLE.x + Math.cos(a) * r, z: ISLE.z + Math.sin(a) * r * ISLE.zs };
}

// ── occupancy grid so nothing grows through anything else ────────────────────
export class Grid {
  constructor(cell = 2.5) { this.cell = cell; this.map = new Map(); this.maxR = 0.1; }
  key(cx, cz) { return cx * 4096 + cz; }
  free(x, z, r) {
    const c = this.cell, reach = Math.ceil((r + this.maxR) / c);
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
      const a = this.map.get(this.key(cx + i, cz + j)); if (!a) continue;
      for (const p of a) { const d = r + p.r; if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d) return false; }
    }
    return true;
  }
  add(x, z, r) {
    const c = this.cell, k = this.key(Math.floor(x / c), Math.floor(z / c));
    let a = this.map.get(k); if (!a) this.map.set(k, a = []);
    a.push({ x, z, r }); this.maxR = Math.max(this.maxR, r);
  }
}

// ── architecture obstacles ───────────────────────────────────────────────────
// Buildings register ctx.colliders BEFORE nature builds (main.js order), so we
// can refuse to plant inside a stucco wall, a window sill or a plaza kerb.
let OBS = null;
export function setObstacles(list) {
  OBS = new Grid(4);
  for (const c of list || []) if (c && c.r > 0) OBS.add(c.x, c.z, c.r);
}
/** Is a disc of radius r clear of every registered building collider? */
export function obstacleClear(x, z, r = 0.6) { return OBS ? OBS.free(x, z, r) : true; }

// ── building footprints (interiors + oriented wall boxes) ────────────────────
// Circle colliders alone never described a SHOP: the walls are oriented boxes
// and the room itself is a rect, so a 4-unit sunflower stem could stand in the
// middle of the Purrbucks counter and pass clean through the ceiling. Nothing
// is planted inside one of these rects, or within BUILD_PAD of it.
//
// Local space matches every other consumer of a box collider (player.js):
//   lx = dx·cos(rot) + dz·sin(rot)      lz = -dx·sin(rot) + dz·cos(rot)
// An architecture ROOM ({x,z,w,d,rot}) uses the opposite handedness, so pass
// its rot negated (see rectOf below / cat/nature.js).
let RECTS = [];
export const BUILD_PAD = 1.5;
/** Normalise a room or box collider into the rect form used below. */
export function rectOf(b, flipRot = false) {
  if (!b) return null;
  const w = b.w ?? (b.radius ? b.radius * 2 : 0);
  const d = b.d ?? (b.radius ? b.radius * 2 : 0);
  if (!(w > 0) || !(d > 0)) return null;
  const rot = (flipRot ? -1 : 1) * (b.rot || 0);
  return {
    x: b.x, z: b.z, hw: w / 2, hd: d / 2,
    c: Math.cos(rot), s: Math.sin(rot), out: Math.hypot(w, d) / 2,
  };
}
export function setBuildings(list) {
  RECTS = [];
  for (const b of list || []) { const r = rectOf(b); if (r) RECTS.push(r); }
  return RECTS.length;
}
/** Same, for rects already normalised by rectOf(). */
export function setBuildingRects(rects) { RECTS = rects || []; return RECTS.length; }
/** Is a disc of radius r clear of every building rect, with `pad` to spare? */
export function buildingClear(x, z, r = 0.6, pad = BUILD_PAD, rects = RECTS) {
  for (let i = 0; i < rects.length; i++) {
    const b = rects[i];
    const dx = x - b.x, dz = z - b.z, reach = b.out + r + pad;
    if (dx * dx + dz * dz > reach * reach) continue;
    const lx = Math.abs(dx * b.c + dz * b.s), lz = Math.abs(-dx * b.s + dz * b.c);
    if (lx < b.hw + r + pad && lz < b.hd + r + pad) return false;
  }
  return true;
}

// ── ground test ──────────────────────────────────────────────────────────────
// Cheap tests first: height()/slope() are the expensive calls.
const DEF = { minH: 1.1, maxH: 40, maxSlope: 0.85, pathMargin: 1.5, cores: true, obsPad: 0.55, buildPad: BUILD_PAD };
export function groundOk(x, z, o = {}) {
  const s = { ...DEF, ...o };
  if (x < 12 || x > 290 || z < -120 || z > 120) return false;
  if (s.cores && inCore(x, z)) return false;
  if (s.pathMargin >= 0 && W.onPath(x, z, s.pathMargin)) return false;
  if (W.islandMask(x, z, 'cat') < 0.05) return false;
  const h = W.height(x, z);
  if (h < s.minH || h > s.maxH) return false;
  if (s.maxSlope < 0.8 && W.slope(x, z) > s.maxSlope) return false;
  if (s.obsPad >= 0 && !obstacleClear(x, z, (s.radius ?? 0.6) + s.obsPad)) return false;
  if (s.buildPad >= 0 && !buildingClear(x, z, s.radius ?? 0.6, s.buildPad)) return false;
  return true;
}

// ── candidate generators ─────────────────────────────────────────────────────
/** Clumped blob: picks `clumps` seeds in an annulus, sprays around them. */
export function genBlob(rand, o) {
  const { x, z, r0 = 0, r1 = 20, clumps = 5, spread = 5 } = o;
  const seeds = [];
  for (let i = 0; i < clumps; i++) {
    const a = rand() * TAU, r = r0 + Math.sqrt(rand()) * (r1 - r0);
    seeds.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  return () => {
    const s = seeds[(rand() * seeds.length) | 0];
    const a = rand() * TAU, r = Math.abs(rand() + rand() - 1) * spread;
    return { x: s[0] + Math.cos(a) * r, z: s[1] + Math.sin(a) * r };
  };
}
/** Even ring / annulus fill. */
export function genRing(rand, o) {
  const { x, z, r0 = 0, r1 = 20, arc = [0, TAU] } = o;
  return () => {
    const a = arc[0] + rand() * (arc[1] - arc[0]);
    const r = Math.sqrt(r0 * r0 + rand() * (r1 * r1 - r0 * r0));
    return { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r };
  };
}
/** Along a named path, offset sideways. Deterministic marching + jitter. */
export function genPath(rand, o) {
  const { id, t0 = 0, t1 = 1, off = [3.5, 7], side = 0, jit = 1.2 } = o;
  const path = W.PATHS.find((p) => p.id === id);
  return () => {
    const t = t0 + rand() * (t1 - t0);
    const p = W.pointOnPolyline(path.points, t);
    const e = 0.004;
    const q = W.pointOnPolyline(path.points, Math.min(1, t + e));
    let dx = q.x - p.x, dz = q.z - p.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const s = side === 0 ? (rand() < 0.5 ? -1 : 1) : side;
    const d = off[0] + rand() * (off[1] - off[0]);
    return { x: p.x - dz * d * s + (rand() - 0.5) * jit, z: p.z + dx * d * s + (rand() - 0.5) * jit, along: Math.atan2(dx, dz) };
  };
}
/** Beach band hugging the waterline between two angles. */
export function genShore(rand, o) {
  const { a0 = 0, a1 = TAU, inset = [0.5, 5] } = o;
  return () => {
    const a = a0 + rand() * (a1 - a0);
    return { ...shorePoint(a, inset[0] + rand() * (inset[1] - inset[0])), angle: a };
  };
}
/** Planted rows (olive groves, lavender, vineyards of catnip). */
export function genRows(rand, o) {
  const { x, z, rot = 0, cols = 6, rows = 4, gapX = 4, gapZ = 3, jit = 0.5 } = o;
  const ca = Math.cos(rot), sa = Math.sin(rot);
  let i = 0;
  return () => {
    const c = i % cols, r = ((i / cols) | 0) % rows; i++;
    const lx = (c - (cols - 1) / 2) * gapX + (rand() - 0.5) * jit;
    const lz = (r - (rows - 1) / 2) * gapZ + (rand() - 0.5) * jit;
    return { x: x + lx * ca - lz * sa, z: z + lx * sa + lz * ca };
  };
}

// ── the planner ──────────────────────────────────────────────────────────────
export function createPlanner(seedName = 'cat-nature') {
  const grid = new Grid(2.5);
  const planner = {
    grid,
    rand: rng(hash(seedName)),
    /**
     * scatter({ seed, zones:[{gen, count, ...groundOpts}], radius, ...groundOpts })
     * → array of { x, y, z, angle?, along? }
     */
    scatter(spec) {
      const out = [];
      // per-zone yield, so an authored cluster that quietly placed 1 of 44 shows
      // up in the build log instead of in a critique
      spec.zoneYield = [];
      const rand = rng(hash(seedName + ':' + spec.seed));
      for (const zone of spec.zones) {
        const o = { ...spec, ...zone };
        const gen = zone.gen(rand, zone);
        const radius = o.radius ?? 0.6;
        let placed = 0, tries = 0, maxTries = (o.count || 10) * (o.tries ?? 24);
        let fGround = 0, fTest = 0, fGrid = 0;
        while (placed < o.count && tries++ < maxTries) {
          const c = gen();
          if (!groundOk(c.x, c.z, o)) { fGround++; continue; }
          if (o.test && !o.test(c.x, c.z)) { fTest++; continue; }
          if (!grid.free(c.x, c.z, radius)) { fGrid++; continue; }
          grid.add(c.x, c.z, radius * (o.pack ?? 1));
          out.push({ ...c, y: W.height(c.x, c.z) - (o.sink ?? 0.08), r: rand() });
          placed++;
        }
        spec.zoneYield.push({ want: o.count, got: placed, ground: fGround, test: fTest, grid: fGrid });
      }
      return out;
    },
    reserve(x, z, r) { grid.add(x, z, r); },
  };
  return planner;
}

// ── node self-test ───────────────────────────────────────────────────────────
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('place.js')) {
  const p = createPlanner('probe');
  const pts = p.scatter({ seed: 'g', radius: 0.7, zones: [{ gen: genRing, x: 150, z: 0, r0: 0, r1: 118, count: 4000 }] });
  console.log('free-ground sample points placed:', pts.length);
  let s = '';
  for (let i = 0; i < 16; i++) s += `${(i / 16 * 360) | 0}°:${shoreRadius(i / 16 * TAU).toFixed(0)}  `;
  console.log('shore radii', s);
}
