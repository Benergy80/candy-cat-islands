// ─────────────────────────────────────────────────────────────────────────────
// WAVE-2 HUD WIDGETS — the three small panels that hang off the inventory,
// weapons and camera systems. All three are built from the same cream/navy
// plate as the rest of the HUD (style.js) and animate from update(dt), never
// from CSS transitions, so headless renders stay deterministic.
//
//   createHotbar(ctx, panel)  bottom-centre rack of held weapons/tools
//   createCandy(ctx, panel)   candy-currency pill that sits beside the objective
//   createCamChip(ctx, panel) '1 iso · 2 follow · 3 top · V look' chip by the help chip
//                             (+ the V look's caption, "you" marker and teach toast)
//
// Every one of them reads ctx.systems.inventory / .camera DEFENSIVELY: those
// systems may not exist yet (or may never load), and the HUD must not throw or
// disappear because of it. `panel` is ui.js's dt-driven show/hide helper.
// ─────────────────────────────────────────────────────────────────────────────
import { item as itemGlyph, glyphForItem } from './glyphs.js';

const MAX_SLOTS = 8;
const pretty = (id) => String(id).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decay = (v, dt, rate = 3.4) => (v > 0 ? Math.max(0, v - dt * rate) : 0);
// A pop: fast punch out, soft settle back. Peak at p≈0.75 so the slot "kicks".
const popScale = (p) => 1 + 0.34 * Math.sin(Math.min(1, p) * Math.PI) * (0.4 + 0.6 * p);

/** Read the inventory without ever assuming it exists or is well-formed. */
function readInventory(ctx) {
  const inv = ctx.systems?.inventory;
  if (!inv) return null;
  const src = inv.items;
  const raw = Array.isArray(src) ? src
    : (src && typeof src[Symbol.iterator] === 'function' ? [...src] : []);
  const items = [];
  for (const it of raw) {
    if (!it) continue;
    const id = String(typeof it === 'string' ? it : (it.id ?? it.itemId ?? ''));
    if (!id) continue;
    const kind = (typeof it === 'object' && it.kind) || 'weapon';
    if (kind === 'candy' || id === 'candy') continue;         // currency lives in the pill
    const o = typeof it === 'object' ? it : {};
    let n = o.fuel ?? o.ammo ?? o.count;
    const explicit = typeof n === 'number';
    if (!explicit) { try { n = inv.count?.(id); } catch { n = null; } }
    const glyph = glyphForItem(id, o.name || '');
    const fuel = typeof o.fuel === 'number' || glyph === 'caramelizer';
    n = typeof n === 'number' && Number.isFinite(n) ? n : null;
    items.push({
      id,
      name: o.name || pretty(id),
      glyph,
      n,
      // A count is only news when there's more than one of the thing, or when a
      // declared magazine/tank has run dry. A bat wearing a "1" is just noise.
      showN: n != null && (fuel || n > 1 || (n === 0 && explicit)),
      max: typeof o.fuelMax === 'number' ? o.fuelMax : (typeof o.max === 'number' ? o.max : null),
      fuel,
    });
    if (items.length >= MAX_SLOTS) break;
  }
  let candy = 0;
  try { candy = inv.count?.('candy') ?? 0; } catch { candy = 0; }
  if (typeof candy !== 'number' || !Number.isFinite(candy)) candy = 0;
  return { items, held: inv.held ?? null, candy };
}

// ── hotbar ───────────────────────────────────────────────────────────────────
export function createHotbar(ctx, panel) {
  const el = document.createElement('div');
  el.className = 'cci cci-bar';
  el.innerHTML = `
    <div class="cci-bar-slots"></div>
    <div class="cci-bar-hint cci-plate">
      <b class="cci-bar-name"></b><span class="cci-bar-sep"></span>
      <span class="cci-key">F</span><em>next</em>
      <span class="cci-bar-dot">·</span>
      <em>click</em><span class="cci-bar-slash">/</span><span class="cci-key">X</span><em>use</em>
    </div>`;
  const slotsEl = el.querySelector('.cci-bar-slots');
  const nameEl = el.querySelector('.cci-bar-name');
  const sepEl = el.querySelector('.cci-bar-sep');
  const anim = panel(el, { rise: 0.24, fall: 0.16, y: 18, s: 0.9, base: 'translateX(-50%)' });

  const slots = new Map();            // id → { in: HTMLElement, pop: number }
  let sig = '', forced = null, ever = false, held = null, height = 104;

  function slotHTML(it, isHeld) {
    const badge = it.showN
      ? `<span class="cci-slot-n${it.fuel ? ' fuel' : ''}">${esc(String(it.n))}</span>` : '';
    const meter = (it.fuel && it.max)
      ? `<span class="cci-slot-bar"><i style="width:${Math.max(0, Math.min(1, (it.n ?? 0) / it.max)) * 100}%"></i></span>` : '';
    return `<div class="cci-slot cci-plate${isHeld ? ' held' : ''}${it.showN && it.n === 0 ? ' empty' : ''}" data-id="${esc(it.id)}">
      <span class="cci-slot-in">${itemGlyph(it.glyph)}</span>${badge}${meter}</div>`;
  }

  function rebuild(data) {
    slots.clear();
    if (!data || !data.items.length) {
      // Systems missing / nothing picked up yet: a present-but-empty rack, so
      // the bar never pops into existence with a jarring layout jump later.
      slotsEl.innerHTML = '<div class="cci-slot cci-plate ghost"></div>'.repeat(4);
      nameEl.textContent = ''; sepEl.style.display = 'none';
      return;
    }
    slotsEl.innerHTML = data.items.map((it) => slotHTML(it, it.id === data.held)).join('');
    for (const node of slotsEl.children) {
      const inner = node.querySelector('.cci-slot-in');
      if (inner) slots.set(node.dataset.id, { in: inner, pop: 0 });
    }
    const cur = data.items.find((it) => it.id === data.held);
    nameEl.textContent = cur ? cur.name : '';
    sepEl.style.display = cur ? '' : 'none';
  }

  const api = {
    el, anim,
    get visible() { return anim.visible; },
    get height() { return height; },
    /** Force the rack on/off (null = automatic: visible once you own something). */
    show(v = true) { forced = v === null ? null : !!v; },
    /** Kick the slot for `id` (pickup / weapon use / held change). */
    pop(id) { const s = slots.get(String(id)); if (s) s.pop = 1; },
    popHeld() { api.pop(held); },
    update(dt) {
      const data = readInventory(ctx);
      const nextSig = data
        ? data.items.map((it) => `${it.id}:${it.n}:${it.max}`).join('|') + '/' + data.held
        : '';
      if (nextSig !== sig) {
        const heldChanged = data && data.held !== held;
        sig = nextSig; held = data ? data.held : null;
        rebuild(data);
        if (heldChanged && held) api.pop(held);
      }
      if (data && data.items.length) ever = true;

      const want = forced != null ? forced : (ever && !!data && data.items.length > 0);
      if (want) anim.show(); else anim.hide();

      for (const s of slots.values()) {
        if (s.pop > 0) {
          s.pop = decay(s.pop, dt, 3.2);
          s.in.style.transform = `scale(${popScale(s.pop).toFixed(3)})`;
        } else if (s.in.style.transform) s.in.style.transform = '';
      }
      anim.step(dt);
      if (anim.p > 0.6 && el.offsetHeight) height = el.offsetHeight;
    },
  };
  return api;
}

// ── candy counter pill ───────────────────────────────────────────────────────
export function createCandy(ctx, panel) {
  const el = document.createElement('div');
  el.className = 'cci cci-plate cci-candy';
  el.innerHTML = `<div class="cci-candy-in"><span class="cci-candy-ico">${itemGlyph('candy')}</span><span class="cci-candy-n">0</span></div>`;
  const inner = el.querySelector('.cci-candy-in');
  const nEl = el.querySelector('.cci-candy-n');
  const anim = panel(el, { rise: 0.22, fall: 0.18, y: -10, s: 0.8 });
  let n = -1, pop = 0, ever = false, forced = null, dim = null;

  return {
    el, anim,
    show(v = true) { forced = v === null ? null : !!v; },
    /** Bounce the pill (inventory:pickup). */
    bump() { pop = 1; ever = true; },
    update(dt) {
      const data = readInventory(ctx);
      const c = data ? data.candy : 0;
      if (data && c !== n) {
        if (n >= 0 && c > n) pop = 1;
        n = c; nEl.textContent = String(c);
        if (c > 0) ever = true;
      }
      // A purse with nothing in it is still a purse: as soon as an inventory
      // exists the pill is on screen (dimmed at 0), so a pickup lands somewhere
      // the eye already knows instead of conjuring a new widget mid-play.
      const want = forced != null ? forced : (!!data || ever || n > 0);
      if (want) anim.show(); else anim.hide();
      const wantDim = !(n > 0);
      if (wantDim !== dim) { dim = wantDim; el.classList.toggle('dim', wantDim); }
      if (pop > 0) {
        pop = decay(pop, dt, 2.8);
        inner.style.transform = `scale(${popScale(pop).toFixed(3)})`;
      } else if (inner.style.transform) inner.style.transform = '';
      anim.step(dt);
    },
  };
}

// ── camera-mode chip ─────────────────────────────────────────────────────────
// It is a REMINDER, not furniture: a permanent '1 ISO · 2 FOLLOW · 3 TOP' strip
// is three keycaps of HUD in every screenshot for a control you press twice a
// session. So it fades in when you press 1/2/3 (or a system switches the mode)
// and fades back out CAM_REVEAL seconds later.
//
// THE V LOOK (CAMERA_SPEC §3, §6.3). The chip's 4th segment 'V look' is lit
// while camera.looking > 0.05 and any V press reveals the chip. While looking:
// a caption row over the chip (how the look works), and a "you" marker at the
// visitor's projected feet (camera.playerScreen) — clamped to the frame edge
// with a chevron pointing at him when he is off screen. Once a session, never
// under ctx.shot, a teach toast when the camera keeps losing him (raw body rays
// ≥ 3/5 blocked for 2 s, or the density sensor over 0.6 for 5 s). This file
// injects its own <style> for these (style.js belongs to the map-history owner).
const CAM_MODES = [[1, 'iso'], [2, 'follow'], [3, 'top']];
const CAM_REVEAL = 4;
const CAM_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'KeyV'];
const LOOK_ON = 0.05;                 // camera.looking above this = looking (segment lit, caption, marker)
const YOU_EDGE = 40;                  // px: the off-screen chevron sits this far inside the frame edge…
const YOU_EDGE_B = 66;                // …and this far above the bottom one (its tag hangs under the disc)
const TEACH_TEXT = 'Lost him? Hold V to look around · 3 = top view';
const TEACH_KEY = 'cci-cam-teach';
let teachDone = false;                // once per session (and sessionStorage, across reloads of the tab)

const LOOK_CSS = `
#ui .cci-cam-cap {
  position: absolute; left: 0; bottom: calc(100% + 7px); display: flex; align-items: center; gap: 5px;
  padding: 5px 11px 6px 9px; border-radius: 999px; white-space: nowrap;
}
#ui .cci-cam-cap b { font: 900 9.5px/1 var(--fbody); letter-spacing: .16em; text-transform: uppercase; color: var(--ink); }
#ui .cci-cam-cap em { font: 800 9.5px/1 var(--fbody); font-style: normal; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-soft); }
#ui .cci-cam-cap i { font: 900 10px/1 var(--fbody); font-style: normal; color: var(--ink-soft); opacity: .6; }
#ui .cci-cam-cap .cci-key { min-width: 17px; height: 17px; border-width: 2px; border-radius: 6px; box-shadow: 0 2px 0 var(--edge); font-size: 9.5px; padding: 0 4px; }
#ui .cci-cam-cap .cci-key.gold { background: linear-gradient(180deg, #ffe9a8, var(--gold)); }
#ui .cci-cam-pan { display: contents; }
#ui .cci-cam-v { margin-left: 2px; padding-left: 9px; border-left: 2px solid rgba(43,36,66,.16); }
/* over the dialogue box (30), the hotbar (20) and the star pill (22); under the banner (40), cards and fades */
#ui .cci-you { left: 0; top: 0; width: 0; height: 0; z-index: 32; }
#ui .cci-you-mark, #ui .cci-you-chev { position: absolute; left: 0; top: 0; will-change: transform; }
#ui .cci-you-ring {
  position: absolute; left: -26px; top: -11px; width: 52px; height: 22px; border-radius: 50%; box-sizing: border-box;
  border: 3px solid var(--gold); box-shadow: 0 0 0 2px var(--edge), inset 0 0 0 2px var(--edge), 0 0 14px rgba(255,201,74,.75);
}
#ui .cci-you-tag, #ui .cci-you-chev b {
  font: 900 10px/1 var(--fbody); letter-spacing: .16em; text-transform: uppercase; color: var(--edge);
  background: linear-gradient(180deg, #ffe9a8, var(--gold)); border: 2px solid var(--edge); border-radius: 999px;
  padding: 3px 6px 2px 8px; box-shadow: 0 2px 0 rgba(43,36,66,.45);
}
#ui .cci-you-tag { position: absolute; left: 0; top: 15px; transform: translateX(-50%); }
#ui .cci-you-chev { width: 0; height: 0; }
#ui .cci-you-disc {
  position: absolute; left: -21px; top: -21px; width: 42px; height: 42px; border-radius: 50%; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
}
#ui .cci-you-arrow {
  display: block; width: 0; height: 0; margin-top: -3px;
  border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 13px solid var(--edge);
}
#ui .cci-you-chev b { position: absolute; left: 0; top: 24px; transform: translateX(-50%); }
`;
function injectLookStyle(ctx) {
  if (typeof document === 'undefined' || document.getElementById('cci-cam-look-css')) return;
  const st = document.createElement('style');
  st.id = 'cci-cam-look-css'; st.textContent = LOOK_CSS;
  (ctx.uiRoot || document.head).appendChild(st);
}
function teachSeen() {
  if (teachDone) return true;
  try { if (sessionStorage.getItem(TEACH_KEY)) teachDone = true; } catch { /* storage blocked: memory only */ }
  return teachDone;
}
function teachMark() { teachDone = true; try { sessionStorage.setItem(TEACH_KEY, '1'); } catch { /* memory only */ } }

export function createCamChip(ctx, panel) {
  injectLookStyle(ctx);
  const el = document.createElement('div');
  el.className = 'cci cci-plate cci-cam';
  el.innerHTML = CAM_MODES
    .map(([m, label]) => `<span class="cci-cam-seg" data-m="${m}"><span class="cci-key">${m}</span><em>${label}</em></span>`)
    .join('')
    + '<span class="cci-cam-seg cci-cam-v" data-m="v"><span class="cci-key">V</span><em>look</em></span>'
    + '<div class="cci-cam-cap cci-plate"><b>Looking</b><i>·</i><span class="cci-cam-pan"><span class="cci-key">WASD</span><em>pan</em><i>·</i></span>'
    + '<em>mouse orbit</em><i>·</i><em>wheel zoom</em><i>·</i><em>release</em><span class="cci-key gold">V</span></div>';
  const segs = [...el.querySelectorAll('.cci-cam-seg:not(.cci-cam-v)')];
  const vSeg = el.querySelector('.cci-cam-v');
  const cap = el.querySelector('.cci-cam-cap');
  const capPan = el.querySelector('.cci-cam-pan');   // "WASD pan": not on a vehicle / flying (that look only orbits, §3)
  cap.style.display = 'none';
  const anim = panel(el, { rise: 0.2, fall: 0.16, y: 10, s: 0.9 });
  let mode = 0, pop = 0, reveal = 0;
  let vLit = false, vPop = 0, capK = 0, capShown = false, capVeh = false;

  // the "you" marker / edge chevron: one overlay in the HUD root, positioned by transform only
  const you = document.createElement('div');
  you.className = 'cci cci-you';
  you.innerHTML = '<div class="cci-you-mark"><i class="cci-you-ring"></i><b class="cci-you-tag">you</b></div>'
    + '<div class="cci-you-chev"><div class="cci-you-disc cci-plate"><i class="cci-you-arrow"></i></div><b>you</b></div>';
  const mark = you.querySelector('.cci-you-mark'), chev = you.querySelector('.cci-you-chev'), arrow = you.querySelector('.cci-you-arrow');
  you.style.display = 'none'; mark.style.display = 'none'; chev.style.display = 'none';
  ctx.uiRoot?.appendChild(you);
  let youShown = false, youOn = null, youOp = -1;

  let blockT = 0, densT = 0;          // the teach toast's two timers

  function set(m) {
    const v = Number(m?.mode ?? m?.value ?? m) || 0;
    if (v < 1 || v > 3 || v === mode) return;
    mode = v; pop = 1; reveal = CAM_REVEAL;
    for (const s of segs) s.classList.toggle('on', Number(s.dataset.m) === v);
  }
  set(ctx.systems?.camera?.mode ?? 1);
  reveal = 0;                                   // the first read is not a press

  /** Position the marker (on screen) or the edge chevron (off screen) from camera.playerScreen. */
  function placeYou(cam, k) {
    const ps = cam?.playerScreen;
    const want = k > LOOK_ON && ps && Number.isFinite(ps.x) && Number.isFinite(ps.y);
    if (!want) { if (youShown) { you.style.display = 'none'; youShown = false; } return; }
    if (!youShown) { you.style.display = ''; youShown = true; }
    const op = Math.min(1, (k - LOOK_ON) / 0.4);
    if (Math.abs(op - youOp) > 0.01) { youOp = op; you.style.opacity = op.toFixed(3); }
    const W = window.innerWidth || 1, H = window.innerHeight || 1;
    const on = !!ps.on;
    if (on !== youOn) { youOn = on; mark.style.display = on ? '' : 'none'; chev.style.display = on ? 'none' : ''; }
    if (on) { mark.style.transform = `translate(${ps.x.toFixed(1)}px,${ps.y.toFixed(1)}px)`; return; }
    // off screen: where the line from the frame centre to him crosses the frame, YOU_EDGE px inside it
    const cx = W / 2, cy = H / 2, dx = ps.x - cx, dy = ps.y - cy;
    const hw = Math.max(1, cx - YOU_EDGE), hh = Math.max(1, dy > 0 ? cy - YOU_EDGE_B : cy - YOU_EDGE);
    const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    const x = Number.isFinite(t) ? cx + dx * t : cx, y = Number.isFinite(t) ? cy + dy * t : cy;
    chev.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    arrow.style.transform = `rotate(${(Math.atan2(dx, -dy) * 180 / Math.PI).toFixed(1)}deg)`;
  }

  /** Once a session (never in a screenshot): he keeps getting lost → tell him about V and 3. */
  function teach(dt, cam, k) {
    if (ctx.shot || teachSeen() || !cam) { blockT = 0; densT = 0; return; }
    const pl = ctx.systems?.player;
    const ok = !(cam.isFree?.()) && !cam.cinematicActive && !ctx.state?.paused && !pl?.locked && k <= LOOK_ON;
    const blocked = ok && Number(cam.occBlocked) >= 0.6 - 1e-6;
    blockT = blocked ? blockT + dt : 0;
    const dk = Number(cam.densityK);
    densT = ok && dk > 0.6 ? densT + dt : 0;
    if (blockT >= 2 || densT >= 5) {
      teachMark(); blockT = 0; densT = 0;
      ctx.systems?.ui?.toast?.(TEACH_TEXT, 5);
      reveal = Math.max(reveal, 5);
    }
  }

  return {
    el, anim, set,
    get mode() { return mode; },
    /** Show the chip for a moment (a mode key, or a system that wants to teach). */
    show(secs = CAM_REVEAL) { reveal = Math.max(reveal, secs); },
    update(dt) {
      const cam = ctx.systems?.camera;
      const live = cam?.mode;
      if (typeof live === 'number') set(live);
      // Pressing the key you are already on still deserves an answer (and any V press reveals it).
      const pressed = ctx.input?.pressed;
      if (pressed?.size) for (const k of CAM_KEYS) if (pressed.has(k)) { reveal = CAM_REVEAL; break; }
      const lk = Number(cam?.looking) || 0;
      const looking = lk > LOOK_ON;
      if (looking !== vLit) { vLit = looking; vSeg.classList.toggle('on', looking); if (looking) vPop = 1; }
      if (looking) reveal = Math.max(reveal, CAM_REVEAL);
      if (reveal > 0) { reveal -= dt; anim.show(); } else anim.hide();
      if (pop > 0) {
        pop = decay(pop, dt, 3);
        const s = segs[mode - 1];
        if (s) s.style.transform = `scale(${(1 + 0.14 * Math.sin(Math.min(1, pop) * Math.PI)).toFixed(3)})`;
      } else for (const s of segs) if (s.style.transform) s.style.transform = '';
      if (vPop > 0) {
        vPop = decay(vPop, dt, 3);
        vSeg.style.transform = `scale(${(1 + 0.14 * Math.sin(Math.min(1, vPop) * Math.PI)).toFixed(3)})`;
      } else if (vSeg.style.transform) vSeg.style.transform = '';
      // the caption row: in with the look, out with it (dt-driven, like every HUD animation); on a vehicle /
      // flying the look only orbits (WASD still drives the machine), so the "WASD pan" chunk goes (DOM on change only).
      // lookVehicle keeps the last look's variant until the next look starts, so the caption keeps its layout
      // through the fade-out (reading it only while `looking` would flash "WASD pan" back in as it fades)
      const veh = !!cam?.lookVehicle;
      if (veh !== capVeh) { capVeh = veh; capPan.style.display = veh ? 'none' : ''; }
      const capWant = looking ? 1 : 0;
      if (capK !== capWant) {
        capK = capWant > capK ? Math.min(1, capK + dt / 0.18) : Math.max(0, capK - dt / 0.14);
        if (capK > 0 && !capShown) { cap.style.display = ''; capShown = true; }
        if (capK <= 0 && capShown) { cap.style.display = 'none'; capShown = false; }
        cap.style.opacity = Math.min(1, capK * 1.6).toFixed(3);
        cap.style.transform = `translateY(${((1 - capK) * 6).toFixed(2)}px)`;
      }
      placeYou(cam, lk);
      teach(dt, cam, lk);
      anim.step(dt);
    },
  };
}
