// Home-screen / PWA icons for "Escape from Candyland and Cat Island".
//   node icons/src/make-icons.mjs [--sheet]  # writes icons/*.png at exact pixel sizes (headless Chromium, DPR 1);
//                                            # --sheet also writes a review contact sheet to renders/w3_iphone/pwa_icon_sheet.png
// Design: a candy-striped cat head (peppermint stripes, pink inner ears, navy outline) on cream frosting with
// sprinkles and a mint halo. Colours come from src/core/palette.js (CANDY.* / CAT.*), so the icon matches the game.
// Variants:
//   any       icon-192/512      rounded cream tile on a transparent square (desktop install, Android launcher fallback)
//   maskable  icon-maskable-*   full-bleed cream; the whole cat sits inside the central 80% safe circle
//   apple     apple-touch-icon  180 px, opaque full-bleed (iOS rounds the corners itself; transparency would turn black)
//   favicon   favicon-32        browser tab
import { chromium } from 'playwright';
import path from 'node:path'; import fs from 'node:fs';
import { CANDY, CAT } from '../../src/core/palette.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const C = {
  cream: hex(CANDY.cream), frosting: hex(CANDY.frosting), frostShade: hex(CANDY.frostingShade),
  stripe: hex(CANDY.gummyRed), pink: hex(CANDY.pinkGrass), syrup: hex(CANDY.syrup), mint: hex(CANDY.mintGrass),
  navy: hex(CAT.navy), gold: hex(CAT.gold), sprinkle: CANDY.sprinkle.map(hex),
};
const OUT = path.resolve(new URL('..', import.meta.url).pathname);

// ── the emblem, drawn in a 512 box centred on (256,256); `s` scales it about the centre ──
// Head + ears silhouette is outlined with the "wide stroke underneath, fill on top" trick so the
// union gets one clean navy rim with no seams where the ears meet the head.
const HEAD = 'M256 150 C348 150 408 204 408 286 C408 364 342 410 256 410 C170 410 104 364 104 286 C104 204 164 150 256 150 Z';
const EAR_L = 'M118 250 C112 196 116 140 136 96 C140 88 148 86 155 91 C190 116 218 142 238 170 Z';
const EAR_R = 'M394 250 C400 196 396 140 376 96 C372 88 364 86 357 91 C322 116 294 142 274 170 Z';
const IN_L = 'M146 196 C144 166 148 140 156 122 C176 138 192 154 204 170 Z';
const IN_R = 'M366 196 C368 166 364 140 356 122 C336 138 320 154 308 170 Z';

function emblem(id, s, rim) {
  return `
  <g transform="translate(256 256) scale(${s}) translate(-256 -260)">
    <defs>
      <pattern id="st${id}" patternUnits="userSpaceOnUse" width="56" height="56" patternTransform="rotate(-38 256 256)">
        <rect width="56" height="56" fill="${C.cream}"/><rect width="27" height="56" fill="${C.stripe}"/>
      </pattern>
      <clipPath id="cl${id}"><path d="${HEAD}"/><path d="${EAR_L}"/><path d="${EAR_R}"/></clipPath>
      <radialGradient id="sh${id}" cx="0.36" cy="0.30" r="0.85">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.62" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="${C.navy}" stop-opacity="0.22"/>
      </radialGradient>
    </defs>
    <!-- soft drop shadow -->
    <g transform="translate(0 14)" opacity="0.18" fill="${C.navy}"><path d="${HEAD}"/><path d="${EAR_L}"/><path d="${EAR_R}"/></g>
    <!-- navy rim: every part stroked at 2x the rim width, then filled over -->
    <g fill="${C.navy}" stroke="${C.navy}" stroke-width="${rim * 2}" stroke-linejoin="round">
      <path d="${EAR_L}"/><path d="${EAR_R}"/><path d="${HEAD}"/>
    </g>
    <g clip-path="url(#cl${id})">
      <rect x="60" y="60" width="392" height="392" fill="url(#st${id})"/>
      <rect x="60" y="60" width="392" height="392" fill="url(#sh${id})"/>
    </g>
    <!-- inner ears -->
    <g fill="${C.pink}" stroke="${C.navy}" stroke-width="9" stroke-linejoin="round"><path d="${IN_L}"/><path d="${IN_R}"/></g>
    <!-- candy gloss -->
    <path d="M150 262 C156 214 192 184 238 176" fill="none" stroke="#fff" stroke-width="17" stroke-linecap="round" opacity="0.85"/>
    <circle cx="146" cy="296" r="9" fill="#fff" opacity="0.85"/>
    <!-- face: a cream muzzle patch keeps the eyes readable over the stripes -->
    <g stroke="${C.navy}" stroke-width="9" stroke-linejoin="round">
      <ellipse cx="256" cy="324" rx="118" ry="70" fill="${C.cream}"/>
    </g>
    <g fill="${C.navy}">
      <ellipse cx="204" cy="300" rx="21" ry="29"/><ellipse cx="308" cy="300" rx="21" ry="29"/>
    </g>
    <g fill="#fff"><circle cx="212" cy="289" r="8"/><circle cx="316" cy="289" r="8"/></g>
    <path d="M241 330 L271 330 L256 347 Z" fill="${C.syrup}" stroke="${C.navy}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M232 356 C240 368 252 366 256 352 C260 366 272 368 280 356" fill="none" stroke="${C.navy}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <g fill="${C.pink}" opacity="0.9"><ellipse cx="174" cy="344" rx="19" ry="12"/><ellipse cx="338" cy="344" rx="19" ry="12"/></g>
    <!-- whiskers poke past the rim -->
    <g stroke="${C.navy}" stroke-width="8" stroke-linecap="round">
      <path d="M150 322 L84 310"/><path d="M152 342 L86 350"/><path d="M362 322 L428 310"/><path d="M360 342 L426 350"/>
    </g>
  </g>`;
}

// Sprinkles scattered on the frosting (fixed list = deterministic). [x, y, angle, colourIndex]
const SPRINKLES = [
  [70, 88, 30, 0], [196, 46, -20, 1], [330, 52, 60, 2], [454, 96, -40, 3], [470, 230, 10, 4], [446, 470, 70, 5],
  [300, 470, -30, 1], [148, 462, 40, 3], [44, 404, -60, 2], [40, 240, 80, 0], [98, 170, -10, 5], [418, 168, 25, 0],
  [420, 380, -50, 2], [92, 470, 15, 4], [262, 34, 90, 5], [476, 318, 45, 1],
];
const sprinkles = (keepOutR) => SPRINKLES.filter(([x, y]) => Math.hypot(x - 256, y - 256) > keepOutR)
  .map(([x, y, a, c]) => `<rect x="${x - 14}" y="${y - 5}" width="28" height="10" rx="5" fill="${C.sprinkle[c]}" transform="rotate(${a} ${x} ${y})"/>`).join('');

function background(kind) {
  const bg = `
    <defs>
      <radialGradient id="bgg" cx="0.5" cy="0.42" r="0.75">
        <stop offset="0" stop-color="${C.cream}"/><stop offset="1" stop-color="${C.frosting}"/>
      </radialGradient>
    </defs>`;
  const halo = (r) => `<circle cx="256" cy="258" r="${r}" fill="${C.mint}" opacity="0.55"/>`;
  if (kind === 'any') {
    return bg + `
      <rect x="10" y="10" width="492" height="492" rx="112" fill="url(#bgg)" stroke="${C.navy}" stroke-width="12"/>
      <clipPath id="tile"><rect x="16" y="16" width="480" height="480" rx="106"/></clipPath>
      <g clip-path="url(#tile)">${halo(206)}${sprinkles(222)}</g>`;
  }
  if (kind === 'favicon') return bg + `<rect x="0" y="0" width="512" height="512" rx="120" fill="url(#bgg)"/>`;
  // full-bleed (maskable, apple): cream to every edge, sprinkles only in the corners that masks may crop
  return bg + `<rect width="512" height="512" fill="url(#bgg)"/>${halo(kind === 'maskable' ? 196 : 206)}${sprinkles(kind === 'maskable' ? 206 : 222)}`;
}

const VARIANTS = [
  // file, px, kind, emblem scale, rim width, transparent
  ['icon-192.png', 192, 'any', 0.92, 13, true],
  ['icon-512.png', 512, 'any', 0.92, 12, true],
  ['icon-maskable-192.png', 192, 'maskable', 0.84, 14, false],
  ['icon-maskable-512.png', 512, 'maskable', 0.84, 13, false],
  ['apple-touch-icon.png', 180, 'apple', 0.90, 13, false],
  ['favicon-32.png', 32, 'favicon', 1.10, 22, true],
];

const svg = (kind, s, rim) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">${background(kind)}${emblem(kind, s, rim)}</svg>`;

const browser = await chromium.launch();
try {
  for (const [file, px, kind, s, rim, transparent] of VARIANTS) {
    const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:${px}px;height:${px}px;overflow:hidden;background:${transparent ? 'transparent' : C.cream}}svg{display:block}</style></head><body>${svg(kind, s, rim)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, file), omitBackground: transparent, clip: { x: 0, y: 0, width: px, height: px } });
    await page.close();
    console.log('wrote', file, px + 'x' + px, kind);
  }
  // Contact sheet for review (not shipped in the manifest): each variant large, plus the maskable one under a circle mask
  // and the apple one under an iOS-style squircle, on light and dark wallpaper.
  if (process.argv.includes('--sheet')) {
    const page = await browser.newPage({ viewport: { width: 1320, height: 700 }, deviceScaleFactor: 1 });
        const img = (f, css) => `<img src="data:image/png;base64,${fs.readFileSync(path.join(OUT, f)).toString('base64')}" style="${css}">`;
    await page.setContent(`<body style="margin:0;font:14px sans-serif">
      <div style="display:flex;gap:24px;padding:24px;background:#dfe6ee">
        ${img('icon-512.png', 'width:256px')}${img('icon-maskable-512.png', 'width:256px;border-radius:50%')}${img('icon-maskable-512.png', 'width:256px;border-radius:22%')}${img('apple-touch-icon.png', 'width:256px;border-radius:22.4%')}
      </div>
      <div style="display:flex;gap:24px;padding:24px;background:#1a1218;align-items:center">
        ${img('icon-512.png', 'width:256px')}<div style="position:relative;width:256px;height:256px">${img('icon-maskable-512.png', 'width:256px')}<div style="position:absolute;left:25.6px;top:25.6px;width:204.8px;height:204.8px;border-radius:50%;outline:2px dashed #1d3557"></div></div>
        <div style="display:flex;flex-direction:column;gap:14px">${img('apple-touch-icon.png', 'width:60px;border-radius:13px')}${img('icon-maskable-192.png', 'width:48px;border-radius:50%')}${img('icon-192.png', 'width:48px')}${img('favicon-32.png', 'width:32px;image-rendering:pixelated')}${img('favicon-32.png', 'width:16px')}</div>
      </div></body>`);
    await page.waitForTimeout(200);
    const sheet = path.join(OUT, '..', 'renders', 'w3_iphone', 'pwa_icon_sheet.png'); fs.mkdirSync(path.dirname(sheet), { recursive: true });
    await page.screenshot({ path: sheet });
    console.log('wrote', path.relative(path.join(OUT, '..'), sheet));
  }
} finally { await browser.close(); }
