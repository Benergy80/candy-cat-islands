// ─────────────────────────────────────────────────────────────────────────────
// CAT FUR — one small CanvasTexture atlas (4x2 tiles of 128px) holding every
// coat pattern on the island, plus the material that lets a single InstancedMesh
// draw 40 differently-patterned cats in ONE draw call.
//
// Each instance carries an `aTile` InstancedBufferAttribute (the tile's uv
// origin); a tiny onBeforeCompile patch remaps vMapUv into that tile. Tiles are
// authored in (u, v) = (around the body, top → bottom) so a sphere/cone/cylinder
// all get sensible stripes, bibs and points.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const COLS = 4, ROWS = 3, PX = 128;
export const TILE_SIZE = new THREE.Vector2(1 / COLS, 1 / ROWS);

// Order matters: index → (col,row) in the atlas. Row 3 is the night shift: the
// same island, striped. (see tiger.js — every citizen swaps to one at 20:00)
export const PATTERNS = [
  'tabby', 'grey', 'black', 'white', 'calico', 'tuxedo', 'siamese', 'ginger',
  'tiger_orange', 'tiger_white', 'tiger_grey', 'tiger_shadow',
];

/** Which striped coat a day coat turns into after dark. */
export const TIGER_OF = {
  tabby: 'tiger_orange', ginger: 'tiger_orange', calico: 'tiger_orange',
  white: 'tiger_white',
  grey: 'tiger_white',            // grey cats come back as SNOW tigers
  siamese: 'tiger_grey', tuxedo: 'tiger_grey',
  black: 'tiger_shadow',
};

/** uv origin of a named pattern's tile (for the aTile attribute). */
export function tileUV(pattern) {
  let i = PATTERNS.indexOf(pattern); if (i < 0) i = 0;
  return [(i % COLS) / COLS, Math.floor(i / COLS) / ROWS];
}

/** A representative flat colour for a pattern (used for tinting clothing etc.). */
export const PATTERN_TINT = {
  tabby: 0xe08a34, grey: 0x8a8a94, black: 0x2b2b30, white: 0xf6f2ea,
  calico: 0xe6cfa8, tuxedo: 0x33333a, siamese: 0xe8d6b6, ginger: 0xf0a95e,
  tiger_orange: 0xf08a22, tiger_white: 0xf2ece0, tiger_grey: 0x8e8e9c, tiger_shadow: 0x4a4658,
};

// ── tile painters ────────────────────────────────────────────────────────────
function shade(g, x, y, topDark, botLight) {
  const grad = g.createLinearGradient(0, y, 0, y + PX);
  grad.addColorStop(0, `rgba(0,0,0,${topDark})`);
  grad.addColorStop(0.42, 'rgba(0,0,0,0)');
  grad.addColorStop(0.72, `rgba(255,255,255,${botLight * 0.35})`);
  grad.addColorStop(1, `rgba(255,255,255,${botLight})`);
  g.fillStyle = grad; g.fillRect(x, y, PX, PX);
}

function stripes(g, x, y, color, count, w, wob) {
  g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const u = x + (i + 0.5) * (PX / count);
    g.beginPath();
    g.moveTo(u + wob, y - 4);
    g.bezierCurveTo(u + wob * 2.4, y + PX * 0.28, u - wob * 2.0, y + PX * 0.55, u + wob * 0.6, y + PX * 0.86);
    g.stroke();
  }
  g.restore();
}

function blob(g, x, y, cx, cy, rx, ry, rot, color) {
  g.save(); g.fillStyle = color; g.translate(x + cx * PX, y + cy * PX); g.rotate(rot);
  g.beginPath(); g.ellipse(0, 0, rx * PX, ry * PX, 0, 0, Math.PI * 2); g.fill(); g.restore();
}

/**
 * TIGER stripes.
 *
 * These four tiles are read differently from the cat coats above. The tiger's
 * torso, legs and tail are built (citizens/tigerrig.js) so that the tile's
 * u axis runs ALONG the body and the v axis wraps the WHOLE circumference:
 *   v = 0   → the spine        v = 0.5 → the belly        v = 1 → the spine
 * so the tile has to be symmetric about v = 0.5, and a stripe drawn as a
 * vertical band becomes a ring right round the animal. Each stripe is a filled
 * tapered polygon rather than a stroked line: fat and black over the back,
 * narrowing to a point before it reaches the white belly, which is what stops
 * a tiger reading as "a cat with scribble on it" at 30 m.
 */
function tigerStripe(g, x, y, u0, w0, wob, reach, seed) {
  const N = 8;
  const L = [], R = [];
  for (let s = 0; s <= N; s++) {
    const f = s / N;
    const v = f * reach;
    const u = u0 + Math.sin(f * 2.6 + seed) * wob + f * wob * 0.35;
    const w = w0 * (1 - f * f * 0.88);
    L.push([u - w * 0.5, v]); R.push([u + w * 0.5, v]);
  }
  // drawn at three offsets so a stripe that runs off one edge arrives at the other
  for (const off of [-1, 0, 1]) for (const flip of [0, 1]) {
    g.beginPath();
    const Y = (v) => y + (flip ? 1 - v : v) * PX;
    g.moveTo(x + (L[0][0] + off) * PX, Y(L[0][1]));
    for (let s = 1; s <= N; s++) g.lineTo(x + (L[s][0] + off) * PX, Y(L[s][1]));
    for (let s = N; s >= 0; s--) g.lineTo(x + (R[s][0] + off) * PX, Y(R[s][1]));
    g.closePath(); g.fill();
  }
}

function tigerCoat(g, x, y, base, belly, ink, count = 13) {
  g.fillStyle = base; g.fillRect(x, y, PX, PX);
  // Pale belly band centred on v = 0.5, dark along both spine edges. The belly
  // is WIDE and bright on purpose: at night a tiger lying on wet cobbles is
  // otherwise the same value as the cobbles, and the whole animal disappears.
  const bg = g.createLinearGradient(0, y, 0, y + PX);
  bg.addColorStop(0.00, 'rgba(0,0,0,0.30)');
  bg.addColorStop(0.12, 'rgba(0,0,0,0.02)');
  bg.addColorStop(0.26, 'rgba(255,255,255,0.14)');
  bg.addColorStop(0.38, belly);
  bg.addColorStop(0.50, belly);
  bg.addColorStop(0.62, belly);
  bg.addColorStop(0.74, 'rgba(255,255,255,0.14)');
  bg.addColorStop(0.88, 'rgba(0,0,0,0.02)');
  bg.addColorStop(1.00, 'rgba(0,0,0,0.30)');
  g.fillStyle = bg; g.fillRect(x, y, PX, PX);

  g.save();
  g.fillStyle = ink;
  const step = 1 / count;
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) * step;
    const odd = i % 2;
    // alternate a long bold stripe with a shorter one — the real pattern
    tigerStripe(g, x, y, u, step * (odd ? 0.34 : 0.46), (odd ? -1 : 1) * 0.028, odd ? 0.34 : 0.46, i * 1.7);
    if (!odd) tigerStripe(g, x, y, u + step * 0.5, step * 0.20, -0.02, 0.24, i * 2.3 + 1);
  }
  g.restore();
}

function paint(g, name, col, row) {
  const x = col * PX, y = row * PX;
  g.save(); g.beginPath(); g.rect(x, y, PX, PX); g.clip();
  switch (name) {
    case 'tiger_orange': tigerCoat(g, x, y, '#f0870c', 'rgba(255,247,232,1)', '#150e11', 13); break;
    case 'tiger_white':  tigerCoat(g, x, y, '#f2ece0', 'rgba(255,255,255,1)', '#2b2733', 12); break;
    case 'tiger_grey':   tigerCoat(g, x, y, '#9a9aac', 'rgba(240,240,246,1)', '#131318', 12); break;
    case 'tiger_shadow': tigerCoat(g, x, y, '#57506c', 'rgba(206,202,222,0.95)', '#0c0a10', 11); break;
    case 'tabby':
      g.fillStyle = '#f0a04a'; g.fillRect(x, y, PX, PX);
      stripes(g, x, y, '#b4641f', 9, 9, 5);
      stripes(g, x, y, 'rgba(120,60,16,0.5)', 9, 3, -7);
      shade(g, x, y, 0.26, 0.42);
      blob(g, x, y, 0.25, 0.88, 0.30, 0.13, 0, 'rgba(255,246,232,0.92)'); // pale belly/chin
      break;
    case 'grey':
      g.fillStyle = '#93939e'; g.fillRect(x, y, PX, PX);
      stripes(g, x, y, 'rgba(70,70,84,0.55)', 7, 11, 4);
      shade(g, x, y, 0.24, 0.5);
      blob(g, x, y, 0.25, 0.9, 0.26, 0.11, 0, 'rgba(240,240,246,0.85)');
      break;
    case 'black':
      g.fillStyle = '#33333c'; g.fillRect(x, y, PX, PX);
      stripes(g, x, y, 'rgba(20,20,26,0.7)', 5, 14, 6);
      shade(g, x, y, 0.35, 0.30);
      break;
    case 'white':
      g.fillStyle = '#f7f3ea'; g.fillRect(x, y, PX, PX);
      blob(g, x, y, 0.62, 0.3, 0.16, 0.1, 0.4, 'rgba(214,205,190,0.55)');
      blob(g, x, y, 0.1, 0.62, 0.12, 0.08, -0.3, 'rgba(214,205,190,0.45)');
      shade(g, x, y, 0.16, 0.22);
      break;
    case 'calico':
      g.fillStyle = '#f7f0e2'; g.fillRect(x, y, PX, PX);
      blob(g, x, y, 0.16, 0.22, 0.17, 0.19, 0.3, '#e8913a');
      blob(g, x, y, 0.66, 0.34, 0.15, 0.17, -0.4, '#3a3238');
      blob(g, x, y, 0.86, 0.7, 0.13, 0.14, 0.2, '#e8913a');
      blob(g, x, y, 0.40, 0.68, 0.11, 0.13, 0.6, '#3a3238');
      blob(g, x, y, 0.05, 0.82, 0.10, 0.1, 0, '#e8913a');
      shade(g, x, y, 0.18, 0.3);
      break;
    case 'tuxedo':
      g.fillStyle = '#33333c'; g.fillRect(x, y, PX, PX);
      shade(g, x, y, 0.3, 0.1);
      // white bib down the FRONT (u = 0.25 is +Z on a three.js sphere)
      blob(g, x, y, 0.25, 0.74, 0.16, 0.26, 0, '#f7f3ea');
      blob(g, x, y, 0.25, 0.53, 0.07, 0.08, 0, '#f7f3ea'); // chin spot
      g.fillStyle = '#f7f3ea'; g.fillRect(x, y + PX * 0.93, PX, PX * 0.07); // white socks / tail tip
      break;
    case 'siamese':
      g.fillStyle = '#eddcbe'; g.fillRect(x, y, PX, PX);
      shade(g, x, y, 0.14, 0.25);
      blob(g, x, y, 0.25, 0.42, 0.19, 0.24, 0, '#6b4b3c');  // face mask / chest point
      blob(g, x, y, 0.25, 0.42, 0.13, 0.17, 0, '#8a6450');
      g.fillStyle = '#5c3f33'; g.fillRect(x, y + PX * 0.86, PX, PX * 0.14); // dark points
      break;
    case 'ginger':
      g.fillStyle = '#f8efe0'; g.fillRect(x, y, PX, PX);
      g.fillStyle = '#f0a45c'; g.fillRect(x, y, PX, PX * 0.46);
      blob(g, x, y, 0.55, 0.56, 0.2, 0.13, 0.2, '#f0a45c');
      blob(g, x, y, 0.12, 0.66, 0.13, 0.1, -0.3, '#f0a45c');
      stripes(g, x, y, 'rgba(196,110,40,0.45)', 7, 6, 5);
      shade(g, x, y, 0.2, 0.3);
      break;
  }
  g.restore();
}

let _tex = null;
/** Build (once) the shared fur atlas texture. */
export function furAtlas() {
  if (_tex) return _tex;
  const cv = document.createElement('canvas');
  cv.width = COLS * PX; cv.height = ROWS * PX;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
  PATTERNS.forEach((p, i) => paint(g, p, i % COLS, Math.floor(i / COLS)));
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false;                 // uv v=0 → canvas top → cat's back/top
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _tex = t;
  return t;
}

/**
 * One material for every furred body part. Per-instance `aTile` picks the coat.
 * `vertexColors` is on so geometries can carry local tints (paw pads, ear roots)
 * and so InstancedMesh.setColorAt can shade individual cats.
 *
 * opts.rim adds a fresnel edge-light whose strength lives on `mat.userData.rim`
 * (a uniform holder). Tigers use it: at night a striped animal lying on wet
 * cobbles is the same VALUE as the cobbles, and the whole beast disappears —
 * a warm rim puts an outline back around the silhouette without a real light.
 */
export function furMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: furAtlas(), roughness: 0.88, metalness: 0.0, vertexColors: true,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
  const rimU = { value: 0 };
  const rimC = { value: new THREE.Color(opts.rimColor ?? 0xffc07a) };
  m.userData.rim = rimU;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTileSize = { value: TILE_SIZE };
    sh.vertexShader = 'attribute vec2 aTile;\nuniform vec2 uTileSize;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_MAP
        vMapUv = aTile + ( 0.018 + 0.964 * fract( vMapUv ) ) * uTileSize;
      #endif`);
    if (opts.rim) {
      sh.uniforms.uRim = rimU; sh.uniforms.uRimColor = rimC;
      sh.fragmentShader = 'uniform float uRim;\nuniform vec3 uRimColor;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        {
          float fres = 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
          outgoingLight += uRim * pow( fres, 2.2 ) * uRimColor;
        }
        #include <opaque_fragment>`);
    }
  };
  m.customProgramCacheKey = () => (opts.rim ? 'catFurAtlasRim_v1' : 'catFurAtlas_v1');
  return m;
}
