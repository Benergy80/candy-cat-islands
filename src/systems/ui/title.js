// ─────────────────────────────────────────────────────────────────────────────
// TITLE SCREEN — "ESCAPE FROM THE CANDY KINGDOM AND CAT ISLAND" over the LIVE world.
//
// The card is not a painted backdrop: the islands themselves are the picture,
// composed like a hero shot. The camera sits low out on the sea at golden hour,
// looking up a little, so the top half of the frame is clean sky (pink-lavender
// wash, a few lit clouds) and the two islands are a band across the lower half.
// The logo lives ALONE in that sky; the tagline and the start pill sit below
// the islands on the calm sea, on a soft plum scrim with the foreground
// defocused behind them. Sprinkles drift down behind everything.
// The logo is staged in four parts: a ribbon eyebrow (ESCAPE FROM THE), CANDY
// KINGDOM in bouncy candy-striped letters, a gold AND badge, and CAT ISLAND in
// calmer mint letters with ears and a tail, so each island keeps its own
// personality. CANDY KINGDOM is set on ONE line wherever the window is wider
// than 3:4 (desktop, a phone on its side, the link preview) and STACKED as
// CANDY over KINGDOM on portrait windows; see LOGO_CSS for why. index.html's
// loading screen letters the identical logo (.ld-*) with the same staging and
// breakpoint, so the two still register pixel-for-pixel at the crossfade.
//
// Built and stepped by ui.js (which owns the dismissal state machine, the
// 'ui:intro:done' event and the player lock). Every animation here is driven
// from update(dt), never from CSS time, so stepped renders are deterministic.
//
//   createTitle(ctx) → {
//     el            the .cci-intro root (ui.js wraps it in panel())
//     begin()       take the world: golden hour, frozen clock, hero camera
//     update(dt)    camera sway + letters + sprinkles + press pulse
//     leave()       the logo pops as the dip to dark starts
//     restore()     give the world back EXACTLY: camera mode, time, fog, thermals
//     handoff()     Contract K: stop driving the camera (nothing else) and return
//                   { view, saved:{time,frozen,fog} } for intro.takeover()
//     release()     after the cinematic: the thermals come back (camera, clock
//                   and fog were the cinematic's to restore)
//   }
// Nothing here runs unless begin() was called: under ?shot=1 (without
// ?intro=1) ui.js never calls it, so renders keep skipping the card.
//
// THE CURTAIN (real flow). begin() runs inside ui.create, while index.html's
// loading screen still covers everything and main.js's warm-up frames render
// underneath it. The hero view and the dusk clock are applied right there, so
// every frame the world ever renders is already the title's; but the ENTRANCE
// clock holds at 0 until main.js lifts the curtain (#loading.done) — it used to
// run from ui.create, so the reveal landed on an entrance already under way. If
// the loading screen HOLDS its own logo over ours (.ld-top, the crossfade
// hand-off), that logo is the entrance: ours starts assembled underneath it, so
// no letter drops in around the held one. The sky grade, the depth of field and
// the scrim are on from the first frame (they used to ramp in over 0.8 s, which
// re-tinted the world just as it was revealed).
//
// THE HOLD (the same hand-off). The loader's logo idles on CSS keyframes and
// the wall clock, ours on tl: left alone the two stand in different poses when
// the curtain lifts, and the 0.72 s fade shows a doubled logo (a second
// lollipop, two tails, doubled outlines). So at #loading.done the loader PAUSES
// its idle keyframes where they are (index.html), and from that very task
// (a MutationObserver on the curtain) until it is gone, each part of ours
// that idles stands in its twin's pose, read off the twin's
// computed transform (same size, same transform-origin, so the same matrix
// lands on the same pixels). Once the loader has gone, those parts ease from
// that pose into their own motion over HOLD_EASE. It needs a curtain, so never
// under ?shot=1: stepped renders never read CSS time.
// ─────────────────────────────────────────────────────────────────────────────
import { icon } from './glyphs.js';

// The hero shot. Two framings, blended by the window's aspect:
//   WIDE  off the Candy Kingdom's south-west shore looking north-east: the
//         Kingdom (the Palace, the Great Cupcake, the donut arch) foreground-left,
//         the channel, Cat Island (lighthouse, yarn ball) on the right.
//   TALL  (portrait phones) off the Kingdom's pier corner looking east: the arch
//         in front, Cat Island on the horizon behind it.
// Both look slightly UP (el < 0: the lens sits below its target), which drops
// the sea horizon to ~57% of the frame and leaves the top half to the sky. The
// sun (18:12, west, low) rakes in from the left of both. The lens then sways a
// few degrees back and forth, so a long look never drifts off the composition.
const HERO = {
  wide: { target: [-40, 34, -10], az: -0.60, el: -0.030, dist: 300 },
  tall: { target: [40, 50, -20], az: -1.00, el: -0.070, dist: 300 },
};
const SWAY = { az: 0.055, azPeriod: 64, el: 0.004, elPeriod: 23 };
const HALF_HFOV = Math.tan(34.2 * Math.PI / 180);   // the landscape framing's horizontal reach
const TITLE_TIME = 18.2;        // golden hour (sunset is 19:30)
const LOGO_IN = 1.7;            // s: the logo's entrance is complete by then (CAT ISLAND lands at ~1.64)
const HOLD_EASE = 0.9;          // s: after the hand-off, the held pose eases into our own idle motion (see THE HOLD)
const DROP_STEP = 0.04;         // s between candy letters: all 12 of CANDY KINGDOM land by ~1.12 s, before CAT ISLAND rises
const MOTES = 28;               // sprinkles drifting down the frame
// The flyer's thermal columns are gameplay furniture: seen from a lens this
// far out they read as white smears across the sky, so the card hides them
// while it is up (their previous visibility comes back in restore()).
const HIDE_WHILE_TITLED = ['flyer_thermals', 'flyer_thermal_shell'];

// Candy stripes per letter of CANDY KINGDOM (12, the space skipped): a sugar-rush
// of wrappers, pink leading, no two neighbours alike on either staging.
// index.html's loading logo repeats these per letter (--c); keep the two in step.
const CANDY_STRIPES = ['#f2447f', '#ff7a4d', '#f2447f', '#a765ee', '#f2447f',
  '#20b3a6', '#ff7a4d', '#f2447f', '#a765ee', '#f2447f', '#20b3a6', '#ff7a4d'];
const MOTE_COLS = ['#ff7eaa', '#ffd166', '#8fe6c8', '#c49bff', '#fff4e6', '#7cc8ff', '#ff9a6b'];

/** Deterministic PRNG so the sprinkle field is identical in every render. */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const backOut = (x) => { const c = 2.1; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const ease = (x) => x * x * (3 - 2 * x);
/** 0→1 progress of a stage that starts at `start` and lasts `dur` on clock `tt` (module-level: no per-frame closure). */
const kAt = (tt, start, dur) => clamp((tt - start) / dur, 0, 1);

/** One word's letters; `i0` continues the letter count (the stripe colour) across words.
 *  The K is tagged .kk: its outline needs a trim (see LOGO_CSS). */
const letters = (txt, cls, fill, i0 = 0) => { let n = i0; return [...txt].map((ch) => (ch === ' '
  ? '<span class="cci-ti-sp"></span>'
  : `<span class="cci-ti-l ${cls}${ch === 'K' ? ' kk' : ''}"${fill ? ` style="--c:${fill(n++)}"` : ''}><b class="o">${ch}</b><b class="f">${ch}</b></span>`)).join(''); };

// THE STAGING OF CANDY KINGDOM (the rest of the title's CSS is style.js's).
// CANDY KINGDOM is 7.65 em of letters to the old one-word logo's 5.51.
//  · LANDSCAPE (wider than 3:4): ONE line at the old letter size. Most of these
//    windows are height-bound at 1 em (the logo is fitted to the sky zone's
//    HEIGHT), so the logo just gets wider and keeps the old logo's height: the
//    composition is unchanged (the logo alone in the sky, clear of the island
//    tops). The near-square ones (3:4 up to ~7:6, e.g. a browser snapped to half
//    a 1920 screen) ARE width-bound, and fit() scales them, lollipop included.
//  · PORTRAIT (3:4 and taller): a phone upright IS width-bound, and one line
//    would scale the whole logo to ~0.75 (the ribbon to ~9.6 px). So the words
//    STACK, CANDY over KINGDOM (4.36 em, narrower than the old 5.51 em), and the
//    logo, a line taller in a sky with height to spare, is set 1.2× to fill the
//    width the old one did: ~330 of 342 px on a 390 px phone, unscaled by fit().
//    CANDY is CENTRED over KINGDOM, under the centred ribbon (flush left, the
//    ribbon hung ~50 px past the Y over empty sky and the lollipop crowded the
//    corner), and the lollipop drops beside the C, into the notch CANDY leaves
//    over the K, where the ribbon can't sit on it.
// The lollipop rides the CANDY line (.cci-ti-cline), so it peeks from behind
// that C either way. index.html's .ld-* mirrors this rule for rule (same
// breakpoint: the portrait query both files already lay out by), so the loading
// logo still lands exactly on this one at the crossfade.
// THE TWO PLACES ARE EQUALS. On one line CAT ISLAND is set at .96 of CANDY
// KINGDOM's size (.8 before) with a touch more tracking, ~70% of line 1's width;
// at .8 it read as a subtitle under a one-line logo. Portrait keeps .8: stacked,
// CAT ISLAND already matches KINGDOM's width. Both lines share the gloss, the
// plum under-shade and the candy stripe (faint cream on mint), so the lockup
// reads as one logo, not two stacked. The ribbon is .255em (.275 on phones,
// ~18 px): ESCAPE carries the name and was the smallest type in the lockup.
// THE TAIL rises from BEHIND the D (its root is hidden in the D's bowl) and
// hooks over above the cap line, ringed and dark-tipped, as the ears peek over
// the C: a cat behind the words. On the baseline after the D, in the letters'
// own mint, it read as an S ("CAT ISLANDS"). Its pivot is that hidden root.
// THE GLOW. The words carry a third shadow, a soft plum glow all round, so the
// lettering holds its own over the lit low-poly clouds that drift behind it
// (the loader's letters and ornaments carry the same one).
// THE K's OUTLINE. Baloo 2's K is four overlapping contours, and the upper arm's
// starts at a 45° corner (131, 248) just inside the stem. The .17em text stroke
// mitres that corner out to x = -.069em, past the stem's own outline at -.02em
// (lsb .065 − half the stroke .085), so a painted K grows a dark spur on its
// left side (a K on its own compositing layer, like the loader's, happens not
// to). Nothing of the K's real outline lies left of -.02em, so the outline layer
// is trimmed there, exactly: a margin brings a nub of the spur back. index.html
// trims .ld-l.kk the same way, so the two K's match at the crossfade.
const LOGO_CSS = `
#ui .cci-ti-cline { position: relative; display: flex; align-items: flex-end; }
#ui .cci-ti-l.kk .o { clip-path: inset(-.5em -.5em -.5em -.02em); }
#ui .cci-ti-logo > .cci-ti-eyebrow { font-size: .255em; }
#ui .cci-ti-logo > .cci-ti-word {
  filter: drop-shadow(0 .06em 0 var(--ti-ink)) drop-shadow(0 .15em .16em rgba(16,4,24,.5)) drop-shadow(0 0 .22em rgba(40,10,52,.45));
}
#ui .cci-ti-logo > .cci-ti-cat { font-size: .96em; letter-spacing: .015em; }
#ui .cci-ti-cat .cci-ti-l.ct .f {
  background-image:
    linear-gradient(180deg, rgba(255,255,255,.66) 0%, rgba(255,255,255,.14) 30%, rgba(255,255,255,0) 44%),
    linear-gradient(0deg, rgba(90,10,50,.32) 0%, rgba(90,10,50,0) 30%),
    repeating-linear-gradient(126deg, rgba(255,246,236,0) 0 .09em, rgba(255,246,236,.2) .09em .18em),
    linear-gradient(180deg, #e6fff6 0%, #a2f0d7 40%, #52c7a8 72%, #2fa88c 100%);
}
#ui .cci-ti-l > .cci-ti-tail { right: -.56em; bottom: .36em; width: .86em; height: 1em; transform-origin: 23.3% 80%; }
@media (max-height: 480px) {
  #ui .cci-ti-logo > .cci-ti-eyebrow { font-size: .275em; }
}
@media (max-aspect-ratio: 3/4) {
  #ui .cci-ti-block > .cci-ti-logo { font-size: calc(var(--tf) * 1.2); }
  #ui .cci-ti-logo > .cci-ti-eyebrow { font-size: .275em; }
  #ui .cci-ti-word.cci-ti-candy { flex-direction: column; align-items: center; }
  #ui .cci-ti-word.cci-ti-candy > .cci-ti-sp { display: none; }
  #ui .cci-ti-cline.k { margin-top: -.05em; }
  #ui .cci-ti-logo > .cci-ti-cat { font-size: .8em; letter-spacing: -.01em; }
  #ui .cci-ti-cline > .cci-ti-lolli { left: -.44em; top: .1em; }
}`;

// Cat ears (sit behind the C of CAT) and a tail (rises from behind the D of ISLAND).
const EARS = `<svg viewBox="0 0 100 72" fill="none" focusable="false">
  <g stroke="#24122c" stroke-width="8" stroke-linejoin="round">
    <path d="M5 70 L15 5 L49 50 Z" fill="#a8f0d6"/><path d="M51 50 L85 5 L95 70 Z" fill="#a8f0d6"/>
  </g>
  <path d="M18.5 50 L21.5 23 L37 44 Z" fill="#ff9fbf"/><path d="M63 44 L78.5 23 L81.5 50 Z" fill="#ff9fbf"/>
</svg>`;
// 1 unit = .01em of the CAT ISLAND letters; the D's box right edge is x = 30 and the root (20, 64) sits in the
// D's bowl, clear of its counter, so the D covers it. Rings and the dark tip are dashes on the same path
// (pathLength 100). Everything stays inside the viewBox: the title clips svg overflow, the loader doesn't.
const TAIL_D = 'M20 64 C29 53 36 42 36 28 C36 12 45 1 56 3 C66 5 70 14 66 24';
const TAIL = `<svg viewBox="0 -16 86 100" fill="none" focusable="false">
  <path d="${TAIL_D}" stroke="#24122c" stroke-width="31" stroke-linecap="round"/>
  <path d="${TAIL_D}" stroke="#a8f0d6" stroke-width="15" stroke-linecap="round"/>
  <path d="${TAIL_D}" pathLength="100" stroke="#3aae98" stroke-width="15" stroke-dasharray="0 27 6 10 6 10 6 100"/>
  <path d="${TAIL_D}" pathLength="100" stroke="#1f6b63" stroke-width="15" stroke-linecap="round" stroke-dasharray="0 82 18 100"/>
  <path d="M27.5 48 C30.5 43 32 36 32 29" stroke="#f0fffa" stroke-width="3.2" stroke-linecap="round" opacity=".8"/>
</svg>`;
// A swirl lollipop that peeks out from behind the C of CANDY.
// LOLLI_INK: how far (em) its ink reaches left of the CANDY line at the -29° end
// of its sway: .34 (.cci-ti-lolli's left) + .293 (the r 28.5 circle, stroke
// included, swung about 50% 90%), rounded up. fit() keeps that ink on screen.
const LOLLI_INK = 0.64;
const LOLLI = `<svg viewBox="0 0 60 104" fill="none" focusable="false">
  <rect x="25.5" y="44" width="9" height="57" rx="4.5" fill="#fff6ec" stroke="#24122c" stroke-width="4.5"/>
  <path d="M27 56 l6 -4 M27 70 l6 -4 M27 84 l6 -4" stroke="#ef4f84" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="30" cy="30" r="26" fill="#ff5c93" stroke="#24122c" stroke-width="5"/>
  <clipPath id="cci-ti-lc"><circle cx="30" cy="30" r="23.5"/></clipPath>
  <path clip-path="url(#cci-ti-lc)" d="M30 30 a3 3 0 0 1 6 0 a6 6 0 0 1 -12 0 a9 9 0 0 1 18 0 a12 12 0 0 1 -24 0 a15 15 0 0 1 30 0 a18 18 0 0 1 -36 0 a21 21 0 0 1 42 0 a24 24 0 0 1 -48 0" stroke="#fff6ec" stroke-width="2.9" stroke-linecap="round"/>
  <path d="M14 18 q6 -9 16 -10" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>
</svg>`;

export function createTitle(ctx) {
  const el = document.createElement('div');
  el.className = 'cci cci-intro';
  const star = icon('star', { stroke: '#24122c', fill: '#ffc94a', w: 1.7 });
  const stripe = (i) => CANDY_STRIPES[i % CANDY_STRIPES.length];
  el.innerHTML = `
    <div class="cci-ti-sky"></div>
    <div class="cci-ti-dof"></div>
    <div class="cci-ti-scrim"></div>
    <div class="cci-ti-motes"></div>
    <style>${LOGO_CSS}</style>
    <h1 class="cci-ti-sr">Escape from the Candy Kingdom and Cat Island</h1>
    <div class="cci-ti-stage">
      <div class="cci-ti-top">
        <div class="cci-ti-block">
          <div class="cci-ti-logo" aria-hidden="true">
            <div class="cci-ti-eyebrow"><span class="cci-ti-rib">ESCAPE FROM THE</span></div>
            <div class="cci-ti-word cci-ti-candy">
              <span class="cci-ti-cline c"><span class="cci-ti-lolli">${LOLLI}</span>${letters('CANDY', 'cd', stripe)}</span><span class="cci-ti-sp"></span><span class="cci-ti-cline k">${letters('KINGDOM', 'cd', stripe, 5)}</span>
            </div>
            <div class="cci-ti-and"><span class="st">${star}</span><span class="cci-ti-andb">AND</span><span class="st">${star}</span></div>
            <div class="cci-ti-word cci-ti-cat">
              ${letters('CAT ISLAND', 'ct')}
            </div>
            <span class="cci-ti-spark s1">${icon('spark', { fill: 'currentColor', w: 1.2 })}</span>
            <span class="cci-ti-spark s2">${icon('spark', { fill: 'currentColor', w: 1.2 })}</span>
            <span class="cci-ti-spark s3">${icon('spark', { fill: 'currentColor', w: 1.2 })}</span>
          </div>
        </div>
      </div>
      <div class="cci-ti-lower">
        <div class="sub">a holiday you'll never forget (or leave)</div>
        <div class="cci-ti-pressrow"><div class="press">press any key · tap to start</div></div>
      </div>
    </div>
    <div class="cci-ti-credits">
      <span class="cci-ti-cr">Original Concept by <b>Daniel Lavitt</b></span>
      <span class="cci-ti-crdot"></span>
      <span class="cci-ti-cr">Produced by <b>ChiLab + Claude</b></span>
    </div>`;

  // ears ride the C of CAT, the tail the D of ISLAND
  const catL = [...el.querySelectorAll('.cci-ti-l.ct')];
  const earsEl = document.createElement('span'); earsEl.className = 'cci-ti-ears'; earsEl.innerHTML = EARS;
  catL[0].prepend(earsEl);
  const tailEl = document.createElement('span'); tailEl.className = 'cci-ti-tail'; tailEl.innerHTML = TAIL;
  catL[catL.length - 1].prepend(tailEl);

  const candyL = [...el.querySelectorAll('.cci-ti-l.cd')];
  const brow = el.querySelector('.cci-ti-eyebrow');
  const andEl = el.querySelector('.cci-ti-and');
  const badge = el.querySelector('.cci-ti-lolli');
  const sparks = [...el.querySelectorAll('.cci-ti-spark')];
  const sub = el.querySelector('.sub');
  const pressRow = el.querySelector('.cci-ti-pressrow');
  const press = el.querySelector('.press');
  const lower = el.querySelector('.cci-ti-lower');
  const credits = el.querySelector('.cci-ti-credits');
  const top = el.querySelector('.cci-ti-top');
  const block = el.querySelector('.cci-ti-block');
  const cline = el.querySelector('.cci-ti-cline.c');
  const scrim = el.querySelector('.cci-ti-scrim');
  const skies = [...el.querySelectorAll('.cci-ti-sky')];
  const dof = el.querySelector('.cci-ti-dof');

  // ── sprinkles: a fixed, seeded field in three depths; wraps top→bottom ─────
  // Far ones are small, slow, soft and faint; near ones are crisp. They live
  // BEHIND the logo and the lower group (earlier in the DOM), and their size
  // follows the window so a phone never gets desk-sized confetti.
  const motesEl = el.querySelector('.cci-ti-motes');
  const R = rng(20260922);
  const motes = [];
  for (let i = 0; i < MOTES; i++) {
    const d = document.createElement('i');
    const round = R() < 0.3;
    const tier = i % 3;                                   // 0 far · 1 mid · 2 near
    const z = [0.5, 0.75, 1.0][tier] + R() * 0.12;
    const len = round ? 5.5 + R() * 1.5 : 8 + R() * 4;
    d.className = (round ? 'dot' : 'jim') + (tier === 0 ? ' far' : tier === 1 ? ' mid' : '');
    d.style.width = (round ? len : 3.4 + R() * 0.8).toFixed(1) + 'px';
    d.style.height = len.toFixed(1) + 'px';
    d.style.background = MOTE_COLS[i % MOTE_COLS.length];
    motesEl.appendChild(d);
    motes.push({ d, x: R(), y: R(), v: 0.03 + R() * 0.035, sw: 8 + R() * 22, sf: 0.4 + R() * 0.8, ph: R() * 6.28, r0: R() * 360, rv: (R() - 0.5) * 120, z });
  }

  let t = 0, running = false, leaving = 0;
  let saved = null, ownTime = false, timeSetBusy = false;
  let curtain = null;            // #loading while it still covers the card (real flow only)
  let logoSkip = 0;              // s added to the logo's clock: LOGO_IN when a held loading logo is its entrance
  let camOwned = true;           // false once handoff() gave the lens to the cinematic
  let lastW = -1, lastH = -1, fitT = 0, moteK = 1;
  let hidden = [];                                       // [{ o, vis }] thermals parked while titled
  const heroView = { target: [0, 0, 0], azimuth: 0, elevation: 0, distance: 300, fov: 46 };

  // ── THE HOLD: our idling parts and their twins in index.html's logo ────────
  const HOLD_PAIRS = [[candyL, '.ld-l.cd .ld-li'], [catL, '.ld-l.ct .ld-li'], [[badge], '.ld-lolw'], [[andEl], '.ld-andr'],
    [[earsEl], '.ld-ears'], [[tailEl], '.ld-tail'], [sparks, '.ld-spark']];
  let held = null;               // #loading while its paused logo is still over ours
  let hold = null;               // Map: our part → { src: its twin, tf: the twin's transform, p: [tx, ty, deg, scale] }
  let holdU = 0, holdDur = HOLD_EASE, holdW = 0;   // holdW: -1 standing in, else the ease 0 → 1
  let liftObs = null;            // watches the curtain for .done, so we stand in within the same task

  /** A 2D transform as [tx px, ty px, rotation deg, uniform scale]; 'none' is the identity. */
  function decompose(tf) {
    const m = /^matrix(3d)?\(([^)]*)\)/.exec(tf || '');
    if (!m) return [0, 0, 0, 1];
    const v = m[2].split(',').map(Number);
    const [a, b, e, f] = m[1] ? [v[0], v[1], v[12], v[13]] : [v[0], v[1], v[4], v[5]];
    return [e || 0, f || 0, Math.atan2(b, a) * 180 / Math.PI, Math.hypot(a, b)];
  }
  /** The curtain just lifted over a held loading logo: pair each idling part with its twin. */
  function holdOn(ld) {
    hold = new Map();
    for (const [ours, sel] of HOLD_PAIRS) {
      const src = [...ld.querySelectorAll(sel)];
      if (src.length !== ours.length) continue;       // (lettered differently: that part keeps its own motion)
      ours.forEach((e, i) => hold.set(e, { src: src[i], tf: getComputedStyle(src[i]).transform, p: null }));
    }
    held = hold.size ? ld : null;
    if (!held) hold = null;
    holdW = held ? -1 : 0;
  }
  /** Per frame, before the poses: stand in the twins' poses while the loader is up, then ease out of them. */
  function holdTick(dt) {
    if (!hold) return;
    if (held) {
      let gone = !held.isConnected;
      if (!gone) { try { gone = getComputedStyle(held).display === 'none'; } catch (err) { gone = true; } }
      if (!gone && !(leaving > 0)) { for (const h of hold.values()) h.tf = getComputedStyle(h.src).transform; holdW = -1; return; }
      // gone (or a key dismissed the card, and the pop must read at once): ease out of the last pose
      for (const h of hold.values()) h.p = decompose(h.tf);
      held = null; holdU = 0; holdDur = leaving > 0 ? 0.2 : HOLD_EASE; holdW = 0;
      return;
    }
    holdU += dt;
    holdW = ease(clamp(holdU / holdDur, 0, 1));
  }
  /** Write one part's transform: `str` is its own pose, (y em, deg, s) the same pose in numbers for the ease. */
  function pose(el, str, y, deg, sc) {
    const h = hold && hold.get(el);
    if (!h) { el.style.transform = str; return; }
    if (holdW < 0) { el.style.transform = h.tf; return; }
    const w = holdW, k = 1 - w, p = h.p;
    el.style.transform = `translate(${(p[0] * k).toFixed(2)}px,${(p[1] * k).toFixed(2)}px) translateY(${(y * w).toFixed(4)}em) rotate(${(p[2] * k + deg * w).toFixed(2)}deg) scale(${(p[3] * k + sc * w).toFixed(4)})`;
  }
  /** #loading just got .done (main.js adds it between frames): stand in at once, not a frame later. */
  function standIn() {
    if (hold || !curtain || !curtain.classList.contains('done') || curtain.style.display === 'none') return;
    holdOn(curtain);
    if (hold) for (const [el, h] of hold) el.style.transform = h.tf;
  }
  function holdOff() { hold = null; held = null; holdW = 0; if (liftObs) { liftObs.disconnect(); liftObs = null; } }

  // Somebody else set the clock while the card was up (a harness, a debug
  // call): then the clock is theirs and restore() leaves it alone.
  ctx.events.on('time:set', () => { if (!timeSetBusy) ownTime = false; });

  /** 'time:set' makes the sky re-grade at once (a listener's throw must not kill the UI). */
  function announceTime() {
    timeSetBusy = true;
    try { ctx.events.emit('time:set', ctx.state.time); }
    catch (err) { console.warn('[ui/title] a time:set listener threw', err); }
    finally { timeSetBusy = false; }
  }

  /** The hero lens for this window: wide ↔ tall blended by aspect, then swayed. */
  function frame() {
    const cam = ctx.systems.camera;
    if (!cam?.setFree) return;
    const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
    const a = W / H;
    const u = ease(clamp((a - 0.6) / 0.75, 0, 1));        // 0 portrait … 1 landscape
    const A = HERO.tall, B = HERO.wide;
    for (let i = 0; i < 3; i++) heroView.target[i] = A.target[i] + (B.target[i] - A.target[i]) * u;
    // keep the landscape framing's horizontal reach on any aspect; phones clamp
    heroView.fov = clamp(2 * Math.atan(HALF_HFOV / a) * 180 / Math.PI, 34, 62);
    heroView.azimuth = A.az + (B.az - A.az) * u + SWAY.az * Math.sin(t * 2 * Math.PI / SWAY.azPeriod);
    heroView.elevation = A.el + (B.el - A.el) * u + SWAY.el * Math.sin(t * 2 * Math.PI / SWAY.elPeriod);
    heroView.distance = A.dist + (B.dist - A.dist) * u;
    cam.setFree(heroView);
  }

  function hideThermals() {
    for (const nm of HIDE_WHILE_TITLED) {
      const o = ctx.scene?.getObjectByName?.(nm);
      if (!o) continue;
      if (!hidden.some((h) => h.o === o)) hidden.push({ o, vis: o.visible });
      o.visible = false;
    }
  }

  /** Scale the logo down if a small or odd-shaped window can't hold it in the sky zone.
   *  The lollipop is placed absolutely, so it isn't in the block's box: at the far end of its sway its ink
   *  reaches LOLLI_INK em left of the CANDY line. What hangs past the block counts on both sides (so the
   *  logo stays centred), and that ink keeps 8 px from the window edge (the block keeps its 12 px).
   *  index.html's loader fit() does exactly the same, so the two logos still register at the hand-off. */
  function fit() {
    block.style.transform = 'none';
    const aw = top.clientWidth - 24, ah = top.clientHeight - 4;
    const bw = block.offsetWidth, bh = block.offsetHeight;
    const oh = Math.max(0, block.getBoundingClientRect().left - cline.getBoundingClientRect().left
      + LOLLI_INK * (parseFloat(getComputedStyle(cline).fontSize) || 0));
    const s = clamp(Math.min(aw / Math.max(1, bw), (aw + 8) / Math.max(1, bw + 2 * oh), ah / Math.max(1, bh)), 0.4, 1);
    block.style.transform = s < 0.999 ? `scale(${s.toFixed(4)})` : 'none';
    moteK = clamp(Math.min(window.innerWidth, window.innerHeight) / 900, 0.5, 1);
  }

  const api = {
    el,
    get running() { return running; },
    begin() {
      if (running) return;
      running = true; t = 0; leaving = 0; camOwned = true; holdOff();
      const ld = (!ctx.shot && typeof document !== 'undefined') ? document.getElementById('loading') : null;
      curtain = (ld && !ld.classList.contains('done') && ld.style.display !== 'none') ? ld : null;
      logoSkip = (curtain && curtain.querySelector('.ld-top')) ? LOGO_IN : 0;
      if (logoSkip > 0 && typeof MutationObserver === 'function') {
        liftObs = new MutationObserver(standIn);
        liftObs.observe(curtain, { attributes: true, attributeFilter: ['class'] });
      }
      scrim.style.opacity = ''; dof.style.opacity = '';
      for (const sk of skies) sk.style.opacity = '';
      const st = ctx.state;
      saved = { time: st.time, frozen: st.timeFrozen, fog: st.fogScale };
      st.time = TITLE_TIME; st.timeFrozen = true;
      st.fogScale = HERO.wide.dist / 60;    // the far island stays legible (as setView does)
      announceTime();
      ownTime = true;
      hidden = []; hideThermals();
      frame();
      api.update(0);
    },
    update(dt) {
      if (!running) return;
      // under the curtain the picture is held at its first frame (see THE CURTAIN);
      // lifted over a held logo, ours stands in its pose until it has gone (THE HOLD)
      if (curtain) {
        if (curtain.classList.contains('done') || curtain.style.display === 'none') {
          if (logoSkip > 0 && !hold && curtain.style.display !== 'none') holdOn(curtain);
          if (liftObs) { liftObs.disconnect(); liftObs = null; }
          curtain = null;
        } else dt = 0;
      }
      t += dt;
      if (leaving > 0) leaving += dt;
      holdTick(dt);
      if (camOwned) frame();
      // (a flyer that loads late still gets parked; a missing one costs a few lookups, then none)
      if (hidden.length < HIDE_WHILE_TITLED.length && t < 10 && (t % 0.5) < dt) hideThermals();

      // layout fit: on resize, and a few times early on while the web font lands
      fitT -= dt;
      const W = window.innerWidth, H = window.innerHeight;
      if (W !== lastW || H !== lastH || fitT <= 0) { lastW = W; lastH = H; fitT = t < 3 ? 0.25 : 2; fit(); }

      // ── entrance (0 → ~1.6 s), then idle ──────────────────────────────────
      // The logo runs on tl (t, or already landed when a held loading logo is
      // its entrance); the tagline, pill and credits on t.
      const tl = t + logoSkip;
      const out = leaving > 0 ? ease(clamp(leaving / 0.3, 0, 1)) : 0;

      const kb = kAt(tl, 0.05, 0.4);
      brow.style.opacity = clamp(kb * 2, 0, 1).toFixed(3);
      brow.style.transform = `translateY(${((1 - backOut(kb)) * -30).toFixed(1)}px) rotate(-3deg) scale(${(0.7 + 0.3 * backOut(kb) + out * 0.08).toFixed(4)})`;

      for (let i = 0; i < candyL.length; i++) {
        const e = kAt(tl, 0.18 + i * DROP_STEP, 0.5);
        const b = backOut(e);
        const bob = Math.sin(tl * 2.3 - i * 0.62) * 0.035;
        const tilt = (i % 2 ? 3 : -3) + Math.sin(tl * 1.7 - i * 0.8) * 2.2;
        const drop = (1 - b) * -1.1;
        const y = drop + bob * e - out * 0.12, r = tilt * e, sc = 1 + out * 0.06;
        candyL[i].style.opacity = clamp(e * 3, 0, 1).toFixed(3);
        pose(candyL[i], `translateY(${y.toFixed(4)}em) rotate(${r.toFixed(2)}deg) scale(${sc.toFixed(4)})`, y, r, sc);
      }
      const kbd = kAt(tl, 0.3, 0.45);
      const yb = (1 - backOut(kbd)) * 0.5, rb = -24 + Math.sin(tl * 1.3) * 5;
      badge.style.opacity = clamp(kbd * 2, 0, 1).toFixed(3);
      pose(badge, `translateY(${yb.toFixed(4)}em) rotate(${rb.toFixed(2)}deg)`, yb, rb, 1);

      const ka = kAt(tl, 0.62, 0.4);
      const sa = 0.4 + 0.6 * backOut(ka), ra = -4 + Math.sin(tl * 1.1) * 1.5;
      andEl.style.opacity = clamp(ka * 2, 0, 1).toFixed(3);
      pose(andEl, `scale(${sa.toFixed(4)}) rotate(${ra.toFixed(2)}deg)`, 0, ra, sa);

      // CAT ISLAND: calmer — a slow shared breath, the ears twitch, the tail sways
      for (let i = 0; i < catL.length; i++) {
        const e = kAt(tl, 0.78 + i * 0.04, 0.5);
        const b = backOut(e);
        const breath = Math.sin(tl * 1.25 - i * 0.28) * 0.018;
        const y = (1 - b) * 0.9 + breath * e - out * 0.1, sc = 1 + out * 0.06;
        catL[i].style.opacity = clamp(e * 3, 0, 1).toFixed(3);
        pose(catL[i], `translateY(${y.toFixed(4)}em) scale(${sc.toFixed(4)})`, y, 0, sc);
      }
      const tw = (tl % 3.7) / 3.7;                          // an ear flick every 3.7 s
      const flick = tw > 0.9 ? Math.sin((tw - 0.9) / 0.1 * Math.PI) : 0;
      const re = -flick * 9, rt = Math.sin(tl * 1.6) * 11 + 4;
      pose(earsEl, `rotate(${re.toFixed(2)}deg)`, 0, re, 1);
      pose(tailEl, `rotate(${rt.toFixed(2)}deg)`, 0, rt, 1);
      for (let i = 0; i < sparks.length; i++) {
        const tw2 = (tl * 0.55 + i * 0.37) % 1;
        const s = tw2 < 0.35 ? Math.sin(tw2 / 0.35 * Math.PI) : 0;
        const ss = s * (i === 1 ? 1.2 : 1), rs = tw2 * 90;
        pose(sparks[i], `scale(${ss.toFixed(3)}) rotate(${rs.toFixed(1)}deg)`, 0, rs, ss);
      }
      if (hold && holdW >= 1) holdOff();                  // eased all the way into our own motion

      // ── the lower group: tagline, then the pill (fully opaque; it breathes
      //    by scale and a soft glow ring, never by fading) ────────────────────
      const kl = kAt(t, 1.1, 0.5);
      lower.style.opacity = (ease(kl) * (1 - out)).toFixed(3);
      const ks = kAt(t, 1.2, 0.5);
      sub.style.transform = `translateY(${((1 - ease(ks)) * 10).toFixed(1)}px)`;
      const kp = kAt(t, 1.45, 0.45);
      const pulse = 0.5 + 0.5 * Math.sin((t - 1.45) * 3.2);
      pressRow.style.opacity = ease(kp).toFixed(3);
      press.style.transform = `translateY(${((1 - backOut(kp)) * 14).toFixed(2)}px) scale(${(1 + 0.035 * pulse * kp).toFixed(4)})`;
      press.style.setProperty('--ring', (pulse * kp).toFixed(3));
      const kc = kAt(t, 1.6, 0.6);
      credits.style.opacity = (ease(kc) * (1 - out)).toFixed(3);

      // ── sprinkles ─────────────────────────────────────────────────────────
      const mh = H + 40;
      for (const m of motes) {
        const y = ((m.y + t * m.v * m.z) % 1) * mh - 20;
        const x = m.x * W + Math.sin(t * m.sf + m.ph) * m.sw * moteK;
        m.d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(m.r0 + t * m.rv).toFixed(1)}deg) scale(${(m.z * moteK).toFixed(3)})`;
      }
    },
    leave() { if (running && !leaving) leaving = 1e-4; },
    /**
     * Contract K hand-off: the opening cinematic takes the LIVE world from this
     * exact frame. Stops driving the camera at once and changes nothing else —
     * the free view, the dusk clock and the fog stay put for the flight to ease
     * out of. The letters keep animating their leave() pop while the card fades.
     */
    handoff() {
      camOwned = false;
      const st = ctx.state, v = heroView;
      return {
        view: { target: [v.target[0], v.target[1], v.target[2]], azimuth: v.azimuth, elevation: v.elevation, distance: v.distance, fov: v.fov },
        saved: saved ? { time: saved.time, frozen: saved.frozen, fog: saved.fog } : { time: st.time, frozen: st.timeFrozen, fog: st.fogScale },
      };
    },
    /** After the cinematic resolved: the thermals come back; the rest was the cinematic's to restore. */
    release() {
      if (!running) return;
      running = false; camOwned = true; curtain = null; holdOff();
      for (const h of hidden) h.o.visible = h.vis;
      hidden = [];
      saved = null; ownTime = false;
    },
    /** Hand the world back: the follow camera in whatever mode it was, the clock, the fog, the thermals. */
    restore() {
      if (!running) return;
      running = false; camOwned = true; curtain = null; holdOff();
      const st = ctx.state;
      const cam = ctx.systems.camera;
      if (cam?.setFree) { cam.setFree(null); cam.snap?.(); }
      for (const h of hidden) h.o.visible = h.vis;
      hidden = [];
      if (saved) {
        st.fogScale = saved.fog;
        if (ownTime && st.time === TITLE_TIME) {
          st.time = saved.time; st.timeFrozen = saved.frozen;
          announceTime();
        }
      }
      saved = null; ownTime = false;
    },
  };
  return api;
}
