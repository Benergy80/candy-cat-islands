// ─────────────────────────────────────────────────────────────────────────────
// INTRO — the opening cinematic (docs/BRIEF.md WAVE 3, Contract K).
//
// When the title card is dismissed, ui.js hands the world over:
//   intro.takeover({ view, saved: { time, frozen, fog } }) → Promise
// and from then on this system owns the camera, the clock, the fog and the
// visitor until the camera has landed in MODE 2 behind him.
//
//   THE FLIGHT (28 s + a 1.2 s landing, deterministic — a pure function of the
//   flight clock) is two shots joined by a DIP TO WHITE, then the orbit:
//
//   A · DUSK, THE ISLAND (0 → 17.3). The lens runs a Catmull-Rom spline through
//   authored keyframes (Hermite form with time-aware tangents, so the speed is
//   continuous across keys of different lengths; at rest on the hero view), and
//   so does the look point; every frame the two become a free view —
//   camera.setFree({target, azimuth, elevation, distance, fov}) — plus a bank
//   (≤ 2.6°) into the pan. The clock HOLDS at the title's golden hour.
//   (★ = a view in tools/views/intro.json)
//     0.0  the title's hero view (from the hand-off: the cut is seamless)
//     3.6  in from the sea off the south-west coast, the island ahead
//     6.8  ★ THE CANDY PALACE from the west-south-west, over the gumdrop cliffs
//     9.2  straight over it (+15 u over its 45 u top), the look on to the cupcake
//    11.2  ★ THE GREAT CUPCAKE from the north-west (Cat Island beyond)
//    12.9  past its shoulder (+13 u), turning south
//    15.0  ★ GUMDROP VILLAGE from the edge of the Gummy Forest: the plaza, its
//          carousel and fountain ringed by the gingerbread houses, the river
//          and its bridge — one place, one centre
//    16.4  over the plaza, the view swinging right, WEST, over the forest and
//          the chocolate lake into the low sun — the banner biplane crossing it…
//    17.3  …which fills the frame: the dip to WHITE peaks here (16.7 → 17.3 →
//          17.95). Under it the lens cuts and the clock jumps to the morning.
//   B · MORNING, THE ARRIVAL (17.3 → 23.0) — THE FIND. Low over the water
//   east-south-east of Sugar Pier (≈ 11-16 u up, fov 35 → 34) the lens holds on
//   the Sugarfin's ferry platform: the Sugarfin moored across the foreground,
//   the pier running away diagonally to the WELCOME TO CANDYLAND arch, the Great
//   Cupcake and the palace behind him, and the visitor centred on the planks
//   beside the gangway he has just walked down, ≈ 9 % of the frame high and
//   facing us  ★ 19.2. It drifts in for three seconds, then PUSHES IN over the
//   Sugarfin (20.4 → 23.0) and swings onto the orbit's tangent. The look is on
//   him throughout, the lens pitched up (0.10) so he sits low with the island
//   above him. The clock runs FORWARD from an hour before the day's start to
//   it (8:30 → 9:30 by 28.0): the sun climbs, it never runs back.
//   C · THE ORBIT (23.0 → 28.0): ONE full COUNTER-CLOCKWISE turn round him at
//   elevation 0.3, 9 → 6 u, fov 32 → 36 → 30, entered at the push-in's speed and
//   easing to a stop where the find began — east of him: a medium shot, him
//   smiling, the SUGAR PIER sign and Candyland behind him ★ 27.95. Half-way
//   (★ 25.5) the lens is west of him: he looks past the Sugarfin's BOARD HERE
//   canopy to Cat Island across the water. He watches the Sugarfin, then turns
//   to the lens over the last 1.2 s and smiles.
//   28.0 LANDING: setFree(null) → setMode(2) → snap() → a 1.2 s cinematic()
//   from the orbit's last pose into the mode-2 follow framing (a small settle:
//   the follow lens is ≈ 9° round and further back and up). He turns from the lens
//   to Candyland and WALKS 3.2 u up the pier — off the ferry platform, so the
//   "Board the Sugarfin" prompt (3.6 u round the gangway foot) is not the first
//   thing the game says to him → HUD back (the camera chip shown for its 4 s,
//   skip or not), clock running, 'intro:cinematic:done'.
//   Passes (real flow): first within 60 u of the palace @7.5 s, the cupcake
//   @10.8, the village @13.8, the pier @17.5 (closest 8 / 24 / 9 / 4 u) — in
//   that order; the lens is ≥ 19 u over the ground until the white, and ≥ 1.3 u
//   from every surface after it.
//
//   WHERE HE STANDS: candy_dock + (11, 0) = (-31, 22), on the Sugarfin's
//   platform at the seaward end of Sugar Pier, 0.8 u from the gangway foot.
//   Chosen by ray-casting the real scene (every mesh in 80 × 80 u round the
//   pier, instanced props expanded, pickups as spheres): of the deck and
//   platform spots it is the one whose orbit is clearest — the lens stays ≥ 1 u
//   from every surface, and only two candy-cane posts and the boarding flag
//   ever pass between it and him (≈ 8 % of the turn, never at 25.5 or 27.95).
//   The platform is over deep water, where player.teleport() cannot see the
//   planks, so he is teleported onto the pier's planks at candy_dock + (6.5, 0)
//   and slid along them to his spot (same deck height).
//
//   DURING THE FLIGHT: player.locked (re-asserted every frame), posed standing,
//   the ferry moored at Sugar Pier, the HUD hidden (ui.showHud(false), and the
//   class 'cci-cinema' on ctx.uiRoot), the world keeps living. ANY key / click /
//   tap = SKIP, once the INPUT GRACE is over: for 1.0 s after takeover (on the
//   flight's clock AND on the wall clock, by the event's own timeStamp, so a
//   press queued behind a long first frame on a phone still counts as early)
//   every key / pointer / touch is ignored — the gesture that dismissed the
//   title (a tap, a tap-and-hold, a quick double tap, a thumb still popping the
//   loading screen's sprinkles) can never also skip the flight; so is anything
//   while the game is paused (the 'turn your phone' card and its button). Only
//   fresh PRESSES skip (keydown, pointerdown, touchstart — never the up / click
//   tail of a gesture). SKIP: in the morning half, the same landing eased over 0.6 s from
//   wherever the lens is (up to 1.2 s when it is far from the follow framing:
//   ≤ 35 u/s); in the dusk half, a 0.25 s rise to white, the cut to the landed
//   state under it, and 0.35 s back — never a whip across the
//   island, never the sun running back through the afternoon. Key presses in
//   flight are the cinematic's (swallowed in the capture phase: E never boards
//   a ferry, Space never jumps, 1/2/3 never switch a camera nobody is looking
//   through).
//
//   THE LANDING unlocks him at its START (holding him still with input.moveLock
//   and walking him on a script): a locked visitor makes the framing "owned",
//   and owned mode 2 renders as mode 1 — the blend would land on the wrong
//   framing, then jump.
//
//   THE BANNER BIPLANE (planes.js) circles the rim on its own clock, so left
//   alone it drifts through the flight's frames at random, clipped by their
//   edges. The flight CUES it: once where it is AND where it should be are both
//   out of the frame, it is put on its mark (planes.debugTeleport), unseen, and
//   from then on it is part of the flight: its WELCOME TO CANDYLAND banner
//   crosses the low sun, whole, at 16.3-16.9, and is in no other key's frame.
//
// API:  takeover(handoff) → Promise (resolves when the camera has landed)
//       active (bool) · skip() · play(t) (debug: pose the flight at t seconds;
//       holds until something else moves the camera) · duration
//       event 'intro:cinematic:done' { skipped }
// Never runs under ctx.shot unless ?cinematic=1: takeover() then just gives the
// world back (camera on the player, the saved clock and fog) and resolves.
//
// ── THE CAT ISLAND ARRIVAL (WAVE 5, Contract Q · cat-arrival-cinematic) ──────
// Ben: "There should be a cinema fly through of Cat island when you first reach
// cat island." The FIRST 'ferry:arrive' { to: 'cat' } (story flag
// `cat_intro_seen`, set as it starts) hands the camera to a 23.8 s flyover in
// the opening's language — the same Hermite/Catmull-Rom spline of lens and look
// point, the same free view each frame plus a bank into the turns (≤ 4°), the
// HUD hidden (ui.showHud(false) + 'cci-cinema'), the visitor locked on the
// Arrivals Pier where the Sugarfin put him, the world living, the 1.0 s input
// grace, any key / click / tap = skip — and the same landing into MODE 2.
//   (★ = a view in tools/views/intro.json, intro_cat1 … intro_cat6) — every one a LOW OBLIQUE with the sea's
//   horizon and a band of sky across its top (13-19 % of the frame), never a map view (see CAT_KEYS)
//     0.0  the Sugarfin's arrival shot (the live camera as last rendered: no cut)
//     1.5  up and round him to the south, tipping up to the horizon
//     3.0  ★ THE ARRIVALS PIER from off the south-west, low over the water: him
//          on the planks, the WELCOME TO CAT ISLAND arch, POPULATION: 412 cats,
//          1 human (you!), the arrivals hall, the town along the coast
//     5.4  ★ DOWN MAIN STREET from over Welcome Plaza: Purrbucks, the Fish
//          Monger, the Catnip Dispensary, Yarn & Twine, the Purrliament's
//          cat-eared dome and the yarn ball at the end of it
//     7.9  ★ PURRLIAMENT SQUARE from the south: the statue with a human in its
//          paw, the EXITs, the Purrliament and its clock tower
//    10.5  ★ WHISKER HEIGHTS (a pan from the square): across the green and its
//          topiary cat, the cat-eared dormers, the Watchtower beyond, the sea
//    12.9  THE WATCHTOWER: in low over the Heights, then 145° round its lantern
//          (≈ 48°/s) from the south, ★ 14.3 from the sea side, out over Wing
//    15.9  Nut Field — the way home never crosses the tower
//    18.2  home, high over the square: Main Street, the plaza, the pier and the
//          Candy Kingdom across the strait; down over Welcome Plaza (20.6) to
//          the pier (22.5)
//    23.8  ★ behind him on the planks, the whole arch and POPULATION: 412 cats,
//          1 human (you!) ahead of him — 22 u from its pivot, inside the follow
//          framing's distance (the landing never dollies in)
//   Lens ≥ 7 u over every roof and tree from 2 s, ≤ 39 u/s, view yaw ≤ 55°/s;
//   the look never overshoots (monotone tangents, buildCatFlight).
//   LANDING (1.2 s, as the opening's): setFree(null) → setMode(2) → snap() →
//   a cinematic() from the last pose into the follow framing while he walks
//   two steps up the pier (its pivot slid along the line of sight to within the
//   camera's occDist, so a pose further out than the follow distance — a skip —
//   is never pulled in on the first frame; see beginLanding); HUD back;
//   'intro:cat:done' { skipped }. Then the GREETER's first line: the greeters (containment) start their escort on the
//   same 'ferry:arrive', so their lines fall inside the flight, where a hidden
//   HUD drops them — if Pumpkin has not spoken within 0.4 s of the landing we
//   say her first line for her (ui.say, speaker 'Pumpkin').
//   A skip near him eases the landing over 0.6-1.2 s (≤ 35 u/s on average, so
//   the swing round him is never a whip); a skip over the town (lens
//   > 40 u from him) is a 0.25 s rise to white, the cut, and 0.35 s back —
//   never a whip across the island. The clock is never touched.
//   Never under ctx.shot unless ?cinematic=1 (a render never flies).
//   API: catArrival() → Promise (debug: run it now, on the Arrivals Pier) ·
//   playCat(t) (debug: pose it at t) · catDuration · kind ('open' | 'cat')
// ─────────────────────────────────────────────────────────────────────────────
import { DOCKS } from './ferry/route.js';

const DUSK = 18.2;            // the title's golden hour (ui/title.js TITLE_TIME), for play() / no hand-off
const MORNING = 9.5;          // the day starts here unless the hand-off saved another clock
const MORNING_LEAD = 1.0;     // h: after the cut the clock is this far before the day's start, and runs up to it
const T_DIP0 = 16.7, T_CUT = 17.3, T_DIP1 = 17.95, WHITE_HOLD = 0.06;   // the dip to white (peak = the cut)
const T_ORBIT = 23.0;         // the push-in hands over to the orbit here
const ORBIT_DUR = 5.0;
const T_END = T_ORBIT + ORBIT_DUR;
const LAND_DUR = 1.2, SKIP_DUR = 0.6, SKIP_UP = 0.25;
const SKIP_GRACE = 1.0;       // s after takeover (flight clock AND wall clock) in which no input can skip
const DEG = Math.PI / 180;
// The orbit: COUNTER-CLOCKWISE from above (azimuth rising: dir +1), one full turn from and back to
// azEnd — east of him, on the side the find looks from. It is entered AT SPEED (k'(0) = m0: the
// push-in hands over its momentum) and eases to a stop at the end (k'(1) = 0).
const ORBIT = {
  d0: 9, d1: 6, el: 0.3, azEnd: 85 * DEG, turns: 1, dir: 1, m0: 0.56,
  // the lens opens up through the first 60 % of the turn (the island and Cat Island round him), then
  // closes in on him for the hello: fov and pitch go start → mid → end
  mid: 0.6, fov0: 32, fovMid: 36, fov1: 30, pitch0: 0.10, pitchMid: 0.12, pitch1: 0.05,
};
// the lens pitched up (rad, after the lookAt, as camera.cinematic's `pitch`) through the find and the
// push-in (then the orbit's pitch0 → pitch1): he sits low in the frame (feet ≈ 90-92 % down in the
// orbit) with the island, the sea and the sky above him. At the end (fov 30, pitch 0.05) the WELCOME
// TO CANDYLAND sign is kept just ABOVE the frame: from anywhere on the platform the pier's two deck
// lamps and the arch's own lantern (2.5 u in front of the panel) cover 3-4 of its letters
const PITCH = 0.10;
const AIM_Y = 1.15;           // the look point: this far above his feet (the follow camera's aim height)
const FACE_TURN = 1.2;        // s: at the end of the orbit he turns to the lens…
const FACE_ARRIVE = 1.75;     // …from looking back at the Sugarfin that brought him (¾ to the find's lens)
const TURN_HOME = 0.5;        // s: the landing's turn, from the lens to Candyland
const WALK_AT = 0.3;          // the landing's walk starts this far into it (as the turn completes)
const BANK_MAX = 0.045, BANK_K = 0.05;    // rad; bank per rad/s of view yaw
// the visitor: his arrival spot on the ferry platform; the pier planks where teleport lands (the platform
// is over deep water); the spot the landing walks him to (4 u from the gangway foot, out of its prompt)
const ARRIVE = { at: 'candy_dock', dx: 11, dz: 0 };
const ON_DECK = { at: 'candy_dock', dx: 6.5, dz: 0 };
const WALK_TO = { at: 'candy_dock', dx: 7.8, dz: 0 };
// what he faces when the game starts: up the pier, toward the WELCOME TO CANDYLAND arch
const GAME_FACING = -1.50;
// the title's WIDE hero framing (ui/title.js HERO.wide), when no hand-off view was given
const HERO = { target: [-40, 34, -10], azimuth: -0.60, elevation: -0.030, distance: 300 };

// A · THE KEYFRAMES OF THE DUSK SHOT — lens and look point, each [landmark id, dx, y, dz] (y absolute;
// the landmark from world.LANDMARKS). fov is the landscape (≥ 1.6 aspect) vertical lens. The last key
// is the cut, under the white.
const KEYS_A = [
  // t      lens                                   look                                    fov  fog
  [3.6,  ['candy_palace', -84, 40, 164],      ['candy_palace', -10, 24, 12],         40, 3.2],
  [6.8,  ['candy_palace', -72, 48, 42],       ['candy_palace', 0, 29, 0],            38, 2.2],   // ★ the palace
  [9.2,  ['candy_palace', 0, 60, -10],        ['giant_cupcake', -12, 26, -2],        38, 1.9],   // over it
  [11.2, ['giant_cupcake', -34, 40, -46],     ['giant_cupcake', 0, 26, 0],           38, 1.8],   // ★ the cupcake
  [12.9, ['giant_cupcake', -20, 52, -14],     ['giant_cupcake', -22, 18, 28],        38, 1.8],   // past its shoulder
  [15.0, ['candy_village', -10, 34, -40],     ['candy_village', 2, 6, 5],            38, 1.8],   // ★ the village
  [16.4, ['candy_village', -6, 29, -12],      ['candy_village', -50, 27, 14],        38, 1.7],   // turning into the sun
  [T_CUT, ['candy_village', -10, 24, 4],      ['candy_village', -75, 27, 16],        38, 1.6],   // the sun: white
];
// B · THE FIND AND THE PUSH-IN — the lens round HIM: [t, azimuth° from him, horizontal distance, height
// over his feet, fov, fog]; the look is on him (+AIM_Y) throughout. The orbit's first pose closes it.
const KEYS_B = [
  [T_CUT, 55, 36.0, 8.4, 35, 1.2],    // the find (under the white)
  [20.4, 60, 29.0, 7.4, 34, 1.1],     // …three seconds of it  ★ 19.2
  [21.8, 64, 18.0, 6.6, 33, 1.0],     // pushing in over the Sugarfin, the pan already turning the orbit's way
];
const CFG = { KEYS_A, KEYS_B, ORBIT };

// ── THE CAT ISLAND ARRIVAL ────────────────────────────────────────────────────
const CAT_END = 23.8;                 // the flight (then the LAND_DUR landing): 25.0 s in all
const CAT_SKIP_FAR = 40;              // u: a skip with the lens further than this from him dips to white
const CAT_FACE = Math.PI / 2;         // he faces inland: east, up the Arrivals Pier (facing = atan2(dx, dz))
const CAT_WALK = 2.0;                 // u: the landing walks him this far inland, if the planks are clear
const CAT_BANK_MAX = 0.07, CAT_BANK_K = 0.09;   // rad; per rad/s of view yaw (the town turns are tighter)
const CAT_HAPPY = 3.0;                // s before the end: he smiles as the lens comes down to him (by day)
// the greeters' first line (cat/containment/gags.js createGreeters LINES[0]) — said for them after the
// flight if their own went out under the hidden HUD
const GREETER_LINE = { speaker: 'Pumpkin', text: 'A human! A real one! Walk this way, walk this way —' };
// the arrival shot when there is no live one (playCat): the Sugarfin's LAND_SHOT framing, roughly
const CAT_HERO = { azimuth: 1.43, elevation: 0.37, distance: 27, fov: 34, aimY: 1.2 };   // inland of him, looking out to sea
// [t, lens, look, fov, fog, pitch]; a point is [id, dx, y, dz]: id a landmark (y absolute), or 'visitor'
// (dx/dz from his feet, y over them). Lens and look both run the spline; at rest at both ends.
export const CAT_KEYS = [
  // THE HORIZON RULE: every ★ frame keeps its top edge 5-7° above horizontal (the sea's far edge and a band of
  // sky, 13-19 % of the frame), and so does 94 % of the flight (from 1 s: the arrival shot it leaves looks down
  // at him) — low obliques (lens 18-44 u up, 30-65 u back, 11-15° down), never a map view. Lens ≥ 7 u over every
  // roof, tree and chimney (the island's rendered height map) from 2 s, ≥ 5 u as it rises off the arrival shot;
  // ≤ 39 u/s; view yaw ≤ 55°/s.
  // t     lens                                  look                                  fov  fog  pitch
  [1.5,  ['cat_dock', 6, 19, 24],             ['cat_dock', -8, 9, 0],                36, 1.3, 0.08],  // up and round him
  [3.0,  ['cat_dock', -15, 18, 30],           ['cat_dock', 5, 7, -5],                38, 1.8, 0.02],  // ★ the pier
  [5.4,  ['welcome_plaza', -10, 22, 10],      ['main_street', 4, 8, -6],             36, 2.2, 0],     // ★ down Main Street
  [7.9,  ['town_square', -16, 26, 52],        ['town_square', 0, 12, -8],            38, 2.2, 0],     // ★ the square
  [10.5, ['residential', -40, 27, 14],        ['residential', 18, 10, -4],           38, 2.4, 0.03],  // ★ Whisker Heights
  // the Watchtower: 145° round its lantern at r 30 (≈ 48°/s), in from the south over the Heights, round the
  // sea side, out over Wing Nut Field — so the way home never crosses the tower
  [12.9, ['lighthouse', -9.2, 33, 30.5],      ['lighthouse', -4, 26, 1],             38, 2.6, 0],
  [13.6, ['lighthouse', 9.3, 33, 27.9],       ['lighthouse', -4, 26, 1],             38, 2.7, 0],
  [14.3, ['lighthouse', 22.6, 33.5, 14.9],    ['lighthouse', -4, 26, 1],             38, 2.8, 0],     // ★ from the sea side
  [15.1, ['lighthouse', 25.7, 34, -3.6],      ['lighthouse', -4, 26, 1],             39, 3.0, 0],
  [15.9, ['lighthouse', 17.2, 35, -20.2],     ['lighthouse', -4, 26, 1],             40, 3.2, 0.03],  // over Wing Nut Field
  [18.2, ['residential', -13, 44, -36],       ['cat_dock', 6, 10, 0],                40, 3.2, 0.02],  // home, high
  [20.6, ['welcome_plaza', 20, 23, 26],       ['visitor', 6, 1.2, -0.8],             38, 2.2, 0.04],  // over Welcome Plaza
  [22.5, ['visitor', 2, 10, 30],              ['visitor', 4, 1.8, -1.5],             36, 1.4, 0.05],  // down to the pier
  // ★ this way: 22 u from its pivot — inside the follow framing's distance, so the landing never dollies in
  [CAT_END, ['visitor', -12, 8.6, 9.5],       ['visitor', 6, 3, -2.5],               37, 1.0, 0.05],
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const easeIO = (x) => { const t = clamp(x, 0, 1); return 0.5 - 0.5 * Math.cos(Math.PI * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, t) => a + wrap(b - a) * t;

/** The white over the frame at flight time t (0..1): up into the cut, held a moment, back down. */
export function whiteAt(t) {
  if (t <= T_DIP0 || t >= T_DIP1) return 0;
  if (t < T_CUT - WHITE_HOLD) return ease((t - T_DIP0) / (T_CUT - WHITE_HOLD - T_DIP0));
  if (t <= T_CUT + WHITE_HOLD) return 1;
  return 1 - ease((t - T_CUT - WHITE_HOLD) / (T_DIP1 - T_CUT - WHITE_HOLD));
}

/** Where the lens stands for a free view (the camera's own lensAt()). */
function lensOf(v, out) {
  const ce = Math.cos(v.elevation);
  out[0] = v.target[0] + Math.sin(v.azimuth) * ce * v.distance;
  out[1] = v.target[1] + Math.sin(v.elevation) * v.distance;
  out[2] = v.target[2] + Math.cos(v.azimuth) * ce * v.distance;
  return out;
}

/** Hermite through P at `times` with tangents M (per second), segment i at u ∈ [0,1] of length h. */
function herm(P, M, i, u, h, out) {
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  for (let c = 0; c < 3; c++) out[c] = h00 * P[i][c] + h10 * h * M[i][c] + h01 * P[i + 1][c] + h11 * h * M[i + 1][c];
  return out;
}
/** Catmull-Rom tangents in TIME (m_i = (P_i+1 − P_i−1) / (t_i+1 − t_i−1)); the ends one-sided. */
function tangents(P, times) {
  const n = P.length;
  return P.map((p, i) => {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    return p.map((_, c) => (P[b][c] - P[a][c]) / (times[b] - times[a]));
  });
}

/**
 * The flight as a pure function of time (no THREE; node-testable). `world` needs
 * LANDMARKS; `hero` is the first free view ({target, azimuth, elevation, distance,
 * fov}); `arrive` = {x, y, z} his feet. sample(t, out) fills out = {lens[3], look[3],
 * fov, fog, pitch, white, orbit, az}; allocation only here, at build time.
 */
export function buildFlight(world, hero, arrive, cfg = CFG) {
  const LM = world.LANDMARKS, OB = cfg.ORBIT;
  const pt = (k) => { const L = LM[k[0]] || { x: 0, z: 0 }; return [L.x + k[1], k[2], L.z + k[3]]; };
  const aim = [arrive.x, arrive.y + AIM_Y, arrive.z];
  const orbitK = (s) => { const t = clamp(s, 0, 1), t2 = t * t, t3 = t2 * t; return (t3 - 2 * t2 + t) * OB.m0 + (3 * t2 - 2 * t3); };
  const orbitAz = (k) => OB.azEnd - OB.dir * OB.turns * 2 * Math.PI * (1 - k);
  const orbitLens = (az, d, out) => {
    const ce = Math.cos(OB.el);
    out[0] = aim[0] + Math.sin(az) * ce * d; out[1] = aim[1] + Math.sin(OB.el) * d; out[2] = aim[2] + Math.cos(az) * ce * d;
    return out;
  };
  // A: the hero view (at rest) → the dusk keys → the cut (flying on into the white)
  const tA = [0], lA = [lensOf(hero, [0, 0, 0])], kA = [hero.target.slice()], fovA = [hero.fov || 46], fogA = [hero.fog || 1];
  for (const k of cfg.KEYS_A) { tA.push(k[0]); lA.push(pt(k[1])); kA.push(pt(k[2])); fovA.push(k[3]); fogA.push(k[4]); }
  const mlA = tangents(lA, tA), mkA = tangents(kA, tA);
  for (let c = 0; c < 3; c++) { mlA[0][c] = 0; mkA[0][c] = 0; }
  // B: the find → the push-in → the orbit's first pose, arriving with the orbit's own velocity (C1)
  const tB = [], lB = [], fovB = [], fogB = [];
  for (const k of cfg.KEYS_B) {
    const a = k[1] * DEG;
    tB.push(k[0]); lB.push([aim[0] + Math.sin(a) * k[2], arrive.y + k[3], aim[2] + Math.cos(a) * k[2]]); fovB.push(k[4]); fogB.push(k[5]);
  }
  tB.push(T_ORBIT); lB.push(orbitLens(orbitAz(0), OB.d0, [0, 0, 0])); fovB.push(OB.fov0); fogB.push(1);
  const mlB = tangents(lB, tB);
  const oa = orbitLens(orbitAz(0), OB.d0, [0, 0, 0]);
  const ob = orbitLens(orbitAz(1e-3), lerp(OB.d0, OB.d1, 1e-3), [0, 0, 0]);
  for (let c = 0; c < 3; c++) mlB[lB.length - 1][c] = (ob[c] - oa[c]) / 1e-3 * OB.m0 / ORBIT_DUR;
  const seg = (times, t) => { let i = 0; while (i < times.length - 2 && t >= times[i + 1]) i++; return i; };
  const f = {
    aim, duration: T_END, timesA: tA, timesB: tB,
    /** Fill out = { lens, look, fov, fog, pitch, white, orbit (0..1 or -1), az } for flight time t. */
    sample(t, out) {
      out.white = whiteAt(t);
      if (t >= T_ORBIT) {
        const s = clamp((t - T_ORBIT) / ORBIT_DUR, 0, 1), k = orbitK(s);
        const az = orbitAz(k);
        orbitLens(az, lerp(OB.d0, OB.d1, k), out.lens);
        out.look[0] = aim[0]; out.look[1] = aim[1]; out.look[2] = aim[2];
        const m = OB.mid ?? 0.5, a = ease(k / m), b = ease((k - m) / (1 - m));
        out.fov = k < m ? lerp(OB.fov0, OB.fovMid ?? OB.fov1, a) : lerp(OB.fovMid ?? OB.fov0, OB.fov1, b);
        out.pitch = k < m ? lerp(OB.pitch0 ?? PITCH, OB.pitchMid ?? PITCH, a) : lerp(OB.pitchMid ?? PITCH, OB.pitch1 ?? PITCH, b);
        out.fog = 1; out.orbit = s; out.az = az;
        return out;
      }
      out.orbit = -1; out.az = 0;
      if (t >= T_CUT) {
        const i = seg(tB, t), h = tB[i + 1] - tB[i], u = clamp((t - tB[i]) / h, 0, 1);
        herm(lB, mlB, i, u, h, out.lens);
        out.look[0] = aim[0]; out.look[1] = aim[1]; out.look[2] = aim[2];
        const w = ease(u);
        out.fov = lerp(fovB[i], fovB[i + 1], w); out.fog = lerp(fogB[i], fogB[i + 1], w);
        out.pitch = PITCH;
        return out;
      }
      const tt = clamp(t, 0, T_CUT);
      const i = seg(tA, tt), h = tA[i + 1] - tA[i], u = clamp((tt - tA[i]) / h, 0, 1);
      herm(lA, mlA, i, u, h, out.lens);
      herm(kA, mkA, i, u, h, out.look);
      const w = ease(u);
      out.fov = lerp(fovA[i], fovA[i + 1], w); out.fog = lerp(fogA[i], fogA[i + 1], w);
      out.pitch = 0;
      return out;
    },
  };
  return f;
}

/**
 * The Cat Island flyover as a pure function of time (no THREE; node-testable): lens and look
 * point each on a time-parameterised Catmull-Rom (Hermite) spline from the arrival shot `hero`
 * through CAT_KEYS, at rest at both ends. `arrive` = {x, y, z} his feet. sample(t, out) fills
 * out = {lens[3], look[3], fov, fog, pitch, white (0), orbit (-1), az}.
 */
export function buildCatFlight(world, hero, arrive, keys = CAT_KEYS) {
  const LM = world.LANDMARKS;
  const pt = (k) => {
    if (k[0] === 'visitor') return [arrive.x + k[1], arrive.y + k[2], arrive.z + k[3]];
    const L = LM[k[0]] || { x: 0, z: 0 };
    return [L.x + k[1], k[2], L.z + k[3]];
  };
  const T = [0], L = [lensOf(hero, [0, 0, 0])], K = [hero.target.slice()];
  const F = [hero.fov || 34], G = [hero.fog || 1], P = [hero.pitch || 0];
  for (const k of keys) { T.push(k[0]); L.push(pt(k[1])); K.push(pt(k[2])); F.push(k[3]); G.push(k[4]); P.push(k[5] || 0); }
  const mL = tangents(L, T), mK = tangents(K, T), n = T.length;
  for (let c = 0; c < 3; c++) { mL[0][c] = 0; mK[0][c] = 0; mL[n - 1][c] = 0; mK[n - 1][c] = 0; }
  // the LOOK never overshoots (Fritsch-Carlson, per axis): held on a landmark over several keys and then
  // sent across the island, a Catmull-Rom look first swings the wrong way (the Watchtower: 9 u east,
  // then back through it) — a pan that doubles back. At a key where an axis turns (or rests) its
  // tangent is 0; elsewhere it is kept within 3 × either neighbouring secant.
  for (let i = 1; i < n - 1; i++) {
    for (let c = 0; c < 3; c++) {
      const d0 = (K[i][c] - K[i - 1][c]) / (T[i] - T[i - 1]), d1 = (K[i + 1][c] - K[i][c]) / (T[i + 1] - T[i]);
      if (d0 * d1 <= 0) mK[i][c] = 0;
      else mK[i][c] = Math.sign(d0) * Math.min(Math.abs(mK[i][c]), 3 * Math.abs(d0), 3 * Math.abs(d1));
    }
  }
  const end = T[n - 1];
  const seg = (t) => { let i = 0; while (i < n - 2 && t >= T[i + 1]) i++; return i; };
  return {
    duration: end, times: T, lensKeys: L, lookKeys: K,
    sample(t, out) {
      const tt = clamp(t, 0, end);
      const i = seg(tt), h = T[i + 1] - T[i], u = clamp((tt - T[i]) / h, 0, 1);
      herm(L, mL, i, u, h, out.lens);
      herm(K, mK, i, u, h, out.look);
      const w = ease(u);
      out.fov = lerp(F[i], F[i + 1], w); out.fog = lerp(G[i], G[i + 1], w); out.pitch = lerp(P[i], P[i + 1], w);
      out.white = 0; out.orbit = -1; out.az = 0;
      return out;
    },
  };
}

/** Free-view numbers (azimuth / elevation / distance) for a lens looking at a point. */
export function viewFrom(lens, look, v) {
  const dx = lens[0] - look[0], dy = lens[1] - look[1], dz = lens[2] - look[2];
  const d = Math.max(1e-3, Math.hypot(dx, dy, dz));
  v.target[0] = look[0]; v.target[1] = look[1]; v.target[2] = look[2];
  v.distance = d;
  v.elevation = Math.asin(clamp(dy / d, -1, 1));
  v.azimuth = Math.atan2(dx, dz);
  return v;
}

/** The clock over the flight: held at dusk (whatever the title parked it at) until the white; then
 *  from an hour before the day's start FORWARD to it, reached as the orbit ends. */
export function clockAt(t, dusk, day) {
  if (t < T_CUT) return dusk;
  const v = lerp(day - MORNING_LEAD, day, clamp((t - T_CUT) / (T_END - T_CUT), 0, 1));
  return ((v % 24) + 24) % 24;
}

export function create(ctx) {
  const THREE = ctx.THREE;
  const world = ctx.world;
  const cinemaOK = !ctx.shot || ctx.params?.get?.('cinematic') === '1';
  const aspectK = () => { const a = (window.innerWidth || 1600) / Math.max(1, window.innerHeight || 1000); return a < 1.6 ? Math.min(1.6 / a, 2.2) : 1; };
  /** The authored lens is for a ≥ 1.6 window; a narrower one keeps the horizontal reach (≤ 70°). */
  const fovFor = (v) => { const k = aspectK(); return k === 1 ? v : Math.min(70, 2 * Math.atan(Math.tan(v * Math.PI / 360) * k) * 180 / Math.PI); };

  // ── state (all preallocated: nothing below allocates per frame) ─────────────
  let phase = 'idle';          // idle · fly · skipdip · land · done
  let clock = 0, landT = 0, landDur = LAND_DUR, graceT = 0, skipT = 0;
  let flight = null, skipped = false, cutLand = false, resolveFn = null, promise = null;
  let saved = { time: MORNING, frozen: false, fog: 1 };
  let dusk = DUSK, dayTime = MORNING, timeFrom = MORNING, fogFrom = 1, whiteFrom = 0, white0 = 0;
  let faceFrom = 0, lastEmotion = null, hudHidden = false, lastPitch = 0;
  let posedT = null;           // play(): the pose being held
  // which flight: 'open' (Contract K, the title hand-off) or 'cat' (the Cat Island arrival)
  let kind = 'open', flightEnd = T_END, gameFacing = GAME_FACING;
  let catVisitedT = 0, catSeen = false;           // on foot on Cat Island before any ferry arrival: seen it
  let greetT = -1, greetHeard = false, greetWatch = false;
  const catHero = { target: [0, 0, 0], azimuth: 0, elevation: 0, distance: 38, fov: 34, fog: 1, pitch: 0 };
  const catDoneEv = { skipped: false };
  // the Sugarfin's arrival shot, as last rendered: the ferry snaps the follow camera in the very update
  // that emits 'ferry:arrive', so the flyover starts from the pose we saw on the frame before
  const lastCamPos = new THREE.Vector3(), lastCamQ = new THREE.Quaternion(), FWD = new THREE.Vector3();
  let lastCamFov = 34, lastCamOK = false;
  const posedLens = new THREE.Vector3();
  const S = { lens: [0, 0, 0], look: [0, 0, 0], fov: 38, fog: 1, pitch: 0, white: 0, orbit: -1, az: 0 };
  const S2 = { lens: [0, 0, 0], look: [0, 0, 0], fov: 38, fog: 1, pitch: 0, white: 0, orbit: -1, az: 0 };
  const view = { target: [0, 0, 0], azimuth: 0, elevation: 0, distance: 10, fov: 38 };
  const fromView = { target: [0, 0, 0], azimuth: 0, elevation: 0, distance: 10, fov: 38 };
  const heroView = { target: [0, 0, 0], azimuth: 0, elevation: 0, distance: 300, fov: 46, fog: 5 };
  const arrive = { x: 0, y: 0, z: 0 };
  const walkFrom = { x: 0, z: 0 }, walkTo = { x: 0, z: 0 }, onDeck = { x: 0, z: 0 };
  const cineTarget = [0, 0, 0];
  const cineOpts = { target: cineTarget, azimuth: 0, elevation: 0, distance: 6, fov: 30, pitch: 0, noTilt: true, duration: LAND_DUR, in: 0, hold: 0, out: LAND_DUR };
  const doneEv = { skipped: false };
  const tmpV = new THREE.Vector3(), tmpD = new THREE.Vector3();
  const HIDE = ['flyer_thermals', 'flyer_thermal_shell'];   // play() and the Cat flyover (the title hides them for the opening)
  const hidden = [];

  const cam = () => ctx.systems.camera;
  const pl = () => ctx.systems.player;

  // ── the white (a DOM wash over the canvas, under the HUD's skip hint) ───────
  const WHITE_STEPS = 64;
  const WHITE_OPA = Array.from({ length: WHITE_STEPS + 1 }, (_, i) => (i / WHITE_STEPS).toFixed(3));
  let whiteEl = null, whiteIdx = 0, whiteNow = 0;
  function setWhite(v) {
    whiteNow = clamp(v, 0, 1);
    const i = Math.round(whiteNow * WHITE_STEPS);
    if (i === whiteIdx) return;
    whiteIdx = i;
    if (!whiteEl) {
      if (typeof document === 'undefined') return;
      const host = ctx.renderer?.domElement?.parentNode || document.body;
      whiteEl = document.createElement('div');
      whiteEl.className = 'cci-intro-white';
      whiteEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none;opacity:0;'
        + 'background:radial-gradient(ellipse at 50% 35%, #fffdf7 0%, #fff6e6 60%, #ffeed6 100%);';
      host.appendChild(whiteEl);
    }
    whiteEl.style.opacity = WHITE_OPA[i];
    whiteEl.style.display = i ? '' : 'none';
  }

  function heroDefault(out) {
    const a = (window.innerWidth || 1600) / Math.max(1, window.innerHeight || 1000);
    out.target[0] = HERO.target[0]; out.target[1] = HERO.target[1]; out.target[2] = HERO.target[2];
    out.azimuth = HERO.azimuth; out.elevation = HERO.elevation; out.distance = HERO.distance;
    out.fov = clamp(2 * Math.atan(Math.tan(34.2 * Math.PI / 180) / a) * 180 / Math.PI, 34, 62);
    out.fog = HERO.distance / 60;
    return out;
  }
  function spot(s, out) {
    const L = world.LANDMARKS[s.at] || world.PLAYER_START;
    out.x = L.x + s.dx; out.z = L.z + s.dz;
    return out;
  }
  /** Put him on the ferry platform, standing, locked. teleport() cannot see planks over deep water,
   *  so he lands on the pier's planks and slides along them to his spot (same deck height). */
  function placeVisitor() {
    const p = pl();
    spot(ARRIVE, arrive); spot(WALK_TO, walkTo); spot(ON_DECK, onDeck);
    walkFrom.x = arrive.x; walkFrom.z = arrive.z;
    if (p?.teleport) {
      p.locked = true;
      p.setPose?.('stand');
      if (Math.hypot(p.position.x - arrive.x, p.position.z - arrive.z) > 0.05) {
        p.teleport(onDeck.x, onDeck.z);
        if (p.position.y > 2) {                       // on the planks: slide out to the platform
          p.position.x = arrive.x; p.position.z = arrive.z;
          p.group?.position?.copy?.(p.position);
        } else {                                      // no pier where we expected one: stand where we landed
          arrive.x = walkFrom.x = walkTo.x = p.position.x; arrive.z = walkFrom.z = walkTo.z = p.position.z;
        }
      }
      arrive.y = p.position.y;
    } else arrive.y = world.height(arrive.x, arrive.z);
  }
  /** The Cat arrival: he stands where the Sugarfin put him (teleport: debug — onto her landing spot on
   *  the Arrivals Pier), locked, facing inland; the landing's walk goes CAT_WALK up the planks, as far
   *  as they are level and clear (Contract A pushOut / groundInfo). */
  function placeCatVisitor(teleport) {
    const p = pl();
    const d = DOCKS?.cat, L = world.LANDMARKS.cat_dock || { x: 42, z: 22 };
    const lx = Number.isFinite(d?.landX) ? d.landX : L.x - 8, lz = Number.isFinite(d?.z) ? d.z : L.z;
    if (!p?.position) { arrive.x = lx; arrive.z = lz; arrive.y = world.height(lx, lz); walkFrom.x = walkTo.x = lx; walkFrom.z = walkTo.z = lz; return; }
    if (teleport && Math.hypot(p.position.x - lx, p.position.z - lz) > 0.05) p.teleport(lx, lz);
    p.locked = true; p.onFerry = false;
    p.velocity?.set?.(0, 0, 0);
    p.setPose?.('stand');
    p.facing = CAT_FACE;
    arrive.x = walkFrom.x = walkTo.x = p.position.x; arrive.y = p.position.y; arrive.z = walkFrom.z = walkTo.z = p.position.z;
    const gi = p.groundInfo, po = p.pushOut;
    if (typeof gi !== 'function' || typeof po !== 'function') return;
    const dx = Math.sin(CAT_FACE), dz = Math.cos(CAT_FACE);
    for (let s = 0.25; s <= CAT_WALK + 1e-6; s += 0.25) {
      const x = arrive.x + dx * s, z = arrive.z + dz * s;
      const g = gi.call(p, x, z), o = po.call(p, x, z, 0.45);
      if (!g || !Number.isFinite(g.h) || Math.abs(g.h - arrive.y) > 0.35 || g.water || o.hit) break;
      walkTo.x = x; walkTo.z = z;
    }
  }
  /** The arrival shot the flyover starts from: the live camera (the Sugarfin's), or a stand-in. */
  function catHeroFrom(live) {
    const aimX = arrive.x, aimY = arrive.y + CAT_HERO.aimY, aimZ = arrive.z;
    if (live && ctx.camera) {
      let P = ctx.camera.position, fov = ctx.camera.fov;
      if (lastCamOK) { P = lastCamPos; fov = lastCamFov; tmpD.set(0, 0, -1).applyQuaternion(lastCamQ); }
      else { ctx.camera.updateMatrixWorld(); ctx.camera.getWorldDirection(tmpD); }
      const dist = Math.max(8, Math.hypot(P.x - aimX, P.y - aimY, P.z - aimZ));
      S2.lens[0] = P.x; S2.lens[1] = P.y; S2.lens[2] = P.z;
      S2.look[0] = P.x + tmpD.x * dist; S2.look[1] = P.y + tmpD.y * dist; S2.look[2] = P.z + tmpD.z * dist;
      viewFrom(S2.lens, S2.look, catHero);
      // the live lens is already the window's; the flight's fovs are landscape ones, widened by fovFor()
      const k = aspectK();
      catHero.fov = k === 1 ? fov : 2 * Math.atan(Math.tan(fov * Math.PI / 360) / k) * 180 / Math.PI;
    } else {
      catHero.target[0] = aimX; catHero.target[1] = aimY; catHero.target[2] = aimZ;
      catHero.azimuth = CAT_HERO.azimuth; catHero.elevation = CAT_HERO.elevation;
      catHero.distance = CAT_HERO.distance; catHero.fov = CAT_HERO.fov;
    }
    catHero.fog = Math.max(1, ctx.state.fogScale || 1);
    catHero.pitch = 0;
    return catHero;
  }
  /** Start the Cat Island flyover (the first ferry arrival, or the debug hook). */
  function startCat(teleport) {
    if (api.active) return promise || Promise.resolve(catDoneEv);
    if (posedT !== null) unpose();
    kind = 'cat'; flightEnd = CAT_END; gameFacing = CAT_FACE;
    catSeen = true;
    try { ctx.systems.story?.set?.('cat_intro_seen', true); } catch (e) { /* the story's */ }
    saved = { time: ctx.state.time, frozen: !!ctx.state.timeFrozen, fog: ctx.state.fogScale };
    placeCatVisitor(teleport);
    if (teleport) { const f = ctx.systems.ferry; if (f?.moor && f.state?.phase === 'idle' && f.state.side !== 'cat') { try { f.moor('cat'); } catch (e) { /* hers */ } } }
    flight = buildCatFlight(world, catHeroFrom(!teleport), arrive);
    hideThermals();                                  // the flyer's shimmer columns: gameplay, not scenery (as the title)
    clock = 0; graceT = 0; armedAt = wallNow(); skipped = false; lastEmotion = undefined;
    greetT = -1; greetHeard = false; greetWatch = true;
    phase = 'fly';
    hud(false);
    listen(true);
    promise = new Promise((res) => { resolveFn = res; });
    applyFlight(0);
    return promise;
  }
  // the first ferry arrival on Cat Island (containment greets on the same event, before us)
  ctx.events.on('ferry:arrive', (e) => {
    const to = (e && typeof e === 'object') ? (e.to ?? e.island ?? e.dock) : e;
    if (to !== 'cat' || !cinemaOK || api.active || posedT !== null || catSeen) return;
    if (ctx.systems.story?.get?.('cat_intro_seen')) { catSeen = true; return; }
    if (!cam()?.setFree) return;
    startCat(false);
  });
  // did the greeter get a line out (after the flight)? then we do not say it for her
  ctx.events.on('ui:say', (e) => { if (greetWatch && e && (e.speaker === GREETER_LINE.speaker || e.speaker === 'Dumpling')) greetHeard = true; });

  function mooredAtPier(force) {
    const f = ctx.systems.ferry;
    if (!f?.moor || f.state?.phase !== 'idle') return;
    if (force || f.state.side !== 'candy') { try { f.moor('candy'); } catch (e) { /* a screenshot nicety only */ } }
  }
  function hud(show) {
    const root = ctx.uiRoot;
    if (root?.classList) root.classList.toggle('cci-cinema', !show);
    try { ctx.systems.ui?.showHud?.(show); } catch (e) { /* the ui owns its HUD; we only ask */ }
    hudHidden = !show;
  }
  function emotion(e) { if (e !== lastEmotion) { lastEmotion = e; pl()?.setEmotion?.(e); } }

  /** His facing over the flight: toward the Sugarfin (and the find's lens), then round to the lens. */
  function facingAt(t, s) {
    if (s.orbit < 0) return FACE_ARRIVE;
    const k = easeIO((t - (T_END - FACE_TURN)) / FACE_TURN);
    return lerpAngle(FACE_ARRIVE, ORBIT.azEnd, k);
  }

  /** The bank: a little roll into the pan, from the look's yaw rate (deterministic: the spline at
   *  t ± 0.2, kept inside the shot — the cut is not a pan). */
  function bankAt(t) {
    if (kind === 'cat') return catBankAt(t);
    if (t >= T_ORBIT - 0.2 || t <= 0.2) return 0;
    const a = t < T_CUT ? 0 : T_CUT, b = t < T_CUT ? T_CUT - 1e-3 : T_ORBIT - 1e-3;
    const t0 = Math.max(a, t - 0.2), t1 = Math.min(b, t + 0.2);
    if (t1 - t0 < 0.1) return 0;
    flight.sample(t0, S2); const a0 = Math.atan2(S2.lens[0] - S2.look[0], S2.lens[2] - S2.look[2]);
    flight.sample(t1, S2); const a1 = Math.atan2(S2.lens[0] - S2.look[0], S2.lens[2] - S2.look[2]);
    const edge = t < T_CUT ? ease(t / 2) * ease((T_CUT - t) / 1.2) : ease((t - T_CUT) / 1.0) * ease((T_ORBIT - t) / 1.2);
    return clamp(wrap(a1 - a0) / (t1 - t0) * BANK_K, -BANK_MAX, BANK_MAX) * edge;
  }
  /** The Cat flyover's bank: the same rule over one continuous shot, a little deeper (the turns over
   *  the town are tighter), faded in off the arrival shot and out onto him. */
  function catBankAt(t) {
    if (t <= 0.2 || t >= flightEnd - 0.2) return 0;
    const t0 = Math.max(0, t - 0.2), t1 = Math.min(flightEnd, t + 0.2);
    flight.sample(t0, S2); const a0 = Math.atan2(S2.lens[0] - S2.look[0], S2.lens[2] - S2.look[2]);
    flight.sample(t1, S2); const a1 = Math.atan2(S2.lens[0] - S2.look[0], S2.lens[2] - S2.look[2]);
    const edge = ease(t / 2) * ease((flightEnd - t) / 1.8);
    return clamp(wrap(a1 - a0) / (t1 - t0) * CAT_BANK_K, -CAT_BANK_MAX, CAT_BANK_MAX) * edge;
  }

  // ── the banner biplane ──────────────────────────────────────────────────────
  // BANNER.phase: where on its loop (0..1, planes.pathPoint) it is at flight time BANNER.t; the cue
  // looks for an unseen moment in [cueFrom, cueTo]. Precomputed per takeover: the loop length and its
  // mark at every CUE_STEP (so the per-frame test only projects numbers).
  // Its WELCOME TO CANDYLAND banner crosses the sunset at 16.3-16.9, whole (≈ 38 % of the frame
  // wide, 60 u out, beside the sun) and clips no other key's frame; its mark is off-screen from 4.5 s.
  const BANNER = { t: 15.0, phase: 0.265, cueFrom: 0.6, cueTo: 14.0 };
  const CUE_STEP = 0.25;
  let cued = true, loopLen = 0;
  const cueTab = [];           // [x, y, z, tailx, taily, tailz] per CUE_STEP
  function bannerPhase(t) { return BANNER ? ((BANNER.phase + (t - BANNER.t) * (ctx.systems.planes?.routes?.biplane?.speed || 13) / Math.max(1, loopLen)) % 1 + 1) % 1 : 0; }
  function prepareBanner() {
    const P = ctx.systems.planes;
    cued = true;
    if (!BANNER || !P?.pathPoint || !P.debugTeleport) return;
    loopLen = 0;
    let q0 = P.pathPoint('biplane', 0);
    for (let i = 1; i <= 240; i++) { const q = P.pathPoint('biplane', i / 240); loopLen += Math.hypot(q.x - q0.x, q.y - q0.y, q.z - q0.z); q0 = q; }
    cueTab.length = 0;
    for (let t = BANNER.cueFrom; t <= BANNER.cueTo + 1e-6; t += CUE_STEP) {
      const f = bannerPhase(t), a = P.pathPoint('biplane', f), b = P.pathPoint('biplane', f - 30 / loopLen);
      cueTab.push([a.x, a.y, a.z, b.x, b.y - 3, b.z]);
    }
    cued = false;
  }
  function inFrame(x, y, z) {
    tmpV.set(x, y, z).project(ctx.camera);
    return tmpV.z < 1 && Math.abs(tmpV.x) < 1.2 && Math.abs(tmpV.y) < 1.2;
  }
  function cueBanner(t) {
    if (cued || !BANNER) return;
    if (t < BANNER.cueFrom) return;
    if (t > BANNER.cueTo) { cued = true; return; }                 // no unseen moment: it flies free
    const P = ctx.systems.planes, a = P?.aircraft?.biplane;
    if (!a) { cued = true; return; }
    const row = cueTab[Math.min(cueTab.length - 1, Math.round((t - BANNER.cueFrom) / CUE_STEP))];
    const h = a.heading || 0;
    if (inFrame(a.x, a.y, a.z) || inFrame(a.x - Math.sin(h) * 30, a.y - 3, a.z - Math.cos(h) * 30)) return;
    if (inFrame(row[0], row[1], row[2]) || inFrame(row[3], row[4], row[5])) return;
    try { P.debugTeleport('biplane', bannerPhase(t), false); } catch (e) { /* the sky is planes.js's */ }
    cued = true;
  }

  /** Pose everything the flight owns at time t (camera, clock, fog, white, visitor). */
  function applyFlight(t) {
    flight.sample(t, S);
    viewFrom(S.lens, S.look, view);
    view.fov = fovFor(S.fov);
    const c = cam();
    c?.setFree?.(view);
    // after the lookAt: the pitch (the find, the orbit) then the bank (flight) — in the camera's own frame
    const roll = bankAt(t);
    lastPitch = S.pitch;
    if (S.pitch > 1e-5) ctx.camera.rotateX(S.pitch);
    if (roll) ctx.camera.rotateZ(roll);
    if (S.pitch > 1e-5 || roll) ctx.camera.updateMatrixWorld();
    setWhite(S.white);
    const st = ctx.state, p = pl();
    if (kind === 'cat') {
      // the clock is the world's: it runs on under the flyover; only the haze is ours
      st.fogScale = Math.max(saved.fog ?? 1, S.fog);
      if (p) {
        p.locked = true;
        p.facing = CAT_FACE;
        emotion(t >= flightEnd - CAT_HAPPY && !ctx.state.isNight ? 'happy' : null);
      }
      return;
    }
    st.time = clockAt(t, dusk, dayTime); st.timeFrozen = true;
    st.fogScale = t >= T_ORBIT ? saved.fog : S.fog;
    if (p) {
      p.locked = true;
      p.facing = facingAt(t, S);
      emotion(t >= T_END - FACE_TURN ? 'happy' : null);
    }
  }

  // ── skip listeners (window, capture, only while active) ─────────────────────
  // In flight every key is the cinematic's: swallowed before input.js / the HUD see it.
  const NO_SCROLL = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const wallNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  let armedAt = 0;             // wall ms (performance clock) of the takeover
  /** May this input event skip? Not inside the grace (flight clock and wall clock, the latter by the
   *  event's own timeStamp: a tap queued behind a long frame is judged by when the finger landed),
   *  and not while the game is paused (the 'turn your phone' card is being tapped). */
  const maySkip = (e) => {
    if (graceT < SKIP_GRACE || ctx.state.paused) return false;
    const n = wallNow();
    let ts = e && e.timeStamp;
    if (!(ts > 0) || ts > n + 50 || n - ts > 10000) ts = n;    // not on the performance clock (an old engine): now
    return ts - armedAt >= SKIP_GRACE * 1000;
  };
  const onKey = (e) => {
    if (phase !== 'fly' && phase !== 'skipdip') return;
    e.stopImmediatePropagation();
    if (NO_SCROLL.has(e.code)) e.preventDefault();
    if (!e.repeat && phase === 'fly' && maySkip(e)) api.skip();
  };
  const onPoint = (e) => { if (phase === 'fly' && maySkip(e)) api.skip(); };
  const TOUCH_OPT = { capture: true, passive: true };
  let listening = false;
  function listen(on) {
    if (on === listening) return;
    listening = on;
    if (on) {
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('pointerdown', onPoint, true);
      window.addEventListener('touchstart', onPoint, TOUCH_OPT);
    } else {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPoint, true);
      window.removeEventListener('touchstart', onPoint, TOUCH_OPT);
    }
  }

  /** Into MODE 2: the camera on him again, a blend from the lens we leave, him turning round. */
  function beginLanding(wasSkip) {
    phase = 'land'; landT = 0; skipped = wasSkip; cutLand = false;
    landDur = wasSkip ? SKIP_DUR : LAND_DUR;
    // the pose we leave from: the last free view we drove (a skip: wherever the flight is now)
    fromView.target[0] = view.target[0]; fromView.target[1] = view.target[1]; fromView.target[2] = view.target[2];
    fromView.azimuth = view.azimuth; fromView.elevation = view.elevation; fromView.distance = view.distance; fromView.fov = view.fov;
    timeFrom = ctx.state.time; fogFrom = ctx.state.fogScale ?? 1; whiteFrom = whiteNow;
    const p = pl(), c = cam();
    faceFrom = p ? p.facing : gameFacing;
    if (p) { p.locked = false; p.facing = gameFacing; walkFrom.x = p.position.x; walkFrom.z = p.position.z; }   // snap() hangs the tether behind THIS facing
    if (ctx.input) ctx.input.moveLock = 2;
    if (c?.setFree) {
      c.setFree(null);
      c.setMode?.(2);
      c.snap?.();
      // a SKIP eases to the follow framing in 0.6 s — or longer when the lens has further to go (≤ 35 u/s
      // on average, ≤ LAND_DUR): a skip over the pier early in the Cat flyover swings 42 u round him, which
      // at 0.6 s is a whip (4 u a frame); snap() has just put the lens where the blend will end
      if (wasSkip) {
        lensOf(fromView, S2.lens);
        const P = ctx.camera.position;
        landDur = clamp(Math.hypot(S2.lens[0] - P.x, S2.lens[1] - P.y, S2.lens[2] - P.z) / 35, SKIP_DUR, LAND_DUR);
      }
      if (c.cinematic) {
        cineTarget[0] = fromView.target[0]; cineTarget[1] = fromView.target[1]; cineTarget[2] = fromView.target[2];
        cineOpts.azimuth = fromView.azimuth; cineOpts.elevation = fromView.elevation; cineOpts.distance = fromView.distance;
        // THE HAND-OFF DISTANCE: snap() restarts the camera's occlusion dolly (occDist) at the follow
        // framing's distance, and the lens stands at min(the blend's distance, occDist) — so a pose further
        // from its pivot than that was pulled in on the first frame and eased back out after (a 3.4 u
        // lurch). Slide the pivot along the lens's own line of sight until it is no further than occDist:
        // the very same pose on the first frame, a nearer point to blend from.
        const cap = Number(c.occDist) - 0.05;
        if (cap > 2 && fromView.distance > cap) {
          lensOf(fromView, S2.lens);
          const k = 1 - cap / fromView.distance;
          for (let i = 0; i < 3; i++) cineTarget[i] = fromView.target[i] + (S2.lens[i] - fromView.target[i]) * k;
          cineOpts.distance = cap;
        }
        cineOpts.fov = fromView.fov; cineOpts.pitch = lastPitch; cineOpts.duration = landDur; cineOpts.out = landDur;
        c.cinematic(cineOpts);
        // this frame was already composed by the camera (it runs before us): hold the pose we
        // leave from for it, so snap()'s follow framing never flashes for a frame
        lensOf(fromView, S2.lens);
        ctx.camera.position.set(S2.lens[0], S2.lens[1], S2.lens[2]);
        tmpV.set(fromView.target[0], fromView.target[1], fromView.target[2]);
        ctx.camera.lookAt(tmpV);
        if (lastPitch > 1e-5) ctx.camera.rotateX(lastPitch);
        if (ctx.camera.fov !== fromView.fov) { ctx.camera.fov = fromView.fov; ctx.camera.updateProjectionMatrix(); }
        ctx.camera.updateMatrixWorld();
      }
    }
    if (p) p.facing = faceFrom;
    emotion(wasSkip ? null : 'happy');
  }

  /** A skip in the dusk half: at the top of its white the world is simply the landed one. */
  function cutLanding() {
    phase = 'land'; landT = 0; skipped = true; cutLand = true;
    landDur = SKIP_DUR - SKIP_UP;
    const st = ctx.state, p = pl(), c = cam();
    if (kind !== 'cat') { st.time = dayTime; st.timeFrozen = true; }
    st.fogScale = saved.fog;
    timeFrom = dayTime; fogFrom = saved.fog ?? 1;
    if (p) {
      p.locked = false; p.facing = gameFacing; p.scriptedWalk = 0;
      p.position.x = walkTo.x; p.position.z = walkTo.z; p.velocity?.set?.(0, 0, 0);
      p.group?.position?.copy?.(p.position);
    }
    if (ctx.input) ctx.input.moveLock = 2;
    if (c?.setFree) { c.setFree(null); c.setMode?.(2); c.snap?.(); }
    setWhite(1);
    emotion(null);
  }

  /** The landing's walk: off the ferry platform, up the pier (scripted, so the rig walks it). */
  function walk(dt) {
    const p = pl(); if (!p) return;
    p.facing = lerpAngle(faceFrom, gameFacing, easeIO(landT / Math.min(TURN_HOME, landDur * 0.5)));
    const kw = easeIO((landT / landDur - WALK_AT) / (1 - WALK_AT));
    const x = lerp(walkFrom.x, walkTo.x, kw), z = lerp(walkFrom.z, walkTo.z, kw);
    p.scriptedWalk = dt > 0 ? Math.hypot(x - p.position.x, z - p.position.z) / dt : 0;
    p.position.x = x; p.position.z = z;
    p.velocity?.set?.(0, 0, 0);
  }

  function finish() {
    phase = 'done';
    const st = ctx.state, p = pl();
    if (p) {
      p.locked = false; p.facing = gameFacing; p.scriptedWalk = 0;
      p.position.x = walkTo.x; p.position.z = walkTo.z;
    }
    emotion(null);                                         // back to the automatic mood
    if (kind !== 'cat') { st.time = dayTime; st.timeFrozen = !!saved.frozen; }
    st.fogScale = saved.fog;
    setWhite(0);
    hud(true);
    // the camera chip (1 ISO · 2 FOLLOW · 3 TOP) is a reminder that shows for a few seconds after
    // the mode changes; the mode changed under the cinema, so show it now that the HUD is back —
    // the same with or without a skip, and whatever mode the camera was in before
    const u = ctx.systems.ui, m = cam()?.mode;
    if (u?.setCameraMode && (m === 1 || m === 2 || m === 3)) { u.setCameraMode(m === 1 ? 2 : 1); u.setCameraMode(m); }
    listen(false);
    const ev = kind === 'cat' ? catDoneEv : doneEv;
    ev.skipped = skipped;
    if (kind === 'cat') {
      for (const h of hidden) h.o.visible = h.vis;         // the thermals come back
      hidden.length = 0;
      greetT = 0.4;                                        // the greeter's first line, unless she says it herself
      ctx.events.emit('intro:cat:done', ev);
    } else ctx.events.emit('intro:cinematic:done', ev);
    const r = resolveFn; resolveFn = null; promise = null;
    if (r) r(ev);
  }

  /** Hand the world back at once (under ctx.shot, or when there is no camera to fly). */
  function giveBack() {
    const c = cam(), st = ctx.state;
    if (c?.setFree) { c.setFree(null); c.snap?.(); }
    st.time = saved.time ?? st.time; st.timeFrozen = !!saved.frozen; st.fogScale = saved.fog;
    try { ctx.events.emit('time:set', st.time); } catch (e) { /* listeners are theirs */ }
    doneEv.skipped = true;
    ctx.events.emit('intro:cinematic:done', doneEv);
  }

  // ── play(t): the debug pose (renders) ────────────────────────────────────────
  let heldPlanes = false;
  function unpose() {
    posedT = null;
    for (const h of hidden) h.o.visible = h.vis;
    hidden.length = 0;
    const p = pl(); if (p) p.locked = false;
    emotion(null);
    setWhite(0);
    if (heldPlanes) { heldPlanes = false; try { ctx.systems.planes?.setHold?.(false); } catch (e) { /* theirs */ } }
    if (hudHidden) hud(true);
  }
  function hideThermals() {
    for (const nm of HIDE) {
      const o = ctx.scene?.getObjectByName?.(nm);
      if (o && !hidden.some((h) => h.o === o)) { hidden.push({ o, vis: o.visible }); o.visible = false; }
    }
  }

  const api = {
    get active() { return phase === 'fly' || phase === 'skipdip' || phase === 'land'; },
    get phase() { return phase; },
    get clock() { return phase === 'fly' || phase === 'skipdip' ? clock : phase === 'land' ? flightEnd + landT : 0; },
    get white() { return whiteNow; },
    duration: T_END + LAND_DUR,
    /** Which flight is (or was last) flown: 'open' (the title hand-off) or 'cat' (the Cat Island arrival). */
    get kind() { return kind; },
    catDuration: CAT_END + LAND_DUR,
    /** The Cat flyover's keyframe times (QA). */
    get catKeyTimes() { return [0, ...CAT_KEYS.map((k) => k[0])]; },
    /** QA: the Cat flyover's lens / look at time t (allocates). */
    catSample(t) { const f = kind === 'cat' && flight ? flight : buildCatFlight(world, catHeroFrom(false), arrive); const o = { lens: [0, 0, 0], look: [0, 0, 0] }; f.sample(t, o); return o; },
    /** Debug: fly the Cat Island arrival now, from the Arrivals Pier (he is put on the Sugarfin's landing
     *  spot, she is moored there). Resolves when the camera has landed. Honours ?shot like takeover(). */
    catArrival() {
      if (!cinemaOK || !cam()?.setFree) return Promise.resolve({ skipped: true });
      return startCat(true);
    },
    /** Debug: pose the Cat flyover at t seconds (the visitor on the Arrivals Pier, the Sugarfin moored,
     *  the HUD hidden) and hold it until something else moves the camera. */
    playCat(t = 0) {
      if (api.active) return false;
      const tt = clamp(Number(t) || 0, 0, CAT_END);
      kind = 'cat'; flightEnd = CAT_END; gameFacing = CAT_FACE;
      if (posedT === null) saved = { time: ctx.state.time, frozen: true, fog: 1 };
      placeCatVisitor(true);
      const f = ctx.systems.ferry;
      if (f?.moor && f.state?.phase === 'idle') { try { f.moor('cat'); } catch (e) { /* hers */ } }
      hideThermals();
      flight = buildCatFlight(world, catHeroFrom(false), arrive);
      lastEmotion = undefined;
      hud(false);
      posedT = tt;
      applyFlight(tt);
      posedLens.copy(ctx.camera.position);
      return true;
    },
    /** The flight's keyframe times (QA). */
    get keyTimes() { return [0, ...KEYS_A.map((k) => k[0]), ...KEYS_B.slice(1).map((k) => k[0]), T_ORBIT, T_END]; },

    /**
     * Contract K: the title card hands over. handoff = { view: the title's free view,
     * saved: { time, frozen, fog } (the clock and fog before the title took them) }.
     * Returns a Promise that resolves once the camera has landed in mode 2.
     */
    takeover(handoff = {}) {
      if (api.active && promise) return promise;
      const sv = handoff.saved || {};
      saved = {
        time: Number.isFinite(sv.time) ? sv.time : MORNING,
        frozen: !!sv.frozen,
        fog: sv.fog,
      };
      if (!cinemaOK || !cam()?.setFree) { giveBack(); return Promise.resolve({ skipped: true }); }
      if (posedT !== null) unpose();
      kind = 'open'; flightEnd = T_END; gameFacing = GAME_FACING;
      dusk = Number.isFinite(ctx.state.time) ? ctx.state.time : DUSK;
      dayTime = saved.time;
      heroDefault(heroView);
      const v = handoff.view;
      if (v && Array.isArray(v.target) && Number.isFinite(v.distance)) {
        heroView.target[0] = v.target[0]; heroView.target[1] = v.target[1]; heroView.target[2] = v.target[2];
        heroView.azimuth = v.azimuth ?? heroView.azimuth; heroView.elevation = v.elevation ?? heroView.elevation;
        heroView.distance = v.distance; heroView.fov = v.fov || heroView.fov;
      }
      heroView.fog = Math.max(1, ctx.state.fogScale || 1);
      // the hero fov is already the window's; the flight's own fovs are scaled per aspect in fovFor()
      // — so feed the spline the hero's LANDSCAPE-equivalent lens and let fovFor() widen it back
      const k = aspectK();
      if (k !== 1) heroView.fov = 2 * Math.atan(Math.tan(heroView.fov * Math.PI / 360) / k) * 180 / Math.PI;
      placeVisitor();
      mooredAtPier(false);
      flight = buildFlight(world, heroView, arrive);
      prepareBanner();
      clock = 0; graceT = 0; armedAt = wallNow(); skipped = false; lastEmotion = undefined;
      phase = 'fly';
      hud(false);
      listen(true);
      promise = new Promise((res) => { resolveFn = res; });
      applyFlight(0);
      return promise;
    },

    /** Ease to the end state over 0.6 s (any key / click / tap does this while active). */
    skip() {
      if (phase === 'fly' && kind === 'cat') {
        // over the town: dip to white and cut (no whip across the island); near him: ease the landing
        const far = Math.hypot(S.lens[0] - arrive.x, S.lens[1] - arrive.y, S.lens[2] - arrive.z) > CAT_SKIP_FAR;
        if (far) { phase = 'skipdip'; skipT = 0; white0 = whiteNow; } else beginLanding(true);
      } else if (phase === 'fly') {
        if (clock < T_CUT) { phase = 'skipdip'; skipT = 0; white0 = whiteNow; }   // dusk: dip to white, cut
        else beginLanding(true);
      } else if (phase === 'land' && !skipped) landT = Math.max(landT, landDur);   // already landing: land now
    },

    /** Debug: pose the flight at t seconds (clock, fog, white, visitor, banner, HUD hidden) and hold it. */
    play(t = 0) {
      if (api.active) return false;
      const tt = clamp(Number(t) || 0, 0, T_END);
      kind = 'open'; flightEnd = T_END; gameFacing = GAME_FACING;
      if (posedT === null || saved.frozen !== true || saved.time !== MORNING) {
        saved = { time: MORNING, frozen: true, fog: 1 };
        dusk = DUSK; dayTime = MORNING;
      }
      placeVisitor();
      mooredAtPier(true);
      hideThermals();
      heroDefault(heroView);
      const k = aspectK();
      if (k !== 1) heroView.fov = 2 * Math.atan(Math.tan(heroView.fov * Math.PI / 360) / k) * 180 / Math.PI;
      flight = buildFlight(world, heroView, arrive);
      prepareBanner();
      if (BANNER && loopLen > 0) {
        try { ctx.systems.planes.debugTeleport('biplane', bannerPhase(tt), true); heldPlanes = true; } catch (e) { /* theirs */ }
      }
      cued = true;
      lastEmotion = undefined;
      hud(false);
      posedT = tt;
      applyFlight(tt);
      posedLens.copy(ctx.camera.position);
      return true;
    },

    update(dt) {
      if (posedT !== null) {
        // held until somebody else moves the camera (the next view, setView(null), a teleport's snap)
        const c = cam();
        if (!c?.isFree?.() || ctx.camera.position.distanceToSquared(posedLens) > 1e-6) { unpose(); return; }
        applyFlight(posedT);
        return;
      }
      // on a crossing: remember the frame we render (the Cat flyover starts from it, see catHeroFrom)
      if (ctx.state.ferry) { lastCamOK = true; lastCamPos.copy(ctx.camera.position); lastCamQ.copy(ctx.camera.quaternion); lastCamFov = ctx.camera.fov; }
      else if (phase !== 'fly') lastCamOK = false;
      if (greetT >= 0) {
        // after the Cat flyover: the greeter's first line, if hers went out under the hidden HUD
        greetT -= dt;
        if (greetHeard) { greetT = -1; greetWatch = false; }
        else if (greetT < 0) {
          greetWatch = false;
          if (!api.active && ctx.state.island === 'cat') {
            try { ctx.systems.ui?.say?.(GREETER_LINE.text, { speaker: GREETER_LINE.speaker }); } catch (e) { /* the ui's */ }
          }
        }
      }
      if (phase === 'idle' || phase === 'done') {
        // on foot on Cat Island for a while before any ferry arrival (a blimp, a biplane): he has seen it
        if (!catSeen && ctx.state.island === 'cat' && !ctx.state.ferry && !pl()?.onFerry && !pl()?.onVehicle && !ctx.state.vehicle) {
          catVisitedT += dt;
          if (catVisitedT > 20) { catSeen = true; try { ctx.systems.story?.set?.('cat_intro_seen', true); } catch (e) { /* theirs */ } }
        }
      }
      if (phase === 'fly') {
        if (ctx.state.paused) return;
        clock += dt; graceT += dt;
        if (clock >= flightEnd) { applyFlight(flightEnd); beginLanding(false); return; }
        applyFlight(clock);
        if (kind === 'open') cueBanner(clock);
      } else if (phase === 'skipdip') {
        if (ctx.state.paused) return;
        clock = Math.min(clock + dt, (kind === 'cat' ? flightEnd : T_CUT) - 1e-3); skipT += dt;
        applyFlight(clock);                                  // the dusk flight carries on under the white…
        setWhite(Math.max(whiteNow, lerp(white0, 1, ease(skipT / SKIP_UP))));
        if (skipT >= SKIP_UP) cutLanding();                  // …and at its top the world is the landed one
      } else if (phase === 'land') {
        landT += dt;
        const k = clamp(landT / landDur, 0, 1);
        if (!cutLand) walk(dt);
        if (ctx.input) ctx.input.moveLock = 2;         // unlocked (so mode 2 is the real follow), but still
        const st = ctx.state;
        if (kind !== 'cat') { st.time = lerp(timeFrom, dayTime, easeIO(k)); st.timeFrozen = true; }
        if (Number.isFinite(fogFrom)) st.fogScale = lerp(fogFrom, saved.fog ?? 1, easeIO(k));
        setWhite(cutLand ? 1 - ease(k) : whiteFrom * (1 - ease(k * 2)));
        if (landT >= landDur) finish();
      }
    },
  };
  return api;
}
