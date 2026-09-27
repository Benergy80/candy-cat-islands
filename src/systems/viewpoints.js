// ─────────────────────────────────────────────────────────────────────────────
// VIEWPOINTS — "Take in the view" (WAVE 5, docs/BRIEF.md Contract Q).
// Ben: "Don't have the view shift to the moon every night it interrupts the
// player. Instead there can be more places to take in the view."
//
// Ten viewing benches, five on each island, each with a brass tourist viewer
// on a post and a plaque on the post ("TAKE IN THE VIEW · <the place>").
// Walk up, E: the visitor sits, the HUD steps aside, and the camera eases into
// an 8 s pan authored for that bench — camera.cinematic() with its framing
// fields rewritten every frame, so the lens PANS across the view instead of
// holding one picture. When the moon is up and the bench can see it, the pan
// ends on the moon (or, when it rides too high to share the frame with him, on
// its bearing: its path on the water, him and the horizon in); by day, once the
// rainbow bridge exists, benches that face the strait end on its arc. His head
// and the horizon never leave the letterboxed band, and his through-geometry
// silhouette is off while he sits (an authored shot frames him in the open).
// Any key / click / tap / stick stands you up and the camera eases home. The
// first sit of the session toasts "Sit. Look."
//
// Budget: 2 draw calls for all ten benches (one merged vertex-coloured body,
// one merged plaque-face mesh on a single canvas atlas), ≈7.2k triangles.
// Each bench is FITTED (resolve → fits): the authored point first, then rings
// out to 3.5 u, until the seat, its post, the step off it and a way up are
// level and clear of solids / low props / water, and no other prompt's disc
// shares ground he can REACH from the seat at its level (Contract O; contest()).
// The fit runs at create() and again at 'world:ready', when the architecture's
// doors and knockers, the ferry's gangway (both landings) and the ride pads have
// registered. A spot that fits nowhere is left out (viewpoints.unplaced says why).
// Every bench is a Contract A LOW PROP (seat h 0.5: you can step onto it) and
// its viewer post is solid; while you sit the seat's collider is neutralised
// (so the seat does not lift you onto its top) and restored once you step off.
//
// API — ctx.systems.viewpoints
//   spots               [{ id, name, island, x, y, z, face }] (a copy) · meshes (QA: the two meshes)
//   active              id of the bench being sat on, or null · t (s into it)
//   view(id) → bool     sit + look, exactly as E at the bench (views / debug)
//   stop()              stand up now (the camera eases home)
//   goto(id)            debug: teleport beside the bench, on its own floor (decks too) + camera.snap() · lastGoto (QA: the tries)
//   add(spec) / move(id, spec) → bool   hand a spot over (e.g. the lighthouse
//                       gallery, WAVE 5 "lighthouse"): rebuilds the two meshes,
//                       moves the collider, the prompt and the map marker
//   shotAt(id, t) → { lens:[x,y,z], look:[x,y,z], fov, moon, rainbow }  (QA; allocates)
//   audit() → [{ id, x, z, fitted, floor, near: [prompts within reach], clearFront, clearBack }]  (QA)
//   unplaced → [{ id, why: { level, 'solid:seat|post|step', prop, way, deck, path, river, water, 'prompt:<id>' } }]  (QA)
//   obstacles → [{ id, x, z, r, moving }]   the other prompts the fit counts (QA; allocates)
//   fitAt(id, x, z, look?, extra?, map?) → { ok, why, face, floor, map? }   would the bench fit there (QA)
//   debugSpot(id)       the LIVE bench record — its shot fields may be edited for tuning (QA)
//   events: 'viewpoint:start' { id } · 'viewpoint:end' { id, why }
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep } from '../core/util.js';

const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const ease = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

// ── the shot's clock (seconds) ───────────────────────────────────────────────
const T_IN = 1.8, T_HOLD = 4.4, T_OUT = 1.8, T_ALL = T_IN + T_HOLD + T_OUT;   // 8.0 s
const GRACE = 0.5;           // a press this soon after E is the E itself (or a double tap), not "take me back"
const SIT_T = 0.55;          // the slide onto the seat
const STEP_T = 0.32;         // the step off it, forward, as he stands
const STEP_D = 0.74;         // …this far (seat half-depth 0.25 + his radius 0.36 + a margin)
const HEAD = 1.3;            // the seated visitor's head above his feet (sit pose: hips 0.54)
const HUD_AT = 0.3;          // the HUD steps aside this far in (2.3 s the first time: the toast gets read)
const PROMPT_R = 2.3;
const PROMPT_PAD = 0.4;      // our prompt disc, padded by this, may share no standable ground with another prompt's disc (Contract O)
const BAND = 0.85;           // the letterbox leaves this share of the frame's height (7.5% bars top and bottom)
const LEVEL_TOL = 1.5;       // the prompt only answers within this height of the seat (galleries over floors)
const LENS_GROUND = 1.75;    // the camera keeps its lens ≥ terrain + 1.6 (camera.js ground clamp); stay just above that
// The frame's band (rad, from the lens axis): his head sits at −pitch from the axis (the lens lookAt()s it,
// then pitches up), the horizon at el − pitch, the moon at alt − (pitch − el). What each needs of the band:
const HEAD_M = 0.1;          // his head + hat, clear of the letterbox's bottom edge
const HORIZON_M = 0.05;      // the horizon, likewise (all an `ahead` bench, which frames the view without him, needs)
const MOON_TOP = 0.13;       // the moon disc (r 0.067) + a little sky, under the band's top edge
const FOV_MOON = 72;         // the widest lens a moon ending may open to (the moon rides up to 53°: past ≈ 0.7 it goes moonward)

// ── the benches ──────────────────────────────────────────────────────────────
// x, z   the seat's centre (where he sits; his feet reach 0.3 forward)
// y      a DECK hint (the walkable whose height is nearest wins) · omitted = the ground
// look   the world point the bench faces (the view's centre)
// pan    [from, to] rad added to the look bearing over the 8 s (+ = clockwise seen from above… it is just a yaw)
// side   the lens's yaw off "straight behind him" (rad): galleries and balconies look ACROSS him
// dist / el / tilt / fov   lens distance from his head, its elevation above it, the lens axis's own
//        elevation (pitch = el + tilt), the lens in degrees
// post   which end of the bench the viewer post stands (+1 his left, −1 his right)
// moon / rainbow   may the pan end on the moon (night) / the rainbow bridge (day, once raised)
// promptZ  where the prompt's centre sits along the bench's facing (local z; default −0.2, just behind the
//        seat) — the gallery pushes it out to the rail so no point of its disc is nearer the tower's own
//        "Look out from the tower" prompt at the stairwell's centre
// levelTol  the prompt answers only this near the seat's height (default LEVEL_TOL)
// tight / stepD  a narrow deck (a gallery, a balcony between the cake and its rail): the seat is checked at
//        its own depth and he steps off it a shorter way (stepD, default STEP_D)
// moonReach  how far (rad) off the natural look the pan may swing to end on the moon (default 1.8)
// ahead  the shot's target sits this far out along the look instead of on his head, so the lens (dist < ahead)
//        stands IN FRONT of him and frames the view alone — for a seat inside something (the cupcake's frosting)
const SPOTS = [
  // ── the Candy Kingdom ──────────────────────────────────────────────────────
  {
    id: 'peak', island: 'candy', name: 'Frosting Peak', sub: 'the lookout gallery · 214 steps',
    line: 'The forest, the lake, the edge of the Kingdom. From up here the Sourlings look like sprinkles.',
    // on the gallery's west side between two pillars (they stand at radius 3.5 on the diagonals), facing
    // out. The walk is 1.5 wide, so the lens looks along it: it stands OUTSIDE the rail and under the eaves
    // (radius ≈ 7.5 · deck + 1.6, the eaves are 5.7 · deck + 2.4), north of him, looking south over the lake;
    // the pan turns toward the village (inward, so the lens swings further out, never in under the roof).
    // The prompt sits out at the rail (promptZ) and answers only on the gallery (levelTol): the stair's top
    // turn and the tower's own lookout prompt at the stairwell's centre are never shared
    x: -185.10, z: -56.46, y: 33.74, look: [-377.2, -0.9], promptZ: 0.85, levelTol: 0.8, tight: true, stepD: 0.55, pan: [0, 0.3], side: 1.27,
    dist: 7.0, el: 0.04, tilt: 0, fov: 50, post: 1, moon: false,
  },
  {
    id: 'cupcake', island: 'candy', name: 'The Great Cupcake', sub: 'the summit balcony',
    line: 'Ten units of cake underneath you. It is still warm.',
    // on the west balcony, well clear of the front door (its knocker, its prompt and the slingshot pickup
    // below all answer in plan distance: ≥ 9 u away here). The frosting collar hangs over the whole walk
    // at head height, so no lens outside it can see him sitting in it: this one frames the VIEW, from just
    // in front of him and outside the frosting (ahead), over the rail to the palace and Frosting Peak.
    // Between the cake-flank rail (radius 8.82) and the outer rail (10.18) the walk is 1.1 clear: the seat's
    // centre sits at 9.3 (measured), he steps 0.3 off it, and the lens (ahead − dist = 1.8 out) is past the rail
    x: -97.03, z: -15.77, y: 15.65, look: [-291, 32], tight: true, stepD: 0.3, pan: [0.35, -0.5], side: 0, ahead: 4.0,
    dist: 2.2, el: 0.15, tilt: -0.12, fov: 52, post: -1,
  },
  {
    id: 'pier', island: 'candy', name: 'Sugar Pier', sub: 'along the pier',
    line: 'The strait, the ferry, and an island of cats pretending not to wave.',
    // on the north rail of the pier's neck, looking down its length at the ferry and the strait — ≈ 9.8 u
    // from the gangway's landing, so the two prompts never share a plank (Contract O). The lens stands
    // close over his shoulder and IN FRONT of the lamp standards (x −41, either rail), so they stand beside
    // and behind the lens instead of across the frame, looking down the pier
    // (a moon more than 0.8 off the pier's line would swing the lens out past the rail among the lamp standards)
    x: -39.6, z: 20.2, y: 5.2, look: [80, 20.2], pan: [-0.25, 0.25], side: 0.35, moonReach: 0.8,
    dist: 3.2, el: 0.45, tilt: -0.12, fov: 54, post: -1, rainbow: true,
  },
  {
    id: 'palace', island: 'candy', name: 'The Candy Palace', sub: 'across the syrup river',
    line: 'Built for a King who likes to be looked at. Look at it. It is watching to see if you do.',
    // the field this side of the river is thick with gummy-bear trees and canes: the lens stands CLOSE over
    // his shoulder (nothing between it and him) and swings a little left, off the orange bear-tree
    x: -166, z: -16, look: [-150, -36], pan: [-0.35, 0.1], side: -0.2,
    dist: 3.4, el: 0.35, tilt: 0.1, fov: 60, post: 1,
  },
  {
    id: 'delta', island: 'candy', name: 'Syrup Delta', sub: 'where the river gives up',
    line: 'The syrup river meets the sea here. Neither of them will say who won.',
    // on the beach west of the mouth, looking at the MOUTH (the old shot faced the open sea). The syrup runs
    // sunk between its banks, invisible from eye height, so the lens stands high and looks down into it; the
    // pan runs from the river's last reach out to where it meets the sea. Away from the mint canes of the west
    // bank (decor without colliders, which the fit cannot see: from −106.8, 70.4 they filled the frame)
    x: -111.5, z: 81, look: [-92, 90], pan: [0.35, -0.25], side: 0.0,
    dist: 7.0, el: 0.5, tilt: -0.2, fov: 54, post: 1,
  },
  // ── Cat Island ─────────────────────────────────────────────────────────────
  {
    id: 'heights', island: 'cat', name: 'Whisker Heights', sub: 'the green · Mrs. Bramble',
    line: 'She was facing the other way this morning.',
    x: 183.7, z: 52.8, look: [185, 48.25], pan: [-0.35, 0.35], side: 0.0,
    dist: 8.0, el: 0.26, tilt: 0.06, fov: 54, post: -1, moon: false,
  },
  {
    id: 'watch', island: 'cat', name: 'The Watchtower', sub: 'the headland',
    line: 'Open sea, all the way to the edge. Nobody has ever checked the edge.',
    x: 224, z: 17, look: [300, -10], pan: [-0.4, 0.4], side: 0.0,
    dist: 7.2, el: 0.22, tilt: -0.05, fov: 46, post: 1,
  },
  {
    id: 'cove', island: 'cat', name: 'Smuggler\'s Cove', sub: 'the lookout rock',
    line: 'A good rock for watching boats leave. None have.',
    x: 241.5, z: 47.5, look: [300, 62], pan: [-0.4, 0.4], side: 0.0,
    dist: 7.2, el: 0.22, tilt: -0.05, fov: 46, post: -1,
  },
  {
    id: 'harbor', island: 'cat', name: 'Fish Harbor', sub: 'the harbour wall',
    line: 'The Candy Kingdom, far off across the water. It looks smaller from here. It is not.',
    x: 88, z: 61, y: null, look: [-40, 30], pan: [-0.35, 0.45], side: 0.0,
    dist: 7.2, el: 0.22, tilt: -0.05, fov: 46, post: 1, rainbow: true,
  },
  {
    id: 'arrivals', island: 'cat', name: 'Arrivals Pier', sub: 'the shore by the pier',
    line: 'The Candy Kingdom, just there. Close enough to swim. The cats have thought of that.',
    // on the shore north of the pier's root, looking across the strait (the deck itself is all the arch's,
    // the population sign's, the departures board's and the gangway's: Contract O, one prompt a plank)
    x: 41, z: 11, look: [-60, 18], pan: [-0.35, 0.35], side: 0.2,
    dist: 7.0, el: 0.22, tilt: -0.04, fov: 48, post: 1, rainbow: true,
  },
];

// Candy / Cat material language (vertex colours)
const STYLE = {
  candy: {
    slat: [0xf7a8c8, 0xfff2f7, 0xf7a8c8], leg: 0x7a4a2a, foot: 0x5a3320,
    post: [0xe8343f, 0xfff6fa], base: 0x7a4a2a, head: 0x7fe0c4, headTrim: 0xfff6fa, barrel: 0x2a1a24, plate: 0xf2c14e,
  },
  cat: {
    slat: [0xa8703f, 0xbd8550, 0xa8703f], leg: 0x2d2a33, foot: 0x23212a,
    post: [0x2d2a33, 0x3a3642], base: 0x6f6658, head: 0xd9a441, headTrim: 0xf2d27a, barrel: 0x2d2a33, plate: 0xd9a441,
  },
};
const SEAT = { w: 1.5, d: 0.5, h: 0.5 };
const PLATE = { w: 0.64, h: 0.32 };
const ATLAS = { cols: 4, rows: 4, cw: 256, ch: 128 };

export function create(ctx) {
  const world = ctx.world;
  ctx.colliders = ctx.colliders || [];
  const sys = () => ctx.systems;

  // ── spots: resolve heights, facings, colliders ──────────────────────────────
  const spots = [];
  let pendingRestore = null;     // the seat collider to re-arm once he is clear of it
  // Decks answer by REACHABILITY (candy architecture, the tower stairs: a deck only counts when the
  // visitor's feet are near its level), so ask as if he were standing there: his y is lent to the
  // question for the length of the call and put straight back.
  const floorAt = (x, z, hint) => {
    const pl = sys().player, pp = pl?.position;
    const y0 = pp ? pp.y : 0;
    if (pp) pp.y = hint != null ? hint : world.height(x, z) + 0.3;
    let h;
    try {
      h = pl?.groundHeight ? pl.groundHeight(x, z) : world.height(x, z);
      if (hint != null && Array.isArray(ctx.walkables)) {
        let best = h, bd = Math.abs(h - hint);
        for (const w of ctx.walkables) {
          if (!w?.test) continue;
          let t; try { t = w.test(x, z); } catch (e) { t = null; }
          if (typeof t === 'number' && t === t && t < 1e6 && Math.abs(t - hint) < bd) { bd = Math.abs(t - hint); best = t; }
        }
        h = best;
      }
    } finally { if (pp) pp.y = y0; }
    return h;
  };
  function orient(s, x, z) {
    s.x = x; s.z = z;
    s.face = Math.atan2(s.look[0] - x, s.look[1] - z);                   // bearing he faces: forward = (sin, cos)
    s.fx = Math.sin(s.face); s.fz = Math.cos(s.face);
    s.rx = Math.cos(s.face); s.rz = -Math.sin(s.face);                   // bench +x (local) in world
  }
  const _gi = {};
  /** Is the bench, its post, the step off it and a way up to it all clear and level here? */
  function fits(s, x, z) {
    const pl = sys().player;
    orient(s, x, z);
    const hint = s.y;
    const why = s.why || (s.why = {});
    const no = (k) => { why[k] = (why[k] || 0) + 1; return false; };
    const f0 = floorAt(x, z, hint);
    if (hint != null && Math.abs(f0 - hint) > 0.45) return no('deck');   // (a mezzanine 0.7 under a balcony is another floor)
    // Rails and the props under a balcony are solid only to a walker at THEIR level (live rules on
    // `solid` that read his height), so every check below is asked as if he stood at the bench's floor
    const pp = pl?.position, y0 = pp ? pp.y : 0;
    if (pp) pp.y = f0;
    try { return fitsAt(s, x, z, pl, hint, f0, no); } finally { if (pp) pp.y = y0; }
  }
  function fitsAt(s, x, z, pl, hint, f0, no) {
    if (hint == null && world.onPath && world.onPath(x, z, 0.9)) return no('path');
    // the syrup river's bed is flat, dry to groundInfo and carved below its banks: never a seat in it
    if (hint == null && world.riverDist && x < 0 && world.riverDist(x, z) < (world.RIVER?.width ?? 5.5)) return no('river');
    const pd = (SEAT.w / 2 + 0.3) * (s.post || 1);
    const L = (lx, lz) => [x + s.rx * lx + s.fx * lz, z + s.rz * lx + s.fz * lz];
    const sd = s.stepD ?? STEP_D, sr = s.tight ? 0.27 : 0.34;   // a tight deck (a gallery, a balcony): a shorter step, the seat's own depth
    const level = [[-0.75, -0.25], [0.75, -0.25], [-0.75, 0.25], [0.75, 0.25], [0, 0.45], [pd, 0], [0, sd]];
    const tol = hint == null ? 0.28 : 0.16;          // a hillside may lean a little (the legs reach 0.4 down); a deck may not
    for (const [lx, lz] of level) {
      const [px, pz] = L(lx, lz);
      if (Math.abs(floorAt(px, pz, hint) - f0) > tol) return no('level');
      if (pl?.groundInfo) {
        pl.groundInfo(px, pz, _gi);
        if (_gi.prop) return no('prop');                                   // a crate, a kerb, somebody's bench
        if (hint == null && _gi.water) return no('water');
      }
    }
    if (pl?.pushOut) {
      const solid = [[-0.6, 0, sr, 'seat'], [0, 0, sr, 'seat'], [0.6, 0, sr, 'seat'], [pd, 0, 0.26, 'post'], [0, sd, s.tight ? 0.26 : 0.3, 'step']];
      for (const [lx, lz, r, k] of solid) { const [px, pz] = L(lx, lz); if (pl.pushOut(px, pz, r).hit) return no('solid:' + k); }
      // a way up to it: from behind, or round either end
      let way = false;
      for (const [lx, lz] of [[0, -1.25], [-(SEAT.w / 2 + 0.6) * (s.post || 1), -0.2], [0, sd + 0.8], [0, sd]]) {
        const [px, pz] = L(lx, lz);
        if (!pl.pushOut(px, pz, 0.4).hit && Math.abs(floorAt(px, pz, hint) - f0) < 0.5) { way = true; break; }
      }
      if (!way) return no('way');
    }
    // no other prompt may share the bench's (the smoothie-stand lesson, Contract O): see contest()
    const other = contest(s, x, z, f0, hint);
    if (other) return no('prompt:' + other);
    return true;
  }
  // ── the other prompts (Contract O: one prompt per spot) ──────────────────────
  // interaction.js answers the NEAREST enabled entry in PLAN distance — a door knocker ten units under a
  // balcony wins on the balcony — so every other prompt counts, whatever its level. They are gathered
  // once per fitting pass: at create() (what exists then) and again at 'world:ready', when the
  // architecture's doors and knockers, the ferry's gangway and the ride pads have registered. getPos
  // entries count where they are anchored (a pickup, a door threshold, a parked ride, a fixed lookout);
  // the roaming ones ("Talk to …": Sourlings, cats, creatures) and the island-wide ones (r > 8, the
  // scruff-carry skip) do not. The ferry's gangway moves with her: BOTH landings count.
  let promptObs = [];
  // where interaction.js would see entry o with the visitor standing at (px, pz): a getPos entry answers
  // for where HE is (a pickup leans 0.9 u toward him, a door reports the nearest point of its threshold,
  // the tower's lookout its centre whatever x/z it registered), so ask it as if he stood there
  const _at = { x: 0, z: 0 };
  function posOf(o, px, pz) {
    if (!o.get) { _at.x = o.x; _at.z = o.z; return _at; }
    const pp = sys().player?.position;
    const x0 = pp?.x, z0 = pp?.z;
    if (pp) { pp.x = px; pp.z = pz; }
    let q = null;
    try { q = o.get(); } catch (e) { q = null; } finally { if (pp) { pp.x = x0; pp.z = z0; } }
    if (q && Number.isFinite(q.x) && Number.isFinite(q.z)) { _at.x = q.x; _at.z = q.z; } else { _at.x = o.x; _at.z = o.z; }
    return _at;
  }
  function gatherPrompts() {
    const out = [], I = sys().interaction;
    if (I?.items) for (const e of I.items.values()) {
      if (e.viewpoint || e.id === 'ferry_gangway') continue;
      const r = e.r ?? 2.6;
      if (!(r > 0) || r > 8) continue;
      if (e.getPos && /^Talk to\b/.test(e.label || '')) continue;
      let x = e.x, z = e.z;
      if (e.getPos) { let p = null; try { p = e.getPos(); } catch (err) { p = null; } if (p && Number.isFinite(p.x)) { x = p.x; z = p.z; } }
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 5e4) continue;
      out.push({ id: e.id, x, z, r, get: e.getPos || null });
    }
    const F = sys().ferry, gr = I?.items?.get?.('ferry_gangway')?.r ?? 3.6;
    if (F?.docks) for (const k of Object.keys(F.docks)) {
      const d = F.docks[k];
      if (Number.isFinite(d?.landX) && Number.isFinite(d?.z)) out.push({ id: 'ferry_gangway', side: k, x: d.landX, z: d.z, r: gr, get: null });
    }
    return out;
  }
  /**
   * The first other prompt whose disc shares REACHABLE ground with ours (padded by PROMPT_PAD), or null.
   * A flood fill from the seat over a 0.45 u grid, at the seat's own level (± LEVEL_TOL: where our prompt
   * answers), stopped by solids, water and anything more than a step (0.7) up or down: ground he cannot
   * get to from the bench — the sea past a rail, a stairwell behind its railing, the floor ten units under
   * a balcony, the far side of a wall — is ground nobody presses E on, so it does not count.
   */
  const CELL = 0.45;
  function contest(s, x, z, f0, hint, dbg) {
    const po = s.promptZ ?? -0.2;
    const qx = x + s.fx * po, qz = z + s.fz * po, R = PROMPT_R + PROMPT_PAD;
    let near = null;
    for (const o of promptObs) {
      const p = posOf(o, qx, qz);                     // (a getPos entry: where it answers for a visitor here, ± a threshold's length)
      if (Math.hypot(p.x - qx, p.z - qz) < R + o.r + (o.get ? 2.5 : 0)) (near || (near = [])).push(o);
    }
    if (!near) return null;
    const pl = sys().player;
    const N = Math.ceil((R + 1.2) / CELL), W = 2 * N + 1;
    const state = new Uint8Array(W * W), hgt = new Float32Array(W * W);   // 0 unseen · 1 open · 2 shut (load time only)
    const cx = (i) => qx + (i - N) * CELL, cz = (j) => qz + (j - N) * CELL;
    const look = (k) => {
      if (state[k]) return state[k] === 1;
      const i = k % W, j = (k - i) / W, px = cx(i), pz = cz(j);
      const h = floorAt(px, pz, hint);
      let open = Math.abs(h - f0) < (s.levelTol ?? LEVEL_TOL) && !(pl?.pushOut && pl.pushOut(px, pz, 0.33).hit);
      if (open && hint == null && pl?.groundInfo) { pl.groundInfo(px, pz, _gi); if (_gi.water) open = false; }
      hgt[k] = h; state[k] = open ? 1 : 2;
      return open;
    };
    const seen = new Uint8Array(W * W), queue = [];
    for (const [lx, lz] of [[0, 0], [0, s.stepD ?? STEP_D], [0, -0.9], [-(SEAT.w / 2 + 0.6) * (s.post || 1), 0]]) {
      const i = Math.round((x + s.rx * lx + s.fx * lz - qx) / CELL) + N, j = Math.round((z + s.rz * lx + s.fz * lz - qz) / CELL) + N;
      if (i < 0 || j < 0 || i >= W || j >= W) continue;
      const k = j * W + i;
      if (!seen[k] && look(k)) { seen[k] = 1; queue.push(k); }
    }
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q], i = k % W, j = (k - i) / W, px = cx(i), pz = cz(j);
      if ((px - qx) * (px - qx) + (pz - qz) * (pz - qz) < R * R) {
        for (const o of near) { const p = posOf(o, px, pz); if (Math.hypot(p.x - px, p.z - pz) < o.r) {
          if (!dbg) return o.id + (o.side ? '@' + o.side : '');
          dbg.hits = dbg.hits || []; dbg.hits.push([+px.toFixed(2), +pz.toFixed(2), +hgt[k].toFixed(2), o.id]); state[k] = 3;
        } }
      }
      for (let d = 0; d < 4; d++) {
        const ii = i + (d === 0 ? 1 : d === 1 ? -1 : 0), jj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (ii < 0 || jj < 0 || ii >= W || jj >= W || (ii - N) * (ii - N) + (jj - N) * (jj - N) > N * N) continue;
        const kk = jj * W + ii;
        if (seen[kk] || !look(kk) || Math.abs(hgt[kk] - hgt[k]) > 0.7) continue;
        seen[kk] = 1; queue.push(kk);
      }
    }
    if (dbg) {   // QA: the grid, north (−z) up — '#' shut, '.' open but unreached, 'o' reached, 'X' reached inside another's disc
      dbg.rows = [];
      for (let j = 0; j < W; j++) { let row = ''; for (let i = 0; i < W; i++) { const k = j * W + i; row += state[k] === 3 ? 'X' : seen[k] ? 'o' : state[k] === 2 ? '#' : state[k] === 1 ? '.' : ' '; } dbg.rows.push(row); }
      dbg.origin = [+cx(0).toFixed(2), +cz(0).toFixed(2)]; dbg.cell = CELL; dbg.near = near.map((o) => o.id);
      return dbg.hits ? dbg.hits[0][3] : null;
    }
    return null;
  }
  function resolve(spec, slot) {
    const s = { ...spec, slot };
    const x0 = s.x, z0 = s.z;
    // FIT: the authored point first, then rings round it (≤ 3.5 u) — the first place that fits wins,
    // so a crate or a lamp another builder moves later nudges the bench instead of burying it
    s.fitted = null;
    search: for (let r = 0; r <= 3.5; r += 0.5) {
      const n = r === 0 ? 1 : 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        if (fits(s, x, z)) { s.fitted = [+(x - x0).toFixed(2), +(z - z0).toFixed(2)]; break search; }
      }
    }
    if (!s.fitted) { orient(s, x0, z0); s.unplaced = true; }
    s.floor = floorAt(s.x, s.z, s.y);
    const pd = (SEAT.w / 2 + 0.3) * (s.post || 1);
    s.px = s.x + s.rx * pd; s.pz = s.z + s.rz * pd;
    // colliders: the seat is a LOW PROP (Contract A relative h), the viewer post is solid
    s.col = { x: s.x, z: s.z, w: SEAT.w + 0.08, d: SEAT.d + 0.06, rot: -s.face, h: SEAT.h, box: true, id: 'view_seat_' + s.id };
    s.colPost = { x: s.px, z: s.pz, r: 0.2, id: 'view_post_' + s.id };
    return s;
  }
  // a spot that fits nowhere near its authored point is left out (reported by audit()), never forced into a wall
  const unplaced = [];
  const specs = SPOTS.map((sp) => ({ ...sp }));   // the authored table + add() / move() hand-overs
  /** Retire a bench's two colliders the way builders do (parked off-world: the ground hash skips them). */
  function retire(s) {
    s.col.h = -100; s.col.x = s.col.z = 1e6; s.colPost.x = s.colPost.z = 1e6;
    s.col.id = 'view_retired_seat'; s.colPost.id = 'view_retired_post';
    if (pendingRestore === s.col) pendingRestore = null;
  }
  /** Fit every bench from its spec (the whole table, one pass) and hand the colliders to ctx.colliders. */
  function placeAll() {
    for (const s of spots) retire(s);              // our own seats and posts must not stop us fitting
    spots.length = 0; unplaced.length = 0;
    promptObs = gatherPrompts();
    for (const sp of specs) {
      const s = resolve(sp, spots.length);
      if (s.unplaced) unplaced.push({ id: sp.id, why: s.why }); else spots.push(s);
    }
    // fresh collider objects, APPENDED (the ground hash bins appends at once; moving the old ones in
    // place would wait on its rolling validator — a bench you could walk through for a few seconds)
    for (const s of spots) ctx.colliders.push(s.col, s.colPost);
  }
  // At create(): what is registered now (so the colliders exist for everyone's world:ready) …
  placeAll();

  // ── meshes: ONE body (vertex colours) + ONE plaque-face mesh (atlas) ─────────
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
  const atlasCv = document.createElement('canvas');
  atlasCv.width = ATLAS.cols * ATLAS.cw; atlasCv.height = ATLAS.rows * ATLAS.ch;
  const atlasTex = new THREE.CanvasTexture(atlasCv);
  atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4;
  const faceMat = new THREE.MeshStandardMaterial({
    map: atlasTex, emissiveMap: atlasTex, emissive: 0xffffff, emissiveIntensity: 0.05,
    roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const body = new THREE.Mesh(new THREE.BufferGeometry(), bodyMat);
  const faces = new THREE.Mesh(new THREE.BufferGeometry(), faceMat);
  body.name = 'viewpoints_benches'; faces.name = 'viewpoints_plaques';
  body.castShadow = true; body.receiveShadow = true; faces.receiveShadow = true;
  ctx.scene.add(body, faces);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  function part(list, geo, color, s, lx, ly, lz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    // local (lx, ly, lz) in the bench frame (+z = the way he faces) → world
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    _e.set(rx, ry + s.face, rz, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(s.x + s.rx * lx + s.fx * lz, s.floor + ly, s.z + s.rz * lx + s.fz * lz);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    _c.setHex(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    list.push(g);
  }
  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl8: new THREE.CylinderGeometry(1, 1, 1, 8, 1),
    cyl12: new THREE.CylinderGeometry(1, 1, 1, 12, 1),
    sph: new THREE.SphereGeometry(1, 10, 7),
  };
  function benchParts(list, s) {
    const S = STYLE[s.island] || STYLE.candy, cat = s.island === 'cat';
    // seat: three slats, top at 0.5
    for (let i = 0; i < 3; i++) part(list, GEO.box, S.slat[i], s, 0, 0.445, -0.17 + i * 0.17, 0, 0, 0, SEAT.w, 0.11, 0.155);
    // two chunky end legs (chocolate bars / cast iron), a stretcher between them
    for (const sx of [-1, 1]) {
      const deep = s.y == null ? 0.42 : 0.12;         // on a hillside the legs reach down to the low side
      part(list, GEO.box, S.leg, s, sx * (SEAT.w / 2 - 0.16), (0.4 - deep) / 2, 0, 0, 0, 0, 0.16, 0.4 + deep, 0.46);
      part(list, GEO.box, S.foot, s, sx * (SEAT.w / 2 - 0.16), 0.0, 0, 0, 0, 0, 0.24, 0.1, 0.56);
      if (cat) part(list, GEO.box, S.leg, s, sx * (SEAT.w / 2 - 0.16), 0.3, 0, Math.PI / 4, 0, 0, 0.1, 0.16, 0.16);   // a scroll knuckle
    }
    part(list, GEO.box, S.leg, s, 0, 0.14, 0, 0, 0, 0, SEAT.w - 0.3, 0.07, 0.08);
    if (!cat) for (const sx of [-1, 1]) part(list, GEO.sph, 0xfff2f7, s, sx * (SEAT.w / 2 - 0.02), 0.5, 0, 0, 0, 0, 0.09, 0.07, 0.09);   // gumdrop finials
    // the viewer post: a candy cane / an iron column, on a round base
    const px = (SEAT.w / 2 + 0.3) * (s.post || 1);
    part(list, GEO.cyl12, S.base, s, px, s.y == null ? -0.12 : 0.0, 0, 0, 0, 0, 0.24, s.y == null ? 0.44 : 0.2, 0.24);
    const segs = 6, H = 1.02;
    for (let i = 0; i < segs; i++) {
      part(list, GEO.cyl8, S.post[i % 2], s, px, 0.1 + (i + 0.5) * (H / segs), 0, 0, 0, 0, 0.075, H / segs + 0.002, 0.075);
    }
    // the viewer head: body, a sun hood, two lens barrels forward, two eyepieces back — pitched down at the view
    const hy = 0.1 + H + 0.18, tilt = 0.14;          // + = the lenses dip toward the view
    const HX = (lx, ly, lz) => [px + lx, hy + ly * Math.cos(tilt) - lz * Math.sin(tilt), ly * Math.sin(tilt) + lz * Math.cos(tilt)];
    part(list, GEO.box, S.barrel, s, px, 0.1 + H + 0.03, 0, 0, 0, 0, 0.12, 0.1, 0.12);          // the yoke
    { const [a, b, c] = HX(0, 0, 0); part(list, GEO.box, S.head, s, a, b, c, tilt, 0, 0, 0.5, 0.28, 0.32); }
    { const [a, b, c] = HX(0, 0.16, 0.03); part(list, GEO.box, S.headTrim, s, a, b, c, tilt, 0, 0, 0.54, 0.05, 0.4); }
    for (const sx of [-1, 1]) {
      { const [a, b, c] = HX(sx * 0.11, -0.01, 0.2); part(list, GEO.cyl8, S.barrel, s, a, b, c, tilt + Math.PI / 2, 0, 0, 0.085, 0.14, 0.085); }
      { const [a, b, c] = HX(sx * 0.11, -0.01, 0.28); part(list, GEO.cyl8, S.headTrim, s, a, b, c, tilt + Math.PI / 2, 0, 0, 0.07, 0.03, 0.07); }
      { const [a, b, c] = HX(sx * 0.09, 0.03, -0.19); part(list, GEO.cyl8, S.barrel, s, a, b, c, tilt + Math.PI / 2, 0, 0, 0.05, 0.1, 0.05); }
    }
    // the plaque: a gold-framed lectern plate on the post's back, tilted up to whoever walks up behind the bench
    const pa = 0.95;                                   // lean (rad): the plate's back face looks up and back
    const plY = 0.78, plZ = -0.17;
    part(list, GEO.box, S.plate, s, px, plY, plZ, pa, 0, 0, PLATE.w + 0.08, PLATE.h + 0.08, 0.05);
    part(list, GEO.box, S.barrel, s, px, plY - 0.02, plZ + 0.08, pa, 0, 0, 0.08, 0.14, 0.1);   // its bracket
    s.plate = { lx: px, ly: plY, lz: plZ, pa };
  }
  function faceQuad(list, s) {
    const P = s.plate, g = new THREE.PlaneGeometry(PLATE.w, PLATE.h);
    // cell uv
    const col = s.slot % ATLAS.cols, row = Math.floor(s.slot / ATLAS.cols);
    const u0 = col / ATLAS.cols, u1 = (col + 1) / ATLAS.cols, v1 = 1 - row / ATLAS.rows, v0 = 1 - (row + 1) / ATLAS.rows;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
    // the plane faces +z; turn it to face −z (back, toward the approach) and lean it with the plate
    // plate normal (before lean) is −z in the bench frame; offset 0.026 out of the plate's back face
    // plate's back-face normal in the bench frame: (0, sin pa, −cos pa); the quad sits just proud of it
    _e.set(-P.pa, s.face + Math.PI, 0, 'YXZ');
    _q.setFromEuler(_e);
    const off = 0.028;
    const lx = P.lx, ly = P.ly + Math.sin(P.pa) * off, lz = P.lz - Math.cos(P.pa) * off;
    _p.set(s.x + s.rx * lx + s.fx * lz, s.floor + ly, s.z + s.rz * lx + s.fz * lz);
    _m.compose(_p, _q, _s.set(1, 1, 1));
    g.applyMatrix4(_m);
    list.push(g);
  }
  function drawAtlas() {
    const g = atlasCv.getContext('2d');
    g.clearRect(0, 0, atlasCv.width, atlasCv.height);
    for (const s of spots) {
      const col = s.slot % ATLAS.cols, row = Math.floor(s.slot / ATLAS.cols);
      const x0 = col * ATLAS.cw, y0 = row * ATLAS.ch, W = ATLAS.cw, H = ATLAS.ch;
      const cat = s.island === 'cat';
      const bg = cat ? '#2c5646' : '#fff3e8', ink = cat ? '#fbf1d6' : '#5a1f3a', acc = cat ? '#f2c14e' : '#e8346a';
      g.save(); g.translate(x0, y0);
      g.fillStyle = cat ? '#d9a441' : '#f2c14e'; g.fillRect(0, 0, W, H);
      g.fillStyle = bg; roundRect(g, 7, 7, W - 14, H - 14, 12); g.fill();
      g.strokeStyle = acc; g.lineWidth = 3; roundRect(g, 13, 13, W - 26, H - 26, 8); g.stroke();
      // the binoculars pictogram (the map glyph)
      g.save(); g.translate(24, 22); g.scale(1.5, 1.5); g.strokeStyle = acc; g.lineWidth = 2.3; g.lineJoin = 'round'; g.lineCap = 'round';
      g.stroke(new Path2D('M3.2 15.6 a3.6 3.6 0 1 0 7.2 0 a3.6 3.6 0 1 0 -7.2 0 Z M13.6 15.6 a3.6 3.6 0 1 0 7.2 0 a3.6 3.6 0 1 0 -7.2 0 Z M3.7 13.6 L6.1 5.8 h3.3 l1 7.2 M20.3 13.6 L17.9 5.8 h-3.3 l-1 7.2 M10.4 11 h3.2'));
      g.restore();
      g.fillStyle = acc; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.font = '800 15px "Nunito", "Trebuchet MS", sans-serif';
      g.fillText('TAKE IN THE VIEW', 68, 40);
      g.fillStyle = ink; g.textAlign = 'center';
      let fs = 34; g.font = `800 ${fs}px "Baloo 2", "Trebuchet MS", sans-serif`;
      while (g.measureText(s.name).width > W - 40 && fs > 16) { fs -= 2; g.font = `800 ${fs}px "Baloo 2", "Trebuchet MS", sans-serif`; }
      g.fillText(s.name, W / 2, 76);
      g.globalAlpha = 0.8; g.font = 'italic 700 13px "Nunito", "Trebuchet MS", sans-serif';
      g.fillText(s.sub || '', W / 2, 101);
      g.restore();
    }
    atlasTex.needsUpdate = true;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function rebuild() {
    const lb = [], lf = [];
    for (const s of spots) { benchParts(lb, s); faceQuad(lf, s); }
    const gb = mergeGeometries(lb, false), gf = mergeGeometries(lf, false);
    for (const g of lb) g.dispose();
    for (const g of lf) g.dispose();
    body.geometry.dispose(); faces.geometry.dispose();
    body.geometry = gb; faces.geometry = gf;
    gb.computeBoundingSphere(); gf.computeBoundingSphere();
    drawAtlas();
  }
  rebuild();
  // the webfonts may land after the atlas was drawn: redraw once they have (not under ?shot: deterministic renders)
  if (!ctx.shot) { try { document.fonts?.ready?.then(() => drawAtlas()); } catch (e) { /* the fallback faces stand */ } }

  // ── prompts + map markers ────────────────────────────────────────────────────
  const entries = new Map();
  function registerSpot(s) {
    const I = sys().interaction;
    entries.get(s.id)?.remove?.();
    if (!I?.register) return;
    const e = I.register({
      id: 'view_' + s.id, x: s.x + s.fx * (s.promptZ ?? -0.2), z: s.z + s.fz * (s.promptZ ?? -0.2), r: PROMPT_R, label: 'Take in the view',
      onInteract: () => { if (cur && cur.s === s) { if (cur.t > GRACE) stand('key'); } else start(s); },
    });
    e.viewpoint = s.id;
    entries.set(s.id, e);
  }
  function markSpot(s) {
    try { sys().ui?.removeMapMarker?.('view_' + s.id); sys().ui?.addMapMarker?.({ id: 'view_' + s.id, x: s.x, z: s.z, glyph: 'view', label: s.name }); } catch (e) { /* no map, no marker */ }
  }
  for (const s of spots) registerSpot(s);
  const markAll = () => {
    for (const s of spots) markSpot(s);
    for (const u of unplaced) { try { sys().ui?.removeMapMarker?.('view_' + u.id); } catch (e) { /* no map */ } }
  };
  markAll();
  // … and again at 'world:ready', once every other prompt has registered (candy/architecture's doors and
  // knockers, the ferry's gangway, the ride pads all do it there): the fit that counts. Then the meshes,
  // the prompts and the map markers follow the benches wherever they landed.
  ctx.events.on('world:ready', () => {
    placeAll();
    rebuild();
    for (const [id, e] of entries) { if (!spots.some((s) => s.id === id)) { e.remove?.(); entries.delete(id); } }
    for (const s of spots) registerSpot(s);
    markAll();
  });

  // ── the caption (own DOM; shown only while you look) ─────────────────────────
  let capRoot = null, capK = null, capN = null, capL = null;
  function caption() {
    if (capRoot || !ctx.uiRoot) return capRoot;
    const st = document.createElement('style');
    st.textContent = `
#ui .vp-root { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
#ui .vp-root > * { visibility: visible; }
#ui .vp-bar { position: absolute; left: 0; right: 0; height: 7.5vh; background: #0b0a12; transition: transform 1.1s cubic-bezier(.3,.7,.2,1); }
#ui .vp-top { top: 0; transform: translateY(-101%); }
#ui .vp-bot { bottom: 0; transform: translateY(101%); }
#ui .vp-cap { position: absolute; left: calc(34px + env(safe-area-inset-left, 0px)); bottom: calc(7.5vh + 22px); max-width: min(560px, 70vw);
  opacity: 0; transform: translateY(10px); transition: opacity .9s ease, transform 1.2s cubic-bezier(.3,.7,.2,1); color: #fff7ee;
  text-shadow: 0 2px 0 rgba(28,16,40,.55), 0 0 18px rgba(28,16,40,.55); }
#ui .vp-k { font: 900 12px/1 var(--fbody, "Nunito", sans-serif); letter-spacing: .32em; text-transform: uppercase; color: #ffd98a; margin-bottom: 6px; }
#ui .vp-n { font: 800 clamp(26px, 4.4vw, 46px)/1.02 var(--fdisp, "Baloo 2", sans-serif); letter-spacing: .01em; }
#ui .vp-l { font: italic 700 clamp(13px, 1.5vw, 17px)/1.3 var(--fbody, "Nunito", sans-serif); margin-top: 6px; color: #f3e6ff; }
#ui .vp-root.on .vp-top, #ui .vp-root.on .vp-bot { transform: none; }
#ui .vp-root.cap .vp-cap { opacity: 1; transform: none; }
@media (max-height: 520px) { #ui .vp-bar { height: 6vh; } #ui .vp-cap { bottom: calc(6vh + 12px); left: calc(18px + env(safe-area-inset-left, 0px)); } }
`;
    capRoot = document.createElement('div');
    capRoot.className = 'vp-root';
    capRoot.innerHTML = '<div class="vp-bar vp-top"></div><div class="vp-bar vp-bot"></div><div class="vp-cap"><div class="vp-k"></div><div class="vp-n"></div><div class="vp-l"></div></div>';
    ctx.uiRoot.appendChild(st);
    ctx.uiRoot.appendChild(capRoot);
    capK = capRoot.querySelector('.vp-k'); capN = capRoot.querySelector('.vp-n'); capL = capRoot.querySelector('.vp-l');
    return capRoot;
  }

  // ── the shot ─────────────────────────────────────────────────────────────────
  // camera.cinematic reads its option object EVERY frame (o.azimuth, o.elevation, o.distance, o.fov,
  // o.pitch and the target), so the view writes them each frame: that is the pan.
  const tgt = new THREE.Vector3();
  const shotO = { target: tgt, azimuth: 0, elevation: 0.2, distance: 5, fov: 46, pitch: 0, noTilt: true, duration: T_ALL, in: T_IN, hold: T_HOLD, out: T_OUT };
  const endV = { dB: 0, alt: 0, fov: 46, tilt: 0, el: 0, dist: 7, kind: 0 };   // kind 0 plain · 1 moon · 2 rainbow · 3 toward the moon (too high to frame with him)
  let cur = null;                // { s, t, phase, shot, from, lockedByMe, hudByMe, first, stepFrom }
  let firstDone = false;
  let tapFlag = false, prevDown = false;
  const onTap = () => { tapFlag = true; };

  function headY(s) { return s.floor + HEAD; }
  /** Where does the pan end? Moon at night, the rainbow by day, else the authored sweep. Fills endV. */
  function planEnd(s) {
    endV.kind = 0; endV.dB = s.pan[1]; endV.fov = s.fov; endV.tilt = s.tilt; endV.el = s.el; endV.dist = s.dist;
    const base = s.face + s.side;                            // the natural look bearing (the lens looks along base + pan)
    const md = sys().sky?.moonDir;
    if (s.moon !== false && ctx.state.isNight && md && md.y > 0.08) {
      const bm = Math.atan2(md.x, md.z), alt = Math.asin(clamp(md.y, -1, 1));
      const dB = wrap(bm - base);
      if (Math.abs(dB) < (s.moonReach ?? 1.8) && aimAt(s, dB, alt, 1)) return;
    }
    const br = s.rainbow && !ctx.state.isNight ? sys().escape?.routes?.bridge : null;
    if (br?.up && br.apex) {
      const hx = s.x, hz = s.z, hy = headY(s);
      const dh = Math.hypot(br.apex.x - hx, br.apex.z - hz);
      const alt = Math.atan2(br.apex.y - hy, Math.max(1, dh)) - 0.06;   // the crest a touch under the frame's upper third
      const dB = wrap(Math.atan2(br.apex.x - hx, br.apex.z - hz) - base);
      if (dh < 340 && alt < 0.95 && Math.abs(dB) < 1.8) aimAt(s, dB, alt, 2);
    }
  }
  const hvOf = (fov) => Math.atan(BAND * Math.tan((fov * Math.PI) / 360));        // the letterboxed band's half-angle
  const fovOf = (hv) => (360 / Math.PI) * Math.atan(Math.tan(hv) / BAND);
  /**
   * Frame an ending — the moon (kind 1) or the rainbow's crest (kind 2) — `alt` rad over his head and dB off
   * the natural look bearing, into endV. The axis's elevation A (= tilt) must show the thing whole
   * (alt − A ≤ hv − top), his head (at −pitch = −(el + A) from the axis) must stay over the band's bottom and
   * the horizon (at −A) too. When no lens up to fovMax holds the moon with him, the pan still ends on the
   * moon's BEARING (kind 3: its path on the water, its glow over the frame's top) with him and the horizon
   * in; a crest that will not fit returns false (the pan keeps its own authored end).
   */
  function aimAt(s, dB, alt, kind) {
    const look = s.face + s.side + dB, bx = -Math.sin(look), bz = -Math.cos(look), hy = headY(s);
    const ahead = s.ahead || 0;
    // 1) the lens as LOW as the ground behind him allows: his head sits el under the lens's level, and every
    //    bit of that is sky the frame cannot show over him. A hillside bench comes in closer first (the
    //    ground rises away behind him), then lifts only what the camera's own terrain clamp (lens ≥ ground
    //    + 1.6 with a fresh lookAt, which would tip the frame) would force — measured at the push-in's nearest.
    let dist = s.dist, el = kind === 1 ? Math.min(s.el, 0.06) : s.el;
    const clear = (d, e) => { const q = d * 0.95 - ahead; return hy + Math.sin(e) * d * 0.95 - world.height(s.x + bx * q, s.z + bz * q) >= LENS_GROUND; };
    while (dist > 3.2 && !clear(dist, el)) dist -= 0.4;
    while (el < 0.6 && !clear(dist, el)) el += 0.03;
    const top = kind === 1 ? MOON_TOP : 0.06, fovMax = kind === 1 ? FOV_MOON : 66;
    // an `ahead` bench frames the view, not him (his head is not in the shot): only the thing and the horizon
    const headM = ahead ? -Infinity : HEAD_M + el;
    // 2) the band: widen only as far as the thing + his head need …
    let fov = clamp(fovOf((alt + top + (ahead ? HORIZON_M : HEAD_M + el)) / 2 + 0.015), s.fov, fovMax), hv = hvOf(fov);
    let A = clamp(s.tilt, alt + top - hv, Math.min(hv - HORIZON_M, hv - headM));
    if (alt + top - hv > Math.min(hv - HORIZON_M, hv - headM) + 1e-6) {
      // … and when no lens up to fovMax holds both, he stays and so does the horizon: the pan still ends
      // facing the thing's bearing — the moon's path on the water, its glow over the top of the frame — but
      // with the axis only as high as his head allows (a picture of him under the moon, not of the sky)
      // (only a small swing is worth it without the moon itself in the picture: a moonward pan that turns
      // the bench's back on its view — the Watchtower inland at midnight — keeps the authored pan instead)
      if (kind !== 1 || Math.abs(dB) > 0.9) return false;
      fov = clamp(s.fov + 8, s.fov, 60); hv = hvOf(fov);
      A = Math.min(hv - HORIZON_M, hv - headM);
      kind = 3;
    }
    endV.kind = kind; endV.dB = dB; endV.fov = fov; endV.tilt = A; endV.el = el; endV.dist = dist;
    return true;
  }
  /** Pose the lens for spot s at time t (s into the view) into shotO + tgt. Allocation-free. */
  function poseShot(s, t) {
    const u = ease(t / T_ALL);
    const k = endV.kind ? smoothstep(0.14, 0.66, t / T_ALL) : 0;   // the swing to the moon / the arc, settled by 5.3 s
    const pan = endV.kind ? lerp(s.pan[0], endV.dB, smoothstep(0, 0.66, t / T_ALL)) : lerp(s.pan[0], s.pan[1], u);
    const look = s.face + s.side + pan;                      // the bearing the lens looks along
    shotO.azimuth = look + Math.PI;                          // the lens stands on the far side of its target
    shotO.elevation = lerp(s.el, endV.el, k);
    shotO.distance = lerp(s.dist, endV.dist, k) * (1.06 - 0.1 * u);   // a slow push in
    shotO.fov = lerp(s.fov, endV.fov, k);
    const tilt = lerp(s.tilt, endV.tilt, k);
    // his head never leaves the band (he sits at −pitch from the axis): the pitch is capped at hv − HEAD_M.
    // (an `ahead` bench frames the view from just in front of him: only the horizon binds it)
    const hv = hvOf(shotO.fov);
    const lim = s.ahead ? hv - HORIZON_M + shotO.elevation : hv - HEAD_M;
    shotO.pitch = Math.max(0, Math.min(shotO.elevation + tilt, lim));   // (camera.js applies only an upward pitch)
    // the target: his head — or, for an `ahead` bench, a point that far out along the look, so the lens
    // (dist < ahead) stands IN FRONT of him, clear of whatever he sits inside (the Great Cupcake's frosting)
    const ah = s.ahead || 0;
    tgt.set(s.x + Math.sin(look) * ah, headY(s), s.z + Math.cos(look) * ah);
  }

  function busy() {
    const S = sys(), pl = S.player, st = ctx.state;
    return !pl?.position || !S.camera?.cinematic || st.paused || pl.onVehicle || pl.onFerry || st.ferry || pl.locked
      || S.intro?.active || S.camera?.isFree?.() || S.camera?.cinematicActive || st.vehicle;
  }
  function start(s) {
    if (cur) return false;
    if (busy()) { sys().ui?.toast?.('Not now. The view will keep.', 1.8, { icon: 'view' }); return false; }   // never a silent E (Contract O)
    const S = sys(), pl = S.player;
    planEnd(s);
    poseShot(s, 0);
    const shot = S.camera.cinematic(shotO);
    cur = {
      s, t: 0, phase: 'sit', shot, lockedByMe: true, hudByMe: false, first: !firstDone,
      fx: pl.position.x, fz: pl.position.z, ff: pl.facing, sx: 0, sz: 0,
    };
    firstDone = true;
    shot?.then?.(() => { if (cur && cur.shot === shot) shotDone(); });
    pl.locked = true;
    pl.velocity?.set?.(0, 0, 0);
    pl.setPose?.('sit');
    if (!ctx.state.isNight) pl.setEmotion?.('happy');
    // the seat must not lift him onto its top while he sits on it
    if (pendingRestore && pendingRestore !== s.col) { pendingRestore.h = SEAT.h; }
    pendingRestore = null;
    s.col.h = -100;
    if (cur.first) S.ui?.toast?.('Sit. Look.', 2.2, { icon: 'view' });
    const c = caption();
    if (c) {
      capK.textContent = cur.first ? 'Sit. Look.' : 'Take in the view';
      capN.textContent = s.name; capL.textContent = s.line || '';
      c.classList.add('on');
    }
    tapFlag = false; prevDown = !!ctx.input?.pointer?.down;
    try { window.addEventListener('pointerdown', onTap, true); window.addEventListener('touchstart', onTap, { capture: true, passive: true }); } catch (e) { /* headless */ }
    ctx.events.emit('viewpoint:start', { id: s.id });
    return true;
  }
  /** Stand up: the camera eases home (T_OUT), he steps off the seat, the HUD comes back. */
  function stand(why) {
    if (!cur || cur.phase === 'step' || cur.phase === 'done') return;
    if (cur.phase !== 'sit' && cur.phase !== 'view') return;
    cur.shot?.cancel?.();
    cur.phase = 'step'; cur.why = why; cur.st = 0;
    const pl = sys().player;
    cur.sx = pl.position.x; cur.sz = pl.position.z;
    pl.setPose?.('stand');
    hudBack();
    capRoot?.classList.remove('cap', 'on');
  }
  function hudBack() {
    if (cur?.hudByMe) { try { sys().ui?.showHud?.(true); } catch (e) { /* ui gone */ } cur.hudByMe = false; }
  }
  /** Tidy everything (a normal finish, or someone else took over). */
  function finish(why, keepLock) {
    if (!cur) return;
    const s = cur.s, pl = sys().player;
    hudBack();
    capRoot?.classList.remove('cap', 'on');
    if (pl) {
      if (pl.pose === 'sit') pl.setPose?.('stand');
      if (cur.lockedByMe && !keepLock) pl.locked = false;
      pl.setEmotion?.(null);
    }
    pendingRestore = s.col;
    try { window.removeEventListener('pointerdown', onTap, true); window.removeEventListener('touchstart', onTap, { capture: true }); } catch (e) { /* headless */ }
    ctx.events.emit('viewpoint:end', { id: s.id, why: cur.why || why });
    cur = null;
  }
  function shotDone() {
    // the camera is home (or another shot superseded ours)
    if (!cur) return;
    if (cur.phase === 'sit' || cur.phase === 'view') { cur.why = 'superseded'; finish('superseded'); }
  }
  ctx.events.on('player:teleport', () => { if (cur) { cur.shot?.cancel?.(); cur.why = 'teleport'; finish('teleport'); } });

  function anyInput(inp) {
    if (!inp) return false;
    if (inp.pressed && inp.pressed.size > 0) return true;
    const down = !!inp.pointer?.down;
    const click = down && !prevDown; prevDown = down;
    if (click || tapFlag) return true;
    const v = inp.virtualRaw;
    if (v && (v.x * v.x + v.y * v.y) > 0.3) return true;
    return false;
  }

  // ── API ───────────────────────────────────────────────────────────────────────
  const byId = (id) => spots.find((s) => s.id === id);
  const api = {
    get spots() { return spots.map((s) => ({ id: s.id, name: s.name, island: s.island, x: s.x, y: s.floor, z: s.z, face: s.face })); },
    get active() { return cur ? cur.s.id : null; },
    /** QA: the two meshes (all benches, all plaque faces) — the whole draw-call budget. */
    get meshes() { return [body, faces]; },
    get t() { return cur ? cur.t : 0; },
    view(id) { const s = byId(Array.isArray(id) ? id[0] : id); return s ? start(s) : false; },
    stop() { if (cur) stand('api'); },
    goto(id) {
      const s = byId(Array.isArray(id) ? id[0] : id); if (!s) return false;
      if (cur) { cur.shot?.cancel?.(); cur.why = 'goto'; finish('goto'); }
      const pl = sys().player; if (!pl?.teleport) return false;
      // beside the bench on its own floor: round the open end, round the post's end, behind it, in front
      // (a gallery's inner edge is a hole; a balcony's "behind" can be inside the building). The teleport
      // lands on the floor reachable from the ground, so each try is checked where it actually landed —
      // and a deck spot is kept by lending him the deck's height (the next frame's ground query then finds it)
      let done = false, first = null;
      const log = api.lastGoto = { id: s.id, from: +pl.position.y.toFixed(2), tries: [], y: null };
      // (last: the step-off point itself — fits() proved it level and clear, so a narrow balcony always has it)
      for (const [lx, lz] of [[-(SEAT.w / 2 + 0.7) * (s.post || 1), -0.3], [(SEAT.w / 2 + 1.0) * (s.post || 1), -0.3], [0, -1.3], [0, (s.stepD ?? STEP_D) + 0.5], [0, s.stepD ?? STEP_D]]) {
        const x = s.x + s.rx * lx + s.fx * lz, z = s.z + s.rz * lx + s.fz * lz;
        // (live rules read his height — the cupcake's props under the balcony are solid only down at their
        // level — so the checks are asked at the bench's height, as floorAt does)
        const y0 = pl.position.y; pl.position.y = s.floor;
        const fl = floorAt(x, z, s.floor), hit = !!pl.pushOut?.(x, z, 0.32).hit;
        pl.position.y = y0;
        const t = [+x.toFixed(2), +z.toFixed(2), +fl.toFixed(2), hit];
        log.tries.push(t);
        if (Math.abs(fl - s.floor) >= 0.3 || hit) continue;
        if (!first) first = [x, z];
        pl.position.y = s.floor;
        pl.teleport(x, z);
        t.push(+pl.position.y.toFixed(2));
        if (Math.abs(pl.position.y - s.floor) < 0.5) { done = true; break; }
      }
      if (!done) {
        const [x, z] = first || [s.x - s.fx * 1.3, s.z - s.fz * 1.3];
        pl.position.y = s.floor; pl.teleport(x, z);
        if (Math.abs(pl.position.y - s.floor) >= 0.5) pl.position.y = s.floor + 0.02;
      }
      log.y = +pl.position.y.toFixed(2); log.ok = done;
      pl.facing = s.face;
      sys().camera?.snap?.();
      return true;
    },
    add(spec) {
      if (!spec?.id || byId(spec.id) || spots.length >= ATLAS.cols * ATLAS.rows) return false;
      const full = { pan: [-0.35, 0.35], side: 0, dist: 7, el: 0.22, tilt: -0.05, fov: 46, post: 1, island: world.islandAt(spec.x, spec.z) || 'cat', ...spec };
      promptObs = gatherPrompts();
      const s = resolve(full, spots.length);
      if (s.unplaced) return false;
      const j = specs.findIndex((q) => q.id === full.id);
      if (j >= 0) specs[j] = full; else specs.push(full);
      const u = unplaced.findIndex((q) => q.id === full.id); if (u >= 0) unplaced.splice(u, 1);
      spots.push(s); ctx.colliders.push(s.col, s.colPost);
      rebuild(); registerSpot(s); markSpot(s);
      return true;
    },
    move(id, spec = {}) {
      const i = spots.findIndex((s) => s.id === id); if (i < 0) return false;
      if (cur?.s === spots[i]) return false;
      const old = spots[i];
      // its own seat and post must not stop it fitting where it already stands: park them, try, and
      // either put them back (no fit) or retire them for fresh ones (appended — see placeAll)
      const c0 = { ...old.col }, p0 = { ...old.colPost };
      old.col.h = -100; old.col.x += 1e5; old.colPost.x += 1e5;
      const j = specs.findIndex((q) => q.id === id);
      const base = j >= 0 ? specs[j] : old;
      const want = { ...base, x: old.x, z: old.z, ...spec, y: 'y' in spec ? spec.y : old.y };
      promptObs = gatherPrompts();
      const s = resolve(want, i);
      if (s.unplaced) { Object.assign(old.col, c0); Object.assign(old.colPost, p0); return false; }
      retire(old);
      ctx.colliders.push(s.col, s.colPost);
      if (j >= 0) specs[j] = want;
      spots[i] = s;
      rebuild(); registerSpot(s); markSpot(s);
      return true;
    },
    /** QA: would bench `id` fit with its seat centred at (x, z)? look = [x, z] overrides the view point (the
     *  facing). → { ok, why, x, z, face, floor } — nothing moves. */
    fitAt(id, x, z, look, extra, map) {
      const j = specs.findIndex((q) => q.id === id); if (j < 0) return null;
      const own = byId(id), c0 = own ? { ...own.col } : null, p0 = own ? { ...own.colPost } : null;
      if (own) { own.col.h = -100; own.col.x += 1e5; own.colPost.x += 1e5; }
      const s = { ...specs[j], ...(look ? { look } : null), ...(extra || null), slot: 0, why: {} };
      let ok = false, dbg = null;
      try {
        promptObs = gatherPrompts(); ok = fits(s, x, z);
        if (map) { dbg = {}; contest(s, x, z, floorAt(x, z, s.y), s.y, dbg); }
      } finally { if (own) { Object.assign(own.col, c0); Object.assign(own.colPost, p0); } }
      return { ok, why: s.why, x: +x.toFixed(2), z: +z.toFixed(2), face: +s.face.toFixed(3), floor: +floorAt(x, z, s.y).toFixed(2), map: dbg };
    },
    /** QA: the prompts the fit counts (what gatherPrompts() sees now). */
    get obstacles() { return gatherPrompts().map((o) => ({ id: o.id + (o.side ? '@' + o.side : ''), x: +o.x.toFixed(2), z: +o.z.toFixed(2), r: o.r, moving: !!o.get })); },
    /** QA / tuning: the LIVE record of bench `id` (its shot fields — side, dist, el, tilt, fov, pan, look — may be edited). */
    debugSpot(id) { return byId(id) || null; },
    shotAt(id, t = 4) {
      const s = byId(id); if (!s) return null;
      planEnd(s); poseShot(s, t);
      const ce = Math.cos(shotO.elevation), d = shotO.distance;
      const lens = [tgt.x + Math.sin(shotO.azimuth) * ce * d, tgt.y + Math.sin(shotO.elevation) * d, tgt.z + Math.cos(shotO.azimuth) * ce * d];
      return { lens, look: [tgt.x, tgt.y, tgt.z], az: shotO.azimuth, el: shotO.elevation, pitch: shotO.pitch, fov: shotO.fov, kind: ['plain', 'moon', 'rainbow', 'moonward'][endV.kind] };
    },
    /** QA: authored spots that fitted nowhere (left out of the world), with the tally of why. */
    get unplaced() { return unplaced.map((u) => ({ id: u.id, why: { ...u.why } })); },
    audit() {
      const I = sys().interaction, pl = sys().player, out = [];
      for (const s of spots) {
        const near = [];
        if (I?.items) for (const e of I.items.values()) {
          if (e.viewpoint || (e.r || 2.6) > 8) continue;
          const p = e.getPos ? e.getPos() : e;
          if (!p || !Number.isFinite(p.x)) continue;
          const d = Math.hypot(p.x - s.x, p.z - s.z);
          if (d < (e.r || 2.6) + PROMPT_R) near.push(`${e.id}@${d.toFixed(1)}${e.getPos ? '(moving)' : ''}`);
        }
        let clearFront = null, clearBack = null;
        if (pl?.pushOut) {
          const h0 = s.col.h; s.col.h = -100;
          const sd = s.stepD ?? STEP_D, f = pl.pushOut(s.x + s.fx * sd, s.z + s.fz * sd, 0.36); clearFront = !f.hit;
          const b = pl.pushOut(s.x - s.fx * 1.3, s.z - s.fz * 1.3, 0.36); clearBack = !b.hit;
          s.col.h = h0;
        }
        const gF = pl?.groundInfo?.(s.x + s.fx * (s.stepD ?? STEP_D), s.z + s.fz * (s.stepD ?? STEP_D));
        out.push({ id: s.id, x: +s.x.toFixed(2), z: +s.z.toFixed(2), fitted: s.fitted, floor: +s.floor.toFixed(2), frontFloor: gF ? +gF.h.toFixed(2) : null, near, clearFront, clearBack });
      }
      return out;
    },

    update(dt, ctx) {
      // the seat is re-armed once he is clear of it (so it never pops him onto its top)
      if (pendingRestore && (!cur || cur.s.col !== pendingRestore)) {
        const c = pendingRestore, p = sys().player?.position;
        if (!p) { c.h = SEAT.h; pendingRestore = null; }
        else {
          const dx = p.x - c.x, dz = p.z - c.z, cs = Math.cos(c.rot), sn = Math.sin(c.rot);
          const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
          if (Math.abs(lx) > c.w / 2 + 0.42 || Math.abs(lz) > c.d / 2 + 0.42) { c.h = SEAT.h; pendingRestore = null; }
        }
      }
      // the plaques glow a little after dark
      const night = 1 - clamp(ctx.state.daylight ?? 1, 0, 1);
      faceMat.emissiveIntensity = 0.04 + 0.62 * night;
      // prompts only answer at the seat's own level (a gallery over a floor, a balcony over a ramp)
      const p = sys().player?.position;
      if (p) for (const s of spots) { const e = entries.get(s.id); if (e) e.enabled = Math.abs(p.y - s.floor) < (s.levelTol ?? LEVEL_TOL); }

      // …and no x-ray silhouette of his FEET through a seat he is standing at (the step off it leaves the seat
      // between the follow camera and his shoes: two orange blobs painted on the slats). Beside a bench only his
      // feet can be hidden, so the silhouette has nothing to show there; it is the player's again 1.2 u away
      if (cur) sys().player?.setSilhouette?.(false);          // seated (paused too): see below
      else if (p) for (const s of spots) {
        const dx = p.x - s.x, dz = p.z - s.z;
        if (dx * dx + dz * dz < 1.44 && Math.abs(p.y - s.floor) < 1.2) { sys().player.setSilhouette?.(false); break; }
      }
      if (!cur || ctx.state.paused) { prevDown = !!ctx.input?.pointer?.down; tapFlag = false; return; }
      const S = sys(), pl = S.player, s = cur.s;
      if (!pl?.position) { finish('lost'); return; }
      // someone else took the visitor (a ride, the ferry, a tiger's scruff carry, the intro)
      if (pl.onVehicle || pl.onFerry || S.intro?.active) { cur.shot?.cancel?.(); finish('taken', true); return; }
      cur.t += dt;
      const t = cur.t;
      // no through-geometry silhouette while he sits (player.js turns it back on every frame; viewpoints
      // updates after player, so this holds for the render): an authored shot frames him in the open, and
      // an orange ghost painted over a pillar or a gummy bear only ever reads as junk
      pl.setSilhouette?.(false);

      if (cur.phase === 'sit' || cur.phase === 'view') {
        // onto the seat: slide + turn, then hold him there
        const k = ease(t / SIT_T);
        pl.position.x = lerp(cur.fx, s.x, k); pl.position.z = lerp(cur.fz, s.z, k);
        pl.velocity?.set?.(0, 0, 0);
        pl.facing = cur.ff + wrap(s.face - cur.ff) * k;
        pl.locked = true;
        if (cur.phase === 'sit' && t >= SIT_T) cur.phase = 'view';
        // the HUD steps aside (after the first-time toast has been read)
        if (!cur.hudByMe && t >= (cur.first ? 2.3 : HUD_AT) && S.ui?.showHud && S.ui.hudShown !== false) {
          S.ui.showHud(false); cur.hudByMe = true;
        }
        if (t >= 1.2) capRoot?.classList.add('cap');
        poseShot(s, t);
        // somebody cut the camera away without a word (a snap(), a mode change): stand up rather than sit blind
        if (t > 0.25 && S.camera && S.camera.cinematicActive === false) stand('cut');
        else if (t > GRACE && anyInput(ctx.input)) { stand('key'); }
        else if (t >= T_IN + T_HOLD) stand('end');
        tapFlag = false;
      } else if (cur.phase === 'step') {
        // stand and take one step toward the view, off the seat
        cur.st += dt;
        const k = ease(cur.st / STEP_T);
        const sd = s.stepD ?? STEP_D;
        pl.position.x = lerp(cur.sx, s.x + s.fx * sd, k); pl.position.z = lerp(cur.sz, s.z + s.fz * sd, k);
        pl.velocity?.set?.(0, 0, 0);
        if (cur.st >= STEP_T) finish(cur.why || 'end');
      }
    },
  };
  return api;
}
