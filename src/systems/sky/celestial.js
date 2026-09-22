// Stylised sun disc, big cartoon moon with craters, and a twinkling starfield.
// All raw-sRGB shaders, depth-test off, drawn before the world so terrain
// silhouettes still occlude them.
import * as THREE from 'three';
import { rng, hash } from '../../core/util.js';

// depthTest MUST stay on: these are transparent materials, so three draws them
// after every opaque object regardless of renderOrder — without the depth test
// the sun's halo paints straight over foreground roofs and hills.
const COMMON = { depthWrite: false, depthTest: true, transparent: true, fog: false };

function billboard(size, mat, order) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.frustumCulled = false;
  m.renderOrder = order;
  return m;
}

/** Sun: hot core, coloured disc, soft halo. Radius 0.20 of the quad. */
export function createSun(dist = 800) {
  const uniforms = {
    uDisc: { value: new THREE.Vector3(1, 0.97, 0.88) },
    uCore: { value: new THREE.Vector3(1, 1, 0.98) },
    uGlow: { value: new THREE.Vector3(1, 0.85, 0.6) },
    uGlowS: { value: 0.4 },
    uAlpha: { value: 1 },
    uOutLin: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    ...COMMON, uniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform vec3 uDisc, uCore, uGlow; uniform float uGlowS, uAlpha, uOutLin;
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        const float R = 0.20;
        float disc = 1.0 - smoothstep(R * 0.94, R * 1.08, r);
        float core = 1.0 - smoothstep(R * 0.30, R * 0.86, r);
        float g = clamp(1.0 - (r - R) / (1.0 - R), 0.0, 1.0);
        float glow = pow(g, 4.0) * 0.85 + pow(g, 14.0) * 0.6;
        vec3 col = mix(uGlow, uDisc, disc);
        col = mix(col, uCore, core * 0.9);
        float a = clamp(max(disc, glow * uGlowS), 0.0, 1.0) * uAlpha;
        if (a <= 0.004) discard;
        if (uOutLin > 0.5) col = pow(max(col, 0.0), vec3(2.2));
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const mesh = billboard(dist * 0.30, mat, -990);
  mesh.name = 'sunDisc';
  return { mesh, uniforms, material: mat, dist };
}

/**
 * Moon: big, cream, five craters, wide cool halo.
 * The quad is deliberately oversized relative to the disc (R = 0.24 of a
 * 0.56·dist plane → a ~7.7° disc inside a ~31° pool of glow). The gameplay
 * camera never frames the sky, so in any shot that DOES tilt up, the moon has
 * to announce itself from the edge of frame: the glow is the announcement.
 */
export function createMoon(dist = 780) {
  const uniforms = {
    uBody: { value: new THREE.Vector3(1.0, 0.97, 0.88) },
    uShade: { value: new THREE.Vector3(0.78, 0.78, 0.82) },
    uGlow: { value: new THREE.Vector3(0.62, 0.70, 0.95) },
    uGlowS: { value: 0.55 },
    uAlpha: { value: 0 },
    uOutLin: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    ...COMMON, uniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform vec3 uBody, uShade, uGlow; uniform float uGlowS, uAlpha, uOutLin;
      float crater(vec2 p, vec2 c, float rad){ return smoothstep(rad, rad * 0.35, length(p - c)); }
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        const float R = 0.24;
        float disc = 1.0 - smoothstep(R * 0.968, R * 1.032, r);
        vec2 cp = p / R * 0.30;                                   // craters in disc space
        float c = crater(cp, vec2(-0.088, 0.082), 0.082)
                + crater(cp, vec2( 0.102,-0.052), 0.058)
                + crater(cp, vec2( 0.020, 0.168), 0.044)
                + crater(cp, vec2(-0.150,-0.112), 0.050)
                + crater(cp, vec2( 0.160, 0.118), 0.034);
        vec3 body = mix(uBody, uShade, clamp(c, 0.0, 1.0) * 0.55);
        body *= 1.0 - 0.22 * smoothstep(R * 0.45, R, r);          // limb darkening
        body = mix(body, uBody * 1.04, smoothstep(0.10, -0.16, p.y * 0.6 + p.x * 0.35));
        float g = clamp(1.0 - (r - R) / (1.0 - R), 0.0, 1.0);
        // three glow lobes: a tight ring hugging the limb, a mid pool, and a
        // very wide wash that still carries at 15° off the disc.
        float glow = pow(g, 12.0) * 0.62 + pow(g, 3.2) * 0.78 + pow(g, 1.35) * 0.30;
        vec3 col = mix(uGlow, body, disc);
        float a = clamp(max(disc, glow * uGlowS), 0.0, 1.0) * uAlpha;
        if (a <= 0.004) discard;
        if (uOutLin > 0.5) col = pow(max(col, 0.0), vec3(2.2));
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const mesh = billboard(dist * 0.56, mat, -988);
  mesh.name = 'moonDisc';
  return { mesh, uniforms, material: mat, dist };
}

/**
 * Twinkling starfield on the upper hemisphere. One draw call.
 * Sizes are in DEVICE PIXELS at the game camera, so they were the thing the
 * critic could not see: a 2 px additive dot over a 1600×1000 frame is invisible
 * once anything else is on screen. The dust now starts at ~2.8 px and one star
 * in eight is a 6–12 px hero with a cross flare, which is what actually reads
 * as "stars" at a glance.
 */
export function createStars(count = 1500, radius = 760) {
  const r = rng(hash('sky-stars'));
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const siz = new Float32Array(count);
  const pha = new Float32Array(count);
  const tints = [[1, 1, 1], [0.80, 0.86, 1.0], [1.0, 0.92, 0.80], [0.92, 0.86, 1.0], [1.0, 0.84, 0.88]];
  for (let i = 0; i < count; i++) {
    // bias toward the upper dome; nothing far below the horizon
    const y = 0.02 + Math.pow(r(), 0.62) * 0.98;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const a = r() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * rad * radius;
    pos[i * 3 + 1] = y * radius;
    pos[i * 3 + 2] = Math.sin(a) * rad * radius;
    const t = r.pick(tints);
    const hero = r() < 0.13;
    const b = (hero ? 0.98 : 0.74) + r() * 0.40;
    col[i * 3] = t[0] * b; col[i * 3 + 1] = t[1] * b; col[i * 3 + 2] = t[2] * b;
    // heroes carry the constellation read; the dust fills between them
    siz[i] = hero ? 6.2 + r() * 5.6 : 2.8 + r() * 2.6;
    pha[i] = r() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(pha, 1));
  const uniforms = { uTime: { value: 0 }, uAlpha: { value: 0 }, uPR: { value: 1 }, uGain: { value: 1.0 }, uOutLin: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, depthWrite: false, depthTest: true, transparent: true, fog: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aSize; attribute float aPhase;
      uniform float uTime, uAlpha, uPR, uGain;
      varying vec3 vC; varying float vA; varying float vBig;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.58 + 0.42 * sin(uTime * (0.6 + fract(aPhase) * 2.2) + aPhase * 6.2831);
        gl_PointSize = aSize * uPR * uGain * (0.80 + 0.38 * tw);
        vBig = step(6.0, aSize);
        vC = aColor; vA = uAlpha * (0.62 + 0.38 * tw);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vC; varying float vA; varying float vBig; uniform float uOutLin;
      void main(){
        vec2 q = gl_PointCoord - 0.5;
        float r = length(q) * 2.0;
        // solid core + soft falloff, so a star is a point of light and not a
        // grey smudge once it is more than a couple of pixels across
        float a = (1.0 - smoothstep(0.10, 0.92, r));
        a = a * a * (3.0 - 2.0 * a);
        // hero stars get a faint cross flare (free: no extra geometry)
        float cross = (1.0 - smoothstep(0.0, 0.11, abs(q.x))) + (1.0 - smoothstep(0.0, 0.11, abs(q.y)));
        a = max(a, vBig * cross * (1.0 - smoothstep(0.15, 1.0, r)) * 0.42);
        a *= vA;
        if (a <= 0.004) discard;
        vec3 c = vC;
        if (uOutLin > 0.5) c = pow(max(c, 0.0), vec3(2.2));
        gl_FragColor = vec4(c, a);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -995;
  points.name = 'starfield';
  return { points, uniforms, material: mat };
}
