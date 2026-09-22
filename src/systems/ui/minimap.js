// ─────────────────────────────────────────────────────────────────────────────
// MINIMAP — a TOWN map, not a green field.
//   • LOCAL mode (default): 120 world units across, centred on the player.
//   • WORLD mode: the whole archipelago. M cycles local → world → hidden.
//   • CAVE mode: automatic. When the player is inside the undersea corridor the
//     chart is useless, so we draw the corridor itself from
//     ctx.systems.escape.routes.cave.waypoints.
//
// The chart is baked ONCE into an offscreen canvas (1.6 px per world unit,
// transparent where there is sea) and blitted per frame. Baked in, bottom to
// top: a sand halo + ink coastline, the land with height relief, the syrup
// river, the chocolate lake, a TREELINE stipple over the wild ground, the
// STREET bands (a light band the real width of each path, plus plaza aprons),
// and then — at world:ready, once every builder has registered its walls —
// BUILDING FOOTPRINTS: every box collider and every architecture interior,
// unioned, holes flood-filled, stamped as darker blocks. Twenty buildings now
// read as twenty buildings.
//
// The streets are kept as their own layer twice over (cream for day, moonlit
// blue for night) so the night pass can dim the land and then put the roads
// BACK ON TOP: at 23:00 the town still has a street plan instead of one flat
// blue wash.
// ─────────────────────────────────────────────────────────────────────────────
import { POI_PATHS } from './glyphs.js';

const X0 = -305, X1 = 305, Z0 = -125, Z1 = 125;  // charted world
const PPU = 1.6;                                  // chart pixels per world unit
const W = 196, H = 118;                           // minimap size in css px
const SPAN_LOCAL = 120;                           // world units across in local mode
const SPAN_CAVE = 150;                            // world units across underground
const INK = '#2b2442';
const TAU = Math.PI * 2;

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

export function createMinimap(ctx) {
  const world = ctx.world;
  const dpr = Math.min(2, ctx.shot ? 1 : (window.devicePixelRatio || 1));

  const el = document.createElement('div');
  el.className = 'cci cci-plate cci-map';
  // The footer names WHERE YOU ARE. It reads the landmark you are standing in
  // and only falls back to the island when you are genuinely between places.
  el.innerHTML = '<canvas></canvas><div class="cci-map-foot"><span class="cci-map-pin"></span><span class="cci-map-here"></span></div>';
  const hereEl = el.querySelector('.cci-map-here');
  const cv = el.querySelector('canvas');
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d');

  // ── static chart, built once ───────────────────────────────────────────────
  const BW = Math.round((X1 - X0) * PPU), BH = Math.round((Z1 - Z0) * PPU);
  const cx2 = (x) => (x - X0) * PPU, cz2 = (z) => (z - Z0) * PPU;
  const mkCanvas = () => { const c = document.createElement('canvas'); c.width = BW; c.height = BH; return c; };

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
    const mc = m.getContext('2d');
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

  /** A small cream plate naming the nearest marker. */
  function label(x, y, text) {
    g.font = '900 8.5px "Nunito", "Trebuchet MS", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let t = String(text);
    let tw = g.measureText(t).width;
    while (tw > 88 && t.length > 4) { t = t.slice(0, -2); tw = g.measureText(t + '…').width; }
    if (t !== String(text)) { t += '…'; tw = g.measureText(t).width; }
    const bw = tw + 10, bh = 12.5;
    const bx = Math.max(3 + bw / 2, Math.min(W - 3 - bw / 2, x));
    const by = Math.max(bh / 2 + 2, Math.min(H - bh / 2 - 2, y));
    g.beginPath();
    if (g.roundRect) g.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 5);
    else g.rect(bx - bw / 2, by - bh / 2, bw, bh);
    g.fillStyle = 'rgba(255,248,236,.97)'; g.fill();
    g.lineWidth = 1.7; g.strokeStyle = INK; g.stroke();
    g.fillStyle = INK; g.fillText(t, bx, by + 0.5);
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

  function drawPlayer(mx, mz, pl) {
    if (!pl) return;
    const x = Math.max(8, Math.min(W - 8, mx(pl.x))), y = Math.max(8, Math.min(H - 8, mz(pl.z)));
    g.save(); g.translate(x, y); g.rotate(Math.PI - (ctx.systems.player.facing || 0));
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
    const nx = W - 13, ny = 13;
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
      g.fillText(caption.toUpperCase(), 7, H - 8);
    }
  }

  /** mode: 'local' | 'world' */
  function draw(mode, visited, hereId) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!structDone && ctx.state.elapsed > 0) bakeStructures();   // world:ready may never have fired

    const cave = inCave();
    if (cave) { drawCave(cave); return; }

    const pl = ctx.systems.player?.position;
    const spanX = mode === 'world' ? (X1 - X0) : SPAN_LOCAL;
    const scale = W / spanX;
    const spanZ = H / scale;
    const cx = mode === 'world' ? (X0 + X1) / 2 : (pl?.x ?? 0);
    const cz = mode === 'world' ? (Z0 + Z1) / 2 : (pl?.z ?? 0);
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

    // landmarks — pictograms up close, plain dots in the world view (where 18
    // glyph discs would swamp the islands). Markers outside the frame become
    // rim markers below rather than being drawn half-clipped at the edge.
    const glyphs = mode === 'local';
    const px = pl ? mx(pl.x) : -999, py = pl ? mz(pl.z) : -999;
    const offFrame = [], shown = [];
    for (const id in world.LANDMARKS) {
      const lm = world.LANDMARKS[id];
      const x = mx(lm.x), y = mz(lm.z);
      const inset = glyphs && POI[id] ? 11 : 3;
      if (x < inset || x > W - inset || y < inset || y > H - inset) {
        // Off the edge of the zoomed view: remember it for a rim marker, so the
        // local map still says which way the pier / the peak / the lake lie.
        if (glyphs && POI[id] && pl) offFrame.push({ id, x, y, d: Math.hypot(lm.x - pl.x, lm.z - pl.z), seen: visited.has(id) });
        continue;
      }
      // Don't stack a POI disc under the player chevron (standing in a landmark
      // put the two on top of each other): the glow ring says "you are here".
      const underPlayer = Math.hypot(x - px, y - py) < 12;
      const seen = visited.has(id);
      if (id === hereId) {
        g.fillStyle = 'rgba(255,201,74,.5)';
        g.beginPath(); g.arc(x, y, glyphs && POI[id] ? 14 : 7, 0, TAU); g.fill();
      }
      if (underPlayer) continue;
      if (glyphs && POI[id]) {
        shown.push({ id, x, y, seen, lm, d: pl ? Math.hypot(lm.x - pl.x, lm.z - pl.z) : 1e9 });
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
    for (let i = marks.length - 1; i >= 0; i--) {
      const s = marks[i];
      glyph(s.x, s.y, POI[s.id], s.seen ? 1 : 0.55, 1, TINT[s.lm.island] || TINT.candy);
    }

    // the three nearest off-frame POIs, pinned to the rim on the line from the
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
      }
    }

    // ferry
    const fp = ferryPos();
    if (fp) {
      const x = mx(fp.x), y = mz(fp.z);
      g.fillStyle = '#fff8ec'; g.strokeStyle = INK; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x - 5, y - 2.5); g.lineTo(x + 5, y - 2.5); g.lineTo(x + 3, y + 3); g.lineTo(x - 3, y + 3);
      g.closePath(); g.fill(); g.stroke();
    }

    // player chevron — the loudest thing on the map
    drawPlayer(mx, mz, pl);

    // ONE name on the chart: whichever marker you are closest to. More than one
    // label and the map is a word search. It sits under its disc unless that
    // would land it on the player chevron, in which case it goes above.
    const near = marks[0];
    if (near && near.lm.label && near.lm.label !== '???') {
      const below = near.y + 18, above = near.y - 18;
      const clash = (yy) => Math.abs(yy - py) < 15 && Math.abs(near.x - px) < 62;
      label(near.x, clash(below) && !clash(above) ? above : below, near.lm.label);
    }

    frameMarks(null);
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

  return { el, draw, setPlace };
}
