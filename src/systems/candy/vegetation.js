// ═════════════════════════════════════════════════════════════════════════════
// CANDYLAND VEGETATION
//
// An authored candy ecosystem for the whole west island. 16 species, one
// InstancedMesh each (merged multi-part geometry + per-instance colour, scale,
// lean and phase), placed by seeded density fields so the island reads as a
// PLACE rather than a scatter:
//
//   Gummy Forest        (-200,-20)  gummy-bear trees in flavour groves, each
//                                   trunk ringed by a skirt of cotton-candy +
//                                   gumdrops + root mats — old growth, not lawn
//   Lollipop Meadow     (-110,-45)  swirl discs graded giant→tiny from the core
//   Frosting Peak       (-175,-62)  candy-cane pines ringing a whipped-cream cap
//   Chocolate Lake      (-200, 48)  caramel cattails wading the shallows, wafer
//                                   lily pads clamped to LAKE.surface
//   Syrup River         (peak→delta) candy canes bowing over the banks
//   Licorice paths                   rows of peppermint pinwheels + root mats
//   Gumdrop Village     (-140, 40)  feathered out — architecture's ground
//
// THREE PASSES, and the order matters: canopy claims ground first, then the
// understory is generated AS RINGS AROUND EVERY TRUNK (see skirt()), then the
// small detail fills what is left. Nothing allocates per frame: motion is four
// shared uniforms.
//
// API: api.report() → { species, instances, tris, trisWithShadow, byId }
//      api.notable  → the named plants registered as interactables
//      api.group / api.meshes for inspection (group.visible=false to A/B cost)
// ═════════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { rng, hash, clamp, lerp } from '../../core/util.js';
import { CANDY } from '../../core/palette.js';
import * as P from './vegetation/parts.js';
import {
  patchMaterial, vegUniforms, swayGLSL, breatheGLSL,
  candyFinishGLSL, fuzzGLSL, GUMMY_POSE_GLSL,
  makeSwirlTexture, makeStripeTexture, makePeppermintTexture,
} from './vegetation/shaders.js';
import {
  Occupancy, scatter, clusterScatter, alongPath, trim, falloff, band, smoothstep, field, TAU,
} from './vegetation/placement.js';
import { createInstanceCuller, withNearField, NEAR } from '../terrain/instcull.js';
import { createBlobShadows } from '../terrain/blobs.js';

// ── MOBILE TIER (docs/BRIEF.md Contract I) ───────────────────────────────────
// ctx.state.mobile is decided by main.js before any system exists. On the
// mobile tier the placement below runs EXACTLY as on desktop (same seeds, same
// order, same positions, same instance count) and only three things change at
// emit():
//   · NEAR FIELD, NOT A COUNT — ground cover and small understory keep ALL of
//     their instances, each tagged with a rank (a position hash, never the rng
//     stream; −1 for anything owning a collider, so the world you bump into is
//     always drawn). terrain/instcull.js + the vertex shader then draw 100% of
//     them within 28 u of the VISITOR, 60% out to 60 u, 25% beyond and none
//     past 130 u, each instance growing in over 3 u (no popping). The first
//     tier pass thinned by count everywhere, which left the ground right in
//     front of the lens bald — the critic's biggest mobile gap.
//   · SHADOWS FROM TREES ONLY, NEAR ONLY — gummy bears, lollipops and pines cast
//     again, but only within NEAR.SHADOW (40 u) of the visitor (their depth
//     material shrinks the caster over the last 6 u). Logs, cream, marsh and
//     the authored furniture do not cast (the bitten pop is a hero beat and
//     keeps its shadow). Past 34–40 u a soft contact blob fades in under each
//     trunk instead, so a far tree never floats.
//   · CULL — every species is packed per frame to the grid cells the camera
//     can see (terrain/instcull.js): one draw call, a fraction of the triangles.
const MOBILE_NEAR = new Set(['grass', 'mat', 'gumdrop', 'cotton', 'mint', 'cane', 'reed', 'lily', 'crystal', 'bean']);
const MOBILE_TREES = new Set(['gummy_sap', 'gummy_mid', 'gummy_gran', 'lolli', 'pine']);
// the far-field contact blob under each trunk (radius × the canopy half-width)
const MOBILE_BLOB = { gummy_sap: 1.35, gummy_mid: 1.35, gummy_gran: 1.2, lolli: 0.9, pine: 1.1 };
function keepHash(x, z, salt) {
  const h = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

export function create(ctx) {
  const { scene, world } = ctx;
  const L = world.LANDMARKS;
  const LAKE = world.LAKE;
  const group = new THREE.Group();
  group.name = 'candyVegetation';
  scene.add(group);
  ctx.colliders = ctx.colliders || [];
  const MOBILE = !!ctx.state?.mobile;
  const culler = MOBILE ? createInstanceCuller(ctx, { cell: 24 }) : null;

  const collBase = ctx.colliders.length;       // everything I push lives above this
  // (mobile) positions that own one of MY colliders — never thinned
  const colliderKeys = new Set();
  let colliderScan = collBase;
  function ownsCollider(x, z) {
    for (; colliderScan < ctx.colliders.length; colliderScan++) {
      const c = ctx.colliders[colliderScan];
      if (c) colliderKeys.add(c.x + ',' + c.z);
    }
    return colliderKeys.has(x + ',' + z);
  }
  const swirlTex = makeSwirlTexture(1024);     // giant lollipops magnify this hard
  const stripeTex = makeStripeTexture(256);
  const mintTex = makePeppermintTexture(128);
  const BOUNDS = { x0: -274, x1: -26, z0: -106, z1: 106 };

  // ── GUMMY FOREST CLEARINGS ─────────────────────────────────────────────────
  // Two authored holes in the canopy inside the (-215…-185, -5…35) dead zone,
  // each with a reason to walk into it (a bears' picnic; a ring of sugar
  // crystals). Every canopy and open-understory density multiplies by
  // clearMask(), so these are real bald patches you can cross, not thin forest.
  // (Both sit clear of candy architecture's jelly-bean boulder field at
  // -196,12 r13 — that field is built AFTER vegetation, so a clearing centred
  // on it gets a 4 u glossy bean parked in the middle of the picnic.)
  // (The east half of the AD's box is taken by architecture's bean field, the
  // Gumdrop Cliffs zone and the Chocolate Lake shallows, so the two clearings
  // sit on the forest side of it, where the gummy canopy is actually dense.)
  const CLEARINGS = [
    { x: -207, z: -8, r: 9.5, id: 'picnic' },
    { x: -219, z: -24, r: 8.5, id: 'ring' },
  ];
  const clearMask = (x, z) => {
    let k = 1;
    for (const c of CLEARINGS) {
      k *= smoothstep(c.r * 0.58, c.r + 1.5, Math.hypot(x - c.x, z - c.z));
      if (k <= 0) return 0;
    }
    return k;
  };

  // ── field helpers ──────────────────────────────────────────────────────────
  const H = (x, z) => world.height(x, z);
  const dLM = (x, z, id) => Math.hypot(x - L[id].x, z - L[id].z);
  const nearLM = (x, z, id, a, b) => falloff(dLM(x, z, id), a, b);
  const fbm = (n, x, z, f, o = 3) => n.fbm(x * f, z * f, o);
  const dLake = (x, z) => Math.hypot(x - LAKE.x, z - LAKE.z);

  // Occupancy grids by plant SIZE, so that source order never decides who gets
  // space. Understory uses the 'skirt'/'mat' tiers, which deliberately IGNORE
  // occBig: bushes are supposed to touch the trunk they grow against.
  const occBig = new Occupancy(5), occMed = new Occupancy(3), occSmall = new Occupancy(2);

  function ok(o = {}) {
    const {
      minH = 1.0, maxH = 99, maxSlope = 0.55, pathMargin = 1.2, riverMargin = 2.0,
      avoidLandmarks = true, clear = 0, reserve = 0, tier = 'med', avoidLake = true,
    } = o;
    const cf = typeof clear === 'function' ? clear : () => clear;
    const rf = typeof reserve === 'function' ? reserve : () => reserve;
    return (x, z) => {
      if (x > -20 || world.islandAt(x, z) !== 'candy') return false;
      if (avoidLake && dLake(x, z) < LAKE.r * 0.92) return false;   // nothing grows in chocolate
      const h = H(x, z);
      if (h < minH || h > maxH) return false;
      if (!world.isFreeGround(x, z, { pathMargin, riverMargin, avoidLandmarks, minHeight: minH })) return false;
      if (maxSlope < 1 && world.slope(x, z) > maxSlope) return false;
      const c = cf(x, z);
      if (c > 0) {
        if (tier !== 'skirt' && tier !== 'mat' && !occBig.free(x, z, c)) return false;
        if (tier !== 'big' && tier !== 'mat' && !occMed.free(x, z, c)) return false;
        if (tier === 'small' || tier === 'mat') { if (!occSmall.free(x, z, c)) return false; }
      }
      const rv = rf(x, z);
      if (rv > 0) {
        if (tier === 'big') occBig.add(x, z, rv);
        else if (tier === 'small' || tier === 'mat') occSmall.add(x, z, rv);
        else occMed.add(x, z, rv);
      }
      return true;
    };
  }

  // ── colour ─────────────────────────────────────────────────────────────────
  const _hsl = { h: 0, s: 0, l: 0 };
  const _col = new THREE.Color();
  function tintOf(hex, r, dh = 0.032, ds = 0.16, dl = 0.115, lmax = 0.94) {
    _col.setHex(hex);
    _col.getHSL(_hsl);
    _col.setHSL(
      (_hsl.h + (r() - 0.5) * dh * 2 + 1) % 1,
      clamp(_hsl.s + (r() - 0.5) * ds * 2, 0, 1),
      clamp(_hsl.l + (r() - 0.5) * dl * 2, 0.08, lmax),
    );
    return _col;
  }
  // Grass/mat hues: greens with the occasional soft candy-grass pastel. Never a
  // saturated sprinkle colour — that is what turned ground cover into confetti.
  const GREENS = [0x5fc274, 0x4fae62, 0x77d18a, 0x3f9c55, 0x69c87e, 0x58b96b];
  const SOFTGRASS = [CANDY.pinkGrass, CANDY.mintGrass, 0xd8e87a];
  const grassTint = (r, i) => (r() < 0.86
    ? tintOf(GREENS[i % GREENS.length], r, 0.05, 0.18, 0.12, 0.66)
    : tintOf(SOFTGRASS[i % SOFTGRASS.length], r, 0.035, 0.2, 0.09, 0.80));

  // ── instancing ─────────────────────────────────────────────────────────────
  const _m4 = new THREE.Matrix4(); const _q = new THREE.Quaternion(); const _q2 = new THREE.Quaternion();
  const _e = new THREE.Euler(); const _p = new THREE.Vector3(); const _s = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0); const _n = new THREE.Vector3();
  const meshes = [];
  let totalInstances = 0, totalTris = 0, shadowTris = 0;

  // ── WIND ───────────────────────────────────────────────────────────────────
  // A prevailing breeze out of the south-west. Every plant gets a STATIC lean
  // along it (bigger for floppy things) on top of its own jitter, so even a
  // frozen frame reads as windy; the shader sway then animates around that.
  // Euler order is YXZ → the x/z tilt happens in the frame already spun by ry,
  // so the local tilt direction has to be counter-rotated by ry to come out
  // pointing the same way in the world for every instance.
  const WIND_A = 0.62;
  function lean(it, amt, r, jitter = 0.45) {
    const a = WIND_A + (it.ry || 0);
    const k = amt * (1 - jitter + r() * jitter * 2);
    it.rx = (it.rx || 0) + Math.sin(a) * k;
    it.rz = (it.rz || 0) - Math.cos(a) * k;
    return it;
  }

  function vegMat(id, o = {}) {
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.72, metalness: 0.0, ...(o.mat || {}),
    });
    // NIGHT ALBEDO FLOOR. Stems, posts and thin stalks were resolving to pure
    // black after dark — an unlit silhouette, not a dark object. 0.08 keeps them
    // as *material*, and costs nothing during the day (uNight = 0).
    const floor = o.nightFloor === false ? '' :
      `\n{ diffuseColor.rgb = max( diffuseColor.rgb, vec3( ${(o.nightFloor ?? 0.085).toFixed(3)} * uNight ) ); }`;
    patchMaterial(m, { ...o, fragmentBody: (o.fragmentBody || '') + floor });
    return m;
  }

  /**
   * A depth material carrying the SAME vertex displacement as the surface one.
   * The shadow pass runs three's own MeshDepthMaterial, which knows nothing
   * about our patches — so a lollipop whose stick the shader shortens by 2.7 u
   * would drop the shadow of a tree that is not there. Species that move their
   * geometry meaningfully in the vertex shader pass `depth: true` to emit().
   */
  function vegDepthMat(id, o = {}) {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patchMaterial(m, {
      id: id + '_depth', vertexHead: o.vertexHead, vertexBody: o.vertexBody, uniforms: o.uniforms,
    });
    return m;
  }

  function emit(id, geo, material, items, o = {}) {
    if (!items.length) return null;
    let { castShadow = false, receiveShadow = true } = o;
    let rank = null;
    if (MOBILE) {
      castShadow = castShadow && MOBILE_TREES.has(id);
      if (MOBILE_NEAR.has(id)) {
        let salt = 0; for (let i = 0; i < id.length; i++) salt += id.charCodeAt(i) * (i + 1);
        rank = new Float32Array(items.length);
        for (let i = 0; i < items.length; i++) rank[i] = ownsCollider(items[i].x, items[i].z) ? -1 : keepHash(items[i].x, items[i].z, salt);
      }
    }
    const n = items.length;
    const mesh = new THREE.InstancedMesh(geo, material, n);
    const phase = new Float32Array(n);
    const extra = new Float32Array(n);
    const tint = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const it = items[i];
      _e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
      _q.setFromEuler(_e);
      if (it.align) {
        const nn = world.normal(it.x, it.z);
        _n.set(nn.x, nn.y, nn.z).lerp(_up, 1 - it.align).normalize();
        _q2.setFromUnitVectors(_up, _n);
        _q.premultiply(_q2);
      }
      _p.set(it.x, it.y, it.z);
      _s.set(it.sx, it.sy ?? it.sx, it.sz ?? it.sx);
      _m4.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m4);
      phase[i] = it.phase;
      extra[i] = it.extra ?? 0;
      tint[i * 3] = it.tint.r; tint[i * 3 + 1] = it.tint.g; tint[i * 3 + 2] = it.tint.b;
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aExtra', new THREE.InstancedBufferAttribute(extra, 1));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    if (rank) { geo.setAttribute('aRank', new THREE.InstancedBufferAttribute(rank, 1)); withNearField(material, 'density'); }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
    if (castShadow && o.depth) mesh.customDepthMaterial = vegDepthMat(id, o.depth);
    // mobile trees: the caster shrinks away past NEAR.SHADOW (pine has no
    // displacement of its own, so it gets a plain depth material to carry it)
    if (MOBILE && castShadow) {
      mesh.customDepthMaterial = withNearField(mesh.customDepthMaterial || new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), 'shadow');
    }
    mesh.name = 'candyveg_' + id;
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 4;   // headroom for shader sway
    group.add(mesh);
    const tris = (geo.index.count / 3) * n;
    const rec = { id, mesh, n, tris, castShadow };
    meshes.push(rec);
    if (culler) {
      // The culler repacks the live buffers. Anything that reads a species'
      // instances AFTER the first frame (particles/ambient.js's bush glints)
      // gets the full, stable set through a read-only stand-in, and the live
      // mesh stays reachable as rec.live.
      culler.add(mesh, {
        pad: 4,                                                  // = the mesh's own sway headroom
        density: !!rank, shadowNear: castShadow ? NEAR.SHADOW : 0,
        onSnapshot: (arr, count) => { rec.live = mesh; rec.mesh = { isInstanceSnapshot: true, name: mesh.name, instanceMatrix: { array: arr }, count }; },
      });
    }
    totalInstances += n; totalTris += tris; if (castShadow) shadowTris += tris;
    return mesh;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNDERSTORY GENERATOR
  // Every trunk registers itself here; the understory species then grow AROUND
  // those trunks instead of being scattered independently. This is the whole
  // difference between "old growth" and "trees standing on a lawn".
  // ═══════════════════════════════════════════════════════════════════════════
  const trunks = [];   // { x, z, s, kind }
  let api_grandmothers = [];   // the 3× bears, so Grandpa Gum can be one of them
  const landmarksOfNote = [];  // authored beats, registered on 'world:ready'
  const extras = [];           // non-instanced authored meshes (clearings, the bitten pop)

  /**
   * Ring points around each trunk.
   *   per(t, rand)  how many to try for this trunk (0 skips it)
   *   rMin/rMax     ring radius, scaled by the trunk's own size
   */
  function skirt(list, { rand, per, rMin = 0.8, rMax = 2.1, accept, spread = 0.6 }) {
    const out = [];
    for (const t of list) {
      const n = per(t, rand);
      if (n <= 0) continue;
      const a0 = rand() * TAU;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU + (rand() - 0.5) * (TAU / n) * spread;
        const rr = (rMin + rand() * (rMax - rMin)) * (0.68 + 0.42 * t.s);
        const x = t.x + Math.cos(a) * rr, z = t.z + Math.sin(a) * rr;
        if (accept && !accept(x, z)) continue;
        out.push(x, z);
      }
    }
    return out;
  }
  const inForest = (t) => falloff(Math.hypot(t.x + 200, t.z + 20), 30, 62);

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 1 · CANOPY — claims ground, registers trunks
  // ═══════════════════════════════════════════════════════════════════════════

  // 1 · GUMMY BEAR TREES ─────────────────────────────────────────────────────
  {
    const r = rng(hash('candyveg:gummy'));
    const nA = field('gumA', 7001), nB = field('gumB', 7002), nHue = field('gumHue', 7003);
    const nSize = field('gumSize', 7004);
    const density = (x, z) => {
      const h = H(x, z);
      let d = 0.22 + 0.55 * Math.max(0, fbm(nA, x, z, 0.011, 3));
      d += 1.70 * nearLM(x, z, 'gummy_forest', 34, 66);
      d += 0.55 * nearLM(x, z, 'gumdrop_cliffs', 8, 34);
      d += 0.45 * nearLM(x, z, 'sour_shrine', 8, 30);
      d *= 0.50 + 0.78 * smoothstep(-0.34, 0.30, fbm(nB, x, z, 0.030, 2)); // clearings
      d *= 1 - 0.75 * nearLM(x, z, 'candy_village', 24, 42);
      d *= 1 - 0.9 * nearLM(x, z, 'candy_dock', 10, 26);
      d *= 1 - 0.95 * nearLM(x, z, 'lollipop_meadow', 8, 32);
      d *= 1 - 0.95 * falloff(dLake(x, z), 15, 30);
      d *= 1 - smoothstep(8.5, 12.5, h);                      // the peak belongs to the pines
      d *= clearMask(x, z);                                   // …and the clearings to nobody
      return d;
    };

    // ── GRANDMOTHERS FIRST ────────────────────────────────────────────────────
    // Five bears at 3× scale (≈20 u tall), placed BEFORE the ordinary forest
    // with a 5 u occupancy reservation, so the canopy grows up to them instead
    // of through them. They are the size break the forest was missing.
    const gran = trim(scatter({
      bounds: { x0: -246, x1: -158, z0: -58, z1: 46 }, cell: 10.5, jitter: 0.9, rand: r,
      density: (x, z) => 2.4 * nearLM(x, z, 'gummy_forest', 18, 48) * clearMask(x, z)
        * smoothstep(-0.12, 0.42, nSize.fbm(x * 0.014, z * 0.014, 2)),
      accept: ok({ tier: 'big', minH: 1.4, maxSlope: 0.34, clear: 5.6, reserve: 5.2 }),
    }), 5, rng(hash('candyveg:grantrim')));

    const pts = trim(scatter({
      bounds: BOUNDS, cell: 5.1, jitter: 0.92, rand: r, density,
      accept: ok({ tier: 'big', minH: 1.3, maxSlope: 0.55, clear: 2.3, reserve: 1.9 }),
    }), 262, rng(hash('candyveg:gummytrim')));

    // Four core flavours laid out as slow-drifting GROVES (a low-frequency hue
    // field), so you walk out of the orange stand and into the green one.
    const BEAR = [CANDY.gummyRed, CANDY.gummyOrange, CANDY.gummyYellow, CANDY.gummyGreen];
    const RARE = [CANDY.gummyPurple, CANDY.gummyBlue, 0xff5fa8];
    // THREE TIERS, and now three SILHOUETTES to match — each tier is its own
    // merged geometry and its own InstancedMesh (sap / mid / gran), so a stand
    // holds young chubby bears, working bears and hunched grandmothers rather
    // than one bear at three scales. Within a tier the head and arms are posed
    // per instance in the vertex shader (GUMMY_POSE_GLSL), so even the clones
    // are not clones.
    const TIER = [0.78, 1.0, 2.85];        // geometry heights differ, so do the scales
    const KEY = ['sap', 'mid', 'gran'];
    const all = [];
    for (let i = 0; i < gran.length; i += 2) all.push({ x: gran[i], z: gran[i + 1], t: 2 });
    for (let i = 0; i < pts.length; i += 2) all.push({ x: pts[i], z: pts[i + 1], t: -1 });

    const bucket = [[], [], []];
    const grandmothers = [];
    for (let i = 0; i < all.length; i++) {
      const { x, z } = all[i];
      // SIZE FIELD, not a per-tree dice roll: sapling thickets bank up against
      // stands of full-size bears, and the field is what decides which.
      const big = smoothstep(-0.42, 0.42, nSize.fbm(x * 0.014, z * 0.014, 2));
      const ti = all[i].t >= 0 ? all[i].t : (big < 0.48 ? 0 : 1);
      const gr = ti === 2;
      const s = TIER[ti] * (0.9 + r() * 0.2);
      const sxv = s * (0.92 + r() * 0.16), syv = s * (0.9 + r() * 0.3), szv = s * (0.92 + r() * 0.16);
      // MAX FIVE HUES PER CLUSTER: the hue field picks a base flavour, a tree may
      // stray one step either side of it, and 6% are a rare colour. Locally that
      // is three bears plus an accent, so a stand reads as a stand.
      const hf = clamp(0.5 + 0.70 * nHue.fbm(x * 0.011, z * 0.011, 2), 0, 0.999);
      const q = r();
      const hex = r() < 0.06
        ? RARE[i % RARE.length]
        : BEAR[clamp(Math.floor(hf * BEAR.length) + (q < 0.58 ? 0 : q < 0.79 ? -1 : 1), 0, BEAR.length - 1)];
      bucket[ti].push(lean({
        x, y: H(x, z) - 0.22, z,
        // A bear's face is its whole silhouette. Two thirds of them are turned
        // within ~60° of the default iso camera (0.785 puts the snout at +x+z,
        // which is where the camera stands) and the rest look wherever they
        // like; the shader's per-instance head yaw then breaks up the rows.
        ry: 0.785 + (r() - 0.5) * (r() < 0.68 ? 2.1 : TAU),
        // grandmothers stand nearly plumb — a 20 u bear at an 8° lean reads broken
        rx: (r() - 0.5) * (gr ? 0.05 : 0.13), rz: (r() - 0.5) * (gr ? 0.05 : 0.13),
        sx: sxv, sy: syv, sz: szv,
        // lmax 0.72: yellow/orange bears used to bleach to a pale cream and two
        // neighbours then read as the same washed-out clone. Grandmothers are
        // darker and duller still — ninety years of dust.
        tint: (gr ? tintOf(hex, r, 0.02, 0.10, 0.05, 0.52) : tintOf(hex, r, 0.038, 0.15, 0.09, 0.72)).clone(),
        phase: r() * TAU,
      }, gr ? 0.035 : ti === 0 ? 0.10 : 0.075, r));
      trunks.push({ x, z, s: Math.min(1.6, s), kind: 'gummy' });
      ctx.colliders.push({ x, z, r: Math.max(0.6, 0.66 * sxv) });   // the caramel trunk is solid
      if (gr) grandmothers.push({ x, z, y: H(x, z) - 0.22, s: syv });
    }
    api_grandmothers = grandmothers;
    for (let t = 0; t < 3; t++) {
      if (!bucket[t].length) continue;
      const id = 'gummy_' + KEY[t];
      const g = P.gummyTreeGeo(KEY[t]);
      const vHead = 'uniform float uNeck;\nuniform vec2 uArm;';
      const vBody = GUMMY_POSE_GLSL + swayGLSL('aVeg.y', 0.40, 1.05);
      const uni = { uNeck: { value: g.neckY }, uArm: { value: new THREE.Vector2(g.armX, g.armY) } };
      const mat = vegMat(id, {
        id,
        // roughness 0.35 + smooth spherical normals (parts.js) + the candy
        // finish below = translucent glossy jelly instead of opaque matte felt
        mat: { roughness: 0.35, metalness: 0.05 },
        uniforms: uni, vertexHead: vHead, vertexBody: vBody,
        emissiveBody: candyFinishGLSL({
          sss: t === 2 ? 0.26 : 0.36, rim: t === 2 ? 0.34 : 0.46, rimPow: 2.3,
          // glow is a night RIM, not a body fill: 0.10 x albedo at the silhouette
          spec: t === 0 ? 0.7 : 0.95, specPow: 40, glow: 0.10,
        }),
      });
      emit(id, g.geo, mat, bucket[t], {
        castShadow: true, depth: { vertexHead: vHead, vertexBody: vBody, uniforms: uni },
      });
    }
  }

  // 2 · LOLLIPOP TREES ───────────────────────────────────────────────────────
  {
    const r = rng(hash('candyveg:lolli'));
    const nA = field('lolA', 7101);
    // ── THE PALACE APRON ─────────────────────────────────────────────────────
    // Candyland's palace stands at (-150,-36) at the end of its own path out of
    // the meadow, and the meadow's size ramp was still worth ~1.9 out there:
    // ~40 giant discs lined up across the approach and walled the facade off.
    // Giants are now capped inside 34 u of the palace AND inside 14 u of the
    // palace path, so the approach is an avenue of waist-high pops instead.
    const PAL = L.candy_palace;
    const palPts = (world.PATHS.find((p) => p.id === 'candy_palace') || { points: [] }).points;
    const dPolyline = (x, z, pts) => {
      let best = 1e9;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const dx = bx - ax, dz = bz - az;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
      }
      return best;
    };
    const dPalPath = (x, z) => (palPts.length ? dPolyline(x, z, palPts) : 1e9);
    const palaceCap = (x, z) => {
      const k = Math.min(
        smoothstep(17, 34, Math.hypot(x - PAL.x, z - PAL.z)),
        smoothstep(5, 14, dPalPath(x, z)),
      );
      return lerp(1.02, 2.6, k);       // the largest scale allowed at this spot
    };
    // A RING of giants, not a spike in the middle. The meadow's own camera sits
    // at the landmark centre and a 2.25-scale pop planted there is a bare white
    // pole cropped off at the top of frame — which is exactly what round 2 shot.
    const sizeAt = (x, z) => {
      const dm = dLM(x, z, 'lollipop_meadow');
      const base = dm < 38 ? lerp(0.92, 1.94, band(dm, 2.5, 10.5, 22, 34)) : 0.86;
      return Math.min(base, palaceCap(x, z));
    };
    // …and the taller the pop, the SHORTER its stick, so a giant is a huge disc
    // on a stump rather than a head at y=14 that no game camera can see. Target
    // head height ≈ 8.4 u, which sits inside the 31 u / 0.64 rad frame.
    const stickFactor = (s) => clamp((8.4 / Math.max(s, 0.4) - 1.33) / 5.0, 0.46, 1.0);
    const density = (x, z) => {
      let d = 0.07 + 0.15 * Math.max(0, fbm(nA, x, z, 0.016, 3));
      d += 2.30 * nearLM(x, z, 'lollipop_meadow', 19, 45);
      d += 0.45 * nearLM(x, z, 'giant_cupcake', 10, 34);
      d *= 1 - 0.80 * nearLM(x, z, 'gummy_forest', 14, 44);
      d *= 1 - 0.7 * nearLM(x, z, 'candy_village', 24, 40);
      d *= 1 - 0.9 * nearLM(x, z, 'candy_dock', 8, 24);
      d *= 1 - 0.70 * nearLM(x, z, 'candy_palace', 14, 40);   // don't crowd the facade
      d *= 1 - 0.55 * falloff(dPalPath(x, z), 4, 13);          // nor its approach
      d *= 1 - smoothstep(9.0, 13.0, H(x, z));
      return d;
    };
    const pts = trim(scatter({
      bounds: BOUNDS, cell: 4.6, jitter: 0.95, rand: r, density,
      accept: ok({
        tier: 'big', minH: 1.2, maxSlope: 0.5,
        clear: (x, z) => 1.15 * sizeAt(x, z) + 0.5,
        reserve: (x, z) => 1.05 * sizeAt(x, z) + 0.35,
      }),
    }), 150, rng(hash('candyveg:lollitrim')));

    const POPS = [0xff3355, 0xff8c1a, 0x3aa8ff, 0xb35bff, 0x5be27a, 0xffe23a, 0xff5fa8];
    const items = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      const s = sizeAt(x, z) * (0.8 + r() * 0.42);
      const sh = stickFactor(s);
      items.push(lean({
        x, y: H(x, z) - 0.12, z,
        // discs biased toward the default iso camera but swung nearly ±100°, so
        // neighbouring giants never share a face angle; lean up to ~8°
        ry: 0.785 + (r() - 0.5) * 3.5, rx: (r() - 0.5) * 0.22, rz: (r() - 0.5) * 0.24,
        sx: s * (0.96 + r() * 0.08), sy: s * (0.9 + r() * 0.24),
        // real per-instance THICKNESS: local z is the head's depth axis, so this
        // runs the disc from a thin wafer to a fat gobstopper of a pop
        sz: s * (0.82 + r() * 0.66),
        tint: tintOf(POPS[(i / 2) % POPS.length], r, 0.026, 0.12, 0.08).clone(),
        phase: r() * TAU, extra: sh,
      }, 0.085, r));
      // the giants get a real skirt (big:true); the small ones only a token one
      if (s > 1.05) trunks.push({ x, z, s: Math.min(1.4, s * 0.7), kind: 'lolli', big: true });
      else trunks.push({ x, z, s: 0.55, kind: 'lolli' });
      // every stick is solid — a giant lollipop is a barn door on a pole
      ctx.colliders.push({ x, z, r: clamp(0.26 + 0.26 * s, 0.42, 1.15) });
    }
    const g = P.lollipopGeo();
    const lolliUni = { uSwirl: { value: swirlTex }, uHeadY: { value: g.headY }, uStickH: { value: g.stickH } };
    const lolliVH = 'uniform float uHeadY;\nuniform float uStickH;\nattribute float aExtra;';
    const lolliVB = `
        float shrink = aExtra > 0.01 ? aExtra : 1.0;
        float drop = uStickH * ( 1.0 - shrink );
        float hy = uHeadY - drop;
        if ( aVeg.y > 0.5 ) transformed.y -= drop;    // head comes down...
        else transformed.y *= shrink;                 // ...because the stick is shorter
        { // whole pop leans in the wind
          float w = clamp(transformed.y / 6.2, 0.0, 1.25);
          float t = uTime * 0.8 + aPhase;
          transformed.x += sin(t) * 0.30 * w * uWind;
          transformed.z += cos(t * 0.77 + 1.1) * 0.22 * w * uWind;
        }
        if (aVeg.y > 0.5) { // the swirl turns, hypnotically, each at its own pace
          float dir = aPhase > 3.14159 ? 1.0 : -1.0;
          float a = uTime * (0.30 + 0.45 * fract(aPhase * 0.618)) * dir + aPhase;
          a += sin(uTime * 1.15 + aPhase) * 0.07 * uWind;   // and wobbles on its stick
          vec2 d = transformed.xy - vec2(0.0, hy);
          float ca = cos(a), sa = sin(a);
          transformed.xy = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y) + vec2(0.0, hy);
        }`;
    const mat = vegMat('lolli', {
      id: 'lolli',
      mat: { roughness: 0.17, metalness: 0.06, emissive: 0xffffff, emissiveIntensity: 1 },
      uniforms: lolliUni, vertexHead: lolliVH, vertexBody: lolliVB,
      fragmentHead: 'uniform sampler2D uSwirl;',
      fragmentBody: `
        { float sw = texture2D( uSwirl, vVegUv ).r;
          // TWO patterns, so a meadow is not forty prints of one spiral: the
          // face mask (motion 1, tint 0) picks spiral or bullseye per instance.
          float face = step( 0.5, vVegMotion ) * ( 1.0 - step( 0.5, vVegMask ) );
          float rr = length( vVegUv - 0.5 ) * 2.0;
          float rings = step( 0.5, fract( rr * 2.4 + 0.12 ) ) * step( rr, 0.985 );
          diffuseColor.rgb = mix( diffuseColor.rgb, vVegTint,
            mix( sw, rings, step( 0.66, fract( vVegPhase * 0.4593 ) ) * face ) );
          // ...and a third of them are still in their cellophane: a cream wrapper
          // band round the rim, which also stops the head reading as a decal.
          float rimM = step( 0.5, vVegMask ) * step( 0.5, vVegMotion );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.96, 0.93, 0.87 ),
            rimM * step( fract( vVegPhase * 0.3183 ), 0.34 ) * 0.8 );
          // NIGHT GRADE. The white sticks were the brightest objects in every
          // night frame on the island: a near-white albedo plus a constant
          // emissive lift that never asked what time it was. Now the whole pop
          // falls with the light and the STICK falls hardest, so a lollipop
          // meadow at 23:00 is a field of silhouettes, not a field of lamps.
          float stick = 1.0 - step( 0.5, vVegMotion );
          diffuseColor.rgb *= mix( 1.0, mix( 0.44, 0.26, stick ), uNight ); }`,
      emissiveBody: `
        // the gloss band only exists while there is a sun to glint off
        totalEmissiveRadiance = vec3( 0.15, 0.145, 0.15 )
          * ( 1.0 - step( 0.5, vVegMotion ) ) * ( 1.0 - uNight );
        totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.05;`
        + candyFinishGLSL({ mask: 'step( 0.5, vVegMotion )', sss: 0.16, rim: 0.30, rimPow: 3.0, spec: 0.55, specPow: 62, glow: 0.0 }),
    });
    emit('lolli', g.geo, mat, items, {
      castShadow: true, depth: { vertexHead: lolliVH, vertexBody: lolliVB, uniforms: lolliUni },
    });
  }

  // 3 · CANDY-CANE PINES ─────────────────────────────────────────────────────
  {
    const r = rng(hash('candyveg:pine'));
    const nA = field('pineA', 7301);
    const density = (x, z) => {
      const d = dLM(x, z, 'frosting_peak');
      let v = band(d, 6, 12, 30, 42) * 2.1;
      v += 0.12 * band(d, 36, 42, 46, 54);   // a few stragglers, not a second forest
      v *= 0.5 + 0.75 * smoothstep(-0.4, 0.4, fbm(nA, x, z, 0.05, 2));
      return v;
    };
    const pts = trim(scatter({
      bounds: { x0: -240, x1: -110, z0: -106, z1: -8 }, cell: 4.3, jitter: 0.95, rand: r, density,
      accept: ok({ tier: 'big', minH: 2.0, maxSlope: 0.75, clear: 1.7, reserve: 1.55 }),
    }), 92, rng(hash('candyveg:pinetrim')));

    const PINE = [0xff2f49, 0x5fe0a0, 0xff6fb0, 0xff2f49];
    const items = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      const s = 0.76 + r() * 0.78;
      items.push(lean({
        x, y: H(x, z) - 0.18, z, ry: r() * TAU, rx: (r() - 0.5) * 0.12, rz: (r() - 0.5) * 0.12,
        sx: s * (0.94 + r() * 0.14), sy: s * (0.88 + r() * 0.5), sz: s * (0.94 + r() * 0.14),
        tint: tintOf(PINE[(i / 2) % PINE.length], r, 0.02, 0.12, 0.07).clone(),
        phase: r() * TAU, align: 0.35,
      }, 0.075, r));
      trunks.push({ x, z, s: s * 0.8, kind: 'pine' });
      ctx.colliders.push({ x, z, r: Math.max(0.6, 0.72 * s) });
    }
    const g = P.canePineGeo();
    const mat = vegMat('pine', {
      id: 'pine', mat: { roughness: 0.4, metalness: 0.02 },
      uniforms: { uStripe: { value: stripeTex } },
      vertexBody: swayGLSL('aVeg.y', 0.2, 0.85),
      fragmentHead: 'uniform sampler2D uStripe;',
      fragmentBody: `
        { float st = texture2D( uStripe, vVegUv ).r;
          diffuseColor.rgb = mix( diffuseColor.rgb, vVegTint, st ); }`,
    });
    emit('pine', g.geo, mat, items, { castShadow: true });
  }

  // 4 · WHIPPED-CREAM SWIRLS (summit cap) ────────────────────────────────────
  {
    const r = rng(hash('candyveg:cream'));
    const nA = field('cwA', 8101);
    const pts = trim(scatter({
      bounds: { x0: -218, x1: -132, z0: -102, z1: -20 }, cell: 3.1, jitter: 1.0, rand: r,
      density: (x, z) => {
        let d = smoothstep(9.0, 13.5, H(x, z)) * 1.9;
        d *= 0.32 + 0.9 * smoothstep(-0.4, 0.35, fbm(nA, x, z, 0.07, 2));
        return d;
      },
      accept: ok({ tier: 'big', minH: 8.5, maxSlope: 0.95, clear: 0.95, reserve: 1.0 }),
    }), 74, rng(hash('candyveg:cwtrim')));

    const items = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      const s = 0.75 + r() * 0.95;
      const sxv = s * (0.88 + r() * 0.34);
      // a 2.7 u cream swirl is a prop, not ground cover
      if (sxv >= 0.85) ctx.colliders.push({ x, z, r: 0.6 * sxv });
      items.push(lean({
        x, y: H(x, z) - 0.16, z, ry: r() * TAU, rx: (r() - 0.5) * 0.1, rz: (r() - 0.5) * 0.1,
        sx: sxv, sy: s * (0.72 + r() * 0.7), sz: s * (0.88 + r() * 0.34),
        tint: tintOf(r() < 0.7 ? 0xff3355 : 0xff8c1a, r, 0.02, 0.12, 0.08).clone(),
        phase: r() * TAU, align: 0.6,
      }, 0.09, r));
    }
    const g = P.whippedCreamGeo();
    const mat = vegMat('cream', {
      id: 'cream', mat: { roughness: 0.95, metalness: 0 },
      vertexBody: swayGLSL('aVeg.y', 0.14, 0.8),
    });
    emit('cream', g.geo, mat, items, { castShadow: true });
  }

  // 5 · FALLEN CHOCOLATE-BAR LOGS ────────────────────────────────────────────
  {
    const r = rng(hash('candyveg:log'));
    const pts = trim(scatter({
      bounds: { x0: -270, x1: -60, z0: -100, z1: 60 }, cell: 6.2, jitter: 1.0, rand: r,
      density: (x, z) => clearMask(x, z) * (2.2 * nearLM(x, z, 'gummy_forest', 30, 62)
        + 0.9 * nearLM(x, z, 'gumdrop_cliffs', 10, 34) + 0.7 * nearLM(x, z, 'sour_shrine', 8, 28)),
      accept: ok({ tier: 'big', minH: 1.2, maxSlope: 0.55, clear: 0.75, reserve: 1.3 }),
    }), 56, rng(hash('candyveg:logtrim')));

    const items = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      const s = 0.8 + r() * 0.7;
      const ry = r() * TAU;
      const sxv = s * (0.88 + r() * 0.34), syv = s * (0.9 + r() * 0.25), szv = s * (0.82 + r() * 0.66);
      // A 3.5 u bar laid across rolling frosting had one end in the air and a
      // 0.34 rad roll on top of that, so the squares showed daylight under them
      // and read as loose bricks. Now: full ground-align, half the roll, and the
      // slab is sunk to the LOWEST ground under either end.
      const ex = Math.sin(ry) * 1.7 * szv, ez = Math.cos(ry) * 1.7 * szv;
      const gy = Math.min(H(x, z), H(x + ex, z + ez), H(x - ex, z - ez)) - 0.30;
      items.push({
        x, y: gy, z, ry, rz: (r() - 0.5) * 0.16,
        sx: sxv, sy: syv, sz: szv,
        tint: tintOf(0xc99a5e, r, 0.02, 0.1, 0.09).clone(), phase: r() * TAU, align: 1.0,
      });
      // a fallen chocolate bar is a low ORIENTED wall: 1.2 × 3.5 local, and `h`
      // is the top of it, so you can hop over instead of walking round
      ctx.colliders.push({
        x, z, w: 1.28 * sxv, d: 3.55 * szv, rot: -ry, box: true,
        h: gy + 0.95 * syv,
      });
    }
    const g = P.waferLogGeo();
    const mat = vegMat('log', { id: 'log', mat: { roughness: 0.72, metalness: 0.02 } });
    emit('log', g.geo, mat, items, { castShadow: true });
  }

  // 6 · MARSHMALLOW ROCKS ────────────────────────────────────────────────────
  {
    const r = rng(hash('candyveg:marsh'));
    const nA = field('mrA', 7601);
    // scale is capped so that clear(1.75) always exceeds two touching radii —
    // they were interpenetrating each other and the lollipop sticks
    const pts = trim(scatter({
      bounds: BOUNDS, cell: 7.0, jitter: 1.0, rand: r,
      // base density cut hard: on the forest floor these pale cream masses were
      // competing with the bushes for the same silhouette. They belong on the
      // bare slopes, the peak and the cliffs, where they read as rocks.
      density: (x, z) => {
        let d = 0.22 + 0.38 * Math.max(0, fbm(nA, x, z, 0.018, 2));
        d += 1.8 * world.slope(x, z);
        d += 0.9 * nearLM(x, z, 'frosting_peak', 10, 46);
        d += 0.8 * nearLM(x, z, 'gumdrop_cliffs', 6, 30);
        return d * clearMask(x, z);
      },
      accept: ok({ tier: 'big', minH: 0.9, maxSlope: 1.0, clear: 1.8, reserve: 1.75 }),
    }), 74, rng(hash('candyveg:mrtrim')));

    const items = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      const s = 0.54 + r() * 0.78;                      // wider size spread
      const sxv = s * (0.82 + r() * 0.46);
      items.push({
        x, y: H(x, z) - 0.32, z, ry: r() * TAU,
        sx: sxv, sy: s * (0.7 + r() * 0.66), sz: s * (0.82 + r() * 0.46),
        // three creams, not one: toasted, plain and strawberry
        tint: tintOf(r() < 0.6 ? 0xfff6ea : r() < 0.8 ? 0xffd8e8 : 0xf3e0bd, r, 0.026, 0.13, 0.1).clone(),
        phase: r() * TAU, align: 0.85,
      });
      ctx.colliders.push({ x, z, r: Math.max(0.55, 0.92 * sxv), h: H(x, z) + 1.6 * s });   // rocks are rocks
    }
    const g = P.marshmallowGeo();
    const mat = vegMat('marsh', {
      id: 'marsh', mat: { roughness: 0.97, metalness: 0 },
      vertexBody: '{ transformed.y *= 1.0 + 0.022 * sin(uTime * 1.15 + aPhase); }',
    });
    emit('marsh', g.geo, mat, items, { castShadow: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 2 · UNDERSTORY — rings every trunk, then fills the gaps
  // ═══════════════════════════════════════════════════════════════════════════

  // 7 · COTTON-CANDY BUSHES ──────────────────────────────────────────────────
  {
    const r = rng(hash('candyveg:cotton'));
    const nA = field('cotA', 7201);
    // spacing is much tighter than the bush footprint on purpose: skirt bushes
    // are supposed to touch and overlap, that is what makes a thicket
    const accept = ok({ tier: 'skirt', minH: 1.0, maxSlope: 0.62, clear: 0.72, reserve: 0.66 });
    // skirts first: the biggest bushes bank up against the trunks
    const pts = skirt(trunks, {
      rand: r, rMin: 0.95, rMax: 2.2, accept,
      per: (t, rd) => (t.kind === 'gummy'
        ? 2 + (rd() < 0.42 + 0.45 * inForest(t) ? 1 : 0)
        : t.kind === 'pine' ? (rd() < 0.55 ? 2 : 1) : t.big ? 2 : (rd() < 0.5 ? 1 : 0)),
    });
    // then loose thickets in the open, especially along the river
    const open = clusterScatter({
      bounds: BOUNDS, seedCell: 15, rand: r, members: [3, 8], spread: 3.1,
      accept: ok({ tier: 'med', minH: 1.1, maxSlope: 0.6, clear: 0.8, reserve: 0.72 }),
      density: (x, z) => {
        const rd = world.riverDist(x, z);
        let d = 0.28 + 0.55 * Math.max(0, fbm(nA, x, z, 0.021, 3));
        d += 0.9 * band(rd, 4, 8, 14, 26);
        d += 0.95 * nearLM(x, z, 'lollipop_meadow', 14, 44);
        d *= 1 - 0.72 * nearLM(x, z, 'candy_village', 24, 38);
        d *= 1 - smoothstep(10.0, 14.0, H(x, z));
        return d * 0.55 * clearMask(x, z);
      },
    });
    // SKIRTS ARE TRIMMED SEPARATELY from the open thickets. A single global trim
    // shuffles both together, so tightening the budget used to strip the rings
    // off the trunks — the one thing the understory exists to do.
    const all = trim(pts, 250, rng(hash('candyveg:cottontrim')))
      .concat(trim(open, 130, rng(hash('candyveg:cottontrim2'))));

    // three legible sizes, weighted SMALL: big pale puffs were reading as pink
    // boulders and stealing the canopy's silhouette
    const BUCKET = [0.52, 0.74, 0.94];
    const items = [];
    for (let i = 0; i < all.length; i += 2) {
      const x = all[i], z = all[i + 1];
      const q = r();
      const s = BUCKET[q < 0.56 ? 0 : q < 0.86 ? 1 : 2] * (0.86 + r() * 0.3);
      const sxv = s * (0.94 + r() * 0.26);
      // the biggest puffs are chest-high thickets — you go round them.
      // (visual radius ≈ 1.13 × sx; collider ≈ 72% of that, mesh-sized.)
      const visR = 1.13 * sxv;
      // `h` matters: the camera treats a height-less collider as a mass it must
      // dolly in front of or tilt over. A waist-high puff is neither.
      if (visR >= 1.15) ctx.colliders.push({ x, z, r: visR * 0.72, h: H(x, z) + 1.5 * s });
      items.push(lean({
        x, y: H(x, z) - 0.2, z, ry: r() * TAU, rx: (r() - 0.5) * 0.14, rz: (r() - 0.5) * 0.14,
        sx: sxv, sy: s * (0.82 + r() * 0.46), sz: s * (0.94 + r() * 0.26),
        // saturated candyfloss, not pastel rock: lmax keeps them off white
        // narrow hue jitter: wider and the pink puffs drifted into violet and
        // started reading as sugar crystals rather than candyfloss
        tint: tintOf(r() < 0.74 ? 0xff7ec2 : 0x7fcdff, r, 0.018, 0.14, 0.075, 0.82).clone(),
        phase: r() * TAU, align: 0.4,
      }, 0.12, r));
    }
    const g = P.cottonCandyGeo();
    const mat = vegMat('cotton', {
      // FUZZ, not gloss: candyfloss is the one candy in the forest that should
      // NOT shine. High roughness, a soft self-coloured rim, and a dithered bite
      // out of the silhouette so the outline is fibrous instead of faceted.
      id: 'cotton', mat: { roughness: 0.95, metalness: 0 },
      vertexBody: breatheGLSL(0.075, 1.35) + swayGLSL('aVeg.y * 0.45', 0.26, 0.9),
      emissiveBody: fuzzGLSL({ rim: 0.46, cut: 0.64, bite: 1.9 }),
    });
    emit('cotton', g.geo, mat, items, { castShadow: false });
  }

  // 8 · GUMDROP SHRUBS ───────────────────────────────────────────────────────
  {
    const r = rng(hash('candyveg:gumdrop'));
    const nA = field('gdA', 7501);
    const accept = ok({ tier: 'skirt', minH: 1.0, maxSlope: 0.72, clear: 0.46, reserve: 0.42 });
    // tight against the trunk — these are the ones that make a tree sit IN something
    const pts = skirt(trunks, {
      rand: r, rMin: 0.7, rMax: 1.9, accept,
      per: (t, rd) => (t.kind === 'gummy'
        ? 3 + Math.floor(rd() * (2 + 2 * inForest(t)))
        : t.kind === 'pine' ? 1 + Math.floor(rd() * 3) : (t.big ? 2 : 1) + Math.floor(rd() * 2)),
    });
    const open = clusterScatter({
      bounds: BOUNDS, seedCell: 13, rand: r, members: [3, 9], spread: 2.7,
      accept: ok({ tier: 'med', minH: 1.0, maxSlope: 0.72, clear: 0.46, reserve: 0.42 }),
      density: (x, z) => {
        let d = 0.3 + 0.6 * Math.max(0, fbm(nA, x, z, 0.024, 3));
        d += 1.0 * nearLM(x, z, 'gumdrop_cliffs', 8, 36);
        d += 1.7 * nearLM(x, z, 'lollipop_meadow', 16, 46);    // the meadow floor was bald
        d *= 1 - 0.4 * nearLM(x, z, 'candy_village', 24, 38);
        d *= 1 - smoothstep(11, 15, H(x, z));
        return d * 0.55 * clearMask(x, z);
      },
    });
    const all = trim(pts, 400, rng(hash('candyveg:gdtrim')))
      .concat(trim(open, 260, rng(hash('candyveg:gdtrim2'))));

    const BUCKET = [0.55, 0.85, 1.22];
    const items = [];
    for (let i = 0; i < all.length; i += 2) {
      const x = all[i], z = all[i + 1];
      const s = BUCKET[Math.floor(r() * 3)] * (0.82 + r() * 0.4);
      const sxv = s * (0.88 + r() * 0.3);
      // Only the BIGGEST sugared domes are solid. A meadow floored with
      // knee-high colliders is miserable to cross and, worse, the camera reads
      // a height-less collider as a wall and dollies in on the player.
      const visR = 0.8 * sxv;
      if (visR >= 1.25) ctx.colliders.push({ x, z, r: visR * 0.8, h: H(x, z) + 1.45 * s });
      items.push(lean({
        x, y: H(x, z) - 0.2, z, ry: r() * TAU, rx: (r() - 0.5) * 0.12, rz: (r() - 0.5) * 0.12,
        sx: sxv, sy: s * (0.7 + r() * 0.7), sz: s * (0.88 + r() * 0.3),
        tint: tintOf(CANDY.sprinkle[(i / 2) % CANDY.sprinkle.length], r, 0.03, 0.14, 0.1).clone(),
        phase: r() * TAU, align: 0.75,
      }, 0.055, r));
    }
    const g = P.gumdropGeo();
    const mat = vegMat('gumdrop', {
      // same material family as the bears, dialled to HARD gloss: a gumdrop is a
      // sugared shell, so it keeps a tight bright highlight and only a whisper of
      // the subsurface bleed the gummies get.
      id: 'gumdrop', mat: { roughness: 0.3, metalness: 0.05 },
      vertexBody: breatheGLSL(0.035, 1.1),
      emissiveBody: candyFinishGLSL({ sss: 0.16, rim: 0.34, rimPow: 2.8, spec: 1.0, specPow: 70, glow: 0.08 }),
    });
    emit('gumdrop', g.geo, mat, items, { castShadow: false });
  }

  // 9 · ROOT MATS — clumped grass hugging trunk roots and path edges ─────────
  {
    const r = rng(hash('candyveg:mat'));
    const accept = ok({ tier: 'mat', minH: 0.85, maxSlope: 0.85, clear: 0.5, reserve: 0.46 });
    // EVERY trunk gets a ring — that plus the geometric root flare is what makes
    // a trunk grow out of the ground instead of being posted into it.
    const pts = skirt(trunks, {
      rand: r, rMin: 0.45, rMax: 1.5, accept, spread: 0.9,
      per: (t, rd) => (t.kind === 'gummy' ? 3 + Math.floor(rd() * (1 + 2 * inForest(t)))
        : t.kind === 'pine' ? 2 + Math.floor(rd() * 2) : t.big ? 3 : 2),
    });
    const loose = [];
    // path verges: licorice paths should be fringed, not kerbed
    for (const p of world.PATHS) {
      if (p.island !== 'candy') continue;
      for (const v of alongPath(p.points, {
        step: 3.4, offset: p.width * 0.5 + 1.6, wobble: 1.5, rand: r, accept,
      })) loose.push(v);
    }
    // and the river banks + the bald half of the Lollipop Meadow
    for (const v of scatter({
      bounds: BOUNDS, cell: 4.4, jitter: 1.0, rand: r,
      density: (x, z) => 0.55 * band(world.riverDist(x, z), 3.5, 6, 13, 24)
        + 1.5 * nearLM(x, z, 'lollipop_meadow', 14, 44),
      accept,
    })) loose.push(v);
    const all = trim(pts, 380, rng(hash('candyveg:mattrim')))
      .concat(trim(loose, 260, rng(hash('candyveg:mattrim2'))));

    const items = [];
    for (let i = 0; i < all.length; i += 2) {
      const x = all[i], z = all[i + 1];
      const s = 0.86 + r() * 0.7;
      items.push(lean({
        x, y: H(x, z) - 0.12, z, ry: r() * TAU,
        sx: s * (0.9 + r() * 0.26), sy: s * (0.8 + r() * 0.55), sz: s * (0.9 + r() * 0.26),
        tint: grassTint(r, i / 2).clone(),
        phase: r() * TAU, align: 0.85,
      }, 0.16, r));
    }
    const g = P.rootMatGeo();
    const mat = vegMat('mat', {
      id: 'mat', mat: { roughness: 0.85, metalness: 0, side: THREE.DoubleSide },
      vertexBody: swayGLSL('aVeg.y', 0.32, 1.9),
    });
    emit('mat', g.geo, mat, items, { castShadow: false });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 3 · DETAIL
  // ═══════════════════════════════════════════════════════════════════════════

  // 10 · CANDY CANES along the Syrup River ───────────────────────────────────
  {
    const r = rng(hash('candyveg:cane'));
    const nA = field('cnA', 7251);
    const pts = trim(scatter({
      bounds: { x0: -196, x1: -78, z0: -66, z1: 104 }, cell: 2.1, jitter: 1.0, rand: r,
      density: (x, z) => {
        let d = band(world.riverDist(x, z), 4.2, 6.2, 11, 18) * 1.6;
        d *= 0.4 + 0.85 * smoothstep(-0.35, 0.35, fbm(nA, x, z, 0.08, 2));
        return d;
      },
      // maxSlope 0.6: above that the terrain MESH dips below world.height() between
      // its vertices and a cane planted on the sample point hangs in mid-air on
      // Frosting Peak's flanks. Plus a deeper sink and a real ground-align, so
      // the stalk leans with the hill instead of standing plumb out of it.
      accept: (() => {
        const base = ok({ tier: 'med', minH: 0.8, maxSlope: 0.6, pathMargin: 1.0, clear: 0.55, reserve: 0.5 });
        // …and never on the LIP of a drop: slope() is smooth, the terrain mesh
        // is not, and a cane planted 1 u from an 0.9 u step hangs over thin air
        return (x, z) => {
          const h = H(x, z);
          for (const d of [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]]) if (h - H(x + d[0], z + d[1]) > 0.8) return false;
          return base(x, z);
        };
      })(),
    }), 132, rng(hash('candyveg:canetrim')));

    const CANE = [0xff2f49, 0xff2f49, 0xff2f49, 0x4fd67a, 0xff6fb0];
    const items = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      const s = 0.72 + r() * 0.72;
      items.push(lean({
        x, y: H(x, z) - 0.35, z,
        ry: r() * TAU, rx: (r() - 0.5) * 0.16, rz: (r() - 0.5) * 0.16,
        sx: s * (0.94 + r() * 0.12), sy: s * (0.85 + r() * 0.5), sz: s * (0.94 + r() * 0.12),
        tint: tintOf(CANE[(i / 2) % CANE.length], r, 0.014, 0.1, 0.07).clone(),
        phase: r() * TAU, align: 0.55,
      }, 0.2, r));
    }
    const g = P.candyCaneGeo();
    const mat = vegMat('cane', {
      id: 'cane', mat: { roughness: 0.36, metalness: 0.03 },
      uniforms: { uStripe: { value: stripeTex } },
      vertexBody: swayGLSL('aVeg.y', 0.55, 1.6),
      fragmentHead: 'uniform sampler2D uStripe;',
      fragmentBody: `
        { float st = texture2D( uStripe, vVegUv ).r;
          diffuseColor.rgb = mix( diffuseColor.rgb, vVegTint, st ); }`,
    });
    emit('cane', g.geo, mat, items, { castShadow: false });
  }

  // 11 · CARAMEL CATTAILS wading the Chocolate Lake shallows ─────────────────
  {
    const r = rng(hash('candyveg:reed'));
    const nA = field('rdA', 8001);
    const pts = trim(scatter({
      bounds: { x0: -228, x1: -172, z0: 20, z1: 76 }, cell: 2.2, jitter: 1.0, rand: r,
      density: (x, z) => {
        const d = dLake(x, z);
        let v = band(d, 10.5, 12.5, 17.5, 21) * 2.4;
        v *= 0.35 + 0.85 * smoothstep(-0.35, 0.35, fbm(nA, x, z, 0.09, 2));
        return v;
      },
      // minH 0.7 so they may stand on the lake bed (floor 0.8) and emerge
      accept: ok({ tier: 'med', minH: 0.7, maxSlope: 0.7, clear: 0.55, reserve: 0.5, avoidLake: false }),
    }), 96, rng(hash('candyveg:rdtrim')));

    const items = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      const s = 0.78 + r() * 0.7;
      items.push(lean({
        x, y: H(x, z) - 0.12, z, ry: r() * TAU, rx: (r() - 0.5) * 0.12, rz: (r() - 0.5) * 0.12,
        sx: s * (0.94 + r() * 0.12), sy: s * (0.85 + r() * 0.6), sz: s * (0.94 + r() * 0.12),
        tint: tintOf(CANDY.caramel, r, 0.02, 0.14, 0.1).clone(), phase: r() * TAU,
      }, 0.22, r));
    }
    const g = P.caramelReedGeo();
    const mat = vegMat('reed', {
      id: 'reed', mat: { roughness: 0.55, metalness: 0.02 },
      vertexBody: swayGLSL('aVeg.y', 0.46, 1.45),
    });
    emit('reed', g.geo, mat, items, { castShadow: false });
  }

  // 12 · WAFER LILY PADS — clamped to the water surface ──────────────────────
  {
    const r = rng(hash('candyveg:lily'));
    const SURF = LAKE.surface;
    const pts = trim(scatter({
      bounds: { x0: -215, x1: -185, z0: 33, z1: 63 }, cell: 1.7, jitter: 1.0, rand: r,
      density: (x, z) => falloff(dLake(x, z), 4, 12.5) * 1.1,
      accept: (x, z) => {
        // only where there is actually chocolate under them: inside r=12 AND
        // genuinely submerged, so no pad ends up parked on the west bank
        if (dLake(x, z) > 12.0) return false;
        if (H(x, z) > SURF - 0.45) return false;
        if (world.onPath(x, z, 1.0)) return false;
        if (!occSmall.free(x, z, 0.72)) return false;
        occSmall.add(x, z, 0.68);
        return true;
      },
    }), 54, rng(hash('candyveg:lilytrim')));

    const items = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      const s = 0.8 + r() * 0.72;
      items.push({
        // CLAMPED to the chocolate surface, exactly. The pad's own geometry sits
        // 0.02 above its origin, which is all the clearance a floating pad needs.
        x, y: SURF, z, ry: r() * TAU,
        sx: s * (0.94 + r() * 0.12), sy: s, sz: s * (0.94 + r() * 0.12),
        tint: tintOf(CANDY.sprinkle[(i / 2) % CANDY.sprinkle.length], r, 0.03, 0.12, 0.08).clone(),
        phase: r() * TAU,
      });
    }
    const g = P.lilyPadGeo();
    const mat = vegMat('lily', {
      // DoubleSide: a single-sided disc at eye level over the lake vanished from
      // below and the ones that stayed read as flat shards hanging over it.
      id: 'lily', mat: { roughness: 0.65, metalness: 0, side: THREE.DoubleSide },
      // drift on the surface, never ABOVE it: the vertical bob is gone and the
      // pad rocks in place instead
      vertexBody: `
        { float t = uTime * 0.85 + aPhase;
          transformed.y += max(0.0, sin(t)) * 0.012;
          transformed.x += sin(t * 0.63) * 0.06;
          transformed.z += cos(t * 0.51 + 1.0) * 0.06; }`,
    });
    emit('lily', g.geo, mat, items, { castShadow: false });
  }

  // 13 · SUGAR CRYSTALS ──────────────────────────────────────────────────────
  {
    const r = rng(hash('candyveg:crystal'));
    const nA = field('crA', 7801);
    const pts = trim(clusterScatter({
      bounds: { x0: -260, x1: -95, z0: -106, z1: 30 }, seedCell: 6.5, rand: r, members: [3, 10], spread: 2.3,
      density: (x, z) => {
        let d = 1.9 * falloff(dLM(x, z, 'frosting_peak'), 18, 58);
        d += 0.7 * nearLM(x, z, 'sour_shrine', 4, 24);
        d += 0.5 * nearLM(x, z, 'gumdrop_cliffs', 5, 24);
        d += 0.35 * smoothstep(8, 12.5, H(x, z));
        d *= 0.4 + 0.8 * smoothstep(-0.3, 0.35, fbm(nA, x, z, 0.045, 2));
        return d * 0.85;
      },
      accept: ok({ tier: 'med', minH: 1.5, maxSlope: 0.9, clear: 0.55, reserve: 0.5 }),
    }), 132, rng(hash('candyveg:crtrim')));

    // jewel hues, not white: pure white shards vanish against the frosting at night
    const ICE = [0x8fd8ff, 0xff9fe0, 0x9fffd8, 0xc8d0ff, 0x8fd8ff, 0xffe28f];
    const items = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      const s = 0.6 + r() * 0.95;
      const sxv = s * (0.82 + r() * 0.36);
      // a waist-high cluster of rock sugar is not something you walk through
      if (sxv >= 0.72) ctx.colliders.push({ x, z, r: 0.66 * sxv, h: H(x, z) + 1.7 * s });
      items.push({
        x, y: H(x, z) - 0.2, z, ry: r() * TAU, rx: (r() - 0.5) * 0.2, rz: (r() - 0.5) * 0.3,
        sx: sxv, sy: s * (0.68 + r() * 0.94), sz: s * (0.82 + r() * 0.36),
        tint: tintOf(ICE[(i / 2) % ICE.length], r, 0.035, 0.15, 0.08).clone(),
        phase: r() * TAU, align: 0.7,
      });
    }
    // ── THE SUGAR RING (forest clearing 2, -192,25) ──────────────────────────
    // Twelve big crystals stood in a deliberate circle. Authored, not scattered:
    // a ring only reads as a ring if it IS one. At night the whole circle
    // twinkles, which is the point of walking out here after dark.
    {
      const C = CLEARINGS[1];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU + 0.24;
        const rr = C.r * 0.56 + (k % 3) * 0.28;
        const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
        const s = 1.3 + (k % 4) * 0.24;
        ctx.colliders.push({ x, z, r: 0.62 * s });
        items.push({
          x, y: H(x, z) - 0.22, z, ry: a + 0.4, rx: (r() - 0.5) * 0.1, rz: (r() - 0.5) * 0.1,
          sx: s * 0.82, sy: s * (1.0 + (k % 3) * 0.22), sz: s * 0.82,
          tint: tintOf(ICE[k % ICE.length], r, 0.02, 0.1, 0.06).clone(),
          phase: (k / 12) * TAU, align: 0.6,
        });
      }
    }
    const g = P.sugarCrystalGeo();
    const mat = vegMat('crystal', {
      id: 'crystal', mat: { roughness: 0.18, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 1 },
      vertexBody: '{ transformed.xz *= 1.0 + 0.02 * sin(uTime * 2.0 + aPhase); }',
      emissiveBody: `
        { float tw = 0.42 + 0.58 * pow( max(0.0, sin(uTime * 1.6 + vVegPhase * 3.7)), 2.0 );
          totalEmissiveRadiance *= vVegTint * tw * ( 0.12 + 2.3 * uNight ); }`,
    });
    emit('crystal', g.geo, mat, items, { castShadow: false });
  }

  // 14 · JELLY-BEAN PEBBLE CLUSTERS — a few real piles, not confetti ─────────
  {
    const r = rng(hash('candyveg:bean'));
    const pts = trim(clusterScatter({
      bounds: BOUNDS, seedCell: 13, rand: r, members: [2, 5], spread: 1.5,
      density: (x, z) => {
        const np = world.nearestPath(x, z, 'candy');
        let d = 0.8 * band(np.d, 1.5, 3.0, 6, 11);
        d += 0.7 * band(world.riverDist(x, z), 3.5, 6, 11, 18);
        d += 0.3 * nearLM(x, z, 'gumdrop_cliffs', 6, 26);
        return d * 0.85;
      },
      accept: ok({ tier: 'med', minH: 0.8, maxSlope: 0.8, clear: 0.5, reserve: 0.45 }),
    }), 52, rng(hash('candyveg:bntrim')));

    const items = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      const s = 0.85 + r() * 0.85;
      items.push({
        x, y: H(x, z) - 0.14, z, ry: r() * TAU,
        sx: s * (0.9 + r() * 0.24), sy: s * (0.8 + r() * 0.4), sz: s * (0.9 + r() * 0.24),
        tint: tintOf(CANDY.sprinkle[(i / 2 + 3) % CANDY.sprinkle.length], r, 0.035, 0.16, 0.1).clone(),
        phase: r() * TAU, align: 0.95,
      });
    }
    const g = P.jellyBeanGeo();
    const mat = vegMat('bean', { id: 'bean', mat: { roughness: 0.3, metalness: 0.05 } });
    emit('bean', g.geo, mat, items, { castShadow: false });
  }

  // 15 · PEPPERMINT PINWHEELS — rows along the licorice paths ────────────────
  {
    const r = rng(hash('candyveg:mint'));
    const nA = field('mintA', 7401);
    // clear/reserve 0.72/0.66: the pinwheel disc is 0.4 × sx wide and sx runs to
    // ~1.5, so the old 0.3 spacing let four heads occupy one square metre and the
    // meadow grew HEAPS of interpenetrating cones. Spacing now exceeds the disc.
    const accept = ok({ tier: 'small', minH: 0.9, maxSlope: 0.62, pathMargin: 1.2, clear: 0.72, reserve: 0.66 });
    const pts = [];
    for (const p of world.PATHS) {
      if (p.island !== 'candy') continue;
      for (const v of alongPath(p.points, {
        step: 2.8, offset: p.width * 0.5 + 2.4, wobble: 1.9, rand: r, accept,
      })) pts.push(v);
    }
    for (const v of clusterScatter({
      bounds: BOUNDS, seedCell: 12, rand: r, members: [3, 8], spread: 3.3, accept,
      density: (x, z) => {
        let d = 0.3 + 0.6 * Math.max(0, fbm(nA, x, z, 0.026, 3));
        d += 0.5 * band(world.riverDist(x, z), 4, 8, 16, 30);
        d *= 1 - 0.5 * nearLM(x, z, 'gummy_forest', 16, 42);
        d *= 1 - smoothstep(10, 14, H(x, z));
        return d * 0.85 * clearMask(x, z);
      },
    })) pts.push(v);
    // ── PEPPERMINT DRIFTS (Lollipop Meadow) ──────────────────────────────────
    // Their own sampler with their own budget, so the meadow's floor cannot be
    // shuffled away by the island-wide trim. Round 2's meadow shot was 40% bare
    // licorice junction; these are big tight banks of pinwheels either side of it.
    const drifts = trim(clusterScatter({
      bounds: { x0: -146, x1: -74, z0: -80, z1: -10 }, seedCell: 6.5, rand: r,
      members: [7, 16], spread: 2.5, accept,
      density: (x, z) => 2.2 * nearLM(x, z, 'lollipop_meadow', 8, 32) * (1 - smoothstep(9, 13, H(x, z))),
    }), 150, rng(hash('candyveg:mintdrift')));
    const all = trim(pts, 250, rng(hash('candyveg:minttrim'))).concat(drifts);

    const MINT = [0xff3355, 0xff6fb0, 0x5be27a, 0xb35bff, 0x3aa8ff, 0xff3355];
    const items = [];
    for (let i = 0; i < all.length; i += 2) {
      const x = all[i], z = all[i + 1];
      const s = 0.8 + r() * 0.6;
      items.push(lean({
        x, y: H(x, z) - 0.08, z,
        // small lean only: a big random tilt on a flat slope drove heads into the ground
        ry: r() * TAU, rx: (r() - 0.5) * 0.2, rz: (r() - 0.5) * 0.2,
        sx: s * (0.94 + r() * 0.14), sy: s * (0.88 + r() * 0.34), sz: s * (0.94 + r() * 0.14),
        tint: tintOf(MINT[(i / 2) % MINT.length], r, 0.026, 0.12, 0.08).clone(),
        phase: r() * TAU, align: 0.2,
      }, 0.14, r));
    }
    const g = P.peppermintGeo();
    const mat = vegMat('mint', {
      id: 'mint', mat: { roughness: 0.34, metalness: 0.04, side: THREE.DoubleSide },
      uniforms: { uSwirl: { value: mintTex } },
      vertexBody: `
        { float t = uTime * 1.9 + aPhase;
          float w = aVeg.y > 0.5 ? 1.0 : position.y * 1.4;
          transformed.x += sin(t) * 0.07 * w * uWind;
          transformed.z += cos(t * 0.8 + 0.6) * 0.05 * w * uWind; }`,
      fragmentHead: 'uniform sampler2D uSwirl;',
      fragmentBody: `
        { float sw = texture2D( uSwirl, vVegUv ).r;
          diffuseColor.rgb = mix( diffuseColor.rgb, vVegTint, sw ); }`,
    });
    emit('mint', g.geo, mat, items, { castShadow: false });
  }

  // 16 · SPRINKLE GRASS — the loose fill between the mats ────────────────────
  {
    const r = rng(hash('candyveg:grass'));
    const nA = field('grA', 7901), nB = field('grB', 7902);
    const pts = trim(scatter({
      bounds: BOUNDS, cell: 3.0, jitter: 1.0, rand: r,
      density: (x, z) => {
        let d = 0.4 + 0.8 * Math.max(0, fbm(nA, x, z, 0.035, 3));
        d += 0.4 * Math.max(0, fbm(nB, x, z, 0.11, 2));
        d += 1.3 * nearLM(x, z, 'lollipop_meadow', 16, 46);   // the meadow reads as LAWN
        d *= 1 - 0.5 * smoothstep(11, 15.5, H(x, z));
        return d * 1.0;
      },
      accept: ok({ tier: 'small', minH: 0.85, maxSlope: 0.85, clear: 0.36, reserve: 0.32 }),
    }), 660, rng(hash('candyveg:grtrim')));

    const items = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      const s = 0.8 + r() * 0.6;
      items.push(lean({
        x, y: H(x, z) - 0.12, z, ry: r() * TAU,
        sx: s * (0.9 + r() * 0.26), sy: s * (0.82 + r() * 0.5), sz: s,
        tint: grassTint(r, i / 2).clone(),
        phase: r() * TAU, align: 0.8,
      }, 0.2, r));
    }
    const g = P.sprinkleGrassGeo();
    const mat = vegMat('grass', {
      id: 'grass', mat: { roughness: 0.85, metalness: 0, side: THREE.DoubleSide },
      vertexBody: swayGLSL('aVeg.y', 0.38, 2.1),
    });
    emit('grass', g.geo, mat, items, { castShadow: false });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 3b · AUTHORED ONE-OFFS
  // Three hand-placed things, each its own merged mesh: the picnic in Gummy
  // Forest clearing 1, the cairn in clearing 2, and THE BITTEN POP.
  // ═══════════════════════════════════════════════════════════════════════════

  /** Blank my own small instances inside a radius, so authored props are not
   *  buried in ground cover (PASS 4 only culls against FOREIGN colliders). */
  function clearAround(cx, cz, rad, ids) {
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (const rec of meshes) {
      if (ids && !ids.includes(rec.id)) continue;
      let touched = false;
      for (let i = 0; i < rec.n; i++) {
        rec.mesh.getMatrixAt(i, m4); m4.decompose(p, q, s);
        if (s.x === 0) continue;
        if ((p.x - cx) ** 2 + (p.z - cz) ** 2 > rad * rad) continue;
        _m4.compose(p, q, _s.set(0, 0, 0));
        rec.mesh.setMatrixAt(i, _m4); touched = true;
      }
      if (touched) rec.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  const GROUNDCOVER = ['mat', 'grass', 'mint', 'bean', 'cotton', 'gumdrop', 'cane', 'marsh', 'log'];

  function addExtra(id, geo, mat, o = {}) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'candyveg_' + id;
    mesh.castShadow = o.castShadow !== false; mesh.receiveShadow = true;
    // mobile: props do not cast; the bitten pop is a hero beat and keeps its shadow
    if (MOBILE && !/^bitten$/.test(id)) mesh.castShadow = false;
    if (o.position) mesh.position.set(...o.position);
    if (o.rotationY) mesh.rotation.y = o.rotationY;
    group.add(mesh);
    const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    totalTris += tris; if (mesh.castShadow) shadowTris += tris;
    extras.push({ id, mesh, tris });
    return mesh;
  }

  // 17 · CLEARING FURNITURE ──────────────────────────────────────────────────
  {
    const r = rng(hash('candyveg:clearing'));
    const k = new P.Kit();
    const F = { tint: 0, motion: 0, uv: P.UV_FLAT };
    const put = (geo, m, color) => k.add(geo, { m, color, ...F });
    const icoG = (rad) => new THREE.IcosahedronGeometry(rad, 0);
    const octG = (rad) => new THREE.OctahedronGeometry(rad, 0);
    const cylG = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg);
    const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const domeG = (rad) => new THREE.SphereGeometry(rad, 8, 4, 0, TAU, 0, Math.PI * 0.56);

    // ── A · THE BEARS' PICNIC ────────────────────────────────────────────────
    const A = CLEARINGS[0], ay = H(A.x, A.z);
    put(boxG(1.1, 0.5, 1.1), P.M({ p: [A.x, ay + 0.2, A.z], r: [0, 0.4, 0] }), 0x5e3a1e);
    put(cylG(0.34, 0.44, 1.2, 8), P.M({ p: [A.x, ay + 1.0, A.z] }), 0x8a5a34);
    put(cylG(1.9, 1.86, 0.3, 14), P.M({ p: [A.x, ay + 1.72, A.z] }), 0xe6cd97);        // wafer table top
    put(cylG(1.96, 1.96, 0.08, 14), P.M({ p: [A.x, ay + 1.9, A.z] }), 0xf7e8c6);       // icing skim
    // the spread: a cupcake, a jug of syrup and three sugar cubes
    put(cylG(0.3, 0.25, 0.34, 8), P.M({ p: [A.x + 0.55, ay + 2.11, A.z - 0.25] }), 0xe8b26a);
    put(octG(0.28), P.M({ p: [A.x + 0.55, ay + 2.4, A.z - 0.25], s: [1.1, 0.9, 1.1] }), 0xfff0e4);
    put(octG(0.1), P.M({ p: [A.x + 0.55, ay + 2.66, A.z - 0.25] }), 0xff3355);
    put(cylG(0.26, 0.32, 0.5, 7), P.M({ p: [A.x - 0.6, ay + 2.19, A.z + 0.3] }), 0xb35bff);
    for (let c = 0; c < 3; c++) {
      put(boxG(0.19, 0.19, 0.19), P.M({ p: [A.x - 0.2 + c * 0.24, ay + 2.04 + (c % 2) * 0.19, A.z - 0.7], r: [0.2, c, 0.1] }), 0xfffaf0);
    }
    // five bears, on gumdrop stools, all facing in. Nobody has moved.
    const BEARC = [CANDY.gummyRed, CANDY.gummyGreen, CANDY.gummyOrange, CANDY.gummyPurple, CANDY.gummyYellow];
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * TAU + 0.35;
      const bx = A.x + Math.cos(a) * 2.85, bz = A.z + Math.sin(a) * 2.85;
      const by = H(bx, bz);
      const yaw = Math.atan2(A.x - bx, A.z - bz);
      const hex = BEARC[b];
      put(domeG(0.6), P.M({ p: [bx, by + 0.02, bz], s: [1, 1.15, 1] }), CANDY.sprinkle[(b * 2) % CANDY.sprinkle.length]);
      const Wm = P.M({ p: [bx, by + 0.66, bz], r: [0, yaw, 0], s: 1.16 + (b % 3) * 0.09 });
      const put2 = (geo, local, color) => k.add(geo, { m: new THREE.Matrix4().multiplyMatrices(Wm, local), color, ...F });
      put2(icoG(0.42), P.M({ p: [0, 0.4, 0], s: [1.16, 1.02, 1.0] }), hex);
      put2(icoG(0.3), P.M({ p: [0, 0.95, 0.05], s: [1.0, 0.96, 0.96] }), hex);
      put2(octG(0.13), P.M({ p: [-0.23, 1.14, 0.02] }), hex);
      put2(octG(0.13), P.M({ p: [0.23, 1.14, 0.02] }), hex);
      put2(octG(0.17), P.M({ p: [-0.47, 0.48, 0.2], r: [0, 0, 0.62], s: [1.4, 0.8, 0.8] }), hex);
      put2(octG(0.17), P.M({ p: [0.47, 0.48, 0.2], r: [0, 0, -0.62], s: [1.4, 0.8, 0.8] }), hex);
      put2(octG(0.2), P.M({ p: [-0.24, 0.14, 0.38], s: [1.0, 0.7, 1.55] }), hex);
      put2(octG(0.2), P.M({ p: [0.24, 0.14, 0.38], s: [1.0, 0.7, 1.55] }), hex);
      put2(octG(0.055), P.M({ p: [-0.11, 1.0, 0.27], s: [1, 1, 0.4] }), 0x33121c);
      put2(octG(0.055), P.M({ p: [0.11, 1.0, 0.27], s: [1, 1, 0.4] }), 0x33121c);
      ctx.colliders.push({ x: bx, z: bz, r: 0.7 });
    }
    ctx.colliders.push({ x: A.x, z: A.z, r: 2.1 });

    // ── the picnic FLOOR ─────────────────────────────────────────────────────
    // Clearing 1 was a bald disc of frosting swirl with furniture standing on it.
    // A checked blanket, a fallen cup, a scatter of crumbs and three sugar cubes
    // give the ground something to be: somebody sat here.
    {
      const bAng = 1.0, cb = Math.cos(bAng), sb = Math.sin(bAng);
      const bx = A.x + cb * 4.3, bz = A.z + sb * 4.3, by = H(bx, bz);
      // sink the slab to the LOWEST ground it covers, so no corner hovers over
      // the frosting's detail noise (±0.3 over an 8 u wavelength)
      let gmin = by;
      for (const [ox, oz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) gmin = Math.min(gmin, H(bx + ox, bz + oz));
      // 0.1 proud of the ground was invisible — the terrain mesh's own triangles
      // swallowed it. A blanket over grass is allowed to have loft.
      const TOP = gmin + 0.32;
      const lay = (dx, dz, w, d, h, y, col) => {
        const px = bx + Math.cos(bAng) * dx - Math.sin(bAng) * dz;
        const pz = bz + Math.sin(bAng) * dx + Math.cos(bAng) * dz;
        put(boxG(w, h, d), P.M({ p: [px, y, pz], r: [0, bAng, 0] }), col);
      };
      lay(0, 0, 3.4, 3.4, 0.62, TOP - 0.31, 0xf2e2ea);           // blanket ground
      for (const [dx, dz] of [[-0.82, -0.82], [0.82, -0.82], [-0.82, 0.82], [0.82, 0.82]]) {
        lay(dx, dz, 1.44, 1.44, 0.1, TOP + 0.04, 0xd94a72);      // the check
      }
      lay(0, 1.74, 3.5, 0.2, 0.16, TOP + 0.02, 0xfbeff2);        // a rucked-up hem
      // a tipped-over cup on the blanket, and two upright by the table
      put(cylG(0.18, 0.15, 0.3, 7), P.M({ p: [bx + 0.7, TOP + 0.2, bz - 0.5], r: [1.45, 0.4, 0] }), 0xfff3e2);
      put(cylG(0.15, 0.12, 0.3, 7), P.M({ p: [A.x + 1.9, H(A.x + 1.9, A.z + 1.1) + 0.16, A.z + 1.1] }), 0xfff3e2);
      put(cylG(0.15, 0.12, 0.3, 7), P.M({ p: [A.x - 1.4, H(A.x - 1.4, A.z + 2.0) + 0.16, A.z + 2.0] }), 0xd9e8ff);
      // crumbs: wafer chips, sprinkles and a dropped gumdrop, right where a
      // clumsy bear would have dropped them
      const CRUMB = [0xe6cd97, 0xf7e8c6, 0xff3355, 0x5be27a, 0xffe23a, 0xb35bff];
      for (let c = 0; c < 16; c++) {
        const a = r() * TAU, rr = 1.3 + r() * 3.4;
        const cx = A.x + Math.cos(a) * rr, cz = A.z + Math.sin(a) * rr;
        const sc = 0.07 + r() * 0.1;
        put(boxG(sc * 2.2, sc * 0.8, sc * 1.6),
          P.M({ p: [cx, H(cx, cz) + sc * 0.4, cz], r: [(r() - 0.5) * 0.4, r() * TAU, (r() - 0.5) * 0.4] }),
          CRUMB[c % CRUMB.length]);
      }
      put(domeG(0.3), P.M({ p: [A.x + 2.6, H(A.x + 2.6, A.z - 1.9) + 0.02, A.z - 1.9], s: [1, 1.2, 1] }), 0x5be27a);
    }

    // ── B · THE SUGAR CAIRN, in the middle of the crystal ring ───────────────
    const B = CLEARINGS[1], by0 = H(B.x, B.z);
    put(cylG(1.7, 1.86, 0.34, 11), P.M({ p: [B.x, by0 + 0.05, B.z] }), 0x8a6a42);   // warm plinth: the stack needs a dark foot to silhouette
    put(cylG(1.5, 1.6, 0.2, 11), P.M({ p: [B.x, by0 + 0.36, B.z] }), 0xefe4cd);
    put(octG(0.92), P.M({ p: [B.x, by0 + 0.92, B.z], s: [1.1, 0.95, 1.1], r: [0, 0.4, 0] }), 0xfff6ea);
    put(octG(0.7), P.M({ p: [B.x + 0.12, by0 + 1.82, B.z - 0.07], s: [1.05, 1.0, 1.05], r: [0, 1.3, 0.08] }), 0xf0e6ff);
    put(octG(0.46), P.M({ p: [B.x - 0.06, by0 + 2.6, B.z + 0.1], r: [0.1, 2.2, 0] }), 0xffffff);
    put(octG(0.2), P.M({ p: [B.x, by0 + 3.16, B.z], s: [1, 1.2, 1] }), 0x8fd8ff);
    for (let c = 0; c < 10; c++) {   // sugar cubes marking the circle on the ground
      const a = (c / 10) * TAU + 0.75, rr = B.r * 0.56 - 0.9;
      const cx = B.x + Math.cos(a) * rr, cz = B.z + Math.sin(a) * rr;
      put(boxG(0.26, 0.26, 0.26), P.M({ p: [cx, H(cx, cz) + 0.1, cz], r: [0.1, a, 0.08] }), 0xfffaf0);
    }
    ctx.colliders.push({ x: B.x, z: B.z, r: 1.35 });

    const geo = k.build();
    addExtra('clearings', geo, new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.44, metalness: 0.05, flatShading: true,
    }));
    clearAround(A.x, A.z, 4.6, GROUNDCOVER);
    clearAround(B.x, B.z, 2.6, GROUNDCOVER);

    landmarksOfNote.push({
      id: 'veg_bear_picnic', x: A.x, z: A.z + 3.6, y: ay + 2.2, r: 3.8, label: 'Join the picnic',
      speaker: 'The Bears’ Picnic', colors: [0xff3355, 0x5be27a, 0xffe23a],
      line: 'Five bears, one wafer table, tea for five. Nobody has moved in a very long time. There is a sixth stool and it is warm.',
    });
    landmarksOfNote.push({
      id: 'veg_sugar_ring', x: B.x, z: B.z + 2.4, y: by0 + 2.2, r: 3.4, label: 'Stand in the ring',
      speaker: 'The Sugar Ring', colors: [0x8fd8ff, 0xffffff, 0xff9fe0],
      line: 'Twelve crystals in a circle, grown not placed. Inside the ring it is noticeably quieter. The Sour Patch Kids walk around it.',
    });
  }

  // 18 · THE BITTEN POP — one lollipop with a bite out of it, near (-120,-20) ─
  {
    const r = rng(hash('candyveg:bitten'));
    let spot = null;
    for (let i = 0; i < 90 && !spot; i++) {
      const a = i * 2.3999632, rr = 1.5 + i * 0.34;
      const x = -120 + Math.cos(a) * rr, z = -20 + Math.sin(a) * rr;
      if (!world.isFreeGround(x, z, { pathMargin: 3.4, riverMargin: 5, minHeight: 1.3 })) continue;
      if (world.slope(x, z) > 0.3) continue;
      spot = { x, z };
    }
    if (!spot) spot = { x: -124, z: -18 };
    const gy = H(spot.x, spot.z) - 0.15;

    const R = 3.05, T = 0.62, STICK = 6.4, SR = 0.5, SEG = 52;
    const HY = STICK + R * 0.82;
    // the bite: one mouth-sized scallop out of the rim with two tooth notches
    // beside it. rad(θ) is the near intersection of the ray with each bite disc.
    const BITES = [[2.05, 0.92], [1.72, 0.3], [2.38, 0.3]];
    const rad = (th) => {
      let out = R;
      for (const [ba, br] of BITES) {
        const d = th - ba, c = Math.cos(d), sp = R * Math.sin(d);
        if (c <= 0 || Math.abs(sp) >= br) continue;
        out = Math.min(out, Math.max(0.3, R * c - Math.sqrt(br * br - sp * sp)));
      }
      return out;
    };
    const k = new P.Kit();
    const mk = (pos, uv) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    };
    const faceF = [], uvF = [], faceB = [], uvB = [], rim = [], uvR = [];
    const UVD = (x, y) => [x / (R * 2) + 0.5, y / (R * 2) + 0.5];
    for (let i = 0; i < SEG; i++) {
      const t0 = (i / SEG) * TAU, t1 = ((i + 1) / SEG) * TAU;
      const r0 = rad(t0), r1 = rad(t1);
      const x0 = Math.cos(t0) * r0, y0 = Math.sin(t0) * r0;
      const x1 = Math.cos(t1) * r1, y1 = Math.sin(t1) * r1;
      faceF.push(0, HY, T / 2, x0, HY + y0, T / 2, x1, HY + y1, T / 2);
      uvF.push(0.5, 0.5, ...UVD(x0, y0), ...UVD(x1, y1));
      faceB.push(0, HY, -T / 2, x1, HY + y1, -T / 2, x0, HY + y0, -T / 2);
      uvB.push(0.5, 0.5, ...UVD(x1, y1), ...UVD(x0, y0));
      rim.push(x0, HY + y0, T / 2, x1, HY + y1, T / 2, x1, HY + y1, -T / 2);
      rim.push(x0, HY + y0, T / 2, x1, HY + y1, -T / 2, x0, HY + y0, -T / 2);
      for (let q = 0; q < 6; q++) uvR.push(P.UV_FLAT[0], P.UV_FLAT[1]);
    }
    const HEAD = { tint: 0, motion: 1 };
    k.add(mk(faceF, uvF), { ...HEAD, color: 0xffffff });
    k.add(mk(faceB, uvB), { ...HEAD, color: 0xffffff });
    k.add(mk(rim, uvR), { color: 0xffffff, tint: 1, motion: 1, uv: P.UV_FLAT });
    // stick — a baked highlight band so it is candy, not a utility pole
    const stickCol = (x, y, z) => {
      const t = 0.5 + 0.5 * Math.cos(Math.atan2(z, x) - 0.8);
      const v = Math.round(204 + 50 * t ** 1.5);
      return (v << 16) | (v << 8) | Math.min(255, v + 3);
    };
    k.add(new THREE.CylinderGeometry(SR * 0.86, SR, STICK, 12), {
      m: P.M({ p: [0, STICK / 2, 0] }), color: stickCol, tint: 0, motion: 0.25, uv: P.UV_FLAT,
    });
    const geo = k.build();
    const nv = geo.attributes.position.count;
    const ph = new Float32Array(nv).fill(1.9);
    const tn = new Float32Array(nv * 3);
    const popCol = new THREE.Color(0xff3355);
    for (let i = 0; i < nv; i++) { tn[i * 3] = popCol.r; tn[i * 3 + 1] = popCol.g; tn[i * 3 + 2] = popCol.b; }
    geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    geo.setAttribute('aTint', new THREE.BufferAttribute(tn, 3));

    const mat = vegMat('bitten', {
      id: 'bitten',
      mat: { roughness: 0.17, metalness: 0.06, emissive: 0xffffff, emissiveIntensity: 1 },
      uniforms: { uSwirl: { value: swirlTex } },
      vertexBody: `
        { float w = clamp(position.y / 7.4, 0.0, 1.2);
          float t = uTime * 0.62 + aPhase;
          transformed.x += sin(t) * 0.2 * w * uWind;
          transformed.z += cos(t * 0.77 + 1.1) * 0.15 * w * uWind; }`,
      fragmentHead: 'uniform sampler2D uSwirl;',
      fragmentBody: `
        { float sw = texture2D( uSwirl, vVegUv ).r;
          diffuseColor.rgb = mix( diffuseColor.rgb, vVegTint, sw );
          float stick = 1.0 - step( 0.5, vVegMotion );
          diffuseColor.rgb *= mix( 1.0, mix( 0.44, 0.24, stick ), uNight ); }`,
      emissiveBody: `
        totalEmissiveRadiance = vec3( 0.15, 0.145, 0.15 ) * ( 1.0 - step( 0.5, vVegMotion ) ) * ( 1.0 - uNight );
        totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.05;`,
    });
    const yaw = 0.9;
    addExtra('bitten', geo, mat, { position: [spot.x, gy, spot.z], rotationY: yaw });

    // ── the initials, carved in the stick at head height ─────────────────────
    {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
      const c2 = cv.getContext('2d');
      c2.fillStyle = '#e9e6e2'; c2.fillRect(0, 0, 256, 128);
      c2.strokeStyle = '#b9b0a6'; c2.lineWidth = 2;
      for (let i = 0; i < 7; i++) { c2.beginPath(); c2.moveTo(0, 10 + i * 18); c2.lineTo(256, 16 + i * 18); c2.stroke(); }
      c2.lineJoin = 'round';
      const carve = (fn) => {
        c2.save(); c2.translate(0, 3); c2.strokeStyle = '#fdfbf8'; c2.lineWidth = 7; fn(); c2.restore();
        c2.strokeStyle = '#8a7566'; c2.lineWidth = 6; fn();
      };
      carve(() => {                     // a wobbling heart, cut with something blunt
        c2.beginPath();
        c2.moveTo(128, 108);
        c2.bezierCurveTo(38, 62, 56, 14, 128, 42);
        c2.bezierCurveTo(200, 12, 218, 64, 128, 108);
        c2.stroke();
      });
      c2.textAlign = 'center';
      c2.font = 'bold 33px "Trebuchet MS", sans-serif';
      c2.fillStyle = '#fdfbf8'; c2.fillText('S.P.K. + U', 128, 76);
      c2.fillStyle = '#7b6657'; c2.fillText('S.P.K. + U', 128, 73);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const panel = new THREE.CylinderGeometry(SR + 0.015, SR + 0.015, 1.15, 12, 1, true, -0.95, 1.9);
      panel.translate(0, 1.75, 0);
      const pmat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
      // falls with the stick it is carved into, or it reads as a lit label
      patchMaterial(pmat, { id: 'bitten_initials', fragmentBody: 'diffuseColor.rgb *= mix( 1.0, 0.26, uNight );' });
      addExtra('bitten_initials', panel, pmat, { position: [spot.x, gy, spot.z], rotationY: yaw, castShadow: false });
    }

    ctx.colliders.push({ x: spot.x, z: spot.z, r: 0.85 });
    clearAround(spot.x, spot.z, 3.6, GROUNDCOVER);
    landmarksOfNote.push({
      id: 'veg_bitten_pop', x: spot.x, z: spot.z + 2.2, y: gy + 2.0, r: 3.6, label: 'Look at the bite',
      speaker: 'The Bitten Pop', colors: [0xff3355, 0xffffff, 0xffe23a],
      line: 'Somebody took a bite the size of your head out of it. The tooth marks are… human-shaped? Down at the bottom of the stick, freshly carved: S.P.K. + U.',
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 4 · CLEARANCE — get out of the architecture's way
  //
  // Vegetation is built BEFORE candyArchitecture, so at placement time the
  // giant jelly-bean boulders, lamp posts, signposts and bridges do not exist
  // yet and isFreeGround() cannot see them: ground cover ended up embedded in
  // them (white grass quads z-fighting across the big pink gummy by the
  // village) and big plants clipped their posts. So once every system has
  // registered its colliders, blank the instances that are inside one.
  // ═══════════════════════════════════════════════════════════════════════════
  const collMine = ctx.colliders.length;
  let culled = 0;
  // pad > 0 → cull anything whose base is near the prop (ground cover).
  // pad < 0 → cull only real interpenetration (big plants keep their spot).
  const CLEAR_PAD = {
    mat: 0.55, grass: 0.45, mint: 0.42, bean: 0.38, crystal: 0.4, lily: 0.3, reed: 0.3,
    cotton: 0.6, gumdrop: 0.5, cane: 0.35,
    marsh: -0.45, log: -0.5, cream: -0.6, lolli: -0.8, pine: -0.8,
    gummy_sap: -0.8, gummy_mid: -0.8, gummy_gran: -0.8,
  };
  ctx.events.on('world:ready', () => {
    const foreign = new Occupancy(6);
    let nf = 0;
    const list = ctx.colliders;
    for (let i = 0; i < list.length; i++) {
      if (i >= collBase && i < collMine) continue;              // my own plants
      const c = list[i];
      if (!c || !(c.r > 0) || c.r > 9) continue;                 // skip zone-sized blockers
      if (c.x > -18 || c.x < -280) continue;                     // Candyland only
      foreign.add(c.x, c.z, c.r); nf++;
    }
    if (!nf) return;
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (const rec of meshes) {
      const pad = CLEAR_PAD[rec.id] ?? 0.4;
      let touched = false;
      for (let i = 0; i < rec.n; i++) {
        rec.mesh.getMatrixAt(i, m4);
        m4.decompose(p, q, s);
        if (s.x === 0) continue;
        if (foreign.free(p.x, p.z, pad)) continue;
        _m4.compose(p, q, _s.set(0, 0, 0));
        rec.mesh.setMatrixAt(i, _m4);
        touched = true; culled++;
      }
      if (touched) rec.mesh.instanceMatrix.needsUpdate = true;
    }
    console.warn(`[candyVegetation] clearance pass: ${culled} instances blanked inside ${nf} foreign props`);
  });

  // ── mobile: far-field contact blobs under the trees (after the clearance pass) ─
  if (MOBILE) ctx.events.on('world:ready', () => {
    const pts = [];
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (const rec of meshes) {
      const k = MOBILE_BLOB[rec.id]; if (!k) continue;
      const mesh = rec.live || rec.mesh, g = mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const half = Math.max(g.boundingBox.max.x - g.boundingBox.min.x, g.boundingBox.max.z - g.boundingBox.min.z) / 2;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m4); m4.decompose(p, q, sc);
        if (!(sc.x > 1e-4)) continue;
        pts.push({ x: p.x, z: p.z, r: clamp(half * sc.x * k, 0.9, 7) });
      }
    }
    const blobs = createBlobShadows(ctx, pts, { name: 'candyveg_blobs', opacity: 0.34, culler });
    // every candy blob sits under a tree that casts for real within NEAR.SHADOW:
    // the blob only grows in where that shadow shrinks away
    if (blobs) { withNearField(blobs.material, 'blob'); group.add(blobs); }
  });

  // ── authored beats: a few named plants worth walking to ───────────────────
  const api = { group, meshes, trunks, notable: landmarksOfNote, grandmothers: api_grandmothers };
  ctx.events.on('world:ready', () => {
    if (!ctx.systems.interaction?.register) return;
    const say = (t, speaker) => ctx.systems.ui?.say?.(t, { speaker, duration: 5 });
    const pop = (x, y, z, colors) => ctx.systems.particles?.burst?.({ x, y, z, count: 22, color: colors, speed: 4, life: 1.2, size: 0.25, spread: 1.2, gravity: -5 });
    for (const n of landmarksOfNote) {
      ctx.systems.interaction.register({
        id: n.id, x: n.x, z: n.z, r: n.r, label: n.label,
        onInteract: () => { say(n.line, n.speaker); if (n.colors) pop(n.x, n.y, n.z, n.colors); },
      });
    }
  });
  {
    // Pick REAL instances so the labels point at something that exists.
    const _mm = new THREE.Matrix4(), _pp = new THREE.Vector3(), _qq = new THREE.Quaternion(), _ss = new THREE.Vector3();
    const pick = (id, score) => {
      let best = null;
      for (const m of meshes) {
        if (Array.isArray(id) ? !id.includes(m.id) : m.id !== id) continue;
        for (let i = 0; i < m.n; i++) {
          m.mesh.getMatrixAt(i, _mm); _mm.decompose(_pp, _qq, _ss);
          const v = score(_pp, _ss);
          if (v !== null && (!best || v > best.v)) best = { v, x: _pp.x, y: _pp.y, z: _pp.z, s: _ss.y };
        }
      }
      return best;
    };
    const nearScore = (cx, cz, rad, bonus = () => 0) => (p, sc) => {
      const d = Math.hypot(p.x - cx, p.z - cz);
      return d > rad ? null : (rad - d) * 0.1 + bonus(p, sc);
    };

    const lick = pick('lolli', (p, sc) => (Math.hypot(p.x + 110, p.z + 45) > 30 ? null : sc.y));
    if (lick) landmarksOfNote.push({
      id: 'veg_great_lick', x: lick.x, z: lick.z, y: lick.y + 6.5 * lick.s, r: 3.6, label: 'The Great Lick',
      speaker: 'The Great Lick', colors: [0xff3355, 0xffe23a, 0x3aa8ff],
      line: 'A lollipop the size of a barn door. Someone has licked exactly one stripe off it, at head height.',
    });
    const grandpa = pick(['gummy_gran', 'gummy_mid'], nearScore(-202, -24, 40, (p, sc) => sc.y * 4));
    if (grandpa) landmarksOfNote.push({
      id: 'veg_grandpa_gum', x: grandpa.x, z: grandpa.z, y: grandpa.y + 4.5 * grandpa.s, r: 3.2, label: 'Grandpa Gum',
      speaker: 'Grandpa Gum', colors: [0xff3355, 0x5be27a],
      line: 'The oldest bear in the Gummy Forest. Slightly dusty. Definitely watching you, and has been for ninety years.',
    });
    const hollow = pick('log', nearScore(-190, -12, 40));
    if (hollow) landmarksOfNote.push({
      id: 'veg_hollow_wafer', x: hollow.x, z: hollow.z, y: hollow.y + 1.2, r: 2.9, label: 'Hollow Wafer',
      speaker: '', colors: [0xd98b2b, 0x7a4a2a],
      line: 'A fallen chocolate bar, hollow, one square bitten off. Something small lives in it and it is not pleased.',
    });
    const shard = pick('crystal', nearScore(-175, -62, 40, (p, sc) => sc.y * 3));
    if (shard) landmarksOfNote.push({
      id: 'veg_sugar_shard', x: shard.x, z: shard.z, y: shard.y + 1.6, r: 2.8, label: 'Sugar Shard',
      speaker: '', colors: [0xbfe8ff, 0xffffff, 0xd8fff0],
      line: 'Rock sugar, grown not made. It hums when the sun goes down. Everyone agrees not to mention this.',
    });
  }

  // ── update: uniforms only, zero allocation ────────────────────────────────
  Object.assign(api, {
    report() {
      // worst case: every mesh visible, plus one shadow-map pass for the casters
      const casters = meshes.filter((m) => m.castShadow).length + extras.filter((e) => e.mesh.castShadow).length;
      return {
        species: meshes.length, extras: extras.length, instances: totalInstances, culled,
        calls: meshes.length + extras.length + casters, casters,
        grandmothers: api_grandmothers.length, clearings: CLEARINGS.length,
        tris: Math.round(totalTris), trisWithShadow: Math.round(totalTris + shadowTris),
        byId: meshes.map((m) => `${m.id}:${m.n}`).join(' ') + ' · ' + extras.map((e) => `${e.id}:${Math.round(e.tris)}t`).join(' '),
        ...(culler ? { tier: 'mobile', cull: culler.stats() } : {}),
      };
    },
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      vegUniforms.uTime.value = t;
      vegUniforms.uNight.value = 1 - (ctx.state.daylight ?? 1);
      // gusts: a slow envelope over the base breeze so the island breathes
      vegUniforms.uWind.value = 0.72 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.23)) * (0.6 + 0.4 * Math.sin(t * 0.071 + 1.7));
    },
  });
  const rep = api.report();
  console.warn(`[candyVegetation] ${rep.species} species + ${rep.extras} authored · ${rep.instances} instances · ${rep.calls} draw calls (${rep.casters} shadow casters) · ${rep.tris} tris (${rep.trisWithShadow} incl. shadow pass) · ${rep.grandmothers} grandmothers · ${rep.byId}`);
  return api;
}
