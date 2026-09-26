// ─────────────────────────────────────────────────────────────────────────────
// THE RAID — tigers into Candyland (docs/BRIEF.md WAVE 4, Contract M).
//
// Once the rainbow bridge is up (story `rainbow_bridge`), the night watch does
// not stay home. At 20:00 a raiding party of 3–5 tigers (it grows by one each
// night, to five) musters at the Cat end of the bridge and bounds over the
// rainbow in single file — from Candyland you see a string of paired cold
// pinpricks climbing the arc long before you can see anything else. The
// crossing is timed, not paced: ≈ 1.5–1.8 game hours whatever the deck's
// length (crossSpeed(); on the 208-u r4 deck the leader is ashore by ~21:45,
// the last by ~22:00), so they hunt four hours and more before the first
// of them turns for home. On
// Candyland they hunt by the island's own tiger rules (citizens/tiger.js
// tigerPlan: stalk from 18 u, a ring of three round you, one committed
// spring), walking round everything (Contract A: settle(), pushOut, feet on
// groundInfo) along their own walkability grid of Candyland (citizens/nav.js).
// A visitor the grid calls shut (a metre from a fence's end, beside a post)
// is still theirs: the spring checks the blockers themselves and goes round
// to the nearest side it can reach him from; and the one nearest him that
// has got no nearer for 6 s (2.5 s within 11 u of him, 2 s from the wrong
// side of a hedge row) stops circling and presses in, round whatever was in
// the way.
// A visitor they catch is carried by the scruff back to the foot of the
// bridge, then OVER THE RAINBOW (≈ 20 s, the camera side-on, two escorts
// padding behind), and only once the lights are out does he land in the
// guest bed on Cat Island. They are due back at the foot of the rainbow by
// 04:00 (RETREAT_H): the ones hunting far inland yawn and set off early, by
// as long as the walk back takes (never before 02:24, HOME_LEAD_MAX), and the
// trot home is timed like the crossing (homeSpeed()), so the whole party is
// on the arc as the sky goes pink and off it by about six. One still on
// Candyland once it is properly light (daylight
// > 0.3), or one that stops getting any nearer the bridge on the way home,
// slinks off somewhere else in a puff; one still on the rainbow at 07:00
// fades where it stands.
//
// THE HUSH: a visitor who ducks under a footbridge or a deck while a raider
// is near gets the raid's held breath — the lens drops outside the deck's
// edge, level with the planks, and looks in under them at him, the raider
// padding on the boards over his head (see hushBearing). He keeps control;
// it eases out when he leaves the planks' shadow.
//
// Salt lines do not stop them (they are not Sour Patch Kids). Catnip does —
// an inventory candy 'catnip' if the inventory knows one: they will not come
// within 9 u of a visitor carrying it, and sit at the edge of the smell and
// stare. Without that item the invincibility star is the repellent (Contract
// B: they flee). Weapons work exactly as on Cat Island (catCitizens.hit).
//
// Fallbacks (never throws): no bridge route at all → the party simply
// arrives at Sugar Pier (and leaves from there); a bridge without a walkable
// path → they arrive at its Candyland end; a carry without a path ends at the
// pier, in the dark, and the visitor still wakes up in the guest bed.
//
// Bodies: citizens/raidrig.js (own pools, 8 draw calls, eye glow points).
// API (via catCitizens.raid): phase · active · party · carrying · marker
//   start(opts) · end() · debug({ phase, t, n, near, park, frame }) · stats() · hushing
// Events: 'raid:start' {n, via} · 'raid:land' · 'raid:home' · 'cats:caught' {cat, name, raid:true}
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { isTigerTime, tigerPlan, tigerScale, applyTiger } from './tiger.js';
import { step, dampAngle, wrapPi } from './brain.js';
import { createRaidRig } from './raidrig.js';
import { createNav } from './nav.js';
import { TP } from './tigerrig.js';
import { rng, hash, clamp, smoothstep } from '../../../core/util.js';

const MAX_N = 5;
/** The night watch, off duty. */
const RAIDERS = [
  { key: 'raid_pounce', name: 'Admiral Pounce', was: 'the Harbour Master', pattern: 'ginger', size: 1.28, build: 'buff' },
  { key: 'raid_claws', name: 'Nana Claws', was: 'the Crossing Lady', pattern: 'white', size: 1.08 },
  { key: 'raid_velvet', name: 'Sergeant Velvet', was: 'Customs', pattern: 'black', size: 1.16 },
  { key: 'raid_quiet', name: 'The Quiet One', was: 'Lost Property', pattern: 'siamese', size: 1.02 },
  { key: 'raid_marm', name: 'Big Marmalade', was: 'the Night Bakery', pattern: 'tabby', size: 1.22 },
];
const LANES = [0, -1.15, 1.15, -0.55, 0.55];

// The crossing is timed in GAME hours, not paced: at the old fixed 4.4 u/s
// lope the r4 deck (208 u of arc, up from 170) kept the party on it from 20:00
// to 23:40 and left them two hours of hunting before the first turned home.
// crossSpeed() = the deck's length over CROSS_H game hours, CROSS_MIN..MAX.
const CROSS_H = 1.5;            // game hours the crossing should take
const CROSS_MIN = 4.4;          // u/s: a short deck is loped…
const CROSS_MAX = 9.6;          // u/s: …a long one bounded (the visitor runs at 11)
const FILE_GAP = 5.2;           // u between noses in the file (muster stagger = FILE_GAP / speed)
const CARRY_LAND = 6.2;         // u/s: bounding to the foot of the bridge with you in its mouth
const CARRY_CUT = 10;           // s: longer than that on land and it is a cut, in the dark
const CARRY_SECS = 20;          // over the rainbow
const CARRY_CAM_D = 14;         // the lens over the rainbow: side-on, close…
const CARRY_CAM_EL = 0.2;       // …and low
const RETREAT_H = 4.0;          // due back at the foot of the rainbow (and on it as the sky goes pink)
const HOME_H = 1.6;             // game hours the trot home over the rainbow should take…
const HOME_MIN = 6.0;           // u/s …within HOME_MIN..HOME_MAX (homeSpeed())
const HOME_MAX = 8.6;
const DECK_DUE_H = 6.4;         // one that got onto the rainbow late hurries to be off it by then…
const HURRY_MAX = 11;           // u/s …up to this (a bound, not a trot)
const HOME_TROT = 5.0;          // u/s: the trot back to the foot of the bridge (the last 35 u)…
const HOME_LOPE = 7.0;          // u/s: …and the lope before that
const HOME_LEAD_MAX = 1.6;      // h: the earliest a far-inland raider sets off before RETREAT_H (02:24)
// the pace a pose's cadence was drawn for (tiger.js TPOSE): a raider moving at
// another pace scales its gait by speed / GAIT_REF (c.gaitK), so the paws
// keep up with the ground instead of skating over it
const GAIT_REF = { lope: 4.4, bound: 8.8, trot: 6.0 };
const HOME_STALL = 8;           // s: homing without getting any nearer the bridge → it slinks off (a puff)
const DAWN_PUFF = 0.3;          // daylight: a raider still on Candyland by now slinks off (a puff)
const DECK_LATE_H = 7.0;        // one still on the rainbow by 07:00 fades where it stands
const STRAGGLE_SECS = 90;       // (a frozen clock: the same puff, 90 s after the retreat began)
const CATCH_R2 = 4.0;           // centre to centre, ≤ 2 u (and within 2 u of his height)
const NIP_R = 9;                // the catnip ring
const REACH_BODY = 1.85;        // how close a lunging tiger's centre comes to him (the catch is < 2 u)
const PRESS_SECS = 6;           // the one nearest him, no nearer for this long while he is catchable → it presses in
const PRESS_WRONG = 2;          // …sooner when the walk to him is more than twice as far as he is (the wrong side of a hedge row)
const PRESS_NEAR = 2.5;         // …and within PRESS_NEAR_R of him (just outside a spring, its ring steps shut both ways)
const PRESS_NEAR_R = 11;
const TAU = Math.PI * 2;

const LINES_HUNT = [
  '“You left without saying goodbye.”',
  '“Bedtime is on the OTHER island.”',
  '“We only want to tuck you in.”',
  'Something in the gumdrops is purring. It is not a gumdrop.',
  '“Everyone at home is SO worried.”',
];
const LINES_NIP = [
  'It smells the catnip. It sits down at the edge of the smell. It will wait.',
  '“…is that NIP?” It does not come any closer. It does not leave either.',
];
const LINES_BRIDGE = ['“Don’t look down. We never do.”', '“Nearly home. Everyone was worried.”'];

export function createRaid(ctx, H) {
  const { world } = ctx;
  const S = H.S;
  const group = H.group;
  const rig = createRaidRig(H.lib, group, MAX_N, H.xray);

  // ── the party ──────────────────────────────────────────────────────────────
  const party = RAIDERS.map((spec, i) => {
    const r = rng(hash('raid:' + spec.key));
    const body = rig.add(spec);
    return {
      key: spec.key, name: spec.name, idx: i,
      tiger: { short: spec.name, full: `${spec.name}, formerly ${spec.was}` },
      spec: { size: spec.size, build: spec.build || 'normal', pattern: spec.pattern },
      pattern: spec.pattern, rig: body.rig, TG: body.TG, blobN: body.blob, glowHex: body.glowHex,
      x: 0, y: 0, z: 0, yaw: 0, faceDir: 0, moving: false, seed: r(), ph: r() * TAU, gait: 0, gaitSpeed: 1.8,
      tigerK: 1, formed: true, huntRank: 99, packIdx: 0, packSlot: i, slotRot: 0,
      think: 0, plan: null, pose: 'prowl', lookAt: null, flick: 0,
      fxKind: null, fxUntil: -1, fxThen: null, fxX: 0, fxZ: 0,
      sx: NaN, sz: NaN, settleT: 0, gyT: 0, bumpT: 0, kvx: 0, kvz: 0, air: 0, airV: 0, rad: 0.5,
      hideK: 0, giveX: NaN, giveZ: NaN, yawnUntil: -1, roarUntil: -1, slope: 0,
      mode: 'off', s: 0, sDir: -1, lane: LANES[i], laneWant: LANES[i], delay: 0, vis: 0, homing: false, escort: 0, seg: 0,
      speedK: 0.96 + r() * 0.08, lineAt: -99, nipAt: -99, hBest: Infinity, hFd: Infinity, hT: 0, gaitK: 1,
    };
  });
  rig.build();

  // ── shared state ───────────────────────────────────────────────────────────
  const pack = { id: 0, route: 'raid', x: -60, z: 26, wait: 0, ring: null, pt: 0.1, pdir: 1 };
  const RT = {
    packs: { packs: [pack] },
    island: 'candy',
    graceUntil: 0,
    get carrying() { return R.carry || H.T.carrying || null; },
  };
  const R = {
    phase: 'home', n: 0, nights: 0, doneTonight: false, retreat: false, via: 'none',
    carry: null, forced: false, lastH: null, frame: 0, markT: 0, landedAt: -1, announced: false,
    lineAt: -99, lines: 0, wake: 0, deckK: 0, leadT: 0, retreatT: 0,
    hush: null, hushChk: 0, hushCool: -99, hushN: 0, duckUntil: 0, staging: false,
  };
  // steering among the party (brain.js step calls S.tigerSteer)
  const RS = { solidsNear: S.solidsNear, isLow: S.isLow, tigerSteer: (c, u) => raidSteer(c, u) };

  const pl = () => ctx.systems.player;
  const ui = () => ctx.systems.ui;
  const story = () => ctx.systems.story;

  // ── the way over: the bridge's route, or the fallbacks ─────────────────────
  const route = { ok: false, ref: undefined, n: -2, pts: [], cum: [], L: 0, Lb: 0, heightAt: null, landing: { x: -46, z: 24 }, dir: 0, candyEnd: null };
  function bridgeApi() {
    const b = ctx.systems.escape?.routes?.bridge || ctx.systems.escape?.api?.routes?.bridge;
    return b && typeof b === 'object' ? b : null;
  }
  const _gi = { h: 0 };
  /** Where a walker standing on the ground at (x,z) has his feet (the deck
   *  walkables are asked for a walker at the terrain, not at the visitor's
   *  height — see citizens.js settle()). */
  function groundH(x, z) {
    const p = pl();
    if (p && typeof p.groundInfo === 'function') {
      const P = p.position, keep = P ? P.y : 0;
      if (P) P.y = world.height(x, z);
      try { p.groundInfo(x, z, _gi); } finally { if (P) P.y = keep; }
      if (Number.isFinite(_gi.h)) return _gi.h;
    }
    return Math.max(world.height(x, z), 0.15);
  }
  /** Where a walker EXPECTED at height yw has his feet at (x,z): the deck
   *  walkables asked for a walker at yw (the pier's planks, not the sea bed
   *  under them — groundH lends the terrain's height, and at the pier end,
   *  over the water, that found the bottom: the landing leg of the route
   *  dipped 6 u through Sugar Pier into the sea between the planks and the
   *  rainbow's foot). Nothing within a stride of yw: the straight line. */
  function walkH(x, z, yw) {
    const p = pl();
    if (p && typeof p.groundInfo === 'function') {
      const P = p.position, keep = P ? P.y : 0;
      if (P) P.y = yw;
      try { p.groundInfo(x, z, _gi); } finally { if (P) P.y = keep; }
      if (Number.isFinite(_gi.h) && _gi.h > yw - 0.9) return _gi.h;
    }
    const g = world.height(x, z);
    return g > yw - 0.9 ? Math.max(g, 0.15) : yw;
  }
  /** The bridge deck's height at (x,z), NaN off it. (Its heightAt returns null
   *  off the deck, and +null is 0: a raider at sea level.) */
  function deckY(x, z) {
    const f = route.heightAt; if (!f) return NaN;
    let v; try { v = f(x, z); } catch (e) { return NaN; }
    return v == null ? NaN : +v;
  }
  /** Where the party steps off onto Candyland: dry, open ground inland of `from`. */
  function findLanding(fx, fz) {
    const dock = world.LANDMARKS.candy_dock || { x: -42, z: 22 };
    let tx = dock.x - 4, tz = dock.z + 2;
    let ux = tx - fx, uz = tz - fz; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
    for (let d = 0; d <= L + 12; d += 1) {
      const x = fx + ux * d, z = fz + uz * d;
      if (world.height(x, z) > 0.8) {
        const x2 = x + ux * 4, z2 = z + uz * 4;
        const q = H.resolveSpot(x2, z2, 6, 1.0);
        return { x: q[0], z: q[1] };
      }
    }
    const q = H.resolveSpot(tx, tz, 6, 1.0);
    return { x: q[0], z: q[1] };
  }
  /** DEBUG ONLY (raidDebug({ mock: true })): a stand-in arc between the two
   *  piers while escape/bridge.js has not shipped — invisible, but it lets the
   *  crossing, the eyes and the carry be exercised today. Never used in play. */
  const MOCK = (() => {
    const a = { x: -30, z: 22 }, b = { x: 30, z: 22 }, path = [];
    for (let i = 0; i <= 16; i++) path.push([a.x + (b.x - a.x) * i / 16, 22]);
    return { up: true, mock: true, ends: { candy: a, cat: b }, path, apex: { x: 0, y: 60, z: 22 },
      heightAt: (x, z) => (x < a.x - 0.5 || x > b.x + 0.5 || Math.abs(z - 22) > 3.5 ? NaN : 2.2 + 4 * ((x - a.x) / (b.x - a.x)) * (1 - (x - a.x) / (b.x - a.x)) * 58) };
  })();
  /** Refresh the route from the bridge API (cheap unless the bridge changed). */
  function syncRoute() {
    let b = bridgeApi();
    if (R.mock && !(b && b.up !== false && Array.isArray(b.path) && b.path.length >= 2)) b = MOCK;
    const path = b && b.up !== false && Array.isArray(b.path) && b.path.length >= 2 ? b.path : null;
    if (path === route.ref && (path ? path.length : -1) === route.n) return route;
    route.ref = path; route.n = path ? path.length : -1;
    route.heightAt = b && typeof b.heightAt === 'function' ? b.heightAt : null;
    const ends = b && b.ends;
    const ce = ends && ends.candy && Number.isFinite(ends.candy.x) ? ends.candy : null;
    route.candyEnd = ce;
    if (!path) {
      route.ok = false; route.via = ce ? 'bridge-end' : 'pier';
      const dock = world.LANDMARKS.candy_dock || { x: -42, z: 22 };
      route.landing = ce ? findLanding(ce.x, ce.z) : findLanding(dock.x + 12, dock.z);
      route.pts = []; route.cum = []; route.L = 0; route.Lb = 0;
      return route;
    }
    // orient candy → cat
    let P = path.map((p) => (Array.isArray(p) ? { x: +p[0], z: +p[1] } : { x: +p.x, z: +p.z })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
    const refX = ce ? ce.x : -60, refZ = ce ? ce.z : 22;
    if ((P[0].x - refX) ** 2 + (P[0].z - refZ) ** 2 > (P[P.length - 1].x - refX) ** 2 + (P[P.length - 1].z - refZ) ** 2) P = P.reverse();
    const land = findLanding(P[0].x, P[0].z);
    route.landing = land;
    const apex = b.apex && Number.isFinite(b.apex.y) ? b.apex : null;
    const pts = [{ x: land.x, z: land.z, y: groundH(land.x, land.z), deck: false }];
    const n = P.length;
    // (path3: the bridge's own [x, y, z] samples, same order as path)
    const p3 = Array.isArray(b.path3) && b.path3.length === path.length ? b.path3 : null;
    const flip = p3 && P[0].x !== +((Array.isArray(path[0]) ? path[0][0] : path[0].x));
    for (let i = 0; i < n; i++) {
      const q3 = p3 ? p3[flip ? n - 1 - i : i] : null;
      let y = q3 && q3[1] != null && Number.isFinite(+q3[1]) ? +q3[1] : deckY(P[i].x, P[i].z);
      if (!Number.isFinite(y)) {
        // no heightAt: an arc through the apex, or the ground under the end
        const u = i / (n - 1);
        y = apex ? Math.max(groundH(P[i].x, P[i].z), 4 * u * (1 - u) * apex.y) : groundH(P[i].x, P[i].z);
      }
      pts.push({ x: P[i].x, z: P[i].z, y, deck: true });
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], q = pts[i];
      cum.push(cum[i - 1] + Math.hypot(q.x - a.x, q.y - a.y, q.z - a.z));
    }
    route.pts = pts; route.cum = cum; route.L = cum[cum.length - 1]; route.Lb = cum[1];
    route.dir = Math.atan2(P[n - 1].x - P[0].x, P[n - 1].z - P[0].z);
    route.ok = route.L > 10; route.via = 'bridge';
    return route;
  }
  const _ps = { x: 0, y: 0, z: 0, yaw: 0, slope: 0, deck: false };
  const _ps2 = { x: 0, y: 0, z: 0, yaw: 0, slope: 0, deck: false };
  const secPerH = () => (world.DAY_LENGTH_SEC || 300) / 24;
  /** u/s along the deck, out: the whole route (landing leg too) in CROSS_H game hours. */
  function crossSpeed() { return route.ok ? clamp(route.L / (CROSS_H * secPerH()), CROSS_MIN, CROSS_MAX) : CROSS_MIN; }
  /** u/s along the deck, home at dawn: HOME_H game hours. */
  function homeSpeed() { return route.ok ? clamp(route.L / (HOME_H * secPerH()), HOME_MIN, HOME_MAX) : HOME_MIN; }
  /** Game hours from the muster to the last of the file stepping off (a jumped clock re-stages by it). */
  function crossHours(n) { const v = crossSpeed(); return (route.L + Math.max(0, n - 1) * FILE_GAP) / v / secPerH(); }
  /** The cadence multiplier for a raider moving at sp in pose (see GAIT_REF). */
  function gaitFor(pose, sp) { const ref = GAIT_REF[pose]; return ref ? clamp(sp / ref, 0.7, 1.5) : 1; }
  /** A point `s` along the route (0 = the landing, L = the Cat end), `lane` u to the right. */
  function routeAt(c, s, lane, out) {
    const pts = route.pts, cum = route.cum;
    s = clamp(s, 0, route.L);
    let i = clamp(c.seg | 0, 0, pts.length - 2);
    while (i > 0 && cum[i] > s) i--;
    while (i < pts.length - 2 && cum[i + 1] < s) i++;
    c.seg = i;
    const a = pts[i], b = pts[i + 1], L = Math.max(1e-6, cum[i + 1] - cum[i]), k = (s - cum[i]) / L;
    const dx = b.x - a.x, dz = b.z - a.z, dl = Math.hypot(dx, dz) || 1;
    const rx = dz / dl, rz = -dx / dl;               // right of the direction of travel (candy → cat)
    const la = a.deck ? lane : lane * k;             // lanes open up on the deck
    out.x = a.x + dx * k + rx * la; out.z = a.z + dz * k + rz * la;
    // the deck wherever the bridge says there is deck — the landing → first
    // path point stretch included (the ramp foot: the ground under a deck
    // that has just come down to it sat a quarter of a unit low)
    let y = deckY(out.x, out.z);
    if (!Number.isFinite(y) && b.deck && a.deck) y = deckY(a.x + dx * k, a.z + dz * k);
    if (!Number.isFinite(y)) y = b.deck && a.deck ? a.y + (b.y - a.y) * k : walkH(out.x, out.z, a.y + (b.y - a.y) * k);
    out.y = y;
    out.yaw = Math.atan2(dx, dz);
    out.slope = Math.atan2(b.y - a.y, dl);
    out.deck = b.deck;
    return out;
  }

  // ── Candyland's walkability grid (lazy: the first raid pays ~0.1 s) ────────
  // What stops a raider in Candyland's streets is the town's rule (citizens.js
  // navBlocker), with three Candyland differences:
  //  · a plain `solid:false` collider is open ground. On Candyland those are
  //    the landmarks' clear aprons and the buildings' footprint claims (only
  //    vegetation reads them), props the architecture disarmed and the rails
  //    the bridge opened. As walls they punched holes the party could never
  //    enter: Sugar Pier's apron — where the kids stand an eaten visitor back
  //    on his feet, inside their salt refuge, which must not stop a tiger —
  //    and the 28-u ring round the Great Cupcake.
  //  · a LIVE `solid` (a getter written for a walker's feet) is judged for a
  //    walker on the ground, never read, so the grid does not depend on where
  //    the visitor happened to be standing when it was built — and the tigers'
  //    own collision judges it by the TIGER's feet (citizens.js pushAll), so
  //    grid and body agree: a gated deck rail stops a tiger only where its
  //    deck is within the gate of the terrain (under a high ramp is open
  //    ground); the rest (the peak's plinth, the cupcake's topless props) are
  //    solid down here — the town's rule.
  //  · the enterable rooms are shut, as on Cat Island (nobody prowls
  //    indoors): their footprints are stamped in, so a visitor who gets
  //    inside is waited for at the door — the footprint claims used to do
  //    that by accident, and closed 2 u of street round every house too.
  //  · a legacy absolute `h` the town's rule lets through (its rise read at
  //    the prop's own centre) is measured again against the ground all round
  //    its footprint: one standing proud of it on EVERY side by more than a
  //    tiger's stride is a low fence, the tiger's own low-prop clash pushes it
  //    back from it, and the grid had called it open street — two raiders
  //    lost the whole dawn against one such fence west of Gumdrop Village. (A
  //    slab or step sunk into a slope is flush with its uphill side and stays
  //    open: the paths up Frosting Peak and to the Sour Shrine are made of
  //    them.) The ground core's SOLID verdict (calibrate.js keeps a prop solid
  //    when its drawn geometry stands at body height) counts too. (A dozen
  //    colliders on Candyland; once per build.)
  const _desc = Object.getOwnPropertyDescriptor;
  const RAID_SF = 0.22;                     // a tiger's stride up (citizens.js TIGER_SF)
  let kindCalls = 0;
  function legacyWall(c) {
    kindCalls++;
    const h = c.h;
    let hi = world.height(c.x, c.z);
    if (c.box) {
      const rot = c.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
      const hw = (c.w || 0) * 0.5 + 0.4, hd = (c.d || 0) * 0.5 + 0.4;
      for (let sx = -1; sx <= 1; sx++) for (let sz = -1; sz <= 1; sz++) {
        if (!sx && !sz) continue;
        const lx = sx * hw, lz = sz * hd, b = world.height(c.x + lx * cs - lz * sn, c.z + lx * sn + lz * cs);
        if (b > hi) hi = b;
      }
    } else {
      const rr = (c.r || 0) + 0.4;
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, b = world.height(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr); if (b > hi) hi = b; }
    }
    if (h - hi > RAID_SF) return true;
    try { const G = pl()?.ground; if (G && typeof G.kindOf === 'function') { const t = G.kindOf(c); return t === 'solid' || t === 'tall'; } } catch (e) { /* no core */ }
    return false;
  }
  function raidBlocker(c) {
    if (c.raidRoom) return true;
    const d = _desc(c, 'solid');
    if (d) {
      if (typeof d.get === 'function') {
        // (citizens.js pushAll judges these rules by the tiger's own feet too,
        //  counted TIGER_GATE_LIFT higher for its height)
        const g = world.height(c.x, c.z) + 0.4;
        if (typeof c.gateY === 'number' && !(g > c.gateY)) return false;
        if (typeof c.gateTop === 'number' && g >= c.gateTop) return false;
      } else if (d.value === false) return false;
    }
    if (H.navBlocker(c)) return true;
    const h = c.h;
    return typeof h === 'number' && h > 1.6 && h < 1e4 && legacyWall(c);
  }
  let roomCols = null;
  /** The enterable rooms as stand-in colliders (nav only; never in ctx.colliders). */
  function roomColliders() {
    if (roomCols) return roomCols;
    const out = [];
    let list = null;
    try { list = ctx.systems.candyArchitecture?.interiors; } catch (e) { list = null; }
    if (Array.isArray(list)) {
      for (const r of list) {
        if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.z)) continue;
        if (r.radius > 0) out.push({ x: r.x, z: r.z, r: r.radius, raidRoom: true });
        // (the rooms' footprint test turns by +rot, the grid's box test by −rot)
        else if (r.w > 0 && r.d > 0) out.push({ x: r.x, z: r.z, w: r.w, d: r.d, rot: -(r.rot || 0), box: true, raidRoom: true });
      }
      roomCols = out;                      // (published at world:ready: settled once read)
    }
    return out;
  }
  // When the collider list changes after the build (a sibling adds a gate at
  // 22:30, a puddle, a door): colliders APPENDED to the same list are stamped
  // in on the spot (nav.add: only the ones inside Candyland's grid, then a
  // ~3 ms relabel — nothing at all if none of them is a tiger's business). A
  // list that shrank or was swapped needs the full ~10–25 ms rebuild, and
  // that waits until nobody can see it: the visitor off the island (not in
  // the jaws on the way to the bridge — that is a shot), or the carry's fade
  // to black. (A removed prop still stamped is only a bit of street the grid
  // is shy of until then.)
  let nav = null, navN = -1, navSrc = null, navDirty = false;
  function navQuiet() { return R.carry ? R.carry.stage === 'dark' : !visitorOnCandy(); }
  function candyNav() {
    const p = H.groundCore(); if (!p) return null;
    if (!nav) {
      const I = world.ISLANDS?.candy;
      const cx = I?.center?.x ?? -150, cz = I?.center?.z ?? 0, rr = I?.radius ?? 118;
      nav = createNav(world, { x0: cx - rr - 6, z0: cz - rr - 6, x1: -22, z1: cz + rr + 6, cell: 1.0, landCell: 1.5, navR: 0.8, cx, cz, radius: rr, keepBlockers: true });
    }
    H.lowSync(p);
    const cols = ctx.colliders;
    if (nav.built && (cols !== navSrc || cols.length !== navN)) {
      if (cols === navSrc && cols.length > navN) { kindCalls = 0; nav.add(cols, navN, cols.length, raidBlocker); navN = cols.length; }
      else { navDirty = true; navSrc = cols; navN = cols.length; }
    }
    if (!nav.built || (navDirty && navQuiet())) {
      navN = cols.length; navSrc = cols; navDirty = false;
      const rooms = roomColliders();
      kindCalls = 0;
      nav.build(rooms.length ? cols.concat(rooms) : cols, raidBlocker);
      nav.stats.legacyChecks = kindCalls;
      // the landing is a real piece of street
      const i = nav.nearestOpen(route.landing.x, route.landing.z, 10, null, true);
      if (i >= 0) { const q = nav.cellCentre(i, { x: 0, z: 0 }); route.landX = q.x; route.landZ = q.z; }
    }
    return nav;
  }
  const landX = () => (route.landX ?? route.landing.x), landZ = () => (route.landZ ?? route.landing.z);

  // ── getting at him ─────────────────────────────────────────────────────────
  // The grid is inflated by a buff tiger's torso, so a visitor a metre from a
  // fence's end, beside a post, or between a lamp and a gumdrop stands in a
  // cell the grid calls shut, though a tiger coming from the right side can
  // reach him perfectly well. (The spring used to aim for the nearest open
  // cell on its OWN side of him — often the one it stood on — and froze there,
  // crouching and rushing on the spot 4.7 u away, across a fence.) So a lunge
  // is checked against the blockers themselves, un-inflated (nav.clearRun),
  // and when it cannot get at him from where it is, it goes round to the
  // nearest place it can (approach), by the grid.
  const _rp = { x: 0, z: 0 };
  /** Can c, standing at (x0,z0), close on him in a straight line — its torso
   *  to REACH_BODY off him, its head as far as the head then reaches? */
  function reachRun(N, c, x0, z0, P) {
    const dx = P.x - x0, dz = P.z - z0, L = Math.hypot(dx, dz);
    if (L <= REACH_BODY) return true;
    const ux = dx / L, uz = dz / L, T = tigerScale(c), sb = L - REACH_BODY;
    if (!N.clearRun(x0, z0, x0 + ux * sb, z0 + uz * sb, 0.62 * T * 0.88)) return false;
    const hf = 0.95 * T, h0 = Math.min(hf, L - 0.35), h1 = Math.min(sb + hf, L - 0.35);
    return h1 <= h0 || N.clearRun(x0 + ux * h0, z0 + uz * h0, x0 + ux * h1, z0 + uz * h1, 0.45 * T * 0.88);
  }
  /** Is he indoors (an enterable room's footprint)? Nobody prowls indoors. */
  function indoors(N, P) {
    const rooms = roomColliders();
    for (let i = 0; i < rooms.length; i++) if (N.sdist(rooms[i], P.x, P.z) < 0) return true;
    return false;
  }
  /**
   * The nearest cell of street round him (≤ 4 u, the whole way round) from
   * which c can reach him (reachRun) and which it can walk to (its own piece
   * of street). Cached on the tiger while he stands still (c.apX/apZ).
   * False: nowhere — he is indoors, or somewhere no tiger fits.
   */
  function approach(N, c, P) {
    const now = S.elapsed;
    if (now - c.apAt < 1.5 && Math.abs(c.apPX - P.x) < 0.35 && Math.abs(c.apPZ - P.z) < 0.35 && c.apV === N.stats.ver) return c.apOK;
    c.apAt = now; c.apPX = P.x; c.apPZ = P.z; c.apV = N.stats.ver; c.apOK = false;
    if (indoors(N, P)) return false;
    const comp = N.compOf(N.nearestOpen(c.x, c.z, 3));
    if (!comp) return false;
    const D = N.dims, gx = Math.floor((P.x - D.X0) / D.C), gz = Math.floor((P.z - D.Z0) / D.C);
    const ban = c.apBanUntil > now ? c.apBan : -2;
    let best = Infinity;
    for (let r = 0; r <= 4; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const qx = gx + dx, qz = gz + dz;
        if (qx < 0 || qz < 0 || qx >= D.NX || qz >= D.NZ) continue;
        const i = qz * D.NX + qx;
        if (i === ban || N.compOf(i) !== comp) continue;
        N.cellCentre(i, _rp);
        const d2 = (_rp.x - P.x) ** 2 + (_rp.z - P.z) ** 2;
        if (d2 >= best || !reachRun(N, c, _rp.x, _rp.z, P)) continue;
        best = d2; c.apX = _rp.x; c.apZ = _rp.z; c.apI = i;
      }
      if (best < ((r + 0.5) * D.C) ** 2) break;          // no further ring has a nearer cell
    }
    c.apOK = best < Infinity;
    return c.apOK;
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  const active = () => R.phase !== 'home';
  function visitorOnCandy() {
    const p = pl(); if (!p || !p.position) return false;
    return ctx.state.island === 'candy' && !p.onFerry && p.position.x < -18;
  }
  function nipRepels() {
    const inv = ctx.systems.inventory;
    try { return !!(inv && typeof inv.def === 'function' && inv.def('catnip') && inv.count('catnip') > 0); } catch (e) { return false; }
  }
  // (family: on Candyland the bust would otherwise fall back to the island's smiley 'creature')
  function say(c, line) { ui()?.say?.(line, { speaker: c.tiger.full, portrait: { color: 0xf08a22, family: 'tiger' } }); }
  function puff(c, n = 26) {
    ctx.systems.particles?.burst?.({ x: c.x, y: c.y + 0.9, z: c.z, count: n, color: [0xf2900f, 0xfff4e0, 0x2a2630, 0xe0d8c8], speed: 3.2, life: 1.0, size: 0.22, gravity: -2.0, spread: 1.3 });
  }
  function resetBody(c) {
    c.sx = NaN; c.sz = NaN; c.settleT = 0; c.gyT = 0; c.gy = undefined; c.bumpT = 0; c.kvx = 0; c.kvz = 0; c.air = 0; c.airV = 0;
    c.leapT = 0; c.wedgedUntil = 0; c.trapT = 0; c.trapX = NaN; c.wdX = NaN; c.touchT = 0; c.navHoldUntil = 0;
    c.giveX = NaN; c.giveZ = NaN; c.think = 0; c.plan = null; c.fxKind = null; c.fxUntil = -1; c.fxThen = null;
    c.yawLock = undefined; c.faceHoldUntil = 0; c.tg = null; c.slope = 0; c.carryTo = null; c.homing = false; c.escort = 0;
    c.hBest = Infinity; c.hFd = Infinity; c.hT = 0;
    c.pAt = -1; c.pBest = Infinity; c.pX = NaN; c.pZ = NaN; c.pressUntil = 0; c.mvAt = 0; c.mvX = 0; c.mvZ = 0;
    c.apAt = -99; c.apOK = false; c.apI = -1; c.apBan = -1; c.apBanUntil = 0;
    c.stage = null; c.gaitK = 1;
  }
  function hide(c) {
    c.mode = 'off'; c.vis = 0;
    c.TG.root.scale.setScalar(0); c.TG.root.updateMatrixWorld(true);
    c.blobN.scale.setScalar(0); c.blobN.updateMatrix(); c.blobN.matrixWorld.copy(c.blobN.matrix);
  }
  for (const c of party) hide(c);

  // ── start / end ───────────────────────────────────────────────────────────
  function partySize() { return clamp(3 + R.nights, 3, MAX_N); }
  /** Begin tonight's raid. how: 'cross' (muster at the Cat end) | 'hunt' (already here) | 'crossAt' (t) */
  function start(opts = {}) {
    syncRoute();
    R.n = clamp(opts.n ?? partySize(), 1, MAX_N);
    R.phase = 'raid'; R.retreat = false; R.doneTonight = true; R.via = route.ok ? 'bridge' : route.via;
    R.landedAt = -1; R.announced = false; R.carry = null;
    for (let i = 0; i < party.length; i++) {
      const c = party[i]; resetBody(c); hide(c);
      if (i >= R.n) continue;
      c.vis = 0; c.huntRank = 99; c.lane = c.laneWant = LANES[i];
      if (route.ok && opts.how !== 'hunt') {
        c.mode = 'path'; c.sDir = -1; c.seg = route.pts.length - 2;
        // (crossAt: strung out along the deck, the leader t of the way over)
        const t = opts.how === 'crossAt' ? clamp(opts.t ?? 0.5, 0, 1) : 0;
        c.s = route.L - Math.max(0, t * (route.L - route.Lb) - i * 5.2);
        c.delay = opts.how === 'crossAt' ? 0 : i * FILE_GAP / crossSpeed();
        if (opts.how === 'crossAt') c.vis = 1;
        routeAt(c, c.s, c.lane, _ps);
        c.x = _ps.x; c.y = _ps.y; c.z = _ps.z; c.yaw = c.faceDir = _ps.yaw + Math.PI;
        c.pose = crossSpeed() > 6.5 ? 'bound' : 'lope';
      } else {
        c.mode = 'land'; c.delay = opts.how === 'hunt' ? 0 : i * 0.9;
        // (a hunt: fanned round the far side of him — the leader straight
        //  across, the rest out on the flanks where the lens can see them)
        const fan = [0, -1.05, 1.05, -1.7, 1.7][i] ?? 0;
        const a = (opts.how === 'hunt' ? (opts.ang ?? 0) + fan : (i - (R.n - 1) / 2) * 0.55);
        const r0 = opts.how === 'hunt' ? (opts.r ?? 11) + (i ? 1.5 : 0) + (i > 2 ? 2 : 0) : 2 + i * 1.3;
        const cx = opts.how === 'hunt' ? opts.x : landX(), cz = opts.how === 'hunt' ? opts.z : landZ();
        let x = cx + Math.sin(a) * r0, z = cz + Math.cos(a) * r0;
        const N = candyNav();
        if (N && N.built) { const k = N.nearestOpen(x, z, 12, null, true); if (k >= 0) { const q = N.cellCentre(k, { x: 0, z: 0 }); x = q.x; z = q.z; } }
        const q = H.resolveSpot(x, z, 4, 1.0);
        c.x = q[0]; c.z = q[1]; c.y = groundH(c.x, c.z);
        c.yaw = c.faceDir = opts.face ?? Math.atan2((opts.fx ?? cx) - c.x, (opts.fz ?? cz) - c.z);
        if (opts.how === 'hunt') c.vis = 1;
        c.pose = 'prowl';
      }
    }
    pack.x = opts.how === 'hunt' ? opts.x : landX(); pack.z = opts.how === 'hunt' ? opts.z : landZ();
    RT.graceUntil = S.elapsed + (opts.grace ?? 4);
    R.markT = 0;
    ctx.events.emit('raid:start', { n: R.n, via: R.via });
    if (!opts.quiet) {
      const where = ctx.state.island;
      if (where === 'candy' || where === 'sea') ui()?.banner?.('THE NIGHT WATCH', route.ok ? 'Something is crossing the rainbow.' : 'Something has come ashore at Sugar Pier.', 4.0, 'cat');
      else ui()?.toast?.(route.ok ? 'The night watch is crossing the rainbow. The Candy Kingdom will not sleep well.' : 'Some of the night watch have gone over to the Candy Kingdom.', 5);
    }
  }
  /** Everyone home, now (dawn, a jumped clock, the carry's lights-out). */
  function end() {
    // (a carry ended in its dark — a skip's, a cut's — must not leave the
    //  screen black now that ui.fade really shows: lift it)
    if (R.carry && (R.carry.stage === 'dark' || R.carry.cut === 1)) { try { ui()?.fade?.(false, 0.4); } catch (e) { /* no ui */ } }
    endHush(false);
    for (const c of party) { resetBody(c); hide(c); }
    if (R.phase !== 'home') ctx.events.emit('raid:home', {});
    R.phase = 'home'; R.retreat = false; R.carry = null;
    try { ui()?.removeMapMarker?.('tiger_raid'); } catch (e) { /* the map may not exist */ }
    rig.points.visible = false;
    rig.sync();
  }
  /** One raider turns for home: a yawn on the spot, then the trot to the foot of the bridge. */
  function sendHome(c) {
    c.homing = true; c.yawnUntil = S.elapsed + 1.4 + c.seed; c.think = 0; c.giveX = NaN;
    c.hBest = Infinity; c.hFd = Infinity; c.hT = 0;
  }
  function beginRetreat() {
    if (R.retreat) return;
    R.retreat = true; R.retreatT = 0;
    for (const c of party) {
      if (c.mode === 'land') { if (!c.homing && !c.carryTo) sendHome(c); }
      else if (c.mode === 'path' && c.sDir < 0) c.sDir = 1;          // still on the way over: turn round
    }
    if (visitorOnCandy()) ui()?.toast?.('The tigers yawn, and slink back toward the rainbow. Nobody mentions it.', 5);
  }

  // ── separation (capsules, as separateTigers does for the town) ────────────
  const CAP_BACK = 0.55, CAP_FWD = 1.0, CAP_R = 0.46, SEP_GAP = 0.3, PS_R = 1.9;
  const _sd = { px: 0, pz: 0, qx: 0, qz: 0, d: 0 };
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
  function separate() {
    for (let i = 0; i < party.length; i++) {
      const a = party[i]; if (a.mode !== 'land' || a.leapT > 0 || a.carryTo) continue;
      const ta = tigerScale(a), sa = Math.sin(a.yaw), ca = Math.cos(a.yaw);
      for (let j = i + 1; j < party.length; j++) {
        const b = party[j]; if (b.mode !== 'land' || b.leapT > 0 || b.carryTo) continue;
        const dx = b.x - a.x, dz = b.z - a.z, reach = 1.5 * (ta + 1.4) + SEP_GAP;
        if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
        const tb = tigerScale(b), sb = Math.sin(b.yaw), cb = Math.cos(b.yaw);
        const q = segSeg(a.x - sa * CAP_BACK * ta, a.z - ca * CAP_BACK * ta, a.x + sa * CAP_FWD * ta, a.z + ca * CAP_FWD * ta,
          b.x - sb * CAP_BACK * tb, b.z - cb * CAP_BACK * tb, b.x + sb * CAP_FWD * tb, b.z + cb * CAP_FWD * tb);
        const need = CAP_R * (ta + tb) + SEP_GAP;
        if (q.d >= need) continue;
        let nx = q.qx - q.px, nz = q.qz - q.pz, nl = q.d;
        if (nl < 1e-4) { nx = dx; nz = dz; nl = Math.hypot(nx, nz); if (nl < 1e-4) { nx = Math.cos(a.seed * 9); nz = Math.sin(a.seed * 9); nl = 1; } }
        nx /= nl; nz /= nl;
        const pen = need - q.d;
        let wa = a.moving ? (b.moving ? 0.5 : 0.75) : (b.moving ? 0.25 : 0.5);
        // on the way home, the one further along goes first (two meeting head
        // on in a gap between a fence and a gumdrop used to shove each other
        // back and forth until both gave up)
        if (a.homing && b.homing && a.hBest !== b.hBest) wa = a.hBest > b.hBest ? 1 : 0;
        const pa = Math.min(0.35, pen * wa), pb = Math.min(0.35, pen * (1 - wa));
        if (world.height(a.x - nx * pa, a.z - nz * pa) > 0.35) { a.x -= nx * pa; a.z -= nz * pa; }
        if (world.height(b.x + nx * pb, b.z + nz * pb) > 0.35) { b.x += nx * pb; b.z += nz * pb; }
        a.shovedAt = S.elapsed; b.shovedAt = S.elapsed;
      }
    }
    // personal space round the visitor (the spring and the carry excepted)
    const P = pl()?.position;
    if (!P || R.carry || !visitorOnCandy()) return;
    for (const c of party) {
      if (c.mode !== 'land' || c.leapT > 0 || (c.plan && (c.plan.spring || c.plan.catch))) continue;
      if (Math.abs(c.y - P.y) > 1.8) continue;      // (up on the planks over him: not crowding him)
      const T = tigerScale(c), sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      const x0 = c.x - sy * CAP_BACK * T, z0 = c.z - cy * CAP_BACK * T;
      const ux = sy * (CAP_BACK + CAP_FWD) * T, uz = cy * (CAP_BACK + CAP_FWD) * T, L2 = ux * ux + uz * uz;
      const k = L2 > 1e-9 ? clamp(((P.x - x0) * ux + (P.z - z0) * uz) / L2, 0, 1) : 0;
      let nx = x0 + ux * k - P.x, nz = z0 + uz * k - P.z;
      const d = Math.hypot(nx, nz), need = CAP_R * T + PS_R;
      if (d >= need) continue;
      if (d < 1e-4) { nx = c.x - P.x; nz = c.z - P.z; }
      const nl = Math.hypot(nx, nz) || 1, push = Math.min(0.3, need - d);
      let px = nx / nl, pz = nz / nl;
      if (c.homing) {
        // (going home past him: slide round him, never straight back — the
        //  bubble pushed harder than a lope and pinned one where it stood)
        const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
        let k = px * rx + pz * rz; if (Math.abs(k) < 0.25) k = c.seed > 0.5 ? 0.25 : -0.25;
        px = rx * Math.sign(k); pz = rz * Math.sign(k);
      }
      const x = c.x + px * push, z = c.z + pz * push;
      if (world.height(x, z) > 0.35) { c.x = x; c.z = z; c.shovedAt = S.elapsed; }
    }
  }
  const LANE_D = 3.4, LANE_W = 1.6;
  function raidSteer(c, u) {
    let ax = 0, az = 0;
    for (const o of party) {
      if (o === c || o.mode !== 'land' || o.carryTo) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      if (dx > LANE_D || dx < -LANE_D || dz > LANE_D || dz < -LANE_D) continue;
      const ahead = dx * u.x + dz * u.z; if (ahead <= 0) continue;
      const d = Math.hypot(dx, dz); if (d > LANE_D) continue;
      const lat = dx * -u.z + dz * u.x; if (lat > LANE_W || lat < -LANE_W) continue;
      const side = lat > 0 ? -1 : 1, w = (LANE_D - d) / LANE_D * (LANE_W - Math.abs(lat)) / LANE_W * 1.2;
      ax += -u.z * side * w; az += u.x * side * w;
    }
    u.x += ax; u.z += az;
  }

  // ── the pack's beat on Candyland ──────────────────────────────────────────
  const beat = world.PATHS.find((p) => p.id === 'candy_main');
  function updatePack(dt) {
    const P = pl()?.position;
    let tx, tz, sp;
    // (a long way behind him — the kids put him back on his feet at the pier,
    //  he ran — and the pack lopes after him; close, it drifts)
    const dP = P ? Math.hypot(P.x - pack.x, P.z - pack.z) : Infinity;
    if (P && visitorOnCandy() && dP < 110) { tx = P.x; tz = P.z; sp = dP > 30 ? 3.6 : 1.45; }
    else if (beat) {
      pack.pt += pack.pdir * dt * 0.009;
      if (pack.pt > 0.82) { pack.pt = 0.82; pack.pdir = -1; } else if (pack.pt < 0.02) { pack.pt = 0.02; pack.pdir = 1; }
      if ((pack.bt = (pack.bt || 0) - dt) <= 0) { pack.bt = 0.5; const q = world.pointOnPolyline(beat.points, pack.pt); pack.bx = q.x; pack.bz = q.z; }
      tx = pack.bx; tz = pack.bz; sp = 2.0;
    } else return;
    const dx = tx - pack.x, dz = tz - pack.z, d = Math.hypot(dx, dz);
    if (d < 0.5) return;
    const m = Math.min(d, sp * dt), nx = pack.x + dx / d * m, nz = pack.z + dz / d * m;
    if (world.height(nx, nz) > 0.6) { pack.x = nx; pack.z = nz; } else { pack.x += dx / d * m * 0.3; pack.z += dz / d * m * 0.3; }
  }

  // ── navigation on Candyland (the town's navigate(), simplified) ───────────
  const _nw = { x: 0, z: 0, d: 0 }, _nc = { x: 0, z: 0 };
  function rnav(c, plan) {
    if (!plan || plan.act !== 'post' || plan.hold) return plan;
    const now = S.elapsed;
    if (c.navHoldUntil > now && !c.carryTo && !c.homing && !(c.fxUntil > now) && !plan.catch && !plan.spring) {
      return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: c.faceDir, hold: 1 };
    }
    if (plan.x === c.x && plan.z === c.z) return plan;
    const N = candyNav(); if (!N || !N.built) return plan;
    const pose = plan.pose, P = pl()?.position;
    let key, sx, sz, tol;
    if (c.carryTo || c.homing || (c.escort && R.carry && R.carry.stage !== 'grab' && R.carry.stage !== 'land')) { key = 'rland'; sx = landX(); sz = landZ(); tol = 3; }
    else if (c.escort) { key = 'rcarry'; sx = plan.x; sz = plan.z; tol = 4; }
    else if (pose === 'flee' || pose === 'flinch') return plan;
    else if (pose === 'rush' || pose === 'stalk') {
      if (!P) return plan;
      key = 'rplayer'; sx = P.x; sz = P.z; tol = 3;
      if (plan.spring || plan.catch) {
        // the spring and the last lunge are at HIM. Where the grid has him on
        // open street, as ever (the lunge straight in); elsewhere straight in
        // only if it can really get at him from here, else round to the
        // nearest place it can, and in from there
        if (N.isMain(P.x, P.z)) { if (plan.catch) return plan; }
        else if (reachRun(N, c, c.x, c.z, P)) return plan;
        else if (approach(N, c, P)) {
          if ((c.apX - c.x) ** 2 + (c.apZ - c.z) ** 2 < 0.36) return plan;     // there: in
          plan.x = c.apX; plan.z = c.apZ; key = 'rspring'; sx = c.apX; sz = c.apZ; tol = 0.6;
        } else {
          // nowhere a tiger can get at him (indoors, a nook): the nearest
          // street round him, on its own side if it can, and it sits there
          // and stares at him — which is worse
          const b = Math.atan2(c.x - P.x, c.z - P.z);
          let found = false;
          for (let rr = 0; rr < 4 && !found; rr++) for (let k = 0; k < 13 && !found; k++) {
            const a = b + (k & 1 ? 1 : -1) * ((k + 1) >> 1) * 0.5, r = 1.5 + rr * 1.2;
            const x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
            if (N.isMain(x, z)) { plan.x = x; plan.z = z; found = true; }
          }
          if (!found || (plan.x - c.x) ** 2 + (plan.z - c.z) ** 2 < 0.64) {
            return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: Math.atan2(P.x - c.x, P.z - c.z), hold: 1 };
          }
        }
      } else {
        if (plan.ring && !(N.isOpen(plan.x, plan.z) && N.los(c.x, c.z, plan.x, plan.z))) {
          if (N.isOpen(plan.ax, plan.az) && N.los(c.x, c.z, plan.ax, plan.az)) { plan.x = plan.ax; plan.z = plan.az; }
          else return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: Math.atan2(P.x - c.x, P.z - c.z), hold: 1 };
        }
        // a stalking step that lands somewhere a tiger cannot go (a hedge, a
        // porch): the nearest street round him at that distance instead
        if (!plan.ring && !N.isMain(plan.x, plan.z)) {
          const b = Math.atan2(c.x - P.x, c.z - P.z), r0 = Math.max(1.5, Math.hypot(plan.x - P.x, plan.z - P.z));
          let found = false;
          for (let rr = 0; rr < 4 && !found; rr++) for (let k = 0; k < 9 && !found; k++) {
            const a = b + (k & 1 ? 1 : -1) * ((k + 1) >> 1) * 0.3, r = r0 + rr * 1.5;
            const x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
            if (N.isMain(x, z)) { plan.x = x; plan.z = z; found = true; }
          }
        }
      }
    } else if (pose === 'prowl' || pose === 'lope') {
      if (!N.isMain(plan.x, plan.z)) { const i = N.nearestOpen(plan.x, plan.z, 8, null, true); if (i >= 0) { N.cellCentre(i, _nc); plan.x = _nc.x; plan.z = _nc.z; } }
      key = 'rpack'; sx = pack.x; sz = pack.z; tol = 4;
    } else return plan;
    const gx = plan.x, gz = plan.z, dg2 = (gx - c.x) ** 2 + (gz - c.z) ** 2;
    const lunge = !!(plan.spring || plan.catch);
    if (!c.carryTo && !c.homing && !lunge && ((dg2 < 7.8 && c.touchT > 0.5) || (dg2 < 20 && c.wdB > 1.5 && c.wdHit))) {
      c.navHoldUntil = now + 1.2 + c.seed;
      return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: Math.atan2(gx - c.x, gz - c.z), hold: 1 };
    }
    // a hunter whose goal is the spot it is standing on, with him still out of
    // reach, has not arrived anywhere: the field to him says where to go
    const noGoal = key === 'rplayer' && !plan.ring && dg2 < 0.36 && P && (P.x - c.x) ** 2 + (P.z - c.z) ** 2 > 5.76;
    if (!noGoal && N.los(c.x, c.z, gx, gz)) return plan;
    const f = N.field(key, sx, sz, tol, R.frame);
    if (!f) return plan;
    if (!N.next(f, c.x, c.z, 40, _nw)) {
      if (c.carryTo || c.homing) {
        // off the field (wedged in a pocket, or the field is stale): make for
        // the nearest piece of real street it reaches first, never straight
        // into whatever is between here and the bridge (a homing raider that
        // still gets no nearer slinks off: HOME_STALL)
        const i = N.nearestOpen(c.x, c.z, 10, f.d, true);
        if (i >= 0) { N.cellCentre(i, _nc); plan.x = _nc.x; plan.z = _nc.z; plan.nav = 1; }
        return plan;
      }
      c.navHoldUntil = now + 2 + c.seed * 2;
      return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: Math.atan2(gx - c.x, gz - c.z), hold: 1 };
    }
    if ((_nw.x - c.x) ** 2 + (_nw.z - c.z) ** 2 < 0.6 && !c.carryTo && !c.homing) {
      // (a lunge at the end of its field: the last step is straight — to the
      //  approach cell's centre, or at him)
      if (lunge && P) {
        if (key === 'rspring') { plan.x = c.apX; plan.z = c.apZ; } else { plan.x = P.x; plan.z = P.z; }
        return plan;
      }
      // the field's next step is the cell it is standing on: as close as a
      // tiger gets (he is on the pier, in a doorway, between two hedges) —
      // it sits down right there and stares at him, which is worse
      c.navHoldUntil = now + 1.4 + c.seed;
      const fx = P && (pose === 'rush' || pose === 'stalk') ? Math.atan2(P.x - c.x, P.z - c.z) : Math.atan2(gx - c.x, gz - c.z);
      return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: fx, hold: 1 };
    }
    plan.x = _nw.x; plan.z = _nw.z; plan.nav = 1;
    if (c.homing && _nw.d + 1 < c.hFd) { c.hFd = _nw.d; c.hT = 0; }   // (getting nearer by the field)
    return plan;
  }

  /** Is c close to him as the crow flies but on the wrong side of something
   *  (the walk round more than twice as far)? Then sitting in its pocket
   *  staring is not a hunt: it presses in early. */
  function wrongSide(c, P, d) {
    if (d > 14 || !nav || !nav.built) return false;
    const f = nav.field('rplayer', P.x, P.z, 3, R.frame);
    return !!f && nav.distAt(f, c.x, c.z) > d * 2 + 6;
  }

  // ── one raider's plan on Candyland ─────────────────────────────────────────
  function planLand(c) {
    const now = S.elapsed, P = pl()?.position;
    if (c.stage && !c.carryTo) return stagePlan(c);
    if (c.yawnUntil > now) return { act: 'post', x: c.x, z: c.z, pose: 'yawn', face: c.faceDir, hold: 1 };
    if (c.carryTo) {
      const C = R.carry;
      if (C && C.stage === 'grab') return { act: 'post', x: c.x, z: c.z, pose: 'carry', face: c.faceDir, hold: 1 };
      return rnav(c, { act: 'post', x: landX(), z: landZ(), pose: 'carrygallop', speed: CARRY_LAND });
    }
    if (c.escort && R.carry && R.carry.stage !== 'grab' && R.carry.stage !== 'land') {
      // the carrier is on the rainbow: up after it
      return rnav(c, { act: 'post', x: landX(), z: landZ(), pose: 'rush', speed: CARRY_LAND * 1.3 });
    }
    if (c.escort && R.carry) {
      const k = R.carry.cat;
      const bx = k.x - Math.sin(k.yaw) * 3.6 * c.escort + Math.cos(k.yaw) * (c.escort === 1 ? 1.3 : -1.3);
      const bz = k.z - Math.cos(k.yaw) * 3.6 * c.escort - Math.sin(k.yaw) * (c.escort === 1 ? 1.3 : -1.3);
      const d = Math.hypot(bx - c.x, bz - c.z);
      if (d < 1.2) return { act: 'post', x: c.x, z: c.z, pose: 'watch', face: k.yaw, hold: 1 };
      return rnav(c, { act: 'post', x: bx, z: bz, pose: d > 6 ? 'rush' : 'lope', speed: d > 6 ? CARRY_LAND * 1.25 : CARRY_LAND });
    }
    if (c.homing) {
      const far = (c.x - landX()) ** 2 + (c.z - landZ()) ** 2 > 35 * 35;
      return rnav(c, { act: 'post', x: landX(), z: landZ(), pose: far ? 'lope' : 'trot', speed: far ? HOME_LOPE : HOME_TROT });
    }
    // catnip: a ring they will not cross; they sit at its edge and stare
    if (P && nipRepels() && visitorOnCandy()) {
      const dx = c.x - P.x, dz = c.z - P.z, d = Math.hypot(dx, dz);
      if (d < 18) {
        if (now - c.nipAt > 20 && d < 14) { c.nipAt = now; if (now - R.lineAt > 6) { R.lineAt = now; say(c, LINES_NIP[c.idx % LINES_NIP.length]); } }
        const toP = Math.atan2(P.x - c.x, P.z - c.z);
        if (d < NIP_R) {
          const ux = d > 1e-3 ? dx / d : Math.sin(c.yaw), uz = d > 1e-3 ? dz / d : Math.cos(c.yaw);
          return rnav(c, { act: 'post', x: P.x + ux * (NIP_R + 1.2), z: P.z + uz * (NIP_R + 1.2), pose: 'flinch', speed: 3.2, face: toP });
        }
        return { act: 'post', x: c.x, z: c.z, pose: (c.seed + now * 0.05) % 1 < 0.6 ? 'watch' : 'crouch', face: toP, hold: 1 };
      }
    }
    let plan = tigerPlan(c, ctx.state.time, ctx, S, RT);
    // THE PRESS: the one nearest him has got no nearer in PRESS_SECS while he
    // stands there to be caught (its ring steps a shopfront both ways, a spring
    // that ended at a fence): it stops circling and comes for him, round
    // whatever was in the way (rnav → approach). Never in the grace, at a
    // star, or at a visitor it cannot get at (indoors, it waits at the door).
    // A press lasts as long as it keeps getting somewhere (the way round may
    // lead away from him first): 1.5 u in every 3 s. Wedged — a way the grid
    // has that the world does not — that way in is closed to it for a while
    // (the approach cell is banned) and it goes back to stalking him; if that
    // gets no nearer either, it presses again, another way.
    if (P && c.huntRank === 0 && visitorOnCandy() && catchable()) {
      const d = Math.hypot(P.x - c.x, P.z - c.z);
      if (c.pressUntil > now) {
        if (now - c.mvAt >= 3) {
          if ((c.x - c.mvX) ** 2 + (c.z - c.mvZ) ** 2 < 2.25) {
            if (c.apOK) { c.apBan = c.apI; c.apBanUntil = now + 15; c.apAt = -99; }
            c.pressUntil = 0; c.pAt = now; c.pBest = d; c.pX = P.x; c.pZ = P.z;
          } else { c.mvAt = now; c.mvX = c.x; c.mvZ = c.z; }
        }
      } else if (c.pAt < 0 || (P.x - c.pX) ** 2 + (P.z - c.pZ) ** 2 > 2.25 || d < c.pBest - 0.75) { c.pAt = now; c.pBest = d; c.pX = P.x; c.pZ = P.z; }
      else if (now - c.pAt > (d < PRESS_NEAR_R ? PRESS_NEAR : PRESS_SECS) || (now - c.pAt > PRESS_WRONG && wrongSide(c, P, d))) { c.pressUntil = now + 40; c.mvAt = now; c.mvX = c.x; c.mvZ = c.z; }
      if (c.pressUntil > now && !plan.catch && !plan.spring) plan = { act: 'post', x: P.x, z: P.z, pose: 'rush', spring: 1, press: 1, speed: 4.4 + (c.spec.size ?? 1) * 0.6 };
    } else { c.pAt = -1; c.pressUntil = 0; }
    // left behind by a pack on the move: lope to catch up, not a stroll
    if (plan.pose === 'prowl' && (c.x - pack.x) ** 2 + (c.z - pack.z) ** 2 > 196) { plan.pose = 'lope'; plan.speed = 4.2; }
    // a line, now and then, from the one closest to you
    if (P && c.huntRank === 0 && visitorOnCandy() && (plan.pose === 'stalk' || plan.pose === 'crouch') && now - R.lineAt > 16) {
      R.lineAt = now; say(c, LINES_HUNT[(R.lines = (R.lines || 0) + 1) % LINES_HUNT.length]);
    }
    return rnav(c, plan);
  }

  // ── the carry: over the rainbow by the scruff ──────────────────────────────
  const _mouth = { x: 0, y: 0, z: 0 };
  function mouth(c, out) {
    const T = tigerScale(c);
    const z = (TP.spineZ + TP.neckZ + TP.headZ + TP.muzzleZ + 0.20) * T;
    const y = (TP.spineY + TP.neckY + TP.headY + TP.muzzleY) * T;
    const p = c.slope || 0, cp = Math.cos(p), sp = Math.sin(p);
    const yy = y * cp - z * sp, zz = y * sp + z * cp;
    out.x = c.x + Math.sin(c.yaw) * zz; out.y = c.y + (c.air || 0) + yy; out.z = c.z + Math.cos(c.yaw) * zz;
    return out;
  }
  /** The carry's lens aim: his collar, pulled back a little over the tiger
   *  (so both of them fill the frame). One object, reused every frame. */
  const _aim = { x: 0, y: 0, z: 0 };
  function carryAim(C) {
    const c = C.cat, T = tigerScale(c);
    mouth(c, _mouth);
    const back = C.stage === 'bridge' || C.stage === 'dark' ? 0.9 * T : 0;
    _aim.x = _mouth.x - Math.sin(c.yaw) * back; _aim.z = _mouth.z - Math.cos(c.yaw) * back;
    _aim.y = _mouth.y + (back > 0 ? -0.35 : 0.3);
    return _aim;
  }
  // THE SCRUFF. The jaws close on his collar (the back of the neck, NECK_Y
  // up from his feet in player/visitor.js) and the rest of him hangs from
  // it: facing the way the tiger is going, his back to its teeth, knees
  // tucked up like a kitten's (the 'sit' riding pose), swinging a little
  // fore and aft as it walks. So the muzzle is AT his collar — contact — and
  // his body is in front of its chest, never through its face. (It used to
  // hold him by the ankles, stuck out sideways: a baguette, not a kitten.)
  // The pivot is the grip, so the swing turns him about his neck, not his feet.
  const NECK = 1.24, NECK_BACK = 0.10;
  const _hang = new THREE.Vector3(), _hLow = new THREE.Vector3(), _hEu = new THREE.Euler(0, 0, 0, 'YXZ');
  // his body's box in the 'sit' pose (knees up), his own frame: its eight
  // corners, turned with him, are how low he reaches (as citizens/carry.js —
  // one point at the toes let a heel or the seat through the planks)
  const SIT_BOX = [-0.57, 0.14, -0.44, 0.58, 1.89, 0.56];
  /** The floor under a point of the carry at height y: the rainbow's deck,
   *  or whatever a walker there stands on (Sugar Pier's planks, the ground). */
  function carryFloor(x, z, y) {
    const d = deckY(x, z);
    if (Number.isFinite(d)) return d;
    const p = pl();
    if (p && typeof p.groundInfo === 'function') {
      const P = p.position, keep = P ? P.y : 0;
      if (P) P.y = y + 0.35;
      try { p.groundInfo(x, z, _gi); } finally { if (P) P.y = keep; }
      if (Number.isFinite(_gi.h)) return _gi.h;
    }
    return world.height(x, z);
  }
  /** Where the jaws REALLY are this frame: the rig's own head (tiger.js
   *  posed it — the 'carry' pose's lifted head and pitch, the gallop's bob,
   *  the deck's pitch), the grip a touch under and ahead of the muzzle, as
   *  citizens/carry.js mouthOf. The static mouth() is the rig at rest: the
   *  'carry' pose holds the head ~1 u higher than that, and hung from it he
   *  dangled a metre under the teeth for the whole grab. */
  const _jv = new THREE.Vector3();
  function jaws(c, out) {
    const TG = c.TG || c.rig?.tiger;
    if (TG && TG.headPivot && TG.root && TG.root.scale.x > 1e-3) {
      TG.headPivot.updateWorldMatrix(true, false);
      _jv.set(0, TP.muzzleY - 0.06, TP.muzzleZ + 0.14).applyMatrix4(TG.headPivot.matrixWorld);
      out.x = _jv.x; out.y = _jv.y; out.z = _jv.z;
      return out;
    }
    return mouth(c, out);
  }
  const HEEL_MAX = 0.42;                          // the most his collar may ride over the teeth (a pounce's first frames)
  function placeCarried(k = 1) {
    const C = R.carry, p = pl(); if (!C || !p) return;
    const c = C.cat;
    jaws(c, _mouth);
    const el = C.clk || 0, g = p.group;             // (the carry's own clock: it stops when paused)
    const amp = c.moving ? 1 : 0.55;
    const swing0 = (-0.05 + Math.sin(el * 2.3 + c.ph) * 0.11 * amp) * k;      // fore / aft about the grip
    const sway = Math.sin(el * 1.6 + c.ph * 0.7) * 0.06 * amp * k;           // a slow side roll
    const f0 = C.face0 ?? c.yaw;
    const yaw = f0 + wrapPi(c.yaw - f0) * k;
    // The collar IS the grip, from the grab's first frame (the pounce is the
    // contact: k only turns him from his own facing to the tiger's). Climbing
    // the rainbow the deck ahead rises to meet his feet: he swings back under
    // its chin (feet toward its chest, never through the planks) — the first
    // of a few steps back that clears the floor by a hand; and while the
    // head is still coming up out of the spring his heels stay on the ground
    // (the collar a hand over the teeth, never his shoes through the planks).
    let fx = 0, fy = 0, fz = 0, gap = 0;
    for (let i = 0; i < 7; i++) {
      _hEu.set(swing0 + i * 0.11, yaw, sway);
      if (g) g.quaternion.setFromEuler(_hEu);
      _hang.set(0, NECK, -NECK_BACK);
      if (g) _hang.applyQuaternion(g.quaternion); else _hang.set(0, NECK, 0);
      fx = _mouth.x - _hang.x; fy = _mouth.y - _hang.y; fz = _mouth.z - _hang.z;
      if (!g) break;
      gap = Infinity;
      for (let q = 0; q < 8; q++) {
        _hLow.set(q & 1 ? SIT_BOX[3] : SIT_BOX[0], q & 2 ? SIT_BOX[4] : SIT_BOX[1], q & 4 ? SIT_BOX[5] : SIT_BOX[2]).applyQuaternion(g.quaternion);
        if (_hLow.y > 0.7) continue;                 // (the head end: never the lowest)
        const gq = fy + _hLow.y - carryFloor(fx + _hLow.x, fz + _hLow.z, fy + _hLow.y) - 0.08;
        if (gq < gap) gap = gq;
      }
      if (gap >= 0) break;
    }
    if (gap < 0) fy -= Math.max(gap, -HEEL_MAX);
    p.position.set(fx, fy, fz);
    p.velocity?.set?.(0, 0, 0);
    if (g) g.position.copy(p.position);
  }
  function catchable() {
    const p = pl();
    if (!p || R.carry || H.T.carrying || p.locked || p.onFerry || p.invulnerable) return false;
    if (ctx.systems.powerups?.active || S.elapsed <= RT.graceUntil || ctx.state.vehicle) return false;
    return true;
  }
  function startCarry(c, onPath = false) {
    if (!catchable()) return;
    const p = pl();
    endHush(true);                                   // (the carry's shot supersedes the hush's)
    const C = R.carry = { cat: c, t: 0, stage: onPath ? 'bridge' : 'grab', k: 0, cine: null, o: null, lines: 0, cut: 0, face0: p.facing ?? c.yaw };
    c.carryTo = { x: landX(), z: landZ() };
    c.think = 0; c.homing = false;
    p.locked = true; p.onFerry = true; p.setEmotion?.('scared');
    p.setPose?.('sit');                              // knees up: a kitten in the scruff
    say(c, onPath ? '“Oh — THERE you are. Come on. Home.”' : '“Got you. Long way home. Hold still.”');
    ctx.systems.camera?.shake?.(0.45, 0.5);
    ctx.systems.audio?.play?.('growl');
    const o = C.o = {
      target: () => carryAim(C),
      distance: 12.0, elevation: 0.34, duration: 3600, in: 0.7, hold: 3598, out: 0.9,
    };
    C.cine = ctx.systems.camera?.cinematic?.(o) || null;
    // (a scuff of dust and a few glints — the old 24-puff white cloud hid the grab)
    ctx.systems.particles?.dust?.(p.position.x, p.position.y + 0.05, p.position.z, { count: 5, size: 0.3, alpha: 0.3 });
    ctx.systems.particles?.burst?.({ x: p.position.x, y: p.position.y + 1.3, z: p.position.z, count: 7, shape: 'sparkle', blend: 'add', color: [0xffe9a8, 0xfff4e0], speed: 1.4, life: 0.45, size: 0.12, gravity: 0, spread: 0.25 });
    ctx.events.emit('cats:caught', { cat: c, name: c.tiger.full, raid: true });
    const st = story(); st?.set?.('carried_home', (st.get?.('carried_home') || 0) + 1);
    // the escort: the two nearest fall in behind
    const others = party.filter((o2) => o2 !== c && o2.mode === 'land' && !o2.homing)
      .sort((a, b) => ((a.x - c.x) ** 2 + (a.z - c.z) ** 2) - ((b.x - c.x) ** 2 + (b.z - c.z) ** 2));
    for (let i = 0; i < others.length; i++) { others[i].escort = i < 2 ? i + 1 : 0; others[i].think = 0; }
    if (onPath) enterBridge(C);
  }
  function enterBridge(C) {
    const c = C.cat;
    if (!route.ok) { C.stage = 'dark'; C.t = 0; ui()?.fade?.(true, 1.1); return; }
    C.stage = 'bridge'; C.t = 0;
    if (c.mode !== 'path') { c.mode = 'path'; c.s = 0; c.seg = 0; }
    c.sDir = 1; c.laneWant = 0;
    C.speed = clamp((route.L - c.s) / CARRY_SECS, 3.2, 9.5);
    // side-on from OUTSIDE the arc (left of the way they are going: the U
    // turns right), low, so the bands are under them and both islands behind
    routeAt(c, c.s, 0, _ps);
    C.side = wrapPi(_ps.yaw + Math.PI / 2);
    // (close and low: the tiger's head and him in its jaws a quarter of the
    //  frame, the bands' edge under them, the far island and the night above —
    //  not a steep look down on 45% empty sea)
    if (C.o) { C.o.azimuth = C.side; C.o.distance = CARRY_CAM_D; C.o.elevation = CARRY_CAM_EL; }
    for (const o of party) if (o.escort && o.mode === 'land') o.think = 0;
  }
  function endCarry() {
    const C = R.carry; if (!C) return;
    C.cat.carryTo = null;
    // (a new, instant shot supersedes the carry's; the lens lands on him wherever he now is)
    try {
      const cam = ctx.systems.camera, p = pl();
      if (cam?.cinematic && p) cam.cinematic({ target: () => p.position, duration: 0.05, in: 0, hold: 0, out: 0.05 });
      else C.cine?.cancel?.();
    } catch (e) { /* camera gone */ }
    const p = pl();
    if (p) {
      p.onFerry = false; p.locked = false; p.setEmotion?.(null); p.setPose?.('stand');
      const g = p.group; if (g) { g.rotation.x = 0; g.rotation.z = 0; if (Number.isFinite(p.facing)) g.rotation.y = p.facing; }
    }
    R.carry = null;
  }
  /** Give the carrier (and him, in its jaws) to the town's bedtime. The two
   *  escorts peel off at the pier; the rest of the party hunts on. */
  function handOff(C, dark) {
    const bt = H.bedtime, c = C.cat;
    if (!bt || typeof bt.fromRaid !== 'function' || bt.active) return false;
    for (const o of party) if (o !== c && o.escort) { o.escort = 0; o.think = 0; if (o.mode === 'path' || o.mode === 'land') { o.mode = 'fade'; o.fadeT = 1; } }
    const mode0 = c.mode;
    c.carryTo = null; c.moving = false; c.mode = 'rail';
    R.carry = null;
    if (!bt.fromRaid(c, { dark })) { c.mode = mode0; R.carry = C; return false; }
    return true;
  }
  function updateCarry(dt) {
    const C = R.carry; if (!C) return;
    const c = C.cat;
    C.t += dt; C.clk = (C.clk || 0) + dt;
    // skip: any key once he is in the jaws → straight to lights-out (still in the jaws)
    C.age = (C.age || 0) + dt;
    const inp = ctx.input;
    if (C.age > 1.2 && !ctx.state.paused && (C.stage === 'land' || C.stage === 'bridge') && !C.cut && inp && inp.pressed && inp.pressed.size > 0) {
      C.stage = 'dark'; C.t = 0; C.skipped = true; ui()?.fade?.(true, 0.8);
    }
    if (C.stage === 'grab') {
      C.k = Math.min(1, C.k + dt * 7); placeCarried(C.k);
      if (C.t > 0.85) { C.stage = 'land'; C.t = 0; c.think = 0; }
    } else if (C.stage === 'land') {
      placeCarried(1);
      const d = Math.hypot(c.x - landX(), c.z - landZ());
      if (d < 2.4) enterBridge(C);
      else if (C.t > CARRY_CUT && !C.cut) {
        // (stuck, or a very long way from the pier): a cut, in the dark
        C.cut = 1; C.cutT = 0; ui()?.fade?.(true, 0.45);
      }
      if (C.cut === 1) {
        C.cutT += dt;
        if (C.cutT > 0.5) {
          C.cut = 2;
          c.x = landX(); c.z = landZ(); c.y = groundH(c.x, c.z); resetBody(c); c.carryTo = { x: c.x, z: c.z };
          // the cut: the carry's shot re-issued with in: 0.01 (camera.snap()
          // drops a running cinematic outright — the bridge was then filmed
          // by the follow lens, and enterBridge's framing went nowhere)
          if (C.o) { const o2 = Object.assign({}, C.o); o2.in = 0.01; C.o = o2; C.cine = ctx.systems.camera?.cinematic?.(o2) || C.cine; }
          else ctx.systems.camera?.snap?.();
          ui()?.fade?.(false, 0.5);
          enterBridge(C);
        }
      }
    } else if (C.stage === 'bridge') {
      placeCarried(1);
      const f = route.L > 0 ? c.s / route.L : 1;
      if (C.lines === 0 && f > 0.3) { C.lines = 1; say(c, LINES_BRIDGE[0]); }
      if (C.lines === 1 && f > 0.72) { C.lines = 2; say(c, LINES_BRIDGE[1]); }
      // the lens rides outside the arc as it turns, drifting a little (≤ 30°)
      if (C.o && C.side !== undefined) {
        routeAt(c, Math.min(route.L, c.s + 6), 0, _ps);
        const want = wrapPi(_ps.yaw + Math.PI / 2 + Math.sin(C.t * 0.16) * 0.26);
        C.side = wrapPi(C.side + wrapPi(want - C.side) * (1 - Math.exp(-1.2 * dt)));
        C.o.azimuth = C.side;
      }
      // the Cat end of the rainbow: the town's bedtime (citizens/carry.js)
      // takes him from here — a dip to black, the last stretch to the guest
      // house, the tuck-in; he stays in these jaws all the way
      if (c.s >= route.L - 0.05) { if (!handOff(C, false)) { C.stage = 'dark'; C.t = 0; ui()?.fade?.(true, 1.1); } }
    } else if (C.stage === 'dark') {
      placeCarried(1);                              // still in the jaws until the lights are out
      if (C.t > 1.2 && handOff(C, true)) return;
      if (C.t > 1.2) {
        const name = c.tiger;
        endCarry();
        end();
        H.putToBed(name, {
          title: `Carried home by ${name.short}. Over the rainbow.`,
          body: `${name.full} carried you the whole length of the rainbow by the scruff of your neck, deposited you in the guest bed, straightened the blanket with one enormous paw, and sat outside the door until morning. The others walked behind the whole way, carrying nothing, looking pleased.`,
        });
        ctx.systems.camera?.snap?.();
        ui()?.fade?.(false, 1.2);
        R.wake = 1.25;
      }
    }
  }

  // ── THE HUSH: under the planks, with something walking on them ─────────────
  // The raid's scariest beat is not the chase. It is the visitor crouched in
  // the dark gap under a footbridge or a deck while a tiger pads along the
  // planks a hand's breadth over his hat, sniffing the gaps. The gameplay lens
  // (31 u off, looking down) sees only the deck, and one jammed in behind him
  // under it sees only posts. So while he is under a deck (a walkable 1.2–3.6
  // u over his feet) and a raider is within HUSH_R, the raid takes the lens
  // for a held breath: LOW (HUSH_EL) and 3/4 from OUTSIDE the deck's edge —
  // the one bearing of 24 whose lens stands clear of every deck, over open
  // ground, with a clear sight line in under the planks to him and the raider
  // on his right in the frame. A plain cinematic, so the camera's own rules
  // still run (the see-through window dithers out a post between the lens
  // and him; the dolly stays in front of a trunk). He keeps control (WASD
  // reads controlAzimuth, never a shot's yaw); the shot eases out when he
  // leaves the deck's shadow, the raiders go, or after HUSH_MAX, and does not
  // come back for HUSH_COOL.
  const HUSH_R = 11, HUSH_KEEP_R = 15, HUSH_MAX = 14, HUSH_COOL = 10;
  const HUSH_D = 9.0, HUSH_D2 = 7.0, HUSH_EL = 0.24, HUSH_FOV = 40;
  const LINES_HUSH = [
    '“Sniff. …Sunscreen. Somebody down there is wearing SUNSCREEN.”',
    '“We can wait. We are extremely good at waiting.”',
    '“Come out, come out. The blanket is already turned down.”',
  ];
  const _hgi = { h: 0, deck: false }, _hpo = { x: 0, z: 0, hit: false };
  /** The top of a walkable deck at (x,z) as a walker whose feet are at y
   *  would find it (the walkables judge by the visitor's height: lend it). */
  function deckAt(x, z, y) {
    const p = pl(); if (!p || !p.position || typeof p.groundInfo !== 'function') return NaN;
    const P = p.position, keep = P.y; P.y = y; _hgi.deck = false;
    try { p.groundInfo(x, z, _hgi); } catch (e) { _hgi.deck = false; } finally { P.y = keep; }
    return _hgi.deck && Number.isFinite(_hgi.h) ? _hgi.h : NaN;
  }
  /** The deck over a walker standing at (x, y, z): its top 1.2–3.6 u over his feet, or NaN. */
  function deckOver(x, z, y) {
    const h = deckAt(x, z, y + 1.0);
    return Number.isFinite(h) && h > y + 1.2 && h < y + 3.6 ? h : NaN;
  }
  // The aim is low — his chest, pulled half way toward the raider —
  // so the lens (HUSH_D out, at the shot's elevation) stands UNDER the deck's
  // edge and looks in under the planks; the shot's `pitch` then lifts the
  // frame until the raider over him is in its upper half.
  const _hA = { x: 0, y: 0, z: 0 };              // the shot's aim, damped (the camera reads this object)
  function hushAim(c, P, k) {
    const x = P.x + (c.x - P.x) * 0.5, z = P.z + (c.z - P.z) * 0.5, y = P.y + 0.8;
    _hA.x += (x - _hA.x) * k; _hA.y += (y - _hA.y) * k; _hA.z += (z - _hA.z) * k;
  }
  /** The shot's elevation: as high as HUSH_EL while the lens stays level with
   *  the deck's top — edge-on, the planks are a line: above it the raider's
   *  paws, below it the dark gap and him. */
  function hushEl(deck, D = HUSH_D) {
    if (!Number.isFinite(deck)) return HUSH_EL;
    const room = deck - 0.1 - _hA.y;
    return clamp(Math.asin(clamp(room / D, -1, 1)), 0.03, HUSH_EL);
  }

  /** The bearing for the lens (see above). 24 candidates × 8 samples, once a shot. */
  // One bearing's worth of framing: where the lens stands (lifted 1.6 u clear
  // of the ground as the camera will lift it), and the frame's centre angle
  // that puts his knees above the dialogue box and the raider's brow under the
  // top edge (both angles from the lens, + up). HUSH_VHALF: half of HUSH_FOV.
  const HUSH_VHALF = HUSH_FOV * Math.PI / 360;
  const LO_K = Math.atan(0.52 * Math.tan(HUSH_VHALF)), HI_K = Math.atan(0.76 * Math.tan(HUSH_VHALF));
  const _hb = { az: 0, d: HUSH_D, s: -Infinity, pitch: 0 };
  function hushBearing(P, c, deck, dbg, force) {
    const p = pl(), az0 = ctx.systems.camera?.params?.azimuth ?? 0.78;
    const knee = P.y + 0.3, head = P.y + 1.0, brow = c.y + (TP.spineY + 0.55) * tigerScale(c);
    _hb.az = az0; _hb.d = HUSH_D; _hb.s = -Infinity; _hb.pitch = 0;
    const nj = force ? 1 : 48;
    for (let j = 0; j < nj; j++) {
      const i = j % 24, D = force ? (force.dist ?? HUSH_D) : j < 24 ? HUSH_D : HUSH_D2, el = hushEl(deck, D);
      const hd = D * Math.cos(el), ly0 = _hA.y + D * Math.sin(el);
      const az = force ? force.az : (i / 24) * TAU, lx = _hA.x + Math.sin(az) * hd, lz = _hA.z + Math.cos(az) * hd;
      let sg = 0, sl = 0, sb = 0, sf = 0;
      const gh = world.height(lx, lz);
      // (the camera keeps its lens 1.6 u over the ground: where the bank
      //  rises it is lifted — fine, while it still looks in under the planks)
      const ly = Math.max(ly0, gh + 1.6);
      if (gh < 0.4) sg -= 2;                                         // out over the sea
      if (Number.isFinite(deck) && ly > deck + 0.2) sg -= 2 + (ly - deck - 0.2) * 8;     // over the planks: he is gone
      if (Number.isFinite(deckAt(lx, lz, ly - 1.2))) sg -= 6;         // on, under or beside a deck: a frame of planks
      for (let k = 1; k <= 7; k++) {                                  // the sight lines in to his head and his knees
        const u = k / 8, x = lx + (P.x - lx) * u, z = lz + (P.z - lz) * u;
        const yh = ly + (head - ly) * u, yk = ly + (knee - ly) * u, g = world.height(x, z);
        if (g > yh - 0.15) sl -= 1.5; else if (g > yk - 0.1) sl -= 0.6;   // (a bank over his knees: half of him amber)
        const dk = deckAt(x, z, yh - 0.3);
        if (Number.isFinite(dk) && Math.abs(dk - yh) < 0.45) sl -= 2; // it cuts a deck
        if (p && typeof p.pushOut === 'function') { p.pushOut(x, z, 0.3, _hpo); if (_hpo.hit) sl -= 1; }
      }
      // …and the raider's brow in sight over the deck's edge (a line that runs
      // on under the planks it stands on sees its paws through the boards)
      for (let k = 1; k <= 5; k++) {
        const u = k / 6, x = lx + (c.x - lx) * u, z = lz + (c.z - lz) * u, y = ly + (brow - ly) * u;
        const dk = deckAt(x, z, y + 1.0);
        if (Number.isFinite(dk) && dk > y + 0.05 && dk < brow) sb -= 1.2;
      }
      // the raider in the frame, and on his right (three's lookAt: right = (−fz, fx))
      let fx = P.x - lx, fz = P.z - lz; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const tx = c.x - P.x, tz = c.z - P.z, side = tx * -fz + tz * fx, depth = tx * fx + tz * fz;
      const off = Math.abs(side) / Math.max(2, fl + depth);
      sf += side > 0.4 ? 1 : side < -0.4 ? -1 : 0;
      if (off > 0.34) sf -= (off - 0.34) * 8;                         // out of the frame
      // nearer the lens than him, the window would dither it out (it opens on
      // whatever stands in front of him): the raider belongs behind or beside
      if (depth < 0) sf -= 0.6 - depth * 0.9;
      // …and both of them in the frame's height: his knees clear of the
      // dialogue box, its brow under the top edge
      const aK = Math.atan2(knee - ly, fl), aB = Math.atan2(brow - ly, Math.max(1, Math.hypot(c.x - lx, c.z - lz)));
      const lo = aB - HI_K, hi = aK + LO_K;
      if (lo > hi) sf -= (lo - hi) * 10;
      const C = lo > hi ? (aK + aB) * 0.5 : (lo + hi) * 0.5;
      const sk = -Math.abs(wrapPi(az - az0)) * 0.1 + (D === HUSH_D ? 0 : -0.3);    // (continuity; the longer lens by a hair)
      const s = sg + sl + sb + sf + sk;
      if (dbg) dbg.push([+az.toFixed(2), D, +s.toFixed(2), { g: +sg.toFixed(2), l: +sl.toFixed(2), b: +sb.toFixed(2), f: +sf.toFixed(2), k: +sk.toFixed(2) }]);
      if (s > _hb.s) {
        _hb.s = s; _hb.az = az; _hb.d = D;
        // the camera lookAt()s the aim from the (lifted) lens; the pitch turns that onto C
        _hb.pitch = clamp(C - Math.atan2(_hA.y - ly, hd), -0.05, 0.45);
      }
    }
    return _hb;
  }
  function startHush(c, snap = false, dbg = null, ov = null) {
    const cam = ctx.systems.camera, P = pl()?.position;
    if (!cam || typeof cam.cinematic !== 'function' || !P) return false;
    _hA.x = P.x; _hA.y = P.y + 0.8; _hA.z = P.z; hushAim(c, P, 1);
    const deck = deckOver(P.x, P.z, P.y), b = hushBearing(P, c, deck, dbg, ov && Number.isFinite(ov.az) ? ov : null);
    const el = hushEl(deck, b.d);
    // (noTilt: the shot owns its angles — the anti-occlusion lift would tip
    //  the lens up over the deck's edge, which is the one thing it must not do)
    const o = { target: _hA, azimuth: b.az, elevation: el, distance: b.d, fov: HUSH_FOV, pitch: Math.max(0, b.pitch), noTilt: true,
      duration: HUSH_MAX + 2, in: snap ? 0.01 : 0.9, hold: HUSH_MAX + 0.2, out: 0.9 };
    let cine = null;
    try { cine = cam.cinematic(o); } catch (e) { return false; }
    const Hh = R.hush = { c, t: 0, chk: 0.25, off: 0, cine, o };
    // (superseded by another shot — the moon, a pounce — it is simply over)
    cine?.then?.(() => { if (R.hush === Hh) { R.hush = null; R.hushCool = S.elapsed + HUSH_COOL; } });
    if (S.elapsed - R.lineAt > 5) { R.lineAt = S.elapsed; say(c, LINES_HUSH[(R.hushN = (R.hushN || 0) + 1) % LINES_HUSH.length]); }
    ctx.systems.audio?.play?.('purr');
    return true;
  }
  function endHush(quiet = false) {
    const Hh = R.hush; if (!Hh) return;
    R.hush = null; R.hushCool = S.elapsed + HUSH_COOL;
    if (!quiet) { try { Hh.cine?.cancel?.(); } catch (e) { /* camera gone */ } }
  }
  function hushUpdate(dt) {
    const p = pl(), P = p?.position, Hh = R.hush;
    if (Hh) {
      Hh.t += dt;
      const c = Hh.c;
      if (P) hushAim(c, P, 1 - Math.exp(-3 * dt));
      if ((Hh.chk -= dt) <= 0) {
        Hh.chk = 0.25;
        const near = !!P && c.mode === 'land' && c.vis > 0.5 && (c.x - P.x) ** 2 + (c.z - P.z) ** 2 < HUSH_KEEP_R * HUSH_KEEP_R;
        const under = !!P && Number.isFinite(deckOver(P.x, P.z, P.y));
        Hh.off = near && under && !R.carry && visitorOnCandy() ? 0 : Hh.off + 0.25;
      }
      if (Hh.off >= 0.6 || Hh.t > HUSH_MAX) endHush(false);
      return;
    }
    if (R.carry || !P || (R.hushChk = (R.hushChk || 0) - dt) > 0) return;
    R.hushChk = 0.3;
    if (S.elapsed < (R.hushCool ?? -99) || !visitorOnCandy() || p.locked || p.onFerry || ctx.state.vehicle || ctx.state.flying) return;
    const cam = ctx.systems.camera;
    if (!cam || typeof cam.cinematic !== 'function' || cam.cinematicActive || cam.isFree?.()) return;
    let best = null, bd = HUSH_R * HUSH_R;
    for (const c of party) {
      if (c.mode !== 'land' || c.vis < 0.9 || c.homing || c.escort || c.carryTo) continue;
      const d = (c.x - P.x) ** 2 + (c.z - P.z) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    if (best && Number.isFinite(deckOver(P.x, P.z, P.y))) startHush(best, false);
  }
  /** DEBUG staging (raidDebug({ phase: 'hide' })): pad up and down the planks
   *  over him — a slow stalk out, a crouch at each end with its nose to the
   *  gaps and its eyes on the place he is. */
  function stagePlan(c) {
    const g = c.stage, now = S.elapsed, P = pl()?.position;
    const face = P ? Math.atan2(P.x - c.x, P.z - c.z) : c.faceDir;
    if (g.pauseUntil > now) return { act: 'post', x: c.x, z: c.z, pose: 'crouch', face, hold: 1 };
    const tx = g.leg ? g.bx : g.ax, tz = g.leg ? g.bz : g.az;
    if ((c.x - tx) ** 2 + (c.z - tz) ** 2 < 0.3) { g.leg = 1 - g.leg; g.pauseUntil = now + (g.leg ? 2.2 : 1.2); return { act: 'post', x: c.x, z: c.z, pose: 'crouch', face, hold: 1 }; }
    return { act: 'post', x: tx, z: tz, pose: 'stalk', speed: 1.1 };
  }
  /** Hold (or let go of) the duck key, for a staged hide. A real key-up still wins. */
  function holdDuck(secs) {
    const keys = ctx.input?.keys; if (!keys || typeof keys.add !== 'function') return;
    if (secs > 0) { keys.add('KeyC'); R.duckUntil = S.elapsed + secs; }
    else if (R.duckUntil > 0) { keys.delete('KeyC'); R.duckUntil = 0; }
  }
  ctx.events.on('player:teleport', () => { if (R.duckUntil > 0 && !R.staging) holdDuck(0); });

  // ── per raider, per frame ──────────────────────────────────────────────────
  function updatePath(c, dt, el) {
    const C = R.carry;
    if (c.delay > 0) { c.delay -= dt; if (c.delay > 0) { c.vis = 0; return false; } }
    let sp;
    if (C && C.cat === c) sp = C.speed || 6;
    else if (C && c.escort) {
      // the escort walks behind the carrier, closing up if it falls back
      const want = C.cat.s - 5.6 * c.escort;
      sp = (C.speed || 6) * (c.s < want - 1 ? 1.3 : c.s > want ? 0.6 : 1);
    } else if (c.sDir > 0) {
      sp = homeSpeed() * c.speedK;
      // (late onto the rainbow with the sun coming up: it hurries, so the
      //  file is off the arc by DECK_DUE_H, not fading on it in full day;
      //  a stopped clock brings no sun, and no hurry)
      const h = ctx.state.time;
      if (R.retreat && h >= RETREAT_H && h < 12 && !ctx.state.timeFrozen) {
        const left = (DECK_DUE_H - h) * secPerH();
        sp = Math.max(sp, Math.min(HURRY_MAX, (route.L - c.s) / Math.max(left, 1.5)));
      }
    } else sp = crossSpeed() * c.speedK;
    // a visitor on the deck who cannot be caught (a star, i-frames, the grace):
    // the party does not walk through him — it stops, flattens, and waits
    let balk = false;
    const Pb = pl()?.position;
    if (Pb && !C && c.vis > 0.5) {
      const d2 = (Pb.x - c.x) ** 2 + (Pb.y - c.y) ** 2 + (Pb.z - c.z) ** 2;
      if (d2 < 16 && !catchable()) {
        routeAt(c, clamp(c.s + c.sDir * 2, 0, route.L), c.lane, _ps2);
        if ((_ps2.x - c.x) * (Pb.x - c.x) + (_ps2.z - c.z) * (Pb.z - c.z) > 0) { sp = 0; balk = true; }
      }
    }
    c.s += c.sDir * sp * dt;
    if (c.laneWant !== undefined) c.lane += (c.laneWant - c.lane) * (1 - Math.exp(-2.5 * dt));
    // a visitor walking the rainbow toward the party: they meet him (and he goes home)
    const P = pl()?.position;
    if (P && !R.carry && !R.retreat && catchable() && c.vis > 0.9) {
      const d2 = (P.x - c.x) ** 2 + (P.z - c.z) ** 2;
      if (d2 < CATCH_R2 && Math.abs(P.y - c.y) < 2.0) { startCarry(c, true); return true; }
    }
    if (c.sDir < 0 && c.s <= 0) {
      // down off the bridge, onto Candyland
      c.s = 0; routeAt(c, 0, c.lane, _ps);
      c.mode = 'land'; resetBody(c); c.x = _ps.x; c.z = _ps.z; c.y = _ps.y; c.slope = 0;
      if (R.landedAt < 0) {
        R.landedAt = S.elapsed; ctx.events.emit('raid:land', {});
        if (visitorOnCandy() && P && Math.hypot(P.x - c.x, P.z - c.z) < 70) { c.roarUntil = S.elapsed + 1.3; ctx.systems.audio?.play?.('roar'); }
      }
      return false;
    }
    if (c.sDir > 0 && c.s >= route.L) {
      c.s = route.L;
      if (C && (C.cat === c || c.escort)) { c.moving = false; }
      else { c.mode = 'fade'; c.fadeT = 1; }
    }
    routeAt(c, c.s, c.lane, _ps);
    c.x = _ps.x; c.z = _ps.z; c.y = _ps.y;
    const back = c.sDir < 0;
    const yaw = _ps.yaw + (back ? Math.PI : 0);
    c.faceDir = yaw; c.yaw = dampAngle(c.yaw, yaw, 8, dt);
    const want = back ? -_ps.slope : _ps.slope;
    c.slope += (clamp(-want * 0.85, -0.85, 0.85) - c.slope) * (1 - Math.exp(-6 * dt));
    c.moving = !balk && !(C && (C.cat === c || c.escort) && c.s >= route.L);
    c.pose = C && C.cat === c ? (c.moving ? (sp > 5 ? 'carrygallop' : 'carryrun') : 'carry')
      : balk ? 'crouch' : c.moving ? (c.sDir > 0 ? (!C && sp > 8.9 ? 'bound' : 'trot') : sp > 6.5 ? 'bound' : 'lope') : 'watch';
    c.gaitK = c.moving ? gaitFor(c.pose, sp) : 1;
    c.lookAt = balk && Pb ? Pb : null;
    return false;
  }

  function updateLand(c, dt) {
    const now = S.elapsed, P = pl()?.position;
    if (c.delay > 0) { c.delay -= dt; if (c.delay > 0) { c.vis = 0; return; } puff(c, 18); }
    // an escort that has reached the foot of the bridge goes up after the carrier
    if (c.escort && R.carry && R.carry.stage === 'bridge' && route.ok && Math.hypot(c.x - landX(), c.z - landZ()) < 3.2) {
      c.mode = 'path'; c.s = 0; c.seg = 0; c.sDir = 1; c.lane = c.laneWant = c.escort === 1 ? -1.2 : 1.2; c.delay = 0; return;
    }
    // homing: at the foot of the bridge, over it (or, with no bridge, away down the pier)
    if (c.homing && Math.hypot(c.x - landX(), c.z - landZ()) < 2.6) {
      if (route.ok) { c.mode = 'path'; c.s = 0; c.seg = 0; c.sDir = 1; c.lane = c.laneWant = LANES[c.idx]; c.slope = 0; return; }
      c.mode = 'fade'; c.fadeT = 1; return;
    }
    if (c.homing) {
      // (never "gives up" on a waypoint it keeps being pushed back from — that
      //  parked one in a trot pose against a wall for the rest of the morning:
      //  the watchdog bounds it out instead, and if it still gets no nearer
      //  the bridge, by the field or as the crow flies, it slinks off)
      c.giveX = NaN;
      const dl = Math.hypot(c.x - landX(), c.z - landZ());
      if (dl < c.hBest - 1) { c.hBest = dl; c.hT = 0; }
      else if (c.yawnUntil <= now) c.hT += dt;
      if (c.hT > HOME_STALL) { puff(c, 14); c.mode = 'fade'; c.fadeT = 0.8; return; }
    }
    c.think -= dt;
    if (c.think <= 0 || !c.plan) { c.think = 0.12; c.plan = planLand(c); }
    const plan = c.plan;
    let pose = plan.pose || 'prowl';
    c.moving = false;
    const bump = c.bumped && now >= (c.bumpCool || 0);
    if (bump) c.bumpCool = now + 1.1;
    // (a lunge never gives up on him: pushed back, the press finds another way in)
    if (plan.spring || plan.catch) c.giveX = NaN;
    if (plan.hold || (c.giveX === plan.x && c.giveZ === plan.z)) { if (plan.face !== undefined) c.faceDir = plan.face; }
    else {
      const done = step(c, plan.x, plan.z, plan.speed ?? 1.8, dt, ctx, RS);
      if (done && plan.face !== undefined) c.faceDir = plan.face;
    }
    c.spinning = c.fxKind === 'spin' && c.fxUntil > now;
    H.settle(c, dt, plan);
    c.pose = pose;
    c.gaitK = c.moving ? gaitFor(pose, plan.speed ?? 1.8) : 1;
    // (never the one holding him: he hangs from that head, and a head turned to
    //  look at what hangs from it chases its own tail)
    c.lookAt = P && !c.carryTo && (c.x - P.x) ** 2 + (c.z - P.z) ** 2 < 225 ? P : null;
    if (c.yawLock !== undefined) { c.yaw = wrapPi(c.yawLock); c.yawLock = undefined; if (c.spinning) c.faceDir = c.yaw; }
    else if (c.spinning) { c.yaw = wrapPi(c.yaw + dt * 12); c.faceDir = c.yaw; }
    else c.yaw = dampAngle(c.yaw, c.faceDir, c.moving ? 7 : 5, dt);
    c.slope += (0 - c.slope) * (1 - Math.exp(-6 * dt));
    // it has you
    if (plan.catch && !R.carry && P) {
      const d2 = (c.x - P.x) ** 2 + (c.z - P.z) ** 2;
      if (d2 < CATCH_R2 && Math.abs(P.y - c.y) < 2.0 && catchable()) startCarry(c);
    }
  }

  function poseRaider(c, dt, el) {
    if (c.vis < 1) c.vis = Math.min(1, c.vis + dt / 0.8);
    applyTiger(c, 1, el, dt, ctx);
    // (applyTiger grows the tiger in at k = 1; the fade-in scales the root)
    if (c.vis < 1) { c.TG.root.scale.multiplyScalar(smoothstep(0, 1, c.vis)); c.TG.root.updateMatrixWorld(true); }
    // the contact blob: under it on the ground, never on the deck (the deck glows)
    const T = tigerScale(c), n = c.blobN;
    if ((c.mode === 'land' || c.mode === 'rail') && c.vis > 0) {
      const g = Number.isFinite(c.gy) ? c.gy : c.y;
      n.position.set(c.x + Math.sin(c.yaw) * 0.18 * T, g + 0.035, c.z + Math.cos(c.yaw) * 0.18 * T);
      n.rotation.set(0, c.yaw, 0);
      n.scale.set(1.58 * T * c.vis, 1, 3.45 * T * c.vis);
    } else n.scale.setScalar(0);
    n.updateMatrix(); n.matrixWorld.copy(n.matrix);
  }

  // eye glow: written once a frame into the Points buffers
  const _cam = { x: 0, z: 0 };
  function writeGlow(night) {
    const pos = rig.pos, col = rig.col, size = rig.size, cam = ctx.camera;
    _cam.x = cam.position.x; _cam.z = cam.position.z;
    let any = false;
    for (let i = 0; i < party.length; i++) {
      const c = party[i];
      for (let e = 0; e < 2; e++) {
        const k = i * 2 + e, o = c.TG.glow[e];
        if (c.mode === 'off' || c.vis <= 0.01 || night <= 0.01) { size[k] = 0; pos[k * 3 + 1] = -1e4; continue; }
        // a little toward the lens: a point sprite has ONE depth, and at the
        // eye's own surface the brow and the muzzle swallowed its core
        let ex = cam.position.x - o.position.x, ey = cam.position.y - o.position.y, ez = cam.position.z - o.position.z;
        const el2 = Math.hypot(ex, ey, ez) || 1, off = 0.3 * tigerScale(c) / el2;
        pos[k * 3] = o.position.x + ex * off; pos[k * 3 + 1] = o.position.y + ey * off; pos[k * 3 + 2] = o.position.z + ez * off;
        // eyes turned away from the lens go dark (the head hides them anyway)
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        let tx = _cam.x - c.x, tz = _cam.z - c.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const face = 0.25 + 0.75 * smoothstep(-0.55, 0.25, fx * tx + fz * tz);
        const hex = c.glowHex, b = face * c.vis;
        col[k * 3] = ((hex >> 16) & 255) / 255 * b; col[k * 3 + 1] = ((hex >> 8) & 255) / 255 * b; col[k * 3 + 2] = (hex & 255) / 255 * b;
        size[k] = Math.max(0.001, o.scale.x * 1.7);
        if (b > 0.02) any = true;
      }
    }
    rig.geo.attributes.position.needsUpdate = true;
    rig.geo.attributes.aCol.needsUpdate = true;
    rig.geo.attributes.aSize.needsUpdate = true;
    const r = ctx.renderer;
    const bh = r ? r.getDrawingBufferSize(_buf).y : 1000;
    rig.uniforms.uScale.value = bh / (2 * Math.tan((cam.fov || 30) * Math.PI / 360));
    rig.uniforms.uMinPx.value = 6.5 * (r ? r.getPixelRatio() : 1);
    rig.uniforms.uGlow.value = night;
    rig.points.visible = any;
  }
  const _buf = new THREE.Vector2();
  const _rimA = new THREE.Color(), _rimB = new THREE.Color(), _rimM = new THREE.Color();

  // ── the clock ─────────────────────────────────────────────────────────────
  const inWindow = (h) => h >= 20 || h < RETREAT_H;
  function snapToHour(h) {
    const flag = !!story()?.get?.('rainbow_bridge') || R.forced;
    if (!flag || !inWindow(h)) { if (R.phase !== 'home' && !R.carry) end(); return; }
    if (R.carry) return;
    syncRoute();
    const since = (h - 20 + 24) % 24;
    R.nights = Math.max(R.nights, 0);
    const snapH = crossHours(partySize());
    if (route.ok && since < snapH) { start({ how: 'crossAt', t: 0.15 + 0.85 * since / snapH, quiet: true, grace: 12 }); return; }
    const P = pl()?.position;
    if (P && visitorOnCandy()) {
      // they have found him: fifteen metres off, on the far side from the lens
      const az = ctx.systems.camera?.params?.azimuth ?? 0.78;
      start({ how: 'hunt', x: P.x, z: P.z, ang: az + Math.PI, r: 14, fx: P.x, fz: P.z, quiet: true, grace: 12 });
    } else {
      const g = world.LANDMARKS.candy_village || { x: -140, z: 40 };
      start({ how: 'hunt', x: g.x + 8, z: g.z - 6, ang: 0, r: 5, quiet: true, grace: 12 });
    }
  }

  // ── update (called by citizens.js every frame, before its island gate) ─────
  // the bridge is up: pay for Candyland's walkability grid now (~60 ms, inside
  // the bridge's 25-s raise) rather than at the first sundown
  ctx.events.on('story:rainbow_bridge', (v) => { if (v) R.navSoon = 2; });
  function update(dt) {
    // (Contract N: the carry survives a paused game — while he is in these
    //  jaws a pause stops the raid where it stands, the carrier and him too)
    if (R.carry && ctx.state.paused) dt = 0;
    R.frame++;
    if (R.navSoon > 0 && --R.navSoon === 0) { try { syncRoute(); candyNav(); } catch (e) { /* retried at the raid */ } }
    if (navDirty && (R.frame & 31) === 0 && navQuiet()) { try { candyNav(); } catch (e) { /* retried */ } }
    const h = ctx.state.time, st = story();
    const flag = !!st?.get?.('rainbow_bridge') || R.forced;
    // a jumped clock (debug, the harness, a bedtime) re-stages the raid
    if (R.lastH === null) R.lastH = h;
    const jump = Math.abs(wrapPi((h - R.lastH) / 24 * TAU)) / TAU * 24 > 0.25;
    R.lastH = h;
    if (jump) { R.doneTonight = false; snapToHour(h); }
    if (!isTigerTime(h) && !R.carry && R.phase === 'home') R.doneTonight = false;
    if (R.phase === 'home' && flag && inWindow(h) && !R.doneTonight && !R.carry) { start({}); R.nights++; }
    if (R.phase !== 'home' && !R.retreat && !inWindow(h) && !R.carry) beginRetreat();
    // after midnight, one hunting far inland sets off early — by as long as
    // the walk back to the foot of the bridge takes — so the whole party is
    // on the rainbow as the sky goes pink, not trotting through the village
    // at nine in the morning
    if (R.phase !== 'home' && !R.retreat && !R.carry && h < RETREAT_H && (R.leadT -= dt) <= 0) {
      R.leadT = 0.5;
      const sph = secPerH();
      for (const c of party) {
        if (c.mode !== 'land' || c.homing || c.escort || c.carryTo || c.delay > 0) continue;
        const lead = Math.min(HOME_LEAD_MAX, Math.hypot(c.x - landX(), c.z - landZ()) * 1.3 / HOME_LOPE / sph);
        if (h >= RETREAT_H - lead) sendHome(c);
      }
    }
    // stragglers: one still on Candyland once it is properly light (or, with
    // the clock stopped, STRAGGLE_SECS into the retreat) slinks off somewhere
    // else — a puff, and it is gone; one still on the rainbow at DECK_LATE_H
    // fades where it stands
    if (R.retreat && !R.carry && R.phase !== 'home') {
      R.retreatT += dt;
      const light = ctx.state.daylight > DAWN_PUFF && h >= RETREAT_H && h < 20;
      if (light || R.retreatT > STRAGGLE_SECS) {
        for (const c of party) {
          if (c.mode !== 'land') continue;
          if (c.delay > 0) hide(c); else { puff(c, 14); c.mode = 'fade'; c.fadeT = 0.8; }
        }
      }
      if (h >= DECK_LATE_H && h < 20) for (const c of party) if (c.mode === 'path') { c.mode = 'fade'; c.fadeT = 1.2; }
    }
    if (R.wake > 0 && (R.wake -= dt) <= 0) { const p = pl(); if (p) p.locked = false; }
    if (R.duckUntil > 0 && S.elapsed > R.duckUntil) holdDuck(0);
    if (R.phase === 'home') return;

    const el = ctx.state.elapsed;
    syncRoute();
    updatePack(dt);
    // rank the land raiders by distance so only the nearest three hunt (one
    // pressing in keeps the lead while its way round takes it further off)
    const P = pl()?.position;
    if (P) {
      const land = _rank; land.length = 0;
      for (const c of party) {
        c.huntRank = 99;
        if (c.mode !== 'land' || c.homing || c.escort) continue;
        c.rankK = (c.x - P.x) ** 2 + (c.z - P.z) ** 2 - (c.pressUntil > S.elapsed ? 1e6 : 0);
        land.push(c);
      }
      land.sort(byRank);
      for (let i = 0; i < land.length; i++) land[i].huntRank = i;
    }
    // the star, the queued reactions (as on Cat Island)
    const star = !!ctx.systems.powerups?.active;
    for (const c of party) {
      if (c.mode !== 'land') continue;
      if (star && P) H.starReact(c, (c.x - P.x) ** 2 + (c.z - P.z) ** 2, P);
      if (c.fxKind && S.elapsed >= c.fxUntil) {
        const n = c.fxThen;
        if (n) { c.fxThen = n.then || null; c.fxKind = n.kind; c.fxUntil = S.elapsed + n.dur; c.think = 0; }
        else { c.fxKind = null; c.think = 0; }
      }
    }
    separate();
    let live = 0;
    for (const c of party) {
      if (c.mode === 'off') continue;
      if (c.mode === 'fade') {
        c.fadeT -= dt; c.vis = Math.max(0, c.fadeT); c.moving = true;
        if (c.fadeT <= 0) { hide(c); continue; }
        applyTiger(c, 1, el, dt, ctx);
        c.TG.root.scale.multiplyScalar(smoothstep(0, 1, c.vis)); c.TG.root.updateMatrixWorld(true);
        c.blobN.scale.setScalar(0); c.blobN.updateMatrix(); c.blobN.matrixWorld.copy(c.blobN.matrix);
        live++; continue;
      }
      if (c.mode === 'path') { if (updatePath(c, dt, el)) { /* caught on the deck */ } }
      else if (c.mode === 'land') updateLand(c, dt);
      if (c.mode === 'off') continue;
      if (c.delay > 0) { live++; continue; }
      poseRaider(c, dt, el);
      live++;
    }
    updateCarry(dt);
    hushUpdate(dt);
    if (!live && !R.carry && R.phase !== 'home') { end(); R.doneTonight = true; return; }
    rig.sync();
    // after dark the eyes; the fur keeps its warm rim even with the town's group off
    const night = smoothstep(0.2, 0.75, 1 - ctx.state.daylight);
    writeGlow(night);
    const M = H.lib.materials, rf = rig.fur, dark = 1 - ctx.state.daylight;
    let deck = 0; for (const c of party) if (c.mode === 'path' && c.vis > 0) { deck = 1; break; }
    R.deckK += (deck - R.deckK) * (1 - Math.exp(-2 * dt));
    rf.emissiveIntensity = 0.08 + dark * (0.22 + R.deckK * 0.18);
    if (rf.userData.rim) {
      // after dark on the Candy Kingdom a COLD rim — moonlight: every lamp and
      // lolly there is warm, so a warm edge sank a striped back into the props
      // behind it; a cold one cuts it out — and up on the rainbow, its pink
      rf.userData.rim.value = 0.06 + dark * (0.85 + R.deckK * 0.3);
      _rimA.setHex(0xffb06a).lerp(_rimM.setHex(0xa4c8ff), smoothstep(0.25, 0.75, dark));
      _rimB.setHex(0xff8fd0); rf.userData.rimColor?.value?.lerpColors?.(_rimA, _rimB, R.deckK);
    }
    if (M.blobMat) M.blobMat.opacity = 0.25 + ctx.state.daylight * 0.11;
    // the threat on the world map: the party's centre, twice a second
    R.markT -= dt;
    if (R.markT <= 0) {
      R.markT = 0.5;
      let sx = 0, sz = 0, n = 0;
      for (const c of party) if (c.mode !== 'off' && c.delay <= 0) { sx += c.x; sz += c.z; n++; }
      if (n) { try { ui()?.addMapMarker?.({ id: 'tiger_raid', x: sx / n, z: sz / n, glyph: 'threat', label: R.carry ? 'Tigers (with you)' : 'Tigers' }); } catch (e) { /* no map */ } }
    }
  }
  const _rank = [];
  const byRank = (a, b) => a.rankK - b.rankK;

  /** camera:update — the last word on where the carried visitor hangs. */
  function late() {
    const C = R.carry; if (!C) return;
    placeCarried(C.stage === 'grab' ? C.k : 1);
    // (in the jaws he is meant to be behind its head: no amber ghost of him
    //  painted over the muzzle — the player re-arms it every frame)
    if (C.stage !== 'grab' || C.k > 0.5) pl()?.setSilhouette?.(false);
  }

  /** DEBUG: the hush, staged — him crouched in the dark under a footbridge,
   *  a raider on the planks over him, the shot already framed.
   *  { x, z }: where he hides (default: knee-deep in the syrup under the
   *  footbridge that takes the village road over the river, east of Gumdrop
   *  Village) · off: [dx, dz] where the
   *  raider crouches first, from him · run: [dx, dz, length] its pace along
   *  the planks · hold: s it crouches first · duck: false to stand · n ·
   *  grace · dbg: return the lens bearings' scores */
  function stageHide(o) {
    const p = pl(), P = p?.position;
    const x = o.x ?? -117.6, z = o.z ?? 39.2;
    R.staging = true;
    if (p && P) {
      p.locked = false; p.onFerry = false; p.invulnerable = false;
      P.y = world.height(x, z);            // (teleport reads the decks by his height: the ground, not the planks)
      p.teleport?.(x, z);
    }
    // (off: where it crouches first, from him; run: [dx, dz, length] of its pace along the planks)
    const off = o.off ?? [-2.3, 0.1], run = o.run ?? [-1, 0, 2.2];
    let ux = run[0], uz = run[1]; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const ax = x + off[0], az = z + off[1], bx = ax + ux * (run[2] ?? 3.7), bz = az + uz * (run[2] ?? 3.7);
    start({ how: 'hunt', x: ax, z: az, ang: 0, r: 0, n: clamp(o.n ?? 1, 1, MAX_N), quiet: true, grace: o.grace ?? 9999, fx: x, fz: z });
    const yF = P ? P.y : world.height(x, z);
    const c = party[0];
    const dy = deckAt(ax, az, yF + 2.4);
    c.x = ax; c.z = az; c.y = Number.isFinite(dy) ? dy : groundH(ax, az);
    c.yaw = c.faceDir = Math.atan2(x - ax, z - az);
    c.stage = { ax, az, bx, bz, leg: 1, pauseUntil: S.elapsed + (o.hold ?? 2.6) };
    if (o.duck !== false) holdDuck(o.duckSecs ?? 6);
    R.staging = false;
    R.hushCool = -99;
    const dbg = o.dbg ? [] : null;
    startHush(c, true, dbg, o);
    // (he looks back toward the lens over his shoulder, 3/4 — the face in the dark is the frame)
    if (R.hush && p && o.face !== false) p.facing = R.hush.o.azimuth + (o.face ?? 0.6);
    if (dbg) return { shot: R.hush ? { az: +R.hush.o.azimuth.toFixed(2), d: R.hush.o.distance, el: +R.hush.o.elevation.toFixed(3), pitch: +R.hush.o.pitch.toFixed(3) } : null, scores: dbg };
    return R.hush ? 'hide' : 'hide (no shot)';
  }

  /** DEBUG (views): a free lens on one raider on the rainbow, framed where it
   *  WILL be after the view's own `frames` steps of 1/30 s, so a still frame
   *  can sit tight and low on a loping tiger (the lead a quarter of the frame
   *  tall) instead of a wide shot of pinpricks.
   *  f: { frames, who: 'lead' | 'last' | index, dist, el, az (off its heading:
   *  0 = straight at its face), fov, rise (aim, × its size, over its feet) } */
  function frameOnDeck(f) {
    const cam = ctx.systems.camera;
    if (!cam || typeof cam.setFree !== 'function' || !route.ok) return;
    let lead = null, last = null;
    for (const c of party) {
      if (c.mode !== 'path') continue;
      if (!lead || (c.s - lead.s) * c.sDir > 0) lead = c;
      if (!last || (c.s - last.s) * c.sDir < 0) last = c;
    }
    const c = typeof f.who === 'number' ? party[f.who] : f.who === 'last' ? last : lead;
    if (!c || c.mode !== 'path') return;
    const sp = (c.sDir > 0 ? homeSpeed() : crossSpeed()) * c.speedK;
    const s1 = clamp(c.s + c.sDir * sp * (f.frames ?? 40) / 30, 0, route.L);
    routeAt(c, s1, c.lane, _ps);
    const T = tigerScale(c), facing = c.sDir < 0 ? _ps.yaw + Math.PI : _ps.yaw;
    cam.setFree({ target: [_ps.x, _ps.y + (f.rise ?? 1.0) * T, _ps.z], azimuth: facing + (f.az ?? 0.55),
      elevation: f.el ?? 0.12, distance: f.dist ?? 13, fov: f.fov ?? 34 });
  }

  // ── debug / verifier hooks ────────────────────────────────────────────────
  /**
   * Pose the raid for a render or a probe:
   *   { phase: 'cross', t }      the party strung along the deck, leader t of the way over
   *   { phase: 'hunt', x, z, r } on Candyland round (x,z) (default: the visitor), r u off
   *   { phase: 'carry', t }      the visitor in the leader's jaws, t of the way over
   *   { phase: 'retreat' }       dawn: homing on the bridge
   *   { phase: 'home' }          all gone
   *   { phase: 'hide' }          the hush, staged (stageHide)
   *   cross / retreat take frame: {…} — a tight free lens on the lead (frameOnDeck)
   *   any phase takes park: [x, z] — the visitor moved there first
   *   n: party size · raise: false to leave the bridge down
   */
  function debug(o = {}) {
    R.forced = true;
    R.mock = !!o.mock;
    endHush(false); holdDuck(0);
    // park: [x, z] — stand him somewhere first (a view of the bridge whose
    // free lens leaves him wherever the last view did: in the village at 23:00
    // the kids had him before the frame was taken)
    if (Array.isArray(o.park)) {
      const p = pl();
      if (p) { p.locked = false; p.onFerry = false; if (p.position) p.position.y = world.height(o.park[0], o.park[1]); p.teleport?.(o.park[0], o.park[1]); }
    }
    const b = bridgeApi();
    if (o.raise !== false && !o.mock && b && !b.up && typeof b.debugRaise === 'function') { try { b.debugRaise(true); } catch (e) { /* bridge builder's */ } }
    route.ref = undefined; syncRoute();
    if (R.carry) endCarry();
    H.bedtime?.reset?.();                            // (a town carry or a tuck-in still running)
    R.lastH = ctx.state.time;
    const P = pl()?.position;
    const n = o.n ?? 4;
    if (o.phase === 'home') { end(); return 'home'; }
    if (o.phase === 'cross') { start({ how: route.ok ? 'crossAt' : 'hunt', t: o.t ?? 0.5, n, quiet: true, grace: 30, x: landX(), z: landZ(), r: 4 }); if (o.frame) frameOnDeck(o.frame); return R.via; }
    if (o.phase === 'hunt') {
      const x = o.x ?? P?.x ?? -140, z = o.z ?? P?.z ?? 40;
      const az = ctx.systems.camera?.params?.azimuth ?? 0.78;
      start({ how: 'hunt', x, z, ang: o.ang ?? az + Math.PI, r: o.r ?? 14, fx: x, fz: z, n, quiet: true, grace: o.grace ?? 12 });
      return 'hunt';
    }
    if (o.phase === 'hide') return stageHide(o);
    if (o.phase === 'retreat') { start({ how: route.ok ? 'crossAt' : 'hunt', t: o.t ?? 0.5, n, quiet: true, x: landX(), z: landZ(), r: 4 }); for (const c of party) if (c.mode === 'path') { c.sDir = 1; } R.retreat = true; if (o.frame) frameOnDeck(o.frame); return 'retreat'; }
    if (o.phase === 'carry') {
      start({ how: route.ok ? 'crossAt' : 'hunt', t: 0.02, n, quiet: true, x: landX(), z: landZ(), r: 3 });
      const c = party[0];
      RT.graceUntil = -1;
      if (route.ok) {
        c.mode = 'path'; c.sDir = 1; c.s = route.Lb + clamp(o.t ?? 0.45, 0, 1) * (route.L - route.Lb); c.seg = 0; c.delay = 0; c.vis = 1;
        routeAt(c, c.s, 0, _ps); c.x = _ps.x; c.z = _ps.z; c.y = _ps.y; c.yaw = c.faceDir = _ps.yaw; c.slope = -_ps.slope * 0.85;
        for (let i = 1; i < R.n; i++) { const e = party[i]; e.mode = 'path'; e.sDir = 1; e.s = Math.max(0, c.s - 5.6 * i); e.delay = 0; e.vis = 1; e.lane = e.laneWant = i % 2 ? -1.2 : 1.2; }
        const p = pl(); if (p) { p.locked = false; p.onFerry = false; p.invulnerable = false; }
        startCarry(c, true);
        for (let i = 1; i < Math.min(3, R.n); i++) party[i].escort = i;
        if (R.carry) { R.carry.lines = (o.t ?? 0.45) > 0.72 ? 2 : (o.t ?? 0.45) > 0.3 ? 1 : 0; if (R.carry.o) R.carry.o.in = 0.01; }
      } else {
        const p = pl(); if (p) { p.locked = false; p.onFerry = false; }
        c.mode = 'land'; c.delay = 0; c.vis = 1; startCarry(c);
      }
      late();
      return R.carry ? R.carry.stage : 'none';
    }
    return null;
  }

  return {
    update, late, debug, start, end,
    get phase() { return R.phase === 'home' ? 'home' : R.carry ? 'carry' : R.retreat ? 'retreat' : party.some((c) => c.mode === 'path') ? (party.some((c) => c.mode === 'land') ? 'landing' : 'crossing') : 'hunt'; },
    get active() { return R.phase !== 'home'; },
    get carrying() { return R.carry ? R.carry.cat : null; },
    get carryStage() { return R.carry ? R.carry.stage : null; },
    /** The hush shot is up (he is under the planks with a raider near). */
    get hushing() { return !!R.hush; },
    get via() { return R.via; },
    get route() { return { ok: route.ok, L: +route.L.toFixed(1), landing: { x: +landX().toFixed(1), z: +landZ().toFixed(1) }, via: route.ok ? 'bridge' : route.via }; },
    get pack() { return { x: pack.x, z: pack.z }; },
    get nav() { return nav; },
    /** Verifier: does collider c stop a raider on Candyland's grid? */
    navBlocks: (c) => raidBlocker(c),
    party,
    /** Where every active raider is (verifier: y = feet; mode 'land' | 'path' | 'fade'). */
    positions() {
      return party.filter((c) => c.mode !== 'off').map((c) => ({ key: c.key, name: c.tiger.full, x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), mode: c.mode, pose: c.pose, s: +c.s.toFixed(1), rank: c.huntRank, vis: +c.vis.toFixed(2) }));
    },
    stats() { return { ...rig.stats(), phase: this.phase, n: R.n, nights: R.nights, via: R.via }; },
    /** The raiders a weapon can hit (catCitizens.hit resolves {x,z} against these too). */
    nearest(x, z) {
      let b = null, bd = Infinity;
      for (const c of party) { if (c.mode !== 'land') continue; const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; b = c; } }
      return b ? { cat: b, d: Math.sqrt(bd) } : null;
    },
    materials: rig.materials,
    rig,
  };
}
