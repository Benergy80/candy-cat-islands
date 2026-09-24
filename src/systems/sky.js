// ─────────────────────────────────────────────────────────────────────────────
// SKY, LIGHTING & DAY/NIGHT
//
// Owns: gradient sky dome, stylised sun + big cartoon moon, twinkling stars,
// drifting low-poly clouds, the key/fill/bounce light rig, fog, and the
// renderer exposure curve. Everything is driven from one hand-authored colour
// grade (systems/sky/palette.js) sampled at ctx.state.time.
//
// Exposed API:
//   sunDir, moonDir (Vector3)      live unit directions toward sun / moon
//   phase                          'dawn' | 'day' | 'dusk' | 'night'
//   daylight                       0..1 (also written to ctx.state.daylight)
//   horizonColor, zenithColor      THREE.Color, refreshed every frame — use
//   sunColor, sunDiscColor         these to tint water reflections, glints, etc.
//   sun, fill, moon, hemi, ambient the light rig
//   lampsOn (bool), lampMix (0..1)  street lamps / window glow master switch:
//                                   ON through dusk, OUT by 06:21. Other
//                                   systems should drive lantern emissive and
//                                   PointLights from these, not from daylight.
//   mistAmount                     0..1 sea-mist density (dawn weather)
//   group, clouds, mist, grade, refresh()
// Events: ctx.events.emit('sky:phase', phase) on change + once on world:ready
//         ctx.events.emit('sky:lamps', { on, mix }) when lampsOn flips
//
// Colour-space contract (keep this if you touch the shaders): every sky mesh
// writes literal sRGB with tone mapping disabled, and scene.fog is applied by
// three AFTER tone mapping in output space — so dome horizon == fog colour ==
// authored hex, and renderer.toneMappingExposure grades only the lit world.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { clamp, lerp, smoothstep, damp } from '../core/util.js';
import { makeGrade, sampleGrade, phaseOf, lampMixAt } from './sky/palette.js';
import { createDome } from './sky/dome.js';
import { createSun, createMoon, createStars } from './sky/celestial.js';
import { createClouds } from './sky/clouds.js';
import { createMist, mistAmountAt } from './sky/mist.js';

// ── AERIAL PERSPECTIVE (one-time global shader patch) ────────────────────────
// three's stock fog only lerps toward fogColor, which means a saturated candy
// forest 200 units out still SHOUTS at the same chroma as the one at your feet.
// Real aerial perspective loses chroma faster than it loses contrast, so we
// desaturate ahead of the colour lerp. Patching the fog chunk at import time
// (sky is system #0, so this runs before any other system compiles a material)
// buys the whole game aerial perspective for zero draw calls and zero uniforms.
// Runs in OUTPUT space — three applies fog after tone mapping — so the sRGB
// luma weights below are the right ones.
if (!/ccAer/.test(THREE.ShaderChunk.fog_fragment)) {
  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    float ccAer = fogFactor;
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    // the chroma ramp starts nearer and saturates sooner than the colour lerp:
    // that is what makes the far half of the island read as distance instead of
    // as a second, equally loud foreground.
    float ccAer = smoothstep( fogNear * 0.70, fogFar * 0.62, vFogDepth );
  #endif
  float ccLum = dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( ccLum ), ccAer * 0.55 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
}

// ── DARKNESS-WEIGHTED SKY WASH (one-time global shader patch) ────────────────
// Two critique rounds in a row said the same thing in different words: "night
// and dusk are a global brightness multiply, not a change of light", and "noon
// cast shadows are hard near-black stencils with no fill". Both are the same
// bug — the only thing reaching an unlit surface was `blue_light × albedo`, and
// a blue light on a saturated red gummy is not blue, it is BLACK. You cannot
// desaturate a surface toward the sky by multiplying it.
//
// So the AmbientLight now does double duty. It still lights diffusely, but it
// is ALSO added on top of the shaded result, un-multiplied by albedo, weighted
// by how dark that pixel already is:
//
//   wash = ambientLightColor · 1/(1 + lit·14) · (0.20 + 0.46·fresnel²)
//
// • On a sunlit face the weight collapses to ~0.03 — noon keeps its punch.
// • In a cast shadow it is ~0.4 — which is the warm ground bounce the critic
//   asked for, arriving exactly where the stencil was black and nowhere else.
// • On the away-from-the-moon side of a gummy bear at night it is ~0.95 and the
//   ambient is a saturated blue-violet, so the unlit half goes BLUE rather than
//   simply going dark — a change of light, not a brightness multiply.
// • Warm lamp pools are bright, so the weight there is ~0, and the lamps stay
//   the only saturated warm colour in a night frame.
//
// It rides `ambientLightColor`, which three uploads to every lit material as a
// scene-level uniform, so this costs no draw calls, no new uniforms and no
// per-material plumbing — the same trick as the fog patch above. The grade's
// `ambC`/`ambI` therefore choose BOTH the colour of the lift and its strength.
if (!/ccWash/.test(THREE.ShaderChunk.lights_fragment_end)) {
  THREE.ShaderChunk.lights_fragment_end += /* glsl */`
{
  vec3 ccLitRGB = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse
                + reflectedLight.directSpecular + totalEmissiveRadiance;
  float ccLit = dot( ccLitRGB, vec3( 0.2126, 0.7152, 0.0722 ) );
  float ccFres = 1.0 - abs( dot( geometryNormal, geometryViewDir ) );
  float ccWash = ( 0.20 + 0.46 * ccFres * ccFres ) / ( 1.0 + ccLit * 14.0 );
  reflectedLight.indirectDiffuse += ambientLightColor * ccWash;
}
`;
}

// ── POINT LIGHTS THAT CANNOT REACH A FRAGMENT COST NOTHING (global patch) ────
// three shades EVERY PointLight in the light list for EVERY lit fragment:
// distance, attenuation and the whole BRDF, even when the light is at
// intensity 0 (the constant lamp pool by day, terrain/lamppool.js) or the
// fragment is far outside its cutoff `distance` (which is every fragment but a
// few metres of ground at night). Both cases contribute EXACTLY zero — three
// uploads colour × intensity, and getDistanceAttenuation() is exactly 0 at and
// beyond the cutoff — so skipping them changes no pixel; it only stops paying
// for them. The test is a uniform (colour) plus one squared distance per light.
// Contract J: the 11 unlit lights alone cost 4.8–6.0 ms of GPU by day and
// 29 ms at the sea crossing, the 17 night lights 25.5 of 33 ms.
if (!/ccPointLit/.test(THREE.ShaderChunk.lights_pars_begin)) {
  THREE.ShaderChunk.lights_pars_begin += /* glsl */`
#if NUM_POINT_LIGHTS > 0
bool ccPointLit( const in PointLight L, const in vec3 p ) {
  if ( L.color == vec3( 0.0 ) ) return false;
  if ( L.distance <= 0.0 ) return true;
  vec3 v = L.position - p;
  return dot( v, v ) < L.distance * L.distance;
}
#endif
`;
  const lb = THREE.ShaderChunk.lights_fragment_begin;
  const head = '\t\tpointLight = pointLights[ i ];\n\t\tgetPointLightInfo( pointLight, geometryPosition, directLight );';
  const tail = '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\t}\n\t#pragma unroll_loop_end\n#endif\n#if ( NUM_SPOT_LIGHTS > 0 )';
  if (lb.split(head).length === 2 && lb.split(tail).length === 2) {
    // (a real, non-unrolled loop was measured too: slower on ANGLE Metal —
    // 1.19 ms for six dark slots against 0.78 unrolled — so the unroll stays)
    THREE.ShaderChunk.lights_fragment_begin = lb
      .replace(head, '\t\tpointLight = pointLights[ i ];\n\t\tif ( ccPointLit( pointLight, geometryPosition ) ) {\n\t\tgetPointLightInfo( pointLight, geometryPosition, directLight );')
      .replace(tail, tail.replace('reflectedLight );\n\t}', 'reflectedLight );\n\t\t}\n\t}'));
  } else console.warn('[sky] point-light skip patch: three chunk changed, not applied');
}

// 05:27, not 06:00. The HUD dial calls 05:00–07:00 "SUNRISE", and at 05:53 the
// old arc still had the disc a degree BELOW the horizon with a 0.8-intensity
// key — the label said sunrise and the world rendered flat night. The sun now
// clears the horizon at 05:27, so by 05:53 it is genuinely ~4° up and the key
// really does rake in from the east.
const SUNRISE = 5.45, SUNSET = 19.5;
const DAY_ARC = SUNSET - SUNRISE, NIGHT_ARC = 24 - DAY_ARC;
// The sun rides a great circle from due east, through a noon point tilted
// toward +Z, to due west — so shadows rake across the isometric camera instead
// of pointing straight down. Keep the noon height WELL under 1: at y=0.91 the
// midday sun is nearly overhead and every shadow hides under its own object,
// which is exactly why the day grade read as directionless. y=0.78 → a noon
// shadow 0.8× the object's height, still clearly pointing somewhere.
const NOON = new THREE.Vector3(0, 0.78, 0.6258);

// ── MOON ARC (independent of the sun since wave 2b) ──────────────────────────
// The moon used to be pinned to the anti-sun direction, which put it at 20°
// at 21:00 and dragged it round the sky in lock-step. It now rides its own
// path: up at 18:48, down at 05:54, and — because `MOON_PLATEAU < 1` compresses
// the middle of the arc — it CLIMBS FAST and then loafs between 35° and 52°
// from 21:00 to 03:00, which is the band the art direction asked for.
// Measured: 21:00 → 35.8°, 23:00 → 50.0°, 01:00 → 52.4°, 03:00 → 41.9°.
const MOONRISE = 18.8, MOON_SPAN = 11.1;
const MOON_TILT_Y = 0.80, MOON_TILT_Z = 0.60;   // unit: 0.80² + 0.60² = 1
const MOON_PLATEAU = 0.58;

const SHADOW_MIN = 38;           // gameplay: crisp 76-unit box
const SHADOW_MAX = 124;          // scenic/low-angle: up to a 248-unit box
// 4096 EVERYWHERE (was 2048 at the gameplay box). At distance 28 / FOV 30 a
// 2048 map over an 88-unit box is 0.043 world units per texel, which is ~3
// screen pixels of staircase on any big flat pink or tan surface — exactly the
// artefact two critique rounds kept flagging. 76 units over 4096 is 0.0186 u
// (~1.2 px) and the steps stop reading. One map, one light at a time (sun by
// day, moon by night), so this is a single 4096² depth pass.
const SHADOW_MAP = 4096;
const KEY_DIST = 150;
// ── MOBILE TIER (ctx.state.mobile, read once at create; see BRIEF Contract I) ──
// 1024² key maps (4096² sun + moon was ~128 MB of depth on a phone that has no
// business holding it), no sea mist, ~55% of the cloud field, ONE shadow-casting
// directional light at all times (so dusk/dawn never flips the lit-program
// count), a shadow depth range fitted to the ground the camera can actually see,
// and the key map refreshed at most ~40×/s instead of every frame. The desktop
// tier never reads any of this.
const MOBILE_SHADOW_MAP = 1024;
const MOBILE_CLOUD_KEEP = 0.55;
const MOBILE_SHADOW_REFRESH = 1 / 40;   // s between key-map redraws (≈ every 2nd frame at 60 fps)
// Shadow depth range fitted to the visible receivers (see receiverDepth) on
// BOTH tiers since Contract J: casters deeper than the deepest receiver the
// camera can see cannot darken anything on screen, and with the island merges
// frustum-culled three now skips them in the shadow pass (a low sun's 370-unit
// strip of island was most of the shadow draws — 197 at the sea crossing).
const DEPTH_FIT = true;
// screen samples (NDC) for the FAR side of the shadow depth fit: the top edge of
// the frame, where the camera sees the ground furthest from the box anchor
const FAR_SAMPLES = [[0, 0.96], [-1, 0.96], [1, 0.96], [-1, 0.4], [1, 0.4]];
// desktop's fit is CONSERVATIVE (pixel-identical frames are the rule there): a
// denser ring of samples, each taken as low as the sea floor under it could be
// (RECEIVER_FLOOR), so a receiver below the visitor's height — the far side of
// a hill, the shallows — never loses a shadow
const FAR_SAMPLES_DESK = FAR_SAMPLES.concat([[-0.5, 0.96], [0.5, 0.96], [0, 0.4], [-1, 0], [1, 0], [-1, -0.5], [1, -0.5]]);
const RECEIVER_FLOOR = -3;
// Sky-object culling (mobile): the gameplay lens (elevation 0.64, fov 30) frames
// NO sky at all — its top edge points ~22° below the horizon — yet the clouds,
// sun, moon and stars are frustumCulled=false (they ride the camera), so they
// cost a draw each for nothing. Hide each one only when it provably cannot be in
// frame: every ray below the horizon by MARGIN (the test uses the previous
// frame's lens, and no camera move turns more than ~3° a frame), clouds only
// while the lens is under the lowest cloud belly, the discs only when their
// whole quad sits above the top edge. Nothing that could be seen is hidden.
const SKY_CULL_MARGIN = 0.06;          // rad
const CLOUD_FLOOR = 50;                // lowest cloud underside ≈ 57 (y0 72 − bob − belly)
const SUN_QUAD_R = 0.21, MOON_QUAD_R = 0.38;   // half-diagonal of each billboard, rad
// 0.155: the shadow of a caster is ~6.5× its height — still unmistakably a
// low-sun shadow — but the up-facing GROUND now gets 0.155 of the key instead
// of 0.12, which is the difference between a dawn cast shadow you can see and
// one that is lost in the skylight. (Below ~0.12 the shadow also leaves the
// fitted box before it ever fades.)
const MIN_KEY_ELEV = 0.155;
const GROUND_RAY_MAX = 185;      // how far ahead we bother fitting the shadow box

// Ground-bounce colour per island (hemisphere light lower hemisphere).
const GROUND_TINT = { candy: 0xffb4d6, cat: 0xbcd674, sea: 0x74c2de };
// What the island bounce desaturates TOWARD at night (grade.gSat drives it).
const NIGHT_NEUTRAL = new THREE.Color(0x96a0bc);

function sunAngle(t) {
  const h = ((t % 24) + 24) % 24;
  if (h >= SUNRISE && h <= SUNSET) return Math.PI * (h - SUNRISE) / DAY_ARC;
  const u = ((h - SUNSET) + 24) % 24;
  return Math.PI + Math.PI * (u / NIGHT_ARC);
}

/** Unit direction toward the moon at hour `t`, written into `out`. */
function moonAt(t, out) {
  const h = ((t % 24) + 24) % 24;
  let u = h - MOONRISE; if (u < 0) u += 24;
  const th = Math.PI * clamp(u / MOON_SPAN, -0.10, 1.10);
  const s = Math.sin(th);
  // Keep the sign, compress the magnitude: sin^0.58 rises steeply off the
  // horizon and then flattens, which is what plateaus the arc.
  const sh = s >= 0 ? Math.pow(s, MOON_PLATEAU) : -Math.pow(-s, MOON_PLATEAU);
  const ang = Math.asin(clamp(sh, -1, 1));
  const th2 = th > Math.PI * 0.5 ? Math.PI - ang : ang;
  const cs = Math.cos(th2), sn = Math.sin(th2);
  return out.set(cs, MOON_TILT_Y * sn, MOON_TILT_Z * sn);
}

export function create(ctx) {
  const { scene, renderer } = ctx;
  const MOBILE = !!ctx.state.mobile;
  const shadowRes = MOBILE ? MOBILE_SHADOW_MAP : SHADOW_MAP;

  // ── backdrop ────────────────────────────────────────────────────────────────
  const group = new THREE.Group();
  group.name = 'sky';
  scene.add(group);

  const dome = createDome();
  const stars = createStars();
  const sunDisc = createSun(800);
  const moonDisc = createMoon(780);
  group.add(dome.mesh, stars.points, moonDisc.mesh, sunDisc.mesh);

  const clouds = createClouds(MOBILE ? { keep: MOBILE_CLOUD_KEEP } : undefined);
  scene.add(clouds.group);

  // low sea mist — dawn weather, one draw call, world-fixed. Not on mobile: a
  // 12k-triangle transparent sheet over the whole sea is pure fill-rate, and
  // the dome + fog grade still carry the dawn.
  const mist = MOBILE ? null : createMist(ctx.world);
  if (mist) scene.add(mist.mesh);

  // ── light rig: warm key + cool counter-fill + a bounce that actually fills ──
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
  sun.name = 'sunLight';
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowRes, shadowRes);
  sun.shadow.camera.near = 1;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.022;
  scene.add(sun, sun.target);

  const moon = new THREE.DirectionalLight(0xa6b4d4, 0.0);
  moon.name = 'moonLight';
  moon.castShadow = false;
  moon.shadow.mapSize.set(shadowRes, shadowRes);
  moon.shadow.camera.near = 1;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.05;
  scene.add(moon, moon.target);
  // mobile: the key maps are redrawn on a clock (see refreshShadows), not every
  // frame. `?shadowclock=0` (or sky.shadowClock = false) turns the clock off —
  // needed by any harness that renders WITHOUT stepping the game (tools/
  // mobilebench.mjs's measurement renders), which would otherwise never see a
  // shadow pass at all on the mobile tier.
  let shadowClock = MOBILE && ctx.params?.get?.('shadowclock') !== '0';
  function setShadowClock(on) {
    shadowClock = !!(MOBILE && on);
    sun.shadow.autoUpdate = !shadowClock; moon.shadow.autoUpdate = !shadowClock;
  }
  setShadowClock(shadowClock);

  // Cool directional from the anti-sun side. This is what makes away-facing
  // surfaces read cool-blue while sun-facing ones read warm — a hemisphere
  // light can only split up/down, never toward/away from the sun.
  const fill = new THREE.DirectionalLight(0x86aee8, 0.3);
  fill.name = 'skyFill';
  fill.castShadow = false;
  scene.add(fill, fill.target);

  const hemi = new THREE.HemisphereLight(0xb8dcff, 0xffd9c2, 0.46);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x2e3358, 0.0);
  scene.add(ambient);

  scene.fog = new THREE.Fog(0xdfeef0, 62, 380);
  scene.background = null; // the dome always covers the frame

  // ── scratch (no per-frame allocation past this point) ───────────────────────
  const grade = makeGrade();
  const sunDir = new THREE.Vector3(0, 1, 0);
  const moonDir = new THREE.Vector3(0, -1, 0);
  const anchor = new THREE.Vector3();
  const groundCol = new THREE.Color(GROUND_TINT.candy);
  const targetGround = new THREE.Color(GROUND_TINT.candy);
  const bounceCol = new THREE.Color();
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
  const ray = new THREE.Vector3(), hit = new THREE.Vector3(), centroid = new THREE.Vector3();
  const fitPts = [0, 0, 0, 0, 0].map(() => new THREE.Vector3());
  // mobile only: the furthest visible ground (top of frame) for the depth fit
  const FAR_SET = MOBILE ? FAR_SAMPLES : FAR_SAMPLES_DESK;
  const farPts = FAR_SET.map(() => new THREE.Vector3());
  let farN = 0;
  let shadowAcc = 1, shadowForce = true;
  const lastRefresh = new THREE.Vector3(1e9, 0, 0);
  let lastHalf = -1, lastSunCasts = null;
  const vis = new THREE.Vector3();

  /** sin(elevation) of the highest ray in the camera frustum (top edge). */
  function frameTopSin() {
    const cam = ctx.camera, q = cam.quaternion;
    const tanV = Math.tan((cam.fov * 0.5) * Math.PI / 180), tanH = tanV * cam.aspect;
    const fy = vis.set(0, 0, -1).applyQuaternion(q).y;
    const uy = vis.set(0, 1, 0).applyQuaternion(q).y;
    const ry = vis.set(1, 0, 0).applyQuaternion(q).y;
    let best = -1;
    for (let k = -1; k <= 1; k++) {
      const v = (fy + uy * tanV + k * ry * tanH) / Math.sqrt(1 + tanV * tanV + k * k * tanH * tanH);
      if (v > best) best = v;
    }
    return best;
  }
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const negDir = new THREE.Vector3();
  const horizonColor = new THREE.Color();
  const zenithColor = new THREE.Color();
  const sunColor = new THREE.Color();
  const sunDiscColor = new THREE.Color();
  const haze = [0, 0, 0];   // far-haze colour in literal sRGB (see the fog block)
  // screen-space samples used to fit the shadow box: centre, both bottom
  // corners, and two rays slightly ABOVE centre (the far ground).
  const FIT_SAMPLES = [[0, 0], [-1, -1], [1, -1], [-0.85, 0.16], [0.85, 0.16]];
  let phase = phaseOf(ctx.state.time);
  let booted = false;
  let shadowHalf = SHADOW_MIN;
  let lampsOn = lampMixAt(ctx.state.time) > 0.5;

  const setV = (u, c) => u.value.set(c[0], c[1], c[2]);
  const setL = (col, c) => col.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

  /**
   * Fit the shadow box to the ground the CAMERA actually sees, not to a fixed
   * radius around the player. A steep gameplay camera keeps the tight 88-unit
   * box; a low-elevation or long-lens shot widens it (quantised, so the box
   * doesn't jitter) so long raking shadows read right across the ground.
   */
  function fitShadowBox(groundY, keyElev) {
    const cam = ctx.camera;
    const tanV = Math.tan((cam.fov * 0.5) * Math.PI / 180);
    const tanH = tanV * cam.aspect;
    centroid.set(0, 0, 0);
    for (let i = 0; i < FIT_SAMPLES.length; i++) {
      const [sx, sy] = FIT_SAMPLES[i];
      ray.set(sx * tanH, sy * tanV, -1).applyQuaternion(cam.quaternion).normalize();
      const t = ray.y < -0.02 ? (groundY - cam.position.y) / ray.y : GROUND_RAY_MAX;
      hit.copy(cam.position).addScaledVector(ray, clamp(t, 0, GROUND_RAY_MAX));
      fitPts[i].copy(hit);
      centroid.add(hit);
    }
    centroid.multiplyScalar(1 / FIT_SAMPLES.length);
    let r = 0;
    for (const p of fitPts) r = Math.max(r, Math.hypot(p.x - centroid.x, p.z - centroid.z));
    // the player must never fall outside the box
    const pl = ctx.systems.player?.position;
    if (pl) r = Math.max(r, Math.hypot(pl.x - centroid.x, pl.z - centroid.z) + 6);
    // A dawn key at 7° throws a shadow eight times the caster's height. Fitting
    // the box to the camera alone would cut those off halfway across the frame,
    // which is the opposite of the long raking dawn shadows we want — so widen
    // the box as the key drops. Quantised with the rest so it never jitters.
    const low = clamp((0.34 - keyElev) / 0.34, 0, 1);
    r *= 1 + low * 0.55;
    anchor.set(centroid.x, groundY, centroid.z);
    if (MOBILE || DEPTH_FIT) {
      // the rest of the frame's ground, for the depth fit only (the box itself
      // is fitted exactly as on desktop, so framing and texel size match)
      farN = 0;
      for (let i = 0; i < FAR_SET.length; i++) {
        const [sx, sy] = FAR_SET[i];
        ray.set(sx * tanH, sy * tanV, -1).applyQuaternion(cam.quaternion).normalize();
        const t = ray.y < -0.02 ? (groundY - cam.position.y) / ray.y : (MOBILE ? GROUND_RAY_MAX : cam.far);
        // desktop: the whole frame, however far the lens (an overview's top
        // edge lies well past GROUND_RAY_MAX)
        farPts[farN++].copy(cam.position).addScaledVector(ray, clamp(t, 0, MOBILE ? GROUND_RAY_MAX : cam.far));
      }
    }
    return clamp(Math.ceil((r + 10) / 6) * 6, SHADOW_MIN, SHADOW_MAX);
  }

  /**
   * MOBILE: how deep (along the key direction, past the anchor) the furthest
   * ground the camera can see lies. Nothing deeper than the deepest RECEIVER can
   * shadow anything on screen — a caster has to sit between the light and the
   * surface it darkens — so the shadow camera's far plane can stop there
   * instead of 2·half + 140 units past the anchor. At a low sun that cut is the
   * whole back half of a 370-unit strip of island, which is where most of the
   * shadow-pass draw calls came from.
   */
  function depthOf(p, dir) {
    // desktop: every sample as low as a receiver there could be (see RECEIVER_FLOOR)
    const py = MOBILE ? p.y : Math.min(p.y, RECEIVER_FLOOR);
    return -(p.x - anchor.x) * dir.x - (py - anchor.y) * dir.y - (p.z - anchor.z) * dir.z;
  }
  function receiverDepth(dir) {
    const pl = ctx.systems.player?.position;
    let d = pl ? depthOf(pl, dir) : 0;
    for (let i = 0; i < fitPts.length; i++) { const v = depthOf(fitPts[i], dir); if (v > d) d = v; }
    for (let i = 0; i < farN; i++) { const v = depthOf(farPts[i], dir); if (v > d) d = v; }
    return d;
  }

  /**
   * Aim a key light at `anchor`, snapped to the shadow texel grid.
   *
   * Bias is expressed in TEXELS, not in magic world units. The old rig used a
   * 0.012 normalBias at midday against a 0.024-unit texel — HALF a texel — and
   * PCFSoftShadowMap spreads its taps over 2–3 texels, so every smooth curved
   * surface (the pink fountain tiers in Gumdrop Village were the worst case)
   * self-shadowed into stair-step moiré bands. The offset now scales with the
   * real texel size and with 1/sin(elevation), which is how far a texel smears
   * along the ground at a grazing key: ~2.7 texels at noon, ~5 at dawn.
   */
  function aimKey(light, dir, dist, half) {
    tmpA.copy(dir);
    if (tmpA.y < MIN_KEY_ELEV) { tmpA.y = MIN_KEY_ELEV; tmpA.normalize(); }
    const res = light.shadow.mapSize.x;
    // world size of one shadow texel, and how far it smears along the ground
    const texel = (half * 2) / res;
    const elev = Math.max(tmpA.y, 0.18);
    const c = light.shadow.camera;
    let far = dist + half * 2 + 140;
    if (!MOBILE) {
      light.shadow.normalBias = clamp(texel * (1.30 + 1.05 / elev), 0.030, 0.110);
      light.shadow.bias = -0.00022 - texel * 0.0040;
      if (DEPTH_FIT) {
        // the mobile fit below, with the desktop normalBias: the same world-
        // space depth offset over a shorter range is a proportionally larger
        // normalised bias
        const need = Math.ceil((Math.max(0, receiverDepth(tmpA)) + 18) / 8) * 8;
        const full = far;
        far = Math.min(full, dist + Math.max(32, need));
        light.shadow.bias *= (full - 1) / (far - 1);
      }
    } else {
      // Depth range cut to the visible receivers (+ a margin for terrain relief
      // and the walls that catch shadows), quantised so it does not churn.
      const need = Math.ceil((Math.max(0, receiverDepth(tmpA)) + 18) / 8) * 8;
      const full = far;
      far = Math.min(full, dist + Math.max(32, need));
      // Same WORLD-space offsets as desktop: bias is in normalised depth, so a
      // shorter depth range needs a proportionally larger value; normalBias is
      // allowed up to ~2.7 texels of the coarser 1024² map (acne otherwise).
      light.shadow.normalBias = clamp(texel * (1.30 + 1.05 / elev), 0.030, 0.200);
      light.shadow.bias = (-0.00022 - texel * 0.0040) * (full - 1) / (far - 1);
    }
    if (c.right !== half || c.far !== far) {
      c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.far = far;
      c.updateProjectionMatrix();
    }
    // light-space basis for texel snapping (kills shadow crawl while walking)
    tmpB.copy(WORLD_UP).cross(tmpA).normalize();     // right
    tmpC.copy(tmpA).cross(tmpB).normalize();         // up
    const px = anchor.dot(tmpB), py = anchor.dot(tmpC);
    const dx = Math.round(px / texel) * texel - px;
    const dy = Math.round(py / texel) * texel - py;
    light.target.position.copy(anchor).addScaledVector(tmpB, dx).addScaledVector(tmpC, dy);
    light.position.copy(light.target.position).addScaledVector(tmpA, dist);
    light.target.updateMatrixWorld();
  }

  /**
   * MOBILE: redraw the live key's shadow map on a clock (~40 Hz cap) instead of
   * every frame — immediately on anything discontinuous (first frame, time jump,
   * key swap, box resize, a teleport-sized move). Between redraws three keeps
   * using the previous map WITH the matrix it was drawn with (shadow.matrix only
   * changes inside a redraw), so static shadows never slide; only moving
   * casters lag by at most one frame.
   */
  function refreshShadows(dt, sunCasts) {
    const key = sunCasts ? sun : moon;
    shadowAcc += dt;
    const moved = (anchor.x - lastRefresh.x) ** 2 + (anchor.z - lastRefresh.z) ** 2 > 36;
    if (shadowForce || shadowAcc >= MOBILE_SHADOW_REFRESH || moved || sunCasts !== lastSunCasts
      || shadowHalf !== lastHalf || !key.shadow.map) {
      key.shadow.needsUpdate = true;
      shadowAcc = 0; shadowForce = false;
      lastRefresh.copy(anchor); lastHalf = shadowHalf; lastSunCasts = sunCasts;
    }
  }

  function applyGrade(dt) {
    const t = ctx.state.time;
    sampleGrade(t, grade);

    // ── celestial geometry ───────────────────────────────────────────────────
    const th = sunAngle(t);
    const cs = Math.cos(th), sn = Math.sin(th);
    sunDir.set(cs, NOON.y * sn, NOON.z * sn).normalize();
    moonAt(t, moonDir);
    const elev = sunDir.y;
    // Knee pulled in from 0.38 to 0.26 (≈15° of sun elevation, not 22°). Half
    // the game reads `state.daylight` to decide how night-ish to be, and with
    // the old curve a sun 4.5° above the horizon still scored 0.26 — so at
    // 05:53 the lanterns were at 74%, the Sour Patch Kids were still hunting
    // and every night shader was still on. Dawn now actually arrives for
    // everybody, not just for the sky.
    const daylight = smoothstep(-0.09, 0.26, elev);
    ctx.state.daylight = daylight;
    api.daylight = daylight;

    // ── phase event ──────────────────────────────────────────────────────────
    const ph = phaseOf(t);
    if (ph !== phase || !booted) { phase = ph; api.phase = ph; ctx.events.emit('sky:phase', ph); }

    // ── street-lamp master switch ────────────────────────────────────────────
    // Driven by the clock, not by daylight, so "lamps out by 06:21" is exact
    // and every lantern in both towns can agree on one number.
    const lampMix = lampMixAt(t);
    api.lampMix = lampMix;
    const lampNow = lampMix > 0.5;
    if (lampNow !== lampsOn || !booted) {
      lampsOn = lampNow; api.lampsOn = lampNow;
      ctx.events.emit('sky:lamps', { on: lampNow, mix: lampMix });
    }

    // ── dome ─────────────────────────────────────────────────────────────────
    const du = dome.uniforms;
    setV(du.uZen, grade.zen); setV(du.uMid, grade.mid); setV(du.uHor, grade.hor);
    setV(du.uHalo, grade.halo); setV(du.uBand, grade.band);
    setV(du.uLine, grade.lineC);
    du.uHaloS.value = grade.haloS; du.uBandS.value = grade.bandS;
    du.uLineS.value = grade.lineS;
    du.uMoonHalo.value = grade.mHalo;
    // the warm band rides up with its luminary so glow and disc are one shape
    const lum = Math.max(sunDir.y > -0.06 ? sunDir.y : moonDir.y, 0);
    du.uBandY.value = clamp(lum * 0.62, 0.0, 0.36);
    du.uBandW.value = lerp(11.5, 5.2, smoothstep(0.0, 0.5, lum));
    du.uSunDir.value.copy(sunDir); du.uMoonDir.value.copy(moonDir);
    // sun and moon no longer share an axis, so the band/horizon-line azimuth
    // has to pick a side: the sun while it has any say, the moon after that
    du.uBandDir.value.copy(sunDir.y > -0.06 ? sunDir : moonDir);
    du.uStarA.value = grade.starA;

    // ── stars ────────────────────────────────────────────────────────────────
    stars.uniforms.uTime.value = ctx.state.elapsed;
    stars.uniforms.uAlpha.value = grade.starA;
    stars.uniforms.uPR.value = renderer.getPixelRatio();
    // Stars are sized in device pixels, so a long lens (a scenic shot at FOV
    // 45-70) spreads the same sky over more of them and they thin out. Push the
    // gain back up as the lens widens so the night sky reads at every framing.
    stars.uniforms.uGain.value = clamp(0.92 + (ctx.camera.fov - 30) * 0.012, 0.9, 1.45);
    stars.points.visible = grade.starA > 0.01;

    // ── sun / moon billboards ────────────────────────────────────────────────
    const su = sunDisc.uniforms;
    setV(su.uDisc, grade.discC); setV(su.uCore, grade.coreC); setV(su.uGlow, grade.glowC);
    su.uGlowS.value = grade.glowS;
    const sunVis = smoothstep(-0.12, 0.02, sunDir.y);
    su.uAlpha.value = sunVis;
    sunDisc.mesh.visible = sunVis > 0.01;
    if (sunDisc.mesh.visible) {
      sunDisc.mesh.position.copy(sunDir).multiplyScalar(sunDisc.dist);
      negDir.copy(sunDir).negate();
      sunDisc.mesh.quaternion.setFromUnitVectors(Z_AXIS, negDir);
    }

    const mu = moonDisc.uniforms;
    // The moon used to inherit the starfield's alpha, which meant it only
    // existed once the sky was fully dark — it winked out of every dusk frame
    // just as it cleared the horizon. Give it its own curve: a pale daytime
    // moon at dusk (28%), full brightness once night lands.
    const nightness = clamp(1 - daylight * 1.25, 0, 1);
    const moonVis = smoothstep(-0.02, 0.10, moonDir.y) * lerp(0.28, 1.0, nightness);
    mu.uAlpha.value = moonVis;
    mu.uGlowS.value = 0.38 + 0.42 * nightness;
    moonDisc.mesh.visible = moonVis > 0.01;
    if (moonDisc.mesh.visible) {
      moonDisc.mesh.position.copy(moonDir).multiplyScalar(moonDisc.dist);
      negDir.copy(moonDir).negate();
      moonDisc.mesh.quaternion.setFromUnitVectors(Z_AXIS, negDir);
    }

    // ── lights ───────────────────────────────────────────────────────────────
    setL(sun.color, grade.sunC);
    sun.intensity = grade.sunI;
    setL(moon.color, grade.moonC);
    moon.intensity = grade.moonI;
    setL(fill.color, grade.fillC);
    fill.intensity = grade.fillI;

    setL(hemi.color, grade.hSky);
    const isl = GROUND_TINT[ctx.state.island] !== undefined ? ctx.state.island : 'candy';
    targetGround.setHex(GROUND_TINT[isl]);
    if (!booted) groundCol.copy(targetGround);
    else {
      groundCol.r = damp(groundCol.r, targetGround.r, 1.4, dt);
      groundCol.g = damp(groundCol.g, targetGround.g, 1.4, dt);
      groundCol.b = damp(groundCol.b, targetGround.b, 1.4, dt);
    }
    // desaturate the island bounce at night (grass must not go acid lime)
    bounceCol.copy(groundCol).lerp(NIGHT_NEUTRAL, 1 - grade.gSat);
    hemi.groundColor.setRGB(grade.hGnd[0], grade.hGnd[1], grade.hGnd[2], THREE.SRGBColorSpace);
    hemi.groundColor.multiply(bounceCol);
    hemi.intensity = grade.hI;

    setL(ambient.color, grade.ambC);
    ambient.intensity = grade.ambI;

    // exported sky colours for other systems (sea reflections, glints, …)
    setL(horizonColor, grade.hor);
    setL(zenithColor, grade.zen);
    setL(sunColor, grade.sunI > grade.moonI ? grade.sunC : grade.moonC);
    setL(sunDiscColor, grade.discC);

    // one shadow map at a time: sun by day, moon by night — and exactly one
    // shadow light at ALL times (both tiers; desktop since Contract J): a 0 ↔ 1
    // flip at dusk recompiles every lit program in the scene. Between the sun
    // letting go and the moon reaching 0.30 the moon is too dim for its
    // shadow to read, so casting through that window costs nothing visible.
    const sunCasts = grade.sunI > 0.35;
    sun.castShadow = sunCasts;
    moon.castShadow = !sunCasts;

    // ── shadow box fitted to what the camera sees ────────────────────────────
    const pl = ctx.systems.player?.position;
    const groundY = pl ? pl.y : 2;
    shadowHalf = fitShadowBox(groundY, Math.max((sunCasts ? sunDir : moonDir).y, MIN_KEY_ELEV));
    const keyDist = KEY_DIST + (shadowHalf - SHADOW_MIN) * 1.5;
    aimKey(sun, sunDir, keyDist, shadowHalf);
    aimKey(moon, moonDir, keyDist, shadowHalf);
    if (shadowClock) refreshShadows(dt, sunCasts);
    // COOL COUNTER-FILL, always from the side opposite whichever key is live —
    // derived from the key itself rather than from "the other luminary", which
    // used to leave dusk and deep night with the fill and the key on the SAME
    // side (no two-sided rig at all, which is most of why night read flat).
    // Lifted well above the horizon so shadowed up-facing ground catches it.
    const keyV = sunCasts ? sunDir : moonDir;
    tmpA.set(-keyV.x, 0, -keyV.z);
    if (tmpA.lengthSq() < 1e-6) tmpA.set(0, 0, 1);
    tmpA.normalize();
    tmpA.y = 0.38 + Math.max(keyV.y, 0) * 0.22;
    tmpA.normalize();
    fill.target.position.copy(anchor);
    fill.position.copy(anchor).addScaledVector(tmpA, 120);
    fill.target.updateMatrixWorld();

    // ── fog: tracks the horizon colour, the camera pitch and fogScale ────────
    // …but NOT exactly. Matching the dome horizon pixel-for-pixel is what made
    // the sea dissolve into the sky at dawn and dusk — there was no seam at
    // all, so the water just stopped existing somewhere in the haze. Push the
    // far haze a few percent darker and greyer than `uHor` (grade.hzD) and the
    // distant sea becomes a band that ENDS, right under the dome's bright
    // horizon line. Land in the far distance loses a little chroma too, which
    // is aerial perspective doing its job.
    // Worked in literal sRGB (grade.hor's own space) so the offset from the
    // dome's horizon is exactly the authored percentage.
    const hz = grade.hzD;
    const hl = grade.hor[0] * 0.2126 + grade.hor[1] * 0.7152 + grade.hor[2] * 0.0722;
    const hk = 1 - hz * 0.20;
    haze[0] = lerp(grade.hor[0], hl * 0.96, hz * 0.42) * hk;
    haze[1] = lerp(grade.hor[1], hl * 0.99, hz * 0.42) * hk;
    haze[2] = lerp(grade.hor[2], hl * 1.07, hz * 0.42) * hk;
    setL(scene.fog.color, haze);
    // A flat/horizon camera stares down hundreds of units of ground, so fog has
    // to start close for aerial perspective; a steep gameplay camera only sees
    // ~40 u, so push fog back and keep near props crisp.
    tmpB.set(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
    const pitch = clamp(-tmpB.y, 0, 1);
    const steep = smoothstep(0.12, 0.58, pitch);
    const nearMul = lerp(1.0, 1.42, steep);
    const farMul = lerp(0.84, 1.14, steep);
    // Overview shots ask for a big fogScale so the far island stays legible;
    // let `far` follow it but keep `near` almost put so haze still builds.
    const fs0 = Math.max(1, ctx.state.fogScale || 1);
    const fsFar = 1 + (fs0 - 1) * 0.68;
    const fsNear = 1 + (fs0 - 1) * 0.32;
    // …and a long lens sees more world per pixel, so let `far` breathe with the
    // camera distance too (keeps the far island legible in scenic shots).
    const camDist = ctx.systems.camera?.params?.distance || 46;
    const distMul = clamp(1 + (camDist - 46) * 0.0042, 1, 1.34);
    scene.fog.near = grade.fogN * nearMul * fsNear;
    scene.fog.far = grade.fogF * farMul * fsFar * distMul;

    // ── clouds ───────────────────────────────────────────────────────────────
    const cu = clouds.uniforms;
    setV(cu.uLit, grade.cLit); setV(cu.uShad, grade.cShad); setV(cu.uRim, grade.cRim);
    cu.uRimS.value = grade.cRimS;
    cu.uSunDir.value.copy(sunDir.y > -0.05 ? sunDir : moonDir);
    // clouds fade into the DOME's horizon, not into the darker sea haze —
    // they are sky, and they should disappear into sky
    setV(cu.uFogCol, grade.hor);
    cu.uFogNear.value = scene.fog.near * 2.6;
    cu.uFogFar.value = scene.fog.far * 1.9;
    clouds.update(ctx.state.elapsed, ctx.camera.position.x, ctx.camera.position.z);

    // ── sea mist ─────────────────────────────────────────────────────────────
    const mistAmt = mistAmountAt(t, daylight);
    api.mistAmount = mistAmt;
    if (mist) mist.mesh.visible = mistAmt > 0.01;
    if (mist && mist.mesh.visible) {
      const mi = mist.uniforms;
      mi.uAmt.value = mistAmt;
      mi.uTime.value = ctx.state.elapsed;
      // near mist is lit by the sky overhead, far mist becomes the haze itself
      // (both literal sRGB, like every other sky mesh — see the header)
      setV(mi.uNear, grade.mistC);
      setV(mi.uFar, haze);
      mi.uFogN.value = scene.fog.near * 1.25;
      mi.uFogF.value = scene.fog.far * 0.92;
    }

    // ── exposure ─────────────────────────────────────────────────────────────
    renderer.toneMappingExposure = grade.exp;

    // (the sky objects this lens cannot see are dropped per render, below —
    // applyGrade shows them, the cull only ever hides)
    clouds.group.visible = true;

    // dome/stars/discs ride with the camera so the horizon never runs out
    group.position.copy(ctx.camera.position);
    booted = true;
  }

  // ── drop the sky objects this lens cannot see (see SKY_CULL_MARGIN) ────────
  // Both tiers (desktop since Contract J: 3 draws a frame at every gameplay
  // spot). Runs in scene.onBeforeRender with the camera the frame is drawn
  // with, so the test is exact (the old per-update test read the previous
  // frame's lens). Only ever HIDES (applyGrade shows them again every update),
  // so a system that hid a disc itself — the palace and the cave hide the sun
  // and moon indoors — is never overridden.
  function skyCull(camera) {
    if (camera !== ctx.camera) return;
    const topEl = Math.asin(clamp(frameTopSin(), -1, 1));
    const below = topEl < -SKY_CULL_MARGIN;
    clouds.group.visible = !(below && camera.position.y < CLOUD_FLOOR);
    if (below) stars.points.visible = false;
    if (sunDisc.mesh.visible && Math.asin(clamp(sunDir.y, -1, 1)) - SUN_QUAD_R - SKY_CULL_MARGIN > topEl) sunDisc.mesh.visible = false;
    if (moonDisc.mesh.visible && Math.asin(clamp(moonDir.y, -1, 1)) - MOON_QUAD_R - SKY_CULL_MARGIN > topEl) moonDisc.mesh.visible = false;
  }
  {
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = function (r, sc, camera, target) {
      if (prev) prev.call(this, r, sc, camera, target);
      try { if (!target) skyCull(camera); } catch (err) { if (!skyCull.warned) { skyCull.warned = true; console.error('[sky] cull failed', err); } }
    };
  }

  // (mesh, [material, twin]) pairs the warm-up also draws with the material
  // NOT in use at the time, so a system's runtime material swap never compiles
  // mid-game (terrain's no-point-light sea twin; see drawEverything)
  const warmSwaps = [];
  const api = {
    warmSwap(mesh, mats) { warmSwaps.push({ mesh, mats }); },
    sun, moon, fill, hemi, ambient, group, clouds, mist, grade,
    sunDir, moonDir, phase, daylight: 1,
    horizonColor, zenithColor, sunColor, sunDiscColor,
    // street lamps / window glow / lanterns: ON through dusk, OUT by 06:21.
    // Read `lampMix` for a smooth 0..1 (emissive strength), `lampsOn` for the
    // boolean (whether to add a PointLight at all). 'sky:lamps' fires on flips.
    lampsOn, lampMix: lampMixAt(ctx.state.time),
    mistAmount: 0,
    get shadowHalf() { return shadowHalf; },
    /** mobile tier: is the key shadow map on its redraw clock? (setter: false = every frame) */
    get shadowClock() { return shadowClock; },
    set shadowClock(v) { setShadowClock(v); shadowForce = true; },
    /** Force a full re-grade (used after time jumps). */
    refresh() { shadowForce = true; applyGrade(1 / 30); },
    update(dt) { applyGrade(dt); },
  };

  // one line in the render log so the budget is measured, not asserted
  if (mist) {
    console.warn(`[sky] ${4 + clouds.group.children.length + 1} draw calls max `
      + `(dome, stars, sun, moon, ${clouds.group.children.length} cloud batches, mist) · `
      + `mist ${mist.tris} tris · clouds ${clouds.count} puffs · shadow ${SHADOW_MAP}²`);
  } else {
    console.warn(`[sky] mobile tier · ${4 + clouds.group.children.length} draw calls max `
      + `(dome, stars, sun, moon, ${clouds.group.children.length} cloud batches, no mist) · `
      + `clouds ${clouds.count} puffs · shadow ${shadowRes}², one caster, redrawn ≤ ${Math.round(1 / MOBILE_SHADOW_REFRESH)} Hz`);
  }

  // ── warm every program once, in the background (Contract J) ───────────────
  // The light COUNT never changes any more (one shadow-casting key at all
  // times, a constant lamp pool — terrain/lamppool.js), so the programs a
  // night frame needs are exactly the programs it would compile today. The
  // only ones still missing at dusk are the materials nothing has drawn yet
  // (halos, spills, night glows, rooms, the palace and the cave): compile the
  // whole scene once, a second after the first frame, with three's async path
  // (KHR_parallel_shader_compile — the driver compiles off the main thread),
  // so the first dusk links nothing. Never in ?shot (the render harness).
  // A linked program is not the whole bill on ANGLE Metal: the first DRAW of a
  // material also builds its pipeline state and uploads its buffers and
  // textures — 40–60 ms frames at 18.32, 18.5, 18.6, 18.8 and 18.87 h, exactly
  // where the night halos, spills and glows first appear. So once the programs
  // are ready, desktop draws the whole scene ONCE — every hidden object and
  // material shown, culling off, both passes — and then the real frame again in
  // the same task, so only the real frame is ever presented. Lights are never
  // touched (the light count must not change). One heavy frame behind the
  // title card instead of a hitch at every first sight of something.
  function drawEverything() {
    const t0 = performance.now();
    const objs = [], mats = [], culls = [];
    scene.traverse((o) => {
      if (o.isLight) return;
      if (o.visible === false) { o.visible = true; objs.push(o); }
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      if (o.frustumCulled) { o.frustumCulled = false; culls.push(o); }
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m && m.visible === false) { m.visible = true; mats.push(m); }
    });
    const swapped = [];
    for (const W of warmSwaps) {
      const cur = W.mesh.material, other = W.mats[0] === cur ? W.mats[1] : W.mats[0];
      if (other && other !== cur) { W.mesh.material = other; swapped.push(W.mesh, cur); }
    }
    try { renderer.render(scene, ctx.camera); } finally {
      for (const o of objs) o.visible = false;
      for (const o of culls) o.frustumCulled = true;
      for (const m of mats) m.visible = false;
      for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
    }
    renderer.render(scene, ctx.camera);
    return Math.round(performance.now() - t0);
  }
  if (!ctx.shot) {
    let frames = 0;
    const prevHook = scene.onBeforeRender;
    const warm = function (r, sc, camera, target) {
      if (prevHook) prevHook.call(this, r, sc, camera, target);
      if (target || camera !== ctx.camera || ++frames !== 60) return;
      setTimeout(() => {
        try {
          const p0 = renderer.info.programs?.length ?? 0, t0 = performance.now();
          renderer.compileAsync(scene, ctx.camera).then(() => {
            api.warmed = { programs: (renderer.info.programs?.length ?? 0) - p0, ms: Math.round(performance.now() - t0) };
            // desktop: then DRAW everything once (see drawEverything)
            if (!MOBILE) requestAnimationFrame(() => { try { api.warmed.drawMs = drawEverything(); } catch (err) { console.warn('[sky] warm draw skipped', err.message); } });
          }).catch(() => {});
        } catch (err) { console.warn('[sky] program warm-up skipped', err.message); }
      }, 0);
    };
    scene.onBeforeRender = warm;
  }

  ctx.events.on('time:set', () => api.refresh());
  // sky is system #0, so nobody is listening yet during create(): announce the
  // opening phase once everyone exists.
  ctx.events.on('world:ready', () => ctx.events.emit('sky:phase', api.phase));
  applyGrade(1 / 30);
  return api;
}
