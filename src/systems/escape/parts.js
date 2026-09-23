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
  // TEXT NEVER LEAVES THE BOARD: each line shrinks (never grows) until it fits
  // inside the border with a margin. 'MAINTENANCE HATCH' at 62 px was 680 px
  // wide on a 512 px board and rendered as 'INTENANCE HAT'.
  const maxW = c.width - 2 * ((opts.border === false ? 0 : (opts.borderWidth || 14)) + (opts.pad ?? 18));
  const total = lines.reduce((s, l) => s + (l.size || 54) * 1.22, 0);
  let y = c.height / 2 - total / 2;
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const l of lines) {
    const size = l.size || 54;
    fitFont(g, l.text, size, l.weight || 900, maxW);
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
      fitFont(g, l.text, size, l.weight || 900, maxW);
      g.fillStyle = l.color || '#3b2415';
      g.fillText(l.text, c.width / 2, yy); yy += size * 1.22;
    }
    tex.needsUpdate = true;
  };
  return mesh;
}
/** Set a canvas font at `size`, shrunk (never grown) so `text` fits `maxW`. */
function fitFont(g, text, size, weight, maxW) {
  const f = (px) => `${weight} ${px}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
  g.font = f(size);
  if (!(maxW > 0)) return;
  const w = g.measureText(text).width;
  if (w > maxW) g.font = f(Math.max(10, Math.floor(size * maxW / w)));
}
/**
 * Let a signMesh board light itself after dark (its own texture as the
 * emissive map, so the paint glows and the ink stays ink). Returns a setter
 * for the night factor 0..1 — call it every frame.
 */
export function nightSign(mesh, peak = 0.55) {
  const m = mesh?.material;
  if (!m || !m.map) return () => {};
  m.emissive = new THREE.Color(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = 0;
  m.needsUpdate = true;
  return (k) => { m.emissiveIntensity = peak * k; };
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

// ═════════════════════════════════════════════════════════════════════════════
// ESCAPE ITEMS KIT (wave 3, Contract D) — the cave KEY and the catapult WINCH
// as physical, glowing, signposted things. Shared by cave.js (key trail) and
// catapult.js (winch trail):
//
//   glowMat(hex)       vertex-coloured material whose EMISSIVE is scaled by the
//                      vertex colour: the gold glows, the key's eyes stay black.
//   keyGeo()           a golden cat-headed key, ~1.3 u tall, centred, upright.
//   winchGeo(o)        a brass winch drum with rope, flanges and a crank, axle
//                      along X at the origin (o.stand adds feet + base plate).
//   signAtlas()        ONE 1024² CanvasTexture holding every poster, plaque and
//                      fingerpost face (+ a night-glow twin) — a singleton, so
//                      every sign site in both files shares one material.
//   Site               B with atlas UVs: wood/stone parts take their colour from
//                      the vertex colour (UVs on a white texel), faces map into
//                      the atlas. A whole sign cluster = ONE draw call.
//   beamField(ctx)     every light column + ground pool (key gold, winch teal)
//                      in ONE additive mesh, billboarded per column in its
//                      vertex shader: "visible from 40 u" for one draw call.
// ─────────────────────────────────────────────────────────────────────────────

/** Emissive × vertex colour (so dark details never glow). */
export function glowMat(emissiveHex, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, flatShading: true,
    roughness: o.roughness ?? 0.38, metalness: 0,
    emissive: emissiveHex, emissiveIntensity: o.intensity ?? 0.4,
  });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include emissivemap_fragment',
      '#include emissivemap_fragment\n\ttotalEmissiveRadiance *= vColor.rgb;',
    );
  };
  m.customProgramCacheKey = () => 'escape-glowmat-v1';
  return m;
}

/**
 * A vertex-coloured material that EMITS its own vertex colour × `tint` ×
 * emissiveIntensity: gold glows gold, lamp glass glows cream, ink stays ink.
 * (glowMat above predates this and is kept as-is: its emissive is uniform,
 * and the key and the winch were tuned against that look.) At a low intensity
 * on timber it doubles as a warm fill light after dark.
 */
export function colorGlowMat(tint = 0xffffff, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, flatShading: o.flat ?? true,
    roughness: o.roughness ?? 0.6, metalness: 0,
    emissive: tint, emissiveIntensity: o.intensity ?? 0,
  });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;',
    );
  };
  m.customProgramCacheKey = () => 'escape-colorglow-v1';
  return m;
}

const GOLD = 0xffc93a, GOLD_DK = 0xe09a1c, INK = 0x2a1a0c;

/** A golden cat-headed key. Upright, centred on the origin, ~1.3 u tall. */
export function keyGeo() {
  const b = new B();
  const HY = 0.30;                                        // bow (head) centre
  b.cyl(0.29, 0.29, 0.11, 14, GOLD, 0, HY, 0, Math.PI / 2);              // the head disc
  b.torus(0.29, 0.045, 5, 16, GOLD_DK, 0, HY, 0);                       // rim
  for (const s of [-1, 1]) {
    // ears: flattened three-sided cones, leaning out
    b.add(new THREE.ConeGeometry(0.12, 0.22, 3), GOLD, s * 0.17, HY + 0.3, 0, 0, 0, -s * 0.38, [1, 1, 0.5]);
    for (const f of [-1, 1]) {
      b.sph(0.045, 5, 4, INK, s * 0.1, HY + 0.05, f * 0.062, [1, 1.35, 0.5]);  // eyes, both faces
      b.box(0.16, 0.018, 0.02, INK, s * 0.2, HY - 0.07, f * 0.062, 0, 0, s * 0.18);  // whiskers
    }
  }
  for (const f of [-1, 1]) b.sph(0.04, 5, 3, 0xff8a9a, 0, HY - 0.05, f * 0.062, [1.2, 0.8, 0.5]);  // nose
  b.torus(0.075, 0.035, 5, 10, GOLD_DK, 0, -0.01, 0, Math.PI / 2);          // collar
  b.cyl(0.055, 0.055, 0.66, 8, GOLD, 0, -0.34, 0);                          // shaft
  // the bit is a little fish skeleton: two ribs and a tail
  b.box(0.22, 0.075, 0.07, GOLD_DK, 0.1, -0.5, 0);
  b.box(0.16, 0.07, 0.07, GOLD_DK, 0.08, -0.62, 0);
  b.add(new THREE.ConeGeometry(0.09, 0.14, 3), GOLD, 0, -0.72, 0, 0, 0, Math.PI, [1, 1, 0.5]);
  return b;
}

const BRASS = 0xe0a640, BRASS_DK = 0xa8742a, IRON2 = 0x55555f;
/**
 * A brass winch: drum along X centred on the axle, rope coils, two flanges, a
 * crank on +X. o.crankX moves the crank outboard (the catapult cradle has posts
 * in the way); o.stand adds two iron A-brackets and a base plate at y = −0.64.
 */
export function winchGeo(o = {}) {
  const b = new B();
  const cx = o.crankX ?? 0.78;
  b.cyl(0.36, 0.36, 1.0, 12, BRASS, 0, 0, 0, 0, 0, Math.PI / 2);          // drum
  for (let i = 0; i < 4; i++) b.torus(0.385, 0.055, 4, 12, i % 2 ? 0xffdc5c : 0xff7aa8, -0.33 + i * 0.22, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    b.cyl(0.56, 0.56, 0.1, 12, BRASS_DK, s * 0.55, 0, 0, 0, 0, Math.PI / 2);  // flanges
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2;
      b.sph(0.045, 4, 3, IRON2, s * 0.61, Math.cos(a) * 0.42, Math.sin(a) * 0.42);  // bolts
    }
  }
  b.cyl(0.075, 0.075, cx * 2 + 0.1, 6, IRON2, 0, 0, 0, 0, 0, Math.PI / 2);  // axle, through
  // the crank: arm, handle, knob
  b.box(0.09, 0.5, 0.12, IRON2, cx, -0.22, 0);
  b.cyl(0.06, 0.06, 0.3, 6, 0x3a3038, cx + 0.15, -0.44, 0, 0, 0, Math.PI / 2);
  b.sph(0.11, 7, 5, 0xff4a5a, cx + 0.32, -0.44, 0);
  // ratchet + pawl on the −X flange
  b.cyl(0.24, 0.24, 0.08, 10, IRON2, -0.66, 0, 0, 0, 0, Math.PI / 2);
  b.box(0.08, 0.08, 0.34, IRON2, -0.66, 0.26, -0.1, 0.5);
  if (o.stand) {
    for (const s of [-1, 1]) {
      b.box(0.1, 0.72, 0.1, IRON2, s * 0.55, -0.32, 0.22, -0.32);
      b.box(0.1, 0.72, 0.1, IRON2, s * 0.55, -0.32, -0.22, 0.32);
    }
    b.box(1.5, 0.08, 0.86, BRASS_DK, 0, -0.64, 0);
  }
  return b;
}

// ── the sign atlas ───────────────────────────────────────────────────────────
// Canvas px regions [x, y, w, h]. WHITE sits in the bottom-left corner so a
// UV of (0,0) — which is what paint() gives a part without UVs — is white too.
const ATLAS = 1024;
const REG = {
  white:     [0, 992, 32, 32],
  poster:    [0, 0, 256, 352],      // LOST KEY?
  lostprop:  [264, 0, 512, 256],    // the Lost Property board
  plaque:    [784, 0, 240, 112],    // plinth plaque
  cradle:    [784, 120, 240, 120],  // WINCH GOES HERE
  winchsign: [264, 264, 512, 256],  // WINCH — property of The Big Fling
  wposter:   [784, 248, 240, 272],  // WANTED: WINCH (the catapult's own poster)
  key_R:  [0, 528, 512, 110], key_L:  [512, 528, 512, 110],
  quay_R: [0, 646, 512, 110], quay_L: [512, 646, 512, 110],
  plaza_R: [0, 764, 512, 110], plaza_L: [512, 764, 512, 110],
  back_R: [40, 882, 472, 104], back_L: [552, 882, 472, 104],
};
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

function drawKeyIcon(g, x, y, s, fill = '#f4b820', ink = '#5a3a10') {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = fill; g.strokeStyle = ink; g.lineWidth = 3;
  g.beginPath();                                   // ears
  g.moveTo(-20, -20); g.lineTo(-14, -44); g.lineTo(-2, -26); g.closePath();
  g.moveTo(20, -20); g.lineTo(14, -44); g.lineTo(2, -26); g.closePath();
  g.fill(); g.stroke();
  g.beginPath(); g.arc(0, -8, 24, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillRect(-5, 14, 10, 62); g.strokeRect(-5, 14, 10, 62);
  g.fillRect(5, 52, 18, 9); g.strokeRect(5, 52, 18, 9);
  g.fillRect(5, 66, 13, 9); g.strokeRect(5, 66, 13, 9);
  g.fillStyle = ink;
  g.beginPath(); g.ellipse(-9, -11, 3.5, 6, 0, 0, Math.PI * 2); g.ellipse(9, -11, 3.5, 6, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(-4, -1); g.lineTo(4, -1); g.lineTo(0, 4); g.closePath(); g.fill();
  g.restore();
}
function drawWinchIcon(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.lineWidth = 3; g.strokeStyle = '#4a3010';
  g.fillStyle = '#e0a640'; g.fillRect(-30, -18, 60, 36); g.strokeRect(-30, -18, 60, 36);
  g.fillStyle = '#ff7aa8'; for (let i = 0; i < 3; i++) g.fillRect(-24 + i * 18, -18, 8, 36);
  g.fillStyle = '#a8742a'; g.fillRect(-38, -26, 9, 52); g.fillRect(29, -26, 9, 52);
  g.strokeRect(-38, -26, 9, 52); g.strokeRect(29, -26, 9, 52);
  g.fillStyle = '#55555f'; g.fillRect(38, -3, 16, 6); g.fillRect(50, -3, 6, 28);
  g.fillStyle = '#ff4a5a'; g.beginPath(); g.arc(53, 28, 7, 0, Math.PI * 2); g.fill(); g.stroke();
  g.restore();
}
function text(g, str, x, y, size, color, weight = 900, maxW = 0) {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color;
  if (maxW) { const w = g.measureText(str).width; if (w > maxW) g.font = `${weight} ${Math.floor(size * maxW / w)}px ${FONT}`; }
  g.fillText(str, x, y);
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/** An arrow board: swallow-tail on one end, point on the other. */
function arrowBoard(g, [X, Y, W, H], dir, bg, rim, lines, icon) {
  g.save(); g.translate(X, Y);
  const tip = 70, tail = 26, p = 6;
  g.beginPath();
  if (dir > 0) {
    g.moveTo(p, p); g.lineTo(W - tip, p); g.lineTo(W - p, H / 2); g.lineTo(W - tip, H - p); g.lineTo(p, H - p); g.lineTo(p + tail, H / 2);
  } else {
    g.moveTo(W - p, p); g.lineTo(tip, p); g.lineTo(p, H / 2); g.lineTo(tip, H - p); g.lineTo(W - p, H - p); g.lineTo(W - p - tail, H / 2);
  }
  g.closePath();
  g.fillStyle = bg; g.fill();
  g.lineWidth = 9; g.strokeStyle = rim; g.stroke();
  // grain
  g.globalAlpha = 0.12; g.fillStyle = rim;
  for (let i = 0; i < 4; i++) g.fillRect(p + 30, 22 + i * 20, W - tip - 40, 3);
  g.globalAlpha = 1;
  const cx0 = dir > 0 ? p + tail + 8 : tip, cx1 = dir > 0 ? W - tip : W - p - tail - 8;
  let tx = (cx0 + cx1) / 2;
  if (icon) { icon(g, dir > 0 ? cx0 + 40 : cx1 - 40, H / 2 + 2); tx += dir > 0 ? 34 : -34; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const maxW = (cx1 - cx0) - (icon ? 84 : 16);
  if (lines.length === 1) text(g, lines[0].t, tx, H / 2 + 3, lines[0].s || 46, lines[0].c || '#3b2415', 900, maxW);
  else {
    text(g, lines[0].t, tx, H / 2 - 17, lines[0].s || 40, lines[0].c || '#3b2415', 900, maxW);
    text(g, lines[1].t, tx, H / 2 + 24, lines[1].s || 28, lines[1].c || '#5a3a20', 800, maxW);
  }
  g.restore();
}

let _atlas = null;
/** The one shared sign atlas + material (singleton). */
export function signAtlas() {
  if (_atlas) return _atlas;
  const c = document.createElement('canvas'); c.width = c.height = ATLAS;
  const g = c.getContext('2d');
  g.clearRect(0, 0, ATLAS, ATLAS);
  { const [x, y, w, h] = REG.white; g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h); }

  // LOST KEY? poster — cream paper, red banner, a drawn key, where it is
  {
    const [x, y, w, h] = REG.poster;
    g.fillStyle = '#fff3d2'; g.fillRect(x, y, w, h);
    g.fillStyle = '#d2263a'; g.fillRect(x, y, w, 92);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'LOST', x + w / 2, y + 30, 50, '#fff6e0');
    text(g, 'KEY?', x + w / 2, y + 70, 50, '#ffd84a');
    g.fillStyle = 'rgba(255,200,60,0.35)'; g.beginPath(); g.arc(x + w / 2, y + 160, 58, 0, Math.PI * 2); g.fill();
    drawKeyIcon(g, x + w / 2, y + 150, 1.05);
    text(g, 'FOUND!', x + w / 2, y + 250, 42, '#d2263a');
    text(g, 'Lost Property', x + w / 2, y + 286, 30, '#3b2415', 800);
    text(g, 'WELCOME PLAZA', x + w / 2, y + 318, 28, '#3b2415', 900);
    g.strokeStyle = '#c8a878'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle = 'rgba(230,230,210,0.85)';                       // tape
    g.fillRect(x + 8, y + 4, 44, 16); g.fillRect(x + w - 52, y + 4, 44, 16);
  }
  // LOST PROPERTY board
  {
    const [x, y, w, h] = REG.lostprop;
    g.fillStyle = '#2f5d4e'; roundRect(g, x + 4, y + 4, w - 8, h - 8, 18); g.fill();
    g.lineWidth = 10; g.strokeStyle = '#d9b35a'; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'LOST PROPERTY', x + w / 2, y + 52, 58, '#ffe39a', 900, w - 60);
    g.fillStyle = '#d9b35a'; g.fillRect(x + 60, y + 88, w - 120, 4);
    text(g, 'found: one key, cat-shaped', x + w / 2, y + 122, 34, '#f4f0e0', 800, w - 50);
    text(g, 'opens: nothing. probably.', x + w / 2, y + 162, 34, '#f4f0e0', 800, w - 50);
    text(g, '(NOT the hatch on Yarn Hill)', x + w / 2, y + 208, 30, '#ffb0a0', 800, w - 50);
  }
  // plaque on the plinth
  {
    const [x, y, w, h] = REG.plaque;
    g.fillStyle = '#d9b35a'; roundRect(g, x + 4, y + 4, w - 8, h - 8, 12); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#8a6420'; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'PLEASE DO', x + w / 2, y + 38, 34, '#4a3010');
    text(g, 'NOT TOUCH', x + w / 2, y + 76, 34, '#4a3010');
  }
  // WINCH GOES HERE (the catapult cradle)
  {
    const [x, y, w, h] = REG.cradle;
    g.fillStyle = '#ffe14a'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = '#222';
    for (let i = -2; i < 12; i++) { g.beginPath(); g.moveTo(x + 4 + i * 26, y + 4); g.lineTo(x + 18 + i * 26, y + 4); g.lineTo(x + 4 + i * 26 - 10, y + 22); g.lineTo(x - 10 + i * 26, y + 22); g.closePath(); g.fill(); }
    g.fillStyle = '#ffe14a'; g.fillRect(x + 4, y + 22, w - 8, h - 30);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'WINCH', x + w / 2, y + 52, 44, '#222');
    text(g, 'GOES HERE', x + w / 2, y + 92, 34, '#222');
  }
  // WINCH — property of The Big Fling
  {
    const [x, y, w, h] = REG.winchsign;
    g.fillStyle = '#e8d3a8'; roundRect(g, x + 4, y + 4, w - 8, h - 8, 14); g.fill();
    g.lineWidth = 12; g.strokeStyle = '#6b4a30'; g.stroke();
    drawWinchIcon(g, x + 88, y + 86, 1.25);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'WINCH', x + 320, y + 72, 84, '#b0202e');
    text(g, 'property of', x + w / 2, y + 150, 32, '#3b2415', 800);
    text(g, 'THE BIG FLING', x + w / 2, y + 190, 44, '#3b2415', 900);
    text(g, 'please return (up the harbour road)', x + w / 2, y + 228, 24, '#6b4a30', 800, w - 50);
  }
  // WANTED: WINCH (pinned at the catapult)
  {
    const [x, y, w, h] = REG.wposter;
    g.fillStyle = '#fff3d2'; g.fillRect(x, y, w, h);
    g.fillStyle = '#2f7fa0'; g.fillRect(x, y, w, 70);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    text(g, 'MISSING:', x + w / 2, y + 36, 42, '#ffffff');
    drawWinchIcon(g, x + w / 2 - 12, y + 120, 1.3);
    text(g, 'WINCH', x + w / 2, y + 186, 46, '#b0202e');
    text(g, 'on the quay by', x + w / 2, y + 222, 24, '#3b2415', 800);
    text(g, "Rusty's crate", x + w / 2, y + 250, 26, '#3b2415', 900);
    g.strokeStyle = '#c8a878'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
  }
  // fingerpost boards (R = point right as you read it, L = point left)
  const keyI = (gg, cx, cy) => drawKeyIcon(gg, cx, cy - 4, 0.62);
  const winI = (gg, cx, cy) => drawWinchIcon(gg, cx, cy, 0.72);
  for (const [dir, suf] of [[1, 'R'], [-1, 'L']]) {
    arrowBoard(g, REG['key_' + suf], dir, '#ffd54a', '#8a5a14', [{ t: 'LOST KEY', s: 50 }], keyI);
    arrowBoard(g, REG['quay_' + suf], dir, '#9fe0e8', '#1f5a66', [{ t: 'WINCH', s: 42, c: '#123c46' }, { t: "on the quay · Rusty's", s: 26, c: '#1f5a66' }], winI);
    arrowBoard(g, REG['plaza_' + suf], dir, '#ffd54a', '#8a5a14', [{ t: 'CAVE KEY', s: 40 }, { t: 'Lost Property · Welcome Plaza', s: 24 }], keyI);
    arrowBoard(g, REG['back_' + suf], dir, '#ffe14a', '#222222', [{ t: 'INSTALL WINCH', s: 36, c: '#222' }, { t: 'at the back, by the ladder', s: 24, c: '#333' }], null);
  }

  // the night-glow twin: every face at ~55%, the white wood texel black
  const c2 = document.createElement('canvas'); c2.width = c2.height = ATLAS;
  const g2 = c2.getContext('2d');
  g2.drawImage(c, 0, 0);
  g2.globalCompositeOperation = 'source-atop';
  g2.fillStyle = 'rgba(0,0,0,0.42)'; g2.fillRect(0, 0, ATLAS, ATLAS);
  g2.globalCompositeOperation = 'source-over';
  { const [x, y, w, h] = REG.white; g2.fillStyle = '#000000'; g2.fillRect(x, y, w, h); }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const glow = new THREE.CanvasTexture(c2);
  glow.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({
    map: tex, vertexColors: true, flatShading: true, roughness: 0.84, metalness: 0,
    alphaTest: 0.5, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0,
  });
  _atlas = {
    canvas: c, tex, glow, material, REG,
    /** UV rect for a region: [u0, v0, u1, v1] (inset by 2 px against bleed). */
    uv(name) {
      const r = REG[name] || REG.white;
      const i = 2 / ATLAS;
      return [r[0] / ATLAS + i, 1 - (r[1] + r[3]) / ATLAS + i, (r[0] + r[2]) / ATLAS - i, 1 - r[1] / ATLAS - i];
    },
    /** Night ramp — call once per frame from anyone. */
    night(k) { material.emissiveIntensity = 0.62 * k; },
  };
  return _atlas;
}

/**
 * A sign cluster: stone/wood parts coloured by vertex colour (their UVs sit on
 * the atlas's white texel), plus text faces UV-mapped into the atlas. build()
 * returns ONE mesh on the shared atlas material.
 */
export class Site extends B {
  constructor() { super(); this.atlas = signAtlas(); }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null) {
    super.add(geo, color, x, y, z, rx, ry, rz, s);
    whiteUV(this.parts[this.parts.length - 1], this.atlas);
    return this;
  }
  beam(a, b, thick, color) { super.beam(a, b, thick, color); whiteUV(this.parts[this.parts.length - 1], this.atlas); return this; }
  /** A text face (+Z normal before rotation), UV-mapped to an atlas region. */
  face(region, w, h, x, y, z, ry = 0, rx = 0, rz = 0) {
    const g = paint(new THREE.PlaneGeometry(w, h), 0xffffff);
    const [u0, v0, u1, v1] = this.atlas.uv(region);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    this.parts.push(place(g, x, y, z, rx, ry, rz));
    return this;
  }
  /** A two-faced fingerpost arm: tip points along +X of `ry` (world yaw). */
  arm(name, w, h, x, y, z, ry) {
    const c = Math.cos(ry), s = Math.sin(ry), off = 0.035;
    // front face normal = local +Z rotated by ry → (sin ry, cos ry)
    this.face(name + '_R', w, h, x + s * off, y, z + c * off, ry);
    this.face(name + '_L', w, h, x - s * off, y, z - c * off, ry + Math.PI);
    return this;
  }
  build(name) {
    const g = this.geometry();
    if (!g) return null;
    const m = new THREE.Mesh(g, this.atlas.material);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    // Sign clusters are low or thin and never hide the visitor, but a merged
    // cluster's bounding sphere is wide: camera.js's blocker fade would ghost
    // the whole display whenever you stand next to it (it did — the plinth
    // vanished exactly when you walked up to take the key).
    m.userData.noFade = true;
    return m;
  }
}
function whiteUV(geo, atlas) {
  const [u0, v0, u1, v1] = atlas.uv('white');
  const u = (u0 + u1) / 2, v = (v0 + v1) / 2;
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { arr[i * 2] = u; arr[i * 2 + 1] = v; }
  geo.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
}

let _beamTex = null;
function beamTexture() {
  if (_beamTex) return _beamTex;
  const W = 128, H = 128;
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W * 2, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W * 2; x++) {
    let a = 0;
    if (x < W) {                                   // left: the column
      const t = 1 - (y + 0.5) / H;                 // 0 at the foot
      const u = (x + 0.5) / W * 2 - 1;
      const wf = 0.5 + 0.5 * t;
      const core = Math.exp(-Math.pow(u / (0.16 * wf + 0.04), 2)) * 0.9;
      const halo = Math.exp(-Math.pow(u / (0.55 * wf + 0.08), 2)) * 0.34;
      a = Math.min(1, (core + halo) * Math.pow(1 - t, 1.25) * Math.min(1, t * 14 + 0.25));
    } else {                                       // right: the ground pool
      const u = (x - W + 0.5) / W * 2 - 1, v = (y + 0.5) / H * 2 - 1, r = Math.hypot(u, v);
      if (r < 1) {
        const core = Math.pow(Math.max(0, 1 - r / 0.6), 1.6) * 0.6;
        const ring = Math.exp(-Math.pow((r - 0.72) / 0.07, 2)) * 0.9;
        const ring2 = Math.exp(-Math.pow((r - 0.92) / 0.035, 2)) * 0.5;
        a = Math.min(1, core + ring + ring2) * Math.min(1, (1 - r) / 0.06);
      }
    }
    const i = (y * W * 2 + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = (a * 255) | 0;
  }
  g.putImageData(img, 0, 0);
  _beamTex = new THREE.CanvasTexture(c);
  _beamTex.colorSpace = THREE.SRGBColorSpace;
  return _beamTex;
}
/**
 * The clearest standing spot near (ax, az): off every collider (circles AND
 * oriented boxes) by `need`, on dry land, with the path edge `pathMin..pathMax`
 * away, not inside any `avoid` circle, and NOT inside a terrain decor rock.
 * Deterministic ring search.
 *
 * The rock test matters: terrain's bluff boulders (terrain_*_decor) under
 * s 2.4 carry no collider at all, so a collider-only clearance happily stood
 * the Yarn Hill fingerpost INSIDE a 2.7-unit boulder (only its top arm showed).
 * Every candidate's footprint (`foot`, default 0.9 u) is now sampled against
 * the decor triangles and rejected where rock rises more than `lift` (0.4 u)
 * above world.height. Pass `rocks: false` to skip it.
 *
 * `cleared`: boxes WE have already claimed with clearanceClaim (ride.js).
 * Nature blanks its own trunks/boulders inside such a box on world:ready, so
 * a plain circle collider (no box, no `h`) whose centre lies inside one is
 * already doomed and must not steer the search — at the Yarn Hill hatch a
 * 2.8-unit outcrop the apron claim deletes had pushed the post onto the rock.
 */
export function itemSpot(ctx, ax, az, o = {}) {
  // the decor triangles that can matter, gathered ONCE for the widest pass
  const rocks = o.rocks === false ? null : decorTris(ctx, ax, az, (o.radius ?? 7) + 6 + (o.foot ?? 0.9) + 1);
  // strict first; if nothing qualifies, relax (less clearance, wider path band,
  // bigger search) instead of silently dropping the prop on its anchor
  for (let k = 0; k < 4; k++) {
    const r = spotSearch(ctx, ax, az, {
      ...o,
      rocks,
      need: (o.need ?? 2.0) * (1 - k * 0.18),
      pathMax: (o.pathMax ?? 7) + k * 2,
      pathMin: Math.max(-99, (o.pathMin ?? 1.5) - k * 0.4),
      radius: (o.radius ?? 7) + k * 2,
      farSide: k < 2 ? o.farSide : false,
    });
    if (r) { r.relaxed = k; return r; }
  }
  return { x: ax, z: az, clear: 0, edge: 0, score: -1e9, fallback: true };
}
function spotSearch(ctx, ax, az, o) {
  const world = ctx.world, cols = ctx.colliders || [];
  const { radius = 7, step = 0.5, need = 2.0, pathMin = 1.5, pathMax = 7, minH = 1.0, pull = 0.25, avoid = [], prefer = null, farSide = false,
    rocks = null, foot = 0.9, lift = 0.4, cleared = null } = o;
  const fx = -Math.sin(0.78), fz = -Math.cos(0.78);          // away from the default lens
  let best = null;
  for (let r = 0; r <= radius + 1e-6; r += step) {
    const n = r === 0 ? 1 : Math.max(8, Math.round(r * 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
      if (world.height(x, z) < minH) continue;
      let bad = false;
      for (const v of avoid) if (Math.hypot(x - v.x, z - v.z) < v.r) { bad = true; break; }
      if (bad) continue;
      const np = world.nearestPath(x, z);
      const edge = np.path ? np.d - np.path.width / 2 : 99;
      if (edge < pathMin || edge > pathMax) continue;
      if (farSide) {                 // on the far side of its road, so the road is not in front of it
        const pp = nearestPathPoint(world, x, z);
        if ((x - pp.x) * fx + (z - pp.z) * fz < 0.3) continue;
      }
      const cl = clearanceAt(cols, x, z, need + 3, cleared);
      if (cl < need) continue;
      if (rocks && rockUnder(rocks, world, x, z, foot, lift)) continue;
      let score = Math.min(cl, need + 1.5) - r * pull;
      if (prefer) score -= Math.hypot(x - prefer.x, z - prefer.z) * (prefer.w ?? 0.05);
      if (!best || score > best.score) best = { x, z, clear: cl, edge, score };
    }
  }
  return best;
}
/**
 * World-space triangles of every terrain decor mesh (name ending '_decor':
 * bluff boulders, sea-cliffs, the quay) whose xz bounds touch the square of
 * half-size R round (ax, az). Flat array, 9 floats per triangle. Terrain is
 * created before the escape system, so the meshes are in the scene by now.
 */
export function decorTris(ctx, ax, az, R) {
  const out = [];
  const x0 = ax - R, x1 = ax + R, z0 = az - R, z1 = az + R;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const meshes = [];
  try { ctx.scene?.traverse?.((m) => { if (m.isMesh && !m.isInstancedMesh && /_decor$/.test(m.name || '')) meshes.push(m); }); } catch (e) { return out; }
  for (const m of meshes) {
    const pos = m.geometry?.attributes?.position;
    if (!pos) continue;
    m.updateMatrixWorld?.();
    const mw = m.matrixWorld, idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
      b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
      c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
      if (Math.max(a.x, b.x, c.x) < x0 || Math.min(a.x, b.x, c.x) > x1) continue;
      if (Math.max(a.z, b.z, c.z) < z0 || Math.min(a.z, b.z, c.z) > z1) continue;
      out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  }
  return out;
}
/** Highest decor surface straight above/below (x, z), or -Infinity. */
export function decorTopAt(tris, x, z) {
  let top = -Infinity;
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i], az = tris[i + 2], bx = tris[i + 3], bz = tris[i + 5], cx = tris[i + 6], cz = tris[i + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-9) continue;                        // edge-on / culled lump
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    if (u < 0 || u > 1) continue;
    const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    if (v < 0 || u + v > 1) continue;
    const y = u * tris[i + 1] + v * tris[i + 4] + (1 - u - v) * tris[i + 7];
    if (y > top) top = y;
  }
  return top;
}
/** Does decor rock stand more than `lift` proud of the ground anywhere in the footprint? */
export function rockUnder(tris, world, x, z, foot, lift) {
  if (!tris.length) return false;
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI * 2, rr = k === 0 ? 0 : foot;
    const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
    if (decorTopAt(tris, px, pz) > world.height(px, pz) + lift) return true;
  }
  return false;
}
/** Is (x, z) inside any of the oriented boxes {x, z, w, d, rot}? */
function inBoxes(boxes, x, z) {
  for (const b of boxes) {
    const ca = Math.cos(b.rot || 0), sa = Math.sin(b.rot || 0), dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx * ca + dz * sa) <= b.w / 2 && Math.abs(-dx * sa + dz * ca) <= b.d / 2) return true;
  }
  return false;
}
/**
 * Distance to the nearest solid collider (circles and oriented boxes).
 * `cleared` (optional): claimed boxes — plain circles inside them are skipped
 * (nature deletes them on world:ready; see itemSpot).
 */
export function clearanceAt(cols, x, z, cap = 8, cleared = null) {
  let d = cap;
  for (let k = 0; k < cols.length; k++) {
    const c = cols[k];
    if (!c || c.claim) continue;
    if (cleared && cleared.length && !c.box && c.h == null && inBoxes(cleared, c.x, c.z)) continue;
    let dd;
    if (c.box) {
      if (!(c.w > 0) || !(c.d > 0)) continue;
      const ca = Math.cos(c.rot || 0), sa = Math.sin(c.rot || 0);
      const dx = x - c.x, dz = z - c.z;
      const lx = Math.abs(dx * ca + dz * sa) - c.w / 2, lz = Math.abs(-dx * sa + dz * ca) - c.d / 2;
      dd = (lx > 0 || lz > 0) ? Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) : Math.max(lx, lz);
    } else {
      if (!(c.r > 0)) continue;
      dd = Math.hypot(x - c.x, z - c.z) - c.r;
    }
    if (dd < d) d = dd;
  }
  return d;
}

// ── where the two items live (memoised on ctx: cave.js and catapult.js both ask)
/** Closest point on any path polyline (optionally one island's). */
export function nearestPathPoint(world, x, z, island = null) {
  let best = { x, z, d: Infinity, id: null };
  for (const p of world.PATHS || []) {
    if (island && p.island !== island) continue;
    const pts = p.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { x: px, z: pz, d, id: p.id };
    }
  }
  return best;
}
/** Yaw that turns local +Z from (x,z) toward (tx,tz). */
export const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
/**
 * Yaw for a sign that must read from its road AND from the default iso camera
 * (azimuth ≈ 0.78, i.e. the lens sits south-east): the circular mean of the two.
 * A board that faces a road lying north-west of it otherwise shows the camera
 * nothing but its edge.
 */
export function readYaw(x, z, tx, tz, w = 0.5, camAz = 0.78) {
  const a = yawTo(x, z, tx, tz);
  return Math.atan2(Math.sin(a) * (1 - w) + Math.sin(camAz) * w, Math.cos(a) * (1 - w) + Math.cos(camAz) * w);
}
/** Yaw for Site.arm() so the arrow tip points from (x,z) toward (tx,tz). */
export const armYaw = (x, z, tx, tz) => Math.atan2(-(tz - z), tx - x);

function memo(ctx) { return (ctx.__escapeItems = ctx.__escapeItems || {}); }

/**
 * THE KEY: the lawn just below the Welcome Plaza, east of the harbour road —
 * everybody crosses the plaza in their first minute on the island and the road
 * to Rusty starts right beside it. Faces the road.
 */
export function keySpot(ctx) {
  const M = memo(ctx);
  if (M.key) return M.key;
  const w = ctx.world;
  const s = itemSpot(ctx, 90, 28.5, { radius: 6, need: 1.9, pathMin: 2.0, pathMax: 5.6, minH: 1.2, pull: 0.35 });
  const np = nearestPathPoint(w, s.x, s.z, 'cat');
  M.key = { x: s.x, z: s.z, gy: w.height(s.x, s.z), ry: readYaw(s.x, s.z, np.x, np.z), road: { x: np.x, z: np.z }, clear: s.clear, edge: s.edge, fallback: !!s.fallback };
  return M.key;
}

/**
 * THE WINCH: on the quay beside Rusty's crate hideout (whose deck is not a
 * collider, so it is avoided by hand), on the side nearest the road up to The
 * Big Fling. Faces the harbour road.
 */
export function winchSpot(ctx) {
  const M = memo(ctx);
  if (M.winch) return M.winch;
  const w = ctx.world;
  const rusty = ctx.systems.catCitizens?.byKey?.('rusty');
  let hx = 96.5, hz = 41, f = -0.6;
  if (rusty && Array.isArray(rusty.home) && Number.isFinite(rusty.face)) {
    f = rusty.face;
    const c = Math.cos(f), s = Math.sin(f);
    hx = rusty.home[0] - (0.55 * c + 1.30 * s);
    hz = rusty.home[1] - (-0.55 * s + 1.30 * c);
  }
  const sideX = Math.cos(f), sideZ = -Math.sin(f), fwdX = Math.sin(f), fwdZ = Math.cos(f);
  const road = { x: 100, z: 58 };
  let bestA = null;
  for (const side of [-1, 1]) {
    const ax = hx + sideX * side * 4.4 + fwdX * 1.2, az = hz + sideZ * side * 4.4 + fwdZ * 1.2;
    const d = Math.hypot(ax - road.x, az - road.z);
    if (!bestA || d < bestA.d) bestA = { x: ax, z: az, d };
  }
  const sp = itemSpot(ctx, bestA.x, bestA.z, {
    radius: 3.5, need: 1.5, pathMin: 0.9, pathMax: 5, minH: 1.0, pull: 0.35,
    avoid: [{ x: hx, z: hz, r: 3.6 }],
  });
  const np = nearestPathPoint(w, sp.x, sp.z, 'cat');
  M.winch = { x: sp.x, z: sp.z, gy: w.height(sp.x, sp.z), ry: readYaw(sp.x, sp.z, np.x, np.z), road: { x: np.x, z: np.z }, hideout: { x: hx, z: hz }, clear: sp.clear, edge: sp.edge, fallback: !!sp.fallback };
  return M.winch;
}

/** ui.addMapMarker when it exists (Contract G may land after us). */
export function mapMarker(ctx, m) {
  const U = ctx.systems.ui;
  if (!U) return false;
  try {
    if (typeof U.removeMapMarker === 'function') U.removeMapMarker(m.id);
    if (!m.remove && typeof U.addMapMarker === 'function') { U.addMapMarker({ id: m.id, x: m.x, z: m.z, glyph: m.glyph, label: m.label }); return true; }
  } catch (e) { /* the map is decoration here — never throw from a marker */ }
  return false;
}

/** Make sure inventory knows what a 'winch' is (only if its table lacks one). */
export function ensureWinchItem(ctx) {
  const T = ctx.systems.inventory?.ITEMS;
  if (T && !T.winch) T.winch = { id: 'winch', name: 'Winch', kind: 'tool', hint: 'install it at The Big Fling' };
}

// ── Rusty names the places ───────────────────────────────────────────────────
// His dialogue lives in cat/citizens (not ours). We listen to 'cat:talk' for
// his key and queue ONE extra line in his voice after his own, once the say
// queue has room (it holds 5 and his first meeting is 5 lines long).
const RUSTY_VOICE = { speaker: 'Rusty — Smuggler', portrait: { color: 0xe08a34 }, duration: 6.5 };
export function rustyHint(ctx, provider) {
  const M = memo(ctx);
  if (!M.rusty) {
    M.rusty = { providers: [], pending: [], talks: 0, wait: 0 };
    ctx.events.on('cat:talk', (e) => {
      const cat = e?.cat;
      if (!cat || cat.key !== 'rusty') return;
      const R = M.rusty;
      R.talks++;
      const first = String(e.line || '') === 'rusty:free';
      const lines = [];
      for (const p of R.providers) { try { const l = p(first); if (l) lines.push(l); } catch (err) {} }
      if (!lines.length) return;
      R.pending.length = 0;
      if (first) for (const l of lines) R.pending.push(l);
      else R.pending.push(lines[R.talks % lines.length]);
      R.wait = 0.6;
    });
  }
  M.rusty.providers.push(provider);
}
/** Call every frame (either file may; it is idempotent per frame). */
export function drainRustyHints(ctx, dt) {
  const R = memo(ctx).rusty;
  if (!R || !R.pending.length) return;
  if (R.frame === ctx.state.elapsed) return;
  R.frame = ctx.state.elapsed;
  if ((R.wait -= dt) > 0) return;
  const U = ctx.systems.ui, p = ctx.systems.player?.position;
  const rusty = ctx.systems.catCitizens?.byKey?.('rusty');
  if (p && rusty && Math.hypot(p.x - rusty.x, p.z - rusty.z) > 12) { R.pending.length = 0; return; }   // walked off
  if (!U?.say || (U.sayQueue?.length ?? 0) > 3) return;
  U.say(R.pending.shift(), RUSTY_VOICE);
  R.wait = 0.4;
}

// ── ONE mesh for every light column (key + winch) ────────────────────────────
// Each column billboards about its OWN axis in the vertex shader, so the two
// columns — twenty units apart and usually in the same frame — cost one draw
// call between them. Per-column gain (0 hides it) is a uniform vec4 (4 slots).
const BEAM_VS = /* glsl */`
attribute vec3 center;
attribute vec2 corner;
attribute float kind;
attribute float slot;
attribute vec3 tint;
uniform vec4 uGain;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float g = slot < 0.5 ? uGain.x : (slot < 1.5 ? uGain.y : (slot < 2.5 ? uGain.z : uGain.w));
  vec3 p;
  if (kind < 0.5) {
    vec3 d = cameraPosition - center; d.y = 0.0;
    float L = length(d);
    vec3 f = L > 0.001 ? d / L : vec3(0.0, 0.0, 1.0);
    vec3 r = vec3(f.z, 0.0, -f.x);
    p = center + r * corner.x + vec3(0.0, corner.y, 0.0);
  } else {
    p = center + vec3(corner.x, 0.06, corner.y);
  }
  vUv = uv;
  vCol = tint * g;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const BEAM_FS = /* glsl */`
uniform sampler2D uTex;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float a = texture2D(uTex, vUv).a;
  gl_FragColor = vec4(vCol, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export function beamField(ctx) {
  const M = memo(ctx);
  if (M.beams) return M.beams;
  const cols = [];
  const uniforms = { uGain: { value: new THREE.Vector4(0, 0, 0, 0) }, uTex: { value: beamTexture() } };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = 'escape_item_beams';
  mesh.renderOrder = 4; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.userData.noRay = true; mesh.userData.noFade = true;
  mesh.visible = false;
  ctx.scene.add(mesh);
  const _c = new THREE.Color();
  function rebuild() {
    const pos = [], cen = [], cor = [], kind = [], slot = [], tint = [], uv = [], idx = [];
    let v = 0;
    cols.forEach((c, s) => {
      _c.setHex(c.hex);
      const push = (cx, cy, k, u, vv) => {
        pos.push(c.x, c.y + (k < 0.5 ? cy : 0), c.z); cen.push(c.x, c.y, c.z); cor.push(cx, cy);
        kind.push(k); slot.push(s); tint.push(_c.r, _c.g, _c.b); uv.push(u, vv); return v++;
      };
      const a = push(-c.w / 2, 0, 0, 0, 0), b = push(c.w / 2, 0, 0, 0.5, 0);
      const d = push(-c.w / 2, c.h, 0, 0, 1), e = push(c.w / 2, c.h, 0, 0.5, 1);
      idx.push(a, b, e, a, e, d);
      const mid = push(0, 0, 1, 0.75, 0.5), N = 28, first = v;
      for (let i = 0; i < N; i++) {
        const t = i / N * Math.PI * 2, cx = Math.cos(t), sz = Math.sin(t);
        push(cx * c.pool, sz * c.pool, 1, 0.75 + cx * 0.25, 0.5 + sz * 0.5);
      }
      for (let i = 0; i < N; i++) idx.push(mid, first + i, first + (i + 1) % N);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('center', new THREE.Float32BufferAttribute(cen, 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute(cor, 2));
    g.setAttribute('kind', new THREE.Float32BufferAttribute(kind, 1));
    g.setAttribute('slot', new THREE.Float32BufferAttribute(slot, 1));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    let maxW = 0; for (const c of cols) maxW = Math.max(maxW, c.w, c.pool * 2);
    g.boundingSphere.radius += maxW;                // the shaft swings round its axis
    mesh.geometry.dispose();
    mesh.geometry = g;
  }
  M.beams = {
    mesh,
    /** Add a column; returns its slot (0..3). */
    add(hex, { x, y, z, height = 17, width = 3.0, pool = 2.0 }) {
      if (cols.length >= 4) return -1;
      cols.push({ hex, x, y, z, h: height, w: width, pool });
      rebuild();
      return cols.length - 1;
    },
    /** Per-frame gain for a slot (0 = gone). */
    set(s, gain) {
      if (s < 0) return;
      uniforms.uGain.value.setComponent(s, gain);
      const G = uniforms.uGain.value;
      mesh.visible = G.x > 0.004 || G.y > 0.004 || G.z > 0.004 || G.w > 0.004;
    },
  };
  return M.beams;
}

// ── LAMPLIGHT POOLS ──────────────────────────────────────────────────────────
// A lantern that lights nothing reads as a sticker. These are soft additive
// pools laid ON the terrain (each is a small grid whose vertices ride the
// ground, so they bend over slopes instead of slicing through them), all of a
// site's pools in ONE mesh, faded in by the caller after dark. No ring, no
// fringe: a plain radial falloff that is brightest under the lamp.
let _poolTex = null;
function poolTexture() {
  if (_poolTex) return _poolTex;
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [t, a] of [[0, 1], [0.22, 0.82], [0.5, 0.42], [0.78, 0.12], [1, 0]]) grd.addColorStop(t, `rgba(255,255,255,${a})`);
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  _poolTex = new THREE.CanvasTexture(c);
  _poolTex.colorSpace = THREE.SRGBColorSpace;
  return _poolTex;
}
/**
 * pools: [{ x, z, r, sx? (stretch along x), y? (a fixed floor instead of the
 * terrain) }]. Returns { mesh, set(gain) } — gain 0 hides the mesh entirely.
 */
export function poolMesh(ctx, pools, hex = 0xffb45a, o = {}) {
  const world = ctx.world;
  const N = o.grid ?? 8, lift = o.lift ?? 0.09;
  const pos = [], uv = [], idx = [];
  const top = (x, z) => {             // the ground mesh sits above world.height on convex ground
    let m = world.height(x, z);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; const h = world.height(x + Math.cos(a) * 0.7, z + Math.sin(a) * 0.7); if (h > m) m = h; }
    return m;
  };
  let v = 0;
  for (const p of pools) {
    const rx = p.r * (p.sx ?? 1), rz = p.r;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const u = i / N, w = j / N;
      const x = p.x + (u * 2 - 1) * rx, z = p.z + (w * 2 - 1) * rz;
      pos.push(x, (p.y ?? top(x, z)) + lift, z); uv.push(u, w);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = v + j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    v += (N + 1) * (N + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({
    color: hex, map: poolTexture(), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.name = o.name || 'escape_lamp_pools';
  mesh.renderOrder = 2; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.userData.noRay = true; mesh.userData.noFade = true;
  mesh.visible = false;
  ctx.scene.add(mesh);
  return {
    mesh,
    set(gain) { material.opacity = gain; mesh.visible = gain > 0.004; },
  };
}
