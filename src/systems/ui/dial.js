// ─────────────────────────────────────────────────────────────────────────────
// DAY / NIGHT DIAL — an analogue clock face where the sun and moon orbit.
// Noon puts the sun at the top, midnight puts the moon there; the painted ring
// behind them is a little sky (dawn → day → dusk → night). Icons are inline
// SVG (see glyphs.js) so they match the rest of the HUD, and the phase caption
// sits on the same cream plate as every other panel.
//
// Two things the orbs must never do: hide behind the cream inner disc (they now
// ride the SKY RING at R = 32.5, with an explicit z-order over the disc), and
// go white-on-cream — the daytime moon is tinted slate-blue and outlined in ink
// so it reads at noon as clearly as at midnight.
//
// While the objective is still 'be home before dark' the dial also carries the
// REMAINING DAYLIGHT: a gold arc inside the disc rim that runs from the sun's
// current position round to the dusk tick, and shrinks as the day burns down.
// ─────────────────────────────────────────────────────────────────────────────
import { icon } from './glyphs.js';

const R = 32.5; // orbit radius: the middle of the sky ring (disc edge 30, rim 42)
const C = 42;   // face centre
const AR = 26.5; // daylight-arc radius (just inside the disc rim)
const ARC_LEN = 2 * Math.PI * AR;
const DUSK = 19.5;  // main.js flips isNight here
const DAWN = 5.5;

export function createDial(ctx) {
  const el = document.createElement('div');
  el.className = 'cci cci-dial';
  el.innerHTML = `
    <div class="cci-dial-face">
      <div class="cci-dial-in"></div>
      <svg class="cci-dial-arc" viewBox="0 0 84 84" fill="none">
        <circle class="rem" cx="42" cy="42" r="${AR}"/>
        <line class="dusk" x1="42" y1="10.8" x2="42" y2="17.4"/>
      </svg>
      <div class="cci-dial-orb cci-dial-sun">${icon('sun', { w: 2.6 })}</div>
      <div class="cci-dial-orb cci-dial-moon">${icon('moon', { w: 2.4, fill: 'currentColor', stroke: '#2b2442' })}</div>
      <div class="cci-dial-cap">00:00</div>
    </div>
    <div class="cci-dial-sub cci-plate">day</div>`;
  const sun = el.querySelector('.cci-dial-sun');
  const moon = el.querySelector('.cci-dial-moon');
  const cap = el.querySelector('.cci-dial-cap');
  const sub = el.querySelector('.cci-dial-sub');
  const arcEl = el.querySelector('.cci-dial-arc');
  const remEl = el.querySelector('.cci-dial-arc .rem');
  const duskEl = el.querySelector('.cci-dial-arc .dusk');
  let lastCap = '', lastSub = '', lastNight = null, lastArc = '';

  const place = (orb, a) => {
    orb.style.left = (C + Math.sin(a) * R) + 'px';
    orb.style.top = (C - Math.cos(a) * R) + 'px';
  };

  function phrase(t, isNight) {
    if (t < 5) return 'small hours';
    if (t < 7) return 'sunrise';
    if (t < 11) return 'morning';
    if (t < 14) return 'midday';
    if (t < 17.5) return 'afternoon';
    if (t < 19.6) return 'sundown';
    if (t < 22) return 'evening';
    return isNight ? 'night' : 'evening';
  }

  return {
    el,
    /**
     * @param {object} ctx
     * @param {boolean} countdown  the objective still says 'be home before dark'
     */
    update(ctx, countdown = false) {
      const t = ctx.state.time;
      const a = ((t - 12) / 24) * Math.PI * 2;
      place(sun, a);
      place(moon, a + Math.PI);
      const dl = Math.min(1, (ctx.state.daylight ?? 1) * 1.6);
      sun.style.opacity = (0.35 + 0.65 * dl).toFixed(2);
      moon.style.opacity = (0.55 + 0.45 * (1 - dl)).toFixed(2);
      const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
      const s = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      if (s !== lastCap) { cap.textContent = s; lastCap = s; }

      // ── remaining daylight ──────────────────────────────────────────────
      const left = DUSK - t;
      const on = !!countdown && t > DAWN && left > 0;
      const key = on ? left.toFixed(2) : 'off';
      if (key !== lastArc) {
        lastArc = key;
        arcEl.style.display = on ? '' : 'none';
        if (on) {
          const frac = Math.max(0, Math.min(1, left / 24));
          remEl.setAttribute('stroke-dasharray', `${(frac * ARC_LEN).toFixed(2)} ${ARC_LEN.toFixed(2)}`);
          remEl.setAttribute('transform', `rotate(${(((t - 12) / 24) * 360 - 90).toFixed(2)} 42 42)`);
          duskEl.setAttribute('transform', `rotate(${(((DUSK - 12) / 24) * 360).toFixed(2)} 42 42)`);
        }
      }
      // Under five hours of light left, the caption counts it down instead of
      // naming the hour — that is the only number that matters by then.
      let p = phrase(t, ctx.state.isNight);
      if (on && left <= 5) {
        const h = Math.floor(left), m2 = Math.round((left - h) * 60);
        p = (h ? `${h}h ${String(m2).padStart(2, '0')}m` : `${m2}m`) + ' of light';
      }
      if (p !== lastSub) { sub.textContent = p; lastSub = p; }
      if (ctx.state.isNight !== lastNight) { el.classList.toggle('night', !!ctx.state.isNight); lastNight = ctx.state.isNight; }
    },
  };
}
