// ─────────────────────────────────────────────────────────────────────────────
// TITLE SCREEN — "ESCAPE FROM CANDYLAND AND CAT ISLAND" over the LIVE world.
//
// The card is not a painted backdrop: the islands themselves are the picture,
// composed like a hero shot. The camera sits low out on the sea at golden hour,
// looking up a little, so the top half of the frame is clean sky (pink-lavender
// wash, a few lit clouds) and the two islands are a band across the lower half.
// The logo lives ALONE in that sky; the tagline and the start pill sit below
// the islands on the calm sea, on a soft plum scrim with the foreground
// defocused behind them. Sprinkles drift down behind everything.
// The logo is staged in four parts: a ribbon eyebrow, CANDYLAND in bouncy
// candy-striped letters, a gold AND badge, and CAT ISLAND in calmer mint
// letters with ears and a tail, so each island keeps its own personality.
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
//   }
// Nothing here runs unless begin() was called: under ?shot=1 (without
// ?intro=1) ui.js never calls it, so renders keep skipping the card.
// ─────────────────────────────────────────────────────────────────────────────
import { icon } from './glyphs.js';

// The hero shot. Two framings, blended by the window's aspect:
//   WIDE  off Candyland's south-west shore looking north-east: Candyland (the
//         Palace, the Great Cupcake, the donut arch) foreground-left, the
//         channel, Cat Island (lighthouse, yarn ball) on the right.
//   TALL  (portrait phones) off Candyland's pier corner looking east: the arch
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
const MOTES = 28;               // sprinkles drifting down the frame
// The flyer's thermal columns are gameplay furniture: seen from a lens this
// far out they read as white smears across the sky, so the card hides them
// while it is up (their previous visibility comes back in restore()).
const HIDE_WHILE_TITLED = ['flyer_thermals', 'flyer_thermal_shell'];

// Candy stripes per letter: a sugar-rush of wrappers, pink leading.
const CANDY_STRIPES = ['#f2447f', '#ff7a4d', '#f2447f', '#a765ee', '#f2447f', '#20b3a6', '#ff7a4d', '#f2447f', '#a765ee'];
const MOTE_COLS = ['#ff7eaa', '#ffd166', '#8fe6c8', '#c49bff', '#fff4e6', '#7cc8ff', '#ff9a6b'];

/** Deterministic PRNG so the sprinkle field is identical in every render. */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const backOut = (x) => { const c = 2.1; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const ease = (x) => x * x * (3 - 2 * x);

const letters = (txt, cls, fill) => [...txt].map((ch, i) => (ch === ' '
  ? '<span class="cci-ti-sp"></span>'
  : `<span class="cci-ti-l ${cls}"${fill ? ` style="--c:${fill(i)}"` : ''}><b class="o">${ch}</b><b class="f">${ch}</b></span>`)).join('');

// Cat ears (sit behind the C of CAT) and a tail (curls off the D of ISLAND).
const EARS = `<svg viewBox="0 0 100 72" fill="none" focusable="false">
  <g stroke="#24122c" stroke-width="8" stroke-linejoin="round">
    <path d="M5 70 L15 5 L49 50 Z" fill="#a8f0d6"/><path d="M51 50 L85 5 L95 70 Z" fill="#a8f0d6"/>
  </g>
  <path d="M18.5 50 L21.5 23 L37 44 Z" fill="#ff9fbf"/><path d="M63 44 L78.5 23 L81.5 50 Z" fill="#ff9fbf"/>
</svg>`;
const TAIL = `<svg viewBox="0 0 80 110" fill="none" focusable="false">
  <path d="M8 98 C44 102 64 80 56 54 C50 34 54 18 70 14" stroke="#24122c" stroke-width="30" stroke-linecap="round"/>
  <path d="M8 98 C44 102 64 80 56 54 C50 34 54 18 70 14" stroke="#8eebcd" stroke-width="17" stroke-linecap="round"/>
  <path d="M55.6 41 C53.5 29 58 19 69 14.5" stroke="#2a9d8f" stroke-width="17" stroke-linecap="round"/>
  <path d="M22 94 C42 94 53 84 55 70" stroke="#e6fff6" stroke-width="5" stroke-linecap="round" opacity=".85"/>
</svg>`;
// A swirl lollipop that peeks out from behind the C of CANDYLAND.
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
  el.innerHTML = `
    <div class="cci-ti-sky"></div>
    <div class="cci-ti-dof"></div>
    <div class="cci-ti-scrim"></div>
    <div class="cci-ti-motes"></div>
    <h1 class="cci-ti-sr">ESCAPE FROM CANDYLAND AND CAT ISLAND</h1>
    <div class="cci-ti-stage">
      <div class="cci-ti-top">
        <div class="cci-ti-block">
          <div class="cci-ti-logo" aria-hidden="true">
            <div class="cci-ti-eyebrow"><span class="cci-ti-rib">ESCAPE FROM</span></div>
            <div class="cci-ti-word cci-ti-candy">
              <span class="cci-ti-lolli">${LOLLI}</span>
              ${letters('CANDYLAND', 'cd', (i) => CANDY_STRIPES[i % CANDY_STRIPES.length])}
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
  let lastW = -1, lastH = -1, fitT = 0, moteK = 1;
  let hidden = [];                                       // [{ o, vis }] thermals parked while titled
  const heroView = { target: [0, 0, 0], azimuth: 0, elevation: 0, distance: 300, fov: 46 };

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

  /** Scale the logo down if a small or odd-shaped window can't hold it in the sky zone. */
  function fit() {
    block.style.transform = 'none';
    const aw = top.clientWidth - 24, ah = top.clientHeight - 4;
    const bw = block.offsetWidth, bh = block.offsetHeight;
    const s = clamp(Math.min(aw / Math.max(1, bw), ah / Math.max(1, bh)), 0.4, 1);
    block.style.transform = s < 0.999 ? `scale(${s.toFixed(4)})` : 'none';
    moteK = clamp(Math.min(window.innerWidth, window.innerHeight) / 900, 0.5, 1);
  }

  const api = {
    el,
    get running() { return running; },
    begin() {
      if (running) return;
      running = true; t = 0; leaving = 0;
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
      t += dt;
      if (leaving > 0) leaving += dt;
      frame();
      // (a flyer that loads late still gets parked; a missing one costs a few lookups, then none)
      if (hidden.length < HIDE_WHILE_TITLED.length && t < 10 && (t % 0.5) < dt) hideThermals();

      // layout fit: on resize, and a few times early on while the web font lands
      fitT -= dt;
      const W = window.innerWidth, H = window.innerHeight;
      if (W !== lastW || H !== lastH || fitT <= 0) { lastW = W; lastH = H; fitT = t < 3 ? 0.25 : 2; fit(); }

      // ── entrance (0 → ~1.4 s), then idle ──────────────────────────────────
      const k = (start, dur) => clamp((t - start) / dur, 0, 1);
      const out = leaving > 0 ? ease(clamp(leaving / 0.3, 0, 1)) : 0;

      const kb = k(0.05, 0.4);
      brow.style.opacity = clamp(kb * 2, 0, 1).toFixed(3);
      brow.style.transform = `translateY(${((1 - backOut(kb)) * -30).toFixed(1)}px) rotate(-3deg) scale(${(0.7 + 0.3 * backOut(kb) + out * 0.08).toFixed(4)})`;

      for (let i = 0; i < candyL.length; i++) {
        const e = k(0.18 + i * 0.05, 0.5);
        const b = backOut(e);
        const bob = Math.sin(t * 2.3 - i * 0.62) * 0.035;
        const tilt = (i % 2 ? 3 : -3) + Math.sin(t * 1.7 - i * 0.8) * 2.2;
        const drop = (1 - b) * -1.1;
        candyL[i].style.opacity = clamp(e * 3, 0, 1).toFixed(3);
        candyL[i].style.transform = `translateY(${(drop + bob * e - out * 0.12).toFixed(4)}em) rotate(${(tilt * e).toFixed(2)}deg) scale(${(1 + out * 0.06).toFixed(4)})`;
      }
      const kbd = k(0.3, 0.45);
      badge.style.opacity = clamp(kbd * 2, 0, 1).toFixed(3);
      badge.style.transform = `translateY(${((1 - backOut(kbd)) * 0.5).toFixed(4)}em) rotate(${(-24 + Math.sin(t * 1.3) * 5).toFixed(2)}deg)`;

      const ka = k(0.62, 0.4);
      andEl.style.opacity = clamp(ka * 2, 0, 1).toFixed(3);
      andEl.style.transform = `scale(${(0.4 + 0.6 * backOut(ka)).toFixed(4)}) rotate(${(-4 + Math.sin(t * 1.1) * 1.5).toFixed(2)}deg)`;

      // CAT ISLAND: calmer — a slow shared breath, the ears twitch, the tail sways
      for (let i = 0; i < catL.length; i++) {
        const e = k(0.78 + i * 0.04, 0.5);
        const b = backOut(e);
        const breath = Math.sin(t * 1.25 - i * 0.28) * 0.018;
        catL[i].style.opacity = clamp(e * 3, 0, 1).toFixed(3);
        catL[i].style.transform = `translateY(${((1 - b) * 0.9 + breath * e - out * 0.1).toFixed(4)}em) scale(${(1 + out * 0.06).toFixed(4)})`;
      }
      const tw = (t % 3.7) / 3.7;                           // an ear flick every 3.7 s
      const flick = tw > 0.9 ? Math.sin((tw - 0.9) / 0.1 * Math.PI) : 0;
      earsEl.style.transform = `rotate(${(-flick * 9).toFixed(2)}deg)`;
      tailEl.style.transform = `rotate(${(Math.sin(t * 1.6) * 11 + 4).toFixed(2)}deg)`;
      for (let i = 0; i < sparks.length; i++) {
        const tw2 = (t * 0.55 + i * 0.37) % 1;
        const s = tw2 < 0.35 ? Math.sin(tw2 / 0.35 * Math.PI) : 0;
        sparks[i].style.transform = `scale(${(s * (i === 1 ? 1.2 : 1)).toFixed(3)}) rotate(${(tw2 * 90).toFixed(1)}deg)`;
      }

      // ── the lower group: tagline, then the pill (fully opaque; it breathes
      //    by scale and a soft glow ring, never by fading) ────────────────────
      const kl = k(1.1, 0.5);
      lower.style.opacity = (ease(kl) * (1 - out)).toFixed(3);
      const ks = k(1.2, 0.5);
      sub.style.transform = `translateY(${((1 - ease(ks)) * 10).toFixed(1)}px)`;
      const kp = k(1.45, 0.45);
      const pulse = 0.5 + 0.5 * Math.sin((t - 1.45) * 3.2);
      pressRow.style.opacity = ease(kp).toFixed(3);
      press.style.transform = `translateY(${((1 - backOut(kp)) * 14).toFixed(2)}px) scale(${(1 + 0.035 * pulse * kp).toFixed(4)})`;
      press.style.setProperty('--ring', (pulse * kp).toFixed(3));
      const kc = k(1.6, 0.6);
      credits.style.opacity = (ease(kc) * (1 - out)).toFixed(3);

      // the grades ease in so the first frame still shows the world arriving
      const kg = ease(k(0, 0.8));
      scrim.style.opacity = (0.5 + 0.5 * kg).toFixed(3);
      for (const sk of skies) sk.style.opacity = kg.toFixed(3);
      dof.style.opacity = kg.toFixed(3);

      // ── sprinkles ─────────────────────────────────────────────────────────
      const mh = H + 40;
      for (const m of motes) {
        const y = ((m.y + t * m.v * m.z) % 1) * mh - 20;
        const x = m.x * W + Math.sin(t * m.sf + m.ph) * m.sw * moteK;
        m.d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(m.r0 + t * m.rv).toFixed(1)}deg) scale(${(m.z * moteK).toFixed(3)})`;
      }
    },
    leave() { if (running && !leaving) leaving = 1e-4; },
    /** Hand the world back: the follow camera in whatever mode it was, the clock, the fog, the thermals. */
    restore() {
      if (!running) return;
      running = false;
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
