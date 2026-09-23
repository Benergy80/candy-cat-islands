// VISUAL CALIBRATION of low props — runs once, at world:ready.
//
// Wave-1/2 builders published an ABSOLUTE `h` on their colliders as a
// jump-over height ("you clear it once your feet are above h"), and several
// padded it: the candy rocks say H + 1.6·s while the rock mesh tops out ~0.7 u
// lower. Now that a low prop is something you STAND on, that padding floats
// walkers in mid-air, a ghost collider (mesh culled, collider left behind) is
// an invisible platform, and a planter whose topiary rises far above its
// published top puts the walker's torso inside the bush. So for every low prop
// we look at what is ACTUALLY drawn in its footprint and decide one of:
//
//   · SETTLE  — the standing top becomes the drawn surface: the centre's
//               highest up-facing surface in [ground, top + 0.35], lifted by a
//               side point by at most 0.25 (a planter rim, a bumpy rock); if
//               the centre falls in a gap, the highest side surface
//               — and if that surface follows the terrain (a log laid along a
//               slope) the top becomes RELATIVE to the ground (setRelativeTop)
//   · SOLID   — drawn geometry would be INSIDE a walker standing there: a
//               crossing in the body column (top + 0.15 … + 1.7), or the
//               point sits inside a closed volume — at the centre, or at 3 of
//               the 4 side points (which ignore a stride: backrests, rims). It
//               becomes a perchable solid (TALL, top = the highest surface
//               within a double jump with room above it), or plain SOLID.
//               Also SOLID: a legacy prop with no surface under it but drawn
//               geometry at walking height around it (a newel post)
//   · GHOST   — a legacy prop with drawn geometry at walking height at no more
//               than 1 of 9 sample points (its mesh was culled, or it is buried
//               in the slope it was sunk into): never solid, never stood on
//   · KEEP    — within 0.12 of the drawn surface already, or a Contract-A
//               (relative) prop with nothing measurable: published h stays
//
// WHAT IS MEASURED. Every static mesh in the scene — hidden ones included,
// because interiors and the undersea cave are hidden while you are outside
// them — except terrain/sea/sky (they are the ground, not props; excluded BY
// NAME, not by size, so island-wide merged districts like candyArch_waffle
// count) and everything that moves (NPCs, creatures, ferry, planes, pickups,
// weapons, particles: a cat loitering by a bench at load must not make the
// bench a wall). Prop-sized meshes and InstancedMesh instances are ray-cast
// (both faces); merged meshes are walked triangle by triangle ONCE each, with
// the sample points binned in a local 2-u grid (vertical ray → 2-D
// point-in-triangle), so a 38k-triangle district costs a few ms.
//
// The collider objects themselves are never modified: the ground core keeps
// the result per collider (setVisualTop / setSolid).
//
// Budget: hard stop at `budgetMs`; props not reached keep their published h.
const HI = 0.35;            // a standing surface may sit this far above the published top
const BODY = 1.7;           // a walker's height above the surface he stands on
const SKIN = 0.15;          // crossings this close above the standing top are its own skin
const SIDE_STEP = 0.25;     // a side point may lift the standing top this far above the centre (rims, bumps)
const SIDE_CLEAR = 0.45;    // side points: geometry up to a stride above the top is a backrest/rim the feet may overlap
const SIDE_MIN = 3;         // side points: this many of the 4 cluttered (with a clear centre) = SOLID
const REACH = 3.2;          // look this far up: a cluttered prop's perchable top (double-jump reach)
const PERCH_ROOM = 1.2;     // a perch top needs this much air above it
const INNER = 5;            // centre + 4 at 40 % of the half-extents (standing / clutter)
const NPTS = 9;             // + 4 at 75 % (ghost detection only)
const PATH_CLEAR = 0.12;    // path ribbons ride the terrain this close: never a prop surface
const GRID = 2;             // phase-2 point grid, mesh-local units

// never props: the ground itself, water, sky (matched on the mesh's own name)
const GROUND_NAME = /^(terrain_ground|terrain_sea$|terrain_river$|skyDome$|seaMist$|clouds$|flyer_horizon|sunDisc$|moonDisc$)/;
// top-level scene groups that move (or hold things that move)
const DYNAMIC_ROOT = /^(sky$|clouds$|seaMist$|planes$|sourpatch$|cat_citizens$|containment-(cats|fish|paw)$|sugarfin|inventory|weapons$|powerups$|particles|flyer$|flyer_thermal|flyer_horizon)/;
const DYNAMIC_SYSTEMS = ['catCitizens', 'sourPatch', 'planes', 'powerups', 'weapons', 'inventory', 'particles', 'sky', 'ferry'];
const DYNAMIC_NAME = /^(gull|canoe_)/;

export function calibrateLowTops(ctx, core, opts = {}) {
  // Some walkables answer relative to the VISITOR's feet (the watchtower's
  // spiral stair is only offered within a step of them), so the ground under a
  // prop would depend on where he happens to stand. Park him far below the
  // world while measuring: those walkables drop out and every prop is measured
  // from the floor it actually stands on.
  const pp = ctx.systems?.player?.position;
  const py0 = pp ? pp.y : 0;
  if (pp) pp.y = -1e6;
  try { return calibrate(ctx, core, opts); } finally { if (pp) pp.y = py0; }
}

function calibrate(ctx, core, opts) {
  const THREE = ctx.THREE;
  const t0 = performance.now();
  const budget = opts.budgetMs ?? 600;
  const res = {
    props: 0, lowered: 0, raised: 0, sloped: 0, ghosts: 0, solid: 0, kept: 0, unreached: 0, ms: 0, meanDrop: 0,
    bigMeshes: 0, smallMeshes: 0, instances: 0, walkedTris: 0, phase1Ms: 0, phase2Ms: 0,
    solidList: [], ghostList: [], notDrawn: [], audit: null,
  };
  if (!THREE || !ctx.scene) return res;
  ctx.scene.updateMatrixWorld(true);
  const world = ctx.world;
  const H = (x, z) => (world && world.height ? world.height(x, z) : -Infinity);

  // ── gather targets ───────────────────────────────────────────────────────
  const skip = new Set();
  const skipTree = (r) => { if (r && r.isObject3D) r.traverse((o) => skip.add(o)); };
  skipTree(opts.skip);
  for (const k of DYNAMIC_SYSTEMS) { const s = ctx.systems?.[k]; skipTree(s?.group); skipTree(s?.root); }
  for (const ch of ctx.scene.children) if (DYNAMIC_ROOT.test(ch.name || '')) skipTree(ch);
  // candy creatures: the merged props mesh is scenery, the instances walk
  const creatures = ctx.systems?.candyCreatures?.group;
  if (creatures && creatures.isObject3D) creatures.traverse((o) => { if (o.isInstancedMesh) skip.add(o); });

  const CELL = 4, INV = 1 / CELL;
  const key = (gx, gz) => ((gx + 512) << 10) | (gz + 512);
  const instCells = new Map();                 // cell → [{ mesh, i, x, z, rad }]
  let maxRad = 0;
  const small = [];                            // { o, bb }
  const bigs = [];                             // { o, bb } merged meshes (phase 2)
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const drawn = (o) => {
    const mt = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mt || mt.visible === false || mt.colorWrite === false || mt.depthWrite === false) return false;
    if (mt.transparent && (mt.opacity ?? 1) < 0.5) return false;
    return true;
  };
  ctx.scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || skip.has(o)) return;
    const g = o.geometry;
    if (!g || !g.attributes?.position || o.isPoints || o.isLine || o.isSprite) return;
    const nm = o.name || '';
    if (!drawn(o)) { if (res.notDrawn.length < 40) res.notDrawn.push(nm || o.parent?.name || o.type); return; }
    if (GROUND_NAME.test(nm) || DYNAMIC_NAME.test(nm)) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (o.isInstancedMesh) {
      if (o.visible === false) return;                          // a hidden pool, not scenery
      const gr = g.boundingSphere ? g.boundingSphere.radius : 1;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, _m); _m.premultiply(o.matrixWorld); _m.decompose(_p, _q, _s);
        const sc = Math.max(Math.abs(_s.x), Math.abs(_s.y), Math.abs(_s.z));
        if (!(sc > 1e-4)) continue;                            // blanked instance
        const rad = gr * sc;
        if (rad > 30) continue;
        const k = key(Math.floor(_p.x * INV), Math.floor(_p.z * INV));
        let a = instCells.get(k); if (!a) instCells.set(k, a = []);
        a.push({ mesh: o, i, x: _p.x, z: _p.z, rad });
        if (rad > maxRad) maxRad = rad;
        res.instances++;
      }
    } else {
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
      const diag = Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      if (diag > 600) return;                                  // sky-sized: never a prop
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const e = o.matrixWorld.elements;
      const upright = !(Math.abs(e[1]) > 1e-6 || Math.abs(e[9]) > 1e-6 || Math.abs(e[4]) > 1e-6 || Math.abs(e[6]) > 1e-6) && e[5] > 1e-6;
      const pa = g.attributes.position;
      if ((diag > 25 || tris > 6000) && upright && !pa.isInterleavedBufferAttribute && pa.itemSize === 3) bigs.push({ o, bb });
      else small.push({ o, bb });
    }
  });
  res.bigMeshes = bigs.length; res.smallMeshes = small.length;

  // ── the props and their sample points ────────────────────────────────────
  const props = [];
  core.forEachLow((i, c, top, base0, lo, legacy) => {
    // the ground the prop stands on, never above its own top (a deck that
    // covers it from above is not what it stands on)
    let base = core.baseAt ? core.baseAt(c.x, c.z) : base0;
    if (!(base === base)) base = base0;
    const ground = Math.max(base, H(c.x, c.z));             // where feet rest at the centre without the prop
    if (base > top - 0.02) base = Math.min(lo, top - 0.02);
    if (!legacy) top = base + (top - base0);                 // a relative top rides the same ground
    const floor = base + 0.06;
    const P = {
      i, c, top, base, ground, legacy, floor, hi: top + HI, ceil: top + HI + REACH,
      px: new Float64Array(NPTS), pz: new Float64Array(NPTS), fl: new Float64Array(NPTS), hp: new Float64Array(NPTS),
      stand: new Float64Array(NPTS).fill(NaN), all: [], ups: [], up0: [], done: false,
    };
    for (let k = 0; k < NPTS; k++) { P.all.push([]); P.ups.push([]); }
    const offs = [[0, 0], [0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4], [0.75, 0], [-0.75, 0], [0, 0.75], [0, -0.75]];
    const r = c.rot || 0, cs = Math.cos(r), sn = Math.sin(r);
    for (let k = 0; k < NPTS; k++) {
      let x, z;
      if (c.box) {
        const lx = offs[k][0] * (c.w || 0) * 0.5, lz = offs[k][1] * (c.d || 0) * 0.5;
        x = c.x + lx * cs - lz * sn; z = c.z + lx * sn + lz * cs;
      } else {
        // circles: the diagonal inner points sit at 0.4·r along the axes (as before)
        const f = k === 0 ? [0, 0] : k < INNER ? [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]][k - 1] : offs[k];
        x = c.x + f[0] * (c.r || 0); z = c.z + f[1] * (c.r || 0);
      }
      P.px[k] = x; P.pz[k] = z; P.hp[k] = H(x, z);
      // path ribbons and terrain bumps inside the footprint are ground, not prop
      P.fl[k] = Math.max(floor, P.hp[k] + PATH_CLEAR);
    }
    props.push(P);
  });
  res.props = props.length;

  const trace = !!opts.trace;                  // debugging: keep [y, up, mesh name] per crossing
  /** One crossing of the vertical line through point k of prop P at world y. */
  function record(P, k, y, up, who) {
    if (!(y > P.fl[k]) || y > P.ceil) return;
    if (trace) (P.trace || (P.trace = [])).push([k, +y.toFixed(2), up ? 'up' : 'dn', who && (who.name || who.parent?.name || who.type)]);
    if (up && y <= P.hi && !(y <= P.stand[k])) P.stand[k] = y;
    P.all[k].push(y); P.ups[k].push(up);
    if (k === 0 && up) P.up0.push(y);
  }

  // ── phase 1: instances + prop-sized meshes, ray-cast (both faces) ─────────
  const rc = new THREE.Raycaster();
  const org = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  const both = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const proxy = new THREE.Mesh(undefined, both);
  proxy.matrixAutoUpdate = false;
  const nmat = new THREE.Matrix3();
  const hits = [];
  const cands = [];
  const tP1 = performance.now();
  let reached = props.length;
  for (let t = 0; t < props.length; t++) {
    if (performance.now() - t0 > budget) { reached = t; break; }
    const P = props[t], c = P.c;
    const ext = c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0);
    cands.length = 0;
    const reach = ext + Math.min(maxRad, 12);
    const x0 = Math.floor((c.x - reach) * INV), x1 = Math.floor((c.x + reach) * INV);
    const z0 = Math.floor((c.z - reach) * INV), z1 = Math.floor((c.z + reach) * INV);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const a = instCells.get(key(gx, gz)); if (!a) continue;
      for (const e of a) if (Math.hypot(e.x - c.x, e.z - c.z) < ext + e.rad) cands.push(e);
    }
    for (const s of small) {
      if (c.x < s.bb.min.x - ext || c.x > s.bb.max.x + ext || c.z < s.bb.min.z - ext || c.z > s.bb.max.z + ext) continue;
      if (s.bb.max.y < P.floor || s.bb.min.y > P.ceil) continue;
      cands.push(s);
    }
    P.done = true;
    if (!cands.length) continue;
    const cast = (k) => {
      const lo = P.fl[k];
      org.set(P.px[k], P.ceil + 0.5, P.pz[k]); rc.set(org, down); rc.near = 0; rc.far = P.ceil + 0.5 - lo;
      for (let j = 0; j < cands.length; j++) {
        const cnd = cands[j];
        const g = cnd.mesh ? cnd.mesh.geometry : cnd.o.geometry;
        proxy.geometry = g;
        if (cnd.mesh) { cnd.mesh.getMatrixAt(cnd.i, proxy.matrixWorld); proxy.matrixWorld.premultiply(cnd.mesh.matrixWorld); }
        else proxy.matrixWorld.copy(cnd.o.matrixWorld);
        hits.length = 0;
        proxy.raycast(rc, hits);
        if (!hits.length) continue;
        nmat.getNormalMatrix(proxy.matrixWorld); const ne = nmat.elements;
        for (let h = 0; h < hits.length; h++) {
          const f = hits[h].face; if (!f) continue;
          const n = f.normal;
          record(P, k, hits[h].point.y, ne[1] * n.x + ne[4] * n.y + ne[7] * n.z > 0, trace ? (cnd.mesh || cnd.o) : null);
        }
      }
    };
    for (let k = 0; k < INNER; k++) cast(k);
    // the outer ring only matters when the inner points saw nothing near (ghost test)
    let near = false;
    for (let k = 0; k < INNER && !near; k++) for (const y of P.all[k]) if (y <= P.hi + BODY) { near = true; break; }
    if (!near) for (let k = INNER; k < NPTS; k++) cast(k);
  }
  proxy.geometry = undefined;
  both.dispose();
  res.phase1Ms = +(performance.now() - tP1).toFixed(1);

  // ── phase 2: merged meshes, one triangle walk each ────────────────────────
  // Only meshes whose matrix keeps +Y vertical (translation, yaw, scale — every
  // merged district here) are walked, so a world-vertical line stays vertical
  // in local space; any other big mesh was ray-cast in phase 1.
  const tP2 = performance.now();
  const inv = new THREE.Matrix4();
  const CI = 1 / GRID;
  for (let b = 0; b < bigs.length; b++) {
    if (performance.now() - t0 > budget) { res.unreachedMeshes = bigs.length - b; break; }
    const { o, bb } = bigs[b];
    const e = o.matrixWorld.elements;
    inv.copy(o.matrixWorld).invert(); const ie = inv.elements;
    // the sample points inside this mesh, in mesh-local x/z (+ the y window)
    const Q = [];
    const grid = new Map();
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (let t = 0; t < reached; t++) {
      const P = props[t];
      if (P.ceil < bb.min.y || P.floor > bb.max.y) continue;
      for (let k = 0; k < NPTS; k++) {
        const wx = P.px[k], wz = P.pz[k];
        if (wx < bb.min.x || wx > bb.max.x || wz < bb.min.z || wz > bb.max.z) continue;
        const lx = ie[0] * wx + ie[8] * wz + ie[12], lz = ie[2] * wx + ie[10] * wz + ie[14];
        const q = { P, k, lx, lz, y0: (P.fl[k] - e[13]) / e[5], y1: (P.ceil - e[13]) / e[5] };
        Q.push(q);
        const gk = (Math.floor(lx * CI) + 32768) * 65536 + (Math.floor(lz * CI) + 32768);
        let a = grid.get(gk); if (!a) grid.set(gk, a = []);
        a.push(q);
        if (lx < mnx) mnx = lx; if (lx > mxx) mxx = lx; if (lz < mnz) mnz = lz; if (lz > mxz) mxz = lz;
      }
    }
    if (!Q.length) continue;
    const g = o.geometry, pa = g.attributes.position;
    const A = pa.array, I = g.index ? g.index.array : null;
    const nTri = (I ? I.length : pa.count) / 3;
    const test = (q, ax, az, bx, bz, cx, cz, ay, by, cy, den, up) => {
      const l1 = ((bz - cz) * (q.lx - cx) + (cx - bx) * (q.lz - cz)) / den;
      if (l1 < -1e-6) return;
      const l2 = ((cz - az) * (q.lx - cx) + (ax - cx) * (q.lz - cz)) / den;
      if (l2 < -1e-6 || l1 + l2 > 1 + 1e-6) return;
      const ly = l1 * ay + l2 * by + (1 - l1 - l2) * cy;
      if (ly <= q.y0 || ly > q.y1) return;
      record(q.P, q.k, e[5] * ly + e[13], up, trace ? o : null);
    };
    for (let t = 0; t < nTri; t++) {
      const ia = (I ? I[t * 3] : t * 3) * 3, ib = (I ? I[t * 3 + 1] : t * 3 + 1) * 3, ic = (I ? I[t * 3 + 2] : t * 3 + 2) * 3;
      const ax = A[ia], az = A[ia + 2], bx = A[ib], bz = A[ib + 2], cx = A[ic], cz = A[ic + 2];
      const tx0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx), tx1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx);
      if (tx1 < mnx || tx0 > mxx) continue;
      const tz0 = az < bz ? (az < cz ? az : cz) : (bz < cz ? bz : cz), tz1 = az > bz ? (az > cz ? az : cz) : (bz > cz ? bz : cz);
      if (tz1 < mnz || tz0 > mxz) continue;
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(den) < 1e-12) continue;                       // a vertical face: the line slides past it
      const up = den < 0;                                        // local normal·Y > 0 (e[5] > 0 keeps the sign)
      const ay = A[ia + 1], by = A[ib + 1], cy = A[ic + 1];
      const gx0 = Math.floor(tx0 * CI), gx1 = Math.floor(tx1 * CI), gz0 = Math.floor(tz0 * CI), gz1 = Math.floor(tz1 * CI);
      if ((gx1 - gx0 + 1) * (gz1 - gz0 + 1) > 48) {              // a huge triangle: test every point
        for (let k = 0; k < Q.length; k++) {
          const q = Q[k];
          if (q.lx < tx0 || q.lx > tx1 || q.lz < tz0 || q.lz > tz1) continue;
          test(q, ax, az, bx, bz, cx, cz, ay, by, cy, den, up);
        }
        continue;
      }
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
        const a = grid.get((gx + 32768) * 65536 + (gz + 32768)); if (!a) continue;
        for (let k = 0; k < a.length; k++) {
          const q = a[k];
          if (q.lx < tx0 || q.lx > tx1 || q.lz < tz0 || q.lz > tz1) continue;
          test(q, ax, az, bx, bz, cx, cz, ay, by, cy, den, up);
        }
      }
    }
    res.walkedTris += nTri;
  }
  res.phase2Ms = +(performance.now() - tP2).toFixed(1);

  // ── decide ────────────────────────────────────────────────────────────────
  // Standing top: the centre's surface; a side point may lift it by a small
  // step (a planter rim, a bumpy rock) but a backrest or a neighbouring
  // fountain rim under two side points must not lift the whole seat. With no
  // surface at the centre, the highest side surface.
  // Clutter (walkers would stand INSIDE drawn geometry): at a point, a
  // crossing in the body column above the top, or the point is inside a
  // closed volume there (nearest crossing below faces down, nearest above
  // faces up). The centre alone decides; side points need SIDE_MIN of 4 and
  // ignore a stride's worth (backrests, rims).
  let dropSum = 0;
  const finals = [];                            // [P, standing top] for the audit
  const inside = (ys, ups, L, ceil) => {
    let bY = -Infinity, bUp = true, aY = Infinity, aUp = false;
    for (let j = 0; j < ys.length; j++) {
      const y = ys[j];
      if (y <= L) { if (y > bY) { bY = y; bUp = ups[j]; } }
      else if (y <= ceil && y < aY) { aY = y; aUp = ups[j]; }
    }
    return bY > -Infinity && !bUp && aY < Infinity && aUp;
  };
  for (let t = 0; t < props.length; t++) {
    const P = props[t];
    if (t >= reached || !P.done) { res.unreached++; finals.push([P, P.top]); continue; }
    const cS = P.stand[0];
    let vis = NaN;
    if (cS === cS) {
      vis = cS;
      for (let k = 1; k < INNER; k++) { const y = P.stand[k]; if (y === y && y > vis && y <= cS + SIDE_STEP) vis = y; }
    } else for (let k = 1; k < INNER; k++) { const y = P.stand[k]; if (y === y && !(y <= vis)) vis = y; }
    const s = vis === vis ? vis : P.top;       // where the walker would stand
    let nearPts = 0, clutC = false, clutN = 0, topC = NaN, topS = -Infinity, noTopS = false, worst = 0;
    for (let k = 0; k < NPTS; k++) {
      const ys = P.all[k], ups = P.ups[k];
      for (let j = 0; j < ys.length; j++) if (ys[j] <= s + BODY) { nearPts++; break; }
      if (k >= INNER) continue;
      const L = s + (k === 0 ? SKIN : SIDE_CLEAR);
      let clut = false;
      for (let j = 0; j < ys.length; j++) {
        const y = ys[j];
        if (y > L && y <= s + BODY + 0.05) { clut = true; if (y - s > worst) worst = y - s; }
      }
      if (!clut && inside(ys, ups, L, P.ceil)) { clut = true; worst = Math.max(worst, BODY); }
      if (clut) {
        if (k === 0) clutC = true; else clutN++;
        // a perchable top: the highest up-facing surface within a double jump
        // with room to stand on it (nothing in the next PERCH_ROOM above)
        let kTop = -Infinity;
        for (let j = 0; j < ys.length; j++) {
          const y = ys[j];
          if (!ups[j] || y <= L || y > s + REACH - 0.3 || y <= kTop) continue;
          let room = true;
          for (let q = 0; q < ys.length; q++) if (ys[q] > y + 0.02 && ys[q] <= y + PERCH_ROOM) { room = false; break; }
          if (room) kTop = y;
        }
        if (k === 0) topC = kTop > -Infinity ? kTop : NaN;
        else if (kTop > -Infinity) { if (kTop > topS) topS = kTop; } else noTopS = true;
      }
    }
    if (clutC || clutN >= SIDE_MIN) {
      // walkers would stand inside drawn geometry: keep it SOLID (perchable
      // on the highest surface within a double-jump, or no top at all)
      // (the centre column's top when the centre is cluttered, else the side columns')
      const tt = clutC ? topC : (noTopS ? NaN : topS);
      const top = tt > s ? tt + 0.02 : NaN;
      core.setSolid(P.i, top); res.solid++;
      if (res.solidList.length < 60) res.solidList.push({ at: [+P.c.x.toFixed(1), +P.c.z.toFixed(1)], why: 'clutter', stand: +s.toFixed(2), rise: +worst.toFixed(2), top: top === top ? +top.toFixed(2) : null, centre: clutC, sides: clutN });
      continue;
    }
    if (vis === vis) {
      // A drawn top that follows the terrain (a log laid along a slope) stands
      // `rel` above the ground under the feet instead of level with its
      // uphill end: the heights spread ≥ 0.25 across the inner points, their
      // heights above the terrain spread less than half of that.
      if (P.legacy && core.setRelativeTop) {
        let nS = 0, aMin = Infinity, aMax = -Infinity, rMin = Infinity, rMax = -Infinity;
        for (let k = 0; k < INNER; k++) {
          const y = P.stand[k]; if (!(y === y)) continue;
          const r = y - P.hp[k];
          nS++; if (y < aMin) aMin = y; if (y > aMax) aMax = y; if (r < rMin) rMin = r; if (r > rMax) rMax = r;
        }
        if (nS >= 3 && aMax - aMin >= 0.25 && rMax - rMin <= 0.5 * (aMax - aMin)) {
          let rel = P.stand[0] === P.stand[0] ? P.stand[0] - P.hp[0] : rMax;
          for (let k = 1; k < INNER; k++) { const y = P.stand[k]; if (!(y === y)) continue; const r = y - P.hp[k]; if (r > rel && r <= rel + SIDE_STEP) rel = r; }
          rel += 0.02;
          if (core.setRelativeTop(P.i, rel)) { res.sloped++; finals.push([P, P.hp[0] + rel]); continue; }
        }
      }
      const newTop = vis + 0.02;
      if (Math.abs(newTop - P.top) < 0.12) { res.kept++; finals.push([P, P.top]); continue; }
      if (core.setVisualTop(P.i, newTop)) {
        if (newTop < P.top) { res.lowered++; dropSum += P.top - newTop; } else res.raised++;
        finals.push([P, newTop]);
      } else { res.kept++; finals.push([P, P.top]); }
      continue;
    }
    // no surface under the prop's inner points
    if (!P.legacy) { res.kept++; finals.push([P, P.top]); continue; }          // the builder's word stands
    if (nearPts <= 1) {
      // nothing drawn at walking height (or a neighbour's edge poking in at a
      // single point): a GHOST — its mesh was culled, or it is buried by the
      // terrain it was sunk into; the collider was left behind
      core.setVisualTop(P.i, NaN, true); res.ghosts++;
      if (res.ghostList.length < 40) res.ghostList.push([+P.c.x.toFixed(1), +P.c.z.toFixed(1)]);
      continue;
    }
    // drawn geometry at walking height around it but no surface to stand on
    // (a newel post seen only by the stair treads around it): never an
    // invisible platform, never walked through
    core.setSolid(P.i, NaN); res.solid++; res.noSurface = (res.noSurface || 0) + 1;
    if (res.solidList.length < 60) res.solidList.push({ at: [+P.c.x.toFixed(1), +P.c.z.toFixed(1)], why: 'no surface', stand: null, rise: 0, top: null, centre: false, sides: 0 });
  }
  res.meanDrop = res.lowered ? +(dropSum / res.lowered).toFixed(2) : 0;

  // ── audit: does the standing top meet the visible surface at the centre? ──
  // Where NPC feet rest at the exact centre (the top, or the ground if the
  // top is below it) vs. the highest up-facing surface drawn under feet + 1.7
  // there (or the ground if nothing is drawn). `grooved`: the centre line
  // falls in a gap (between two chocolate-bar squares) while ≥ 3 side points
  // hold the feet — counted strictly as floats, and listed.
  const A = { n: 0, within: 0, float: 0, sink: 0, grooved: 0, groovedWithin: 0, worstFloat: [], worstSink: [] };
  for (const [P, top] of finals) {
    const feet = Math.max(top, P.ground);
    let surf = P.ground;
    for (const y of P.up0) if (y <= feet + BODY && y > surf) surf = y;
    const gap = feet - surf;
    A.n++;
    if (gap > 0.25) {
      A.float++;
      let sides = 0, best = Infinity;
      if (!P.all[0].length) for (let k = 1; k < INNER; k++) { const y = P.stand[k]; if (y === y) { sides++; best = Math.min(best, Math.abs(feet - y)); } }
      const grooved = sides >= 3;
      if (grooved) { A.grooved++; if (best <= 0.25) A.groovedWithin++; }
      A.worstFloat.push([+P.c.x.toFixed(1), +P.c.z.toFixed(1), +gap.toFixed(2), grooved ? 'groove' : '']);
    } else if (gap < -0.25) { A.sink++; A.worstSink.push([+P.c.x.toFixed(1), +P.c.z.toFixed(1), +gap.toFixed(2)]); }
    else A.within++;
  }
  A.worstFloat = A.worstFloat.sort((a, b) => b[2] - a[2]).slice(0, 8);
  A.worstSink = A.worstSink.sort((a, b) => a[2] - b[2]).slice(0, 8);
  res.audit = A;
  if (trace) res.trace = props;
  res.ms = +(performance.now() - t0).toFixed(1);
  return res;
}
