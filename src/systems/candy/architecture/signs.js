// Every piece of readable text in Candyland lives here: the canvas draw for the
// shared sign atlas AND the line spoken when the player interacts with it.
// `size` on a line is a FRACTION of the cell height (see kit.plate).
import { plate, fitFont } from './kit.js';

const cream = '#fff4e2', pink = '#ffe2ee', mint = '#e2fbf0', wafer = '#f6e0b6';
const ink = '#3a2430', red = '#c4173a', deepPink = '#b8336a';

const WIDE = { cw: 5, ch: 2 };   // 640 × 256
const SQ = { cw: 3, ch: 2 };     // 384 × 256
const ARM = { cw: 4, ch: 1 };    // 512 × 128
const TAG = { cw: 2, ch: 1 };    // 256 × 128

export const HOUSE_NAMES = ["Sourly's", 'The Puckers', 'Fizzwick End', 'Chewbert House', "Miss Tang's", 'The Winceys', 'Zing Manor', 'Gummond Cottage', 'Pip & Pucker', 'Lemon Drop Lodge', 'The Sournesses', 'Old Molasses'];

/** id → { cw, ch, draw(g,w,h), say?, speaker? } */
export const SIGNS = {
  welcome: {
    cw: 8, ch: 3,
    say: 'WELCOME TO CANDYLAND — population: delicious. Someone has painted over a line at the bottom: "do not stay past dark". It has been crossed out. Twice.',
    draw(g, w, h) {
      plate(g, w, h, {
        bg: cream, edge: red, borderW: 6, dots: true, dotColor: '#ffd1e6',
        lines: [
          { text: 'WELCOME  TO', size: 0.13, y: 0.17, color: deepPink, fat: true, maxW: 0.5 },
          { text: 'CANDYLAND', size: 0.36, y: 0.45, color: red, fat: true },
          { text: 'population: delicious', size: 0.11, y: 0.69, color: ink },
        ],
      });
      g.globalAlpha = 0.5; g.fillStyle = '#fdeedd'; g.fillRect(w * 0.22, h * 0.775, w * 0.56, h * 0.15); g.globalAlpha = 1;
      const tw = fitFont(g, 'do not stay past dark', 0.085, h, w * 0.5, false);
      g.fillStyle = 'rgba(120,70,90,.5)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('do not stay past dark', w * 0.5, h * 0.855);
      g.strokeStyle = 'rgba(150,40,60,.48)'; g.lineWidth = h * 0.016;
      g.beginPath(); g.moveTo(w * 0.5 - tw / 2 - 8, h * 0.875); g.lineTo(w * 0.5 + tw / 2 + 8, h * 0.835); g.stroke();
      g.beginPath(); g.moveTo(w * 0.5 - tw / 2 - 8, h * 0.835); g.lineTo(w * 0.5 + tw / 2 + 8, h * 0.878); g.stroke();
    },
  },
  ferry: {
    ...WIDE, speaker: 'Ticket Booth',
    say: 'FERRY → CAT ISLAND — one way? no, round trip! (probably)',
    draw: (g, w, h) => plate(g, w, h, { bg: cream, edge: red, borderW: 5, lines: [
      { text: 'FERRY → CAT ISLAND', size: 0.24, y: 0.28, color: red, fat: true },
      { text: 'one way? no, round trip!', size: 0.17, y: 0.58, color: ink },
      { text: '(probably)', size: 0.12, y: 0.81, color: '#8a6a78' },
    ] }),
  },
  fares: {
    ...SQ, say: 'FARES — adults three gumdrops, children free, humans PLEASE SEE THE BOOTH.',
    draw: (g, w, h) => plate(g, w, h, { bg: wafer, edge: '#8f5527', borderW: 5, lines: [
      { text: 'FARES', size: 0.22, y: 0.17, color: '#7a3f1c', fat: true },
      { text: 'adults · 3 gumdrops', size: 0.12, y: 0.42, color: ink },
      { text: 'children · free', size: 0.12, y: 0.6, color: ink },
      { text: 'humans · see booth', size: 0.12, y: 0.8, color: red },
    ] }),
  },
  // The first board in the game, and round 3 said its letterforms came apart at
  // native resolution. Two fixes: a WIDE cell (640 × 256, two and a half times
  // the pixels of the old square one) and ONE line of text across it instead of
  // two stacked words, so the glyphs are half again as tall on the board.
  pier: {
    ...WIDE, say: 'SUGAR PIER — built 1884. Licked away 1885. Rebuilt slightly smaller every spring since.',
    draw: (g, w, h) => plate(g, w, h, { bg: pink, edge: deepPink, borderW: 6, dots: true, lines: [
      { text: 'SUGAR PIER', size: 0.46, y: 0.44, color: deepPink, fat: true, maxW: 0.84 },
      { text: 'est. 1884', size: 0.15, y: 0.81, color: ink },
    ] }),
  },
  village: {
    ...WIDE, say: 'GUMDROP VILLAGE — please wipe your feet. Please do not wipe your feet on a resident.',
    draw: (g, w, h) => plate(g, w, h, { bg: cream, edge: '#5aa83a', borderW: 5, dots: true, dotColor: '#ffd1e6', lines: [
      { text: 'GUMDROP VILLAGE', size: 0.28, y: 0.31, color: '#3f8f3a', fat: true },
      { text: 'please wipe your feet', size: 0.15, y: 0.61, color: ink },
      { text: '· not on a resident ·', size: 0.12, y: 0.82, color: '#8a6a78' },
    ] }),
  },
  bandstand: {
    ...WIDE, say: 'GUMDROP VILLAGE BAND — Friday nights. Bring a friend! Bring two! Bring a whole tour group!',
    draw: (g, w, h) => plate(g, w, h, { bg: '#2a1c33', edge: '#ffd86b', borderW: 4, grain: false, lines: [
      { text: 'VILLAGE BAND', size: 0.27, y: 0.29, color: '#ffd86b', fat: true },
      { text: 'friday nights · bring a friend', size: 0.145, y: 0.58, color: '#ffe9bc' },
      { text: 'bring two. bring a tour group.', size: 0.12, y: 0.81, color: '#c9a7d8' },
    ] }),
  },
  stall_drops: {
    ...SQ, say: 'SOUR LEMON DROPS, two for one! The second one is for later. The second one is always for later.',
    draw: (g, w, h) => plate(g, w, h, { bg: '#fff3ba', edge: '#d4a017', borderW: 5, lines: [
      { text: 'SOUR', size: 0.22, y: 0.2, color: '#a07800', fat: true },
      { text: 'LEMON DROPS', size: 0.15, y: 0.45, color: '#7a5c00' },
      { text: '2 for 1', size: 0.22, y: 0.75, color: red, fat: true },
    ] }),
  },
  stall_fizz: {
    ...SQ, say: 'FIZZ BOMBS — mind your teeth. Mind everyone\'s teeth, really.',
    draw: (g, w, h) => plate(g, w, h, { bg: '#dff1ff', edge: '#3a8fd0', borderW: 5, lines: [
      { text: 'FIZZ', size: 0.25, y: 0.22, color: '#1c5f96', fat: true },
      { text: 'BOMBS', size: 0.25, y: 0.52, color: '#1c5f96', fat: true },
      { text: 'mind your teeth', size: 0.11, y: 0.83, color: ink },
    ] }),
  },
  stall_taffy: {
    ...SQ, say: 'PULLED TAFFY — pulled fresh daily. Pulled from where? …lovely weather, isn\'t it.',
    draw: (g, w, h) => plate(g, w, h, { bg: pink, edge: deepPink, borderW: 5, lines: [
      { text: 'TAFFY', size: 0.26, y: 0.26, color: deepPink, fat: true },
      { text: 'pulled fresh daily', size: 0.12, y: 0.56, color: ink },
      { text: 'don\'t ask from what', size: 0.1, y: 0.79, color: '#8a6a78' },
    ] }),
  },
  fountain: {
    ...SQ, say: 'THE SUGAR FOUNTAIN — drinking encouraged, swimming discouraged, dissolving entirely your own business.',
    draw: (g, w, h) => plate(g, w, h, { bg: '#ffe9f4', edge: deepPink, borderW: 5, lines: [
      { text: 'SUGAR', size: 0.22, y: 0.22, color: deepPink, fat: true },
      { text: 'FOUNTAIN', size: 0.17, y: 0.5, color: deepPink },
      { text: 'drink · don\'t dissolve', size: 0.1, y: 0.78, color: ink },
    ] }),
  },
  to_pier: { ...ARM, draw: (g, w, h) => arm(g, w, h, 'SUGAR PIER', '#d94f7a') },
  to_village: { ...ARM, draw: (g, w, h) => arm(g, w, h, 'GUMDROP VILLAGE', '#4f9f3f') },
  to_peak: { ...ARM, draw: (g, w, h) => arm(g, w, h, 'FROSTING PEAK', '#3a7fc0') },
  to_lake: { ...ARM, draw: (g, w, h) => arm(g, w, h, 'CHOCOLATE LAKE', '#7a4a2a') },
  to_cupcake: { ...ARM, draw: (g, w, h) => arm(g, w, h, 'GREAT CUPCAKE', '#d06a30') },
  to_forest: { ...ARM, draw: (g, w, h) => arm(g, w, h, 'GUMMY FOREST', '#7a3fbf') },
  to_meadow: { ...ARM, draw: (g, w, h) => arm(g, w, h, 'LOLLIPOP MEADOW', '#c94f9f') },
  // Somebody put up an arm to the Sour Shrine. Somebody else had opinions.
  to_nowhere: { ...ARM, draw: (g, w, h) => arm(g, w, h, 'SHRINE →', '#6a4f8a', { strike: true, sub: '( do not )', subColor: '#b02030' }) },
  cupcake: {
    ...WIDE, say: 'THE GREAT CUPCAKE — a private residence. Please do not lick the walls. (Previous visitors licked the walls.)',
    draw: (g, w, h) => plate(g, w, h, { bg: cream, edge: '#d06a30', borderW: 5, dots: true, dotColor: '#ffd1e6', lines: [
      { text: 'THE GREAT CUPCAKE', size: 0.25, y: 0.29, color: '#d06a30', fat: true },
      { text: 'a private residence', size: 0.15, y: 0.58, color: ink },
      { text: 'please do not lick the walls', size: 0.12, y: 0.81, color: red },
    ] }),
  },
  peak: {
    ...WIDE, say: 'FROSTING PEAK LOOKOUT — 214 steps. We counted. Twice. The second count said 213 and we do not discuss it.',
    draw: (g, w, h) => plate(g, w, h, { bg: '#eef6ff', edge: '#5a8fd0', borderW: 5, lines: [
      { text: 'FROSTING PEAK', size: 0.28, y: 0.29, color: '#2f6fb0', fat: true },
      { text: 'lookout · 214 steps', size: 0.16, y: 0.59, color: ink },
      { text: 'we counted. twice.', size: 0.12, y: 0.82, color: '#6a7a8a' },
    ] }),
  },
  cave: {
    ...SQ, say: 'WAFFLE CAVE — CLOSED. The sign is nailed to nothing. The cave is very much open.',
    draw: (g, w, h) => plate(g, w, h, { bg: wafer, edge: '#5e3a14', borderW: 5, lines: [
      { text: 'WAFFLE', size: 0.2, y: 0.2, color: '#5e3a14', fat: true },
      { text: 'CAVE', size: 0.2, y: 0.48, color: '#5e3a14', fat: true },
      { text: 'CLOSED', size: 0.17, y: 0.79, color: red, strike: true, fat: true },
    ] }),
  },
  lake: {
    ...WIDE, say: 'CHOCOLATE LAKE — no swimming. You will float. Then you will be found. Then you will be eaten.',
    // Round 2: the subtitle was red-on-cream at 0.115 of a 256px cell and
    // unreadable at the game camera. Now: a cream title band on dark chocolate,
    // and the warning reversed out WHITE on a red bar — the highest-contrast
    // pair on the board, on the biggest sign in Candyland.
    draw(g, w, h) {
      g.fillStyle = '#5e3a14'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f6e4cf'; g.fillRect(h * 0.05, h * 0.05, w - h * 0.1, h * 0.52);
      let tw = fitFont(g, 'CHOCOLATE LAKE', 0.30, h, w * 0.86, true);
      g.fillStyle = '#4a2a0e'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('CHOCOLATE LAKE', w * 0.5, h * 0.32);
      g.fillStyle = '#b3121f'; g.fillRect(h * 0.05, h * 0.60, w - h * 0.1, h * 0.35);
      tw = fitFont(g, 'NO SWIMMING · YOU WILL FLOAT', 0.20, h, w * 0.84, true);
      g.fillStyle = '#fff6ec';
      g.fillText('NO SWIMMING · YOU WILL FLOAT', w * 0.5, h * 0.775);
      void tw;
      g.strokeStyle = '#ffd08a'; g.lineWidth = h * 0.035;
      g.strokeRect(h * 0.025, h * 0.025, w - h * 0.05, h - h * 0.05);
    },
  },
  boats: {
    ...SQ, say: 'BOAT HIRE — one paddle boat available. It is the same paddle boat. It has always been the same paddle boat.',
    draw: (g, w, h) => plate(g, w, h, { bg: mint, edge: '#2a8f8a', borderW: 5, lines: [
      { text: 'BOATS', size: 0.25, y: 0.28, color: '#1c6f6a', fat: true },
      { text: 'hire · 1 available', size: 0.12, y: 0.57, color: ink },
      { text: 'always exactly 1', size: 0.1, y: 0.79, color: '#6a8a88' },
    ] }),
  },
  bridge: {
    ...SQ, say: 'MIND THE SYRUP. It is sticky, it is warm, and last spring it took a wheelbarrow.',
    draw: (g, w, h) => plate(g, w, h, { bg: '#ffe0ee', edge: deepPink, borderW: 5, lines: [
      { text: 'MIND', size: 0.23, y: 0.25, color: deepPink, fat: true },
      { text: 'THE SYRUP', size: 0.18, y: 0.53, color: deepPink },
      { text: 'it took a wheelbarrow', size: 0.095, y: 0.8, color: ink },
    ] }),
  },
  donut: {
    ...WIDE, say: 'THE GREAT DONUT ARCH — erected by the village, in honour of the village. Mind the sprinkles, they roll.',
    draw: (g, w, h) => plate(g, w, h, { bg: pink, edge: deepPink, borderW: 5, dots: true, lines: [
      { text: 'CANDYLAND', size: 0.34, y: 0.35, color: deepPink, fat: true },
      { text: 'mind the sprinkles — they roll', size: 0.13, y: 0.73, color: ink },
    ] }),
  },
  shrine: {
    ...WIDE, say: 'THE SOUR SHRINE — offerings accepted. You brought one, right? You did bring one?',
    draw: (g, w, h) => plate(g, w, h, { bg: '#2b2438', edge: '#9bd63a', borderW: 4, grain: false, lines: [
      { text: 'THE SOUR SHRINE', size: 0.26, y: 0.3, color: '#c9ff6b', fat: true },
      { text: 'offerings accepted', size: 0.16, y: 0.59, color: '#e6f7c8' },
      { text: 'you brought one, right?', size: 0.12, y: 0.82, color: '#9bd63a' },
    ] }),
  },
  shrine_face: {
    cw: 3, ch: 3,
    say: 'The stone has a face. The face is having a wonderful time.',
    draw(g, w, h) {
      g.fillStyle = '#6b6478'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.10)';
      for (let i = 0; i < 40; i++) g.fillRect(((i * 61) % 100) / 100 * w, ((i * 29) % 100) / 100 * h, w * 0.03, h * 0.02);
      for (const ex of [w * 0.31, w * 0.69]) {
        g.fillStyle = '#f6ffe0'; g.beginPath(); g.ellipse(ex, h * 0.36, w * 0.16, h * 0.12, 0, 0, 7); g.fill();
        g.fillStyle = '#1a1420'; g.beginPath(); g.arc(ex + w * 0.02, h * 0.375, w * 0.075, 0, 7); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex + w * 0.05, h * 0.345, w * 0.028, 0, 7); g.fill();
      }
      g.fillStyle = '#1a1420';
      g.beginPath(); g.moveTo(w * 0.17, h * 0.56); g.quadraticCurveTo(w * 0.5, h * 0.84, w * 0.83, h * 0.56);
      g.quadraticCurveTo(w * 0.5, h * 0.66, w * 0.17, h * 0.56); g.fill();
      g.fillStyle = '#f6ffe0';
      for (let i = 0; i < 7; i++) {
        const t = 0.21 + i * 0.097, x = w * t, yy = h * (0.585 + 0.09 * Math.sin(Math.PI * ((t - 0.21) / 0.58)));
        g.beginPath(); g.moveTo(x - w * 0.026, yy); g.lineTo(x + w * 0.026, yy); g.lineTo(x, yy + h * 0.055); g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(255,120,160,.38)';
      g.beginPath(); g.arc(w * 0.14, h * 0.52, w * 0.085, 0, 7); g.fill();
      g.beginPath(); g.arc(w * 0.86, h * 0.52, w * 0.085, 0, 7); g.fill();
    },
  },
  lost_found: {
    ...SQ, say: 'LOST & FOUND — one shoe, one hat, one suitcase. Unclaimed since last Tuesday. Every Tuesday.',
    draw: (g, w, h) => plate(g, w, h, { bg: '#3a3048', edge: '#9bd63a', borderW: 4, grain: false, lines: [
      { text: 'LOST', size: 0.2, y: 0.2, color: '#c9ff6b', fat: true },
      { text: '& FOUND', size: 0.15, y: 0.44, color: '#c9ff6b' },
      { text: 'shoe · hat · case', size: 0.1, y: 0.67, color: '#e6f7c8' },
      { text: 'unclaimed', size: 0.09, y: 0.85, color: '#9bd63a' },
    ] }),
  },
  candybar: {
    ...SQ, say: 'THE LEANING BAR OF CANDYLAND — structurally fine. Structurally FINE. Do not push.',
    draw: (g, w, h) => plate(g, w, h, { bg: '#f0ddc0', edge: '#5e3a14', borderW: 5, lines: [
      { text: 'THE LEANING', size: 0.14, y: 0.19, color: '#5e3a14', fat: true },
      { text: 'BAR', size: 0.26, y: 0.47, color: '#5e3a14', fat: true },
      { text: 'do not push', size: 0.12, y: 0.78, color: red },
    ] }),
  },
  // ── interiors ──────────────────────────────────────────────────────────────
  timetable: {
    ...WIDE, say: 'SAILINGS — Cat Island: hourly. Return trips: ask on Cat Island. Someone has written "we did" underneath, in a different hand, very small.',
    draw: (g, w, h) => plate(g, w, h, { bg: cream, edge: '#2f6fb0', borderW: 4, lines: [
      { text: 'SAILINGS', size: 0.2, y: 0.16, color: '#2f6fb0', fat: true },
      { text: 'to CAT ISLAND · hourly', size: 0.135, y: 0.40, color: ink },
      { text: 'RETURN TRIPS:', size: 0.135, y: 0.62, color: red, fat: true },
      { text: 'ask on Cat Island', size: 0.135, y: 0.82, color: red },
    ] }),
  },
  lostfound_in: {
    ...TAG, say: 'A bin of hats. Forty-one hats. No coats, no bags, no shoes. Just hats, and every one of them is the wrong way up.',
    draw: (g, w, h) => plate(g, w, h, { bg: wafer, edge: '#8f5527', borderW: 6, lines: [
      { text: 'LOST & FOUND', size: 0.26, y: 0.32, color: '#7a3f1c', fat: true },
      { text: 'hats only', size: 0.2, y: 0.72, color: ink },
    ] }),
  },
  houserules: {
    ...SQ, say: 'HOUSE RULES — 1. wipe your feet. 2. no biting guests before 19:30. 3. a guest is not a snack. 4. …until 19:30.',
    draw: (g, w, h) => plate(g, w, h, { bg: '#fff3ba', edge: '#7a5c00', borderW: 5, lines: [
      { text: 'HOUSE RULES', size: 0.155, y: 0.15, color: '#7a5c00', fat: true },
      { text: '1. wipe your feet', size: 0.105, y: 0.38, color: ink },
      { text: '2. no biting guests', size: 0.105, y: 0.55, color: ink },
      { text: 'before 19:30', size: 0.105, y: 0.7, color: ink },
      { text: '3. …then it is fine', size: 0.1, y: 0.87, color: red },
    ] }),
  },
  tally: {
    ...SQ, say: 'A slate covered in tally marks. The last group is crossed through and labelled "arrived". The next group has no label yet.',
    draw(g, w, h) {
      g.fillStyle = '#2b2438'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8f5527'; g.lineWidth = h * 0.05; g.strokeRect(h * 0.03, h * 0.03, w - h * 0.06, h - h * 0.06);
      g.strokeStyle = '#e6f7c8'; g.lineWidth = Math.max(2, h * 0.018); g.lineCap = 'round';
      for (let r = 0; r < 4; r++) for (let grp = 0; grp < 4; grp++) {
        const ox = w * (0.1 + grp * 0.22), oy = h * (0.22 + r * 0.19);
        for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(ox + i * w * 0.026, oy); g.lineTo(ox + i * w * 0.026, oy + h * 0.1); g.stroke(); }
        g.beginPath(); g.moveTo(ox - w * 0.012, oy + h * 0.1); g.lineTo(ox + w * 0.09, oy); g.stroke();
      }
      fitFont(g, 'arrived', 0.12, h, w * 0.4, false);
      g.fillStyle = '#c9ff6b'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('arrived', w * 0.1, h * 0.94);
    },
  },
  ...Object.fromEntries([0, 1, 2, 3].map((i) => ['portrait' + i, { cw: 2, ch: 2, draw: (g, w, h) => portrait(g, w, h, i) }])),
  ...Object.fromEntries(HOUSE_NAMES.map((name, i) => ['name' + i, { ...TAG, draw: (g, w, h) => nameplate(g, w, h, name, i) }])),
};

/**
 * A family portrait. Everyone is adorable and everyone has about forty teeth.
 * i selects how many sitters and how wrong the grin is.
 */
function portrait(g, w, h, i) {
  const bgs = ['#f6e0b6', '#e7d8f0', '#d9eef0', '#f3dbe2'];
  const skins = [['#f5294f', '#ff7a10', '#ffc81e'], ['#3fd45f', '#2f95ff'], ['#a93cff', '#f5294f', '#3fd45f', '#ffc81e'], ['#ff7a10']];
  g.fillStyle = bgs[i % 4]; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 0, w, h * 0.42);
  const who = skins[i % skins.length], n = who.length;
  for (let k = 0; k < n; k++) {
    const cx = w * ((k + 0.5) / n), cy = h * (n > 2 ? 0.52 : 0.5), r = Math.min(w / n, h) * (n > 2 ? 0.3 : 0.34);
    g.fillStyle = who[k];
    g.beginPath(); g.ellipse(cx, cy + r * 1.25, r * 0.8, r * 0.95, 0, 0, 7); g.fill();   // body
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();                                      // head
    g.fillStyle = 'rgba(255,255,255,.5)';
    for (let s = 0; s < 5; s++) { g.beginPath(); g.arc(cx + (s - 2) * r * 0.3, cy - r * 0.72, r * 0.07, 0, 7); g.fill(); }
    // eyes
    g.fillStyle = '#1a1420';
    g.beginPath(); g.arc(cx - r * 0.34, cy - r * 0.18, r * 0.13, 0, 7); g.fill();
    g.beginPath(); g.arc(cx + r * 0.34, cy - r * 0.18, r * 0.13, 0, 7); g.fill();
    // the grin: far, far too many teeth
    g.fillStyle = '#1a1420';
    g.beginPath(); g.moveTo(cx - r * 0.62, cy + r * 0.18);
    g.quadraticCurveTo(cx, cy + r * 0.86, cx + r * 0.62, cy + r * 0.18);
    g.quadraticCurveTo(cx, cy + r * 0.34, cx - r * 0.62, cy + r * 0.18); g.fill();
    g.fillStyle = '#fffdf4';
    const teeth = 9 + i * 2;
    for (let t = 0; t < teeth; t++) {
      const u = (t + 0.5) / teeth, tx = cx - r * 0.58 + u * r * 1.16;
      const ty = cy + r * (0.22 + 0.34 * Math.sin(Math.PI * u));
      g.beginPath(); g.moveTo(tx - r * 0.045, ty - r * 0.06); g.lineTo(tx + r * 0.045, ty - r * 0.06); g.lineTo(tx, ty + r * 0.16); g.closePath(); g.fill();
    }
  }
  // an extra pair of hands on a shoulder, belonging to nobody in frame
  if (i === 1 || i === 3) {
    g.fillStyle = 'rgba(40,30,45,.55)';
    for (const dx of [-1, 1]) { g.beginPath(); g.ellipse(w * (0.5 + dx * 0.19), h * 0.63, w * 0.035, h * 0.06, dx * 0.4, 0, 7); g.fill(); }
  }
  g.strokeStyle = 'rgba(58,36,48,.45)'; g.lineWidth = h * 0.035; g.strokeRect(h * 0.025, h * 0.025, w - h * 0.05, h - h * 0.05);
}

function arm(g, w, h, text, color, o = {}) {
  g.fillStyle = '#fff6e6'; g.fillRect(0, 0, w, h);
  g.strokeStyle = color; g.lineWidth = h * 0.09; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
  const y = o.sub ? 0.4 : 0.53;
  const tw = fitFont(g, text, o.sub ? 0.42 : 0.5, h, w * 0.9, true);
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w * 0.5, h * y);
  if (o.strike) {           // two angry hand-drawn strokes through the whole thing
    g.strokeStyle = o.subColor || '#b02030'; g.lineWidth = h * 0.055; g.lineCap = 'round';
    const x0 = w * 0.5 - tw / 2 - h * 0.1, x1 = w * 0.5 + tw / 2 + h * 0.1;
    g.beginPath(); g.moveTo(x0, h * (y + 0.11)); g.lineTo(x1, h * (y - 0.1)); g.stroke();
    g.beginPath(); g.moveTo(x0, h * (y - 0.12)); g.lineTo(x1, h * (y + 0.13)); g.stroke();
  }
  if (o.sub) {
    fitFont(g, o.sub, 0.26, h, w * 0.7, false);
    g.fillStyle = o.subColor || '#8a6a78'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(o.sub, w * 0.5, h * 0.79);
  }
}

const PLATE_BG = ['#ffd9e8', '#d9f2ff', '#e6ffd9', '#fff0c2', '#efd9ff', '#d9fff2'];
function nameplate(g, w, h, name, i) {
  g.fillStyle = PLATE_BG[i % PLATE_BG.length]; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3a2430'; g.lineWidth = h * 0.07; g.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08);
  fitFont(g, name, 0.4, h, w * 0.86, false);
  g.fillStyle = '#3a2430'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, w * 0.5, h * 0.44);
  fitFont(g, '· est. sometime ·', 0.17, h, w * 0.8, false, 'normal');
  g.fillStyle = 'rgba(58,36,48,.6)';
  g.fillText('· est. sometime ·', w * 0.5, h * 0.78);
}

/** Entries array for makeSignAtlas(). */
export function signEntries() {
  return Object.entries(SIGNS).map(([id, s]) => ({ id, cw: s.cw, ch: s.ch, draw: s.draw }));
}
