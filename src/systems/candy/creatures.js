// ─────────────────────────────────────────────────────────────────────────────
// CANDYLAND — TINY CREATURES & AMBIENT LIFE
//
// Everything small and busy on the west island. Pikmin logic: authored little
// populations with jobs, clustered where you already want to look, reacting to
// the player and to the clock. All procedural low-poly, all InstancedMesh.
//
//   jellybean beetles   52  meadow lane, forest floor, licorice roads, cupcake
//                           — nose-to-tail trains that taper in size, curve and
//                           scuttle out of phase; one is the Royal Jellybean
//   gumdrop snails      12  forest + river bank + meadow lane, sugar trail, pokeable
//   wrapper butterflies 78  13 flower beds, 1–2.5 u loops, 104° wing V, ≥ 80%
//                           airborne at all times, perching ONLY on blossom
//                           heads (flowers.js), gone after dusk
//   candy flowers       66  the perches themselves, merged into creature-props
//   marshmallow sheep    8  Lollipop Meadow lane, pettable, shepherd's bell —
//                           lobed fleece, four dark hooves, tail, face clear of
//                           the wool, so they read from straight above
//   syrup fish          12  9 searched river stations (never under a bridge) +
//                           3 in Chocolate Lake; arc, splash and ripple at both
//                           ends of every leap
//   sprinkle-ants       30  two-lane column ON the licorice shoulder into the
//                           village (trail derived from the path polyline)
//   jellyfish           12  Sugar Pier bay, up from dusk, soft glow
//   sugar-gliders      5–7  daylight V crossings at 16–19.5 u — the altitude is
//                           non-negotiable; the lens only chooses where
//   glowing nerds      148  Gummy Forest + Nerd Hollow + village edge, night
//                           only — soft sprite glows, no hard cores
//
// Creature placements hug the licorice paths, landmark cores and the water —
// Candyland's vegetation is wall-to-wall, and those are the only sightlines.
//
// GROUNDING: every walker and flier writes a soft blob into ONE shared decal
// pool (ShadowField) — butterflies, beetles, snails, sheep, ants and the glider
// flock all cost a single extra draw call between them. Nothing on this island
// floats over a picture of the ground.
//
// 16 meshes exist; 12 are drawn by day (13 during a glider crossing) and 14 at
// night — well inside the 25-call creature budget — for 43.4k triangles against
// a 60k budget. The whole group is hidden when the camera is not on Candyland,
// so Cat Island pays nothing for any of it, and the group carries noOcclude /
// noInstOcclude so no animal can ever shove the game camera around.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { flapClock, ShadowField, ColliderGrid, OBSTACLES } from './creatures/common.js';
import * as beetles from './creatures/beetles.js';
import * as snails from './creatures/snails.js';
import * as butterflies from './creatures/butterflies.js';
import * as sheep from './creatures/sheep.js';
import * as fish from './creatures/fish.js';
import * as ants from './creatures/ants.js';
import * as jellyfish from './creatures/jellyfish.js';
import * as birds from './creatures/birds.js';
import * as fireflies from './creatures/fireflies.js';
import * as props from './creatures/props.js';

const MODULES = [
  ['beetles', beetles], ['snails', snails], ['butterflies', butterflies], ['sheep', sheep],
  ['fish', fish], ['ants', ants], ['jellyfish', jellyfish], ['birds', birds],
  ['fireflies', fireflies], ['props', props],
];

const CANDY_CENTER = { x: -150, z: 0 };

export function create(ctx) {
  const group = new THREE.Group();
  group.name = 'candy-creatures';
  // Wildlife never pushes the lens around. The camera's capsule sweep treats
  // any opaque mesh (and any instanced cloud with a >0.75 u bounding sphere) as
  // an obstruction and dollies in — a marshmallow sheep grazing between the
  // player and the camera is enough to slam the game camera to four units, and
  // a flower bed in Lollipop Meadow is enough to do it on every frame. Both
  // flags are read off ANY ancestor, so one line covers every creature mesh.
  group.userData.noOcclude = true;
  group.userData.noInstOcclude = true;
  ctx.scene.add(group);

  // Every grounded creature draws its contact shadow into ONE pooled decal
  // mesh (78 butterflies + 52 beetles + 12 snails + 8 sheep + 30 ants + the
  // glider flock), so grounding the whole island costs a single draw call.
  const shadowField = new ShadowField(group, 200);

  // Nothing on this island is skewered by a pole. Terrain, vegetation and both
  // architecture systems have already registered their props in ctx.colliders
  // by the time creatures are built, so one grid over that list is enough to
  // keep every walker, every flower bed and every butterfly loop out of the
  // candy canes. Re-synced each frame in case a later system adds more.
  const obstacles = new ColliderGrid(ctx, 8, 2.5);
  obstacles.rebuild();
  OBSTACLES.grid = obstacles;

  const env = { ctx, world: ctx.world, scene: group, THREE, shadowField, obstacles };
  const parts = {};
  for (const [name, mod] of MODULES) {
    try { parts[name] = mod.create(env); }
    catch (err) { console.error(`[candyCreatures/${name}] failed:`, err); }
  }

  // ── budget report (same shape the other Candyland systems print) ──────────
  const stats = { types: 0, meshes: 0, instances: 0, triangles: 0, interactables: 0 };
  group.traverse((o) => {
    if (!o.isMesh) return;
    stats.meshes++;
    const n = o.isInstancedMesh ? o.count : 1;
    const g = o.geometry;
    const tri = ((g.index ? g.index.count : g.attributes.position.count) / 3) | 0;
    stats.instances += n; stats.triangles += tri * n;
  });
  stats.types = Object.keys(parts).length - (parts.props ? 1 : 0);
  const beds = parts.butterflies?.beds || [];
  stats.flowerBeds = beds.length;
  stats.blossoms = beds.reduce((a, b) => a + b.flowers.length, 0);
  stats.fishStations = parts.fish?.stations?.length || 0;
  console.warn(`[candyCreatures] ${stats.types} species · ${stats.instances} instances · ` +
    `${stats.meshes} meshes · ${stats.triangles} tris · ${stats.flowerBeds} flower beds/` +
    `${stats.blossoms} blossoms · ${stats.fishStations} fish stations (13 calls/33.6k day · 18/26.8k night)`);

  let hidden = false;
  const api = {
    group, parts, stats,
    report: () => stats,
    /** For other systems: where the flock currently is, for a shepherd NPC etc. */
    flock: () => parts.sheep?.flock ?? [],
    /** Authoring/views: put a sugar-glider V over the camera at progress t. */
    flypast: (t) => parts.birds?.cue?.(t),
    update(dt, ctx) {
      // Cull the whole island's wildlife when nobody is looking at Candyland.
      const cam = ctx.camera.position;
      const far = Math.hypot(cam.x - CANDY_CENTER.x, cam.z - CANDY_CENTER.z) > 360;
      const show = cam.x < 40 && !far;
      if (show !== !hidden) { hidden = !show; group.visible = show; }
      if (!show || ctx.state.paused) return;

      flapClock.value = ctx.state.elapsed;
      obstacles.sync();
      for (const [name] of MODULES) {
        const p = parts[name];
        if (!p?.update) continue;
        try { p.update(dt, ctx); }
        catch (err) { if (!p.__warned) { console.error(`[candyCreatures/${name}] update error`, err); p.__warned = true; } }
      }
      shadowField.flush();
    },
  };
  return api;
}
