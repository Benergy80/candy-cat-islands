// GLSL for the instanced-quad particle renderer.
// One quad per particle, billboarded in view space (or laid flat on the ground
// for decals/ripples). Shape is an SDF-ish mask chosen per particle so a single
// draw call can mix soft puffs, sparkles, confetti, petals, hearts and paw prints.
//
// Attributes (per instance):
//   iPos   vec3  world position
//   iColor vec3  colour (already lerped start→end on the CPU)
//   iAttr  vec4  (size, rotation, alpha, packed)  packed = shape + 16*flat

export const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec3 iColor;
attribute vec4 iAttr;

uniform float uViewH;                    // drawing-buffer height in pixels

varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying vec2 vQuad;

#ifdef USE_FOG
  varying float vFogDepth;
#endif

// A quad narrower than ~3 px cannot hold a radial falloff: the mask collapses
// to one or two lit texels and the sprite reads as a hard little CHIP — which
// is exactly the "faint square sprite quads littering the lawn" note. So no
// sprite is ever drawn below MIN_PX: it is grown to that size and its alpha is
// divided by the growth (same total light), then faded right out under ~3 px.
// Net effect: distant motes dissolve smoothly instead of turning into litter.
const float MIN_PX = 3.2;

void main() {
  float size   = iAttr.x;
  float rot    = iAttr.y;
  vAlpha       = iAttr.z;
  float packed = iAttr.w;
  float isFlat = step(15.5, packed);
  vShape       = packed - isFlat * 16.0;
  vColor       = iColor;
  vQuad        = position.xy;            // -0.5 .. 0.5

  vec4 centre = modelViewMatrix * vec4(iPos, 1.0);
  float depth = max(0.05, -centre.z);
  // pixels per world unit at this depth (projectionMatrix[1][1] = 1/tan(fov/2))
  float pxPerUnit = uViewH * projectionMatrix[1][1] * 0.5 / depth;
  float px = size * pxPerUnit;
  float grow = clamp(MIN_PX / max(px, 1e-5), 1.0, 3.0);
  size *= grow;
  vAlpha *= smoothstep(0.85, 3.0, px) / grow;

  float c = cos(rot), s = sin(rot);
  vec2 q = position.xy * size;
  vec2 rq = vec2(q.x * c - q.y * s, q.x * s + q.y * c);

  vec4 mv;
  if (isFlat > 0.5) {
    mv = modelViewMatrix * vec4(iPos.x + rq.x, iPos.y, iPos.z + rq.y, 1.0);
  } else {
    mv = centre;
    mv.xy += rq;
  }

  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif

  gl_Position = projectionMatrix * mv;
}
`;

export const FRAG = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying vec2 vQuad;

#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying float vFogDepth;
#endif

// ── shape masks (p = -0.5..0.5) ─────────────────────────────────────────────
// EVERY round mask below is built on bell(): a Hermite falloff of the radius,
// so the mask AND its slope are exactly zero at d = 1 (the inscribed circle of
// the quad). No silhouette, no rim, no texture — a glint can never show the
// edge of its own quad, at any size, on any GL.
float bell(vec2 p) {
  float d = clamp(length(p) * 2.0, 0.0, 1.0);
  float g = 1.0 - d;
  return g * g * (3.0 - 2.0 * g);        // smoothstep(0,1,g)
}
float sSoft(vec2 p) {
  float b = bell(p);
  return b * b;
}
float sSparkle(vec2 p) {
  vec2 q = p * 2.0;
  float d = length(q);
  float env  = 1.0 - smoothstep(0.04, 1.0, d);
  float arm  = 1.0 - smoothstep(0.0, 0.24, min(abs(q.x), abs(q.y)));
  float dq   = abs(q.x + q.y) * 0.7071;
  float dq2  = abs(q.x - q.y) * 0.7071;
  float diag = 1.0 - smoothstep(0.0, 0.09, min(dq, dq2));
  float core = smoothstep(0.26, 0.0, d);
  return clamp(env * (0.10 + 0.92 * arm + 0.30 * diag) + core, 0.0, 1.0);
}
float sConfetti(vec2 p) {
  vec2 q = abs(p * vec2(2.0, 3.4));
  return smoothstep(1.0, 0.78, max(q.x, q.y));
}
float sRing(vec2 p) {
  float d = length(p) * 2.0;
  return smoothstep(1.02, 0.78, d) * smoothstep(0.40, 0.72, d);
}
float sLeaf(vec2 p) {
  vec2 q = p * 2.0;
  q.x /= (0.40 + 0.68 * (q.y * 0.5 + 0.5));
  return smoothstep(1.0, 0.22, length(q));
}
float sHeart(vec2 p) {
  vec2 q = p * 2.4;
  q.y += 0.08;
  float a = q.x * q.x + q.y * q.y - 1.0;
  float f = a * a * a - q.x * q.x * q.y * q.y * q.y;
  return smoothstep(0.06, -0.02, f);
}
// Paw: one big pad + four toes, edges kept tight so the print stays a paw and
// does not smear into a blurry glyph at decal sizes.
float sPaw(vec2 p) {
  vec2 q = p * 2.0;
  float a = smoothstep(0.62, 0.50, length((q - vec2(0.0, -0.30)) * vec2(1.05, 1.30)));
  a = max(a, smoothstep(0.30, 0.19, length((q - vec2(-0.46, 0.26)) * vec2(1.0, 0.86))));
  a = max(a, smoothstep(0.30, 0.19, length((q - vec2(-0.17, 0.52)) * vec2(1.0, 0.86))));
  a = max(a, smoothstep(0.30, 0.19, length((q - vec2( 0.17, 0.52)) * vec2(1.0, 0.86))));
  a = max(a, smoothstep(0.30, 0.19, length((q - vec2( 0.46, 0.26)) * vec2(1.0, 0.86))));
  return a;
}
// Lamp/lantern halo and every soft round GLINT: pure procedural radial falloff
// (no texture, so SwiftShader renders it identically), hot core, mask and slope
// both exactly 0 at the inscribed circle so there is never a circular seam or a
// visible quad corner.
float sGlow(vec2 p) {
  float b = bell(p);
  return b * (0.34 + 0.66 * b * b);
}
// Ground light pool: the widest, flattest falloff in the set. A pool is 6+ units
// across on screen, so any shoulder in the curve quantises into a concentric
// RING at 8 bits. (1-d²)³ has no shoulder at all — plus the dither below.
float sPool(vec2 p) {
  float d = clamp(length(p) * 2.0, 0.0, 1.0);
  float g = 1.0 - d * d;
  return g * g * g;
}
float sPuff(vec2 p) {
  vec2 q = p * 2.0;
  float a = 1.0 - smoothstep(0.24, 0.92, length(q - vec2(-0.28, -0.14)));
  a = max(a, 1.0 - smoothstep(0.20, 0.86, length(q - vec2(0.30, -0.06))));
  a = max(a, 1.0 - smoothstep(0.24, 0.98, length(q - vec2(0.00,  0.28))));
  return a * a;
}

void main() {
  float m;
  if (vShape < 0.5)       m = sSoft(vQuad);
  else if (vShape < 1.5)  m = sSparkle(vQuad);
  else if (vShape < 2.5)  m = sConfetti(vQuad);
  else if (vShape < 3.5)  m = sRing(vQuad);
  else if (vShape < 4.5)  m = sLeaf(vQuad);
  else if (vShape < 5.5)  m = sHeart(vQuad);
  else if (vShape < 6.5)  m = sPaw(vQuad);
  else if (vShape < 7.5)  m = sPuff(vQuad);
  else if (vShape < 8.5)  m = sGlow(vQuad);
  else                    m = sPool(vQuad);

  // Ordered-ish hash dither on the alpha. A 7-unit light pool spans hundreds of
  // pixels over an alpha range of 0.2, i.e. ~50 distinct 8-bit levels — which
  // the eye reads as concentric rings. ±0.6/255 of noise turns the steps into
  // grain and the pool into a smooth falloff. Costs one sin().
  float dth = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float a = m * vAlpha + (dth - 0.5) * (1.2 / 255.0);
  if (a < 0.008) discard;

  gl_FragColor = vec4(vColor, a);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  #ifdef USE_FOG
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #ifdef PARTICLE_ADDITIVE
      // additive light must fade OUT into fog, never add the fog colour
      gl_FragColor.a *= (1.0 - fogFactor);
    #else
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
    #endif
  #endif

  // PREMULTIPLIED output (the material declares premultipliedAlpha), so the
  // blender never interpolates towards an unlit texel colour at the sprite rim:
  // normal → ONE / ONE_MINUS_SRC_ALPHA, additive → ONE / ONE. A mask that
  // reaches zero therefore contributes exactly nothing — no dark fringe, no
  // bright seam, no visible quad boundary.
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;
