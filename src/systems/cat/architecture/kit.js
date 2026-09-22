// ─────────────────────────────────────────────────────────────────────────────
// KIT — a tiny authoring language for merged, vertex-coloured architecture.
//
// Everything you add goes into a bucket keyed by (district, material). At the
// end `finish()` merges each bucket into ONE BufferGeometry → ONE Mesh, so a
// whole town costs a handful of draw calls. Districts keep frustum culling
// meaningful; materials are shared across districts so night-glow can be driven
// from one place.
//
// Anchors (important): box / cyl / cone / prism / roof are BOTTOM-anchored —
// y is the ground the thing stands on. sph / torus / quad / sign are CENTRE-
// anchored. Rotations (o.rx, o.ry, o.rz) happen around the anchor point.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _cache = new Map();
function cached(key, make) {
  let g = _cache.get(key);
  if (!g) { g = make(); if (g.index) g = g.toNonIndexed(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); _cache.set(key, g); }
  return g;
}

/** Build a non-indexed geometry from a flat triangle soup. */
function soup(tris, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs || new Array((tris.length / 3) * 2).fill(0)), 2));
  g.computeVertexNormals();
  return g;
}

/** Gable roof prism: ridge runs along +Z, slopes fall toward ±X. Bottom at y=0. */
function gable(w, h, d) {
  const x = w / 2, z = d / 2;
  const A = [-x, 0, -z], B = [x, 0, -z], C = [x, 0, z], D = [-x, 0, z], R1 = [0, h, -z], R2 = [0, h, z];
  const t = [];
  const quad = (a, b, c, e) => { t.push(...a, ...b, ...c, ...a, ...c, ...e); };
  quad(B, C, R2, R1);      // +X slope
  quad(D, A, R1, R2);      // -X slope
  t.push(...A, ...B, ...R1);
  t.push(...C, ...D, ...R2);
  quad(A, D, C, B);        // underside
  return soup(t);
}

/** Ramp/wedge: full height at -X, zero at +X. Bottom at y=0. */
function wedge(w, h, d) {
  const x = w / 2, z = d / 2;
  const A = [-x, 0, -z], B = [x, 0, -z], C = [x, 0, z], D = [-x, 0, z], E = [-x, h, -z], F = [-x, h, z];
  const t = [];
  const quad = (a, b, c, e) => { t.push(...a, ...b, ...c, ...a, ...c, ...e); };
  quad(E, F, C, B);  // slope
  quad(A, B, C, D);  // bottom (wound for downward normal after computeVertexNormals)
  quad(F, E, A, D);  // back wall
  t.push(...A, ...E, ...B);
  t.push(...C, ...F, ...D);
  return soup(t);
}

const _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _quat = new THREE.Quaternion(), _eul = new THREE.Euler(), _mtx = new THREE.Matrix4(), _col = new THREE.Color();

export class Kit {
  constructor() {
    this.buckets = new Map();   // "district|mat" → { district, mat, geos: [] }
    this.d = 'misc';
    this.prims = 0;
    this.overflow = null;       // see _push: where non-opaque primitives go
  }
  at(district) { this.d = district; return this; }

  _push(geo, color, o) {
    const m = o.mat || 'matte';
    // A shell Part only owns its OPAQUE masses (walls, roof, ironwork) so the
    // whole shell can be faded as one mesh while the player is inside. Glass,
    // signs, bulbs and the additive night spill belong to the town-wide pools —
    // forward them so a hollow building still costs two draw calls, not six.
    // Only the town-wide GLOW pools are forwarded (bulbs, lamps and the additive
    // night spill, which must stay lit whether or not you are indoors). Walls,
    // glass and painted signs all stay with the shell so the whole building can
    // dissolve as one while the player is inside it.
    if (this.overflow && (m === 'spill' || m === 'glow' || m === 'lamp')) return this.overflow._push(geo, color, o);
    // transform around the anchor
    _eul.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
    _quat.setFromEuler(_eul);
    _pos.set(o.x, o.y, o.z);
    _scl.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _mtx.compose(_pos, _quat, _scl);
    geo.applyMatrix4(_mtx);
    if (o.flat) geo.computeVertexNormals();
    // vertex colours + a cheap contact-shadow gradient near the anchor plane
    const p = geo.attributes.position, n = p.count;
    const arr = new Float32Array(n * 3);
    _col.set(color);
    let r = _col.r, g = _col.g, b = _col.b;
    const sh = o.shade ?? 1; r *= sh; g *= sh; b *= sh;
    const aoK = o.ao ?? 1, aoBase = o.aoBase ?? o.y, aoH = o.aoH ?? 1.4;
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (aoK > 0) { const t = Math.min(1, Math.max(0, (p.getY(i) - aoBase) / aoH)); k = 1 - aoK * 0.2 * (1 - t * t); }
      arr[i * 3] = r * k; arr[i * 3 + 1] = g * k; arr[i * 3 + 2] = b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    // Only the bulk matte geometry is split per district (so frustum culling has
    // something to bite on). Signs, glass and metal are small and are pooled
    // town-wide so night-glow is one material and the mesh count stays low.
    const d = m === 'matte' ? this.d : 'town';
    const key = d + '|' + m;
    let bk = this.buckets.get(key);
    if (!bk) { bk = { district: d, mat: m, geos: [] }; this.buckets.set(key, bk); }
    bk.geos.push(geo);
    this.prims++;
    return geo;
  }

  // ── primitives ─────────────────────────────────────────────────────────────
  /** Bottom-anchored box. */
  box(x, y, z, w, h, d, color, o = {}) {
    const g = cached(`box`, () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: w * (o.sx ?? 1), sy: h * (o.sy ?? 1), sz: d * (o.sz ?? 1) });
  }
  /** Bottom-anchored cylinder (rTop, rBot). o.seg (12), o.open, o.center. */
  cyl(x, y, z, rTop, rBot, h, color, o = {}) {
    const seg = o.seg || 12, open = !!o.open, tl = o.theta ?? Math.PI * 2, ts = o.thetaStart ?? 0;
    const ratio = Math.abs(rTop - rBot) > 1e-4 ? rTop / Math.max(1e-4, rBot) : 1;
    const off = o.center ? 0 : 0.5;
    const g = cached(`cyl${seg}|${open}|${tl.toFixed(3)}|${ts.toFixed(3)}|${ratio.toFixed(3)}|${off}`,
      () => new THREE.CylinderGeometry(ratio, 1, 1, seg, 1, open, ts, tl).translate(0, off, 0)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: rBot, sy: h, sz: rBot });
  }
  /** Bottom-anchored cone. */
  cone(x, y, z, r, h, color, o = {}) {
    const seg = o.seg || 12;
    const g = cached(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: r, sy: h, sz: r });
  }
  /** Centre-anchored sphere. o.seg (12) o.rings (8) */
  sph(x, y, z, r, color, o = {}) {
    const seg = o.seg || 12, rings = o.rings || 8, pl = o.phiLength ?? Math.PI;
    const g = cached(`sph${seg}_${rings}_${pl.toFixed(2)}`, () => new THREE.SphereGeometry(1, seg, rings, 0, Math.PI * 2, 0, pl)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: r * (o.sx ?? 1), sy: r * (o.sy ?? 1), sz: r * (o.sz ?? 1), ao: o.ao ?? 0 });
  }
  /** Centre-anchored torus in the XY plane (use o.rx = -PI/2 to lay it flat). */
  torus(x, y, z, r, tube, color, o = {}) {
    const seg = o.seg || 16, tseg = o.tseg || 6, arc = o.arc ?? Math.PI * 2;
    const k = Math.max(0.01, tube / r);
    const g = cached(`tor${seg}_${tseg}_${arc.toFixed(2)}_${k.toFixed(3)}`, () => new THREE.TorusGeometry(1, k, tseg, seg, arc)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: r, sy: r, sz: r, ao: o.ao ?? 0 });
  }
  /** Gable roof, bottom-anchored, ridge along Z (use o.ry to turn). */
  roof(x, y, z, w, h, d, color, o = {}) {
    const g = cached('gable', () => gable(1, 1, 1)).clone();
    const m = this._push(g, color, { ...o, x, y, z, sx: w, sy: h, sz: d });
    if (o.ribs) this._ribs(x, y, z, w, h, d, o.ribColor ?? color, o);
    return m;
  }
  /** Barrel tiles running down both slopes of a gable roof. */
  _ribs(x, y, z, w, h, d, color, o) {
    const n = o.ribs, seg = 5;
    const len = Math.hypot(w / 2, h) * 1.03, ang = Math.atan2(h, w / 2);
    const rr = o.ribR ?? Math.min(0.2, d / (n * 2.05));
    const ca = Math.cos(o.ry || 0), sa = Math.sin(o.ry || 0);
    const nx = Math.sin(ang), ny = Math.cos(ang); // outward normal of the +X slope
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < n; i++) {
        const lz = -d / 2 + d * ((i + 0.5) / n);
        const lx = s * (w / 4 + nx * rr * 0.55);
        const ly = h / 2 + ny * rr * 0.55;
        const wx = x + lx * ca + lz * sa, wz = z - lx * sa + lz * ca;
        this.cyl(wx, y + ly, wz, rr, rr, len, color, { seg, open: true, center: true, rz: s > 0 ? (Math.PI / 2 - ang) : (Math.PI / 2 + ang), ry: o.ry || 0, ao: 0, mat: o.mat });
      }
    }
  }
  /** Ramp/wedge, bottom-anchored, high side at -X. */
  wedge(x, y, z, w, h, d, color, o = {}) {
    const g = cached('wedge', () => wedge(1, 1, 1)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: w, sy: h, sz: d });
  }
  /** Centre-anchored vertical quad facing +Z (turn with o.ry / tilt with o.rx). */
  quad(x, y, z, w, h, color, o = {}) {
    const g = cached('plane', () => new THREE.PlaneGeometry(1, 1)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: w, sy: h, sz: 1, ao: o.ao ?? 0 });
  }
  /** Centre-anchored horizontal quad (faces +Y). */
  hquad(x, y, z, w, d, color, o = {}) {
    const g = cached('plane', () => new THREE.PlaneGeometry(1, 1)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: w, sy: d, sz: 1, rx: -Math.PI / 2 + (o.rx || 0), ao: 0 });
  }
  /** Tube through world-space points. */
  tube(points, r, color, o = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    let g = new THREE.TubeGeometry(curve, o.seg || Math.max(8, points.length * 4), r, o.rseg || 6, false);
    if (g.index) g = g.toNonIndexed();
    return this._push(g, color, { ...o, x: 0, y: 0, z: 0, ao: 0 });
  }
  /** A sign face: an atlas cell mapped onto a quad (centre-anchored, faces +Z). */
  sign(cell, x, y, z, w, h, o = {}) {
    const g = cached('plane', () => new THREE.PlaneGeometry(1, 1)).clone();
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cell.u0 + uv.getX(i) * (cell.u1 - cell.u0), cell.v0 + uv.getY(i) * (cell.v1 - cell.v0));
    uv.needsUpdate = true;
    return this._push(g, 0xffffff, { ...o, x, y, z, sx: w, sy: h, sz: 1, ao: 0, mat: (o.glow ? 'signglow' : 'sign') + cell.page });
  }
  /** Same but lying flat (faces +Y) — for painted ground markings / posters on tables. */
  signFlat(cell, x, y, z, w, d, o = {}) {
    return this.sign(cell, x, y, z, w, d, { ...o, rx: -Math.PI / 2 + (o.rx || 0) });
  }

  // ── output ─────────────────────────────────────────────────────────────────
  finish(materials, parent, report) {
    const meshes = [];
    let tris = 0;
    for (const bk of this.buckets.values()) {
      const mtl = materials[bk.mat];
      if (!mtl) { console.warn('[cat/arch] missing material', bk.mat); continue; }
      let geo;
      try { geo = bk.geos.length === 1 ? bk.geos[0] : mergeGeometries(bk.geos, false); }
      catch (e) { console.warn('[cat/arch] merge failed', bk.mat, e.message); continue; }
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mtl);
      mesh.name = 'cat_' + bk.district + '_' + bk.mat;
      mesh.castShadow = bk.mat === 'matte' || bk.mat === 'metal';
      mesh.receiveShadow = bk.mat === 'matte' || bk.mat === 'metal' || bk.mat.startsWith('sign') && !bk.mat.startsWith('signglow') || bk.mat === 'win';
      if (bk.mat === 'spill') { mesh.renderOrder = 6; mesh.frustumCulled = false; }
      parent.add(mesh);
      meshes.push(mesh);
      const n = geo.attributes.position.count / 3;
      tris += n;
      if (report) report[bk.district + ':' + bk.mat] = Math.round(n);
      bk.geos.length = 0;
    }
    this.buckets.clear();
    return { meshes, tris };
  }
}

/** Detached sub-builder: collects into its own buckets so you can merge a moving
 *  object (a boat, a hand, a croissant) into a single standalone Mesh/Group. */
export class Part extends Kit {
  build(materials) {
    const group = new THREE.Group();
    const r = this.finish(materials, group);
    group.userData.tris = r.tris;
    return group;
  }
}

/**
 * Per-vertex animation for a small merged mesh (flags, string lights, nets).
 * `fn(arr, base, i, t)` writes arr[i..i+2] from base[i..i+2].
 */
export function ripple(group, fn) {
  const targets = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const p = o.geometry.attributes.position;
    targets.push({ p, base: new Float32Array(p.array) });
  });
  return (t) => {
    for (const tg of targets) {
      const a = tg.p.array, b = tg.base;
      for (let i = 0; i < a.length; i += 3) fn(a, b, i, t);
      tg.p.needsUpdate = true;
    }
  };
}
