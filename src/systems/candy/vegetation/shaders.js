// ─────────────────────────────────────────────────────────────────────────────
// Candyland vegetation — shader plumbing.
//
// Every species is ONE InstancedMesh with ONE merged geometry. To keep that to a
// single draw call while still getting per-instance colour + per-instance motion,
// each material is patched with:
//
//   geometry attributes (per VERTEX, baked by parts.js)
//     aVeg.x  → tint mask   (0 = keep baked vertex colour, 1 = use instance tint)
//     aVeg.y  → motion mask (meaning is species-specific: sway weight / spin flag)
//     uv      → pattern lookup into the swirl/stripe atlas (or a flat corner)
//
//   instanced attributes (per INSTANCE, filled by vegetation.js)
//     aPhase  → random 0..TAU phase so nothing moves in lock-step
//     aTint   → rgb candy colour for this instance
//
//   shared uniforms
//     uTime   → ctx.state.elapsed
//     uNight  → 1 - daylight
//
// Species supply small GLSL snippets; nothing allocates per frame.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const vegUniforms = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uWind: { value: 1 },
};

/**
 * Patch a MeshStandardMaterial for instanced candy vegetation.
 * @param {THREE.Material} material
 * @param {object} o
 *   id            unique string (REQUIRED — three caches programs by material type,
 *                 so without a custom cache key two patched standard materials
 *                 would share the first compiled program).
 *   vertexHead    extra GLSL declarations for the vertex shader
 *   vertexBody    GLSL run right after <begin_vertex> (mutate `transformed`)
 *   fragmentHead  extra GLSL declarations for the fragment shader
 *   fragmentBody  GLSL run right after <color_fragment> (mutate `diffuseColor`)
 *   emissiveBody  GLSL run right after <emissivemap_fragment> (mutate `totalEmissiveRadiance`)
 *   uniforms      extra uniform objects
 */
export function patchMaterial(material, o = {}) {
  const {
    id, vertexHead = '', vertexBody = '', fragmentHead = '', fragmentBody = '',
    emissiveBody = '', uniforms = {},
  } = o;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = vegUniforms.uTime;
    shader.uniforms.uNight = vegUniforms.uNight;
    shader.uniforms.uWind = vegUniforms.uWind;
    for (const k in uniforms) shader.uniforms[k] = uniforms[k];

    shader.vertexShader = [
      'attribute vec2 aVeg;',
      'attribute float aPhase;',
      'attribute vec3 aTint;',
      'uniform float uTime;',
      'uniform float uNight;',
      'uniform float uWind;',
      'varying vec3 vVegTint;',
      'varying vec2 vVegUv;',
      'varying float vVegPhase;',
      'varying float vVegMask;',
      'varying float vVegMotion;',
      vertexHead,
      shader.vertexShader,
    ].join('\n').replace(
      '#include <begin_vertex>',
      ['#include <begin_vertex>',
        'vVegTint = aTint;',
        'vVegUv = uv;',
        'vVegPhase = aPhase;',
        'vVegMask = aVeg.x;',
        'vVegMotion = aVeg.y;',
        vertexBody].join('\n'),
    ).replace(
      '#include <color_vertex>',
      ['#include <color_vertex>',
        '#ifdef USE_COLOR',
        '  vColor *= mix( vec3( 1.0 ), aTint, aVeg.x );',
        '#endif'].join('\n'),
    );

    shader.fragmentShader = [
      'uniform float uTime;',
      'uniform float uNight;',
      'varying vec3 vVegTint;',
      'varying vec2 vVegUv;',
      'varying float vVegPhase;',
      'varying float vVegMask;',
      'varying float vVegMotion;',
      fragmentHead,
      shader.fragmentShader,
    ].join('\n');
    if (fragmentBody) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>', '#include <color_fragment>\n' + fragmentBody);
    }
    if (emissiveBody) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + emissiveBody);
    }
  };
  material.customProgramCacheKey = () => 'candyveg_' + id;
  return material;
}

// ── Shared GLSL fragments ────────────────────────────────────────────────────

/** Bend the whole plant with the wind; `w` is the per-vertex weight expression. */
export const swayGLSL = (w, amp = 0.30, speed = 1.25) => `
  {
    float sw = (${w}) * uWind;
    float t = uTime * ${speed.toFixed(3)} + aPhase;
    transformed.x += (sin(t) * 0.75 + sin(t * 2.31 + 1.7) * 0.25) * ${amp.toFixed(3)} * sw;
    transformed.z += (cos(t * 0.83 + 0.9)) * ${amp.toFixed(3)} * 0.7 * sw;
  }`;

/**
 * TRANSLUCENT GLOSSY CANDY FINISH — the fix for "felt teddy bears on sticks".
 *
 * Runs in the emissiveBody slot, which three evaluates AFTER
 * <normal_fragment_begin>, so `normal` (view space), `vViewPosition` and the
 * light uniforms are all live there. Four additive terms, all masked to the
 * candy part of the plant so trunks and eyes never glow:
 *   1 subsurface — light bleeding through the jelly, strongest into the sun
 *   2 wrap/edge  — a thin lift where the surface turns away, so it reads thick
 *   3 rim        — the backlit edge, in the candy's OWN colour
 *   4 specular   — ONE hard white glint; this is what says "wet gummy"
 * Pair it with roughness ≈ 0.35 and smooth (spherical) vertex normals.
 */
export function candyFinishGLSL({
  mask = 'vVegMask', sss = 0.34, rim = 0.42, rimPow = 2.4,
  spec = 0.8, specPow = 44, glow = 0.0,
} = {}) {
  return `
  {
    float cM = ${mask};
    if ( cM > 0.001 ) {
      vec3 cV = normalize( vViewPosition );
      float cF = 1.0 - clamp( dot( normal, cV ), 0.0, 1.0 );
      #if NUM_DIR_LIGHTS > 0
        vec3 cL = directionalLights[ 0 ].direction;
        vec3 cLC = min( directionalLights[ 0 ].color, vec3( 1.7 ) );
      #else
        vec3 cL = normalize( vec3( 0.42, 0.86, 0.30 ) );
        vec3 cLC = vec3( 1.0 );
      #endif
      float cDay = 1.0 - uNight;
      float cNL = clamp( dot( normal, cL ) * 0.5 + 0.5, 0.0, 1.0 );
      float cBack = pow( clamp( dot( -cV, cL ) * 0.5 + 0.5, 0.0, 1.0 ), 3.0 );
      vec3 cSSS = diffuseColor.rgb * ( ${sss.toFixed(3)} * cBack + ${(sss * 0.6).toFixed(3)} * cNL * cF );
      vec3 cRim = diffuseColor.rgb * mix( 0.8, 2.2, cNL );
      vec3 cH = normalize( cL + cV );
      float cS = pow( max( dot( normal, cH ), 0.0 ), ${specPow.toFixed(1)} );
      // NIGHT: everything here is fresnel-weighted. A flat body fill (this used
      // to be 0.40 x albedo) out-runs the moon key and turns every gummy into a
      // saturated paper cutout; the sky's moon + wash does the night shading now
      // and the candy only keeps a wet edge.
      totalEmissiveRadiance += cM * (
          cSSS * ( 0.35 + 0.65 * cDay )
        + cRim * pow( cF, ${rimPow.toFixed(2)} ) * ( ${rim.toFixed(3)} * cDay + ${(rim * 0.28).toFixed(3)} )
        + cLC * cS * ${spec.toFixed(3)} * cDay
        + cRim * pow( cF, 1.7 ) * ${glow.toFixed(3)} * uNight );
    }
  }`;
}

/** FUZZ — candyfloss. A soft self-coloured rim plus a dithered bite out of the
 *  silhouette, so the puff's outline is fibrous instead of a hard polygon. */
export function fuzzGLSL({ rim = 0.36, cut = 0.70, bite = 2.4 } = {}) {
  return `
  {
    vec3 fV = normalize( vViewPosition );
    float fF = 1.0 - clamp( dot( normal, fV ), 0.0, 1.0 );
    float fN = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    if ( fF > ${cut.toFixed(3)} && fN < ( fF - ${cut.toFixed(3)} ) * ${bite.toFixed(2)} ) discard;
    totalEmissiveRadiance += diffuseColor.rgb * pow( fF, 2.0 )
      * ( ${rim.toFixed(3)} * ( 1.0 - uNight ) + ${(rim * 0.35).toFixed(3)} );
  }`;
}

/**
 * GUMMY BEAR POSE — per-instance head and arms, from one shared geometry.
 * parts.js writes a PART ID into uv.x (gummies have no texture, so uv is free):
 * 0.30 = head group, 0.46/0.58 = left/right arm. Needs uniforms `uNeck` (float,
 * the neck pivot height) and `uArm` (vec2, shoulder x/y) — see gummyTreeGeo().
 * Result: no two bears in a stand hold the same pose, at zero geometry cost.
 */
export const GUMMY_POSE_GLSL = `
  {
    float pid = uv.x;
    if ( pid > 0.24 && pid < 0.38 ) {                 // HEAD: nod + look around
      vec3 pv = vec3( 0.0, uNeck, 0.0 );
      float a = ( fract( aPhase * 0.6180 ) - 0.5 ) * 0.36 + sin( uTime * 0.42 + aPhase ) * 0.035 * uWind;
      float b = ( fract( aPhase * 0.3183 ) - 0.5 ) * 0.95 + sin( uTime * 0.27 + aPhase * 2.1 ) * 0.05 * uWind;
      vec3 d = transformed - pv;
      float c1 = cos( a ), s1 = sin( a );
      d = vec3( d.x, c1 * d.y - s1 * d.z, s1 * d.y + c1 * d.z );
      float c2 = cos( b ), s2 = sin( b );
      d = vec3( c2 * d.x + s2 * d.z, d.y, -s2 * d.x + c2 * d.z );
      transformed = pv + d;
    } else if ( pid > 0.40 ) {                        // ARMS: each side its own
      float sgn = pid < 0.52 ? -1.0 : 1.0;
      vec3 pv = vec3( sgn * uArm.x, uArm.y, 0.0 );
      float a = ( fract( aPhase * ( sgn < 0.0 ? 0.7311 : 0.4371 ) ) - 0.45 ) * 0.9 * sgn
              + sin( uTime * 0.75 + aPhase + ( sgn < 0.0 ? 0.0 : 1.7 ) ) * 0.07 * sgn * uWind;
      vec3 d = transformed - pv;
      float c1 = cos( a ), s1 = sin( a );
      transformed = pv + vec3( c1 * d.x - s1 * d.y, s1 * d.x + c1 * d.y, d.z );
    }
  }`;

/** Uniform "breathing" pulse around the plant's base. */
export const breatheGLSL = (amp = 0.07, speed = 1.6) => `
  {
    float s = 1.0 + sin(uTime * ${speed.toFixed(3)} + aPhase) * ${amp.toFixed(3)};
    transformed.xz *= s;
    transformed.y *= 1.0 + (s - 1.0) * 0.55;
  }`;

// ── Procedural textures (tiny, shared) ───────────────────────────────────────
// Both are single-channel masks read in the fragment shader: 0 = base colour,
// 1 = the instance's candy tint. Pixel-crisp (NearestFilter) on purpose.

/** Lollipop / peppermint spiral. Mask disc centred in UV space; corners are 0. */
export function makeSwirlTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  // corner (0.02,0.02) stays 0 → white; corner (0.98,0.02) is forced to 1 → tint.
  const R = size * 0.5, cx = R, cy = R;
  g.save();
  g.beginPath(); g.arc(cx, cy, R * 0.97, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  for (const arm of [0, Math.PI]) {
    g.beginPath();
    for (let i = 0; i <= 220; i++) {
      const t = i / 220;
      const a = arm + t * Math.PI * 2.25;
      const r = t * R * 0.99;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.lineWidth = size * 0.115;
    g.stroke();
  }
  // solid rim so the disc edge reads as candy, not as a white halo
  g.lineWidth = size * 0.075; g.beginPath(); g.arc(cx, cy, R * 0.94, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx, cy, R * 0.13, 0, Math.PI * 2); g.fill();   // solid heart so the middle never aliases
  g.restore();
  // tint corner
  g.fillStyle = '#fff'; g.fillRect(size - 24, 0, 24, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Starlight-mint pinwheel. Chunky radial wedges: unlike a fine spiral this
 *  survives being minified to twenty screen pixels instead of aliasing into a
 *  spiky asterisk. Corners stay 0 so stems can sample a flat texel. */
export function makePeppermintTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);   // corners = flat (stems sample here)
  const R = size * 0.5;
  g.save();
  g.beginPath(); g.arc(R, R, R * 0.985, 0, Math.PI * 2); g.clip();
  // The disc is mostly TINTED with white spokes cut out of it — a white-based
  // disc disappears against pale frosting ground and reads as a bare asterisk.
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#000';
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    g.beginPath(); g.moveTo(R, R);
    g.arc(R, R, R, a0 + 0.16, a0 + 0.16 + (Math.PI * 2) / (N * 2.3));
    g.closePath(); g.fill();
  }
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(R, R, R * 0.22, 0, Math.PI * 2); g.fill();   // solid candy centre
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4;
  return tex;
}

/** Candy-cane stripes. v runs along the plant; diagonal bands, corners flat. */
export function makeStripeTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  g.strokeStyle = '#fff';
  const N = 4;                      // bands per tile → tiles seamlessly in u
  const run = size * 0.5;           // horizontal drift over one tile height (= 2 bands)
  g.lineWidth = (size / N) * 0.52;
  for (let i = -N * 2; i <= N * 2; i++) {
    const x = (i * size) / N;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + run, size); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}
