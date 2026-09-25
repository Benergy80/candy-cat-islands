// ─────────────────────────────────────────────────────────────────────────────
// TIGER RIG — the OTHER body every citizen owns.
//
// A tiger is not a scaled-up house cat, so it does not share the cat's parts.
// Each citizen carries a second, quadruped skeleton with its own geometry:
// a long low barrel of a torso, a broad heavy skull, small round ears, thick
// legs ending in oversized paws, and a long tail with a black tip. It sits at
// scale 0 all day and costs nothing but its instance slots; at 20:00 the cat
// scales away inside a puff of fur and this scales up in its place.
//
// Striping is done by UV surgery rather than by texture count. The fur atlas
// tile is authored as (u = around the body, v = top → bottom), which is right
// for a cat-sized SPHERE but produces a starburst on a long body — every
// meridian converges at the spine. So the torso, legs and tail are built from
// primitives whose poles lie FORE/AFT with u and v swapped: the tile's stripes
// then wrap the body as RINGS, its dark spine band lands along the back, and
// its pale belly band underneath. Cheeks, paws, ear-backs and the tail tip
// simply pin their UVs to one flat spot of the tile (white, white, near-black).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Pool, merge, solo, blobTexture } from './rig.js';
import { tileUV, TIGER_OF, furMaterial } from './fur.js';
import { mat } from '../../../core/util.js';

const sph = (r, w, h) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, s, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const cone = (r, h, s) => new THREE.ConeGeometry(r, h, s);

// ── proportions (tiger-local units; the root scale does the rest) ─────────────
export const TP = {
  spineY: 0.95, spineZ: -0.05,
  shX: 0.300, shY: -0.06, shZ: 0.62,      // front legs, spine-local
  hipX: 0.315, hipY: -0.10, hipZ: -0.74,  // hind legs, spine-local
  legLen: 0.95,                            // leg geometry reaches y = -0.95
  neckY: 0.20, neckZ: 0.80,                // spine-local
  headY: 0.11, headZ: 0.26,                // neck-local
  headScale: 1.24,                         // a tiger's head is WIDER than its body
  tailY: 0.10, tailZ: -1.14,               // spine-local
  earX: 0.268, earY: 0.302, earZ: -0.045,  // head-local
  eyeX: 0.170, eyeY: 0.100, eyeZ: 0.300,   // head-local
  muzzleY: -0.135, muzzleZ: 0.345,         // head-local
  jawY: -0.135, jawZ: 0.150,               // head-local (hinge)
  tailSegs: 5, tailSeg: 0.30,
};

// ── uv helpers ───────────────────────────────────────────────────────────────
// The tiger tiles are authored symmetric about v = 0.5: v = 0 and v = 1 are the
// spine, v = 0.5 is the white belly (see fur.js). So "pale" is the middle of the
// tile and "ink" is either edge, and a piece can be pushed into any band of coat
// it likes without a second texture.
/** Pin every uv of a geometry to one point of the coat tile. */
function uvFlat(g, u, v) { const a = g.attributes.uv.array; for (let i = 0; i < a.length; i += 2) { a[i] = u; a[i + 1] = v; } return g; }
/** Squeeze a piece's v into one band of the coat (all stripe, all belly, …). */
function uvBand(g, v0, v1) { const a = g.attributes.uv.array; for (let i = 1; i < a.length; i += 2) a[i] = v0 + (v1 - v0) * a[i]; return g; }
const PALE = [0.50, 0.50];   // white belly band  — chin, cheeks, paws
const INK = [0.50, 0.015];   // spine band        — black ear backs
const COAT = [0.14, 0.38];   // plain striped flank — legs, tail, ruff

/** Swap u and v so a lengthwise primitive gets rings instead of streaks. */
function swapUV(g) {
  const a = g.attributes.uv.array;
  for (let i = 0; i < a.length; i += 2) { const u = a[i], v = a[i + 1]; a[i] = v; a[i + 1] = (u + 0.25) % 1; }
  return g;
}
/** Sphere with its poles fore/aft and (along, around) uvs: a striped barrel. */
function bodyBall(r, lon, lat) { const g = sph(r, lon, lat); g.rotateX(Math.PI / 2); return swapUV(g); }
/** Cylinder with rings round it rather than stripes along it. */
function ringCyl(rt, rb, h, s, open) { return uvBand(swapUV(cyl(rt, rb, h, s, open)), ...COAT); }

const xf = (g, sx, sy, sz, tx = 0, ty = 0, tz = 0) => { g.scale(sx, sy, sz); g.translate(tx, ty, tz); return g; };

// ── the parts ────────────────────────────────────────────────────────────────
/**
 * TORSO — one deformed barrel so the stripes stay continuous: deep chest,
 * shoulder-blade hump, a waist, and a haunch you could not lift.
 */
function torsoGeo() {
  const g = bodyBall(1, 13, 8);
  const p = g.attributes.position;
  const G = (z, c, s) => Math.exp(-(((z - c) / s) ** 2));
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // +z is the chest end. Widen at the haunch and the ribs, pinch the waist.
    const w = 1 + 0.27 * G(z, -0.72, 0.40) + 0.21 * G(z, 0.50, 0.44) - 0.19 * G(z, -0.08, 0.38);
    x *= 0.415 * w; y *= 0.385 * w; z *= 1.22;
    if (y > 0) y += 0.115 * G(z, 0.58, 0.38) * Math.min(1, y / 0.16);     // shoulder blades
    else y -= 0.045 * G(z, -0.20, 0.55) * Math.min(1, -y / 0.16);          // belly
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const neck = xf(bodyBall(0.36, 7, 4), 1.02, 0.98, 0.92, 0, 0.15, 0.95);
  return merge([{ g }, { g: neck }]);
}

/** HEAD — broad skull, heavy brow, and the white cheek ruff that makes it read. */
function headGeo() {
  // the skull keeps the sphere's own (around, top→bottom) uv, squeezed into the
  // top half of the tile: black crown, stripes running down the face, and the
  // coat already turning pale by the jaw line
  const cran = xf(uvBand(sph(0.42, 9, 6), 0.025, 0.50), 1.10, 0.90, 0.92);
  const brow = xf(uvBand(sph(0.31, 6, 4), 0.02, 0.15), 1.18, 0.38, 0.78, 0, 0.155, 0.215);
  const ruff = xf(uvBand(sph(0.40, 7, 3), 0.08, 0.42), 1.16, 1.02, 0.54, 0, -0.055, -0.245);
  const cheeks = [-1, 1].map((s) => ({
    g: xf(uvFlat(sph(0.215, 5, 3), ...PALE), 0.80, 1.20, 0.86, s * 0.345, -0.135, 0.085),
  }));
  return merge([{ g: cran }, { g: brow }, { g: ruff }, ...cheeks]);
}

/** EAR — small, round, black on the back with a pale thumbprint inside. */
function earGeo() {
  const back = xf(uvFlat(sph(0.172, 6, 3), ...INK), 1.00, 1.04, 0.50);
  const inner = xf(uvFlat(sph(0.116, 5, 3), ...PALE), 0.96, 0.94, 0.44, 0, 0.005, 0.068);
  return merge([{ g: back }, { g: inner, color: 0xffc4c4 }]);
}

/** MUZZLE — heavy pad, pink nose, dark lip line, the top pair of canines. */
function muzzleGeo() {
  const pad = xf(sph(0.190, 8, 5), 1.32, 0.84, 0.96);
  const nose = (() => { const c = cone(0.086, 0.098, 4); c.rotateX(Math.PI); c.rotateY(Math.PI / 4); c.translate(0, 0.112, 0.088); return c; })();
  const lip = xf(sph(0.160, 6, 3), 1.28, 0.30, 0.86, 0, -0.098, 0.015);
  const fangs = [-1, 1].map((s) => ({
    g: (() => { const c = cone(0.036, 0.135, 4); c.rotateX(Math.PI); c.translate(s * 0.108, -0.150, 0.050); return c; })(),
    color: 0xfffaf0,
  }));
  return merge([{ g: pad, color: 0xfff3e2 }, { g: nose, color: 0xff7f9c }, { g: lip, color: 0x33222c }, ...fangs]);
}

/** JAW — hinges open. Dark inside, two more fangs, a bit of tongue. */
function jawGeo() {
  const dark = xf(sph(0.150, 6, 3), 1.18, 0.70, 0.92, 0, 0.020, 0.140);
  const jaw = xf(sph(0.165, 7, 3), 1.24, 0.60, 1.02, 0, -0.055, 0.155);
  const tongue = xf(sph(0.075, 4, 3), 1.05, 0.42, 1.45, 0, -0.010, 0.150);
  const fangs = [-1, 1].map((s) => ({
    g: (() => { const c = cone(0.031, 0.105, 4); c.translate(s * 0.098, 0.048, 0.215); return c; })(),
    color: 0xfffaf0,
  }));
  return merge([{ g: dark, color: 0x2a161e }, { g: tongue, color: 0xe4738c }, { g: jaw, color: 0xfff3e2 }, ...fangs]);
}

/** LEG — thick thigh, ringed shank, and a paw far too big for a house cat. */
function legGeo() {
  const thigh = xf(uvBand(bodyBall(0.190, 6, 3), 0.10, 0.44), 1.32, 1.55, 1.34, 0, -0.150, 0);
  const shank = (() => { const g = ringCyl(0.128, 0.116, 0.52, 5, true); g.translate(0, -0.575, 0.012); return g; })();
  const paw = xf(uvFlat(sph(0.150, 5, 3), ...PALE), 1.48, 0.86, 1.66, 0, -0.830, 0.052);
  return merge([{ g: thigh }, { g: shank }, { g: paw }]);
}

/** TAIL segment — pivot at its base, rings round it. */
function tailGeo() { const g = ringCyl(0.084, 0.096, TP.tailSeg, 4, false); g.translate(0, TP.tailSeg / 2, 0); return solo(g); }

export { torsoGeo, headGeo, earGeo, muzzleGeo, jawGeo, legGeo, tailGeo };

// ── pools ────────────────────────────────────────────────────────────────────
/**
 * Extend an existing rig library with the tiger's own parts. 7 extra draw calls;
 * every instance sits at scale 0 until the sun goes down.
 */
export function addTigerPools(lib) {
  const { skinMat } = lib.materials;
  const glowMat = new THREE.MeshBasicMaterial({
    map: blobTexture(), transparent: true, depthWrite: false, vertexColors: true,
    blending: THREE.AdditiveBlending, toneMapped: false, opacity: 1,
  });
  lib.materials.tigerGlowMat = glowMat;
  // The night shift gets its OWN copy of the fur material: same atlas, same
  // per-instance tile, but with a warm fresnel rim and a breath of emissive the
  // citizens system ramps up after dark. Without it a tiger lying on wet
  // cobbles at 22:00 is exactly the value of the cobbles and simply vanishes.
  const furMat = furMaterial({ rim: true, rimColor: 0xffb06a, emissive: 0x2a1a10, emissiveIntensity: 0 });
  lib.materials.tigerFurMat = furMat;
  const P = lib.pools;
  P.tgTorso = new Pool('tgTorso', torsoGeo(), furMat, { fur: true, cast: true });
  P.tgHead = new Pool('tgHead', headGeo(), furMat, { fur: true, cast: true });
  P.tgEar = new Pool('tgEar', earGeo(), furMat, { fur: true, cast: false });
  P.tgLeg = new Pool('tgLeg', legGeo(), furMat, { fur: true, cast: true });
  P.tgTail = new Pool('tgTail', tailGeo(), furMat, { fur: true, cast: false });
  P.tgMuzzle = new Pool('tgMuzzle', muzzleGeo(), skinMat);
  P.tgJaw = new Pool('tgJaw', jawGeo(), skinMat);
  P.tgGlow = new Pool('tgGlow', solo(new THREE.PlaneGeometry(1, 1)), glowMat, { receive: false });
  return lib;
}

// ── build ────────────────────────────────────────────────────────────────────
/** Remember where a borrowed part lives on the cat, so it can go home at dawn. */
function capture(o) {
  if (!o) return o;
  o.userData._home = { parent: o.parent, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() };
  return o;
}
export function goHome(o) {
  const h = o && o.userData._home; if (!h) return;
  h.parent.add(o);
  o.position.copy(h.p); o.quaternion.copy(h.q); o.scale.copy(h.s);
}

const HATS = ['copCap', 'cap', 'visor', 'topHat', 'sunHat'];

/** Eye (and eye-glow) colour of the tiger a given day coat turns into. Eyeshine,
 *  not lamplight: every one of them cold (green, ice, white-green) — an amber
 *  pair vanished into the amber lanterns of Main Street and the Candy Kingdom. */
const TIGER_EYE = { tiger_orange: 0xe4ffa0, tiger_white: 0x86e0ff, tiger_grey: 0xcaf46a, tiger_shadow: 0x96ff4a };
export function tigerEyeHex(pattern) { return TIGER_EYE[TIGER_OF[pattern] || 'tiger_orange'] ?? 0xe4ffa0; }

/**
 * Build one citizen's tiger. Eyes, pupils, whiskers and the hat are BORROWED
 * from the cat rig at dusk (see setForm in tiger.js) rather than duplicated:
 * a sphere is a sphere, and the joke needs the visor.
 */
export function buildTiger(lib, spec, catRig) {
  const { pools } = lib;
  const tuv = { tile: tileUV(TIGER_OF[spec.pattern] || 'tiger_orange') };
  const O = (x, y, z, parent) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

  const root = new THREE.Object3D();
  const spine = O(0, TP.spineY, TP.spineZ, root);
  const bodyN = O(0, 0, 0, spine);
  pools.tgTorso.add(bodyN, tuv);

  const neck = O(0, TP.neckY, TP.neckZ, spine);
  const headPivot = O(0, TP.headY, TP.headZ, neck);
  headPivot.scale.setScalar(TP.headScale);
  pools.tgHead.add(O(0, 0, 0, headPivot), tuv);

  const earL = O(-TP.earX, TP.earY, TP.earZ, headPivot);
  const earR = O(TP.earX, TP.earY, TP.earZ, headPivot);
  for (const e of [earL, earR]) pools.tgEar.add(O(0, 0, 0, e), tuv);

  const muzzleN = O(0, TP.muzzleY, TP.muzzleZ, headPivot);
  pools.tgMuzzle.add(muzzleN, { color: 0xffffff });
  const jawN = O(0, TP.jawY, TP.jawZ, headPivot);
  pools.tgJaw.add(jawN, { color: 0xffffff });

  const shL = O(-TP.shX, TP.shY, TP.shZ, spine), shR = O(TP.shX, TP.shY, TP.shZ, spine);
  const hipL = O(-TP.hipX, TP.hipY, TP.hipZ, spine), hipR = O(TP.hipX, TP.hipY, TP.hipZ, spine);
  for (const l of [shL, shR, hipL, hipR]) pools.tgLeg.add(O(0, 0, 0, l), tuv);

  const tailBase = O(0, TP.tailY, TP.tailZ, spine);
  const tailSegs = []; let cur = tailBase;
  for (let i = 0; i < TP.tailSegs; i++) {
    const seg = i === 0 ? cur : O(0, TP.tailSeg, 0, cur);
    // the last third of the tail is black, the way a tiger's is
    pools.tgTail.add(O(0, 0, 0, seg), i >= TP.tailSegs - 2 ? { tile: tileUV(TIGER_OF[spec.pattern] || 'tiger_orange'), color: 0x554752 } : tuv);
    tailSegs.push(seg); cur = seg;
  }

  // eye glow: two parentless additive sprites the driver billboards each frame.
  // The colour goes with the coat, not with the daytime cat — amber for orange
  // tigers, ice for snow ones, and something distinctly wrong for the black.
  const glow = [new THREE.Object3D(), new THREE.Object3D()];
  const glowHex = tigerEyeHex(spec.pattern);
  for (const g of glow) { g.scale.setScalar(0); pools.tgGlow.add(g, { color: glowHex }); }

  // borrowed parts (still on the cat until dusk)
  const borrow = [catRig.eyeL, catRig.eyeR, catRig.pupL, catRig.pupR, catRig.whisk].filter(Boolean);
  let hat = null;
  for (const k of HATS) if (catRig.worn[k]) { hat = catRig.worn[k]; break; }
  if (hat) borrow.push(hat);
  for (const o of borrow) capture(o);

  root.scale.setScalar(0);
  root.updateMatrixWorld(true);
  return { root, spine, bodyN, neck, headPivot, earL, earR, muzzleN, jawN, shL, shR, hipL, hipR, tailBase, tailSegs, glow, hat, borrow };
}
