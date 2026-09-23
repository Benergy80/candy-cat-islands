// ─────────────────────────────────────────────────────────────────────────────
// PURRLIAMENT SQUARE (152,6 · r22)
// Where the island keeps its dignity: a domed parliament with ears, a bronze
// cat holding a very small human, a clocktower with paw hands, and a noticeboard
// of everyone who has tried to leave.
// ─────────────────────────────────────────────────────────────────────────────
import { PAL, frame, at, windowUnit, doorUnit, block, tileRoof, flatRoof, lamppost, bench, planter, sittingCat, loafCat, catEars, bunting, paving, column, hedge, pool, wash, halo, humanFigure } from './parts.js';
import { drawLines, board, catFace, humanFace, FONTS } from './signs.js';
import { purrliamentInterior } from './interiors.js';

export function buildSquare(T) {
  const b = T.b, A = T.A;
  const CX = 152, CZ = 6, GY = T.ground(CX, CZ);

  // ── cobbled plaza with a giant pawprint mosaic ────────────────────────────
  paving(b, CX, GY + 0.1, CZ, 18.5, { seg: 34, rings: 0, color: 0xc2b092, border: 0x93836a, depth: 2.6 });
  for (let r = 1; r <= 4; r++) {
    const rr = 3.6 + r * 3.6, n = 8 + r * 6;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + r * 0.2;
      // sunk to GY+0.13 (paving top is GY+0.2) and toned toward the paving:
      // at GY+0.16 they floated 0.04 clear and cast card-shaped shadows.
      b.box(CX + Math.cos(a) * rr, GY + 0.13, CZ + Math.sin(a) * rr, 1.5, 0.09, 0.95, (i + r) % 3 ? 0xc8b696 : 0xb9a78c, { ry: -a, ao: 0 });
    }
  }
  // The mosaic paw, 13 units across. Painted as ONE flat atlas quad rather than
  // squashed spheres: the spheres read as a detached blob SHADOW next to the
  // monument, and a painted inlay with a pale grout outline reads as mosaic.
  const pawMosaic = A.panel(13, 13, (g, W, H) => {
    g.fillStyle = '#c2b092'; g.fillRect(0, 0, W, H);
    // cobble grout so the inlay sits in the same masonry as the rest of the square
    g.strokeStyle = 'rgba(147,131,106,.55)'; g.lineWidth = W * 0.006;
    for (let i = 1; i < 13; i++) { g.beginPath(); g.moveTo(0, H * i / 13); g.lineTo(W, H * i / 13); g.stroke(); }
    for (let i = 1; i < 13; i++) { g.beginPath(); g.moveTo(W * i / 13 + (i % 2 ? W * 0.02 : 0), 0); g.lineTo(W * i / 13, H); g.stroke(); }
    const blob = (cx, cy, rx, ry2, rot) => {
      g.save(); g.translate(cx, cy); g.rotate(rot);
      g.beginPath(); g.ellipse(0, 0, rx, ry2, 0, 0, Math.PI * 2);
      g.fillStyle = '#8d7a5c'; g.fill();
      g.lineWidth = W * 0.014; g.strokeStyle = '#efe6d2'; g.stroke();
      g.beginPath(); g.ellipse(0, 0, rx * 0.62, ry2 * 0.62, 0, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(239,230,210,.55)'; g.lineWidth = W * 0.008; g.stroke();
      g.restore();
    };
    blob(W * 0.5, H * 0.64, W * 0.235, H * 0.2, 0);
    for (let k = 0; k < 4; k++) {
      const a = -0.62 + k * 0.41;
      blob(W * 0.5 + Math.sin(a) * W * 0.3, H * 0.64 - Math.cos(a) * H * 0.31, W * 0.085, H * 0.1, a);
    }
  }, 30);
  b.signFlat(pawMosaic, CX, GY + 0.19, CZ + 1.4, 13, 13, {});

  // ── THE PURRLIAMENT — ENTERABLE (the chamber is in architecture/interiors) ─
  const sb = T.shell('purrliament');
  const pf = frame(CX, T.ground(CX, CZ - 17), CZ - 17, 0);
  const PW = 27, PD = 13, PH = 10.5, PT = 0.6, PCEIL = 7.2;
  const pY = T.padY(pf.x, pf.z, PW - PT * 2, PD - PT * 2, 0) + 0.16;
  const pSegs = block(sb, pf, PW, PH, PD, 0xf2e9d4, {
    quoins: true, plinthColor: 0xd8cbb0, bandColor: 0xfaf3e2, sink: 1.2,
    hollow: { t: PT, gaps: [{ face: 0, lx: 0, w: 3.7, h: 5.1 }], ceil: PCEIL, ceilColor: 0xe6d9bd, floorColor: 0xbfae91, floorInto: T.b, floorTop: pY },
  });
  // copper-green roof deck with standing seams: a 27 x 13 m slab of pale cream
  // read from the northern sea as a grey blockout lid on a grey blockout mass
  flatRoof(sb, pf, PW, PD, 0x3f8a7e, { top: PH, parapet: 0.85, capColor: 0xd8cbb0 });
  for (let i = 0; i < 10; i++) sb.box(pf.px(-11.7 + i * 2.6, 0), pf.y + PH + 0.14, pf.pz(-11.7 + i * 2.6, 0), 0.2, 0.14, PD - 0.5, 0x2f6f66, { ao: 0 });
  for (const s of [-1, 1]) sb.box(pf.px(0, s * (PD / 2 - 0.9)), pf.y + PH + 0.14, pf.pz(0, s * (PD / 2 - 0.9)), PW - 0.6, 0.16, 0.34, 0x57a094, { ao: 0 });
  // steps
  for (let i = 0; i < 4; i++) b.box(pf.px(0, PD / 2 + 2.6 - i * 0.55), pf.y - 0.1 - i * 0.42, pf.pz(0, PD / 2 + 2.6 - i * 0.55), PW * 0.62 + i * 1.2, 0.5, 1.3 + i * 0.2, 0xd8cbb0, { ao: 0 });
  // portico
  for (let i = 0; i < 8; i++) column(sb, pf.px(-9.1 + i * 2.6, PD / 2 + 1.8), pf.y, pf.pz(-9.1 + i * 2.6, PD / 2 + 1.8), 0.55, 8.6, 0xfaf3e2, { seg: 12 });
  sb.box(pf.px(0, PD / 2 + 1.8), pf.y + 8.6, pf.pz(0, PD / 2 + 1.8), 21.4, 1.0, 2.6, 0xfaf3e2, { ao: 0 });
  sb.roof(pf.px(0, PD / 2 + 1.8), pf.y + 9.6, pf.pz(0, PD / 2 + 1.8), 3.0, 2.0, 21.4, 0xfaf3e2, { ry: Math.PI / 2, ao: 0 });
  const ped = A.panel(14.0, 1.9, (g, W, H) => {
    g.fillStyle = '#efe3c8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#6a5638'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${H * 0.5}px ${FONTS.SERIF}`;
    try { g.letterSpacing = W * 0.012 + 'px'; } catch (e) {}
    g.fillText('PURRLIAMENT', W / 2, H * 0.42);
    g.font = `italic bold ${H * 0.22}px ${FONTS.SERIF}`;
    try { g.letterSpacing = '0px'; } catch (e) {}
    g.fillStyle = '#8a7450'; g.fillText('nine lives · one term · no departures', W / 2, H * 0.8);
  }, 68);
  sb.sign(ped, pf.px(0, PD / 2 + 3.15), pf.y + 10.5, pf.pz(0, PD / 2 + 3.15), 14.0, 1.9, {});
  doorUnit(sb, pf, 0, PD / 2 + 0.2, { w: 3.4, h: 5.0, color: 0x6a4a24, surround: 0xfaf3e2, humanSide: -1, humanSignCell: T.humansLabel(), mat: false, leaf: false, recess: false });
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
    windowUnit(sb, pf, s * (5.6 + i * 4.2), PD / 2, 3.0, 2.0, 3.4, { trim: 0x3a5a4a, shutters: false, cushion: i === 0 });
  }
  // ── NORTH ELEVATION ───────────────────────────────────────────────────────
  // This wall is the island's skyline from the sea, and it used to be 27 metres
  // of unbroken plaster: the whole building read as one pale blockout mass from
  // anywhere north of Cat Island. Same vocabulary as the front — lit windows,
  // pilasters, string courses in the town's teal — plus a night wash.
  const bkf = frame(pf.x, pf.y, pf.z, Math.PI);
  for (let i = 0; i < 7; i++) {
    const lx = -10.8 + i * 3.6;
    sb.box(bkf.px(lx, PD / 2 + 0.12), pf.y, bkf.pz(lx, PD / 2 + 0.12), 1.15, PH - 0.5, 0.44, 0xfaf3e2, { ry: bkf.ry, ao: 0.5, aoBase: pf.y });
    sb.box(bkf.px(lx, PD / 2 + 0.22), pf.y + PH - 0.9, bkf.pz(lx, PD / 2 + 0.22), 1.5, 0.42, 0.62, 0xd8cbb0, { ry: bkf.ry, ao: 0 });
    sb.box(bkf.px(lx, PD / 2 + 0.22), pf.y + 0.1, bkf.pz(lx, PD / 2 + 0.22), 1.45, 0.5, 0.6, 0xd8cbb0, { ry: bkf.ry, ao: 0 });
  }
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
    const lx = s * (5.4 + i * 3.6);
    windowUnit(sb, bkf, lx, PD / 2, 3.2, 1.9, 3.2, { trim: 0x3a5a4a, shutters: false, cushion: i === 0, cushionColor: 0xb03a63 });
    wash(b, bkf.px(lx, PD / 2 + 0.5), pf.y + 4.8, bkf.pz(lx, PD / 2 + 0.5), 4.6, 6.0, bkf.ry);
  }
  for (const yy of [2.5, PH - 1.9]) sb.box(bkf.px(0, PD / 2 + 0.2), pf.y + yy, bkf.pz(0, PD / 2 + 0.2), PW + 0.2, 0.36, 0.42, 0x2a8f8a, { ry: bkf.ry, ao: 0 });
  // a small back door, and the bins of a working parliament
  sb.box(bkf.px(0, PD / 2 + 0.16), pf.y, bkf.pz(0, PD / 2 + 0.16), 2.3, 3.3, 0.4, 0xd8cbb0, { ry: bkf.ry, ao: 0.5, aoBase: pf.y });
  sb.box(bkf.px(0, PD / 2 + 0.3), pf.y, bkf.pz(0, PD / 2 + 0.3), 1.7, 2.9, 0.16, 0x6a4a24, { ry: bkf.ry, ao: 0.4, aoBase: pf.y });
  sb.box(bkf.px(0, PD / 2 + 0.34), pf.y + 0.08, bkf.pz(0, PD / 2 + 0.34), 0.9, 0.8, 0.1, 0x2a2119, { ry: bkf.ry, ao: 0 });
  for (let i = 0; i < 3; i++) {
    const p2 = bkf.px(3.4 + i * 1.25, PD / 2 + 0.9), q2 = bkf.pz(3.4 + i * 1.25, PD / 2 + 0.9);
    b.cyl(p2, T.ground(p2, q2), q2, 0.5, 0.55, 1.25, [0x3a5a4a, 0x6a5238, 0x3a5a4a][i], { seg: 9, ry: bkf.ry, ao: 0.5, aoBase: pf.y });
    b.cyl(p2, T.ground(p2, q2) + 1.25, q2, 0.56, 0.52, 0.12, 0x2a2119, { seg: 9, ao: 0 });
  }
  pool(b, bkf.px(0, PD / 2 + 2.6), pf.y + 0.2, bkf.pz(0, PD / 2 + 2.6), 4.0);

  // ── the domes, which have ears ────────────────────────────────────────────
  const domeY = pf.y + PH + 1.1;
  sb.cyl(pf.x, domeY, pf.z, 4.6, 5.2, 2.2, 0xf2e9d4, { seg: 16, ao: 0 });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; sb.cyl(pf.x + Math.cos(a) * 5.25, domeY, pf.z + Math.sin(a) * 5.25, 0.16, 0.18, 2.2, 0xd8cbb0, { seg: 5, ao: 0 }); }
  sb.sph(pf.x, domeY + 2.2, pf.z, 4.5, 0x2a8f8a, { seg: 20, rings: 10, phiLength: Math.PI / 2, sy: 1.15 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; sb.cyl(pf.x + Math.cos(a) * 4.3, domeY + 2.2, pf.z + Math.sin(a) * 4.3, 0.05, 0.14, 5.0, 0x1f6f6b, { seg: 4, rz: Math.cos(a) * 0.45, rx: -Math.sin(a) * 0.45, ao: 0 }); }
  catEars(sb, pf.x, domeY + 6.2, pf.z, 2.45, 3.6, 0x2a8f8a, { inner: PAL.gold, seg: 10, splay: 0.22 });
  sb.cyl(pf.x, domeY + 6.0, pf.z, 0.9, 1.3, 1.0, PAL.gold, { seg: 12, mat: 'metal' });
  // small flanking ear-domes
  for (const s of [-1, 1]) {
    sb.cyl(pf.px(s * 10.4, 0), pf.y + PH + 0.9, pf.pz(s * 10.4, 0), 2.1, 2.4, 1.2, 0xf2e9d4, { seg: 12, ao: 0 });
    sb.sph(pf.px(s * 10.4, 0), pf.y + PH + 2.1, pf.pz(s * 10.4, 0), 2.1, 0x1f6f6b, { seg: 14, rings: 8, phiLength: Math.PI / 2, sy: 1.1 });
    catEars(sb, pf.px(s * 10.4, 0), pf.y + PH + 3.9, pf.pz(s * 10.4, 0), 1.15, 1.8, 0x1f6f6b, { inner: PAL.gold, seg: 8 });
  }
  // flags
  for (const s of [-1, 1]) {
    sb.cyl(pf.px(s * 12.4, PD / 2 + 1.2), pf.y + PH, pf.pz(s * 12.4, PD / 2 + 1.2), 0.11, 0.13, 4.4, 0xf6f2ea, { seg: 6, rx: -0.35, ao: 0 });
    sb.box(pf.px(s * 12.4 + 1.0, PD / 2 + 2.6), pf.y + PH + 3.2, pf.pz(s * 12.4 + 1.0, PD / 2 + 2.6), 2.0, 1.3, 0.07, s > 0 ? 0x2a8f8a : PAL.gold, { ry: 0.1, ao: 0 });
  }
  T.solidify(pSegs, pf.y + PH);
  T.claimRing(pf.x, pf.z, PW + 1, PD + 5, 0);
  T.stoop(pf, 0, PD / 2, 4.4, pY);
  const chamber = T.room({ id: 'purrliament', x: pf.x, z: pf.z, w: PW - PT * 2, d: PD - PT * 2, rot: 0, y: pf.y, floorY: pY, h: PCEIL, label: 'The Purrliament' });
  T.door({
    id: 'purrliament', room: chamber, y: pf.y, ry: 0, w: 3.7, h: 5.0, color: 0x6a4a24,
    x: pf.px(0, PD / 2 + 0.4), z: pf.pz(0, PD / 2 + 0.4), swing: -1.7,
    say: 'the chamber doors are never locked. "the house sits," says a cat, "more or less permanently."', speaker: 'PURRLIAMENT',
  });
  T.roomDetail('purrliament', () => purrliamentInterior(T, frame(pf.x, pY, pf.z, 0), { hw: (PW - PT * 2) / 2, hd: (PD - PT * 2) / 2 }));
  T.light(pf.x, pf.y + 5.0, pf.z + PD / 2 + 4.0, 0xffc27a, 1.0, 34);
  // lit portico: the columns stand in a warm pool, the pediment is washed
  pool(b, pf.x, pf.y + 0.2, pf.pz(0, PD / 2 + 4.4), 13.0);
  wash(b, pf.px(0, PD / 2 + 3.3), pf.y + 10.5, pf.pz(0, PD / 2 + 3.3), 16.0, 4.0, pf.ry);
  for (let i = 0; i < 8; i++) halo(b, pf.px(-9.1 + i * 2.6, PD / 2 + 1.8), pf.y + 8.2, pf.pz(-9.1 + i * 2.6, PD / 2 + 1.8), 0.9);
  T.act('purrliament', pf.px(0, PD / 2 + 6.2), pf.pz(0, PD / 2 + 6.2), 'The Purrliament', [
    'PURRLIAMENT. nine lives, one term, no departures.',
    'today’s order paper, pinned by the door: "1. the guest question. 2. lunch. 3. the guest question."',
    'through the door you hear a vote being taken. it passes unanimously. everyone yawns.',
  ], { r: 5.4, speaker: 'PURRLIAMENT' });

  // ── THE MONUMENT: a heroic cat holding a tiny human ───────────────────────
  const MX = CX, MZ = CZ + 6.8, MY = GY + 0.12;
  b.cyl(MX, MY, MZ, 4.0, 4.4, 0.5, 0xb9a887, { seg: 12, ao: 0 });
  b.box(MX, MY + 0.5, MZ, 5.4, 0.5, 5.4, 0xd8cbb0, { ry: 0.2, ao: 0 });
  b.box(MX, MY + 1.0, MZ, 4.4, 3.1, 4.4, 0xe6d9bd, { ry: 0.2, ao: 0.4, aoBase: MY });
  b.box(MX, MY + 4.1, MZ, 5.2, 0.45, 5.2, 0xd8cbb0, { ry: 0.2, ao: 0 });
  // ── the plaque, big enough to read from the flagstones ────────────────────
  const guests = T.plaque(4.6, 1.8, [
    { t: 'OUR BELOVED GUESTS', s: 0.36, c: '#fff2d8', family: FONTS.SERIF, outline: 'rgba(40,24,8,.55)' },
    { t: 'held close since 1847', s: 0.24, c: '#ffdf9e', weight: 'italic bold' },
  ], { bg: '#6e4c26', border: '#3a2712', border2: '#c29a58', borderW: 0.05, dpu: 150 });
  const mry = 0.2;
  // mounted on a shallow bronze tablet with a reading ledge under it
  b.box(MX + Math.sin(mry) * 2.26, MY + 1.55, MZ + Math.cos(mry) * 2.26, 5.0, 2.2, 0.22, 0x7a5a30, { ry: mry, ao: 0, mat: 'metal' });
  b.sign(guests, MX + Math.sin(mry) * 2.4, MY + 2.62, MZ + Math.cos(mry) * 2.4, 4.6, 1.8, { ry: mry, glow: true });
  b.box(MX + Math.sin(mry) * 2.5, MY + 1.4, MZ + Math.cos(mry) * 2.5, 5.2, 0.18, 0.5, 0xd8cbb0, { ry: mry, rx: -0.25, ao: 0 });
  wash(b, MX + Math.sin(mry) * 2.7, MY + 2.6, MZ + Math.cos(mry) * 2.7, 5.6, 3.2, mry);

  // ── the cat: bronze, 8.6 tall, with a CARVED face ─────────────────────────
  // At this scale sittingCat's proportional eye is a 0.3 m dark notch and the
  // head reads as a blank bronze ball; `carve` gives it sclera, pupils, a brow,
  // a proper muzzle and whiskers, all in lighter alloy so they catch the sun.
  sittingCat(b, MX, MY + 4.55, MZ, 8.6, 0xba8544, {
    ry: mry + 0.25, mat: 'metal', carve: true, inner: 0x8f6530,
    sclera: 0xf4e8ce, pupil: 0x30220e, socket: 0xa8763a, whiskers: false,
    muzzle: 0xd2a05e, nose: 0x8f6530, tailSide: -1, seg: 12, rings: 8,
  });

  // ── the raised paw, swung out to the cat's own left so the figure standing
  //    in it has CLEAR SKY behind it from the square ─────────────────────────
  // NB: Kit yaw turns a rz-tilted cylinder's tip to (cos ry, -sin ry) in the
  // ground plane, NOT to (sin ry, cos ry) — the old arm pointed ninety degrees
  // away from the hand it was supposed to be holding up, so the human floated.
  const ARM = -1.05;                                    // world bearing of the reach
  const uX = Math.sin(ARM), uZ = Math.cos(ARM);          // out along the forearm
  const vX = uZ, vZ = -uX;                               // across it, for the toes
  const armRy = Math.atan2(-uZ, uX);
  const TILT = 1.0, LEN = 4.0, ax = Math.sin(TILT), ay = Math.cos(TILT);
  const shx = MX + uX * 1.55, shz = MZ + uZ * 1.55;
  const hxp = shx + uX * LEN * ax, hzp = shz + uZ * LEN * ax, hy = MY + 7.3 + LEN * ay;
  b.cyl(shx, MY + 7.3, shz, 0.42, 0.56, LEN, 0xba8544, { seg: 9, rz: -TILT, ry: armRy, mat: 'metal', ao: 0 });
  b.sph(shx, MY + 7.5, shz, 0.74, 0xba8544, { seg: 9, rings: 6, mat: 'metal' });            // shoulder
  b.sph(hxp, hy, hzp, 0.98, 0xba8544, { seg: 11, rings: 7, mat: 'metal', sy: 0.58 });       // the pad
  for (let i = 0; i < 3; i++) b.sph(hxp + uX * 0.82 + (i - 1) * vX * 0.48, hy + 0.16, hzp + uZ * 0.82 + (i - 1) * vZ * 0.48, 0.3, 0xba8544, { seg: 8, rings: 5, mat: 'metal' });
  b.sph(hxp - uX * 0.8, hy + 0.1, hzp - uZ * 0.8, 0.35, 0xba8544, { seg: 8, rings: 5, mat: 'metal' });   // dew claw

  // ── THE HUMAN ─────────────────────────────────────────────────────────────
  // Painted pale limestone, not alloy: a bronze figure on a bronze paw is a
  // bump. Head, hat, coat, belt, two raised arms, two legs, and a scarf — the
  // whole joke of this island is that this is what they think waving is.
  humanFigure(b, hxp, hy + 0.42, hzp, 3.0, {
    ry: 0.78, skin: 0xf3ddc6, coat: 0xf2ece0, trousers: 0x9ea2a8, trim: 0x8d7a58,
    hat: 0xc0453a, scarfColor: 0x2f8f8a,
  });
  // …and it is lit: two bronze uplighters in the cap of the plinth, aimed at him
  for (const s2 of [-1, 1]) {
    const ux2 = MX + uX * 2.1 + s2 * vX * 1.5, uz2 = MZ + uZ * 2.1 + s2 * vZ * 1.5;
    b.cyl(ux2, MY + 4.34, uz2, 0.22, 0.28, 0.36, 0x8a6a3a, { seg: 8, mat: 'metal', ao: 0 });
    b.sph(ux2, MY + 4.62, uz2, 0.17, PAL.amberPale, { seg: 7, rings: 5, mat: 'glow' });
    halo(b, ux2, MY + 4.68, uz2, 0.9);
  }
  halo(b, hxp, hy + 1.9, hzp, 3.0);
  wash(b, hxp, hy + 1.7, hzp, 3.4, 4.0, 0.78);
  loafCat(b, MX + 2.45, MY + 1.0, MZ + 2.45, 1.6, PAL.fur[0], { ry: 0.9 });
  T.col(MX, MZ, 4.3);
  T.act('monument', MX + 5.6, MZ + 2.4, 'The Monument', [
    'OUR BELOVED GUESTS. the bronze cat holds a bronze human the size of a loaf of bread.',
    'the human’s arms are raised. the plaque says this is waving.',
    'held close since 1847. nobody will tell you what happened in 1846.',
  ], { r: 5.4, speaker: 'MONUMENT' });

  // ── THE CLOCKTOWER with paw hands ─────────────────────────────────────────
  const tx = CX + 16.5, tz = CZ - 6.5, ty = T.ground(tx, tz);
  const TH = 17.5;
  b.box(tx, ty - 1.0, tz, 6.0, 1.6, 6.0, 0xd8cbb0, { ao: 0 });
  b.box(tx, ty, tz, 5.0, TH, 5.0, 0xf2e9d4, { ao: 0.8, aoBase: ty, aoH: 3.0 });
  for (let i = 0; i < 5; i++) b.box(tx, ty + 1.2 + i * 3.3, tz, 5.3, 0.3, 5.3, 0xd8cbb0, { ao: 0 });
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    b.box(tx + sx * 2.3, ty + 4.0, tz + sz * 2.3, sx ? 0.5 : 1.4, 2.4, sz ? 0.5 : 1.4, 0x3a5a4a, { ao: 0 });
    b.cyl(tx + sx * 2.3, ty + 6.4, tz + sz * 2.3, 0.7, 0.7, 0.5, 0x3a5a4a, { seg: 10, rx: sz ? Math.PI / 2 : 0, rz: sx ? Math.PI / 2 : 0, theta: Math.PI, ao: 0 });
  }
  // belfry
  b.box(tx, ty + TH, tz, 6.0, 0.4, 6.0, 0xd8cbb0, { ao: 0 });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.cyl(tx + sx * 2.3, ty + TH + 0.4, tz + sz * 2.3, 0.3, 0.34, 3.2, 0xf2e9d4, { seg: 8, ao: 0 });
  b.box(tx, ty + TH + 3.6, tz, 6.2, 0.5, 6.2, 0xd8cbb0, { ao: 0 });
  b.cone(tx, ty + TH + 4.1, tz, 4.4, 4.2, 0x2a8f8a, { seg: 4, ry: Math.PI / 4, ao: 0 });
  b.cyl(tx, ty + TH + 8.3, tz, 0.12, 0.16, 1.6, PAL.gold, { seg: 6, mat: 'metal', ao: 0 });
  sittingCat(b, tx, ty + TH + 9.6, tz, 1.7, PAL.gold, { ry: 0.8, mat: 'metal', inner: 0xd8a43a, eyes: false, seg: 8, rings: 6 });
  // clock faces on the two camera-facing sides + hands
  // Drawn BOLD and near-white: a 3.9 m dial sits ~120 px across at the game
  // camera, so every stroke has to survive a 4x minification. Thin rings and
  // 24 hairline ticks came back as a grey scribble.
  const clockCell = A.panel(3.9, 3.9, (g, W, H) => {
    const c = W / 2, R = W * 0.47;
    g.fillStyle = '#0f2a22'; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();       // bezel
    g.fillStyle = '#fdf8ec'; g.beginPath(); g.arc(c, c, R * 0.88, 0, Math.PI * 2); g.fill(); // dial
    g.strokeStyle = '#2f4f40'; g.lineWidth = W * 0.028;
    g.beginPath(); g.arc(c, c, R * 0.80, 0, Math.PI * 2); g.stroke();                        // chapter ring
    // twelve chunky ticks; the quarters are blocks, not lines
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 - Math.PI / 2, q = i % 3 === 0;
      g.save(); g.translate(c + Math.cos(a) * R * 0.72, c + Math.sin(a) * R * 0.72); g.rotate(a);
      g.fillStyle = '#1b120a';
      g.fillRect(-R * (q ? 0.15 : 0.09), -R * (q ? 0.055 : 0.028), R * (q ? 0.3 : 0.18), R * (q ? 0.11 : 0.056));
      g.restore();
    }
    g.fillStyle = '#1b120a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${W * 0.155}px ${FONTS.SERIF}`;
    for (const [t, dx, dy] of [['XII', 0, -0.50], ['III', 0.50, 0], ['VI', 0, 0.50], ['IX', -0.50, 0]]) {
      g.fillText(t, c + dx * R, c + dy * R);
    }
    catFace(g, c, c + R * 0.42, R * 0.15, '#c9b894', { eye: '#4a3a26', nose: '#8a6a44' });
    g.fillStyle = '#3c2c18'; g.font = `bold ${W * 0.058}px ${FONTS.SERIF}`;
    g.fillText('NAP O’CLOCK', c, c - R * 0.34);
    g.fillStyle = '#1b120a'; g.beginPath(); g.arc(c, c, R * 0.055, 0, Math.PI * 2); g.fill();  // the boss
  }, 180);
  const hands = [];
  for (const [sx, sz, ry] of [[0, 1, 0], [1, 0, Math.PI / 2]]) {
    const fx = tx + sx * 2.56, fz = tz + sz * 2.56;
    b.cyl(fx, ty + 11.6, fz, 2.15, 2.15, 0.22, 0xf2e9d4, { seg: 16, rx: sz ? Math.PI / 2 : 0, rz: sx ? Math.PI / 2 : 0, ao: 0 });
    b.sign(clockCell, fx + sx * 0.14, ty + 11.6, fz + sz * 0.14, 3.9, 3.9, { ry, glow: true });
    const hand = T.part((p) => {
      // hour hand (a PAW) + minute hand (a tail) — both fat enough to read at 46u
      p.box(0, -0.16, 0.06, 0.4, 1.18, 0.14, 0x140d07, { ao: 0 });
      p.sph(0, 1.2, 0.06, 0.52, 0x140d07, { seg: 9, rings: 6, sz: 0.3, sy: 0.9 });
      for (let k = 0; k < 3; k++) p.sph((k - 1) * 0.4, 1.62, 0.06, 0.225, 0x140d07, { seg: 7, rings: 4, sz: 0.3 });
    }, 'clockhand' + ry);
    hand.position.set(fx + sx * 0.24, ty + 11.6, fz + sz * 0.24);
    hand.rotation.y = ry;
    const min = T.part((p) => { p.box(0, -0.18, 0.04, 0.26, 1.96, 0.12, 0x241a10, { ao: 0 }); p.cone(0, 1.78, 0.04, 0.22, 0.46, 0x241a10, { seg: 6, ao: 0 }); }, 'clockmin' + ry);
    min.position.set(fx + sx * 0.32, ty + 11.6, fz + sz * 0.32);
    min.rotation.y = ry;
    hands.push([hand, min]);
  }
  T.anim((t, dt, dl, c) => {
    const hr = c.state.time;
    for (const [h2, m2] of hands) {
      h2.rotation.z = -(hr % 12) / 12 * Math.PI * 2;
      m2.rotation.z = -(hr % 1) * Math.PI * 2;
    }
  });
  T.colBox(tx, tz, 6.4, 6.4, 0);
  T.act('clocktower', tx - 1.0, tz + 4.6, 'The Clocktower', [
    'the hands are a paw and a tail. it keeps perfect time and nobody has ever needed it.',
    'at four it chimes. the chime is a recording of a cat saying "stay".',
    'a small brass plate: "TIME REMAINING: plenty."',
  ], { r: 4.6, speaker: 'CLOCKTOWER' });

  // ── WANTED POSTERS: humans who tried to leave ─────────────────────────────
  const wx = CX - 15.0, wz = CZ + 6.0, wy = T.ground(wx, wz) + 0.12;
  const wry = 0.85;
  const wf = frame(wx, wy, wz, wry);
  for (const s of [-1, 1]) b.cyl(wf.px(s * 3.0, -0.35), wy, wf.pz(s * 3.0, -0.35), 0.2, 0.24, 4.2, PAL.wood, { seg: 8, ao: 0.5, aoBase: wy });
  b.box(wf.x, wy + 1.2, wf.z, 6.8, 3.6, 0.3, 0x6a4a2a, { ry: wry, ao: 0 });
  b.box(wf.x, wy + 1.1, wf.z, 7.2, 0.24, 0.5, 0x8a6438, { ry: wry, ao: 0 });
  b.box(wf.x, wy + 4.8, wf.z, 7.4, 0.35, 1.3, PAL.roof[0], { ry: wry, rx: -0.24, ao: 0 });
  const wantedTitle = T.plaque(6.4, 0.6, [{ t: 'TRIED TO LEAVE', s: 0.68, c: '#ffe6c8', spacing: 3 }], { bg: '#7a2f22', border: '#f2c14e', borderW: 0.06, dpu: 140 });
  b.sign(wantedTitle, wf.px(0, 0.17), wy + 4.42, wf.pz(0, 0.17), 6.4, 0.6, { ry: wry });
  const names = [['GREG', 'ROWED. TIRED.'], ['ANNIKA', 'SWAM 40m'], ['P. HOLLOWAY', 'BUILT A RAFT'], ['M. DUBOIS', 'HID IN A CRATE'], ['SAM', 'ASKED POLITELY'], ['YOU', 'PENDING']];
  names.forEach((nm, i) => {
    const cell = A.panel(1.7, 2.2, (g, W, H) => {
      g.fillStyle = '#efe0bd'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#6a5238'; g.lineWidth = W * 0.035; g.strokeRect(W * 0.03, H * 0.03, W * 0.94, H * 0.94);
      g.fillStyle = '#7a2f22'; g.font = `bold ${H * 0.12}px ${FONTS.SANS}`; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText('WANTED', W / 2, H * 0.06);
      g.fillStyle = '#d8c8a4'; g.fillRect(W * 0.17, H * 0.21, W * 0.66, H * 0.46);
      if (i === 5) {
        g.fillStyle = '#b8a880'; g.font = `bold ${H * 0.3}px ${FONTS.SANS}`; g.textBaseline = 'middle';
        g.fillText('?', W / 2, H * 0.44);
      } else humanFace(g, W / 2, H * 0.44, H * 0.18, { skin: ['#e9b98a', '#c98f5f', '#f0cba4', '#a9713f', '#e2a877'][i % 5], hair: ['#4a3323', '#2a2018', '#8a6a3a', '#5a3a2a', '#c8a060'][i % 5] });
      g.textBaseline = 'top'; g.fillStyle = '#2c2119'; g.font = `bold ${H * 0.1}px ${FONTS.SANS}`;
      g.fillText(nm[0], W / 2, H * 0.7);
      g.fillStyle = '#7a6a50'; g.font = `bold ${H * 0.07}px ${FONTS.SANS}`;
      g.fillText(nm[1], W / 2, H * 0.83);
      g.font = `italic bold ${H * 0.06}px ${FONTS.SANS}`; g.fillStyle = '#9a2f22';
      g.fillText(i === 5 ? 'we are watching' : 'returned safely', W / 2, H * 0.9);
    }, 120);
    const col = i % 3, row = Math.floor(i / 3);
    b.sign(cell, wf.px(-2.1 + col * 2.1, 0.18), wy + 3.55 - row * 2.4, wf.pz(-2.1 + col * 2.1, 0.18), 1.7, 2.2, { ry: wry, rz: (i % 2 ? 1 : -1) * 0.035 });
  });
  T.col(wf.px(-3.0, -0.35), wf.pz(-3.0, -0.35), 0.5); T.col(wf.px(3.0, -0.35), wf.pz(3.0, -0.35), 0.5);
  T.act('wanted', wf.px(0, 2.6), wf.pz(0, 2.6), 'Noticeboard', [
    'TRIED TO LEAVE. six posters. five say "returned safely". the sixth is blank and says "PENDING".',
    'GREG rowed. ANNIKA swam forty metres. P. HOLLOWAY built a raft out of a bed.',
    'the last poster has your build. it is not finished yet. somebody has left the pencil.',
  ], { r: 4.2, speaker: 'NOTICEBOARD' });

  // ── square furniture ──────────────────────────────────────────────────────
  // Nine stations round the square at IRREGULAR angles and radii, mixing the two
  // lamp patterns with the benches. An eight-fold ring of identical twin-head
  // posts reads as a fence, not as a public square.
  // (The ring is pulled back wherever it would otherwise run straight THROUGH
  // the Purrliament — invisible while the chamber was solid, but now that you
  // can walk in, a lamppost was standing between the benches.)
  const posts = [];
  const ring = [
    { a: 0.40, r: 15.5, kind: 'lantern', h: 6.2 },
    { a: 1.05, r: 14.2, kind: 'bench' },
    { a: 1.62, r: 15.9, kind: 'globe', h: 5.2 },
    { a: 2.30, r: 14.6, kind: 'bench' },
    { a: 3.05, r: 15.2, kind: 'lantern', h: 5.8 },
    { a: 3.78, r: 16.2, kind: 'bench' },
    { a: 4.42, r: 14.8, kind: 'globe', h: 5.4 },
    { a: 5.10, r: 15.6, kind: 'bench' },
    { a: 5.72, r: 14.4, kind: 'lantern', h: 6.0 },
  ];
  for (const st of ring) {
    const a = st.a;
    let rr = st.r;
    const inHouse = (r2) => Math.abs(CX + Math.cos(a) * r2 - pf.x) < PW / 2 + 1.4 && (CZ + Math.sin(a) * r2) < pf.z + PD / 2 + 1.6;
    while (rr > 8 && inHouse(rr)) rr -= 0.5;
    const lx = CX + Math.cos(a) * rr, lz = CZ + Math.sin(a) * rr;
    if (st.kind === 'bench') { bench(b, lx, GY + 0.14, lz, -a + Math.PI / 2, { len: 3.0 }); continue; }
    lamppost(b, lx, GY + 0.12, lz, { style: st.kind, h: st.h, arms: 2, ry: -a, pool: 4.6, poolY: GY + 0.21, halo: 1.8 });
    posts.push([lx, lz]);
  }
  // the island's 6th PointLight, hung on a real twin-head post on the monument
  // side of the square (the 5th lights the Purrliament portico, above).
  T.light(posts[0][0], GY + 6.4, posts[0][1], 0xffc27a, 1.0, 32);
  for (const s of [-1, 1]) {
    hedge(b, pf.px(s * 12.0, PD / 2 + 4.8), pf.y, pf.pz(s * 12.0, PD / 2 + 4.8), 3.2, 2.2, 1.5, { ry: 0 });
    sittingCat(b, pf.px(s * 12.0, PD / 2 + 4.8), pf.y + 1.5, pf.pz(s * 12.0, PD / 2 + 4.8), 2.6, 0x3f7a35, { ry: -s * 0.5, flat: true, seg: 8, rings: 6, inner: 0x4f8f40, eyes: false, nose: 0x4f8f40, muzzle: 0x4f8f40 });
  }
  // two CLUSTERS, three pot patterns, three things growing — not two identical
  // drums placed symmetrically about the axis
  const squarePots = [
    [CX - 8.6, CZ + 11.4, 1.35, 0, 0], [CX - 6.6, CZ + 12.8, 1.0, 2, 1], [CX - 9.9, CZ + 13.2, 0.85, 1, 3],
    [CX + 9.2, CZ + 12.6, 1.3, 1, 1], [CX + 7.2, CZ + 11.2, 0.95, 0, 3],
    [CX + 13.0, CZ - 2.2, 1.15, 2, 2], [CX + 14.2, CZ - 0.2, 0.85, 0, 0],
  ];
  squarePots.forEach(([px, pz, rr, pot, plant], i) => {
    planter(b, px, GY + 0.12, pz, rr, { pot, plant, seed: i * 2 + 1, flowers: 5 });
  });
  T.act('square', CX - 3.0, CZ + 10.0, 'Purrliament Square', [
    'the cobbles are laid as one enormous pawprint. you are standing in the middle toe.',
    'a brass line runs across the square marked "0 km FROM HOME". it is the only distance sign on the island.',
    'pigeons here are enormous and very relaxed. the cats ignore them. everyone has an understanding.',
  ], { r: 5.0, speaker: 'THE SQUARE' });
}
