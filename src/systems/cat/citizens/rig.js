// ─────────────────────────────────────────────────────────────────────────────
// PARAMETRIC CAT RIG
//
// A cat is a small hierarchy of empty Object3Ds (bones) living OUTSIDE the scene
// graph. Every visible part is an instance in a shared InstancedMesh pool, so
// 42 cats cost ~29 draw calls instead of ~700. Each frame the brain poses the
// bones, we call updateMatrixWorld on the cat root, then each pool copies its
// bones' matrixWorld into its instanceMatrix.
//
// Build parameters: size, fur pattern (atlas tile), build (normal|chonky|buff),
// eye colour, clothing (cap/topHat/sunHat/apron/tie/glasses/tank/collar) and one
// held accessory.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mat } from '../../../core/util.js';
import { furMaterial, tileUV } from './fur.js';

// ── geometry helpers ─────────────────────────────────────────────────────────
const sph = (r, w, h) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, s, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const cone = (r, h, s) => new THREE.ConeGeometry(r, h, s);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** Merge simple geometries, tinting each piece with vertex colours. */
function merge(items) {
  const parts = items.map((it) => ({ g: it.g.index ? it.g.toNonIndexed() : it.g, color: it.color ?? 0xffffff }));
  let n = 0; for (const p of parts) n += p.g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  const c = new THREE.Color();
  let o = 0;
  for (const p of parts) {
    const cnt = p.g.attributes.position.count;
    pos.set(p.g.attributes.position.array.subarray(0, cnt * 3), o * 3);
    if (p.g.attributes.normal) nor.set(p.g.attributes.normal.array.subarray(0, cnt * 3), o * 3);
    if (p.g.attributes.uv) uv.set(p.g.attributes.uv.array.subarray(0, cnt * 2), o * 2);
    c.set(p.color); // ColorManagement converts sRGB hex → linear working space
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += cnt;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
const solo = (g, color) => merge([{ g, color }]);
export { merge, solo, sph, cyl, cone, box };

/** Soft round falloff used as the contact-shadow alpha map (and eye-glow sprite). */
let _blobTex = null;
export function blobTexture(size = 64) {
  if (_blobTex) return _blobTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.72)');
  grd.addColorStop(0.78, 'rgba(255,255,255,0.20)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  _blobTex = new THREE.CanvasTexture(cv);
  _blobTex.colorSpace = THREE.SRGBColorSpace;
  _blobTex.wrapS = _blobTex.wrapT = THREE.ClampToEdgeWrapping;
  return _blobTex;
}
/** Flip the V coordinate so v=0 is the TOP of the part (matches the fur tiles). */
function flipV(geo) { const a = geo.attributes.uv.array; for (let i = 1; i < a.length; i += 2) a[i] = 1 - a[i]; return geo; }

// ── instance pool: one draw call per body-part type ──────────────────────────
const _c = new THREE.Color();
export class Pool {
  constructor(name, geo, material, opts = {}) {
    this.name = name; this.geo = geo; this.material = material; this.opts = opts;
    this.nodes = []; this.colors = []; this.tiles = []; this.mesh = null;
  }
  add(node, opt = {}) {
    this.nodes.push(node); this.colors.push(opt.color ?? 0xffffff); this.tiles.push(opt.tile || [0, 0]);
    return this.nodes.length - 1;
  }
  build(group) {
    const n = this.nodes.length; if (!n) return null;
    const m = new THREE.InstancedMesh(this.geo, this.material, n);
    m.name = 'catcitizen_' + this.name;
    m.frustumCulled = false;
    m.castShadow = !!this.opts.cast;
    m.receiveShadow = this.opts.receive !== false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) m.setColorAt(i, _c.set(this.colors[i]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (this.opts.fur) {
      const arr = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { arr[i * 2] = this.tiles[i][0]; arr[i * 2 + 1] = this.tiles[i][1]; }
      this.geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(arr, 2));
    }
    this.mesh = m; group.add(m); return m;
  }
  sync() {
    const m = this.mesh; if (!m) return;
    const nodes = this.nodes;
    for (let i = 0; i < nodes.length; i++) m.setMatrixAt(i, nodes[i].matrixWorld);
    m.instanceMatrix.needsUpdate = true;
  }
  /** Repaint one instance at runtime (eye colour: house cat → tiger). */
  setColor(i, hex) {
    const m = this.mesh; if (!m || !m.instanceColor) return;
    m.setColorAt(i, _c.set(hex)); m.instanceColor.needsUpdate = true;
  }
  /** Repaint one instance's coat at runtime (cat → tiger and back). */
  setTile(i, uv) {
    const a = this.geo.getAttribute && this.geo.getAttribute('aTile');
    if (!a || i * 2 + 1 >= a.array.length) return;
    a.array[i * 2] = uv[0]; a.array[i * 2 + 1] = uv[1];
    a.needsUpdate = true;
  }
  get tris() { return this.mesh ? this.geo.attributes.position.count / 3 * this.nodes.length : 0; }
}

// ── the shared part library ──────────────────────────────────────────────────
export function createRigLibrary() {
  const furMat = furMaterial();
  const skinMat = mat(0xffffff, { roughness: 0.8, vertexColors: true });
  const eyeMat = mat(0xffffff, { roughness: 0.3, vertexColors: true, emissive: 0xffe08a, emissiveIntensity: 0 });
  const darkMat = mat(0xffffff, { roughness: 0.45, vertexColors: true });
  const clothMat = mat(0xffffff, { roughness: 0.72, vertexColors: true });
  const propMat = mat(0xffffff, { roughness: 0.6, vertexColors: true });
  const glowMat = mat(0xffffff, { roughness: 0.4, vertexColors: true, emissive: 0xffce6a, emissiveIntensity: 0.25 });

  // --- furred parts ----------------------------------------------------------
  const gBody = solo(sph(0.30, 11, 7));
  // BUFF torso: lathe of revolution — tiny waist, absurd chest.
  const prof = [new THREE.Vector2(0.02, -0.36)];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    prof.push(new THREE.Vector2(Math.max(0.03, 0.135 + 0.335 * Math.pow(t, 0.7) * (1 - 0.34 * Math.pow(t, 4.5))), -0.36 + t * 0.80));
  }
  prof.push(new THREE.Vector2(0.02, 0.45));
  const gBodyBuff = solo(flipV(new THREE.LatheGeometry(prof, 11).toNonIndexed()));
  const gHead = solo(sph(0.30, 10, 7));
  // EARS: tall triangles that clear the top of the head, so the silhouette says
  // CAT before anything else does. Base sits low on the skull, tip ~0.30 above it.
  const gEar = solo((() => { const g = cone(0.152, 0.42, 5); g.translate(0, 0.21, 0); g.scale(1, 1, 0.60); return g; })());
  // LIMBS are deliberately fat. At 0.09 radius a white cat's arm was a pale
  // stick the same width as its whiskers; the gym crew in particular read as a
  // row of cats waving six whiskers each. Chunky limbs, FarmVille rules.
  const gLimb = flipV(merge([
    { g: cyl(0.116, 0.100, 0.30, 5) },
    { g: (() => { const s = sph(0.118, 5, 3); s.scale(1.16, 0.8, 1.3); s.translate(0, -0.15, 0.015); return s; })() },
    { g: (() => { const s = sph(0.120, 5, 3); s.translate(0, 0.145, 0); return s; })() },   // shoulder/hip ball
  ]));
  const gTail = merge([
    { g: cyl(0.076, 0.098, 0.20, 5) },
    { g: (() => { const s = sph(0.082, 5, 3); s.translate(0, 0.10, 0); return s; })() },
  ]);
  const gDelt = solo(sph(0.2, 8, 6));

  // --- face -----------------------------------------------------------------
  const gEarInner = solo((() => { const g = cone(0.098, 0.30, 5); g.translate(0, 0.155, 0); g.scale(1, 1, 0.50); return g; })(), 0xffb2c2);
  // MUZZLE: a real bump off the front of the head — pale snout, pink triangle
  // nose, dark mouth slit. Reads as a face at 20 m.
  const gMuzzle = merge([
    { g: (() => { const s = sph(0.150, 8, 5); s.scale(1.18, 0.82, 1.00); return s; })(), color: 0xfff6ea },
    { g: (() => { const s = sph(0.072, 6, 4); s.scale(1.0, 0.78, 0.9); s.translate(0, -0.075, 0.075); return s; })(), color: 0xfff2e2 }, // chin
    { g: (() => { const c = cone(0.062, 0.072, 4); c.rotateX(Math.PI); c.rotateY(Math.PI / 4); c.translate(0, 0.072, 0.115); return c; })(), color: 0xff7f9c }, // nose
    { g: (() => { const m = box(0.012, 0.055, 0.03); m.translate(0, -0.015, 0.145); return m; })(), color: 0x5a3a42 },                    // mouth
  ]);
  // FANGS: two ivory canines that hang below the muzzle. Zero-scaled by day —
  // they only come out when a citizen is wearing stripes.
  const gFang = merge([-1, 1].map((s) => ({
    g: (() => { const c = cone(0.030, 0.105, 4); c.rotateX(Math.PI); c.translate(s * 0.062, -0.045, 0.10); return c; })(),
    color: 0xfff6e2,
  })));
  // EYEPATCH: Rusty's. Dark disc over the left eye plus a strap round the skull.
  const gPatch = merge([
    { g: (() => { const d = sph(0.105, 8, 6); d.scale(1, 1.05, 0.42); return d; })(), color: 0x24202a },
    { g: (() => { const st = cyl(0.30, 0.30, 0.030, 12, true); st.rotateZ(0.30); return st; })(), color: 0x2e2932 },
    { g: (() => { const n = box(0.055, 0.018, 0.018); n.translate(0, 0.02, 0.05); return n; })(), color: 0x4a4048 },
  ]);
  const gEye = solo(sph(0.108, 6, 4));
  const gPupil = solo(sph(0.086, 5, 3), 0x0e0b13);
  const gWhisk = (() => {
    const items = [];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const w = cyl(0.010, 0.030, 0.40, 3);      // chunky enough not to alias away
      w.translate(0, 0.20, 0);
      w.rotateX(-0.26);
      w.rotateZ(-s * (Math.PI / 2 - (0.44 - i * 0.30)));
      w.translate(s * 0.075, 0.0, 0.06);
      items.push({ g: w, color: 0xfffdf4 });
    }
    return merge(items);
  })();

  // --- clothing -------------------------------------------------------------
  const gCap = merge([
    { g: (() => { const s = new THREE.SphereGeometry(0.305, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.5); s.scale(1, 0.62, 1); return s; })() },
    { g: (() => { const b = cyl(0.27, 0.27, 0.035, 10); b.scale(1, 1, 1.45); b.translate(0, 0.005, 0.19); return b; })(), color: 0xe8e8ea },
  ]);
  const gTopHat = merge([
    { g: (() => { const c = cyl(0.20, 0.195, 0.38, 10); c.translate(0, 0.22, 0); return c; })() },
    { g: (() => { const b = cyl(0.325, 0.325, 0.035, 12); b.translate(0, 0.035, 0); return b; })() },
    { g: (() => { const r = cyl(0.207, 0.207, 0.06, 10); r.translate(0, 0.09, 0); return r; })(), color: 0xf2c14e },
  ]);
  const gSunHat = merge([
    { g: (() => { const c = cone(0.40, 0.13, 12); c.translate(0, 0.06, 0); return c; })() },
    { g: (() => { const c = cyl(0.19, 0.23, 0.16, 10); c.translate(0, 0.15, 0); return c; })() },
  ]);
  // APRON: bib + skirt with real thickness, a darker waist band and two straps
  // that rise over the shoulders. Gus's rubber one is the same part in wet blue.
  const gApron = merge([
    { g: (() => { const b = box(0.46, 0.42, 0.085); b.translate(0, -0.15, 0); return b; })() },
    { g: (() => { const b = box(0.31, 0.28, 0.075); b.translate(0, 0.20, -0.004); return b; })() },
    { g: (() => { const b = box(0.50, 0.075, 0.10); b.translate(0, 0.06, 0); return b; })(), color: 0x8a6238 },
    { g: (() => { const s = box(0.075, 0.26, 0.06); s.rotateZ(0.20); s.translate(-0.175, 0.44, -0.05); return s; })() },
    { g: (() => { const s = box(0.075, 0.26, 0.06); s.rotateZ(-0.20); s.translate(0.175, 0.44, -0.05); return s; })() },
  ]);
  const gTie = merge([
    { g: (() => { const k = box(0.09, 0.075, 0.06); k.translate(0, 0.085, 0); return k; })() },
    { g: (() => { const t = cone(0.078, 0.27, 4); t.rotateX(Math.PI); t.rotateY(Math.PI / 4); t.translate(0, -0.075, 0); return t; })() },
  ]);
  const gGlasses = merge([
    { g: (() => { const r = cyl(0.10, 0.10, 0.022, 10, true); r.rotateX(Math.PI / 2); r.translate(-0.118, 0, 0); return r; })(), color: 0x2a2a32 },
    { g: (() => { const r = cyl(0.10, 0.10, 0.022, 10, true); r.rotateX(Math.PI / 2); r.translate(0.118, 0, 0); return r; })(), color: 0x2a2a32 },
    { g: box(0.06, 0.018, 0.018), color: 0x2a2a32 },
    { g: (() => { const l = cyl(0.092, 0.092, 0.006, 10); l.rotateX(Math.PI / 2); l.translate(-0.118, 0, 0.004); return l; })(), color: 0xcdeaf2 },
    { g: (() => { const l = cyl(0.092, 0.092, 0.006, 10); l.rotateX(Math.PI / 2); l.translate(0.118, 0, 0.004); return l; })(), color: 0xcdeaf2 },
  ]);
  const gTank = merge([
    { g: cyl(0.405, 0.265, 0.42, 11, true) },
    { g: (() => { const s = box(0.085, 0.24, 0.05); s.translate(-0.175, 0.27, 0.135); return s; })() },
    { g: (() => { const s = box(0.085, 0.24, 0.05); s.translate(0.175, 0.27, 0.135); return s; })() },
  ]);
  // COLLAR + BANDANA: the hero tabby's kerchief, available to the whole cast.
  const gCollar = merge([
    { g: cyl(0.285, 0.285, 0.085, 12, true) },
    { g: (() => {                                        // kerchief hanging at the front
      const k = cone(0.20, 0.30, 4); k.rotateX(Math.PI); k.rotateY(Math.PI / 4);
      k.scale(1, 1, 0.42); k.translate(0, -0.13, 0.18); return k;
    })() },
    { g: (() => { const b = sph(0.062, 7, 5); b.translate(0, 0.0, 0.275); return b; })(), color: 0xf2c14e },
  ]);
  // MAYOR: sash across the chest + chain of office with a fat gold medallion.
  const gSash = merge([
    { g: (() => { const c = cyl(0.345, 0.345, 0.19, 14, true); c.scale(1, 1, 0.82); c.rotateZ(0.60); return c; })() },
    { g: (() => { const r = cyl(0.245, 0.245, 0.028, 14, true); r.translate(0, 0.23, 0.02); return r; })(), color: 0xf2c14e },
    { g: (() => { const m = sph(0.085, 9, 6); m.scale(1, 1, 0.5); m.translate(0, 0.02, 0.31); return m; })(), color: 0xf7d55e },
    { g: (() => { const m = sph(0.05, 7, 5); m.scale(1, 1, 0.5); m.translate(0, 0.02, 0.335); return m; })(), color: 0xb8431e },
  ]);
  // OFFICER MITTENS: peaked cap, white band, gold shield. Visible from behind too.
  const gCopCap = merge([
    { g: (() => { const s = new THREE.SphereGeometry(0.305, 11, 4, 0, Math.PI * 2, 0, Math.PI * 0.5); s.scale(1, 0.78, 1); s.translate(0, 0.03, 0); return s; })() },
    { g: (() => { const t = cyl(0.315, 0.315, 0.075, 12, true); return t; })(), color: 0xf0f0f4 },
    { g: (() => { const b = cyl(0.30, 0.30, 0.045, 12); b.scale(1, 1, 1.55); b.translate(0, -0.02, 0.20); return b; })(), color: 0x151d2c },
    { g: (() => { const sh = sph(0.09, 7, 5); sh.scale(0.95, 1.15, 0.32); sh.translate(0, 0.20, 0.24); return sh; })(), color: 0xf2c14e },
    { g: (() => { const sh = sph(0.05, 6, 4); sh.scale(0.95, 1.15, 0.3); sh.translate(0, 0.20, 0.255); return sh; })(), color: 0x1d3557 },
  ]);
  // BARISTA: visor — headband + long brim, nothing on top so the ears read.
  const gVisor = merge([
    { g: cyl(0.315, 0.315, 0.13, 12, true) },
    { g: (() => { const b = cyl(0.30, 0.30, 0.04, 12); b.scale(1, 1, 1.6); b.translate(0, -0.03, 0.22); return b; })(), color: 0x1f5a42 },
  ]);

  // --- held accessories ------------------------------------------------------
  const gBriefcase = merge([
    { g: box(0.30, 0.23, 0.11) },
    { g: (() => { const h = box(0.125, 0.035, 0.035); h.translate(0, 0.14, 0); return h; })(), color: 0x3b2a1c },
    { g: (() => { const l = box(0.302, 0.022, 0.112); return l; })(), color: 0xf2c14e },
  ]);
  const gFish = merge([
    { g: (() => { const s = sph(0.11, 7, 5); s.scale(1.75, 0.9, 0.55); return s; })(), color: 0xa9cfdd },
    { g: (() => { const t = cone(0.10, 0.15, 4); t.rotateZ(Math.PI / 2); t.translate(-0.25, 0, 0); return t; })(), color: 0x8ab4c8 },
    { g: (() => { const e = sph(0.032, 5, 4); e.translate(0.13, 0.035, 0.05); return e; })(), color: 0x141018 },
  ]);
  const gCup = merge([
    { g: cyl(0.073, 0.056, 0.17, 8) },
    { g: (() => { const l = cyl(0.082, 0.082, 0.03, 8); l.translate(0, 0.095, 0); return l; })(), color: 0xf6f2ea },
    { g: (() => { const s = cyl(0.077, 0.077, 0.055, 8, true); s.translate(0, 0.012, 0); return s; })(), color: 0x7a5b3a },
  ]);
  // DUMBBELL: short bar the paw actually closes around, proper stacked discs.
  const gDumbbell = merge([
    { g: (() => { const b = cyl(0.032, 0.032, 0.36, 6); b.rotateZ(Math.PI / 2); return b; })(), color: 0xd6dae2 },
    ...[-1, 1].flatMap((s) => [
      { g: (() => { const w = cyl(0.125, 0.125, 0.07, 12); w.rotateZ(Math.PI / 2); w.translate(s * 0.135, 0, 0); return w; })(), color: 0x2e3440 },
      { g: (() => { const w = cyl(0.092, 0.092, 0.06, 10); w.rotateZ(Math.PI / 2); w.translate(s * 0.072, 0, 0); return w; })(), color: 0x3d4450 },
    ]),
  ]);
  const gClipboard = merge([
    { g: box(0.24, 0.31, 0.022), color: 0x9a6c3e },
    { g: (() => { const p = box(0.20, 0.25, 0.014); p.translate(0, -0.02, 0.016); return p; })(), color: 0xfbf8ef },
    { g: (() => { const c = box(0.10, 0.045, 0.032); c.translate(0, 0.14, 0.022); return c; })(), color: 0xc0c4cc },
  ]);
  const gUmbrella = merge([
    { g: (() => { const c = cone(0.40, 0.30, 10); c.translate(0, 0.44, 0); return c; })() },
    { g: (() => { const s = cyl(0.019, 0.019, 0.76, 5); s.translate(0, 0.06, 0); return s; })(), color: 0x4a3324 },
    { g: (() => { const h = cyl(0.019, 0.019, 0.11, 5); h.rotateZ(Math.PI / 2); h.translate(0.05, -0.31, 0); return h; })(), color: 0x4a3324 },
  ]);
  // FIDDLE: a little brown violin — two bouts, neck, scroll, pale strings —
  // carried out in front of the chest with the bow arm sawing across it.
  const gFiddle = merge([
    { g: (() => { const b = sph(0.125, 9, 6); b.scale(0.98, 1.02, 0.32); b.translate(0, -0.07, 0); return b; })(), color: 0x8d4a24 },
    { g: (() => { const b = sph(0.098, 8, 5); b.scale(0.98, 1.0, 0.30); b.translate(0, 0.10, 0); return b; })(), color: 0x9a5528 },
    { g: (() => { const n = box(0.048, 0.24, 0.05); n.translate(0, 0.30, 0.004); return n; })(), color: 0x5a3018 },
    { g: (() => { const s = sph(0.045, 7, 5); s.scale(1, 1, 0.8); s.translate(0, 0.43, 0.005); return s; })(), color: 0x4a2714 },
    { g: (() => { const f = box(0.034, 0.30, 0.022); f.translate(0, 0.26, 0.036); return f; })(), color: 0x241610 },
    { g: (() => { const s = box(0.030, 0.46, 0.008); s.translate(0, 0.12, 0.05); return s; })(), color: 0xf6efd8 },
    { g: (() => { const br = box(0.075, 0.024, 0.028); br.translate(0, -0.05, 0.045); return br; })(), color: 0xfff4d8 },
  ]);
  const gBow = merge([
    { g: (() => { const b = cyl(0.014, 0.014, 0.52, 5); b.rotateZ(Math.PI / 2); return b; })(), color: 0x3a2414 },
    { g: (() => { const h = box(0.50, 0.014, 0.012); h.translate(0, 0.028, 0); return h; })(), color: 0xf2ead2 },
    { g: (() => { const f = box(0.055, 0.05, 0.045); f.translate(-0.24, 0.012, 0); return f; })(), color: 0x241610 },
  ]);
  // LANTERN: amber glass box + a fat glow orb inside it (emissive rides night).
  const gLantern = merge([
    { g: box(0.155, 0.185, 0.155), color: 0xffdc92 },
    { g: (() => { const o = sph(0.115, 9, 7); o.translate(0, 0.005, 0); return o; })(), color: 0xffe9b0 },
    { g: (() => { const t = cyl(0.05, 0.095, 0.07, 5); t.translate(0, 0.12, 0); return t; })(), color: 0x2c2c34 },
    { g: (() => { const b = cyl(0.095, 0.075, 0.035, 5); b.translate(0, -0.115, 0); return b; })(), color: 0x2c2c34 },
    { g: (() => { const h = cyl(0.065, 0.065, 0.014, 7, true); h.rotateX(Math.PI / 2); h.translate(0, 0.20, 0); return h; })(), color: 0x2c2c34 },
  ]);

  // ── contact shadow ─────────────────────────────────────────────────────────
  // A soft radial decal under every cat: the real shadow pass grounds them when
  // the sun is high, this catches the cases where it can't (flat light, dusk,
  // shadow-box edges). Soft falloff, never an opaque black ellipse.
  const gBlob = solo((() => { const p = new THREE.PlaneGeometry(1, 1); p.rotateX(-Math.PI / 2); return p; })(), 0xffffff);
  const blobMat = new THREE.MeshBasicMaterial({
    color: 0x231a12, transparent: true, opacity: 0.3, depthWrite: false,
    alphaMap: blobTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });

  const pools = {
    blob: new Pool('blob', gBlob, blobMat, { receive: false }),
    body: new Pool('body', gBody, furMat, { fur: true, cast: true }),
    bodyBuff: new Pool('bodyBuff', gBodyBuff, furMat, { fur: true, cast: true }),
    head: new Pool('head', gHead, furMat, { fur: true, cast: true }),
    ear: new Pool('ear', gEar, furMat, { fur: true, cast: true }),
    limb: new Pool('limb', gLimb, furMat, { fur: true, cast: true }),
    tail: new Pool('tail', gTail, furMat, { fur: true, cast: true }),
    delt: new Pool('delt', gDelt, furMat, { fur: true, cast: true }),

    earInner: new Pool('earInner', gEarInner, skinMat),
    muzzle: new Pool('muzzle', gMuzzle, skinMat),
    fang: new Pool('fang', gFang, skinMat),
    patch: new Pool('patch', gPatch, darkMat),
    eye: new Pool('eye', gEye, eyeMat),
    pupil: new Pool('pupil', gPupil, darkMat),
    whisk: new Pool('whisk', gWhisk, skinMat),

    cap: new Pool('cap', gCap, clothMat),
    copCap: new Pool('copCap', gCopCap, clothMat),
    visor: new Pool('visor', gVisor, clothMat),
    sash: new Pool('sash', gSash, clothMat),
    topHat: new Pool('topHat', gTopHat, clothMat),
    sunHat: new Pool('sunHat', gSunHat, clothMat),
    apron: new Pool('apron', gApron, clothMat),
    tie: new Pool('tie', gTie, clothMat),
    glasses: new Pool('glasses', gGlasses, clothMat),
    tank: new Pool('tank', gTank, clothMat),
    collar: new Pool('collar', gCollar, clothMat),

    briefcase: new Pool('briefcase', gBriefcase, propMat),
    fish: new Pool('fish', gFish, propMat),
    cup: new Pool('cup', gCup, propMat),
    dumbbell: new Pool('dumbbell', gDumbbell, propMat),
    clipboard: new Pool('clipboard', gClipboard, propMat),
    umbrella: new Pool('umbrella', gUmbrella, propMat),
    fiddle: new Pool('fiddle', gFiddle, propMat),
    bow: new Pool('bow', gBow, propMat),
    lantern: new Pool('lantern', gLantern, glowMat),
  };

  return { pools, materials: { furMat, skinMat, eyeMat, darkMat, clothMat, propMat, glowMat, blobMat } };
}

// ── proportions (unit cat ≈ 1.65 tall incl. ears; player is 2.1) ─────────────
const P = { headY: 1.15, bodyY: 0.745, hipY: 0.375, shoulderY: 0.885, legX: 0.152, armX: 0.248, tailY: 0.66, tailZ: -0.265 };

// ── SKULL TYPES ──────────────────────────────────────────────────────────────
// Forty cats built from one sphere all had the same face, which is fine for a
// crowd and wrong for a cast. Four breeds' worth of skull, applied at build
// time with `spec.head`:
//   round  — a fat domed bun (the Mayor)
//   long   — narrow, deep, snouty (Gus, who is mostly nose)
//   flat   — wide, shallow, squashed Persian glare (Officer Mittens)
//   bigear — normal skull, absurd radar dishes (Barista Mocha)
// hs = head scale · ms/md = muzzle scale and offset (dy, dz) · es/ex/ey = ear
// scale, x-spread and y-lift · eye = eye scale, exf = eye spread, ed = (dy, dz).
const HEADS = {
  normal: { hs: [1, 1, 1], ms: [1, 1, 1], md: [0, 0], es: 1, ex: 1, ey: 0, eye: 1, exf: 1, ed: [0, 0] },
  round:  { hs: [1.13, 1.12, 1.06], ms: [0.94, 0.94, 0.92], md: [0.014, 0.010], es: 0.88, ex: 1.00, ey: 0.020, eye: 1.02, exf: 1.02, ed: [0.012, 0.014] },
  long:   { hs: [0.89, 1.03, 1.22], ms: [0.90, 0.94, 1.14], md: [-0.014, 0.076], es: 1.08, ex: 0.90, ey: 0.014, eye: 0.95, exf: 0.90, ed: [0.006, 0.050] },
  flat:   { hs: [1.17, 1.03, 0.87], ms: [1.18, 0.84, 0.68], md: [-0.006, 0.006], es: 0.84, ex: 1.14, ey: -0.024, eye: 1.05, exf: 1.14, ed: [0.004, -0.034] },
  bigear: { hs: [0.98, 0.97, 1.00], ms: [0.94, 0.96, 0.97], md: [0.002, 0.004], es: 1.52, ex: 1.12, ey: 0.012, eye: 1.10, exf: 1.00, ed: [0.006, 0.004] },
};
export const HEAD_TYPES = Object.keys(HEADS);
const ACC = ['briefcase', 'fish', 'cup', 'dumbbell', 'clipboard', 'umbrella', 'fiddle', 'lantern'];
/** Tail hangs from here; the brain adds tailLift. Near-vertical = cat, always. */
export const TAIL_REST = -0.34;

/** Build one cat's bones + register all its parts. Returns the bone map. */
export function buildCat(lib, spec) {
  const { pools } = lib;
  const furOpt = { tile: tileUV(spec.pattern) };
  // every furred instance this cat owns, so the coat can be repainted at dusk
  const coat = [];
  const fur = (pool, node) => { coat.push([pool, pool.add(node, furOpt)]); return node; };
  const buff = spec.build === 'buff';
  const chonk = spec.build === 'chonky';
  const kitten = !!spec.kitten || (spec.size ?? 1) < 0.68;
  const HV = HEADS[spec.head] || HEADS.normal;
  // background citizens: same rig, three tail segments instead of five and no
  // whiskers or fangs. Saves ~230 triangles each across a crowd of twenty.
  const lean = !!spec.crowd;

  const root = new THREE.Object3D();
  root.scale.setScalar(spec.size ?? 1);
  const O = (x = 0, y = 0, z = 0, parent = root) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

  const torso = O(0, P.bodyY * (kitten ? 0.90 : 1), 0);
  const bodyMesh = O(0, 0, 0, torso);
  if (buff) { bodyMesh.scale.set(1.06, 1.0, 0.94); fur(pools.bodyBuff, bodyMesh); }
  else { bodyMesh.scale.set(chonk ? 1.30 : kitten ? 1.02 : 1.0, chonk ? 1.12 : kitten ? 1.04 : 1.22, chonk ? 1.16 : kitten ? 0.96 : 0.90); fur(pools.body, bodyMesh); }

  // Kittens: same rig, enormous head. Scaling the pivot takes ears, eyes,
  // muzzle, whiskers and hats along with it, so the proportions stay honest.
  const headPivot = O(0, P.headY + (buff ? 0.15 : kitten ? -0.13 : 0), 0);
  if (kitten) headPivot.scale.setScalar(1.30);
  const head = O(0, 0, 0, headPivot);
  head.scale.set((chonk ? 1.1 : 1) * HV.hs[0], (chonk ? 1.03 : 1) * HV.hs[1], HV.hs[2]);
  fur(pools.head, head);

  const earL = O(-0.158 * HV.ex, 0.215 + HV.ey, -0.012, headPivot); earL.rotation.set(-0.10, 0, 0.22);
  const earR = O(0.158 * HV.ex, 0.215 + HV.ey, -0.012, headPivot); earR.rotation.set(-0.10, 0, -0.22);
  for (const e of [earL, earR]) {
    const em = O(0, 0, 0, e); em.scale.setScalar(HV.es); fur(pools.ear, em);
    const ei = O(0, 0.025 * HV.es, 0.040 * HV.es, e); ei.scale.setScalar(HV.es); pools.earInner.add(ei);
  }

  const mk = chonk ? 1.08 : 1;
  const muzzle = O(0, -0.108 + HV.md[0], 0.198 + HV.md[1], headPivot);
  muzzle.scale.set(mk * HV.ms[0], mk * HV.ms[1], mk * HV.ms[2]);
  pools.muzzle.add(muzzle, { color: spec.pattern === 'black' ? 0xd8cccc : 0xffffff });

  // Eyes ride ON the skull, not through it: the head surface at this offset is
  // z ≈ 0.273, so a 0.55-deep eye at 0.196 and its pupil at 0.232 stay inside
  // the silhouette from every angle (this is what poked out on the ginger cats).
  const EX = 0.112 * HV.exf, EY = 0.045 + HV.ed[0], EZ = 0.196 + HV.ed[1];
  const eyeS = [0.95 * HV.eye, HV.eye, 0.55 * HV.eye];
  const pupS = [HV.eye, 1.02 * HV.eye, HV.eye];
  const eyeL = O(-EX, EY, EZ, headPivot); eyeL.scale.set(eyeS[0], eyeS[1], eyeS[2]);
  const eyeR = O(EX, EY, EZ, headPivot); eyeR.scale.set(eyeS[0], eyeS[1], eyeS[2]);
  const eyeSlots = [[pools.eye, pools.eye.add(eyeL, { color: spec.eye ?? 0xb8e04a })],
                    [pools.eye, pools.eye.add(eyeR, { color: spec.eye ?? 0xb8e04a })]];
  const pupL = O(-EX, EY, EZ + 0.036 * HV.hs[2], headPivot);
  const pupR = O(EX, EY, EZ + 0.036 * HV.hs[2], headPivot);
  pools.pupil.add(pupL); pools.pupil.add(pupR);
  const whisk = O(0, -0.098 + HV.md[0], 0.238 + HV.md[1], headPivot);
  if (!lean) pools.whisk.add(whisk);
  // fangs live on the muzzle, folded away (scale 0) until the stripes arrive
  const fangs = O(0, -0.108 + HV.md[0], 0.198 + HV.md[1], headPivot);
  fangs.scale.setScalar(0.0001);
  if (!lean) pools.fang.add(fangs);
  let patch = null;
  if (spec.eyepatch) { patch = O(-0.112, 0.055, 0.175, headPivot); patch.rotation.z = -0.12; pools.patch.add(patch); }

  const legL = O(-P.legX * (chonk ? 1.22 : buff ? 1.15 : 1), P.hipY, 0);
  const legR = O(P.legX * (chonk ? 1.22 : buff ? 1.15 : 1), P.hipY, 0);
  const armL = O(-P.armX * (buff ? 1.34 : chonk ? 1.2 : 1), P.shoulderY + (buff ? 0.08 : 0), 0);
  const armR = O(P.armX * (buff ? 1.34 : chonk ? 1.2 : 1), P.shoulderY + (buff ? 0.08 : 0), 0);
  for (const [pivot, isArm] of [[legL, 0], [legR, 0], [armL, 1], [armR, 1]]) {
    const m = O(0, -0.165, 0, pivot);
    if (buff) m.scale.set(isArm ? 1.76 : 1.42, isArm ? 1.05 : 1.0, isArm ? 1.76 : 1.42);
    else if (chonk) m.scale.set(1.24, 0.92, 1.24);
    fur(pools.limb, m);
    pivot.userData.mesh = m;
  }
  const handR = O(0, -0.315, 0.03, armR);
  const handL = O(0, -0.315, 0.03, armL);

  let delts = null, fores = null;
  if (buff) {
    delts = [];
    for (const sgn of [-1, 1]) { const d = O(sgn * 0.355, 0.995, 0, root); d.scale.setScalar(1.10); fur(pools.delt, d); delts.push(d); }
    for (const arm of [armL, armR]) { const b = O(0, -0.115, 0.02, arm); b.scale.setScalar(0.80); fur(pools.delt, b); delts.push(b); }
    // FOREARMS: a second ball low on each arm. A buff cat's arm is then two
    // lumps with a wrist, which reads as a bent limb holding something heavy
    // instead of a single tapering stick.
    fores = [];
    for (const arm of [armL, armR]) { const f = O(0, -0.275, 0.025, arm); f.scale.setScalar(0.62); fur(pools.delt, f); fores.push(f); }
  }

  // TAIL: five fat segments, near-vertical at rest, curling forward at the tip.
  // This is the single biggest silhouette cue that a lump of fur is a cat.
  const tailBase = O(0, P.tailY, buff ? -0.36 : chonk ? -0.33 : P.tailZ);
  tailBase.rotation.x = TAIL_REST;
  const tailSegs = []; let cur = tailBase;
  for (let i = 0; i < (lean ? 3 : 5); i++) {
    const seg = i === 0 ? cur : O(0, 0.185, 0, cur);
    const m = O(0, 0.095, 0, seg); m.scale.setScalar(1 - i * 0.09);
    fur(pools.tail, m);
    tailSegs.push(seg); cur = seg;
  }

  const worn = {};
  const cl = spec.clothes || {};
  // a wide skull needs a wide hat, or the brim cuts a groove through the cheeks
  const hatK = Math.max(HV.hs[0], HV.hs[2], 1);
  const HAT = (node) => { node.scale.setScalar(hatK); return node; };
  if (cl.cap !== undefined) { worn.cap = HAT(O(0, 0.13 * HV.hs[1], 0.02, headPivot)); pools.cap.add(worn.cap, { color: cl.cap }); }
  if (cl.copCap !== undefined) { worn.copCap = HAT(O(0, 0.12 * HV.hs[1], 0.015, headPivot)); pools.copCap.add(worn.copCap, { color: cl.copCap }); }
  if (cl.visor !== undefined) { worn.visor = HAT(O(0, 0.10 * HV.hs[1], 0.015, headPivot)); pools.visor.add(worn.visor, { color: cl.visor }); }
  if (cl.topHat !== undefined) { worn.topHat = HAT(O(0, 0.17 * HV.hs[1], 0, headPivot)); pools.topHat.add(worn.topHat, { color: cl.topHat }); }
  if (cl.sunHat !== undefined) { worn.sunHat = HAT(O(0, 0.20 * HV.hs[1], 0, headPivot)); pools.sunHat.add(worn.sunHat, { color: cl.sunHat }); }
  if (cl.apron !== undefined) { worn.apron = O(0, 0.70, chonk ? 0.365 : 0.275, root); pools.apron.add(worn.apron, { color: cl.apron }); }
  if (cl.tie !== undefined) { worn.tie = O(0, 0.90, chonk ? 0.26 : 0.205, root); pools.tie.add(worn.tie, { color: cl.tie }); }
  if (cl.glasses !== undefined) { worn.glasses = O(0, 0.05, 0.262, headPivot); pools.glasses.add(worn.glasses, { color: cl.glasses }); }
  if (cl.tank !== undefined) { worn.tank = O(0, buff ? 0.85 : 0.74, 0, root); worn.tank.scale.setScalar(buff ? 1.04 : 0.80); pools.tank.add(worn.tank, { color: cl.tank }); }
  if (cl.collar !== undefined) { worn.collar = O(0, chonk ? 0.98 : 0.95, 0, root); worn.collar.scale.setScalar(chonk ? 1.12 : 1); pools.collar.add(worn.collar, { color: cl.collar }); }
  if (cl.sash !== undefined) {
    worn.sash = O(0, chonk ? 0.80 : 0.78, 0, root);
    worn.sash.scale.setScalar(chonk ? 1.22 : buff ? 1.12 : 1);
    pools.sash.add(worn.sash, { color: cl.sash });
  }

  let held = null, held2 = null, bow = null;
  const heldKind = spec.acc && ACC.includes(spec.acc) ? spec.acc : null;
  if (heldKind) {
    if (heldKind === 'fiddle') {
      // The violin is carried on the CHEST, tucked under the chin, so it never
      // swings through the ribs: the arms play around it.
      held = O(0.02, 1.00, 0.20, root);
      held.rotation.set(-0.42, 0.18, 1.12);
      pools.fiddle.add(held, { color: spec.accColor ?? 0xffffff });
      bow = O(0.07, -0.05, 0.10, handR); bow.rotation.set(0.1, 0, 0.35); pools.bow.add(bow);
    } else {
      held = O(0, -0.06, 0.03, handR);
      if (heldKind === 'dumbbell') held.position.set(0, -0.015, 0.055);
      if (heldKind === 'umbrella') held.position.set(0.02, 0.04, 0.05);
      if (heldKind === 'briefcase') held.position.set(0, -0.17, 0.02);
      if (heldKind === 'lantern') held.position.set(0, -0.20, 0.04);
      pools[heldKind].add(held, { color: spec.accColor ?? 0xffffff });
      // a dumbbell in EACH paw: nothing lies through the deck any more
      if (heldKind === 'dumbbell') {
        held2 = O(0, -0.015, 0.055, handL);
        pools.dumbbell.add(held2, { color: spec.accColor ?? 0xffffff });
      }
    }
  }

  // contact shadow: a parentless node the system drives directly (no pitch/roll)
  const shadow = new THREE.Object3D();
  pools.blob.add(shadow);

  return {
    root, torso, bodyMesh, headPivot, head, earL, earR, muzzle, eyeL, eyeR, pupL, pupR, whisk,
    legL, legR, armL, armR, handL, handR, delts, fores, tailBase, tailSegs, worn, held, held2, heldKind, bow,
    shadow, buff, chonk, kitten, fangs, patch, coat, eyeSlots, eyeS, pupS,
  };
}

export { P as RIG_PROPORTIONS };
