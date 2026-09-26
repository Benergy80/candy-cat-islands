// ─────────────────────────────────────────────────────────────────────────────
// MAIN STREET (118,0 · r30) and MEOW DONALD'S (128,-24)
// A curved terraced high street: awnings, hanging bracket signs, string lights,
// and one fast-food restaurant with ears.
// ─────────────────────────────────────────────────────────────────────────────
import { PAL, frame, at, windowUnit, doorUnit, block, roomShell, tileRoof, flatRoof, awning, fascia, shopWindow, lamppost, bench, planter, crate, barrel, sittingCat, loafCat, catEars, bunting, paving, ribbon, column, hedge, pool, wash, halo, cornice, balcony, billboard, hangingPlate } from './parts.js';
import { drawLines, board, catFace, humanFace, FONTS } from './signs.js';
import { ripple, catRail, tubeStyle, arcPts } from './kit.js';
import { purrbucksInterior, travelInterior, meowInterior } from './interiors.js';

// street centreline (x is monotonic so we can query by x)
const CL = [[96, 8.2], [104, 5.0], [112, 2.0], [120, 0.4], [128, 0.8], [136, 2.4], [146, 4.6]];
export function streetZ(x) {
  for (let i = 0; i < CL.length - 1; i++) {
    if (x <= CL[i + 1][0] || i === CL.length - 2) {
      const t = (x - CL[i][0]) / (CL[i + 1][0] - CL[i][0]);
      return CL[i][1] + (CL[i + 1][1] - CL[i][1]) * t;
    }
  }
  return CL[0][1];
}
const slopeAt = (x) => (streetZ(x + 0.5) - streetZ(x - 0.5)) / 1.0;

/** Frame for a shop on `side` (-1 = north/far side, +1 = south/near side). */
function lot(T, x, side, off = 9.6) {
  const s = slopeAt(x), len = Math.hypot(1, s);
  const nx = s / len, nz = -1 / len;          // unit normal pointing north (-Z)
  const cx = x + nx * off * side * -1, cz = streetZ(x) + nz * off * side * -1;
  // facade looks back toward the street
  const fx = -nx * side * -1, fz = -nz * side * -1;
  const ry = Math.atan2(fx, fz);
  return frame(cx, T.ground(cx, cz), cz, ry);
}

// ── shop factory ─────────────────────────────────────────────────────────────
// `o.into` diverts the whole shell into a fadeable Part (see T.shell) and
// `o.enter` hollows it out: the block becomes four walls with a hole where the
// door is, the shopfront becomes a facade slab with the same hole, and the
// caller gets the wall segments back so it can make them solid.
function shop(T, f, o) {
  const b = o.into || T.b, { ry } = f;
  const w = o.w, d = o.d ?? 7.5, h = o.h ?? 9.8;
  const segs = block(b, f, w, h, d, o.wall, { quoins: o.quoins, plinthColor: PAL.stone, bandColor: o.band ?? PAL.stoneLight, hollow: o.enter });
  // ── the roof ───────────────────────────────────────────────────────────────
  // PITCH IS 0.35 rad (20°), not the 28-30° this street used to be built at, and
  // the ridge sits one storey lower than the eye expects. At the game camera a
  // steep roof plane is 50-65% of a building's screen height and the shopfront —
  // the part that is authored, signed and lit — is a stripe at the bottom.
  const pitch = o.pitch ?? 0.35;
  const roofH = o.parapet ? 0 : Math.tan(pitch) * (((o.gableFront ? w : d) + 1.1) / 2);
  if (o.parapet) {
    // a flat roof behind a tall parapet: no tile in frame at all, and the
    // parapet itself reads as another metre of FACADE
    flatRoof(b, f, w, d, o.band ?? PAL.stoneLight, { top: h, parapet: o.parapet, capColor: o.roof });
    b.box(f.x, f.y + h + 0.06, f.z, w - 0.4, 0.12, d - 0.4, o.deck ?? 0x9a8f7a, { ry, ao: 0 });
    // a lapped felt deck, so a flat roof is a SURFACE and not a pale slab
    if (!T._cache.roofFelt) T._cache.roofFelt = T.A.panel(8, 6, (g, W, H) => {
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 ? '#9b917d' : '#8b8270'; g.fillRect(0, H * i / 6, W, H / 6 + 1);
        g.strokeStyle = 'rgba(52,46,38,.45)'; g.lineWidth = H * 0.009;
        g.beginPath(); g.moveTo(0, H * i / 6); g.lineTo(W, H * i / 6); g.stroke();
      }
      g.globalAlpha = 0.15; g.fillStyle = '#3c3428';
      for (let i = 0; i < 8; i++) { g.beginPath(); g.ellipse(W * (0.12 + (i * 0.14) % 0.8), H * (0.18 + (i * 0.23) % 0.66), W * 0.07, H * 0.06, i, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }, 30);
    b.signFlat(T._cache.roofFelt, f.x, f.y + h + 0.19, f.z, w - 0.5, d - 0.5, { ry });
    // a run of duckboard and a chair nobody carried back down
    for (let i = 0; i < 4; i++) b.box(f.px(-w * 0.25 + i * 0.9, -d * 0.05), f.y + h + 0.2, f.pz(-w * 0.25 + i * 0.9, -d * 0.05), 0.8, 0.08, 0.7, 0x8c8270, { ry, ao: 0 });
    b.box(f.px(w * 0.05, d * 0.26), f.y + h + 0.2, f.pz(w * 0.05, d * 0.26), 0.7, 0.1, 0.7, o.trim, { ry: ry + 0.5, ao: 0 });
    b.box(f.px(w * 0.05, d * 0.26 - 0.3), f.y + h + 0.3, f.pz(w * 0.05, d * 0.26 - 0.3), 0.7, 0.75, 0.1, o.trim, { ry: ry + 0.5, ao: 0 });
    loafCat(b, f.px(w * 0.05, d * 0.26), f.y + h + 0.3, f.pz(w * 0.05, d * 0.26), 1.1, PAL.fur[Math.abs(Math.round(w * 4)) % PAL.fur.length], { ry: ry + 1.3 });
    // roof plant: a water tank, two vent pipes, a washing line's dead end
    b.cyl(f.px(w * 0.28, -d * 0.18), f.y + h + 0.18, f.pz(w * 0.28, -d * 0.18), 0.7, 0.78, 1.3, 0x8ea4ae, { seg: 10, ao: 0 });
    b.cyl(f.px(w * 0.28, -d * 0.18), f.y + h + 1.48, f.pz(w * 0.28, -d * 0.18), 0.62, 0.74, 0.2, 0x6f8590, { seg: 10, ao: 0 });
    for (let i = 0; i < 2; i++) b.cyl(f.px(-w * 0.3 + i * 0.8, d * 0.22), f.y + h + 0.18, f.pz(-w * 0.3 + i * 0.8, d * 0.22), 0.14, 0.16, 0.8 + i * 0.35, 0x5a5248, { seg: 6, ao: 0 });
  } else {
    tileRoof(b, f, w, roofH, d, o.roof, {
      top: h, alongX: !o.gableFront, pitch, kind: o.roofKind || 'tile',
      eave: o.band ?? PAL.stoneLight, ridgeColor: o.ridge,
    });
  }
  // chimney + rooftop life
  const ch = at(f, o.chimAng ?? 2.3, Math.min(w, d) * 0.3);
  b.box(ch.x, f.y + h + 0.4, ch.z, 0.9, 1.7, 0.9, o.wall, { ry, ao: 0 });
  b.box(ch.x, f.y + h + 2.0, ch.z, 1.2, 0.28, 1.2, PAL.stoneDark, { ry, ao: 0 });
  b.cyl(ch.x, f.y + h + 2.2, ch.z, 0.16, 0.18, 0.4, 0x4a4238, { seg: 6, ao: 0 });

  // ── shopfront ──────────────────────────────────────────────────────────────
  const fz = d / 2;
  const fy = o.frontH ?? 4.6;
  if (o.enter) {
    // the facade band, with the doorway cut out of it
    const g = o.enter.gaps[0];
    const x0 = -(w - 0.3) / 2, x1 = (w - 0.3) / 2, l0 = g.lx - g.w / 2, l1 = g.lx + g.w / 2;
    // …and the slab is SOLID either side of the doorway, with the same edges
    // as the gap. The wall's collider stops at the wall face, 0.36 behind the
    // slab's: the visitor walked half his body into the shopfront beside the
    // door, and the collider gap in front of the wall was the whole frontage.
    for (const [a, c] of [[x0, l0], [l1, x1]]) if (c - a > 0.05) {
      b.box(f.px((a + c) / 2, fz + 0.1), f.y, f.pz((a + c) / 2, fz + 0.1), c - a, fy, 0.62, o.front ?? PAL.stoneLight, { ry, ao: 0.7, aoBase: f.y, aoH: 2.2 });
      T.wall(f.px((a + c) / 2, fz + 0.1), f.pz((a + c) / 2, fz + 0.1), c - a, 0.62, ry);
    }
    b.box(f.px(g.lx, fz + 0.1), f.y + g.h, f.pz(g.lx, fz + 0.1), g.w, fy - g.h, 0.62, o.front ?? PAL.stoneLight, { ry, ao: 0 });
    b.box(f.px(0, -fz - 0.1), f.y, f.pz(0, -fz - 0.1), w - 0.3, fy, 0.62, o.front ?? PAL.stoneLight, { ry, ao: 0.7, aoBase: f.y, aoH: 2.2 });
  } else {
    b.box(f.x, f.y, f.z, w - 0.3, fy, d + 0.5, o.front ?? PAL.stoneLight, { ry, ao: 0.7, aoBase: f.y, aoH: 2.2 });
  }
  // (an enterable shop's facade slab stands 0.41 proud: the window goes on its
  // face, not buried in it with its glass in the slab's own plane)
  shopWindow(b, f, o.winX ?? -w * 0.19, fz + (o.enter ? 0.41 : 0.26), 1.15, o.winW ?? w * 0.46, 2.55, { frameColor: o.trim, goods: o.goods });
  if (o.enter) {
    // the display window stands proud of the slab: its frame, and its stone
    // sill 0.4 out at the visitor's waist (and what stands on it, o.goodsOut),
    // so the slab's collider steps out round it (never a low prop: nobody
    // climbs onto a shop's window sill)
    const ww = (o.winW ?? w * 0.46) + 0.4, wx = o.winX ?? -w * 0.19, wz1 = fz + 0.41 + Math.max(0.4, o.goodsOut ?? 0);
    T.wall(f.px(wx, (fz + 0.21 + wz1) / 2), f.pz(wx, (fz + 0.21 + wz1) / 2), ww, wz1 - fz - 0.21, ry);
  }
  if (o.enter) {
    // An ENTERABLE shop's doorway is its wall gap, cased in the shop's trim on
    // the face of the facade slab (at fz + 0.26 the casing was buried in it: a
    // raw cut in the plaster), with a lintel and a painted TRANSOM light over it
    // under the fascia. The little HUMANS door keeps its old place at the
    // corner; the doorway moved left to leave wall beside it.
    const g = o.enter.gaps[0];
    doorUnit(b, f, g.lx, fz + 0.41, { w: 1.9, h: 2.9, color: o.trim, casing: o.trim, surround: o.band ?? PAL.stoneLight, head: 'transom', transomCell: o.transomCell, transomGlow: o.transomGlow, humanSide: 1, humanAt: w * 0.26 + 1.7, humanSignCell: T.humansLabel(), leaf: false, recess: false, clear: g.w, clearH: g.h, sill: o.enter.floorTop });
  } else {
    doorUnit(b, f, w * 0.26, fz + 0.26, { w: 1.9, h: 2.9, color: o.trim, humanSide: 1, humanSignCell: T.humansLabel(), flap: o.flap ?? 0xe8d9b8 });
  }
  if (o.awn !== false) awning(b, f, o.awnX ?? -w * 0.19, fz + 0.3, f.y + fy - 0.4, o.awnW ?? w * 0.56, o.stripe, { depth: 2.0, under: 0xefe4cf });
  // The fascia band is taller than it was and it now carries a moulded cornice,
  // so the SIGNED part of the elevation — awning, fascia, cornice, balcony — is
  // two thirds of the building's screen height instead of a stripe under a roof.
  fascia(b, f, 0, fz + 0.28, f.y + fy, w - 0.2, 1.25, o.sign, o.trim, { glow: o.glow, lamps: o.lamps });
  cornice(b, f, 0, fz + 0.34, f.y + fy + 1.25, w + 0.1, o.band ?? PAL.stoneLight, { capColor: o.trim, d: 0.56 });
  if (o.balcony !== false) balcony(b, f, 0, fz + 0.2, f.y + fy + 1.95, w * 0.72, { color: o.band ?? PAL.stoneLight, rail: o.trim, depth: 1.15 });
  // a roof sign nothing can crop: the fascia is at the mercy of whichever
  // neighbour leans furthest into the street, this is not
  if (o.roofSign) {
    // stood on the front eaves, so its legs read against the slope and the
    // board clears the ridge — the one sign on this street nothing can crop
    billboard(b, f, 0, fz - 0.4, f.y + h - 0.1, Math.min(w * 0.92, 7.4), 1.45, o.roofSign === true ? o.sign : o.roofSign, {
      legH: 1.5, face: o.trim, trimColor: o.band ?? PAL.stoneLight, glow: true, lamps: false,
    });
  }

  // ── hanging bracket sign, readable from along the street ──────────────────
  // Hung HIGH and pushed 2.7 into the street. At 1.9 out and fascia height these
  // boards sat in the same slab of air as the neighbour's awning and cornice —
  // which is how THE FISH MONGER's 'FRESH ISH' came to read 'RESH ISH'.
  if (o.hang) {
    const hx = w * 0.42, hy = f.y + fy + 3.0, OUT = 2.7;
    b.box(f.px(hx, fz + OUT / 2 + 0.15), hy, f.pz(hx, fz + OUT / 2 + 0.15), 0.18, 0.18, OUT + 0.4, 0x3a3229, { ry, mat: 'metal', ao: 0 });
    b.box(f.px(hx, fz + OUT), hy - 0.75, f.pz(hx, fz + OUT), 0.13, 0.75, 0.13, 0x3a3229, { ry, mat: 'metal', ao: 0 });
    b.cyl(f.px(hx, fz + OUT * 0.55), hy - 0.62, f.pz(hx, fz + OUT * 0.55), 0.075, 0.075, 1.55, 0x3a3229, { seg: 5, ry, rz: 0.72, mat: 'metal', ao: 0 });
    b.sph(f.px(hx, fz + OUT), hy + 0.22, f.pz(hx, fz + OUT), 0.16, PAL.gold, { seg: 7, rings: 5, mat: 'metal' });
    const hw = o.hangW ?? 2.1, hh = o.hangH ?? 1.5;
    b.box(f.px(hx, fz + OUT), hy - 1.55 - hh, f.pz(hx, fz + OUT), 0.16, hh, hw, o.trim, { ry, ao: 0 });
    for (const s of [-1, 1]) b.sign(o.hang, f.px(hx + s * 0.1, fz + OUT), hy - 1.55 - hh / 2, f.pz(hx + s * 0.1, fz + OUT), hw, hh, { ry: ry + (s > 0 ? Math.PI / 2 : -Math.PI / 2), glow: o.glow });
    halo(b, f.px(hx, fz + OUT), hy - 1.55 - hh / 2, f.pz(hx, fz + OUT), 1.1);
  }

  // ── upper floor(s): sun-lounging sills ────────────────────────────────────
  const nWin = o.wins ?? Math.max(2, Math.round(w / 3.4));
  for (let i = 0; i < nWin; i++) {
    const lx = (-0.5 + (i + 0.5) / nWin) * (w - 1.6);
    windowUnit(b, f, lx, fz, fy + 2.2, 1.7, 1.95, { trim: o.shutter ?? o.trim, flowers: i % 2 === 0 && o.balcony === false, cushionOff: (i % 2 ? 0.2 : -0.2) });
    // somebody is asleep on one of the sills
    if (i === (o.sleeper ?? 1) % nWin) loafCat(b, f.px(lx + 0.15, fz + 0.36), f.y + fy + 2.38, f.pz(lx + 0.15, fz + 0.36), 1.15, PAL.fur[(i + Math.round(w)) % PAL.fur.length], { ry: ry + 1.5 + (i % 2), tailSide: i % 2 ? 1 : -1 });
  }
  if (h > 11.4) for (let i = 0; i < nWin; i++) {
    const lx = (-0.5 + (i + 0.5) / nWin) * (w - 1.6);
    windowUnit(b, f, lx, fz, fy + 5.0, 1.5, 1.6, { trim: o.shutter ?? o.trim, cushion: i % 2 === 0 });
  }
  const ghost = o.ghost && T.plaque(2.8, 3.6, o.ghost.map((t, i) => ({
    t, s: i === 0 ? 0.3 : 0.19, c: i === 0 ? '#8a7458' : '#9a8a72', weight: i === 0 ? 'bold' : 'italic bold', shadow: false,
  })), { bg: o.wall, border: false, grime: 0.5, dpu: 60 });

  // ── rear elevation ────────────────────────────────────────────────────────
  // The south row shows its BACK to the street, so the back has to be as
  // authored as the front. It used to be two 1.3-wide windows on ~7×8 m of bare
  // plaster (plus a third window buried inside the protruding shopfront block),
  // which read as one blank slab by day and a pure-black hole at night.
  // Now: three lit windows, a balcony on an outside stair, a lean-to over the
  // yard door, string courses and a painted wall advert.
  const bf = frame(f.x, f.y, f.z, ry + Math.PI);
  const BX = (lx, lz) => bf.px(lx, lz), BZ = (lx, lz) => bf.pz(lx, lz);
  const bry = bf.ry, out = fz + 0.28;          // the shopfront block protrudes 0.25
  for (let i = 0; i < 3; i++) {
    const lx = (-0.5 + (i + 0.5) / 3) * (w - 1.5);
    windowUnit(b, bf, lx, fz, fy + 2.2, 1.7, 1.95, { trim: o.shutter ?? o.trim, shutters: i !== 1, cushion: i !== 1, cushionColor: o.trim });
  }
  // the buried low window, moved out onto the face of the shopfront block
  windowUnit(b, bf, -w * 0.26, out, 1.5, 1.4, 1.5, { trim: o.shutter ?? o.trim, shutters: false, cushion: false });
  // balcony on the middle bay + the outside stair that reaches it
  b.box(BX(0, fz + 1.0), f.y + fy + 1.6, BZ(0, fz + 1.0), w * 0.5, 0.24, 2.0, o.band ?? PAL.stoneLight, { ry: bry, ao: 0 });
  for (let i = 0; i < 8; i++) b.box(BX(-w * 0.24 + i * (w * 0.48 / 7), fz + 1.92), f.y + fy + 1.84, BZ(-w * 0.24 + i * (w * 0.48 / 7), fz + 1.92), 0.09, 0.92, 0.09, o.trim, { ry: bry, ao: 0, mat: 'metal' });
  b.box(BX(0, fz + 1.92), f.y + fy + 2.7, BZ(0, fz + 1.92), w * 0.5, 0.12, 0.13, o.trim, { ry: bry, ao: 0, mat: 'metal' });
  const stepN = 11, stepH = (fy + 1.6) / stepN;
  for (let i = 0; i < stepN; i++) {
    const sx = -w * 0.3 - 0.25, sz = fz + 2.5 - i * 0.2;
    b.box(BX(sx, sz), f.y + i * stepH, BZ(sx, sz), 1.25, stepH + 0.14, 0.5, PAL.stone, { ry: bry, ao: 0.3, aoBase: f.y });
  }
  b.box(BX(-w * 0.3 - 0.25, fz + 1.1), f.y + fy + 0.4, BZ(-w * 0.3 - 0.25, fz + 1.1), 0.1, 1.0, 2.6, o.trim, { ry: bry, rz: 0.5, ao: 0, mat: 'metal' });
  // back door with a lean-to over it
  b.box(BX(w * 0.27, fz + 0.12), f.y, BZ(w * 0.27, fz + 0.12), 1.1, 2.2, 0.24, o.trim, { ry: bry, ao: 0.4, aoBase: f.y });
  b.box(BX(w * 0.27, fz + 0.3), f.y + 0.05, BZ(w * 0.27, fz + 0.3), 0.6, 0.6, 0.1, 0x2a2119, { ry: bry, ao: 0 });            // its cat flap
  b.wedge(BX(w * 0.27, fz + 0.85), f.y + 2.34, BZ(w * 0.27, fz + 0.85), 1.5, 0.5, 2.0, o.roof, { ry: bry + Math.PI / 2, ao: 0 });
  for (const s of [-1, 1]) b.cyl(BX(w * 0.27 + s * 0.7, fz + 1.6), f.y + 1.4, BZ(w * 0.27 + s * 0.7, fz + 1.6), 0.06, 0.06, 1.3, 0x4a4038, { seg: 5, ry: bry, rz: 0.7, mat: 'metal', ao: 0 });
  // string courses so the plaster is banded like the front
  for (const yy of [f.y + fy + 0.1, f.y + h - 1.1]) b.box(bf.x, yy, bf.z, w + 0.22, 0.26, d + 0.22, o.band ?? PAL.stoneLight, { ry, ao: 0 });
  b.cyl(BX(-w * 0.44, fz + 0.2), f.y, BZ(-w * 0.44, fz + 0.2), 0.11, 0.13, h - 0.5, 0x8e8272, { seg: 6, ry: bry, ao: 0.4, aoBase: f.y }); // downpipe
  b.cyl(BX(w * 0.44, fz + 0.2), f.y, BZ(w * 0.44, fz + 0.2), 0.11, 0.13, h - 0.5, 0x8e8272, { seg: 6, ry: bry, ao: 0.4, aoBase: f.y });
  if (ghost) b.sign(ghost, BX(w * 0.22, fz + 0.13), f.y + h - 2.9, BZ(w * 0.22, fz + 0.13), 3.0, 3.5, { ry: bry });
  // gas bottles and an extract fan, because this is the back of a shop
  for (let i = 0; i < 2; i++) b.cyl(BX(-w * 0.05 + i * 0.62, fz + 1.5), f.y, BZ(-w * 0.05 + i * 0.62, fz + 1.5), 0.26, 0.28, 1.0, i ? 0xc25a3a : 0x8ea4ae, { seg: 9, ry: bry, ao: 0.5, aoBase: f.y });
  b.box(BX(w * 0.05, fz + 0.18), f.y + fy - 0.9, BZ(w * 0.05, fz + 0.18), 0.9, 0.9, 0.3, 0x8e8272, { ry: bry, ao: 0 });
  b.cyl(BX(w * 0.05, fz + 0.36), f.y + fy - 0.45, BZ(w * 0.05, fz + 0.36), 0.3, 0.3, 0.1, 0x3a3229, { seg: 8, ry: bry, rx: Math.PI / 2, ao: 0, mat: 'metal' });
  for (let i = 0; i < 3; i++) crate(b, bf.px(w * 0.05 + i * 0.95, fz + 0.9), f.y, bf.pz(w * 0.05 + i * 0.95, fz + 0.9), 0.72 - i * 0.06, bf.ry + i * 0.4);
  // washing line strung across the back yard
  if (o.laundry !== false) {
    const a = [bf.px(-w * 0.4, fz + 0.3), f.y + fy + 1.5, bf.pz(-w * 0.4, fz + 0.3)];
    const c2 = [bf.px(w * 0.4, fz + 1.6), f.y + fy + 1.1, bf.pz(w * 0.4, fz + 1.6)];
    b.tube([[a[0], a[1], a[2]], [(a[0] + c2[0]) / 2, (a[1] + c2[1]) / 2 - 0.5, (a[2] + c2[2]) / 2], [c2[0], c2[1], c2[2]]], 0.04, 0x8a7a5a, { rseg: 4 });
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      const lx2 = a[0] + (c2[0] - a[0]) * t, ly = a[1] + (c2[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.5, lz2 = a[2] + (c2[2] - a[2]) * t;
      b.box(lx2, ly - 0.7, lz2, 0.55, 0.68, 0.06, PAL.cloth[(i + Math.round(w)) % PAL.cloth.length], { ry: bf.ry, rz: 0.1, ao: 0 });
    }
  }
  // ── side elevations: a terrace end is NEVER a blank plastered slab ────────
  // one shuttered window, a downpipe, and a faded painted wall advert (a sign
  // quad is 2 tris and comes out of the shared atlas, so this is nearly free).
  for (const sw of (o.sides ?? [-1, 1])) {
    const sf = frame(f.px(sw * w / 2, 0), f.y, f.pz(sw * w / 2, 0), ry + sw * Math.PI / 2);
    windowUnit(b, sf, sw * 0.9, -0.06, fy + 1.85, 1.5, 1.7, { trim: o.shutter ?? o.trim, flowers: sw === (o.sideWin ?? 1), cushion: sw < 0 });
    if (ghost) b.sign(ghost, sf.px(-sw * 1.0, 0.13), f.y + fy * 0.52, sf.pz(-sw * 1.0, 0.13), 2.8, 3.4, { ry: sf.ry });
    b.cyl(sf.px(d * 0.44, 0.15), f.y, sf.pz(d * 0.44, 0.15), 0.1, 0.12, h - 0.5, 0x8e8272, { seg: 6, ry: sf.ry, ao: 0.4, aoBase: f.y });
    // a string course carrying the shopfront cornice round the corner
    b.box(sf.px(0, 0.1), f.y + fy - 0.1, sf.pz(0, 0.1), d + 0.7, 0.28, 0.2, o.band ?? PAL.stoneLight, { ry: sf.ry, ao: 0 });
  }
  if (o.enter) { T.solidify(segs, f.y + h); T.claimRing(f.x, f.z, w + 0.4, d + 0.6, ry); }
  else T.colBox(f.x, f.z, w + 0.4, d + 0.6, ry, f.y + h);
  if (o.act) T.act(o.id, f.px(w * 0.26 - 2.6, d / 2 + 3.4), f.pz(w * 0.26 - 2.6, d / 2 + 3.4), o.label, o.act, { r: 3.4, speaker: o.label.toUpperCase() });
  return f;
}

// ─────────────────────────────────────────────────────────────────────────────
export function buildStreet(T) {
  const b = T.b, A = T.A;
  const sc = (name, o = {}) => T.plaque(o.w ?? 6.6, o.h ?? 1.1, o.lines, o);

  // The north row's two ENTERABLE shops, framed first so the sidewalk can stop
  // at their faces: it ran 1.4 u under every shop, which a solid block hides,
  // but inside Purrbucks and the Travel Agency it stood up through the
  // threshold and 0.23 over the boards (a kerb across the floor at +0.45).
  const pbF = lot(T, 100.5, -1), taF = lot(T, 127.6, -1);
  const PBW = 8.2, PBD = 7.6, TAW = 7.2, TAD = 7.2;
  const faces = (f, w, d) => [
    { f, x0: -(w - 0.3) / 2, x1: (w - 0.3) / 2, z: d / 2 + 0.41 },      // the facade slab's face
    { f, x0: -w / 2 - 0.05, x1: -(w - 0.3) / 2, z: d / 2 },             // and the wall beside it
    { f, x0: (w - 0.3) / 2, x1: w / 2 + 0.05, z: d / 2 },
  ];
  const cuts = [...faces(pbF, PBW, PBD), ...faces(taF, TAW, TAD)];

  // ── roadway + sidewalks ────────────────────────────────────────────────────
  // ...and all of it is GROUND (T.paved): the slabs are laid flat at the highest
  // ground along each run, so on this hillside they stand 0.1–1 u over the
  // terrain, and the visitor and every cat on the street waded through them.
  const paveBoxes = [];
  const road = CL.map(([x, z]) => [x, z]);
  ribbon(b, road, 7.4, (x, z) => T.ground(x, z), 0xa1917a, { th: 0.34, lift: 0.12, kerb: false, seg: 4, out: paveBoxes });
  for (const side of [-1, 1]) {
    const walk = CL.map(([x, z]) => {
      const s = slopeAt(x), len = Math.hypot(1, s);
      return [x + (s / len) * 5.4 * side, z + (-1 / len) * 5.4 * side];
    });
    ribbon(b, walk, 3.6, (x, z) => T.ground(x, z), 0xd8c9ab, { th: 0.5, lift: 0.12, kerb: true, kerbColor: 0x9c8c70, seg: 4, cuts, out: paveBoxes });
  }
  const streetFloor = T.paved('cat_main_street', paveBoxes);
  // Painted pawprints down the middle of the road. These were 112 squashed
  // spheres that read as blurred smudges on the tarmac (and cost ~4.5k tris);
  // now they are painted on the road surface as one atlas quad per stride.
  const pawPaint = A.panel(3.0, 3.0, (g, W, H) => {
    g.fillStyle = '#a1917a'; g.fillRect(0, 0, W, H);
    const paw = (cx, cy, sc, rot) => {
      g.save(); g.translate(cx, cy); g.rotate(rot); g.fillStyle = '#7d6e56';
      g.beginPath(); g.ellipse(0, 0, W * 0.105 * sc, W * 0.085 * sc, 0, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 4; k++) {
        const a = -0.62 + k * 0.41;
        g.beginPath(); g.ellipse(Math.sin(a) * W * 0.135 * sc, -Math.cos(a) * W * 0.135 * sc, W * 0.04 * sc, W * 0.048 * sc, a, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    };
    paw(W * 0.32, H * 0.34, 1.0, -0.22);
    paw(W * 0.66, H * 0.68, 1.0, 0.16);
  }, 70);
  for (let x = 98; x < 145; x += 3.1) {
    const z = streetZ(x), y = T.ground(x, z) + 0.14;
    b.signFlat(pawPaint, x, y, z, 3.0, 3.0, { ry: Math.atan2(1, slopeAt(x)) - Math.PI / 2 });
  }

  // ── NORTH ROW (the hero row, facing the camera) ───────────────────────────
  // 1 · PURRBUCKS — ENTERABLE (see architecture/interiors.js)
  // (pbF, PBW and PBD are up with the sidewalk, which stops at this facade)
  // The doorway is 1.8 wide and 3.36 high (the floor stands 1.04 above the
  // street here, so a 3.05 gap left 2.01 of headroom over the threshold), and
  // it sits 0.37 left of the old cat door so the HUMANS door has wall beside it.
  const PBH = 9.9, PBT = 0.5, PBFY = 3.9, pbDX = 1.762, PBG = 1.8, PBGH = 3.36;
  // the hillside behind this shop stands ~0.8 above its centre: lay the floor
  // over the HIGHEST ground in the footprint and step up to it at the door
  const pbY = T.padY(pbF.x, pbF.z, PBW - PBT * 2, PBD - PBT * 2, pbF.ry) + 0.16;
  shop(T, pbF, {
    into: T.shell('purrbucks'),
    enter: { t: PBT, gaps: [{ face: 0, lx: pbDX, w: PBG, h: PBGH }], ceil: PBFY - 0.15, floorColor: 0xa8916c, ceilColor: 0xe8dcc0, floorInto: T.b, floorTop: pbY },
    w: PBW, d: PBD, h: PBH, wall: 0xefd7a4, ghost: ['PURRBUCKS', 'MILK &', 'WARM MILK', 'est. whenever'],
    roof: 0xc2452f, roofKind: 'tile', ridge: 0x9c3423, roofSign: true, trim: 0x1f6a4a, band: 0xf6ead0, quoins: true, sideWin: -1,
    // the window and its awning stop short of the door's lintel (the awning
    // used to run 0.27 into the casing), and over the door a gilt transom:
    // what they serve, lit from inside after dark
    winX: -1.7, awnX: -1.85, awnW: 3.9,
    transomCell: T.plaque(PBG, 0.6, [{ t: 'WARM MILK', s: 0.5, c: '#f0c870', spacing: 1 }], { bg: '#1a2a22', border: '#2f8f66', borderW: 0.035, grime: 0.05, dpu: 170 }), transomGlow: true,
    id: 'purrbucks', label: 'Purrbucks', act: [
      'the cup has your name on it. spelled right. you have not told anyone your name.',
      'the menu: MILK, WARM MILK, MILK (LARGE), and one line reading "coffee (we do not understand it either)".',
      'the barista asks if you are staying in. you say yes. she writes "STAYING IN" on the cup and beams.',
    ],
    sign: T.plaque(7.8, 1.1, [{ t: 'PURRBUCKS', s: 0.66, c: '#f4f9ef', spacing: 3 }], { bg: '#1f6a4a', border: '#0f3a28', border2: '#2f8f66', borderW: 0.05, logo: (g, W, H) => { T.catFace(g, W * 0.1, H * 0.5, H * 0.3, '#f4f9ef', { eye: '#1f6a4a', nose: '#f2c14e' }); } }),
    hang: T.plaque(1.9, 1.4, [{ t: 'COFFEE', s: 0.26, c: '#f4f9ef' }, { t: '& NAPS', s: 0.26, c: '#f4f9ef' }], { bg: '#1f6a4a', border: '#f2c14e', borderW: 0.07, dpu: 120 }),
    stripe: T.stripe(['#1f6a4a', '#f4f0e0'], 10), glow: true,
    // four cups standing ON the window's sill (at lz + 0.5, y they hung in the
    // air in front of it, half over the pavement; at lz + 0.37 and 0.22 across
    // they still overhung it by 0.14, over the visitor's chest): between the
    // glass (lz + 0.15) and the sill's edge (lz + 0.4), and solid to their rims
    goodsOut: 0.46,
    goods: (bb, ff, lx, lz, y) => { for (let i = 0; i < 4; i++) bb.cyl(ff.px(lx - 1.2 + i * 0.8, lz + 0.31), y - 0.08, ff.pz(lx - 1.2 + i * 0.8, lz + 0.31), 0.15, 0.12, 0.44, 0xf4f0e0, { seg: 8, ry: ff.ry, ao: 0 }); },
  });
  T.stoop(pbF, pbDX, PBD / 2, 3.0, pbY, { wall: PBT, gap: PBG, front: 0.41, floor: streetFloor });
  const pbRoom = T.room({ id: 'purrbucks', x: pbF.x, z: pbF.z, w: PBW - PBT * 2, d: PBD - PBT * 2, rot: pbF.ry, y: pbF.y, floorY: pbY, h: PBFY, label: 'Purrbucks' });
  // a café door: green, glazed above (lit from inside after dark), cream
  // glazing bars, hung on the right so it opens clear of the armchairs
  T.door({
    id: 'purrbucks', room: pbRoom, y: pbF.y, ry: pbF.ry, w: PBG, color: 0x1f6a4a, field: 0x2a7d58, trim: 0xf4f0e0, flap: 0xf4f0e0,
    style: 'glazed', glassMat: 'win', glassFrom: 0.5, hinge: 1,
    x: pbF.px(pbDX, PBD / 2 + 0.36), z: pbF.pz(pbDX, PBD / 2 + 0.36), inset: 0.36 + PBT, sill: pbY, top: pbF.y + PBGH,
    say: 'warm milk. it is always warm milk. it is always exactly right.', speaker: 'PURRBUCKS',
  });
  T.roomDetail('purrbucks', () => purrbucksInterior(T, frame(pbF.x, pbY, pbF.z, pbF.ry), { hw: (PBW - PBT * 2) / 2, hd: (PBD - PBT * 2) / 2, doorX: pbDX, doorW: PBG }));
  // outdoor tables, in front of the window (the middle one of three at
  // 97.5 / 100.1 / 102.7 stood on the doorstep, a chair in the doorway)
  // They stand ON the paving (they were set at terrain + 0.3, which on this
  // hillside is not where the sidewalk's top is), and they are solid: the
  // table is (you walk round it), a chair is a seat you can step up onto.
  for (const tx of [95.2, 97.5]) {
    const tz = streetZ(tx) - 5.4, ty = streetFloor(tx, tz) ?? T.ground(tx, tz) + 0.3;
    b.cyl(tx, ty, tz, 0.18, 0.3, 0.75, 0x3a3229, { seg: 7, mat: 'metal', ao: 0.4, aoBase: ty });
    b.cyl(tx, ty + 0.75, tz, 0.72, 0.72, 0.1, 0xf0e6d2, { seg: 12, ao: 0 });
    b.cyl(tx + 0.2, ty + 0.85, tz + 0.15, 0.14, 0.11, 0.28, 0xf4f0e0, { seg: 7, ao: 0 });
    T.col(tx, tz, 0.72);
    for (const s of [-1, 1]) {
      const cx = tx + s * 1.0, cz = tz + s * 0.3, cy = streetFloor(cx, cz) ?? ty;
      b.cyl(cx, cy, cz, 0.14, 0.16, 0.45, 0x3a3229, { seg: 6, mat: 'metal', ao: 0 });
      b.cyl(cx, cy + 0.45, cz, 0.36, 0.34, 0.09, 0x1f6a4a, { seg: 9, ao: 0 });
      T.col(cx, cz, 0.36, cy + 0.54);
    }
  }

  // 2 · THE FISH MONGER
  shop(T, lot(T, 109.4, -1), {
    w: 8.4, d: 7.6, h: 9.6, wall: 0xc6dee6, ghost: ['FRESH-ISH', 'FISH DAILY', 'not for you', 'sorry'],
    roof: 0x66737f, roofKind: 'slate', ridge: 0x47525c, roofSign: true, trim: 0x1d3557, band: 0xeef6f8, gableFront: true,
    id: 'fishmonger', label: 'The Fish Monger', act: [
      'NO FISH FOR HUMANS. it is painted in letters half a metre tall. it is not negotiable.',
      'you ask why. the monger says "you would only take it with you." he lets that sit.',
      'he gives you a free piece of ice instead. he seems to think this is very generous.',
    ],
    sign: T.plaque(8.0, 1.1, [{ t: 'THE FISH MONGER', s: 0.52, c: '#eaf6ff' }, { t: 'NO FISH FOR HUMANS', s: 0.3, c: '#9fd8ff' }], { bg: '#1d3557', border: '#f2c14e', borderW: 0.05 }),
    hang: T.plaque(1.9, 1.4, [{ t: 'FRESH', s: 0.3, c: '#1d3557' }, { t: 'ISH', s: 0.34, c: '#1d3557' }], { bg: '#d8ecf6', border: '#1d3557', borderW: 0.07, dpu: 120 }),
    stripe: T.stripe(['#1d3557', '#eaf6ff'], 10), glow: true,
    goods: (bb, ff, lx, lz, y) => {
      bb.box(ff.px(lx, lz + 0.55), y - 0.1, ff.pz(lx, lz + 0.55), 3.2, 0.3, 1.0, 0xdff0f6, { ry: ff.ry, ao: 0 });
      for (let i = 0; i < 5; i++) { const p = ff.px(lx - 1.2 + i * 0.6, lz + 0.55), q = ff.pz(lx - 1.2 + i * 0.6, lz + 0.55); bb.sph(p, y + 0.3, q, 0.26, [0x8aa6b8, 0xb8c6cf, 0x9fb4c2][i % 3], { seg: 8, rings: 5, sx: 1.7, sy: 0.7, ry: ff.ry + 0.3 }); }
    },
  });

  // 3 · CATNIP DISPENSARY
  shop(T, lot(T, 117.6, -1), {
    w: 7.4, d: 7.2, h: 10.0, wall: 0xdcc4e4, ghost: ['NIP', 'HALF STRENGTH', 'FOR GUESTS', 'stay calm'],
    roof: 0x4f9d8c, roofKind: 'copper', ridge: 0x357a6c, roofSign: true, trim: 0x4a2f6a, band: 0xf2eaf8, quoins: true,
    id: 'catnip', label: 'Catnip Dispensary', act: [
      'CATNIP DISPENSARY \u2014 medicinal. mostly.',
      'a hand-written card by the till: "for GUESTS: half strength. we want you calm, not gone."',
      'everyone inside is extremely relaxed and extremely certain that you should stay.',
    ],
    sign: T.plaque(7.0, 1.1, [{ t: 'CATNIP DISPENSARY', s: 0.5, c: '#e8ffd8' }, { t: 'medicinal. mostly.', s: 0.28, c: '#bdf0a0', weight: 'italic bold' }], { bg: '#4a2f6a', border: '#8fe05a', border2: '#6a4a8a', borderW: 0.05 }),
    hang: T.plaque(1.7, 1.6, [{ t: '⚕', s: 0.5, c: '#8fe05a' }, { t: 'NIP', s: 0.3, c: '#e8ffd8' }], { bg: '#4a2f6a', border: '#8fe05a', borderW: 0.07, dpu: 120 }),
    stripe: T.stripe(['#6a4a8a', '#8fe05a', '#e8dcf0'], 9), glow: true,
    goods: (bb, ff, lx, lz, y) => { for (let i = 0; i < 5; i++) { const p = ff.px(lx - 1.3 + i * 0.65, lz + 0.5), q = ff.pz(lx - 1.3 + i * 0.65, lz + 0.5); bb.cyl(p, y, q, 0.2, 0.2, 0.55, 0x8fe05a, { seg: 8, ao: 0, mat: 'glow' }); } },
  });

  // 4 · TRAVEL AGENCY (dusty, closed, the saddest window in town) — ENTERABLE
  // (taF, TAW and TAD are up with the sidewalk, which stops at this facade)
  // 1.7 wide, 0.32 left of the old cat door (HUMANS keeps its corner), and the
  // display window 0.18 further left to make room for the casing
  const TAH = 9.4, TAT = 0.5, TAFY = 3.9, taDX = 1.552, TAG = 1.7, TAGH = 3.05;
  const taY = T.padY(taF.x, taF.z, TAW - TAT * 2, TAD - TAT * 2, taF.ry) + 0.16;
  shop(T, taF, {
    into: T.shell('travel'),
    enter: { t: TAT, gaps: [{ face: 0, lx: taDX, w: TAG, h: TAGH }], ceil: TAFY - 0.15, floorColor: 0x8e7f64, ceilColor: 0xcfc6b0, floorInto: T.b, floorTop: taY },
    // the display window clear of the door's lintel; over the door a transom
    // nobody has cleaned, with the only destination they still sell
    winX: -1.6, winW: TAW * 0.44,
    transomCell: T.plaque(TAG, 0.6, [{ t: 'ARRIVALS ONLY', s: 0.36, c: '#b9b09a' }], { bg: '#2c3436', border: '#5a6a70', borderW: 0.035, grime: 0.4, dpu: 170 }),
    w: TAW, d: TAD, h: TAH, wall: 0xbdb6a4, ghost: ['SEE THE', 'WORLD', 'ask inside', '(do not ask)'],
    roof: 0x7d7a72, roofKind: 'slate', ridge: 0x5a584f, trim: 0x5a6a70, band: 0xaaa392, awn: false, lamps: false, balcony: false,
    sign: T.plaque(6.8, 1.1, [{ t: 'TRAVEL AGENCY', s: 0.5, c: '#bcc6c9' }, { t: 'see the world', s: 0.26, c: '#8e9a9e', weight: 'italic bold' }], { bg: '#3f4d52', border: '#5a6a70', borderW: 0.05, grime: 0.3 }),
    hang: T.plaque(1.9, 1.4, [{ t: 'CLOSED', s: 0.4, c: '#c9c2b2' }], { bg: '#6a3028', border: '#3a1a14', borderW: 0.08, grime: 0.34, dpu: 120 }),
    stripe: T.stripe(['#6a7278', '#8e9a9e'], 8),
    goods: (bb, ff, lx, lz, y) => {
      // faded posters of places you cannot go
      const post = (i, t1, t2, col) => T.plaque(1.0, 1.4, [{ t: t1, s: 0.3, c: '#e8e2d2' }, { t: t2, s: 0.2, c: '#c9c2b2' }], { bg: col, border: '#4a4a44', borderW: 0.06, grime: 0.3, dpu: 110 });
      const ps = [post(0, 'HOME', 'ask about it', '#4a6a7a'), post(1, 'AWAY', 'sold out', '#6a5a3a'), post(2, 'ANYWHERE', '—', '#5a4a5a')];
      // taped to the glass (at lz + 0.42 they hung a quarter-metre out in the street)
      ps.forEach((c, i) => bb.sign(c, ff.px(lx - 1.2 + i * 1.2, lz + 0.17), y + 0.9, ff.pz(lx - 1.2 + i * 1.2, lz + 0.17), 1.0, 1.4, { ry: ff.ry, rz: (i - 1) * 0.05 }));
    },
  });
  // (the sidewalk here stands 0.23 OVER the shop's floor: no flight, a step
  // down off the paving onto the threshold — the saddest shop sits low)
  T.stoop(taF, taDX, TAD / 2, 3.0, taY, { wall: TAT, gap: TAG, front: 0.41, floor: streetFloor });
  const taRoom = T.room({ id: 'travel', x: taF.x, z: taF.z, w: TAW - TAT * 2, d: TAD - TAT * 2, rot: taF.ry, y: taF.y, floorY: taY, h: TAFY, label: 'Travel Agency' });
  // a faded oxblood door (the CLOSED board's red), dusty glass nobody has
  // cleaned in years (matte: it does not light up), glazing bars in the trim grey
  T.door({
    id: 'travel', room: taRoom, y: taF.y, ry: taF.ry, w: TAG, color: 0x6e3a30, field: 0x7a453a, trim: 0x5a6a70, flap: 0xc9c2b2,
    style: 'glazed', glass: 0x7d8a8c, glassFrom: 0.45, hinge: -1,
    x: taF.px(taDX, TAD / 2 + 0.36), z: taF.pz(taDX, TAD / 2 + 0.36), inset: 0.36 + TAT, sill: taY, top: taF.y + TAGH,
    say: 'the door is not locked. it has never been locked. nobody has opened it in years.', speaker: 'TRAVEL AGENCY',
  });
  T.roomDetail('travel', () => travelInterior(T, frame(taF.x, taY, taF.z, taF.ry), { hw: (TAW - TAT * 2) / 2, hd: (TAD - TAT * 2) / 2, doorX: taDX, doorW: TAG }));
  // dust, cobwebs and a CLOSED placard on the door
  const closedCell = T.plaque(1.3, 0.9, [{ t: 'CLOSED', s: 0.38, c: '#7a2f24' }, { t: 'for the season', s: 0.2, c: '#5a5248' }, { t: 'all seasons', s: 0.2, c: '#5a5248', weight: 'italic bold' }], { bg: '#e0d8c4', border: '#7a2f24', borderW: 0.06, grime: 0.2, dpu: 140 });
  // A CLOSED card taped to the glass is a decal; a CLOSED board hung on a
  // wrought bracket and two chains is a shop that shut and meant it.
  // (hung 0.35 higher: its foot now clears the HUMANS board under it)
  // (and 0.14 right: its edge no longer meets the door's transom cornice)
  hangingPlate(b, taF, TAW * 0.26 + 1.74, TAD / 2 + 0.2, taF.y + 4.05, 1.3, 0.9, closedCell, { rz: 0.1, frame: 0x5a6a70, chain: 0x6a6256 });
  // cobwebs under the fascia — flush with the shopfront (at +0.5 they hung half
  // a metre out in the street and read as four white pebbles in mid-air)
  for (let i = 0; i < 4; i++) b.sph(taF.px(-2.55 + i * 1.7, 7.2 / 2 + 0.3), taF.y + 4.12, taF.pz(-2.55 + i * 1.7, 7.2 / 2 + 0.3), 0.22, 0xd8d2c4, { seg: 5, rings: 3, sz: 0.1, sy: 0.5, ry: 0.5 });
  T.act('travel', taF.px(0, 6.4), taF.pz(0, 6.4), "Travel Agency", [
    'closed for the season. all seasons.',
    'through the dust you can read a note: "back in 10 minutes". the tape holding it up has gone yellow and brittle.',
    'the window display is three posters: HOME (ask about it), AWAY (sold out), ANYWHERE (—).',
  ], { r: 4.4, speaker: 'TRAVEL AGENCY' });

  // 5 · YARN & TWINE
  shop(T, lot(T, 135.2, -1), {
    w: 7.4, d: 7.2, h: 9.8, wall: 0xf0c2d2, ghost: ['WOOL', 'ROPE', 'VERY STRONG', 'for boats'],
    roof: 0xd8993f, roofKind: 'tile', ridge: 0xa8722a, roofSign: true, trim: 0xb03a63, band: 0xfaeaf0, gableFront: true,
    id: 'yarn', label: 'Yarn & Twine', act: [
      'every colour of wool, and one whole wall of rope. very strong rope. suspiciously good rope.',
      'you ask about the rope. "for boats," says the owner, and then, quickly, "for BOAT REPAIRS."',
      'she sells you three metres anyway, and winks, and you are not sure which of you is being kind.',
    ],
    sign: T.plaque(7.0, 1.1, [{ t: 'YARN & TWINE', s: 0.62, c: '#fff1f6' }], { bg: '#b03a63', border: '#f2c14e', borderW: 0.05 }),
    hang: T.plaque(1.7, 1.5, [{ t: 'WOOL', s: 0.3, c: '#b03a63' }], { bg: '#ffe3ee', border: '#b03a63', borderW: 0.08, dpu: 120, logo: (g, W, H) => { g.strokeStyle = '#b03a63'; g.lineWidth = W * 0.03; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(W / 2, H * 0.62, W * 0.22, i * 0.8, i * 0.8 + 2.4); g.stroke(); } } }),
    stripe: T.stripe(['#b03a63', '#ffd7e6', '#f2c14e'], 9), glow: true,
    goods: (bb, ff, lx, lz, y) => { const cols = [0xff6f9c, 0xf2c14e, 0x6ac9d8, 0xb03a63, 0x8fe05a]; for (let i = 0; i < 5; i++) { const p = ff.px(lx - 1.4 + i * 0.72, lz + 0.5), q = ff.pz(lx - 1.4 + i * 0.72, lz + 0.5); bb.sph(p, y + 0.3 + (i % 2) * 0.35, q, 0.32, cols[i], { seg: 9, rings: 6 }); } },
  });

  // 6 · BAKERY with a rotating croissant
  const bkF = lot(T, 143.0, -1);
  shop(T, bkF, {
    w: 7.6, d: 7.4, h: 10.2, wall: 0xf2d9a0, ghost: ['BOULANGERIE', 'DU CHAT', 'baked while', 'you settle in'],
    roof: 0xa8503c, roofKind: 'tile', ridge: 0x7e3b2c, roofSign: true, trim: 0x8a5a2a, band: 0xfff6e4, quoins: true, sideWin: 1,
    sign: T.plaque(7.2, 1.1, [{ t: 'LE CROISSANT MIAOU', s: 0.5, c: '#5a3a18', family: FONTS.SERIF }, { t: 'baked while you settle in', s: 0.24, c: '#8a6a3a', weight: 'italic bold' }], { bg: '#f2c14e', border: '#8a5a2a', border2: '#e8b03a', borderW: 0.05 }),
    hang: T.plaque(1.8, 1.4, [{ t: 'BOULANGERIE', s: 0.22, c: '#5a3a18', family: FONTS.SERIF }, { t: 'DU CHAT', s: 0.24, c: '#5a3a18', family: FONTS.SERIF }], { bg: '#f8e9c8', border: '#8a5a2a', borderW: 0.07, dpu: 120 }),
    stripe: T.stripe(['#d2594a', '#f8e9c8'], 10), glow: true,
    goods: (bb, ff, lx, lz, y) => { for (let i = 0; i < 4; i++) { const p = ff.px(lx - 1.2 + i * 0.8, lz + 0.5), q = ff.pz(lx - 1.2 + i * 0.8, lz + 0.5); bb.sph(p, y + 0.24, q, 0.3, 0xd8a04a, { seg: 8, rings: 5, sy: 0.55, sz: 0.7, ry: ff.ry + i }); } },
  });
  const croissant = T.part((p) => {
    p.torus(0, 0, 0, 1.15, 0.44, 0xdca04a, { seg: 14, tseg: 7, arc: Math.PI * 1.25, rx: -Math.PI / 2 });
    p.sph(1.15, 0, 0, 0.4, 0xd0913e, { seg: 8, rings: 6 });
    p.sph(1.15 * Math.cos(Math.PI * 1.25), 0, 1.15 * Math.sin(Math.PI * 1.25), 0.4, 0xd0913e, { seg: 8, rings: 6 });
    p.cyl(0, -0.4, 0, 0.12, 0.12, 0.4, 0x8a5a2a, { seg: 6, ao: 0 });
  }, 'croissant');
  croissant.position.set(bkF.px(0, 4.6), bkF.y + 6.6, bkF.pz(0, 4.6));
  b.cyl(bkF.px(0, 4.6), bkF.y + 4.6, bkF.pz(0, 4.6), 0.13, 0.15, 2.0, 0x8a5a2a, { seg: 6, mat: 'metal', ao: 0 });
  b.cyl(bkF.px(0, 4.6), bkF.y + 4.0, bkF.pz(0, 4.6), 0.1, 0.12, 0.6, 0x8a5a2a, { seg: 6, ry: bkF.ry, rz: Math.PI / 2, center: true, ao: 0 });
  T.anim((t) => { croissant.rotation.y = t * 0.8; croissant.rotation.z = Math.sin(t * 0.8) * 0.12; });
  T.act('bakery', bkF.px(0, 6.4), bkF.pz(0, 6.4), 'Le Croissant Miaou', [
    'the croissant on the pole turns all day. it has turned for nine years. it is still warm.',
    'the baker asks if you want it "to stay". there is no other option. she knows. she asks anyway.',
    'a tray by the door is labelled "DAY-OLD (for guests)". everything on it is fresh.',
  ], { r: 4.2, speaker: 'BAKERY' });

  // ── SOUTH ROW (low buildings, big roofs, rooftop signage) ─────────────────
  // 7 · BARBER
  const brF = lot(T, 103.0, 1);
  shop(T, brF, {
    w: 7.0, d: 6.6, h: 8.8, wall: 0xe8b491, ghost: ['CLIP', 'SNIP', 'FREE NAILS', 'no refunds'],
    roof: 0xb02a24, parapet: 1.3, deck: 0x9c8f78, trim: 0xb02a24, band: 0xfff6e4, frontH: 4.2, wins: 2, balcony: false,
    sign: T.plaque(6.6, 1.1, [{ t: 'BARBER', s: 0.5, c: '#fff4e2' }, { t: 'FREE NAIL CLIPPING', s: 0.3, c: '#ffd0c4' }], { bg: '#b02a24', border: '#f4ecd8', borderW: 0.05 }),
    hang: T.plaque(1.7, 1.4, [{ t: 'CLIP', s: 0.32, c: '#b02a24' }, { t: 'SNIP', s: 0.32, c: '#1d3557' }], { bg: '#fff4e2', border: '#b02a24', borderW: 0.08, dpu: 120 }),
    stripe: T.stripe(['#b02a24', '#ffffff', '#1d3557', '#ffffff'], 12), glow: true,
  });
  // barber pole (spins)
  const barberPole = T.part((p) => {
    p.cyl(0, -0.95, 0, 0.28, 0.28, 1.9, 0xf6f2ea, { seg: 12, ao: 0 });
    for (let i = 0; i < 34; i++) {            // helical red / blue barber stripes
      const a = i * 0.62, yy = -0.85 + i * 0.05;
      p.box(Math.cos(a) * 0.29, yy, Math.sin(a) * 0.29, 0.13, 0.1, 0.22, i % 2 ? 0xe03a2a : 0x2a4a8a, { ry: -a, rz: 0.5, ao: 0 });
    }
  }, 'barberpole');
  const bp = { x: brF.px(7.0 * 0.44, 6.6 / 2 + 0.5), z: brF.pz(7.0 * 0.44, 6.6 / 2 + 0.5) };
  barberPole.position.set(bp.x, brF.y + 3.0, bp.z);
  b.cyl(bp.x, brF.y + 1.7, bp.z, 0.3, 0.3, 0.4, 0x2f3a3c, { seg: 10, mat: 'metal', ao: 0 });
  b.cyl(bp.x, brF.y + 3.9, bp.z, 0.3, 0.3, 0.4, 0x2f3a3c, { seg: 10, mat: 'metal', ao: 0 });
  b.sph(bp.x, brF.y + 4.4, bp.z, 0.26, 0x2f3a3c, { seg: 8, rings: 6, mat: 'metal' });
  T.anim((t) => { barberPole.rotation.y = -t * 1.6; });
  T.act('barber', bp.x + 1.2, bp.z + 1.4, 'Barber', [
    'FREE NAIL CLIPPING. the chair is enormous. the mirror is at knee height.',
    'the barber looks at your fingernails for a long, disappointed moment.',
    '"i can do something about the hair," he says, "but you will still look like that."',
  ], { r: 3.6, speaker: 'BARBER' });

  // 8 · FIRST NATIONAL BANK OF NAPS (stone, columns, rooftop billboard)
  const bnF = lot(T, 112.4, 1, 11.2);
  block(b, bnF, 10.4, 6.4, 8.4, 0xe6dcc0, { quoins: true, plinthColor: PAL.stone, bandColor: 0xf2e9d2 });
  flatRoof(b, bnF, 10.4, 8.4, 0xe6dcc0, { top: 6.4, parapet: 0.75, capColor: 0xb9a887 });
  for (let i = 0; i < 4; i++) column(b, bnF.px(-3.3 + i * 2.2, 4.5), bnF.y, bnF.pz(-3.3 + i * 2.2, 4.5), 0.45, 5.9, 0xf2e9d2, { seg: 10 });
  b.box(bnF.px(0, 4.5), bnF.y + 5.9, bnF.pz(0, 4.5), 10.2, 0.55, 1.8, 0xf2e9d2, { ry: bnF.ry, ao: 0 });
  b.roof(bnF.px(0, 4.5), bnF.y + 6.45, bnF.pz(0, 4.5), 2.0, 1.4, 10.2, 0xf2e9d2, { ry: bnF.ry + Math.PI / 2, ao: 0 });
  doorUnit(b, bnF, 0, 4.3, { w: 2.4, h: 3.4, color: 0x7a5a2a, humanSignCell: T.humansLabel(), surround: 0xf2e9d2 });
  for (const s of [-1, 1]) windowUnit(b, bnF, s * 3.4, 4.2, 1.6, 1.6, 2.2, { trim: 0x6a5a3a, shutters: false });
  // rooftop billboard aimed BACK across the street, so it reads from the north
  const bankSign = T.plaque(9.0, 1.9, [
    { t: 'FIRST NATIONAL BANK OF NAPS', s: 0.44, c: '#f6ecd2', family: FONTS.SERIF },
    { t: 'your deposits are safe. your departure is not.', s: 0.24, c: '#e0c98a', weight: 'italic bold' },
  ], { bg: '#2f4a3a', border: '#f2c14e', border2: '#1f3428', borderW: 0.045 });
  for (const s of [-1, 1]) b.cyl(bnF.px(s * 3.6, -1.0), bnF.y + 6.9, bnF.pz(s * 3.6, -1.0), 0.16, 0.18, 1.6, 0x4a4238, { seg: 6, mat: 'metal', ao: 0 });
  b.box(bnF.px(0, -1.0), bnF.y + 8.2, bnF.pz(0, -1.0), 9.4, 2.1, 0.28, 0x2f4a3a, { ry: bnF.ry, ao: 0 });
  b.sign(bankSign, bnF.px(0, -1.16), bnF.y + 9.25, bnF.pz(0, -1.16), 9.0, 1.9, { ry: bnF.ry + Math.PI, glow: true });
  // rear elevation of the bank (its back is what the street sees)
  const bbf = frame(bnF.x, bnF.y, bnF.z, bnF.ry + Math.PI);
  for (let i = 0; i < 3; i++) windowUnit(b, bbf, -3.2 + i * 3.2, 4.2, 3.0, 1.5, 2.0, { trim: 0x6a5a3a, shutters: false, cushion: i === 1 });
  for (let i = 0; i < 3; i++) b.box(bbf.px(-3.2 + i * 3.2, 4.28), bnF.y + 0.6, bbf.pz(-3.2 + i * 3.2, 4.28), 1.3, 1.7, 0.2, 0x2a2620, { ry: bbf.ry, ao: 0 });
  for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) b.box(bbf.px(-3.2 + i * 3.2, 4.42), bnF.y + 0.7 + k * 0.32, bbf.pz(-3.2 + i * 3.2, 4.42), 1.15, 0.08, 0.12, 0x8e9a9e, { ry: bbf.ry, ao: 0, mat: 'metal' });
  b.box(bbf.px(0, 4.3), bnF.y, bbf.pz(0, 4.3), 12.0, 0.6, 0.5, PAL.stone, { ry: bbf.ry, ao: 0 });
  // rooftop: a cat has moved in
  b.box(bnF.px(2.6, 1.4), bnF.y + 6.5, bnF.pz(2.6, 1.4), 1.8, 0.3, 1.4, 0xb03a63, { ry: bnF.ry, ao: 0 });
  loafCat(b, bnF.px(2.6, 1.4), bnF.y + 6.8, bnF.pz(2.6, 1.4), 1.5, PAL.fur[2], { ry: bnF.ry + 0.7 });
  b.cyl(bnF.px(-3.0, 0.6), bnF.y + 6.5, bnF.pz(-3.0, 0.6), 0.9, 0.9, 1.5, 0x9aa6a8, { seg: 10, ao: 0 });
  T.colBox(bnF.x, bnF.z, 10.8, 8.8, bnF.ry);
  T.act('bank', bnF.px(0, 6.6), bnF.pz(0, 6.6), 'Bank of Naps', [
    'FIRST NATIONAL BANK OF NAPS. the vault door is ajar. inside there are cushions.',
    'the teller will happily change your money. into local money. which is only good here.',
    'the exchange rate is posted as "generous (one way)".',
  ], { r: 4.4, speaker: 'BANK' });

  // 9 · SIT & STAY FURNITURE
  shop(T, lot(T, 128.6, 1), {
    w: 7.2, d: 6.8, h: 8.6, wall: 0xdcc9a0, ghost: ['SIT &', 'STAY', 'CUSHIONS', 'mostly cushions'],
    roof: 0xe0a848, roofKind: 'tile', ridge: 0xa8742c, trim: 0x3a6a44, band: 0xf4e9d4, frontH: 4.2, wins: 2, gableFront: true, balcony: false,
    id: 'sitstay', label: 'Sit & Stay Furniture', act: [
      'SIT & STAY FURNITURE \u2014 mostly cushions. the shop is entirely cushions.',
      'there is one armchair, human-sized, in the window. the tag reads "RESERVED".',
      'you look at the tag. it has your measurements on it. they are correct.',
    ],
    sign: T.plaque(6.8, 1.1, [{ t: 'SIT & STAY', s: 0.46, c: '#f2f8ec' }, { t: 'FURNITURE — mostly cushions', s: 0.26, c: '#c8e4c0' }], { bg: '#3a6a44', border: '#f2c14e', borderW: 0.05 }),
    hang: T.plaque(1.8, 1.4, [{ t: 'STAY', s: 0.42, c: '#3a6a44' }], { bg: '#f2f8ec', border: '#3a6a44', borderW: 0.08, dpu: 120 }),
    stripe: T.stripe(['#3a6a44', '#f4e9d4'], 10), glow: true,
    goods: (bb, ff, lx, lz, y) => { for (let i = 0; i < 3; i++) { const p = ff.px(lx - 1.0 + i * 1.0, lz + 0.5), q = ff.pz(lx - 1.0 + i * 1.0, lz + 0.5); bb.box(p, y, q, 0.8, 0.28, 0.7, [0xe8514a, 0x3a6ea5, 0xf2c14e][i], { ry: ff.ry, ao: 0 }); } },
  });

  // 10 · MICE KRISPIES GROCER
  const gcF = lot(T, 137.4, 1);
  shop(T, gcF, {
    w: 7.6, d: 6.8, h: 8.8, wall: 0xd9694a, ghost: ['MICE', 'KRISPIES', 'OPEN ALWAYS', 'no closed side'],
    roof: 0x5d6b78, roofKind: 'slate', ridge: 0x434e58, trim: 0xc9702a, band: 0xfaf0dc, frontH: 4.2, wins: 2, balcony: false,
    id: 'grocer', label: 'Mice Krispies', act: [
      'OPEN ALWAYS. the sign has no hinge to flip. there is no CLOSED side.',
      'the grocer stocks everything you like. she did not ask. she watched.',
      'the tinned food aisle is nine metres long. every tin is fish. every label is happy.',
    ],
    sign: T.plaque(7.2, 1.1, [{ t: 'MICE KRISPIES', s: 0.5, c: '#fff4e2' }, { t: 'GROCER · open always', s: 0.26, c: '#ffdcb0' }], { bg: '#c9702a', border: '#fff4e2', borderW: 0.05 }),
    hang: T.plaque(1.8, 1.4, [{ t: 'GROCER', s: 0.26, c: '#c9702a' }, { t: 'OPEN', s: 0.3, c: '#3a6a44' }], { bg: '#fff4e2', border: '#c9702a', borderW: 0.08, dpu: 120 }),
    stripe: T.stripe(['#c9702a', '#fff0d8', '#3a6a44'], 9), glow: true,
    goods: (bb, ff, lx, lz, y) => { for (let i = 0; i < 6; i++) { const p = ff.px(lx - 1.4 + (i % 3) * 1.0, lz + 0.5), q = ff.pz(lx - 1.4 + (i % 3) * 1.0, lz + 0.5); bb.box(p, y + Math.floor(i / 3) * 0.45, q, 0.6, 0.42, 0.5, [0xe8514a, 0xf2c14e, 0x6ac9d8][i % 3], { ry: ff.ry, ao: 0 }); } },
  });
  for (let i = 0; i < 4; i++) crate(b, gcF.px(-3.4 + (i % 2) * 1.1, 4.6), gcF.y, gcF.pz(-3.4 + (i % 2) * 1.1, 4.6), 0.9 - (i > 1 ? 0.12 : 0), gcF.ry + i * 0.3);

  // ── lampposts, string lights, planters, vending machine, bus stop ─────────
  // ── STREET LIGHTING ───────────────────────────────────────────────────────
  // Two patterns, mixed, at IRREGULAR spacing, and every post stands in a gap
  // between two shopfronts rather than in the middle of somebody's awning.
  // A uniform row of one lamp design every 8.5 m reads as a prop grid.
  const lampSpec = [
    // 104.9, not 102.6: at 102.6 it stood on the Purrbucks doorstep
    { x: 104.9, side: -1, style: 'lantern', h: 5.7 },
    { x: 108.0, side: 1, style: 'globe', h: 5.0 },
    { x: 113.8, side: -1, style: 'globe', h: 5.2 },
    { x: 119.6, side: 1, style: 'lantern', h: 5.9 },
    { x: 125.4, side: -1, style: 'lantern', h: 5.4 },
    { x: 131.8, side: 1, style: 'globe', h: 5.0 },
    { x: 138.0, side: -1, style: 'lantern', h: 5.6 },
    { x: 144.2, side: -1, style: 'lantern', h: 5.8 },
  ];
  const lampPos = [];
  // 4.0 from the centreline, not 5.2: at 5.2 the post stood squarely under the
  // shop awning it was lighting and the fabric had a pole through it.
  const LAMP_OFF = 4.0;
  lampSpec.forEach((L, i) => {
    const sl = slopeAt(L.x), len = Math.hypot(1, sl);
    const lx = L.x + (sl / len) * LAMP_OFF * -L.side, lz = streetZ(L.x) + (-1 / len) * LAMP_OFF * -L.side;
    const gy = T.ground(lx, lz), ly = gy + 0.45;
    const face = Math.atan2(-(lx - L.x), -(lz - streetZ(L.x)));    // arms point across the road
    lamppost(b, lx, ly, lz, { style: L.style, h: L.h, arms: 1, ry: face, pool: 3.9, poolY: gy + 0.19, halo: 1.7 });
    lampPos.push([lx, ly + L.h + (L.style === 'globe' ? 0.2 : 0.4), lz]);
    // FOUR of the island's six PointLights live on these posts — the only real
    // warm pools on Main Street (the other two are in Purrliament Square).
    if (i === 1 || i === 3 || i === 4 || i === 5) T.light(lx, ly + L.h + 0.3, lz, 0xffb45c, 1.0, 26);
    T.col(lx, lz, 0.5);
  });
  // ── string lights zig-zagging over the street ─────────────────────────────
  // The cord is ONE catenary tube threaded through every bulb, not 26 loose
  // cylinders, and it casts no shadow: a 7 cm rope shadow across a lit street
  // is pure aliasing.
  const bulbCols = [0xcf8f30, 0xb8762a, 0xdca43e, 0xc1832c, 0xe0ab4c];
  // mobile tier: every span is authored into ONE shared part (cord + bulbs = 2
  // draw calls for the whole street instead of 2 per span); desktop unchanged
  const spanBuilds = T.mobile ? [] : null;
  for (let i = 0; i < lampPos.length - 1; i++) {
    const a = lampPos[i], c = lampPos[i + 1];
    const SAG = 1.7, NB = 11;
    const at2 = (t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - Math.sin(t * Math.PI) * SAG, a[2] + (c[2] - a[2]) * t];
    const buildSpan = (p) => {
      const cord = [];
      for (let k = 0; k <= 18; k++) cord.push(at2(k / 18));
      p.tube(cord, 0.05, 0x4a3f30, { rseg: 4, seg: 30 });
      for (let k = 1; k < NB; k++) {
        const q = at2(k / NB);
        p.sph(q[0], q[1], q[2], 0.085, 0x5a4a38, { seg: 5, rings: 3 });          // the clip on the cord
        p.cyl(q[0], q[1] - 0.2, q[2], 0.045, 0.05, 0.2, 0x3a3229, { seg: 5, ao: 0 });  // the flex
        p.sph(q[0], q[1] - 0.42, q[2], 0.25, bulbCols[k % bulbCols.length], { seg: 7, rings: 5, mat: 'glow' });
      }
      // the halos live in the TOWN-wide additive pool, not in this part: a
      // per-span spill bucket is a third draw call for every span in the street,
      // and a soft blob does not need to sway with the cord.
      for (let k = 1; k < NB; k++) { const q = at2(k / NB); halo(b, q[0], q[1] - 0.42, q[2], 0.85); }
    };
    if (spanBuilds) {
      spanBuilds.push(buildSpan);
      for (const t of [0.3, 0.5, 0.7]) {
        const mx = a[0] + (c[0] - a[0]) * t, mz = a[2] + (c[2] - a[2]) * t;
        pool(b, mx, T.ground(mx, mz) + 0.2, mz, 3.4 - Math.abs(t - 0.5) * 4);
      }
      continue;
    }
    const span = T.part(buildSpan, 'lights' + i);
    span.userData.noShadow = true;
    // the pool the strung bulbs throw on the road below them
    for (const t of [0.3, 0.5, 0.7]) {
      const mx = a[0] + (c[0] - a[0]) * t, mz = a[2] + (c[2] - a[2]) * t;
      pool(b, mx, T.ground(mx, mz) + 0.2, mz, 3.4 - Math.abs(t - 0.5) * 4);
    }
    const base = [a[0] / 2 + c[0] / 2, 0, a[2] / 2 + c[2] / 2];
    const sway = ripple(span, (arr, bs, j, t) => {
      const u = (bs[j] - base[0]) * 0.35;
      arr[j + 1] = bs[j + 1] + Math.sin(t * 1.25 + u) * 0.17 + Math.sin(t * 2.4 + u * 1.7) * 0.05;
      arr[j] = bs[j] + Math.sin(t * 0.9 + u) * 0.05;
    });
    T.anim((t) => sway(t));
  }
  if (spanBuilds && spanBuilds.length) {
    const spans = T.part((p) => { for (const f of spanBuilds) f(p); }, 'lights');
    spans.userData.noShadow = true;
  }
  // ── planters, in CLUSTERS ─────────────────────────────────────────────────
  // Seven identical terracotta drums at 6.6 m centres is a metronome; four
  // groups of two or three, three pot patterns and four things growing in them
  // is a street where somebody waters the plants.
  const potGroups = [
    // two pots in front of the Fish Monger's window, not three across Purrbucks:
    // at 104.2 the first stood IN the Purrbucks doorway and the second, at 6.3,
    // half inside its facade over the HUMANS door
    { x: 107.64, side: -1, list: [[0, 0, 1.05, 5.3], [2, 1, 0.85, 5.1]] },
    { x: 113.0, side: 1, list: [[1, 2, 1.0, 5.5], [0, 0, 0.8, 6.2]] },
    { x: 121.4, side: -1, list: [[2, 1, 0.95, 5.2], [0, 3, 1.1, 6.0]] },
    { x: 134.6, side: 1, list: [[0, 0, 1.05, 5.3], [1, 1, 0.9, 6.1], [2, 0, 0.8, 5.0]] },
  ];
  potGroups.forEach((G, gi) => {
    const sl = slopeAt(G.x), len = Math.hypot(1, sl);
    const ax2 = 1 / len, az2 = sl / len;                 // unit vector ALONG the street
    G.list.forEach((it, i) => {
      const [pot, plant, rr, off] = it;
      const t = (i - (G.list.length - 1) / 2) * 2.3;
      const bx = G.x + ax2 * t, bz = streetZ(G.x) + az2 * t;
      const px = bx + (sl / len) * off * -G.side, pz = bz + (-1 / len) * off * -G.side;
      planter(b, px, T.ground(px, pz) + 0.45, pz, rr, { pot, plant, seed: gi * 3 + i, flowers: 5 });
      T.col(px, pz, rr + 0.1);
    });
  });
  bench(b, 106.0, T.ground(106, streetZ(106) + 5.6) + 0.45, streetZ(106) + 5.6, Math.PI, { len: 2.8 });
  // 123, not 128.6: at 128.6 this bench stood squarely across the Travel
  // Agency's front door and you physically could not get into the building
  bench(b, 123.0, T.ground(123.0, streetZ(123.0) - 5.6) + 0.45, streetZ(123.0) - 5.6, 0, { len: 2.8 });

  // vending machine: SNAX
  const vmX = 138.6, vmZ = streetZ(vmX) + 5.7, vmY = T.ground(vmX, vmZ) + 0.45;
  const vmCell = T.A.panel(1.5, 2.0, (g, W, H) => {
    g.fillStyle = '#141c1a'; g.fillRect(0, 0, W, H);
    const rows = [['TUNA', '#6ac9d8'], ['TUNA', '#6ac9d8'], ['TUNA', '#6ac9d8'], ['MILK', '#f6f2ea'], ['TUNA', '#6ac9d8'], ['—', '#5a5248']];
    rows.forEach((r, i) => {
      const y = H * (0.14 + i * 0.135);
      g.fillStyle = r[1]; g.fillRect(W * 0.08, y, W * 0.6, H * 0.1);
      g.fillStyle = '#141c1a'; g.font = `bold ${H * 0.07}px ${FONTS.SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(r[0], W * 0.38, y + H * 0.05);
      g.fillStyle = i === 5 ? '#ff6a5a' : '#8fe0a8'; g.font = `bold ${H * 0.055}px ${FONTS.MONO}`;
      g.fillText(i === 5 ? 'SOLD OUT' : 'A' + (i + 1), W * 0.84, y + H * 0.05);
    });
    g.fillStyle = '#ffcb4a'; g.font = `bold ${H * 0.08}px ${FONTS.SANS}`; g.textAlign = 'center';
    g.fillText('SNAX', W / 2, H * 0.06);
  }, 120);
  b.box(vmX, vmY, vmZ, 1.7, 2.5, 0.9, 0xc23a2a, { ry: Math.PI, ao: 0.5, aoBase: vmY });
  b.box(vmX, vmY + 2.5, vmZ, 1.9, 0.25, 1.05, 0x8e2a1e, { ry: Math.PI, ao: 0 });
  b.sign(vmCell, vmX, vmY + 1.35, vmZ - 0.47, 1.5, 2.0, { ry: Math.PI, glow: true });
  T.col(vmX, vmZ, 1.1);
  T.act('vending', vmX, vmZ - 1.6, 'SNAX machine', [
    'the machine sells: TUNA, TUNA, TUNA, MILK, TUNA, and one slot marked SOLD OUT.',
    'the SOLD OUT slot has a faded label. you can just read "TICKETS".',
    'you press a button. a tin of tuna drops. the machine says "enjoy your stay" in a small warm voice.',
  ], { r: 3.0, speaker: 'SNAX' });

  // bus stop with a timetable that has one entry
  const bsX = 110.5, bsZ = streetZ(bsX) - 5.9, bsY = T.ground(bsX, bsZ) + 0.45;
  for (const s of [-1, 1]) b.cyl(bsX + s * 1.5, bsY, bsZ + 0.5, 0.1, 0.12, 2.7, 0x3a4a4c, { seg: 6, mat: 'metal', ao: 0.4, aoBase: bsY });
  // canopy: teal shell + a proper striped skin and rafters so it isn't a slab
  b.box(bsX, bsY + 2.7, bsZ + 0.1, 3.8, 0.18, 2.0, 0x2f3f41, { rx: -0.12, ao: 0 });
  b.sign(T.stripe(['#2f6a6a', '#e8f0ec', '#3d8a86'], 9), bsX, bsY + 2.9, bsZ + 0.1, 3.7, 1.95, { rx: -Math.PI / 2 - 0.12 });
  for (let i = 0; i < 5; i++) b.cyl(bsX - 1.6 + i * 0.8, bsY + 2.66, bsZ + 0.1, 0.045, 0.045, 1.95, 0x22302f, { seg: 4, center: true, rx: Math.PI / 2 - 0.12, ao: 0 });
  b.box(bsX, bsY + 2.86, bsZ - 0.9, 4.0, 0.2, 0.34, 0x2f6a6a, { ao: 0 });           // front drip edge
  // back wall: a real glazed panel in a frame (lit from inside at night)
  b.box(bsX, bsY, bsZ - 0.75, 3.6, 2.8, 0.2, 0x2f3f41, { ao: 0.4, aoBase: bsY });
  b.quad(bsX, bsY + 1.6, bsZ - 0.63, 3.1, 1.9, 0x33505a, { mat: 'win' });
  b.box(bsX, bsY + 1.6, bsZ - 0.6, 0.1, 1.9, 0.06, 0x22302f, { ao: 0 });
  wash(b, bsX, bsY + 1.6, bsZ - 0.55, 4.6, 3.2, 0);
  bench(b, bsX, bsY, bsZ - 0.3, 0, { len: 2.4, color: 0x3a4a4c, legColor: 0x2a3436 });
  loafCat(b, bsX + 0.6, bsY + 0.66, bsZ - 0.3, 1.2, PAL.fur[4], { ry: 0.4 });
  const ttCell = T.plaque(1.2, 1.8, [
    { t: 'FERRY', s: 0.18, c: '#f4ecd8' }, { t: 'ARRIVES', s: 0.14, c: '#8fe0a8' }, { t: 'often', s: 0.16, c: '#f4ecd8' },
    { t: 'DEPARTS', s: 0.14, c: '#ff9a8a' }, { t: '—', s: 0.2, c: '#ff6a5a' },
  ], { bg: '#20302e', border: '#5a6a68', borderW: 0.05, dpu: 140 });
  b.sign(ttCell, bsX + 1.5, bsY + 1.7, bsZ - 0.4, 1.2, 1.8, { ry: Math.PI / 2 });
  T.col(bsX, bsZ, 1.4);

  T.act('street', 120, streetZ(120) + 2.4, 'Main Street', [
    'every shop is open. every shop has been open for a very long time.',
    'the string lights come on at dusk without anyone touching a switch.',
    'a cat waves at you from a window sill. then another. then eleven more.',
  ], { r: 4.0, speaker: 'MAIN STREET' });
}

// ─────────────────────────────────────────────────────────────────────────────
/** A decorative band wrapped round a building: four slabs, holes where asked.
 *  Returns its pieces ({ x, z, w, d, ry, face }) so a caller can make them solid. */
function ringBand(b, f, w, d, y, h, color, gaps = [], th = 0.5) {
  const { ry } = f;
  const faces = [[w, d / 2, 0], [d, w / 2, Math.PI / 2], [w, d / 2, Math.PI], [d, w / 2, -Math.PI / 2]];
  const pieces = [];
  faces.forEach(([len, off, rot], i) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (a, out) => [a * c + out * s, -a * s + out * c];
    const put = (a0, a1) => {
      if (a1 - a0 < 0.05) return;
      const p = P((a0 + a1) / 2, off - th / 2);
      b.box(f.px(p[0], p[1]), f.y + y, f.pz(p[0], p[1]), a1 - a0, h, th, color, { ry: ry + rot, ao: 0 });
      pieces.push({ x: f.px(p[0], p[1]), z: f.pz(p[0], p[1]), w: a1 - a0, d: th, ry: ry + rot, face: i });
    };
    let cur = -len / 2;
    for (const g of gaps.filter((g2) => (g2.face ?? 0) === i).sort((m, n) => m.lx - n.lx)) { put(cur, g.lx - g.w / 2); cur = g.lx + g.w / 2; }
    put(cur, len / 2);
  });
  return pieces;
}

export function buildMeowDonalds(T) {
  const b = T.b, A = T.A;
  const CX = 128, CZ = -24, GY = T.ground(CX, CZ);
  const MDR = 0xd52b1e, MDY = 0xffc72c;

  // forecourt: flagstones laid flat at the centre's height, which stand ~0.3
  // over the dip in front of the door — walkable (T.paved), not a slab to wade in
  const court = T.paved('cat_meow_forecourt', [], [paving(b, CX, GY + 0.1, CZ, 17, { seg: 26, rings: 0, color: 0xb4a78e, border: 0x9a8c74, depth: 2.4 })]);
  // ── the forecourt's raised rim (Contract O): laid flat at the centre's
  //    height, its west and south-west edge stands 1.2–1.9 over the hillside
  //    it was cut into. A red-and-yellow tube rail (the drive-thru's colours)
  //    along it, on the paving just inside the kerb, with solid colliders —
  //    except where the PLAYPLACE stands across the rim (198°–236°: the slide,
  //    the scratching post's base and the ball pit's rim run in under it —
  //    the way down into the playground, left open). The path in (113°) and
  //    out (−70°) cross the rim well clear of both runs.
  {
    const RR = 16.45, deckY = (x, z) => { const y = court(x, z); return y == null ? GY + 0.2 : y; };
    const style = tubeStyle({ foot: (x, z) => deckY(x, z) });
    for (const [d0, d1, edge] of [[144, 198, 'west rim'], [236, 266, 'south-west rim']]) {
      const pts = arcPts(CX, CZ, RR, (d0 * Math.PI) / 180, (d1 * Math.PI) / 180, (a) => deckY(CX + Math.cos(a) * RR, CZ + Math.sin(a) * RR));
      catRail(T.ctx, b, pts, { site: 'cat_meow_forecourt', edge, out: 1, style, mid: true, force: true, claim: T });
    }
  }

  // ── restaurant — ENTERABLE: the shell is hollow and fades while you eat ────
  const sb = T.shell('meow');
  const f = frame(CX + 1, GY + 0.1, CZ - 3.4, 0);
  const MW = 17.0, MD = 11.0, MH = 5.4, MDT = 0.5, mdDX = -3.2, mdGap = 2.4;
  const mdY = T.padY(f.x, f.z, MW - MDT * 2, MD - MDT * 2, 0) + 0.16;
  const mdSegs = roomShell(sb, f, MW, MH, MD, 0xf6ead2, {
    t: MDT, sink: 0.9, ceil: 4.5, ceilColor: 0xe8dcc0, floorColor: 0xd2bf9e, floorInto: T.b, floorTop: mdY,
    gaps: [{ face: 0, lx: mdDX, w: mdGap, h: 3.25 }, { face: 1, lx: 0, w: 2.2, h: 3.5, y0: 1.55 }],
  });
  // the little HUMANS door stands in the next bay, clear of the doorway's
  // dressing and the red pilaster between them, on the red plinth band (which
  // is cut for it: it used to hide the bottom 1.5 m of the door behind it).
  // MDCW: the doorway's casing, 0.2 so its lintel fits between the pilasters.
  const MDCW = 0.2, mdHX = mdDX - 2.37;
  const mdBand = ringBand(sb, f, 17.3, 11.3, 0, 1.5, MDR, [{ face: 0, lx: mdDX, w: mdGap }, { face: 0, lx: mdHX, w: 1.1 }]);
  // The red plinth band stands 0.15 proud of the walls, 0.1 past their
  // colliders, at the visitor's waist (and the pilasters, the sill rail and
  // the glass stand on it): it is SOLID, with the doorway's own edges. Not on
  // the drive-thru side (face 1), whose hatch sill stays vaultable.
  for (const q of mdBand) if (q.face !== 1) T.wall(q.x, q.z, q.w, q.d, q.ry);
  ringBand(sb, f, 17.5, 11.5, 4.4, 1.2, MDR);
  sb.box(f.x, f.y + 5.6, f.z, 18.0, 0.4, 12.0, MDY, { ao: 0 });
  flatRoof(sb, f, 17.0, 11.0, 0xe8dcc0, { top: 5.6, parapet: 0.72, capColor: 0xd52b1e });
  // ── the roof is a SURFACE, not a blank yellow lid ─────────────────────────
  // From the iso camera you spend as long looking at this roof as at the
  // building, so it gets a felted deck, a walkway, extract plant and a red
  // perimeter band — the things a fast-food roof actually has.
  const felt = A.panel(8, 5.5, (g, W, H) => {
    g.fillStyle = '#8d8472'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {                    // felt rolls, lapped
      g.fillStyle = i % 2 ? '#968c79' : '#847b6a';
      g.fillRect(0, H * i / 7, W, H / 7 + 1);
      g.strokeStyle = 'rgba(52,46,38,.45)'; g.lineWidth = H * 0.008;
      g.beginPath(); g.moveTo(0, H * i / 7); g.lineTo(W, H * i / 7); g.stroke();
    }
    g.globalAlpha = 0.16; g.fillStyle = '#3c3428';   // ponding + grime
    for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(W * (0.1 + (i * 0.13) % 0.85), H * (0.15 + (i * 0.21) % 0.7), W * 0.06, H * 0.05, i, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  }, 34);
  sb.signFlat(felt, f.x, f.y + 6.06, f.z, 16.4, 10.4, {});
  for (let i = 0; i < 3; i++) {                       // AC plant on bearers
    const px2 = -5.2 + i * 4.6;
    sb.box(f.px(px2, -2.6), f.y + 6.08, f.pz(px2, -2.6), 2.0, 0.18, 1.7, 0x6f6a5c, { ao: 0 });
    sb.box(f.px(px2, -2.6), f.y + 6.26, f.pz(px2, -2.6), 1.7, 0.95, 1.4, 0xb9c3c8, { ao: 0, mat: 'metal' });
    sb.cyl(f.px(px2, -2.6), f.y + 7.21, f.pz(px2, -2.6), 0.55, 0.55, 0.14, 0x6f8590, { seg: 10, ao: 0 });
    for (let k = 0; k < 4; k++) sb.box(f.px(px2, -2.6), f.y + 7.3, f.pz(px2, -2.6), 0.9, 0.06, 0.2, 0x8fa0a8, { ry: k * 0.78, ao: 0, mat: 'metal' });
  }
  sb.cyl(f.px(6.2, 1.4), f.y + 6.06, f.pz(6.2, 1.4), 0.62, 0.7, 1.5, 0x9aa6a8, { seg: 10, ao: 0 });   // extract stack
  sb.cyl(f.px(6.2, 1.4), f.y + 7.56, f.pz(6.2, 1.4), 0.86, 0.66, 0.4, 0x7d8a8c, { seg: 10, ao: 0 });
  for (let i = 0; i < 9; i++) sb.box(f.px(-7.0 + i * 1.75, 3.4), f.y + 6.08, f.pz(-7.0 + i * 1.75, 3.4), 1.3, 0.1, 0.85, 0x9c968a, { ao: 0 });  // duckboard walkway
  sb.box(f.x, f.y + 6.18, f.z, 17.5, 0.24, 11.5, MDR, { ao: 0, sy: 1 });    // red perimeter band under the parapet
  // glass frontage (the bay where the door is becomes the door)
  for (let i = 0; i < 5; i++) {
    const lx = -6.4 + i * 3.2;
    if (lx !== mdDX) {
      // the bay beside the HUMANS door gives up the metre of glass behind it
      const g0 = lx - 1.35, g1 = (lx < mdDX && lx + 1.35 > mdHX - 0.68) ? mdHX - 0.68 : lx + 1.35;
      sb.quad(f.px((g0 + g1) / 2, 5.56), f.y + 2.9, f.pz((g0 + g1) / 2, 5.56), g1 - g0, 2.7, 0x2b4450, { mat: 'win' });
      wash(b, f.px(lx, 5.72), f.y + 2.9, f.pz(lx, 5.72), 3.9, 4.4, 0);
    }
    sb.box(f.px(lx + 1.6, 5.5), f.y + 1.4, f.pz(lx + 1.6, 5.5), 0.28, 3.2, 0.24, MDR, { ao: 0 });
    pool(b, f.px(lx, 8.2), f.y + 0.22, f.pz(lx, 8.2), 2.6);
  }
  // the red sill rail under the glass, stopped either side of the two doors
  // (it ran straight across the doorway at knee height)
  {
    const cuts = [[mdHX - 0.55, mdHX + 0.55], [mdDX - mdGap / 2 - MDCW, mdDX + mdGap / 2 + MDCW]];
    let cur = -8.6;
    for (const [a, c] of cuts) { if (a - cur > 0.05) sb.box(f.px((cur + a) / 2, 5.5), f.y + 1.4, f.pz((cur + a) / 2, 5.5), a - cur, 0.2, 0.3, MDR, { ao: 0 }); cur = c; }
    sb.box(f.px((cur + 8.6) / 2, 5.5), f.y + 1.4, f.pz((cur + 8.6) / 2, 5.5), 8.6 - cur, 0.2, 0.3, MDR, { ao: 0 });
  }
  // the doorway in yellow: a casing, a lintel, and in the transom over it two
  // little golden arches on dark glass, lit from inside after dark
  doorUnit(sb, f, mdDX, 5.52, { w: 2.2, h: 3.2, color: MDR, surround: MDY, casing: MDY, casingW: MDCW, headOver: 0, head: 'transom', transomH: 0.62, arches: MDY, humanSide: -1, humanAt: mdHX, humanSignCell: T.humansLabel(), leaf: false, recess: false, mat: false, clear: mdGap, clearH: 3.25, sill: mdY });
  // roof sign: BILLIONS SERVED (mice)
  const billions = T.plaque(11.0, 2.0, [
    { t: 'BILLIONS SERVED', s: 0.52, c: '#fff6dd', outline: '#7a1008' },
    { t: '(mice)', s: 0.3, c: '#ffe08a', weight: 'italic bold' },
  ], { bg: '#d52b1e', border: '#ffc72c', border2: '#a01c12', borderW: 0.05 });
  // A proper hoarding: braced lattice legs, a framed board with a top rail and a
  // maintenance walkway. On two bare poles it read as a sticker in the sky.
  billboard(sb, f, 0, 4.0, f.y + 6.1, 11.2, 2.2, billions, {
    legH: 1.5, face: MDR, trimColor: MDY, color: 0x7a6a52, glow: true,
  });
  T.solidify(mdSegs, f.y + MH);
  T.claimRing(f.x, f.z, 17.4, 11.4, 0);
  T.stoop(f, mdDX, MD / 2, 3.2, mdY, { wall: MDT, gap: mdGap, front: 0.15, floor: court });
  const mdRoom = T.room({ id: 'meow', x: f.x, z: f.z, w: MW - MDT * 2, d: MD - MDT * 2, rot: 0, y: f.y, floorY: mdY, h: 4.5, label: "Meow Donald's" });
  // a fast-food door: all glass above a red kick panel, in a yellow frame,
  // hung on the right so it swings in clear of the corner booth
  T.door({
    id: 'meow', room: mdRoom, y: f.y, ry: 0, w: mdGap, color: MDY, field: MDR, trim: MDY, flap: 0xfff6dd,
    style: 'glazed', glassMat: 'win', glassFrom: 0.5, hinge: 1,
    x: f.px(mdDX, MD / 2 + 0.4), z: f.pz(mdDX, MD / 2 + 0.4), inset: 0.4 + MDT, sill: mdY, top: f.y + 3.25,
    say: 'a cat in a paper hat holds the door for you. "in?" she says. "in," you agree.', speaker: "MEOW DONALD'S",
  });
  T.roomDetail('meow', () => meowInterior(T, frame(f.x, mdY, f.z, 0), { hw: (MW - MDT * 2) / 2, hd: (MD - MDT * 2) / 2 }));

  // ── THE ARCHES (they are ears, and they are REAL arches) ──────────────────
  // They used to be two solid cones, which read as a pair of yellow teeth. Now
  // each ear is a true arch — two legs, a half-round head and a hole you can
  // see the sky through — with the pink inner ear set back inside it.
  const px = CX - 11.5, pz = CZ + 5.5, py = T.ground(px, pz);
  b.box(px, py, pz, 2.6, 1.0, 2.6, 0xb4a78e, { ao: 0 });
  b.cyl(px, py + 0.8, pz, 0.55, 0.75, 9.0, 0xe8dcc0, { seg: 10, ao: 0.5, aoBase: py });
  b.cyl(px, py + 9.4, pz, 1.3, 1.0, 0.5, MDR, { seg: 10, ao: 0 });
  for (const s of [-1, 1]) {
    const ax = px + s * 2.05;
    for (const t of [-1, 1]) b.cyl(ax + t * 1.55, py + 9.9, pz, 0.4, 0.46, 2.3, MDY, { seg: 8, mat: 'metal', ao: 0 });
    b.torus(ax, py + 12.2, pz, 1.55, 0.42, MDY, { seg: 18, tseg: 6, arc: Math.PI, mat: 'metal' });
    b.torus(ax, py + 12.18, pz, 1.12, 0.2, 0xff9ab0, { seg: 14, tseg: 5, arc: Math.PI, mat: 'metal', sz: 0.55 });
    for (const t of [-1, 1]) b.cyl(ax + t * 1.12, py + 10.6, pz, 0.17, 0.19, 1.6, 0xff9ab0, { seg: 6, mat: 'metal', ao: 0, sz: 0.55 });
    b.cone(ax, py + 13.6, pz, 0.66, 1.5, MDY, { seg: 8, mat: 'metal', rz: -s * 0.14 });
  }
  b.box(px, py + 9.4, pz, 5.6, 0.8, 1.9, MDY, { ao: 0, mat: 'metal' });
  const mdName = T.plaque(5.6, 1.6, [{ t: "MEOW DONALD'S", s: 0.6, c: '#ffe08a', outline: '#7a1008' }], { bg: '#d52b1e', border: '#ffc72c', borderW: 0.06 });
  for (const s of [-1, 1]) {
    b.box(px, py + 5.4, pz + s * 0.18, 5.9, 1.8, 0.2, MDR, { ao: 0 });
    b.sign(mdName, px, py + 6.3, pz + s * 0.3, 5.6, 1.6, { ry: s > 0 ? 0 : Math.PI, glow: true });
  }
  T.col(px, pz, 1.6);
  // no PointLight here: all six of the island's budget are on Main Street and
  // in the Square. The ears carry emissive halos + a pool instead.
  for (const s of [-1, 1]) halo(b, px + s * 1.85, py + 12.4, pz, 2.4);
  pool(b, px, py + 0.24, pz, 7.0);
  wash(b, px, py + 6.3, pz + 0.44, 7.4, 3.2, 0);
  T.act('meow', px + 1.0, pz + 2.8, "Meow Donald's", [
    "the golden arches are ears. they have always been ears. the ears are load-bearing.",
    'BILLIONS SERVED (mice). a smaller line underneath adds "0 humans served. you are guests."',
    'the drive-thru menu is nine inches off the ground. you have to lie down to read it. a cat holds the door for you afterwards.',
  ], { r: 5.0, speaker: "MEOW DONALD'S" });

  // ── DRIVE-THRU (for cats) ─────────────────────────────────────────────────
  const dx = CX + 12.4;
  ribbon(b, [[dx - 1, CZ + 9], [dx, CZ + 2], [dx - 0.5, CZ - 6], [dx - 4, CZ - 11]], 4.2, (x, z) => T.ground(x, z), 0x9c9078, { th: 0.3, lift: 0.1, kerb: true, kerbColor: MDY, seg: 3 });
  const menuCell = A.panel(2.6, 1.7, (g, W, H) => {
    g.fillStyle = '#1a1410'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ffc72c'; g.lineWidth = W * 0.02; g.strokeRect(W * 0.015, H * 0.02, W * 0.97, H * 0.96);
    g.fillStyle = '#ffc72c'; g.font = `bold ${H * 0.14}px ${FONTS.SANS}`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('MENU', W * 0.05, H * 0.04);
    const items = [['McMouse', '1 nap'], ['Filet-o-Fish', '2 naps'], ['Chicken McNuggets', 'ask'], ['Human Meal', 'n/a'], ['Milkshake', 'milk']];
    items.forEach((it, i) => {
      const y = H * (0.24 + i * 0.15);
      g.font = `bold ${H * 0.1}px ${FONTS.SANS}`; g.fillStyle = i === 3 ? '#8a7a6a' : '#f6ead2';
      g.fillText(it[0], W * 0.05, y);
      g.textAlign = 'right'; g.fillStyle = i === 3 ? '#8a7a6a' : '#ffc72c'; g.fillText(it[1], W * 0.95, y); g.textAlign = 'left';
    });
  }, 130);
  const mY = T.ground(dx + 3.2, CZ + 1);
  b.box(dx + 3.2, mY, CZ + 1, 0.5, 0.5, 0.5, 0x6a5a4a, { ao: 0 });
  b.box(dx + 3.2, mY + 0.4, CZ + 1, 3.0, 1.9, 0.32, 0x2a2018, { ry: -Math.PI / 2, ao: 0 });
  b.sign(menuCell, dx + 3.0, mY + 1.35, CZ + 1, 2.6, 1.7, { ry: -Math.PI / 2, glow: true });
  b.box(dx + 3.2, mY + 0.4, CZ + 3.4, 0.7, 1.2, 0.6, 0x3a3229, { ao: 0 });                 // speaker box
  b.cyl(dx + 3.0, mY + 1.1, CZ + 3.4, 0.24, 0.24, 0.12, 0x1a1410, { seg: 8, ry: -Math.PI / 2, rz: Math.PI / 2, ao: 0 });
  // pickup window — a real hatch through the wall, framed, with the shutter up
  b.box(f.px(8.62, 0), f.y + 1.4, f.pz(8.62, 0), 0.34, 0.28, 2.5, MDY, { ao: 0 });        // sill
  b.box(f.px(8.62, 0), f.y + 3.5, f.pz(8.62, 0), 0.34, 0.3, 2.5, MDY, { ao: 0 });         // head
  for (const s of [-1, 1]) b.box(f.px(8.62, s * 1.2), f.y + 1.5, f.pz(8.62, s * 1.2), 0.34, 2.1, 0.3, MDY, { ao: 0 });
  b.box(f.px(8.66, 0), f.y + 3.62, f.pz(8.66, 0), 0.42, 0.5, 2.3, 0xb9c3c8, { ao: 0, mat: 'metal' });  // rolled shutter
  wash(b, f.px(8.9, 0), f.y + 2.5, f.pz(8.9, 0), 3.4, 3.0, Math.PI / 2);
  pool(b, f.px(10.6, 0), f.y + 0.22, f.pz(10.6, 0), 2.4);
  const dtCell = T.plaque(2.4, 0.6, [{ t: 'DRIVE-THRU', s: 0.66, c: '#fff6dd' }], { bg: '#d52b1e', border: '#ffc72c', borderW: 0.07, dpu: 150 });
  b.sign(dtCell, f.px(8.74, 0), f.y + 3.8, f.pz(8.74, 0), 2.4, 0.6, { ry: Math.PI / 2, glow: true });

  // ── PLAYGROUND with a giant scratching post ───────────────────────────────
  const gx = CX - 12.5, gz = CZ - 9.5, gy = T.ground(gx, gz);
  b.cyl(gx, gy, gz, 5.4, 5.6, 0.35, 0xd8a86a, { seg: 16, ao: 0 });
  // scratching post: carpeted base, sisal column, platform
  b.cyl(gx, gy + 0.3, gz, 2.6, 2.9, 0.7, 0x9a5a3a, { seg: 12, ao: 0 });
  b.cyl(gx, gy + 1.0, gz, 1.05, 1.15, 7.4, 0xd9b483, { seg: 12, ao: 0.4, aoBase: gy });
  for (let i = 0; i < 10; i++) b.torus(gx, gy + 1.35 + i * 0.72, gz, 1.15 - i * 0.01, 0.14, i % 2 ? 0xc9a271 : 0xe0c093, { rx: -Math.PI / 2, seg: 10, tseg: 3 });
  b.cyl(gx, gy + 8.4, gz, 2.4, 2.4, 0.45, 0xb03a63, { seg: 12, ao: 0 });
  sittingCat(b, gx + 0.4, gy + 8.85, gz + 0.3, 1.9, PAL.fur[2], { ry: 2.2, seg: 9, rings: 6 });
  b.cyl(gx + 2.1, gy + 4.6, gz + 1.4, 1.6, 1.6, 0.35, 0x3a6ea5, { seg: 10, ao: 0 });
  b.cyl(gx + 2.1, gy + 4.95, gz + 1.4, 0.5, 0.55, 3.5, 0xd9b483, { seg: 8, ao: 0 });
  T.col(gx, gz, 3.0);
  // ball pit
  b.cyl(gx + 6.2, gy, gz - 2.6, 2.9, 3.0, 0.8, MDY, { seg: 14, ao: 0 });
  b.cyl(gx + 6.2, gy + 0.5, gz - 2.6, 2.6, 2.6, 0.4, 0xe8dcc0, { seg: 14, ao: 0 });
  const rnd = T.rnd;
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 2.3;
    b.sph(gx + 6.2 + Math.cos(a) * rr, gy + 1.0 + (i % 3) * 0.12, gz - 2.6 + Math.sin(a) * rr, 0.36, [0xe8514a, 0x3a6ea5, 0xffc72c, 0x4f8a5b, 0xf06aa0][i % 5], { seg: 7, rings: 4 });
  }
  T.col(gx + 6.2, gz - 2.6, 3.1);
  // slide
  b.cyl(gx - 4.2, gy, gz + 3.0, 0.24, 0.28, 3.6, MDR, { seg: 8, ao: 0.4, aoBase: gy });
  b.box(gx - 4.2, gy + 3.6, gz + 3.0, 1.6, 0.2, 1.6, MDY, { ao: 0 });
  b.wedge(gx - 2.5, gy + 0.1, gz + 3.0, 3.6, 3.5, 1.3, 0x3a6ea5, { ry: Math.PI, ao: 0 });
  const pgCell = T.plaque(3.4, 0.8, [{ t: 'PLAYPLACE', s: 0.5, c: '#7a1008' }, { t: 'all ages. all durations.', s: 0.24, c: '#a03020', weight: 'italic bold' }], { bg: '#ffc72c', border: '#d52b1e', borderW: 0.06, dpu: 130 });
  b.cyl(gx + 3.4, gy, gz + 4.6, 0.12, 0.14, 2.6, 0x6a5a4a, { seg: 6, ao: 0 });
  b.sign(pgCell, gx + 3.4, gy + 3.0, gz + 4.72, 3.4, 0.8, {});

  // parking spaces, cat-sized
  for (let i = 0; i < 5; i++) {
    const sx = CX - 6 + i * 3.0, sz = CZ + 11.5, sy = T.ground(sx, sz) + 0.22;
    b.box(sx - 1.3, sy, sz, 0.14, 0.06, 3.2, 0xf0e6cd, { ao: 0 });
    if (i === 4) b.box(sx + 1.3, sy, sz, 0.14, 0.06, 3.2, 0xf0e6cd, { ao: 0 });
  }
}
