// ── Geometry toolkit for the escape vehicles ─────────────────────────────────
// Owned by the vehicles builder (catapult / canoe / flyer); safe for the other
// escape routes to reuse.
//
//   B        accumulates vertex-coloured primitives and merges them into ONE
//            flat-shaded mesh (one draw call per moving part, not per plank).
//   signMesh one small CanvasTexture board — readable text at game distance.
//   catGeo   a chunky low-poly cat (~260 tris) in a couple of poses.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from '../../core/util.js';

/** Bake a solid vertex colour onto a geometry so everything can merge. */
export function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (geo.attributes.normal) geo.deleteAttribute('normal');   // flat shading recomputes
  return geo;
}

/** scale → rotate(z,x,y) → translate. */
export function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
  if (rz) geo.rotateZ(rz);
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 0, 1), _one = new THREE.Vector3(1, 1, 1);

export class B {
  constructor() { this.parts = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null) {
    this.parts.push(place(paint(geo, color), x, y, z, rx, ry, rz, s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1));
    return this;
  }
  box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz); }
  cyl(rt, rb, h, seg, color, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz); }
  cone(r, h, seg, color, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, rx, ry, rz); }
  sph(r, ws, hs, color, x, y, z, s = null) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, x, y, z, 0, 0, 0, s); }
  torus(r, t, rs, ts, color, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.TorusGeometry(r, t, rs, ts), color, x, y, z, rx, ry, rz); }
  /** A timber running between two points (chunky square section). */
  beam(a, b, thick, color) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const L = _a.length() || 0.001;
    const g = paint(new THREE.BoxGeometry(thick, thick, L), color);
    _q.setFromUnitVectors(_up, _a.divideScalar(L));
    _b.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    _m.compose(_b, _q, _one);
    g.applyMatrix4(_m);
    this.parts.push(g);
    return this;
  }
  /** Open-topped crate/hull: four walls + a floor. */
  crate(w, h, d, t, color, x, y, z, ry = 0) {
    this.box(w, t, d, color, x, y - h / 2 + t / 2, z, 0, ry);
    const ca = Math.cos(ry), sa = Math.sin(ry);
    const put = (lx, lz, bw, bd) => this.box(bw, h, bd, color, x + lx * ca + lz * sa, y, z - lx * sa + lz * ca, 0, ry);
    put(0, d / 2 - t / 2, w, t); put(0, -d / 2 + t / 2, w, t);
    put(w / 2 - t / 2, 0, t, d - t * 2); put(-w / 2 + t / 2, 0, t, d - t * 2);
    return this;
  }
  merge(other) { for (const p of other.parts) this.parts.push(p); return this; }
  tris() { let n = 0; for (const p of this.parts) n += (p.index ? p.index.count : p.attributes.position.count) / 3; return n; }
  geometry() {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    g.computeVertexNormals();
    g.computeBoundingSphere();      // the camera's blocker-fade reads this directly
    return g;
  }
  build(name, extra = {}) {
    const g = this.geometry();
    if (!g) return null;
    const m = new THREE.Mesh(g, mat(0xffffff, { vertexColors: true, flatShading: true, roughness: 0.78, ...extra }));
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

// ── Signs ────────────────────────────────────────────────────────────────────
/**
 * A painted board. `lines` = [{ text, size, color, weight }] stacked vertically.
 * One 512×256 CanvasTexture, NearestFilter off (text wants smoothing).
 */
export function signMesh(w, h, lines, opts = {}) {
  const c = document.createElement('canvas');
  c.width = opts.cw || 512; c.height = opts.ch || 256;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#e8d3a8';
  g.fillRect(0, 0, c.width, c.height);
  if (opts.border !== false) {
    g.strokeStyle = opts.borderColor || '#6b4a30';
    g.lineWidth = opts.borderWidth || 14;
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, c.width - g.lineWidth, c.height - g.lineWidth);
  }
  opts.draw?.(g, c.width, c.height);
  const total = lines.reduce((s, l) => s + (l.size || 54) * 1.22, 0);
  let y = c.height / 2 - total / 2;
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const l of lines) {
    const size = l.size || 54;
    g.font = `${l.weight || 900} ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    g.fillStyle = l.color || '#3b2415';
    if (l.rotate) { g.save(); g.translate(c.width / 2, y + size * 0.6); g.rotate(l.rotate); g.fillText(l.text, 0, -size * 0.6); g.restore(); }
    else g.fillText(l.text, c.width / 2, y);
    y += size * 1.22;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
  }));
  mesh.receiveShadow = true;
  mesh.userData.repaint = (newLines, newOpts = {}) => {
    g.fillStyle = newOpts.bg || opts.bg || '#e8d3a8';
    g.fillRect(0, 0, c.width, c.height);
    if (opts.border !== false) { g.strokeStyle = newOpts.borderColor || opts.borderColor || '#6b4a30'; g.lineWidth = opts.borderWidth || 14; g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, c.width - g.lineWidth, c.height - g.lineWidth); }
    const t2 = newLines.reduce((s, l) => s + (l.size || 54) * 1.22, 0);
    let yy = c.height / 2 - t2 / 2;
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (const l of newLines) {
      const size = l.size || 54;
      g.font = `${l.weight || 900} ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
      g.fillStyle = l.color || '#3b2415';
      g.fillText(l.text, c.width / 2, yy); yy += size * 1.22;
    }
    tex.needsUpdate = true;
  };
  return mesh;
}

// ── Cats ─────────────────────────────────────────────────────────────────────
/**
 * Chunky low-poly cat, feet at y=0, ~0.95 tall, facing +Z. ~270 tris.
 *   pose: 'sit' | 'doze' (lying, eyes shut, one paw up) | 'stand'
 */
export function catGeo(fur = 0xf0963c, pose = 'sit', opts = {}) {
  const b = new B();
  const LIGHT = opts.light ?? 0xfff6ea;
  const EYE = 0x20202a;
  const PINK = 0xffb9c4;
  const doze = pose === 'doze';
  const bodyY = doze ? 0.30 : 0.45;
  const headY = doze ? 0.42 : 0.88;
  const headZ = doze ? 0.52 : 0.26;

  b.sph(0.40, 8, 6, fur, 0, bodyY, 0, doze ? [1.15, 0.82, 1.45] : [1.05, 0.98, 1.22]);
  b.sph(0.29, 8, 5, fur, 0, headY, headZ);
  for (const s of [-1, 1]) {
    b.cone(0.115, 0.21, 4, fur, s * 0.165, headY + 0.19, headZ - 0.04, 0, Math.PI / 4, s * 0.22);
    b.cone(0.06, 0.12, 4, PINK, s * 0.165, headY + 0.19, headZ + 0.02, 0, Math.PI / 4, s * 0.22);
  }
  b.sph(0.14, 6, 3, LIGHT, 0, headY - 0.08, headZ + 0.21, [1.35, 0.85, 0.8]);
  b.sph(0.17, 6, 3, LIGHT, 0, bodyY + 0.02, headZ + (doze ? -0.10 : 0.10), [0.9, 1.2, 0.6]);
  // eyes: open beads, or shut slits for a dozing cat
  for (const s of [-1, 1]) {
    if (doze || opts.shut) b.box(0.10, 0.028, 0.03, EYE, s * 0.115, headY + 0.05, headZ + 0.20);
    else b.sph(0.062, 4, 3, EYE, s * 0.115, headY + 0.06, headZ + 0.20);
  }
  b.cone(0.045, 0.05, 3, 0xff9aa8, 0, headY - 0.08, headZ + 0.28, Math.PI / 2);
  // paws
  for (const s of [-1, 1]) {
    if (doze) b.sph(0.115, 5, 4, LIGHT, s * 0.20, 0.11, 0.40, [1, 0.8, 1.5]);
    else b.sph(0.12, 5, 4, LIGHT, s * 0.17, 0.10, 0.30, [1, 0.85, 1.3]);
  }
  // tail
  const tl = doze ? 5 : 4;
  for (let i = 0; i < tl; i++) {
    const t = i / (tl - 1);
    b.sph(0.085 - t * 0.02, 5, 4, i === tl - 1 ? LIGHT : fur,
      doze ? (0.30 + t * 0.42) : (t * 0.16), doze ? (0.16 + Math.sin(t * 2.2) * 0.10) : (0.22 + t * 0.42),
      doze ? (-0.45 - t * 0.32) : (-0.42 - t * 0.10));
  }
  // stripes
  if (opts.stripes !== false) {
    const dark = opts.stripe ?? 0x7a4420;
    for (let i = 0; i < 3; i++) b.box(0.5, 0.055, 0.10, dark, 0, bodyY + (doze ? 0.22 : 0.28) - i * 0.02, (doze ? -0.05 : -0.12) - i * 0.20);
  }
  return b;
}
