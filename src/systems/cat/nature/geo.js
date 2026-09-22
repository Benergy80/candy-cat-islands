// ─────────────────────────────────────────────────────────────────────────────
// CAT ISLAND NATURE — geometry kit.
// Everything is built as small merged BufferGeometries with these attributes
// only: position, normal, color, aMask (+ aFlap on birds).
//   color  = baked per-vertex colour (works even if the sway shader is absent)
//   aMask  = 1 on parts that take the per-instance tint (foliage / petals)
//   aFlap  = 1 on bird wing tips
// Base of every species sits at y = 0 and faces +Z. Keep triangle counts tiny:
// these are drawn 50–900× each.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _c = new THREE.Color();
const ITEM = { position: 3, normal: 3, color: 3, aMask: 1, aFlap: 1, aSway: 1, aPhase: 1, aTint: 3, uv: 2 };
const FILL = { aTint: 1 }; // attributes that default to 1 when a part omits them

/** Accumulates transformed, coloured parts then merges them into one geometry. */
export class Parts {
  constructor() { this.geos = []; }
  /**
   * add(geometry, colorHex, { p:[x,y,z], r:[rx,ry,rz], s:n|[x,y,z], mask, flap,
   *                           warp(v,i), nUp:0..1 })
   */
  add(geo, color, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (o.warp) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); o.warp(_v, i); p.setXYZ(i, _v.x, _v.y, _v.z); }
      g.computeVertexNormals();
    }
    const s = o.s === undefined ? [1, 1, 1] : (typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s);
    _e.set(...(o.r || [0, 0, 0]));
    _m.compose(_v.set(...(o.p || [0, 0, 0])), _q.setFromEuler(_e), new THREE.Vector3(...s));
    g.applyMatrix4(_m);
    if (o.nUp) { // bend normals toward +Y so thin blades catch the sky light
      const n = g.attributes.normal;
      for (let i = 0; i < n.count; i++) {
        _v.fromBufferAttribute(n, i).lerp(UP, o.nUp).normalize();
        n.setXYZ(i, _v.x, _v.y, _v.z);
      }
    }
    const count = g.attributes.position.count;
    _c.set(color);
    const col = new Float32Array(count * 3);
    if (o.tone) {
      // per-vertex value shading in the BAKED colour: crevice darkening, strata
      // bands, shaded undersides. `tone(v, i)` → multiplier (1 = unchanged).
      const p = g.attributes.position;
      for (let i = 0; i < count; i++) {
        const k = o.tone(_v.fromBufferAttribute(p, i), i);
        col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
      }
    } else {
      for (let i = 0; i < count; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(count).fill(o.mask ?? 0), 1));
    if (o.flap !== undefined) g.setAttribute('aFlap', new THREE.BufferAttribute(new Float32Array(count).fill(o.flap), 1));
    // per-vertex sway (used by the single merged prop mesh, which is not instanced)
    if (o.sway !== undefined) g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(count).fill(o.sway), 1));
    if (o.phase !== undefined) g.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(count).fill(o.phase), 1));
    this.geos.push(g);
    return this;
  }
  build(names) { return mergeParts(this.geos, names); }
}
const UP = new THREE.Vector3(0, 1, 0);

export function mergeParts(geos, names = ['position', 'normal', 'color', 'aMask']) {
  let total = 0; for (const g of geos) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = ITEM[name] || 3;
    const arr = new Float32Array(total * size);
    if (FILL[name]) arr.fill(FILL[name]);
    let o = 0;
    for (const g of geos) {
      const a = g.attributes[name], n = g.attributes.position.count;
      if (a) arr.set(a.array.subarray(0, n * size), o * size);
      o += n;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

export function triCount(g) { return g.attributes.position.count / 3; }

// ── primitive helpers ────────────────────────────────────────────────────────
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
const cyl = (rt, rb, h, seg = 5, hs = 1) => new THREE.CylinderGeometry(rt, rb, h, seg, hs).translate(0, h / 2, 0);
const cone = (r, h, seg = 7) => new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0);
const octa = (r) => new THREE.OctahedronGeometry(r, 0);
/**
 * Open tapered prism, base at y=0. THE fix for "flat paper" ground cover: a
 * 3-sided prism costs 6 triangles — the same as a crossed billboard — but every
 * face has an OUTWARD normal, so it is lit from every angle instead of turning
 * into a black shard the moment you walk round the back of it. Use this for any
 * upright stem/spike that is seen from all sides.
 */
const prism = (rb, rt, h, n = 3) => new THREE.CylinderGeometry(rt, rb, h, n, 1, true).translate(0, h / 2, 0);
const ico = (r) => new THREE.IcosahedronGeometry(r, 0);
const tetra = (r) => new THREE.TetrahedronGeometry(r, 0);

/** knobble a blob so it reads organic, not platonic. */
function lumpy(rand, k = 0.22) { return (v) => v.multiplyScalar(1 + (rand() - 0.5) * 2 * k); }

/** Flat tapered blade from y=0 to y=h, 2 tris, pointing +Z at the tip by `lean`. */
function blade(w, h, lean = 0, tipW = 0.18) {
  const g = new THREE.BufferGeometry();
  const tw = w * tipW;
  const v = new Float32Array([
    -w / 2, 0, 0, w / 2, 0, 0, tw / 2, h, lean,
    -w / 2, 0, 0, tw / 2, h, lean, -tw / 2, h, lean,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Flat leaf/frond: 3 tris, base at origin extending +Z, drooping by `droop`. */
function frond(len, w, droop = 0.8) {
  const g = new THREE.BufferGeometry();
  const p = [];
  const seg = [[0, 0, w * 0.25], [len * 0.5, -droop * 0.18, w * 0.5], [len * 0.85, -droop * 0.62, w * 0.34], [len, -droop, 0.02]];
  for (let i = 0; i < seg.length - 1; i++) {
    const [z0, y0, w0] = seg[i], [z1, y1, w1] = seg[i + 1];
    p.push(-w0, y0, z0, w0, y0, z0, w1, y1, z1);
    p.push(-w0, y0, z0, w1, y1, z1, -w1, y1, z1);
  }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.computeVertexNormals();
  return g;
}

/** n-gon disc facing +Y, radius r. */
const disc = (r, seg = 7) => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);

/**
 * Ragged, gently rippled leaf plate facing +Y — the building block of the
 * layered tree crowns. Rim jitter is keyed off the segment index so the first
 * and last (duplicated) rim vertices match and the plate stays watertight.
 */
function leafPlate(r, seg, rand, jag = 0.18, ripple = 0.14) {
  const g = disc(r, seg);
  const p = g.attributes.position;
  const kj = new Float32Array(seg), yj = new Float32Array(seg);
  for (let j = 0; j < seg; j++) { kj[j] = 1 + (rand() - 0.5) * 2 * jag; yj[j] = (rand() - 0.5) * ripple * r; }
  for (let i = 1; i < p.count; i++) {
    const j = (i - 1) % seg, k = kj[j];
    p.setXYZ(i, p.getX(i) * k, yj[j], p.getZ(i) * k);
  }
  return g;
}

/**
 * One strip of an agave leaf.
 *
 * The whole leaf — pitch, arch and droop — is BAKED into the geometry, and the
 * only rotation applied afterwards is a yaw about Y. That matters: Parts.add
 * composes its eulers in XYZ order, so an `rx` pitch is applied in world space
 * AFTER the yaw and every leaf ends up flopping the same way instead of
 * radiating. Baking the lean is the only way to get a real rosette out of it.
 *
 * `u0..u1` are SIGNED fractions of the local half-width, so a leaf is built as
 * three side-by-side strips — pale margin / blue-green centre / pale margin —
 * which never z-fight the way a stacked "outline" quad would. 2 tris/segment.
 */
function leafStrip(w, len, pitch, arch, u0, u1, seg = 3, keel = 0) {
  const p = [];
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const hw = (t) => (w * 0.5) * (1 - 0.82 * t * t);       // broad body, spear tip
  const Y = (t) => len * t * cp - arch * t * t;            // rises, then droops
  const Z = (t) => len * t * sp + arch * t * t * 1.15;     // and bows outward
  // KEEL: the leaf folds up along its midrib, so u=0 rides `keel`·halfWidth
  // above the margins. A flat strip shows a black or cream back the instant you
  // see its reverse; a folded one always presents a lit face. (round-3 fix)
  const K = (u, t) => keel * hw(t) * Math.max(0, 1 - Math.abs(u));
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    const y0 = Y(t0), y1 = Y(t1), z0 = Z(t0), z1 = Z(t1);
    const a0 = hw(t0) * u0, b0 = hw(t0) * u1, a1 = hw(t1) * u0, b1 = hw(t1) * u1;
    const ka0 = K(u0, t0), kb0 = K(u1, t0), ka1 = K(u0, t1), kb1 = K(u1, t1);
    p.push(a0, y0 + ka0, z0, b0, y0 + kb0, z0, b1, y1 + kb1, z1);
    p.push(a0, y0 + ka0, z0, b1, y1 + kb1, z1, a1, y1 + ka1, z1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.computeVertexNormals();
  return g;
}
leafStrip.tip = (len, pitch, arch) => [0, len * Math.cos(pitch) - arch, len * Math.sin(pitch) + arch * 1.15];

/** Feather: spine along +Z with vanes either side and a slight V fold. 16 tris. */
function feather(len, w) {
  const prof = [[0, 0.1], [0.22, 0.52], [0.5, 0.62], [0.78, 0.42], [1, 0.02]];
  const p = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const [t0, w0] = prof[i], [t1, w1] = prof[i + 1];
    const z0 = t0 * len, z1 = t1 * len, a = w0 * w, b = w1 * w;
    const y0 = w * 0.16, y1 = w * 0.16;                     // raised spine
    for (const s of [-1, 1]) {
      p.push(0, y0, z0, s * a, 0, z0, s * b, 0, z1);
      p.push(0, y0, z0, s * b, 0, z1, 0, y1, z1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.computeVertexNormals();
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// SPECIES  — every builder returns { geo, sway, tints, scale:[min,max] }
// ═════════════════════════════════════════════════════════════════════════════

// Tall dark spires. Lines them along roads and round the square.
export function gCypress(rand) {
  const P = new Parts();
  P.add(cyl(0.17, 0.3, 1.4, 5), 0x7c5b3e);
  P.add(cone(1.15, 4.6, 7), 0x2f5d3a, { p: [0, 0.9, 0], mask: 1, warp: lumpy(rand, 0.1) });
  P.add(cone(0.92, 3.9, 7), 0x2f5d3a, { p: [0.1, 3.3, -0.05], mask: 1, warp: lumpy(rand, 0.1) });
  P.add(cone(0.58, 3.0, 7), 0x2f5d3a, { p: [-0.05, 5.7, 0.06], mask: 1, warp: lumpy(rand, 0.12) });
  return P.build();
}

// Umbrella pine — the island's silhouette tree. Crown half-width is ~2.4 u:
// the old one was three times that and walled the park off from the camera.
// Four offset plates in two greens, each with a darker underside sitting 0.17
// below it, so nothing is coplanar and nothing z-fights.
export function gPine(rand) {
  const P = new Parts();
  P.add(cyl(0.24, 0.46, 4.5, 6, 1), 0x8a6140, { r: [0.02, 0, 0.05] });
  P.add(cyl(0.14, 0.21, 1.7, 5), 0x8a6140, { p: [0.22, 3.6, 0.12], r: [0, 0, -0.62] });
  const LAYERS = [
    [-0.34, 4.32, 0.20, 1.76, 0x3d6b3c, 0x2b5130],
    [0.36, 4.76, -0.26, 1.58, 0x477a42, 0x325b35],
    [-0.02, 5.26, 0.18, 1.16, 0x5c9249, 0x3f6a3c],
  ];
  for (const [x, y, z, r, top, under] of LAYERS) {
    P.add(leafPlate(r, 9, rand), top, { p: [x, y, z], mask: 1 });
    P.add(leafPlate(r * 0.9, 9, rand), under, { p: [x, y - 0.17, z], r: [Math.PI, 0, 0] });
  }
  return P.build();
}

// Silvery gnarly olive — groves on the heights. Warm brown trunk against
// silvery-sage foliage so the tree never melts into the ochre rocks beside it.
export function gOlive(rand) {
  const P = new Parts();
  P.add(cyl(0.27, 0.46, 1.5, 5), 0x8c6642);
  P.add(prism(0.3, 0.16, 1.5, 4), 0x8c6642, { p: [0.18, 1.2, 0.1], r: [0.1, 0, -0.32] });
  P.add(prism(0.26, 0.14, 1.2, 4), 0x7b5636, { p: [-0.2, 1.3, -0.1], r: [-0.2, 0, 0.38] });
  // shaded underside first, then the sunlit SILVERY crown on top of it. The
  // crown is deliberately cool and desaturated: the boulders scattered through
  // the same groves are warm ochre, and that contrast is the whole grove read.
  for (const [x, y, z, r] of [[0.42, 2.1, 0.12, 1.0], [-0.48, 1.98, -0.2, 0.9]])
    P.add(octa(r), 0x566b57, { p: [x, y, z], s: [1.55, 0.72, 1.55], warp: lumpy(rand, 0.24) });
  const b = [[0.7, 2.6, 0.25, 1.02], [-0.75, 2.42, -0.35, 0.92], [0.0, 3.1, -0.2, 0.88], [0.2, 2.4, 0.9, 0.8]];
  for (const [x, y, z, r] of b) P.add(ico(r), 0x8ea88b, { p: [x, y, z], s: [1.45, 0.9, 1.45], mask: 1, warp: lumpy(rand, 0.16) });
  return P.build();
}

// Beach palm (smooth-shaded group).
export function gPalm(rand) {
  const P = new Parts();
  P.add(cyl(0.19, 0.36, 6.0, 5, 2), 0xb08a5e, { warp: (v) => { const t = v.y / 6.0; v.x += t * t * 1.1; v.z += t * t * 0.25; } });
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.3;
    P.add(frond(3.4 + rand() * 0.5, 0.44, 1.5), i % 3 === 0 ? 0x4f8c3f : 0x62a34c, {
      p: [1.1 + Math.cos(a) * 0.12, 6.0, 0.25 + Math.sin(a) * 0.12], r: [0.22 + rand() * 0.15, a, 0], mask: 1, nUp: 0.75,
    });
  }
  for (let i = 0; i < 3; i++) P.add(tetra(0.22), 0x6b4a2a, { p: [1.05 + Math.cos(i * 2.1) * 0.3, 5.75, 0.25 + Math.sin(i * 2.1) * 0.3] });
  return P.build();
}

// Bougainvillea mound — magenta/orange fire spilling over walls.
export function gBougainvillea(rand) {
  const P = new Parts();
  P.add(ico(0.85), 0x44703a, { p: [0, 0.6, 0], s: [1.25, 0.85, 1.25], warp: lumpy(rand, 0.16) });
  const f = [[0.05, 1.3, 0.05, 0.8], [-0.72, 0.95, 0.3, 0.62], [0.78, 1.0, 0.18, 0.64], [0.1, 1.72, -0.25, 0.52], [-0.3, 1.1, -0.62, 0.56]];
  for (const [x, y, z, r] of f) P.add(octa(r), 0xd4308f, { p: [x, y, z], s: [1.25, 1.0, 1.25], mask: 1, warp: lumpy(rand, 0.2) });
  return P.build();
}

// Lavender clump. The round-3 containment critic counted "hundreds of grey and
// black shards" across the hillsides above the pier road: this was a pale sage
// OCTAHEDRON under seven FLAT CARDS with their normals bent to +Y, so the back
// of every flower spike took the hemisphere light's GROUND colour and read as a
// black (or hard cream) sliver. Rebuilt with no cards at all: the spikes are
// 3-sided open prisms (6 tris each, same cost as a billboard) with genuine
// outward normals, over a mid sage-green mound with real leaves.
export function gLavender(rand) {
  const P = new Parts();
  const MOUND = 0x6d8a5a, MOUND2 = 0x7d9a67, FLOWER = 0x8e6bd4;
  // 46 triangles all in: two sage mounds and five solid spikes. Nothing here is
  // a card, so nothing here can turn black.
  P.add(octa(0.26), MOUND, { p: [0, 0.1, 0], s: [1.3, 0.78, 1.25], warp: lumpy(rand, 0.32) });
  P.add(octa(0.19), MOUND2, { p: [0.14, 0.13, -0.1], s: [1.25, 0.8, 1.2], warp: lumpy(rand, 0.34) });
  // LEAN, correctly: Parts.add composes its euler XYZ, i.e. v' = Rx·Ry·Rz·v, so
  // rz acts in the part's own frame and the yaw carries it round. Yaw by -a and
  // lean by -tilt and the part tips outward along (cos a, sin a) — feeding the
  // lean into `rx` instead makes every spike flop the same way in world X.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand() * 0.6, r = 0.08 + rand() * 0.1;
    const h = 0.42 + rand() * 0.3, tilt = 0.12 + rand() * 0.24;
    P.add(prism(0.072, 0.022, h, 3), FLOWER, {
      p: [Math.cos(a) * r, 0.16 + rand() * 0.06, Math.sin(a) * r], r: [0, -a, -tilt], mask: 1,
    });
  }
  return P.build();
}

// Sunflower — tall, heads all roughly facing the same way.
export function gSunflower(rand) {
  const P = new Parts();
  P.add(cyl(0.05, 0.08, 1.55, 4), 0x6f9a45);
  // nUp kept LOW on the leaves: at 0.6 their reverse flipped to the hemisphere
  // light's ground colour and a field of sunflowers grew grey-cream shards
  P.add(blade(0.4, 0.45, 0.3, 0.5), 0x6f9a45, { p: [0.04, 0.6, 0], r: [1.1, 0.6, 0], nUp: 0.2 });
  P.add(blade(0.36, 0.4, 0.28, 0.5), 0x5f8a3c, { p: [-0.04, 0.95, 0], r: [1.2, 3.4, 0], nUp: 0.2 });
  P.add(disc(0.5, 9), 0x4f7a34, { p: [0, 1.56, -0.02], r: [0.7 + Math.PI, 0, 0], nUp: 0.2 });   // green back
  P.add(disc(0.52, 9), 0xf7c325, { p: [0, 1.58, 0.06], r: [0.7, 0, 0], mask: 1, nUp: 0.5 });
  P.add(disc(0.29, 8), 0x5a3a1e, { p: [0, 1.62, 0.14], r: [0.7, 0, 0], nUp: 0.5 });
  return P.build();
}

// ── Agave: a REAL rosette, not a stamped tan tetra ───────────────────────────
// Seven tapered, arching blades at seven different lengths, pitches and rolls,
// each one a blue-green centre strip flanked by two PALE CREAM margin strips
// (that light edge is the thing that says "agave" at 46 units) and finished with
// a dark spine at the tip. Only the centre strips carry aMask, so the instance
// hue jitters the leaf without ever bleaching the margin.
export function gAgave(rand) {
  const P = new Parts();
  const LEAF = 0x5d9480, EDGE = 0xc3cf9a, SPINE = 0x5e4030;
  // TWO TIERS: five long outer spears lying out near the ground and four short
  // steep inner ones, each folded along its midrib (keel 0.9) and each set on
  // its own little shoulder of the core. Together they stop the rosette reading
  // as one self-intersecting fan of flat cards from above.
  const TIERS = [
    { n: 4, len: [1.25, 0.8], pitch: [0.72, 0.42], off: 0.2, y: 0.05 },
    { n: 3, len: [0.72, 0.42], pitch: [0.26, 0.34], off: 0.11, y: 0.24 },
  ];
  for (let ti = 0; ti < TIERS.length; ti++) {
    const T = TIERS[ti];
    for (let i = 0; i < T.n; i++) {
      const a = (i / T.n) * Math.PI * 2 + ti * 0.7 + (rand() - 0.5) * 0.4;
      const len = T.len[0] + rand() * T.len[1];
      const w = (0.5 + rand() * 0.2) * (ti ? 0.86 : 1);
      const pitch = T.pitch[0] + rand() * T.pitch[1];    // out from vertical
      const arch = 0.18 + rand() * 0.3;
      const o = { p: [Math.cos(a) * T.off, T.y, Math.sin(a) * T.off], r: [0, a, 0], nUp: 0.12 };
      // fold: two half-leaves meeting on a raised midrib
      P.add(leafStrip(w, len, pitch, arch, -0.84, 0, 2, 0.9), LEAF, { ...o, mask: 1 });
      P.add(leafStrip(w, len, pitch, arch, 0, 0.84, 2, 0.9), LEAF, { ...o, mask: 1 });
      // the pale margin is what says AGAVE at 46 units — but only the long
      // outer spears need it; the short inner ones are read as mass
      if (!ti) {
        P.add(leafStrip(w, len, pitch, arch, -1.0, -0.84, 2, 0.9), EDGE, o);
        P.add(leafStrip(w, len, pitch, arch, 0.84, 1.0, 2, 0.9), EDGE, o);
      }
      P.add(tetra(0.06).translate(...leafStrip.tip(len, pitch, arch)), SPINE, o);
    }
  }
  P.add(octa(0.34), 0x4a7a66, { p: [0, 0.14, 0], s: [1.05, 0.82, 1.05], mask: 1, warp: lumpy(rand, 0.2) });
  return P.build();
}

// Flowering agave: the same rosette under a tall ribbed bloom spike. Rare —
// one in six — so the dry ground has a vertical accent instead of a flat field.
export function gAgaveBloom(rand) {
  const P = new Parts();
  const base = gAgave(rand);
  P.geos.push(base);
  const H = 3.0 + rand() * 1.3;
  // a chunkier stalk with proper candelabra heads: at 0.055 it was a bare
  // aliasing stick with four crumbs on it from the game camera
  P.add(cyl(0.1, 0.2, H, 5), 0x9aa062, { p: [0, 0.1, 0], r: [0.05, 0, 0.04] });
  for (let k = 0; k < 5; k++) {
    const t = 0.45 + k * 0.12, a = k * 2.1, r = 0.26 + k * 0.04;
    P.add(octa(0.26 - k * 0.02), 0xf2d97a, { p: [Math.cos(a) * r, 0.1 + H * t, Math.sin(a) * r], s: [1.25, 0.72, 1.25], mask: 1 });
    P.add(prism(0.05, 0.03, r, 3), 0x9aa062, { p: [0, 0.1 + H * t, 0], r: [0, -a, -1.45] });
  }
  P.add(octa(0.26), 0xf7e8a8, { p: [0, 0.1 + H, 0], s: [1.1, 0.85, 1.1], mask: 1 });
  return P.build();
}

// Marram / beach grass: taller, thinner and drier than the meadow tuft, for the
// sand behind the waterline. Mixed through the agave so the beach is not a
// succulent nursery.
export function gMarram(rand) {
  const P = new Parts();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand();
    const rr = 0.03 + rand() * 0.15;
    P.add(blade(0.11, 0.95 + rand() * 0.8, 0.6 + rand() * 0.45, 0.05), 0xcfc887, {
      p: [Math.cos(a) * rr, 0, Math.sin(a) * rr], r: [(rand() - 0.5) * 0.6, a, (rand() - 0.5) * 0.45], mask: 1, nUp: 0.6,
    });
  }
  return P.build();
}

// ── Headland outcrop: the anti-blockout prop ─────────────────────────────────
// A stack of offset, tilted warm-ochre masses on a DARK cool plinth with a
// lichen cap, so a scale-3 one has a broken silhouette and three values in it
// rather than being one pale grey egg. Scaled 1.4–3.2 these break up a bare
// skyline; they are what the north bluff gets instead of a flat grey slab.
export function gOutcrop(rand) {
  const P = new Parts();
  P.add(ico(1.05), 0x6f5230, { p: [0, 0.24, 0], s: [1.3, 0.34, 1.22], warp: lumpy(rand, 0.18), tone: band(0.24, 0.36) });
  // three thin courses instead of one tall mass: bedding planes, each undercut
  P.add(ico(0.98), 0xc2955a, { p: [0.06, 0.56, -0.04], s: [1.14, 0.3, 1.04], r: [0.06, rand() * 3, 0.05], mask: 1, warp: lumpy(rand, 0.16), tone: band(0.56, 0.3) });
  P.add(ico(0.92), 0xd0a468, { p: [0.1, 0.88, -0.1], s: [1.1, 0.32, 1.0], r: [0.1, rand() * 3, 0.08], mask: 1, warp: lumpy(rand, 0.17), tone: band(0.88, 0.31) });
  P.add(ico(0.6), 0xe2c08c, { p: [-0.46, 1.28, 0.3], s: [1.0, 0.72, 0.95], r: [0.2, rand() * 3, -0.15], mask: 1, warp: lumpy(rand, 0.2), tone: band(1.28, 0.44) });
  P.add(ico(0.44), 0xb98a4f, { p: [0.58, 1.12, -0.36], s: [1.1, 0.7, 1.0], mask: 1, warp: lumpy(rand, 0.2), tone: band(1.12, 0.32) });
  P.add(ico(0.32), 0x86a15e, { p: [-0.12, 1.74, 0.06], s: [1.3, 0.36, 1.22], warp: lumpy(rand, 0.2) });
  return P.build();
}

// Oleander road hedge — MID green (the maze is dark blue-green, the topiary
// cats are yellow-green). Rounded ends and a ROUNDED CLIPPED TOP (a cylinder
// lying along the run, domed at both ends) so a line of these reads as one
// continuous trimmed wall instead of a row of flat-topped crates.
export function gOleander(rand) {
  const P = new Parts();
  const BODY = 0x4a8a48, TOP = 0x63ab5c, DARK = 0x35683a, FLECK = 0x7cbf68;
  // value gradient baked per vertex: a hedge is DARK at its feet and in its own
  // depth, lit only on the clipped crown. Without this a run of them is a row of
  // evenly bright bevelled slabs — the round-3 "plywood" note.
  const shade = (v) => 0.52 + 0.48 * Math.min(1, Math.max(0, (v.y + 0.1) / 1.45))
    + (Math.sin(v.x * 21.3 + v.z * 13.7 + v.y * 9.1) * 0.045);
  P.add(box(2.8, 1.35, 1.2), BODY, {
    tone: shade,
    warp: (v) => { if (v.y < 1.3) { v.x *= 1 + (rand() - 0.5) * 0.06; v.z *= 1 + (rand() - 0.5) * 0.16; } },
  });
  // one rounded end per side, tall enough to close the clipped top as well
  for (const sx of [-1, 1]) P.add(octa(0.62), BODY, { p: [sx * 1.4, 0.95, 0], s: [1, 1.5, 0.98], tone: shade });
  // NOT masked: aMask=1 would hand the clipped top the instance's FLOWER tint
  // and every hedge would turn into a pale pink slab.
  P.add(cyl(0.6, 0.6, 2.8, 7), TOP, { p: [-1.4, 1.35, 0], r: [0, 0, -Math.PI / 2], tone: shade });
  // BUMPY CAP: four irregular clipped lumps riding the crown, so the top edge is
  // a broken green line instead of a machined bevel
  for (let i = 0; i < 4; i++) {
    const t = -1.1 + i * 0.73 + (rand() - 0.5) * 0.24;
    P.add(octa(0.32 + rand() * 0.18), i % 2 ? TOP : FLECK, {
      p: [t, 1.6 + rand() * 0.22, (rand() - 0.5) * 0.44], s: [1.3, 0.6 + rand() * 0.32, 1.05],
      r: [0, rand() * 3, 0], warp: lumpy(rand, 0.26),
    });
  }
  // leaf flecks down both faces: colour noise where the slab used to be flat
  for (let i = 0; i < 4; i++) {
    const sgn = i % 2 ? 1 : -1;
    P.add(tetra(0.17 + rand() * 0.1), [FLECK, DARK, TOP][i % 3], {
      p: [-1.2 + rand() * 2.4, 0.28 + rand() * 1.1, sgn * (0.52 + rand() * 0.1)],
      r: [rand() * 3, rand() * 3, rand() * 3],
    });
  }
  for (let i = 0; i < 4; i++)
    P.add(octa(0.16 + rand() * 0.08), 0xf2a0c0, { p: [-1.15 + i * 0.75 + (rand() - 0.5) * 0.24, 1.86 + rand() * 0.22, (rand() - 0.5) * 0.66], mask: 1, s: [1, 0.75, 1] });
  return P.build();
}

// Tall grass tuft — the density workhorse.
export function gGrass(rand) {
  const P = new Parts();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand();
    const rr = 0.05 + rand() * 0.19;
    P.add(blade(0.18, 0.5 + rand() * 0.55, 0.25 + rand() * 0.3, 0.1), 0x9fd166, {
      p: [Math.cos(a) * rr, 0, Math.sin(a) * rr], r: [(rand() - 0.5) * 0.5, a, (rand() - 0.5) * 0.4], mask: 1, nUp: 0.68,
    });
  }
  return P.build();
}

// Wildflower — one stem, one bloom, tinted 3 ways.
export function gWildflower(rand) {
  const P = new Parts();
  P.add(blade(0.055, 0.52, 0.05, 0.6), 0x6f9a45, { nUp: 0.7 });
  P.add(cone(0.15, 0.17, 5), 0xf2c14e, { p: [0.02, 0.5, 0], r: [0.2, rand() * 3, 0], mask: 1, nUp: 0.6 });
  return P.build();
}

// ── Catnip, in three heights ─────────────────────────────────────────────────
// Real catnip (Nepeta) is a SILVERY-SAGE square-stemmed herb with paired heart
// leaves and a lavender-white flower spike, and a bed of it is waist-high on a
// human. The old one-size version was eight flat cards all pitched the same way
// in world X (see the gAgave note): from the game camera Catnip Commons read as
// fourteen loose blades on bare ground.
//
// `catnipPlant(rand, stems, H, leaves, bloom)` builds one plant: prism stems
// (volume, lit from every side), small leaf cards kept at nUp 0.15 so their
// reverse never flips to the hemisphere ground colour, and a flower spike.
function catnipPlant(rand, stems, H, leaves, bloom) {
  const P = new Parts();
  const STEM = 0x7e9a6b, LEAF = 0x94ab7e, LEAF2 = 0x82996e, FLOWER = 0xa892d4;
  const tips = [];
  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * Math.PI * 2 + rand() * 0.8, r = (0.03 + rand() * 0.1) * H;
    const h = H * (0.78 + rand() * 0.3), tilt = 0.08 + rand() * 0.22;
    const o = { p: [Math.cos(a) * r, 0, Math.sin(a) * r], r: [0, -a, -tilt] };
    P.add(prism(0.032 * H + 0.008, 0.02 * H + 0.006, h, 3), i % 2 ? STEM : LEAF2, o);
    tips.push({ o, h, a });
  }
  for (let i = 0; i < leaves; i++) {
    // baked into the STEM's frame (own lean, own yaw round the stem, own height)
    // so the pair rides the stem instead of swinging off the plant's origin
    const t = tips[i % tips.length];
    const up = 0.22 + (i / leaves) * 0.7;
    const w = (0.26 + rand() * 0.15) * H, ln = (0.24 + rand() * 0.13) * H;
    const g = blade(w, ln, ln * 0.45, 0.55)
      .rotateZ(-(0.95 + rand() * 0.4)).rotateY((i % 2 ? 1.9 : -1.9) + rand() * 0.6)
      .translate(0, t.h * up, 0);
    P.add(g, i % 3 ? LEAF : LEAF2, { ...t.o, mask: 1, nUp: 0.15 });
  }
  // the flower spike is an ACCENT, not the plant: at 0.26·H and full width it
  // bleached the whole bed to pale lilac from the game camera
  if (bloom) for (let i = 0; i < bloom; i++) {
    const t = tips[i % tips.length];
    P.add(prism(0.04 * H + 0.01, 0.012, 0.19 * H, 3).translate(0, t.h, 0), FLOWER, { ...t.o, mask: 0 });
  }
  return P.build();
}
/** Waist-high flowering catnip — the tier that makes the bed read as a MASS. */
export function gCatnipTall(rand) { return catnipPlant(rand, 3, 1.0, 9, 1); }
/** The workhorse middle tier. */
export function gCatnip(rand) { return catnipPlant(rand, 3, 0.62, 8, 1); }
/** Low fringe and trampled edges. */
export function gCatnipLow(rand) { return catnipPlant(rand, 3, 0.44, 7, 0); }

// ── Rock, in three shapes ────────────────────────────────────────────────────
// Round 3: "flat khaki blobs with hard seams". The seam was a bright ellipsoid
// meeting a dark one edge-on with no value transition; the flatness was one hue
// across the whole rock. All three builders below are STRATA — thin offset
// courses, each one darkened along its own underside by `band()`, so a rock has
// horizontal bedding lines and shadowed undercuts instead of a painted seam.
/** Darkens the bottom `soft` of a course centred on y0±h: the crevice shadow. */
const band = (y0, h, lo = 0.5, soft = 0.5) => (v) => {
  const t = Math.min(1, Math.max(0, (v.y - (y0 - h)) / (h * 2 * soft)));
  return lo + (1 - lo) * t;
};

export function gBoulder(rand) {
  const P = new Parts();
  const S = [
    [0.22, 1.02, 0.34, 0x7e5c33], [0.66, 0.96, 0.32, 0xb88b52], [1.06, 0.78, 0.28, 0xd2b07f],
  ];
  for (let i = 0; i < S.length; i++) {
    const [y, r, hh, col] = S[i];
    P.add(ico(r), col, {
      p: [(rand() - 0.5) * 0.34 + i * 0.14, y, (rand() - 0.5) * 0.34 - i * 0.1], s: [1, hh / r, 1],
      r: [0, rand() * 3, 0], mask: i ? 1 : 0, warp: lumpy(rand, 0.3), tone: band(y, hh),
    });
  }
  // an offset shoulder lobe: one smooth ellipsoid per rock is what made the
  // scatter read as identical polystyrene lumps at any distance
  P.add(octa(0.56), 0xc79a5e, { p: [0.66, 0.5, -0.3], s: [1.1, 0.72, 1.0], r: [0.2, rand() * 3, 0.16], mask: 1, warp: lumpy(rand, 0.36), tone: band(0.5, 0.4) });
  return P.build();
}

/** Angular tipped slab — the shape a rounded blob can never be. */
export function gBoulderSlab(rand) {
  const P = new Parts();
  const tip = 0.16 + rand() * 0.22;
  const S = [[0.0, 1.9, 0.32, 0x7e5c33], [0.3, 1.74, 0.3, 0xc2955a], [0.58, 1.5, 0.26, 0xd9bd8c]];
  for (let i = 0; i < S.length; i++) {
    const [y, w, hh, col] = S[i];
    P.add(box(w, hh, w * 0.66), col, {
      p: [(rand() - 0.5) * 0.2, y, (rand() - 0.5) * 0.16], r: [tip * 0.4, rand() * 3, -tip],
      mask: i ? 1 : 0, tone: band(y + hh / 2, hh * 0.7),
      warp: (v) => { v.x *= 1 + (rand() - 0.5) * 0.22; v.z *= 1 + (rand() - 0.5) * 0.22; },
    });
  }
  P.add(tetra(0.34), 0xb88b52, { p: [0.8 + rand() * 0.3, 0.1, -0.5], r: [rand() * 3, rand() * 3, rand() * 3], mask: 1 });
  return P.build();
}

/** Split stack: two masses with a dark crevice you can read from 40 units. */
export function gBoulderStack(rand) {
  const P = new Parts();
  P.add(ico(1.05), 0x7e5c33, { p: [0, 0.22, 0], s: [1.1, 0.3, 1.05], warp: lumpy(rand, 0.24), tone: band(0.22, 0.3) });
  for (const sx of [-1, 1]) {
    P.add(ico(0.66), sx > 0 ? 0xd2b07f : 0xc2955a, {
      p: [sx * 0.46, 0.62, (rand() - 0.5) * 0.2], s: [1.05, 0.86, 1.0], r: [0, rand() * 3, sx * 0.14],
      mask: 1, warp: lumpy(rand, 0.28), tone: band(0.62, 0.56, 0.5),
    });
  }
  P.add(octa(0.56), 0xe0c68f, { p: [-0.2, 1.16, 0.12], s: [1.0, 0.68, 0.95], r: [0.12, rand() * 3, 0], mask: 1, warp: lumpy(rand, 0.34), tone: band(1.16, 0.38) });
  P.add(octa(0.3), 0x86a15e, { p: [0.42, 1.06, -0.3], s: [1.3, 0.32, 1.2], warp: lumpy(rand, 0.34) });   // lichen
  return P.build();
}

/** Scree: the skirt of broken stone every real outcrop sheds downhill. */
export function gScree(rand) {
  const P = new Parts();
  P.add(octa(0.2 + rand() * 0.12), 0xc2955a, {
    p: [(rand() - 0.5) * 0.6, 0.05 + rand() * 0.05, (rand() - 0.5) * 0.6],
    s: [1.2, 0.44, 1.0], r: [0, rand() * 3, 0], mask: 1, warp: lumpy(rand, 0.34),
  });
  for (let i = 0; i < 3; i++)
    P.add(tetra(0.15 + rand() * 0.1), [0xd0a468, 0x8f6a3c, 0xdcc096][i], {
      p: [(rand() - 0.5) * 1.0, 0.04 + rand() * 0.06, (rand() - 0.5) * 1.0],
      s: [1.1, 0.6, 1.1], r: [rand() * 3, rand() * 3, rand() * 3], mask: i === 0 ? 1 : 0,
    });
  return P.build();
}

// Seashell (tiny fan).
export function gShell(rand) {
  const P = new Parts();
  P.add(disc(0.17, 5), 0xf6e6d0, { p: [0, 0.03, 0], r: [0.25, 0, 0.15], mask: 1, s: [1, 1, 0.8], nUp: 0.7 });
  return P.build();
}

// Sun-bleached driftwood.
export function gDriftwood(rand) {
  const P = new Parts();
  P.add(cyl(0.17, 0.22, 2.6, 5), 0xc4b39a, { p: [0, 0.2, 0], r: [0.1, 0, Math.PI / 2 - 0.12], mask: 1 });
  P.add(cyl(0.08, 0.12, 1.0, 4), 0xb5a184, { p: [0.5, 0.28, 0.1], r: [0.5, 0, 0.9] });
  return P.build();
}

// Scratching-post tree: sisal trunk, carpeted platforms, dangly ball.
export function gScratchPost(rand) {
  const P = new Parts();
  P.add(box(1.5, 0.3, 1.5), 0x8d5a34);
  P.add(cyl(0.27, 0.3, 2.6, 7), 0xd9c08a, { p: [0, 0.28, 0] });
  P.add(box(1.5, 0.22, 1.5), 0x2a8f8a, { p: [0, 1.5, 0], mask: 1 });
  P.add(cyl(0.24, 0.26, 1.5, 7), 0xd9c08a, { p: [0, 1.7, 0] });
  P.add(box(1.9, 0.26, 1.9), 0x2a8f8a, { p: [0, 3.2, 0], mask: 1 });
  P.add(octa(0.22), 0xd52b1e, { p: [0.75, 2.75, 0.3] });
  return P.build();
}

// Cardboard-box "bush" — stacked boxes, a flap, a dark hollow.
export function gBoxBush(rand) {
  const P = new Parts();
  P.add(box(1.25, 0.8, 1.0), 0xc9a06a, { mask: 1, r: [0, 0.2, 0] });
  P.add(box(0.95, 0.65, 0.85), 0xb08a58, { p: [0.22, 0.8, -0.12], r: [0, -0.45, 0.04], mask: 1 });
  P.add(box(0.7, 0.5, 0.6), 0xd6b07a, { p: [-0.32, 1.45, 0.18], r: [0, 0.8, -0.06], mask: 1 });
  P.add(box(0.62, 0.04, 0.5), 0xb08a58, { p: [-0.3, 1.95, 0.5], r: [-0.9, 0.8, 0] });
  P.add(box(0.5, 0.34, 0.06), 0x241a12, { p: [-0.28, 1.5, 0.46], r: [0, 0.8, 0] });
  P.add(box(0.46, 0.3, 0.06), 0x241a12, { p: [0.035, 0.98, 0.262], r: [0, -0.45, 0] });
  return P.build();
}

// The eyes inside the boxes (own emissive, tone-mapping-exempt material).
export function gBoxEyes() {
  const P = new Parts();
  // pair A — on the top box's hollow (panel centre y 1.67, yaw 0.8)
  P.add(new THREE.PlaneGeometry(0.21, 0.26), 0xffe27a, { p: [-0.153, 1.70, 0.416], r: [0, 0.8, 0] });
  P.add(new THREE.PlaneGeometry(0.21, 0.26), 0xffe27a, { p: [-0.321, 1.70, 0.588], r: [0, 0.8, 0] });
  // pair B — on the middle box's hollow (panel centre y 1.13, yaw -0.45)
  P.add(new THREE.PlaneGeometry(0.19, 0.23), 0xffd447, { p: [0.099, 1.14, 0.343], r: [0, -0.45, 0] });
  P.add(new THREE.PlaneGeometry(0.19, 0.23), 0xffd447, { p: [-0.082, 1.14, 0.265], r: [0, -0.45, 0] });
  return P.build();
}

// Cat-shaped topiary — LIGHT yellow-green, and built as separate lobes (ears,
// tail, paws) so the cat silhouette reads from the game camera, not just from
// straight above. Sits ~3.4 u tall, well clear of the 1.9 u hedges.
export function gTopiary(rand) {
  const P = new Parts();
  const G = 0x7cab52, GL = 0x92c05e, GD = 0x6a9647;
  P.add(ico(0.92), G, { p: [0, 0.84, -0.30], s: [1.0, 1.05, 0.95], mask: 1, warp: lumpy(rand, 0.12) });   // haunches
  P.add(ico(0.66), G, { p: [0, 1.44, 0.38], s: [1.0, 1.12, 0.95], mask: 1, warp: lumpy(rand, 0.1) });     // chest
  P.add(cyl(0.3, 0.4, 0.42, 6), GD, { p: [0, 1.88, 0.34], mask: 1 });                                     // neck
  P.add(ico(0.62), GL, { p: [0, 2.58, 0.40], s: [1.05, 0.95, 1.0], mask: 1, warp: lumpy(rand, 0.08) });    // head
  for (const sx of [-1, 1]) P.add(cone(0.29, 0.84, 5), GL, { p: [sx * 0.36, 2.86, 0.32], r: [-0.13, 0, -sx * 0.3], mask: 1 });
  P.add(octa(0.3), GD, { p: [0.02, 0.58, -0.98], mask: 1 });                                              // tail, three lobes
  P.add(octa(0.28), GD, { p: [0.12, 1.26, -1.14], mask: 1 });
  P.add(octa(0.26), GL, { p: [0.22, 1.92, -1.02], mask: 1 });
  for (const sx of [-1, 1]) P.add(octa(0.24), GL, { p: [sx * 0.34, 0.2, 0.9], s: [1, 0.8, 1.2], mask: 1 });
  return P.build();
}

// Yarn tangle snagged in the undergrowth.
export function gYarn(rand) {
  const P = new Parts();
  P.add(ico(0.42), 0xd52b1e, { p: [0, 0.36, 0], mask: 1, warp: lumpy(rand, 0.12) });
  P.add(blade(0.07, 0.75, 0.5, 0.6), 0xd52b1e, { p: [0.2, 0.5, 0.1], r: [1.1, 0.9, 0], mask: 1, nUp: 0.5 });
  return P.build();
}

// Fish-bone "flower" — grows where the harbour cats eat.
export function gFishbone(rand) {
  const P = new Parts();
  P.add(blade(0.05, 0.75, 0.05, 0.8), 0xd9d2c0, { nUp: 0.5 });
  for (let i = 0; i < 5; i++) {
    const y = 0.34 + i * 0.11, w = 0.3 - i * 0.045;
    P.add(blade(0.035, w, 0, 0.6), 0xf0ece2, { p: [0, y, 0], r: [0, 0, 1.35], mask: 1, nUp: 0.6 });
    P.add(blade(0.035, w, 0, 0.6), 0xf0ece2, { p: [0, y, 0], r: [0, 0, -1.35], mask: 1, nUp: 0.6 });
  }
  P.add(tetra(0.13), 0xf0ece2, { p: [0, 0.86, 0], mask: 1 });
  return P.build();
}

// Tuna-can planter for the main-street pavements.
export function gTunaCan(rand) {
  const P = new Parts();
  P.add(cyl(0.42, 0.4, 0.42, 8), 0xd52b1e);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    P.add(blade(0.16, 0.5 + rand() * 0.22, 0.25, 0.3), 0x6f9a45, { p: [Math.cos(a) * 0.14, 0.34, Math.sin(a) * 0.14], r: [0.35, a, 0], mask: 1, nUp: 0.8 });
  }
  P.add(octa(0.13), 0xf2c14e, { p: [0, 0.72, 0], mask: 1 });
  return P.build();
}

// Municipal koi — orange/white, dorsal fin breaking the surface so they read
// through the water from the game camera.
export function gKoi(rand) {
  const P = new Parts();
  P.add(octa(0.36), 0xff7a2a, { s: [0.55, 0.46, 1.35], mask: 1 });                              // body
  P.add(tetra(0.24), 0xff9340, { p: [0, 0, -0.5], s: [0.3, 0.75, 1.0], mask: 1 });               // tail
  P.add(octa(0.12), 0xfff1e0, { p: [0.03, 0.1, 0.16], s: [1.0, 0.5, 1.3] });                     // white blotch
  P.add(octa(0.1), 0xfff1e0, { p: [-0.04, 0.1, -0.16], s: [0.9, 0.5, 1.1] });
  P.add(blade(0.16, 0.2, 0.04, 0.4), 0xffb070, { p: [0, 0.12, -0.02], r: [0, Math.PI / 2, 0] });  // dorsal fin
  return P.build();
}

// Corridor scruff: pebbles and dry leaf litter for the bare maze floors.
export function gLitter(rand) {
  const P = new Parts();
  P.add(octa(0.26), 0xc4a880, { p: [0, 0.08, 0], s: [1.25, 0.5, 1.0], mask: 1, warp: lumpy(rand, 0.34) });
  P.add(disc(0.21, 5), 0xa8813c, { p: [0.36, 0.045, 0.22], r: [0.06, 1.1, 0.08], mask: 1, nUp: 0.7 });
  P.add(disc(0.17, 5), 0xbb9448, { p: [-0.3, 0.035, -0.24], r: [-0.07, 2.4, 0.05], mask: 1, nUp: 0.7 });
  P.add(octa(0.14), 0xb5a184, { p: [-0.38, 0.05, 0.32], s: [1.1, 0.6, 1], mask: 1 });
  return P.build();
}

// Lily pad + bud.
export function gLilyPad(rand) {
  const P = new Parts();
  P.add(disc(0.46, 6), 0x4f8a5b, { p: [0, 0.02, 0], mask: 1, nUp: 1 });
  P.add(octa(0.11), 0xf2a0c0, { p: [0.2, 0.09, 0.12], mask: 0 });
  return P.build();
}

// ── birds (own material: wing flap in the vertex shader) ─────────────────────
// Herring gull, ~3.7 u wingspan at scale 1 so it still reads at 46 u. The wings
// are SOLID tapered wedges with a grey mantle and dark tips: flat planes turned
// into featureless white slivers the moment the sun came from above.
export function gGull() {
  const P = new Parts();
  P.add(octa(0.42), 0xf9f5ee, { p: [0, 0.06, 0], s: [0.72, 0.5, 1.55], mask: 1 });   // body
  P.add(octa(0.3), 0x7c8794, { p: [0, 0.2, -0.18], s: [0.8, 0.26, 1.25] });          // grey mantle
  P.add(tetra(0.2), 0xf2c14e, { p: [0, 0.04, 0.62], s: [0.55, 0.45, 1.3] });         // beak
  for (const sx of [-1, 1]) {
    const taper = (v) => { const t = (v.x * sx + 0.78) / 1.56; v.z *= 1 - 0.52 * t; v.y *= 1 - 0.45 * t; };
    P.add(box(1.56, 0.17, 0.68), 0xf9f5ee, { p: [sx * 0.88, 0.0, 0.05], r: [0, 0, -sx * 0.2], mask: 1, flap: 1, warp: taper });
    P.add(box(0.48, 0.11, 0.3), 0x3f4450, { p: [sx * 1.64, 0.2, -0.03], r: [0, sx * 0.3, -sx * 0.3], flap: 1 });
  }
  P.add(box(0.52, 0.11, 0.58), 0xf9f5ee, { p: [0, 0.0, -0.74], mask: 1 });           // tail
  return P.build(['position', 'normal', 'color', 'aMask', 'aFlap']);
}

// Town pigeon. Round 3: "flat paper shapes lying on the grass" — the wings and
// the tail were horizontal PlaneGeometry cards at y 0.3, so a standing bird was
// literally three pieces of paper on the lawn. Now it is a plump upright body on
// two legs with FOLDED wings (solid tapered wedges tucked against the flanks)
// and a tail that cocks up behind. The wings still carry aFlap, so the flying
// state opens them exactly as before.
export function gPigeon() {
  const P = new Parts();
  const BODY = 0x8a8a94, WING = 0x6f7078, DARK = 0x585a63;
  for (const sx of [-1, 1]) P.add(prism(0.05, 0.035, 0.22, 3), 0xd98a5a, { p: [sx * 0.08, 0, 0.02] });  // legs
  P.add(octa(0.31), BODY, { p: [0, 0.42, -0.02], s: [0.9, 0.95, 1.35], mask: 1 });                    // breast + belly
  P.add(octa(0.19), BODY, { p: [0, 0.72, 0.2], s: [1.0, 1.0, 1.0], mask: 1 });                        // head
  P.add(tetra(0.09), 0xf2c14e, { p: [0, 0.7, 0.36], s: [0.7, 0.6, 1.5] });                            // beak
  P.add(octa(0.12), 0x4f8f8a, { p: [0, 0.58, 0.16], s: [1, 0.9, 1.1] });                              // iridescent throat
  for (const sx of [-1, 1]) {
    const taper = (v) => { const t = (v.z + 0.28) / 0.56; v.y *= 1 - 0.55 * (1 - t); v.x *= 1 - 0.4 * (1 - t); };
    P.add(box(0.17, 0.2, 0.56), WING, { p: [sx * 0.23, 0.34, -0.06], r: [0, 0, -sx * 0.14], mask: 1, flap: 1, warp: taper });
    P.add(tetra(0.15), DARK, { p: [sx * 0.21, 0.36, -0.36], s: [0.7, 0.5, 1.3], flap: 1 });           // primaries
  }
  P.add(box(0.24, 0.09, 0.34), WING, { p: [0, 0.42, -0.4], r: [-0.45, 0, 0], mask: 1, flap: 0 });     // cocked tail
  return P.build(['position', 'normal', 'color', 'aMask', 'aFlap']);
}

/** Tiny contact shadow under a standing bird — its own material, unlit black. */
export function gBirdBlob() { return new Parts().add(disc(0.42, 9), 0x000000, {}).build(['position', 'normal', 'color', 'aMask']); }

export { box, cyl, cone, octa, ico, tetra, prism, blade, frond, feather, disc, lumpy, leafPlate };
