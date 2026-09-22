// ─────────────────────────────────────────────────────────────────────────────
// TERRAIN & WATER
// Renders both islands, every path, the syrup river (+ waterfall + delta),
// Chocolate Lake, the gumdrop sea-cliffs, Fish Harbor's quay and the sea.
// Heights ALWAYS come from world.height(x, z) — this system never reshapes the
// world, it only dresses it.
//
// Exposed api: { group, sea, river, lake, lakeSurface, riverSurfaceAt(x,z),
//                waterLevelAt(x,z), stats }
// Events: emits 'terrain:ready' with the stats block once built.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { bakeField, makeAOTexture, bakeAO } from './terrain/common.js';
import { buildGround } from './terrain/ground.js';
import { buildSea, buildRiver, buildRiverLip, buildWaterfall, buildLake, riverProfile, lakeSurfaceLevel } from './terrain/water.js';
import { buildPaths } from './terrain/paths.js';
import { buildCandyDecor, buildCatDecor, buildGumdrops, buildCliffs } from './terrain/decor.js';

export function create(ctx) {
  const { scene, world } = ctx;
  const group = new THREE.Group();
  group.name = 'terrain';
  scene.add(group);

  // Soft contact-occlusion map, stamped from ctx.colliders once every system
  // has registered its props (see world:ready below). Created up front so the
  // uniform never changes identity after the shaders compile.
  const ao = makeAOTexture();

  const uniforms = {
    uTime: { value: 0 }, uDaylight: { value: 1 },
    uAO: { value: ao.tex }, uAORect: { value: ao.rect },
    // live sky links (see update): the sea blends its horizon toward these so
    // water and sky agree at every hour. Safe defaults for a noon sky.
    uHorizon: { value: new THREE.Color().setHex(0xdcf0f2, THREE.SRGBColorSpace) },
    uSunCol: { value: new THREE.Color().setHex(0xfff2dc, THREE.SRGBColorSpace) },
    uSunDir: { value: new THREE.Vector3(0.35, 0.86, 0.37) },
    // the sky's ZENITH colour: water reflects a gradient, not one flat horizon
    // tone, and that difference is most of what makes a wave face read
    uZenith: { value: new THREE.Color().setHex(0x6fa8d8, THREE.SRGBColorSpace) },
    // ferry hull (x, z, radius, active): the sea draws expanding ripple rings
    // around her, and she MOVES, so this cannot come from the baked AO map
    uFerry: { value: new THREE.Vector4(0, 22, 3.6, 0) },
  };
  const stats = { tris: 0, parts: {} };
  const add = (name, built) => {
    if (!built) return null;
    group.add(built.mesh);
    stats.tris += built.tris | 0;
    stats.parts[name] = built.tris | 0;
    return built;
  };

  // ── shared baked field (depth / shoreline for the water shaders) ───────────
  const field = bakeField(world);

  // ── ground ────────────────────────────────────────────────────────────────
  const lakeSurface = lakeSurfaceLevel(world);
  const candyGround = add('candyGround', buildGround(ctx, 'candy', uniforms, lakeSurface));
  const catGround = add('catGround', buildGround(ctx, 'cat', uniforms, lakeSurface));

  // ── river profile + lake level (needed before the paths can bridge them) ──
  const prof = riverProfile(world);

  const riverSurfaceAt = (x, z) => {
    let best = Infinity, bi = -1;
    for (let i = 0; i < prof.N; i++) {
      const d = (prof.P[i].x - x) ** 2 + (prof.P[i].z - z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    if (bi < 0 || best > 400) return null;
    return prof.P[bi].surf;
  };

  /** Height a walkway must sit at to cross water here, or null for dry land. */
  const deckLevel = (x, z) => {
    const dl = Math.hypot(x - world.LAKE.x, z - world.LAKE.z);
    if (dl < 21 && world.height(x, z) < lakeSurface + 0.2) return lakeSurface + 0.42;
    if (x < 0) {
      const rd = world.riverDist(x, z);
      if (rd < world.RIVER.width * 0.5 + 2.2) {
        const s = riverSurfaceAt(x, z);
        if (s !== null && s > world.height(x, z) - 0.2) return s + 0.18;
      }
    }
    return null;
  };

  // ── paths ─────────────────────────────────────────────────────────────────
  add('candyPaths', buildPaths(ctx, 'candy', uniforms, { deckLevel }));
  add('catPaths', buildPaths(ctx, 'cat', uniforms, { deckLevel }));

  // ── water ─────────────────────────────────────────────────────────────────
  const river = add('river', buildRiver(ctx, uniforms, prof));
  // the raised sugar-crust lip that turns the river from a decal into a channel
  add('riverLip', buildRiverLip(ctx, uniforms, prof));
  const waterfall = add('waterfall', buildWaterfall(ctx, uniforms, prof));
  const lake = add('lake', buildLake(ctx, uniforms, lakeSurface, deckLevel));
  const sea = add('sea', buildSea(ctx, uniforms, field));

  // ── decor ─────────────────────────────────────────────────────────────────
  add('candyDecor', buildCandyDecor(ctx, uniforms, prof, lakeSurface));
  add('gumdrops', buildGumdrops(ctx, uniforms));
  add('cliffs', buildCliffs(ctx, uniforms));
  add('catDecor', buildCatDecor(ctx, uniforms));

  // Bake the contact AO after every other system has pushed its colliders.
  ctx.events.on('world:ready', () => {
    try { stats.aoProps = bakeAO(ao, ctx.colliders); } catch (e) { console.error('[terrain] AO bake failed', e); }
  });

  stats.waterfallAt = { x: +prof.lip.x.toFixed(1), z: +prof.lip.z.toFixed(1), top: +prof.poolTop.toFixed(2) };
  stats.lakeSurface = +lakeSurface.toFixed(2);
  stats.meshes = group.children.length;
  console.warn(`[terrain] ${stats.meshes} meshes · ${stats.tris} tris · ` +
    Object.entries(stats.parts).map(([k, v]) => `${k}:${v}`).join(' '));
  ctx.events.emit('terrain:ready', stats);

  const api = {
    group, stats, field, ao,
    sea: sea?.mesh, river: river?.mesh, lake: lake?.mesh, waterfall: waterfall?.mesh,
    ground: { candy: candyGround?.mesh, cat: catGround?.mesh },
    lakeSurface, riverProfile: prof, riverSurfaceAt, deckLevel,
    /** Water surface height at (x,z), or null if there is no water there. */
    waterLevelAt(x, z) {
      const d = deckLevel(x, z);
      if (d !== null) return d - 0.3;
      return world.height(x, z) < 0 ? world.SEA_LEVEL : null;
    },
    update(dt, c) {
      uniforms.uTime.value = c.state.elapsed;
      uniforms.uDaylight.value = c.state.daylight;
      // pull the live sky grade (guarded: the sky may not expose these yet —
      // scene.fog.color is the authored horizon colour, so it is a safe proxy)
      const sky = c.systems.sky;
      const hz = sky?.horizonColor || c.scene.fog?.color;
      if (hz) uniforms.uHorizon.value.copy(hz);
      const sc = sky?.sunColor || sky?.sun?.color;
      if (sc) uniforms.uSunCol.value.copy(sc);
      if (sky?.zenithColor) uniforms.uZenith.value.copy(sky.zenithColor);
      if (sky?.sunDir) uniforms.uSunDir.value.copy(sky.sunDir);
      // the ferry's hull position, for her ripple rings (she is a moving prop,
      // so the baked contact-AO map cannot see her)
      const fp = c.systems.ferry?.whale?.position;
      const uf = uniforms.uFerry.value;
      if (fp) { uf.x = fp.x; uf.y = fp.z; uf.w = 1; } else uf.w = 0;
    },
  };
  return api;
}
