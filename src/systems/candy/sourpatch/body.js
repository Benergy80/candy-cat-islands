// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KID — shared body rig.
//
// Every kid is drawn from 11 InstancedMeshes (head, torso+neck, limb, eye,
// pupil, eye-glow, day-grin, night-grin, lid, contact-shadow blob, night ground
// pool) so 24 gummy children cost ~11 draw calls + 3 shadow draws instead of
// 300. All animation is per-instance matrix writes; nothing is allocated.
//
// THE SILHOUETTE (critique r3: "from behind the head is a featureless ball")
// A Sour Patch Kid is not a ball. Every mass here is a SUPERQUADRIC bent out of
// a cheap UV sphere — same triangle count, squared-off profile: a slightly
// flat-topped head that is wider at the crown than the chin, two little corner
// nubs where a head that shape has corners, a blocky torso, a pinched neck, and
// four stubby tapered nubs splayed out from it. The face is untouched: it still
// hangs off the head matrix at exactly the same local coordinates.
//
// THE GUMMY (critique r3: "opaque matte plastic with white splotch decals")
// One MeshStandardMaterial at roughness 0.30 (one crisp specular), plus in the
// fragment shader:
//   · FAKE SUBSURFACE — a fresnel rim in the kid's OWN hue, driven much harder
//     when the sun is BEHIND them, over a base hue-glow. A gummy bear lit from
//     behind is a lantern.
//   · LIGHT THROUGH THE THIN BITS — a baked per-vertex `aThin` thickness (1 at
//     the nub tips and head corners, ~0.1 in the middle of the skull) gates a
//     back-lit transmission term, so the limbs and ear corners light up like a
//     boiled sweet held against a window.
//   · THE CRUST — two octaves of object-space value noise (never swims as they
//     walk), per-instance offset by a static aSeed, thresholded HIGH into fine
//     grains that cut roughness and carry white emissive.
//   · CRYSTALLINE GLINTS — grains flash against a sharp sun half-vector term
//     and a per-grain twinkle phase, so facets catch the sun AS THE KID MOVES.
// The big twinkle the player actually sees at 70 px is still 4-point sparkle
// sprites fired from the shared particle pool (sourpatch.js glint()) — zero
// extra draw calls, real star shape, aimed at whatever faces the sun.
//
// Local space of a kid: origin at the feet, +Y up, +Z = facing direction.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SPARK_PER_KID = 12;   // surface anchors used to aim the glints

// scratch — never allocate in the loop
const _m = new THREE.Matrix4();
const _mRoot = new THREE.Matrix4();
const _mUp = new THREE.Matrix4();
const _mHead = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _off = new THREE.Vector3();
const _c = new THREE.Color();
const _gA = new THREE.Vector3();
const _gB = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

// rotation about local X at a pivot height (used for the upper-body lean)
function pivotRotX(out, angle, py) {
  out.makeRotationX(angle);
  out.elements[13] = py - py * Math.cos(angle);
  out.elements[14] = -py * Math.sin(angle);
  return out;
}

const DAY_BODY = new THREE.Color(0xffffff);
const NIGHT_BODY = new THREE.Color(0x93a0c6);
const EYE_DAY = new THREE.Color(0xfdfbff);
const EYE_NIGHT = new THREE.Color(0x0e0912);      // a socket, not an eyeball
const PUP_DAY = new THREE.Color(0x180c18);
const PUP_NIGHT = new THREE.Color(0x25350a);
const ACID = new THREE.Color(0xb4ff3a);

// ── the sugar-crust GLSL ─────────────────────────────────────────────────────
const SUGAR_HEAD = /* glsl */`
uniform float uGummy;
uniform float uCoat;
uniform float uRim;
uniform float uGlint;
uniform float uSSS;
uniform float uTime;
uniform vec3  uSunW;
varying vec3  vSugP;
varying vec3  vSugN;
varying vec3  vSugV;
varying float vSugSeed;
varying float vSugThin;
`;

const SUGAR_FN = /* glsl */`
float spHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float spNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(mix(spHash(i), spHash(i + vec3(1,0,0)), f.x),
                    mix(spHash(i + vec3(0,1,0)), spHash(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(spHash(i + vec3(0,0,1)), spHash(i + vec3(1,0,1)), f.x),
                    mix(spHash(i + vec3(0,1,1)), spHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  return a;
}
`;

// ── the Sour Patch silhouette ────────────────────────────────────────────────
/**
 * Bend a unit-ish sphere onto a SUPERQUADRIC: `e` = 2 is the sphere it came in
 * as, 3–4 is a rounded box. `taper` widens the top (+) or the bottom (−), which
 * is the whole trapezoid read of a Sour Patch head. Costs zero triangles.
 */
function superquad(geo, hx, hy, hz, e, taper = 0, flatTop = 0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    let nx = x / l, ny = y / l, nz = z / l;
    const d = Math.pow(Math.abs(nx) ** e + Math.abs(ny) ** e + Math.abs(nz) ** e, 1 / e);
    nx /= d; ny /= d; nz /= d;
    const t = 1 + taper * ny;
    let vy = ny * hy;
    if (flatTop && vy > hy * 0.5) vy = hy * 0.5 + (vy - hy * 0.5) * (1 - flatTop);
    p.setXYZ(i, nx * hx * t, vy, nz * hz * t);
  }
  geo.computeVertexNormals();
  return geo;
}
/** Bake the per-vertex thickness the gummy shader reads (1 = thin = translucent). */
function bakeThin(geo, fn) {
  const p = geo.attributes.position, n = p.count, a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = fn(p.getX(i), p.getY(i), p.getZ(i));
  geo.setAttribute('aThin', new THREE.BufferAttribute(a, 1));
  return geo;
}
/** Non-indexed, uv-free, optionally transformed — ready for mergeGeometries. */
function prep(geo, mtx) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (mtx) g.applyMatrix4(mtx);
  for (const k of ['uv', 'uv1', 'uv2']) if (g.attributes[k]) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

export function createRig(ctx, N, rand) {
  const group = new THREE.Group();
  group.name = 'sourpatch';
  ctx.scene.add(group);

  // ── materials ──────────────────────────────────────────────────────────────
  const uGummy = { value: 0.14 };
  const uCoat = { value: 1.0 };
  const uRim = { value: 0.24 };
  const uGlint = { value: 0.3 };
  const uSSS = { value: 0.5 };
  const uTime = { value: 0 };
  const uSunW = { value: new THREE.Vector3(0.3, 0.8, 0.4) };

  // roughness 0.30: ONE crisp specular highlight is what separates wet gummy
  // from matte plastic. Any rougher and the sun smears into a dull sheen.
  const gummy = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.30, metalness: 0.0 });
  gummy.onBeforeCompile = (sh) => {
    sh.uniforms.uGummy = uGummy; sh.uniforms.uCoat = uCoat;
    sh.uniforms.uRim = uRim; sh.uniforms.uGlint = uGlint; sh.uniforms.uSunW = uSunW;
    sh.uniforms.uSSS = uSSS; sh.uniforms.uTime = uTime;

    sh.vertexShader = ['attribute float aSeed;', 'attribute float aThin;', SUGAR_HEAD, sh.vertexShader].join('\n')
      .replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        vSugP = position;
        vSugSeed = aSeed;
        vSugThin = aThin;
        #ifdef USE_INSTANCING
          vec4 spW = modelMatrix * instanceMatrix * vec4( transformed, 1.0 );
          vSugN = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal );
        #else
          vec4 spW = modelMatrix * vec4( transformed, 1.0 );
          vSugN = normalize( mat3( modelMatrix ) * objectNormal );
        #endif
        vSugV = spW.xyz - cameraPosition;
      `);

    sh.fragmentShader = [SUGAR_HEAD, SUGAR_FN, sh.fragmentShader].join('\n')
      // grains: object-space, two octaves, per-instance offset
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        vec3  spN = normalize( vSugN );
        vec3  spVd = normalize( vSugV );                                   // camera → fragment
        float spSun = clamp( dot( spN, uSunW ) * 0.5 + 0.5, 0.0, 1.0 );
        // 1 when the sun is directly BEHIND the kid from where you are standing.
        float spBack = clamp( dot( spVd, uSunW ), 0.0, 1.0 );
        // Thresholds are HIGH on purpose: a threshold near the noise mean gives
        // 50% coverage, which reads as cow-hide blotches rather than sugar. Only
        // the top ~10% of the field becomes a grain — and the field is FINE
        // (critique r3: the old 34× crust read as chipped paint at distance).
        vec3  spP = vSugP * 66.0 + vSugSeed;
        float spF = spNoise( spP ) * 0.58 + spNoise( spP * 2.1 + 3.7 ) * 0.42;
        float spThr = mix( 0.780, 0.694, spSun );
        float spCrumb = smoothstep( spThr, spThr + 0.030, spF );
        // a sparse scatter of bigger crystals so the crust still reads at 60 px
        float spBig = spNoise( vSugP * 27.0 + vSugSeed * 2.7 );
        spCrumb = max( spCrumb, smoothstep( 0.832, 0.874, spBig ) );
        spCrumb *= uCoat;
        vec3 spWhite = mix( vec3( 0.90, 0.93, 1.00 ), vec3( 1.0 ), spSun );
        diffuseColor.rgb = mix( diffuseColor.rgb, spWhite, spCrumb * ( 0.42 + 0.34 * spSun ) );
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.10, spCrumb * 0.85 );
      `)
      .replace('#include <emissivemap_fragment>', /* glsl */`
        #include <emissivemap_fragment>
        // ── fake subsurface ────────────────────────────────────────────────
        // rim in the kid's own hue, hard when the sun is behind them, plus a
        // transmission term gated by the baked thickness so the nub limbs and
        // the head corners glow through and the middle of the skull does not.
        float spFres = pow( 1.0 - clamp( dot( spN, -spVd ), 0.0, 1.0 ), 2.2 );
        float spThru = pow( spBack, 2.2 ) * vSugThin;
        totalEmissiveRadiance += vColor * ( uGummy
                                          + uRim * spFres * ( 0.55 + 1.05 * spBack )
                                          + uSSS * ( 0.26 * vSugThin + 1.35 * spThru ) );
        // ── crystalline glints ─────────────────────────────────────────────
        // Each grain is a little facet: it fires against a sharp half-vector
        // term (so it catches the sun as the kid turns) and carries its own
        // twinkle phase (so the crust shimmers while they walk).
        vec3  spHv = normalize( uSunW - spVd );
        float spSpec = pow( max( dot( spN, spHv ), 0.0 ), 30.0 );
        float spPh = fract( spNoise( vSugP * 9.0 + vSugSeed ) * 9.0 + uTime * 0.6 );
        float spTwk = smoothstep( 0.70, 1.0, sin( spPh * 6.2831853 ) * 0.5 + 0.5 );
        totalEmissiveRadiance += vec3( 1.0 ) * uGlint * spCrumb
                               * ( 0.30 + 3.2 * spSpec ) * ( 0.30 + 1.05 * spTwk );
      `);
  };
  gummy.customProgramCacheKey = () => 'sp-gummy-crust';

  const eyeMat = new THREE.MeshStandardMaterial({ color: EYE_DAY.clone(), roughness: 0.22, metalness: 0.0 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: PUP_DAY.clone(), roughness: 0.4, metalness: 0.0, emissive: ACID.clone(), emissiveIntensity: 0 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x140b16, roughness: 0.6, metalness: 0.0 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x2c0b18, roughness: 0.55, metalness: 0.0 });
  const grinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.0, flatShading: true });

  // ── ground decals: contact shadow + night glow pool ────────────────────────
  // A 64 px alphaMap with linear gradient stops is what made these read as flat
  // discs: the ramp is piecewise-linear, so its derivative jumps at every stop
  // and again at the rim, and the eye turns that kink into an edge (worse under
  // additive blending on dark ground). Replaced with a procedural kernel in the
  // fragment shader: value AND slope both reach exactly zero at the rim, so the
  // decal has no boundary at all — no texture, no filtering, no banding.
  //   pool: s²(0.45+0.55s)   broad, so two kids blend into one shared pool
  //   blob: s²(0.35+0.65s²)  tighter core — a contact shadow, not a haze
  const softDecal = (mat, key, kernel) => {
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = ['varying vec2 vDecalP;', sh.vertexShader].join('\n')
        .replace('#include <begin_vertex>', /* glsl */`
          #include <begin_vertex>
          vDecalP = position.xy * 2.0;   // unit disc in LOCAL space (squash-aware)
        `);
      sh.fragmentShader = ['varying vec2 vDecalP;', sh.fragmentShader].join('\n')
        .replace('#include <alphamap_fragment>', /* glsl */`
          float dcD2 = dot( vDecalP, vDecalP );
          float s = max( 0.0, 1.0 - dcD2 );
          diffuseColor.a *= ${kernel};
        `);
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  };
  // Decals, not lit geometry: an unlit mask is exactly what a contact shadow is.
  const blobMat = softDecal(new THREE.MeshBasicMaterial({
    color: 0x2a0f22, transparent: true, opacity: 0.5,
    depthWrite: false, side: THREE.DoubleSide, fog: true,
  }), 'sp-decal-blob', 's * s * ( 0.35 + 0.65 * s * s )');
  const poolMat = softDecal(new THREE.MeshBasicMaterial({
    color: 0x8dff1f, transparent: true, opacity: 0.0,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
  }), 'sp-decal-pool', 's * s * ( 0.45 + 0.55 * s )');
  // THE EYE GLOW (critique r3: "night eyes must be the brightest pixels on the
  // model at distance"). A camera-facing additive halo around each pupil, tight
  // enough that the socket stays black around it — the pinprick pupil is still
  // the core, this is the bloom that survives to 70 px. No fog: at night a kid
  // thirty metres out must still have two burning dots.
  const glowMat = softDecal(new THREE.MeshBasicMaterial({
    color: 0xcaff62, transparent: true, opacity: 0.0,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  }), 'sp-decal-glow', 's * s * ( 0.22 + 0.78 * s * s )');

  // ── geometry (deliberately low-poly; these read at 46 units) ───────────────
  // HEAD: a flat-topped trapezoid skull, wider at the crown than at the chin,
  // with two little corner nubs — so from BEHIND it is still a Sour Patch Kid
  // and not a bowling ball. Front and side radii are held at the old sphere's
  // 0.37/0.375 so every face part still lands exactly where it did.
  const gHead = (() => {
    const skull = bakeThin(
      superquad(new THREE.SphereGeometry(1, 14, 10), 0.370, 0.345, 0.375, 3.3, 0.10, 0.35),
      (x, y) => Math.min(0.62, 0.08 + 0.42 * (Math.abs(x) / 0.40) ** 2 + 0.30 * Math.max(0, y) / 0.30),
    );
    const parts = [prep(skull)];
    for (const side of [-1, 1]) {                       // the corners of a square head
      const nub = bakeThin(new THREE.OctahedronGeometry(1, 0), () => 1.0);
      _e.set(0, 0, side * -0.34); _q.setFromEuler(_e);
      _m.compose(_p.set(side * 0.352, 0.105, -0.025), _q, _s.set(0.082, 0.120, 0.076));
      parts.push(prep(nub, _m));
    }
    return mergeGeometries(parts);
  })();
  // TORSO: a blocky little body with a pinched neck merged in (same material,
  // same transform — a neck must not cost a draw call).
  const gTorso = (() => {
    const body = bakeThin(
      superquad(new THREE.SphereGeometry(1, 11, 8), 0.290, 0.310, 0.215, 3.0, 0.05),
      (x) => 0.14 + 0.34 * (Math.abs(x) / 0.30) ** 2,
    );
    const neck = bakeThin(new THREE.CylinderGeometry(0.112, 0.158, 0.26, 7, 1, true), () => 0.55);
    _q.identity();
    _m.compose(_p.set(0, 0.27, 0.01), _q, _s.set(1, 1, 1));
    return mergeGeometries([prep(body), prep(neck, _m)]);
  })();
  // LIMBS: stubby tapered nubs — fat at the joint, rounded at the tip. Still
  // centred on the origin spanning ±0.17, so the pose maths is unchanged.
  const gLimb = (() => {
    const g = new THREE.CapsuleGeometry(0.105, 0.13, 2, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), f = 0.70 + 0.42 * (y + 0.17) / 0.34;
      p.setXYZ(i, p.getX(i) * f, y, p.getZ(i) * f);
    }
    g.computeVertexNormals();
    // a nub is thin everywhere and thinnest at the tip: this is the bit the sun
    // shines THROUGH when a kid stands between you and the light
    return bakeThin(g, (x, y) => 0.70 + 0.30 * (0.17 - y) / 0.34);
  })();
  const gEye = new THREE.SphereGeometry(0.125, 9, 7);
  const gPupil = new THREE.SphereGeometry(0.068, 6, 5);
  const gMouth = new THREE.TorusGeometry(0.095, 0.038, 5, 9, Math.PI);
  const gLid = new THREE.BoxGeometry(0.16, 0.05, 0.05);
  // 20 sides: at 14 the polygon chords cut visibly inside the falloff once the
  // pool got big. Costs 6 tris × 48 instances.
  const gDecal = new THREE.CircleGeometry(0.5, 20);
  const gGlow = new THREE.PlaneGeometry(1, 1);           // billboarded eye halo

  // ── the night grin: a wide thin slit with tiny teeth ──────────────────────
  function tinted(geo, hex, mtx) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (mtx) g.applyMatrix4(mtx);
    for (const k of ['uv', 'uv1', 'uv2']) if (g.attributes[k]) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    _c.setHex(hex);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  const gGrin = (() => {
    const parts = [];
    // the slit: a half torus flipped into a smile and squashed very flat
    const arcR = 0.175, arcSquash = 0.30;
    _e.set(0, 0, Math.PI); _q.setFromEuler(_e);
    _m.compose(_p.set(0, 0, 0), _q, _s.set(1, arcSquash, 0.55));
    parts.push(tinted(new THREE.TorusGeometry(arcR, 0.020, 4, 15, Math.PI), 0x180510, _m));
    // teeth hanging off the upper lip — five little ones plus two corner fangs
    for (let i = 0; i < 7; i++) {
      const f = i / 6, a = Math.PI * (0.10 + 0.80 * f);
      const corner = i === 0 || i === 6;
      const x = Math.cos(a) * arcR, y = -Math.sin(a) * arcR * arcSquash;
      _e.set(0, 0, 0); _q.setFromEuler(_e);
      _m.compose(_p.set(x, y + (corner ? 0.010 : 0.016), 0.012), _q,
        _s.set(corner ? 0.030 : 0.024, corner ? 0.058 : 0.040, 0.020));
      parts.push(tinted(new THREE.ConeGeometry(1, 1, 4), 0xfff2f8, _m));
    }
    return mergeGeometries(parts);
  })();

  const mk = (geo, matl, count, cast) => {
    const im = new THREE.InstancedMesh(geo, matl, count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = !!cast; im.receiveShadow = !!cast;
    im.frustumCulled = false;
    for (let i = 0; i < count; i++) im.setMatrixAt(i, ZERO_M);
    group.add(im);
    return im;
  };
  const head = mk(gHead, gummy, N, true);
  const torso = mk(gTorso, gummy, N, true);
  const limb = mk(gLimb, gummy, N * 4, true);   // 0,1 legs · 2,3 arms
  const eye = mk(gEye, eyeMat, N * 2, false);
  const pupil = mk(gPupil, pupilMat, N * 2, false);
  const mouth = mk(gMouth, mouthMat, N, false);
  const grin = mk(gGrin, grinMat, N, false);
  const lid = mk(gLid, lidMat, N * 2, false);
  const glow = mk(gGlow, glowMat, N * 2, false);
  const blob = mk(gDecal, blobMat, N, false);
  const pool = mk(gDecal, poolMat, N, false);
  blob.renderOrder = 2; pool.renderOrder = 3; glow.renderOrder = 4;
  grin.visible = false; pool.visible = false; glow.visible = false;

  // per-instance sugar seed (static — a moving seed would make the crust crawl)
  for (const [im, n, salt] of [[head, N, 0.0], [torso, N, 6.31], [limb, N * 4, 13.07]]) {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = ((i * 3.77 + salt) % 19.0) + 0.5;
    im.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(a, 1));
  }

  // instance colour buffers (gummy hue per kid)
  for (const im of [head, torso, limb]) { for (let i = 0; i < im.count; i++) im.setColorAt(i, _c.setHex(0xffffff)); im.instanceColor.needsUpdate = true; }

  // ── glint anchors ─────────────────────────────────────────────────────────
  // Points ON the surface of the head/torso ellipsoids, biased to the top where
  // the sun hits. sourpatch.js fires sparkle sprites from whichever of these is
  // currently facing the sun.
  const HEAD_C = [0, 1.26, 0.015], HEAD_R = [0.425, 0.360, 0.400];
  const TORSO_C = [0, 0.60, 0], TORSO_R = [0.300, 0.320, 0.240];
  const HEAD_N = 8;
  const sparkPos = new Float32Array(N * SPARK_PER_KID * 3);
  for (let i = 0; i < N; i++) {
    for (let s = 0; s < SPARK_PER_KID; s++) {
      const id = i * SPARK_PER_KID + s;
      const onHead = s < HEAD_N;
      const C = onHead ? HEAD_C : TORSO_C, Rr = onHead ? HEAD_R : TORSO_R;
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2;
      const y = onHead ? Math.abs(u) * 0.9 - 0.05 : u * 0.85;
      const sr = Math.sqrt(Math.max(0.04, 1 - y * y));
      sparkPos[id * 3] = C[0] + Math.cos(th) * sr * Rr[0];
      sparkPos[id * 3 + 1] = C[1] + y * Rr[1];
      sparkPos[id * 3 + 2] = C[2] + Math.sin(th) * sr * Rr[2];
    }
  }
  const upM = []; for (let i = 0; i < N; i++) upM.push(new THREE.Matrix4());

  const hidden = new Uint8Array(N);
  let nightMix = 0, dayLit = 1;

  const api = {
    group, N, materials: { gummy, eyeMat, pupilMat, lidMat, mouthMat, grinMat, blobMat, poolMat, glowMat },
    drawCalls: 11,

    setColor(i, hex) {
      _c.setHex(hex);
      head.setColorAt(i, _c); torso.setColorAt(i, _c);
      for (let l = 0; l < 4; l++) limb.setColorAt(i * 4 + l, _c);
      head.instanceColor.needsUpdate = true; torso.instanceColor.needsUpdate = true; limb.instanceColor.needsUpdate = true;
    },

    /** Global light/mood. sunW is the live world-space direction TOWARD the sun. */
    setMood(daylight, night, sunY, t, sunW) {
      nightMix = night; dayLit = daylight;
      if (sunW) uSunW.value.copy(sunW);
      uTime.value = t;
      // the crust is always there; by day it catches light, at night it goes cold
      uCoat.value = 0.82 * (1 - night) + 0.52 * night;
      uGlint.value = 0.30 * daylight * (0.5 + 0.5 * Math.max(0, Math.min(1, sunY))) + 0.05 * night;
      uRim.value = 0.34 * (1 - night) + 0.42 * night;
      uGummy.value = 0.13 * (1 - night) + 0.22 * night;
      // subsurface: full strength in daylight (a gummy bear on a windowsill),
      // pulled back at night so the body never competes with the eyes
      uSSS.value = 0.62 * (1 - night) + 0.20 * night;
      gummy.color.copy(DAY_BODY).lerp(NIGHT_BODY, night);

      // NIGHT FACE: the eyeball becomes a dark socket, the pupil becomes the glow
      eyeMat.color.copy(EYE_DAY).lerp(EYE_NIGHT, Math.min(1, night * 1.15));
      pupilMat.color.copy(PUP_DAY).lerp(PUP_NIGHT, night);
      // The pupils must be the brightest pixels ON the model at 70 px — brighter
      // than any sugar glint, any lamp spill, any moonlit crust. 3.6 clips to a
      // white-hot acid core with a green fringe, which is exactly the read.
      const pulse = 0.5 + 0.5 * Math.sin(t * 5.7) * Math.sin(t * 1.9);   // 0..1
      pupilMat.emissiveIntensity = night * (3.6 + 1.5 * pulse);
      glowMat.opacity = 0.78 * night * (0.72 + 0.28 * pulse);
      glow.visible = glowMat.opacity > 0.01;
      // The pool is spill from the EYES, so it is driven by the same term: it
      // fades out with them by day (invisible), and breathes with their flicker.
      // Peak alpha stays low — the read comes from the radius and the additive
      // overlap of two kids, not from one bright disc.
      const eyeGlow = night * (0.28 + 0.72 * (1 - daylight));
      poolMat.opacity = 0.35 * eyeGlow * (0.70 + 0.30 * pulse);
      pool.visible = poolMat.opacity > 0.008;
      grin.visible = night > 0.12;
      mouth.visible = night < 0.92;
      // CONTACT SHADOW (critique r3: "none read"). Half-alpha by day — this is
      // the only thing that glues a gummy child to a hillside; a kid that hovers
      // is a sprite, a kid with a dark pool under its feet is standing there.
      blobMat.opacity = 0.50 * (0.62 + 0.38 * daylight);
    },

    hide(i) {
      if (hidden[i]) return; hidden[i] = 1;
      head.setMatrixAt(i, ZERO_M); torso.setMatrixAt(i, ZERO_M);
      mouth.setMatrixAt(i, ZERO_M); grin.setMatrixAt(i, ZERO_M);
      blob.setMatrixAt(i, ZERO_M); pool.setMatrixAt(i, ZERO_M);
      for (let s = 0; s < 2; s++) { eye.setMatrixAt(i * 2 + s, ZERO_M); pupil.setMatrixAt(i * 2 + s, ZERO_M); lid.setMatrixAt(i * 2 + s, ZERO_M); glow.setMatrixAt(i * 2 + s, ZERO_M); }
      for (let l = 0; l < 4; l++) limb.setMatrixAt(i * 4 + l, ZERO_M);
    },

    /**
     * A world point on kid i's surface that currently faces `sunW`.
     * Returns false if nothing on this kid is lit (then don't fire a glint).
     */
    glintPoint(i, sunW, out) {
      if (hidden[i]) return false;
      // BEST of five, not first-of-five: the glint belongs on the facet most
      // square-on to the sun, so a kid walking a circle flashes in a rhythm
      // instead of twinkling at random. Pushed 16% proud of the surface so the
      // sprite sits ON the crust rather than half inside the head.
      const base = i * SPARK_PER_KID;
      let found = false, bd = 0.05;
      for (let tryN = 0; tryN < 5; tryN++) {
        const s = (Math.floor(rand() * SPARK_PER_KID) + tryN) % SPARK_PER_KID;
        const id = base + s, onHead = s < HEAD_N;
        _gA.set(sparkPos[id * 3], sparkPos[id * 3 + 1], sparkPos[id * 3 + 2]).applyMatrix4(upM[i]);
        _gB.set(0, onHead ? HEAD_C[1] : TORSO_C[1], 0).applyMatrix4(upM[i]);
        _gA.sub(_gB);
        const d = _gA.dot(sunW) / (_gA.length() || 1);
        if (d > bd) { bd = d; found = true; out.copy(_gA).multiplyScalar(1.16).add(_gB); }
      }
      return found;
    },

    /** Write every matrix for kid i. k is the brain's state object. */
    pose(i, k, t) {
      if (k.vis <= 0.004) { api.hide(i); return; }
      hidden[i] = 0;
      const sc = k.scale * Math.min(1, k.vis);
      const sy = 1 + k.squash, sxz = 1 - k.squash * 0.45;
      const crouch = k.crouch || 0;

      // root: yaw, optional lie-down pitch, waddle roll, squash
      _e.set(k.lie * -Math.PI * 0.5, k.yaw, k.roll + (k.sway || 0), 'YXZ'); _q.setFromEuler(_e);
      _p.set(k.x, k.y + k.hop + k.lie * 0.30 - k.sit * 0.30 - crouch * 0.11, k.z);
      _s.set(sc * sxz, sc * sy, sc * sxz);
      _mRoot.compose(_p, _q, _s);
      // upper body lean (creep posture / reaching / hunch)
      pivotRotX(_mUp, k.lean + crouch * 0.22, 0.34);
      _mUp.premultiply(_mRoot);
      upM[i].copy(_mUp);

      // legs
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        let a = Math.sin(k.gait + (s ? Math.PI : 0)) * 0.62 * k.gaitAmp;
        a += k.sit * -1.35 + k.kick * Math.sin(t * 5.6 + s * 2.3) * 0.5 + crouch * 0.34;
        // splayed: a Sour Patch Kid's legs come out of the corners of its body,
        // not out of a hip socket. 9° of stance is most of the read at distance.
        let zr = side * 0.16;
        // sunbather: the far leg crosses over the near one
        if (k.cross && s === 1) { a += -0.30 * k.cross; zr += -0.74 * k.cross; }
        _e.set(a, 0, zr, 'XYZ'); _q2.setFromEuler(_e);
        _off.set(0, -0.17, 0).applyQuaternion(_q2);
        _p.set(side * 0.150 + _off.x, 0.335 + _off.y, _off.z);
        _m.compose(_p, _q2, ONE).premultiply(_mRoot);
        limb.setMatrixAt(i * 4 + s, _m);
      }
      // arms
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        let ax, az, ay = 0;
        switch (k.armMode) {
          case 'up':     ax = -2.55 + Math.sin(t * 4.6 + k.ph * 6 + s * 3.1) * 0.52; az = side * 0.56; break;
          case 'run':    ax = -1.95 + Math.sin(k.gait * 1.0 + (s ? Math.PI : 0)) * 0.55; az = side * 0.70; break;
          case 'nap':    ax = -2.62; az = side * 1.22; break;               // hands behind head
          case 'prop':   ax = 0.62; az = side * 0.70; break;                // propped back on a step
          case 'behind': ax = 0.86; az = side * 0.26; break;                // hands behind back
          case 'reach':  ax = -1.45 + Math.sin(t * 8 + k.ph * 6 + s) * 0.13; az = side * 0.30; break;
          case 'paw':    ax = -1.15 + Math.sin(t * 4.4 + k.ph * 6 + s * 2.2) * 0.55; az = side * 0.34; break;
          case 'lick':   ax = s === 0 ? -1.95 : -0.15; az = side * 0.30; break;
          case 'wave':   ax = s === 1 ? -2.6 + Math.sin(t * 9) * 0.5 : -0.2; az = side * 0.42; break;
          // arms hang OUT, not down: stubby nubs at 35° off the body
          default:       ax = -Math.sin(k.gait + (s ? Math.PI : 0)) * 0.5 * k.gaitAmp + k.lean * 0.35; az = side * (0.62 + k.gaitAmp * 0.12);
        }
        _e.set(ax, ay, az, 'XYZ'); _q2.setFromEuler(_e);
        _off.set(0, -0.16, 0).applyQuaternion(_q2);
        _p.set(side * 0.275 + _off.x, 0.815 + _off.y, _off.z);
        _s.set(0.95, 0.95, 0.95);
        _m.compose(_p, _q2, _s).premultiply(_mUp);
        limb.setMatrixAt(i * 4 + 2 + s, _m);
      }
      // torso
      const breath = 1 + Math.sin(t * 1.7 + k.ph * 6.3) * 0.025;
      _e.set(0, Math.sin(k.gait) * 0.13 * k.gaitAmp, 0, 'XYZ'); _q2.setFromEuler(_e);
      _p.set(0, 0.60 - crouch * 0.03, 0); _s.set(0.96 + crouch * 0.06, 1.06 * breath - crouch * 0.07, 0.80);
      _m.compose(_p, _q2, _s).premultiply(_mUp);
      torso.setMatrixAt(i, _m);
      // head (frame first so the face can hang off it)
      const bob = Math.sin(k.gait * 2) * 0.02 * k.gaitAmp;
      _e.set(k.headPitch, k.headYaw, k.headRoll, 'YXZ'); _q2.setFromEuler(_e);
      // 1.26, not 1.22: the extra four centimetres is the pinch of neck between
      // the chin and the shoulders that stops them reading as balls on bodies.
      _p.set(0, 1.26 + bob - crouch * 0.10, 0.015 + crouch * 0.05);
      _mHead.compose(_p, _q2, ONE).premultiply(_mUp);
      _s.set(1.08, 1.0 / (1 + Math.abs(k.squash) * 0.2), 1.0);
      _m.compose(_p, _q2, _s).premultiply(_mUp);
      head.setMatrixAt(i, _m);

      // ── face ────────────────────────────────────────────────────────────────
      const shut = Math.max(k.blink, k.eyesShut || 0);
      const open = Math.max(0.08, 1 - shut * 0.92);
      const nm = k.slit;                                  // 0 day face · 1 night face
      const cam = ctx.camera;
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        // sclera by day → dark sunken socket at night (bigger, pushed in)
        const eg = 1 + nm * 0.28;
        _p.set(side * 0.152, 0.055, 0.280 - nm * 0.022); _q2.identity();
        _s.set(eg, open * eg * (1 - nm * 0.12), eg * 0.92);
        _m.compose(_p, _q2, _s).premultiply(_mHead);
        eye.setMatrixAt(i * 2 + s, _m);
        // pupil: big friendly dot by day → small acid dot sitting PROUD of the
        // socket at night. Sunk even a centimetre inside and the glow is eaten
        // by the socket sphere and the whole face reads as two black holes.
        const pg = 1 - nm * 0.30;
        _p.set(side * 0.152 + k.lookX * 0.032 * (1 - nm * 0.5), 0.055 + k.lookY * 0.024, 0.368 + nm * 0.048);
        _s.set(pg, open * pg * 1.06, pg);
        _m.compose(_p, _q2, _s).premultiply(_mHead);
        pupil.setMatrixAt(i * 2 + s, _m);
        // the day "brow" is gone: at night a heavy flat lid hoods the socket.
        // (An arched brow on a round face reads worried, not hungry.)
        _e.set(0, 0, side * -0.16 * k.browOut, 'XYZ'); _q2.setFromEuler(_e);
        _p.set(side * 0.150, 0.150 + 0.02 * (1 - k.browOut), 0.268);
        _s.set(k.browOut * 1.12, k.browOut, k.browOut);
        _m.compose(_p, _q2, _s).premultiply(_mHead);
        lid.setMatrixAt(i * 2 + s, _m);
        // eye glow: a camera-facing halo, nudged 14 cm toward the lens so the
        // skull never eats it at a three-quarter angle. Dies with the eyelid.
        const gn = nm * open;
        if (gn > 0.02) {
          _p.set(side * 0.152, 0.055, 0.40).applyMatrix4(_mHead);
          if (cam) {
            _gA.copy(cam.position).sub(_p);
            _p.addScaledVector(_gA, 0.14 / (_gA.length() || 1));
            _q2.copy(cam.quaternion);
          } else _q2.identity();
          const gs = 0.36 * gn * sc;
          _s.set(gs, gs, 1);
          _m.compose(_p, _q2, _s);
          glow.setMatrixAt(i * 2 + s, _m);
        } else glow.setMatrixAt(i * 2 + s, ZERO_M);
        _q2.identity();
      }
      // day mouth: round grin, opens when they shout
      _e.set(0.12, 0, Math.PI, 'XYZ'); _q2.setFromEuler(_e);
      _p.set(0, -0.075 - k.mouthOpen * 0.05, 0.355);
      _s.set((1 + k.mouthWide * 0.5) * (1 - nm), (1 + k.mouthOpen * 2.4) * (1 - nm), 1);
      _m.compose(_p, _q2, _s).premultiply(_mHead);
      mouth.setMatrixAt(i, _m);
      // night grin: wide, thin, toothy — and it gapes when they rush you
      _e.set(0.10, 0, 0, 'XYZ'); _q2.setFromEuler(_e);
      _p.set(0, -0.095, 0.336);
      _s.set(nm * (1.0 + k.mouthWide * 0.22), nm * (1.0 + k.mouthOpen * 3.0), nm);
      _m.compose(_p, _q2, _s).premultiply(_mHead);
      grin.setMatrixAt(i, _m);

      // ── contact shadow + night ground pool ─────────────────────────────────
      // Flat on the terrain at the kid's exact ground height: without this they
      // hover, and at night nothing casts a shadow at all.
      // 1.30 (was 0.96): wider than the splayed stance, so the shadow reads as
      // ground contact from the game camera instead of a coin under the feet.
      const br = (1.30 + k.lie * 0.90) * sc * (1 - k.hop * 0.30);
      _p.set(k.x, (k.groundY ?? k.y) + 0.075, k.z);
      _s.set(br, br * (1 + k.lie * 0.45), 1);
      _m.compose(_p, FLAT, _s);
      blob.setMatrixAt(i, _m);
      // the glow pool is much wider than the body (~1.6 u radius) so two kids
      // standing near each other pour into one shared pool instead of stamping
      // two discs. Sits higher off the ground than the blob: a 3 u disc laid
      // flat on rolling terrain would otherwise clip through the hill it is on,
      // and the rim is fully transparent anyway so the offset never shows.
      _p.set(k.x, (k.groundY ?? k.y) + 0.115, k.z);
      _s.set(br * 2.36, br * 2.36, 1);
      _m.compose(_p, FLAT, _s);
      pool.setMatrixAt(i, _m);
    },

    commit() {
      head.instanceMatrix.needsUpdate = true; torso.instanceMatrix.needsUpdate = true;
      limb.instanceMatrix.needsUpdate = true; eye.instanceMatrix.needsUpdate = true;
      pupil.instanceMatrix.needsUpdate = true; mouth.instanceMatrix.needsUpdate = true;
      grin.instanceMatrix.needsUpdate = true; lid.instanceMatrix.needsUpdate = true;
      blob.instanceMatrix.needsUpdate = true; pool.instanceMatrix.needsUpdate = true;
      glow.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}
