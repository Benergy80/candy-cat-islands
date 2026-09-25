// ─────────────────────────────────────────────────────────────────────────────
// RAID RIG — the bodies of the tigers that cross the rainbow (Contract M).
//
// The raiding party cannot borrow the citizens' pools: those live in the
// citizens' group, which is switched off whenever the lens is over Candyland
// (the whole town costs ~40 calls). So the party gets its OWN, much leaner
// set: the same tiger skeleton as tigerrig.js, but every piece that is rigid
// relative to its bone is baked into one geometry, so a whole party is
//
//   torso · head (+ ears, eyes, slit pupils) · legs · tail · muzzle
//   (+ whiskers) · jaw · contact blob · EYE GLOW (one Points)   = 8 draw calls
//
// and ~1.5k triangles a tiger. Materials are SHARED with the citizens (the
// night fur with its warm rim, the skin, the blob), so a raider is lit, x-rayed
// and ramped exactly like a Cat Island tiger. Nothing casts a real shadow (the
// budget is +8 calls; a shadow pass would double it) — the soft blob grounds it.
//
// EYE GLOW: a Points cloud (two points a tiger) with a tiny shader: additive,
// fog-free, depth-tested (a head turned away hides its own eyes), sized in
// world units up close and clamped to a MINIMUM pixel size far away — so a
// party crossing the rainbow at night is two dozen pinpricks you can see
// from the other island. GLSL: no backticks anywhere in here.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Pool, merge, blobTexture } from './rig.js';
import { tileUV, TIGER_OF, furMaterial } from './fur.js';
import { TP, tigerEyeHex, torsoGeo, headGeo, earGeo, muzzleGeo, jawGeo, legGeo, tailGeo } from './tigerrig.js';

const sph = (r, w, h) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, s) => new THREE.CylinderGeometry(rt, rb, h, s, 1, false);

/** Pin every uv of a geometry to one point of the coat tile. */
function uvFlat(g, u, v) { const a = g.attributes.uv.array; for (let i = 0; i < a.length; i += 2) { a[i] = u; a[i + 1] = v; } return g; }
/** Apply a rest transform (rotation XYZ, then position) to a geometry. */
function place(g, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  g.scale(sx, sy, sz);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  g.applyMatrix4(m);
  g.translate(px, py, pz);
  return g;
}
/** Take the non-indexed attributes of a merged geometry back out as one piece. */
function asPiece(g, color = 0xffffff) { return { g, color }; }

/** HEAD + both ears (at rest) + eyes + slit pupils, in head-pivot space. */
function raidHeadGeo() {
  const parts = [asPiece(headGeo())];
  // ears: the tiger's own ear geometry, posed as applyTiger rests them (ear 0)
  for (const s of [-1, 1]) {
    const e = earGeo();
    place(e, s * TP.earX, TP.earY, TP.earZ, -0.06, -s * 0.20, -s * 0.34);
    parts.push(asPiece(e));
  }
  // eyes: pale gold under the brow, the hard inward slant that stops a big
  // round eye reading as a kitten's; black slits in front
  for (const s of [-1, 1]) {
    const tilt = s < 0 ? 0.30 : -0.30;
    const eye = uvFlat(sph(0.108, 7, 5), 0.50, 0.50);
    place(eye, s * TP.eyeX, TP.eyeY, TP.eyeZ, 0, 0, tilt, 1.34, 1.18, 0.80);
    parts.push(asPiece(eye, 0xffd25a));
    const pup = uvFlat(sph(0.086, 5, 3), 0.50, 0.015);
    place(pup, s * TP.eyeX, TP.eyeY, TP.eyeZ + 0.052, 0, 0, tilt, 0.38, 1.50, 0.82);
    parts.push(asPiece(pup, 0x0e0b13));
  }
  return merge(parts);
}

/** MUZZLE + the whiskers (the citizens' whisker fan, scaled the way applyTiger does). */
function raidMuzzleGeo() {
  const parts = [asPiece(muzzleGeo())];
  // whiskers ride at head (0, -0.168, 0.400) scaled (1.05, 0.85, 1); the muzzle
  // node sits at head (0, muzzleY, muzzleZ) — bake the difference in
  const ox = 0, oy = -0.168 - TP.muzzleY, oz = 0.400 - TP.muzzleZ;
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const w = cyl(0.010, 0.030, 0.40, 3);
    w.translate(0, 0.20, 0);
    w.rotateX(-0.26);
    w.rotateZ(-s * (Math.PI / 2 - (0.44 - i * 0.30)));
    w.translate(s * 0.075, 0.0, 0.06);
    w.scale(1.05, 0.85, 1.0);
    w.translate(ox, oy, oz);
    parts.push({ g: w, color: 0xfffdf4 });
  }
  return merge(parts);
}

function blobGeo() {
  const p = new THREE.PlaneGeometry(1, 1); p.rotateX(-Math.PI / 2);
  return merge([{ g: p, color: 0xffffff }]);
}

// ── the eye-glow points ──────────────────────────────────────────────────────
const GLOW_VS = [
  'attribute vec3 aCol;',
  'attribute float aSize;',
  'uniform float uScale;',
  'uniform float uMinPx;',
  'varying vec3 vCol;',
  'varying float vK;',
  'void main() {',
  '  vec4 mv = modelViewMatrix * vec4( position, 1.0 );',
  '  gl_Position = projectionMatrix * mv;',
  '  float px = aSize * uScale / max( 0.5, -mv.z );',
  '  float sz = max( px, uMinPx * step( 0.0005, aSize ) );',
  // far away the pinprick keeps its brightness; up close the soft halo does the work
  '  vK = clamp( uMinPx / max( px, 0.001 ), 0.0, 1.0 );',
  '  vCol = aCol;',
  '  gl_PointSize = sz;',
  '}',
].join('\n');
const GLOW_FS = [
  'uniform float uGlow;',
  'varying vec3 vCol;',
  'varying float vK;',
  'void main() {',
  '  vec2 q = gl_PointCoord * 2.0 - 1.0;',
  '  float d = dot( q, q );',
  '  if ( d > 1.0 ) discard;',
  '  float core = exp( -d * mix( 7.0, 3.2, vK ) );',
  '  float halo = exp( -d * 2.2 ) * mix( 0.35, 0.6, vK );',
  '  vec3 c = vCol * ( core * mix( 1.6, 2.6, vK ) + halo ) + vec3( 1.0, 0.96, 0.85 ) * pow( core, 4.0 ) * mix( 0.9, 1.4, vK );',
  '  gl_FragColor = vec4( c * uGlow, 1.0 );',
  '}',
].join('\n');

/**
 * The party's pools, built into `group`. `lib` is the citizens' rig library
 * (for its shared materials). Returns { pools, glow, add(spec) }.
 */
export function createRaidRig(lib, group, maxN, xray) {
  const M = lib.materials;
  // the raiders' own night fur: the town's (same atlas, same tiles) with a
  // stronger rim that takes the colour of whatever is lighting them — amber
  // lamplight on Candyland, the rainbow's pink up on the deck. Backlit by the
  // bridge's aura, the shared one left their faces a flat brown.
  const fur = furMaterial({ rim: true, rimColor: 0xffb06a, emissive: 0x2a1a10, emissiveIntensity: 0 });
  if (xray && xray.patch) xray.patch(fur);
  const pools = {
    rdBlob: new Pool('rdBlob', blobGeo(), M.blobMat, { receive: false }),
    rdTorso: new Pool('rdTorso', torsoGeo(), fur, { fur: true }),
    rdHead: new Pool('rdHead', raidHeadGeo(), fur, { fur: true }),
    rdLeg: new Pool('rdLeg', legGeo(), fur, { fur: true }),
    rdTail: new Pool('rdTail', tailGeo(), fur, { fur: true }),
    rdMuzzle: new Pool('rdMuzzle', raidMuzzleGeo(), M.skinMat),
    rdJaw: new Pool('rdJaw', jawGeo(), M.skinMat),
  };

  // eye glow: 2 points per raider, parked at scale 0 until needed
  const n = maxN * 2;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const uniforms = { uScale: { value: 1000 }, uMinPx: { value: 4.5 }, uGlow: { value: 0 } };
  const gmat = new THREE.ShaderMaterial({
    uniforms, vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  });
  const points = new THREE.Points(geo, gmat);
  points.name = 'raid_eyes';
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;
  group.add(points);

  const O = (x, y, z, parent) => { const o = new THREE.Object3D(); o.position.set(x, y, z); if (parent) parent.add(o); return o; };

  /** One raider's skeleton (the tigerrig.js bones, same names applyTiger drives). */
  function add(spec) {
    const tuv = { tile: tileUV(TIGER_OF[spec.pattern] || 'tiger_orange') };
    const root = new THREE.Object3D();
    root.rotation.order = 'YXZ';                  // yaw, then the slope of the rainbow
    const spine = O(0, TP.spineY, TP.spineZ, root);
    const bodyN = O(0, 0, 0, spine);
    pools.rdTorso.add(bodyN, tuv);
    const neck = O(0, TP.neckY, TP.neckZ, spine);
    const headPivot = O(0, TP.headY, TP.headZ, neck);
    headPivot.scale.setScalar(TP.headScale);
    pools.rdHead.add(O(0, 0, 0, headPivot), tuv);
    // ears are baked into the head: these two only exist so applyTiger has
    // something to pin back
    const earL = O(-TP.earX, TP.earY, TP.earZ, null), earR = O(TP.earX, TP.earY, TP.earZ, null);
    const muzzleN = O(0, TP.muzzleY, TP.muzzleZ, headPivot);
    pools.rdMuzzle.add(muzzleN, { color: 0xffffff });
    const jawN = O(0, TP.jawY, TP.jawZ, headPivot);
    pools.rdJaw.add(jawN, { color: 0xffffff });
    const shL = O(-TP.shX, TP.shY, TP.shZ, spine), shR = O(TP.shX, TP.shY, TP.shZ, spine);
    const hipL = O(-TP.hipX, TP.hipY, TP.hipZ, spine), hipR = O(TP.hipX, TP.hipY, TP.hipZ, spine);
    for (const l of [shL, shR, hipL, hipR]) pools.rdLeg.add(O(0, 0, 0, l), tuv);
    const tailBase = O(0, TP.tailY, TP.tailZ, spine);
    const tailSegs = []; let cur = tailBase;
    for (let i = 0; i < TP.tailSegs; i++) {
      const seg = i === 0 ? cur : O(0, TP.tailSeg, 0, cur);
      pools.rdTail.add(O(0, 0, 0, seg), i >= TP.tailSegs - 2 ? { tile: tuv.tile, color: 0x554752 } : tuv);
      tailSegs.push(seg); cur = seg;
    }
    const glow = [new THREE.Object3D(), new THREE.Object3D()];
    const blob = new THREE.Object3D();
    blob.matrixAutoUpdate = false; blob.scale.setScalar(0); blob.updateMatrix(); blob.matrixWorld.copy(blob.matrix);
    pools.rdBlob.add(blob, { color: 0xffffff });
    root.scale.setScalar(0);
    root.updateMatrixWorld(true);
    const TG = { root, spine, bodyN, neck, headPivot, earL, earR, muzzleN, jawN, shL, shR, hipL, hipR, tailBase, tailSegs, glow, hat: null, borrow: [] };
    // applyTiger drives the cat rig too (it scales the cat away): the raiders
    // have none, so these stand in for it — plain objects nobody draws
    const cat = { root: new THREE.Object3D(), eyeL: new THREE.Object3D(), eyeR: new THREE.Object3D(), pupL: new THREE.Object3D(), pupR: new THREE.Object3D(), whisk: new THREE.Object3D(), tiger: TG, coat: null };
    return { rig: cat, TG, blob, glowHex: tigerEyeHex(spec.pattern) };
  }

  function build() {
    for (const p of Object.values(pools)) p.build(group);
    for (const p of Object.values(pools)) if (p.mesh) { p.mesh.name = 'raid_' + p.name; p.mesh.castShadow = false; }
  }
  function sync() { for (const p of Object.values(pools)) p.sync(); }
  function stats() {
    let calls = 0, tris = 0;
    for (const p of Object.values(pools)) if (p.mesh && p.mesh.visible) { calls++; tris += p.tris; }
    if (points.visible) calls++;
    return { calls, tris: Math.round(tris) };
  }
  return { pools, points, uniforms, pos, col, size, geo, add, build, sync, stats, fur, materials: [fur, M.skinMat] };
}
