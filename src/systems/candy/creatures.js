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
//                           puff-cloud fleece, toasted-marshmallow face with big
//                           white eyes, four chocolate hooves, tail; after dark
//                           they walk to the bell and sleep round it, heads in,
//                           with a faint moonlit glow so they never go missing
//   syrup fish          12  9 searched river stations (never under a bridge) +
//                           3 in Chocolate Lake; arc, splash and ripple at both
//                           ends of every leap
//   sprinkle-ants       14  red-licorice carriers (head / thorax / gaster, white
//                           eyes, stepping legs) on a two-lane loop along the
//                           licorice road into the village: out empty, home with
//                           a sprinkle crosswise in the jaws, 1.5 body lengths
//                           apart; the column parts round the visitor and kids
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
// GROUND (WAVE 3, Contract A): every WALKER — sheep, snails, beetles, ants —
// takes its y from ctx.systems.player.groundInfo(x,z).h every frame and runs
// ctx.systems.player.pushOut on its body after moving (creatures/common.js,
// class Ground). Solids (trunks, candy canes, walls, rocks) push it clear and
// its planner turns it round (ants detour instead: their planner is the trail);
// LOW props (benches, logs, crates ≤ 1.6 u) are walked ON. Butterflies ride
// over the same ground heights. The visitor and every Sour Patch Kid are
// moving bodies no walker may pass through (Ground.bindDynamic): a walker is
// shoved aside and its planner turns it, the ant column parts round them, and
// butterflies shy out of the visitor's body and split apart in the air. api.debugPositions() → [{x,y,z,r,kind}] for a
// verifier; api.groundStats() → step/hit/wet counters.
//
// 16 meshes exist; 12 are drawn by day (13 during a glider crossing) and 14 at
// night — well inside the 25-call creature budget — for 60.3k triangles (the
// WAVE 3 red-licorice ants and puff-cloud sheep cost ~13k more than the old
// lumps; the game camera views measure 0.70–0.74M triangles in total). The whole group is hidden when the camera is not on Candyland,
// so Cat Island pays nothing for any of it, and the group carries noOcclude /
// noInstOcclude so no animal can ever shove the game camera around.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { flapClock, ShadowField, ColliderGrid, OBSTACLES, Ground, bodyCircles, LOD } from './creatures/common.js';
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
  // mesh (78 butterflies + 52 beetles + 12 snails + 8 sheep + 14 ants + the
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

  // Contract A adapter: the player's ground core (it is created AFTER this
  // system, so it is looked up every frame in update → ground.bind()).
  const ground = new Ground(ctx, ctx.world);

  const env = { ctx, world: ctx.world, scene: group, THREE, shadowField, obstacles, ground };
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
  let staging = null;
  const api = {
    group, parts, stats,
    report: () => stats,
    /** For other systems: where the flock currently is, for a shepherd NPC etc. */
    flock: () => parts.sheep?.flock ?? [],
    /** Authoring/views: tonight's sheep huddle round the bell, finished now. */
    settleFlock: () => parts.sheep?.settle?.(),
    /** Authoring/views: put a sugar-glider V over the camera at progress t. */
    flypast: (t) => parts.birds?.cue?.(t),
    /**
     * Every walking NPC's body circle, for a verifier: { x, y, z, r, kind,
     * onProp, probes }. (x,z,r) is the pivot circle pushOut resolved LAST this
     * frame; probes are the extra nose/tail circles of long animals (sheep,
     * ants), resolved before it. y is where the feet rest (groundInfo h).
     */
    debugPositions() {
      const out = [];
      const add = (list, kind) => {
        if (!Array.isArray(list)) return;
        for (const e of list) {
          if (!e || typeof e.x !== 'number') continue;
          out.push({ x: e.x, y: e.y, z: e.z, r: e.r ?? 0.4, kind: e.kind || kind, onProp: !!e.prop, probes: bodyCircles(e) });
        }
      };
      add(parts.sheep?.flock, 'sheep');
      add(parts.snails?.snails, 'snail');
      add(parts.beetles?.bugs, 'beetle');
      add(parts.ants?.column, 'ant');
      return out;
    },
    /**
     * Authoring/views/tests: move the walker of `kind` ('sheep' | 'snail' |
     * 'beetle' | 'royal_beetle') nearest (x,z) to (x,z), facing `heading`
     * (yaw, radians). A beetle train leader brings its followers along. The
     * walker is then grounded and pushed out by the normal Contract-A step on
     * the next frame — staging never bypasses collision. Returns the walker.
     */
    stage(kind, x, z, heading) {
      const lists = { sheep: parts.sheep?.flock, snail: parts.snails?.snails, beetle: parts.beetles?.bugs, royal_beetle: parts.beetles?.bugs };
      const list = lists[kind]; if (!Array.isArray(list)) return null;
      let best = null, bd = Infinity;
      for (const e of list) {
        if (staging && staging.has(e)) continue;          // stageAll: one walker per entry
        if ((e.kind || kind) !== kind || (kind === 'beetle' && e.ahead)) continue;
        const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; }
      }
      if (!best) return null;
      if (staging) staging.add(best);
      const dx = x - best.x, dz = z - best.z;
      best.x = x; best.z = z;
      if (typeof heading === 'number') best.head = heading;
      if (kind === 'sheep') { best.mode = 'graze'; best.timer = 6; best.tx = x; best.tz = z; }
      if (kind === 'beetle' || kind === 'royal_beetle') {
        best.panic = 0;
        for (const f of list) {
          let a = f.ahead, hops = 0;
          while (a && a !== best && hops++ < 8) a = a.ahead;
          if (a === best) { f.x += dx; f.z += dz; if (typeof heading === 'number') f.head = heading; }
        }
      }
      return best;
    },
    /** stage() for several walkers at once: [[kind, x, z, heading?], ...] (views can only call one path once). */
    stageAll(list) {
      staging = new Set();
      try { return Array.isArray(list) ? list.map((a) => (Array.isArray(a) ? api.stage(...a) : null)) : []; }
      finally { staging = null; }
    },
    /**
     * Authoring/views/tests: teleport the visitor onto the ant column's centre
     * line at arc length s (0 = anthill … trailLength = lollipop), `off` u to
     * the side (+ = village side, − = out on the road), so a view can show the
     * column parting round him. Returns the point.
     */
    visitAntTrail(s = 8, off = 0) {
      const A = parts.ants; if (!A?.at) return null;
      const p = A.at(s);
      const x = p.x + Math.cos(p.dir) * (p.sh + off), z = p.z - Math.sin(p.dir) * (p.sh + off);
      ctx.systems.player?.teleport?.(x, z);
      return { x, z };
    },
    /** Contract A counters since load: steps, hits (turned round), wet (refused), onProp (frames stood on a prop). */
    groundStats: () => ({ ...ground.stats, live: ground.live }),
    update(dt, ctx) {
      // Cull the whole island's wildlife when nobody is looking at Candyland.
      const cam = ctx.camera.position;
      const far = Math.hypot(cam.x - CANDY_CENTER.x, cam.z - CANDY_CENTER.z) > 360;
      const show = cam.x < 40 && !far;
      if (show !== !hidden) { hidden = !show; group.visible = show; }
      if (!show || ctx.state.paused) return;

      flapClock.value = ctx.state.elapsed;
      LOD.begin(ctx);                   // the walkers' animation LOD (common.js)
      obstacles.sync();
      ground.bind();
      ground.bindDynamic(ctx);          // the visitor + Sour Patch Kids: nobody walks through them
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
