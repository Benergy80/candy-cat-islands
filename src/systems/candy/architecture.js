// ─────────────────────────────────────────────────────────────────────────────
// CANDYLAND ARCHITECTURE — the edible built environment of the west island.
//
//   Sugar Pier            (-42, 22)   arrival pier, ticket booth, welcome arch
//   Gumdrop Village      (-140, 40)   12 gingerbread houses, fountain, market
//   The Great Cupcake     (-88,-18)   25-unit cupcake you can climb and enter
//   Frosting Peak        (-175,-62)   wafer-cone lookout, cherry monument, cave
//   Chocolate Lake       (-200, 48)   chocolate fountain, boathouse, fish pier
//   The Sour Shrine      (-218,-44)   gummy figures, a stone with a face
//   + licorice river bridges, a donut arch, a leaning candy bar, jelly beans
//
// Everything is authored (coordinates are hand-placed, heights sampled from
// world.height at load) and merged into ONE mesh per material.
//
// Exposed API:
//   api.getDeckHeight(x, z) → number | null   walkable raised surfaces
//   api.chimneys  = [{x,y,z}]                 smoke emitter anchors
//   api.landmarks = [{id,x,y,z,revealFrom:{x,z}}]   for the camera's landmark
//       reveal — AND still indexable by name (api.landmarks.sugar_fountain),
//       because particles/ambient.js and inventory/places.js read it as a map.
//       api.marks is the plain { id: {x,y,z} } map if you want only that.
//   api.interiors = [{ id, name, x, z, w, d, rot, inside }]   enterable rooms
//   api.doors     = [{ id, house, x, z, y, facing, open }]    swinging doors
//   api.enter(id) / api.exit()                teleport into / out of a room (debug + NPCs)
//   events 'interior:enter' {id,name} · 'interior:exit' {id}
//   ctx.walkables.push({ test(x,z) })         generic walkable-surface hook
//
// WAVE 2 — SOLID WALLS. Every wall is an oriented box collider
//   { x, z, w, d, rot, h, box:true }   w = extent along local X, d along local Z.
//   Call A.collideBox with the yaw you DREW the wall with; it negates once, in
//   one place, because every consumer in this project reads a box with the
//   opposite handedness to a Three mesh rotation.y (see the note there).
// Doorways are left as GAPS between two wall boxes. If the player system has not
// shipped box support yet we detect that once at world:ready and synthesise
// circle chains, so walls are solid either way.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, hash, damp, clamp } from '../../core/util.js';
import { createMaterials, createBuilder, makeSignAtlas, C, SPRINKLE, softGlow, halveCanvasTexture, setKitTier } from './architecture/kit.js';
import { createInstanceCuller, triangleTiles } from '../terrain/instcull.js';
import { getLampPool } from '../terrain/lamppool.js';

// ── MOBILE TIER (docs/BRIEF.md Contract I) ───────────────────────────────────
// Same authored town on both tiers; on ctx.state.mobile only the PACKAGING
// changes:
//   · the main builder keeps the SAME island-wide merges as desktop (one mesh
//     per material), but each one is tiled on a 32 u grid and drawn through
//     the index runs of the tiles in view (terrain/instcull.js addIndexed).
//     One draw call per material at most — never more than desktop, in any
//     view — and a fraction of the triangles at the game camera. A casting
//     merge also keeps the tiles inside the key light's shadow frustum, so an
//     off-screen building still throws its shadow into the frame. (An 8-way
//     district split was tried first: fewer triangles, but up to 8× the calls
//     in wide and flying views and +24 shadow calls over the strait.)
//     Sub-builder groups (enterable houses, landmarks) are frustum-culled;
//   · sprinkles / jelly beans / sugar grains are packed per frame to what the
//     camera sees (terrain/instcull.js), and the small trim (those three,
//     spinners, bunting) casts no shadow — buildings and landmarks still do;
//   · the sign atlas is halved to 1024 × 1280 (textures ≤ 2048, iOS canvas cap);
//   · (both tiers since Contract J) the lamps, the cupcake's crater light and
//     the room light are anchors of the shared constant LAMP POOL
//     (terrain/lamppool.js), never PointLights of their own.
const MOBILE_TILE = 32;
const NO_CAST_MOBILE = { sprinkles: 1, jellybeans: 1, sugargrains: 1, spinners: 1, bunting: 1 };
const CULL_MOBILE = { sprinkles: 1, jellybeans: 1, sugargrains: 1 };   // static instances only
import { SIGNS, signEntries } from './architecture/signs.js';
import { buildPier } from './architecture/pier.js';
import { buildVillage } from './architecture/village.js';
import { buildCupcake } from './architecture/cupcake.js';
import { buildPeak } from './architecture/peak.js';
import { buildLake } from './architecture/lake.js';
import { buildShrine } from './architecture/shrine.js';
import { buildProps } from './architecture/props.js';

export function create(ctx) {
  const { scene, world } = ctx;
  const group = new THREE.Group(); group.name = 'candyArchitecture'; scene.add(group);
  const MOBILE = !!ctx.state?.mobile;
  setKitTier(MOBILE);   // before any createBuilder / makeSignAtlas (escape's too)
  // mobile: every builder here culls its merged meshes (desktop: null → never)
  const builderOpts = MOBILE ? { cull: true } : null;
  const culler = MOBILE ? createInstanceCuller(ctx, { cell: 32 }) : null;
  const lampPool = getLampPool(ctx);   // 3 slots on mobile, 9 on desktop (the pool decides)

  const mats = createMaterials();
  const atlas = makeSignAtlas(signEntries());   // mobile: already 1024 × 1280 (kit tier)
  if (MOBILE) {
    halveCanvasTexture(atlas.tex, 4);            // no-op once the tier has halved it
    // transparent DoubleSide draws twice (back faces, then front) — a thin
    // liquid sheet does not read the difference on a phone: one pass (clones
    // inherit it). Desktop keeps two: the fountain's cone sheets change ~1% of
    // the frame in one pass. (haloDisc is single-pass on both tiers: kit.js.)
    mats.flow.forceSinglePass = true;
  }
  mats.sign = new THREE.MeshStandardMaterial({
    map: atlas.tex, emissiveMap: atlas.tex, emissive: 0xffffff, emissiveIntensity: 0,
    roughness: 0.7, metalness: 0, side: THREE.DoubleSide,
    // every sign is a quad laid a few centimetres off the board behind it;
    // polygonOffset keeps it from z-fighting when the board is slightly domed
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const B = createBuilder(mats, atlas.uv, null, MOBILE ? { cull: true } : null);

  ctx.colliders = ctx.colliders || [];
  ctx.walkables = ctx.walkables || [];
  const myColliderBase = ctx.colliders.length;

  const decks = [];          // walkable raised surfaces
  const stairs = [];         // multi-turn spirals (own walkable: nearest flight wins)
  const interactables = [];  // registered once interaction exists
  const chimneys = [];
  const lights = [];
  const boxes = [];          // oriented wall boxes (kept for the collider fallback)
  const buildings = [];      // enterable buildings (fade shells / hide roofs)
  const doorList = [];       // swinging door leaves (one InstancedMesh)
  const inst = { sprinkles: [], beans: [], grains: [], bunting: [], spinners: [] };
  const landmarks = {};
  // every clone of an emissive material has to be driven by the day/night loop
  // too, or a sub-building's windows stay dead at midnight
  const dyn = { windowWarm: [mats.windowWarm, mats.windowPink], glowWarm: [mats.glowWarm], halo: [mats.haloDisc], sign: [] };

  // ── sub-builders ───────────────────────────────────────────────────────────
  // A whole material family collapses onto ONE clone so a per-building group
  // costs 2–3 draw calls instead of 9. The clones are per building because they
  // carry that building's fade opacity.
  const SUB_KEYS = { matteFlat: 'matte', icing: 'matte', gloss: 'matte', licorice: 'matte', water: 'matte', flow: 'matte', windowPink: 'windowWarm', glowSour: 'windowWarm' };
  function subMaterials(o = {}) {
    const m = { matte: mats.matte.clone(), waffle: mats.waffle.clone(), stripe: mats.stripe.clone(), sign: mats.sign.clone() };
    m.windowWarm = mats.windowWarm.clone();
    m.glowWarm = mats.glowWarm.clone();
    m.haloDisc = mats.haloDisc.clone();
    if (o.flat) m.matte.flatShading = true;
    dyn.windowWarm.push(m.windowWarm); dyn.glowWarm.push(m.glowWarm); dyn.halo.push(m.haloDisc); dyn.sign.push(m.sign);
    return m;
  }
  /** A builder writing into its own group → its own meshes, hideable / fadeable. */
  function subBuilder(name, o = {}) {
    const g = new THREE.Group(); g.name = 'candyArch_' + name;
    const m = subMaterials(o);
    // `gloss:true` buys the family a second material (2 draw calls, not 1) so a
    // sub-group with wet syrup in it still gets a specular. Everything else
    // still collapses onto the one matte.
    let keys = SUB_KEYS;
    if (o.gloss) { m.gloss = mats.gloss.clone(); keys = { ...SUB_KEYS, gloss: 'gloss' }; }
    const b = createBuilder(m, atlas.uv, keys, MOBILE ? { cull: true, forward: { haloDisc: B } } : null);
    return {
      B: b, group: g, mats: m,
      finish() {
        const meshes = b.finish(g);
        const list = [];
        for (const k in meshes) { meshes[k].name = 'candyArch_' + name + '_' + k; list.push(meshes[k]); }
        g.userData.meshes = list;
        if (list.length) group.add(g);
        return list;
      },
    };
  }

  const A = {
    THREE, B, world, ctx, C, SPRINKLE, mats, signUV: atlas.uv, builderOpts, lampPool,
    rng: (name) => rng(hash('candyArch:' + name)),
    gy: (x, z) => world.height(x, z),
    group,
    addObject(o) { group.add(o); return o; },
    mark(id, x, y, z) { landmarks[id] = { x, y, z }; },
    collide(x, z, r) { ctx.colliders.push({ x, z, r }); },
    /**
     * An oriented wall box. w = extent along local X, d along local Z, rot = the
     * yaw you would give the mesh, h = the ABSOLUTE world Y of the top (the
     * player clears a collider once its feet are above h — so fences are
     * jumpable and houses are not). Walls are registered as boxes (never one fat
     * circle) so you can stand in a doorway, walk along a wall and round a corner.
     */
    collideBox(x, z, w, d, rot = 0, h = 400) {
      // CONVENTION: every consumer of a box collider in this project (player
      // resolve(), camera occlude(), inventory colliderClear()) maps world→local
      // with  lx = dx·cos + dz·sin ,  lz = −dx·sin + dz·cos  — which is the
      // OPPOSITE handedness to a Three mesh rotation.y. Callers here pass the
      // yaw they drew the wall with, so negate it once, in one place.
      const b = { x, z, w, d, rot: -rot, h, box: true, _ry: rot };
      ctx.colliders.push(b); boxes.push(b);
      return b;
    },
    /** A run of wall between two world points, `t` thick. (Length sits on local Z.) */
    collideWall(ax, az, bx, bz, t = 0.4, h = 4) {
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.05) return null;
      return A.collideBox((ax + bx) / 2, (az + bz) / 2, t, len, Math.atan2(dx, dz), h);
    },
    /**
     * A footprint CLAIM: circles marked `solid:false`. The player ignores them,
     * but every system that reads ctx.colliders as "this ground is taken" —
     * vegetation's clearance pass, prop nudging, the debug teleport — still
     * sees the building. Wall boxes alone are invisible to those, which is how
     * you end up with a candy cane growing through a bedroom.
     */
    claim(x, z, w, d, rot = 0) {
      // A RING of eight, not one fat disc over the middle: the debug teleport
      // (and therefore every `--pos` render and every `game.teleport` into a
      // room) refuses to land inside a claimed circle, so a solid claim would
      // make the buildings we just made enterable impossible to spawn inside.
      // The ring covers the walls, where the plants that clip actually stand,
      // and leaves the floor free.
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const r = Math.max(0.4, Math.min(0.28 * Math.max(w, d), 0.4 * Math.min(w, d) - 0.5));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const lx = Math.cos(a) * w * 0.4, lz = Math.sin(a) * d * 0.4;
        ctx.colliders.push({ x: x + lx * cs + lz * sn, z: z - lx * sn + lz * cs, r, solid: false });
      }
    },
    /** Same idea for a round building: a ring of claims around an open middle. */
    claimCircle(x, z, R, n = 8) {
      const r = Math.max(0.5, R * 0.38);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.colliders.push({ x: x + Math.cos(a) * (R - r * 0.75), z: z + Math.sin(a) * (R - r * 0.75), r, solid: false });
      }
    },
    /** A closed ring of wall boxes approximating a cylinder, with an optional door gap. */
    collideRing(cx, cz, r, n = 12, h = 4, gapA = null, gapW = 0) {
      A.collideRingGaps(cx, cz, r, n, h, gapA === null ? [] : [{ a: gapA, w: gapW }]);
    },
    /**
     * The same ring, with SEVERAL openings — the Great Cupcake has a front door
     * AND a bite you can walk into, and one gap per ring is not enough.
     * `gaps` = [{ a, w }] in world angle (atan2(dz, dx)) and half-width radians.
     */
    collideRingGaps(cx, cz, r, n = 12, h = 4, gaps = []) {
      const t = 0.5, seg = Math.tan(Math.PI / n) * r * 2 + 0.14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.PI / n;
        let skip = false;
        for (const g of gaps) if (Math.abs(Math.atan2(Math.sin(a - g.a), Math.cos(a - g.a))) < g.w) { skip = true; break; }
        if (skip) continue;
        A.collideBox(cx + Math.cos(a) * (r + t * 0.4), cz + Math.sin(a) * (r + t * 0.4), t, seg, -a, h);
      }
    },
    /**
     * A CLEAR APRON around a landmark: concentric rings of `solid:false` claim
     * circles covering the annulus [rInner, rOuter]. The player, the camera and
     * the ferry ignore them; vegetation's clearance pass reads them as "this
     * ground is taken" and blanks its instances, so the landmark's silhouette is
     * seen whole from the path instead of through a thicket of candy canes.
     *
     * Circle radius is deliberately ≤ 6: vegetation SKIPS any collider wider
     * than 9 units as a "zone-sized blocker", so one fat disc would do nothing.
     * The middle is left unclaimed so `game.teleport` can still land inside the
     * building (it nudges out of every registered circle, solid or not).
     */
    claimApron(cx, cz, rInner, rOuter, o = {}) {
      const rr = o.r ?? 3.4, step = o.step ?? rr * 1.5;
      for (let rad = rInner + rr * 0.55; rad < rOuter; rad += step) {
        const n = Math.max(6, Math.round((Math.PI * 2 * rad) / (rr * 1.6)));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rad * 0.13;
          ctx.colliders.push({ x: cx + Math.cos(a) * rad, z: cz + Math.sin(a) * rad, r: rr, solid: false, apron: true });
        }
      }
    },
    /**
     * Nudge a small prop off anything already claimed (vegetation runs before us
     * and pushes its trunks into ctx.colliders), so lollipops stop growing
     * through lampposts. Returns the first clear spot, else the original.
     */
    freeSpot(x, z, clear = 1.4) {
      const taken = (px, pz) => ctx.colliders.some((c) => Math.hypot(px - c.x, pz - c.z) < c.r + clear);
      if (!taken(x, z)) return { x, z };
      for (const rad of [1.8, 2.8, 3.8]) for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
        if (!taken(px, pz) && !world.onPath(px, pz, 0.6)) return { x: px, z: pz };
      }
      return { x, z };
    },
    /**
     * A standalone sub-group with its OWN merged meshes. Use it for a landmark
     * that has to be ghosted by the camera: `userData.fade` on a mesh from the
     * main builder would dissolve every wafer surface on the island at once,
     * because that mesh is the whole island. Returns the same rig `building()`
     * uses, so `S.B` is the builder and `S.finish()` returns the meshes.
     */
    sub(name, o = {}) {
      const s = subBuilder(name, o);
      return { B: s.B, group: s.group, mats: s.mats, finish: () => s.finish() };
    },
    chimney(x, y, z) { chimneys.push({ x, y, z }); },
    /** Register an interactable once the interaction system exists. */
    interact(spec) { interactables.push(spec); },
    /** A sign the player can read: uses SIGNS[id].say. */
    readSign(id, x, z, r = 3.0, label) {
      const s = SIGNS[id] || {};
      interactables.push({
        id: 'candyArch_' + id + '_' + Math.round(x) + '_' + Math.round(z), x, z, r,
        label: label || 'Read the sign',
        onInteract: (c) => c.systems.ui?.say(s.say || '…', { speaker: s.speaker || 'Sign', duration: 6 }),
      });
    },
    light(x, y, z, color, dist, intensity) {
      // an anchor of the shared constant pool, not a PointLight (both tiers)
      lights.push({ light: null, anchor: lampPool.add({ x, y, z, color, dist, decay: 2 }), base: intensity });
      return null;
    },
    // ── walkable deck registration ──
    deckRect(x0, x1, z0, z1, y) { decks.push({ t: 'rect', x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y }); },
    deckRamp(x0, x1, z0, z1, yA, yB, axis = 'x') { decks.push({ t: 'ramp', x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), yA, yB, axis }); },
    /** Deck along a segment (bridges, piers at an angle) with an optional crown. */
    deckSeg(ax, az, bx, bz, halfW, yA, yB, crown = 0) { decks.push({ t: 'seg', ax, az, bx, bz, halfW, yA, yB, crown }); },
    deckRing(cx, cz, r0, r1, y) { decks.push({ t: 'ring', cx, cz, r0, r1, y }); },
    /**
     * An annulus with a WEDGE MISSING — a stepped plinth notched for a door and
     * a bite. Without this the walkable surface is a full ring and the player
     * strolls out over the notch on thin air. `a0`..`a1` are world angles
     * (atan2(dz, dx)) sweeping anticlockwise, a1 > a0.
     */
    deckArcRing(cx, cz, r0, r1, a0, a1, y) { decks.push({ t: 'arcring', cx, cz, r0, r1, a0, span: a1 - a0, y }); },
    /** Rotated rectangle (a room floor that is not axis-aligned). */
    deckRRect(x, z, w, d, rot, y) { decks.push({ t: 'rrect', x, z, w, d, rot, y, cs: Math.cos(rot), sn: Math.sin(rot) }); },
    /**
     * A multi-turn spiral staircase. Unlike `deckSpiral` this lives in its own
     * walkable and returns the flight CLOSEST TO THE PLAYER'S CURRENT HEIGHT, so
     * three turns of stair stacked over each other all work and the top landing
     * never yanks you off the first step.
     */
    stairSpiral(cx, cz, a0, turns, rA, rB, halfW, yA, yB, halfB) {
      stairs.push({ cx, cz, a0, turns, rA, rB, halfW, halfB: halfB ?? halfW, yA, yB });
    },
    /** Spiral ramp: a0 = start angle (atan2(dz,dx)), sweep ≤ 2π. */
    deckSpiral(cx, cz, r0, r1, a0, sweep, yA, yB) { decks.push({ t: 'spiral', cx, cz, r0, r1, a0, sweep, yA, yB }); },
    inst,

    // ── ENTERABLE BUILDINGS ──────────────────────────────────────────────────
    /**
     * Returns a rig with three builders:
     *   E.wall  the blocking shell  — fades to a ghost while you are inside
     *   E.roof  the roof / upper cap — hidden outright while you are inside
     *   E.in    the interior        — hidden while you are OUTSIDE (0 draw calls)
     * Everything that does not block the camera (porch, steps, signs, planting)
     * should stay on the main builder so it keeps sharing the merged meshes.
     */
    building(spec) {
      const wall = subBuilder(spec.id + '_wall', { flat: spec.flat });
      const roof = subBuilder(spec.id + '_roof', { flat: spec.flat });
      const inner = subBuilder(spec.id + '_in');
      const rec = {
        id: spec.id, name: spec.name || spec.id,
        x: spec.x, z: spec.z, w: spec.w, d: spec.d, rot: spec.rot || 0, radius: spec.radius || 0,
        pad: spec.pad ?? 0.5, floorY: spec.floorY ?? world.height(spec.x, spec.z), tall: !!spec.tall,
        inside: false, k: 0, lamp: null, fade: [], roofG: roof.group, inG: inner.group,
        wallG: wall.group, ghost: spec.ghost ?? 0.72,   // 0.72 ⇒ 28% opacity: see in, still read the building
      };
      buildings.push(rec);
      const E = {
        rec, wall: wall.B, roof: roof.B, in: inner.B,
        wallGroup: wall.group, roofGroup: roof.group, inGroup: inner.group,
        /** Anchor for the single shared interior PointLight. */
        lamp(x, y, z, color) { rec.lamp = { x, y, z, color: color || 0xffc98a }; },
        /** A swinging door leaf. Adds an 'Open door' interactable and a collider GAP. */
        door(o) {
          const dr = {
            id: spec.id + '_door', house: spec.id, name: rec.name,
            x: o.x, y: o.y, z: o.z, rot: o.rot, w: o.w || 1.2, h: o.h || 2.2,
            facing: o.rot, color: o.color ?? C.chocMilk, swing: o.swing ?? 1,
            open: 0, target: 0, entry: null,
          };
          doorList.push(dr);
          rec.door = dr;
          interactables.push({
            id: dr.id, x: o.x + Math.sin(o.rot) * 1.1, z: o.z + Math.cos(o.rot) * 1.1, r: o.r || 2.3,
            label: 'Open door',
            onInteract(c, self) {
              dr.target = dr.target > 0.5 ? 0 : 1;
              self.label = dr.target > 0.5 ? 'Close door' : 'Open door';
              c.systems.ui?.prompt(self.label, self);
              c.systems.particles?.burst?.({ x: dr.x, y: dr.y + 0.9, z: dr.z, count: 6, color: [0xfff3df, 0xffd6e8], speed: 1.1, life: 0.5, size: 0.13, gravity: -3, spread: 0.7 });
              if (o.say && dr.target > 0.5) c.systems.ui?.say(o.say, { speaker: rec.name, duration: 5 });
            },
          });
          return dr;
        },
        finish() {
          rec.fade = [];
          for (const mesh of wall.finish()) {
            mesh.userData.noGhost = true;           // never ghosted by the camera; its see-through window may cut it (CAMERA_SPEC §5.1)
            // the additive window-spill decal has its own night-driven opacity —
            // it must not be dragged into the ghost fade
            if (!/haloDisc/.test(mesh.name)) rec.fade.push(mesh.material);
          }
          for (const mesh of roof.finish()) mesh.userData.noGhost = true;   // same: cuttable, never ghosted
          inner.finish();
          inner.group.visible = false;
          return rec;
        },
      };
      return E;
    },
  };

  // ── build everything ───────────────────────────────────────────────────────
  const parts = {};
  for (const [name, fn] of [['pier', buildPier], ['village', buildVillage], ['cupcake', buildCupcake],
    ['peak', buildPeak], ['lake', buildLake], ['shrine', buildShrine], ['props', buildProps]]) {
    try { parts[name] = fn(A) || {}; }
    catch (err) { console.error('[candy arch] ' + name + ' failed:', err); }
  }

  const myEnd = ctx.colliders.length;     // [myColliderBase, myEnd) is ours
  const meshes = B.finish(group);
  // mobile: every island-wide merge is drawn through the index runs of the
  // tiles in view (+ its shadow's tiles when it casts) — see the header
  if (MOBILE) for (const k in meshes) {
    const m = meshes[k];
    try { culler.addIndexed(m, triangleTiles(m.geometry, MOBILE_TILE)); }
    catch (e) { console.warn('[candy arch] tile cull skipped', m.name, e.message); }
  }

  // ── instanced extras (one draw call each) ──────────────────────────────────
  const instanced = [];
  function makeInstanced(name, geo, material, list, build) {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, material, list.length);
    m.name = 'candyArch_' + name;
    m.castShadow = name !== 'bunting'; m.receiveShadow = true;
    if (MOBILE && NO_CAST_MOBILE[name]) m.castShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new THREE.Color();
    list.forEach((it, i) => {
      build(it, i, { mx, q, e, p, s });
      m.setMatrixAt(i, mx);
      m.setColorAt(i, col.set(it.color ?? 0xffffff));
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // bounds from the placed instances (+ room for the spin / flutter), culled
    // on both tiers (desktop since Contract J: the island-wide pools used to
    // draw from Cat Island too)
    m.computeBoundingSphere();
    if (m.boundingSphere) m.boundingSphere.radius += 1.5;
    m.frustumCulled = true;
    if (MOBILE && CULL_MOBILE[name]) culler.add(m, { pad: 0.5 });
    group.add(m); instanced.push(m);
    return m;
  }
  const setTRS = (t, it, rot, sc) => {
    t.e.set(rot[0], rot[1], rot[2], 'YXZ'); t.q.setFromEuler(t.e);
    t.mx.compose(t.p.set(it.x, it.y, it.z), t.q, t.s.set(sc[0], sc[1], sc[2]));
  };

  const sprinkleMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0 });
  const beanMat = new THREE.MeshStandardMaterial({ roughness: 0.24, metalness: 0, flatShading: false });
  const grainMat = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true });
  const buntMat = new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide });
  const spinMat = new THREE.MeshStandardMaterial({ roughness: 0.3 });

  makeInstanced('sprinkles', new THREE.CylinderGeometry(0.09, 0.09, 0.42, 5), sprinkleMat, inst.sprinkles,
    (it, i, t) => setTRS(t, it, [it.rx || 0, it.ry || 0, it.rz || 0], [1, 1, 1]));
  makeInstanced('jellybeans', new THREE.SphereGeometry(1, 8, 5), beanMat, inst.beans,
    (it, i, t) => setTRS(t, it, [0, it.ry || 0, it.rz || 0], [it.s * 1.35, it.s * 0.92, it.s]));
  makeInstanced('sugargrains', new THREE.IcosahedronGeometry(1, 0), grainMat, inst.grains,
    (it, i, t) => setTRS(t, it, [it.ry || 0, it.ry || 0, 0], [it.s, it.s, it.s]));
  makeInstanced('spinners', spinnerGeo(), spinMat, inst.spinners,
    (it, i, t) => setTRS(t, it, [0, it.ry || 0, 0], [it.s, it.s, it.s]));
  const bunting = makeInstanced('bunting', new THREE.PlaneGeometry(1, 1), buntMat, inst.bunting,
    (it, i, t) => setTRS(t, it, [0, it.ry || 0, 0], [it.w, it.h, 1]));

  // ── every door leaf in Candyland, in ONE instanced mesh ────────────────────
  // The leaf is modelled hinged at local x=0 spanning x,y ∈ [0,1]; the instance
  // matrix carries the hinge position, the swing angle and the leaf size, so a
  // dozen doors of different sizes swing independently for one draw call.
  const doorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  const doorMesh = doorList.length ? new THREE.InstancedMesh(doorLeafGeo(), doorMat, doorList.length) : null;
  if (doorMesh) {
    doorMesh.name = 'candyArch_doors';
    doorMesh.castShadow = true; doorMesh.receiveShadow = true;
    doorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // the leaves' matrices are only written on the first update, so the
    // bounds come from the hinges: every door within its own leaf + swing
    // (culled on both tiers)
    {
      const bb = new THREE.Box3();
      for (const d of doorList) bb.expandByPoint(new THREE.Vector3(d.x, d.y, d.z));
      doorMesh.boundingSphere = bb.getBoundingSphere(new THREE.Sphere());
      doorMesh.boundingSphere.radius += 4;
      doorMesh.frustumCulled = true;
    }
    const col = new THREE.Color();
    doorList.forEach((d, i) => doorMesh.setColorAt(i, col.set(d.color)));
    if (doorMesh.instanceColor) doorMesh.instanceColor.needsUpdate = true;
    group.add(doorMesh);
  }

  // ── the one interior light (moves to whichever room you are in) ────────────
  // The pool's PRIORITY anchor (always gets a slot while it is lit), so
  // entering a room never changes the light count.
  const roomAnchor = lampPool.add({ x: 0, y: -500, z: 0, color: 0xffc98a, dist: 13, decay: 2, priority: true });

  // ── budget report ──────────────────────────────────────────────────────────
  {
    let tris = 0, n = 0, drawn = 0, drawnTris = 0;
    const per = {};
    group.traverse((o) => {
      if (!o.isMesh) return;
      n++;
      const g = o.geometry, cnt = g.getIndex() ? g.getIndex().count : g.attributes.position.count;
      const t = (cnt / 3) * (o.isInstancedMesh ? o.count : 1);
      tris += t;
      per[o.name] = Math.round(t);
      // a hidden group (an interior) costs nothing until you walk into it
      let vis = o.visible; for (let p = o.parent; p && vis; p = p.parent) vis = p.visible;
      if (vis) { drawn++; drawnTris += t; }
    });
    console.warn('[candy/arch]', JSON.stringify({
      meshes: n, triangles: Math.round(tris), drawnMeshes: drawn, drawnTris: Math.round(drawnTris), pieces: B.stats.pieces,
      colliders: ctx.colliders.length, wallBoxes: boxes.length, interactables: interactables.length,
      chimneys: chimneys.length, lights: lights.length, decks: decks.length, stairs: stairs.length,
      spinners: inst.spinners.length,
      interiors: buildings.map((b) => b.id + '@' + Math.round(b.x) + ',' + Math.round(b.z)),
      doors: doorList.length,
    }));
    if (ctx.params?.has?.('archtris')) {
      console.warn('[candy/arch tris]', JSON.stringify(Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 24)));
    }
  }

  // ── moving pieces ──────────────────────────────────────────────────────────
  const movers = [];
  if (parts.lake?.boat) movers.push(parts.lake.boat);
  if (parts.peak?.movers) movers.push(...parts.peak.movers);

  // ── interactables + particle hooks, once every system exists ───────────────
  ctx.events.on('world:ready', () => {
    try {
      const I = ctx.systems.interaction;
      if (I?.register) for (const s of interactables) { try { I.register(s); } catch (e) { /* ignore */ } }
      const P = ctx.systems.particles;
      if (typeof P?.emitter === 'function') {
        // the fountain: sparkle off the jets, a lazy plume of sugar-steam above
        // the finial, and a fizz of droplets where the arcs hit the basin
        for (const f of (parts.village?.sparkle || [])) P.emitter({ x: f.x, y: f.y, z: f.z, rate: 18, color: [0xffffff, 0xffd6e8, 0xffa8d0], speed: 2.1, life: 1.5, size: 0.17, gravity: -2.6, spread: 1.2, shape: 'sparkle', blend: 'add' });
        for (const f of (parts.village?.steam || [])) P.emitter({ x: f.x, y: f.y, z: f.z, rate: 7, color: [0xffffff, 0xffe4f1], colorEnd: 0xffd0e6, speed: 0.35, up: 0.9, life: 2.6, size: 0.5, sizeEnd: 1.9, gravity: 0.35, spread: 0.7, alpha: 0.26, shape: 'puff', blend: 'normal' });
        for (const f of (parts.village?.splash || [])) P.emitter({ x: f.x, y: f.y, z: f.z, rate: 9, color: [0xffd9ea, 0xff9cc8], speed: 1.5, up: 0.7, life: 0.75, size: 0.15, gravity: -7, spread: 0.45 });
        for (const f of (parts.lake?.sparkle || [])) P.emitter({ x: f.x, y: f.y, z: f.z, rate: 5, color: [0x7d4a26, 0xd98b2b, 0x4a2a17], speed: 1.2, life: 1.0, size: 0.18, gravity: -3.0, spread: 1.0 });
      }
    } catch (err) { console.error('[candy arch] world:ready hook failed', err); }

    // ── collider fallback ────────────────────────────────────────────────────
    // The contract says ctx.colliders takes oriented boxes. If the player system
    // in this build still only understands circles, every wall we registered
    // would be silently ignored (c.r is undefined → NaN → no push-out), so
    // synthesise a chain of circles down the spine of each box instead. Costs a
    // few hundred cheap colliders and is dropped the moment boxes land.
    try {
      const src = String(ctx.systems.player?.update || '');
      const supportsBoxes = /\bbox\b/.test(src) || /resolve\s*\(/.test(src) || ctx.systems.player?.boxColliders === true;
      if (!supportsBoxes && boxes.length) {
        let n = 0;
        for (const b of boxes) {
          const along = b.w >= b.d, half = (along ? b.w : b.d) / 2, r = Math.max(0.22, (along ? b.d : b.w) / 2);
          const cs = Math.cos(b._ry), sn = Math.sin(b._ry);
          const span = Math.max(0, half - r), steps = Math.max(1, Math.ceil((span * 2) / (r * 1.25)));
          for (let i = 0; i <= steps; i++) {
            const t = steps === 0 ? 0 : -span + (span * 2 * i) / steps;
            const lx = along ? t : 0, lz = along ? 0 : t;
            ctx.colliders.push({ x: b.x + lx * cs + lz * sn, z: b.z - lx * sn + lz * cs, r, h: b.h });
            n++;
          }
        }
        console.warn('[candy/arch] player has no box colliders — ' + n + ' fallback circles added for ' + boxes.length + ' walls');
      }
    } catch (err) { /* never break the build over a probe */ }

    // ── clear foreign props out of the rooms ─────────────────────────────────
    // Vegetation is placed before architecture exists, so a candy cane can be
    // standing in somebody's kitchen. Its instances are blanked by vegetation's
    // own clearance pass (that is what the claim circles above are for) but its
    // COLLIDER survives and would wall the player into a corner of a room they
    // can now walk into. Disarm any foreign circle standing inside a footprint.
    try {
      let n = 0;
      const mine = ctx.colliders.length;
      for (let i = 0; i < ctx.colliders.length; i++) {
        if (i >= myColliderBase && i < myEnd) continue;          // ours: beds, tables, posts
        const c = ctx.colliders[i];
        if (!c || c.box || c.solid === false || !(c.r > 0)) continue;
        let hit = false;
        for (const r of buildings) if (insideRec(r, c, -0.25)) { hit = true; break; }
        // …and nothing stands in a doorway either: a lollipop planted on the
        // threshold makes a door you can see and cannot use
        if (!hit) for (const d of doorList) {
          const vx = Math.sin(d.rot), vz = Math.cos(d.rot);
          const t = Math.max(0, Math.min(4.0, (c.x - d.x) * vx + (c.z - d.z) * vz));
          const px = d.x + vx * t - c.x, pz = d.z + vz * t - c.z;
          if (Math.hypot(px, pz) < c.r + 0.95) { hit = true; break; }
        }
        if (hit) { c.solid = false; n++; }
      }
      if (n) console.warn('[candy/arch] disarmed ' + n + ' foreign props standing inside enterable rooms');
      void mine;
    } catch (err) { /* ignore */ }
  });

  // ── walkable surfaces ──────────────────────────────────────────────────────
  function deckY(d, x, z) {
    {
      let y = null;
      if (d.t === 'rect') { if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) y = d.y; }
      else if (d.t === 'ramp') {
        if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) {
          const t = d.axis === 'x' ? (x - d.x0) / (d.x1 - d.x0) : (z - d.z0) / (d.z1 - d.z0);
          y = d.yA + (d.yB - d.yA) * t;
        }
      } else if (d.t === 'seg') {
        const vx = d.bx - d.ax, vz = d.bz - d.az, L = vx * vx + vz * vz;
        let t = L > 0 ? ((x - d.ax) * vx + (z - d.az) * vz) / L : 0;
        if (t >= 0 && t <= 1) {
          const px = d.ax + vx * t - x, pz = d.az + vz * t - z;
          if (Math.hypot(px, pz) <= d.halfW) y = d.yA + (d.yB - d.yA) * t + d.crown * Math.sin(Math.PI * t);
        }
      } else if (d.t === 'ring') {
        const r = Math.hypot(x - d.cx, z - d.cz);
        if (r >= d.r0 && r <= d.r1) y = d.y;
      } else if (d.t === 'arcring') {
        const r = Math.hypot(x - d.cx, z - d.cz);
        if (r >= d.r0 && r <= d.r1) {
          let a = Math.atan2(z - d.cz, x - d.cx) - d.a0;
          a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          if (a <= d.span) y = d.y;
        }
      } else if (d.t === 'rrect') {
        const dx = x - d.x, dz = z - d.z;
        const lx = dx * d.cs - dz * d.sn, lz = dx * d.sn + dz * d.cs;
        if (Math.abs(lx) <= d.w / 2 && Math.abs(lz) <= d.d / 2) y = d.y;
      } else if (d.t === 'spiral') {
        const dx = x - d.cx, dz = z - d.cz, r = Math.hypot(dx, dz);
        if (r >= d.r0 && r <= d.r1) {
          let a = Math.atan2(dz, dx) - d.a0;
          a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          if (a <= d.sweep) y = d.yA + (d.yB - d.yA) * (a / d.sweep);
        }
      }
      return y;
    }
  }
  function getDeckHeight(x, z) {
    let best = null;
    for (const d of decks) { const y = deckY(d, x, z); if (y !== null && (best === null || y > best)) best = y; }
    return best;
  }
  // The walkable hook is gated by reachability PER DECK: a deck only counts if
  // the player is already near its level, or it is a small step up from the
  // ground. Without this the Great Cupcake's balcony would yank a ground-level
  // player 10 units into the air the moment they walked under it — and with the
  // filter applied to the winner only, standing on the cupcake's ground floor
  // would reject the whole stack because the mezzanine above it is the highest.
  ctx.walkables.push({
    id: 'candyArchDecks',
    test(x, z) {
      const p = ctx.systems.player?.position;
      const py = p ? p.y : 0, g = world.height(x, z);
      let best = null;
      for (const d of decks) {
        const y = deckY(d, x, z);
        if (y === null) continue;
        if (!(y - g <= 1.4 || (y - py <= 2.2 && py - y <= 6.0))) continue;
        if (best === null || y > best) best = y;
      }
      return best;
    },
  });
  /**
   * Spiral staircases. A three-turn stair puts three floors over the same (x,z),
   * so this picks the tread nearest the player's own height instead of the
   * highest one — which is what lets you climb the Frosting Peak tower at all.
   */
  function stairHeight(x, z, py) {
    let best = null, bestD = Infinity;
    for (const s of stairs) {
      const dx = x - s.cx, dz = z - s.cz, r = Math.hypot(dx, dz);
      if (r < 0.05) continue;
      let a = Math.atan2(dz, dx) - s.a0;
      a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const total = s.turns * Math.PI * 2;
      for (let k = 0; k < Math.ceil(s.turns) + 1; k++) {
        const ang = a + k * Math.PI * 2;
        if (ang > total) break;
        const t = ang / total;
        const rc = s.rA + (s.rB - s.rA) * t;
        if (Math.abs(r - rc) > s.halfW + (s.halfB - s.halfW) * t) continue;
        const y = s.yA + (s.yB - s.yA) * t;
        const dy = Math.abs(y - py);
        if (dy < 2.4 && dy < bestD) { bestD = dy; best = y; }
      }
    }
    return best;
  }
  ctx.walkables.push({
    id: 'candyArchStairs',
    test(x, z) {
      if (!stairs.length) return null;
      const p = ctx.systems.player?.position;
      return stairHeight(x, z, p ? p.y : 0);
    },
  });

  // ── day/night + motion ─────────────────────────────────────────────────────
  const e = new THREE.Euler(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), mx = new THREE.Matrix4();
  // ── enterable rooms: footprint test, fade, doors ───────────────────────────
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _mx = new THREE.Matrix4();
  function insideRec(r, p, pad) {
    const dx = p.x - r.x, dz = p.z - r.z;
    if (r.radius) return dx * dx + dz * dz <= (r.radius + pad) * (r.radius + pad);
    const cs = Math.cos(r.rot), sn = Math.sin(r.rot);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    return Math.abs(lx) <= r.w / 2 + pad && Math.abs(lz) <= r.d / 2 + pad;
  }
  /**
   * k = 0 outside → 1 inside.
   * ROOF: hidden outright (so the iso camera can see down into the room and the
   * sun can get in). WALLS: ghosted, not hidden — a house whose walls vanish
   * leaves its window frames and porch floating in mid-air, while a 20%-opacity
   * shell still reads as the building you are standing in. INTERIOR: only ever
   * drawn while you are in the footprint, so it is free the rest of the time.
   */
  function applyRoom(r, k) {
    r.k = k;
    const ghost = k > 0.02;
    const op = 1 - k * r.ghost;
    for (const m of r.fade) {
      m.opacity = op; m.transparent = ghost || m.userData.alwaysTransparent === true;
      m.depthWrite = !ghost;
      m.needsUpdate = m.transparent !== m.userData._tr;
      m.userData._tr = m.transparent;
    }
    if (r.wallG) for (const m of r.wallG.children) m.castShadow = !ghost;
    if (r.roofG) r.roofG.visible = k < 0.5;
    if (r.inG) r.inG.visible = k > 0.01;
  }

  function updateRooms(dt, ctx, night) {
    const p = ctx.systems.player?.position;
    let active = null;
    for (const r of buildings) {
      if (p) {
        const was = r.inside;
        r.inside = insideRec(r, p, was ? r.pad + 0.7 : r.pad);   // hysteresis
        if (r.inside && Math.abs(p.y - r.floorY) > 9 && !r.tall) r.inside = false;
        if (r.inside !== was) {
          ctx.events.emit(r.inside ? 'interior:enter' : 'interior:exit', { id: r.id, name: r.name, x: r.x, z: r.z });
          if (r.door) r.door.target = r.inside ? 1 : 0;           // never walk through a shut door; it closes behind you
          if (r.inside && !r.seen) { r.seen = true; ctx.systems.ui?.toast?.('Inside ' + r.name, 2.6); }
        }
      }
      const k = damp(r.k, r.inside ? 1 : 0, 9, dt);
      if (Math.abs(k - r.k) > 0.001 || (k > 0.5) !== (r.k > 0.5)) applyRoom(r, k);
      // an OPEN door with the room hidden behind it is a hole through the house:
      // keep the interior drawn while the leaf is off the jamb
      if (r.inG && r.door && r.door.open > 0.05) r.inG.visible = true;
      if (r.inside) active = r;
    }
    // the shared room light (see the comment where it is created). 16 + 20, not
    // 26 + 34: at 60 a decay-2 lamp 2 units off the floor of a 5 × 4 room puts
    // every wall corner past the ACES knee and the room reads as a white box.
    if (active && active.lamp && p) {
      roomAnchor.x = active.lamp.x; roomAnchor.y = active.lamp.y; roomAnchor.z = active.lamp.z;
      roomAnchor.color.set(active.lamp.color);
      roomAnchor.level = damp(roomAnchor.level, 16 + night * 20, 6, dt);
    } else {
      roomAnchor.level = damp(roomAnchor.level, 0, 8, dt);
      if (roomAnchor.level < 0.4) roomAnchor.level = 0;
    }
    // door swings
    if (doorMesh) {
      let dirty = false;
      for (let i = 0; i < doorList.length; i++) {
        const d = doorList[i];
        const o = damp(d.open, d.target, 7, dt);
        if (Math.abs(o - d.open) < 0.0005 && d.settled) continue;
        d.open = o; d.settled = Math.abs(o - d.target) < 0.002;
        _e.set(0, d.rot + d.swing * o * 1.78, 0, 'YXZ');
        _q.setFromEuler(_e);
        // hinge sits at the left jamb, in the wall plane
        const hx = d.x - Math.cos(d.rot) * (d.w / 2), hz = d.z + Math.sin(d.rot) * (d.w / 2);
        _mx.compose(_p.set(hx, d.y, hz), _q, _s.set(d.w, d.h, 1));
        doorMesh.setMatrixAt(i, _mx);
        dirty = true;
      }
      if (dirty) doorMesh.instanceMatrix.needsUpdate = true;
    }
  }

  const publicInteriors = buildings.map((r) => ({
    id: r.id, name: r.name, x: r.x, z: r.z,
    w: r.w || r.radius * 2, d: r.d || r.radius * 2, rot: r.rot, radius: r.radius,
    floorY: r.floorY, get inside() { return r.inside; },
  }));
  const publicDoors = doorList.map((d) => ({
    id: d.id, house: d.house, name: d.name, x: d.x, y: d.y, z: d.z,
    facing: d.rot, get open() { return d.open; },
    // where a Sour Patch Kid should stand to step through it
    ax: d.x + Math.sin(d.rot) * 1.1, az: d.z + Math.cos(d.rot) * 1.1,
  }));

  // ── landmark reveal list ───────────────────────────────────────────────────
  // The camera eases its lens out when you step into a named place; this tells
  // it WHERE the view is from, so the reveal happens at the spot on the path
  // where the whole silhouette is in frame, not in the middle of the building.
  // `revealFrom` is a point on (or beside) the approach path — either literal
  // coordinates, or the id of a mark that a builder put down (the Frosting Peak
  // viewpoint is a real wafer terrace with a bench on it, so the reveal should
  // happen exactly where that terrace ended up, not where we guessed it would).
  const REVEALS = [
    ['welcome_arch', -51.5, 26.2], ['sugar_pier', -47.5, 25.0], ['ticket_booth', -46.5, 27.6],
    ['donut_arch', -60.5, 28.4], ['great_cupcake', -85.4, 3.6], ['cupcake_bite', -68.6, -12.0],
    ['gumdrop_village', -122.0, 38.4], ['sugar_fountain', -137.0, 43.6], ['bandstand', -135.0, 47.5],
    ['cherry_monument', 'peak_viewpoint'], ['lookout_tower', 'peak_viewpoint'], ['peak_bridge', -163.0, -46.0],
    ['chocolate_lake', -183.0, 38.6], ['boathouse', -199.0, 38.0],
    ['leaning_bar', -171.5, 33.0], ['sour_shrine', -212.0, -37.0],
  ];
  // An ARRAY for the camera ([{id,x,z,revealFrom}]) that still answers to
  // `landmarks.sugar_fountain` — particles/ambient.js and inventory/places.js
  // read it as a map and must keep working.
  const landmarkList = [];
  for (const [id, rx, rz] of REVEALS) {
    const m = landmarks[id];
    if (!m) continue;
    const from = typeof rx === 'string' ? landmarks[rx] : { x: rx, z: rz };
    if (!from) continue;
    landmarkList.push({ id, x: m.x, y: m.y, z: m.z, revealFrom: { x: from.x, z: from.z } });
  }
  for (const k in landmarks) if (!(k in landmarkList)) landmarkList[k] = landmarks[k];

  const api = {
    group, meshes, mats, decks, chimneys, landmarks: landmarkList, marks: landmarks, getDeckHeight,
    signAtlas: atlas.tex,
    lampPool,   // the shared constant light pool (terrain/lamppool.js) — lampPool.stats() for debugging
    lakeSurface: parts.lake?.surface || null,   // terrain builder may hide this
    caveMouth: parts.peak?.cave || null,
    pierHead: parts.pier?.head || null,
    interiors: publicInteriors,
    doors: publicDoors,
    /** The stair flight nearest a building, for anything that wants to walk it. */
    stairAt(id) {
      const r = buildings.find((b) => b.id === id);
      if (!r) return null;
      let best = null, bd = Infinity;
      for (const s of stairs) { const d = Math.hypot(s.cx - r.x, s.cz - r.z); if (d < bd) { bd = d; best = s; } }
      if (!best || bd > 6) return null;
      return {
        ...best,
        /** radius of the middle of the tread at world height y */
        rc(y) { const t = clamp((y - best.yA) / (best.yB - best.yA), 0, 1); return best.rA + (best.rB - best.rA) * t; },
      };
    },
    /** Which room (if any) contains a world point. */
    interiorAt(x, z) {
      for (const r of buildings) if (insideRec(r, { x, z }, 0)) return r.id;
      return null;
    },
    /** Walk the player into a room (debug hook + render views). */
    enter(id) {
      const r = buildings.find((b) => b.id === id) || buildings[0];
      if (!r) return null;
      ctx.systems.player?.teleport(r.x, r.z);
      const p = ctx.systems.player?.position;
      if (p) { p.y = r.floorY + 0.05; }
      r.inside = true; r.k = 1;
      applyRoom(r, 1);
      return { id: r.id, x: r.x, z: r.z, y: r.floorY };
    },
    exit() {
      const r = buildings.find((b) => b.inside);
      if (!r || !r.door) return null;
      ctx.systems.player?.teleport(r.door.x + Math.sin(r.door.rot) * 2.6, r.door.z + Math.cos(r.door.rot) * 2.6);
      return r.id;
    },
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      // LAMP MASTER: sky publishes `lampMix` (0..1) — lanterns come on at 18:50,
      // are full by 19:24 and are out by 06:21 — so nothing is blazing at a
      // bright 05:53 dawn, which is what raw (1 − daylight) used to do.
      const lm = ctx.systems.sky?.lampMix;
      const night = Number.isFinite(lm) ? lm : 1 - (ctx.state.daylight ?? 1);
      // Emissive stays modest: ACES tone-mapping clips anything past ~2 to a
      // flat white blob, and a lamp that reads WARM is the whole point of night.
      for (const m of dyn.windowWarm) m.emissiveIntensity = 0.04 + night * 1.25;
      // 1.35, not 1.75: with the bigger lamp globes the old value clipped them
      // to flat white through ACES, and a lamp that reads WARM is the point
      for (const m of dyn.glowWarm) m.emissiveIntensity = 0.22 + night * 1.25;
      // SIGNS ARE LIT SURFACES, not light sources. 0.10, not 0.28: the atlas is
      // near-white card, so at 0.28 a board is emitting ~0.28 linear while the
      // rest of a 21:00 scene sits near 0.05 — which is why WELCOME TO CANDYLAND
      // read as a slab of full-bright white after dark. At 0.10 a board picks up
      // just enough to say "somebody keeps a lamp on this", and a sign that is
      // actually under a lantern is lit by the lantern, as it should be.
      for (const m of dyn.sign) m.emissiveIntensity = night * 0.10;
      for (const m of dyn.halo) {
        m.emissiveIntensity = night * 0.78; m.opacity = night * 0.66; m.visible = night > 0.04;
      }
      mats.windowPink.emissiveIntensity = 0.04 + night * 1.15;
      mats.glowSour.emissiveIntensity = 0.10 + night * 2.2 + Math.sin(t * 1.7) * 0.1 * night;
      mats.sign.emissiveIntensity = night * 0.10;
      for (const L of lights) L.anchor.level = L.base * night;
      updateRooms(dt, ctx, night);
      mats.flow.map.offset.y = (mats.flow.map.offset.y - dt * 0.85) % 1;

      // bunting flutter
      if (bunting) {
        const list = inst.bunting;
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          const ph = it.ph + t * 2.3;
          e.set(Math.sin(ph) * 0.45, it.ry, Math.sin(ph * 0.7 + 1.1) * 0.3, 'YXZ');
          q.setFromEuler(e);
          mx.compose(p.set(it.x, it.y + Math.sin(ph * 1.3) * 0.04, it.z), q, s.set(it.w, it.h, 1));
          bunting.setMatrixAt(i, mx);
        }
        bunting.instanceMatrix.needsUpdate = true;
      }
      // wind-spinner lollipops
      const spin = instanced.find((m) => m.name === 'candyArch_spinners');
      if (spin) {
        const list = inst.spinners;
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          e.set(0, it.ry, it.ph + t * (1.4 + it.spd), 'YXZ');
          q.setFromEuler(e);
          mx.compose(p.set(it.x, it.y, it.z), q, s.set(it.s, it.s, it.s));
          spin.setMatrixAt(i, mx);
        }
        spin.instanceMatrix.needsUpdate = true;
      }
      // bobbing / turning props
      for (const m of movers) {
        if (m.bob) { m.obj.position.y = m.y0 + Math.sin(t * m.bob.f + m.bob.ph) * m.bob.a; m.obj.rotation.z = Math.sin(t * m.bob.f * 0.7 + m.bob.ph) * m.bob.a * 0.5; }
        if (m.spin) m.obj.rotation.y += dt * m.spin;
      }
    },
  };
  return api;
}

/**
 * One door leaf, modelled hinged at local x = 0 and spanning x,y ∈ [0,1] with a
 * baked 0.11 thickness, so the instance matrix can carry position, swing and
 * leaf size and every door in Candyland costs one draw call between them.
 * Vertex colours are multiplied by the per-instance colour: the leaf is white
 * (takes the door's colour), the panel lines darker, the knob pale.
 */
function doorLeafGeo() {
  const src = [];
  const tint = [];
  const push = (g, c) => { src.push(g); tint.push(c); };
  const leaf = new THREE.BoxGeometry(1, 1, 0.11); leaf.translate(0.5, 0.5, 0); push(leaf, [1, 1, 1]);
  for (const y of [0.3, 0.68]) {
    const p = new THREE.BoxGeometry(0.62, 0.05, 0.13); p.translate(0.5, y, 0); push(p, [0.72, 0.66, 0.62]);
  }
  const knob = new THREE.SphereGeometry(0.075, 7, 5); knob.translate(0.84, 0.5, 0.07); push(knob, [1.35, 1.2, 0.55]);
  const parts = src.map((g) => { const n = g.toNonIndexed(); g.dispose(); return n; });
  let total = 0; for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  parts.forEach((g, i) => {
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    const n = g.attributes.position.count, c = tint[i];
    for (let k = 0; k < n; k++) { col[(o + k) * 3] = c[0]; col[(o + k) * 3 + 1] = c[1]; col[(o + k) * 3 + 2] = c[2]; }
    o += n; g.dispose();
  });
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return m;
}

/**
 * A pinwheel head: 6 PITCHED blades on a hub, the whole thing lying in the
 * local XY plane so its face normal is +Z. The instance matrix only ever
 * applies a yaw (Y) and a spin about that normal (Z), so the head always stands
 * upright on its stick — a head built in the XZ plane would lie flat in the
 * ground the moment it was placed. The blades are pitched 0.5 rad out of the
 * disc and are 0.12 thick so the head still reads when seen edge-on.
 */
function spinnerGeo() {
  const src = [];
  // 5 blades and coarse hubs: there are ~52 of these turning at once and at a
  // 0.8-unit head nobody has ever counted the petals.
  const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.22, 6); hub.rotateX(Math.PI / 2); src.push(hub);
  const cap = new THREE.ConeGeometry(0.17, 0.26, 6); cap.rotateX(-Math.PI / 2); cap.translate(0, 0, 0.22); src.push(cap);
  const nut = new THREE.IcosahedronGeometry(0.14, 0); nut.translate(0, 0, -0.16); src.push(nut);
  for (let i = 0; i < 5; i++) {
    const pet = new THREE.BoxGeometry(0.72, 0.4, 0.12);
    pet.rotateX(0.5);                                  // pitch, so it catches the wind
    pet.translate(0.5, 0, 0); pet.rotateZ((i / 5) * Math.PI * 2);
    src.push(pet);
  }
  const parts = src.map((g) => { const n = g.toNonIndexed(); g.dispose(); return n; });
  let total = 0; for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count; g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return m;
}
