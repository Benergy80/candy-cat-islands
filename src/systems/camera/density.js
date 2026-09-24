// camera/density.js — the camera's reading of the COLLIDERS (CAMERA_SPEC §4.4-4.6).
//
// ctx.colliders are plain records {x, z, r | box w d rot, h?} with no mesh behind them. Three camera
// passes read them, and all three read a collider's height through ONE rule, top(c):
//
//   top(c)   world-y top of a collider (§4.5). `h` carries two conventions (player/ground.js classify(),
//            flyer.js colTop()): h ≤ 1.6 is Contract-A ground-relative (a standable low prop), 1.6 < h < 1e4
//            a legacy absolute world-y top, h ≥ 1e4 / absent = unknown. So
//              top = h ≤ 1.6 ? g + h : (h < 1e4 ? max(h, g + h) : g + guess),  g = world.height(c.x, c.z),
//            guess 6 (circle) / 8 (box). max(h, g + h) is conservative on purpose for the ambiguous band:
//            over-estimating a top costs a lift, under-estimating one loses him. Cached per collider
//            (world.height is a few fbm calls), re-read when the collider's h / x / z change.
//
//   LOCAL LIST (§4.6) every 0.5 s (and in snap()): a plain linear scan of ctx.colliders for everything —
//            circles of any radius and the oriented wall boxes — within LOCAL_R (40 u) of the visitor
//            (≈300 of ~3,800). occlude() and the whiskers iterate this list instead of every collider.
//            The radius grows past 40 u only as far as the lens itself reaches (a wheel / a view at
//            dist 58-86 puts the lens 45-67 u out), so a far lens never loses a collider it could see.
//
//   DENSITY (§4.5) — a spatial hash of the CIRCLES with r ≥ 0.75 in 8 u cells (boxes excluded on
//            purpose: walls are the see-through window's job), rebuilt when colliders.length changes. The
//            sight FAN: 5 distances {2, 4, 7, 10, 14} u from the chest toward the lens bearing × 3 bearings
//            {0, ±25°}; a sample is occupied when a circle within r + 1.5 of it has top(c) above the sight
//            line there (chestY + d·tan(el)). occupancy = occupied / 15. The camera turns that into densityK.
//
//   SIGHT LINES (§4.4) — lineBlocked(): does the segment body → lens pass a local collider under its top?
//            A circle blocks if the line passes within r + 0.6 in xz at a height below top(c); a box by the
//            slab test occlude() uses (padded 0.4) below top(c). A collider the line meets within 1.2 u of
//            the body is his own (the post he stands against: it blocks every candidate alike), as in occlude().
//
// No allocation per call: the list, the hash cells and the caches are built at their own cadence.
import { hypot2 } from './hypot.js';

export const LOCAL_R = 40;          // u: the local collider list's radius (§4.6)
export const LOCAL_EVERY = 0.5;     // s: …rebuilt this often
const CELL = 8;                     // u: density hash cell (§4.5)
const DENS_MIN_R = 0.75;            // circles at least this big count for density
const FAN_D = [2, 4, 7, 10, 14];
const FAN_B = [0, 25 * Math.PI / 180, -25 * Math.PI / 180];
const FAN_PAD = 1.5;                // a sample is occupied by a circle within r + this
const LINE_PAD = 0.6;               // a sight line is blocked by a circle within r + this
const BOX_PAD = 0.4;                // …or by a box grown by this (occlude()'s slab padding)
const BODY_SKIP = 1.2;              // u along the line: a collider met this close to the body is his own

export function createDensity(ctx) {
  const world = ctx.world;
  // ── top(c) ────────────────────────────────────────────────────────────────
  const topCache = new WeakMap();   // collider → { h, x, z, t }
  function topOf(c) {
    const h = c.h;
    let e = topCache.get(c);
    if (e && Object.is(e.h, h) && e.x === c.x && e.z === c.z) return e.t;
    const g = world.height(c.x, c.z);
    let t;
    if (typeof h === 'number' && h === h && h < 1e4) t = h <= 1.6 ? g + h : Math.max(h, g + h);
    else t = g + (c.box ? 8 : 6);
    if (!e) { e = { h, x: c.x, z: c.z, t }; topCache.set(c, e); } else { e.h = h; e.x = c.x; e.z = c.z; e.t = t; }
    return t;
  }

  // ── the local list (§4.6) ─────────────────────────────────────────────────
  const local = [];
  let localN = 0;                   // colliders scanned by the last refresh (QA)
  let localR = LOCAL_R;
  /** Rebuild the local list around (x, z): every collider whose footprint comes within max(LOCAL_R, reach) u. */
  function refreshLocal(x, z, reach = 0) {
    local.length = 0;
    const cols = ctx.colliders;
    localR = Math.max(LOCAL_R, reach);
    if (!cols) { localN = 0; return; }
    localN = cols.length;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!c) continue;
      const ext = c.box ? 0.5 * hypot2(c.w || 0, c.d || 0) : (c.r || 0);
      const dx = c.x - x, dz = c.z - z, R = localR + ext;
      if (dx * dx + dz * dz <= R * R) local.push(c);
    }
  }

  // ── the density hash (§4.5): circles r ≥ 0.75, 8 u cells ───────────────────
  const cells = new Map();          // cell key → colliders whose padded disc overlaps the cell
  let builtLen = -1, builtCount = 0;
  const cellKey = (ix, iz) => (ix + 2048) * 8192 + (iz + 2048);
  /** Rebuild the hash when ctx.colliders changed length (checked by the camera's 4 Hz density tick). */
  function maybeRebuild() {
    const cols = ctx.colliders;
    const n = cols ? cols.length : 0;
    if (n === builtLen) return false;
    builtLen = n; builtCount = 0;
    cells.forEach(clearCell);
    for (let i = 0; i < n; i++) {
      const c = cols[i];
      if (!c || c.box || !(c.r >= DENS_MIN_R)) continue;
      const rr = c.r + FAN_PAD;
      const x0 = Math.floor((c.x - rr) / CELL), x1 = Math.floor((c.x + rr) / CELL);
      const z0 = Math.floor((c.z - rr) / CELL), z1 = Math.floor((c.z + rr) / CELL);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const k = cellKey(ix, iz);
        let a = cells.get(k);
        if (!a) { a = []; cells.set(k, a); }
        a.push(c);
      }
      builtCount++;
    }
    return true;
  }
  const clearCell = (a) => { a.length = 0; };

  /**
   * The sight fan (§4.5): share of the 15 samples occupied, 0..1. (cx, cy, cz) the chest, az the lens
   * bearing (the lens stands at +(sin az, cos az) from him), el the framing's elevation (the sight line
   * climbs tan(el) per unit of ground distance).
   */
  function fan(cx, cy, cz, az, el) {
    const te = Math.tan(el);
    let occ = 0;
    for (let b = 0; b < FAN_B.length; b++) {
      const sx = Math.sin(az + FAN_B[b]), sz = Math.cos(az + FAN_B[b]);
      for (let k = 0; k < FAN_D.length; k++) {
        const d = FAN_D[k];
        const x = cx + sx * d, z = cz + sz * d, y = cy + d * te;
        const a = cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const c = a[i], rr = c.r + FAN_PAD, dx = x - c.x, dz = z - c.z;
          if (dx * dx + dz * dz < rr * rr && topOf(c) > y) { occ++; break; }
        }
      }
    }
    return occ / (FAN_B.length * FAN_D.length);
  }

  /**
   * Is the segment (ax, ay, az) → (bx, by, bz) — body point → candidate lens — blocked by a local collider
   * under its top (§4.4)? The segment climbs from the body to the lens, so its lowest point inside a
   * collider's padded footprint is where it enters it; a collider entered within BODY_SKIP u of the body is
   * his own and never counts.
   */
  function lineBlocked(ax, ay, az, bx, by, bz) {
    const vx = bx - ax, vz = bz - az, vy = by - ay;
    const h2 = vx * vx + vz * vz;
    if (h2 < 1e-8) return false;
    const L = Math.sqrt(h2 + vy * vy);
    const tSkip = BODY_SKIP / Math.max(1e-6, L);
    for (let i = 0; i < local.length; i++) {
      const c = local[i];
      let tin;
      if (c.box) {
        const hw = (c.w || 0) * 0.5, hd = (c.d || 0) * 0.5;
        if (hw <= 0 || hd <= 0) continue;
        const rot = c.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
        const ox = ax - c.x, oz = az - c.z;
        const px = ox * cs + oz * sn, pz = -ox * sn + oz * cs;
        const qx = vx * cs + vz * sn, qz = -vx * sn + vz * cs;
        let t0 = 0, t1 = 1;
        const sx = hw + BOX_PAD, sz = hd + BOX_PAD;
        if (Math.abs(qx) < 1e-9) { if (px < -sx || px > sx) continue; }
        else { let ta = (-sx - px) / qx, tb = (sx - px) / qx; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; }
        if (t0 > t1) continue;
        if (Math.abs(qz) < 1e-9) { if (pz < -sz || pz > sz) continue; }
        else { let ta = (-sz - pz) / qz, tb = (sz - pz) / qz; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; }
        if (t0 > t1) continue;
        tin = t0;
      } else {
        const r = (c.r || 0) + LINE_PAD;
        const ox = ax - c.x, oz = az - c.z;
        const bb = ox * vx + oz * vz, cc = ox * ox + oz * oz - r * r;
        const disc = bb * bb - h2 * cc;
        if (disc <= 0) continue;
        const sq = Math.sqrt(disc);
        const ta = (-bb - sq) / h2, tb = (-bb + sq) / h2;
        if (tb < 0 || ta > 1) continue;
        tin = ta < 0 ? 0 : ta;
      }
      if (tin <= tSkip) continue;
      if (ay + vy * tin < topOf(c)) return true;
    }
    return false;
  }

  return {
    top: topOf, local, refreshLocal, maybeRebuild, fan, lineBlocked,
    /** QA: what the sensor holds. */
    get stats() { return { local: local.length, localR: +localR.toFixed(1), scanned: localN, hashed: builtCount, cells: cells.size }; },
  };
}
