// ─────────────────────────────────────────────────────────────────────────────
// POWERUPS — INVINCIBILITY STARS (wave 3, BRIEF contract B).
//
// Two dozen fat gold stars, twelve per island, hung where wandering pays off:
// on the licorice, on the Great Cupcake's summit balcony, over a river bridge
// at double-jump height, over the sea for the canoe, and one at the very top of
// the Big Fling's arc for anyone brave enough to be thrown through it. Catch one
// and the visitor is INVINCIBLE for 10 s: enemies flee (they read `active`),
// 25 % faster feet, a rainbow rim-light round the tourist, rainbow sparkles
// orbiting him, and a HUD pill that counts it down.
//
// READABILITY (polish pass): a star always turns its face to the lens (it
// sways and twirls, it never sits edge-on), wears a navy outline and a rainbow
// ring so it is never mistaken for a gold lollipop or a yellow gummy bear, and
// stands in a tall rainbow beacon that marks its spot from across the island.
// The visitor keeps his own colours while invincible: the rainbow lives on his
// silhouette (a fresnel rim) and in the sparkles, never on his skin.
//
// PUBLIC API (ctx.systems.powerups):
//   active (bool) · timeLeft (s) · duration (10)
//   stars  [{ id, x, y, z, taken, island, kind, label }]   (y = star centre)
//   grant(secs?)      start / refresh the effect without a star (tests, cheats)
//   end()             stop the effect now (restores the visitor exactly)
//   collect(id|star)  collect a star as if touched
//   respawnAll()      every star back at once
//   nearest(x, z)     nearest untaken star
//   stage(id, dist?, bearing?)  stand the visitor beside a star, on its floor
//                     (views + tests); returns { x, y, z } or null
// EVENTS: 'powerup:star' { on:true, id, x, z, duration } when the effect starts,
//         { on:false } when it ends · 'powerup:collect' { id, x, y, z } per star.
// WRITES (every frame while active): player.invulnerable = true,
//         player.speedBoost = 1.25 (set back to 1 at the end).
// READS (defensively): player.position/group/onVehicle/onFerry/groundInfo,
//         ctx.state.flying, particles.burst/sparkle/confetti/ripple, ui.toast,
//         ui.addMapMarker/removeMapMarker, audio.play, camera.shake/snap,
//         inventory.pickups (keeps stars off the pickups).
//
// DRAW CALLS: 2 + 1 shadow pass. Stars = one InstancedMesh (24 × 96 tris:
//   faceted star + inverted-hull outline, vertex-coloured, emissive masked off
//   the eyes and the outline). Glow = one more InstancedMesh (premultiplied
//   blend) of quads: a halo + rainbow ring behind each star, a warm pool of
//   light under it (a gold "jump here" ring under the double-jump stars), a
//   beacon beam per star, and — while the effect runs — the visitor's orbiting
//   sparkles and the dashed rainbow ring at his feet.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, hash, clamp } from '../core/util.js';

const DURATION = 10;          // seconds of invincibility per star
const RESPAWN = 120;          // seconds before a taken star comes back
const COLLECT_R = 1.6;        // on foot: star centre ↔ body centre
const RIDE_R = 3.2;           // riding (canoe, flyer, catapult, ferry)
const MAGNET_R = 8.0;         // riding: a star this close homes in on you
const SPEED_BOOST = 1.25;
const BODY_Y = 0.9;           // feet → body centre
const GROUND_LIFT = 1.25;     // star centre above the floor (on-foot stars)
const JUMP_LIFT = 4.4;        // needs the double jump: single-hop centre peaks at 2.5
const SEA_Y = 1.6;            // over-water stars (canoe height)
const SPARKLE_R = 70;         // stars further than this from the observer stay quiet
const DISCOVER_R = 26;        // seen from here → the star goes on the map
const BEAM_UP = 13;           // the beacon rises this far above the star
const BEAM_W = 1.3;           // beacon width (the hot core is a sixth of it)
const BEAM_NEAR = 120, BEAM_FAR = 185;   // beacons fade out between these lens distances
const ORBIT_N = 7;            // rainbow sparkles circling the invincible visitor

// ── THE STARS ────────────────────────────────────────────────────────────────
// kind: ground (on the floor), deck (on a walkable roof/terrace), jump (double-
// jump height), sea (over water), sky (absolute y; riders and the flyer).
// Coordinates were measured (wave 3) against the colliders, a nothing-overhead
// ray test and a line-of-sight test from eight camera azimuths — every on-foot
// star is visible from the default iso camera. At runtime every ground/deck
// star is nudged again if some later prop has moved into its spot.
const SITES = [
  // ── Candyland ──────────────────────────────────────────────────────────────
  { id: 'candy_meadow',  island: 'candy', kind: 'ground', x: -103.4, z: -56.0, label: 'Lollipop Meadow' },
  { id: 'candy_village', island: 'candy', kind: 'ground', x: -138.1, z: 37.2,  label: 'Gumdrop Village' },
  { id: 'candy_forest',  island: 'candy', kind: 'ground', x: -194.8, z: -7.6,  label: 'Gummy Forest clearing' },
  { id: 'candy_lake',    island: 'candy', kind: 'ground', x: -180.3, z: 32.5,  label: 'Chocolate Lake path' },
  { id: 'candy_delta',   island: 'candy', kind: 'ground', x: -95.3,  z: 68.0,  label: 'Syrup Delta' },
  { id: 'candy_cliffs',  island: 'candy', kind: 'ground', x: -217.3, z: 8.5,   label: 'top of Gumdrop Cliffs' },
  { id: 'candy_bridge',  island: 'candy', kind: 'jump',   x: -131.1, z: 16.3,  label: 'over the Syrup bridge (double jump)' },
  // hangs in the open just past the summit balcony's railing (tucked in against
  // the frosting it was hidden from most of the compass); reach out from the rail
  { id: 'candy_cupcake', island: 'candy', kind: 'deck',   x: -84.85, z: -8.4,  deck: [-85.1, -9.2], label: 'Great Cupcake summit balcony, just past the railing' },
  { id: 'candy_palace',  island: 'candy', kind: 'deck',   x: -134.0, z: -35.6, label: 'Candy Palace terrace' },
  { id: 'candy_peak',    island: 'candy', kind: 'sky',    x: -175.0, z: -62.0, y: 36.0, label: 'above the Frosting Peak cherry' },
  { id: 'candy_fling',   island: 'candy', kind: 'sky',    x: -40.0,  z: 46.6,  y: 12.8, label: 'the Big Fling splashdown' },
  { id: 'candy_sea',     island: 'candy', kind: 'sea',    x: -86.0,  z: 97.0,  label: 'off the Syrup Delta' },
  // ── Cat Island ─────────────────────────────────────────────────────────────
  { id: 'cat_plaza',     island: 'cat', kind: 'ground', x: 70.0,  z: 19.7,  label: 'Welcome Plaza' },
  { id: 'cat_commons',   island: 'cat', kind: 'ground', x: 137.5, z: -46.9, label: 'Catnip Commons' },
  { id: 'cat_gym',       island: 'cat', kind: 'ground', x: 196.1, z: -15.3, label: 'Muscle Beach' },
  { id: 'cat_heights',   island: 'cat', kind: 'ground', x: 176.0, z: 40.3,  label: 'Whisker Heights' },
  { id: 'cat_harbor',    island: 'cat', kind: 'ground', x: 100.1, z: 52.7,  label: 'Fish Harbor' },
  { id: 'cat_beach',     island: 'cat', kind: 'ground', x: 228.6, z: -5.8,  label: 'Not-An-Exit Beach' },
  { id: 'cat_square',    island: 'cat', kind: 'jump',   x: 164.3, z: 21.0,  label: 'over the Heights road off Purrliament Square (double jump)' },
  { id: 'cat_tower',     island: 'cat', kind: 'deck',   x: 214.5, z: 36.7,  label: 'Watchtower plinth' },
  { id: 'cat_yarn',      island: 'cat', kind: 'sky',    x: 188.0, z: -64.0, y: 30.0, label: 'above the Yarn Ball' },
  { id: 'cat_field',     island: 'cat', kind: 'sky',    x: 210.0, z: 12.0,  y: 15.0, label: 'over Wing Nut Field' },
  { id: 'cat_cove',      island: 'cat', kind: 'sea',    x: 250.0, z: 46.0,  label: 'off Smuggler\'s Cove' },
  { id: 'cat_fling',     island: 'cat', kind: 'sky',    x: 47.0,  z: 60.9,  y: 72.4, label: 'top of the Big Fling arc' },
];

// ── geometry: a chunky, pillowy five-point star with two little eyes ────────
// Tip-to-tip 1.12 u. Front and back bulge to a point (faceted, so the facets
// catch the sun), rim 0.26 u thick. Vertex colours: bright centre, gold tips,
// deeper notches, navy eyes (the eyes are masked out of the emissive glow).
// Round it all sits an OUTLINE: an inflated copy wound inside-out (the inverted
// hull), so the one front-face-culled material draws only its far side — a
// navy rim round the silhouette from every angle.
function starGeometry() {
  const R = 0.62, r = 0.285, ZC = 0.34, ZE = 0.13;
  const cTip = new THREE.Color(0xffc81f), cNotch = new THREE.Color(0xf29a0c), cMid = new THREE.Color(0xfff3b4);
  const cEye = new THREE.Color(0x2b2442), cLine = new THREE.Color(0x2b2442);
  const pos = [], col = [];
  const ring = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? R : r;
    ring.push([Math.cos(a) * rr, Math.sin(a) * rr, i % 2 === 0 ? cTip : cNotch]);
  }
  const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); };
  for (let i = 0; i < 10; i++) {
    const a = ring[i], b = ring[(i + 1) % 10];
    // front fan (CCW seen from +z)
    push(0, 0, ZC, cMid); push(a[0], a[1], ZE, a[2]); push(b[0], b[1], ZE, b[2]);
    // back fan
    push(0, 0, -ZC, cMid); push(b[0], b[1], -ZE, b[2]); push(a[0], a[1], -ZE, a[2]);
    // rim quad
    push(a[0], a[1], ZE, a[2]); push(a[0], a[1], -ZE, a[2]); push(b[0], b[1], -ZE, b[2]);
    push(a[0], a[1], ZE, a[2]); push(b[0], b[1], -ZE, b[2]); push(b[0], b[1], ZE, b[2]);
  }
  // eyes: a flattened octahedron each, sitting proud of both faces
  const eye = (ex, ey, side) => {
    const w = 0.052, h = 0.095, d = 0.04;
    const zc = side * (ZC - (ZC - ZE) * (Math.hypot(ex, ey) / r) + 0.012);
    const P = [[ex + w, ey, zc], [ex, ey + h, zc], [ex - w, ey, zc], [ex, ey - h, zc]];
    const F = [ex, ey, zc + side * d];
    for (let i = 0; i < 4; i++) {
      const a = P[i], b = P[(i + 1) % 4];
      if (side > 0) { push(F[0], F[1], F[2], cEye); push(a[0], a[1], a[2], cEye); push(b[0], b[1], b[2], cEye); }
      else { push(F[0], F[1], F[2], cEye); push(b[0], b[1], b[2], cEye); push(a[0], a[1], a[2], cEye); }
    }
  };
  for (const s of [1, -1]) { eye(-0.105, 0.035, s); eye(0.105, 0.035, s); }
  // the outline shell: same fans + rim, pushed out, every triangle reversed
  const OR = R + 0.115, Or = r + 0.07, OZC = ZC + 0.075, OZE = ZE + 0.07;
  const oring = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? OR : Or;
    oring.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  for (let i = 0; i < 10; i++) {
    const a = oring[i], b = oring[(i + 1) % 10];
    push(0, 0, OZC, cLine); push(b[0], b[1], OZE, cLine); push(a[0], a[1], OZE, cLine);
    push(0, 0, -OZC, cLine); push(a[0], a[1], -OZE, cLine); push(b[0], b[1], -OZE, cLine);
    push(a[0], a[1], OZE, cLine); push(b[0], b[1], -OZE, cLine); push(a[0], a[1], -OZE, cLine);
    push(a[0], a[1], OZE, cLine); push(b[0], b[1], OZE, cLine); push(b[0], b[1], -OZE, cLine);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ── glow quads: ONE premultiplied instanced mesh, several instance kinds ─────
// aKind 0 = halo behind a star (soft core, 5 slow rays, rainbow ring) ·
// 1 = warm pool of light on the floor under it · 3 = gold "jump here" ring ·
// 4 = the star's beacon (a vertical beam that turns round its own axis to
// face the lens; instance colour r = where the star sits along it, g = its
// strength, b = 1 under a sky star) · 5 = a rainbow sparkle orbiting the invincible visitor ·
// 6 = the dashed rainbow ring at his feet (instance colour r = strength).
// Size comes from the instance scale (0 = hidden). Everything fades out in
// fog instead of adding the fog colour, like the particle system's pool.
const HALO_VS = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  attribute float aKind;
  varying vec2 vUv;
  varying float vPh;
  varying float vKind;
  varying vec3 vCol;
  void main() {
    float sx = length(instanceMatrix[0].xyz);
    float sy = length(instanceMatrix[1].xyz);
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #else
      vCol = vec3(1.0, 0.78, 0.32);
    #endif
    vec3 wc = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vPh = fract(sin(dot(wc.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
    vKind = aKind;
    vUv = position.xy;
    vec4 mvPosition;
    if (aKind > 3.5 && aKind < 4.5) {
      vec2 tc = cameraPosition.xz - wc.xz;
      tc = tc / max(length(tc), 0.0001);
      vec3 side = vec3(tc.y, 0.0, -tc.x);
      mvPosition = modelViewMatrix * vec4(wc + side * (position.x * sx) + vec3(0.0, position.y * sy, 0.0), 1.0);
    } else if ((aKind > 0.5 && aKind < 1.5) || (aKind > 2.5 && aKind < 3.5) || aKind > 5.5) {
      mvPosition = modelViewMatrix * vec4(wc + vec3(position.x * sx, 0.0, -position.y * sx), 1.0);
    } else {
      mvPosition = modelViewMatrix * vec4(wc, 1.0);
      mvPosition.xy += position.xy * sx;
      if (aKind < 0.5) mvPosition.z -= 0.55 * step(0.001, sx);
    }
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const HALO_FS = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform float uIntensity;
  uniform float uPool;
  uniform float uSolid;
  uniform float uTime;
  varying vec2 vUv;
  varying float vPh;
  varying float vKind;
  varying vec3 vCol;
  vec3 rainbow(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main() {
    vec3 col = vec3(0.0);
    float alpha = 0.0;      // premultiplied: 0 = pure additive glow
    if (vKind > 3.5 && vKind < 4.5) {
      // BEACON: white-hot core, rainbow flanks, glints climbing it
      float x = vUv.x * 2.0;
      float y = vUv.y + 0.5;
      float ys = vCol.r;
      float soft = exp(-x * x * 4.5);
      float core = exp(-x * x * 42.0);
      float up = clamp((y - ys) / max(1.0 - ys, 0.01), 0.0, 1.0);
      float below = clamp(y / max(ys, 0.01), 0.0, 1.0);
      // under a star on the floor the beam stands on it; under a sky star
      // (instance colour b = 1) it thins away to nothing
      float prof = y > ys ? pow(1.0 - up, 1.6) : (vCol.b > 0.5 ? below * below : mix(0.5, 1.0, below));
      prof *= smoothstep(0.0, 0.03, y);
      float g = fract(y * 8.0 - uTime * 0.65 + vPh);
      float glint = smoothstep(0.0, 0.05, g) * (1.0 - smoothstep(0.05, 0.24, g));
      vec3 rb = rainbow(fract(y * 1.5 - uTime * 0.16 + vPh * 0.159));
      vec3 c = mix(mix(vec3(1.0), rb, 0.8), vec3(1.0, 0.98, 0.9), core);
      float a = (soft * 0.5 + core * 0.8 + glint * soft * 0.7) * prof * vCol.g;
      // by day only the core and the glints lay down paint; the soft flanks
      // stay light, so a beam near the lens is never a haze over the visitor
      float cover = clamp((core * 0.9 + soft * 0.22 + glint * soft * 0.6) * prof * vCol.g * uSolid * 0.62, 0.0, 0.72);
      col = c * (a * uIntensity * 0.95 + cover);
      alpha = cover;
    } else if (vKind > 4.5 && vKind < 5.5) {
      // a four-point rainbow sparkle, white in the middle
      vec2 q = abs(vUv * 2.0);
      float v = sqrt(q.x) + sqrt(q.y);
      float shape = 1.0 - smoothstep(0.7, 0.9, v);
      if (shape <= 0.0) discard;
      float hot = exp(-dot(q, q) * 16.0);
      vec3 c = mix(vCol, vec3(1.0), hot * 0.85);
      float cover = shape * clamp(uSolid * 1.35, 0.0, 1.0);
      col = c * (shape * (0.3 + uIntensity * 0.85) + cover);
      alpha = cover;
    } else {
      float d = length(vUv) * 2.0;
      if (d > 1.0) discard;
      float ang = atan(vUv.y, vUv.x);
      if (vKind > 5.5) {
        // the visitor's ring: eight rainbow dashes chasing round his feet
        float ring = 1.0 - smoothstep(0.04, 0.085, abs(d - 0.8));
        float f = fract(ang * 1.27324 - uTime * 1.1);
        float dash = smoothstep(0.16, 0.26, f) * (1.0 - smoothstep(0.9, 0.99, f));
        vec3 rb = rainbow(fract(ang / 6.28318 + uTime * 0.45));
        float a = ring * dash * vCol.r;
        float cover = a * clamp(uSolid * 1.2, 0.0, 0.9);
        col = rb * (a * (0.25 + uIntensity * 0.9) + cover);
        alpha = cover;
      } else if (vKind > 2.5) {
        // "jump here": a gold target ring on the floor under a double-jump star,
        // painted solid by day (premultiplied) and glowing by night
        float ring = 1.0 - smoothstep(0.0, 0.12, abs(d - 0.76));
        float inner = exp(-d * d * 4.0) * 0.35;
        float pulse = 0.8 + 0.2 * sin(uTime * 4.0 + vPh);
        float cover = ring * clamp(uSolid * 1.1, 0.0, 0.8) * pulse;
        col = vCol * (ring + inner) * (0.25 + uPool) * pulse + vCol * cover * 0.9;
        alpha = cover;
      } else if (vKind > 0.5) {
        float pool = exp(-d * d * 3.2) * (1.0 - smoothstep(0.7, 1.0, d));
        float breathe = 0.82 + 0.18 * sin(uTime * 2.3 + vPh);
        col = vCol * pool * breathe * uPool;
      } else {
        // halo: soft core + five slow rays + a rainbow ring just outside the tips
        float core = exp(-d * d * 9.0);
        float rays = pow(max(0.0, cos(ang * 5.0 + uTime * 0.7 + vPh)), 10.0) * (1.0 - d);
        float tw = 0.85 + 0.15 * sin(uTime * 3.1 + vPh);
        float glow = (core * 0.85 + rays * 0.55) * (1.0 - smoothstep(0.55, 1.0, d)) * tw;
        float ring = 1.0 - smoothstep(0.03, 0.075, abs(d - 0.64));
        vec3 rb = rainbow(fract(ang / 6.28318 - uTime * 0.3 + vPh * 0.159));
        float cover = ring * clamp(uSolid * 1.3, 0.0, 0.92);
        col = vCol * glow * uIntensity + rb * (ring * (0.2 + uIntensity * 0.9) + cover);
        alpha = cover;
      }
    }
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      col *= 1.0 - fogF;
      alpha *= 1.0 - fogF;
    #endif
    gl_FragColor = vec4(col, alpha);
  }
`;

// The visitor's rainbow rim-light, patched into CLONES of his materials only.
// A fresnel term lights the silhouette; its hue runs up his body and cycles.
// The base colours (skin, shirt, shorts) are left exactly as they are.
const RIM_GLSL = `#include <emissivemap_fragment>
  {
    float pwFr = 1.0 - clamp(abs(dot(normal, normalize(-vViewPosition))), 0.0, 1.0);
    float pwRim = smoothstep(0.32, 0.92, pwFr);
    float pwH = fract(vViewPosition.y * 0.42 - uStarT * 0.85);
    vec3 pwRb = clamp(abs(mod(pwH * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    totalEmissiveRadiance += pwRb * pwRim * uStarRim;
  }`;

// Rainbow, in order, for the orbiting sparkles and the sparkle trail.
const RAINBOW = [0xff4f7a, 0xff9a2e, 0xffe54a, 0x5be27a, 0x3aa8ff, 0xb35bff];
const STAR_PATH = 'M12 1.8 l3.1 6.5 l7.1 1 l-5.2 5 l1.3 7.1 L12 18 l-6.3 3.4 l1.3 -7.1 L1.8 9.3 l7.1 -1 Z';

const CSS = `
#ui .cci-star-pill {
  left: 50%; bottom: 140px; z-index: 22; pointer-events: none; display: none;
  align-items: center; gap: 9px; padding: 6px 14px 6px 7px; border-radius: 999px;
  white-space: nowrap;
}
#ui .cci-star-pill .sp-ico { width: 32px; height: 32px; flex: none; filter: drop-shadow(0 2px 0 rgba(43,36,66,.55)); }
#ui .cci-star-pill .sp-ico svg { width: 100%; height: 100%; display: block; overflow: visible; }
#ui .cci-star-pill .sp-ico path { fill: #ffd23a; stroke: #2b2442; stroke-width: 1.7; stroke-linejoin: round; }
#ui .cci-star-pill .sp-txt { display: flex; flex-direction: column; gap: 4px; }
#ui .cci-star-pill .sp-lbl { font: 800 13.5px/1 var(--fdisp, sans-serif); letter-spacing: .09em; color: var(--ink, #2f2748); }
#ui .cci-star-pill .sp-bar { width: 104px; height: 8px; border-radius: 999px; background: rgba(43,36,66,.16);
  border: 2px solid var(--edge, #2b2442); overflow: hidden; box-sizing: content-box; }
#ui .cci-star-pill .sp-bar i { display: block; height: 100%; width: 100%; transform-origin: 0 50%;
  background: linear-gradient(90deg, #ff4f7a, #ff9a2e, #ffe54a, #5be27a, #3aa8ff, #b35bff); }
#ui .cci-star-pill .sp-t { font: 800 21px/1 var(--fdisp, sans-serif); color: var(--ink, #2f2748);
  min-width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
#ui .cci-star-pill.warn .sp-t { color: #e23a6e; }
@media (max-width: 760px), (max-height: 520px) {
  #ui .cci-star-pill { gap: 6px; padding: 4px 10px 4px 5px; }
  #ui .cci-star-pill .sp-ico { width: 24px; height: 24px; }
  #ui .cci-star-pill .sp-lbl { font-size: 11px; }
  #ui .cci-star-pill .sp-bar { width: 72px; height: 6px; }
  #ui .cci-star-pill .sp-t { font-size: 16px; min-width: 34px; }
}
`;

export function create(ctx) {
  const { scene, world } = ctx;
  const rnd = rng(hash('powerups'));
  const N = SITES.length;

  // ── meshes ──────────────────────────────────────────────────────────────
  const starMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.42, metalness: 0.0, flatShading: true,
    emissive: new THREE.Color(0xffb020), emissiveIntensity: 0.4,
  });
  // the eyes and the outline (dark vertex colour) must not glow with the star
  starMat.onBeforeCompile = (sh) => {
    if (!sh.fragmentShader.includes('#include <emissivemap_fragment>')) return;
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= smoothstep( 0.3, 0.85, vColor.r );',
    );
  };
  starMat.customProgramCacheKey = () => 'powerup-star';
  const starGeo = starGeometry();
  const starMesh = new THREE.InstancedMesh(starGeo, starMat, N);
  starMesh.name = 'powerups_stars';
  starMesh.castShadow = !ctx.state?.mobile; starMesh.receiveShadow = false;   // contract I: props cast no shadow on phones
  starMesh.frustumCulled = false;             // spread over both islands + the sky
  starMesh.userData.noFade = true;
  starMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const haloMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uIntensity: { value: 0.5 }, uPool: { value: 0 }, uTime: { value: 0 }, uSolid: { value: 0 },
    }]),
    vertexShader: HALO_VS, fragmentShader: HALO_FS,
    // premultiplied "over": rgb is added, alpha darkens what is behind — so a
    // fragment with alpha 0 is a plain additive glow and the rings can still
    // paint solid colour by day. One draw call for every glow in this system.
    transparent: true, depthWrite: false, depthTest: true, fog: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  // instances: [0,N) halos · [N,2N) floor pools / jump rings · [2N,3N) beacons
  //            [ORB, ORB+ORBIT_N) the visitor's sparkles · FEET his ring
  const BEAM = N * 2, ORB = N * 3, FEET = N * 3 + ORBIT_N, NH = FEET + 1;
  const haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, NH);
  const kinds = new Float32Array(NH);
  kinds.fill(1, N, 2 * N); kinds.fill(4, BEAM, BEAM + N); kinds.fill(5, ORB, ORB + ORBIT_N); kinds[FEET] = 6;
  for (let i = 0; i < N; i++) if (SITES[i].kind === 'jump') kinds[N + i] = 3;   // target ring
  haloGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 1));
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  {
    const cHalo = new THREE.Color(1.0, 0.78, 0.32), cPool = new THREE.Color(1.0, 0.66, 0.22);
    const cRing = new THREE.Color(1.0, 0.84, 0.3), cOff = new THREE.Color(0, 0, 0), cTmp = new THREE.Color();
    for (let i = 0; i < N; i++) {
      haloMesh.setColorAt(i, cHalo);
      haloMesh.setColorAt(N + i, SITES[i].kind === 'jump' ? cRing : cPool);
      haloMesh.setColorAt(BEAM + i, cOff);
    }
    for (let j = 0; j < ORBIT_N; j++) haloMesh.setColorAt(ORB + j, cTmp.setHex(RAINBOW[j % RAINBOW.length]));
    haloMesh.setColorAt(FEET, cOff);
    for (let i = 0; i < NH; i++) haloMesh.setMatrixAt(i, ZERO);
  }
  haloMesh.name = 'powerups_halos';
  haloMesh.frustumCulled = false; haloMesh.castShadow = false; haloMesh.receiveShadow = false;
  haloMesh.renderOrder = 5;
  haloMesh.userData.noFade = true; haloMesh.userData.noOcclude = true;
  haloMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  haloMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

  const group = new THREE.Group();
  group.name = 'powerups';
  group.add(starMesh, haloMesh);
  scene.add(group);

  // ── star records (the public `stars` array holds these very objects) ───────
  const stars = SITES.map((s, i) => ({
    id: s.id, island: s.island, kind: s.kind, label: s.label,
    x: s.x, y: s.y ?? 3, z: s.z, taken: false,
    index: i, phase: rnd() * Math.PI * 2, spin: 1.9 + rnd() * 0.7,
    respawnT: 0, pop: 1, pull: 0, floorY: 0, dx: 0, dy: 0, dz: 0, sparkAcc: rnd(),
    discovered: false, airborne: s.kind !== 'ground', noPool: s.kind === 'sky' || !!s.deck,
  }));
  let placed = false;

  // ── placement (once every builder's colliders exist) ───────────────────────
  function clearance(x, z) {
    const cols = ctx.colliders || [];
    let near = 99;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!c) continue;
      let d;
      if (c.box) {
        const w = c.w || 1, dd = c.d || 1;
        const ca = Math.cos(c.rot || 0), sa = Math.sin(c.rot || 0);
        const dx = x - c.x, dz = z - c.z;
        const lx = Math.abs(dx * ca + dz * sa) - w / 2, lz = Math.abs(-dx * sa + dz * ca) - dd / 2;
        d = (lx < 0 && lz < 0) ? Math.max(lx, lz) : Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
      } else d = Math.hypot(x - c.x, z - c.z) - (c.r || 0);
      if (d < near) near = d;
    }
    return near;
  }
  function pickupClear(x, z, r = 2.2) {
    const pk = ctx.systems.inventory?.pickups;
    if (!Array.isArray(pk)) return true;
    for (let i = 0; i < pk.length; i++) {
      const p = pk[i];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.hypot(p.x - x, p.z - z) < r) return false;
    }
    return true;
  }
  function floorAt(x, z) {
    try {
      const g = ctx.systems.player?.groundInfo?.(x, z);
      if (g && Number.isFinite(g.h)) return Number.isFinite(g.floor) ? Math.max(g.h, g.floor) : g.h;
    } catch { /* ground core mid-rebuild: fall back to the terrain */ }
    return Math.max(world.height(x, z), 0);
  }
  // A roof deck is only reported by groundInfo while the visitor is already up
  // at its level (the architecture gates decks by reachability), so ask the
  // architecture systems for the raw deck height first.
  function deckAt(x, z) {
    let best = -Infinity;
    for (const name of ['candyArchitecture', 'catArchitecture']) {
      try {
        const h = ctx.systems[name]?.getDeckHeight?.(x, z);
        if (typeof h === 'number' && Number.isFinite(h)) best = Math.max(best, h);
      } catch { /* not ours to fix */ }
    }
    return Math.max(best, floorAt(x, z));
  }
  const standable = (x, z) => world.height(x, z) > 0.7 || floorAt(x, z) > 0.7;
  const inRiver = (x, z) => x < 0 && world.riverDist(x, z) < world.RIVER.width * 0.5 + 0.8;

  function place() {
    placed = true;
    const moved = [];
    for (const s of stars) {
      const site = SITES[s.index];
      let x = site.x, z = site.z;
      if (site.kind === 'ground' || (site.kind === 'deck' && !site.deck)) {
        const pad = site.kind === 'deck' ? 1.0 : 1.5;
        const deckY = site.kind === 'deck' ? deckAt(x, z) : 0;
        const ok = (px, pz) => standable(px, pz) && !inRiver(px, pz) && clearance(px, pz) >= pad && pickupClear(px, pz)
          && (site.kind !== 'deck' || deckAt(px, pz) > deckY - 0.3);      // stay up on the roof
        if (!ok(x, z)) {
          let found = null;
          for (let r = 0.8; r <= 5.6 && !found; r += 0.8) {
            for (let a = 0; a < 16; a++) {
              const ang = a / 16 * Math.PI * 2 + r * 0.7;
              const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
              if (ok(px, pz)) { found = { x: px, z: pz }; break; }
            }
          }
          if (found) { moved.push(`${s.id}→${found.x.toFixed(1)},${found.z.toFixed(1)}`); x = found.x; z = found.z; }
        }
      }
      if (site.kind === 'jump' && !pickupClear(x, z, 2.6)) {
        // an ammo pickup was dropped on the "jump here" ring: slide the star
        // along the same floor (the bridge deck stays the bridge deck)
        const f0 = floorAt(x, z);
        let found = null;
        for (let r = 1.2; r <= 4.8 && !found; r += 0.6) {
          for (let a = 0; a < 16; a++) {
            const ang = a / 16 * Math.PI * 2 + r * 0.7;
            const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
            if (pickupClear(px, pz, 2.6) && Math.abs(floorAt(px, pz) - f0) < 0.35 && clearance(px, pz) >= 1.2) { found = { x: px, z: pz }; break; }
          }
        }
        if (found) { moved.push(`${s.id}→${found.x.toFixed(1)},${found.z.toFixed(1)}`); x = found.x; z = found.z; }
      }
      s.x = x; s.z = z;
      if (site.kind === 'deck') s.floorY = site.deck ? deckAt(site.deck[0], site.deck[1]) : deckAt(x, z);
      else if (site.kind === 'sea') s.floorY = Math.max(0, world.height(x, z));
      else s.floorY = floorAt(x, z);
      if (site.kind === 'deck' || site.kind === 'ground') s.y = s.floorY + GROUND_LIFT;
      else if (site.kind === 'jump') s.y = s.floorY + JUMP_LIFT;
      else if (site.kind === 'sea') s.y = s.floorY + SEA_Y;
      else s.y = site.y ?? s.floorY + 12;
    }
    const count = (isl) => stars.filter((s) => s.island === isl).length;
    const air = (isl) => stars.filter((s) => s.island === isl && s.airborne).length;
    console.warn(`[powerups] ${N} invincibility stars · candy ${count('candy')} (${air('candy')} airborne) · cat ${count('cat')} (${air('cat')} airborne)`
      + ` · 2 draw calls (+1 shadow) · ${starGeo.attributes.position.count / 3} tris/star`
      + (moved.length ? ' · nudged ' + moved.join(' ') : ''));
  }
  ctx.events.on('world:ready', () => {
    try { place(); } catch (err) { console.error('[powerups] placement failed', err); }
    try { prewarmFlash(); } catch (err) { console.warn('[powerups] rim prewarm skipped', err?.message || err); }
  });

  // ── HUD pill (own DOM under ctx.uiRoot) ────────────────────────────────────
  const hud = { el: null, t: null, bar: null, p: 0, want: 0, lastT: '', lastHue: -1, warn: false, posT: 0, bottom: 140 };
  try {
    if (ctx.uiRoot && typeof document !== 'undefined') {
      if (!document.getElementById('cci-powerups-style')) {
        const st = document.createElement('style');
        st.id = 'cci-powerups-style';
        st.textContent = CSS;
        document.head.appendChild(st);
      }
      const el = document.createElement('div');
      el.className = 'cci cci-plate cci-star-pill';
      el.innerHTML = `<span class="sp-ico"><svg viewBox="0 0 24 24"><path d="${STAR_PATH}"/></svg></span>`
        + '<span class="sp-txt"><b class="sp-lbl">INVINCIBLE</b><span class="sp-bar"><i></i></span></span>'
        + '<b class="sp-t">10.0</b>';
      ctx.uiRoot.appendChild(el);
      hud.el = el; hud.t = el.querySelector('.sp-t'); hud.bar = el.querySelector('.sp-bar i');
      hud.ico = el.querySelector('.sp-ico');
    }
  } catch (err) { console.warn('[powerups] HUD pill unavailable', err?.message || err); }

  const shown = (el) => el && el.style.display !== 'none' && el.offsetHeight > 0;
  function hudPlace() {
    // bottom centre, above the hotbar — and above an open dialogue box, which
    // docks over the hotbar too. The box's nameplate pokes up out of its top
    // edge, so measure the highest of the two. A few times a second, not per frame.
    const root = ctx.uiRoot;
    const rootB = root.getBoundingClientRect().bottom || (typeof innerHeight === 'number' ? innerHeight : 0);
    let bottom = 26;
    const bar = root.querySelector('.cci-bar');
    if (shown(bar)) bottom = Math.max(bottom, rootB - bar.getBoundingClientRect().top + 12);
    const say = root.querySelector('.cci-say');
    if (shown(say) && parseFloat(say.style.opacity || '1') > 0.1) {
      let top = say.getBoundingClientRect().top;
      const np = say.querySelector('.cci-nameplate');
      if (shown(np)) top = Math.min(top, np.getBoundingClientRect().top);
      bottom = Math.max(bottom, rootB - top + 16);
    }
    hud.bottom = bottom;
    hud.el.style.bottom = bottom.toFixed(0) + 'px';
  }

  function hudUpdate(dt) {
    if (!hud.el) return;
    hud.want = effect.on ? 1 : 0;
    const was = hud.p;
    hud.p = clamp(hud.p + (hud.want > hud.p ? dt / 0.22 : -dt / 0.18), 0, 1);
    if (hud.p <= 0) { if (was > 0 || hud.el.style.display !== 'none') hud.el.style.display = 'none'; return; }
    if (hud.el.style.display === 'none') { hud.el.style.display = 'flex'; hud.posT = 0; }
    hud.posT -= dt;
    if (hud.posT <= 0) { hud.posT = 0.25; try { hudPlace(); } catch { /* layout read failed: keep last */ } }
    const e = hud.p;
    const back = 1 + 2.2 * Math.pow(e - 1, 3) + 1.2 * Math.pow(e - 1, 2);      // back-out ease
    const warn = effect.on && effect.left < 3;
    const shake = warn ? Math.sin(ctx.state.elapsed * 38) * 2.2 : 0;
    hud.el.style.opacity = clamp(e * 1.8, 0, 1).toFixed(3);
    hud.el.style.transform = `translateX(calc(-50% + ${shake.toFixed(1)}px)) translateY(${((1 - back) * 16).toFixed(1)}px) scale(${(0.88 + 0.12 * back).toFixed(3)})`;
    const txt = effect.on ? effect.left.toFixed(1) : '0.0';
    if (txt !== hud.lastT) { hud.lastT = txt; hud.t.textContent = txt; }
    hud.bar.style.transform = `scaleX(${clamp(effect.on ? effect.left / effect.total : 0, 0, 1).toFixed(3)})`;
    if (warn !== hud.warn) { hud.warn = warn; hud.el.classList.toggle('warn', warn); }
    // rainbow ring round the plate, stepped in 12° hues so the DOM is not
    // rewritten every single frame
    const hue = Math.floor(((ctx.state.elapsed * 260) % 360) / 12) * 12;
    if (hue !== hud.lastHue) {
      hud.lastHue = hue;
      hud.el.style.boxShadow = `0 3px 0 rgba(43,36,66,.34), 0 10px 24px rgba(14,8,26,.4), inset 0 2px 0 rgba(255,255,255,.95), 0 0 0 3px hsl(${hue},92%,62%)`;
      hud.ico.style.transform = `rotate(${(hue * 0.5) % 72 - 36}deg)`;
    }
  }

  // ── the visitor's rainbow rim (cloned materials, restored exactly) ─────────
  const flash = { list: [], seen: new Set(), clones: new Map(), cloneList: [], scanT: 0 };
  const rimU = { value: 0 }, rimT = { value: 0 };
  function rimPatch(sh) {
    if (!sh.fragmentShader.includes('#include <emissivemap_fragment>')) return;
    sh.uniforms.uStarRim = rimU; sh.uniforms.uStarT = rimT;
    sh.fragmentShader = 'uniform float uStarRim;\nuniform float uStarT;\n'
      + sh.fragmentShader.replace('#include <emissivemap_fragment>', RIM_GLSL);
  }
  const rimKey = () => 'powerup-star-rim';
  function flashMaterial(m) {
    if (!m || !m.emissive || !m.isMaterial) return null;
    // A material with its own shader patch (a held weapon's glow, say) would
    // lose it in a clone, and sharing the patch could steal its owner's uniform
    // handle. Leave those alone: the body is what needs to shine.
    // The visitor's own body material (player/visitor.js, one skinned mesh) is
    // the exception: it opts in with userData.flashChain, its patch runs first
    // and ours after it, and the clone shares its uniforms (night glow).
    if (m.userData?.powerupFlash) return null;              // already one of ours
    const chain = !!m.userData?.flashChain;
    if (!chain && Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) return null;
    let c = flash.clones.get(m);
    if (!c) {
      c = m.clone();
      c.name = (m.name || 'visitor') + '_starflash';
      c.userData = { ...m.userData, powerupFlash: true };
      if (chain) {
        const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey.bind(m);
        c.onBeforeCompile = (sh, r) => { base.call(m, sh, r); rimPatch(sh); };
        c.customProgramCacheKey = () => baseKey() + '|' + rimKey();
      } else {
        c.onBeforeCompile = rimPatch;
        c.customProgramCacheKey = rimKey;
      }
      flash.clones.set(m, c);
      flash.cloneList.push({ orig: m, clone: c });
    }
    return c;
  }
  function visitMesh(o) {
    if (!o.isMesh || o.userData?.silhouette || flash.seen.has(o)) return;
    flash.seen.add(o);
    const orig = o.material;
    if (Array.isArray(orig)) {
      let any = false;
      const arr = orig.map((m) => { const c = flashMaterial(m); if (c) any = true; return c || m; });
      if (!any) return;
      flash.list.push({ mesh: o, orig, clone: arr });
      o.material = arr;
    } else {
      const c = flashMaterial(orig);
      if (!c) return;
      flash.list.push({ mesh: o, orig, clone: c });
      o.material = c;
    }
  }
  function flashScan() {
    const g = ctx.systems.player?.group;
    if (g?.traverse) g.traverse(visitMesh);
  }
  function flashRestore() {
    for (let i = 0; i < flash.list.length; i++) {
      const e = flash.list[i];
      // someone else swapped this mesh's material mid-effect: theirs wins
      if (e.mesh.material === e.clone) e.mesh.material = e.orig;
    }
    flash.list.length = 0;
    flash.seen.clear();
  }
  // Compile the rim programs at load, against the real scene's lights, so the
  // first star you catch does not hitch on a shader compile.
  function prewarmFlash() {
    const g = ctx.systems.player?.group, r = ctx.renderer;
    if (!g?.traverse || typeof r?.compile !== 'function') return;
    const proxy = new THREE.Scene();
    const done = new Set();
    g.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData?.silhouette) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        const c = flashMaterial(m);
        if (!c || done.has(c)) continue;
        done.add(c);
        // the visitor is one SkinnedMesh now: compile the skinned variant
        const pm = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, c) : new THREE.Mesh(o.geometry, c);
        if (o.isSkinnedMesh) pm.bind(o.skeleton, o.bindMatrix);
        pm.castShadow = o.castShadow; pm.receiveShadow = o.receiveShadow;
        proxy.add(pm);
      }
    });
    if (proxy.children.length) r.compile(proxy, ctx.camera, ctx.scene);
  }
  const WHITE = new THREE.Color(1, 1, 1);
  function flashUpdate(dt, t) {
    flash.scanT -= dt;
    if (flash.scanT <= 0) { flash.scanT = 0.5; flashScan(); }      // held items come and go
    const left = effect.left;
    // The tourist keeps his own colours. A rainbow rim runs round his outline
    // and a faint shimmer rides on top; the last 2.5 s strobe between that and
    // the plain tourist, faster and faster — "it's running out".
    let rim = 1.8, glow = 0.05 + 0.03 * Math.sin(t * 11);
    if (left < 2.5) {
      const rate = 10 + (2.5 - left) * 12;
      if (Math.sin(t * rate) <= 0) { rim = 0; glow = 0; }
    }
    const pop = effect.startT < 0.35 ? clamp(1 - effect.startT / 0.35, 0, 1) : 0;   // white-hot on pickup
    rimU.value = rim + pop * 1.6;
    rimT.value = t;
    const g = Math.max(glow, pop * 0.85);
    for (let i = 0; i < flash.cloneList.length; i++) {
      const { orig, clone } = flash.cloneList[i];
      const oe = orig.emissive;
      clone.emissive.setRGB(oe.r + WHITE.r * g, oe.g + WHITE.g * g * 0.96, oe.b + WHITE.b * g * 0.88);
      clone.emissiveIntensity = 1;
      if (clone.color && orig.color) clone.color.copy(orig.color);
    }
  }

  // ── the effect ─────────────────────────────────────────────────────────────
  const effect = { on: false, left: 0, total: DURATION, startT: 0, trailAcc: 0 };

  function begin(secs, star) {
    const pl = ctx.systems.player;
    const fresh = !effect.on;
    effect.on = true;
    effect.total = Math.max(secs, effect.left);
    effect.left = Math.max(secs, effect.left);
    effect.startT = 0;
    if (fresh) {
      flashScan();
      ctx.events.emit('powerup:star', { on: true, id: star?.id ?? null, x: star?.x ?? pl?.position?.x ?? 0, z: star?.z ?? pl?.position?.z ?? 0, duration: effect.left });
    }
    if (pl) { try { pl.invulnerable = true; pl.speedBoost = SPEED_BOOST; } catch { /* read-only player stub */ } }
    try { ctx.systems.ui?.toast?.('INVINCIBLE!', 2.6, { icon: 'star' }); } catch { /* ui optional */ }
    try { ctx.systems.audio?.play?.('star'); } catch { /* audio optional */ }
  }

  function finish() {
    if (!effect.on) return;
    effect.on = false; effect.left = 0;
    flashRestore();
    rimU.value = 0;
    const pl = ctx.systems.player;
    if (pl) {
      try { pl.speedBoost = 1; } catch { /* stub */ }
      try { if (!pl.rolling) pl.invulnerable = false; } catch { /* stub */ }
    }
    ctx.events.emit('powerup:star', { on: false });
  }

  // ── particles (one reused options bag per effect: no per-frame garbage) ────
  const P = () => ctx.systems.particles;
  const sparkO = {
    x: 0, y: 0, z: 0, count: 1, shape: 'sparkle', blend: 'add', color: [0xfff3b0, 0xffd24a, 0xffffff, 0xffc03a],
    speed: 0.35, up: 0.8, life: 1.1, lifeVar: 0.35, size: 0.34, sizeEnd: 0.04, sizeVar: 0.35,
    gravity: -0.5, drag: 1.2, area: 0.55, areaY: 0.9, alpha: 1, fadeIn: 0.12, fadeOut: 0.55, spin: 1.6, flicker: true,
  };
  // a double-jump star drips glitter straight down onto the spot you jump
  // from, so its height reads (a star 4 u up otherwise looks like it floats
  // over whatever is behind it)
  const dripO = {
    x: 0, y: 0, z: 0, count: 1, shape: 'sparkle', blend: 'add', color: [0xfff3b0, 0xffd24a, 0xffffff],
    speed: 0.2, vy: -0.6, vyJitter: 0.4, life: 1.15, lifeVar: 0.2, size: 0.36, sizeEnd: 0.1, sizeVar: 0.3,
    gravity: -3.2, drag: 0.4, area: 0.35, alpha: 1, fadeIn: 0.08, fadeOut: 0.4, spin: 1.8, flicker: true,
  };
  // blend flips per frame: additive glitter at night, solid chips by day
  // (additive sparkles vanish against a sunlit plaza). Small and quick, so the
  // trail reads as glitter off his heels, never as a smear round his feet.
  const trailO = {
    x: 0, y: 0, z: 0, count: 1, shape: 'sparkle', blend: 'add', color: RAINBOW,
    speed: 1.1, up: 1.0, life: 0.6, lifeVar: 0.25, size: 0.42, sizeEnd: 0.06, sizeVar: 0.3,
    gravity: -1.6, drag: 1.4, area: 0.45, areaY: 1.2, alpha: 1, fadeIn: 0.05, fadeOut: 0.4, spin: 2.6,
  };
  const burstO = {
    x: 0, y: 0, z: 0, count: 26, shape: 'sparkle', blend: 'add', color: [0xffffff, 0xffe27a, 0xffc03a],
    speed: 6.5, up: 0.9, life: 0.9, lifeVar: 0.3, size: 0.6, sizeEnd: 0.05, sizeVar: 0.35,
    gravity: -3, drag: 2.4, spread: 0.4, alpha: 1, fadeIn: 0.03, fadeOut: 0.5, spin: 2.5,
  };
  const safe = (fn) => { try { fn(); } catch { /* particles optional */ } };
  /** Hot-path spawn: no closure, no garbage. */
  function emit(p, o) { try { p.burst(o); } catch { /* particles optional */ } }

  // ── map markers (a star goes on the map once you have seen it) ─────────────
  function mark(s, on) {
    const ui = ctx.systems.ui;
    try {
      if (on) ui?.addMapMarker?.({ id: 'star_' + s.id, x: s.x, z: s.z, glyph: 'star', label: 'Star — ' + s.label });
      else ui?.removeMapMarker?.('star_' + s.id);
    } catch { /* map markers are optional (contract G) */ }
  }

  function collect(s) {
    if (!s || s.taken) return false;
    s.taken = true; s.respawnT = RESPAWN; s.pull = 0;
    const x = s.x + s.dx, y = s.y + s.dy, z = s.z + s.dz;
    s.dx = s.dy = s.dz = 0;
    const p = P();
    if (p) {
      burstO.x = x; burstO.y = y; burstO.z = z;
      safe(() => p.burst(burstO));
      safe(() => p.confetti?.(x, y, z, { count: 22, color: RAINBOW, speed: 5.5, life: 1.4 }));
      const pl = ctx.systems.player?.position;
      if (pl) safe(() => p.ripple?.(pl.x, pl.y + 0.08, pl.z, { ringColor: 0xffe27a, ringSize: 5.5, ringLife: 0.7 }));
    }
    try { ctx.systems.camera?.shake?.(0.25, 0.25); } catch { /* optional */ }
    mark(s, false);
    ctx.events.emit('powerup:collect', { id: s.id, x, y, z });
    begin(DURATION, s);
    return true;
  }

  // ── frame ──────────────────────────────────────────────────────────────────
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  let visitorFx = false;
  const TWIRL_EVERY = 5.5, TWIRL_LEN = 0.55, TAU = Math.PI * 2;

  function hideStar(i) {
    starMesh.setMatrixAt(i, ZERO); haloMesh.setMatrixAt(i, ZERO);
    haloMesh.setMatrixAt(N + i, ZERO); haloMesh.setMatrixAt(BEAM + i, ZERO);
  }

  function update(dt, ctx) {
    if (!placed) { try { place(); } catch (err) { console.error('[powerups] placement failed', err); } }
    const st = ctx.state;
    const t = st.elapsed;
    const night = 1 - clamp(st.daylight ?? 1, 0, 1);
    const pl = ctx.systems.player;
    const pp = pl?.position;
    const riding = !!(pl && (pl.onVehicle || pl.onFerry || st.flying || st.vehicle));
    // in a tiger's jaws (the scruff-carry, the raid's rainbow carry: onFerry, but not riding) — no star
    const held = !!(ctx.systems.catCitizens?.carrier || ctx.systems.catCitizens?.raid?.carrying);
    const cam = ctx.camera.position;
    const p = P();

    // glow after dark: brighter emissive + halo; a gentle halo by day too
    starMat.emissiveIntensity = 0.38 + 1.25 * night;
    haloMat.uniforms.uIntensity.value = 0.34 + 1.0 * night;
    haloMat.uniforms.uPool.value = 0.05 + 0.75 * night;
    haloMat.uniforms.uTime.value = t;
    haloMat.uniforms.uSolid.value = 0.75 * (1 - night);

    const bx = pp ? pp.x : 0, by = pp ? pp.y + BODY_Y : 0, bz = pp ? pp.z : 0;
    for (let i = 0; i < N; i++) {
      const s = stars[i];
      if (s.taken) {
        if (!st.paused) s.respawnT -= dt;
        if (s.respawnT <= 0) {
          s.taken = false; s.pop = 0; s.respawnT = 0;
          if (s.discovered) mark(s, true);
          const dcx = s.x - cam.x, dcz = s.z - cam.z;
          if (p && dcx * dcx + dcz * dcz < 90 * 90) safe(() => p.sparkle?.(s.x, s.y, s.z, 0xffe27a, 14));
        } else { hideStar(i); continue; }
      }
      if (s.pop < 1) s.pop = Math.min(1, s.pop + dt / 0.6);

      // pickup test (body centre ↔ star centre)
      let nearK = 1;
      if (pp && !st.paused && !held) {
        const dx = s.x + s.dx - bx, dy = s.y + s.dy - by, dz = s.z + s.dz - bz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const R = riding ? RIDE_R : COLLECT_R;
        if (d2 < R * R) { collect(s); hideStar(i); continue; }
        // riders: a star within MAGNET_R homes in (the flyer and the catapult
        // cannot be steered to the centimetre)
        const home = s.x - bx, homeY = s.y - by, homeZ = s.z - bz;
        const a2 = home * home + homeY * homeY + homeZ * homeZ;
        if (riding && a2 < MAGNET_R * MAGNET_R) s.pull = Math.min(1, s.pull + dt * 2.2);
        else s.pull = Math.max(0, s.pull - dt * 1.5);
        if (s.pull > 0) {
          const k = s.pull * s.pull;
          s.dx = -home * k; s.dy = -homeY * k; s.dz = -homeZ * k;
        } else s.dx = s.dy = s.dz = 0;
        const h2 = home * home + homeZ * homeZ;
        if (!s.discovered && h2 < DISCOVER_R * DISCOVER_R) { s.discovered = true; mark(s, true); }
        // the beacon steps back when you are right under it, so it never
        // washes over the visitor
        nearK = 0.3 + 0.7 * clamp((Math.sqrt(h2) - 2.5) / 4, 0, 1);
      } else if (pp) {
        const hx = s.x - bx, hz = s.z - bz;
        nearK = 0.3 + 0.7 * clamp((Math.sqrt(hx * hx + hz * hz) - 2.5) / 4, 0, 1);
      }

      // pose: face the lens (never edge-on), sway, tip back toward it, a
      // quick cartwheel in its own plane every few seconds (a spin that never
      // shows the thin edge), bob, pop in with an overshoot
      const bob = Math.sin(t * 2.3 + s.phase) * 0.17;
      const e = s.pop;
      const popS = e >= 1 ? 1 : 1 + 2.4 * Math.pow(e - 1, 3) + 1.4 * Math.pow(e - 1, 2);
      const x = s.x + s.dx, y = s.y + s.dy + bob, z = s.z + s.dz;
      const cx = cam.x - x, cy = cam.y - y, cz = cam.z - z;
      const hd = Math.sqrt(cx * cx + cz * cz);
      const dCam = Math.sqrt(hd * hd + cy * cy);
      const far = clamp(dCam / 46, 1, 1.9);              // never shrinks to a speck
      const cyc = (t * (s.spin / 2.2) + s.phase) % TWIRL_EVERY;
      const tw = cyc < TWIRL_LEN ? cyc / TWIRL_LEN : 0;
      const twirl = tw > 0 ? (tw * tw * (3 - 2 * tw)) * TAU : 0;
      const yaw = Math.atan2(cx, cz) + Math.sin(t * 1.7 + s.phase) * 0.5;
      const pitch = -Math.atan2(cy, hd) * 0.75 + Math.sin(t * 1.3 + s.phase) * 0.1;
      _e.set(pitch, yaw, Math.sin(t * 1.9 + s.phase * 2) * 0.16 - twirl);
      _q.setFromEuler(_e);
      const sz = (s.kind === 'sky' ? 1.25 : 1) * popS * far;
      _m.compose(_p.set(x, y, z), _q, _s.set(sz, sz, sz));
      starMesh.setMatrixAt(i, _m);
      // halo + rainbow ring (the ring sits just outside the outline)
      const hs = 3.0 * sz * (1 + 0.12 * night) * (0.96 + 0.04 * Math.sin(t * 3 + s.phase)) * (1 - 0.6 * s.pull);
      _m.makeScale(hs, hs, hs); _m.setPosition(x, y, z);
      haloMesh.setMatrixAt(i, _m);
      // pool of light on the floor under it (none under a sky star or one hung
      // out past a railing: nothing under it to light)
      if (s.noPool || s.pull > 0) haloMesh.setMatrixAt(N + i, ZERO);
      else {
        const ps = (s.kind === 'jump' ? 2.6 : 3.6) * popS * (1 + bob * 0.4);
        _m.makeScale(ps, ps, ps); _m.setPosition(s.x, s.floorY + (s.kind === 'jump' ? 0.3 : 0.16), s.z);
        haloMesh.setMatrixAt(N + i, _m);
      }
      // beacon: from the floor (or a way under a sky star) to well above it
      // beacons are for finding a star from afar: they fade out far away and
      // step aside when the lens is close
      const beamK = popS * nearK * (1 - s.pull) * (1 - clamp((hd - BEAM_NEAR) / (BEAM_FAR - BEAM_NEAR), 0, 1))
        * (0.25 + 0.75 * clamp((hd - 10) / 14, 0, 1));
      if (beamK < 0.02) haloMesh.setMatrixAt(BEAM + i, ZERO);
      else {
        const yb = s.kind === 'sky' ? s.y - 8 : s.floorY + 0.05, yt = s.y + BEAM_UP;
        const H = yt - yb, bw = BEAM_W * (1 + (far - 1) * 0.9);
        _m.makeScale(bw, H, bw); _m.setPosition(s.x, (yb + yt) * 0.5, s.z);
        haloMesh.setMatrixAt(BEAM + i, _m);
        haloMesh.setColorAt(BEAM + i, _c.setRGB((s.y - yb) / H, beamK, s.kind === 'sky' ? 1 : 0));
      }

      // sparkle trail, only where someone could see it
      if (p && !st.paused) {
        const px = pp ? x - pp.x : 1e9, pz = pp ? z - pp.z : 1e9;
        if (hd < SPARKLE_R || px * px + pz * pz < SPARKLE_R * SPARKLE_R) {
          const jump = s.kind === 'jump';
          s.sparkAcc += dt * (jump ? 7 : 3.2 + 3 * night);
          if (s.sparkAcc >= 1) {
            s.sparkAcc -= 1;
            if (s.sparkAcc > 2) s.sparkAcc = 0;
            const o = jump && (i + (s.sparkAcc * 7 | 0)) % 3 !== 0 ? dripO : sparkO;
            o.x = x; o.y = y - 0.15; o.z = z;
            emit(p, o);
          }
        }
      }
    }

    // the effect itself
    if (effect.on) {
      if (!st.paused) { effect.left -= dt; effect.startT += dt; }
      if (effect.left <= 0) finish();
      else {
        if (pl) {
          try { pl.invulnerable = true; pl.speedBoost = SPEED_BOOST; } catch { /* stub */ }
        }
        flashUpdate(dt, t);
        if (pp) {
          // rainbow sparkles spiralling up round him, and a dashed rainbow
          // ring chasing round his feet
          const strobe = effect.left < 2.5 && Math.sin(t * (10 + (2.5 - effect.left) * 12)) <= 0;
          const intro = clamp(effect.startT / 0.3, 0, 1);
          for (let j = 0; j < ORBIT_N; j++) {
            const a = t * 2.4 + j * (TAU / ORBIT_N);
            const hf = (j / ORBIT_N + t * 0.42) % 1;
            const fade = hf < 0.15 ? hf / 0.15 : hf > 0.82 ? (1 - hf) / 0.18 : 1;
            const rad = (0.95 + 0.12 * Math.sin(t * 3 + j)) * (0.6 + 0.4 * intro);
            const sc = strobe ? 0 : (0.52 + 0.14 * Math.sin(t * 9 + j * 1.7)) * fade * intro;
            _m.makeScale(sc, sc, sc); _m.setPosition(pp.x + Math.cos(a) * rad, pp.y + 0.15 + hf * 1.95, pp.z + Math.sin(a) * rad);
            haloMesh.setMatrixAt(ORB + j, _m);
          }
          const rs = 2.5 * (1 + 0.05 * Math.sin(t * 6)) * (0.5 + 0.5 * intro);
          _m.makeScale(rs, rs, rs); _m.setPosition(pp.x, pp.y + 0.07, pp.z);
          haloMesh.setMatrixAt(FEET, _m);
          haloMesh.setColorAt(FEET, _c.setRGB(strobe ? 0 : 1, 0, 0));
          visitorFx = true;
        }
        if (p && pp && !st.paused) {
          effect.trailAcc += dt * 22;
          let guard = 0;
          while (effect.trailAcc >= 1 && guard++ < 4) {
            effect.trailAcc -= 1;
            trailO.x = pp.x; trailO.y = pp.y + BODY_Y; trailO.z = pp.z;
            trailO.blend = night > 0.45 ? 'add' : 'normal';
            emit(p, trailO);
          }
          if (effect.trailAcc > 4) effect.trailAcc = 0;
        }
      }
    }
    if (visitorFx && !effect.on) {
      for (let j = 0; j < ORBIT_N; j++) haloMesh.setMatrixAt(ORB + j, ZERO);
      haloMesh.setMatrixAt(FEET, ZERO);
      visitorFx = false;
    }
    starMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceColor.needsUpdate = true;
    hudUpdate(dt);
  }

  /** Stand the visitor beside star `id` on its own floor (views + tests). */
  function stage(id, dist = 2.8, bearing = null) {
    if (!placed) place();
    const s = stars.find((q) => q.id === id);
    const pl = ctx.systems.player;
    if (!s || typeof pl?.teleport !== 'function') return null;
    let best = null;
    if (s.kind === 'sky' || s.kind === 'sea') {
      // nearest dry, clear ground
      for (let r = 2; r <= 44 && !best; r += 2) {
        for (let a = 0; a < 24; a++) {
          const an = (bearing ?? 0) + a / 24 * TAU;
          const px = s.x + Math.cos(an) * r, pz = s.z + Math.sin(an) * r;
          if (world.height(px, pz) > 0.8 && !inRiver(px, pz) && clearance(px, pz) >= 1.2) { best = { x: px, z: pz }; break; }
        }
      }
    } else {
      // Same floor as the star, clear of props, and by default off to one
      // SIDE of it as the lens sees it (never in front: he would hide it).
      const floor = (px, pz) => (s.kind === 'deck' ? deckAt(px, pz) : floorAt(px, pz));
      const tol = s.kind === 'jump' ? 0.9 : 0.45;
      const az = ctx.systems.camera?.current?.azimuth ?? ctx.systems.camera?.params?.azimuth ?? Math.PI / 4;
      let bestScore = -Infinity;
      for (const dd of [dist, dist * 0.7, dist * 1.35]) {
        const tries = bearing === null ? 24 : 1;
        for (let a = 0; a < tries; a++) {
          const an = bearing === null ? a / 24 * TAU : bearing;
          const px = s.x + Math.cos(an) * dd, pz = s.z + Math.sin(an) * dd;
          const f = floor(px, pz);
          if (Math.abs(f - s.floorY) > tol || !standable(px, pz)) continue;
          if (inRiver(px, pz) && f < world.height(px, pz) + 0.5) continue;      // a bridge deck is fine
          const c = clearance(px, pz);
          if (c < 0.6) continue;
          const score = Math.min(c, 3) - (bearing === null ? 2 * Math.abs(Math.sin(an + az)) : 0) - (dd === dist ? 0 : 0.5);
          if (score > bestScore) { bestScore = score; best = { x: px, z: pz }; }
        }
        if (best) break;
      }
    }
    if (!best) return null;
    if (s.kind === 'deck' && pl.position) pl.position.y = s.floorY + 0.05;   // decks answer at their own level
    pl.teleport(best.x, best.z);
    // turn him half toward the lens, half toward the star: face and prize both read
    try {
      const az = ctx.systems.camera?.current?.azimuth ?? ctx.systems.camera?.params?.azimuth ?? Math.PI / 4;
      const sx = s.x - pl.position.x, sz = s.z - pl.position.z, sl = Math.hypot(sx, sz) || 1;
      pl.facing = Math.atan2(sx / sl + Math.sin(az) * 1.3, sz / sl + Math.cos(az) * 1.3);
    } catch { /* read-only facing: fine */ }
    // re-frame the follow camera on him (a free camera keeps its own aim:
    // snap() would re-centre it on the visitor)
    try { const cam = ctx.systems.camera; if (!cam?.isFree?.()) cam?.snap?.(); } catch { /* camera optional */ }
    return { x: pl.position.x, y: pl.position.y, z: pl.position.z };
  }

  const api = {
    group, stars, duration: DURATION, respawn: RESPAWN, collectRadius: COLLECT_R,
    get active() { return effect.on; },
    get timeLeft() { return effect.on ? Math.max(0, effect.left) : 0; },
    /** Start (or top up) the effect without a star. */
    grant(secs = DURATION) { begin(Math.max(0.1, +secs || DURATION), null); return effect.left; },
    /** Stop the effect now; the visitor's materials go back exactly as they were. */
    end() { finish(); },
    /** Collect a star as if touched (id or record). */
    collect(idOrStar) { const s = typeof idOrStar === 'string' ? stars.find((q) => q.id === idOrStar) : idOrStar; return collect(s); },
    respawnAll() { for (const s of stars) if (s.taken) s.respawnT = 0; },
    nearest(x, z) {
      let best = null, bd = Infinity;
      for (const s of stars) { if (s.taken) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
      return best;
    },
    stage,
    update,
  };
  return api;
}
