// ─────────────────────────────────────────────────────────────────────────────
// ARRIVALS PIER (42,22) and WELCOME PLAZA (78,18)
// The two rooms of the joke: a pier that only works in one direction, and a
// plaza that is genuinely lovely about it.
// ─────────────────────────────────────────────────────────────────────────────
import { PAL, frame, at, windowUnit, doorUnit, block, tileRoof, awning, fascia, lamppost, bench, planter, crate, barrel, sittingCat, loafCat, catEars, bunting, paving, ribbon, column, hedge, pool, wash, halo, hangingPlate, billboard } from './parts.js';
import { ripple } from './kit.js';
import { drawLines, board, catFace, humanFace, FONTS } from './signs.js';

const DECK_Y = 4.06;

export function buildArrival(T) {
  const b = T.b, A = T.A;
  const X0 = 28.4, X1 = 40.6, Z0 = 17.4, Z1 = 26.6;   // deck extents
  const cz = (Z0 + Z1) / 2;

  // ── stone apron where the pier meets the island ──────────────────────────
  b.box(44.4, DECK_Y - 2.4, cz, 8.6, 2.5, 10.4, 0xb5a68a, { ao: 0 });
  b.box(44.4, DECK_Y - 0.16, cz, 9.0, 0.2, 10.8, 0xc2b295, { ao: 0 });
  for (let r = 0; r < 7; r++) for (let c = 0; c < 6; c++) {
    const off = (r % 2) * 0.55;
    b.box(40.6 + r * 1.22, DECK_Y - 0.04, Z0 + 1.1 + off + c * 1.6, 1.06, 0.1, 1.44, (r + c) % 3 ? 0xcdbd9e : 0xbaa98c, { ao: 0 });
  }
  for (const s of [-1, 1]) b.box(44.4, DECK_Y - 0.3, cz + s * 5.3, 8.8, 0.45, 0.45, 0x9a8b70, { ao: 0 });

  // ── pilings + stringers ───────────────────────────────────────────────────
  for (const pz of [Z0 + 0.7, cz, Z1 - 0.7]) {
    for (let x = 39.4; x > X0; x -= 3.1) {
      const seabed = Math.min(T.y(x, pz), DECK_Y - 1.2);
      b.cyl(x, seabed - 0.6, pz, 0.36, 0.42, DECK_Y - seabed + 0.4, PAL.woodDark, { seg: 8, ao: 0.6, aoBase: DECK_Y - 3 });
      b.torus(x, DECK_Y - 0.75, pz, 0.44, 0.07, 0x3f3226, { rx: -Math.PI / 2, seg: 10, tseg: 4, mat: 'metal' });
    }
    b.box((X0 + 39.8) / 2, DECK_Y - 0.62, pz, 39.8 - X0, 0.34, 0.5, PAL.woodDark, { ao: 0 });
  }
  for (let x = 39.4; x > X0; x -= 3.1) b.box(x, DECK_Y - 0.34, cz, 0.42, 0.3, Z1 - Z0 - 0.6, PAL.woodDark, { ao: 0 });

  // ── deck planks ───────────────────────────────────────────────────────────
  const nP = 25;
  for (let i = 0; i < nP; i++) {
    const x = X0 + 0.24 + i * ((X1 - X0 - 0.4) / (nP - 1));
    const c = [0xa87a4c, 0x9c6f42, 0xb2855a, 0x93663c][i % 4];
    b.box(x, DECK_Y - 0.2, cz, (X1 - X0) / nP * 0.86, 0.2, Z1 - Z0, c, { ao: 0 });
  }
  T.addDeck(X0, 46.5, Z0, Z1, DECK_Y);

  // ── railings (open at the west end where the ferry ties up) ───────────────
  for (const s of [-1, 1]) {
    const pz = cz + s * ((Z1 - Z0) / 2 - 0.15);
    for (let x = 30.2; x <= 40.4; x += 1.7) {
      b.box(x, DECK_Y, pz, 0.18, 1.15, 0.18, PAL.wood, { ao: 0.4, aoBase: DECK_Y });
      b.sph(x, DECK_Y + 1.2, pz, 0.13, PAL.woodLight, { seg: 7, rings: 5 });
    }
    b.box(35.3, DECK_Y + 0.95, pz, 10.2, 0.15, 0.26, PAL.woodLight, { ao: 0 });
    b.box(35.3, DECK_Y + 0.52, pz, 10.2, 0.12, 0.2, PAL.wood, { ao: 0 });
    // hanging buoys
    for (const x of [32.6, 37.4]) {
      b.cyl(x, DECK_Y - 0.55, pz + s * 0.2, 0.28, 0.28, 0.7, s > 0 ? 0xe8514a : 0xf2f0e6, { seg: 9, ao: 0 });
      b.cyl(x, DECK_Y - 0.66, pz + s * 0.2, 0.1, 0.1, 0.14, 0x3f3226, { seg: 6, ao: 0 });
    }
  }

  // ── bollards + rope at the ferry end ─────────────────────────────────────
  for (const pz of [Z0 + 1.3, Z1 - 1.3]) {
    b.cyl(29.5, DECK_Y, pz, 0.3, 0.36, 0.95, 0x4a4238, { seg: 9, mat: 'metal', ao: 0 });
    b.sph(29.5, DECK_Y + 1.0, pz, 0.34, 0.5, 0x4a4238, { seg: 9, rings: 6, mat: 'metal', sy: 0.6 });
    b.torus(29.5, DECK_Y + 0.55, pz, 0.42, 0.07, 0x6d5a3c, { rx: -Math.PI / 2, seg: 10, tseg: 4 });
  }
  b.tube([[29.5, DECK_Y + 0.6, Z0 + 1.3], [30.6, DECK_Y + 0.15, cz], [29.5, DECK_Y + 0.6, Z1 - 1.3]], 0.07, 0x6d5a3c, { rseg: 5 });

  // ── THE WELCOME ARCH ─────────────────────────────────────────────────────
  // AH is the height of the columns, so the header beam's UNDERSIDE sits at
  // DECK_Y + AH + 0.1. The art director's note: at 8.4 the banner spanned the
  // path at head height and became a full-screen wall on the pier→plaza walk —
  // the first thirty seconds of Cat Island. Raised so the underside clears 9 u.
  const AX = 38.2, AH = 8.4;
  const welcome = T.plaque(8.6, 1.7, [{ t: 'WELCOME TO CAT ISLAND', s: 0.66, c: '#fff6dd', outline: '#5c1f14' }], {
    bg: '#2a8f8a', bg2: 'rgba(255,255,255,.18)', border: '#f2c14e', border2: '#1d5c58', borderW: 0.06, grime: 0.05, dpu: 92,
  });
  const thanks = T.plaque(8.6, 1.7, [
    { t: 'THANK YOU FOR STAYING', s: 0.5, c: '#fff6dd', outline: '#5c1f14' },
    { t: 'and staying. and staying.', s: 0.3, c: '#ffd9a8', weight: 'bold italic' },
  ], { bg: '#1f6f6b', bg2: 'rgba(255,255,255,.14)', border: '#f2c14e', borderW: 0.06, grime: 0.06, dpu: 92 });

  for (const s of [-1, 1]) {
    const pz = cz + s * 4.3;
    b.box(AX, DECK_Y, pz, 1.5, 0.5, 1.5, PAL.stoneLight, { ao: 0 });
    b.cyl(AX, DECK_Y + 0.5, pz, 0.52, 0.62, AH - 1.1, 0xf3e7cf, { seg: 12, ao: 0.5, aoBase: DECK_Y });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; b.cyl(AX + Math.cos(a) * 0.56, DECK_Y + 0.5, pz + Math.sin(a) * 0.56, 0.07, 0.08, AH - 1.2, 0xdccfb4, { seg: 4, ao: 0 }); }
    b.cyl(AX, DECK_Y + AH - 0.6, pz, 0.78, 0.56, 0.3, 0xf3e7cf, { seg: 12, ao: 0 });
    b.box(AX, DECK_Y + AH - 0.3, pz, 1.7, 0.34, 1.7, 0xf3e7cf, { ao: 0 });
    // a cat sits on each capital, watching the water
    sittingCat(b, AX, DECK_Y + AH + 0.04, pz, 1.9, PAL.fur[s > 0 ? 0 : 4], { ry: -Math.PI / 2, inner: 0xe8a0a8, tailSide: s });
  }
  // header beam + double-sided signs
  b.box(AX, DECK_Y + AH + 0.1, cz, 1.9, 2.1, 10.0, 0x2a8f8a, { ao: 0 });
  b.box(AX, DECK_Y + AH + 2.2, cz, 2.3, 0.4, 10.6, 0xf2c14e, { ao: 0 });
  b.sign(welcome, AX - 0.99, DECK_Y + AH + 1.15, cz, 8.6, 1.7, { ry: -Math.PI / 2, glow: true });
  b.sign(thanks, AX + 0.99, DECK_Y + AH + 1.15, cz, 8.6, 1.7, { ry: Math.PI / 2, glow: true });
  // scalloped pediment with cat ears
  b.box(AX, DECK_Y + AH + 2.6, cz, 1.4, 0.9, 5.0, 0x1f6f6b, { ao: 0 });
  catEars(b, AX, DECK_Y + AH + 3.4, cz, 1.5, 2.2, 0x2a8f8a, { ry: Math.PI / 2, inner: 0xf2c14e, splay: 0.2 });
  // These two posts used to stand at (46.4, 16.7) — 1.2 m in front of the
  // POPULATION sign, with a gold finial squarely across the human count. Nothing
  // on this apron stands within 2.5 of a sign's face line any more.
  for (const s of [-1, 1]) {
    const px = 52.5, pz = cz + s * 7.0, py = T.ground(px, pz);
    b.cyl(px, py, pz, 0.16, 0.2, 5.6, PAL.wood, { seg: 7, ao: 0.5, aoBase: py });
    b.sph(px, py + 5.75, pz, 0.22, PAL.gold, { seg: 7, rings: 5 });
    bunting(b, AX, DECK_Y + AH + 2.2, cz + s * 4.8, px, py + 5.4, pz, ['#e8514a', '#f2c14e', '#2a8f8a', '#f6f2ea'], { n: 11, sag: 1.6 });
  }
  // ── the same gag, at eye level ────────────────────────────────────────────
  // The arch banner sits eleven metres up and the HUD title card lands on top of
  // it in the establishing shot, so the joke also gets a board you can read
  // standing on the deck, at the foot of the north column.
  const lowWelcome = T.plaque(3.6, 1.5, [
    { t: 'WELCOME TO CAT ISLAND', s: 0.3, c: '#fff6dd', outline: '#12403d' },
    { t: 'arrivals hall this way', s: 0.2, c: '#ffe3ae' },
    { t: 'there is no departures hall', s: 0.2, c: '#ffc0a8', weight: 'italic bold' },
  ], { bg: '#2a8f8a', border: '#f2c14e', border2: '#1d5c58', borderW: 0.05, dpu: 170 });
  {
    const lz2 = cz - 5.6, lf = frame(AX + 1.4, DECK_Y, lz2, -Math.PI / 2 + 0.25);
    for (const sx of [-1, 1]) b.cyl(lf.px(sx * 1.5, 0), DECK_Y, lf.pz(sx * 1.5, 0), 0.13, 0.16, 2.4, PAL.wood, { seg: 6, ao: 0.4, aoBase: DECK_Y });
    b.box(lf.x, DECK_Y + 1.5, lf.z, 3.9, 1.8, 0.22, 0x1f6f6b, { ry: lf.ry, ao: 0 });
    b.sign(lowWelcome, lf.px(0, 0.14), DECK_Y + 2.4, lf.pz(0, 0.14), 3.6, 1.5, { ry: lf.ry, glow: true });
    b.box(lf.x, DECK_Y + 3.34, lf.z, 4.3, 0.24, 0.7, PAL.roof[0], { ry: lf.ry, rx: -0.22, ao: 0 });
    catEars(b, lf.x, DECK_Y + 3.5, lf.z, 0.8, 0.9, 0x2a8f8a, { ry: lf.ry, inner: PAL.gold, seg: 7 });
    wash(b, lf.px(0, 0.5), DECK_Y + 2.4, lf.pz(0, 0.5), 4.4, 2.6, lf.ry);
    T.col(lf.x, lf.z, 1.3);
  }
  T.col(AX, cz - 4.3, 1.0); T.col(AX, cz + 4.3, 1.0);
  T.act('arch', AX + 1.4, cz, 'Read the arch', [
    'WELCOME TO CAT ISLAND. the arch is load-bearing. so is the welcome.',
    'a smaller plaque adds: "arrivals hall this way. there is no departures hall."',
    'someone has scratched "I ONLY CAME FOR THE WEEKEND" into the base. the letters are old.',
  ], { r: 4.2, speaker: 'THE ARCH' });

  // ── CUSTOMS BOOTH ────────────────────────────────────────────────────────
  const cb = frame(46.8, T.ground(46.8, 29.2), 29.2, 0.16);
  block(b, cb, 6.2, 3.9, 4.6, PAL.wall[0], { quoins: true, plinthColor: PAL.stone });
  tileRoof(b, cb, 6.2, 1.7, 4.6, PAL.roof[0], { top: 3.9, alongX: true, ribs: 11 });

  const arrivalsCell = T.plaque(2.2, 0.55, [{ t: 'ARRIVALS', s: 0.72, c: '#f7fff2' }], { bg: '#2f7d3c', border: '#17421f', borderW: 0.07, dpu: 150 });
  const depCell = T.plaque(2.2, 0.55, [{ t: 'DEPARTURES', s: 0.66, c: '#ffd8cf' }], { bg: '#8a2f22', border: '#3d1109', borderW: 0.07, grime: 0.2, dpu: 150 });
  // open arrivals window
  b.box(cb.px(-1.5, 2.28), cb.y + 1.3, cb.pz(-1.5, 2.28), 2.3, 1.7, 0.3, 0x1b1410, { ry: cb.ry, ao: 0 });
  b.box(cb.px(-1.5, 2.5), cb.y + 1.2, cb.pz(-1.5, 2.5), 2.8, 0.22, 0.75, PAL.stoneLight, { ry: cb.ry, ao: 0 });
  loafCat(b, cb.px(-2.3, 2.6), cb.y + 1.42, cb.pz(-2.3, 2.6), 1.15, PAL.fur[1], { ry: cb.ry + 1.4 });
  b.quad(cb.px(-1.5, 2.3), cb.y + 2.1, cb.pz(-1.5, 2.3), 2.2, 0.5, 0x8a7548, { ry: cb.ry, mat: 'win' });
  wash(b, cb.px(-1.5, 2.5), cb.y + 2.1, cb.pz(-1.5, 2.5), 3.4, 1.9, cb.ry);
  b.sign(arrivalsCell, cb.px(-1.5, 2.52), cb.y + 3.2, cb.pz(-1.5, 2.52), 2.2, 0.55, { ry: cb.ry, glow: true });
  // bricked-up departures window
  b.box(cb.px(1.7, 2.28), cb.y + 1.3, cb.pz(1.7, 2.28), 2.3, 1.7, 0.2, 0x54372a, { ry: cb.ry, ao: 0 });
  for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
    const off = (r % 2) * 0.22;
    b.box(cb.px(0.72 + off + c * 0.44, 2.42), cb.y + 0.56 + r * 0.28, cb.pz(0.72 + off + c * 0.44, 2.42), 0.4, 0.24, 0.2, [0xa8563c, 0x964c36, 0xb35f43][(r + c) % 3], { ry: cb.ry, ao: 0 });
  }
  b.box(cb.px(1.7, 2.5), cb.y + 1.2, cb.pz(1.7, 2.5), 2.8, 0.22, 0.75, PAL.stoneLight, { ry: cb.ry, ao: 0 });
  b.sign(depCell, cb.px(1.7, 2.52), cb.y + 3.2, cb.pz(1.7, 2.52), 2.2, 0.55, { ry: cb.ry });
  const cbE = frame(cb.px(3.1, 0), cb.y, cb.pz(3.1, 0), cb.ry + Math.PI / 2);
  doorUnit(b, cbE, 0, 0, { w: 1.9, h: 2.9, human: true, humanSide: -1, humanSignCell: T.humansLabel(), color: PAL.trim[1] });
  T.colBox(cb.x, cb.z, 6.4, 4.8, cb.ry);
  T.act('customs', cb.px(1.7, 4.2), cb.pz(1.7, 4.2), 'Departures window', [
    'the DEPARTURES window is bricked up. the mortar is still wet. it is always still wet.',
    'a laminated card reads: "for departures, please form an orderly queue." the queue is a painted line that loops back on itself.',
    'you knock. from behind the bricks, a cat says "closed."',
  ], { r: 3.4, speaker: 'DEPARTURES' });

  // departures board: every sailing cancelled, and it glows at night
  const depBoard = A.panel(4.6, 2.4, (g, W, H) => {
    g.fillStyle = '#141a16'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#3a4a3e'; g.lineWidth = W * 0.02; g.strokeRect(W * 0.01, H * 0.01, W * 0.98, H * 0.98);
    g.fillStyle = '#ffcb4a'; g.font = `bold ${H * 0.13}px ${FONTS.SANS}`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('DEPARTURES', W * 0.05, H * 0.04);
    const rows = [['08:10', 'MAINLAND', 'CANCELLED'], ['10:40', 'MAINLAND', 'CANCELLED'], ['13:15', 'ANYWHERE', 'CANCELLED'], ['16:50', 'MAINLAND', 'CANCELLED'], ['19:30', 'HOME', 'CANCELLED'], ['--:--', 'ARRIVALS ONLY', 'ON TIME']];
    rows.forEach((r, i) => {
      const y = H * (0.24 + i * 0.125);
      g.font = `bold ${H * 0.095}px ${FONTS.MONO}`;
      g.fillStyle = '#8fe0a8'; g.fillText(r[0], W * 0.05, y);
      g.fillStyle = '#d8e8dc'; g.fillText(r[1], W * 0.27, y);
      g.fillStyle = i === 5 ? '#8fe0a8' : '#ff6a5a'; g.textAlign = 'right'; g.fillText(r[2], W * 0.95, y); g.textAlign = 'left';
    });
  }, 110);
  const dbf = frame(43.4, T.ground(43.4, 24.6), 24.6, 0.5);
  for (const s of [-1, 1]) b.cyl(dbf.px(s * 2.0, -0.3), dbf.y, dbf.pz(s * 2.0, -0.3), 0.14, 0.16, 4.2, 0x4a4238, { seg: 7, mat: 'metal', ao: 0.4, aoBase: dbf.y });
  b.box(dbf.x, dbf.y + 2.5, dbf.z, 4.9, 2.7, 0.3, 0x2a3029, { ry: dbf.ry, ao: 0 });
  b.sign(depBoard, dbf.px(0, 0.18), dbf.y + 3.85, dbf.pz(0, 0.18), 4.6, 2.4, { ry: dbf.ry, glow: true });
  T.col(dbf.x, dbf.z, 1.1);
  T.act('depboard', dbf.px(0, 2.4), dbf.pz(0, 2.4), 'Departures board', [
    'every sailing is CANCELLED. the last line reads "ARRIVALS ONLY — ON TIME".',
    'the board updates itself. it has updated itself 4,118 times. the answer has not changed.',
    'a cat in a little hat taps the glass and says, kindly, "try again tomorrow."',
  ], { r: 3.2, speaker: 'BOARD' });

  // ── POPULATION SIGN (the human count has been repainted many times) ──────
  const popCell = A.panel(7.6, 3.4, (g, W, H) => {
    board(g, W, H, { bg: '#f6ecd2', bg2: 'rgba(255,255,255,.3)', border: '#2a8f8a', border2: '#c9b489', borderW: 0.028, grime: 0.05 });
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = '#1f6f6b'; g.font = `bold ${H * 0.17}px ${FONTS.SANS}`;
    g.fillText('POPULATION', W / 2, H * 0.08);
    g.fillStyle = '#2c2119'; g.font = `bold ${H * 0.25}px ${FONTS.SANS}`;
    g.fillText('412 cats', W / 2, H * 0.29);
    // ghosts of previous human counts, then paint patches, then the current 1
    const cy = H * 0.62;
    g.save();
    g.globalAlpha = 0.3; g.fillStyle = '#6b5a3e'; g.font = `bold ${H * 0.25}px ${FONTS.SANS}`;
    g.fillText('7 humans (you lot!)', W / 2 + W * 0.01, cy);
    g.globalAlpha = 0.22; g.fillText('3 humans (you three!)', W / 2 - W * 0.008, cy + H * 0.01);
    g.restore();
    for (let i = 0; i < 9; i++) {
      g.globalAlpha = 0.55 + (i % 3) * 0.14;
      g.fillStyle = ['#f2e6c8', '#efe2c0', '#f6ecd2', '#e9dcb8'][i % 4];
      const w = W * (0.1 + (i % 4) * 0.07), h = H * (0.1 + (i % 3) * 0.04);
      g.beginPath();
      g.ellipse(W * (0.3 + (i * 0.07) % 0.46), cy + H * (0.11 + ((i * 13) % 7) * 0.012), w, h, (i % 5) * 0.15, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#2c2119'; g.font = `bold ${H * 0.25}px ${FONTS.SANS}`;
    g.fillText('1 human (you!)', W / 2, cy);
    // a drip of fresh paint under the number
    g.globalAlpha = 0.5; g.fillStyle = '#efe2c0';
    g.fillRect(W * 0.36, cy + H * 0.2, W * 0.012, H * 0.1);
    g.globalAlpha = 1;
  }, 92);
  const pf = frame(47.6, T.ground(47.6, 16.6), 16.6, -0.38);
  for (const s of [-1, 1]) {
    b.cyl(pf.px(s * 3.3, -0.35), pf.y, pf.pz(s * 3.3, -0.35), 0.22, 0.26, 5.6, PAL.wood, { seg: 8, ao: 0.5, aoBase: pf.y });
    b.sph(pf.px(s * 3.3, -0.35), pf.y + 5.7, pf.pz(s * 3.3, -0.35), 0.26, PAL.gold, { seg: 8, rings: 5 });
  }
  b.box(pf.x, pf.y + 2.4, pf.z, 8.0, 3.7, 0.32, PAL.trim[0], { ry: pf.ry, ao: 0 });
  b.sign(popCell, pf.px(0, 0.22), pf.y + 4.25, pf.pz(0, 0.22), 7.6, 3.4, { ry: pf.ry });
  b.box(pf.x, pf.y + 6.28, pf.z, 8.5, 0.35, 0.7, PAL.roof[0], { ry: pf.ry, rx: -0.18, ao: 0 });
  catEars(b, pf.x, pf.y + 6.4, pf.z, 1.1, 1.1, PAL.trim[0], { ry: pf.ry, inner: PAL.gold, seg: 7 });
  T.col(pf.px(-3.3, -0.35), pf.pz(-3.3, -0.35), 0.5); T.col(pf.px(3.3, -0.35), pf.pz(3.3, -0.35), 0.5);
  T.act('population', pf.px(0, 2.6), pf.pz(0, 2.6), 'Population sign', [
    'POPULATION: 412 cats, 1 human (you!). the "1" is glossier than the rest of the sign.',
    'under the fresh paint you can just make out "7 humans". and under that, "3".',
    'a cat with a brush is already waiting. "just in case," she says. "i round down."',
  ], { r: 4.0, speaker: 'POPULATION SIGN' });

  // ── luggage that never left ──────────────────────────────────────────────
  const suitcases = [[44.2, 20.0, 1.3, 0.3], [44.0, 19.2, 1.1, -0.5], [48.6, 26.4, 1.2, 0.8], [43.2, 27.6, 1.0, 0.2]];
  for (const [sx, sz, s, r] of suitcases) {
    const gy = T.ground(sx, sz);
    for (let i = 0; i < 3; i++) {
      const w = s * (1.5 - i * 0.18);
      b.box(sx + i * 0.06, gy + i * 0.46, sz, w, 0.42, w * 0.62, [0x8a5a3a, 0x4f6b7a, 0x7a4a5c][i % 3], { ry: r + i * 0.1, ao: 0.5, aoBase: gy });
      b.box(sx + i * 0.06, gy + i * 0.46 + 0.16, sz, w + 0.04, 0.1, w * 0.64, 0x2f2820, { ry: r + i * 0.1, ao: 0 });
      b.torus(sx + i * 0.06, gy + i * 0.46 + 0.46, sz, 0.14, 0.04, 0x2f2820, { rx: 0, ry: r + i * 0.1, seg: 8, tseg: 4, mat: 'metal' });
    }
  }
  loafCat(b, 44.2, T.ground(44.2, 20.0) + 1.38, 20.0, 1.35, PAL.fur[4], { ry: 0.8 });
  crate(b, 49.4, T.ground(49.4, 18.4), 18.4, 1.2, 0.3);
  crate(b, 49.0, T.ground(49.0, 19.6), 19.6, 0.9, -0.5);
  barrel(b, 50.2, T.ground(50.2, 20.6), 20.6, 0.5, 1.1);
  T.col(49.3, 18.9, 1.2);

  lamppost(b, 41.0, DECK_Y, Z0 + 0.9, { h: 4.4 });
  lamppost(b, 41.0, DECK_Y, Z1 - 0.9, { h: 4.4 });
  lamppost(b, 50.6, T.ground(50.6, 24.2), 24.2, { h: 5.0 });

  // ferry timetable board on the apron: a single line
  const tt = T.plaque(1.9, 1.2, [
    { t: 'FERRY', s: 0.3, c: '#2c2119' },
    { t: 'ARR  ✓', s: 0.26, c: '#2f7d3c' },
    { t: 'DEP  —', s: 0.26, c: '#8a2f22' },
  ], { bg: '#f2e6c8', border: '#6b5a3e', borderW: 0.05, dpu: 130 });
  b.cyl(45.2, DECK_Y, 20.4, 0.1, 0.12, 1.9, 0x4a4238, { seg: 6, mat: 'metal', ao: 0 });
  b.box(45.2, DECK_Y + 1.9, 20.4, 2.1, 1.4, 0.16, 0xe8dcc0, { ry: 0.3, ao: 0 });
  b.sign(tt, 45.2 + 0.1 * Math.cos(0.3), DECK_Y + 2.6, 20.4 + 0.1, 1.9, 1.2, { ry: 0.3 });
}

// ─────────────────────────────────────────────────────────────────────────────
export function buildPlaza(T) {
  const b = T.b, A = T.A;
  const CX = 78, CZ = 18, GY = T.ground(CX, CZ);

  // ── paving ────────────────────────────────────────────────────────────────
  paving(b, CX, GY + 0.08, CZ, 13.4, { seg: 30, rings: 1, color: 0xc0ae90, border: 0x8e7e64, depth: 2.2 });
  for (let i = 0; i < 32; i++) {                      // radial flagstones
    const a = i / 32 * Math.PI * 2;
    // sunk flush with the paving top (GY+0.18); at GY+0.14 they stood 0.06
    // clear and cast card-shaped shadows all over the plaza.
    b.box(CX + Math.cos(a) * 10.6, GY + 0.10, CZ + Math.sin(a) * 10.6, 1.5, 0.1, 2.0, i % 2 ? 0xd2c3a8 : 0xc2b195, { ry: -a, ao: 0 });
  }

  // ── FOUNTAIN OF THE CAT POURING MILK ─────────────────────────────────────
  const FY = GY + 0.1, FR = 4.3;
  b.cyl(CX, FY - 0.1, CZ, 4.9, 5.0, 0.5, 0xb9a887, { seg: 8, ao: 0 });               // step
  b.cyl(CX, FY + 0.36, CZ, 4.15, 4.15, 0.2, 0x7d7059, { seg: 16, ao: 0 });            // basin floor
  const seg = 8, half = FR * Math.tan(Math.PI / seg) + 0.06;
  for (let i = 0; i < seg; i++) {                                                     // octagon wall
    const a = i / seg * Math.PI * 2 + Math.PI / seg;
    const wx = CX + Math.cos(a) * FR, wz = CZ + Math.sin(a) * FR, ry = Math.PI / 2 - a;
    b.box(wx, FY + 0.2, wz, half * 2, 1.35, 0.5, 0xdcc9a4, { ry, ao: 0.4, aoBase: FY });
    b.box(wx, FY + 1.55, wz, half * 2 + 0.3, 0.26, 0.8, 0xede0c0, { ry, ao: 0 });      // coping
    b.sph(CX + Math.cos(a - Math.PI / seg) * FR * 1.06, FY + 1.9, CZ + Math.sin(a - Math.PI / seg) * FR * 1.06, 0.2, 0xf2e9d2, { seg: 7, rings: 5 });
  }
  // ── THE WATER ─────────────────────────────────────────────────────────────
  // The critic read this fountain as "bone dry": the milk was a flat matte disc
  // half a metre below the rim and the only moving thing was a thin trickle.
  // Now: a glossy surface right up under the coping, four arcing jets off the
  // pedestal, a ring of spill droplets and rippling rings under the pour.
  const MILK = 0xfdfaf0;
  // A matte body of milk with a GLOSSY skin on top of it, filled right up under
  // the coping. The old surface sat half a metre down on a single glass disc and
  // read as a dry stone basin with a trickle in it.
  b.cyl(CX, FY + 0.58, CZ, 4.08, 4.08, 0.74, 0xf7f1e2, { seg: 18, ao: 0 });
  b.cyl(CX, FY + 1.32, CZ, 4.1, 4.1, 0.06, MILK, { seg: 18, ao: 0, mat: 'win' });
  b.torus(CX, FY + 1.36, CZ, 4.03, 0.1, 0xf6eeda, { rx: -Math.PI / 2, seg: 22, tseg: 4 });
  // standing ripple rings across the whole surface (animated below)
  const surfRings = T.part((p) => {
    for (let i = 0; i < 4; i++) p.torus(0, 0, 0, 1.1 + i * 0.92, 0.05, 0xf8f2e0, { seg: 22, tseg: 4, rx: -Math.PI / 2 });
  }, 'milksurface');
  surfRings.position.set(CX, FY + 1.39, CZ);
  T.anim((t) => {
    const k = 1 + Math.sin(t * 1.15) * 0.035;
    surfRings.scale.set(k, 1, k);
    surfRings.rotation.y = -t * 0.09;
  });
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.45;
    const cs = Math.cos(a), sn = Math.sin(a);
    b.cyl(CX + cs * 1.62, FY + 1.62, CZ + sn * 1.62, 0.075, 0.1, 0.36, PAL.gold, { seg: 6, mat: 'metal', rz: -0.9, ry: Math.atan2(cs, sn), ao: 0 });
    const pts = [];
    for (let k = 0; k <= 7; k++) {
      const t = k / 7, rr = 1.75 + t * 1.9;
      pts.push([CX + cs * rr, FY + 1.9 + Math.sin(t * 1.6) * 0.86 - t * t * 1.5, CZ + sn * rr]);
    }
    b.tube(pts, 0.1, MILK, { rseg: 6, seg: 18 });
    // where each jet lands
    b.torus(CX + cs * 3.65, FY + 1.39, CZ + sn * 3.65, 0.4, 0.06, 0xf6eeda, { rx: -Math.PI / 2, seg: 12, tseg: 3 });
    b.torus(CX + cs * 3.65, FY + 1.39, CZ + sn * 3.65, 0.7, 0.045, 0xf8f2e0, { rx: -Math.PI / 2, seg: 12, tseg: 3 });
    for (let k = 0; k < 4; k++) b.sph(CX + cs * (3.5 + k * 0.13), FY + 1.46 + (k % 2) * 0.14, CZ + sn * (3.5 + k * 0.13), 0.1, MILK, { seg: 5, rings: 3 });
  }
  b.cyl(CX, FY + 0.5, CZ, 1.5, 1.9, 1.4, 0xc9b894, { seg: 10, ao: 0 });               // pedestal
  b.cyl(CX, FY + 1.9, CZ, 1.7, 1.5, 0.24, 0xf0e6cd, { seg: 10, ao: 0 });

  const SY = FY + 2.14;
  sittingCat(b, CX, SY, CZ, 3.7, 0xd9c49a, { ry: 0.7, inner: 0xc08e92, eye: 0x5a4a34, muzzle: 0xe6d4ae, nose: 0xa87c80, tailSide: -1, seg: 12, rings: 8 });
  // The head has to read as a CAT from 48 units: sittingCat's proportional ears
  // and muzzle are too small at this scale, so the statue gets carved ones.
  {
    const hy = SY + 0.845 * 3.7, fwd = 0.7;
    const HX = (l, c2) => CX + l * Math.cos(fwd) + c2 * Math.sin(fwd);
    const HZ = (l, c2) => CZ - l * Math.sin(fwd) + c2 * Math.cos(fwd);
    catEars(b, HX(0, 0.1), hy + 0.42, HZ(0, 0.1), 0.58, 1.5, 0xd9c49a, { inner: 0xc08e92, ry: fwd, seg: 9, splay: 0.2 });
    b.sph(HX(0, 0.66), hy - 0.12, HZ(0, 0.66), 0.42, 0xe6d4ae, { seg: 10, rings: 6, sx: 1.35, sy: 0.78 });   // muzzle
    b.cone(HX(0, 0.94), hy + 0.02, HZ(0, 0.94), 0.16, 0.24, 0xa87c80, { seg: 6, rx: Math.PI / 2, ry: fwd }); // nose
    for (const s of [-1, 1]) {
      b.sph(HX(s * 0.3, 0.6), hy + 0.2, HZ(s * 0.3, 0.6), 0.2, 0xf4ecd8, { seg: 8, rings: 5, sz: 0.5 });     // eye white
      b.sph(HX(s * 0.3, 0.68), hy + 0.2, HZ(s * 0.3, 0.68), 0.12, 0x4a3c28, { seg: 7, rings: 5, sz: 0.5 });  // pupil
      for (let k = 0; k < 3; k++) b.cyl(HX(s * 0.46, 0.62), hy - 0.2 + k * 0.12, HZ(s * 0.46, 0.62), 0.05, 0.05, 0.85, 0xe6d4ae, { seg: 4, center: true, ry: fwd + s * (1.05 + k * 0.14), rz: Math.PI / 2, ao: 0 });
    }
  }
  // raised paw + a jug tipped forever
  const jx = CX + Math.sin(0.7) * 1.45, jz = CZ + Math.cos(0.7) * 1.45;
  b.cyl(CX + Math.sin(0.7) * 0.55, SY + 1.9, CZ + Math.cos(0.7) * 0.55, 0.2, 0.24, 1.3, 0xd9c49a, { seg: 8, rz: -0.55, ry: 0.7, ao: 0 });
  b.cyl(jx, SY + 2.75, jz, 0.5, 0.42, 0.95, 0xf6f2ea, { seg: 10, rz: -1.35, ry: 0.7, ao: 0 });
  b.torus(jx - Math.sin(0.7) * 0.4, SY + 3.15, jz - Math.cos(0.7) * 0.4, 0.28, 0.07, 0xf6f2ea, { ry: 0.7, seg: 10, tseg: 4 });
  // the stream (animated) and the rings it makes where it lands
  const spoutY = SY + 2.6, dropH = spoutY - (FY + 1.36);
  const stream = T.part((p) => {
    p.cyl(0, -dropH, 0, 0.13, 0.24, dropH, MILK, { seg: 9, ao: 0 });
    for (let i = 0; i < 5; i++) p.sph(0.08 * (i % 2 ? 1 : -1), -0.5 - i * 0.62, 0, 0.15, MILK, { seg: 7, rings: 5 });
    p.sph(0, -dropH, 0, 0.7, MILK, { seg: 11, rings: 5, sy: 0.2 });
    for (let i = 0; i < 6; i++) {                       // the crown of splash
      const a = i / 6 * Math.PI * 2;
      p.sph(Math.cos(a) * 0.62, -dropH + 0.16 + (i % 2) * 0.12, Math.sin(a) * 0.62, 0.11, MILK, { seg: 5, rings: 4 });
    }
  }, 'milk');
  const spx = jx + Math.sin(0.7) * 0.55, spz = jz + Math.cos(0.7) * 0.55;
  stream.position.set(spx, spoutY, spz);
  T.anim((t) => { stream.scale.set(1 + Math.sin(t * 5.1) * 0.07, 1, 1 + Math.cos(t * 4.4) * 0.07); });
  const ripples = T.part((p) => {
    for (let i = 0; i < 3; i++) p.torus(0, 0, 0, 0.75 + i * 0.6, 0.045, 0xf6eeda, { seg: 20, tseg: 4, rx: -Math.PI / 2 });
  }, 'ripples');
  ripples.position.set(spx, FY + 1.42, spz);
  T.anim((t) => {
    const s = 1 + Math.sin(t * 1.9) * 0.09;
    ripples.scale.set(s, 1, s);
    ripples.rotation.y = t * 0.15;
  });
  T.col(CX, CZ, 5.1);
  T.act('fountain', CX + 6.0, CZ + 3.2, 'The Milk Fountain', [
    'a stone cat pours milk forever. the plaque says "GENEROSITY (ONGOING)".',
    'the basin is milk. real milk. someone changes it twice a day. you have not seen who.',
    'coins in the bottom are all foreign. all of them from the mainland. hundreds.',
  ], { r: 6.2, speaker: 'FOUNTAIN' });
  // The plaque belongs on the OUTSIDE of the basin wall. It used to sit at
  // radius 1.7, buried in the pedestal — which read as a pole through a sign.
  const fplaque = T.plaque(2.4, 0.8, [{ t: 'GENEROSITY', s: 0.44, c: '#f6eed8' }, { t: '(ongoing)', s: 0.3, c: '#e0cfa8', weight: 'italic bold' }], { bg: '#8a6a3a', border: '#4a3520', border2: '#c9a06a', borderW: 0.06, dpu: 150 });
  for (const i of [0, 3]) {                           // one facing the plaza, one facing the pier
    const a = i / seg * Math.PI * 2 + Math.PI / seg;
    const wx = CX + Math.cos(a) * (FR + 0.28), wz = CZ + Math.sin(a) * (FR + 0.28);
    b.sign(fplaque, wx, FY + 0.85, wz, 2.4, 0.8, { ry: Math.PI / 2 - a });
  }

  // ── flower beds ──────────────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const fx = CX + Math.cos(a) * 8.4, fz = CZ + Math.sin(a) * 8.4;
    b.cyl(fx, GY + 0.1, fz, 2.3, 2.4, 0.62, 0xcdbda2, { seg: 8, ao: 0 });
    b.torus(fx, GY + 0.7, fz, 2.3, 0.14, 0xb0a084, { rx: -Math.PI / 2, seg: 12, tseg: 4 });
    b.cyl(fx, GY + 0.6, fz, 2.1, 2.1, 0.22, 0x5a4632, { seg: 10, ao: 0 });
    for (let k = 0; k < 11; k++) {
      const aa = k / 11 * Math.PI * 2 + i, rr = 0.5 + (k % 3) * 0.55;
      b.sph(fx + Math.cos(aa) * rr, GY + 0.95, fz + Math.sin(aa) * rr, 0.34, k % 2 ? PAL.leaf : PAL.leafLight, { seg: 7, rings: 5, sy: 0.7, flat: true });
      b.sph(fx + Math.cos(aa) * rr, GY + 1.24, fz + Math.sin(aa) * rr, 0.17, PAL.flower[(k + i) % PAL.flower.length], { seg: 6, rings: 4 });
    }
    T.col(fx, fz, 2.5);
  }

  // ── benches + lamps ──────────────────────────────────────────────────────
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.35;
    bench(b, CX + Math.cos(a) * 6.6, GY + 0.14, CZ + Math.sin(a) * 6.6, -a + Math.PI / 2, { len: 2.8 });
  }
  const plazaPosts = [];
  // irregular angles and radii, both lamp patterns
  const plazaRing = [[0.80, 11.6, 'lantern', 5.4], [2.15, 12.5, 'globe', 4.9], [3.70, 11.1, 'lantern', 5.1], [5.25, 12.2, 'globe', 5.2]];
  for (const [a, rr, st, hh] of plazaRing) {
    const px2 = CX + Math.cos(a) * rr, pz2 = CZ + Math.sin(a) * rr;
    lamppost(b, px2, GY + 0.12, pz2, { style: st, h: hh, arms: 2, ry: -a, pool: 4.2, poolY: GY + 0.2, halo: 1.7 });
    // the bunting ties on ABOVE the finial, not through the lantern: at +0.3 the
    // cord ran straight through both lamp heads and out the other side
    plazaPosts.push([px2, GY + 0.12 + hh + (st === 'globe' ? 1.15 : 1.75), pz2]);
  }
  planter(b, CX - 11.6, GY + 0.12, CZ + 4.2, 1.2, { seed: 1, pot: 2, plant: 1 });
  planter(b, CX - 10.2, GY + 0.12, CZ + 5.9, 0.9, { seed: 4, pot: 0, plant: 3 });
  planter(b, CX + 11.4, GY + 0.12, CZ - 4.6, 1.2, { seed: 3, pot: 1, plant: 0 });
  // ── the outer ring used to be bare paving: topiary cats, a flower kerb and
  //    bunting strung post to post, so the roundabout reads as a WELCOME ─────
  for (let i = 0; i < 2; i++) {
    const a = i / 2 * Math.PI * 2 + 0.8 + Math.PI / 4;
    const tx2 = CX + Math.cos(a) * 11.2, tz2 = CZ + Math.sin(a) * 11.2;
    const ty2 = T.ground(tx2, tz2) + 0.12;
    b.cyl(tx2, ty2, tz2, 1.25, 1.35, 0.85, 0xc8703f, { seg: 10, ao: 0.5, aoBase: ty2 });
    b.torus(tx2, ty2 + 0.83, tz2, 1.25, 0.12, 0xdd8a5a, { rx: -Math.PI / 2, seg: 12, tseg: 5 });
    sittingCat(b, tx2, ty2 + 0.88, tz2, 2.5, 0x3f7a35, { ry: -a + Math.PI, flat: true, seg: 8, rings: 6, inner: 0x4f8f40, eyes: false, nose: 0x4f8f40, muzzle: 0x4f8f40 });
    T.col(tx2, tz2, 1.4);
  }
  // a low flower kerb between the flagstone ring and the benches
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * Math.PI * 2 + 0.2, rr = 9.5;
    const fx2 = CX + Math.cos(a) * rr, fz2 = CZ + Math.sin(a) * rr;
    b.box(fx2, GY + 0.14, fz2, 1.5, 0.36, 0.6, i % 2 ? 0xcdbda2 : 0xbcab90, { ry: -a, ao: 0 });
    b.sph(fx2, GY + 0.54, fz2, 0.42, i % 3 ? PAL.leafLight : PAL.leaf, { seg: 6, rings: 4, sy: 0.6, flat: true });
    b.sph(fx2, GY + 0.8, fz2, 0.19, PAL.flower[i % PAL.flower.length], { seg: 6, rings: 3 });
  }
  for (let i = 0; i < 4; i++) {
    const a2 = plazaPosts[i], b2 = plazaPosts[(i + 1) % 4];
    // sag 1.5: at 2.0 the lowest flag hung at head height over the kerb
    bunting(b, a2[0], a2[1], a2[2], b2[0], b2[1], b2[2], [0xe8514a, 0xf2c14e, 0x2a8f8a, 0xf6f2ea, 0x3a6ea5], { n: 11, sag: 1.5 });
  }

  // ── TOURIST INFO KIOSK ───────────────────────────────────────────────────
  const kf = frame(86.4, T.ground(86.4, 12.6), 12.6, -0.62);
  b.cyl(kf.x, kf.y - 0.4, kf.z, 2.5, 2.6, 0.55, PAL.stone, { seg: 6, ao: 0 });
  b.cyl(kf.x, kf.y + 0.1, kf.z, 2.2, 2.2, 3.3, PAL.wall[3], { seg: 6, ry: kf.ry, ao: 0.6, aoBase: kf.y });
  b.cyl(kf.x, kf.y + 3.3, kf.z, 2.9, 2.9, 0.3, PAL.stoneLight, { seg: 6, ry: kf.ry, ao: 0 });
  b.cone(kf.x, kf.y + 3.55, kf.z, 3.0, 2.0, PAL.roof[0], { seg: 6, ry: kf.ry, ao: 0 });
  b.sph(kf.x, kf.y + 5.75, kf.z, 0.3, PAL.gold, { seg: 8, rings: 6 });
  catEars(b, kf.x, kf.y + 5.3, kf.z, 0.85, 0.95, PAL.roof[3], { ry: kf.ry, inner: PAL.gold, seg: 6 });
  // counter window
  b.box(kf.px(0, 2.05), kf.y + 1.25, kf.pz(0, 2.05), 2.1, 1.5, 0.3, 0x1b1410, { ry: kf.ry, ao: 0 });
  b.quad(kf.px(0, 2.16), kf.y + 2.0, kf.pz(0, 2.16), 2.0, 0.5, 0x8a7548, { ry: kf.ry, mat: 'win' });
  wash(b, kf.px(0, 2.34), kf.y + 2.0, kf.pz(0, 2.34), 3.2, 1.9, kf.ry);
  pool(b, kf.px(0, 3.4), kf.y + 0.2, kf.pz(0, 3.4), 2.6);
  b.box(kf.px(0, 2.3), kf.y + 1.15, kf.pz(0, 2.3), 2.6, 0.2, 0.7, PAL.stoneLight, { ry: kf.ry, ao: 0 });
  const infoCell = T.plaque(2.3, 0.62, [{ t: 'INFORMATION', s: 0.66, c: '#fff4dc' }], { bg: '#2a8f8a', border: '#f2c14e', borderW: 0.07, dpu: 150 });
  b.sign(infoCell, kf.px(0, 2.28), kf.y + 2.95, kf.pz(0, 2.28), 2.3, 0.62, { ry: kf.ry, glow: true });
  const todoCell = T.plaque(2.2, 1.5, [
    { t: 'THINGS TO DO', s: 0.26, c: '#2c2119' },
    { t: 'stay', s: 0.42, c: '#1f6f6b' },
  ], { bg: '#f6ecd2', border: '#8a7a58', border2: '#c9b489', borderW: 0.035, dpu: 130 });
  const fL = at(kf, Math.PI / 3, 1.96), fR = at(kf, -Math.PI / 3, 1.96);
  b.sign(todoCell, fL.x + Math.sin(fL.ry) * 0.12, kf.y + 1.9, fL.z + Math.cos(fL.ry) * 0.12, 2.2, 1.5, { ry: fL.ry });
  // leaflet rack, every leaflet the same
  b.box(fR.x, kf.y + 0.1, fR.z, 1.1, 1.8, 0.3, PAL.wood, { ry: fR.ry, ao: 0.4, aoBase: kf.y });
  for (let i = 0; i < 3; i++) b.box(fR.x + Math.sin(fR.ry) * 0.2, kf.y + 0.5 + i * 0.52, fR.z + Math.cos(fR.ry) * 0.2, 0.85, 0.36, 0.14, 0xf2e6c8, { ry: fR.ry, rx: -0.25, ao: 0 });
  T.col(kf.x, kf.z, 2.7);
  T.act('kiosk', kf.px(0, 3.6), kf.pz(0, 3.6), 'Tourist information', [
    'THINGS TO DO: stay. that is the whole list. it is laminated.',
    'the leaflet is titled "48 HOURS IN CAT ISLAND" and every page says "day 1: settle in".',
    'the cat behind the counter asks how long you are staying. she writes down your answer and laughs warmly.',
  ], { r: 3.4, speaker: 'INFORMATION' });

  // ── YOU ARE HERE (FOREVER) MAP BOARD ─────────────────────────────────────
  const mapCell = A.panel(5.0, 3.4, (g, W, H) => {
    g.fillStyle = '#e8dcb8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#9fcfe0'; g.fillRect(0, 0, W, H);                      // sea
    // two islands
    const isl = (cx, cy, rx, ry2, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy, rx, ry2, 0, 0, Math.PI * 2); g.fill(); };
    isl(W * 0.26, H * 0.52, W * 0.19, H * 0.3, '#f0c8dc');
    isl(W * 0.72, H * 0.52, W * 0.21, H * 0.32, '#a8ce72');
    g.strokeStyle = '#7a6a4a'; g.setLineDash([W * 0.02, W * 0.015]); g.lineWidth = W * 0.008;
    g.beginPath(); g.moveTo(W * 0.42, H * 0.5); g.lineTo(W * 0.54, H * 0.5); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#5a4a32'; g.font = `bold ${H * 0.075}px ${FONTS.SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('CANDYLAND', W * 0.26, H * 0.86);
    g.fillText('CAT ISLAND', W * 0.72, H * 0.86);
    // a big red dot with rings
    for (let i = 3; i >= 1; i--) { g.globalAlpha = 0.2; g.fillStyle = '#e01f2d'; g.beginPath(); g.arc(W * 0.63, H * 0.47, W * 0.02 * i * 1.6, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1; g.fillStyle = '#e01f2d'; g.beginPath(); g.arc(W * 0.63, H * 0.47, W * 0.022, 0, Math.PI * 2); g.fill();
    // banner
    g.fillStyle = 'rgba(28,22,16,.82)'; g.fillRect(0, H * 0.03, W, H * 0.2);
    g.fillStyle = '#ffe9a8'; g.font = `bold ${H * 0.13}px ${FONTS.SANS}`;
    g.fillText('YOU ARE HERE (FOREVER)', W / 2, H * 0.132);
    g.strokeStyle = '#2c2119'; g.lineWidth = W * 0.014; g.strokeRect(W * 0.007, H * 0.01, W * 0.986, H * 0.98);
  }, 108);
  const mf = frame(70.6, T.ground(70.6, 24.4), 24.4, 0.55);
  for (const s of [-1, 1]) b.cyl(mf.px(s * 2.2, -0.32), mf.y, mf.pz(s * 2.2, -0.32), 0.2, 0.24, 5.2, PAL.wood, { seg: 8, ao: 0.5, aoBase: mf.y });
  b.box(mf.x, mf.y + 2.4, mf.z, 5.4, 3.8, 0.3, PAL.trim[1], { ry: mf.ry, ao: 0 });
  b.sign(mapCell, mf.px(0, 0.19), mf.y + 4.1, mf.pz(0, 0.19), 5.0, 3.4, { ry: mf.ry });
  b.box(mf.x, mf.y + 6.3, mf.z, 5.9, 0.3, 0.8, PAL.roof[0], { ry: mf.ry, rx: -0.2, ao: 0 });
  T.col(mf.px(-2.2, -0.32), mf.pz(-2.2, -0.32), 0.5); T.col(mf.px(2.2, -0.32), mf.pz(2.2, -0.32), 0.5);
  T.act('mapboard', mf.px(0, 2.4), mf.pz(0, 2.4), 'Town map', [
    'YOU ARE HERE (FOREVER). the dot is the size of a grapefruit and slightly warm.',
    'the mainland is drawn as a dotted line with a question mark. someone has erased the question mark.',
    'a smaller label near the pier reads "ferry (one way)". it has been laminated three times.',
  ], { r: 3.6, speaker: 'MAP' });

  // ── flagpole with a cat flag (animated) ──────────────────────────────────
  // The flagpole used to stand at (CX-2, CZ-12.6) — directly behind the milk
  // fountain on the plaza camera's sightline, so its pole and flag appeared to
  // skewer the statue's torso. Moved hard off-axis, beside the kiosk walk.
  const fpX = CX + 10.5, fpZ = CZ - 10.5, fpY = T.ground(fpX, fpZ);
  b.cyl(fpX, fpY, fpZ, 0.18, 0.24, 8.2, 0xe8dcc4, { seg: 8, ao: 0.5, aoBase: fpY });
  b.sph(fpX, fpY + 8.4, fpZ, 0.26, PAL.gold, { seg: 8, rings: 6 });
  const flag = T.part((p) => {
    for (let i = 0; i < 5; i++) p.box(0.28 + i * 0.46, -0.72, 0, 0.46, 1.44, 0.08, i % 2 ? 0x2a8f8a : 0x1f6f6b, { ao: 0 });
    p.sph(1.25, 0, 0.06, 0.34, 0xf6f2ea, { seg: 9, rings: 6, sz: 0.35 });
    for (const sx of [-1, 1]) p.cone(1.25 + sx * 0.24, 0.22, 0.06, 0.14, 0.26, 0xf6f2ea, { seg: 5, rz: -sx * 0.3, ao: 0 });
    p.cone(1.25, -0.06, 0.12, 0.06, 0.1, PAL.gold, { seg: 4, rx: Math.PI / 2, ao: 0 });
  }, 'flag');
  flag.position.set(fpX, fpY + 7.0, fpZ + 0.1);
  const waveFlag = ripple(flag, (a, base, i, t) => {
    const u = Math.max(0, base[i]);
    a[i + 2] = base[i + 2] + Math.sin(u * 2.1 - t * 4.0) * 0.2 * u * 0.4;
    a[i + 1] = base[i + 1] + Math.sin(u * 1.6 - t * 3.0) * 0.09 * u * 0.4;
  });
  T.anim((t) => waveFlag(t));
}
