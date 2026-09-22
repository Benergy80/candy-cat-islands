// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KIDS — Candyland's residents.
//
// 24 sugar-coated gummy children. By day each one has a JOB and its own pose:
// five play tag across the plaza (running lean, arms pumping overhead), four
// dance round the sugar fountain (bouncing, arms up, hips swinging), four
// sunbathe flat on their backs with one leg crossed and their eyes shut —
// three on the rise above Sugar Pier and one in the middle of the village
// green, in everyone's way — one licks the smallest lollipop, two kick their
// legs on the Great Cupcake steps, three follow you at a polite distance with
// their hands behind their backs, and the rest wander the licorice.
// At 18:30 every one of them FREEZES mid-pose, turns to face you exactly and
// tilts its head — all of them, the same way, for three seconds. Then they go
// indoors. After 19:30 they come back out hunched, with the lights off in their
// heads, and hunt you. Three of them touching you is dinner. They will not
// cross the salt line at Sugar Pier; they will stand at it and paw.
//
// WAVE 2 — they can be fought back. api.hit(kidRef, { weapon, power, from, kind })
// dissolves them (salt), melts them (spray), punts them (bat/hammer), stuns them
// (gumball) or makes them flinch (anything else); see sourpatch/hit.js. Hit a
// hunter twice inside ten seconds and it gives up and goes home for the night.
// Salt on the ground (ctx.systems.weapons.saltPatches) is a wall they will not
// cross; ring yourself in it and they pace the edge complaining. Holding a
// weapon by day makes them keep their distance and taunt you for it.
//
// Measured (A/B with the rig AND props hidden, at the game camera): 9 draw
// calls / 32.0k tris by day, 13 / 35.3k at night, 14 / 37.3k during the dusk
// beat. Budget is 40 calls / 60k tris.
// Kids never leave Candyland: every position test goes through onCandy().
// Exposes: api.kids [{pos, color, name, state}], api.getMood(), api.phase,
//          api.hit(kidRef, opts) → result|false, api.stomp(x,z,r), api.stats()
// Events:  'sourpatch:phase' { phase, prev }, 'sourpatch:eaten' { x, z },
//          'sourpatch:hit' { i, name, weapon, kind, reaction, gaveUp },
//          'sourpatch:dissolved' / ':respawn' / ':bonk' / ':gaveup' / ':stomped'
// Listens: 'player:stomp' { x, z, r }
// Views:   tools/views/sourpatch.json
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, hash, damp, clamp, lerp, smoothstep } from '../../core/util.js';
import { CANDY } from '../../core/palette.js';
import { createRig } from './sourpatch/body.js';
import { createProps } from './sourpatch/props.js';
import { createEaten } from './sourpatch/eaten.js';
import { createHits } from './sourpatch/hit.js';
import { createSaltField } from './sourpatch/salt.js';
import * as V from './sourpatch/lines.js';

const N = 24;
const SAFE_R = 14;            // Sugar Pier: they will not cross the salt
const HUNT_GRACE = 6.0;       // seconds of dread before they may commit
const RING_R = 10;
const BODY_R = 0.6;           // a kid's own footprint — props push this hard
const ARMED_GAP = 2.0;        // extra metres of personal space when you're holding something
const ARMED_RING = 2.5;       // extra circling radius at night when you're holding something

// scratch
const _gp = new THREE.Vector3();
const _sun = new THREE.Vector3(0.3, 0.8, 0.5);
const _glint = {};            // reused burst options bag: never allocate per frame

export function create(ctx) {
  const { world, events } = ctx;
  const L = world.LANDMARKS;
  const VILLAGE = L.candy_village, DOCK = L.candy_dock, MEADOW = L.lollipop_meadow;
  const CUPCAKE = L.giant_cupcake, SHRINE = L.sour_shrine;
  const rand = rng(hash('sourpatch'));

  // Salt the player has thrown on the ground (weapons system). Read live every
  // frame; to a kid each patch is a wall, not a hazard — they never walk in.
  const salt = createSaltField(ctx);

  const groundY = (x, z) => Math.max(0.05, world.height(x, z));
  // CONTAINMENT: Sour Patch Kids belong to Candyland and may never appear on Cat
  // Island — they used to spawn around the player at night and steal Cat
  // Island's interaction prompt. Every position test goes through onCandy().
  const onCandy = (x, z) => x < 0 && world.islandAt(x, z) === 'candy';
  const landOK = (x, z) => world.height(x, z) > 0.35 && onCandy(x, z);
  const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const angDamp = (cur, tgt, l, dt) => {
    let d = tgt - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
    return cur + d * (1 - Math.exp(-l * dt));
  };

  // ── solid props (houses, fountains, lamp poles, fences, giant sweets) ──────
  // Bucketed once at world:ready so 24 kids can dodge 1000+ colliders cheaply.
  // Everything below treats a collider as (r + BODY_R): critique r1 had them
  // standing inside lamp poles and picket fences because the old test shrank
  // the radius to 0.8r instead of growing it by the kid's own width.
  const CELL = 10, cellMap = new Map();
  const cellKey = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  function buildColliderGrid() {
    cellMap.clear();
    for (const c of ctx.colliders || []) {
      if (c.x > 0 || c.r < 0.16) continue;                 // candy island, real obstacles only
      const rc = Math.ceil((c.r + BODY_R + 0.5) / CELL);
      const cx = Math.floor(c.x / CELL), cz = Math.floor(c.z / CELL);
      for (let a = -rc; a <= rc; a++) for (let b = -rc; b <= rc; b++) {
        const k = `${cx + a},${cz + b}`;
        if (!cellMap.has(k)) cellMap.set(k, []);
        cellMap.get(k).push(c);
      }
    }
  }
  function blocked(x, z, pad = BODY_R) {
    const cell = cellMap.get(cellKey(x, z)); if (!cell) return null;
    for (const c of cell) { const r = c.r + pad; if ((x - c.x) ** 2 + (z - c.z) ** 2 < r * r) return c; }
    return null;
  }
  function pushOutOfProps(k) {
    const cell = cellMap.get(cellKey(k.x, k.z)); if (!cell) return;
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (const c of cell) {
        const dx = k.x - c.x, dz = k.z - c.z, d2 = dx * dx + dz * dz, r = c.r + BODY_R;
        if (d2 < r * r) {
          const d = Math.sqrt(d2);
          if (d > 1e-4) { k.x = c.x + dx / d * r; k.z = c.z + dz / d * r; }
          else { k.x = c.x + r; }
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
  /** Nearest spot that is open ground AND clear of every prop. null if none. */
  function freeSpot(x, z, o = {}) {
    const pad = o.pad ?? BODY_R, pathMargin = o.pathMargin ?? 1.2;
    const minHeight = o.minHeight ?? 0.6, avoidLandmarks = o.avoidLandmarks ?? false;
    for (const rr of o.rings || [0, 1.3, 2.4, 3.6, 5.2, 7.2, 9.5]) {
      const steps = rr === 0 ? 1 : 12;
      for (let a = 0; a < steps; a++) {
        const ang = (a / steps) * Math.PI * 2 + rr * 0.7;
        const nx = x + Math.cos(ang) * rr, nz = z + Math.sin(ang) * rr;
        if (!onCandy(nx, nz)) continue;
        if (!world.isFreeGround(nx, nz, { pathMargin, avoidLandmarks, minHeight })) continue;
        if (blocked(nx, nz, pad)) continue;
        if (salt.blocked(nx, nz)) continue;
        return { x: nx, z: nz };
      }
    }
    return null;
  }

  // ── places ─────────────────────────────────────────────────────────────────
  // sunbathing spots: real ground just past the salt line, on the rise above
  // Sugar Pier, where anyone walking up from the ferry sees them lying there.
  const beach = [];
  {
    const cand = [];
    for (let x = -70; x <= -38; x += 1.2) for (let z = 8; z <= 42; z += 1.2) {
      const dDock = dist2d(x, z, DOCK.x, DOCK.z);
      if (dDock < SAFE_R + 1.2 || dDock > 21) continue;          // they will not cross the salt
      if (world.height(x, z) < 0.5) continue;
      if (world.onPath(x, z, 2.4)) continue;
      if (world.riverDist(x, z) < 8) continue;
      cand.push({ x, z, s: dist2d(x, z, -52, 33) });
    }
    cand.sort((a, b) => a.s - b.s);
    for (const c of cand) {
      if (beach.length >= 3) break;
      if (beach.some((b) => dist2d(b.x, b.z, c.x, c.z) < 3.4)) continue;
      beach.push({ x: c.x, z: c.z, yaw: Math.atan2(c.x - DOCK.x, c.z - DOCK.z) });
    }
  }
  while (beach.length < 3) beach.push({ x: -58 - beach.length * 3, z: 18, yaw: 1.2 });
  // #4 does not sunbathe at the beach. #4 sunbathes in the middle of Gumdrop
  // Village at eleven in the morning, flat on its back on the green, directly in
  // everybody's way. (Placed properly at world:ready, once the plaza is known.)
  beach.push({ x: VILLAGE.x + 5.5, z: VILLAGE.z + 4.5, yaw: 2.2, lounger: true });

  // the little lollipop, off-path in the meadow
  let lolliSpot = { x: MEADOW.x + 7, z: MEADOW.z + 5 };
  for (let a = 0; a < 24; a++) {
    const ang = a / 24 * Math.PI * 2;
    const x = MEADOW.x + Math.cos(ang) * 8.5, z = MEADOW.z + Math.sin(ang) * 8.5;
    if (world.isFreeGround(x, z, { pathMargin: 2.2, avoidLandmarks: false })) { lolliSpot = { x, z }; break; }
  }
  lolliSpot.y = groundY(lolliSpot.x, lolliSpot.z);
  lolliSpot.yaw = rand() * 6.28;

  // home doors: a ring inside the village where the houses will stand
  const homes = [];
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + 0.31;
    let spot = null;
    for (const r of [20, 17, 23, 14, 26]) {
      const x = VILLAGE.x + Math.cos(ang) * r, z = VILLAGE.z + Math.sin(ang) * r;
      if (world.height(x, z) > 0.9) { spot = { x, z }; break; }
    }
    homes.push(spot || { x: VILLAGE.x + Math.cos(ang) * 8, z: VILLAGE.z + Math.sin(ang) * 8 });
  }

  // ── the kids ───────────────────────────────────────────────────────────────
  // deepened from the CANDY gummy hues: the frosting ground is pale, these must pop
  const HUES = [0xf5294f, 0xff7a10, 0xffc81e, 0x3fd45f, 0x2f95ff];
  const RARE_HUE = 0xa93cff;
  const ROLES = [
    'tag', 'tag', 'tag', 'tag', 'tag',
    'dance', 'dance', 'dance', 'dance',
    'bathe', 'bathe', 'bathe',
    'lick', 'sit', 'sit',
    'follow', 'follow', 'follow',
    'wander', 'bathe', 'wander', 'wander', 'wander',
    'shrine',
  ];
  const kids = [];
  const _white = new THREE.Color(0xffffff);
  for (let i = 0; i < N; i++) {
    const rare = i === N - 1;
    const base = new THREE.Color(rare ? RARE_HUE : HUES[i % HUES.length]);
    base.lerp(_white, 0.04);                        // a breath of sugar coat
    const role = ROLES[i];
    const k = {
      i, role, rare, name: V.NAMES[i], color: base.getHex(),
      archetype: rare ? 'royal' : V.ARCHETYPES[i % V.ARCHETYPES.length],
      x: 0, y: 0, z: 0, groundY: 0, yaw: rand() * 6.28, desYaw: 0, moving: 0, scale: 1.0 + rand() * 0.18, vis: 1,
      gait: rand() * 6.28, gaitAmp: 0, roll: 0, hop: 0, hopT: rand() * 6.28, squash: 0, squashV: 0, lean: 0,
      headYaw: 0, headPitch: 0, headRoll: 0, headBias: 0, blink: 0, blinkT: rand() * 4, lookX: 0, lookY: 0,
      slit: 0, browOut: 0, mouthWide: 0, mouthOpen: 0, sit: 0, lie: 0, kick: 0, cross: 0,
      crouch: 0, sway: 0, eyesShut: 0, armMode: 'free', freezeHead: 0,
      ph: rand(), lineIdx: (i * 3) % 7, state: 'idle', timer: 0, burstT: 0, bursting: 1,
      anchor: { x: VILLAGE.x, z: VILLAGE.z }, target: { x: VILLAGE.x, z: VILLAGE.z },
      home: homes[i], pathIdx: 0, pathT: rand(), pathDir: rand() < 0.5 ? -1 : 1, pathOff: (rand() - 0.5) * 1.7,
      orbit: rand() * 6.28, orbitDir: rand() < 0.5 ? -1 : 1, ringR: 5.5 + rand() * 3.5,
      isIt: false, standoff: 7 + rand() * 4, sayCd: rand() * 8, pos: new THREE.Vector3(),
      // wave 2: getting hit. `air` lifts the whole kid off the ground (the punt
      // arc); `hurt` is the reaction state machine in sourpatch/hit.js.
      air: 0, hurt: null, hurtHead: false, gaveUp: false, hitStreak: 0, hitsTaken: 0, lastHitAt: -99,
      saltCd: rand() * 6,
      glintCd: rand() * 0.7, saltA: rand() * 6.28,
      saltSlot: ((i * 7) % N) / N * 2.15 - 1.075,    // shuffled so neighbours spread
    };
    kids.push(k);
  }
  const FOUNTAIN = { x: VILLAGE.x, z: VILLAGE.z, r: 4.6 };   // refined at world:ready
  const PLAZA = { x: VILLAGE.x, z: VILLAGE.z, r: 7.5 };      // clear patch found at world:ready
  const CANDY_PATHS = world.PATHS.filter((p) => p.island === 'candy');
  kids.forEach((k) => { k.pathIdx = Math.floor(rand() * CANDY_PATHS.length); });

  // role anchors
  let bathe = 0, danceN = 0, sitN = 0, tagN = 0;
  for (const k of kids) {
    switch (k.role) {
      case 'tag': {
        const a = tagN++ / 5 * Math.PI * 2;
        k.anchor = { x: VILLAGE.x + Math.cos(a) * 9, z: VILLAGE.z + Math.sin(a) * 9 };
        k.isIt = tagN === 1; break;
      }
      case 'dance': {
        k.orbit = (danceN++ / 4) * Math.PI * 2; k.orbitDir = 1;   // same way round, or they collide
        k.anchor = { x: VILLAGE.x, z: VILLAGE.z }; break;
      }
      case 'bathe': { const b = beach[bathe++] || beach[0]; k.anchor = { x: b.x, z: b.z, yaw: b.yaw }; k.lounger = !!b.lounger; k.yaw = b.yaw; k.desYaw = b.yaw; break; }
      case 'lick': k.anchor = { x: lolliSpot.x + Math.cos(lolliSpot.yaw + 1.2) * 1.5, z: lolliSpot.z + Math.sin(lolliSpot.yaw + 1.2) * 1.5 }; break;
      case 'sit': { const a = 1.05 + (sitN++) * 0.38; k.anchor = { x: CUPCAKE.x + Math.sin(a) * 7.2, z: CUPCAKE.z + Math.cos(a) * 7.2 }; break; }
      case 'shrine': k.anchor = { x: SHRINE.x + 2.2, z: SHRINE.z + 1.4 }; break;
      default: {
        const p = CANDY_PATHS[k.pathIdx], q = world.pointOnPolyline(p.points, k.pathT);
        k.anchor = { x: q.x, z: q.z };
      }
    }
    k.x = k.anchor.x; k.z = k.anchor.z; k.y = k.groundY = groundY(k.x, k.z);
    k.target.x = k.x; k.target.z = k.z;
  }

  // ── rig / props / overlay ──────────────────────────────────────────────────
  const rig = createRig(ctx, N, rand);
  kids.forEach((k) => rig.setColor(k.i, k.color));
  const props = createProps(ctx, lolliSpot, { x: DOCK.x, z: DOCK.z, r: SAFE_R });
  const eaten = createEaten(ctx);

  // ── getting hit (wave 2) ───────────────────────────────────────────────────
  // The reaction machine owns a kid's movement and pose while it runs; it is
  // handed the same movement helpers the brains use so a fleeing kid still
  // respects props, the shore and the salt.
  /** Their own front door — unless you have salted it, in which case, nearby. */
  function homeSpot(k) {
    if (!salt.blocked(k.home.x, k.home.z)) return k.home;
    const s = freeSpot(k.home.x, k.home.z, { pathMargin: 0.6, rings: [2.2, 3.6, 5.4, 7.5, 10] });
    return s || k.home;
  }
  const hits = createHits(ctx, {
    kids, V, rand,
    phase: () => phase,
    groundY, dist2d, moveTo, faceThing, say, puff, homeSpot,
    canStand: stepOK,
    playerPos: () => ctx.systems.player?.position || null,
  });

  // two small lights are the NPC share of the island budget: night only
  const eyeLights = [0, 1].map(() => {
    const l = new THREE.PointLight(0xb9ff5a, 0, 16, 2.0);
    l.visible = false; ctx.scene.add(l); return l;
  });

  // ── system state ───────────────────────────────────────────────────────────
  let phase = null, phaseT = 0, sayCd = 0;
  let duskStage = 0, duskToast = false, duskTilt = 0;
  // wave 2 threat read: is the player holding something they could swing at us,
  // and have they walled themselves in with salt?
  let armed = false, heldItem = null, playerWalled = false, tauntCd = 0, patchCd = 0;
  const night = { timer: 0, ready: 0, pounce: 0, sated: 0, saltCd: 0 };
  let hatCd = 24, hatKid = null, photoCd = 6;
  const lastPlayer = new THREE.Vector3(9999, 0, 9999);
  const _pp = new THREE.Vector3();

  function say(k, text, force = false) {
    if (sayCd > 0 && !force) return false;
    ctx.systems.ui?.say(text, { speaker: k ? k.name : 'Sour Patch Kids' });
    sayCd = force ? 2.6 : 5.0;
    return true;
  }
  function nextLine(k) {
    const pool = phase === 'hunting' ? V.NIGHT : (V.DAY[k.archetype] || V.DAY.giggler);
    const t = pool[k.lineIdx % pool.length]; k.lineIdx++;
    return t;
  }
  function puff(k, n = 8, up = 0.7) {
    ctx.systems.particles?.burst({ x: k.x, y: k.y + up, z: k.z, count: n, color: [0xffffff, 0xfff0f8, 0xd9f7ff], speed: 2.1, life: 0.6, size: 0.12, gravity: -5, spread: 0.45 });
  }

  // ── the twinkle ────────────────────────────────────────────────────────────
  // The sugar crust lives in the shader (body.js); the actual GLINT is a 4-point
  // sparkle sprite from the shared particle pool, fired from a surface point
  // that currently faces the sun. Zero extra draw calls, real star shape.
  function glint(k, byDay) {
    if (!rig.glintPoint(k.i, _sun, _gp)) return;
    const o = _glint;
    o.shape = 'sparkle'; o.blend = 'add';
    // r3: at 70 px one 0.8-unit spark every half second is a rumour. Two or
    // three big ones living two thirds of a second, fired four times a second
    // from whatever currently faces the sun, is a kid made of sugar.
    o.x = _gp.x; o.y = _gp.y; o.z = _gp.z;
    o.count = byDay ? (rand() < 0.4 ? 3 : 2) : 1;
    o.color = byDay ? GLINT_DAY : GLINT_NIGHT;
    o.speed = 0.14; o.up = 0.5; o.lateral = 1;
    o.life = byDay ? 0.60 : 0.75; o.lifeVar = 0.3;
    o.size = byDay ? 0.66 : 0.50; o.sizeEnd = 0.02; o.sizeVar = 0.3;
    // spread 0.28: two or three glints from one anchor must land as SEPARATE
    // points of light on the crust, not stack into one white blob.
    o.gravity = 0; o.drag = 1.4; o.spread = 0.28; o.spin = 0.6;
    o.alpha = byDay ? 0.85 : 0.85; o.fadeIn = 0.10; o.fadeOut = 0.55;
    ctx.systems.particles?.burst(o);
  }
  const GLINT_DAY = [0xffffff, 0xfff4d2, 0xffe8a6, 0xe8f6ff];
  const GLINT_NIGHT = [0xd6f2ff, 0xa9e6ff];

  // ── movement helpers ───────────────────────────────────────────────────────
  // A kid may stand here: real Candyland ground, no prop, and — wave 2 — not one
  // grain inside a salt patch. Every single movement call goes through this, so
  // salt is a wall for walking, fleeing, dancing, hunting and being punted alike.
  function stepOK(x, z) { return landOK(x, z) && !blocked(x, z) && !salt.blocked(x, z); }
  function moveTo(k, tx, tz, speed, dt) {
    const dx = tx - k.x, dz = tz - k.z, d = Math.hypot(dx, dz);
    if (d < 1e-4) { k.moving = 0; return 0; }
    const ux = dx / d, uz = dz / d;
    const step = Math.min(d, speed * dt);
    const nx = k.x + ux * step, nz = k.z + uz * step;
    if (stepOK(nx, nz)) { k.x = nx; k.z = nz; k.moving = speed; k.desYaw = Math.atan2(ux, uz); return d; }
    // slide round the obstacle (or along the shore) rather than grinding into it
    for (const sgn of k.pathDir > 0 ? [1, -1] : [-1, 1]) {
      const sx = k.x - uz * step * sgn, sz = k.z + ux * step * sgn;
      if (stepOK(sx, sz)) {
        k.x = sx; k.z = sz; k.moving = speed * 0.62;
        k.desYaw = Math.atan2(-uz * sgn, ux * sgn); return d;
      }
    }
    k.moving = 0; k.desYaw = Math.atan2(ux, uz);
    return d;
  }
  function keepOutOfSalt(k, dt) {
    const d = dist2d(k.x, k.z, DOCK.x, DOCK.z);
    if (d < SAFE_R) {
      const ux = (k.x - DOCK.x) / (d || 1), uz = (k.z - DOCK.z) / (d || 1);
      const tx = DOCK.x + ux * (SAFE_R + 0.6), tz = DOCK.z + uz * (SAFE_R + 0.6);
      k.x = lerp(k.x, tx, Math.min(1, dt * 4)); k.z = lerp(k.z, tz, Math.min(1, dt * 4));
    }
  }
  function hopTick(k, dt, rate, amp) {
    const prev = Math.max(0, Math.sin(k.hopT));
    k.hopT += dt * rate;
    const now = Math.max(0, Math.sin(k.hopT));
    k.hop = now * amp;
    if (prev > 0.02 && now <= 0.02) { k.squash = -0.20; k.squashV = 0; }   // jelly landing
  }
  function faceThing(k, tx, tz, l, dt) {
    k.desYaw = Math.atan2(tx - k.x, tz - k.z);
    k.yaw = angDamp(k.yaw, k.desYaw, l, dt);
  }
  /** Ease toward a fixed pose spot without ever walking into a prop. */
  function settleAt(k, ax, az, dt, rate = 2) {
    const nx = lerp(k.x, ax, Math.min(1, dt * rate)), nz = lerp(k.z, az, Math.min(1, dt * rate));
    if (stepOK(nx, nz)) { k.x = nx; k.z = nz; }
  }

  // ── day roles: one distinct pose set each ──────────────────────────────────
  const TAGGERS = kids.filter((k) => k.role === 'tag');

  function dayBrain(k, dt, t, p, dp) {
    k.lie = damp(k.lie, k.role === 'bathe' ? 1 : 0, 6, dt);
    k.sit = damp(k.sit, k.role === 'sit' ? 1 : 0, 6, dt);
    k.kick = damp(k.kick, k.role === 'sit' ? 1 : 0, 4, dt);
    k.cross = damp(k.cross, k.role === 'bathe' ? 1 : 0, 4, dt);
    k.eyesShut = damp(k.eyesShut, k.role === 'bathe' ? 0.88 : 0, 4, dt);
    k.sway = damp(k.sway, 0, 6, dt);
    k.headBias = damp(k.headBias, 0, 5, dt);
    // resting day face; each role pulls it somewhere else below
    k.mouthWide = damp(k.mouthWide, 0.16, 3, dt);
    k.mouthOpen = damp(k.mouthOpen, 0, 4, dt);

    if (k.state === 'steal') { stealBrain(k, dt, t, p, dp); return; }
    if (k.state === 'photobomb') { photoBrain(k, dt, t, p, dp); return; }

    switch (k.role) {
      // ── TAG: full sprint, torso pitched forward, arms pumping overhead ─────
      case 'tag': {
        const group = TAGGERS;
        const it = group.find((g) => g.isIt) || group[0];
        if (k.isIt) {
          let best = null, bd = 1e9;
          for (const o of group) { if (o === k) continue; const d = dist2d(k.x, k.z, o.x, o.z); if (d < bd) { bd = d; best = o; } }
          if (best) {
            moveTo(k, best.x, best.z, 5.1, dt);
            if (bd < 1.35 && k.timer <= 0) {
              k.isIt = false; best.isIt = true; best.timer = 1.4; k.timer = 1.4;
              puff(best, 12, 0.9); best.hopT = 0; best.squash = -0.22;
              if (rand() < 0.55) say(best, "YOU'RE IT! you're always it.");
            }
          }
          k.armMode = 'reach';                        // both arms out, about to tag
          k.lean = damp(k.lean, 0.44, 6, dt);
        } else {
          const away = Math.atan2(k.x - it.x, k.z - it.z);
          let tx = k.x + Math.sin(away) * 5, tz = k.z + Math.cos(away) * 5;
          const dA = dist2d(k.x, k.z, PLAZA.x, PLAZA.z);
          if (dA > PLAZA.r) { tx = PLAZA.x; tz = PLAZA.z; }
          moveTo(k, tx, tz, dist2d(k.x, k.z, it.x, it.z) < 9 ? 4.7 : 3.2, dt);
          k.armMode = 'run';                          // arms thrown up, fleeing
          k.lean = damp(k.lean, 0.30, 6, dt);
        }
        k.mouthWide = damp(k.mouthWide, 0.6, 4, dt);
        k.gaitAmp = Math.max(k.gaitAmp, 0.85);
        if (k.moving > 0.5) hopTick(k, dt, 2.6, 0.07);
        k.timer -= dt;
        break;
      }
      // ── DANCE: bounce, arms up and waving, hips swinging round the fountain ─
      case 'dance': {
        k.orbit += dt * 0.52 * k.orbitDir;
        const r = FOUNTAIN.r + Math.sin(t * 0.7 + k.ph * 6) * 0.5;
        // LEASH: one shove from the prop push-out used to be permanent — the
        // orbit target moved on without them and they never came back. Past
        // three metres off the ring, walk at the fountain until you are on it.
        const dF = dist2d(k.x, k.z, FOUNTAIN.x, FOUNTAIN.z);
        const far = dF > FOUNTAIN.r + 3.0;
        const tx = far ? FOUNTAIN.x : FOUNTAIN.x + Math.cos(k.orbit) * r;
        const tz = far ? FOUNTAIN.z : FOUNTAIN.z + Math.sin(k.orbit) * r;
        moveTo(k, tx, tz, far ? 3.4 : 2.6, dt);
        hopTick(k, dt, 7.4, 0.30);
        k.armMode = 'up';
        k.sway = damp(k.sway, Math.sin(t * 3.7 + k.ph * 6.28) * 0.26, 8, dt);
        k.headRoll = damp(k.headRoll, Math.sin(t * 3.7 + k.ph * 6.28 + 0.6) * 0.22, 8, dt);
        k.mouthOpen = damp(k.mouthOpen, 0.30 + Math.sin(t * 3.7 + k.ph * 6) * 0.16, 8, dt);
        k.moving = 1.2;
        break;
      }
      // ── SUNBATHE: flat on the back, one leg crossed, eyes shut, arms behind ─
      case 'bathe': {
        k.moving = 0; k.armMode = 'nap';
        k.yaw = angDamp(k.yaw, k.anchor.yaw ?? k.yaw, 2, dt);
        settleAt(k, k.anchor.x, k.anchor.z, dt, 2);
        k.mouthWide = damp(k.mouthWide, 0.42, 3, dt);
        k.lean = damp(k.lean, 0, 5, dt);
        break;
      }
      // ── LICK: leaning in, tongue out, one arm up on the stick ─────────────
      case 'lick': {
        k.moving = 0; k.armMode = 'lick';
        settleAt(k, k.anchor.x, k.anchor.z, dt, 1.6);
        faceThing(k, lolliSpot.x, lolliSpot.z, 3, dt);
        k.lean = damp(k.lean, 0.30 + Math.sin(t * 3.1) * 0.14, 8, dt);
        k.headPitch = damp(k.headPitch, -0.34 + Math.sin(t * 3.1 + 0.5) * 0.16, 8, dt);
        k.mouthOpen = damp(k.mouthOpen, 0.24 + Math.sin(t * 3.1) * 0.18, 8, dt);
        if (rand() < dt * 0.7) ctx.systems.particles?.burst({ x: props.lolliTip.x, y: props.lolliTip.y, z: props.lolliTip.z, count: 4, color: [0xffffff, 0xffd9ec], speed: 1.2, life: 0.7, size: 0.1, gravity: -3, spread: 0.3 });
        break;
      }
      // ── SIT: on the Great Cupcake steps, propped back, legs kicking ───────
      case 'sit': {
        k.moving = 0; k.armMode = 'prop';
        settleAt(k, k.anchor.x, k.anchor.z, dt, 2);
        if (k.anchor.yaw !== undefined) k.yaw = angDamp(k.yaw, k.anchor.yaw, 2.5, dt);
        else faceThing(k, k.x + (k.anchor.x - CUPCAKE.x), k.z + (k.anchor.z - CUPCAKE.z), 2, dt);
        k.mouthWide = damp(k.mouthWide, 0.3, 3, dt);
        k.headRoll = damp(k.headRoll, Math.sin(t * 1.4 + k.ph * 6) * 0.16, 4, dt);
        break;
      }
      case 'shrine': {
        k.moving = 0; k.armMode = 'behind';
        k.yaw += dt * 0.22;
        if (dp < 9 && k.sayCd <= 0) { say(k, nextLine(k)); k.sayCd = 12; }
        break;
      }
      // ── FOLLOW: hands behind the back, head cocked, peeking round things ───
      case 'follow': {
        // they follow you around Candyland and no further: the moment you are on
        // the pier deck, the ferry or the far island they lose interest
        const far = dp > 62 || !onCandy(p.x, p.z) || ctx.systems.player?.onFerry;
        if (far) { wanderBrain(k, dt, 2.6); break; }
        // armed? then two metres further back, thank you
        const so = k.standoff + (armed ? ARMED_GAP : 0);
        if (dp > so + 1.6) { moveTo(k, p.x, p.z, dp > 22 ? 6.2 : 4.3, dt); k.armMode = 'free'; }
        else if (dp < so - 2.2) { moveTo(k, k.x * 2 - p.x, k.z * 2 - p.z, 2.4, dt); k.armMode = 'free'; }
        else {
          k.moving = 0;
          const side = Math.sin(t * 0.8 + k.ph * 6) * 2.2;
          moveTo(k, p.x + Math.cos(k.ph * 6.28) * so + side, p.z + Math.sin(k.ph * 6.28) * so, 1.4, dt);
          k.armMode = 'behind';                      // peeking, hands behind back
          k.headBias = damp(k.headBias, Math.sin(t * 0.55 + k.ph * 6.28) * 0.26, 3, dt);
          k.lean = damp(k.lean, 0.16, 4, dt);
          if (rand() < dt * 0.25) hopTick(k, dt, 9, 0.18);
        }
        faceThing(k, p.x, p.z, 4, dt);
        if (dp < 24 && k.sayCd <= 0) { if (say(k, V.GIGGLE[k.lineIdx++ % V.GIGGLE.length])) { k.sayCd = 9 + rand() * 8; puff(k, 4, 1.3); } else k.sayCd = 2; }
        break;
      }
      default: wanderBrain(k, dt, 3.1);
    }
    if (armed) threatDay(k, dt, t, p, dp);
    keepOutOfSalt(k, dt);
  }

  // ── the threat read (day) ──────────────────────────────────────────────────
  // You are holding a bat. They are children made of sugar. They do not run —
  // that would spoil the joke — they just stand two metres further back than
  // they otherwise would, and they narrate it.
  const ANCHORED = { bathe: 1, sit: 1, lick: 1, shrine: 1 };
  function threatDay(k, dt, t, p, dp) {
    if (k.state !== 'idle') return;
    // 2.5 units is the personal space of a curious gummy child; armed, 4.5. They
    // give ground at 2.6 u/s — slower than you walk, so a bat can still land on
    // one if you mean it. Standing still just buys them two more metres.
    const want = 2.5 + ARMED_GAP;
    if (!ANCHORED[k.role] && dp < want) {
      const away = Math.atan2(k.x - p.x, k.z - p.z);
      moveTo(k, k.x + Math.sin(away) * 3.4, k.z + Math.cos(away) * 3.4, 2.6, dt);
      faceThing(k, p.x, p.z, 5, dt);
      k.lean = damp(k.lean, -0.18, 4, dt);              // leaning away, hands up
      k.armMode = 'up';
      k.mouthWide = damp(k.mouthWide, 0.65, 4, dt);
    } else if (ANCHORED[k.role] && dp < 9) {
      k.lean = damp(k.lean, -0.14, 3, dt);
      k.headBias = damp(k.headBias, Math.sin(t * 0.9 + k.ph * 6.28) * 0.3, 3, dt);
    }
    // the giggle-taunt
    if (dp < 22 && tauntCd <= 0 && k.sayCd <= 0 && rand() < dt * 0.9) {
      if (say(k, V.ARMED[k.lineIdx++ % V.ARMED.length])) {
        tauntCd = 7 + rand() * 6; k.sayCd = 14 + rand() * 10;
        k.hopT = 0; hopTick(k, dt, 9, 0.2); puff(k, 5, 1.3);
      } else k.sayCd = 2;
    }
  }

  function wanderBrain(k, dt, speed) {
    k.armMode = 'free';
    const p = CANDY_PATHS[k.pathIdx];
    const q = world.pointOnPolyline(p.points, clamp(k.pathT, 0, 1));
    const nq = world.pointOnPolyline(p.points, clamp(k.pathT + 0.025 * k.pathDir, 0, 1));
    // lateral offset so they don't walk single file down the licorice
    const dx = nq.x - q.x, dz = nq.z - q.z, dl = Math.hypot(dx, dz) || 1;
    const d = moveTo(k, nq.x - (dz / dl) * k.pathOff, nq.z + (dx / dl) * k.pathOff, speed, dt);
    if (d < 1.4 || k.moving === 0) {
      k.pathT += 0.03 * k.pathDir;
      if (k.pathT > 1 || k.pathT < 0) {
        k.pathT = clamp(k.pathT, 0, 1);
        if (rand() < 0.4) { k.pathIdx = Math.floor(rand() * CANDY_PATHS.length); k.pathT = rand(); }
        else k.pathDir *= -1;
      }
    }
    if (rand() < dt * 0.06) hopTick(k, dt, 9, 0.2);
    keepOutOfSalt(k, dt);
  }

  // ── pranks ─────────────────────────────────────────────────────────────────
  function stealBrain(k, dt, t, p, dp) {
    k.timer -= dt;
    if (k.timer > 3.0) {               // dash in
      moveTo(k, p.x, p.z, 8.2, dt);
      faceThing(k, p.x, p.z, 8, dt);
      k.armMode = 'reach';
      if (dp < 1.9) {
        k.timer = 3.0; k.gotHat = true; props.hat.visible = true;
        say(k, V.HAT[k.lineIdx++ % V.HAT.length], true);
        puff(k, 14, 1.5);
      }
    } else if (k.timer > 0 && k.gotHat) { // run off with it
      const away = Math.atan2(k.x - p.x, k.z - p.z);
      moveTo(k, k.x + Math.sin(away) * 6, k.z + Math.cos(away) * 6, 6.6, dt);
      hopTick(k, dt, 8, 0.14);
      k.armMode = 'run';
      props.hat.visible = true;
      props.hat.position.set(k.x, k.y + 1.57 * k.scale + k.hop, k.z);
      props.hat.rotation.y = k.yaw + 0.4;
    } else {
      if (k.gotHat) { props.hat.visible = false; puff(k, 10, 1.4); }
      k.gotHat = false; k.state = 'idle';
    }
  }
  function photoBrain(k, dt, t, p, dp) {
    k.timer -= dt;
    const az = ctx.systems.camera?.current?.azimuth ?? 0;
    const tx = p.x + Math.sin(az + 1.15) * 2.0, tz = p.z + Math.cos(az + 1.15) * 2.0;
    moveTo(k, tx, tz, 7.2, dt);
    k.yaw = angDamp(k.yaw, az, 9, dt);
    k.armMode = 'wave';
    if (dist2d(k.x, k.z, tx, tz) < 0.6) hopTick(k, dt, 8.5, 0.16);
    if (k.timer <= 0) k.state = 'idle';
  }

  // ── dusk: EVERYONE freezes, turns to face you exactly, tilts, holds 3 s ────
  function duskBrain(k, dt, t, p, dp) {
    if (duskStage === 0) {
      // The freeze. No walking, no wandering, no gait — whatever pose they were
      // in stays. The sunbathers stay flat, the sitters stay sat.
      k.moving = 0; k.gaitAmp = 0; k.hop = damp(k.hop, 0, 10, dt);
      k.kick = damp(k.kick, 0, 9, dt); k.sway = damp(k.sway, 0, 9, dt);
      k.eyesShut = damp(k.eyesShut, 0, 8, dt);        // even the sunbathers open up
      k.blink = 0; k.blinkT = 9;
      const lying = k.lie > 0.35 || k.sit > 0.35;
      k.freezeHead = lying ? 1 : 0;
      if (!lying) {
        // face the player's position EXACTLY, then stop moving at all
        k.desYaw = Math.atan2(p.x - k.x, p.z - k.z);
        k.yaw = phaseT > 0.55 ? k.desYaw : angDamp(k.yaw, k.desYaw, 9, dt);
        k.headYaw = damp(k.headYaw, 0, 9, dt);
      } else {
        let rel = Math.atan2(p.x - k.x, p.z - k.z) - k.yaw;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        k.headYaw = damp(k.headYaw, clamp(rel, -1.5, 1.5), 7, dt);
      }
      k.headRoll = duskTilt;                          // identical on all 24. unison.
      k.headPitch = damp(k.headPitch, -0.10, 5, dt);
      k.mouthWide = damp(k.mouthWide, 0.5, 3, dt);
      k.lean = damp(k.lean, 0.06, 4, dt);
      // armMode is deliberately NOT touched: whatever they were doing, they are
      // still doing it. Caught mid-run, mid-wave, mid-lick.
    } else {
      k.lie = damp(k.lie, 0, 7, dt); k.sit = damp(k.sit, 0, 7, dt);
      k.kick = damp(k.kick, 0, 7, dt); k.cross = damp(k.cross, 0, 7, dt);
      k.armMode = 'free'; k.freezeHead = 0;
      const d = moveTo(k, k.home.x, k.home.z, 6.4, dt);
      k.headRoll = damp(k.headRoll, 0, 6, dt);
      if (d < 1.1) {
        if (k.vis > 0.02 && k.vis === 1) puff(k, 10, 0.8);
        k.vis = Math.max(0, k.vis - dt * 2.6);
        k.moving = 0;
      }
    }
  }

  // ── night: creep, ring, pounce ──────────────────────────────────────────────
  function spawnHunters(p) {
    // If you are not standing on Candyland (Cat Island, the ferry, the sea) they
    // do NOT materialise around you — they come out at home and walk to the salt.
    const aroundPlayer = onCandy(p.x, p.z);
    for (const k of kids) {
      // a puddle of sugar does not report for the night shift, and neither does
      // one that has already been hit twice and gone home in a huff
      if (hits.absent(k) || hits.melting(k) || k.gaveUp) continue;
      if (k.hurt) hits.clear(k);
      let x = k.home.x, z = k.home.z, ok = false;
      // a ring of shapes at the edge of the lamplight — never on top of you
      if (aroundPlayer) for (let a = 0; a < 18 && !ok; a++) {
        const ang = rand() * 6.28, r = 11 + rand() * 8;
        x = p.x + Math.sin(ang) * r; z = p.z + Math.cos(ang) * r;
        ok = landOK(x, z) && dist2d(x, z, DOCK.x, DOCK.z) > SAFE_R + 1 && !blocked(x, z) && !salt.blocked(x, z);
      }
      // a quarter of them come out of their own front door instead
      if (!ok || (rand() < 0.25 && dist2d(k.home.x, k.home.z, p.x, p.z) < 26)) { const h = homeSpot(k); x = h.x; z = h.z; }
      k.x = x; k.z = z; k.y = k.groundY = groundY(x, z);
      pushOutOfProps(k); salt.push(k);
      k.vis = 0; k.state = 'stalk'; k.burstT = rand() * 0.5; k.bursting = 1;
      k.hop = 0; k.squash = 0; k.lie = 0; k.sit = 0; k.kick = 0; k.cross = 0; k.eyesShut = 0;
      k.slit = 1; k.browOut = 1; k.crouch = 0.8;
      k.saltA = Math.atan2(k.z - DOCK.z, k.x - DOCK.x);
    }
    night.timer = 0; night.ready = 0; night.pounce = 0;
  }

  /** Pressed up against the salt, pacing sideways, pawing at the line. */
  function saltLine(k, dt, t, p, dp) {
    const pa = Math.atan2(p.z - DOCK.z, p.x - DOCK.x);
    const want = pa + k.saltSlot + Math.sin(t * 0.5 + k.ph * 6.28) * 0.055 * k.orbitDir;
    k.saltA = angDamp(k.saltA, want, 1.5, dt);
    const rr = SAFE_R + 0.85;
    let tx = DOCK.x + Math.cos(k.saltA) * rr, tz = DOCK.z + Math.sin(k.saltA) * rr;
    if (!landOK(tx, tz)) {
      // that stretch of the line is out over the water: shuffle along it
      for (let s = 1; s <= 16; s++) {
        const a2 = k.saltA + s * 0.19 * (s % 2 ? 1 : -1);
        const x2 = DOCK.x + Math.cos(a2) * rr, z2 = DOCK.z + Math.sin(a2) * rr;
        if (landOK(x2, z2)) { k.saltA = a2; tx = x2; tz = z2; break; }
      }
    }
    const d = dist2d(k.x, k.z, tx, tz);
    if (d > 0.30) moveTo(k, tx, tz, (d > 6 ? 3.8 : 1.6) * (k.bursting ? 1 : 0.45), dt);
    else k.moving = 0;
    faceThing(k, p.x, p.z, 5, dt);
    k.armMode = 'paw';
    k.lean = damp(k.lean, 0.40, 4, dt);
    k.mouthOpen = damp(k.mouthOpen, 0.18, 4, dt);
    if (rand() < dt * 0.5) { k.hopT = 0; hopTick(k, dt, 9, 0.06); }
    if (dp < 26 && night.saltCd <= 0 && k.sayCd <= 0) {
      if (say(k, V.SALTY[k.lineIdx++ % V.SALTY.length])) { night.saltCd = 14; k.sayCd = 20; }
    }
  }

  /**
   * WAVE 2 — you have ringed yourself in salt. They come as close as the grains
   * allow, press against the line, and make it your problem out loud.
   * (moveTo already refuses to cross salt and slides along it, so walking at
   * the player IS the pacing; this adds the posture and the complaining.)
   */
  function paceSaltPatch(k, dt, t, p, dp) {
    const before = k.x, bz = k.z;
    if (k.bursting || dp > 14) moveTo(k, p.x, p.z, dp > 16 ? 3.4 : 2.2, dt);
    else k.moving = 0;
    const stuck = Math.hypot(k.x - before, k.z - bz) < dt * 0.6;
    faceThing(k, p.x, p.z, 5, dt);
    k.armMode = stuck ? 'paw' : 'reach';
    k.lean = damp(k.lean, stuck ? 0.42 : 0.3, 4, dt);
    k.mouthOpen = damp(k.mouthOpen, 0.22, 4, dt);
    if (stuck && rand() < dt * 0.6) { k.hopT = 0; hopTick(k, dt, 9, 0.06); }
    if (dp < 30 && patchCd <= 0 && k.sayCd <= 0) {
      if (say(k, V.SALT_PATCH[k.lineIdx++ % V.SALT_PATCH.length])) { patchCd = 11; k.sayCd = 18; }
    }
  }

  function nightBrain(k, dt, t, p, dp, playerSafe, reachable) {
    k.vis = Math.min(1, k.vis + dt * 1.8);
    k.lie = 0; k.sit = 0; k.kick = 0; k.cross = 0; k.eyesShut = 0;
    k.armMode = dp < 30 ? 'reach' : 'free';
    k.lean = damp(k.lean, dp < 34 ? 0.34 : 0.14, 4, dt);
    k.headBias = 0;

    if (night.sated > 0) {                       // sated: shuffle off into the dark
      const away = Math.atan2(k.x - p.x, k.z - p.z);
      moveTo(k, k.x + Math.sin(away) * 8, k.z + Math.cos(away) * 8, 2.4, dt);
      keepOutOfSalt(k, dt);
      return;
    }

    // twitch: short bursts of movement between long stillnesses
    k.burstT -= dt;
    if (k.burstT <= 0) {
      k.bursting = k.bursting ? 0 : 1;
      const close = dp < 16;
      k.burstT = k.bursting ? (close ? 0.5 + rand() * 0.5 : 0.35 + rand() * 0.45)
                            : (close ? 0.12 + rand() * 0.25 : 0.28 + rand() * 0.6);
      if (k.bursting && rand() < 0.25) { k.hopT = 0; hopTick(k, dt, 9, 0.15); }
    }

    const rushing = night.pounce > 0 && dp < 16 && !playerWalled;
    const ring = k.ringR + (armed ? ARMED_RING : 0);      // holding something? we circle wider
    if (playerSafe && !rushing) {
      saltLine(k, dt, t, p, dp);
    } else if (playerWalled && !playerSafe) {
      paceSaltPatch(k, dt, t, p, dp);
    } else if (rushing) {
      moveTo(k, p.x, p.z, 7.6, dt);
      faceThing(k, p.x, p.z, 10, dt);
      k.mouthOpen = damp(k.mouthOpen, 0.75, 8, dt);
      hopTick(k, dt, 12, 0.1);
    } else if (!reachable) {
      // player is off the island (ferry, sea, Cat Island): they cannot follow,
      // so they crowd the salt line at Sugar Pier and watch the water.
      const dDock = dist2d(k.x, k.z, DOCK.x, DOCK.z);
      if (dDock > SAFE_R + 2.0) { if (k.bursting) moveTo(k, DOCK.x, DOCK.z, 2.8, dt); else k.moving = 0; }
      else { k.moving = 0; keepOutOfSalt(k, dt); }
      faceThing(k, p.x, p.z, 3, dt);
      k.armMode = 'paw';
    } else if (dp > ring + 1.2) {
      if (k.bursting) moveTo(k, p.x, p.z, dp < 12 ? 5.4 : 3.8, dt);
      else k.moving = 0;
      faceThing(k, p.x, p.z, 6, dt);
    } else {
      // circle: the dread part
      k.orbit += dt * 0.7 * k.orbitDir;
      const tx = p.x + Math.cos(k.orbit) * ring, tz = p.z + Math.sin(k.orbit) * ring;
      if (k.bursting) moveTo(k, tx, tz, 3.2, dt); else k.moving = 0;
      faceThing(k, p.x, p.z, 7, dt);
    }
    if (!rushing && !playerSafe) k.mouthOpen = damp(k.mouthOpen, 0, 5, dt);
    keepOutOfSalt(k, dt);
  }

  // ── phase machine ──────────────────────────────────────────────────────────
  function setPhase(next, p) {
    const prev = phase; phase = next; phaseT = 0;
    // a new phase forgives everything except being a puddle: bruises, dizziness
    // and last night's grudges are wiped, dissolves run their full 25 seconds.
    if (prev !== null) hits.reset(true);
    if (next === 'playful') {
      duskStage = 0; duskToast = false; duskTilt = 0;
      for (const k of kids) {
        if (hits.melting(k)) continue;
        k.state = 'idle'; k.vis = prev === null ? 1 : 0.35; k.mouthOpen = 0; k.headRoll = 0; k.crouch = 0;
        if (prev !== null) { k.x = k.anchor.x; k.z = k.anchor.z; k.y = k.groundY = groundY(k.x, k.z); }
      }
    }
    if (next === 'watching') { duskStage = 0; duskToast = false; duskTilt = 0; for (const k of kids) { if (hits.melting(k)) continue; k.state = 'idle'; k.vis = Math.max(k.vis, 1); } }
    props.hat.visible = false;
    if (next === 'hunting') { spawnHunters(p); night.sated = 0; }
    if (prev) {
      ctx.events.emit('sourpatch:phase', { phase: next, prev });
      for (const e of entries) e.label = next === 'hunting' ? 'Talk to it' : `Talk to ${kids[e.ki].name}`;
    }
  }

  // ── interaction (registered once the registry exists) ──────────────────────
  const entries = [];
  events.on('world:ready', () => {
    buildColliderGrid();
    // THE FOUNTAIN (critique r3: "dancers around the fountain" — there weren't
    // any). The old search took the biggest collider within 13 m of the village
    // centre and found NOTHING (the Sugar Fountain's basin is built from small
    // colliders), so FOUNTAIN stayed on the village centre, the dancers tried to
    // orbit the signpost, and the prop push-out shoved them a little further out
    // every frame until they were circling the ring road twenty metres away.
    // The architects mark their own fountain. Ask them.
    const arch = ctx.systems.candyArchitecture || ctx.systems.candyArch;
    const mark = arch?.marks?.sugar_fountain || arch?.landmarks?.sugar_fountain;
    let fountain = null;
    const near = Number.isFinite(mark?.x) ? { x: mark.x, z: mark.z, w: 6 } : { x: VILLAGE.x, z: VILLAGE.z, w: 13 };
    for (const c of ctx.colliders || []) {
      if (c.r < (mark ? 1.0 : 3) || dist2d(c.x, c.z, near.x, near.z) > near.w) continue;
      if (!fountain || c.r > fountain.r) fountain = c;
    }
    // +1.6: measured against the sugar fountain's actual basin (collider r 4.1,
    // visual radius 4.2). Any wider and "dancing round the fountain" reads as
    // "four kids standing near a cake"; any tighter and the prop push-out fights
    // the orbit (push-out needs r + BODY_R = 4.7).
    if (mark) { FOUNTAIN.x = near.x; FOUNTAIN.z = near.z; FOUNTAIN.r = (fountain?.r ?? 3.0) + 1.6; }
    else if (fountain) { FOUNTAIN.x = fountain.x; FOUNTAIN.z = fountain.z; FOUNTAIN.r = fountain.r + 1.6; }
    // widen the ring until most of it is actually standable — a ring that is
    // three-quarters inside the basin wall is not a dance, it is a queue
    for (let pass = 0; pass < 5; pass++) {
      let open = 0;
      for (let a = 0; a < 16; a++) {
        const ang = a / 16 * Math.PI * 2;
        if (stepOK(FOUNTAIN.x + Math.cos(ang) * FOUNTAIN.r, FOUNTAIN.z + Math.sin(ang) * FOUNTAIN.r)) open++;
      }
      if (open >= 9) break;
      FOUNTAIN.r += 1.1;
    }
    // dancers start ON the orbit, not in the middle of the fountain
    for (const k of kids) if (k.role === 'dance') {
      const s = freeSpot(FOUNTAIN.x + Math.cos(k.orbit) * FOUNTAIN.r, FOUNTAIN.z + Math.sin(k.orbit) * FOUNTAIN.r,
        { pathMargin: 0.4, rings: [0, 1.0, 1.9, 3.0] })
        || { x: FOUNTAIN.x + Math.cos(k.orbit) * FOUNTAIN.r, z: FOUNTAIN.z + Math.sin(k.orbit) * FOUNTAIN.r };
      k.anchor = { x: s.x, z: s.z };
      k.x = s.x; k.z = s.z; k.y = k.groundY = groundY(k.x, k.z);
    }

    // tag needs open ground: score patches of the plaza by how much stuff is in
    // them. Relax the clearance until something qualifies — the village is dense
    // and a failed search would park the whole game on the signpost.
    for (const pad of [2.0, 1.2, 0.6]) {
      let bestScore = 1e9, found = false;
      for (const r of [6, 9, 12, 15]) for (let a = 0; a < 18; a++) {
        const ang = a / 18 * Math.PI * 2 + 0.2;
        const x = VILLAGE.x + Math.cos(ang) * r, z = VILLAGE.z + Math.sin(ang) * r;
        if (world.height(x, z) < 0.9 || blocked(x, z, pad)) continue;
        let n = 0;
        for (const c of ctx.colliders || []) { if (c.x > 0 || c.r < 0.3) continue; if (dist2d(c.x, c.z, x, z) < 7) n += c.r; }
        const score = n + r * 0.1 + dist2d(x, z, FOUNTAIN.x, FOUNTAIN.z) * -0.02;
        if (score < bestScore) { bestScore = score; PLAZA.x = x; PLAZA.z = z; found = true; }
      }
      if (found) break;
    }
    let tn = 0;
    for (const k of kids) if (k.role === 'tag') {
      const a = (tn++ / 5) * Math.PI * 2;
      const s = freeSpot(PLAZA.x + Math.cos(a) * 4.5, PLAZA.z + Math.sin(a) * 4.5, { pathMargin: 0.4 })
        || { x: PLAZA.x + Math.cos(a) * 4.5, z: PLAZA.z + Math.sin(a) * 4.5 };
      k.anchor = { x: s.x, z: s.z };
      k.x = s.x; k.z = s.z; k.y = k.groundY = groundY(s.x, s.z);
    }

    // the village sunbather: open ground beside the plaza, head toward the
    // fountain, so at 11:00 you come round the corner and there is a child
    // lying on the grass with its hands behind its head.
    for (const k of kids) {
      if (!k.lounger) continue;
      const s = freeSpot(PLAZA.x + 3.0, PLAZA.z + 2.4, { pathMargin: 0.8, rings: [0, 1.6, 2.8, 4.2, 6, 8] })
        || { x: PLAZA.x + 3.0, z: PLAZA.z + 2.4 };
      const yaw = Math.atan2(FOUNTAIN.x - s.x, FOUNTAIN.z - s.z);
      k.anchor = { x: s.x, z: s.z, yaw };
      k.x = s.x; k.z = s.z; k.y = k.groundY = groundY(s.x, s.z);
      k.yaw = k.desYaw = yaw;
    }

    // the Great Cupcake's steps face the way the path arrives: sit there
    const cpath = world.PATHS.find((q) => q.id === 'candy_cupcake');
    if (cpath) {
      let bi = 0, bd = 1e9;
      cpath.points.forEach(([x, z], i) => { const d = dist2d(x, z, CUPCAKE.x, CUPCAKE.z); if (d < bd) { bd = d; bi = i; } });
      const prev = cpath.points[Math.max(0, bi - 1)];
      const dirA = Math.atan2(prev[0] - CUPCAKE.x, prev[1] - CUPCAKE.z);
      let sn = 0;
      for (const k of kids) if (k.role === 'sit') {
        const off = (sn++ === 0 ? -1.55 : 1.55);
        for (const rr of [7, 8.4, 9.8, 11.4, 13]) {
          const x = CUPCAKE.x + Math.sin(dirA) * rr + Math.cos(dirA) * off;
          const z = CUPCAKE.z + Math.cos(dirA) * rr - Math.sin(dirA) * off;
          if (!blocked(x, z) && world.height(x, z) > 0.5) { k.anchor = { x, z, yaw: dirA }; k.x = x; k.z = z; k.y = k.groundY = groundY(x, z); break; }
        }
      }
    }

    // nobody sunbathes inside a fence, licks from inside a bush, or lives in a wall
    for (const k of kids) {
      if (k.role === 'bathe' || k.role === 'lick' || k.role === 'shrine') {
        if (blocked(k.anchor.x, k.anchor.z)) {
          const s = freeSpot(k.anchor.x, k.anchor.z, { pathMargin: 1.4 });
          if (s) { k.anchor.x = s.x; k.anchor.z = s.z; k.x = s.x; k.z = s.z; k.y = k.groundY = groundY(s.x, s.z); }
        }
      }
      if (!blocked(k.home.x, k.home.z)) continue;
      const s = freeSpot(k.home.x, k.home.z, { pathMargin: 0.6, minHeight: 0.9, rings: [1.4, 2.6, 4, 6, 8, 11] });
      if (s) { k.home.x = s.x; k.home.z = s.z; }
    }
    for (const k of kids) pushOutOfProps(k);

    const reg = ctx.systems.interaction; if (!reg) return;
    for (const k of kids) {
      const e = reg.register({
        id: `sourpatch_${k.i}`, x: k.x, z: k.z, r: 3.1, label: `Talk to ${k.name}`,
        getPos: () => k,
        onInteract() {
          if (k.vis < 0.5) return;
          say(k, nextLine(k), true);
          if (phase === 'hunting') { k.hopT = 0; k.mouthOpen = 1; moveTo(k, ctx.systems.player.position.x, ctx.systems.player.position.z, 2.4, 0.25); }
          else { k.hopT = 0; k.squash = -0.18; puff(k, 6, 1.2); }
          ctx.systems.story?.set('met_sourpatch', true);
        },
      });
      e.ki = k.i; entries.push(e);
    }
  });
  events.on('interact', (target) => {
    if (phase !== 'playful' || photoCd > 0) return;
    if (target && String(target.id).startsWith('sourpatch_')) return;
    const p = ctx.systems.player?.position; if (!p) return;
    let best = null, bd = 26;
    for (const k of kids) { if (k.state !== 'idle' || k.role === 'bathe') continue; const d = dist2d(k.x, k.z, p.x, p.z); if (d < bd) { bd = d; best = k; } }
    if (!best) return;
    best.state = 'photobomb'; best.timer = 3.4; photoCd = 26;
    setTimeout(() => { if (best.state === 'photobomb') say(best, V.PHOTOBOMB[best.lineIdx++ % V.PHOTOBOMB.length], true); }, 550);
  });

  // A ground-pound knocks everyone nearby off their feet. The weapons system
  // also listens for this and routes it through hit() as a 'stomp' — if it is
  // loaded we let it, so one stomp is one hit and not two.
  events.on('player:stomp', (e) => {
    if (ctx.systems.weapons?.saltPatches) return;
    const p = ctx.systems.player?.position;
    hits.stomp(Number.isFinite(e?.x) ? e.x : (p?.x ?? 0), Number.isFinite(e?.z) ? e.z : (p?.z ?? 0), Number.isFinite(e?.r) ? e.r : 6);
  });

  // ── main update ────────────────────────────────────────────────────────────
  const api = {
    kids, rig, props, phase: 'playful',
    getMood: () => phase || 'playful',
    get isHunting() { return phase === 'hunting'; },
    safeZone: { x: DOCK.x, z: DOCK.z, r: SAFE_R },

    // ── WAVE 2 weapons contract ───────────────────────────────────────────
    /**
     * hit(kidRef, { weapon, power, from:{x,z}, kind:'melee'|'throw'|'spray' })
     * kidRef: an entry of api.kids, an index, a name, or an interaction entry.
     * Returns { i, name, reaction, weapon, kind, gaveUp } or false (bad ref /
     * already a puddle). Never throws on a weapon it doesn't know — it flinches.
     */
    hit: (kidRef, opts) => hits.hit(kidRef, opts),
    /** Knock everyone within r off their feet. Also fired by 'player:stomp'. */
    stomp: (x, z, r) => hits.stomp(x, z, r),
    /** Nearest kid to (x,z) that can actually be hit — a helper for weapons. */
    nearestKid(x, z, maxR = 3.5) {
      let best = null, bd = maxR;
      for (const k of kids) {
        if (k.vis < 0.4 || hits.absent(k)) continue;
        const d = dist2d(k.x, k.z, x, z);
        if (d < bd) { bd = d; best = k; }
      }
      return best;
    },
    stats() {
      let visible = 0, hurting = 0, dizzy = 0, fleeing = 0, stunned = 0, dissolving = 0, puddles = 0, home = 0;
      for (const k of kids) {
        if (k.vis > 0.5) visible++;
        const m = k.hurt?.mode;
        if (m) hurting++;
        if (m === 'dizzy' || m === 'fly') dizzy++;
        else if (m === 'flee') fleeing++;
        else if (m === 'stun') stunned++;
        else if (m === 'dissolve') dissolving++;
        else if (m === 'gone' || m === 'reform') puddles++;
        else if (m === 'gohome' || m === 'sulk') home++;
      }
      return {
        phase: phase || 'playful', kids: N, visible,
        armed, held: heldItem?.id ?? (ctx.systems.inventory?.held || null),
        saltPatches: salt.count, playerWalled,
        reacting: { hurting, dizzy, fleeing, stunned, dissolving, puddles, gaveUpAtHome: home },
        ...hits.counters(),
      };
    },

    update(dt, ctx) {
      const t = ctx.state.elapsed;
      const pl = ctx.systems.player; if (!pl) return;
      const p = pl.position;
      sayCd = Math.max(0, sayCd - dt); photoCd = Math.max(0, photoCd - dt);
      hatCd -= dt; night.saltCd = Math.max(0, night.saltCd - dt);
      tauntCd = Math.max(0, tauntCd - dt); patchCd = Math.max(0, patchCd - dt);
      hits.tick(dt);

      // ── wave 2: what is the player carrying, and where is the salt? ────────
      const inv = ctx.systems.inventory;
      const held = inv?.held || null;
      heldItem = held && Array.isArray(inv?.items) ? (inv.items.find((q) => q.id === held) || null) : null;
      // anything but a pocketful of candy reads as a threat to a gummy child
      armed = !!held && (!heldItem || heldItem.kind !== 'candy');
      salt.sync();
      playerWalled = salt.count > 0 && salt.walled(p.x, p.z);

      // phase
      const time = ctx.state.time;
      const want = ctx.state.isNight ? 'hunting' : (time >= 18.5 && time <= 19.5 ? 'watching' : 'playful');
      if (want !== phase) setPhase(want, p);
      api.phase = phase; phaseT += dt;

      // big player jumps (teleport / ferry / respawn): keep the cast on stage
      const jumped = _pp.copy(p).distanceTo(lastPlayer) > 20;
      lastPlayer.copy(p);
      if (jumped) {
        if (phase === 'hunting') spawnHunters(p);
        else for (const k of kids) {
          if (k.role !== 'follow') continue;
          const a = k.ph * 6.28;
          const x = p.x + Math.sin(a) * k.standoff, z = p.z + Math.cos(a) * k.standoff;
          if (landOK(x, z)) { k.x = x; k.z = z; k.y = k.groundY = groundY(x, z); k.vis = 1; }
        }
      }

      if (phase === 'hunting') night.timer += dt;
      if (night.sated > 0) night.sated -= dt;

      const playerOnCandy = p.x < -18 && !pl.onFerry;
      const playerSafe = dist2d(p.x, p.z, DOCK.x, DOCK.z) < SAFE_R;
      let ringCount = 0, touching = 0;

      // ── light / material mood (needed before the glints) ───────────────────
      const daylight = ctx.state.daylight ?? 1;
      const nightMix = Math.max(smoothstep(0.42, 0.02, daylight),
        phase === 'hunting' ? 1 : (phase === 'watching' ? 0.7 : 0));
      const sky = ctx.systems.sky;
      if (sky?.sunDir) _sun.copy(daylight > 0.15 ? sky.sunDir : (sky.moonDir || sky.sunDir));
      const sunY = sky?.sunDir ? sky.sunDir.y : 0.6;
      rig.setMood(daylight, nightMix, sunY, t, _sun);
      const glintDay = daylight > 0.3;

      // dusk staging
      if (phase === 'watching') {
        duskTilt = 0.34 * smoothstep(0.30, 1.0, phaseT);
        if (duskStage === 0 && phaseT > 3.2) duskStage = 1;
        if (!duskToast && phaseT > 0.7) {
          duskToast = true;
          if (playerOnCandy) {
            ctx.systems.ui?.toast('Every Sour Patch Kid stops and turns to look at you.', 4);
            const near = kids.reduce((a, b) => (dist2d(b.x, b.z, p.x, p.z) < dist2d(a.x, a.z, p.x, p.z) ? b : a));
            say(near, V.DUSK[near.lineIdx++ % V.DUSK.length], true);
          }
        }
      }

      // hat theft
      if (phase === 'playful' && hatCd <= 0 && playerOnCandy && !hatKid) {
        const cand = kids.find((k) => k.role === 'follow' && k.state === 'idle' && dist2d(k.x, k.z, p.x, p.z) < 16);
        if (cand) { cand.state = 'steal'; cand.timer = 5.4; hatKid = cand; hatCd = 75; }
      }
      if (hatKid && hatKid.state !== 'steal') hatKid = null;
      // bonk the thief mid-theft and the hat must fall, not hang in the air
      if (props.hat.visible && (!hatKid || hatKid.hurt)) props.hat.visible = false;

      // ── per-kid brains ──────────────────────────────────────────────────────
      for (const k of kids) {
        k.sayCd = Math.max(0, k.sayCd - dt);
        const dp = dist2d(k.x, k.z, p.x, p.z);
        // being hit outranks having a job: the reaction owns the kid while it runs
        if (hits.brain(k, dt, t, p, dp)) {
          if (k.hurt && k.hurt.mode !== 'gone' && k.hurt.mode !== 'sulk') keepOutOfSalt(k, dt);
        }
        else if (phase === 'playful') { k.vis = Math.min(1, k.vis + dt * 3); dayBrain(k, dt, t, p, dp); }
        else if (phase === 'watching') duskBrain(k, dt, t, p, dp);
        else {
          nightBrain(k, dt, t, p, dp, playerSafe, playerOnCandy);
          // salt between us doesn't count: you cannot be surrounded through a wall
          const seen = k.vis > 0.5 && !salt.segment(k.x, k.z, p.x, p.z);
          if (seen && dp < RING_R) ringCount++;
          if (seen && dp < 1.85) touching++;
        }

        // ── shared animation layer ───────────────────────────────────────────
        pushOutOfProps(k);
        // salt thrown at their feet shoves them out with a squeak
        if (salt.count && k.vis > 0.2 && salt.push(k) && !k.hurt && rand() < 0.35) {
          k.hopT = 0; k.squash = -0.16; puff(k, 5, 0.5);
          if (k.sayCd <= 0 && patchCd <= 0 && say(k, V.SALT_PATCH[k.lineIdx++ % V.SALT_PATCH.length])) { patchCd = 9; k.sayCd = 14; }
        }
        // hard containment net: whatever any brain did, a kid that is no longer
        // standing on Candyland goes straight back to its own front door.
        if (!onCandy(k.x, k.z)) {
          k.x = k.home.x; k.z = k.home.z; k.moving = 0;
          if (!onCandy(k.x, k.z)) { k.x = VILLAGE.x; k.z = VILLAGE.z; }
        }
        // feet exactly on the ground: no damping, or they hover on every slope.
        // `air` is the only thing allowed to lift them off it (the punt arc, and
        // the sink when they dissolve).
        k.groundY = groundY(k.x, k.z);
        k.y = k.groundY + (k.air || 0);
        k.yaw = angDamp(k.yaw, k.desYaw, phase === 'hunting' ? 9 : 6, dt);
        k.gait += dt * (0.6 + k.moving * 3.2) * (k.moving > 0.2 ? 1 : 0.3);
        k.gaitAmp = damp(k.gaitAmp, k.moving > 0.4 ? Math.min(1, 0.5 + k.moving * 0.14) : 0, 8, dt);
        k.roll = Math.sin(k.gait) * 0.11 * k.gaitAmp;
        // jelly spring
        k.squashV += (-k.squash * 150 - k.squashV * 14) * dt;
        k.squash = clamp(k.squash + k.squashV * dt, -0.28, 0.22);
        // hunch: at night they fold forward and drop, which is most of the scare
        k.crouch = damp(k.crouch, phase === 'hunting' ? 0.82 : 0, 3.5, dt);
        // head look-at (the dusk beat owns the head during the freeze)
        const lookR = phase === 'hunting' ? 40 : 17;
        if (k.hurtHead) {
          // a dissolving / dizzy / stunned kid owns its own head this frame
        } else if (phase === 'watching' && duskStage === 0) {
          let rel = Math.atan2(p.x - k.x, p.z - k.z) - k.yaw;
          rel = Math.atan2(Math.sin(rel), Math.cos(rel));
          k.lookX = clamp(rel * 1.3, -1, 1); k.lookY = 0;
        } else if (dp < lookR && k.lie < 0.5) {
          let rel = Math.atan2(p.x - k.x, p.z - k.z) - k.yaw;
          rel = Math.atan2(Math.sin(rel), Math.cos(rel));
          const jit = phase === 'hunting' && rand() < dt * 3 ? (rand() - 0.5) * 0.5 : 0;
          k.headYaw = damp(k.headYaw, clamp(rel, -0.85, 0.85) + jit + k.headBias, phase === 'hunting' ? 12 : 6, dt);
          k.lookX = clamp(rel * 1.3, -1, 1);
          k.lookY = clamp((p.y + 1.2 - (k.y + 1.2 * k.scale)) / Math.max(2, dp) * 2, -1, 1);
        } else { k.headYaw = damp(k.headYaw, k.headBias, 3, dt); k.lookX = damp(k.lookX, 0, 3, dt); }
        if (phase !== 'watching' && !k.hurtHead) {
          if (k.role !== 'lick' || phase !== 'playful') k.headPitch = damp(k.headPitch, k.lie > 0.5 ? 0.2 : (phase === 'hunting' ? -0.05 : 0), 5, dt);
          if (k.role !== 'dance' && k.role !== 'sit' || phase !== 'playful') {
            k.headRoll = damp(k.headRoll, phase === 'hunting' ? Math.sin(t * 1.7 + k.ph * 6.28) * 0.12 : 0, 4, dt);
          }
        }
        if (k.role !== 'lick' && k.role !== 'tag' && k.role !== 'follow' && k.state === 'idle' && phase !== 'hunting') {
          k.lean = damp(k.lean, k.moving > 3 ? 0.14 : 0, 5, dt);
        }
        // blink (they stop blinking at night)
        k.blinkT -= dt;
        if (k.blinkT <= 0) { k.blinkT = phase === 'hunting' ? 4 + rand() * 7 : 1.6 + rand() * 3.6; k.blink = 1; }
        k.blink = Math.max(0, k.blink - dt * (phase === 'hunting' ? 3.5 : 9));

        // ── the twinkle: bright and busy by day, a cold rare flicker at night ─
        k.glintCd -= dt;
        if (k.glintCd <= 0) {
          k.glintCd = glintDay ? 0.11 + rand() * 0.20 : 2.4 + rand() * 4.5;
          if (k.vis > 0.55 && dp < 72) glint(k, glintDay);
        }
      }

      // ── the pounce ──────────────────────────────────────────────────────────
      if (phase === 'hunting' && !eaten.active && night.sated <= 0) {
        if (ringCount >= 3 && night.timer > HUNT_GRACE && !playerSafe && playerOnCandy) night.ready += dt;
        else night.ready = Math.max(0, night.ready - dt * 1.5);
        if (night.ready > 2.2 && night.pounce <= 0) {
          night.pounce = 6;
          ctx.systems.ui?.toast('They stop circling.', 2);
        }
        if (night.pounce > 0) {
          night.pounce -= dt;
          if (touching >= 3) {
            eaten.trigger();
            night.sated = 22; night.pounce = 0; night.ready = 0;
            for (const k of kids) { k.burstT = 0.3; k.mouthOpen = 0; }
          }
        }
      }
      eaten.update(dt);

      // eye lights on the two nearest visible hunters
      if (nightMix > 0.15) {
        const close = kids.filter((k) => k.vis > 0.4).sort((a, b) => dist2d(a.x, a.z, p.x, p.z) - dist2d(b.x, b.z, p.x, p.z));
        for (let i = 0; i < 2; i++) {
          const k = close[i], l = eyeLights[i];
          if (!k || dist2d(k.x, k.z, p.x, p.z) > 34) { l.visible = false; continue; }
          l.visible = true;
          l.position.set(k.x, k.y + 1.40 * k.scale, k.z + 0.2);
          l.intensity = 9 * nightMix * (0.7 + 0.3 * Math.sin(t * 9 + k.ph * 6));
        }
      } else for (const l of eyeLights) l.visible = false;

      // ── pose ────────────────────────────────────────────────────────────────
      for (const k of kids) {
        k.slit = damp(k.slit, nightMix, 3, dt);
        k.browOut = damp(k.browOut, nightMix > 0.5 ? 1 : 0, 4, dt);
        if (phase !== 'playful' && phase !== 'watching') k.mouthWide = damp(k.mouthWide, nightMix * 0.7, 3, dt);
        k.pos.set(k.x, k.y, k.z);
        rig.pose(k.i, k, t);
      }
      rig.commit();
      // never own the interaction prompt off Candyland: on Cat Island a kid
      // across the water used to out-bid the cats' own interactables.
      for (const e of entries) e.enabled = playerOnCandy && kids[e.ki].vis > 0.5;
    },
  };
  return api;
}
