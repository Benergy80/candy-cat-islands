// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KID — WATER. Where a gummy child must not put its feet.
//
// Sour Patch Kids are sugar, and water melts them (Ben, 2026-09-23: "If they
// touch water they should melt into a pool of liquid that is their color").
// This module answers — cheaply, allocation-free — "is there water here deep
// enough to melt a kid?" for Candyland's three waters, using the same numbers
// the visitor wades by:
//   · the SEA        surface y = world.SEA_LEVEL (0), gentle shore waves
//   · the CHOCOLATE LAKE  the player's ground core reports its surface
//                    (groundInfo().water) inside the bowl
//   · the SYRUP RIVER    the terrain's river profile: a surface level and a
//                    drawn half-width (RIVER.width / 2 × wmul) per sample
//
//   depth(x, z)      water surface minus where a kid's feet would rest
//                    (terrain, a bridge deck, the top of a low prop); ≤ 0 is
//                    dry. Also sets api.kind ('sea' | 'lake' | 'river' | null)
//                    and api.surf (the surface y) for the point just asked.
//   wet(x, z)        THE MELT RULE: depth > WET_DEPTH (0.25 u), or the body
//                    centre inside the lake water at all (> 0.05), or any
//                    syrup over its feet in the river channel as the river
//                    mesh draws it (> RIVER_WET under the drawn surface)
//   surfaceY(x, z, t)  the water's surface where a puddle floats (the sea's
//                    shore waves included, matching the sea shader)
//   flow(x, z, out)  the river's downstream direction here (puddle drift);
//                    {0, 0} off the river
//
// Terrain-only depths are memoised on a 0.5-u grid over Candyland, filled
// lazily the first time a cell is asked about, so the per-step "is that
// water?" test the walkers run is one typed-array read almost everywhere.
// Only a cell whose TERRAIN is under water pays for a groundInfo() call (the
// pier deck and the licorice bridges are dry).
//
// THE RIVER IS EXACT (fixer r1: the grid answered for its cell CENTRE, and
// along the banks the centres sit just outside the channel while a kid's
// real point is inside it — hunters stood waist-deep in the syrup for a
// minute and a half, called dry). A cell that ANY part of could lie in the
// channel (segment distance − the cell's half-diagonal < the drawn half-
// width) is a RIVER CANDIDATE: it remembers its nearest profile segment, and
// every question about a point in it is answered at that exact point — the
// distance to the P[i]→P[i+1] segment, the surface and width interpolated
// along it, the terrain height right there. Everywhere else is still one
// typed-array read.
//
// THE WHOLE DRAWN BAND (fixer r3). The river mesh runs out to DRAWN_EDGE
// (1.25) × the half-width, sloping 0.30 down from 0.86, and the carved bank
// under that outer band is often well BELOW the drawn syrup: hunters stalked
// the far bank with 0.5–0.7 u of syrup over their feet, and no sugar lip over
// it (the lip's foot wobbles out to ~1.19 × the half-width), because the
// channel used to stop at 1.05. The channel is now water across the whole
// drawn band: wherever the syrup AS DRAWN (surface − dip) stands more than
// RIVER_WET over the feet, it is wet — a wall to a walker, a melt to a kid
// whose feet go in. (Where the lip does cover that band it is the same wall:
// no kid stands sunk in the white crust.) Bridges are still dry (deckOver).
//
// THE SUGAR LIP (fixer r3). Stopped at the drawn edge, hunters stood chest-
// deep in the raised white crust along the bank (buildRiverLip: a ridge
// 0.30–0.46 over the syrup or the bank, whichever is higher — up to 1.2 u
// over a carved bank's floor, out to ~2.2 × the half-width). The crust is
// read from the lip mesh itself (its four rows per bank per profile sample):
// lipTop(x, z) is its height there, and a kid stands ON it (sourpatch.js
// groundY), as on a low prop. (lipSink(x, z): how far it stands over the
// feet, for the verifiers.) It is not water — nobody melts in it; where it
// covers the drawn syrup band the band is still a wall (wet), so a kid on
// the crust stops at the syrup's edge.
//
// THE LICORICE BRIDGES are dry for every kid, wherever the visitor is (fixer
// r1: the ground core only counts a deck near the VISITOR's own height, so
// with him down at the beach the two river bridges vanished for the kids —
// the river cut Candyland in half and a kid on a bridge would have sunk to
// the river bed under it). Over water, depth() also asks the candy
// architecture's own ungated deck heights (candyArchitecture.getDeckHeight);
// bridgeY(x, z) hands a walker the deck height to stand at.
// ─────────────────────────────────────────────────────────────────────────────

export const WET_DEPTH = 0.25;       // feet this deep in water = melting
const INSIDE_DEPTH = 0.05;           // …or anywhere inside the river / lake water
const X0 = -292, Z0 = -132, CS = 0.5, NX = 560, NZ = 528;   // x -292…-12, z -132…132
const CELL_R = 0.36;                 // a cell's half-diagonal (0.354): how far its points reach from the centre
const SEG_WIN = 3;                   // exact river test: segments this many either side of the cell's own
// the syrup AS DRAWN (terrain/water.js buildRiver): flat at the surface out to
// 0.86 of the half-width, then sloping down 0.30 by DRAWN_EDGE (1.25, the
// mesh's last row). Across that whole band a kid melts as soon as its feet
// are RIVER_WET under the drawn surface (fixer r2: 3–5 cm of syrup over the
// feet at 0.78–0.9 was called dry; r3: 0.5–0.7 u of it between 1.05 and 1.25)
const DRAWN_FLAT = 0.86, DRAWN_DIP = 0.30, DRAWN_EDGE = 1.25;
const RIVER_WET = 0.02;
// the sugar lip (terrain/water.js buildRiverLip): ROWSF 1.05…1.92 × the
// half-width × a per-sample wobble of up to ~±13 %
const LIP_EDGE = 2.25, LIP_ROWS = 4;
const LIP_QUICK = 0.25;              // a lip under this over the bare terrain: no need to ask about decks / props
const NONE = 0, SEA = 1, LAKE = 2, RIVER = 3;
const KIND = [null, 'sea', 'lake', 'river'];
const TAU = Math.PI * 2;

export function createWater(ctx) {
  const W = ctx.world;
  const L = W.LAKE;
  const SEA_Y = Number.isFinite(W.SEA_LEVEL) ? W.SEA_LEVEL : 0;
  const depthM = new Float32Array(NX * NZ).fill(NaN);   // water surface − terrain at the centre (NaN = not asked yet)
  const kindM = new Uint8Array(NX * NZ);
  const segM = new Int16Array(NX * NZ).fill(-1);         // river candidate: its nearest profile segment (else −1)
  const lipM = new Int16Array(NX * NZ).fill(-1);         // sugar-lip candidate: its nearest profile segment (else −1)
  const _gi = { h: 0, deck: false, water: 0, limit: 0, floor: 0, prop: null, top: 0, base: 0 };

  // the river profile and the lake level, from the terrain system (built
  // before us); fallbacks keep the rule alive if it is ever missing
  let prof = null, lakeSurf = L ? L.surface : 2, riverReady = false, halfBase = 2.75;
  function syncTerrain() {
    if (riverReady) return;
    const T = ctx.systems.terrain;
    if (T && T.riverProfile && Array.isArray(T.riverProfile.P) && T.riverProfile.P.length > 1) prof = T.riverProfile;
    if (T && Number.isFinite(T.lakeSurface)) lakeSurf = T.lakeSurface;
    if (prof && prof.width) halfBase = prof.width * 0.5;
    riverReady = true;
  }
  const riverHalf = (W.RIVER?.width || 5.5) * 0.5;
  halfBase = riverHalf;

  // ── the river, exactly: distance to the profile's segments ─────────────────
  // → _seg { d, i (segment), surf, hw (drawn half-width), s (nearest sample) }
  const _seg = { d: Infinity, i: -1, t: 0, surf: 0, hw: 0, s: -1 };
  function segNear(x, z, i0, i1) {
    const P = prof.P;
    let bd2 = Infinity, bi = -1, bt = 0;
    for (let i = i0; i < i1; i++) {
      const a = P[i], b = P[i + 1];
      const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz;
      let t = L2 > 1e-9 ? ((x - a.x) * vx + (z - a.z) * vz) / L2 : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const dx = a.x + vx * t - x, dz = a.z + vz * t - z, d2 = dx * dx + dz * dz;
      if (d2 < bd2) { bd2 = d2; bi = i; bt = t; }
    }
    _seg.d = Math.sqrt(bd2); _seg.i = bi; _seg.t = bt;
    if (bi < 0) { _seg.surf = 0; _seg.hw = 0; _seg.s = -1; return _seg; }
    const a = P[bi], b = P[bi + 1];
    _seg.surf = a.surf + (b.surf - a.surf) * bt;
    _seg.hw = halfBase * ((a.wmul || 1) + ((b.wmul || 1) - (a.wmul || 1)) * bt);
    _seg.s = bt < 0.5 ? bi : bi + 1;
    return _seg;
  }
  /** Every segment, for a cell asked about the first time (bounding reject). */
  function segScan(x, z) {
    const P = prof.P, R = 20;
    let bd2 = Infinity, bi = -1;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if ((a.x < x - R && b.x < x - R) || (a.x > x + R && b.x > x + R)) continue;
      if ((a.z < z - R && b.z < z - R) || (a.z > z + R && b.z > z + R)) continue;
      const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz;
      let t = L2 > 1e-9 ? ((x - a.x) * vx + (z - a.z) * vz) / L2 : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const dx = a.x + vx * t - x, dz = a.z + vz * t - z, d2 = dx * dx + dz * dz;
      if (d2 < bd2) { bd2 = d2; bi = i; }
    }
    if (bi < 0) { _seg.d = Infinity; _seg.i = -1; _seg.s = -1; return _seg; }
    return segNear(x, z, bi, bi + 1);
  }

  const _cell = { d: 0, kind: NONE, idx: -1, surf: 0, dip: 0 };
  /** Sea and lake at a point (terrain height h): writes _cell. */
  function stillWater(x, z, h) {
    let best = SEA_Y - h, kind = SEA;
    if (L) {
      const dx = x - L.x, dz = z - L.z;
      if (dx * dx + dz * dz < (L.r + 8) * (L.r + 8) && lakeSurf - h > best) { best = lakeSurf - h; kind = LAKE; }
    }
    _cell.d = best; _cell.kind = kind; _cell.idx = -1; _cell.surf = kind === LAKE ? lakeSurf : SEA_Y; _cell.dip = 0;
  }
  /** The channel at a point (after segNear/segScan): deeper than the still water? */
  function riverInto(h) {
    if (_seg.i < 0 || !(_seg.d < _seg.hw * DRAWN_EDGE)) return;         // the river mesh's last row
    const dd = _seg.surf - h;
    if (dd > _cell.d) {
      _cell.d = dd; _cell.kind = RIVER; _cell.idx = _seg.s; _cell.surf = _seg.surf;
      const f = _seg.hw > 0 ? _seg.d / _seg.hw : 0;
      _cell.dip = f <= DRAWN_FLAT ? 0 : DRAWN_DIP * Math.min(1, (f - DRAWN_FLAT) / (DRAWN_EDGE - DRAWN_FLAT));
    }
  }
  function finish() { if (!(_cell.d > 0)) _cell.kind = NONE; return _cell; }

  /** Fill one memo cell from the terrain alone (no decks, no props), at its
   *  centre; a cell any part of which could be in the channel is marked a
   *  river candidate (its segment kept) and is answered exactly per point. */
  function fillCell(ci, x, z) {
    syncTerrain();
    const h = W.height(x, z);
    stillWater(x, z, h);
    let seg = -1, lseg = -1;
    if (x < 0) {
      if (prof) {
        if (W.riverDist(x, z) < halfBase * 2.7 * LIP_EDGE + 6) {       // widest (delta) channel + the spline's swing
          segScan(x, z);
          if (_seg.i >= 0 && _seg.d - CELL_R < _seg.hw * LIP_EDGE) lseg = _seg.i;
          if (_seg.i >= 0 && _seg.d - CELL_R < _seg.hw * DRAWN_EDGE) { seg = _seg.i; riverInto(h); }
        }
      } else if (W.riverDist(x, z) < riverHalf) {
        if (0.6 > _cell.d) { _cell.d = 0.6; _cell.kind = RIVER; _cell.surf = h + 0.6; _cell.dip = 0; }   // no profile: the channel is simply wet
      }
    }
    finish();
    if (ci >= 0) { depthM[ci] = _cell.d; kindM[ci] = _cell.kind; segM[ci] = seg; lipM[ci] = lseg; }
    return _cell;
  }
  /** A river-candidate cell: everything at the exact point asked about. */
  function exactAt(x, z, seg) {
    const h = W.height(x, z);
    stillWater(x, z, h);
    const n = prof.P.length - 1;
    segNear(x, z, seg - SEG_WIN < 0 ? 0 : seg - SEG_WIN, seg + SEG_WIN + 1 > n ? n : seg + SEG_WIN + 1);
    riverInto(h);
    return finish();
  }
  function cellAt(x, z) {
    const ix = Math.floor((x - X0) / CS), iz = Math.floor((z - Z0) / CS);
    if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) {
      // off the grid: exact, unmemoised
      syncTerrain();
      const h = W.height(x, z);
      stillWater(x, z, h);
      if (prof && x < 0 && W.riverDist(x, z) < halfBase * 2.7 * DRAWN_EDGE + 6) { segScan(x, z); riverInto(h); }
      return finish();
    }
    const ci = iz * NX + ix;
    let d = depthM[ci];
    if (d !== d) { fillCell(ci, X0 + (ix + 0.5) * CS, Z0 + (iz + 0.5) * CS); d = depthM[ci]; }   // NaN: first ask
    const seg = segM[ci];
    if (seg >= 0 && prof) return exactAt(x, z, seg);
    _cell.d = d; _cell.kind = kindM[ci]; _cell.idx = -1; _cell.dip = 0;
    _cell.surf = _cell.kind === LAKE ? lakeSurf : (_cell.kind === RIVER ? NaN : SEA_Y);
    return _cell;
  }
  /** A deck spanning the water here (a licorice bridge, a jetty), read from
   *  the candy architecture WITHOUT the visitor-height gate. NaN if none. */
  function deckOver(x, z, surf) {
    const A = ctx.systems.candyArchitecture;
    if (!A || typeof A.getDeckHeight !== 'function') return NaN;
    const y = A.getDeckHeight(x, z);
    return typeof y === 'number' && y > surf - 0.3 && y < surf + 4 ? y : NaN;
  }
  // ── the sugar lip, read off its own mesh ──────────────────────────────────
  // lipO / lipY: per bank (0: −n side, 1: +n side), per profile sample, the
  // four rows' offset out from the centre line (along that sample's normal)
  // and height. NaN where buildRiverLip left the sample out (the falls, the
  // delta, out at sea). Built once, the first time anyone asks.
  let lipO = null, lipY = null, lipTried = false;
  function buildLip() {
    lipTried = true;
    syncTerrain();
    const T = ctx.systems.terrain;
    const kids = T && T.group && T.group.children;
    if (!prof || !kids) return;
    let mesh = null;
    for (let j = 0; j < kids.length; j++) if (kids[j].name === 'terrain_river_lip') { mesh = kids[j]; break; }
    const pos = mesh && mesh.geometry && mesh.geometry.attributes.position;
    if (!pos) return;
    const P = prof.P, n = P.length, k = prof.k;
    const O = new Float32Array(2 * n * LIP_ROWS).fill(NaN), Y = new Float32Array(2 * n * LIP_ROWS).fill(NaN);
    let vi = 0;
    for (let sd = 0; sd < 2; sd++) {
      const sgn = sd === 0 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const p = P[i];
        // exactly buildRiverLip's own skips, so the vertex runs line up
        if (p.surf < -1.0 || (i > k - 3 && i < k + 6) || p.t > 0.93) continue;
        if (vi + LIP_ROWS > pos.count) return;
        for (let r = 0; r < LIP_ROWS; r++) {
          const x = pos.getX(vi + r), z = pos.getZ(vi + r);
          O[(sd * n + i) * LIP_ROWS + r] = ((x - p.x) * p.nx + (z - p.z) * p.nz) * sgn;
          Y[(sd * n + i) * LIP_ROWS + r] = pos.getY(vi + r);
        }
        vi += LIP_ROWS;
      }
    }
    if (vi !== pos.count) return;                   // not the layout we know: no lip rule (never a false wall)
    lipO = O; lipY = Y;
  }
  /** Top of the lip at (x, z), after segNear() (NaN: no crust here). The
   *  four rows are blended along the segment first (both samples' offsets and
   *  heights at _seg.t), then the point is placed across them — the quad the
   *  mesh draws between the two samples, near enough. */
  function lipAt(x, z) {
    const i = _seg.i;
    if (i < 0) return NaN;
    const P = prof.P, n = P.length, a = P[i], b = P[i + 1], t = _seg.t;
    const sd = (x - a.x) * a.nx + (z - a.z) * a.nz >= 0 ? 1 : 0, sgn = sd ? 1 : -1;
    const ba = (sd * n + i) * LIP_ROWS, bb = (sd * n + i + 1) * LIP_ROWS;
    // no quad between two samples unless the lip has both (the falls, the delta)
    if (!(lipO[ba] === lipO[ba]) || !(lipO[bb] === lipO[bb])) return NaN;
    const oa = ((x - a.x) * a.nx + (z - a.z) * a.nz) * sgn, ob = ((x - b.x) * b.nx + (z - b.z) * b.nz) * sgn;
    const o = oa + (ob - oa) * t;
    let o0 = lipO[ba] + (lipO[bb] - lipO[ba]) * t, y0 = lipY[ba] + (lipY[bb] - lipY[ba]) * t;
    if (o < o0) return NaN;                          // the syrup side of the lip's foot
    for (let r = 1; r < LIP_ROWS; r++) {
      const o1 = lipO[ba + r] + (lipO[bb + r] - lipO[ba + r]) * t, y1 = lipY[ba + r] + (lipY[bb + r] - lipY[ba + r]) * t;
      if (o <= o1) return y0 + (y1 - y0) * (o1 > o0 ? (o - o0) / (o1 - o0) : 0);
      o0 = o1; y0 = y1;
    }
    return NaN;                                      // past its buried outer row
  }

  function surfOf(c) {
    if (c.kind === LAKE) return lakeSurf;
    if (c.kind === RIVER) return c.surf;
    return SEA_Y;
  }

  const api = {
    kind: null, surf: 0, dip: 0,     // dip: how far the drawn syrup slopes below surf at the bank (river only)
    /** Water surface minus where feet would rest here (≤ 0 = dry). */
    depth(x, z) {
      const c = cellAt(x, z);
      if (!(c.d > 0) || c.kind === NONE) { api.kind = null; api.surf = 0; api.dip = 0; return c.d > 0 ? 0 : c.d; }
      let surf = surfOf(c);
      const cd = c.d, ck = c.kind, cdip = c.dip;
      // the terrain here is under water: is the kid standing on a deck or a prop above it?
      const pl = ctx.systems.player;
      let feet = W.height(x, z);
      if (pl && typeof pl.groundInfo === 'function') {
        const g = pl.groundInfo(x, z, _gi);
        if (g && g.deck) { api.kind = null; api.surf = 0; api.dip = 0; return -1; }       // the pier, a bridge
        if (g && Number.isFinite(g.h)) feet = g.h;
        if (ck === LAKE && g && g.water > 0) surf = g.water;               // the ground core's own lake level
      }
      if (!Number.isFinite(surf)) surf = feet + cd;
      const dk = deckOver(x, z, surf);
      if (dk === dk) { api.kind = null; api.surf = 0; api.dip = 0; return -1; }        // a licorice bridge over it
      api.kind = KIND[ck]; api.surf = surf; api.dip = ck === RIVER ? cdip : 0;
      return surf - feet;
    },
    /** Where a walker's feet rest on a bridge over the water here (NaN: no bridge). */
    bridgeY(x, z) {
      const c = cellAt(x, z);
      if (!(c.d > 0) || c.kind === NONE) return NaN;
      return deckOver(x, z, surfOf(c));
    },
    /** The melt rule: over the ankles in water, or standing in the river / lake at all. */
    wet(x, z) {
      const c = cellAt(x, z);
      if (c.kind === RIVER) {
        // the syrup river: any syrup over the feet, as drawn (a bridge deck
        // or a prop top above it is dry: depth() says so)
        const dip = c.dip;
        if (!(c.d - dip > RIVER_WET)) return false;
        return api.depth(x, z) - dip > RIVER_WET;
      }
      if (!(c.d > INSIDE_DEPTH)) return false;                               // the common case: dry land
      if (c.kind === SEA && c.d <= WET_DEPTH - 0.1) return false;            // lapping at the tideline
      const d = api.depth(x, z);
      if (d > WET_DEPTH) return true;
      return d > INSIDE_DEPTH && (api.kind === 'river' || api.kind === 'lake');
    },
    /** Top of the river's raised sugar lip here, as drawn (−Infinity: none).
     *  A kid stands ON it (sourpatch.js groundY): the ground core does not
     *  know the crust, and kids along the bank stood chest-deep in it. */
    lipTop(x, z) {
      if (!lipTried) buildLip();
      if (!lipO) return -Infinity;
      const ix = Math.floor((x - X0) / CS), iz = Math.floor((z - Z0) / CS);
      if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) return -Infinity;
      const ci = iz * NX + ix;
      if (depthM[ci] !== depthM[ci]) fillCell(ci, X0 + (ix + 0.5) * CS, Z0 + (iz + 0.5) * CS);
      const seg = lipM[ci];
      if (seg < 0) return -Infinity;
      const n = prof.P.length - 1;
      segNear(x, z, seg - SEG_WIN < 0 ? 0 : seg - SEG_WIN, seg + SEG_WIN + 1 > n ? n : seg + SEG_WIN + 1);
      const top = lipAt(x, z);
      return top === top ? top : -Infinity;
    },
    /** How far the river's sugar lip stands over the feet here (a bridge
     *  deck or a low prop's top counts as the feet); −1 where there is none. */
    lipSink(x, z) {
      const top = api.lipTop(x, z);
      if (top === -Infinity) return -1;
      let feet = W.height(x, z);
      if (top - feet <= LIP_QUICK) return top - feet;
      // high over the bare bank: is the kid on something above it (a bridge
      // deck, the top of a low prop)?
      const A = ctx.systems.candyArchitecture;
      if (A && typeof A.getDeckHeight === 'function') { const y = A.getDeckHeight(x, z); if (typeof y === 'number' && y > feet && y < feet + 6) feet = y; }
      const pl = ctx.systems.player;
      if (pl && typeof pl.groundInfo === 'function') { const g = pl.groundInfo(x, z, _gi); if (g && Number.isFinite(g.h) && g.h > feet) feet = g.h; }
      return top - feet;
    },
    /** Cheap: is the TERRAIN under water here (decks ignored)? For pathing probes. */
    terrainWet(x, z) { const c = cellAt(x, z); return c.kind === RIVER ? c.d - c.dip > RIVER_WET : c.d > INSIDE_DEPTH; },
    /** Where a floating thing rests on the water here (sea waves included). */
    surfaceY(x, z, t) {
      const c = cellAt(x, z);
      if (c.kind === LAKE) return lakeSurf;
      if (c.kind === RIVER && Number.isFinite(c.surf)) return c.surf;
      // the sea shader's three wave trains, damped in the shallows exactly as it damps them
      const dep = Math.max(0, SEA_Y - W.height(x, z));
      const damp = dep >= 3.4 ? 1 : (dep <= 0 ? 0 : (dep / 3.4) * (dep / 3.4) * (3 - 2 * dep / 3.4));
      let hs = 0;
      hs += 0.46 * Math.sin((0.944 * x + 0.330 * z) * (TAU / 71) + t * 0.55);
      hs += 0.27 * Math.sin((-0.410 * x + 0.912 * z) * (TAU / 43) + t * 0.78);
      hs += 0.11 * Math.sin((0.800 * x - 0.600 * z) * (TAU / 24) + t * 1.20);
      return SEA_Y + hs * damp;
    },
    /** Downstream direction of the river here → out {x, z} (zero off the river). */
    flow(x, z, out) {
      const c = cellAt(x, z);
      out.x = 0; out.z = 0;
      if (c.kind === RIVER && c.idx >= 0 && prof) { out.x = prof.P[c.idx].tx || 0; out.z = prof.P[c.idx].tz || 0; }
      return out;
    },
  };
  return api;
}
