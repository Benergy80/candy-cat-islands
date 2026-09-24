// ─────────────────────────────────────────────────────────────────────────────
// CANDYLAND CREATURES — shared kit.
// Tiny procedural low-poly critters, all drawn with InstancedMesh. Every
// creature body is built once as a merged geometry (vertex colours carry the
// part shading), then tinted per instance with instanceColor.
//
// Why merged-geometry + instanceColor: one draw call per creature type, per
// instance hue variety for free, and animation is just a matrix write per
// frame. Wing flapping (butterflies, birds) is done in a vertex-shader hook so
// wings do not cost extra draw calls.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const TAU = Math.PI * 2;

const _m4 = new THREE.Matrix4();
const _v3 = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _col = new THREE.Color();

// ── deterministic per-position hash (seam-safe blob jitter) ──────────────────
function h3(x, y, z) { const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return n - Math.floor(n); }

/**
 * Turn a primitive into a merge-ready creature part.
 * opts: { pos, rot, scale, color, tag, bump }
 *  - color: flat vertex colour for this part (the "part shading")
 *  - tag:   per-vertex float read by the flap shader (-1 left wing, +1 right)
 *  - bump:  radial jitter (0..1) applied before transform — fluffy wool, rough candy
 */
export function part(geo, opts = {}) {
  let g = geo.clone();
  if (opts.bump) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const l = Math.hypot(x, y, z) || 1;
      const k = 1 + (h3(x * 7.1, y * 7.1, z * 7.1) - 0.5) * 2 * opts.bump;
      p.setXYZ(i, x * k, y * k, z * k);
    }
  }
  if (g.index) g = g.toNonIndexed();
  const pos = opts.pos || [0, 0, 0];
  const rot = opts.rot || [0, 0, 0];
  let s = opts.scale ?? 1; if (!Array.isArray(s)) s = [s, s, s];
  _e.set(rot[0], rot[1], rot[2]);
  _m4.compose(_v3.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e), _sc.set(s[0], s[1], s[2]));
  g.applyMatrix4(_m4);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  _col.setHex(opts.color ?? 0xffffff);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tag = new Float32Array(n); tag.fill(opts.tag || 0);
  g.setAttribute('aTag', new THREE.BufferAttribute(tag, 1));
  return g;
}

/** Merge parts (position/normal/color/aTag) into one non-indexed geometry. */
export function mergeParts(parts) {
  let total = 0; for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), tag = new Float32Array(total);
  let o = 0;
  for (const g of parts) {
    const p = g.attributes.position, nn = g.attributes.normal, c = g.attributes.color, t = g.attributes.aTag;
    pos.set(p.array, o * 3); nor.set(nn.array, o * 3); col.set(c.array, o * 3); tag.set(t.array, o);
    o += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aTag', new THREE.BufferAttribute(tag, 1));
  out.computeBoundingSphere();
  return out;
}

/** Re-shade a part's vertex colours along an axis (belly shadow, wing tips…). */
export function shadeAxis(g, axis, lo, hi, loHex, hiHex) {
  const p = g.attributes.position, c = g.attributes.color;
  const a = new THREE.Color(loHex), b = new THREE.Color(hiHex);
  for (let i = 0; i < p.count; i++) {
    const v = axis === 'y' ? p.getY(i) : axis === 'x' ? Math.abs(p.getX(i)) : p.getZ(i);
    let t = (v - lo) / (hi - lo); t = t < 0 ? 0 : t > 1 ? 1 : t; t = t * t * (3 - 2 * t);
    c.setXYZ(i, a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  }
  return g;
}

/** A flat polygon fan in the XZ plane (normal +Y). pts = [[x,z], ...] */
export function fanXZ(pts) {
  const tris = [];
  for (let i = 1; i < pts.length - 1; i++) {
    tris.push(pts[0][0], 0, pts[0][1], pts[i][0], 0, pts[i][1], pts[i + 1][0], 0, pts[i + 1][1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
  g.computeVertexNormals();
  return g;
}

// ── pooled instanced mesh ────────────────────────────────────────────────────
export class Pool {
  /** opts: { cast, receive, colors, attrs: { name: size }, name } */
  constructor(scene, geo, mat, count, opts = {}) {
    // three only multiplies instanceColor into the fragment when USE_COLOR is
    // defined (material.vertexColors === true), and USE_COLOR needs a real
    // `color` attribute or every vertex reads black. Primitive geometries
    // (glow quads, shadow decals) have neither — give them a white one so
    // pool.tint() actually does something.
    if (opts.colors !== false && !geo.attributes.color) {
      const n = geo.attributes.position.count;
      const white = new Float32Array(n * 3); white.fill(1);
      geo.setAttribute('color', new THREE.BufferAttribute(white, 3));
      if (mat && mat.vertexColors === false) mat.vertexColors = true;
    }
    if (opts.attrs) {
      for (const [name, size] of Object.entries(opts.attrs)) {
        const a = new THREE.InstancedBufferAttribute(new Float32Array(count * size), size);
        a.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute(name, a);
      }
    }
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.name = opts.name || 'creature';
    m.frustumCulled = false;                 // instances are spread across the island
    m.castShadow = opts.cast !== false;
    m.receiveShadow = !!opts.receive;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (opts.colors !== false) {
      const arr = new Float32Array(count * 3); arr.fill(1);
      m.instanceColor = new THREE.InstancedBufferAttribute(arr, 3);
      m.instanceColor.setUsage(THREE.StaticDrawUsage);
    }
    scene.add(m);
    this.mesh = m; this.geo = geo; this.mat = mat; this.count = count;
    this._d = new THREE.Object3D(); this._d.rotation.order = 'YXZ';
    for (let i = 0; i < count; i++) this.hide(i);
  }
  /** yaw first, then pitch, then roll (YXZ) */
  place(i, x, y, z, yaw = 0, sx = 1, sy = sx, sz = sx, pitch = 0, roll = 0) {
    const d = this._d;
    d.position.set(x, y, z); d.rotation.set(pitch, yaw, roll); d.scale.set(sx, sy, sz);
    d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix);
  }
  hide(i) { const d = this._d; d.position.set(0, -999, 0); d.rotation.set(0, 0, 0); d.scale.set(0, 0, 0); d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix); }
  /** billboard toward the camera (glow sprites) */
  billboard(i, x, y, z, s, camQuat) {
    _m4.compose(_v3.set(x, y, z), camQuat, _sc.set(s, s, s));
    this.mesh.setMatrixAt(i, _m4);
  }
  tint(i, hex) { _col.setHex(hex); const a = this.mesh.instanceColor.array; a[i * 3] = _col.r; a[i * 3 + 1] = _col.g; a[i * 3 + 2] = _col.b; }
  tintRGB(i, r, g, b) { const a = this.mesh.instanceColor.array; a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b; }
  attr(name) { return this.geo.attributes[name]; }
  setAttr(name, i, v) { this.geo.attributes[name].array[i] = v; this.geo.attributes[name].needsUpdate = true; }
  flushColors() { if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  flush() { this.mesh.instanceMatrix.needsUpdate = true; }
  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }
}

// ── animation LOD (Contract J frame-rate pass) ──────────────────────────────
// The walkers (beetles, snails, sheep) each ran a full Contract-A ground.step
// every frame wherever they were. A walker the lens cannot see now steps at
// offDt, one beyond `near` of the lens at farDt, anything within `keep` of the
// visitor every frame; a skipped walker banks its dt and integrates it all at
// its next step (its pose and shadow simply hold). creatures.js calls
// LOD.begin(ctx) once a frame. Off under ?shot (the harness teleports the lens
// each view, and its frames stay identical to the full-rate simulation).
const _lodF = new THREE.Frustum(), _lodM = new THREE.Matrix4(), _lodS = new THREE.Sphere();
export const LOD = {
  near: 60, keep: 15, farDt: 1 / 30, offDt: 1 / 10,
  cx: 0, cz: 0, px: 1e9, pz: 1e9, off: false,
  begin(ctx) {
    this.off = !!ctx.shot;
    const c = ctx.camera;
    _lodM.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    _lodF.setFromProjectionMatrix(_lodM);
    this.cx = c.position.x; this.cz = c.position.z;
    const p = ctx.systems.player?.position;
    this.px = p ? p.x : 1e9; this.pz = p ? p.z : 1e9;
  },
  interval(x, y, z, r) {
    if (this.off) return 0;
    const dpx = x - this.px, dpz = z - this.pz;
    if (dpx * dpx + dpz * dpz < this.keep * this.keep) return 0;
    _lodS.center.set(x, y, z); _lodS.radius = r;
    if (!_lodF.intersectsSphere(_lodS)) return this.offDt;
    const dx = x - this.cx, dz = z - this.cz, far = this.near + r;
    return dx * dx + dz * dz > far * far ? this.farDt : 0;
  },
  /** Bank `dt` on walker `e`: the dt to integrate now, or 0 = skip this frame. */
  step(e, dt, x, y, z, r) {
    const iv = this.interval(x, y, z, r);
    if (e._lod === undefined) e._lod = iv > 0 ? (Math.abs(x * 7.31 + z * 3.17) % 1) * iv : 0;   // staggered start
    e._lod += dt;
    if (iv > 0 && e._lod < iv - 1e-6) return 0;
    const d = e._lod > 0.25 ? 0.25 : e._lod;
    e._lod = 0;
    return d;
  },
};

// ── wing-flap vertex hook (butterflies, birds) ───────────────────────────────
// Rotates tagged vertices about the body's Z axis. aTag (per vertex) picks the
// side, aPhase/aRate (per instance) desynchronise the flock.
export const flapClock = { value: 0 };

// opts:
//   key       distinct program-cache key — MUST differ whenever the injected
//             source differs, or three hands one flock the other's program.
//   fold      adds aFold (per instance, 0..1): 1 = wings held straight up, the
//             pose a landed butterfly sits in. Flapping fades out as it rises.
//   dihedral  resting wing angle in radians — the flap sweeps AROUND it instead
//             of through zero, so a wing is never coplanar with the body and a
//             still frame never catches the swarm as flat paddles. 0.52 rad per
//             wing = a 120° V, which is what makes two thin sheets read as a
//             butterfly instead of a dropped sweet wrapper.
//   bodyLift  0..1 — mixes body vertices (aTag == 0) toward bodyColor AFTER the
//             instance tint, so a hot-pink butterfly still has a cream body
//             instead of a dark sliver (instanceColor can only ever darken).
//   backShade 0..1 — multiplier applied to BACK faces only (gl_FrontFacing).
//             A wing sheet has no thickness, so without this the underside is
//             lit exactly like the top and the V has no volume at all.
export function applyFlap(mat, amp = 1.0, opts = {}) {
  const uAmp = { value: amp };
  const lift = opts.bodyLift || 0;
  const uBodyCol = { value: new THREE.Color(opts.bodyColor ?? 0xfff3da) };
  const uBodyLift = { value: lift };
  const fold = !!opts.fold;
  mat.userData.uAmp = uAmp;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCTime = flapClock;
    shader.uniforms.uFlapAmp = uAmp;
    if (lift) { shader.uniforms.uBodyCol = uBodyCol; shader.uniforms.uBodyLift = uBodyLift; }
    let vs = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uCTime;
uniform float uFlapAmp;
attribute float aTag;
attribute float aPhase;
attribute float aRate;
attribute float aAmp;
${fold ? 'attribute float aFold;' : ''}
${lift ? 'uniform vec3 uBodyCol;\nuniform float uBodyLift;' : ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float flapW = uFlapAmp * aAmp * sin( uCTime * aRate + aPhase ) + ${(opts.dihedral ?? 0).toFixed(3)};
${fold
  ? 'float flapA = aTag * ( flapW * ( 1.0 - aFold ) + aFold * 1.48 );'
  : 'float flapA = aTag * flapW;'}
float flapC = cos( flapA ), flapS = sin( flapA );
objectNormal.xy = vec2( objectNormal.x * flapC - objectNormal.y * flapS, objectNormal.x * flapS + objectNormal.y * flapC );`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed.xy = vec2( transformed.x * flapC - transformed.y * flapS, transformed.x * flapS + transformed.y * flapC );`);
    if (lift) vs = vs.replace('#include <color_vertex>', `#include <color_vertex>
#if defined( USE_COLOR )
	vColor = mix( vColor, uBodyCol, uBodyLift * ( 1.0 - step( 0.5, abs( aTag ) ) ) );
#endif`);
    shader.vertexShader = vs;
    if (opts.backShade) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
        `#include <color_fragment>\n\tif ( ! gl_FrontFacing ) diffuseColor.rgb *= ${opts.backShade.toFixed(3)};`);
    }
    // A wing sheet is one polygon: three flips the normal on back faces, so the
    // underside of a wing points AWAY from the sun and renders as a black
    // splinter — the exact read that made the swarm look like dropped foil.
    // Tinting the material's emissive by the wing colour gives every face a
    // floor of its own hue, so both faces of the V are always lit.
    if (opts.emissiveTint) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor;');
    }
  };
  const key = opts.key || 'candy-flap';
  mat.customProgramCacheKey = () => key;
  return mat;
}

// ── per-instance emissive tint (glowing nerds) ───────────────────────────────
export function emissiveByInstance(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor;');
  };
  mat.customProgramCacheKey = () => 'candy-emissive-inst';
  return mat;
}

// ── soft round glow sprite texture ───────────────────────────────────────────
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rad.addColorStop(0.0, 'rgba(255,255,255,1)');
  rad.addColorStop(0.25, 'rgba(255,255,255,0.72)');
  rad.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  rad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = rad; g.fillRect(0, 0, s, s);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

// A firefly is a HOT POINT inside a soft halo. The point used to be a real
// emissive polyhedron, which at the game camera is an 8-px hard-edged diamond —
// the single thing that made the night swarm read as confetti rather than
// light. This is the same radial falloff as glowTexture but with the energy
// pulled into the middle: a ~2 px white core, everything else fading to zero
// alpha well before the quad's edge, so there is never a visible sprite border.
let _coreTex = null;
export function coreTexture() {
  if (_coreTex) return _coreTex;
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rad.addColorStop(0.00, 'rgba(255,255,255,1)');
  rad.addColorStop(0.14, 'rgba(255,255,255,0.96)');
  rad.addColorStop(0.30, 'rgba(255,255,255,0.46)');
  rad.addColorStop(0.58, 'rgba(255,255,255,0.11)');
  rad.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = rad; g.fillRect(0, 0, s, s);
  _coreTex = new THREE.CanvasTexture(c);
  _coreTex.colorSpace = THREE.SRGBColorSpace;
  return _coreTex;
}

// ── expanding water ring (fish entry / exit) ─────────────────────────────────
let _ringTex = null;
export function ringTexture() {
  if (_ringTex) return _ringTex;
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rad.addColorStop(0.00, 'rgba(255,255,255,0)');
  rad.addColorStop(0.46, 'rgba(255,255,255,0.05)');
  rad.addColorStop(0.68, 'rgba(255,255,255,0.85)');
  rad.addColorStop(0.80, 'rgba(255,255,255,0.34)');
  rad.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = rad; g.fillRect(0, 0, s, s);
  _ringTex = new THREE.CanvasTexture(c);
  _ringTex.colorSpace = THREE.SRGBColorSpace;
  return _ringTex;
}
/** Flat additive ring decal; fade a ripple by tinting its instance to black. */
// forceSinglePass (Contract J, here and on the glow / decal materials below):
// three r170 draws a transparent DoubleSide material TWICE a frame (back faces,
// then front faces, re-evaluating the program each time). Additive blending is
// order-free and a flat decal only ever shows one side, so one pass is the same
// picture for half the draws.
export function rippleMaterial(opacity = 0.8) {
  return new THREE.MeshBasicMaterial({
    map: ringTexture(), transparent: true, opacity, vertexColors: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    forceSinglePass: true,
  });
}

/** Additive glow-sprite material (unlit by design — halos, not shaded bodies). */
// vertexColors MUST be on: three gates `diffuseColor *= vColor` on USE_COLOR,
// so without it every pool.tint() on a halo silently did nothing and all the
// night swarms glowed plain white. Pool supplies the white colour attribute.
export function glowMaterial(opacity = 0.85, map = null) {
  return new THREE.MeshBasicMaterial({
    map: map || glowTexture(), transparent: true, opacity, vertexColors: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    forceSinglePass: true,
  });
}

// ── soft contact-shadow blob (flat ground decal) ─────────────────────────────
let _blobTex = null;
export function blobTexture() {
  if (_blobTex) return _blobTex;
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rad.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  rad.addColorStop(0.45, 'rgba(255,255,255,0.5)');
  rad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = rad; g.fillRect(0, 0, s, s);
  _blobTex = new THREE.CanvasTexture(c);
  _blobTex.colorSpace = THREE.SRGBColorSpace;
  return _blobTex;
}

/** Ground decal material — alpha from blobTexture, colour from instanceColor. */
export function decalMaterial(opacity = 0.3) {
  return new THREE.MeshBasicMaterial({
    map: blobTexture(), transparent: true, opacity, vertexColors: true,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true,
  });
}

// ── shared contact shadows ───────────────────────────────────────────────────
// A small creature with no shadow does not stand on the ground — it floats over
// a picture of ground. Every species gets a blob, and they ALL live in one
// instanced pool (one draw call for the whole island's wildlife) handed out in
// slices: `field.claim(n)` → a little handle with set/hide in local indices.
export class ShadowField {
  constructor(scene, capacity, opts = {}) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.pool = new Pool(scene, geo, decalMaterial(opts.opacity ?? 0.52), capacity, { name: 'creature-shadows', cast: false });
    this.pool.mesh.renderOrder = 1;
    this.pool.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.cap = capacity; this.used = 0;
    this._lo = new THREE.Color(opts.lo ?? 0x4a2338);    // hard contact, right under the feet
    this._hi = new THREE.Color(opts.hi ?? 0xc6a3b2);    // 3 u up — wide and washed out
    this._c = new THREE.Color();
  }
  claim(n) {
    const base = this.used;
    const got = Math.min(this.cap, base + n) - base;
    this.used = base + got;
    const F = this;
    return {
      count: got,
      /** x,y,z = the point ON the ground · r = blob radius · h = 0 (touching) .. 1 (high) */
      set(i, x, y, z, r, h = 0, yaw = 0) {
        if (i < 0 || i >= got) return;
        const hh = h < 0 ? 0 : h > 1 ? 1 : h;
        const s = r * (1.0 + hh * 0.7);
        F.pool.place(base + i, x, y + 0.11, z, yaw, s, s, s);
        F._c.copy(F._lo).lerp(F._hi, hh);
        F.pool.tintRGB(base + i, F._c.r, F._c.g, F._c.b);
      },
      hide(i) { if (i >= 0 && i < got) F.pool.hide(base + i); },
      hideAll() { for (let i = 0; i < got; i++) F.pool.hide(base + i); },
    };
  }
  flush() { this.pool.flush(); this.pool.flushColors(); }
}

// ── post-tint part colours (gloss highlights, eyes) ──────────────────────────
// instanceColor can only ever DARKEN a vertex colour, so on a tinted creature a
// white gloss streak becomes "the hue, slightly brighter" and a black eye dot
// becomes "the hue, slightly darker". This mixes tagged vertices toward fixed
// colours AFTER the instance tint: aTag >= 1 → hiColor (highlight), aTag <= -1
// → loColor (eye/pupil). Vertices with aTag 0 keep their tint.
export function applyTagShade(mat, opts = {}) {
  const uHi = { value: new THREE.Color(opts.hiColor ?? 0xfffdf6) };
  const uLo = { value: new THREE.Color(opts.loColor ?? 0x241a22) };
  const uK = { value: new THREE.Vector2(opts.hi ?? 0.92, opts.lo ?? 0.95) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTagHi = uHi; shader.uniforms.uTagLo = uLo; shader.uniforms.uTagK = uK;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aTag;
uniform vec3 uTagHi;
uniform vec3 uTagLo;
uniform vec2 uTagK;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
#if defined( USE_COLOR )
	vColor = mix( vColor, uTagHi, uTagK.x * step( 0.5, aTag ) );
	vColor = mix( vColor, uTagLo, uTagK.y * step( 0.5, -aTag ) );
#endif`);
  };
  mat.customProgramCacheKey = () => opts.key || 'candy-tagshade';
  return mat;
}

// ── building footprints, for anything that flies ─────────────────────────────
// Circumscribed circles around every enterable room any system has published.
// Deliberately generous: a bird clipping through a gingerbread roof is a much
// worse bug than a bird gaining three units of altitude it did not need.
export function buildingRects(ctx) {
  const out = [];
  const add = (list) => {
    if (!Array.isArray(list)) return;
    for (const b of list) {
      if (!b || typeof b.x !== 'number' || typeof b.z !== 'number') continue;
      const w = b.w ?? (b.radius ? b.radius * 2 : 0);
      const d = b.d ?? (b.radius ? b.radius * 2 : 0);
      const rad = Math.hypot(w, d) * 0.5;
      if (!(rad > 0.5)) continue;
      out.push({ x: b.x, z: b.z, rad: rad + 1.5 });
    }
  };
  const S = ctx.systems || {};
  add(S.candyArchitecture?.interiors);
  add(S.escape?.api?.interiors);
  add(S.escape?.interiors);
  add(S.catArchitecture?.interiors);
  return out;
}

// ── safe UI calls ────────────────────────────────────────────────────────────
// The UI system can fail to create (it is another builder's file). When it does
// ctx.systems.ui exists but has no methods, and an unguarded `ui?.toast()`
// throws out of the creature update loop and freezes the whole species.
export const uiToast = (ctx, text) => { const u = ctx.systems?.ui; if (typeof u?.toast === 'function') u.toast(text); };
export const uiSay = (ctx, text, opts) => { const u = ctx.systems?.ui; if (typeof u?.say === 'function') u.say(text, opts); };

// ── steering helpers ─────────────────────────────────────────────────────────
export const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
export const turnToward = (cur, want, maxStep) => { const d = wrapAngle(want - cur); return cur + Math.max(-maxStep, Math.min(maxStep, d)); };

/**
 * A point on the shoulder of the nearest path. Candyland's vegetation is very
 * dense, so the licorice paths are the only reliable sightlines — creatures
 * placed on their shoulders are the ones players actually meet.
 */
export function pathShoulder(world, x, z, island, offMin, offMax, rnd) {
  const n = world.nearestPath(x, z, island);
  if (!n.path) return null;
  const p = world.pointOnPolyline(n.path.points, n.t);
  const p2 = world.pointOnPolyline(n.path.points, Math.min(1, n.t + 0.02));
  const dx = p2.x - p.x, dz = p2.z - p.z, L = Math.hypot(dx, dz) || 1;
  const off = (offMin + (offMax - offMin) * rnd()) * (rnd() < 0.5 ? -1 : 1);
  return { x: p.x - (dz / L) * off, z: p.z + (dx / L) * off };
}

// ── obstacle lookup: nothing is skewered by a pole ───────────────────────────
// Every builder registers its props in ctx.colliders (circles, and oriented
// boxes for walls). Creatures used to ignore them entirely, so beetles walked
// out of candy-cane sticks and butterflies landed impaled on gumdrops. One
// uniform grid, rebuilt only when the collider list grows, makes the query O(1)
// for ~200 creatures a frame.
export class ColliderGrid {
  constructor(ctx, cell = 8, margin = 2.5) {
    this.ctx = ctx; this.cell = cell; this.margin = margin;
    this.map = new Map(); this.n = -1;
  }
  rebuild() {
    const list = this.ctx.colliders || [];
    this.map.clear(); this.n = list.length;
    const C = this.cell;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c || typeof c.x !== 'number' || typeof c.z !== 'number') continue;
      const r = c.box ? Math.hypot(c.w || 0, c.d || 0) * 0.5 : (c.r || 0);
      if (!(r > 0.2)) continue;
      const e = { x: c.x, z: c.z, r };
      const R = r + this.margin;
      const x0 = Math.floor((c.x - R) / C), x1 = Math.floor((c.x + R) / C);
      const z0 = Math.floor((c.z - R) / C), z1 = Math.floor((c.z + R) / C);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
        const k = gx * 4096 + gz;
        let a = this.map.get(k); if (!a) this.map.set(k, a = []);
        a.push(e);
      }
    }
  }
  sync() { const l = this.ctx.colliders; if (l && l.length !== this.n) this.rebuild(); }
  /** Is (x,z) inside a registered prop, grown by pad (pad ≤ margin)? */
  hit(x, z, pad = 0) {
    const a = this.map.get(Math.floor(x / this.cell) * 4096 + Math.floor(z / this.cell));
    if (!a) return false;
    for (let i = 0; i < a.length; i++) {
      const c = a[i], dx = x - c.x, dz = z - c.z, rr = c.r + pad;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }
  /** Cost of a straight flight line: how much solid stuff it grazes. */
  lineCost(x0, z0, x1, z1, pad = 2.4, steps = 24) {
    let n = 0;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      if (this.hit(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, pad)) n++;
    }
    return n;
  }
}
/** Set by creatures.js once the whole island's props have registered. */
export const OBSTACLES = { grid: null };
/** Clear of every registered prop? (true before the grid exists) */
export function clearOfProps(x, z, pad = 0.35) {
  const g = OBSTACLES.grid;
  return !g || !g.hit(x, z, pad);
}
/** Largest loop radius around (x,z) whose whole ring misses every prop. */
export function clearRadius(x, z, want, min = 0.7, squash = 1) {
  let rr = want;
  while (rr > min) {
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) {
      const a = (k / 8) * TAU;
      ok = clearOfProps(x + Math.cos(a) * rr, z + Math.sin(a) * rr * squash, 0.55);
    }
    if (ok) return rr;
    rr -= 0.3;
  }
  return min;
}

/** Is (x,z) somewhere a small land critter is happy to stand? */
export function walkable(world, x, z, riverPad = 2.2, propPad = 0.3) {
  if (world.height(x, z) < 0.9) return false;
  if (world.riverDist(x, z) < world.RIVER.width * 0.5 + riverPad) return false;
  if (propPad >= 0 && !clearOfProps(x, z, propPad)) return false;
  return true;
}

// ── CONTRACT A — every walker stands on the ground the visitor stands on ─────
// WAVE 3: sheep, snails, beetles and ants used to read world.height (terrain
// only) and dodge props with the coarse ColliderGrid above, which turned every
// box into its circumscribed circle and knew nothing about benches, logs or
// crates. They now ask the ground core the player system owns:
//   player.groundInfo(x, z, out).h  — terrain, a walkable deck, or the TOP of a
//                                     LOW prop (≤ 1.6 u: benches, logs, crates)
//   player.pushOut(x, z, r, out)    — the body circle resolved against every
//                                     SOLID collider (circles + oriented boxes)
// both through the player's spatial hash, allocation-free (we pass `out`).
// If the player system is missing or broken the walkers fall back to terrain
// height and to REFUSING a step into a known prop, so nothing breaks.
//
// A creature body is one reported circle at its pivot plus optional forward /
// backward PROBES (a sheep is a long animal: a single circle big enough to
// cover its nose would also keep it a metre off every fence it walks past).
// All radii and offsets are in units of the creature's own scale:
//   body = { r, probes: [[forwardOffset, radius], ...] }
// Probes are resolved first and their push moves the whole animal; the pivot
// circle is resolved LAST, so the circle reported by debugPositions() is the
// one guaranteed clear.
export const HIT = 1, WET = 2;
const DYN_MAX = 48;

export class Ground {
  constructor(ctx, world) {
    this.ctx = ctx; this.world = world;
    this.p = null; this.live = false;
    this.g = { h: 0, deck: false, water: 0, limit: 0, floor: 0, prop: null, top: 0, base: 0 };
    this.q = { x: 0, z: 0, hit: false };
    this._dq = { x: 0, z: 0 };
    this.riverHalf = (world.RIVER?.width ?? 0) * 0.5;
    this.stats = { steps: 0, hits: 0, wet: 0, onProp: 0, bumped: 0 };
    // moving bodies no walker may pass through: the visitor + Sour Patch Kids
    this.dyn = new Float64Array(DYN_MAX * 3); this.nDyn = 0;
  }
  /**
   * Once per frame: the moving bodies walkers must not pass through — the
   * visitor (unless riding a vehicle) and every visible Sour Patch Kid on
   * Candyland. Read defensively; either list may be missing.
   */
  bindDynamic(ctx) {
    let n = 0; const D = this.dyn;
    const pl = ctx.systems?.player, pp = pl?.position;
    if (pp && !pl.onVehicle && pp.x < 40) { D[0] = pp.x; D[1] = pp.z; D[2] = (typeof pl.radius === 'number' ? pl.radius : 0.36) + 0.04; n = 1; }
    const kids = ctx.systems?.sourPatch?.kids;
    if (Array.isArray(kids)) {
      for (let i = 0; i < kids.length && n < DYN_MAX; i++) {
        const k = kids[i];
        if (!k || typeof k.x !== 'number' || !(k.vis > 0.4) || (k.air || 0) > 0.6) continue;
        D[n * 3] = k.x; D[n * 3 + 1] = k.z; D[n * 3 + 2] = (typeof k.r === 'number' ? k.r : 0.5); n++;
      }
    }
    this.nDyn = n;
  }
  /** Shift (x,z) so a circle of radius rr there clears every dynamic body; returns the shift. */
  _dynPush(x, z, rr, out) {
    let dx = 0, dz = 0;
    const D = this.dyn;
    for (let j = 0; j < this.nDyn; j++) {
      const ox = x + dx - D[j * 3], oz = z + dz - D[j * 3 + 1], min = D[j * 3 + 2] + rr;
      const d2 = ox * ox + oz * oz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-4) { dx += min; continue; }
      const k = (min - d) / d; dx += ox * k; dz += oz * k;
    }
    out.x = dx; out.z = dz;
    return out;
  }
  /** Once per frame: pick up (or lose) the player's Contract-A API. */
  bind() {
    const p = this.ctx.systems?.player;
    this.live = !!p && typeof p.groundInfo === 'function' && typeof p.pushOut === 'function' && !this.broken;
    this.p = this.live ? p : null;
  }
  /** Where feet rest at (x,z). Returns a shared object — copy what you need. */
  info(x, z) {
    const g = this.g;
    if (this.live) {
      try { this.p.groundInfo(x, z, g); if (g.h === g.h) return g; }
      catch (err) { this.broken = true; this.live = false; console.error('[candyCreatures] player.groundInfo failed; falling back to terrain', err); }
    }
    const h = this.world.height(x, z);
    g.h = h; g.base = h; g.water = 0; g.prop = null; g.deck = false; g.top = h; g.floor = h;
    return g;
  }
  height(x, z) { return this.info(x, z).h; }
  /** Circle (x,z,r) resolved against SOLID props; (px,pz) = where it stood. */
  push(x, z, r, px, pz) {
    const q = this.q;
    if (this.live) {
      try { this.p.pushOut(x, z, r, q); if (q.x === q.x && q.z === q.z) return q; }
      catch (err) { this.broken = true; this.live = false; console.error('[candyCreatures] player.pushOut failed; falling back to the prop grid', err); }
    }
    const grid = OBSTACLES.grid;
    const hit = !!grid && grid.hit(x, z, Math.min(r * 0.5, grid.margin));
    q.x = hit ? px : x; q.z = hit ? pz : z; q.hit = hit;
    return q;
  }
  /** Solid, dry land: not the sea, not the Chocolate Lake, not the syrup river. */
  dry(x, z, g, riverPad) {
    if (riverPad === Infinity) return true;                  // rail-bound walkers (ants)
    if (g.base < 0.9 && !g.deck) return false;
    if (g.water > 0 && g.water - g.h > 0.05) return false;
    return this.world.riverDist(x, z) >= this.riverHalf + riverPad;
  }
  /**
   * One walker, one frame. (nx,nz) is where its planner wants the pivot this
   * frame — its current spot when it is standing still, so a prop that appears
   * on top of a grazing sheep still shoves it clear. Resolves the body against
   * every SOLID collider, refuses water, then sets e.y from the ground under
   * the pivot (so it walks ON a bench, a log or a crate). Writes e.x, e.z, e.y,
   * e.prop, e.r, e.yaw, e.sc, e.body. Returns 0 | HIT (a solid pushed it: its
   * planner should turn around) | WET (step refused, it stayed put).
   * riverPad = Infinity skips the dry-land test (ants on their baked trail).
   */
  step(e, nx, nz, yaw, sc, body, riverPad = 2.0) {
    const S = this.stats; S.steps++;
    let x = nx, z = nz, hit = false;
    const pr = body.probes, R = body.r * sc;
    const fs = Math.sin(yaw), fc = Math.cos(yaw);
    // moving bodies first (the visitor, the kids): the walker is shoved aside
    // like anything else he bumps into. Solids are resolved AFTER this, so a
    // wall always wins over the visitor.
    if (this.nDyn) {
      const q = this._dq;
      let bumped = false;
      if (pr) for (let k = 0; k < pr.length; k++) {
        const off = pr[k][0] * sc;
        this._dynPush(x + fs * off, z + fc * off, pr[k][1] * sc, q);
        if (q.x || q.z) { x += q.x; z += q.z; bumped = true; }
      }
      this._dynPush(x, z, R, q);
      if (q.x || q.z) { x += q.x; z += q.z; bumped = true; }
      if (bumped) { hit = true; S.bumped++; }
    }
    // probes, then the pivot; up to two more passes, each only when the one
    // before moved the body (the pivot's push can shove a nose probe back into
    // a fence post — two passes left a sheep's nose 0.19 u inside a trunk).
    // "Moved" means > 1 mm: a circle left exactly touching a face is not a hit.
    for (let pass = 0; pass < 3; pass++) {
      let moved = 0;
      if (pr) for (let k = 0; k < pr.length; k++) {
        const off = pr[k][0] * sc;
        const px = x + fs * off, pz = z + fc * off;
        const q = this.push(px, pz, pr[k][1] * sc, e.x + fs * off, e.z + fc * off);
        if (q.hit) { const dx = q.x - px, dz = q.z - pz; x += dx; z += dz; moved += Math.abs(dx) + Math.abs(dz); }
      }
      const q = this.push(x, z, R, e.x, e.z);
      if (q.hit) { moved += Math.abs(q.x - x) + Math.abs(q.z - z); x = q.x; z = q.z; }
      if (moved > 1e-3) hit = true;
      if (!(moved > 1e-3) || !pr) break;
    }
    let g = this.info(x, z), res = hit ? HIT : 0;
    if (!this.dry(x, z, g, riverPad)) { x = e.x; z = e.z; g = this.info(x, z); res |= WET; S.wet++; }
    if (hit) S.hits++;
    e.x = x; e.z = z; e.y = g.h; e.prop = g.prop;
    if (g.prop) S.onProp++;
    e.r = R; e.yaw = yaw; e.sc = sc; e.body = body;
    return res;
  }
}

/** Debug circles of one walker: the pivot circle plus its probes (world space). */
export function bodyCircles(e) {
  const out = [];
  const b = e.body, sc = e.sc ?? 1, yaw = e.yaw ?? 0;
  if (!b || !b.probes) return out;
  const fs = Math.sin(yaw), fc = Math.cos(yaw);
  for (const [off, rr] of b.probes) out.push({ x: e.x + fs * off * sc, z: e.z + fc * off * sc, r: rr * sc });
  return out;
}
