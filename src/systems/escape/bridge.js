// ─────────────────────────────────────────────────────────────────────────────
// THE RAINBOW BRIDGE — WAVE 4, Contract L. When you have found your way off Cat
// Island and back three times (story `escape_returns` reaches 3), the strait
// gives up: a 25-second cinematic raises a seven-band rainbow from the end of
// Sugar Pier to the Arrivals Pier, and the islands are joined. So are their
// problems — after dark the far end glows red, and that is the door the raids
// come through (Contract M: the tigers cross one way, the Sourlings the
// other).
//
// THE SHAPE. A rainbow you can WALK has to obey the visitor's legs, not the
// sky. player.js follows a deck through a λ20 spring and treats a drop bigger
// than 0.45 u + 0.9 × a frame's travel as "walked off an edge" (a FALL from
// wherever the feet were: the r1 deck launched a sprinter 3 u into the air).
// A sprint with a star trips that at a grade of 0.72 at 144 fps — and round a
// bend the INSIDE rail is steeper than the centreline by R / (R − 1.85). So the
// profile caps the grade at GSAFE = 0.675 measured along the inside rail, and
// the plan keeps its bends wide: the deck runs a U over the NORTH strait (the
// default iso lens sits south-east of the visitor, so the bridge stands behind
// the piers instead of between the camera and him), up both coasts on straight
// legs and round ONE wide bend (R ≥ 23) over open water, clear of the beaches,
// the docked whale and the CatBlimp's loop (its nearest pass is its own
// Sugar Pier mooring, 14 u off the candy foot). A 0.42 ramp at each foot (it
// has to clear the pier's own rail) eases into the capped grade and a 20-u
// rounded crest. Contract L asked for an apex ≈ 60: at the legs' grade that
// needs a deck over 200 u long that would sit on both beaches; this one is
// 171 u with its apex at ≈ 54 u (see the report() line at world:ready).
//
// NEIGHBOURS. Sugar Pier's own handrail (Contract O) runs across the ramp's
// foot; the ramp clears it and its colliders there are un-solidified while the
// bridge stands (restored if it ever comes down). Our handrails are thin boxes
// (1-u segments, SOLID with no top, like Contract O's rails: no jump clears
// one and nobody perches on one) that are SOLID only near the visitor while he
// is up on the deck — the ground core has no collider bottoms, so an
// always-solid rail would be an invisible wall on the beach under each ramp. Cat Island's containment "wave of kitties" shoves the
// visitor inland near the Arrivals Pier; up on the deck a DECK GUARD puts him
// back (the gag still plays).
//
// THE LOOK (5 draw calls, nothing casts shadows but the candy canes):
//   deck    seven lengthwise candy bands (red outside the U, violet inside),
//           SOLID (r4), drawn in literal sRGB with a light fog of its own so
//           the full ROYGBIV chroma reaches the screen (ACES and the sky's
//           aerial perspective had bleached it to pastel), a shimmer running
//           along; it glows after dark because the world darkens round it
//   fascia  both sides: the seven bands STACKED (red on top), a shade under
//           the deck top, over a dark INK LIP — the crisp underside edge —
//           and a belly of the bands again in shade (seen from the north)
//   canes   candy-cane handrails + their posts, the two gate arches (canes
//           crooked into a heart), their gumdrop lanterns — one mesh
//   signs   the four gate plaques (one CanvasTexture)
//   fx      ONE additive mesh: halo ribbons above, below and beside the body,
//           the gate lanterns, EYES IN THE DARK at the far gate, and the
//           sparkle motes drifting up off the arch (billboards; the red, the
//           blinking and the drift are uniforms)
// The deck is REVEALED from both feet toward the apex by one `uGrow` uniform
// (every part carries aE = 0 at the feet → 1 at the crest), so the raise costs
// nothing but a float per frame.
//
// WALKABLE (Contract A): ctx.walkables gets { id:'rainbowBridge', test(x,z) }
// → deck y, via a 1-u lookup grid + an exact projection onto two segments (O(1),
// no allocation; 150 NPCs a frame never leave the bbox test). Gated so nothing
// UNDER the deck is yanked onto it: over land/beach only the ramp foot counts
// for NPCs; near the visitor it counts only while his feet are at or above it
// (the ferry, a canoe, the flying machine pass underneath untouched).
// NPC raiders should read api.heightAt(x, z) (ungated) and walk api.path.
//
// API — ctx.systems.escape.routes.bridge
//   up · raising · length · apex {x,y,z} · ends {candy:{x,z}, cat:{x,z}}
//   path [[x,z]...] (deck centreline every 4 u, candy → cat) · path3 [[x,y,z]...]
//   heightAt(x,z) → deck y | null (ungated) · sAt(x,z) → arc length | -1
//   pointAt(s) → {x,y,z} (shared scratch) · humLevel (0..1, the visitor's nearness)
//   debugRaise(instant?) · debugCine(t) (pose the raise at t s, for renders)
//   debugWalk('cat'|'candy'|null) (steers the visitor along the deck)
//   cineHero (the raise's hero framing, mutable, for tuning) · cineShot (QA)
// THE RAISE (r4): pier foot → chase the candy tip → swing round the west, high
//   over the Candy Kingdom → the hero from the NORTH (see HERO): a wide, low
//   arch, deck on top, both islands, the CatBlimp behind it. While it runs the
//   haze thins (ctx.state.fogScale → 3, restored after) and the title card
//   sits in the sky above the crest.
// Events: 'bridge:raise' (cinematic starts) · 'bridge:up' · escape:start /
//   escape:success {route:'bridge', from, to} on every crossing, both ways.
// Story: sets `rainbow_bridge`; listens to 'story:escape_returns' (≥ 3 → raise
//   3.5 s later, after containment's "YOU CAME BACK" banner has read).
// URL: ?bridge=1 raises it instantly at load · ?bridge=cine plays the raise.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hash, clamp, damp, lerp, smoothstep } from '../../core/util.js';

// ── the plan: north U from Sugar Pier's head to the Arrivals Pier's head ────
// (r2: straight legs up the coasts and ONE wide bend over open water — no
//  bend tighter than R ≈ 23, so the inside rail never reads much steeper than
//  the centreline; see GSAFE)
const CTRL = [
  [-30.5, 21], [-30.5, 15], [-30.8, 5], [-31, -5], [-30.5, -16], [-27.5, -28], [-21, -38.5], [-11, -45.5], [0.5, -48],
  [12, -45.5], [21.5, -38.5], [27.2, -28], [28.8, -16], [28.2, -5], [27.4, 5], [28.6, 14], [31, 21],
];
const DS = 0.5;                 // sample spacing along the deck
const HW = 2.5;                 // deck half width (a 5-u deck)
const SMAX = 0.84;              // the foot's shape (it starts at half this: the pier rail must pass under)
// The grade the visitor's legs allow EVERYWHERE, measured along the INSIDE
// rail (the steepest line a walker can take round a bend): player.js reads a
// deck that drops faster than 0.45 u + 0.9 × a frame's travel below the
// ground-follow spring as "walked off an edge". A sprint with a star
// (7 × 1.58 × 1.25 = 13.8 u/s) trips that at 0.72 at 144 fps and at 0.70 at
// 240; 0.675 keeps every frame rate and every line on the deck.
const GSAFE = 0.675;
const LAT_MAX = 1.85;           // how far off the centreline a walker's centre gets (rail face − body radius)
const FLARE = 5;                // the foot eases from level to SMAX over this many units
const CREST = 20;               // …and the top rounds over this many
const Y_CANDY = 5.16, Y_CAT = 4.06;   // pier deck heights (re-measured at world:ready)
const RAIL_H = 1.05;
const RAIL_SOLID = 1e4;         // a collider h this big is SOLID with no top (ground.js, Contract A)
const GATE_S = 2.6;            // the gate arches stand this far in from each foot
const POST_STEP = 2.6;
const MOTES = 260;
const RAISE_T = 25, GROW_A = 2.0, GROW_B = 16.0, RAISE_DELAY = 3.5;
// seven bands, outside → inside (and top → bottom on the fascia). r4: full
// ROYGBIV chroma — the deck is drawn in literal sRGB (no tone mapping, its own
// light fog: see RB_F), so these hexes are what reaches the screen
const BANDS = [0xff2a45, 0xff8418, 0xffd21a, 0x28cf55, 0x1c98ff, 0x4b48f0, 0x9a3cf2];
const INK = 0x2a1440;           // the underside lip + belly: a dark edge under the colour
const LIP = 0.34;               // …and how deep that lip is
const CANE_RED = 0xe8324f, CANE_WHITE = 0xfff4ea;

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeIO = (x) => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

export function create(ctx, escape) {
  const { world } = ctx;
  ctx.colliders = ctx.colliders || [];
  ctx.walkables = ctx.walkables || [];
  const params = ctx.params || new URLSearchParams('');
  const MOBILE = !!ctx.state.mobile;

  const group = new THREE.Group();
  group.name = 'rainbowBridge';
  group.visible = false;
  group.userData.noOcclude = true; group.userData.noFade = true;   // the camera's sweep leaves it alone
  ctx.scene.add(group);

  // ═══════════════════════════════════════════════════════════ the path ═══
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const L = curve.getLength();
  const N = Math.max(8, Math.round(L / DS));
  const ds = L / N;
  const sp = curve.getSpacedPoints(N);
  const PX = new Float32Array(N + 1), PZ = new Float32Array(N + 1), PY = new Float32Array(N + 1);
  const TX = new Float32Array(N + 1), TZ = new Float32Array(N + 1), SS = new Float32Array(N + 1), EE = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) { PX[i] = sp[i].x; PZ[i] = sp[i].z; SS[i] = i * ds; }
  for (let i = 0; i <= N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(N, i + 1);
    let tx = PX[b] - PX[a], tz = PZ[b] - PZ[a]; const l = Math.hypot(tx, tz) || 1;
    TX[i] = tx / l; TZ[i] = tz / l;
    EE[i] = clamp(Math.min(SS[i], L - SS[i]) / (L / 2), 0, 1);      // 0 at the feet → 1 at the crest
  }
  // how much steeper the grade reads along the INSIDE rail than on the
  // centreline: R / (R − LAT_MAX) on a bend of radius R (1 on a straight)
  const FIN = new Float32Array(N + 1);
  {
    const hd = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) hd[i] = Math.atan2(TZ[i], TX[i]);
    for (let i = 0; i <= N; i++) {
      const a = Math.max(0, i - 2), b = Math.min(N, i + 2);
      let d = hd[b] - hd[a]; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      const R = ((b - a) * ds) / Math.max(1e-6, Math.abs(d));
      FIN[i] = R / Math.max(0.5, R - LAT_MAX);
    }
  }
  // the profile: integrate the slope curve, then fix the far end exactly
  function buildProfile(y0, y1) {
    PY[0] = y0;
    for (let i = 0; i < N; i++) {
      const s = (i + 0.5) * ds, h = L / 2, d = s < h ? s : L - s;
      // the foot starts as a gentle 0.42 ramp (it has to clear the pier's own
      // rail, 1.15 u over the planks, 3.3 u out) and eases into the full grade,
      // which is capped so the inside rail never reads steeper than GSAFE
      let g = SMAX * (0.5 + 0.5 * ss(0, FLARE, d)) * ss(0, CREST, h - d);
      g = Math.min(g, GSAFE / Math.max(FIN[i], FIN[i + 1]));
      PY[i + 1] = PY[i] + (s < h ? g : -g) * ds;
    }
    const err = PY[N] - y1;
    for (let i = 0; i <= N; i++) PY[i] -= err * (i / N);
  }
  buildProfile(Y_CANDY, Y_CAT);

  let apexI = 0;
  const apex = { x: 0, y: 0, z: 0 };
  const path = [], path3 = [];
  function refreshDerived() {
    apexI = 0; for (let i = 0; i <= N; i++) if (PY[i] > PY[apexI]) apexI = i;
    apex.x = PX[apexI]; apex.y = PY[apexI]; apex.z = PZ[apexI];
    path.length = 0; path3.length = 0;
    const step = Math.round(4 / ds);
    for (let i = 0; i <= N; i += step) { path.push([+PX[i].toFixed(2), +PZ[i].toFixed(2)]); path3.push([+PX[i].toFixed(2), +PY[i].toFixed(2), +PZ[i].toFixed(2)]); }
    if ((N % step) !== 0) { path.push([+PX[N].toFixed(2), +PZ[N].toFixed(2)]); path3.push([+PX[N].toFixed(2), +PY[N].toFixed(2), +PZ[N].toFixed(2)]); }
  }
  refreshDerived();
  const ends = { candy: { x: PX[0], z: PZ[0] }, cat: { x: PX[N], z: PZ[N] } };

  // ── O(1) lookup: a 1-u grid of "nearest sample" over the footprint ─────────
  let gx0 = Infinity, gz0 = Infinity, gx1 = -Infinity, gz1 = -Infinity;
  for (let i = 0; i <= N; i++) { gx0 = Math.min(gx0, PX[i]); gx1 = Math.max(gx1, PX[i]); gz0 = Math.min(gz0, PZ[i]); gz1 = Math.max(gz1, PZ[i]); }
  gx0 = Math.floor(gx0 - HW - 2); gz0 = Math.floor(gz0 - HW - 2); gx1 = Math.ceil(gx1 + HW + 2); gz1 = Math.ceil(gz1 + HW + 2);
  const GW = gx1 - gx0, GH = gz1 - gz0;
  const near = new Int16Array(GW * GH).fill(-1);
  const nearD = new Float32Array(GW * GH).fill(1e9);
  const TER = new Float32Array(GW * GH);          // terrain under each cell (the gate needs it; world.height is fbm)
  for (let i = 0; i <= N; i++) {
    const cx = Math.floor(PX[i] - gx0), cz = Math.floor(PZ[i] - gz0);
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= GW || z >= GH) continue;
      const k = z * GW + x, d = Math.hypot(gx0 + x + 0.5 - PX[i], gz0 + z + 0.5 - PZ[i]);
      if (d < nearD[k] && d < HW + 1.6) { nearD[k] = d; near[k] = i; }
    }
  }
  for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) TER[z * GW + x] = world.height(gx0 + x + 0.5, gz0 + z + 0.5);

  const PR = { s: 0, lat: 0, y: 0, i: 0, ok: false, found: false };
  /** Exact projection of (x,z) on the centreline near its grid cell → PR (shared scratch).
   *  `found`: (x,z) is within HW + 1.6 of the centreline (s, lat, y valid);
   *  `ok`: it is ON the deck. */
  function project(x, z) {
    PR.ok = false; PR.found = false;
    const cx = Math.floor(x - gx0), cz = Math.floor(z - gz0);
    if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return PR;
    const i0 = near[cz * GW + cx]; if (i0 < 0) return PR;
    PR.found = true;
    let best = 1e9;
    for (let i = Math.max(0, i0 - 3); i < Math.min(N, i0 + 3); i++) {
      const ax = PX[i], az = PZ[i], vx = PX[i + 1] - ax, vz = PZ[i + 1] - az;
      const LL = vx * vx + vz * vz; let t = LL > 0 ? ((x - ax) * vx + (z - az) * vz) / LL : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const qx = ax + vx * t - x, qz = az + vz * t - z, d = qx * qx + qz * qz;
      if (d < best) {
        best = d; PR.i = i; PR.s = (i + t) * ds; PR.y = PY[i] + (PY[i + 1] - PY[i]) * t;
        // signed lateral (+ = the U's inside)
        PR.lat = (x - ax - vx * t) * (-TZ[i]) + (z - az - vz * t) * TX[i];
      }
    }
    // past the very ends the deck stops square
    if (PR.s <= 1e-4 || PR.s >= L - 1e-4) {
      const e = PR.s <= 1e-4 ? 0 : N, sx = x - PX[e], sz = z - PZ[e];
      const along = sx * TX[e] + sz * TZ[e];
      if ((e === 0 && along < -0.01) || (e === N && along > 0.01)) return PR;
    }
    PR.ok = Math.abs(PR.lat) <= HW;
    return PR;
  }
  function terrainAt(x, z) {
    const cx = Math.floor(x - gx0), cz = Math.floor(z - gz0);
    if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return world.height(x, z);
    return TER[cz * GW + cx];
  }

  // ═══════════════════════════════════════════════════════ materials ═════
  const U = {                          // shared uniform objects (every material reads the same ones)
    grow: { value: 0 }, time: { value: 0 }, night: { value: 0 }, flash: { value: 0 },
    red: { value: 0 }, far: { value: 1 }, len: { value: L }, alarm: { value: 0 },
  };
  const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  const RB_V = /* glsl */`
    attribute vec3 aCol; attribute vec2 aSV; attribute float aE; attribute float aBand;
    varying vec3 vCol; varying vec2 vSV; varying float vE; varying float vBand;
    #include <fog_pars_vertex>
    void main() {
      vCol = aCol; vSV = aSV; vE = aE; vBand = aBand;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const RB_F = /* glsl */`
    uniform float uGrow; uniform float uTime; uniform float uNight; uniform float uOpacity;
    uniform float uLen; uniform float uRed; uniform float uFar; uniform float uFlash; uniform float uBelly; uniform float uAlarm;
    varying vec3 vCol; varying vec2 vSV; varying float vE; varying float vBand;
    #include <fog_pars_fragment>
    void main() {
      if (vE > uGrow + 0.0005) discard;
      vec3 c = vCol;
      float v = vSV.y;
      float edge = min(v, 1.0 - v);
      c *= 0.8 + 0.2 * smoothstep(0.0, 0.34, edge);                       // a seam between bands
      c += vec3(0.12) * pow(1.0 - abs(v * 2.0 - 1.0), 6.0) * (1.0 - uBelly); // candy gloss down each band
      float sh = smoothstep(0.84, 1.0, sin(vSV.x * 0.42 - uTime * 2.4 + vBand * 0.9));
      c += vec3(0.30, 0.27, 0.22) * sh * (0.25 + 0.6 * uNight);           // a shimmer running along
      c *= mix(1.0, 0.9, uNight);                                          // it glows: the world darkens round it
      float far = uFar > 0.5 ? (uLen - vSV.x) : vSV.x;
      float red = uRed * (1.0 - smoothstep(4.0, 38.0, far));               // the raids' door
      c = mix(c, vec3(1.0, 0.06, 0.05) * (0.75 + 0.3 * uNight), red * 0.78);
      // the ending's flare: the whole rainbow pulses red while it burns
      c = mix(c, vec3(1.0, 0.1, 0.08) * (0.8 + 0.3 * uNight), uAlarm * (0.3 + 0.14 * sin(uTime * 3.1)));
      float tip = smoothstep(uGrow - 0.035, uGrow, vE) * (1.0 - step(0.9995, uGrow));
      c += vec3(1.3, 1.2, 1.1) * tip + vec3(uFlash);
      gl_FragColor = vec4(min(c, vec3(1.0)), uOpacity);
      // r4: literal sRGB like the sky dome (no ACES: it bleached the bands to
      // pastel) and a LIGHT fog of its own — the stock chunk (sky.js patches in
      // aerial perspective) strips chroma well before the colour lerp, and a
      // glowing rainbow should cut through the haze, not sink into it
      #include <colorspace_fragment>
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float rbFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        #else
          float rbFog = smoothstep(fogNear, fogFar * 1.35, vFogDepth);
        #endif
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, rbFog * 0.55);
      #endif
    }`;
  function rbMat(opacity, opts = {}) {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        ...fogU(),
        uGrow: U.grow, uTime: U.time, uNight: U.night, uFlash: U.flash, uRed: U.red, uFar: U.far, uLen: U.len, uAlarm: U.alarm,
        uOpacity: { value: opacity }, uBelly: { value: opts.belly ? 1 : 0 },
      },
      vertexShader: RB_V, fragmentShader: RB_F,
      transparent: opts.transparent ?? false, depthWrite: opts.depthWrite ?? true, side: opts.side ?? THREE.FrontSide, fog: true,
    });
    return m;
  }
  // r4: SOLID (r3's 0.9 / 0.62 glass let the far leg, its rails and lamps show
  // through the near deck — a double exposure from above)
  const deckMat = rbMat(1, { side: THREE.DoubleSide });
  const fasciaMat = rbMat(1, { side: THREE.DoubleSide });

  // ── FX: ONE additive mesh for everything that glows and is not a surface ──
  // (r2 merge: was three draw calls). aKind picks the recipe per vertex:
  //   0/1 gate lanterns (candy / cat)      billboards, go red at the raids' end
  //   2/3 eyes in the dark (candy / cat)    billboards, blink, come and go
  //   4   sparkle motes                     billboards that rise off the arch
  //   5   halo ribbons                      world-space strips round the body
  // Billboards carry their CENTRE in `position` and a corner in aQ (the group
  // sits at the origin, so the model-view matrix is the view matrix).
  const FX_V = /* glsl */`
    attribute vec2 aQ; attribute float aSize; attribute vec3 aCol; attribute float aKind; attribute float aPh; attribute float aF; attribute float aE;
    uniform float uTime; uniform float uNight; uniform float uGrow; uniform vec2 uRedEnd; uniform vec2 uEyes;
    varying vec2 vQ; varying vec3 vCol; varying float vA; varying float vKind; varying float vF; varying float vE;
    #include <fog_pars_vertex>
    void main() {
      vQ = aQ; vKind = aKind; vF = aF; vE = aE; vCol = aCol;
      vec3 p = position;
      float a = 1.0;
      vec4 mvPosition;
      if (aKind > 4.5) {                       // halo ribbon
        mvPosition = modelViewMatrix * vec4(p, 1.0);
      } else {
        float sz = aSize;
        if (aKind > 3.5) {                     // mote: drifts, rises, twinkles
          float t = uTime * 0.35 + aPh * 6.2831;
          p.x += sin(t * 1.3 + aPh * 9.0) * 0.55; p.z += cos(t * 1.1 + aPh * 7.0) * 0.55;
          float rise = fract(uTime * 0.07 + aPh);
          p.y += rise * 3.4;
          float tw = 0.55 + 0.45 * sin(uTime * 3.1 + aPh * 40.0);
          a = step(aE, uGrow) * sin(rise * 3.14159) * tw * (0.45 + 0.75 * uNight);
          sz = 0.17 + 0.1 * tw;
        } else if (aKind < 1.5) {              // lantern
          float r = aKind < 0.5 ? uRedEnd.x : uRedEnd.y;
          vCol = mix(vec3(1.0, 0.78, 0.46), vec3(1.0, 0.1, 0.07), r);
          a = (0.28 + 0.95 * uNight) * (1.0 + r * 0.35 * sin(uTime * 2.1)) * step(0.001, uGrow);
        } else {                               // eyes
          float e = aKind < 2.5 ? uEyes.x : uEyes.y;
          float come = smoothstep(0.35, 0.75, 0.5 + 0.5 * sin(uTime * 0.13 + aPh * 6.2831));
          float blink = step(0.07, fract(uTime * 0.21 + aPh * 3.7));
          a = e * come * blink;
        }
        mvPosition = modelViewMatrix * vec4(p, 1.0);
        mvPosition.xy += aQ * sz;
      }
      vA = a;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const FX_F = /* glsl */`
    uniform float uGrow; uniform float uNight; uniform float uFlash;
    varying vec2 vQ; varying vec3 vCol; varying float vA; varying float vKind; varying float vF; varying float vE;
    #include <fog_pars_fragment>
    void main() {
      vec3 c;
      float fogK = 1.0;
      if (vKind > 4.5) {
        if (vE > uGrow + 0.0005) discard;
        c = vCol * (vF * vF * (0.03 + 0.3 * uNight + uFlash * 2.0));   // (r4: a whisper by day: it hazed the edges)
      } else {
        float d = dot(vQ, vQ);
        if (d > 1.0 || vA <= 0.001) discard;
        float k;
        if (vKind > 3.5) k = exp(-d * 6.0) + (exp(-abs(vQ.x) * 16.0) + exp(-abs(vQ.y) * 16.0)) * 0.35 * (1.0 - d);
        else if (vKind < 1.5) { k = exp(-d * 3.2) * 0.9 + exp(-d * 28.0) * 0.8; fogK = 0.85; }
        else { k = smoothstep(1.0, 0.25, d) + exp(-d * 9.0); fogK = 0.85; }
        c = vCol * k * vA;
      }
      #ifdef USE_FOG
        c *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth) * fogK;
      #endif
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`;
  const glowU = { uRedEnd: { value: new THREE.Vector2(0, 0) }, uEyes: { value: new THREE.Vector2(0, 0) } };
  const fxMat = new THREE.ShaderMaterial({
    uniforms: { ...fogU(), uGrow: U.grow, uTime: U.time, uNight: U.night, uFlash: U.flash, ...glowU },
    vertexShader: FX_V, fragmentShader: FX_F,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
  });

  // candy canes: lit standard material, vertex-coloured stripes, revealed by aE
  const growPatch = (m, key) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uGrow = U.grow;
      sh.vertexShader = 'attribute float aE;\nvarying float vRbE;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRbE = aE;');
      sh.fragmentShader = 'uniform float uGrow;\nvarying float vRbE;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', 'if (vRbE > uGrow + 0.0005) discard;\n#include <clipping_planes_fragment>');
    };
    m.customProgramCacheKey = () => 'rbw-' + key;
    return m;
  };
  const caneMat = growPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, emissive: 0xffe0ea, emissiveIntensity: 0.0 }), 'cane');

  // ═══════════════════════════════════════════════════════ geometry ══════
  const C = new THREE.Color();
  const bandLin = BANDS.map((h) => new THREE.Color(h));        // linear (ColorManagement)
  const fasciaDepth = new Float32Array(N + 1);
  const lipDepth = new Float32Array(N + 1);        // the ink lip under the bands (none over the pier heads)
  let meshes = null;
  const railCols = [];
  let upFlag = false;             // mirrors api.up (build() runs before api exists)
  // the visitor's arc length while his feet are up on the deck (else far away):
  // a rail segment is solid only within RAIL_REACH of it (see build())
  const RAIL = { s: -1e9 };
  const RAIL_REACH = 12;
  function railSolid() { return upFlag && Math.abs(this.s - RAIL.s) < RAIL_REACH; }

  function depthAt(i) {
    const s = SS[i], d = Math.min(s, L - s);
    const yEnd = s < L / 2 ? PY[0] : PY[N];
    const norm = Math.min(1.8 + 2.7 * Math.pow(Math.max(0, Math.sin(Math.PI * clamp(s / L, 0, 1))), 0.8), 0.35 + (PY[i] - yEnd) * 0.55);
    // over the pier head the side skirt reaches the planks, so the ramp never floats
    const toPier = PY[i] - yEnd + 0.08;
    return lerp(Math.max(toPier, 0.1), norm, ss(2.5, 6.5, d));
  }

  function buildDeck() {
    const pos = [], col = [], sv = [], ee = [], band = [], idx = [];
    const bw = (2 * HW) / 7;
    for (let b = 0; b < 7; b++) {
      const base = pos.length / 3;
      const c = bandLin[b];
      for (let i = 0; i <= N; i++) {
        for (let k = 0; k < 2; k++) {
          const l = -HW + (b + k) * bw;
          const nx = -TZ[i], nz = TX[i];
          pos.push(PX[i] + nx * l, PY[i] + 0.03, PZ[i] + nz * l);
          col.push(c.r, c.g, c.b); sv.push(SS[i], k); ee.push(EE[i]); band.push(b);
        }
      }
      for (let i = 0; i < N; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    return geo(pos, col, sv, ee, band, idx);
  }
  function buildFascia() {
    const pos = [], col = [], sv = [], ee = [], band = [], idx = [];
    for (let i = 0; i <= N; i++) { fasciaDepth[i] = depthAt(i); lipDepth[i] = LIP * ss(3, 7, Math.min(SS[i], L - SS[i])); }
    // r4: the sides read as SIDES (a shade under the deck top), each band a
    // touch darker than the one above, and a dark INK LIP under the violet —
    // the crisp underside edge that sets the arch off against sea and sky
    const ink = new THREE.Color(INK);
    for (const side of [-1, 1]) {
      const l = side * (HW + 0.015);
      for (let b = 0; b < 8; b++) {
        const base = pos.length / 3;
        const lip = b === 7;
        for (let i = 0; i <= N; i++) {
          const D = fasciaDepth[i], nx = -TZ[i], nz = TX[i];
          for (let k = 0; k < 2; k++) {
            const y = lip ? PY[i] + 0.03 - D - lipDepth[i] * k : PY[i] + 0.03 - D * (b + k) / 7;
            pos.push(PX[i] + nx * l, y, PZ[i] + nz * l);
            if (lip) C.copy(ink);
            else C.copy(bandLin[b]).multiplyScalar(0.9 - 0.2 * ((b + k) / 7));
            col.push(C.r, C.g, C.b); sv.push(SS[i], lip ? 0.5 : k); ee.push(EE[i]); band.push(lip ? 6 : b);
          }
        }
        for (let i = 0; i < N; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
    }
    // the belly: the seven bands again, in shade (from the north the legs fall
    // away steeper than the lens looks down, so their undersides are what you
    // see of them: a rainbow from below, not a grey road), closing the skirts
    // under the ink lips
    const bw = (2 * HW) / 7;
    for (let b = 0; b < 7; b++) {
      const base = pos.length / 3;
      C.copy(bandLin[b]).multiplyScalar(0.5);
      for (let i = 0; i <= N; i++) {
        const D = fasciaDepth[i] + lipDepth[i], nx = -TZ[i], nz = TX[i];
        for (let k = 0; k < 2; k++) {
          const l = -(HW + 0.015) + (b + k) * (bw + 0.03 / 7);
          pos.push(PX[i] + nx * l, PY[i] + 0.03 - D, PZ[i] + nz * l);
          col.push(C.r, C.g, C.b); sv.push(SS[i], k); ee.push(EE[i]); band.push(b);
        }
      }
      for (let i = 0; i < N; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    return geo(pos, col, sv, ee, band, idx);
  }
  function geo(pos, col, sv, ee, band, idx) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSV', new THREE.Float32BufferAttribute(sv, 2));
    g.setAttribute('aE', new THREE.Float32BufferAttribute(ee, 1));
    g.setAttribute('aBand', new THREE.Float32BufferAttribute(band, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  // the FX geometry builder: one attribute set for strips and billboards
  function fxBuilder() {
    const B = { pos: [], q: [], size: [], col: [], kind: [], ph: [], f: [], e: [], idx: [] };
    B.quad = (x, y, z, size, c, kind, ph, e = 0) => {
      const base = B.pos.length / 3;
      for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        B.pos.push(x, y, z); B.q.push(qx, qy); B.size.push(size); B.col.push(c.r, c.g, c.b); B.kind.push(kind); B.ph.push(ph); B.f.push(0); B.e.push(e);
      }
      B.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    };
    B.strip = (fnA, fnB, cA, cB, fA, fB) => {
      const base = B.pos.length / 3;
      for (let i = 0; i <= N; i += 2) {
        const a = fnA(i), b = fnB(i);
        B.pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        B.col.push(cA.r, cA.g, cA.b, cB.r, cB.g, cB.b); B.f.push(fA, fB); B.e.push(EE[i], EE[i]);
        B.q.push(0, 0, 0, 0); B.size.push(0, 0); B.kind.push(5, 5); B.ph.push(0, 0);
      }
      const n = Math.floor(N / 2);
      for (let k = 0; k < n; k++) { const a = base + k * 2; B.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    };
    B.geometry = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('aQ', new THREE.Float32BufferAttribute(B.q, 2));
      g.setAttribute('aSize', new THREE.Float32BufferAttribute(B.size, 1));
      g.setAttribute('aCol', new THREE.Float32BufferAttribute(B.col, 3));
      g.setAttribute('aKind', new THREE.Float32BufferAttribute(B.kind, 1));
      g.setAttribute('aPh', new THREE.Float32BufferAttribute(B.ph, 1));
      g.setAttribute('aF', new THREE.Float32BufferAttribute(B.f, 1));
      g.setAttribute('aE', new THREE.Float32BufferAttribute(B.e, 1));
      g.setIndex(B.idx); g.computeBoundingSphere(); g.boundingSphere.radius += 4;   // (motes rise, billboards spread)
      return g;
    };
    return B;
  }
  function buildAura(B) {
    const top = bandLin[0], bot = bandLin[6];
    for (const side of [-1, 1]) {
      const l = side * (HW + 0.05);
      const P = (i, dy, ll = l) => [PX[i] - TZ[i] * ll, PY[i] + dy, PZ[i] + TX[i] * ll];
      B.strip((i) => P(i, 0.05), (i) => P(i, 2.6), top, top, 1, 0);                        // above the rail line
      // (r4: below the belly a short, faint skirt — r3's 3.2-u sheet read as a
      //  translucent curtain hanging under the deck at night)
      B.strip((i) => P(i, -fasciaDepth[i] - lipDepth[i]), (i) => P(i, -fasciaDepth[i] - lipDepth[i] - 1.5), bot, bot, 0.62, 0);   // below the belly
      const out = side * (HW + 3.0);
      B.strip((i) => P(i, 0.02), (i) => P(i, 0.02, out), side < 0 ? top : bot, side < 0 ? top : bot, 0.8, 0);   // around the edges
    }
  }

  // a candy-cane tube swept along pts (Vector3[]), per-face diagonal stripes
  const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _prevN = new THREE.Vector3();
  function caneTube(pts, radius, seg, pitch, eOf, opts = {}) {
    const rings = [];
    let arc = 0;
    _prevN.set(0, 0, 0);
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      _t.subVectors(b, a).normalize();
      if (k === 0) { _n.set(0, 1, 0); if (Math.abs(_t.y) > 0.9) _n.set(1, 0, 0); }
      else _n.copy(_prevN);
      _n.addScaledVector(_t, -_n.dot(_t)).normalize();
      _prevN.copy(_n);
      _b.crossVectors(_t, _n).normalize();
      if (k > 0) arc += pts[k].distanceTo(pts[k - 1]);
      const ring = [];
      for (let j = 0; j <= seg; j++) {
        const ang = (j / seg) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
        ring.push([pts[k].x + (_n.x * c + _b.x * s) * radius, pts[k].y + (_n.y * c + _b.y * s) * radius, pts[k].z + (_n.z * c + _b.z * s) * radius,
          _n.x * c + _b.x * s, _n.y * c + _b.y * s, _n.z * c + _b.z * s]);
      }
      rings.push({ ring, arc, e: eOf(k) });
    }
    const pos = [], nor = [], col = [], ee = [];
    const red = new THREE.Color(opts.red ?? CANE_RED), white = new THREE.Color(opts.white ?? CANE_WHITE);
    for (let k = 0; k < rings.length - 1; k++) {
      const A = rings[k], B = rings[k + 1];
      for (let j = 0; j < seg; j++) {
        const ph = (j + 0.5) / seg + ((A.arc + B.arc) * 0.5) / pitch;
        const cc = (Math.floor(ph * 2) % 2 === 0) ? red : white;
        const quad = [A.ring[j], B.ring[j], A.ring[j + 1], B.ring[j], B.ring[j + 1], A.ring[j + 1]];
        const es = [A.e, B.e, A.e, B.e, B.e, A.e];
        for (let q = 0; q < 6; q++) { const v = quad[q]; pos.push(v[0], v[1], v[2]); nor.push(v[3], v[4], v[5]); col.push(cc.r, cc.g, cc.b); ee.push(es[q]); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aE', new THREE.Float32BufferAttribute(ee, 1));
    return g;
  }
  /** Tag a plain primitive with a vertex colour + aE so it merges with the canes. */
  function solid(g, hex, e = 0) {
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    const c = new THREE.Color(hex), col = new Float32Array(n * 3), ea = new Float32Array(n).fill(e);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aE', new THREE.BufferAttribute(ea, 1));
    return g;
  }

  const gates = [];              // { x, z, y, yaw, lamp:{x,y,z} } candy then cat
  /** Deck frame at arc length s → {x,y,z,tx,tz,nx,nz} (pass `out` to stay allocation-free). */
  function frameAt(s, out = {}) {
    const f = clamp(s / ds, 0, N), i = Math.min(N - 1, Math.floor(f)), t = f - i;
    out.x = PX[i] + (PX[i + 1] - PX[i]) * t; out.y = PY[i] + (PY[i + 1] - PY[i]) * t; out.z = PZ[i] + (PZ[i + 1] - PZ[i]) * t;
    out.tx = TX[i]; out.tz = TZ[i]; out.nx = -TZ[i]; out.nz = TX[i];
    return out;
  }
  function buildCanes() {
    const parts = [];
    // handrails, both sides, from gate to gate
    const i0 = Math.ceil((GATE_S + 0.35) / ds), i1 = Math.floor((L - GATE_S - 0.35) / ds);
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = i0; i <= i1; i++) pts.push(new THREE.Vector3(PX[i] - TZ[i] * side * (HW - 0.18), PY[i] + RAIL_H, PZ[i] + TX[i] * side * (HW - 0.18)));
      parts.push(caneTube(pts, 0.12, 6, 1.6, (k) => EE[i0 + k]));
    }
    // the two gate arches: a pair of canes crooked toward each other (a heart)
    gates.length = 0;
    for (const end of [0, 1]) {
      const s = end ? L - GATE_S : GATE_S;
      const f = frameAt(s);
      const yBase = f.y - 0.05, H = 5.4, R = 1.05;
      for (const side of [-1, 1]) {
        const lx = f.nx * side, lz = f.nz * side;             // outward lateral
        const px = f.x + lx * (HW + 0.22), pz = f.z + lz * (HW + 0.22);
        const pts = [];
        for (let k = 0; k <= 10; k++) pts.push(new THREE.Vector3(px, yBase + (H * k) / 10, pz));
        // crook: a semicircle inward over the deck, then a short drop
        const cx = px - lx * R, cz = pz - lz * R, cy = yBase + H;
        for (let k = 1; k <= 12; k++) {
          const a = (k / 12) * Math.PI;
          pts.push(new THREE.Vector3(cx + lx * R * Math.cos(a), cy + R * Math.sin(a), cz + lz * R * Math.cos(a)));
        }
        pts.push(new THREE.Vector3(cx - lx * R, cy - 0.55, cz - lz * R));
        parts.push(caneTube(pts, 0.3, 10, 1.25, () => 0));
        // a gumdrop foot so it sits ON the deck, not in it
        const foot = new THREE.SphereGeometry(0.48, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        foot.scale(1, 0.55, 1); foot.translate(px, yBase, pz);
        parts.push(solid(foot, 0xff6f9c));
        // (solid only once the bridge stands: before that there is nothing here)
        const gc = { x: px, z: pz, r: 0.42, bridge: true };
        Object.defineProperty(gc, 'solid', { get: () => upFlag, enumerable: true, configurable: true });
        ctx.colliders.push(gc);
      }
      // the lantern: a gumdrop in the gap between the crooks
      const lamp = { x: f.x, y: f.y + 5.4 + 0.2, z: f.z };
      const gd = new THREE.SphereGeometry(0.46, 12, 8); gd.scale(1, 1.15, 1); gd.translate(lamp.x, lamp.y, lamp.z);
      parts.push(solid(gd, 0xfff1c9));
      const cap = new THREE.ConeGeometry(0.34, 0.32, 10); cap.translate(lamp.x, lamp.y + 0.62, lamp.z);
      parts.push(solid(cap, 0xff5c93));
      gates.push({ x: f.x, z: f.z, y: f.y, tx: f.tx, tz: f.tz, nx: f.nx, nz: f.nz, lamp });
    }
    buildPosts(parts);
    const g = mergeGeometries(parts, false);
    g.computeBoundingSphere();
    return g;
  }
  /** The rail posts, baked into the cane geometry (r2: was an InstancedMesh). */
  function buildPosts(parts) {
    const g = caneTube([new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, RAIL_H * 0.5, 0), new THREE.Vector3(0, RAIL_H - 0.02, 0)], 0.1, 6, 0.8, () => 0);
    const knob = solid(new THREE.SphereGeometry(0.16, 8, 5).translate(0, RAIL_H + 0.02, 0), 0xfff4ea);
    const post = mergeGeometries([g, knob], false);
    const f = {};
    for (let s = GATE_S + 1.6; s <= L - GATE_S - 1.6; s += POST_STEP) {
      frameAt(s, f);
      const e = clamp(Math.min(s, L - s) / (L / 2), 0, 1);
      for (const side of [-1, 1]) {
        const p = post.clone();
        p.translate(f.x + f.nx * side * (HW - 0.18), f.y, f.z + f.nz * side * (HW - 0.18));
        p.attributes.aE.array.fill(e);
        parts.push(p);
      }
    }
  }

  // ── gate plaques: one 512×512 canvas, four boards ──────────────────────────
  function signTexture() {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
    const g = cv.getContext('2d');
    const rows = [
      ['RAINBOW BRIDGE', 'to Cat Island · you will be welcomed'],
      ['THE CANDY KINGDOM', 'be home before dark'],
      ['RAINBOW BRIDGE', 'to the Candy Kingdom · mind the kids'],
      ['CAT ISLAND', 'welcome home (you live here now)'],
    ];
    rows.forEach(([title, sub], r) => {
      const y0 = r * 128;
      g.fillStyle = '#2b2442'; roundRect(g, 4, y0 + 6, 504, 116, 26); g.fill();
      const gr = g.createLinearGradient(0, y0 + 12, 0, y0 + 116);
      gr.addColorStop(0, '#fffaf1'); gr.addColorStop(1, '#ffe4ec');
      g.fillStyle = gr; roundRect(g, 12, y0 + 13, 488, 102, 20); g.fill();
      // a rainbow ribbon along the top edge
      for (let b = 0; b < 7; b++) { g.fillStyle = '#' + BANDS[b].toString(16).padStart(6, '0'); g.fillRect(40 + b * 62, y0 + 18, 62, 9); }
      g.fillStyle = '#2b2442'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let px = 50;
      g.font = `900 ${px}px "Baloo 2", "Trebuchet MS", sans-serif`;
      while (px > 30 && g.measureText(title).width > 452) { px -= 2; g.font = `900 ${px}px "Baloo 2", "Trebuchet MS", sans-serif`; }
      g.fillText(title, 256, y0 + 64);
      g.font = 'italic 700 21px "Nunito", "Trebuchet MS", sans-serif';
      g.fillStyle = '#6d5f86';
      g.fillText(sub, 256, y0 + 98);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  const signTex = signTexture();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.7, metalness: 0, side: THREE.FrontSide });
  function buildSigns() {
    const pos = [], uv = [], nor = [], idx = [];
    const W = 4.2, H = 1.05;
    gates.forEach((gt, gi) => {
      const cy = gt.y + 4.45;
      for (const face of [0, 1]) {
        // face 0 looks back down the pier (−tangent at the candy gate, +tangent at the cat gate)
        const dirSign = (gi === 0 ? -1 : 1) * (face === 0 ? 1 : -1);
        const fx = gt.tx * dirSign, fz = gt.tz * dirSign;          // outward normal of this face
        const rx = -fz, rz = fx;                                   // its right
        const ox = gt.x + fx * 0.07, oz = gt.z + fz * 0.07;
        const row = gi * 2 + face;                                 // 0..3
        const v0 = 1 - (row * 128 + 8) / 512, v1 = 1 - (row * 128 + 120) / 512;
        const base = pos.length / 3;
        for (const [a, b, u, v] of [[-1, 1, 0, v0], [1, 1, 1, v0], [-1, -1, 0, v1], [1, -1, 1, v1]]) {
          pos.push(ox + rx * a * W / 2, cy + b * H / 2, oz + rz * a * W / 2); uv.push(u, v); nor.push(fx, 0, fz);
        }
        idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    return g;
  }

  // ── glows: gate lanterns + eyes in the dark (FX billboards) ───────────────
  function buildGlows(B) {
    const R = rng(hash('bridge:eyes'));
    const white = new THREE.Color(1, 1, 1);
    const eyeCols = [new THREE.Color(0xd8ff5a), new THREE.Color(0xffc23a), new THREE.Color(0xff4a3a)];
    gates.forEach((gt, gi) => {
      B.quad(gt.lamp.x, gt.lamp.y, gt.lamp.z, 2.4, white, gi, 0);
      // eyes: pairs in the dark just beyond the gate (on the pier side and on the ramp)
      for (let p = 0; p < 6; p++) {
        const back = (gi === 0 ? -1 : 1) * (1.5 + R() * 7.5);            // toward the pier
        const lat = (R() * 2 - 1) * (HW + 1.6);
        const y = gt.y + 0.55 + R() * 0.9;
        const x = gt.x + gt.tx * back + gt.nx * lat, z = gt.z + gt.tz * back + gt.nz * lat;
        const col = eyeCols[p % 3]; const ph = R();
        const sep = 0.2 + R() * 0.08;
        // the pair faces the bridge: split along the lateral axis
        B.quad(x - gt.nx * sep, y, z - gt.nz * sep, 0.15, col, 2 + gi, ph);
        B.quad(x + gt.nx * sep, y, z + gt.nz * sep, 0.15, col, 2 + gi, ph);
      }
    });
  }

  // ── motes (FX billboards: kind 4) ──────────────────────────────────────────
  function buildMotes(B) {
    const R = rng(hash('bridge:motes'));
    const n = MOBILE ? Math.round(MOTES * 0.45) : MOTES;
    const c = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const s = 3 + R() * (L - 6), f = frameAt(s);
      const lat = (R() * 2 - 1) * (HW + 1.8);
      const x = f.x + f.nx * lat, y = f.y - 1.2 - R() * 2.6, z = f.z + f.nz * lat;
      const ph = R(), e = clamp(Math.min(s, L - s) / (L / 2), 0, 1);
      if (R() < 0.45) c.setRGB(1, 0.97, 0.9); else c.copy(bandLin[Math.floor(R() * 7)]);
      B.quad(x, y, z, 0.2, c, 4, ph, e);
    }
  }

  function build() {
    if (meshes) {
      for (const m of Object.values(meshes)) { group.remove(m); m.geometry.dispose(); }
      // drop the gate colliders we pushed last time (in place: others hold this array)
      for (let k = ctx.colliders.length - 1; k >= 0; k--) if (ctx.colliders[k]?.bridge) ctx.colliders.splice(k, 1);
    }
    const fascia = new THREE.Mesh(buildFascia(), fasciaMat);          // fills fasciaDepth first
    const deck = new THREE.Mesh(buildDeck(), deckMat);
    const canes = new THREE.Mesh(buildCanes(), caneMat);              // fills gates[] (+ the rail posts)
    const signs = new THREE.Mesh(buildSigns(), signMat);
    const FB = fxBuilder();
    buildAura(FB); buildGlows(FB); buildMotes(FB);
    const fx = new THREE.Mesh(FB.geometry(), fxMat);
    deck.name = 'rainbow_deck'; fascia.name = 'rainbow_fascia'; fx.name = 'fx_rainbow';
    canes.name = 'rainbow_canes'; signs.name = 'rainbow_signs';
    deck.renderOrder = 3; fascia.renderOrder = 4; fx.renderOrder = 5;
    canes.castShadow = true; canes.receiveShadow = true;
    signs.receiveShadow = true;
    for (const m of [deck, fascia, fx]) { m.raycast = () => {}; }
    meshes = { deck, fascia, canes, signs, fx };
    // the handrails are SOLID for the visitor on the deck: thin boxes with NO
    // TOP (h = RAIL_SOLID, Contract A's third class — the same as Contract O's
    // pier rails). r2 gave them an absolute top at rail height so a jump could
    // clear them, and the ground core then stood a jumper ON a box whose
    // footprint reaches past the deck edge: he hovered 40–55 u over the strait
    // (or fell into it). Topless, a jump can neither clear a rail nor perch on
    // one: whatever he does up there, he stays on the deck. They have no
    // BOTTOM either — a box is a wall from the sea floor up — so each segment
    // is solid only while the visitor is UP ON THE DECK within RAIL_REACH of it
    // (`solid` is read live on every query). Everyone underneath — the visitor
    // on the beach under a ramp, a wader, a cat on the sand — walks straight
    // through the rail line; the raiders follow the deck path and never need a
    // wall. (1.2-u boxes: the camera's collider pass never reads one as a wall
    // to dolly in front of, and h ≥ 1e4 reads to it as sea floor + 8, below
    // the deck everywhere over the strait: see report()'s railCam.)
    railCols.length = 0;
    const seg = 1.0;
    for (let s0 = GATE_S + 0.4; s0 < L - GATE_S - 0.4 - 1e-3; s0 += seg) {
      const s1 = Math.min(s0 + seg, L - GATE_S - 0.4), sm = (s0 + s1) * 0.5;
      const f = frameAt(sm, {});
      const deckY = Math.max(frameAt(s0, {}).y, frameAt(s1, {}).y);
      for (const side of [-1, 1]) {
        const c = { x: f.x + f.nx * side * (HW - 0.18), z: f.z + f.nz * side * (HW - 0.18), w: (s1 - s0) + 0.2, d: 0.26, rot: Math.atan2(f.tz, f.tx), h: RAIL_SOLID, box: true, bridge: true, bridgeRail: true, s: sm, deckY, railTop: deckY + RAIL_H };
        Object.defineProperty(c, 'solid', { get: railSolid, enumerable: true, configurable: true });
        ctx.colliders.push(c); railCols.push(c);
      }
    }
    for (const m of Object.values(meshes)) { m.userData.noOcclude = true; m.userData.noFade = true; group.add(m); }
  }
  build();

  // ═══════════════════════════════════════════════════════ walkable ══════
  const player = () => ctx.systems.player;
  function heightAt(x, z) {
    if (x < gx0 || x > gx1 || z < gz0 || z > gz1) return null;
    const r = project(x, z);
    return r.ok ? r.y : null;
  }
  ctx.walkables.push({
    id: 'rainbowBridge',
    test(x, z) {
      if (!api.up) return null;
      if (x < gx0 || x > gx1 || z < gz0 || z > gz1) return null;
      const r = project(x, z);
      if (!r.ok) return null;
      const y = r.y;
      const pl = player(), P = pl?.position;
      if (P) {
        const dx = x - P.x, dz = z - P.z;
        if (dx * dx + dz * dz < 12.25) {
          // this is the visitor's own query: the deck is his floor only while
          // his feet are at (or above) it — never from a boat, a wing or a beach
          return (P.y > y - 2.4) ? y : null;
        }
      }
      const g = terrainAt(x, z);
      if (g < -0.35) return y;                  // over water: nobody walks underneath
      return (y - g < 1.3) ? y : null;          // over sand / planks: only the ramp foot
    },
  });

  // ═══════════════════════════════════════════════════════ overlay (DOM) ══
  let overlay = null;
  const OV = { bars: 0, card: 0, skip: 0, last: '' };
  function ensureOverlay() {
    if (overlay || !ctx.uiRoot) return overlay;
    if (!document.getElementById('cci-rbw-style')) {
      const st = document.createElement('style'); st.id = 'cci-rbw-style';
      st.textContent = OVERLAY_CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'cci cci-rbw';
    el.innerHTML = `
      <div class="cci-rbw-grade"></div>
      <div class="cci-rbw-bar t"></div><div class="cci-rbw-bar b"></div>
      <div class="cci-rbw-card">
        <div class="cci-rbw-rib">NOW OPEN</div>
        <div class="cci-rbw-word">${[...'THE RAINBOW BRIDGE'].map((ch, i) => ch === ' ' ? '<i class="sp"></i>' : `<span style="--c:${'#' + BANDS[i % 7].toString(16).padStart(6, '0')}">${ch}</span>`).join('')}</div>
        <div class="cci-rbw-sub">the Candy Kingdom ⇄ Cat Island · for better or worse</div>
      </div>
      <div class="cci-rbw-skip">any key · skip</div>`;
    ctx.uiRoot.appendChild(el);
    overlay = { el, bars: el.querySelectorAll('.cci-rbw-bar'), card: el.querySelector('.cci-rbw-card'), skip: el.querySelector('.cci-rbw-skip'), grade: el.querySelector('.cci-rbw-grade') };
    return overlay;
  }
  function setOverlay(bars, card, skip, grade = 0) {
    const o = ensureOverlay(); if (!o) return;
    // (the on/off states are part of the key: a fade that crosses 0.001 inside
    //  one rounding step must never be deduped into a HUD that stays hidden)
    const barsOn = bars > 0.001, cardOn = card > 0.001;
    const key = bars.toFixed(2) + card.toFixed(2) + skip.toFixed(2) + grade.toFixed(2) + (barsOn ? 'B' : 'b') + (cardOn ? 'C' : 'c');
    if (key === OV.last) return; OV.last = key;
    o.el.style.display = barsOn || cardOn ? 'block' : 'none';
    o.bars[0].style.transform = `translateY(${(-100 + bars * 100).toFixed(1)}%)`;
    o.bars[1].style.transform = `translateY(${(100 - bars * 100).toFixed(1)}%)`;
    o.card.style.opacity = card.toFixed(3);
    o.card.style.transform = `translate(-50%, -50%) scale(${(0.86 + 0.14 * easeIO(card)).toFixed(3)})`;
    o.skip.style.opacity = skip.toFixed(3);
    if (o.grade) o.grade.style.opacity = grade.toFixed(3);
    ctx.uiRoot.classList.toggle('cci-rbw-on', barsOn);
  }
  /** Take the overlay down for good: no bars, no card, the HUD back. */
  function clearOverlay() {
    OV.last = '';
    try { ctx.uiRoot?.classList.remove('cci-rbw-on'); } catch (e) {}
    if (overlay) overlay.el.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════ the raise ═════
  const cine = { on: false, t: 0, o: null, promise: null, target: new THREE.Vector3(), savedLocked: false, free: false, flashT: 0, burst: false, skipArm: false, fog: 1, fogSaved: undefined };
  let pendingRaise = -1;         // countdown (s) to a scheduled raise
  let skipHandler = null;
  // The raise waits its turn: never over an open card (the Mayor's medal, a
  // route's "For now."), never while the Mayor is still walking over with the
  // medal (up to MEDAL_WAIT s), and — once a card has closed — until the
  // hand-off lines have been said (up to QUIET_WAIT s). Then the rainbow.
  const MEDAL_WAIT = 45, QUIET_WAIT = 22, LOCK_WAIT = 60;
  const hold = { medal: 0, quiet: -1, lock: 0 };
  function cardOpen() {
    try { return !!document.querySelector('#cnt-card.on, .cci-cardwrap.cci-hit'); } catch (e) { return false; }
  }
  function dialogueBusy() {
    const ui = ctx.systems.ui;
    if (ui?.sayQueue?.length) return true;
    try { const el = ctx.uiRoot?.querySelector('.cci-say'); return !!el && el.style.display !== 'none'; } catch (e) { return false; }
  }
  function medalPending() {
    const cc = ctx.systems.catContainment;
    if (!cc) return false;
    // (honorary_citizen is set the moment the medal card is shown)
    try { return (cc.returns ?? 0) >= 3 && !ctx.systems.story?.get('honorary_citizen'); } catch (e) { return false; }
  }
  /** Somebody other than the raise owns the visitor right now: a ride (the
   *  blimp, the biplane, the flyer, a catapult seat), the ferry or a tiger's
   *  carry (both flag onFerry), or an open card. */
  function othersHold(pl) {
    return !!(pl?.onVehicle || pl?.onFerry || ctx.state.vehicle || ctx.state.flying || cardOpen());
  }
  /** True while the scheduled raise should keep waiting (dt advances the caps). */
  function raiseHeld(dt) {
    if (cardOpen()) { hold.quiet = 0; return true; }
    // r5: never mid-ride. The THIRD return can be made aboard the SUGAR blimp or
    // the banner biplane; the rainbow waits until he is standing on the planks.
    const pl = player();
    if (pl?.onVehicle || pl?.onFerry || ctx.state.vehicle || ctx.state.flying) return true;
    // …nor while anything else holds him (a sleep, a Sourling's nibble) — capped,
    // so a lock nobody ever releases cannot keep the rainbow down for good
    if (pl?.locked && hold.lock < LOCK_WAIT) { hold.lock += dt; return true; }
    if (medalPending() && hold.medal < MEDAL_WAIT) { hold.medal += dt; return true; }
    if (hold.quiet >= 0 && hold.quiet < QUIET_WAIT && dialogueBusy()) { hold.quiet += dt; return true; }
    return false;
  }

  /** Where the deck lands on a pier head, the pier's own railing passes UNDER
   *  the ramp (the foot clears its 1.15-u top); its colliders there stop being
   *  solid while the bridge stands, so walkers of every kind step through. */
  const openedRails = [];          // [{ c, desc }] — the own 'solid' property as it was
  function openPierRails(open) {
    if (!open) {
      for (const o of openedRails) {
        try { if (o.desc) Object.defineProperty(o.c, 'solid', o.desc); else delete o.c.solid; } catch (e) { /* leave it open */ }
      }
      openedRails.length = 0; return;
    }
    for (const c of ctx.colliders) {
      if (!c || c.bridge || c.solid === false || openedRails.some((o) => o.c === c)) continue;
      const hh = typeof c.h === 'number' ? c.h : NaN;
      // a pier rail (flagged `rail`, any h — Contract O rails are h 1e4, SOLID with
      // no top), or a legacy box in the pier-rail height band
      if (!c.rail && !(c.box && hh > 3 && hh < 9)) continue;
      // the drawn rail top: deckY + 1.05 when the rail says where its deck is
      const top = Number.isFinite(c.deckY) ? c.deckY + 1.15 : (hh < 9 ? hh : NaN);
      const r = project(c.x, c.z);
      if (!r.ok || Math.min(r.s, L - r.s) > 6) continue;
      if (Number.isFinite(top) && r.y < top - 0.05) continue;          // the ramp must pass over it
      // `solid` may be a live getter (gated rails): shadow it, remember it, put it back later
      const desc = Object.getOwnPropertyDescriptor(c, 'solid');
      try {
        Object.defineProperty(c, 'solid', { value: false, writable: true, configurable: true, enumerable: true });
        openedRails.push({ c, desc });
      } catch (e) { /* a sealed collider: leave it */ }
    }
  }
  function setUp(v) {
    api.up = v; upFlag = !!v; group.visible = v || api.raising;
    openPierRails(v);
    if (!v) RAIL.s = -1e9;
    if (v) {
      U.grow.value = 1;
      try { ctx.systems.story?.set('rainbow_bridge', true); } catch (e) {}
      try { ctx.systems.ui?.addMapMarker?.({ id: 'rainbow_bridge', x: apex.x, z: apex.z, glyph: 'bridge', label: 'Rainbow Bridge' }); } catch (e) {}
      ctx.events.emit('bridge:up', { apex, ends });
    }
  }
  function raiseInstant() {
    if (api.up) return;
    if (cine.on) { endCine(); return; }       // (endCine stands it up)
    api.raising = false; setUp(true);
  }
  /** Where the growing tips are at grow g (candy side, cat side). */
  const tipA = new THREE.Vector3(), tipB = new THREE.Vector3(), _fa = {}, _fb = {};
  function tips(g) {
    const s = g * L / 2;
    const a = frameAt(s, _fa), b = frameAt(L - s, _fb);
    tipA.set(a.x, a.y, a.z); tipB.set(b.x, b.y, b.z);
  }
  function startRaise() {
    if (api.up || cine.on) return;
    if (ctx.systems.intro?.active) { pendingRaise = 2; return; }
    cine.on = true; cine.t = 0; cine.burst = false; cine.skipArm = false; api.raising = true;
    cine.fogSaved = ctx.state.fogScale; cine.fog = 1;
    group.visible = true; U.grow.value = 0;
    const pl = player(); cine.savedLocked = !!pl?.locked; if (pl) pl.locked = true;
    ctx.events.emit('bridge:raise', {});
    const cam = ctx.systems.camera;
    cine.o = { target: cine.target, azimuth: -0.5, elevation: 0.22, distance: 34, fov: 38, pitch: 0.0, noTilt: true, in: 1.6, hold: RAISE_T - 1.6 - 1.8, out: 1.8 };
    poseCine(0);
    cine.free = false;
    try {
      if (typeof cam?.cinematic === 'function') cine.promise = cam.cinematic(cine.o);
      else if (typeof cam?.setFree === 'function') { cine.free = true; }
    } catch (e) { cine.free = !!cam?.setFree; }
    try { ctx.systems.audio?.play?.('rainbow_rise'); } catch (e) {}
    // any key / click / tap skips (after a beat, so the key that caused it does not)
    if (!ctx.shot && !skipHandler) {
      skipHandler = () => { if (cine.on && cine.skipArm) skipRaise(); };
      window.addEventListener('pointerdown', skipHandler, true);
    }
  }
  // THE HERO (r4) is shot from the NORTH, over open sea, looking back at the
  // piers. From the south (r1–r3) the U's legs ran straight away from the lens
  // and the rainbow stood up like a hoop; from the north its bend is the near
  // side, so it reads as a wide, low arch with its deck on top (a bridge, not a
  // hoop), both islands framing it — and the CatBlimp's loop, which never
  // leaves the strait SOUTH of the piers, is always behind the rainbow instead
  // of between it and the lens. The swing gets there round the WEST, high over
  // the Candy Kingdom (clear of the palace's 44-u spires), while the halves climb.
  // `pitch` lifts the frame so the crest sits under the title card, not behind it.
  const HERO = { az: -3.0, el: 0.28, dist: 155, fov: 40, pitch: 0.11, ty: 0.4, tz: 0 };
  function poseCine(t) {
    // keyframes: the foot of Sugar Pier (pier, whale, strait, Cat Island across)
    // → chase the candy-side tip up the sky → swing round the west and north →
    // the meeting at the crest → the hero shot: both islands, one rainbow
    const g = easeIO((t - GROW_A) / (GROW_B - GROW_A));
    tips(g);
    const o = cine.o; if (!o) return g;
    const K = clamp((apex.y - 4) / 46, 1, 1.3);
    const hero = _hero;
    hero.x = (PX[0] + PX[N]) * 0.25 + apex.x * 0.5; hero.y = apex.y * HERO.ty; hero.z = (PZ[0] + PZ[N]) * 0.25 + apex.z * 0.5 + HERO.tz;
    const fx = PX[0], fy = PY[0] + 3, fz = PZ[0] - 2;
    if (t < 9) {
      const k = easeIO(t / 9), c = 0.8 * ss(1.5, 9, t);
      cine.target.set(lerp(fx, tipA.x, c), lerp(fy, tipA.y, c), lerp(fz, tipA.z, c));
      o.azimuth = lerp(-1.05, -0.62, k); o.elevation = lerp(0.2, 0.1, k); o.distance = lerp(38, 82 * K, k); o.pitch = lerp(0.02, 0.1, k); o.fov = 40;
    } else if (t < 17) {
      const u = (t - 9) / 8, k = easeIO(u);
      const ax = lerp(fx, tipA.x, 0.8), ay = lerp(fy, tipA.y, 0.8), az = lerp(fz, tipA.z, 0.8);
      cine.target.set(lerp(ax, hero.x, k), lerp(ay, hero.y, k), lerp(az, hero.z, k));
      o.azimuth = lerp(-0.62, HERO.az, k);
      o.elevation = lerp(0.1, HERO.el, k) + 0.16 * Math.sin(Math.PI * u);      // high over the palace, mid-swing
      o.distance = lerp(82 * K, HERO.dist, k); o.pitch = lerp(0.1, HERO.pitch, k); o.fov = lerp(40, HERO.fov, k);
    } else {
      const k = easeIO((t - 17) / 8);
      cine.target.set(hero.x, hero.y, hero.z);
      o.azimuth = HERO.az + 0.1 * k; o.elevation = HERO.el; o.distance = HERO.dist - 8 * k; o.pitch = HERO.pitch; o.fov = HERO.fov;
    }
    blimpClear(o, ss(10.5, 15.5, t));
    U.grow.value = g;
    // the long lens sees across the whole strait: thin the haze (≈ 60 % less at
    // the hero's range) so the sea reads teal and both islands keep their colour
    cine.fog = lerp(1, 3, ss(3, 11, t));
    return g;
  }
  // The CatBlimp keeps its own loop (planes.js), always SOUTH of the piers. From
  // the r4 north hero it is behind the rainbow — but a few seconds of every lap
  // it sits right behind the crest, like a hat (and during the swing it can
  // cross in front). The lens rises just enough to part them: the least
  // elevation that clears it, by bisection on a continuous margin, so the lift
  // is a smooth function of where the blimp is (no pops, no state; a still
  // render and the live shot agree).
  const _hero = { x: 0, y: 0, z: 0 };
  // the blimp as a capsule along its heading (planes.js: envelope r 4.2, half-length
  // 12.5, the gondola 6.2 under the centre; ears and fins inside the radius)
  const BLIMP_HALF = 11, BLIMP_RAD = 5.8, BLIMP_DROP = 1.2, BLIMP_PAD = 3.0, BLIMP_LIFT = 0.5;
  const CREST_S = [0, -16, 16, -30, 30];            // arc lengths off the apex we keep in view (the crest + the upper legs)
  const _cp = {}, _crest = CREST_S.map(() => ({ x: 0, y: 0, z: 0 }));
  /** Clearance (u) of the blimp from the sight lines lens → crest at elevation e (< 0: in the way).
   *  r4: ANGULAR — the envelope as five spheres down its axis, each against every
   *  crest point: the angle between the two sight lines less the sphere's own
   *  angular radius, in units at the blimp's range. So it also counts a blimp
   *  just BEHIND the crest (from the north hero it is always behind: r3's test
   *  skipped that and it sat on the apex like a hat); a higher lens drops the
   *  near crest away from the far envelope, which is what the lift does. */
  function blimpMargin(o, e, b) {
    const T = cine.target, d = o.distance, ce = Math.cos(e);
    const cx = T.x + Math.sin(o.azimuth) * ce * d, cy = T.y + Math.sin(e) * d, cz = T.z + Math.cos(o.azimuth) * ce * d;
    const hx = Math.sin(b.heading || 0) * BLIMP_HALF, hz = Math.cos(b.heading || 0) * BLIMP_HALF;
    let m = Infinity;
    for (let j = 0; j <= 4; j++) {
      const u = j * 0.5 - 1;
      const qx = b.x + hx * u - cx, qy = b.y - BLIMP_DROP - cy, qz = b.z + hz * u - cz;
      const ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1e-6;
      const rad = Math.asin(Math.min(1, (BLIMP_RAD + BLIMP_PAD) / ql));
      for (let i = 0; i < _crest.length; i++) {
        const P = _crest[i];
        const px = P.x - cx, py = P.y - cy, pz = P.z - cz, pl = Math.sqrt(px * px + py * py + pz * pz) || 1e-6;
        const ang = Math.acos(clamp((qx * px + qy * py + qz * pz) / (ql * pl), -1, 1));
        const dd = (ang - rad) * ql;
        if (dd < m) m = dd;
      }
    }
    return m;
  }
  function blimpClear(o, w) {
    if (!(w > 0)) return;
    const b = ctx.systems.planes?.aircraft?.blimp;
    if (!b || !Number.isFinite(b.x)) return;
    const aS = apexI * ds;
    for (let i = 0; i < _crest.length; i++) { frameAt(clamp(aS + CREST_S[i], 0, L), _cp); _crest[i].x = _cp.x; _crest[i].y = _cp.y + 1.5; _crest[i].z = _cp.z; }
    const e0 = o.elevation;
    if (blimpMargin(o, e0, b) >= 0) return;
    let lo = e0, hi = e0 + BLIMP_LIFT;
    if (blimpMargin(o, hi, b) >= 0) {
      for (let it = 0; it < 14; it++) { const mid = (lo + hi) * 0.5; if (blimpMargin(o, mid, b) < 0) lo = mid; else hi = mid; }
    }
    const e1 = e0 + (hi - e0) * w;
    // …and the lens tips up by what the rise costs the crest, so the crest keeps
    // its place in the frame (under the title card) while the blimp drops below it
    o.pitch = (o.pitch || 0) + crestAngle(o, e1) - crestAngle(o, e0);
    o.elevation = e1;
  }
  /** How far above the lens axis (lens → target) the apex sits from elevation e (rad). */
  function crestAngle(o, e) {
    const T = cine.target, d = o.distance, ce = Math.cos(e);
    const cx = T.x + Math.sin(o.azimuth) * ce * d, cy = T.y + Math.sin(e) * d, cz = T.z + Math.cos(o.azimuth) * ce * d;
    return Math.atan2(apex.y - cy, Math.hypot(apex.x - cx, apex.z - cz)) - Math.atan2(T.y - cy, Math.hypot(T.x - cx, T.z - cz));
  }
  function stepCine(dt) {
    cine.t += dt;
    const t = cine.t;
    // r5 soft-lock: whoever held the visitor when the raise began (a ride's
    // rider) may let go DURING it (ride.js unlocks as he steps off). Their hold
    // is over, so the snapshot is stale: after the raise he walks. Keep him
    // still until then.
    const pl = player();
    if (pl && !pl.locked) { cine.savedLocked = false; pl.locked = true; }
    if (t > 1.2) cine.skipArm = true;
    const g = poseCine(t);
    // (sky.js reads fogScale on its next update; never below what was asked of it before)
    ctx.state.fogScale = Math.max(cine.fog, cine.fogSaved || 1);
    // sparkle from the feet at the start, and from the tips as they climb
    const P = ctx.systems.particles;
    if (P && t < GROW_B && t > 0.4) {
      if (Math.floor(t * 6) !== Math.floor((t - dt) * 6)) {
        for (const tp of [tipA, tipB]) P.burst?.({ x: tp.x, y: tp.y + 0.4, z: tp.z, count: 6, color: [0xffffff, 0xffe9a8, 0xff9ac2, 0x9fe8ff], speed: 3.2, life: 1.1, size: 0.3, gravity: -1.2, spread: 1.6, shape: 'sparkle', blend: 'add' });
      }
    }
    if (!cine.burst && g >= 0.999) {
      cine.burst = true; cine.flashT = 1;
      P?.burst?.({ x: apex.x, y: apex.y + 1, z: apex.z, count: 160, color: BANDS.concat([0xffffff]), speed: 11, life: 2.6, size: 0.42, gravity: -2.5, spread: 3, shape: 'sparkle', blend: 'add' });
      P?.confetti?.(apex.x, apex.y + 2, apex.z, { count: 60 });
      try { ctx.systems.camera?.shake?.(0.35, 0.6); } catch (e) {}
      try { ctx.systems.audio?.play?.('rainbow_chime'); } catch (e) {}
    }
    if (cine.flashT > 0) { cine.flashT = Math.max(0, cine.flashT - dt * 1.4); U.flash.value = cine.flashT * cine.flashT * 0.45; }
    // overlay: bars in over 0.8 s, the card 17.5 → 23 s, bars out at the end
    const bars = t < RAISE_T - 1.6 ? ss(0, 0.8, t) : ss(RAISE_T, RAISE_T - 1.6, t);
    const card = ss(17.4, 18.4, t) * (1 - ss(22.6, 23.6, t));
    // the lens's graduated filter: blue at the top of the frame, clear by the
    // horizon (the sky is sky.js's; this is the shot's grade — by day only)
    const grade = ss(9.5, 13.5, t) * (1 - ss(RAISE_T - 1.8, RAISE_T - 0.4, t)) * clamp(ctx.state.daylight ?? 1, 0, 1);
    setOverlay(bars, card, ss(1.2, 2.0, t) * (1 - ss(RAISE_T - 2, RAISE_T - 1, t)), grade);
    if (cine.free) {
      const o = cine.o;
      try { ctx.systems.camera.setFree({ target: [cine.target.x, cine.target.y, cine.target.z], azimuth: o.azimuth, elevation: o.elevation, distance: o.distance, fov: o.fov }); } catch (e) {}
    }
    // any key skips
    if (cine.skipArm && ctx.input?.pressed?.size) skipRaise();
    if (t >= RAISE_T) endCine(false);
  }
  function skipRaise() {
    if (!cine.on) return;
    if (!cine.burst) { cine.burst = true; U.grow.value = 1; }
    try { cine.promise?.cancel?.(); } catch (e) {}
    cine.t = Math.max(cine.t, RAISE_T - 0.9);
  }
  function endCine() {
    if (!cine.on) return;
    cine.on = false; api.raising = false;
    U.flash.value = 0;
    ctx.state.fogScale = cine.fogSaved; cine.fogSaved = undefined;
    if (cine.free) { try { ctx.systems.camera.setFree(null); } catch (e) {} }
    // hand him back: locked only if a hold from before the raise is still
    // standing (nobody released it) or somebody holds him right now
    const pl = player(); if (pl) pl.locked = !!cine.savedLocked || othersHold(pl);
    cine.savedLocked = false;
    setOverlay(0, 0, 0);
    clearOverlay();
    if (skipHandler) { window.removeEventListener('pointerdown', skipHandler, true); skipHandler = null; }
    setUp(true);
    // the Mayor's half already ACCEPTED (not just offered): the post-medal
    // objective now reads true; otherwise containment still owns the goal
    try {
      if (ctx.systems.story?.get('pass_cat')) ctx.systems.ui?.setObjective?.('The islands are joined. So are their problems.', 'The Mayor\u2019s half of the boarding pass is yours. The King\u2019s is on the Candy Palace throne.');
      ctx.systems.ui?.toast?.('A rainbow now joins the piers. Anyone can use it. ANYONE.');
    } catch (e) {}
  }

  // ═══════════════════════════════════════════════════════ crossings ═════
  // A crossing is the visitor's own feet carrying him from one foot of the
  // rainbow to the other. It is forgotten (never "arrived") the moment it
  // stops being that: a teleport, a vehicle, the ferry, a turn back, stepping
  // off onto the island he came from — or leaving the deck anywhere but at a
  // foot (fell, was carried, was fished out by the lifeguard): off the deck
  // with his feet more than 3 u under it, or more than FOOT_R from both feet.
  // (r2 bug: the tracker survived all of those, and stepping onto the far foot
  //  minutes later fired a crossing he never made.)
  const X = { from: null, started: false, lastD: 0 };
  const FOOT_R = 14;
  const otherOf = (e) => (e === 'candy' ? 'cat' : 'candy');
  function forget() { X.from = null; X.started = false; X.lastD = 0; }
  ctx.events.on('player:teleport', forget);
  function crossing() {
    const pl = player(); if (!pl?.position) return;
    if (pl.onVehicle || pl.onFerry || ctx.state.vehicle || cine.on) { forget(); return; }
    const P = pl.position;
    let on = false, s = -1, over = false, below = false;
    if (P.x > gx0 && P.x < gx1 && P.z > gz0 && P.z < gz1) {
      const r = project(P.x, P.z);
      if (r.ok && Math.abs(P.y - r.y) < 1.6) { on = true; s = r.s; }
      else if (r.found && Math.abs(r.lat) <= HW + 0.6) {
        if (P.y >= r.y - 3) over = true;          // in the air over the deck (a jump): still crossing
        else below = true;                        // under it: he is not on the rainbow any more
      }
    }
    if (on) {
      if (!X.from) { if (s < 9) X.from = 'candy'; else if (s > L - 9) X.from = 'cat'; }
      if (!X.from) return;
      const d = X.from === 'candy' ? s : L - s;
      X.lastD = d;
      if (!X.started && d > 14) { X.started = true; escape.start('bridge', { from: X.from, to: otherOf(X.from) }); }
      if (X.started && d > L - 2.5) arrive();
      else if (X.started && d < 3) X.started = false;               // turned back
    } else if (X.from && !over) {
      // stepped off: onto the far pier (arrived), back onto the near one (reset),
      // or anywhere else (reset: off the side, under it, away from both feet)
      const isl = world.islandAt(P.x, P.z);
      const dA = Math.hypot(P.x - PX[0], P.z - PZ[0]), dB = Math.hypot(P.x - PX[N], P.z - PZ[N]);
      const farFoot = X.from === 'candy' ? dB : dA;
      if (X.started && X.lastD > L - FOOT_R && !below && farFoot < FOOT_R && isl === otherOf(X.from)) arrive();
      else forget();
    }
  }
  function arrive() {
    const to = otherOf(X.from), from = X.from;
    X.from = null; X.started = false; X.lastD = 0;
    escape.success('bridge', { from, to });
    try { ctx.systems.ui?.toast?.(to === 'candy' ? 'The Candy Kingdom, on foot. Over a rainbow.' : 'Cat Island. They saw you coming a long way off.'); } catch (e) {}
  }

  // ═══════════════════════════════════════════════════════ deck guard ════
  // Cat Island containment's "wave of kitties" shoves the visitor inland along
  // the ground whenever he heads seaward near the Arrivals Pier — which is
  // exactly where the rainbow lands. Up on the deck the cats cannot reach him:
  // whatever the wave moves him, the rainbow puts back (escape updates after
  // containment, before player.js). The toast and the galloping cats still
  // play; he simply is not where they are.
  const guard = { x: 0, z: 0, ok: false, tele: false, wave: false, px: 0, pz: 0, pOk: false, fresh: false };
  let homeIsland = null;          // the island the visitor last stood on (the far end is the other one)
  ctx.events.on('player:teleport', () => { guard.tele = true; });
  // Where the player's OWN update left him this frame (the camera updates right
  // after the player): whatever moves him between here and our next update is
  // somebody else's shove. (The wave pushes 8.2 u/s × dt — at 144 fps a tenth
  // of a unit a frame — so a jump-sized threshold never saw it: r1 bug.)
  ctx.events.on('camera:update', () => {
    if (!api.up) return;
    const P = player()?.position; if (!P) return;
    guard.px = P.x; guard.pz = P.z; guard.fresh = true;
    let on = false;
    if (P.x > gx0 && P.x < gx1 && P.z > gz0 && P.z < gz1) { const r = project(P.x, P.z); on = r.ok && Math.abs(P.y - r.y) < 1.6; }
    guard.pOk = on;
  });
  function deckGuard(P, pl) {
    let waveNow = false;
    const free = !guard.tele && !pl.locked && !pl.onVehicle && !pl.onFerry && !ctx.state.vehicle;
    if (guard.fresh && guard.pOk && free) {
      const dx = P.x - guard.px, dz = P.z - guard.pz, d2 = dx * dx + dz * dz;
      if (d2 > 1e-8) {
        try { waveNow = !!ctx.systems.catContainment?.state?.waveActive; } catch (e) { waveNow = false; }
        // (the wave's LAST frame moves him and clears its flag in the same update)
        if (waveNow || guard.wave || d2 > 9) { P.x = guard.px; P.z = guard.pz; }
      }
    } else if (!guard.fresh && guard.ok && free) {
      // no camera pass last frame (a free camera): the coarse check
      const dx = P.x - guard.x, dz = P.z - guard.z, d2 = dx * dx + dz * dz;
      if (d2 > 0.81) {
        try { waveNow = !!ctx.systems.catContainment?.state?.waveActive; } catch (e) { waveNow = false; }
        if (waveNow || guard.wave || d2 > 9) { P.x = guard.x; P.z = guard.z; }
      }
    }
    guard.wave = waveNow;
    guard.tele = false; guard.fresh = false;
    let on = false;
    if (P.x > gx0 && P.x < gx1 && P.z > gz0 && P.z < gz1) { const r = project(P.x, P.z); on = r.ok && Math.abs(P.y - r.y) < 1.6; }
    guard.ok = on; api.onDeck = on;
    if (on) { guard.x = P.x; guard.z = P.z; }
  }

  // ═══════════════════════════════════════════════════════ debug walk ════
  let walkTo = null;
  const _stick = { x: 0, y: 0 }, _fw = {};
  function steer() {
    const pl = player(), cam = ctx.systems.camera; if (!pl?.position || !cam?.basis) return;
    const P = pl.position;
    const r = project(P.x, P.z);
    let s = r.ok ? r.s : -1;
    const goal = walkTo === 'cat' ? L : 0;
    if (s < 0) {
      // off the deck: head for the nearer foot (unless that is where we are going)
      const dA = Math.hypot(P.x - PX[0], P.z - PZ[0]), dB = Math.hypot(P.x - PX[N], P.z - PZ[N]);
      const nearS = dA < dB ? 0 : L;
      if (Math.min(dA, dB) < 10 && nearS !== goal) s = nearS === 0 ? -2.2 : L + 2.2;
    }
    if (s < -3 || s > L + 3 || Math.abs(goal - s) < 0.8) { walkTo = null; _stick.x = 0; _stick.y = 0; ctx.input.virtual = _stick; return; }
    const f = frameAt(clamp(s + (walkTo === 'cat' ? 4.5 : -4.5), 0, L), _fw);
    let dx = f.x - P.x, dz = f.z - P.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const b = cam.basis();
    _stick.y = dx * b.fx + dz * b.fz; _stick.x = dx * b.rx + dz * b.rz;
    ctx.input.virtual = _stick;
  }

  // ═══════════════════════════════════════════════════════ api ═══════════
  const _pt = { x: 0, y: 0, z: 0 }, _pf = {};
  const api = {
    up: false, raising: false, onDeck: false, length: L, apex, ends, path, path3, group,
    humLevel: 0,
    heightAt,
    sAt(x, z) { const r = project(x, z); return r.ok ? r.s : -1; },
    pointAt(s) { const f = frameAt(s, _pf); _pt.x = f.x; _pt.y = f.y; _pt.z = f.z; return _pt; },
    /** Deck frame at arc length s: {x,y,z,tx,tz,nx,nz}; pass `out` to avoid allocating. */
    frameAt,
    halfWidth: HW,
    /** 0..1 — a red pulse over the whole rainbow (the ending's flare drives it). */
    setAlarm(v) { U.alarm.value = clamp(Number(v) || 0, 0, 1); },
    debugRaise(instant = false) { if (instant) raiseInstant(); else { if (api.up) setUp(false); startRaise(); } return api.up || api.raising; },
    /** Pose the raise at t seconds (renders): grows the rainbow and parks the camera. */
    debugCine(t = 9) {
      if (!cine.on) { if (api.up) setUp(false); startRaise(); }
      cine.t = Math.max(0, t - 1 / 30);
      // the harness's teleport → camera.snap() drops any running shot: take the lens back
      try { if (!cine.free) cine.promise = ctx.systems.camera?.cinematic?.(cine.o) ?? cine.promise; } catch (e) {}
      return t;
    },
    /** Raise (instantly) and stand the visitor on the deck at arc length s ('apex' | 'candy' | 'cat' | number). */
    debugPlace(where = 'apex', facingEnd = null) {
      raiseInstant();
      const s = where === 'apex' ? apexI * ds : where === 'candy' ? 1.2 : where === 'cat' ? L - 1.2 : clamp(Number(where) || 0, 0, L);
      const f = frameAt(s, _pf), pl = player();
      if (!pl?.teleport) return null;
      pl.teleport(f.x, f.z);
      if (facingEnd === 'cat' || facingEnd === 'candy') pl.facing = Math.atan2(f.tx * (facingEnd === 'cat' ? 1 : -1), f.tz * (facingEnd === 'cat' ? 1 : -1));
      try { if (!ctx.systems.camera?.isFree?.()) ctx.systems.camera?.snap?.(); } catch (e) {}
      return { x: f.x, y: f.y, z: f.z, s };
    },
    debugWalk(to = 'cat') { walkTo = to === 'candy' || to === 'cat' ? to : null; if (!walkTo) { _stick.x = 0; _stick.y = 0; ctx.input.virtual = _stick; } return walkTo; },
    get crossing() { return { from: X.from, started: X.started }; },
    /** Tuning: the hero framing the raise settles on (mutable; read every frame). */
    cineHero: HERO,
    /** QA: the raise's live shot (allocates; not for per-frame use). */
    get cineShot() { return cine.on && cine.o ? { t: +cine.t.toFixed(2), azimuth: cine.o.azimuth, elevation: cine.o.elevation, distance: cine.o.distance, target: [cine.target.x, cine.target.y, cine.target.z] } : null; },
    update(dt, c) {
      const st = c.state;
      U.time.value = st.elapsed;
      const night = clamp(1 - (st.daylight ?? 1), 0, 1);
      U.night.value = night;
      if (pendingRaise >= 0 && !raiseHeld(dt)) { pendingRaise -= dt; if (pendingRaise < 0) { hold.medal = 0; hold.quiet = -1; hold.lock = 0; startRaise(); } }
      if (cine.on) stepCine(dt);
      if (!api.up && !api.raising) return;

      const P = player()?.position;
      // the far end — the raids' door — goes red after dark; eyes gather there.
      // "Far" is the OTHER island: the one you did not come from (it flips when
      // you step off the deck on the far side, not halfway across)
      if (P) {
        const dA = Math.hypot(P.x - ends.candy.x, P.z - ends.candy.z), dB = Math.hypot(P.x - ends.cat.x, P.z - ends.cat.z);
        if (!api.onDeck && (st.island === 'candy' || st.island === 'cat')) homeIsland = st.island;
        const farCat = homeIsland ? homeIsland === 'candy' : dB >= dA;
        U.far.value = farCat ? 1 : 0;
        const redGoal = api.up ? smoothstep(0.25, 0.8, night) : 0;
        U.red.value = damp(U.red.value, redGoal, 1.5, dt);
        const rv = glowU.uRedEnd.value;
        rv.x = damp(rv.x, farCat ? 0 : redGoal, 1.5, dt); rv.y = damp(rv.y, farCat ? redGoal : 0, 1.5, dt);
        // eyes only at the far gate, only in the dark, and they melt away when you come close
        const ev = glowU.uEyes.value;
        const eyeGoalA = (!farCat ? 1 : 0) * smoothstep(0.45, 0.85, night) * smoothstep(16, 34, dA);
        const eyeGoalB = (farCat ? 1 : 0) * smoothstep(0.45, 0.85, night) * smoothstep(16, 34, dB);
        ev.x = damp(ev.x, eyeGoalA * 1.6, 2, dt); ev.y = damp(ev.y, eyeGoalB * 1.6, 2, dt);
        // proximity (for whoever owns sound)
        let hum = 0;
        if (P.x > gx0 - 30 && P.x < gx1 + 30 && P.z > gz0 - 30 && P.z < gz1 + 30) {
          const r = project(P.x, P.z);
          hum = r.ok ? 1 : clamp(1 - (Math.min(dA, dB) - 4) / 40, 0, 1) * 0.6;
        }
        api.humLevel = api.up ? hum : 0;
      }
      caneMat.emissiveIntensity = 0.02 + night * 0.22;
      signMat.emissiveIntensity = 0.05 + night * 0.55;
      if (api.up) {
        const pl = player();
        if (pl?.position) deckGuard(pl.position, pl);
        // where the visitor is along the deck while his feet are up on it
        // (or in the air above it): the handrails near him are walls
        RAIL.s = -1e9;
        if (P && P.x > gx0 && P.x < gx1 && P.z > gz0 && P.z < gz1 && !pl?.onVehicle && !c.state.vehicle) {
          const r = project(P.x, P.z);
          if (r.found && Math.abs(r.lat) < HW + 1.2 && P.y > r.y - 1.6) RAIL.s = r.s;
        }
        crossing();
        if (walkTo) steer();
      }
    },
  };

  // ── triggers ────────────────────────────────────────────────────────────────
  ctx.events.on('story:escape_returns', (v) => {
    if (typeof v === 'number' && v >= 3 && !api.up && !cine.on && pendingRaise < 0) pendingRaise = RAISE_DELAY;
  });
  ctx.events.on('story:rainbow_bridge', (v) => { if (v && !api.up && !cine.on) raiseInstant(); });
  ctx.events.on('world:ready', () => {
    // the piers are built by now: measure their planks and re-seat the feet on them
    try {
      const y0 = pierY(PX[0], PZ[0], Y_CANDY), y1 = pierY(PX[N], PZ[N], Y_CAT);
      if (Math.abs(y0 - PY[0]) > 0.03 || Math.abs(y1 - PY[N]) > 0.03) { buildProfile(y0, y1); refreshDerived(); build(); }
    } catch (e) { console.warn('[escape/bridge] pier re-measure skipped', e?.message || e); }
    // (a pier builder may re-lay its rails at world:ready too: look again in a beat)
    escape.after(0.3, () => { if (api.up) openPierRails(true); });
    const q = params.get?.('bridge');
    if (q === '1' || q === 'up') raiseInstant();
    else if (q === 'cine') pendingRaise = 1.0;
    report();
  });
  function pierY(x, z, fallback) {
    let best = -Infinity;
    for (const w of ctx.walkables) {
      if (!w || w.id === 'rainbowBridge' || !w.test) continue;
      try { const y = w.test(x, z); if (typeof y === 'number' && Number.isFinite(y) && y > best && y < fallback + 3) best = y; } catch (e) {}
    }
    return best > -Infinity && Math.abs(best - fallback) < 2.5 ? best : fallback;
  }
  function report() {
    let tris = 0;
    group.traverse((o) => {
      if (!o.isMesh && !o.isPoints) return;
      const g = o.geometry, cnt = g.index ? g.index.count : g.attributes.position.count;
      tris += o.isPoints ? 0 : (cnt / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    // how the camera's collider pass reads a topless rail (density.js top(): terrain + 8
    // for h ≥ 1e4) against the deck: under the visitor's chest (deck + 1.4) everywhere
    let railCam = -Infinity;
    for (const c of railCols) railCam = Math.max(railCam, world.height(c.x, c.z) + 8 - c.deckY);
    console.warn('[escape/bridge]', JSON.stringify({
      length: +L.toFixed(1), apex: [+apex.x.toFixed(1), +apex.y.toFixed(1), +apex.z.toFixed(1)],
      ends: [[+PY[0].toFixed(2)], [+PY[N].toFixed(2)]], meshes: Object.keys(meshes).length, tris: Math.round(tris),
      rails: railCols.length, railCam: +railCam.toFixed(2),
    }));
  }

  return escape.register('bridge', api);
}

// ── the raise overlay: letterbox + a title card in the title screen's language ─
const OVERLAY_CSS = `
#ui.cci-rbw-on > :not(.cci-rbw):not(.cci-fade):not(.cci-nvig):not(.cci-vig):not(.tch-rot):not(style) { visibility: hidden !important; }
#ui .cci-rbw { position: fixed; inset: 0; z-index: 70; pointer-events: none; display: none; }
#ui .cci-rbw-bar { position: absolute; left: 0; right: 0; height: 9.5vh; background: linear-gradient(180deg, #1a0a22, #24122c); }
#ui .cci-rbw-grade { position: absolute; left: 0; right: 0; top: 0; height: 40vh; opacity: 0;
  background: linear-gradient(180deg, rgba(46,128,238,.52) 0, rgba(46,128,238,.5) 9.5vh, rgba(70,146,238,.3) 19vh, rgba(96,160,238,.1) 30vh, rgba(96,160,238,0) 40vh); }
#ui .cci-rbw-bar.t { top: 0; box-shadow: 0 2px 0 rgba(255,210,236,.18); }
#ui .cci-rbw-bar.b { bottom: 0; box-shadow: 0 -2px 0 rgba(255,210,236,.18); }
#ui .cci-rbw-card { position: absolute; left: 50%; top: 19.5%; transform: translate(-50%, -50%); opacity: 0;
  display: flex; flex-direction: column; align-items: center; gap: .35em; text-align: center; white-space: nowrap; }
#ui .cci-rbw-rib { font: 800 clamp(12px, 1.5vw, 18px)/1 "Baloo 2", "Trebuchet MS", sans-serif; letter-spacing: .2em; color: #fff8ee;
  padding: .32em 1em .26em; border-radius: .35em; border: .12em solid #24122c;
  background: linear-gradient(180deg, #ff86ae 0%, #ef4f84 58%, #d7386f 100%);
  box-shadow: 0 .16em 0 #24122c, 0 .4em .7em rgba(16,4,24,.4), inset 0 .1em 0 rgba(255,255,255,.5); text-shadow: 0 .09em 0 rgba(36,18,44,.6); }
#ui .cci-rbw-word { display: flex; align-items: flex-end; font: 800 clamp(30px, 5.6vw, 84px)/.95 "Baloo 2", "Trebuchet MS", sans-serif; letter-spacing: .01em;
  filter: drop-shadow(0 .05em 0 #24122c) drop-shadow(0 .14em .16em rgba(16,4,24,.5)); }
#ui .cci-rbw-word span { color: #fff6ec; -webkit-text-stroke: .075em #24122c; paint-order: stroke fill;
  background: linear-gradient(180deg, rgba(255,255,255,.7) 0%, rgba(255,255,255,0) 45%), repeating-linear-gradient(126deg, var(--c) 0 .09em, #fff6ec .09em .18em);
  -webkit-background-clip: text; background-clip: text; color: transparent; }
#ui .cci-rbw-word .sp { display: inline-block; width: .28em; }
#ui .cci-rbw-sub { font: italic 800 clamp(13px, 1.4vw, 20px)/1.3 "Nunito", "Trebuchet MS", sans-serif; color: #fff4e6;
  text-shadow: 2px 0 0 #24122c, -2px 0 0 #24122c, 0 2px 0 #24122c, 0 -2px 0 #24122c, 0 4px 0 #24122c, 0 6px 14px rgba(10,2,16,.55); }
#ui .cci-rbw-skip { position: absolute; right: calc(22px + env(safe-area-inset-right, 0px)); bottom: calc(9.5vh + 12px);
  font: 800 11px/1 "Nunito", sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #ffe6d6; opacity: 0;
  text-shadow: 0 1.5px 0 rgba(26,8,32,.95); }
`;
