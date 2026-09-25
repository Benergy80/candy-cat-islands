// ─────────────────────────────────────────────────────────────────────────────
// Candyland architecture KIT
// Shared materials, procedural textures (stripes / waffle / sign atlas), a
// merge-everything geometry builder, and the small reusable parts (lamppost,
// bench, signpost, fence, door, window) that every Candyland building uses.
//
// Everything a building adds goes into a bucket keyed by material; at the end
// `finish()` merges each bucket into ONE mesh → one draw call per material.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// DARK CANDY ALBEDO: the original licorice (0x201626) and chocolate (0x4a2a17)
// sit at ~0.011 and ~0.04 LINEAR luminance. Under a low key they sample as
// 7/1/1 sRGB — i.e. every licorice bridge, dark trim and the chocolate tower
// renders as a hole punched in the frame. These are lifted 3–4× (licorice to
// ~0.04, chocolate to ~0.07, milk chocolate to ~0.12 linear) and licorice
// pieces get their own roughness-0.42 material so they also catch a highlight,
// which is what actually reads as "shiny black candy" rather than "void".
export const C = {
  gingerbread: 0xc07b42, gingerbreadDark: 0x8f5527, gingerbreadLight: 0xd99a5c,
  icing: 0xfff8ee, icingPink: 0xffd6e8, icingMint: 0xd2f7e6, icingLemon: 0xfff0b0,
  wafer: 0xe9c88c, waferDark: 0xc9a05c, waferPale: 0xf6e2b8,
  licorice: 0x3b2c49, licoriceSoft: 0x4d3a5c, licoriceRed: 0xc4173a,
  choc: 0x6b4126, chocMilk: 0x9c6236, chocGlaze: 0x82502c,
  red: 0xff3355, orange: 0xff8c1a, yellow: 0xffe23a, green: 0x5be27a,
  blue: 0x3aa8ff, purple: 0xb35bff, pink: 0xff6fb0, teal: 0x3fd9c0,
  cream: 0xfffaf0, sugar: 0xf3f1ff, sour: 0xd8ff7a, sourDeep: 0x9bd63a,
  stone: 0x8a8598, stoneDark: 0x5e5a6b, syrup: 0xe84d8a, caramel: 0xd98b2b,
  chocolate: 0x6b4126,   // alias for `choc` — several buildings ask for it by name
  lampAmber: 0xffc46b, lampHood: 0xfff1e0, plum: 0x6b5182,
};
export const SPRINKLE = [C.red, C.blue, C.yellow, C.green, C.purple, C.orange];

const STRIPE_COLS = 4;          // columns in the stripe atlas
export const STRIPE_UNIT = 2.6; // world units per full stripe-texture repeat
export const WAFFLE_UNIT = 1.6; // world units per waffle tile

// ── procedural textures ──────────────────────────────────────────────────────
function makeStripeTexture() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'); const img = g.createImageData(S, S);
  const cols = [
    [[228, 32, 62], [255, 250, 244]],   // 0 classic candy cane
    [[64, 200, 150], [255, 253, 246]],  // 1 mint
    [[255, 105, 175], [255, 246, 236]], // 2 bubblegum
    [[124, 74, 40], [244, 219, 176]],   // 3 chocolate wafer
  ];
  const BANDS = 8;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const col = Math.min(STRIPE_COLS - 1, Math.floor(x / (S / STRIPE_COLS)));
    const fx = (x - col * (S / STRIPE_COLS)) / (S / STRIPE_COLS);
    const ph = ((y / S) * BANDS + fx * 2) % 2;           // +2 bands across a column ⇒ seamless helix
    const c = cols[col][ph < 1 ? 0 : 1];
    const i = (y * S + x) * 4;
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function makeWaffleTexture() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff6e2'; g.fillRect(0, 0, S, S);
  const n = 4, cell = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = '#f4e2bd'; g.fillRect(i * cell + 4, j * cell + 4, cell - 8, cell - 8);
  }
  g.strokeStyle = '#b7853f'; g.lineWidth = 5;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// ── sign atlas ───────────────────────────────────────────────────────────────
const CELL = { W: 128, H: 128, COLS: 16, ROWS: 20 };

/** entries: [{ id, cw, ch, draw(g, w, h) }] → { tex, uv:{id:{u0,v0,u1,v1}} }
 *
 * The page is packed on the 128 px cell grid (16 columns × up to 20 rows) and
 * then CROPPED to the rows it actually uses (Contract J): the palace's and the
 * cave's handful of signs used to cost a full 2048 × 2560 page each (~28 MB
 * with mips) for four rows of content. Every cell keeps its 128 px size, so
 * the texel density — and therefore the mip level every sign samples — is
 * exactly what it was; only the unused magenta tail is gone. */
export function makeSignAtlas(entries) {
  const W = CELL.W * CELL.COLS;
  const used = Array.from({ length: CELL.ROWS }, () => new Array(CELL.COLS).fill(false));
  const placed = [];
  // pack tallest-first so first-fit does not fragment
  const sorted = [...entries].sort((a, b) => (b.ch || 1) - (a.ch || 1) || (b.cw || 1) - (a.cw || 1));
  let rows = 1;
  for (const e of sorted) {
    const cw = e.cw || 1, ch = e.ch || 1; let spot = null;
    outer: for (let r = 0; r <= CELL.ROWS - ch; r++) for (let c = 0; c <= CELL.COLS - cw; c++) {
      let ok = true;
      for (let i = 0; i < ch && ok; i++) for (let j = 0; j < cw; j++) if (used[r + i][c + j]) { ok = false; break; }
      if (ok) { spot = { r, c }; break outer; }
    }
    if (!spot) { console.warn('[candy arch] sign atlas full, dropped', e.id); continue; }
    for (let i = 0; i < ch; i++) for (let j = 0; j < cw; j++) used[spot.r + i][spot.c + j] = true;
    placed.push({ e, x: spot.c * CELL.W, y: spot.r * CELL.H, w: cw * CELL.W, h: ch * CELL.H });
    rows = Math.max(rows, spot.r + ch);
  }
  const H = rows * CELL.H;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#ff00ff'; g.fillRect(0, 0, W, H); // magenta = unallocated (should never show)
  const uv = {};
  for (const { e, x, y, w, h } of placed) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y);
    try { e.draw(g, w, h); } catch (err) { console.warn('[candy arch] sign draw failed', e.id, err); }
    g.restore();
    // PADDING: 4 px, not 0.5. Every sign in Candyland shares one atlas and the
    // quads are mipmapped; at mip level 2 a half-pixel inset is already
    // sampling the NEIGHBOURING cell, which is exactly the "SUGAR PIER
    // letterforms corrupt at native res" from round 3 — the corruption was the
    // sign packed next to it bleeding through the strokes. Four texels of quiet
    // margin survives mip 3, which is as small as any of these boards ever gets.
    const pad = 4;
    uv[e.id] = { u0: (x + pad) / W, v0: 1 - (y + h - pad) / H, u1: (x + w - pad) / W, v1: 1 - (y + pad) / H };
  }
  const tex = new THREE.CanvasTexture(cv);
  // anisotropy 4, not 16: A/B-diffed at the sign-heavy views (arrival, village,
  // palace, cupcake, Main Street) — ≤ 0.008% of pixels move, none visibly
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // mobile tier: every atlas (Candyland's, the palace's, the cave's) ≤ 2048
  if (TIER.mobile) halveCanvasTexture(tex, 4);
  return { tex, uv };
}

const FONT = '"Trebuchet MS", "Avenir Next", "Segoe UI", system-ui, sans-serif';
const FAT = '"Arial Black", "Trebuchet MS", system-ui, sans-serif';

/** Set a font that fits `text` inside maxW; size is a FRACTION of h. Returns px width. */
export function fitFont(g, text, frac, h, maxW, fat, weight = 'bold') {
  let px = Math.max(8, frac * h);
  g.font = `${weight} ${px}px ${fat ? FAT : FONT}`;
  let tw = g.measureText(text).width;
  if (tw > maxW) { px *= maxW / tw; g.font = `${weight} ${px}px ${fat ? FAT : FONT}`; tw = g.measureText(text).width; }
  return tw;
}

/**
 * Draw a sign plate. `lines[].size` is a FRACTION of the cell height so the
 * same definition works at any atlas cell size; text auto-shrinks to fit.
 */
export function plate(g, w, h, o = {}) {
  const bg = o.bg || '#fff4e2', edge = o.edge || '#c4173a';
  const u = Math.min(w, h) / 100; // relative unit
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (o.grain !== false) {
    g.globalAlpha = 0.09; g.fillStyle = o.grainColor || '#a9743a';
    for (let i = 0; i < 22; i++) { const y = ((i * 37) % 100) / 100 * h; g.fillRect(0, y, w, u * 1.2); }
    g.globalAlpha = 1;
  }
  if (o.border !== false) { g.strokeStyle = edge; g.lineWidth = (o.borderW || 5) * u; g.strokeRect(3 * u, 3 * u, w - 6 * u, h - 6 * u); }
  if (o.dots) {
    g.fillStyle = o.dotColor || '#ffffff';
    for (const [dx, dy] of [[9 * u, 9 * u], [w - 9 * u, 9 * u], [9 * u, h - 9 * u], [w - 9 * u, h - 9 * u]]) { g.beginPath(); g.arc(dx, dy, 3.6 * u, 0, 7); g.fill(); }
  }
  for (const L of (o.lines || [])) {
    const maxW = w * (L.maxW ?? 0.88);
    const tw = fitFont(g, L.text, L.size || 0.2, h, maxW, L.fat, L.weight || 'bold');
    g.fillStyle = L.color || '#3a2430';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const x = w * (L.x ?? 0.5), y = h * L.y;
    g.fillText(L.text, x, y);
    if (L.strike) {
      g.strokeStyle = L.strikeColor || '#b02030'; g.lineWidth = 2.2 * u;
      g.beginPath(); g.moveTo(x - tw / 2 - 3 * u, y + u); g.lineTo(x + tw / 2 + 3 * u, y - u); g.stroke();
      g.beginPath(); g.moveTo(x - tw / 2 - 3 * u, y - 2 * u); g.lineTo(x + tw / 2 + 3 * u, y + 2.6 * u); g.stroke();
    }
  }
}

// ── quality tier ─────────────────────────────────────────────────────────────
// The kit is shared: Candyland's architecture AND the escape system's palace
// and cave build with it. candy/architecture.js (created before escape) calls
// setKitTier(ctx.state.mobile) first thing, and on the MOBILE tier the kit's
// defaults follow Contract I for every caller:
//   · createBuilder() merges are frustum-culled unless opts.cull === false.
//     Since the frame-rate pass (Contract J) that is the DESKTOP default too:
//     a merged mesh is authored in place, so its bounds are exact — culling it
//     cannot pop anything — and three then also culls it against the key
//     light's shadow frustum, so Cat Island stops drawing Candyland (57 main +
//     40 shadow calls) and the palace/cave merges (escape builds with this kit)
//     stop drawing from across the strait;
//   · makeSignAtlas() hands back the atlas already halved (2048 × 2560 →
//     1024 × 1280, anisotropy ≤ 4 — textures ≤ 2048), and halveCanvasTexture()
//     is idempotent, so a caller that halves again changes nothing.
// createBuilder's optional 4th argument:
//   opts.cull   true/false: merged meshes keep their bounds and ARE (or are
//               not) frustum-culled; omitted → culled (both tiers)
//   opts.split  (x, z) → district id: buckets become "material|district", so
//               one island-wide merge becomes a handful the camera can cull
//               (no longer used by Candyland — see architecture.js's header)
//   opts.forward { key: otherBuilder } — pieces of that material are placed
//               into the other builder instead (a building's additive halo
//               decals join the island halo mesh: one draw call, not one
//               per house)
const TIER = { mobile: false };
/** Set once by candy/architecture.js create(), before any builder or atlas. */
export function setKitTier(mobile) { TIER.mobile = !!mobile; }

/**
 * Mobile only: halve a CanvasTexture in place (2048×2560 → 1024×1280) and drop
 * the big canvas's backing store — iOS caps total canvas memory and the atlas
 * is sampled at a few hundred pixels on a phone screen anyway. UVs are
 * normalised, so every sign quad maps exactly as before.
 */
export function halveCanvasTexture(tex, maxAniso = 4) {
  if (tex.userData.tierHalved) return tex;       // already done (the kit tier, or a caller)
  const src = tex.image;
  if (!src || !src.width) return tex;
  const w = Math.max(1, src.width >> 1), h = Math.max(1, src.height >> 1);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch (e) { /* older canvas */ }
  g.drawImage(src, 0, 0, w, h);
  try { src.width = 0; src.height = 0; } catch (e) { /* not a canvas */ }
  tex.image = cv;
  tex.anisotropy = Math.min(tex.anisotropy, maxAniso);
  tex.needsUpdate = true;
  tex.userData.tierHalved = true;
  return tex;
}

// ── the merge builder ────────────────────────────────────────────────────────
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();

function ensureIndexed(geo) {
  if (!geo.getIndex()) {
    const n = geo.attributes.position.count; const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return geo;
}

/**
 * `keyMap` (optional) renames material keys on the way in, so a SUB-builder can
 * collapse the whole matte/icing/gloss/licorice family onto one cloned material
 * and still be driven by unchanged building code. One bucket = one draw call, so
 * a per-building group that has to fade (an enterable house) costs 2 calls, not 9.
 */
export function createBuilder(mats, signUV, keyMap = null, opts = null) {
  const buckets = new Map();
  const stats = { pieces: 0 };
  // opts.split(x, z) → district id (mobile tier only): buckets become
  // "material|district", so one island-wide merge becomes a handful of
  // district merges the camera can cull.
  const split = opts && typeof opts.split === 'function' ? opts.split : null;
  const cull = opts && opts.cull !== undefined && opts.cull !== null ? !!opts.cull : true;
  const forward = opts && opts.forward ? opts.forward : null;

  function place(key, geo, o) {
    if (keyMap && keyMap[key]) key = keyMap[key];
    if (forward && forward[key]) return forward[key].add(key, geo, o);
    const at = o.at || [0, 0, 0], rot = o.rot || [0, 0, 0];
    let s = o.scale ?? 1; if (typeof s === 'number') s = [s, s, s];
    // YXZ: yaw about world Y is applied LAST, so [pitch, yaw, roll] reads naturally
    _e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'YXZ');
    _q.setFromEuler(_e);
    _m4.compose(_p.set(at[0], at[1], at[2]), _q, _s.set(s[0], s[1], s[2]));
    geo.applyMatrix4(_m4);
    if (!geo.attributes.uv) {
      const n = geo.attributes.position.count;
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    const n = geo.attributes.position.count;
    if (!geo.attributes.color) {
      _c.set(o.color ?? 0xffffff);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    ensureIndexed(geo);
    geo.deleteAttribute('normal'); geo.computeVertexNormals();
    if (split) {
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      key = key + '|' + split((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2);
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(geo);
    stats.pieces++;
    return geo;
  }

  const B = {
    stats,
    add: place,
    box(key, w, h, d, o = {}) { return place(key, new THREE.BoxGeometry(w, h, d), o); },
    cyl(key, rt, rb, h, seg = 10, o = {}) { return place(key, new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open), o); },
    sph(key, r, ws = 10, hs = 8, o = {}) { return place(key, new THREE.SphereGeometry(r, ws, hs, o.phiStart || 0, o.phiLen || Math.PI * 2, o.thetaStart || 0, o.thetaLen || Math.PI), o); },
    cone(key, r, h, seg = 10, o = {}) { return place(key, new THREE.ConeGeometry(r, h, seg, 1, !!o.open), o); },
    tor(key, r, tube, rs = 8, ts = 14, o = {}) { return place(key, new THREE.TorusGeometry(r, tube, rs, ts, o.arc ?? Math.PI * 2), o); },
    ico(key, r, det = 0, o = {}) { return place(key, new THREE.IcosahedronGeometry(r, det), o); },
    plane(key, w, h, o = {}) { return place(key, new THREE.PlaneGeometry(w, h), o); },
    disc(key, r, seg = 20, o = {}) { return place(key, new THREE.CircleGeometry(r, seg), o); },
    cap(key, r, len, o = {}) { return place(key, new THREE.CapsuleGeometry(r, len, 4, 8), o); },

    /** Candy-cane striped cylinder. variant 0..3 selects the stripe colourway. */
    stripeCyl(rt, rb, h, o = {}) {
      const seg = o.seg || 10;
      const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open);
      bandUV(g, o.variant || 0, h / STRIPE_UNIT, o.uvOffset || 0);
      return place('stripe', g, o);
    },
    stripeTor(r, tube, rs, ts, o = {}) {
      const g = new THREE.TorusGeometry(r, tube, rs, ts, o.arc ?? Math.PI * 2);
      // torus: u goes around the ring → map u to the stripe length axis
      const uv = g.attributes.uv; const scale = (r * (o.arc ?? Math.PI * 2)) / STRIPE_UNIT;
      const v0 = (o.variant || 0) / STRIPE_COLS, dv = 1 / STRIPE_COLS;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        uv.setXY(i, v0 + v * dv * 0.98 + dv * 0.01, u * scale);
      }
      return place('stripe', g, o);
    },
    stripeBox(w, h, d, o = {}) {
      const g = new THREE.BoxGeometry(w, h, d);
      bandUV(g, o.variant || 0, (o.axisH ?? h) / STRIPE_UNIT, o.uvOffset || 0);
      return place('stripe', g, o);
    },

    /** Waffle/wafer surface: uv scaled so the tile stays a constant world size. */
    waffleBox(w, h, d, o = {}) {
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv;
      const sx = Math.max(w, d) / WAFFLE_UNIT, sy = Math.max(h, d) / WAFFLE_UNIT;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
      return place('waffle', g, o);
    },
    waffleCyl(rt, rb, h, seg, o = {}) {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open);
      const uv = g.attributes.uv;
      const sx = (2 * Math.PI * Math.max(rt, rb)) / WAFFLE_UNIT, sy = h / WAFFLE_UNIT;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
      return place('waffle', g, o);
    },
    waffleCone(r, h, seg, o = {}) {
      const g = new THREE.ConeGeometry(r, h, seg, 1, !!o.open);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * Math.PI * r) / WAFFLE_UNIT, uv.getY(i) * h / WAFFLE_UNIT);
      return place('waffle', g, o);
    },

    /**
     * A falling SHEET of liquid: `n` lobes round a rim, each one an arc of a
     * cone shell carrying the scrolling flow texture. Flat billboard ribbons
     * read as painted pillars from an isometric camera; a conical shell with
     * gaps between the lobes reads as water coming over a rim. Splash blobs and
     * a ripple ring mark where it lands.
     */
    flowFall(cx, cz, yTop, yBot, rTop, rBot, n, o = {}) {
      const fill = o.fill ?? 0.68, h = Math.max(0.15, yTop - yBot);
      const span = ((Math.PI * 2) / n) * fill;
      const arcLen = span * ((rTop + rBot) / 2);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2 + (o.phase || 0);
        const g = new THREE.CylinderGeometry(rTop, rBot, h, o.seg || 4, 1, true, a0, span);
        const uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (arcLen / 0.7), uv.getY(k) * (h / 0.8));
        place('flow', g, { at: [cx, (yTop + yBot) / 2, cz], color: o.color || 0xffffff });
        const am = a0 + span / 2;
        B.sph('icing', o.splashR ?? 0.44, 8, 6, {
          at: [cx + Math.cos(am) * rBot, yBot + 0.07, cz + Math.sin(am) * rBot],
          scale: [1.25, 0.34, 1.25], color: o.splash || 0xffffff,
        });
      }
      if (o.ripple !== false) for (const k of [0.78, 1.0, 1.18]) {
        B.tor('icing', rBot * k, 0.05, 5, 24, { at: [cx, yBot + 0.05, cz], rot: [Math.PI / 2, 0, 0], color: o.splash || 0xffffff });
      }
    },

    /**
     * A jet of liquid: a tapered tube along a quadratic arc, UV-mapped so the
     * scrolling flow texture runs ALONG the jet. A continuous arc; never a
     * chain of separate spheres that stops in mid-air.
     */
    tubeArc(p0, p1, p2, rA, rB, o = {}) {
      const seg = o.seg || 18, rad = o.rad || 5;
      const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
      const curve = new THREE.QuadraticBezierCurve3(V(p0), V(p1), V(p2));
      const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
      const pos = g.attributes.position, uv = g.attributes.uv;
      const c = new THREE.Vector3(), v = new THREE.Vector3();
      const stride = rad + 1;
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        curve.getPointAt(t, c);
        const r = rA + (rB - rA) * t;
        for (let j = 0; j <= rad; j++) {
          const k = i * stride + j;
          v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
          pos.setXYZ(k, v.x, v.y, v.z);
        }
      }
      const L = curve.getLength();
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k) * 0.5, uv.getX(k) * (L / 0.8));
      g.deleteAttribute('normal');
      return place('flow', g, { color: o.color || 0xffffff });
    },

    /** A flat sign quad textured from the atlas cell `id`. Faces +Z. */
    signQuad(id, w, h, o = {}) {
      const r = signUV[id];
      if (!r) { console.warn('[candy arch] unknown sign', id); return null; }
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
      return place('sign', g, o);
    },

    finish(group) {
      const meshes = {};
      for (const [bkey, list] of buckets) {
        if (!list.length) continue;
        const bar = bkey.indexOf('|');
        const key = bar < 0 ? bkey : bkey.slice(0, bar);
        const district = bar < 0 ? '' : bkey.slice(bar + 1);
        const m = mats[key];
        if (!m) { console.warn('[candy arch] no material for', key); continue; }
        const merged = mergeGeometries(list, false);
        if (!merged) { console.warn('[candy arch] merge failed for', key, list.length); continue; }
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, m);
        mesh.name = 'candyArch_' + key + (district ? '_' + district : '');
        // haloDisc MUST NOT cast: a horizontal additive pool quad that casts a
        // shadow paints a hard-rimmed black blob on the ground right under the
        // lamp it is supposed to be lighting. Same for the liquid sheets.
        const noShadow = key === 'sign' || key === 'glowWarm' || key === 'glowSour' || key === 'windowWarm'
          || key === 'windowPink' || key === 'water' || key === 'haloDisc' || key === 'flow';
        mesh.castShadow = !noShadow; mesh.receiveShadow = true;
        mesh.frustumCulled = cull;
        group.add(mesh); meshes[district ? key + '_' + district : key] = mesh;
        for (const gg of list) gg.dispose();
      }
      buckets.clear();
      return meshes;
    },
  };
  return B;
}

/** Map a geometry's UVs into stripe-atlas column `variant`, repeating v `reps` times. */
function bandUV(geo, variant, reps, offset = 0) {
  const uv = geo.attributes.uv;
  const dv = 1 / STRIPE_COLS, v0 = variant * dv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, v0 + uv.getX(i) * dv * 0.98 + dv * 0.01, uv.getY(i) * reps + offset);
  }
}

// ── materials ────────────────────────────────────────────────────────────────
export function createMaterials() {
  const stripeTex = makeStripeTexture(), waffleTex = makeWaffleTexture();
  const flowTex = makeFlowTexture();
  return {
    tex: { stripeTex, waffleTex, flowTex },
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }),
    matteFlat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, flatShading: true }),
    gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.02 }),
    // licorice: dark but GLOSSY, so it catches a specular streak instead of
    // flattening into a silhouette hole at low light
    licorice: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 }),
    icing: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0 }),
    stripe: new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.34, metalness: 0 }),
    waffle: new THREE.MeshStandardMaterial({ map: waffleTex, vertexColors: true, roughness: 0.85, metalness: 0 }),
    // emissive stays UNDER ~2 at night: ACES tone-mapping turns anything past
    // that into a flat white blob and the warm amber is the whole point.
    glowWarm: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xffa83c, emissiveIntensity: 0.3 }),
    glowSour: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xaaff4d, emissiveIntensity: 0.2 }),
    windowWarm: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, emissive: 0xffbe5c, emissiveIntensity: 0.08 }),
    windowPink: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, emissive: 0xff74b8, emissiveIntensity: 0.08 }),
    water: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.06 }),
    // flat additive decals with a radial falloff: soft lamp glow (crossed
    // quads), ground light pools and window spill. No hard rims anywhere.
    haloDisc: (() => {
      const fall = makeRadialFalloff();
      // emissiveMap (NOT map) is what modulates emissive — with additive
      // blending the black rim adds nothing, so the decal has no hard edge.
      return new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xffb861, emissiveMap: fall, emissiveIntensity: 0,
        roughness: 1, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
        // one pass, both tiers (Contract J): three draws a transparent DoubleSide
        // object twice (back faces, then front) and re-evaluates its program
        // twice a frame; for an additive decal the order cannot matter —
        // A/B-diffed: 0 px at the night views. Clones inherit it.
        forceSinglePass: true,
      });
    })(),
    flow: new THREE.MeshStandardMaterial({ map: flowTex, vertexColors: true, roughness: 0.28, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false }),
  };
}

/** Radial white→black falloff, so additive decals fade instead of showing a hard rim. */
function makeRadialFalloff() {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, '#b9b9b9');
  grd.addColorStop(0.7, '#3a3a3a'); grd.addColorStop(1, '#000000');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * Flowing liquid: a LIGHT texture. The falls are semi-transparent and they
 * overlap each other, so any dark pixel in here compounds — six overlapping
 * strands with a 30%-black streak stack into a dark dome over the fountain.
 * Everything is white-to-light-tint; contrast comes from the bright bands.
 */
function makeFlowTexture() {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#f6f2ff'; g.fillRect(0, 0, S, S);
  // vertical strands of the fall
  for (let i = 0; i < 10; i++) {
    const x = (i * 6.4 + ((i * 13) % 5)) % S;
    g.fillStyle = i % 2 ? 'rgba(214,206,236,.85)' : 'rgba(255,255,255,.95)';
    g.fillRect(x, 0, 2.4, S);
  }
  // travelling ripple bands (this is where the motion reads from)
  for (let i = 0; i < 8; i++) {
    const y = i * (S / 8);
    g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(0, y, S, 3.0);
    g.fillStyle = 'rgba(198,188,226,.7)'; g.fillRect(0, y + 4.5, S, 2.0);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable parts. Each takes the builder + a world position and returns extra
// info (glow positions, collider suggestions) where useful.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A cylinder / cone with a WEDGE MISSING — the Great Cupcake's bitten wrapper,
 * its stepped wafer plinth, the notch in a balcony. `a0`..`a1` are the WORLD
 * angles (atan2(dz, dx), the convention every builder here uses) that are KEPT,
 * sweeping anticlockwise from a0 to a1.
 *
 * Three's CylinderGeometry measures theta from +Z (x = r·sin θ, z = r·cos θ),
 * so world angle a ⇒ θ = π/2 − a, and a sweep of increasing a is a sweep of
 * DECREASING θ: thetaStart = π/2 − a1, thetaLength = a1 − a0.
 *
 * A partial cylinder has no radial faces where it was cut, so `caps:true` adds
 * two thin slabs closing the wedge — without them you see straight through the
 * wall into the middle of the mesh.
 */
export function arcCyl(B, key, rt, rb, h, seg, a0, a1, o = {}) {
  const span = a1 - a0;
  const n = Math.max(3, Math.round(seg * (span / (Math.PI * 2))));
  const g = new THREE.CylinderGeometry(rt, rb, h, n, 1, !!o.open, Math.PI / 2 - a1, span);
  const at = o.at || [0, 0, 0];
  B.add(key, g, o);
  if (o.caps) for (const a of [a0, a1]) {
    const rm = (rt + rb) / 2;
    // local +X must point outward along `a`: place() yaws (1,0,0) → (cos ry, 0, −sin ry)
    B.box(o.capKey || key, rm, h * 0.995, o.capT || 0.18, {
      at: [at[0] + Math.cos(a) * rm * 0.5, at[1], at[2] + Math.sin(a) * rm * 0.5],
      rot: [0, -a, 0], color: o.capColor ?? o.color ?? 0xffffff,
    });
  }
  return g;
}

/** (see arcCyl above for the angle convention) */
export function waffleArc(B, rt, rb, h, seg, a0, a1, o = {}) {
  // A WAFFLE drum, or a wedge of one (a0..a1 world angles, as arcCyl) — so a
  // wafer tower can have a doorway cut in it. The tile stays a constant world
  // size and CONTINUES round the drum (u from the drum's own angle) and up it
  // (`vOff` = how far above the drum's foot this piece starts), so a drum built
  // in two pieces tiles as one. `capTop` keeps the top cap and drops the bottom.
  const span = a1 - a0;
  const n = Math.max(3, Math.round(seg * (span / (Math.PI * 2))));
  const t0 = Math.PI / 2 - a1;
  const g = new THREE.CylinderGeometry(rt, rb, h, n, 1, !o.capTop, t0, span);
  if (o.capTop && g.groups.length > 2) { g.setIndex(Array.from(g.index.array.slice(0, g.groups[2].start))); g.clearGroups(); }
  const uv = g.attributes.uv;
  const sx = (2 * Math.PI * Math.max(rt, rb)) / WAFFLE_UNIT, sy = h / WAFFLE_UNIT, v0 = (o.vOff || 0) / WAFFLE_UNIT;
  const u0 = (t0 / (Math.PI * 2)) * sx, su = (span / (Math.PI * 2)) * sx;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * su, v0 + uv.getY(i) * sy);
  return B.add('waffle', g, o);
}

/**
 * A SIGN WITH A BACK. The shared sign material is DoubleSide, because half the
 * boards in Candyland are read from both sides — which means a LONE quad shows
 * mirrored text to anybody standing behind it (the ghost 'CANDY' panel on the
 * far side of the donut arch was exactly this, two coplanar quads z-fighting
 * with no board between them). Everything that is not a two-sided board goes
 * through here and gets an opaque plate behind it.
 *
 * `both:true` puts a correctly-oriented face on each side of the plate.
 */
export function plaque(B, id, w, h, o = {}) {
  const at = o.at || [0, 0, 0], rot = o.rot || [0, 0, 0];
  const pitch = rot[0] || 0, yaw = rot[1] || 0, t = o.t ?? 0.14;
  const cp = Math.cos(pitch);
  const n = [Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp];
  const off = t / 2 + 0.04;
  B.box(o.key || 'matte', w + (o.pad ?? 0.22), h + (o.pad ?? 0.22), t, { at, rot, color: o.color ?? C.waferPale });
  B.signQuad(id, w, h, { at: [at[0] + n[0] * off, at[1] + n[1] * off, at[2] + n[2] * off], rot });
  if (o.both) {
    B.signQuad(id, w, h, {
      at: [at[0] - n[0] * off, at[1] - n[1] * off, at[2] - n[2] * off],
      rot: [-pitch, yaw + Math.PI, -(rot[2] || 0)],
    });
  }
}

/**
 * A soft omnidirectional glow: three crossed quads carrying a radial falloff in
 * the additive `haloDisc` material. Reads as a soft bloom from any angle and
 * has no hard silhouette (unlike an additive sphere shell).
 */
export function softGlow(B, x, y, z, size = 2.2) {
  B.plane('haloDisc', size, size, { at: [x, y, z] });
  B.plane('haloDisc', size, size, { at: [x, y, z], rot: [0, Math.PI / 2, 0] });
  B.plane('haloDisc', size * 0.9, size * 0.9, { at: [x, y, z], rot: [-Math.PI / 2, 0, 0] });
}

/**
 * Candy-cane lamppost with an emissive gumdrop lamp. Returns the lamp position
 * so the caller can hang a PointLight on it.
 *
 * Head anatomy (nothing intersects anything, so no torn/serrated edges):
 *   globe  – amber emissive sphere sitting on the post top
 *   cap    – a squashed cream dome that meets the globe almost tangentially
 *   finial – a small red cone resting on the cap apex, with a bead on top
 * Plus a soft additive bloom (crossed radial-falloff quads) and an elliptical
 * warm pool on the ground. Never a dark cone: a black shape against the night
 * sky reads as a hole punched in the scene.
 */
export function lamppost(B, x, y, z, o = {}) {
  // POST HEIGHT: 3.1, not 4.2. At the game camera (distance 31, elevation 0.64)
  // a head 4.9 units up sits ABOVE the top of the frame whenever the lamp is in
  // the upper half of the shot — which is how you end up with a scene full of
  // warm pools and no visible fixtures. At 3.1 the head is in frame, and a
  // 3.9-unit lantern beside a 1.7-unit visitor still reads as a lamppost.
  const h = o.h || 3.1, variant = o.variant ?? 0;
  // base collar: plum, not black, with a cream bead so it never reads as a void
  B.cyl('matte', 0.44, 0.56, 0.34, 10, { at: [x, y + 0.17, z], color: C.plum });
  B.tor('icing', 0.5, 0.1, 6, 12, { at: [x, y + 0.34, z], rot: [Math.PI / 2, 0, 0], color: C.icingPink });
  B.stripeCyl(0.17, 0.2, h, { at: [x, y + 0.34 + h / 2, z], variant, seg: 8 });

  // HEAD: a lantern, not a bead. 0.78 radius (was 0.52) with a wide cream hood
  // and three licorice ribs — the ribs are what make the fixture read as a
  // LANTERN in daylight, and read as a dark cage against the glow at night.
  // The hood stays SMALL. A wide conical shade over the globe is correct for a
  // real street lamp and completely wrong here: the game camera looks DOWN at
  // 0.64 radians, so a shade wider than the globe turns every lamp in the
  // village into a grey umbrella with the light hidden underneath it. The globe
  // is the silhouette; the cap is a hat on it.
  const R = o.r ?? 0.62, ly = y + 0.34 + h + R * 0.9;
  B.cyl('matte', 0.14, 0.14, 0.34, 6, { at: [x, ly - R * 0.95, z], color: C.licorice });
  B.sph(o.sour ? 'glowSour' : 'glowWarm', R, 11, 8, { at: [x, ly, z], scale: [1, 1.08, 1], color: o.lampColor || 0xffb03c });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    B.box('licorice', 0.09, R * 1.9, 0.09, { at: [x + Math.cos(a) * R * 1.04, ly, z + Math.sin(a) * R * 1.04], rot: [0, -a, 0], color: C.licorice });
  }
  B.sph('icing', R * 0.52, 9, 6, { at: [x, ly + R * 0.86, z], scale: [1, 0.5, 1], color: o.hood || C.lampHood });
  B.cone('gloss', 0.22, 0.34, 9, { at: [x, ly + R * 0.86 + 0.3, z], color: C.red });
  B.sph('gloss', 0.13, 6, 5, { at: [x, ly + R * 0.86 + 0.52, z], color: C.red });

  softGlow(B, x, ly, z, o.glow ?? 2.6);
  lightPool(B, x, y, z, o.pool ?? 2.2);
  return { x, y: ly, z };
}

/**
 * A soft elliptical warm pool on the ground under a lamp (additive, no rim).
 * Kept SMALLER than the fixture's apparent size on purpose: a 2.7-unit blaze
 * under a 1-unit lamp head reads as "a glowing puddle with nothing above it".
 */
export function lightPool(B, x, y, z, r = 2.2) {
  B.disc('haloDisc', r, 20, { at: [x, y + 0.11, z], rot: [-Math.PI / 2, 0, 0], scale: [1.24, 1, 1] });
}

/** Wafer bench, forward = +Z. Pass `A` and it registers its own box collider. */
export function bench(B, x, y, z, rotY = 0, o = {}) {
  const w = o.w || 2.6;
  if (o.A) o.A.collideBox(x, z, w, 1.0, rotY, y + 1.15);
  const g = (dx, dy, dz, sx, sy, sz, key, col) => {
    const cs = Math.cos(rotY), sn = Math.sin(rotY);
    B.box(key, sx, sy, sz, { at: [x + dx * cs + dz * sn, y + dy, z - dx * sn + dz * cs], rot: [0, rotY, 0], color: col });
  };
  // legs
  for (const s of [-1, 1]) g(s * (w / 2 - 0.24), 0.32, 0, 0.22, 0.64, 0.9, 'licorice', C.licorice);
  // seat + back (wafer)
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  B.waffleBox(w, 0.18, 0.9, { at: [x, y + 0.68, z], rot: [0, rotY, 0], color: C.waferPale });
  B.waffleBox(w, 0.72, 0.16, { at: [x - 0.38 * sn, y + 1.06, z - 0.38 * cs], rot: [0.13, rotY, 0], color: C.waferPale });
  for (const s of [-1, 1]) g(s * (w / 2 - 0.24), 1.0, -0.42, 0.2, 0.66, 0.16, 'licorice', C.licorice);
  return { x, z, r: 1.1 };
}

/**
 * Signpost: a striped post with up to 4 arms, each an atlas sign.
 * Returns { x, z, r } — a collider generous enough that the player is stopped
 * clear of the arms instead of climbing onto them.
 */
export function signpost(B, x, y, z, arms, o = {}) {
  // Arms were 2.8 × 0.62 on a 3.6 post — four times player height and reading as
  // motorway signage in a village of 6-unit cottages. Down ~25%: still legible
  // at the game camera (the atlas text auto-fits), no longer the biggest object
  // in the frame.
  const h = (o.h || 3.6) * 0.9;
  B.cyl('matte', 0.5, 0.62, 0.34, 10, { at: [x, y + 0.17, z], color: C.plum });
  B.tor('icing', 0.56, 0.1, 6, 12, { at: [x, y + 0.34, z], rot: [Math.PI / 2, 0, 0], color: C.icingLemon });
  B.stripeCyl(0.16, 0.2, h, { at: [x, y + h / 2 + 0.2, z], variant: o.variant ?? 2, seg: 8 });
  B.sph('matte', 0.3, 8, 6, { at: [x, y + h + 0.34, z], color: o.knobColor ?? C.red });
  arms.forEach((a, i) => {
    const ay = y + h - 0.42 - i * 0.6;
    const dir = a.dir, dx = Math.sin(dir), dz = Math.cos(dir);
    const fx = Math.cos(dir), fz = -Math.sin(dir);   // the arm's FACE normal
    const w = a.w || 2.1, off = 0.24 + w / 2;
    const px = x + dx * off, pz = z + dz * off;
    B.box('matte', w, 0.46, 0.12, { at: [px, ay, pz], rot: [0, dir + Math.PI / 2, 0], color: C.waferPale });
    // a pointed tip, so it reads as a direction arm
    const tip = off + w / 2 + 0.125;
    B.cyl('matte', 1, 1, 1, 3, { at: [x + dx * tip, ay, z + dz * tip], rot: [0, dir, -Math.PI / 2], scale: [0.266, 0.12, 0.25], color: C.waferPale });
    B.signQuad(a.id, w * 0.94, 0.37, { at: [px + fx * 0.085, ay, pz + fz * 0.085], rot: [0, dir + Math.PI / 2, 0] });
    B.signQuad(a.id, w * 0.94, 0.37, { at: [px - fx * 0.085, ay, pz - fz * 0.085], rot: [0, dir - Math.PI / 2, 0] });
  });
  return { x, z, r: 0.85 };
}

/**
 * Low licorice picket fence along a polyline of [x,z] points.
 * Pass `A` (the architecture rig) and each run registers an oriented box
 * collider — a fence you can walk through is worse than no fence, and at 0.9
 * tall the player can still jump it (colliders honour `h`).
 */
export function fenceLine(B, pts, groundY, o = {}) {
  // 0.78 between pickets, not 0.62, and the gumdrop tip is a 20-face
  // icosahedron rather than a 60-triangle sphere. There are now ~320 pickets in
  // Candyland (every house has a front garden) and at this size the two read
  // identically — the saving is about 14k triangles, a whole landmark's worth.
  const h = o.h || 0.9, gap = o.gap || 0.78;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / gap));
    const dir = Math.atan2(bx - ax, bz - az);
    // A fence is solid — but never across a road: a decorative run that happens
    // to skirt a path would otherwise wall the path off.
    const cx0 = (ax + bx) / 2, cz0 = (az + bz) / 2;
    if (o.A && !o.A.world.onPath(cx0, cz0, 0.8)) o.A.collideBox(cx0, cz0, 0.26, len, dir, groundY(cx0, cz0) + h);
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const y = groundY(x, z);
      B.box('licorice', 0.15, h, 0.15, { at: [x, y + h / 2, z], rot: [0, dir, 0], color: o.color || C.licorice });
      if (o.tips !== false) B.ico('gloss', 0.155, 0, { at: [x, y + h + 0.05, z], rot: [0.4, k * 0.7, 0], color: o.tipColor || SPRINKLE[k % SPRINKLE.length] });
    }
    // two rails
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (groundY(ax, az) + groundY(bx, bz)) / 2;
    for (const ry of [h * 0.34, h * 0.74]) B.box('licorice', 0.09, 0.09, len, { at: [mx, my + ry, mz], rot: [0, dir, 0], color: o.color || C.licorice });
  }
}

/**
 * A gumdrop-button door with icing frame. Faces +Z in local space of rotY.
 * DECORATIVE: the icing frame is a slab behind the leaf, so this door never
 * opens and never gets a collider gap. A door you can walk through is a
 * `doorway()` (below); `leaf:false` is routed there so no enterable door can
 * ever again be a white slab standing in its own opening.
 */
export function door(B, x, y, z, rotY, o = {}) {
  if (o.leaf === false) return doorway(B, x, y, z, rotY, o);
  const w = o.w || 1.15, h = o.h || 2.0;
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  const at = (dz) => [x + sn * dz, 0, z + cs * dz];
  const p0 = at(0.06), p1 = at(0.12), p2 = at(0.2);
  // `leaf:false` = the jamb only; the swinging leaf comes from the shared
  // instanced door mesh (see architecture.js doorLeafGeo) instead.
  B.box('matte', w + 0.3, h + 0.26, 0.14, { at: [p0[0], y + h / 2, p0[2]], rot: [0, rotY, 0], color: o.frame || C.icing });
  if (o.leaf !== false) B.box('matte', w, h, 0.12, { at: [p1[0], y + h / 2, p1[2]], rot: [0, rotY, 0], color: o.color || C.chocMilk });
  B.sph('icing', w * 0.62, 10, 6, { at: [p0[0], y + h, p0[2]], rot: [0, rotY, 0], scale: [1, 0.62, 0.14], color: o.frame || C.icing });
  if (o.leaf !== false) {
    // gumdrop button doorknob + icing panel lines
    B.sph('gloss', 0.17, 8, 7, { at: [p2[0] + cs * (w * 0.3), y + h * 0.52, p2[2] - sn * (w * 0.3)], color: o.knob || C.yellow, scale: [1, 1, 0.7] });
    for (const dy of [h * 0.28, h * 0.64]) B.box('icing', w * 0.66, 0.06, 0.06, { at: [p2[0], y + dy, p2[2]], rot: [0, rotY, 0], color: o.frame || C.icing });
  }
  return { x: p2[0], y: y + h * 0.5, z: p2[2] };
}

/**
 * A WALK-THROUGH DOORWAY SURROUND (docs/BRIEF.md Contract O). The CLEAR opening
 * is exactly `w` × `h`: the icing pilasters stand OUTSIDE it (inner faces at
 * ±w/2) and the head sits ON it, so a wall gap cut with the same `w` — and the
 * collider gap that goes with it — matches what you see to the centimetre.
 * Nothing of the surround hangs into the opening (the old frame was a slab
 * across it with a half-dome dipping into the top). The leaf is the shared
 * instanced door in architecture.js, sized to the same w × h.
 * Faces +Z of rotY; (x, z) = the OUTER wall face at the door's centre line,
 * y = the foot of the jambs (the ground; the sill may sit higher).
 *   o.jamb  pilaster width (0.26)      o.depth  front-to-back (0.24, 0.04 of it in the wall)
 *   o.frame icing colour               o.knob   keystone gumdrop colour
 *   o.head / o.arch / o.key / o.base  false drops the lintel, the icing eyebrow,
 *   the keystone, the gumdrop plinths (a building with its own lintel keeps it)
 */
export function doorway(B, x, y, z, rotY, o = {}) {
  const w = o.w ?? 1.6, h = o.h ?? 2.5, jw = o.jamb ?? 0.26, dp = o.depth ?? 0.24;
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  const P = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
  const frame = o.frame ?? C.icing;
  const fz = dp / 2 - 0.04;                        // 0.04 buried in the wall face
  const R = { rot: [0, rotY, 0] };
  for (const s of [-1, 1]) {
    B.box('matte', jw, h, dp, { at: P(s * (w / 2 + jw / 2), h / 2, fz), ...R, color: frame });
    // a plinth block at each foot, wider only OUTWARD (the inner face stays on ±w/2)
    if (o.base !== false) B.box('matte', jw + 0.08, 0.34, dp + 0.08, { at: P(s * (w / 2 + (jw + 0.08) / 2), 0.17, fz + 0.02), ...R, color: o.baseColor ?? frame });
  }
  const top = o.head !== false ? h + 0.26 : h;
  if (o.head !== false) B.box('matte', w + jw * 2 + 0.14, 0.26, dp + 0.06, { at: P(0, h + 0.13, fz + 0.01), ...R, color: frame });
  // the icing EYEBROW: the top half of a flattened dome, sitting on the head
  const Rb = w / 2 + jw, rise = Math.min(0.46, Rb * 0.42);
  if (o.arch !== false) B.sph('icing', Rb, 14, 5, { at: P(0, top, fz), ...R, scale: [1, rise / Rb, 0.16 / Rb], thetaLen: Math.PI / 2, color: frame });
  if (o.key !== false) B.sph('gloss', 0.19, 8, 6, { at: P(0, top + (o.arch !== false ? rise * 0.82 : 0.12), fz + 0.1), scale: [1, 0.86, 0.8], color: o.knob ?? C.pink });
  const f = P(0, 0, dp + 0.02);
  return { x: f[0], y: y + h * 0.5, z: f[2], top: y + top + (o.arch !== false ? rise : 0) + 0.2 };
}

/**
 * A candy cane built from alternating solid segments instead of the striped
 * atlas material — for sub-builders (roofs, shells) that only carry one
 * vertex-coloured material and still want a red/cream ridge pole.
 * Runs along the local X of `rotY`, centred on (x,y,z).
 */
export function caneRun(B, key, x, y, z, rotY, len, r, o = {}) {
  const n = Math.max(2, Math.round(len / (o.band || 0.42)));
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  const seg = len / n;
  for (let i = 0; i < n; i++) {
    const d = -len / 2 + seg * (i + 0.5);
    B.cyl(key, r, r, seg * 1.02, 7, {
      at: [x + cs * d, y, z - sn * d], rot: [0, rotY, Math.PI / 2],
      color: i % 2 ? (o.colorB || C.cream) : (o.colorA || C.licoriceRed),
    });
  }
}

/** Emissive window pane + icing frame + optional shutters. `dark:true` = unlit at night. */
export function windowPane(B, x, y, z, rotY, o = {}) {
  const w = o.w || 0.9, h = o.h || 0.9;
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  const px = (d) => x + sn * d, pz = (d) => z + cs * d;
  B.box('matte', w + 0.24, h + 0.24, 0.1, { at: [px(0.05), y, pz(0.05)], rot: [0, rotY, 0], color: o.frame || C.icing });
  if (o.dark) {
    // an unlit window: cool slate glass. A village where EVERY pane glows reads
    // as a lighting bug; a few dark ones make the lit ones mean someone is home.
    B.box('matte', w, h, 0.08, { at: [px(0.12), y, pz(0.12)], rot: [0, rotY, 0], color: o.glass || 0x4a4258 });
  } else
  B.box(o.pink ? 'windowPink' : 'windowWarm', w, h, 0.08, { at: [px(0.12), y, pz(0.12)], rot: [0, rotY, 0], color: o.glass || 0xffe9b8 });
  B.box('matte', 0.07, h + 0.1, 0.06, { at: [px(0.17), y, pz(0.17)], rot: [0, rotY, 0], color: o.frame || C.icing });
  B.box('matte', w + 0.1, 0.07, 0.06, { at: [px(0.17), y, pz(0.17)], rot: [0, rotY, 0], color: o.frame || C.icing });
  if (o.sill !== false) B.box('matte', w + 0.42, 0.1, 0.22, { at: [px(0.12), y - h / 2 - 0.16, pz(0.12)], rot: [0, rotY, 0], color: o.frame || C.icing });
  // Light spilling onto the wall around the pane at night (soft, additive).
  // 2.6× the pane, plus a second wider, fainter wash: one tight decal reads as
  // a glowing rectangle stuck on the wall; two stacked ones read as light.
  if (o.spill !== false && !o.dark) {
    B.plane('haloDisc', (w + 0.3) * 2.1, (h + 0.3) * 2.0, { at: [px(0.22), y, pz(0.22)], rot: [0, rotY, 0] });
    B.plane('haloDisc', (w + 0.3) * 3.1, (h + 0.3) * 2.7, { at: [px(0.20), y - 0.1, pz(0.20)], rot: [0, rotY, 0] });
  }
  return { x: px(0.12), y, z: pz(0.12) };
}

/**
 * Icing scallop drip along an eave edge (a run of overlapping spheres).
 * 5×4 segments, not 8×6: there are ~600 of these across Candyland and at a
 * 0.22 radius nobody can tell them apart, but the difference is ~20k triangles
 * — which is a whole giant cupcake's worth of budget.
 */
export function icingDrip(B, x, y, z, rotY, len, o = {}) {
  const n = Math.max(2, Math.round(len / (o.step || 0.68)));
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  for (let i = 0; i <= n; i++) {
    const d = -len / 2 + (len * i) / n;
    const drop = (o.drop || 0.26) * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7)));
    B.sph('icing', o.r || 0.27, 5, 4, { at: [x + cs * d, y - drop * 0.3, z - sn * d], scale: [1, 1 + drop * 2.2, 1], color: o.color || C.icing });
  }
}
