// ─────────────────────────────────────────────────────────────────────────────
// CAT CITIZENS — the feline society of Cat Island.
//
// ~42 named, dressed, scheduled cats built from one parametric rig. Every body
// part is an instance in a shared InstancedMesh pool (see citizens/rig.js), so
// the whole population costs ~29 draw calls. Behaviour (schedules, steering,
// poses) lives in citizens/brain.js; names, coats and dialogue in citizens/cast.js.
//
// WAVE 2 lives here too:
//   · TIGERS (citizens/tiger.js) — 20:00–05:30 every citizen morphs into a
//     prowling quadruped tiger (same bones, same instances, same draw calls),
//     hunts in loose packs, and a catch is a comic scruff-carry to the guest bed.
//   · RUSTY (citizens/rusty.js) — the one-eyed smuggler under the quay who sells
//     escape routes for candy.
//
// Exposes:
//   ctx.systems.catCitizens.cats   → [{ name, role, pos, mood, tigerK, ... }]
//   .byKey(key) .nearest(x,z) .count .setPerches([{x,y,z}]) .stats()
//   .isTigerTime() → bool          (containment asks before starting the curfew)
//   .tigers → [{key,name,x,z}] · .carrier → the tiger carrying you, or null
//   .hit(catRef, { weapon, power, from, kind }) → { ok, effect }   (weapons contract)
//   .helperCandy → candy paid to Rusty
//   .debugPositions() → [{ x, y, z, r, kind, key, on, ground, gh, head?, rear? }] for
//     every walking NPC (verifier: y = feet, r = the circle kept out of solids,
//     kind 'cat' | 'shopkeeper' | 'tiger', on 'ground' | 'prop' | 'seat' | 'perch')
//
// WAVE 3 — Contract A (ground & collision), B (stars), C (new weapons):
//   · Every walking cat and tiger runs its proposed move through
//     ctx.systems.player.pushOut (SOLID colliders: circles + boxes) and puts
//     its feet on ctx.systems.player.groundInfo(x,z).h every frame (a LOW prop's
//     top counts: crates, kerbs, low walls are walked ON). See settle() below —
//     brain.js calls it between the move and the pose, so the instanced rig is
//     always drawn at the resolved position. A push = "turn around" for the
//     planners. A tiger is three circles (torso, head, haunches), all resolved;
//     a turn that would put its head into a wall is not taken.
//   · LOW props are only stepped onto when their top is within a stride of the
//     feet (tiger 0.22, cat 0.25 — the visitor's rule): a bench, a planter or a
//     crate is walked ROUND (LOW BLOCKERS below), never straddled.
//   · Tigers NAVIGATE (citizens/nav.js): a 0.75-u walkability grid + flow
//     fields per pack / the visitor / the guest bed, so a pack on the far side
//     of town is reached round the buildings; slots are pulled in short of the
//     first wall; close-and-blocked = sit and watch; a watchdog (3.5 s pressing
//     within 1.2 u of one spot) sits the jam out, and pounces clear if it
//     happens again there. stats(): stuck / holds / leaps / relocs, clipFrames.
//   · Authored marks (homes, nap/sun spots, staged slots, kitten hub) are pushed
//     clear of every solid at boot. Raised marks (bench seats, the gym deck and
//     bench pad, rooftop / sill perches) are exempt while the cat is ON them:
//     a cat walking to one climbs onto the prop it touches.
//   · Five paved plazas are drawn as flat discs the ground core does not know
//     (FLOOR_DISCS): the feet use max(groundInfo.h, disc) — until the ground
//     core learns a plaza (a walkable for it), then that disc retires and the
//     feet are groundInfo.h alone (syncDiscs, every 6 s).
//   · PERSONAL SPACE (polish round 4): the three hunters hold a RING round
//     the visitor (4.8–6.6 u, crouching, sitting to stare, padding round him)
//     and only the nearest ever closes in, in one committed spring, when it
//     can catch him (never in grace / i-frames / a star); every other tiger
//     keeps a 7-u berth, walks ROUND him (brain.js step) and passes him beside,
//     not through (passBy); separateTigers() backs it with a hard 1.9-u skin
//     exclusion. A jumped clock opens a 12-s grace: stalk and ring, no spring.
//   · TIGERS APART: bodies are capsules (haunches → brow), kept 0.3 u apart
//     skin to skin; packmates claim distinct slots (slotTaken); a pair a wall
//     keeps pinned together swaps places. Pockets of open ground that join no
//     street (Welcome Plaza's planter ring) are never slots — a tiger that
//     finds itself in one bounds out (pocketLeap).
//   · THE SQUARE LURKS: one pack owns Purrliament Square after dark, working
//     slowly round the edge of the flagstones and sitting to stare (tiger.js).
//   · X-RAY (citizens/xray.js): a citizen between the lens and the visitor is
//     dithered out where it covers him, under any camera; bodies at the lens thin.
//   · No player API → the old behaviour (world.height + the local grid push).
//   · powerups.active: every cat/tiger within 16 u flees the visitor; touching
//     him bounces them 6 u with a puff. Nobody hunts (or catches) a star, or a
//     visitor in dodge-roll i-frames.
//   · hit(): cannon (big knockback + dizzy) · whip (stagger) · poprocks (fizz
//     panic scatter) · gum (stuck 4 s) · marshmallow (bonk + bounce) ·
//     boomerang (spin) · water (flee 8 s) — tigers too; unknown names never throw.
// Emits: 'cat:talk' { cat, line } · 'cat:hit' { cat, weapon, effect }
//        'cats:tigers' { on } · 'cats:caught' { cat, name }
// Story flags set: arrived_cat (if nothing else set it), met_cats, plus each
//   cat's own flag (met_mayor, met_mittens, met_gym, knows_ferry_truth, …),
//   met_rusty · knows_spray · helper_candy · helper_1/3/5 · carried_home ·
//   met_tigers.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, hash, clamp } from '../../core/util.js';
import { createRigLibrary, buildCat } from './citizens/rig.js';
import { updateCat, solidPush } from './citizens/brain.js';
import { buildStageIndex, makeStageFn, SCENES } from './citizens/staging.js';
import { PATTERN_TINT } from './citizens/fur.js';
import {
  isTigerTime, MORPH_SECS, setForm, tigerNameFor, tigerScale, tigerBackY, mouthPoint,
  createPackState, tigerPlan, BERTH,
} from './citizens/tiger.js';
import { addTigerPools, buildTiger } from './citizens/tigerrig.js';
import { addSillPool, placeSillLoaves, breatheSills } from './citizens/sills.js';
import { createNav } from './citizens/nav.js';
import { createNpcXray } from './citizens/xray.js';
import { buildHideout, RUSTY } from './citizens/rusty.js';
import CAST from './citizens/cast.js';

// Where the cats have decided you live. (containment/scenery.js owns the bed
// itself; we ask it at boot and fall back to the address in the brief.)
const GUEST_BED = { x: 168.2, z: 52.1 };

const IDLE_SETS = {
  busy: ['stand', 'work', 'stand', 'groom'],
  calm: ['stand', 'sit', 'groom', 'stand', 'stretch'],
  lazy: ['sit', 'stand', 'loaf', 'groom', 'sit'],
  perky: ['stand', 'stretch', 'sit', 'stand'],
};

// ── the floors the town is actually built on ─────────────────────────────────
// world.height() only knows the terrain, but the citizens walk on paving slabs,
// sand aprons and timber decks the architecture laid ON TOP of it (a flattened
// landmark core can sit half a metre below its own pavement). Without this a
// black cat naps half-sunk through the Purrliament flagstones and the gym crew's
// legs disappear into the deck. Numbers come from the builders' own maths:
//   paving(x, y+0.1, …) → surface y+0.1 · gym sand cyl → ground+0.14
const FLOOR_DISCS = [
  { x: 78, z: 18, r: 13.2, off: 0.18 },    // Welcome Plaza
  { x: 128, z: -24, r: 16.8, off: 0.20 },  // Meow Donald's
  { x: 152, z: 6, r: 18.3, off: 0.20 },    // Purrliament Square
  { x: 178, z: 48, r: 9.3, off: 0.20 },    // Whisker Heights green
  { x: 198, z: -26, r: 17.3, off: 0.14 },  // Muscle Beach sand apron
];

export function create(ctx) {
  const { scene, world } = ctx;
  ctx.colliders = ctx.colliders || [];

  for (const f of FLOOR_DISCS) { f.y = world.height(f.x, f.z) + f.off; f.r2 = f.r * f.r; }
  /** Highest authored surface at (x,z) — terrain unless a district paved over it. */
  function floorY(x, z) {
    let y = world.height(x, z);
    for (let i = 0; i < FLOOR_DISCS.length; i++) {
      const f = FLOOR_DISCS[i], dx = x - f.x, dz = z - f.z;
      if (dx * dx + dz * dz < f.r2 && f.y > y) y = f.y;
    }
    return Math.max(y, 0.15);
  }

  const group = new THREE.Group();
  group.name = 'cat_citizens';
  scene.add(group);

  const lib = createRigLibrary();
  addTigerPools(lib);                 // the night shift's own body (tigerrig.js)
  addSillPool(lib);                   // a loaf in every Whisker Heights window
  const rand = rng(hash('cat-citizens-v1'));

  // ── build the population ───────────────────────────────────────────────────
  const cats = [];
  for (const spec of CAST) {
    const r = rng(hash('cat:' + spec.key));
    const rig = buildCat(lib, spec);
    if (!spec.noTiger) rig.tiger = buildTiger(lib, spec, rig);
    const hx = spec.home[0], hz = spec.home[1];
    const cat = {
      key: spec.key, name: spec.name, role: spec.role, mood: spec.mood || 'content',
      spec, rig, home: [hx, hz], face: spec.face ?? Math.PI,
      tags: spec.tags || {}, sched: spec.sched || 'wander',
      pattern: spec.pattern, build: spec.build || 'normal',
      x: hx, z: hz, y: Math.max(world.height(hx, hz), 0.2), yaw: spec.face ?? Math.PI,
      faceDir: spec.face ?? Math.PI, moving: false, gait: r() * 6.28, gaitSpeed: 1.8,
      seed: r(), ph: r() * 6.28, lane: (r() - 0.5) * 1.6,
      think: r() * 0.5, idleT: r() * 6, idlePose: 'stand', wanderT: 0,
      blinkT: r() * 5, blink: 0, flickT: r() * 6, flick: 0,
      talkUntil: -1, talkPose: 'stand', lineIdx: 0, lookAt: null, busted: 0,
      pos: new THREE.Vector3(hx, 0, hz),
      a: {}, t: {},
      bodyBase: rig.bodyMesh.scale.clone(),
      limbBase: [rig.legL.userData.mesh.scale.clone(), rig.legR.userData.mesh.scale.clone(),
                 rig.armL.userData.mesh.scale.clone(), rig.armR.userData.mesh.scale.clone()],
      idleSet: IDLE_SETS[spec.idle || (spec.sched === 'gym' ? 'perky' : spec.build === 'chonky' ? 'lazy' : spec.sched === 'shopkeep' || spec.sched === 'work' ? 'busy' : 'calm')],
      // spots for the island-wide beats
      napSpot: [hx + (r() - 0.5) * 2.6, hz + (r() - 0.5) * 2.6],
      sunSpot: [hx + (r() - 0.5) * 5.0, hz + (r() - 0.5) * 5.0],
      perchY: null,
    };
    cat.y = Math.max(world.height(cat.x, cat.z), 0.2);
    // collision radius of the house-cat body (tigers: bodyR() below)
    cat.rad = 0.28 * (spec.size ?? 1) * (cat.build === 'buff' ? 1.35 : cat.build === 'chonky' ? 1.25 : 1);
    cat.sx = NaN; cat.sz = NaN; cat.settleT = 0; cat.gyT = 0; cat.bumpT = 0;
    cat.kvx = 0; cat.kvz = 0; cat.air = 0; cat.airV = 0;
    cats.push(cat);
  }

  const sillLoaves = placeSillLoaves(lib, world);

  // build the instanced meshes (one per part type)
  for (const p of Object.values(lib.pools)) p.build(group);
  const pools = Object.values(lib.pools).filter((p) => p.mesh);
  // the x-ray (citizens/xray.js): whoever stands between the lens and the
  // visitor is dithered out where it covers him — every body-part pool except
  // the ground blobs and the window loaves (which are not in anybody's way)
  const xray = createNpcXray(ctx);
  for (const p of pools) if (p.name !== 'blob' && p.name !== 'sillLoaf') xray.patch(p.mesh.material);
  const xrayK = () => (T.carrying ? 0 : 1);

  // kittens run the same ring, staggered → a game of tag instead of milling
  cats.filter((c) => c.sched === 'kitten').forEach((c, i) => { c.kitIdx = i; });

  // ── night shift ────────────────────────────────────────────────────────────
  // Every citizen gets a tiger name and a pack. Rusty (noTiger) does not: he
  // has his reasons and he will not discuss them.
  cats.forEach((c, i) => {
    c.tigerK = 0; c.striped = false; c.formed = false; c.roared = false; c.roarUntil = -1;
    c.tiger = tigerNameFor(c, i);
  });
  cats.filter((c) => !c.spec.noTiger).forEach((c, i) => { c.packIdx = i % 6; c.packSlot = i; });

  // ── Rusty's crate hideout, under the quay ──────────────────────────────────
  // The landmark centre is ON the harbour path and inside a stand of palms, so
  // the shack negotiates for itself: the clearest spot in the zone that is off
  // the paving and clear of nature's colliders (which are already registered).
  const HC = world.LANDMARKS.helper_cat;
  const spotScore = (x, z) => {
    if (world.height(x, z) < 1.2) return -1e9;
    let clear = 99;
    for (const o of ctx.colliders) { const d = Math.hypot(x - o.x, z - o.z) - (o.r || 0); if (d < clear) clear = d; }
    const np = world.nearestPath(x, z, 'cat');
    // prefer clear, off-path and DOWNHILL (the quay end is the water end)
    return Math.min(clear, 3.4) + Math.min(np ? np.d : 9, 4.6) * 0.8 - Math.max(0, world.height(x, z) - 3.9) * 0.7;
  };
  let hx0 = HC.x, hz0 = HC.z, bestScore = -1e9;
  for (let a = 0; a < 16; a++) for (const r of [0, 2.4, 3.6, 4.6]) {
    const x = HC.x + Math.cos(a / 16 * Math.PI * 2) * r, z = HC.z + Math.sin(a / 16 * Math.PI * 2) * r;
    const s = spotScore(x, z);
    if (s > bestScore) { bestScore = s; hx0 = x; hz0 = z; }
  }
  const hRY = Math.atan2(HC.x - hx0, HC.z - hz0);            // opening faces the path
  const hideout = buildHideout(ctx, hx0, hz0, hRY);
  hideout.group.traverse((o) => { o.userData.noFade = true; });   // never dissolve the shack
  group.add(hideout.group);
  const local = (lx, lz) => [hx0 + lx * Math.cos(hRY) + lz * Math.sin(hRY), hz0 - lx * Math.sin(hRY) + lz * Math.cos(hRY)];
  const rusty = cats.find((c) => c.key === 'rusty');
  if (rusty) {
    const seat = local(0.55, 1.30);
    rusty.home = seat; rusty.x = seat[0]; rusty.z = seat[1];
    rusty.face = hRY; rusty.faceDir = hRY; rusty.yaw = hRY;
    rusty.seatY = hideout.group.position.y + 0.74;           // deck 0.13 + crate 0.61
  }
  // the two crate stacks are solid; his stool and the space in front are not
  for (const [lx, lz] of [[-1.3, 0.45], [1.5, -0.62]]) {
    const [cx, cz] = local(lx, lz);
    ctx.colliders.push({ x: cx, z: cz, r: 0.85 });
  }

  // ── shared brain state ─────────────────────────────────────────────────────
  const stageIndex = buildStageIndex();
  const S = {
    elapsed: 0, frame: 0, snapping: false, rand, pick: (a) => a[Math.floor(rand() * a.length)],
    kittenHub: { x: world.LANDMARKS.cat_park.x, z: world.LANDMARKS.cat_park.z },
    kittenT: 0,
    stage: makeStageFn(stageIndex),
    byKey: (k) => cats.find((c) => c.key === k),
    playerNear(c, d) { const p = ctx.systems.player?.position; return p ? Math.hypot(p.x - c.x, p.z - c.z) < d : false; },
    // wave 3 (Contract A): brain.js calls these — see SOLIDS / SETTLE below
    settle: (c, dt, plan) => settle(c, dt, plan),
    solidsNear: (x, z) => solidsNear(x, z),
    isLow: (o) => isLowProp(o),
    mark: (x, z) => markXZ(x, z),
    tigerSteer: (c, u) => tigerSteer(c, u),
  };
  /** brain.js step(): nudge a walking tiger's unit heading `u` (in place) round
   *  the tigers in its lane ahead. Head-on (the other one walking at it) both
   *  keep right; otherwise it passes on the side away from the other. */
  const LANE_D = 3.4, LANE_W = 1.6;
  function tigerSteer(c, u) {
    let ax = 0, az = 0;
    const L = T.on && _live.length ? _live : cats;          // (separateTigers' list of this frame)
    for (let i = 0; i < L.length; i++) {
      const o = L[i];
      if (o === c || !(o.tigerK > 0.5) || o.carryTo) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      if (dx > LANE_D || dx < -LANE_D || dz > LANE_D || dz < -LANE_D) continue;
      const ahead = dx * u.x + dz * u.z; if (ahead <= 0) continue;
      const d = Math.hypot(dx, dz); if (d > LANE_D) continue;
      const lat = dx * -u.z + dz * u.x;
      if (lat > LANE_W || lat < -LANE_W) continue;
      const headOn = o.moving && (Math.sin(o.yaw) * u.x + Math.cos(o.yaw) * u.z) < -0.3;
      const side = headOn ? -1 : (lat > 0 ? -1 : 1);
      const w = (LANE_D - d) / LANE_D * (LANE_W - Math.abs(lat)) / LANE_W * 1.2;
      ax += -u.z * side * w; az += u.x * side * w;
    }
    u.x += ax; u.z += az;
  }

  // ── tiger state (see citizens/tiger.js) ────────────────────────────────────
  const T = {
    on: isTigerTime(ctx.state.time),
    announced: null,
    carrying: null,
    graceUntil: 6,                       // no hunting on arrival, or just after a catch
    packs: createPackState(world, rng(hash('cat-tiger-packs'))),
  };
  S.tigerPlan = (c, h, cx, s) => navigate(c, tigerPlan(c, h, cx, s, T));

  // ── NAV (citizens/nav.js): where a tiger can actually walk ────────────────
  // A tiger's pack may be prowling the far side of town. Straight at its slot
  // was straight into a shopfront, for a minute, so every tiger plan goes
  // through navigate(): the slot is pulled in short of the first building on
  // the ray from the pack's centre (so it is always in plain sight of the
  // centre, and never inside a wall); if the tiger can see its goal it walks
  // straight there, otherwise it follows the flow field of its pack (or of
  // the visitor it is hunting, or of the guest bed it is carrying him to)
  // round the buildings until it can. Close to the goal and still pressing
  // into something: that is close enough — it sits and watches.
  const NAV_R = 0.8;                           // a buff tiger's torso fits at an open cell's centre
  let nav = null, navN = -1, navAt = -1, navVer = -1;
  /** Does collider c stop a tiger? SOLID / TALL: yes. LOW: if it stands
   *  more than a stride tall (benches, planters); kerbs no. Neutralised
   *  claims and flat decals no. (Doors count shut: nobody prowls indoors.) */
  function navBlocker(c) {
    const h = c.h;
    if (typeof h === 'number' && h === h) {
      if (h < -50 || h <= 0.02) return false;
      const e = LOWG.byC.get(c);
      if (e) return e.rise > TIGER_SF;
      if (h <= LOW_MAX) return h > TIGER_SF;
      if (h < 1e4 && h <= 90 && h - world.height(c.x, c.z) <= 0.02) return false;
    }
    return true;
  }
  function navEnsure() {
    const pl = groundCore(); if (!pl) return null;
    if (!nav) {
      const I = world.ISLANDS?.cat;
      nav = createNav(world, { x0: 26, z0: -124, x1: 274, z1: 124, cell: 0.75, landCell: 1.5, navR: NAV_R,
        cx: I?.center?.x ?? 150, cz: I?.center?.z ?? 0, radius: I?.radius ?? 118 });
    }
    lowSync(pl);
    const cols = ctx.colliders;
    // rebuilt when the collider list changes, and every 2 min anyway (burns)
    if (!nav.built || cols.length !== navN || LOWG.ver !== navVer || S.elapsed > navAt) {
      navN = cols.length; navAt = S.elapsed + 120; navVer = LOWG.ver;
      nav.build(cols, navBlocker);
    }
    return nav;
  }
  const _nw = { x: 0, z: 0, d: 0 }, _nc = { x: 0, z: 0 };
  const FLEE_FAN = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1];
  /** A fleeing tiger runs where there is room to run, not into the wall
   *  that happens to be directly away from the spray bottle. */
  function fleeTarget(N, c, plan) {
    const ux = plan.x - c.x, uz = plan.z - c.z, L = Math.hypot(ux, uz);
    if (L < 1e-3 || N.los(c.x, c.z, plan.x, plan.z)) return;
    const a0 = Math.atan2(ux, uz);
    let bl = -1, ba = a0;
    for (let i = 0; i < FLEE_FAN.length; i++) {
      const a = a0 + FLEE_FAN[i];
      const l = N.ray(c.x, c.z, Math.sin(a), Math.cos(a), L);
      if (l >= Math.min(L, 6)) { bl = l; ba = a; break; }
      if (l > bl + 0.5) { bl = l; ba = a; }
    }
    if (bl > 1.5) { plan.x = c.x + Math.sin(ba) * bl; plan.z = c.z + Math.cos(ba) * bl; }
  }
  const NAVC = { calls: 0, straight: 0, routed: 0, nofield: 0, unreached: 0, holds: 0 };
  /** Is this tiger standing in a pocket of open ground cut off from the street? */
  function inPocket(N, c) {
    const i = N.nearestOpen(c.x, c.z, 2);
    return i >= 0 && !N.onMain(i);
  }
  /** Bound out of a pocket: to the nearest cell of real street within 7.5 u
   *  where the body fits, if nothing SOLID (a fountain, a wall — not a low
   *  planter, which it clears) stands on the way. */
  function pocketLeap(N, c) {
    if (c.leapCool > S.elapsed || c.leapT > 0) return false;
    const pl = groundCore(); if (!pl) return false;
    const i = N.nearestOpen(c.x, c.z, 10, null, true); if (i < 0) return false;
    N.cellCentre(i, _nc);
    const tx = _nc.x, tz = _nc.z, d = Math.hypot(tx - c.x, tz - c.z);
    if (d > 7.5 || d < 0.3) return false;
    const T = tigerScale(c), fy = c.y === c.y ? c.y : -Infinity, yaw = Math.atan2(tx - c.x, tz - c.z);
    for (let q = 1; q < 6; q++) {
      const k = q / 6; pl.pushOut(c.x + (tx - c.x) * k, c.z + (tz - c.z) * k, TORSO_R * T * 0.6, _po);
      if (_po.hit && Math.hypot(_po.x - (c.x + (tx - c.x) * k), _po.z - (c.z + (tz - c.z) * k)) > 0.25) return false;
    }
    const f = fitTiger(pl, tx, tz, yaw, T, 6, fy);
    if (!f.clear || (f.x - tx) ** 2 + (f.z - tz) ** 2 > 0.64) return false;
    _te.x = f.x; _te.z = f.z; _te.yaw = yaw; _te.tol = 0;
    c.leapCool = S.elapsed + 6;
    resLog('pocket', c, c.x, c.z, f.x, f.z);
    startLeap(c, c.x, c.z, _te, c.yaw);
    c.navHoldUntil = 0;
    return true;
  }
  /** An off-duty tiger whose next leg runs within PASS_R of the visitor aims
   *  for a point beside him instead (the side the leg already leans to, if
   *  that side is open and in plain sight): passing him in Main Street, the
   *  flow field's waypoint was often the very paving slab he stood on. */
  const PASS_R = 3.0, PASS_OFF = 3.3;
  function passBy(N, c, plan, P) {
    if (!P || c.huntRank < 3 || c.carryTo || plan.pose !== 'prowl') return;
    const dx = plan.x - c.x, dz = plan.z - c.z, L2 = dx * dx + dz * dz;
    if (L2 < 1e-4) return;
    const t = ((P.x - c.x) * dx + (P.z - c.z) * dz) / L2;
    if (t <= 0) return;                                          // he is behind it
    // (t > 1: he is beyond the goal — then the goal itself is what is checked)
    const tt = Math.min(1, t), qx = c.x + dx * tt - P.x, qz = c.z + dz * tt - P.z;
    if (qx * qx + qz * qz >= PASS_R * PASS_R) return;
    const L = Math.sqrt(L2);
    let sx = -dz / L, sz = dx / L;
    if (sx * qx + sz * qz < 0) { sx = -sx; sz = -sz; }
    for (let k = 0; k < 2; k++) {
      const sg = k ? -1 : 1, ex = P.x + sx * sg * PASS_OFF, ez = P.z + sz * sg * PASS_OFF;
      if (N.isOpen(ex, ez) && N.los(c.x, c.z, ex, ez)) { plan.x = ex; plan.z = ez; plan.pass = 1; return; }
    }
  }
  const SLOT_SEP = 3.0;
  /** Is (x,z) within SLOT_SEP of a slot a packmate claimed in the last second? */
  function slotTaken(c, x, z) {
    const now = S.elapsed;
    for (let i = 0; i < cats.length; i++) {
      const o = cats[i];
      if (o === c || o.packIdx !== c.packIdx || !(o.tigerK > 0.5) || !(now - (o.slotAt ?? -9) < 1)) continue;
      if ((o.slotX - x) ** 2 + (o.slotZ - z) ** 2 < SLOT_SEP * SLOT_SEP) return true;
    }
    return false;
  }
  function navigate(c, plan) {
    if (!plan || plan.act !== 'post' || plan.hold || !T.on) return plan;
    const now = S.elapsed;
    // sitting a jam out (unstick): watch the street for a moment — unless it
    // is sitting on the visitor's doorstep without being one of his hunters
    const Pv = ctx.systems.player?.position;
    const crowding = !!Pv && c.huntRank >= 3 && (c.x - Pv.x) ** 2 + (c.z - Pv.z) ** 2 < BERTH_HARD * BERTH_HARD;
    if (c.navHoldUntil > now && !c.carryTo && !(c.fxUntil > now) && !plan.catch && !crowding) {
      return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: c.faceDir, hold: 1 };
    }
    if (plan.x === c.x && plan.z === c.z) return plan;          // staying put anyway
    const N = navEnsure(); if (!N || !N.built) return plan;
    const pose = plan.pose;
    let key = null, sx = 0, sz = 0, tol = 2.5;
    if (c.carryTo) { key = 'bed'; sx = c.carryTo.x; sz = c.carryTo.z; tol = 4; }
    else if (pose === 'flee' || pose === 'flinch') { fleeTarget(N, c, plan); return plan; }
    else if (pose === 'rush' || pose === 'stalk') {
      const p = ctx.systems.player?.position;
      if (plan.catch || !p) return plan;
      key = 'player'; sx = p.x; sz = p.z; tol = 3;
      // circling on the ring: a step round him that lands in a shopfront or a
      // planter goes the other way round; if both are shut it sits and stares
      if (plan.ring && !(N.isOpen(plan.x, plan.z) && N.los(c.x, c.z, plan.x, plan.z))) {
        if (N.isOpen(plan.ax, plan.az) && N.los(c.x, c.z, plan.ax, plan.az)) { plan.x = plan.ax; plan.z = plan.az; }
        else return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: Math.atan2(p.x - c.x, p.z - c.z), hold: 1 };
      }
      // he is standing somewhere a tiger cannot go (the gaps between Welcome
      // Plaza's fountain and its planters take a visitor, not a tiger): the
      // hunters take the nearest places round him that ARE street, as close
      // in as the planters allow, and sit there and stare
      if (!plan.ring && !N.isMain(plan.x, plan.z)) {
        const b = Math.atan2(c.x - p.x, c.z - p.z), r0 = Math.hypot(plan.x - p.x, plan.z - p.z);
        let found = false;
        for (let rr = 0; rr < 4 && !found; rr++) {
          const r = r0 + rr * 1.5;
          for (let k = 0; k < 9 && !found; k++) {
            const a = b + (k & 1 ? 1 : -1) * ((k + 1) >> 1) * 0.3;
            const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
            if (N.isMain(x, z)) { plan.x = x; plan.z = z; found = true; }
          }
        }
      }
    } else if (pose === 'prowl' && T.packs.packs[c.packIdx % T.packs.packs.length].ring) {
      // the square's lurkers: the slot is already on the flagstones' edge; a
      // slot that lands on a bench or a lamp post takes the nearest open cell
      const pk = T.packs.packs[c.packIdx % T.packs.packs.length];
      if (!N.isMain(plan.x, plan.z)) { const i = N.nearestOpen(plan.x, plan.z, 6, null, true); if (i >= 0) { N.cellCentre(i, _nc); plan.x = _nc.x; plan.z = _nc.z; } }
      // routed to its OWN place on the edge (a field sourced at the pack's
      // centre led every lurker that lost sight of its slot onto the plinth)
      key = 'ring' + c.key; sx = plan.x; sz = plan.z; tol = 3;
    } else if (pose === 'prowl') {
      const pk = T.packs.packs[c.packIdx % T.packs.packs.length];
      // (from a real piece of street: the nearest open cell to a pack centre
      //  on the fountain used to be a pocket inside the planter ring)
      let ox = pk.x, oz = pk.z;
      if (!N.isMain(ox, oz)) { const i = N.nearestOpen(ox, oz, 16, null, true); if (i >= 0) { N.cellCentre(i, _nc); ox = _nc.x; oz = _nc.z; } }
      // the slot sits on a ray from the pack's centre; a ray that runs into a
      // building within a few metres is turned (golden-angle steps) until one
      // has room — else a whole pack in a planter-ringed plaza stacks up on
      // the one open cell by the fountain and shoves itself into the hedges
      let ux = plan.x - ox, uz = plan.z - oz;
      const L0 = Math.hypot(ux, uz);
      if (L0 > 1e-3) {
        ux /= L0; uz /= L0;
        const want = Math.min(L0, 4);
        let best = -1, bx = ux, bz = uz;
        for (let k = 0; k < 8; k++) {
          const a = k * 2.39996, cs = Math.cos(a), sn = Math.sin(a);
          const vx = ux * cs - uz * sn, vz = ux * sn + uz * cs;
          const l = N.ray(ox, oz, vx, vz, L0) - 1.2;
          if (l > best) { best = l; bx = vx; bz = vz; }
          if (l >= want - 1e-3) break;
        }
        const l = Math.max(0, Math.min(L0, best));
        plan.x = ox + bx * l; plan.z = oz + bz * l;
        // SLOT CLAIMS: a pack parked in a planter-ringed plaza pulled every
        // slot into the same open pocket, and seven tigers sat down in a heap
        // round one spot by the MISSING board. A slot within SLOT_SEP of a
        // packmate's claimed one turns on (golden-angle steps, the ray's room
        // permitting) until it is clear of every claim.
        if (slotTaken(c, plan.x, plan.z)) {
          for (let k = 1; k < 10; k++) {
            const a = k * 2.39996, cs = Math.cos(a), sn = Math.sin(a);
            const vx = bx * cs - bz * sn, vz = bx * sn + bz * cs;
            const room = N.ray(ox, oz, vx, vz, Math.max(L0, 6)) - 1.2;
            if (room < 1.5) continue;
            const lk = Math.min(Math.max(L0, 3.5), room);
            const tx = ox + vx * lk, tz = oz + vz * lk;
            if (!slotTaken(c, tx, tz)) { plan.x = tx; plan.z = tz; break; }
          }
        }
      }
      if (!N.isMain(plan.x, plan.z)) { const i = N.nearestOpen(plan.x, plan.z, 8, null, true); if (i >= 0) { N.cellCentre(i, _nc); plan.x = _nc.x; plan.z = _nc.z; } }
      c.slotX = plan.x; c.slotZ = plan.z; c.slotAt = now;
      key = 'pack' + pk.id; sx = pk.x; sz = pk.z; tol = 4;
    } else return plan;
    // off duty: the ray pull-in (or a nearest-open-cell nudge) may have brought
    // the slot back in round the visitor — out to the berth again
    if (Pv && c.huntRank >= 3 && pose === 'prowl') {
      const ox = plan.x - Pv.x, oz = plan.z - Pv.z, od = Math.hypot(ox, oz);
      if (od < BERTH) {
        let bx = c.x - Pv.x, bz = c.z - Pv.z; const bl = Math.hypot(bx, bz);
        if (bl > 1e-3) { bx /= bl; bz /= bl; } else { bx = Math.sin(c.seed * 9); bz = Math.cos(c.seed * 9); }
        plan.x = Pv.x + bx * BERTH; plan.z = Pv.z + bz * BERTH;
        if (!N.isMain(plan.x, plan.z)) { const i = N.nearestOpen(plan.x, plan.z, 5, null, true); if (i >= 0) { N.cellCentre(i, _nc); plan.x = _nc.x; plan.z = _nc.z; } }
      }
    }
    // a tiger in a POCKET (the gaps between Welcome Plaza's fountain and its
    // planter ring: open ground that joins nothing) cannot walk out — it
    // bounds out, over the planters, onto the nearest real piece of street
    if (S.snapping) return plan;                     // a jumped clock: teleported to the goal anyway
    if (!c.carryTo && pose !== 'rush' && inPocket(N, c) && pocketLeap(N, c)) {
      return { act: 'post', x: c.x, z: c.z, pose: 'rush', face: c.faceDir, hold: 1 };
    }
    const gx = plan.x, gz = plan.z;
    // close enough, and pressing into something (a planter, the next tiger)
    // or getting nowhere for a second and a half: sit and watch
    const dg2 = (gx - c.x) ** 2 + (gz - c.z) ** 2;
    if (!c.carryTo && ((dg2 < 7.8 && c.touchT > 0.5) || (dg2 < 20 && c.wdB > 1.5 && c.wdHit))) {
      c.navHoldUntil = now + 1.2 + c.seed; NAVC.holds++;
      return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: Math.atan2(gx - c.x, gz - c.z), hold: 1 };
    }
    NAVC.calls++;
    if (N.los(c.x, c.z, gx, gz)) { NAVC.straight++; passBy(N, c, plan, Pv); return plan; }
    const f = N.field(key, sx, sz, tol, S.frame);
    if (!f) { NAVC.nofield++; return plan; }
    if (!N.next(f, c.x, c.z, 40, _nw)) {
      // no way from here to there (it grew stripes inside the planter ring on
      // Welcome Plaza, or a knockback put it in a yard): it does not grind at
      // the hedge — it sits and watches the street, and tries again shortly
      NAVC.unreached++;
      if (c.carryTo) return plan;
      c.navHoldUntil = now + 2 + c.seed * 2;
      return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: Math.atan2(gx - c.x, gz - c.z), hold: 1 };
    }
    NAVC.routed++;
    plan.x = _nw.x; plan.z = _nw.z; plan.nav = 1;
    passBy(N, c, plan, Pv);
    return plan;
  }

  // ── dialogue ───────────────────────────────────────────────────────────────
  function linePool(cat) {
    const story = ctx.systems.story;
    let pool = cat.spec.lines.slice();
    if (ctx.state.isNight && cat.spec.night) pool = pool.concat(cat.spec.night);
    if (cat.spec.after && story) for (const k in cat.spec.after) if (story.get(k)) pool = pool.concat(cat.spec.after[k]);
    return pool;
  }

  function talk(cat) {
    const ui = ctx.systems.ui, story = ctx.systems.story;
    if (cat.key === 'rusty') return talkRusty(cat);
    if (cat.tigerK > 0.5) return growl(cat);
    const pool = linePool(cat);
    const line = pool[cat.lineIdx % pool.length];
    cat.lineIdx++;
    // the portrait wears the speaker's own coat — forty cats were all sharing
    // one generic ginger face in the dialogue box
    ui?.say(line, { speaker: `${cat.name} — ${cat.role}`, portrait: { color: coatHex(cat) } });
    cat.talkUntil = S.elapsed + 4.2 + line.length * 0.02;
    cat.talkPose = cat.pose === 'sleep' || cat.pose === 'loaf' ? 'sit' : (cat.spec.build === 'buff' ? 'flex' : 'stand');
    if (story) {
      story.set('met_cats', true);
      if (cat.spec.sets) story.set(cat.spec.sets, true);
      if (cat.lineIdx >= pool.length) story.set('heard_all_' + cat.key, true);
    }
    ctx.events.emit('cat:talk', { cat, line });
    ctx.systems.particles?.burst({
      x: cat.x, y: cat.y + 1.55 * (cat.spec.size ?? 1), z: cat.z,
      count: 5, color: [0xffe9a8, 0xffffff, 0xffc7d8], speed: 1.1, life: 0.7, size: 0.11, gravity: -1.0, spread: 0.4,
    });
  }

  // ── talking to something with stripes ──────────────────────────────────────
  const GROWLS = [
    'It looks at you the way you look at a sandwich.',
    'It knows your name. It is using your name. It should not know your name.',
    '“…evening.” The voice is the same. Everything else is not.',
    'It is wearing the visor. It is four times the size of the visor.',
    'A purr, but felt in the ribs rather than heard.',
  ];
  function growl(cat) {
    const ui = ctx.systems.ui;
    ui?.say(GROWLS[(cat.lineIdx++) % GROWLS.length], { speaker: cat.tiger.full, portrait: { color: 0xf08a22 } });
    cat.talkUntil = S.elapsed + 2.2;
    ctx.systems.story?.set('met_tigers', true);
    ctx.events.emit('cat:talk', { cat, line: 'growl', tiger: true });
  }

  // ── RUSTY: the candy economy ───────────────────────────────────────────────
  const R = { given: 0, idle: 0, fail: 0 };
  function rustySay(lines) {
    const ui = ctx.systems.ui;
    const arr = Array.isArray(lines) ? lines : [lines];
    for (const l of arr) ui?.say(l, { speaker: 'Rusty — Smuggler', portrait: { color: 0xe08a34 } });
  }
  function talkRusty(cat) {
    const story = ctx.systems.story, inv = ctx.systems.inventory;
    cat.talkUntil = S.elapsed + 7; cat.talkPose = 'sit';
    cat.lineIdx++;
    story?.set('met_cats', true);

    if (!story?.get('met_rusty')) {
      story?.set('met_rusty'); story?.set('knows_spray');
      rustySay(RUSTY.free);
      ctx.systems.ui?.toast('Rusty deals in candy. Candy grows on the other island.');
      ctx.events.emit('cat:talk', { cat, line: 'rusty:free' });
      return;
    }
    // he keeps up with your escape attempts, and he is kind about them
    const fails = ctx.systems.catContainment?.escapeAttempts ?? story?.get('escape_attempts') ?? 0;
    if (fails > R.fail) { R.fail = fails; rustySay(RUSTY.onFail[(fails - 1) % RUSTY.onFail.length]); return; }
    if (ctx.state.isNight && R.idle % 3 === 1) { R.idle++; rustySay(RUSTY.onNight[R.idle % RUSTY.onNight.length]); return; }

    if (R.given >= 5) { rustySay(RUSTY.done[(R.idle++) % RUSTY.done.length]); return; }

    const have = (inv && typeof inv.count === 'function') ? (inv.count('candy') | 0) : 0;
    if (have <= 0) {
      rustySay(R.given === 0 ? RUSTY.ask[(R.idle++) % RUSTY.ask.length] : RUSTY.none[(R.idle++) % RUSTY.none.length]);
      return;
    }
    const nextTier = R.given >= 3 ? 5 : R.given >= 1 ? 3 : 1;
    const n = Math.min(have, nextTier - R.given);
    if (inv.spend && inv.spend('candy', n) === false) { rustySay(RUSTY.none[0]); return; }
    R.given += n;
    story?.set('helper_candy', R.given);
    ctx.systems.particles?.burst({
      x: cat.x, y: cat.y + 1.2, z: cat.z, count: 10,
      color: [0xff9ac0, 0xffe08a, 0x8ee0c0], speed: 1.6, life: 0.9, size: 0.14, gravity: -1.4, spread: 0.5,
    });
    if (R.given >= 5 && !story?.get('helper_5')) {
      // the cave system gates on the flag, not on an item — no junk in the bag
      story?.set('helper_5'); rustySay(RUSTY.t5);
      ctx.systems.ui?.toast('Rusty gives you the cave key. It is sticky. (Yarn Hill, 188/-64.)');
    } else if (R.given >= 3 && !story?.get('helper_3')) {
      story?.set('helper_3'); rustySay(RUSTY.t3);
      ctx.systems.ui?.toast('The Big Fling (120, 78) has been repaired. Allegedly.');
    } else if (R.given >= 1 && !story?.get('helper_1')) {
      story?.set('helper_1'); rustySay(RUSTY.t1);
      ctx.systems.ui?.toast("Smuggler's Cove (236, 44) — there is a canoe under the tarp.");
    } else {
      rustySay(`That's ${R.given}. ${nextTier} gets you the next one. I don't do credit, I did once, he's a bench now.`);
    }
    ctx.events.emit('cat:talk', { cat, line: 'rusty:' + R.given });
  }

  /** The flat colour of a cat's coat — used for its dialogue portrait. */
  function coatHex(cat) {
    return cat.spec.accColor && cat.key === 'rusty' ? 0xe08a34
      : (PATTERN_TINT[cat.spec.pattern] ?? 0xe0c8a0);
  }

  // ── SOLIDS ─────────────────────────────────────────────────────────────────
  // A coarse local hash of the colliders a walker goes ROUND, for STEERING
  // only (brain.js step() asks for the solids near a cat instead of scanning
  // ~3,800 of them): every SOLID, plus the LOW props too tall to step onto
  // (benches, planters — see LOW BLOCKERS below). Kerb-height props are left
  // out: walkers step ON them. The hard constraint is the player's pushOut
  // (settle below); this grid is also the fallback push when that API is missing.
  const GRID = { src: null, n: 0, cell: 8, map: new Map() };
  const LOW_MAX = 1.6;
  const NO_SOLIDS = [];
  /** The ground core's LOW-prop rule, closely enough for steering: the prop's
   *  height above the ground if it is LOW (0 for a neutralised claim), NaN if
   *  it is SOLID. */
  function lowRel(o) {
    const h = o.h;
    if (typeof h !== 'number' || h !== h || h >= 1e4) return NaN;
    if (h < -50) return 0;                             // neutralised claim
    const minDim = o.box ? Math.min(o.w || 0, o.d || 0) : 2 * (o.r || 0);
    let rel = h;
    if (h > LOW_MAX) { if (h > 90) return NaN; rel = h - world.height(o.x, o.z); }
    if (rel <= 0.02) return 0;
    if (rel > LOW_MAX) return NaN;
    return minDim < 0.5 && rel > 0.5 ? NaN : rel;      // thin and tall: a hurdle, solid
  }
  function isLowProp(o) { const r = lowRel(o); return r === r; }
  function gridAdd(o) {
    if (!o || typeof o.x !== 'number' || typeof o.z !== 'number') return;
    if (Math.abs(o.x) > 5e4 || Math.abs(o.z) > 5e4) return;
    const lr = lowRel(o); if (lr === lr && lr <= CAT_SF) return;
    const br = o.box ? 0.5 * Math.hypot(o.w || 0, o.d || 0) : (o.r || 0);
    if (!(br > 0) || br > 200) return;
    const e = br + 2, C = GRID.cell;
    for (let ix = Math.floor((o.x - e) / C); ix <= Math.floor((o.x + e) / C); ix++)
      for (let iz = Math.floor((o.z - e) / C); iz <= Math.floor((o.z + e) / C); iz++) {
        const k = ix * 65536 + iz;
        let arr = GRID.map.get(k); if (!arr) { arr = []; GRID.map.set(k, arr); }
        arr.push(o);
      }
  }
  function gridSync() {
    const cols = ctx.colliders;
    if (cols === GRID.src && cols.length === GRID.n) return;
    if (cols === GRID.src && cols.length > GRID.n) {          // grew: append
      for (let i = GRID.n; i < cols.length; i++) gridAdd(cols[i]);
    } else {                                                  // swapped / shrank: rebuild
      GRID.map.clear();
      for (let i = 0; i < cols.length; i++) gridAdd(cols[i]);
    }
    GRID.src = cols; GRID.n = cols.length;
  }
  /** Solid colliders whose reach (+2 u) covers the grid cell holding (x,z). */
  function solidsNear(x, z) {
    gridSync();
    return GRID.map.get(Math.floor(x / GRID.cell) * 65536 + Math.floor(z / GRID.cell)) || NO_SOLIDS;
  }
  const _pp = { x: 0, z: 0 };
  /** FALLBACK hard push (no player API): out of every solid within `rad`. */
  function pushOutSolids(cat, rad) {
    const list = solidsNear(cat.x, cat.z);
    for (let i = 0; i < list.length; i++) {
      const gap = solidPush(list[i], cat.x, cat.z, _pp);
      if (gap < rad) {
        const nx = cat.x + _pp.x * (rad - gap), nz = cat.z + _pp.z * (rad - gap);
        if (world.height(nx, nz) > 0.35) { cat.x = nx; cat.z = nz; }
      }
    }
  }

  /** The player's ground core (Contract A), or null — never assume it exists. */
  function groundCore() {
    const pl = ctx.systems.player;
    return pl && typeof pl.pushOut === 'function' && typeof pl.groundInfo === 'function' ? pl : null;
  }
  /** The circle each body keeps out of solids. A tiger is long: this circle
   *  covers the torso, a second one the head and a third the hindquarters. */
  // (torso: the rig's flank is ±0.45 T wide and ±0.75 T long; the head circle
  //  covers the neck to the muzzle and the rear one the hips and haunches, so
  //  the torso circle can stay slim enough for a buff tiger to get down an
  //  alley without wedging)
  const TORSO_R = 0.62;                              // × tigerScale
  const bodyR = (c) => (c.tigerK > 0.5 ? TORSO_R * tigerScale(c) : c.rad);
  const HEAD_FWD = 0.95, HEAD_R = 0.45;             // × tigerScale, ahead of the centre
  const REAR_BACK = 0.6, REAR_R = 0.42;             // × tigerScale, behind it

  // ── LOW BLOCKERS ──────────────────────────────────────────────────────────
  // Contract A: a walker ON a low prop stands on its top — but a bench is not
  // a kerb. The ground core's pushOut (the NPC form) never blocks a LOW prop,
  // so a tiger's long body used to straddle a bench with its feet still on the
  // paving and the slats through its belly. Here, exactly as the visitor is
  // treated (the core's pushOut with feetY + stepFree): a LOW prop whose top
  // stands more than a stride above this body's FEET is walked round; one
  // within a stride is stepped onto (groundInfo lifts the feet). Tops come
  // from the core itself (forEachLow: classified + visually calibrated).
  const TIGER_SF = 0.22;     // a tiger's stride up (u above its feet)
  const CAT_SF = 0.25;       // a house cat's
  const LOWG = { src: null, n: -1, t: -1, cell: 4, map: new Map(), byC: new Map(), ok: false, sig: NaN, ver: 0 };
  const LOW_MARGIN = 1.1;    // ≥ the biggest circle ever pushed (a buff tiger's torso, 0.8)
  const lowKey = (x, z) => Math.floor(x / 4) * 65536 + Math.floor(z / 4);
  /** Re-bin the LOW props (the ground core's list) — on a new collider count,
   *  and every 10 s anyway (calibration, burns). Cheap: ~0.1 ms. */
  function lowSync(pl) {
    const cols = ctx.colliders;
    if (LOWG.ok && cols === LOWG.src && cols.length === LOWG.n && S.elapsed < LOWG.t) return;
    LOWG.src = cols; LOWG.n = cols.length; LOWG.t = S.elapsed + 10;
    LOWG.map.clear(); LOWG.byC.clear(); LOWG.ok = false;
    const core = pl && pl.ground;
    if (!core || typeof core.forEachLow !== 'function') return;
    let sig = 0;
    core.forEachLow((i, c, top, base) => {
      if (!c || typeof c.x !== 'number' || Math.abs(c.x) > 5e4 || !(top === top)) return;
      sig += 1 + top * 0.37 + (top - base) * 1.91 + c.x * 0.013;
      const br = (c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0)) + LOW_MARGIN;
      if (!(br > LOW_MARGIN) || br > 60) return;
      const e = { c, top, rise: top - base };
      LOWG.byC.set(c, e);
      for (let ix = Math.floor((c.x - br) / 4); ix <= Math.floor((c.x + br) / 4); ix++)
        for (let iz = Math.floor((c.z - br) / 4); iz <= Math.floor((c.z + br) / 4); iz++) {
          const k = ix * 65536 + iz;
          let a = LOWG.map.get(k); if (!a) { a = []; LOWG.map.set(k, a); }
          a.push(e);
        }
    });
    LOWG.ok = true;
    // (calibration / a burn changed what is a blocker: the nav grid re-rasterises)
    if (!(Math.abs(sig - LOWG.sig) < 1e-6)) { LOWG.sig = sig; LOWG.ver++; }
  }
  /** Push the circle (x,z,r) out of every LOW prop standing more than `sf`
   *  above feet at `fy` → out {x,z,hit}. True if it moved. */
  function lowPush(x, z, r, fy, sf, out) {
    out.x = x; out.z = z; out.hit = false;
    const a = LOWG.ok ? LOWG.map.get(lowKey(x, z)) : undefined;
    if (!a) return false;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let j = 0; j < a.length; j++) {
        const e = a[j], c = e.c;
        if (c.solid === false || e.top - fy <= sf) continue;
        let nx, nz, pen;
        if (c.box) {
          const hw = (c.w || 0) * 0.5, hd = (c.d || 0) * 0.5;
          if (!(hw > 0) || !(hd > 0)) continue;
          const rot = c.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
          const dx = x - c.x, dz = z - c.z;
          const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
          if (lx > hw + r || lx < -hw - r || lz > hd + r || lz < -hd - r) continue;
          const qx = lx < -hw ? -hw : lx > hw ? hw : lx, qz = lz < -hd ? -hd : lz > hd ? hd : lz;
          const ox = lx - qx, oz = lz - qz, d2 = ox * ox + oz * oz;
          let nlx, nlz;
          if (d2 > 1e-10) {
            if (d2 >= r * r) continue;
            const d = Math.sqrt(d2); nlx = ox / d; nlz = oz / d; pen = r - d;
          } else {                                        // centre inside: out the nearest face
            const ex = hw - Math.abs(lx), ez = hd - Math.abs(lz);
            if (ex < ez) { nlx = lx < 0 ? -1 : 1; nlz = 0; pen = ex + r; } else { nlx = 0; nlz = lz < 0 ? -1 : 1; pen = ez + r; }
          }
          nx = nlx * cs - nlz * sn; nz = nlx * sn + nlz * cs;
        } else {
          const cr = c.r || 0; if (!(cr > 0)) continue;
          const rr = cr + r, dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          if (d2 < 1e-8) { nx = 1; nz = 0; pen = rr; } else { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = rr - d; }
        }
        x += nx * pen; z += nz * pen; moved = true; out.hit = true;
      }
      if (!moved) break;
    }
    out.x = x; out.z = z;
    return out.hit;
  }
  const _lp = { x: 0, z: 0, hit: false };
  /** One circle out of every SOLID (the ground core) AND every LOW prop more
   *  than `sf` above the feet at `fy` → _po. */
  function pushAll(pl, x, z, r, fy, sf) {
    pl.pushOut(x, z, r, _po);
    let px = _po.x, pz = _po.z, hit = _po.hit;
    if (lowPush(px, pz, r, fy, sf, _lp)) {
      px = _lp.x; pz = _lp.z; hit = true;
      pl.pushOut(px, pz, r, _po);                    // (the bench shoved it into a wall?)
      if (_po.hit) { px = _po.x; pz = _po.z; }
    }
    _po.x = px; _po.z = pz; _po.hit = hit;
    return _po;
  }

  // ── TIGERS APART, AND OFF THE VISITOR ─────────────────────────────────────
  // A tiger is LONG (rump to muzzle ≈ 2.4 × its scale): kept apart centre to
  // centre, two of them nose to tail or crossing at an angle still sank into
  // each other, and a halted pack in a narrow street became a heap of six. So
  // each body is a CAPSULE — the spine from the haunches to the brow, 0.46 ×
  // scale thick — and no two capsules come within SEP_GAP of each other.
  // The visitor gets the same treatment from every tiger that is not in the
  // middle of a committed spring (plan.spring) or carrying him: a hard
  // exclusion PS_R round him, the backstop behind tigerPlan's hunting ring.
  const CAP_BACK = 0.55, CAP_FWD = 1.0, CAP_R = 0.46;   // × tigerScale
  const SEP_GAP = 0.3;                                  // skin to skin
  const PS_R = 1.9;                                     // visitor's centre → tiger skin
  const BERTH_HARD = 5.0;                               // off duty: eased out beyond this (centre)
  const _live = [];
  const _sd = { px: 0, pz: 0, qx: 0, qz: 0, d: 0 };
  /** Closest points between segments a0→a1 and b0→b1 (2-D) → _sd. */
  function segSeg(a0x, a0z, a1x, a1z, b0x, b0z, b1x, b1z) {
    const ux = a1x - a0x, uz = a1z - a0z, vx = b1x - b0x, vz = b1z - b0z, wx = a0x - b0x, wz = a0z - b0z;
    const a = ux * ux + uz * uz, b = ux * vx + uz * vz, cc = vx * vx + vz * vz, d = ux * wx + uz * wz, e = vx * wx + vz * wz;
    const D = a * cc - b * b;
    let sc = D > 1e-9 ? clamp((b * e - cc * d) / D, 0, 1) : 0;
    let tc = cc > 1e-9 ? (b * sc + e) / cc : 0;
    if (tc < 0) { tc = 0; sc = a > 1e-9 ? clamp(-d / a, 0, 1) : 0; } else if (tc > 1) { tc = 1; sc = a > 1e-9 ? clamp((b - d) / a, 0, 1) : 0; }
    _sd.px = a0x + ux * sc; _sd.pz = a0z + uz * sc; _sd.qx = b0x + vx * tc; _sd.qz = b0z + vz * tc;
    _sd.d = Math.hypot(_sd.px - _sd.qx, _sd.pz - _sd.qz);
    return _sd;
  }
  let SEPN = 0;
  function separateTigers() {
    _live.length = 0;
    for (const c of cats) if (c.tigerK > 0.5 && !c.carryTo) {
      c.capT = tigerScale(c); c.capSy = Math.sin(c.yaw); c.capCy = Math.cos(c.yaw);
      _live.push(c);
    }
    for (let i = 0; i < _live.length; i++) {
      const a = _live[i];
      if (a.leapT > 0) continue;
      for (let j = i + 1; j < _live.length; j++) {
        const b = _live[j];
        if (b.leapT > 0) continue;
        let dx = b.x - a.x, dz = b.z - a.z;
        const reach = 1.5 * (a.capT + b.capT) + SEP_GAP;
        if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
        const ta = a.capT, tb = b.capT;
        const q = segSeg(a.x - a.capSy * CAP_BACK * ta, a.z - a.capCy * CAP_BACK * ta, a.x + a.capSy * CAP_FWD * ta, a.z + a.capCy * CAP_FWD * ta,
          b.x - b.capSy * CAP_BACK * tb, b.z - b.capCy * CAP_BACK * tb, b.x + b.capSy * CAP_FWD * tb, b.z + b.capCy * CAP_FWD * tb);
        const need = CAP_R * (ta + tb) + SEP_GAP;
        if (q.d >= need) continue;
        let nx = q.qx - q.px, nz = q.qz - q.pz, nl = q.d;
        if (nl < 1e-4) { nx = dx; nz = dz; nl = Math.hypot(nx, nz); if (nl < 1e-4) { nx = Math.cos(a.seed * 9); nz = Math.sin(a.seed * 9); nl = 1; } }
        nx /= nl; nz /= nl;
        // the one walking gives way more than the one sitting (a sitter shoved
        // every frame reads as a sitter sliding across the paving)
        const pen = need - q.d, wa = a.moving ? (b.moving ? 0.5 : 0.75) : (b.moving ? 0.25 : 0.5);
        // pinned together (a wall hands the shove straight back, frame after
        // frame): the later one in the pack gives up its place and takes another
        if (pen > 0.12) { const y = a.packSlot > b.packSlot ? a : b; y.sepHit = S.frame; }
        const pa = Math.min(0.35, pen * wa), pb = Math.min(0.35, pen * (1 - wa));
        if (pen > 0.01) { a.shovedAt = S.elapsed; b.shovedAt = S.elapsed; SEPN++; }   // (the watchdog counts a shove as contact)
        const ax = a.x - nx * pa, az = a.z - nz * pa;
        const bx = b.x + nx * pb, bz = b.z + nz * pb;
        if (world.height(ax, az) > 0.35) { a.x = ax; a.z = az; }
        if (world.height(bx, bz) > 0.35) { b.x = bx; b.z = bz; }
      }
    }
    for (let i = 0; i < _live.length; i++) {
      const c = _live[i];
      if (c.sepHit === S.frame) c.sepT = (c.sepT || 0) + 1 / 30;
      else if (c.sepT > 0) c.sepT = Math.max(0, c.sepT - 1 / 60);
      if (c.sepT > 1.5) { c.sepT = 0; c.slotRot = (c.slotRot || 0) + 2.1; c.navHoldUntil = 0; c.think = 0; }
    }
    // personal space: nobody but a committed spring comes within PS_R of him
    const P = ctx.systems.player?.position;
    if (P && ctx.state.island === 'cat' && !T.carrying) {
      for (let i = 0; i < _live.length; i++) {
        const c = _live[i];
        if (c.leapT > 0 || (c.plan && (c.plan.spring || c.plan.catch))) continue;
        // off duty (not one of his three hunters) and SITTING (a pack halt, a
        // jam-hold) on his doorstep: eased back out past BERTH_HARD at a walk.
        // One walking past is left to step() (it walks round him).
        if (c.huntRank >= 3 && !c.moving) {
          const ex = c.x - P.x, ez = c.z - P.z, ed = Math.hypot(ex, ez);
          if (ed < BERTH_HARD && ed > 1e-3) {
            const q = Math.min(0.06, BERTH_HARD - ed), x = c.x + ex / ed * q, z = c.z + ez / ed * q;
            if (world.height(x, z) > 0.35) { c.x = x; c.z = z; }
          }
        }
        const ta = c.capT;
        const x0 = c.x - c.capSy * CAP_BACK * ta, z0 = c.z - c.capCy * CAP_BACK * ta;
        const ux = c.capSy * (CAP_BACK + CAP_FWD) * ta, uz = c.capCy * (CAP_BACK + CAP_FWD) * ta;
        const L2 = ux * ux + uz * uz;
        const k = L2 > 1e-9 ? clamp(((P.x - x0) * ux + (P.z - z0) * uz) / L2, 0, 1) : 0;
        let nx = x0 + ux * k - P.x, nz = z0 + uz * k - P.z;
        const d = Math.hypot(nx, nz), need = CAP_R * ta + PS_R;
        if (d >= need) continue;
        if (d < 1e-4) { nx = c.x - P.x; nz = c.z - P.z; }
        const nl = Math.hypot(nx, nz) || 1;
        const push = Math.min(0.3, need - d);
        if (!(push > 0)) continue;
        const x = c.x + nx / nl * push, z = c.z + nz / nl * push;
        if (world.height(x, z) > 0.35) { c.x = x; c.z = z; c.shovedAt = S.elapsed; }
      }
    }
    // Runs BEFORE the walk now: each tiger's settle() (inside updateCat) then
    // resolves whatever this shoved against the walls, so separation can never
    // leave one inside a shopfront. Without the player API: the old local push.
    if (!groundCore()) for (let i = 0; i < _live.length; i++) pushOutSolids(_live[i], 0.95 * tigerScale(_live[i]));
  }

  // Push a spot out of any SOLID prop and off the water. Architecture and
  // nature register their colliders before world:ready, so a cat whose post
  // landed inside a new shopfront steps politely onto the pavement instead.
  const _rs = { x: 0, z: 0, hit: false };
  const _rg = { h: 0, deck: false, water: 0, limit: 0, floor: 0, prop: null, top: 0, base: 0 };
  const RING5 = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  /** A resting spot on top of a counter, a crate or a bench back is not a
   *  spot: walkers cross low props, but nobody PARKS on the fry station. */
  function onLowProp(pl, x, z, r) {
    for (let i = 0; i < RING5.length; i++) {
      pl.groundInfo(x + RING5[i][0] * r, z + RING5[i][1] * r, _rg);
      if (_rg.prop && _rg.h - _rg.base > 0.2) return true;
    }
    return false;
  }
  function spotFree(x, z, r = 0.45) {
    if (world.height(x, z) < 0.55) return false;
    const pl = groundCore();
    if (pl) { pl.pushOut(x, z, r, _rs); return !_rs.hit && !onLowProp(pl, x, z, r); }
    for (const o of ctx.colliders) {
      if (!o || o.box || !(o.r > 0) || o.solid === false || isLowProp(o)) continue;
      const dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz < (o.r + r) * (o.r + r)) return false;
    }
    return true;
  }
  function resolveSpot(x0, z0, maxR = 6, r = 0.45) {
    if (spotFree(x0, z0, r)) return [x0, z0];
    // the push itself is usually the nicest answer: straight out of the prop
    const pl = groundCore();
    if (pl) {
      pl.pushOut(x0, z0, r, _rs);
      const px = _rs.x, pz = _rs.z;
      if (Math.hypot(px - x0, pz - z0) <= maxR && spotFree(px, pz, r)) return [px, pz];
    }
    for (let ring = 1; ring <= 10; ring++) {
      const rr = (ring / 10) * maxR, n = 8 + ring * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.7;
        const x = x0 + Math.cos(a) * rr, z = z0 + Math.sin(a) * rr;
        if (spotFree(x, z, r)) return [x, z];
      }
    }
    return [x0, z0]; // nowhere close is clear — keep the authored post
  }
  /** A hard-coded schedule spot (brain.js SCHEDULES), resolved once, cached. */
  const MARKS = new Map();
  function markXZ(x, z) {
    const k = x * 4096 + z;
    let m = MARKS.get(k);
    if (m) return m;
    if (!groundCore()) return { x, z };                 // too early: don't cache
    const [rx, rz] = resolveSpot(x, z, 5, 0.5);
    m = { x: rx, z: rz }; MARKS.set(k, m);
    return m;
  }

  // ═══ SETTLE (Contract A) ═══════════════════════════════════════════════════
  // brain.js updateCat: decide → act (propose a move) → settle → pose. Here the
  // move meets the world: knockback, out of every solid, feet on the ground.
  const _gi = { h: 0, deck: false, water: 0, limit: 0, floor: 0, prop: null, top: 0, base: 0 };
  const _po = { x: 0, z: 0, hit: false };
  const _rb = { x: 0, z: 0, hit: false };
  let discT = 0;
  const KB_DECAY = 6;          // knockback: travel = v0 / KB_DECAY
  const AIR_G = 24;            // the comic hop's gravity
  function discY(x, z) {
    let y = -Infinity;
    for (let i = 0; i < FLOOR_DISCS.length; i++) {
      const f = FLOOR_DISCS[i]; if (f.known) continue;
      const dx = x - f.x, dz = z - f.z;
      if (dx * dx + dz * dz < f.r2 && f.y > y) y = f.y;
    }
    return y;
  }
  // The paving is architecture's; Contract A says feet come from groundInfo.h
  // alone. The moment the ground core knows a plaza (a walkable registered for
  // it: groundInfo already reports the paving top across the disc) that disc
  // retires here and the cats stand on groundInfo.h exactly. Re-checked every
  // few seconds, so it needs nobody to tell us.
  const RING_DISC = [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]];
  function syncDiscs() {
    const pl = groundCore(); if (!pl) return;
    for (const f of FLOOR_DISCS) {
      if (f.known) continue;
      let known = true;
      for (const [u, v] of RING_DISC) {
        pl.groundInfo(f.x + u * f.r, f.z + v * f.r, _gi);
        if (!(_gi.h >= f.y - 0.03)) { known = false; break; }
      }
      f.known = known;
    }
  }
  /** Resolve this body at (c.x,c.z) against the SOLIDS → _rb (does not move c). */
  const wrapA = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
  /** The yaw the animator (brain.js animate) is about to give this body: a
   *  boomerang spin winding down, else damped toward faceDir. */
  const headYaw = (c, dt) => (c.spinning
    ? c.yaw + dt * (6 + 14 * clamp((c.fxUntil - S.elapsed) / 1.4, 0, 1))
    : c.yaw + wrapA(c.faceDir - c.yaw) * (1 - Math.exp(-(c.moving ? 7 : 5) * dt)));
  /** A house cat: one circle, out of the solids and the LOW props taller
   *  than a cat's stride above its feet. */
  function resolveBody(c, pl) {
    const r = bodyR(c), fy = c.y === c.y ? c.y : -Infinity;
    let x = c.x, z = c.z, hit = false;
    for (let p = 0; p < 3; p++) {
      pushAll(pl, x, z, r, fy, CAT_SF);
      if (!_po.hit) break;
      const moved = (_po.x - x) ** 2 + (_po.z - z) ** 2 > 1e-6;
      x = _po.x; z = _po.z; hit = true;
      if (!moved) break;
    }
    _rb.x = x; _rb.z = z; _rb.hit = hit;
    return _rb;
  }
  // ── a tiger: torso + head + hindquarters, all out of every solid ──────────
  // Gauss-Seidel: each circle's push moves the whole body, pass after pass,
  // until a pass moves nothing. A heading that cannot be made to fit that way
  // (nose in a doorway with the flank on a lamp post) is not taken: the tiger
  // keeps the heading it has, or failing that turns to the nearest one that
  // fits — and holds it for a moment so the brain cannot swing the head
  // straight back into the wall. Every circle also clears the LOW props more
  // than TIGER_SF above its feet (`fy`): benches are walked round, not through.
  const TIGER_FAN = [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3, Math.PI];
  const FIT_EPS = 0.003;                 // a push shorter than this is contact, not overlap
  const _ft = { x: 0, z: 0, hit: false, clear: false };
  function fitTiger(pl, x0, z0, yaw, T, passes, fy) {
    let x = x0, z = z0, hit = false, clear = false;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const hf = HEAD_FWD * T, rb = REAR_BACK * T, rt = TORSO_R * T, rh = HEAD_R * T, rr = REAR_R * T;
    for (let p = 0; p < passes; p++) {
      let moved = false, px, pz, qx, qz;
      pushAll(pl, x, z, rt, fy, TIGER_SF);
      if (_po.hit) { qx = _po.x - x; qz = _po.z - z; if (qx * qx + qz * qz > FIT_EPS * FIT_EPS) moved = true; x = _po.x; z = _po.z; }
      px = x + sy * hf; pz = z + cy * hf;
      pushAll(pl, px, pz, rh, fy, TIGER_SF);
      if (_po.hit) { qx = _po.x - px; qz = _po.z - pz; if (qx * qx + qz * qz > FIT_EPS * FIT_EPS) moved = true; x += qx; z += qz; }
      px = x - sy * rb; pz = z - cy * rb;
      pushAll(pl, px, pz, rr, fy, TIGER_SF);
      if (_po.hit) { qx = _po.x - px; qz = _po.z - pz; if (qx * qx + qz * qz > FIT_EPS * FIT_EPS) moved = true; x += qx; z += qz; }
      if (!moved) { clear = true; break; }
      hit = true;
    }
    _ft.x = x; _ft.z = z; _ft.hit = hit; _ft.clear = clear;
    return _ft;
  }
  const _we = { x: 0, z: 0, yaw: 0, tol: 0 };
  /** The nearest clear pose for a wedged tiger: first any heading that fits
   *  from here however far the fit slides it, then rings of spots out to 4.2 u.
   *  Null if there is none (rare, and bounded: ≤ ~1,300 pushOuts, at most
   *  once a second per tiger — an ordinary wedge clears in the first loop). */
  function wedgeEscape(c, pl, x0, z0, want, T, fy) {
    let best = Infinity;
    for (let i = -1; i < TIGER_FAN.length; i++) {
      const yaw = i < 0 ? want : want + TIGER_FAN[i];
      const f = fitTiger(pl, x0, z0, yaw, T, 8, fy);
      if (!f.clear) continue;
      const d2 = (f.x - x0) ** 2 + (f.z - z0) ** 2;
      if (d2 < best) { best = d2; _we.x = f.x; _we.z = f.z; _we.yaw = yaw; }
    }
    if (best < Infinity) return _we;
    for (let ring = 1; ring <= 6; ring++) {
      const rr = ring * 0.7, n = 6 + ring;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.5;
        const sx = x0 + Math.sin(a) * rr, sz = z0 + Math.cos(a) * rr;
        if (world.height(sx, sz) < 0.5) continue;
        for (let q = 0; q < 2; q++) {
          const yaw = want + q * Math.PI * 0.5;
          const f = fitTiger(pl, sx, sz, yaw, T, 4, fy);
          if (f.clear && world.height(f.x, f.z) > 0.5) { _we.x = f.x; _we.z = f.z; _we.yaw = yaw; return _we; }
        }
      }
    }
    return null;
  }
  /** Last resort for a tiger nothing near it fits (wedgeEscape gave up): the
   *  nearest open cells of the nav grid (a torso fits at their centres, see
   *  citizens/nav.js), each tried at a few headings. ≤ 28 fits. */
  let _rlBest = null, _rlTries = 0;
  const _rlW = { c: null, pl: null, T: 1, fy: 0, want: 0 };
  function rlTry(x, z) {
    const W = _rlW;
    for (let q = 0; q < 4 && _rlTries < 28; q++, _rlTries++) {
      const yaw = W.want + q * Math.PI * 0.5;
      const f = fitTiger(W.pl, x, z, yaw, W.T, 6, W.fy);
      if (f.clear && (f.x - x) ** 2 + (f.z - z) ** 2 < 0.64 && world.height(f.x, f.z) > 0.5) {
        _we.x = f.x; _we.z = f.z; _we.yaw = yaw; _rlBest = _we; return true;
      }
    }
    return _rlTries >= 28;
  }
  function navRelocate(c, pl, x0, z0, want, T, fy) {
    const N = nav && nav.built ? nav : null;
    if (!N) return null;
    _rlBest = null; _rlTries = 0;
    _rlW.c = c; _rlW.pl = pl; _rlW.T = T; _rlW.fy = fy; _rlW.want = want;
    for (let ring = 0; ring <= 6 && !_rlBest && _rlTries < 28; ring++) N.forRing(x0, z0, ring, rlTry);
    return _rlBest;
  }
  /** How deep a tiger's head or haunches sit in a solid (or a LOW prop more
   *  than a stride above `fy`) at (x,z,yaw) — or Infinity if its torso is
   *  more than `torsoTol` in. */
  function tigerPen(pl, x, z, yaw, T, torsoTol, fy) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    let p = 0;
    pushAll(pl, x, z, TORSO_R * T, fy, TIGER_SF); if (_po.hit) p = Math.hypot(_po.x - x, _po.z - z);
    if (p > torsoTol) return Infinity;
    let px = x + sy * HEAD_FWD * T, pz = z + cy * HEAD_FWD * T;
    pushAll(pl, px, pz, HEAD_R * T, fy, TIGER_SF); if (_po.hit) p = Math.max(p, Math.hypot(_po.x - px, _po.z - pz));
    px = x - sy * REAR_BACK * T; pz = z - cy * REAR_BACK * T;
    pushAll(pl, px, pz, REAR_R * T, fy, TIGER_SF); if (_po.hit) p = Math.max(p, Math.hypot(_po.x - px, _po.z - pz));
    return p;
  }
  /** An open spot 1.2–2.8 u out — ahead first, then round to behind — where
   *  it fits, either facing the spot or keeping its heading (a hop sideways
   *  or backwards out of a pocket it cannot turn round in), and the whole
   *  pounce there (the turn eased exactly as settle() will play it) sweeps
   *  clear: head and haunches no more than `tol` u into anything (the torso
   *  no more than 0.12) at 7 points on the way. */
  const _te = { x: 0, z: 0, yaw: 0, tol: 0 };
  const TRAP_DIRS = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.0, -2.0, 2.6, -2.6, Math.PI];
  function trapEscape(pl, x0, z0, yaw0, dirA, T, tol, fy) {
    for (let ring = 0; ring < 3; ring++) {
      const rr = 1.2 + ring * 0.8;
      for (let j = 0; j < TRAP_DIRS.length; j++) {
        const a = dirA + TRAP_DIRS[j];
        const sx = x0 + Math.sin(a) * rr, sz = z0 + Math.cos(a) * rr;
        if (world.height(sx, sz) < 0.5) continue;
        for (let v = 0; v < 2; v++) {
          const turn = v === 0 ? wrapA(a - yaw0) : 0;
          if (v === 0 && Math.abs(turn) < 0.05) continue;       // same as keeping the heading
          const f = fitTiger(pl, sx, sz, yaw0 + turn, T, 3, fy);
          if (!f.clear || Math.hypot(f.x - sx, f.z - sz) > 0.4 || world.height(f.x, f.z) < 0.5) continue;
          const ex = f.x, ez = f.z;
          let open = true;
          for (let q = 1; q < 8 && open; q++) {
            const k = q / 8, e = k * k * (3 - 2 * k);
            open = tigerPen(pl, x0 + (ex - x0) * e, z0 + (ez - z0) * e, yaw0 + turn * e, T, Math.min(tol, 0.12), fy) <= tol;
          }
          if (open) { _te.x = ex; _te.z = ez; _te.yaw = yaw0 + turn; _te.tol = tol; return _te; }
        }
      }
    }
    return null;
  }
  const LEAP_SECS = 0.45;
  const RES = { traps: 0, leaps: 0, wedges: 0, detours: 0, relocs: 0, stuck: 0, holds: 0, clipFrames: 0, clipMax: 0, log: [], kinds: {} };
  /** The last few leaps / wedge escapes, for the verifier (stats().resLog). */
  function resLog(kind, c, x0, z0, x1, z1) {
    const kk = kind.startsWith('leap') ? 'leap' : kind; RES.kinds[kk] = (RES.kinds[kk] || 0) + 1;
    if (RES.log.length >= 24) RES.log.shift();
    RES.log.push({ kind, key: c.key, t: +S.elapsed.toFixed(2), from: [+x0.toFixed(2), +z0.toFixed(2)], to: [+x1.toFixed(2), +z1.toFixed(2)], plan: c.plan?.pose || null, nav: !!c.plan?.nav });
  }
  function startLeap(c, x0, z0, E, yaw0) {
    RES.leaps++; resLog(E.tol > 0.1 ? 'leap' + E.tol : 'leap', c, x0, z0, E.x, E.z);
    c.leapX0 = x0; c.leapZ0 = z0; c.leapX1 = E.x; c.leapZ1 = E.z; c.leapA = E.yaw; c.leapT = LEAP_SECS;
    c.leapY0 = yaw0;
    c.airV = Math.max(c.airV || 0, Math.sqrt(2 * AIR_G * 0.8));
    c.kvx = 0; c.kvz = 0; c.faceHoldUntil = 0;
    ctx.systems.particles?.burst?.({ x: x0, y: c.y + 0.3, z: z0, count: 10, color: [0xfff4e0, 0xd8c8a8], speed: 2.2, life: 0.5, size: 0.24, gravity: -2, spread: 0.8 });
  }
  /** A tiger that has spent the last few seconds pushing against the same
   *  wall (or the same tiger): the first time, it sits the jam out and takes
   *  another place in the pack; if it is back at the same spot, stuck again,
   *  within 15 s — or the trap clock says it cannot even turn — it BOUNDS out
   *  (a clean pounce, else one that brushes a post). Never walks in place. */
  function unstick(c, pl, x0, z0, yaw, dirA, T, fy, force = false) {
    RES.stuck++;
    const pg = c.plan;
    resLog('stuck', c, x0, z0, pg && pg.x !== undefined ? pg.x : x0, pg && pg.z !== undefined ? pg.z : z0);
    const again = S.elapsed - (c.unstuckAt ?? -99) < 15 && (x0 - c.unstuckX) ** 2 + (z0 - c.unstuckZ) ** 2 < 6.25;
    c.unstuckAt = S.elapsed; c.unstuckX = x0; c.unstuckZ = z0;
    let E = null;
    if ((force || again) && !(c.leapCool > S.elapsed)) {
      E = trapEscape(pl, x0, z0, yaw, dirA, T, 0.1, fy) || trapEscape(pl, x0, z0, yaw, dirA, T, 0.3, fy)
        || trapEscape(pl, x0, z0, yaw, dirA, T, 1.2, fy);
      if (E) { c.leapCool = S.elapsed + 6; startLeap(c, x0, z0, E, yaw); }
    }
    c.slotRot = (c.slotRot || 0) + 2.1;
    if (!E) { c.navHoldUntil = S.elapsed + 2.2 + c.seed * 1.5; RES.holds++; }
    c.trapT = 0; c.trapTurned = false; c.wdB = 0; c.wdX = NaN;
    return E;
  }
  function resolveTiger(c, pl, dt) {
    const T = tigerScale(c), x0 = c.x, z0 = c.z;
    const fy = c.y === c.y ? c.y : -Infinity;          // feet: what a bench is measured against
    // how far a fit may slide the body: 0.9 T, plus however far it was moved
    // this frame (a knockback at 36 u/s arrives a metre deep in a wall)
    const mv = c.sx === c.sx ? Math.hypot(x0 - c.sx, z0 - c.sz) : 0;
    const lim = 0.9 * T + mv, lim2 = lim * lim;
    // a heading the resolver picked a moment ago is held (see below)
    if (c.faceHoldUntil > S.elapsed && !c.spinning) c.faceDir = c.faceHold;
    const want = headYaw(c, dt);
    let yaw = want, f = fitTiger(pl, x0, z0, want, T, 8, fy);
    let ok = f.clear && (f.x - x0) ** 2 + (f.z - z0) ** 2 <= lim2;
    let fan = false, trapped = false, trapA = 0, clr = ok;
    // the turn it wanted does not fit: don't turn
    if (!ok && Math.abs(wrapA(c.yaw - want)) > 1e-4) {
      yaw = c.yaw; f = fitTiger(pl, x0, z0, yaw, T, 8, fy);
      ok = f.clear && (f.x - x0) ** 2 + (f.z - z0) ** 2 <= lim2;
    }
    // nor does the heading it has (shoved, knocked back, a door swung): the
    // nearest heading that does
    for (let i = 0; !ok && i < TIGER_FAN.length; i++) {
      yaw = want + TIGER_FAN[i]; f = fitTiger(pl, x0, z0, yaw, T, 6, fy);
      ok = f.clear && (f.x - x0) ** 2 + (f.z - z0) ** 2 <= lim2;
      fan = ok;
    }
    clr = ok;
    // nothing fits close by: wedged (it changed shape in a tight spot at dusk,
    // or a knockback put it in an alcove). Find the nearest pose that fits,
    // however far — the nav grid's open cells if nothing nearer does — and
    // get there: a step if it is close, a pounce if it is not. Tried every
    // quarter second while a circle is really IN something, else once a second.
    if (!ok && !(c.wedgedUntil > S.elapsed)) {
      const P = wedgeEscape(c, pl, x0, z0, want, T, fy) || navRelocate(c, pl, x0, z0, want, T, fy);
      if (P) {
        const far = (P.x - x0) ** 2 + (P.z - z0) ** 2 > 1.44;
        RES.wedges++; if (far) RES.relocs++;
        resLog(far ? 'reloc' : 'wedge', c, x0, z0, P.x, P.z);
        if (far) {
          // a bound, not a teleport (airborne, excused while it lasts)
          _te.x = P.x; _te.z = P.z; _te.yaw = P.yaw; _te.tol = 0;
          startLeap(c, x0, z0, _te, c.yaw);
          c.touch = true; c.hyaw = c.yaw;
          _rb.x = x0; _rb.z = z0; _rb.hit = true;
          return _rb;
        }
        ok = true; clr = true; fan = true; yaw = P.yaw;
        _ft.x = P.x; _ft.z = P.z; _ft.hit = true; _ft.clear = true; f = _ft;
      } else {
        const deep = tigerPen(pl, x0, z0, c.yaw, T, Infinity, fy) > 0.1;
        c.wedgedUntil = S.elapsed + (deep ? 0.25 : 1);
      }
    }
    // truly nowhere this frame (a tiger in a cupboard): at least the torso
    // comes out; the wedge search above runs again in a moment
    if (!ok) {
      yaw = c.yaw; pushAll(pl, x0, z0, TORSO_R * T, fy, TIGER_SF);
      _ft.x = _po.x; _ft.z = _po.z; _ft.hit = _po.hit; f = _ft;
    }
    // Walking, and the fit handed the step straight back (nose on a lamp
    // post, haunches on the plinth): a long body does not slide round things
    // the way a round one does, so it WALKS round — the same stride turned
    // ±0.5, ±1, ±1.5 rad (the side that worked last time first), facing
    // where it goes.
    if (ok && mv > 1e-3 && c.sx === c.sx) {
      const mx = (x0 - c.sx) / mv, mz = (z0 - c.sz) / mv;
      if ((f.x - c.sx) * mx + (f.z - c.sz) * mz < 0.3 * mv) {
        const fx0 = f.x, fz0 = f.z, fh = f.hit;
        const base = Math.atan2(mx, mz), side = c.detourSide || 1;
        let found = false;
        // (k = 0: the stride it asked for, but without turning — backing or
        //  side-stepping out of a spot too tight to turn round in)
        for (let k = 0; k <= 6 && !found; k++) {
          const sg = k & 1 ? side : -side, a = base + sg * 0.5 * ((k + 1) >> 1);
          const dx = Math.sin(a), dz = Math.cos(a);
          const yw = k === 0 ? c.yaw : c.yaw + wrapA(a - c.yaw) * (1 - Math.exp(-7 * dt));
          if (k === 0 && Math.abs(wrapA(want - c.yaw)) < 0.02) continue;   // the want-fit already was this
          const g = fitTiger(pl, c.sx + dx * mv, c.sz + dz * mv, yw, T, 4, fy);
          if (!g.clear || (g.x - c.sx) * dx + (g.z - c.sz) * dz < 0.5 * mv) continue;
          found = true; yaw = yw; fan = false; RES.detours++;
          if (k > 0) c.detourSide = sg;
          _ft.x = g.x; _ft.z = g.z; _ft.hit = true; f = _ft;
        }
        if (!found) { _ft.x = fx0; _ft.z = fz0; _ft.hit = fh; f = _ft; trapped = true; trapA = base; }
      }
    }
    // It can neither walk on, walk round nor turn (a pocket between a plinth
    // and two lamp posts, where a knockback left it): after 0.9 s of that the
    // planners are told to turn it round, and if it is STILL trying and still
    // there at 2.6 s it BOUNDS out: a pounce to the nearest open spot whose
    // whole path sweeps clear, never through a wall. The clock only restarts
    // when the tiger has really got somewhere (0.6 u from where this began) —
    // not when the planner turns it round or it pauses — and it drains slowly
    // while the tiger stands still.
    const blockedNow = c.moving && mv > 1e-3 && (f.hit || yaw !== want || trapped);
    if (!(c.trapX > -1e9) || (f.x - c.trapX) ** 2 + (f.z - c.trapZ) ** 2 > 0.36) {
      c.trapX = f.x; c.trapZ = f.z; c.trapT = 0; c.trapTurned = false;
    }
    if (blockedNow) {
      c.trapT += dt;
      if (!trapped) trapA = Math.atan2(x0 - c.sx, z0 - c.sz);
    } else if (!c.moving) c.trapT = Math.max(0, c.trapT - dt * 0.5);
    // first the planners turn it round (Contract A: a push is "turn around"):
    // settle() gives the goal up, and a tiger takes another place in the pack
    if (c.trapT > 0.9 && !c.trapTurned) { c.trapTurned = true; c.bumpT = Math.max(c.bumpT || 0, 2.25); }
    if (blockedNow && c.trapT > 2.6) {
      RES.traps++;
      const cx = f.x, cz = f.z, ch = f.hit;           // (the search reuses f's scratch)
      // a clean pounce; failing that one whose head or tail brushes a post in
      // mid-air; failing that (a pocket too tight to turn in — only a knockback
      // or a teleport gets a tiger in there) one that swings its head through
      // one, body clear. Failing all of those it sits the jam out.
      unstick(c, pl, cx, cz, yaw, trapA, T, fy, true);
      _ft.x = cx; _ft.z = cz; _ft.hit = ch; f = _ft;
    }
    if (yaw !== want) {
      c.faceDir = yaw; c.yawLock = yaw;              // animate() applies exactly this
      if (fan) { c.faceHold = yaw; c.faceHoldUntil = S.elapsed + 1.2; }
    }
    c.hyaw = yaw;
    c.touch = f.hit || yaw !== want;                  // re-resolve every frame while it is
    c.touchT = c.touch ? (c.touchT || 0) + dt : 0;
    // CHECK (b) bookkeeping: a pose the resolver could not make fit (the
    // torso-only fallback) is measured; anything left > 0.15 u inside a solid
    // is counted (stats().clipFrames / clipMax — the probe asserts 0)
    if (!clr && !(c.leapT > 0)) {
      const p = tigerPen(pl, f.x, f.z, yaw, T, Infinity, fy);
      if (p > 0.15) { RES.clipFrames++; if (p > RES.clipMax) RES.clipMax = p; }
    }
    _rb.x = f.x; _rb.z = f.z; _rb.hit = f.hit || yaw !== want;
    return _rb;
  }
  function settle(c, dt, plan) {
    // hidden (a crowd cat gone indoors for the night): nothing to resolve
    if ((c.hideK || 0) >= 0.99) { c.sx = c.x; c.sz = c.z; c.bumped = false; return; }
    // snapAll's decide pass: the body is about to be put on its mark and
    // settled THERE — resolving it where it stood (a tiger half-grown on the
    // gossip bench) only started a leap that dragged it back afterwards
    if (S.snapping) return;
    const pl = groundCore();

    // 0. a trapped tiger bounding out (resolveTiger → startLeap): airborne,
    //    on a straight line it probed, so nothing to resolve until it lands
    const leaping = c.leapT > 0;
    if (leaping) {
      c.leapT = Math.max(0, c.leapT - dt);
      const k = 1 - c.leapT / LEAP_SECS, e = k * k * (3 - 2 * k);
      c.x = c.leapX0 + (c.leapX1 - c.leapX0) * e; c.z = c.leapZ0 + (c.leapZ1 - c.leapZ0) * e;
      c.yawLock = c.leapY0 + (c.leapA - c.leapY0) * e;   // the turn trapEscape swept
      c.faceDir = c.leapA; c.kvx = 0; c.kvz = 0; c.hyaw = c.yawLock;
    }

    // 1. knockback + the comic hop (weapons, the star bounce)
    if (c.kvx || c.kvz) {
      const nx = c.x + c.kvx * dt, nz = c.z + c.kvz * dt;
      if (world.height(nx, nz) > 0.35) { c.x = nx; c.z = nz; } else { c.kvx = 0; c.kvz = 0; }
      const f = Math.exp(-KB_DECAY * dt); c.kvx *= f; c.kvz *= f;
      if (c.kvx * c.kvx + c.kvz * c.kvz < 0.01) { c.kvx = 0; c.kvz = 0; }
    }
    if (c.airV || c.air) {
      c.airV -= AIR_G * dt; c.air += c.airV * dt;
      if (c.air <= 0) { c.air = 0; c.airV = 0; }
    }

    // 2. a RAISED mark (bench seat, deck, bench pad, rooftop / sill perch):
    //    a cat on it is ON the prop, not in it; a cat bound for it climbs on as
    //    soon as it touches the prop (instead of being pushed off forever)
    const raised = !!plan && plan.act === 'post' && (plan.y !== undefined || (!!plan.perch && !!c.perch));
    let mountY = NaN, dM = 99, my = 0;
    if (raised) {
      dM = Math.hypot(plan.x - c.x, plan.z - c.z);
      my = plan.y !== undefined ? plan.y : c.perch.y;
      if (c.onPerch || dM < 1.3 || (dM < 5.5 && c.climbX === plan.x && c.climbZ === plan.z)) mountY = my;
    }

    // 3. out of every SOLID (Contract A) — after moving, and every ~½ s anyway
    //    (doors swing, props burn, somebody may have built something)
    const moved = c.x !== c.sx || c.z !== c.sz;
    // a tiger turning on the spot swings its head and haunches: that needs
    // resolving too, and so does one still touching something
    const tiger = c.tigerK > 0.5;
    const turned = tiger && (c.touch || !(Math.abs(wrapA(headYaw(c, dt) - (c.hyaw ?? 99))) < 0.03));
    c.bumped = false;
    if (!tiger) c.touch = false;
    if (mountY !== mountY && !leaping) {
      if (pl) {
        c.settleT -= dt;
        if (moved || turned || c.settleT <= 0) {
          c.settleT = 0.35 + c.seed * 0.3;
          const R = tiger ? resolveTiger(c, pl, dt) : resolveBody(c, pl);
          if (R.hit) {
            if (raised && dM < 5.5) {                  // touching our raised mark's prop: climb it
              c.climbX = plan.x; c.climbZ = plan.z; mountY = my;
            } else {
              let nx = R.x - c.x, nz = R.z - c.z; const nl = Math.hypot(nx, nz);
              if (nl > 1e-6) { nx /= nl; nz /= nl; c.bnx = nx; c.bnz = nz; }
              c.x = R.x; c.z = R.z;
              if (moved) {
                c.bumped = true;
                c.bumpT += dt;
                // pushed back every frame on the way to one spot: give it up
                if (c.bumpT > 2.2 && plan && plan.act === 'post' && plan.x !== undefined) {
                  c.giveX = plan.x; c.giveZ = plan.z; c.bumpT = 0;
                  if (c.tigerK > 0.5) c.slotRot = (c.slotRot || 0) + 1.3;   // tigers: take another place in the pack
                }
              }
            }
          } else if (c.bumpT > 0) c.bumpT = Math.max(0, c.bumpT - dt * 0.5);
        }
      } else if (moved && c.tigerK > 0.5) pushOutSolids(c, 0.95 * tigerScale(c));
    }
    c.mounted = mountY === mountY;

    // 3b. the watchdog (tigers): still trying to walk, 3.5 s later, without
    //     having got 1.2 u from where it first met something = stuck, whatever
    //     the planners and the trap clock think. It bounds out, or sits the jam
    //     out and takes another place in the pack (unstick). Nothing walks in
    //     place against a shopfront for a minute.
    if (tiger && pl && !leaping && !(c.leapT > 0) && !c.carryTo) {
      if (!(c.wdX > -1e9) || (c.x - c.wdX) ** 2 + (c.z - c.wdZ) ** 2 > 1.44) { c.wdX = c.x; c.wdZ = c.z; c.wdB = 0; c.wdHit = false; }
      else if (c.moving) {
        c.wdB += dt;
        if (c.touch || c.bumped || S.elapsed - (c.shovedAt ?? -9) < 0.25) c.wdHit = true;
        if (c.wdB > 3.5 && c.wdHit) {
          const dirA = plan && plan.x !== undefined && (plan.x !== c.x || plan.z !== c.z) ? Math.atan2(plan.x - c.x, plan.z - c.z) : c.yaw;
          unstick(c, pl, c.x, c.z, c.yaw, dirA, tigerScale(c), c.y === c.y ? c.y : -Infinity);
        } else if (c.wdB > 6) {
          // walking, touching nothing, and still not 1.2 u further on (circling
          // a mark that will not hold still): sit down for a moment instead
          c.navHoldUntil = S.elapsed + 1.5 + c.seed; RES.holds++;
          c.wdX = NaN;
        }
      }
    }

    // 4. feet on the ground: groundInfo().h (terrain | deck | a LOW prop's top),
    //    or a paved plaza disc the ground core does not know about
    let gy;
    if (pl) {
      c.gyT -= dt;
      if (moved || c.x !== c.sx || c.z !== c.sz || c.gyT <= 0 || c.gy === undefined) {
        c.gyT = 0.45 + c.seed * 0.3;
        pl.groundInfo(c.x, c.z, _gi);
        gy = _gi.h; c.gh = _gi.h; c.onProp = !!_gi.prop;
        const dy = discY(c.x, c.z); if (dy > gy) gy = dy;
        if (gy < 0.15) gy = 0.15;
        c.gy = gy;
      } else gy = c.gy;
    } else { gy = floorY(c.x, c.z); c.gy = gy; c.gh = gy; c.onProp = false; }
    const ty = c.mounted ? Math.max(my, gy) : gy;
    const d = ty - c.y;
    // ramps onto low props are 0.3 u wide: follow them exactly; anything bigger
    // (hopping onto a seat, down off a roof) is a quick damped hop
    if (Math.abs(d) <= 0.5) c.y = ty;
    else c.y = Number.isFinite(c.y) ? c.y + d * (1 - Math.exp(-12 * dt)) : ty;
    c.sx = c.x; c.sz = c.z;
  }
  /** Knock a cat along (ux,uz) for `dist` u total, with a hop `hop` u high. */
  function kick(c, ux, uz, dist, hop = 0) {
    c.kvx = ux * dist * KB_DECAY; c.kvz = uz * dist * KB_DECAY;
    if (hop > 0) c.airV = Math.max(c.airV || 0, Math.sqrt(2 * AIR_G * hop));
    c.giveX = NaN; c.bumpT = 0;
  }

  // ── registration (systems below us in main.js exist only at world:ready) ───
  // Booted from world:ready, but also lazily from the first update() — if an
  // earlier system throws inside its own world:ready handler the event chain
  // stops and we would otherwise never register a single cat.
  const entries = [];
  let booted = false;
  function boot() {
    if (booted || !ctx.systems.interaction) return;
    booted = true;
    // Authored marks that can only be finished once the rest of the island has
    // registered itself:
    //   seat:  a bench slat — parts.js builds every bench at ground + 0.14
    //          (base) + 0.55 (slat) + 0.11 (slat thickness) = ground + 0.80.
    //   nudge: a mark near something placed at RUNTIME (the four EXIT signposts
    //          hunt for their own spots on a ring round the square), so the cat
    //          steps aside for whatever actually landed there.
    //   flop:  a nest in nature's catnip bed. Nature picks where the nests are
    //          at build time, so the marks are read off it here.
    const nests = ctx.systems.catNature?.meta?.bed?.flopSpots;
    for (const sc of SCENES) for (const s of sc.slots) {
      if (s.flop !== undefined && Array.isArray(nests) && nests[s.flop]) {
        const n = nests[s.flop];
        if (Number.isFinite(n.x) && Number.isFinite(n.z)) { s.x = n.x; s.z = n.z; if (Number.isFinite(n.yaw)) s.face = n.yaw; }
      }
      if (s.seat) s.y = Math.max(world.height(s.x, s.z), 0.4) + 0.80;
      if (s.nudge) {
        const [nx, nz] = resolveSpot(s.x, s.z, 2.2);
        if (s.faceAt) s.face = Math.atan2(s.faceAt[0] - nx, s.faceAt[1] - nz);
        s.x = nx; s.z = nz;
      }
    }
    // WAVE 3 (Contract A): every STANDING mark clear of every solid. Raised
    // marks (a `y` or a bench `seat`) are ON their prop and stay put.
    const catBy = (k) => cats.find((c) => c.key === k);
    for (const sc of SCENES) for (const s of sc.slots) {
      if (s.y !== undefined || s.seat || s.x0 !== undefined) continue;
      const c = catBy(s.key);
      const [nx, nz] = resolveSpot(s.x, s.z, 3.2, (c ? c.rad : 0.3) + 0.12);
      s.x0 = s.x; s.z0 = s.z; s.x = nx; s.z = nz;
    }
    // …and a pair still looks at each other: faceAt re-aimed at the partner's
    // resolved mark (faceAt names the partner's authored spot)
    for (const sc of SCENES) for (const s of sc.slots) {
      if (!s.faceAt) continue;
      let fx = s.faceAt[0], fz = s.faceAt[1];
      for (const o of sc.slots) if (o !== s && o.x0 !== undefined && Math.abs(o.x0 - fx) < 0.05 && Math.abs(o.z0 - fz) < 0.05) { fx = o.x; fz = o.z; }
      if (Math.hypot(fx - s.x, fz - s.z) > 1e-3) s.face = Math.atan2(fx - s.x, fz - s.z);
    }
    for (const cat of cats) {
      if (!cat.spec.fixed) {       // Rusty's crate is exactly where his crate is
        const r = cat.rad + 0.12;
        cat.home = resolveSpot(cat.home[0], cat.home[1], 6, r);
        cat.napSpot = resolveSpot(cat.napSpot[0], cat.napSpot[1], 6, r);
        cat.sunSpot = resolveSpot(cat.sunSpot[0], cat.sunSpot[1], 6, r);
      }
      cat.x = cat.home[0]; cat.z = cat.home[1];
      cat.y = cat.seatY ?? floorY(cat.x, cat.z);
      cat.sx = NaN; cat.gy = undefined;
    }
    for (const cat of cats) {
      const e = ctx.systems.interaction.register({
        id: 'cat_' + cat.key, x: cat.x, z: cat.z, r: cat.key === 'rusty' ? 3.8 : cat.spec.crowd ? 2.6 : 3.3,
        label: cat.key === 'rusty' ? 'Talk to Rusty' : `Talk to ${cat.name}`,
        getPos: () => ({ x: cat.x, z: cat.z }),
        onInteract: () => talk(cat),
      });
      cat.entry = e;
      entries.push(e);
    }
    // the cats made your bed up weeks ago; ask containment where it put it
    const bed = ctx.systems.catContainment?.spots?.bed;
    if (bed && Number.isFinite(bed.x)) { GUEST_BED.x = bed.x; GUEST_BED.z = bed.z; }
    // rooftops / sills / benches published by the nature + architecture builders
    const perches = [].concat(ctx.systems.catNature?.perches || [], ctx.systems.catArchitecture?.perches || [])
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && p.x > 0);
    if (perches.length) api.setPerches(perches);
    // settle onto the authored staging so the first render is a scene, not a
    // crowd caught mid-walk
    // the tigers' walkability grid: its terrain pass (~40 ms) is paid here,
    // while the island is still loading, not at the first sundown
    navEnsure();
    snapAll(ctx.state.time);
    const st = api.stats();
    let shadowTris = 0; for (const p of pools) if (p.opts.cast) shadowTris += p.tris;
    console.warn(`[catCitizens] ${st.cats} cats · ${st.calls} draw calls (+${pools.filter((p) => p.opts.cast).length} shadow) · ${st.triangles} tris (${Math.round(st.triangles + shadowTris)} incl. shadow pass)`);
  }
  ctx.events.on('world:ready', boot);
  // last word on where the visitor is: fires after player.js has had its say
  ctx.events.on('camera:update', (cam) => {
    if (T.carrying && T.carrying.stage <= 1) placeCarried(1);
    xray.update(cam || ctx.camera, ctx.systems.player?.position, xrayK());   // this frame's final lens
  });

  // ── grounding + staging helpers ────────────────────────────────────────────
  /** Surface this cat's paws belong on right now (bench seat › perch › floor). */
  function catFloor(cat) {
    const p = cat.plan;
    if (cat.onPerch && cat.perch) return cat.perch.y;
    if (p && p.y !== undefined && Math.hypot(p.x - cat.x, p.z - cat.z) < 1.3) return p.y;
    return floorY(cat.x, cat.z);
  }

  /**
   * Put every cat exactly where its plan says, instantly. Used at boot and
   * whenever the clock is jumped (the render harness sets an hour then steps a
   * couple of seconds — far too little time to walk to a staged mark).
   */
  function snapAll(hour) {
    // a jumped clock lands mid-transformation otherwise: stripes are instant
    const striped = isTigerTime(hour);
    // …but the island still has to be TOLD. Without this, game.setTime(22) made
    // tigers and never fired 'cats:tigers', and containment kept its curfew on.
    if (striped !== T.on) { T.on = striped; ctx.events.emit('cats:tigers', { on: striped }); announceTigers(striped); }
    for (const cat of cats) {
      const want = (striped && !cat.spec.noTiger) ? 1 : 0;
      cat.tigerK = want; cat.yawnUntil = -1; cat.roarUntil = -1; cat.roared = !!want;
      if (!!cat.formed !== !!want) setForm(cat, !!want);
    }
    for (const c of crowd) { c.hideK = striped ? 1 : 0; applyCrowd(c); }
    T.packs.update(0.001);
    const pl0 = groundCore(); if (pl0) lowSync(pl0);
    for (const cat of cats) {
      cat.think = 0; cat.plan = null; cat.talkUntil = -1;
      cat.navHoldUntil = 0; cat.trapT = 0; cat.trapX = NaN; cat.wdX = NaN; cat.touchT = 0; cat.leapT = 0;
      S.snapping = true;
      updateCat(cat, 1 / 60, ctx, S);            // decide
      S.snapping = false;
      const p = cat.plan;
      if (p && p.x !== undefined) {
        cat.x = p.x; cat.z = p.z;
        if (p.face !== undefined) { cat.faceDir = p.face; cat.yaw = p.face; }
        cat.onPerch = !!p.perch;
      }
      // resolve + ground at the mark right now (settle: pushOut, groundInfo)
      cat.kvx = 0; cat.kvz = 0; cat.air = 0; cat.airV = 0; cat.leapT = 0; cat.wedgedUntil = 0;
      cat.giveX = NaN; cat.giveZ = NaN; cat.climbX = NaN; cat.bumpT = 0;
      cat.sx = NaN; cat.gy = undefined; cat.settleT = 0; cat.y = NaN;
      settle(cat, 1 / 60, p);
      if (!Number.isFinite(cat.y)) cat.y = catFloor(cat);
      cat.a = {};                                // pose snaps instead of sliding
      updateCat(cat, 1 / 60, ctx, S);            // pose, at the mark
      cat.pos.set(cat.x, cat.y, cat.z);
      syncShadow(cat);
    }
    if (striped) separateTigers();
    // A jumped clock is somebody arriving in the middle of the night: the way
    // the island treats an arrival (and a visitor put back to bed) — the pack
    // stalks and rings him for a while, but nobody springs yet.
    if (striped) T.graceUntil = Math.max(T.graceUntil, S.elapsed + 12);
    for (const c of crowd) applyCrowd(c);
    for (const p of pools) p.sync();
  }

  // ── THE CROWD ──────────────────────────────────────────────────────────────
  // Background citizens have no tiger. At curfew they go INDOORS — they shrink
  // away in the same two seconds the rest of the island spends growing stripes,
  // which is both ~1,100 triangles each saved and the right answer to "why is
  // Main Street empty at ten o'clock".
  const crowd = cats.filter((c) => c.spec.crowd);
  function applyCrowd(cat) {
    const s = (cat.spec.size ?? 1) * (1 - (cat.hideK || 0));
    cat.rig.root.scale.setScalar(Math.max(s, 1e-4));
    cat.rig.root.updateMatrixWorld(true);
    if (cat.entry) cat.entry.enabled = (cat.hideK || 0) < 0.5;
  }

  /** Soft contact decal, always on the ground under the cat (never on a perch). */
  function syncShadow(cat) {
    const n = cat.rig.shadow; if (!n) return;
    const g = cat.gy ?? floorY(cat.x, cat.z);      // settle's floor: terrain, deck, a low prop's top, a plaza
    const lift = Math.max(0, cat.y - g);
    const k = cat.tigerK || 0;
    const hide = 1 - (cat.hideK || 0);
    const cs = (cat.spec.size ?? 1) * (cat.pose === 'loaf' || cat.pose === 'sleep' || cat.pose === 'sunbathe' ? 1.5 : 1.15) * (1 + lift * 0.28) * hide;
    const T = tigerScale(cat);
    // a tiger's footprint is a long soft oval, not a bigger circle — and after
    // dark it is the only thing standing three hundred kilos of cat on the road
    const w = cs + k * (1.58 * T - cs);
    const l = cs * 0.92 + k * (3.45 * T - cs * 0.92);
    n.position.set(cat.x + Math.sin(cat.yaw) * k * 0.18 * T, g + 0.035, cat.z + Math.cos(cat.yaw) * k * 0.18 * T);
    n.scale.set(w, 1, l);
    n.rotation.y = cat.yaw;
    n.updateMatrix(); n.matrixWorld.copy(n.matrix);
  }

  // ═══ TIGERS ════════════════════════════════════════════════════════════════
  const FUR_PUFF = [0xf2900f, 0xfff4e0, 0x2a2630, 0xe0d8c8];
  function furPuff(cat) {
    ctx.systems.particles?.burst({
      x: cat.x, y: cat.y + 0.85, z: cat.z,
      count: 30, color: FUR_PUFF, speed: 3.6, life: 1.15, size: 0.22, gravity: -2.0, spread: 1.3,
    });
  }

  function announceTigers(on) {
    const ui = ctx.systems.ui;
    if (!ui || ctx.state.island !== 'cat') return;
    if (on) {
      ui.banner('SUNDOWN', 'The citizens are getting bigger.', 4.0, 'cat');
    } else {
      ui.toast('They shrink back, yawn, and open the shops. Nobody mentions it.', 5);
    }
  }

  /** The comic scruff-carry. Not death: bedtime. */
  const carryCard = { handle: null, t: 0 };
  const _mouth = { x: 0, y: 0, z: 0 };
  function startCarry(cat) {
    const pl = ctx.systems.player;
    if (!pl || T.carrying || pl.locked || pl.onFerry || ctx.state.island !== 'cat') return;
    if (ctx.systems.powerups?.active || pl.invulnerable) return;      // stars / i-frames
    T.carrying = { cat, t: 0, stage: 0 };
    cat.carryTo = { x: GUEST_BED.x, z: GUEST_BED.z };
    cat.think = 0;
    pl.locked = true;
    pl.onFerry = true;                  // player.js: "somebody else owns your Y"
    pl.setEmotion?.('scared');
    ctx.systems.ui?.say('“Got you. Come on. Bed.”', { speaker: cat.tiger.full });
    ctx.systems.camera?.shake?.(0.45, 0.5);
    ctx.systems.camera?.cinematic?.({
      target: () => ({ x: cat.x, y: cat.y + 1.45, z: cat.z }),
      distance: 12.0, elevation: 0.34, duration: 5.4, in: 0.7, hold: 4.0, out: 0.7,
    });
    ctx.systems.particles?.burst({
      x: pl.position.x, y: pl.position.y + 1.2, z: pl.position.z,
      count: 24, color: [0xffe9a8, 0xffffff, 0xf2900f], speed: 3.2, life: 0.8, size: 0.19, gravity: -2.4, spread: 1.3,
    });
    ctx.events.emit('cats:caught', { cat, name: cat.tiger.full });
    const st = ctx.systems.story;
    st?.set('carried_home', (st.get('carried_home') || 0) + 1);
  }

  /** Put the visitor in the tiger's jaws. Called late (camera:update) so the
   *  player system's own ground-follow can't put him back on his feet. */
  function placeCarried(k = 1) {
    const C = T.carrying; if (!C) return;
    const pl = ctx.systems.player, cat = C.cat;
    if (!pl) return;
    mouthPoint(cat, _mouth);
    pl.position.set(
      pl.position.x + (_mouth.x - pl.position.x) * k,
      pl.position.y + (_mouth.y - 0.34 - pl.position.y) * k,
      pl.position.z + (_mouth.z - pl.position.z) * k,
    );
    pl.velocity.set(0, 0, 0);
    const g = pl.group;
    if (g) {
      g.position.copy(pl.position);
      g.rotation.y = cat.yaw + Math.PI * 0.5;
      g.rotation.z = 1.28 * k;                       // dangling, dignity elsewhere
      g.rotation.x = Math.sin(ctx.state.elapsed * 6) * 0.10 * k;
    }
  }

  function endCarry() {
    const C = T.carrying; if (!C) return;
    C.cat.carryTo = null; C.cat.think = 0;
    T.carrying = null;
    T.graceUntil = S.elapsed + 45;
    const pl = ctx.systems.player;
    if (pl) {
      pl.onFerry = false; pl.locked = false; pl.setEmotion?.(null);
      const g = pl.group; if (g) { g.rotation.x = 0; g.rotation.z = 0; }
    }
  }

  function updateCarry(dt) {
    const C = T.carrying; if (!C) return;
    C.t += dt;
    const ui = ctx.systems.ui;
    if (C.stage === 0) {
      placeCarried(Math.min(1, dt * 7));
      if (C.t > 0.85) { C.stage = 1; C.t = 0; }
    } else if (C.stage === 1) {
      placeCarried(1);
      const d = Math.hypot(C.cat.x - GUEST_BED.x, C.cat.z - GUEST_BED.z);
      if (C.t > 4.0 || d < 3) {
        C.stage = 2;
        const name = C.cat.tiger;
        const fade = ui?.fade ? ui.fade(true, 1.1) : Promise.resolve();
        fade.then(() => {
          ctx.state.time = 6;
          ctx.events.emit('time:set', 6);
          lastHour = 6;
          endCarry();
          ctx.systems.player?.teleport(GUEST_BED.x + 1.7, GUEST_BED.z + 1.7);
          ctx.systems.player && (ctx.systems.player.locked = true);
          snapAll(6);
          carryCard.handle = ui?.card?.({
            title: `Carried home by ${name.short}. Bedtime.`,
            body: `${name.full} deposited you in the guest bed, straightened the blanket with one enormous paw, and sat outside the door until morning.`,
            buttons: [{ label: 'Sleep. Obviously.', primary: true }],
          }) || null;
          carryCard.t = 7;
          ui?.banner?.('06:00', 'Everyone is a normal size again. Nobody mentions it.', 4.0, 'cat');
          return ui?.fade ? ui.fade(false, 1.2) : Promise.resolve();
        }).then(() => {
          if (ctx.systems.player) ctx.systems.player.locked = false;
        }).catch(() => { endCarry(); });
      }
    }
  }

  // Two lanterns' worth of real light for the night watch (NPC budget = 2).
  const lampLights = [];
  for (let i = 0; i < 2; i++) {
    const L = new THREE.PointLight(0xffb45a, 0, 15, 1.7);
    L.visible = false; group.add(L); lampLights.push(L);
  }
  const lanternCats = cats.filter((c) => c.rig.heldKind === 'lantern');

  // ── per-frame tiger driver ─────────────────────────────────────────────────
  let starT = 0;
  function updateTigers(dt) {
    const on = isTigerTime(ctx.state.time);
    if (on !== T.on) {
      T.on = on;
      if (!on) for (const c of cats) if (c.tigerK > 0.5) c.yawnUntil = S.elapsed + 2.0;
      ctx.events.emit('cats:tigers', { on });
      announceTigers(on);
    }
    T.packs.update(dt);

    // rank the tigers by distance so only the nearest few actually hunt
    const pp = ctx.systems.player?.position;
    if (pp) {
      const live = [];
      for (const c of cats) { c.huntRank = 99; if (c.tigerK > 0.5) live.push(c); }
      live.sort((a, b) => ((a.x - pp.x) ** 2 + (a.z - pp.z) ** 2) - ((b.x - pp.x) ** 2 + (b.z - pp.z) ** 2));
      for (let i = 0; i < live.length; i++) live[i].huntRank = i;
    }

    const rate = dt / MORPH_SECS;
    for (const c of crowd) {
      const want = on ? 1 : 0;
      if (c.hideK === undefined) c.hideK = want;
      if (c.hideK !== want) c.hideK = want > c.hideK ? Math.min(1, c.hideK + rate) : Math.max(0, c.hideK - rate);
    }
    for (const cat of cats) {
      const want = (on && !cat.spec.noTiger) ? 1 : 0;
      if (cat.tigerK !== want) {
        cat.tigerK = want > cat.tigerK ? Math.min(1, cat.tigerK + rate) : Math.max(0, cat.tigerK - rate);
        // the bodies swap at the half-way mark, inside a puff of fur, so you
        // never actually catch one turning into the other
        if ((cat.tigerK > 0.5) !== !!cat.formed) { setForm(cat, cat.tigerK > 0.5); furPuff(cat); cat.think = 0; }
        // and the first thing a brand-new tiger does is tell you about it
        if (cat.tigerK >= 1 && !cat.roared) { cat.roared = true; cat.roarUntil = S.elapsed + 0.9 + cat.seed * 1.1; cat.think = 0; }
        if (cat.tigerK <= 0) { cat.roared = false; cat.roarUntil = -1; }
      }
      // queued reactions: hiss → flee → sulk, stun → back off
      if (cat.fxKind && S.elapsed >= cat.fxUntil) {
        const n = cat.fxThen;
        if (n) {
          cat.fxThen = n.then || null;
          cat.fxKind = n.kind; cat.fxUntil = S.elapsed + n.dur; cat.think = 0;
          if (n.line && S.playerNear(cat, 28)) {
            ctx.systems.ui?.say(n.line, { speaker: cat.tigerK > 0.5 ? cat.tiger.short : `${cat.name} — ${cat.role}` });
          }
        } else { cat.fxKind = null; cat.think = 0; }
      }
    }

    // dizzy stars over anything currently seeing them
    starT -= dt;
    if (starT <= 0) {
      starT = 0.3;
      const fx = ctx.systems.particles;
      const pp = ctx.systems.player?.position;
      if (fx) for (const c of cats) {
        const k = c.fxKind;
        if (!k || !(c.fxUntil > S.elapsed)) continue;
        if (pp && (c.x - pp.x) ** 2 + (c.z - pp.z) ** 2 > 3600) continue;
        const s = (c.spec.size ?? 1) * (1 + c.tigerK * 1.2);
        if (k === 'stun' || k === 'bonk' || k === 'spin') {
          fx.burst({
            x: c.x, y: c.y + (c.air || 0) + 1.7 * s, z: c.z, count: 2, shape: 'sparkle', blend: 'add',
            color: [0xfff0a0, 0xffffff, 0x9fe8ff], speed: 0.9, life: 0.8, size: 0.24, gravity: 0.2, spread: 0.5,
          });
        } else if (k === 'stuck') {           // bubblegum: pink bubbles off the puddle
          fx.burst({
            x: c.x, y: c.y + 0.15, z: c.z, count: 2, color: [0xff7ac8, 0xff9ad6, 0xffc4e6],
            speed: 0.7, life: 0.9, size: 0.2 * s, gravity: 0.5, spread: 0.6 * s,
          });
        } else if (k === 'panic') {           // pop rocks: still fizzing
          fx.burst({
            x: c.x, y: c.y + 0.9 * s, z: c.z, count: 3, shape: 'sparkle', blend: 'add',
            color: [0xff3f9a, 0x5fd8ff, 0xffe23a], speed: 2.2, life: 0.4, size: 0.14, gravity: -1, spread: 0.5 * s,
          });
        }
      }
    }
    updateCarry(dt);
    if (carryCard.t > 0 && (carryCard.t -= dt) <= 0) { carryCard.handle?.close?.(); carryCard.handle = null; }
  }

  // ═══ WAVE 3: STARS (Contract B) + the new arsenal (Contract C) ═════════════
  const STAR_R = 16;                               // flee radius round a starry visitor
  const PUFF = [0xfff4c8, 0xffffff, 0xffe070, 0xff9ad0];
  /** A reaction with a follow-up chain (see updateTigers' queued reactions). */
  function react(c, kind, dur, then, src) {
    c.fxKind = kind; c.fxUntil = S.elapsed + dur; c.fxThen = then || null;
    c.think = 0; c.talkUntil = -1;
    if (src) { c.fxX = src.x; c.fxZ = src.z; }
  }
  /** powerups.active: run from the visitor; touch him and bounce 6 u, puff. */
  function starReact(c, d2, p) {
    if ((c.hideK || 0) >= 0.5 || c.carryTo || c.spec.fixed) return;   // Rusty stays on his crate
    if (d2 > STAR_R * STAR_R) return;
    const now = S.elapsed;
    const k = c.fxKind, busy = c.fxUntil > now && (k === 'stuck' || k === 'stun' || k === 'spin' || k === 'bonk');
    if (!busy) {
      if (k !== 'scared' || !(c.fxUntil > now)) { c.think = 0; c.talkUntil = -1; }
      c.fxKind = 'scared'; c.fxUntil = Math.max(c.fxUntil > now ? c.fxUntil : 0, now + 0.8); c.fxThen = null;
    }
    c.fxX = p.x; c.fxZ = p.z;
    const rr = bodyR(c) + 0.36 + 0.3;
    if (d2 < rr * rr && now >= (c.bounceAt || 0)) {
      const d = Math.sqrt(d2);
      let ux = d > 1e-4 ? (c.x - p.x) / d : Math.sin(c.yaw), uz = d > 1e-4 ? (c.z - p.z) / d : Math.cos(c.yaw);
      kick(c, ux, uz, 6, c.tigerK > 0.5 ? 0.6 : 1.1);
      c.bounceAt = now + 0.9;
      ctx.systems.particles?.burst({
        x: c.x, y: c.y + 0.7, z: c.z, count: 22, color: PUFF, speed: 3.4, life: 0.8, size: 0.26, gravity: -1.6, spread: 0.9,
      });
      ctx.systems.camera?.shake?.(0.12, 0.15);
      ctx.events.emit('cat:hit', { cat: c, weapon: 'star', effect: 'bounce' });
    }
  }

  /** Contract C canonical hit names → what happens. Returns null if not ours. */
  const WAVE3 = new Set(['cannon', 'whip', 'poprocks', 'gum', 'marshmallow', 'boomerang', 'water']);
  function hitWave3(cat, w, power, src, tiger, head) {
    const fx = ctx.systems.particles;
    const a = Math.atan2(cat.x - src.x, cat.z - src.z);
    const ux = Math.sin(a), uz = Math.cos(a);
    const pk = clamp(0.75 + power * 0.12, 0.75, 1.35);
    const who = cat.tigerK > 0.5 ? cat.tiger.short : `${cat.name} — ${cat.role}`;
    const sulk = (dur, line) => ({ kind: 'sulk', dur, line });
    let effect = 'startled', secs = 1, kb = 0;
    switch (w) {
      case 'cannon': {                    // big knockback + dizzy
        kb = (tiger ? 2.2 : 4.2) * pk;
        kick(cat, ux, uz, kb, tiger ? 0.35 : 0.9);
        react(cat, 'stun', 3.2, tiger ? { kind: 'flinch', dur: 4 } : { kind: 'flee', dur: 4, then: sulk(5, 'I have been CANNONED.') }, src);
        fx?.burst({ x: cat.x, y: head, z: cat.z, count: 16, color: [0xff3b6b, 0xffffff, 0xff9ac0], speed: 3.6, life: 0.7, size: 0.22, gravity: -4, spread: 0.8 });
        ctx.systems.camera?.shake?.(0.26, 0.25);
        effect = 'knockback-dizzy'; secs = 3.2; break;
      }
      case 'whip': {                      // stagger
        kb = (tiger ? 0.45 : 0.9) * pk;
        kick(cat, ux, uz, kb, 0);
        react(cat, 'stagger', 1.1, tiger ? { kind: 'flinch', dur: 3 }
          : { kind: 'hiss', dur: 0.6, then: { kind: 'flee', dur: 3, then: sulk(4, 'That STUNG.') } }, src);
        fx?.burst({ x: cat.x, y: head, z: cat.z, count: 8, shape: 'sparkle', blend: 'add', color: [0xff2a4a, 0xffffff], speed: 2.4, life: 0.35, size: 0.2, gravity: 0, spread: 0.5 });
        effect = 'stagger'; secs = 1.1; break;
      }
      case 'poprocks': {                  // fizz panic scatter
        kb = 0.5; kick(cat, ux, uz, kb, 0.25);
        react(cat, 'panic', 3.5, tiger ? { kind: 'flinch', dur: 2 } : sulk(4, 'My fur is FIZZING.'), src);
        fx?.burst({ x: cat.x, y: cat.y + 0.8, z: cat.z, count: 18, shape: 'sparkle', blend: 'add', color: [0xff3f9a, 0x5fd8ff, 0xffe23a, 0xff5fb0], speed: 3.2, life: 0.5, size: 0.16, gravity: -2, spread: 0.8 });
        effect = 'panic'; secs = 3.5; break;
      }
      case 'gum': {                       // stuck 4 s
        cat.kvx = 0; cat.kvz = 0;
        react(cat, 'stuck', 4, tiger ? { kind: 'flinch', dur: 3 } : { kind: 'hiss', dur: 0.7, then: sulk(4, 'This is my GOOD coat.') }, src);
        fx?.burst({ x: cat.x, y: cat.y + 0.1, z: cat.z, count: 18, color: [0xff5fb8, 0xff9ad6, 0xffc4e6], speed: 1.6, life: 1.0, size: 0.26, gravity: -3, spread: 0.9 });
        effect = 'stuck'; secs = 4; break;
      }
      case 'marshmallow': {               // bonk + bounce
        kb = (tiger ? 0.9 : 1.6) * pk;
        kick(cat, ux, uz, kb, tiger ? 0.5 : 1.1);
        react(cat, 'bonk', 1.3, tiger ? { kind: 'flinch', dur: 3 } : sulk(4, 'Soft. Still rude.'), src);
        fx?.burst({ x: cat.x, y: head, z: cat.z, count: 12, color: [0xffffff, 0xfff4e8, 0xcfe8ff], speed: 2.2, life: 0.6, size: 0.24, gravity: -2, spread: 0.6 });
        effect = 'bonk'; secs = 1.3; break;
      }
      case 'boomerang': {                 // spin
        kb = 0.4; kick(cat, ux, uz, kb, 0);
        react(cat, 'spin', 1.4, { kind: 'stun', dur: 1.2, then: tiger ? { kind: 'flinch', dur: 3 } : sulk(3.5, '...which way is UP.') }, src);
        fx?.burst({ x: cat.x, y: head, z: cat.z, count: 10, shape: 'sparkle', blend: 'add', color: [0xff3048, 0xffffff, 0x7fe0a0], speed: 2.6, life: 0.5, size: 0.2, gravity: 0, spread: 0.6 });
        effect = 'spin'; secs = 2.6; break;
      }
      case 'water': {                     // cats AND tigers hate it: flee 8 s
        fx?.burst({ x: cat.x, y: head, z: cat.z, count: 20, color: [0x2f9bff, 0x9fd8ff, 0xffffff], speed: 3.0, life: 0.6, size: 0.18, gravity: -6, spread: 0.9 });
        if (tiger) react(cat, 'flee', 8, null, src);
        else react(cat, 'hiss', 0.5, { kind: 'flee', dur: 8, then: sulk(5, 'WET. I am WET.') }, src);
        if (S.playerNear(cat, 26)) ctx.systems.ui?.say(tiger ? 'Three hundred kilos of tiger discovers it is afraid of a balloon.' : 'MRRROW— NO. NO. NO.', { speaker: who });
        effect = 'flee'; secs = 8; break;
      }
    }
    ctx.events.emit('cat:hit', { cat, weapon: w, effect });
    return { ok: true, effect, secs, knockback: kb, backOff: tiger && (w === 'water' || w === 'cannon') ? 10 : 0 };
  }

  /** Accept a cat reference in any of the shapes a weapon system might have. */
  function resolveCat(ref) {
    if (ref == null) return null;
    if (typeof ref === 'string') return cats.find((c) => c.key === ref || c.name === ref) || null;
    if (typeof ref === 'number') return cats[ref] || null;
    if (typeof ref !== 'object') return null;
    if (ref.key && ref.rig) return ref;
    if (ref.cat) return resolveCat(ref.cat);
    if (ref.key) return cats.find((c) => c.key === ref.key) || null;
    if (Number.isFinite(ref.x) && Number.isFinite(ref.z)) {
      const n = api.nearest(ref.x, ref.z);
      return n && Math.hypot(n.x - ref.x, n.z - ref.z) < 4 ? n : null;
    }
    return null;
  }

  // ── update ─────────────────────────────────────────────────────────────────
  let noteT = 0, zT = 0, lastHour = null;
  const api = {
    group, cats, pools: lib.pools, materials: lib.materials,
    get count() { return cats.length; },
    byKey: (k) => cats.find((c) => c.key === k),
    nearest(x, z) { let b = null, bd = Infinity; for (const c of cats) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; b = c; } } return b; },
    /**
     * Rooftops / windowsills / benches the noon sunbathers should lie on.
     * Each sunbather claims the nearest unclaimed perch to their home; anyone
     * without one in range keeps their ground-level sunny spot.
     */
    setPerches(list) {
      const PREF = { rock: 0, bench: 0, ledge: 0, sill: 0, roof: 0, stack: 260, post: 620 };
      const taken = new Set();
      for (const c of cats.filter((k) => k.tags.sunbather)) {
        let best = -1, bd = 34 * 34;
        for (let i = 0; i < list.length; i++) {
          if (taken.has(i)) continue;
          const d = (list[i].x - c.home[0]) ** 2 + (list[i].z - c.home[1]) ** 2 + (PREF[list[i].kind] ?? 200);
          if (d < bd) { bd = d; best = i; }
        }
        if (best >= 0) { taken.add(best); c.perch = list[best]; c.sunSpot = [list[best].x, list[best].z]; }
      }
    },
    stats() {
      let tris = 0, calls = 0;
      for (const p of pools) { tris += p.tris; calls++; }
      return {
        cats: cats.length, calls: calls + hideout.calls, triangles: Math.round(tris + hideout.tris),
        tigers: cats.filter((c) => c.tigerK > 0.5).length,
        traps: RES.traps, leaps: RES.leaps, wedges: RES.wedges, detours: RES.detours,   // tiger resolver events since boot
        relocs: RES.relocs, stuck: RES.stuck, holds: RES.holds,
        // frames in which a tiger the resolver could not fit was left > 0.15 u
        // inside a solid / a too-tall LOW prop (check b: should stay 0)
        clipFrames: RES.clipFrames, clipMax: +RES.clipMax.toFixed(3),
        nav: nav ? { ...nav.stats, buildMs: +nav.stats.buildMs.toFixed(1), landMs: +nav.stats.landMs.toFixed(1), bfsMs: +nav.stats.bfsMs.toFixed(2) } : null,
        lowBlockers: LOWG.byC.size,
        // tiger-tiger capsule shoves since boot, the grace clock, the x-ray
        events: { ...RES.kinds }, shoves: SEPN, graceLeft: +Math.max(0, T.graceUntil - S.elapsed).toFixed(1),
        xray: { ...xray.stats, k: +xray.uniforms.uNpcR.value.z.toFixed(2) },
        resLog: RES.log.slice(),
      };
    },

    // ═══ WAVE 2 API ══════════════════════════════════════════════════════════
    /** True while the citizens are tigers (20:00 – 05:30). Containment asks us
     *  this before starting the lantern-cat curfew: you cannot be politely
     *  escorted home by something that is already carrying you there. */
    isTigerTime: () => isTigerTime(ctx.state.time),
    /** Debug (probes): the tigers' walkability grid (citizens/nav.js), or null. */
    get nav() { return nav; },
    /** Debug (probes): the NPC x-ray (citizens/xray.js) — uniforms, stats. */
    get xray() { return xray; },
    /** Debug (probes): does collider c stop a tiger (what the nav grid stamps)? */
    navBlocks: (c) => navBlocker(c),
    get navCounts() { return NAVC; },
    get tigerTime() { return isTigerTime(ctx.state.time); },
    /** The tiger that currently has you, or null. */
    get carrier() { return T.carrying ? T.carrying.cat : null; },
    /** Every citizen currently wearing stripes, with both names. */
    get tigers() {
      return cats.filter((c) => c.tigerK > 0.5).map((c) => ({ key: c.key, name: c.tiger.full, x: c.x, z: c.z }));
    },
    /** Candy Rusty has been paid, total. */
    get helperCandy() { return R.given; },

    /**
     * CONTRACT A verifier hook: every walking NPC this system draws (hidden
     * crowd cats are indoors and left out). One record per body:
     *   x, y, z  feet (y is what the rig stands on)
     *   r        the circle settle() keeps out of every SOLID collider
     *   kind     'cat' | 'shopkeeper' | 'tiger'
     *   on       'ground' | 'prop' (a low prop's top) | 'seat' (an authored raised
     *            mark: bench slat, gym deck / bench pad, Rusty's crate) | 'perch'
     *   ground   the floor used (groundInfo.h, or a plaza paving disc the ground
     *            core does not know yet — see syncDiscs)
     *   gh       groundInfo(x,z).h itself
     *   head     tigers: the head circle {x,z,r} (0.95 T ahead of the centre, r 0.45 T)
     *   rear     tigers: the hindquarter circle {x,z,r} (0.6 T behind, r 0.42 T)
     *            — all three of a tiger's circles are kept out of every SOLID
     *   leaping  true for the 0.45 s a trapped tiger bounds out of a pocket
     *            (airborne on a probed straight line; circles not resolved)
     */
    debugPositions() {
      const out = [];
      for (const c of cats) {
        if ((c.hideK || 0) >= 0.5) continue;
        const tiger = c.tigerK > 0.5;
        const kind = tiger ? 'tiger' : (c.sched === 'shopkeep' || c.sched === 'clerk') ? 'shopkeeper' : 'cat';
        const on = c.onPerch ? 'perch' : c.mounted ? 'seat' : c.onProp ? 'prop' : 'ground';
        const e = { x: c.x, y: c.y, z: c.z, r: bodyR(c), kind, key: c.key, on, ground: c.gy, gh: c.gh };
        if (c.leapT > 0) e.leaping = true;          // mid-pounce out of a pocket: airborne, not resolved
        if (tiger) {
          const T = tigerScale(c), sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
          e.head = { x: c.x + sy * HEAD_FWD * T, z: c.z + cy * HEAD_FWD * T, r: HEAD_R * T };
          e.rear = { x: c.x - sy * REAR_BACK * T, z: c.z - cy * REAR_BACK * T, r: REAR_R * T };
        }
        out.push(e);
      }
      return out;
    },

    /**
     * WEAPONS CONTRACT — ctx.systems.weapons calls this.
     *   hit(catRef, { weapon, power, from:{x,z}, kind })
     * catRef may be one of our cat objects, a key, an index or a {x,z}.
     * Unknown weapons never throw: the cat simply notices you and hisses.
     * Returns { ok, effect }.
     */
    hit(catRef, opt) {
      try {
        const o = opt || {};
        const cat = resolveCat(catRef);
        if (!cat) return { ok: false, effect: 'none', reason: 'unknown cat' };
        const w = String(o.weapon ?? '').toLowerCase();
        const kind = String(o.kind ?? '').toLowerCase();
        const power = Number.isFinite(o.power) ? clamp(o.power, 0, 5) : 1;
        const src = (o.from && Number.isFinite(o.from.x)) ? o.from : (ctx.systems.player?.position || { x: cat.x, z: cat.z + 1 });
        const spray = kind === 'spray' || /spray|spritz|lemon|squirt|water|mist|bottle|hose/.test(w);
        const fire = kind === 'fire' || /fire|flame|heat|caramel|torch|burn|blow/.test(w);
        const blunt = fire || kind === 'melee' || kind === 'throw' || /bat|hammer|club|salt|shaker|gumball|sling|pebble|rock|ball|broom/.test(w);
        const tiger = cat.tigerK > 0.5;
        const now = S.elapsed;
        const fx = ctx.systems.particles;
        cat.fxX = src.x; cat.fxZ = src.z; cat.think = 0; cat.talkUntil = -1;
        const head = cat.y + (tiger ? tigerBackY(cat) * 0.95 : 1.5 * (cat.spec.size ?? 1));

        // wave 3 canonical names first ('water' is not a spray, 'poprocks' is not a rock)
        if (WAVE3.has(w)) return hitWave3(cat, w, power, src, tiger, head);

        if (spray) {
          fx?.burst({
            x: cat.x, y: head, z: cat.z, count: 14, color: [0xdff4ff, 0xffffff, 0xfff3a0],
            speed: 2.6, life: 0.55, size: 0.13, gravity: -5, spread: 0.7,
          });
          if (tiger) {
            cat.fxKind = 'flinch'; cat.fxUntil = now + 4; cat.fxThen = null;
            ctx.events.emit('cat:hit', { cat, weapon: w, effect: 'tiger-flinch' });
            if (S.playerNear(cat, 26)) ctx.systems.ui?.say('It recoils, enormous and embarrassed, and backs into the dark.', { speaker: cat.tiger.short });
            return { ok: true, effect: 'flinch', backOff: 10, secs: 4 };
          }
          cat.fxKind = 'hiss'; cat.fxUntil = now + 0.85;
          cat.fxThen = { kind: 'flee', dur: 6 + rand() * 4, then: { kind: 'sulk', dur: 5.5, line: '...rude.' } };
          ctx.events.emit('cat:hit', { cat, weapon: w, effect: 'flee' });
          return { ok: true, effect: 'flee', secs: cat.fxThen.dur };
        }

        if (blunt) {
          // The Caramelizer burns props to ash; a cat it catches is only ever
          // singed, extremely offended, and much further away than it was.
          const kb = clamp(0.55 + power * 0.45, 0.5, 1.9) * (tiger ? 0.45 : 1) * (fire ? 1.6 : 1);
          const a = Math.atan2(cat.x - src.x, cat.z - src.z);
          kick(cat, Math.sin(a), Math.cos(a), kb, 0);   // slid (and resolved) by settle()
          if (fire) fx?.burst({
            x: cat.x, y: head, z: cat.z, count: 14, blend: 'add',
            color: [0xffd27a, 0xff8a3c, 0x6a5a56], speed: 2.0, life: 1.1, size: 0.3, gravity: 1.6, spread: 0.8,
          });
          fx?.burst({
            x: cat.x, y: head, z: cat.z, count: 10, shape: 'sparkle', blend: 'add',
            color: [0xfff0a0, 0xffffff, 0x9fe8ff], speed: 2.4, life: 0.7, size: 0.26, gravity: 0.4, spread: 0.6,
          });
          ctx.systems.camera?.shake?.(0.18, 0.2);
          cat.fxKind = 'stun'; cat.fxUntil = now + 3;
          cat.fxThen = tiger
            ? { kind: 'flinch', dur: 4 }
            : { kind: 'flee', dur: fire ? 7 : 0.01, then: { kind: 'sulk', dur: 5, line: fire ? 'my WHISKERS.' : '...rude.' } };
          ctx.events.emit('cat:hit', { cat, weapon: w, effect: 'stun' });
          return { ok: true, effect: 'stun', secs: 3, knockback: kb, backOff: tiger ? 10 : 0 };
        }

        // something we have never heard of. Do not throw; do react.
        cat.fxKind = 'hiss'; cat.fxUntil = now + 0.8; cat.fxThen = null;
        ctx.events.emit('cat:hit', { cat, weapon: w, effect: 'startled' });
        return { ok: true, effect: 'startled' };
      } catch (err) {
        return { ok: false, effect: 'none', reason: String(err && err.message || err) };
      }
    },
    update(dt, ctx) {
      const player = ctx.systems.player?.position;
      if (!player) return;
      if (!booted) boot();
      // Cheap island gate: the cats only exist for the camera when Cat Island
      // (or its shoreline) is in view. Saves ~29 calls / ~70k tris elsewhere.
      const show = ctx.camera.position.x > -60 || player.x > -60;
      if (group.visible !== show) group.visible = show;
      if (!show) return;

      S.elapsed = ctx.state.elapsed;
      S.frame++;
      { const pl0 = groundCore(); if (pl0) lowSync(pl0); }
      // A jumped clock (debug / render harness) re-stages the whole island in
      // one frame; normal play moves ~0.08 h per second and never trips this.
      const hour = ctx.state.time;
      if (lastHour === null || Math.abs(hour - lastHour) > 0.25) { lastHour = hour; snapAll(hour); }
      lastHour = hour;
      // one shared moving hub keeps the kittens swirling instead of milling
      // (the ring the kittens run round it has to be clear: a bench across it
      //  is now a bench, not a shortcut — up to 4 tries, first clear ring wins)
      S.kittenT -= dt;
      if (S.kittenT <= 0) {
        S.kittenT = 3.5 + rand() * 4;
        const lm = world.LANDMARKS.cat_park;
        let best = -1;
        for (let t = 0; t < 4 && best < 10; t++) {
          const a = rand() * Math.PI * 2, r = 3 + rand() * 12;
          const [hx, hz] = resolveSpot(lm.x + Math.cos(a) * r, lm.z + Math.sin(a) * r, 5);
          let free = 0;
          for (let k = 0; k < 5; k++) {
            const q = (k / 5) * Math.PI * 2;
            if (spotFree(hx + Math.cos(q) * 2.8, hz + Math.sin(q) * 2.8, 0.3)) free++;
            if (spotFree(hx + Math.cos(q + 0.6) * 4.3, hz + Math.sin(q + 0.6) * 4.3, 0.3)) free++;
          }
          if (free > best) { best = free; S.kittenHub.x = hx; S.kittenHub.z = hz; }
        }
      }

      discT -= dt; if (discT <= 0) { discT = 6; syncDiscs(); }
      updateTigers(dt);
      // tigers apart FIRST: each one's settle() (inside updateCat) then resolves
      // whatever separation shoved against the walls before it is drawn
      if (T.on) separateTigers();

      // Contract B: a visitor who is currently a STAR sends everyone running,
      // and nobody catches him (nor mid-dodge-roll, i-frames are i-frames)
      const star = !!ctx.systems.powerups?.active;
      const safe = star || !!ctx.systems.player?.invulnerable;
      for (const cat of cats) {
        const d2 = (cat.x - player.x) ** 2 + (cat.z - player.z) ** 2;
        cat.lookAt = d2 < 225 ? player : null;
        cat.nearCam = d2 < 4900;
        if (star) starReact(cat, d2, player);
        updateCat(cat, dt, ctx, S);           // decide → move → settle (pushOut + ground) → pose
        // a kitten that keeps running into the same bench: the game moves on
        if (cat.sched === 'kitten' && cat.bumpT > 1.5 && S.kittenT > 0.5) { S.kittenT = 0; cat.bumpT = 0; }
        cat.pos.set(cat.x, cat.y, cat.z);
        syncShadow(cat);
        // close enough, and it meant it
        if (cat.plan && cat.plan.catch && !T.carrying && d2 < 5.0 && S.elapsed > T.graceUntil && !safe) startCarry(cat);
      }
      for (const c of crowd) applyCrowd(c);
      breatheSills(sillLoaves, ctx.state.elapsed);
      for (const p of pools) p.sync();
      // the x-ray, for a lens nobody moves this frame (a free / debug view: the
      // camera's own update, and its camera:update, only run for the game lens)
      if (ctx.systems.camera?.isFree?.() || !ctx.systems.camera) { ctx.camera.updateMatrixWorld(); xray.update(ctx.camera, player, xrayK()); }

      // night: eyes catch the light; the watch's lanterns burn
      const night = 1 - ctx.state.daylight;
      const striped = T.on ? 1 : 0;
      lib.materials.eyeMat.emissiveIntensity = night * (1.35 + striped * 1.9);
      lib.materials.glowMat.emissiveIntensity = 0.18 + night * 2.2;
      // Contact shadows stay ON after dark. They used to fade to 0.08 — which
      // left every tiger hovering an inch above Main Street with nothing
      // holding it down — so they now only soften, never leave.
      lib.materials.blobMat.opacity = 0.25 + ctx.state.daylight * 0.11;
      // a tiger is the same value as wet cobbles: give it a warm rim and a
      // breath of emissive so the silhouette survives the night
      const tf = lib.materials.tigerFurMat;
      if (tf) { tf.emissiveIntensity = 0.06 + night * 0.20; if (tf.userData.rim) tf.userData.rim.value = 0.05 + night * 0.55; }
      // the window loaves are backlit by their own room
      const sm = lib.materials.sillMat;
      if (sm) sm.emissiveIntensity = 0.05 + night * 1.05;
      if (hideout.glow) hideout.glow.material.emissiveIntensity = 0.25 + night * 1.9;
      // two real point lights. Before 20:00 they ride the watch's lanterns;
      // after that there are no lanterns, only tigers, so the light pools
      // around the two nearest ones and their eyes do the rest.
      if (night > 0.12) {
        const src = striped
          ? cats.filter((c) => c.tigerK > 0.5)
          : lanternCats;
        const carriers = src.sort((a, b) =>
          ((a.x - player.x) ** 2 + (a.z - player.z) ** 2) - ((b.x - player.x) ** 2 + (b.z - player.z) ** 2));
        for (let i = 0; i < lampLights.length; i++) {
          const c = carriers[i], L = lampLights[i];
          if (c && (c.x - player.x) ** 2 + (c.z - player.z) ** 2 < 3600) {
            if (striped) {
              const sc = tigerScale(c);
              L.color.setHex(0xffa64a);
              L.position.set(c.x + Math.sin(c.yaw) * 1.5 * sc, c.y + tigerBackY(c) * 0.95, c.z + Math.cos(c.yaw) * 1.5 * sc);
              L.intensity = night * 6;
            } else {
              L.color.setHex(0xffb45a);
              L.position.set(c.x + Math.sin(c.yaw + 1.3) * 0.34, c.y + 0.92 * (c.spec.size ?? 1), c.z + Math.cos(c.yaw + 1.3) * 0.34);
              L.intensity = night * 17;
            }
            L.visible = true;
          } else { L.visible = false; L.intensity = 0; }
        }
      } else for (const L of lampLights) { L.visible = false; L.intensity = 0; }

      // ambient flourishes (cheap, via the shared particle system)
      const fx = ctx.systems.particles;
      if (fx) {
        noteT -= dt;
        if (noteT <= 0) {
          noteT = 0.42;
          const pip = api.byKey('pip');
          if (pip && pip.pose === 'fiddle' && (pip.x - player.x) ** 2 + (pip.z - player.z) ** 2 < 3600) {
            fx.burst({ x: pip.x + 0.3, y: pip.y + 1.5, z: pip.z + 0.25, count: 2, color: [0xfff0b0, 0xb9e8ff, 0xffc0d8], speed: 0.8, life: 1.4, size: 0.16, gravity: 0.6, spread: 0.25 });
          }
        }
        zT -= dt;
        if (zT <= 0) {
          zT = 1.1;
          for (const c of cats) {
            const near = (c.x - player.x) ** 2 + (c.z - player.z) ** 2 < 2500;
            if ((c.pose === 'sleep' || c.pose === 'loaf') && near && rand() < 0.35) {
              fx.burst({ x: c.x, y: c.y + 0.75, z: c.z, count: 1, color: [0xdff0ff, 0xffffff], speed: 0.35, life: 1.8, size: 0.15, gravity: 0.35, spread: 0.15 });
            }
            // the catnip bed: little green motes coming off a cat that is having
            // a much better afternoon than you are
            if (c.pose === 'nip' && near) {
              fx.burst({
                x: c.x, y: c.y + 0.55, z: c.z, count: 2, shape: 'sparkle', blend: 'add',
                color: [0xa8e06a, 0xd8f2a0, 0xffffff], speed: 0.55, life: 1.5, size: 0.13, gravity: 0.45, spread: 0.35,
              });
            }
          }
        }
      }

      // If no other system has claimed the arrival, record it once the player
      // is actually standing on Cat Island (our lines read it).
      const story = ctx.systems.story;
      if (story && !story.get('arrived_cat') && ctx.state.island === 'cat') story.set('arrived_cat', true);
    },
  };

  return api;
}
