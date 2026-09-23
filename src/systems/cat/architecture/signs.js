// ─────────────────────────────────────────────────────────────────────────────
// SIGN ATLAS — every painted surface in town (shop fascias, awning stripes,
// wanted posters, menu boards, the map that says YOU ARE HERE (FOREVER)) is
// drawn into one shared CanvasTexture and mapped by UV, so ~90 signs cost one
// draw call instead of ninety.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const PAD = 6;
const SANS = '"Trebuchet MS", "Segoe UI", Helvetica, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = '"Courier New", monospace';
export const FONTS = { SANS, SERIF, MONO };

export class SignAtlas {
  constructor(size = 2048) {
    this.size = size;
    this.pages = [];
    this._newPage();
  }
  _newPage() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = this.size;
    const g = cv.getContext('2d');
    g.fillStyle = '#f3ece0'; g.fillRect(0, 0, this.size, this.size);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.pages.push({ cv, g, tex, x: PAD, y: PAD, shelf: 0 });
    return this.pages.length - 1;
  }
  _alloc(w, h) {
    for (let i = 0; i < this.pages.length; i++) {
      const p = this.pages[i];
      if (p.x + w + PAD > this.size) { p.y += p.shelf + PAD; p.x = PAD; p.shelf = 0; }
      if (p.y + h + PAD <= this.size) {
        const r = { page: i, x: p.x, y: p.y, w, h };
        p.x += w + PAD; p.shelf = Math.max(p.shelf, h);
        return r;
      }
    }
    // 4 pages: the painted wall adverts, gym posters and ground decals added in
    // the night/legibility pass overflowed 3. Unused pages are never allocated
    // (_newPage is lazy) and a page only becomes a draw call if a cell lands on it.
    if (this.pages.length >= 4) { console.warn('[cat/arch] sign atlas FULL — a sign is rendering garbage UVs'); return { page: 0, x: 0, y: 0, w, h }; }
    this._newPage();
    return this._alloc(w, h);
  }
  /** Draw into a new cell. `draw(g, W, H)` works in cell-local pixels. */
  cell(pxW, pxH, draw) {
    pxW = Math.max(16, Math.round(pxW)); pxH = Math.max(16, Math.round(pxH));
    const a = this._alloc(pxW, pxH);
    const p = this.pages[a.page], g = p.g;
    g.save();
    g.translate(a.x, a.y);
    g.beginPath(); g.rect(-2, -2, pxW + 4, pxH + 4); g.clip();
    draw(g, pxW, pxH);
    g.restore();
    const s = this.size;
    return { page: a.page, u0: a.x / s, v0: 1 - (a.y + pxH) / s, u1: (a.x + pxW) / s, v1: 1 - a.y / s, aspect: pxW / pxH };
  }
  /** World-sized convenience: resolution follows physical size. */
  panel(worldW, worldH, draw, dpu = 74) {
    return this.cell(Math.min(760, worldW * dpu), Math.min(760, worldH * dpu), draw);
  }
  commit() { for (const p of this.pages) p.tex.needsUpdate = true; }
  /**
   * Mobile tier only (docs/BRIEF.md Contract I): after commit(), resample every
   * page to half size (2048² → 1024²), cap anisotropy and release the 2048
   * canvases (iOS caps total canvas memory). Cell UVs are normalised, so every
   * sign still maps exactly; nothing may be drawn into the atlas afterwards.
   */
  halve(maxAniso = 4) {
    for (const p of this.pages) {
      const src = p.cv, w = Math.max(1, src.width >> 1), h = Math.max(1, src.height >> 1);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch (e) { /* older canvas */ }
      g.drawImage(src, 0, 0, w, h);
      src.width = 0; src.height = 0;
      p.cv = cv; p.g = g;
      p.tex.image = cv;
      p.tex.anisotropy = Math.min(p.tex.anisotropy, maxAniso);
      p.tex.needsUpdate = true;
    }
  }
  /**
   * Mobile tier only, after halve(): draw every page into ONE canvas (up to
   * four 1024² pages on a 2 × 2 grid → 2048², still ≤ 2048) so every sign in
   * town shares one `sign0` and one `signglow0` material — the town pools and
   * each shell then cost one sign call instead of one per page. Returns the
   * grid { C, R } for Kit.remapPages (a page-p UV (u, v) lands at
   * ((col + u) / C, (R − 1 − row + v) / R)), or null when there is one page.
   * Nothing may be drawn into the atlas afterwards.
   */
  combine() {
    const n = this.pages.length;
    if (n <= 1) return null;
    const C = 2, R = Math.ceil(n / C);
    const ps = this.pages[0].cv.width;
    const cv = document.createElement('canvas'); cv.width = ps * C; cv.height = ps * R;
    const g = cv.getContext('2d');
    g.fillStyle = '#f3ece0'; g.fillRect(0, 0, cv.width, cv.height);
    let aniso = 4;
    this.pages.forEach((p, i) => {
      g.drawImage(p.cv, (i % C) * ps, Math.floor(i / C) * ps);
      aniso = Math.min(aniso, p.tex.anisotropy);
      p.cv.width = 0; p.cv.height = 0; p.tex.dispose();
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.pages = [{ cv, g, tex, x: 0, y: 0, shelf: 0 }];
    return { C, R };
  }
}

// ── drawing helpers ──────────────────────────────────────────────────────────
export function fitFont(g, text, maxW, px, weight = 'bold', family = SANS, spacing = 0) {
  for (let i = 0; i < 24; i++) {
    g.font = `${weight} ${px}px ${family}`;
    try { g.letterSpacing = spacing + 'px'; } catch (e) { /* older canvas */ }
    if (g.measureText(text).width <= maxW || px <= 7) break;
    px *= 0.93;
  }
  return px;
}

/**
 * Stack of centred text lines inside a cell.
 * lines: [{ t, s (0..1 of H), c, weight, family, spacing, outline, shadow, align }]
 */
export function drawLines(g, W, H, lines, o = {}) {
  const padX = (o.padX ?? 0.06) * W;
  const maxW = W - padX * 2;
  const gap = (o.gap ?? 0.06) * H;
  const sizes = lines.map((l) => (l.s ?? 0.4) * H);
  let total = sizes.reduce((a, b) => a + b, 0) + gap * (lines.length - 1);
  const scale = Math.min(1, (H * (o.fill ?? 0.86)) / total);
  let y = (H - total * scale) / 2;
  g.textBaseline = 'top'; g.textAlign = 'center';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const px = fitFont(g, l.t, maxW, sizes[i] * scale, l.weight ?? 'bold', l.family ?? o.family ?? SANS, l.spacing ?? 0);
    const cx = l.align === 'left' ? padX : l.align === 'right' ? W - padX : W / 2;
    g.textAlign = l.align || 'center';
    if (l.shadow !== false) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillText(l.t, cx + px * 0.045, y + sizes[i] * scale * 0.12 + px * 0.05); }
    if (l.outline) { g.lineWidth = px * 0.16; g.strokeStyle = l.outline; g.lineJoin = 'round'; g.strokeText(l.t, cx, y + sizes[i] * scale * 0.12); }
    g.fillStyle = l.c || '#241a12';
    g.fillText(l.t, cx, y + sizes[i] * scale * 0.12);
    y += sizes[i] * scale + gap * scale;
  }
}

/** Painted board: background, inner border, weathering. */
export function board(g, W, H, o = {}) {
  g.fillStyle = o.bg || '#f6ecd8';
  g.fillRect(0, 0, W, H);
  if (o.bg2) { const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, o.bg2); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, W, H); }
  if (o.border !== false) {
    const b = (o.borderW ?? 0.035) * Math.min(W, H);
    g.strokeStyle = o.border || '#2c2119'; g.lineWidth = b;
    g.strokeRect(b * 0.7, b * 0.7, W - b * 1.4, H - b * 1.4);
    if (o.border2) { g.strokeStyle = o.border2; g.lineWidth = b * 0.4; g.strokeRect(b * 2.1, b * 2.1, W - b * 4.2, H - b * 4.2); }
  }
  if (o.grime !== false) {
    g.globalAlpha = o.grime ?? 0.07;
    g.fillStyle = '#3a2a18';
    for (let i = 0; i < 7; i++) { const x = (i * 37 % 100) / 100 * W; g.fillRect(x, 0, W * 0.02, H * (0.2 + (i % 3) * 0.25)); }
    g.globalAlpha = 1;
  }
}

/** Awning / banner stripes. */
export function stripes(g, W, H, cols, n = 8, vertical = true) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i % cols.length];
    if (vertical) g.fillRect(Math.floor(i * W / n), 0, Math.ceil(W / n) + 1, H);
    else g.fillRect(0, Math.floor(i * H / n), W, Math.ceil(H / n) + 1);
  }
  g.globalAlpha = 0.13; g.fillStyle = '#000';
  g.fillRect(0, H * 0.72, W, H * 0.28);
  g.globalAlpha = 1;
}

/** A crude cat face — used as a logo on lots of signs. */
export function catFace(g, cx, cy, r, fur = '#f0963c', o = {}) {
  g.fillStyle = fur;
  g.beginPath(); g.moveTo(cx - r * 0.82, cy - r * 0.35); g.lineTo(cx - r * 0.62, cy - r * 1.25); g.lineTo(cx - r * 0.12, cy - r * 0.72); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(cx + r * 0.82, cy - r * 0.35); g.lineTo(cx + r * 0.62, cy - r * 1.25); g.lineTo(cx + r * 0.12, cy - r * 0.72); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = o.eye || '#221a14';
  g.beginPath(); g.ellipse(cx - r * 0.36, cy - r * 0.1, r * 0.13, r * 0.2, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx + r * 0.36, cy - r * 0.1, r * 0.13, r * 0.2, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = o.eye || '#221a14'; g.lineWidth = r * 0.07; g.lineCap = 'round';
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    g.beginPath(); g.moveTo(cx + s * r * 0.35, cy + r * 0.28 + i * r * 0.1);
    g.lineTo(cx + s * r * 1.15, cy + r * 0.06 + i * r * 0.22); g.stroke();
  }
  g.fillStyle = o.nose || '#d3697a';
  g.beginPath(); g.moveTo(cx, cy + r * 0.42); g.lineTo(cx - r * 0.14, cy + r * 0.2); g.lineTo(cx + r * 0.14, cy + r * 0.2); g.closePath(); g.fill();
}

/** A crude, worried human — for wanted posters and "beloved guest" plaques. */
export function humanFace(g, cx, cy, r, o = {}) {
  g.fillStyle = o.skin || '#e9b98a';
  g.beginPath(); g.ellipse(cx, cy, r * 0.78, r, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = o.hair || '#4a3323';
  g.beginPath(); g.ellipse(cx, cy - r * 0.6, r * 0.82, r * 0.5, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#2a2018';
  g.beginPath(); g.ellipse(cx - r * 0.3, cy - r * 0.08, r * 0.1, r * 0.13, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx + r * 0.3, cy - r * 0.08, r * 0.1, r * 0.13, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a2018'; g.lineWidth = r * 0.09; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy + r * 0.72, r * 0.3, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); // frown
}
