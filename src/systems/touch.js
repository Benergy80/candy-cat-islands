// ─────────────────────────────────────────────────────────────────────────────
// TOUCH — phones & tablets (BRIEF WAVE 3, Contracts H + H2 + I).
//
// Nothing else in the game knows touch exists. This file turns fingers into
// exactly what the keyboard and mouse already produce, so no other system
// changes:
//   left thumb   a FLOATING stick: the ring (112 px) appears where the thumb
//                lands and fades when it lifts → ctx.input.virtual {x, y}
//                (|v| ≤ 1; past RUN_AT it also holds 'ShiftLeft' = run)
//   right thumb  drag on empty screen → pointer.orbit + dragDX/dragDY (camera
//                orbit only: never pointer.down, so a slow drag can never fire
//                the held item); two fingers pinch → ctx.input.wheel (zoom)
//   buttons      a synthetic keydown on press and keyup on release, dispatched
//                on document.body: input.js adds the code to `pressed` once and
//                to `keys` while held, and ui.js's capture-phase listeners
//                (dialogue advance, intro dismissal) see what a real key does.
//
// LAYOUT (Contract H2 — "controls that stay out of the way"): corners only.
//   top-left     the objective as ONE-line chip (tap = expand) + candy pill,
//                the near map under it (the world map opens there too)
//   top-right    the clock and ONE row of 44-px icon chips: LOOK (holds V; a
//                drag from it orbits) · camera mode · map · help — beside the
//                clock in landscape (the top strip), under it upright
//   bottom-right the thumb FAN around A (jump, 56 px, the corner): an inner
//                ring of USE (48, the held item's glyph) · TALK (48, the E key:
//                HIDDEN until interaction.nearest() is non-null, then teal with
//                the prompt's verb; NEXT while a conversation is open) · ROLL
//                (44), and an outer ring of DUCK and SWAP (44, tap = next item,
//                long-press = the tray: the hotbar's slots, tap one). Icons +
//                small-caps words, no keyboard letters but A (and B in flight).
//                Every box sits outside the central 60 % × 60 %.
//   dialogue     a talk the PLAYER starts (E / 'interact', or a scripted beat
//                while the visitor is locked) gets the full panel: bottom-centre
//                between the stick and the fan, ≤ 40 % wide (upright: at the
//                TOP, under the map). Starting one drops any chatter first, and
//                the talk waits up to CONVO_PEND s for its first line (a paced
//                containment reply), then lasts until the box has been empty
//                CONVO_GAP s. A line from a kid or a citizen the player did not
//                address (sourpatch's photobomb answers every 'interact') is
//                chatter even mid-talk: it never takes the panel nor keeps the
//                talk alive. Ambient chatter (passing NPC lines, a sour
//                patch kid's giggle) never does: ui.js's panel is hidden and the
//                line runs as a one-line-ish SUBTITLE under the toast slot — name
//                tag + text, no portrait, no E — that lets go of the line after
//                3-4.2 s and never eats an E / B press.
//   Style: the HUD's plate family — cream fill, 2-px navy edge, ink icons; the
//   pressed button fills with its colour; no shadows or glows; after 3 s
//   without a touch every control fades to 22 % and the next touch restores
//   it. Coverage (all control boxes ∩ viewport, iPhone 13): ≈ 7 % at rest,
//   ≈ 11 % with the stick + orbit ring, ≈ 8 % with TALK lit.
//   flying       B is the boost dash (blue, a ring refills while it recharges);
//                A reads 'flap'; DUCK, ROLL, SWAP and TALK leave the screen; the flyer's HUD
//                hangs under the map and stays up — the flight help plate takes
//                the bottom gap between the stick and B instead.
//   help (? chip) a plate of touch how-to under the objective (the near map
//                yields to it) + a tag beside every icon chip / ghost chip. A
//                line of dialogue it would touch wins: the plate steps aside.
//   small phones (landscape < 740 px wide, iPhone SE class): a conversation
//                is a bottom SHEET from the stick to A (text ≥ 60 % of the card,
//                whole words only; USE/DUCK/ROLL/SWAP step aside, NEXT moves over A).
//   everywhere   disabled B / F are opaque desaturated cream (no world bleeding
//                through); the star pill docks under the objective and the
//                stack (map, help plate, flyer HUD) hangs under it.
//   upright map  the WORLD map spans the width (≥ 90 %, centred) under the icon
//                row and above the thumbs; the explored atlas keeps its ≥ 12-px
//                footer; a tap on either closes it back to the near map.
//   words        no keyboard on a phone, so no keyboard words: key chips are
//                hidden, and ui.toast / say / banner / setObjective are wrapped
//                (same signatures, same return values) to say buttons instead
//                ('(Q/E)' → '(swipe)', 'F swaps' → 'SWAP swaps', …: KEY_TEXT).
// Plus a mobile quality tier (pixel ratio ≤ 1.5, shadow maps ≤ 1024, cheaper
// PCF) and one injected <style> that re-fits the HUD to a phone — ui.js and
// style.js are not edited; everything is scoped under body.cci-touch.
//
// API  ctx.systems.touch
//   enabled                  true while the touch controls are on
//   enable(v = true, opt?)   switch at runtime; opt.quality = true also applies
//                            the mobile tier; opt.transient = true switches it
//                            off again at the next setTime() (render views)
//   applyMobileQuality()     ctx.state.quality = 'mobile' + the caps above
//   quality                  'mobile' | 'high' (mirrors ctx.state.quality)
//   stick                    { x, y, active, run } — the left stick, read-only
//   portrait                 true while the 'turn your phone' card is up
//   showRotate(v)            test hook: force the rotate card (null = auto)
//   showHelp(v)              force the help plate (null = follow ui's card)
//   openTray() / closeTray() the held-item tray (long-press on F does it)
//   coverage()               { pct, area, vw, vh, items: [{ id, rect }] } of the
//                            visible control boxes ∩ viewport (Contract H2 metric;
//                            the chatter subtitle is a caption, not a control)
//   dialogue                 'talk' (full panel) | 'chat' (subtitle) | null
//   touchText(s)             s with its keyboard words said as buttons (touch on)
//   rewrites                 the last 24 { from, to } the HUD wrappers rewrote
// EVENTS  'touch:enabled' { on }
// URL     ?touch=1 forces touch mode on a desktop (testing), ?touch=0 forbids it.
// ─────────────────────────────────────────────────────────────────────────────
import { item as itemGlyph, glyphForItem } from './ui/glyphs.js';

const RING = 112;          // the stick's outer ring, px (Contract H2: ≤ 120)
const STICK_R = 44;        // knob travel from the ring's centre, px
const DEAD = 0.13;         // stick dead zone (fraction of the travel)
const RUN_AT = 0.85;       // |v| past this = Shift held (run)
const LOOK_SLOP = 8;       // px before a right-thumb press becomes a camera drag
const LOOK_GAIN = 1.15;    // phones are small: a thumb-width swipe should turn more
const PINCH_K = 3.2;       // wheel units per px of pinch (camera: 0.035 u / unit)
const SHADOW_CAP = 1024;
const PIXEL_RATIO_CAP = 1.5;
const FLY_MAX = 1.1;       // flyer HUD growth cap on phones
const IDLE_AFTER = 3;      // s without a touch → the controls fade to 22%
const LONG_PRESS = 0.45;   // s holding the F chip → the item tray
const TRAY_LIFE = 5;       // s an untouched tray stays open
const TRAY_S = 0.8;        // the tray's scale (ui.js's hotbar rack, shrunk for a phone)
const OBJ_LIFE = 7;        // s an expanded objective stays open
const OUT_T = 0.26;        // s the released stick takes to fade before it returns to rest
const CHAT_MIN = 3, CHAT_MAX = 4.2;   // s a line of ambient chatter stays up as a subtitle
const CONVO_GAP = 1.6;     // s between lines a conversation survives (containment paces its lines ≤ ~1 s apart)
const CONVO_ADV = 7;       // … after the player skipped a line (the next paced line may be up to 6.5 s away)
const CONVO_PEND = 7;      // s a conversation the player just started waits for its FIRST line (containment paces ≤ 6.5 s)
const HUSH_T = 0.35;       // s a line we dropped may still be falling out of ui.js's box (not a line, never the panel)

// kind: arc (the thumb fan's 56/48-px buttons) · gho (its 44-px outer ring) · sys (the 44-px icon row)
const BUTTONS = [
  { id: 'a', code: 'Space', key: ' ', label: 'A', verb: 'jump', kind: 'arc' },
  { id: 'e', code: 'KeyE', key: 'e', icon: 'talk', verb: 'talk', kind: 'arc' },
  { id: 'b', code: 'KeyX', key: 'x', label: 'B', verb: 'use', kind: 'arc' },
  { id: 'c', code: 'KeyC', key: 'c', icon: 'duck', verb: 'duck', kind: 'gho' },
  { id: 'r', code: 'KeyR', key: 'r', icon: 'roll', verb: 'roll', kind: 'gho' },
  { id: 'f', code: 'KeyF', key: 'f', icon: 'swap', verb: 'swap', kind: 'gho' },
  { id: 'look', code: 'KeyV', key: 'v', icon: 'eye', verb: 'look around', kind: 'sys', tag: 'look' },
  { id: 'cam', code: 'Digit1', key: '1', icon: 'cam', verb: 'camera mode', kind: 'sys', tag: 'camera' },
  { id: 'map', code: 'KeyM', key: 'm', icon: 'map', verb: 'map', kind: 'sys', tag: 'map' },
  { id: 'help', code: 'KeyH', key: 'h', icon: 'help', verb: 'help', kind: 'sys', tag: 'help' },
];

// E's label is the prompt's first word when it is a verb we know ('Talk to Peony' → TALK); else just 'E'
const E_VERBS = { talk: 'talk', ask: 'ask', open: 'open', enter: 'enter', take: 'take', pick: 'take', grab: 'take', read: 'read',
  board: 'board', ride: 'ride', buy: 'buy', climb: 'climb', pet: 'pet', ring: 'ring', use: 'use', sit: 'sit', fly: 'fly',
  install: 'fit', fit: 'fit', fix: 'fix', knock: 'knock', feed: 'feed', sail: 'sail', mount: 'mount', search: 'search',
  check: 'check', rest: 'rest', sleep: 'sleep', trade: 'trade', pull: 'pull', push: 'push', turn: 'turn', wind: 'wind',
  crank: 'crank', drop: 'drop', give: 'give', load: 'load', launch: 'launch', listen: 'listen', look: 'look', play: 'play' };
const PATHS = {
  cam: '<path d="M3.5 8.5h3l1.6-2.4h7.8l1.6 2.4h3v10h-17z"/><circle cx="12" cy="13.2" r="3.3"/>',
  map: '<path d="M3 6.5l5.5-2.2 7 2.4 5.5-2.2v13l-5.5 2.2-7-2.4L3 19.5z"/><path d="M8.5 4.3v13M15.5 6.7v13"/>',
  help: '<path d="M8.6 8.8a3.5 3.5 0 1 1 5.2 3.1c-1.1.6-1.8 1.3-1.8 2.6"/><path d="M12 18.5v.2"/>',
  eye: '<path d="M2.5 12s3.6-6.2 9.5-6.2 9.5 6.2 9.5 6.2-3.6 6.2-9.5 6.2S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.9"/>',
  hand: '<path d="M9 11V5.5a1.6 1.6 0 0 1 3.2 0V11m0-1.2V4.4a1.6 1.6 0 0 1 3.2 0v6.2m0-4.2a1.6 1.6 0 0 1 3.2 0V14c0 4-2.6 7-6.4 7-3 0-4.4-1.6-6-4.2l-2.3-3.9a1.6 1.6 0 0 1 2.7-1.7L9 13"/>',
  therm: '<path d="M5.5 21c-1.8-2.4 1.8-4 0-6.4s1.8-4 0-6.4M18.5 21c-1.8-2.4 1.8-4 0-6.4s1.8-4 0-6.4"/><path d="M12 20V5M8.6 8.4 12 5l3.4 3.4"/>',
  // the action fan: duck (down into a crouch), roll (a turn), swap (next item), talk (a speech bubble), next (skip ahead)
  duck: '<path d="M12 3.5v10.5M7.2 9.8 12 14.6l4.8-4.8"/><path d="M4.5 19.5h15"/>',
  roll: '<path d="M19.2 12.6A7.3 7.3 0 1 1 16.4 6"/><path d="M17.4 2.6 16.8 6.4l3.7.9"/>',
  swap: '<path d="M4.5 8.5h13.5M14.5 4.8l3.7 3.7-3.7 3.7"/><path d="M19.5 15.5H6M9.5 11.8l-3.7 3.7 3.7 3.7"/>',
  talk: '<path d="M5.8 5h12.4a2.3 2.3 0 0 1 2.3 2.3v6.6a2.3 2.3 0 0 1-2.3 2.3H11l-4.4 3.6v-3.6h-.8a2.3 2.3 0 0 1-2.3-2.3V7.3A2.3 2.3 0 0 1 5.8 5z"/><path d="M8.6 10.6h.1M12 10.6h.1M15.4 10.6h.1"/>',
  next: '<path d="M5.5 6.5l5.5 5.5-5.5 5.5M12.5 6.5l5.5 5.5-5.5 5.5"/>',
};
// E's icon: a speech bubble for the talking verbs, the hand for everything else
const TALKY = new Set(['talk', 'ask', 'listen']);

// Keyboard words → the buttons a phone has. Applied (touch on) to the text of
// ui.toast / say / banner / setObjective and to ui.js's own weapon sub-line.
// Longest phrases first; a single letter only where it is plainly a key
// ('F swaps', '(M)', 'press E'), never a bare capital in prose. The sources
// (grep of src/systems): camera.js MODE_TOAST '(Q/E)' · inventory.js 'F to
// cycle, click or X to …' · weapons.js 'Click or X: … F swaps …' · ui.js
// hintSub 'click or X to use · F swaps' · flyer.js 'E to take off' / '(E to
// fly again)' / 'Pull up (W)' / the desktop flight line · canoe.js 'WASD …
// Space = …' · catapult.js 'press E at the …' / '(M: map)' · cave.js '(M:
// map)' / 'on your map (M)' · title.js 'press any key' — plus the LOOK (V)
// phrasings the camera may use.
const KEY_TEXT = [
  [/Space flaps · W\/S pitch · A\/D bank · Shift boost/g, 'A flaps · stick steers + pitches · B boosts'],
  [/\bpress any key(?:\s*·\s*tap to start)?/gi, 'tap to start'],
  [/\(Q\/E\)/g, '(swipe)'],
  [/\bQ\/E\b/g, 'swipe'],
  [/\b(?:left-)?click or X to use\b/gi, 'tap USE'],
  [/\b(?:left-)?click or X to\b/gi, 'tap USE to'],
  [/\b(?:left-)?click or X\b/gi, 'USE'],
  [/\b[BX] to use\b/g, 'tap USE'],
  [/\bF swaps\b/g, 'SWAP swaps'],
  [/\bF to (cycle|swap)\b/g, 'SWAP to $1'],
  [/\bV \(hold\)/g, 'hold LOOK'],
  [/\bhold V\b/gi, 'hold LOOK'],
  [/\btap V\b/gi, 'tap LOOK'],
  [/\bWASD\b/g, 'the stick'],
  [/\bW\/S\b/g, 'stick up / down'],
  [/\bA\/D\b/g, 'stick left / right'],
  [/\(W\)/g, '(stick up)'],
  [/\bhold Shift\b/gi, 'push the stick to the rim'],
  [/\bShift\b/g, 'the stick at the rim'],
  [/\bSpace\b/g, 'JUMP'],
  [/\bpress E\b/gi, 'tap TALK'],
  [/\bE to\b/g, 'TALK to'],
  [/\(E\)/g, '(TALK)'],
  [/\bE \/ Enter\b|\bE\/Enter\b/g, 'TALK'],
  [/\bmap \(M\)/gi, 'map'],
  [/\(M: map\)/g, '(MAP)'],
  [/\bM: map\b/g, 'MAP'],
  [/\(M\)/g, '(MAP)'],
  [/\bpress M\b/gi, 'tap MAP'],
  [/\bpress H\b/gi, 'tap ?'],
  [/\(H\)/g, '(?)'],
];
/** `s` with its keyboard words said as touch buttons (non-strings pass through untouched). */
function keyFree(s) {
  if (typeof s !== 'string' || !s) return s;
  let t = s;
  for (const [re, rep] of KEY_TEXT) t = t.replace(re, rep);
  return t;
}
/** A line icon in currentColor: ink on the cream chips, cream on a pressed / lit one. */
const ico = (name, w = 2.3) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
/** A plain line icon in currentColor (the help plate's row markers). */
const lineIco = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
/** A button face: the letter (and the verb under it) as SVG text with an ink hairline under the cream. */
const face = (ch, verb, box = 48) => {
  const c = box / 2;
  const cy = verb ? c - box * 0.07 : c;
  return `<svg class="face" viewBox="0 0 ${box} ${box}" aria-hidden="true">`
    + (ch ? `<text class="ch" x="${c}" y="${cy.toFixed(1)}">${ch}</text>` : '')
    + (verb ? `<text class="vb" x="${c}" y="${(box * 0.78).toFixed(1)}">${String(verb).toUpperCase()}</text>` : '')
    + '</svg>';
};
/** An icon button face: the icon over its small-caps word (no word = the icon centred). */
const iconFace = (name, verb, box = 44) => `<span class="gl${verb ? '' : ' solo'}">${ico(name, 2.2)}</span>${verb ? face('', verb, box) : ''}`;
const PHONE_SVG = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"><rect x="19" y="6" width="26" height="52" rx="6"/><path d="M28 12h8" stroke-linecap="round"/><circle cx="32" cy="50" r="2.4" fill="currentColor" stroke="none"/></svg>';
const TURN_SVG = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M50 30a19 19 0 0 0-33-11"/><path d="M15 10v10h10"/></svg>';

// ── the injected stylesheet ──────────────────────────────────────────────────
// Everything is scoped under body.cci-touch so a desktop never sees it. The HUD
// panels keep their own dt-driven inline transforms; the individual `scale`
// property composes with those instead of fighting them. Positions that depend
// on what the HUD is showing arrive as custom properties from fit() (touch.js
// measures a few times a second): --tch-tl (objective row bottom), --tch-maps
// (map scale), --tch-colx/colw/colt (toast column), --tch-sayx/sayw/sayb
// (dialogue + tray), --tch-trayx/trayb (tray over a dialogue line), --tch-rowt
// (icon row top), --tch-flyt/flys (flyer HUD).
const CSS = `
body.cci-touch {
  --sl: env(safe-area-inset-left, 0px); --sr: env(safe-area-inset-right, 0px);
  --st: env(safe-area-inset-top, 0px);  --sb: env(safe-area-inset-bottom, 0px);
  --tc-cream: #fff7e8; --tc-line: rgba(255,247,232,.92); --tc-ink: rgb(38,30,58);
  /* the HUD's plate family (style.js): cream fill, navy edge, ink marks */
  --tc-fill: rgba(255,250,241,.9); --tc-fill2: rgba(255,238,219,.9); --tc-edge: #2b2442; --tc-mark: #2f2748;
}
#ui .tch { display: none; position: fixed; -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: none; }
body.cci-touch #ui .tch { display: block; }
#ui .tch-ghost, #ui .tch-ghost * { pointer-events: none !important; }

/* the full-screen finger catcher: under every HUD plate, over the canvas */
#ui .tch-layer { inset: 0; z-index: 2; }

/* every control: fades to 22% after IDLE_AFTER s without a touch */
#ui .tch-fade { transition: opacity .5s ease, scale .09s ease-out, background-color .09s; }
body.cci-touch.tch-idle #ui .tch-fade { opacity: .22; }
body.cci-touch.tch-idle #ui .tch-e.lit { opacity: .3; }      /* a hair above the rest: something is in reach */

/* ── floating stick ───────────────────────────────────────────────────────── */
/* at rest: a small dashed hint in the corner; under a thumb: the full ring */
#ui .tch-joy { z-index: 44; width: ${RING}px; height: ${RING}px; left: calc(16px + var(--sl)); bottom: calc(14px + var(--sb));
  scale: .58; transform-origin: 0 100%; opacity: .5; }
#ui .tch-joy.on { scale: 1; opacity: 1; transition: none; }
#ui .tch-joy.out { scale: 1; opacity: 0; transition: opacity ${OUT_T}s ease-out; }
#ui .tch-joy-base { position: absolute; inset: 0; border-radius: 50%; box-sizing: border-box; border: 2px dashed rgba(43,36,66,.6);
  background: rgba(255,250,241,.2); }
#ui .tch-joy.on .tch-joy-base, #ui .tch-joy.out .tch-joy-base { border: 2px solid rgba(43,36,66,.72); background: rgba(255,250,241,.24);
  box-shadow: inset 0 0 0 1.5px rgba(255,250,241,.75); }
#ui .tch-joy.run .tch-joy-base { border-color: #c77d0c; box-shadow: inset 0 0 0 2px rgba(255,211,110,.95); }
#ui .tch-joy-knob { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
  box-sizing: border-box; background: linear-gradient(180deg, #fffaf1, #ffeedb); border: 2px solid var(--tc-edge); will-change: transform; }
#ui .tch-joy:not(.on):not(.out) .tch-joy-knob { opacity: .75; }

/* the right thumb's touch point while it orbits the camera: a cream ring with navy hairlines */
#ui .tch-ring { z-index: 3; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; left: 0; top: 0;
  box-sizing: border-box; border: 2px solid rgba(255,250,241,.85); box-shadow: 0 0 0 1.5px rgba(43,36,66,.45), inset 0 0 0 1.5px rgba(43,36,66,.45); opacity: 0; }
#ui .tch-ring.on { opacity: 1; }

/* ── buttons: the HUD's plate family (cream fill, navy edge, ink marks) ───── */
#ui .tch-btn {
  --s: 48px; z-index: 48; width: var(--s); height: var(--s); margin: 0; padding: 0; box-sizing: border-box;
  border-radius: 50%; border: 2px solid var(--tc-edge); color: var(--tc-mark);
  background-color: var(--tc-fill); background-image: linear-gradient(180deg, var(--tc-fill), var(--tc-fill2));
  box-shadow: none; outline: none; cursor: pointer; display: none; overflow: visible;
}
body.cci-touch #ui .tch-btn { display: block; }
#ui .tch-btn .face { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
#ui .tch-btn .face text { text-anchor: middle; dominant-baseline: central; stroke: none; fill: currentColor; }
#ui .tch-btn .face .ch { font: 800 21px var(--fdisp); }
#ui .tch-btn .face .vb { font: 900 7.6px var(--fbody); letter-spacing: .09em; }
#ui .tch-btn .ico { position: absolute; left: 50%; top: 50%; width: 56%; height: 56%; transform: translate(-50%,-50%); }
#ui .tch-btn .gl { position: absolute; left: 50%; top: 41%; width: 50%; height: 50%; transform: translate(-50%,-50%); }
#ui .tch-btn .gl.solo { top: 50%; width: 56%; height: 56%; }
#ui .tch-btn .n { position: absolute; right: -3px; top: -3px; min-width: 15px; padding: 2px 3px; box-sizing: border-box; border-radius: 8px;
  background: var(--tc-ink); border: 1px solid var(--tc-line); font: 800 8.5px/1 var(--fbody); color: var(--tc-cream); text-align: center; }
/* pressed: the button fills with its own colour and the mark turns cream */
#ui .tch-btn.on { scale: 1.08; background-image: none; background-color: var(--full, var(--tc-ink)); color: var(--tc-cream); }

/* THE THUMB FAN around A (the corner). Centres on rings round A's centre
   (42, 42 from the corner): inner r 78 — USE 180°, TALK 135°, ROLL 90°; outer
   r 136 — SWAP 120°, DUCK 96° (landscape: the fan climbs the right edge and
   stays right of the central 60 % × 60 %, iPhone SE included); upright the
   outer ring swings low (r 142 — DUCK 154°, SWAP 180°) so every box stays under
   it. No two boxes touch. */
#ui .tch-a { --s: 56px; --full: #ef4f84; right: calc(14px + var(--sr)); bottom: calc(14px + var(--sb)); }
#ui .tch-a .face .ch { font-size: 22px; }
#ui .tch-b { --full: #e39a1e; right: calc(96px + var(--sr)); bottom: calc(18px + var(--sb)); }
/* TALK (E): hidden until something is in reach — then it lights teal with the
   prompt's verb; NEXT while a conversation is open (E advances the line) */
#ui .tch-e { --full: #177a72; right: calc(73px + var(--sr)); bottom: calc(73px + var(--sb)); scale: .75; visibility: hidden; opacity: 0; }
#ui .tch-e.lit { visibility: visible; opacity: 1; scale: 1; background-image: none; background-color: rgba(31,154,144,.94); color: var(--tc-cream); }
#ui .tch-e.lit.on { scale: 1.08; background-color: var(--full); }
#ui .tch-gho { --s: 44px; }
#ui .tch-r { right: calc(20px + var(--sr)); bottom: calc(98px + var(--sb)); }
#ui .tch-c { right: calc(34px + var(--sr)); bottom: calc(155px + var(--sb)); }
#ui .tch-f { right: calc(88px + var(--sr)); bottom: calc(138px + var(--sb)); }
@media (orientation: portrait) {
  #ui .tch-c { right: calc(148px + var(--sr)); bottom: calc(82px + var(--sb)); }
  #ui .tch-f { right: calc(162px + var(--sr)); bottom: calc(20px + var(--sb)); }
}
/* DISABLED (USE with nothing in hand, SWAP with nothing to cycle): an OPAQUE,
   desaturated disc with a muted mark — reads as 'off' over any backdrop. The
   idle fade (tch-idle) still applies. */
#ui .tch-btn.idle { opacity: 1; background-image: none; background-color: #ddd5c9; border-color: rgba(43,36,66,.38); color: rgba(47,39,72,.42); }
/* flying: C, R, F and E have nothing to do up there (the flyer reads Space and
   KeyX), so they leave the screen; they keep their .idle class for tests */
body.cci-touch.tch-fly #ui .tch-c, body.cci-touch.tch-fly #ui .tch-r,
body.cci-touch.tch-fly #ui .tch-f, body.cci-touch.tch-fly #ui .tch-e { visibility: hidden; }

/* flying: B is the boost dash (the flyer reads KeyX; its HUD chip says B).
   Blue, dimmed while it recharges, with a ring that fills back up */
body.cci-touch.tch-fly #ui .tch-b { --full: #4f8fe0; background-image: linear-gradient(180deg, rgba(234,242,255,.92), rgba(201,220,246,.92)); }
body.cci-touch.tch-fly #ui .tch-b.on { background-image: none; background-color: var(--full); }
#ui .tch-b::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; pointer-events: none; opacity: 0;
  background: conic-gradient(rgba(255,214,110,.98) calc(var(--tch-cd, 0) * 360deg), rgba(38,30,58,.5) 0);
  -webkit-mask: radial-gradient(circle closest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px));
  mask: radial-gradient(circle closest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); }
body.cci-touch.tch-fly #ui .tch-b.cool { opacity: .7; }
body.cci-touch.tch-fly #ui .tch-b.cool::after { opacity: 1; }
/* same specificity as the cool rule, and later: idle still wins while the boost recharges */
body.cci-touch.tch-idle #ui .tch-b.cool { opacity: .22; }

/* the icon row: look · camera · map · help, 44-px chips on a 50-px pitch.
   fit() places it (--tch-rowr = the help chip's right offset, --tch-rowt = the
   row's top): BESIDE the clock in landscape, in the top strip, so no chip
   reaches the central 60 % × 60 %; under the clock upright. */
#ui .tch-sys { --s: 44px; z-index: 50; top: var(--tch-rowt, calc(8px + var(--st))); }
#ui .tch-help { right: var(--tch-rowr, calc(62px + var(--sr))); }
#ui .tch-map  { right: calc(var(--tch-rowr, calc(62px + var(--sr))) + 50px); }
#ui .tch-cam  { right: calc(var(--tch-rowr, calc(62px + var(--sr))) + 100px); }
#ui .tch-look { right: calc(var(--tch-rowr, calc(62px + var(--sr))) + 150px); }
#ui .tch-look.on { --full: #e39a1e; }
#ui .tch-map.off .ico { opacity: .5; }
#ui .tch-cam .d { position: absolute; right: -2px; bottom: -2px; width: 13px; height: 13px; border-radius: 50%; box-sizing: border-box;
  background: var(--tc-ink); border: 1px solid var(--tc-line); font: 900 8px/11px var(--fbody); color: var(--tc-cream); text-align: center; }

/* help: a tag under every icon chip (the plate explains the lettered ones) */
body.cci-touch.tch-helping #ui .tch-btn[data-tag]::after {
  content: attr(data-tag); position: absolute; white-space: nowrap; pointer-events: none; z-index: 1;
  font: 900 7.5px/1 var(--fbody); letter-spacing: .08em; text-transform: uppercase; color: var(--ink);
  background: var(--panel); border: 1.5px solid var(--edge); border-radius: 999px; padding: 3px 5px 3px; }
body.cci-touch.tch-helping #ui .tch-sys[data-tag]::after { top: calc(100% + 4px); left: 50%; transform: translateX(-50%); }
body.cci-touch.tch-helping #ui .tch-cam[data-tag]::after, body.cci-touch.tch-helping #ui .tch-help[data-tag]::after { top: calc(100% + 19px); }

/* nothing but the title card while it is up */
body.cci-touch.tch-intro #ui .tch-btn, body.cci-touch.tch-intro #ui .tch-joy { display: none; }

/* ── help plate: touch how-to under the objective (the ? chip) ────────────── */
#ui .tch-tip { z-index: 46; display: none !important; }
body.cci-touch.tch-helping #ui .tch-tip { display: grid !important; }
#ui .tch-tip {
  grid-template-columns: 18px auto; column-gap: 7px; row-gap: 4px; align-items: center;
  left: calc(10px + var(--sl)); top: var(--tch-tipt, calc(var(--tch-tl, 38px) + 6px)); width: max-content; max-width: var(--tch-tipw, min(272px, 38vw));
  padding: 7px 11px 8px 8px; border-radius: 13px; box-sizing: border-box;
  background: linear-gradient(180deg, var(--panel), var(--panel-2)); border: 2px solid var(--edge);
  font: 700 10.5px/1.25 var(--fbody); color: var(--ink); white-space: normal;
}
#ui .tch-tip b { font-weight: 900; }
#ui .tch-tip > span { text-wrap: balance; }
#ui .tch-tip .ico { width: 17px; height: 17px; color: var(--ink-soft); }
#ui .tch-tip .dot { width: 13px; height: 13px; margin: 0 auto; border-radius: 50%; border: 2px solid var(--edge); box-sizing: border-box; background: var(--panel-2); }
#ui .tch-tip .k { width: 17px; height: 17px; margin: 0 auto; border-radius: 50%; border: 1.5px solid var(--edge); box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; font: 900 9px/1 var(--fbody); color: #fff; }
#ui .tch-tip .ka { background: var(--pink); }
#ui .tch-tip .kb { background: #4f8fe0; }
#ui .tch-tip .kc { background: #4a3f66; }
body.cci-touch.tch-fly #ui .tch-tip .w, body.cci-touch:not(.tch-fly) #ui .tch-tip .f { display: none; }
body.cci-touch.tch-tipfade #ui .tch-tip { visibility: hidden; }
body.cci-touch.tch-mapyield #ui .cci-map { visibility: hidden !important; }

/* ── turn-your-phone card ─────────────────────────────────────────────────── */
#ui .tch-rot { z-index: 96; inset: 0; display: none !important; align-items: center; justify-content: center;
  background: radial-gradient(ellipse 70% 50% at 50% 42%, rgba(255,196,220,.34), rgba(255,175,205,0) 72%),
              linear-gradient(165deg, #1e0e28 0%, #4b1a3e 45%, #8d2551 76%, #c9527e 100%); }
body.cci-touch.tch-portrait #ui .tch-rot { display: flex !important; }
#ui .tch-rot-card { position: relative; width: min(300px, 84vw); padding: 26px 22px 20px; text-align: center; border-radius: 26px;
  background: linear-gradient(180deg, var(--panel), var(--panel-2)); border: 4px solid var(--edge);
  box-shadow: 0 4px 0 rgba(43,36,66,.5), 0 18px 40px rgba(0,0,0,.45), inset 0 2px 0 rgba(255,255,255,.9); }
#ui .tch-rot-art { position: relative; width: 96px; height: 96px; margin: 0 auto 10px; color: var(--edge); }
#ui .tch-rot-phone { position: absolute; inset: 0; animation: tch-rot 2.6s cubic-bezier(.6,0,.3,1) infinite; }
#ui .tch-rot-phone svg { color: var(--edge); }
#ui .tch-rot-arrow { position: absolute; right: -10px; top: -8px; width: 40px; height: 40px; color: var(--pink); }
@keyframes tch-rot { 0%,18% { transform: rotate(0deg); } 45%,82% { transform: rotate(-90deg); } 100% { transform: rotate(0deg); } }
#ui .tch-rot h2 { margin: 0 0 6px; font: 800 26px/1.05 var(--fdisp); color: var(--ink); }
#ui .tch-rot p { margin: 0 0 16px; font: 700 14px/1.4 var(--fbody); color: var(--ink-soft); }
#ui .tch-rot-go { font: 800 11.5px/1 var(--fbody); letter-spacing: .12em; text-transform: uppercase; color: var(--ink-soft);
  padding: 11px 16px 12px; min-height: 44px; border-radius: 999px; border: 2.5px solid rgba(43,36,66,.35); background: rgba(255,255,255,.5); }

/* ── the HUD, re-fitted for a phone (ui.js / style.js are not edited) ─────── */
/* keyboard hints — the E chips too: here E is the teal TALK / NEXT button, and
   a second 'E' in the prompt pill or the dialogue box was two cues for one fact */
body.cci-touch #ui .cci-key, body.cci-touch .cci-key { display: none !important; }
body.cci-touch #ui .cci-botleft, body.cci-touch #ui .cci-hint, body.cci-touch #ui .cci-mapchip { display: none !important; }
body.cci-touch #ui .cci-bar-hint em, body.cci-touch #ui .cci-bar-dot,
body.cci-touch #ui .cci-bar-slash, body.cci-touch #ui .cci-bar-sep { display: none !important; }
body.cci-touch #ui .cci-bar-name { display: inline !important; }
body.cci-touch #ui .cci-intro .press { padding: 12px 24px 13px; font-size: 13px; }

/* top-left: the objective as a ONE-line chip (tap = the whole thing) + the candy pill */
body.cci-touch #ui .cci-topleft { left: calc(10px + var(--sl)); top: calc(8px + var(--st)); gap: 6px; align-items: flex-start; max-width: none; }
body.cci-touch #ui .cci-obj { max-width: min(240px, 32vw); pointer-events: auto !important; cursor: pointer; }
body.cci-touch #ui .cci-obj-in { padding: 3px 11px 3px 3px; gap: 6px; border-radius: 999px; border-width: 2px; }
body.cci-touch #ui .cci-obj-in > div { min-width: 0; }
body.cci-touch #ui .cci-obj-pin { width: 13px; height: 13px; padding: 2px; border-width: 2px; }
body.cci-touch:not(.tch-objopen) #ui .cci-obj-lab, body.cci-touch:not(.tch-objopen) #ui .cci-obj-sub { display: none !important; }
body.cci-touch:not(.tch-objopen) #ui .cci-obj-body { font-size: 12.5px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
body.cci-touch.tch-objopen #ui .cci-obj { max-width: min(320px, 46vw); }
body.cci-touch.tch-objopen #ui .cci-obj-in { border-radius: 14px; padding: 6px 12px 7px 6px; }
body.cci-touch.tch-objopen #ui .cci-obj-body { font-size: 13px; }
body.cci-touch #ui .cci-candy { padding: 3px 9px 3px 5px; border-width: 2px; }
body.cci-touch #ui .cci-candy-ico { width: 17px; height: 17px; }
body.cci-touch #ui .cci-candy-n { font-size: 13px; }

/* top-right: the clock (the icon row beside it in landscape, under it upright) */
body.cci-touch #ui .cci-dial { right: calc(10px + var(--sr)); top: calc(6px + var(--st)); scale: .52; transform-origin: 100% 0; }
body.cci-touch #ui .cci-dial-sub { display: none !important; }

/* the map: under the objective (near = a small plate, world = opened there).
   Upright, the WORLD map spans the width instead: fit() writes --tch-mapx /
   --tch-mapt (centred, under the icon row, above the thumbs) and a scale that
   makes it ≥ 90 % of the viewport wide, aspect kept */
body.cci-touch #ui .cci-map { left: var(--tch-mapx, calc(10px + var(--sl))); right: auto; bottom: auto;
  top: var(--tch-mapt, calc(var(--tch-tl, 38px) + 6px)); scale: var(--tch-maps, .66); transform-origin: 0 0; }
/* the explored atlas on a phone: its footer and close cue stay ≥ 12 px (style.js
   has a 10.5-px label); upright it is already ~96 % wide (minimap.js) and the
   percentages wrap rather than ellipsise */
body.cci-touch #ui .cci-map-xp-lab, body.cci-touch #ui .cci-atlas-close em, body.cci-touch #ui .cci-atlas-leg em { font-size: 12px; }
@media (orientation: portrait) {
  body.cci-touch #ui .cci-atlas-foot { flex-wrap: wrap; row-gap: 2px; }
  body.cci-touch #ui .cci-map-xp { font-size: 13px; white-space: normal; overflow: visible; }
}
/* toasts + banner: top-centre, in the band between the two top corners */
/* (origin at the LEFT edge: the column's own translateX(-50%) runs before this
    scale, so an origin at 50 % pushed the scaled column ~11 % of its width right
    of --tch-colx — onto the icon row on an iPhone SE; at 0 it is centred exactly) */
body.cci-touch #ui .cci-topcol { top: var(--tch-colt, calc(8px + var(--st))); left: var(--tch-colx, 50%) !important;
  max-width: var(--tch-colw, 60vw); scale: .78; transform-origin: 0 0; }
/* dialogue: ONLY a conversation the player started (tch-convo) gets ui.js's
   panel — bottom-centre between the stick and the fan, ≤ 40% wide (ui.js writes
   an inline bottom); upright it docks at the TOP under the map (--tch-sayt), so
   the bottom stays the thumbs'. Ambient chatter keeps the panel hidden and runs
   as the .tch-sub subtitle instead. */
body.cci-touch:not(.tch-convo) #ui .cci-say { visibility: hidden !important; }
/* a line touch.js just dropped (chatter giving way to a talk) is still falling
   out of the box for a few frames: it is not the conversation, never the panel */
body.cci-touch.tch-hush #ui .cci-say { visibility: hidden !important; }
/* …and a kid's / passer-by's line while a talk waits for its answer is chatter too */
body.cci-touch.tch-amb #ui .cci-say { visibility: hidden !important; }
body.cci-touch #ui .cci-say { left: var(--tch-sayx, 50%) !important; width: var(--tch-sayw, min(300px, 40vw));
  bottom: var(--tch-sayb, calc(8px + var(--sb))) !important; }
@media (orientation: portrait) {
  body.cci-touch #ui .cci-say { top: var(--tch-sayt, calc(160px + var(--st))) !important; bottom: auto !important; }
}
/* the text starts 16 px down: the nameplate tab (top -12, ~22 px tall) clears
   the first line's ascenders by ≥ 6 px instead of sitting on them */
body.cci-touch #ui .cci-say-panel { min-height: 56px; padding: 16px 10px 8px 9px; border-radius: 16px; }
body.cci-touch #ui .cci-portrait { width: 36px; height: 36px; left: 8px; bottom: 8px; border-width: 2px; }
body.cci-touch #ui .cci-say-body { margin: 0 26px 0 44px; min-height: 32px; }
body.cci-touch #ui .cci-nameplate { left: 50px; top: -12px; font-size: 11px; padding: 2px 10px 3px; border-width: 2px; }
/* whole words only (style.js breaks anywhere, which split 'reaso / n' in a thin card) */
body.cci-touch #ui .cci-say-text { font-size: 13px; line-height: 1.34; overflow-wrap: normal; word-break: normal; hyphens: manual; text-wrap: pretty; }
/* the advance mark is a plain ▸ (the teal NEXT button and a tap on the card both advance) */
body.cci-touch #ui .cci-adv { right: 8px; bottom: 8px; gap: 3px; }
body.cci-touch #ui .cci-adv-go { display: block; width: 14px; height: 14px; }

/* ambient chatter: a subtitle under the toast slot — name tag + the line, no
   portrait, no E; fit()/placeSub() write --tch-subx / -subt / -subw. A caption
   (pointer-events none, never counted as a control). */
#ui .tch-sub { z-index: 41; left: var(--tch-subx, 50%); top: var(--tch-subt, calc(60px + var(--st))); translate: -50% 0;
  width: max-content; max-width: var(--tch-subw, 60vw); box-sizing: border-box; padding: 5px 12px 6px 6px; border-radius: 13px;
  background: linear-gradient(180deg, var(--panel), var(--panel-2)); border: 2px solid var(--edge); box-shadow: 0 2px 0 rgba(43,36,66,.3);
  font: 700 12.5px/1.34 var(--fbody); color: var(--ink); text-align: left; text-wrap: pretty;
  overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3;
  opacity: 0; visibility: hidden !important; transition: opacity .18s ease, visibility 0s linear .18s; }
body.cci-touch #ui .tch-sub { display: -webkit-box; }
body.cci-touch.tch-chat #ui .tch-sub { opacity: 1; visibility: visible !important; transition: opacity .14s ease; }
#ui .tch-sub.plain { padding-left: 12px; }
#ui .tch-sub .nm { display: inline-block; margin-right: 6px; padding: 1px 8px 2px; border-radius: 999px; border: 1.5px solid var(--edge);
  background: var(--pacc, var(--pink)); color: #fff; font: 800 11px/1.2 var(--fdisp); letter-spacing: .01em; vertical-align: 1px;
  text-shadow: 0 1px 0 rgba(0,0,0,.22); }
#ui .tch-sub.beat { font-style: italic; color: var(--ink-soft); }
body.cci-touch.tch-fly #ui .tch-sub { scale: .92; }
body.cci-touch #ui .cci-card { scale: .86; }
/* the hotbar lives in the F chip; long-press opens it here as a tray */
/* (with a dialogue line up, fit() stacks it ABOVE the line — nameplate included — and pushes it right, toward
    the F chip that summoned it and off the visitor: --tch-trayx / --tch-trayb) */
/* (origin at the LEFT edge: the rack's own translateX(-50%) runs before this scale, so an origin at 50 % would
    put its middle 10 % of its width right of 'left'; at 0 it is centred on 'left' exactly) */
body.cci-touch #ui .cci-bar { left: var(--tch-trayx, var(--tch-sayx, 50%)); bottom: var(--tch-trayb, var(--tch-sayb, calc(8px + var(--sb))));
  scale: ${TRAY_S}; transform-origin: 0 100%; z-index: 49; }
body.cci-touch:not(.tch-tray) #ui .cci-bar { visibility: hidden !important; }
body.cci-touch.tch-tray #ui .cci-bar, body.cci-touch.tch-tray #ui .cci-bar .cci-slot { pointer-events: auto !important; }

/* a SMALL landscape phone (iPhone SE class, < 740 px wide): 40 % of the width
   left a four-character text column. A line of dialogue becomes a bottom SHEET
   from the stick's rest spot to A (fit() writes --tch-sayx / --tch-sayw while
   tch-talk is on): portrait at the left, the advance chip riding the top edge
   like the nameplate, so the text column is ≥ 60 % of the card. The ghosted
   action buttons step aside; E (it advances the line) moves up over A. */
@media (orientation: landscape) and (max-height: 599px) and (max-width: 739px) {
  body.cci-touch.tch-talk #ui .tch-b, body.cci-touch.tch-talk #ui .tch-c,
  body.cci-touch.tch-talk #ui .tch-r, body.cci-touch.tch-talk #ui .tch-f { visibility: hidden; }
  body.cci-touch.tch-talk #ui .tch-e { right: calc(18px + var(--sr)); bottom: calc(82px + var(--sb)); }
  body.cci-touch.tch-talk #ui .cci-say-body { margin-right: 4px; }
  body.cci-touch.tch-talk #ui .cci-say-panel { padding-top: 16px; }          /* the first line clears the two tabs */
  body.cci-touch.tch-talk #ui .cci-say-text { font-size: 13.5px; }
  body.cci-touch.tch-talk #ui .cci-adv { top: -11px; bottom: auto; right: 12px; padding: 2px 6px 2px 5px; border-radius: 999px;
    background: linear-gradient(180deg, var(--panel), var(--panel-2)); border: 2px solid var(--edge); }
  /* the band for toasts + banner is ~150 px here: a place name stays a caption —
     one line, without its pin (the name, not the icon, is the news) */
  body.cci-touch #ui .cci-banner-title { font-size: 20px; }
  body.cci-touch #ui .cci-banner-ico { display: none; }
  /* the icon row sits beside the clock (fit()); the objective chip gives up a
     little width so the toast band between them stays ≥ 140 px */
  body.cci-touch:not(.tch-objopen) #ui .cci-obj { max-width: min(240px, 22vw); }
  /* …and the row itself is 32-px chips on a 36-px pitch here, each keeping a
     44-px hit area: at 44 px it ate the band, and a place banner fell onto the
     conversation sheet (iPhone SE) */
  #ui .tch-sys { --s: 32px; }
  #ui .tch-sys::before { content: ''; position: absolute; inset: -6px; border-radius: 50%; }
  #ui .tch-map  { right: calc(var(--tch-rowr, calc(62px + var(--sr))) + 36px); }
  #ui .tch-cam  { right: calc(var(--tch-rowr, calc(62px + var(--sr))) + 72px); }
  #ui .tch-look { right: calc(var(--tch-rowr, calc(62px + var(--sr))) + 108px); }
}
/* the star pill (powerups' own DOM, own inline bottom + transform) docks in the
   top-left stack under the objective chip — never by the clock, the icon row or
   the toasts, never over the visitor. fit() writes --tch-pillt and hangs the map,
   the help plate and the flyer HUD under the pill while it is up. The translate
   cancels the pill's own translateX(-50%). */
body.cci-touch #ui .cci-star-pill { left: calc(10px + var(--sl)) !important; right: auto !important; bottom: auto !important;
  top: var(--tch-pillt, calc(44px + var(--st))) !important; translate: 42% 0; transform-origin: 0 0; scale: .84; }
/* the corner map's M-cycle pips say what the MAP chip says: the place name gets their room */
body.cci-touch #ui .cci-map .cci-map-modes { display: none; }
body.cci-touch #ui .cci-map-here { letter-spacing: .02em; }
/* upright, minimap.js shrinks the corner plate to its 110-px floor: a long place
   name takes a second line rather than an ellipsis ('Gumdr…') */
body.cci-touch #ui .cci-map .cci-map-here { white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.12; }
body.cci-touch #ui .cci-map .cci-map-foot { align-items: flex-start; }
body.cci-touch #ui .cci-map .cci-map-pin { margin-top: 2px; }
/* a place name wraps inside the toast column instead of spilling past it */
body.cci-touch #ui .cci-banner-title { white-space: normal; text-wrap: balance; }
/* in the air a place is passed in seconds: its banner stays a caption */
body.cci-touch.tch-fly #ui .cci-banner-sub { display: none; }
body.cci-touch.tch-fly #ui .cci-topcol { scale: .66; }
/* flying: the help plate takes the bottom gap (fit(): --tch-ftx / -ftw / -ftb),
   so the flyer HUD's altitude + energy never leave the screen */
body.cci-touch.tch-fly #ui .tch-tip { left: var(--tch-ftx, 96px); top: auto; bottom: var(--tch-ftb, calc(8px + var(--sb)));
  max-width: var(--tch-ftw, 60vw); }

/* big landscape screens (tablets): the HUD can breathe again */
@media (orientation: landscape) and (min-height: 600px) {
  body.cci-touch #ui .cci-dial { scale: .72; }
  body.cci-touch #ui .cci-topcol { scale: 1; }
  body.cci-touch #ui .cci-say-text { font-size: 15px; }
  body.cci-touch #ui .cci-obj { max-width: min(320px, 32vw); }
}
@media (orientation: portrait) {
  body.cci-touch #ui .cci-obj { max-width: min(240px, calc(100vw - 196px)); }
  body.cci-touch.tch-objopen #ui .cci-obj { max-width: calc(100vw - 80px); }
}

/* ── the flying machine's HUD (escape/flyer.js: own DOM + own <style>) ─────
   It hangs under the map; --tch-flys (fitted by touch.js) sizes it to end
   above the stick's resting spot. Only the individual top / left / scale /
   translate properties are touched: the flyer animates transform (a slide-in
   from the left plus translate(0,-50%)); this translate cancels that -50% so
   top is the HUD's real top edge at any scale. */
body.cci-touch #ui .fly-hud { left: calc(10px + var(--sl)); top: var(--tch-flyt, 150px); transform-origin: 0 0;
  scale: var(--tch-flys, 1); translate: 0 calc(var(--tch-flys, 1) * 50%); }
/* the flyer's boost chip reads SHIFT when it thinks it is on a desktop: here it is B */
body.cci-touch #ui .fly-key { font-size: 0 !important; }
body.cci-touch #ui .fly-key::after { content: 'B'; font-size: 10px; }
/* no 'Talk to …' pill for someone 60 u below the flying machine */
body.cci-touch.tch-fly #ui .cci-prompt { visibility: hidden !important; }
`;

export function create(ctx) {
  const THREE = ctx.THREE;
  const params = ctx.params || new URLSearchParams(location.search);
  const force = params.get('touch');                    // '1' | '0' | null
  const mq = (q) => { try { return !!window.matchMedia?.(q).matches; } catch { return false; } };
  const coarse = mq('(pointer: coarse)');
  const wantQuality = !params.has('q') && (coarse || force === '1');

  const root = ctx.uiRoot || document.getElementById('ui') || document.body;
  const body = document.body;

  // ── DOM ────────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = 'tch-style';
  style.textContent = CSS;
  root.appendChild(style);

  const el = (cls, html = '', parent = root, tag = 'div') => {
    const d = document.createElement(tag); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d;
  };
  const layer = el('tch tch-layer');
  const ringEl = el('tch tch-ghost tch-ring tch-cov');
  const joyEl = el('tch tch-ghost tch-joy tch-cov tch-fade', '<div class="tch-joy-base"></div><div class="tch-joy-knob"></div>');
  const knobEl = joyEl.querySelector('.tch-joy-knob');

  const btn = {};
  for (const b of BUTTONS) {
    const box = b.kind === 'gho' ? 44 : 48;
    const inner = b.kind === 'sys'
      ? `<span class="ico">${ico(b.icon)}</span>${b.id === 'cam' ? '<b class="d">1</b>' : ''}`
      : b.icon ? iconFace(b.icon, b.verb, box)          // DUCK · ROLL · SWAP · TALK: an icon over its word
        : face(b.label, b.verb, box);                   // A jump · B use (B shows the held item once there is one)
    const d = el(`tch tch-btn tch-cov tch-fade tch-${b.kind} tch-${b.id}`, inner, root, 'button');
    d.type = 'button';
    d.setAttribute('aria-label', `${b.verb} (${b.code})`);
    if (b.tag) d.dataset.tag = b.tag;
    btn[b.id] = { spec: b, el: d, pointer: -1, code: b.code, key: b.key };
  }
  const camDigit = btn.cam.el.querySelector('.d');

  el('tch tch-ghost tch-tip', `
    <span class="w dot"></span><span class="w"><b>left thumb</b> walks · push to the rim to <b>run</b></span>
    <span class="w ico">${lineIco('hand')}</span><span class="w"><b>right thumb</b> drags to look · <b>pinch</b> to zoom</span>
    <span class="w k ka">A</span><span class="w"><b>A</b> jumps, twice = <b>flip</b> · <b>use</b> = what you hold</span>
    <span class="w ico">${lineIco('duck')}</span><span class="w"><b>duck</b> (in the air: <b>stomp</b>) · <b>roll</b> dodges</span>
    <span class="w ico">${lineIco('swap')}</span><span class="w"><b>swap</b> = next item · <b>hold</b> it to pick any</span>
    <span class="w ico">${lineIco('talk')}</span><span class="w"><b>talk</b> appears when someone is in reach</span>
    <span class="w ico">${lineIco('eye')}</span><span class="w">hold the <b>eye</b> to look around · tap = <b>behind me</b></span>
    <span class="f dot"></span><span class="f"><b>stick</b> steers · up = <b>nose up</b> · down = <b>dive</b></span>
    <span class="f k ka">A</span><span class="f"><b>A</b> flaps (costs energy) · <b>gliding</b> refills it</span>
    <span class="f k kb">B</span><span class="f"><b>B</b> = boost dash · the ring shows its <b>recharge</b></span>
    <span class="f ico">${lineIco('therm')}</span><span class="f">warm shimmer over landmarks = free <b>lift</b></span>`);

  const rotEl = el('tch tch-rot', `
    <div class="tch-rot-card">
      <div class="tch-rot-art"><div class="tch-rot-phone">${PHONE_SVG}</div><div class="tch-rot-arrow">${TURN_SVG}</div></div>
      <h2>Turn your phone sideways</h2>
      <p>The islands are a lot wider than they are tall.</p>
      <button type="button" class="tch-rot-go">play upright anyway</button>
    </div>`);
  const rotGo = rotEl.querySelector('.tch-rot-go');
  // ambient chatter's subtitle (a caption, not a control: no tch-cov)
  const subEl = el('tch tch-ghost tch-sub');

  // ── state ──────────────────────────────────────────────────────────────────
  let on = false;
  let intro = null;                 // ui.js's title card element, looked up lazily
  let hintEl = null;                // ui.js's controls card (drives our help plate)
  let talkEl = null;                // ui.js's dialogue box (tch-talk: a small phone makes it a sheet)
  let introUp = false, introTextDone = false;
  const cls = { intro: false, help: false, fly: false, portrait: false, idle: false, tray: false,
    objopen: false, tipfade: false, mapyield: false, talk: false, convo: false, chat: false, hush: false, amb: false };
  let portraitOk = false;           // 'play upright anyway'
  let rotateForced = null;          // test hook
  let helpForced = null;            // test / view hook for the help plate
  let pausedByUs = false;
  let wantFullscreen = false;
  let capsApplied = 0;
  let clock = 0, idleT = 0;

  const stick = { x: 0, y: 0, active: false, run: false };
  const joy = { id: -1, ox: 0, oy: 0, dx: 0, dy: 0, outT: 0 };
  const look = { id: -1, x: 0, y: 0, sx: 0, sy: 0, engaged: false, pdx: 0, pdy: 0 };
  const pinch = { id: -1, x: 0, y: 0, d: 0 };   // the second right-half finger
  let pendingWheel = 0;
  let wroteStick = false, wrotePointer = false, heldShift = false;
  // F chip: tap = F, long-press = the tray
  const fHold = { t: 0, long: false };
  let trayT = 0, objT = 0;

  const setCls = (name, v, token) => {
    if (cls[name] === v) return;
    cls[name] = v;
    body.classList.toggle(token, v);
  };
  const W = () => window.innerWidth || 1;
  const H = () => window.innerHeight || 1;

  // ── synthetic keys: exactly what a keyboard does ───────────────────────────
  function sendKey(type, code, key) {
    let ev;
    try { ev = new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }); }
    catch { return; }
    (document.body || window).dispatchEvent(ev);
  }

  // ── dialogue: a conversation the player started vs. ambient chatter ────────
  // ui.js has one dialogue box for both, and on a phone that box is a lot of
  // screen. It is kept for talks the PLAYER starts: interaction.js emits
  // 'interact' when E reaches something, and every line from then on belongs to
  // the conversation until the box has been empty for CONVO_GAP s (CONVO_ADV
  // once the player has skipped a line: containment paces its lines up to 6.5 s
  // apart); a scripted beat (the visitor locked) and a tap on a modal card's
  // buttons count too. Any other line is
  // chatter: the panel stays hidden (CSS body:not(.tch-convo)) and the line runs
  // as the subtitle, which lets go of it after CHAT_MIN..CHAT_MAX s. While a line
  // is current ui.js swallows E / Enter / X (they advance it): the capture
  // listener below drops CHATTER first, so TALK and USE always do their own job.
  // (touch is created before ui, so this capture listener runs before ui.js's.)
  //
  // STARTING a conversation (beginConvo: 'interact', a TALK press that reaches
  // an interactable, a modal card's button) first DROPS any chatter — the line
  // up and whatever waits behind it in ui.js's queue — so the answer is never
  // stuck behind it; then the talk is marked and WAITS up to CONVO_PEND s for its
  // first line: containment answers through its own pacing queue, up to 6.5 s
  // after its previous line, and a 1.6-s grace used to lapse first, which put the
  // answer in the subtitle. Once a line of it has been up, the talk lasts until
  // the box has been empty CONVO_GAP s. Walking off before any answer (a pickup,
  // a door) ends the wait. A line we drop keeps falling out of ui.js's box for a
  // few frames: 'hush' says it is no line at all (never the panel).
  let convoT = 0, chatLine = false, sayTextEl = null, sayPlateEl = null, sayPanelHooked = false, cardHooked = false;
  let convoPend = 0, convoAt = null, convoLabel = '', frameN = 0, interactFrame = -1;
  let sayN = 0, hushN = -1, hushT = 0;             // ui.say calls seen (the wrapper counts) · the drop in flight
  // A line from a known AMBIENT body (a sour patch kid, a cat citizen the player
  // did not address) is chatter even while a talk is on: sourpatch.js answers
  // every 'interact' with a kid's photobomb line ~0.55 s later, and that line
  // must neither take the panel nor keep the talk alive (containment's paced
  // chatter would then chain onto it for good). Their texts are kept here (the
  // last 16); such a line runs as the subtitle, never refreshes the talk, and
  // gives way the moment a line of the talk arrives. A line said in the same
  // frame as 'interact' is always the answer.
  const ambTexts = new Set();
  const normText = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const chat = { key: '', t: 0, life: 0, done: false };
  const subBase = { top: 60, lo: 10, cx: 0 };
  function setConvo(v) {
    setCls('convo', v, 'tch-convo');
    if (v) { convoT = Math.max(convoT, CONVO_GAP); chat.done = true; setCls('chat', false, 'tch-chat'); }
    else { convoPend = 0; convoAt = null; convoLabel = ''; }
  }
  /** Is `speaker` an ambient body (a kid, a citizen) other than the one the player addressed? */
  function ambientSpeaker(speaker) {
    const who = String(speaker || '').split(/\s+[—–-]\s+/)[0].trim().toLowerCase();
    if (!who) return false;
    if (convoLabel && convoLabel.includes(who)) return false;           // 'Talk to Marmalade' ← Marmalade
    if (who === 'sour patch kids') return true;
    const named = (list, keys) => {
      try {
        for (const o of list ?? []) for (const k of keys) { const n = String(k(o) || '').toLowerCase(); if (n && n === who) return true; }
      } catch { /* a system may not exist yet */ }
      return false;
    };
    return named(ctx.systems.sourPatch?.kids, [(o) => o?.name])
      || named(ctx.systems.catCitizens?.cats, [(o) => o?.name, (o) => o?.tiger?.full, (o) => o?.tiger?.short]);
  }
  const hushing = () => hushT > 0 && sayN === hushN;
  const boxUp = () => {
    if (!talkEl || !talkEl.isConnected) talkEl = root.querySelector('.cci-say');
    return !!talkEl && talkEl.style.display !== 'none' && !hushing();
  };
  /** Drop ui.js's line + queue (the chatter), and remember it is still falling out of the box. */
  function hushUi() {
    try { ctx.systems.ui?.clear?.(); } catch { /* the HUD may be mid-rebuild */ }
    hushN = sayN; hushT = HUSH_T;
    chatLine = false; chat.done = true; chat.key = '';
    setCls('chat', false, 'tch-chat');
  }
  /** The player started a conversation (entry: the interactable, if any). */
  function beginConvo(entry) {
    if (!on) return;
    const up = boxUp();
    // mid-talk with a line of it up: keep it. Otherwise chatter on screen or
    // queued behind it gives way, so the answer opens at once in the panel.
    if (!(cls.convo && up)) {
      const ui = ctx.systems.ui;
      if (chatLine || up || ui?.sayQueue?.length) hushUi();
    }
    chatLine = false; chat.done = true; setCls('chat', false, 'tch-chat');
    setConvo(true);
    convoT = Math.max(convoT, CONVO_GAP);
    convoPend = CONVO_PEND;
    convoLabel = String(entry?.label || '').toLowerCase();
    let p = null;
    try { p = entry ? (entry.getPos ? entry.getPos() : entry) : null; } catch { p = null; }
    convoAt = p && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z, r: Number(entry.r) || 2.6 } : null;
  }
  ctx.events?.on?.('interact', (entry) => {
    if (!on) return;
    // onInteract runs right after this, in the same frame: its lines are the answer
    interactFrame = frameN;
    beginConvo(entry);
  });
  function releaseChat(all) {
    const ui = ctx.systems.ui;
    if (!ui) return;
    try {
      if (all || !ui.sayQueue?.length) hushUi();
      else {
        // finish the line if it is still typing, then step to the next queued one
        if (sayTextEl?.querySelector('.cci-caret, .cci-ghost')) ui.advance?.();
        ui.advance?.();
      }
    } catch { /* the HUD may be mid-rebuild */ }
  }
  window.addEventListener('keydown', (e) => {
    if (!on || e.repeat || (e.code !== 'KeyE' && e.code !== 'Enter' && e.code !== 'KeyX')) return;
    if (chatLine) hushUi();
    else if (cls.talk) convoT = Math.max(convoT, CONVO_ADV);
  }, true);
  const shortName = (n) => String(n || '').split(/\s+[—–-]\s+/)[0].trim();
  /** Chatter → the subtitle: mirror ui.js's current line (name + full text), let go of it after its life. */
  function syncChat(up, dt) {
    chatLine = up;
    if (!up) { chat.key = ''; setCls('chat', false, 'tch-chat'); return; }
    if (!sayTextEl || !sayTextEl.isConnected) sayTextEl = root.querySelector('.cci-say-text');
    if (!sayPlateEl || !sayPlateEl.isConnected) sayPlateEl = root.querySelector('.cci-nameplate');
    const dir = sayTextEl?.querySelector('.cci-beat-dir');            // a '…' beat: 'Rasp says nothing. Loudly.'
    const text = String((dir || sayTextEl)?.textContent || '').replace(/\s+/g, ' ').trim();
    const name = !dir && sayPlateEl && sayPlateEl.style.display !== 'none' ? shortName(sayPlateEl.textContent) : '';
    const key = name + '|' + text;
    if (key !== chat.key) {
      chat.key = key; chat.t = 0; chat.done = !text;
      chat.life = Math.min(CHAT_MAX, Math.max(CHAT_MIN, 1.8 + text.length * 0.022));
      subEl.textContent = '';
      if (name) { const b = document.createElement('b'); b.className = 'nm'; b.textContent = name; subEl.appendChild(b); }
      subEl.appendChild(document.createTextNode(text));
      subEl.classList.toggle('plain', !name);
      subEl.classList.toggle('beat', !!dir);
      const acc = sayPlateEl?.style.getPropertyValue('--pacc');
      if (acc) subEl.style.setProperty('--pacc', acc); else subEl.style.removeProperty('--pacc');
    }
    chat.t += dt;
    if (!chat.done && chat.t >= chat.life) { chat.done = true; releaseChat(false); }
    setCls('chat', !chat.done, 'tch-chat');
    if (!chat.done) placeSub();
  }
  /** The subtitle: under the top furniture (fit(): subBase) and under a toast / banner, clear of the map. */
  function placeSub() {
    const vw = W();
    if (!colEl) colEl = root.querySelector('.cci-topcol');
    let top = subBase.top;
    const c = colEl ? colEl.getBoundingClientRect() : null;
    if (c && c.height > 2) top = Math.max(top, c.bottom);
    const hi = vw - 10, lo = subBase.lo;
    // centred under the toast column (one stack), else the screen
    const cx = Math.min(Math.max(subBase.cx || vw / 2, lo + Math.min(230, (hi - lo) / 2)), hi - 80);
    const w = Math.max(160, Math.min(460, 2 * Math.min(cx - lo, hi - cx)));
    setVar('--tch-subt', Math.round(top + 6) + 'px');
    setVar('--tch-subx', Math.round(cx) + 'px');
    setVar('--tch-subw', Math.round(w) + 'px');
  }

  // ── buttons ────────────────────────────────────────────────────────────────
  function press(b, e) {
    if (b.pointer >= 0) return;
    b.pointer = e.pointerId;
    try { b.el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    b.el.classList.add('on');
    if (b.spec.id === 'f') { fHold.t = 0; fHold.long = false; return; }     // decided on release (tap) or in update (hold)
    if (b.spec.id === 'cam') {
      const m = Number(ctx.systems.camera?.mode) || 1;
      b.code = 'Digit' + ((m % 3) + 1); b.key = String((m % 3) + 1);
    }
    // TALK that reaches something starts a conversation BEFORE the key lands:
    // chatter gives way now, so neither ui.js nor the chatter eats this E
    if (b.spec.id === 'e' && !cls.talk) {
      let near = null;
      try { near = ctx.systems.interaction?.nearest?.() || null; } catch { near = null; }
      if (near) beginConvo(near);
    }
    sendKey('keydown', b.code, b.key);
  }
  function release(b, commit = true) {
    if (b.pointer < 0) return;
    b.pointer = -1;
    b.el.classList.remove('on');
    if (b.spec.id === 'f') {
      // a tap is F (next item) — exactly a key press; a long-press already opened the tray
      if (commit && !fHold.long) { sendKey('keydown', b.code, b.key); sendKey('keyup', b.code, b.key); }
      fHold.long = false;
      return;
    }
    sendKey('keyup', b.code, b.key);
  }
  for (const id in btn) {
    const b = btn[id];
    b.el.addEventListener('pointerdown', (e) => {
      if (!on) return;
      e.preventDefault();
      if (cls.tray && id !== 'f') closeTray();
      press(b, e);
      // LOOK: the same finger can drag to orbit while V is held
      if (id === 'look' && look.id < 0) {
        look.id = e.pointerId; look.x = look.sx = e.clientX; look.y = look.sy = e.clientY;
        look.engaged = false; look.pdx = look.pdy = 0;
      }
    });
    if (id === 'look') b.el.addEventListener('pointermove', onMove);
    const up = (e) => {
      if (e.pointerId === b.pointer) release(b, e.type === 'pointerup');
      if (id === 'look' && e.pointerId === look.id) onUp(e);
    };
    b.el.addEventListener('pointerup', up);
    b.el.addEventListener('pointercancel', up);
    b.el.addEventListener('lostpointercapture', up);
    b.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ── the stick + look layer ─────────────────────────────────────────────────
  function stickRest() {
    joyEl.style.left = ''; joyEl.style.top = ''; joyEl.style.bottom = '';
    knobEl.style.transform = '';
    joyEl.classList.remove('on', 'run', 'out');
    joy.outT = 0;
  }
  function stickPlace() {
    joyEl.style.left = (joy.ox - RING / 2).toFixed(1) + 'px';
    joyEl.style.top = (joy.oy - RING / 2).toFixed(1) + 'px';
    joyEl.style.bottom = 'auto';
  }
  function stickMove(x, y) {
    let dx = x - joy.ox, dy = y - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {                       // the ring trails a thumb that overshoots
      const k = 1 - STICK_R / d;
      joy.ox += dx * k; joy.oy += dy * k;
      dx = x - joy.ox; dy = y - joy.oy;
      stickPlace();
    }
    joy.dx = dx / STICK_R; joy.dy = dy / STICK_R;
    knobEl.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`;
  }
  function stickLift() {
    joy.id = -1; joy.dx = joy.dy = 0;
    knobEl.style.transform = '';
    joyEl.classList.remove('on', 'run');
    joyEl.classList.add('out');              // fades where the thumb left it, then returns to rest
    joy.outT = OUT_T;
  }
  function onDown(e) {
    if (!on) return;
    // While the title card is up the tap only starts the game (ui.js listens on
    // window for pointerdown); fullscreen needs a pointerUP, so remember it.
    if (introUp || cls.portrait) { if (introUp) wantFullscreen = true; return; }
    e.preventDefault();
    if (cls.tray) { closeTray(); return; }   // a tap anywhere else closes the tray
    const x = e.clientX, y = e.clientY;
    if (x < W() * 0.5 && joy.id < 0) {
      joy.id = e.pointerId;
      const m = RING / 2 + 2;                // the ring appears under the thumb (kept on screen)
      joy.ox = Math.min(Math.max(x, m), W() - m);
      joy.oy = Math.min(Math.max(y, m), H() - m);
      stickPlace();
      joyEl.classList.remove('out');
      joyEl.classList.add('on');
      stickMove(x, y);
    } else if (look.id < 0) {
      look.id = e.pointerId; look.x = look.sx = x; look.y = look.sy = y;
      look.engaged = false; look.pdx = look.pdy = 0;
      ringEl.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    } else if (pinch.id < 0) {
      pinch.id = e.pointerId; pinch.x = x; pinch.y = y;
      pinch.d = Math.hypot(x - look.x, y - look.y);
      look.engaged = false; look.pdx = look.pdy = 0;      // two fingers = zoom, not orbit
      ringEl.classList.remove('on');
    } else return;
    try { layer.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  }
  function onMove(e) {
    if (!on) return;
    const id = e.pointerId, x = e.clientX, y = e.clientY;
    if (id === joy.id) { stickMove(x, y); return; }
    if (id === look.id || id === pinch.id) {
      if (pinch.id >= 0) {
        if (id === look.id) { look.x = x; look.y = y; } else { pinch.x = x; pinch.y = y; }
        const d = Math.hypot(pinch.x - look.x, pinch.y - look.y);
        pendingWheel -= (d - pinch.d) * PINCH_K;             // spread = zoom in
        pinch.d = d;
        return;
      }
      const dx = x - look.x, dy = y - look.y;
      look.x = x; look.y = y;
      if (!look.engaged) {
        if (Math.hypot(x - look.sx, y - look.sy) < LOOK_SLOP) return;
        look.engaged = true;
        look.pdx += x - look.sx; look.pdy += y - look.sy;    // the slop counts too
        ringEl.classList.add('on');
      } else { look.pdx += dx; look.pdy += dy; }
      ringEl.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    }
  }
  function onUp(e) {
    const id = e.pointerId;
    if (wantFullscreen && e.type === 'pointerup') { wantFullscreen = false; tryFullscreen(); }
    if (id === joy.id) stickLift();
    else if (id === pinch.id) { pinch.id = -1; restartLook(); }
    else if (id === look.id) {
      if (pinch.id >= 0) {                                   // the other finger carries on looking
        look.id = pinch.id; look.x = pinch.x; look.y = pinch.y; pinch.id = -1; restartLook();
      } else { look.id = -1; look.engaged = false; ringEl.classList.remove('on'); }
    }
  }
  function restartLook() {
    look.sx = look.x; look.sy = look.y; look.engaged = false; look.pdx = look.pdy = 0;
    ringEl.classList.remove('on');
  }
  layer.addEventListener('pointerdown', onDown);
  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerup', onUp);
  layer.addEventListener('pointercancel', onUp);
  layer.addEventListener('lostpointercapture', (e) => { if (e.pointerId === joy.id || e.pointerId === look.id || e.pointerId === pinch.id) onUp(e); });
  layer.addEventListener('contextmenu', (e) => e.preventDefault());
  // the title-card tap lands on ui.js's card (pointer-events: none) → our layer,
  // but a finger on a HUD plate may land elsewhere: catch its pointerup too
  window.addEventListener('pointerup', (e) => {
    if (wantFullscreen && e.pointerType !== 'mouse') { wantFullscreen = false; tryFullscreen(); }
  });
  // any touch anywhere brings faded controls back
  window.addEventListener('pointerdown', () => { idleT = 0; if (cls.idle) setCls('idle', false, 'tch-idle'); }, true);

  // ── upright, a tap on the big map closes it ────────────────────────────────
  // minimap.js turns a tap on a plate into the M cycle (world → atlas → off).
  // Upright the world map spans the width and the atlas nearly so: a tap on
  // either CLOSES it, back to the near map. Capture phase on #ui, so the
  // plate's own listeners never see that tap (landscape keeps the cycle).
  let mapTap = null;
  const bigMapOpen = () => {
    if (!on || H() <= W()) return false;
    const m = ctx.systems.ui?.mapMode;
    return m === 'world' || m === 'history';
  };
  function closeBigMap() {
    const ui = ctx.systems.ui;
    try {
      if (typeof ui?.setMapMode === 'function') ui.setMapMode('local');
      else for (let i = 0; i < 4 && ui && ui.mapMode !== 'local'; i++) ui.cycleMap();
    } catch { /* the HUD may be mid-rebuild */ }
    fitT = 0;
  }
  root.addEventListener('pointerdown', (e) => {
    if (!bigMapOpen() || !e.target?.closest?.('.cci-map, .cci-atlas-plate')) return;
    e.stopPropagation();
    mapTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  }, true);
  const mapUp = (e) => {
    if (!mapTap || e.pointerId !== mapTap.id) return;
    const d = mapTap; mapTap = null;
    e.stopPropagation();
    if (e.type === 'pointerup' && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 18 && performance.now() - d.t < 900) closeBigMap();
  };
  root.addEventListener('pointerup', mapUp, true);
  root.addEventListener('pointercancel', mapUp, true);

  // iOS: no page pinch / double-tap zoom while playing
  const noGesture = (e) => { if (on) e.preventDefault(); };
  document.addEventListener('gesturestart', noGesture, { passive: false });
  document.addEventListener('dblclick', noGesture, { passive: false });
  // Chromium marks some touchmoves uncancelable (scroll already in progress) and logs an
  // [Intervention] error if we try: zoom is already blocked there by touch-action:none +
  // user-scalable=no; iOS Safari's touchmoves are cancelable, so the guard still fires there
  document.addEventListener('touchmove', (e) => { if (on && e.cancelable && e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });

  function releaseAll() {
    for (const id in btn) release(btn[id], false);
    if (joy.id >= 0) { joy.id = -1; joy.dx = joy.dy = 0; }
    stickRest();
    look.id = -1; look.engaged = false; pinch.id = -1; ringEl.classList.remove('on');
    pendingWheel = 0;
  }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // the rotate card swallows its taps: they must not start (or steer) the game behind it
  rotEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  rotGo.addEventListener('click', () => { portraitOk = true; });

  // a real finger on a touchscreen laptop turns the controls on
  window.addEventListener('pointerdown', (e) => {
    if (!on && force !== '0' && e.pointerType === 'touch') api.enable(true);
  }, true);

  function tryFullscreen() {
    if (ctx.shot || ctx.state.quality !== 'mobile') return;
    if (/iP(hone|od|ad)/.test(navigator.userAgent || '')) return;      // iOS Safari has no element fullscreen
    const de = document.documentElement;
    if (document.fullscreenElement || !de.requestFullscreen || !document.fullscreenEnabled) return;
    try {
      de.requestFullscreen({ navigationUI: 'hide' })
        .then(() => screen.orientation?.lock?.('landscape'))
        .catch(() => {});
    } catch { /* not allowed */ }
  }

  // ── the held-item tray (long-press on F) and the objective chip (tap) ──────
  let barEl = null, objEl = null;
  const carryable = () => {
    const items = ctx.systems.inventory?.items;
    let n = 0;
    if (Array.isArray(items)) for (const it of items) if (it && (it.kind === 'weapon' || it.kind === 'tool')) n++;
    return n;
  };
  function hookHud() {
    if (ctx.systems.ui && wrappedUi !== ctx.systems.ui) wrapUi();
    if (!barEl) {
      barEl = root.querySelector('.cci-bar');
      barEl?.addEventListener('pointerdown', (e) => {
        if (!on || !cls.tray) return;
        e.preventDefault(); e.stopPropagation();
        const id = e.target?.closest?.('.cci-slot')?.dataset?.id;
        const inv = ctx.systems.inventory;
        if (id && inv?.setHeld && inv.held !== id) {
          inv.setHeld(id);
          const d = inv.def?.(id);
          ctx.systems.ui?.toast?.(`${d?.name || id} in hand`, 1.8, { icon: 'spark' });
        }
        closeTray();
      });
    }
    if (!sayPanelHooked) {
      // a tap on the card advances the line (ui.js): the conversation carries on
      const sp = root.querySelector('.cci-say-panel');
      if (sp) { sayPanelHooked = true; sp.addEventListener('pointerdown', () => { if (on && cls.talk) convoT = Math.max(convoT, CONVO_ADV); }, true); }
    }
    if (!cardHooked) {
      // a button on a modal card (the clerk's form, …) is the player answering: its lines are the conversation
      const cw = root.querySelector('.cci-cardwrap');
      if (cw) {
        cardHooked = true;
        cw.addEventListener('pointerdown', (e) => { if (on && e.target?.closest?.('.cci-btn, button')) beginConvo(null); }, true);
      }
    }
    if (!objEl) {
      objEl = root.querySelector('.cci-obj');
      objEl?.addEventListener('pointerdown', (e) => {
        if (!on) return;
        e.preventDefault(); e.stopPropagation();
        setCls('objopen', !cls.objopen, 'tch-objopen');
        objT = cls.objopen ? OBJ_LIFE : 0;
        fitT = 0;
      });
    }
  }
  function openTray() {
    if (!on || carryable() < 1) return false;
    hookHud();
    trayT = TRAY_LIFE; setCls('tray', true, 'tch-tray');
    placeTray();                                 // over a dialogue line, if one is up, before it paints
    return true;
  }
  function closeTray() { trayT = 0; setCls('tray', false, 'tch-tray'); }

  // ── quality tier ───────────────────────────────────────────────────────────
  function capShadows() {
    let n = 0;
    ctx.scene?.traverse?.((o) => {
      if (!o.isLight || !o.shadow || !o.shadow.mapSize) return;
      const ms = o.shadow.mapSize;
      if (ms.x <= SHADOW_CAP && ms.y <= SHADOW_CAP) return;
      ms.set(Math.min(ms.x, SHADOW_CAP), Math.min(ms.y, SHADOW_CAP));
      if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
      if (o.shadow.mapPass) { o.shadow.mapPass.dispose(); o.shadow.mapPass = null; }
      n++;
    });
    capsApplied += n;
    return n;
  }
  let qualityOn = false, rendered = false;
  function applyMobileQuality() {
    ctx.state.quality = 'mobile';
    const r = ctx.renderer;
    if (r) {
      const pr = Math.min(r.getPixelRatio(), PIXEL_RATIO_CAP);
      if (pr !== r.getPixelRatio()) r.setPixelRatio(pr);
      // PCF (4 taps, hardware-filtered) instead of PCFSoft: only safe before the
      // first frame compiles the materials, so a late switch keeps the type.
      if (!rendered && r.shadowMap && r.shadowMap.type === THREE.PCFSoftShadowMap) r.shadowMap.type = THREE.PCFShadowMap;
    }
    capShadows();
    qualityOn = true;
    return ctx.state.quality;
  }
  ctx.events?.on?.('world:ready', () => { if (qualityOn) capShadows(); });
  let transient = false;
  ctx.events?.on?.('time:set', () => { if (transient) { transient = false; helpForced = null; api.enable(false); } });

  // ── enable / disable ───────────────────────────────────────────────────────
  function syncIntroText() {
    if (introTextDone || !intro) return;
    const p = intro.querySelector('.press');
    if (p) { p.textContent = 'tap to start'; introTextDone = true; }
  }
  const FIT_VARS = ['--tch-maps', '--tch-tl', '--tch-flys', '--tch-flyt', '--tch-colx', '--tch-colw', '--tch-colt',
    '--tch-sayx', '--tch-sayw', '--tch-sayb', '--tch-trayx', '--tch-trayb', '--tch-rowt', '--tch-tipw', '--tch-tipt',
    '--tch-pillt', '--tch-ftx', '--tch-ftw', '--tch-ftb', '--tch-rowr', '--tch-sayt', '--tch-subx', '--tch-subt', '--tch-subw',
    '--tch-mapx', '--tch-mapt'];

  /** The visible control boxes ∩ the viewport — Contract H2's coverage metric. */
  function coverage() {
    const vw = W(), vh = H(), items = [];
    let area = 0;
    const shown = (e) => {
      for (let p = e; p && p !== root; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.02) return false;
      }
      return true;
    };
    for (const e of root.querySelectorAll('.tch-cov')) {
      if (!shown(e)) continue;
      const r = e.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (w * h <= 0) continue;
      area += w * h;
      const id = [...e.classList].find((c) => /^tch-(?!tch$|cov|fade|ghost|btn|arc|gho|sys)/.test(c)) || 'tch';
      items.push({ id, rect: [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)) });
    }
    // the open tray (ui.js's hotbar rack, summoned by a long press on F) is a control too
    if (cls.tray && barEl && shown(barEl)) {
      const r = barEl.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (w * h > 0) { area += w * h; items.push({ id: 'tray', rect: [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)) }); }
    }
    return { pct: Math.round(area / (vw * vh) * 1000) / 10, area: Math.round(area), vw, vh, items };
  }

  const api = {
    get enabled() { return on; },
    get quality() { return ctx.state.quality; },
    get portrait() { return cls.portrait; },
    /** 'talk' (a conversation: the full panel) | 'chat' (ambient chatter: the subtitle) | null */
    get dialogue() { return cls.talk ? 'talk' : cls.chat ? 'chat' : null; },
    stick,
    enable(v = true, opt = {}) {
      v = !!v;
      if (opt && opt.quality) applyMobileQuality();
      // a render view's enable is TRANSIENT: the harness's next view starts with
      // setTime(), and the touch HUD must not leak into other systems' renders
      transient = !!(v && opt && opt.transient);
      if (v === on) return on;
      on = v;
      body.classList.toggle('cci-touch', on);
      document.documentElement.classList.toggle('cci-touch', on);
      if (!on) {
        releaseAll(); writeNeutral(); closeTray();
        for (const [k, t] of [['portrait', 'tch-portrait'], ['help', 'tch-helping'], ['intro', 'tch-intro'], ['fly', 'tch-fly'],
          ['idle', 'tch-idle'], ['objopen', 'tch-objopen'], ['tipfade', 'tch-tipfade'], ['mapyield', 'tch-mapyield'],
          ['talk', 'tch-talk'], ['convo', 'tch-convo'], ['chat', 'tch-chat'], ['hush', 'tch-hush'], ['amb', 'tch-amb']]) setCls(k, false, t);
        ambTexts.clear(); convoLabel = '';
        convoT = 0; convoPend = 0; convoAt = null; hushT = 0; chatLine = false; chat.key = ''; objSeen = '';
        if (pausedByUs) { ctx.state.paused = false; pausedByUs = false; }
        for (const k of FIT_VARS) body.style.removeProperty(k);
        fitKey = ''; flyS = 1;
      } else { syncIntroText(); fitT = 0; idleT = 0; }
      ctx.events?.emit?.('touch:enabled', { on });
      return on;
    },
    applyMobileQuality,
    showRotate(v = null) { rotateForced = v; portraitOk = false; },
    /** Force the touch help plate on/off (null = follow ui.js's controls card). */
    showHelp(v = null) { helpForced = v; },
    openTray, closeTray,
    coverage,
    /** `s` with its keyboard words said as touch buttons (what the HUD wrappers do while touch is on). */
    touchText: keyFree,
    /** The last 24 { from, to } strings the wrappers / objective rewrote. */
    get rewrites() { return rewrites.map((r) => ({ ...r })); },
    /** For tests: what the controls look like right now. */
    debug() {
      return { on, joy: { ...joy }, look: { ...look }, pinch: { ...pinch }, stick: { ...stick }, cls: { ...cls }, capsApplied,
        pixelRatio: ctx.renderer?.getPixelRatio?.(), quality: ctx.state.quality, idleT,
        b: { sig: bSig, idle: btn.b.el.classList.contains('idle'), cool: btn.b.el.classList.contains('cool'), cd: lastCdQ },
        a: { verb: aVerb }, e: { lit: btn.e.el.classList.contains('lit'), verb: eVerb },
        f: { sig: fSig, idle: btn.f.el.classList.contains('idle') },
        idle: { c: btn.c.el.classList.contains('idle'), r: btn.r.el.classList.contains('idle'), f: btn.f.el.classList.contains('idle'),
          e: btn.e.el.classList.contains('idle') },
        flyScale: flyS, rest: { ...rest }, talk: cls.talk, sheet: !!(cls.talk && mqSheet && mqSheet.matches),
        // (the round-3 verifiers read this shape)
        tip: { mode: !cls.help ? 'off' : cls.fly ? 'flight' : 'stack', faded: cls.tipfade, mapYield: cls.mapyield, sayHit: tipSayHit },
        dialogue: cls.talk ? 'talk' : cls.chat ? 'chat' : null, convo: cls.convo, convoT, convoPend, hush: cls.hush, amb: cls.amb, ambient: [...ambTexts],
        chat: { ...chat }, map: { big: bigMap, s: +(parseFloat(body.style.getPropertyValue('--tch-maps')) || 0).toFixed(3) } };
    },
    update,
  };

  /** Hand the input back exactly as we found it. */
  function writeNeutral() {
    const inp = ctx.input;
    if (!inp) return;
    if (wroteStick) {
      const vr = inp.virtualRaw, vt = vr && typeof vr === 'object' ? vr : inp.virtual;
      vt.x = 0; vt.y = 0; wroteStick = false;
    }
    if (heldShift) { inp.keys.delete('ShiftLeft'); heldShift = false; }
    if (wrotePointer) { if ('orbit' in inp.pointer) inp.pointer.orbit = false; else inp.pointer.down = false; wrotePointer = false; }
    stick.x = stick.y = 0; stick.active = stick.run = false;
  }

  // ── HUD fitting that CSS alone cannot do ───────────────────────────────────
  // A few times a second: measure the HUD plates that change size (objective,
  // map per mode, flyer HUD) and hand CSS the positions that keep every plate
  // and every control apart.
  let fitT = 0, fitKey = '', flyS = 1, bigMap = false;
  let topLeftEl = null, mapEl = null, dialEl = null, colEl = null, flyEl = null, tipEl = null, sayEl = null, plateEl = null, pillEl = null;
  // a small landscape phone turns a line of dialogue into a bottom sheet (CSS: the same query)
  const mqSheet = (() => {
    try { return window.matchMedia('(orientation: landscape) and (max-height: 599px) and (max-width: 739px)'); } catch { return null; }
  })();
  const rest = { top: 0, right: 0 };             // the stick's resting hint
  const rectOf = (e) => {
    if (!e || !e.isConnected) return null;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const r = e.getBoundingClientRect();
    return r.width > 1 && r.height > 1 ? r : null;
  };
  const setVar = (k, v) => { if (body.style.getPropertyValue(k) !== v) body.style.setProperty(k, v); };
  function fit() {
    const vw = W(), vh = H(), port = vh > vw;
    if (!topLeftEl) topLeftEl = root.querySelector('.cci-topleft');
    if (!mapEl) mapEl = root.querySelector('.cci-map');
    if (!dialEl) dialEl = root.querySelector('.cci-dial');
    if (!colEl) colEl = root.querySelector('.cci-topcol');
    if (!tipEl) tipEl = root.querySelector('.tch-tip');
    if (joy.id < 0 && !joy.outT) {
      const j = joyEl.getBoundingClientRect();
      if (j.height > 0) { rest.top = j.top; rest.right = j.right; }
    }
    const restTop = rest.top || vh - 80;

    // the objective row (its bottom edge is where the map / help plate hang) —
    // and the star pill, which docks under it while a star runs, so the stack
    // (map, help plate, flyer HUD) hangs under the pill instead
    const tl = rectOf(topLeftEl);
    let tlBottom = tl ? tl.bottom : 38, tlRight = tl ? tl.right : 10;
    if (!pillEl || !pillEl.isConnected) pillEl = root.querySelector('.cci-star-pill');
    setVar('--tch-pillt', Math.round(tlBottom + 6) + 'px');
    const pill = pillEl && pillEl.style.display !== 'none' ? rectOf(pillEl) : null;
    if (pill) { tlBottom = Math.max(tlBottom, pill.bottom); tlRight = Math.max(tlRight, pill.right); }
    setVar('--tch-tl', Math.round(tlBottom) + 'px');

    // the icon row: BESIDE the clock in landscape (the top strip — under it the
    // 44-px chips would reach into the central 60 % × 60 %), under it upright
    const dial = rectOf(dialEl);
    let rowTop, rowR;
    const chipHalf = (btn.look.el.offsetHeight || 44) / 2;   // 44-px chips; 32 on a small landscape phone
    if (!port && dial) { rowTop = Math.round(Math.max(4, dial.top + dial.height / 2 - chipHalf)); rowR = Math.round(vw - dial.left + 6); }
    else { rowTop = dial ? Math.round(dial.bottom + 6) : 55; rowR = dial ? Math.round(vw - dial.right) : 10; }
    setVar('--tch-rowt', rowTop + 'px');
    setVar('--tch-rowr', rowR + 'px');
    const lk = btn.look.el.getBoundingClientRect();
    const rowLeft = lk.width ? lk.left : vw - 200, rowBottom = lk.width ? lk.bottom : rowTop + 44;

    // the map plate: near = a small corner plate; world = opened there, bigger.
    // UPRIGHT the world map spans the width (≥ 90 %, centred, aspect kept) under
    // the icon row (and its help tags) and above the thumbs: minimap.js fits the
    // world plate to 40 % of a phone's width, so it is scaled up here.
    let mapBottom = tlBottom, mapRight = 0;
    bigMap = false;
    const mw = mapEl ? mapEl.offsetWidth : 0, mh = mapEl ? mapEl.offsetHeight : 0;
    if (mw && mh && mapEl.style.display !== 'none') {
      const mode = mapEl.dataset.mode || 'local';
      if (port && mode === 'world') {
        let thumbTop = restTop;
        for (const k of ['a', 'b', 'c', 'r', 'f', 'e']) {
          const d = btn[k].el, r = d.getBoundingClientRect();
          if (!r.width || getComputedStyle(d).visibility === 'hidden') continue;
          thumbTop = Math.min(thumbTop, r.top);
        }
        const top = Math.round(Math.max(tlBottom, rowBottom + (cls.help ? 34 : 0)) + 8);
        const s = Math.max(0.4, Math.min((vw - 20) / mw, (thumbTop - 12 - top) / mh));
        const w = mw * s;
        setVar('--tch-maps', s.toFixed(3));
        setVar('--tch-mapt', top + 'px');
        setVar('--tch-mapx', Math.round((vw - w) / 2) + 'px');
        bigMap = true;
        if (!cls.mapyield) { mapBottom = top + mh * s; mapRight = (vw + w) / 2; }
      } else {
        dropVar('--tch-mapt'); dropVar('--tch-mapx');
        const top = tlBottom + 6, room = restTop - 12 - top;
        let s = mode === 'local'
          ? Math.min((port ? 124 : 132) / mw, room / mh)
          : Math.min((port ? vw - 20 : vw * 0.42) / mw, room / mh, 1);
        // upright the icon row (under the clock) shares the map's band: stop short of it
        if (port && top < rowBottom) s = Math.min(s, (rowLeft - 8 - 10) / mw);
        s = Math.max(0.4, Math.min(1, s));
        setVar('--tch-maps', s.toFixed(3));
        if (!cls.mapyield) { mapBottom = top + mh * s; mapRight = 10 + mw * s; }
      }
    } else { dropVar('--tch-mapt'); dropVar('--tch-mapx'); }

    // the help plate: under the objective, never wider than the gap to the icon row
    let tipBottom = 0, tipRight = 0;
    if (cls.help && !cls.tipfade && !cls.fly) {             // (flying, it takes the bottom gap: below)
      const tw = port ? vw - 20 : Math.min(272, vw * 0.38, rowLeft - 20);
      setVar('--tch-tipw', Math.round(tw) + 'px');
      // upright, the plate spans the width: it hangs under the icon row and its tags
      setVar('--tch-tipt', Math.round(port ? Math.max(tlBottom, rowBottom + 34) + 6 : tlBottom + 6) + 'px');
      const t = rectOf(tipEl);
      if (t) { tipBottom = t.bottom; tipRight = t.right; }
    }

    // upright, a conversation docks at the TOP: under the map / icon row (its
    // nameplate tab pokes 12 px above the card) — the bottom stays the thumbs'
    if (!sayEl) sayEl = root.querySelector('.cci-say');
    const sayT = port ? Math.round(Math.max(tlBottom, mapBottom, rowBottom) + 18) : 0;

    // toasts + banner: the band between the top-left and top-right furniture
    // (landscape); a phone held upright drops the column under everything (and
    // under a conversation docked up there)
    const colS = 0.78;
    const L = Math.max(tlRight, tipRight, mapRight) + 10;
    const R = Math.min(dial ? dial.left : vw, rowLeft) - 10;
    // (≥ 140: an iPhone SE's band is ~150 px — the column wraps into it rather
    //  than dropping into the middle of the screen, over the visitor and onto
    //  the dialogue sheet)
    subBase.cx = !port && R - L >= 140 ? (L + R) / 2 : vw / 2;
    if (!port && R - L >= 140) {
      setVar('--tch-colx', Math.round((L + R) / 2) + 'px');
      setVar('--tch-colw', Math.round((R - L) / colS) + 'px');
      setVar('--tch-colt', Math.round(tl ? tl.top : 8) + 'px');
    } else if (!port) {
      // landscape, band too narrow (a long objective, a fat candy count): never
      // drop the column mid-screen — it landed on the visitor and on the
      // conversation sheet. It hangs just under the top row instead, right of
      // the top-left stack (pill / map / help plate), across to the right edge.
      const L2 = Math.max(pill ? pill.right : 0, mapRight, tipRight, 10) + 10, R2 = vw - 10;
      setVar('--tch-colx', Math.round((L2 + R2) / 2) + 'px');
      setVar('--tch-colw', Math.round((R2 - L2) / colS) + 'px');
      setVar('--tch-colt', Math.round(Math.max(tl ? tl.bottom : 38, rowBottom) + 6) + 'px');
    } else {
      setVar('--tch-colx', Math.round(vw / 2) + 'px');
      setVar('--tch-colw', Math.round((vw - 24) / colS) + 'px');
      let colT = Math.max(tlBottom, mapBottom, rowBottom + (cls.help ? 20 : 0), tipBottom) + 6;
      if (port && cls.talk && sayEl) colT = Math.max(colT, sayT + (sayEl.offsetHeight || 80) + 8);
      setVar('--tch-colt', Math.round(colT) + 'px');
    }

    // dialogue (and the tray): bottom-centre between the stick and the arc
    const b = btn.b.el.getBoundingClientRect(), a = btn.a.el.getBoundingClientRect();
    const c = btn.c.el.getBoundingClientRect(), e = btn.e.el.getBoundingClientRect();
    let sayB = 0;                                            // upright: the slot's bottom offset
    if (!port && cls.talk && mqSheet && mqSheet.matches) {
      // a small landscape phone: the line is a bottom SHEET from the stick's rest
      // spot to A (B / C / R / F step aside while it is up; E moves over A)
      const lo = (rest.right || 90) + 10, hi = (a.width ? a.left : vw - 70) - 10;
      setVar('--tch-sayx', Math.round((lo + hi) / 2) + 'px');
      setVar('--tch-sayw', Math.round(hi - lo) + 'px');
      body.style.removeProperty('--tch-sayb');
    } else if (!port) {
      const lo = (rest.right || 90) + 10, hi = (b.width ? b.left : vw - 160) - 10;
      const w = Math.max(200, Math.min(Math.floor(vw * 0.4) - 4, hi - lo));   // ≤ 40% even with a sub-pixel plate
      const x = Math.min(Math.max(vw / 2, lo + w / 2), hi - w / 2);
      setVar('--tch-sayx', Math.round(x) + 'px');
      setVar('--tch-sayw', Math.round(w) + 'px');
      body.style.removeProperty('--tch-sayb');
    } else {
      // upright: the conversation at the top (--tch-sayt, above); the slot just
      // above the fan (E at its lit size) is the tray's and the flight plate's
      let arcTop = vh;
      for (const k of ['a', 'b', 'c', 'r', 'f', 'e']) {
        const d = btn[k].el, r = k === 'e' ? e : k === 'a' ? a : k === 'b' ? b : k === 'c' ? c : d.getBoundingClientRect();
        if (!r.width || (k !== 'e' && getComputedStyle(d).visibility === 'hidden')) continue;
        arcTop = Math.min(arcTop, (r.top + r.bottom) / 2 - (k === 'e' ? 24 : r.height / 2));
      }
      sayB = Math.round(vh - arcTop + 8);
      setVar('--tch-sayx', Math.round(vw / 2) + 'px');
      setVar('--tch-sayw', Math.round(Math.min(520, vw - 20)) + 'px');
      setVar('--tch-sayb', sayB + 'px');
      setVar('--tch-sayt', sayT + 'px');
    }


    // the flying machine's HUD: under the map, sized to end above the stick
    setVar('--tch-flyt', Math.round(mapBottom + 8) + 'px');
    if (cls.fly) {
      if (!flyEl || !flyEl.isConnected) flyEl = root.querySelector('.fly-hud');
      const r = flyEl ? flyEl.getBoundingClientRect() : null;
      if (r && r.height) {
        const base = r.height / flyS;
        let s = (restTop - 10 - (mapBottom + 8)) / base;
        s = Math.round(Math.max(0.5, Math.min(FLY_MAX, s)) * 50) / 50;
        if (s !== flyS) { flyS = s; setVar('--tch-flys', s.toFixed(2)); }
      }
      // the flight help plate takes the bottom gap, so the flyer HUD (altitude +
      // energy) stays up: right of the stick's rest spot and of the HUD, left of
      // B (landscape) — or across the width over the arc (upright)
      if (cls.help) {
        let lo, hi;
        if (!port) {
          // its resting right edge: CSS left + the (scaled) width — the rect may
          // still be mid slide-in, and its scale may have just changed
          const fr = rectOf(flyEl);
          const fRight = fr ? (parseFloat(getComputedStyle(flyEl).left) || 10) + fr.width : 0;
          lo = Math.max(rest.right || 90, fRight) + 10; hi = (b.width ? b.left : vw - 160) - 10;
          body.style.removeProperty('--tch-ftb');
        } else {
          lo = 10; hi = vw - 10;
          setVar('--tch-ftb', (sayB || 150) + 'px');
        }
        setVar('--tch-ftx', Math.round(lo) + 'px');
        setVar('--tch-ftw', Math.round(Math.max(180, hi - lo)) + 'px');
      }
    }

    // a line of dialogue wins over the help plate: where the plate would touch
    // it (nameplate + advance tabs poke ~16 px above the card) the plate steps
    // aside until the line is gone (update() → tch-tipfade). Measured with the
    // raw box, which a visibility-hidden plate still has.
    let hit = false;
    if (cls.help && cls.talk && tipEl && sayEl) {
      const t = tipEl.getBoundingClientRect(), s = sayEl.getBoundingClientRect();
      if (t.height > 2 && s.height > 2) hit = t.right > s.left && t.left < s.right && t.bottom > s.top - 16 && t.top < s.bottom;
    }
    tipSayHit = hit;

    // the chatter subtitle hangs under all of the top furniture (placeSub() also
    // drops it under a toast / banner), left-bounded by the map / help plate /
    // flyer HUD it would otherwise run into
    let flyRight = 0;
    if (cls.fly && flyEl && flyEl.isConnected) { const fr = rectOf(flyEl); if (fr) flyRight = fr.right; }
    subBase.top = Math.max(tlBottom, rowBottom + (cls.help ? 34 : 0), dial ? dial.bottom : 0, port ? Math.max(mapBottom, tipBottom) : 0);
    subBase.lo = Math.max(port ? 0 : Math.max(mapRight, tipRight), flyRight) + 10;
  }
  let tipSayHit = false;

  // The tray shares the dialogue's slot. With a line up it must not bury the
  // text: it stacks above the line (nameplate included) and slides right, up to
  // the first visible control in its band — near the F chip that opened it, and
  // off the visitor, who stands mid-screen just above the dialogue. Placed every
  // frame it is open, from its real box (its width follows the held item's name).
  const dropVar = (k) => { if (body.style.getPropertyValue(k)) body.style.removeProperty(k); };
  function placeTray() {
    // upright the conversation docks at the top: the tray keeps its slot above the fan
    if (H() > W()) { dropVar('--tch-trayx'); dropVar('--tch-trayb'); return; }
    if (!sayEl) sayEl = root.querySelector('.cci-say');
    if (!plateEl) plateEl = root.querySelector('.cci-nameplate');
    const say = rectOf(sayEl);
    if (!say || !barEl || !barEl.offsetWidth) { dropVar('--tch-trayx'); dropVar('--tch-trayb'); return; }
    const vw = W(), vh = H(), plate = rectOf(plateEl), br = barEl.getBoundingClientRect();
    const bottom = Math.min(say.top, plate ? plate.top : say.top) - 6;
    const tw = Math.max(br.width, barEl.offsetWidth * TRAY_S), th = Math.max(br.height, barEl.offsetHeight * TRAY_S);
    const top = bottom - th;
    let right = vw - 10;
    for (const k in btn) {
      const d = btn[k].el, r = d.getBoundingClientRect();
      if (!r.width || getComputedStyle(d).visibility === 'hidden') continue;
      const half = Math.max(r.width, d.offsetWidth) / 2, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;   // E at its lit size
      if (cy + half > top && cy - half < bottom) right = Math.min(right, cx - half - 8);
    }
    const dial = rectOf(dialEl);
    if (dial && dial.bottom > top && dial.top < bottom) right = Math.min(right, dial.left - 8);
    setVar('--tch-trayx', Math.round(Math.max(10 + tw / 2, right - tw / 2)) + 'px');
    setVar('--tch-trayb', Math.round(vh - bottom) + 'px');
  }

  /** ui.js teaches the first weapon with keyboard words ('click or X to use · F
   *  swaps', its own sub-line, not a setObjective): say it with buttons. */
  let objSubEl = null, objBodyEl = null, objSeen = '';
  function touchWording() {
    if (!objSubEl || !objSubEl.isConnected) objSubEl = root.querySelector('.cci-obj-sub');
    if (!objBodyEl || !objBodyEl.isConnected) objBodyEl = root.querySelector('.cci-obj-body');
    const a = objBodyEl?.textContent || '', b = objSubEl?.textContent || '';
    if (a + '\n' + b === objSeen) return;
    const a2 = keyFree(a), b2 = keyFree(b);
    if (a2 !== a) { objBodyEl.textContent = a2; noteRewrite(a, a2); }
    if (b2 !== b) { objSubEl.textContent = b2; noteRewrite(b, b2); }
    objSeen = a2 + '\n' + b2;
  }

  // ── the HUD's words: wrap ui.toast / say / banner / setObjective ──────────
  // Same signatures and return values (weapons.js keeps the toast handle to cut
  // it short); only string arguments are touched, only while touch is on, and a
  // wrapper that throws falls back to the untouched call.
  const rewrites = [];
  function noteRewrite(from, to) {
    if (rewrites.length && rewrites[rewrites.length - 1].from === from) return;
    rewrites.push({ from, to });
    if (rewrites.length > 24) rewrites.shift();
  }
  const fixStr = (s) => { if (typeof s !== 'string') return s; const t = keyFree(s); if (t !== s) noteRewrite(s, t); return t; };
  let wrappedUi = null;
  function wrapUi() {
    const ui = ctx.systems.ui;
    if (!ui || wrappedUi === ui) return;
    wrappedUi = ui;
    const wrap = (name, fix) => {
      const orig = ui[name];
      if (typeof orig !== 'function' || orig.__tchWrapped) return;
      const f = function (...args) {
        if (on) { try { fix(args); } catch { /* words only; never block the call */ } }
        return orig.apply(this, args);
      };
      f.__tchWrapped = true; f.__tchOrig = orig;
      try { ui[name] = f; } catch { /* a frozen API keeps its keyboard words */ }
    };
    // toast(text, secs?, opts?)  opts.title is words too (a copy: the caller may reuse its object)
    wrap('toast', (a) => {
      a[0] = fixStr(a[0]);
      if (a[2] && typeof a[2] === 'object' && typeof a[2].title === 'string') {
        const t = fixStr(a[2].title);
        if (t !== a[2].title) a[2] = { ...a[2], title: t };
      }
    });
    // say(text, opts?) — counted: a line said after we dropped one is a real line.
    // An ambient body's line is noted as chatter; a line of a talk that is on
    // makes chatter up in the box give way, so it opens at once in the panel.
    wrap('say', (a) => {
      a[0] = fixStr(a[0]);
      const o = a[1] && typeof a[1] === 'object' ? a[1] : null;
      if (interactFrame !== frameN && ambientSpeaker(o?.speaker)) {
        ambTexts.delete(normText(a[0])); ambTexts.add(normText(a[0]));
        if (ambTexts.size > 16) ambTexts.delete(ambTexts.values().next().value);
      } else if (cls.convo && (chatLine || ambTexts.size)) {
        if (!sayTextEl || !sayTextEl.isConnected) sayTextEl = root.querySelector('.cci-say-text');
        if (chatLine || ambTexts.has(normText(sayTextEl?.textContent))) hushUi();
      }
      sayN++;
    });
    // banner(title, subtitle?, secs?, island?)
    wrap('banner', (a) => { a[0] = fixStr(a[0]); if (a.length > 1) a[1] = fixStr(a[1]); });
    // setObjective(text, sub?)
    wrap('setObjective', (a) => { a[0] = fixStr(a[0]); if (a.length > 1) a[1] = fixStr(a[1]); });
  }

  // ── button faces follow the game ───────────────────────────────────────────
  let bSig = '', fSig = '', aVerb = 'jump', eVerb = 'talk', lastLit = false, lastFly = null;
  let lastCam = 0, lastMap = '', lastBIdle = null, lastBCool = false, lastCdQ = -1, cdMax = 0, lastFIdle = null;
  let helpSince = -1, mapSince = -2;
  const glyphOf = (inv, id) => { const d = inv?.def?.(id); return itemGlyph(glyphForItem(id, d?.name || '')); };
  function faces(flying, vehicle) {
    const sys = ctx.systems, inv = sys.inventory;
    const held = inv ? (inv.held ?? null) : null;
    // B: the held item's glyph (+ its ammo) on foot; the boost dash in the air
    let n = null;
    if (held && inv?.ammoFor) { try { n = inv.ammoFor(held); } catch { n = null; } }
    const sb = flying ? 'fly' : held ? `h:${held}:${typeof n === 'number' ? n : ''}` : 'none';
    if (sb !== bSig) {
      bSig = sb;
      btn.b.el.innerHTML = flying ? face('B', 'boost')                 // (the flyer's HUD chip says B)
        : held ? `<span class="gl">${glyphOf(inv, held)}</span>${face('', 'use')}${typeof n === 'number' ? `<b class="n">${n}</b>` : ''}`
          : iconFace('hand', 'use', 48);
    }
    // SWAP (F): the collapsed hotbar — tap = next item, hold = all of them. Its
    // face stays the swap arrows (USE already shows the held item)
    const sf = held ? 'h:' + held : 'none';
    if (sf !== fSig) fSig = sf;
    const fIdle = flying || carryable() < (held ? 2 : 1);
    if (fIdle !== lastFIdle) { lastFIdle = fIdle; btn.f.el.classList.toggle('idle', fIdle); }
    const bIdle = !flying && (!held || vehicle);
    if (bIdle !== lastBIdle) { lastBIdle = bIdle; btn.b.el.classList.toggle('idle', bIdle); }
    if (flying !== lastFly) {
      lastFly = flying;
      aVerb = flying ? 'flap' : 'jump';
      btn.a.el.innerHTML = face('A', aVerb);
      btn.a.el.setAttribute('aria-label', aVerb + ' (Space)');
      btn.c.el.classList.toggle('idle', flying); btn.r.el.classList.toggle('idle', flying);
      btn.e.el.classList.toggle('idle', flying);
    }
    // TALK (E) is hidden until something is in reach; then it lights teal with
    // the prompt's verb (a speech bubble for talk / ask, the hand for the rest).
    // While a conversation is open it reads NEXT (E advances the line, ui.js).
    const near = flying ? null : (sys.interaction?.nearest?.() || null);
    let verb = '';
    if (!flying && cls.talk) verb = 'next';
    else if (near) verb = E_VERBS[String(near.label || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '')] ?? 'act';
    const lit = !!verb;
    if (lit !== lastLit || verb !== eVerb) {
      lastLit = lit; eVerb = verb;
      btn.e.el.classList.toggle('lit', lit);
      btn.e.el.innerHTML = verb === 'next' ? iconFace('next', 'next', 48)
        : lit ? iconFace(TALKY.has(verb) ? 'talk' : 'hand', verb, 48) : iconFace('talk', '', 48);
      btn.e.el.setAttribute('aria-label', `${verb || 'talk'} (KeyE)`);
    }
    // the boost's recharge ring
    let bCool = false;
    if (flying) {
      const cd = Number(sys.escape?.routes?.flyer?.state?.boostCd) || 0;
      if (cd <= 0) cdMax = 0; else if (cd > cdMax) cdMax = cd;
      bCool = cd > 0;
      const q = bCool ? Math.round((1 - cd / cdMax) * 40) / 40 : 1;
      if (q !== lastCdQ) { lastCdQ = q; btn.b.el.style.setProperty('--tch-cd', q); }
    }
    if (bCool !== lastBCool) { lastBCool = bCool; btn.b.el.classList.toggle('cool', bCool); }
    // camera mode digit · map off
    const cm = Number(sys.camera?.mode) || 1;
    if (cm !== lastCam) { lastCam = cm; if (camDigit) camDigit.textContent = String(cm); }
    const mm = sys.ui?.mapMode ?? 'local';
    if (mm !== lastMap) {
      if (lastMap && mm !== 'off') { mapSince = clock; fitT = 0; }   // a map opened now beats an older help plate
      lastMap = mm;
      btn.map.el.classList.toggle('off', mm === 'off');
    }
  }

  // ── frame ──────────────────────────────────────────────────────────────────
  function update(dt, ctx) {
    rendered = true;
    frameN++;                       // (touch updates before interaction: 'interact' and its answer share a frame number)
    if (!on) return;
    clock += dt;
    const inp = ctx.input;
    const sys = ctx.systems;
    hookHud();

    // title card: ui.js builds it after us, so look it up once it exists
    if (!intro) { intro = root.querySelector('.cci-intro'); syncIntroText(); }
    const up = !!intro && intro.style.display !== 'none';
    if (up !== introUp) {
      introUp = up; setCls('intro', up, 'tch-intro');
      if (up) releaseAll();
    }

    // portrait → the rotate card, and the world holds its breath behind it
    const tall = H() > W() * 1.05;
    if (!tall) portraitOk = false;
    const showRot = rotateForced != null ? !!rotateForced : (tall && !portraitOk);
    if (showRot !== cls.portrait) {
      setCls('portrait', showRot, 'tch-portrait');
      if (showRot) releaseAll();
      fitT = 0;
    }
    if (showRot && !ctx.state.paused) { ctx.state.paused = true; pausedByUs = true; }
    else if (!showRot && pausedByUs) { ctx.state.paused = false; pausedByUs = false; }

    // help rides on ui.js's controls card (the ? chip sends H)
    if (!hintEl) hintEl = root.querySelector('.cci-hint');
    const helpUp = helpForced != null ? !!helpForced : (!!hintEl && hintEl.style.display !== 'none');
    const helpNow = helpUp && !introUp && !showRot;
    if (helpNow !== cls.help) { if (helpNow) helpSince = clock; fitT = 0; }
    setCls('help', helpNow, 'tch-helping');
    // the help plate takes the near map's slot; a world map and the plate: the later one wins
    const mapWorld = lastMap === 'world';
    // (flying, the plate lives in the bottom gap: only an opened world map and the plate contend)
    const airborne = !!ctx.state.flying;
    setCls('mapyield', helpNow && (airborne ? mapWorld && helpSince > mapSince : (!mapWorld || helpSince > mapSince)), 'tch-mapyield');
    setCls('tipfade', helpNow && ((mapWorld && mapSince > helpSince) || (tipSayHit && cls.talk)), 'tch-tipfade');
    // dialogue: a conversation (the full panel — tch-talk; a small landscape
    // phone makes it a sheet) or ambient chatter (the subtitle): see setConvo()
    if (!talkEl || !talkEl.isConnected) talkEl = root.querySelector('.cci-say');
    if (hushT > 0) hushT = Math.max(0, hushT - dt);
    const hush = hushing() && !!talkEl && talkEl.style.display !== 'none';
    setCls('hush', hush, 'tch-hush');
    const lineUp = boxUp();
    // the box holds an ambient body's line: chatter, whatever else is going on
    let ambNow = false;
    if (lineUp && ambTexts.size) {
      if (!sayTextEl || !sayTextEl.isConnected) sayTextEl = root.querySelector('.cci-say-text');
      ambNow = ambTexts.has(normText(sayTextEl?.textContent));
    }
    if (lineUp && !ambNow && !cls.convo && sys.player?.locked) setConvo(true);   // a scripted beat keeps the panel
    if (lineUp && !ambNow) { if (cls.convo) { convoT = Math.max(convoT, CONVO_GAP); convoPend = 0; } }
    else if (cls.convo) {
      if (convoPend > 0) {
        // no answer yet: wait for it (a paced reply), unless the player walked off
        convoPend -= dt;
        const p = sys.player?.position;
        if (convoAt && p && Math.hypot(p.x - convoAt.x, p.z - convoAt.z) > convoAt.r + 4) convoPend = 0;
        if (convoPend <= 0) { convoPend = 0; convoT = 0; setConvo(false); }
      } else if ((convoT -= dt) <= 0) { convoT = 0; setConvo(false); }
    }
    const talk = lineUp && cls.convo && !ambNow;
    if (talk !== cls.talk) { setCls('talk', talk, 'tch-talk'); fitT = 0; }
    setCls('amb', ambNow, 'tch-amb');

    // flying: the stick never holds Shift (no running on a vehicle) and B turns
    // into the boost dash; the flyer's HUD is re-fitted at once
    const flying = !!ctx.state.flying;
    const vehicle = flying || !!sys.player?.onVehicle || !!ctx.state.vehicle;
    if (flying !== cls.fly) { setCls('fly', flying, 'tch-fly'); fitT = 0; }

    // ── left stick → virtual axis (+ run) ────────────────────────────────
    // (input v3: while the camera's look-around holds moveLock, `virtual`
    //  reads a locked scratch; `virtualRaw` is the real stick the look pans with)
    const vr = inp.virtualRaw;
    const vt = vr && typeof vr === 'object' ? vr : inp.virtual;
    if (joy.id >= 0) {
      const m = Math.hypot(joy.dx, joy.dy);
      const mc = Math.min(1, m);
      const k = mc < DEAD ? 0 : (mc - DEAD) / (1 - DEAD) / (m || 1);
      stick.x = joy.dx * k; stick.y = -joy.dy * k; stick.active = k > 0;
      stick.run = !vehicle && mc > RUN_AT;
      vt.x = stick.x; vt.y = stick.y;
      wroteStick = true;
      if (joyEl.classList.contains('run') !== stick.run) joyEl.classList.toggle('run', stick.run);
    } else {
      if (wroteStick) { vt.x = 0; vt.y = 0; wroteStick = false; }
      stick.x = stick.y = 0; stick.active = false; stick.run = false;
      if (joy.outT > 0 && (joy.outT -= dt) <= 0) stickRest();
    }
    if (stick.run) { inp.keys.add('ShiftLeft'); heldShift = true; }
    else if (heldShift) { inp.keys.delete('ShiftLeft'); heldShift = false; }

    // ── right thumb → camera orbit; pinch → zoom ─────────────────────────
    // Input v3 has pointer.orbit (right/middle-drag = camera only) and the
    // camera orbits on `down || orbit`; weapons.js reads only `down`. So the
    // thumb writes ONLY orbit: no drag, however slow, can fire the held item.
    // (input.js clears orbit on pointercancel; it is re-asserted every frame
    //  before the camera reads it.)
    const P = inp.pointer, hasOrbit = 'orbit' in P;
    if (look.engaged && look.id >= 0 && pinch.id < 0) {
      if (hasOrbit) P.orbit = true; else P.down = true;
      P.dragDX += look.pdx * LOOK_GAIN; P.dragDY += look.pdy * LOOK_GAIN;
      look.pdx = look.pdy = 0;
      wrotePointer = true;
    } else if (wrotePointer) { if (hasOrbit) P.orbit = false; else P.down = false; wrotePointer = false; }
    if (pendingWheel) { inp.wheel += pendingWheel; pendingWheel = 0; }

    // ── the F chip: held long enough = the tray ──────────────────────────
    if (btn.f.pointer >= 0 && !fHold.long) {
      fHold.t += dt;
      if (fHold.t >= LONG_PRESS) { fHold.long = true; if (!flying) openTray(); }
    }
    if (cls.tray && (trayT -= dt) <= 0) closeTray();
    if (cls.tray) placeTray();
    if (cls.objopen && (objT -= dt) <= 0) { setCls('objopen', false, 'tch-objopen'); fitT = 0; }

    // ── faces + idle fade ────────────────────────────────────────────────
    faces(flying, vehicle);
    let held = joy.id >= 0 || look.id >= 0 || pinch.id >= 0 || cls.tray;
    if (!held) for (const id in btn) if (btn[id].pointer >= 0) { held = true; break; }
    if (held || cls.help || introUp || showRot) idleT = 0; else idleT += dt;
    setCls('idle', idleT >= IDLE_AFTER, 'tch-idle');

    if ((fitT -= dt) <= 0) { fitT = 0.2; fit(); }
    touchWording();
    syncChat(lineUp && (!cls.convo || cls.amb) && !showRot && !introUp, dt);
  }

  // ── boot ───────────────────────────────────────────────────────────────────
  if (wantQuality) applyMobileQuality();
  if (force === '1' || (force !== '0' && coarse)) api.enable(true);
  return api;
}
