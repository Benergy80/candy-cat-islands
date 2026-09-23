// ─────────────────────────────────────────────────────────────────────────────
// INSTANCE CULLER — the mobile tier's answer to island-wide InstancedMeshes.
//
// Every vegetation species is ONE InstancedMesh spread over a whole island, so
// three.js can only cull it as a whole: standing in Gumdrop Village you still
// pay for every gummy bear on Frosting Peak, and from the Welcome Plaza every
// candy cane on the other island. On the mobile tier (Contract I) each
// registered mesh is binned into a CELL × CELL grid once, and before every
// render the cells that intersect the camera frustum (and, per species, sit
// within its `maxDist`) are packed to the front of the instance buffers and
// `mesh.count` is set to what is visible. Still one draw call per species —
// usually a quarter of the triangles.
//
//   · Deterministic: the bins are sorted by cell, instances keep their authored
//     order inside a cell, nothing is re-randomised. Blanked (zero-scale)
//     instances are dropped at the snapshot.
//   · No popping: a cell is dropped only when its whole bounding box (every
//     instance's bounding sphere + `pad` for shader sway) is outside the
//     frustum. `maxDist` is only given to ground cover that is a few pixels
//     tall at that range.
//   · Runs in scene.onBeforeRender, i.e. with the camera the frame is actually
//     drawn with (the camera system updates AFTER the world systems), and only
//     re-packs a mesh when its visible cell set changed.
//   · The snapshot is taken at the first render, so every world:ready clearance
//     pass (vegetation/nature blank instances inside rooms and props) has run.
//   · An INSTANCED mesh that casts must be registered with `shadowNear` (see
//     NEAR FIELD below): the shadow camera sees what the main camera does not,
//     so a plain view packing would drop the shadows of trees behind the lens.
//
// The same hook also packs INDEXED meshes (the island ground, the town pools,
// Candyland's island-wide architecture merges): the index buffer is rewritten
// with only the tiles in view and the draw range shrunk to them — still ONE
// draw call per mesh (zero when nothing is in view), where splitting a merge
// into tile/district meshes costs a call per piece, and costs MORE than the
// unsplit desktop mesh in any wide or flying view.
//   · An indexed mesh that CASTS (mesh.castShadow, read every frame) also
//     keeps every tile inside the frustum of each shadow-casting
//     DirectionalLight (the light's NEXT shadow camera, rebuilt privately from
//     the light and its target — never touching light.shadow, whose matrix
//     must stay paired with a clocked shadow map), so a building behind the
//     lens still throws its shadow into the frame. The index is laid out
//     [shadow-only | both | view-only] and the mesh's onBeforeShadow /
//     onBeforeRender hooks point the draw range at the shadow's or the view's
//     run: each pass draws exactly its own tiles, one call at most, never more
//     than the unsplit desktop merge.
//   · Visibility: the culler hides a mesh with nothing to draw and only ever
//     re-shows a mesh IT hid (the camera's lens-inside cull and day/night
//     switches are never overridden).
//   · Raycasts see the WHOLE mesh (a proxy geometry with the full static
//     index — see addIndexed): the camera's occlusion sweep tests lens
//     positions that are not on screen yet.
//   · Instanced meshes still raycast what is packed (hit.instanceId must stay
//     a valid slot for the weapons' per-instance shrink); nothing that tests
//     instanced clouds looks outside the view.
//
// API: const C = createInstanceCuller(ctx, { cell, focus })
//      C.add(mesh, { maxDist, pad, onSnapshot(fullMatrixArray, n), density, shadowNear })
//      C.addIndexed(mesh, tiles)   tiles = [{ box: Box3, index: Uint16Array|Uint32Array }]
//      C.stats() → { meshes, cells, visibleInstances, totalInstances, repacks,
//                    indexed, indexedTris, indexedTrisTotal, shadowLights, near… }
// Zero allocation per frame: every subarray view a repack copies from is made
// once, at the snapshot.
//
// NEAR FIELD (mobile polish, 2026-09-22). The first tier pass thinned ground
// cover by COUNT (a fixed fraction everywhere) and took every tree out of the
// shadow map, so the first 10–25 m in front of the lens — the part a phone
// player actually looks at — was bare ground under floating trees. Both are now
// decided by DISTANCE FROM THE VISITOR (`focus`, default ctx.systems.player
// .position, the camera when there is none):
//   · density: true — the mesh carries an instanced `aRank` in [0,1) (a
//     position hash; −1 = always drawn, e.g. anything owning a collider). Each
//     instance gets a visibility radius from its rank (nfRadius in GLSL, the
//     inverse of densityKeep() here): 100% of instances within 28 u, 60% out to
//     60 u, 25% out to ~120 u, none past 130 u. The VERTEX SHADER scales every
//     instance by its own distance (grow-in over NEAR.FADE = 3 u, ≈0.3 s at a
//     run), so the pixels are continuous as the visitor moves — nothing pops.
//     The CPU side only has to be conservative: inside every cell the
//     instances are sorted by rank, and a repack copies the PREFIX whose rank
//     is below densityKeep(cell distance − MARGIN). Nested sets: walking up to a
//     meadow only ever appends instances.
//   · shadowNear: R — the mesh casts, but its SHADOW PASS draws only the cells
//     within R (+MARGIN) of the visitor that a key light's shadow frustum can
//     see. The instances are laid out [shadow cells | view-only cells]: the
//     main pass draws all of them (a few trees just off-screen cost vertex
//     work, never fragments), the shadow pass draws the prefix
//     (onBeforeShadow swaps mesh.count). Its depth material shrinks each
//     caster over the last NEAR.SHADOW_FADE units (withNearField 'shadow'), so
//     a tree's shadow never pops either.
// withNearField(material, kind) adds the matching vertex code ('density',
// 'shadow', 'blob' = the contact blob fading IN where the real shadow ends,
// 'blobmix' = the same but only for instances with aNear = 1). Every program it
// touches is mobile-only: the desktop tier never creates a culler.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

/** Near-field distances (world units, 3-D, from the visitor). */
export const NEAR = { FADE: 3, SHADOW: 40, SHADOW_FADE: 6, MARGIN: 2 };
/** Shared by every near-field program; written by any culler that has near entries. */
export const nearField = { uFocus: { value: new THREE.Vector3(0, -1e5, 0) } };
/**
 * Fraction of ranks still (partly) drawn at distance d — an instance of rank r
 * is visible iff r < densityKeep(d). Must stay the exact inverse of nfRadius().
 */
export function densityKeep(d) {
  if (d < 31) return 1;
  if (d < 37) return 0.6 + (37 - d) / 15;
  if (d < 63) return 0.6;
  if (d < 71) return 0.25 + (71 - d) * 0.35 / 8;
  if (d < 122) return 0.25;
  if (d < 130) return (130 - d) / 32;
  return 0;
}
const GLSL_NF_RADIUS = /* glsl */`
float nfRadius(float r){
  if (r < 0.0) return 1.0e6;
  if (r < 0.25) return 130.0 - r * 32.0;
  if (r < 0.60) return 71.0 - (r - 0.25) * (8.0 / 0.35);
  return 37.0 - (r - 0.60) * 15.0;
}
`;
const nfOrigin = '(modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz';
const GLSL_NF = {
  density: `
#ifdef USE_INSTANCING
{ float nfR = nfRadius(aRank); transformed *= 1.0 - smoothstep(nfR - ${NEAR.FADE.toFixed(1)}, nfR, distance(${nfOrigin}, uFocus)); }
#endif
`,
  shadow: `
#ifdef USE_INSTANCING
{ transformed *= 1.0 - smoothstep(${(NEAR.SHADOW - NEAR.SHADOW_FADE).toFixed(1)}, ${NEAR.SHADOW.toFixed(1)}, distance(${nfOrigin}, uFocus)); }
#endif
`,
  blob: `
#ifdef USE_INSTANCING
{ transformed *= smoothstep(${(NEAR.SHADOW - NEAR.SHADOW_FADE).toFixed(1)}, ${NEAR.SHADOW.toFixed(1)}, distance(${nfOrigin}, uFocus)); }
#endif
`,
  blobmix: `
#ifdef USE_INSTANCING
{ transformed *= mix(1.0, smoothstep(${(NEAR.SHADOW - NEAR.SHADOW_FADE).toFixed(1)}, ${NEAR.SHADOW.toFixed(1)}, distance(${nfOrigin}, uFocus)), aNear); }
#endif
`,
};
/**
 * Add near-field vertex code to a material (see the header). Chains onto any
 * existing onBeforeCompile and extends the program cache key, never replaces
 * either. The code runs right before <project_vertex>, i.e. after every
 * species' own displacement, so the whole plant (sway included) scales about
 * its base.
 */
export function withNearField(material, kind) {
  const body = GLSL_NF[kind];
  if (!body || !material) return material;
  const prev = material.onBeforeCompile;
  const custom = material.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey;
  const prevKey = material.customProgramCacheKey;
  const baseKey = custom ? null : String(prev);
  const head = 'uniform vec3 uFocus;\n'
    + (kind === 'density' ? 'attribute float aRank;\n' + GLSL_NF_RADIUS : '')
    + (kind === 'blobmix' ? 'attribute float aNear;\n' : '');
  material.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    shader.uniforms.uFocus = nearField.uFocus;
    shader.vertexShader = head + shader.vertexShader.replace('#include <project_vertex>', body + '#include <project_vertex>');
  };
  material.customProgramCacheKey = function () { return (custom ? prevKey.call(this) : baseKey) + '|nf-' + kind; };
  material.needsUpdate = true;
  return material;
}
function copyPrefix(dst, at, src, len) { for (let i = 0; i < len; i++) dst[at + i] = src[i]; }
/** Count of the leading entries of a SORTED array that are < k. */
function below(a, k) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < k) lo = mid + 1; else hi = mid; }
  return lo;
}

// pure scratch (every culler instance keeps its OWN frusta — see run())
const _pv = new THREE.Matrix4();
const _sph = new THREE.Sphere();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _lp = new THREE.Vector3(), _lt = new THREE.Vector3();
const _scam = new THREE.OrthographicCamera();   // stand-in for a light's shadow camera
const MAX_SHADOW_LIGHTS = 2;
const LSIG = 13;                                  // per light: id, flags, light pos, target pos, 6 ortho terms
const shown = (o) => { for (let t = o; t; t = t.parent) if (!t.visible) return false; return true; };
/**
 * Debug/verification switch (never set by the game): `bypass = true` makes
 * every culler treat every cell and tile as visible to both passes, so a
 * harness can render the same frame packed and unpacked and diff the pixels
 * (import('/src/systems/terrain/instcull.js').then((m) => m.cullDebug.bypass = true)).
 */
export const cullDebug = { bypass: false, noMaxDist: false };

/**
 * Tile a merged mesh's TRIANGLES on a CELL × CELL grid (by centroid) for
 * addIndexed(). A non-indexed geometry gets an identity index first (same
 * triangles, same order within a tile). A casting mesh also keeps the tiles its
 * shadow needs (see the header). Returns the tiles; the geometry's index is
 * replaced by a full-length dynamic index the culler rewrites.
 */
export function triangleTiles(geo, cell = 32) {
  const pos = geo.attributes.position, nv = pos.count;
  let src = geo.index ? geo.index.array : null;
  const nIdx = src ? src.length : nv;
  const IA = nv > 65535 ? Uint32Array : Uint16Array;
  const bins = new Map();
  for (let t = 0; t < nIdx; t += 3) {
    const a = src ? src[t] : t, b = src ? src[t + 1] : t + 1, c = src ? src[t + 2] : t + 2;
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const key = (Math.floor(cx / cell) + 4096) * 8192 + (Math.floor(cz / cell) + 4096);
    let B = bins.get(key);
    if (!B) { B = { key, list: [], box: new THREE.Box3() }; bins.set(key, B); }
    B.list.push(a, b, c);
    B.box.expandByPoint(_v.set(pos.getX(a), pos.getY(a), pos.getZ(a)));
    B.box.expandByPoint(_v.set(pos.getX(b), pos.getY(b), pos.getZ(b)));
    B.box.expandByPoint(_v.set(pos.getX(c), pos.getY(c), pos.getZ(c)));
  }
  // ONE static master index sorted by tile (each tile's index is a view into
  // it — the ray proxy of addIndexed() reads it whole), and a dynamic copy the
  // culler rewrites for the GPU
  const order = [...bins.values()].sort((x, y) => x.key - y.key);
  const master = new IA(nIdx);
  const tiles = [];
  let w = 0;
  for (const B of order) { master.set(B.list, w); tiles.push({ box: B.box, index: master.subarray(w, w + B.list.length) }); w += B.list.length; }
  tiles.master = master;
  geo.setIndex(new THREE.BufferAttribute(master.slice(), 1));
  return tiles;
}

export function createInstanceCuller(ctx, opts = {}) {
  const CELL = opts.cell ?? 24;
  const focusOf = opts.focus || (() => ctx.systems?.player?.position || null);
  const entries = [];
  const cells = [];              // global cells: { key, box, cx, cz, vis, dist, svis }
  const cellByKey = new Map();
  const camSig = new Float64Array(33);
  let prepared = false, repacks = 0, frame = 0;
  // near field: the visitor position the current packing was computed for
  const lastFocus = new THREE.Vector3(0, -1e5, 0);
  let nearN = 0, nearCast = 0;
  // this instance's frusta: the lens, and each shadow-casting key light
  const frustum = new THREE.Frustum();
  const shadowFr = [];
  for (let i = 0; i < MAX_SHADOW_LIGHTS; i++) shadowFr.push(new THREE.Frustum());
  const lightSig = new Float64Array(MAX_SHADOW_LIGHTS * LSIG + 1).fill(NaN);
  const dirLights = [];
  let nShadow = 0, lastBypass = 0;

  const indexed = [];
  /** An indexed mesh drawn through per-tile index runs (see the header). */
  function addIndexed(mesh, tiles) {
    const geo = mesh.geometry, idx = geo.index;
    idx.setUsage(THREE.DynamicDrawUsage);
    let total = 0; for (const T of tiles) total += T.index.length;
    // RAYCASTS SEE THE WHOLE MESH. The packed index only holds what THIS frame
    // draws, but the camera's occlusion sweep tests candidate lens positions
    // that are not on screen yet (and the ferry probes piers off-screen): with
    // the packed index they flew straight through walls behind the lens. The
    // proxy shares every vertex attribute and carries the full static index —
    // exactly the desktop mesh's raycast, never uploaded to the GPU.
    let master = tiles.master;
    if (!master) {
      master = new idx.array.constructor(total);
      let w = 0; for (const T of tiles) { master.set(T.index, w); w += T.index.length; }
    }
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (!geo.boundingBox) geo.computeBoundingBox();
    const rayGeo = new THREE.BufferGeometry();
    for (const k in geo.attributes) rayGeo.setAttribute(k, geo.attributes[k]);
    rayGeo.setIndex(new THREE.BufferAttribute(master, 1));
    rayGeo.boundingSphere = geo.boundingSphere; rayGeo.boundingBox = geo.boundingBox;
    mesh.raycast = function (raycaster, intersects) {
      const g = this.geometry;
      this.geometry = rayGeo;
      try { THREE.Mesh.prototype.raycast.call(this, raycaster, intersects); } finally { this.geometry = g; }
    };
    const e = { mesh, tiles, sig: -1, count: -1, total, vis: new Uint8Array(tiles.length), hid: false, main0: 0, main1: 0, shad1: 0, dual: false };
    // per-pass draw ranges (see repackIndexed): three reads geometry.drawRange
    // inside renderBufferDirect, after these hooks. A negative count makes r170
    // return before the draw (no call, no triangles) — used when one pass has
    // nothing of this mesh to draw while the other does.
    e.onMain = function () { const r = geo.drawRange; r.start = e.main0; r.count = e.main1 > e.main0 ? e.main1 - e.main0 : -1; };
    e.onShadow = function () { const r = geo.drawRange; r.start = 0; r.count = e.shad1 > 0 ? e.shad1 : -1; };
    indexed.push(e);
  }
  /**
   * Visibility the culler OWNS: it only ever re-shows a mesh it hid itself, so
   * a mesh someone else hid (the camera's lens-inside cull, a day/night switch)
   * stays hidden.
   */
  function setShown(e, want) {
    if (!want) { if (e.mesh.visible) { e.mesh.visible = false; e.hid = true; } }
    else if (e.hid) { e.mesh.visible = true; e.hid = false; }
  }
  /**
   * Rewrite the index with the tiles in view. A mesh that casts keeps the tiles
   * in any key light's shadow frustum too, laid out as
   *     [ shadow-only | both | view-only ]
   * so the MAIN pass draws [shadow-only end, end) and the SHADOW pass draws
   * [0, both end) — each pass gets exactly its own tiles from one index buffer,
   * one call each, no extra triangles in either.
   */
  function repackIndexed(e) {
    let sig = 0, count = 0;
    const cast = e.mesh.castShadow && nShadow > 0;
    for (let t = 0; t < e.tiles.length; t++) {
      const box = e.tiles[t].box;
      let v = cullDebug.bypass || frustum.intersectsBox(box) ? 1 : 0;
      if (cast) for (let k = 0; k < nShadow; k++) if (cullDebug.bypass || shadowFr[k].intersectsBox(box)) { v |= 2; break; }
      e.vis[t] = v;
      if (v) { sig = (sig + (t + 1) * (v === 1 ? 2654435761 : v === 2 ? 1597334677 : 3812015801)) % 4294967291; count += e.tiles[t].index.length; }
    }
    if (sig === e.sig && count === e.count && cast === e.dual) return;
    e.sig = sig; e.count = count; repacks++;
    const geo = e.mesh.geometry, dst = geo.index.array;
    let w = 0;
    if (cast) {
      for (let t = 0; t < e.tiles.length; t++) if (e.vis[t] === 2) { dst.set(e.tiles[t].index, w); w += e.tiles[t].index.length; }
      e.main0 = w;
      for (let t = 0; t < e.tiles.length; t++) if (e.vis[t] === 3) { dst.set(e.tiles[t].index, w); w += e.tiles[t].index.length; }
      e.shad1 = w;
      for (let t = 0; t < e.tiles.length; t++) if (e.vis[t] === 1) { dst.set(e.tiles[t].index, w); w += e.tiles[t].index.length; }
      e.main1 = w;
    } else {
      for (let t = 0; t < e.tiles.length; t++) if (e.vis[t]) { dst.set(e.tiles[t].index, w); w += e.tiles[t].index.length; }
      e.main0 = 0; e.main1 = w; e.shad1 = w;
    }
    if (cast !== e.dual) {
      e.dual = cast;
      e.mesh.onBeforeRender = cast ? e.onMain : THREE.Object3D.prototype.onBeforeRender;
      e.mesh.onBeforeShadow = cast ? e.onShadow : THREE.Object3D.prototype.onBeforeShadow;
    }
    // resting range = the view's; an empty one is a NEGATIVE count, so a mesh
    // someone else re-shows (the camera un-culling it) still issues no call
    geo.setDrawRange(e.main0, e.main1 > e.main0 ? e.main1 - e.main0 : -1);
    setShown(e, w > 0);
    if (w > 0) { geo.index.clearUpdateRanges(); geo.index.addUpdateRange(0, w); geo.index.needsUpdate = true; }
  }

  function add(mesh, o = {}) {
    if (!mesh || !mesh.isInstancedMesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (const k in mesh.geometry.attributes) {
      const a = mesh.geometry.attributes[k];
      if (a.isInstancedBufferAttribute) a.setUsage(THREE.DynamicDrawUsage);
    }
    const density = !!o.density && !!mesh.geometry.attributes.aRank?.isInstancedBufferAttribute;
    const e = {
      mesh, maxDist: o.maxDist ?? Infinity, pad: o.pad ?? 1.5, onSnapshot: o.onSnapshot || null,
      density, shadowNear: o.shadowNear > 0 ? o.shadowNear : 0,
      n: 0, ranges: null, rvis: null, rcnt: null, attrs: null, masters: null, mat: null, sig: -1, count: -1, scount: 0, hid: false,
    };
    e.near = e.density || e.shadowNear > 0;
    if (e.near) nearN++;
    if (e.shadowNear > 0) {
      nearCast++;
      // the shadow pass draws the [shadow cells] prefix only (see repack)
      mesh.onBeforeShadow = function () { if (e.count >= 0) this.count = e.scount; };
      mesh.onAfterShadow = function () { if (e.count >= 0) this.count = e.count; };
    }
    entries.push(e);
  }

  const cellOf = (x, z) => {
    const key = (Math.floor(x / CELL) + 4096) * 8192 + (Math.floor(z / CELL) + 4096);
    let c = cellByKey.get(key);
    if (!c) {
      c = { key, box: new THREE.Box3(), cx: (Math.floor(x / CELL) + 0.5) * CELL, cz: (Math.floor(z / CELL) + 0.5) * CELL, vis: false, idx: 0, dist: 1e9, svis: false, keep: 1 };
      cellByKey.set(key, c); cells.push(c);
    }
    return c;
  };

  function prepare() {
    prepared = true;
    for (const e of entries) {
      const m = e.mesh, geo = m.geometry, src = m.instanceMatrix.array, n0 = m.count;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const gs = geo.boundingSphere;
      const attrs = [];
      for (const k in geo.attributes) { const a = geo.attributes[k]; if (a.isInstancedBufferAttribute) attrs.push(a); }
      if (m.instanceColor) attrs.push(m.instanceColor);
      // bin (skipping blanked instances), then order the bins by cell key
      const bins = new Map();
      const mx = new THREE.Matrix4();
      for (let i = 0; i < n0; i++) {
        const o = i * 16;
        const s = Math.max(Math.hypot(src[o], src[o + 1], src[o + 2]), Math.hypot(src[o + 4], src[o + 5], src[o + 6]), Math.hypot(src[o + 8], src[o + 9], src[o + 10]));
        if (!(s > 1e-6)) continue;
        const c = cellOf(src[o + 12], src[o + 14]);
        mx.fromArray(src, o);
        _sph.copy(gs).applyMatrix4(mx);
        _sph.radius += e.pad;
        c.box.expandByPoint(_v.set(_sph.center.x - _sph.radius, _sph.center.y - _sph.radius, _sph.center.z - _sph.radius));
        c.box.expandByPoint(_v.set(_sph.center.x + _sph.radius, _sph.center.y + _sph.radius, _sph.center.z + _sph.radius));
        let b = bins.get(c.key); if (!b) { b = { cell: c, list: [] }; bins.set(c.key, b); }
        b.list.push(i);
      }
      const order = [...bins.values()].sort((a, b) => a.cell.key - b.cell.key);
      // near-field density: inside a cell the instances go in RANK order, so
      // "every instance drawn at this distance" is always a prefix of the cell
      const rankAttr = e.density ? geo.attributes.aRank : null;
      if (rankAttr) {
        const rk = rankAttr.array;
        for (const b of order) b.list.sort((i, j) => (rk[i] - rk[j]) || (i - j));
      }
      let n = 0; for (const b of order) n += b.list.length;
      const mat = new Float32Array(n * 16);
      const masters = attrs.map((a) => new a.array.constructor(n * a.itemSize));
      const ranges = [];
      let w = 0;
      for (const b of order) {
        const start = w;
        for (const i of b.list) {
          for (let k = 0; k < 16; k++) mat[w * 16 + k] = src[i * 16 + k];
          for (let a = 0; a < attrs.length; a++) {
            const sz = attrs[a].itemSize, sa = attrs[a].array, da = masters[a];
            for (let k = 0; k < sz; k++) da[w * sz + k] = sa[i * sz + k];
          }
          w++;
        }
        ranges.push({ cell: b.cell, start, count: w - start, matView: null, attrViews: null });
      }
      // the views a repack copies from, made ONCE (a subarray per range per
      // attribute per repack was ~1200 short-lived objects every time the
      // visible cell set changed, i.e. most frames while walking)
      const rankIdx = rankAttr ? attrs.indexOf(rankAttr) : -1;
      for (const R of ranges) {
        R.matView = mat.subarray(R.start * 16, (R.start + R.count) * 16);
        R.attrViews = masters.map((ma, a) => ma.subarray(R.start * attrs[a].itemSize, (R.start + R.count) * attrs[a].itemSize));
        R.rankView = rankIdx >= 0 ? R.attrViews[rankIdx] : null;
      }
      if (rankIdx < 0) e.density = false;
      Object.assign(e, { n, ranges, rvis: new Uint8Array(ranges.length), rcnt: new Uint32Array(ranges.length), attrs, masters, mat, sig: -1, count: -1, scount: 0 });
      if (e.onSnapshot) e.onSnapshot(mat, n);
    }
    cells.forEach((c, i) => { c.idx = i; });
    // the key lights a casting indexed mesh must keep its shadow for (their
    // castShadow / visibility is re-read every frame: the sky swaps sun ↔ moon)
    dirLights.length = 0;
    ctx.scene.traverse((o) => { if (o.isDirectionalLight) dirLights.push(o); });
  }

  /**
   * Refresh the frusta of the shadow-casting directional lights. Returns true
   * when any of them (or the set) changed since the last frame. The frustum is
   * the one three's shadow pass will build from the light's CURRENT pose; the
   * light's own shadow camera is never touched (with a clocked shadow map its
   * matrix must stay paired with the map it drew).
   */
  const put = (j, v) => { if (lightSig[j] !== v) { lightSig[j] = v; return true; } return false; };
  function shadowLights() {
    let n = 0, changed = false;
    for (let i = 0; i < dirLights.length && n < MAX_SHADOW_LIGHTS; i++) {
      const L = dirLights[i];
      if (!L.castShadow || !L.parent || !shown(L)) continue;
      const a = L.matrixWorld.elements, t = L.target.matrixWorld.elements, pm = L.shadow.camera.projectionMatrix.elements;
      const o = n * LSIG;
      let c = put(o, i);
      c = put(o + 1, a[12]) || c; c = put(o + 2, a[13]) || c; c = put(o + 3, a[14]) || c;
      c = put(o + 4, t[12]) || c; c = put(o + 5, t[13]) || c; c = put(o + 6, t[14]) || c;
      c = put(o + 7, pm[0]) || c; c = put(o + 8, pm[5]) || c; c = put(o + 9, pm[10]) || c;
      c = put(o + 10, pm[12]) || c; c = put(o + 11, pm[13]) || c; c = put(o + 12, pm[14]) || c;
      if (c) {
        _lp.setFromMatrixPosition(L.matrixWorld); _lt.setFromMatrixPosition(L.target.matrixWorld);
        _scam.up.copy(L.shadow.camera.up);
        _scam.position.copy(_lp); _scam.lookAt(_lt); _scam.updateMatrixWorld(true);
        _pv.multiplyMatrices(L.shadow.camera.projectionMatrix, _scam.matrixWorldInverse);
        shadowFr[n].setFromProjectionMatrix(_pv);
        changed = true;
      }
      n++;
    }
    if (put(MAX_SHADOW_LIGHTS * LSIG, n)) changed = true;
    nShadow = n;
    return changed;
  }

  function camChanged(cam) {
    const a = cam.matrixWorld.elements, b = cam.projectionMatrix.elements;
    let changed = false;
    for (let i = 0; i < 16; i++) { if (camSig[i] !== a[i]) { camSig[i] = a[i]; changed = true; } }
    for (let i = 0; i < 16; i++) { if (camSig[16 + i] !== b[i]) { camSig[16 + i] = b[i]; changed = true; } }
    return changed;
  }

  function repack(e, camX, camZ) {
    // signature of the visible range set (order is fixed, so a sum of hashed
    // indices × flags + per-range counts identifies it)
    let sig = 0, count = 0, scount = 0;
    const md2 = e.maxDist * e.maxDist, rvis = e.rvis, rcnt = e.rcnt;
    const cast = e.shadowNear > 0 && e.mesh.castShadow && nShadow > 0;
    const dens = e.density && !cullDebug.bypass;
    const sReach = e.shadowNear + NEAR.MARGIN;
    for (let r = 0; r < e.ranges.length; r++) {
      const R = e.ranges[r], c = R.cell;
      let v = c.vis ? 1 : 0;
      if (v && md2 !== Infinity && !cullDebug.bypass && !cullDebug.noMaxDist) {
        const dx = Math.max(c.box.min.x - camX, 0, camX - c.box.max.x), dz = Math.max(c.box.min.z - camZ, 0, camZ - c.box.max.z);
        if (dx * dx + dz * dz > md2) v = 0;
      }
      if (cast && (cullDebug.bypass || (c.svis && c.dist < sReach))) v |= 2;
      rvis[r] = 0;
      if (!v) continue;
      // near-field density: the rank-sorted prefix still drawn at this distance
      const n = dens ? below(R.rankView, c.keep) : R.count;
      if (!n) continue;
      rvis[r] = v; rcnt[r] = n;
      sig = (sig + (r + 1) * (v === 1 ? 2654435761 : v === 2 ? 1597334677 : 3812015801) + n * 40503) % 4294967291;
      count += n; if (v & 2) scount += n;
    }
    const m = e.mesh;
    if (sig === e.sig && count === e.count && scount === e.scount) return;
    e.sig = sig; e.count = count; e.scount = scount;
    repacks++;
    const dst = m.instanceMatrix.array, attrs = e.attrs;
    let w = 0;
    // casting: [cells the shadow pass needs | view-only cells]; the shadow pass
    // draws the prefix, the main pass all of it
    for (let pass = cast ? 0 : 1; pass < 2; pass++) {
      for (let r = 0; r < e.ranges.length; r++) {
        const v = rvis[r];
        if (!v || (cast && (pass === 0) !== ((v & 2) !== 0))) continue;
        const R = e.ranges[r], n = rcnt[r];
        if (n === R.count) {
          dst.set(R.matView, w * 16);
          for (let a = 0; a < attrs.length; a++) attrs[a].array.set(R.attrViews[a], w * attrs[a].itemSize);
        } else {
          // a partial (near-field) prefix: copied by hand — a subarray per
          // range per repack would be garbage on every step the visitor takes
          copyPrefix(dst, w * 16, R.matView, n * 16);
          for (let a = 0; a < attrs.length; a++) { const sz = attrs[a].itemSize; copyPrefix(attrs[a].array, w * sz, R.attrViews[a], n * sz); }
        }
        w += n;
      }
    }
    m.count = w;
    setShown(e, w > 0);
    if (w > 0) {
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, w * 16); m.instanceMatrix.needsUpdate = true;
      for (const a of e.attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, w * a.itemSize); a.needsUpdate = true; }
    }
  }

  function run(camera) {
    if (!entries.length && !indexed.length) return;
    if (!prepared) prepare();
    frame++;
    let casting = false;
    for (let i = 0; i < indexed.length; i++) if (indexed[i].mesh.castShadow) { casting = true; break; }
    if (!casting && nearCast) for (let i = 0; i < entries.length; i++) { const e = entries[i]; if (e.shadowNear > 0 && e.mesh.castShadow) { casting = true; break; } }
    const lit = casting ? shadowLights() : false;
    if (!casting) nShadow = 0;
    let moved = camChanged(camera);
    const dbg = (cullDebug.bypass ? 1 : 0) + (cullDebug.noMaxDist ? 2 : 0);
    if (dbg !== lastBypass) { lastBypass = dbg; moved = true; }
    // the visitor: the shader reads the exact position every frame; the packing
    // is only redone once they have moved half a unit (MARGIN covers the rest)
    let fmoved = false;
    if (nearN) {
      const fp = focusOf();
      if (fp && fp.isVector3) _f.copy(fp); else _f.setFromMatrixPosition(camera.matrixWorld);
      nearField.uFocus.value.copy(_f);
      if (_f.distanceToSquared(lastFocus) > 0.25) { lastFocus.copy(_f); fmoved = true; }
    }
    if (!moved && !lit && !fmoved) return;
    if (moved) {
      _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(_pv);
      for (let i = 0; i < cells.length; i++) cells[i].vis = cullDebug.bypass || frustum.intersectsBox(cells[i].box);
    }
    if (nearN && (moved || fmoved || lit)) {
      const sReach = NEAR.SHADOW + NEAR.MARGIN + 1;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        c.dist = c.box.distanceToPoint(lastFocus);
        // quantised to 2 u so a cell's prefix only changes on a step, not on
        // every half-unit the visitor walks (conservative: floor → larger keep)
        c.keep = densityKeep(Math.floor(Math.max(0, c.dist - NEAR.MARGIN) * 0.5) * 2);
        let sv = false;
        if (nearCast && nShadow && c.dist < sReach) for (let k = 0; k < nShadow; k++) if (shadowFr[k].intersectsBox(c.box)) { sv = true; break; }
        c.svis = sv;
      }
    }
    const px = camera.matrixWorld.elements[12], pz = camera.matrixWorld.elements[14];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (moved || (e.near && (fmoved || (lit && e.shadowNear > 0)))) repack(e, px, pz);
    }
    // a key-light move only re-tests the casting meshes
    for (let i = 0; i < indexed.length; i++) if (moved || indexed[i].mesh.castShadow) repackIndexed(indexed[i]);
  }

  // Chain onto scene.onBeforeRender (called by WebGLRenderer.render with the
  // camera of the frame, before projection/culling). Never replaces a hook.
  const scene = ctx.scene;
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, target) {
    if (prev) prev.call(this, renderer, sc, camera, target);
    if (camera && camera.isCamera && !target) { try { run(camera); } catch (err) { if (!run.warned) { run.warned = true; console.error('[instcull] failed', err); } } }
  };

  return {
    add, addIndexed,
    stats() {
      let vis = 0, tot = 0, ivis = 0, itot = 0;
      for (const e of entries) { vis += Math.max(0, e.count); tot += e.n; }
      for (const e of indexed) { ivis += Math.max(0, e.count); itot += e.total; }
      let near = 0, shadowInst = 0;
      for (const e of entries) { if (e.near) near++; if (e.shadowNear > 0) shadowInst += Math.max(0, e.scount); }
      return {
        meshes: entries.length, cells: cells.length, visibleInstances: vis, totalInstances: tot, repacks, frame,
        indexed: indexed.length, indexedTris: Math.round(ivis / 3), indexedTrisTotal: Math.round(itot / 3), shadowLights: nShadow,
        nearEntries: near, shadowInstances: shadowInst,
      };
    },
  };
}
