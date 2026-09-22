// Small procedural CanvasTextures for the Sugarfin Express: candy stripes for the
// horn + canopy, and a painted hull nameboard.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return { c, g: c.getContext('2d') };
}
function finish(c, { repeat = [1, 1], nearest = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; }
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Straight stripes. `axis:'y'` = bands stacked along V (wrap over an arch). */
export function stripeTex({ a = '#fffaf0', b = '#ff3f5f', n = 8, axis = 'x', size = 128, repeat = [1, 1] } = {}) {
  const { c, g } = canvas(size, size);
  g.fillStyle = a; g.fillRect(0, 0, size, size);
  g.fillStyle = b;
  const p = size / n;
  for (let i = 0; i < n; i += 2) {
    if (axis === 'x') g.fillRect(i * p, 0, p, size); else g.fillRect(0, i * p, size, p);
  }
  return finish(c, { repeat });
}

/** 45° stripes that tile seamlessly — on a cone's UVs this becomes a candy-cane helix. */
export function helixTex({ a = '#fffaf0', b = '#ff3f5f', c2 = '#ffd23a', size = 256, period = 64, repeat = [1, 1] } = {}) {
  const { c, g } = canvas(size, size);
  g.fillStyle = a; g.fillRect(0, 0, size, size);
  g.lineWidth = period * 0.42; g.lineCap = 'butt';
  for (let k = -2; k <= size / period + 2; k++) {
    g.strokeStyle = (k % 2 === 0) ? b : c2;
    g.beginPath();
    g.moveTo(k * period - size, -size); g.lineTo(k * period + size * 2, size * 2);
    g.stroke();
  }
  return finish(c, { repeat });
}

/** Painted wooden nameboard. */
export function signTex(text, { w = 512, h = 128, bg = '#8f5b30', ink = '#fff6df', trim = '#ffcf5c' } = {}) {
  const { c, g } = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  // grain
  g.strokeStyle = 'rgba(60,30,10,.28)'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const y = (i + 0.5) * (h / 14) + (i % 3) * 2;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 5, w * 0.6, y - 5, w, y + 2); g.stroke();
  }
  g.strokeStyle = trim; g.lineWidth = 7; g.strokeRect(9, 9, w - 18, h - 18);
  g.fillStyle = ink;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 96;
  g.font = `bold ${size}px "Trebuchet MS", Verdana, sans-serif`;
  while (g.measureText(text).width > w - 64 && size > 16) { size -= 2; g.font = `bold ${size}px "Trebuchet MS", Verdana, sans-serif`; }
  g.lineWidth = 8; g.strokeStyle = 'rgba(40,18,6,.65)';
  g.strokeText(text, w / 2, h / 2 + 2);
  g.fillText(text, w / 2, h / 2 + 2);
  return finish(c, { nearest: false });
}

/** Wake ribbon: streaky foam that tiles along V so it can scroll for ever.
 *  U is across the ribbon (0 and 1 are the feathered edges). Two bright
 *  divergent shoulder lines carry the V; the middle is a softer churn. */
export function wakeTex({ w = 128, h = 256 } = {}) {
  const { c, g } = canvas(w, h);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const s = Math.abs(u * 2 - 1);                              // 0 centre, 1 edge
      const edge = 1 - Math.pow(s, 2.4);                          // feathered sides
      // two counter-running streak sets, both periodic in v so the tile wraps
      const s1 = 0.5 + 0.5 * Math.sin((v * 6 + u * 3.1) * Math.PI * 2);
      const s2 = 0.5 + 0.5 * Math.sin((v * 3 - u * 5.2) * Math.PI * 2 + 1.7);
      const churn = 0.26 + 0.26 * s1 * s2 + 0.18 * s2;
      // the V itself: a bright pair of shoulder lines running out from the fluke
      const sh = Math.exp(-Math.pow((s - 0.66) / 0.17, 2)) * (0.95 + 0.25 * s1);
      const a = Math.max(0, Math.min(1, edge * (churn + sh)));
      const i = (y * w + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 253; img.data[i + 2] = 246;
      img.data[i + 3] = Math.round(255 * a);
    }
  }
  g.putImageData(img, 0, 0);
  return finish(c, { nearest: false });
}

/** A soft radial glow that fades to nothing at every edge — no disc rim.
 *  Used both for a lamp's halo (square) and for its smear on the water (the
 *  instance simply scales it long in one axis). Additive. */
export function glowTex({ size = 128 } = {}) {
  const { c, g } = canvas(size, size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const v = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const u = (x / (size - 1)) * 2 - 1;
      const r = Math.hypot(u, v);
      // hot core + wide skirt, both forced to exactly 0 at r = 1
      const core = Math.exp(-Math.pow(r / 0.16, 2));
      const skirt = Math.exp(-Math.pow(r / 0.52, 1.7));
      const cut = Math.max(0, 1 - Math.pow(r, 2.2));
      const a = Math.max(0, Math.min(1, (core * 0.9 + skirt * 0.75) * cut));
      const i = (y * size + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 226; img.data[i + 2] = 176;
      img.data[i + 3] = Math.round(255 * a);
    }
  }
  g.putImageData(img, 0, 0);
  const t = finish(c, { nearest: false });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Soft foam band: opaque at v=0 (against the hull), fading out at v=1.
 *  The wobble is periodic in x so the band can scroll around her waterline for
 *  ever without a seam, and the top edge is soft — a sculpted serrated "sock"
 *  is what made the collar read as a static prop. */
export function foamTex({ w = 256, h = 64 } = {}) {
  const { c, g } = canvas(w, h);
  const img = g.createImageData(w, h);
  const P = Math.PI * 2 / w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = 1 - y / (h - 1);                     // v=0 at the bottom row
      const wob = 0.5
        + 0.20 * Math.sin(x * P * 7)
        + 0.13 * Math.sin(x * P * 13 + 1.7)
        + 0.08 * Math.sin(x * P * 23 + 0.4);
      const lo = 0.30 + wob * 0.16, hi = 0.74 + wob * 0.30;
      const u = Math.max(0, Math.min(1, (v - lo) / Math.max(0.12, hi - lo)));
      // smootherstep out — a long soft shoulder instead of a hard serration
      const a = 1 - u * u * u * (u * (u * 6 - 15) + 10);
      const i = (y * w + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * a);
    }
  }
  g.putImageData(img, 0, 0);
  return finish(c, { nearest: false });
}
