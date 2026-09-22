// ─────────────────────────────────────────────────────────────────────────────
// Candyland vegetation — seeded placement.
//
// Everything here is deterministic: same seed → same forest, so renders are
// comparable frame to frame. Two samplers are provided:
//   scatter()        jittered grid + density field  (landscape-wide coverage)
//   clusterScatter() clump seeds + gaussian members (clearings and thickets)
// plus an Occupancy grid so species do not grow inside one another.
// ─────────────────────────────────────────────────────────────────────────────
import { Simplex2 } from '../../../core/noise.js';

export const TAU = Math.PI * 2;
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export function smoothstep(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

/** 1 inside `inner`, fading to 0 at `outer`. */
export function falloff(d, inner, outer) { return 1 - smoothstep(inner, outer, d); }

/** A band: 0 → 1 → 0 across [a,b,c,d]. */
export function band(x, a, b, c, d) { return smoothstep(a, b, x) * (1 - smoothstep(c, d, x)); }

/** Cheap named noise fields (cached so repeated lookups are free). */
const fields = new Map();
export function field(name, seed) {
  if (!fields.has(name)) fields.set(name, new Simplex2(seed));
  return fields.get(name);
}

/** Spatial hash of occupied discs so plants do not intersect. */
export class Occupancy {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); this.maxR = 0; }
  _k(gx, gz) { return gx * 65536 + gz; }
  add(x, z, r) {
    const gx = Math.floor(x / this.cell), gz = Math.floor(z / this.cell);
    const k = this._k(gx, gz);
    let a = this.map.get(k); if (!a) { a = []; this.map.set(k, a); }
    a.push(x, z, r);
    if (r > this.maxR) this.maxR = r;
  }
  /** true when a disc of radius r at (x,z) touches nothing already placed. */
  free(x, z, r) {
    const reach = r + this.maxR;
    const g0x = Math.floor((x - reach) / this.cell), g1x = Math.floor((x + reach) / this.cell);
    const g0z = Math.floor((z - reach) / this.cell), g1z = Math.floor((z + reach) / this.cell);
    for (let gx = g0x; gx <= g1x; gx++) for (let gz = g0z; gz <= g1z; gz++) {
      const a = this.map.get(this._k(gx, gz)); if (!a) continue;
      for (let i = 0; i < a.length; i += 3) {
        const dx = a[i] - x, dz = a[i + 1] - z, rr = a[i + 2] + r;
        if (dx * dx + dz * dz < rr * rr) return false;
      }
    }
    return true;
  }
}

/**
 * Jittered-grid Poisson-ish sampler over a box, gated by a density field.
 * @param {object} o
 *   bounds  {x0,x1,z0,z1}
 *   cell    grid pitch (≈ minimum spacing)
 *   jitter  0..1 of a cell
 *   rand    seeded rng
 *   density (x,z) => 0..1 probability of keeping the sample
 *   accept  (x,z) => bool | null   hard filter (free ground etc.)
 *   cap     stop after this many
 */
export function scatter({ bounds, cell, jitter = 0.85, rand, density, accept, cap = 1e9 }) {
  const out = [];
  const { x0, x1, z0, z1 } = bounds;
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (out.length >= cap) return out;
      const x = x0 + (i + 0.5 + (rand() - 0.5) * jitter) * cell;
      const z = z0 + (j + 0.5 + (rand() - 0.5) * jitter) * cell;
      const d = density(x, z);
      if (d <= 0 || rand() > d) continue;
      if (accept && !accept(x, z)) continue;
      out.push(x, z);
    }
  }
  return out;
}

/**
 * Clump sampler: pick cluster seeds by density, then scatter members around
 * each one. Produces thickets with real clearings between them.
 */
export function clusterScatter({ bounds, seedCell, rand, density, accept, members = [4, 11], spread = 3.4, cap = 1e9 }) {
  const seeds = scatter({ bounds, cell: seedCell, jitter: 1.0, rand, density, accept: null });
  const out = [];
  for (let s = 0; s < seeds.length; s += 2) {
    const cx = seeds[s], cz = seeds[s + 1];
    const n = Math.floor(members[0] + rand() * (members[1] - members[0]));
    for (let m = 0; m < n; m++) {
      if (out.length >= cap * 2) return out;
      // gaussian-ish radius so clumps are dense in the middle
      const r = spread * (rand() + rand() + rand()) / 1.6;
      const a = rand() * TAU;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (accept && !accept(x, z)) continue;
      out.push(x, z);
    }
  }
  return out;
}

/** Points in two rows flanking a polyline, skipping the carriageway itself. */
export function alongPath(points, { step = 3.0, offset = 2.6, wobble = 0.9, rand, accept, skip = 0 }) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const dx = bx - ax, dz = bz - az; const L = Math.hypot(dx, dz);
    const ux = dx / L, uz = dz / L; const px = -uz, pz = ux;   // perpendicular
    for (let t = skip; t < L; t += step) {
      for (const side of [-1, 1]) {
        if (rand() < 0.22) continue;                            // gaps, not a fence
        const o = offset + (rand() - 0.5) * wobble;
        const j = (rand() - 0.5) * step * 0.7;
        const x = ax + ux * (t + j) + px * side * o;
        const z = az + uz * (t + j) + pz * side * o;
        if (accept && !accept(x, z)) continue;
        out.push(x, z);
      }
    }
  }
  return out;
}

/** Deterministic shuffle-and-truncate so a species hits its instance budget. */
export function trim(pairs, cap, rand) {
  const n = pairs.length / 2;
  if (n <= cap) return pairs;
  const keys = new Float64Array(n);
  for (let i = 0; i < n; i++) keys[i] = rand();
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => keys[a] - keys[b]).slice(0, cap);
  order.sort((a, b) => a - b);
  const out = new Array(cap * 2);
  for (let i = 0; i < cap; i++) { out[i * 2] = pairs[order[i] * 2]; out[i * 2 + 1] = pairs[order[i] * 2 + 1]; }
  return out;
}
