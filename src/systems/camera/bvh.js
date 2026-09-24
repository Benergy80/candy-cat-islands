// camera/bvh.js — the capsule sweep's triangle accelerator (BRIEF Contract J, CAMERA_SPEC A13).
//
// The sweep raycasts merged districts (cat_heights_matte is 50k triangles, candyArch_icing 36k) and three's
// Mesh.raycast tests every triangle of every one: ~90 ns a triangle on the M1 Pro, 4.6 ms a ray on the Heights,
// 14 ms for the three body rays of ONE candidate — the 6 Hz sweep-frame hitch. This keeps a static bounding
// volume hierarchy per geometry and answers the same question in tens of microseconds.
//
// SAME ANSWER, BIT FOR BIT. raycast(mesh, raycaster, out) pushes exactly the intersections three's Mesh.raycast
// would push, in the same order: the same early rejects (world bounding sphere, far, local bounding box), the same
// local ray (copy(ray).applyMatrix4(inverse(matrixWorld))), the same vertex reads (fromBufferAttribute), the same
// Ray.intersectTriangle call with the same winding and culling per material side, the same world distance and
// near/far filter, the same group / drawRange iteration (only the order the tree visits the triangles differs, and
// the hits are put back in three's iteration order before they are pushed). The tree only decides WHICH triangles
// are worth the test; its boxes are padded outward so it can never skip one three would have hit. What the hit
// objects carry: distance, point, object, face { a, b, c, materialIndex }, faceIndex — everything the camera reads
// (no uv / normal / barycoord: nothing in the sweep reads them). They come from a pool: valid until the next call.
//
// ELIGIBLE: a plain Mesh (not instanced / skinned / batched), three's own raycast (no per-object or subclass
// override; a timing wrapper on Mesh.prototype is fine), no morph
// positions, ≥ minTris triangles. Anything else — and any eligible mesh whose tree is not built yet — goes to
// mesh.raycast(), so whether a tree exists changes what a sweep COSTS, never what it finds (A12: determinism).
// A tree is keyed on its geometry + position / index (object and version) + drawRange + groups + whether the
// material is an array; any change drops it and it is rebuilt from the queue. A geometry that keeps changing
// (≥ 3 rebuilds) is left to three for good.
//
// BUILDING never costs a frame: want(mesh) queues a geometry, work(ms) builds for at most `ms` (the camera
// gives it what is left of its own frame budget), resumably — the entry pass in chunks, the split pass one node
// at a time (a node's pass is O(its triangles): the root of a 50k merge is ~1 ms). build(mesh) builds at once
// (QA / tools). Memory: ~16 bytes a triangle (the leaf-ordered triangle starts, a Float32 box and two Uint32 per
// node at ≤ 8 triangles a leaf): 9.5 MB for the 0.62M sweepable triangles of both islands, built in ~0.2 s at
// world:ready on the M1 Pro; stats() reports it.
import * as THREE from 'three';

const LEAF = 8;

export function createRayAccel({ minTris = 256, leaf = LEAF } = {}) {
  const trees = new WeakMap();          // geometry → tree (built) or job (building)
  const queue = [];                     // jobs waiting / in progress (front = next)
  const refused = new WeakSet();        // geometries left to three for good (volatile)
  const churn = new WeakMap();          // geometry → rebuild count
  const st = { trees: 0, tris: 0, bytes: 0, builds: 0, rebuilds: 0, accelCalls: 0, fallbackCalls: 0, buildMs: 0 };

  // ── eligibility + the key a tree is valid for ────────────────────────────
  // three's own raycast: nothing between the mesh and Mesh.prototype defines one (an instance's own
  // `raycast = () => {}` opt-out, a subclass's override). A wrapper on Mesh.prototype itself (a profiler's
  // timing hook, tools/fpsbench.mjs) is still three's raycast underneath and does not count.
  const ownRaycast = (o) => {
    for (let q = o; q && q !== THREE.Mesh.prototype; q = Object.getPrototypeOf(q)) if (Object.prototype.hasOwnProperty.call(q, 'raycast')) return false;
    return true;
  };
  // THE RAY PROXY convention: a mesh whose own raycast is "three's Mesh.raycast with this.geometry swapped for a
  // static proxy" (terrain/instcull.js's packed merges on the mobile tier: the drawn index changes with the view,
  // the proxy holds the full static one) may publish that proxy as userData.rayGeometry; the tree is then built on
  // the proxy and the answer is the one its raycast gives. Without it such a mesh is simply left to its raycast.
  const geoOf = (o) => {
    if (ownRaycast(o)) return o.geometry;
    const rg = o.userData && o.userData.rayGeometry;
    return rg && rg.isBufferGeometry && Object.prototype.hasOwnProperty.call(o, 'raycast') && Object.getPrototypeOf(o) === THREE.Mesh.prototype ? rg : null;
  };
  function triCount(g) {
    const ix = g.index, pos = g.attributes && g.attributes.position;
    return ((ix ? ix.count : (pos ? pos.count : 0)) / 3) | 0;
  }
  function eligible(o) {
    if (!o || !o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh) return false;
    const g = geoOf(o);
    if (!g || !g.attributes || !g.attributes.position || refused.has(g)) return false;
    const mp = g.morphAttributes && g.morphAttributes.position;
    if (mp && mp.length && o.morphTargetInfluences) return false;
    return triCount(g) >= minTris;
  }
  function groupsSig(g) {
    const gr = g.groups;
    let s = gr.length;
    for (let i = 0; i < gr.length; i++) s = (s * 31 + gr[i].start * 7 + gr[i].count * 13 + gr[i].materialIndex) % 2147483647;
    return s;
  }
  // (an interleaved attribute carries its version on its buffer)
  const ver = (a) => (a ? (a.isInterleavedBufferAttribute ? a.data.version : a.version) : -1);
  function matches(t, g, arr) {
    const pos = g.attributes.position, ix = g.index;
    return t.pos === pos && t.posV === ver(pos) && t.ix === ix && t.ixV === ver(ix)
      && t.drS === g.drawRange.start && t.drC === g.drawRange.count && t.arr === arr && t.gSig === groupsSig(g) && t.nG === g.groups.length;
  }

  // ── building (resumable) ─────────────────────────────────────────────────
  function newJob(g, arr) {
    const pos = g.attributes.position, ix = g.index, dr = g.drawRange;
    // the tested triangles, in three's iteration order: (group ordinal, j) — j = the index-buffer (or vertex)
    // position of the triangle's first corner, stepping by 3 from each range's start exactly as three does
    const ranges = [];
    const n0 = ix ? ix.count : pos.count;
    if (arr) {
      for (let i = 0; i < g.groups.length; i++) {
        const gr = g.groups[i];
        const s = Math.max(gr.start, dr.start), e = Math.min(n0, Math.min(gr.start + gr.count, dr.start + dr.count));
        if (e > s) ranges.push(i, s, e);
      }
    } else {
      const s = Math.max(0, dr.start), e = Math.min(n0, dr.start + dr.count);
      if (e > s) ranges.push(-1, s, e);
    }
    let n = 0;
    for (let r = 0; r < ranges.length; r += 3) n += Math.ceil((ranges[r + 2] - ranges[r + 1]) / 3);
    return {
      job: true, g, arr, n, ranges, r: 0, j: ranges.length ? ranges[1] : 0, k: 0, phase: 0,
      pos, posV: ver(pos), ix, ixV: ver(ix), drS: dr.start, drC: dr.count, gSig: groupsSig(g), nG: g.groups.length,
      jj: new Uint32Array(n), gi: arr ? new Uint16Array(n) : null, box: new Float32Array(n * 6),
      nodeBox: null, nodeInfo: null, nodes: 0, stack: [], ms: 0,
    };
  }
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  /** Phase 0: each triangle's j (+ group) and box, `lim` triangles at a time. */
  function stepEntries(J, lim) {
    const pos = J.pos, ix = J.ix, R = J.ranges, box = J.box;
    let done = 0;
    while (J.r < R.length && done < lim) {
      const e = R[J.r + 2];
      if (J.j >= e) { J.r += 3; if (J.r < R.length) J.j = R[J.r + 1]; continue; }
      const j = J.j, k = J.k;
      // (a corner past the buffer's end reads NaN in three too: such a triangle can never be hit, so its box is
      // left empty-but-finite at the origin and it simply never passes a test)
      const a = ix ? ix.getX(j) : j, b = ix ? ix.getX(j + 1) : j + 1, c = ix ? ix.getX(j + 2) : j + 2;
      vA.fromBufferAttribute(pos, a); vB.fromBufferAttribute(pos, b); vC.fromBufferAttribute(pos, c);
      let x0 = Math.min(vA.x, vB.x, vC.x), y0 = Math.min(vA.y, vB.y, vC.y), z0 = Math.min(vA.z, vB.z, vC.z);
      let x1 = Math.max(vA.x, vB.x, vC.x), y1 = Math.max(vA.y, vB.y, vC.y), z1 = Math.max(vA.z, vB.z, vC.z);
      if (!(x0 <= x1 && y0 <= y1 && z0 <= z1)) { x0 = y0 = z0 = x1 = y1 = z1 = 0; }
      const o6 = k * 6;
      box[o6] = x0; box[o6 + 1] = y0; box[o6 + 2] = z0; box[o6 + 3] = x1; box[o6 + 4] = y1; box[o6 + 5] = z1;
      J.jj[k] = j;
      if (J.gi) J.gi[k] = R[J.r];
      J.k++; J.j += 3; done++;
    }
    if (J.r >= R.length) {
      J.n = J.k;                                   // (ceil() above is exact; keep the count we actually wrote)
      J.order = new Uint32Array(J.n);
      for (let i = 0; i < J.n; i++) J.order[i] = i;
      const cap = Math.max(1, Math.ceil(J.n / Math.max(1, leaf >> 1)) * 2 + 1);
      J.nodeBox = new Float32Array(cap * 6); J.nodeInfo = new Uint32Array(cap * 2);
      if (J.n) J.stack.push(0x7fffffff, 0, 0, J.n, 0);   // parent (none), isRight, start, end, depth
      J.phase = 1;
    }
  }
  const LEAF_BIT = 0x80000000;
  function growNodes(J) {
    const cap = (J.nodeInfo.length >> 1) * 2;
    const nb = new Float32Array(cap * 6); nb.set(J.nodeBox); J.nodeBox = nb;
    const ni = new Uint32Array(cap * 2); ni.set(J.nodeInfo); J.nodeInfo = ni;
  }
  /** Phase 1: one node — its box (padded outward), then a leaf or a split on the longest centroid axis. */
  function stepNode(J) {
    const S = J.stack;
    const depth = S.pop(), end = S.pop(), start = S.pop(), isRight = S.pop(), parent = S.pop();
    if (J.nodes >= (J.nodeInfo.length >> 1)) growNodes(J);
    const idx = J.nodes++;
    if (isRight) J.nodeInfo[parent * 2] = idx;
    const box = J.box, ord = J.order;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let cx0 = Infinity, cy0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cz1 = -Infinity;
    for (let i = start; i < end; i++) {
      const o6 = ord[i] * 6;
      const a = box[o6], b = box[o6 + 1], c = box[o6 + 2], d = box[o6 + 3], e = box[o6 + 4], f = box[o6 + 5];
      if (a < x0) x0 = a; if (b < y0) y0 = b; if (c < z0) z0 = c;
      if (d > x1) x1 = d; if (e > y1) y1 = e; if (f > z1) z1 = f;
      const mx = a + d, my = b + e, mz = c + f;       // 2 × centroid
      if (mx < cx0) cx0 = mx; if (mx > cx1) cx1 = mx;
      if (my < cy0) cy0 = my; if (my > cy1) cy1 = my;
      if (mz < cz0) cz0 = mz; if (mz > cz1) cz1 = mz;
    }
    // outward padding: the Float32 store rounds, and a box must never shrink past a triangle three would hit
    const pad = (v) => 1e-4 + Math.abs(v) * 1e-6;
    const nb = J.nodeBox, o6 = idx * 6;
    nb[o6] = x0 - pad(x0); nb[o6 + 1] = y0 - pad(y0); nb[o6 + 2] = z0 - pad(z0);
    nb[o6 + 3] = x1 + pad(x1); nb[o6 + 4] = y1 + pad(y1); nb[o6 + 5] = z1 + pad(z1);
    const count = end - start;
    if (count <= leaf) { J.nodeInfo[idx * 2] = start; J.nodeInfo[idx * 2 + 1] = count | LEAF_BIT; return; }
    // split: spatial median of the centroids on their longest axis; a degenerate split halves the range
    const ex = cx1 - cx0, ey = cy1 - cy0, ez = cz1 - cz0;
    const ax = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const mid2 = ax === 0 ? (cx0 + cx1) * 0.5 : ax === 1 ? (cy0 + cy1) * 0.5 : (cz0 + cz1) * 0.5;
    let i = start, j = end - 1;
    if (depth < 48 && (ax === 0 ? ex : ax === 1 ? ey : ez) > 0) {
      while (i <= j) {
        const o = ord[i] * 6, m = box[o + ax] + box[o + 3 + ax];
        if (m < mid2) i++;
        else { const t = ord[i]; ord[i] = ord[j]; ord[j] = t; j--; }
      }
    }
    let split = i;
    if (split <= start || split >= end) split = (start + end) >> 1;
    J.nodeInfo[idx * 2] = 0; J.nodeInfo[idx * 2 + 1] = 0;   // internal: [right child, 0]; left = idx + 1
    // LIFO: the right half is pushed first so the left half is the very next node (idx + 1)
    S.push(idx, 1, split, end, depth + 1);
    S.push(idx, 0, start, split, depth + 1);
  }
  function finish(J) {
    const nodes = J.nodes;
    const t = {
      job: false, g: J.g, arr: J.arr, pos: J.pos, posV: J.posV, ix: J.ix, ixV: J.ixV, drS: J.drS, drC: J.drC, gSig: J.gSig, nG: J.nG,
      n: J.n, nodes,
      nodeBox: J.nodeBox.slice(0, nodes * 6), nodeInfo: J.nodeInfo.slice(0, nodes * 2),
      jj: new Uint32Array(J.n), gi: J.gi ? new Uint16Array(J.n) : null,
    };
    // triangles in leaf order: a leaf's run is contiguous
    for (let i = 0; i < J.n; i++) { const e = J.order[i]; t.jj[i] = J.jj[e]; if (t.gi) t.gi[i] = J.gi[e]; }
    trees.set(J.g, t);
    st.trees++; st.tris += J.n; st.bytes += t.nodeBox.byteLength + t.nodeInfo.byteLength + t.jj.byteLength + (t.gi ? t.gi.byteLength : 0);
    st.builds++; st.buildMs += J.ms;
    return t;
  }
  /** Advance one job until `deadline` (performance.now()); true when it finished. */
  function advance(J, deadline) {
    const t0 = performance.now();
    while (true) {
      if (J.phase === 0) stepEntries(J, 2048);
      else if (J.stack.length) stepNode(J);
      else { J.ms += performance.now() - t0; finish(J); return true; }
      if (performance.now() >= deadline) { J.ms += performance.now() - t0; return false; }
    }
  }
  function dropTree(g) {
    const t = trees.get(g);
    if (t && !t.job) { st.trees--; st.tris -= t.n; st.bytes -= t.nodeBox.byteLength + t.nodeInfo.byteLength + t.jj.byteLength + (t.gi ? t.gi.byteLength : 0); }
    trees.delete(g);
  }

  /** Queue a tree for this mesh's geometry (no-op when it has a current one, is queued, or is not eligible). */
  function want(o) {
    if (!eligible(o)) return false;
    const g = geoOf(o), arr = Array.isArray(o.material);
    const t = trees.get(g);
    if (t) {
      if (matches(t, g, arr)) return true;                  // current (a built tree, or a job for exactly this)
      // stale: the geometry (or its material array-ness) changed under it
      if (!t.job) { const n = (churn.get(g) || 0) + 1; churn.set(g, n); st.rebuilds++; if (n >= 3) { dropTree(g); refused.add(g); return false; } }
      else { const qi = queue.indexOf(t); if (qi >= 0) queue.splice(qi, 1); }
      dropTree(g);
    }
    const J = newJob(g, arr);
    trees.set(g, J);
    queue.push(J);
    return true;
  }
  /** Build queued trees for at most `ms` milliseconds. Returns how many are still waiting. */
  function work(ms) {
    if (!queue.length || !(ms > 0)) return queue.length;
    const deadline = performance.now() + ms;
    while (queue.length) {
      const J = queue[0];
      if (trees.get(J.g) !== J) { queue.shift(); continue; }       // dropped meanwhile
      if (!advance(J, deadline)) break;
      queue.shift();
      if (performance.now() >= deadline) break;
    }
    return queue.length;
  }
  /** want(), and put its job at the front of the queue (a candidate the sweep is raycasting by brute force now). */
  function urgent(o) {
    if (!want(o)) return false;
    const t = trees.get(geoOf(o));
    if (!t.job) return true;
    const qi = queue.indexOf(t);
    if (qi > 0) { queue.splice(qi, 1); queue.unshift(t); }
    return true;
  }
  /** Build this mesh's tree now, whatever it costs (QA / tools). */
  function build(o) {
    if (!want(o)) return false;
    const t = trees.get(geoOf(o));
    if (!t.job) return true;
    advance(t, Infinity);
    const qi = queue.indexOf(t); if (qi >= 0) queue.splice(qi, 1);
    return true;
  }

  // ── the query: Mesh.raycast, mirrored ────────────────────────────────────
  const _sphere = new THREE.Sphere(), _ray = new THREE.Ray(), _inv = new THREE.Matrix4(), _at = new THREE.Vector3();
  const _pt = new THREE.Vector3(), _pw = new THREE.Vector3(), _dw = new THREE.Vector3();
  const stack = new Int32Array(256);
  // pooled hits (valid until the next raycast() call); `ord` = three's iteration order key
  const pool = [];
  let used = 0;
  function takeHit() {
    let h = pool[used];
    if (!h) { h = { distance: 0, point: new THREE.Vector3(), object: null, face: { a: 0, b: 0, c: 0, materialIndex: 0 }, faceIndex: 0, ord: 0 }; pool[used] = h; }
    used++;
    return h;
  }
  const found = [];

  /**
   * raycaster.intersectObject(o, false)'s push, without the sort: exactly what o.raycast(raycaster, out) pushes.
   * Returns nothing; falls back to o.raycast() whenever the mesh has no current tree.
   */
  function raycast(o, raycaster, out) {
    const g = o.isInstancedMesh || o.isSkinnedMesh ? null : geoOf(o);
    const t = g ? trees.get(g) : null;
    if (!t || t.job || !matches(t, g, Array.isArray(o.material))) {
      st.fallbackCalls++;
      o.raycast(raycaster, out);
      return;
    }
    st.accelCalls++;
    const material = o.material;
    if (material === undefined) return;
    const matrixWorld = o.matrixWorld;
    if (g.boundingSphere === null) g.computeBoundingSphere();
    _sphere.copy(g.boundingSphere);
    _sphere.applyMatrix4(matrixWorld);
    _ray.copy(raycaster.ray).recast(raycaster.near);
    if (_sphere.containsPoint(_ray.origin) === false) {
      if (_ray.intersectSphere(_sphere, _at) === null) return;
      if (_ray.origin.distanceToSquared(_at) > (raycaster.far - raycaster.near) ** 2) return;
    }
    _inv.copy(matrixWorld).invert();
    _ray.copy(raycaster.ray).applyMatrix4(_inv);
    if (g.boundingBox !== null) { if (_ray.intersectsBox(g.boundingBox) === false) return; }
    if (!t.nodes) return;                                      // nothing in range: three tests no triangle either

    // local-space t for the far distance: a local step dt moves |M_lin · d_local| · dt in world space
    const e = matrixWorld.elements, d = _ray.direction;
    _dw.set(e[0] * d.x + e[4] * d.y + e[8] * d.z, e[1] * d.x + e[5] * d.y + e[9] * d.z, e[2] * d.x + e[6] * d.y + e[10] * d.z);
    const sL = _dw.length();
    const far = raycaster.far;
    const tMax = Number.isFinite(far) && sL > 1e-12 ? (far / sL) * (1 + 1e-4) + 1e-3 : Infinity;

    const ox = _ray.origin.x, oy = _ray.origin.y, oz = _ray.origin.z, dx = d.x, dy = d.y, dz = d.z;
    const nb = t.nodeBox, ni = t.nodeInfo, jj = t.jj, gi = t.gi, pos = t.pos, ix = t.ix;
    const arr = t.arr, groups = g.groups;
    const near = raycaster.near, rOrigin = raycaster.ray.origin;
    used = 0; found.length = 0;
    let sp = 0;
    stack[sp++] = 0;
    while (sp > 0) {
      const nIdx = stack[--sp];
      // slab test of the node's box against t ∈ [0, tMax]
      const b = nIdx * 6;
      let t0 = 0, t1 = tMax;
      if (dx !== 0) { let ta = (nb[b] - ox) / dx, tb = (nb[b + 3] - ox) / dx; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) continue; }
      else if (ox < nb[b] || ox > nb[b + 3]) continue;
      if (dy !== 0) { let ta = (nb[b + 1] - oy) / dy, tb = (nb[b + 4] - oy) / dy; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) continue; }
      else if (oy < nb[b + 1] || oy > nb[b + 4]) continue;
      if (dz !== 0) { let ta = (nb[b + 2] - oz) / dz, tb = (nb[b + 5] - oz) / dz; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) continue; }
      else if (oz < nb[b + 2] || oz > nb[b + 5]) continue;
      const cnt = ni[nIdx * 2 + 1];
      if (cnt & LEAF_BIT) {
        const s0 = ni[nIdx * 2], s1 = s0 + (cnt & ~LEAF_BIT);
        for (let q = s0; q < s1; q++) {
          const j = jj[q];
          const gIdx = arr ? gi[q] : -1;
          const mat = arr ? material[groups[gIdx].materialIndex] : material;
          const a = ix ? ix.getX(j) : j, bb = ix ? ix.getX(j + 1) : j + 1, c = ix ? ix.getX(j + 2) : j + 2;
          vA.fromBufferAttribute(pos, a); vB.fromBufferAttribute(pos, bb); vC.fromBufferAttribute(pos, c);
          // checkIntersection(), as three writes it
          const hitP = mat.side === THREE.BackSide
            ? _ray.intersectTriangle(vC, vB, vA, true, _pt)
            : _ray.intersectTriangle(vA, vB, vC, mat.side === THREE.FrontSide, _pt);
          if (hitP === null) continue;
          _pw.copy(_pt).applyMatrix4(matrixWorld);
          const distance = rOrigin.distanceTo(_pw);
          if (distance < near || distance > far) continue;
          const h = takeHit();
          h.distance = distance; h.point.copy(_pw); h.object = o;
          h.face.a = a; h.face.b = bb; h.face.c = c; h.face.materialIndex = arr ? groups[gIdx].materialIndex : 0;
          h.faceIndex = Math.floor(j / 3);
          h.ord = arr ? gIdx * 4294967296 + j : j;
          found.push(h);
        }
      } else {
        if (sp + 2 > stack.length) { st.fallbackCalls++; used = 0; found.length = 0; o.raycast(raycaster, out); return; }
        stack[sp++] = ni[nIdx * 2];       // right
        stack[sp++] = nIdx + 1;           // left (popped first)
      }
    }
    // three's order: ascending (group ordinal, j) — insertion sort, the list is a handful long
    for (let i = 1; i < found.length; i++) {
      const h = found[i];
      let k = i - 1;
      while (k >= 0 && found[k].ord > h.ord) { found[k + 1] = found[k]; k--; }
      found[k + 1] = h;
    }
    for (let i = 0; i < found.length; i++) out.push(found[i]);
    found.length = 0;
  }

  /** Is this mesh answered by a tree right now? */
  function ready(o) {
    const g = o && !o.isInstancedMesh && !o.isSkinnedMesh ? geoOf(o) : null;
    const t = g ? trees.get(g) : null;
    return !!(t && !t.job && matches(t, g, Array.isArray(o.material)));
  }
  function stats() {
    return { ...st, queued: queue.length, MB: +(st.bytes / 1048576).toFixed(2), buildMs: +st.buildMs.toFixed(1) };
  }
  return { raycast, want, urgent, work, build, ready, eligible, stats, get pending() { return queue.length; } };
}
