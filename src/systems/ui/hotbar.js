// ─────────────────────────────────────────────────────────────────────────────
// WAVE-2 HUD WIDGETS — the three small panels that hang off the inventory,
// weapons and camera systems. All three are built from the same cream/navy
// plate as the rest of the HUD (style.js) and animate from update(dt), never
// from CSS transitions, so headless renders stay deterministic.
//
//   createHotbar(ctx, panel)  bottom-centre rack of held weapons/tools
//   createCandy(ctx, panel)   candy-currency pill that sits beside the objective
//   createCamChip(ctx, panel) '1 iso · 2 follow · 3 top' chip by the help chip
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
const CAM_MODES = [[1, 'iso'], [2, 'follow'], [3, 'top']];
const CAM_REVEAL = 4;
const CAM_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'];

export function createCamChip(ctx, panel) {
  const el = document.createElement('div');
  el.className = 'cci cci-plate cci-cam';
  el.innerHTML = CAM_MODES
    .map(([m, label]) => `<span class="cci-cam-seg" data-m="${m}"><span class="cci-key">${m}</span><em>${label}</em></span>`)
    .join('');
  const segs = [...el.querySelectorAll('.cci-cam-seg')];
  const anim = panel(el, { rise: 0.2, fall: 0.16, y: 10, s: 0.9 });
  let mode = 0, pop = 0, reveal = 0;

  function set(m) {
    const v = Number(m?.mode ?? m?.value ?? m) || 0;
    if (v < 1 || v > 3 || v === mode) return;
    mode = v; pop = 1; reveal = CAM_REVEAL;
    for (const s of segs) s.classList.toggle('on', Number(s.dataset.m) === v);
  }
  set(ctx.systems?.camera?.mode ?? 1);
  reveal = 0;                                   // the first read is not a press

  return {
    el, anim, set,
    get mode() { return mode; },
    /** Show the chip for a moment (a mode key, or a system that wants to teach). */
    show(secs = CAM_REVEAL) { reveal = Math.max(reveal, secs); },
    update(dt) {
      const live = ctx.systems?.camera?.mode;
      if (typeof live === 'number') set(live);
      // Pressing the key you are already on still deserves an answer.
      const pressed = ctx.input?.pressed;
      if (pressed?.size) for (const k of CAM_KEYS) if (pressed.has(k)) { reveal = CAM_REVEAL; break; }
      if (reveal > 0) { reveal -= dt; anim.show(); } else anim.hide();
      if (pop > 0) {
        pop = decay(pop, dt, 3);
        const s = segs[mode - 1];
        if (s) s.style.transform = `scale(${(1 + 0.14 * Math.sin(Math.min(1, pop) * Math.PI)).toFixed(3)})`;
      } else for (const s of segs) if (s.style.transform) s.style.transform = '';
      anim.step(dt);
    },
  };
}
