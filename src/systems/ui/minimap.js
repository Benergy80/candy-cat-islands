// ─────────────────────────────────────────────────────────────────────────────
// MINIMAP — a TOWN map, not a green field — and the EXPLORED ATLAS.
//   • NEAR mode (default, 'local'): 120 world units across, centred on the
//     player (widens to 240 while ctx.state.flying, so the flyer can navigate).
//   • WORLD mode: the whole archipelago on a wider corner plate.
//   • HISTORY mode ('world + history', the third M press): NOT the corner plate.
//     A big centred sheet — the ATLAS — about three quarters of the screen, over
//     a soft scrim. Land you have never been to is blank parchment under cloud;
//     land you HAVE walked is painted in full island colour, cut out of the
//     cloud with a white rim and an ink hairline; your route is a thick
//     red-and-white dashed line that runs through the gold-ringed places you
//     have visited (named on the sheet) and ends at your arrow. The footer reads
//     'Explored: Candyland 37% · Cat Island 12%'. It does not dim at night: it is
//     a sheet of paper you are reading, not a window onto the world.
//   M (or a TAP on either sheet) cycles near → world → atlas → off; when off, a
//   small MAP chip sits in the corner so a phone can tap it back on.
//   • CAVE mode: automatic on the corner plate. Underground the chart is
//     useless, so the plate draws the corridor itself from
//     ctx.systems.escape.routes.cave.waypoints.
//
// EXPLORATION HISTORY (Contract G): a 2-D coverage grid (cell 3 u) over both
// islands, marked within 12 u of the player (30 u while flying) once a second.
// It lives in a Uint8Array, and on the atlas it is drawn as a union of cell
// discs (crisp, gently scalloped edge) — interior cells as merged row runs.
// Persisted to localStorage ('cci.explored.v1') every 5 s and on pagehide;
// resetHistory() wipes it.
//
// MAP MARKERS: other systems pin things to the chart with
// ui.addMapMarker({ id, x, z, glyph, label }) — glyphs key · winch · star ·
// ammo · weapon · plane · thermal (anything else is a plain dot). Quest markers
// (key, winch) are pulsing, LABELLED pins on every map mode and ride the rim of
// the near map when off-frame; the numerous ones (stars, ammo) collapse to dots
// on the wide maps so thirty ammo caches never bury the town. On the atlas,
// weapons / ammo / stars show only where you have already been (it is a record
// of your trip, not a spoiler); quest pins, planes and thermals always show.
//
// LEGIBILITY RULES (near map): the one label is tied to its pin by a leader
// line and is placed in whichever of eight slots overlaps the fewest pins, the
// player arrow and the compass; pins whose head would sit under the player
// arrow LEAN away from it (the foot stays on the spot); landmark discs that
// would sit under the arrow step aside on a short leader.
//
// The chart is baked ONCE into an offscreen canvas (1.6 px per world unit,
// transparent where there is sea) and blitted per frame. Baked in, bottom to
// top: a sand halo + ink coastline, the land with height relief, the syrup
// river, the chocolate lake, a TREELINE stipple over the wild ground, the
// STREET bands (a light band the real width of each path, plus plaza aprons),
// and then — at world:ready, once every builder has registered its walls —
// BUILDING FOOTPRINTS: every box collider and every architecture interior,
// unioned, holes flood-filled, stamped as darker blocks.
//
// The streets are kept as their own layer twice over (cream for day, moonlit
// blue for night) so the night pass can dim the land and then put the roads
// BACK ON TOP: at 23:00 the town still has a street plan instead of one flat
// blue wash.
// ─────────────────────────────────────────────────────────────────────────────
import { POI_PATHS, icon } from './glyphs.js';

const X0 = -305, X1 = 305, Z0 = -125, Z1 = 125;  // charted world
const PPU = 1.6;                                  // chart pixels per world unit
const SPAN_LOCAL = 120;                           // world units across in near mode
const SPAN_FLY = 240;                             // …and while airborne
const SPAN_CAVE = 150;                            // world units across underground
const INK = '#2b2442';
const TAU = Math.PI * 2;

// Corner-plate sizes per mode (css px) before they are fitted to the viewport,
// and the share of the viewport each may take ([width, height]). The near map
// is the one the art director signed off: its size never changes on a desktop.
const SIZE = { local: [196, 118], world: [300, 138] };
const FIT = { local: [0.27, 0.31], world: [0.4, 0.36] };

// ── the ATLAS (history mode) ────────────────────────────────────────────────
const AX0 = -300, AX1 = 300, AZ0 = -116, AZ1 = 116;          // its window on the world
const A_ASPECT = (AX1 - AX0) / (AZ1 - AZ0);
const A_DPR = 1.5;                                          // backing-store cap (memory on phones)
const ROUTE_RED = '#e21f55';
const PARCH = '#f8efd8';
const DASH = [8, 6], NODASH = [];
const RIM8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7]];
// oldest → newest third of the route: always opaque (it has to read on pink,
// green and cream), older thirds a deeper, duskier red and a hair thinner
const ROUTE_RED3 = ['#a8466a', '#c9305f', ROUTE_RED];
const ROUTE_W3 = [0.82, 0.92, 1];

// ── exploration history ─────────────────────────────────────────────────────
const CELL = 3;                                             // world units per cell
const GX = Math.ceil((X1 - X0) / CELL), GZ = Math.ceil((Z1 - Z0) / CELL);
const R_WALK = 12, R_FLY = 30;                              // reveal radius
const TRAIL_MAX = 800;                                      // samples kept
const TRAIL_STEP = 4;                                       // world units between samples
const TRAIL_BREAK = 16;                                     // a jump bigger than this is a teleport, not a walk
const STORE_KEY = 'cci.explored.v1';
const SAVE_EVERY = 5;                                       // seconds

// ── markers ─────────────────────────────────────────────────────────────────
// tier 2 = quest (always a pin, pulses, rides the rim, carries its label),
// 1 = notable (pin up close), 0 = numerous (pin only among the nearest few on
// the near map; a dot everywhere else).
const MARK = {
  key:    { fill: '#ffc94a', tier: 2 },
  winch:  { fill: '#f39a4c', tier: 2 },
  weapon: { fill: '#8fe6c8', tier: 1 },
  plane:  { fill: '#a9d6ff', tier: 1, always: true },
  thermal: { fill: '#ffb987', tier: 1, always: true },     // the flyer's lift columns
  star:   { fill: '#fff07a', tier: 0 },
  ammo:   { fill: '#ff9cbc', tier: 0 },
};
const MARK_DOT = { fill: '#ef4f84', tier: 0, dot: true };   // unknown glyph → a plain dot
const MAX_PINS = 5;                                         // near map: pins at once (the rest are dots)
const MAX_SMALL_PINS = 2;                                   // …of which tier-0 (ammo, stars)
const CLEAR_PLAYER = 28;                                    // px a landmark disc keeps from the arrow
const LEANS = [0, 0.5, 0.9, 1.3, 2.2, Math.PI];             // pin lean ladder (rad), tried in order

// Label slots around an anchor: right, left, above, below, then the diagonals.
const LDIR = [[1, 0], [-1, 0], [0, -1], [0, 1], [0.8, -0.7], [-0.8, -0.7], [0.8, 0.7], [-0.8, 0.7]];
const LABEL_FONT = '900 8.5px "Nunito", "Trebuchet MS", sans-serif';
const ALABEL_FONT = '900 10.5px "Nunito", "Trebuchet MS", sans-serif';
const PLACE_FONT = '900 11px "Nunito", "Trebuchet MS", sans-serif';
const PLACE_FONT_S = '900 10px "Nunito", "Trebuchet MS", sans-serif';     // compact sheets (phones)

// Pictogram POIs (everything else is a plain dot) — enough to navigate by, few
// enough that the ~20px glyph discs never tile over the land.
const POI = {
  candy_dock: 'ferry', candy_village: 'home', giant_cupcake: 'cup', frosting_peak: 'peak',
  chocolate_lake: 'drop', gummy_forest: 'tree', lollipop_meadow: 'lolli', sour_shrine: 'q',
  candy_palace: 'tower',
  cat_dock: 'ferry', main_street: 'home', meow_donalds: 'cup', town_square: 'paw',
  cat_gym: 'gym', lighthouse: 'tower', escape_beach: 'exit', fish_harbor: 'fish',
  cat_park: 'tree',
};
// The island keeps its colour in the marker: a pink-cream disc on Candyland, a
// mint one on Cat Island, so a glance says which half of the world you are in.
const TINT = {
  candy: { disc: '#ffe9f2', ring: '#cf4680' },
  cat: { disc: '#e7f4e7', ring: '#1d7f7a' },
};
// A visited landmark on the atlas wears a gold ring: lit, like a lamp.
const TINT_LIT = {
  candy: { disc: '#fff6d8', ring: '#e8a91c' },
  cat: { disc: '#fff6d8', ring: '#e8a91c' },
};
// Paved open ground that is not a path: the aprons the streets run into. Kept
// small — a big perfect circle on a hand-drawn chart reads as a roundabout.
const PLAZAS = { welcome_plaza: 7, town_square: 8.5, candy_village: 6.5, fish_harbor: 6, cat_dock: 5, candy_dock: 5 };
// Built-up ground: no canopy stipple in here, the buildings own it.
const TOWNS = [
  ['main_street', 32], ['town_square', 24], ['welcome_plaza', 18], ['meow_donalds', 17],
  ['residential', 34], ['fish_harbor', 20], ['cat_gym', 17], ['cat_dock', 14],
  ['candy_village', 32], ['candy_dock', 14], ['candy_palace', 24], ['lighthouse', 10],
];
// At most this many pictogram markers on the chart at once: past three, a
// 196x118 map is a sheet of discs with a town hidden underneath.
const MAX_GLYPHS = 3;

const PATH_CACHE = {};
function poiPath(name) { return (PATH_CACHE[name] ||= new Path2D(POI_PATHS[name] || POI_PATHS.star)); }

/** Deterministic little LCG — the treeline must be identical in every render. */
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Marker sort: most important first, then nearest. (Module-level: no per-frame closure.) */
function byPriority(a, b) { return (b.style.tier - a.style.tier) || (a._d - b._d); }

/** A context back to its defaults (the atlas stages share scratch canvases). */
function reset(c2) {
  c2.setTransform(1, 0, 0, 1, 0, 0);
  c2.globalCompositeOperation = 'source-over'; c2.globalAlpha = 1;
  c2.imageSmoothingEnabled = true; c2.setLineDash(NODASH);
}

/**
 * @param ctx   the game context
 * @param opts  { visited: Set<landmarkId> (shared with ui.js), onTap: () => void }
 */
export function createMinimap(ctx, opts = {}) {
  const world = ctx.world;
  const dpr = Math.min(2, ctx.shot ? 1 : (window.devicePixelRatio || 1));
  const visited = opts.visited instanceof Set ? opts.visited : new Set();
  const onTap = typeof opts.onTap === 'function' ? opts.onTap : null;
  const PROF = ctx.params?.get?.('mapprof') === '1';          // ?mapprof=1 logs atlas stage timings

  let W = SIZE.local[0], H = SIZE.local[1];
  // The surface the drawing helpers are currently painting (the corner plate
  // or one of the atlas canvases), and its size in css px.
  let SW = W, SH = H;

  const el = document.createElement('div');
  el.className = 'cci cci-plate cci-map cci-hit';
  el.dataset.mode = 'local';
  el.title = 'Map: tap or press M';
  // The footer names WHERE YOU ARE; the three pips on the right are the M
  // cycle, and say the plate is a button.
  el.innerHTML = '<canvas></canvas><div class="cci-map-foot">'
    + '<span class="cci-map-pin"></span><span class="cci-map-here"></span>'
    + '<span class="cci-map-modes"><i></i><i></i><i></i></span></div>';
  const hereEl = el.querySelector('.cci-map-here');
  const footEl = el.querySelector('.cci-map-foot');
  const cv = el.querySelector('canvas');
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const pg = cv.getContext('2d');
  let g = pg;

  // Off-state chip: a hidden map cannot be tapped, so this is how a phone gets it back.
  const chip = document.createElement('div');
  chip.className = 'cci cci-plate cci-mapchip cci-hit';
  chip.title = 'Map: tap or press M';
  chip.innerHTML = `<span class="cci-mapchip-ico">${icon('map', { w: 2.3 })}</span><span class="cci-key">M</span><em>map</em>`;

  // The ATLAS: a full-screen layer (scrim) holding one centred sheet. Four
  // stacked canvases, bottom to top: GROUND (chart, fog, explored land, lamp
  // glows — rebuilt only when coverage changes, and then only in the dirty
  // rectangle), ROUTE (every frame: the dashes march), PLACES (the lit discs
  // and their names — rebuilt when a place is lit), LIVE (pins, ferry, the
  // name of where you are, you).
  const atlas = document.createElement('div');
  atlas.className = 'cci cci-atlas';
  atlas.style.display = 'none';
  atlas.innerHTML = '<div class="cci-atlas-scrim"></div>'
    + '<div class="cci-atlas-plate cci-plate cci-hit" title="Map: tap or press M to close">'
    + '<div class="cci-atlas-head">'
    + `<span class="cci-atlas-ico">${icon('map', { w: 2.2 })}</span>`
    + '<span class="cci-atlas-title"><span class="cci-eyebrow">Explored map</span><b>Where you’ve been</b></span>'
    + '<span class="cci-atlas-close"><span class="cci-key">M</span><em class="k">close</em><em class="t">tap to close</em></span>'
    + '</div>'
    + '<div class="cci-atlas-chart"><canvas class="st"></canvas><canvas class="rt"></canvas><canvas class="pl"></canvas><canvas class="dy"></canvas></div>'
    + '<div class="cci-atlas-foot">'
    + '<span class="cci-map-xp"><span class="cci-map-xp-lab">Explored:</span> '
    + '<span class="cci-map-xp-isl c">Candyland 0%</span> · <span class="cci-map-xp-isl k">Cat Island 0%</span></span>'
    + '<span class="cci-atlas-legend">'
    + '<span class="cci-atlas-leg"><i class="lg-place"></i><em>places <b class="cci-atlas-n">0</b>/<b class="cci-atlas-t">0</b></em></span>'
    + '<span class="cci-atlas-leg"><i class="lg-route"></i><em>your route</em></span>'
    + '<span class="cci-atlas-leg"><i class="lg-fog"></i><em>not yet explored</em></span>'
    + '</span>'
    + '<span class="cci-map-modes"><i></i><i></i><i></i></span>'
    + '</div></div>';
  const aPlate = atlas.querySelector('.cci-atlas-plate');
  const aScrim = atlas.querySelector('.cci-atlas-scrim');
  const aSt = atlas.querySelector('canvas.st'), aRt = atlas.querySelector('canvas.rt');
  const aPl = atlas.querySelector('canvas.pl'), aDy = atlas.querySelector('canvas.dy');
  const sg = aSt.getContext('2d'), rg = aRt.getContext('2d'), lg = aPl.getContext('2d'), ag = aDy.getContext('2d');
  const xpC = atlas.querySelector('.cci-map-xp-isl.c');
  const xpK = atlas.querySelector('.cci-map-xp-isl.k');
  const aN = atlas.querySelector('.cci-atlas-n'), aT = atlas.querySelector('.cci-atlas-t');
  let placesTotal = 0;
  for (const id in world.LANDMARKS) if (world.LANDMARKS[id].label !== '???') placesTotal++;
  aT.textContent = String(placesTotal);

  // ── taps (pointer events: they still fire when a touch layer preventDefaults touchstart)
  function tappable(node) {
    let down = null;
    node.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    });
    node.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      const d = down; down = null;
      if (!d || d.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 18 && performance.now() - d.t < 900) onTap?.();
    });
    node.addEventListener('pointercancel', () => { down = null; });
    node.addEventListener('click', (e) => e.stopPropagation());
  }
  tappable(el); tappable(chip); tappable(aPlate);

  // ── static chart, built once ───────────────────────────────────────────────
  const BW = Math.round((X1 - X0) * PPU), BH = Math.round((Z1 - Z0) * PPU);
  const cx2 = (x) => (x - X0) * PPU, cz2 = (z) => (z - Z0) * PPU;
  const mkCanvas = (w = BW, h = BH) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  /** A silhouette of `src` painted in one flat colour (used for tints/haloes). */
  function tintOf(src, color) {
    const c = mkCanvas(), q = c.getContext('2d');
    q.drawImage(src, 0, 0);
    q.globalCompositeOperation = 'source-in';
    q.fillStyle = color; q.fillRect(0, 0, BW, BH);
    return c;
  }

  const base = mkCanvas();
  const roadMask = mkCanvas();
  buildRoads(roadMask.getContext('2d'));
  const roadDay = tintOf(roadMask, 'rgba(255,244,222,.95)');
  const roadCase = tintOf(roadMask, 'rgba(64,44,78,.5)');
  const roadNight = tintOf(roadMask, '#a8c2fb');
  buildChart(base.getContext('2d'));
  let structVer = 0;                                  // bumps when footprints are stamped

  /** The street layer: one band per path at its real width, plus plaza aprons. */
  function buildRoads(rc) {
    rc.lineJoin = 'round'; rc.lineCap = 'round';
    rc.strokeStyle = '#fff'; rc.fillStyle = '#fff';
    for (const p of world.PATHS) {
      rc.lineWidth = Math.max(2.8, p.width * PPU);
      rc.beginPath();
      rc.moveTo(cx2(p.points[0][0]), cz2(p.points[0][1]));
      for (let i = 1; i < p.points.length; i++) rc.lineTo(cx2(p.points[i][0]), cz2(p.points[i][1]));
      rc.stroke();
    }
    for (const id in PLAZAS) {
      const lm = world.LANDMARKS[id];
      if (!lm) continue;
      rc.beginPath(); rc.arc(cx2(lm.x), cz2(lm.z), PLAZAS[id] * PPU, 0, TAU); rc.fill();
    }
  }

  /** Streets over whatever is already on `bg` (day ink + cream band). */
  function stampRoads(bg) {
    bg.globalAlpha = 0.55;
    for (const [dx, dy] of [[-1.4, 0], [1.4, 0], [0, -1.4], [0, 1.4]]) bg.drawImage(roadCase, dx, dy);
    bg.globalAlpha = 1;
    bg.drawImage(roadDay, 0, 0);
  }

  function buildChart(bg) {
    // 1. land, sampled from the real mask (transparent where sea)
    const SS = 3;
    const cw = Math.ceil(BW / SS), ch = Math.ceil(BH / SS);
    const off = document.createElement('canvas'); off.width = cw; off.height = ch;
    const oc = off.getContext('2d');
    const img = oc.createImageData(cw, ch); const d = img.data;
    for (let j = 0; j < ch; j++) {
      const z = Z0 + (j * SS + SS / 2) / PPU;
      for (let i = 0; i < cw; i++) {
        const x = X0 + (i * SS + SS / 2) / PPU;
        const isl = x < 0 ? 'candy' : 'cat';
        const m = world.islandMask(x, z, isl);
        if (m <= 0.04) continue;
        const k = (j * cw + i) * 4;
        let r, gg, b;
        if (m < 0.28) { r = 246; gg = 221; b = 168; }            // beach
        else if (isl === 'candy') { const t = Math.min(1, (m - .28) / .72); r = 255; gg = 224 - t * 24; b = 231 - t * 20; }
        else { const t = Math.min(1, (m - .28) / .72); r = 174 - t * 30; gg = 206 - t * 26; b = 126 - t * 18; }
        // Relief: high ground pales, low ground deepens. Without this the local
        // view is one flat wash of island colour and reads as nothing.
        const sh = Math.max(-1, Math.min(1, (world.height(x, z) - 5.5) / 9));
        if (sh > 0) { const t2 = sh * 0.34; r += (255 - r) * t2; gg += (255 - gg) * t2; b += (255 - b) * t2; }
        else { const kk = 1 + sh * 0.24; r *= kk; gg *= kk; b *= kk; }
        d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255;
      }
    }
    oc.putImageData(img, 0, 0);
    bg.imageSmoothingEnabled = true;
    bg.drawImage(off, 0, 0, cw, ch, 0, 0, BW, BH);

    // 1b. coastline — the land silhouette stamped UNDER itself: ink first (the
    //     shore line), then a wider sand halo under that (the surf), so the
    //     islands have a readable edge instead of fading into the sea gradient.
    const sil = mkCanvas();
    const sc = sil.getContext('2d');
    sc.imageSmoothingEnabled = true;
    sc.drawImage(off, 0, 0, cw, ch, 0, 0, BW, BH);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = 'rgba(35,28,58,.85)'; sc.fillRect(0, 0, BW, BH);
    const surf = tintOf(sil, 'rgba(248,226,180,.85)');
    bg.globalCompositeOperation = 'destination-over';
    for (const [dx, dy] of [[-1.9, 0], [1.9, 0], [0, -1.9], [0, 1.9], [-1.3, -1.3], [1.3, 1.3], [-1.3, 1.3], [1.3, -1.3]]) bg.drawImage(sil, dx, dy);
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, 3], [-3, 3], [3, -3]]) bg.drawImage(surf, dx, dy);
    bg.globalCompositeOperation = 'source-over';

    bg.lineJoin = 'round'; bg.lineCap = 'round';

    // 2. syrup river — thin, muted, and clipped to land so it cannot overshoot
    //    the coastline (it used to be drawn as one long magenta diagonal).
    bg.strokeStyle = 'rgba(206,96,138,.7)'; bg.lineWidth = 2.6;
    const rp = world.RIVER.points;
    for (let i = 0; i < rp.length - 1; i++) {
      const [ax, az] = rp[i], [bx, bz] = rp[i + 1];
      const STEP = 6;
      for (let s = 0; s < STEP; s++) {
        const t0 = s / STEP, t1 = (s + 1) / STEP;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
        const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        if (world.islandMask(x0, z0, 'candy') < 0.14 || world.islandMask(x1, z1, 'candy') < 0.14) continue;
        bg.beginPath(); bg.moveTo(cx2(x0), cz2(z0)); bg.lineTo(cx2(x1), cz2(z1)); bg.stroke();
      }
    }

    // 3. chocolate lake
    bg.fillStyle = '#6b3a22';
    bg.beginPath();
    bg.ellipse(cx2(world.LAKE.x), cz2(world.LAKE.z), world.LAKE.r * PPU, world.LAKE.r * PPU, 0, 0, TAU);
    bg.fill();

    // 4. TREELINE — the wild ground gets a stipple of canopy dots, so "forest"
    //    and "open ground" are different textures and the edge between them
    //    reads as a treeline. Seeded: identical in every screenshot.
    stippleTrees(bg);

    // 5. streets on top of the land
    stampRoads(bg);

    // 6. ferry lane
    bg.setLineDash([5, 5]); bg.lineWidth = 2; bg.strokeStyle = 'rgba(255,255,255,.8)';
    bg.beginPath();
    bg.moveTo(cx2(world.FERRY_ROUTE.from[0]), cz2(world.FERRY_ROUTE.from[1]));
    bg.lineTo(cx2(world.FERRY_ROUTE.to[0]), cz2(world.FERRY_ROUTE.to[1]));
    bg.stroke(); bg.setLineDash([]);
  }

  function stippleTrees(bg) {
    const rnd = lcg(0x5eed1e);
    const STEP = 4.6;
    const lake = world.LAKE;
    const towns = TOWNS.map(([id, r]) => ({ lm: world.LANDMARKS[id], r })).filter((t) => t.lm);
    for (const id in world.ISLANDS) {
      const isl = world.ISLANDS[id];
      const c = isl.center, R = isl.radius;
      const canopy = id === 'candy' ? '#a4638d' : '#63803f';
      const shade = id === 'candy' ? 'rgba(84,34,66,.45)' : 'rgba(38,52,24,.45)';
      for (let z = c.z - R; z <= c.z + R; z += STEP) {
        for (let x = c.x - R; x <= c.x + R; x += STEP) {
          const jx = x + (rnd() - 0.5) * STEP * 1.5, jz = z + (rnd() - 0.5) * STEP * 1.5;
          const keep = rnd();
          const m = world.islandMask(jx, jz, id);
          if (m < 0.44) continue;                              // beach + sea
          if (world.height(jx, jz) < 1.2) continue;
          if (world.onPath(jx, jz, 3.4)) continue;             // leave the streets clear
          if (id === 'candy' && world.riverDist(jx, jz) < world.RIVER.width * 0.5 + 2) continue;
          if (Math.hypot(jx - lake.x, jz - lake.z) < lake.r + 1.5) continue;
          let built = false;
          for (const t of towns) if (Math.hypot(jx - t.lm.x, jz - t.lm.z) < t.r) { built = true; break; }
          if (built) continue;                                 // the town is not woodland
          // Density thins towards the shore: a wood, not a lawn of dots.
          if (keep > 0.2 + Math.min(1, (m - 0.44) / 0.4) * 0.4) continue;
          const rr = (0.6 + rnd() * 0.55) * PPU;
          bg.beginPath(); bg.arc(cx2(jx), cz2(jz) + 0.8, rr, 0, TAU);
          bg.fillStyle = shade; bg.fill();
          bg.beginPath(); bg.arc(cx2(jx), cz2(jz), rr, 0, TAU);
          bg.fillStyle = canopy; bg.fill();
        }
      }
    }
  }

  // ── building footprints (baked at world:ready) ──────────────────────────────
  // Sources, in order of trust: the architecture systems' `interiors` rectangles
  // (the enterable rooms), and every oriented BOX collider big enough to be a
  // wall rather than a bench. Walls come as four thin boxes around a hollow
  // middle, so the union is flood-filled before it is stamped: a house becomes
  // a block, not a ring.
  let structDone = false;
  function bakeStructures() {
    if (structDone) return;
    structDone = true;
    const rects = [];
    const push = (x, z, w, d, rot) => {
      if (!(w > 0) || !(d > 0)) return;
      if (x < X0 - 20 || x > X1 + 20 || z < Z0 - 20 || z > Z1 + 20) return;   // cave/palace dioramas
      rects.push({ x, z, w, d, rot });
    };
    let nRoom = 0, nWall = 0;
    for (const name of ['catArchitecture', 'candyArchitecture']) {
      const list = ctx.systems?.[name]?.interiors;
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        if (!r || typeof r.x !== 'number') continue;
        const w = r.w || (r.radius ? r.radius * 2 : 0);
        const d = r.d || (r.radius ? r.radius * 2 : 0);
        // interiors use lx = dx·cos − dz·sin (the inverse of the collider
        // convention), hence the negated angle here
        push(r.x, r.z, w + 1.3, d + 1.3, -(r.rot || 0));
        nRoom++;
      }
    }
    for (const c of ctx.colliders || []) {
      if (!c || !c.box) continue;
      const w = c.w || 0, d = c.d || 0;
      if (Math.max(w, d) < 2.4 || w * d < 2.2) continue;       // a bench is not a building
      push(c.x, c.z, w + 1.2, d + 1.2, c.rot || 0);
      nWall++;
    }
    if (!rects.length) return;

    const m = mkCanvas();
    const mc = m.getContext('2d', { willReadFrequently: true });
    mc.fillStyle = '#fff';
    for (const r of rects) {
      mc.save();
      mc.translate(cx2(r.x), cz2(r.z));
      mc.rotate(r.rot);
      mc.fillRect(-r.w * PPU / 2, -r.d * PPU / 2, r.w * PPU, r.d * PPU);
      mc.restore();
    }
    const holes = fillHoles(mc);

    const body = tintOf(m, 'rgba(74,56,104,1)');
    const bg = base.getContext('2d');
    bg.globalAlpha = 0.26;                                    // the block's own shadow
    bg.drawImage(body, 0.9, 1.8);
    bg.globalAlpha = 0.2;                                     // a hair of edge
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) bg.drawImage(body, dx, dy);
    bg.globalAlpha = 0.6;
    bg.drawImage(body, 0, 0);
    bg.globalAlpha = 1;
    stampRoads(bg);                                           // streets stay on top
    structVer++;
    console.warn('[ui/minimap]', JSON.stringify({ rooms: nRoom, wallBoxes: nWall, rects: rects.length, holesFilled: holes }));
  }

  /** Flood the background in from the border; anything unreached is inside. */
  function fillHoles(c2) {
    const img = c2.getImageData(0, 0, BW, BH), d = img.data;
    const N = BW * BH;
    const open = new Uint8Array(N);
    const stack = new Int32Array(N);
    let sp = 0;
    const put = (i) => { if (!open[i] && d[i * 4 + 3] < 128) { open[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < BW; x++) { put(x); put((BH - 1) * BW + x); }
    for (let y = 0; y < BH; y++) { put(y * BW); put(y * BW + BW - 1); }
    while (sp > 0) {
      const i = stack[--sp], x = i % BW, y = (i / BW) | 0;
      if (x > 0) put(i - 1);
      if (x < BW - 1) put(i + 1);
      if (y > 0) put(i - BW);
      if (y < BH - 1) put(i + BW);
    }
    let holes = 0;
    for (let i = 0; i < N; i++) {
      if (open[i] || d[i * 4 + 3] >= 128) continue;
      const k = i * 4; d[k] = 255; d[k + 1] = 255; d[k + 2] = 255; d[k + 3] = 255; holes++;
    }
    c2.putImageData(img, 0, 0);
    return holes;
  }
  ctx.events.on('world:ready', bakeStructures);

  // ── exploration history: the coverage grid ─────────────────────────────────
  const cov = new Uint8Array(GX * GZ);
  const land = new Uint8Array(GX * GZ);              // 0 sea · 1 Candyland · 2 Cat Island
  const landTotal = [0, 0, 0], landSeen = [0, 0, 0];
  for (let j = 0; j < GZ; j++) {
    const z = Z0 + (j + 0.5) * CELL;
    for (let i = 0; i < GX; i++) {
      const x = X0 + (i + 0.5) * CELL;
      const isl = x < 0 ? 'candy' : 'cat';
      if (world.islandMask(x, z, isl) > 0.12) { const k = isl === 'candy' ? 1 : 2; land[j * GX + i] = k; landTotal[k]++; }
    }
  }
  let covVer = 0, dirty = false, markT = 0, saveT = SAVE_EVERY, visitedN = -1;
  // World-space box of cells newly explored since the atlas last redrew them.
  const dBox = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  const dirtyAll = () => { dBox.x0 = X0; dBox.z0 = Z0; dBox.x1 = X1; dBox.z1 = Z1; };

  /** Mark every cell whose centre is within r of (x, z). Returns cells newly seen. */
  function mark(x, z, r) {
    const i0 = Math.max(0, Math.floor((x - r - X0) / CELL)), i1 = Math.min(GX - 1, Math.floor((x + r - X0) / CELL));
    const j0 = Math.max(0, Math.floor((z - r - Z0) / CELL)), j1 = Math.min(GZ - 1, Math.floor((z + r - Z0) / CELL));
    if (i0 > i1 || j0 > j1) return 0;
    const r2 = r * r;
    let n = 0;
    for (let j = j0; j <= j1; j++) {
      const dz = Z0 + (j + 0.5) * CELL - z;
      for (let i = i0; i <= i1; i++) {
        const dx = X0 + (i + 0.5) * CELL - x;
        if (dx * dx + dz * dz > r2) continue;
        const k = j * GX + i;
        if (cov[k]) continue;
        cov[k] = 1; landSeen[land[k]]++; n++;
      }
    }
    if (n) {
      covVer++; dirty = true;
      if (x - r < dBox.x0) dBox.x0 = x - r;
      if (x + r > dBox.x1) dBox.x1 = x + r;
      if (z - r < dBox.z0) dBox.z0 = z - r;
      if (z + r > dBox.z1) dBox.z1 = z + r;
    }
    return n;
  }
  /** Have you been to the cell under (x, z)? */
  function seenAt(x, z) {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    return i >= 0 && i < GX && j >= 0 && j < GZ && cov[j * GX + i] === 1;
  }

  // ── exploration history: the trail (ring buffer, oldest → newest) ──────────
  const trail = new Float32Array(TRAIL_MAX * 2);
  let tHead = 0, tN = 0, lastTX = NaN, lastTZ = NaN;
  function pushTrail(x, z) {
    trail[tHead * 2] = x; trail[tHead * 2 + 1] = z;
    tHead = (tHead + 1) % TRAIL_MAX;
    if (tN < TRAIL_MAX) tN++;
    lastTX = x; lastTZ = z; dirty = true;
  }
  const trailIdx = (i) => (tHead - tN + i + TRAIL_MAX) % TRAIL_MAX;

  // ── persistence ────────────────────────────────────────────────────────────
  function save() {
    dirty = false;
    try {
      const bytes = new Uint8Array(Math.ceil(GX * GZ / 8));
      for (let k = 0; k < cov.length; k++) if (cov[k]) bytes[k >> 3] |= 1 << (k & 7);
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      const tr = new Array(tN * 2);
      for (let i = 0; i < tN; i++) { const q = trailIdx(i); tr[i * 2] = Math.round(trail[q * 2] * 2); tr[i * 2 + 1] = Math.round(trail[q * 2 + 1] * 2); }
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, gx: GX, gz: GZ, cell: CELL, cov: btoa(s), trail: tr, lm: [...visited] }));
    } catch { /* storage blocked (private mode, quota) — history just won't survive a reload */ }
  }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch { return false; }
    if (!raw) return false;
    try {
      const d = JSON.parse(raw);
      if (!d || d.v !== 1 || d.gx !== GX || d.gz !== GZ) return false;
      const s = atob(String(d.cov || ''));
      for (let k = 0; k < cov.length; k++) {
        if (!(s.charCodeAt(k >> 3) & (1 << (k & 7)))) continue;
        cov[k] = 1; landSeen[land[k]]++;
      }
      const tr = Array.isArray(d.trail) ? d.trail : [];
      for (let i = 0; i + 1 < tr.length && i < TRAIL_MAX * 2; i += 2) {
        const x = Number(tr[i]) / 2, z = Number(tr[i + 1]) / 2;
        if (Number.isFinite(x) && Number.isFinite(z)) pushTrail(x, z);
      }
      if (Array.isArray(d.lm)) for (const id of d.lm) if (world.LANDMARKS[id]) visited.add(id);
      covVer++; dirty = false; dirtyAll();
      return true;
    } catch { return false; }
  }
  const restored = load();
  if (restored) console.warn('[ui/minimap] history restored', JSON.stringify({ cells: landSeen[1] + landSeen[2], trail: tN, landmarks: visited.size }));
  // Leaving the page (or backgrounding the tab on a phone) saves immediately.
  try {
    window.addEventListener('pagehide', () => { if (dirty) save(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) save(); });
  } catch { /* no window events in odd hosts */ }

  function resetHistory() {
    cov.fill(0); landSeen[0] = landSeen[1] = landSeen[2] = 0;
    covVer++; dirtyAll();
    tN = 0; tHead = 0; lastTX = NaN; lastTZ = NaN;
    visited.clear(); visitedN = -1;
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    dirty = false; markT = 0; saveT = SAVE_EVERY;
  }

  /** 'Explored' percentage for island 1 (Candyland) / 2 (Cat Island). */
  function pct(k) {
    if (!landTotal[k] || !landSeen[k]) return 0;
    return Math.max(1, Math.floor(100 * landSeen[k] / landTotal[k]));
  }
  let xpVer = -1, placesShown = -1;
  function updateFooter() {
    if (xpVer === covVer) return;
    xpVer = covVer;
    const c = pct(1), k = pct(2);
    xpC.textContent = `Candyland ${c}%`;
    xpK.textContent = `Cat Island ${k}%`;
    xpC.style.setProperty('--p', c + '%');
    xpK.style.setProperty('--p', k + '%');
  }

  // ── markers (other systems' pins) ──────────────────────────────────────────
  const markers = new Map();
  const mList = [];
  const mScratch = [];
  const pinX = new Float32Array(64), pinY = new Float32Array(64);

  function addMarker(spec) {
    if (Array.isArray(spec)) return spec.map(addMarker);     // several at once (views, bulk callers)
    if (!spec || spec.id == null) return null;
    const x = Number(spec.x), z = Number(spec.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const id = String(spec.id);
    const glyphName = String(spec.glyph || 'dot');
    const style = MARK[glyphName] || MARK_DOT;
    let m = markers.get(id);
    if (!m) {
      m = { id, x, z, glyph: glyphName, label: spec.label ? String(spec.label) : '', style, _x: 0, _y: 0, _d: 0, _in: false, _as: 0, _hx: 0, _hy: 0, _lean: 0, _ob: -1 };
      markers.set(id, m); mList.push(m);
    } else {
      // Moving markers (planes) call this every frame with the same id: update in place.
      m.x = x; m.z = z; m.glyph = glyphName; m.style = style;
      if (spec.label !== undefined) m.label = spec.label ? String(spec.label) : '';
    }
    return id;
  }
  function removeMarker(id) {
    const key = String(id);
    const m = markers.get(key);
    if (!m) return false;
    markers.delete(key);
    const i = mList.indexOf(m);
    if (i >= 0) mList.splice(i, 1);
    return true;
  }

  // ── label placement: obstacles, eight slots, a leader line back ─────────────
  const OB_MAX = 160;
  const OB = new Float32Array(4 * OB_MAX);
  const SOB = new Float32Array(4 * OB_MAX);          // the atlas's static obstacles (places + names)
  let nOb = 0, nSOB = 0;
  function obAdd(x0, y0, x1, y1) {
    if (nOb >= OB_MAX) return -1;
    const k = 4 * nOb; OB[k] = x0; OB[k + 1] = y0; OB[k + 2] = x1; OB[k + 3] = y1;
    return nOb++;
  }
  function obHit(x0, y0, x1, y1, skip) {
    let a = 0;
    for (let n = 0; n < nOb; n++) {
      if (n === skip) continue;
      const k = 4 * n;
      const ix = Math.min(x1, OB[k + 2]) - Math.max(x0, OB[k]);
      if (ix <= 0) continue;
      const iy = Math.min(y1, OB[k + 3]) - Math.max(y0, OB[k + 1]);
      if (iy > 0) a += ix * iy;
    }
    return a;
  }
  // The label being placed: text (truncated), box size, and where it went.
  const LB = { t: '', bw: 0, bh: 12.5, x: 0, y: 0, font: LABEL_FONT, side: 0, slot: -1 };
  const LCACHE = new Map();                          // font|text → { t, w }
  function measureLabel(text, font, maxW, bh) {
    const key = font + '|' + text;
    let m = LCACHE.get(key);
    if (!m) {
      g.font = font;
      let t = String(text), tw = g.measureText(t).width;
      if (tw > maxW) {
        while (tw > maxW && t.length > 4) { t = t.slice(0, -2); tw = g.measureText(t + '…').width; }
        t += '…';
      }
      m = { t, w: tw };
      if (LCACHE.size > 96) LCACHE.clear();
      LCACHE.set(key, m);
    }
    LB.t = m.t; LB.bw = m.w + (bh > 13 ? 4 : 10); LB.bh = bh; LB.font = font;
  }
  // Metrics measured before the web font arrived are wrong: forget them and
  // redraw the atlas names when any font finishes loading.
  try {
    document.fonts?.addEventListener?.('loadingdone', () => { LCACHE.clear(); aLitKey = ''; });
    for (const f of [LABEL_FONT, ALABEL_FONT, PLACE_FONT, PLACE_FONT_S]) document.fonts?.load?.(f)?.catch?.(() => {});
  } catch { /* no FontFaceSet: fallback fonts measure what they draw */ }
  /** Best of the eight slots around a circle (ax, ay, ar). Returns its score. */
  function placeLabel(ax, ay, ar, skip = -1, prefer = -1) {
    const bw = LB.bw, bh = LB.bh;
    let best = Infinity, bx = ax, by = ay + ar + 4 + bh / 2;
    for (let gi = 0; gi < 2; gi++) {
      const gap = gi ? 13 : 3.5;
      for (let d = 0; d < LDIR.length; d++) {
        const dx = LDIR[d][0], dy = LDIR[d][1];
        const cx = ax + dx * (ar + gap) + Math.sign(dx) * bw / 2;
        const cy = ay + dy * (ar + gap) + Math.sign(dy) * bh / 2;
        const x0 = cx - bw / 2, y0 = cy - bh / 2, x1 = cx + bw / 2, y1 = cy + bh / 2;
        const out = (Math.max(0, 2 - x0) + Math.max(0, x1 - (SW - 2))) * bh + (Math.max(0, 2 - y0) + Math.max(0, y1 - (SH - 2))) * bw;
        const slot = gi * 8 + d;
        const sc = obHit(x0, y0, x1, y1, skip) + out * 4 + d * 1.5 + gi * 26 - (slot === prefer ? 30 : 0);
        if (sc < best) { best = sc; bx = cx; by = cy; LB.side = Math.sign(dx); LB.slot = slot; }
      }
    }
    LB.x = Math.max(2 + bw / 2, Math.min(SW - 2 - bw / 2, bx));
    LB.y = Math.max(2 + bh / 2, Math.min(SH - 2 - bh / 2, by));
    return best;
  }
  /** A leader from the anchor circle's rim to the nearest point of the label box. */
  function leader(ax, ay, ar) {
    const x0 = LB.x - LB.bw / 2, x1 = LB.x + LB.bw / 2, y0 = LB.y - LB.bh / 2, y1 = LB.y + LB.bh / 2;
    const qx = Math.max(x0, Math.min(x1, ax)), qy = Math.max(y0, Math.min(y1, ay));
    const dx = qx - ax, dy = qy - ay, d = Math.hypot(dx, dy);
    if (!(d > ar + 2.5)) return;
    const sx = ax + dx / d * ar, sy = ay + dy / d * ar;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(qx, qy);
    g.lineWidth = 3.6; g.strokeStyle = 'rgba(255,248,236,.92)'; g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke();
  }
  /** The cream label plate at LB. */
  function labelPlate(fill = 'rgba(255,248,236,.97)') {
    const bw = LB.bw, bh = LB.bh, bx = LB.x, by = LB.y;
    g.beginPath();
    if (g.roundRect) g.roundRect(bx - bw / 2, by - bh / 2, bw, bh, bh / 2.5);
    else g.rect(bx - bw / 2, by - bh / 2, bw, bh);
    g.fillStyle = fill; g.fill();
    g.lineWidth = 1.7; g.strokeStyle = INK; g.stroke();
    g.font = LB.font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = INK; g.fillText(LB.t, bx, by + 0.5);
  }

  // ── live layer ─────────────────────────────────────────────────────────────
  function ferryPos() {
    const f = ctx.state.ferry ?? ctx.systems.ferry?.position ?? null;
    if (!f) return null;
    if (typeof f.x === 'number' && typeof f.z === 'number') return f;
    const p = f.position || f.pos;
    if (p && typeof p.x === 'number') return { x: p.x, z: p.z };
    if (typeof f.t === 'number') {
      const a = world.FERRY_ROUTE.from, b = world.FERRY_ROUTE.to;
      const t = Math.abs(((f.t % 2) + 2) % 2 - 1);
      return { x: a[0] + (b[0] - a[0]) * (1 - t), z: a[1] + (b[1] - a[1]) * (1 - t) };
    }
    return null;
  }
  function drawFerry(x, y) {
    g.fillStyle = '#fff8ec'; g.strokeStyle = INK; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x - 5, y - 2.5); g.lineTo(x + 5, y - 2.5); g.lineTo(x + 3, y + 3); g.lineTo(x - 3, y + 3);
    g.closePath(); g.fill(); g.stroke();
  }

  /** A ~20px POI marker: island-tinted disc, ink pictogram. */
  function glyph(x, y, name, alpha, scale = 1, tint = TINT.candy) {
    const R = 10 * scale, S = 13 * scale;
    // The disc stays opaque whatever the marker's state — a half-transparent
    // disc just picks up the land colour and stops reading as a marker; it is
    // the PICTOGRAM that fades for somewhere you have not been yet.
    g.globalAlpha = 1;
    g.beginPath(); g.arc(x, y + 1.4, R, 0, TAU);
    g.fillStyle = 'rgba(30,22,48,.34)'; g.fill();
    g.beginPath(); g.arc(x, y, R, 0, TAU);
    g.fillStyle = tint.disc; g.fill();
    g.lineWidth = 2.4 * scale; g.strokeStyle = tint.ring; g.stroke();
    g.lineWidth = 1.1 * scale; g.strokeStyle = INK; g.stroke();
    g.globalAlpha = alpha;
    g.save();
    g.translate(x - S / 2, y - S / 2); g.scale(S / 24, S / 24);
    g.lineWidth = 3.4 / scale; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
    g.stroke(poiPath(name));
    g.restore();
    g.globalAlpha = 1;
  }

  /** The quiet marker: somewhere named that is not worth a badge right now. */
  function dot(x, y, seen, lm) {
    g.beginPath(); g.arc(x, y, seen ? 2.8 : 2.1, 0, TAU);
    g.fillStyle = seen ? (lm.island === 'candy' ? '#ef3f7c' : '#17706b') : 'rgba(255,252,245,.6)';
    g.fill();
    g.lineWidth = seen ? 1.3 : 0.9; g.strokeStyle = seen ? INK : 'rgba(43,36,66,.45)'; g.stroke();
  }

  /**
   * A map PIN (other systems' markers): a teardrop in the marker's colour
   * standing on its spot, pictogram in the head. Pins stand UP off the chart,
   * so they never read as one more landmark disc. Quest pins pulse at the foot.
   * `lean` tips the needle about its foot (the head moves, the spot does not);
   * the pictogram in the head stays upright.
   */
  function pin(x, y, name, s, fill, pulse, lean = 0) {
    const d = 11.5 * s, R = 7.4 * s;
    if (pulse) {
      const ph = ((ctx.state.elapsed || 0) * 0.9) % 1;
      g.globalAlpha = (1 - ph) * 0.85;
      g.lineWidth = 1.8; g.strokeStyle = fill;
      g.beginPath(); g.ellipse(x, y, (3 + 9 * ph) * s, (1.6 + 4.6 * ph) * s, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }
    g.fillStyle = 'rgba(30,22,48,.32)';
    g.beginPath(); g.ellipse(x, y + 0.6, 3.4 * s, 1.5 * s, 0, 0, TAU); g.fill();
    const a = Math.acos(R / d);
    g.save();
    g.translate(x, y); if (lean) g.rotate(lean);
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, -d, R, Math.PI / 2 + a, Math.PI / 2 - a + TAU);
    g.closePath();
    g.fillStyle = fill; g.fill();
    g.lineJoin = 'round';
    g.lineWidth = 1.7; g.strokeStyle = INK; g.stroke();
    // a little shine on the head so it reads as a glossy pin, not a flat blob
    g.beginPath(); g.arc(-R * 0.34, -d - R * 0.36, R * 0.26, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
    g.restore();
    const hx = x + Math.sin(lean) * d, hy = y - Math.cos(lean) * d;
    const S = 10.6 * s;
    g.save();
    g.translate(hx - S / 2, hy - S / 2); g.scale(S / 24, S / 24);
    g.lineWidth = 1.75 / (S / 24); g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
    g.stroke(poiPath(name));
    g.restore();
  }

  /** Lean for a pin at (x, y) so its head clears the player arrow at (px, py). */
  function leanFor(x, y, s, px, py) {
    const d = 11.5 * s, clear = 13 + 7.4 * s + 2;
    const side = x >= px ? 1 : -1;
    for (let i = 0; i < LEANS.length; i++) {
      for (let sg2 = 0; sg2 < (LEANS[i] ? 2 : 1); sg2++) {
        const a = LEANS[i] * (sg2 ? -side : side);
        const hx = x + Math.sin(a) * d, hy = y - Math.cos(a) * d;
        if ((hx - px) * (hx - px) + (hy - py) * (hy - py) >= clear * clear) return a;
      }
    }
    return Math.PI;
  }

  /** A notable marker collapsed to a small diamond (weapons, planes on the world plates). */
  function mdiamond(x, y, fill, r) {
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
    g.fillStyle = fill; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
  }

  /** A marker collapsed to a dot (numerous kinds on the world plates). */
  function mdot(x, y, fill, r) {
    g.beginPath(); g.arc(x, y, r, 0, TAU);
    g.fillStyle = fill; g.fill();
    g.lineWidth = 1.1; g.strokeStyle = INK; g.stroke();
  }

  // ── the cave: the chart is meaningless underground ─────────────────────────
  let caveBox = null, caveWarned = false;
  function caveRoute() {
    const wp = ctx.systems.escape?.routes?.cave?.waypoints;
    if (!Array.isArray(wp) || wp.length < 2) return null;
    if (!caveBox) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of wp) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      caveBox = { x0, x1, z0, z1 };
      if (!caveWarned) { caveWarned = true; console.warn('[ui/minimap] cave chart', JSON.stringify(caveBox)); }
    }
    return wp;
  }
  /** Underground? The corridor lives in its own diorama far off the map. */
  function inCave() {
    const p = ctx.systems.player?.position;
    const wp = caveRoute();
    if (!p || !wp) return null;
    const M = 46;
    if (p.x < caveBox.x0 - M || p.x > caveBox.x1 + M || p.z < caveBox.z0 - M || p.z > caveBox.z1 + M) return null;
    return wp;
  }

  function drawCave(wp) {
    const pl = ctx.systems.player?.position;
    const scale = W / SPAN_CAVE;
    const cx = pl?.x ?? 0, cz = pl?.z ?? 0;
    const left = cx - SPAN_CAVE / 2, top = cz - (H / scale) / 2;
    const mx = (x) => (x - left) * scale, mz = (z) => (z - top) * scale;

    // rock
    const rock = g.createLinearGradient(0, 0, 0, H);
    rock.addColorStop(0, '#241a44'); rock.addColorStop(1, '#150f2e');
    g.fillStyle = rock; g.fillRect(0, 0, W, H);
    // a little mineral speckle so the rock is not flat black
    const rnd = lcg(0xca4e);
    g.fillStyle = 'rgba(150,120,220,.2)';
    for (let i = 0; i < 90; i++) { const x = rnd() * W, y = rnd() * H, r = 0.5 + rnd() * 1.1; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }

    const line = (wdt, col, dash) => {
      g.setLineDash(dash || []);
      g.lineWidth = wdt; g.strokeStyle = col; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); g.moveTo(mx(wp[0].x), mz(wp[0].z));
      for (let i = 1; i < wp.length; i++) g.lineTo(mx(wp[i].x), mz(wp[i].z));
      g.stroke(); g.setLineDash([]);
    };
    line(7.2 * scale + 5, 'rgba(8,5,20,.92)');        // the rock cut
    line(6.4 * scale, '#6a55a8');                      // the floor
    line(6.4 * scale - 3.4, '#9078d8');
    line(1.6, 'rgba(160,240,255,.85)', [5, 6]);        // the crystal line down the middle

    // crystals every so often along the corridor
    g.fillStyle = '#9ff0ff';
    for (let i = 1; i < wp.length; i += 2) {
      const x = mx(wp[i].x), y = mz(wp[i].z);
      if (x < -6 || x > W + 6) continue;
      g.beginPath(); g.arc(x, y, 2.1, 0, TAU); g.fill();
    }
    // the sea-glass skylight at the midpoint
    const mid = wp[(wp.length / 2) | 0];
    g.fillStyle = 'rgba(150,230,255,.3)';
    g.beginPath(); g.arc(mx(mid.x), mz(mid.z), 9, 0, TAU); g.fill();

    // both ends are ways out
    for (const [p, name] of [[wp[0], 'exit'], [wp[wp.length - 1], 'exit']]) {
      const x = mx(p.x), y = mz(p.z);
      if (x < -14 || x > W + 14 || y < -14 || y > H + 14) continue;
      glyph(x, y, name, 1, 0.78, TINT.cat);
    }
    drawPlayer(mx, mz, pl);
    frameMarks('under the sea');
  }

  function drawPlayer(mx, mz, pl, k = 1) {
    if (!pl) return;
    const x = Math.max(8, Math.min(SW - 8, mx(pl.x))), y = Math.max(8, Math.min(SH - 8, mz(pl.z)));
    g.save(); g.translate(x, y); g.rotate(Math.PI - (ctx.systems.player.facing || 0));
    if (k !== 1) g.scale(k, k);
    g.beginPath();
    g.moveTo(0, -11.5); g.lineTo(8, 8.4); g.lineTo(0, 4.4); g.lineTo(-8, 8.4); g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = 5; g.strokeStyle = 'rgba(255,250,240,.95)'; g.stroke();
    g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#ffc94a'; g.fill();
    g.restore();
  }

  /** North mark (or a caption where north means nothing). */
  function frameMarks(caption) {
    const nx = SW - 13, ny = 13;
    g.fillStyle = 'rgba(255,248,236,.94)'; g.strokeStyle = INK; g.lineWidth = 1.7;
    g.beginPath(); g.arc(nx, ny, 9.6, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#ef3f7c';
    g.beginPath(); g.moveTo(nx, ny - 8); g.lineTo(nx + 2.9, ny - 2.4); g.lineTo(nx - 2.9, ny - 2.4); g.closePath(); g.fill();
    g.fillStyle = INK;
    g.font = '900 8.5px "Nunito", "Trebuchet MS", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', nx, ny + 4.4);
    if (caption) {
      g.font = '900 8px "Nunito", "Trebuchet MS", sans-serif';
      g.textAlign = 'left';
      g.fillStyle = 'rgba(255,248,236,.8)';
      g.fillText(caption.toUpperCase(), 7, SH - 8);
    }
  }

  // ── plate size per mode, fitted to the viewport ────────────────────────────
  let fitMode = '', fitVW = 0, fitVH = 0;
  function fit(mode) {
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
    if (mode === fitMode && vw === fitVW && vh === fitVH) return;
    fitMode = mode; fitVW = vw; fitVH = vh;
    const sz = SIZE[mode] || SIZE.local, fr = FIT[mode] || FIT.local;
    const k = Math.min(1, (vw * fr[0]) / sz[0], (vh * fr[1]) / sz[1]);
    W = Math.max(110, Math.round(sz[0] * k));
    H = Math.max(66, Math.round(sz[1] * k));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    footEl.style.maxWidth = W + 'px';
    el.dataset.mode = mode;
  }

  // A soft gold lamp glow for visited places (baked once).
  const glowCv = mkCanvas(32, 32);
  {
    const q = glowCv.getContext('2d');
    const gr = q.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,214,92,.95)'); gr.addColorStop(0.45, 'rgba(255,201,74,.5)'); gr.addColorStop(1, 'rgba(255,201,74,0)');
    q.fillStyle = gr; q.fillRect(0, 0, 32, 32);
  }

  /**
   * Other systems' markers on the corner plates. Returns the marker that should
   * carry the one label on the near map (the nearest labelled quest/notable
   * pin), or null.
   */
  function drawMarkers(mode, mx, mz, pl, px, py) {
    if (!mList.length) return null;
    if (mode !== 'local') {
      // The world plate: only QUEST markers stand up as pins. Notable ones
      // (weapons, planes) are small diamonds, the numerous ones (ammo, stars)
      // are dots — a dozen weapon pins buried the islands.
      for (let pass = 0; pass < 2; pass++) {
        for (const m of mList) {
          const st = m.style;
          if (st.tier === 2 && !st.dot) continue;
          const diamond = st.tier === 1 && !st.dot;
          if ((pass === 1) !== diamond) continue;            // dots first, diamonds on top
          const x = mx(m.x), y = mz(m.z);
          if (x < -3 || x > W + 3 || y < -3 || y > H + 3) continue;
          if (diamond) mdiamond(x, y, st.fill, 2.8);
          else mdot(x, y, st.fill, 1.7);
        }
      }
      for (const m of mList) {
        const st = m.style;
        if (st.dot || st.tier !== 2) continue;
        const x = mx(m.x), y = mz(m.z);
        if (x < -3 || x > W + 3 || y < -3 || y > H + 3) continue;
        pin(x, y, m.glyph, 0.76, st.fill, true, leanFor(x, y, 0.76, px, py));
      }
      return null;
    }

    // near map: priority-sorted, pins never pile on each other
    mScratch.length = 0;
    for (const m of mList) {
      m._x = mx(m.x); m._y = mz(m.z);
      m._d = pl ? Math.hypot(m.x - pl.x, m.z - pl.z) : 0;
      m._in = m._x > 3 && m._x < W - 3 && m._y > 3 && m._y < H - 3;
      mScratch.push(m);
    }
    mScratch.sort(byPriority);
    let nPins = 0, nSmall = 0, nRim = 0, labelM = null;
    for (const m of mScratch) {
      const st = m.style;
      m._as = 0;                                            // 0 hidden · 1 dot · 2 pin · 3 rim
      m._ob = -1;
      if (!m._in) { if (st.tier === 2 && !st.dot && pl && nRim < 2) { m._as = 3; nRim++; } continue; }
      let as = st.dot || (st.tier === 0 && nSmall >= MAX_SMALL_PINS) || (st.tier < 2 && nPins >= MAX_PINS) || nPins >= pinX.length ? 1 : 2;
      if (as === 2) for (let k = 0; k < nPins; k++) if (Math.abs(pinX[k] - m._x) < 11 && Math.abs(pinY[k] - m._y) < 14) { as = 1; break; }
      if (as === 2) { pinX[nPins] = m._x; pinY[nPins] = m._y; nPins++; if (st.tier === 0) nSmall++; }
      m._as = as;
      if (as === 2 && !labelM && m.label && st.tier >= 1) labelM = m;
    }
    for (const m of mScratch) {
      if (m._as !== 1) continue;
      if (m.style.tier === 1 && !m.style.dot) mdiamond(m._x, m._y, m.style.fill, 3);
      else mdot(m._x, m._y, m.style.fill, 2.1);
      obAdd(m._x - 3, m._y - 3, m._x + 3, m._y + 3);
    }
    for (let i = mScratch.length - 1; i >= 0; i--) {         // least important first, so the key is on top
      const m = mScratch[i];
      if (m._as === 2) {
        const s = m.style.tier === 2 ? 0.95 : m.style.tier === 1 ? 0.8 : 0.66;
        // A head that would sit under the player arrow leans away from it.
        const lean = leanFor(m._x, m._y, s, px, py);
        const d = 11.5 * s, R = 7.4 * s;
        m._lean = lean; m._s = s;
        m._hx = m._x + Math.sin(lean) * d; m._hy = m._y - Math.cos(lean) * d;
        pin(m._x, m._y, m.glyph, s, m.style.fill, m.style.tier === 2, lean);
        m._ob = obAdd(m._hx - R - 1, m._hy - R - 1, m._hx + R + 1, m._hy + R + 1);
        obAdd(m._x - 3, m._y - 2, m._x + 3, m._y + 2);
      } else if (m._as === 3) {
        const dx = m._x - px, dy = m._y - py;
        const k = Math.max(Math.abs(dx) / (W / 2 - 10), Math.abs(dy) / (H / 2 - 10));
        if (!(k > 0)) continue;
        const rx = Math.max(10, Math.min(W - 10, px + dx / k)), ry = Math.max(10, Math.min(H - 10, py + dy / k));
        // a tiny arrowhead outboard of the disc says "that way"
        const ang = Math.atan2(dy, dx);
        g.save(); g.translate(rx, ry); g.rotate(ang);
        g.beginPath(); g.moveTo(10.5, 0); g.lineTo(6.2, -3.6); g.lineTo(6.2, 3.6); g.closePath();
        g.fillStyle = INK; g.fill();
        g.restore();
        glyph(rx, ry, m.glyph, 1, 0.64, { disc: m.style.fill, ring: INK });
        obAdd(rx - 8, ry - 8, rx + 8, ry + 8);
      }
    }
    return labelM;
  }

  /** mode: 'local' | 'world'  (the corner plate; 'history' is the atlas) */
  function draw(mode, visitedIn, hereId) {
    if (mode === 'history') mode = 'world';
    const vis = visitedIn instanceof Set ? visitedIn : visited;
    fit(mode);
    g = pg; SW = W; SH = H; nOb = 0;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!structDone && ctx.state.elapsed > 0) bakeStructures();   // world:ready may never have fired

    const cave = inCave();
    if (cave) { drawCave(cave); return; }

    const wide = mode === 'world';
    const pl = ctx.systems.player?.position;
    const spanX = wide ? (X1 - X0) : spanLocal;
    const scale = W / spanX;
    const spanZ = H / scale;
    const cx = wide ? (X0 + X1) / 2 : (pl?.x ?? 0);
    const cz = wide ? (Z0 + Z1) / 2 : (pl?.z ?? 0);
    const left = cx - spanX / 2, top = cz - spanZ / 2;
    const mx = (x) => (x - left) * scale, mz = (z) => (z - top) * scale;

    // How dark is it? The chart is baked in daylight, so dusk and night are a
    // cool dimming pass over the LAND AND SEA ONLY — the streets are relit in
    // moonlit blue afterwards and the markers are stamped on top, so the town
    // still has a street plan at 23:00.
    const night = Math.max(0, Math.min(1, 1 - (ctx.state.daylight ?? 1) * 1.25));

    // sea
    const sea = g.createLinearGradient(0, 0, 0, H);
    const mixc = (a, b) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * night)},${Math.round(a[1] + (b[1] - a[1]) * night)},${Math.round(a[2] + (b[2] - a[2]) * night)})`;
    sea.addColorStop(0, mixc([95, 180, 220], [26, 52, 86]));
    sea.addColorStop(1, mixc([60, 142, 194], [15, 33, 60]));
    g.fillStyle = sea; g.fillRect(0, 0, W, H);

    // land chart
    g.imageSmoothingEnabled = true;
    const bx = mx(X0), by = mz(Z0), bw = BW / PPU * scale, bh = BH / PPU * scale;
    g.drawImage(base, 0, 0, BW, BH, bx, by, bw, bh);

    if (night > 0.01) {
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgba(78,96,162,${(0.64 * night).toFixed(3)})`;     // dim + cool
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = `rgba(126,156,220,${(0.09 * night).toFixed(3)})`;   // a little moon
      g.fillRect(0, 0, W, H);
      // the roads come back, moonlit: dimming alone turned the street plan off
      g.globalAlpha = 0.2 + 0.62 * night;
      g.drawImage(roadNight, 0, 0, BW, BH, bx, by, bw, bh);
      g.globalAlpha = 1;
    }

    const px = pl ? Math.max(8, Math.min(W - 8, mx(pl.x))) : -999, py = pl ? Math.max(8, Math.min(H - 8, mz(pl.z))) : -999;
    const marks = drawLandmarks(mode, mx, mz, pl, px, py, vis, hereId);

    // other systems' markers (quest pins, stars, ammo, planes)
    const markLabel = drawMarkers(mode, mx, mz, pl, px, py);

    // ferry
    const fp = ferryPos();
    if (fp) drawFerry(mx(fp.x), mz(fp.z));

    // player chevron — the loudest thing on the map
    drawPlayer(mx, mz, pl, 1);
    if (pl) obAdd(px - 13, py - 13, px + 13, py + 13);
    obAdd(W - 24, 2, W - 2, 24);                              // the compass

    // ONE name on the chart: a labelled quest pin if one is in view (that is
    // news), otherwise whichever landmark marker you are closest to. More than
    // one label and the map is a word search. It goes in whichever of eight
    // slots around its marker covers the fewest other things, and a leader
    // line ties it back when it had to stand off.
    const near = marks && marks[0];
    if (markLabel && (!near || markLabel._d <= near.d + 30)) {
      const R = 7.4 * (markLabel._s || 1) + 1;
      measureLabel(markLabel.label, LABEL_FONT, 88, 12.5);
      placeLabel(markLabel._hx, markLabel._hy, R, markLabel._ob);
      leader(markLabel._hx, markLabel._hy, R);
      labelPlate();
    } else if (near && near.lm.label && near.lm.label !== '???') {
      measureLabel(near.lm.label, LABEL_FONT, 88, 12.5);
      placeLabel(near.x, near.y, 10.5, near.ob);
      leader(near.x, near.y, 10.5);
      labelPlate();
    }

    frameMarks(null);
  }

  /** Near/world landmarks — the art-directed marker pass. Returns the pictogram marks. */
  function drawLandmarks(mode, mx, mz, pl, px, py, vis, hereId) {
    // landmarks — pictograms up close, plain dots in the world view (where 18
    // glyph discs would swamp the islands). Markers outside the frame become
    // rim markers below rather than being drawn half-clipped at the edge.
    const glyphs = mode === 'local';
    const offFrame = [], shown = [];
    for (const id in world.LANDMARKS) {
      const lm = world.LANDMARKS[id];
      const x = mx(lm.x), y = mz(lm.z);
      const inset = glyphs && POI[id] ? 11 : 3;
      if (x < inset || x > W - inset || y < inset || y > H - inset) {
        // Off the edge of the zoomed view: remember it for a rim marker, so the
        // local map still says which way the pier / the peak / the lake lie.
        if (glyphs && POI[id] && pl) offFrame.push({ id, x, y, d: Math.hypot(lm.x - pl.x, lm.z - pl.z), seen: vis.has(id) });
        continue;
      }
      // Don't stack a POI disc under the player chevron (standing in a landmark
      // put the two on top of each other): the glow ring says "you are here".
      const underPlayer = Math.hypot(x - px, y - py) < 12;
      const seen = vis.has(id);
      if (id === hereId) {
        g.fillStyle = 'rgba(255,201,74,.5)';
        g.beginPath(); g.arc(x, y, glyphs && POI[id] ? 14 : 7, 0, TAU); g.fill();
      }
      if (underPlayer) continue;
      if (glyphs && POI[id]) {
        shown.push({ id, x, y, tx: x, ty: y, seen, lm, d: pl ? Math.hypot(lm.x - pl.x, lm.z - pl.z) : 1e9, ob: -1 });
      } else dot(x, y, seen, lm);
    }
    // Only the nearest few earn a pictogram, and never two overlapping discs —
    // everything else stays a dot, so the TOWN is what the map is mostly made
    // of rather than a rack of badges.
    shown.sort((a, b) => a.d - b.d);
    const marks = [];
    for (const s of shown) {
      if (marks.length >= MAX_GLYPHS || marks.some((m) => Math.hypot(m.x - s.x, m.y - s.y) < 21)) { dot(s.x, s.y, s.seen, s.lm); continue; }
      marks.push(s);
    }
    // A disc the player arrow would sit on steps aside, on a short leader, so
    // the arrow never hides the place and the place never hides the arrow.
    if (pl) {
      for (const s of marks) {
        const dx = s.x - px, dy = s.y - py, d = Math.hypot(dx, dy);
        if (d >= CLEAR_PLAYER || d < 0.01) continue;
        s.x = Math.max(11, Math.min(W - 11, px + dx / d * CLEAR_PLAYER));
        s.y = Math.max(11, Math.min(H - 11, py + dy / d * CLEAR_PLAYER));
      }
    }
    for (let i = marks.length - 1; i >= 0; i--) {
      const s = marks[i];
      if (s.x !== s.tx || s.y !== s.ty) {
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(s.tx, s.ty); g.lineTo(s.x, s.y);
        g.lineWidth = 3.2; g.strokeStyle = 'rgba(255,248,236,.85)'; g.stroke();
        g.lineWidth = 1.3; g.strokeStyle = INK; g.stroke();
        g.beginPath(); g.arc(s.tx, s.ty, 2, 0, TAU); g.fillStyle = INK; g.fill();
      }
      glyph(s.x, s.y, POI[s.id], s.seen ? 1 : 0.55, 1, TINT[s.lm.island] || TINT.candy);
      s.ob = obAdd(s.x - 11, s.y - 11, s.x + 11, s.y + 11);
    }

    // the nearest off-frame POIs, pinned to the rim on the line from the
    // player towards them (small + faded, so the in-frame markers still lead)
    if (offFrame.length) {
      offFrame.sort((a, b) => a.d - b.d);
      const rim = [];
      for (const o of offFrame.slice(0, 2)) {
        const dx = o.x - px, dy = o.y - py;
        const m = Math.max(Math.abs(dx) / (W / 2 - 9), Math.abs(dy) / (H / 2 - 9));
        if (!(m > 0)) continue;
        const rx = Math.max(9, Math.min(W - 9, px + dx / m));
        const ry = Math.max(9, Math.min(H - 9, py + dy / m));
        if (rim.some((r) => Math.hypot(r.x - rx, r.y - ry) < 16)) continue;
        rim.push({ x: rx, y: ry });
        const isl = world.LANDMARKS[o.id]?.island;
        glyph(rx, ry, POI[o.id], o.seen ? 0.88 : 0.56, 0.62, TINT[isl] || TINT.candy);
        obAdd(rx - 7, ry - 7, rx + 7, ry + 7);
      }
    }
    return marks;
  }

  // ═══ THE ATLAS ═════════════════════════════════════════════════════════════
  const aVivid = mkCanvas(2, 2), aFog = mkCanvas(2, 2), aT1 = mkCanvas(2, 2), aT2 = mkCanvas(2, 2);
  let aW = 0, aH = 0, aDpr = 1, aS = 1, aFitVW = 0, aFitVH = 0;
  let aChromeW = 30, aChromeH = 104, aMeasured = false, placeFont = PLACE_FONT, hereSlot = -1;
  let aStW = -1, aStH = -1, aStVer = -1;                      // static stage built for…
  let aLitKey = '', aLitN = -1, aLitQ = 0, aVis = visited, aHere = null;
  const amx = (x) => (x - AX0) * aS, amz = (z) => (z - AZ0) * aS;

  /** Size the sheet: about three quarters of the screen, the chart's own aspect. */
  function fitAtlas() {
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
    if (vw === aFitVW && vh === aFitVH) return;
    if (vw !== aFitVW || vh !== aFitVH) aMeasured = false;
    aFitVW = vw; aFitVH = vh;
    const compact = vh < 540 || vw < 760;
    const maxW = vw * (compact ? 0.96 : 0.76) - aChromeW;
    const maxH = vh * (compact ? 0.94 : 0.84) - aChromeH;
    const w = Math.max(200, Math.floor(Math.min(maxW, maxH * A_ASPECT)));
    const h = Math.round(w / A_ASPECT);
    if (w === aW && h === aH) return;
    aW = w; aH = h; aS = aW / (AX1 - AX0);
    aDpr = Math.min(A_DPR, ctx.shot ? 1 : (window.devicePixelRatio || 1));
    placeFont = aW < 900 ? PLACE_FONT_S : PLACE_FONT;
    for (const c of [aSt, aRt, aPl, aDy]) {
      c.width = Math.round(aW * aDpr); c.height = Math.round(aH * aDpr);
      c.style.width = aW + 'px'; c.style.height = aH + 'px';
    }
    aStW = -1;
  }

  /**
   * STATIC stage (on a size change or when footprints land): the vivid chart
   * (island colour pushed a step richer so explored ground reads against the
   * cream), and the FOG SHEET — sea with a faint chart grid, an ink coast, and
   * every island as blank parchment under cumulus cloud.
   */
  function atlasStatic() {
    const DW = aSt.width, DH = aSt.height, k = aDpr * aS;       // device px per world unit
    for (const c of [aVivid, aFog, aT1, aT2]) if (c.width !== DW || c.height !== DH) { c.width = DW; c.height = DH; }
    const bx = (X0 - AX0) * k, by = (Z0 - AZ0) * k, bw = (X1 - X0) * k, bh = (Z1 - Z0) * k;
    const midX = (0 - AX0) * k, f = k / PPU;

    const v = aVivid.getContext('2d');
    reset(v); v.clearRect(0, 0, DW, DH);
    v.drawImage(base, 0, 0, BW, BH, bx, by, bw, bh);
    v.globalCompositeOperation = 'multiply';
    v.fillStyle = '#ffc4d8'; v.fillRect(0, 0, midX, DH);          // Candyland: a real candy pink
    v.fillStyle = '#e2f1cf'; v.fillRect(midX, 0, DW - midX, DH);   // Cat Island: a richer green
    v.globalCompositeOperation = 'source-over';
    // the streets go back on in cream (the tint would have pinked them into the land)
    v.globalAlpha = 0.55;
    for (const [dx, dy] of [[-1.4, 0], [1.4, 0], [0, -1.4], [0, 1.4]]) v.drawImage(roadCase, 0, 0, BW, BH, bx + dx * f, by + dy * f, bw, bh);
    v.globalAlpha = 1;
    v.drawImage(roadDay, 0, 0, BW, BH, bx, by, bw, bh);
    v.globalCompositeOperation = 'destination-in';
    v.drawImage(base, 0, 0, BW, BH, bx, by, bw, bh);
    v.globalCompositeOperation = 'source-over';

    // ── the fog sheet
    const fc = aFog.getContext('2d');
    reset(fc);
    const sea = fc.createLinearGradient(0, 0, 0, DH);
    sea.addColorStop(0, '#72c3e2'); sea.addColorStop(1, '#4a97c9');
    fc.fillStyle = sea; fc.fillRect(0, 0, DW, DH);
    fc.strokeStyle = 'rgba(255,255,255,.17)'; fc.lineWidth = Math.max(1, aDpr);
    fc.beginPath();
    for (let x = -300; x <= 300; x += 50) { const X = Math.round((x - AX0) * k) + 0.5; fc.moveTo(X, 0); fc.lineTo(X, DH); }
    for (let z = -100; z <= 100; z += 50) { const Y = Math.round((z - AZ0) * k) + 0.5; fc.moveTo(0, Y); fc.lineTo(DW, Y); }
    fc.stroke();
    // the coast: the land's ink silhouette, a hair wider than the land
    const t1 = aT1.getContext('2d');
    reset(t1); t1.clearRect(0, 0, DW, DH);
    t1.drawImage(aVivid, 0, 0);
    t1.globalCompositeOperation = 'source-in';
    t1.fillStyle = INK; t1.fillRect(0, 0, DW, DH);
    t1.globalCompositeOperation = 'source-over';
    const o = 1.6 * aDpr;
    for (const [dx, dy] of RIM8) fc.drawImage(aT1, dx * o, dy * o);
    // parchment, a warm pencil hatch, and cumulus puffs (seeded)
    const t2 = aT2.getContext('2d');
    reset(t2);
    t2.fillStyle = PARCH; t2.fillRect(0, 0, DW, DH);
    t2.strokeStyle = 'rgba(176,140,92,.2)'; t2.lineWidth = Math.max(1, 0.9 * aDpr);
    t2.beginPath();
    const sp = 7 * aDpr;
    for (let x = -DH; x < DW; x += sp) { t2.moveTo(x, DH); t2.lineTo(x + DH, 0); }
    t2.stroke();
    const rnd = lcg(0xc10d5);
    const nC = Math.max(12, Math.round(DW * DH / (5200 * aDpr * aDpr)));
    for (let i = 0; i < nC; i++) {
      const cx = rnd() * DW, cy = rnd() * DH, n = 3 + ((rnd() * 3) | 0), r0 = (5 + rnd() * 5) * aDpr;
      const pts = [];
      for (let q = 0; q < n; q++) {
        const t = n === 1 ? 0 : q / (n - 1) - 0.5;
        const r = r0 * (1 - Math.abs(t) * 0.7) * (0.85 + rnd() * 0.3);
        pts.push(cx + t * r0 * 2.6, cy - r * 0.35 + (rnd() - 0.5) * r0 * 0.3, r);
      }
      t2.fillStyle = 'rgba(170,138,96,.2)';
      t2.beginPath();
      for (let q = 0; q < pts.length; q += 3) { t2.moveTo(pts[q] + pts[q + 2] + 1.2 * aDpr, pts[q + 1] + 2 * aDpr); t2.arc(pts[q] + 1.2 * aDpr, pts[q + 1] + 2 * aDpr, pts[q + 2], 0, TAU); }
      t2.fill();
      t2.fillStyle = 'rgba(255,254,249,.92)';
      t2.beginPath();
      for (let q = 0; q < pts.length; q += 3) { t2.moveTo(pts[q] + pts[q + 2], pts[q + 1]); t2.arc(pts[q], pts[q + 1], pts[q + 2], 0, TAU); }
      t2.fill();
    }
    t2.globalCompositeOperation = 'destination-in';
    t2.drawImage(aVivid, 0, 0);
    t2.globalCompositeOperation = 'source-over';
    fc.drawImage(aT2, 0, 0);
  }

  /**
   * EXPLORED stage (when coverage or the lit places change), in device px and
   * clipped to `clip` ([x0,y0,x1,y1] or null = everything): the fog sheet, then
   * an ink + white rim around the explored region (clipped to land), then the
   * explored land itself in full colour, then the places: visited ones lit and
   * named, unvisited ones a pencil ring.
   */
  function atlasExplored(clip) {
    const DW = aSt.width, DH = aSt.height, k = aDpr * aS, cp = CELL * k;
    const r0 = cp * 0.74, rW = r0 + 2.3 * aDpr, rI = r0 + 3.7 * aDpr;
    const ox = (X0 - AX0) * k, oz = (Z0 - AZ0) * k;              // grid origin in device px
    // only cells that can touch the clip rectangle
    let i0 = 0, i1 = GX - 1, j0 = 0, j1 = GZ - 1;
    if (clip) {
      const m = rI + cp;
      i0 = Math.max(0, Math.floor((clip[0] - m - ox) / cp)); i1 = Math.min(GX - 1, Math.ceil((clip[2] + m - ox) / cp));
      j0 = Math.max(0, Math.floor((clip[1] - m - oz) / cp)); j1 = Math.min(GZ - 1, Math.ceil((clip[3] + m - oz) / cp));
    }
    const fill = new Path2D(), ringW = new Path2D(), ringI = new Path2D();
    let any = false;
    for (let j = j0; j <= j1; j++) {
      const row = j * GX, y = oz + j * cp;
      let run = -1;
      for (let i = i0; i <= i1 + 1; i++) {
        const on = i <= i1 && cov[row + i] === 1;
        if (on && run < 0) run = i;
        if (!on && run >= 0) { fill.rect(ox + run * cp - 0.4, y - 0.4, (i - run) * cp + 0.8, cp + 0.8); run = -1; }
        if (!on) continue;
        any = true;
        const kk = row + i;
        const edge = i === 0 || i === GX - 1 || j === 0 || j === GZ - 1 || !cov[kk - 1] || !cov[kk + 1] || !cov[kk - GX] || !cov[kk + GX];
        if (!edge) continue;
        const cx = ox + (i + 0.5) * cp, cy = y + cp / 2;
        fill.moveTo(cx + r0, cy); fill.arc(cx, cy, r0, 0, TAU);
        ringW.moveTo(cx + rW, cy); ringW.arc(cx, cy, rW, 0, TAU);
        ringI.moveTo(cx + rI, cy); ringI.arc(cx, cy, rI, 0, TAU);
      }
    }
    const withClip = (c2) => {
      reset(c2);
      if (clip) { c2.save(); c2.beginPath(); c2.rect(clip[0], clip[1], clip[2] - clip[0], clip[3] - clip[1]); c2.clip(); }
    };
    const unclip = (c2) => { if (clip) c2.restore(); reset(c2); };

    withClip(sg);
    sg.clearRect(0, 0, DW, DH);
    sg.drawImage(aFog, 0, 0);
    if (any) {
      const t1 = aT1.getContext('2d'), t2 = aT2.getContext('2d');
      withClip(t1);
      t1.clearRect(0, 0, DW, DH);
      t1.fillStyle = INK; t1.fill(ringI);
      t1.fillStyle = '#ffffff'; t1.fill(ringW);
      t1.globalCompositeOperation = 'destination-in'; t1.drawImage(aVivid, 0, 0);
      unclip(t1);
      withClip(t2);
      t2.clearRect(0, 0, DW, DH);
      t2.fillStyle = '#ffffff'; t2.fill(fill);
      t2.globalCompositeOperation = 'source-in'; t2.drawImage(aVivid, 0, 0);
      unclip(t2);
      sg.drawImage(aT1, 0, 0);
      sg.drawImage(aT2, 0, 0);
    }
    // lamp glows, pencil rings, compass, scale bar (css px from here on)
    sg.setTransform(aDpr, 0, 0, aDpr, 0, 0);
    atlasGround();
    unclip(sg);
  }

  /** Lit places, the here-place first, then the pictogram places (reused array). */
  const litIds = [];
  function sortLit() {
    litIds.length = 0;
    for (const id of aVis) if (world.LANDMARKS[id]) litIds.push(id);
    litIds.sort((a, b) => (b === aHere) - (a === aHere) || (POI[b] ? 1 : 0) - (POI[a] ? 1 : 0) || (a < b ? -1 : 1));
  }

  /** GROUND extras: lamp glows under the lit places, pencil rings for the rest, compass, scale bar. */
  function atlasGround() {
    g = sg; SW = aW; SH = aH;
    for (const id in world.LANDMARKS) {
      if (aVis.has(id)) continue;
      const lm = world.LANDMARKS[id];
      if (lm.label === '???') continue;                      // secrets stay secret until found
      const x = amx(lm.x), y = amz(lm.z);
      g.beginPath(); g.arc(x, y, 3.3, 0, TAU);
      g.fillStyle = 'rgba(255,251,240,.95)'; g.fill();
      g.lineWidth = 1.3; g.strokeStyle = 'rgba(96,74,58,.7)'; g.stroke();
    }
    for (const id of aVis) {
      const lm = world.LANDMARKS[id];
      if (!lm) continue;
      const x = amx(lm.x), y = amz(lm.z), big = id === aHere ? 46 : 36;
      g.drawImage(glowCv, x - big / 2, y - big / 2, big, big);
    }
    frameMarks(null);
    // scale bar: 100 m in two bands
    const L = 100 * aS, sx = 12, sy = SH - 12;
    g.fillStyle = 'rgba(255,251,240,.9)'; g.strokeStyle = INK; g.lineWidth = 1.4;
    g.fillRect(sx, sy - 4, L, 5); g.strokeRect(sx, sy - 4, L, 5);
    g.fillStyle = INK; g.fillRect(sx, sy - 4, L / 2, 5);
    g.font = '900 9px "Nunito", "Trebuchet MS", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,251,240,.9)';
    g.strokeText('100 m', sx + L + 5, sy + 1); g.fillText('100 m', sx + L + 5, sy + 1);
    g = pg; SW = W; SH = H;
  }

  /** Halo text at LB, anchored on the side that faces its place. */
  function haloName() {
    const tx = LB.side > 0 ? LB.x - LB.bw / 2 + 2 : LB.side < 0 ? LB.x + LB.bw / 2 - 2 : LB.x;
    g.font = LB.font; g.textBaseline = 'middle';
    g.textAlign = LB.side > 0 ? 'left' : LB.side < 0 ? 'right' : 'center';
    g.lineJoin = 'round'; g.lineWidth = 3.8; g.strokeStyle = 'rgba(255,251,240,.96)';
    g.strokeText(LB.t, tx, LB.y + 0.5);
    g.fillStyle = INK; g.fillText(LB.t, tx, LB.y + 0.5);
  }

  /**
   * PLACES layer (rebuilt when a place is lit, you enter another, a quest pin
   * moves, the sheet resizes or a font lands): the gold-ringed discs over the
   * route, and the names of the places you have been, each in whichever slot
   * is clear of discs, pencil rings, quest pins, the compass and the other
   * names; a name with no clear slot is dropped. The place you are standing in
   * is named on the live layer instead, clear of your arrow.
   */
  const R_LIT = 10 * 0.86;
  function atlasNames() {
    reset(lg); lg.clearRect(0, 0, aPl.width, aPl.height);
    lg.setTransform(aDpr, 0, 0, aDpr, 0, 0);
    g = lg; SW = aW; SH = aH; nOb = 0;
    sortLit();
    for (const id in world.LANDMARKS) {
      if (aVis.has(id) || world.LANDMARKS[id].label === '???') continue;
      const lm = world.LANDMARKS[id], x = amx(lm.x), y = amz(lm.z);
      obAdd(x - 3.5, y - 3.5, x + 3.5, y + 3.5);
    }
    for (const id of litIds) {
      const lm = world.LANDMARKS[id];
      const x = amx(lm.x), y = amz(lm.z);
      if (POI[id]) { glyph(x, y, POI[id], 1, 0.86, TINT_LIT[lm.island] || TINT_LIT.candy); obAdd(x - R_LIT - 1, y - R_LIT - 1, x + R_LIT + 1, y + R_LIT + 1); }
      else {
        g.beginPath(); g.arc(x, y, 4.4, 0, TAU);
        g.fillStyle = '#ffc94a'; g.fill();
        g.lineWidth = 2; g.strokeStyle = '#e8a91c'; g.stroke();
        g.lineWidth = 1.2; g.strokeStyle = INK; g.beginPath(); g.arc(x, y, 5.6, 0, TAU); g.stroke();
        obAdd(x - 6, y - 6, x + 6, y + 6);
      }
    }
    obAdd(SW - 26, 0, SW, 26);                                  // the compass
    obAdd(0, SH - 30, 118, SH);                                 // the scale bar
    // the quest pins (drawn live, over this layer): names keep off them
    const q0 = nOb;
    for (const m of mList) {
      if (m.style.dot || m.style.tier !== 2) continue;
      const x = amx(m.x), y = amz(m.z), d = 11.5 * 1.08, r = 7.4 * 1.08 + 1.5;
      obAdd(x - r, y - d - r, x + r, y + 2);
    }
    const q1 = nOb;
    // the here-place's name is live, but its usual spot is reserved
    for (const id of litIds) {
      const lm = world.LANDMARKS[id];
      if (!lm.label || lm.label === '???') continue;
      const x = amx(lm.x), y = amz(lm.z);
      measureLabel(lm.label, placeFont, 130, 14);
      if (placeLabel(x, y, POI[id] ? R_LIT + 0.5 : 6) > 60) continue;
      if (id !== aHere) haloName();
      obAdd(LB.x - LB.bw / 2 - 2, LB.y - LB.bh / 2 - 2, LB.x + LB.bw / 2 + 2, LB.y + LB.bh / 2 + 2);   // a little air
    }
    // keep everything but the quest pins for the live layer's labels
    nSOB = 0;
    for (let n = 0; n < nOb; n++) {
      if (n >= q0 && n < q1) continue;
      for (let c = 0; c < 4; c++) SOB[nSOB * 4 + c] = OB[n * 4 + c];
      nSOB++;
    }
    hereSlot = -1;
    g = pg; SW = W; SH = H;
  }

  // Route scratch (simplified screen polyline), no per-frame allocation.
  const RX = new Float32Array(TRAIL_MAX + 2), RY = new Float32Array(TRAIL_MAX + 2);
  const RI = new Int16Array(TRAIL_MAX + 2), RB = new Uint8Array(TRAIL_MAX + 2), RC = new Float32Array(TRAIL_MAX + 2);
  /**
   * The ROUTE: the last 800 steps as one thick dashed line — an ink edge, a
   * white road, red dashes marching towards you — older thirds a duskier red.
   * Teleports break it; it ends at your arrow.
   */
  function drawRoute(pl) {
    if (tN < 1) return;
    let n = 0, lx = 0, ly = 0, lwx = NaN, lwz = NaN;
    for (let i = 0; i < tN; i++) {
      const q = trailIdx(i), wx = trail[q * 2], wz = trail[q * 2 + 1];
      const brk = i > 0 && (Math.abs(wx - lwx) > TRAIL_BREAK || Math.abs(wz - lwz) > TRAIL_BREAK);
      lwx = wx; lwz = wz;
      const x = amx(wx), y = amz(wz);
      if (!brk && n > 0 && i < tN - 1 && (x - lx) * (x - lx) + (y - ly) * (y - ly) < 10) continue;
      RX[n] = x; RY[n] = y; RI[n] = i; RB[n] = brk ? 1 : 0; n++; lx = x; ly = y;
    }
    if (pl && Math.abs(pl.x - lwx) < TRAIL_BREAK && Math.abs(pl.z - lwz) < TRAIL_BREAK) {
      RX[n] = amx(pl.x); RY[n] = amz(pl.z); RI[n] = tN - 1; RB[n] = 0; n++;
    }
    if (n < 2) return;
    RC[0] = 0;
    for (let m = 1; m < n; m++) RC[m] = RC[m - 1] + (RB[m] ? 0 : Math.hypot(RX[m] - RX[m - 1], RY[m] - RY[m - 1]));
    const march = (ctx.state.elapsed || 0) * 14;
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (let b = 0; b < 3; b++) {
      g.beginPath();
      let last = -2, startC = -1;
      for (let m = 1; m < n; m++) {
        if (RB[m]) continue;
        const bk = Math.min(2, ((RI[m] * 3) / tN) | 0);
        if (bk !== b) continue;
        if (last !== m - 1) { g.moveTo(RX[m - 1], RY[m - 1]); if (startC < 0) startC = RC[m - 1]; }
        g.lineTo(RX[m], RY[m]);
        last = m;
      }
      if (startC < 0) continue;
      const w = ROUTE_W3[b];
      g.setLineDash(NODASH);
      g.globalAlpha = 0.6; g.lineWidth = 8.8 * w; g.strokeStyle = INK; g.stroke();
      g.globalAlpha = 1; g.lineWidth = 6.2 * w; g.strokeStyle = '#fffaf0'; g.stroke();
      g.setLineDash(DASH); g.lineDashOffset = startC - march;
      g.lineWidth = 3.6 * w; g.strokeStyle = ROUTE_RED3[b]; g.stroke();
      g.setLineDash(NODASH); g.lineDashOffset = 0;
    }
    // where the remembered route begins: a small hollow ring
    g.beginPath(); g.arc(RX[0], RY[0], 3.6, 0, TAU);
    g.fillStyle = '#fffaf0'; g.fill(); g.lineWidth = 2; g.strokeStyle = ROUTE_RED; g.stroke();
  }

  /** Other systems' markers on the atlas. Quest pins are labelled. */
  function atlasMarkers(pl) {
    if (!mList.length) return;
    const px = pl ? amx(pl.x) : -999, py = pl ? amz(pl.z) : -999;
    for (let pass = 0; pass < 2; pass++) {
      for (const m of mList) {
        const st = m.style;
        if (st.tier === 2 && !st.dot) continue;
        const diamond = st.tier === 1 && !st.dot;
        if ((pass === 1) !== diamond) continue;
        if (!st.always && !seenAt(m.x, m.z)) continue;          // a record, not a spoiler
        const x = amx(m.x), y = amz(m.z);
        if (x < -3 || x > aW + 3 || y < -3 || y > aH + 3) continue;
        if (diamond) mdiamond(x, y, st.fill, 4); else mdot(x, y, st.fill, 2.6);
      }
    }
    // start from the static layer's places and names, so a quest label never
    // lands on 'Main Street'
    for (let i = 0; i < nSOB * 4; i++) OB[i] = SOB[i];
    nOb = nSOB;
    if (pl) obAdd(px - 14, py - 14, px + 14, py + 14);
    for (const m of mList) {
      const st = m.style;
      if (st.dot || st.tier !== 2) { m._ob = -1; continue; }
      const x = amx(m.x), y = amz(m.z);
      m._in = !(x < -3 || x > aW + 3 || y < -3 || y > aH + 3);
      if (!m._in) { m._ob = -1; continue; }
      const s = 1.08, lean = leanFor(x, y, s, px, py), d = 11.5 * s, R = 7.4 * s;
      m._x = x; m._y = y; m._s = s;
      m._hx = x + Math.sin(lean) * d; m._hy = y - Math.cos(lean) * d;
      pin(x, y, m.glyph, s, st.fill, true, lean);
      m._ob = obAdd(m._hx - R - 1, m._hy - R - 1, m._hx + R + 1, m._hy + R + 1);
    }
    for (const m of mList) {
      if (m._ob < 0 || !m.label || m.style.tier !== 2) continue;
      const R = 7.4 * m._s + 1;
      measureLabel(m.label, ALABEL_FONT, 120, 15);
      LB.bw += 6;
      placeLabel(m._hx, m._hy, R, m._ob);
      leader(m._hx, m._hy, R);
      labelPlate();
      obAdd(LB.x - LB.bw / 2, LB.y - LB.bh / 2, LB.x + LB.bw / 2, LB.y + LB.bh / 2);
    }
  }

  /** The live layer: route, markers, ferry, you. Every frame while the atlas is open. */
  function atlasLive() {
    const p = ctx.systems.player?.position;
    const pl = p && p.x >= AX0 - 8 && p.x <= AX1 + 8 && p.z >= AZ0 - 8 && p.z <= AZ1 + 8 ? p : null;
    g = rg; SW = aW; SH = aH;
    reset(rg); rg.setTransform(aDpr, 0, 0, aDpr, 0, 0); rg.clearRect(0, 0, aW, aH);
    drawRoute(pl);
    g = ag;
    reset(ag); ag.setTransform(aDpr, 0, 0, aDpr, 0, 0); ag.clearRect(0, 0, aW, aH);
    atlasMarkers(pl);
    // WHERE YOU ARE, named on a gold plate beside the place, never under you
    const lm = aHere ? world.LANDMARKS[aHere] : null;
    if (pl && lm && lm.label && lm.label !== '???') {
      const x = amx(lm.x), y = amz(lm.z), ar = POI[aHere] ? R_LIT + 0.5 : 6;
      measureLabel(lm.label, placeFont, 130, 15);
      LB.bw += 8;
      placeLabel(x, y, ar, -1, hereSlot);
      hereSlot = LB.slot;
      leader(x, y, ar);
      labelPlate('#ffe7a0');
    }
    const fp = ferryPos();
    if (fp) drawFerry(amx(fp.x), amz(fp.z));
    if (pl) {
      const x = amx(pl.x), y = amz(pl.z);
      const ph = ((ctx.state.elapsed || 0) * 0.8) % 1;
      ag.globalAlpha = (1 - ph) * 0.9; ag.lineWidth = 2.6; ag.strokeStyle = '#ffc94a';
      ag.beginPath(); ag.arc(x, y, 10 + 15 * ph, 0, TAU); ag.stroke();
      ag.globalAlpha = 1;
      drawPlayer(amx, amz, pl, 1.18);
    } else if (p) {
      // off the chart (the undersea corridor, the palace cellar): say so
      measureLabel(inCave() ? 'You are under the sea' : 'You are off the chart', ALABEL_FONT, 200, 17);
      LB.bw += 8; LB.x = aW / 2; LB.y = 16;
      labelPlate();
    }
    g = pg; SW = W; SH = H;
  }

  /** Draw the atlas (ui.js calls this every frame while history mode is up). */
  function drawAtlas(visitedIn, hereId) {
    aVis = visitedIn instanceof Set ? visitedIn : visited;
    if (!structDone && ctx.state.elapsed > 0) bakeStructures();
    fitAtlas();
    if (!aMeasured && aPlate.offsetWidth > 0 && aSt.offsetWidth > 0) {
      aMeasured = true;
      const cw = aPlate.offsetWidth - aSt.offsetWidth, ch = aPlate.offsetHeight - aSt.offsetHeight;
      if (Math.abs(cw - aChromeW) > 2 || Math.abs(ch - aChromeH) > 2) {
        aChromeW = cw; aChromeH = ch; aFitVW = 0; fitAtlas(); aMeasured = true;
      }
    }
    let full = false, t0 = PROF ? performance.now() : 0, tS = 0;
    if (aStW !== aW || aStH !== aH || aStVer !== structVer) { aStW = aW; aStH = aH; aStVer = structVer; atlasStatic(); full = true; tS = PROF ? performance.now() - t0 : 0; }
    // the lit places and their names move when: a place is lit, you enter
    // another place, a quest pin moves, or a font arrives (aLitKey = '')
    let q = 0;
    for (const m of mList) if (m.style.tier === 2 && !m.style.dot) q = (Math.imul(q, 31) + Math.round(m.x) * 7 + Math.round(m.z)) | 0;
    const here = hereId || null;
    if (aLitKey !== 'ok' || aLitN !== aVis.size || aHere !== here || aLitQ !== q) {
      aLitKey = 'ok'; aLitN = aVis.size; aHere = here; aLitQ = q; full = true;
    }
    if (full) {
      const t1 = PROF ? performance.now() : 0;
      atlasExplored(null);
      const t2 = PROF ? performance.now() : 0;
      atlasNames();
      if (PROF) console.warn('[ui/minimap] atlas rebuild ms', JSON.stringify({ static: +tS.toFixed(2), explored: +(t2 - t1).toFixed(2), names: +(performance.now() - t2).toFixed(2), w: aW, h: aH, dpr: aDpr }));
    } else if (dBox.x1 >= dBox.x0) {
      // only the neighbourhood that was just explored (plus room for the rim;
      // the places and names are redrawn inside it, so nothing is lost)
      const k = aDpr * aS, pad = (CELL + 4) * k + 6 * aDpr;
      const t1 = PROF ? performance.now() : 0;
      atlasExplored([(dBox.x0 - AX0) * k - pad, (dBox.z0 - AZ0) * k - pad, (dBox.x1 - AX0) * k + pad, (dBox.z1 - AZ0) * k + pad]);
      if (PROF) console.warn('[ui/minimap] atlas partial ms', +(performance.now() - t1).toFixed(2));
    }
    dBox.x0 = Infinity; dBox.x1 = -Infinity; dBox.z0 = Infinity; dBox.z1 = -Infinity;
    atlasLive();
    if (aVis.size !== placesShown) {
      placesShown = aVis.size;
      let n = 0;
      for (const id of aVis) { const lm = world.LANDMARKS[id]; if (lm && lm.label !== '???') n++; }
      aN.textContent = String(n);
    }
  }

  // ── per-frame bookkeeping (runs whether or not the map is showing) ─────────
  let spanLocal = SPAN_LOCAL;
  function tick(dt) {
    const p = ctx.systems.player?.position;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
      const inGrid = p.x >= X0 && p.x <= X1 && p.z >= Z0 && p.z <= Z1;
      if (inGrid) {
        const dx = p.x - lastTX, dz = p.z - lastTZ;
        if (!(dx * dx + dz * dz < TRAIL_STEP * TRAIL_STEP)) pushTrail(p.x, p.z);   // NaN (first) → push
        markT -= dt;
        if (markT <= 0) { markT = markT < -1 ? 1 : markT + 1; mark(p.x, p.z, ctx.state.flying ? R_FLY : R_WALK); }
      }
    }
    if (visited.size !== visitedN) { if (visitedN >= 0) dirty = true; visitedN = visited.size; }
    const want = ctx.state.flying ? SPAN_FLY : SPAN_LOCAL;
    spanLocal += (want - spanLocal) * Math.min(1, dt * 1.6);
    saveT -= dt;
    if (saveT <= 0) { saveT = SAVE_EVERY; if (dirty) save(); }
    updateFooter();
  }

  let placeTxt = '';
  /** Name the footer. `landmark` picks the louder ink (you are somewhere named). */
  function setPlace(label, landmark = false) {
    const t = String(label || '');
    if (t === placeTxt) return;
    placeTxt = t;
    hereEl.textContent = t;
    el.classList.toggle('at-landmark', !!landmark && !!t);
  }

  /** Numbers for tests and other systems. */
  function explored() {
    return {
      candy: pct(1), cat: pct(2),
      cells: landSeen[1] + landSeen[2], landCells: landTotal[1] + landTotal[2],
      trail: tN, landmarks: [...visited], grid: { gx: GX, gz: GZ, cell: CELL },
    };
  }

  return {
    el, chip, atlas, atlasPlate: aPlate, atlasScrim: aScrim,
    draw, drawAtlas, setPlace, tick,
    addMarker, removeMarker, resetHistory, explored, save,
    get markers() { return mList.map((m) => ({ id: m.id, x: m.x, z: m.z, glyph: m.glyph, label: m.label })); },
    /** Force the reveal at a point (tests; scripted arrivals). */
    reveal(x, z, r = R_WALK) { return mark(x, z, r); },
  };
}
