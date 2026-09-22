// ─────────────────────────────────────────────────────────────────────────────
// Candyland vegetation — geometry kit.
//
// Every species is authored as a handful of chunky primitives merged into ONE
// indexed BufferGeometry carrying: position, normal, uv, color, aVeg.
//   aVeg.x = tint mask   (1 → this vertex takes the per-instance candy colour)
//   aVeg.y = motion mask (species-specific: sway weight, spin flag, twinkle…)
// Merging is done here (not via BufferGeometryUtils) so that every part can be
// given its own colour / mask / uv override in one pass.
//
// Poly budget per species is kept brutal on purpose — silhouette does the work.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const TAU = Math.PI * 2;
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();

/** Matrix helper: M({ p:[x,y,z], r:[x,y,z], s:number|[x,y,z] }) */
export function M({ p = [0, 0, 0], r = [0, 0, 0], s = 1 } = {}) {
  const sc = typeof s === 'number' ? [s, s, s] : s;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(sc[0], sc[1], sc[2]));
}

export class Kit {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.V = []; this.I = []; }

  /**
   * @param {THREE.BufferGeometry} src
   * @param {object} o  { m, color, tint, motion, uv }
   *   color  hex | (x,y,z)=>hex
   *   tint   0..1 | (x,y,z)=>0..1      → aVeg.x
   *   motion 0..1 | (x,y,z)=>number    → aVeg.y
   *   uv     null | [u,v] | (x,y,z,u,v)=>[u,v]
   */
  add(src, o = {}) {
    const { m = null, color = 0xffffff, tint = 0, motion = 0, uv = null } = o;
    const pos = src.attributes.position, nor = src.attributes.normal, suv = src.attributes.uv;
    const idx = src.index;
    const base = this.P.length / 3;
    if (m) { _m.copy(m); _nm.getNormalMatrix(_m); }
    for (let i = 0; i < pos.count; i++) {
      _v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (m) _v.applyMatrix4(_m);
      const x = _v.x, y = _v.y, z = _v.z;
      this.P.push(x, y, z);
      _v.set(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (m) _v.applyMatrix3(_nm).normalize();
      this.N.push(_v.x, _v.y, _v.z);
      const u0 = suv ? suv.getX(i) : 0, v0 = suv ? suv.getY(i) : 0;
      let uu = u0, vv = v0;
      if (Array.isArray(uv)) { uu = uv[0]; vv = uv[1]; }
      else if (typeof uv === 'function') { const r = uv(x, y, z, u0, v0); uu = r[0]; vv = r[1]; }
      this.U.push(uu, vv);
      _c.setHex(typeof color === 'function' ? color(x, y, z) : color);
      this.C.push(_c.r, _c.g, _c.b);
      this.V.push(typeof tint === 'function' ? tint(x, y, z) : tint,
        typeof motion === 'function' ? motion(x, y, z) : motion);
    }
    if (idx) for (let i = 0; i < idx.count; i++) this.I.push(base + idx.getX(i));
    else for (let i = 0; i < pos.count; i++) this.I.push(base + i);
    src.dispose();
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aVeg', new THREE.Float32BufferAttribute(this.V, 2));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  }
}

// ── primitive shorthands ─────────────────────────────────────────────────────
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const oct = (r) => new THREE.OctahedronGeometry(r, 0);
const cyl = (rt, rb, h, s, open = true) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const cone = (r, h, s) => new THREE.ConeGeometry(r, h, s, 1, false);
const box = (w, h, d, ws = 1, hs = 1, ds = 1) => new THREE.BoxGeometry(w, h, d, ws, hs, ds);
const circ = (r, s) => new THREE.CircleGeometry(r, s);
const tet = (r) => new THREE.TetrahedronGeometry(r, 0);
const sph = (r, w, h, tl) => new THREE.SphereGeometry(r, w, h, 0, TAU, 0, tl ?? Math.PI);
/** Open cone (no base cap): `s` triangles, the cheapest usable bulge/flare there is. */
const coneO = (r, h, s) => new THREE.ConeGeometry(r, h, s, 1, true);

/**
 * Replace an ico/oct's FLAT face normals with smooth spherical ones.
 * This one line is most of the "gummy, not felt" fix: a 20-triangle icosahedron
 * with face normals reads as a stitched toy; the same 20 triangles with
 * spherical normals read as a soft translucent blob, and cost nothing.
 */
function smoothN(g) {
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i), p.getY(i), p.getZ(i));
    if (_v.lengthSq() > 1e-9) _v.normalize(); else _v.set(0, 1, 0);
    n.setXYZ(i, _v.x, _v.y, _v.z);
  }
  n.needsUpdate = true;
  return g;
}
const sico = (r, d = 0) => smoothN(new THREE.IcosahedronGeometry(r, d));
const soct = (r) => smoothN(new THREE.OctahedronGeometry(r, 0));
/** A tapered grass blade: 4 verts, 2 tris, narrower at the tip so it reads organic. */
function blade(w, h, taper = 0.42) {
  const g = new THREE.BufferGeometry();
  const hw = w * 0.5, tw = w * taper * 0.5;
  g.setAttribute('position', new THREE.Float32BufferAttribute([-hw, 0, 0, hw, 0, 0, tw, h, 0, -tw, h, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

// UV corners of the pattern atlas: FLAT = base colour, FULL = full tint.
export const UV_FLAT = [0.03, 0.03];
export const UV_FULL = [0.94, 0.94];

const sway = (y0, span, k = 1) => (x, y) => Math.max(0, (y - y0) / span) * k;

// ═════════════════════════════════════════════════════════════════════════════
// SPECIES GEOMETRY
// Each returns { geo, height, colliderR } in local units (instance scale ≈ 1).
// ═════════════════════════════════════════════════════════════════════════════

// ── GUMMY BEAR TREES ─────────────────────────────────────────────────────────
// THREE separate silhouettes, one per size tier, because 270 copies of one bear
// is what made the forest read as a shelf of identical plush toys:
//   sap   young, chubby, big round ears, arms tucked, cheap (ico detail 0)
//   mid   the working forest bear, subdivided body + head, arms out
//   gran  hunched grandmother, droopy ears, arms hanging, a dusty shawl collar
// uv.x carries a PART ID (not a texture lookup — gummies have no texture), so the
// vertex shader can pose head and arms per instance and no two bears in a stand
// stand the same way. See GUMMY_POSE_GLSL in shaders.js.
export const GUMMY_PART = { trunk: 0.02, leg: 0.10, body: 0.18, head: 0.30, armL: 0.46, armR: 0.58 };

/** @param {'sap'|'mid'|'gran'} tier */
export function gummyTreeGeo(tier = 'mid') {
  const k = new Kit();
  const SAP = tier === 'sap', GRAN = tier === 'gran';
  const P = GUMMY_PART;
  const U = (id) => [id, 0.5];
  const TRUNK = SAP ? 2.15 : GRAN ? 3.0 : 2.8;
  const D = SAP ? 0 : 1;                                   // ico subdivision
  const w = sway(0.7, 5.4);
  const BR = SAP ? 0.9 : GRAN ? 1.06 : 1.0;                // body radius
  const BY = TRUNK + (SAP ? 0.92 : GRAN ? 1.12 : 1.08);    // body centre — the
  // trunk top (y = TRUNK) now sits a clear 0.3 INSIDE the belly. Round 2 had the
  // canopy balanced on the trunk cap and every bear looked stuck on a skewer.
  const BS = SAP ? [1.26, 1.12, 1.18] : GRAN ? [1.44, 1.2, 1.18] : [1.34, 1.28, 1.1];
  const HR = SAP ? 0.8 : GRAN ? 0.8 : 0.8;                 // head radius
  const HY = BY + (SAP ? 1.24 : GRAN ? 1.34 : 1.38);       // head centre
  const NECK = BY + (SAP ? 0.5 : 0.6);                     // head-tilt pivot
  const ARM = SAP ? [1.12, BY + 0.1] : GRAN ? [1.24, BY - 0.06] : [1.36, BY + 0.26];
  const B = { tint: 1, motion: w, color: 0xffffff };

  // root flare: the trunk swells out into the ground instead of being posted in
  k.add(coneO(SAP ? 0.62 : GRAN ? 1.02 : 0.8, SAP ? 0.5 : GRAN ? 0.88 : 0.68, SAP ? 6 : 7),
    { m: M({ p: [0, SAP ? 0.25 : GRAN ? 0.44 : 0.34, 0] }), color: 0x77441c, tint: 0, motion: 0, uv: U(P.trunk) });
  k.add(cyl(SAP ? 0.22 : GRAN ? 0.34 : 0.26, SAP ? 0.38 : GRAN ? 0.58 : 0.46, TRUNK, SAP ? 5 : 6),
    { m: M({ p: [0, TRUNK / 2, 0] }), color: 0xa9682a, tint: 0, motion: w, uv: U(P.trunk) });
  if (!SAP) {   // caramel drip collar — reads as a candy trunk, not a stick
    k.add(cyl(0.38, 0.34, 0.28, 6), { m: M({ p: [0, 1.05, 0] }), color: 0xd98b2b, tint: 0, motion: w, uv: U(P.trunk) });
    if (GRAN) k.add(cyl(0.5, 0.44, 0.3, 7), { m: M({ p: [0, 2.05, 0] }), color: 0xd98b2b, tint: 0, motion: w, uv: U(P.trunk) });
  }
  // legs first (own part id so the arm pose never grabs them)
  const LR = SAP ? 0.44 : GRAN ? 0.55 : 0.5;
  for (const sx of [-1, 1]) {
    k.add(soct(LR), {
      m: M({ p: [sx * (SAP ? 0.6 : GRAN ? 0.84 : 0.74), TRUNK + (GRAN ? 0.06 : 0.04), 0.2], s: [1.1, 0.85, 1.06] }),
      ...B, uv: U(P.leg),
    });
  }
  k.add(sico(BR, D), { m: M({ p: [0, BY, 0], s: BS }), ...B, uv: U(P.body) });
  // arms — chunky and OUT to the sides: the classic gummy-bear semaphore is the
  // silhouette that says "bear" at 31 u. Pose swings them per instance.
  const AR = SAP ? 0.44 : GRAN ? 0.54 : 0.5;
  const ARZ = SAP ? 0.72 : GRAN ? 1.05 : 0.4;
  for (const [sx, id] of [[-1, P.armL], [1, P.armR]]) {
    k.add(soct(AR), {
      m: M({ p: [sx * ARM[0], ARM[1], 0.12], r: [0, 0, -sx * ARZ], s: [1.5, 0.86, 0.88] }),
      ...B, uv: U(id),
    });
  }
  // head group — head, ears, snout and eyes all carry the HEAD part id so the
  // shader can nod and turn the whole thing as one piece
  k.add(sico(HR, D), { m: M({ p: [0, HY, 0.04], s: [1.0, 0.95, 0.97] }), ...B, uv: U(P.head) });
  const EAR = SAP ? { r: 0.36, x: 0.6, y: 0.58, rz: 0, s: [1.2, 1.08, 0.78] }
    : GRAN ? { r: 0.38, x: 0.72, y: 0.28, rz: 0.6, s: [1.28, 0.68, 0.7] }
      : { r: 0.32, x: 0.6, y: 0.5, rz: 0, s: [1.06, 1.0, 0.72] };
  k.add(soct(EAR.r), { m: M({ p: [-EAR.x, HY + EAR.y, 0], r: [0, 0, EAR.rz], s: EAR.s }), ...B, uv: U(P.head) });
  k.add(soct(EAR.r), { m: M({ p: [EAR.x, HY + EAR.y, 0], r: [0, 0, -EAR.rz], s: EAR.s }), ...B, uv: U(P.head) });
  // Snout and eyes sit ON the face, not in it. Round 2 buried both inside the
  // head sphere (an icosahedron's face plane is 0.8 × its circumradius, so a
  // feature at 0.64 R is simply gone) and the bears had no faces at all.
  const FZ = HR + 0.04;
  k.add(soct(SAP ? 0.2 : 0.22), { m: M({ p: [0, HY - 0.17, FZ * 0.96], s: [1.2, 0.85, 1.0] }), color: 0xd2d2d2, tint: 1, motion: w, uv: U(P.head) });
  const E = { color: 0x33121c, tint: 0, motion: w, uv: U(P.head) };
  const EY = SAP ? 0.2 : 0.16, EX = SAP ? 0.3 : 0.31;
  for (const sx of [-1, 1]) {
    k.add(soct(SAP ? 0.17 : 0.16), { m: M({ p: [sx * EX, HY + EY, FZ * 0.94], s: [1, 1.05, 0.5] }), ...E });
  }
  // ninety years of dust: grandmother wears a shawl, wider than her shoulders
  if (GRAN) k.add(cyl(1.22, 1.46, 0.46, 9), { m: M({ p: [0, NECK + 0.05, 0] }), color: 0xbfa6c8, tint: 0, motion: w, uv: U(P.body) });

  return {
    geo: k.build(),
    height: HY + HR + EAR.y,
    neckY: NECK, armX: ARM[0], armY: ARM[1],
    colliderR: SAP ? 0.7 : GRAN ? 1.1 : 0.95,
  };
}

/** Lollipop tree — glossy stick + a LENS-shaped swirl head that spins. ~99 tris.
 *  The head used to be two flat discs and a rim, which from the palace approach
 *  read as a painted decal on a stick. Each face is now a shallow open cone
 *  (same triangle count as the disc it replaces) so the head has a real convex
 *  cross-section, and per-instance thickness (sz) varies 0.8–1.5. */
export function lollipopGeo() {
  const k = new Kit();
  const H = 5.0, R = 1.62, T = 0.30, BULGE = 0.30, SEG = 18;
  // Stick: 10-sided, with a BAKED highlight band around it (vertex colour by
  // radial angle). Under the flat pink ambient of Candyland a plain white
  // cylinder resolved to a matte grey utility pole; the baked band plus the
  // small emissive lift in the material (keyed on aVeg.y < 0.5) makes it read
  // as a glossy candy rod at any sun angle.
  const stickCol = (x, y, z) => {
    const t = 0.5 + 0.5 * Math.cos(Math.atan2(z, x) - 0.8);
    const v = Math.round(206 + 49 * t ** 1.5);
    return (v << 16) | (v << 8) | Math.min(255, v + 3);
  };
  const HY = H + R * 0.82;
  // a sugared mound where the stick meets the ground — every trunk gets a foot
  k.add(coneO(0.46, 0.32, 7), { m: M({ p: [0, 0.16, 0] }), color: 0xf0e2ea, tint: 0, motion: 0.25, uv: UV_FLAT });
  k.add(cyl(0.155, 0.2, H, 10), { m: M({ p: [0, H / 2, 0] }), color: stickCol, tint: 0, motion: 0.25, uv: UV_FLAT });
  const HEAD = { color: 0xffffff, tint: 0, motion: 1 };            // motion=1 → spins
  // lens faces. Kit gives the uv fn the TRANSFORMED position, so the swirl is
  // looked up in the head's own disc space regardless of where the cone sits.
  const uvF = (x, y) => [x / (R * 2) + 0.5, (y - HY) / (R * 2) + 0.5];
  const uvB = (x, y) => [0.5 - x / (R * 2), (y - HY) / (R * 2) + 0.5];
  k.add(coneO(R, BULGE, SEG), { m: M({ p: [0, HY, T / 2 + BULGE / 2], r: [Math.PI / 2, 0, 0] }), ...HEAD, uv: uvF });
  k.add(coneO(R, BULGE, SEG), { m: M({ p: [0, HY, -T / 2 - BULGE / 2], r: [-Math.PI / 2, 0, 0] }), ...HEAD, uv: uvB });
  // rim tinted via vertex colour × aTint (tint:1) — NOT via a lone texture texel
  k.add(cyl(R, R, T, SEG), { m: M({ p: [0, HY, 0], r: [Math.PI / 2, 0, 0] }), color: 0xffffff, tint: 1, motion: 1, uv: UV_FLAT });
  return { geo: k.build(), height: HY + R, headY: HY, stickH: H, colliderR: 0.75 };
}

/** Cotton-candy bush — FIVE small puffs, not three big ones. Three fat facets
 *  read as a pink boulder at game distance; five lobes give the bumpy silhouette
 *  that says "fluff", and the whole bush is kept knee-to-waist high so it sits
 *  UNDER the canopy instead of competing with it. ~100 tris. */
export function cottonCandyGeo() {
  const k = new Kit();
  // Four lobes, smooth-normalled: the fifth cost 20 tris × 400 instances and the
  // fuzz shader (soft rim + dithered silhouette) now does the "fluff" work that
  // an extra facet used to be asked for.
  const B = { color: 0xffffff, tint: 1, motion: 1, uv: UV_FLAT };
  k.add(sico(0.70), { m: M({ p: [0, 0.72, 0], s: [1.16, 1.02, 1.10] }), ...B });
  k.add(sico(0.54), { m: M({ p: [-0.58, 0.44, 0.20], s: [1.05, 0.95, 1.05] }), ...B });
  k.add(sico(0.48), { m: M({ p: [0.55, 0.48, -0.24], s: [1.10, 1.00, 0.98] }), ...B });
  k.add(sico(0.44), { m: M({ p: [0.13, 1.06, 0.30], s: [1.05, 0.98, 1.02] }), ...B });
  return { geo: k.build(), height: 1.5, colliderR: 0 };
}

/** Candy cane reed — a bent striped cane that bows in the wind. ~44 tris. */
export function candyCaneGeo() {
  const k = new Kit();
  const pts = [];
  const H = 3.0;
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    // straight stalk that curls into a hook at the top
    const hook = Math.max(0, (t - 0.68) / 0.32);
    pts.push(new THREE.Vector3(Math.sin(hook * Math.PI * 0.9) * 0.52, t * H - hook * hook * 0.28, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  // 0.19 radius / 5 sides: the old 0.13×4 cane was a thin stick whose stripes
  // minified into a uniform cream smear — it read as a bare bone on the ground.
  const tube = new THREE.TubeGeometry(curve, 7, 0.19, 5, false);
  k.add(tube, {
    color: 0xfffaf0, tint: 0, motion: sway(0.2, 2.8, 1.0),
    uv: (x, y, z, u, v) => [u * 1.7, v * 0.5],
  });
  return { geo: k.build(), height: H, colliderR: 0 };
}

/** Candy-cane 'pine' for Frosting Peak — striped conical tree. ~60 tris. */
export function canePineGeo() {
  const k = new Kit();
  const w = sway(1.0, 5.0, 0.8);
  k.add(coneO(0.62, 0.55, 6), { m: M({ p: [0, 0.27, 0] }), color: 0x63391f, tint: 0, motion: 0, uv: UV_FLAT }); // root flare
  k.add(cyl(0.2, 0.32, 1.5, 5), { m: M({ p: [0, 0.75, 0] }), color: 0x7a4a2a, tint: 0, motion: w, uv: UV_FLAT });
  const C = { color: 0xffffff, tint: 0, motion: w, uv: (x, y, z, u, v) => [u * 2.4, v * 0.9] };
  k.add(cone(1.5, 2.0, 7), { m: M({ p: [0, 2.0, 0] }), ...C });
  k.add(cone(1.15, 1.8, 7), { m: M({ p: [0, 3.3, 0], r: [0, 0.5, 0] }), ...C });
  k.add(cone(0.8, 1.7, 7), { m: M({ p: [0, 4.5, 0], r: [0, 1.0, 0] }), ...C });
  return { geo: k.build(), height: 5.4, colliderR: 0.8 };
}

/** Peppermint pinwheel flower. A real *solid* candy disc (0.16 thick, tinted
 *  rim + back) so it never vanishes edge-on, with the stem running into the
 *  centre of its BACK face rather than clipping its lower rim. ~44 tris. */
export function peppermintGeo() {
  const k = new Kit();
  const H = 0.56, R = 0.4, T = 0.16, CY = H + 0.12, SEG = 9;
  const w = sway(0, H, 1);
  // stem leans back so its tip lands behind the disc centre, not at the rim
  k.add(cyl(0.05, 0.075, H, 4), { m: M({ p: [0, H / 2, -0.07], r: [0.26, 0, 0] }), color: 0x5cb85c, tint: 0, motion: w, uv: UV_FLAT });
  const TILT = -0.88;
  k.add(circ(R, SEG), { m: M({ p: [0, CY, 0.04], r: [TILT, 0, 0] }), color: 0xffffff, tint: 0, motion: 1 });          // pinwheel face
  k.add(cyl(R, R, T, SEG), { m: M({ p: [0, CY, 0.04], r: [TILT + Math.PI / 2, 0, 0] }), color: 0xffffff, tint: 1, motion: 1, uv: UV_FLAT }); // rim
  k.add(circ(R * 0.92, 7), { m: M({ p: [0, CY, 0.04], r: [TILT + Math.PI, 0, 0] }), color: 0xffffff, tint: 1, motion: 1, uv: UV_FLAT });     // back
  return { geo: k.build(), height: 1.1, colliderR: 0 };
}

/** Gumdrop shrub — faceted sugared dome. ~30 tris. */
export function gumdropGeo() {
  const k = new Kit();
  k.add(sph(0.8, 6, 3, Math.PI * 0.56), { m: M({ p: [0, 0.02, 0], s: [1.0, 1.45, 1.0] }), color: 0xffffff, tint: 1, motion: 1, uv: UV_FLAT });
  return { geo: k.build(), height: 1.2, colliderR: 0 };
}

/** Marshmallow rock — squat cream boulder. ~28 tris. */
export function marshmallowGeo() {
  const k = new Kit();
  k.add(cyl(0.88, 1.08, 1.55, 7, false), { m: M({ p: [0, 0.66, 0] }), color: 0xfffaf0, tint: 1, motion: 0, uv: UV_FLAT });
  return { geo: k.build(), height: 1.55, colliderR: 0 };
}

/** Jelly-bean pebble cluster — three beans huddled. ~60 tris. */
export function jellyBeanGeo() {
  const k = new Kit();
  const B = { color: 0xffffff, tint: 1, motion: 0, uv: UV_FLAT };
  k.add(ico(0.3), { m: M({ p: [0, 0.2, 0], r: [0, 0.4, 0.2], s: [1.55, 0.85, 1.0] }), ...B });
  k.add(ico(0.24), { m: M({ p: [0.48, 0.16, 0.3], r: [0, -0.9, -0.1], s: [1.5, 0.85, 1.0] }), ...B });
  k.add(ico(0.2), { m: M({ p: [-0.33, 0.14, 0.42], r: [0, 1.9, 0.15], s: [1.5, 0.85, 1.0] }), ...B });
  return { geo: k.build(), height: 0.4, colliderR: 0 };
}

/** Fallen "log" — a chocolate bar the size of a park bench, one square bitten
 *  off. Segmented top so it never reads as lumber. ~56 tris. */
export function waferLogGeo() {
  const k = new Kit();
  const F = { tint: 0, motion: 0, uv: UV_FLAT };
  // Round 2 note: the squares sat with their undersides at y = 0.40 against a
  // slab whose top is 0.42 — a two-centimetre bite of overlap that, once the bar
  // was rolled and ground-aligned, showed daylight and read as four separate
  // bricks hovering over a plank. They are now WIDER than the gap between them,
  // seated 0.12 into the slab, and the bar itself is sunk deeper by its caller.
  k.add(box(1.24, 0.46, 3.5), { m: M({ p: [0, 0.23, 0] }), color: 0x53301a, ...F });        // slab
  for (const [i, zz] of [-1.26, -0.42, 0.42, 1.26].entries()) {
    k.add(box(1.06, 0.30, 0.76), { m: M({ p: [0, 0.53, zz] }), color: i % 2 ? 0x8a5a34 : 0x7a4a2a, ...F });
  }
  // the bitten corner: a chunk gouged OUT of the end of the bar, half-buried in it
  k.add(oct(0.36), { m: M({ p: [0.4, 0.44, 1.62], r: [0.4, 0.6, 0.2], s: [1, 0.8, 1] }), color: 0x9a6438, ...F });
  return { geo: k.build(), height: 0.95, colliderR: 0 };
}

/** Sugar-crystal cluster — glows and twinkles at night. ~32 tris. */
export function sugarCrystalGeo() {
  const k = new Kit();
  const C = { color: 0xffffff, tint: 1, motion: 1, uv: UV_FLAT };
  k.add(oct(0.72), { m: M({ p: [0, 0.86, 0], r: [0, 0.3, 0.06], s: [0.66, 1.7, 0.66] }), ...C });
  k.add(oct(0.54), { m: M({ p: [0.62, 0.52, 0.2], r: [0.2, 0.9, 0.35], s: [0.62, 1.45, 0.62] }), ...C });
  k.add(oct(0.44), { m: M({ p: [-0.48, 0.44, -0.32], r: [-0.15, 1.7, -0.4], s: [0.62, 1.4, 0.62] }), ...C });
  k.add(oct(0.32), { m: M({ p: [-0.14, 0.3, 0.58], r: [0.1, 0.4, 0.22], s: [0.72, 1.3, 0.72] }), ...C });
  return { geo: k.build(), height: 1.6, colliderR: 0 };
}

/** Grass tuft — 4 WIDE blades, all of them leaf. The old version carried one
 *  bright candy-coloured spike; a thousand of those scattered across the island
 *  became the dominant ground texture and read as confetti litter. Every blade
 *  now takes the instance tint (a green, or occasionally a soft candy-grass
 *  pastel) scaled by its own baked shade, so a tuft reads as ONE plant. 8 tris. */
export function sprinkleGrassGeo() {
  const k = new Kit();
  const one = (ang, rad, h, wdt, tilt, shade) => {
    k.add(blade(wdt, h), {
      m: M({ p: [Math.cos(ang) * rad, 0, Math.sin(ang) * rad], r: [tilt * Math.sin(ang), ang, -tilt * Math.cos(ang)] }),
      color: shade, tint: 1, uv: UV_FLAT, motion: (x, y) => Math.max(0, y / h) ** 1.5,
    });
  };
  one(0.0, 0.10, 1.02, 0.40, 0.20, 0xffffff);
  one(1.9, 0.14, 0.84, 0.36, 0.32, 0xdcefe1);
  one(3.5, 0.12, 0.93, 0.34, -0.24, 0xc2dcc9);
  one(5.1, 0.15, 0.70, 0.30, 0.16, 0xeef8f0);
  return { geo: k.build(), height: 1.02, colliderR: 0 };
}

/** Root mat — a dense clump of ELEVEN big blades that hugs a trunk base or a
 *  path edge. This is the understory filler: tufts scattered one-by-one read as
 *  litter, a mat reads as old growth. Blades are ~3× the old tuft blade and all
 *  take the instance tint, so a mat is one green mass, never confetti. 22 tris. */
export function rootMatGeo() {
  const k = new Kit();
  const B = [
    [0.00, 0.00, 1.24, 0.50, 0.10, 0xffffff],
    [0.62, 0.38, 1.02, 0.46, 0.34, 0xe6f4e9],
    [1.35, 0.50, 0.86, 0.42, 0.44, 0xcfe6d5],
    [2.20, 0.34, 1.14, 0.47, 0.26, 0xf4fbf5],
    [3.05, 0.54, 0.78, 0.38, 0.50, 0xdcefe0],
    [3.90, 0.30, 1.08, 0.44, 0.24, 0xffffff],
    [4.70, 0.52, 0.84, 0.40, 0.46, 0xc2dcc9],
    [5.50, 0.26, 1.18, 0.48, 0.16, 0xeef8f0],
    [6.02, 0.60, 0.72, 0.34, 0.54, 0xd6ebdc],
  ];
  for (const [ang, rad, h, wdt, tilt, color] of B) {
    k.add(blade(wdt, h), {
      m: M({ p: [Math.cos(ang) * rad, 0, Math.sin(ang) * rad], r: [tilt * Math.sin(ang), ang, -tilt * Math.cos(ang)] }),
      color, tint: 1, uv: UV_FLAT, motion: (x, y) => Math.max(0, y / h) ** 1.5,
    });
  }
  return { geo: k.build(), height: 1.22, colliderR: 0 };
}

/** Caramel reed cluster for the Chocolate Lake shore. ~50 tris. */
export function caramelReedGeo() {
  const k = new Kit();
  const one = (dx, dz, h, lean) => {
    const w = sway(0, h, 1.1);
    const tx = dx + Math.sin(lean) * h * 0.82, ty = h * 0.74 + Math.cos(lean) * h * 0.1;
    // mid-caramel stalk: a pale cream stalk vanished against the pale lake
    // surface and the reeds read as bare sticks with nothing on top
    k.add(cyl(0.09, 0.13, h * 0.72, 4), { m: M({ p: [dx, h * 0.36, dz], r: [0, 0, lean] }), color: 0xd9a352, tint: 0, motion: w, uv: UV_FLAT });
    // a fat toffee cattail occupying the top third of the stalk, with a pale
    // sugared tip — a dark head against dark chocolate read as no head at all
    k.add(ico(0.32), {
      m: M({ p: [tx, ty, dz], r: [0, 0, lean], s: [1.0, 1.95, 1.0] }),
      color: (x, y) => (y > ty + 0.34 ? 0xf7e3bc : 0xb56a22), tint: 0, motion: () => 1.15, uv: UV_FLAT,
    });
  };
  one(0, 0, 2.0, 0.05);
  one(0.46, 0.34, 1.45, -0.16);
  one(-0.38, 0.3, 1.72, 0.18);
  return { geo: k.build(), height: 1.8, colliderR: 0 };
}

/** Pistachio-wafer lily pad + a jelly bud, floats on the Chocolate Lake. A
 *  caramel pad was the same value as the lake and read as a biscuit plate lying
 *  on mud; pistachio green reads as a pad against light OR dark chocolate and
 *  carries the understory green out onto the water. ~19 tris. */
export function lilyPadGeo() {
  const k = new Kit();
  k.add(circ(0.82, 7), { m: M({ p: [0, 0.02, 0], r: [-Math.PI / 2, 0, 0] }), color: 0x9ec95f, tint: 0, motion: 1, uv: UV_FLAT });
  k.add(circ(0.52, 6), { m: M({ p: [0.22, 0.07, 0.22], r: [-Math.PI / 2, 0, 0.5] }), color: 0x5f8c33, tint: 0, motion: 1, uv: UV_FLAT });
  k.add(oct(0.24), { m: M({ p: [-0.22, 0.18, -0.14], s: [1, 1.25, 1] }), color: 0xffffff, tint: 1, motion: 1, uv: UV_FLAT });
  return { geo: k.build(), height: 0.4, colliderR: 0 };
}

/** Whipped-cream swirl for the top of Frosting Peak. ~50 tris. */
export function whippedCreamGeo() {
  const k = new Kit();
  const C = { color: 0xfffaf0, tint: 0, motion: sway(0.2, 2.4, 0.5), uv: UV_FLAT };
  k.add(cone(1.0, 0.85, 7), { m: M({ p: [0, 0.42, 0] }), ...C });
  k.add(cone(0.78, 0.8, 7), { m: M({ p: [0.08, 1.02, 0.04], r: [0, 0.7, 0.06] }), ...C });
  k.add(cone(0.55, 0.75, 7), { m: M({ p: [-0.06, 1.55, -0.05], r: [0, 1.4, -0.08] }), ...C });
  k.add(cone(0.3, 0.7, 6), { m: M({ p: [0.04, 2.05, 0.02], r: [0, 2.1, 0.05] }), ...C });
  k.add(oct(0.22), { m: M({ p: [0.02, 2.5, 0], s: [1, 1.1, 1] }), color: 0xffffff, tint: 1, motion: 0.55, uv: UV_FLAT }); // cherry
  return { geo: k.build(), height: 2.7, colliderR: 0 };
}
