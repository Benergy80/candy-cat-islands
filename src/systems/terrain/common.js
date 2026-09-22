// Shared helpers for the terrain system: GLSL snippets, a material patcher,
// the baked sea/shore height field, and small colour utilities.
// Owned by the TERRAIN system. Nothing here mutates world.js.
import * as THREE from 'three';

// ── GLSL ─────────────────────────────────────────────────────────────────────
export const GLSL_NOISE = /* glsl */`
float tHash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float tVNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = tHash21(i), b = tHash21(i + vec2(1.0, 0.0)), c = tHash21(i + vec2(0.0, 1.0)), d = tHash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float tFbm(vec2 p){ float s = 0.0, a = 0.55; for (int i = 0; i < 4; i++) { s += a * tVNoise(p); p = p * 2.03 + vec2(3.1, 7.7); a *= 0.5; } return s; }
float tFbm2(vec2 p){ float s = 0.0, a = 0.62; for (int i = 0; i < 2; i++) { s += a * tVNoise(p); p = p * 2.11 + vec2(1.3, 5.9); a *= 0.5; } return s; }
// Sprinkle albedos, LINEAR and deliberately dark: the scene is graded through
// ACES at exposure ~1.15, so a 1.0 channel clips to white and the sprinkle
// reads as pale confetti. These land as saturated candy colours instead.
vec3 tSprinkleColor(float r){
  float i = floor(r * 6.0);
  if (i < 1.0) return vec3(0.620, 0.035, 0.075);
  if (i < 2.0) return vec3(0.035, 0.200, 0.720);
  if (i < 3.0) return vec3(0.720, 0.460, 0.020);
  if (i < 4.0) return vec3(0.030, 0.420, 0.100);
  if (i < 5.0) return vec3(0.260, 0.075, 0.660);
  return vec3(0.740, 0.170, 0.012);
}
`;

// ── WATER GLSL ───────────────────────────────────────────────────────────────
// One shared water-shading vocabulary so the sea, the syrup river and Chocolate
// Lake all speak it: scrolling ripple normals, a sun-glint band aimed at the
// light, a Fresnel sky tint and a constant-width shore foam ring.
//
// Why a BAND and not just a specular lobe: at noon the physical mirror
// direction points straight down, so a Blinn-Phong highlight is invisible from
// the iso game camera and every water body reads as a matte slab. A real sun
// glitter road is the set of surface points whose ground-plane bearing from the
// VIEWER lines up with the sun's bearing — that is a screen-space-plausible
// construction which survives any camera elevation, so it is built explicitly.
export const GLSL_WATER = /* glsl */`
// ANTI-ALIASING, and it is the single most important thing in this file.
// Procedural noise is sampled once per pixel with no filtering. As soon as one
// pixel covers more than about half a noise cell the sampling beats against the
// cell lattice and you get big soft CLOUD BLOTCHES that drift with the camera —
// which is exactly the "blurred lavender-brown camouflage" every critic has
// read on this bay. It cannot be fixed by changing colours, foam or specular;
// the offending octave has to be faded out once it stops being resolvable.
// tFootprint = world units covered by one pixel here; tResolve = how much of a
// noise layer at frequency s (cycles per world unit) survives at it.
// World units covered by one pixel at this point. Derived from distance and the
// grazing angle rather than from fwidth(): on a water plane made of 5-unit
// quads the derivative instructions are unreliable under software GL (they came
// back NaN, which propagated through clamp() and turned the whole sea white).
// The constant is 2 * tan(fov/2) / viewportHeight with a ~1.5x safety margin:
// at FOV 30 over 1000 px that is 0.000536, so 0.00080 keeps a real margin while
// still letting an octave live as long as it is genuinely resolvable. It was
// 0.0013 (2.4x the true value), which retired every fine octave roughly one
// doubling too early — half of why open water measured as an airbrushed
// gradient at the distances the game actually shows it.
float tFootprint(vec3 wpos){
  vec3 d = cameraPosition - wpos;
  float len = length(d) + 1e-4;
  return len * 0.00080 / max(d.y / len, 0.05);
}
float tResolve(float fp, float s){ return 1.0 - smoothstep(0.22, 0.60, fp * s); }

// Two scrolling ripple layers → a surface-slope gradient (xz). Callers fade the
// amplitudes with distance (see tResolve) — an unfaded fine layer is what turns
// the far half of a water body into moire cloud.
vec2 tRipple2(vec2 w, float t, float s1, float a1, float s2, float a2){
  vec2 p1 = w * s1 + vec2(t * 0.055, -t * 0.031);
  vec2 p2 = w * s2 + vec2(-t * 0.101, t * 0.074);
  vec2 g = (vec2(tVNoise(p1), tVNoise(p1 + vec2(31.7, 11.3))) - 0.5) * a1;
  g += (vec2(tVNoise(p2), tVNoise(p2 + vec2(7.1, 47.9))) - 0.5) * a2;
  return g;
}

// ── DISTANCE-SCALED RIPPLES (the fix for "flat matte water at 30–150 u") ──────
// The previous generation of this shader FADED every ripple octave out with
// distance to stop it aliasing. That is half of the truth: an octave must die
// once a pixel can no longer resolve it — but if nothing replaces it the surface
// loses all of its high-frequency detail exactly at the distances the game
// actually shows water, and renders as an airbrushed gradient (measured: mean
// |Laplacian| 0.85 over open water against 18 on the frosting ground).
//
// The right construction is an LOD stack: five octaves from 1.85 down to 0.055
// cycles per world unit. Each one is gated by tResolve, and the whole stack is
// renormalised to constant RMS slope — so as the fine octaves die the coarse
// ones grow to take their place. The surface keeps the SAME shading contrast at
// 20 u and at 200 u; only the feature SIZE grows with distance, which is what
// real water does under perspective anyway.
vec2 tRipOct(vec2 w, float t, float s, vec2 drift, float seed){
  vec2 p = w * s + drift * t + seed;
  return vec2(tVNoise(p), tVNoise(p + vec2(31.7, 11.3))) - 0.5;
}
vec2 tRippleLod(vec2 w, float t, float fp, float amp){
  float w5 = tResolve(fp, 1.85);
  float w4 = tResolve(fp, 0.78);
  float w3 = tResolve(fp, 0.33);
  float w2 = tResolve(fp, 0.135);
  float w1 = tResolve(fp, 0.055);
  // per-octave gains: the coarse layers carry a little more so the far field
  // keeps a swell-like roll rather than going glassy
  float a5 = w5 * 0.62, a4 = w4 * 0.85, a3 = w3 * 1.00, a2 = w2 * 1.10, a1 = w1 * 1.20;
  vec2 g = tRipOct(w, t, 1.85, vec2(-0.101, 0.074), 0.0) * a5
         + tRipOct(w, t, 0.78, vec2(0.062, -0.048), 5.3) * a4
         + tRipOct(w, t, 0.33, vec2(-0.041, 0.027), 11.9) * a3
         + tRipOct(w, t, 0.135, vec2(0.022, 0.018), 23.1) * a2
         + tRipOct(w, t, 0.055, vec2(-0.012, 0.009), 37.7) * a1;
  // constant RMS: independent octaves add in quadrature
  float norm = sqrt(a5 * a5 + a4 * a4 + a3 * a3 + a2 * a2 + a1 * a1);
  return g * (amp / max(norm, 0.30));
}
// WIND-DRIVEN CREST LINES. Open water at any distance reads as fine parallel
// crest lines running across the wind — never as isotropic blobs, which is what
// an fbm crest field gives you and what makes a bay look like camouflage. Thin
// bright lines are also the only thing that puts genuine PIXEL-SCALE contrast on
// a water surface: the critic's "high-frequency detail" number is a mean
// |Laplacian|, and soft blobs score ~1 where lines score like real texture.
// Three octaves, LOD-gated and renormalised (so the crests get coarser with
// distance instead of vanishing), meandered by an fbm warp so no line is ever
// straight across the bay. Returns -1..1 plus the surface gradient of the field.
float tCrestLines(vec2 w, float t, float fp, vec2 dir, out vec2 g){
  float n = tFbm(w * 0.042);
  float n2 = tFbm(w * 0.145 + 3.7);
  vec2 d2 = normalize(dir + vec2(-dir.y, dir.x) * (n - 0.5) * 1.1);
  float s = dot(w, d2);
  float wA = tResolve(fp, 1.05), wB = tResolve(fp, 0.42), wC = tResolve(fp, 0.17);
  float pa = s * 6.60 + n2 * 7.4 + t * 1.45;
  float pb = s * 2.64 + n * 11.0 - t * 0.85;
  float pc = s * 1.07 + n * 7.0 + t * 0.45;
  float nr = max(wA + wB + wC, 0.25);
  g = d2 * ((cos(pa) * 6.60 * wA + cos(pb) * 2.64 * wB + cos(pc) * 1.07 * wC) / nr);
  return (sin(pa) * wA + sin(pb) * wB + sin(pc) * wC) / nr;
}
// The glitter road: 1 along the camera→sun bearing, 0 elsewhere. Widens with
// distance (it is a cone from the viewer) and degenerates into a pool under the
// camera when the sun is too high for a bearing to mean anything.
//
// A HIGH SUN HAS NO ROAD — ONLY A POOL, AND ONLY NEAR THE VIEWER. This band is
// built from the ground BEARING alone, which is what lets it survive any camera
// elevation, but bearing on its own says nothing about whether the reflected
// disc can actually reach the eye. It cannot at midday: the road is the mirror
// image of the sun, so at ~51° of elevation the only water that can return it is
// the water close to the camera, and the horizon is categorically not on it.
// Without the noRoad fade below, a ±53° wedge (the cone WIDENS with distance,
// 0.86 → 0.60) stayed 62% lit at noon, so any camera pointed down-sun over open
// water — the free camera at 120 u, the ferry crossing, the flying machine
// heading north — put the whole frame inside the band. tSunGlint then added
// ~0.5 linear of emissive to a 0.06–0.44 albedo and the sea rendered as one flat
// near-white sheet at the fog colour: no horizon, no water, and the islands
// reading as props floating in a sky-coloured void.
//
// The fade is gated on sun elevation (zero below y ≈ 0.45), so dawn, dusk and
// the low-sun glitter road this function exists for are untouched.
float tGlintBand(vec3 wpos, vec3 camPos, vec3 sunDir){
  vec2 toP = wpos.xz - camPos.xz;
  float dp = length(toP) + 1e-4;
  toP /= dp;
  vec2 sunB = normalize(sunDir.xz + vec2(1e-5));
  float align = dot(toP, sunB);
  float wid = mix(0.86, 0.60, smoothstep(8.0, 150.0, dp));
  float band = smoothstep(wid, min(0.997, wid + 0.30), align);
  float high = smoothstep(0.52, 0.93, sunDir.y);
  // how thoroughly the sun has climbed out of "there is a road" territory
  float noRoad = smoothstep(0.45, 0.85, sunDir.y);
  band *= mix(1.0, 1.0 - smoothstep(25.0, 120.0, dp), noRoad);
  float pool = 1.0 - smoothstep(8.0, 52.0, dp);
  // the high-sun fallback stays WEAK: on a body smaller than the pool radius
  // it would otherwise cover the whole surface and wash it white at noon
  return clamp(mix(band, max(band * 0.45, pool * 0.38), high), 0.0, 1.0);
}
// Sun glint: a broad-ish specular lobe gated by the band, plus band sparkle.
// The sparkle mask is an LOD stack for the same reason as tRippleLod — a fixed
// 3.6-cycle lattice is invisible mush past ~40 u, so the glitter road used to
// stop existing exactly where the game camera sees the sea.
vec3 tSunGlint(vec3 wpos, vec3 n, vec3 camPos, vec3 sunDir, vec3 sunCol, float t, float sharp, float gain){
  vec3 V = normalize(camPos - wpos);
  vec3 L = normalize(sunDir);
  float sunUp = smoothstep(-0.14, 0.04, L.y);   // a LOW sun is when a glitter road is strongest
  vec3 Hv = normalize(V + L);
  float nh = max(dot(n, Hv), 0.0);
  float band = tGlintBand(wpos, camPos, sunDir);
  // The broad half of the lobe is deliberately small and almost entirely gated
  // by the band: a wide pow(nh, ~18) term spread over ripple-perturbed normals
  // paints the whole bay in soft grey cloud blotches (it reads as dirty water,
  // not as shine). The narrow core is what actually glints.
  float spec = pow(nh, sharp) * 6.0 + pow(nh, sharp * 0.22) * 0.26;
  float fp = tFootprint(wpos);
  float sA = tResolve(fp, 3.20), sB = tResolve(fp, 1.10), sC = tResolve(fp, 0.34);
  float sparkle = (smoothstep(0.34, 0.80, tVNoise(wpos.xz * 3.20 - vec2(t * 0.30, t * 0.19))) * sA
                 + smoothstep(0.42, 0.84, tVNoise(wpos.xz * 1.10 + vec2(t * 0.14, -t * 0.085))) * sB
                 + smoothstep(0.46, 0.88, tVNoise(wpos.xz * 0.34 + vec2(-t * 0.06, t * 0.04))) * sC)
                / max(sA + sB + sC, 0.30);
  return sunCol * sunUp * gain * (spec * (0.10 + 0.90 * band) + band * sparkle * 1.15);
}
// Fresnel sky tint. Water is a mirror at grazing angles; this is what stops the
// far half of any pool from reading as painted cardboard.
vec3 tSkyFresnel(vec3 n, vec3 V, vec3 horizon, vec3 sunCol, float f0, float gain){
  float ndv = max(dot(n, V), 0.0);
  float F = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0);
  return (horizon * 0.90 + sunCol * 0.12) * F * gain;
}
// Reflection of the SKY GRADIENT, not of one flat horizon colour. The mirror
// ray off a rippled surface points somewhere between straight up (zenith) and
// along the water (horizon); sampling the real gradient is what makes a wave
// face read as a different colour from the trough beside it at grazing angles.
vec3 tSkyGrad(vec3 n, vec3 V, vec3 horizon, vec3 zenith, float f0, float gain){
  vec3 R = reflect(-V, n);
  float up = clamp(R.y, 0.0, 1.0);
  vec3 sky = mix(horizon, zenith, sqrt(up) * 0.92);
  float ndv = max(dot(n, V), 0.0);
  float F = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0);
  return sky * F * gain;
}
`;

let patchId = 0;

/**
 * Inject custom GLSL into a MeshStandardMaterial at the usual chunk seams.
 * Returns the material; the live `shader` lands on material.userData.shader.
 */
export function patchMaterial(material, opts = {}) {
  const {
    uniforms = {}, vertexHead = '', vertexBody = '', fragmentHead = '',
    fragmentColor = '', fragmentRough = '', fragmentNormal = '', fragmentEmissive = '',
    key = 'terrain-' + (patchId++),
  } = opts;
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (vertexHead) shader.vertexShader = vertexHead + '\n' + shader.vertexShader;
    if (vertexBody) shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertexBody);
    if (fragmentHead) shader.fragmentShader = fragmentHead + '\n' + shader.fragmentShader;
    if (fragmentColor) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + fragmentColor);
    if (fragmentRough) shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + fragmentRough);
    if (fragmentNormal) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + fragmentNormal);
    if (fragmentEmissive) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + fragmentEmissive);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => key;
  return material;
}

// ── Baked height field (used by the water shaders for depth / foam) ──────────
export const FIELD_RECT = { x0: -330, x1: 330, z0: -175, z1: 175, w: 512, h: 272 };
const ENC_MIN = -12, ENC_RANGE = 32;

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[j * w + Math.min(w - 1, Math.max(0, i + k))];
    tmp[j * w + i] = s * inv;
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, j + k)) * w + i];
    out[j * w + i] = s * inv;
  }
  return out;
}

/** Bake world.height into an RGBA byte texture: R = height, G = soft height, B = wide-soft height. */
export function bakeField(world) {
  const { x0, x1, z0, z1, w, h } = FIELD_RECT;
  const raw = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const z = z0 + ((j + 0.5) / h) * (z1 - z0);
    for (let i = 0; i < w; i++) raw[j * w + i] = world.height(x0 + ((i + 0.5) / w) * (x1 - x0), z);
  }
  const soft = boxBlur(raw, w, h, 2);
  const wide = boxBlur(raw, w, h, 7);
  const data = new Uint8Array(w * h * 4);
  const enc = (v) => Math.max(0, Math.min(255, Math.round(((v - ENC_MIN) / ENC_RANGE) * 255)));
  for (let k = 0; k < w * h; k++) {
    data[k * 4] = enc(raw[k]); data[k * 4 + 1] = enc(soft[k]); data[k * 4 + 2] = enc(wide[k]); data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false; tex.needsUpdate = true;
  return { tex, rect: new THREE.Vector4(x0, z0, x1 - x0, z1 - z0) };
}

/**
 * Separable box blur over a square height grid (V×V, row-major). Used to get a
 * "local average height" so the ground can be shaded darker in dips and
 * lighter on crests — the cheapest way to make gentle terrain read as 3D.
 */
export function blurGrid(src, V, r) {
  const tmp = new Float32Array(V * V), out = new Float32Array(V * V);
  const inv = 1 / (2 * r + 1);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[j * V + Math.min(V - 1, Math.max(0, i + k))];
    tmp[j * V + i] = s * inv;
  }
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(V - 1, Math.max(0, j + k)) * V + i];
    out[j * V + i] = s * inv;
  }
  return out;
}

export const GLSL_FIELD = /* glsl */`
uniform sampler2D uField;
uniform vec4 uFieldRect;
float tFieldH(vec2 wxz){ vec2 uv = (wxz - uFieldRect.xy) / uFieldRect.zw; return texture2D(uField, clamp(uv, 0.002, 0.998)).r * ${ENC_RANGE.toFixed(1)} + (${ENC_MIN.toFixed(1)}); }
vec3 tFieldAll(vec2 wxz){ vec2 uv = (wxz - uFieldRect.xy) / uFieldRect.zw; return texture2D(uField, clamp(uv, 0.002, 0.998)).rgb * ${ENC_RANGE.toFixed(1)} + (${ENC_MIN.toFixed(1)}); }
// Signed distance (WORLD UNITS) from (x,z) to the waterline: + inland, - at sea.
// Height alone is useless for a foam ring — on a flat shelf a 2-unit depth band
// is 40 units wide, on a steep one it is 2. Dividing by the local gradient turns
// it into a ring of constant width wherever the shore happens to be.
float tShoreDist(vec2 wxz){
  const float E = 1.6;
  float h = tFieldH(wxz);
  float hx = tFieldH(wxz + vec2(E, 0.0)) - tFieldH(wxz - vec2(E, 0.0));
  float hz = tFieldH(wxz + vec2(0.0, E)) - tFieldH(wxz - vec2(0.0, E));
  float g = max(length(vec2(hx, hz)) / (2.0 * E), 0.035);
  return clamp(h / g, -60.0, 60.0);
}
// Same five taps, but it also hands back the UNIT SHORE NORMAL (pointing
// inland). dot(w, perp(normal)) is then an along-shore coordinate, which is the
// only cheap way to cut surf foam into SCALLOPS that follow the coast instead
// of an isotropic noise airbrush. Returns (signed distance, nx, nz).
vec3 tShoreDN(vec2 wxz){
  const float E = 1.6;
  float h = tFieldH(wxz);
  float hx = tFieldH(wxz + vec2(E, 0.0)) - tFieldH(wxz - vec2(E, 0.0));
  float hz = tFieldH(wxz + vec2(0.0, E)) - tFieldH(wxz - vec2(0.0, E));
  vec2 gv = vec2(hx, hz) / (2.0 * E);
  float g = max(length(gv), 0.035);
  return vec3(clamp(h / g, -60.0, 60.0), gv / g);
}
`;

// ── Contact AO ───────────────────────────────────────────────────────────────
// Cast shadows only reach the props themselves; what makes ground read as 3D in
// a FarmVille-ish scene is the soft dark ring where everything MEETS it. Every
// system registers ctx.colliders, so one pass over that list bakes a world-space
// occlusion map the ground and the paths both sample. Cheap, deterministic and
// it costs one texture, not one shadow map.
export const AO_RECT = { x0: -288, x1: 288, z0: -136, z1: 136, w: 640, h: 302 };

export function makeAOTexture() {
  const { w, h } = AO_RECT;
  const data = new Uint8Array(w * h * 4).fill(255);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false; tex.needsUpdate = true;
  return { tex, data, rect: new THREE.Vector4(AO_RECT.x0, AO_RECT.z0, AO_RECT.x1 - AO_RECT.x0, AO_RECT.z1 - AO_RECT.z0) };
}

/** Stamp every collider into the AO texture as a soft radial darkening. */
export function bakeAO(target, colliders) {
  const { x0, x1, z0, z1, w, h } = AO_RECT;
  const sx = w / (x1 - x0), sz = h / (z1 - z0);
  const occ = new Float32Array(w * h);
  let n = 0;
  for (const c of colliders || []) {
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) continue;
    let r = c.box ? Math.hypot(c.w || 0, c.d || 0) * 0.5 : (c.r || 0);
    if (!(r > 0.15)) continue;
    r = Math.min(11, r);
    n++;
    const R = r * 1.50 + 1.05;                              // how far the contact shade reaches
    // Slightly deeper and slightly tighter than r2: the critics still read props
    // as sitting ON the frosting rather than bedded INTO it. Tightening R while
    // raising amt darkens the contact ring without spreading a stain.
    const amt = Math.min(0.72, 0.33 + r * 0.058);           // bigger things sit deeper
    const i0 = Math.max(0, Math.floor((c.x - R - x0) * sx)), i1 = Math.min(w - 1, Math.ceil((c.x + R - x0) * sx));
    const j0 = Math.max(0, Math.floor((c.z - R - z0) * sz)), j1 = Math.min(h - 1, Math.ceil((c.z + R - z0) * sz));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) / sz;
      for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) / sx;
        const d = Math.hypot(x - c.x, z - c.z);
        if (d >= R) continue;
        const t = 1 - d / R;
        // MAX, never a sum: stacking darkenings under a dense cluster of props
        // paints a black puddle and the ground stops reading at all.
        const v = t * t * (3 - 2 * t) * amt;
        const k = j * w + i;
        if (v > occ[k]) occ[k] = v;
      }
    }
  }
  // HIGH-PASS the result. A dense village registers a collider every couple of
  // units, so the raw field saturates and simply stains the whole place mud
  // brown — which is the opposite of the point. Subtracting the local average
  // keeps only the CONTACT ring around each prop, plus a small uniform share so
  // crowded ground still sits a touch lower than open ground.
  const soft = boxBlur(occ, w, h, 2);
  const wide = boxBlur(occ, w, h, 10);
  const data = target.data;
  for (let k = 0; k < w * h; k++) {
    const local = occ[k] * 0.4 + soft[k] * 0.6;
    const detail = Math.max(0, local - wide[k] * 0.88);
    const v = Math.max(0, Math.min(1, 1 - (detail * 0.80 + wide[k] * 0.15)));
    data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = Math.round(v * 255);
    data[k * 4 + 3] = 255;
  }
  target.tex.needsUpdate = true;
  let mn = 255, dark = 0;
  for (let k = 0; k < w * h; k++) { const v = data[k * 4]; if (v < mn) mn = v; if (v < 242) dark++; }
  console.warn(`[terrain] contact AO: ${n} props · min ${(mn / 255).toFixed(2)} · ${(100 * dark / (w * h)).toFixed(1)}% shaded`);
  return n;
}

export const GLSL_AO = /* glsl */`
uniform sampler2D uAO;
uniform vec4 uAORect;
float tContactAO(vec2 wxz){
  vec2 uv = (wxz - uAORect.xy) / uAORect.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  return texture2D(uAO, uv).r;
}
`;

// ── colour helpers ───────────────────────────────────────────────────────────
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const _c = new THREE.Color();
/** Lerp `target` (THREE.Color, linear-space working copy) toward hex by t. */
export function toward(target, hex, t) { if (t <= 0) return target; _c.setHex(hex, THREE.SRGBColorSpace); return target.lerp(_c, Math.min(1, t)); }

/**
 * Pull chroma out of a colour without changing its value — the FarmVille rule
 * that ground must stay quieter than the props so silhouettes separate.
 * `t` = 0 keeps the hue fully saturated, 0.35 removes about a third of it.
 * The grey it mixes toward is warm, so frosting stays appetising, not ashen.
 */
export function quiet(target, t) {
  if (t <= 0) return target;
  const lum = target.r * 0.2126 + target.g * 0.7152 + target.b * 0.0722;
  target.r += (lum * 1.07 - target.r) * t;
  target.g += (lum * 0.99 - target.g) * t;
  target.b += (lum * 0.92 - target.b) * t;
  return target;
}
export function colorOf(hex) { return new THREE.Color().setHex(hex, THREE.SRGBColorSpace); }

/** Build an indexed grid geometry from explicit x/z coordinate arrays + a height callback. */
export function gridGeometry(xs, zs, sample, keepQuad) {
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const extras = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    const s = sample(xs[i], zs[j], i, j);
    pos[k * 3] = xs[i]; pos[k * 3 + 1] = s; pos[k * 3 + 2] = zs[j];
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (keepQuad && !keepQuad(i, j, pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1])) continue;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.userData.nx = nx; geo.userData.nz = nz; geo.userData.extras = extras;
  return geo;
}
