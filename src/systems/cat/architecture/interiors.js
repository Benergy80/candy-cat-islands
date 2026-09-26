// ─────────────────────────────────────────────────────────────────────────────
// INTERIORS — the six rooms of Cat Island you can actually walk into.
//
// Everything here is authored in the HOST BUILDING'S LOCAL FRAME (lx along the
// facade, lz out of it, ly above the floor) and goes into the town kit, NOT
// into the building's shell — the shell fades away while you are inside, the
// room must not. Furniture registers oriented-box colliders as it is built.
//
//   meow        Meow Donald's      counter, fryers, McMICE board, booths,
//                                  drive-thru hatch, a cat in a paper hat
//   purrbucks   Purrbucks          espresso machine, mug wall, chalkboard,
//                                  two armchairs, a barista who knows your name
//   travel      Travel Agency      dusty desk, DO NOT posters, a globe with the
//                                  sea painted out, the tin of paint that did it
//   purrliament Purrliament        benches, throne + cushion, portraits of nine
//                                  mayors, the order paper: MOTIONS: nap
//   guest       The Guest House    the bed containment tucks you into, and a
//                                  wardrobe of pyjamas in exactly your size
//   watch       Watchtower base    spiral stair, keeper's desk, maintenance log
// ─────────────────────────────────────────────────────────────────────────────
import { PAL, sittingCat, loafCat } from './parts.js';
import { FONTS, catFace } from './signs.js';

/**
 * The watchtower's spiral stair, described once so outskirts.js can turn the
 * same helix into a walkable surface. Tread i sits at angle a0 + i·da, height
 * y0 + i·dy above the ground floor, centred at radius r; `land` is the extra
 * arc of flat landing past the last tread.
 */
export const TOWER_STAIR = { n: 11, a0: -0.5, da: 0.52, y0: 0.2, dy: 0.42, r: 1.42, rIn: 0.46, rOut: 2.4, tread: 0.16, land: 0.66 };

/** A tiny authoring frame: local (lx, ly, lz) → world, plus colliders. */
export function inRoom(T, f) {
  const b = T.b, ry0 = f.ry;
  const W = (lx, lz) => [f.px(lx, lz), f.pz(lx, lz)];
  return {
    f, b,
    box(lx, ly, lz, w, h, d, c, o = {}) { const p = W(lx, lz); b.box(p[0], f.y + ly, p[1], w, h, d, c, { ao: 0, ...o, ry: ry0 + (o.ry || 0) }); return p; },
    cyl(lx, ly, lz, rt, rb, h, c, o = {}) { const p = W(lx, lz); b.cyl(p[0], f.y + ly, p[1], rt, rb, h, c, { ao: 0, seg: 9, ...o, ry: ry0 + (o.ry || 0) }); return p; },
    sph(lx, ly, lz, r, c, o = {}) { const p = W(lx, lz); b.sph(p[0], f.y + ly, p[1], r, c, { seg: 8, rings: 5, ...o, ry: ry0 + (o.ry || 0) }); return p; },
    tor(lx, ly, lz, r, tube, c, o = {}) { const p = W(lx, lz); b.torus(p[0], f.y + ly, p[1], r, tube, c, { seg: 10, tseg: 4, ...o, ry: ry0 + (o.ry || 0) }); return p; },
    cone(lx, ly, lz, r, h, c, o = {}) { const p = W(lx, lz); b.cone(p[0], f.y + ly, p[1], r, h, c, { seg: 8, ao: 0, ...o, ry: ry0 + (o.ry || 0) }); return p; },
    sign(cell, lx, ly, lz, w, h, o = {}) { const p = W(lx, lz); b.sign(cell, p[0], f.y + ly, p[1], w, h, { ...o, ry: ry0 + (o.ry || 0) }); },
    flat(cell, lx, ly, lz, w, d, o = {}) { const p = W(lx, lz); b.signFlat(cell, p[0], f.y + ly, p[1], w, d, { ...o, ry: ry0 + (o.ry || 0) }); },
    cat(lx, ly, lz, H, color, o = {}) { const p = W(lx, lz); sittingCat(b, p[0], f.y + ly, p[1], H, color, { seg: 9, rings: 6, ...o, ry: ry0 + (o.ry || 0) }); return p; },
    loaf(lx, ly, lz, L, color, o = {}) { const p = W(lx, lz); loafCat(b, p[0], f.y + ly, p[1], L, color, { ...o, ry: ry0 + (o.ry || 0) }); return p; },
    /** A ceiling panel: a horizontal quad facing DOWN. Single-sided, so the iso
     *  camera looking into the room from above passes straight through it while
     *  a visitor standing in the room has a lid over his head. */
    lid(lx, ly, lz, w, d, c, o = {}) { const p = W(lx, lz); b.hquad(p[0], f.y + ly, p[1], w, d, c, { ...o, rx: Math.PI + (o.rx || 0), ry: ry0 + (o.ry || 0) }); },
    /** a warm pool of light on the floor under a lamp (shared additive mesh:
     *  any number of these cost nothing, and nothing at all in daylight) */
    pool(lx, ly, lz, r) { const p = W(lx, lz); T.pool(p[0], f.y + ly, p[1], r); },
    /** solid furniture: an oriented box the player cannot walk through */
    solid(lx, lz, w, d, top, rot = 0) { const p = W(lx, lz); T.wall(p[0], p[1], w, d, ry0 + rot, f.y + top); },
    /** a solid lining with no top (a wall's panelling: nothing to climb onto) */
    lining(lx, lz, w, d, rot = 0) { const p = W(lx, lz); T.wall(p[0], p[1], w, d, ry0 + rot); },
    world: W,
  };
}

/**
 * A framed picture hung flat on a wall. `rot` is the direction the picture
 * FACES (its normal is (sin rot, cos rot) in room-local x/z), so a picture on
 * the +x wall wants rot = -PI/2 — get the sign wrong and the canvas turns to
 * face the plaster and the room grows a blank wooden board.
 * (lx, lz) is the INNER FACE of the room's own wall (see wainscot: that is
 * ±(half extent − 0.16), not ±half extent — hang it on the shell's plane and the
 * canvas ends up behind the plaster). The frame's back touches it; the picture
 * sits proud of the frame, into the room.
 */
function framed(R, cell, lx, ly, lz, w, h, rot = 0, frameColor = 0x6a4a2a) {
  const nx = Math.sin(rot), nz = Math.cos(rot);
  R.box(lx + nx * 0.06, ly - h / 2, lz + nz * 0.06, w + 0.22, h + 0.22, 0.12, frameColor, { ry: rot });
  R.sign(cell, lx + nx * 0.13, ly, lz + nz * 0.13, w, h, { ry: rot });
}

/**
 * The room's LID, and the cornice where the walls meet it.
 *
 * A room the iso camera has to see into cannot have an opaque ceiling, so this
 * one is a single-sided plane facing down: from a visitor's eye it closes the
 * room, from the camera above it is backface-culled and costs nothing. What
 * actually stops the sky appearing over the far wall is the wall HEIGHT (see
 * wainscot's faceH) — the lid is what stops the room reading as a film set.
 */
function ceiling(R, hx, hz, ly, o = {}) {
  const col = o.color ?? 0xe8dcc0;
  R.lid(0, ly, 0, hx * 2 - 0.2, hz * 2 - 0.2, col);
  const t = o.t ?? 0.28;
  // the cornice ring: from above it hugs the wall heads (so it never stripes the
  // room), from inside it is the line the ceiling springs from
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    R.box(sx * (hx - t / 2), ly - 0.24, sz * (hz - t / 2), sx ? t : hx * 2, 0.24, sz ? t : hz * 2, o.capColor ?? col);
  }
  // two joists, tight to the far wall, so the lid has structure where it shows
  if (o.joists !== false) R.box(0, ly - 0.18, -hz + 0.8, hx * 2 - 0.5, 0.18, 0.22, o.joistColor ?? 0xb8a88c);
  // A COVE of warm light tucked under the cornice on the three tall faces. A
  // full-height inner wall takes only the hemisphere (the sun cannot reach it),
  // so without this the room's own back wall renders as a slab of grey.
  if (o.cove !== false) {
    const cc = o.coveColor ?? 0xffd79a;
    R.box(0, ly - 0.46, -hz + 0.38, hx * 2 - 1.0, 0.12, 0.16, cc, { mat: 'lamp' });
    for (const sx of [-1, 1]) R.box(sx * (hx - 0.38), ly - 0.46, 0, 0.16, 0.12, hz * 2 - 1.0, cc, { mat: 'lamp' });
    R.pool(0, 0.09, -hz * 0.55, Math.min(hx, hz) * 1.5);
  }
}

/**
 * The room's own inner walls. The shell vanishes while you are inside (four
 * ghost walls stacked into a haze read worse than none, and the iso camera
 * cannot fit inside a seven-metre shop), so this is what keeps the room reading
 * as a ROOM instead of furniture on a raft.
 *
 * The DOOR wall stays waist-high so the camera can see over it from the street;
 * `faceH` raises individual faces — always the wall a shelf, board or picture
 * hangs on, or it floats in mid-air the moment you step inside.
 *   o = { h, faceH: [f0,f1,f2,f3], color, capColor, gaps: [{ face, lx, w }] }
 *   faces: 0 = front (the door side, +lz), 1 = +lx, 2 = back, 3 = -lx
 */
// How much wider than its doorway a room's lining is cut: an open leaf rests
// on the hinge-side jamb line and leans back 10°, and within the lining's
// 0.38 depth its back face (and its hinge knuckles) reach C/2 + 0.2. Cut at
// C/2 + 0.15 the panelling's end stood a centimetre into the open leaf.
const LEAF_ROOM = 0.45;
function wainscot(R, hx, hz, o = {}) {
  const h0 = o.h ?? 0.95, c = o.color ?? 0x9a8a72;
  const t = 0.16;
  const faces = [
    { len: hx * 2, off: hz, rot: 0 }, { len: hz * 2, off: hx, rot: Math.PI / 2 },
    { len: hx * 2, off: hz, rot: Math.PI }, { len: hz * 2, off: hx, rot: -Math.PI / 2 },
  ];
  faces.forEach((fa, i) => {
    const h = (o.faceH && o.faceH[i] != null) ? o.faceH[i] : h0;
    if (h <= 0) return;
    const tall = h > h0 + 0.4;
    const cs = Math.cos(fa.rot), sn = Math.sin(fa.rot);
    const P = (a, out) => [a * cs + out * sn, -a * sn + out * cs];
    const mine = (o.gaps || []).filter((g) => (g.face ?? 0) === i).sort((a2, b2) => a2.lx - b2.lx);
    const half = fa.len / 2;
    let cur = -half;
    const put = (a0, a1) => {
      if (a1 - a0 < 0.1) return;
      const p = P((a0 + a1) / 2, fa.off - t / 2);
      R.box(p[0], 0, p[1], a1 - a0, h, t, tall ? (o.wallColor ?? 0xe8dcc0) : c, { ry: fa.rot });
      // …and the lining is SOLID, out to its rail (0.38 in on a tall face,
      // 0.34 on a dado-only one). The shell's wall collider stops 0.05 inside
      // the shell, so a visitor walking the room's edge had half his body in
      // the panelling. It stops where the lining does: at the doorway it is
      // cut wider than the gap, so it never narrows the way in.
      const dep = tall ? 0.38 : 0.34, q2 = P((a0 + a1) / 2, fa.off - dep / 2);
      R.lining(q2[0], q2[1], a1 - a0, dep, fa.rot);
      // a tall face keeps the dado: panelling below, plaster above, a rail between
      if (tall) {
        const d = P((a0 + a1) / 2, fa.off - t - 0.04);
        R.box(d[0], 0, d[1], a1 - a0, h0, t + 0.1, c, { ry: fa.rot });
        R.box(d[0], h0, d[1], a1 - a0, 0.1, t + 0.2, o.capColor ?? c, { ry: fa.rot });
      } else {
        const q = P((a0 + a1) / 2, fa.off - t - 0.03);
        R.box(q[0], h, q[1], a1 - a0, 0.1, t + 0.14, o.capColor ?? c, { ry: fa.rot });
      }
    };
    for (const g of mine) { put(cur, g.lx - g.w / 2); cur = g.lx + g.w / 2; }
    put(cur, half);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 · MEOW DONALD'S
// ═══════════════════════════════════════════════════════════════════════════
export function meowInterior(T, f, o = {}) {
  const R = inRoom(T, f);
  const MDR = 0xd52b1e, MDY = 0xffc72c, A = T.A;
  const hx = o.hw ?? 8.0, hz = o.hd ?? 5.0;          // interior half extents

  // chequer floor + a tiled skirting
  const tile = A.panel(4, 4, (g, W, H) => {
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
      g.fillStyle = (i + k) % 2 ? '#e4d7bd' : '#cbb392'; g.fillRect(i * W / 4, k * H / 4, W / 4 + 1, H / 4 + 1);
    }
    g.globalAlpha = 0.12; g.fillStyle = '#7a1008'; g.fillRect(0, 0, W, H);
  }, 26);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) R.flat(tile, -hx + 2 + i * 4, 0.03, -hz + 1.7 + k * 3.4, 4, 3.4);
  // Only the DOOR wall stays low. Every other face runs to the ceiling: at 1.15
  // and 2.3 the iso camera looked clean over the side walls and what it found
  // there was the sky, which is how a restaurant ends up with no back wall.
  wainscot(R, hx, hz, { h: 1.15, faceH: [1.15, 5.0, 5.0, 5.0], color: 0xe8dcc0, capColor: MDR, wallColor: 0xf6ead2, gaps: [{ face: 0, lx: -3.2, w: 2.4 + LEAF_ROOM }, { face: 1, lx: 0, w: 2.4 }] });
  ceiling(R, hx, hz, 5.1, { color: 0xf2e7cf, capColor: MDR, joistColor: 0xd8c9a8 });

  // ── service counter ───────────────────────────────────────────────────────
  R.box(-1.0, 0, -1.2, 11.0, 1.15, 1.0, 0xf2e5cc);
  R.box(-1.0, 1.15, -1.2, 11.4, 0.16, 1.3, MDR);
  R.box(-1.0, 0.1, -0.66, 11.0, 0.5, 0.1, MDY);
  R.solid(-1.0, -1.2, 11.4, 1.4, 1.35);
  for (let i = 0; i < 3; i++) {                       // tills
    R.box(-4.2 + i * 3.2, 1.31, -1.35, 0.8, 0.5, 0.6, 0x2f3a3c);
    R.box(-4.2 + i * 3.2, 1.62, -1.62, 0.7, 0.42, 0.1, 0x11181a, { rx: -0.3 });
  }
  // tray stack + straw bin + a bag of fries someone abandoned
  for (let i = 0; i < 5; i++) R.box(3.9, 1.33 + i * 0.06, -1.2, 1.0, 0.06, 0.8, [0x8a3a2a, 0xa8462f][i % 2]);
  R.cyl(2.6, 1.31, -1.3, 0.22, 0.22, 0.4, 0xe8dcc0);
  for (let i = 0; i < 5; i++) R.cyl(2.6 + (i % 3) * 0.05, 1.7, -1.3 + (i % 2) * 0.05, 0.03, 0.03, 0.5, [0xd52b1e, 0xffc72c][i % 2], { rz: 0.1 * i });

  // ── the McMICE menu board, lit, over the back wall ────────────────────────
  const menu = A.panel(9.0, 2.6, (g, W, H) => {
    g.fillStyle = '#1a1410'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ffc72c'; g.lineWidth = W * 0.008; g.strokeRect(W * 0.008, H * 0.012, W * 0.984, H * 0.976);
    g.fillStyle = '#ffc72c'; g.font = `bold ${H * 0.19}px ${FONTS.SANS}`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('McMICE', W * 0.03, H * 0.04);
    g.font = `italic bold ${H * 0.085}px ${FONTS.SANS}`; g.fillStyle = '#f6c9a0';
    g.fillText('“you’re staying, right?”', W * 0.03, H * 0.27);
    const cols = [
      [['McMOUSE', '1 nap'], ['DOUBLE McMOUSE', '2 naps'], ['FILET-O-FISH', 'no'], ['NUGGETS (9)', 'ask']],
      [['MILKSHAKE', 'milk'], ['MILK', 'milk'], ['WARM MILK', 'milk'], ['HUMAN MEAL', 'n/a']],
    ];
    cols.forEach((col, ci) => col.forEach((it, i) => {
      const y = H * (0.42 + i * 0.145), x = W * (0.03 + ci * 0.5);
      g.font = `bold ${H * 0.105}px ${FONTS.SANS}`;
      g.fillStyle = it[1] === 'n/a' ? '#8a7a6a' : '#f6ead2'; g.textAlign = 'left'; g.fillText(it[0], x, y);
      g.fillStyle = it[1] === 'n/a' ? '#8a7a6a' : '#ffc72c'; g.textAlign = 'right'; g.fillText(it[1], x + W * 0.44, y);
    }));
    // the little picture of a mouse burger
    g.fillStyle = '#d8a04a'; g.beginPath(); g.ellipse(W * 0.9, H * 0.22, W * 0.05, H * 0.07, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8a8a94'; g.fillRect(W * 0.85, H * 0.24, W * 0.1, H * 0.05);
  }, 62);
  // the board is hung ON the back wall (lz = -hz), not floating half a metre off it
  R.box(-1.0, 2.2, -hz + 0.11, 9.4, 2.9, 0.22, 0x241a12);
  R.sign(menu, -1.0, 3.6, -hz + 0.25, 9.0, 2.6, { glow: true });
  R.box(-1.0, 3.72, -hz + 0.55, 9.0, 0.1, 0.5, 0x3a3229);
  for (const s of [-1, 1]) R.sph(-1.0 + s * 3.4, 3.6, -hz + 0.6, 0.14, 0xffd79a, { mat: 'lamp', seg: 7, rings: 5 });

  // ── the kitchen line: fryers, shake machine, drinks tower ─────────────────
  // These used to be four grey boxes and a cylinder. A fryer is a stainless
  // cabinet with sunk VATS, wire baskets on hooks and a hood; a shake machine
  // has a head and a lever; a drinks tower has nozzles and buttons.
  R.box(-5.6, 0, -3.4, 4.6, 1.25, 1.4, 0xb9c3c8, { mat: 'metal' });
  R.box(-5.6, 1.25, -3.4, 4.75, 0.1, 1.5, 0x8e9aa0, { mat: 'metal' });            // splash deck
  for (let i = 0; i < 3; i++) {
    const lx = -7.1 + i * 1.5;
    R.box(lx, 1.26, -3.4, 1.24, 0.06, 1.04, 0x2a3033);                            // the sunk vat
    R.box(lx, 1.32, -3.4, 1.06, 0.2, 0.88, 0xd8a132);                             // hot oil
    R.box(lx, 1.42, -3.4, 1.0, 0.22, 0.8, 0xe8b03a);                              // the basket of chips
    for (const sx of [-1, 1]) R.box(lx + sx * 0.5, 1.42, -3.4, 0.05, 0.26, 0.82, 0x9aa6a8, { mat: 'metal' });
    R.cyl(lx, 1.66, -2.95, 0.035, 0.035, 0.62, 0x2f3a3c, { mat: 'metal', rz: -0.45 });  // basket handle
    R.sph(lx, 1.9, -2.72, 0.09, 0x2f3a3c, { seg: 6, rings: 4 });
    R.box(lx, 0.34, -2.72, 0.34, 0.08, 0.1, 0x6f7d82, { mat: 'metal' });          // vat drain tap
  }
  // extract hood over the line
  R.box(-5.6, 2.28, -3.5, 4.9, 0.42, 1.7, 0xc6d0d4, { mat: 'metal' });
  R.box(-5.6, 2.70, -3.5, 4.4, 0.5, 1.3, 0xa9b4b8, { mat: 'metal', sy: 1 });
  R.box(-5.6, 2.18, -3.9, 4.6, 0.14, 0.44, 0xffc27a, { mat: 'lamp' });            // heat lamp
  // the shake machine: body, dispensing head, lever, drip tray
  R.box(1.6, 1.31, -3.6, 1.15, 1.5, 0.95, 0xd8e2e6, { mat: 'metal' });
  R.box(1.6, 2.81, -3.6, 1.25, 0.16, 1.05, 0x8e9aa0, { mat: 'metal' });
  R.cyl(1.6, 2.97, -3.6, 0.3, 0.36, 0.42, 0xe8eef0, { mat: 'metal', seg: 10 });
  R.box(1.6, 1.72, -3.08, 0.5, 0.42, 0.16, 0x2f3a3c);                             // the head
  R.cyl(1.6, 1.6, -3.02, 0.07, 0.09, 0.2, 0x8e9aa0, { mat: 'metal' });            // nozzle
  R.cyl(1.6, 1.96, -3.06, 0.03, 0.03, 0.34, 0x9aa6a8, { mat: 'metal', rz: 0.5 });  // lever
  R.box(1.6, 1.36, -3.06, 0.56, 0.05, 0.26, 0x9aa6a8, { mat: 'metal' });          // drip tray
  R.box(1.6, 2.2, -3.14, 0.66, 0.3, 0.06, 0xd52b1e);
  // drinks tower, four nozzles and a button strip
  R.box(3.6, 1.31, -3.4, 1.5, 1.7, 0.7, 0x2f3a3c);
  R.box(3.6, 1.42, -3.02, 1.45, 0.5, 0.12, 0xb9c3c8, { mat: 'metal' });
  for (let i = 0; i < 4; i++) {
    R.cyl(3.0 + i * 0.4, 1.34, -3.0, 0.045, 0.055, 0.16, 0x9aa6a8, { mat: 'metal' });
    R.box(3.0 + i * 0.4, 1.96, -3.04, 0.24, 0.12, 0.08, [0xd52b1e, 0xffc72c, 0x6ac9d8, 0xf6f2ea][i]);
  }
  R.box(3.6, 1.28, -3.02, 1.3, 0.06, 0.3, 0x9aa6a8, { mat: 'metal' });

  // ── the cat in the paper hat (facing OVER the counter, at you) ────────────
  R.box(-2.4, 0, -2.5, 2.6, 0.45, 1.1, 0x8e9aa0, { mat: 'metal' });               // the duckboard she stands on
  R.cat(-2.4, 0.45, -2.5, 1.65, PAL.fur[0], { ry: 0, inner: 0xe8a0a8 });
  R.box(-2.4, 1.50, -2.44, 0.95, 0.7, 0.55, MDR);                                 // apron/tabard
  R.box(-2.4, 2.11, -2.5, 0.62, 0.34, 0.5, 0xfdf8ec);                             // paper hat
  R.box(-2.4, 2.43, -2.5, 0.66, 0.1, 0.54, 0xf2e9d4);
  const badge = T.plaque(0.6, 0.26, [{ t: 'TRAINEE', s: 0.7, c: '#fff4dc' }], { bg: '#d52b1e', border: '#ffc72c', borderW: 0.1, dpu: 220 });
  R.sign(badge, -2.06, 1.63, -2.16, 0.6, 0.26, {});

  // ── booths ────────────────────────────────────────────────────────────────
  const booth = (lx, lz, rot) => {
    R.box(lx, 0, lz, 2.2, 0.45, 1.0, 0x8a3a2a, { ry: rot });
    R.box(lx, 0.45, lz, 2.3, 0.14, 1.1, 0xc94b3a, { ry: rot });
    R.box(lx, 0, lz - 0.6 * Math.cos(rot), 2.2, 1.5, 0.2, 0x8a3a2a, { ry: rot });
    R.solid(lx, lz, 2.3, 1.2, 0.95, rot);
  };
  // A laid table is what makes a restaurant look OPEN. Every one of the three
  // gets a tray, a lidded cup with a straw, a carton and a scatter of napkins —
  // different on each, so the row does not read as one table copied three times.
  const straw = [0xd52b1e, 0xffc72c, 0x6ac9d8];
  for (let i = 0; i < 3; i++) {
    // the corner table sits 0.15 further west: its booth's end stood 0.15 u
    // inside the doorway
    const lx = i === 0 ? -5.55 : -5.4 + i * 5.0, lz = 3.2;
    R.cyl(lx, 0, lz, 0.16, 0.26, 0.72, 0x3a3229, { mat: 'metal' });
    R.cyl(lx, 0.72, lz, 1.0, 1.0, 0.12, 0xf2e5cc, { seg: 12 });
    R.solid(lx, lz, 1.9, 1.9, 0.85);
    booth(lx, lz - 1.5, 0);
    booth(lx, lz + 1.5, Math.PI);
    // the tray
    const tr = 0.24 + i * 0.35;
    R.box(lx - 0.12, 0.84, lz - 0.16, 0.78, 0.05, 0.58, [0x8a3a2a, 0xa8462f, 0x7c3324][i], { ry: tr });
    R.box(lx - 0.12, 0.86, lz - 0.16, 0.68, 0.04, 0.48, 0xe8dcc0, { ry: tr });    // the paper liner
    // cup: body, lid, straw
    R.cyl(lx + 0.34, 0.84, lz + 0.22, 0.115, 0.09, 0.34, 0xf2e5cc, { seg: 9 });
    R.cyl(lx + 0.34, 0.84, lz + 0.22, 0.118, 0.094, 0.16, 0xd52b1e, { seg: 9 });
    R.cyl(lx + 0.34, 1.18, lz + 0.22, 0.125, 0.125, 0.05, 0xf6f2ea, { seg: 9 });
    R.cyl(lx + 0.34, 1.22, lz + 0.22, 0.022, 0.022, 0.42, straw[i], { seg: 5, rz: 0.22 });
    // a carton of fries, and a wrapped something
    R.box(lx - 0.3, 0.86, lz - 0.28, 0.24, 0.3, 0.2, 0xd52b1e, { ry: tr, rz: 0.05, sx: 1, sy: 1 });
    for (let k = 0; k < 4; k++) R.box(lx - 0.3 + (k - 1.5) * 0.045, 1.1, lz - 0.28, 0.035, 0.2, 0.035, 0xe8b03a, { ry: tr, rz: (k - 1.5) * 0.13 });
    R.box(lx + 0.02, 0.9, lz - 0.06, 0.34, 0.14, 0.3, [0xffc72c, 0xf6ead2, 0xffc72c][i], { ry: tr + 0.5 });
    // napkins, dropped
    for (let k = 0; k < 2; k++) R.box(lx - 0.44 + k * 0.16, 0.855, lz + 0.3, 0.2, 0.012, 0.2, 0xf6f2ea, { ry: tr + k * 0.9 });
  }
  R.loaf(-0.4, 0.84, 3.2, 1.2, PAL.fur[4], { ry: 0.8 });                          // a cat on the table

  // ── the west wall: posters, a condiment stand and a bin ───────────────────
  // A four-metre inner wall with nothing on it is a grey slab; this one carries
  // the two posters every branch of this chain has, and the counter nobody
  // refills because cats do not use ketchup.
  const promo = (a3, b3, c3, bg) => A.panel(1.6, 2.2, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, W, H * 0.45);
    g.fillStyle = '#ffc72c'; g.beginPath(); g.ellipse(W * 0.5, H * 0.33, W * 0.3, H * 0.19, 0, 0, Math.PI * 2); g.fill();
    catFace(g, W * 0.5, H * 0.33, W * 0.14, '#f6ead2', { eye: '#7a1008', nose: '#d52b1e' });
    g.fillStyle = '#fff6dd'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${H * 0.12}px ${FONTS.SANS}`; g.fillText(a3, W / 2, H * 0.62);
    g.font = `bold ${H * 0.15}px ${FONTS.SANS}`; g.fillStyle = '#ffc72c'; g.fillText(b3, W / 2, H * 0.76);
    g.font = `italic bold ${H * 0.075}px ${FONTS.SANS}`; g.fillStyle = '#ffd8b8'; g.fillText(c3, W / 2, H * 0.89);
  }, 96);
  framed(R, promo('NEW', 'McMOUSE', 'now with more mouse', '#d52b1e'), -hx + 0.17, 2.9, -1.4, 1.6, 2.2, Math.PI / 2, 0x8a3a2a);
  framed(R, promo('STAY', 'FOREVER', 'terms: none', '#a01c12'), -hx + 0.17, 2.9, 1.8, 1.6, 2.2, Math.PI / 2, 0x8a3a2a);
  R.box(-hx + 0.7, 0, 0.2, 1.0, 1.0, 2.6, 0xf2e5cc, { ry: 0 });
  R.box(-hx + 0.7, 1.0, 0.2, 1.1, 0.12, 2.7, MDR);
  R.solid(-hx + 0.7, 0.2, 1.1, 2.7, 1.1);
  for (let i = 0; i < 4; i++) R.cyl(-hx + 0.7, 1.12, -0.7 + i * 0.6, 0.11, 0.13, 0.26, [0xd52b1e, 0xffc72c, 0x8a3a2a, 0xf6f2ea][i], { seg: 8 });
  R.cyl(-hx + 0.9, 0, 2.6, 0.42, 0.38, 1.1, MDR, { seg: 10 });
  R.cyl(-hx + 0.9, 1.1, 2.6, 0.46, 0.4, 0.16, 0x8a3a2a, { seg: 10 });
  R.box(-hx + 0.9, 1.18, 2.6, 0.5, 0.06, 0.5, 0x2a2119);

  // ── drive-thru hatch (the exterior window is on the +x wall) ──────────────
  R.box(hx - 0.35, 1.5, 0, 0.3, 0.16, 2.2, 0xf2e5cc, { ry: Math.PI / 2 });        // sill
  R.box(hx - 0.9, 1.66, 0.6, 0.5, 0.3, 0.5, 0x8a3a2a, { ry: Math.PI / 2 });       // a bag waiting
  R.box(hx - 0.9, 1.96, 0.6, 0.36, 0.24, 0.36, 0xd8c4a0, { ry: Math.PI / 2 });
  const dtIn = T.plaque(1.5, 0.42, [{ t: 'DRIVE-THRU', s: 0.62, c: '#fff6dd' }], { bg: '#d52b1e', border: '#ffc72c', borderW: 0.09, dpu: 200 });
  R.sign(dtIn, hx - 0.42, 3.0, 0, 1.5, 0.42, { ry: -Math.PI / 2, glow: true });

  // ── lighting + the gag sign ───────────────────────────────────────────────
  for (const lx of [-4.5, 1.5, 6.0]) {
    R.box(lx, 4.14, 1.6, 2.4, 0.12, 1.0, 0xffd79a, { mat: 'lamp' });
    R.box(lx, 4.22, 1.6, 2.6, 0.14, 1.2, 0x9aa6a8, { mat: 'metal' });
  }
  for (const lx of [-4.5, 1.5, 6.0]) R.pool(lx, 0.08, 1.6, 3.1);
  R.pool(-1.0, 0.08, -2.6, 3.4);                                                  // the counter, lit for business
  const wet = T.plaque(0.9, 1.1, [{ t: '⚠', s: 0.42, c: '#2a2119' }, { t: 'WET', s: 0.3, c: '#2a2119' }, { t: 'FLOOR', s: 0.3, c: '#2a2119' }], { bg: '#ffc72c', border: '#d52b1e', borderW: 0.08, dpu: 170 });
  R.box(5.6, 0, -0.2, 0.1, 1.0, 0.7, 0xffc72c, { rz: 0.12 });
  R.sign(wet, 5.6, 0.55, -0.15, 0.9, 1.1, { rz: 0.12 });

  const p = R.world(-1.0, 0.4);
  T.act('meow_in', p[0], p[1], "Order at the counter", [
    'the trainee takes your order. "HUMAN MEAL," you say. she writes "STAYS IN" and rings it up as free.',
    'the fryers are full of chips. cats do not eat chips. the fryers have never been switched off.',
    'the tray comes with a toy: a tiny ferry. the tiny ferry has no engine. "collect all four," she says.',
  ], { r: 3.6, speaker: "MEOW DONALD'S" });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 · PURRBUCKS
// ═══════════════════════════════════════════════════════════════════════════
export function purrbucksInterior(T, f, o = {}) {
  const R = inRoom(T, f);
  const GREEN = 0x1f6a4a, CREAM = 0xf4f0e0;
  const hx = o.hw ?? 3.6, hz = o.hd ?? 3.3;

  // floorboards (let into the slab, 0.03 proud: at 0.09 over the floor the
  // visitor walked with his soles in them from the threshold to the counter)
  for (let i = 0; i < 8; i++) R.box(-hx + 0.45 + i * 0.9, -0.03, 0, 0.86, 0.06, hz * 2 - 0.2, [0x9a7a52, 0xa8875c, 0x8e7048][i % 3]);

  wainscot(R, hx, hz, { h: 1.0, faceH: [1.0, 3.5, 3.5, 3.5], color: 0x2f5a42, capColor: 0x8a5a2a, wallColor: 0xf2e6cc, gaps: [{ face: 0, lx: (o.doorX ?? 2.13), w: (o.doorW ?? 2.1) + LEAF_ROOM }] });
  ceiling(R, hx, hz, 3.6, { color: 0xf0e4c8, capColor: 0x8a5a2a, joistColor: 0x9a7a52 });

  // ── counter + espresso machine ────────────────────────────────────────────
  R.box(-0.6, 0, -1.5, 5.2, 1.1, 0.9, 0x2f5a42);
  R.box(-0.6, 1.1, -1.5, 5.5, 0.14, 1.1, 0x8a5a2a);
  R.box(-0.6, 0.2, -1.02, 5.2, 0.5, 0.08, PAL.gold);
  R.solid(-0.6, -1.5, 5.5, 1.3, 1.3);
  R.box(-2.1, 1.24, -1.6, 1.5, 0.85, 0.7, 0xc9d2d8, { mat: 'metal' });          // espresso machine
  R.box(-2.1, 2.09, -1.6, 1.6, 0.12, 0.8, 0x8e9aa0, { mat: 'metal' });
  for (const s of [-1, 1]) {
    R.cyl(-2.1 + s * 0.42, 1.14, -1.25, 0.09, 0.09, 0.24, 0x3a3229, { mat: 'metal' });
    R.box(-2.1 + s * 0.42, 1.38, -1.25, 0.3, 0.12, 0.3, 0x3a3229, { mat: 'metal' });
  }
  R.cyl(-1.3, 1.4, -1.28, 0.03, 0.03, 0.55, 0x8e9aa0, { mat: 'metal', rz: 0.6 });  // steam wand
  R.cyl(-2.9, 1.38, -1.2, 0.18, 0.15, 0.28, 0xd8e2e6, { mat: 'metal' });           // milk jug
  R.box(-2.1, 2.28, -1.6, 0.9, 0.26, 0.5, 0x3a3229);                               // bean hopper
  for (let i = 0; i < 4; i++) R.cyl(0.6 + i * 0.4, 1.18, -1.5, 0.13, 0.1, 0.22, CREAM, { seg: 8 });  // cups
  R.cyl(1.9, 1.18, -1.3, 0.2, 0.17, 0.3, 0xf2c14e, { seg: 9 });                     // tip jar

  // ── mug wall + chalkboard ─────────────────────────────────────────────────
  for (let k = 0; k < 2; k++) {
    R.box(1.4, 1.9 + k * 0.7, -hz + 0.18, 3.4, 0.1, 0.4, 0x8a5a2a);
    for (let i = 0; i < 6; i++) {
      R.cyl(0.1 + i * 0.5, 1.95 + k * 0.7, -hz + 0.18, 0.14, 0.12, 0.26, [CREAM, 0x2a8f8a, 0xf2c14e, 0xe8514a][(i + k) % 4], { seg: 8 });
      R.tor(0.28 + i * 0.5, 2.08 + k * 0.7, -hz + 0.18, 0.09, 0.028, [CREAM, 0x2a8f8a, 0xf2c14e, 0xe8514a][(i + k) % 4], { seg: 8, ry: Math.PI / 2 });
    }
  }
  const chalk = T.A.panel(2.6, 1.7, (g, W, H) => {
    g.fillStyle = '#20302a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#8a5a2a'; g.lineWidth = W * 0.035; g.strokeRect(W * 0.018, H * 0.026, W * 0.964, H * 0.948);
    g.fillStyle = '#eaf6ec'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `italic bold ${H * 0.16}px ${FONTS.SERIF}`; g.fillText('today’s milk:', W / 2, H * 0.28);
    g.font = `bold ${H * 0.3}px ${FONTS.SERIF}`; g.fillStyle = '#ffe9a8'; g.fillText('WARM', W / 2, H * 0.54);
    g.font = `italic bold ${H * 0.1}px ${FONTS.SERIF}`; g.fillStyle = '#bcd8c4';
    g.fillText('tomorrow’s milk: warm', W / 2, H * 0.78);
    g.fillText('every milk: warm', W / 2, H * 0.9);
    g.globalAlpha = 0.25; g.strokeStyle = '#eaf6ec'; g.lineWidth = W * 0.006;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(W * 0.1, H * (0.2 + i * 0.16)); g.lineTo(W * 0.9, H * (0.2 + i * 0.16 + 0.01)); g.stroke(); }
  }, 88);
  R.box(-2.0, 2.0, -hz + 0.22, 2.8, 1.9, 0.12, 0x5a3a1e);
  R.sign(chalk, -2.0, 2.95, -hz + 0.3, 2.6, 1.7, {});

  // ── the barista, who knows your name ──────────────────────────────────────
  R.box(-0.6, 0, -2.55, 2.2, 0.4, 1.0, 0x8a5a2a);                               // her step behind the bar
  R.cat(-0.6, 0.4, -2.55, 1.6, PAL.fur[5], { ry: 0, inner: 0xe8a0a8 });
  R.box(-0.6, 1.35, -2.48, 0.9, 0.75, 0.5, GREEN);
  const cupCell = T.plaque(0.55, 0.7, [{ t: 'YOU', s: 0.44, c: '#2f5a42' }], { bg: '#f4f0e0', border: '#1f6a4a', borderW: 0.1, dpu: 220 });
  R.cyl(0.2, 1.18, -1.1, 0.15, 0.12, 0.3, CREAM, { seg: 8 });
  R.sign(cupCell, 0.2, 1.32, -0.94, 0.34, 0.42, {});

  // ── armchairs + a low table by the window ─────────────────────────────────
  const chair = (lx, lz, rot) => {
    R.box(lx, 0, lz, 1.15, 0.5, 1.05, 0x7a3a4a, { ry: rot });
    R.box(lx, 0.5, lz, 1.05, 0.2, 0.95, 0xb8556a, { ry: rot });
    R.box(lx, 0.5, lz - 0.45, 1.15, 0.95, 0.22, 0x7a3a4a, { ry: rot });
    for (const s of [-1, 1]) R.box(lx + s * 0.52, 0.5, lz, 0.16, 0.5, 1.0, 0x7a3a4a, { ry: rot });
    R.solid(lx, lz, 1.3, 1.2, 0.95, rot);
  };
  chair(-2.1, 1.9, 0.35);
  chair(0.4, 2.1, -0.5);
  R.cyl(-0.8, 0, 1.6, 0.5, 0.56, 0.55, 0x8a5a2a, { seg: 10 });
  R.cyl(-0.8, 0.55, 1.6, 0.62, 0.62, 0.1, 0xb4834f, { seg: 12 });
  R.solid(-0.8, 1.6, 1.3, 1.3, 0.7);
  R.cyl(-0.68, 0.65, 1.5, 0.13, 0.11, 0.22, CREAM, { seg: 8 });
  R.loaf(-2.1, 0.7, 1.9, 1.1, PAL.fur[1], { ry: 1.0 });                             // a customer

  // ── light ─────────────────────────────────────────────────────────────────
  for (const lx of [-1.8, 1.4]) {
    R.cyl(lx, 2.98, 0.6, 0.03, 0.03, 0.6, 0x3a3229);
    R.cone(lx, 2.96, 0.6, 0.42, 0.4, GREEN, { rx: Math.PI });
    R.sph(lx, 2.72, 0.6, 0.2, 0xffd79a, { mat: 'lamp', seg: 8, rings: 5 });
  }
  for (const lx of [-1.8, 1.4]) R.pool(lx, 0.08, 0.6, 2.3);
  R.pool(-0.6, 0.08, -1.1, 2.4);
  const p = R.world(0.6, 0.2);
  T.act('purrbucks_in', p[0], p[1], 'Order a warm milk', [
    'the cup already has YOU written on it in green pen. you have not said a word.',
    '"warm milk?" she asks, filling it before you answer. it is exactly the right temperature.',
    'the loyalty card in your pocket is full. you have never been here before. the last stamp says WELCOME BACK.',
  ], { r: 3.2, speaker: 'PURRBUCKS' });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 · THE TRAVEL AGENCY (closed for the season. all seasons.)
// ═══════════════════════════════════════════════════════════════════════════
export function travelInterior(T, f, o = {}) {
  const R = inRoom(T, f);
  const A = T.A, DUST = 0xb8b2a0;
  const hz = o.hd ?? 3.1;

  // dusty boards (let into the slab, 0.03 proud, not 0.09: see Purrbucks)
  for (let i = 0; i < 7; i++) R.box(-2.7 + i * 0.9, -0.03, 0, 0.86, 0.06, hz * 2 - 0.2, [0x8a7a62, 0x96866c, 0x7e6e58][i % 3]);

  wainscot(R, 3.1, hz, { h: 0.95, faceH: [0.95, 3.5, 3.5, 3.5], color: 0x7a705c, capColor: 0x5a5248, wallColor: 0xc9c0ac, gaps: [{ face: 0, lx: (o.doorX ?? 1.87), w: (o.doorW ?? 2.1) + LEAF_ROOM }] });
  ceiling(R, 3.1, hz, 3.6, { color: 0xcfc6b0, capColor: 0x5a5248, joistColor: 0x8a8070 });

  // ── the desk nobody has sat at in years ───────────────────────────────────
  R.box(-0.8, 0, -1.1, 2.6, 0.72, 1.2, 0x6a5238);
  R.box(-0.8, 0.72, -1.1, 2.8, 0.12, 1.4, 0x7d6446);
  R.box(-1.7, 0, -1.1, 0.9, 0.68, 1.1, 0x5a4630);
  R.solid(-0.8, -1.1, 2.8, 1.5, 0.9);
  // typewriter + dead telephone + a bell
  R.box(-1.4, 0.84, -1.1, 0.7, 0.24, 0.55, 0x3a3229);
  R.box(-1.4, 1.06, -1.24, 0.66, 0.26, 0.22, 0x2a2420, { rx: -0.5 });
  for (let i = 0; i < 3; i++) R.box(-1.4, 0.97, -0.92 + i * 0.02, 0.6 - i * 0.06, 0.05, 0.1, 0x8e8272, { rx: -0.2 });
  R.box(0.2, 0.82, -1.2, 0.5, 0.2, 0.4, 0x2a2420);
  R.cyl(0.2, 1.02, -1.2, 0.1, 0.12, 0.16, 0x2a2420, { rz: Math.PI / 2, seg: 8 });
  R.tor(0.2, 0.95, -0.9, 0.16, 0.04, 0x3a3229, { seg: 9, rx: -Math.PI / 2 });
  R.sph(1.0, 0.84, -1.3, 0.14, 0xc9a86a, { mat: 'metal', sy: 0.8 });               // service bell
  // a stack of brochures, still shrink-wrapped
  for (let i = 0; i < 4; i++) R.box(0.7, 0.8 + i * 0.09, -0.75, 0.5, 0.09, 0.7, [0xd8cbb0, 0xcfc0a6][i % 2], { ry: 0.1 * i });
  // the chair, pushed back
  R.cyl(-0.9, 0, 0.35, 0.28, 0.34, 0.42, 0x3a3229, { mat: 'metal' });
  R.box(-0.9, 0.42, 0.35, 0.9, 0.14, 0.85, 0x5a4a3a, { ry: 0.4 });
  R.box(-0.9, 0.56, 0.72, 0.85, 0.9, 0.16, 0x5a4a3a, { ry: 0.4 });
  R.solid(-0.9, 0.35, 1.0, 1.0, 0.6);

  // ── the wall of posters, corrected in red ─────────────────────────────────
  const poster = (title, sub, bg, land) => A.panel(1.5, 2.0, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // a little Candyland: pink hills, a lollipop, a gummy sun
    g.fillStyle = '#8fd8e8'; g.fillRect(0, 0, W, H * 0.55);
    g.fillStyle = land; g.beginPath(); g.ellipse(W * 0.5, H * 0.72, W * 0.62, H * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd447'; g.beginPath(); g.arc(W * 0.78, H * 0.16, W * 0.1, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff5f8a'; g.beginPath(); g.arc(W * 0.32, H * 0.46, W * 0.14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f6f2ea'; g.fillRect(W * 0.305, H * 0.5, W * 0.03, H * 0.18);
    g.fillStyle = 'rgba(28,22,16,.72)'; g.fillRect(0, H * 0.82, W, H * 0.18);
    g.fillStyle = '#ffe9a8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${H * 0.09}px ${FONTS.SANS}`; g.fillText(title, W / 2, H * 0.875, W * 0.92);
    g.font = `italic bold ${H * 0.055}px ${FONTS.SANS}`; g.fillStyle = '#e0c98a'; g.fillText(sub, W / 2, H * 0.945);
    // DO NOT, scrawled across it in red
    g.save(); g.translate(W * 0.5, H * 0.45); g.rotate(-0.22);
    g.strokeStyle = '#c2261a'; g.lineWidth = W * 0.05; g.lineCap = 'round';
    g.font = `bold ${H * 0.2}px ${FONTS.SANS}`; g.textAlign = 'center';
    g.fillStyle = 'rgba(194,38,26,.92)'; g.fillText('DO NOT', 0, 0);
    g.beginPath(); g.moveTo(-W * 0.42, H * 0.1); g.lineTo(W * 0.42, -H * 0.08); g.stroke();
    g.restore();
    g.globalAlpha = 0.18; g.fillStyle = '#cfc6ae'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  }, 96);
  const ps = [poster('THE CANDY KINGDOM', 'the sweet island', '#f0c8dc', '#f0a8c8'), poster('THE MAINLAND', 'it is over there', '#cfe0ec', '#a8ce72'), poster('ANYWHERE', 'one way, obviously', '#e8dcb8', '#d8b88a')];
  ps.forEach((c, i) => framed(R, c, -1.9 + i * 1.9, 2.42, -(hz - 0.17), 1.5, 2.0, 0, 0x4a3a28));

  // ── the globe with the sea painted over ───────────────────────────────────
  const GX = 2.2, GZ = -1.6;
  R.cyl(GX, 0, GZ, 0.24, 0.36, 0.8, 0x5a4630, { seg: 9 });
  R.tor(GX, 0.86, GZ, 0.62, 0.05, 0xc9a86a, { seg: 14, tseg: 4, mat: 'metal', rz: 0.5 });
  R.sph(GX, 1.16, GZ, 0.58, 0x6a8fa8);                                            // the world
  // the land, still visible; the sea, roller-painted flat blue over everything
  R.sph(GX + 0.2, 1.3, GZ + 0.42, 0.3, 0x7ab84e, { sy: 0.6, sz: 0.4 });
  R.sph(GX - 0.34, 1.05, GZ + 0.36, 0.22, 0x7ab84e, { sy: 0.7, sz: 0.4 });
  for (let i = 0; i < 5; i++) R.box(GX - 0.5 + i * 0.25, 1.16, GZ + 0.5, 0.26, 1.05, 0.16, 0x3f6f9a, { rz: 0.04 * i, ry: 0.1 });
  R.cyl(GX + 0.85, 0, GZ + 0.5, 0.22, 0.22, 0.3, 0x3f6f9a, { seg: 9 });           // the paint tin
  R.cyl(GX + 0.85, 0.3, GZ + 0.5, 0.23, 0.23, 0.04, 0x2f5a7a, { seg: 9 });
  R.cyl(GX + 1.05, 0.3, GZ + 0.35, 0.05, 0.05, 0.6, 0x8a7a5a, { rz: 0.9 });       // the roller
  R.cyl(GX + 1.3, 0.62, GZ + 0.28, 0.11, 0.11, 0.3, 0x3f6f9a, { rz: Math.PI / 2, seg: 8 });
  const gl = T.plaque(1.1, 0.34, [{ t: 'GLOBE (updated)', s: 0.6, c: '#f6ecd2' }], { bg: '#3f4d52', border: '#8e9a9e', borderW: 0.08, grime: 0.3, dpu: 200 });
  R.sign(gl, GX, 0.5, GZ + 0.62, 1.1, 0.34, {});

  // ── dust sheets, a dead lamp, and the smell of nobody ─────────────────────
  // the sheeted sofa, pushed back off the doormat: at (2.2, 1.8) it stood half
  // a metre inside the door and you walked into a dust sheet and stopped
  const SX = 2.3, SZ = 0.3;
  R.box(SX, 0, SZ, 1.8, 0.9, 1.4, DUST, { ry: -0.3, rz: 0.03 });
  R.box(SX, 0.9, SZ, 1.9, 0.2, 1.5, 0xc6c0ae, { ry: -0.3 });
  R.solid(SX, SZ, 2.0, 1.6, 1.1, -0.3);
  R.box(-2.3, 0, 1.7, 1.2, 1.7, 0.5, DUST, { ry: 0.4, rz: -0.02 });               // sheeted filing cabinet
  R.solid(-2.3, 1.7, 1.3, 0.7, 1.7, 0.4);
  R.cyl(-1.2, 0.84, -1.5, 0.12, 0.16, 0.34, 0x3a3229);                            // desk lamp, on
  R.cyl(-1.2, 1.18, -1.5, 0.06, 0.06, 0.42, 0x3a3229, { rz: 0.5 });
  R.cone(-1.02, 1.62, -1.5, 0.2, 0.26, 0x3a3229, { rx: Math.PI - 0.2 });
  R.sph(-1.02, 1.48, -1.5, 0.11, 0xffd79a, { mat: 'lamp', seg: 7, rings: 5 });
  // cobwebs, tucked into the two top corners of the poster wall. Four fat white
  // spheres floating round the room read as litter, not as neglect: keep them
  // small, close in value to the plaster, and IN the corner.
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    R.sph(s * (2.92 - i * 0.26), 3.3 - i * 0.24, -hz + 0.26 + i * 0.22, 0.3 - i * 0.06, 0xd6cfbc, { seg: 5, rings: 3, sz: 0.07, sy: 0.4, ry: s * 0.78 });
  }

  // a dusty pendant over the desk, and a lit green sign over the door: three
  // lit sources, so the shop reads as "nobody has switched this off in years"
  R.cyl(-0.9, 2.96, -0.4, 0.03, 0.03, 0.6, 0x3a3229);
  R.cone(-0.9, 2.94, -0.4, 0.44, 0.42, 0x6a6252, { rx: Math.PI });
  R.sph(-0.9, 2.68, -0.4, 0.2, 0xffd0a0, { mat: 'lamp', seg: 8, rings: 5 });
  R.cyl(SX, 2.5, SZ, 0.05, 0.05, 0.7, 0x5a5248);
  R.cyl(SX, 2.2, SZ, 0.28, 0.22, 0.34, 0xffd0a0, { mat: 'lamp', seg: 9 });
  const openCell = T.plaque(1.1, 0.36, [{ t: 'OPEN', s: 0.66, c: '#9fe0b8' }], { bg: '#1f3a2c', border: '#4a6a58', borderW: 0.08, grime: 0.25, dpu: 200 });
  R.sign(openCell, (o.doorX ?? 1.87), 2.55, hz - 0.24, 1.1, 0.36, { ry: Math.PI, glow: true });
  R.pool(-1.0, 0.08, -1.4, 1.9);
  R.pool(-0.9, 0.08, -0.4, 2.0);
  R.pool(SX, 0.08, SZ, 1.5);
  const p = R.world(0.4, 0.8);
  T.act('travel_in', p[0], p[1], 'Ring the bell', [
    'you ring the bell. the sound is swallowed by dust. somewhere upstairs, a cat rolls over.',
    'the desk diary is open at a Tuesday in a year you cannot read. the entry says: "nobody again".',
    'the globe has had the sea painted over in flat blue. the tin is still open. the brush is still wet.',
  ], { r: 3.0, speaker: 'TRAVEL AGENCY' });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 · THE PURRLIAMENT CHAMBER
// ═══════════════════════════════════════════════════════════════════════════
export function purrliamentInterior(T, f, o = {}) {
  const R = inRoom(T, f);
  const A = T.A, GREEN = 0x2f5a42, GOLD = PAL.gold;
  const hx = o.hw ?? 12.8, hz = o.hd ?? 5.8;

  // ── floor: a long red runner on a stone chequer ───────────────────────────
  // the runner runs the LENGTH of the chamber, up the aisle to the dais — at
  // 5 units across the short axis it was a red doormat lost under the benches
  R.box(2.75, 0.04, 0, hx * 2 - 5.9, 0.06, 2.5, 0x8a2f2a);
  R.box(2.75, 0.05, 0, hx * 2 - 6.7, 0.05, 2.0, 0xa03a32);

  // The chamber is twenty-six metres long: the far END wall is the one that has
  // to be tall, and the two long walls frame the shot rather than blocking it.
  wainscot(R, hx, hz, { h: 1.3, faceH: [6.0, 1.3, 6.0, 6.7], color: 0xd8cbb0, capColor: 0x8a7450, wallColor: 0xf2e9d4, gaps: [{ face: 0, lx: 0, w: 7.0 }] });
  ceiling(R, hx, hz, 6.95, { color: 0xefe4c8, capColor: 0x8a7450, joistColor: 0xc9b894, joists: false });

  // ── tiered benches, two rows facing each other ───────────────────────────
  // The front rows (s = +1, the door side) are split by a gangway from the
  // chamber doors down to the floor: they used to run straight across the
  // doorway, so the way in was over the back of the top bench, and the doors
  // had nowhere to swing.
  const GANG = o.gang ?? 2.4;
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const lz = s * (1.9 + k * 1.3), ly = k * 0.42;
    const runs = s > 0 ? [[-8.6, -GANG], [GANG, 8.6]] : [[-8.6, 8.6]];
    for (const [a, c2] of runs) {
      const cx = (a + c2) / 2, L = c2 - a;
      R.box(cx, ly, lz, L - 0.2, 0.5, 1.2, 0xd8cbb0);                 // riser
      R.box(cx, ly + 0.5, lz, L, 0.16, 1.3, GREEN);                   // bench
      R.box(cx, ly + 0.66, lz + s * 0.55, L, 0.75, 0.2, GREEN);       // back
      R.solid(cx, lz, L, 1.4, ly + 0.66);
    }
  }
  // the cats who turned up
  R.loaf(-5.2, 0.68, 1.9, 1.3, PAL.fur[1], { ry: 0.4 });
  R.loaf(2.4, 1.1, -3.2, 1.4, PAL.fur[4], { ry: 2.6 });
  R.loaf(6.6, 0.68, 1.9, 1.2, PAL.fur[2], { ry: -0.5 });

  // ── the throne, on its dais at the far end ────────────────────────────────
  const TX = -hx + 3.4;
  R.box(TX, 0, 0, 4.6, 0.3, 5.0, 0xd8cbb0);
  R.box(TX - 0.5, 0.3, 0, 3.6, 0.3, 4.2, 0xe6d9bd);
  R.box(TX - 0.8, 0.6, 0, 2.0, 0.6, 2.0, 0x6a4a24, { ry: Math.PI / 2 });          // seat block
  R.box(TX - 0.8, 1.2, 0, 2.1, 0.26, 2.1, 0x8a5a2a, { ry: Math.PI / 2 });
  R.box(TX - 1.5, 1.2, 0, 0.35, 3.2, 2.2, 0x6a4a24);                              // back
  R.box(TX - 1.5, 4.2, 0, 0.5, 0.4, 2.6, GOLD, { mat: 'metal' });
  for (const s of [-1, 1]) R.box(TX - 0.8, 1.46, s * 1.0, 1.9, 0.28, 0.3, 0x8a5a2a, { ry: Math.PI / 2 });
  R.box(TX - 0.78, 1.46, 0, 1.7, 0.3, 1.7, 0xb03a63, { ry: Math.PI / 2 });        // THE CUSHION
  R.box(TX - 0.78, 1.6, 0, 1.4, 0.16, 1.4, 0xc94b7a, { ry: Math.PI / 2 });
  for (const s of [-1, 1]) for (const t of [-1, 1]) R.sph(TX - 0.78 + s * 0.72, 1.5, t * 0.72, 0.13, GOLD, { mat: 'metal', seg: 6, rings: 4 });
  R.solid(TX - 0.8, 0, 2.4, 2.4, 1.6);
  R.cat(TX - 0.8, 1.62, 0, 1.9, PAL.fur[3], { ry: Math.PI / 2, inner: 0xe8a0a8 });  // the Speaker, asleep on the job
  // mace on a rest, in front of the throne
  R.box(TX + 1.6, 0.3, 0, 0.5, 0.9, 1.6, 0x6a4a24);
  R.cyl(TX + 1.6, 1.24, 0, 0.09, 0.09, 1.8, GOLD, { mat: 'metal', rz: Math.PI / 2, seg: 8, center: true, ry: Math.PI / 2 });
  R.sph(TX + 1.6, 1.24, -0.9, 0.2, GOLD, { mat: 'metal', seg: 8, rings: 6 });

  // ── the portrait wall: nine mayors, all the same cat ──────────────────────
  const mayors = ['MAYOR TIBBLES I', 'MAYOR TIBBLES II', 'MAYOR TIBBLES III', 'MAYOR TIBBLES IV', 'MAYOR TIBBLES V', 'MAYOR TIBBLES VI'];
  const furs = ['#f0963c', '#8a8a94', '#2b2b30', '#f6f2ea', '#d9a066', '#b8834a'];
  mayors.forEach((name, i) => {
    const cell = A.panel(1.3, 1.7, (g, W, H) => {
      g.fillStyle = ['#3a2f26', '#2f3a36', '#3a3326'][i % 3]; g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.5; g.fillStyle = '#000'; g.beginPath(); g.ellipse(W * 0.5, H * 0.95, W * 0.6, H * 0.35, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      catFace(g, W * 0.5, H * 0.44, W * 0.3, furs[i], { eye: '#f2c14e', nose: '#d3697a' });
      g.fillStyle = '#8a1f2a'; g.fillRect(W * 0.22, H * 0.66, W * 0.56, H * 0.2);   // robe
      g.fillStyle = '#f2c14e'; g.fillRect(W * 0.44, H * 0.66, W * 0.12, H * 0.2);
      g.fillStyle = '#efe3c8'; g.font = `bold ${H * 0.062}px ${FONTS.SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(name, W / 2, H * 0.93);
    }, 110);
    // hung along the BACK wall as one portrait wall: the side walls are only
    // waist high (the camera has to see into the chamber) and a picture hung on
    // one of those floats in the sky the moment you walk in
    framed(R, cell, -7.5 + i * 2.7, 3.4, -(hz - 0.17), 1.3, 1.7, 0, 0x6a4a24);
  });

  // ── MOTIONS: nap ──────────────────────────────────────────────────────────
  const motions = A.panel(3.4, 2.4, (g, W, H) => {
    g.fillStyle = '#20302a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c9a86a'; g.lineWidth = W * 0.025; g.strokeRect(W * 0.015, H * 0.02, W * 0.97, H * 0.96);
    g.fillStyle = '#ffe9a8'; g.font = `bold ${H * 0.15}px ${FONTS.SERIF}`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('MOTIONS', W * 0.05, H * 0.05);
    const rows = [['1.', 'nap', 'CARRIED'], ['2.', 'the guest question', 'DEFERRED'], ['3.', 'nap', 'CARRIED'], ['4.', 'lunch', 'CARRIED'], ['5.', 'the guest question', 'DEFERRED'], ['6.', 'nap', 'CARRIED']];
    rows.forEach((r, i) => {
      const y = H * (0.28 + i * 0.115);
      g.font = `bold ${H * 0.085}px ${FONTS.SANS}`;
      g.fillStyle = '#bcd8c4'; g.fillText(r[0], W * 0.06, y);
      g.fillStyle = '#eaf6ec'; g.fillText(r[1], W * 0.14, y);
      g.textAlign = 'right'; g.fillStyle = r[2] === 'CARRIED' ? '#8fe0a8' : '#ffb46a';
      g.fillText(r[2], W * 0.94, y); g.textAlign = 'left';
    });
  }, 96);
  R.box(hx - 3.0, 2.1, -hz + 0.24, 3.7, 2.7, 0.14, 0x5a3a1e, { ry: 0 });
  R.sign(motions, hx - 3.0, 3.4, -hz + 0.33, 3.4, 2.4, {});

  // ── dispatch box, chandeliers, a carpet of dropped papers ────────────────
  R.box(2.0, 0, 0.4, 1.2, 1.0, 0.8, 0x6a4a24);
  R.box(2.0, 1.0, 0.4, 1.35, 0.14, 0.95, 0x8a5a2a, { rx: -0.14 });
  R.box(2.0, 1.16, 0.3, 0.7, 0.06, 0.5, 0xf2e9d4, { rx: -0.14 });
  R.solid(2.0, 0.4, 1.4, 1.0, 1.1);
  for (const lx of [-6.0, 0, 6.0]) {
    R.cyl(lx, 5.2, 0, 0.04, 0.04, 1.6, 0x3a3229);
    R.cyl(lx, 5.0, 0, 0.7, 0.35, 0.4, GOLD, { mat: 'metal', seg: 10 });
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      R.sph(lx + Math.cos(a) * 0.62, 5.05, Math.sin(a) * 0.62, 0.17, 0xffd79a, { mat: 'lamp', seg: 7, rings: 5 });
    }
  }
  for (let i = 0; i < 7; i++) R.box(-4 + i * 1.6, 0.08, (i % 2 ? 1 : -1) * (0.9 + (i % 3) * 0.3), 0.4, 0.02, 0.55, 0xf2e9d4, { ry: i * 0.7 });

  for (const lx of [-6.0, 0, 6.0]) R.pool(lx, 0.09, 0, 4.0);
  R.pool(TX - 0.8, 0.4, 0, 3.4);
  const p = R.world(4.6, 1.0);
  T.act('purrliament_in', p[0], p[1], 'Table a motion', [
    'you table a motion. it is seconded instantly. it is amended to "nap". it carries.',
    'the order paper has run to six items today. four of them are naps. two are you.',
    'the throne cushion has a dent in it the exact shape of a very old cat. the cat is still in it.',
  ], { r: 4.0, speaker: 'PURRLIAMENT' });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 · THE GUEST HOUSE — the room they made up for you before you arrived
// ═══════════════════════════════════════════════════════════════════════════
export function guestInterior(T, f, o = {}) {
  const R = inRoom(T, f);
  const hx = o.hw ?? 4.2, hz = o.hd ?? 4.0;

  // rag rug (the floor slab belongs to the shell, and containment's guest nook
  // lays its own boards over the middle of this room — sit above both)
  R.cyl(2.4, 0.12, 2.4, 1.4, 1.4, 0.05, 0xc96a5a, { seg: 14 });
  R.tor(2.4, 0.15, 2.4, 1.15, 0.07, 0xe08a6a, { seg: 16, tseg: 4, rx: -Math.PI / 2 });

  wainscot(R, hx, hz, { h: 0.9, faceH: [0.9, 4.2, 4.2, 4.2], color: 0xe8dcc0, capColor: 0x2a8f8a, wallColor: 0xf6ead0, gaps: [{ face: 0, lx: (o.doorX ?? -1.7), w: (o.doorW ?? 2.2) + LEAF_ROOM }] });
  ceiling(R, hx, hz, 4.35, { color: 0xf4e8cc, capColor: 0x2a8f8a, joistColor: 0xc4a878 });

  // ── the wardrobe, full of pyjamas in exactly your size ───────────────────
  const WX = -hx + 0.75;
  R.box(WX, 0, -1.2, 1.0, 3.2, 2.6, 0x7a5230, { ry: 0 });
  R.box(WX + 0.1, 0, -1.2, 0.8, 3.0, 2.3, 0x2a2119);                     // the dark inside
  R.box(WX, 3.2, -1.2, 1.3, 0.3, 2.9, 0x8a5f38);
  R.cyl(WX + 0.35, 2.6, -1.2, 0.05, 0.05, 2.1, 0xc9a86a, { mat: 'metal', rz: Math.PI / 2, ry: Math.PI / 2, center: true, seg: 6 });
  const pj = [0x6ac9d8, 0xf0a8c8, 0xf2c14e, 0x8fe05a, 0xe8514a];
  for (let i = 0; i < 5; i++) {                                           // hanging pyjamas, human-sized
    const lz = -2.2 + i * 0.5;
    R.box(WX + 0.35, 1.15, lz, 0.12, 1.45, 0.42, pj[i], { ry: 0.06 * i });
    R.box(WX + 0.35, 2.24, lz, 0.1, 0.34, 0.54, pj[i], { ry: 0.06 * i });   // shoulders
    R.cyl(WX + 0.35, 2.56, lz, 0.02, 0.02, 0.16, 0xc9d2d8, { mat: 'metal' });
    R.tor(WX + 0.35, 2.68, lz, 0.08, 0.02, 0xc9d2d8, { mat: 'metal', seg: 8, ry: Math.PI / 2 });
  }
  // the open door of the wardrobe, and a label
  R.box(WX + 0.42, 0, 0.3, 0.9, 3.0, 0.1, 0x7a5230, { ry: -1.1 });
  const sizeTag = T.plaque(1.2, 0.4, [{ t: 'YOUR SIZE', s: 0.5, c: '#4a3520' }, { t: 'all of them', s: 0.3, c: '#7a6a50', weight: 'italic bold' }], { bg: '#f2e6c8', border: '#8a6a3a', borderW: 0.07, dpu: 190 });
  R.sign(sizeTag, WX + 0.53, 1.9, 0.55, 1.2, 0.4, { ry: -1.1 });
  R.solid(WX, -1.2, 1.1, 2.7, 3.2);

  // ── window seat, towels, slippers, a welcome card ────────────────────────
  R.box(hx - 0.55, 0, 1.2, 1.0, 0.85, 3.0, 0xe6d9bd);
  R.box(hx - 0.55, 0.85, 1.2, 1.1, 0.18, 3.0, 0x7fbfb2);
  R.solid(hx - 0.55, 1.2, 1.1, 3.0, 1.0);
  for (let i = 0; i < 3; i++) R.box(hx - 0.6, 1.04 + i * 0.14, 2.2, 0.7, 0.14, 0.9, [0xf6f2ea, 0xe8dcc0][i % 2], { ry: 0.08 * i });
  R.loaf(hx - 0.6, 0.94, 0.2, 1.15, PAL.fur[2], { ry: -1.4 });             // already occupied
  for (const s of [0, 1]) R.box(2.6 + s * 0.34, 0.06, 3.2, 0.28, 0.12, 0.62, 0x8a4a5a, { ry: 0.2 - s * 0.4 });   // your slippers, waiting
  const card = T.plaque(1.4, 0.9, [
    { t: 'WELCOME', s: 0.3, c: '#1f6f6b' },
    { t: 'make yourself', s: 0.2, c: '#5a4a32' },
    { t: 'at home', s: 0.26, c: '#5a4a32' },
    { t: 'forever', s: 0.2, c: '#8a2f22', weight: 'italic bold' },
  ], { bg: '#f6ecd2', border: '#2a8f8a', borderW: 0.05, dpu: 170 });
  R.box(2.0, 0.72, -hz + 0.5, 1.0, 0.72, 0.7, 0x8a5f38);                   // bedside cabinet
  R.box(2.0, 0, -hz + 0.5, 1.0, 0.72, 0.7, 0x7a5230);
  R.solid(2.0, -hz + 0.5, 1.1, 0.8, 0.8);
  R.sign(card, 2.0, 1.1, -hz + 0.82, 1.4, 0.9, { rx: -0.3 });

  // ── light: a ceiling lamp and a candle on the sill ───────────────────────
  R.cyl(0.4, 3.75, 0.6, 0.03, 0.03, 0.6, 0x3a3229);
  R.cone(0.4, 3.72, 0.6, 0.5, 0.5, 0xf2e9d4, { rx: Math.PI });
  R.sph(0.4, 3.42, 0.6, 0.22, 0xffd79a, { mat: 'lamp', seg: 8, rings: 5 });
  R.cyl(hx - 0.6, 1.03, -0.9, 0.08, 0.09, 0.34, 0xf6f2ea);
  R.sph(hx - 0.6, 1.45, -0.9, 0.09, 0xffd79a, { mat: 'lamp', seg: 6, rings: 4, sy: 1.6 });

  R.pool(0.4, 0.08, 0.6, 2.8);
  R.pool(hx - 0.6, 1.1, -0.9, 1.1);
  const p = R.world(-2.4, 1.1);
  T.act('guest_in', p[0], p[1], 'Open the wardrobe', [
    'the wardrobe is full of pyjamas. every pair is your size. the tags have been cut out.',
    'on the shelf: a folded towel, a spare toothbrush, and a photograph of this room with you in it.',
    'the photograph is not from today. you have not slept here yet.',
  ], { r: 3.0, speaker: 'THE GUEST ROOM' });
}

// ═══════════════════════════════════════════════════════════════════════════
// 6 · THE WATCHTOWER, GROUND FLOOR
// ═══════════════════════════════════════════════════════════════════════════
export function watchInterior(T, f, o = {}) {
  const R = inRoom(T, f);
  const A = T.A, rIn = o.rIn ?? 3.05;

  // stone floor
  R.cyl(0, 0.02, 0, rIn, rIn, 0.06, 0xbfae91, { seg: 16 });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    R.box(Math.cos(a) * rIn * 0.62, 0.06, Math.sin(a) * rIn * 0.62, 1.1, 0.04, 0.8, i % 2 ? 0xc9b99a : 0xb7a68a, { ry: -a });
  }

  // A low course of the wall that stays when the tower shell dissolves — and
  // three FULL-HEIGHT bays behind the maintenance board, because a board hung on
  // a 1.05 skirting is a board hanging in mid-air the moment you step inside.
  // Only the arc the visitor comes in over stays at skirting height. Everything
  // else runs to 3.4: a 1.05 ring left the iso camera looking straight over the
  // far side of the tower and out at the sky.
  const BOARD_A = Math.PI * 0.18, CAM_A = -0.63;
  for (let i = 0; i < 16; i++) {
    const a = (i + 0.5) / 16 * Math.PI * 2;
    const wrap = (v) => { while (v > Math.PI) v -= Math.PI * 2; while (v < -Math.PI) v += Math.PI * 2; return v; };
    if (Math.abs(wrap(a - Math.PI / 2)) < 0.34) continue;   // the doorway
    const pier = Math.abs(wrap(a - BOARD_A)) < 0.45;
    const low = Math.abs(wrap(a - CAM_A)) < 1.0;
    const hh = pier ? 3.4 : low ? 1.05 : 3.4;
    const w = 2 * rIn * Math.tan(Math.PI / 16) + 0.06;
    R.box(Math.cos(a) * (rIn - 0.1), 0, Math.sin(a) * (rIn - 0.1), w, hh, 0.2, low && !pier ? 0xe3d7bf : 0xeee5d4, { ry: -a + Math.PI / 2 });
    R.box(Math.cos(a) * (rIn - 0.18), 1.05, Math.sin(a) * (rIn - 0.18), w, 0.1, 0.34, 0xd8402e, { ry: -a + Math.PI / 2 });
    if (!low || pier) R.box(Math.cos(a) * (rIn - 0.18), hh, Math.sin(a) * (rIn - 0.18), w, 0.12, 0.34, 0xd8402e, { ry: -a + Math.PI / 2 });
  }

  // ── the spiral stair, going up into the dark (and it is WALKABLE: the
  //    matching helix is registered in outskirts.js from TOWER_STAIR) ───────
  const S = TOWER_STAIR;
  R.cyl(0, 0, 0, 0.3, 0.34, 5.6, 0x8a6238, { seg: 10 });                    // newel
  for (let i = 0; i < S.n; i++) {
    const a = S.a0 + i * S.da, ly = S.y0 + i * S.dy;
    R.box(Math.cos(a) * S.r, ly, Math.sin(a) * S.r, 2.15, S.tread, 0.78, 0x9a7a52, { ry: -a });
    R.box(Math.cos(a) * S.r, ly - 0.34, Math.sin(a) * S.r, 2.0, 0.36, 0.12, 0x7d6446, { ry: -a });     // riser
    R.cyl(Math.cos(a) * 2.35, ly + S.tread, Math.sin(a) * 2.35, 0.045, 0.045, 0.92, 0x3a4a4c, { mat: 'metal' });
    if (i > 0) R.box(Math.cos(a - 0.26) * 2.35, ly + 0.96, Math.sin(a - 0.26) * 2.35, 0.7, 0.07, 0.07, 0x3a4a4c, { ry: -a + 0.9, mat: 'metal' });
  }
  // the half-landing the flight stops at, and the rope the keeper leaves across
  // it — you can climb this far and no further, which is the joke
  const aT = S.a0 + (S.n - 1) * S.da, lyT = S.y0 + (S.n - 1) * S.dy;
  const aL = aT + S.land * 0.55;
  R.box(Math.cos(aL) * S.r, lyT, Math.sin(aL) * S.r, 2.15, S.tread, 1.35, 0x9a7a52, { ry: -aL });
  R.box(Math.cos(aL) * S.r, lyT - 0.34, Math.sin(aL) * S.r, 2.0, 0.36, 0.12, 0x7d6446, { ry: -aL });
  for (const rr of [0.55, 2.3]) R.cyl(Math.cos(aT + S.land) * rr, lyT + S.tread, Math.sin(aT + S.land) * rr, 0.05, 0.06, 1.05, 0x3a4a4c, { mat: 'metal' });
  R.cyl(Math.cos(aT + S.land) * 1.42, lyT + 0.92, Math.sin(aT + S.land) * 1.42, 0.045, 0.045, 1.8, 0xb03a3a, { seg: 5, center: true, rz: Math.PI / 2, ry: -(aT + S.land) + Math.PI / 2, ao: 0 });
  const keeper = T.plaque(1.3, 0.5, [{ t: 'KEEPER ONLY', s: 0.46, c: '#fff4dc' }, { t: 'sorry! ♥', s: 0.28, c: '#ffd0a8', weight: 'italic bold' }], { bg: '#b8341e', border: '#f2c14e', borderW: 0.07, dpu: 190 });
  R.sign(keeper, Math.cos(aT + S.land) * 1.42, lyT + 0.62, Math.sin(aT + S.land) * 1.42, 1.3, 0.5, { ry: Math.PI - (aT + S.land) });


  // ── the keeper's desk ────────────────────────────────────────────────────
  const DA = Math.PI * 0.72;                                                 // tucked round the back
  const dx = Math.cos(DA) * (rIn - 0.9), dz = Math.sin(DA) * (rIn - 0.9);
  R.box(dx, 0, dz, 2.0, 0.76, 0.9, 0x6a5238, { ry: -DA });
  R.box(dx, 0.76, dz, 2.2, 0.12, 1.05, 0x7d6446, { ry: -DA });
  R.solid(dx, dz, 2.2, 1.1, 0.9, -DA);
  const log = A.panel(1.2, 0.8, (g, W, H) => {
    g.fillStyle = '#efe3c8'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#b8a882'; g.lineWidth = W * 0.012;
    for (let i = 1; i < 7; i++) { g.beginPath(); g.moveTo(W * 0.06, H * (0.1 + i * 0.12)); g.lineTo(W * 0.94, H * (0.1 + i * 0.12)); g.stroke(); }
    g.fillStyle = '#3a2f22'; g.font = `bold ${H * 0.1}px ${FONTS.SERIF}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('LENS LOG', W * 0.07, H * 0.09);
    g.font = `italic ${H * 0.075}px ${FONTS.SERIF}`; g.fillStyle = '#5a4a34';
    ['polished. sweeps well.', 'polished. saw the guest.', 'polished. guest still here.', 'polished. good.', 'polished.', '—'].forEach((t, i) => {
      g.fillText(t, W * 0.12, H * (0.16 + i * 0.12));
    });
  }, 150);
  R.flat(log, dx, 0.83, dz, 1.2, 0.8, { ry: -DA + 0.2 });
  R.cyl(dx + 0.5, 0.82, dz + 0.3, 0.12, 0.14, 0.22, 0x3a4a4c, { mat: 'metal' });   // oil can
  R.cone(dx + 0.5, 1.04, dz + 0.3, 0.05, 0.3, 0x3a4a4c, { mat: 'metal', rz: 0.6 });
  R.cyl(dx - 0.6, 0.82, dz + 0.2, 0.1, 0.1, 0.3, 0xc9a86a, { mat: 'metal' });      // a brass thing
  R.box(dx, 1.0, dz, 0.5, 0.36, 0.3, 0x2a2420, { ry: -DA });                        // the radio that only receives
  R.cyl(dx + 0.2, 1.36, dz, 0.02, 0.02, 0.5, 0x8e9aa0, { mat: 'metal', rz: 0.3 });
  // the chair
  R.cyl(dx + Math.cos(DA) * -1.2, 0, dz + Math.sin(DA) * -1.2, 0.26, 0.3, 0.46, 0x5a4630);
  R.box(dx + Math.cos(DA) * -1.2, 0.46, dz + Math.sin(DA) * -1.2, 0.8, 0.14, 0.8, 0x6a5238, { ry: -DA });

  // ── the spare lens, and the log board on the wall ────────────────────────
  // Propped UPRIGHT against the stonework. Rotated about its bottom anchor it
  // used to end up with its centre on the floor, i.e. half the lens underground
  // and the brass rim floating clear above it.
  const LA = Math.PI * 1.35, lx = Math.cos(LA) * (rIn - 0.55), lz = Math.sin(LA) * (rIn - 0.55);
  const LRY = -LA - Math.PI / 2;
  R.cyl(lx, 1.02, lz, 0.95, 0.95, 0.22, 0xcf8f28, { mat: 'lamp', seg: 16, center: true, rx: Math.PI / 2 - 0.16, ry: LRY });
  R.tor(lx, 1.02, lz, 0.98, 0.1, 0x3a4a4c, { mat: 'metal', seg: 18, tseg: 5, rx: -0.16, ry: LRY });
  const board = T.plaque(1.8, 1.2, [
    { t: 'LENS MAINTENANCE', s: 0.22, c: '#eaf6ff' },
    { t: '1. polish daily', s: 0.16, c: '#9fd8ff' },
    { t: '2. sweep the island', s: 0.16, c: '#9fd8ff' },
    { t: '3. never the sea', s: 0.18, c: '#ffcb4a' },
    { t: '4. if the guest waves, wave back', s: 0.13, c: '#9fd8ff', weight: 'italic bold' },
  ], { bg: '#12283f', border: '#8fb8c0', borderW: 0.05, dpu: 150 });
  // ry = -BA - PI/2 puts the board's face on the INWARD radial: at +PI/2 it was
  // hung facing the stonework and read as a blank blue plank.
  const BA = BOARD_A, bx = Math.cos(BA) * (rIn - 0.24), bz = Math.sin(BA) * (rIn - 0.24);
  R.box(bx, 2.0, bz, 2.0, 1.4, 0.12, 0x2f4a5a, { ry: -BA - Math.PI / 2 });
  R.sign(board, bx - Math.cos(BA) * 0.11, 2.0, bz - Math.sin(BA) * 0.11, 1.8, 1.2, { ry: -BA - Math.PI / 2 });
  // lamps: the hanging one over the newel, and a bracket lantern by the desk
  R.sph(0, 4.4, 0, 0.26, 0xffd79a, { mat: 'lamp', seg: 8, rings: 5 });
  R.cone(0, 4.62, 0, 0.4, 0.34, 0x3a4a4c, { rx: Math.PI });
  {
    const LA2 = Math.PI * 0.62, bx2 = Math.cos(LA2) * (rIn - 0.35), bz2 = Math.sin(LA2) * (rIn - 0.35);
    R.box(bx2, 2.55, bz2, 0.1, 0.1, 0.5, 0x3a4a4c, { ry: -LA2, mat: 'metal' });
    R.cyl(bx2 - Math.cos(LA2) * 0.34, 2.18, bz2 - Math.sin(LA2) * 0.34, 0.2, 0.14, 0.4, 0xffd0a0, { mat: 'lamp', seg: 8 });
    R.cone(bx2 - Math.cos(LA2) * 0.34, 2.58, bz2 - Math.sin(LA2) * 0.34, 0.26, 0.22, 0x3a4a4c, { seg: 8 });
    R.pool(bx2 - Math.cos(LA2) * 0.7, 0.09, bz2 - Math.sin(LA2) * 0.7, 1.6);
  }

  R.pool(0, 0.09, 0, 3.0);
  R.pool(dx, 0.09, dz, 1.8);
  const p = R.world(0.6, 1.6);
  T.act('watch_in', p[0], p[1], 'Read the lens log', [
    'LENS LOG. every entry says "polished". the third one adds "guest still here". so does every one after it.',
    'the stair goes up and up. a sign at the bottom says KEEPER ONLY, in friendly lettering.',
    'the spare lens is propped against the wall, the size of a table. it is warm, and it is looking at you.',
  ], { r: 3.2, speaker: 'THE WATCHTOWER' });
}
