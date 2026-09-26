// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KIDS — THE RAID (WAVE 4, Contract M: "kids into Cat Island").
//
// Once the rainbow bridge is up (story `rainbow_bridge`), every night a PACK of
// up to PACK kids leaves Candyland, crosses the rainbow and hunts on Cat Island
// by the same rules as at home. Light horror, never gore:
//
//  · DUSK — the pack is picked when the dusk freeze starts. Like everyone else
//    they freeze, run to the Sour Shrine and stand in its rings for the rite
//    (Contract O, sourpatch/ritual.js)… and once the reveal is over (≈ 21:42)
//    the pack MUSTERS out of the shrine: off into the dark along the forest
//    path, and — once nobody can see it — up out of the dark at the foot of
//    the rainbow, just outside Sugar Pier's salt line, one after another; it
//    skips up the arc in a loose column, hands behind their backs, heads
//    turning in unison to follow you — quick: the lead is due at the Arrivals
//    Pier by ≈ 23:20 (THE CLOCK, below; ≈ 9.5 u/s from the natural ≈ 21:42
//    start). The first one on the deck fires the
//    cue: a giggle (ctx.systems.audio.play('sourpatch_giggle') if there is an
//    audio system) and the toast "…They're on the bridge."
//  · THE BRIDGE IS A TRUCE. On the deck nobody is eaten: a visitor standing in
//    their way is walked round ("not yet"). Hit one there and it goes over the
//    rail — the sea melts it (a pool of its own colour, the usual re-form).
//  · CAT ISLAND — they come down the arc at the Arrivals Pier and step off
//    onto the island (the LANDFALL), fan out round the cats' salt line and hunt
//    with the ordinary night brain: ten at a time across both islands (the
//    pack's slots come out of Candyland's HUNT_CAP), water melts them, the
//    visitor's salt stops them, three touching him is dinner (he wakes in the
//    refuge, not at Sugar Pier; the ones that got him are full and huff home
//    over the rainbow — so does one hit once too often: goHome). THE CATS' SALT LINE (sourpatch/catsalt.js)
//    rings Welcome Plaza just landward of the pier: inside it is a refuge from
//    gummies (not from tigers); outside it, all of Cat Island is theirs.
//    (sourpatch.js moveTo walks a raider ROUND the ring — wayTo() — and, stuck
//    on anything else for 1.4 s, asks a Cat Island nav.wayRound A* for a way
//    out; far from the visitor they scurry instead of twitching.)
//    With the visitor off Cat Island they PROWL it — Main Street, the square,
//    the harbour — and with him up on the bridge they gather at its foot and
//    look up.
//  · THE SMALL HOURS — from 03:06 each raider sets off for the foot of the
//    rainbow by as long as its walk there takes (the far ones first), still a
//    night kid — hunched, grinning, eyes lit, every head turning to follow the
//    visitor, but not hunting — by the roads (catNav.route) and round the cats'
//    ring; at the foot they go up onto the deck one at a time (BOARD_GAP) from
//    about 04:30 and file home over the arc in HOME_H game hours, dark shapes
//    against the lit bands.
//  · DAWN — the sunrise catches that file up on the rainbow: each one
//    shivers, a puff of sugar, and walks on a day kid (a jog home for
//    breakfast); at its Candyland foot each ducks under the rail and comes out
//    of its own front door (the ordinary dawn-door beat) and strolls back to
//    work. The deck is clear by about 07:00. One still on Cat Island at dawn
//    (mid-lunge at its hour) turns back into a day kid where it stands (the
//    ordinary dawn turn), walks to the landfall — across the cats' salt near
//    the pier (a day kid is not stopped by it: the ring's west edge meets the
//    pier-side props there) — and hurries over, due off the deck by 07:00.
//    Anyone still on the deck outbound at sunrise simply turns round.
//  · A CLOCK JUMP INTO THE MORNING (the visitor put to bed at 06:00 by a
//    tiger's scruff-carry, a night in the guest bed, a harness setTime) does
//    not leave the pack to walk the whole way home in broad daylight from
//    wherever the jump caught it: it is where THE CLOCK says it would be —
//    day kids filing home over the arc (boarded round BOARD_H, HOME_H over
//    it), or, later, already home and out of their front doors.
//  · No bridge API (escape.routes.bridge.path missing): the pack comes ashore
//    at the Arrivals Pier at nightfall and leaves the same way at dawn.
//  · A threat dot on the world map (ui.addMapMarker glyph 'threat') follows
//    the pack while it is out; its eyes burn as pinpricks you can see from
//    across the strait (one Points draw call) while it is on the bridge or on
//    Cat Island after dark.
//
// sourpatch.js owns the kids; this module only sets fields on the kids it
// holds (k.raid / k.isl / k.scripted and the r* scratch), and sourpatch.js
// switches its movement context (Candyland / Cat Island / the deck) per kid
// from k.isl. Nothing here allocates per frame.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createCatSalt } from './catsalt.js';
import { rng, hash } from '../../../core/util.js';
import { ritualEndH } from './ritual.js';
import { DAY_LENGTH_SEC } from '../../../core/world.js';

export const PACK = 8;                 // ≤ 10 (Contract M); the rest stay home
// THE CLOCK (kids fixer r2 — integration verifier: "ashore at 22:20, on the deck
// till 11:00"). Both crossings are TIMED in game hours, not paced: a game hour
// is DAY_LENGTH_SEC / 24 = 12.5 s, and the walk up the arc from just outside
// Sugar Pier's salt line (S0) to the Cat Island foot (S1) is ≈ 189 u of 3D arc
// (PLEN ≈ 200 — the bridge's own `length` / `sAt` are HORIZONTAL, 171.4 u, which
// is why the old fixed 5.0 u/s read as 4.25 u/s on the map). At 5–6 u/s that was
// three game hours each way. Now:
//  · OUT: the pack's lead is due at the far foot by ASHORE_H, whenever it set
//    off (crossPace(), one pace for the whole column, fixed at its first step):
//    the natural muster at the end of the dusk rite (Contract O, ≈ 21:42) is a
//    ≈ 9.5 u/s skip, ashore ≈ 23:20; a late start scurries, at up to
//    CROSS_MAX; an early one (the visitor broke the rite) takes CROSS_H_MAX.
//  · HOME: before the sun can catch them on the wrong island, each raider sets
//    off for the foot of the rainbow in the dark — the far ones first, by as
//    long as the walk takes (never before RETREAT_MIN_H) — so the pack files
//    onto the deck round BOARD_H and walks it in HOME_H game hours (homePace());
//    the dawn turns them back into day kids up there, in the sunrise. The deck
//    is clear by ≈ 07:00. One caught on Cat Island by the dawn anyway (a lunge,
//    a clock jump) hurries, to be off the deck by DECK_DUE_H.
// (Contract O: the pack leaves only after the dusk rite's reveal — ritual.js
// RT.END, ≈ 21:42 at 12.5 s a game hour)
const MUSTER_H = ritualEndH((DAY_LENGTH_SEC || 300) / 24);  // the natural start: the rite hands over to the hunt
const ASHORE_H = MUSTER_H + 1.6;       // the lead is due at the Cat Island foot by then…
const MUSTER_RUN = 9;                  // s: the longest the pack runs off from the shrine in view before it is simply gone
// the forest path out of the shrine, the way the pack musters (toward the rainbow)
const MUSTER_WAY = [[-200, -20], [-185, 0], [-170, 30]];
const CROSS_H_MIN = 1.25;              // …but a late start never takes less than this…
const CROSS_H_MAX = 2.0;               // …or an early one more
const CROSS_MIN = 5.5;                 // u/s along the arc
const CROSS_MAX = 11.0;                // (a scurry: the visitor runs at 11; the tigers bound at ≤ 9.6)
const BOARD_H = 4.6;                   // the pack due on the deck at the Cat Island foot, homeward
const RETREAT_LEAD_MAX = 1.5;          // h: the earliest a far-flung raider sets off before BOARD_H
const RETREAT_MIN_H = BOARD_H - RETREAT_LEAD_MAX;
const RET_V = 5.2;                     // u/s: the scurry back to the foot of the rainbow in the dark
const RET_ROUTE = 1.35;                // the roads are this much longer than the crow flies
const HOME_H = 1.95;                   // game hours over the arc home
const HOME_MIN = 5.0;                  // u/s …within HOME_MIN..HURRY_MAX
const DECK_DUE_H = 6.9;                // a late walker hurries to be off the deck by then…
const HURRY_MAX = 10.5;                // u/s …up to this
const HOME_WALK = 4.8;                 // u/s: a day kid's walk to the landfall after the dawn turn
const BOARD_R = 2.4;                   // at the foot of the rainbow this close…
const BOARD_GAP = 0.55;                // s: …one onto the deck at a time (the file home)
const LATE_RAID_END_H = 2.0;           // a bridge raised after this (and before dawn): no raid tonight
const LAND_SPEED = 3.4;                // off the deck and onto the island
const GAP = 1.9;                       // column spacing along the deck
const LANES = [0, -1.25, 1.25, -0.55, 0.65, -1.5, 1.45, 0.1, -0.9, 0.95];
const FOOT_PAD = 1.2;                  // the column starts this far outside Sugar Pier's salt line
const RING_WALK = 2.6;                 // the way round the cats' salt ring keeps this much air
const PROWL_SEC = 24;                  // s at each prowl spot before the pack moves on
// (kids fixer r1: judged on PROGRESS, not on the clock — a walker from the far
// side of the island is ~30 s on the roads and must not be warped for it)
const RETURN_WARP = 8;                 // s without progress: a walker home, off camera, is put at the landfall
const RETURN_STUCK = 15;               // s without progress in view: …with a puff (boxed in by the A*: sooner)
const RETURN_MAX = 120;                // s: never in 'return' all day, whatever
const MARK_DT = 0.5;                   // s between map-marker updates
const NODE_R = 2.2;                    // a dawn walker is at a road node this close…
const SKIP_DT = 0.4;                   // …and looks this often for a straight line further along
const NODE_GIVE = 6;                   // s trying for one road node before it is passed over
const RING_FREE_D = 24;                // a dawn walker this near the landfall (or in the plaza) crosses the cats' salt
const MAXP = 320;                      // resampled deck points
const SEA_MELT = 0.05;                 // a falling kid melts when its feet reach the sea
const MARCH_K = 1.9;                   // rad per u: the night column's shared step (one beat for all of them; 9.5 rad/s at 5 u/s)
const DECK_SHADE = 0.36;               // the night column's gummy, backlit by the rainbow (1 = as made)
const DECK_EYES = 1.5;                 // …and its eye halos, this much bigger
const CUE_CAND = 'Somewhere up on the rainbow, somebody giggles. They\'re on the bridge.';

const _pt = { x: 0, z: 0, y: 0, tx: 1, tz: 0, grade: 0, i: 0 };
const _pl = { x: 0, z: 0, y: 0, tx: 1, tz: 0, grade: 0, i: 0 };
const _ep = new THREE.Vector3();

export function createRaid(ctx, D) {
  const { world } = ctx;
  const { kids, V, rand, hits, water } = D;
  const L = world.LANDMARKS;
  const CAT_DOCK = L.cat_dock || { x: 42, z: 22 };
  const PLAZA = L.welcome_plaza || { x: 78, z: 18, r: 16 };
  const onCat = (x, z) => x > 0 && world.islandAt(x, z) === 'cat';
  const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  // ── the cats' salt ring (the refuge) ───────────────────────────────────────
  // Round Welcome Plaza and the arrivals office, its west edge just landward of
  // the Arrivals Pier. Refined when the bridge is read: its cat end must be
  // well outside (the column has to step off it onto open ground).
  const ring = { x: PLAZA.x - 6, z: PLAZA.z, r: 20 };
  const respawn = { x: PLAZA.x - 12, z: PLAZA.z + 1, text: 'You were a snack. You wake up in Welcome Plaza, inside the cats\' salt line. A bit sticky.' };
  const ringIn = (x, z, pad = 0) => (x - ring.x) * (x - ring.x) + (z - ring.z) * (z - ring.z) < (ring.r + pad) * (ring.r + pad);
  let catSalt = null;

  // ── the deck (escape.routes.bridge), resampled ─────────────────────────────
  const PX = new Float32Array(MAXP), PZ = new Float32Array(MAXP), PY = new Float32Array(MAXP), PS = new Float32Array(MAXP);
  const PTX = new Float32Array(MAXP), PTZ = new Float32Array(MAXP);
  let PN = 0, PLEN = 0, S0 = 0, S1 = 0, pathRef = null, bridgeMode = 'none';
  let heightAt = null;
  const landfall = { x: CAT_DOCK.x + 6, z: CAT_DOCK.z, y: 1, ok: false };
  const bridgeObj = () => ctx.systems.escape?.routes?.bridge || ctx.systems.escape?.api?.routes?.bridge || null;

  function readBridge() {
    const b = bridgeObj();
    const path = b && Array.isArray(b.path) && b.path.length > 1 ? b.path : null;
    if (!path || b.up === false) {                   // (not raised yet: nothing to walk on)
      if (bridgeMode !== 'fallback') { bridgeMode = 'fallback'; PN = 0; pathRef = null; findLandfall(CAT_DOCK.x, CAT_DOCK.z, 1); }
      return false;
    }
    if (path === pathRef && PN > 1) return true;
    pathRef = path; bridgeMode = 'api';
    heightAt = typeof b.heightAt === 'function' ? (x, z) => { try { return b.heightAt(x, z); } catch (e) { return NaN; } } : null;
    // which end is Candyland's?
    const p0 = path[0], pl = path[path.length - 1];
    const xy = (q) => (Array.isArray(q) ? q : [q.x, q.z]);
    let a = xy(p0), z = xy(pl);
    const cEnd = b.ends?.candy;
    const rev = cEnd ? dist2d(a[0], a[1], cEnd.x, cEnd.z) > dist2d(z[0], z[1], cEnd.x, cEnd.z) : a[0] > z[0];
    const n = path.length, apexY = Number.isFinite(b.apex?.y) ? b.apex.y : 60;
    // resample every ~1 u along the polyline (a smooth arc for 3D arc length)
    PN = 0;
    let ax = 0, az = 0, ay = 0;
    const raw = (j) => xy(path[rev ? n - 1 - j : j]);
    const hAt = (x, zz, f) => {
      const h = heightAt ? heightAt(x, zz) : NaN;
      if (Number.isFinite(h)) return h;
      // no heightAt: a parabola between the two feet up to the apex
      const g0 = Math.max(0.6, world.height(raw(0)[0], raw(0)[1])), g1 = Math.max(0.6, world.height(raw(n - 1)[0], raw(n - 1)[1]));
      return g0 + (g1 - g0) * f + (apexY - (g0 + g1) / 2) * 4 * f * (1 - f);
    };
    let total = 0;
    for (let j = 0; j < n - 1; j++) total += dist2d(raw(j)[0], raw(j)[1], raw(j + 1)[0], raw(j + 1)[1]);
    let acc = 0;
    for (let j = 0; j < n - 1 && PN < MAXP - 1; j++) {
      const [x0, z0] = raw(j), [x1, z1] = raw(j + 1);
      const seg = dist2d(x0, z0, x1, z1), m = Math.max(1, Math.ceil(seg / 1.0));
      for (let q = 0; q < m && PN < MAXP - 1; q++) {
        const f = q / m, x = x0 + (x1 - x0) * f, zz = z0 + (z1 - z0) * f;
        PX[PN] = x; PZ[PN] = zz; PY[PN] = hAt(x, zz, total > 0 ? (acc + seg * f) / total : 0); PN++;
      }
      acc += seg;
    }
    const [xe, ze] = raw(n - 1);
    PX[PN] = xe; PZ[PN] = ze; PY[PN] = hAt(xe, ze, 1); PN++;
    // cumulative 3D arc length + horizontal tangents
    PS[0] = 0;
    for (let i = 1; i < PN; i++) {
      ax = PX[i] - PX[i - 1]; az = PZ[i] - PZ[i - 1]; ay = PY[i] - PY[i - 1];
      PS[i] = PS[i - 1] + Math.sqrt(ax * ax + az * az + ay * ay);
    }
    for (let i = 0; i < PN; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(PN - 1, i + 1);
      const dx = PX[i1] - PX[i0], dz = PZ[i1] - PZ[i0], d = Math.hypot(dx, dz) || 1;
      PTX[i] = dx / d; PTZ[i] = dz / d;
    }
    PLEN = PS[PN - 1];
    if (PLEN < 12) { PN = 0; bridgeMode = 'fallback'; pathRef = null; findLandfall(CAT_DOCK.x, CAT_DOCK.z, 1); return false; }
    // the column starts just outside Sugar Pier's salt line…
    S0 = 0;
    for (let s = 0; s < PLEN * 0.5; s += 0.5) {
      pathAt(s, 0, _pt);
      if (dist2d(_pt.x, _pt.z, D.DOCK.x, D.DOCK.z) >= D.SAFE_R + FOOT_PAD) { S0 = s; break; }
    }
    // …the cats' salt ring may not swallow the far foot: shift it inland
    const ex = PX[PN - 1], ez = PZ[PN - 1];
    let moved = false;
    for (let g = 0; g < 12 && ringIn(ex, ez, 5); g++) {
      const ux = ring.x - ex, uz = ring.z - ez, d = Math.hypot(ux, uz) || 1;
      ring.x += ux / d * 1.5; ring.z += uz / d * 1.5;
      if (ring.r > 16) ring.r -= 0.5;
      moved = true;
    }
    if (moved) { findRespawn(); try { catSalt?.rebuild(); } catch (e) { /* visuals only */ } }
    // …and the column steps off where the deck meets open Cat Island ground
    S1 = PLEN;
    for (let s = PLEN; s > PLEN * 0.5; s -= 0.5) {
      pathAt(s, 0, _pt);
      const gy = world.height(_pt.x, _pt.z);
      if (!(onCat(_pt.x, _pt.z) && gy > 0.5 && _pt.y - gy < 1.2)) { S1 = Math.min(PLEN, s + 0.5); break; }
    }
    if (S1 < S0 + 6) S1 = PLEN;
    pathAt(S1, 0, _pt);
    findLandfall(_pt.x, _pt.z, _pt.y);
    return true;
  }

  /** Point on the deck at arc length s, `lane` u off the centreline. */
  function pathAt(s, lane, out) {
    if (PN < 2) { out.x = landfall.x; out.z = landfall.z; out.y = landfall.y; out.tx = 1; out.tz = 0; out.grade = 0; out.i = 0; return out; }
    s = s < 0 ? 0 : (s > PLEN ? PLEN : s);
    let lo = 0, hi = PN - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (PS[m] <= s) lo = m; else hi = m; }
    const i = lo, span = PS[i + 1] - PS[i], f = span > 1e-6 ? (s - PS[i]) / span : 0;
    const x = PX[i] + (PX[i + 1] - PX[i]) * f, z = PZ[i] + (PZ[i + 1] - PZ[i]) * f;
    const yc = PY[i] + (PY[i + 1] - PY[i]) * f;
    const tx = PTX[i] + (PTX[i + 1] - PTX[i]) * f, tz = PTZ[i] + (PTZ[i + 1] - PTZ[i]) * f, tl = Math.hypot(tx, tz) || 1;
    out.tx = tx / tl; out.tz = tz / tl;
    out.x = x - out.tz * lane; out.z = z + out.tx * lane;
    const hy = heightAt && lane !== 0 ? heightAt(out.x, out.z) : NaN;
    out.y = Number.isFinite(hy) && Math.abs(hy - yc) < 1.5 ? hy : yc;
    const hl = Math.hypot(PX[i + 1] - PX[i], PZ[i + 1] - PZ[i]);
    out.grade = hl > 1e-4 ? (PY[i + 1] - PY[i]) / hl : 0;
    out.i = i;
    return out;
  }
  /** Where the column steps off onto Cat Island: the nearest open, dry ground
   *  to the far foot that is well outside the cats' salt ring. */
  function findLandfall(x0, z0, y0) {
    const inward = Math.atan2(ring.z - z0, ring.x - x0);
    for (const rr of [0, 1.5, 3, 4.5, 6, 8, 10, 13, 16, 20]) {
      const steps = rr === 0 ? 1 : 16;
      for (let a = 0; a < steps; a++) {
        const ang = inward + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * (Math.PI * 2 / steps);
        const x = x0 + Math.cos(ang) * rr, z = z0 + Math.sin(ang) * rr;
        if (!onCat(x, z) || world.height(x, z) < 0.6 || water.wet(x, z)) continue;
        if (ringIn(x, z, 2.5) || D.blocked(x, z, 0.75)) continue;
        landfall.x = x; landfall.z = z; landfall.y = D.groundY(x, z); landfall.ok = true;
        return;
      }
    }
    landfall.x = x0; landfall.z = z0; landfall.y = Number.isFinite(y0) ? y0 : D.groundY(x0, z0); landfall.ok = false;
  }
  function findRespawn() {
    for (const rr of [0, 1.5, 3, 4.5, 6, 8]) {
      const steps = rr === 0 ? 1 : 12;
      for (let a = 0; a < steps; a++) {
        const ang = a / steps * Math.PI * 2;
        const x = PLAZA.x - 12 + Math.cos(ang) * rr, z = PLAZA.z + 1 + Math.sin(ang) * rr;
        if (!ringIn(x, z, -4) || world.height(x, z) < 0.6 || D.blocked(x, z, 0.7) || water.wet(x, z)) continue;
        respawn.x = x; respawn.z = z; return;
      }
    }
  }

  // ── the pack ───────────────────────────────────────────────────────────────
  const pack = [];                     // the kids out tonight (≤ PACK), in column order
  let on = false, raidNo = 0, cue = false, landedToast = false, homeToast = false, nightStarted = false;
  let prowlI = 0, prowlT = 0, markT = 0, markOn = false, lateT = -1, pending = null, frameCfg = null;
  let crossV = 0, boardNext = -1, sunToast = false;
  // (the clock: see THE CLOCK at the top)
  const secPerH = () => (world.DAY_LENGTH_SEC || 300) / 24;
  /** Game hours from now until clock hour h (0..24, wrapping). */
  const hoursUntil = (h) => { const d = (h - (ctx.state.time || 0)) % 24; return d < 0 ? d + 24 : d; };
  const clampV = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
  /** Tonight's pace up the arc: the lead at the far foot by ASHORE_H. */
  function crossPace() {
    const hu = hoursUntil(ASHORE_H);
    const hrs = hu > 12 ? CROSS_H_MIN : clampV(hu, CROSS_H_MIN, CROSS_H_MAX);
    return clampV(Math.max(1, S1 - S0) / (hrs * secPerH()), CROSS_MIN, CROSS_MAX);
  }
  /** The natural dusk pace (a clock jump or a render pose places the column by it). */
  const naturalCross = () => clampV(Math.max(1, S1 - S0) / ((ASHORE_H - MUSTER_H) * secPerH()), CROSS_MIN, CROSS_MAX);
  /** The pace home over the arc from s: HOME_H hours for the whole of it — or,
   *  late (the dawn caught it on Cat Island), whatever gets it off by DECK_DUE_H. */
  function homePace(s = S1, pose = false) {
    const base = Math.max(1, S1 - S0) / (HOME_H * secPerH());
    if (pose) return clampV(base, HOME_MIN, HURRY_MAX);
    const hu = hoursUntil(DECK_DUE_H);
    const due = hu > 12 ? HURRY_MAX : Math.max(0, s - S0) / (Math.max(0.3, hu) * secPerH());
    return clampV(Math.max(base, due), HOME_MIN, HURRY_MAX);
  }
  const clockH = () => +(ctx.state.time || 0).toFixed(2);
  const _fv = { target: [0, 0, 0], azimuth: 0.6, elevation: 0.3, distance: 24, fov: 36 };
  const PROWL = [L.main_street, L.town_square, L.fish_harbor, L.meow_donalds, L.main_street, L.cat_park]
    .filter(Boolean).map((q) => ({ x: q.x, z: q.z }));
  if (!PROWL.length) PROWL.push({ x: 118, z: 0 });
  const stat = { nights: 0, crossed: 0, landed: 0, fell: 0, home: 0, warps: 0, eaten: 0, cues: 0, ended: 0, retreats: 0, jumps: 0, huffs: 0,
    // tonight's clock: the pace out, the first one ashore, the first one home
    // onto the deck, the last one off it (game hours; null = not yet)
    crossV: 0, homeV: 0, startH: null, ashoreH: null, boardH: null, offH: null };
  // a debug framing (render views) lasts until the next clock jump: the
  // harness sets the time first for every view, so one view's follow-the-pack
  // camera never leaks into the next (kids fixer r1)
  let jumped = false;                  // a clock jump since the last frame (placeSmallHours)
  ctx.events?.on?.('time:set', () => {
    jumped = true;
    if (!frameCfg) return;
    frameCfg = null;
    try { ctx.systems.camera?.setFree?.(null); } catch (e) { /* optional */ }
  });
  const GANG = D.V?.GANG || 'Sourlings';
  const mk = { id: 'raid_kids', x: 0, z: 0, glyph: 'threat', label: GANG };
  const GANG_HOME = GANG + ' (going home)';

  for (const k of kids) {
    k.raid = null; k.isl = 'candy'; k.scripted = false;
    k.rs = 0; k.rlane = 0; k.rlaneT = 0; k.rord = 0; k.rT = 0; k.rFade = 0; k.rVy = 0; k.rVx = 0; k.rVz = 0; k.ry = 0;
    k.rFx = 0; k.rFz = 0; k.rFy = 0; k.rDetOn = false; k.rDetX = 0; k.rDetZ = 0; k.rDetT = 0; k.rProgT = 0; k.rProgX = 0; k.rProgZ = 0; k.rReplan = false;
    k.rSlotA = 0; k.rShade = 1; k.eyeBoost = 1; k.rV = 0; k.rFull = false;
    k.rRoute = new Int16Array(64); k.rRouteN = -1; k.rRouteI = 0; k.rSkipT = 0;   // the dawn walk's roads (catNav.route)
    k.rBestD = Infinity; k.rLastI = -1; k.rStuckT = 0; k.rNodeT = 0; k.rBoxed = false;
  }

  // The cats' salt ring and the eyes are built and their shaders compiled on
  // the game's FIRST frame (behind the loading screen, hidden) — not on the
  // frame the rainbow comes up (kids fixer r1: that frame cost 47–62 ms).
  // (Not at create(): Cat Island's architecture is built after the kids.)
  let saltTried = false, enableMs = 0;
  function prebuild() {
    saltTried = true;
    try { catSalt = catSalt || createCatSalt(ctx, ring); catSalt.precompile(); } catch (e) { console.warn('[sourpatch/raid] salt line', e?.message || e); }
    try { if (ctx.renderer?.compile && ctx.camera) ctx.renderer.compile(eyes, ctx.camera, ctx.scene); } catch (e) { /* visuals only */ }
  }
  function enable() {
    if (on) return;
    const t0 = performance.now();
    on = true;
    if (!saltTried) prebuild();                      // (only if no frame has run yet)
    readBridge();
    findRespawn();
    catSalt?.setVisible(true);
    D.onEnable?.();
    enableMs = performance.now() - t0;
  }

  function pick() {
    pack.length = 0; raidNo++; stat.nights++;
    cue = false; landedToast = false; homeToast = false; sunToast = false; prowlI = raidNo % PROWL.length; prowlT = 0;
    crossV = 0; boardNext = -1;
    stat.crossV = 0; stat.homeV = 0; stat.startH = null; stat.ashoreH = null; stat.boardH = null; stat.offH = null;
    for (let j = 0; j < kids.length && pack.length < PACK; j++) {
      const k = kids[(j * 7 + raidNo * 5) % kids.length];
      if (k.role === 'shrine' || k.raid || hits.absent(k) || hits.melting(k) || k.gaveUp) continue;
      pack.push(k);
    }
    pack.forEach((k, j) => { k.raid = 'muster'; k.isl = 'candy'; k.rord = j; k.rFull = false; k.rlane = LANES[j % LANES.length]; k.rlaneT = k.rlane; k.rT = 0; k.rSlotA = (j / Math.max(1, pack.length)) * Math.PI * 2; });
    return pack.length;
  }

  function setScripted(k, mode) {
    k.raid = mode; k.scripted = true; k.isl = 'bridge'; k.rT = 0;
    k.air = 0; k.slot = false; k.lunge = 0;
    if (k.hurt) hits.clear(k);
  }
  function startCross(k, sOff = 0, pace = 0) {
    readBridge();
    if (bridgeMode !== 'api') { k.raid = 'wait'; k.isl = 'candy'; k.scripted = false; k.vis = 0; k.rT = 0; return; }
    setScripted(k, 'cross');
    k.rs = S0 - k.rord * GAP + sOff;
    k.vis = 0; k.rFade = 0;
    k.state = 'raid';
    // one pace for the whole column, fixed by the first to set off tonight —
    // one kept indoors longer by the visitor's eye hurries to be ashore by
    // ASHORE_H all the same (its step still keeps the column's beat)
    if (!(crossV > 0)) { crossV = crossPace(); stat.crossV = +crossV.toFixed(2); }
    if (stat.startH == null) stat.startH = clockH();
    k.rV = pace > 0 ? pace : Math.max(crossV, crossPace());
  }
  function landOn(k) {
    // off the deck (or, with no bridge, up out of the dark at the pier): an
    // ordinary night hunter on Cat Island from here on
    k.raid = 'hunt'; k.isl = 'cat'; k.scripted = false; k.eyeBoost = 1;
    k.x = landfall.x + Math.cos(k.rSlotA) * 0.8; k.z = landfall.z + Math.sin(k.rSlotA) * 0.8;
    if (D.blocked(k.x, k.z, k.r) || ringIn(k.x, k.z, 1)) { k.x = landfall.x; k.z = landfall.z; }
    k.y = k.groundY = D.groundY(k.x, k.z); k.px = k.x; k.pz = k.z;
    k.state = 'stalk'; k.burstT = rand() * 0.4; k.bursting = 1; k.orbit = Math.atan2(k.z - ring.z, k.x - ring.x);
    k.watchA = k.orbit; k.saltA = k.orbit;
    stat.landed++;
    if (stat.ashoreH == null) stat.ashoreH = clockH();
  }
  function endRaid(k, how) {
    const wasDeck = k.scripted && (k.raid === 'recross' || k.raid === 'board');
    k.raid = null; k.isl = 'candy'; k.scripted = false; k.rT = 0; k.air = 0; k.eyeBoost = 1; k.rV = 0;
    if (k.rShade !== 1) { k.rShade = 1; D.rig.shade?.(k.i, k.color, 1); }
    // (the last of the walk home off the deck: the morning's clock)
    if (wasDeck && how === 'door') {
      let more = false;
      for (let j = 0; j < pack.length; j++) { const o = pack[j]; if (o !== k && o.raid && o.raid !== 'fall') { more = true; break; } }
      if (!more) stat.offH = clockH();
    }
    const j = pack.indexOf(k); if (j >= 0) pack.splice(j, 1);
    stat.ended++;
    if (how === 'door') {
      // under the rail at the Candyland foot: out of its own front door
      const h = D.homeSpot(k);
      k.x = h.x; k.z = h.z; k.px = k.x; k.pz = k.z; k.y = k.groundY = D.groundY(k.x, k.z); k.vis = 0;
      if (D.phase() === 'playful') {
        k.state = 'dawn'; k.dawnT = 0; k.dawnDelay = 0.25 + rand() * 0.6; k.dawnDoor = true; k.dawnFx = false;
        k.dawnSlit = 0; k.dawnBrow = 0; k.dawnCrouch = 0; k.dawnLean = 0; k.slit = 0; k.browOut = 0; k.crouch = 0;
      } else k.state = 'idle';
      stat.home++;
    }
  }
  /** Where a Cat Island raider is after dark when the pack is placed rather
   *  than walked there (a time jump into the night): round the visitor if he
   *  is on Cat Island (at the edge of the light, like spawnHunters), else at
   *  tonight's prowl spot. */
  function placeOnCat(k, p, around, r0 = 11, rj = 8, R = rand) {
    let ok = false, x = landfall.x, z = landfall.z;
    const cx = around ? p.x : PROWL[prowlI].x, cz = around ? p.z : PROWL[prowlI].z;
    for (let a = 0; a < 24 && !ok; a++) {
      const ang = R() * 6.28, r = around ? r0 + R() * rj : 3 + R() * 7;
      x = cx + Math.sin(ang) * r; z = cz + Math.cos(ang) * r;
      ok = onCat(x, z) && world.height(x, z) > 0.5 && !water.wet(x, z) && !ringIn(x, z, 1.2) && !D.blocked(x, z, k.r || 0.6) && !D.saltBlocked(x, z);
    }
    if (!ok) { x = landfall.x; z = landfall.z; }
    landOn(k);
    k.x = x; k.z = z; k.px = x; k.pz = z; k.y = k.groundY = D.groundY(x, z);
    k.vis = 0; k.slit = 1; k.browOut = 1; k.crouch = 0.8;
  }

  // ── phase hooks (sourpatch.js setPhase) ────────────────────────────────────
  function onPhase(next, prev, p, dawn, jump = false) {
    // (the flag and a jump into the night can land in the same frame — the
    // story set, then the clock — and setPhase runs before update(): switch
    // the raids on here too, or the time-jump placement below is skipped and
    // the pack only turns up 30 s later on foot, from the far end of the arc)
    if (!on) { if (ctx.systems.story?.get?.('rainbow_bridge')) enable(); else return; }
    if (next === 'watching' || next === 'hunting') homeStragglers();
    if (next === 'watching') {
      if (!pack.length) pick();
      crossV = 0;                                 // (tonight's pace is set by the first to set off)
      readBridge();
      nightStarted = false;
    } else if (next === 'hunting') {
      nightStarted = true;
      if (!pack.length || jump) {
        // a time jump straight into the night: the pack is already where the
        // clock says it would be — on the arc (at the natural dusk pace, from
        // MUSTER_H) until ASHORE_H, on Cat Island after
        if (!pack.length) pick();
        readBridge();
        const span = ASHORE_H - MUSTER_H, hu = hoursUntil(ASHORE_H);
        const early = bridgeMode === 'api' && hu > 0.05 && hu < span;
        const onCatNow = onCat(p.x, p.z);
        if (early) { crossV = naturalCross(); stat.crossV = +crossV.toFixed(2); }
        for (const k of pack) {
          if (early) { startCross(k, (1 - hu / span) * (S1 - S0), crossV); k.vis = k.rs >= S0 ? 1 : 0; }
          else placeOnCat(k, p, onCatNow);
        }
        placeSmallHours();                        // (a jump into the file home: onto the deck)
      } else {
        // the end of the dusk rite: the pack musters out of the shrine (brain 'muster')
        for (const k of pack) if (k.raid === 'muster') k.rT = 0;
      }
    } else if (next === 'playful' && !dawn) {
      endAll();
    } else if (next === 'playful' && jump) {
      placeMorning(p);
    }
  }
  /** A clock jump into the morning (dawn window, sourpatch.js DAWN_HOURS): the
   *  pack is where THE CLOCK puts the natural file home — it came up onto the
   *  deck at the Cat Island foot round BOARD_H, one GAP·1.4 behind the other,
   *  and walks the arc in HOME_H game hours — day kids already (the sun has
   *  been up a while), or, past the end of it, home and out of their front
   *  doors. One already further home up there keeps its place. startDawn has
   *  run first (raid.dawn: the deck turned round; the rest in the dawn turn). */
  function placeMorning(p) {
    readBridge();
    const api = bridgeMode === 'api' && PN > 1;
    const f = (ctx.state.time - BOARD_H) / HOME_H;
    let up = 0;
    for (let j = pack.length - 1; j >= 0; j--) {
      const k = pack[j];
      if (!k.raid || k.raid === 'fall' || hits.melting(k) || hits.absent(k)) continue;
      const sClock = S1 - (S1 - S0) * f + k.rord * GAP * 1.4;
      const sNow = k.scripted && k.raid === 'recross' ? k.rs : S1;
      const s = Math.min(sNow, sClock, S1);
      if (!api || s <= S0 + 0.5) { endRaid(k, 'door'); continue; }
      setScripted(k, 'recross'); k.state = 'raid';
      k.rs = s; k.rV = homePace(s);
      k.vis = 1; k.rFade = 0; k.eyeBoost = 1; k.lean = 0.04; k.hop = 0;
      k.slit = 0; k.browOut = 0; k.crouch = 0; k.mouthOpen = 0; k.mouthWide = 0.3;
      if (k.rShade !== 1) { k.rShade = 1; D.rig.shade?.(k.i, k.color, 1); }
      k.rlane = k.rlaneT = LANES[k.rord % LANES.length];
      pathAt(k.rs, k.rlane, _pt);
      k.x = _pt.x; k.z = _pt.z; k.ry = _pt.y; k.y = k.groundY = _pt.y; k.px = k.x; k.pz = k.z;
      k.yaw = k.desYaw = Math.atan2(-_pt.tx, -_pt.tz);
      up++;
    }
    stat.jumps++;
    // (waking on Cat Island to an empty street: where did they go?)
    if (up && !homeToast && p && onCat(p.x, p.z)) {
      homeToast = true;
      try { ctx.systems.ui?.toast(`Out over the strait, the ${GANG} are walking home along the rainbow, yawning.`, 4); } catch (e) { /* optional */ }
    }
  }
  /** A clock jump into the small hours after BOARD_H (the harness, a debug
   *  setTime — naps land at 06:00, see placeMorning): the natural file home is
   *  up on the arc by now, night kids still — so that is where the pack is,
   *  not strung out across Cat Island with the sunrise minutes away. */
  function placeSmallHours() {
    const tm = ctx.state.time;
    if (!(tm >= BOARD_H && tm < 5.5) || !pack.length) return;
    readBridge();
    if (bridgeMode !== 'api' || PN < 2) return;
    const f = (tm - BOARD_H) / HOME_H;
    for (let j = pack.length - 1; j >= 0; j--) {
      const k = pack[j];
      if (!k.raid || k.raid === 'fall' || k.raid === 'muster' || k.raid === 'wait' || hits.melting(k) || hits.absent(k)) continue;
      const sClock = S1 - (S1 - S0) * f + k.rord * GAP * 1.4;
      const sNow = k.scripted && k.raid === 'recross' ? k.rs : S1;
      const s = Math.min(sNow, sClock, S1);
      if (s <= S0 + 0.5) { endRaid(k, 'door'); continue; }
      setScripted(k, 'recross'); k.state = 'raid';
      k.rs = s; k.rV = homePace(s);
      k.vis = 1; k.rFade = 0; k.eyeBoost = DECK_EYES; k.hop = 0; k.lean = 0.14;
      k.slit = 1; k.browOut = 1;
      k.rlane = k.rlaneT = LANES[k.rord % LANES.length];
      pathAt(k.rs, k.rlane, _pt);
      k.x = _pt.x; k.z = _pt.z; k.ry = _pt.y; k.y = k.groundY = _pt.y; k.px = k.x; k.pz = k.z;
      k.yaw = k.desYaw = Math.atan2(-_pt.tx, -_pt.tz);
    }
    stat.jumps++;
  }
  /** Last night's walkers still on the way home when the next dusk comes (a
   *  clock jump — a nap, the harness — can land it while one is still on the
   *  arc): they are simply home, out of their front doors in the dark, and
   *  tonight's pack is picked afresh (kids fixer r1: one straggler in
   *  'recross' used to stand in for the whole of the next night's raid). */
  function homeStragglers() {
    for (let j = pack.length - 1; j >= 0; j--) {
      const k = pack[j];
      if (k.raid !== 'return' && k.raid !== 'retreat' && k.raid !== 'board' && k.raid !== 'recross') continue;
      endRaid(k, null);
      if (hits.melting(k)) continue;
      const h = D.homeSpot(k);
      k.x = h.x; k.z = h.z; k.px = k.x; k.pz = k.z; k.y = k.groundY = D.groundY(k.x, k.z);
      k.state = 'idle'; k.vis = 0;
    }
  }
  /** Time jump out of the night (setTime(12)): everyone is simply home. */
  function endAll() {
    for (let j = pack.length - 1; j >= 0; j--) {
      const k = pack[j];
      endRaid(k, null);
      if (!hits.melting(k)) { k.x = k.anchor.x; k.z = k.anchor.z; k.px = k.x; k.pz = k.z; k.y = k.groundY = D.groundY(k.x, k.z); k.state = 'idle'; }
    }
    pack.length = 0;
    removeMarker();
  }
  /** startDawn, per raider: true = handled here (skip the normal dawn setup). */
  function dawn(k) {
    if (!k.raid) return false;
    if (k.raid === 'muster' || k.raid === 'wait' || hits.absent(k) || (!k.scripted && k.vis < 0.05)) { endRaid(k, null); return false; }
    if (k.scripted) {
      // still on the deck at sunrise: it just turns round (and hurries: due
      // off the deck by DECK_DUE_H)
      if (k.raid === 'cross' || k.raid === 'land') {
        k.raid = 'recross'; k.rT = 0;
        if (k.rs < S0) { endRaid(k, 'door'); return true; }
        k.rV = homePace(k.rs);
      }
      if (k.raid === 'fall') return true;
      // THE DAWN ON THE RAINBOW: the file home is caught by the sunrise up on
      // the arc — each one shivers, a puff of sugar, and walks on a day kid
      // (the face and the hunch ease back by themselves as the light comes:
      // sourpatch.js damps slit / brows / crouch to the night mix)
      if (k.vis > 0.5) { k.squash = -0.22; k.squashV = 0; D.puff(k, 8, 0.6); }
      if (!sunToast) {
        sunToast = true;
        const pp = ctx.systems.player?.position;
        if (pp && pp.x > -45 && pp.x < 60 && pack.length) {
          try { ctx.systems.ui?.toast(`The sun catches the ${GANG} up on the rainbow. They shiver, and remember their manners.`, 4); } catch (e) { /* optional */ }
        }
      }
      return true;
    }
    return false;                               // on Cat Island: the ordinary dawn turn first
  }
  /** In the small hours a raider on Cat Island sets off for the foot of the
   *  rainbow, by as long as its walk there takes, to be on the deck by BOARD_H
   *  (not mid-pounce, not while something is being done to it). */
  function retreatDue(k) {
    if (bridgeMode !== 'api' || PN < 2 || D.phase() !== 'hunting') return false;
    const tm = ctx.state.time;
    if (!(tm >= RETREAT_MIN_H && tm < 5.5) || k.lunge > 0 || k.hurt) return false;
    const walkH = (walkEst(k) / RET_V + 1.5) / secPerH();
    return tm >= BOARD_H - Math.min(RETREAT_LEAD_MAX, walkH);
  }
  /** How far it has to walk to the foot of the rainbow: by the roads, and
   *  round the cats' ring if the straight line cuts it (a raider pacing the
   *  far side of the refuge has half its rim to go). */
  function walkEst(k) {
    const d = dist2d(k.x, k.z, landfall.x, landfall.z);
    const dx = landfall.x - k.x, dz = landfall.z - k.z, L2 = dx * dx + dz * dz;
    let f = L2 > 1e-6 ? ((ring.x - k.x) * dx + (ring.z - k.z) * dz) / L2 : 0;
    f = f < 0 ? 0 : (f > 1 ? 1 : f);
    const qx = k.x + dx * f - ring.x, qz = k.z + dz * f - ring.z, R = ring.r + RING_WALK;
    return d * RET_ROUTE + (qx * qx + qz * qz < R * R ? R * 1.2 : 0);
  }
  function startRetreat(k, full = false) {
    k.rFull = full;
    k.raid = 'retreat'; k.state = 'raid'; k.rT = 0; k.rProgT = 0; k.rDetOn = false; k.rReplan = false;
    k.slot = false; k.lunge = 0; k.bursting = 0;
    k.rRouteN = -1; k.rRouteI = 0; k.rSkipT = 0;
    k.rBestD = Infinity; k.rLastI = -1; k.rStuckT = 0; k.rNodeT = 0; k.rBoxed = false;
    stat.retreats++;
  }
  /** dawnBrain has turned it back into a day kid: the walk home starts. */
  function afterDawn(k) {
    if (!k.raid) return false;
    k.raid = 'return'; k.isl = 'cat'; k.state = 'raid'; k.rT = 0; k.rProgT = 0; k.rDetOn = false; k.rReplan = false;
    k.rRouteN = -1; k.rRouteI = 0; k.rSkipT = 0;                    // (its roads are planned on its first step)
    k.rBestD = Infinity; k.rLastI = -1; k.rStuckT = 0; k.rNodeT = 0; k.rBoxed = false;
    return true;
  }

  // ── movement on Cat Island: round the salt ring, round the houses ──────────
  /** Next waypoint toward (tx, tz): straight, unless that line cuts the cats'
   *  salt ring — then the tangent point on a circle RING_WALK outside it. */
  function wayTo(k, tx, tz, out) {
    const R = ring.r + RING_WALK, cx = ring.x, cz = ring.z;
    const dx = tx - k.x, dz = tz - k.z, L2 = dx * dx + dz * dz;
    let t = L2 > 1e-6 ? ((cx - k.x) * dx + (cz - k.z) * dz) / L2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const qx = k.x + dx * t - cx, qz = k.z + dz * t - cz;
    // (only a line that really goes IN: a goal at the salt's edge — the pacing
    // at the line — is walked to straight)
    if (qx * qx + qz * qz >= (ring.r + 0.35) * (ring.r + 0.35)) { out.x = tx; out.z = tz; return out; }
    const ak = Math.atan2(k.z - cz, k.x - cx), at = Math.atan2(tz - cz, tx - cx);
    let da = at - ak; da = Math.atan2(Math.sin(da), Math.cos(da));
    const sg = da >= 0 ? 1 : -1, dk = Math.hypot(k.x - cx, k.z - cz);
    const th = dk > R + 0.5 ? Math.acos(R / dk) + 0.12 : 0.45;
    const a = ak + sg * Math.min(Math.abs(da), th);
    out.x = cx + Math.cos(a) * R; out.z = cz + Math.sin(a) * R;
    return out;
  }
  /** Walk to (tx, tz) on Cat Island at `speed`: round the ring, round what is
   *  in the way (sourpatch/nav.js A* on a stall). Returns the distance left. */
  function walkCat(k, tx, tz, speed, dt) {
    // (sourpatch.js moveTo walks round the salt ring, and asks the Cat Island
    // nav for a way round anything it has been stuck on)
    return D.moveTo(k, tx, tz, speed, dt);
  }

  // ── brains ─────────────────────────────────────────────────────────────────
  /** A raider's frame. true = handled; false = let the ordinary brains run
   *  (the night hunt on Cat Island, the dusk beat while it is still at home). */
  function brain(k, dt, t, p, dp, info) {
    k.rT += dt;
    switch (k.raid) {
      case 'muster':
        // (Contract O) in the rings with everyone else through the dusk rite;
        // after the reveal it runs off out of the shrine into the dark, and the
        // moment nobody can see it, it is out of the dark at the foot of the rainbow
        if (D.phase() !== 'hunting') return false;
        if (k.vis <= 0.02 || !D.inView(k.x, k.y + 0.8, k.z) || k.rT > MUSTER_RUN) { startCross(k); return true; }
        musterRun(k, dt, t);
        return true;
      case 'wait':
        // no bridge: it comes ashore at the Arrivals Pier at nightfall
        k.vis = 0; k.moving = 0;
        if (D.phase() === 'hunting' && k.rT > 1.5 + k.rord * 0.6) { landOn(k); k.vis = 0; }
        return true;
      case 'cross': return crossBrain(k, dt, t, p, dp, info, 1);
      case 'recross': return crossBrain(k, dt, t, p, dp, info, -1);
      case 'land': return landBrain(k, dt, t, p, dp, info);
      case 'board': return boardBrain(k, dt);
      case 'fall': return fallBrain(k, dt);
      case 'return': case 'retreat': return returnBrain(k, dt, t, p, dp, info);
      case 'hunt':
        // the small hours: time to be at the foot of the rainbow (THE CLOCK)
        if (retreatDue(k)) { startRetreat(k); return returnBrain(k, dt, t, p, dp, info); }
        if (D.phase() === 'hunting' && info.playerOnCat) return false;       // the ordinary night hunt, on Cat Island
        prowlBrain(k, dt, t, p, dp, info);
        return true;
      default: return false;
    }
  }

  /** The pack musters: off out of the shrine along the forest path, at a
   *  scurry, the night rig on (it has just been revealed). */
  function musterRun(k, dt, t) {
    let tx = MUSTER_WAY[MUSTER_WAY.length - 1][0], tz = MUSTER_WAY[MUSTER_WAY.length - 1][1];
    for (let j = 0; j < MUSTER_WAY.length; j++) {
      const w = MUSTER_WAY[j];
      if (dist2d(k.x, k.z, w[0], w[1]) > 3 && (j === MUSTER_WAY.length - 1 || k.x < w[0] + 1.5)) { tx = w[0]; tz = w[1]; break; }
    }
    k.state = 'raid';
    D.moveTo(k, tx, tz, 7.2, dt);
    k.armMode = 'reach'; k.eyesShut = 0;
    k.lean = D.damp(k.lean, 0.25, 5, dt);
    k.mouthWide = D.damp(k.mouthWide, 0.9, 4, dt);
    k.sit = 0; k.lie = 0; k.kick = 0; k.cross = 0;
  }

  function crossBrain(k, dt, t, p, dp, info, dir) {
    const night = D.phase() === 'hunting';
    // (timed, not paced: THE CLOCK — the pace was fixed when it set off)
    if (!(k.rV > 0)) k.rV = dir > 0 ? (crossV > 0 ? crossV : naturalCross()) : homePace(k.rs);
    const speed = k.rV;
    k.rs += dir * speed * dt;
    // up out of the dark at the foot (and back under the rail at the end)
    const vis0 = dir > 0 ? k.rs >= S0 : true;
    if (!vis0) { k.vis = 0; k.moving = 0; pathAt(S0, k.rlane, _pt); k.x = _pt.x; k.z = _pt.z; k.ry = _pt.y; k.y = _pt.y; return true; }
    if (k.vis < 1) {
      if (k.vis === 0 && dir > 0) {
        pathAt(k.rs, k.rlane, _pt); k.x = _pt.x; k.z = _pt.z; k.y = _pt.y;
        k.rFade = 1; D.puff(k, 8, 0.6); if (!cue) fireCue(p);
      }
      k.vis = Math.min(1, k.vis + dt * 1.8);
    }
    // make room for a visitor standing on the deck (the truce: walk round
    // him) — and for the tigers coming the other way (flat against the rail)
    k.rlaneT = LANES[k.rord % LANES.length];
    let yieldRate = 3.2;
    visOnDeck = !!info.playerOnBridge; visX = p.x; visZ = p.z;
    const pd = info.playerOnBridge ? dist2d(k.x, k.z, p.x, p.z) : 99;
    if (pd < 7) {
      // (he is ahead of it on the deck, or just beside it: go round, early)
      pathAt(k.rs, 0, _pt);
      const ahead = ((p.x - _pt.x) * _pt.tx + (p.z - _pt.z) * _pt.tz) * dir;
      if (ahead > -1.5) {
        yieldTo(k, p.x, p.z, 1.7); yieldRate = 7;
        if (k.sayCd <= 0 && pd < 3 && D.say(k, V.BRIDGE[k.lineIdx++ % V.BRIDGE.length])) k.sayCd = 14;
      }
    }
    const tp = ctx.systems.catCitizens?.raid?.party;
    if (Array.isArray(tp)) for (let j = 0; j < tp.length; j++) {
      const c = tp[j];
      if (!c || c.mode !== 'path' || !(c.vis > 0.3) || !Number.isFinite(c.x)) continue;
      if (Math.abs((c.y ?? k.ry) - k.ry) < 3.5 && dist2d(k.x, k.z, c.x, c.z) < 6) { yieldTo(k, c.x, c.z, 1.9); yieldRate = 7; }
    }
    // and round what stands ON the deck (the gate canes, the signal case at
    // the crest): look a stride ahead in its lane, take the nearest clear one
    if (!laneClear(k, k.rlaneT, dir)) {
      for (let j = 1; j <= 6; j++) {
        const L2 = k.rlaneT + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.65;
        if (L2 > -2.1 && L2 < 2.1 && laneClear(k, L2, dir)) { k.rlaneT = L2; laneDodges++; yieldRate = 7; break; }
      }
    }
    k.rlane += (k.rlaneT - k.rlane) * Math.min(1, dt * yieldRate);
    pathAt(k.rs, k.rlane, _pt);
    k.x = _pt.x; k.z = _pt.z; k.ry = _pt.y;
    k.desYaw = Math.atan2(_pt.tx * dir, _pt.tz * dir); k.yaw = k.desYaw;
    k.moving = speed;
    k.armMode = night && dir > 0 ? 'reach' : 'behind';
    k.lie = 0; k.sit = 0; k.kick = 0; k.cross = 0; k.eyesShut = D.damp(k.eyesShut, 0, 6, dt);
    if (night && dir > 0) {
      // THE NIGHT MARCH (kids polisher r1 — critic: "pitched 40° forward with
      // their backs to the camera, faceless coloured blobs"): up on the
      // rainbow after dark they do not creep, they PARADE — bolt upright,
      // arms out, every foot coming down on the same beat (one gait phase for
      // the whole column), faces up so the lit eyes and the grins lead it.
      // (sourpatch.js drops the night hunch and tilts every head together on
      // the deck: see `deck` in the shared animation layer)
      k.lean = D.damp(k.lean, Math.max(-0.08, Math.min(0.08, _pt.grade * 0.16)), 5, dt);
      k.gait = t * MARCH_K * (crossV > 0 ? crossV : speed);             // (one beat for the whole column)
      k.eyeBoost = DECK_EYES;
      k.hop = D.damp(k.hop, 0, 8, dt);
      k.mouthWide = D.damp(k.mouthWide, 0.85, 3, dt);
      k.mouthOpen = D.damp(k.mouthOpen, 0.12 + 0.1 * Math.max(0, Math.sin(t * 1.3)), 3, dt);
    } else if (night) {
      // HOME IN THE DARK (THE CLOCK): the file slinks back up the arc before
      // the sun can catch it — a little hunched into the climb, no skip, the
      // grins still lit and the eyes still burning (every head turns to
      // follow the visitor: sourpatch.js's night look-at)
      k.eyeBoost = DECK_EYES;
      k.lean = D.damp(k.lean, -Math.max(-0.3, Math.min(0.3, _pt.grade * 0.45)) + 0.14, 4, dt);
      k.hop = D.damp(k.hop, 0, 8, dt);
      k.mouthWide = D.damp(k.mouthWide, 0.75, 3, dt);
      k.mouthOpen = D.damp(k.mouthOpen, 0.08, 3, dt);
    } else {
      k.eyeBoost = 1;
      k.lean = D.damp(k.lean, (dir > 0 ? 1 : -1) * Math.max(-0.35, Math.min(0.35, _pt.grade * 0.55)) + 0.04, 4, dt);
      // a skip up, a jog home for breakfast (the hop keeps time with the pace)
      D.hopTick(k, dt, 7.2 * Math.max(0.8, speed / 6), dir > 0 ? 0.13 : 0.06);
      k.mouthWide = D.damp(k.mouthWide, dir > 0 ? 0.6 : 0.3, 3, dt);
    }
    // the far end
    if (dir > 0 && k.rs >= S1) {
      stat.crossed++;
      if (PN > 1) { k.raid = 'land'; k.rT = 0; k.rFx = k.x; k.rFz = k.z; k.rFy = k.ry; }
      else landOn(k);
    } else if (dir < 0 && k.rs <= S0 + 0.5) {
      // home: under the rail, out of the front door
      k.vis = Math.max(0, k.vis - dt * 2.6);
      if (k.vis === 0 || k.rs <= S0 - 1.5) { D.puff(k, 10, 0.7); endRaid(k, 'door'); }
    }
    return true;
  }
  let laneDodges = 0, planFrame = -1, rframe = 0, routes = 0;
  /** Is lane L clear a stride ahead (and here)? (pushOut: the deck's own
   *  colliders — gate canes, the signal case — are the only ones up here) */
  let visOnDeck = false, visX = 0, visZ = 0;
  function laneClear(k, L, dir) {
    const r = (k.r || 0.55) * 0.95, rv = (k.r || 0.55) + 0.62;
    for (let q = 0; q < 3; q++) {
      pathAt(k.rs + dir * (q === 0 ? 0.4 : q === 1 ? 1.3 : 2.4), L, _pl);
      if (D.blocked(_pl.x, _pl.z, r)) return false;
      // (the visitor standing on the deck is in the way too)
      if (visOnDeck && (_pl.x - visX) * (_pl.x - visX) + (_pl.z - visZ) * (_pl.z - visZ) < rv * rv) return false;
    }
    return true;
  }
  /** Something big on the deck at (ox, oz): this kid's lane goes to the far
   *  side of it, `gap` u clear (the deck is 5 u: the rail is at ±2.5). */
  function yieldTo(k, ox, oz, gap) {
    pathAt(k.rs, 0, _pt);
    const side = (ox - _pt.x) * -_pt.tz + (oz - _pt.z) * _pt.tx;
    // pass on the side it is already on, unless that side has no room left
    const lo = side - gap, hi = side + gap;
    // (decided on where it IS, not where it would like to be: no flip-flopping)
    const goLow = k.rlane <= side ? lo >= -2.05 : hi > 2.05;
    k.rlaneT = goLow ? Math.max(-2.05, Math.min(k.rlaneT, lo)) : Math.min(2.05, Math.max(k.rlaneT, hi));
  }
  /** Off the end of the deck and down onto Cat Island (or, dir -1 in
   *  'return', from the landfall up onto it: see returnBrain). */
  function landBrain(k, dt, t, p, dp, info) {
    const d = dist2d(k.rFx, k.rFz, landfall.x, landfall.z) || 1;
    const v = Math.max(LAND_SPEED, (k.rV || 0) * 0.55);          // (off the arc without stopping dead)
    const f = Math.min(1, k.rT * v / d);
    k.x = k.rFx + (landfall.x - k.rFx) * f; k.z = k.rFz + (landfall.z - k.rFz) * f;
    const g = D.groundY(k.x, k.z);
    k.ry = Math.max(g, k.rFy + (landfall.y - k.rFy) * f);
    k.desYaw = Math.atan2(landfall.x - k.rFx, landfall.z - k.rFz); k.yaw = k.desYaw;
    k.moving = v; k.vis = Math.min(1, k.vis + dt * 2);
    if (f >= 1) {
      landOn(k);
      if (!landedToast && info.playerOnCat) {
        landedToast = true;
        ctx.systems.ui?.toast(`Little feet, coming down the rainbow. The ${GANG} are on Cat Island.`, 4);
      }
    }
    return true;
  }
  /** From the landfall back up onto the far foot of the deck, then home. */
  function boardBrain(k, dt) {
    pathAt(S1, k.rlane, _pt);
    const d = dist2d(k.rFx, k.rFz, _pt.x, _pt.z) || 1;
    const f = Math.min(1, k.rT * LAND_SPEED / d);
    k.x = k.rFx + (_pt.x - k.rFx) * f; k.z = k.rFz + (_pt.z - k.rFz) * f;
    k.ry = Math.max(D.groundY(k.x, k.z), k.rFy + (_pt.y - k.rFy) * f);
    k.desYaw = Math.atan2(_pt.x - k.rFx, _pt.z - k.rFz); k.yaw = k.desYaw;
    k.moving = LAND_SPEED; k.armMode = 'behind'; k.vis = 1;
    if (f >= 1) { k.raid = 'recross'; k.rT = 0; }
    return true;
  }
  /** Knocked over the rail: an arc out and down into the sea — it melts. */
  function fallBrain(k, dt) {
    k.rVy -= 22 * dt;
    k.x += k.rVx * dt; k.z += k.rVz * dt; k.ry += k.rVy * dt;
    k.moving = 0; k.armMode = 'up'; k.mouthOpen = 0.9; k.mouthWide = 1;
    k.yaw += dt * 7; k.desYaw = k.yaw;
    const g = world.height(k.x, k.z);
    if (g > 0.3 && k.ry <= g) {
      // came down on dry land after all (near a foot): shaken, then back to it
      k.scripted = false; k.ry = g;
      if (onCat(k.x, k.z)) { k.raid = 'hunt'; k.isl = 'cat'; k.state = 'stalk'; }
      else endRaid(k, null);
      return true;
    }
    if (k.ry <= SEA_MELT) {
      stat.fell++;
      k.scripted = false; k.isl = k.x > 0 ? 'cat' : 'candy'; k.ry = 0;
      k.y = k.groundY = 0;
      D.meltInWater(k, 'fall');
      endRaid(k, null);
    }
    return true;
  }
  /** Hit on the deck (a weapon, a stomp): the reaction machine does not run
   *  up here — a punt / cannon / bonk sends it over the rail, anything else
   *  is a flinch and a giggle. */
  function knock(k) {
    const h = k.hurt; if (!h) return;
    const mode = h.mode, fx = Number.isFinite(h.fx) ? h.fx : ctx.systems.player?.position?.x ?? k.x;
    const fz = Number.isFinite(h.fz) ? h.fz : ctx.systems.player?.position?.z ?? k.z;
    hits.clear(k);
    if (!(k.raid === 'cross' || k.raid === 'recross' || k.raid === 'land' || k.raid === 'board')) return;
    // only from up here: a bat swung on the beach sixty metres below does not reach
    const pp = ctx.systems.player?.position;
    const near = pp && Math.abs((pp.y ?? 0) - k.ry) < 4 && dist2d(pp.x, pp.z, k.x, k.z) < 12;
    if (near && !(mode === 'flinch' || mode === 'stun' || mode === 'stuck' || mode === 'bonk')) {
      pathAt(k.rs, 0, _pt);
      let sx = -_pt.tz, sz = _pt.tx;                                    // over the rail on his far side
      if ((k.x - fx) * sx + (k.z - fz) * sz < 0) { sx = -sx; sz = -sz; }
      k.raid = 'fall'; k.rT = 0; k.rVx = sx * 4.2; k.rVz = sz * 4.2; k.rVy = 4.5;
      k.squash = -0.25; D.puff(k, 10, 0.8);
      D.say(k, V.SHRIEK[k.lineIdx++ % V.SHRIEK.length], true);
    } else {
      k.squash = -0.2; k.hopT = 0; D.puff(k, 6, 0.9);
    }
  }

  /** Night on Cat Island without the visitor on it: they prowl it — a loose
   *  pack moving between Main Street, the square and the harbour; with him
   *  up on the bridge they wait at its foot and look up. */
  function prowlBrain(k, dt, t, p, dp, info) {
    k.lie = 0; k.sit = 0; k.kick = 0; k.cross = 0; k.eyesShut = 0; k.headBias = 0;
    k.vis = Math.min(1, k.vis + dt * 1.8);
    const night = D.phase() === 'hunting';
    let cx, cz, R;
    if (info.playerOnBridge || !night) { cx = landfall.x; cz = landfall.z; R = 2.5 + (k.rord % 3) * 1.4; }
    else { cx = PROWL[prowlI].x; cz = PROWL[prowlI].z; R = 3.5 + (k.rord % 3) * 2.2; }
    const a = k.rSlotA + t * 0.05;
    const tx = cx + Math.cos(a) * R, tz = cz + Math.sin(a) * R;
    k.burstT -= dt;
    if (k.burstT <= 0) { k.bursting = k.bursting ? 0 : 1; k.burstT = k.bursting ? 0.5 + rand() * 0.8 : 0.3 + rand() * 0.9; }
    const d = dist2d(k.x, k.z, tx, tz);
    if (d > 1.2 && (k.bursting || d > 12)) walkCat(k, tx, tz, d > 14 ? 4.4 : 2.6, dt);
    else k.moving = 0;
    if ((k.bumped || k.wasBumped) && k.turnCd <= 0) { k.rSlotA += 0.9; k.turnCd = 2; }
    if (info.playerOnBridge || dp < 40) D.faceThing(k, p.x, p.z, 4, dt);
    k.armMode = night ? 'reach' : 'free';
    k.lean = D.damp(k.lean, night ? 0.26 : 0.05, 3, dt);
    k.mouthOpen = D.damp(k.mouthOpen, 0, 5, dt);
  }

  /** Home: back to the landfall, up onto the deck and over. In the small hours
   *  ('retreat', still night kids — THE CLOCK) or after the dawn turn
   *  ('return', day kids). A walker from across the island goes by the ROADS
   *  (kids fixer r1: straight at the pier from Main Street, six of eight
   *  wedged in back gardens and behind benches and were warped):
   *  catNav.route() — the Cat Island path network (its plaza roads are skipped
   *  until it may cross the salt: RING_FREE_D, and never by a night kid) —
   *  planned on its first step (one plan a frame across the pack), followed
   *  node to node, skipping ahead whenever a later node (or the landfall) is
   *  in a straight line; the A* way-round still handles anything on a road.
   *  At the foot they go up one at a time (BOARD_GAP), the rest waiting their
   *  turn a step off, facing the rainbow. */
  function returnBrain(k, dt, t, p, dp, info) {
    const night = k.raid === 'retreat' && D.phase() === 'hunting';
    k.vis = Math.min(1, k.vis + dt * 2); k.state = 'raid';
    k.lie = 0; k.sit = 0;
    if (night) { k.armMode = 'free'; k.lean = D.damp(k.lean, 0.22, 4, dt); }
    else { k.armMode = 'behind'; k.lean = D.damp(k.lean, 0.05, 4, dt); k.crouch = D.damp(k.crouch, 0, 4, dt); }
    const nav = D.catNav, r = k.r || 0.55;
    const api = bridgeMode === 'api' && PN > 1;
    const dL = dist2d(k.x, k.z, landfall.x, landfall.z);
    // its turn in the file home: at the foot, one up onto the deck at a time
    if (api && dL < BOARD_R && t < boardNext) {
      k.moving = 0; k.rStuckT = 0;
      pathAt(S1, 0, _pt); D.faceThing(k, _pt.x, _pt.z, 5, dt);
      return true;
    }
    if (k.rRouteN < 0) {
      if (dL < 14 || !nav || typeof nav.route !== 'function') k.rRouteN = 0;
      else if (planFrame !== rframe) {
        planFrame = rframe;
        try { k.rRouteN = nav.route(k.x, k.z, landfall.x, landfall.z, r, k.rRoute); } catch (e) { k.rRouteN = 0; }
        k.rRouteI = 0; k.rSkipT = 0; routes++;
      }
    }
    let tx = landfall.x, tz = landfall.z;
    if (k.rRouteN > 0 && k.rRouteI < k.rRouteN) {
      // a node buried in a prop (the plaza's road runs under its planters and
      // the fountain) is passed over — and so is one it has been trying to
      // reach for NODE_GIVE s (neither counts as progress)
      k.rNodeT += dt;
      // (…and, while it still walks round the ring, the roads through the plaza)
      const free = !night && (ringIn(k.x, k.z, 0.5) || dL < RING_FREE_D);
      for (let q = 0; q < 12 && k.rRouteI < k.rRouteN; q++) {
        const n = k.rRoute[k.rRouteI];
        if (k.rNodeT < NODE_GIVE && (free || !ringIn(nav.X[n], nav.Z[n], 0.6)) && nav.lineClear(nav.X[n], nav.Z[n], nav.X[n], nav.Z[n], r) === 0) break;
        k.rRouteI++; k.rLastI = k.rRouteI; k.rNodeT = 0;
      }
      k.rSkipT -= dt;
      if (k.rSkipT <= 0) {
        k.rSkipT = SKIP_DT;
        if (dL < 30 && nav.lineClear(k.x, k.z, landfall.x, landfall.z, r) === 0) { k.rRouteI = k.rRouteN; k.rNodeT = 0; }
        else {
          for (let j = Math.min(k.rRouteN - 1, k.rRouteI + 3); j > k.rRouteI; j--) {
            const n = k.rRoute[j];
            if (nav.lineClear(k.x, k.z, nav.X[n], nav.Z[n], r) === 0) { k.rRouteI = j; k.rNodeT = 0; break; }
          }
        }
      }
      if (k.rRouteI < k.rRouteN) {
        const n = k.rRoute[k.rRouteI];
        tx = nav.X[n]; tz = nav.Z[n];
        if (dist2d(k.x, k.z, tx, tz) < NODE_R) { k.rRouteI++; k.rSkipT = 0; k.rNodeT = 0; }
      }
    }
    walkCat(k, tx, tz, dL > 25 ? (night ? RET_V : HOME_WALK) : (night ? 3.8 : 3.4), dt);
    const d = dist2d(k.x, k.z, landfall.x, landfall.z);
    if (!night && k.moving > 0.4) D.hopTick(k, dt, 5.5, 0.04);
    const pool = night ? (k.rFull ? V.GIVEUP : (V.RETREAT || V.RAID)) : V.HOMEWARD;
    if (pool && k.sayCd <= 0 && dp < (night ? 14 : 20) && rand() < dt * 0.05 && D.say(k, pool[k.lineIdx++ % pool.length])) k.sayCd = 25;
    const seen = D.inView(k.x, k.y + 0.8, k.z);
    // progress: a metre nearer the pier than it has ever been, or the next road node
    if (d < k.rBestD - 1 || k.rRouteI !== k.rLastI) { k.rBestD = Math.min(k.rBestD, d); k.rLastI = k.rRouteI; k.rStuckT = 0; }
    else k.rStuckT += dt;
    // (the way-round planner found it boxed in — a notch in the arrivals
    // office, a garden behind a fence: no amount of waiting walks it out)
    if (k.rBoxed) { k.rBoxed = false; if (k.rStuckT > 2) k.rStuckT = Math.max(k.rStuckT, RETURN_WARP - 1, RETURN_STUCK - 6); }
    const atFoot = d < (api ? BOARD_R : 1.6);
    if (atFoot || (k.rStuckT > RETURN_WARP && !seen) || k.rStuckT > RETURN_STUCK || k.rT > RETURN_MAX) {
      if (!atFoot) { stat.warps++; if (seen) D.puff(k, 10, 0.7); k.x = landfall.x; k.z = landfall.z; k.px = k.x; k.pz = k.z; k.rStuckT = 0; }
      if (api) {
        if (t < boardNext) return true;            // (someone is going up: its turn next)
        boardNext = t + BOARD_GAP;
        // up onto the deck from the landfall (the reverse of 'land'), then home
        const gy = D.groundY(k.x, k.z);
        setScripted(k, 'board');
        k.rs = S1; k.state = 'raid'; k.rFx = k.x; k.rFz = k.z; k.rFy = gy; k.ry = gy;
        k.rV = homePace(S1);
        if (stat.boardH == null && !k.rFull) { stat.boardH = clockH(); stat.homeV = +k.rV.toFixed(2); }
      } else {
        // no bridge: it walks off the end of the pier and is gone (home by breakfast)
        D.puff(k, 10, 0.7); endRaid(k, 'door');
      }
      if (!homeToast && !k.rFull && (info.playerOnCat || info.playerOnBridge)) {
        homeToast = true;
        ctx.systems.ui?.toast(night
          ? `Before the sun can catch them, the ${GANG} file back up the rainbow. Every head turns to watch you as they go.`
          : `The ${GANG} are walking home over the rainbow, yawning.`, 4);
      }
    }
    return true;
  }

  function fireCue(p) {
    cue = true; stat.cues++;
    try { ctx.systems.audio?.play?.('sourpatch_giggle', { x: PN ? PX[0] : CAT_DOCK.x, z: PN ? PZ[0] : CAT_DOCK.z }); } catch (e) { /* audio is optional */ }
    const onCatP = p && onCat(p.x, p.z);
    ctx.systems.ui?.toast(onCatP ? CUE_CAND + ' They\'re coming here.' : CUE_CAND, 4.5);
    ctx.events.emit('sourpatch:raid', { stage: 'bridge', n: pack.length });
  }

  // ── once a frame, before the kids ──────────────────────────────────────────
  function update(dt, t, p, info) {
    rframe++;
    if (!saltTried) prebuild();
    if (!on) { if (ctx.systems.story?.get?.('rainbow_bridge')) enable(); else return; }
    // a debug pose waits for the phase the clock has just been set to
    let posed = false;
    if (pending && D.phase() === pending.phase) { applyPending(p); posed = true; }
    // …and a clock jump inside the night into the file home (05:12 from 23:00)
    // finds the pack where THE CLOCK puts it: on the deck, homeward
    if (jumped) { jumped = false; if (!posed && !pending && D.phase() === 'hunting') placeSmallHours(); }
    // …and a debug framing follows the pack (render views only)
    if (frameCfg && pack.length) {
      let n = 0, sx = 0, sy = 0, sz = 0;
      for (const k of pack) if (k.vis > 0.3) { sx += k.x; sy += k.y; sz += k.z; n++; }
      if (n) {
        _fv.target[0] = sx / n; _fv.target[1] = sy / n + (frameCfg.dy ?? 0.9); _fv.target[2] = sz / n;
        _fv.azimuth = frameCfg.az ?? 0.6; _fv.elevation = frameCfg.el ?? 0.3; _fv.distance = frameCfg.dist ?? 24; _fv.fov = frameCfg.fov ?? 36;
        try { ctx.systems.camera?.setFree?.(_fv); } catch (e) { frameCfg = null; }
      }
    }
    // a fresh raid if the bridge came up mid-night (after its cinematic)
    if (!pack.length && D.phase() === 'hunting' && nightStarted === false) {
      if (lateT < 0) lateT = 30;
      lateT -= dt;
      if (lateT <= 0) {
        lateT = -1; nightStarted = true;
        // (not in the small hours: they would only arrive to turn round)
        const tm = ctx.state.time;
        if (!(tm >= LATE_RAID_END_H && tm < 5.5)) { pick(); readBridge(); for (const k of pack) startCross(k); }
      }
    }
    // the prowl moves on
    prowlT += dt;
    if (prowlT > PROWL_SEC) { prowlT = 0; prowlI = (prowlI + 1) % PROWL.length; }
    // the map's threat dot: the middle of whoever is out and visible
    markT -= dt;
    if (markT <= 0) {
      markT = MARK_DT;
      let n = 0, sx = 0, sz = 0;
      let homeN = 0;
      for (const k of pack) {
        if (k.vis > 0.3 && (k.isl !== 'candy' || k.scripted)) {
          sx += k.x; sz += k.z; n++;
          if (k.raid === 'retreat' || k.raid === 'return' || k.raid === 'board' || k.raid === 'recross') homeN++;
        }
      }
      const ui = ctx.systems.ui;
      if (n && typeof ui?.addMapMarker === 'function') {
        mk.x = sx / n; mk.z = sz / n;
        mk.label = D.phase() === 'playful' || homeN * 2 >= n ? GANG_HOME : GANG;
        try { ui.addMapMarker(mk); markOn = true; } catch (e) { /* the map is optional */ }
      } else if (!n) removeMarker();
    }
  }
  function removeMarker() {
    if (!markOn) return;
    markOn = false;
    try { ctx.systems.ui?.removeMapMarker?.(mk.id); } catch (e) { /* optional */ }
  }
  /** Per kid, before its brain: a raider that has become a puddle or gone home
   *  in a huff is back on Candyland — its raid is over. */
  function pre(k) {
    if (!k.raid) return;
    if ((hits.absent(k) || hits.melting(k)) && !k.scripted && k.x < 0) endRaid(k, null);
  }

  // ── the eyes across the strait: one Points call ────────────────────────────
  const EYES = PACK * 2;
  const ePos = new Float32Array(EYES * 3), eA = new Float32Array(EYES);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  eGeo.setAttribute('aA', new THREE.BufferAttribute(eA, 1));
  eGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const eMat = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 5.0 * Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1) }, uCol: { value: new THREE.Color(0xcaff62) } },
    vertexShader: `
      attribute float aA; varying float vA; uniform float uSize;
      void main() { vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aA > 0.001 ? uSize : 0.0; }`,
    fragmentShader: `
      varying float vA; uniform vec3 uCol;
      void main() { vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; float a = smoothstep(1.0, 0.0, r); a = a * a * vA; if (a < 0.01) discard; gl_FragColor = vec4(uCol * (1.0 + (1.0 - r)), a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const eyes = new THREE.Points(eGeo, eMat);
  eyes.name = 'sourpatch-raid-eyes'; eyes.frustumCulled = false; eyes.visible = false; eyes.renderOrder = 5;
  ctx.scene.add(eyes);
  /** After the kids are posed: two pinpricks per raider out after dark, fading
   *  in with distance from the camera (up close the rig's own glow is the eye). */
  function post(nightMix, dt = 1 / 60) {
    let any = false;
    const cam = ctx.camera;
    // the night column on the deck is a row of dark shapes against the lit
    // rainbow — only the eyes and the grins burn (kids polisher r1); it takes
    // its colour back as it comes down off the arc (and the file home in the
    // small hours is the same shapes, until the sunrise gives it back)
    for (let j = 0; j < pack.length; j++) {
      const k = pack[j];
      const goal = k.scripted && k.raid !== 'fall' && nightMix > 0.5 ? DECK_SHADE + (1 - DECK_SHADE) * (1 - Math.min(1, (nightMix - 0.5) * 3)) : 1;
      if (k.rShade === goal) continue;
      const a = 1 - Math.exp(-dt * 2.2);
      k.rShade += (goal - k.rShade) * a;
      if (Math.abs(goal - k.rShade) < 0.004) k.rShade = goal;
      D.rig.shade?.(k.i, k.color, k.rShade);
    }
    for (let j = 0; j < PACK; j++) {
      const k = pack[j];
      for (let s = 0; s < 2; s++) {
        const q = (j * 2 + s);
        let a = 0;
        if (k && nightMix > 0.3 && k.vis > 0.5 && (k.isl !== 'candy' || k.scripted) && D.rig.eyePoint && D.rig.eyePoint(k.i, s, _ep)) {
          const dc = cam ? cam.position.distanceTo(_ep) : 60;
          a = Math.min(1, Math.max(0, (dc - 22) / 18)) * Math.min(1, (nightMix - 0.3) * 2) * k.vis;
          ePos[q * 3] = _ep.x; ePos[q * 3 + 1] = _ep.y; ePos[q * 3 + 2] = _ep.z;
        }
        eA[q] = a; if (a > 0.001) any = true;
      }
    }
    eyes.visible = any;
    if (any) { eGeo.attributes.position.needsUpdate = true; eGeo.attributes.aA.needsUpdate = true; }
  }

  // ── debug / render poses ───────────────────────────────────────────────────
  function applyPending(p) {
    const q = pending; pending = null;
    // (a pose is a fresh start: last view's meal, grudges and the night's
    // grace timer do not carry into this one — kids fixer r1)
    D.freshNight?.();
    for (const k of pack) { k.gaveUp = false; k.sated = false; }
    if (!pack.length) pick();
    readBridge();
    const f = Math.max(0, Math.min(1, q.f));
    // (the pose's own dice: a view frames the same pack whatever the views
    // before it rolled — kids fixer r3)
    const R = rng(hash('sourpatch-raid-pose-' + q.mode));
    for (const k of pack) {
      if (hits.melting(k)) continue;
      if (k.hurt) hits.clear(k);
      k.rFull = false;
      // (a render pose: already at the edge of the light, not two streets off)
      if (q.mode === 'hunt') { placeOnCat(k, p, onCat(p.x, p.z), 6.5, 5, R); k.vis = 1; continue; }
      if (bridgeMode !== 'api') { placeOnCat(k, p, onCat(p.x, p.z), 11, 8, R); k.vis = 1; continue; }
      // (a pose walks on at the natural pace of THE CLOCK)
      if (q.mode === 'home') {
        setScripted(k, 'recross'); k.state = 'raid';
        k.rs = S0 + (S1 - S0) * f + k.rord * GAP * 1.4;
        k.rV = homePace(k.rs, true);
        if (D.phase() === 'hunting') { k.slit = 1; k.browOut = 1; }
        else { k.slit = 0; k.browOut = 0; k.crouch = 0; }
        k.vis = 1;
      } else {
        setScripted(k, 'cross'); k.state = 'raid';
        k.rs = S0 + (S1 - S0) * f - k.rord * GAP;
        crossV = naturalCross(); k.rV = crossV;
        k.vis = k.rs >= S0 ? 1 : 0;
        if (D.phase() === 'hunting') { k.slit = 1; k.browOut = 1; }
      }
      pathAt(k.rs, k.rlane, _pt); k.x = _pt.x; k.z = _pt.z; k.ry = _pt.y; k.y = k.groundY = _pt.y; k.px = k.x; k.pz = k.z;
      k.yaw = k.desYaw = Math.atan2(_pt.tx * (q.mode === 'home' ? -1 : 1), _pt.tz * (q.mode === 'home' ? -1 : 1));
    }
    cue = true; nightStarted = true;
  }

  return {
    ring, respawn, landfall, pack, PACK,
    get on() { return on; },
    get bridgeMode() { return bridgeMode; },
    ringIn, wayTo,
    /** A raider on Cat Island that has given up (full of visitor, or hit once
     *  too often — hits.brain's 'gohome'): it huffs home over the rainbow —
     *  to the foot, up onto the deck in its turn, over, and out of its own
     *  front door (then sulks there, as at home) — not into the sea toward a
     *  front door on the other island. true = the raid has it. */
    goHome(k) {
      if (!k.raid) return false;
      if (k.scripted || k.raid === 'retreat' || k.raid === 'return') return true;   // (already on its way)
      if (k.raid !== 'hunt' || k.isl !== 'cat' || bridgeMode !== 'api' || PN < 2) return false;
      startRetreat(k, true); stat.huffs++;
      return true;
    },
    /** May this dawn walker cross the cats' salt? Near the pier, or already inside it. */
    ringFree(k) { return ringIn(k.x, k.z, 0.5) || dist2d(k.x, k.z, landfall.x, landfall.z) < RING_FREE_D; },
    enable, onPhase, dawn, afterDawn, brain, knock, pre, update, post, endAll, removeMarker,
    /** Raiders hunting on Cat Island right now (their slots come out of HUNT_CAP). */
    hunters(info) {
      if (!info.playerOnCat || D.phase() !== 'hunting') return 0;
      let n = 0;
      for (const k of pack) if (k.raid === 'hunt' && k.vis > 0.3 && !hits.absent(k) && !hits.melting(k) && !k.gaveUp) n++;
      return n;
    },
    /** Where the visitor is relative to the deck: true while he stands on it. */
    onDeck(p) {
      if (PN < 2 || bridgeMode !== 'api') return false;
      let bi = -1, bd = 9;
      for (let i = 0; i < PN; i += 2) { const d = (PX[i] - p.x) ** 2 + (PZ[i] - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }
      if (bi < 0) return false;
      return Math.abs((p.y ?? 0) - PY[bi]) < 2.2 && PY[bi] > world.height(p.x, p.z) + 1.0;
    },
    stats() {
      const modes = {};
      for (const k of pack) modes[k.raid] = (modes[k.raid] || 0) + 1;
      return { on, bridge: bridgeMode, pack: pack.length, modes, ...stat, laneDodges, routes, deck: +PLEN.toFixed(1), s0: +S0.toFixed(1), s1: +S1.toFixed(1),
        landfall: [+landfall.x.toFixed(1), +landfall.z.toFixed(1)], ring: [+ring.x.toFixed(1), +ring.z.toFixed(1), ring.r], marker: markOn,
        eyes: eyes.visible, salt: catSalt ? catSalt.stats() : null, enableMs: +enableMs.toFixed(1) };
    },
    debug: {
      /** Pose the pack: 'cross' (on the arc at fraction f, heading over),
       *  'home' (walking home over it at f), 'hunt' (round the visitor on Cat
       *  Island / at the prowl spot). Sets story rainbow_bridge and raises the
       *  bridge (debugRaise) if it is down. Applied on the next update, once
       *  the phase the clock was set to has begun. opts.frame {dist, el, az,
       *  fov, dy}: a free camera follows the pack's middle (render views). */
      raid(mode = 'cross', f = 0.5, opts = null) {
        frameCfg = opts && opts.frame ? opts.frame : null;
        try { if (!ctx.systems.story?.get?.('rainbow_bridge')) ctx.systems.story?.set?.('rainbow_bridge', true); } catch (e) { /* optional */ }
        const b = bridgeObj();
        try { if (b && !b.up && typeof b.debugRaise === 'function') b.debugRaise(true); } catch (e) { console.warn('[sourpatch/raid] debugRaise', e?.message || e); }
        enable();
        const tm = ctx.state.time;
        // (the phase the clock gives — the dusk rite runs to ≈ 21:42: sourpatch.js clockPhase)
        const ph = typeof D.phaseAt === 'function' ? D.phaseAt(tm) : ((tm < 5.5 || tm > 19.5) ? 'hunting' : (tm >= 18.5 && tm <= 19.5 ? 'watching' : 'playful'));
        pending = { mode, f, phase: ph };
        return true;
      },
      path() { readBridge(); const out = []; for (let i = 0; i < PN; i += 8) out.push([+PX[i].toFixed(1), +PY[i].toFixed(1), +PZ[i].toFixed(1)]); return { mode: bridgeMode, len: PLEN, s0: S0, s1: S1, pts: out }; },
    },
  };
}
