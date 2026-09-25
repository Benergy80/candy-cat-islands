// ─────────────────────────────────────────────────────────────────────────────
// NAV — where a tiger can actually go.
//
// A walkability grid over Cat Island (0.75-u cells) plus breadth-first
// flow fields, so a tiger whose pack is prowling the far side of town walks
// ROUND the buildings to get there instead of pressing its face into the
// nearest shopfront for a minute. (Straight-line steering toward a pack slot
// 100 u away was how two dozen tigers spent the night walking in place.)
//
//   blocked[i]  1 = no tiger torso fits at the cell centre: water, or inside
//               (or within NAV_R of) a solid collider, or a LOW prop taller
//               than a tiger's stride (benches, planters — walked round).
//   field k     BFS distance (in cells, 8-connected, no corner cutting) from
//               a source point: one per pack, one for the visitor, one for
//               the guest bed. Recomputed when its source drifts, at most one
//               BFS every other frame (~1 ms on 34k open cells), so a stale
//               field is at worst a few metres out — the chain below only uses
//               it for direction; the last stretch is always line-of-sight.
//
// All advisory: the hard constraint is still the ground core's pushOut in
// citizens.js settle(). This only picks WHERE to walk.
//
// Opt-in extras (the raid on Candyland, o.keepBlockers): the blockers are also
// kept in 4-u buckets, so clearRun() can ask whether a body of radius r fits
// down a straight line between them, un-inflated (the grid's NAV_R closes the
// 1.2-u gap between a fence's end and a post that a tiger's head fits through),
// and add() stamps colliders appended after the build without rebuilding.
// ─────────────────────────────────────────────────────────────────────────────

const UNREACHED = 0xffff;
// neighbour offsets (dx, dz); the diagonals are only taken when both
// orthogonal cells beside them are open (no cutting a building's corner)
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * @param world  core/world.js
 * @param o      { x0, z0, x1, z1, cell, navR, landCell, cx, cz, radius }
 *               (the waterline is sampled on a coarser `landCell` grid, and
 *               only inside the island's circle cx,cz,radius)
 */
export function createNav(world, o) {
  const C = o.cell, X0 = o.x0, Z0 = o.z0;
  const NX = Math.ceil((o.x1 - o.x0) / C), NZ = Math.ceil((o.z1 - o.z0) / C), N = NX * NZ;
  const NAV_R = o.navR;
  const LC = o.landCell || C, LNX = Math.ceil((o.x1 - o.x0) / LC), LNZ = Math.ceil((o.z1 - o.z0) / LC);
  const land = new Uint8Array(N);          // terrain above the waterline (computed once)
  const blocked = new Uint8Array(N);
  const queue = new Int32Array(N);
  // connected pieces of open ground: comp[i] = piece id (0 = shut), compSize[id] = cells.
  // The main street network is one huge piece; the pockets between a fountain and
  // its planter ring are tiny ones a pack must never be parked in.
  const comp = new Int32Array(N);
  let compSize = new Int32Array(1);
  let mainComp = 0;
  const fields = new Map();                // key → { d: Uint16Array, sx, sz, cell, at }
  let landDone = false, built = false, bfsFrame = -1;
  const stats = { builds: 0, buildMs: 0, landMs: 0, bfs: 0, bfsMs: 0, free: 0, adds: 0, addMs: 0, ver: 0 };
  // (o.keepBlockers) the blockers in 4-u buckets, each reaching BK_PAD past its
  // footprint, so a clearRun of radius ≤ BK_PAD finds everything near a sample
  const KEEP = !!o.keepBlockers, BK = 4, BK_PAD = 1.2;
  const bkMap = KEEP ? new Map() : null;
  const bkKey = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);

  const cx = (i) => X0 + ((i % NX) + 0.5) * C;
  const cz = (i) => Z0 + (((i / NX) | 0) + 0.5) * C;
  function cellOf(x, z) {
    const gx = Math.floor((x - X0) / C), gz = Math.floor((z - Z0) / C);
    return gx < 0 || gz < 0 || gx >= NX || gz >= NZ ? -1 : gz * NX + gx;
  }
  const open = (i) => i >= 0 && !blocked[i];

  function buildLand() {
    const t0 = performance.now();
    const coarse = new Uint8Array(LNX * LNZ), R2 = o.radius ? (o.radius + 6) ** 2 : Infinity;
    for (let gz = 0; gz < LNZ; gz++) for (let gx = 0; gx < LNX; gx++) {
      const x = X0 + (gx + 0.5) * LC, z = Z0 + (gz + 0.5) * LC;
      if ((x - (o.cx || 0)) ** 2 + (z - (o.cz || 0)) ** 2 > R2) continue;
      coarse[gz * LNX + gx] = world.height(x, z) > 0.55 ? 1 : 0;
    }
    for (let i = 0; i < N; i++) {
      const gx = Math.min(LNX - 1, Math.floor((cx(i) - X0) / LC)), gz = Math.min(LNZ - 1, Math.floor((cz(i) - Z0) / LC));
      land[i] = coarse[gz * LNX + gx];
    }
    landDone = true; stats.landMs = performance.now() - t0;
  }

  /** Signed distance from (x,z) to a collider's footprint (negative inside). */
  function sd(c, x, z) {
    const dx = x - c.x, dz = z - c.z;
    if (c.box) {
      const r = c.rot || 0, cs = Math.cos(r), sn = Math.sin(r);
      const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
      const qx = Math.abs(lx) - (c.w || 0) * 0.5, qz = Math.abs(lz) - (c.d || 0) * 0.5;
      const ox = qx > 0 ? qx : 0, oz = qz > 0 ? qz : 0;
      return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0);
    }
    return Math.hypot(dx, dz) - (c.r || 0);
  }
  function keep(c) {
    const br = (c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0)) + BK_PAD;
    if (!(br > BK_PAD) || br > 120) return;
    for (let ix = Math.floor((c.x - br) / BK); ix <= Math.floor((c.x + br) / BK); ix++)
      for (let iz = Math.floor((c.z - br) / BK); iz <= Math.floor((c.z + br) / BK); iz++) {
        const k = bkKey(ix, iz);
        let a = bkMap.get(k); if (!a) { a = []; bkMap.set(k, a); }
        a.push(c);
      }
  }
  /** Mark every cell whose centre is within NAV_R of collider c. */
  function stamp(c) {
    const br = (c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0)) + NAV_R;
    if (!(br > NAV_R) || br > 120) return;
    const gx0 = Math.max(0, Math.floor((c.x - br - X0) / C)), gx1 = Math.min(NX - 1, Math.floor((c.x + br - X0) / C));
    const gz0 = Math.max(0, Math.floor((c.z - br - Z0) / C)), gz1 = Math.min(NZ - 1, Math.floor((c.z + br - Z0) / C));
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const i = gz * NX + gx;
      if (blocked[i]) continue;
      if (sd(c, X0 + (gx + 0.5) * C, Z0 + (gz + 0.5) * C) < NAV_R) blocked[i] = 1;
    }
  }

  /**
   * (Re)build the grid. `isBlocker(c)` says whether collider c stops a tiger
   * (citizens.js decides: SOLID / TALL, and LOW props taller than a stride).
   */
  function build(colliders, isBlocker) {
    const t0 = performance.now();
    if (!landDone) buildLand();
    for (let i = 0; i < N; i++) blocked[i] = land[i] ? 0 : 1;
    if (KEEP) bkMap.clear();
    const xa = X0 - 20, xb = X0 + NX * C + 20, za = Z0 - 20, zb = Z0 + NZ * C + 20;
    for (let k = 0; k < colliders.length; k++) {
      const c = colliders[k];
      if (!c || typeof c.x !== 'number' || typeof c.z !== 'number') continue;
      if (c.x < xa || c.x > xb || c.z < za || c.z > zb) continue;
      if (!isBlocker(c)) continue;
      stamp(c);
      if (KEEP) keep(c);
    }
    let free = 0; for (let i = 0; i < N; i++) if (!blocked[i]) free++;
    stats.free = free;
    label();
    fields.clear();                          // every field is stale now
    built = true; stats.builds++; stats.ver++; stats.buildMs = performance.now() - t0;
  }
  /**
   * Colliders appended to the list since the build (indices from..to−1): stamp
   * the ones inside the grid that stop a tiger, without clearing anything.
   * Returns how many were stamped (0: nothing changed — no relabel, fields kept).
   */
  function add(colliders, from, to, isBlocker) {
    if (!built) return 0;
    const t0 = performance.now();
    const xa = X0 - 2, xb = X0 + NX * C + 2, za = Z0 - 2, zb = Z0 + NZ * C + 2;
    let n = 0;
    for (let k = from; k < to; k++) {
      const c = colliders[k];
      if (!c || typeof c.x !== 'number' || typeof c.z !== 'number') continue;
      const br = (c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0)) + NAV_R;
      if (c.x + br < xa || c.x - br > xb || c.z + br < za || c.z - br > zb) continue;
      if (!isBlocker(c)) continue;
      stamp(c); if (KEEP) keep(c); n++;
    }
    if (n) { label(); fields.clear(); stats.ver++; }
    stats.adds++; stats.addMs = +(performance.now() - t0).toFixed(2);
    return n;
  }

  /** Label the connected pieces of open ground (8-connected, no corner cutting, as the BFS walks). */
  function label() {
    const t0 = performance.now();
    comp.fill(0);
    const sizes = [0];
    for (let s0 = 0; s0 < N; s0++) {
      if (blocked[s0] || comp[s0]) continue;
      const id = sizes.length;
      let head = 0, tail = 0, n = 0;
      comp[s0] = id; queue[tail++] = s0;
      while (head < tail) {
        const i = queue[head++], gx = i % NX, gz = (i / NX) | 0; n++;
        for (let k = 0; k < 8; k++) {
          const qx = gx + NB[k][0], qz = gz + NB[k][1];
          if (qx < 0 || qz < 0 || qx >= NX || qz >= NZ) continue;
          const j = qz * NX + qx;
          if (blocked[j] || comp[j]) continue;
          if (k >= 4 && (blocked[gz * NX + qx] || blocked[qz * NX + gx])) continue;
          comp[j] = id; queue[tail++] = j;
        }
      }
      sizes.push(n);
    }
    compSize = Int32Array.from(sizes);
    mainComp = 0; for (let id = 1; id < compSize.length; id++) if (!mainComp || compSize[id] > compSize[mainComp]) mainComp = id;
    stats.pieces = compSize.length - 1; stats.mainCells = mainComp ? compSize[mainComp] : 0; stats.labelMs = +(performance.now() - t0).toFixed(1);
  }
  /** Is cell i open AND on a real piece of street (≥ BIG cells), not a pocket? */
  const BIG = 300;
  function onMain(i) {
    return i >= 0 && !blocked[i] && (comp[i] === mainComp || compSize[comp[i]] >= BIG);
  }

  /** Nearest open cell to (x,z) within `maxR` cells (−1 if none). Optionally
   *  one a field `d` has reached, or (main) one on a real piece of street. */
  function nearestOpen(x, z, maxR = 4, d = null, main = false) {
    const i0 = cellOf(x, z);
    if (i0 >= 0 && !blocked[i0] && (!d || d[i0] !== UNREACHED) && (!main || onMain(i0))) return i0;
    const gx = Math.floor((x - X0) / C), gz = Math.floor((z - Z0) / C);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const qx = gx + dx, qz = gz + dz;
        if (qx < 0 || qz < 0 || qx >= NX || qz >= NZ) continue;
        const i = qz * NX + qx;
        if (blocked[i] || (d && d[i] === UNREACHED) || (main && !onMain(i))) continue;
        const e = (cx(i) - x) ** 2 + (cz(i) - z) ** 2;
        if (e < bd) { bd = e; best = i; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  function bfs(f, src) {
    const t0 = performance.now();
    const d = f.d; d.fill(UNREACHED);
    let head = 0, tail = 0;
    d[src] = 0; queue[tail++] = src;
    while (head < tail) {
      const i = queue[head++], gx = i % NX, gz = (i / NX) | 0, nd = d[i] + 1;
      for (let k = 0; k < 8; k++) {
        const qx = gx + NB[k][0], qz = gz + NB[k][1];
        if (qx < 0 || qz < 0 || qx >= NX || qz >= NZ) continue;
        const j = qz * NX + qx;
        if (blocked[j] || d[j] <= nd) continue;
        if (k >= 4 && (blocked[gz * NX + qx] || blocked[qz * NX + gx])) continue;
        d[j] = nd; queue[tail++] = j;
      }
    }
    f.cell = src; stats.bfs++; stats.bfsMs = performance.now() - t0;
  }

  /**
   * The field for `key` sourced at (sx,sz): recomputed if the source drifted
   * more than `tol` u — but at most one BFS every other frame (`frame` = a
   * frame id); otherwise the stale one is returned. The source is the nearest
   * open cell within 12 u (a pack's route runs straight through the fountain
   * in the middle of Welcome Plaza). Null if there is none.
   */
  function field(key, sx, sz, tol, frame) {
    if (!built) return null;
    let f = fields.get(key);
    const fresh = f && f.cell >= 0 && (f.sx - sx) ** 2 + (f.sz - sz) ** 2 <= tol * tol;
    if (fresh) return f;
    if (frame - bfsFrame < 2 && frame >= bfsFrame) return f && f.cell >= 0 ? f : null;   // budget spent: stale is fine
    const src = nearestOpen(sx, sz, 16, null, true);
    if (!f) { f = { d: new Uint16Array(N), sx, sz, cell: -1 }; fields.set(key, f); }
    f.sx = sx; f.sz = sz;
    if (src < 0) { f.cell = -1; return null; }
    bfsFrame = frame;
    bfs(f, src);
    return f;
  }

  /** Is the straight line (x0,z0)→(x1,z1) over open cells only? */
  function los(x0, z0, x1, z1) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(L / (C * 0.45)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const i = cellOf(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (i < 0 || blocked[i]) return false;
    }
    return true;
  }

  /**
   * Walk the ray (x0,z0)→(x1,z1) and stop `back` u short of the first
   * blocked cell. out = the point. Returns false if (x0,z0) itself is shut.
   */
  function clip(x0, z0, x1, z1, back, out) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    out.x = x0; out.z = z0;
    const i0 = cellOf(x0, z0);
    if (i0 < 0 || blocked[i0]) return false;
    if (L < 1e-6) return true;
    const step = C * 0.45, n = Math.ceil(L / step);
    let lastT = 0;
    for (let k = 1; k <= n; k++) {
      const t = Math.min(1, (k * step) / L);
      const i = cellOf(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (i < 0 || blocked[i]) {
        const tb = Math.max(0, lastT - back / L);
        out.x = x0 + (x1 - x0) * tb; out.z = z0 + (z1 - z0) * tb;
        return true;
      }
      lastT = t;
    }
    out.x = x1; out.z = z1;
    return true;
  }

  /**
   * The next place to walk to from (x,z) along field f: follow the field
   * downhill up to `maxSteps` cells and take the farthest cell still in plain
   * sight. out = { x, z, d } (d = the cell's field distance). False if (x,z)
   * is not connected to the field's source.
   */
  function next(f, x, z, maxSteps, out) {
    const d = f.d;
    let i = cellOf(x, z);
    if (i < 0 || blocked[i] || d[i] === UNREACHED) i = nearestOpen(x, z, 5, d);
    if (i < 0) return false;
    let cur = i, best = -1;
    for (let s = 0; s < maxSteps; s++) {
      const gx = cur % NX, gz = (cur / NX) | 0;
      let nb = -1, nd = d[cur];
      for (let k = 0; k < 8; k++) {
        const qx = gx + NB[k][0], qz = gz + NB[k][1];
        if (qx < 0 || qz < 0 || qx >= NX || qz >= NZ) continue;
        const j = qz * NX + qx;
        if (blocked[j] || d[j] >= nd) continue;
        if (k >= 4 && (blocked[gz * NX + qx] || blocked[qz * NX + gx])) continue;
        nb = j; nd = d[j];
      }
      if (nb < 0) break;                                // at the source
      cur = nb;
      if (los(x, z, cx(cur), cz(cur))) best = cur;
      else if (best >= 0) break;
      else { best = cur; break; }                       // not even the first step in view: take it
    }
    if (best < 0) best = cur;
    out.x = cx(best); out.z = cz(best); out.d = d[best];
    return true;
  }

  /**
   * (o.keepBlockers) Does a body of radius r (≤ BK_PAD) fit all the way down
   * the straight line (x0,z0)→(x1,z1), measured against the blockers
   * themselves rather than the inflated grid? Sampled every 0.25 u.
   */
  function clearRun(x0, z0, x1, z1, r) {
    if (!KEEP) return los(x0, z0, x1, z1);
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 0.25));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const i = cellOf(x, z);
      if (i < 0 || !land[i]) return false;
      const a = bkMap.get(bkKey(Math.floor(x / BK), Math.floor(z / BK)));
      if (!a) continue;
      for (let j = 0; j < a.length; j++) if (sd(a[j], x, z) < r) return false;
    }
    return true;
  }

  /** How far (≤ maxL) the ray from (x,z) along (ux,uz) runs over open cells. */
  function ray(x, z, ux, uz, maxL) {
    const step = C * 0.45;
    for (let s = step; s <= maxL; s += step) {
      const i = cellOf(x + ux * s, z + uz * s);
      if (i < 0 || blocked[i]) return s - step;
    }
    return maxL;
  }

  /** fn(x, z) for every open cell centre on the square ring `r` cells out
   *  from (x,z)'s cell; stops (and returns true) as soon as fn returns true. */
  function forRing(x, z, r, fn) {
    const gx = Math.floor((x - X0) / C), gz = Math.floor((z - Z0) / C);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const qx = gx + dx, qz = gz + dz;
      if (qx < 0 || qz < 0 || qx >= NX || qz >= NZ) continue;
      const i = qz * NX + qx;
      if (blocked[i]) continue;
      if (fn(cx(i), cz(i))) return true;
    }
    return false;
  }

  return {
    build, add, field, los, clip, next, ray, cellOf, nearestOpen, forRing, clearRun, stats,
    /** Signed distance from (x,z) to collider c's footprint (negative inside). */
    sdist: sd,
    /** The connected piece of open ground cell i belongs to (0 = shut). */
    compOf: (i) => (i >= 0 && !blocked[i] ? comp[i] : 0),
    isOpen: (x, z) => open(cellOf(x, z)),
    /** Open AND on a real piece of street (not a pocket inside a planter ring)? */
    isMain: (x, z) => onMain(cellOf(x, z)),
    onMain,
    cellCentre(i, out) { out.x = cx(i); out.z = cz(i); return out; },
    reached: (f, x, z) => { const i = cellOf(x, z); return i >= 0 && f.d[i] !== UNREACHED; },
    /** The walk from (x,z) to field f's source, in u (8-connected steps: a
     *  slight under-estimate on the diagonals). Infinity if not connected. */
    distAt(f, x, z) {
      let i = cellOf(x, z);
      if (i < 0 || blocked[i] || f.d[i] === UNREACHED) i = nearestOpen(x, z, 2, f.d);
      return i < 0 ? Infinity : f.d[i] * C;
    },
    get built() { return built; },
    /** Debug: the blocked mask (1 = shut), row-major NX × NZ. */
    mask: () => blocked,
    dims: { NX, NZ, C, X0, Z0 },
  };
}
