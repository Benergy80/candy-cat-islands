// ─────────────────────────────────────────────────────────────────────────────
// GLYPHS — every pictogram in the HUD is inline SVG drawn here, so nothing
// depends on the host's emoji font (which mixes styles, sizes and colours).
//
//  * portraits: one bust per speaker FAMILY (cat / sour patch kid / candy
//    creature / human / sign), colour-keyed by a hue derived from the name.
//    Every bust is drawn into the same 64×64 box with the head at the same
//    optical size, so portraits never jump about between lines.
//  * icons: a single 24×24 line-art set for toasts, banner, dial and buttons.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#2a1430';

// Portraits are drawn in a 64×64 box but framed in a CIRCLE, so the artwork is
// published in a slightly larger viewBox: that inset keeps ears, gumdrop domes
// and sign posts inside the ring instead of cropping them into a plain disc.
const PVB = '-4 -3.5 72 72';

const wrap = (inner, vb = '0 0 64 64') =>
  `<svg viewBox="${vb}" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">${inner}</svg>`;

/** Which bust suits this speaker? Falls back to the island's locals. */
export function familyFor(speaker = '', island = 'candy') {
  const s = String(speaker);
  if (/sour|patch|gremlin|sugar.?kid/i.test(s)) return 'sour';
  if (/sign|notice|board|poster|plaque|leaflet|timetable|menu/i.test(s)) return 'sign';
  if (/tiger|striped|prowler|big cat/i.test(s)) return 'tiger';
  if (/mitten|whisker|purr|tabby|meow|kitten|\bcat\b|tuna|biscuit|mayor|officer|speaker|monger/i.test(s)) return 'cat';
  if (/\byou\b|human|visitor|travel|narrator|self/i.test(s)) return 'human';
  if (island === 'cat') return 'cat';
  if (island === 'candy') return 'creature';
  return 'creature';
}

/**
 * Fold an arbitrary hash hue into a hue that suits the family, so a cat is
 * ginger / tabby / cream / grey rather than periwinkle. Used for the bust, the
 * portrait ring and the nameplate so all three always agree.
 */
export function familyHue(family, h) {
  if (family === 'cat') return 18 + (h % 44);         // ginger → butter
  if (family === 'tiger') return 24 + (h % 12);       // tigers are ALWAYS orange
  if (family === 'human') return 32;
  if (family === 'sign') return 204;
  return h;                                            // sour + candy: anything
}

/** A bust for `family`, tinted from `h` (0–360). Returns an <svg> string. */
export function portrait(family, h = 330) {
  const grey = family === 'cat' && (h % 5 === 0);
  const sat = grey ? 6 : family === 'tiger' ? 84 : (family === 'cat' ? 46 : 54);
  const fur = `hsl(${h} ${sat}% ${grey ? 70 : family === 'tiger' ? 56 : 62}%)`;
  const shade = `hsl(${h} ${sat - 8}% 50%)`;
  const lite = `hsl(${h} ${Math.min(74, sat + 20)}% 88%)`;
  const S = `stroke="${INK}" stroke-width="3.1" stroke-linejoin="round" stroke-linecap="round"`;

  if (family === 'cat') return wrap(`
    <g ${S}>
      <path d="M15 25 L15.5 7 L31.5 17.5 Z" fill="${fur}"/>
      <path d="M49 25 L48.5 7 L32.5 17.5 Z" fill="${fur}"/>
      <path d="M19.2 21 L19.5 12.5 L26.6 17.6 Z" fill="${lite}" stroke="none"/>
      <path d="M44.8 21 L44.5 12.5 L37.4 17.6 Z" fill="${lite}" stroke="none"/>
      <circle cx="32" cy="37" r="21" fill="${fur}"/>
      <path d="M6.5 34 L19 36.5 M6.5 43 L19 41.5 M57.5 34 L45 36.5 M57.5 43 L45 41.5" stroke-width="2"/>
      <circle cx="24.6" cy="34" r="3.2" fill="${INK}" stroke="none"/>
      <circle cx="39.4" cy="34" r="3.2" fill="${INK}" stroke="none"/>
      <path d="M30.2 42.4 H33.8 L32 44.8 Z" fill="${INK}" stroke="none"/>
      <path d="M32 45.6 q-4.4 4.2 -7.6 .6 M32 45.6 q4.4 4.2 7.6 .6" stroke-width="2.4"/>
    </g>`, PVB);

  // TIGER — what a cat is after 20:00. Same head-in-the-same-box framing as the
  // cat bust so the portrait never jumps when the sun goes down; everything
  // else is bigger, striped and lit from inside.
  if (family === 'tiger') return wrap(`
    <g ${S}>
      <path d="M12 27 L11.5 6 L30.5 17 Z" fill="${fur}"/>
      <path d="M52 27 L52.5 6 L33.5 17 Z" fill="${fur}"/>
      <path d="M16.6 22.5 L16.4 12 L25.4 17.6 Z" fill="${lite}" stroke="none"/>
      <path d="M47.4 22.5 L47.6 12 L38.6 17.6 Z" fill="${lite}" stroke="none"/>
      <circle cx="32" cy="38" r="23" fill="${fur}"/>
      <path d="M20 45.5 q12 9.5 24 0 q-2.6 11 -12 11 q-9.4 0 -12 -11 Z" fill="${lite}" stroke="none"/>
      <g stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none">
        <path d="M32 16.8 v6.4"/><path d="M23.4 18.8 l-2.4 6"/><path d="M40.6 18.8 l2.4 6"/>
        <path d="M10.6 32.6 l7 1.4"/><path d="M53.4 32.6 l-7 1.4"/>
        <path d="M10.4 41.6 l6.6 -1"/><path d="M53.6 41.6 l-6.6 -1"/>
      </g>
      <ellipse cx="23.8" cy="35.2" rx="4.6" ry="4.1" fill="#ffe04f"/>
      <ellipse cx="40.2" cy="35.2" rx="4.6" ry="4.1" fill="#ffe04f"/>
      <path d="M23.8 31.6 v7.2 M40.2 31.6 v7.2" stroke-width="2.8"/>
      <path d="M29.2 44.4 H34.8 L32 47.8 Z" fill="${INK}" stroke="none"/>
      <path d="M32 48.2 q-5.2 4.8 -9 .4 M32 48.2 q5.2 4.8 9 .4" stroke-width="2.4"/>
      <path d="M27.4 50.2 h2.6 l-1.3 5 Z" fill="#fffaf1" stroke-width="2"/>
      <path d="M34 50.2 h2.6 l-1.3 5 Z" fill="#fffaf1" stroke-width="2"/>
    </g>`, PVB);

  if (family === 'sour') return wrap(`
    <g ${S}>
      <path d="M18 22 q14 -12 28 0 q3.5 18 -.5 28 q-13.5 7 -27 0 q-4 -10 -.5 -28 Z" fill="${fur}"/>
      <g fill="${lite}" stroke="none" opacity=".85">
        <circle cx="24" cy="24" r="1.7"/><circle cx="41" cy="22.5" r="1.5"/>
        <circle cx="21" cy="38" r="1.5"/><circle cx="44" cy="41" r="1.7"/>
        <circle cx="33" cy="20.5" r="1.4"/><circle cx="27" cy="49" r="1.4"/>
      </g>
      <path d="M22 29.5 q4.5 -4 9 -.5 M42 29.5 q-4.5 -4 -9 -.5" stroke-width="2.6"/>
      <circle cx="25.5" cy="34.5" r="3" fill="${INK}" stroke="none"/>
      <circle cx="38.5" cy="34.5" r="3" fill="${INK}" stroke="none"/>
      <path d="M23 44 l4.5 4 l4.5 -4 l4.5 4 l4.5 -4" stroke-width="2.6"/>
    </g>`, PVB);

  if (family === 'human') return wrap(`
    <g ${S}>
      <circle cx="32" cy="39" r="19" fill="${lite}"/>
      <circle cx="25.5" cy="37" r="2.9" fill="${INK}" stroke="none"/>
      <circle cx="38.5" cy="37" r="2.9" fill="${INK}" stroke="none"/>
      <path d="M26 46.5 q6 4.5 12 0" stroke-width="2.6"/>
      <path d="M7 27.5 q25 -11 50 0 q-25 8.5 -50 0 Z" fill="#f4d488"/>
      <path d="M18.5 27.5 q13.5 -17 27 0 Z" fill="#f4d488"/>
      <path d="M18.8 26.6 q13.2 4.6 26.4 0" stroke="#e4557f" stroke-width="3"/>
    </g>`, PVB);

  if (family === 'sign') return wrap(`
    <g ${S}>
      <path d="M32 36 V58" stroke-width="5"/>
      <rect x="7.5" y="9" width="49" height="30" rx="7" fill="${fur}"/>
      <path d="M17 19.5 H47 M17 28.5 H37" stroke="${shade}" stroke-width="3.2"/>
    </g>`, PVB);

  // candy creature — a gumdrop with a face
  return wrap(`
    <g ${S}>
      <path d="M32 11 q21 3 21 24 q0 17 -21 22 q-21 -5 -21 -22 q0 -21 21 -24 Z" fill="${fur}"/>
      <path d="M22 19 q6 -5 13 -3" stroke="${lite}" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="25" cy="35" r="3.2" fill="${INK}" stroke="none"/>
      <circle cx="39" cy="35" r="3.2" fill="${INK}" stroke="none"/>
      <path d="M25.5 44 q6.5 5.5 13 0" stroke-width="2.6"/>
      <circle cx="19.5" cy="42" r="3.4" fill="hsl(${(h + 20) % 360} 80% 78%)" stroke="none" opacity=".9"/>
      <circle cx="44.5" cy="42" r="3.4" fill="hsl(${(h + 20) % 360} 80% 78%)" stroke="none" opacity=".9"/>
    </g>`, PVB);
}

// ── 24×24 line-art icon set ──────────────────────────────────────────────────
const P = {
  spark: 'M12 2.5 l2.7 6.6 l6.8 2.9 l-6.8 2.9 L12 21.5 l-2.7 -6.6 L2.5 12 l6.8 -2.9 Z',
  star: 'M12 2.8 l2.9 6.1 l6.7 .9 l-4.9 4.7 l1.2 6.7 L12 18 l-6 3.1 l1.2 -6.7 L2.4 9.8 l6.7 -.9 Z',
  moon: 'M16.4 3.2 a9.2 9.2 0 1 0 4.6 8 a7 7 0 1 1 -4.6 -8 Z',
  ferry: 'M3 14 h18 l-2.4 5.6 a2 2 0 0 1 -1.8 1.2 H7.2 a2 2 0 0 1 -1.8 -1.2 Z M12 14 V6 M12 6 h6 l-2 4 h-4 M6.5 14 V10 h5.5',
  paw: 'M12 13.2 c3 0 5 1.7 5 3.7 c0 2 -2 3.1 -5 3.1 c-3 0 -5 -1.1 -5 -3.1 c0 -2 2 -3.7 5 -3.7 Z',
  warn: 'M12 3.4 L21.6 20 H2.4 Z M12 9 v5 M12 16.8 v.2',
  chev: 'M6 9.5 L12 16 L18 9.5',
  chevr: 'M9.5 5.5 L16 12 L9.5 18.5',
  pin: 'M12 21.2 s6.6 -7 6.6 -11.4 a6.6 6.6 0 1 0 -13.2 0 C5.4 14.2 12 21.2 12 21.2 Z',
  lolli: 'M12 21.4 V15 M12 2.8 a6.1 6.1 0 1 0 0 12.2 a6.1 6.1 0 1 0 0 -12.2',
  fish: 'M3.2 12 c3.4 -4.6 8 -6.4 12.4 -6.4 c2.6 0 4.2 3.2 5.2 6.4 c-1 3.2 -2.6 6.4 -5.2 6.4 c-4.4 0 -9 -1.8 -12.4 -6.4 Z M3.2 12 h.2',
  home: 'M3.6 11.2 L12 3.8 l8.4 7.4 M6 9.6 V20.4 h12 V9.6',
  cup: 'M6.4 8.6 h11.2 l-1.2 11.2 a1.8 1.8 0 0 1 -1.8 1.6 H9.4 a1.8 1.8 0 0 1 -1.8 -1.6 Z M5.4 8.6 c0 -3 3 -5.2 6.6 -5.2 s6.6 2.2 6.6 5.2',
  peak: 'M2.6 19.6 L9 7.4 l3.6 6 L15.4 9 l6 10.6 Z',
  drop: 'M12 3.4 c4 5 6.4 8 6.4 11 a6.4 6.4 0 1 1 -12.8 0 c0 -3 2.4 -6 6.4 -11 Z',
  gym: 'M4 9.4 v5.2 M7 7.6 v8.8 M17 7.6 v8.8 M20 9.4 v5.2 M7 12 h10',
  tower: 'M9 20.4 h6 l-1 -12 h-4 Z M9.6 8.4 h4.8 M12 3.2 v2.4 M6.2 6.6 l2.4 1.4 M17.8 6.6 l-2.4 1.4',
  exit: 'M4 4.6 v14.8 h8 M9 12 h11 M16.6 8.6 L20 12 l-3.4 3.4',
  sun: 'M12 7.2 a4.8 4.8 0 1 0 0 9.6 a4.8 4.8 0 1 0 0 -9.6 M12 2 v2.4 M12 19.6 V22 M2 12 h2.4 M19.6 12 H22 M5 5 l1.7 1.7 M17.3 17.3 L19 19 M19 5 l-1.7 1.7 M6.7 17.3 L5 19',
  bug: 'M12 5.4 c3.2 0 5.4 2.8 5.4 7 s-2.2 6.2 -5.4 6.2 s-5.4 -2 -5.4 -6.2 s2.2 -7 5.4 -7 Z M12 5.4 V3 M4 9 l3 1.6 M20 9 l-3 1.6 M4.4 16 l3 -1.4 M19.6 16 l-3 -1.4',
  // a folded paper map (the MAP chip shown while the minimap is off)
  map: 'M3.2 6.4 L8.8 4 l6.4 2.4 L20.8 4 v13.6 l-5.6 2.4 l-6.4 -2.4 L3.2 20 Z M8.8 4 v13.6 M15.2 6.4 V20',
};

/**
 * An icon. `o.stroke` / `o.fill` override the colour; `o.cls` adds a class.
 * Everything is 24×24 with a 2.2 stroke so icons sit optically level with type.
 */
export function icon(name, o = {}) {
  const d = P[name] || P.spark;
  const st = o.stroke || 'currentColor';
  const fl = o.fill || (name === 'paw' ? st : 'none');
  const extra = name === 'paw'
    ? `<g fill="${fl === 'none' ? st : fl}" stroke="none">
         <ellipse cx="6.6" cy="10.4" rx="2.1" ry="2.6"/><ellipse cx="17.4" cy="10.4" rx="2.1" ry="2.6"/>
         <ellipse cx="9.9" cy="6.4" rx="2" ry="2.5"/><ellipse cx="14.1" cy="6.4" rx="2" ry="2.5"/>
       </g>` : '';
  return wrap(
    `<path d="${d}" stroke="${st}" fill="${fl}" stroke-width="${o.w || 2.2}" stroke-linejoin="round" stroke-linecap="round"/>${extra}`,
    '0 0 24 24',
  );
}

// ── inventory item glyphs (24×24, same ink line as icon()) ───────────────────
// These are the only coloured pictograms in the HUD: a hotbar of five identical
// navy outlines is unreadable at a glance, so each item keeps ONE saturated
// accent from the game palette inside the same ink outline as everything else.
const ITEM = {
  // salt shaker — white body, pewter dome, three holes, two escaping grains
  salt: `
    <path d="M7.6 10.6 h8.8 l.8 8.9 a1.8 1.8 0 0 1 -1.8 1.9 H8.6 a1.8 1.8 0 0 1 -1.8 -1.9 Z" fill="#fffaf1"/>
    <path d="M7.4 10.6 q4.6 -6.6 9.2 0 Z" fill="#cfd6e4"/>
    <g fill="#2a1430" stroke="none"><circle cx="10.2" cy="7.9" r=".85"/><circle cx="13.8" cy="7.9" r=".85"/><circle cx="12" cy="6.2" r=".85"/></g>
    <path d="M9.2 15 h5.6" stroke-width="1.5" opacity=".45"/>
    <g fill="#2a1430" stroke="none" opacity=".55"><circle cx="4.4" cy="5.4" r=".95"/><circle cx="19.6" cy="4.6" r=".8"/></g>`,
  // candy-cane bat — pink cane with cream stripes, drawn as ink-under-colour
  bat: `
    <path d="M7.6 20.6 V12.4 a4.7 4.7 0 0 1 9.4 0 v1.3" stroke-width="7"/>
    <path d="M7.6 20.6 V12.4 a4.7 4.7 0 0 1 9.4 0 v1.3" stroke="#ff5f8f" stroke-width="4"/>
    <path d="M5.9 18.6 l3.4 -1.1 M5.9 14.6 l3.4 -1.1 M11 7.9 l1.1 3.3 M15.4 9.4 l2.6 2.2" stroke="#fff6fa" stroke-width="1.7"/>`,
  // gumball slingshot — wooden fork, band, loaded gumball
  slingshot: `
    <path d="M12 21.4 V13.2 M12 13.2 L7.2 6.6 M12 13.2 L16.8 6.6" stroke-width="6"/>
    <path d="M12 21.4 V13.2 M12 13.2 L7.2 6.6 M12 13.2 L16.8 6.6" stroke="#b9793f" stroke-width="3.2"/>
    <path d="M7.2 6.6 q4.8 5 9.6 0" stroke="#5b4a6b" stroke-width="1.8"/>
    <circle cx="12" cy="10" r="2.5" fill="#37bcd8" stroke-width="1.7"/>`,
  // lemon spritzer — lemon body, pump collar, mist
  spritzer: `
    <ellipse cx="11.2" cy="15.6" rx="6.6" ry="5.6" fill="#ffd645"/>
    <path d="M8.6 8.4 h5 v2.4 h-5 Z" fill="#e2e8f1"/>
    <path d="M13.6 9.6 h3.4" stroke-width="2.1"/>
    <path d="M7.8 14.2 q1.8 -1.8 3.8 -.8" stroke="#fff6d0" stroke-width="1.7"/>
    <g fill="#8fd8ff" stroke="none"><circle cx="19.6" cy="7.6" r="1.15"/><circle cx="21.6" cy="10" r=".85"/><circle cx="18.9" cy="11.2" r=".8"/></g>`,
  // spray bottle — blue bottle, angled nozzle, mist
  spray: `
    <path d="M7.4 11 h7.2 a1.7 1.7 0 0 1 1.7 1.7 v6.8 a1.7 1.7 0 0 1 -1.7 1.7 H7.4 a1.7 1.7 0 0 1 -1.7 -1.7 v-6.8 A1.7 1.7 0 0 1 7.4 11 Z" fill="#7fcdf5"/>
    <path d="M9.2 11 V8 h3.6 v3 Z" fill="#e2e8f1"/>
    <path d="M12.8 8.6 h3.4 l1.8 -2" stroke-width="2.1"/>
    <path d="M6.9 14.4 h8.2" stroke-width="1.4" opacity=".5"/>
    <g fill="#8fd8ff" stroke="none"><circle cx="19.8" cy="5" r="1.15"/><circle cx="21.6" cy="7.4" r=".85"/><circle cx="18.6" cy="8.4" r=".8"/></g>`,
  // salt gun — blaster with a hopper of grains on top, muzzle spray
  saltgun: `
    <path d="M4.8 11.2 H15.6 l3.4 1.9 v2.3 H12.4 l-1.3 5 H7.2 l1.1 -5 H4.8 Z" fill="#dfe6f2"/>
    <path d="M8.4 11.2 V8 h4.6 v3.2 Z" fill="#fffaf1"/>
    <g fill="#2a1430" stroke="none"><circle cx="9.9" cy="9.4" r=".72"/><circle cx="11.9" cy="9.9" r=".72"/></g>
    <path d="M20.4 12.6 h1.8 M20.4 15.6 h1.8" stroke-width="1.5" opacity=".7"/>`,
  // the caramelizer — heat gun with a flame at the muzzle
  caramelizer: `
    <path d="M4.6 9.4 h9.4 a1.5 1.5 0 0 1 1.5 1.5 v.9 h2.6 v2.8 h-2.6 v.5 a1.5 1.5 0 0 1 -1.5 1.5 H10.1 l-1.2 4.8 H5.1 l1.2 -4.8 H4.6 Z" fill="#c98a3f"/>
    <path d="M6.4 11.6 h5.4" stroke-width="1.5" opacity=".55"/>
    <path d="M18.2 11.9 q3.6 -.5 4.6 1.4 q-1.4 2.2 -4.6 1.4 Z" fill="#ff8a3c"/>
    <path d="M19.4 12.9 q1.5 -.3 2.1 .5 q-.7 .9 -2.1 .6 Z" fill="#ffd257" stroke="none"/>`,
  // wrapped candy — the currency
  candy: `
    <ellipse cx="12" cy="12.2" rx="4.7" ry="4.3" fill="#ff5f8f"/>
    <path d="M7.6 10.4 L3.2 7.4 l1.1 4.8 l-1.1 4.8 l4.4 -3 Z" fill="#ff9ec0"/>
    <path d="M16.4 10.4 L20.8 7.4 l-1.1 4.8 l1.1 4.8 l-4.4 -3 Z" fill="#ff9ec0"/>
    <path d="M10.1 10.6 q1.9 -1.3 3.6 0" stroke="#fff6fa" stroke-width="1.5"/>`,
  // cave key
  key: `
    <path d="M10.6 12.4 L18.8 20.6 M14.4 16.2 l1.8 -1.8 M16.6 18.4 l1.8 -1.8" stroke-width="5"/>
    <path d="M10.6 12.4 L18.8 20.6 M14.4 16.2 l1.8 -1.8 M16.6 18.4 l1.8 -1.8" stroke="#ffc94a" stroke-width="2.4"/>
    <circle cx="8.2" cy="9.8" r="4.2" fill="#ffc94a"/>
    <circle cx="8.2" cy="9.8" r="1.4" fill="#2a1430" stroke="none"/>`,
  // THE WINCH — brass drum on a stand, crank handle (escape item for The Big Fling)
  winch: `
    <path d="M4.6 20.4 L7.4 13.4 M13.4 13.4 L16.2 20.4 M3.6 20.4 h13.6" stroke-width="2"/>
    <rect x="4.4" y="7.4" width="12" height="7.6" rx="2.2" fill="#e7a94a"/>
    <path d="M7.6 7.6 v7.2 M10.4 7.6 v7.2 M13.2 7.6 v7.2" stroke-width="1.3" opacity=".5"/>
    <path d="M16.4 11.2 h2.8 v-5.2 h2.4" stroke-width="2.1"/>
    <circle cx="21.2" cy="6" r="1.5" fill="#ff5f8f" stroke-width="1.5"/>`,
  // jawbreaker cannon — stubby barrel on wheels, a striped jawbreaker in the mouth
  cannon: `
    <path d="M4.6 15.6 L15.8 9.2 a3 3 0 0 1 3 5.2 L7.6 20.8 Z" fill="#8a7bd0"/>
    <circle cx="8.2" cy="18.6" r="3" fill="#ffc94a" stroke-width="1.7"/>
    <circle cx="19.2" cy="7.4" r="3.1" fill="#ff5f8f" stroke-width="1.7"/>
    <path d="M17.4 6.4 q1.8 1 3.6 0" stroke="#fff6fa" stroke-width="1.3"/>`,
  // licorice whip — a black twist with a red tip, cracking
  whip: `
    <path d="M4.4 20.2 L7.6 17 q5 -4.6 3.6 -8.6 q-1.4 -4 4 -4.4 q4.6 -.4 5.6 3.2" stroke-width="5"/>
    <path d="M4.4 20.2 L7.6 17 q5 -4.6 3.6 -8.6 q-1.4 -4 4 -4.4 q4.6 -.4 5.6 3.2" stroke="#3a2438" stroke-width="2.6"/>
    <path d="M4 20.6 l3 -3" stroke="#e8343f" stroke-width="3.4"/>
    <path d="M20.8 9.6 l1.4 1.4 M22 7.4 h1.4" stroke-width="1.4" opacity=".7"/>`,
  // pop rocks — a torn packet with fizzing crystals
  poprocks: `
    <path d="M5.4 8.6 l2 -2 l2 1.6 l2 -1.6 l2 1.6 l2 -1.6 l2 2 v11.2 a1.6 1.6 0 0 1 -1.6 1.6 H7 a1.6 1.6 0 0 1 -1.6 -1.6 Z" fill="#ff7a4f"/>
    <path d="M8.4 12.8 l1.6 -1.6 l1.6 1.6 l-1.6 1.6 Z M12.6 16 l1.4 -1.4 l1.4 1.4 l-1.4 1.4 Z" fill="#9ff0ff" stroke-width="1.3"/>
    <path d="M9.4 3.4 v1.2 M13 2.2 v1.4 M16.2 3.2 v1.2" stroke-width="1.5"/>`,
  // bubblegum blower — pink bubble on a mouthpiece
  gum: `
    <circle cx="14" cy="9.4" r="6.4" fill="#ff9ec0"/>
    <path d="M11.2 6.4 q1.6 -1.6 3.6 -1.2" stroke="#fff6fa" stroke-width="1.6"/>
    <path d="M4.2 19.8 l4.6 -4.6" stroke-width="5"/>
    <path d="M4.2 19.8 l4.6 -4.6" stroke="#37bcd8" stroke-width="2.6"/>`,
  // marshmallow launcher — a fat tube with a marshmallow loaded
  marshmallow: `
    <path d="M3.6 16.4 l9.8 -6.2 l3 4.6 l-9.8 6.2 Z" fill="#c7b4f0"/>
    <path d="M6.4 20.6 l-1 1.8" stroke-width="2.4"/>
    <rect x="15" y="4.2" width="6.6" height="6.6" rx="2.2" fill="#fffaf1" transform="rotate(-32 18.3 7.5)"/>`,
  // peppermint boomerang — red/white swirl bent into a V
  boomerang: `
    <path d="M4.2 18.8 q7.8 -1.6 8.6 -10.6 q.8 9 7.4 13" stroke-width="6"/>
    <path d="M4.2 18.8 q7.8 -1.6 8.6 -10.6 q.8 9 7.4 13" stroke="#fff6fa" stroke-width="3.4"/>
    <path d="M6.6 18.2 l1.2 -2.2 M10 15.6 l1.8 -1.2 M14 13.4 l1.6 1.4 M17 17 l1.8 .6" stroke="#e8343f" stroke-width="2"/>`,
  // water balloon — a blue balloon, knotted, one drip
  balloon: `
    <path d="M12 3.2 c4 0 6.6 3.2 6.6 7 c0 4.2 -3 7.4 -6.6 7.4 s-6.6 -3.2 -6.6 -7.4 c0 -3.8 2.6 -7 6.6 -7 Z" fill="#6fc6f4"/>
    <path d="M12 17.6 l-1.4 2 h2.8 Z" fill="#6fc6f4" stroke-width="1.5"/>
    <path d="M9.2 7.4 q1.2 -1.6 3 -1.6" stroke="#e8f8ff" stroke-width="1.6"/>
    <path d="M18.6 17.4 q1.2 1.8 0 2.8 q-1.2 -1 0 -2.8 Z" fill="#6fc6f4" stroke-width="1.2"/>`,
  // fallback — a paper bag of something
  unknown: `
    <path d="M5.6 9.8 h12.8 l-1.1 9.9 a1.7 1.7 0 0 1 -1.7 1.5 H8.4 a1.7 1.7 0 0 1 -1.7 -1.5 Z" fill="#ffe3ae"/>
    <path d="M8.8 9.8 q3.2 -5.6 6.4 0"/>`,
};

/** Which item glyph suits this id/name? Matched loosely so ids can drift. */
export function glyphForItem(id = '', name = '') {
  const s = `${id} ${name}`.toLowerCase();
  // wave-3 kit first (their names would otherwise fall through to 'unknown')
  if (/winch|crank/.test(s)) return 'winch';
  if (/jawbreak|cannon/.test(s)) return 'cannon';
  if (/licorice|whip/.test(s)) return 'whip';
  if (/pop.?rock/.test(s)) return 'poprocks';
  if (/bubble|gum.?blow/.test(s)) return 'gum';
  if (/marshmallow/.test(s)) return 'marshmallow';
  if (/boomerang|peppermint/.test(s)) return 'boomerang';
  if (/balloon/.test(s)) return 'balloon';
  if (/caramel|torch|heat|burn|flame/.test(s)) return 'caramelizer';
  if (/salt.?gun|saltgun|salt.?blaster/.test(s)) return 'saltgun';
  if (/salt/.test(s)) return 'salt';
  if (/bat|cane|club|hammer|mallet/.test(s)) return 'bat';
  if (/sling|gumball|catapult/.test(s)) return 'slingshot';
  if (/lemon|spritz|squirt/.test(s)) return 'spritzer';
  if (/spray|bottle|mist/.test(s)) return 'spray';
  if (/candy|sweet|gumdrop/.test(s)) return 'candy';
  if (/key/.test(s)) return 'key';
  if (/fish/.test(s)) return 'fish';
  return 'unknown';
}

/**
 * An inventory pictogram. Falls back to the line-art icon set for names that
 * aren't items (so `item('fish')` still draws a fish).
 */
export function item(name, o = {}) {
  const g = ITEM[name];
  if (!g) return P[name] ? icon(name, o) : item('unknown', o);
  return wrap(
    `<g stroke="${INK}" stroke-width="${o.w || 2}" stroke-linejoin="round" stroke-linecap="round" fill="none">${g}</g>`,
    '0 0 24 24',
  );
}

/** Canvas pictograms for minimap POIs — same shapes, drawn as paths. */
export const POI_PATHS = {
  home: 'M3.6 11.2 L12 3.8 l8.4 7.4 M6 9.6 V20.4 h12 V9.6',
  cup: P.cup, peak: P.peak, drop: P.drop, gym: P.gym, tower: P.tower,
  exit: P.exit, ferry: 'M12 14 V6 M4 14 h16 l-2 6 H6 Z', star: P.star,
  paw: 'M12 13 c2.9 0 4.9 1.7 4.9 3.6 c0 2 -2 3.1 -4.9 3.1 c-2.9 0 -4.9 -1.1 -4.9 -3.1 c0 -1.9 2 -3.6 4.9 -3.6 Z'
     + ' M6.6 8 a2 2.5 0 1 0 0 5 a2 2.5 0 1 0 0 -5 Z M17.4 8 a2 2.5 0 1 0 0 5 a2 2.5 0 1 0 0 -5 Z'
     + ' M9.9 3.9 a1.9 2.4 0 1 0 0 4.8 a1.9 2.4 0 1 0 0 -4.8 Z M14.1 3.9 a1.9 2.4 0 1 0 0 4.8 a1.9 2.4 0 1 0 0 -4.8 Z',
  lolli: 'M12 21 v-6 M12 3 a6 6 0 1 0 0 12 a6 6 0 1 0 0 -12',
  tree: 'M12 21 v-4.4 M4.8 16.6 h14.4 L12 3.6 Z',
  fish: P.fish,
  q: 'M8.6 8.4 a3.6 3.6 0 1 1 3.4 4.8 v2 M12 19 v.4',
  // ── wave-3 map-marker pictograms (ui.addMapMarker glyphs) ──
  // cave key: a round bow with cat ears, a shaft, two teeth
  key: 'M4.7 6.4 l.5 -3.6 l2.5 2.2 M11.7 6.4 l-.5 -3.6 l-2.5 2.2 M3.9 9.2 a4.3 4.3 0 1 0 8.6 0 a4.3 4.3 0 1 0 -8.6 0 Z M11.3 12.3 L19.6 20.6 M15.2 16.2 l2.2 -2.2 M17.6 18.6 l2.2 -2.2',
  // winch: a drum on a stand with a crank
  winch: 'M4.4 8.4 h11.2 v7 h-11.2 Z M8.2 8.4 v7 M11.8 8.4 v7 M6 15.4 L4.4 20.6 M14 15.4 l1.6 5.2 M15.6 11.9 h3.4 V6.4 h2.6',
  // ammo: a pyramid of three jawbreakers
  ammo: 'M5 16.4 a3.2 3.2 0 1 0 6.4 0 a3.2 3.2 0 1 0 -6.4 0 Z M12.6 16.4 a3.2 3.2 0 1 0 6.4 0 a3.2 3.2 0 1 0 -6.4 0 Z M8.8 9.6 a3.2 3.2 0 1 0 6.4 0 a3.2 3.2 0 1 0 -6.4 0 Z',
  // weapon: the candy-cane bat
  weapon: 'M8.4 21 V10.6 a4.2 4.2 0 0 1 8.4 0 v1.8 M8.4 17 l3 -1.4 M8.4 13 l3 -1.4',
  // thermal: three rising warm wisps (the flyer's lift columns)
  thermal: 'M6.4 20.4 q-2.4 -4.2 0 -8.2 q2.2 -3.8 0 -8 M12 20.4 q-2.4 -4.2 0 -8.2 q2.2 -3.8 0 -8 M17.6 20.4 q-2.4 -4.2 0 -8.2 q2.2 -3.8 0 -8',
  // plane: a paper plane
  plane: 'M2.8 11.6 L21.2 4 L15.4 20.2 L11.4 14 Z M11.4 14 L21.2 4 M11.4 14 v5.2 l2.4 -2.4',
};
