// GROUND & COLLISION CORE (wave-3 Contract A). Owned by the player system;
// every walker in the game — the visitor, cats, tigers, Sour Patch Kids,
// sheep, snails — asks this one module two questions:
//
//   groundAt(x, z, feetY, pad, out) → where do feet rest here?
//       terrain, or the highest walkable deck, or the TOP of a LOW PROP.
//   pushOut(x, z, r, feetY, vel, out) → where does a circle of radius r stand
//       if it may not overlap anything SOLID? (circles AND oriented boxes)
//
// ── what ctx.colliders means (read carefully, two conventions coexist) ────────
//   { x, z, r, h?, solid? }                      circle
//   { x, z, w, d, rot, h?, solid?, box:true }    oriented box
//     lx = dx·cos(rot) + dz·sin(rot) ,  lz = −dx·sin(rot) + dz·cos(rot)
//   `solid:false` is read LIVE on every query (doors open, rope gates, claims).
//   Geometry (x, z, r, w, d, rot) is read LIVE too, so a burned rock whose r
//   drops to 0 stops blocking the same frame.
//   `h` — two conventions, told apart by size:
//     h ≤ 1.6        Contract A: the prop's HEIGHT ABOVE THE GROUND under the
//                    feet (crate h:0.8 → feet at ground + 0.8). Always a LOW PROP.
//     1.6 < h < 1e4  Wave-1/2 builders wrote the ABSOLUTE world-Y of the top
//                    (e.g. H(x,z) + 1.6·s). Classified by how far that top
//                    stands above the ground across the footprint: ≤ 1.6 is a
//                    LOW PROP with a flat top at y = h; taller is SOLID with a
//                    top (the visitor may clear it with a jump and perch on it).
//     h ≥ 1e4 / none SOLID, no top.
//     h < −50        a neutralised claim: never solid, never stood on.
//   A LOW prop thinner than 0.5 u and taller than 0.5 u (licorice pickets,
//   rail fences) stays a HURDLE: solid, jumpable, perchable — a fence you
//   step onto by walking at it is no fence.
//
// ── LOW PROPS ─────────────────────────────────────────────────────────────────
//   Not solid. Standing within the footprint puts the feet on the top; the
//   outer RAMP (0.3 u) of the footprint blends ground → top so nothing pops.
//   `pad` pushes the ramp outward (the visitor passes his foot reach, so he
//   starts rising as his shoe reaches the edge, not his belly button). The
//   ramp is never wider than a quarter of the prop, so the middle half of a
//   0.55-u crate reads its full top.
//   Once at world:ready, player/calibrate.js checks every low prop against
//   what is actually DRAWN in its footprint and, per collider (the collider
//   object is never touched): snaps the standing top to the drawn surface
//   (setVisualTop), keeps it SOLID when drawn geometry would be inside a
//   walker's body (setSolid — a topiary in a planter, a table over a seat),
//   or retires it as a GHOST when nothing is drawn there at all.
//
// ── SPATIAL HASH ──────────────────────────────────────────────────────────────
//   4-u cells: a dense array over both islands, plus a sparse overflow map for
//   anything built off the map (the cave corridor lives at x ≈ 1400); each
//   collider sits in every cell its bounding square touches. Colliders parked
//   at |x| > 5e4 (how builders retire one) are not binned. Rebuilt when ctx.colliders is swapped for
//   another array or shrinks; appended to when it grows; and a rolling
//   validator (sweep(k) per frame) catches colliders that were moved or grown
//   in place after they were binned. Classification is cached per collider
//   object (WeakMap) and redone only when its `h` changes.
const CELL = 4, INV = 1 / CELL;
const GX0 = -340, GZ0 = -180, NX = 170, NZ = 90;           // x ∈ [-340, 340), z ∈ [-180, 180)
export const LOW_MAX = 1.6;                                 // tallest standable prop (height above ground)
export const RAMP = 0.3;                                    // edge blend, world units
const THIN = 0.5, HURDLE_MIN = 0.5;
const K_NONE = 0, K_SOLID = 1, K_TALL = 2, K_LOW = 3;
export const KINDS = ['none', 'solid', 'tall', 'low'];
export const CLEAR = 0.1;                                   // feet this close under a top have cleared it

export function createGroundCore(ctx, world, opts = {}) {
  const LAKE = world.LAKE;
  const SEA_WADE = opts.seaWade ?? 0.85, LAKE_WADE = opts.lakeWade ?? 0.32;

  // ── per-index tables (rebuilt with the hash) ──────────────────────────────
  let src = null, n = 0;
  let kind = new Uint8Array(0);
  let topAbs = new Float64Array(0);          // absolute top (legacy h) or NaN (relative)
  let relH = new Float64Array(0);            // relative height (Contract-A h) or the legacy height above base
  let baseC = new Float64Array(0);           // ground at the centre when classified
  let hSeen = [];                            // h value each index was classified with
  let ref = [];                              // the collider object binned at each index
  let insX = new Float64Array(0), insZ = new Float64Array(0), insB = new Float64Array(0);
  let rotSeen = new Float64Array(0), rcs = new Float64Array(0), rsn = new Float64Array(0);
  let stamp = new Uint32Array(0); let qid = 1;
  const cells = new Array(NX * NZ);          // arrays of collider indices (or undefined)
  const far = new Map();                     // off-grid cells: key → array
  const farKey = (gx, gz) => gx * 1048576 + gz;
  /** The index list of cell (gx, gz), or undefined. */
  const cellAt = (gx, gz) => (gx >= 0 && gx < NX && gz >= 0 && gz < NZ) ? cells[gz * NX + gx] : (far.size ? far.get(farKey(gx, gz)) : undefined);
  const meta = new WeakMap();                // collider → { h, kind, top, rel, base }
  let sweepAt = 0, dirty = false;
  const stats = { rebuilds: 0, appends: 0, lastBuildMs: 0, reclassified: 0 };

  // terrain + walkable decks only (no props) — the "ground" a prop sits on
  function baseAt(x, z) {
    let h = world.height(x, z);
    const ws = ctx.walkables;
    if (ws) for (let i = 0; i < ws.length; i++) {
      const w = ws[i]; if (!w || !w.test) continue;
      const t = w.test(x, z);
      if (typeof t === 'number' && t === t && t > h - 0.05 && t < 1e6) { if (t > h) h = t; _deck = true; }
    }
    return h;
  }
  let _deck = false;

  const boundR = (c) => c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0);

  /** Classify one collider (cached on the object). */
  function classify(c) {
    const h = c.h;
    let m = meta.get(c);
    if (m && Object.is(m.h, h)) return m;
    if (!m) { m = { h, kind: K_SOLID, top: NaN, rel: 0, base: 0, lo: 0, vis: NaN, ghost: false }; meta.set(c, m); }
    m.h = h; m.top = NaN; m.rel = 0; m.base = 0; m.lo = 0; m.vis = NaN; m.ghost = false; stats.reclassified++;
    if (typeof h !== 'number' || h !== h) { m.kind = K_SOLID; return m; }
    if (h < -50) { m.kind = K_NONE; return m; }
    if (h >= 1e4 || h === Infinity) { m.kind = K_SOLID; return m; }
    const minDim = c.box ? Math.min(c.w || 0, c.d || 0) : 2 * (c.r || 0);
    if (h <= LOW_MAX) {                                   // Contract A: relative height
      m.rel = h; m.base = baseAt(c.x, c.z);
      if (h <= 0.02) m.kind = K_NONE;
      else m.kind = (minDim < THIN && h > HURDLE_MIN) ? K_TALL : K_LOW;
      return m;
    }
    // legacy: absolute top. Its height is measured from the LOWEST ground a
    // walker can approach it from: a ring just OUTSIDE the footprint. (Measured
    // from the deck it stands on, the palace plinth's parapet is 0.6 u tall;
    // from the lawn outside it is a 4.4 u wall — and the lawn is where the
    // Sour Patch Kids come from.)
    if (h > 90) { m.kind = K_TALL; m.top = h; m.base = world.height(c.x, c.z); m.rel = h - m.base; return m; }
    m.base = baseAt(c.x, c.z);
    let lo = m.base;
    const RING = 0.4;
    if (c.box) {
      const rot = c.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
      const hw = (c.w || 0) * 0.5 + RING, hd = (c.d || 0) * 0.5 + RING;
      for (let sx = -1; sx <= 1; sx++) for (let sz = -1; sz <= 1; sz++) {
        if (!sx && !sz) continue;
        const lx = sx * hw, lz = sz * hd;
        const b = baseAt(c.x + lx * cs - lz * sn, c.z + lx * sn + lz * cs); if (b < lo) lo = b;
      }
    } else {
      const rr = (c.r || 0) + RING;
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const b = baseAt(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr); if (b < lo) lo = b; }
    }
    m.lo = lo; m.minDim = minDim;
    legacyKind(m, h);
    return m;
  }
  function legacyKind(m, top) {
    const tall = top - m.lo;
    m.top = top; m.rel = tall;
    if (tall <= 0.02) m.kind = K_NONE;
    else if (tall > LOW_MAX) m.kind = K_TALL;
    else m.kind = (m.minDim < THIN && tall > HURDLE_MIN) ? K_TALL : K_LOW;
  }

  /**
   * Visual calibration (player/calibrate.js, once at world:ready): a legacy
   * absolute `h` was a jump-over height, not a surface, and some sit 0.5–1 u
   * above the mesh they stand for. `top` replaces the standing top (the
   * collider object itself is never touched); `ghost` retires a collider
   * whose mesh no longer exists (never solid, never stood on). A Contract-A
   * (relative) prop stays relative: its height becomes top − ground.
   */
  function setVisualTop(i, top, ghost = false) {
    const c = src && src[i]; if (!c) return false;
    const m = classify(c);
    if (ghost) { m.ghost = true; m.kind = K_NONE; }
    else if (!Number.isFinite(top)) return false;
    else if (m.top === m.top) { m.vis = top; legacyKind(m, top); }
    else {
      const rel = top - m.base;
      m.vis = top; m.rel = rel;
      const minDim = c.box ? Math.min(c.w || 0, c.d || 0) : 2 * (c.r || 0);
      m.kind = rel <= 0.02 ? K_NONE : (rel > LOW_MAX || (minDim < THIN && rel > HURDLE_MIN)) ? K_TALL : K_LOW;
    }
    apply(i, c, m);
    return true;
  }
  /**
   * Visual calibration found a drawn surface that follows the terrain (a
   * fallen log laid along a slope): the standing top becomes RELATIVE, `rel`
   * above the ground under the feet, so walkers climb the log with the slope
   * instead of standing level with its uphill end.
   */
  function setRelativeTop(i, rel) {
    const c = src && src[i]; if (!c || !Number.isFinite(rel)) return false;
    const m = classify(c);
    m.top = NaN; m.vis = NaN; m.rel = rel; m.sloped = true;
    const minDim = c.box ? Math.min(c.w || 0, c.d || 0) : 2 * (c.r || 0);
    m.kind = rel <= 0.02 ? K_NONE : (rel > LOW_MAX || (minDim < THIN && rel > HURDLE_MIN)) ? K_TALL : K_LOW;
    apply(i, c, m);
    return true;
  }
  /**
   * Visual calibration found drawn geometry at body height inside a low
   * prop's footprint (a topiary in a planter, a marshmallow on a stump):
   * walkers would stand INSIDE it, so it stays SOLID. A finite `top` is a
   * perchable top (the visitor may jump onto it, like any wall top); NaN = no
   * top at all.
   */
  function setSolid(i, top) {
    const c = src && src[i]; if (!c) return false;
    const m = classify(c);
    m.solidified = true;
    if (Number.isFinite(top)) { m.kind = K_TALL; m.top = top; m.vis = top; m.rel = top - (m.lo || m.base); }
    else { m.kind = K_SOLID; m.top = NaN; m.vis = NaN; }
    apply(i, c, m);
    return true;
  }
  /** Calls fn(i, c, top, base, lo, legacy) for every LOW prop (for calibration / tests). */
  function forEachLow(fn) {
    sync();
    for (let i = 0; i < n; i++) {
      if (kind[i] !== K_LOW) continue;
      const c = src[i]; if (!c) continue;
      const m = meta.get(c); if (!m) continue;
      const legacy = m.top === m.top;
      fn(i, c, legacy ? m.top : m.base + m.rel, m.base, legacy ? m.lo : m.base, legacy);
    }
  }

  function grow(N) {
    if (kind.length >= N) return;
    const cap = Math.max(N, Math.ceil(kind.length * 1.5), 256);
    const f64 = (a) => { const b = new Float64Array(cap); b.set(a); return b; };
    const k2 = new Uint8Array(cap); k2.set(kind); kind = k2;
    topAbs = f64(topAbs); relH = f64(relH); baseC = f64(baseC);
    insX = f64(insX); insZ = f64(insZ); insB = f64(insB);
    rotSeen = f64(rotSeen); rcs = f64(rcs); rsn = f64(rsn);
    const s2 = new Uint32Array(cap); s2.set(stamp); stamp = s2;
  }

  function apply(i, c, m) {
    kind[i] = m.kind; topAbs[i] = m.top; relH[i] = m.rel; baseC[i] = m.base; hSeen[i] = m.h;
  }

  function insert(i, c) {
    ref[i] = c;
    if (!c || typeof c.x !== 'number' || typeof c.z !== 'number') { kind[i] = K_NONE; insB[i] = -1; return; }
    apply(i, c, classify(c));
    const rot = c.rot || 0; rotSeen[i] = rot; rcs[i] = Math.cos(rot); rsn[i] = Math.sin(rot);
    const br = boundR(c);
    insX[i] = c.x; insZ[i] = c.z; insB[i] = br;
    if (!(br > 0) || br > 400) return;
    if (Math.abs(c.x) > 5e4 || Math.abs(c.z) > 5e4) return;          // parked off-world
    const x0 = Math.floor((c.x - br - GX0) * INV), x1 = Math.floor((c.x + br - GX0) * INV);
    const z0 = Math.floor((c.z - br - GZ0) * INV), z1 = Math.floor((c.z + br - GZ0) * INV);
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      let a;
      if (gx >= 0 && gx < NX && gz >= 0 && gz < NZ) { const k = gz * NX + gx; a = cells[k]; if (!a) a = cells[k] = []; }
      else { const k = farKey(gx, gz); a = far.get(k); if (!a) far.set(k, a = []); }
      a.push(i);
    }
  }

  function rebuild() {
    const t0 = performance.now();
    const cols = ctx.colliders || [];
    for (let k = 0; k < cells.length; k++) if (cells[k]) cells[k].length = 0;
    far.clear();
    grow(cols.length); ref.length = cols.length; hSeen.length = cols.length;
    for (let i = 0; i < cols.length; i++) insert(i, cols[i]);
    src = cols; n = cols.length; dirty = false; sweepAt = 0;
    stats.rebuilds++; stats.lastBuildMs = performance.now() - t0;
  }

  /** Make sure the hash matches ctx.colliders. Cheap when nothing changed. */
  function sync() {
    const cols = ctx.colliders;
    if (cols === src && cols.length === n && !dirty) return;
    if (!cols) { src = null; n = 0; return; }
    if (cols === src && cols.length > n && !dirty) {           // grew: append
      grow(cols.length);
      for (let i = n; i < cols.length; i++) insert(i, cols[i]);
      n = cols.length; stats.appends++;
      return;
    }
    rebuild();
  }

  /** Rolling validator: re-check k binned colliders for in-place edits. */
  function sweep(k = 64) {
    sync();
    if (!n) return;
    const cols = src;
    for (let j = 0; j < k; j++) {
      if (sweepAt >= n) sweepAt = 0;
      const i = sweepAt++;
      const c = cols[i];
      if (c !== ref[i]) { dirty = true; return; }
      if (!c) continue;
      if (!Object.is(c.h, hSeen[i])) apply(i, c, classify(c));
      const br = boundR(c);
      if (c.x === insX[i] && c.z === insZ[i] && br <= insB[i]) continue;
      // moved or grew: harmless if it is still inside the square it was binned in,
      // or parked off-world (x = 1e6 is how builders retire a collider)
      if (!(br > 0) || Math.abs(c.x) > 5e4 || Math.abs(c.z) > 5e4) continue;
      const ob = Math.max(insB[i], 0);
      if (c.x - br >= insX[i] - ob && c.x + br <= insX[i] + ob && c.z - br >= insZ[i] - ob && c.z + br <= insZ[i] + ob) continue;
      dirty = true; return;
    }
  }

  // ── shared narrow-phase helpers ────────────────────────────────────────────
  /** Live rotation cache for box i. */
  function rot(i, c) {
    const r = c.rot || 0;
    if (r !== rotSeen[i]) { rotSeen[i] = r; rcs[i] = Math.cos(r); rsn[i] = Math.sin(r); }
  }
  /** Signed distance from (x,z) to collider i's footprint (negative inside). */
  function sdist(i, c, x, z) {
    const dx = x - c.x, dz = z - c.z;
    if (c.box) {
      rot(i, c);
      const cs = rcs[i], sn = rsn[i];
      const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
      const qx = Math.abs(lx) - (c.w || 0) * 0.5, qz = Math.abs(lz) - (c.d || 0) * 0.5;
      const ox = qx > 0 ? qx : 0, oz = qz > 0 ? qz : 0;
      return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0);
    }
    return Math.sqrt(dx * dx + dz * dz) - (c.r || 0);
  }
  function refresh(i, c) { if (!Object.is(c.h, hSeen[i])) apply(i, c, classify(c)); }

  // ── groundAt ───────────────────────────────────────────────────────────────
  const scratch = { h: 0, deck: false, water: 0, limit: SEA_WADE, floor: 0, prop: null, top: 0, base: 0 };
  /**
   * @param feetY  the caller's current feet Y. Finite = the visitor: TALL tops
   *               he is already at/above count as ground (perching). NPCs pass
   *               nothing (−∞) and only ever stand on LOW props.
   * @param pad    extra reach around a LOW prop's footprint (the ramp slides out).
   * @returns out  { h, deck, water, limit, floor, prop, top, base }
   *   h     where the feet rest (terrain | deck | prop top, ramped)
   *   prop  the collider stood on (null if none) · top  its full top Y
   *   base  terrain/deck height without props
   */
  function groundAt(x, z, feetY = -Infinity, pad = 0, out = scratch, stepFree = Infinity) {
    _deck = false;
    const base = baseAt(x, z);
    const deck = _deck;
    let h = base, prop = null, top = base;
    sync();
    if (n) {
      const reach = pad > 0 ? pad : 0;
      const x0 = Math.floor((x - reach - GX0) * INV), x1 = Math.floor((x + reach - GX0) * INV);
      const z0 = Math.floor((z - reach - GZ0) * INV), z1 = Math.floor((z + reach - GZ0) * INV);
      const q = ++qid; if (q >= 0xfffffff0) { stamp.fill(0); qid = 1; }
      const cols = src, perch = feetY > -1e8;
      for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
        const a = cellAt(gx, gz); if (!a) continue;
        for (let j = 0; j < a.length; j++) {
          const i = a[j];
          if (stamp[i] === qid) continue; stamp[i] = qid;
          const c = cols[i];
          if (!c || c.solid === false) continue;
          refresh(i, c);
          const kd = kind[i];
          if (kd === K_LOW) {
            const sd = sdist(i, c, x, z);
            if (sd >= reach) continue;
            const t = topAbs[i] === topAbs[i] ? topAbs[i] : base + relH[i];
            if (t <= base) continue;
            let y;
            if (perch && t - base > stepFree) {
              // the visitor: a prop taller than a stride is a LEDGE. Its top is
              // ground only once it is within a stride of his feet (he is on it,
              // or on the tier below) — otherwise he has to hop up (pushOut
              // blocks him and reports it) — and there is no ramp: on or off.
              if (t - feetY > stepFree) continue;
              y = t;
            } else {
              // the ramp is never wider than a quarter of the prop, so the
              // middle half of a 0.55-u crate still reads its full top
              const rp = c.box ? Math.min(RAMP, 0.25 * Math.min(c.w || 0, c.d || 0)) : Math.min(RAMP, 0.5 * (c.r || 0));
              let w = rp > 1e-4 ? (reach - sd) / rp : 1; if (w > 1) w = 1;
              y = base + (t - base) * w;
            }
            if (y > h) { h = y; prop = c; top = t; }
          } else if (kd === K_TALL && perch) {
            const t = topAbs[i] === topAbs[i] ? topAbs[i] : baseC[i] + relH[i];
            if (feetY < t - CLEAR || t <= h) continue;
            if (sdist(i, c, x, z) >= reach) continue;
            h = t; prop = c; top = t;
          }
        }
      }
    }
    let water = 0, limit = SEA_WADE;
    if (!deck && LAKE) {
      const dx = x - LAKE.x, dz = z - LAKE.z;
      if (dx * dx + dz * dz < (LAKE.r + 8) * (LAKE.r + 8) && base < LAKE.surface) { water = LAKE.surface; limit = LAKE_WADE; }
    }
    out.h = h; out.deck = deck; out.water = water; out.limit = limit;
    out.floor = (deck || prop) ? h : Math.max(h, water - limit);
    out.prop = prop; out.top = prop ? top : h; out.base = base;
    return out;
  }

  // ── pushOut ────────────────────────────────────────────────────────────────
  const pscratch = { x: 0, z: 0, hit: false, low: null, lowTop: 0, lowNx: 0, lowNz: 0 };
  /**
   * Resolve a circle against SOLID colliders (SOLID, and TALL ones whose top
   * the feet have not cleared). LOW props are never solid — walkers step on.
   * 4 passes, up to 6 while a pass still moves the circle > 0.01 u (wedges).
   * `vel` (optional {x,z}) loses its into-the-wall component (slide).
   * `stepFree` (the visitor only, with a finite feetY): LOW props taller than
   * this block him until his feet clear their top — out.low / lowTop / lowNx,
   * lowNz report the one he bumped so the caller can hop up onto it.
   */
  function pushOut(x, z, r = 0.45, feetY = -Infinity, vel = null, out = pscratch, stepFree = Infinity) {
    sync();
    let hit = false, low = null, lowTop = 0, lowNx = 0, lowNz = 0;
    const perch = feetY > -1e8;
    if (n) {
      const cols = src;
      // 4 passes, plus up to 2 more while the last one still moved the circle
      // more than 0.01 u (wedge corners between two solids)
      for (let pass = 0; pass < 6; pass++) {
        let moved = 0;
        const x0 = Math.floor((x - r - GX0) * INV), x1 = Math.floor((x + r - GX0) * INV);
        const z0 = Math.floor((z - r - GZ0) * INV), z1 = Math.floor((z + r - GZ0) * INV);
        if (x1 - x0 > 64 || z1 - z0 > 64) break;                   // absurd radius
        const q = ++qid; if (q >= 0xfffffff0) { stamp.fill(0); qid = 1; }
        for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
          const a = cellAt(gx, gz); if (!a) continue;
          for (let j = 0; j < a.length; j++) {
            const i = a[j];
            if (stamp[i] === qid) continue; stamp[i] = qid;
            const c = cols[i];
            if (!c || c.solid === false) continue;
            refresh(i, c);
            const kd = kind[i];
            if (kd === K_NONE) continue;
            let isLow = false, t = 0;
            if (kd === K_LOW) {
              if (!perch || !(relH[i] > stepFree)) continue;   // walkers step on
              t = topAbs[i] === topAbs[i] ? topAbs[i] : baseC[i] + relH[i];
              if (t - feetY <= stepFree) continue;             // within a stride: step on
              isLow = true;
            } else if (kd === K_TALL && perch) {
              t = topAbs[i] === topAbs[i] ? topAbs[i] : baseC[i] + relH[i];
              if (feetY >= t - CLEAR) continue;                // cleared it: jump over
            }
            let nxw, nzw, pen;
            if (c.box) {
              const hw = (c.w || 0) * 0.5, hd = (c.d || 0) * 0.5;
              if (!(hw > 0) || !(hd > 0)) continue;
              rot(i, c);
              const cs = rcs[i], sn = rsn[i];
              const dx = x - c.x, dz = z - c.z;
              const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
              if (lx > hw + r || lx < -hw - r || lz > hd + r || lz < -hd - r) continue;
              const qx = lx < -hw ? -hw : lx > hw ? hw : lx, qz = lz < -hd ? -hd : lz > hd ? hd : lz;
              const ox = lx - qx, oz = lz - qz, d2 = ox * ox + oz * oz;
              let nlx, nlz;
              if (d2 > 1e-10) {
                if (d2 >= r * r) continue;
                const d = Math.sqrt(d2); nlx = ox / d; nlz = oz / d; pen = r - d;
              } else {                                        // centre inside: out the nearest face
                const ex = hw - Math.abs(lx), ez = hd - Math.abs(lz);
                if (ex < ez) { nlx = lx < 0 ? -1 : 1; nlz = 0; pen = ex + r; }
                else { nlx = 0; nlz = lz < 0 ? -1 : 1; pen = ez + r; }
              }
              nxw = nlx * cs - nlz * sn; nzw = nlx * sn + nlz * cs;
            } else {
              const cr = c.r || 0; if (!(cr > 0)) continue;
              const rr = cr + r, dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz;
              if (d2 >= rr * rr) continue;
              if (d2 < 1e-8) { nxw = 1; nzw = 0; pen = rr; }
              else { const d = Math.sqrt(d2); nxw = dx / d; nzw = dz / d; pen = rr - d; }
            }
            x += nxw * pen; z += nzw * pen; hit = true; if (pen > moved) moved = pen;
            if (isLow && (!low || t < lowTop)) { low = c; lowTop = t; lowNx = nxw; lowNz = nzw; }
            if (vel) { const vn = vel.x * nxw + vel.z * nzw; if (vn < 0) { vel.x -= vn * nxw; vel.z -= vn * nzw; } }
          }
        }
        if (!(moved > 0) || (pass >= 3 && moved <= 0.01)) break;
      }
    }
    out.x = x; out.z = z; out.hit = hit;
    if (perch) { out.low = low; out.lowTop = lowTop; out.lowNx = lowNx; out.lowNz = lowNz; }
    return out;
  }

  // ── audit ──────────────────────────────────────────────────────────────────
  function nearestLandmark(x, z) {
    let best = null, bd = Infinity;
    for (const [id, L] of Object.entries(world.LANDMARKS || {})) {
      const d = Math.hypot(x - L.x, z - L.z) / Math.max(4, L.r);
      if (d < bd) { bd = d; best = id; }
    }
    return bd <= 1.35 ? best : (world.islandAt?.(x, z) || 'sea') + '_wilds';
  }
  function sizeBucket(c) {
    if (c.box) {
      const a = Math.min(c.w || 0, c.d || 0), b = Math.max(c.w || 0, c.d || 0);
      const t = a < 0.5 ? 'thin' : a < 1.5 ? 'slab' : 'block';
      const l = b < 1.5 ? 'short' : b < 4 ? 'mid' : 'long';
      return `box ${t}/${l}`;
    }
    const r = c.r || 0;
    return 'circle r' + (r < 0.5 ? '<0.5' : r < 0.8 ? '0.5-0.8' : r < 1.2 ? '0.8-1.2' : r < 2 ? '1.2-2' : r < 3.5 ? '2-3.5' : '≥3.5');
  }
  /** Counts + the most common unheighted solid colliders (candidates for an `h`). */
  function audit() {
    sync();
    const cols = src || [];
    const A = { total: cols.length, withH: 0, low: 0, lowRelative: 0, lowLegacy: 0, tall: 0, solidNoH: 0, none: 0,
      nonSolid: 0, boxes: 0, circles: 0, groups: [] };
    const G = new Map();
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]; if (!c) continue;
      if (c.box) A.boxes++; else A.circles++;
      if (typeof c.h === 'number') A.withH++;
      if (c.solid === false) { A.nonSolid++; continue; }
      const kd = kind[i];
      if (kd === K_LOW) { A.low++; if (topAbs[i] === topAbs[i]) A.lowLegacy++; else A.lowRelative++; }
      else if (kd === K_TALL) A.tall++;
      else if (kd === K_NONE) A.none++;
      else {
        A.solidNoH++;
        if (!(boundR(c) > 0) || Math.abs(c.x) > 5e4) continue;
        const lm = nearestLandmark(c.x, c.z);
        const key = sizeBucket(c) + ' @ ' + lm;
        let g = G.get(key); if (!g) { g = { key, n: 0, ex: [c.x, c.z], size: 0 }; G.set(key, g); }
        g.n++; g.size += c.box ? Math.max(c.w || 0, c.d || 0) : (c.r || 0);
      }
    }
    A.groups = [...G.values()].sort((a, b) => b.n - a.n).slice(0, 10)
      .map((g) => ({ n: g.n, kind: g.key, meanSize: +(g.size / g.n).toFixed(2), example: [+g.ex[0].toFixed(1), +g.ex[1].toFixed(1)] }));
    return A;
  }

  /** Every LOW prop near (x,z) — for tests and the verifier. */
  function lowPropsNear(x, z, rad = 12) {
    sync();
    const res = [];
    const cols = src || [];
    for (let i = 0; i < n; i++) {
      const c = cols[i]; if (!c || kind[i] !== K_LOW || c.solid === false) continue;
      if (Math.hypot(c.x - x, c.z - z) > rad + boundR(c)) continue;
      const top = topAbs[i] === topAbs[i] ? topAbs[i] : baseC[i] + relH[i];
      res.push({ i, x: c.x, z: c.z, box: !!c.box, r: c.r, w: c.w, d: c.d, rot: c.rot, h: c.h, top, height: +(top - baseC[i]).toFixed(2), legacy: topAbs[i] === topAbs[i] });
    }
    return res;
  }

  return {
    groundAt, baseAt, pushOut, sync, sweep, audit, lowPropsNear, stats, setVisualTop, setRelativeTop, setSolid, forEachLow,
    kindOf(c) { sync(); const i = src ? src.indexOf(c) : -1; return i < 0 ? KINDS[classify(c).kind] : KINDS[kind[i]]; },
    get count() { return n; },
  };
}
