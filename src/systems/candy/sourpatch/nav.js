// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KID — NAV. How a gummy child finds its way back to work.
//
// Fixer r1 (after the dawn turn, strollers walked in a straight line at day
// spots up to ~100 u away and wedged for minutes against houses, fences, the
// syrup river and the invincibility star's ring — in full view). Three tools,
// all allocation-free after the one-time graph build:
//
//   lineClear(x0, z0, x1, z1, r, noMarks)   can a kid walk this straight line? 0 = yes,
//                  1 = something solid / salt / a keep-off mark (a star's
//                  ring, a pickup's halo, a flower bed — ignored for its first
//                  metre only when it STARTS inside one: a kid may always walk
//                  out of one, never further in), 2 = water or off
//                  Candyland (the caller's okAt() decides, sampled every 0.6 u
//                  — the same tests moveTo makes, so a clear line is walkable)
//   route(x0, z0, ax, az, r, out)   THE LICORICE: the candy path network as a
//                  graph (the same centripetal Catmull-Rom the path ribbons
//                  and their bridge decks are built on, a node every ~4 u,
//                  paths joined where they meet; nodes the caller's nodeOK()
//                  rejects — inside the pier's salt line — are left out). The
//                  kid joins it at the best node it can walk straight to, follows it (over the
//                  bridges) and leaves it at the node nearest its day spot
//                  that has a clear line to it. Writes node ids to `out`,
//                  returns their count (api.routeLen = metres along it).
//   near(x, z, out)  the licorice nodes nearest a point (a wanderer that has
//                  lost its path looks for one it can walk straight to)
//   wayRound(x, z, tx, tz, r, out, noMarks)   A WAY ROUND: an A* on a 0.7-u
//                  grid (39 u square round the kid, ≤ 1600 expansions) toward
//                  (tx, tz) — round houses, fences, benches' ends, star rings,
//                  flower beds, salt, the pier's salt line and the water — to the reachable cell
//                  nearest the target; the waypoint is the furthest cell along
//                  that path the kid can walk straight to (≤ 12 u). → 1 and
//                  out {x, z}; 0 if it cannot get any closer from here; −1 if
//                  it ran out of this frame's budget (ask again next frame).
//                  What never moves (terrain, water, colliders) is cached per
//                  cell for good the first time it is asked (≤ 260 new cells
//                  a call, ~5 ms; invalidated when ctx.colliders changes);
//                  salt and keep-off marks are read live. `noMarks`: the
//                  second try when the marks alone wall it in (a flower bed
//                  across the licorice) — it steps through, carefully.
//
// Nodes: api.X[i], api.Z[i]. Dijkstra is O(V²) over ~150 nodes (≈0.1 ms);
// the caller rations planning to one kid a frame.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const NODE_GAP = 4.0;       // m between graph nodes along a path
const JOIN_R = 3.2;         // nodes of two different paths this close are joined (junctions)
const LINE_STEP = 0.6;      // lineClear sample spacing
const MARK_SKIP = 1.0;      // …the first metre ignores keep-off marks (a kid may walk OUT of one)
const K_NEAR = 8;           // entry / exit candidates considered
// the way-round grid (aligned to one fixed lattice over Candyland so its cache persists)
const GC = 0.7, GX0_C = -292, GZ0_C = -132, GNX_C = 400, GNZ_C = 378;
const WIN = 56;             // A* window: WIN × WIN cells (39 u) centred on the kid
const EXPAND_MAX = 1600;    // A* expansions per call
const NEW_MAX = 260;        // static cells computed per call (the rest next frame)
const PULL_MAX = 12;        // a way-round waypoint is at most this far along
const HEAP_CAP = 16384;
const NB_DX = [1, -1, 0, 0, 1, 1, -1, -1], NB_DZ = [0, 0, 1, -1, 1, -1, 1, -1];

export function createNav(ctx, env) {
  const { world } = ctx;
  // WAVE 4 (the raids): the grid and the path network are per instance, so
  // the pack that crosses the rainbow gets a Cat Island nav of its own
  // (env.island 'cat', env.grid {x0, z0, nx, nz}); Candyland's is unchanged.
  const ISL = env.island || 'candy';
  const GX0 = env.grid?.x0 ?? GX0_C, GZ0 = env.grid?.z0 ?? GZ0_C;
  const GNX = env.grid?.nx ?? GNX_C, GNZ = env.grid?.nz ?? GNZ_C;
  let V = 0, built = false;
  let X = new Float32Array(0), Z = new Float32Array(0);
  let adj = new Int16Array(0), adjN = new Uint8Array(0);
  const MAXADJ = 8;
  let dist = new Float32Array(0), nxt = new Int16Array(0), done = new Uint8Array(0), nodeBad = new Uint8Array(0);
  const nearI = new Int16Array(K_NEAR), nearD = new Float32Array(K_NEAR), nearS = new Float32Array(K_NEAR);
  // the way round: a persistent static cache + one A* window's scratch
  const stat = new Uint8Array(GNX * GNZ);        // 0 unknown · 1 open · 2 solid · 3 water / off Candyland
  let statVer = -1;
  const W2 = WIN * WIN;
  const gS = new Float32Array(W2), from = new Int16Array(W2), st = new Uint8Array(W2);
  const heapI = new Int16Array(HEAP_CAP), heapF = new Float32Array(HEAP_CAP);
  const pathBuf = new Int16Array(W2);
  let heapN = 0, wox = 0, woz = 0;
  const cellX = (c) => GX0 + ((c % WIN) + wox + 0.5) * GC;
  const cellZ = (c) => GZ0 + (((c - (c % WIN)) / WIN) + woz + 0.5) * GC;
  function hpush(i, f) {
    if (heapN >= HEAP_CAP) return;
    let c = heapN++;
    while (c > 0) { const p = (c - 1) >> 1; if (heapF[p] <= f) break; heapI[c] = heapI[p]; heapF[c] = heapF[p]; c = p; }
    heapI[c] = i; heapF[c] = f;
  }
  function hpop() {
    const top = heapI[0], li = heapI[--heapN], lf = heapF[heapN];
    let c = 0;
    for (;;) {
      let m = 2 * c + 1; if (m >= heapN) break;
      if (m + 1 < heapN && heapF[m + 1] < heapF[m]) m++;
      if (heapF[m] >= lf) break;
      heapI[c] = heapI[m]; heapF[c] = heapF[m]; c = m;
    }
    if (heapN > 0) { heapI[c] = li; heapF[c] = lf; }
    return top;
  }

  function build() {
    if (built) return;
    built = true;
    const xs = [], zs = [], pathOf = [], edges = [];
    const paths = (world.PATHS || []).filter((p) => p.island === ISL && Array.isArray(p.points) && p.points.length > 1);
    paths.forEach((path, pi) => {
      let pts;
      try {
        const curve = new THREE.CatmullRomCurve3(path.points.map((q) => new THREE.Vector3(q[0], 0, q[1])), false, 'centripetal', 0.5);
        pts = curve.getSpacedPoints(Math.max(2, Math.round(curve.getLength() / NODE_GAP)));
      } catch (e) { pts = path.points.map((q) => ({ x: q[0], z: q[1] })); }
      const first = xs.length;
      for (let i = 0; i < pts.length; i++) {
        xs.push(pts[i].x); zs.push(pts[i].z); pathOf.push(pi);
        if (i > 0) edges.push(first + i - 1, first + i);
      }
    });
    V = xs.length;
    for (let a = 0; a < V; a++) for (let b = a + 1; b < V; b++) {
      if (pathOf[a] === pathOf[b]) continue;
      if ((xs[a] - xs[b]) ** 2 + (zs[a] - zs[b]) ** 2 < JOIN_R * JOIN_R) edges.push(a, b);
    }
    X = Float32Array.from(xs); Z = Float32Array.from(zs);
    adj = new Int16Array(V * MAXADJ).fill(-1); adjN = new Uint8Array(V);
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e], b = edges[e + 1];
      if (adjN[a] < MAXADJ) adj[a * MAXADJ + adjN[a]++] = b;
      if (adjN[b] < MAXADJ) adj[b * MAXADJ + adjN[b]++] = a;
    }
    dist = new Float32Array(V); nxt = new Int16Array(V); done = new Uint8Array(V);
    // nodes a kid may not stand on (inside the salt line at the pier) are left out
    nodeBad = new Uint8Array(V);
    if (env.nodeOK) for (let i = 0; i < V; i++) if (!env.nodeOK(X[i], Z[i])) nodeBad[i] = 1;
    api.X = X; api.Z = Z; api.nodes = V;
  }

  /** The K_NEAR nodes nearest (x, z) → nearI / nearD (ascending); returns how many. */
  function nearest(x, z) {
    let n = 0;
    for (let i = 0; i < V; i++) {
      if (nodeBad[i]) continue;
      const d = Math.hypot(X[i] - x, Z[i] - z);
      if (n < K_NEAR) n++;
      else if (d >= nearD[n - 1]) continue;
      let j = n - 1;
      while (j > 0 && nearD[j - 1] > d) { nearD[j] = nearD[j - 1]; nearI[j] = nearI[j - 1]; j--; }
      nearD[j] = d; nearI[j] = i;
    }
    return n;
  }

  function lineClear(x0, z0, x1, z1, r, noMarks = false) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(L / LINE_STEP));
    const inMark = !noMarks && env.inMark(x0, z0, r);
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      const c = env.okAt(x0 + dx * f, z0 + dz * f, r, !noMarks && (!inMark || f * L > MARK_SKIP));
      if (c) return c;
    }
    return 0;
  }

  /** Is there water (or the edge of Candyland) anywhere on this line? — the
   *  cheap half of lineClear, run to the end: a wall in the way can be walked
   *  round, the syrup cannot (not without the bridge the path already takes). */
  function lineWater(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / LINE_STEP));
    for (let i = 1; i <= n; i++) if (env.wetAt(x0 + dx * i / n, z0 + dz * i / n)) return true;
    return false;
  }
  /** Dijkstra from node s over the whole graph: dist[] metres to s, nxt[] = next hop toward s. */
  function fieldFrom(s) {
    for (let i = 0; i < V; i++) { dist[i] = Infinity; nxt[i] = -1; done[i] = 0; }
    dist[s] = 0; nxt[s] = s;
    for (;;) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < V; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (let j = 0; j < adjN[u]; j++) {
        const v = adj[u * MAXADJ + j];
        if (nodeBad[v]) continue;
        const nd = bd + Math.hypot(X[u] - X[v], Z[u] - Z[v]);
        if (nd < dist[v]) { dist[v] = nd; nxt[v] = u; }
      }
    }
  }

  const api = {
    X, Z, nodes: 0, routeLen: 0,
    lineClear,
    /** The (up to 8) licorice nodes nearest (x, z), nearest first → out (Int16Array); returns how many. */
    near(x, z, out) {
      build();
      const n = nearest(x, z);
      for (let j = 0; j < n && j < out.length; j++) out[j] = nearI[j];
      return Math.min(n, out.length);
    },
    /** Path-network route from (x0, z0) toward the day spot (ax, az): node ids → out. */
    route(x0, z0, ax, az, r, out) {
      build();
      api.routeLen = 0;
      if (V < 2) return 0;
      // the exit: the nearest node with a clear walk to the spot (else the
      // nearest one on the spot's side of the water — a wall can be walked
      // round, the syrup cannot — else simply the nearest)
      let n = nearest(ax, az), exit = nearI[0], dry = -1;
      for (let j = 0; j < n && j < 5; j++) {
        const c = lineClear(X[nearI[j]], Z[nearI[j]], ax, az, r);
        if (c === 0) { exit = nearI[j]; dry = -2; break; }
        if (c === 1 && dry === -1 && !lineWater(X[nearI[j]], Z[nearI[j]], ax, az)) dry = nearI[j];
      }
      if (dry >= 0) exit = dry;
      fieldFrom(exit);
      // the entry: the best-scoring near node (walk to it + along to the exit)
      // it can walk straight to — eight straight-line tests at most; failing
      // all of them, the best of them anyway (a way round will be found there)
      n = nearest(x0, z0);
      for (let j = 0; j < n; j++) nearS[j] = dist[nearI[j]] < Infinity ? nearD[j] + dist[nearI[j]] : Infinity;
      // (fallback: the best one only a wall is in the way of — never one
      // across the syrup, which no way round can reach without a bridge)
      let entry = -1, bestS = Infinity, first = -1, firstS = Infinity, wet = -1, wetS = Infinity;
      for (let tries = 0; tries < K_NEAR; tries++) {
        let bj = -1, bs = Infinity;
        for (let j = 0; j < n; j++) if (nearS[j] < bs) { bs = nearS[j]; bj = j; }
        if (bj < 0) break;
        nearS[bj] = Infinity;
        const i = nearI[bj];
        let c = lineClear(x0, z0, X[i], Z[i], r);
        if (c === 0) { entry = i; bestS = bs; break; }
        if (c === 1 && lineWater(x0, z0, X[i], Z[i])) c = 2;          // a wall first, the syrup behind it
        if (c === 1 && first < 0) { first = i; firstS = bs; }
        if (c === 2 && wet < 0) { wet = i; wetS = bs; }
      }
      if (entry < 0) { entry = first >= 0 ? first : wet; bestS = first >= 0 ? firstS : wetS; }
      if (entry < 0) return 0;
      // walk the next-hop chain to the exit
      let c = 0, i = entry;
      while (c < out.length) {
        out[c++] = i;
        if (i === exit) break;
        const j = nxt[i];
        if (j < 0 || j === i) break;
        i = j;
      }
      api.routeLen = bestS + Math.hypot(X[exit] - ax, Z[exit] - az);
      return c;
    },
    /** A way round: see the header. */
    wayRound(x, z, tx, tz, r, out, noMarks = false) {
      const v = env.version ? env.version() : 0;
      if (v !== statVer) { stat.fill(0); statVer = v; }
      const cx0 = Math.floor((x - GX0) / GC), cz0 = Math.floor((z - GZ0) / GC);
      const ox = cx0 - (WIN >> 1), oz = cz0 - (WIN >> 1);             // window origin (global cells)
      wox = ox; woz = oz;
      st.fill(0);
      heapN = 0;
      const s0 = (cz0 - oz) * WIN + (cx0 - ox);
      let gx = Math.floor((tx - GX0) / GC) - ox, gz = Math.floor((tz - GZ0) / GC) - oz;
      const goal = gx >= 0 && gz >= 0 && gx < WIN && gz < WIN ? gz * WIN + gx : -1;
      gS[s0] = 0; from[s0] = s0; st[s0] = 1;
      let best = s0, bestH = Math.hypot(tx - x, tz - z), fresh = 0, n = 0;
      const skip2 = noMarks ? Infinity : (env.inMark(x, z, r) ? MARK_SKIP * MARK_SKIP : -1);
      hpush(s0, bestH);
      out.n = 0;
      while (heapN > 0 && n < EXPAND_MAX) {
        const c = hpop();
        if (st[c] === 2) continue;
        st[c] = 2; n++;
        const cxl = c % WIN, czl = (c - cxl) / WIN;
        const wx = GX0 + (cxl + ox + 0.5) * GC, wz = GZ0 + (czl + oz + 0.5) * GC;
        const h = Math.hypot(tx - wx, tz - wz);
        if (h < bestH - 1e-4) { bestH = h; best = c; }
        if (c === goal || h < GC) { best = c; bestH = h; break; }
        for (let j = 0; j < 8; j++) {
          const nx = cxl + NB_DX[j], nz = czl + NB_DZ[j];
          if (nx < 0 || nz < 0 || nx >= WIN || nz >= WIN) continue;
          const ni = nz * WIN + nx;
          if (st[ni] >= 2) continue;
          // diagonals never cut a blocked corner
          if (j >= 4 && (st[czl * WIN + nx] === 3 || st[nz * WIN + cxl] === 3)) continue;
          // open ground? (static: cached for good; salt and marks: live)
          const gxg = nx + ox, gzg = nz + oz;
          if (gxg < 0 || gzg < 0 || gxg >= GNX || gzg >= GNZ) { st[ni] = 3; continue; }
          const gi = gzg * GNX + gxg;
          const px = GX0 + (gxg + 0.5) * GC, pz = GZ0 + (gzg + 0.5) * GC;
          let sv = stat[gi];
          if (sv === 0) {
            if (fresh >= NEW_MAX) { out.n = n; return -1; }            // out of budget: next frame
            sv = stat[gi] = env.staticAt(px, pz); fresh++;
          }
          if (sv !== 1 || env.dynBlocked(px, pz, r, (px - x) ** 2 + (pz - z) ** 2 > skip2)) { st[ni] = 3; continue; }
          const ng = gS[c] + (j >= 4 ? GC * 1.4142 : GC);
          if (st[ni] === 1 && ng >= gS[ni]) continue;
          gS[ni] = ng; from[ni] = c; st[ni] = 1;
          hpush(ni, ng + Math.hypot(tx - px, tz - pz));
        }
      }
      out.n = n;
      if (best === s0) return 0;
      // the path back to the kid, then the furthest cell along it it can walk straight to
      let m = 0;
      for (let c = best; c !== s0 && m < W2; c = from[c]) pathBuf[m++] = c;   // best … first step
      // the furthest cell within PULL_MAX, then halfway back toward the kid,
      // a quarter… (so the near cells always get their turn); failing every
      // straight line, two cells along the path — moveTo slides the rest
      let far = 0;
      while (far < m - 1 && Math.hypot(cellX(pathBuf[far]) - x, cellZ(pathBuf[far]) - z) > PULL_MAX) far++;
      let pick = pathBuf[Math.max(0, m - 3)];
      for (let span = m - 1 - far, tests = 0; tests < 9; tests++, span >>= 1) {
        const j = m - 1 - span;
        if (lineClear(x, z, cellX(pathBuf[j]), cellZ(pathBuf[j]), r, noMarks) === 0) { pick = pathBuf[j]; break; }
        if (span <= 1) break;
      }
      out.x = cellX(pick); out.z = cellZ(pick);
      if ((out.x - x) ** 2 + (out.z - z) ** 2 < 0.25) return 0;         // a step on the spot is no way round
      return 1;
    },
  };
  return api;
}
