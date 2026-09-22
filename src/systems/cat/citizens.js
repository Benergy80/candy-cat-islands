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
  createPackState, tigerPlan,
} from './citizens/tiger.js';
import { addTigerPools, buildTiger } from './citizens/tigerrig.js';
import { addSillPool, placeSillLoaves, breatheSills } from './citizens/sills.js';
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
    cats.push(cat);
  }

  const sillLoaves = placeSillLoaves(lib, world);

  // build the instanced meshes (one per part type)
  for (const p of Object.values(lib.pools)) p.build(group);
  const pools = Object.values(lib.pools).filter((p) => p.mesh);

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
    elapsed: 0, rand, pick: (a) => a[Math.floor(rand() * a.length)],
    kittenHub: { x: world.LANDMARKS.cat_park.x, z: world.LANDMARKS.cat_park.z },
    kittenT: 0,
    stage: makeStageFn(stageIndex),
    byKey: (k) => cats.find((c) => c.key === k),
    playerNear(c, d) { const p = ctx.systems.player?.position; return p ? Math.hypot(p.x - c.x, p.z - c.z) < d : false; },
  };

  // ── tiger state (see citizens/tiger.js) ────────────────────────────────────
  const T = {
    on: isTigerTime(ctx.state.time),
    announced: null,
    carrying: null,
    graceUntil: 6,                       // no hunting on arrival, or just after a catch
    packs: createPackState(world, rng(hash('cat-tiger-packs'))),
  };
  S.tigerPlan = (c, h, cx, s) => tigerPlan(c, h, cx, s, T);

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
  // A coarse hash of ctx.colliders so a tiger can be shoved out of an awning,
  // a table or a harbour railing without testing six hundred boxes per frame.
  const GRID = { n: -1, cell: 8, map: new Map() };
  function gridBuild() {
    GRID.map.clear(); GRID.n = ctx.colliders.length;
    for (const o of ctx.colliders) {
      if (o.solid === false) continue;
      const e = o.box ? Math.max(o.w, o.d) * 0.5 + 2 : (o.r > 0 ? o.r + 2 : -1);
      if (e < 0) continue;
      for (let ix = Math.floor((o.x - e) / GRID.cell); ix <= Math.floor((o.x + e) / GRID.cell); ix++)
        for (let iz = Math.floor((o.z - e) / GRID.cell); iz <= Math.floor((o.z + e) / GRID.cell); iz++) {
          const k = ix + ',' + iz;
          let a = GRID.map.get(k); if (!a) { a = []; GRID.map.set(k, a); }
          a.push(o);
        }
    }
  }
  const _pp = { x: 0, z: 0 };
  /** Hard push out of every solid within `rad`. Steering alone is not enough
   *  for a body three metres long that also stops dead to sit and stare. */
  function pushOutSolids(cat, rad) {
    if (GRID.n !== ctx.colliders.length) gridBuild();
    const list = GRID.map.get(Math.floor(cat.x / GRID.cell) + ',' + Math.floor(cat.z / GRID.cell));
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const gap = solidPush(list[i], cat.x, cat.z, _pp);
      if (gap < rad) {
        const nx = cat.x + _pp.x * (rad - gap), nz = cat.z + _pp.z * (rad - gap);
        if (world.height(nx, nz) > 0.35) { cat.x = nx; cat.z = nz; }
      }
    }
  }

  /** No two tigers closer than this, centre to centre. They are BIG. */
  const TIGER_SEP = 2.6;
  const _live = [];
  function separateTigers() {
    _live.length = 0;
    for (const c of cats) if (c.tigerK > 0.5 && !c.carryTo) _live.push(c);
    for (let i = 0; i < _live.length; i++) {
      const a = _live[i];
      for (let j = i + 1; j < _live.length; j++) {
        const b = _live[j];
        let dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= TIGER_SEP * TIGER_SEP) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-3) { dx = Math.cos(a.seed * 9); dz = Math.sin(a.seed * 9); d = 1; }
        const push = (TIGER_SEP - d) * 0.5;
        dx /= d; dz /= d;
        const ax = a.x - dx * push, az = a.z - dz * push;
        const bx = b.x + dx * push, bz = b.z + dz * push;
        if (world.height(ax, az) > 0.35) { a.x = ax; a.z = az; }
        if (world.height(bx, bz) > 0.35) { b.x = bx; b.z = bz; }
      }
    }
    // and only then out of the furniture, so separation can't shove one into a wall
    for (let i = 0; i < _live.length; i++) pushOutSolids(_live[i], 0.95 * tigerScale(_live[i]));
  }

  // Push a spot out of any solid prop and off the water. Architecture and
  // nature register their colliders before world:ready, so a cat whose post
  // landed inside a new shopfront steps politely onto the pavement instead.
  function spotFree(x, z) {
    if (world.height(x, z) < 0.55) return false;
    for (const o of ctx.colliders) { const dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz < (o.r + 0.5) * (o.r + 0.5)) return false; }
    return true;
  }
  function resolveSpot(x0, z0, maxR = 6) {
    if (spotFree(x0, z0)) return [x0, z0];
    for (let ring = 1; ring <= 10; ring++) {
      const r = (ring / 10) * maxR, n = 8 + ring * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.7;
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        if (spotFree(x, z)) return [x, z];
      }
    }
    return [x0, z0]; // nowhere close is clear — keep the authored post
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
    for (const cat of cats) {
      if (!cat.spec.fixed) {       // Rusty's crate is exactly where his crate is
        cat.home = resolveSpot(cat.home[0], cat.home[1]);
        cat.napSpot = resolveSpot(cat.napSpot[0], cat.napSpot[1]);
        cat.sunSpot = resolveSpot(cat.sunSpot[0], cat.sunSpot[1]);
      }
      cat.x = cat.home[0]; cat.z = cat.home[1];
      cat.y = cat.seatY ?? floorY(cat.x, cat.z);
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
    snapAll(ctx.state.time);
    const st = api.stats();
    let shadowTris = 0; for (const p of pools) if (p.opts.cast) shadowTris += p.tris;
    console.warn(`[catCitizens] ${st.cats} cats · ${st.calls} draw calls (+${pools.filter((p) => p.opts.cast).length} shadow) · ${st.triangles} tris (${Math.round(st.triangles + shadowTris)} incl. shadow pass)`);
  }
  ctx.events.on('world:ready', boot);
  // last word on where the visitor is: fires after player.js has had its say
  ctx.events.on('camera:update', () => { if (T.carrying && T.carrying.stage <= 1) placeCarried(1); });

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
    for (const cat of cats) {
      cat.think = 0; cat.plan = null; cat.talkUntil = -1;
      updateCat(cat, 1 / 60, ctx, S);            // decide
      const p = cat.plan;
      if (p && p.x !== undefined) {
        cat.x = p.x; cat.z = p.z;
        if (p.face !== undefined) { cat.faceDir = p.face; cat.yaw = p.face; }
        cat.onPerch = !!p.perch;
      }
      cat.y = catFloor(cat);
      cat.a = {};                                // pose snaps instead of sliding
      updateCat(cat, 1 / 60, ctx, S);            // pose, at the mark
      cat.pos.set(cat.x, cat.y, cat.z);
      syncShadow(cat);
    }
    if (striped) separateTigers();
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
    const g = floorY(cat.x, cat.z);
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
      if (fx) for (const c of cats) if (c.fxKind === 'stun') {
        const s = (c.spec.size ?? 1) * (1 + c.tigerK * 1.2);
        fx.burst({
          x: c.x, y: c.y + 1.7 * s, z: c.z, count: 2, shape: 'sparkle', blend: 'add',
          color: [0xfff0a0, 0xffffff, 0x9fe8ff], speed: 0.9, life: 0.8, size: 0.24, gravity: 0.2, spread: 0.5,
        });
      }
    }
    updateCarry(dt);
    if (carryCard.t > 0 && (carryCard.t -= dt) <= 0) { carryCard.handle?.close?.(); carryCard.handle = null; }
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
      };
    },

    // ═══ WAVE 2 API ══════════════════════════════════════════════════════════
    /** True while the citizens are tigers (20:00 – 05:30). Containment asks us
     *  this before starting the lantern-cat curfew: you cannot be politely
     *  escorted home by something that is already carrying you there. */
    isTigerTime: () => isTigerTime(ctx.state.time),
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
          const nx = cat.x + Math.sin(a) * kb, nz = cat.z + Math.cos(a) * kb;
          if (world.height(nx, nz) > 0.35) { cat.x = nx; cat.z = nz; }
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
      // A jumped clock (debug / render harness) re-stages the whole island in
      // one frame; normal play moves ~0.08 h per second and never trips this.
      const hour = ctx.state.time;
      if (lastHour === null || Math.abs(hour - lastHour) > 0.25) { lastHour = hour; snapAll(hour); }
      lastHour = hour;
      // one shared moving hub keeps the kittens swirling instead of milling
      S.kittenT -= dt;
      if (S.kittenT <= 0) {
        S.kittenT = 3.5 + rand() * 4;
        const lm = world.LANDMARKS.cat_park, a = rand() * Math.PI * 2, r = 3 + rand() * 12;
        const [hx, hz] = resolveSpot(lm.x + Math.cos(a) * r, lm.z + Math.sin(a) * r, 5);
        S.kittenHub.x = hx; S.kittenHub.z = hz;
      }

      updateTigers(dt);

      for (const cat of cats) {
        const d2 = (cat.x - player.x) ** 2 + (cat.z - player.z) ** 2;
        cat.lookAt = d2 < 225 ? player : null;
        const ty = catFloor(cat);
        cat.y += (ty - cat.y) * (1 - Math.exp(-10 * dt));
        updateCat(cat, dt, ctx, S);
        cat.pos.set(cat.x, cat.y, cat.z);
        syncShadow(cat);
        // close enough, and it meant it
        if (cat.plan && cat.plan.catch && !T.carrying && d2 < 5.0 && S.elapsed > T.graceUntil) startCarry(cat);
      }
      if (T.on) separateTigers();
      for (const c of crowd) applyCrowd(c);
      breatheSills(sillLoaves, ctx.state.elapsed);
      for (const p of pools) p.sync();

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
