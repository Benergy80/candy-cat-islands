// Geometry helpers for the Sugarfin Express: merge many small primitives into a
// single vertex-coloured mesh so the whole ferry stays inside ~20 draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();

/** Paint a flat colour into a geometry's `color` attribute. */
export function tint(geo, color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Per-vertex colour from a callback (x, y, z, out:Color). */
export function shade(geo, fn) {
  const p = geo.attributes.position; const n = p.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), _c);
    arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Accumulates transformed, coloured primitives and merges them into one mesh.
 *   new Merger().add(box, 0xff0000, { x: 1, sy: 2, ry: 0.3 }).mesh()
 * Pass `null` as the colour to keep a geometry's existing per-vertex colours.
 */
export class Merger {
  constructor() { this.list = []; }
  add(geo, color, o = {}) {
    // Say WHICH call was wrong. Builders here return { geo, … } bundles as well
    // as bare geometries, and `geo.clone is not a function` three frames later
    // tells you nothing about where it came from.
    if (!geo || !geo.isBufferGeometry) {
      throw new TypeError(`Merger.add: expected a BufferGeometry, got ${geo && geo.geo ? '{ geo, … } bundle — pass .geo' : Object.prototype.toString.call(geo)}`);
    }
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (o.sx !== undefined || o.sy !== undefined || o.sz !== undefined) g.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    if (o.rz) g.rotateZ(o.rz);
    if (o.rx) g.rotateX(o.rx);
    if (o.ry) g.rotateY(o.ry);
    if (o.x || o.y || o.z) g.translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (color !== null) tint(g, color); else if (!g.attributes.color) tint(g, 0xffffff);
    this.list.push(g);
    return this;
  }
  get empty() { return this.list.length === 0; }
  geometry() {
    const g = this.list.length === 1 ? this.list[0] : mergeGeometries(this.list, false);
    if (this.list.length > 1) for (const x of this.list) x.dispose();
    this.list.length = 0;
    return g;
  }
  mesh(opts = {}) {
    const m = new THREE.Mesh(this.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0, ...opts }));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

/** Smooth (cosine-interpolated) lookup through a [[t, v], ...] table. */
export function curve(table, t) {
  if (t <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < table.length - 1; i++) {
    const [t0, v0] = table[i], [t1, v1] = table[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      const s = 0.5 - 0.5 * Math.cos(Math.PI * f);
      return v0 + (v1 - v0) * s;
    }
  }
  return last[1];
}

/** A thin rounded plank/box with softened edges (chunky, reads at distance). */
export function plank(w, h, d) { return new THREE.BoxGeometry(w, h, d, 1, 1, 1); }
