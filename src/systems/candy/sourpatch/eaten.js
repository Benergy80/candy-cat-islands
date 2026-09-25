// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KID — the "you were a snack" sequence.
// Two sugar-toothed jaws close over the screen, NOM. — then you are INSIDE:
// the jaws part back-lit, sour goo strung between the teeth, and two lime eyes
// open in the dark above the word (it is still looking at you) — then you
// wake up at the pier with a bad review. Dark-funny, bloodless. DOM is created lazily because
// ui.js rewrites uiRoot.innerHTML when it is built (after this system).
// ─────────────────────────────────────────────────────────────────────────────
import { EATEN_TOAST } from './lines.js';

const teethPath = (n, base, tip) => {
  let p = `0% 0%, 100% 0%, 100% ${base}%`;
  for (let i = n - 1; i >= 0; i--) {
    p += `, ${((i + 0.5) / n * 100).toFixed(1)}% ${tip}%, ${(i / n * 100).toFixed(1)}% ${base}%`;
  }
  return `polygon(${p})`;
};

const CSS = `
#sp-eaten { position: fixed; inset: 0; z-index: 60; pointer-events: none; overflow: hidden; transition: opacity .7s ease; }
#sp-eaten .sp-veil { position:absolute; inset:0; z-index:0; background: radial-gradient(ellipse at center, rgba(10,2,8,.25) 0%, rgba(6,1,6,.92) 78%); animation: sp-veil .5s ease both; }
#sp-eaten .sp-mouth { position:absolute; inset:0; z-index:1; opacity:0; transition: opacity .25s ease .1s;
  background: radial-gradient(ellipse 70% 42% at 50% 54%, #3b0d27 0%, #1f0615 48%, #0b0209 100%); }
#sp-eaten.sp-chomped .sp-mouth { opacity:1; }
#sp-eaten .sp-jaw { position:absolute; z-index:2; left:-2%; width:104%; height:66%; }
#sp-eaten .sp-top { top:0; animation: sp-top .52s cubic-bezier(.4,0,.25,1) both; }
#sp-eaten .sp-bot { bottom:0; transform: scaleY(-1); animation: sp-bot .52s cubic-bezier(.4,0,.25,1) both; }
#sp-eaten .sp-jawin { position:absolute; inset:0; transition: transform .7s cubic-bezier(.3,1.35,.5,1) .12s, filter .7s ease .12s; }
/* after the bite you are INSIDE: the jaws part, back-lit, and frame the card */
#sp-eaten.sp-chomped .sp-jawin { transform: translateY(-50%); filter: brightness(.8) saturate(1.15); }
@media (max-aspect-ratio: 3/2), (max-height: 560px) { #sp-eaten.sp-chomped .sp-jawin { transform: translateY(-62%); } }
#sp-eaten .sp-teeth { position:absolute; inset:0; background: repeating-linear-gradient(90deg, rgba(120,60,90,.28) 0 .9%, rgba(255,255,255,0) 2.6% 5.1%, rgba(120,60,90,.28) 7.69%), linear-gradient(180deg,#fff 0%, #ffe9f4 60%, #f3cfe2 100%); }
#sp-eaten .sp-gum { position:absolute; left:0; right:0; top:0; height:56%; background: linear-gradient(180deg,#150610 0%, #3a0d24 70%, #59122f 100%); }
/* sour goo strung between the teeth (top jaw only: the bottom is the same element flipped) */
#sp-eaten .sp-drip { position:absolute; top:99%; width:1.5vw; min-width:7px; height:0; border-radius: 0 0 1vw 1vw;
  background: linear-gradient(90deg, #8fe626 0%, #c4ff5c 45%, #7fd11c 100%); box-shadow: 0 0 10px rgba(180,255,58,.45);
  opacity:0; transition: height 2.4s cubic-bezier(.5,0,.7,1) .45s, opacity .3s ease .35s; }
#sp-eaten .sp-drip::after { content:''; position:absolute; left:50%; bottom:-.9vw; width:2.4vw; min-width:11px; aspect-ratio:1; transform: translateX(-50%);
  border-radius:50%; background: radial-gradient(circle at 35% 35%, #eaffb0 0%, #b4ff3a 40%, #74c81a 100%); }
#sp-eaten.sp-chomped .sp-drip { opacity:.95; height: var(--len, 9vh); }
#sp-eaten .sp-glint { position:absolute; width:7px; height:7px; background:#fff; transform: rotate(45deg); opacity:0;
  box-shadow: 0 0 8px #fff; animation: sp-glint 1.6s ease-in-out infinite; animation-delay: var(--d, 0s); }
#sp-eaten .sp-text { position:absolute; inset:0; z-index:3; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; text-align:center; opacity:0; padding: 0 6vw; }
#sp-eaten.sp-chomped .sp-text { opacity:1; }
/* two acid-lime eyes open in the dark above the word: it is still looking at you */
#sp-eaten .sp-eyes { display:flex; gap: clamp(26px, 5vw, 64px); margin-bottom: clamp(6px, 1.4vh, 16px); opacity:0; }
#sp-eaten.sp-chomped .sp-eyes { animation: sp-eyes-in .5s ease .8s both; }
#sp-eaten .sp-eyes i { display:block; width: clamp(10px, 1.6vw, 22px); aspect-ratio:1; border-radius:50%;
  background: radial-gradient(circle, #f8ffd8 0%, #c6ff4d 45%, #6cc414 100%); box-shadow: 0 0 14px 4px rgba(180,255,58,.65), 0 0 40px rgba(180,255,58,.35);
  animation: sp-blink 3.2s ease-in-out 1.9s infinite; }
#sp-eaten h1 { margin:0; font-size: clamp(56px, 12vw, 170px); line-height:1; letter-spacing:.06em; color:#ffe9f4; text-shadow: 0 0 34px rgba(255,90,160,.55); animation: sp-nom .45s cubic-bezier(.2,1.6,.4,1) both; }
#sp-eaten p { margin: clamp(8px, 2vh, 18px) 0 0; font-size: clamp(14px, 1.9vw, 20px); opacity:0; letter-spacing:.03em; color:#f4d7e6; transition: opacity .5s ease; max-width: 30em; }
#sp-eaten.sp-said p { opacity:.95; }
#sp-eaten.sp-fading { opacity:0; }
@keyframes sp-veil { from { opacity:0 } to { opacity:1 } }
@keyframes sp-top { from { transform: translateY(-104%) } to { transform: translateY(0) } }
@keyframes sp-bot { from { transform: scaleY(-1) translateY(-104%) } to { transform: scaleY(-1) translateY(0) } }
@keyframes sp-nom { 0% { transform: scale(.25) rotate(-7deg); opacity:0 } 55% { transform: scale(1.22) rotate(3deg); opacity:1 } 100% { transform: scale(1) rotate(0) } }
@keyframes sp-eyes-in { from { opacity:0; transform: scaleY(.1) } to { opacity:1; transform: scaleY(1) } }
@keyframes sp-blink { 0%, 90%, 100% { transform: scaleY(1) } 94% { transform: scaleY(.08) } }
@keyframes sp-glint { 0%, 100% { opacity:0; transform: rotate(45deg) scale(.4) } 50% { opacity:.9; transform: rotate(45deg) scale(1) } }
`;

const DRIPS = [[1, 7], [3, 11], [9, 6], [11, 10]];           // [tooth, length vh] (clear of the word in the middle)
const GLINTS = [[14, 70], [37, 63, 0.5], [62, 74, 1.1], [83, 66, 0.3]].map(([x, y, d = 0.8]) => [x, y, d]);

export function createEaten(ctx) {
  let el = null, t = 0, stage = -1, toastIdx = 0;
  // WAVE 4: eaten on Cat Island (the raid) you do not wake at Sugar Pier — that
  // would be a free way off the island — but where the cats find you
  let where = null;

  function build() {
    const root = ctx.uiRoot; if (!root) return null;
    if (!root.querySelector('#sp-eaten-style')) {
      const st = document.createElement('style'); st.id = 'sp-eaten-style'; st.textContent = CSS; root.appendChild(st);
    }
    const d = document.createElement('div'); d.id = 'sp-eaten';
    // (sour goo hangs off four of the top teeth; sugar glints on the enamel)
    const drips = DRIPS.map(([i, len]) => `<i class="sp-drip" style="left:${((i + 0.5) / 13 * 100 - 0.75).toFixed(2)}%;--len:${len}vh"></i>`).join('');
    const glints = GLINTS.map(([x, y, dl]) => `<i class="sp-glint" style="left:${x}%;top:${y}%;--d:${dl}s"></i>`).join('');
    d.innerHTML = `<div class="sp-veil"></div>
      <div class="sp-mouth"></div>
      <div class="sp-jaw sp-top"><div class="sp-jawin"><div class="sp-teeth"></div><div class="sp-gum"></div>${drips}${glints}</div></div>
      <div class="sp-jaw sp-bot"><div class="sp-jawin"><div class="sp-teeth"></div><div class="sp-gum"></div>${glints}</div></div>
      <div class="sp-text"><div class="sp-eyes"><i></i><i></i></div><h1>NOM.</h1><p></p></div>`;
    const clip = teethPath(13, 56, 104);
    for (const tt of d.querySelectorAll('.sp-teeth')) tt.style.clipPath = clip;
    root.appendChild(d);
    return d;
  }

  const api = {
    active: false,
    /** Called when 3+ kids are on top of the player. `at` (optional):
     *  { x, z, text } — where he wakes and what the card says. */
    trigger(at) {
      if (api.active) return;
      api.active = true; t = 0; stage = 0;
      where = at && Number.isFinite(at.x) && Number.isFinite(at.z) ? at : null;
      const p = ctx.systems.player;
      if (p) p.locked = true;
      ctx.systems.particles?.burst({ x: p?.position.x ?? 0, y: (p?.position.y ?? 0) + 1.1, z: p?.position.z ?? 0, count: 48, color: [0xffffff, 0xffd9ec, 0xbfefff, 0xb35bff], speed: 7, life: 1.2, size: 0.22, gravity: -7, spread: 1.4 });
      el = build();
      ctx.events.emit('sourpatch:eaten', { x: p?.position.x, z: p?.position.z });
    },
    cancel() {
      if (!api.active) return;
      api.active = false; stage = -1;
      if (el && el.parentNode) el.parentNode.removeChild(el);
      el = null;
      const p = ctx.systems.player; if (p) p.locked = false;
    },
    update(dt) {
      if (!api.active) return;
      t += dt;
      if (stage === 0 && t > 0.55) { stage = 1; el?.classList.add('sp-chomped'); }
      if (stage === 1 && t > 1.5) {
        stage = 2;
        const q = el?.querySelector('p'); if (q) q.textContent = where?.text || 'You were a snack. You wake up on Sugar Pier, a bit sticky.';
        el?.classList.add('sp-said');
        const w = where || ctx.world.PLAYER_START;
        ctx.systems.player?.teleport(w.x, w.z);
        ctx.systems.camera?.snap();
      }
      if (stage === 2 && t > 3.3) {
        stage = 3; el?.classList.add('sp-fading');
        ctx.systems.ui?.toast(EATEN_TOAST[toastIdx++ % EATEN_TOAST.length], 4);
        const p = ctx.systems.player; if (p) p.locked = false;
      }
      if (stage === 3 && t > 4.2) api.cancel();
    },
  };
  // a harness/debug time jump must never leave the screen chewed shut
  ctx.events.on('time:set', () => api.cancel());
  return api;
}
