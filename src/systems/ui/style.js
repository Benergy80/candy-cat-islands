// ─────────────────────────────────────────────────────────────────────────────
// UI THEME — ONE plate family for the whole HUD.
// Every panel is the same object: cream fill, navy outline, offset shadow,
// rounded corners. Priority is expressed by SIZE and CONTRAST, not by new
// colour schemes — toasts are a muted/darker member of the same family, never
// a second look. Scoped under #ui so index.html's `#ui * { pointer-events:auto }`
// can be overridden (see the first two rules).
// `#ui.cci-night` dims the plates so they don't glare at 22:00.
// ─────────────────────────────────────────────────────────────────────────────

/** Google Fonts (rounded, friendly). Degrades to Trebuchet/system fonts offline. */
// The faces the title card and the HUD letter with. Requested the moment the
// stylesheet lands (not when text first lays out in them), so the title's logo
// is never revealed in the fallback face and then swapped.
const FACES = ['800 1em "Baloo 2"', '700 1em "Baloo 2"', '900 1em "Nunito"', '700 1em "Nunito"', '600 1em "Nunito"', 'italic 700 1em "Nunito"'];
export function injectFonts() {
  if (typeof document === 'undefined' || !document.head || document.getElementById('cci-fonts')) return;
  const pre1 = document.createElement('link');
  pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
  const pre2 = document.createElement('link');
  pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous';
  const css = document.createElement('link');
  css.id = 'cci-fonts'; css.rel = 'stylesheet';
  css.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:ital,wght@0,600;0,700;0,900;1,700&display=swap';
  css.addEventListener('load', () => {
    try { for (const f of FACES) document.fonts?.load?.(f)?.catch?.(() => {}); } catch (e) { /* no FontFaceSet: the swap still happens */ }
  }, { once: true });
  document.head.append(pre1, pre2, css);
}

export const CSS = `
/* ── pointer-events discipline ─────────────────────────────────────────────
   index.html sets "#ui * { pointer-events:auto }". Everything of ours opts out
   again; only .cci-hit (real buttons / clickable panels) takes the pointer. */
#ui .cci, #ui .cci * { pointer-events: none; }
#ui .cci-hit, #ui .cci .cci-hit { pointer-events: auto !important; }

#ui {
  --ink:      #2f2748;
  --ink-soft: #6d5f86;
  --panel:    #fffaf1;
  --panel-2:  #ffeedb;
  --edge:     #2b2442;
  --pink:     #ef4f84;
  --gold:     #ffc94a;
  --teal:     #1f8b86;
  --amber:    #ffe3ae;
  --isl:      var(--pink);
  --fdisp: "Baloo 2", "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
  --fbody: "Nunito", "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
  --lift: 0 3px 0 rgba(43,36,66,.34), 0 10px 24px rgba(14,8,26,.4);
  --inlay: inset 0 2px 0 rgba(255,255,255,.95), inset 0 -3px 0 rgba(196,156,128,.26);
  font-family: var(--fbody);
  -webkit-font-smoothing: antialiased;
}
#ui.cci-night {
  --panel:   #f2e7dd;
  --panel-2: #dfcdbd;
  --lift: 0 3px 0 rgba(30,24,48,.42), 0 10px 24px rgba(6,3,14,.5);
}

#ui .cci { position: fixed; }
#ui svg { display: block; width: 100%; height: 100%; }

/* ── the one plate ─────────────────────────────────────────────────────────── */
#ui .cci-plate {
  background: linear-gradient(180deg, var(--panel) 0%, var(--panel-2) 100%);
  border: 3px solid var(--edge);
  border-radius: 16px;
  box-shadow: var(--lift), var(--inlay);
  color: var(--ink);
}
/* the quiet member of the family — quieter, but never SEE-THROUGH: world colour
   coming up through toast text is the one thing a notification may not do. */
#ui .cci-plate.muted {
  background: linear-gradient(180deg, var(--panel), var(--panel-2));
  border-width: 2.5px; border-color: var(--edge);
  box-shadow: 0 2px 0 rgba(43,36,66,.28), 0 6px 16px rgba(14,8,26,.34);
}
#ui .cci-eyebrow { font: 800 9.5px/1 var(--fbody); letter-spacing: .17em; text-transform: uppercase; color: var(--ink-soft); }
#ui .cci-key {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 5px;
  background: linear-gradient(180deg,#fffdf8,#ffeed6);
  border: 2.5px solid var(--edge); border-radius: 7px;
  box-shadow: 0 2.5px 0 var(--edge);
  font: 800 11.5px/1 var(--fbody); color: var(--ink);
  flex: 0 0 auto;
}
#ui .cci-ico { display: block; flex: 0 0 auto; }

/* ── corner stacks ─────────────────────────────────────────────────────────
   Two flow containers so wave-2 widgets can dock NEXT TO existing panels
   instead of guessing their measured size: the objective + candy pill share a
   top-left row, the camera chip sits above the help card/chip bottom-left. */
#ui .cci-topleft { left: 20px; top: 18px; z-index: 12; display: flex; align-items: flex-start; gap: 8px; max-width: calc(100vw - 40px); }
#ui .cci-botleft { left: 20px; bottom: 18px; z-index: 11; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
#ui .cci-topleft > .cci, #ui .cci-botleft > .cci {
  position: relative; left: auto; right: auto; top: auto; bottom: auto;
}

/* ── objective (top-left) ─────────────────────────────────────────────────── */
#ui .cci-obj { left: 20px; top: 18px; z-index: 12; max-width: 330px; }
#ui .cci-obj-in { display: flex; gap: 9px; align-items: center; padding: 8px 15px 9px 11px; }
#ui .cci-obj-pin {
  width: 24px; height: 24px; border-radius: 50%; flex: 0 0 auto;
  background: radial-gradient(circle at 34% 28%, #ffeaa6, var(--gold));
  border: 2.5px solid var(--edge); color: var(--edge); padding: 3.5px;
}
#ui .cci-obj-lab { display: block; margin-bottom: 1px; }
#ui .cci-obj-body { display: block; font: 700 14.5px/1.26 var(--fbody); color: var(--ink); text-wrap: balance; }
/* optional second line: quieter, italic — the "how", under the "what" */
#ui .cci-obj-sub { display: block; margin-top: 2px; font: 700 11.5px/1.25 var(--fbody); font-style: italic; color: var(--ink-soft); text-wrap: balance; }

/* ── candy counter (beside the objective) ─────────────────────────────────── */
#ui .cci-candy { padding: 7px 13px 8px 9px; border-radius: 999px; }
#ui .cci-candy-in { display: flex; align-items: center; gap: 7px; transform-origin: 50% 50%; }
#ui .cci-candy-ico { width: 23px; height: 23px; flex: 0 0 auto; }
#ui .cci-candy-n { font: 800 16px/1 var(--fdisp); color: var(--ink); min-width: 9px; text-align: center; }
/* An empty purse still has a place: the pill shows at 0, dimmed, so the first
   sweet you pick up has somewhere to land instead of the HUD growing a widget. */
#ui .cci-candy.dim .cci-candy-in { opacity: .5; }
#ui .cci-candy.dim .cci-candy-ico { filter: grayscale(.6); }

/* ── camera-mode chip (above the help chip) ───────────────────────────────── */
#ui .cci-cam { display: flex; align-items: center; gap: 8px; padding: 5px 10px 6px; border-radius: 999px; }
#ui .cci-cam-seg { display: flex; align-items: center; gap: 4px; opacity: .42; transform-origin: 50% 50%; }
#ui .cci-cam-seg em { font: 800 9.5px/1 var(--fbody); font-style: normal; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-soft); }
#ui .cci-cam-seg.on { opacity: 1; }
#ui .cci-cam-seg.on em { color: var(--ink); }
#ui .cci-cam-seg.on .cci-key { background: linear-gradient(180deg, #ffe9a8, var(--gold)); }
#ui .cci-cam .cci-key { min-width: 17px; height: 17px; border-width: 2px; border-radius: 6px; box-shadow: 0 2px 0 var(--edge); font-size: 10px; }

/* ── hotbar (bottom-centre; the dialogue box lifts above it) ──────────────── */
#ui .cci-bar {
  z-index: 20; left: 50%; bottom: 18px;
  display: flex; flex-direction: column; align-items: center; gap: 7px;
}
#ui .cci-bar-slots { display: flex; align-items: flex-end; gap: 8px; }
#ui .cci-slot {
  position: relative; width: 50px; height: 50px; border-radius: 14px; padding: 8px;
  display: flex; align-items: center; justify-content: center; color: var(--ink);
}
#ui .cci-slot-in { display: block; width: 100%; height: 100%; transform-origin: 50% 55%; }
#ui .cci-slot.ghost { opacity: .5; background: linear-gradient(180deg, rgba(255,250,241,.55), rgba(255,238,219,.55)); }
#ui .cci-slot.empty .cci-slot-in { opacity: .45; }
/* the held slot: bigger, gold-ringed, standing a little proud of the rack */
#ui .cci-slot.held {
  width: 60px; height: 60px; padding: 9px; border-radius: 16px;
  background: linear-gradient(180deg, #fffdf6, var(--amber));
  box-shadow: var(--lift), var(--inlay), 0 0 0 3px var(--gold);
}
#ui .cci-slot-n {
  position: absolute; right: -5px; bottom: -6px; min-width: 19px; height: 19px; padding: 0 4px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, #fffdf8, #ffeed6);
  border: 2.5px solid var(--edge); border-radius: 999px; box-shadow: 0 2px 0 var(--edge);
  font: 800 11px/1 var(--fbody); color: var(--ink);
}
#ui .cci-slot-n.fuel { background: linear-gradient(180deg, #ffd489, #ff9d4a); }
#ui .cci-slot-bar {
  position: absolute; left: 8px; right: 8px; bottom: 4px; height: 4px;
  background: rgba(43,36,66,.2); border-radius: 999px; overflow: hidden;
}
#ui .cci-slot-bar i { display: block; height: 100%; background: linear-gradient(90deg, #ff9d4a, var(--gold)); }
#ui .cci-bar-hint {
  display: flex; align-items: center; gap: 6px; padding: 4px 12px 5px; border-radius: 999px;
  font: 800 9.5px/1 var(--fbody); letter-spacing: .13em; text-transform: uppercase; color: var(--ink-soft);
}
#ui .cci-bar-hint .cci-key { min-width: 17px; height: 17px; border-width: 2px; border-radius: 6px; box-shadow: 0 2px 0 var(--edge); font-size: 10px; }
#ui .cci-bar-hint em { font-style: normal; }
#ui .cci-bar-name { font: 800 12.5px/1 var(--fdisp); color: var(--ink); letter-spacing: 0; text-transform: none; }
#ui .cci-bar-sep { width: 3px; height: 3px; border-radius: 50%; background: var(--ink-soft); opacity: .6; }
#ui .cci-bar-dot, #ui .cci-bar-slash { opacity: .55; }

/* ── day / night dial (top-right) ─────────────────────────────────────────── */
#ui .cci-dial { right: 20px; top: 18px; z-index: 12; display: flex; flex-direction: column; align-items: center; }
#ui .cci-dial-face {
  position: relative; width: 84px; height: 84px; border-radius: 50%;
  border: 3px solid var(--edge); box-shadow: var(--lift); overflow: hidden;
  background:
    conic-gradient(#8fd8ff 0deg, #bfeaff 34deg, #ffc978 92deg, #6a5aa0 122deg,
                   #221a48 150deg, #14113a 180deg, #2c2054 214deg, #6a5aa0 244deg,
                   #ff9f5a 266deg, #ffdca8 302deg, #8fd8ff 360deg);
}
#ui .cci-dial-in {
  position: absolute; inset: 12px; border-radius: 50%; z-index: 1;
  background: linear-gradient(180deg, var(--panel), var(--panel-2));
  border: 2.5px solid var(--edge);
  box-shadow: inset 0 2px 6px rgba(196,156,128,.35);
}
#ui .cci-dial.night .cci-dial-in {
  background: linear-gradient(180deg,#453a68,#241b42);
  box-shadow: inset 0 2px 8px rgba(0,0,0,.5);
}
/* remaining-daylight arc: gold from the sun round to the dusk tick */
#ui .cci-dial-arc { position: absolute; inset: 0; z-index: 2; }
#ui .cci-dial-arc .rem { stroke: var(--gold); stroke-width: 3.8; stroke-linecap: round; }
#ui .cci-dial-arc .dusk { stroke: var(--edge); stroke-width: 2.8; stroke-linecap: round; opacity: .78; }
#ui .cci-dial.night .cci-dial-arc .dusk { stroke: #ffe9b8; }
/* the orbs ride ABOVE the inner disc (they used to be sliced in half by it) */
#ui .cci-dial-orb {
  position: absolute; z-index: 3; width: 18px; height: 18px; margin: -9px 0 0 -9px;
  filter: drop-shadow(0 0 1.4px rgba(43,36,66,.85)) drop-shadow(0 1px 2px rgba(0,0,0,.45));
}
#ui .cci-dial-sun { color: #ffd257; }
/* white-on-cream is not a moon: the day moon is slate, the night moon is bright */
#ui .cci-dial-moon { color: #b3c4ea; }
#ui .cci-dial.night .cci-dial-moon { color: #eef3ff; }
#ui .cci-dial-cap {
  position: absolute; z-index: 4; left: 50%; top: 50%; transform: translate(-50%,-50%);
  font: 800 15px/1 var(--fdisp); color: var(--ink); white-space: nowrap;
}
#ui .cci-dial.night .cci-dial-cap { color: #ffe9b8; }
#ui .cci-dial-sub {
  margin-top: -6px; padding: 2px 9px 3px; border-radius: 9px; border-width: 2.5px;
  font: 800 9px/1.4 var(--fbody); letter-spacing: .13em; text-transform: uppercase;
  color: var(--ink-soft); position: relative;
}

/* ── minimap (bottom-right) ───────────────────────────────────────────────── */
#ui .cci-map {
  right: 20px; bottom: 18px; z-index: 12; padding: 7px; border-radius: 15px;
  transform-origin: 100% 100%; cursor: pointer; touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
#ui .cci-map canvas { display: block; border-radius: 9px; border: 2.5px solid var(--edge); }
/* a world plate is something you OPENED: it sits over the transient banner,
   toasts and dialogue (which on a phone would otherwise cover it) */
#ui .cci-map[data-mode="world"] { z-index: 41; }
/* the chart dims itself from ctx.state.daylight (minimap.js), so no CSS filter */
#ui .cci-map-foot {
  display: flex; align-items: center; gap: 6px; padding: 5px 4px 1px; max-width: 196px;
}
#ui .cci-map-pin {
  width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto;
  background: var(--ink-soft); border: 2px solid var(--edge); box-sizing: content-box; opacity: .65;
}
#ui .cci-map-here {
  font: 800 11px/1.1 var(--fbody); letter-spacing: .06em; color: var(--ink-soft);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1 1 auto; min-width: 0;
}
/* the M cycle as three pips: near · world · explored. The lit one is where you are. */
#ui .cci-map-modes { display: flex; gap: 3px; margin-left: auto; padding-left: 6px; flex: 0 0 auto; }
#ui .cci-map-modes i { width: 6px; height: 6px; border-radius: 50%; border: 1.5px solid var(--edge); background: transparent; opacity: .45; box-sizing: content-box; }
#ui .cci-map[data-mode="local"] .cci-map-modes i:nth-child(1),
#ui .cci-map[data-mode="world"] .cci-map-modes i:nth-child(2),
#ui .cci-atlas .cci-map-modes i:nth-child(3) { background: var(--gold); opacity: 1; }

/* ── the EXPLORED MAP (atlas): M's third stop, a big centred sheet ─────────────
   Above toasts (40), banner, dialogue (30) and the touch controls (≤ 50); below
   cards (62), the title (84) and the fade (92). The scrim fades with the sheet
   (ui.js writes its opacity). Tap the sheet (or M) to close it. */
#ui .cci-atlas {
  z-index: 58; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
}
#ui .cci-atlas-scrim {
  position: absolute; inset: 0; opacity: 0;
  background: radial-gradient(ellipse 70% 70% at 50% 50%, rgba(22,12,32,.3) 0%, rgba(22,12,32,.56) 100%);
}
#ui .cci-atlas-plate {
  position: relative; padding: 10px 12px 10px; border-radius: 22px;
  cursor: pointer; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
}
#ui .cci-atlas-head { display: flex; align-items: center; gap: 10px; padding: 1px 4px 9px; }
#ui .cci-atlas-ico {
  width: 34px; height: 34px; padding: 6px; box-sizing: border-box; flex: 0 0 auto; border-radius: 50%;
  color: var(--ink); background: var(--gold); border: 2.5px solid var(--edge); box-shadow: 0 2px 0 rgba(43,36,66,.3);
}
#ui .cci-atlas-title { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
#ui .cci-atlas-title b { font: 800 23px/1 var(--fdisp); color: var(--ink); white-space: nowrap; }
#ui .cci-atlas-close { margin-left: auto; display: flex; align-items: center; gap: 7px; flex: 0 0 auto; }
#ui .cci-atlas-close em { font: 800 10.5px/1 var(--fbody); font-style: normal; letter-spacing: .13em; text-transform: uppercase; color: var(--ink-soft); }
#ui .cci-atlas-close em.t { display: none; }
body.cci-touch #ui .cci-atlas-close em.k { display: none; }
body.cci-touch #ui .cci-atlas-close em.t { display: inline; }
#ui .cci-atlas-chart {
  position: relative; border-radius: 13px; overflow: hidden; border: 3px solid var(--edge);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.4);
}
#ui .cci-atlas-chart canvas { display: block; }
#ui .cci-atlas-chart canvas.rt, #ui .cci-atlas-chart canvas.pl, #ui .cci-atlas-chart canvas.dy { position: absolute; left: 0; top: 0; }
/* (inline-size containment — the footer never widens the sheet: the chart, which
   minimap.js fits to the screen, sets its width, and the footer lives inside it;
   as a size container it sheds legend entries when that width is short, below) */
#ui .cci-atlas-foot { display: flex; align-items: center; gap: 16px; padding: 9px 4px 1px; min-width: 0;
  contain: inline-size; container-type: inline-size; }
/* the footer reports what you have seen: 'Explored: the Candy Kingdom 37% · Cat Island 12%',
   each island's figure over a progress rule in its colour (--p from minimap.js);
   a figure never breaks inside itself ('the Candy / Kingdom') */
#ui .cci-map-xp { flex: 0 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font: 800 13.5px/1.3 var(--fbody); letter-spacing: .02em; color: var(--ink-soft); }
#ui .cci-map-xp-lab { font-weight: 900; color: var(--ink); letter-spacing: .12em; text-transform: uppercase; font-size: 10.5px; }
#ui .cci-map-xp-isl {
  color: var(--ink); font-weight: 900; padding-bottom: 3px; white-space: nowrap;
  background: linear-gradient(90deg, var(--xpc) var(--p, 0%), rgba(43,36,66,.14) var(--p, 0%)) left bottom / 100% 3px no-repeat;
}
#ui .cci-map-xp-isl.c { --xpc: var(--pink); }
#ui .cci-map-xp-isl.k { --xpc: var(--teal); }
/* once the figures stack (minimap.js sets .stack) the ' · ' would dangle at the
   end of line one: it goes invisible but keeps its room, so the wrap holds */
#ui .cci-map-xp.stack .cci-map-xp-sep { visibility: hidden; }
#ui .cci-atlas-legend { display: flex; align-items: center; gap: 14px; margin-left: auto; flex: 0 0 auto; min-width: 0; overflow: hidden; }
/* 'your route' is only in the key while there is a route on the sheet */
#ui .cci-atlas-legend.no-route .lg-r { display: none; }
#ui .cci-atlas-leg { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
#ui .cci-atlas-leg em { font: 700 11.5px/1 var(--fbody); font-style: normal; color: var(--ink-soft); }
#ui .cci-atlas-leg em b { font-weight: 900; color: var(--ink); }
#ui .cci-atlas-leg i { display: block; flex: 0 0 auto; box-sizing: border-box; }
#ui .cci-atlas-leg .lg-place { width: 14px; height: 14px; border-radius: 50%; background: #fff6d8; border: 3px solid #e8a91c; box-shadow: 0 0 0 1.2px var(--edge), 0 0 7px 2px rgba(255,201,74,.7); }
#ui .cci-atlas-leg .lg-route { width: 26px; height: 8px; border-radius: 4px; border: 1.5px solid rgba(43,36,66,.6);
  background: repeating-linear-gradient(90deg, #e21f55 0 7px, #fffaf0 7px 11px); }
#ui .cci-atlas-leg .lg-fog { width: 18px; height: 12px; border-radius: 4px; border: 1.5px solid var(--edge);
  background: repeating-linear-gradient(45deg, rgba(176,140,92,.3) 0 1px, transparent 1px 5px), #f8efd8; }
#ui .cci-atlas .cci-map-modes { margin-left: 0; }
/* a footer too short for the figures + the whole key drops key entries rather
   than clip them or cut the figures off: 'not yet explored' first, then 'your
   route', and 'places n/26' — the one count toward the goal — last. (Widths
   measured with the widest figures, 'the Candy Kingdom 100% · Cat Island 100%'.) */
@container (max-width: 765px) { #ui .cci-atlas-leg:nth-child(3) { display: none; } }
@media (min-width: 761px) and (min-height: 541px) {
  @container (max-width: 636px) { #ui .cci-atlas-leg:nth-child(2) { display: none; } }
  @container (max-width: 535px) { #ui .cci-atlas-legend { display: none; } }
}

/* ── map chip: what is left of the map while it is OFF (tap / M brings it back) ── */
#ui .cci-mapchip {
  right: 20px; bottom: 18px; z-index: 12; display: flex; align-items: center; gap: 7px;
  padding: 6px 12px 7px 9px; border-radius: 999px; transform-origin: 100% 100%;
  cursor: pointer; touch-action: none; -webkit-tap-highlight-color: transparent;
}
#ui .cci-mapchip-ico { width: 18px; height: 18px; color: var(--ink); flex: 0 0 auto; }
#ui .cci-mapchip em { font: 800 11px/1 var(--fbody); font-style: normal; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-soft); }
/* standing INSIDE a named place: the name goes loud and the pin lights up */
#ui .cci-map.at-landmark .cci-map-pin { background: var(--gold); opacity: 1; }
#ui .cci-map.at-landmark .cci-map-here { color: var(--ink); font-weight: 900; }

/* ── controls: full card, then a persistent chip ──────────────────────────── */
#ui .cci-hint { left: 20px; bottom: 18px; z-index: 11; padding: 9px 13px 10px; border-radius: 15px; }
#ui .cci-hint .cci-eyebrow { display: block; margin-bottom: 7px; }
#ui .cci-hint-grid { display: grid; grid-template-columns: 152px 1fr; row-gap: 4px; column-gap: 8px; align-items: center; }
#ui .cci-hint-keys { display: flex; gap: 4px; align-items: center; }
#ui .cci-hint-grid em { font: 700 11.5px/1.2 var(--fbody); font-style: normal; color: var(--ink-soft); }
#ui .cci-hint-grid em b { font-weight: 900; color: var(--ink); }
#ui .cci-chip { left: 20px; bottom: 18px; z-index: 11; padding: 6px 12px 7px 9px; border-radius: 999px; }
#ui .cci-chip-in { display: flex; align-items: center; gap: 7px; }
#ui .cci-chip em { font: 800 11px/1 var(--fbody); font-style: normal; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-soft); }
#ui .cci-chip-in { transform-origin: 20% 50%; }
/* just after the title: the chip spells itself out and wears a soft pink ring */
#ui .cci-chip.nudge { box-shadow: var(--lift), var(--inlay), 0 0 0 3px rgba(239,79,132,.32); }
#ui .cci-chip.nudge em { color: var(--ink); }

/* ── interaction prompt ───────────────────────────────────────────────────── */
#ui .cci-prompt { z-index: 16; left: 50%; bottom: 168px; }
#ui .cci-prompt-in {
  position: relative;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 16px 8px 9px; border-radius: 999px;
  font: 800 14.5px/1 var(--fbody); color: var(--ink); white-space: nowrap;
  animation: cci-bob 1.5s ease-in-out infinite;
}
/* A leader tail: a notch off the pill pointing at the thing it names, so a
   prompt floating beside a busy scene still says WHICH object it belongs to. */
#ui .cci-prompt-tail {
  position: absolute; width: 12px; height: 12px; display: none;
  background: var(--panel-2); border: 3px solid var(--edge);
  transform: rotate(45deg);
}
#ui .cci-prompt[data-tail="down"] .cci-prompt-tail {
  display: block; left: 50%; margin-left: -6px; bottom: -7px;
  border-top: 0; border-left: 0;
}
#ui .cci-prompt[data-tail="left"] .cci-prompt-tail {
  display: block; top: 50%; margin-top: -6px; left: -7px;
  border-top: 0; border-right: 0;
}
#ui .cci-prompt[data-tail="right"] .cci-prompt-tail {
  display: block; top: 50%; margin-top: -6px; right: -7px;
  border-bottom: 0; border-left: 0;
}
#ui .cci-prompt .cci-key { animation: cci-glow 1.5s ease-in-out infinite; }
@keyframes cci-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
@keyframes cci-glow {
  0%,100% { box-shadow: 0 2.5px 0 var(--edge), 0 0 0 rgba(255,201,74,0); }
  50%     { box-shadow: 0 2.5px 0 var(--edge), 0 0 0 5px rgba(255,201,74,.45); }
}

/* ── dialogue ─────────────────────────────────────────────────────────────── */
/* FIXED GEOMETRY. The box was sized by its text, so every line changed its
   width AND its height and the nameplate / portrait / E chip hopped about
   between lines. Now: one width (560), a two-line floor, and the three pieces
   of furniture are pinned to the panel's corners — the portrait to the bottom
   left, the advance affordance to the bottom right, the nameplate to the top —
   so nothing moves as the conversation runs. */
#ui .cci-say {
  z-index: 30; left: 50%; bottom: 40px;
  width: min(560px, calc(100vw - 48px));
}
#ui .cci-say-panel {
  position: relative; display: block; min-height: 76px;
  padding: 13px 15px 13px 14px; border-radius: 20px; cursor: pointer;
}
#ui .cci-portrait {
  position: absolute; left: 14px; bottom: 13px;
  width: 58px; height: 58px; border-radius: 50%; overflow: hidden;
  border: 3px solid var(--edge);
  box-shadow: 0 0 0 2.5px var(--pr, var(--pink)), 0 3px 0 rgba(43,36,66,.3);
  background: radial-gradient(circle at 36% 24%, #fffdf7, var(--pbg, #ffe3ef) 78%);
}
#ui .cci-say-body {
  margin: 0 74px 0 71px; min-width: 0; min-height: 50px;
  display: flex; align-items: center;
}
#ui .cci-nameplate {
  position: absolute; left: 84px; top: -13px;
  padding: 3px 13px 4px; border-radius: 999px;
  background: var(--pacc, var(--pink));
  border: 2.5px solid var(--edge); box-shadow: 0 2.5px 0 rgba(43,36,66,.3);
  font: 800 13px/1.15 var(--fdisp); color: #fff; text-shadow: 0 1.5px 0 rgba(0,0,0,.25);
  max-width: 58%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#ui .cci-say-text { font: 700 17px/1.45 var(--fbody); color: var(--ink); word-wrap: break-word; width: 100%; }
#ui .cci-ghost { opacity: 0; }
#ui .cci-caret {
  display: inline-block; width: 0; height: 16px; vertical-align: -2px;
  border-left: 2.5px solid var(--pink);
  animation: cci-blink .6s steps(1) infinite;
}
@keyframes cci-blink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
/* a '...' line is a BEAT: three breathing dots and a stage direction */
#ui .cci-beat { display: inline-flex; gap: 5px; vertical-align: middle; margin-right: 10px; }
#ui .cci-beat i { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-soft); animation: cci-beat 1.1s ease-in-out infinite; }
#ui .cci-beat i:nth-child(2) { animation-delay: .18s; }
#ui .cci-beat i:nth-child(3) { animation-delay: .36s; }
@keyframes cci-beat { 0%,100% { opacity: .3; transform: translateY(0) } 45% { opacity: 1; transform: translateY(-3px) } }
#ui .cci-beat-dir { font-style: italic; font-weight: 700; color: var(--ink-soft); vertical-align: middle; }
/* The advance affordance: always 'E ▸'; a bobbing '▼ n' joins it on the left
   when more lines are queued, so text never simply stops. */
#ui .cci-adv {
  position: absolute; right: 15px; bottom: 12px;
  display: flex; align-items: center; gap: 6px;
  font: 800 10px/1 var(--fbody); letter-spacing: .1em; color: var(--ink-soft);
}
#ui .cci-adv-more { display: flex; align-items: center; gap: 2px; color: var(--ink); }
#ui .cci-adv-chev { display: block; width: 13px; height: 13px; animation: cci-bob 1s ease-in-out infinite; }
#ui .cci-adv-go { width: 13px; height: 13px; color: var(--ink); }

/* ── location banner — docked in the top column, on a plate ───────────────── */
/* Toasts and the location banner dock TOP-CENTRE only, and ui.js nudges this
   column to the right if it would ever reach into the left 30% of the frame —
   that band belongs to the world (the BILLIONS SERVED billboard lives there). */
#ui .cci-topcol {
  z-index: 40; left: 50%; top: 16px; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  width: max-content; max-width: min(560px, 74vw);
}
#ui .cci-toasts { display: flex; flex-direction: column; align-items: center; gap: 6px; }
/* ~40% smaller than the first pass (was 34px type on a 465x120 plate) so the
   reveal stays a caption, not a cutscene. */
#ui .cci-banner-plate {
  display: flex; align-items: center; gap: 9px;
  padding: 6px 14px 7px 10px; border-radius: 14px;
}
#ui .cci-banner-ico { width: 20px; height: 20px; color: var(--isl); }
#ui .cci-banner.isl-cat { --isl: var(--teal); }
#ui .cci-banner-title {
  display: block; font: 800 26px/1.06 var(--fdisp); color: var(--ink); letter-spacing: .005em;
  white-space: nowrap;
}
/* ONE divider language on both islands: a 2px rule, tinted by --isl. */
#ui .cci-banner-rule { display: block; height: 2px; border-radius: 1px; background: var(--isl); margin: 3px 0 0; opacity: .9; }
#ui .cci-banner-sub {
  display: block; margin-top: 2px;
  font: 700 10.5px/1.25 var(--fbody); font-style: italic; color: var(--ink-soft);
}

/* ── toasts — the muted member of the plate family ────────────────────────── */
#ui .cci-toast {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 13px 7px 10px; border-radius: 12px;
  font: 700 12.5px/1.3 var(--fbody); color: var(--ink); text-align: left;
}
#ui .cci-toast-ico { width: 15px; height: 15px; color: var(--ink-soft); }
#ui .cci-toast.warn {
  background: linear-gradient(180deg, var(--amber), #ffd489);
  border: 3px solid var(--edge); border-radius: 14px;
  box-shadow: var(--lift), var(--inlay);
  font-size: 14px; font-weight: 800; color: #5c1420; padding: 8px 16px 9px 12px;
}
#ui .cci-toast.warn .cci-toast-ico { width: 18px; height: 18px; color: #a3231f; }
/* an optional label in front of the message ('TIGER TIME · the cats are…') */
#ui .cci-toast-t {
  flex: 0 0 auto; padding: 2px 7px 3px; border-radius: 7px;
  background: rgba(43,36,66,.9); color: #ffeed8;
  font: 900 9px/1.1 var(--fbody); letter-spacing: .16em; text-transform: uppercase;
}
#ui .cci-toast.warn .cci-toast-t { background: #7d1a22; color: #ffe6c8; }

/* ── modal card ───────────────────────────────────────────────────────────── */
#ui .cci-cardwrap { z-index: 62; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(20,10,28,.52); }
#ui .cci-card { width: min(460px, 86vw); padding: 24px 26px 20px; border-radius: 24px; text-align: center; border-width: 4px; }
/* optional glyph / image: one disc in the plate family, never a bare picture */
#ui .cci-card-ico {
  width: 78px; height: 78px; margin: 0 auto 12px; padding: 13px; border-radius: 50%;
  background: radial-gradient(circle at 36% 26%, #fffdf7, var(--panel-2) 80%);
  border: 3px solid var(--edge); color: var(--ink);
  box-shadow: inset 0 2px 0 rgba(255,255,255,.9), 0 3px 0 rgba(43,36,66,.28);
}
#ui .cci-card-ico.img { padding: 0; overflow: hidden; }
#ui .cci-card-ico img { display: block; width: 100%; height: 100%; object-fit: cover; }
#ui .cci-card h2 { margin: 0 0 9px; font: 800 28px/1.1 var(--fdisp); color: var(--ink); }
#ui .cci-card p { margin: 0 0 18px; font: 700 15.5px/1.45 var(--fbody); color: var(--ink-soft); }
#ui .cci-card-btns { display: flex; gap: 11px; justify-content: center; flex-wrap: wrap; }
#ui .cci-btn {
  padding: 10px 20px 11px; border-radius: 13px; border: 3px solid var(--edge);
  background: linear-gradient(180deg,#fffdf8,#ffe9cf);
  box-shadow: 0 4px 0 var(--edge);
  font: 800 14.5px/1 var(--fbody); color: var(--ink); cursor: pointer;
  transition: transform .08s, box-shadow .08s;
}
#ui .cci-btn:hover { transform: translateY(-1px); box-shadow: 0 5px 0 var(--edge); }
#ui .cci-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--edge); }
#ui .cci-btn.primary { background: linear-gradient(180deg,#ff86ab,var(--pink)); color: #fff; text-shadow: 0 2px 0 rgba(0,0,0,.2); }

/* ── overlays: night darkening, danger vignette, fade, intro ─────────────── */
/* A gentle cool vignette at night: it darkens the frame EDGES (so the corners
   are never brighter than the middle) and lets the plates read against it. */
#ui .cci-nvig {
  z-index: 5; inset: 0; opacity: 0;
  background: radial-gradient(ellipse 80% 72% at 50% 48%,
    rgba(8,6,26,0) 24%, rgba(10,7,30,.45) 62%, rgba(6,4,20,.9) 92%, rgba(3,2,12,1) 100%);
}
#ui .cci-vig { z-index: 6; inset: 0; opacity: 0; }
/* HUNTING: the frame edges go blood-dark. The last stop is the CORNER value —
   ~46% alpha — dark enough to feel the squeeze, light enough to still play. */
#ui .cci-vig-in {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 78% 70% at 50% 50%,
    rgba(40,0,12,0) 40%, rgba(84,2,22,.18) 66%, rgba(34,0,10,.36) 86%, rgba(16,0,6,.5) 100%);
}
#ui .cci-vig-pulse {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 86% 76% at 50% 50%, rgba(255,40,70,0) 52%, rgba(255,26,58,.24) 100%);
}
#ui .cci-fade { z-index: 92; inset: 0; background: #0b0a12; opacity: 0; display: none; }

/* ── title screen (ui/title.js) ─────────────────────────────────────────────
   The LIVE world is the picture: a low golden-hour hero shot from the sea, the
   horizon ~57% down, so the top half is sky. Layers, back to front:
     .cci-ti-sky    the sky grade: a backdrop hue/saturation lift masked to the
                    sky zone (the peach dusk band → candy pink, orange-lit clouds
                    → coral) under a thin lavender veil at the zenith. (One
                    rotation for the whole zone: a second, warmer-for-the-top
                    one turned the lit cloud faces mustard.) (#ui is position:fixed, so it
                    is an isolated group: mix-blend-mode can't see the canvas,
                    backdrop-filter can.)
     .cci-ti-dof    depth of field focused on the islands: a backdrop blur ramped
                    in from just under them (the tagline + pill sit on soft sea)
                    and along the top edge (a cloud right by the lens)
     .cci-ti-scrim  a plum glow behind the tagline + pill, a plum floor for the
                    credits, and the faintest vignette
     .cci-ti-motes  sprinkles (three depths, all BEHIND the type)
     .cci-ti-stage  .cci-ti-top (the logo ALONE, in the sky zone) and
                    .cci-ti-lower (tagline + pill, over the defocused sea)
   The logo is staged: ribbon eyebrow · CANDY KINGDOM (bouncy candy-stripe letters)
   · a gold AND badge · CAT ISLAND (calm mint letters, ears and a tail).
   Every letter is two layers — a fat ink outline (.o) under a clipped fill
   (.f) — so the stroke sits OUTSIDE the glyph instead of eating the stripes.
   --tf is the one size everything hangs off; title.js also scales the logo
   down if an odd window still can't hold it in the sky zone. */
#ui .cci-intro {
  z-index: 84; inset: 0; display: flex; flex-direction: column; overflow: hidden;
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
  --tf: clamp(34px, min(14vw, 13.5vh), 150px);
  --ti-ink: #24122c;
  --ti-plum: 44,14,52;
  --ti-zone: 50vh;          /* the sky zone the logo is fitted into */
  --ti-lower: 65vh;         /* where the tagline + pill group starts */
  --ti-lowh: 5vh;           /* ~half its height: the plum glow's centre sits here below it */
  --ti-dof-top: 17vh;       /* the top defocus fades out by here */
  --ti-dof-a: 60vh;         /* the near-sea defocus starts here… */
  --ti-dof-b: 73vh;         /* …and is full from here down */
}
/* the HUD waits underneath while the title is up */
#ui.cci-titling > .cci:not(.cci-intro):not(.cci-fade):not(.cci-nvig):not(.cci-vig) { visibility: hidden !important; }
/* CONTRACT K — the opening cinematic (ui.showHud(false) / #ui.cci-cinema): EVERY
   panel goes, ours and other systems' (touch controls, pills, the flyer HUD),
   except the fading title card, the fade, the night overlays, the skip hint
   and touch.js's 'turn your phone' card — it PAUSES the game (the flight too),
   so hiding it would leave a frozen frame with nothing to say why */
#ui.cci-cinema > :not(.cci-intro):not(.cci-fade):not(.cci-nvig):not(.cci-vig):not(.cci-skip):not(.tch-rot):not(style) { visibility: hidden !important; }
#ui .cci-skip {
  right: calc(20px + env(safe-area-inset-right, 0px)); bottom: calc(18px + env(safe-area-inset-bottom, 0px)); z-index: 60;
  display: flex; align-items: center; gap: 5px; padding: 5px 13px 6px 8px; border-radius: 999px;
}
#ui .cci-skip-ico { width: 13px; height: 13px; color: var(--ink); flex: 0 0 auto; }
#ui .cci-skip em { font: 800 11px/1 var(--fbody); font-style: normal; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-soft); }
#ui .cci-ti-sr { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
#ui .cci-ti-sky {
  position: absolute; left: 0; right: 0; top: 0; height: 60vh; pointer-events: none;
  -webkit-backdrop-filter: hue-rotate(-24deg) saturate(1.16) brightness(1.05); backdrop-filter: hue-rotate(-24deg) saturate(1.16) brightness(1.05);
  -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 72%, transparent 96%); mask-image: linear-gradient(180deg, #000 0%, #000 72%, transparent 96%);
  background: linear-gradient(180deg, rgba(198,158,255,.26) 0%, rgba(206,164,255,.16) 22%, rgba(236,172,250,.06) 42%, rgba(255,176,214,.08) 62%, rgba(255,176,214,0) 92%);
}
/* depth of field, focused on the islands: the near sea (and anything drifting
   right in front of the lens up top, like a close cloud) goes soft */
#ui .cci-ti-dof {
  position: absolute; inset: 0; pointer-events: none;
  -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,.9) 0, transparent var(--ti-dof-top), transparent var(--ti-dof-a), #000 var(--ti-dof-b));
  mask-image: linear-gradient(180deg, rgba(0,0,0,.9) 0, transparent var(--ti-dof-top), transparent var(--ti-dof-a), #000 var(--ti-dof-b));
}
#ui .cci-ti-scrim {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse min(460px, 64vw) max(120px, 14vh) at 50% calc(var(--ti-lower) + var(--ti-lowh)),
      rgba(var(--ti-plum),.6) 0%, rgba(var(--ti-plum),.4) 42%, rgba(var(--ti-plum),.14) 74%, rgba(var(--ti-plum),0) 100%),
    linear-gradient(180deg, rgba(var(--ti-plum),0) 76%, rgba(var(--ti-plum),.34) 90%, rgba(30,8,38,.62) 100%),
    radial-gradient(ellipse 130% 110% at 50% 42%, rgba(0,0,0,0) 64%, rgba(36,10,46,.3) 100%);
}
#ui .cci-ti-motes { position: absolute; inset: 0; overflow: hidden; }
#ui .cci-ti-motes i {
  position: absolute; left: 0; top: 0; border-radius: 99px;
  border: 1.2px solid rgba(36,18,44,.5); box-shadow: inset 0 1.2px 0 rgba(255,255,255,.55);
}
#ui .cci-ti-motes i.mid { opacity: .85; }
#ui .cci-ti-motes i.far { opacity: .6; filter: blur(.7px); border-color: rgba(36,18,44,.25); box-shadow: none; }
#ui .cci-ti-stage { position: absolute; inset: 0; }
#ui .cci-ti-top {
  position: absolute; left: 0; right: 0; top: calc(env(safe-area-inset-top, 0px) + 2.5vh); height: var(--ti-zone);
  display: flex; align-items: center; justify-content: center; padding: 0 12px;
}
#ui .cci-ti-block { display: flex; flex-direction: column; align-items: center; transform-origin: 50% 50%; }
#ui .cci-ti-logo {
  position: relative; display: flex; flex-direction: column; align-items: center;
  padding: 0 .46em; font-size: var(--tf); line-height: .9;
}

/* eyebrow: a pink ribbon with notched tails */
#ui .cci-ti-eyebrow { position: relative; z-index: 3; font-size: .235em; margin-bottom: .1em; transform-origin: 50% 60%; }
#ui .cci-ti-rib {
  position: relative; display: inline-block; padding: .26em .95em .2em;
  font: 800 1em/1 var(--fdisp); letter-spacing: .17em; color: #fff8ee; white-space: nowrap;
  background: linear-gradient(180deg, #ff86ae 0%, var(--pink) 58%, #d7386f 100%);
  border: .11em solid var(--ti-ink); border-radius: .32em;
  box-shadow: 0 .15em 0 var(--ti-ink), 0 .34em .6em rgba(16,4,24,.4), inset 0 .09em 0 rgba(255,255,255,.5);
  text-shadow: 0 .09em 0 rgba(36,18,44,.6);
}
#ui .cci-ti-rib::before, #ui .cci-ti-rib::after {
  content: ''; position: absolute; top: .42em; bottom: -.42em; width: 1.1em; z-index: -1;
  background: linear-gradient(180deg, #c8336a, #a8285a); border: .11em solid var(--ti-ink);
}
#ui .cci-ti-rib::before { left: -.78em; clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 34% 50%); }
#ui .cci-ti-rib::after { right: -.78em; clip-path: polygon(0 0, 100% 0, 66% 50%, 100% 100%, 0 100%); }

/* the two island words */
#ui .cci-ti-word {
  position: relative; display: flex; align-items: flex-end; justify-content: center; white-space: nowrap;
  font: 800 1em/.94 var(--fdisp); letter-spacing: -.01em;
  filter: drop-shadow(0 .06em 0 var(--ti-ink)) drop-shadow(0 .15em .16em rgba(16,4,24,.5));
}
#ui .cci-ti-l { position: relative; display: inline-block; transform-origin: 50% 85%; }
#ui .cci-ti-l b { display: block; font: inherit; }
#ui .cci-ti-l .o { position: absolute; left: 0; top: 0; color: var(--ti-ink); -webkit-text-stroke: .17em var(--ti-ink); }
#ui .cci-ti-l .f { position: relative; color: transparent; -webkit-background-clip: text; background-clip: text; }
#ui .cci-ti-l.cd .f {
  background-image:
    linear-gradient(180deg, rgba(255,255,255,.66) 0%, rgba(255,255,255,.14) 30%, rgba(255,255,255,0) 44%),
    linear-gradient(0deg, rgba(90,10,50,.32) 0%, rgba(90,10,50,0) 30%),
    repeating-linear-gradient(126deg, var(--c) 0 .09em, #fff6ec .09em .18em);
}
#ui .cci-ti-cat { font-size: .8em; margin-top: .02em; }
#ui .cci-ti-l.ct { transform-origin: 50% 100%; }
#ui .cci-ti-l.ct .f {
  background-image:
    linear-gradient(180deg, rgba(255,255,255,.62) 0%, rgba(255,255,255,.1) 34%, rgba(255,255,255,0) 46%),
    linear-gradient(180deg, #e6fff6 0%, #a2f0d7 40%, #52c7a8 72%, #2fa88c 100%);
}
#ui .cci-ti-sp { display: inline-block; width: .24em; }
#ui .cci-ti-ears { position: absolute; left: .01em; top: -.25em; width: .7em; height: .5em; transform-origin: 25% 100%; }
#ui .cci-ti-tail { position: absolute; right: -.42em; bottom: .08em; width: .5em; height: .7em; transform-origin: 8% 92%; }

/* lollipop (peeks from behind the C) + AND badge + sparkles */
#ui .cci-ti-lolli { position: absolute; left: -.34em; top: -.36em; width: .6em; height: 1.04em; transform-origin: 50% 90%; }
#ui .cci-ti-and { position: relative; z-index: 2; display: flex; align-items: center; gap: .18em; margin: .06em 0 .02em; font-size: .27em; }
#ui .cci-ti-andb {
  font: 800 1em/1 var(--fdisp); letter-spacing: .1em; color: var(--ti-ink); padding: .2em .55em .14em .65em; border-radius: 999px;
  background: linear-gradient(180deg, #ffeab0, var(--gold) 70%, #f0ab2c);
  border: .1em solid var(--ti-ink);
  box-shadow: 0 .12em 0 var(--ti-ink), 0 .26em .5em rgba(16,4,24,.4), inset 0 .07em 0 rgba(255,255,255,.75);
}
#ui .cci-ti-and .st { width: .85em; height: .85em; filter: drop-shadow(0 .07em 0 var(--ti-ink)); }
#ui .cci-ti-spark { position: absolute; width: .19em; height: .19em; color: #fff6d6; filter: drop-shadow(0 0 .05em rgba(255,214,130,.95)); }
#ui .cci-ti-spark.s1 { right: .18em; top: .2em; }
#ui .cci-ti-spark.s2 { left: .08em; top: 1.5em; width: .14em; height: .14em; }
#ui .cci-ti-spark.s3 { right: .52em; bottom: .7em; width: .13em; height: .13em; }

/* the lower group: tagline + press pill (their plum glow is the scrim's first layer) */
#ui .cci-ti-lower {
  position: absolute; left: 0; right: 0; top: var(--ti-lower); z-index: 0;
  display: flex; flex-direction: column; align-items: center; padding: 0 16px;
}
#ui .cci-intro .sub {
  margin: 0; text-align: center;
  font: 800 clamp(15px, 1.55vw, 22px)/1.3 var(--fbody); font-style: italic; letter-spacing: .01em; color: #fff4e6;
  text-shadow:
    2px 0 0 var(--ti-ink), -2px 0 0 var(--ti-ink), 0 2px 0 var(--ti-ink), 0 -2px 0 var(--ti-ink),
    1.5px 1.5px 0 var(--ti-ink), -1.5px 1.5px 0 var(--ti-ink), 1.5px -1.5px 0 var(--ti-ink), -1.5px -1.5px 0 var(--ti-ink),
    0 4px 0 var(--ti-ink), 0 6px 14px rgba(10,2,16,.55);
}
#ui .cci-ti-pressrow { margin-top: clamp(14px, 2.8vh, 26px); }
#ui .cci-intro .press {
  --ring: 0;
  display: inline-block; padding: .9em 2em .95em; border-radius: 999px; white-space: nowrap;
  font: 900 clamp(13px, calc(.55vw + 7.5px), 17px)/1 var(--fbody); letter-spacing: .17em; text-transform: uppercase; color: #fffaf2;
  background: linear-gradient(180deg, #ff8fb6 0%, #ff5c93 46%, #e23a74 100%);
  border: 3.5px solid var(--ti-ink);
  text-shadow: 0 2px 0 var(--ti-ink), 1px 0 0 var(--ti-ink), -1px 0 0 var(--ti-ink), 0 -1px 0 var(--ti-ink);
  box-shadow:
    0 5px 0 var(--ti-ink),
    inset 0 2.5px 0 rgba(255,255,255,.55), inset 0 -3px 0 rgba(150,20,70,.35),
    0 0 0 calc(4px + var(--ring) * 7px) rgba(255,176,206,calc(.34 - var(--ring) * .22)),
    0 12px 26px rgba(10,4,20,.45);
}
#ui .cci-ti-credits {
  position: absolute; left: 0; right: 0; bottom: env(safe-area-inset-bottom, 0px);
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 14px;
  padding: 10px 16px 18px; text-align: center;
  font: 700 14.5px/1.25 var(--fbody); letter-spacing: .02em; color: #ffe6d6;
  text-shadow: 0 1.5px 0 rgba(26,8,32,.95), 0 2px 10px rgba(0,0,0,.65);
}
#ui .cci-ti-cr { white-space: nowrap; }
#ui .cci-ti-cr b { font-weight: 900; color: #fffaf2; }
#ui .cci-ti-crdot { width: 8px; height: 8px; border-radius: 50%; background: var(--gold); border: 1.5px solid var(--ti-ink); box-shadow: 0 1px 0 var(--ti-ink); }
/* short windows (landscape phones): tighter, no tagline, the pill lower */
@media (max-height: 480px) {
  #ui .cci-intro { --tf: clamp(30px, min(14vw, 17.5vh), 150px); --ti-zone: 52vh; --ti-lower: 70vh; --ti-lowh: 4.5vh; }
  #ui .cci-ti-top { top: calc(env(safe-area-inset-top, 0px) + 1.5vh); }
  #ui .cci-intro .sub { display: none; }
  #ui .cci-ti-pressrow { margin-top: 0; }
  #ui .cci-intro .press { padding: 8px 20px 9px; font-size: 11.5px; border-width: 3px; }
  #ui .cci-ti-credits { padding: 6px 16px 8px; font-size: 11.5px; }
}
/* tall windows (portrait phones): the logo rides a little lower in its sky,
   the lower group clears the pier corner, the credits stack */
@media (max-aspect-ratio: 3/4) {
  #ui .cci-intro { --ti-zone: 46vh; --ti-lower: 71vh; --ti-lowh: 4vh; --ti-dof-a: 63vh; --ti-dof-b: 76vh; }
  #ui .cci-ti-top { top: calc(env(safe-area-inset-top, 0px) + 7vh); }
}
@media (max-width: 560px) {
  #ui .cci-ti-credits { flex-direction: column; gap: 3px; font-size: 12.5px; padding-bottom: 16px; }
  #ui .cci-ti-crdot { display: none; }
  #ui .cci-intro .press { letter-spacing: .14em; }
  #ui .cci-ti-logo { padding: 0 .34em; }
}

/* Small screens: the map STAYS (minimap.js fits its plate to the viewport and
   it takes taps); only the keyboard card goes. */
@media (max-width: 760px), (max-height: 460px) {
  #ui .cci-map { right: 12px; bottom: 12px; padding: 5px; border-radius: 13px; }
  #ui .cci-map-foot { padding-top: 4px; }
  #ui .cci-mapchip { right: 12px; bottom: 12px; }
}
/* the atlas on a phone / small window: the same sheet, less furniture */
@media (max-width: 760px), (max-height: 540px) {
  #ui .cci-atlas-plate { padding: 6px 8px 6px; border-radius: 16px; }
  #ui .cci-atlas-head { padding: 0 2px 5px; gap: 8px; }
  #ui .cci-atlas-ico { width: 26px; height: 26px; padding: 4px; }
  #ui .cci-atlas-title .cci-eyebrow { display: none; }
  #ui .cci-atlas-title b { font-size: 17px; }
  #ui .cci-atlas-foot { padding-top: 5px; gap: 10px; }
  /* a narrow sheet puts Cat Island's figure on a second line rather than cut it off */
  #ui .cci-map-xp { font-size: 12px; line-height: 1.6; white-space: normal; overflow: visible; }
  #ui .cci-atlas-leg:nth-child(3) { display: none; }
  /* (the figures may take two lines here, so the key only has to clear line one) */
  @container (max-width: 492px) { #ui .cci-atlas-leg:nth-child(2) { display: none; } }
  @container (max-width: 391px) { #ui .cci-atlas-legend { display: none; } }
}
@supports not (container-type: inline-size) {
  @media (max-width: 640px) { #ui .cci-atlas-legend { display: none; } }
}
/* a narrow desktop window: the objective card leaves the clock its corner
   (ui.js drops the banner column below the two) */
@media (max-width: 560px) {
  body:not(.cci-touch) #ui .cci-obj { max-width: calc(100vw - 150px); }
}
@media (max-width: 760px) {
  #ui .cci-hint { display: none !important; }
  #ui .cci-banner-title { font-size: 24px; white-space: normal; }
  #ui .cci-say-text { font-size: 15.5px; }
  #ui .cci-slot { width: 42px; height: 42px; padding: 6px; }
  #ui .cci-slot.held { width: 50px; height: 50px; padding: 7px; }
  #ui .cci-bar-name { display: none; }
}
`;
