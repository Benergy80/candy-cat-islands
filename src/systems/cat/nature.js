// ─────────────────────────────────────────────────────────────────────────────
// CAT ISLAND — NATURE & PARKS
// Warm Mediterranean seaside planting for the east island, plus the cat-themed
// jokes that grow out of it: catnip commons, scratching-post trees, cardboard
// box "bushes" with eyes, a topiary hedge maze, the Great Feather, a municipal
// koi pond, fish-bone flowers, tuna-can planters, gulls and scattering pigeons.
//
// One InstancedMesh per species (+3 merged meshes for the hero props, water and
// signs). Sway/flap happen in the vertex shader off a single uTime uniform, so
// a few thousand plants animate for free.
//
// Public API (ctx.systems.catNature):
//   .group            THREE.Group holding everything
//   .perches          [{x,y,z,kind}] flat spots cats can sit on (post tops, benches, stacks)
//   .gullPositions()  live gull positions (something for cats to stare at)
//   .meta             placed hero-prop coordinates (feather, pond, maze, stacks…)
//   .stats()          { calls-ish draw meshes, triangles, instances }
// Events emitted: 'cat:nature:ready'
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, hash, lerp, smoothstep } from '../../core/util.js';
import * as G from './nature/geo.js';
import * as PL from './nature/place.js';
import { buildProps } from './nature/props.js';
import { createBirds } from './nature/birds.js';

const TAU = Math.PI * 2;
const WIND = 0.85;      // prevailing wind bearing: everything leans off this

// ── shader chunks ────────────────────────────────────────────────────────────
const HEAD = `
uniform float uTime;
attribute float aPhase;
attribute float aSway;
attribute vec3 aTint;
attribute float aMask;
`;
const SWAY = /* glsl */`
#include <begin_vertex>
{
  float ph = aPhase + uTime * 1.25;
  #ifdef USE_INSTANCING
    ph += instanceMatrix[3][0] * 0.085 + instanceMatrix[3][2] * 0.06;
  #endif
  float gust = 0.7 + 0.5 * sin(uTime * 0.31 + aPhase * 0.13);
  float amp = aSway * max(transformed.y, 0.0) * gust;
  transformed.x += sin(ph) * amp;
  transformed.z += sin(ph * 0.77 + 1.7) * amp * 0.8;
}
`;
const TINT = /* glsl */`
#include <color_vertex>
vColor.rgb = mix(vColor.rgb, aTint, aMask);
`;
const FLAP = /* glsl */`
#include <begin_vertex>
transformed.y += abs(transformed.x) * sin(uTime * 11.0 + aPhase) * aSway * aFlap;
`;

function inject(mat, uniforms, body, key, tint = true, head = HEAD) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = head + shader.vertexShader.replace('#include <begin_vertex>', body);
    if (tint) shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', TINT);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function create(ctx) {
  const { scene, world } = ctx;
  const t0 = performance.now();
  const group = new THREE.Group(); group.name = 'cat_nature';
  scene.add(group);
  const uniforms = { uTime: { value: 0 } };
  const rand = rng(hash('cat-nature-build'));

  // ── materials ─────────────────────────────────────────────────────────────
  const matFoliage = inject(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true, side: THREE.DoubleSide }), uniforms, SWAY, 'catnat-foliage');
  const matBlade = inject(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, flatShading: false, side: THREE.DoubleSide }), uniforms, SWAY, 'catnat-blade');
  const matBird = inject(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, flatShading: true, side: THREE.DoubleSide }), uniforms, FLAP, 'catnat-bird', true, HEAD + 'attribute float aFlap;\n');
  const matEye = new THREE.MeshStandardMaterial({ color: 0xfff2b8, emissive: 0xffdb52, emissiveIntensity: 2.6, roughness: 0.35, side: THREE.DoubleSide });
  matEye.toneMapped = false;                       // the eyes must survive ACES at night
  // 0.72 so the municipal koi read through the surface
  const matWater = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.15, transparent: true, opacity: 0.72 });
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  inject(depthMat, uniforms, SWAY, 'catnat-depth', false);

  // ── hero props (also reserves their footprints in the planner) ────────────
  // Architecture runs first (main.js order), so its colliders are the "do not
  // plant here" set: no more bushes in stucco walls or topiary on the kerb.
  PL.setObstacles(ctx.colliders || []);
  // ── building footprints: interiors + oriented wall boxes ──────────────────
  // Circles alone never described a shop. catArchitecture is created BEFORE us
  // (main.js order), so its rooms already exist here and nothing is planted
  // inside one — or within 1.5 u of one. `world:ready` repeats the test on the
  // built instances, for seedItems (which bypass the ground test) and for any
  // box a later system registers.
  const archRects = () => {
    const out = [];
    for (const r of ctx.systems.catArchitecture?.interiors || []) {
      const q = PL.rectOf(r, true); if (q) out.push(q);     // rooms use the opposite yaw handedness
    }
    return out;
  };
  const boxRects = (list, skip0 = -1, skip1 = -1) => {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (i >= skip0 && i < skip1) continue;                 // my own hedges
      const c = list[i];
      if (!c || !c.box || !(c.w > 0) || !(c.d > 0) || c.x < 12) continue;   // Cat Island only
      const q = PL.rectOf(c); if (q) out.push(q);
    }
    return out;
  };
  const nRects = PL.setBuildingRects(archRects().concat(boxRects(ctx.colliders || [])));
  const planner = PL.createPlanner('cat-nature');
  const props = buildProps(planner, rng(hash('cat-nature-props')));

  const propMesh = new THREE.Mesh(props.geo, matFoliage);
  propMesh.name = 'cat_nature_props';
  propMesh.castShadow = true; propMesh.receiveShadow = true;
  propMesh.customDepthMaterial = depthMat;
  group.add(propMesh);

  const waterMesh = new THREE.Mesh(props.water, matWater);
  waterMesh.name = 'cat_nature_water'; waterMesh.receiveShadow = true;
  group.add(waterMesh);

  let signMesh = null;
  if (props.signGeo && props.signCanvas) {
    const tex = new THREE.CanvasTexture(props.signCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    signMesh = new THREE.Mesh(props.signGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 }));
    signMesh.name = 'cat_nature_signs';
    signMesh.castShadow = false; signMesh.receiveShadow = true;
    group.add(signMesh);
  }

  // ═══ species ══════════════════════════════════════════════════════════════
  const Z = (gen, o) => ({ gen, ...o });
  const { genBlob, genRing, genPath, genShore, genRows } = PL;
  const LM = world.LANDMARKS;
  const ringOf = (id, a, b, count, extra) => Z(genRing, { x: LM[id].x, z: LM[id].z, r0: LM[id].r * a, r1: LM[id].r * b, count, ...extra });

  // ── conifer thinning around the seaside cores ─────────────────────────────
  // The arrivals pier, Welcome Plaza and Purrliament Square were ringed by dark
  // spires that ate the foreground and killed the Mediterranean read. Inside
  // 14 u of those three cores only ~40% of cypress/pine candidates survive; the
  // planner then spends the rest of the count further out, and low planting
  // (lavender / oleander / agave, below) takes the ground they used to hold.
  const THIN_CORES = [[42, 22], [78, 18], [152, 6]];
  const THIN_R2 = 14 * 14, THIN_KEEP = 0.4;
  function spireOk(x, z) {
    for (let i = 0; i < THIN_CORES.length; i++) {
      const c = THIN_CORES[i];
      if ((x - c[0]) ** 2 + (z - c[1]) ** 2 < THIN_R2) {
        const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;   // deterministic
        return (h - Math.floor(h)) < THIN_KEEP;
      }
    }
    return true;
  }

  const SPECIES = [
    { // ── cypress: the formal spires along every road and round the square ──
      name: 'cypress', geo: G.gCypress, mat: matFoliage, radius: 2.0, sink: 0.25, cast: true,
      scale: [0.66, 1.32], tilt: 0.035, sway: 0.016, tints: [0x2f5d3a, 0x356640, 0x2a5535, 0x3a6b42, 0x46774a],
      test: spireOk,
      tiers: [[0.6, 0.82], [0.88, 1.1], [1.16, 1.4]],
      collide: 0.55, zones: [
        Z(genPath, { id: 'cat_main', t0: 0.06, t1: 0.98, off: [4.2, 7.0], count: 58, jit: 1.4 }),
        ringOf('town_square', 0.86, 1.28, 24),
        Z(genPath, { id: 'cat_lighthouse', off: [3.6, 6.5], count: 20 }),
        Z(genPath, { id: 'cat_gym', t0: 0, t1: 0.62, off: [3.8, 7.5], count: 24 }),
        Z(genBlob, { x: 166, z: -18, r0: 0, r1: 16, clumps: 4, spread: 6, count: 18 }),
        Z(genBlob, { x: 196, z: 62, r0: 0, r1: 18, clumps: 4, spread: 7, count: 18 }),
        Z(genBlob, { x: 118, z: 32, r0: 0, r1: 14, clumps: 3, spread: 6, count: 12 }),
        // ── RIDGE CLUSTER 1: the cypress stand on the crest (h 7.3 at 134,−4) ──
        Z(genRing, { x: 140, z: -6, r0: 0, r1: 6.8, count: 20, pack: 0.5, tries: 60 }),
      ],
    },
    { // ── umbrella pines: tall spires, NOT a green wall ────────────────────
      // pathMargin 7 keeps every trunk ≥ 8.5 u off the park path centreline,
      // and `test` holds them out of the sightlines to the three hero props.
      name: 'pine', geo: G.gPine, mat: matFoliage, radius: 2.8, sink: 0.3, cast: true, pathMargin: 7,
      scale: [0.8, 1.12], tilt: 0.04, sway: 0.013, tints: [0x4b7f45, 0x568a4a, 0x42733f, 0x5c8f4e],
      test: (x, z) => {
        if (!spireOk(x, z)) return false;
        for (const [k, pad] of [['feather', 14], ['pond', 7], ['maze', 7]]) {
          const m = props.meta[k]; if (!m) continue;
          if (Math.hypot(x - m.x, z - m.z) < (m.r || 0) + pad) return false;
        }
        return true;
      },
      collide: 0.8, zones: [
        Z(genBlob, { x: 158, z: -28, r0: 0, r1: 15, clumps: 5, spread: 9, count: 12 }),
        Z(genBlob, { x: 116, z: -44, r0: 0, r1: 15, clumps: 5, spread: 9, count: 12 }),
        Z(genBlob, { x: 178, z: 14, r0: 0, r1: 17, clumps: 5, spread: 9, count: 13 }),
        Z(genBlob, { x: 86, z: -8, r0: 0, r1: 18, clumps: 5, spread: 9, count: 14 }),
        Z(genBlob, { x: 210, z: 8, r0: 0, r1: 18, clumps: 4, spread: 9, count: 12 }),
        Z(genBlob, { x: 136, z: 40, r0: 0, r1: 18, clumps: 4, spread: 9, count: 12 }),
        Z(genBlob, { x: 230, z: -46, r0: 0, r1: 16, clumps: 4, spread: 8, count: 10 }),
        Z(genBlob, { x: 154, z: 74, r0: 0, r1: 16, clumps: 4, spread: 8, count: 11 }),
        Z(genBlob, { x: 96, z: 30, r0: 0, r1: 16, clumps: 4, spread: 8, count: 10 }),
        Z(genBlob, { x: 188, z: -84, r0: 0, r1: 15, clumps: 4, spread: 8, count: 10 }),
        Z(genRing, { x: 140, z: -58, r0: 33, r1: 42, count: 12, tries: 20 }),
      ],
    },
    { // ── olive groves on Whisker Heights ───────────────────────────────────
      name: 'olive', geo: G.gOlive, mat: matFoliage, radius: 1.9, sink: 0.2, cast: true,
      // silvery-sage crowns, cool and desaturated, against the warm ochre
      // boulders sharing the same ground — that contrast IS the grove
      scale: [0.7, 1.6], tilt: 0.07, sway: 0.02, hueJit: 0.07, lumJit: 0.085,
      // THREE SIZE TIERS. Round 3: "palms and olives repeat at one scale on an
      // even grid". A grove is old trees, replacements and saplings, and the
      // tier lottery is per instance, so a ruled row still gets three heights.
      tiers: [[0.58, 0.78], [0.86, 1.12], [1.24, 1.62]],
      // mid-DARK silvery sage. Lighter than this and the aerial turns the grove
      // into a carpet of pale lumps that reads as rubble, which is exactly what
      // the round-2 critics saw on Whisker Heights.
      tints: [0x7d9a7e, 0x8aa889, 0x6f8b72, 0x96b094, 0x628068, 0x8a9968],
      collide: 0.5, zones: [
        // bigger grids than the wanted count, so a rejected slot costs a TREE,
        // not the whole row: the terraces are the grove's charm
        // shorter, wider-spaced ruled runs — a terrace is 4 or 5 trees long,
        // not a nine-by-six plantation — and CLUMPS carry most of the count now
        Z(genRows, { x: 152, z: 56, rot: 0.42, cols: 6, rows: 4, gapX: 5.2, gapZ: 5.0, jit: 1.5, count: 16 }),
        Z(genRows, { x: 198, z: 74, rot: -0.35, cols: 6, rows: 4, gapX: 5.2, gapZ: 5.0, jit: 1.5, count: 16 }),
        Z(genRows, { x: 206, z: 40, rot: 0.9, cols: 6, rows: 3, gapX: 5.2, gapZ: 5.2, jit: 1.5, count: 13 }),
        Z(genRows, { x: 160, z: 26, rot: -0.2, cols: 5, rows: 3, gapX: 5.4, gapZ: 5.2, jit: 1.5, count: 12 }),
        ringOf('residential', 0.6, 1.25, 16),      // thinner ring: the ground needs to show
        Z(genBlob, { x: 178, z: -40, r0: 0, r1: 14, clumps: 3, spread: 6, count: 12 }),
        // broken clumps between the ruled rows, so Whisker Heights is not a grid
        Z(genBlob, { x: 192, z: 70, r0: 0, r1: 14, clumps: 4, spread: 5.5, count: 16 }),
        Z(genBlob, { x: 156, z: 34, r0: 0, r1: 12, clumps: 4, spread: 5.0, count: 14 }),
        Z(genBlob, { x: 206, z: 62, r0: 0, r1: 13, clumps: 4, spread: 4.6, count: 13 }),
        Z(genBlob, { x: 150, z: 40, r0: 0, r1: 13, clumps: 3, spread: 4.4, count: 10 }),
        // ── RIDGE CLUSTER 2: the terraces behind props.js's dry-stone walls ──
        Z(genRows, { x: 150, z: -30, rot: 0.25, cols: 6, rows: 3, gapX: 4.6, gapZ: 6.5, jit: 1.2, count: 15, tries: 40 }),
      ],
    },
    { // ── palms on the beaches and the pier road ────────────────────────────
      name: 'palm', geo: G.gPalm, mat: matBlade, radius: 2.3, sink: 0.2, cast: true, minH: 0.75,
      // three tiers + a coherent wind LEAN (some palms lie right over) + canopy
      // hue jitter: the even, same-height row along every beach was round 3's
      // "monoculture" note, and a leaning palm is half of what a beach looks like
      scale: [0.78, 1.3], tilt: 0.12, sway: 0.022, lean: 0.16, hueJit: 0.07, lumJit: 0.11,
      tiers: [[0.62, 0.8], [0.88, 1.08], [1.16, 1.42]],
      tints: [0x62a34c, 0x54964a, 0x6fae55, 0x7ab35c, 0x4d8a45, 0x86b862],
      // 3.4 u fronds at 6 u up crop the FOREGROUND of every pier and plaza
      // frame; keep 45% of them inside 12 u of those two cores.
      test: (x, z) => {
        for (const c of [[42, 22], [78, 18]]) {
          if ((x - c[0]) ** 2 + (z - c[1]) ** 2 < 144) {
            const h = Math.sin(x * 45.164 + z * 23.113) * 24634.6345;
            return (h - Math.floor(h)) < 0.45;
          }
        }
        return true;
      },
      collide: 0.5, zones: [
        // GROVES WITH GAPS: narrow arcs of shoreline with bare strand between
        // them, instead of four long evenly-filled bands
        Z(genShore, { a0: 1.72, a1: 1.98, inset: [1.5, 9], count: 8, tries: 30 }),
        Z(genShore, { a0: 2.12, a1: 2.34, inset: [1.5, 9], count: 7, tries: 30 }),
        Z(genShore, { a0: 2.42, a1: 2.56, inset: [1.5, 8], count: 4, tries: 30 }),
        Z(genShore, { a0: 3.82, a1: 4.06, inset: [1.5, 9], count: 7, tries: 30 }),
        Z(genShore, { a0: 4.18, a1: 4.42, inset: [1.5, 9], count: 6, tries: 30 }),
        Z(genShore, { a0: 4.54, a1: 4.7, inset: [1.5, 8], count: 5, tries: 30 }),
        Z(genShore, { a0: -0.48, a1: -0.24, inset: [1.5, 10], count: 7, tries: 30 }),
        Z(genShore, { a0: -0.12, a1: 0.1, inset: [1.5, 10], count: 6, tries: 30 }),
        Z(genShore, { a0: 0.22, a1: 0.44, inset: [1.5, 10], count: 6, tries: 30 }),
        Z(genShore, { a0: 2.94, a1: 3.12, inset: [1.5, 8], count: 5, tries: 30 }),
        Z(genShore, { a0: 3.26, a1: 3.44, inset: [1.5, 8], count: 5, tries: 30 }),
        Z(genPath, { id: 'cat_harbor', off: [3.6, 6.2], count: 16, jit: 1.2 }),
        ringOf('cat_dock', 1.1, 2.1, 12),
      ],
    },
    { // ── bougainvillea spilling over the town walls ────────────────────────
      name: 'bougainvillea', geo: G.gBougainvillea, mat: matFoliage, radius: 1.15, sink: 0.15, cast: true,
      scale: [0.8, 1.5], tilt: 0.08, sway: 0.035, tints: [0xd4308f, 0xe8551f, 0xf0632a, 0xc92a7e, 0xf6e8dc],
      collide: 0.78,       // ~70% of the visual mound; you push past it, not through
      zones: [
        ringOf('town_square', 0.58, 0.95, 26),
        ringOf('main_street', 0.57, 0.9, 26),
        ringOf('meow_donalds', 0.6, 1.0, 16),
        ringOf('residential', 0.57, 0.9, 26),
        ringOf('welcome_plaza', 0.62, 1.1, 16),
        ringOf('fish_harbor', 0.62, 1.1, 14),
        Z(genPath, { id: 'cat_main', t0: 0.3, t1: 0.9, off: [3.4, 5.2], count: 20, jit: 1.0 }),
      ],
    },
    { // ── lavender rows ─────────────────────────────────────────────────────
      name: 'lavender', geo: G.gLavender, mat: matBlade, radius: 0.5, pack: 0.8, sink: 0.06,
      scale: [0.85, 1.5], tilt: 0.1, sway: 0.09, tints: [0x8e6bd4, 0x7a5bc0, 0xa07ee0, 0x6f53b4],
      seedItems: (meta) => (meta.mazeAccents || []).filter((_, i) => i % 2 === 0),
      zones: [
        Z(genRows, { x: 166, z: 62, rot: 0.42, cols: 12, rows: 4, gapX: 1.5, gapZ: 2.6, jit: 0.4, count: 44 }),
        Z(genRows, { x: 192, z: 34, rot: -0.5, cols: 12, rows: 4, gapX: 1.5, gapZ: 2.6, jit: 0.4, count: 44 }),
        Z(genRows, { x: 128, z: -46, rot: 0.9, cols: 10, rows: 3, gapX: 1.5, gapZ: 2.4, jit: 0.4, count: 30 }),
        Z(genRows, { x: 209, z: 24, rot: 0.1, cols: 10, rows: 3, gapX: 1.5, gapZ: 2.4, jit: 0.4, count: 28 }),
        Z(genRows, { x: 96, z: 34, rot: 1.2, cols: 10, rows: 3, gapX: 1.5, gapZ: 2.5, jit: 0.4, count: 28 }),
        // seaside beds replacing the thinned spires at the pier and the plaza
        ringOf('cat_dock', 1.0, 2.1, 44),
        ringOf('welcome_plaza', 0.72, 1.22, 52),
        ringOf('town_square', 0.7, 1.0, 34),
        Z(genPath, { id: 'cat_main', t0: 0.0, t1: 0.4, off: [2.8, 5.4], count: 34, jit: 0.8 }),
        Z(genPath, { id: 'cat_lighthouse', off: [2.6, 4.2], count: 34, jit: 0.8 }),
        ringOf('cat_park', 0.95, 1.25, 40),
        Z(genBlob, { x: 172, z: 34, r0: 0, r1: 10, clumps: 3, spread: 4, count: 24 }),
        // low Mediterranean planting where the conifers used to stand
        ringOf('cat_dock', 0.9, 2.0, 38),
        ringOf('welcome_plaza', 0.72, 1.15, 40),
        ringOf('town_square', 0.66, 0.98, 34),
        // ── RIDGE CLUSTER 3: the lavender half of the ridge block, behind its
        // dry-stone kerb at 135,15 ─────────────────────────────────────────
        Z(genRows, { x: 135, z: 20.5, rot: 0.1, cols: 11, rows: 4, gapX: 1.5, gapZ: 2.5, jit: 0.4, count: 38 }),
        // and the feet of the terrace walls at 150,−24
        Z(genRows, { x: 150, z: -30, rot: 0.25, cols: 12, rows: 4, gapX: 1.6, gapZ: 6.5, jit: 0.5, count: 34 }),
      ],
    },
    { // ── sunflower patches (all heads facing the same way) ─────────────────
      name: 'sunflower', geo: G.gSunflower, mat: matBlade, radius: 0.62, pack: 0.85, sink: 0.05,
      scale: [0.9, 1.5], tilt: 0.08, sway: 0.05, rot: 'sun', tints: [0xf7c325, 0xfbd34a, 0xefb015],
      zones: [
        Z(genBlob, { x: 88, z: 44, r0: 0, r1: 12, clumps: 4, spread: 5, count: 46 }),
        Z(genBlob, { x: 170, z: -22, r0: 0, r1: 11, clumps: 4, spread: 5, count: 40 }),
        Z(genBlob, { x: 206, z: 58, r0: 0, r1: 12, clumps: 4, spread: 5, count: 38 }),
        Z(genBlob, { x: 124, z: -78, r0: 0, r1: 11, clumps: 3, spread: 5, count: 30 }),
        // the sunflower half of the ridge block, east of the lavender rows
        Z(genBlob, { x: 144, z: 21, r0: 0, r1: 7.0, clumps: 3, spread: 3.4, count: 32, tries: 30 }),
      ],
    },
    { // ── agave / succulents on the dry ground by the gym ───────────────────
      name: 'agave', geo: G.gAgave, mat: matBlade, radius: 0.95, sink: 0.08,
      // 0.5–2.0 with a squash and a per-instance roll: the old 0.6–1.7 range on
      // a 9-blade star read as one tan prop stamped sixty times. The rosette
      // geometry does the rest (see G.gAgave).
      scale: [0.45, 1.5], squash: [0.8, 1.22], tilt: 0.17, sway: 0.02, hueJit: 0.06, lumJit: 0.1,
      tints: [0x5d9480, 0x51897a, 0x6aa28c, 0x468170, 0x74aa93, 0x5b9284],
      collide: 0.46,
      zones: [
        ringOf('cat_gym', 0.62, 1.7, 26),
        Z(genBlob, { x: 228, z: -6, r0: 4, r1: 20, clumps: 5, spread: 6, count: 26 }),
        Z(genPath, { id: 'cat_gym', t0: 0.45, t1: 1, off: [3.0, 6.5], count: 18 }),
        Z(genBlob, { x: 224, z: 46, r0: 0, r1: 14, clumps: 3, spread: 6, count: 14 }),
        Z(genBlob, { x: 248, z: -18, r0: 0, r1: 16, clumps: 5, spread: 6, count: 22 }),
        Z(genBlob, { x: 250, z: 12, r0: 0, r1: 14, clumps: 4, spread: 6, count: 16 }),
        // NOT-AN-EXIT BEACH — tight clumps down onto the dry sand, three of them
        // at different sizes, so the rosettes read as a colony and not a grid
        Z(genBlob, { x: 258, z: -10, r0: 0, r1: 11, clumps: 4, spread: 3.4, count: 16, minH: 0.5 }),
        Z(genBlob, { x: 254, z: 2, r0: 0, r1: 9, clumps: 3, spread: 3.0, count: 11, minH: 0.5 }),
        Z(genBlob, { x: 256, z: -22, r0: 0, r1: 10, clumps: 3, spread: 3.2, count: 11, minH: 0.5 }),
        // tight clumps instead of an even carpet on the heights + the gym scree
        Z(genBlob, { x: 192, z: 58, r0: 0, r1: 16, clumps: 4, spread: 4.2, count: 20 }),
        Z(genBlob, { x: 204, z: -32, r0: 3, r1: 15, clumps: 4, spread: 4.0, count: 18 }),
        // dry seaside planting where the pier and plaza conifers were thinned
        ringOf('cat_dock', 1.0, 2.2, 18),
        ringOf('welcome_plaza', 0.78, 1.2, 16),
      ],
    },
    { // ── flowering agave: the vertical accent, ~1 in 6 of the colony ───────
      name: 'agaveBloom', geo: G.gAgaveBloom, mat: matBlade, radius: 1.15, sink: 0.08, cast: true,
      scale: [0.72, 1.35], tilt: 0.06, sway: 0.02, hueJit: 0.05,
      tints: [0x5d9480, 0x51897a, 0x6aa28c, 0x74aa93],
      collide: 0.5,
      zones: [
        Z(genBlob, { x: 258, z: -10, r0: 0, r1: 12, clumps: 3, spread: 4.0, count: 5, minH: 0.5 }),
        Z(genBlob, { x: 255, z: -22, r0: 0, r1: 10, clumps: 2, spread: 3.5, count: 3, minH: 0.5 }),
        Z(genBlob, { x: 228, z: -6, r0: 4, r1: 18, clumps: 3, spread: 5, count: 4 }),
        ringOf('cat_gym', 0.8, 1.6, 4),
        Z(genBlob, { x: 248, z: -18, r0: 0, r1: 14, clumps: 3, spread: 5, count: 4 }),
      ],
    },
    { // ── marram: beach grass mixed through the agave colonies ──────────────
      name: 'marram', geo: G.gMarram, mat: matBlade, radius: 0.34, pack: 0.55, sink: 0.05, minH: 0.32,
      scale: [0.8, 1.7], tilt: 0.2, sway: 0.15, lean: 0.34,
      tints: [0xcfc887, 0xd8d296, 0xbdb977, 0xc6cf8c, 0xe0d7a2],
      zones: [
        Z(genBlob, { x: 258, z: -10, r0: 0, r1: 14, clumps: 6, spread: 4.4, count: 70, minH: 0.32 }),
        Z(genBlob, { x: 254, z: 4, r0: 0, r1: 12, clumps: 5, spread: 4.0, count: 46, minH: 0.32 }),
        Z(genBlob, { x: 256, z: -24, r0: 0, r1: 12, clumps: 5, spread: 4.0, count: 46, minH: 0.32 }),
        Z(genShore, { a0: -0.62, a1: 0.62, inset: [0.6, 8], count: 60, tries: 18, minH: 0.32 }),
        // and the north-coast strand under the new bluff outcrops
        Z(genShore, { a0: 4.05, a1: 5.35, inset: [0.8, 9], count: 60, tries: 18, minH: 0.32 }),
      ],
    },
    { // ── oleander hedges lining the roads ──────────────────────────────────
      name: 'oleander', geo: G.gOleander, mat: matFoliage, radius: 1.05, pack: 0.62, sink: 0.15, cast: true,
      scale: [0.96, 1.07], tilt: 0.012, sway: 0.03, rot: 'path', tints: [0xf2a0c0, 0xf7bfd2, 0xfad7e2, 0xf0849f, 0xfaf0dc],
      // a hedge is a WALL: one oriented box per bush (2.8 × 1.2 local), so a run
      // of them is solid along its length and thin across it
      collideBox: [2.85, 1.25],
      zones: [
        Z(genPath, { id: 'cat_gym', t0: 0.05, t1: 0.95, off: [3.2, 4.0], count: 30, jit: 0.5 }),
        Z(genPath, { id: 'cat_park', t0: 0.1, t1: 0.95, off: [3.0, 3.9], count: 34, jit: 0.5 }),
        Z(genPath, { id: 'cat_harbor', off: [3.1, 4.0], count: 18, jit: 0.5 }),
        Z(genPath, { id: 'cat_main', t0: 0.55, t1: 1, off: [3.6, 4.6], count: 22, jit: 0.5 }),
        ringOf('residential', 0.62, 1.1, 24),
        // low green mass at the three thinned cores (kept off the paving)
        Z(genPath, { id: 'cat_main', t0: 0.0, t1: 0.42, off: [3.8, 5.0], count: 20, jit: 0.5 }),
        ringOf('welcome_plaza', 0.82, 1.18, 10),
        ringOf('town_square', 0.72, 1.0, 10),
      ],
    },
    { // ── tall grass everywhere: the density workhorse ──────────────────────
      name: 'grass', geo: G.gGrass, mat: matBlade, radius: 0.36, pack: 0.55, sink: 0.04, minH: 0.85,
      scale: [0.75, 1.5], tilt: 0.14, sway: 0.16, lean: 0.3, tints: [0x9fd166, 0x8cc158, 0xb9d977, 0x7fae4c, 0xd3cd7a, 0xc2c46b],
      zones: [
        Z(genRing, { x: 150, z: 0, r0: 18, r1: 112, count: 290, tries: 24 }),
        Z(genBlob, { x: 188, z: -64, r0: 0, r1: 22, clumps: 8, spread: 7, count: 90 }),
        Z(genBlob, { x: 140, z: -58, r0: 16, r1: 32, clumps: 8, spread: 8, count: 70 }),
        Z(genBlob, { x: 218, z: 30, r0: 6, r1: 22, clumps: 6, spread: 6, count: 55 }),
        Z(genBlob, { x: 110, z: 78, r0: 0, r1: 20, clumps: 6, spread: 7, count: 55 }),
        Z(genBlob, { x: 80, z: 46, r0: 0, r1: 20, clumps: 7, spread: 8, count: 70 }),
        Z(genBlob, { x: 142, z: 74, r0: 0, r1: 18, clumps: 7, spread: 8, count: 65 }),
        Z(genBlob, { x: 200, z: 78, r0: 0, r1: 16, clumps: 5, spread: 8, count: 45 }),
        Z(genBlob, { x: 92, z: 12, r0: 0, r1: 18, clumps: 6, spread: 8, count: 55 }),
        Z(genBlob, { x: 66, z: -20, r0: 0, r1: 22, clumps: 6, spread: 7, count: 55 }),
        Z(genBlob, { x: 244, z: -22, r0: 0, r1: 20, clumps: 7, spread: 7, count: 70 }),
        Z(genBlob, { x: 246, z: 18, r0: 0, r1: 18, clumps: 5, spread: 7, count: 45 }),
        Z(genPath, { id: 'cat_main', off: [2.6, 6.0], count: 60, jit: 1.6 }),
        Z(genPath, { id: 'cat_park', off: [2.4, 6.0], count: 50, jit: 1.6 }),
        Z(genPath, { id: 'cat_gym', off: [2.4, 6.0], count: 40, jit: 1.6 }),
        // planting BETWEEN the new north-bluff outcrops
        Z(genBlob, { x: 132, z: -77, r0: 0, r1: 16, clumps: 8, spread: 5.5, count: 80, minH: 0.5 }),
        Z(genBlob, { x: 148, z: -77, r0: 0, r1: 15, clumps: 7, spread: 5.5, count: 65, minH: 0.5 }),
        Z(genBlob, { x: 118, z: -68, r0: 0, r1: 14, clumps: 6, spread: 5.0, count: 50, minH: 0.5 }),
      ],
    },
    { // ── wildflower meadows in three colours ───────────────────────────────
      name: 'wildflower', geo: G.gWildflower, mat: matBlade, radius: 0.3, pack: 0.6, sink: 0.03,
      scale: [0.85, 1.55], tilt: 0.18, sway: 0.14, tints: [0xf2c14e, 0xe8556d, 0xf7d9a0, 0xf2a0c0, 0xe8556d, 0xff9a3c, 0xf2c14e, 0xd4308f],
      zones: [
        Z(genBlob, { x: 130, z: 30, r0: 0, r1: 20, clumps: 7, spread: 6, count: 90 }),
        Z(genBlob, { x: 168, z: -46, r0: 0, r1: 18, clumps: 6, spread: 6, count: 80 }),
        Z(genBlob, { x: 196, z: 10, r0: 0, r1: 20, clumps: 7, spread: 6, count: 80 }),
        Z(genBlob, { x: 84, z: 4, r0: 0, r1: 20, clumps: 6, spread: 6, count: 70 }),
        Z(genBlob, { x: 76, z: 48, r0: 0, r1: 18, clumps: 6, spread: 6, count: 55 }),
        Z(genBlob, { x: 162, z: 76, r0: 0, r1: 16, clumps: 6, spread: 6, count: 50 }),
        Z(genBlob, { x: 118, z: -70, r0: 0, r1: 20, clumps: 6, spread: 6, count: 70 }),
        Z(genBlob, { x: 212, z: -50, r0: 0, r1: 18, clumps: 6, spread: 6, count: 60 }),
        Z(genRing, { x: 150, z: 0, r0: 24, r1: 108, count: 120, tries: 20 }),
        // the bluff again: colour between the rocks, not a bald green cap
        Z(genBlob, { x: 134, z: -76, r0: 0, r1: 15, clumps: 6, spread: 5, count: 55, minH: 0.5 }),
        Z(genBlob, { x: 148, z: -74, r0: 0, r1: 13, clumps: 5, spread: 5, count: 40, minH: 0.5 }),
      ],
    },
    // ── CATNIP COMMONS: the herb mass, in three heights ─────────────────────
    // The bed itself (mulch plate, worn path, trampled hollow) is authored in
    // props.js as `meta.bed`; these three species are the planting on it.
    // `bedRim` is a rim-weighted generator — r ∝ u^0.42 puts ~65% of the count
    // in the outer third — and `bedOk` refuses the worn spur and the hollow, so
    // the path is trodden through the mass rather than drawn on top of it.
    ...(() => {
      const bed = props.meta.bed;
      const bedRim = (rand, o) => () => {
        const a = rand() * TAU;
        const r = (o.r0 ?? 0) + Math.pow(rand(), o.bias ?? 0.42) * ((o.r1 ?? 12) - (o.r0 ?? 0));
        return { x: bed.x + Math.cos(a) * r, z: bed.z + Math.sin(a) * r * 0.94 };
      };
      const bedOk = (x, z) => bed.worn(x, z) < 0.12;         // deep planting only
      const bedFringe = (x, z) => bed.worn(x, z) < 0.55;     // may fringe the path
      // mid silvery-sage, NOT the pale lime the first pass used: a bed of this
      // under midday sun went white and read as lilac gravel
      const TINTS = [0x8ea47c, 0x9db287, 0x7e9a6e, 0xa4b892, 0x86a074, 0x93ab7e];
      const common = { mat: matBlade, tints: TINTS, hueJit: 0.04, lumJit: 0.07, sway: 0.1 };
      return [
        { // waist-high flowering catnip: the mass, thickest against the rim
          name: 'catnipTall', geo: G.gCatnipTall, radius: 0.36, pack: 0.46, sink: -0.04,
          scale: [0.85, 1.25], tilt: 0.11, lean: 0.16, ...common, test: bedOk,
          zones: [
            Z(bedRim, { r0: 3.2, r1: bed.r + 0.6, count: 300, tries: 44 }),
            // the NORTH-EAST drift: the lawn between the bandstand and the maze,
            // which is the ground the cat_park camera actually sees past the
            // bandstand roof
            Z(genBlob, { x: 153, z: -49, r0: 0, r1: 10, clumps: 5, spread: 4.4, count: 60, tries: 30 }),
            Z(genBlob, { x: 130, z: -78, r0: 0, r1: 11, clumps: 4, spread: 5, count: 26 }),
            Z(genBlob, { x: 164, z: -70, r0: 0, r1: 12, clumps: 4, spread: 5, count: 30 }),
          ],
        },
        { name: 'catnip', geo: G.gCatnip, radius: 0.27, pack: 0.42, sink: -0.03,
          scale: [0.9, 1.5], tilt: 0.14, lean: 0.2, ...common, test: bedOk,
          seedItems: (meta) => (meta.corridorSpots || []).filter((_, i) => i % 3 === 0),
          zones: [
            Z(bedRim, { r0: 2.4, r1: bed.r + 1.4, count: 340, tries: 40, bias: 0.5 }),
            Z(genBlob, { x: 154, z: -50, r0: 0, r1: 11, clumps: 5, spread: 4.6, count: 70, tries: 30 }),
            Z(genBlob, { x: 140, z: -58, r0: 14, r1: 30, clumps: 12, spread: 8, count: 120 }),
            Z(genBlob, { x: 128, z: -80, r0: 0, r1: 14, clumps: 4, spread: 6, count: 34 }),
            Z(genBlob, { x: 164, z: -70, r0: 0, r1: 14, clumps: 4, spread: 6, count: 30 }),
          ],
        },
        { name: 'catnipLow', geo: G.gCatnipLow, radius: 0.21, pack: 0.38, sink: -0.02,
          scale: [0.8, 1.45], tilt: 0.2, lean: 0.3, ...common, sway: 0.13, test: bedFringe,
          // the low tier is the ONLY one allowed near the worn ground: it is
          // what a trampled edge looks like
          zones: [
            Z(bedRim, { r0: 1.0, r1: bed.r + 2.2, count: 300, tries: 34, bias: 0.7 }),
            Z(genBlob, { x: 152, z: -48, r0: 0, r1: 11, clumps: 5, spread: 4.6, count: 55, tries: 28 }),
            Z(genBlob, { x: 140, z: -58, r0: 15, r1: 30, clumps: 9, spread: 7, count: 70 }),
          ],
        },
      ];
    })(),
    { // ── boulders, shape 2: the angular tipped slab ────────────────────────
      // Three rock MESHES, not one: round 3 read a single rounded silhouette
      // repeated at every size as "flat khaki blobs with hard seams".
      name: 'boulderSlab', geo: G.gBoulderSlab, mat: matFoliage, radius: 1.5, sink: 0.3, cast: true, minH: 0.5, maxSlope: 0.95,
      scale: [0.5, 1.7], squash: [0.55, 1.1], tilt: 0.24, sway: 0, rot: 'ground', hueJit: 0.07,
      tints: [0xcaa165, 0xd9b87c, 0xb88b52, 0xc19660, 0xa87d48],
      collide: 0.78, collideMin: 0.9,
      zones: [
        ringOf('lighthouse', 0.8, 2.5, 12),
        Z(genBlob, { x: 188, z: -64, r0: 3, r1: 22, clumps: 5, spread: 6, count: 12 }),
        Z(genBlob, { x: 130, z: -76, r0: 1, r1: 13, clumps: 4, spread: 4.6, count: 8 }),
        Z(genBlob, { x: 228, z: -6, r0: 4, r1: 18, clumps: 3, spread: 6, count: 7 }),
        Z(genBlob, { x: 182, z: 56, r0: 0, r1: 18, clumps: 4, spread: 5.0, count: 7 }),
        Z(genBlob, { x: 147, z: -16, r0: 0, r1: 5.4, clumps: 3, spread: 2.6, count: 6, tries: 40 }),  // ridge apron
        Z(genShore, { a0: 0, a1: TAU, inset: [-1.6, 3.2], count: 14, minH: 0.3 }),
      ],
    },
    { // ── boulders, shape 3: the split stack with a crevice ─────────────────
      name: 'boulderStack', geo: G.gBoulderStack, mat: matFoliage, radius: 1.7, sink: 0.34, cast: true, minH: 0.5, maxSlope: 0.95,
      scale: [0.55, 1.9], squash: [0.55, 1.05], tilt: 0.18, sway: 0, rot: 'ground', hueJit: 0.06,
      tints: [0xcaa165, 0xd9b87c, 0xb88b52, 0xe0c68f, 0xd0a878],
      collide: 0.86, collideMin: 0.8,
      zones: [
        ringOf('lighthouse', 0.7, 2.4, 10),
        Z(genBlob, { x: 188, z: -64, r0: 3, r1: 22, clumps: 5, spread: 6, count: 10 }),
        Z(genBlob, { x: 146, z: -78, r0: 1, r1: 13, clumps: 4, spread: 4.6, count: 8 }),
        Z(genRing, { x: 100, z: 58, r0: 6, r1: 19, count: 8, tries: 30, minH: 1.6, maxH: 3.4, maxSlope: 1.0, pathMargin: 1.0 }),
        Z(genBlob, { x: 166, z: 36, r0: 0, r1: 14, clumps: 4, spread: 4.4, count: 6 }),
        Z(genBlob, { x: 147, z: -16, r0: 0, r1: 5.6, clumps: 3, spread: 2.8, count: 5, tries: 40 }),  // ridge apron
        Z(genRing, { x: 150, z: 0, r0: 30, r1: 105, count: 6, tries: 20 }),
      ],
    },
    { // ── scree: the broken-stone skirt every outcrop sheds downhill ────────
      // radius 0.34: scree is loose stone lying ON the ground and must be able
      // to gather at the foot of a boulder and under a cypress. At the species
      // radius the rocks use (1.6–2.0) the planner's exclusion discs swallowed
      // the whole apron and it placed 1 stone out of 44.
      name: 'scree', geo: G.gScree, mat: matFoliage, radius: 0.34, pack: 0.45, sink: 0.12, minH: 0.2, maxSlope: 1.0, rot: 'ground',
      scale: [0.55, 1.45], tilt: 0.22, sway: 0, hueJit: 0.06, lumJit: 0.12,
      tints: [0xc9a06a, 0xd6b482, 0xb08a58, 0xdcc096, 0xa8804c],
      zones: [
        Z(genRing, { x: 132, z: -78, r0: 5, r1: 16, count: 40, tries: 22 }),
        Z(genRing, { x: 148, z: -76, r0: 4, r1: 14, count: 30, tries: 22 }),
        Z(genRing, { x: 188, z: -64, r0: 8, r1: 24, count: 36, tries: 20 }),
        Z(genRing, { x: 228, z: -6, r0: 5, r1: 20, count: 26, tries: 20 }),
        ringOf('lighthouse', 0.7, 2.7, 30),
        // ── RIDGE CLUSTER 4: the scree apron off the crest's shoulder ───────
        Z(genBlob, { x: 147, z: -16, r0: 0, r1: 5.4, clumps: 4, spread: 2.6, count: 46, tries: 28 }),
        Z(genRing, { x: 178, z: 48, r0: 22, r1: 33, count: 24, tries: 20 }),
        Z(genRing, { x: 100, z: 58, r0: 7, r1: 20, count: 22, tries: 22, minH: 0.25, maxSlope: 1.0 }),
        Z(genShore, { a0: 4.05, a1: 5.35, inset: [0.8, 6], count: 24, minH: 0.3, tries: 18 }),
      ],
    },
    { // ── boulders on the bluffs ────────────────────────────────────────────
      name: 'boulder', geo: G.gBoulder, mat: matFoliage, radius: 1.6, sink: 0.35, cast: true, minH: 0.5, maxSlope: 0.95,
      // 0.45–2.3 with a squash and a wide warm-hue jitter: rounded WARM rock,
      // never the same grey lump at the same size twice
      scale: [0.45, 2.3], squash: [0.48, 1.05], tilt: 0.22, sway: 0, rot: 'ground', hueJit: 0.07,
      tints: [0xcaa165, 0xd9b87c, 0xb88b52, 0xe0c68f, 0xc19660, 0xd0a878, 0xa87d48],
      collide: 0.82, collideMin: 0.8,     // pebbles stay walkable, rocks do not
      zones: [
        ringOf('lighthouse', 0.7, 2.6, 18),
        Z(genBlob, { x: 188, z: -64, r0: 3, r1: 22, clumps: 6, spread: 6, count: 18 }),
        Z(genShore, { a0: 0, a1: TAU, inset: [-1.6, 3.2], count: 22, minH: 0.3 }),
        Z(genBlob, { x: 228, z: -6, r0: 4, r1: 18, clumps: 4, spread: 6, count: 11 }),
        Z(genRing, { x: 150, z: 0, r0: 30, r1: 105, count: 6, tries: 20 }),
        Z(genBlob, { x: 147, z: -16, r0: 0, r1: 5.4, clumps: 3, spread: 2.6, count: 7, tries: 40 }),   // ridge apron
        // FISH HARBOR rip-rap: rounded warm boulders banked along the quay and
        // out onto the sand, in three sizes, clumped like tipped rock
        // the bank itself (h 1.6–3.4) is where terrain/decor.js lays its grey
        // quay kerb cubes: rounded warm rock banked among them reads as rip-rap
        Z(genRing, { x: 100, z: 58, r0: 6, r1: 19, count: 14, tries: 30, minH: 1.6, maxH: 3.4, maxSlope: 1.0, pathMargin: 1.0 }),
        Z(genRing, { x: 100, z: 58, r0: 7, r1: 20, count: 11, tries: 24, minH: 0.25, maxSlope: 1.0 }),
        Z(genBlob, { x: 96, z: 64, r0: 1, r1: 9, clumps: 4, spread: 3.4, count: 9, minH: 0.2, maxSlope: 1.0 }),
        Z(genBlob, { x: 106, z: 62, r0: 1, r1: 8, clumps: 3, spread: 3.2, count: 7, minH: 0.2, maxSlope: 1.0 }),
        // and warm rock clumps through the olive terraces on Whisker Heights
        Z(genBlob, { x: 182, z: 56, r0: 0, r1: 18, clumps: 5, spread: 5.0, count: 11 }),
        Z(genBlob, { x: 166, z: 36, r0: 0, r1: 14, clumps: 4, spread: 4.4, count: 8 }),
        // NORTH BLUFF — warm rock down the skyline the AD saw as a grey blockout
        Z(genBlob, { x: 130, z: -76, r0: 1, r1: 13, clumps: 5, spread: 4.6, count: 13 }),
        Z(genBlob, { x: 146, z: -78, r0: 1, r1: 13, clumps: 5, spread: 4.6, count: 11 }),
        Z(genBlob, { x: 118, z: -68, r0: 1, r1: 12, clumps: 4, spread: 4.4, count: 10 }),
      ],
    },
    { // ── headland outcrops: the big warm masses that break a bare skyline ──
      // 1.4–3.2 scale, so a run of these is 3–6 u of layered ochre rock with a
      // dark base and a lichen cap. They sit on the north bluff (the island's
      // whole northern silhouette from the sea) and around the terrain system's
      // pale bluff stone at Yarn Hill, whose grey the AD called polystyrene.
      // radius 2.0 / pack 0.75: outcrops are supposed to pile INTO each other —
      // a formation, not nine evenly spaced eggs
      name: 'outcrop', geo: G.gOutcrop, mat: matFoliage, radius: 2.0, pack: 0.74, sink: 0.5, cast: true, obsPad: 0.3,
      minH: 0.6, maxSlope: 1.0, pathMargin: 3.0,
      scale: [1.4, 3.1], squash: [0.6, 1.15], tilt: 0.16, sway: 0, rot: 'ground', hueJit: 0.05, lumJit: 0.075,
      tints: [0xd0a468, 0xdcb47e, 0xc2955a, 0xe6c894, 0xbb8f56, 0xd6ac74],
      collide: 1.0,
      tries: 44,
      zones: [
        Z(genBlob, { x: 132, z: -78, r0: 0, r1: 15, clumps: 6, spread: 5.4, count: 17 }),
        Z(genBlob, { x: 148, z: -76, r0: 0, r1: 14, clumps: 5, spread: 5.0, count: 13 }),
        Z(genBlob, { x: 120, z: -70, r0: 0, r1: 13, clumps: 5, spread: 4.8, count: 11 }),
        Z(genShore, { a0: 4.15, a1: 5.25, inset: [1.2, 8], count: 14, minH: 0.5 }),
        // and right through the grey terrain stones on Yarn Hill
        Z(genBlob, { x: 188, z: -64, r0: 8, r1: 21, clumps: 6, spread: 5.4, count: 13 }),
        Z(genBlob, { x: 228, z: -6, r0: 5, r1: 16, clumps: 3, spread: 5.0, count: 7 }),
        // the ridge apron's headstones: the crest sheds rock as well as scree
        Z(genBlob, { x: 148, z: -16, r0: 0, r1: 5.6, clumps: 3, spread: 2.8, count: 5, tries: 44 }),
      ],
    },
    { // ── seashells ─────────────────────────────────────────────────────────
      name: 'shell', geo: G.gShell, mat: matBlade, radius: 0.26, pack: 0.5, sink: 0.02, minH: 0.3, rot: 'ground',
      scale: [0.7, 1.7], tilt: 0.3, sway: 0, tints: [0xf6e6d0, 0xf0c8b0, 0xffffff, 0xe8d0bc, 0xf7dcc8],
      zones: [Z(genShore, { a0: 0, a1: TAU, inset: [-2.4, 0.6], count: 170, tries: 16 })],
    },
    { // ── driftwood ─────────────────────────────────────────────────────────
      name: 'driftwood', geo: G.gDriftwood, mat: matFoliage, radius: 1.0, sink: 0.12, minH: 0.35, cast: true, rot: 'ground',
      scale: [0.7, 1.5], tilt: 0.16, sway: 0, tints: [0xc4b39a, 0xd3c4ad, 0xb5a184],
      zones: [Z(genShore, { a0: 0, a1: TAU, inset: [-2.1, 1.2], count: 64, tries: 16 })],
    },
    { // ── scratching-post trees (cats sit on these) ─────────────────────────
      name: 'scratchpost', geo: G.gScratchPost, mat: matFoliage, radius: 1.7, sink: 0.1, cast: true,
      scale: [0.9, 1.45], tilt: 0.0, sway: 0.008, collide: 0.75, tints: [0x2a8f8a, 0xd9694a, 0x3a6ea5, 0xf2c14e],
      zones: [
        ringOf('cat_park', 0.3, 1.0, 8),
        ringOf('town_square', 0.6, 1.05, 5),
        ringOf('residential', 0.6, 1.05, 6),
        ringOf('main_street', 0.6, 0.95, 4),
        ringOf('fish_harbor', 0.65, 1.2, 3),
        ringOf('welcome_plaza', 0.7, 1.3, 3),
      ],
    },
    { // ── cardboard-box "bushes" ────────────────────────────────────────────
      name: 'boxbush', geo: G.gBoxBush, mat: matFoliage, radius: 1.1, sink: 0.08, cast: true, pathMargin: 2.2,
      scale: [0.9, 1.5], tilt: 0.03, sway: 0, tints: [0xc9a06a, 0xd6b07a, 0xb08a58, 0xc7a882],
      collide: 0.62,
      zones: [
        // THE CARDBOARD ESTATE — an authored colony so the night view always
        // has boxes (and glowing eyes) in frame.
        Z(genBlob, { x: 152, z: -67, r0: 0, r1: 5.2, clumps: 3, spread: 2.8, count: 9, tries: 40 }),
        ringOf('main_street', 0.58, 1.0, 10),
        ringOf('meow_donalds', 0.6, 1.15, 8),
        ringOf('fish_harbor', 0.62, 1.2, 7),
        ringOf('cat_park', 0.5, 1.0, 8),
        ringOf('residential', 0.58, 1.0, 8),
        ringOf('town_square', 0.6, 1.0, 6),
      ],
    },
    { // ── topiary cats (maze corners + park) ────────────────────────────────
      name: 'topiary', geo: G.gTopiary, mat: matFoliage, radius: 1.4, sink: 0.12, cast: true, pathMargin: 2.4,
      scale: [0.95, 1.12], tilt: 0.02, sway: 0.012, tints: [0x86b556, 0x93c060, 0x7aa84d, 0x9dc96b],
      collide: 0.7,
      seedItems: (meta) => meta.topiarySpots || [],
      zones: [
        ringOf('cat_park', 0.4, 1.05, 12),
        ringOf('town_square', 0.66, 1.0, 6),
      ],
    },
    { // ── yarn tangles caught in the undergrowth ────────────────────────────
      name: 'yarn', geo: G.gYarn, mat: matFoliage, radius: 0.7, sink: 0.08,
      scale: [0.8, 1.6], tilt: 0.25, sway: 0.02, tints: [0xd52b1e, 0x3a6ea5, 0xf2c14e, 0xd4308f, 0x2a8f8a],
      seedItems: (meta, all) => {
        const out = [];
        for (const host of ['oleander', 'bougainvillea']) {
          const items = all.find((s) => s.name === host)?.items || [];
          for (let i = 3; i < items.length; i += 7) {
            const it = items[i];
            out.push({ x: it.x + (i % 3 - 1) * 0.45, z: it.z + (i % 2 ? 0.4 : -0.4), y: it.y + (host === 'oleander' ? 1.35 : 1.15) });
          }
        }
        return out;
      },
      zones: [
        Z(genBlob, { x: 188, z: -64, r0: 2, r1: 22, clumps: 6, spread: 6, count: 22 }),
        ringOf('cat_park', 0.4, 1.1, 10),
        ringOf('residential', 0.6, 1.1, 8),
      ],
    },
    { // ── fish-bone flowers near the harbour ────────────────────────────────
      name: 'fishbone', geo: G.gFishbone, mat: matBlade, radius: 0.42, pack: 0.7, sink: 0.04,
      scale: [0.9, 1.7], tilt: 0.12, sway: 0.07, tints: [0xf0ece2, 0xffffff, 0xe4ddcd],
      zones: [
        ringOf('fish_harbor', 0.62, 1.6, 46),
        Z(genPath, { id: 'cat_harbor', off: [2.6, 6 ], count: 22, jit: 1.2 }),
      ],
    },
    { // ── tuna-can planters on the Main Street kerbs ────────────────────────
      name: 'tunacan', geo: G.gTunaCan, mat: matBlade, radius: 0.75, sink: 0.05, pathMargin: 0.45, cores: false,
      scale: [0.9, 1.25], tilt: 0.02, sway: 0.05, tints: [0x6f9a45, 0x7fae4c, 0x8bc95a],
      zones: [
        Z(genPath, { id: 'cat_main', t0: 0.2, t1: 0.85, off: [2.75, 3.3], count: 26, jit: 0.35 }),
        Z(genPath, { id: 'cat_park', t0: 0, t1: 0.35, off: [2.2, 2.7], count: 10, jit: 0.3 }),
      ],
    },
    { // ── leaf litter + pebbles: the bare maze corridors and shady ground ───
      name: 'litter', geo: G.gLitter, mat: matFoliage, radius: 0.34, pack: 0.6, sink: 0.04, rot: 'ground',
      scale: [0.8, 1.7], tilt: 0.2, sway: 0, tints: [0xc4a880, 0xa8813c, 0xbb9448, 0xd2bb96, 0x9a8a64],
      seedItems: (meta) => (meta.corridorSpots || []).filter((_, i) => i % 3 !== 0),
      zones: [
        Z(genRing, { x: 140, z: -58, r0: 16, r1: 30, count: 26, tries: 18 }),
        ringOf('cat_park', 0.2, 0.9, 24),
        Z(genPath, { id: 'cat_park', off: [2.2, 4.6], count: 40, jit: 1.2 }),
      ],
    },
    { // ── marigolds: the orange note the maze and the park were missing ─────
      name: 'marigold', geo: G.gWildflower, mat: matBlade, radius: 0.3, pack: 0.55, sink: 0.03,
      scale: [1.0, 1.7], tilt: 0.16, sway: 0.12, tints: [0xff8a3c, 0xff7a2a, 0xffa63c, 0xf2c14e],
      seedItems: (meta) => (meta.mazeAccents || []).filter((_, i) => i % 2 === 1),
      zones: [
        Z(genBlob, { x: 146, z: -62, r0: 0, r1: 12, clumps: 4, spread: 5, count: 44 }),
        ringOf('cat_park', 0.62, 1.0, 40),
      ],
    },
  ];

  // Big things claim ground first, undergrowth fills what is left.
  const ORDER = ['cypress', 'pine', 'olive', 'palm', 'scratchpost', 'boxbush', 'topiary', 'outcrop',
    'boulder', 'boulderStack', 'boulderSlab',
    'driftwood', 'oleander', 'bougainvillea', 'agaveBloom', 'agave', 'tunacan', 'yarn', 'sunflower', 'fishbone',
    'lavender', 'marigold', 'shell',
    // the Commons bed claims its ground before the general undergrowth does,
    // tallest tier first, so the mass is catnip and not grass with catnip in it
    'catnipTall', 'catnip', 'catnipLow',
    'scree', 'litter', 'wildflower', 'marram', 'grass'];
  for (const s of SPECIES) if (ORDER.indexOf(s.name) < 0) console.warn('[cat/nature] species missing from ORDER:', s.name);
  SPECIES.sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));

  // ── build every species ───────────────────────────────────────────────────
  const meshes = [];
  let instances = 0, triangles = 0;
  const colliders = [];
  const perches = [...props.perches];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

  for (const spec of SPECIES) {
    const r = rng(hash('cat-nature-' + spec.name));
    const plan = { seed: spec.name, ...spec };
    let items = planner.scatter(plan);
    spec.zoneYield = plan.zoneYield;
    if (spec.seedItems) {
      const extra = spec.seedItems(props.meta, SPECIES)
        .map((p) => ({ x: p.x, z: p.z, y: p.y ?? (world.height(p.x, p.z) - (spec.sink ?? 0.08)), r: r() }));
      items = extra.concat(items);
    }
    if (!items.length) continue;
    const geo = spec.geo(rng(hash('cat-nature-geo-' + spec.name)));
    const n = items.length;
    const mesh = new THREE.InstancedMesh(geo, spec.mat, n);
    mesh.name = 'cat_nature_' + spec.name;
    const phase = new Float32Array(n), swayA = new Float32Array(n), tint = new Float32Array(n * 3);
    const sunYaw = r() * TAU;
    for (let i = 0; i < n; i++) {
      const it = items[i];
      // SIZE TIERS: `tiers: [[lo,hi], …]` draws a discrete size class per
      // instance and jitters inside it, so a ruled grove is old trees, middling
      // ones and saplings instead of one tree stamped at one scale. Without
      // `tiers` the old continuous ramp still applies.
      let s;
      if (spec.tiers) {
        const t = spec.tiers[(it.r * spec.tiers.length) | 0] || spec.tiers[0];
        s = lerp(t[0], t[1], r());
      } else s = lerp(spec.scale[0], spec.scale[1], it.r * it.r * 0.6 + r() * 0.4);
      const sy = spec.squash ? s * lerp(spec.squash[0], spec.squash[1], r()) : s;
      let yaw = r() * TAU, rx = (r() - 0.5) * (spec.tilt ?? 0.06), rz = (r() - 0.5) * (spec.tilt ?? 0.06);
      if (spec.rot === 'path' && it.along !== undefined) yaw = it.along + Math.PI / 2 + (r() - 0.5) * 0.2;
      else if (spec.rot === 'sun') yaw = sunYaw + (r() - 0.5) * 0.6;
      else if (spec.rot === 'ground') {
        const nrm = world.normal(it.x, it.z);
        rx = Math.atan2(nrm.z, nrm.y) + (r() - 0.5) * (spec.tilt ?? 0.1);
        rz = -Math.atan2(nrm.x, nrm.y) + (r() - 0.5) * (spec.tilt ?? 0.1);
      }
      // coherent per-instance lean: the whole meadow leans off the same wind,
      // but every tuft leans its own amount so nothing looks stamped.
      if (spec.lean) {
        const lw = spec.lean * (0.25 + it.r * 1.1) * (0.7 + r() * 0.6);
        const la = WIND + (r() - 0.5) * 1.1;
        rx += Math.cos(la) * lw; rz += Math.sin(la) * lw;
      }
      _e.set(rx, yaw, rz, 'YXZ');
      _m.compose(_p.set(it.x, it.y, it.z), _q.setFromEuler(_e), _s.set(s, sy, s));
      mesh.setMatrixAt(i, _m);
      phase[i] = r() * TAU;
      swayA[i] = (spec.sway ?? 0) * (0.65 + r() * 0.7);
      _c.set(spec.tints ? spec.tints[(r() * spec.tints.length) | 0] : 0xffffff);
      _c.offsetHSL((r() - 0.5) * (spec.hueJit ?? 0.03), (r() - 0.5) * 0.1, (r() - 0.5) * (spec.lumJit ?? 0.09));
      tint[i * 3] = _c.r; tint[i * 3 + 1] = _c.g; tint[i * 3 + 2] = _c.b;
      // ── wave-2 collision contract ──────────────────────────────────────────
      // Circles for trunks, rocks and bush masses; ORIENTED BOXES for hedges.
      // `rot` is negated: every consumer of a box collider maps world→local with
      // lx = dx·cos + dz·sin, the opposite handedness to a Three mesh yaw.
      if (spec.collide && s >= (spec.collideMin ?? 0)) colliders.push({ x: it.x, z: it.z, r: spec.collide * s });
      if (spec.collideBox) colliders.push({ x: it.x, z: it.z, w: spec.collideBox[0] * s, d: spec.collideBox[1] * s, rot: -yaw, box: true });
      if (spec.name === 'scratchpost') perches.push({ x: it.x, y: it.y + 3.35 * s, z: it.z, kind: 'post' });
      if (spec.name === 'boulder' && s > 1.6) perches.push({ x: it.x, y: it.y + 1.3 * sy, z: it.z, kind: 'rock' });
      if (spec.name === 'boulderStack' && s > 1.5) perches.push({ x: it.x - 0.2 * s, y: it.y + 1.5 * sy, z: it.z, kind: 'rock' });
      if (spec.name === 'outcrop' && s > 2.0) perches.push({ x: it.x, y: it.y + 1.75 * sy, z: it.z, kind: 'rock' });
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aSway', new THREE.InstancedBufferAttribute(swayA, 1));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.castShadow = !!spec.cast; mesh.receiveShadow = !!spec.cast;
    if (spec.cast) mesh.customDepthMaterial = depthMat;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
    instances += n; triangles += n * G.triCount(geo);
    spec.items = items;
  }

  // ── glowing eyes inside the cardboard boxes (night only) ──────────────────
  let eyeMesh = null;
  {
    const boxes = SPECIES.find((s) => s.name === 'boxbush');
    if (boxes?.items?.length) {
      const n = boxes.items.length;
      const geo = G.gBoxEyes();
      eyeMesh = new THREE.InstancedMesh(geo, matEye, n);
      eyeMesh.name = 'cat_nature_boxeyes';
      const mesh = meshes.find((m) => m.name === 'cat_nature_boxbush');
      for (let i = 0; i < n; i++) { mesh.getMatrixAt(i, _m); eyeMesh.setMatrixAt(i, _m); }
      eyeMesh.castShadow = false; eyeMesh.receiveShadow = false;
      eyeMesh.computeBoundingSphere();
      eyeMesh.visible = false;
      group.add(eyeMesh);
      instances += n; triangles += n * G.triCount(geo);
    }
  }

  // ── lily pads on the koi pond ─────────────────────────────────────────────
  if (props.meta.pond) {
    const pond = props.meta.pond, geo = G.gLilyPad(rand), n = 26;
    const pads = new THREE.InstancedMesh(geo, matBlade, n);
    pads.name = 'cat_nature_lilypads';
    const phase = new Float32Array(n), swayA = new Float32Array(n), tint = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU, rr = Math.sqrt(rand()) * (pond.r - 1.0);
      const s = 0.8 + rand() * 0.7;
      _e.set(0, rand() * TAU, 0, 'YXZ');
      _m.compose(_p.set(pond.x + Math.cos(a) * rr, pond.y + 0.03, pond.z + Math.sin(a) * rr), _q.setFromEuler(_e), _s.set(s, s, s));
      pads.setMatrixAt(i, _m);
      phase[i] = rand() * TAU; swayA[i] = 0.02;
      _c.set([0x4f8a5b, 0x5f9a63, 0x3f7a4a][(rand() * 3) | 0]);
      tint[i * 3] = _c.r; tint[i * 3 + 1] = _c.g; tint[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aSway', new THREE.InstancedBufferAttribute(swayA, 1));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    pads.computeBoundingSphere();
    group.add(pads); meshes.push(pads);
    instances += n; triangles += n * G.triCount(geo);
  }

  // ── six municipal koi, circling under the surface ─────────────────────────
  let koiMesh = null; const koi = [];
  if (props.meta.pond) {
    const pond = props.meta.pond, geo = G.gKoi(rand), n = 6;
    koiMesh = new THREE.InstancedMesh(geo, matBlade, n);
    koiMesh.name = 'cat_nature_koi';
    koiMesh.frustumCulled = false;
    const phase = new Float32Array(n), swayA = new Float32Array(n), tint = new Float32Array(n * 3);
    const KT = [0xff7a2a, 0xfff0e0, 0xff9330, 0xffffff, 0xff6a1e, 0xffd9b0];
    for (let i = 0; i < n; i++) {
      koi.push({ r: 1.3 + (i % 3) * 1.05, a: (i / n) * TAU, w: (0.34 + (i % 4) * 0.09) * (i % 2 ? -1 : 1), s: 1.15 + (i % 3) * 0.28, dy: -0.06 - (i % 3) * 0.035 });
      phase[i] = i * 1.3; swayA[i] = 0;
      _c.set(KT[i]);
      tint[i * 3] = _c.r; tint[i * 3 + 1] = _c.g; tint[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aSway', new THREE.InstancedBufferAttribute(swayA, 1));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    koiMesh.userData.pond = pond;
    group.add(koiMesh); meshes.push(koiMesh);
    instances += n; triangles += n * G.triCount(geo);
  }
  function updateKoi(t) {
    if (!koiMesh) return;
    const pond = koiMesh.userData.pond;
    for (let i = 0; i < koi.length; i++) {
      const k = koi[i];
      const a = k.a + t * k.w;
      const rr = k.r + Math.sin(t * 0.6 + i) * 0.35;
      const x = pond.x + Math.cos(a) * rr, z = pond.z + Math.sin(a) * rr;
      const y = pond.y + k.dy + Math.sin(t * 1.1 + i * 2) * 0.045;
      _e.set(0, Math.atan2(-Math.sin(a) * k.w, Math.cos(a) * k.w) + Math.PI, Math.sin(t * 3 + i) * 0.12, 'YXZ');
      _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(k.s, k.s, k.s));
      koiMesh.setMatrixAt(i, _m);
    }
    koiMesh.instanceMatrix.needsUpdate = true;
  }

  // ── birds ─────────────────────────────────────────────────────────────────
  const matBlob = new THREE.MeshStandardMaterial({ color: 0x1d2a18, roughness: 1, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false });
  const birds = createBirds(ctx, G.gGull(), G.gPigeon(), matBird, G.gBirdBlob(), matBlob);
  for (const m of birds.meshes) { group.add(m); instances += m.count; triangles += m.count * G.triCount(m.geometry); }

  // ── colliders for trunks and hero props ───────────────────────────────────
  ctx.colliders = ctx.colliders || [];
  const collBase = ctx.colliders.length;
  for (const c of props.colliders) ctx.colliders.push(c);
  for (const c of colliders) ctx.colliders.push(c);
  const collMine = ctx.colliders.length;

  // ── deferred clearance: nothing grows through a room ──────────────────────
  // The build-time test above already refuses the ground, but seedItems bypass
  // it and other systems register walls after us — so once the world is up,
  // every instance is re-tested against the rooms and wall boxes and the
  // offenders are blanked (zero scale) with their collider neutralised.
  let cleared = 0;
  ctx.events.on('world:ready', () => {
    const rects = archRects().concat(boxRects(ctx.colliders, collBase, collMine));
    if (!rects.length) return;
    const mine = new Map();
    for (let i = collBase; i < collMine; i++) {
      const c = ctx.colliders[i];
      if (c) mine.set(`${c.x.toFixed(3)},${c.z.toFixed(3)}`, c);
    }
    const m4 = new THREE.Matrix4(), pv = new THREE.Vector3(), qv = new THREE.Quaternion(), sv = new THREE.Vector3();
    for (const mesh of meshes.concat(eyeMesh ? [eyeMesh] : [])) {
      if (!mesh.isInstancedMesh) continue;
      let touched = false;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m4);
        m4.decompose(pv, qv, sv);
        if (sv.x === 0) continue;
        if (PL.buildingClear(pv.x, pv.z, 0.3, PL.BUILD_PAD, rects)) continue;
        m4.compose(pv, qv, sv.set(0, 0, 0));
        mesh.setMatrixAt(i, m4);
        const c = mine.get(`${pv.x.toFixed(3)},${pv.z.toFixed(3)}`);
        if (c) { c.r = 0; c.w = 0; c.d = 0; }
        touched = true; cleared++;
      }
      if (touched) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
    }
    console.warn(`[cat/nature] clearance pass: ${cleared} instances blanked inside ${rects.length} building rects`);
  });

  triangles += G.triCount(props.geo) + G.triCount(props.water) + (props.signGeo ? G.triCount(props.signGeo) : 0);

  // ── interactions, signs, catnip haze (after every system exists) ──────────
  const emitters = [];
  ctx.events.on('world:ready', () => {
    const I = ctx.systems.interaction, U = ctx.systems.ui;
    if (I) {
      const say = (p) => (c) => {
        c.systems.ui?.say(p.text, { speaker: p.speaker, duration: 5.5 });
        if (p.after) p.after(c);
      };
      for (const p of props.pois) I.register({ id: p.id, x: p.x, z: p.z, r: p.r, label: p.label, onInteract: say(p) });
      const cn = props.meta.feather;
      I.register({
        id: 'nat_catnip', x: 140, z: -58, r: 9, label: 'Sniff the catnip',
        onInteract: (c) => {
          c.systems.ui?.say('Catnip Commons. The grass is legally required to be this green. You feel an urge to lie down and think about nothing.', { speaker: 'Catnip Commons', duration: 6 });
          c.systems.particles?.burst({ x: c.systems.player.position.x, y: c.systems.player.position.y + 1.2, z: c.systems.player.position.z, count: 26, color: [0xbcd68f, 0xa88fd0, 0xd9f0a0], speed: 2.2, life: 1.6, size: 0.3, gravity: 0.6, spread: 1.6 });
        },
      });
      const bb = SPECIES.find((s) => s.name === 'boxbush');
      const box0 = bb?.items?.[0];
      if (box0) I.register({
        id: 'nat_box', x: box0.x, z: box0.z, r: 2.6, label: 'Look inside the box',
        onInteract: (c) => c.systems.ui?.say('Two eyes. No cat. The eyes blink, politely, and wait for you to leave.', { speaker: 'Cardboard Box', duration: 5 }),
      });
    }
    const P = ctx.systems.particles;
    if (P) {
      for (const [x, z, r] of [[140, -58, 22], [128, -80, 10], [164, -70, 10]]) {
        emitters.push({ x, y: world.height(x, z) + 1.4, z, r, handle: null });
      }
    }
  });

  // ── update ────────────────────────────────────────────────────────────────
  const api = {
    group, meshes, perches, meta: props.meta,
    gullPositions: birds.gullPositions,
    species: SPECIES,
    stats: () => ({ meshes: group.children.length, instances, triangles: Math.round(triangles) }),
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      uniforms.uTime.value = t;
      const pl = ctx.systems.player?.position;
      birds.update(dt, t, pl);
      updateKoi(t);
      const night = 1 - (ctx.state.daylight ?? 1);
      if (eyeMesh) {
        eyeMesh.visible = night > 0.25;
        if (eyeMesh.visible) matEye.emissiveIntensity = 1.1 + 0.6 * night * (0.7 + 0.3 * Math.sin(t * 2.1));
      }
      // catnip haze only while you are near enough to smell it
      const P = ctx.systems.particles;
      if (P && pl) for (const e of emitters) {
        const near = Math.hypot(pl.x - e.x, pl.z - e.z) < e.r + 34;
        if (near && !e.handle) e.handle = P.emitter({ x: e.x, y: e.y, z: e.z, rate: 3.5, color: [0xbcd68f, 0xa88fd0, 0xd9f0a0, 0xffffff], speed: 0.45, life: 5.5, size: 0.26, gravity: 0.12, spread: e.r * 1.5 });
        else if (!near && e.handle) { e.handle.stop(); e.handle = null; }
      }
    },
  };
  const buildMs = Math.round(performance.now() - t0);
  const fmt = (m) => (m ? `${m.x.toFixed(1)},${m.z.toFixed(1)}` : '—');
  console.warn(`[cat/nature] ${group.children.length} meshes · ${instances} instances · ${Math.round(triangles)} tris · ${ctx.colliders.length} colliders · ${perches.length} perches · ${nRects} building rects · ${buildMs}ms · ` +
    SPECIES.map((s) => s.name + ':' + (s.items ? s.items.length : 0)).join(' '));
  console.warn(`[cat/nature] heroes  feather ${fmt(props.meta.feather)} · pond ${fmt(props.meta.pond)} · maze ${fmt(props.meta.maze)} r${props.meta.maze?.r} · ` +
    `plaza planters ${props.meta.plaza?.planters ?? 0} · corridor spots ${props.meta.corridorSpots?.length ?? 0} · gulls ${birds.gulls.length} · pigeons ${birds.pigeons.length} · koi ${koi.length}`);
  {
    const bed = props.meta.bed, cnt = (n) => SPECIES.find((s) => s.name === n)?.items?.length ?? 0;
    const inBed = (n) => (SPECIES.find((s) => s.name === n)?.items || []).filter((i) => Math.hypot(i.x - bed.x, i.z - bed.z) < bed.r + 2.5).length;
    console.warn(`[cat/nature] bed ${fmt(bed)} r${bed.r} blades ${inBed('catnipTall')}+${inBed('catnip')}+${inBed('catnipLow')} of ${cnt('catnipTall') + cnt('catnip') + cnt('catnipLow')} · ` +
      `terrace walls ${props.meta.terraces?.walls?.length ?? 0} · ridge cypress/olive/scree ${cnt('cypress')}/${cnt('olive')}/${cnt('scree')} · rocks ${cnt('boulder')}/${cnt('boulderSlab')}/${cnt('boulderStack')}`);
  }
  api.buildMs = buildMs;
  ctx.events.emit('cat:nature:ready', api);
  return api;
}
