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
export function injectFonts() {
  if (document.getElementById('cci-fonts')) return;
  const pre1 = document.createElement('link');
  pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
  const pre2 = document.createElement('link');
  pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous';
  const css = document.createElement('link');
  css.id = 'cci-fonts'; css.rel = 'stylesheet';
  css.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:ital,wght@0,600;0,700;0,900;1,700&display=swap';
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
#ui .cci-map { right: 20px; bottom: 18px; z-index: 12; padding: 7px; border-radius: 15px; }
#ui .cci-map canvas { display: block; border-radius: 9px; border: 2.5px solid var(--edge); }
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
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
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

#ui .cci-intro { z-index: 84; inset: 0; display: flex; align-items: center; justify-content: center; }
#ui .cci-intro-bg {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 58% 44% at 50% 44%, rgba(255,196,220,.46), rgba(255,175,205,0) 72%),
    linear-gradient(165deg, #1e0e28 0%, #4b1a3e 42%, #8d2551 72%, #c9527e 100%);
}
#ui .cci-intro-bg::after {
  content: ''; position: absolute; inset: 0; opacity: .5;
  background-image:
    radial-gradient(circle, rgba(255,255,255,.9) 1.4px, transparent 1.6px),
    radial-gradient(circle, rgba(255,201,74,.85) 1.6px, transparent 1.8px),
    radial-gradient(circle, rgba(127,227,192,.8) 1.3px, transparent 1.5px);
  background-size: 137px 121px, 191px 163px, 223px 197px;
  background-position: 11px 23px, 71px 5px, 33px 88px;
}
#ui .cci-intro-stripe {
  position: absolute; left: 0; right: 0; top: 0; height: 12px;
  background: repeating-linear-gradient(115deg, var(--pink) 0 20px, #fff6fa 20px 40px);
  border-bottom: 3px solid var(--edge);
}
#ui .cci-intro-stripe.b { top: auto; bottom: 0; border-bottom: 0; border-top: 3px solid var(--edge);
  background: repeating-linear-gradient(115deg, var(--teal) 0 20px, #fff6ec 20px 40px); }
#ui .cci-intro-in { position: relative; text-align: center; padding: 0 24px; }
#ui .cci-intro-ico { display: flex; justify-content: center; gap: 22px; }
#ui .cci-intro-ico span { width: 40px; height: 40px; filter: drop-shadow(0 4px 8px rgba(0,0,0,.5)); }
#ui .cci-intro-ico span:nth-child(1) { color: #ff8fb4; }
#ui .cci-intro-ico span:nth-child(2) { color: #ffe0a8; transform: translateY(-5px) scale(1.12); }
#ui .cci-intro-ico span:nth-child(3) { color: #8fe6c8; }
#ui .cci-intro h1 {
  margin: 16px 0 0; font: 800 clamp(44px, 8.4vw, 104px)/.98 var(--fdisp);
  color: #fff6e2; -webkit-text-stroke: 7px #24122c; paint-order: stroke fill;
  text-shadow: 0 8px 0 rgba(36,18,44,.6), 0 18px 44px rgba(0,0,0,.6);
}
#ui .cci-intro h1 .amp { color: var(--gold); font-size: .62em; display: block; margin: 2px 0; -webkit-text-stroke-width: 5px; }
#ui .cci-intro h1 .cat { color: #8fe6c8; }
#ui .cci-intro .sub {
  margin: 22px auto 0; max-width: 30ch;
  font: 700 clamp(15px, 1.6vw, 21px)/1.35 var(--fbody); font-style: italic; color: #ffe6d2;
  text-shadow: 0 2px 0 rgba(36,18,44,.75), 0 6px 18px rgba(0,0,0,.6);
}
#ui .cci-intro .press {
  margin-top: 36px; display: inline-block; padding: 9px 20px 10px; border-radius: 999px;
  background: rgba(20,8,26,.55); border: 2.5px solid rgba(255,238,216,.7);
  font: 800 12px/1 var(--fbody); letter-spacing: .2em; text-transform: uppercase; color: #ffeed8;
  animation: cci-pulse 1.6s ease-in-out infinite;
}
@keyframes cci-pulse { 0%,100% { opacity: .55; transform: translateY(0) } 50% { opacity: 1; transform: translateY(-3px) } }

@media (max-width: 760px) {
  #ui .cci-map, #ui .cci-hint { display: none !important; }
  #ui .cci-banner-title { font-size: 24px; white-space: normal; }
  #ui .cci-say-text { font-size: 15.5px; }
  #ui .cci-slot { width: 42px; height: 42px; padding: 6px; }
  #ui .cci-slot.held { width: 50px; height: 50px; padding: 7px; }
  #ui .cci-bar-name { display: none; }
}
`;
