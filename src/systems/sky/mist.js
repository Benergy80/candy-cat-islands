// ─────────────────────────────────────────────────────────────────────────────
// LOW SEA MIST — two translucent sheets lying just above the water, drawn as
// ONE grid (1 draw call, ~14k tris) so dawn has weather in it.
//
// Why a baked mask instead of a shader height test: the mist has to know where
// the land is, and the ground shader's height function is not available to a
// standalone material. So `world.height()` is sampled once per grid vertex at
// build time into `aMask` — 1 over open water, tapering to 0 by about 8 units
// of elevation, with a little extra right at the waterline. The result is mist
// that pools in the bays and the harbour lowland (100,58 is carved 1.2 down for
// exactly this reason) and never fogs the top of Frosting Peak.
//
// Density is driven from the clock, not the grade, so "gone by 07:00" is a
// promise the table cannot accidentally break:
//     04:00 ──▁▃▆█ 05:00 ████ 06:20 █▆▃▁── 07:00   plus a thin night haze.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const SPAN = 1180;   // world units across (the sea mesh reaches ~940 in x)
const SEG = 60;      // 19.7 u cells — plenty for a soft mask
// Two sheets, one draw call. The upper one drifts the other way (see `dir` in
// the fragment shader) so the banks slide past each other instead of moving as
// one slab — that parallax is most of what sells it as weather.
const LAYERS = [
  { y: 1.15, gain: 1.00 },
  { y: 3.20, gain: 0.68 },
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** 0..1 mist density at hour `h` (plus a floor at night over the water). */
export function mistAmountAt(h, daylight = 1) {
  const t = ((h % 24) + 24) % 24;
  const dawn = sstep(3.7, 5.0, t) * (1 - sstep(6.3, 7.0, t));
  const night = 0.20 * clamp01(1 - daylight * 1.2);
  return Math.min(1, Math.max(dawn, night));
}

export function createMist(world) {
  const n = SEG + 1;
  const verts = n * n;
  const pos = new Float32Array(verts * LAYERS.length * 3);
  const mask = new Float32Array(verts * LAYERS.length);
  const layer = new Float32Array(verts * LAYERS.length);
  const idx = [];
  const half = SPAN * 0.5, step = SPAN / SEG;

  // one height sample per grid point, shared by both layers
  const m0 = new Float32Array(verts);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * step, z = -half + j * step;
    let h = 0;
    try { h = world.height(x, z); } catch { h = 0; }
    // Open water = 1, tapering out by ~5 units of elevation. The sheets are
    // FLAT, so terrain above them occludes the mist anyway — the mask just
    // stops us paying for geometry that can never be seen, and keeps the
    // shoreline band (where the ground is only just under the sheet) strong.
    let m = h <= 0.4 ? 1 : Math.max(0, 1 - (h - 0.4) / 5.0) * 0.75;
    if (h > -1.5 && h < 2.6) m = Math.min(1, m + 0.22);      // hug the shoreline
    // fade the sheet out well before its own edge so the rectangle never shows
    const e = 1 - sstep(half - 210, half - 40, Math.max(Math.abs(x), Math.abs(z)));
    m0[j * n + i] = m * e;
  }

  let v = 0;
  for (let L = 0; L < LAYERS.length; L++) {
    const base = v;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = v * 3;
      pos[k] = -half + i * step;
      pos[k + 1] = LAYERS[L].y;
      pos[k + 2] = -half + j * step;
      mask[v] = m0[j * n + i] * LAYERS[L].gain;
      layer[v] = L;
      v++;
    }
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const a = base + j * n + i, b = a + 1, c = a + n, d = c + 1;
      if (mask[a] + mask[b] + mask[c] + mask[d] <= 0.001) continue;   // skip inland
      idx.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
  geo.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const uniforms = {
    uNear: { value: new THREE.Vector3(0.86, 0.84, 0.90) },
    uFar: { value: new THREE.Vector3(0.92, 0.80, 0.78) },
    uAmt: { value: 0 },
    uTime: { value: 0 },
    uFogN: { value: 80 },
    uFogF: { value: 380 },
    uOutLin: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms, fog: false, transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, blending: THREE.NormalBlending,
    // two flat sheets seen from above: the back-face pass never draws a pixel
    forceSinglePass: true,
    vertexShader: /* glsl */`
      attribute float aMask; attribute float aLayer;
      varying float vMask; varying float vDist; varying vec3 vW; varying float vL;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vMask = aMask; vL = aLayer;
        vec4 mv = viewMatrix * wp;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vMask; varying float vDist; varying vec3 vW; varying float vL;
      uniform vec3 uNear, uFar;
      uniform float uAmt, uTime, uFogN, uFogF, uOutLin;

      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
                   mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main(){
        float dir = vL > 0.5 ? -0.62 : 1.0;
        vec2 p = vW.xz * 0.0085;
        float t = uTime * 0.012 * dir;
        float n = vnoise(p + vec2(t, t * 0.6)) * 0.62
                + vnoise(p * 2.7 - vec2(t * 1.9, t * 0.4)) * 0.38;
        // banks of mist, not a uniform veil
        float a = vMask * uAmt * smoothstep(0.30, 0.76, n);
        // never veil the ground directly under the player (the gameplay camera
        // sits 28 units back, so this keeps the play space clear and puts the
        // weather where it belongs: the middle distance and the bay)
        a *= smoothstep(20.0, 70.0, vDist);
        float f = smoothstep(uFogN, uFogF, vDist);
        vec3 col = mix(uNear, uFar, f);
        a *= mix(1.0, 0.45, f);       // far mist merges into the haze, not onto it
        a = clamp(a, 0.0, 1.0) * 0.58;
        if (a <= 0.004) discard;
        if (uOutLin > 0.5) col = pow(max(col, 0.0), vec3(2.2));
        gl_FragColor = vec4(col, a);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'seaMist';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;                 // after the sea (1) and its foam (2)
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();

  return { mesh, uniforms, material, tris: idx.length / 3 };
}
