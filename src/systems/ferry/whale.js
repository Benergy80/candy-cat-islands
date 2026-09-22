// THE SUGARFIN EXPRESS — a giant, friendly, slightly sleepy narwhal-whale with a
// candy-striped horn and a wooden passenger deck strapped to her back.
//
// Local frame: +Z = forward (nose), +Y = up, +X = the "dock side" (the gangplank
// hangs off +X). Everything is merged into a handful of vertex-coloured meshes so
// the whole ferry stays inside ~20 draw calls.
//
// SHE FLOATS. Three things sell that and they are all here:
//   · the hull's vertex colours change cream → blue AT the waterline, with a
//     wet, darker band just under it and a deep tint below that (what you see
//     through the water is water-coloured, not bright belly);
//   · a foam COLLAR that hugs her real outline, a crescent BOW WAVE at the
//     snout and a widening WAKE ribbon behind the fluke — no stamped ellipses;
//   · the fluke and the pectorals sit at the surface, not above it.
import * as THREE from 'three';
import { Merger, shade, curve } from './geo.js';
import { stripeTex, helixTex, signTex, foamTex, wakeTex, glowTex } from './textures.js';
import { rng, hash, lerp, clamp } from '../../core/util.js';
import { WATER_Y } from './route.js';
import { CANDY } from '../../core/palette.js';

export const BODY = { z0: -11, z1: 13, halfW: 4.2, halfH: 3.4 };
const L = BODY.z1 - BODY.z0;
/** hull-local Y of the sea surface (the group rides at WATER_Y). */
const WL = -WATER_Y;

// radial profile of the body: t=0 tail stock … t=1 nose tip
const PROFILE = [
  [0.00, 0.10], [0.05, 0.22], [0.11, 0.36], [0.19, 0.56], [0.29, 0.77], [0.41, 0.92],
  [0.53, 1.00], [0.63, 1.02], [0.70, 0.99], [0.755, 0.92], [0.805, 0.97], [0.86, 0.94],
  [0.91, 0.80], [0.955, 0.58], [1.00, 0.00],
];
const Rp = (t) => curve(PROFILE, t);
const tOf = (z) => (z - BODY.z0) / L;
/** half-width / half-height of the hull at a station z */
export const hullW = (z) => BODY.halfW * Rp(tOf(z));
export const hullH = (z) => BODY.halfH * Rp(tOf(z));
/** height of the hull surface at station z, |x| out from the spine (for the cradle) */
function hullTop(z, x) {
  const w = hullW(z), h = hullH(z);
  if (w <= 0.01 || Math.abs(x) >= w) return 0;
  return h * Math.sqrt(Math.max(0, 1 - (x / w) * (x / w)));
}
/** point on the hull surface at station z, `ang` measured from +Y (0 = spine, π = belly) */
function surf(z, ang, side = 1, inset = 0) {
  const w = hullW(z) - inset, h = hullH(z) - inset;
  return new THREE.Vector3(Math.sin(ang) * w * side, Math.cos(ang) * h, z);
}

export const COL = {
  skin: 0x7b95e0, skinTop: 0x4a61ab, face: 0x9db0ec, belly: 0xfff0dd, blush: 0xff8fb8,
  wet: 0x3c52a0, sunk: 0x1d3f7a,                       // waterline band / below it
  fin: 0x6b86d6, dark: 0x3a2742, smile: 0x9c5878, tongue: 0xff7da3,
  eyeWhite: 0xfffdf7, eyeRim: 0x37294d, iris: 0x1a1226, lid: 0x6f8ad4,
  wood: 0xc79a63, woodDark: 0xa1734a, woodTrim: 0xe0952f, rope: 0xefd9ab,
  cream: 0xfffaf0, red: 0xff3f5f, gold: 0xf2c14e, navy: 0x24406b, lamp: 0xffd27a,
};

// ── THE FACE ─────────────────────────────────────────────────────────────────
// The grin is a curve painted ACROSS the front of her snout (meeting at x = 0 on
// the centreline) rather than a line swept around the hull from the nose tip:
// her nose tip sits at the waterline, so anything anchored there is eaten by the
// bow foam, which is how the smile ended up a two-pixel scratch.
export const MOUTH = { halfX: 2.78, y0: 0.66, rise: 0.92 };
export const mouthY = (x) => MOUTH.y0 + MOUTH.rise * Math.min(1, (x / MOUTH.halfX) ** 2);

/** Half-beam of the hull at station-parameter t and height y, with the SAME
 *  deformations hullGeometry applies (brow ridge, cheek bulge). 0 where the
 *  cross-section is not tall enough to reach y at all. */
function halfBeam(t, y) {
  const R = Rp(t);
  const brow = 0.42 * Math.exp(-Math.pow((t - 0.885) / 0.05, 2));
  const hy = R * BODY.halfH + (y > 0 ? brow : 0);
  if (hy < 1e-4) return 0;
  const uy = y / hy;
  if (uy >= 1 || uy <= -1) return 0;
  const ux = Math.sqrt(Math.max(0, 1 - uy * uy));
  const cheek = Math.exp(-Math.pow((t - 0.84) / 0.06, 2)) * Math.max(0, 1 - Math.abs(uy + 0.2) * 1.5);
  return ux * R * BODY.halfW + cheek * 0.5;
}
/** z of the hull's front surface at (x, y). BISECTED, not marched: a stepped
 *  answer makes the numeric normal below jitter between neighbouring samples,
 *  which twists anything swept along it into a knotted ribbon — that is how the
 *  grin turned into a gaping brown wound. */
function frontZ(x, y) {
  const ax = Math.abs(x);
  let lo = 0.60, hi = 0.999;                 // halfBeam(lo) > ax > halfBeam(hi)
  if (halfBeam(lo, y) < ax) return BODY.z0 + lo * L;
  for (let i = 0; i < 34; i++) {
    const m = (lo + hi) * 0.5;
    if (halfBeam(m, y) >= ax) lo = m; else hi = m;
  }
  return BODY.z0 + lo * L;
}
/** Outward normal of that front surface (numeric — built once, never per frame). */
function frontNormal(x, y, out) {
  const e = 0.12;
  const zx = (frontZ(x + e, y) - frontZ(x - e, y)) / (2 * e);
  const zy = (frontZ(x, y + e) - frontZ(x, y - e)) / (2 * e);
  return out.set(-zx, -zy, 1).normalize();
}

function ellipsoid(sx, sy, sz, seg = 14) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4));
  g.scale(sx, sy, sz);
  return g;
}
/** A cap off the top of an ellipsoid — an eyelid that HUGS the eyeball instead
 *  of sitting on it like a hat. `theta` = how far down from the pole, radians. */
function cap(sx, sy, sz, theta, seg = 18) {
  const g = new THREE.SphereGeometry(1, seg, 10, 0, Math.PI * 2, 0, theta);
  g.scale(sx, sy, sz);
  return g;
}

// ── hull ─────────────────────────────────────────────────────────────────────
function hullGeometry() {
  const g = new THREE.SphereGeometry(1, 36, 24);
  const p = g.attributes.position;
  const ts = new Float32Array(p.count), uys = new Float32Array(p.count), uxs = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (z + 1) / 2;
    const r = Math.hypot(x, y) || 1e-6;
    const ux = x / r, uy = y / r;
    const R = Rp(t);
    let nx = ux * R * BODY.halfW;
    let ny = uy * R * BODY.halfH;
    // softer, slightly sagging belly
    if (ny < 0) ny *= 0.93 - 0.10 * Math.exp(-Math.pow((t - 0.46) / 0.22, 2));
    // chubby cheeks around the eyes
    const cheek = Math.exp(-Math.pow((t - 0.84) / 0.06, 2)) * Math.max(0, 1 - Math.abs(uy + 0.2) * 1.5);
    nx += Math.sign(ux) * cheek * 0.5;
    // brow ridge — gives her a sleepy, kind face
    ny += Math.exp(-Math.pow((t - 0.885) / 0.05, 2)) * Math.max(0, uy) * 0.42;
    p.setXYZ(i, nx, ny, BODY.z0 + t * L);
    ts[i] = t; uys[i] = uy; uxs[i] = ux;
  }
  g.computeVertexNormals();
  const belly = new THREE.Color(COL.belly), mid = new THREE.Color(COL.skin), top = new THREE.Color(COL.skinTop);
  const face = new THREE.Color(COL.face);
  const blush = new THREE.Color(COL.blush), wet = new THREE.Color(COL.wet), sunk = new THREE.Color(COL.sunk);
  const tmp = new THREE.Color();
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let i = -1;
  shade(g, (x, y, z, out) => {
    i++;
    const uy = uys[i], t = ts[i], ux = uxs[i];
    // ── vertical bands, measured against the SEA, not against her own radius.
    // cream boot-top just above the water, blue above that, wet + deep below.
    const b = sm(0.35, 0.95, uy);                     // flank → spine
    // …but the HEAD stays a light, friendly blue: the dark navy back is what let
    // a dark eye rim melt into the skull and read as a hole in the hull.
    const head = sm(0.70, 0.90, t);
    out.copy(mid).lerp(top, b * 0.92 * (1 - head * 0.72));
    if (head > 0.01) out.lerp(face, head * 0.42 * (1 - b * 0.4));
    const cream = 1 - sm(WL + 0.05, WL + 0.5, y);     // thin cream boot-top at the water
    out.lerp(belly, cream * 0.95);
    // ── THE JAW. Everything under the grin line is a pale cream muzzle, so the
    // dark mouth groove has something to be dark against. This is the other half
    // of the smile: the groove alone is just a line on a blue hull.
    const below = clamp((mouthY(x) - y) / 0.55, 0, 1);
    const jaw = sm(0.83, 0.915, t) * below;            // 1 forward of z ≈ 11
    if (jaw > 0.01) out.lerp(belly, jaw * 0.95);
    // a soft pale mask carries on up the front of the face behind the eyes
    const fz = sm(0.82, 0.95, t) * clamp(1 - (uy + 0.05) * 1.9, 0, 1) * (1 - below);
    if (fz > 0.01) out.lerp(belly, fz * 0.3);
    // rosy cheeks, sat ABOVE the grin and under the eyes (painted under it they
    // just muddy the muzzle)
    const ch = Math.exp(-Math.pow((t - 0.862) / 0.055, 2)) * Math.exp(-Math.pow((uy - 0.34) / 0.28, 2))
      * clamp((Math.abs(ux) - 0.40) / 0.28, 0, 1) * (1 - below);
    if (ch > 0.01) out.lerp(blush, ch * 0.95);
    // ── the water takes her back: a wet band at the line, deep tint below, so
    // what shows through the sea is sea-coloured instead of bright belly.
    const under = 1 - sm(WL - 0.45, WL + 0.05, y);
    if (under > 0.001) out.lerp(wet, under * 0.85);
    const deep = 1 - sm(WL - 2.6, WL - 0.55, y);
    if (deep > 0.001) { tmp.copy(sunk); out.lerp(tmp, deep * 0.9); }
  });
  return g;
}

/** THE SMILE. A fat upturned groove swept across the FRONT of her face, from
 *  cheek to cheek through the centreline, lying proud of the skin so it catches
 *  its own shadow. ~3x the section of the old scratch and — because it is
 *  painted on the face rather than anchored at the nose tip — entirely above the
 *  bow foam. `off` lets a second, paler pass ride just under it as a lower lip.
 *  Returns { geo, corners } so the dimples can be pinned to the real ends. */
function smileTube({ off = 0, thick = 1, lift = 0 } = {}) {
  const N = 52, RING = 7, pos = [], idx = [];
  const P = [], Nrm = [];
  const n = new THREE.Vector3();
  for (let k = 0; k <= N; k++) {
    const s = (k / N) * 2 - 1;
    const x = s * MOUTH.halfX;
    const y = mouthY(x) + lift;
    const z = frontZ(x, y);
    frontNormal(x, y, n);
    P.push(new THREE.Vector3(x, y, z).addScaledVector(n, 0.15 + off));
    Nrm.push(n.clone());
  }
  const T = new THREE.Vector3(), B = new THREE.Vector3(), v = new THREE.Vector3();
  for (let k = 0; k <= N; k++) {
    const a = Math.abs((k / N) * 2 - 1);
    // fat through the middle, tapering to a point at the upturned corners
    const w = (0.34 + 0.66 * Math.sqrt(Math.max(0, 1 - a * a * a))) * thick;
    T.copy(P[Math.min(k + 1, N)]).sub(P[Math.max(k - 1, 0)]).normalize();
    B.crossVectors(T, Nrm[k]).normalize();
    for (let r = 0; r < RING; r++) {
      const th = (r / RING) * Math.PI * 2;
      v.copy(P[k])
        .addScaledVector(Nrm[k], Math.cos(th) * 0.10 * w)
        .addScaledVector(B, Math.sin(th) * 0.17 * w);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let k = 0; k < N; k++) for (let r = 0; r < RING; r++) {
    const A = k * RING + r, b = k * RING + (r + 1) % RING;
    idx.push(A, A + RING, b, b, A + RING, b + RING);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, corners: [P[0].clone(), P[N].clone()] };
}

function buildHull() {
  const m = new Merger();
  m.add(hullGeometry(), null);
  // pectoral fins — at the surface, half in the water
  for (const s of [1, -1]) {
    m.add(ellipsoid(2.5, 0.42, 1.45, 12), COL.fin, { rz: -s * 0.30, ry: -s * 0.42, x: s * 3.0, y: WL - 0.22, z: 3.4 });
  }
  // dorsal ridge bumps (narwhals have a ridge, not a fin)
  for (let k = 0; k < 5; k++) {
    const z = -1.2 - k * 1.5;
    m.add(ellipsoid(0.42, 0.3, 0.75, 8), COL.skin, { x: 0, y: hullH(z) - 0.08, z });
  }
  // THE SMILE — see smileTube(): one fat upturned groove across the face, with a
  // pale lip just under it so the groove has an edge to be dark against.
  const grin = smileTube();
  m.add(grin.geo, COL.smile);
  m.add(smileTube({ off: -0.03, thick: 0.66, lift: -0.24 }).geo, COL.belly);
  // dimples where the grin turns up — a hint of rose, not two pink tongues
  for (const p of grin.corners) {
    m.add(new THREE.SphereGeometry(0.2, 9, 7), COL.blush, { sy: 0.55, sx: 0.6, x: p.x * 0.99, y: p.y + 0.3, z: p.z - 0.1 });
  }
  // blowhole — a soft crease, not a black slot
  m.add(ellipsoid(0.3, 0.14, 0.44, 8), COL.skinTop, { x: 0, y: hullH(9.1) - 0.04, z: 9.1 });
  // candy "barnacles" — clustered gumdrops, all well above the waterline and
  // all AFT of the nameboard: parked on it they spell "SUG◯RF◯N".
  const r = rng(hash('sugarfin-gumdrops'));
  for (const c of [[-7.4, 0.85], [-5.2, 1.05], [-2.1, 1.06], [-9.0, 0.8]]) {
    for (let k = 0; k < 4; k++) {
      const z = c[0] + r.range(-1.3, 1.3);
      const ang = c[1] + r.range(-0.26, 0.26);
      const p = surf(z, Math.abs(ang), k % 2 ? 1 : -1, 0.12);
      const sc = r.range(0.3, 0.52);
      m.add(new THREE.SphereGeometry(sc, 9, 7), r.pick(CANDY.sprinkle), { sy: 0.75, x: p.x, y: p.y, z: p.z });
    }
  }
  const mesh = m.mesh({ roughness: 0.62 });
  mesh.name = 'sugarfin-hull';
  return mesh;
}

// ── face parts ───────────────────────────────────────────────────────────────
// Eye placement is explicit rather than derived: the hull has a brow ridge and a
// cheek bulge on top of the base ellipsoid, so `surf()` alone either buries the
// eyeball (inset too deep) or balloons it off the silhouette (inset too shallow).
// Pikmin-scale: the ball is ~2.3 m across on a 7 m face and bulges proud of the
// skull, with a matte sclera (a glossy one blew out to a shattered white crack),
// a dark OUTLINE that sits INBOARD of the sclera — an outline that is wider than
// the eye is just a black bead when you look at her from the beam — an offset
// pupil, one clean highlight and a soft skin-coloured upper lid.
const EYE = { z: 9.7, x: 2.68, y: 2.05, ex: 1.14, ey: 1.12, ez: 1.05 };
function buildEyes() {
  const m = new Merger();
  const { x, ex, ey, ez } = EYE;
  for (const s of [1, -1]) {
    // outline: taller and deeper than the ball but PUSHED INBOARD and squashed
    // in x, so it shows as a dark rim around the white from every angle and
    // never as a bead in front of it.
    m.add(ellipsoid(ex * 0.70, ey * 1.13, ez * 1.13, 14), COL.eyeRim, { x: s * (x - ex * 0.36), y: 0, z: EYE.z });
    // the sclera — matte, warm white
    m.add(ellipsoid(ex, ey, ez, 18), COL.eyeWhite, { x: s * x, y: 0, z: EYE.z });
    // PUPIL: a lens lying ON the ball (a ball-on-a-ball hangs off the edge and
    // reads as a bean stuck to her cheek). Aimed outboard-and-forward and kept
    // well inside the silhouette of the white.
    // (the lens has to sit at ~0.88 of the ball's radius: any closer in and the
    // whole pupil is swallowed INSIDE the white and she stares like a boiled egg)
    m.add(ellipsoid(0.62, 0.66, 0.18, 16), COL.iris, {
      rx: 0.10, ry: s * 0.64,
      x: s * (x + ex * 0.52), y: -ey * 0.12, z: EYE.z + ez * 0.70,
    });
    // soft upper lid — two CAPS off the top of the same ball, so the lid hugs
    // the eye instead of perching on it like a bowler hat. The wider, darker
    // cap underneath peeks out below the lid as a lash line; both are tipped
    // down toward the outer corner.
    m.add(cap(ex * 1.04, ey * 1.04, ez * 1.04, 0.78), COL.eyeRim, { rz: -s * 0.22, x: s * x, y: 0, z: EYE.z });
    m.add(cap(ex * 1.075, ey * 1.075, ez * 1.075, 0.62), COL.lid, { rz: -s * 0.22, x: s * x, y: 0, z: EYE.z });
  }
  // A hair of emissive: her face is often turned away from the sun and a sclera
  // that goes beige in shade is a bead again.
  const mesh = m.mesh({ roughness: 0.72, metalness: 0, emissive: 0xfff0e0, emissiveIntensity: 0.08 });
  mesh.position.set(0, EYE.y, 0);   // blink = scale.y about the eye line
  mesh.name = 'sugarfin-eyes';
  return mesh;
}
/** ONE tiny emissive catchlight per eye — a separate mesh because the sclera has
 *  to stay matte (this is the only shiny thing on her face). Parented to the
 *  eyes, so it blinks with them. */
function buildEyeSpark() {
  const m = new Merger();
  const { x, ex, ey, ez } = EYE;
  for (const s of [1, -1]) {
    m.add(new THREE.SphereGeometry(0.19, 10, 8), 0xffffff, {
      x: s * (x + ex * 0.34), y: ey * 0.26, z: EYE.z + ez * 0.84,
    });
  }
  const mesh = new THREE.Mesh(m.geometry(), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.35, metalness: 0,
    emissive: 0xffffff, emissiveIntensity: 0.55,
  }));
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.name = 'sugarfin-catchlight';
  return mesh;
}
function buildEyelids() {
  // heavy sleepy lids — the same shape as the eye, a shade darker than her face
  const m = new Merger();
  for (const s of [1, -1]) {
    m.add(ellipsoid(EYE.ex * 1.1, EYE.ey * 1.0, EYE.ez * 1.1, 16), COL.lid, { x: s * EYE.x, y: 0, z: EYE.z });
  }
  const mesh = m.mesh({ roughness: 0.6 });
  mesh.position.set(0, EYE.y, 0);
  mesh.visible = false;         // only shown when she blinks or sleeps
  return mesh;
}
function buildMouth() {
  // only ever seen mid-yawn; sits on the grin line
  const m = new Merger();
  m.add(ellipsoid(1.7, 0.70, 0.95, 14), 0x4d2a44, { y: -0.5 });
  m.add(ellipsoid(1.1, 0.40, 0.66, 10), COL.tongue, { y: -0.74, z: 0.2 });
  const mesh = m.mesh({ roughness: 0.5 });
  mesh.position.set(0, MOUTH.y0 + 0.20, frontZ(0, MOUTH.y0) - 0.35);
  mesh.rotation.x = -0.3;
  mesh.visible = false;
  return mesh;
}
function buildHorn() {
  // A narwhal's tusk grows out of her FACE, nearly level with the water — not
  // out of her forehead like a unicorn.
  const tex = helixTex({ a: '#fff7ec', b: '#ff3f5f', c2: '#ffd23a', repeat: [1, 3] });
  const len = 7.2;
  const g = new THREE.ConeGeometry(0.68, len, 14, 6, false);
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0, roughness: 0.35, metalness: 0.04 });
  const mesh = new THREE.Mesh(g, mat);
  // NOT a shadow caster: a 7-unit lance hanging over her own snout throws a
  // hard brown bar straight across the grin and the cheeks, and a face you
  // cannot read is worse than a horn without a shadow.
  mesh.castShadow = false; mesh.receiveShadow = true;
  const base = new THREE.Vector3(0, 1.12, 11.6);
  const rx = 1.44;                                  // ~82° from vertical: near level
  mesh.rotation.x = rx;
  const dir = new THREE.Vector3(0, Math.cos(rx), Math.sin(rx));
  mesh.position.copy(base).add(dir.clone().multiplyScalar(len * 0.5));
  mesh.userData.tip = base.clone().add(dir.clone().multiplyScalar(len));
  mesh.name = 'sugarfin-horn';
  return mesh;
}

/** ONE solid fluke plate (top and bottom of the same surface) — no seam to see
 *  through, tips closed by a thickness that falls to zero. */
function flukeGeometry() {
  const NS = 15, NA = 10;
  const pos = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const u = (i / NS) * 2 - 1, a = Math.abs(u);
    const xs = u * 4.5;
    const zLe = -0.15 - 1.15 * a * a;                 // swept-back leading edge
    const zTe = -2.15 + 1.55 * a * a;                 // notched trailing edge
    const y0 = 0.05 + 0.42 * a * a;                   // tips lifted a touch
    // a real slab, not a sheet: 0.62 thick at the root (it read as a detached
    // piece of paper lying on the water at 0.36)
    const th = (0.62 - 0.50 * a * a) * (1 - a * a * a * a);
    for (let k = 0; k < NA; k++) {
      const phi = (k / NA) * Math.PI * 2;
      const t = (1 - Math.cos(phi)) / 2;
      pos.push(xs, y0 + Math.sin(phi) * th, lerp(zLe, zTe, t));
    }
  }
  for (let i = 0; i < NS; i++) for (let k = 0; k < NA; k++) {
    const a = i * NA + k, b = i * NA + (k + 1) % NA, c = a + NA, d = b + NA;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildTail() {
  const m = new Merger();
  // ── THE PEDUNCLE. The foam collar stops around z = -10.5, so the join used to
  // happen underneath it and the fluke read as a flat sheet floating free. The
  // stock now tapers OUT past the collar in three visible steps before the
  // fluke starts, with a keel ridge along the top to catch the light.
  m.add(ellipsoid(1.05, 1.15, 2.3, 14), COL.skin, { x: 0, y: 0.0, z: 1.0 });
  m.add(ellipsoid(0.88, 0.92, 1.5, 12), COL.skin, { x: 0, y: 0.06, z: -0.7 });
  m.add(ellipsoid(0.64, 0.68, 1.05, 10), COL.fin, { x: 0, y: 0.16, z: -1.8 });
  // a keel ridge along the top of the stock, so the join catches the light
  for (let k = 0; k < 4; k++) {
    m.add(ellipsoid(0.15, 0.22, 0.4, 8), COL.skinTop, { x: 0, y: 0.66 - k * 0.09, z: -0.3 - k * 0.6 });
  }
  m.add(flukeGeometry(), COL.fin, { rx: -0.10, z: -2.6, y: 0.42 });
  const mesh = m.mesh({ roughness: 0.62 });
  // high enough that the whole slab breaks the surface: at the waterline the sea
  // ate the lower half and what was left read as one flat leaf
  mesh.position.set(0, WL + 0.22, -9.4);
  mesh.name = 'sugarfin-tail';
  return mesh;
}

// ── deck, canopy, gangplank, bell, lanterns ──────────────────────────────────
// Her deck sits high enough on her back that the gangplank meets the piers: the
// Arrivals Pier deck is 4.06 and Sugar Pier 5.16, so 4.02 here gives a level
// plank on one side and a gentle 13° ramp on the other.
const DECK = { y: 3.2, z: -1.1, halfX: 2.95, aft: -4.9, fore: 6.4, top: 0.3 };
export const DECK_LOCAL = { x: 0, y: DECK.y, z: DECK.z };
export const RAMP_LEN = 3.9;

// Lantern rig (deck space). The canopy arch is 3.12 half-wide, so the lamps hang
// at 3.62 — outboard of it, over the water — where the glow is actually visible
// from off the boat. [side, z]; side +1 is the gangway side.
const LAMP_ARMS = [[1, -4.4], [-1, 1.7]];
const LAMP_X = 3.62;
const LAMP_Y = DECK.top + 2.09;

function buildDeck() {
  const m = new Merger();
  const { halfX, aft, fore, top } = DECK;
  // planks (alternating tone), running athwartships
  const n = 22, pd = (fore - aft) / n;
  for (let i = 0; i < n; i++) {
    const z = aft + pd * (i + 0.5);
    m.add(new THREE.BoxGeometry(halfX * 2, top, pd * 1.04), i % 2 ? COL.wood : COL.woodDark, { y: top / 2, z });
  }
  // ── the cradle: she is *strapped on*, so the carpentry has to reach her back.
  // Ribs are cut to the hull at |x| = 2.45, which is what keeps the deck from
  // looking like it hovers now that it rides high enough to meet the piers.
  for (const dz of [-4.3, -2.0, 0.4, 2.8, 5.2]) {
    const hz = dz + DECK.z;
    const rx = Math.min(2.45, hullW(hz) * 0.74);       // where the post meets her
    const hy = Math.min(-0.2, hullTop(hz, rx) - DECK.y);   // deck-space y of the hull
    for (const s of [1, -1]) {
      m.add(new THREE.BoxGeometry(0.34, -hy, 0.44), COL.woodDark, { x: s * rx, y: hy / 2, z: dz });
      m.add(new THREE.BoxGeometry(halfX - rx + 0.34, 0.24, 0.32), COL.wood, { x: s * ((rx + halfX) / 2), y: -0.18, z: dz });
      m.add(new THREE.BoxGeometry(0.95, 0.2, 0.26), COL.woodDark, { rz: -s * 0.72, x: s * (rx + 0.5), y: -0.62, z: dz });
      m.add(new THREE.BoxGeometry(0.5, 0.22, 0.6), COL.woodTrim, { x: s * rx, y: hy + 0.12, z: dz });   // chock on her skin
    }
  }
  for (const s of [1, -1]) m.add(new THREE.BoxGeometry(0.26, 0.5, fore - aft - 0.4), COL.woodDark, { x: s * 2.45, y: -0.4, z: (aft + fore) / 2 });
  // ── THE SADDLE ──
  // A striped blanket skirt from the deck's underside down to her actual skin,
  // all the way round. Without it the deck reads as a pier on stilts standing
  // over a whale instead of a howdah strapped to one — the deck has to ride
  // high enough to meet the piers, and this is what makes that honest.
  {
    const rim = [];
    const NZ = 16, NE = 4;
    for (let k = 0; k <= NZ; k++) rim.push([halfX, aft + (fore - aft) * k / NZ]);
    for (let k = 1; k <= NE; k++) rim.push([halfX - 2 * halfX * k / NE, fore]);
    for (let k = 1; k <= NZ; k++) rim.push([-halfX, fore - (fore - aft) * k / NZ]);
    for (let k = 1; k < NE; k++) rim.push([-halfX + 2 * halfX * k / NE, aft]);
    // the bottom edge is pulled INWARD as well as down, so the skirt reads as a
    // padded saddle tucked under the deck and not as a striped wall around her
    const IN = 0.76;
    const foot = (p) => {
      const x = p[0] * IN, z = p[1] * (Math.abs(p[0]) > halfX - 0.01 ? 1 : IN);
      return [x, Math.min(-0.06, hullTop(z + DECK.z, x) - DECK.y + 0.06), z];
    };
    for (let i = 0; i < rim.length; i++) {
      const a = rim[i], b = rim[(i + 1) % rim.length];
      const fa = foot(a), fb = foot(b);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([
        a[0], -0.04, a[1], b[0], -0.04, b[1], fa[0], fa[1], fa[2],
        b[0], -0.04, b[1], fb[0], fb[1], fb[2], fa[0], fa[1], fa[2],
      ], 3));
      g.computeVertexNormals();
      m.add(g, i % 2 ? COL.rope : COL.woodTrim);
    }
  }
  // ── rope straps around the whole whale ──
  // The tube radius has to be scaled back up on Z as well, or the "rope" is a
  // 0.08-thick ribbon that goes edge-on and reads as a black wire hanging off
  // the deck into nowhere. Buckles fore and aft so it terminates in something.
  for (const z of [5.0, -3.4]) {
    const w = hullW(z) + 0.12, h = hullH(z) + 0.12;
    const mx = Math.max(w, h);
    const g = new THREE.TorusGeometry(1, 0.19 / mx, 8, 34);
    m.add(g, COL.rope, { sx: w, sy: h, sz: mx, y: -DECK.y, z: z - DECK.z });
    m.add(new THREE.BoxGeometry(0.7, 0.4, 0.34), COL.woodTrim, { y: top + 0.1, z: z - DECK.z });
    const th = 1.12;                                   // buckle angle off the spine
    for (const s of [1, -1]) {
      m.add(new THREE.BoxGeometry(0.34, 0.54, 0.54), COL.gold, {
        x: s * Math.sin(th) * w, y: Math.cos(th) * h - DECK.y, z: z - DECK.z,
      });
    }
  }
  // railings (gap on the +X side for the gangway gate)
  const posts = [];
  for (let z = aft; z <= fore - 0.4; z += 1.45) posts.push(z);
  // Both sides carry a gangway opening with gate posts: she berths bow-north at
  // both piers, so the plank swings out to port at one and to starboard at the
  // other (see DOCKS[].gang in route.js).
  for (const s of [1, -1]) {
    for (const z of posts) {
      if (z > -0.9 && z < 2.2) continue;
      m.add(new THREE.BoxGeometry(0.17, 0.85, 0.17), COL.woodDark, { x: s * (halfX - 0.16), y: top + 0.42, z });
    }
    m.add(new THREE.BoxGeometry(0.15, 0.16, 4.3), COL.woodTrim, { x: s * (halfX - 0.16), y: top + 0.82, z: -3.05 });
    m.add(new THREE.BoxGeometry(0.15, 0.16, 4.0), COL.woodTrim, { x: s * (halfX - 0.16), y: top + 0.82, z: 4.3 });
    // gate posts, so the opening reads as a gate and not a missing rail
    for (const z of [-0.9, 2.2]) m.add(new THREE.BoxGeometry(0.24, 1.15, 0.24), COL.woodTrim, { x: s * (halfX - 0.16), y: top + 0.57, z });
  }
  m.add(new THREE.BoxGeometry(halfX * 2 - 0.3, 0.16, 0.15), COL.woodTrim, { y: top + 0.82, z: aft + 0.1 });
  for (const x of [-2.3, 0, 2.3]) m.add(new THREE.BoxGeometry(0.17, 0.85, 0.17), COL.woodDark, { x, y: top + 0.42, z: aft + 0.1 });

  // ── tiny captain's cabin (aft of the wheel, so he is never inside it) ──
  const cz = 3.3;
  m.add(new THREE.BoxGeometry(3.2, 2.0, 2.2), COL.cream, { y: top + 1.0, z: cz });
  m.add(new THREE.BoxGeometry(3.6, 0.3, 2.6), COL.woodTrim, { y: top + 2.05, z: cz });
  // gabled roof
  for (const s of [1, -1]) m.add(new THREE.BoxGeometry(2.1, 0.22, 2.7), COL.red, { rz: s * 0.55, x: s * 0.86, y: top + 2.55, z: cz });
  m.add(ellipsoid(0.3, 0.3, 0.3, 8), COL.gold, { y: top + 3.05, z: cz });
  // chimney + portholes
  m.add(new THREE.CylinderGeometry(0.22, 0.26, 0.8, 10), COL.woodDark, { x: -1.0, y: top + 3.0, z: cz - 0.6 });
  for (const s of [1, -1]) {
    m.add(new THREE.TorusGeometry(0.42, 0.09, 6, 14), COL.gold, { rx: 0, ry: Math.PI / 2, x: s * 1.63, y: top + 1.15, z: cz });
    m.add(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 12), 0x9fd8f0, { rz: Math.PI / 2, x: s * 1.61, y: top + 1.15, z: cz });
  }
  // door + ticket hatch on the forward face, facing the wheel
  m.add(new THREE.BoxGeometry(0.9, 1.5, 0.1), COL.woodDark, { y: top + 0.75, z: cz + 1.12 });
  m.add(new THREE.BoxGeometry(0.12, 0.12, 0.12), COL.gold, { x: 0.3, y: top + 0.8, z: cz + 1.2 });

  // ── ship's wheel (out on the open fore deck, where the captain shows) ──
  m.add(new THREE.CylinderGeometry(0.18, 0.22, 1.0, 8), COL.woodDark, { x: 0.0, y: top + 0.5, z: 5.9 });
  m.add(new THREE.TorusGeometry(0.6, 0.1, 6, 18), COL.woodTrim, { x: 0.0, y: top + 1.35, z: 5.95 });
  for (let k = 0; k < 8; k++) m.add(new THREE.BoxGeometry(0.1, 1.3, 0.1), COL.woodDark, { rz: k * Math.PI / 8, x: 0.0, y: top + 1.35, z: 5.95 });
  m.add(ellipsoid(0.17, 0.17, 0.17, 8), COL.gold, { x: 0.0, y: top + 1.35, z: 5.95 });

  // ── canopy posts + crossbeams ──
  for (const s of [1, -1]) for (const z of [-4.5, 1.8]) {
    m.add(new THREE.BoxGeometry(0.22, 2.3, 0.22), COL.woodDark, { x: s * 2.62, y: top + 1.15, z });
  }
  for (const z of [-4.5, 1.8]) m.add(new THREE.BoxGeometry(5.45, 0.2, 0.2), COL.woodDark, { y: top + 2.3, z });
  m.add(new THREE.BoxGeometry(0.2, 0.2, 6.5), COL.woodDark, { y: top + 2.3, z: -1.35 });
  // ── lantern goosenecks ──
  for (const [side, lz] of LAMP_ARMS) {
    const x0 = side * 2.62, x1 = side * LAMP_X;
    m.add(new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.26, 0.14, 0.14), COL.woodDark, { x: (x0 + x1) / 2, y: top + 2.34, z: lz });
    m.add(new THREE.BoxGeometry(0.62, 0.12, 0.12), COL.woodDark, { rz: side * 0.78, x: x0 + side * 0.22, y: top + 2.12, z: lz });
    m.add(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 6), COL.woodDark, { x: x1, y: top + 2.22, z: lz });
    m.add(new THREE.TorusGeometry(0.1, 0.035, 5, 10), COL.gold, { rx: Math.PI / 2, x: x1, y: LAMP_Y, z: lz });
  }
  // pom-pom fringe under the canopy edges
  const pr = rng(hash('sugarfin-poms'));
  for (const s of [1, -1]) for (let z = -4.9; z <= 2.3; z += 0.72) {
    m.add(new THREE.SphereGeometry(0.17, 7, 5), pr.pick([CANDY.gummyYellow, CANDY.gummyBlue, CANDY.gummyGreen, CANDY.gummyPurple]), { x: s * 3.16, y: top + 2.18, z });
  }

  // ── aft clutter: deckchair, barrels, crate, life ring, bell gantry ──
  const chX = -1.9, chZ = -3.9;
  m.add(new THREE.BoxGeometry(1.15, 0.12, 1.0), CANDY.gummyBlue, { rx: 0.12, x: chX, y: top + 0.42, z: chZ });
  m.add(new THREE.BoxGeometry(1.15, 0.12, 1.15), CANDY.cream, { rx: -0.95, x: chX, y: top + 0.82, z: chZ - 0.62 });
  for (const s of [1, -1]) {
    m.add(new THREE.BoxGeometry(0.1, 0.55, 0.1), COL.woodDark, { rx: 0.3, x: chX + s * 0.52, y: top + 0.24, z: chZ + 0.3 });
    m.add(new THREE.BoxGeometry(0.1, 0.6, 0.1), COL.woodDark, { rx: -0.3, x: chX + s * 0.52, y: top + 0.26, z: chZ - 0.35 });
  }
  m.add(new THREE.CylinderGeometry(0.45, 0.45, 0.95, 12), COL.woodDark, { x: 1.85, y: top + 0.47, z: -4.0 });
  m.add(new THREE.TorusGeometry(0.46, 0.07, 5, 12), COL.woodTrim, { rx: Math.PI / 2, x: 1.85, y: top + 0.75, z: -4.0 });
  m.add(new THREE.BoxGeometry(0.95, 0.8, 0.95), COL.wood, { ry: 0.3, x: 1.95, y: top + 0.4, z: -2.6 });
  m.add(new THREE.BoxGeometry(1.0, 0.1, 0.2), COL.woodTrim, { ry: 0.3, x: 1.95, y: top + 0.82, z: -2.6 });
  // life ring on the rail
  m.add(new THREE.TorusGeometry(0.46, 0.14, 7, 16), COL.cream, { ry: Math.PI / 2, x: -3.0, y: top + 0.95, z: 2.6 });
  for (let k = 0; k < 4; k++) m.add(new THREE.TorusGeometry(0.46, 0.15, 5, 5, 0.5), COL.red, { rz: k * Math.PI / 2 + 0.3, ry: Math.PI / 2, x: -3.02, y: top + 0.95, z: 2.6 });
  // bell gantry — an A-frame you can read from off the boat
  for (const s of [1, -1]) m.add(new THREE.BoxGeometry(0.2, 2.3, 0.2), COL.woodDark, { rx: s * 0.16, x: -2.3, y: top + 1.15, z: -1.2 + s * 0.34 });
  m.add(new THREE.BoxGeometry(0.24, 0.22, 1.5), COL.woodTrim, { x: -2.3, y: top + 2.28, z: -1.2 });
  // deck cleats for the mooring lines
  for (const s of [1, -1]) for (const z of [-3.2, 3.2]) {
    m.add(new THREE.CylinderGeometry(0.13, 0.15, 0.44, 8), COL.woodDark, { x: s * 2.5, y: top + 0.22, z });
    m.add(new THREE.BoxGeometry(0.7, 0.14, 0.16), COL.gold, { x: s * 2.5, y: top + 0.44, z });
  }

  // DoubleSide so the saddle skirt shows whichever way its strips wound up.
  // The small emissive is bounce light: under the awning there is no sun, and a
  // deck that reads as a black hole is worse than a deck that reads as warm.
  const mesh = m.mesh({
    roughness: 0.78, flatShading: true, side: THREE.DoubleSide,
    emissive: 0xffd9ac, emissiveIntensity: 0.13,
  });
  mesh.position.set(DECK_LOCAL.x, DECK_LOCAL.y, DECK_LOCAL.z);
  mesh.name = 'sugarfin-deck';
  return mesh;
}

/** THE STOWAWAY. A cat who lives in the aft crate and surfaces mid-strait to
 *  see how the trip is going. Lid + cat in one mesh; the whole thing rises. */
function buildStowaway() {
  const m = new Merger();
  const fur = 0xf3a24a, dark = 0x2b2140, pink = 0xff9ec4;
  // the crate lid, carried up on its head
  m.add(new THREE.BoxGeometry(1.02, 0.1, 1.02), COL.wood, { ry: 0.3, y: 0.72 });
  m.add(new THREE.BoxGeometry(1.06, 0.06, 0.2), COL.woodTrim, { ry: 0.3, y: 0.78 });
  m.add(ellipsoid(0.3, 0.3, 0.29, 12), fur, { y: 0.34 });                       // head
  for (const s of [1, -1]) {
    m.add(new THREE.ConeGeometry(0.13, 0.24, 4), fur, { ry: 0.78, x: s * 0.19, y: 0.6, z: -0.02 });
    m.add(new THREE.SphereGeometry(0.055, 8, 6), dark, { x: s * 0.13, y: 0.38, z: 0.25 });   // eye
    m.add(new THREE.SphereGeometry(0.028, 6, 5), 0xffffff, { x: s * 0.15, y: 0.40, z: 0.28 });
    for (let k = 0; k < 2; k++) m.add(new THREE.BoxGeometry(0.26, 0.018, 0.018), 0xfff7ec, { rz: -s * (0.08 + k * 0.2), x: s * 0.26, y: 0.28 - k * 0.04, z: 0.24 });
    m.add(ellipsoid(0.11, 0.09, 0.07, 8), fur, { x: s * 0.2, y: 0.14, z: 0.2 });             // paw on the rim
  }
  m.add(new THREE.SphereGeometry(0.05, 8, 6), pink, { y: 0.3, z: 0.3 });                     // nose
  const mesh = m.mesh({ roughness: 0.8, flatShading: true });
  mesh.visible = false;
  mesh.name = 'sugarfin-stowaway';
  return mesh;
}

/** The gangway gate: swings inboard when the plank goes down. */
function buildGate() {
  const m = new Merger();
  m.add(new THREE.BoxGeometry(0.16, 0.14, 2.9), COL.woodTrim, { y: 0.4, z: 1.45 });
  m.add(new THREE.BoxGeometry(0.16, 0.14, 2.9), COL.woodTrim, { y: -0.1, z: 1.45 });
  for (const z of [0.15, 1.45, 2.75]) m.add(new THREE.BoxGeometry(0.16, 0.7, 0.16), COL.woodDark, { y: 0.15, z });
  m.add(new THREE.SphereGeometry(0.13, 8, 6), COL.gold, { y: 0.55, z: 2.75 });
  const mesh = m.mesh({ roughness: 0.8, flatShading: true });
  mesh.name = 'sugarfin-gate';
  return mesh;
}

function buildCanopy() {
  const g = new THREE.CylinderGeometry(1, 1, 1, 22, 1, true, -Math.PI / 2, Math.PI);
  g.scale(3.12, 7.0, 1.02);
  g.rotateX(-Math.PI / 2);
  const tex = stripeTex({ a: '#fff7ec', b: '#ff3f5f', n: 6, axis: 'y', repeat: [1, 3] });
  // NOT a shadow caster, on purpose, and twice over: it was throwing a 40-unit
  // striped bar across the open sea astern of her (which read as a brown wake
  // decal), and it was crushing everything under the canopy — deck, captain,
  // cargo — to black. The emissive is the bounce light a cream awning gives
  // back to the deck under it.
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.85, side: THREE.DoubleSide,
    emissive: 0xffe6c4, emissiveIntensity: 0.22,
  }));
  mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.position.set(0, DECK.y + DECK.top + 2.28, DECK.z - 1.35);
  mesh.name = 'sugarfin-canopy';
  return mesh;
}

function buildSign(text) {
  // her name painted on both flanks — the quads are projected onto the hull so
  // nothing floats off the curve. Big enough to read at the game camera.
  const tex = signTex(text);
  const nz = 12, ny = 2, zc = 4.6, hz = 3.1, yc = 1.55, hy = 0.82;
  const pos = [], nrm = [], uv = [], idx = [];
  let vi = 0;
  for (const s of [1, -1]) {
    const base = vi;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nz; i++) {
      const z = zc - hz + 2 * hz * (i / nz);
      const y = yc + hy - 2 * hy * (j / ny);
      const hw = hullW(z), hh = hullH(z);
      const k = Math.sqrt(Math.max(0.05, 1 - (y / hh) * (y / hh)));
      pos.push(s * (hw * k + 0.06), y, z);
      nrm.push(s * 0.98, 0.2, 0);
      uv.push(s > 0 ? 1 - i / nz : i / nz, 1 - j / ny);
      vi++;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nz; i++) {
      const a = base + j * (nz + 1) + i, b = a + 1, c = a + nz + 1, d = c + 1;
      if (s > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }));
  mesh.name = 'sugarfin-sign';
  return mesh;
}

/** THE GANGWAY. Cream-and-red plank (the same brown as the deck made it read as
 *  a loose board), candy-cane railings on both sides, a lantern-post at the
 *  shore end and a kerb at the foot. Nothing about it should look optional. */
function buildRamp() {
  const m = new Merger();
  const len = RAMP_LEN, halfZ = 0.95;
  // treads, cream / red, with a dark nosing so each step reads at distance
  for (let i = 0; i < 8; i++) {
    const x = 0.22 + i * (len / 8);
    m.add(new THREE.BoxGeometry(len / 8 * 0.9, 0.22, halfZ * 2), i % 2 ? COL.cream : 0xffd9dc, { x, y: 0 });
    m.add(new THREE.BoxGeometry(0.07, 0.1, halfZ * 2), COL.red, { x: x + len / 16, y: 0.1 });
  }
  for (const s of [1, -1]) {
    // stringer
    m.add(new THREE.BoxGeometry(len + 0.5, 0.26, 0.2), COL.red, { x: 0.2 + len / 2, y: 0.1, z: s * halfZ });
    // ── candy-cane posts: stacked red/white bands, no texture needed ──
    for (let i = 0; i < 4; i++) {
      const px = 0.55 + i * 1.02;
      for (let k = 0; k < 6; k++) {
        m.add(new THREE.CylinderGeometry(0.115, 0.115, 0.15, 8), k % 2 ? COL.red : COL.cream,
          { x: px, y: 0.20 + k * 0.15, z: s * halfZ });
      }
      m.add(new THREE.SphereGeometry(0.14, 9, 7), COL.gold, { x: px, y: 1.12, z: s * halfZ });
    }
    // ── the handrail, also candy-striped, running the whole length ──
    const nb = 13;
    for (let k = 0; k < nb; k++) {
      m.add(new THREE.CylinderGeometry(0.1, 0.1, (len + 0.3) / nb, 8), k % 2 ? COL.red : COL.cream,
        { rz: Math.PI / 2, x: 0.3 + (k + 0.5) * (len + 0.3) / nb, y: 1.0, z: s * halfZ });
    }
  }
  // foot plate — lands ON the pier and overlaps it, so the plank never reads
  // as stopping in mid-air; cream with a red kerb across the very end
  m.add(new THREE.BoxGeometry(1.35, 0.22, halfZ * 2 + 0.34), COL.cream, { x: len + 0.42, y: -0.03 });
  m.add(new THREE.BoxGeometry(0.22, 0.14, halfZ * 2 + 0.34), COL.red, { x: len + 1.02, y: 0.06 });
  const mesh = m.mesh({ roughness: 0.78, flatShading: true });
  mesh.userData.len = len + 0.75;
  mesh.name = 'sugarfin-gangway';
  return mesh;
}

/** The BOARD HERE flag at the shore end of the plank — a painted board on a
 *  candy-cane staff with a pennant. Its own mesh only because it needs the sign
 *  texture; it is hidden whenever the plank is stowed, so it costs nothing at
 *  sea. */
function buildBoardFlag() {
  const group = new THREE.Group();
  const staff = new Merger();
  for (let k = 0; k < 12; k++) {
    staff.add(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 8), k % 2 ? COL.red : COL.cream, { y: 0.09 + k * 0.18 });
  }
  staff.add(new THREE.ConeGeometry(0.16, 0.3, 10), COL.gold, { y: 2.3 });
  // pennant
  for (let k = 0; k < 3; k++) {
    staff.add(new THREE.BoxGeometry(0.05, 0.22, 0.42 - k * 0.1), k % 2 ? COL.cream : COL.red,
      { x: 0.02, y: 2.0 - k * 0.22, z: 0.3 + k * 0.06 });
  }
  const staffMesh = staff.mesh({ roughness: 0.75, flatShading: true });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.52, 1.85),
    new THREE.MeshStandardMaterial({ map: signTex('BOARD HERE', { bg: '#ff3f5f', ink: '#fffaf0', trim: '#ffd23a' }), roughness: 0.7 }),
  );
  board.position.set(0.06, 1.5, 0);
  staffMesh.name = 'sugarfin-flagstaff'; board.name = 'sugarfin-flagboard';
  staffMesh.castShadow = true; board.castShadow = true;
  group.add(staffMesh, board);
  group.name = 'sugarfin-boardflag';
  return { group, board };
}

function buildBell() {
  const m = new Merger();
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.07 + Math.pow(t, 0.7) * 0.52, 0.9 - t * 0.9)); }
  m.add(new THREE.LatheGeometry(pts, 16), COL.gold, {});
  m.add(new THREE.TorusGeometry(0.13, 0.05, 6, 12), COL.gold, { rx: Math.PI / 2, y: 1.0 });
  m.add(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), 0x6b4a2a, { y: 0.1 });
  m.add(new THREE.SphereGeometry(0.15, 9, 7), 0x6b4a2a, { y: -0.16 });
  m.add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), COL.rope, { y: -0.5 });
  const mesh = m.mesh({ roughness: 0.3, metalness: 0.5 });
  mesh.name = 'sugarfin-bell';
  return mesh;
}

/** A paper lantern that hangs BELOW its pivot (0,0,0 = the hook): a proper
 *  cage with ribs, a glass belly and a warm core — ONE mesh, so the whole
 *  lantern (brass and all) warms up together at dusk. Two lanterns therefore
 *  cost two draw calls instead of four. */
function buildLantern() {
  const m = new Merger();
  // top cap + base
  m.add(new THREE.ConeGeometry(0.34, 0.24, 10), COL.gold, { y: -0.16 });
  m.add(new THREE.CylinderGeometry(0.1, 0.16, 0.12, 10), COL.gold, { y: -0.02 });
  m.add(new THREE.CylinderGeometry(0.28, 0.24, 0.12, 10), COL.gold, { y: -0.92 });
  m.add(new THREE.ConeGeometry(0.12, 0.2, 8), COL.red, { rx: Math.PI, y: -1.08 });
  // four corner ribs
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    m.add(new THREE.BoxGeometry(0.06, 0.68, 0.06), COL.gold, { x: Math.sin(a) * 0.26, y: -0.56, z: Math.cos(a) * 0.26 });
  }
  // the glass: a fat little barrel that glows
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.12 + Math.sin(t * Math.PI) * 0.31, -0.16 - t * 0.72)); }
  m.add(new THREE.LatheGeometry(pts, 14), COL.lamp, {});
  const mesh = new THREE.Mesh(m.geometry(), new THREE.MeshStandardMaterial({
    vertexColors: true, emissive: new THREE.Color(0xffb14e), emissiveIntensity: 0.06, roughness: 0.4, metalness: 0.25,
  }));
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.name = 'sugarfin-lantern';
  return mesh;
}

/** Three fat "Z"s for the sleeping whale — one InstancedMesh, one draw call. */
function buildZzz() {
  const m = new Merger();
  const bar = (w, o) => m.add(new THREE.BoxGeometry(w, 0.17, 0.17), 0xfffdf4, o);
  bar(0.64, { y: 0.32 });
  bar(0.82, { rz: 0.74 });
  bar(0.64, { y: -0.32 });
  const mesh = new THREE.InstancedMesh(m.geometry(), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.42, emissive: 0xfff3d8, emissiveIntensity: 0.35,
    transparent: true, opacity: 0.94, depthWrite: false,
  }), 3);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.visible = false;
  return mesh;
}

/** Waterline collar. It hugs her real outline; the foam texture SCROLLS around
 *  it (see ferry.js) so the collar is water moving past a whale and not a
 *  sculpted sock with a serrated edge welded to her waist. */
function buildFoam() {
  const rw = (z) => {
    const h = hullH(z);
    if (h <= Math.abs(WL) + 0.25) return 0;
    return hullW(z) * Math.sqrt(Math.max(0, 1 - (WL / h) * (WL / h)));
  };
  const zs = [];
  for (let z = BODY.z0; z <= BODY.z1; z += 0.45) if (rw(z) > 0.4) zs.push(z);
  const outline = [];
  for (const z of zs) outline.push([rw(z), z]);
  for (let i = zs.length - 1; i >= 0; i--) outline.push([-rw(zs[i]), zs[i]]);
  const n = outline.length;
  // [outward, y, v] — a lip tucked under the hull, a crest that stands UP the
  // hull, then a short skirt. The crest has to clear the sea's own swell: the
  // water shader lifts deep water by up to ~0.8, and a collar lying flat at y=0
  // simply vanishes behind the waves in mid-strait (it only ever looked right
  // inshore, where the waves are damped).
  // The outer skirt used to reach a full unit out all the way round, which read
  // as a stamped white ripple-ring with a rim rather than foam at her waterline.
  const RINGS = [[-0.28, -0.5, 0.0], [0.02, 0.38, 0.30], [0.40, 0.2, 0.66], [0.72, -0.03, 1.0]];
  const pos = [], uv = [], nrm = [], col = [], idx = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = outline[i];
    const a = outline[(i - 1 + n) % n], b = outline[(i + 1) % n];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    let nx = tz, nz = -tx;
    if (nx * x < 0) { nx = -nx; nz = -nz; }             // point away from the spine
    // strongest where she actually pushes water — the bow and her shoulders —
    // and thinning away aft, so the collar is never a closed ring on the sea
    const fore = clamp((z + 9.5) / 11, 0, 1);
    const aFade = 0.34 + 0.66 * fore * fore;
    for (const [out, y, v] of RINGS) {
      pos.push(x + nx * out, y, z + nz * out);
      nrm.push(nx * 0.35, 0.94, nz * 0.35);
      uv.push(i / n * 4.5, v);
      col.push(1, 1, 1, aFade);
    }
  }
  const NR = RINGS.length;
  for (let i = 0; i < n; i++) {
    const A = i * NR, B = ((i + 1) % n) * NR;
    for (let r = 0; r < NR - 1; r++) idx.push(A + r, B + r, A + r + 1, A + r + 1, B + r, B + r + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const tex = foamTex();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0xffffff, map: tex, vertexColors: true, transparent: true, opacity: 0.9, roughness: 1,
    emissive: 0xffffff, emissiveIntensity: 0.08,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  mesh.userData.tex = tex;
  return mesh;
}

/** THE BOW MOUSTACHE. Two foam lobes that break away from her snout and sweep
 *  back along her cheeks. Its own mesh so ferry.js can scale it with her speed —
 *  a bow wave that does not grow when she moves is just a sticker. */
function buildBow() {
  // her half-beam AT the sea surface — the moustache is hung off this, so it can
  // never end up inside the hull the way a hand-guessed arc does
  const rw = (z) => {
    const h = hullH(z);
    if (h <= Math.abs(WL) + 0.12) return 0;
    return hullW(z) * Math.sqrt(Math.max(0, 1 - (WL / h) * (WL / h)));
  };
  const NB = 20, pos = [], uv = [], nrm = [], col = [], idx = [];
  const Z0 = 12.95, Z1 = 5.6;
  for (const s of [1, -1]) {
    const start = pos.length / 3;
    for (let i = 0; i <= NB; i++) {
      const t = i / NB;
      const z = Z0 - (Z0 - Z1) * t;
      const r = rw(z);
      // outward normal of the waterline outline, in XZ
      const dr = (rw(z + 0.3) - rw(z - 0.3)) / 0.6;
      let nx = 1, nz = -dr;
      const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      // hardest just aft of the stem, gone by the time it reaches her waist
      const fade = Math.min(1, t * 7) * Math.pow(Math.max(0, 1 - t), 0.85);
      const swell = 0.45 + 0.55 * Math.exp(-Math.pow((t - 0.16) / 0.26, 2));
      for (const [out, y, v, al] of [[-0.12, 0.05, 0.0, 0.45], [0.62, 0.42 + swell * 0.42, 0.42, 1.0], [1.9 + swell * 1.1, 0.02, 1.0, 0.0]]) {
        pos.push(s * (r + nx * out), y, z + nz * out);
        nrm.push(0, 1, 0);
        uv.push(t * 2.6, v);
        col.push(1, 1, 1, al * fade);
      }
    }
    for (let i = 0; i < NB; i++) {
      const A = start + i * 3, B = start + (i + 1) * 3;
      for (let k = 0; k < 2; k++) idx.push(A + k, B + k, A + k + 1, A + k + 1, B + k, B + k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const tex = foamTex();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0xffffff, map: tex, vertexColors: true, transparent: true, opacity: 0, roughness: 1,
    emissive: 0xffffff, emissiveIntensity: 0.3, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.tex = tex;
  mesh.name = 'sugarfin-bowwave';
  return mesh;
}

/** THE WAKE. A cream V: two bright divergent shoulders that widen with distance
 *  and are gone inside ~30 units. Vertex alpha does the shape, the texture does
 *  the churn, and it scrolls astern. It is emissive so it stays cream even where
 *  her own shadow lies across the sea — unlit white over a shadow is what made
 *  the old one read as a brown decal. */
function buildWake() {
  const N = 26, NU = 7, pos = [], uv = [], nrm = [], col = [], idx = [];
  const LEN = 31;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = -12.2 - t * LEN;
    const w = 1.2 + t * 8.2;                            // the V opens out
    // dies away over the run: full for the first third, nothing by the end
    const fade = Math.pow(Math.max(0, 1 - t), 1.15) * Math.min(1, t * 7);
    for (let k = 0; k < NU; k++) {
      const u = (k / (NU - 1)) * 2 - 1;                 // -1 .. 1 across
      pos.push(u * w, 0, z);
      nrm.push(0, 1, 0);
      uv.push((u + 1) / 2, t * 2.6);
      const s = Math.abs(u);
      // bright on the two shoulders, softer in the churned middle, zero at rim
      const across = Math.max(0, 1 - Math.pow(s, 3)) * (0.62 + 1.3 * Math.exp(-Math.pow((s - 0.66) / 0.26, 2)));
      col.push(1, 1, 1, Math.min(1, across * fade));
    }
  }
  for (let i = 0; i < N; i++) {
    const A = i * NU, B = (i + 1) * NU;
    for (let k = 0; k < NU - 1; k++) idx.push(A + k, B + k, A + k + 1, A + k + 1, B + k, B + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const tex = wakeTex();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0xfffdf6, map: tex, vertexColors: true, transparent: true, opacity: 0.0, roughness: 1,
    emissive: 0xfff4e2, emissiveIntensity: 0.95,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.tex = tex;
  return mesh;
}

/** Lamp light that lands somewhere: ONE InstancedMesh carrying four additive
 *  radial glows — a halo around each lantern and a stretched smear on the water
 *  under it. Radial, so nothing shows a disc rim. Placed/aimed from ferry.js. */
function buildLampFx() {
  const g = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({
    map: glowTex(), transparent: true, opacity: 1, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xffc178, toneMapped: false,
    side: THREE.DoubleSide,
  }), 4);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.visible = false;
  const c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < 4; i++) mesh.setColorAt(i, c);    // creates instanceColor
  mesh.name = 'sugarfin-lampfx';
  return mesh;
}

/** Mooring lines, rebuilt whenever she ties up (twice a trip — not per frame). */
function buildRopes() {
  const g0 = new THREE.BufferGeometry();
  g0.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  g0.computeBoundingBox(); g0.computeBoundingSphere();
  g0.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1], 3));
  const mesh = new THREE.Mesh(g0, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, flatShading: true, metalness: 0.1,
  }));
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.visible = false;
  /** a, b: THREE.Vector3 world ends; sag in units. `posts` are world [x,y,z]
   *  bollards built into the same geometry, so a mooring line always ends on
   *  something instead of stopping in mid-air. */
  mesh.userData.set = (pairs, posts = []) => {
    const pos = [], col = [], idx = [];
    const SEG = 7, R = 0.085, SIDES = 5;
    const rope = new THREE.Color(COL.rope), brass = new THREE.Color(COL.gold);
    const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); };
    for (const [a, b, sag] of pairs) {
      const base = pos.length / 3;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t;
        const cy = a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * sag;
        for (let k = 0; k < SIDES; k++) {
          const ang = (k / SIDES) * Math.PI * 2;
          push(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, cz + Math.cos(ang) * R * 0.2, rope);
        }
      }
      for (let i = 0; i < SEG; i++) for (let k = 0; k < SIDES; k++) {
        const A = base + i * SIDES + k, B = base + i * SIDES + (k + 1) % SIDES;
        idx.push(A, A + SIDES, B, B, A + SIDES, B + SIDES);
      }
    }
    // ── bollards: a squat brass post per line end ──
    for (const [bx, by, bz] of posts) {
      const base = pos.length / 3;
      const RINGS = [[0.30, 0.0], [0.26, 0.46], [0.34, 0.56], [0.30, 0.68], [0.0, 0.74]];
      for (const [r, y] of RINGS) for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        push(bx + Math.cos(ang) * r, by + y, bz + Math.sin(ang) * r, brass);
      }
      for (let i = 0; i < RINGS.length - 1; i++) for (let k = 0; k < 8; k++) {
        const A = base + i * 8 + k, B = base + i * 8 + (k + 1) % 8;
        idx.push(A, A + 8, B, B, A + 8, B + 8);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos.length ? pos : [0, 0, 0], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col.length ? col : [1, 1, 1], 3));
    if (idx.length) g.setIndex(idx);
    g.computeVertexNormals();
    // A geometry swapped in at runtime MUST arrive with its bounds already
    // computed: the camera's blocker pass reads geometry.boundingSphere.radius
    // straight off every candidate, and a null there throws inside camera.update
    // once per frame — which stops the camera dead and looks like "the ferry
    // doesn't render". Never hand the scene a geometry without these.
    g.computeBoundingBox();
    g.computeBoundingSphere();
    mesh.geometry.dispose();
    mesh.geometry = g;
    mesh.visible = pairs.length > 0;
  };
  return mesh;
}

/** Build the whole ferry. Returns the root group plus every animatable part. */
export function buildWhale() {
  const group = new THREE.Group();
  group.name = 'sugarfin-express';
  const hull = buildHull();
  const eyes = buildEyes();
  const spark = buildEyeSpark();
  eyes.add(spark);                       // blinks with the eye it lives on
  const lids = buildEyelids();
  const mouth = buildMouth();
  const horn = buildHorn();
  const tail = buildTail();
  const deck = buildDeck();
  const canopy = buildCanopy();
  const sign = buildSign('SUGARFIN');
  const ramp = buildRamp();
  const gate = buildGate();
  const bell = buildBell();
  const lanterns = [buildLantern(), buildLantern()];

  group.add(hull, eyes, lids, mouth, horn, tail, deck, canopy, sign);

  // gangplank + gate hinge on whichever side the pier is (see setGang below)
  const rampPivot = new THREE.Group();
  rampPivot.add(ramp);
  const flag = buildBoardFlag();
  flag.group.position.set(RAMP_LEN - 0.35, 0.1, 1.34);   // outboard of the rail
  ramp.add(flag.group);
  deck.add(rampPivot);
  const gatePivot = new THREE.Group();
  gatePivot.add(gate);
  deck.add(gatePivot);
  const deckSlot = new THREE.Vector3(0.55, DECK.top, 1.3);
  /** Put the gangway on the +X (1) or -X (-1) side. Returns the ramp's base yaw. */
  function setGang(side) {
    rampPivot.position.set(side * (DECK.halfX - 0.1), DECK.top + 0.05, 0.6);
    gatePivot.position.set(side * (DECK.halfX - 0.16), DECK.top + 0.42, side > 0 ? -0.9 : 2.2);
    deckSlot.x = 0.55 * side;
    return side > 0 ? 0 : Math.PI;
  }

  const bellPivot = new THREE.Group();
  bellPivot.position.set(-2.3, DECK.top + 2.18, -1.2);
  bellPivot.add(bell);
  deck.add(bellPivot);

  const lampPivots = [];
  // hung outboard on gooseneck arms, clear of the canopy, swinging over the water
  const lampSpots = LAMP_ARMS.map(([s, z]) => [s * LAMP_X, LAMP_Y, z]);
  lanterns.forEach((lamp, i) => {
    const p = new THREE.Group();
    p.position.set(...lampSpots[i]);
    p.add(lamp);
    deck.add(p);
    lampPivots.push(p);
  });

  // Two real lights (r170 physical units: candela with decay 2). 60 cd at a 10 u
  // range reads on the deck and on the water without blowing the paper shades.
  const lights = [];
  for (let i = 0; i < 2; i++) {
    const l = new THREE.PointLight(0xffc178, 0, 10, 2);
    l.position.set(lampSpots[i][0], lampSpots[i][1] - 0.6, lampSpots[i][2]);
    deck.add(l); lights.push(l);
  }

  // the stowaway lives in the aft crate (deck space 1.95, -2.6)
  const stowaway = buildStowaway();
  stowaway.position.set(1.95, DECK.top + 0.36, -2.6);
  deck.add(stowaway);

  const foam = buildFoam();
  const bow = buildBow();
  const wake = buildWake();
  const lampFx = buildLampFx();
  const ropes = buildRopes();
  foam.name = 'sugarfin-foam'; wake.name = 'sugarfin-wake'; ropes.name = 'sugarfin-ropes';
  // the canopy may dissolve when it stands between the lens and the passenger;
  // the deck itself must never (you would be standing on nothing).
  canopy.userData.fade = true;
  deck.userData.noFade = true;
  hull.userData.noFade = true;

  // sleepy "Zzz" over the blowhole (hidden unless she is asleep)
  const zzz = buildZzz();
  zzz.position.set(0, hullH(9.1) + 0.5, 9.1);
  group.add(zzz);

  return {
    group, hull, eyes, spark, lids, mouth, horn, tail, deck, canopy, sign, zzz,
    ramp, rampPivot, gate, gatePivot, bell, bellPivot, stowaway,
    flag: flag.group,
    lanterns, lampPivots, lights, lampFx, ropes,
    foam, bow, wake,
    hornTip: horn.userData.tip.clone(),
    blowhole: new THREE.Vector3(0, hullH(9.1) + 0.45, 9.1),
    spoutBase: new THREE.Vector3(0, hullH(9.1) + 0.2, 9.1),
    noseTip: new THREE.Vector3(0, 0, 12.2),
    lampSpots, setGang,
    cleats: [new THREE.Vector3(2.5, DECK.top + 0.44, -3.2), new THREE.Vector3(2.5, DECK.top + 0.44, 3.2)],
    deckSlot,                                          // in DECK space: by the gate
    rampLen: ramp.userData.len,
    eyeY: EYE.y,
    DECK,
  };
}
