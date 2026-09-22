// ── Riding a vehicle ─────────────────────────────────────────────────────────
// One shared helper for every escape vehicle (catapult seat, canoe, ornithopter).
// The escape system runs BEFORE player.js in main.js's system order, so a vehicle
// writes player.position each frame and player.js then reads it — exactly the
// pattern ferry.js uses for the whale's deck.
//
// Three things have to be true while somebody is riding:
//   1. input is off               → player.locked = true
//   2. the vehicle owns Y         → we register a ctx.walkables entry that reports
//                                    the seat height under the rider. player.js
//                                    treats that as a deck: it follows our height
//                                    (lag ≈ v/20, sub-0.3 units in practice), it
//                                    never blocks us over deep water, and it never
//                                    thinks we are wading (no phantom sea splashes
//                                    while flying).
//   3. nothing shoves the rider   → ctx.colliders is swapped for an empty array so
//                                    a house we fly over cannot push us sideways,
//                                    and interactables are disabled so E does not
//                                    fire "read the notice board" at 40 units up.
//
// Everything else (cat containment's lifeguard, weapons, sour patch) should skip
// while `ctx.state.vehicle` is set or `player.locked` / `player.onVehicle` is true.
//   ctx.state.vehicle = { type: 'catapult' | 'canoe' | 'flyer' }
// Events: 'vehicle:board' { type } · 'vehicle:unboard' { type, x, z }
import { damp } from '../../core/util.js';

export function createRider(ctx) {
  let on = null;                 // { type, x, y, z, r }
  let savedColliders = null;
  let savedInteract = null;      // [entry, ...] that we disabled

  ctx.walkables = ctx.walkables || [];
  ctx.walkables.push({
    test(x, z) {
      if (!on) return null;
      const dx = x - on.x, dz = z - on.z;
      return (dx * dx + dz * dz) < on.r * on.r ? on.y : null;
    },
  });

  const player = () => ctx.systems.player;

  function suspendWorld() {
    if (savedColliders === null) { savedColliders = ctx.colliders || []; ctx.colliders = []; }
    const I = ctx.systems.interaction;
    if (I && !savedInteract) {
      savedInteract = [];
      for (const e of I.items.values()) if (e.enabled !== false) { savedInteract.push(e); e.enabled = false; }
      ctx.systems.ui?.prompt(null);
    }
  }
  function restoreWorld() {
    if (savedColliders !== null) {
      const added = ctx.colliders;
      ctx.colliders = savedColliders;
      if (added && added !== savedColliders) for (const c of added) savedColliders.push(c);
      savedColliders = null;
    }
    if (savedInteract) { for (const e of savedInteract) e.enabled = true; savedInteract = null; }
  }

  const api = {
    get riding() { return !!on; },
    get type() { return on ? on.type : null; },

    /** Take control. `r` = radius of the "deck" the rider stands on. */
    mount(type, x, y, z, r = 2.4) {
      const pl = player(); if (!pl) return false;
      on = { type, x, y, z, r };
      pl.locked = true;
      pl.onVehicle = true;                       // wave-2 contract (player.js may also read it)
      pl.velocity.set(0, 0, 0);
      pl.position.set(x, y, z);
      pl.group?.position.set(x, y, z);
      ctx.state.vehicle = { type };
      suspendWorld();
      ctx.events.emit('vehicle:board', { type });
      return true;
    },

    /** Drive the rider. Call once per frame from the route's update(). */
    place(x, y, z, facing) {
      const pl = player(); if (!pl || !on) return;
      on.x = x; on.y = y; on.z = z;
      pl.position.set(x, y, z);
      pl.velocity.set(0, 0, 0);
      if (facing !== undefined && Number.isFinite(facing)) pl.facing = facing;
      pl.group?.position.set(x, y, z);
    },

    /** Turn smoothly toward a yaw (keeps the visitor from snapping around). */
    turnTo(facing, lambda, dt) {
      const pl = player(); if (!pl) return;
      let d = facing - pl.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      pl.facing = pl.facing + d * (1 - Math.exp(-lambda * dt));
    },

    /** player.setPose is being added by the player builder — never assume it. */
    pose(name) { try { player()?.setPose?.(name); } catch (err) { /* optional */ } },

    /** Hand control back, standing the visitor at (x, z) on real ground. */
    unmount(x, z) {
      const pl = player();
      const type = on ? on.type : null;
      on = null;
      restoreWorld();
      ctx.state.vehicle = null;
      if (pl) {
        pl.locked = false;
        pl.onVehicle = false;
        pl.velocity.set(0, 0, 0);
        if (x !== undefined) pl.teleport(x, z);
      }
      api.pose(null);
      ctx.events.emit('vehicle:unboard', { type, x, z });
    },
  };
  return api;
}

/**
 * The clearest patch inside a landmark core. Vegetation and architecture are
 * built BEFORE the escape system, so their colliders are already in
 * ctx.colliders — a vehicle can simply ask where the trees are not, instead of
 * being planted under a pine.
 */
export function clearSpot(ctx, cx, cz, opts = {}) {
  const world = ctx.world;
  const { radius = 6, need = 6, step = 1.0, minH = 0.8, pull = 0.14, pad = 0 } = opts;
  const cols = ctx.colliders || [];
  let best = { x: cx, z: cz, clear: -Infinity, score: -Infinity };
  for (let r = 0; r <= radius + 1e-6; r += step) {
    const n = r === 0 ? 1 : Math.max(8, Math.round(r * 7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (world.height(x, z) < minH) continue;
      let d = Infinity;
      for (let k = 0; k < cols.length; k++) {
        const c = cols[k];
        const dd = Math.hypot(x - c.x, z - c.z) - (c.r || 0) - pad;   // pad ≈ canopy overhang
        if (dd < d) { d = dd; if (d < -2) break; }
      }
      const score = Math.min(d, need) - r * pull;
      if (score > best.score) best = { x, z, clear: d, score };
    }
  }
  return best;
}

/**
 * CLEARANCE CLAIM — "nothing grows on my launch pad".
 *
 * cat/nature plants its palms and bushes before the escape system exists, but
 * on 'world:ready' it re-tests every instance against the oriented BOX
 * colliders in ctx.colliders and blanks the ones standing inside a building.
 * Publishing a box here is therefore the only way to clear ground that is
 * already planted — nature is created before us, so its handler runs first.
 *
 * The box must then GO. `h` (an absolute world height, below the ground) keeps
 * player.js from treating it as a wall, but camera.js's occlusion sweep reads
 * boxes without any height test at all: leave a 24-unit claim in the list and
 * the lens dollies to six units and plays the game inside the visitor's hat.
 * So the claim neutralises itself on the frame after nature has read it.
 */
export function clearanceClaim(ctx, x, z, w, d, rot = 0, id = 'claim') {
  const c = { x, z, w, d, rot, h: -999, box: true, claim: id };
  ctx.colliders = ctx.colliders || [];
  ctx.colliders.push(c);
  ctx.events.on('world:ready', () => { c.w = 0; c.d = 0; c.r = 0; c.x = 1e6; });
  return c;
}

/** True when some other vehicle / cutscene already owns the visitor. */
export function vehicleBusy(ctx) {
  return !!ctx.state.vehicle || !!ctx.systems.player?.locked || !!ctx.systems.player?.onFerry;
}

/** Walk inland from (x,z) along (dx,dz) until the ground is dry. */
export function beachPoint(world, x, z, dx, dz, want = 1.0, maxStep = 26) {
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  let bx = x, bz = z;
  for (let s = 0; s <= maxStep; s += 0.75) {
    bx = x + dx * s; bz = z + dz * s;
    if (world.height(bx, bz) > want) return { x: bx, z: bz };
  }
  return { x: bx, z: bz };
}

export { damp };
