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
// tilts its head — all of them, the same way, for three seconds. Then (Contract
// O) they RUN for the Sour Shrine, ring it, chant, turn their backs, go dark
// and come back round as the night rig (sourpatch/ritual.js, ≈ 40 s: the hunt
// begins ≈ 21:42) — hunched, the lights off in their heads, and they hunt you.
// Three of them touching you is dinner. They will not cross the salt line at
// Sugar Pier; they will stand at it and paw.
//
// WAVE 2 — they can be fought back. api.hit(kidRef, { weapon, power, from, kind })
// dissolves them (salt), melts them (spray), punts them (bat/hammer), stuns them
// (gumball) or makes them flinch (anything else); see sourpatch/hit.js. Hit a
// hunter twice inside ten seconds and it gives up and goes home for the night.
// Salt on the ground (ctx.systems.weapons.saltPatches) is a wall they will not
// cross; ring yourself in it and they pace the edge complaining. Holding a
// weapon by day makes them keep their distance and taunt you for it.
//
// WAVE 3 — Contract A (ground & collision, player-owned): every kid's feet sit
// at ctx.systems.player.groundInfo(x, z).h EVERY frame (terrain, deck, or the
// top of a LOW prop — they walk ON crates, kerbs and steps), and after every
// brain has moved it the kid's circle (k.r ≈ 0.5·scale) goes through
// player.pushOut(): props, benches, walls (oriented boxes), trunks and rocks
// can never be inside a kid. Every candidate step is tested with the same
// pushOut first, so a kid slides along a wall instead of grinding into it;
// a hit the slide cannot turn into progress makes a wanderer turn round and a
// night circler reverse. LOW props (benches, crates) are never half-entered:
// a kid whose body cuts into one's side is moved fully ON it (its goal is on
// or across the bench: it hops up and walks over) or fully OFF it (goal on
// this side: it goes round) — see resolveLow(). Mid-punt a kid is solid at
// its real height, so it sails over a picket fence but never into a bench.
// Falls back to world.height + the old local circle grid when the player API
// is missing. api.debugPositions() → [{x,y,z,r,kind}].
// Contract C — the new arsenal (cannon / whip / poprocks / gum / marshmallow /
// boomerang / water): see sourpatch/hit.js. Contract B — while
// ctx.systems.powerups.active the kids FLEE the visitor, and one that touches
// him is bounced 6 u with a puff (hits.bounce); nobody gets eaten meanwhile.
//
// 2026-09-23 (Ben: "Evil Sour Patch kids should not disappear but turn back
// into NPC's when the sun comes out. If they touch water they should melt into
// a pool of liquid that is their color. There should be a limit of 10 sour
// patch kids coming after the player at a time."):
//  · DAWN. The switch out of 'hunting' (main.js flips isNight at 05:30) no
//    longer snaps everyone to their day spot at a third of their size. Every
//    kid still out TURNS BACK where it stands over DAWN_SEC (1.2 s, the light
//    reaching each a moment apart): the night grin closes into the day mouth,
//    the lids lift off the eyes, the reach relaxes and the hunch unfolds, a
//    sparkle-and-steam puff in its own colour, a stretch-and-yawn — then it
//    STROLLS back to its day spot (hands behind its back, 2.6 u/s). Kids that
//    were indoors come out of their own front doors; a pool stays a pool; the
//    pounce is called off. Emits 'sourpatch:dawn' { count }. (A time JUMP to
//    well past dawn — a render harness setTime(12) — still snaps, as before.)
//    Fixer r1: the walk back is NAVIGATED (strollBrain + sourpatch/nav.js):
//    straight if the line is clear, else along the licorice paths and over
//    the bridges, with an A* way round any house, fence, star ring, flower
//    bed or bank in the way. One that still cannot get there (walled into a
//    yard, over its time budget) is put back quietly if the camera cannot see
//    it, or walks in at the nearest front door (a puff if none is in reach)
//    and comes out at its spot. Nobody is still walking back STROLL_GIVEUP
//    (50 s) after its turn, and nobody walks on the spot. stats().dawn.nav.
//    Fixer r2: the day after — a tagger, dancer, wanderer or follower WEDGED
//    in a corner (a wanderer whose licorice is across the syrup from where
//    the night left it) gets out IN ITS ROLE (unwedge: a way round, the
//    nearest licorice it can reach, a breather, a dance on the spot) — not
//    on the walk back, which kept taggers in 'stroll' all morning. A kid
//    going nowhere never shows the walk cycle (its track, TRK_* / TREAD_*),
//    and a kid zipping back and forth in a pocket is slowed to a shuffle.
//    stats().dawn.wedge.
//    Fixer r3: NOBODY VANISHES IN VIEW. A tagger, dancer, wanderer or follower
//    whose walk back gives out is simply back at its day, wherever it is (its
//    role and unwedge take over — r2 still puffed a tagger 8.3 u from its
//    spot at the visitor's feet; one stranded STRAND_R off, unseen and with
//    the visitor away, is put back quietly). A sunbather / sitter / licker / the shrine
//    kid that cannot get home is put back only where the camera cannot see;
//    in view it walks in at a front door (only with the visitor NO_PUFF_R off
//    or more), else takes a breather (strollRest) and plans again. And the
//    VISITOR is an obstacle to a stroller: it steps round him (visitorInWay)
//    instead of grinding into his jumper through eight ways round.
//  · WATER. sourpatch/water.js: the sea, the Chocolate Lake and the syrup
//    river, by the numbers the visitor wades by. A kid whose feet go in (depth
//    > 0.25, or its centre inside the river/lake water) melts over 1.6 s into
//    a glossy pool of its OWN COLOUR that floats on the water, drifts and
//    dissolves after 25 s (sourpatch/puddles.js); it is back at its day spot
//    after 90 s of daylight or at the next dusk. Walking kids treat water as a
//    wall, exactly like salt — only a kid fleeing in a panic (or punted) can
//    blunder in. (Fixer r1: at the river's bank the test is exact per point,
//    not per 0.5-u cell centre — hunters used to stand waist-deep in the
//    syrup, called dry; r2: against the syrup as the river mesh draws it, so
//    no kid stands with syrup over its feet either; r3: across the WHOLE
//    drawn band, out to 1.25 × the half-width; and the raised sugar LIP on
//    the banks is ground a kid stands ON — groundY, water.lipTop — never
//    chest-deep in the white crust.) When the VISITOR stands
//    in the water the hunters pace the shore and hiss, and every 6–10 s one
//    of them over-commits (a 'lunge') and melts (r3: the nearest one with no
//    fence between it and the water — stats().shore.walled / .balked). Emits 'sourpatch:melt' { id, x, z, color, kind, why }.
//    Fixer r4 (lungeBrain): a lunger with HIS BODY between it and the water
//    (he wades a step off the sand) steps round his rim — the way that
//    reaches water soonest without crossing the pier's salt line — and goes
//    in; it used to be shoved back out of his jumper every frame, lunging on
//    the spot, six times a minute, and nobody melted. Pinned all the same =
//    under 0.25 u NET in 0.6 s (not k.moving): it balks and sits out the
//    over-commits for 15 s (k.lungeCd), so the next nearest goes; pinned
//    atop a steep bank with water a drop below, it hops in instead
//    (stats().shore.rim / .leaps). A lunge that reaches the water on its
//    last frame is a 'lunge' melt, not a 'walk'. And the salt line's ease-
//    out (keepOutOfSalt) never drags a walker into the sea along the shore.
//  · TEN AT A TIME. At most HUNT_CAP kids hold a hunting slot (circle, ring,
//    pounce). Everyone else out at night WATCHES from the edge of the light,
//    crouched, eyes glowing, muttering — and steps in the moment a hunter
//    melts, gives up, dissolves, goes to sleep off a meal, or its slot frees.
//    stats().hunting / .watching / .cap.
//
// 2026-09-24 WAVE 4 (Contract M, "kids into Cat Island" — sourpatch/raid.js,
// sourpatch/catsalt.js): once story `rainbow_bridge` is set, every night a PACK
// of ≤ 8 kids (raid.PACK; their hunting slots come out of the same HUNT_CAP)
// comes up out of the dark at the foot of the rainbow just past Sugar Pier's
// salt line at dusk ("…They're on the bridge": audio.play('sourpatch_giggle')
// if present + a toast), skips over escape.routes.bridge.path, steps off at
// the Arrivals Pier and hunts on Cat Island by the ordinary night rules — the
// per-kid island context (k.isl → islCat / SZ) makes landOK, the water, the
// shore lunges, salt and keepOutOfSalt read Cat Island for a raider. The cats'
// salt ring round Welcome Plaza (raid.ring) is their Sugar Pier: a refuge they
// pace outside; the rest of the island is theirs (moveTo walks round the ring
// and asks a Cat Island nav for a way round anything it is stuck on). Eaten
// on Cat Island, the visitor wakes in the refuge. The deck is a truce (they
// walk round a visitor standing on it; hit one there and it goes over the
// rail and melts in the sea). Both crossings are timed in game hours (kids
// fixer r2, raid.js THE CLOCK): ashore by ≈ 20:45; in the small hours they
// slink back to the foot of the rainbow and file home over it from ≈ 04:30,
// the sunrise turning them back into day kids up on the arc, and out of their
// own front doors — the deck clear by ≈ 07:00 (a clock jump into the morning —
// the guest bed at 06:00 — finds them where that clock puts them: raid.js
// placeMorning, via setPhase's timeJump). No bridge:
// they come ashore at the Arrivals Pier. A 'threat' map dot follows the pack;
// its eyes are pinpricks across the strait. +4 draw calls (salt 3, eyes 1),
// ≈ 5k tris. Debug: api.debug.raid('cross'|'home'|'hunt', f, {frame}),
// raidPath(), raidProbe(i, tx, tz), raidWhy(x, z, r, mode), eaten('cat'|'candy')
// (plays the "you were a snack" card now); stats().raid.
// Kids fixer r1 (WAVE 4): TIGERS are solid to a kid — every tiger's three
// circles (torso, head, haunches, as citizens.js debugPositions draws them)
// are read once a frame from catCitizens.cats without allocating; a kid's
// steps never enter one (+ TIG_PAD) and separate() eases it out to a berth of
// TIG_BERTH (a hard push when a tiger walks INTO it). A raider walking home at
// dawn is a day kid: near the pier (or once inside the plaza) the cats' ring
// does not stop it (ringFree — moveTo, stepOK and the Cat Island A* all let it
// cross), so nobody is wedged at the pier head between the ring's west edge
// and the pier-side props; from further off it goes by the roads and round the
// ring (raid.js returnBrain). The ring is a LIVE test in that A* now (not
// cached), so the same grid serves hunters and walkers; walled in by keep-off
// marks alone (the plaza's ammo cache) a raider's A* steps through them once.
// Measured (A/B with the rig AND props hidden, at the game camera): 9 draw
// calls / 32.0k tris by day, 13 / 35.3k at night, 14 / 37.3k during the dusk
// beat. Budget is 40 calls / 60k tris.
// 2026-09-25 Contract O — THE DUSK RITUAL (sourpatch/ritual.js, owner
// "ritual"): the 18:30 freeze is kept; after it every kid RUNS to the Sour
// Shrine (the walk-back-to-work navigation with its ring spot as the goal and
// its speeds × 1.9; in the visitor's sight it makes for the nearest licorice
// way out of the picture first, the least crowded; out of it, it joins a
// procession up the forest path; a kid boxed in by walls gives up in a puff),
// forms two rings on the grass round the dais (pushOut-tested spots), and the
// ≈ 40 s rite plays out (ritual.js RT): chant, torches one by one, the altar,
// backs to the centre, eyes dark, a pulse, the whirl into the night rig. The
// phase machine (wantPhase / clockPhase) holds 'watching' from 18:30 to the
// rite's end on its own clock (past 19:30's nightfall); a clock jump seeds
// the rite from the clock. At the hunt the ones the visitor can see (or
// within 42 u) hunt from where they stand; the rest come as before. The
// visitor inside the outer ring breaks it: heads snap, the hunt starts early.
// Runners plan round the visitor (navVis), squeeze past each other (half a
// body), get RIT_TOKENS plans a frame, and give up like a sunbather (a door,
// never a stroll-arrive short of the ring). Debug: api.debug.ritual(rt),
// api.ritual.stats(), api.phaseAt(h). Event 'sourpatch:ritual' {stage, rt}.
// Kids never leave Candyland — except the raiding pack (k.raid, above): every
// position test goes through onHome() (onCandy() for everyone else).
// Exposes: api.kids [{pos, color, name, state}], api.getMood(), api.phase,
//          api.hit(kidRef, opts) → result|false, api.stomp(x,z,r), api.stats()
//          (…hunting, watching, cap, water, dawn), api.puddles.list(),
//          api.debugPositions() → [{x,y,z,r,kind,name,role,state,vis,air,onProp,slot,night}]
//          api.debug: dunk(i|-1, x, z, delay) · lungeAt(...s) · rehearseNight(sec) · water(x, z)
// Events:  'sourpatch:phase' { phase, prev }, 'sourpatch:eaten' { x, z },
//          'sourpatch:dawn' { count }, 'sourpatch:melt' { id, x, z, color, kind, why },
//          'sourpatch:hit' { i, name, weapon, kind, reaction, gaveUp },
//          'sourpatch:dissolved' / ':respawn' / ':bonk' / ':gaveup' / ':stomped'
//          / ':bounced' (touched the invincible visitor)
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
import { createWater } from './sourpatch/water.js';
import { createPuddles } from './sourpatch/puddles.js';
import { createNav } from './sourpatch/nav.js';
import { createRaid } from './sourpatch/raid.js';
import { createRitual, RIT_START_H, RT as RIT_RT, ritualEndH } from './sourpatch/ritual.js';

// At most this many kids are ever coming after the visitor at once; the rest
// watch from the edge of the light and step in as slots free up.
export const HUNT_CAP = 10;

const N = 24;
const SAFE_R = 14;            // Sugar Pier: they will not cross the salt
const HUNT_GRACE = 6.0;       // seconds of dread before they may commit
const RING_R = 10;
const BODY_R = 0.6;           // a kid's own footprint — props push this hard
const ARMED_GAP = 2.0;        // extra metres of personal space when you're holding something
const ARMED_RING = 2.5;       // extra circling radius at night when you're holding something
const KID_R = 0.5;            // Contract A: a kid's pushOut circle is KID_R × its scale (0.50–0.59)
const SEP_STEP = 0.3;         // kid-kid separation: most a kid is shoved per frame (≥ a sprint step)
const TURN_CD = 2.2;          // seconds between "hit something, turn round" decisions
const STAR_FLEE_R = 18;       // Contract B: the invincible visitor scatters everyone this close
const STAR_BOUNCE = 6;        // …and one that touches him flies this far
// Contract A, LOW props (benches, crates, steps): a kid is either fully ON one
// (feet on its top) or fully OFF it (body at most STRADDLE_TOL into the
// footprint) — never on the grass with half its body inside a bench seat.
const STRADDLE_TOL = 0.08;    // how far a kid's body may touch a low prop's side
const STEP_SEEN = 0.12;       // a top this far above the feet is a step up (lower: it is ground)
const ON_IN = 0.05;           // "on" = centre this far past the core's edge ramp (full top underfoot)
const LOW_RAMP = 0.3;         // the ground core's edge ramp (player/ground.js RAMP)
const LCELL = 8;              // low-prop bins (world units)
// POLISH (critic: "the hungry crowd packs into one interpenetrating clump",
// "the blue pair merges into the purple lollipop lamp", "keep them off the
// star pickup's ring"): a night pack keeps a body-width of air between
// hunters, nobody stands inside the visitor, and the things that carry no
// collider — pickups on their light discs, low invincibility stars, the
// creatures' flower beds — are kept clear of gummy bodies too.
const HUNT_GAP = 1.8;         // night: hunters keep (rA + rB) × this apart (≈ one body-width of air)
const HUNT_BODY = 1.25;       // night: bodies in the 'reach' pose are wider — the hard floor is (rA + rB) × this
const SPREAD_RATE = 3.2;      // u/s a hunter drifts to open that gap (soft: never a pop)
const VISITOR_R = 0.42;       // the visitor's body (player RADIUS 0.36 + his jumper)
const MARK_AGE = 1.5;         // s between re-reads of the pickups / stars / flowers
const LOW_MARGIN = 0.5;       // a kid STANDING STILL beside a bench drifts to this much air off its side
const LOW_DRIFT = 0.9;        // …at this speed (u/s): it never stops pressed flush into a bench back
// 2026-09-23: dawn, water, the hunt cap
const DAWN_SEC = 1.2;         // the turn back into a day kid
const DAWN_SPREAD = 0.45;     // …the light reaches each kid up to this much later
const DAWN_HOURS = [5.5, 8];  // a phase change into this window is a real dawn (else a time jump: snap)
const STROLL = 2.6;           // u/s: walking back to its day spot after the night…
const STROLL_FAR = 3.4;       // …a brisker walk while it is still more than 25 u away…
const STROLL_HURRY = 4.2;     // …and a hurry when it is more than 45 u from its spot (late for work)
const STROLL_GIVEUP = 50;     // s: hard ceiling on any walk back (then it gives up: see strollGiveUp)
const STROLL_MORE = 20;       // s: …in view it never vanishes: a breather, then this much more walk (fixer r3)
const BREATH_SEC = [2, 3.5];  // s: that breather (stands, looks about, hands behind its back)
const NO_PUFF_R = 15;         // nobody vanishes in a puff with the visitor this close (or in view)
const STRAND_R = 14;          // a tagger / dancer whose walk gave out further than this from its spot is stranded
const SIDE_PAD = 0.2;         // the visitor is 'in the way' within VISITOR_R + k.r + this…
const SIDE_LOOK = 0.9;        // …and a stroller starts round him this much further out
const SIDE_MAX = 4;           // s: longest it keeps stepping round him before the watchdog decides
const PROG_SEC = 2.0;         // s no closer to its waypoint = find a way round (sourpatch/nav.js wayRound)
const DETOUR_MAX = 8;         // ways round in a row that got it nowhere before it gives the walk up
const NODE_R = 1.9;           // a licorice-path waypoint counts as reached this close
const WEDGE_SEC = 3;          // s: a walking day kid that got under 1 u in two of these running is wedged
const WAY_SEC = 5;            // s: longest a wedged kid follows its way out of the corner
const TAG_SAFE = 10;          // tag: 'it' further than this and a runner just watches it
// fixer r2: where a kid REALLY went — a position every TRK_DT s, the last TRK_N
// of them. Walk cycle on but under TREAD_NET u net (and under TREAD_PATH u of
// actual travel) in the last TRK_BACK samples = treading, not walking.
const TRK_N = 8, TRK_DT = 0.25, TRK_BACK = 6;
const TREAD_NET = 0.6, TREAD_PATH = 2.4;
const TREAD_JIT = 0.15;       // …or zipping back and forth: net under this share of the ground covered
const TREAD_VISC = 0.3;       // a treading day kid's steps are cut to this (the jitter dies down to a shuffle)
const OFFCAM_R = 80;          // a kid further than this from the camera (or outside its frustum) is off camera
const WATCH_R = 20.5;         // watchers stand this far from the visitor (+ 0–4 u each): the edge of the light
const WATCH_DOCK = 6.5;       // …or this far outside the salt line when he is on the pier
const LUNGE_EVERY = [6, 10];  // s between over-commits while the visitor stands in the water
const LUNGE_SEC = 3.0;        // an over-committed kid gives it this long to reach the water
// fixer r4 (verifier: "a hunter pinned against a wading visitor's body lunges
// on the spot forever and never goes into the water"): a lunge is judged by
// where the kid REALLY went, not by k.moving (a shove back out of his jumper
// every frame never zeroes it)
const LUNGE_WIN = 0.6;        // s: a lunger that got under LUNGE_NET u further in this long is pinned…
const LUNGE_NET = 0.25;       // …(net displacement over the window)
const LUNGE_BENCH = 15;       // s: …and sits out the over-commits this long (k.lungeCd): the next nearest goes
const LEAP_DROP = 0.3;        // a STEEP bank: its feet at least this far over the water it would land in…
const LEAP_R = [0.5, 0.8, 1.1, 1.4, 1.7];   // …which is this close (u): pinned at the edge, it hops in
const LEAP_FAN = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2];   // rad off "at him" tried for that hop
const LEAP_SPEED = 5.5;       // u/s along the hop
const RIM_STEP = Math.PI / 9, RIM_N = 9;     // the way round him is walked in 20° steps, up to half a turn each way

// scratch
const _gp = new THREE.Vector3();
const _sun = new THREE.Vector3(0.3, 0.8, 0.5);
const _glint = {};            // reused burst options bag: never allocate per frame
const _po = { x: 0, z: 0, hit: false };     // Contract A scratch (pushOut)
const _po2 = { x: 0, z: 0, hit: false };
const _gi = { h: 0, prop: null };           // Contract A scratch (groundInfo)
const _on = { x: 0, z: 0 }, _off = { x: 0, z: 0 };        // low props: the two ways out of a straddle
const _slide = { x: 0, z: 0, nx: 0, nz: 0 };              // hit.js: a punt sliding along a wall
const _mk = { x: 0, z: 0, R: 0 };                         // the keep-off mark markInto() just refused
const _det = { x: 0, z: 0, n: 0 };                        // nav.wayRound() out
const _frus = new THREE.Frustum(), _pmat = new THREE.Matrix4(), _cinv = new THREE.Matrix4(), _sph = new THREE.Sphere();
const LOW_RINGS = [0.35, 0.7, 1.1, 1.6, 2.2, 3.0];

export function create(ctx) {
  const { world, events } = ctx;
  const L = world.LANDMARKS;
  const VILLAGE = L.candy_village, DOCK = L.candy_dock, MEADOW = L.lollipop_meadow;
  const CUPCAKE = L.giant_cupcake, SHRINE = L.sour_shrine;
  const rand = rng(hash('sourpatch'));

  // Salt the player has thrown on the ground (weapons system). Read live every
  // frame; to a kid each patch is a wall, not a hazard — they never walk in.
  const salt = createSaltField(ctx);
  // …and the sea, the Chocolate Lake and the syrup river: to a WALKING kid
  // water is a wall like salt; a kid whose feet go in anyway melts.
  const water = createWater(ctx);

  // Contract A: where a kid's feet rest — the player's ground core (terrain,
  // walkable decks, the top of a LOW prop), or bare terrain if it is missing.
  // Writes _gi.prop as a side effect so the shared layer knows who is on a prop.
  const groundY = (x, z) => {
    const pl = ctx.systems.player;
    if (pl && typeof pl.groundInfo === 'function') {
      const g = pl.groundInfo(x, z, _gi);
      if (g && Number.isFinite(g.h)) {
        // a licorice bridge the ground core left out (it only counts a deck
        // near the VISITOR's height): a kid crossing stands on the deck, not
        // on the river bed under it (sourpatch/water.js bridgeY)
        if (!g.deck) { const b = water.bridgeY(x, z); if (b > g.h) return b; }
        // the river's raised sugar LIP is ground too (fixer r3): the ground
        // core does not know it, and kids along the bank stood chest-deep in
        // the white crust — now they walk up onto it, like a low prop
        const lt = water.lipTop(x, z);
        if (lt > g.h) { _gi.prop = null; return lt; }
        return Math.max(0.05, g.h);
      }
    }
    _gi.prop = null;
    const h = world.height(x, z), lt = water.lipTop(x, z);
    return Math.max(0.05, lt > h ? lt : h);
  };
  // the Chocolate Lake is a bowl of chocolate, not a place to stand in up to the eyes
  const LAKE = world.LAKE;
  const lakeOK = (x, z) => {
    if (!LAKE) return true;
    const dx = x - LAKE.x, dz = z - LAKE.z, R = LAKE.r + 7;
    if (dx * dx + dz * dz > R * R) return true;
    return world.height(x, z) > (LAKE.surface ?? 2) - 0.3;
  };
  // CONTAINMENT: Sour Patch Kids belong to Candyland and may never appear on Cat
  // Island — they used to spawn around the player at night and steal Cat
  // Island's interaction prompt. Every position test goes through onCandy().
  const onCandy = (x, z) => x < 0 && world.islandAt(x, z) === 'candy';
  // WAVE 4 — THE RAID (sourpatch/raid.js): after the rainbow bridge a pack of
  // kids hunts on CAT ISLAND at night. Every per-kid movement test below reads
  // the island of the kid being updated (islCat / SZ, switched per kid in
  // update() from k.isl, exactly like wetOK), so a Candyland kid sees exactly
  // what it always saw, and a raider's walls are Cat Island's shore, its water
  // and the cats' salt ring round Welcome Plaza (raid.ring).
  let raid = null;
  const onCatI = (x, z) => x > 0 && world.islandAt(x, z) === 'cat';
  let islCat = false;
  const CANDY_SZ = { x: DOCK.x, z: DOCK.z, r: SAFE_R };
  let SZ = CANDY_SZ;                           // the kid's salt refuge: Sugar Pier's, or the cats' ring
  const ringIn = (x, z, pad = 0) => (raid ? raid.ringIn(x, z, pad) : false);
  // (a raider walking home in the morning is a day kid: the ring is only
  // salt to a hunter — ringFree lets it cross the salt near the pier, where
  // the ring's west edge meets the pier-side props, and out of the plaza if
  // it is already in it. From further off it walks ROUND the ring as the
  // night's hunters do: the plaza's fountain, planters and the ammo cache's
  // halos are a maze to a gummy in a hurry — raid.ringFree())
  let ringFree = false;
  const ringOK = (x, z) => !islCat || ringFree || !ringIn(x, z, 0.3);
  const onHome = (x, z) => (islCat ? onCatI(x, z) : onCandy(x, z));
  function setIsl(k) {
    islCat = !!k && k.isl === 'cat';
    ringFree = islCat && k.raid === 'return' && !!raid && raid.ringFree(k);
    SZ = islCat && raid && !ringFree ? raid.ring : CANDY_SZ;
    // (the near-tiger list is built once per kid per frame: TIG_NEAR is far
    // more than a kid moves in one, and only where tigers are — Candyland's
    // kids skip it unless the raiding party is on their side of the strait)
    if (!k) { tlN = 0; tlKid = null; return; }
    if (tlKid === k && tlFrame === frame) return;
    tlN = 0; tlKid = k; tlFrame = frame;
    if (tgN && !k.scripted && k.vis > 0.02 && (k.x > 0 ? tgCat : tgCandy) > 0) nearTigers(k);
  }
  // ── TIGERS are solid to a kid (kids fixer r1) ──────────────────────────────
  // At night some 45 citizens are tigers on the streets the pack hunts (and a
  // raiding party of them on Candyland's). Once a frame every tiger's three
  // circles — torso, head, haunches: citizens.js TORSO_R 0.62, HEAD 0.95
  // ahead r 0.45, REAR 0.6 behind r 0.42, all × tigerScale — are copied into
  // TG (no allocation); per kid, the ones within TIG_NEAR go into TL, which
  // stepOK treats as walls (+ TIG_PAD) and separate() eases it out of with a
  // berth (a hard push, ≤ TIG_STEP a frame, if one walked INTO it).
  const TIG_MAX = 160, TL_MAX = 36;
  const TIG_PAD = 0.2, TIG_BERTH = 0.9, TIG_STEP = 0.45, TIG_RATE = 3.4, TIG_NEAR = 7;
  const TG = new Float32Array(TIG_MAX * 3 * 3), TL = new Float32Array(TL_MAX * 3);
  let tgN = 0, tlN = 0, tigOff = false, tigPushes = 0, tigFrames = 0, tigEscapes = 0;
  let tgCat = 0, tgCandy = 0, tlKid = null, tlFrame = -1;
  function tigCircle(x, z, r) {
    if (tgN >= TIG_MAX * 3 || !Number.isFinite(x) || !Number.isFinite(z)) return;
    TG[tgN * 3] = x; TG[tgN * 3 + 1] = z; TG[tgN * 3 + 2] = r; tgN++;
    if (x > 0) tgCat++; else tgCandy++;
  }
  function gatherTigers() {
    tgN = 0; tgCat = 0; tgCandy = 0; tlKid = null;
    let cats = null;
    try { cats = ctx.systems.catCitizens?.cats; } catch (e) { cats = null; }
    if (!Array.isArray(cats)) return;
    for (let i = 0; i < cats.length; i++) {
      const c = cats[i];
      if (!c || !(c.tigerK > 0.5) || (c.hideK || 0) >= 0.5 || (typeof c.vis === 'number' && c.vis < 0.5)) continue;
      const sp = c.spec, s = sp && Number.isFinite(sp.size) ? sp.size : 1;
      const T = (0.56 + 0.62 * s) * (sp && sp.build === 'buff' ? 1.09 : 1);
      const yw = Number.isFinite(c.yaw) ? c.yaw : 0, sy = Math.sin(yw), cy = Math.cos(yw);
      tigCircle(c.x, c.z, 0.62 * T);
      tigCircle(c.x + sy * 0.95 * T, c.z + cy * 0.95 * T, 0.45 * T);
      tigCircle(c.x - sy * 0.6 * T, c.z - cy * 0.6 * T, 0.42 * T);
    }
    if (tgN) tigFrames++;
  }
  function nearTigers(k) {
    const R = TIG_NEAR;
    for (let j = 0; j < tgN && tlN < TL_MAX; j++) {
      const dx = TG[j * 3] - k.x, dz = TG[j * 3 + 1] - k.z;
      if (dx > R || dx < -R || dz > R || dz < -R) continue;
      TL[tlN * 3] = TG[j * 3]; TL[tlN * 3 + 1] = TG[j * 3 + 1]; TL[tlN * 3 + 2] = TG[j * 3 + 2]; tlN++;
    }
  }
  /** A kid-sized circle here overlaps a tiger near the kid being updated (+ pad). */
  function inTiger(x, z, r, pad = TIG_PAD) {
    for (let j = 0; j < tlN; j++) {
      const dx = x - TL[j * 3], dz = z - TL[j * 3 + 1], m = r + TL[j * 3 + 2] + pad;
      if (dx * dx + dz * dz < m * m) return true;
    }
    return false;
  }
  // WATER: every walking test goes through landOK, so for a walker the sea,
  // the lake and the river are walls exactly like the shore always was. Only
  // a kid fleeing in a panic, or one that has over-committed at the shore,
  // runs with wetOK set (for the length of its own brain) — and melts.
  let wetOK = false;
  const walkable = (x, z) => world.height(x, z) > 0.35 && lakeOK(x, z);
  // (a raider on Cat Island may walk the Arrivals Pier's deck too — the pack
  // comes ashore over it — or it would be stranded there by the first step)
  const _gd = { h: 0, deck: false, prop: null };
  const catDeck = (x, z) => { const pl = ctx.systems.player; if (!pl || typeof pl.groundInfo !== 'function') return false; const g = pl.groundInfo(x, z, _gd); return !!(g && g.deck && g.h > 0.35); };
  const catWalk = (x, z) => world.height(x, z) > 0.35 || catDeck(x, z);
  const walkHere = (x, z) => (islCat ? catWalk(x, z) : walkable(x, z));
  // wet ground a kid may blunder into: Candyland's own water — the river, the
  // lake, and the sea on this side of the strait (it melts on the first step
  // in, so it never gets further than the shallows)
  const candyWater = (x, z) => x < -18 && water.wet(x, z);
  // (…and across the wet sand of the tideline strip on the way in, which is
  // neither dry enough to walk on nor deep enough to melt in)
  // (a raider: Cat Island's own sea, this side of the strait)
  const homeWater = (x, z) => (islCat ? x > 18 && water.wet(x, z) : candyWater(x, z));
  const landOK = (x, z) => wetOK
    ? (onHome(x, z) || homeWater(x, z))
    : (onHome(x, z) && walkHere(x, z) && !water.wet(x, z));
  // a punt may come down in the water (and melt there), not bounce off it —
  // nor inside the cats' salt ring
  const landFly = (x, z) => ((onHome(x, z) && walkHere(x, z)) || homeWater(x, z)) && ringOK(x, z);
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
      if (!c || c.box || !(c.x <= 0) || !(c.r >= 0.16)) continue;   // candy island, real circles only
      const rc = Math.ceil((c.r + BODY_R + 0.5) / CELL);
      const cx = Math.floor(c.x / CELL), cz = Math.floor(c.z / CELL);
      for (let a = -rc; a <= rc; a++) for (let b = -rc; b <= rc; b++) {
        const k = `${cx + a},${cz + b}`;
        if (!cellMap.has(k)) cellMap.set(k, []);
        cellMap.get(k).push(c);
      }
    }
  }
  /** Is a kid-sized circle here inside anything SOLID? Contract A: the
   *  player's pushOut (circles AND oriented boxes; LOW props are never solid —
   *  kids walk on them). Legacy: the local circle grid. Truthy = blocked. */
  function blocked(x, z, pad = BODY_R) {
    const pl = ctx.systems.player;
    if (pl && typeof pl.pushOut === 'function') return pl.pushOut(x, z, pad, _po).hit ? _po : null;
    const cell = cellMap.get(cellKey(x, z)); if (!cell) return null;
    for (const c of cell) { const r = c.r + pad; if ((x - c.x) ** 2 + (z - c.z) ** 2 < r * r) return c; }
    return null;
  }
  /**
   * Contract A, the net under every brain: resolve the kid's circle against
   * every SOLID collider. A push that would shove it into the sea, the lake or
   * off Candyland puts it back where it stood at the start of the frame
   * instead. Returns true on a hit (the planners read k.bumped = turn round).
   */
  function resolveProps(k) {
    const pl = ctx.systems.player;
    if (!pl || typeof pl.pushOut !== 'function') { pushOutOfProps(k); return false; }
    if (k.air > 0.05) {
      // mid-punt: solid AT ITS HEIGHT (it may be sailing over a picket fence);
      // anything it would be inside is resolved again the frame it lands
      const q = solidAt(k.x, k.z, k.r, k.groundY + k.air, _po);
      if (!q.hit) return false;
      if (landOK(q.x, q.z)) { k.x = q.x; k.z = q.z; } else { k.x = k.px; k.z = k.pz; }
      k.bumps++;
      return true;
    }
    const q = pl.pushOut(k.x, k.z, k.r, _po);
    if (!q.hit) return false;
    if (landOK(q.x, q.z)) { k.x = q.x; k.z = q.z; }
    else if (!pl.pushOut(k.px, k.pz, k.r, _po2).hit) { k.x = k.px; k.z = k.pz; }
    else { k.x = q.x; k.z = q.z; }
    // wedged (a gap narrower than a kid — furniture against a wall): the
    // push cannot resolve it, so step to the nearest spot that is clear
    if (pl.pushOut(k.x, k.z, k.r, _po2).hit) unstick(k, pl);
    k.bumped = true; k.bumps++;
    return true;
  }
  const UNSTICK_RINGS = [0.5, 0.9, 1.4, 2.0, 2.8, 3.8, 5.0, 6.5];
  let unsticks = 0;
  const unstickLog = [];                      // last few, for the verifier (allocates only when it fires)
  function unstick(k, pl) {
    unsticks++;
    if (unstickLog.length >= 8) unstickLog.shift();
    unstickLog.push({ i: k.i, role: k.role, state: k.hurt?.mode || k.state, x: +k.x.toFixed(2), z: +k.z.toFixed(2), px: +k.px.toFixed(2), pz: +k.pz.toFixed(2) });
    for (const rr of UNSTICK_RINGS) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2 + rr;
        const x = k.x + Math.cos(ang) * rr, z = k.z + Math.sin(ang) * rr;
        if (!landOK(x, z) || !ringOK(x, z) || salt.blocked(x, z) || pl.pushOut(x, z, k.r, _po2).hit) continue;
        k.x = x; k.z = z; return true;
      }
    }
    return false;
  }
  // ── LOW props: fully on, or fully off ─────────────────────────────────────
  // The ground core treats a low prop as walkable ground: its top is under the
  // feet only once the kid's CENTRE is inside the footprint (ramped over the
  // outer 0.3 u), and pushOut never blocks it. So a kid whose centre stopped
  // just short of a bench stood on the grass with half its body inside the
  // seat (verifier: Tartlet 0.34 u into the plaza bench). The rule now: a kid
  // whose body cuts into a low prop's side by more than STRADDLE_TOL while
  // that top stands above its feet is moved the short way to ONE of two
  // places — fully ON (centre past the ramp, feet on the top: it hops up) or
  // fully OFF (body clear of the footprint). ON when its goal this frame is on
  // the prop or across it (it walks over the bench); OFF when the goal is on
  // this side (it goes round, and the planners read that as a bump). No goal
  // (shoved, landed, posed): stay on if it was on, else the nearer side.
  const lowCells = new Map();
  let lowN = 0, lowGhosts = 0, lowSeenLen = -1, lowSeenAudit = null, lowAge = 0, frame = 0;
  const lowStats = { on: 0, off: 0, unstick: 0, fail: 0 };
  let xMax = 0;                               // low props / keep-off marks binned west of this (Infinity once the raids begin)
  const lowKey = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
  function rebuildLow() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    rebuildLow0();
    if (t0) { const ms = performance.now() - t0; lowStats.ms = +ms.toFixed(2); if (ms > (lowStats.maxMs || 0)) lowStats.maxMs = +ms.toFixed(2); }
  }
  function rebuildLow0() {
    const pl = ctx.systems.player, G = pl?.ground;
    lowCells.clear(); lowN = 0; lowGhosts = 0; lowAge = 0;
    lowSeenLen = (ctx.colliders || []).length; lowSeenAudit = pl?.colliderAudit || null;
    if (!G || typeof G.forEachLow !== 'function') return;
    G.forEachLow((i, c, top, base) => {
      if (!(c.x < xMax) || !(top - base > STEP_SEEN)) return;        // Candyland (+ Cat Island: the raid), taller than a kerb
      const br = (c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0));
      if (!(br > 0)) return;
      const e = { c, top }, R = br + 0.75;                          // + the widest kid + tolerance
      const x0 = Math.floor((c.x - R) / LCELL), x1 = Math.floor((c.x + R) / LCELL);
      const z0 = Math.floor((c.z - R) / LCELL), z1 = Math.floor((c.z + R) / LCELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const key = lowKey(cx, cz);
        let a = lowCells.get(key); if (!a) { a = []; lowCells.set(key, a); }
        a.push(e);
      }
      lowN++;
    });
    // GHOSTS: legacy colliders (absolute h > 1.6) the player's calibration
    // found nothing drawn for — never solid, never stood on, to the ground
    // core. Nothing to see, but by the brief's letter an h > 1.6 is SOLID, so a
    // kid keeps out of them anyway: an infinitely tall "low prop" is a wall to
    // lowClash (and to a punt), and costs one bin entry.
    if (typeof G.kindOf === 'function') {
      for (const c of ctx.colliders || []) {
        if (!c || !(c.x < xMax) || c.solid === false || !(typeof c.h === 'number' && c.h > 1.6 && c.h < 1e4)) continue;
        if (G.kindOf(c) !== 'none') continue;
        const br = c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0);
        if (!(br > 0)) continue;
        const e = { c, top: Infinity }, R = br + 0.75;
        const x0 = Math.floor((c.x - R) / LCELL), x1 = Math.floor((c.x + R) / LCELL);
        const z0 = Math.floor((c.z - R) / LCELL), z1 = Math.floor((c.z + R) / LCELL);
        for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
          const key = lowKey(cx, cz);
          let a = lowCells.get(key); if (!a) { a = []; lowCells.set(key, a); }
          a.push(e);
        }
        lowN++; lowGhosts++;
      }
    }
  }
  /** Rebinned when colliders are added, after the player calibrates its low
   *  tops to the drawn meshes, and every 10 s (a prop moved or burned). */
  function lowSync(dt) {
    lowAge += dt;
    const pl = ctx.systems.player;
    if ((ctx.colliders || []).length !== lowSeenLen || (pl?.colliderAudit || null) !== lowSeenAudit || lowAge > 10) rebuildLow();
  }
  /** Signed distance from (x, z) to a collider's footprint (negative inside). */
  function sdistC(c, x, z) {
    const dx = x - c.x, dz = z - c.z;
    if (c.box) {
      const rot = c.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
      const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
      const qx = Math.abs(lx) - (c.w || 0) * 0.5, qz = Math.abs(lz) - (c.d || 0) * 0.5;
      const ox = qx > 0 ? qx : 0, oz = qz > 0 ? qz : 0;
      return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0);
    }
    return Math.hypot(dx, dz) - (c.r || 0);
  }
  // the core's edge ramp for this prop: never wider than a quarter of it
  const rampOf = (c) => c.box ? Math.min(LOW_RAMP, 0.25 * Math.min(c.w || 0, c.d || 0)) : Math.min(LOW_RAMP, 0.5 * (c.r || 0));
  /** Nearest point at least `depth` inside the footprint (the full top). */
  function innerPoint(c, x, z, depth, out) {
    const dx = x - c.x, dz = z - c.z;
    if (c.box) {
      const rot = c.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
      let lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
      const ex = Math.max(0, (c.w || 0) * 0.5 - depth), ez = Math.max(0, (c.d || 0) * 0.5 - depth);
      lx = clamp(lx, -ex, ex); lz = clamp(lz, -ez, ez);
      out.x = c.x + lx * cs - lz * sn; out.z = c.z + lx * sn + lz * cs;
    } else {
      const d = Math.hypot(dx, dz), R = Math.max(0, (c.r || 0) - depth);
      const f = d > R && d > 1e-6 ? R / d : 1;
      out.x = c.x + dx * f; out.z = c.z + dz * f;
    }
    return out;
  }
  /** Nearest point whose distance from the footprint is exactly `gap`. */
  function outerPoint(c, x, z, gap, out) {
    const dx = x - c.x, dz = z - c.z;
    if (c.box) {
      const rot = c.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
      let lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
      const hw = (c.w || 0) * 0.5, hd = (c.d || 0) * 0.5;
      if (Math.abs(lx) > hw || Math.abs(lz) > hd) {                    // outside: along the gradient
        const px = clamp(lx, -hw, hw), pz = clamp(lz, -hd, hd);
        const ox = lx - px, oz = lz - pz, d = Math.hypot(ox, oz) || 1;
        lx = px + ox / d * gap; lz = pz + oz / d * gap;
      } else if (hw - Math.abs(lx) < hd - Math.abs(lz)) lx = (lx < 0 ? -1 : 1) * (hw + gap);   // inside: nearest face
      else lz = (lz < 0 ? -1 : 1) * (hd + gap);
      out.x = c.x + lx * cs - lz * sn; out.z = c.z + lx * sn + lz * cs;
    } else {
      let d = Math.hypot(dx, dz), ux = 1, uz = 0;
      if (d > 1e-6) { ux = dx / d; uz = dz / d; }
      out.x = c.x + ux * ((c.r || 0) + gap); out.z = c.z + uz * ((c.r || 0) + gap);
    }
    return out;
  }
  /** Cheap pre-test, no ground query: does a circle here touch any low prop's footprint? */
  function lowNear(x, z, r) {
    if (!lowN) return false;
    const a = lowCells.get(lowKey(Math.floor(x / LCELL), Math.floor(z / LCELL)));
    if (!a) return false;
    for (let j = 0; j < a.length; j++) {
      const c = a[j].c;
      if (c.solid !== false && r - sdistC(c, x, z) > STRADDLE_TOL) return true;
    }
    return false;
  }
  /** The low prop whose SIDE a kid (feet at `feet`) cuts into here, or null. */
  function lowClash(x, z, r, feet) {
    const a = lowCells.get(lowKey(Math.floor(x / LCELL), Math.floor(z / LCELL)));
    if (!a) return null;
    let best = null, bestOv = STRADDLE_TOL;
    for (let j = 0; j < a.length; j++) {
      const e = a[j], c = e.c;
      if (c.solid === false || e.top - feet <= STEP_SEEN) continue;   // on it, or above it
      const ov = r - sdistC(c, x, z);
      if (ov > bestOv) { bestOv = ov; best = e; }
    }
    return best;
  }
  /** A kid may stand here: land, no salt, nothing solid, no low-prop straddle. */
  function lowOK(k, x, z) {
    if (!landOK(x, z) || salt.blocked(x, z)) return false;
    if (ctx.systems.player.pushOut(x, z, k.r, _po2).hit) return false;
    return !lowNear(x, z, k.r) || !lowClash(x, z, k.r, groundY(x, z));
  }
  /** ON or OFF? Its goal decides; without one, the side it was on / the nearer. */
  function wantsOn(k, c) {
    if (k.goalF === frame) {
      const gx = k.goalX, gz = k.goalZ;
      if (sdistC(c, gx, gz) < -0.05) return true;                      // the goal is ON it
      const dx = gx - k.x, dz = gz - k.z, L = Math.hypot(dx, dz);
      if (L > 0.05) {                                                  // …or across it: walk over
        const reach = Math.min(L, 4), n = Math.ceil(reach / 0.4);
        for (let s = 1; s <= n; s++) {
          const f = Math.min(reach, s * 0.4) / L;
          if (sdistC(c, k.x + dx * f, k.z + dz * f) < -0.05) return true;
        }
      }
      return false;                                                    // this side: go round
    }
    if (k.lowOn === c) return true;
    return Math.hypot(_on.x - k.x, _on.z - k.z) < Math.hypot(_off.x - k.x, _off.z - k.z);
  }
  function placeLow(k, pt, on, c) {
    // pushed back against its own step = it walked into the bench: a bump
    const mx = pt.x - k.x, mz = pt.z - k.z, sx = k.x - k.px, sz = k.z - k.pz;
    const back = mx * sx + mz * sz < -1e-6;
    k.x = pt.x; k.z = pt.z;
    if (on) { lowStats.on++; k.lowOn = c; return; }
    lowStats.off++; if (k.lowOn === c) k.lowOn = null;
    if (!back) return;
    k.bumped = true; k.bumps++;
    // …and it goes ROUND: this frame's step turned along the bench's face,
    // toward its goal (a bench it cannot get onto is 2.6 u of detour, not a wall)
    const L = Math.hypot(mx, mz), step = Math.hypot(sx, sz);
    if (L < 1e-5 || step < 1e-3 || k.goalF !== frame) return;
    const gx = k.goalX - k.x, gz = k.goalZ - k.z, gd = Math.hypot(gx, gz);
    if (gd < 1.0) return;                                   // it wants to stand right here: it stops
    let tx = -mz / L, tz = mx / L;
    const dot = (tx * gx + tz * gz) / gd;
    const sg = Math.abs(dot) > 0.15 ? Math.sign(dot) : (k.pathDir || 1);
    tx *= sg; tz *= sg;
    const x = k.x + tx * step, z = k.z + tz * step;
    if (lowOK(k, x, z)) { k.x = x; k.z = z; k.desYaw = Math.atan2(tx, tz); }
  }
  function unstickLow(k) {
    for (const rr of LOW_RINGS) for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2 + rr;
      const x = k.x + Math.cos(ang) * rr, z = k.z + Math.sin(ang) * rr;
      if (lowOK(k, x, z)) { k.x = x; k.z = z; lowStats.unstick++; return true; }
    }
    return false;
  }
  /** After resolveProps: never end a frame straddling a low prop. A kid in
   *  the air counts from where its feet really are (last ground + air): above
   *  the top it is flying over the bench, below it, it is inside its side. */
  function resolveLow(k) {
    if (!lowN || k.vis < 0.05 || !lowNear(k.x, k.z, k.r)) return;
    const pl = ctx.systems.player;
    if (!pl || typeof pl.pushOut !== 'function') return;
    const airborne = k.air > 0.05;
    for (let pass = 0; pass < 3; pass++) {
      const e = lowClash(k.x, k.z, k.r, airborne ? k.groundY + k.air : groundY(k.x, k.z));
      if (!e) return;
      const c = e.c;
      innerPoint(c, k.x, k.z, rampOf(c) + ON_IN, _on);
      outerPoint(c, k.x, k.z, k.r + 0.03, _off);
      const on = airborne ? false : wantsOn(k, c);        // a flying kid bonks off the side
      const a = on ? _on : _off, b = on ? _off : _on;
      if (lowOK(k, a.x, a.z)) placeLow(k, a, on, c);
      else if (lowOK(k, b.x, b.z)) placeLow(k, b, !on, c);
      else if (!unstickLow(k)) { lowStats.fail++; return; }
    }
  }

  /** Standing still flush against a bench (resolveLow leaves an OFF kid 0.03 u
   *  clear) reads, from the game camera, as a kid buried in the bench back
   *  (critic, props_night). A kid that is not walking this frame and is not
   *  ON the prop drifts out to LOW_MARGIN of air; one on its way over the
   *  bench (goal on or across it) is left alone, so hopping up still works. */
  const _lm = { x: 0, z: 0 };
  function lowMargin(k, dt) {
    if (!lowN || k.vis < 0.5 || k.air > 0.05 || k.moving > 0.05 || k.onProp) return;
    if (!k.hurt && k.state === 'idle' && ANCHORED[k.role] && phase === 'playful') return;
    const a = lowCells.get(lowKey(Math.floor(k.x / LCELL), Math.floor(k.z / LCELL)));
    if (!a) return;
    const feet = k.groundY;
    for (let j = 0; j < a.length; j++) {
      const e = a[j], c = e.c;
      if (c.solid === false || !(e.top - feet > 0.3) || e.top === Infinity) continue;
      const gap = sdistC(c, k.x, k.z) - k.r;
      if (gap >= LOW_MARGIN || gap < -STRADDLE_TOL) continue;
      if (k.goalF === frame && (sdistC(c, k.goalX, k.goalZ) < 0 || wantsOn(k, c))) continue;
      outerPoint(c, k.x, k.z, k.r + LOW_MARGIN, _lm);
      const dx = _lm.x - k.x, dz = _lm.z - k.z, L = Math.hypot(dx, dz);
      if (L < 1e-4) continue;
      const st = Math.min(L, LOW_DRIFT * dt);
      const nx = k.x + dx / L * st, nz = k.z + dz / L * st;
      if (lowOK(k, nx, nz) && !markInto(k, nx, nz)) { k.x = nx; k.z = nz; }
      return;
    }
  }

  /**
   * Kids are solid to each other too: two taggers used to share one spot on
   * top of the village sunbather. Only the kid being updated moves (all 24
   * take their turn each frame); a posed kid (sunbathing, sitting, licking,
   * the shrine) never gets shoved — everyone else goes round it.
   */
  function separate(k, p, dt) {
    if (k.vis < 0.5 || k.air > 0.05 || (!k.hurt && k.state === 'idle' && ANCHORED[k.role] && phase === 'playful')) return;
    // night, and not on the pounce or sated: a PACK spread round you with a
    // body-width of dark between each shape — not one heap of gummy
    const spread = phase === 'hunting' && !k.hurt && night.pounce <= 0 && night.sated <= 0;
    const soft = spread ? SPREAD_RATE * dt : 0;
    // (Contract O: two kids both on the run to the shrine squeeze past each
    // other — half a body of give — or the whole village jams in the lane
    // mouth out of the plaza, single file between the gumdrop bushes)
    const runK = k.ritMode === 'run';
    for (const o of kids) {
      if (o === k || o.vis < 0.5 || o.air > 0.05) continue;
      const dx = k.x - o.x, dz = k.z - o.z, hard = (k.r + o.r) * (runK && o.ritMode === 'run' ? 0.72 : (o.lie > 0.5 || spread ? HUNT_BODY : 0.92));
      const min = spread ? (k.r + o.r) * HUNT_GAP : hard;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      const ux = d > 1e-4 ? dx / d : Math.sin(k.ph * 6.28), uz = d > 1e-4 ? dz / d : Math.cos(k.ph * 6.28);
      // soft: at most SEP_STEP a frame (no pops) inside the body, SPREAD_RATE
      // outside it, and never into a prop or a gap between two of them — the
      // props always win
      const push = d < hard ? Math.min(hard - d, SEP_STEP) : Math.min(min - d, soft);
      if (push <= 1e-5) continue;
      const nx = k.x + ux * push, nz = k.z + uz * push;
      if (stepOK(nx, nz, k.r)) { k.x = nx; k.z = nz; }
    }
    // …never inside a TIGER either (kids fixer r1: on Cat Island at night the
    // pack sat in tigers' bodies 43% of frames). A tiger walking into a kid
    // shoves it (hard, ≤ TIG_STEP a frame); inside TIG_BERTH of one it edges
    // away. The shove may not go into a prop, the water or the salt — then
    // it slides round the tiger (±50°, ±90°) instead.
    if (tlN) tigerSep(k, dt);
    // …and never INSIDE the visitor (critic: a hunter 0.76 u from him, half in
    // his jumper). Three of them touching him is still dinner: touching counts
    // at 1.85 u and this keeps them at ~1 u.
    if (!p || eaten.active) return;
    const dy = (p.y ?? k.y) - k.y;
    if (dy > 1.4 * k.scale || dy < -1.7) return;                   // he is jumping over it
    const dx = k.x - p.x, dz = k.z - p.z, min = k.r + VISITOR_R, d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return;
    const d = Math.sqrt(d2);
    const ux = d > 1e-4 ? dx / d : Math.sin(k.ph * 6.28), uz = d > 1e-4 ? dz / d : Math.cos(k.ph * 6.28);
    const push = Math.min(min - d, SEP_STEP);
    const nx = k.x + ux * push, nz = k.z + uz * push;
    if (stepOK(nx, nz, k.r)) { k.x = nx; k.z = nz; }
  }

  const TIG_TURN = [0, 0.87, -0.87, 1.57, -1.57];
  const TIG_ESC = [0.4, 0.7, 1.0, 1.4, 1.9, 2.5, 3.2];
  function tigerSep(k, dt) {
    tigOff = true;
    try {
      for (let j = 0; j < tlN; j++) {
        const cx = TL[j * 3], cz = TL[j * 3 + 1], hard = k.r + TL[j * 3 + 2], min = hard + TIG_BERTH;
        const dx = k.x - cx, dz = k.z - cz;
        if (dx > min || dx < -min || dz > min || dz < -min) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        const ux = d > 1e-4 ? dx / d : Math.sin(k.ph * 6.28), uz = d > 1e-4 ? dz / d : Math.cos(k.ph * 6.28);
        const push = d < hard + 0.05 ? Math.min(hard + 0.08 - d, TIG_STEP) : Math.min(min - d, TIG_RATE * dt);
        if (push <= 1e-5) continue;
        for (let q = 0; q < TIG_TURN.length; q++) {
          const a = TIG_TURN[q], ca = Math.cos(a), sa = Math.sin(a);
          const vx = ux * ca - uz * sa, vz = ux * sa + uz * ca;
          const nx = k.x + vx * push, nz = k.z + vz * push;
          // (a sideways slide must still get it further from this tiger)
          if (q > 0 && (nx - cx) * (nx - cx) + (nz - cz) * (nz - cz) <= d2) continue;
          if (stepOK(nx, nz, k.r)) { k.x = nx; k.z = nz; tigPushes++; break; }
        }
      }
      // still inside one (wedged in a knot of them round the visitor, or
      // between one and a wall: every shove above lands in the next tiger):
      // it squeezes out toward the nearest spot clear of all of them
      if (inTiger(k.x, k.z, k.r, -0.05)) {
        tigOff = false;
        const a0 = k.ph * 6.28;
        search: for (let q = 0; q < TIG_ESC.length; q++) {
          const rr = TIG_ESC[q];
          for (let a = 0; a < 12; a++) {
            const ang = a0 + a * 0.5236, ex = Math.cos(ang), ez = Math.sin(ang);
            if (!stepOK(k.x + ex * rr, k.z + ez * rr, k.r)) continue;          // clear of props AND tigers
            const st = Math.min(rr, TIG_STEP);
            tigOff = true;
            if (st < rr && !stepOK(k.x + ex * st, k.z + ez * st, k.r)) { tigOff = false; continue; }
            k.x += ex * st; k.z += ez * st; tigEscapes++;
            break search;
          }
        }
      }
    } finally { tigOff = false; }
  }

  // ── keep-off marks: things with NO collider a kid must still not stand in ─
  // Pickups (a weapon hovering over its disc of light — the critic's "purple
  // lollipop lamp" two kids merged into), uncollected LOW invincibility stars
  // (their rainbow ring) and the blossoms of the creatures' flower beds. None
  // is a wall to the visitor, so none registers a collider; to a kid each is a
  // little circle it is gently eased out of. Read through ctx.systems (all
  // optional), rebinned every MARK_AGE s into flat [x, z, r, bodyFrac] runs —
  // no objects, nothing allocated per frame.
  const markCells = new Map();
  let markN = 0, markAge = 99, markPushes = 0;
  function addMark(x, z, r, f) {
    const R = r + 0.75;
    const x0 = Math.floor((x - R) / LCELL), x1 = Math.floor((x + R) / LCELL);
    const z0 = Math.floor((z - R) / LCELL), z1 = Math.floor((z + R) / LCELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const key = lowKey(cx, cz);
      let a = markCells.get(key); if (!a) { a = []; markCells.set(key, a); }
      a.push(x, z, r, f);
    }
    markN++;
  }
  function rebuildMarks() {
    for (const a of markCells.values()) a.length = 0;
    markN = 0; markAge = 0;
    try {
      const pk = ctx.systems.inventory?.pickups;
      if (Array.isArray(pk)) for (const q of pk) {
        if (!q || q.taken || !(q.x < xMax) || !Number.isFinite(q.z)) continue;
        const g = Number.isFinite(q.ground) ? q.ground : world.height(q.x, q.z);
        if (Number.isFinite(q.baseY) && q.baseY - g > 2.4) continue;        // on a roof / a counter: nobody's way
        // the hovering sweet/weapon AND the halo rings round it at head height
        // (props_day: a kid 0.85 u from a lollipop pickup stood inside its rings)
        addMark(q.x, q.z, Number.isFinite(q.markR) ? q.markR : 1.0, 0.9);
      }
      const st = ctx.systems.powerups?.stars;
      if (Array.isArray(st)) for (const s of st) {
        if (!s || s.taken || !(s.x < xMax) || !Number.isFinite(s.z)) continue;
        if (Number.isFinite(s.y) && s.y - world.height(s.x, s.z) > 2.6) continue;   // airborne: walk under it
        // the collect ring AND the billboard halo round the star (at the game
        // camera a kid 2 u behind the star still sat inside its rainbow ring)
        addMark(s.x, s.z, 2.2, 0.6);
      }
      // the sprinkle-ants' anthill and the dropped lollipop they are eating
      // (a 0.95-u disc lying on the main road: kids stood ankle-deep in it)
      const sm = ctx.systems.candyCreatures?.parts?.ants?.samples;
      if (Array.isArray(sm) && sm.length > 1) {
        const h = sm[0], c = sm[sm.length - 1];
        if (h && h.x < 0 && Number.isFinite(h.z)) addMark(h.x, h.z, 1.35, 0.8);
        if (c && c.x < 0 && Number.isFinite(c.z)) addMark(c.x, c.z, 1.05, 0.8);
      }
      const beds = ctx.systems.candyCreatures?.parts?.butterflies?.beds;
      if (Array.isArray(beds)) for (const b of beds) {
        if (!b || !Array.isArray(b.flowers)) continue;
        for (const f of b.flowers) if (f && f.x < 0 && Number.isFinite(f.z)) addMark(f.x, f.z, 0.25, 0.8);
      }
    } catch (e) { /* a system that changed shape must never take the kids down */ }
  }
  /** Is a kid-sized circle here inside a keep-off mark? (freeSpot, anchors) */
  function markHit(x, z, r) {
    if (!markN) return false;
    const a = markCells.get(lowKey(Math.floor(x / LCELL), Math.floor(z / LCELL)));
    if (!a) return false;
    for (let j = 0; j < a.length; j += 4) {
      const R = a[j + 2] + r * a[j + 3];
      if ((x - a[j]) ** 2 + (z - a[j + 1]) ** 2 < R * R) return true;
    }
    return false;
  }
  /** Would stepping to (x, z) take this kid DEEPER into a keep-off mark?
   *  Stepping out (or along the edge) is always allowed, so a kid a pickup
   *  respawned on can still walk off it. moveTo slides round a mark exactly as
   *  it slides round a prop — pure push-back used to pin two hunters behind a
   *  star, 1 u apart, walking on the spot. */
  function markInto(k, x, z) {
    if (!markN || k.markFree) return false;
    const a = markCells.get(lowKey(Math.floor(x / LCELL), Math.floor(z / LCELL)));
    if (!a) return false;
    for (let j = 0; j < a.length; j += 4) {
      const R = a[j + 2] + k.r * a[j + 3], mx = a[j], mz = a[j + 1];
      const dn = (x - mx) * (x - mx) + (z - mz) * (z - mz);
      if (dn < R * R && dn < (k.x - mx) * (k.x - mx) + (k.z - mz) * (k.z - mz) - 1e-6) { _mk.x = mx; _mk.z = mz; _mk.R = R; return true; }
    }
    return false;
  }
  /** moveTo, refused by a keep-off mark (markInto → _mk): walk round its RIM
   *  (the tangent on the goal's side, drifting a hair outward) instead of
   *  stopping dead at it — unless the goal itself is in there. */
  function markRim(k, ux, uz, step, speed) {
    if ((k.goalX - _mk.x) ** 2 + (k.goalZ - _mk.z) ** 2 < _mk.R * _mk.R) return false;
    let rx = k.x - _mk.x, rz = k.z - _mk.z;
    const rl = Math.hypot(rx, rz);
    if (rl < 1e-4) return false;
    rx /= rl; rz /= rl;
    let tx = -rz, tz = rx;
    const dot = tx * ux + tz * uz;
    if (dot < -1e-3 || (dot <= 1e-3 && k.pathDir < 0)) { tx = -tx; tz = -tz; }
    const sx = k.x + (tx + rx * 0.2) * step, sz = k.z + (tz + rz * 0.2) * step;
    if (!stepOK(sx, sz, k.r || BODY_R) || markInto(k, sx, sz)) return false;
    k.x = sx; k.z = sz; k.moving = speed * 0.85; k.desYaw = Math.atan2(tx, tz);
    return true;
  }
  function keepOffMarks(k) {
    if (!markN || k.vis < 0.5 || k.air > 0.05 || k.markFree) return;
    const a = markCells.get(lowKey(Math.floor(k.x / LCELL), Math.floor(k.z / LCELL)));
    if (!a) return;
    for (let j = 0; j < a.length; j += 4) {
      const mx = a[j], mz = a[j + 1], R = a[j + 2] + k.r * a[j + 3];
      const dx = k.x - mx, dz = k.z - mz, d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2);
      if (R - d < 0.02) continue;                     // grazing the edge: leave it be (no shimmer)
      const ux = d > 1e-4 ? dx / d : Math.sin(k.ph * 6.28), uz = d > 1e-4 ? dz / d : Math.cos(k.ph * 6.28);
      const push = Math.min(R - d, SEP_STEP);
      const nx = k.x + ux * push, nz = k.z + uz * push;
      if (!stepOK(nx, nz, k.r)) continue;
      k.x = nx; k.z = nz; markPushes++; k.markPushes = (k.markPushes || 0) + 1;
      // its goal is in there: it stops at the edge instead of walking on the spot
      if (k.goalF === frame && (k.goalX - mx) ** 2 + (k.goalZ - mz) ** 2 < R * R) k.moving = 0;
    }
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
    if (lowSeenLen !== (ctx.colliders || []).length) rebuildLow();
    const pad = o.pad ?? BODY_R, pathMargin = o.pathMargin ?? 1.2;
    const minHeight = o.minHeight ?? 0.6, avoidLandmarks = o.avoidLandmarks ?? false;
    for (const rr of o.rings || [0, 1.3, 2.4, 3.6, 5.2, 7.2, 9.5]) {
      const steps = rr === 0 ? 1 : 12;
      for (let a = 0; a < steps; a++) {
        const ang = (a / steps) * Math.PI * 2 + rr * 0.7;
        const nx = x + Math.cos(ang) * rr, nz = z + Math.sin(ang) * rr;
        if (!onCandy(nx, nz)) continue;
        if (!world.isFreeGround(nx, nz, { pathMargin, avoidLandmarks, minHeight })) continue;
        if (water.terrainWet(nx, nz)) continue;             // not in the lake bowl either
        if (blocked(nx, nz, pad)) continue;
        if (salt.blocked(nx, nz)) continue;
        if (lowNear(nx, nz, pad)) continue;                 // fully off every bench and crate
        if (markHit(nx, nz, pad)) continue;                 // not in a pickup, a star ring or a flower bed
        return { x: nx, z: nz };
      }
    }
    return null;
  }
  // the way back to work (sourpatch/nav.js). A walker's dry land (never the
  // wetOK exception: planning is for walking kids). okAt: 0 = a kid may stand
  // here, 1 = something solid / salt / a keep-off mark, 2 = water or off
  // Candyland. staticAt (cached per cell by the way-round grid, sized for the
  // biggest kid): 1 open, 2 solid, 3 water / off Candyland.
  const dryLand = (x, z) => onCandy(x, z) && walkable(x, z) && !water.wet(x, z);
  const NAV_R = KID_R * 1.18;
  // …and the salt line round Sugar Pier is a wall to plan round, not a place
  // to be shoved back out of every frame (keepOutOfSalt)
  const pierIn = (x, z) => (x - DOCK.x) ** 2 + (z - DOCK.z) ** 2 < (SAFE_R + 0.4) * (SAFE_R + 0.4);
  // (Contract O: a kid on the run to the Sour Shrine plans round the VISITOR
  // too — he is a wall to its ways round, not something to sidestep at the
  // last step: the plaza's ways round used to lead straight through him)
  let navVis = false;
  const visAt = (x, z, r) => navVis && (x - visX) * (x - visX) + (z - visZ) * (z - visZ) < (r + VISITOR_R) * (r + VISITOR_R);
  const nav = createNav(ctx, {
    okAt: (x, z, r, marks) => (!dryLand(x, z) ? 2 : (pierIn(x, z) || salt.blocked(x, z) || blocked(x, z, r) || (marks && markHit(x, z, r)) || visAt(x, z, r) ? 1 : 0)),
    staticAt: (x, z) => (!dryLand(x, z) ? 3 : (pierIn(x, z) || blocked(x, z, NAV_R) ? 2 : 1)),
    nodeOK: (x, z) => !pierIn(x, z),
    dynBlocked: (x, z, r, marks) => salt.blocked(x, z) || (marks && markHit(x, z, r)) || visAt(x, z, r),
    inMark: (x, z, r) => markHit(x, z, r),
    wetAt: (x, z) => !dryLand(x, z),
    version: () => (ctx.colliders || []).length,
  });
  // …and a second one over Cat Island for the raid (sourpatch/raid.js walkCat:
  // round the houses on the way back to the rainbow in the morning)
  const catDry = (x, z) => onCatI(x, z) && catWalk(x, z) && !water.wet(x, z);
  const catNav = createNav(ctx, {
    island: 'cat', grid: { x0: 12, z0: -132, nx: 400, nz: 378 },
    // (the ring is read LIVE, not cached: a raider walking home at dawn is let
    // through it — ringFree — by the same grid the night's hunters are not)
    okAt: (x, z, r, marks) => (!catDry(x, z) ? 2 : ((!ringFree && ringIn(x, z, 0.4)) || salt.blocked(x, z) || blocked(x, z, r) || (marks && markHit(x, z, r)) ? 1 : 0)),
    staticAt: (x, z) => (!catDry(x, z) ? 3 : (blocked(x, z, NAV_R) ? 2 : 1)),
    // (every road node is kept, the plaza's too: only the dawn walkers use
    // route() — the roads home to the pier, through the plaza — and a
    // hunter's A* reads the ring live)
    dynBlocked: (x, z, r, marks) => (!ringFree && ringIn(x, z, 0.4)) || salt.blocked(x, z) || (marks && markHit(x, z, r)),
    inMark: (x, z, r) => markHit(x, z, r),
    wetAt: (x, z) => !catDry(x, z),
    version: () => (ctx.colliders || []).length,
  });

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

  // home doors: a ring inside the village where the houses will stand — and
  // never in the syrup river, which runs straight through the ring's east
  // side (three front doors used to open into it: sent home, they melted)
  const nearWater = (x, z, m = 1.3) => {
    if (water.terrainWet(x, z)) return true;
    for (let a = 0; a < 8; a++) if (water.terrainWet(x + Math.cos(a * 0.785) * m, z + Math.sin(a * 0.785) * m)) return true;
    return false;
  };
  const homes = [];
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + 0.31;
    let spot = null;
    for (const r of [20, 17, 23, 14, 26, 11, 29]) {
      const x = VILLAGE.x + Math.cos(ang) * r, z = VILLAGE.z + Math.sin(ang) * r;
      if (world.height(x, z) > 0.9 && !nearWater(x, z)) { spot = { x, z }; break; }
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
      // wave 3: Contract A body + planner memory, the water balloon's fun-size
      r: 0, px: 0, pz: 0, bumped: false, wasBumped: false, bumps: 0, turnCd: 0, onProp: false,
      shrink: 1, shrinkT: 0,
      goalX: 0, goalZ: 0, goalF: -1, lowOn: null, bounceCd: 0,
      // polish: night stall detector (a hunter nose to a fence swings its approach round)
      stallT: 0, stallX: 0, stallZ: 0, swingT: 0, stalls: 0, fleeA: 0, chaseSkip: null, chaseLast: null,
      // 2026-09-23: the hunt slot (HUNT_CAP), the shore, the dawn turn. No rand()
      // here — the layout every existing view was tuned on stays put.
      slot: false, lunge: 0, hissT: 1 + ((i * 13) % 7) / 7 * 3, watchA: 0, watchJit: ((i * 37) % 11) / 11 * 4,
      dawnT: 0, dawnDelay: 0, dawnSlit: 0, dawnBrow: 0, dawnCrouch: 0, dawnLean: 0, dawnFx: false, dawnDoor: false,
      strollT: 0, dawnFrom: '',
      // fixer r1: the walk back (see strollBrain) — a route along the licorice,
      // a way round, a door. Typed array allocated once, here.
      navMode: 0, navLast: -9, navBudget: 0, navForced: false, route: new Int16Array(96), routeN: 0, routeI: 0,
      detOn: false, detX: 0, detZ: 0, detT: 0, detours: 0, detBase: Infinity, progT: 0, progBest: Infinity,
      navChk: false, navAsk: -1, markFree: false, doorX: 0, doorZ: 0, navFade: 1, walkVX: 0, walkVZ: 0,
      gaitPre: 0, wedgeT: 0, wantT: 0, wedgeX: 0, wedgeZ: 0, wedgeN: 0,
      // fixer r2: its track (the gait guard and the wedge watch read it) and
      // the way out of a corner (unwedge). Typed arrays allocated once, here.
      trkX: new Float32Array(TRK_N), trkZ: new Float32Array(TRK_N), trkO: new Float64Array(TRK_N), trkI: 0, trkT: 0, trkN: 0,
      odo: 0, tread: false, trkNet: 0, visc: 1, fleeT: 0, wayOn: false, wayX: 0, wayZ: 0, wayT: 0, wayAsk: false, holdT: 0,
      // fixer r3: a breather instead of a puff in view, the walk's own time
      // cap (a breather in view grants another STROLL_MORE), and which way
      // round the visitor it is stepping (±1) and for how long
      breathT: 0, strollCap: STROLL_GIVEUP, sideS: 0, sideT: 0, lungeSkip: -1,
      // fixer r4: the over-commit — its own bench after a balk (lungeCd), the
      // net-displacement window (lungeW*), and the hop off a steep bank (leap*)
      lungeCd: 0, lungeWT: 0, lungeWX: 0, lungeWZ: 0, leapOn: false, leapX: 0, leapZ: 0, leapT: 0,
    };
    k.r = KID_R * k.scale;
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
  // the pools of liquid melted kids leave on the water (1 draw call while any exist)
  const puddles = createPuddles(ctx, water, rng(hash('sourpatch-puddles')));

  // ── getting hit (wave 2) ───────────────────────────────────────────────────
  // The reaction machine owns a kid's movement and pose while it runs; it is
  // handed the same movement helpers the brains use so a fleeing kid still
  // respects props, the shore and the salt.
  /** Where a kid that melted in the water re-forms: its own day spot (the
   *  sunbather on its towel, the licker at its lollipop…), nudged clear. */
  function respawnSpot(k) {
    const a = k.anchor;
    if (!blocked(a.x, a.z, k.r) && !salt.blocked(a.x, a.z) && !water.wet(a.x, a.z)) return a;
    return freeSpot(a.x, a.z, { pad: k.r, pathMargin: 0.4, rings: [0.8, 1.6, 2.6, 4, 6] }) || homeSpot(k);
  }
  /** Their own front door — unless you have salted it, in which case, nearby. */
  function homeSpot(k) {
    if (!salt.blocked(k.home.x, k.home.z)) return k.home;
    const s = freeSpot(k.home.x, k.home.z, { pathMargin: 0.6, rings: [2.2, 3.6, 5.4, 7.5, 10] });
    return s || k.home;
  }
  /** pushOut at a height: the ground core skips a hurdle/fence whose top the
   *  feet have cleared (player.ground.pushOut with a finite feetY); falls back
   *  to the plain NPC pushOut (everything solid) or the local grid. */
  function solidAt(x, z, r, feet, out) {
    const pl = ctx.systems.player, G = pl?.ground;
    if (G && typeof G.pushOut === 'function') return G.pushOut(x, z, r, feet, null, out);
    if (pl && typeof pl.pushOut === 'function') return pl.pushOut(x, z, r, out);
    out.x = x; out.z = z; out.hit = !!blocked(x, z, r); return out;
  }
  const hitsD = {
    kids, V, rand,
    phase: () => phase,
    groundY, dist2d, moveTo, faceThing, say, puff, homeSpot,
    canStand: (x, z, k) => stepOK(x, z, k ? k.r : BODY_R),
    // a flying kid: real Candyland, no salt, and nothing solid AT ITS HEIGHT —
    // feet are where they really are (last ground + air), so a punt clears a
    // 0.9-u picket fence mid-arc but not at take-off, and never goes into the
    // SIDE of a bench below its top. 0.02 u of slack: a kid resting against a
    // wall sits at EXACT contact, which must not read as blocked every way.
    canFly(x, z, k, feet = k.groundY + Math.max(0, k.air || 0)) {
      const r = k.r - 0.02;
      if (!landFly(x, z) || salt.blocked(x, z) || solidAt(x, z, r, feet, _po2).hit) return false;
      return !lowNear(x, z, r) || !lowClash(x, z, r, feet);
    },
    // a punt that hits a wall slides along its face: where the ground core
    // puts the circle, and the face normal (null if that is no place to be)
    slide(x, z, k) {
      const pl = ctx.systems.player;
      if (!pl || typeof pl.pushOut !== 'function') return null;
      const feet = k.groundY + Math.max(0, k.air || 0);
      let qx, qz;
      const q = solidAt(x, z, k.r, feet, _po);
      if (q.hit) { qx = q.x; qz = q.z; }
      else {
        // not a wall: the side of a bench it is too low to clear
        const e = lowNear(x, z, k.r) ? lowClash(x, z, k.r, feet) : null;
        if (!e) return null;
        outerPoint(e.c, x, z, k.r + 0.03, _off); qx = _off.x; qz = _off.z;
      }
      const mx = qx - x, mz = qz - z, L = Math.hypot(mx, mz);
      if (L < 1e-5 || !hitsD.canFly(qx, qz, k, feet)) return null;
      _slide.x = qx; _slide.z = qz; _slide.nx = mx / L; _slide.nz = mz / L;
      return _slide;
    },
    playerPos: () => ctx.systems.player?.position || null,
    respawnSpot,
    // a raider on Cat Island that has given up (full, or hit once too often)
    // huffs home over the rainbow, not into the sea (raid.js goHome)
    raidHome: (k) => !!(raid && raid.goHome(k)),
  };
  const hits = createHits(ctx, hitsD);

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
  const night = { timer: 0, ready: 0, pounce: 0, sated: 0, saltCd: 0, lungeCd: 8 };
  // 2026-09-23: the visitor is standing in the water; the one kid currently
  // over-committing; the dawn turn's hold on the night face; a time JUMP this
  // frame (harness setTime) as opposed to the clock running into morning
  let visitorWet = false, lunger = null, lunges = 0, meltToast = false;
  const lungeStat = { none: 0, walled: 0, balked: 0, rim: 0, leaps: 0 };   // fixer r3: tries with nobody in reach / a wall first / pinned mid-lunge; r4: frames stepping round his rim, hops off a steep bank
  let dawnHold = 0, dawnCount = 0, dawns = 0, timeJump = false;
  const meltWhy = Object.create(null);
  const meltLog = [];
  const lungeAt = [];                          // debug: scheduled over-commits (s from now)
  const dunkAt = [];                           // debug: scheduled dunks [{t, i, x, z}]
  const _wp = { x: 0, z: 0 };
  events.on('time:set', () => { timeJump = true; });
  let hatCd = 24, hatKid = null, photoCd = 6, pounceToastT = -99;
  let starOn = false, starSayCd = 0;
  const lastPlayer = new THREE.Vector3(9999, 0, 9999);
  const _pp = new THREE.Vector3();
  // WAVE 4: the pack that crosses the rainbow (see sourpatch/raid.js)
  const rinfo = { playerOnCat: false, playerOnBridge: false, playerOnCandy: false, playerSafeCat: false };
  raid = createRaid(ctx, {
    kids, V, rand, hits, water, rig, DOCK, SAFE_R,
    phase: () => phase, duskStage: () => duskStage,
    phaseAt: (tm) => clockPhase(tm),
    groundY, blocked: (x, z, r) => !!blocked(x, z, r), saltBlocked: (x, z) => !!salt.blocked(x, z),
    moveTo, faceThing, hopTick, say, puff, homeSpot, damp,
    meltInWater: (k, why) => meltInWater(k, why),
    inView: (x, y, z) => inView(x, y, z),
    catNav,
    // (Cat Island's low props and keep-off marks join the bins on the next
    // frames — lowSync / the mark clock — not in the frame the salt is poured)
    onEnable: () => { xMax = Infinity; lowAge = 99; markAge = MARK_AGE; },
    // (a debug/render pose starts the night's dread over: no carried-over
    // grace, pounce or full bellies from the view before)
    freshNight: () => { night.timer = 0; night.ready = 0; night.pounce = 0; night.sated = 0; },
  });
  // Contract O: THE DUSK RITUAL (sourpatch/ritual.js) — after the freeze they
  // run to the Sour Shrine, ring it, chant, go dark and come back ZOMBIE
  const ritual = createRitual(ctx, {
    kids, V, water, hits, rig, groundY, angDamp, say, puff,
    moveTo: (k, x, z, v, dt) => moveTo(k, x, z, v, dt), stepOK: (x, z, r) => stepOK(x, z, r),
    blocked: (x, z, r) => !!blocked(x, z, r), lowNear: (x, z, r) => !!lowNear(x, z, r),
    inView: (x, y, z) => inView(x, y, z),
    settleAt: (k, x, z, dt, rate) => settleAt(k, x, z, dt, rate),
    stroll: (k, dt, t, p, dp, x, z, mul) => ritualRun(k, dt, t, p, dp, x, z, mul),
    giveUp: (k, x, z) => ritualRun(k, 0, 0, null, 0, x, z, 1, true),
    navReset: (k) => navReset(k),
    lineClear: (x0, z0, x1, z1, r) => nav.lineClear(x0, z0, x1, z1, r),
  });
  const secPerH = () => (world.DAY_LENGTH_SEC || 300) / 24;
  /** Where the clock alone puts the kids (a jump, a debug pose, the raid's
   *  clock): the day; the dusk rite, 18:30 → its end (≈ 21:42); the night. */
  function clockPhase(tm, isNight = tm < 5.5 || tm > 19.5) {
    if (tm >= RIT_START_H && tm < ritualEndH(secPerH())) return 'watching';
    if (isNight || tm >= RIT_START_H) return 'hunting';
    return 'playful';
  }
  /** This frame's phase. The rite runs on its own clock to its end (or until
   *  the visitor breaks it), past the 19:30 nightfall; a clock JUMP re-reads
   *  the clock. */
  function wantPhase(tm) {
    const isN = ctx.state.isNight;
    if (phase === null || timeJump) return clockPhase(tm, isN);
    if (phase === 'watching') return ritual.over ? 'hunting' : ((!isN && tm < RIT_START_H) ? 'playful' : 'watching');
    if (phase === 'hunting') return isN || tm >= RIT_START_H ? 'hunting' : 'playful';
    return clockPhase(tm, isN);
  }
  /** Seconds of rite by the clock (0 at the 18:30 freeze). */
  const riteClock = (tm) => Math.max(0, (tm - RIT_START_H) * secPerH());
  function enterRite(jump) {
    ritual.start(riteClock(ctx.state.time), jump);
    duskStage = ritual.rt >= RIT_RT.FREEZE ? 1 : 0;
    duskToast = ritual.rt > 0.7;
  }
  /** Contract O: the run to the shrine — the walk back to work's navigation
   *  (strollBrain: the licorice, ways round, the visitor in the way, a
   *  breather, off-camera placement) with the ring spot as its goal and its
   *  walking speeds × mul. */
  const _ra = { x: 0, z: 0 };
  function ritualRun(k, dt, t, p, dp, sx, sz, mul, giveUp = false) {
    const a = k.anchor;
    _ra.x = sx; _ra.z = sz;
    k.anchor = _ra; k.visc = mul; k.ritRun = true; navVis = true;
    try {
      // (the rite's own watchdog: no closer for a few seconds — give the
      // walk up now, the sunbather's way, not after strollBrain's budget)
      if (giveUp) { if (k.navMode !== NAV_DOOR && k.navMode !== NAV_OUT) strollGiveUp(k, 'ritual'); }
      else strollBrain(k, dt, t, p, dp);
    } finally { k.anchor = a; k.visc = 1; k.ritRun = false; navVis = false; }
  }
  function navReset(k) {
    k.navMode = NAV_PLAN; k.navAsk = -1; k.detOn = false; k.routeN = 0; k.routeI = 0; k.progT = 0; k.progBest = Infinity;
    k.breathT = 0; k.markFree = false; k.sideT = 0; k.sideS = 0;
  }

  function say(k, text, force = false) {
    if (sayCd > 0 && !force) return false;
    // (the portrait is always a gummy's: ui.say guesses the family from the
    // island, and on Cat Island a raider used to get a cat's face)
    ctx.systems.ui?.say(text, { speaker: k ? k.name : V.GANG, portrait: { family: 'sour', color: k ? k.color : 0x7fdc3a } });
    sayCd = force ? 2.6 : 5.0;
    return true;
  }
  function nextLine(k) {
    const pool = phase === 'hunting' ? (k.isl === 'cat' && V.RAID ? V.RAID : V.NIGHT) : (V.DAY[k.archetype] || V.DAY.giggler);
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
  function stepOK(x, z, r = BODY_R) { return landOK(x, z) && ringOK(x, z) && !blocked(x, z, r) && !salt.blocked(x, z) && !(tlN && !tigOff && inTiger(x, z, r)); }
  const SLIDE_SIGNS_POS = [1, -1], SLIDE_SIGNS_NEG = [-1, 1];
  /** WAVE 4: on Cat Island the cats' salt ring stands between the pier the
   *  pack came ashore at and everything else — a straight line through it is
   *  walked ROUND it (raid.wayTo: the tangent, then along its rim). The
   *  distance returned is still to the real goal. */
  //  Cat Island is not the raiders' home ground either: a hunter that has got
  //  nowhere for CAT_STALL s of trying (a harbour wall, a garden fence, the
  //  pier's rail) asks the Cat Island nav for a way round (catNav.wayRound,
  //  the same A* the Candyland strollers use) and follows it for ≤ 3 s.
  const _rw = { x: 0, z: 0 }, _rd = { x: 0, z: 0, n: 0 };
  const CAT_STALL = 1.4;
  function moveTo(k, tx, tz, speed, dt) {
    if (!(islCat && raid && !k.scripted)) return moveTo0(k, tx, tz, speed, dt);
    const dT = dist2d(k.x, k.z, tx, tz);
    if (k.rDetOn) {
      k.rDetT -= dt;
      const dd = moveTo0(k, k.rDetX, k.rDetZ, speed, dt);
      if (dd < 0.7 || k.rDetT <= 0) {
        k.rDetOn = false; k.markFree = false;
        // (kids fixer r1: at the waypoint the goal can still be round the
        // corner — the pier-head office at dawn. Walking straight at it again
        // led it back into the pocket it came out of, and it shuttled there
        // until the 60 s warp. The next leg is planned at once instead.)
        if (dd < 0.7 && dT > 2.2) k.rReplan = true;
      }
      return dT;
    }
    if (ringFree) { _rw.x = tx; _rw.z = tz; } else raid.wayTo(k, tx, tz, _rw);
    moveTo0(k, _rw.x, _rw.z, speed, dt);
    // the stall watch: only while it is actually trying to get somewhere
    if (dT > 2.2) {
      if (k.rProgT <= 0) { k.rProgX = k.x; k.rProgZ = k.z; }
      k.rProgT += dt;
      let ask = k.rReplan;
      if (!ask && k.rProgT >= CAT_STALL) {
        if (dist2d(k.x, k.z, k.rProgX, k.rProgZ) >= 0.8) k.rProgT = 0;
        else ask = true;
      }
      if (ask && catNavFrame !== frame) {
        // one A* a frame across the pack; out of budget (−1: the static
        // cache is still filling) = ask again on its next move
        catNavFrame = frame;
        let r = catNav.wayRound(k.x, k.z, _rw.x, _rw.z, k.r || BODY_R, _rd);
        k.markFree = false;
        // (walled in by keep-off marks alone — the plaza's ammo cache and its
        // halos across the one gap round the arrivals office: step through
        // them, carefully, this once, as the Candyland strollers do)
        if (r === 0) { r = catNav.wayRound(k.x, k.z, _rw.x, _rw.z, k.r || BODY_R, _rd, true); if (r === 1) k.markFree = true; }
        if (r === 1) { k.rDetOn = true; k.rDetX = _rd.x; k.rDetZ = _rd.z; k.rDetT = 3; catDetours++; k.rProgT = 0; k.rReplan = false; }
        else if (r === 0) { k.rProgT = 0; k.rReplan = false; k.rBoxed = true; }     // (boxed in: raid.js returnBrain gives a dawn walker up sooner)
      }
    } else { k.rProgT = 0; k.rReplan = false; }
    return dT;
  }
  let catDetours = 0, catNavFrame = -1;
  function moveTo0(k, tx, tz, speed, dt) {
    k.goalX = tx; k.goalZ = tz; k.goalF = frame;        // resolveLow: on the bench, or round it?
    speed *= k.visc;                                    // treading (fixer r2): the jitter is cut to a shuffle
    const dx = tx - k.x, dz = tz - k.z, d = Math.hypot(dx, dz);
    if (d < 1e-4) { k.moving = 0; return 0; }
    const ux = dx / d, uz = dz / d, r = k.r || BODY_R;
    const step = Math.min(d, speed * dt);
    const nx = k.x + ux * step, nz = k.z + uz * step;
    const okStep = stepOK(nx, nz, r);
    if (okStep && !markInto(k, nx, nz)) { k.x = nx; k.z = nz; k.moving = speed; k.desYaw = Math.atan2(ux, uz); return d; }
    // a star's ring / a pickup's halo in the way: round its rim, not a dead stop
    if (okStep && markRim(k, ux, uz, step, speed)) return d;
    // Contract A: walked into something solid — let the ground core slide us
    // along its face (boxes too), as long as that still gets us somewhere
    const pl = ctx.systems.player;
    if (pl && typeof pl.pushOut === 'function') {
      const q = pl.pushOut(nx, nz, r, _po);
      if (q.hit) {
        const mx = q.x - k.x, mz = q.z - k.z, len = Math.hypot(mx, mz);
        if (len > step * 0.3 && len < step * 1.8 && mx * ux + mz * uz > step * 0.05 &&
            landOK(q.x, q.z) && ringOK(q.x, q.z) && !salt.blocked(q.x, q.z) && !pl.pushOut(q.x, q.z, r, _po2).hit && !markInto(k, q.x, q.z) &&
            !(tlN && !tigOff && inTiger(q.x, q.z, r))) {
          k.x = q.x; k.z = q.z; k.moving = speed * Math.min(1, Math.max(0.45, len / step));
          k.desYaw = Math.atan2(mx, mz); return d;
        }
      }
    }
    // slide round the obstacle (or along the shore) rather than grinding into it
    for (const sgn of k.pathDir > 0 ? SLIDE_SIGNS_POS : SLIDE_SIGNS_NEG) {
      const sx = k.x - uz * step * sgn, sz = k.z + ux * step * sgn;
      if (stepOK(sx, sz, r) && !markInto(k, sx, sz)) {
        k.x = sx; k.z = sz; k.moving = speed * 0.62;
        k.desYaw = Math.atan2(-uz * sgn, ux * sgn); return d;
      }
    }
    // nowhere to go: that is a hit — the planners turn round on it
    k.moving = 0; k.desYaw = Math.atan2(ux, uz); k.bumped = true;
    return d;
  }
  // fixer r4: the pier's salt line eases a kid out — but never INTO the water a
  // walker may not enter (where the line runs along the shore, straight out
  // from the pier is the sea: a hunter whose lunge ended inside the line was
  // dragged in and melted as a 'walk'). Then along the line, else it stays.
  const SALT_OUT = [0.3, -0.3, 0.6, -0.6];
  function keepOutOfSalt(k, dt) {
    if (k.scripted) return;                     // on the rainbow's deck (raid.js)
    const d = dist2d(k.x, k.z, SZ.x, SZ.z);
    if (d < SZ.r) {
      const ux = (k.x - SZ.x) / (d || 1), uz = (k.z - SZ.z) / (d || 1);
      const tx = SZ.x + ux * (SZ.r + 0.6), tz = SZ.z + uz * (SZ.r + 0.6);
      const f = Math.min(1, dt * 4);
      let nx = lerp(k.x, tx, f), nz = lerp(k.z, tz, f);
      if (!landOK(nx, nz)) {
        let ok = false;
        const a0 = Math.atan2(uz, ux);
        for (let j = 0; j < SALT_OUT.length && !ok; j++) {
          const a = a0 + SALT_OUT[j];
          nx = lerp(k.x, SZ.x + Math.cos(a) * (SZ.r + 0.6), f); nz = lerp(k.z, SZ.z + Math.sin(a) * (SZ.r + 0.6), f);
          ok = landOK(nx, nz);
        }
        if (!ok) return;
      }
      k.x = nx; k.z = nz;
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
    k.goalX = ax; k.goalZ = az; k.goalF = frame;
    const nx = lerp(k.x, ax, Math.min(1, dt * rate)), nz = lerp(k.z, az, Math.min(1, dt * rate));
    if (stepOK(nx, nz, k.r)) { k.x = nx; k.z = nz; }
  }

  // ── day roles: one distinct pose set each ──────────────────────────────────
  const TAGGERS = kids.filter((k) => k.role === 'tag');

  /** Tag (fixer r2): the first open heading round 'away from it' — room for
   *  a real stride (1.2 u and 2.6 u out), not into the visitor, not off the
   *  plaza. NaN: cornered. */
  const FLEE_OFF = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8];
  function fleeHeading(k, it, p) {
    const base = Math.atan2(k.x - it.x, k.z - it.z), sg = k.pathDir || 1, r = k.r || BODY_R;
    const dA = dist2d(k.x, k.z, PLAZA.x, PLAZA.z);
    for (let j = 0; j < FLEE_OFF.length; j++) {
      const a = base + FLEE_OFF[j] * sg, sx = Math.sin(a), sz = Math.cos(a);
      const x2 = k.x + sx * 2.6, z2 = k.z + sz * 2.6;
      if (!stepOK(k.x + sx * 1.2, k.z + sz * 1.2, r) || !stepOK(x2, z2, r)) continue;
      if (markHit(x2, z2, r)) continue;
      if (dist2d(x2, z2, p.x, p.z) < 1.4 + r) continue;
      const dA2 = dist2d(x2, z2, PLAZA.x, PLAZA.z);
      if (dA2 > PLAZA.r + 1.5 && dA2 > dA) continue;
      return a;
    }
    return NaN;
  }

  function dayBrain(k, dt, t, p, dp) {
    // the morning after: first the turn back, then the walk back to work
    if (k.state === 'dawn') { dawnBrain(k, dt, t, p, dp); return; }
    // anchored at a pose spot (towel, step, lollipop, shrine) but somewhere
    // else entirely — a night out, a punt, a long flee: walk back, never the
    // old settleAt() lerp that zipped it there across the village in a second
    if (k.state === 'idle' && ANCHORED[k.role] && (k.x - k.anchor.x) ** 2 + (k.z - k.anchor.z) ** 2 > 9) { k.state = 'stroll'; k.strollT = 0; }
    if (k.state === 'stroll') { strollBrain(k, dt, t, p, dp); if (armed) threatDay(k, dt, t, p, dp); keepOutOfSalt(k, dt); return; }
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
    // wedged in a corner (the watch in update()): its way out comes first
    if ((k.wayAsk || k.wayOn || k.holdT > 0) && dayUnwedge(k, dt, t, p, dp)) {
      if (armed) threatDay(k, dt, t, p, dp);
      keepOutOfSalt(k, dt);
      return;
    }

    switch (k.role) {
      // ── TAG: full sprint, torso pitched forward, arms pumping overhead ─────
      case 'tag': {
        const group = TAGGERS;
        const it = group.find((g) => g.isIt) || group[0];
        if (k.isIt) {
          // chasing one it cannot reach (it fled into a fenced front garden, or
          // a pickup stands between them) for a whole stall window: pick on
          // somebody else for a few seconds instead of running on the spot
          if (k.swingT > 0) k.swingT -= dt;
          if (stalled(k, dt)) { k.swingT = 3; k.chaseSkip = k.chaseLast || null; }
          let best = null, bd = 1e9;
          for (const o of group) {
            if (o === k || (k.swingT > 0 && o === k.chaseSkip)) continue;
            const d = dist2d(k.x, k.z, o.x, o.z); if (d < bd) { bd = d; best = o; }
          }
          k.chaseLast = best;
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
          const dIt = dist2d(k.x, k.z, it.x, it.z), dA = dist2d(k.x, k.z, PLAZA.x, PLAZA.z);
          if (dA > PLAZA.r) {
            // wandered off the plaza: back into the game
            moveTo(k, PLAZA.x, PLAZA.z, 3.2, dt);
            k.armMode = 'run'; k.lean = damp(k.lean, 0.30, 6, dt);
          } else if (dIt > TAG_SAFE) {
            // 'it' is way over there: on its toes, keeping an eye on it
            // (fixer r2: fleeing flat out from a chaser across the plaza ran
            // them into its corners, running on the spot)
            k.moving = 0; k.fleeT = 0;
            faceThing(k, it.x, it.z, 5, dt);
            hopTick(k, dt, 4.2, 0.08);
            k.armMode = 'free'; k.lean = damp(k.lean, 0.1, 6, dt);
          } else {
            // a dodge that is really open: every 0.3 s the first of nine
            // headings round 'away from it' with room to run (a real kid
            // dodges; it does not moonwalk into the fence)
            k.fleeT -= dt;
            if (k.fleeT <= 0) { k.fleeT = 0.3; k.fleeA = fleeHeading(k, it, p); }
            if (k.fleeA === k.fleeA) {
              moveTo(k, k.x + Math.sin(k.fleeA) * 5, k.z + Math.cos(k.fleeA) * 5, dIt < 9 ? 4.7 : 3.2, dt);
              k.armMode = 'run';                      // arms thrown up, fleeing
              k.lean = damp(k.lean, 0.30, 6, dt);
            } else {
              // cornered: arms up, squealing, nowhere to go
              k.moving = 0;
              faceThing(k, it.x, it.z, 6, dt);
              k.armMode = 'up'; k.lean = damp(k.lean, -0.08, 6, dt);
              k.mouthOpen = damp(k.mouthOpen, 0.7, 8, dt);
            }
          }
        }
        k.mouthWide = damp(k.mouthWide, 0.6, 4, dt);
        k.gaitAmp = Math.max(k.gaitAmp, 0.85);
        if (k.moving > 0.5) hopTick(k, dt, 2.6, 0.07);
        k.timer -= dt;
        break;
      }
      // ── DANCE: bounce, arms up and waving, hips swinging round the fountain ─
      case 'dance': {
        // at walking pace round the ring: 0.52 rad/s on the widened ring (r ≈ 11)
        // ran the target round at 5.7 u/s, faster than a 2.6 u/s dancer, so the
        // dancers mostly bounced on the spot chasing a point they never reached
        k.orbit += dt * Math.min(0.52, 2.1 / Math.max(1, FOUNTAIN.r)) * k.orbitDir;
        // a lamp post or a flower bed on the ring and it stops dead: pick the
        // ring up again where it stands and dance back the other way (back and
        // forth along its free stretch of the ring reads as dancing; bouncing
        // on the spot chasing a point it cannot reach did not)
        if (k.holdT <= 0 && stalled(k, dt)) { k.orbit = Math.atan2(k.z - FOUNTAIN.z, k.x - FOUNTAIN.x); k.orbitDir *= -1; }
        const r = FOUNTAIN.r + Math.sin(t * 0.7 + k.ph * 6) * 0.5;
        // LEASH: one shove from the prop push-out used to be permanent — the
        // orbit target moved on without them and they never came back. Past
        // three metres off the ring, walk at the fountain until you are on it.
        const dF = dist2d(k.x, k.z, FOUNTAIN.x, FOUNTAIN.z);
        const far = dF > FOUNTAIN.r + 3.0;
        const tx = far ? FOUNTAIN.x : FOUNTAIN.x + Math.cos(k.orbit) * r;
        const tz = far ? FOUNTAIN.z : FOUNTAIN.z + Math.sin(k.orbit) * r;
        // wedged in a pocket (fixer r2, danceHold): it dances on the spot a
        // few seconds — bounce, arms, hips, no walking — then the other way
        if (k.holdT > 0) { k.holdT -= dt; k.moving = 0; faceThing(k, FOUNTAIN.x, FOUNTAIN.z, 3, dt); }
        else moveTo(k, tx, tz, far ? 3.4 : 2.6, dt);
        hopTick(k, dt, 7.4, 0.30);
        k.armMode = 'up';
        k.sway = damp(k.sway, Math.sin(t * 3.7 + k.ph * 6.28) * 0.26, 8, dt);
        k.headRoll = damp(k.headRoll, Math.sin(t * 3.7 + k.ph * 6.28 + 0.6) * 0.22, 8, dt);
        k.mouthOpen = damp(k.mouthOpen, 0.30 + Math.sin(t * 3.7 + k.ph * 6) * 0.16, 8, dt);
        if (k.holdT <= 0) k.moving = 1.2;
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

  // ── dawn: the turn back into a day kid ─────────────────────────────────────
  // Ben: "should not disappear but turn back into NPC's when the sun comes out".
  // In place, over DAWN_SEC, the light reaching each a moment apart: the grin
  // closes into the day mouth (slit 1 → 0), the heavy lids lift off the eyes,
  // the reach relaxes and the hunch unfolds; a sparkle-and-steam puff in its
  // own colour as it turns; in the back half a big stretch (arms up, leaning
  // back, stretched tall, eyes screwed shut, mouth wide — a yawn). Then it
  // walks back to its day spot. A kid that spent the night indoors steps out
  // of its own front door instead.
  const _dp = {};
  const DAWN_STEAM = [0xffffff, 0xfff6fb, 0xf4fbff];
  const HISS = [0xe8fff0, 0xffffff, 0xd8ffd0];
  function dawnPuff(k) {
    const ps = ctx.systems.particles; if (!ps?.burst) return;
    for (const key in _dp) delete _dp[key];
    const o = _dp;
    o.x = k.x; o.y = k.y + 0.9 * k.scale; o.z = k.z; o.count = 12; o.shape = 'sparkle'; o.blend = 'add';
    o.color = k._dawnCols || (k._dawnCols = [k.color, 0xffffff, 0xfff4c8]); o.speed = 2.2; o.up = 1.3; o.life = 0.8; o.lifeVar = 0.3;
    o.size = 0.55; o.sizeEnd = 0.03; o.sizeVar = 0.3; o.gravity = -1.5; o.drag = 1.6; o.spread = 0.45; o.spin = 1.2; o.alpha = 1; o.fadeOut = 0.5;
    ps.burst(o);
    for (const key in _dp) delete _dp[key];
    o.x = k.x; o.y = k.y + 1.1 * k.scale; o.z = k.z; o.count = 4; o.shape = 'puff';
    o.color = DAWN_STEAM; o.speed = 0.5; o.up = 1.2; o.life = 0.9; o.lifeVar = 0.3;
    o.size = 0.3; o.sizeEnd = 0.8; o.gravity = 0.9; o.drag = 1.4; o.spread = 0.3; o.alpha = 0.38; o.fadeOut = 0.6;
    ps.burst(o);
  }
  function dawnBrain(k, dt, t, p, dp) {
    k.dawnT += dt;
    const pr = clamp((k.dawnT - k.dawnDelay) / DAWN_SEC, 0, 1);
    const e = pr * pr * (3 - 2 * pr);
    k.moving = 0; k.gaitAmp = damp(k.gaitAmp, 0, 8, dt); k.hop = damp(k.hop, 0, 10, dt);
    k.lie = damp(k.lie, 0, 7, dt); k.sit = damp(k.sit, 0, 7, dt);
    k.kick = damp(k.kick, 0, 7, dt); k.cross = damp(k.cross, 0, 7, dt);
    k.freezeHead = 0; k.headBias = 0;
    if (k.dawnDoor) {
      // indoors all night: out of its own front door as the light comes
      if (pr > 0) { if (k.vis === 0) puff(k, 10, 0.8); k.vis = Math.min(1, k.vis + dt * 2.2); }
    } else k.vis = Math.min(1, k.vis + dt * 1.8);
    // the face and the body
    k.slit = k.dawnSlit * (1 - e);
    k.browOut = k.dawnBrow * (1 - e);
    k.crouch = k.dawnCrouch * (1 - e);
    if (pr < 0.5) {
      k.armMode = pr < 0.22 ? 'reach' : 'free';                  // the reach sags, the arms drop
      k.lean = lerp(k.dawnLean, 0, e);
      k.mouthOpen = damp(k.mouthOpen, 0, 7, dt);
      k.mouthWide = damp(k.mouthWide, 0.3, 4, dt);
      // it was touching the visitor: a gentle step back, nothing more
      if (dp < 1.7 && dp > 0.01 && !k.dawnDoor) {
        const dy = k.desYaw;
        moveTo(k, k.x + (k.x - p.x) / dp, k.z + (k.z - p.z) / dp, 1.1, dt);
        k.desYaw = dy;                                            // backing off, still facing him
      }
      k.moving = 0;
    } else {
      // the stretch-and-yawn: up on its toes, arms overhead, leaning back
      const y = Math.sin(clamp((pr - 0.5) / 0.46, 0, 1) * Math.PI);
      k.armMode = y > 0.12 ? 'up' : 'free';
      k.lean = -0.2 * y;
      k.squash = Math.max(k.squash, 0.13 * y);
      k.mouthOpen = 0.75 * y; k.mouthWide = 0.25 + 0.2 * y;
      k.eyesShut = 0.75 * y;
      k.headPitch = damp(k.headPitch, -0.28 * y, 8, dt);
    }
    if (!k.dawnFx && pr > 0.1) { k.dawnFx = true; if (k.vis > 0.3 || k.dawnDoor) dawnPuff(k); }
    if (k.dawnT >= k.dawnDelay + DAWN_SEC + 0.1) {
      k.eyesShut = 0; k.armMode = 'free'; k.crouch = 0; k.slit = 0; k.browOut = 0;
      if (k.sayCd <= 0 && dp < 26 && rand() < 0.5 && say(k, V.DAWN[k.lineIdx++ % V.DAWN.length])) k.sayCd = 20;
      // a raider on Cat Island: home over the rainbow (raid.js 'return')
      if (k.raid && raid.afterDawn(k)) return;
      // wanderers and followers just pick their day up from here; everyone
      // with a spot walks back to it
      const far = (k.x - k.anchor.x) ** 2 + (k.z - k.anchor.z) ** 2 > 2.25;
      if (k.role === 'wander' || k.role === 'follow' || !far) k.state = 'idle';
      else { k.state = 'stroll'; k.strollT = 0; }
    }
  }
  // ── the walk back to work (fixer r1) ───────────────────────────────────────
  // A straight line at a day spot up to ~100 u away wedged strollers for
  // minutes against a house, a fence, the syrup river or the star's ring, in
  // full view — and the only rescue (a 60 s warp) needed the visitor 55 u off.
  //  · PLAN (one kid a frame): straight there if the line is clear, else along
  //    the licorice paths (sourpatch/nav.js: over the bridges, never through
  //    the syrup), skipping ahead whenever a later waypoint — or the spot
  //    itself — is a clear straight walk.
  //  · A WAY ROUND: a new waypoint it cannot walk straight to, or no closer to
  //    one for PROG_SEC → a small A* (sourpatch/nav.js wayRound: round houses,
  //    fences, star rings, flower beds, salt, water) to the furthest point on
  //    the way it can walk straight to, then on again.
  //  · GIVE UP (DETOUR_MAX ways round that got it nowhere, or over its time
  //    budget): off camera it is simply put back; in view it walks in at
  //    the nearest front door it can reach and comes out at its own spot with
  //    a puff (no door in reach: a puff where it stands). Nobody stays in
  //    'stroll', and nobody walks on the spot (the gait follows real motion).
  const NAV_PLAN = 0, NAV_DIRECT = 1, NAV_PATH = 2, NAV_DOOR = 3, NAV_OUT = 4;
  const NAV_NAMES = ['plan', 'direct', 'path', 'door', 'out'];
  let navFrame = -1, strollWarps = 0;
  const nstat = { tokens: 0, routes: 0, detours: 0, throughMarks: 0, stuck: 0, retries: 0, expands: 0, doors: 0, poofs: 0, arrived: 0, rests: 0, sidesteps: 0 };
  const _hd = new Float32Array(N);
  const navLog = [];                          // the last few give-ups, for the verifier (allocates only when one fires)
  function navNote(k, why) {
    if (navLog.length >= 16) navLog.shift();
    navLog.push({ i: k.i, role: k.role, why, mode: NAV_NAMES[k.navMode], x: +k.x.toFixed(1), z: +k.z.toFixed(1),
      routeI: k.routeI, routeN: k.routeN, detours: k.detours, t: +k.strollT.toFixed(1), dA: +dist2d(k.x, k.z, k.anchor.x, k.anchor.z).toFixed(1) });
  }
  /** Planning is rationed: one kid a frame (a line test is ~100 pushOuts),
   *  and fairly — the kid that has been waiting longest goes first (the one
   *  that asked earliest among last frame's askers holds this frame's turn). */
  let navPrio = -1, navNext = -1, navNextAsk = Infinity;
  // (Contract O: while the whole village runs for the Sour Shrine at once,
  // RIT_TOKENS plans a frame instead of one — one a frame left the kids in
  // the visitor's sight milling in the plaza for most of the run)
  let navUsed = 0;
  const RIT_TOKENS = 4;
  function navToken(k) {
    if (k.navAsk < 0) k.navAsk = frame;
    if (navFrame !== frame) { navFrame = frame; navUsed = 0; }
    const cap = k.ritRun && ritual.running ? RIT_TOKENS : 1;
    if (navUsed >= cap || (navUsed === 0 && navPrio >= 0 && navPrio !== k.i)) {
      if (k.navAsk < navNextAsk) { navNextAsk = k.navAsk; navNext = k.i; }   // next frame's turn, if it waited longest
      return false;
    }
    navUsed++; k.navAsk = -1; nstat.tokens++;
    return true;
  }
  /** Once a frame, before the brains: whose turn it is. */
  function navTurn() { navPrio = navNext; navNext = -1; navNextAsk = Infinity; }
  let frusFrame = -1;
  /** Could the camera see a kid here? (frustum + distance; no camera: assume yes) */
  function inView(x, y, z) {
    const cam = ctx.camera;
    if (!cam || !cam.projectionMatrix) return true;
    if (frusFrame !== frame) {
      frusFrame = frame;
      cam.updateMatrixWorld();
      _cinv.copy(cam.matrixWorld).invert();
      _pmat.multiplyMatrices(cam.projectionMatrix, _cinv);
      _frus.setFromProjectionMatrix(_pmat);
    }
    const cp = cam.position;
    if ((x - cp.x) ** 2 + (y - cp.y) ** 2 + (z - cp.z) ** 2 > OFFCAM_R * OFFCAM_R) return false;
    _sph.center.set(x, y + 0.8, z); _sph.radius = 1.4;
    return _frus.intersectsSphere(_sph);
  }
  function navPlan(k, forcePath) {
    const ax = k.anchor.x, az = k.anchor.z, d = dist2d(k.x, k.z, ax, az);
    k.routeN = 0; k.routeI = 0; k.detOn = false; k.detours = 0; k.detBase = Infinity; k.progT = 0; k.progBest = Infinity; k.navChk = true;
    k.navMode = NAV_DIRECT; k.navForced = forcePath;
    let len = d;
    if (forcePath || d > 10) {
      const c = forcePath || d > 70 ? 1 : nav.lineClear(k.x, k.z, ax, az, k.r);
      if (c !== 0) {
        const n = nav.route(k.x, k.z, ax, az, k.r, k.route);
        if (n > 0 && (forcePath || c === 2 || nav.routeLen < d * 2.5 + 25)) {
          k.navMode = NAV_PATH; k.routeN = n; len = nav.routeLen; nstat.routes++;
        }
      }
    }
    if (!forcePath) k.navBudget = k.strollT + 12 + 1.6 * len / STROLL;
    else k.navBudget = Math.min(k.strollCap, k.navBudget + 10 + 1.2 * len / STROLL);
  }
  /** Reached a path waypoint: on to the next — or further, if it can see it. */
  function navAdvance(k) {
    k.routeI++; k.detours = 0; k.detBase = Infinity; k.progT = 0; k.progBest = Infinity; k.navChk = true;
    navSkip(k);
  }
  /** Straight to its spot if it can see it from here, else to the furthest of
   *  the next few path waypoints it can walk straight to. */
  function navSkip(k) {
    if (k.navMode !== NAV_PATH || k.routeI >= k.routeN || !navToken(k)) return;
    const ax = k.anchor.x, az = k.anchor.z;
    if (dist2d(k.x, k.z, ax, az) < 40 && nav.lineClear(k.x, k.z, ax, az, k.r) === 0) { k.routeI = k.routeN; return; }
    for (let j = Math.min(k.routeN - 1, k.routeI + 3); j > k.routeI; j--) {
      const n = k.route[j];
      if (nav.lineClear(k.x, k.z, nav.X[n], nav.Z[n], k.r) === 0) { k.routeI = j; return; }
    }
  }
  /** Put it back at its spot (off camera; also the end of a door / puff exit). */
  function strollPlace(k) {
    const a = k.anchor;
    const s = freeSpot(a.x, a.z, { pad: k.r, pathMargin: 0.4, rings: [0, 0.8, 1.6, 2.6] }) || a;
    k.x = s.x; k.z = s.z; k.px = k.x; k.pz = k.z; k.y = k.groundY = groundY(k.x, k.z);
    k.state = 'idle'; k.navMode = NAV_PLAN; k.moving = 0; k.detOn = false; k.markFree = false;
  }
  function strollArrive(k) { k.state = 'idle'; k.navMode = NAV_PLAN; k.breathT = 0; nstat.arrived++; }
  function strollGiveUp(k, why) {
    navNote(k, why);
    // a tagger, a dancer, a wanderer or a follower has no spot it must be ON:
    // wherever the walk gave out, it is back at its day — its role takes it
    // from here, and unwedge() gets it out of any corner (fixer r3: r2 let
    // only the ones within 8 u off, and a tagger 8.3 u from its spot, pressed
    // against the visitor, vanished in a puff at his feet). Never a door or a
    // puff; only one stranded far from its game (a dancer 28 u from the
    // fountain across a row of fences) is put back — where nobody can see.
    const seen = inView(k.x, k.y, k.z);
    // (Contract O: a kid on the run to the shrine has a spot it must be ON —
    // its place in the ring — so it gives up like a sunbather: put back
    // unseen, else in at a front door, else a breather)
    if (!ANCHORED[k.role] && !k.ritRun) {
      if (!seen && dist2d(k.x, k.z, k.anchor.x, k.anchor.z) > STRAND_R && dist2d(k.x, k.z, visX, visZ) > NO_PUFF_R) { strollPlace(k); strollWarps++; return; }
      strollArrive(k); return;
    }
    if (!seen) { strollPlace(k); strollWarps++; return; }
    // in view, and the visitor NO_PUFF_R off or more: in at the nearest front
    // door it can walk to (the last 1.2 u — the step itself — is the house's
    // business)…
    // (Contract O: a kid boxed in on its run to the shrine bolts for the
    // nearest front door even with him close by — just never at his feet)
    if (dist2d(k.x, k.z, visX, visZ) < (k.ritRun ? 4 : NO_PUFF_R)) { strollRest(k); return; }
    for (let j = 0; j < N; j++) _hd[j] = dist2d(k.x, k.z, kids[j].home.x, kids[j].home.z);
    for (let tries = 0; tries < 4; tries++) {
      let bj = -1, bd = 30;
      for (let j = 0; j < N; j++) if (_hd[j] < bd) { bd = _hd[j]; bj = j; }
      if (bj < 0) break;
      _hd[bj] = Infinity;
      const h = kids[bj].home, f = bd > 1.3 ? (bd - 1.2) / bd : 0;
      if (nav.lineClear(k.x, k.z, k.x + (h.x - k.x) * f, k.z + (h.z - k.z) * f, k.r) === 0) {
        k.navMode = NAV_DOOR; k.doorX = h.x; k.doorZ = h.z; k.detOn = false;
        k.progT = 0; k.progBest = Infinity; nstat.doors++;
        return;
      }
    }
    // …or, with no door in reach, NOT a puff (fixer r3: nobody vanishes in
    // view): a breather where it stands, then it plans again from there
    strollRest(k);
  }
  /** A breather in view (fixer r3, instead of a puff): it stands a couple of
   *  seconds, looks about, then plans the walk again with STROLL_MORE s more. */
  function strollRest(k) {
    k.breathT = BREATH_SEC[0] + ((k.i * 7 + nstat.rests * 3) % 11) / 11 * (BREATH_SEC[1] - BREATH_SEC[0]);
    if (k.ritRun) k.breathT = 0.5;              // (Contract O: on the run to the shrine, a beat — not a rest)
    k.navMode = NAV_PLAN; k.navAsk = -1; k.detOn = false; k.markFree = false; k.moving = 0;
    k.progT = 0; k.progBest = Infinity; k.sideT = 0; k.sideS = 0;
    k.strollCap = Math.max(k.strollCap, k.strollT + k.breathT + STROLL_MORE);
    nstat.rests++;
  }
  /** In at a front door: it fades out on the step and comes out at its spot.
   *  (Only ever at a door — the no-door puff is gone, see strollRest.) */
  function strollVanish(k) {
    if (k.navMode !== NAV_DOOR) nstat.poofs++;
    k.navMode = NAV_OUT; k.navFade = 1; k.moving = 0; k.detOn = false;
    puff(k, 10, 0.8);
  }
  // ── the visitor in the way (fixer r3) ─────────────────────────────────────
  // He is no wall the planners know about (nav.wayRound plans round houses,
  // not round him), so a stroller whose line runs through him walked into
  // his jumper, was shoved back out by separate() every frame and burned
  // eight ways round against him. Now: a stroller whose next SIDE_LOOK u of
  // line passes within VISITOR_R + k.r + SIDE_PAD of him steps round him,
  // on the side its waypoint lies (the other side if that one is walled),
  // for at most SIDE_MAX s — then the watchdog decides.
  const _vs = { x: 0, z: 0 };
  let visX = 1e9, visZ = 1e9, visY = 0;
  function visitorInWay(k, tx, tz, dt) {
    const vx = visX - k.x, vz = visZ - k.z, vd = Math.hypot(vx, vz);
    const block = VISITOR_R + k.r + SIDE_PAD;
    if (vd > block + SIDE_LOOK || vd < 1e-4 || eaten.active) { k.sideT = 0; k.sideS = 0; return false; }
    const dy = visY - k.y;
    if (dy > 1.4 * k.scale || dy < -1.7) return false;            // he is up on something / jumping over it
    const gx = tx - k.x, gz = tz - k.z, gd = Math.hypot(gx, gz);
    if (gd < 1e-4) return false;
    const along = (vx * gx + vz * gz) / gd, cross = vx * gz - vz * gx;
    if (along <= 0 || along > gd + block || Math.abs(cross) / gd >= block) { k.sideT = 0; k.sideS = 0; return false; }
    if (k.sideT > SIDE_MAX) return false;
    k.sideT += dt;
    if (!k.sideS) k.sideS = cross > 0 ? 1 : -1;                     // round the side its waypoint lies
    // along his rim (the tangent), eased outward when it is already too close
    const ux = vx / vd, uz = vz / vd, out = Math.max(0, (block + 0.25 - vd) / block);
    const sx = -uz * k.sideS - ux * out, sz = ux * k.sideS - uz * out, sl = Math.hypot(sx, sz) || 1;
    _vs.x = k.x + sx / sl * 1.2; _vs.z = k.z + sz / sl * 1.2;
    return true;
  }
  /** Gone in (at a door, or in a puff): fade out, then out at its own spot. */
  function strollOut(k, dt) {
    k.moving = 0;
    k.navFade -= dt * 2.6;
    k.vis = Math.max(0, k.navFade);
    if (k.navFade > 0) return;
    strollPlace(k);
    k.vis = 0;
    puff(k, 10, 0.8);
  }
  function strollBrain(k, dt, t, p, dp) {
    // a fresh walk — or back from being hit mid-walk: plan again from here
    if (k.strollT === 0 || frame - k.navLast > 2) { k.navMode = NAV_PLAN; k.navAsk = -1; }
    if (k.strollT === 0) { k.strollCap = STROLL_GIVEUP; k.breathT = 0; k.sideT = 0; k.sideS = 0; }
    k.navLast = frame;
    k.strollT += dt;
    k.lie = damp(k.lie, 0, 7, dt); k.sit = damp(k.sit, 0, 7, dt);
    k.kick = damp(k.kick, 0, 7, dt); k.cross = damp(k.cross, 0, 7, dt);
    k.eyesShut = damp(k.eyesShut, 0, 6, dt);
    k.armMode = 'behind';
    k.lean = damp(k.lean, 0.08, 4, dt);
    k.headBias = damp(k.headBias, Math.sin(t * 0.7 + k.ph * 6.28) * 0.18, 3, dt);
    k.mouthWide = damp(k.mouthWide, 0.32, 3, dt); k.mouthOpen = damp(k.mouthOpen, 0, 5, dt);
    if (k.navMode === NAV_OUT) { strollOut(k, dt); return; }
    k.vis = Math.min(1, k.vis + dt * 2);
    const ax = k.anchor.x, az = k.anchor.z;
    if (k.breathT > 0) {
      // a breather (strollRest): stands, looks at the visitor if he is close
      // (else toward where it is going), then plans again from here
      k.breathT -= dt; k.moving = 0; k.progT = 0;
      k.lean = damp(k.lean, 0.02, 4, dt);
      if (dp < 10) faceThing(k, p.x, p.z, 3, dt); else faceThing(k, ax, az, 2, dt);
      return;
    }
    if (k.navMode === NAV_PLAN) {
      if (!navToken(k)) { k.moving = 0; return; }        // someone else is planning this frame: a beat's pause
      navPlan(k, false);
    }
    // this frame's waypoint
    let tx = ax, tz = az;
    if (k.navMode === NAV_DOOR) { tx = k.doorX; tz = k.doorZ; }
    else if (k.detOn) { tx = k.detX; tz = k.detZ; }
    else if (k.navMode === NAV_PATH && k.routeI < k.routeN) { const n = k.route[k.routeI]; tx = nav.X[n]; tz = nav.Z[n]; }
    // a new waypoint it cannot walk straight to: the way round now, not after
    // grinding into the wall for two seconds
    if (k.navChk && k.navMode !== NAV_DOOR && !k.detOn && navToken(k)) {
      k.navChk = false;
      if (nav.lineClear(k.x, k.z, tx, tz, k.r) !== 0 && navWayRound(k, tx, tz) === 1) { tx = k.detX; tz = k.detZ; }
    }
    const dA2 = (k.x - ax) ** 2 + (k.z - az) ** 2;
    const spd = k.navMode === NAV_DOOR ? STROLL * 1.2 : (dA2 > 2025 ? STROLL_HURRY : dA2 > 625 ? STROLL_FAR : STROLL);
    let d;
    if (visitorInWay(k, tx, tz, dt)) {
      // round the visitor, not into him (he is not an obstacle the planners know)
      moveTo(k, _vs.x, _vs.z, spd, dt);
      if (k.moving < 0.01) k.sideS = -k.sideS;                  // walled on that side: the other way next
      d = dist2d(k.x, k.z, tx, tz);
      k.progT = 0; k.progBest = Math.min(k.progBest, d + 0.4);
    } else d = moveTo(k, tx, tz, spd, dt);
    // arrived: on its spot — or, a tagger or a dancer, back at the plaza with
    // nothing between it and its spot (fixer r1: 'within 6 u' alone left
    // dancers wedged behind a lamp post, dancing on the spot for minutes)
    const dA2n = (k.x - ax) ** 2 + (k.z - az) ** 2;
    if (k.navMode !== NAV_DOOR && (dA2n < 1.44 || (!ANCHORED[k.role] && !k.ritRun && dA2n < 36
      && (frame + k.i) % 6 === 0 && nav.lineClear(k.x, k.z, ax, az, k.r) === 0))) { strollArrive(k); return; }
    if (k.navMode === NAV_DOOR) {
      if (d < 1.1) { strollVanish(k); return; }
    } else if (k.detOn) {
      k.detT += dt;
      if (d < 0.5 || k.detT > 6) {
        k.detOn = false; k.markFree = false; k.progT = 0; k.progBest = Infinity; k.navChk = true;
        // the way round ended within reach of a path waypoint it cannot quite
        // stand on (a flower bed, a stall on the licorice): that one is done
        if (k.navMode === NAV_PATH && k.routeI < k.routeN) {
          const n = k.route[k.routeI];
          if ((nav.X[n] - k.x) ** 2 + (nav.Z[n] - k.z) ** 2 < 12.25) { navAdvance(k); return; }
        }
        navSkip(k);
        return;
      }
    } else if (k.navMode === NAV_PATH && k.routeI < k.routeN && d < NODE_R) {
      navAdvance(k); return;
    }
    // no closer for a while (a wall, a crowd, a ring it keeps sliding round)?
    if (d < k.progBest - 0.4) { k.progBest = d; k.progT = 0; } else k.progT += dt;
    const over = k.strollT > k.navBudget || k.strollT > k.strollCap;
    if ((k.progT > PROG_SEC || over) && navToken(k)) {
      k.progT = 0; k.progBest = d;
      // near enough: its own role settles it the last couple of metres
      if (k.navMode !== NAV_DOOR && (k.x - ax) ** 2 + (k.z - az) ** 2 < 8.4) { strollArrive(k); return; }
      // the door it was heading for is out of reach after all: put back if
      // no one can see, else a breather and a new plan (never a puff in view)
      if (k.navMode === NAV_DOOR) {
        navNote(k, 'door-stuck');
        if (!inView(k.x, k.y, k.z)) { strollPlace(k); strollWarps++; } else strollRest(k);
        return;
      }
      // pressed against the VISITOR (the sidestep above ran out): round him —
      // the other side this time — not a way round the map, which he is not on
      if (!over && dist2d(k.x, k.z, visX, visZ) < VISITOR_R + k.r + SIDE_PAD + 0.1) {
        const vx = visX - k.x, vz = visZ - k.z, vd = Math.hypot(vx, vz) || 1;
        k.sideS = k.sideS ? -k.sideS : 1; k.sideT = 0;
        const R = VISITOR_R + k.r + SIDE_PAD + 0.8;
        k.detX = visX - vz / vd * k.sideS * R + (tx - k.x) / (d || 1) * 0.6;
        k.detZ = visZ + vx / vd * k.sideS * R + (tz - k.z) / (d || 1) * 0.6;
        k.detOn = true; k.detT = 0; k.progBest = Infinity; nstat.sidesteps++;
        return;
      }
      if (over || k.detours >= DETOUR_MAX) {
        // straight at it has failed: try the licorice once before giving up
        if (!over && !k.navForced && k.navMode === NAV_DIRECT && dist2d(k.x, k.z, ax, az) > 6) {
          navPlan(k, true);
          if (k.navMode === NAV_PATH) return;
        }
        strollGiveUp(k, over ? 'budget' : 'detours');
        return;
      }
      // the waypoint it was making for (the real one, not an old way round)
      if (k.detOn) {
        k.detOn = false; k.markFree = false;
        if (k.navMode === NAV_PATH && k.routeI < k.routeN) { const n = k.route[k.routeI]; tx = nav.X[n]; tz = nav.Z[n]; }
        else { tx = ax; tz = az; }
      }
      navWayRound(k, tx, tz);
    }
  }
  /** Ask nav for a way round to (tx, tz): 1 = walking it, 0 = no closer from
   *  here (a path waypoint is skipped; otherwise it counts toward giving up),
   *  −1 = the planner ran out of this frame's budget (asks again next frame). */
  function navWayRound(k, tx, tz) {
    const dT = dist2d(k.x, k.z, tx, tz);
    if (dT < k.detBase - 1) k.detours = 0;              // the last ways round got it somewhere
    k.detBase = Math.min(k.detBase, dT);
    if (k.detours >= DETOUR_MAX) { k.progT = PROG_SEC; return 0; }   // enough: the watchdog gives the walk up
    let res = nav.wayRound(k.x, k.z, tx, tz, k.r, _det, false);
    nstat.expands += _det.n;
    k.markFree = false;
    // walled in by keep-off marks alone (a flower bed across the licorice, the
    // ants' lollipop in a gap): step through them, carefully, this once
    if (res === 0) {
      res = nav.wayRound(k.x, k.z, tx, tz, k.r, _det, true);
      nstat.expands += _det.n;
      if (res === 1) { k.markFree = true; nstat.throughMarks++; }
    }
    if (res === 1) {
      k.detOn = true; k.detX = _det.x; k.detZ = _det.z; k.detT = 0; k.detours++; nstat.detours++;
      k.progT = 0; k.progBest = Infinity;
    } else if (res === 0) {
      nstat.stuck++; k.detours += 2;
      if (k.navMode === NAV_PATH && k.routeI < k.routeN) { k.routeI++; k.navChk = true; }
    } else { nstat.retries++; k.progT = PROG_SEC; k.navChk = true; }
    return res;
  }

  // ── its track, and out of a corner (fixer r2) ─────────────────────────────
  /** Where it really went: a sample every TRK_DT s (see the gait guard). */
  function trkReset(k) {
    for (let j = 0; j < TRK_N; j++) { k.trkX[j] = k.x; k.trkZ[j] = k.z; k.trkO[j] = k.odo; }
    k.trkI = 0; k.trkT = 0; k.trkN = 1; k.trkNet = 0; k.tread = false;
  }
  function trkTick(k, dt) {
    k.trkT += dt;
    if (k.trkT >= TRK_DT) {
      k.trkT = k.trkT >= 2 * TRK_DT ? 0 : k.trkT - TRK_DT;
      k.trkI = (k.trkI + 1) % TRK_N;
      k.trkX[k.trkI] = k.x; k.trkZ[k.trkI] = k.z; k.trkO[k.trkI] = k.odo;
      if (k.trkN < TRK_N) k.trkN++;
    }
    const j = (k.trkI - TRK_BACK + TRK_N) % TRK_N;
    k.trkNet = Math.hypot(k.x - k.trkX[j], k.z - k.trkZ[j]);
    const path = k.odo - k.trkO[j];
    k.tread = k.trkN > TRK_BACK && k.trkNet < TREAD_NET && (path < TREAD_PATH || k.trkNet < path * TREAD_JIT);
  }
  // WEDGED (the watch in update()): a tagger backed into a corner, a dancer in
  // a pocket between a lamp post and a bench, a wanderer at the syrup's edge
  // with its licorice on the far bank (a night out ended there), a follower
  // nose to a fence. It gets out IN ITS ROLE, not on the walk back to work:
  //  · dance: it dances on the spot a few seconds, then the other way round
  //    (well off the ring — fixer r3 — a way round toward the fountain)
  //  · wander: onto the nearest licorice it can walk straight to
  //  · tag, follow (and a wanderer with no licorice in reach): a way round
  //    (nav.wayRound) toward open plaza / the visitor / where it was going,
  //    run or walked in role; if there is none, a breather where it stands
  const wstat = { wedged: 0, ways: 0, rejoins: 0, holds: 0 };
  const _nn = new Int16Array(8);
  function unwedge(k) {
    wstat.wedged++;
    // a dancer in a pocket OF THE RING dances on the spot; one stranded well
    // off it (fixer r3: a walk back that gave out 28 u from the fountain now
    // leaves it wherever it was) finds its way round like everyone else
    if (k.role === 'dance' && dist2d(k.x, k.z, FOUNTAIN.x, FOUNTAIN.z) < FOUNTAIN.r + 4) { danceHold(k); return; }
    k.wayAsk = true;                                  // planning is rationed: when it is this kid's turn
  }
  function danceHold(k) {
    k.holdT = 3 + rand() * 2; wstat.holds++;
    k.orbit = Math.atan2(k.z - FOUNTAIN.z, k.x - FOUNTAIN.x); k.orbitDir *= -1;
  }
  /** A wanderer that lost its path: the nearest licorice it can walk straight
   *  to (not the point it was already failing to reach). */
  function wanderRejoin(k) {
    const n = nav.near(k.x, k.z, _nn);
    for (let j = 0; j < n; j++) {
      const id = _nn[j];
      const q = world.nearestPath(nav.X[id], nav.Z[id], 'candy');
      const pi = q.path ? CANDY_PATHS.indexOf(q.path) : -1;
      if (pi < 0) continue;
      const w = world.pointOnPolyline(q.path.points, clamp(q.t + 0.025 * k.pathDir, 0, 1));
      if (dist2d(w.x, w.z, k.goalX, k.goalZ) < 1.5) continue;
      if (nav.lineClear(k.x, k.z, w.x, w.z, k.r) !== 0) continue;
      k.pathIdx = pi; k.pathT = q.t; k.turnCd = TURN_CD; wstat.rejoins++;
      return true;
    }
    return false;
  }
  /** Day, before the role: a wedged kid's way out (true = this frame is handled). */
  function dayUnwedge(k, dt, t, p, dp) {
    const tag = k.role === 'tag', follow = k.role === 'follow' && dp < 62 && onCandy(p.x, p.z);
    if (k.wayAsk && navToken(k)) {
      k.wayAsk = false;
      if (!tag && !follow && k.role !== 'dance' && wanderRejoin(k)) return false;
      const dance = k.role === 'dance';
      const tx = tag ? PLAZA.x : follow ? p.x : dance ? FOUNTAIN.x : k.goalX, tz = tag ? PLAZA.z : follow ? p.z : dance ? FOUNTAIN.z : k.goalZ;
      const res = nav.wayRound(k.x, k.z, tx, tz, k.r, _det, false);
      nstat.expands += _det.n;
      if (res === 1) { k.wayOn = true; k.wayX = _det.x; k.wayZ = _det.z; k.wayT = 0; wstat.ways++; }
      else if (res === -1) k.wayAsk = true;             // out of this frame's planning budget: next turn
      else { k.holdT = 2 + rand() * 1.5; wstat.holds++; }
    }
    if (k.wayOn) {
      k.wayT += dt;
      const d = moveTo(k, k.wayX, k.wayZ, tag ? 4.2 : follow ? 4.3 : 3.1, dt);
      k.armMode = tag ? 'run' : follow ? 'behind' : 'free';
      k.lean = damp(k.lean, tag ? 0.3 : 0.08, 6, dt);
      if (tag) { k.mouthWide = damp(k.mouthWide, 0.6, 4, dt); if (k.moving > 0.5) hopTick(k, dt, 2.6, 0.07); }
      if (d < 0.6 || k.wayT > WAY_SEC) { k.wayOn = false; if (tag) k.swingT = 0; }
      return true;
    }
    if (k.holdT > 0 && k.role !== 'dance') {
      // a breather: stands, faces what it wanted, gets its puff back
      k.holdT -= dt; k.moving = 0;
      k.armMode = follow ? 'behind' : 'free';
      k.lean = damp(k.lean, 0.04, 4, dt);
      if (follow) faceThing(k, p.x, p.z, 4, dt);
      else if ((k.goalX - k.x) ** 2 + (k.goalZ - k.z) ** 2 > 0.1) faceThing(k, k.goalX, k.goalZ, 2, dt);
      if (tag) k.mouthOpen = damp(k.mouthOpen, 0.35 + Math.sin(t * 7 + k.ph * 6) * 0.15, 8, dt);
      if (k.holdT <= 0 && !tag && !follow) { k.pathDir *= -1; k.pathOff = -k.pathOff; k.turnCd = TURN_CD; }
      return true;
    }
    return false;
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
    // Contract A: walked into something (or got pushed out of it) = turn round
    // …or walked on the spot for a whole stall window (the bank of the syrup
    // at a bridge's end, a crowd, a flower bed on the licorice): same thing
    const stuck = stalled(k, dt);
    if (((k.bumped || k.wasBumped) && k.moving < 0.5 || stuck) && k.turnCd <= 0) {
      k.pathDir *= -1; k.pathOff = -k.pathOff; k.turnCd = TURN_CD;
      k.pathT = clamp(k.pathT + 0.03 * k.pathDir, 0, 1);
    }
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
    }
    // (Contract O: after the freeze they no longer go indoors — they run for
    // the Sour Shrine: sourpatch/ritual.js brain())
  }

  // ── night: creep, ring, pounce ──────────────────────────────────────────────
  // TEN AT A TIME: only HUNT_CAP kids hold a hunting slot. `fresh` (the start
  // of the night) deals the slots out afresh — a different ten each night; a
  // mid-night respawn (the visitor jumped) keeps whoever already had one.
  let nightNo = 0;
  function spawnHunters(p, fresh = true) {
    // If you are not standing on Candyland (Cat Island, the ferry, the sea) they
    // do NOT materialise around you — they come out at home and walk to the salt.
    const aroundPlayer = onCandy(p.x, p.z);
    if (fresh) {
      nightNo++;
      let given = 0;
      for (const k of kids) { k.slot = false; k.lunge = 0; k.sated = false; k.lungeCd = 0; }
      for (let j = 0; j < N && given < HUNT_CAP; j++) {
        const k = kids[(j + nightNo * 7) % N];
        if (k.raid || hits.absent(k) || hits.melting(k) || k.gaveUp) continue;
        k.slot = true; given++;
      }
      lunger = null; night.lungeCd = LUNGE_EVERY[0] + rand() * (LUNGE_EVERY[1] - LUNGE_EVERY[0]);
    }
    for (const k of kids) {
      // a puddle of sugar does not report for the night shift, and neither does
      // one that has already been hit twice and gone home in a huff (and the
      // raiding pack is out on the rainbow / Cat Island: raid.js places it)
      if (k.raid || hits.absent(k) || hits.melting(k) || k.gaveUp) continue;
      if (k.hurt) hits.clear(k);
      // Contract O: revealed on screen at the shrine (or close to him) — it
      // hunts from where it stands, already the night rig
      if (fresh && ritual.keeps(k, p, aroundPlayer)) {
        k.state = 'stalk'; k.vis = 1; k.bursting = 0; k.burstT = 0;
        k.hop = 0; k.lie = 0; k.sit = 0; k.kick = 0; k.cross = 0; k.eyesShut = 0;
        k.slit = 1; k.browOut = 1; k.crouch = Math.max(k.crouch, 0.6);
        k.watchA = Math.atan2(k.z - p.z, k.x - p.x); k.orbit = k.watchA;
        k.saltA = Math.atan2(k.z - DOCK.z, k.x - DOCK.x);
        continue;
      }
      let x = k.home.x, z = k.home.z, ok = false;
      // a ring of shapes at the edge of the lamplight — never on top of you;
      // the ones without a slot further out still, where they will watch from
      if (aroundPlayer) for (let a = 0; a < 18 && !ok; a++) {
        const ang = rand() * 6.28, r = k.slot ? 11 + rand() * 8 : WATCH_R - 1 + rand() * 6;
        x = p.x + Math.sin(ang) * r; z = p.z + Math.cos(ang) * r;
        ok = landOK(x, z) && dist2d(x, z, DOCK.x, DOCK.z) > SAFE_R + 1 && !blocked(x, z) && !salt.blocked(x, z) && !lowNear(x, z, k.r);
      }
      // a quarter of them come out of their own front door instead
      if (!ok || (rand() < 0.25 && dist2d(k.home.x, k.home.z, p.x, p.z) < 26)) { const h = homeSpot(k); x = h.x; z = h.z; }
      k.x = x; k.z = z; k.y = k.groundY = groundY(x, z);
      pushOutOfProps(k); salt.push(k);
      if (water.wet(k.x, k.z)) { const h = homeSpot(k); k.x = h.x; k.z = h.z; k.y = k.groundY = groundY(k.x, k.z); }
      k.watchA = Math.atan2(k.z - p.z, k.x - p.x);
      k.vis = 0; k.state = 'stalk'; k.burstT = rand() * 0.5; k.bursting = 1;
      k.hop = 0; k.squash = 0; k.lie = 0; k.sit = 0; k.kick = 0; k.cross = 0; k.eyesShut = 0;
      k.slit = 1; k.browOut = 1; k.crouch = 0.8;
      k.saltA = Math.atan2(k.z - DOCK.z, k.x - DOCK.x);
    }
    if (fresh) { night.timer = 0; night.ready = 0; night.pounce = 0; }
  }

  // ── the hunt cap: who holds a slot ─────────────────────────────────────────
  /** Out tonight, and able to come after him: not a puddle, not sulking at
   *  home, not melting, not gone home full or in a huff. */
  function slotEligible(k) {
    if (hits.melting(k) || hits.absent(k) || k.gaveUp) return false;
    return !(k.hurt && k.hurt.mode === 'gohome');
  }
  let huntN = 0, watchN = 0, stepIns = 0, released = 0;
  /** Release the slots of hunters that are out of it; hand free slots to the
   *  watchers nearest the visitor (nearest the pier while he is safe or off
   *  the island). Zero allocation: N is 24. */
  function assignSlots(p, focusX, focusZ, raidN = 0) {
    let n = 0, w = 0;
    // WAVE 4: raiders hunting on Cat Island hold their own slots (set in
    // update()); Candyland gets what is left of the ten
    const cap = HUNT_CAP - raidN;
    for (const k of kids) {
      if (k.raid) continue;
      if (k.slot && !slotEligible(k)) { k.slot = false; k.lunge = 0; released++; if (lunger === k) lunger = null; }
      if (k.slot) n++;
    }
    while (n > cap) {
      // the pack just came ashore: the Candyland slots furthest from the focus go back to watching
      let worst = null, wd = -1;
      for (const k of kids) {
        if (k.raid || !k.slot) continue;
        const d = (k.x - focusX) ** 2 + (k.z - focusZ) ** 2;
        if (d > wd) { wd = d; worst = k; }
      }
      if (!worst) break;
      worst.slot = false; worst.lunge = 0; if (lunger === worst) lunger = null; n--; released++;
    }
    while (n < cap) {
      let best = null, bd = Infinity;
      for (const k of kids) {
        if (k.raid || k.slot || k.hurt || !slotEligible(k) || k.vis < 0.3) continue;
        const d = (k.x - focusX) ** 2 + (k.z - focusZ) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      if (!best) break;
      best.slot = true; n++; stepIns++;
      // the step in: a hop, a head snap, and sometimes it says so
      best.hopT = 0; best.squash = -0.16; best.burstT = 0; best.bursting = 0;
      best.orbit = Math.atan2(best.z - p.z, best.x - p.x);
      if (night.timer > 2 && best.sayCd <= 0 && rand() < 0.5 && say(best, V.STEPIN[best.lineIdx++ % V.STEPIN.length])) best.sayCd = 16;
    }
    for (const k of kids) if (!k.raid && !k.slot && slotEligible(k)) w++;
    huntN = n + raidN; watchN = w;
  }

  /**
   * WATCHING: out tonight but without a slot. They hang at the edge of the
   * light — a loose ring WATCH_R (+ its own 0–4 u) round the visitor, or just
   * behind the hunters at the salt line when he is on the pier — crouched,
   * swaying, eyes glowing, drifting slowly round, and never any closer.
   */
  function watchBrain(k, dt, t, p, dp, playerSafe, reachable) {
    const atDock = playerSafe || !reachable;
    const fx = atDock ? SZ.x : p.x, fz = atDock ? SZ.z : p.z;
    const R = (atDock ? SZ.r + WATCH_DOCK : WATCH_R) + k.watchJit;
    const cur = Math.atan2(k.z - fz, k.x - fx);
    k.watchA = angDamp(k.watchA, cur, 0.6, dt) + k.orbitDir * 0.07 * dt;
    if ((k.bumped || k.wasBumped) && k.turnCd <= 0) { k.orbitDir *= -1; k.turnCd = TURN_CD; }
    if (stalled(k, dt)) { k.watchA += k.orbitDir * 0.5; if (k.stalls % 2 === 0) k.orbitDir *= -1; }
    let tx = fx + Math.cos(k.watchA) * R, tz = fz + Math.sin(k.watchA) * R;
    // its spot on the ring is in the water or the river's sugar crust (fixer
    // r3: pinned against the crust, two watchers stood 14 u from him all
    // night): the nearest dry spot round the ring instead
    if (!landOK(tx, tz)) {
      for (let j = 1; j <= 10; j++) {
        const a1 = k.watchA + j * 0.13 * k.orbitDir, a2 = k.watchA - j * 0.13 * k.orbitDir;
        const x1 = fx + Math.cos(a1) * R, z1 = fz + Math.sin(a1) * R;
        if (landOK(x1, z1)) { tx = x1; tz = z1; break; }
        const x2 = fx + Math.cos(a2) * R, z2 = fz + Math.sin(a2) * R;
        if (landOK(x2, z2)) { tx = x2; tz = z2; break; }
      }
    }
    const dT = dist2d(k.x, k.z, tx, tz);
    const dF = dist2d(k.x, k.z, fx, fz);
    if (dF < R - 2.5) moveTo(k, tx, tz, 2.8, dt);                   // too close: back off to the edge
    else if (dT > 1.4 && k.bursting) moveTo(k, tx, tz, dT > 9 ? 3.6 : 1.3, dt);
    else k.moving = 0;
    faceThing(k, p.x, p.z, 4, dt);
    k.armMode = 'free';
    k.lean = damp(k.lean, 0.22, 3, dt);
    k.sway = damp(k.sway, Math.sin(t * 0.8 + k.ph * 6.28) * 0.09, 3, dt);
    k.headRoll = damp(k.headRoll, (k.i % 2 ? 1 : -1) * 0.22, 2, dt);
    k.mouthOpen = damp(k.mouthOpen, 0, 5, dt);
    if (rand() < dt * 0.12) { k.hopT = 0; hopTick(k, dt, 9, 0.05); }
    if (dp < 34 && reachable && k.sayCd <= 0 && rand() < dt * 0.02) {
      if (say(k, V.WATCH[k.lineIdx++ % V.WATCH.length])) k.sayCd = 30; else k.sayCd = 3;
    }
    keepOutOfSalt(k, dt);
  }

  /** A little hiss of steam from the mouth. */
  const _hs = {};
  function hiss(k) {
    const ps = ctx.systems.particles; if (!ps?.burst) return;
    for (const key in _hs) delete _hs[key];
    const o = _hs;
    o.x = k.x + Math.sin(k.yaw) * 0.38 * k.scale; o.y = k.y + 1.15 * k.scale; o.z = k.z + Math.cos(k.yaw) * 0.38 * k.scale;
    o.count = 4; o.shape = 'puff'; o.color = HISS;
    o.speed = 1.2; o.up = 0.5; o.life = 0.7; o.lifeVar = 0.3; o.size = 0.2; o.sizeEnd = 0.6;
    o.gravity = 0.8; o.drag = 2.2; o.spread = 0.12; o.alpha = 0.55; o.fadeOut = 0.6;
    ps.burst(o);
  }
  /**
   * THE VISITOR IS STANDING IN THE WATER. The hunters come as close as the
   * water lets them (it is a wall: they stop at the shore and slide along it),
   * PACE the waterline back and forth, lean out, paw and hiss. Every 6–10 s
   * the scheduler in update() picks one to over-commit: its `lunge` lets it
   * into the water (wetOK) and it goes for him — and melts (lungeBrain).
   */
  function shoreBrain(k, dt, t, p, dp) {
    if (k.lunge > 0) { lungeBrain(k, dt, p); return; }
    // pace: along the shore toward a slot close to him, turning back at every
    // snag — the water stops them, so the ring collapses onto the waterline
    if ((k.bumped || k.wasBumped) && k.turnCd <= 0) { k.orbitDir *= -1; k.turnCd = 1.6; }
    if (stalled(k, dt) && k.turnCd <= 0) { k.orbitDir *= -1; k.turnCd = 1.6; }
    k.orbit += dt * 0.55 * k.orbitDir;
    spaceSlot(k, p, dp, 2.5, dt);
    const tx = p.x + Math.cos(k.orbit) * 2.2, tz = p.z + Math.sin(k.orbit) * 2.2;
    if (k.bursting) moveTo(k, tx, tz, dp > 14 ? 4.2 : 2.2, dt); else k.moving = 0;
    faceThing(k, p.x, p.z, 6, dt);
    k.armMode = 'paw';
    k.lean = damp(k.lean, 0.44, 4, dt);
    k.hissT -= dt;
    if (k.hissT <= 0) {
      k.hissT = 2.2 + rand() * 3.5;
      if (dp < 30) { hiss(k); k.mouthOpen = 0.55; k.hopT = 0; hopTick(k, dt, 9, 0.07); }
      if (dp < 28 && k.sayCd <= 0 && rand() < 0.35 && say(k, V.SHORE[k.lineIdx++ % V.SHORE.length])) k.sayCd = 16;
    }
    k.mouthOpen = damp(k.mouthOpen, 0.12, 3, dt);
  }

  /**
   * THE OVER-COMMIT (fixer r4). It goes for him, and the water is what it
   * finds. Verifier: a hunter 1.00 u from a visitor wading a step off the
   * sand 'lunged' six times in a minute, on the spot, and never went in —
   * HIS OWN BODY stood between it and the water, separate() shoved it back
   * out of his jumper every frame, so k.moving read 6.4 u/s and the old
   * stuck test (k.moving < 0.01) never fired. Now:
   *  · it steps round his RIM (visitorInWay), the way that reaches water
   *    soonest without crossing the pier's salt line (lungeSide), into that
   *    water — and melts;
   *  · PINNED all the same is judged by NET DISPLACEMENT (under LUNGE_NET u
   *    in LUNGE_WIN s): it thinks better of it, sits out the over-commits
   *    for LUNGE_BENCH s (k.lungeCd, per kid), and the next nearest with a
   *    clear line gets its chance a second later;
   *  · pinned at the top of a STEEP bank (the water only reachable by a
   *    drop, LEAP_DROP or more below its feet, LEAP_R away, nothing solid
   *    in between), it commits anyway: a hop off the edge into the water.
   * A lunge that runs its LUNGE_SEC out dry is benched the same way.
   */
  function lungeBrain(k, dt, p) {
    k.lunge -= dt;
    faceThing(k, p.x, p.z, 10, dt);
    k.armMode = 'reach'; k.lean = damp(k.lean, 0.5, 8, dt);
    k.mouthOpen = damp(k.mouthOpen, 0.8, 8, dt);
    if (k.leapOn) {
      // the hop: straight off the edge (the line was checked when it chose
      // it); its feet are in the water the moment it clears the bank
      const dx = k.leapX - k.x, dz = k.leapZ - k.z, d = Math.hypot(dx, dz);
      const st = Math.min(d, LEAP_SPEED * dt);
      if (d > 1e-3) { k.x += dx / d * st; k.z += dz / d * st; k.desYaw = Math.atan2(dx, dz); }
      k.moving = LEAP_SPEED; k.leapT += dt;
      hopTick(k, dt, 9, 0.3);
      k.lunge = Math.max(k.lunge, dt * 2);                 // still over-committed until its feet are wet
      if (k.leapT > 1.0) lungeBalk(k);                     // (never: the landing is water — but never forever)
      return;
    }
    // where it REALLY went: the net displacement over the last LUNGE_WIN s
    k.lungeWT += dt;
    if (k.lungeWT >= LUNGE_WIN) {
      const moved = Math.hypot(k.x - k.lungeWX, k.z - k.lungeWZ);
      k.lungeWT = 0; k.lungeWX = k.x; k.lungeWZ = k.z;
      if (moved < LUNGE_NET) {
        if (leapFind(k, p)) { k.leapOn = true; k.leapT = 0; k.hopT = 0; k.squash = -0.25; lungeStat.leaps++; return; }
        lungeBalk(k); return;
      }
    }
    // his own body between it and the water: round his rim, the deeper side
    if (lungeBlocked(k, p)) {
      if (!k.sideS) k.sideS = lungeSide(k, p);
    } else k.sideS = 0;
    if (k.sideS && visitorInWay(k, p.x, p.z, dt)) {
      moveTo(k, _vs.x, _vs.z, 6.4, dt);
      if (k.moving < 0.01) k.sideS = -k.sideS;            // walled on that side: the other way next
      else lungeStat.rim++;
    } else moveTo(k, p.x, p.z, 6.4, dt);
    hopTick(k, dt, 11, 0.12);
    if (k.lunge <= 0) {                                   // ran its time out, dry: benched like a balk
      k.lungeCd = LUNGE_BENCH;
      if (lunger === k) lunger = null;
    }
  }
  /** Is it his body, not the water, that it meets going straight at him? Close
   *  to him (within SIDE_LOOK of stepping round him) with no water on the
   *  line before it would touch his jumper. Water first: straight in. */
  function lungeBlocked(k, p) {
    const vx = p.x - k.x, vz = p.z - k.z, vd = Math.hypot(vx, vz);
    if (vd > VISITOR_R + k.r + SIDE_PAD + SIDE_LOOK || vd < 1e-4) return false;
    const reach = vd - (VISITOR_R + k.r);                  // where separate() stops it
    for (let q = 0.25; q <= reach + 1e-3; q += 0.25) if (water.wet(k.x + vx / vd * q, k.z + vz / vd * q)) return false;
    return true;
  }
  /** A pinned lunger thinks better of it: benched, and the next nearest goes. */
  function lungeBalk(k) {
    lungeStat.balked++;
    k.lunge = 0; k.leapOn = false; k.lungeCd = LUNGE_BENCH;
    if (lunger === k) lunger = null;
    night.lungeCd = Math.min(night.lungeCd, 1.0);
  }
  /** Which way round him (visitorInWay's sideS): the way that reaches water
   *  soonest along his rim, walked in RIM_STEP steps each way until it finds
   *  water, the pier's salt line (it would be shoved straight back out of it
   *  — keepOutOfSalt), salt or something solid; neither way: the side where
   *  the water beside him is deeper. −1 walks it round toward increasing
   *  atan2(z − his z, x − his x) (visitorInWay's tangent is (−uz·sideS,
   *  ux·sideS), u the unit line from it to him), +1 the other way. */
  function lungeSide(k, p) {
    const a0 = Math.atan2(k.z - p.z, k.x - p.x), R = VISITOR_R + k.r + SIDE_PAD + 0.1;
    let best = 0, bestN = 99, deep = 0;
    for (let sg = -1; sg <= 1; sg += 2) {                 // sg +1: toward increasing angle
      for (let n = 1; n <= RIM_N; n++) {
        const a = a0 + sg * n * RIM_STEP, x = p.x + Math.cos(a) * R, z = p.z + Math.sin(a) * R;
        if (dist2d(x, z, SZ.x, SZ.z) < SZ.r || salt.blocked(x, z) || blocked(x, z, k.r * 0.8)) break;
        if (water.wet(x, z)) { if (n < bestN) { bestN = n; best = sg; } break; }
      }
      const a = a0 + sg * Math.PI * 0.5;
      deep += sg * clamp(water.depth(p.x + Math.cos(a) * R, p.z + Math.sin(a) * R), -1, 2);
    }
    if (!best) best = deep >= 0 ? 1 : -1;
    return best > 0 ? -1 : 1;
  }
  /** A STEEP bank: water it can only reach by a drop, a hop away toward him
   *  (LEAP_FAN × LEAP_R), its feet LEAP_DROP or more over that water, and
   *  nothing solid, no salt, not him, between. → true and leapX/leapZ. */
  function leapFind(k, p) {
    const b = Math.atan2(p.x - k.x, p.z - k.z);
    for (let i = 0; i < LEAP_FAN.length; i++) {
      const a = b + LEAP_FAN[i], sx = Math.sin(a), sz = Math.cos(a);
      for (let j = 0; j < LEAP_R.length; j++) {
        const r = LEAP_R[j], x = k.x + sx * r, z = k.z + sz * r;
        if (!homeWater(x, z)) continue;
        water.depth(x, z);
        if (!(k.groundY - water.surf >= LEAP_DROP)) break;          // a wade, not a drop: no hop this way
        if (dist2d(x, z, SZ.x, SZ.z) < SZ.r) break;                   // never over the pier's salt line
        // not into him, nor over him
        const t = clamp(((p.x - k.x) * sx + (p.z - k.z) * sz) / r, 0, 1);
        if (dist2d(p.x, p.z, k.x + sx * r * t, k.z + sz * r * t) < VISITOR_R + k.r * 0.6) break;
        let clear = !blocked(x, z, k.r * 0.7);
        for (let q = 0.3; clear && q < r; q += 0.3) {
          const qx = k.x + sx * q, qz = k.z + sz * q;
          if (blocked(qx, qz, k.r * 0.5) || salt.blocked(qx, qz)) clear = false;
        }
        if (!clear) break;
        k.leapX = x; k.leapZ = z;
        return true;
      }
    }
    return false;
  }

  /** Pressed up against the salt, pacing sideways, pawing at the line. */
  function saltLine(k, dt, t, p, dp) {
    const pa = Math.atan2(p.z - SZ.z, p.x - SZ.x);
    // (the cats' ring is wider than the pier's: the same body-width apart)
    // (the pack at the cats' ring spreads along it in column order: a siege, not a queue)
    const slotA = islCat ? ((k.rord + 0.5) / Math.max(1, raid.pack.length) - 0.5) * 1.7 : k.saltSlot;
    const want = pa + slotA + Math.sin(t * 0.5 + k.ph * 6.28) * 0.055 * k.orbitDir;
    k.saltA = angDamp(k.saltA, want, 1.5, dt);
    const rr = SZ.r + 0.85;
    let tx = SZ.x + Math.cos(k.saltA) * rr, tz = SZ.z + Math.sin(k.saltA) * rr;
    if (!landOK(tx, tz)) {
      // that stretch of the line is out over the water: shuffle along it
      for (let s = 1; s <= 16; s++) {
        const a2 = k.saltA + s * 0.19 * (s % 2 ? 1 : -1);
        const x2 = SZ.x + Math.cos(a2) * rr, z2 = SZ.z + Math.sin(a2) * rr;
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
      const pool = islCat && V.CATSALT ? V.CATSALT : V.SALTY;
      if (say(k, pool[k.lineIdx++ % pool.length])) { night.saltCd = 14; k.sayCd = 20; }
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

  /** An even ring: a hunter whose slot another hunter at about the same range
   *  already holds slides its own slot away round the circle — the planner
   *  half of the pack spacing (separate() is the body half). */
  function spaceSlot(k, p, dp, ring, dt) {
    for (const o of kids) {
      if (o === k || o.vis < 0.5 || o.hurt) continue;
      const ox = o.x - p.x, oz = o.z - p.z;
      if (Math.abs(Math.hypot(ox, oz) - Math.min(dp, ring + 1.2)) > 3) continue;
      let da = Math.atan2(oz, ox) - k.orbit; da = Math.atan2(Math.sin(da), Math.cos(da));
      const gapA = (k.r + o.r) * HUNT_GAP / Math.max(3, ring);
      if (Math.abs(da) < gapA) k.orbit -= (da < 0 ? -1 : 1) * dt * 1.6 * (1 - Math.abs(da) / gapA);
    }
  }

  /** True once per 0.9 s window in which a hunter that wanted to move got
   *  nowhere (two of them jammed against one fence, each sliding into the
   *  other): the planners read it like a bump. */
  function stalled(k, dt) {
    k.stallT += dt;
    if (k.stallT < 0.9) return false;
    const moved = Math.hypot(k.x - k.stallX, k.z - k.stallZ);
    k.stallT = 0; k.stallX = k.x; k.stallZ = k.z;
    if (moved > 0.4) return false;
    k.stalls++;
    return true;
  }

  function nightBrain(k, dt, t, p, dp, playerSafe, reachable) {
    k.vis = Math.min(1, k.vis + dt * 1.8);
    k.lie = 0; k.sit = 0; k.kick = 0; k.cross = 0; k.eyesShut = 0;
    k.headBias = 0;
    if (!k.slot) {
      // no slot tonight (yet): twitchy, but only at the edge of the light
      k.burstT -= dt;
      if (k.burstT <= 0) { k.bursting = k.bursting ? 0 : 1; k.burstT = k.bursting ? 0.4 + rand() * 0.6 : 0.5 + rand() * 1.2; }
      if (night.sated > 0) { k.moving = 0; faceThing(k, p.x, p.z, 3, dt); return; }
      watchBrain(k, dt, t, p, dp, playerSafe, reachable);
      return;
    }
    k.armMode = dp < 30 ? 'reach' : 'free';
    k.lean = damp(k.lean, dp < 34 ? 0.34 : 0.14, 4, dt);

    if (night.sated > 0) {                       // sated: shuffle off into the dark
      let away = Math.atan2(k.x - p.x, k.z - p.z);
      // "away" ran into the sea or the salt: shuffle off along the shore instead
      // of walking on the spot for the whole 22 s
      if (k.swingT > 0) { k.swingT -= dt; away = k.fleeA; }
      else if (stalled(k, dt)) { k.fleeA = away + k.orbitDir * (1.3 + rand() * 0.8); k.swingT = 2.5; away = k.fleeA; }
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

    const rushing = night.pounce > 0 && dp < 16 && !playerWalled && !visitorWet;
    const ring = k.ringR + (armed ? ARMED_RING : 0);      // holding something? we circle wider
    if (playerSafe && !rushing) {
      saltLine(k, dt, t, p, dp);
    } else if (visitorWet && reachable) {
      shoreBrain(k, dt, t, p, dp);
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
      const dDock = dist2d(k.x, k.z, SZ.x, SZ.z);
      if (dDock > SZ.r + 2.0) { if (k.bursting) moveTo(k, SZ.x, SZ.z, 2.8, dt); else k.moving = 0; }
      else { k.moving = 0; keepOutOfSalt(k, dt); }
      faceThing(k, p.x, p.z, 3, dt);
      k.armMode = 'paw';
    } else if (dp > ring + 1.2) {
      // come in toward its OWN slot on the ring (the ring point on its side of
      // you), not straight at your throat: a pack fans out as it arrives
      // instead of queueing nose-to-tail into one heap (critic: "brown, green
      // and yellow kids stack inside each other")
      if (k.swingT > 0) k.swingT -= dt;
      else k.orbit = angDamp(k.orbit, Math.atan2(k.z - p.z, k.x - p.x), 0.7, dt);
      // walled in (a fenced front garden between it and you): swing its line
      // of approach round until one opens, instead of standing nose to the fence
      if (k.bumped || k.wasBumped) k.orbit += k.orbitDir * dt * 2.2;
      if (stalled(k, dt)) { k.orbit += k.orbitDir * 1.0; k.swingT = 2.5; if (k.stalls % 2 === 0) k.orbitDir *= -1; }
      spaceSlot(k, p, dp, ring, dt);
      const tx = p.x + Math.cos(k.orbit) * ring, tz = p.z + Math.sin(k.orbit) * ring;
      // (a raider still streets away on Cat Island scurries — it came a long
      // way for this; the twitching starts when it is close)
      const scurry = islCat && dp > 26;
      if (k.bursting || scurry) moveTo(k, tx, tz, dp < 12 || scurry ? 5.4 : 3.8, dt);
      else k.moving = 0;
      faceThing(k, p.x, p.z, 6, dt);
    } else {
      // circle: the dread part (hit something? go round the other way)
      if ((k.bumped || k.wasBumped) && k.turnCd <= 0) { k.orbitDir *= -1; k.turnCd = TURN_CD; }
      if (stalled(k, dt) && k.turnCd <= 0) { k.orbitDir *= -1; k.turnCd = TURN_CD; }
      k.orbit += dt * 0.7 * k.orbitDir;
      spaceSlot(k, p, dp, ring, dt);
      const tx = p.x + Math.cos(k.orbit) * ring, tz = p.z + Math.sin(k.orbit) * ring;
      if (k.bursting) moveTo(k, tx, tz, 3.2, dt); else k.moving = 0;
      faceThing(k, p.x, p.z, 7, dt);
    }
    if (!rushing && !playerSafe) k.mouthOpen = damp(k.mouthOpen, 0, 5, dt);
    keepOutOfSalt(k, dt);
  }

  // ── Contract B: the visitor ate an invincibility star ──────────────────────
  // Everyone within STAR_FLEE_R runs for it — sunbathers leap up, hunters drop
  // the hunt — fanning out rather than queueing; the far ones cower with their
  // hands up and watch. Touching him is handled in update() (hits.bounce).
  function starBrain(k, dt, t, p, dp) {
    k.lie = damp(k.lie, 0, 9, dt); k.sit = damp(k.sit, 0, 9, dt);
    k.kick = damp(k.kick, 0, 9, dt); k.cross = damp(k.cross, 0, 9, dt);
    k.eyesShut = damp(k.eyesShut, 0, 9, dt);
    k.freezeHead = 0; k.headBias = 0;
    if (k.state !== 'idle') { if (k.gotHat) props.hat.visible = false; k.gotHat = false; k.state = 'idle'; }
    if (dp < STAR_FLEE_R) {
      const away = Math.atan2(k.x - p.x, k.z - p.z);
      const fan = Math.sin(t * 2.3 + k.ph * 6.28) * 0.55 + (k.orbitDir * 0.35);
      moveTo(k, k.x + Math.sin(away + fan) * 6, k.z + Math.cos(away + fan) * 6, dp < 8 ? 6.6 : 5.2, dt);
      if (k.moving === 0 && (k.bumped || k.wasBumped) && k.turnCd <= 0) { k.orbitDir *= -1; k.turnCd = 0.8; }
      k.armMode = 'run';
      k.lean = damp(k.lean, 0.36, 6, dt);
      k.gaitAmp = Math.max(k.gaitAmp, 0.9);
      k.mouthOpen = damp(k.mouthOpen, 0.8, 8, dt); k.mouthWide = damp(k.mouthWide, 1, 8, dt);
      if (k.moving > 0.5) hopTick(k, dt, 3.4, 0.09);
    } else {
      k.moving = 0;
      faceThing(k, p.x, p.z, 5, dt);
      k.armMode = 'up';
      k.lean = damp(k.lean, -0.2, 4, dt);
      k.sway = Math.sin(t * 17 + k.ph * 6.28) * 0.07;          // trembling
      k.mouthWide = damp(k.mouthWide, 0.9, 4, dt);
    }
    keepOutOfSalt(k, dt);
  }

  // ── phase machine ──────────────────────────────────────────────────────────
  function setPhase(next, p) {
    const prev = phase; phase = next; phaseT = 0;
    // DAWN: the clock ran out of the night (or was set into the early morning):
    // everyone turns back where they stand. A jump to midday snaps, as before.
    const tm = ctx.state.time;
    const dawn = prev === 'hunting' && next === 'playful' && (!timeJump || (tm >= DAWN_HOURS[0] && tm < DAWN_HOURS[1]));
    if (dawn) {
      // who was out and who was indoors — read BEFORE the reset wipes it
      for (const k of kids) {
        k.dawnFrom = hits.melting(k) ? 'pool' : ((k.hurt && k.hurt.mode === 'sulk') || k.vis < 0.05) ? 'indoors' : 'out';
      }
    }
    // a new phase forgives everything except being a puddle: bruises, dizziness
    // and last night's grudges are wiped, dissolves run their full 25 seconds.
    if (prev !== null) hits.reset(true);
    if (next !== 'hunting') { for (const k of kids) { k.slot = false; k.lunge = 0; k.sated = false; } lunger = null; visitorWet = false; }
    if (next === 'playful') {
      duskStage = 0; duskToast = false; duskTilt = 0;
      if (dawn) startDawn(p);
      else {
        dawnHold = 0;
        for (const k of kids) {
          if (hits.melting(k)) continue;
          k.state = 'idle'; k.vis = prev === null ? 1 : 0.35; k.mouthOpen = 0; k.headRoll = 0; k.crouch = 0;
          if (prev !== null) { k.x = k.anchor.x; k.z = k.anchor.z; k.y = k.groundY = groundY(k.x, k.z); }
        }
      }
    }
    if (next === 'watching') {
      duskStage = 0; duskToast = false; duskTilt = 0;
      for (const k of kids) { if (hits.melting(k)) continue; k.state = 'idle'; k.vis = Math.max(k.vis, 1); }
      enterRite(timeJump || prev === null);
    }
    props.hat.visible = false;
    if (next === 'hunting') { spawnHunters(p); night.sated = 0; }
    if (prev === 'watching') ritual.end(eyeLights);
    raid.onPhase(next, prev, p, dawn, timeJump);   // (a jump into the morning: the pack is placed by raid.js THE CLOCK)
    if (prev) {
      ctx.events.emit('sourpatch:phase', { phase: next, prev });
      // at night they still have names; you are just less sure they will answer to them
      for (const e of entries) e.label = next === 'hunting' ? `Plead with ${kids[e.ki].name}` : `Talk to ${kids[e.ki].name}`;
    }
  }

  /** Sunrise on a night's hunt: every kid still out turns back in place (the
   *  dawn brain), the ones indoors come out of their doors, the pounce is off. */
  function startDawn(p) {
    let n = 0;
    for (const k of kids) {
      if (hits.melting(k)) continue;
      if (k.raid && raid.dawn(k)) continue;                   // on the rainbow: it just turns round (raid.js)
      k.state = 'dawn'; k.dawnT = 0;
      k.dawnDelay = ((k.i * 7) % N) / N * DAWN_SPREAD;         // the light reaches each a moment apart
      k.dawnSlit = k.slit; k.dawnBrow = k.browOut; k.dawnCrouch = k.crouch; k.dawnLean = k.lean;
      k.dawnFx = false; k.strollT = 0; k.gotHat = false; k.gaveUp = false; k.swingT = 0; k.air = 0;
      k.dawnDoor = k.dawnFrom === 'indoors';
      if (k.dawnDoor) {
        // it spent the night inside: it steps out of its own front door
        const h = homeSpot(k);
        k.x = h.x; k.z = h.z; k.y = k.groundY = groundY(k.x, k.z); k.vis = 0;
        k.slit = 0; k.browOut = 0; k.crouch = 0; k.dawnSlit = 0; k.dawnBrow = 0; k.dawnCrouch = 0;
      } else n++;
    }
    night.pounce = 0; night.ready = 0; night.sated = 0;
    props.hat.visible = false;
    dawnHold = 1; dawnCount = n; dawns++;
    ctx.events.emit('sourpatch:dawn', { count: n });
    const pl = ctx.systems.player?.position;
    if (n && pl && onCandy(pl.x, pl.z)) ctx.systems.ui?.toast(`The sun comes up. The ${V.GANG} remember their manners.`, 4);
  }

  /** Its feet are in the water: melt (hits.waterMelt) and leave a pool of its
   *  own colour floating where it went in. */
  function meltInWater(k, whyOverride) {
    water.depth(k.x, k.z);
    const surf = Number.isFinite(water.surf) ? water.surf : k.groundY;
    const kind = water.kind || 'water';
    const why = whyOverride || (k.lunge > 0 ? 'lunge' : k.hurt ? (k.hurt.mode === 'fly' ? 'fly' : k.hurt.mode) : 'walk');
    if (k.state === 'steal' && k.gotHat) props.hat.visible = false;
    if (lunger === k) lunger = null;
    k.slot = false; k.lunge = 0;
    const wx = k.x, wz = k.z;
    if (!hits.waterMelt(k, wx, wz, surf, kind, why)) return false;
    meltWhy[why] = (meltWhy[why] || 0) + 1;
    if (meltLog.length >= 8) meltLog.shift();        // the last few, for the verifier (allocates only on a melt)
    meltLog.push({ i: k.i, why, role: k.role, state: k.state, phase, x: +wx.toFixed(2), z: +wz.toFixed(2), px: +k.px.toFixed(2), pz: +k.pz.toFixed(2), kind });
    puddles.spawn(wx, wz, k.color, k.i, WATER_POOL_DELAY);
    const pl = ctx.systems.player?.position;
    if (!meltToast && pl && dist2d(pl.x, pl.z, wx, wz) < 40) {
      meltToast = true;
      ctx.systems.ui?.toast(`${V.GANG} can't swim. Noted.`, 3.5);
    }
    return true;
  }
  const WATER_POOL_DELAY = 0.35;

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
      if (!c || c.box || !Number.isFinite(c.r)) continue;          // boxes have no r
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
        for (const c of ctx.colliders || []) {
          if (!c || !(c.x <= 0)) continue;
          const cr = c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0);
          if (!(cr >= 0.3)) continue;
          if (dist2d(c.x, c.z, x, z) < 7) n += cr;
        }
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
      if (!blocked(k.home.x, k.home.z) && !nearWater(k.home.x, k.home.z)) continue;
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
  // Contract A: the player calibrates its low props against the drawn meshes on
  // the first frame after world:ready (some become SOLID, ghosts retire) —
  // after that, re-check every pose spot and front door once.
  let revalidated = false;
  function revalidate() {
    revalidated = true;
    rebuildLow();
    rebuildMarks();
    for (const k of kids) {
      // posed kids AND every morning spawn spot: nothing solid, and fully off
      // any bench (a sunbather half on a seat edge is the straddle again) —
      // nor lying in a flower bed or on top of a pickup
      const straddle = lowNear(k.anchor.x, k.anchor.z, k.r) || markHit(k.anchor.x, k.anchor.z, k.r);
      if ((ANCHORED[k.role] && k.role !== 'shrine' && blocked(k.anchor.x, k.anchor.z, k.r)) || straddle) {
        const s = freeSpot(k.anchor.x, k.anchor.z, { pad: k.r, pathMargin: straddle ? 0.4 : 0.8, rings: [0.5, 0.8, 1.4, 2.2, 3.2, 4.4, 6] });
        if (s) {
          const moveKid = straddle && dist2d(k.x, k.z, k.anchor.x, k.anchor.z) < 0.05;
          k.anchor.x = s.x; k.anchor.z = s.z;
          if (moveKid) { k.x = s.x; k.z = s.z; }
        }
      }
      if (blocked(k.home.x, k.home.z, BODY_R) || lowNear(k.home.x, k.home.z, BODY_R) || markHit(k.home.x, k.home.z, BODY_R) || nearWater(k.home.x, k.home.z)) {
        const s = freeSpot(k.home.x, k.home.z, { pathMargin: 0.6, minHeight: 0.9, rings: [1.4, 2.6, 4, 6, 8, 11] });
        if (s) { k.home.x = s.x; k.home.z = s.z; }
      }
    }
  }

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

  /** debug.dunk: kid i (or the nearest visible slot holder to (x, z)) to (x, z). */
  function dunkNow(i, x, z) {
    let k = kids[i] || null;
    if (!k) {
      let bd = Infinity;
      for (const o of kids) {
        if (!o.slot || o.hurt || o.vis < 0.8) continue;
        const d = dist2d(o.x, o.z, x, z);
        if (d < bd) { bd = d; k = o; }
      }
    }
    if (!k || hits.melting(k)) return false;
    k.x = x; k.z = z; k.px = x; k.pz = z; k.vis = Math.max(k.vis, 1);
    k.y = k.groundY = groundY(x, z);
    if (water.wet(x, z)) meltInWater(k, 'dunk');
    return k.i;
  }

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
    /** Contract A verifier hook: every kid's body circle and where its feet are.
     *  y = feet (ground + air: `air` > 0 only mid-punt, < 0 only while
     *  dissolving). vis < 0.05 = indoors / a puddle (not drawn). */
    debugPositions() {
      const out = [];
      for (const k of kids) {
        out.push({ x: k.x, y: k.y, z: k.z, r: k.r, kind: 'sourpatch', name: k.name, role: k.role,
          state: k.hurt?.mode || k.state, vis: k.vis, air: k.air || 0, feet: k.groundY, onProp: k.onProp,
          i: k.i, color: k.color, slot: k.slot, lunge: k.lunge > 0, cause: k.hurt?.cause || null,
          night: phase !== 'hunting' ? null : (k.slot ? 'hunting' : (slotEligible(k) ? 'watching' : 'out')),
          nav: k.state === 'stroll' ? NAV_NAMES[k.navMode] : null, moving: k.moving,
          gaitAmp: k.gaitAmp, tread: k.tread, out: k.wayOn ? 'way' : k.holdT > 0 ? 'hold' : k.wayAsk ? 'ask' : null,
          raid: k.raid || null, isl: k.isl });
      }
      return out;
    },
    stats() {
      let visible = 0, hurting = 0, dizzy = 0, fleeing = 0, stunned = 0, dissolving = 0, puddles = 0, home = 0;
      let onProp = 0, bumps = 0, shrunk = 0, stuck = 0, spinning = 0, staggering = 0, panicking = 0;
      for (const k of kids) {
        if (k.vis > 0.5) visible++;
        if (k.onProp) onProp++;
        bumps += k.bumps;
        if (k.shrinkT > 0) shrunk++;
        const m = k.hurt?.mode;
        if (m === 'stuck') stuck++; else if (m === 'spin') spinning++;
        else if (m === 'stagger') staggering++; else if (m === 'panic') panicking++;
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
        reacting: { hurting, dizzy, fleeing, stunned, dissolving, puddles, gaveUpAtHome: home, stuck, spinning, staggering, panicking, shrunk },
        ground: { onProp, bumps, unsticks, unstickLog: unstickLog.slice(), api: typeof ctx.systems.player?.pushOut === 'function',
          low: { props: lowN - lowGhosts, ghosts: lowGhosts, hopOn: lowStats.on, keptOff: lowStats.off, unstick: lowStats.unstick, fail: lowStats.fail, ms: lowStats.ms, maxMs: lowStats.maxMs },
          marks: { n: markN, pushes: markPushes } },
        star: starOn,
        hunt: { pounce: night.pounce > 0, ready: +night.ready.toFixed(2), sated: night.sated > 0 },
        // 2026-09-23: ten at a time, the water, the dawn
        hunting: phase === 'hunting' ? huntN : 0, watching: phase === 'hunting' ? watchN : 0, cap: HUNT_CAP,
        slots: { stepIns, released },
        shore: { visitorWet, lunges, ...lungeStat, lunging: !!lunger, puddles: puddles.active, meltsByWhy: { ...meltWhy }, meltLog: meltLog.slice() },
        dawn: { dawns, lastCount: dawnCount, hold: +dawnHold.toFixed(2), strollWarps,
          nav: { ...nstat, nodes: nav.nodes, warps: strollWarps, log: navLog.slice() },
          wedge: { ...wstat, treading: kids.reduce((a, k) => a + (k.tread && k.vis > 0.5 && k.gaitAmp > 0.3 ? 1 : 0), 0) },
          turning: kids.reduce((a, k) => a + (k.state === 'dawn' ? 1 : 0), 0),
          strolling: kids.reduce((a, k) => a + (k.state === 'stroll' ? 1 : 0), 0) },
        ...hits.counters(),
        // WAVE 4: the pack over the rainbow (sourpatch/raid.js)
        raid: { ...raid.stats(), catDetours, tigers: { circles: tgN, pushes: tigPushes, escapes: tigEscapes, frames: tigFrames } },
        ritual: ritual.stats(),
      };
    },
    /** The pools of liquid on the water: api.puddles.list() / .active / .mesh */
    puddles,
    /** Verifier / render hooks. None of these run unless called. */
    /** WAVE 4: the raid (sourpatch/raid.js) — ring, landfall, pack, respawn. */
    raid,
    /** Contract O: the dusk rite (sourpatch/ritual.js) — rt, stage, torches, stats(). */
    ritual,
    /** The phase the clock alone gives (a verifier's expectation). */
    phaseAt: (tm) => clockPhase(tm),
    debug: {
      /** Contract O: pose the dusk rite at rt seconds after the 18:30 freeze
       *  (≥ 12.4: in the rings; 3.2–12.4: the procession up the forest path).
       *  Applied once the phase is 'watching' — set the clock to the matching
       *  hour (18.5 + rt / 12.5) for the sky. */
      ritual(rt = 20) { return ritual.debug(rt); },
      /** Render hook: turn the visitor to face (x, z) — a view's framing of
       *  the rite (player.facing is his public setter). */
      faceVisitor(x, z) {
        const pl = ctx.systems.player; if (!pl?.position) return false;
        pl.facing = Math.atan2(x - pl.position.x, z - pl.position.z); return true;
      },
      /** WAVE 4: pose the raiding pack — 'cross' (on the rainbow at fraction f),
       *  'home' (the dawn walk home over it at f), 'hunt' (round the visitor on
       *  Cat Island). Sets story rainbow_bridge / bridge.debugRaise() itself. */
      raid(mode = 'cross', f = 0.5, opts = null) { return raid.debug.raid(mode, f, opts); },
      raidPath() { return raid.debug.path(); },
      /** Play the "you were a snack" card now: where 'cat' wakes him in the
       *  cats' refuge (the raid's respawn), anything else at Sugar Pier. */
      eaten(where = 'candy') { eaten.cancel(); eaten.trigger(where === 'cat' ? raid.respawn : undefined); return true; },
      /** A dawn walker's roads home: its planned catNav.route nodes [[x, z]…] and where it is along them. */
      raidRoute(i) {
        const k = kids[i]; if (!k || !k.rRoute) return null;
        const pts = [];
        for (let j = 0; j < Math.max(0, k.rRouteN); j++) { const n = k.rRoute[j]; pts.push([+catNav.X[n].toFixed(1), +catNav.Z[n].toFixed(1)]); }
        return { n: k.rRouteN, at: k.rRouteI, pts, stuck: +(k.rStuckT || 0).toFixed(1), nodes: catNav.nodes };
      },
      /** What stops a raider-sized body (r) at (x, z) on Cat Island? '' = open;
       *  L land/water · R the cats' ring · S salt · B solid · M mark · W wet ·
       *  H not walkable · T a tiger (within 7 u of (x, z)) · P the side of a
       *  low prop (a bench, a planter). mode 'return': the
       *  dawn walker (the ring does not stop it). */
      raidWhy(x, z, r = KID_R, mode = 'hunt') {
        const fake = { isl: 'cat', raid: mode, x, z, scripted: false };
        setIsl(fake);
        try {
          return `${landOK(x, z) ? '' : 'L'}${ringOK(x, z) ? '' : 'R'}${salt.blocked(x, z) ? 'S' : ''}${blocked(x, z, r) ? 'B' : ''}${markHit(x, z, r) ? 'M' : ''}${water.wet(x, z) ? 'W' : ''}${walkHere(x, z) ? '' : 'H'}${tlN && inTiger(x, z, r, 0) ? 'T' : ''}${lowNear(x, z, r) && lowClash(x, z, r, groundY(x, z)) ? 'P' : ''}`;
        } finally { setIsl(null); }
      },
      /** Why can't raider i move (on its own island's terms)? 16 steps round it,
       *  its ring-detour waypoint toward (tx, tz) and the Cat Island A* result. */
      raidProbe(i, tx, tz, step = 0.6) {
        const k = kids[i]; if (!k) return null;
        setIsl(k);
        try {
          const why = (x, z) => `${landOK(x, z) ? '' : 'L'}${ringOK(x, z) ? '' : 'R'}${salt.blocked(x, z) ? 'S' : ''}${blocked(x, z, k.r) ? 'B' : ''}${markHit(x, z, k.r) ? 'M' : ''}${water.wet(x, z) ? 'W' : ''}${walkHere(x, z) ? '' : 'H'}` || 'ok';
          const ring = [];
          for (let a = 0; a < 16; a++) { const ang = a / 16 * Math.PI * 2; ring.push(why(k.x + Math.cos(ang) * step, k.z + Math.sin(ang) * step)); }
          const w = { x: tx ?? k.x, z: tz ?? k.z }; if (!ringFree) raid.wayTo(k, tx ?? k.x, tz ?? k.z, w);
          const o = { x: 0, z: 0, n: 0 };
          let res = islCat ? catNav.wayRound(k.x, k.z, w.x, w.z, k.r, o) : null;
          if (res === 0) res = catNav.wayRound(k.x, k.z, w.x, w.z, k.r, o, true) === 1 ? 'marks' : 0;
          return { i, name: k.name, x: +k.x.toFixed(2), z: +k.z.toFixed(2), isl: k.isl, raid: k.raid, state: k.state, slot: k.slot, here: why(k.x, k.z), ring: ring.join(' '),
            way: [+w.x.toFixed(1), +w.z.toFixed(1)], astar: res, det: [+o.x.toFixed(1), +o.z.toFixed(1), o.n], detOn: k.rDetOn, moving: k.moving, bursting: k.bursting, hurt: k.hurt?.mode || null };
        } finally { setIsl(null); }
      },
      /** Put kid i (−1: the visible hunting-slot kid nearest (x, z)) at (x, z)
       *  — in the water, say — after `delay` s. */
      dunk(i, x, z, delay = 0) {
        if (delay > 0) { dunkAt.push({ t: delay, i, x, z }); return true; }
        return dunkNow(i, x, z);
      },
      /** Make the scheduler fire an over-commit at each of these times (s). */
      lungeAt(...ts) { for (const t of ts) if (Number.isFinite(t)) lungeAt.push(t); return lungeAt.length; },
      /** Fast-forward just the kids through `sec` of night where they stand
       *  (renders of the dawn turn); the clock is left exactly as it was. */
      rehearseNight(sec = 7) {
        const st = ctx.state, keep = { time: st.time, isNight: st.isNight, daylight: st.daylight };
        st.time = 23; st.isNight = true; st.daylight = 0;
        const n = Math.max(1, Math.round(sec * 30));
        try { for (let j = 0; j < n; j++) api.update(1 / 30, ctx); }
        finally { st.time = keep.time; st.isNight = keep.isNight; st.daylight = keep.daylight; }
        return huntN;
      },
      water(x, z) { const d = water.depth(x, z); return { depth: +d.toFixed(3), kind: water.kind, surf: water.surf, dip: +water.dip.toFixed(3), wet: water.wet(x, z), lip: +water.lipSink(x, z).toFixed(3) }; },
      /** Why can't kid i walk from where it stands? Its own spot and 16 steps round it. */
      navProbe(i, step = 0.6) {
        const k = kids[i]; if (!k) return null;
        const why = (x, z) => `${landOK(x, z) ? '' : 'L'}${salt.blocked(x, z) ? 'S' : ''}${blocked(x, z, k.r) ? 'B' : ''}${markHit(x, z, k.r) ? 'M' : ''}` || 'ok';
        const ring = [];
        for (let a = 0; a < 16; a++) { const ang = a / 16 * Math.PI * 2; ring.push(why(k.x + Math.cos(ang) * step, k.z + Math.sin(ang) * step)); }
        return { i, x: k.x, z: k.z, r: k.r, here: why(k.x, k.z), ring: ring.join(' '), state: k.state, nav: NAV_NAMES[k.navMode],
          target: k.routeI < k.routeN ? [nav.X[k.route[k.routeI]], nav.Z[k.route[k.routeI]]] : [k.anchor.x, k.anchor.z], onProp: k.onProp };
      },
      /** nav.lineClear between two points for a kid-sized body: 0 clear, 1 solid/salt/mark, 2 water. */
      navLine(x0, z0, x1, z1, r = KID_R) { return nav.lineClear(x0, z0, x1, z1, r); },
      /** Kid i's planned licorice route: [[x, z], …] from its current waypoint on. */
      navRoute(i) {
        const k = kids[i]; if (!k) return null;
        const out = [];
        for (let j = k.routeI; j < k.routeN; j++) out.push([+nav.X[k.route[j]].toFixed(1), +nav.Z[k.route[j]].toFixed(1)]);
        return out;
      },
      /** Run the way-round planner for kid i toward (tx, tz) (default: its anchor). */
      navWay(i, tx, tz) {
        const k = kids[i]; if (!k) return null;
        const o = { x: 0, z: 0, n: 0 };
        const res = nav.wayRound(k.x, k.z, tx ?? k.anchor.x, tz ?? k.anchor.z, k.r, o);
        return { res, n: o.n, x: o.x, z: o.z, from: [k.x, k.z], inMark: markHit(k.x, k.z, k.r), line: nav.lineClear(k.x, k.z, tx ?? k.anchor.x, tz ?? k.anchor.z, k.r) };
      },
    },

    update(dt, ctx) {
      const t = ctx.state.elapsed;
      const pl = ctx.systems.player; if (!pl) return;
      const p = pl.position;
      if (!revalidated && pl.colliderAudit) revalidate();
      frame++; lowSync(dt); navTurn();
      visX = p.x; visZ = p.z; visY = p.y ?? 0;           // the strollers step round him (visitorInWay)
      markAge += dt; if (markAge > MARK_AGE) rebuildMarks();
      // Contract B: is the visitor invincible right now?
      const wasStar = starOn;
      starOn = !!ctx.systems.powerups?.active;
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
      const want = wantPhase(time);
      if (want !== phase) setPhase(want, p);
      else if (timeJump && phase === 'watching') enterRite(true);     // a jump inside the rite: where its clock has them
      api.phase = phase; phaseT += dt;

      // the star lands: the nearest kid that can see it screams about it
      starSayCd = Math.max(0, starSayCd - dt);
      if (starOn && !wasStar && p.x < -18) {
        let near = null, nd = 30;
        for (const k of kids) { if (k.vis < 0.5 || hits.absent(k)) continue; const d = dist2d(k.x, k.z, p.x, p.z); if (d < nd) { nd = d; near = k; } }
        if (near) { say(near, V.STAR[near.lineIdx++ % V.STAR.length], true); starSayCd = 4; }
        props.hat.visible = false;
      }

      // big player jumps (teleport / ferry / respawn): keep the cast on stage
      const jumped = _pp.copy(p).distanceTo(lastPlayer) > 20;
      lastPlayer.copy(p);
      if (jumped) {
        if (phase === 'hunting') spawnHunters(p, false);
        else if (phase === 'playful') for (const k of kids) {
          if (k.role !== 'follow' || k.raid) continue;
          const a = k.ph * 6.28;
          const x = p.x + Math.sin(a) * k.standoff, z = p.z + Math.cos(a) * k.standoff;
          if (landOK(x, z)) { k.x = x; k.z = z; k.y = k.groundY = groundY(x, z); k.vis = 1; }
        }
      }

      if (phase === 'hunting') night.timer += dt;
      if (night.sated > 0) night.sated -= dt;

      // WAVE 4: where the visitor is, for the raid — on the rainbow's deck he is
      // on neither island (the truce); on Cat Island the cats' ring is a refuge
      const onDeck = raid.on && raid.onDeck(p);
      const playerOnCandy = p.x < -18 && !pl.onFerry && !onDeck;
      const playerSafe = dist2d(p.x, p.z, DOCK.x, DOCK.z) < SAFE_R;
      // (not flying over it, not in a canoe off its beach: on his feet, near the ground)
      const playerOnCat = raid.on && !pl.onFerry && !pl.onVehicle && !onDeck && p.x > 18 && world.islandAt(p.x, p.z) === 'cat' && (p.y ?? 0) - world.height(p.x, p.z) < 4.5;
      const playerSafeCat = playerOnCat && raid.ringIn(p.x, p.z);
      rinfo.playerOnCat = playerOnCat; rinfo.playerOnBridge = onDeck; rinfo.playerOnCandy = playerOnCandy; rinfo.playerSafeCat = playerSafeCat;
      raid.update(dt, t, p, rinfo);
      gatherTigers();                 // (kids fixer r1: tigers are solid to a kid — setIsl picks the near ones)
      let ringCount = 0, touching = 0;

      // ── ten at a time; the visitor in the water; the over-commit ───────────
      if (phase === 'hunting') {
        const atDock = playerSafe || !playerOnCandy;
        // the pack on Cat Island hunts him there: its slots first (≤ PACK ≤ HUNT_CAP)
        let raidN = 0;
        const raidHunt = playerOnCat && raid.pack.length > 0;
        for (const k of raid.pack) { k.slot = raidHunt && k.raid === 'hunt' && k.vis > 0.3 && slotEligible(k); if (k.slot) raidN++; }
        assignSlots(p, atDock ? DOCK.x : p.x, atDock ? DOCK.z : p.z, raidN);
        const wasWet = visitorWet;
        visitorWet = (playerOnCandy ? !playerSafe : (playerOnCat && !playerSafeCat)) && !starOn && !eaten.active && water.wet(p.x, p.z);
        if (visitorWet && !wasWet) night.lungeCd = Math.max(night.lungeCd, LUNGE_EVERY[0] + rand() * (LUNGE_EVERY[1] - LUNGE_EVERY[0]));
        if (lungeAt.length) {
          // debug/render: over-commits on a schedule (s after the call)
          for (let j = lungeAt.length - 1; j >= 0; j--) {
            lungeAt[j] -= dt;
            if (lungeAt[j] <= 0) { lungeAt.splice(j, 1); night.lungeCd = 0; lunger = null; }
          }
        }
        if (visitorWet && night.sated <= 0) {
          night.lungeCd -= dt;
          if (night.lungeCd <= 0 && !lunger) {
            // the hunter nearest him, on the shore, loses its patience — one
            // with nothing SOLID between it and the water (fixer r3: the
            // nearest was often nose to a fence post, 'lunging' on the spot
            // for three seconds, over and over, and nobody ever went in)
            let best = null, bd = 18;
            for (let pass = 0; pass < HUNT_CAP && !best; pass++) {
              let cand = null, cd = bd;
              for (const k of kids) {
                if (!k.slot || k.hurt || k.vis < 0.8 || k.lungeSkip === frame || k.lungeCd > 0) continue;
                const d = dist2d(k.x, k.z, p.x, p.z);
                if (d < cd) { cd = d; cand = k; }
              }
              if (!cand) break;
              if ((cand.isl === 'cat' ? catNav : nav).lineClear(cand.x, cand.z, p.x, p.z, cand.r * 0.8, true) === 1) { cand.lungeSkip = frame; lungeStat.walled++; }   // a wall first: the next one
              else best = cand;
            }
            if (best) {
              best.lunge = LUNGE_SEC; lunger = best; lunges++;
              best.lungeWT = 0; best.lungeWX = best.x; best.lungeWZ = best.z;     // fixer r4: the net-displacement window
              best.sideS = 0; best.sideT = 0; best.leapOn = false; best.leapT = 0;
              say(best, V.LUNGE[best.lineIdx++ % V.LUNGE.length], true);
              best.hopT = 0; best.squash = -0.2;
              night.lungeCd = LUNGE_EVERY[0] + rand() * (LUNGE_EVERY[1] - LUNGE_EVERY[0]);
            } else { night.lungeCd = 1.0; lungeStat.none++; }
          }
        }
      } else { huntN = 0; watchN = 0; visitorWet = false; lungeAt.length = 0; }

      // ── light / material mood (needed before the glints) ───────────────────
      const daylight = ctx.state.daylight ?? 1;
      // after a dawn the night face goes with the turn (dawnHold 1 → 0 over
      // ~1.4 s), not with the slow sunrise: a kid that has turned back is a day
      // kid in the half-light. Evenings still darken with the sun, as before.
      const dayNight = smoothstep(0.42, 0.02, daylight) * (phase === 'playful' && time < 12 ? dawnHold : 1);
      const nightMix = Math.max(dayNight, phase === 'hunting' ? 1 : (phase === 'watching' ? 0.7 : 0));
      const sky = ctx.systems.sky;
      if (sky?.sunDir) _sun.copy(daylight > 0.15 ? sky.sunDir : (sky.moonDir || sky.sunDir));
      const sunY = sky?.sunDir ? sky.sunDir.y : 0.6;
      // (the dusk rite grades the faces itself: half-night through the run and
      // the chant, black sockets in the dark beat, burning at the reveal)
      rig.setMood(daylight, phase === 'watching' ? ritual.rigNight(nightMix, dt) : nightMix, sunY, t, _sun);
      if (phase === 'watching') ritual.eyes(rig);
      const glintDay = daylight > 0.3;

      // dusk staging
      if (phase === 'watching') {
        // (the rite's clock: sourpatch/ritual.js — torches, chant, the snap)
        ritual.update(dt, t, p, playerOnCandy);
        const rt = ritual.rt;
        duskTilt = 0.34 * smoothstep(0.30, 1.0, rt);
        if (duskStage === 0 && rt > RIT_RT.FREEZE) duskStage = 1;
        if (!duskToast && rt > 0.7) {
          duskToast = true;
          if (playerOnCandy) {
            ctx.systems.ui?.toast(`Every ${V.GANG_ONE} stops and turns to look at you.`, 4);
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

      if (dunkAt.length) {
        for (let j = dunkAt.length - 1; j >= 0; j--) {
          const q = dunkAt[j]; q.t -= dt;
          if (q.t <= 0) { dunkAt.splice(j, 1); dunkNow(q.i, q.x, q.z); }
        }
      }

      // ── per-kid brains ──────────────────────────────────────────────────────
      for (const k of kids) {
        // WAVE 4: this kid's island (a raider's walls are Cat Island's)
        if (k.raid) raid.pre(k);
        setIsl(k);
        k.sayCd = Math.max(0, k.sayCd - dt);
        k.turnCd = Math.max(0, k.turnCd - dt);
        if (k.lungeCd > 0) k.lungeCd -= dt;              // fixer r4: benched from over-committing (a balk)
        k.px = k.x; k.pz = k.z;                          // where it stood (resolveProps' fallback)
        k.wasBumped = k.bumped; k.bumped = false;
        k.gaitPre = k.gaitAmp;                           // (the gait guard below: what a brain forced this frame)
        const dp = dist2d(k.x, k.z, p.x, p.z);
        // water is a wall to this kid's movement this frame — unless it is
        // fleeing in a panic or has over-committed at the shore
        const hm = k.hurt ? k.hurt.mode : null;
        if (k.lunge > 0 && (!visitorWet || k.hurt)) { k.lunge = 0; k.leapOn = false; if (lunger === k) lunger = null; }   // he got out: never mind
        // (fixer r4: read BEFORE the brain — a lunge that reaches the water on
        // its last frame has already counted its lunge down to 0 by the melt)
        const wasLunge = k.lunge > 0;
        wetOK = wasLunge || hm === 'flee' || hm === 'panic';
        // the visitor, as this kid's island sees him
        const catKid = k.isl === 'cat';
        const kidSafe = catKid ? playerSafeCat : playerSafe, kidReach = catKid ? playerOnCat : playerOnCandy;
        // hit up on the rainbow's deck: over the rail, or a flinch (raid.js)
        if (k.scripted && k.hurt) raid.knock(k);
        // on the deck the raid owns it outright (the reaction machine does not run up there)
        if (k.scripted) raid.brain(k, dt, t, p, dp, rinfo);
        // being hit outranks having a job: the reaction owns the kid while it runs
        else if (hits.brain(k, dt, t, p, dp)) {
          if (k.hurt && k.hurt.mode !== 'gone' && k.hurt.mode !== 'sulk') keepOutOfSalt(k, dt);
        }
        // Contract B outranks the schedule: a glowing tourist is everyone's problem
        else if (starOn && k.vis > 0.3 && kidReach) {
          starBrain(k, dt, t, p, dp);
          if (dp < STAR_FLEE_R && starSayCd <= 0 && k.sayCd <= 0 && rand() < dt * 0.6) {
            if (say(k, V.STAR[k.lineIdx++ % V.STAR.length])) { starSayCd = 5 + rand() * 4; k.sayCd = 12; }
          }
        }
        // the raid: on the deck, prowling Cat Island, the walk home (raid.js);
        // false = the ordinary brains below (the night hunt on Cat Island too)
        else if (k.raid && k.state !== 'dawn' && raid.brain(k, dt, t, p, dp, rinfo)) { /* raid.js */ }
        else if (phase === 'playful') { k.vis = Math.min(1, k.vis + dt * 3); dayBrain(k, dt, t, p, dp); }
        else if (phase === 'watching') {
          if (duskStage === 0 || !ritual.pastFreeze) duskBrain(k, dt, t, p, dp);
          else ritual.brain(k, dt, t, p, dp);               // Contract O: the run, the rings, the reveal
        }
        else {
          nightBrain(k, dt, t, p, dp, kidSafe, kidReach);
          // salt between us doesn't count: you cannot be surrounded through a
          // wall — and only the ones holding a hunting slot are closing in
          const seen = k.slot && k.vis > 0.5 && !salt.segment(k.x, k.z, p.x, p.z);
          if (seen && dp < RING_R) ringCount++;
          if (seen && dp < 1.85) touching++;
        }

        // ── shared animation layer ───────────────────────────────────────────
        setIsl(k);              // (a brain may have moved it: off the deck, home to Candyland)
        const deck = k.scripted; // up on the rainbow (raid.js): its feet are the deck, nothing to collide with
        // salt thrown at their feet shoves them out with a squeak
        if (!deck && salt.count && k.vis > 0.2 && salt.push(k) && !k.hurt && rand() < 0.35) {
          k.hopT = 0; k.squash = -0.16; puff(k, 5, 0.5);
          if (k.sayCd <= 0 && patchCd <= 0 && say(k, V.SALT_PATCH[k.lineIdx++ % V.SALT_PATCH.length])) { patchCd = 9; k.sayCd = 14; }
        }
        // Contract A: nothing solid may be inside a kid, whatever moved it
        // (other kids first, then the props — the props always win)
        if (!deck) {
          separate(k, p, dt);
          keepOffMarks(k);      // pickups, low stars, flower beds: no collider, still not a place to stand
          resolveProps(k);
          resolveLow(k);        // …and never half inside a bench: fully on it, or fully off
          lowMargin(k, dt);     // …and never parked flush against its back
        }
        // a stroller (or a day kid) shoved back every frame — a crowd, the
        // visitor, the bank of the syrup — is STANDING, not walking on the
        // spot: its gait follows where it really went. Two measures: a
        // smoothed velocity (a kid shuffling back and forth a step a frame),
        // and its track (fixer r2: one shuffling back and forth half a metre
        // at a walk — a dancer in a pocket between a lamp post and a bench —
        // kept the walk cycle going; under TREAD_NET u net in 1.5 s, with
        // under TREAD_PATH u of real travel, is standing)
        if (dt > 0) {
          const mx = k.x - k.px, mz = k.z - k.pz, m2 = mx * mx + mz * mz;
          if (m2 > 1 || k.trkN === 0) { k.walkVX = 0; k.walkVZ = 0; trkReset(k); }   // put somewhere, not walked there
          else {
            const a = 1 - Math.exp(-dt / 0.35);
            k.walkVX += (mx / dt - k.walkVX) * a; k.walkVZ += (mz / dt - k.walkVZ) * a;
            k.odo += Math.sqrt(m2);
          }
          trkTick(k, dt);
        }
        // (every day role that walks — taggers and dancers too: a tagger
        // backed into a corner or a dancer behind a lamp post ran / danced
        // on the spot for a minute; a brain that forced the walk cycle on
        // this frame is overruled too)
        const wants = k.moving > 0.4 || k.bumped;        // (the brain's intent, before the guard: walking, or walking into something)
        if (!k.hurt && dt > 0 && (k.state === 'stroll' || (phase === 'playful' && k.state === 'idle'))) {
          let real = Math.hypot(k.walkVX, k.walkVZ);
          if (k.tread) real = Math.min(real, k.trkNet / (TRK_BACK * TRK_DT));
          if (k.moving > real * 1.3 + 0.15) k.moving = real;
          // (a brain that forces the run cycle on — a tagger — while going nowhere)
          if (real < 0.4 && k.moving < 0.4 && k.gaitAmp > k.gaitPre) k.gaitAmp = k.gaitPre;
        }
        // …and a treading day kid's next steps are cut short (moveTo × visc),
        // so a kid zipping back and forth in a corner stands and cowers
        // instead; the wedge watch below gets it out
        k.visc = k.tread && phase === 'playful' && k.state === 'idle' && !k.hurt && !k.wayOn && !ANCHORED[k.role] ? TREAD_VISC : 1;
        // WEDGED: a walking day kid (tagger, dancer, wanderer, follower) that
        // wanted to go somewhere for two WEDGE_SEC windows running and got
        // under a metre each time is got out of its corner IN ITS ROLE
        // (fixer r2, unwedge(): a way round, the nearest licorice it can
        // reach, or a breather / a dance on the spot) — never sent off on the
        // walk back to work, which parked taggers in 'stroll' all day long
        if (phase === 'playful' && k.state === 'idle' && !k.hurt && !starOn && k.vis > 0.5 && !ANCHORED[k.role]
          && !k.wayOn && !k.wayAsk && k.holdT <= 0) {
          k.wedgeT += dt; if (wants) k.wantT += dt;
          if (k.wedgeT >= WEDGE_SEC) {
            const moved2 = (k.x - k.wedgeX) ** 2 + (k.z - k.wedgeZ) ** 2;
            k.wedgeN = k.wantT > WEDGE_SEC * 0.7 && moved2 < 1 ? k.wedgeN + 1 : 0;
            k.wedgeT = 0; k.wantT = 0; k.wedgeX = k.x; k.wedgeZ = k.z;
            if (k.wedgeN >= 2) { k.wedgeN = 0; unwedge(k); }
          }
        } else {
          k.wedgeT = 0; k.wantT = 0; k.wedgeN = 0; k.wedgeX = k.x; k.wedgeZ = k.z;
          if (phase !== 'playful' || k.hurt || starOn || k.state !== 'idle') { k.wayOn = false; k.wayAsk = false; k.holdT = 0; }
        }
        if (k.state !== 'stroll' && !k.rDetOn) k.markFree = false;   // stepping through a flower bed was for that one walk (or a raider's one way round)
        // Contract B: touch the invincible visitor and you go flying
        if (starOn && k.vis > 0.5 && !deck && kidReach && dist2d(k.x, k.z, p.x, p.z) < 0.95 + k.r) {
          if (hits.bounce(k, p.x, p.z, STAR_BOUNCE) && k.sayCd <= 0 && rand() < 0.5) {
            say(k, V.BONK[k.lineIdx++ % V.BONK.length]); k.sayCd = 6;
          }
        }
        // WATER: feet in the sea, the lake or the river — it melts, and a pool
        // of its own colour floats where it went in
        if (!deck && k.vis > 0.3 && !hits.melting(k) && !(k.air > 0.05) && water.wet(k.x, k.z)) meltInWater(k, wasLunge ? 'lunge' : undefined);
        wetOK = false;
        // hard containment net: whatever any brain did, a kid that is no longer
        // standing on Candyland goes straight back to its own front door
        // (never one melting into the shallows it walked into). A raider on
        // Cat Island: back to where the pack came ashore; on the deck: none.
        if (deck || hits.inWater(k)) { /* the deck / a pool on the water */ }
        else if (k.isl === 'cat') {
          if (!onCatI(k.x, k.z)) { k.x = raid.landfall.x; k.z = raid.landfall.z; k.moving = 0; }
        } else if (!onCandy(k.x, k.z)) {
          k.x = k.home.x; k.z = k.home.z; k.moving = 0;
          if (!onCandy(k.x, k.z)) { k.x = VILLAGE.x; k.z = VILLAGE.z; }
        }
        // feet exactly on the ground: no damping, or they hover on every slope.
        // `air` is the only thing allowed to lift them off it (the punt arc, and
        // the sink when they dissolve).
        // Contract A: groundInfo(x, z).h — up onto low props, down off them.
        // A step of more than a hand's height gets a little jelly landing.
        const g = deck ? k.ry : groundY(k.x, k.z);
        k.onProp = !deck && !!_gi.prop; k.lowOn = deck ? null : (_gi.prop || null);
        // mid-punt, `air` is height above the ground UNDER the kid: keep the
        // arc continuous when that ground steps (off a bench = a longer fall)
        if (k.air > 0.001 && k.hurt && k.hurt.mode === 'fly') k.air = Math.max(0, k.air + k.groundY - g);
        if (k.vis > 0.5 && !k.air && Math.abs(g - k.groundY) > 0.28 && Math.abs(g - k.groundY) < 2) k.squash = Math.min(k.squash, -0.12);
        k.groundY = g;
        k.y = k.groundY + (k.air || 0);
        k.yaw = angDamp(k.yaw, k.desYaw, phase === 'hunting' ? 9 : 6, dt);
        k.gait += dt * (0.6 + k.moving * 3.2) * (k.moving > 0.2 ? 1 : 0.3);
        k.gaitAmp = damp(k.gaitAmp, k.moving > 0.4 ? Math.min(1, 0.5 + k.moving * 0.14) : 0, 8, dt);
        k.roll = Math.sin(k.gait) * 0.11 * k.gaitAmp;
        // jelly spring
        k.squashV += (-k.squash * 150 - k.squashV * 14) * dt;
        k.squash = clamp(k.squash + k.squashV * dt, -0.28, 0.22);
        // hunch: at night they fold forward and drop, which is most of the scare
        // (the dawn turn and the water melt pose it themselves)
        // — except up on the rainbow, where the night column marches upright
        // (kids polisher r1: the hero shot needs their faces, not their crowns)
        if (k.state !== 'dawn' && !hits.inWater(k) && !k.ritOwn) k.crouch = damp(k.crouch, phase === 'hunting' ? (deck ? 0.08 : 0.82) : 0, 3.5, dt);
        // head look-at (the dusk beat owns the head during the freeze)
        const lookR = phase === 'hunting' ? 40 : 17;
        if (k.hurtHead) {
          // a dissolving / dizzy / stunned kid owns its own head this frame
        } else if (k.ritOwn) {
          // the dusk rite owns it (sourpatch/ritual.js): one tilt for all 24
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
        if (phase !== 'watching' && !k.hurtHead && k.state !== 'dawn') {
          if (k.role !== 'lick' || phase !== 'playful') k.headPitch = damp(k.headPitch, k.lie > 0.5 ? 0.2 : (phase === 'hunting' ? -0.05 : 0), 5, dt);
          if (k.role !== 'dance' && k.role !== 'sit' || phase !== 'playful') {
            // (on the deck every head tilts the same way at the same time:
            // one slow metronome for the whole column)
            k.headRoll = damp(k.headRoll, phase === 'hunting' ? (deck ? Math.sin(t * 0.85) * 0.3 : Math.sin(t * 1.7 + k.ph * 6.28) * 0.12) : 0, 4, dt);
          }
        }
        if (k.role !== 'lick' && k.role !== 'tag' && k.role !== 'follow' && k.state === 'idle' && phase !== 'hunting' && !k.hurt && !starOn) {
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
          // (the freeze: everything about them stops — the sparkle too)
          if (k.vis > 0.55 && dp < 72 && !(phase === 'watching' && duskStage === 0)) glint(k, glintDay);
        }
      }

      setIsl(null);
      // ── the pounce ──────────────────────────────────────────────────────────
      if (starOn) { night.ready = 0; night.pounce = 0; }
      else if (phase === 'hunting' && !eaten.active && night.sated <= 0) {
        const open = (playerOnCandy && !playerSafe) || (playerOnCat && !playerSafeCat);   // (Cat Island: the pack)
        if (ringCount >= 3 && night.timer > HUNT_GRACE && open && !visitorWet) night.ready += dt;
        else night.ready = Math.max(0, night.ready - dt * 1.5);
        if (night.ready > 2.2 && night.pounce <= 0) {
          night.pounce = 6;
          // (once in a while: a pounce that does not land — three of them
          // cannot reach him through a street's props — is tried again six
          // seconds later, and the toast every six seconds read as a stutter)
          if (t - pounceToastT > 25) { pounceToastT = t; ctx.systems.ui?.toast('They stop circling.', 2); }
        }
        if (night.pounce > 0) {
          night.pounce -= dt;
          if (touching >= 3 && !pl.invulnerable) {
            // eaten on Cat Island he wakes in the cats' refuge, not at Sugar Pier
            eaten.trigger(playerOnCat ? raid.respawn : undefined);
            night.sated = 22; night.pounce = 0; night.ready = 0;
            for (const k of kids) {
              k.burstT = 0.3; k.mouthOpen = 0;
              // the ones that got him are FULL: they waddle home to sleep it
              // off, and their slots go to the watchers
              if (k.slot && dist2d(k.x, k.z, p.x, p.z) < 1.85) { k.sated = true; k.gaveUp = true; }
            }
          }
        }
      }
      eaten.update(dt);
      puddles.update(dt, t, daylight);
      if (dawnHold > 0) dawnHold = Math.max(0, dawnHold - dt / (DAWN_SEC + 0.25));
      timeJump = false;

      // eye lights on the two nearest visible hunters (while the dusk rite runs
      // they are its altar and its torch fire: ritual.lights)
      if (phase === 'watching' && ritual.lights(eyeLights, t)) { /* sourpatch/ritual.js */ }
      else if (nightMix > 0.15) {
        // the two nearest, found without filter()/sort() (nothing allocated per frame)
        let c0 = null, c1 = null, d0 = Infinity, d1 = Infinity;
        for (const k of kids) {
          if (k.vis <= 0.4) continue;
          const d = dist2d(k.x, k.z, p.x, p.z);
          if (d < d0) { c1 = c0; d1 = d0; c0 = k; d0 = d; } else if (d < d1) { c1 = k; d1 = d; }
        }
        for (let i = 0; i < 2; i++) {
          const k = i ? c1 : c0, l = eyeLights[i];
          if (!k || dist2d(k.x, k.z, p.x, p.z) > 34) { l.visible = false; continue; }
          l.visible = true;
          l.position.set(k.x, k.y + 1.40 * k.scale, k.z + 0.2);
          l.intensity = 9 * nightMix * (0.7 + 0.3 * Math.sin(t * 9 + k.ph * 6));
        }
      } else for (const l of eyeLights) l.visible = false;

      // ── pose ────────────────────────────────────────────────────────────────
      for (const k of kids) {
        if (k.ritOwn) {                             // the dusk rite grades the face (ritual.js)
          k.slit = damp(k.slit, k.ritSlit ?? 1, 7, dt);
          k.browOut = damp(k.browOut, k.ritBrow ?? 0, 8, dt);
        } else if (k.state !== 'dawn') {           // the dawn turn drives its own face
          k.slit = damp(k.slit, nightMix, 3, dt);
          k.browOut = damp(k.browOut, nightMix > 0.5 ? 1 : 0, 4, dt);
        }
        if (phase !== 'playful' && phase !== 'watching') k.mouthWide = damp(k.mouthWide, nightMix * 0.7, 3, dt);
        k.pos.set(k.x, k.y, k.z);
        rig.pose(k.i, k, t);
      }
      rig.commit();
      raid.post(nightMix, dt);    // the pack's eyes, pinpricks across the strait (+ the night column's shade)
      ritual.post(dt, t, phase);  // the torches, the altar, the pulse (Contract O)
      // never own the interaction prompt off the kid's own island: on Cat Island
      // a kid across the water used to out-bid the cats' own interactables
      // (a raider on Cat Island may be pleaded with there; nobody on the deck)
      for (const e of entries) {
        const kk = kids[e.ki];
        e.enabled = kk.vis > 0.5 && !kk.scripted && (kk.isl === 'cat' ? playerOnCat : playerOnCandy);
      }
    },
  };
  return api;
}
