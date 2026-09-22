// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KID — the "you were a snack" sequence.
// Two sugar-toothed jaws close over the screen, NOM., then you wake up at the
// pier with a bad review. Dark-funny, bloodless. DOM is created lazily because
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
#sp-eaten .sp-veil { position:absolute; inset:0; background: radial-gradient(ellipse at center, rgba(10,2,8,.25) 0%, rgba(6,1,6,.92) 78%); animation: sp-veil .5s ease both; }
#sp-eaten .sp-jaw { position:absolute; left:-2%; width:104%; height:66%; }
#sp-eaten .sp-top { top:0; animation: sp-top .52s cubic-bezier(.4,0,.25,1) both; }
#sp-eaten .sp-bot { bottom:0; transform: scaleY(-1); animation: sp-bot .52s cubic-bezier(.4,0,.25,1) both; }
#sp-eaten .sp-teeth { position:absolute; inset:0; background: linear-gradient(180deg,#fff 0%, #ffe9f4 60%, #f3cfe2 100%); }
#sp-eaten .sp-gum { position:absolute; left:0; right:0; top:0; height:56%; background: linear-gradient(180deg,#150610 0%, #3a0d24 70%, #59122f 100%); }
#sp-eaten .sp-black { position:absolute; inset:0; background:#070208; opacity:0; transition: opacity .25s ease .1s; }
#sp-eaten.sp-chomped .sp-black { opacity:1; }
#sp-eaten .sp-text { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; text-align:center; opacity:0; }
#sp-eaten.sp-chomped .sp-text { opacity:1; }
#sp-eaten h1 { margin:0; font-size: clamp(60px, 13vw, 170px); letter-spacing:.06em; color:#ffe9f4; text-shadow: 0 0 34px rgba(255,90,160,.55); animation: sp-nom .45s cubic-bezier(.2,1.6,.4,1) both; }
#sp-eaten p { margin:18px 0 0; font-size: 19px; opacity:0; letter-spacing:.04em; color:#f4d7e6; transition: opacity .5s ease; max-width: 30em; }
#sp-eaten.sp-said p { opacity:.95; }
#sp-eaten.sp-fading { opacity:0; }
@keyframes sp-veil { from { opacity:0 } to { opacity:1 } }
@keyframes sp-top { from { transform: translateY(-104%) } to { transform: translateY(0) } }
@keyframes sp-bot { from { transform: scaleY(-1) translateY(-104%) } to { transform: scaleY(-1) translateY(0) } }
@keyframes sp-nom { 0% { transform: scale(.25) rotate(-7deg); opacity:0 } 55% { transform: scale(1.22) rotate(3deg); opacity:1 } 100% { transform: scale(1) rotate(0) } }
`;

export function createEaten(ctx) {
  let el = null, t = 0, stage = -1, toastIdx = 0;

  function build() {
    const root = ctx.uiRoot; if (!root) return null;
    if (!root.querySelector('#sp-eaten-style')) {
      const st = document.createElement('style'); st.id = 'sp-eaten-style'; st.textContent = CSS; root.appendChild(st);
    }
    const d = document.createElement('div'); d.id = 'sp-eaten';
    d.innerHTML = `<div class="sp-veil"></div>
      <div class="sp-jaw sp-top"><div class="sp-teeth"></div><div class="sp-gum"></div></div>
      <div class="sp-jaw sp-bot"><div class="sp-teeth"></div><div class="sp-gum"></div></div>
      <div class="sp-black"></div>
      <div class="sp-text"><h1>NOM.</h1><p></p></div>`;
    const clip = teethPath(13, 56, 104);
    for (const tt of d.querySelectorAll('.sp-teeth')) tt.style.clipPath = clip;
    root.appendChild(d);
    return d;
  }

  const api = {
    active: false,
    /** Called when 3+ kids are on top of the player. */
    trigger() {
      if (api.active) return;
      api.active = true; t = 0; stage = 0;
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
        const q = el?.querySelector('p'); if (q) q.textContent = 'You were a snack. You respawn at Sugar Pier.';
        el?.classList.add('sp-said');
        const w = ctx.world.PLAYER_START;
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
