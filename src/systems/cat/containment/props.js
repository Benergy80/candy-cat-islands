// ── Geometry + signage toolkit for the containment system ────────────────────
// Builder   : accumulates vertex-coloured primitives and merges them into ONE mesh
//             (all of Cat Island's containment scenery = 1 draw call).
// SignAtlas : one 2048×1024 CanvasTexture shared by every readable sign, so all
//             signs merge into a second single draw call and can be repainted live.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from '../../../core/util.js';
import { paint, place } from './catmesh.js';

export class Builder {
  constructor() { this.parts = []; }
  add(geo, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = null) {
    this.parts.push(place(paint(geo, color), x, y, z, rx, ry, rz, s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1));
    return this;
  }
  box(w, h, d, color, x, y, z, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, ry, rx, rz); }
  cyl(rt, rb, h, seg, color, x, y, z, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, ry, rx, rz); }
  cone(r, h, seg, color, x, y, z, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, ry, rx, rz); }
  sph(r, ws, hs, color, x, y, z, s = null) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, x, y, z, 0, 0, 0, s); }
  torus(r, t, rs, ts, color, x, y, z, rx = 0, ry = 0) { return this.add(new THREE.TorusGeometry(r, t, rs, ts), color, x, y, z, ry, rx, 0); }
  /** post + board frame, returns the world centre of the board face */
  signFrame(color, x, y, z, ry, w, h, postH, postColor = 0x6b4a30) {
    const dx = Math.cos(ry), dz = -Math.sin(ry);
    for (const s of [-1, 1]) this.cyl(0.11, 0.13, postH, 6, postColor, x + dx * w * 0.38 * s, y + postH / 2, z + dz * w * 0.38 * s);
    this.box(w, h, 0.22, color, x, y + postH + h * 0.5 - 0.25, z, ry);
    return { x, y: y + postH + h * 0.5 - 0.25, z };
  }
  build(name, extra = {}) {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat(0xffffff, { vertexColors: true, flatShading: true, roughness: 0.82, ...extra }));
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  /** triangle count of what has been accumulated so far */
  tris() { let n = 0; for (const p of this.parts) n += (p.index ? p.index.count : p.attributes.position.count) / 3; return n; }
}

// ── Sign atlas ───────────────────────────────────────────────────────────────
// 9 × 7 cells of 256 px. The six exit signs, the kiosk and the wanted poster
// took the grid past the old 8-wide sheet; one extra column is cheaper than a
// second atlas (which would cost a second draw call for every sign in the game).
const CELL = 256, COLS = 9, ROWS = 7;

export class SignAtlas {
  constructor() {
    const c = document.createElement('canvas');
    c.width = CELL * COLS; c.height = CELL * ROWS;
    this.canvas = c; this.g = c.getContext('2d');
    this.g.fillStyle = '#6b4a30'; this.g.fillRect(0, 0, c.width, c.height);
    this.tex = new THREE.CanvasTexture(c);
    this.tex.anisotropy = 4; this.tex.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.88, metalness: 0 });
    this.grid = new Array(COLS * ROWS).fill(false);
    this.slots = {};
    this.planes = [];
  }
  alloc(name, cw = 2, ch = 1) {
    for (let r = 0; r + ch <= ROWS; r++) for (let c = 0; c + cw <= COLS; c++) {
      let ok = true;
      for (let j = 0; j < ch && ok; j++) for (let i = 0; i < cw; i++) if (this.grid[(r + j) * COLS + c + i]) { ok = false; break; }
      if (!ok) continue;
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) this.grid[(r + j) * COLS + c + i] = true;
      const s = { x: c * CELL, y: r * CELL, w: cw * CELL, h: ch * CELL };
      this.slots[name] = s;
      return s;
    }
    throw new Error('sign atlas full: ' + name);
  }
  /** repaint one slot; fn(ctx2d, w, h) draws in slot-local pixels */
  draw(name, fn) {
    const s = this.slots[name]; if (!s) return;
    const g = this.g; g.save(); g.translate(s.x, s.y);
    g.beginPath(); g.rect(0, 0, s.w, s.h); g.clip();
    fn(g, s.w, s.h);
    g.restore(); this.tex.needsUpdate = true;
  }
  rect(name) {
    const s = this.slots[name], W = this.canvas.width, H = this.canvas.height;
    return { u0: s.x / W, u1: (s.x + s.w) / W, v0: 1 - (s.y + s.h) / H, v1: 1 - s.y / H };
  }
  /** A plane geometry UV-mapped to a slot, ready to merge. */
  plane(name, w, h) {
    const g = new THREE.PlaneGeometry(w, h);
    const r = this.rect(name), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + (r.u1 - r.u0) * uv.getX(i), r.v0 + (r.v1 - r.v0) * uv.getY(i));
    return g;
  }
  /** Place a signboard face into the merged sign mesh. */
  face(name, w, h, x, y, z, ry = 0, rx = 0) {
    const g = this.plane(name, w, h);
    place(g, x, y, z, rx, ry, 0);
    this.planes.push(g);
  }
  buildMesh() {
    if (!this.planes.length) return null;
    const g = mergeGeometries(this.planes, false);
    const m = new THREE.Mesh(g, this.material);
    m.name = 'containment-signs'; m.castShadow = false; m.receiveShadow = true;
    return m;
  }
}

// ── Canvas painting helpers ──────────────────────────────────────────────────
export const F = (w, sz) => `${w} ${sz}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;

export function panel(g, w, h, bg, border, borderW = 14) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = borderW; g.strokeRect(borderW / 2, borderW / 2, w - borderW, h - borderW); }
}
export function txt(g, s, x, y, size, color, weight = 'bold', align = 'center') {
  g.fillStyle = color; g.font = F(weight, size); g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(s, x, y);
}
/** Squeeze text to fit a max width. */
export function fit(g, s, x, y, size, color, maxW, weight = 'bold', align = 'center') {
  g.font = F(weight, size);
  let m = g.measureText(s).width;
  if (m > maxW) size = Math.max(8, size * maxW / m);
  txt(g, s, x, y, size, color, weight, align);
}
/**
 * A chunky human silhouette — the shape the whole MISSING gag rests on. Drawn
 * from (x, y) = top-centre, `h` tall. Reads as a person at 20 px; the sentences
 * underneath it are a bonus, not the joke.
 */
export function figure(g, x, y, h, color, o = {}) {
  const w = h * 0.44;
  g.fillStyle = color;
  g.beginPath(); g.arc(x, y + h * 0.12, h * 0.118, 0, 7); g.fill();                  // head
  g.beginPath();                                                                     // torso
  g.moveTo(x - w * 0.52, y + h * 0.62); g.lineTo(x - w * 0.40, y + h * 0.27);
  g.lineTo(x + w * 0.40, y + h * 0.27); g.lineTo(x + w * 0.52, y + h * 0.62);
  g.closePath(); g.fill();
  g.fillRect(x - w * 0.44, y + h * 0.58, w * 0.32, h * 0.42);                         // legs
  g.fillRect(x + w * 0.12, y + h * 0.58, w * 0.32, h * 0.42);
  if (o.suitcase) {
    g.fillRect(x + w * 0.46, y + h * 0.30, w * 0.13, h * 0.30);                       // arm
    g.fillRect(x + w * 0.30, y + h * 0.58, w * 0.52, h * 0.24);                       // case
  }
  if (o.smile) {                                                                      // they drew you happy
    g.strokeStyle = o.smile; g.lineWidth = Math.max(2, h * 0.022); g.lineCap = 'round';
    g.beginPath(); g.arc(x, y + h * 0.12, h * 0.062, 0.35, Math.PI - 0.35); g.stroke();
  }
}

/** A fat pictogram arrow — the shape you read before you read any letters. */
export function bigArrow(g, cx, cy, dir, s, color) {
  g.fillStyle = color;
  if (dir === 'up') {
    g.fillRect(cx - s * 0.16, cy - s * 0.08, s * 0.32, s * 0.62);
    g.beginPath(); g.moveTo(cx - s * 0.52, cy - s * 0.04); g.lineTo(cx, cy - s * 0.60); g.lineTo(cx + s * 0.52, cy - s * 0.04); g.closePath(); g.fill();
    return;
  }
  if (dir === 'down') {
    g.fillRect(cx - s * 0.16, cy - s * 0.60, s * 0.32, s * 0.62);
    g.beginPath(); g.moveTo(cx - s * 0.52, cy + s * 0.04); g.lineTo(cx, cy + s * 0.60); g.lineTo(cx + s * 0.52, cy + s * 0.04); g.closePath(); g.fill();
    return;
  }
  const d = dir === 'left' ? -1 : 1;
  const a = cx - d * s * 0.58, b = cx + d * s * 0.30;
  g.fillRect(Math.min(a, b), cy - s * 0.16, Math.abs(b - a), s * 0.32);
  g.beginPath();
  g.moveTo(cx + d * s * 0.24, cy - s * 0.54); g.lineTo(cx + d * s * 0.82, cy); g.lineTo(cx + d * s * 0.24, cy + s * 0.54);
  g.closePath(); g.fill();
}

/** Two fat strokes: somebody has crossed this out with a brush. */
export function crossOut(g, cx, cy, s, color, lw) {
  g.save(); g.strokeStyle = color; g.lineWidth = lw ?? s * 0.17; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - s * 0.55, cy - s * 0.5); g.lineTo(cx + s * 0.58, cy + s * 0.52); g.stroke();
  g.beginPath(); g.moveTo(cx + s * 0.55, cy - s * 0.52); g.lineTo(cx - s * 0.58, cy + s * 0.5); g.stroke();
  g.restore();
}

export function pawprint(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath(); g.ellipse(x, y + r * 0.35, r * 0.8, r * 0.65, 0, 0, 7); g.fill();
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI * 0.82 + i * Math.PI * 0.21;
    g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78 + r * 0.1, r * 0.26, r * 0.33, a + Math.PI / 2, 0, 7); g.fill();
  }
}
