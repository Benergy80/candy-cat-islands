// ─────────────────────────────────────────────────────────────────────────────
// UI / HUD / PRESENTATION
// Every pixel of screen furniture lives here. All DOM goes inside ctx.uiRoot,
// all styling comes from src/systems/ui/style.js, all pictograms are inline SVG
// from src/systems/ui/glyphs.js (no emoji), and every animation is driven from
// update(dt) (never CSS transitions) so headless renders are deterministic.
//
// PUBLIC API (stable — other systems call these):
//   ui.say(text, { speaker, portrait:{color,family}, duration, pos|getPos })  queued dialogue
//   ui.sayQueue                      array of pending lines (read .length)
//   ui.clear()                       drop the queue and close the dialogue box
//   ui.prompt(label | null, entry?)  interaction pill, pinned to the named object
//   ui.toast(text, secs?, opts?)     ONE at a time, the rest queued; opts {warn,icon,title}
//   ui.banner(title, subtitle?, d?)  location reveal, docked under the toasts
//   ui.setObjective(text, sub?)      top-left goal line + optional quieter second line
//   ui.card({ title, body, glyph|image, buttons:[{label,onClick,primary}] }) → { close() }
//   ui.fade(toBlack, duration) → Promise
//   ui.showMinimap(v) / ui.showHint(v) / ui.cycleMap() / ui.showHotbar(v|null)
// WAVE 3 (map history, Contract G):
//   ui.cycleMap()                    near → world → world+HISTORY → off; returns
//                                    'local' | 'world' | 'history' | 'off'.
//                                    near/world are the corner plate; HISTORY
//                                    is the ATLAS, a big centred sheet (z 58,
//                                    over toasts, banner and dialogue).
//   ui.setMapMode(m)                 'local'|'near' · 'world' · 'history' · 'off'
//   ui.mapMode                       the same four strings (read-only)
//   ui.addMapMarker({ id, x, z, glyph, label }) → id   glyphs: key · winch ·
//                                    star · ammo · weapon · plane (else a dot);
//                                    same id again = move/update in place
//   ui.removeMapMarker(id) → bool    ui.mapMarkers → [{id,x,z,glyph,label}]
//   ui.resetHistory()                wipe explored cells, trail, visited lamps
//                                    and localStorage 'cci.explored.v1'
//   ui.explored() → { candy, cat, cells, landCells, trail, landmarks, grid }
//   The map plate (and the MAP chip shown while it is off) take taps.
// WAVE 2: the hotbar (held weapons/tools, ammo + fuel counts, F/click/X hints),
//   the candy-currency pill and the 1/2/3 camera chip all read their systems
//   defensively — ctx.systems.inventory / .weapons / .camera may not exist.
//   Listens for: inventory:pickup, inventory:held, weapon:use, camera:mode.
// EVENTS: emits 'ui:say' (per line) and 'ui:intro:done' (title card dismissed).
// TITLE SCREEN (wave 3): ui/title.js draws "ESCAPE FROM CANDYLAND AND CAT
//   ISLAND" + credits over the LIVE world — while it is up the camera is a free
//   golden-hour hero shot from the sea (camera.setFree; the logo sits in the
//   sky, the islands are a band below it), the clock is parked at 18:12, the
//   flyer's thermal columns are hidden and the HUD is hidden (#ui.cci-titling).
//   Any key / tap dips to dark, and under the dark the camera (setFree(null) +
//   snap, mode kept), the clock (only if nobody else set it meanwhile), the fog
//   scale and the thermals are handed back; the controls then start as the
//   small H chip (see HINT_NUDGE), not the full card. ?shot=1 skips it
//   entirely unless ?intro=1; ui.skipIntro() is the same dismissal.
//
// LIFETIMES (wave-2b): nothing on this HUD is allowed to outlive its moment.
//   • every say() line auto-dismisses: its own duration, or one read from the
//     text; an ellipsis-only beat lasts SAY_ELLIPSIS; it also closes when the
//     speaker walks away or the player leaves the spot where it was spoken, and
//     a line that went stale in the queue is dropped instead of re-opened.
//   • ONE ambient toast on screen at a time; the rest queue, duplicates inside
//     TOAST_DUP seconds are swallowed, warnings jump the line.
//   • the camera chip only shows for CAM_REVEAL seconds after a 1/2/3 press.
//
// ONE CUE PER FACT (wave-2c): the HUD is not allowed to say the same thing
// twice at once. The world 'E' prompt hides while a dialogue line is open (the
// box has its own E chip and eats the key); a location banner that only repeats
// the minimap footer lives BANNER_ECHO seconds, not its full term; and the
// top-centre column slides right rather than reach into the left 30% of the
// frame, which belongs to the world (Meow Donald's billboard band).
// ─────────────────────────────────────────────────────────────────────────────
import { CSS, injectFonts } from './ui/style.js';
import { createMinimap } from './ui/minimap.js';
import { createDial } from './ui/dial.js';
import { icon, item as itemGlyph, portrait, familyFor, familyHue } from './ui/glyphs.js';
import { createHotbar, createCandy, createCamChip } from './ui/hotbar.js';
import { createTitle } from './ui/title.js';

const CPS = 58;                 // typewriter characters per second
const BANNER_REPEAT = 150;      // seconds before a landmark can announce itself again
const BANNER_ECHO = 3;          // a banner that only repeats the minimap footer
const HINT_LIFE = 20;           // seconds the full controls card stays up (H)
const HINT_NUDGE = 12;          // after the title: the H chip reads 'how to holiday' and breathes this long
const INTRO_DIP = 0.3;          // title → game: seconds down to dark...
const INTRO_LIFT = 0.55;        // ...and back up on the follow camera

// ── lifetimes ────────────────────────────────────────────────────────────────
const SAY_ELLIPSIS = 1.2;       // '…' is a beat, not a speech
const SAY_QUEUE_TTL = 8;        // a queued line older than this is never opened
const SAY_MAX_QUEUE = 5;        // deeper than this and the backlog is the bug
const SAY_SPEAKER_R = 10;       // speaker this far from the player → close
const SAY_PLAYER_R = 12;        // player this far from where it was said → close
const TOAST_DUP = 60;           // the same toast cannot repeat inside a minute
const TOAST_QUEUE = 4;          // waiting toasts kept (oldest chatter dropped)
const TOAST_TTL = 14;           // a toast that waited this long is no longer news
const WEAPON_HINT_LIFE = 14;    // seconds the 'first weapon' sub-line stays up
const PROMPT_NEAR = 40;         // px: the prompt never sits further from its object

// What an ellipsis-only line ('...') shows instead of three dots in a speech box.
const BEATS = ['stares at you.', 'says nothing. Loudly.', 'just watches you.', 'looks you up and down.'];

const OBJ_DAY = 'Explore Candyland. Be home before dark.';
const OBJ_NIGHT = 'It is dark. They are hungry. Get to the pier.';

// Flavour text for automatic landmark banners (explicit banner() calls win).
const SUBTITLES = {
  candy_dock: 'mind the sticky planks',
  candy_village: 'population: sticky',
  gummy_forest: 'chewable old growth',
  frosting_peak: 'elevation, 13 sugarmetres',
  lollipop_meadow: 'do not lick the tall ones',
  chocolate_lake: 'no swimming. no drinking. no.',
  giant_cupcake: 'a landmark and a snack',
  gumdrop_cliffs: 'bouncy all the way down',
  river_mouth: 'where the syrup meets the sea',
  cat_dock: 'welcome! forever!',
  welcome_plaza: 'you are our guest now',
  meow_donalds: "i'm purring it",
  main_street: 'mind the tails',
  town_square: 'all motions carried by nap',
  residential: 'a loaf in every window',
  cat_park: 'supervised zoomies only',
  cat_gym: 'nobody here skips leg day',
  fish_harbor: 'smells like civic pride',
  lighthouse: 'watching the sea. and you.',
  yarn_hill: 'unravelling since 1783',
  escape_beach: 'definitely not an exit',
};

const TOAST_ICONS = [
  [/night|dark|hunt|sour|hungr|home/i, 'moon'],
  [/found|new|discover|unlock|secret/i, 'spark'],
  [/ferry|boat|sail|pier|depart/i, 'ferry'],
  [/beetle|bug|creature|squeak|scatter/i, 'bug'],
  [/cat|meow|purr|paw/i, 'paw'],
  [/fish/i, 'fish'],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const backOut = (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
function hue(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 360; }
function pickIcon(s) { for (const [re, v] of TOAST_ICONS) if (re.test(s)) return v; return 'spark'; }

/** A line made only of dots/ellipses — a pause, which must not sit there. */
const isEllipsis = (s) => /^[\s.…·]+$/.test(String(s));
/** 'Marmalade — Baker' → 'marmalade'; used to match a speaker to a live body. */
const normName = (s) => String(s).toLowerCase().split(/[—–-]/)[0].replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Hue (0–360) of a 0xRRGGBB number / '#rrggbb' string, or null if unusable. */
function colorHue(c) {
  if (c == null) return null;
  let n = null;
  if (typeof c === 'number') n = c & 0xffffff;
  else {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
    if (m) n = parseInt(m[1], 16);
  }
  if (n == null) return null;
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.02) return null;                                  // grey: no usable hue
  let hh = mx === r ? (g - b) / d % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(((hh * 60) % 360 + 360) % 360);
}

export function create(ctx) {
  injectFonts();
  const root = ctx.uiRoot;
  const world = ctx.world;
  const V3 = new ctx.THREE.Vector3(), V3b = new ctx.THREE.Vector3();

  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);

  const add = (cls, html = '', parent = root) => {
    const d = document.createElement('div');
    d.className = cls; d.innerHTML = html; parent.appendChild(d); return d;
  };

  // ── animated panel helper (dt-driven; no CSS transitions) ──────────────────
  function panel(el, opt = {}) {
    const o = { rise: 0.2, fall: 0.15, y: 16, s: 0.9, base: '', back: true, ...opt };
    el.style.display = 'none';
    const a = {
      el, o, p: 0, want: 0,
      show(pop = false) { if (pop) a.p = 0; a.want = 1; },
      hide() { a.want = 0; },
      get visible() { return a.want === 1 || a.p > 0; },
      step(dt) {
        a.p = clamp(a.p + (a.want > a.p ? dt / o.rise : -dt / o.fall), 0, 1);
        if (a.p <= 0) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
        if (el.style.display === 'none') el.style.display = '';
        const e = o.back ? backOut(a.p) : a.p;
        el.style.opacity = clamp(a.p * 1.8, 0, 1).toFixed(3);
        el.style.transform = `${o.base} translateY(${((1 - e) * o.y).toFixed(2)}px) scale(${(o.s + (1 - o.s) * e).toFixed(4)})`;
      },
    };
    return a;
  }

  // ── overlays: night darkening + danger vignette ────────────────────────────
  const nvig = add('cci cci-nvig');
  nvig.style.display = 'none';
  const vig = add('cci cci-vig', '<div class="cci-vig-in"></div><div class="cci-vig-pulse"></div>');
  const vigPulse = vig.querySelector('.cci-vig-pulse');
  vig.style.display = 'none';
  let vigLevel = 0;

  // ── objective (+ candy pill, sharing one top-left row) ─────────────────────
  const topLeft = add('cci cci-topleft');
  const objEl = add('cci cci-obj', `
    <div class="cci-obj-in cci-plate">
      <div class="cci-obj-pin">${icon('star', { fill: 'currentColor', w: 1.4 })}</div>
      <div><span class="cci-eyebrow cci-obj-lab">Objective</span><span class="cci-obj-body"></span><span class="cci-obj-sub"></span></div>
    </div>`, topLeft);
  const objBody = objEl.querySelector('.cci-obj-body');
  const objSub = objEl.querySelector('.cci-obj-sub');
  const objAnim = panel(objEl, { y: -12, s: 0.94 });
  let ownsObjective = true;

  const candy = createCandy(ctx, panel);
  topLeft.appendChild(candy.el);

  // The goal line, plus ONE optional quieter line under it. Wave-2 systems own
  // the sub-line when they pass one; otherwise the HUD may borrow it for a
  // single teaching hint (the first weapon you hold).
  let objText = '', objSubOwn = '', hintSub = '', hintSubT = 0;
  function applyObjective(t, sub = '') { objText = t; objSubOwn = sub; renderObjective(); }
  function renderObjective() {
    const sub = objSubOwn || hintSub;
    if (objText) {
      const changed = objBody.textContent !== objText || objSub.textContent !== sub;
      objBody.textContent = objText;
      objSub.textContent = sub;
      objSub.style.display = sub ? '' : 'none';
      objAnim.show(changed);
    } else objAnim.hide();
  }
  function refreshDefaultObjective() {
    if (!ownsObjective) return;
    applyObjective(ctx.state.isNight && ctx.state.island === 'candy' ? OBJ_NIGHT : OBJ_DAY);
  }

  // ── clock dial + minimap ───────────────────────────────────────────────────
  const dial = createDial(ctx);
  root.appendChild(dial.el);
  const dialAnim = panel(dial.el, { y: -14, s: 0.9 });
  dialAnim.show();

  // Landmarks you have stood in. Shared with the minimap, which persists it
  // with the exploration history (so the lamps stay lit across reloads).
  const visited = new Set();
  const map = createMinimap(ctx, { visited, onTap: () => api.cycleMap() });
  root.appendChild(map.el);
  root.appendChild(map.chip);
  root.appendChild(map.atlas);
  const mapAnim = panel(map.el, { y: 14, s: 0.92 });
  const mapChipAnim = panel(map.chip, { y: 10, s: 0.9 });
  // The explored map is not the corner plate: it is a big centred sheet (the
  // ATLAS) over a scrim, above toasts / banner / dialogue, so nothing transient
  // can sit on top of it — on a phone least of all.
  const atlasAnim = panel(map.atlasPlate, { rise: 0.24, fall: 0.16, y: 18, s: 0.94 });
  let atlasShown = false, scrimOp = -1;
  mapAnim.show();
  let mapOn = true, mapMode = 'local';
  const MAP_MODES = ['local', 'world', 'history'];
  /** Show whichever map surface the mode wants (corner plate or atlas). */
  function syncMap(pop) {
    const atlasOn = mapOn && mapMode === 'history';
    if (mapOn && !atlasOn) mapAnim.show(pop); else mapAnim.hide();
    if (atlasOn) atlasAnim.show(pop); else atlasAnim.hide();
  }

  // ── controls: camera chip, full card, collapsing to a persistent H chip ────
  // (bottom-left column: the camera chip always sits directly above whichever
  //  of the two help panels is showing, so it never has to guess their height.)
  const botLeft = add('cci cci-botleft');
  const camChip = createCamChip(ctx, panel);
  botLeft.appendChild(camChip.el);

  const kb = (...keys) => `<span class="cci-hint-keys">${keys.map((k) => `<span class="cci-key">${k}</span>`).join('')}</span>`;
  const hintEl = add('cci cci-plate cci-hint', `
    <span class="cci-eyebrow">How to holiday</span>
    <div class="cci-hint-grid">
      ${kb('W', 'A', 'S', 'D')}<em>wander</em>
      ${kb('Shift')}<em>scamper</em>
      ${kb('Space')}<em>jump — again mid-air = <b>flip</b></em>
      ${kb('C')}<em>duck · slide · <b>stomp</b> from the air</em>
      ${kb('R')}<em>dodge roll</em>
      ${kb('L')}<em>look up (hold)</em>
      ${kb('V')}<em>look around (hold) · tap = <b>behind me</b></em>
      ${kb('X')}<em>use held item — or <b>left-click</b></em>
      ${kb('F')}<em>next item</em>
      ${kb('E', 'Enter')}<em>talk · open doors</em>
      ${kb('Q', 'E')}<em>turn view — E turns only when <b>nothing is in reach</b></em>
      ${kb('Right-drag', 'Wheel')}<em>orbit · zoom</em>
      ${kb('1', '2', '3')}<em>camera: iso · follow (swings behind you) · top</em>
      ${kb('M')}<em>map: near · world · <b>explored</b> · off — or tap it</em>
      ${kb('H')}<em>hide this</em>
    </div>`, botLeft);
  const hintAnim = panel(hintEl, { y: 14, s: 0.94 });
  const chipEl = add('cci cci-plate cci-chip',
    `<div class="cci-chip-in"><span class="cci-key">H</span><em>help</em></div>`, botLeft);
  const chipAnim = panel(chipEl, { y: 12, s: 0.9 });
  const chipIn = chipEl.querySelector('.cci-chip-in');
  const chipEm = chipEl.querySelector('em');
  let hintMode = ctx.shot ? 'chip' : 'card';
  let hintTimer = ctx.shot ? 0 : HINT_LIFE;
  // Leaving the title lands on the WORLD, not on a key list over a third of the
  // screen: the controls start as the small H chip, spelled out and breathing
  // for HINT_NUDGE seconds; H opens the full card as before.
  let chipNudge = 0, chipNudging = false;

  // ── top column: toasts, then the location banner ───────────────────────────
  const topCol = add('cci cci-topcol');
  const toastWrap = add('cci-toasts', '', topCol);
  const toasts = [];
  const banEl = add('cci-banner', `
    <div class="cci-banner-plate cci-plate">
      <span class="cci-banner-ico"></span>
      <span class="cci-banner-body">
        <span class="cci-banner-title"></span>
        <span class="cci-banner-rule"></span>
        <span class="cci-banner-sub"></span>
      </span>
    </div>`, topCol);
  const banTitle = banEl.querySelector('.cci-banner-title');
  const banSub = banEl.querySelector('.cci-banner-sub');
  const banIco = banEl.querySelector('.cci-banner-ico');
  const banAnim = panel(banEl, { rise: 0.24, fall: 0.4, y: -18, s: 0.86 });
  let banTimer = 0, lastTopW = -1, lastVW = -1;

  // ── interaction prompt ─────────────────────────────────────────────────────
  // The pill carries a LEADER TAIL: a notch off whichever edge faces the thing
  // it names, so in a street full of cats you can see which one E belongs to.
  const promptEl = add('cci cci-prompt',
    `<div class="cci-prompt-in cci-plate"><span class="cci-key">E</span><span class="cci-prompt-txt"></span><span class="cci-prompt-tail"></span></div>`);
  const promptTxt = promptEl.querySelector('.cci-prompt-txt');
  const promptAnim = panel(promptEl, { rise: 0.16, fall: 0.12, y: 10, s: 0.8, base: 'translateX(-50%)' });
  let promptEntry = null, promptW = 190, promptHgt = 38, promptNeedsW = false;
  let promptOn = false, promptTail = '';
  const setTail = (t) => { if (t !== promptTail) { promptTail = t; promptEl.dataset.tail = t; } };
  setTail('none');

  // ── hotbar (bottom-centre; everything else down there stacks above it) ─────
  const hotbar = createHotbar(ctx, panel);
  root.appendChild(hotbar.el);
  let barLift = 0, lastLift = -1;

  // ── dialogue ───────────────────────────────────────────────────────────────
  const sayEl = add('cci cci-say', `
    <div class="cci-say-panel cci-plate cci-hit">
      <div class="cci-portrait"></div>
      <div class="cci-nameplate"></div>
      <div class="cci-say-body"><div class="cci-say-text"></div></div>
      <div class="cci-adv">
        <span class="cci-adv-more">
          <span class="cci-adv-chev">${icon('chev', { w: 3.6 })}</span>
          <span class="cci-adv-count"></span>
        </span>
        <span class="cci-key">E</span>
        <span class="cci-adv-go">${icon('chevr', { w: 3.4 })}</span>
      </div>
    </div>`);
  const sayPanel = sayEl.querySelector('.cci-say-panel');
  const sayPortrait = sayEl.querySelector('.cci-portrait');
  const sayName = sayEl.querySelector('.cci-nameplate');
  const sayText = sayEl.querySelector('.cci-say-text');
  const sayAdv = sayEl.querySelector('.cci-adv');
  const sayAdvMore = sayEl.querySelector('.cci-adv-more');
  const sayAdvCount = sayEl.querySelector('.cci-adv-count');
  const sayAnim = panel(sayEl, { rise: 0.2, fall: 0.14, y: 20, s: 0.92, base: 'translateX(-50%)' });
  const sayQueue = [];
  let current = null, reveal = 0, hold = 0;
  sayPanel.addEventListener('pointerdown', (e) => { e.stopPropagation(); advance(); });
  // While a line is on screen, E / Enter / X belong to the dialogue box: swallow
  // them in the capture phase so the same press doesn't also re-trigger the
  // interactable we're talking to (or fire the held item at it). Space is NOT
  // swallowed — input contract v2 gives Space to the jump, and hopping about
  // during a conversation is a feature.
  const ADVANCE_KEYS = new Set(['KeyE', 'Enter', 'KeyX']);
  window.addEventListener('keydown', (e) => {
    if (!current || e.repeat || !ADVANCE_KEYS.has(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    advance();
  }, true);

  // ── modal card ─────────────────────────────────────────────────────────────
  const cardWrap = add('cci cci-cardwrap',
    `<div class="cci-card cci-plate cci-hit"><div class="cci-card-ico"></div><h2></h2><p></p><div class="cci-card-btns"></div></div>`);
  const cardH2 = cardWrap.querySelector('h2'), cardP = cardWrap.querySelector('p');
  const cardIco = cardWrap.querySelector('.cci-card-ico');
  const cardBtns = cardWrap.querySelector('.cci-card-btns');
  const cardAnim = panel(cardWrap, { rise: 0.22, fall: 0.16, y: 22, s: 0.84 });
  let cardOpen = null;

  // ── fade ───────────────────────────────────────────────────────────────────
  const fadeEl = add('cci cci-fade');
  let fadeVal = 0, fadeTo = 0, fadeRate = 2, fadeResolve = null;

  // ── intro title card ───────────────────────────────────────────────────────
  // ui/title.js builds the screen (logo, credits, sprinkles) and, while it is
  // up, borrows the world: a golden-hour clock and a slow orbit camera. This
  // block owns WHEN: up → (any key / tap) → a short dip to dark, under which
  // the world is handed back → done. 'ui:intro:done' fires on the key press.
  const title = createTitle(ctx);
  const introEl = title.el;
  // the title screen is decoration: if it ever throws, the HUD must live on
  let titleWarned = false;
  const titleDo = (fn) => { try { fn(); } catch (err) { if (!titleWarned) { titleWarned = true; console.error('[ui] title screen', err); } } };
  root.appendChild(introEl);
  const introAnim = panel(introEl, { rise: 0.35, fall: 0.7, y: 0, s: 1, back: false });
  // Screenshots skip the title card so renders show the game HUD.
  // (?intro=1 forces it back on, which is how the title card itself gets shot.)
  const forceIntro = ctx.params?.get('intro') === '1';
  let introState = (ctx.shot && !forceIntro) ? 'skip' : 'up';
  let lockedByIntro = false, introOutT = 0;
  if (introState === 'up') {
    introAnim.p = 1; introAnim.want = 1;
    introEl.style.display = ''; introEl.style.opacity = '1'; introEl.style.transform = 'scale(1)';
    root.classList.add('cci-titling');          // the HUD waits under the title
    titleDo(() => title.begin());
  }
  const dismissIntro = () => {
    if (introState !== 'up') return;
    introState = 'out';
    titleDo(() => title.leave());
    fadeTo = 1; fadeRate = 1 / INTRO_DIP;       // dip to dark; the world swaps back under it
    hintMode = 'chip'; hintTimer = 0; chipNudge = HINT_NUDGE;
    ctx.events.emit('ui:intro:done');
  };
  if (introState === 'up') {
    window.addEventListener('keydown', dismissIntro);
    window.addEventListener('pointerdown', dismissIntro);
  }

  // ── dialogue helpers ───────────────────────────────────────────────────────
  const playerXZ = () => { const p = ctx.systems.player?.position; return p ? { x: p.x, z: p.z } : null; };
  /** During a locked/scripted beat (a ride, a cutscene) distance rules are off. */
  const scripted = () => !!(ctx.systems.player?.locked || ctx.systems.player?.onVehicle);

  /** How long this line lives. Ellipsis beats are capped however they were sent. */
  function sayLife(entry) {
    const d = Number(entry.duration);
    if (d === Infinity) return Infinity;
    const base = Number.isFinite(d) && d > 0 ? d : clamp(1.5 + entry.text.length * 0.032, 1.5, 5.5);
    return isEllipsis(entry.text) ? Math.min(base, SAY_ELLIPSIS) : base;
  }

  /**
   * Where is the speaker? Callers may pass `pos` / `getPos`; otherwise we find
   * the body by name — a registered interactable whose label names them, a Sour
   * Patch Kid, or a cat citizen. Returns a live getter, or null if the line has
   * no body in the world (narration), in which case only the player rule bites.
   */
  function findAnchor(entry) {
    if (typeof entry.getPos === 'function') return entry.getPos;
    const p = entry.pos || entry.at;
    if (p && typeof p.x === 'number' && typeof p.z === 'number') return () => p;
    const who = normName(entry.speaker || '');
    if (who.length < 3) return null;
    try {
      for (const e of ctx.systems.interaction?.items?.values?.() ?? []) {
        const lab = normName(e.label || '');
        if (lab.length >= 3 && (lab.includes(who) || who.includes(lab))) {
          return () => (e.getPos ? e.getPos() : e);
        }
      }
    } catch { /* interaction may not exist */ }
    const byName = (list) => {
      try {
        for (const o of list ?? []) {
          const n = normName(o?.name || '');
          if (n.length >= 3 && (n === who || who.includes(n))) return o;
        }
      } catch { /* system may not exist */ }
      return null;
    };
    const body = byName(ctx.systems.sourPatch?.kids) || byName(ctx.systems.catCitizens?.cats);
    if (body) return () => (typeof body.x === 'number' ? body : body.pos);
    return null;
  }

  /** Has this line outlived its moment — speaker gone, or player walked off? */
  function outOfRange(e) {
    const p = ctx.systems.player?.position;
    if (!p || scripted()) return false;
    if (e.spokeAt && dist2(p, e.spokeAt) > SAY_PLAYER_R) return true;
    if (e.anchorFn) {
      const a = e.anchorFn();
      if (a && typeof a.x === 'number' && dist2(p, a) > SAY_SPEAKER_R) return true;
    }
    return false;
  }

  /** A queued line that the moment has already left behind: never open it. */
  function staleQueued(e) {
    if (ctx.state.elapsed - (e.queuedAt ?? ctx.state.elapsed) > SAY_QUEUE_TTL) return true;
    const p = ctx.systems.player?.position;
    if (!p || scripted()) return false;
    return !!(e.queuedFrom && dist2(p, e.queuedFrom) > SAY_PLAYER_R);
  }

  function present(entry) {
    current = entry; reveal = 0;
    entry.spokeAt = playerXZ();
    entry.anchorFn = findAnchor(entry);
    hold = sayLife(entry);
    const p = entry.portrait || {};
    let fam = p.family || familyFor(entry.speaker, ctx.state.island);
    // TIGER TIME: after 20:00 every cat on the island IS a tiger, so the bust
    // has to agree with the thing standing in front of you.
    if (fam === 'cat' && ctx.systems.catCitizens?.isTigerTime?.()) fam = 'tiger';
    // A caller-supplied colour only picks the HUE; every lightness in the badge
    // is ours, so a speaker whose prop colour is near-black or near-white can
    // never bury the bust or the nameplate text (the old code painted the disc
    // with the raw colour, which is why portraits read as flat dark circles).
    const h = colorHue(p.color ?? entry.portraitColor)
      ?? familyHue(fam, hue(entry.speaker || 'narrator'));
    sayPortrait.innerHTML = portrait(fam, h);
    sayPortrait.style.setProperty('--pbg', `hsl(${h} 44% 89%)`);
    sayPortrait.style.setProperty('--pr', `hsl(${h} 70% 44%)`);
    sayName.style.setProperty('--pacc', `linear-gradient(180deg, hsl(${h} 66% 56%), hsl(${h} 62% 42%))`);
    if (entry.speaker) { sayName.textContent = entry.speaker; sayName.style.display = ''; }
    else sayName.style.display = 'none';
    // An ellipsis-only line is a BEAT, not a speech: '…' alone in a speech box
    // reads as unfinished placeholder text. It plays as a stage direction
    // instead — three dots breathing, and what the speaker is doing.
    if (isEllipsis(entry.text)) {
      const who = String(entry.speaker || '').split(/[—–]/)[0].trim();
      const verb = BEATS[hue((entry.speaker || '') + '|' + entry.text) % BEATS.length];
      const dir = who ? `${who} ${verb}` : verb.charAt(0).toUpperCase() + verb.slice(1);
      sayText.innerHTML = `<span class="cci-beat"><i></i><i></i><i></i></span><em class="cci-beat-dir">${esc(dir)}</em>`;
      reveal = entry.text.length;                   // nothing to type: the clock just runs
    } else sayText.innerHTML = `<span class="cci-ghost">${esc(entry.text)}</span>`;
    sayAdv.style.opacity = '0.5';
    sayAdvMore.style.display = sayQueue.length ? '' : 'none';
    sayAdvCount.textContent = String(sayQueue.length);
    sayAnim.show(true);
  }

  function nextLine() {
    while (sayQueue.length) {
      const e = sayQueue.shift();
      if (staleQueued(e)) continue;          // the beat that queued it is over
      present(e);
      return;
    }
    current = null; sayAnim.hide();
  }

  function advance() {
    if (!current) return;
    if (reveal < current.text.length) reveal = current.text.length;
    else nextLine();
  }

  // ── toasts: ONE on screen, the rest wait ───────────────────────────────────
  // Three ambient notes stacked at once read as an error log, and the same note
  // arriving three times in four minutes ('sugar-gliders') reads as a bug. So a
  // toast is a QUEUE with a memory: one shows, duplicates inside TOAST_DUP
  // seconds are swallowed, warnings cut the line, and chatter that waited too
  // long is simply never shown.
  const toastQueue = [];
  const toastSeen = new Map();      // key → ctx.state.elapsed when last shown
  const toastKey = (text, opts) => (opts.title ? opts.title + '|' : '') + String(text).toLowerCase().replace(/\s+/g, ' ').trim();

  function spawnToast(spec) {
    const { text, opts } = spec;
    const el = document.createElement('div');
    el.className = 'cci-toast cci-plate' + (opts.warn ? ' warn' : ' muted');
    const label = opts.title ? `<span class="cci-toast-t">${esc(opts.title)}</span>` : '';
    el.innerHTML = `<span class="cci-toast-ico">${icon(opts.icon || pickIcon(text), { w: opts.warn ? 2.4 : 2.2 })}</span>${label}<span>${esc(text)}</span>`;
    toastWrap.appendChild(el);
    const t = { el, anim: panel(el, { rise: 0.2, fall: 0.2, y: -12, s: 0.88 }), life: spec.secs, key: spec.key, warn: spec.warn };
    t.anim.show(); toasts.push(t);
    spec.live = t;
    return t;
  }

  function pumpToasts() {
    if (!toastQueue.length) return;
    for (const t of toasts) if (t.life > 0) return;            // one at a time
    for (const t of toasts) if (t.anim.p > 0.25) return;       // let the last clear
    const now = ctx.state.elapsed;
    while (toastQueue.length) {
      const spec = toastQueue.shift();
      if (!spec.warn && now - spec.at > TOAST_TTL) continue;   // no longer news
      const last = toastSeen.get(spec.key);
      if (last !== undefined && now - last < TOAST_DUP) continue;
      toastSeen.set(spec.key, now);
      if (toastSeen.size > 48) for (const [k, v] of toastSeen) if (now - v > TOAST_DUP) toastSeen.delete(k);
      spawnToast(spec);
      return;
    }
  }

  function makeToast(text, secs, opts) {
    const key = toastKey(text, opts);
    const now = ctx.state.elapsed;
    const spec = { text, secs, opts, key, at: now, warn: !!opts.warn, live: null };
    const last = toastSeen.get(key);
    if (last !== undefined && now - last < TOAST_DUP) return spec;        // said that
    if (toastQueue.some((q) => q.key === key)) return spec;               // already waiting
    for (const t of toasts) if (t.life > 0 && t.key === key) return spec; // already up
    if (spec.warn) {
      let i = 0; while (i < toastQueue.length && toastQueue[i].warn) i++;
      toastQueue.splice(i, 0, spec);        // in front of chatter, behind warnings
      // A warning does not stand in line behind chatter.
      for (const t of toasts) if (t.life > 0.2 && !t.warn) t.life = 0.15;
    } else toastQueue.push(spec);
    while (toastQueue.length > TOAST_QUEUE) {
      const i = toastQueue.findIndex((q) => !q.warn);
      if (i < 0) break;
      toastQueue.splice(i, 1);
    }
    pumpToasts();
    return spec;
  }

  // ── landmark tracking ──────────────────────────────────────────────────────
  const lastAnnounced = new Map();
  let hereId = null, hereLabel = '', lastPlace = '';

  /**
   * Which landmark are we standing in? Normalised distance, so a small zone
   * nested inside a big one (the cave inside Yarn Hill) wins. HYSTERESIS: once
   * you are in a place you stay in it until you are clearly out (1.12 r), so
   * walking the rim of Gumdrop Village doesn't flicker the name back to the
   * island's — the island name is a FALLBACK, not a default.
   */
  function landmarkAt(p) {
    let bestId = null, best = Infinity;
    for (const id in world.LANDMARKS) {
      const lm = world.LANDMARKS[id];
      const d = Math.hypot(p.x - lm.x, p.z - lm.z) / lm.r;
      const lim = id === hereId ? 1.12 : 1;
      if (d < lim && d < best) { best = d; bestId = id; }
    }
    return bestId;
  }

  /**
   * The name under the minimap. An explicit `ctx.state.placeOverride` wins (the
   * cave and the palace set it: you are underground, not "on Cat Island"), then
   * the LANDMARK you are standing in, and the island is only the fallback.
   */
  function placeName(id) {
    const ov = ctx.state.placeOverride;
    if (ov) {
      const s = typeof ov === 'string' ? ov : (ov.label || ov.name || ov.title || '');
      if (s) return String(s);
    }
    const lm = id ? world.LANDMARKS[id] : null;
    if (lm) return lm.label;
    if (ctx.state.island === 'sea' || ctx.systems.player?.onFerry) return 'At sea';
    return world.ISLANDS?.[ctx.state.island]?.name || 'Somewhere';
  }

  /** Is this title the whole island rather than a place on it? */
  function isIslandName(title) {
    const t = String(title).trim().toLowerCase();
    for (const id in world.ISLANDS) {
      const n = String(world.ISLANDS[id].name || '').toLowerCase();
      if (t === n || t === n.replace(/\s*island$/, '') || t === id) return true;
    }
    return false;
  }

  /** 'Cat Island' should read as Cat Island even if you shout it from Candyland. */
  function islandOfTitle(title) {
    const t = String(title).toLowerCase();
    if (/\bcat\b|purr|meow|whisker|yarn|fish|watchtower/.test(t)) return 'cat';
    if (/candy|gum|sugar|frosting|chocolate|syrup|lolli|cupcake|sour/.test(t)) return 'candy';
    for (const id in world.LANDMARKS) if (world.LANDMARKS[id].label.toLowerCase() === t) return world.LANDMARKS[id].island;
    return null;
  }

  function showBanner(title, subtitle, secs, island) {
    banTitle.textContent = title;
    banSub.textContent = subtitle || '';
    banSub.style.display = subtitle ? '' : 'none';
    const cat = island === 'cat';
    banEl.classList.toggle('isl-cat', cat);
    banIco.innerHTML = cat ? icon('paw', { w: 2.2 }) : icon('lolli', { w: 2.2, fill: 'currentColor' });
    banAnim.show(true);
    // The strip under the minimap already names this place, permanently. A
    // banner saying the same word is a flourish, not information — so when the
    // two agree the banner gets three seconds and then gets out of the way.
    const echo = String(title).trim() === String(placeName(hereId)).trim();
    banTimer = echo ? Math.min(secs, BANNER_ECHO) : secs;
  }

  // ── night warning ──────────────────────────────────────────────────────────
  let prevTime = ctx.state.time, warnedTonight = false, wasNight = null, tigerWarned = false;

  // ── the first weapon ───────────────────────────────────────────────────────
  // Wave 2 gives you weapons but nothing tells you what to do with one. The
  // FIRST time a weapon is in your hand, the objective grows a single quiet
  // second line; it expires and never comes back.
  let weaponHinted = false;
  function checkFirstWeapon() {
    const inv = ctx.systems.inventory;
    const id = inv?.held;
    if (!id) return;
    let name = '', kind = '';
    try {
      const d = inv.def?.(id);
      if (d) { name = d.name || ''; kind = d.kind || ''; }
      if (!kind) {
        const list = Array.isArray(inv.items) ? inv.items : [...(inv.items ?? [])];
        const it = list.find((o) => o && (o.id ?? o.itemId) === id);
        if (it) { name = name || it.name || ''; kind = it.kind || 'weapon'; }
      }
    } catch { /* inventory shapes drift; the hint is not worth a throw */ }
    if (kind && kind !== 'weapon' && kind !== 'tool') return;
    weaponHinted = true;
    hintSub = `${name || String(id)} in hand — click or X to use · F swaps`;
    hintSubT = WEAPON_HINT_LIFE;
    renderObjective();
  }

  // ── wave-2 systems feed the widgets (all optional; none may exist yet) ─────
  ctx.events.on('inventory:pickup', (e) => {
    const id = e?.itemId ?? e?.id ?? e;
    if (id === 'candy') candy.bump();
    else hotbar.pop(id);
  });
  ctx.events.on('inventory:held', (e) => {
    hotbar.pop(e?.itemId ?? e?.id ?? e);
    if (!weaponHinted && ctx.systems.inventory) checkFirstWeapon();
  });
  ctx.events.on('weapon:use', (e) => hotbar.pop(e?.weapon ?? ctx.systems.inventory?.held));
  ctx.events.on('camera:mode', (m) => camChip.set(m));

  // ── public API ─────────────────────────────────────────────────────────────
  const api = {
    sayQueue,
    say(text, o = {}) {
      const entry = { text: String(text), ...o };
      entry.queuedAt = ctx.state.elapsed;
      entry.queuedFrom = playerXZ();
      if (current) {
        sayQueue.push(entry);
        while (sayQueue.length > SAY_MAX_QUEUE) sayQueue.shift();   // a backlog is a bug
      } else present(entry);
      ctx.events.emit('ui:say', { text, ...o });
      return entry;
    },
    clear() { sayQueue.length = 0; current = null; sayAnim.hide(); },
    advance,
    prompt(label, entry = null) {
      if (!label) { promptOn = false; promptEntry = null; promptAnim.hide(); setTail('none'); return; }
      promptTxt.textContent = label;
      promptEntry = entry;
      promptOn = true;
      promptNeedsW = true;                          // re-measured once, when visible
      // While a line is open the dialogue box owns E (see update): two E cues
      // on screen at once is the HUD arguing with itself.
      if (!current) promptAnim.show();
    },
    toast(text, secs = 3.6, opts = {}) { return makeToast(text, secs, opts); },
    banner(title, subtitle = '', secs = 3.6, island) {
      const here = hereId ? world.LANDMARKS[hereId] : null;
      const isl = island ?? islandOfTitle(title) ?? here?.island ?? ctx.state.island;
      // Standing in a named place? Then the banner names THE PLACE. An
      // island-wide title while you are stood in Purrliament Square reads as
      // the HUD having lost track of you; the caller's subtitle is kept, so the
      // arrival joke still lands, just over the right name.
      const t = (here && here.label !== '???' && isIslandName(title)) ? here.label : title;
      showBanner(t, subtitle, secs, isl);
    },
    /** The goal line. `sub` is an optional quieter second line ('3 candy left'). */
    setObjective(text, sub = '') { ownsObjective = false; applyObjective(text || '', sub || ''); },
    card(spec = {}) {
      cardH2.textContent = spec.title || '';
      cardP.textContent = spec.body || '';
      cardP.style.display = spec.body ? '' : 'none';
      // optional picture: an item/icon glyph, or a real image, on one disc
      const g = spec.glyph || spec.icon;
      if (spec.image) {
        cardIco.className = 'cci-card-ico img';
        cardIco.innerHTML = `<img src="${esc(spec.image)}" alt="">`;
        cardIco.style.display = '';
      } else if (g) {
        cardIco.className = 'cci-card-ico';
        cardIco.innerHTML = itemGlyph(g, { w: 2.1 });
        cardIco.style.display = '';
      } else cardIco.style.display = 'none';
      cardBtns.innerHTML = '';
      const close = () => { if (cardOpen !== handle) return; cardOpen = null; cardAnim.hide(); cardWrap.classList.remove('cci-hit'); };
      const handle = { close };
      const btns = spec.buttons?.length ? spec.buttons : [{ label: 'Continue' }];
      for (const [i, b] of btns.entries()) {
        const el = document.createElement('button');
        el.className = 'cci-btn cci-hit' + ((b.primary ?? i === 0) ? ' primary' : '');
        el.textContent = b.label || 'Continue';
        el.addEventListener('click', (e) => { e.stopPropagation(); if (b.keepOpen !== true) close(); b.onClick?.(handle); });
        cardBtns.appendChild(el);
      }
      cardOpen = handle;
      cardWrap.classList.add('cci-hit');
      cardAnim.show(true);
      return handle;
    },
    closeCard() { cardOpen?.close(); },
    fade(toBlack = true, duration = 0.6) {
      fadeTo = toBlack ? 1 : 0;
      fadeRate = 1 / Math.max(0.016, duration);
      if (fadeResolve) { const r = fadeResolve; fadeResolve = null; r(); }
      if (Math.abs(fadeVal - fadeTo) < 0.001) return Promise.resolve();
      return new Promise((res) => { fadeResolve = res; });
    },
    /** M (or a tap on the plate) cycles: near → world → world + history → hidden. */
    cycleMap() {
      if (!mapOn) { mapOn = true; mapMode = 'local'; }
      else if (mapMode === 'local') mapMode = 'world';
      else if (mapMode === 'world') mapMode = 'history';
      else mapOn = false;
      syncMap(true);
      return mapOn ? mapMode : 'off';
    },
    /** Jump straight to a map mode: 'local'|'near' · 'world' · 'history' · 'off'. */
    setMapMode(m = 'local') {
      const want = m === 'near' ? 'local' : String(m);
      if (want === 'off' || want === 'hidden') { mapOn = false; syncMap(false); return 'off'; }
      if (!MAP_MODES.includes(want)) return mapOn ? mapMode : 'off';
      const changed = !mapOn || mapMode !== want;
      mapOn = true; mapMode = want;
      if (changed) syncMap(true);
      return mapMode;
    },
    showMinimap(v = !mapOn) { mapOn = !!v; syncMap(true); return mapOn; },
    /** Pin something to the chart (both map modes). Same id again = update in place. */
    addMapMarker(spec) { return map.addMarker(spec); },
    removeMapMarker(id) { return map.removeMarker(id); },
    get mapMarkers() { return map.markers; },
    /** Forget everywhere you have been (grid, trail, lit landmarks, localStorage). */
    resetHistory() { map.resetHistory(); if (hereId) visited.add(hereId); },
    explored() { return map.explored(); },
    showHint(v = true) { hintMode = v ? 'card' : 'chip'; hintTimer = v ? Infinity : 0; },
    /** Force the hotbar on/off; null = automatic (shows itself at the first pickup). */
    showHotbar(v = true) { hotbar.show(v); return v; },
    /** Force the candy pill on/off; null = automatic (shows itself at the first candy). */
    showCandy(v = true) { candy.show(v); return v; },
    /** Highlight a camera mode without waiting for the camera's event. */
    setCameraMode(m) { camChip.set(m); return camChip.mode; },
    skipIntro: dismissIntro,
    get here() { return hereId; },
    get mapMode() { return mapOn ? mapMode : 'off'; },

    // ── frame ────────────────────────────────────────────────────────────────
    update(dt, ctx) {
      const inp = ctx.input;
      const st = ctx.state;

      // night plate variant + night objective line
      if (st.isNight !== wasNight) {
        wasNight = st.isNight;
        root.classList.toggle('cci-night', !!st.isNight);
        refreshDefaultObjective();
      }

      // wave-2 widgets (each reads its system defensively and steps its own anim)
      hotbar.update(dt);
      candy.update(dt);
      camChip.update(dt);
      // Everything docked at the bottom centre rides above the rack, eased so
      // the first pickup doesn't snap the dialogue box up a hundred pixels.
      const liftWant = hotbar.visible ? hotbar.height + 14 : 0;
      barLift += (liftWant - barLift) * Math.min(1, dt * 7);
      if (Math.abs(barLift - lastLift) > 0.4) { lastLift = barLift; sayEl.style.bottom = (40 + barLift).toFixed(0) + 'px'; }

      // intro
      if (introState === 'up') {
        if (!lockedByIntro && ctx.systems.player && !ctx.systems.player.locked) { ctx.systems.player.locked = true; lockedByIntro = true; }
        if (inp.pressed.size) dismissIntro();
        titleDo(() => title.update(dt));
      } else if (introState === 'out') {
        titleDo(() => title.update(dt));
        // fully dark: give the camera, clock and HUD back, then lift the dip.
        // The player stays locked until here, so the key that started the game
        // never also jumps / swings / talks.
        introOutT += dt;
        if (fadeVal >= 1 || introOutT > INTRO_DIP + 0.6) {   // (a rival fade can't strand it)
          titleDo(() => title.restore());
          if (lockedByIntro && ctx.systems.player) ctx.systems.player.locked = false;
          lockedByIntro = false;
          root.classList.remove('cci-titling');
          introAnim.p = 0; introAnim.want = 0; introEl.style.display = 'none';
          fadeTo = 0; fadeRate = 1 / INTRO_LIFT;
          introState = 'done';
        }
      } else if (introState === 'skip') {
        introState = 'done';
        ctx.events.emit('ui:intro:done');
      }

      // dialogue — a line closes on its own clock, or when its moment ends
      if (current && outOfRange(current)) nextLine();
      if (current) {
        const len = current.text.length;
        if (reveal < len) {
          reveal = Math.min(len, reveal + dt * CPS);
          const n = Math.floor(reveal);
          sayText.innerHTML = esc(current.text.slice(0, n)) + '<i class="cci-caret"></i><span class="cci-ghost">' + esc(current.text.slice(n)) + '</span>';
        } else if (sayText.querySelector('.cci-caret')) {
          sayText.innerHTML = esc(current.text);
        } else {
          hold -= dt;
          if (hold <= 0) nextLine();
        }
        // 'E ▸' is ALWAYS present (dimmed while the line is still typing) so you
        // can never wonder whether a line is finished; a ▼ + count appears on its
        // left the moment another line is queued behind this one.
        const more = sayQueue.length;
        sayAdv.style.opacity = reveal >= len ? '1' : '0.5';
        sayAdvMore.style.display = more ? '' : 'none';
        if (more) sayAdvCount.textContent = String(more);
        if (inp.pressed.has('KeyE') || inp.pressed.has('Enter') || inp.pressed.has('KeyX')) advance();
      }

      // interaction prompt — PINNED to the thing it names. The entry's live
      // getPos is projected every frame (NPCs walk), and the pill is never
      // allowed further than PROMPT_NEAR px from that head point: it sits just
      // above the head, and only steps to the side when the object is big
      // enough on screen that 'above' would land on top of it.
      // ONE 'E' cue at a time. The dialogue box shows its own E chip and even
      // swallows the keypress, so the world prompt steps aside for the length
      // of the line and comes back when the talking stops.
      if (promptOn) { if (current) promptAnim.hide(); else promptAnim.show(); }
      if (promptAnim.visible) {
        if (promptNeedsW && promptEl.offsetWidth) {
          promptW = promptEl.offsetWidth; promptHgt = promptEl.offsetHeight || promptHgt; promptNeedsW = false;
        }
        let anchored = false;
        if (promptEntry) {
          const pos = promptEntry.getPos ? promptEntry.getPos() : (typeof promptEntry.x === 'number' ? promptEntry : null);
          if (pos && typeof pos.x === 'number') {
            const wy = (pos.y ?? world.height(pos.x, pos.z)) + (promptEntry.promptH ?? 2.2);
            V3.set(pos.x, wy, pos.z);
            V3.project(ctx.camera);
            if (V3.z < 1) {
              const w = window.innerWidth, h = window.innerHeight;
              const topLimit = banAnim.visible ? 168 : 108;   // clear of the top column
              const lowLimit = h - (current ? 200 : 120) - barLift;   // clear of hotbar / dialogue
              const px = (V3.x * 0.5 + 0.5) * w;
              const py = (-V3.y * 0.5 + 0.5) * h;
              // How big is the thing on screen? One interaction radius along the
              // camera's right vector — a signpost's arms are two metres of
              // painted text, and a big silhouette pushes the pill aside.
              const e = ctx.camera.matrixWorld.elements;
              const rw = promptEntry.promptR ?? promptEntry.r ?? 2.5;
              V3b.set(pos.x + e[0] * rw, wy + e[1] * rw, pos.z + e[2] * rw).project(ctx.camera);
              const rPx = clamp(Math.abs(V3b.x - V3.x) * 0.5 * w, 0, 140);
              const edge = 12;
              const above = py - 13;                          // pill's bottom edge
              // HOME is just above the head point — nothing to cover up there,
              // and it is the closest the pill can get. Only a genuinely big
              // subject (a door, a signboard: r ≥ 3.2 u, or its own promptR) or
              // the top furniture pushes the pill out to the side instead.
              const side = (rw >= 3.2 || above - promptHgt < topLimit)
                ? ((w - px) >= px ? 1 : -1) : 0;
              if (side === 0) {
                promptEl.style.left = clamp(px, edge + promptW / 2, Math.max(edge + promptW / 2, w - edge - promptW / 2)).toFixed(1) + 'px';
                promptEl.style.top = clamp(above, topLimit + promptHgt, Math.max(topLimit + promptHgt, lowLimit)).toFixed(1) + 'px';
                promptAnim.o.base = 'translate(-50%,-100%)';
                setTail('down');
              } else {
                const off = clamp(13 + rPx * 0.3, 13, PROMPT_NEAR);
                const sx = side > 0
                  ? clamp(px + off, edge, Math.max(edge, w - promptW - edge))
                  : clamp(px - off, Math.min(w - edge, promptW + edge), w - edge);
                promptEl.style.left = sx.toFixed(1) + 'px';
                promptEl.style.top = clamp(py, topLimit, Math.max(topLimit, lowLimit)).toFixed(1) + 'px';
                promptAnim.o.base = side > 0 ? 'translate(0,-50%)' : 'translate(-100%,-50%)';
                setTail(side > 0 ? 'left' : 'right');
              }
              promptEl.style.bottom = 'auto';
              anchored = true;
            }
          }
        }
        if (!anchored) {
          promptEl.style.left = '50%'; promptEl.style.top = 'auto';
          promptEl.style.bottom = ((current ? 230 : 168) + barLift).toFixed(0) + 'px';
          promptAnim.o.base = 'translateX(-50%)';
          setTail('none');                            // nothing to point at
        }
      }

      // location banner from landmark zones
      const pl = ctx.systems.player;
      if (pl?.position) {
        const id = landmarkAt(pl.position);
        if (id !== hereId) {
          hereId = id;
          if (id) {
            visited.add(id);
            const lm = world.LANDMARKS[id];
            hereLabel = lm.label === '???' ? '' : lm.label;
            const last = lastAnnounced.get(id);
            if (hereLabel && (last === undefined || st.elapsed - last > BANNER_REPEAT)) {
              lastAnnounced.set(id, st.elapsed);
              showBanner(lm.label, SUBTITLES[id] || '', 3.6, lm.island);
            }
          } else hereLabel = '';
        }
        // The strip under the minimap always names WHERE YOU ARE: the landmark
        // while you are inside one, and only otherwise the island.
        const place = placeName(hereId);
        if (place !== lastPlace) { lastPlace = place; map.setPlace(place, !!hereId || !!st.placeOverride); }
      }
      if (banTimer > 0 && (banTimer -= dt) <= 0) banAnim.hide();

      // The top-left 30% of the frame belongs to the WORLD (Meow Donald's
      // 'BILLIONS SERVED' band lives up there). Toasts and the banner dock
      // top-centre; if the column ever grew wide enough to reach into that
      // band, it slides right instead of covering it.
      const vw = window.innerWidth, tw = topCol.offsetWidth || 0;
      if (tw !== lastTopW || vw !== lastVW) {
        lastTopW = tw; lastVW = vw;
        const want = Math.max(vw * 0.5, Math.min(vw - tw / 2 - 12, vw * 0.3 + tw / 2 + 14));
        topCol.style.left = Math.round(want) + 'px';
      }

      // toasts — one on screen; the queue feeds the next as this one clears
      for (let i = toasts.length - 1; i >= 0; i--) {
        const t = toasts[i];
        if (t.life > 0 && (t.life -= dt) <= 0) t.anim.hide();
        t.anim.step(dt);
        if (t.life <= 0 && t.anim.p <= 0) { t.el.remove(); toasts.splice(i, 1); }
      }
      pumpToasts();

      // the first weapon you hold earns ONE line of teaching under the objective
      if (!weaponHinted && ctx.systems.inventory) checkFirstWeapon();
      if (hintSubT > 0 && (hintSubT -= dt) <= 0) { hintSub = ''; renderObjective(); }

      // night warning on Candyland
      const tNow = st.time;
      if (tNow < 12 && prevTime >= 12) warnedTonight = false;   // new day rolled over
      if (!warnedTonight && prevTime < 19 && tNow >= 19 && tNow < 20 && st.island === 'candy') {
        warnedTonight = true;
        makeToast('The Sour Patch Kids are heading home. You should too.', 7, { warn: true, icon: 'warn' });
      }
      prevTime = tNow;

      // TIGER TIME on Cat Island — the citizens system swaps the cats out at
      // 20:00. If it hasn't shipped isTigerTime() yet, fall back to the clock so
      // the warning still lands (and so it reads in screenshots).
      const tiger = ctx.systems.catCitizens?.isTigerTime?.() ?? (tNow >= 20 || tNow < 5.5);
      if (!tiger) tigerWarned = false;
      else if (!tigerWarned && st.island === 'cat') {
        tigerWarned = true;
        makeToast('The cats are… bigger now. Get indoors.', 8, { warn: true, icon: 'paw', title: 'Tiger time' });
      }

      // night darkening + hunting vignette
      const nightAmt = clamp(1 - (st.daylight ?? 1) * 1.25, 0, 1);
      if (nightAmt < 0.01) { if (nvig.style.display !== 'none') nvig.style.display = 'none'; }
      else { nvig.style.display = ''; nvig.style.opacity = (nightAmt * 0.42).toFixed(3); }

      const hunting = ctx.systems.sourPatch?.getMood?.() === 'hunting';
      vigLevel += ((hunting ? 1 : 0) - vigLevel) * Math.min(1, dt * (hunting ? 1.6 : 2.4));
      if (vigLevel < 0.002) { if (vig.style.display !== 'none') vig.style.display = 'none'; }
      else {
        vig.style.display = '';
        vig.style.opacity = vigLevel.toFixed(3);
        vigPulse.style.opacity = (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(st.elapsed * 2.6))).toFixed(3);
      }

      // HUD toggles
      if (inp.pressed.has('KeyM')) api.cycleMap();
      if (inp.pressed.has('KeyH')) api.showHint(hintMode !== 'card');

      // controls card lifetime → collapses to the H chip
      if (hintTimer > 0 && hintTimer !== Infinity) {
        hintTimer -= dt;
        if (hintTimer <= 0) hintMode = 'chip';
      }
      if (hintMode === 'card') { hintAnim.show(); chipAnim.hide(); chipNudge = 0; }
      else { hintAnim.hide(); chipAnim.show(); }
      if (introState === 'done' && chipNudge > 0) chipNudge -= dt;
      const nudgeOn = chipNudge > 0;
      if (nudgeOn !== chipNudging) {
        chipNudging = nudgeOn;
        chipEm.textContent = nudgeOn ? 'how to holiday' : 'help';
        chipEl.classList.toggle('nudge', nudgeOn);
        if (!nudgeOn) chipIn.style.transform = '';
      }
      if (nudgeOn) chipIn.style.transform = `scale(${(1 + 0.045 * (0.5 - 0.5 * Math.cos((HINT_NUDGE - chipNudge) * 3.4))).toFixed(4)})`;

      // widgets — the dial carries a daylight countdown for exactly as long as
      // the objective is still telling you to be home before dark
      dial.update(ctx, /before dark/i.test(objText));
      // exploration history runs whether or not the map is showing
      if (hereId && !visited.has(hereId)) visited.add(hereId);
      map.tick(dt);
      if (mapOn) {
        if (mapMode === 'history') map.drawAtlas(visited, hereId);
        else map.draw(mapMode, visited, hereId);
        mapChipAnim.hide();
      } else if (introState === 'done' || introState === 'skip') mapChipAnim.show();
      // the atlas layer (scrim + sheet) exists only while its sheet is showing
      const aVis = atlasAnim.visible;
      if (aVis !== atlasShown) { atlasShown = aVis; map.atlas.style.display = aVis ? '' : 'none'; }
      if (aVis) {
        const op = Math.round(atlasAnim.p * 100) / 100;
        if (op !== scrimOp) { scrimOp = op; map.atlasScrim.style.opacity = String(op); }
      }

      // fade
      if (fadeVal !== fadeTo) {
        fadeVal = fadeTo > fadeVal ? Math.min(fadeTo, fadeVal + dt * fadeRate) : Math.max(fadeTo, fadeVal - dt * fadeRate);
        fadeEl.style.display = fadeVal > 0.001 ? '' : 'none';
        fadeEl.style.opacity = fadeVal.toFixed(3);
        if (fadeVal === fadeTo && fadeResolve) { const r = fadeResolve; fadeResolve = null; r(); }
      }

      // panel animation
      sayAnim.step(dt); promptAnim.step(dt); banAnim.step(dt); objAnim.step(dt);
      dialAnim.step(dt); mapAnim.step(dt); mapChipAnim.step(dt); atlasAnim.step(dt); hintAnim.step(dt); chipAnim.step(dt);
      cardAnim.step(dt); introAnim.step(dt);
    },
  };

  refreshDefaultObjective();
  lastPlace = placeName(null);            // never an empty strip under the map
  map.setPlace(lastPlace, false);
  return api;
}
