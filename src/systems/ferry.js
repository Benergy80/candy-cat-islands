// ─────────────────────────────────────────────────────────────────────────────
// THE SUGARFIN EXPRESS — the ferry between Candyland and Cat Island.
//
// She is not a boat. She is a very large, very friendly, slightly sleepy
// narwhal-whale with a candy-striped horn, a wooden passenger deck strapped to
// her back, a striped canopy, lanterns, a bell, a tiny cabin, and a walrus in a
// captain's hat who has opinions.
//
// API:   ctx.systems.ferry.requestDeparture('cat' | 'candy') → bool
//        ctx.systems.ferry.setProgress(0..1 | null)  park her mid-route for a
//          screenshot (no phase change, no camera change); null = back at her pier
//        ctx.systems.ferry.state   { phase, side, to, progress, asleep, trips }
//        ctx.systems.ferry.whale   THREE.Group
// Events: 'ferry:board' { to } at departure, 'ferry:arrive' { to } on landing.
//         ctx.state.ferry = { to, progress } for the whole crossing, else null.
// Debug:  ?ferry=0.5 starts a crossing already half-way over (for renders);
//         ?ferry=cat / ?ferry=candy starts her docked on that side.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, hash, damp, clamp, lerp, smoothstep } from '../core/util.js';
import { buildWhale } from './ferry/whale.js';
import { buildCaptain } from './ferry/captain.js';
import { buildDolphins, buildSeagull } from './ferry/wildlife.js';
import { DOCKS, WATER_Y, makeRoute } from './ferry/route.js';

const T = { board: 2.2, cross: 21.5, moor: 1.7, land: 1.9 };

const LINES = {
  boardCat: [
    'All aboard the Sugarfin Express! Mind the horn, she\'s proud of it.',
    'Cat Island! Lovely place. Lovely, lovely place.',
  ],
  boardCandy: ['Okay, FINE. You can VISIT the Candy Kingdom. But you live here now.'],
  mid: [
    'Round trip? Ha. HA.',
    'Sugarfin eats plankton and schedules. Mostly schedules.',
    'Don\'t feed the dolphins. They\'re already gummy.',
    'Forty years on this whale. Never once been seasick. Her, I mean.',
  ],
  stowaway: [
    'That\'s Barnacle. He rides both ways. Never pays. Owns the crate, apparently.',
    'Ignore him. He\'s counting the humans. He does that.',
    'Barnacle! We talked about the crate. … Fine. Keep the crate.',
  ],
  woke: ['She\'s UP! Honorary citizen, is it? Well. Nobody told the whale.'],
  arriveCat: ['Arrivals Pier! Enjoy Cat Island. Everyone does. Forever.'],
  arriveCandy: ['Sugar Pier. You have four hours. I\'m joking. You have none.'],
  asleep: [
    'Captain\'s on break. Break started Tuesday.',
    'She\'s asleep. The cats sang her a lullaby. Very organised, the cats.',
    'No sailings today. Or tomorrow. Or — look, it\'s a whale thing.',
  ],
};

export function create(ctx) {
  const { scene, world } = ctx;

  // ── build ──────────────────────────────────────────────────────────────────
  const W = buildWhale();
  scene.add(W.group);
  scene.add(W.foam);
  scene.add(W.bow);
  scene.add(W.wake);
  scene.add(W.ropes);
  scene.add(W.lampFx);
  const cap = buildCaptain();
  cap.group.scale.setScalar(1.45);   // a generously proportioned walrus
  W.deck.add(cap.group);
  const dolphins = buildDolphins(6);
  scene.add(dolphins);
  const gull = buildSeagull();
  scene.add(gull.group);

  // ── MOBILE TIER (ctx.state.mobile, read once here; BRIEF Contract I) ──────
  // • shadows: only her body (hull + deck) and the captain cast — eyes, tail,
  //   gangway, gate, bell, flag and the gull are too small to earn a shadow-pass
  //   draw each on a phone (11 → 4 shadow draws at sea);
  // • no PointLights: two lanterns joining the light count at dusk recompile
  //   every lit program in the scene. The lantern shades (emissive) and the
  //   lampFx halos + water smears carry the glow instead, a touch brighter;
  // • her own water (hull foam, bow moustache, wake): Lambert instead of
  //   Standard — all three are roughness 1, so the GGX term was buying nothing
  //   but per-pixel cost over a lot of transparent sea.
  const MOBILE = !!ctx.state.mobile;
  const LAMPFX_GAIN = 1.3;               // mobile only: the halos stand in for the lights
  // mobile only: the warm pool each lantern throws on the planks (what the
  // PointLight painted on desktop) as ONE instanced pair of flat additive glows
  // parented to the deck — one draw call, near the ferry, after dark.
  let deckPools = null;
  const POOL_GAIN = 0.58;
  if (MOBILE) {
    const keep = new Set([W.hull, W.deck]);
    cap.group.traverse((n) => { if (n.isMesh) keep.add(n); });
    for (const root of [W.group, gull.group]) {
      root.traverse((n) => { if ((n.isMesh || n.isInstancedMesh) && n.castShadow && !keep.has(n)) n.castShadow = false; });
    }
    for (const l of W.lights) { if (l.parent) l.parent.remove(l); l.dispose?.(); }
    W.lights.length = 0;
    for (const m of [W.foam, W.bow, W.wake]) {
      const std = m.material;
      m.material = new THREE.MeshLambertMaterial({
        color: std.color, map: std.map, vertexColors: std.vertexColors,
        transparent: std.transparent, opacity: std.opacity,
        emissive: std.emissive, emissiveIntensity: std.emissiveIntensity,
        depthWrite: std.depthWrite, side: std.side,
      });
      std.dispose();
    }
    const pg = new THREE.PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    pg.computeBoundingBox(); pg.computeBoundingSphere();   // the camera's blocker pass reads these
    deckPools = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({
      map: W.lampFx.material.map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      color: 0xffc178, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), W.lampSpots.length);
    deckPools.name = 'sugarfin-deckpools';
    deckPools.castShadow = false; deckPools.receiveShadow = false;
    deckPools.renderOrder = 6;
    const D = W.DECK, po = new THREE.Object3D(), white = new THREE.Color(0, 0, 0);
    for (let i = 0; i < W.lampSpots.length; i++) {
      const [lx, , lz] = W.lampSpots[i];
      // pulled inboard so the glow lands on the planks, not on the air past the rail
      po.position.set(Math.sign(lx) * (D.halfX - 1.2), D.top + 0.05, clamp(lz, D.aft + 1.7, D.fore - 1.7));
      po.scale.set(3.8, 1, 3.8);
      po.updateMatrix();
      deckPools.setMatrixAt(i, po.matrix);
      deckPools.setColorAt(i, white);
    }
    deckPools.computeBoundingSphere();
    deckPools.visible = false;
    W.deck.add(deckPools);
  }

  const DECK = W.DECK;
  const POSE = {
    wheel: { x: 0.0, y: DECK.top, z: 5.0, ry: -0.5, rx: 0 },
    chair: { x: -1.9, y: DECK.top + 0.42, z: -3.7, ry: -0.55, rx: -0.62 },
  };
  function setPose(p) { cap.group.position.set(p.x, p.y, p.z); cap.group.rotation.set(p.rx, p.ry, 0); }
  setPose(POSE.wheel);

  // ── state ──────────────────────────────────────────────────────────────────
  const S = { phase: 'idle', side: 'candy', to: null, progress: 0, asleep: false, trips: 0 };
  let pt = 0;                       // seconds inside the current phase
  let yaw = DOCKS.candy.yaw, yawTarget = yaw;
  let rampAngle = 0, rampDown = 0.1, rampOpen = 1;   // 1 = down, 0 = raised
  let gang = 1, rampBase = 0, dockGroundY = null;    // gangway side / its base yaw / pier top
  let posed = null;                                  // screenshot pose (setProgress)
  let bellSwing = 0, yawnT = 0, blinkT = 2, blinkV = 1, lidT = 1, talkT = 0;
  let spoutT = 3, snoreT = 1, wakeT = 0, sprayT = 0, wakeUpT = 0, emberT = 0.6;
  let foamT = 0, speed = 0;          // scrolling foam phase / eased "under way"
  let stow = 0, stowUp = 0, heel = 0, yawPrev = yaw;   // the stowaway cat / how she leans
  const zd = new THREE.Object3D();       // scratch matrix for the sleepy Zs
  const glowD = new THREE.Object3D();    // … and for the lamp halos / water smears
  const glowC = new THREE.Color();
  let cineOn = false, camStarted = false;
  // the three framings the trip is shot with (see the camera section below)
  const BOARD_SHOT = { ahead: -1, height: 3.0, el: 0.27, dist: 42 };
  const LAND_SHOT = { ahead: -1, height: 3.0, el: 0.32, dist: 38 };
  const foot = new THREE.Vector3();      // world position of the gangplank foot
  const landing = new THREE.Vector3();   // where the player is put down ashore
  let route = null, trip = null, gate = null;

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const p2 = new THREE.Vector2(), t2 = new THREE.Vector2();
  const path = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const segLen = [0, 0, 0, 0];
  const boardStart = new THREE.Vector3();

  const story = () => ctx.systems.story;
  const player = () => ctx.systems.player;
  const parts = () => (ctx.systems.particles?.burst ? ctx.systems.particles : null);

  // The shared UI system can fail to create (then ctx.systems.ui is a stub with
  // no say/toast/prompt); the crossing must still work, so every call is checked.
  function ui(fn, ...args) {
    const u = ctx.systems.ui;
    if (!u || typeof u[fn] !== 'function') return false;
    try { u[fn](...args); } catch (e) { return false; }
    return true;
  }

  function say(text, dur) {
    talkT = 1.2;
    ui('say', text, { speaker: 'Captain Brine', duration: dur });
    ctx.events.emit('ferry:line', { text, phase: S.phase });
  }

  // ── docking geometry ───────────────────────────────────────────────────────
  // She moors just off the end of whatever pier the architecture builders put
  // there (measured at runtime), and the player always stands on real walkable
  // ground — the gangplank bridges the rest.
  const ray = new THREE.Raycaster();
  ray.far = 46;
  const DOWN = new THREE.Vector3(0, -1, 0);
  const rayOrg = new THREE.Vector3();

  function isMine(o) {
    for (let p = o; p; p = p.parent) {
      if (p === W.group || p === W.foam || p === W.bow || p === W.wake || p === W.ropes) return true;
      if (p === gull.group || p === dolphins || p === W.lampFx) return true;
    }
    return false;
  }
  /** Highest solid surface at (x,z), ignoring water/glass and the ferry itself. */
  function surfaceY(x, z, hi = 7.6) {
    rayOrg.set(x, 26, z);
    ray.set(rayOrg, DOWN);
    let best = -Infinity;
    let hits;
    try { hits = ray.intersectObjects(scene.children, true); } catch (e) { return -Infinity; }
    for (const h of hits) {
      const o = h.object;
      if (!o.isMesh || isMine(o)) continue;
      const m = o.material;
      if (m && (m.transparent || (m.opacity !== undefined && m.opacity < 0.99))) continue;
      if (h.point.y > best && h.point.y <= hi) best = h.point.y;
    }
    return best;
  }

  /** Furthest seaward point of the pier deck on this side (probed, not assumed).
   *  Walks seaward from dry land in 0.4 u steps and stops when the deck really
   *  stops — she is 8 units wide, so a metre of slop here parks a whale on top
   *  of somebody's planking. Two lessons are baked in:
   *   · measure with standY (the registered walkable rectangles) FIRST — a
   *     raycast drops through the 0.14 u gaps between deck planks and would end
   *     the pier at the first crack it found;
   *   · tolerate a 1.4 u gap before giving up, because piers get extended,
   *     stepped and re-planked by the architecture builders while we work. */
  function pierEnd(d) {
    let end = d.shoreX, on = false, gap = 0;
    for (let k = 0; k <= 80; k++) {
      const x = d.shoreX + d.dir * k * 0.4;
      let y = standY(x, d.z);
      if (!(y > 2.2)) { const s = surfaceY(x, d.z); if (isFinite(s)) y = Math.max(y, s); }
      if (y > 2.2) { end = x; on = true; gap = 0; }
      else if (on && (gap += 0.4) > 1.4) break;
    }
    return end;
  }

  /** Highest thing the PLAYER can stand on at (x,z): terrain or a walkable deck.
   *  (surfaceY sees all geometry; this only sees what player.js will honour.) */
  function standY(x, z) {
    let best = world.height(x, z);
    const ws = ctx.walkables;
    for (let i = 0; i < ws.length; i++) {
      if (ws[i] === deckWalkable) continue;                 // never stand on ourselves
      const t = ws[i]?.test?.(x, z);
      if (typeof t === 'number' && isFinite(t) && t > best) best = t;
    }
    return best;
  }

  /** Choose the mooring spot + the shore spot the player uses.
   *  STANDOFF is measured so the foot plate lands ~0.6 u inboard of the pier's
   *  seaward edge: any further out and the plank crosses the pier's side rail /
   *  kerb on its way up, which is what made it read as ending in mid-air. */
  const STANDOFF = (DECK.halfX - 0.1) + W.rampLen - 0.6;
  /** Distance from (x,z) to the nearest solid prop anybody registered. */
  function colClear(x, z) {
    const cols = ctx.colliders || [];
    let best = 99;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const dx = x - c.x, dz = z - c.z;
      if (c.box) {
        const cs = Math.cos(-(c.rot || 0)), sn = Math.sin(-(c.rot || 0));
        const lx = Math.abs(dx * cs - dz * sn) - (c.w || 0) * 0.5;
        const lz = Math.abs(dx * sn + dz * cs) - (c.d || 0) * 0.5;
        best = Math.min(best, Math.hypot(Math.max(lx, 0), Math.max(lz, 0)));
      } else {
        best = Math.min(best, Math.hypot(dx, dz) - (c.r || 0));
      }
      if (best < -1) return best;
    }
    return best;
  }

  /** How badly is the walk-off blocked at this z? 0 = clear. Counts registered
   *  colliders AND anything standing proud of the pier deck (the candy builders'
   *  props are scenery a raycast sees and a collider list does not). */
  function footPenalty(d, z) {
    let bad = 0;
    const deck = standY(d.pierEnd - d.dir * 1.0, z);
    if (!(deck > 2.2)) return 99;                     // no pier under the plank here
    for (let k = 0; k <= 5; k++) {
      const x = d.pierEnd - d.dir * (0.2 + k * 0.9);
      const c = colClear(x, z);
      if (c < 1.0) bad += (1.0 - Math.max(c, -1.2)) * 2.2;
      const s = surfaceY(x, z);
      if (isFinite(s) && s > deck + 0.5) bad += Math.min(3, (s - deck) * 1.4);
    }
    return bad;
  }

  function planDock(id) {
    const d = DOCKS[id];
    if (d.z0 === undefined) d.z0 = d.z;
    d.z = d.z0;
    const end = pierEnd(d);
    d.pierEnd = end;
    // ── keep the walk-off CLEAR. The plank used to land its foot inside
    // whatever the candy builders had parked on the pier end; rather than
    // asking them to move, she shuffles a metre or so along the berth until the
    // first two metres ashore are empty. (A collider claim here would be worse:
    // ctx.colliders is what the PLAYER slides around, so reserving the gangway
    // foot would wall off the thing it was protecting.)
    let bestZ = d.z0, bestBad = footPenalty(d, d.z0);
    for (const dz of [0.9, -0.9, 1.7, -1.7, 2.5, -2.5]) {
      if (bestBad <= 0.05) break;
      const bad = footPenalty(d, d.z0 + dz);
      if (bad < bestBad - 0.12) { bestBad = bad; bestZ = d.z0 + dz; }
    }
    d.z = bestZ;
    d.footBad = Math.round(bestBad * 100) / 100;
    d.x = end + d.dir * STANDOFF;
    // Step ashore onto the pier deck itself (the architecture builders register
    // their decks as walkables); fall back to real terrain if there is no pier.
    d.landX = null;
    for (let k = 0; k < 14; k++) {
      const x = end - d.dir * (2.6 + k * 0.5);
      if (standY(x, d.z) > 0.5) { d.landX = x; break; }
    }
    if (d.landX === null) {
      let lx = d.shoreX;
      for (let k = 0; k < 30 && world.height(lx, d.z) <= 2.6; k++) lx -= d.dir * 0.4;
      d.landX = lx - d.dir * 0.9;
    }
  }

  function placeAtDock(id) {
    const d = DOCKS[id];
    gang = d.gang;
    rampBase = W.setGang(gang);
    W.group.position.set(d.x, WATER_Y, d.z);
    yaw = yawTarget = d.yaw;
    W.group.rotation.set(0, yaw, 0);
    S.side = id;
    dockGroundY = null;
    fitRamp();
  }

  /** Measure the pier top under the plank's foot (raycast — do it on docking,
   *  not per frame) and tilt the plank onto it. */
  function fitRamp() {
    const d = DOCKS[S.side];
    W.rampPivot.rotation.set(0, rampBase, 0);
    W.group.updateMatrixWorld(true);
    v1.set(W.rampLen, 0, 0); W.ramp.localToWorld(v1);
    let ground = surfaceY(v1.x, v1.z);
    if (!isFinite(ground) || ground < 0.4) ground = Math.max(world.height(v1.x, v1.z), 0.4);
    ground = Math.max(ground, standY(v1.x, v1.z));       // never below walkable ground
    dockGroundY = ground;
    aimRamp();
    landing.set(d.landX ?? (foot.x - d.dir * 1.6), 0, d.z);
    landing.y = Math.max(standY(landing.x, landing.z), 0.3);
  }

  /** Re-solve the plank's angle against the stored pier height. Called every
   *  frame while she is moored, so the foot stays ON the pier as she breathes. */
  function aimRamp() {
    if (dockGroundY === null) return;
    W.rampPivot.rotation.z = 0;
    W.group.updateMatrixWorld(true);
    v1.set(W.rampLen, 0, 0); W.ramp.localToWorld(v1);
    rampDown = Math.asin(clamp((v1.y - dockGroundY - 0.1) / W.rampLen, -0.42, 0.5));
    W.rampPivot.rotation.z = -rampDown;
    W.group.updateMatrixWorld(true);
    v1.set(W.rampLen, 0, 0); W.ramp.localToWorld(v1);
    foot.copy(v1);
  }

  /** Two mooring lines from her deck cleats to bollards on the pier. The
   *  bollards are built into the same mesh as the lines, so a rope always ends
   *  on something you can see it tied to (and it costs no extra draw call). */
  function tieUp() {
    if (dockGroundY === null) { W.ropes.userData.set([], []); return; }
    const d = DOCKS[S.side];
    const pairs = [], posts = [];
    for (let i = 0; i < W.cleats.length; i++) {
      v1.copy(W.cleats[i]); v1.x *= gang;
      W.deck.localToWorld(v1);
      // land the line on the pier deck, fore and aft of the gangway
      v2.set(d.pierEnd - d.dir * 1.2, dockGroundY + 0.52, d.z + (i ? 3.3 : -3.3));
      pairs.push([v1.clone(), v2.clone(), 0.45]);
      posts.push([v2.x, dockGroundY, v2.z]);
    }
    W.ropes.userData.set(pairs, posts);
  }

  // ── her deck is a real place to stand while she is moored ──────────────────
  // player.js reads ctx.walkables; the test is pure maths on her yaw + bob, so it
  // costs nothing and the deck rises and falls under your feet as she breathes.
  ctx.walkables = ctx.walkables || [];
  const deckWalkable = {
    test(x, z) {
      if (S.phase !== 'idle') return null;          // mid-trip the ferry owns the player
      const dx = x - W.group.position.x, dz = z - W.group.position.z;
      if (dx * dx + dz * dz > 175) return null;     // cheap reject: she is ~14 x 24
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const px = (dx * c - dz * s) * gang;           // world → whale local → gangway side
      const pz = dx * s + dz * c - DECK.z;          // … → deck local
      const deckY = W.group.position.y + DECK.y + DECK.top;
      if (px > -DECK.halfX + 0.3 && px < DECK.halfX - 0.3 && pz > DECK.aft + 0.3 && pz < DECK.fore - 0.4) {
        // the cabin and the ship's wheel are solid
        if (!(pz > 2.0 && pz < 4.6 && px > -1.8 && px < 1.8) && !(pz > 5.2 && px > -1.1 && px < 1.1)) return deckY;
      }
      if (rampAngle > 0.8 && Math.abs(pz - 0.6) < 0.92) {
        const t = (px - (DECK.halfX - 0.1)) / W.rampLen;
        if (t > -0.05 && t < 1.05) {
          const pivotY = deckY + 0.05;
          return lerp(pivotY, pivotY - Math.sin(rampDown) * W.rampLen, clamp(t, 0, 1));
        }
      }
      return null;
    },
  };
  ctx.walkables.push(deckWalkable);

  function rampFoot(out) { out.set(W.rampLen, 0, 0); return W.ramp.localToWorld(out); }
  function rampMid(out) { out.set(W.rampLen * 0.5, 0.24, 0); return W.ramp.localToWorld(out); }
  function deckSlot(out) { out.copy(W.deckSlot); return W.deck.localToWorld(out); }

  // ── player path helpers ────────────────────────────────────────────────────
  function samplePath(n, t, out) {
    let total = 0;
    for (let i = 0; i < n - 1; i++) { segLen[i] = path[i].distanceTo(path[i + 1]); total += segLen[i]; }
    if (total < 1e-4) return out.copy(path[0]);
    let x = t * total;
    for (let i = 0; i < n - 1; i++) {
      if (x <= segLen[i] || i === n - 2) return out.lerpVectors(path[i], path[i + 1], clamp(x / Math.max(segLen[i], 1e-4), 0, 1));
      x -= segLen[i];
    }
    return out.copy(path[n - 1]);
  }

  // Scripted motion along the boarding path. `walk: true` measures how far the
  // path moved us this frame and hands that speed to the rig (player.js
  // `scriptedWalk`), so the visitor WALKS up the gangway and down it instead of
  // being slid aboard in a standing pose. It also turns to face the way it is
  // going, and the yaw is written through `pl.facing` — player.js reassigns
  // group.rotation.y from its own visFacing every frame, so anything we only
  // wrote onto the group would be overwritten the moment we let go.
  const stickPrev = new THREE.Vector3();
  let stickWalking = false, stickYaw = null;
  function stickPlayer(pos, faceYaw, dt = 0, walk = false) {
    const pl = player(); if (!pl) return;
    let sp = 0;
    if (walk && stickWalking && dt > 0) {
      const dx = pos.x - stickPrev.x, dz = pos.z - stickPrev.z;
      sp = Math.hypot(dx, dz) / dt;
      if (sp > 0.4) faceYaw = Math.atan2(dx, dz);      // face the way you are walking
    }
    stickPrev.copy(pos); stickWalking = walk;
    pl.scriptedWalk = sp;
    pl.position.copy(pos);
    pl.velocity.set(0, 0, 0);
    if (faceYaw !== undefined) {
      if (stickYaw === null) stickYaw = pl.facing;
      let d = faceYaw - stickYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      stickYaw += d * (1 - Math.exp(-(walk ? 9 : 6) * (dt || 1 / 60)));
      pl.facing = stickYaw;                   // sets facing AND visFacing
      pl.group.rotation.y = stickYaw;
    }
  }
  function releaseStick() { stickWalking = false; stickYaw = null; const pl = player(); if (pl) pl.scriptedWalk = 0; }

  // ── camera ─────────────────────────────────────────────────────────────────
  // Two mechanisms, on purpose:
  //  · departure + the hand-back ashore use ctx.systems.camera.cinematic(), which
  //    eases out of / back into the follow camera for us (no cuts);
  //  · the 20-second moving crossing drives the free camera every frame, because
  //    cinematic() is a one-shot ease-in/hold/ease-out and cannot track a whale.
  // Both share `shotSpec` so the hand-overs between them are frame-continuous.
  const _spec = { target: [0, 0, 0], azimuth: 0, elevation: 0.27, distance: 42, fov: 34 };
  function shotSpec(framing) {
    const wp = W.group.position;
    const hx = Math.sin(yaw), hz = Math.cos(yaw);
    // broadside: perpendicular to her heading, kept on the +Z side of the route
    let dx = -hz, dz = hx;
    if (dz < 0) { dx = hz; dz = -hx; }
    const wobble = Math.sin(ctx.state.elapsed * 0.13) * 0.16;
    _spec.target[0] = wp.x + hx * framing.ahead;
    _spec.target[1] = WATER_Y + framing.height;
    _spec.target[2] = wp.z + hz * framing.ahead;
    _spec.azimuth = Math.atan2(dx, dz) + wobble;
    _spec.elevation = framing.el;
    _spec.distance = framing.dist;
    return _spec;
  }
  /** Free camera, re-aimed every frame — for the crossing itself. */
  function freeShot(framing) {
    const cam = ctx.systems.camera; if (!cam) return;
    cam.setFree(shotSpec(framing));
    cineOn = true;
  }
  /** Departure: ease OUT of the follow camera into a shot that tracks her. */
  function departureShot(framing, dur) {
    const cam = ctx.systems.camera;
    if (!cam?.cinematic) { freeShot(framing); return; }
    const s = shotSpec(framing);
    cam.cinematic({
      target: () => shotSpec(framing).target,
      azimuth: s.azimuth, elevation: s.elevation, distance: s.distance, fov: 34,
      duration: dur, in: 0.7, hold: dur, out: 0,
    });
    cineOn = true;
  }
  /** Arrival: hold the last framing, then ease back to the visitor. No cut. */
  function handBackCamera(framing) {
    const cam = ctx.systems.camera;
    cineOn = false;
    if (!cam) return;
    const s = framing ? shotSpec(framing) : null;
    cam.setFree(null);
    cam.snap?.();                      // follow target → the visitor, cine cleared
    if (!s || !cam.cinematic) return;
    cam.cinematic({
      target: [s.target[0], s.target[1], s.target[2]],
      azimuth: s.azimuth, elevation: s.elevation, distance: s.distance, fov: 34,
      duration: 1.25, in: 0, hold: 0.15, out: 1.1,
    });
  }
  function releaseCamera() {
    if (!cineOn) return;
    cineOn = false;
    const cam = ctx.systems.camera; if (!cam) return;
    cam.setFree(null);
    cam.snap?.();
  }

  // ── story gating ───────────────────────────────────────────────────────────
  function computeAsleep() {
    const st = story();
    if (!st) return false;
    return S.side === 'cat' && !!st.get('arrived_cat') && !st.get('honorary_citizen');
  }
  function refreshGate() {
    S.asleep = computeAsleep();
    if (!gate) return;
    gate.enabled = S.phase === 'idle';
    gate.label = S.asleep
      ? 'The Sugarfin Express is fast asleep'
      : (S.side === 'cat' ? 'Sail back to the Candy Kingdom' : 'Board the Sugarfin Express');
  }

  // ── boarding / crossing ────────────────────────────────────────────────────
  function requestDeparture(to, opts = {}) {
    if (S.phase !== 'idle') return false;
    if (!DOCKS[to] || to === S.side) return false;
    if (computeAsleep() && !opts.force) {
      const r = rng(hash('brine-break') + S.trips * 31);
      say(r.pick(LINES.asleep));
      snoreBurst(); snoreBurst();
      return false;
    }
    S.to = to;
    S.trips++;
    route = makeRoute(S.side, to);
    const r = rng(hash('sugarfin-trip') + S.trips * 977);
    trip = {
      rng: r,
      dolphinsAt: r.range(0.16, 0.26),
      gullAt: r.range(0.40, 0.52),
      lineAt: r.range(0.62, 0.74),
      line: to === 'cat' ? LINES.mid[0] : r.pick(LINES.mid),
      done: { dolphins: false, gull: false, line: false, near: false, stow: false, flip: false },
    };
    const pl = player();
    if (pl) {
      boardStart.copy(pl.position);
      pl.locked = true; pl.onFerry = true; pl.velocity.set(0, 0, 0);
      releaseStick();                          // fresh walk, no stale path delta
    }
    ctx.state.ferry = { to, progress: 0 };
    posed = null;
    W.ropes.userData.set([]);                 // cast off
    ui('prompt', null);
    if (gate) gate.enabled = false;
    setPhase('board');
    say(to === 'cat' ? LINES.boardCat[0] : LINES.boardCandy[0], 3.4);
    return true;
  }

  function setPhase(name) { S.phase = name; pt = 0; camStarted = false; }

  // ── screenshot pose ────────────────────────────────────────────────────────
  // Views cannot start a 21-second crossing and then hold still for a frame, so
  // this parks her ON the route with her escort and her wake running, without
  // touching the phase machine or the camera. `setProgress(null)` undoes it.
  function applyPose() {
    posed.route.point(posed.t, p2);
    W.group.position.x = p2.x; W.group.position.z = p2.y;
    posed.route.tangent(posed.t, t2);
    yaw = yawTarget = Math.atan2(t2.x, t2.y);
    W.group.rotation.y = yaw;
  }
  function setProgress(p) {
    if (p === null || p === undefined) {
      posed = null;
      placeAtDock(S.side); rampOpen = 1; rampAngle = 1; tieUp();
      dolphins.visible = false; gullLeave();
      return true;
    }
    const to = S.side === 'candy' ? 'cat' : 'candy';
    posed = { t: clamp(p, 0, 1), route: makeRoute(S.side, to) };
    rampOpen = 0; rampAngle = 0;
    W.ropes.userData.set([]);
    dolphins.visible = true;
    gullArrive(); gullState.mode = 'perch'; gullState.t = 0;
    applyPose();
    return true;
  }

  /** Screenshot/debug: berth her at a named pier, moored and open for boarding.
   *  Views need this because both piers stand a couple of units OFF their
   *  island's mask, so `teleport` near them reports island `null` and the
   *  shot-mode auto-berth never fires — which is how a view of the Arrivals
   *  Pier ends up being a view of empty water. */
  function moor(id) {
    if (!DOCKS[id] || S.phase !== 'idle') return false;
    posed = null;
    placeAtDock(id);
    rampOpen = 1; rampAngle = 1;
    W.rampPivot.rotation.z = -rampDown;
    dolphins.visible = false;
    gullState.mode = 'off'; gull.group.visible = false;
    tieUp();
    refreshGate();
    return true;
  }

  function ringBell() {
    bellSwing = 1;
    ctx.systems.camera?.shake?.(0.16, 0.35);
    const p = parts();
    if (p) {
      W.bell.getWorldPosition(v1);
      p.burst({ x: v1.x, y: v1.y, z: v1.z, count: 14, color: [0xffe9a8, 0xfff6df, 0xffc84a], speed: 2.6, life: 0.75, size: 0.2, gravity: -3.5, spread: 0.5 });
    }
  }
  function spout() {
    const p = parts(); if (!p) return;
    v1.copy(W.spoutBase); W.group.localToWorld(v1);
    p.burst({ x: v1.x, y: v1.y + 0.4, z: v1.z, count: 26, color: [0xffffff, 0xdff4ff, 0xbfe6ff], speed: 6.5, life: 1.25, size: 0.34, gravity: -7, spread: 0.7 });
  }
  function snoreBurst() {
    const p = parts(); if (!p) return;
    v1.copy(W.spoutBase); W.group.localToWorld(v1);
    p.burst({ x: v1.x, y: v1.y + 0.5, z: v1.z, count: 4, color: [0xffffff, 0xe9e2ff], speed: 0.8, life: 2.6, size: 0.55, gravity: 0.55, spread: 0.7 });
  }
  /** A dolphin breaking the surface — bigger on the way back in than on the way
   *  out, so entry and exit read differently. */
  function splash(x, z, k = 1) {
    const p = parts(); if (!p) return;
    p.burst({
      x, y: 0.12, z, count: Math.round(9 * k), color: [0xffffff, 0xe8f9ff, 0xcdefff],
      speed: 2.6 * k, up: 0.7, life: 0.62, size: 0.26 * k, sizeEnd: 0.04, gravity: -8, spread: 0.9,
    });
  }

  // ── seagull ────────────────────────────────────────────────────────────────
  const gullState = { mode: 'off', t: 0 };
  function gullArrive() { gullState.mode = 'in'; gullState.t = 0; gull.group.visible = true; }
  function gullLeave() { if (gullState.mode === 'off') return; gullState.mode = 'out'; gullState.t = 0; }
  function updateGull(dt) {
    if (gullState.mode === 'off') return;
    gullState.t += dt;
    v1.copy(W.hornTip); W.group.localToWorld(v1);
    const g = gull.group;
    if (gullState.mode === 'in') {
      const k = clamp(gullState.t / 3.4, 0, 1);
      const e = smoothstep(0, 1, k);
      const hx = Math.sin(yaw), hz = Math.cos(yaw);
      g.position.set(
        lerp(v1.x + hx * 26 - hz * 10, v1.x, e),
        lerp(v1.y + 13, v1.y + 0.34, e * e),
        lerp(v1.z + hz * 26 + hx * 10, v1.z, e),
      );
      g.rotation.y = Math.atan2(v1.x - g.position.x, v1.z - g.position.z);
      g.rotation.z = Math.sin(gullState.t * 6) * 0.12 * (1 - e);
      gull.wings.userData.flap(Math.sin(gullState.t * 13) * (0.9 - 0.5 * e) + 0.2);
      if (k >= 1) { gullState.mode = 'perch'; gullState.t = 0; }
    } else if (gullState.mode === 'perch') {
      g.position.set(v1.x, v1.y + 0.34 + Math.sin(ctx.state.elapsed * 1.7) * 0.03, v1.z);
      g.rotation.y = yaw + Math.PI + Math.sin(gullState.t * 0.5) * 0.5;
      g.rotation.z = 0;
      gull.wings.userData.flap(Math.max(0, Math.sin(gullState.t * 1.3) - 0.94) * 9);
    } else {
      const k = clamp(gullState.t / 2.6, 0, 1);
      g.position.y += dt * 4.2;
      g.position.x += Math.sin(g.rotation.y) * dt * 7;
      g.position.z += Math.cos(g.rotation.y) * dt * 7;
      gull.wings.userData.flap(Math.sin(gullState.t * 15) * 1.0);
      if (k >= 1) { gullState.mode = 'off'; g.visible = false; }
    }
  }

  // ── idle life ──────────────────────────────────────────────────────────────
  function animateIdle(dt, moving) {
    const e = ctx.state.elapsed;
    const amp = moving ? 0.24 : 0.13;
    const bob = Math.sin(e * 0.62) * amp + Math.sin(e * 1.07 + 1.3) * amp * 0.35;
    W.group.position.y = WATER_Y + bob + (S.asleep ? -0.12 : 0);
    // she rolls and pitches like something floating in a swell, not like a prop,
    // and leans into the turn while she is under way
    W.group.rotation.x = Math.sin(e * 0.55 + 0.7) * (moving ? 0.05 : 0.028) + (moving ? -0.012 : 0);
    W.group.rotation.z = Math.sin(e * 0.43) * (moving ? 0.075 : 0.042) + Math.sin(e * 0.71 + 2.1) * 0.016 + heel;

    // ── the stowaway in the aft crate ──
    if (stow > 0 || stowUp > 0) {
      stowUp = damp(stowUp, stow, 3.4, dt);
      W.stowaway.visible = stowUp > 0.02;
      const k = smoothstep(0, 1, stowUp);
      W.stowaway.position.y = DECK.top + lerp(-0.22, 0.52, k) + Math.sin(e * 2.2) * 0.02 * k;
      W.stowaway.rotation.y = 0.3 + Math.sin(e * 0.9) * 0.7 * k;
      if (stow > 0) { stow -= dt * 0.12; if (stow < 0) stow = 0; }
      if (stowUp < 0.02 && stow === 0) { stowUp = 0; W.stowaway.visible = false; }
    }

    // tail: slow sway, harder when swimming
    const rate = moving ? 1.15 : 0.52;
    W.tail.rotation.y = Math.sin(e * rate) * (moving ? 0.42 : 0.2);
    W.tail.rotation.x = Math.sin(e * rate + 1.0) * (moving ? 0.16 : 0.07);

    // breathing
    const br = Math.sin(e * (S.asleep ? 0.55 : 0.85));
    W.hull.scale.set(1 + br * 0.006, 1 + br * 0.011, 1);

    // rope creak — the deck rocks a hair against her back
    W.deck.rotation.z = Math.sin(e * 0.47 + 0.4) * (moving ? 0.016 : 0.009);
    W.deck.rotation.x = Math.sin(e * 0.61) * 0.006;

    // lanterns swing, bell sways
    for (let i = 0; i < W.lampPivots.length; i++) {
      W.lampPivots[i].rotation.z = Math.sin(e * 1.25 + i * 1.9) * (moving ? 0.16 : 0.07);
      W.lampPivots[i].rotation.x = Math.sin(e * 1.05 + i) * (moving ? 0.1 : 0.04);
    }
    bellSwing = damp(bellSwing, 0, 2.2, dt);
    W.bellPivot.rotation.z = Math.sin(e * 9) * bellSwing * 0.5 + Math.sin(e * 0.9) * 0.03;

    // eyes: sleepy lids, blinks, yawns
    let lidTarget = S.asleep ? 0.02 : 0.86;
    let eyeSquash = S.asleep ? 0.22 : 1;
    if (!S.asleep) {
      blinkT -= dt;
      if (blinkT <= 0) { blinkT = 2.6 + Math.random() * 3.6; blinkV = 0; }
      blinkV = damp(blinkV, 1, 9, dt);
      eyeSquash = lerp(0.1, 1, smoothstep(0, 0.55, blinkV));
      if (blinkV < 0.55) lidTarget = 0.08;
      if (yawnT > 0) { eyeSquash = Math.min(eyeSquash, 0.35); lidTarget = Math.min(lidTarget, 0.3); }
    }
    lidT = damp(lidT, lidTarget, 10, dt);
    W.eyes.scale.y = damp(W.eyes.scale.y, eyeSquash * 0.88, 14, dt);
    W.lids.position.y = W.eyeY + lerp(-0.1, 1.02, lidT);
    W.lids.visible = lidT < 0.62;

    // yawn
    if (yawnT > 0) {
      yawnT -= dt;
      const k = clamp(1 - yawnT / 1.6, 0, 1);
      const open = Math.sin(Math.PI * Math.pow(k, 0.75));
      W.mouth.visible = true;
      W.mouth.scale.set(0.8 + open * 0.3, 0.1 + open * 1.15, 0.85 + open * 0.3);
      if (yawnT <= 0) W.mouth.visible = false;
    }

    // captain
    talkT = Math.max(0, talkT - dt);
    const onBreak = S.asleep && S.phase === 'idle';
    setPose(onBreak ? POSE.chair : POSE.wheel);
    if (onBreak) {
      cap.head.rotation.x = 0.25 + Math.sin(e * 0.8) * 0.05;
      cap.head.rotation.y = Math.sin(e * 0.3) * 0.1;
      cap.group.position.y += Math.sin(e * 0.8) * 0.02;
    } else {
      cap.group.position.y += Math.sin(e * 1.6) * 0.015;
      cap.head.rotation.x = talkT > 0 ? Math.sin(e * 17) * 0.16 : Math.sin(e * 1.1) * 0.05;
      cap.head.rotation.y = talkT > 0 ? Math.sin(e * 5) * 0.12 : Math.sin(e * 0.42) * 0.34;
    }

    // ── where she meets the sea ───────────────────────────────────────────────
    // A collar, a bow moustache and a wake ribbon, all riding flat on the water
    // (never tilted by her roll). Everything here SCROLLS: a foam collar with a
    // fixed sculpted edge is a sock, and a wake that never spreads is a decal.
    speed = damp(speed, moving ? 1 : 0, 1.9, dt);
    W.foam.position.set(W.group.position.x, 0.02, W.group.position.z);
    W.foam.rotation.y = yaw;
    W.foam.scale.set(1 + Math.sin(e * 0.9) * 0.012, 1, 1 + speed * 0.06);
    W.foam.material.opacity = 0.44 + speed * 0.34 + Math.sin(e * 0.7) * 0.05;
    // the collar's foam runs aft along her waterline (u wraps, so it never seams)
    foamT += dt * (0.052 + speed * 0.12);
    if (foamT > 1) foamT -= 1;
    // …only along U. Scrolling V would wrap the band's transparent outer edge
    // round to its opaque inner one and stamp a hard white rim on the sea.
    W.foam.material.map.offset.x = -foamT;

    // ── the bow moustache: only there when she is actually pushing water ──
    W.bow.visible = speed > 0.04;
    if (W.bow.visible) {
      W.bow.position.set(W.group.position.x, 0.03, W.group.position.z);
      W.bow.rotation.y = yaw;
      const s = 0.55 + speed * 0.6;
      W.bow.scale.set(s, 1, 0.7 + speed * 0.5);
      W.bow.material.opacity = speed * 0.95;
      W.bow.material.map.offset.x = -foamT * 2.2;
    }

    wakeT += dt * (0.22 + speed * 0.95);
    if (wakeT > 1) wakeT -= 1;
    // 0.9, not 0.3: the sea's own shader lifts its crests most of a unit and a
    // ribbon laid on nominal sea level is simply depth-tested away behind them.
    W.wake.position.set(W.group.position.x, 0.9, W.group.position.z);
    W.wake.rotation.y = yaw;
    W.wake.material.map.offset.y = -wakeT;
    W.wake.material.opacity = damp(W.wake.material.opacity, speed, 2.4, dt);
    W.wake.visible = W.wake.material.opacity > 0.02;      // no wake behind a moored whale

    // ── night lanterns ──
    // r170 is physically based: PointLight intensity is candela with 1/d² decay,
    // so 60 cd over a 10 u range lights the deck and the water under the lamp.
    // The shades stay at emissive ~0.9: at 2.4 ACES clipped them to flat white
    // discs with no lantern left inside them.
    const night = 1 - clamp(ctx.state.daylight ?? 1, 0, 1);
    const flick = 0.94 + 0.06 * Math.sin(e * 5.3) * Math.sin(e * 1.7 + 1.1);
    // A dull brass box by day, a lit paper lantern after dusk — the whole
    // lantern warms (cage and all), which is why it is one mesh now.
    for (let i = 0; i < W.lanterns.length; i++) {
      W.lanterns[i].material.emissiveIntensity = 0.05 + night * 1.15 * (i ? 2 - flick : flick);
    }
    W.horn.material.emissiveIntensity = night * 0.5;   // her horn is a night-light
    for (let i = 0; i < W.lights.length; i++) {
      W.lights[i].intensity = night * 60 * (i ? 2 - flick : flick);
      W.lights[i].visible = night > 0.03;
    }
    // ── and their light lands somewhere ──
    // One InstancedMesh: a halo around each lantern (billboarded) and its smear
    // on the water (a radial glow stretched long, so it has no disc rim).
    W.lampFx.visible = night > 0.04;
    if (W.lampFx.visible) {
      const cam = ctx.camera.position;
      for (let i = 0; i < W.lampPivots.length; i++) {
        W.lampPivots[i].getWorldPosition(v1);
        const k = MOBILE ? night * (i ? 2 - flick : flick) * LAMPFX_GAIN : night * (i ? 2 - flick : flick);
        const ang = Math.atan2(v1.x - cam.x, v1.z - cam.z);
        // halo, facing the lens
        glowD.position.copy(v1); glowD.position.y -= 0.55;
        glowD.rotation.set(0, ang, 0);
        glowD.scale.setScalar(3.0 + Math.sin(e * 1.9 + i) * 0.12);
        glowD.updateMatrix();
        W.lampFx.setMatrixAt(i, glowD.matrix);
        glowC.setRGB(k * 0.85, k * 0.85, k * 0.85);
        W.lampFx.setColorAt(i, glowC);
        // its smear on the water, running away from the lens
        const h = Math.max(1.2, v1.y);
        glowD.position.set(v1.x, 0.42, v1.z);
        glowD.rotation.set(-Math.PI / 2, ang, 0, 'YXZ');
        glowD.scale.set(3.4, 5.6 + h * 1.1, 1);
        glowD.updateMatrix();
        W.lampFx.setMatrixAt(2 + i, glowD.matrix);
        glowC.setRGB(k * 0.72, k * 0.72, k * 0.72);
        W.lampFx.setColorAt(2 + i, glowC);
      }
      W.lampFx.instanceMatrix.needsUpdate = true;
      if (W.lampFx.instanceColor) W.lampFx.instanceColor.needsUpdate = true;
    }
    if (deckPools) {
      deckPools.visible = night > 0.04;
      if (deckPools.visible) {
        for (let i = 0; i < W.lampSpots.length; i++) {
          const k = night * (i ? 2 - flick : flick) * POOL_GAIN;
          glowC.setRGB(k, k, k);
          deckPools.setColorAt(i, glowC);
        }
        deckPools.instanceColor.needsUpdate = true;
      }
    }
    // a warm ember drifts off each lamp every so often
    if (night > 0.35) {
      emberT -= dt;
      if (emberT <= 0) {
        emberT = 0.55 + Math.random() * 0.7;
        const p = parts();
        if (p) {
          const lp = W.lampPivots[(Math.random() * W.lampPivots.length) | 0];
          lp.getWorldPosition(v1);
          p.burst({
            x: v1.x, y: v1.y - 0.6, z: v1.z, count: 2, color: [0xffd79a, 0xffb45e], blend: 'add',
            shape: 'sparkle', speed: 0.35, up: 0.6, life: 1.5, size: 0.3, sizeEnd: 0.02, gravity: 0.25, spread: 0.4,
          });
        }
      }
    }

    // ── sleeping "Zzz" ──
    if (S.asleep) {
      W.zzz.visible = true;
      for (let i = 0; i < 3; i++) {
        const u = ((e * 0.26 + i * 0.333) % 1 + 1) % 1;
        const sc = Math.sin(Math.PI * u) * (0.62 + i * 0.26);
        zd.position.set(0.5 + u * 2.4 + Math.sin(u * 6 + i) * 0.3, u * 4.1, -0.2 + i * 0.25);
        zd.rotation.set(0, 0, 0.18 + Math.sin(u * 3 + i) * 0.16);
        zd.scale.setScalar(Math.max(0.001, sc));
        zd.updateMatrix();
        W.zzz.setMatrixAt(i, zd.matrix);
      }
      W.zzz.instanceMatrix.needsUpdate = true;
    } else if (W.zzz.visible) W.zzz.visible = false;

    // spouts / snores
    if (S.asleep) {
      snoreT -= dt;
      if (snoreT <= 0) { snoreT = 2.4 + Math.random() * 1.2; snoreBurst(); }
    } else {
      spoutT -= dt;
      if (spoutT <= 0) { spoutT = moving ? 5.5 + Math.random() * 3 : 7 + Math.random() * 5; spout(); }
    }
  }

  /** rampAngle 1 = deployed ashore, 0 = swung inboard and stowed along the rail.
   *  The gate swings with it, so the rail is never open over open water. */
  function setRamp(dt) {
    rampAngle = damp(rampAngle, rampOpen, 4.5, dt);
    const k = smoothstep(0, 1, rampAngle);
    if (k > 0.995 && S.phase === 'idle') aimRamp();        // stay glued to the pier as she bobs
    W.rampPivot.rotation.z = lerp(0.12, -rampDown, k);
    W.rampPivot.rotation.y = rampBase + lerp(-Math.PI / 2, 0, k);
    W.rampPivot.position.y = lerp(DECK.top + 1.32, DECK.top + 0.05, k);
    W.rampPivot.position.x = gang * lerp(DECK.halfX - 0.55, DECK.halfX - 0.1, k);
    W.gatePivot.rotation.y = (gang > 0 ? 0 : Math.PI) - 1.45 * k;
    W.ropes.visible = k > 0.55 && S.phase === 'idle' && (W.ropes.geometry.attributes.position?.count || 0) > 2;
    // the BOARD HERE flag only exists while there is somewhere to board from —
    // stowed, it would be a signpost lying on its side in the middle of the sea
    W.flag.visible = k > 0.6;
    W.flag.rotation.z = rampDown + Math.sin(ctx.state.elapsed * 1.1) * 0.03 * k;
  }

  // ── self-check ─────────────────────────────────────────────────────────────
  // The renders here run on SwiftShader; the game runs on ANGLE/Metal. The
  // failures that only bite a real driver are the ones you cannot see in a
  // screenshot: a geometry with no positions, a NaN in a matrix, a texture that
  // never uploaded, a shader that did not link, a mesh mirrored by a negative
  // scale (backfaces out). This walks everything the ferry owns, once, and says
  // so out loud.
  let checked = 0;
  function selfCheck() {
    const bad = [];
    const seen = new Set();
    let tris = 0;
    const roots = [W.group, W.foam, W.bow, W.wake, W.ropes, dolphins, gull.group, W.lampFx];
    for (const root of roots) {
      if (!root) continue;
      root.updateMatrixWorld(true);
      root.traverse((n) => {
        if (!n.isMesh || seen.has(n)) return;
        seen.add(n);
        const g = n.geometry;
        const p = g && g.attributes && g.attributes.position;
        if (!p || !p.count) { bad.push(`${n.name || n.type}: no positions`); return; }
        const arr = p.array;
        for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) { bad.push(`${n.name || n.type}: NaN vertex`); break; }
        const e = n.matrixWorld.elements;
        for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) { bad.push(`${n.name || n.type}: NaN transform`); break; }
        if (n.scale.x * n.scale.y * n.scale.z < 0) bad.push(`${n.name || n.type}: mirrored scale (backfaces out)`);
        tris += ((g.index ? g.index.count : p.count) / 3) * (n.isInstancedMesh ? n.count : 1);
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const m of mats) {
          if (!m) { bad.push(`${n.name || n.type}: no material`); continue; }
          for (const k of ['map', 'emissiveMap', 'alphaMap']) {
            const t = m[k];
            if (t && !(t.image && (t.image.width | 0) > 0 && (t.image.height | 0) > 0)) bad.push(`${n.name || n.type}: ${k} never uploaded`);
          }
          if (m.vertexColors && !(g.attributes.color && g.attributes.color.count === p.count)) bad.push(`${n.name || n.type}: vertexColors without colours`);
        }
      });
    }
    let broken = 0;
    for (const pr of ctx.renderer?.info?.programs || []) if (pr && pr.diagnostics && pr.diagnostics.runnable === false) broken++;
    if (broken) bad.push(`${broken} shader program(s) failed to link (engine-wide)`);
    S.check = bad.length ? bad.join(' · ') : `ok · ${seen.size} meshes · ${Math.round(tris / 100) / 10}k tris`;
    if (bad.length) console.error('[ferry] material error —', bad.join(' · '));
    else {
      let drawn = 0;
      for (const n of seen) { let v = true; for (let p = n; p; p = p.parent) if (!p.visible) { v = false; break; } if (v) drawn++; }
      console.warn(`[ferry] ok · ${seen.size} meshes (${drawn} drawn) · ${Math.round(tris / 100) / 10}k tris · docked ${S.side}`
        + ` · gangway foot: candy ${DOCKS.candy.footBad ?? '?'} @z${(DOCKS.candy.z ?? 0).toFixed(1)}`
        + ` · cat ${DOCKS.cat.footBad ?? '?'} @z${(DOCKS.cat.z ?? 0).toFixed(1)}`);
    }
  }

  // ── update ─────────────────────────────────────────────────────────────────
  function update(dt, ctx) {
    if (ctx.state.paused) return;
    if (checked < 4) { checked++; if (checked === 4) { try { selfCheck(); } catch (e) { console.error('[ferry] selfcheck failed', e); } } }
    pt += dt;
    const pl = player();
    const moving = S.phase === 'cross' || !!posed;

    if (S.phase === 'board') {
      const k = clamp(pt / T.board, 0, 1);
      rampOpen = k > 0.74 ? 0 : 1;
      if (k > 0.5 && bellSwing < 0.2 && pt - dt <= T.board * 0.5) ringBell();
      if (pl) {
        path[0].copy(boardStart);
        // if they hailed her from the gangplank itself, don't walk them backwards
        rampFoot(v2);
        path[1].copy(boardStart.distanceTo(landing) <= boardStart.distanceTo(v2) ? landing : boardStart);
        rampFoot(path[2]); path[2].y += 0.12;
        rampMid(path[3]);
        deckSlot(path[4]);
        samplePath(5, smoothstep(0, 1, Math.min(1, k / 0.82)), v3);
        stickPlayer(v3, yaw + Math.PI * 0.5, dt, true);
      }
      // one cinematic shot, started once — it eases out of the follow camera
      if (!camStarted && k > 0.1) { camStarted = true; departureShot(BOARD_SHOT, T.board + 0.9); }
      if (pt >= T.board) {
        setPhase('cross');
        yawnT = 1.6;
        ctx.events.emit('ferry:board', { to: S.to });
        ui('toast', 'Departing for ' + DOCKS[S.to].island + '…');
      }
    } else if (S.phase === 'cross') {
      const u = clamp(pt / T.cross, 0, 1);
      const p = u * u * u * (u * (u * 6 - 15) + 10);   // smootherstep
      S.progress = p;
      route.point(p, p2);
      W.group.position.x = p2.x; W.group.position.z = p2.y;
      if (ctx.state.ferry) ctx.state.ferry.progress = p;
      if (p <= 0.035) yawTarget = DOCKS[S.side].yaw;
      else if (p >= 0.955) yawTarget = DOCKS[S.to].yaw;
      else { route.tangent(p, t2); yawTarget = Math.atan2(t2.x, t2.y); }
      // bow spray
      sprayT -= dt;
      if (sprayT <= 0 && p > 0.08 && p < 0.94) {
        sprayT = 0.12;
        v1.copy(W.noseTip); W.group.localToWorld(v1);
        parts()?.burst({ x: v1.x, y: 0.35, z: v1.z, count: 3, color: [0xffffff, 0xd7f0ff], speed: 2.6, life: 0.55, size: 0.24, gravity: -8, spread: 1.6 });
      }
      // scheduled company
      const d = trip.done;
      if (!d.dolphins && p > trip.dolphinsAt) { d.dolphins = true; dolphins.visible = true; ui('toast', 'A pod of gummy dolphins joins the crossing!'); ctx.events.emit('ferry:sight', { what: 'dolphins' }); }
      if (!d.stow && p > 0.34) {
        d.stow = true; stow = 1;
        ui('toast', 'A cat climbs out of the aft crate and stares at you.');
        say(LINES.stowaway[S.trips % LINES.stowaway.length], 3.6);
        ctx.events.emit('ferry:sight', { what: 'stowaway' });
      }
      if (!d.flip && p > 0.5) {
        d.flip = true;
        dolphins.userData.flip(ctx.state.elapsed);
        ctx.systems.camera?.shake?.(0.06, 0.25);
        ctx.events.emit('ferry:sight', { what: 'dolphin-flip' });
      }
      if (!d.gull && p > trip.gullAt) { d.gull = true; gullArrive(); ctx.events.emit('ferry:sight', { what: 'gull' }); }
      if (!d.line && p > trip.lineAt) { d.line = true; say(trip.line, 3.2); }
      if (!d.near && p > 0.9) { d.near = true; say(S.to === 'cat' ? LINES.arriveCat[0] : LINES.arriveCandy[0], 3.4); }
      if (dolphins.visible && p > 0.86) dolphins.visible = false;
      if (pl) { deckSlot(v3); stickPlayer(v3, yaw, dt); }
      // the free camera takes over from the departure shot: ease the framing out
      // from where that shot left it so the hand-over has no cut in it
      const h = smoothstep(0, 1, clamp(pt / 2.8, 0, 1));
      freeShot({
        ahead: lerp(BOARD_SHOT.ahead, 1.5, h),
        height: lerp(BOARD_SHOT.height, 3.2, h),
        el: lerp(BOARD_SHOT.el, 0.235 + Math.sin(pt * 0.09) * 0.045, h),
        dist: lerp(BOARD_SHOT.dist, 58 + Math.sin(pt * 0.13) * 8, h),
      });
      if (pt >= T.cross) { setPhase('moor'); rampOpen = 0; gullLeave(); }
    } else if (S.phase === 'moor') {
      const d = DOCKS[S.to];
      W.group.position.x = damp(W.group.position.x, d.x, 2.6, dt);
      W.group.position.z = damp(W.group.position.z, d.z, 2.6, dt);
      yawTarget = d.yaw;
      if (pt > 0.35 && rampOpen === 0) {
        S.side = S.to;
        gang = DOCKS[S.side].gang;              // the pier is to port at one end,
        rampBase = W.setGang(gang);             // to starboard at the other
        dockGroundY = null;
        fitRamp();
        tieUp();
        rampOpen = 1;
        ringBell();
      }
      if (pl) { deckSlot(v3); stickPlayer(v3, yaw + Math.PI * 0.5, dt); }
      freeShot({ ahead: -1, height: 3.0, el: 0.3, dist: lerp(48, 40, clamp(pt / T.moor, 0, 1)) });
      if (pt >= T.moor) { W.group.position.x = d.x; W.group.position.z = d.z; fitRamp(); setPhase('land'); }
    } else if (S.phase === 'land') {
      const k = clamp(pt / T.land, 0, 1);
      if (pl) {
        deckSlot(path[0]);
        rampMid(path[1]);
        rampFoot(path[2]); path[2].y += 0.12;
        path[3].copy(landing);
        path[4].copy(landing);
        samplePath(5, smoothstep(0, 1, k), v3);
        stickPlayer(v3, yaw + Math.PI * 0.5, dt, true);
      }
      freeShot(LAND_SHOT);
      if (pt >= T.land) {
        const to = S.to;
        S.side = to; S.to = null; S.progress = 0;
        ctx.state.ferry = null;
        if (pl) {
          pl.locked = false; pl.onFerry = false;
          pl.teleport(landing.x, landing.z);
        }
        releaseStick();
        handBackCamera(LAND_SHOT);
        if (to === 'cat') story()?.set('arrived_cat', true);
        refreshGate();
        ctx.events.emit('ferry:arrive', { to });
        ui('toast', 'The Sugarfin Express has docked at ' + DOCKS[to].pier + '.');
        setPhase('idle');
      }
    } else {
      // idle at a pier (or posed mid-route for a screenshot)
      if (ctx.state.ferry) ctx.state.ferry = null;
      if (cineOn) releaseCamera();          // never leave the camera locked off
      if (posed) applyPose();

      if (wakeUpT > 0) {
        wakeUpT -= dt;
        if (wakeUpT <= 0) refreshGate();
      }
      if (gate && gate.enabled !== true) refreshGate();
    }

    // heading, always damped — she is a whale, she turns like one
    let dy = yawTarget - yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    yaw += dy * (1 - Math.exp(-1.25 * dt));
    W.group.rotation.y = yaw;
    // she leans into her own turn — the only thing that makes a 24 u whale feel
    // like she has mass when she is crossing a flat blue plane
    const yawRate = (yaw - yawPrev) / Math.max(dt, 1e-4);
    yawPrev = yaw;
    heel = damp(heel, clamp(yawRate * 0.5, -0.1, 0.1) * (moving ? 1 : 0.35), 2.6, dt);

    setRamp(dt);
    animateIdle(dt, moving);
    updateGull(dt);
    if (dolphins.visible) {
      const hx = Math.sin(yaw), hz = Math.cos(yaw);
      dolphins.userData.place(W.group.position.x, W.group.position.z, hx, hz, ctx.state.elapsed, splash);
    }
    W.group.updateMatrixWorld(true);
  }

  // ── wiring ─────────────────────────────────────────────────────────────────
  placeAtDock('candy');
  rampAngle = 1;
  W.rampPivot.rotation.z = -rampDown;

  ctx.events.on('world:ready', () => {
   try {
    // measure the piers the architecture builders actually put down, then moor
    // just off the end of ours.
    planDock('candy'); planDock('cat');
    placeAtDock(S.side);
    rampAngle = 1;
    W.rampPivot.rotation.z = -rampDown;
    tieUp();
    gate = ctx.systems.interaction?.register({
      id: 'ferry_gangway',
      x: landing.x, z: landing.z, r: 3.6,
      label: 'Board the Sugarfin Express',
      getPos: () => landing,
      onInteract: () => requestDeparture(S.side === 'candy' ? 'cat' : 'candy'),
    }) || null;
    refreshGate();
    // debug: ?ferry=cat|candy docks her on that side; ?ferry=<0..1> drops you
    // mid-crossing (handy for screenshots of the sea leg).
    const q = ctx.params?.get('ferry');
    // In screenshot mode she moors at whichever island the shot was set up on:
    // one whale, two piers, and a tour that renders both arrivals sees her.
    if (ctx.shot) ctx.events.on('player:teleport', (p) => {
      if (S.phase !== 'idle') return;
      const isl = world.islandAt(p.x, p.z);
      if (isl !== 'candy' && isl !== 'cat') return;
      if (!posed && isl === S.side) return;
      posed = null;                       // a new shot ends any mid-route pose
      placeAtDock(isl);
      rampAngle = 1; rampOpen = 1;
      W.rampPivot.rotation.z = -rampDown;
      dolphins.visible = false; gullLeave();
      tieUp();
      refreshGate();
    });
    if (q === 'cat' || q === 'candy') {
      placeAtDock(q);
      rampAngle = 1;
      W.rampPivot.rotation.z = -rampDown;
      tieUp();
      refreshGate();
    } else if (q !== null && q !== undefined) {
      const target = clamp(parseFloat(q) || 0, 0, 0.999);
      requestDeparture(S.side === 'candy' ? 'cat' : 'candy', { force: true });
      setPhase('cross');
      rampOpen = 0; rampAngle = 0;
      ctx.events.emit('ferry:board', { to: S.to });
      pt = target * T.cross;
      if (target > 0.2) { dolphins.visible = true; trip.done.dolphins = true; }
      if (target > 0.45) { gullArrive(); gullState.mode = 'perch'; trip.done.gull = true; }
    }
   } catch (err) { console.error('[ferry] world:ready', err); }
  });

  ctx.events.on('story:honorary_citizen', () => {
    if (S.side !== 'cat' || S.phase !== 'idle') { refreshGate(); return; }
    S.asleep = false;
    yawnT = 1.6;
    wakeUpT = 0.8;
    ringBell();
    spout();
    setPose(POSE.wheel);
    ui('toast', 'The Sugarfin Express wakes up with a colossal yawn.');
    say(LINES.woke[0], 4.2);
    refreshGate();
  });
  ctx.events.on('story:arrived_cat', () => refreshGate());

  return {
    update,
    requestDeparture,
    /** Screenshot/debug: park her at 0..1 along the route (null = back at her
     *  pier). Does not run the trip and never touches the camera. */
    setProgress,
    /** Screenshot/debug: berth her at 'candy' | 'cat', moored, plank down. */
    moor,
    state: S,
    whale: W.group,
    parts: W,
    captain: cap,
    /** world position of the gangplank foot (for other systems that want it) */
    gangway: landing,
    docks: DOCKS,
  };
}
