// ─────────────────────────────────────────────────────────────────────────────
// THE OUTSKIRTS
//   Whisker Heights 178,48 · Muscle Beach Gym 198,-26 · Fish Harbor 100,58
//   The Watchtower 218,30 + Not-An-Exit Beach 228,-6 · Yarn Hill 188,-64
//   and a bandstand + statue inside Catnip Commons 140,-58 (nature owns the rest)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL, frame, at, windowUnit, doorUnit, doorLeaf, block, tileRoof, flatRoof, awning, lamppost, bench, planter, crate, barrel, fence, hedge, sittingCat, loafCat, catEars, bunting, paving, ribbon, column, pool, wash, halo, cornice, balcony, humanFigure, billboard, hangingPlate } from './parts.js';
import { drawLines, board, catFace, humanFace, FONTS } from './signs.js';
import { ripple, catRail, spiralStyle, wroughtStyle, arcPts, RAILS } from './kit.js';
import { guestInterior, watchInterior, TOWER_STAIR } from './interiors.js';
import { buildWatchYard } from './outskirts_yard.js';
import { rng, hash } from '../../../core/util.js';

/** A round wall built from tangential slabs, with a doorway left out of it.
 *  Returns the world-space segments so the caller can make them solid.
 *  `o.gapWiden` pulls the two slabs either side of the doorway back by that much
 *  each: one dropped slab of an 18-sided ring is only ~1.19 wide, which is a
 *  doorway the player physically cannot fit through. */
function ringWall(b, x, y, z, r, h, color, o = {}) {
  const n = o.seg ?? 16, th = o.th ?? 0.45;
  const gapA = o.gapAng, gapH = o.gapHalf ?? 0, widen = o.gapWiden ?? 0;
  const step = Math.PI * 2 / n;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI * 2;
    let dA = a - (gapA ?? 0);
    while (dA > Math.PI) dA -= Math.PI * 2;
    while (dA < -Math.PI) dA += Math.PI * 2;
    const inGap = gapA != null && Math.abs(dA) < gapH;
    let w = 2 * r * Math.tan(Math.PI / n) + 0.06;
    let px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const ry = Math.PI / 2 - a;
    if (inGap) {
      if (o.lintel) b.box(px, y + o.lintel, pz, w + widen * 2, h - o.lintel, th, color, { ry, ao: 0 });
      continue;
    }
    // the two slabs that form the door jambs step back out of the opening
    if (widen > 0 && gapA != null && Math.abs(dA) < gapH + step) {
      const sgn = dA > 0 ? 1 : -1;
      w -= widen;
      px += sgn * (widen / 2) * -Math.sin(a);
      pz += sgn * (widen / 2) * Math.cos(a);
    }
    b.box(px, y, pz, w, h, th, color, { ry, ao: o.ao ?? 0, aoBase: y });
    segs.push({ x: px, z: pz, w, d: th, rot: ry });
  }
  return segs;
}

// A sign board on two posts, painted on BOTH faces so it reads from any angle.
function bigSign(T, x, z, ry, w, h, cell, o = {}) {
  const b = T.b, y = o.y ?? T.ground(x, z);
  const f = frame(x, y, z, ry);
  const ph = o.postH ?? (h + 1.9);
  for (const s of [-1, 1]) {
    const px = f.px(s * (w / 2 - 0.5), 0), pz = f.pz(s * (w / 2 - 0.5), 0);
    b.cyl(px - Math.sin(ry) * 0.35, y, pz - Math.cos(ry) * 0.35, 0.2, 0.24, ph, o.post ?? PAL.wood, { seg: 8, ao: 0.5, aoBase: y });
    b.sph(px - Math.sin(ry) * 0.35, y + ph + 0.15, pz - Math.cos(ry) * 0.35, 0.25, o.finial ?? PAL.gold, { seg: 7, rings: 5 });
  }
  b.box(f.x, y + ph - h - 0.3, f.z, w + 0.5, h + 0.6, 0.34, o.frame ?? PAL.trim[1], { ry, ao: 0 });
  b.sign(cell, f.px(0, 0.21), y + ph - h / 2 - 0.3, f.pz(0, 0.21), w, h, { ry, glow: o.glow });
  b.sign(o.back ?? cell, f.px(0, -0.21), y + ph - h / 2 - 0.3, f.pz(0, -0.21), w, h, { ry: ry + Math.PI, glow: o.glow });
  if (o.roof !== false) b.box(f.x, y + ph + 0.1, f.z, w + 1.0, 0.32, 0.9, PAL.roof[0], { ry, rx: -0.2, ao: 0 });
  T.col(f.px(-(w / 2 - 0.5), 0), f.pz(-(w / 2 - 0.5), 0), 0.5);
  T.col(f.px(w / 2 - 0.5, 0), f.pz(w / 2 - 0.5, 0), 0.5);
  return f;
}

// ═════════════════════════════════════════════════════════════════════════════
// WHISKER HEIGHTS — houses built to cat proportions
// ═════════════════════════════════════════════════════════════════════════════
// THE PLAN (Contract N: "too crowded with too many fences and few ways in or
// out"). Nine big houses and the Guest House are packed round a green, and
// the Guest House stands where the old green's west quarter was — so the green
// moved 7 u east into the one court the houses leave open (the point with the
// most clearance: 10.96 u to the nearest wall), and everything else is laid out
// round LANES: a ring lane round the green and five ways out, each a centreline
// + a width that no fence, hedge, bench, planter, lamp, scratching post or
// mailbox may touch. Every garden element asks laneClear() before it is built
// (the houses that face the green head-on keep their flank fences only), and
// tools/_tmp/heights_check.mjs proves the built result: no collider in
// ctx.colliders intersects a lane polygon, and a pushOut-legal walker gets
// from every entry to the green and to every front door within 1.6× the
// straight line. The ways out follow the medial line between the houses'
// (honest) footprints, so each is its full 3 u at its narrowest pinch.
const HG = { x: 185, z: 48.25 };
export const HEIGHTS_PLAN = {
  green: { x: HG.x, z: HG.z, r: 5.6 },
  ring: { x: HG.x, z: HG.z, rIn: 5.6, rOut: 9.0 },
  lanes: [
    // west: the cat_main path end, between the tabby's and the grey's houses, to Purrliament Square
    { id: 'west', to: 'Purrliament Square', width: 3.0, pts: [[178.9, 44.2], [171.1, 39.4], [171.04, 36.5], [170.5, 33.5], [169.7, 30.0], [168.6, 24.5]] },
    // north: between the grey's and the calico's houses, round the back of the calico's and up
    // the east side of the lilac house, to the open ground below the gym road
    { id: 'north', to: 'the gym road', width: 3.0, pts: [[185.0, 41.8], [185.1, 37.0], [185.44, 36.0], [185.9, 33.0], [186.4, 29.3], [187.5, 27.2], [189.2, 26.42], [190.0, 26.46], [192.0, 26.98], [194.0, 27.38], [195.6, 26.6], [196.4, 24.5], [197.2, 18.5], [198.0, 11.0]] },
    // east: the lighthouse path, between the calico's and the ginger's houses
    { id: 'east', to: 'the Watchtower', width: 3.0, pts: [[187.8, 41.4], [194.0, 41.66], [196.0, 41.6], [198.0, 41.18], [200.0, 40.68], [202.0, 39.8], [206.5, 38.6]] },
    // south: past the Guest House door and out between the white and the siamese houses
    { id: 'south', to: 'Fish Harbor', width: 3.0, pts: [[179.0, 52.4], [172.6, 57.0], [170.7, 60.0], [170.3, 62.0], [169.4, 65.0], [168.6, 68.0], [167.6, 73.5]] },
    // south-east: between the white and the tuxedo houses, down to the shore
    { id: 'southeast', to: 'the shore', width: 3.0, pts: [[185.3, 55.6], [185.3, 59.0], [185.6, 61.0], [186.4, 64.0], [187.3, 68.0], [188.4, 73.5]] },
  ],
  entries: [
    { id: 'W', lane: 'west', x: 168.6, z: 24.5 }, { id: 'N', lane: 'north', x: 198.0, z: 11.0 },
    { id: 'E', lane: 'east', x: 206.5, z: 38.6 }, { id: 'S', lane: 'south', x: 167.6, z: 73.5 },
    { id: 'SE', lane: 'southeast', x: 188.4, z: 73.5 },
  ],
  doors: [],          // filled by buildHeights: the doormat in front of every front door
  lamps: [],          // filled by buildHeights: the ring's lamps [x, z]
  kerb: [],           // filled by buildHeights: the kerb-side clusters [x, z, kind]
};
function segDist(px, pz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / l2)) : 0;
  return Math.hypot(px - ax - ex * t, pz - az - ez * t);
}
/** Is a disc (x, z, r) at least m clear of the ring lane and of every way out?
 *  (inside the green is fine: that is where the benches and lamps stand) */
function laneClear(x, z, r, m = 0.25) {
  const R = HEIGHTS_PLAN.ring, dr = Math.hypot(x - R.x, z - R.z);
  if (dr + r + m > R.rIn && dr - r - m < R.rOut) return false;
  for (const L of HEIGHTS_PLAN.lanes) {
    const lim = L.width / 2 + r + m, p = L.pts;
    for (let i = 0; i < p.length - 1; i++) if (segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) < lim) return false;
  }
  return true;
}
/** Nothing SOLID registered yet within r of (x, z)? (build-time placement) */
function solidClear(T, x, z, r) {
  for (const c of T.ctx.colliders) {
    if (!c || c.solid === false) continue;
    const dx = x - c.x, dz = z - c.z;
    if (c.box) {
      if (Math.hypot(dx, dz) > Math.hypot(c.w || 0, c.d || 0) / 2 + r) continue;
      const cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0), lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
      if (Math.hypot(Math.max(Math.abs(lx) - c.w / 2, 0), Math.max(Math.abs(lz) - c.d / 2, 0)) < r) return false;
    } else if (c.r > 0 && Math.hypot(dx, dz) < c.r + r) return false;
  }
  return true;
}
/** The same for an oriented box (kit yaw ry): discs down its long axis. */
function boxLaneClear(x, z, w, d, ry, m = 0.25) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const long = Math.max(w, d), short = Math.min(w, d), n = Math.max(1, Math.ceil(long / Math.max(short, 0.3)));
  const step = long / n, r = Math.hypot(short / 2, step / 2);
  for (let i = 0; i < n; i++) {
    const u = -long / 2 + step * (i + 0.5), lx = w >= d ? u : 0, lz = w >= d ? 0 : u;
    if (!laneClear(x + lx * c + lz * s, z - lx * s + lz * c, r, m)) return false;
  }
  return true;
}

/** A gable roof that faces the right way out. kit.js's b.roof() prism is wound
 *  inside out (the normals of both slopes point in and down), so from outside
 *  both slopes are back faces and get culled: every roof on the hill read as its
 *  eaves slab plus the underside of the far slope lit from below, a "flat grey
 *  slab with coloured ribs floating over it", and the dormer roofs were missing
 *  altogether. Two of kit's wedges back to back (the wedge IS wound outward)
 *  build the same prism: ridge along local Z, slopes falling to ±X, bottom at y.
 *  It is lifted `lift` so it still wins cleanly if the prism is ever turned the
 *  right way out, and it stays under the ribs and ridge tiles tileRoof lays on it. */
function gableRoof(b, x, y, z, w, h, d, color, ry, lift = 0.04) {
  const c = Math.cos(ry), s = Math.sin(ry), q = w / 4;
  b.wedge(x + q * c, y + lift, z - q * s, w / 2, h, d, color, { ry, ao: 0 });
  b.wedge(x - q * c, y + lift, z + q * s, w / 2, h, d, color, { ry: ry + Math.PI, ao: 0 });
}

/** The Heights' front door: a big cat door under a round fanlight, and the
 *  small, grudging HUMANS door beside it. parts.js doorUnit's solid-door head
 *  was a half-disc standing on its side (its thetaStart 0 is the half BESIDE the
 *  centre once rx turns the disc into the wall plane), so on every house on the
 *  hill a cream half-moon hung across the top of the door like a paper fin.
 *  This one is a real round head, all of it flush on the wall (0.29 proud at the
 *  keystone): the leaf stops at the springing, and over it a semicircular
 *  fanlight (glass lit from inside after dark like every window here, a gilt
 *  sunburst and hub, a ring in the house's trim) set in a cream archivolt, locked
 *  by a keystone with ears on it. The doorway is still 2.8 × 4.2 ("the doors are
 *  four metres tall"); the crown sits under the upper windows' sills. */
function heightsDoor(T, f, lx, lz, o) {
  const b = T.b, { ry } = f, W = o.w, H = o.h;
  const X = (a, c) => f.px(a, c), Z = (a, c) => f.pz(a, c);
  const sur = o.surround, trim = o.trim, gilt = PAL.gold;
  const Ra = W / 2 + 0.25, Rt = Ra - 0.24, Rg = Rt - 0.14;   // archivolt · trim ring · glass
  const ys = f.y + H - Ra + 0.25, LH = ys - f.y;              // the springing = the leaf's head
  const arc = { ry, rx: Math.PI / 2, seg: 18, theta: Math.PI, thetaStart: Math.PI / 2, ao: 0 };
  // the surround (jambs and the flat between them) up to the springing
  b.box(X(lx, lz + 0.02), f.y, Z(lx, lz + 0.02), W + 0.5, LH, 0.24, sur, { ry, ao: 0.5, aoBase: f.y });
  // the round head: archivolt (face lz + 0.16), trim ring (+0.20), glass (+0.21)
  b.cyl(X(lx, lz - 0.1), ys, Z(lx, lz - 0.1), Ra, Ra, 0.26, sur, arc);
  b.cyl(X(lx, lz - 0.1), ys, Z(lx, lz - 0.1), Rt, Rt, 0.3, trim, arc);
  b.cyl(X(lx, lz - 0.1), ys, Z(lx, lz - 0.1), Rg, Rg, 0.31, PAL.glass, { ...arc, mat: 'win' });
  for (let i = 1; i <= 5; i++) {                              // the sunburst
    const ang = (Math.PI * i) / 6;
    b.box(X(lx, lz + 0.215), ys, Z(lx, lz + 0.215), 0.08, Rg, 0.03, gilt, { ry, rz: ang - Math.PI / 2, ao: 0 });
  }
  b.cyl(X(lx, lz - 0.1), ys, Z(lx, lz - 0.1), 0.34, 0.34, 0.34, gilt, arc);                      // hub
  b.box(X(lx, lz + 0.1), ys - 0.12, Z(lx, lz + 0.1), W + 0.14, 0.2, 0.3, trim, { ry, ao: 0 });     // transom bar (face +0.25)
  // the keystone, proud of everything, and its ears
  const ky = ys + Rg - 0.1, kh = Ra - Rg + 0.24;
  b.box(X(lx, lz + 0.08), ky, Z(lx, lz + 0.08), 0.5, kh, 0.42, sur, { ry, ao: 0, shade: 1.04 });
  b.box(X(lx, lz + 0.09), ky + kh, Z(lx, lz + 0.09), 0.66, 0.1, 0.46, sur, { ry, ao: 0, shade: 0.94 });
  // (no ears where the window box upstairs comes down to meet them: o.ceil)
  if (ky + kh + 0.42 < (o.ceil ?? Infinity)) catEars(b, X(lx, lz + 0.1), ky + kh + 0.08, Z(lx, lz + 0.1), 0.2, 0.3, sur, { ry, seg: 5, inner: trim });
  // the dark reveal, the leaf with its cat flap, a handle at cat height
  b.box(X(lx, lz + 0.12), f.y, Z(lx, lz + 0.12), W, LH, 0.1, 0x1b1410, { ry, ao: 0 });
  doorLeaf(b, f, lx, lz, W, LH, o.color);
  b.sph(X(lx + W * 0.32, lz + 0.3), f.y + 1.5, Z(lx + W * 0.32, lz + 0.3), 0.13, gilt, { seg: 6, rings: 4 });
  // the human door, half a metre off the surround, with its label
  const hx = lx + (o.humanSide ?? 1) * (W / 2 + 0.75), hy = f.y;
  b.box(X(hx, lz + 0.02), hy, Z(hx, lz + 0.02), 1.02, 2.0, 0.2, sur, { ry, ao: 0.4, aoBase: hy });
  b.box(X(hx, lz + 0.14), hy, Z(hx, lz + 0.14), 0.78, 1.82, 0.12, 0xb8552f, { ry, ao: 0.4, aoBase: hy });
  b.sph(X(hx + 0.26, lz + 0.22), hy + 1.0, Z(hx + 0.26, lz + 0.22), 0.07, PAL.chrome, { seg: 6, rings: 4, mat: 'metal' });
  if (o.humanSignCell) b.sign(o.humanSignCell, X(hx, lz + 0.24), hy + 2.16, Z(hx, lz + 0.24), 1.0, 0.3, { ry });
  // step + doormat
  b.box(X(lx, lz + 0.62), f.y - 0.02, Z(lx, lz + 0.62), W + 1.0, 0.16, 1.0, PAL.stone, { ry, ao: 0 });
  b.box(X(lx, lz + 0.72), f.y + 0.14, Z(lx, lz + 0.72), W * 0.7, 0.05, 0.6, 0x6b5a3e, { ry, ao: 0 });
}

function catHouse(T, f, o) {
  const b = T.b, { ry } = f;
  const w = o.w, d = o.d, h = o.h;
  block(b, f, w, h, d, o.wall, { quoins: o.quoins, plinthColor: PAL.stone, bandColor: o.band ?? PAL.stoneLight, sink: 1.1 });
  // 20° pitch and a hue per house. Whisker Heights used to be nine 30° gables
  // in four shades of the same red, which from the hill road is one roof.
  tileRoof(b, f, w, 0, d, o.roof, {
    top: h, alongX: o.alongX !== false, pitch: o.pitch ?? 0.35, kind: o.roofKind || 'tile',
    eave: o.band ?? PAL.stoneLight, ridgeColor: o.ridge,
  });
  {
    // …and the slopes themselves, which kit's inside-out gable never showed
    const along = o.alongX !== false, rw = (along ? d : w) + 1.1, rd = (along ? w : d) + 1.1;
    gableRoof(b, f.x, f.y + h, f.z, rw, Math.tan(o.pitch ?? 0.35) * rw / 2, rd, o.roof, ry + (along ? Math.PI / 2 : 0));
  }
  // a deep eaves fascia + a moulded band under it, so what the eye measures is
  // the WALL, not the tile
  cornice(b, f, 0, d / 2 + 0.16, f.y + h - 1.0, w + 0.6, o.band ?? PAL.stoneLight, { capColor: o.trim, d: 0.42, dentils: false });
  // enormous windows with deep sills
  const fz = d / 2;
  heightsDoor(T, f, -w * 0.24, fz + 0.02, { w: 2.8, h: 4.2, color: o.trim, trim: o.trim, surround: o.band ?? PAL.stoneLight, humanSide: 1, humanSignCell: T.humansLabel(), ceil: f.y + h - 3.5 });
  windowUnit(b, f, w * 0.26, fz, 1.5, 3.0, 3.0, { trim: o.trim, cushion: true, cushionColor: o.cushion ?? PAL.cloth[0] });
  loafCat(b, f.px(w * 0.26 + 0.3, fz + 0.36), f.y + 1.68, f.pz(w * 0.26 + 0.3, fz + 0.36), 1.5, PAL.fur[Math.abs(Math.round(w * 3)) % PAL.fur.length], { ry: ry + 1.6 });
  for (let i = 0; i < 2; i++) windowUnit(b, f, (i - 0.5) * w * 0.5, fz, h - 3.3, 2.4, 2.4, { trim: o.trim, flowers: i === 0, cushion: i === 1, cushionColor: o.cushion ?? PAL.cloth[1] });
  // side elevation gets one too. This frame's origin IS the side wall, so the
  // window sits at lz 0: at lz d/2 − 0.5 it stood alone in the grass 4 u off the
  // house — a window frame in the middle of the gap between two houses, in the
  // way of the lanes. Sill at 2.4, over a visitor's head in a 3 u alley.
  const sf = frame(f.px(w / 2, 0), f.y, f.pz(w / 2, 0), ry + Math.PI / 2);
  windowUnit(b, sf, 0.3, 0, 2.6, 2.4, 2.6, { trim: o.trim, cushionColor: o.cushion ?? PAL.cloth[2] });
  const bf = frame(f.x, f.y, f.z, ry + Math.PI);
  windowUnit(b, bf, 0, fz, h - 3.3, 2.2, 2.2, { trim: o.trim, shutters: false });

  // ── the tower ─────────────────────────────────────────────────────────────
  // Every house on the hill used to grow the SAME stacked cat-tree turret, and
  // eight identical cream/red/teal towers in one frame read as a prop grid.
  // Three patterns now, assigned per house (o.tower 0 | 1 | 2).
  const tw = at(f, o.towerAng ?? 1.35, Math.max(w, d) * 0.52);
  const style = o.tower ?? 0;
  const band = o.band ?? PAL.stoneLight;
  let ty = f.y, tr = 2.1;
  b.cyl(tw.x, f.y - 1.0, tw.z, 2.5, 2.8, 1.4, PAL.stone, { seg: 10, ao: 0 });
  if (style === 0) {
    // 0 · THE CAT TREE — stacked drums with sisal platforms
    for (let i = 0; i < (o.tiers ?? 3); i++) {
      const th = 3.0 + (i % 2) * 0.8;
      b.cyl(tw.x, ty, tw.z, tr * 0.86, tr, th, i % 2 ? o.wall : band, { seg: 10, ao: 0.5, aoBase: f.y, aoH: 3 });
      ty += th;
      b.cyl(tw.x, ty, tw.z, tr + 0.75, tr + 0.75, 0.42, o.trim, { seg: 10, ao: 0 });   // platform
      b.torus(tw.x, ty + 0.44, tw.z, tr + 0.72, 0.12, band, { rx: -Math.PI / 2, seg: 10, tseg: 3 });
      ty += 0.42;
      if (i < 2) {
        b.quad(tw.x + (tr + 0.02) * Math.sin(ry + 0.6), ty - th * 0.55, tw.z + (tr + 0.02) * Math.cos(ry + 0.6), 1.5, 1.7, PAL.glass, { ry: ry + 0.6, mat: 'win' });
        wash(b, tw.x + (tr + 0.16) * Math.sin(ry + 0.6), ty - th * 0.55, tw.z + (tr + 0.16) * Math.cos(ry + 0.6), 2.7, 3.0, ry + 0.6);
      }
      tr *= 0.88;
    }
    b.cone(tw.x, ty, tw.z, tr + 0.8, 2.2, o.roof, { seg: 10, ao: 0 });
    catEars(b, tw.x, ty + 1.9, tw.z, tr * 0.62, 1.3, o.roof, { inner: PAL.gold, seg: 7, ry });
    b.sph(tw.x, ty + 3.4, tw.z, 0.3, PAL.gold, { seg: 7, rings: 5 });
    T.col(tw.x, tw.z, 2.6);
  } else if (style === 1) {
    // 1 · THE BELVEDERE — a square shaft, a railed lookout, a pyramid cap and a
    //     weathervane cat that always points at the harbour
    const TH2 = o.towerH ?? 10.5, sq = 3.0;
    b.box(tw.x, f.y, tw.z, sq, TH2, sq, o.wall, { ry, ao: 0.7, aoBase: f.y, aoH: 3 });
    for (let i = 0; i < 3; i++) b.box(tw.x, f.y + 2.6 + i * 2.6, tw.z, sq + 0.34, 0.3, sq + 0.34, band, { ry, ao: 0 });
    for (const sx of [-1, 1]) for (let i = 0; i < Math.floor(TH2 / 1.2); i++) {
      b.box(tw.x + sx * (sq / 2 - 0.22) * Math.cos(ry), f.y + 0.5 + i * 1.2, tw.z - sx * (sq / 2 - 0.22) * Math.sin(ry), 0.44, 0.55, sq + 0.1, i % 2 ? band : o.trim, { ry, ao: 0 });
    }
    for (let i = 0; i < 2; i++) {
      const a2 = ry + i * Math.PI / 2;
      b.box(tw.x + Math.sin(a2) * (sq / 2 + 0.02), f.y + TH2 - 3.4, tw.z + Math.cos(a2) * (sq / 2 + 0.02), 1.3, 2.2, 0.2, PAL.stoneLight, { ry: a2, ao: 0 });
      b.quad(tw.x + Math.sin(a2) * (sq / 2 + 0.14), f.y + TH2 - 2.3, tw.z + Math.cos(a2) * (sq / 2 + 0.14), 1.0, 1.8, PAL.glass, { ry: a2, mat: 'win' });
      wash(b, tw.x + Math.sin(a2) * (sq / 2 + 0.3), f.y + TH2 - 2.3, tw.z + Math.cos(a2) * (sq / 2 + 0.3), 2.0, 3.0, a2);
    }
    // the lookout deck + railing
    b.box(tw.x, f.y + TH2, tw.z, sq + 2.0, 0.3, sq + 2.0, band, { ry, ao: 0 });
    for (let i = 0; i < 4; i++) {
      const a2 = ry + i * Math.PI / 2, off = (sq + 2.0) / 2 - 0.12;
      b.box(tw.x + Math.sin(a2) * off, f.y + TH2 + 0.3, tw.z + Math.cos(a2) * off, sq + 2.0, 0.95, 0.12, o.trim, { ry: a2, ao: 0, mat: 'metal' });
      b.box(tw.x + Math.sin(a2) * off, f.y + TH2 + 1.18, tw.z + Math.cos(a2) * off, sq + 2.1, 0.14, 0.2, band, { ry: a2, ao: 0 });
    }
    loafCat(b, tw.x + Math.sin(ry + 0.9) * 1.5, f.y + TH2 + 0.3, tw.z + Math.cos(ry + 0.9) * 1.5, 1.3, PAL.fur[Math.abs(Math.round(w * 5)) % PAL.fur.length], { ry: ry + 2.0 });
    b.cone(tw.x, f.y + TH2 + 1.34, tw.z, 2.5, 2.6, o.roof, { seg: 4, ry: ry + Math.PI / 4, ao: 0 });
    b.cyl(tw.x, f.y + TH2 + 3.9, tw.z, 0.07, 0.09, 1.5, 0x3a4a4c, { seg: 6, mat: 'metal', ao: 0 });
    // the weathervane cat
    const vane = T.part((p) => {
      p.box(0, -0.06, 0, 1.9, 0.1, 0.06, 0x3a4a4c, { ao: 0, mat: 'metal' });
      p.cone(-1.1, 0, 0, 0.22, 0.5, 0x3a4a4c, { seg: 4, rz: Math.PI / 2, ao: 0, mat: 'metal' });
      loafCat(p, 0.55, 0.0, 0, 1.0, PAL.gold, { mat: 'metal', ry: Math.PI / 2 });
    }, 'vane' + Math.round(f.x));
    vane.position.set(tw.x, f.y + TH2 + 5.5, tw.z);
    T.anim((t) => { vane.rotation.y = Math.sin(t * 0.23 + f.x) * 0.6 + 1.1; });
    T.col(tw.x, tw.z, 2.3);
  } else {
    // 2 · THE DOVECOTE — a fat tapering drum, an arcade of cat-holes near the
    //     top, a shallow lead dome, and the ladder nobody has ever climbed
    const TH2 = o.towerH ?? 8.4;
    b.cyl(tw.x, f.y, tw.z, 2.25, 2.75, TH2, o.wall, { seg: 14, ao: 0.7, aoBase: f.y, aoH: 3 });
    for (const yy of [TH2 * 0.34, TH2 * 0.66]) b.torus(tw.x, f.y + yy, tw.z, 2.75 - (yy / TH2) * 0.5, 0.16, band, { rx: -Math.PI / 2, seg: 16, tseg: 4 });
    for (let i = 0; i < 8; i++) {
      const a2 = i / 8 * Math.PI * 2 + ry;
      const rr = 2.3;
      b.box(tw.x + Math.sin(a2) * rr, f.y + TH2 - 2.1, tw.z + Math.cos(a2) * rr, 0.66, 0.8, 0.24, 0x2a2119, { ry: a2, ao: 0 });
      b.cyl(tw.x + Math.sin(a2) * rr, f.y + TH2 - 1.3, tw.z + Math.cos(a2) * rr, 0.33, 0.33, 0.24, 0x2a2119, { seg: 8, ry: a2, rx: Math.PI / 2, theta: Math.PI, ao: 0 });
      b.box(tw.x + Math.sin(a2) * (rr + 0.12), f.y + TH2 - 2.35, tw.z + Math.cos(a2) * (rr + 0.12), 1.0, 0.16, 0.5, band, { ry: a2, ao: 0 });  // landing ledge
    }
    b.cyl(tw.x, f.y + TH2, tw.z, 2.9, 2.55, 0.3, band, { seg: 14, ao: 0 });
    b.sph(tw.x, f.y + TH2 + 0.3, tw.z, 2.75, o.roof, { seg: 16, rings: 8, phiLength: Math.PI / 2, sy: 0.62 });
    for (let i = 0; i < 10; i++) { const a2 = i / 10 * Math.PI * 2; b.cyl(tw.x + Math.cos(a2) * 1.9, f.y + TH2 + 0.3, tw.z + Math.sin(a2) * 1.9, 0.04, 0.09, 2.2, o.trim, { seg: 4, rz: Math.cos(a2) * 0.62, rx: -Math.sin(a2) * 0.62, ao: 0 }); }
    b.cyl(tw.x, f.y + TH2 + 1.95, tw.z, 0.24, 0.4, 0.5, band, { seg: 10, ao: 0 });
    b.sph(tw.x, f.y + TH2 + 2.75, tw.z, 0.42, PAL.gold, { seg: 8, rings: 6 });
    catEars(b, tw.x, f.y + TH2 + 2.0, tw.z, 0.8, 1.1, o.roof, { inner: PAL.gold, seg: 7, ry });
    // the ladder, on the tower's far side from the house (at ry + 2.4 it stood
    // in the slot between drum and wall and read as leaning on the roof)
    const la = ry + (o.towerAng ?? 1.35) + 0.45;
    for (const sx of [-1, 1]) b.cyl(tw.x + Math.sin(la) * 2.72 + Math.cos(la) * sx * 0.34, f.y, tw.z + Math.cos(la) * 2.72 - Math.sin(la) * sx * 0.34, 0.07, 0.08, TH2 - 1.6, 0x8d5a34, { seg: 5, ao: 0 });
    for (let i = 0; i < 9; i++) b.box(tw.x + Math.sin(la) * 2.72, f.y + 0.7 + i * 0.75, tw.z + Math.cos(la) * 2.72, 0.72, 0.09, 0.09, 0x8d5a34, { ry: la, ao: 0 });
    T.col(tw.x, tw.z, 2.9);
  }

  // ── DORMERS ───────────────────────────────────────────────────────────────
  // Two per house, punched out of the front slope. Every square metre of roof a
  // dormer occupies is a square metre of FACADE instead — which is the whole
  // argument with this hill: from the game camera the roofs were the building.
  const rH = Math.tan(o.pitch ?? 0.35) * ((o.alongX !== false ? d : w) + 1.1) / 2;
  const halfSlope = ((o.alongX !== false ? d : w) + 1.1) / 2;
  const dormAt = o.dormers ?? [-w * 0.27, w * 0.27];   // o.dormers: [] for none, one entry for one
  for (let i = 0; i < dormAt.length; i++) {
    const lx = dormAt[i], lz = d * 0.24;
    const surf = f.y + h + rH * (1 - lz / halfSlope);
    const dw = 1.9, dd = 1.7, dh = 1.75;
    b.box(f.px(lx, lz), f.y + h + 0.1, f.pz(lx, lz), dw, dh + (surf - f.y - h), dd, o.wall, { ry, ao: 0 });
    // (its own gable: b.roof here was the inside-out prism, i.e. no roof at all)
    const dY = f.y + h + 0.1 + dh + (surf - f.y - h);
    gableRoof(b, f.px(lx, lz - 0.05), dY, f.pz(lx, lz - 0.05), dw + 0.7, 0.72, dd + 0.75, o.roof, ry, 0);
    // and every dormer on the hill has ears, at the front of its ridge
    catEars(b, f.px(lx, lz + dd / 2 + 0.05), dY + 0.4, f.pz(lx, lz + dd / 2 + 0.05), 0.36, 0.66, o.roof, { ry, seg: 6, inner: o.band ?? PAL.stoneLight, splay: 0.2 });
    b.box(f.px(lx, lz + dd / 2 + 0.04), surf + dh - 0.1, f.pz(lx, lz + dd / 2 + 0.04), dw + 0.5, 0.2, 0.44, o.band ?? PAL.stoneLight, { ry, ao: 0 });
    // its window, its sill, and — of course — a cat on the sill
    b.box(f.px(lx, lz + dd / 2 + 0.02), surf + 0.35, f.pz(lx, lz + dd / 2 + 0.02), 1.42, 1.18, 0.14, o.trim, { ry, ao: 0 });
    b.quad(f.px(lx, lz + dd / 2 + 0.12), surf + 0.94, f.pz(lx, lz + dd / 2 + 0.12), 1.2, 1.0, PAL.glass, { ry, mat: 'win' });
    b.box(f.px(lx, lz + dd / 2 + 0.14), surf + 0.94, f.pz(lx, lz + dd / 2 + 0.14), 0.07, 1.0, 0.05, o.trim, { ry, ao: 0 });
    wash(b, f.px(lx, lz + dd / 2 + 0.26), surf + 1.0, f.pz(lx, lz + dd / 2 + 0.26), 2.2, 2.4, ry);
    b.box(f.px(lx, lz + dd / 2 + 0.28), surf + 0.24, f.pz(lx, lz + dd / 2 + 0.28), 1.9, 0.18, 0.62, o.band ?? PAL.stoneLight, { ry, ao: 0 });
    if (i === 0) loafCat(b, f.px(lx + 0.2, lz + dd / 2 + 0.4), surf + 0.42, f.pz(lx + 0.2, lz + dd / 2 + 0.4), 1.05, PAL.fur[(i + Math.round(w * 2)) % PAL.fur.length], { ry: ry + 1.5 });
  }

  // ── the roof lantern ──────────────────────────────────────────────────────
  // A glazed cupola with real glazing bars and a lead cap, not the blue egg it
  // used to be (a 1.25 emissive hemisphere on every roof on the hill).
  const sr = at(f, -1.3, Math.min(w, d) * 0.22);
  const srY = f.y + h + rH * 0.42;
  b.box(sr.x, srY, sr.z, 2.5, 0.24, 2.5, o.band ?? PAL.stoneLight, { ry, ao: 0 });
  b.cyl(sr.x, srY + 0.24, sr.z, 1.05, 1.12, 1.05, o.band ?? PAL.stoneLight, { seg: 8, ry, ao: 0 });
  for (let i = 0; i < 8; i++) {
    const a2 = ry + i / 8 * Math.PI * 2 + Math.PI / 8;
    b.quad(sr.x + Math.sin(a2) * 1.0, srY + 0.78, sr.z + Math.cos(a2) * 1.0, 0.8, 0.82, 0x7fb6c4, { ry: a2, mat: 'win' });
    b.box(sr.x + Math.sin(a2) * 1.06, srY + 0.24, sr.z + Math.cos(a2) * 1.06, 0.1, 1.05, 0.1, o.trim, { ry: a2, ao: 0 });
  }
  b.cyl(sr.x, srY + 1.29, sr.z, 1.38, 1.22, 0.18, o.trim, { seg: 8, ry, ao: 0 });
  b.cone(sr.x, srY + 1.47, sr.z, 1.3, 0.86, o.roof, { seg: 8, ry: ry + Math.PI / 8, ao: 0 });
  b.sph(sr.x, srY + 2.5, sr.z, 0.22, PAL.gold, { seg: 7, rings: 5 });
  wash(b, sr.x, srY + 0.8, sr.z + 1.2, 3.0, 2.2, ry);

  // ── exterior scratching posts ─────────────────────────────────────────────
  // Against the wall at a corner (o.posts: [sx, sz] = local (sx·(w/2−0.62),
  // sz·(d/2+0.62)), front corners by default), not 0.3 out in front of the
  // window where they used to stand; solid now, and never in a lane.
  const taken = [];                                          // world discs [x, z, r] the garden may not overlap
  const free = (x, z, r) => taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) >= r + tr + 0.06);
  for (const [sx, sz] of (o.posts ?? [[-1, 1], [1, 1]])) {
    const lx = sx * (w / 2 - 0.62), lz = sz * (fz + 0.62);
    const p = { x: f.px(lx, lz), z: f.pz(lx, lz) };
    if (!laneClear(p.x, p.z, 0.62)) continue;
    taken.push([p.x, p.z, 0.62]);
    b.cyl(p.x, f.y, p.z, 0.55, 0.62, 5.2, 0xd9b483, { seg: 10, ao: 0.5, aoBase: f.y });
    for (let i = 0; i < 4; i++) b.torus(p.x, f.y + 0.7 + i * 1.15, p.z, 0.62, 0.13, i % 2 ? 0xc9a271 : 0xe4c69a, { rx: -Math.PI / 2, seg: 8, tseg: 3 });
    b.cyl(p.x, f.y + 5.2, p.z, 0.95, 0.95, 0.3, o.trim, { seg: 10, ao: 0 });
    T.col(p.x, p.z, 0.62);
  }

  // ── garden (Contract N) ───────────────────────────────────────────────────
  // A front garden, not a paddock. The old one was an arc of radius
  // 0.75·max(w,d)+3.2 (≈ 10.5 u) round the house centre: 6 u deep, and the
  // nine of them overlapped into corridors and dead ends. Now: a picket bow
  // from front corner to front corner reaching ≤ 0.6 of that radius (≈ 2 u in
  // front of the wall), a GATE in front of the door, and nothing in a lane —
  // any stretch of fence, the hedge, the planter or the mailbox that would
  // stand in the ring lane or a way out is simply not built there, so a house
  // that faces the green head-on keeps its flank fences only. o.garden 0: no
  // fence (the two houses whose front gardens the Guest House was built in);
  // o.open ±1 leaves that flank unfenced, open to the way out beside it.
  const reach = Math.min(o.garden ?? 0.6, 0.6) * (Math.max(w, d) * 0.75 + 3.2);
  const D = Math.min(2.2, reach - fz), WG = w / 2 + 0.25;  // bow depth · half-width (0.1 outside the plinth)
  const dlx = -w * 0.24, GATE = 1.25;                       // the front door (doorUnit above) · half the gate
  const fenceCol = o.fence ?? 0xf6ead0, gnd = (x, z) => T.ground(x, z);
  const P = (lx, lz) => [f.px(lx, lz), f.pz(lx, lz)];
  const bow = (a) => P(Math.sin(a) * WG, fz + Math.cos(a) * D);
  let gateL = null, gateR = null;
  const aL = Math.asin((dlx - GATE) / WG), aR = Math.asin((dlx + GATE) / WG);
  if (D >= 1.2) {
    for (const [a0, a1, side] of [[-Math.PI / 2, aL, -1], [aR, Math.PI / 2, 1]]) {
      if (o.open === side) continue;                        // this flank stays open to the lane beside it
      const n = Math.max(1, Math.round(Math.abs(a1 - a0) * (WG + D) / 2 / 1.1));
      const runs = [];
      let run = [];
      for (let i = 0; i <= n; i++) {
        const p = bow(a0 + (a1 - a0) * i / n);
        if (run.length) {
          const q = run[run.length - 1], len = Math.hypot(p[0] - q[0], p[1] - q[1]), mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
          if (!boxLaneClear(mx, mz, 0.3, len, Math.atan2(p[0] - q[0], p[1] - q[1])) || !free(mx, mz, 0.15) || !free(p[0], p[1], 0.15)) { runs.push(run); run = []; }
        }
        if (!run.length && (!laneClear(p[0], p[1], 0.15) || !free(p[0], p[1], 0.15))) continue;
        run.push(p);
      }
      runs.push(run);
      for (const r of runs) {
        let len = 0; for (let i = 1; i < r.length; i++) len += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
        if (len < 1.5) continue;
        fence(T.b, r, f.y, { h: 1.15, color: fenceCol, ground: gnd });
        // the run that still reaches the gate gets its gate post
        const gp = bow(side < 0 ? a1 : a0), end = side < 0 ? r[r.length - 1] : r[0];
        if (Math.hypot(end[0] - gp[0], end[1] - gp[1]) < 0.01) { if (side < 0) gateL = gp; else gateR = gp; }
      }
    }
  }
  // gate posts (square, capped, a size up from the pickets) and the gate
  // itself, standing open inside the garden: every garden says come in
  for (const gp of [gateL, gateR]) {
    if (!gp) continue;
    const gy = T.ground(gp[0], gp[1]);
    b.box(gp[0], gy, gp[1], 0.26, 1.5, 0.26, fenceCol, { ry, ao: 0.4, aoBase: gy });
    b.sph(gp[0], gy + 1.62, gp[1], 0.17, o.trim, { seg: 7, rings: 5 });
    T.wall(gp[0], gp[1], 0.34, 0.34, ry);
  }
  if (gateR) {
    // hinged on the right post, swung 75° in: three pickets + two rails
    const gy = T.ground(gateR[0], gateR[1]), ga = ry + Math.PI - 1.3;   // −x_house turned 75° toward the house
    const gf = frame(gateR[0], gy, gateR[1], ga);
    for (let i = 0; i < 3; i++) b.box(gf.px(0.3 + i * 0.36, -0.1), gy + 0.05, gf.pz(0.3 + i * 0.36, -0.1), 0.1, 1.05, 0.08, fenceCol, { ry: ga, ao: 0 });
    for (const yy of [0.32, 0.8]) b.box(gf.px(0.66, -0.1), gy + yy, gf.pz(0.66, -0.1), 1.0, 0.09, 0.07, fenceCol, { ry: ga, ao: 0 });
  }
  // a clipped box hedge under the big window (lower than its sill), the
  // fish-shaped mailbox inside the gate, a planter outside it
  {
    const hx = w * 0.26, hz = fz + 0.95, [x, z] = P(hx, hz), ends = [P(hx - 1.0, hz), P(hx + 1.0, hz)];
    if (boxLaneClear(x, z, 2.6, 0.7, ry) && free(x, z, 0.4) && ends.every(([ex, ez]) => free(ex, ez, 0.4))) {
      // SOLID, not a 1.15 u step: as a low prop the visitor auto-hopped onto it
      // wherever a route brushed the garden, and was held there (N→tabby)
      hedge(b, x, f.y, z, 2.6, 0.7, 0.8, { ry, collide: false });
      T.wall(x, z, 2.6, 0.7, ry);
      taken.push([x, z, 0.4], ...ends.map(([ex, ez]) => [ex, ez, 0.4]));
    }
  }
  {
    const [mx, mz] = gateL ? P(dlx - GATE - 0.3, fz + Math.cos(aL) * D - 0.45) : P(dlx - 2.35, fz + 1.0);
    if (laneClear(mx, mz, 0.4) && free(mx, mz, 0.3)) {
      const my = T.ground(mx, mz);
      b.cyl(mx, my, mz, 0.12, 0.14, 1.5, PAL.wood, { seg: 6, ao: 0.4, aoBase: my });
      b.sph(mx, my + 1.8, mz, 0.55, o.trim, { seg: 9, rings: 6, sx: 1.5, sy: 0.75, ry: ry + 1.2 });
      b.cone(mx - Math.sin(ry + 1.2) * 0.8, my + 1.8, mz - Math.cos(ry + 1.2) * 0.8, 0.4, 0.55, o.trim, { seg: 4, rz: Math.PI / 2, ry: ry + 1.2, ao: 0 });
      T.col(mx, mz, 0.3);
      taken.push([mx, mz, 0.3]);
    }
  }
  if (gateR) {
    const [px, pz] = P(dlx + GATE + 0.8, fz + Math.cos(aR) * D + 0.95);
    if (boxLaneClear(px, pz, 1.33, 1.33, 0) && free(px, pz, 0.7)) planter(b, px, f.y, pz, 0.7, { seed: Math.round(w), pot: Math.round(w) % 3, plant: (o.tower ?? 0) % 3 });
  }
  // THE FOOTPRINT, honest to the plinth (0.15 proud of the wall): it used to be
  // padded 0.5 all round, which made every gap between two houses a metre
  // narrower than it looks. The strip in front covers the door surround, the
  // little HUMANS door and the sill line (not the corners, where the alleys are).
  T.colBox(f.x, f.z, w + 0.3, d + 0.3, ry);
  T.wall(f.px(0, fz + 0.175), f.pz(0, fz + 0.175), w - 0.7, 0.35, ry);
  HEIGHTS_PLAN.doors.push({ id: o.id ?? ('house' + HEIGHTS_PLAN.doors.length), x: +f.px(dlx, fz + 0.95).toFixed(2), z: +f.pz(dlx, fz + 0.95).toFixed(2) });
}

// ── THE GUEST HOUSE ──────────────────────────────────────────────────────────
// Built AROUND the bed the containment system tucks you into (167.55, 50.72 —
// its own placement pass picks that spot from the free ground here, so this
// house registers only BOX colliders: they are invisible to that search and the
// nook stays exactly where it has always been).
function buildGuestHouse(T) {
  const GX = 167.6, GZ = 51.0, GRY = Math.PI / 4;              // door faces SE, like the nook
  const GY = T.ground(GX, GZ);
  // gDX -2.3 (was -1.7): the doorway is 2.2 wide now, and moving it left leaves
  // half a metre of wall between its casing and the little HUMANS door
  const GW = 9.4, GD = 9.0, GH = 6.4, GT = 0.5, GCEIL = 5.9, gDX = -2.3, GGAP = 2.2, GGH = 3.2;
  const sb = T.shell('guest');
  const f = frame(GX, GY, GZ, GRY);
  const GFY = T.padY(GX, GZ, GW - GT * 2, GD - GT * 2, GRY) + 0.16;
  const segs = block(sb, f, GW, GH, GD, 0xf6ead0, {
    quoins: true, plinthColor: PAL.stone, bandColor: 0xfdf6e4, sink: 1.0,
    hollow: { t: GT, gaps: [{ face: 0, lx: gDX, w: GGAP, h: GGH }], ceil: GCEIL, ceilColor: 0xe8dcc0, floorColor: 0xa8875c, floorInto: T.b, floorTop: GFY },
  });
  tileRoof(sb, f, GW, 0, GD, 0xcf5a3c, { top: GH, alongX: true, pitch: 0.35, kind: 'tile', ridge: 0x9c3d26, eave: 0xfdf6e4 });
  gableRoof(sb, f.x, f.y + GH, f.z, GD + 1.1, Math.tan(0.35) * (GD + 1.1) / 2, GW + 1.1, 0xcf5a3c, GRY + Math.PI / 2);   // the slopes (see gableRoof)
  // a teal casing and lintel, a fanlight in a cream stone archivolt, and the
  // little HUMANS door beside it, short of the window's shutter
  doorUnit(sb, f, gDX, GD / 2 + 0.02, { w: 2.0, h: 3.1, color: 0x2a8f8a, surround: 0xfdf6e4, casing: 0x2a8f8a, band: 0.22, humanSide: 1, humanSignCell: T.humansLabel(), leaf: false, recess: false, clear: GGAP, clearH: GGH, sill: GFY, humanGap: 0.3 });
  windowUnit(sb, f, 2.6, GD / 2, 1.7, 2.4, 2.4, { trim: 0x2a8f8a, cushion: true, cushionColor: 0x7fbfb2, flowers: true });
  // on the side wall: this frame's origin IS that wall (at lz GD/2 − 0.5 the
  // window stood by itself in the grass 4 u out, beside the west lane); sill
  // at 2.3, over a visitor's head, as on the houses
  const sfr = frame(f.px(GW / 2, 0), f.y, f.pz(GW / 2, 0), GRY + Math.PI / 2);
  windowUnit(sb, sfr, 0, 0, 2.5, 2.2, 2.2, { trim: 0x2a8f8a, cushionColor: 0xf2c14e });
  const bfr = frame(f.x, f.y, f.z, GRY + Math.PI);
  windowUnit(sb, bfr, -1.2, GD / 2, 3.0, 1.8, 1.8, { trim: 0x2a8f8a, shutters: false, cushion: false });
  // chimney + a lantern over the door
  sb.box(f.px(3.0, -1.6), f.y + GH, f.pz(3.0, -1.6), 1.0, 2.2, 1.0, 0xf6ead0, { ry: GRY, ao: 0 });
  sb.box(f.px(3.0, -1.6), f.y + GH + 2.2, f.pz(3.0, -1.6), 1.3, 0.3, 1.3, PAL.stoneDark, { ry: GRY, ao: 0 });
  sb.cyl(f.px(gDX + 1.5, GD / 2 + 0.35), f.y + 3.5, f.pz(gDX + 1.5, GD / 2 + 0.35), 0.26, 0.2, 0.5, PAL.amber, { seg: 8, ry: GRY, mat: 'glow', ao: 0 });
  sb.cone(f.px(gDX + 1.5, GD / 2 + 0.35), f.y + 4.0, f.pz(gDX + 1.5, GD / 2 + 0.35), 0.34, 0.3, 0x3a4a4c, { seg: 8, ry: GRY, ao: 0 });
  halo(T.b, f.px(gDX + 1.5, GD / 2 + 0.4), f.y + 3.75, f.pz(gDX + 1.5, GD / 2 + 0.4), 1.3);
  pool(T.b, f.px(gDX, GD / 2 + 2.2), f.y + 0.16, f.pz(gDX, GD / 2 + 2.2), 3.6);
  // the sign that makes it official
  const plate = T.plaque(3.2, 0.9, [
    { t: 'THE GUEST HOUSE', s: 0.44, c: '#fff4dc' },
    { t: 'your room is ready. it always was.', s: 0.2, c: '#ffd9a8', weight: 'italic bold' },
  ], { bg: '#2a8f8a', border: '#f2c14e', borderW: 0.05, dpu: 140 });
  sb.box(f.px(1.1, GD / 2 + 0.16), f.y + 4.3, f.pz(1.1, GD / 2 + 0.16), 3.4, 1.0, 0.2, 0x1f6f6b, { ry: GRY, ao: 0 });
  sb.sign(plate, f.px(1.1, GD / 2 + 0.28), f.y + 4.8, f.pz(1.1, GD / 2 + 0.28), 3.2, 0.9, { ry: GRY, glow: true });
  // fish mailbox with YOUR name on it
  const mb = at(f, 0.5, GW * 0.78);
  T.b.cyl(mb.x, T.ground(mb.x, mb.z), mb.z, 0.12, 0.14, 1.5, PAL.wood, { seg: 6, ao: 0.4, aoBase: f.y });
  T.b.sph(mb.x, T.ground(mb.x, mb.z) + 1.8, mb.z, 0.55, 0x2a8f8a, { seg: 9, rings: 6, sx: 1.5, sy: 0.75, ry: GRY + 1.2 });
  T.b.cone(mb.x - Math.sin(GRY + 1.2) * 0.8, T.ground(mb.x, mb.z) + 1.8, mb.z - Math.cos(GRY + 1.2) * 0.8, 0.4, 0.55, 0x2a8f8a, { seg: 4, rz: Math.PI / 2, ry: GRY + 1.2, ao: 0 });
  const nameCell = T.plaque(1.0, 0.3, [{ t: 'YOU', s: 0.62, c: '#2a8f8a' }], { bg: '#fdf6e4', border: '#2a8f8a', borderW: 0.08, dpu: 200 });
  T.b.sign(nameCell, mb.x, T.ground(mb.x, mb.z) + 1.3, mb.z + 0.02, 1.0, 0.3, { ry: GRY + 1.2 });

  T.solidify(segs, f.y + GH);
  // Keep the approach to the front door clear. This house registers only BOX
  // colliders (so containment's nook search still finds this floor and the bed
  // stays at 168.2,52.1) — which also left the garden path free for the nature
  // system to plant a twelve-metre cypress squarely across the doorway.
  for (let i = 1; i <= 3; i++) T.claim(f.px(gDX, GD / 2 + i * 3.2), f.pz(gDX, GD / 2 + i * 3.2), 4.4, 4.4, GRY);
  // terracotta treads to go with the roof, a cream stone sill to go with the band
  T.stoop(f, gDX, GD / 2, 3.0, GFY, { wall: GT, gap: GGAP, color: 0xc0714c, sillColor: 0xe8dcc0 });
  const room = T.room({ id: 'guest', x: GX, z: GZ, w: GW - GT * 2, d: GD - GT * 2, rot: GRY, y: GY, floorY: GFY, h: GCEIL, label: 'The Guest House' });
  // hung on the RIGHT: the room's side wall is 0.8 u left of the doorway, and
  // a 2.2 leaf folded back there buried its latch edge and knob in the dado
  T.door({
    id: 'guest', room, y: GY, ry: GRY, w: GGAP, color: 0x2a8f8a, field: 0x33a39c, flap: 0xfdf6e4,
    x: f.px(gDX, GD / 2 + 0.4), z: f.pz(gDX, GD / 2 + 0.4), inset: 0.4 + GT, sill: GFY, top: GY + GGH, hinge: 1,
    say: 'unlocked. of course it is unlocked. it is your room.', speaker: 'THE GUEST HOUSE',
  });
  T.roomDetail('guest', () => guestInterior(T, frame(GX, GFY, GZ, GRY), { hw: (GW - GT * 2) / 2, hd: (GD - GT * 2) / 2, doorX: gDX, doorW: GGAP }));
  T.act('guesthouse', f.px(gDX + 0.6, GD / 2 + 4.6), f.pz(gDX + 0.6, GD / 2 + 4.6), 'The Guest House', [
    'THE GUEST HOUSE. your room is ready. it always was.',
    'the mailbox is a fish, and it says YOU on it, and there is already post in it.',
    'the curtains are drawn back. somebody airs this room every single day.',
  ], { r: 3.8, speaker: 'THE GUEST HOUSE' });
}

export function buildHeights(T) {
  const b = T.b;
  const CX = HG.x, CZ = HG.z;
  HEIGHTS_PLAN.doors.length = 0; HEIGHTS_PLAN.lamps.length = 0; HEIGHTS_PLAN.kerb.length = 0;
  // Nine houses, three tower patterns, four roof materials. The `tower` field is
  // what stops the hill reading as one house stamped nine times. (x, z, ry, w,
  // d, h are copied into cat/citizens/sills.js for the sill cats: they stay.)
  // towerAng moves a tower that used to stand IN an alley (the tabby's in the
  // path to Purrliament, the grey's and the lilac's in the way north, the
  // tuxedo's and the white's between the southern houses) round to a side the
  // lanes do not use — and the ginger's 19 m cat tree round to its back, out of
  // the line from the ring to the game camera (which looks in from the
  // south-east: it stood right in that line, and the camera dithered it into a
  // magenta screen-door over the ring); posts are the scratching posts (see catHouse); garden 0 =
  // the two houses the Guest House was built in front of keep no fence.
  const homes = [
    { id: 'tabby', x: 163, z: 34, ry: 0.35, w: 10.0, d: 9.0, h: 9.0, wall: 0xf0dcae, roof: 0xc4482f, roofKind: 'tile', ridge: 0x94331f, trim: 0x2a8f8a, tower: 0, tiers: 3, towerAng: -1.75, posts: [[-1, -1]], open: 1 },
    { id: 'grey', x: 178, z: 31, ry: 0.05, w: 11.0, d: 9.5, h: 10.0, wall: 0xe8b491, roof: 0x66737f, roofKind: 'slate', ridge: 0x47525c, trim: 0x1d3557, tower: 1, quoins: true, towerH: 11.5, towerAng: -2.4, posts: [[-1, 1]] },
    { id: 'calico', x: 193, z: 34, ry: -0.32, w: 9.6, d: 9.0, h: 8.6, wall: 0xdcc9a0, roof: 0xd8993f, roofKind: 'tile', ridge: 0xa8722a, trim: 0x4f8a5b, tower: 2, dormers: [0], posts: [] },
    { id: 'ginger', x: 201, z: 48, ry: -1.45, w: 10.4, d: 9.2, h: 9.4, wall: 0xf2d9a0, roof: 0x4f9d8c, roofKind: 'copper', ridge: 0x357a6c, trim: 0xb03a63, tower: 0, tiers: 4, quoins: true, towerAng: Math.PI, posts: [[-1, 1]] },
    { id: 'tuxedo', x: 194, z: 62, ry: -2.7, w: 9.8, d: 9.0, h: 8.8, wall: 0xd9694a, roof: 0x5d6b78, roofKind: 'slate', ridge: 0x434e58, trim: 0xf2c14e, tower: 1, towerH: 9.4, dormers: [0], towerAng: Math.PI, posts: [[-1, 1], [1, -1]] },
    { id: 'white', x: 178, z: 66, ry: Math.PI, w: 11.0, d: 9.4, h: 9.6, wall: 0xf6ead0, roof: 0xb8503a, roofKind: 'tile', ridge: 0x8a3a28, trim: 0x2a8f8a, tower: 2, towerH: 9.2, towerAng: Math.PI, posts: [[-1, 1]] },
    { id: 'siamese', x: 162, z: 62, ry: 2.6, w: 9.6, d: 9.0, h: 8.8, wall: 0xc6dee6, roof: 0x4f9d8c, roofKind: 'copper', ridge: 0x357a6c, trim: 0x1d3557, tower: 0, tiers: 3, dormers: [0], garden: 0, posts: [[1, 1]] },
    { id: 'black', x: 154, z: 48, ry: 1.5, w: 10.2, d: 9.2, h: 9.2, wall: 0xf0c2d2, roof: 0xe0a848, roofKind: 'tile', ridge: 0xa8742c, trim: 0xb03a63, tower: 1, towerH: 10.2, quoins: true, dormers: [0], garden: 0, posts: [[-1, 1], [1, 1]] },
    { id: 'lilac', x: 190, z: 20, ry: -0.2, w: 9.4, d: 8.8, h: 8.4, wall: 0xdcc4e4, roof: 0x707d88, roofKind: 'slate', ridge: 0x4f5a64, trim: 0x6a4a8a, tower: 2, towerH: 7.6, dormers: [0], towerAng: Math.PI, garden: 0, posts: [[-1, -1]] },
  ];
  for (const o of homes) catHouse(T, frame(o.x, T.ground(o.x, o.z), o.z, o.ry), o);
  buildGuestHouse(T);

  // ── the village green + the ring lane round it ────────────────────────────
  // A mown lawn with a stone kerb inside a cobbled ring: from the hill road
  // the district now reads as a wheel — a green hub, a pale rim, five spokes.
  // Both discs are laid flat at the highest ground under them and are GROUND
  // (T.paved), so nobody wades through them any more.
  const R = HEIGHTS_PLAN.ring;
  let gy0 = -Infinity;
  for (let k = 0; k <= 3; k++) for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, rr = (R.rOut + 0.3) * k / 3;
    gy0 = Math.max(gy0, T.ground(CX + Math.cos(a) * rr, CZ + Math.sin(a) * rr));
  }
  const ringDisc = paving(b, CX, gy0 + 0.02, CZ, R.rOut + 0.3, { seg: 44, rings: 0, color: 0xc6b596, border: 0x93836a, depth: 1.8 });
  const lawnDisc = paving(b, CX, gy0 + 0.06, CZ, R.rIn, { seg: 36, rings: 0, color: 0x74a84a, border: 0xd9ccb0, depth: 0.5 });
  // mown stripes, because somebody here owns a very small lawnmower
  for (let i = -3; i <= 3; i++) {
    const half = Math.sqrt(Math.max(0, (R.rIn - 0.45) ** 2 - (i * 1.4) ** 2));
    if (i % 2 && half > 0.5) b.hquad(CX + i * 1.4, gy0 + 0.18, CZ, 0.7, half * 2, 0x82b654);
  }
  // a darker course of setts down the middle of the ring: it reads as a road
  b.torus(CX, gy0 + 0.1, CZ, (R.rIn + R.rOut) / 2, 0.1, 0x9c8a6e, { rx: -Math.PI / 2, seg: 48, tseg: 4, ao: 0 });
  T.paved('heights_green', [], [ringDisc, lawnDisc]);
  const gy = gy0 + 0.16;
  // topiary cat, 6.5 tall
  const TRY = 0.55, TH = 6.4, tf = frame(CX, gy + 1.2, CZ, TRY);
  hedge(b, CX, gy, CZ, 5.6, 3.0, 1.2, { ry: 0.4, color: 0x3a7030, color2: 0x4a8a3c });
  sittingCat(b, CX, gy + 1.2, CZ, TH, 0x3f7a35, { ry: TRY, flat: true, seg: 10, rings: 7, inner: 0x4f8f40, nose: 0x4f8f40, muzzle: 0x3f7a35, eyes: false, tailSide: -1 });
  // Her eyes. sittingCat's proportional eye (0.035·H, 0.165·H forward) is
  // buried INSIDE a head this size, so after dark Mrs. Bramble was one unlit
  // black blob in the middle of the green. Amber glass set proud of the clipped
  // face, each with a slit of dark privet across it: dull amber by day, and at
  // night the brightest thing on the green, looking at whoever is on the ring.
  for (const sx of [-1, 1]) {
    const ey = gy + 1.2 + 0.875 * TH;
    b.sph(tf.px(sx * 0.5, 1.3), ey, tf.pz(sx * 0.5, 1.3), 0.32, 0xf2c14e, { seg: 8, rings: 6, sz: 0.5, ry: TRY, mat: 'glow' });
    b.box(tf.px(sx * 0.5, 1.47), ey - 0.22, tf.pz(sx * 0.5, 1.47), 0.09, 0.44, 0.04, 0x1f3a1a, { ry: TRY, ao: 0 });
  }
  // …and two lamps sunk in the lawn at her feet, washing light up her front
  for (const sx of [-1, 1]) {
    const ux = tf.px(sx * 1.0, 2.55), uz = tf.pz(sx * 1.0, 2.55);
    b.cyl(ux, gy - 0.02, uz, 0.2, 0.24, 0.16, PAL.stoneDark, { seg: 8, ao: 0 });
    b.cyl(ux, gy + 0.12, uz, 0.15, 0.15, 0.06, PAL.amberPale, { seg: 8, mat: 'glow', ao: 0 });
  }
  wash(b, tf.px(0, 2.05), gy + 1.2 + 0.26 * TH, tf.pz(0, 2.05), 5.0, 6.4, TRY);    // rising up her front
  pool(b, tf.px(0, 2.3), gy + 0.2, tf.pz(0, 2.3), 2.6);
  const topiaryPlaque = T.plaque(2.2, 0.7, [{ t: 'MRS. BRAMBLE', s: 0.4, c: '#f2f8ec' }, { t: 'trimmed weekly, fondly', s: 0.22, c: '#c8e4c0', weight: 'italic bold' }], { bg: '#2f5a2a', border: '#f2c14e', borderW: 0.06, dpu: 140 });
  b.box(CX + 1.0, gy, CZ + 4.3, 0.2, 1.0, 0.2, PAL.wood, { ao: 0 });
  b.sign(topiaryPlaque, CX + 1.0, gy + 1.3, CZ + 4.4, 2.2, 0.7, { rx: -0.35 });
  // four benches on the lawn with their backs to Mrs. Bramble, looking out at
  // the houses, all INSIDE the kerb. (Four lamps used to stand between them,
  // two of them double-headed: at night that was a thicket of lamp heads
  // round the topiary. The lamps are on the ring's outer kerb now.)
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.7;
    bench(b, CX + Math.cos(a) * 4.35, gy, CZ + Math.sin(a) * 4.35, -a + Math.PI / 2, { len: 2.6 });
  }
  T.col(CX, CZ, 3.4);

  // ── the five ways out ─────────────────────────────────────────────────────
  // Each lane is paved from the ring's rim to where it leaves the district
  // (a flat-laid ribbon, walkable), a lamp stands beside each mouth, and the
  // lane is CLAIMED so the nature planting keeps its trees out of it.
  const laneBoxes = [];
  for (const L of HEIGHTS_PLAN.lanes) {
    const pts = [];
    for (let i = 0; i < L.pts.length; i++) {
      const [x, z] = L.pts[i], d0 = Math.hypot(x - CX, z - CZ);
      if (d0 >= R.rOut + 0.1) { pts.push([x, z]); continue; }
      const [nx, nz] = L.pts[i + 1] ?? L.pts[i], d1 = Math.hypot(nx - CX, nz - CZ);
      if (d1 > R.rOut + 0.1) {                             // this span leaves the ring: start at its rim
        let lo = 0, hi = 1;
        for (let k = 0; k < 24; k++) { const t = (lo + hi) / 2; if (Math.hypot(x + (nx - x) * t - CX, z + (nz - z) * t - CZ) < R.rOut + 0.1) lo = t; else hi = t; }
        pts.push([x + (nx - x) * lo, z + (nz - z) * lo]);
      }
    }
    if (pts.length > 1) ribbon(b, pts, L.width, (x, z) => T.ground(x, z), 0xbcaa88, { th: 0.34, lift: 0.1, kerb: false, seg: 4, out: laneBoxes });
    for (let i = 0; i < L.pts.length - 1; i++) {
      const [ax, az] = L.pts[i], [bx, bz] = L.pts[i + 1];
      T.claim((ax + bx) / 2, (az + bz) / 2, L.width + 1.0, Math.hypot(bx - ax, bz - az) + 1.0, Math.atan2(bx - ax, bz - az));
    }
  }
  T.paved('heights_lanes', laneBoxes);
  // Where nothing may stand: every front door's approach (the doormat to the
  // ring's rim, toward the green; the Guest House's to its lane).
  const approach = [...HEIGHTS_PLAN.doors, { x: 170.3, z: 56.9 }].map((d) => {
    const dx = d.x - CX, dz = d.z - CZ, l = Math.hypot(dx, dz);
    return [d.x, d.z, CX + dx / l * R.rOut, CZ + dz / l * R.rOut];
  });
  const offDoors = (x, z, m, mat = 0) => approach.every(([ax, az, bx, bz]) => segDist(x, z, ax, az, bx, bz) >= m && Math.hypot(x - ax, z - az) >= mat);
  // ── the lamps round the ring ──────────────────────────────────────────────
  // Goose-neck globes on the ring's OUTER kerb, leaning over the road, one in
  // each gap between the ways out (two in the long gap before the ginger's):
  // at night the ring is a necklace of light round a dark lawn, and the only
  // thing lit on the lawn is Mrs. Bramble.
  const mouths = HEIGHTS_PLAN.lanes.map((L) => {
    for (let i = 0; i < L.pts.length - 1; i++) {
      const [ax, az] = L.pts[i], [bx, bz] = L.pts[i + 1];
      for (let t = 0; t <= 1; t += 0.02) { const x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (Math.hypot(x - CX, z - CZ) >= R.rOut) return Math.atan2(z - CZ, x - CX); }
    }
    return Math.atan2(L.pts[0][1] - CZ, L.pts[0][0] - CX);
  }).sort((p, q) => p - q);
  const rimLamps = [];
  for (let i = 0; i < mouths.length; i++) {
    const a0 = mouths[i], gap = (i + 1 < mouths.length ? mouths[i + 1] : mouths[0] + Math.PI * 2) - a0;
    const n = gap > 2.2 ? 2 : gap > 0.7 ? 1 : 0;
    for (let k = 1; k <= n; k++) {
      const a = a0 + gap * k / (n + 1);
      // first strictly (clear of every doormat by 3.8), then — the east side,
      // where the gardens come right down to the ring — a little closer and a
      // little further round the gap, never within 3.5 of another lamp
      let hit = null;
      for (const [span, mat, app] of [[24, 3.8, 2.0], [36, 3.0, 1.6]]) {
        for (let j = 0; j <= span && !hit; j++) {
          const aa = a + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.035;
          for (let m = 0; m < 3 && !hit; m++) {
            const rr = R.rOut + 0.9 + m * 0.4, x = CX + Math.cos(aa) * rr, z = CZ + Math.sin(aa) * rr;
            // (1.5: a lamp never leaves a slot narrower than a visitor against a
            // fence, a gate post or a wall; it stands clear, or not at all)
            if (laneClear(x, z, 0.6, 0.25) && solidClear(T, x, z, 1.5) && offDoors(x, z, app, mat)
              && rimLamps.every(([px, pz]) => Math.hypot(x - px, z - pz) > 3.5)) hit = [x, z];
          }
        }
        if (hit) break;
      }
      if (!hit) continue;
      const [x, z] = hit;
      lamppost(b, x, T.ground(x, z), z, { style: 'globe', h: 4.9, ry: Math.atan2(CX - x, CZ - z), pool: 4.2, poolY: gy0 + 0.15 });
      rimLamps.push(hit);
      HEIGHTS_PLAN.lamps.push([+x.toFixed(2), +z.toFixed(2)]);
    }
  }
  // and one lamp out along every way out, on whichever side of it is clear
  // (the first free spot 2.6 u off the lane's centreline, 5 u past the rim)
  for (const L of HEIGHTS_PLAN.lanes) {
    let done = false;
    for (let i = 0; i < L.pts.length - 1 && !done; i++) {
      const [ax, az] = L.pts[i], [bx, bz] = L.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= len && !done; t += 0.5) {
        const px = ax + (bx - ax) * t / len, pz = az + (bz - az) * t / len;
        if (Math.hypot(px - CX, pz - CZ) < R.rOut + 5.0) continue;
        for (const s of [1, -1]) {
          const lx = px + s * -(bz - az) / len * 2.6, lz = pz + s * (bx - ax) / len * 2.6;
          if (!laneClear(lx, lz, 0.5, 0.3) || !solidClear(T, lx, lz, 0.9)) continue;
          lamppost(b, lx, T.ground(lx, lz), lz, { style: s > 0 ? 'lantern' : 'globe', h: 4.8, arms: 1 });
          done = true; break;
        }
      }
    }
  }
  const heightsSign = T.plaque(5.4, 1.6, [
    { t: 'WHISKER HEIGHTS', s: 0.46, c: '#fff4dc' },
    { t: 'a quiet neighbourhood for permanent residents', s: 0.2, c: '#ffd9a8', weight: 'italic bold' },
  ], { bg: '#2a8f8a', border: '#f2c14e', border2: '#1f6f6b', borderW: 0.05 });
  // in the little square where the Purrliament path comes in (moved 1.6 u off
  // the west lane: its east post stood in it)
  bigSign(T, 166.4, 41.8, 0.6, 5.4, 1.6, heightsSign, { postH: 4.4 });
  // ── a fingerpost on the green: every way out, named, and one more ──────────
  // (on the lawn's west edge, midway between two benches and facing the way
  // in from Purrliament: it used to be jammed in between a bench and a lamp)
  {
    const PX = CX + Math.cos(3.054) * 4.85, PZ = CZ + Math.sin(3.054) * 4.85;
    b.cyl(PX, gy, PZ, 0.13, 0.16, 4.7, PAL.wood, { seg: 7, ao: 0.4, aoBase: gy });
    b.sph(PX, gy + 4.75, PZ, 0.2, PAL.gold, { seg: 7, rings: 5 });
    T.col(PX, PZ, 0.22);
    const aim = (x, z, t) => ({ x, z, t });
    const mouth = (id) => { const L = HEIGHTS_PLAN.lanes.find((l) => l.id === id); return L.pts[Math.min(3, L.pts.length - 1)]; };
    const boards = [
      aim(...mouth('west'), 'PURRLIAMENT SQ.'), aim(...mouth('north'), 'GYM ROAD'), aim(...mouth('east'), 'THE WATCHTOWER'),
      aim(...mouth('south'), 'FISH HARBOR'), aim(...mouth('southeast'), 'THE SHORE'), aim(170.4, 55.6, 'YOUR ROOM'),
    ];
    boards.forEach((B, i) => {
      const dx = B.x - PX, dz = B.z - PZ, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, bry = Math.atan2(-uz, ux);
      const cx = PX + ux * 1.08, cz = PZ + uz * 1.08, by = gy + 2.35 + i * 0.4;
      b.box(cx, by, cz, 1.95, 0.34, 0.09, i === 5 ? 0x2a8f8a : 0xf6ead0, { ry: bry, ao: 0 });
      b.cone(PX + ux * 2.05, by + 0.17, PZ + uz * 2.05, 0.2, 0.26, i === 5 ? 0x2a8f8a : 0xf6ead0, { seg: 3, rz: -Math.PI / 2, ry: bry, ao: 0 });
      const cell = T.plaque(1.8, 0.28, [{ t: B.t, s: 0.2, c: i === 5 ? '#fff4dc' : '#2a3a3c' }], { bg: i === 5 ? '#2a8f8a' : '#f6ead0', border: i === 5 ? '#f2c14e' : '#8d5a34', borderW: 0.03, dpu: 160 });
      for (const s of [1, -1]) b.sign(cell, cx + Math.sin(bry) * 0.055 * s, by + 0.17, cz + Math.cos(bry) * 0.055 * s, 1.8, 0.28, { ry: s > 0 ? bry : bry + Math.PI });
    });
  }
  // ── kerb life ─────────────────────────────────────────────────────────────
  // From the hill road the ring and its five spokes were bare stone, a quarter
  // of the district with nothing on it. Now the kerbs are lived on: supper put
  // out, the milk left, crates of fish, a cat asleep in a basket. Each cluster
  // stands just OUTSIDE the lanes (laneClear: nothing solid in a lane, ever),
  // off every door's approach and clear of the lamps; ON the stone there is
  // only what you can walk over: chalk, puddles and footprints.
  const rk = rng(hash('heights-kerb'));
  const kerb = [];
  const kerbFree = (x, z, r) => laneClear(x, z, r, 0.2) && solidClear(T, x, z, r + 0.2) && offDoors(x, z, r + 1.2, r + 2.2)
    && rimLamps.every(([lx, lz]) => Math.hypot(x - lx, z - lz) > r + 1.5) && kerb.every((k) => Math.hypot(x - k[0], z - k[1]) > r + 4.0);
  const ringCands = [], cands = [];
  for (let i = 0; i < 48; i++) {                                // round the ring's outer kerb (compact ones)
    const a = (i + 0.5) / 48 * Math.PI * 2, x = CX + Math.cos(a) * (R.rOut + 1.15), z = CZ + Math.sin(a) * (R.rOut + 1.15);
    ringCands.push([x, z, Math.atan2(CX - x, CZ - z), true]);
  }
  for (const L of HEIGHTS_PLAN.lanes) {                         // and down both sides of every way out
    for (let i = 0; i < L.pts.length - 1; i++) {
      const [ax, az] = L.pts[i], [bx, bz] = L.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      for (let t = 1.0; t < len; t += 2.5) {
        const px = ax + (bx - ax) * t / len, pz = az + (bz - az) * t / len;
        if (Math.hypot(px - CX, pz - CZ) < R.rOut + 2.0) continue;
        for (const sd of [1, -1]) {
          const off = L.width / 2 + 1.3, x = px + sd * -(bz - az) / len * off, z = pz + sd * (bx - ax) / len * off;
          cands.push([x, z, Math.atan2(px - x, pz - z), false]);
        }
      }
    }
  }
  const shuffle = (A) => { for (let i = A.length - 1; i > 0; i--) { const j = Math.floor(rk() * (i + 1)); [A[i], A[j]] = [A[j], A[i]]; } return A; };
  const bowl = (x, z, col, food) => {
    const y = T.ground(x, z);
    b.cyl(x, y, z, 0.32, 0.25, 0.16, col, { seg: 10, ao: 0.3, aoBase: y });
    b.cyl(x, y + 0.11, z, 0.27, 0.27, 0.06, food, { seg: 10, ao: 0 });
    T.col(x, z, 0.34, 0.17);
  };
  const KIBBLE = 0x8a5a3a, MILK = 0xf6f2ea, WATER = 0x7fb3d9;
  const recipes = [
    (fr) => {                                                    // supper for two
      bowl(fr.px(-0.42, 0), fr.pz(-0.42, 0), PAL.cloth[0], KIBBLE);
      bowl(fr.px(0.42, 0.05), fr.pz(0.42, 0.05), PAL.cloth[1], MILK);
    },
    (fr, compact) => {                                           // the milk, in its wire carrier
      const y = fr.y, M = 0x5a6468;
      b.box(fr.x, y, fr.z, 0.9, 0.06, 0.36, M, { ry: fr.ry, mat: 'metal', ao: 0 });
      for (const sx of [-1, 1]) b.box(fr.px(sx * 0.43, 0), y, fr.pz(sx * 0.43, 0), 0.04, 0.72, 0.04, M, { ry: fr.ry, mat: 'metal', ao: 0 });
      b.box(fr.x, y + 0.7, fr.z, 0.9, 0.05, 0.05, M, { ry: fr.ry, mat: 'metal', ao: 0 });
      for (let i = 0; i < 3; i++) {
        const bx = fr.px(-0.28 + i * 0.28, 0), bz = fr.pz(-0.28 + i * 0.28, 0);
        b.cyl(bx, y + 0.05, bz, 0.09, 0.12, 0.34, MILK, { seg: 8, ao: 0.3, aoBase: y });
        b.cyl(bx, y + 0.39, bz, 0.06, 0.09, 0.1, MILK, { seg: 8, ao: 0 });
        b.cyl(bx, y + 0.49, bz, 0.066, 0.066, 0.04, [0xd23c3c, PAL.gold, 0x2a8f8a][i], { seg: 8, ao: 0 });
      }
      T.col(fr.x, fr.z, 0.5, 0.74);
      if (!compact) bowl(fr.px(0.95, 0.25), fr.pz(0.95, 0.25), PAL.cloth[3], WATER);
    },
    (fr, compact) => {                                           // the fish came in; the fish went nowhere
      const y = fr.y;
      crate(b, fr.x, y, fr.z, 0.82, fr.ry + 0.1, PAL.woodLight);
      crate(b, fr.px(0.05, -0.04), y + 0.7, fr.pz(0.05, -0.04), 0.62, fr.ry - 0.25, 0xc49a62);
      for (const sx of [-1, 1]) b.cone(fr.px(sx * 0.14, 0.05), y + 1.24, fr.pz(sx * 0.14, 0.05), 0.12, 0.3, 0x9fb3bd, { seg: 4, rz: sx * 0.5, ry: fr.ry, mat: 'metal', ao: 0 });
      if (!compact) bowl(fr.px(-0.95, 0.3), fr.pz(-0.95, 0.3), PAL.cloth[2], WATER);
    },
    (fr) => {                                                    // a cat asleep in a basket, by the kerb
      const y = fr.y;
      b.cyl(fr.x, y, fr.z, 0.66, 0.52, 0.34, 0xc49a5c, { seg: 12, ao: 0.4, aoBase: y });
      b.torus(fr.x, y + 0.34, fr.z, 0.62, 0.08, 0xa47a44, { rx: -Math.PI / 2, seg: 14, tseg: 4 });
      b.sph(fr.x, y + 0.34, fr.z, 0.54, PAL.cloth[(kerb.length + 1) % 5], { seg: 10, rings: 4, sy: 0.3 });
      loafCat(b, fr.x, y + 0.36, fr.z, 1.05, PAL.fur[kerb.length % PAL.fur.length], { ry: fr.ry + 1.2 });
      T.col(fr.x, fr.z, 0.66);
    },
  ];
  let onRing = 0;
  for (const [x, z, fry, ring] of [...shuffle(ringCands), ...shuffle(cands)]) {
    if (kerb.length >= 14) break;
    if (ring && onRing >= 6) continue;
    if (!kerbFree(x, z, ring ? 0.8 : 1.05)) continue;
    if (ring) onRing++;
    recipes[kerb.length % recipes.length](frame(x, T.ground(x, z), z, fry), ring);
    HEIGHTS_PLAN.kerb.push([+x.toFixed(2), +z.toFixed(2), ['supper', 'milk', 'crates', 'basket'][kerb.length % recipes.length]]);
    kerb.push([x, z]);
  }

  // and on the lawn, two bowls set out at Mrs. Bramble's feet, between her
  // lamps. Nobody admits to filling them. (Inside her own collider, so they
  // are never underfoot: as low props by the benches they tripped the walker.)
  for (const [sx, col, food] of [[-0.42, PAL.cloth[0], KIBBLE], [0.42, PAL.cloth[1], MILK]]) {
    const x = tf.px(sx, 2.95), z = tf.pz(sx, 2.95);
    b.cyl(x, gy, z, 0.3, 0.23, 0.15, col, { seg: 10, ao: 0 });
    b.cyl(x, gy + 0.1, z, 0.25, 0.25, 0.06, food, { seg: 10, ao: 0 });
  }

  // ── on the stone: chalk, mud and puddles ──────────────────────────────────
  const ringTop = gy0 + 0.12;
  const paveTop = (x, z) => {                                   // the paved top here, or null
    const d = Math.hypot(x - CX, z - CZ);
    if (d > R.rIn + 0.3 && d < R.rOut - 0.35) return Math.abs(d - (R.rIn + R.rOut) / 2) < 0.22 ? null : ringTop;   // (not on the centre course)
    if (d <= R.rOut + 0.3) return null;                         // lawn, or the kerb stones
    let top = -Infinity;
    for (const q of laneBoxes) {
      const dx = x - q.x, dz = z - q.z;
      if (Math.abs(dx * q.c - dz * q.s) <= q.hw - 0.1 && Math.abs(dx * q.s + dz * q.c) <= q.hd - 0.1) top = Math.max(top, q.top);
    }
    return top > -Infinity ? top : null;
  };
  /** a print, `s` to scale, heading `a` (kit yaw): a pad and four toes, or a shoe */
  const paw = (x, z, a, s, col) => {
    const y = paveTop(x, z);
    if (y == null) return;
    const f2 = frame(x, y, z, a);
    b.cyl(x, y - 0.004, z, 0.1 * s, 0.1 * s, 0.018, col, { seg: 7, ao: 0 });
    for (const [tx, tz] of [[-0.105, 0.12], [-0.04, 0.17], [0.04, 0.17], [0.105, 0.12]]) {
      b.hquad(f2.px(tx * s, tz * s), y + 0.016, f2.pz(tx * s, tz * s), 0.06 * s, 0.075 * s, col, { ry: a + Math.PI / 4 });
    }
  };
  const shoe = (x, z, a, col) => {
    const y = paveTop(x, z);
    if (y == null) return;
    const f2 = frame(x, y, z, a);
    b.sph(f2.px(0, 0.07), y + 0.002, f2.pz(0, 0.07), 0.11, col, { seg: 8, rings: 3, sx: 0.95, sy: 0.12, sz: 1.5, ry: a });
    b.sph(f2.px(0, -0.17), y + 0.002, f2.pz(0, -0.17), 0.085, col, { seg: 7, rings: 3, sy: 0.15, ry: a });
  };
  // a cat has walked half round the ring in pink chalk (nobody asked it to)
  for (let i = 0; i < 36; i++) {
    const t = 3.6 + i * 0.068, sd = i % 2 ? 1 : -1, r = 6.4 + sd * 0.13;
    paw(CX + Math.cos(t) * r, CZ + Math.sin(t) * r, Math.atan2(-Math.sin(t), Math.cos(t)), 1.0, 0xee8fb0);
  }
  // a hopscotch in white chalk on the ring's inner half (1, 1, 2, 1, 2, 1, and
  // a half-moon to turn round in), drawn as outlines: every square four strokes
  {
    const CH = 0xf3eee4, S2 = 0.56, st = 0.05, y = ringTop + 0.014;
    const cell = (t, rr) => {
      const x = CX + Math.cos(t) * rr, z = CZ + Math.sin(t) * rr, a = Math.atan2(-Math.sin(t), Math.cos(t)), f2 = frame(x, y, z, a);
      for (const [lx, lz, w2, d2] of [[0, S2 / 2, S2, st], [0, -S2 / 2, S2, st], [S2 / 2, 0, st, S2], [-S2 / 2, 0, st, S2]]) b.hquad(f2.px(lx, lz), y, f2.pz(lx, lz), w2, d2, CH, { ry: a });
    };
    const R0 = 6.5, dT = (S2 + 0.02) / R0;
    [1, 1, 2, 1, 2, 1].forEach((n, i) => {
      const t = 0.42 + i * dT;
      if (n === 1) cell(t, R0); else { cell(t, R0 - 0.29); cell(t, R0 + 0.29); }
    });
    const tc = 0.42 + 5.5 * dT, fc = frame(CX + Math.cos(tc) * R0, y, CZ + Math.sin(tc) * R0, Math.atan2(-Math.sin(tc), Math.cos(tc)));
    for (let k = 0; k < 7; k++) {                                // the half-moon
      const ph = (k + 0.5) / 7 * Math.PI, lx = 0.44 * Math.cos(ph), lz = 0.44 * Math.sin(ph);
      const dx = fc.px(-Math.sin(ph), Math.cos(ph)) - fc.x, dz = fc.pz(-Math.sin(ph), Math.cos(ph)) - fc.z;
      b.hquad(fc.px(lx, lz), y, fc.pz(lx, lz), 0.22, st, CH, { ry: Math.atan2(-dz, dx) });
    }
  }
  // muddy paws from the green, down the south lane, to YOUR door
  {
    const way = [[CX + Math.cos(2.2) * 6.4, CZ + Math.sin(2.2) * 6.4], [179.0, 52.9], [172.6, 57.0], [171.95, 58.35]];
    let carry = 0, k = 0;
    for (let i = 0; i < way.length - 1; i++) {
      const [ax, az] = way[i], [bx, bz] = way[i + 1], len = Math.hypot(bx - ax, bz - az), a = Math.atan2(bx - ax, bz - az);
      let t = carry;
      for (; t < len; t += 0.62, k++) {
        const sd = k % 2 ? 1 : -1;
        paw(ax + (bx - ax) * t / len + Math.cos(a) * sd * 0.14, az + (bz - az) * t / len - Math.sin(a) * sd * 0.14, a, 1.15, 0x5e4a36);
      }
      carry = t - len;
    }
  }
  // and in the west lane, somebody's shoes, heading out toward Purrliament…
  // which stop. Facing them, where the next step would have been: two paws,
  // much bigger than a cat's.
  {
    const L = HEIGHTS_PLAN.lanes[0], [ax, az] = L.pts[0], [bx, bz] = L.pts[1], len = Math.hypot(bx - ax, bz - az);
    const a = Math.atan2(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let i = 0; i < 9; i++) {
      const t = 3.2 + i * 0.58, sd = i % 2 ? 1 : -1;
      shoe(ax + ux * t + Math.cos(a) * sd * 0.17, az + uz * t - Math.sin(a) * sd * 0.17, a, 0x6b5a48);
    }
    const t = 3.2 + 9 * 0.58 + 0.75;
    for (const sd of [-1, 1]) paw(ax + ux * t + Math.cos(a) * sd * 0.34, az + uz * t - Math.sin(a) * sd * 0.34, a + Math.PI, 2.3, 0x5e4a36);
  }
  // puddles, where the road dips (it has not rained: somebody hoses the lanes)
  for (const [x, z, r] of [[CX + Math.cos(0.35) * 8.1, CZ + Math.sin(0.35) * 8.1, 0.45], [186.0, 64.2, 0.7], [200.2, 40.7, 0.75], [CX + Math.cos(1.2) * 6.35, CZ + Math.sin(1.2) * 6.35, 0.45]]) {
    for (let i = 0; i < 3; i++) {
      const px = x + Math.cos(i * 2.2) * r * 0.45, pz = z + Math.sin(i * 2.2) * r * 0.35, y = paveTop(px, pz);
      if (y == null) continue;
      b.cyl(px, y - 0.004, pz, r * (1 - i * 0.22), r * (1 - i * 0.22), 0.016 + i * 0.001, 0x7d95a4, { seg: 12, mat: 'metal', ao: 0 });
    }
  }

  T.act('heights', 168.0, 42.4, 'Whisker Heights', [
    'the doors are four metres tall. the letterboxes are fish. the gardens are immaculate.',
    'every window has a sill wide enough to lie on, and every sill has a cushion with a dent in it.',
    'one house has a spare room made up. the towels are folded. your name is on the door in pencil.',
  ], { r: 4.4, speaker: 'WHISKER HEIGHTS' });
}

// ═════════════════════════════════════════════════════════════════════════════
// MUSCLE BEACH GYM
// ═════════════════════════════════════════════════════════════════════════════
export function buildGym(T) {
  const b = T.b, A = T.A;
  const CX = 198, CZ = -26, GY = T.ground(CX, CZ);

  // sand apron + timber deck
  b.cyl(CX, GY + 0.14 - 1.7, CZ, 17.5, 17.5, 1.7, 0xe8d09a, { seg: 24, ao: 0 });
  const deck = frame(CX, GY + 0.14, CZ, 0.1);
  for (let i = 0; i < 22; i++) b.box(deck.px(-11 + i * 1.05, 0), deck.y, deck.pz(-11 + i * 1.05, 0), 0.92, 0.3, 15.0, [0xb98b58, 0xa87a4c, 0xc2935f][i % 3], { ry: deck.ry, ao: 0 });
  b.box(deck.x, deck.y, deck.z, 23.6, 0.5, 15.6, 0x8a6238, { ry: deck.ry, ao: 0, sy: 0.6 });

  // ── the banner ────────────────────────────────────────────────────────────
  const banner = T.plaque(15.0, 2.6, [
    { t: 'MUSCLE BEACH', s: 0.46, c: '#fff1c8', outline: '#5a2008', spacing: 4 },
    { t: 'LIFT OR LEAVE', s: 0.3, c: '#ffd45a' },
    { t: '(you can’t leave)', s: 0.2, c: '#ffb8a0', weight: 'italic bold' },
  ], { bg: '#b8431e', bg2: 'rgba(255,255,255,.16)', border: '#f2c14e', border2: '#7a2a10', borderW: 0.04 });
  for (const s of [-1, 1]) {
    b.cyl(deck.px(s * 8.2, 7.4), deck.y + 0.3, deck.pz(s * 8.2, 7.4), 0.34, 0.42, 7.6, 0x8a6238, { seg: 9, ao: 0.5, aoBase: deck.y });
    b.sph(deck.px(s * 8.2, 7.4), deck.y + 8.1, deck.pz(s * 8.2, 7.4), 0.45, PAL.gold, { seg: 8, rings: 6 });
  }
  b.box(deck.px(0, 7.4), deck.y + 4.9, deck.pz(0, 7.4), 16.0, 3.0, 0.3, 0x7a2a10, { ry: deck.ry, ao: 0 });
  b.sign(banner, deck.px(0, 7.58), deck.y + 6.4, deck.pz(0, 7.58), 15.0, 2.6, { ry: deck.ry, glow: true });
  b.sign(banner, deck.px(0, 7.22), deck.y + 6.4, deck.pz(0, 7.22), 15.0, 2.6, { ry: deck.ry + Math.PI, glow: true });
  T.act('gym', CX, CZ + 10.2, 'Muscle Beach', [
    'MUSCLE BEACH: LIFT OR LEAVE. someone has added "(you can’t leave)" in smaller, kinder letters.',
    'the dumbbells weigh more than you. the cats lifting them weigh four kilos.',
    'a tabby spots you, nods, and says "you’re getting stronger. good. stay."',
  ], { r: 6.0, speaker: 'MUSCLE BEACH' });

  // ── giant dumbbells ───────────────────────────────────────────────────────
  const dumbbell = (x, y, z, len, r, ry2, tilt = 0, bar = 0xa8b2b8, plate = 0x67737a, big = false) => {
    const rot = { rx: Math.PI / 2 - tilt, ry: ry2, center: true, ao: 0, mat: 'metal' };
    const dx = Math.sin(ry2) * Math.cos(tilt), dy = Math.sin(tilt), dz = Math.cos(ry2) * Math.cos(tilt);
    b.cyl(x, y, z, r * 0.22, r * 0.22, len, bar, { ...rot, seg: 10 });
    // knurled grip so a bar isn't a featureless rod
    for (let k = -1; k <= 1; k += 2) b.cyl(x + dx * k * len * 0.13, y + dy * k * len * 0.13, z + dz * k * len * 0.13, r * 0.27, r * 0.27, len * 0.2, 0x7d878c, { ...rot, seg: 10 });
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const off = s * (len / 2 - 0.35 - i * 0.62);
      b.cyl(x + dx * off, y + dy * off, z + dz * off, r - i * 0.2, r - i * 0.2, 0.52, plate, { ...rot, seg: 14, mat: big ? undefined : 'metal' });
    }
    // hub collar, so the plate face isn't one flat disc
    if (big) for (const s of [-1, 1]) {
      const off = s * (len / 2 - 0.1);
      b.cyl(x + dx * off, y + dy * off, z + dz * off, r * 0.3, r * 0.3, 0.5, 0xb8431e, { ...rot, seg: 12, mat: undefined });
    }
  };
  dumbbell(deck.px(-6.5, -3.0), deck.y + 1.7, deck.pz(-6.5, -3.0), 9.0, 1.7, 0.4, 0);
  dumbbell(deck.px(6.0, -4.0), deck.y + 1.2, deck.pz(6.0, -4.0), 6.0, 1.2, -0.7, 0);
  dumbbell(deck.px(2.0, 4.6), deck.y + 0.9, deck.pz(2.0, 4.6), 4.4, 0.9, 1.2, 0);
  // one absurd one, propped in the sand, bigger than a house
  // The 6.8 m plates used to be dark 0x5c686e on the `metal` material — with
  // no env map and their flat faces turned away from the sun they rendered as
  // a black hole in the beach. Now: bright MATTE plates with a red hub and a
  // painted weight decal, so the disc has something to read.
  // Aimed ACROSS the gym camera, not down its axis: at gRY 0.9 the bar pointed
  // straight at the viewer, so all you saw was one 6.8 m disc whose face is
  // turned away from the sun — hemisphere-only light reads as ~0.3 grey, i.e.
  // a hole in the beach. Side-on, the bar and both plates catch the sun.
  const gDX = CX - 16, gDY = GY + 3.0, gDZ = CZ + 6, gRY = -0.68;
  dumbbell(gDX, gDY, gDZ, 14.0, 2.9, gRY, 0.42, 0xd2dade, 0xb9c3c8, true);
  const kgCell = T.plaque(4.2, 4.2, [
    { t: '800', s: 0.42, c: '#fff2d8', outline: '#7a1c0e' },
    { t: 'kg', s: 0.2, c: '#ffd9a8' },
    { t: '(4 kg of cat)', s: 0.13, c: '#ffbfa0', weight: 'italic bold' },
  ], { bg: '#b8431e', border: '#f2c14e', border2: '#7a1c0e', borderW: 0.05, dpu: 80 });
  for (const s2 of [-1, 1]) {
    const off = s2 * 6.3;
    b.sign(kgCell, gDX + Math.sin(gRY) * Math.cos(0.42) * off, gDY + Math.sin(0.42) * off, gDZ + Math.cos(gRY) * Math.cos(0.42) * off, 3.6, 3.6,
      { ry: gRY + (s2 > 0 ? 0 : Math.PI), rx: s2 > 0 ? -0.42 : 0.42 });
  }
  T.col(gDX, gDZ, 3.2);
  T.col(CX - 17, CZ + 7, 3.6);

  // ── rack + bench ──────────────────────────────────────────────────────────
  const rf = frame(deck.px(-2.5, -5.4), deck.y + 0.32, deck.pz(-2.5, -5.4), deck.ry);
  for (const s of [-1, 1]) {
    b.box(rf.px(s * 1.6, 0), rf.y, rf.pz(s * 1.6, 0), 0.42, 4.4, 0.42, 0xb8431e, { ry: rf.ry, ao: 0.4, aoBase: rf.y, mat: 'metal' });
    b.box(rf.px(s * 1.6, 0), rf.y, rf.pz(s * 1.6, 0), 1.8, 0.3, 2.6, 0xb8431e, { ry: rf.ry, ao: 0, mat: 'metal' });
    b.box(rf.px(s * 1.85, 0.5), rf.y + 3.2, rf.pz(s * 1.85, 0.5), 0.6, 0.3, 0.7, 0x2f3a3c, { ry: rf.ry, ao: 0, mat: 'metal' });
  }
  dumbbell(rf.x, rf.y + 3.45, rf.z, 6.2, 1.1, rf.ry + Math.PI / 2, 0);
  b.box(rf.px(0, 3.4), rf.y, rf.pz(0, 3.4), 1.3, 1.0, 3.4, 0x2f3a3c, { ry: rf.ry, ao: 0.4, aoBase: rf.y });
  b.box(rf.px(0, 3.4), rf.y + 1.0, rf.pz(0, 3.4), 1.5, 0.3, 3.6, 0xb03a63, { ry: rf.ry, ao: 0 });
  loafCat(b, rf.px(0, 4.2), rf.y + 1.3, rf.pz(0, 4.2), 1.3, PAL.fur[1], { ry: rf.ry + 1.5 });

  // ── mirrors ───────────────────────────────────────────────────────────────
  const mirrorCell = A.panel(3.2, 4.0, (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#cfe4ec'); grd.addColorStop(0.45, '#9fc2d2'); grd.addColorStop(0.55, '#b8d4e0'); grd.addColorStop(1, '#7fa6ba');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.5; g.fillStyle = '#e8d09a'; g.fillRect(0, H * 0.72, W, H * 0.28);   // reflected sand
    g.globalAlpha = 0.35; g.fillStyle = '#3a5060';
    catFace(g, W * 0.5, H * 0.5, W * 0.2, '#5a7080', { eye: '#3a5060', nose: '#4a6070' });  // a cat admiring itself
    g.globalAlpha = 0.22; g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.5, 0); g.lineTo(0, H * 0.7); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }, 92);
  const postersCell = [
    ['NO SKIPPING', 'LEG DAY', 'or any other day'],
    ['SPOT YOUR', 'FRIEND', 'they will not leave'],
    ['HYDRATE', 'WITH MILK', 'always milk'],
  ].map((ls) => T.plaque(3.2, 4.0, ls.map((t, k) => ({
    t, s: k === 2 ? 0.13 : 0.24, c: k === 2 ? '#ffbfa0' : '#fff2d8',
    weight: k === 2 ? 'italic bold' : 'bold', outline: k === 2 ? undefined : '#7a1c0e',
  })), { bg: '#b8431e', border: '#f2c14e', border2: '#7a1c0e', borderW: 0.04, dpu: 70 }));
  for (let i = 0; i < 3; i++) {
    const mx = deck.px(-7.2 + i * 3.5, -7.0), mz = deck.pz(-7.2 + i * 3.5, -7.0);
    b.box(mx, deck.y + 0.3, mz, 3.5, 4.4, 0.4, 0x6a4a2a, { ry: deck.ry, ao: 0.4, aoBase: deck.y });
    b.sign(mirrorCell, deck.px(-7.2 + i * 3.5, -6.78), deck.y + 2.6, deck.pz(-7.2 + i * 3.5, -6.78), 3.2, 4.0, { ry: deck.ry });
    // the BACK of the mirror faces the approach: give it a poster, not a slab
    b.sign(postersCell[i], deck.px(-7.2 + i * 3.5, -7.22), deck.y + 2.6, deck.pz(-7.2 + i * 3.5, -7.22), 3.2, 4.0, { ry: deck.ry + Math.PI });
  }

  // ── smoothie stand ────────────────────────────────────────────────────────
  const sf = frame(CX + 13.5, T.ground(CX + 13.5, CZ + 5), CZ + 5, -0.9);
  b.box(sf.x, sf.y, sf.z, 5.0, 2.9, 3.4, 0xf2d9a0, { ry: sf.ry, ao: 0.6, aoBase: sf.y });
  b.box(sf.px(0, 1.9), sf.y + 2.5, sf.pz(0, 1.9), 5.6, 0.3, 1.6, 0x8a6238, { ry: sf.ry, rx: 0.26, ao: 0 });
  for (let i = 0; i < 9; i++) b.cone(sf.px(-2.4 + i * 0.6, 2.5), sf.y + 3.2, sf.pz(-2.4 + i * 0.6, 2.5), 0.36, 1.0, 0xb8a06a, { seg: 5, rx: Math.PI + 0.26, ry: sf.ry, ao: 0 });
  b.box(sf.px(0, 1.72), sf.y + 1.5, sf.pz(0, 1.72), 5.2, 0.3, 0.9, 0xe8dcc0, { ry: sf.ry, ao: 0 });
  b.box(sf.px(0, 1.4), sf.y, sf.pz(0, 1.4), 4.6, 1.5, 0.4, 0x8a6238, { ry: sf.ry, ao: 0 });
  for (let i = 0; i < 3; i++) { b.cyl(sf.px(-1.4 + i * 1.2, 1.5), sf.y + 1.65, sf.pz(-1.4 + i * 1.2, 1.5), 0.25, 0.2, 0.7, [0xf06aa0, 0x8fe05a, 0xf2c14e][i], { seg: 8, ao: 0 }); b.cyl(sf.px(-1.4 + i * 1.2, 1.5), sf.y + 2.3, sf.pz(-1.4 + i * 1.2, 1.5), 0.05, 0.05, 0.5, 0xf6f2ea, { seg: 5, rz: 0.3, ao: 0 }); }
  const shake = T.plaque(4.2, 1.0, [{ t: 'GAINS SHAKE', s: 0.46, c: '#5a2008' }, { t: '90% tuna · 10% belief', s: 0.24, c: '#8a3a10', weight: 'italic bold' }], { bg: '#f2c14e', border: '#b8431e', borderW: 0.06, dpu: 130 });
  b.box(sf.px(0, 1.9), sf.y + 3.2, sf.pz(0, 1.9), 4.4, 1.1, 0.24, 0xb8431e, { ry: sf.ry, ao: 0 });
  b.sign(shake, sf.px(0, 2.04), sf.y + 3.75, sf.pz(0, 2.04), 4.2, 1.0, { ry: sf.ry });
  T.colBox(sf.x, sf.z, 5.4, 3.8, sf.ry);
  // Contract O — ONE prompt at the stand. The escape tunnel is dug in behind
  // this stand (cat/containment/scenery.js finds it by this colBox), and the
  // tunnel story (cat/containment.js) re-registers this very id, 'cat_smoothie',
  // at world:ready: "Look behind the smoothie stand", the menu joke folded into
  // its first line. Same id = it REPLACES this entry, so the chatter can never
  // out-rank the story again (interaction.nearest picks by distance). Without
  // containment, this is the stand's chatter, reachable from every side.
  T.act('smoothie', sf.x, sf.z, 'Smoothie stand', [
    'GAINS SHAKE: 90% tuna, 10% belief. it is served in a bucket.',
    'the menu has one other item: "WATER (for guests, we worry about you)".',
    'you drink it. it is somehow excellent. you are annoyed about this.',
  ], { r: 4.6, speaker: 'SMOOTHIE STAND' });

  // ── scoreboard + chalk ────────────────────────────────────────────────────
  const scores = A.panel(3.6, 2.6, (g, W, H) => {
    g.fillStyle = '#22301f'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#8a6238'; g.lineWidth = W * 0.035; g.strokeRect(W * 0.02, H * 0.02, W * 0.96, H * 0.96);
    g.fillStyle = '#e8e0c8'; g.font = `bold ${H * 0.14}px ${FONTS.SANS}`; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText('RECORDS', W / 2, H * 0.06);
    const rows = [['BENCH', 'Sgt. Biscuit', '41 kg'], ['DEADLIFT', 'Doris', '63 kg'], ['SNATCH', 'a bird', '—'], ['ESCAPE', 'nobody', '0 m']];
    rows.forEach((r, i) => {
      const y = H * (0.28 + i * 0.17);
      g.font = `bold ${H * 0.095}px ${FONTS.SANS}`; g.textAlign = 'left';
      g.fillStyle = '#ffcb4a'; g.fillText(r[0], W * 0.06, y);
      g.fillStyle = '#cfc6ae'; g.fillText(r[1], W * 0.40, y);
      g.textAlign = 'right'; g.fillStyle = i === 3 ? '#ff6a5a' : '#8fe0a8'; g.fillText(r[2], W * 0.94, y);
    });
  }, 110);
  b.box(deck.px(9.6, -2.0), deck.y + 0.3, deck.pz(9.6, -2.0), 0.4, 4.2, 4.0, 0x6a4a2a, { ry: deck.ry, ao: 0.4, aoBase: deck.y });
  b.sign(scores, deck.px(9.38, -2.0), deck.y + 2.6, deck.pz(9.38, -2.0), 3.6, 2.6, { ry: deck.ry - Math.PI / 2 });
  b.sign(scores, deck.px(9.82, -2.0), deck.y + 2.6, deck.pz(9.82, -2.0), 3.6, 2.6, { ry: deck.ry + Math.PI / 2 });
  barrel(b, deck.px(4.6, -6.4), deck.y + 0.3, deck.pz(4.6, -6.4), 0.6, 1.0, 0xd8c8a4);
  for (let i = 0; i < 4; i++) b.box(deck.px(7.4, 2.0 + i * 0.1), deck.y + 0.4 + i * 0.16, deck.pz(7.4, 2.0 + i * 0.1), 1.3, 0.16, 0.9, PAL.cloth[i % PAL.cloth.length], { ry: deck.ry + i * 0.2, ao: 0 });
  loafCat(b, deck.px(7.4, 2.2), deck.y + 1.06, deck.pz(7.4, 2.2), 1.4, PAL.fur[5], { ry: deck.ry + 0.9 });
  T.colBox(CX, CZ, 22, 14, deck.ry);
}

// ═════════════════════════════════════════════════════════════════════════════
// FISH HARBOR — five boats, none of which work
// ═════════════════════════════════════════════════════════════════════════════
/**
 * A BOAT, not a stack of slabs.
 *
 * The five in Fish Harbor used to be seven tapering boxes and a cone each, in
 * one flat colour, interpenetrating wherever two of them moored close: from the
 * quay they read as crates half-sunk in the sea. This one has a sheered hull
 * with a rubbing strake and a painted boot-top stripe, a gunwale you can see the
 * thickness of, thwarts, a transom with the boat's name on it, and — where the
 * gag needs one — a cabin, a mast with a sail, and foam at the waterline.
 *
 *   o = { x,y,z, len, wid, ry, hull, deck, stripe, trim, depth, rz,
 *         cabin, cabinColor, mast, sailColor, name (atlas cell), foam }
 */
function boat(T, o) {
  const b = o.into || T.b;
  const { x, y, z, len, wid, ry } = o;
  const dep = o.depth ?? 1.6, rz = o.rz ?? 0;
  const hull = o.hull, deckC = o.deck ?? PAL.woodLight, trim = o.trim ?? deckC;
  const sn = Math.sin(ry), cs = Math.cos(ry);
  // (along, across) → world.  `along` runs bow-positive.
  const P = (a, k = 0) => [x + sn * a + cs * k, z + cs * a - sn * k];
  const L = (a) => y + Math.abs(a / (len / 2)) * dep * 0.22;      // sheer: ends ride higher

  // ── hull ────────────────────────────────────────────────────────────────
  const n = o.ribs ?? 7;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, a = (-0.5 + t) * len;
    const taper = Math.sin(t * Math.PI) * 0.52 + 0.48;
    const p = P(a);
    b.box(p[0], L(a), p[1], wid * taper, dep, len / n + 0.14, hull, { ry, rz, ao: 0 });
    // the rubbing strake: a proud band two thirds up, in the trim colour
    b.box(p[0], L(a) + dep * 0.58, p[1], wid * taper + 0.13, 0.17, len / n + 0.14, trim, { ry, rz, ao: 0 });
  }
  // painted boot-top stripe down both sides (one atlas cell, two triangles)
  if (o.stripeCell) for (const k of [-1, 1]) {
    const p = P(0, k * (wid * 0.5 + 0.03));
    b.sign(o.stripeCell, p[0], L(0) + dep * 0.3, p[1], len * 0.86, dep * 0.44, { ry: ry + (k > 0 ? Math.PI / 2 : -Math.PI / 2), rz });
  }
  // gunwale: a capping rail all round, so the hull has a thickness at the top
  for (const k of [-1, 1]) {
    const p = P(0, k * wid * 0.5);
    b.box(p[0], L(0) + dep - 0.12, p[1], 0.22, 0.24, len * 0.9, trim, { ry, rz, ao: 0 });
  }
  // bow: a stem that rises, and the forefoot under it
  {
    const p = P(len * 0.46);
    b.cone(p[0], L(len * 0.46) + dep * 0.46, p[1], wid * 0.36, dep * 1.25, hull, { seg: 7, ry, rx: Math.PI / 2, rz, ao: 0 });
    const q = P(len * 0.5);
    b.box(q[0], L(len * 0.5) + dep * 0.5, q[1], 0.24, dep * 0.7, 0.5, trim, { ry, rz, ao: 0 });
  }
  // transom: a flat board across the stern, with the boat's name on it
  {
    const p = P(-len * 0.5 + 0.1);
    b.box(p[0], L(len * 0.5), p[1], wid * 0.78, dep * 0.96, 0.26, deckC, { ry, rz, ao: 0 });
    if (o.name) {
      const q = P(-len * 0.5 - 0.05);
      b.sign(o.name, q[0], L(len * 0.5) + dep * 0.56, q[1], wid * 0.66, dep * 0.34, { ry: ry + Math.PI, rz: -rz });
    }
  }
  // ── decks and thwarts ───────────────────────────────────────────────────
  if (o.deckPlan !== false) {
    for (const e of [-1, 1]) {
      const p = P(e * len * 0.33);
      b.box(p[0], L(0) + dep * 0.88, p[1], wid * 0.86, 0.16, len * 0.3, deckC, { ry, rz, ao: 0 });
    }
    b.box(P(0)[0], L(0) + dep * 0.4, P(0)[1], wid * 0.8, 0.14, len * 0.42, o.sole ?? 0x7a6242, { ry, rz, ao: 0 });   // the sole
    for (let i = 0; i < 3; i++) {
      const p = P((i - 1) * len * 0.14);
      b.box(p[0], L(0) + dep * 0.64, p[1], wid * 0.84, 0.13, 0.3, o.thwart ?? deckC, { ry, rz, ao: 0 });
    }
  }
  // ── cabin ───────────────────────────────────────────────────────────────
  if (o.cabin) {
    const cl = o.cabin.len ?? len * 0.3, cw = o.cabin.wid ?? wid * 0.74, chh = o.cabin.h ?? 1.25;
    const ca = o.cabin.at ?? -len * 0.14;
    const p = P(ca);
    b.box(p[0], L(0) + dep * 0.9, p[1], cw, chh, cl, o.cabin.color ?? 0xf2ead4, { ry, rz, ao: 0 });
    b.box(p[0], L(0) + dep * 0.9 + chh, p[1], cw + 0.3, 0.18, cl + 0.3, o.cabin.roof ?? trim, { ry, rz, ao: 0 });
    for (const k of [-1, 1]) {
      const q = P(ca, k * (cw / 2 + 0.02));
      b.quad(q[0], L(0) + dep * 0.9 + chh * 0.6, q[1], cl * 0.6, chh * 0.42, 0x2b4450, { ry: ry + (k > 0 ? Math.PI / 2 : -Math.PI / 2), rz, mat: 'win' });
    }
    const d2 = P(ca + cl / 2 + 0.02);
    b.box(d2[0], L(0) + dep * 0.9, d2[1], cw * 0.42, chh * 0.8, 0.1, o.cabin.door ?? trim, { ry, rz, ao: 0 });
    b.cyl(p[0], L(0) + dep * 0.9 + chh + 0.18, p[1], 0.13, 0.15, 0.5, 0x5a5248, { seg: 6, ry, rz, ao: 0 });   // the stove pipe
  }
  // ── mast, boom and a sail ───────────────────────────────────────────────
  if (o.mast) {
    const ma = o.mast.at ?? len * 0.12, mh = o.mast.h ?? len * 0.72;
    const p = P(ma);
    b.cyl(p[0], L(0) + dep * 0.5, p[1], 0.11, 0.17, mh, o.mast.color ?? 0xd8c4a0, { seg: 8, ry, rz, ao: 0 });
    b.sph(p[0], L(0) + dep * 0.5 + mh, p[1], 0.19, PAL.gold, { seg: 6, rings: 4 });
    // boom, swung off to one side
    const bs = o.mast.side ?? 1;
    const q = P(ma - len * 0.26, bs * len * 0.1);
    b.cyl(q[0], L(0) + dep * 0.95, q[1], 0.08, 0.09, len * 0.5, o.mast.color ?? 0xd8c4a0,
      { seg: 6, center: true, ry: ry + bs * 0.36, rz: Math.PI / 2, ao: 0 });
    if (o.sailCell) {
      // a sail is a curved surface: three leaves, each a little further round
      for (let i = 0; i < 3; i++) {
        const off = bs * (0.18 + i * 0.42);
        const r2 = P(ma - len * 0.14, off);
        b.sign(o.sailCell, r2[0], L(0) + dep * 0.6 + mh * 0.48, r2[1], len * 0.46, mh * 0.76,
          { ry: ry + bs * (0.12 + i * 0.16), rz });
      }
    }
    // shrouds
    for (const k of [-1, 1]) {
      const a1 = P(ma), a2 = P(ma - len * 0.06, k * wid * 0.46);
      b.tube([[a1[0], L(0) + dep * 0.5 + mh * 0.92, a1[1]], [a2[0], L(0) + dep * 0.95, a2[1]]], 0.035, 0x8a7a5a, { rseg: 3, seg: 4 });
    }
  }
  // ── foam at the waterline ───────────────────────────────────────────────
  if (o.foam) {
    b.torus(x, o.foam, z, Math.max(len, wid) * 0.42, 0.2, 0xf2f6f4, { rx: -Math.PI / 2, seg: 18, tseg: 4, sx: len / Math.max(len, wid) * 1.12, sz: wid / Math.max(len, wid) * 2.1, ry });
    for (let i = 0; i < 7; i++) {
      const a = -len * 0.42 + len * 0.84 * (i / 6), k = (i % 2 ? 1 : -1) * (wid * 0.52 + 0.12);
      const p = P(a, k);
      b.sph(p[0], o.foam + 0.04, p[1], 0.24 + (i % 3) * 0.07, 0xf6faf8, { seg: 6, rings: 4, sy: 0.32 });
    }
  }
  if (o.collide !== false) T.col(x, z, Math.max(wid, len * 0.3) * 0.6);
}

export function buildHarbor(T) {
  const b = T.b, A = T.A;
  const QY = 4.0;                                // quay deck height
  const EDGE = 93.5;                             // west face of the quay wall (the water is beyond)
  const QX = 98.75, QZ = 70.5, QW = 10.5, QL = 13;

  // ── stone quay ────────────────────────────────────────────────────────────
  b.box(QX, QY - 5.4, QZ, QW, 5.4, QL, 0xb5a68a, { ao: 0 });
  b.box(QX, QY - 0.34, QZ, QW + 0.3, 0.36, QL + 0.3, 0xcdbd9e, { ao: 0 });
  for (let r = 0; r < 7; r++) for (let c = 0; c < 8; c++) {          // flagstones
    const off = (r % 2) * 0.65;
    b.box(94.3 + r * 1.42, QY - 0.03, 64.9 + off + c * 1.62, 1.3, 0.1, 1.46, (r + c) % 3 ? 0xc9b99a : 0xb7a68a, { ao: 0 });
  }
  for (let i = 0; i < 9; i++) b.box(EDGE - 0.05, QY - 1.2 - i * 0.6, 65 + (i % 5) * 2.9, 0.45, 0.55, 3.4, 0x9a8b70, { ao: 0 });   // wall courses
  b.box(EDGE + 0.22, QY - 0.55, QZ, 0.9, 0.6, QL + 0.2, 0xc2b295, { ao: 0 });                                                     // wall coping
  // ── slipway down into the water at the south end ─────────────────────────
  // Its bottom used to sit at y 0.6 — half a metre clear of the shore it runs
  // down to — so from the beach you saw its unlit UNDERSIDE as a large flat
  // near-black rectangle floating over the grass. Sunk past sea level, with
  // cheek walls, so no face of it is ever a card in mid-air.
  b.wedge(95.5, QY - 5.2, 79.0, 5.0, 5.2, 6.0, 0xa89876, { ry: 0.4, ao: 0 });
  for (const s2 of [-1, 1]) {
    const cx2 = 95.5 + Math.cos(0.4) * s2 * 3.1, cz2 = 79.0 - Math.sin(0.4) * s2 * 3.1;
    b.box(cx2, QY - 5.2, cz2, 0.7, 5.4, 6.2, 0x9a8b70, { ry: 0.4, ao: 0 });
    b.box(cx2, QY + 0.2, cz2, 0.95, 0.3, 6.4, 0xc2b295, { ry: 0.4, ao: 0 });
  }
  // slip rails, so it reads as a slipway and not a ramp
  for (const s2 of [-1, 1]) b.box(95.5 + Math.cos(0.4) * s2 * 1.2, QY - 1.0, 79.0 - Math.sin(0.4) * s2 * 1.2, 0.22, 0.16, 6.0, 0x5a5248, { ry: 0.4, rz: 0.58, ao: 0, mat: 'metal' });
  // ── the quay's own faces get stone courses: a 10 x 5.4 m untextured slab is
  //    the single largest flat mass on this shore ────────────────────────────
  for (let i = 0; i < 7; i++) {
    b.box(QX, QY - 0.9 - i * 0.72, QZ + QL / 2 + 0.06, QW + 0.1 + (i % 2) * 0.12, 0.6, 0.3, i % 2 ? 0xa89a7e : 0xb7a68a, { ao: 0 });
    b.box(QX + QW / 2 + 0.06, QY - 0.9 - i * 0.72, QZ, 0.3, 0.6, QL + 0.1 + (i % 2) * 0.12, i % 2 ? 0xb7a68a : 0xa89a7e, { ao: 0 });
  }
  // bollards + mooring rings
  for (let i = 0; i < 6; i++) {
    const z = 65.5 + i * 2.2;
    b.cyl(EDGE + 1.2, QY, z, 0.3, 0.36, 0.9, 0x4a4238, { seg: 9, mat: 'metal', ao: 0 });
    b.sph(EDGE + 1.2, QY + 0.95, z, 0.34, 0x4a4238, { seg: 9, rings: 6, mat: 'metal', sy: 0.6 });
    if (i % 2) b.torus(EDGE + 0.15, QY - 0.9, z + 1.1, 0.28, 0.06, 0x6a5a44, { ry: Math.PI / 2, seg: 10, tseg: 4, mat: 'metal' });
  }
  // nets drying over the wall + lobster pots
  for (let i = 0; i < 3; i++) {
    const z = 66.5 + i * 4.2;
    for (let k = 0; k < 7; k++) b.tube([[EDGE + 0.2, QY + 0.1, z - 1.5 + k * 0.5], [EDGE - 0.3, QY - 1.3 - (k % 2) * 0.3, z - 1.45 + k * 0.5], [EDGE + 0.05, QY - 2.7, z - 1.4 + k * 0.5]], 0.05, 0x6a7a58, { rseg: 4, seg: 8 });
    b.cyl(EDGE + 2.6, QY, z + 1.8, 0.7, 0.8, 0.85, 0x7a6a4a, { seg: 9, ao: 0.4, aoBase: QY });
    for (let k = 0; k < 3; k++) b.torus(EDGE + 2.6, QY + 0.25 + k * 0.28, z + 1.8, 0.78 - k * 0.08, 0.06, 0x5a4a34, { rx: -Math.PI / 2, seg: 9, tseg: 3 });
  }
  for (let i = 0; i < 7; i++) crate(b, 97.2 + (i % 3) * 1.4, QY, 74.3 + Math.floor(i / 3) * 1.4 + (i % 2) * 0.25, 1.05, i * 0.4, [0xb4844f, 0xa6763f, 0xc0925c][i % 3]);
  loafCat(b, 98.6, QY + 0.9, 75.7, 1.3, PAL.fur[0], { ry: 1.2 });
  for (let i = 0; i < 3; i++) barrel(b, 102.4 + (i % 2) * 1.25, QY, 65.5 + i * 1.4, 0.55, 1.15);
  for (let i = 0; i < 5; i++) {                                        // fish boxes on ice
    const x = 96.2 + (i % 2) * 1.5, z = 71.5 + i * 1.1;
    b.box(x, QY, z, 1.4, 0.45, 1.0, 0xdfeaf0, { ry: i * 0.3, ao: 0 });
    b.sph(x, QY + 0.5, z, 0.42, 0x9fb4c2, { seg: 7, rings: 5, sy: 0.4, sx: 1.6, ry: i * 0.3 });
  }

  // ── the crane that has never lifted anything ─────────────────────────────
  b.box(102.2, QY, 66.6, 2.0, 0.6, 2.0, 0x6a6258, { ao: 0 });
  b.cyl(102.2, QY + 0.6, 66.6, 0.4, 0.5, 7.2, 0xc23a2a, { seg: 10, mat: 'metal', ao: 0.4, aoBase: QY });
  b.cyl(99.4, QY + 7.4, 66.6, 0.26, 0.3, 7.4, 0xc23a2a, { seg: 8, center: true, rz: Math.PI / 2 - 0.35, mat: 'metal', ao: 0 });
  b.tube([[96.0, QY + 8.5, 66.6], [96.0, QY + 5.4, 66.6]], 0.05, 0x3a3229, { rseg: 4 });
  b.cyl(96.0, QY + 4.4, 66.6, 0.3, 0.3, 1.0, 0x3a3229, { seg: 8, mat: 'metal', ao: 0 });

  // ── FIVE BOATS, NONE OF WHICH WORK ───────────────────────────────────────
  // shared paint: a boot-top stripe cell per hull, and one sailcloth
  const bootTop = (a, c2) => T.A.cell(256, 40, (g, W, H) => {
    g.fillStyle = a; g.fillRect(0, 0, W, H);
    g.fillStyle = c2; g.fillRect(0, H * 0.30, W, H * 0.40);
    g.globalAlpha = 0.2; g.fillStyle = '#1a2228'; g.fillRect(0, H * 0.74, W, H * 0.26);
    g.globalAlpha = 0.12; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H * 0.16);
    g.globalAlpha = 1;
  });
  const nameCell = (t, bg, fg) => T.A.panel(2.0, 0.45, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = fg; g.lineWidth = H * 0.09; g.strokeRect(H * 0.08, H * 0.08, W - H * 0.16, H - H * 0.16);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${H * 0.46}px ${FONTS.SERIF}`;
    g.fillText(t, W / 2, H * 0.54);
  }, 150);
  const sailCell = T.A.panel(4.0, 5.0, (g, W, H) => {
    g.fillStyle = '#f4efe0'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(180,168,140,.7)'; g.lineWidth = W * 0.012;
    for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, H * i / 5); g.lineTo(W, H * i / 5 - H * 0.02); g.stroke(); }   // panel seams
    g.fillStyle = '#b8341e';
    g.beginPath(); g.arc(W * 0.5, H * 0.42, W * 0.2, 0, Math.PI * 2); g.fill();
    catFace(g, W * 0.5, H * 0.42, W * 0.13, '#f4efe0', { eye: '#b8341e', nose: '#f2c14e' });
    g.globalAlpha = 0.14; g.fillStyle = '#6a6250'; g.fillRect(0, H * 0.8, W, H * 0.2); g.globalAlpha = 1;
  }, 60);

  // 1 · on blocks, up on the quay, "dry dock since 2009"
  boat(T, {
    x: 98.6, y: QY + 1.05, z: 68.6, len: 8.4, wid: 3.0, ry: 0.2, depth: 1.55,
    hull: 0x2f6a8a, deck: 0xd8c4a0, trim: 0xf2c14e, stripeCell: bootTop('#2f6a8a', '#f2c14e'),
    name: nameCell('ALMOST', '#1f4d66', '#ffe2a8'),
    cabin: { len: 2.3, wid: 2.1, h: 1.3, at: -1.2, color: 0xe8dcc0, roof: 0x2f6a8a, door: 0x8a5a34 },
    mast: { at: 1.0, h: 5.6, side: -1, color: 0xd8c4a0 },
  });
  for (let i = 0; i < 4; i++) { b.box(98.6, QY, 65.6 + i * 2.0, 1.6, 1.2, 1.0, 0x7a6242, { ao: 0 }); b.box(98.6, QY + 0.35, 65.6 + i * 2.0, 1.9, 0.25, 1.2, 0x5e4a2e, { ao: 0 }); }
  // grass growing out of the blocks, which is the whole joke
  for (let i = 0; i < 6; i++) b.cone(98.0 + (i % 3) * 0.6, QY + 0.6, 65.9 + i * 1.3, 0.1, 0.55 + (i % 2) * 0.2, 0x6f9a44, { seg: 4, rz: (i % 2 ? 0.2 : -0.2), ao: 0 });
  const dry = T.plaque(2.6, 0.8, [{ t: 'DRY DOCK', s: 0.4, c: '#fff0d0' }, { t: 'since 2009', s: 0.24, c: '#ffc9a8', weight: 'italic bold' }], { bg: '#8a3a1e', border: '#f2c14e', borderW: 0.06, grime: 0.22, dpu: 140 });
  const dryF = frame(100.9, QY, 67.2, -1.05);
  b.cyl(dryF.x, QY, dryF.z, 0.12, 0.15, 3.2, PAL.wood, { seg: 6, ao: 0.4, aoBase: QY });
  b.sph(dryF.x, QY + 3.3, dryF.z, 0.19, PAL.gold, { seg: 7, rings: 5 });
  hangingPlate(b, dryF, 0, 0.0, QY + 2.95, 2.6, 0.8, dry, { rz: 0.05, frame: 0x6a4a2a });
  T.col(dryF.x, dryF.z, 0.5);
  T.act('boat_blocks', 101.4, 68.6, 'Boat on blocks', [
    'DRY DOCK SINCE 2009. the hull is perfect. the blocks have grass growing out of them.',
    'the harbourmaster says it needs "one more part". he has said this for sixteen years.',
    'you look underneath. there is nothing wrong with it at all.',
  ], { r: 3.6, speaker: 'THE BOAT ON BLOCKS' });

  // 2 · holed, half-sunk, listing
  boat(T, {
    x: 87.2, y: -0.62, z: 70.4, len: 7.6, wid: 2.9, ry: 0.55, rz: 0.24, depth: 1.7,
    hull: 0x8a5a34, deck: 0xc2a878, trim: 0xe8514a, stripeCell: bootTop('#8a5a34', '#e8514a'),
    name: nameCell('SIEVE', '#5a3a20', '#f0d8b0'), foam: 0.02, deckPlan: true, sole: 0x6a5238,
  });
  // the hole, with very neat edges, and the daylight behind it
  b.cyl(87.2 + Math.cos(0.55) * 1.35, 0.42, 70.4 - Math.sin(0.55) * 1.35, 0.62, 0.62, 0.5, 0x120f0c, { seg: 12, ry: 0.55, rz: 0.24 + Math.PI / 2, ao: 0 });
  b.torus(87.2 + Math.cos(0.55) * 1.5, 0.42, 70.4 - Math.sin(0.55) * 1.5, 0.66, 0.09, 0x6a4428, { seg: 12, tseg: 4, ry: 0.55 + Math.PI / 2, rz: 0.24 });
  loafCat(b, 87.2 - Math.sin(0.55) * 2.0, 0.72, 70.4 - Math.cos(0.55) * 2.0, 1.3, PAL.fur[3], { ry: 0.9 });
  // the note nailed to the mast stub. the note is a leaf.
  b.cyl(87.2 + Math.sin(0.55) * 1.1, 0.55, 70.4 + Math.cos(0.55) * 1.1, 0.1, 0.13, 1.8, 0x8a5a34, { seg: 6, rz: 0.24, ry: 0.55, ao: 0 });
  b.sph(87.2 + Math.sin(0.55) * 1.2, 2.1, 70.4 + Math.cos(0.55) * 1.2, 0.3, 0x7ab84e, { seg: 6, rings: 4, sz: 0.1, ry: 0.9, rz: 0.4 });
  T.act('boat_hole', 90.0, 69.8, 'Holed boat', [
    'there is a hole in it the size of a dinner plate. the edges are very neat. almost cut.',
    'a cat is asleep in the dry end. she does not consider this a problem.',
    'a note nailed to the mast reads: "AWAITING PART". the note is a leaf.',
  ], { r: 4.4, speaker: 'THE HOLED BOAT' });

  // 3 · cardboard
  const cardCell = A.panel(2.6, 1.1, (g, W, H) => {
    g.fillStyle = '#c99a5e'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#a87a42'; g.lineWidth = H * 0.05;
    for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(i * W / 18, 0); g.lineTo(i * W / 18, H); g.stroke(); }
    g.fillStyle = '#5a4024'; g.font = `bold ${H * 0.3}px ${FONTS.SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('THIS SIDE UP', W / 2, H * 0.36);
    // portholes, drawn on in marker
    g.strokeStyle = '#5a4024'; g.lineWidth = H * 0.045;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(W * (0.24 + i * 0.26), H * 0.74, H * 0.14, 0, Math.PI * 2); g.stroke(); }
    g.globalAlpha = 0.3; g.fillStyle = '#6a5238'; g.fillRect(0, H * 0.86, W, H * 0.14); g.globalAlpha = 1;
  }, 120);
  boat(T, {
    x: 84.6, y: -0.45, z: 74.8, len: 7.0, wid: 2.7, ry: -0.4, rz: -0.1, depth: 1.5,
    hull: 0xc99a5e, deck: 0xb8894e, trim: 0xa87a42, stripeCell: cardCell,
    name: nameCell('FRAGILE', '#b08046', '#4a3418'), foam: 0.02, deckPlan: false,
  });
  // the flaps are still folded
  for (const k of [-1, 1]) b.box(84.6 + Math.cos(-0.4) * k * 1.3, 0.85, 74.8 - Math.sin(-0.4) * k * 1.3, 2.6, 0.1, 2.2, 0xbf8f52, { ry: -0.4, rz: k * 0.42, ao: 0 });
  b.box(84.6, 0.95, 74.8, 2.4, 0.12, 2.0, 0xb8894e, { ry: -0.4, rz: 0.35, ao: 0 });
  T.act('boat_card', 87.4, 75.2, 'Cardboard boat', [
    'it is made of cardboard. it says THIS SIDE UP on the hull. it is, currently, this side up.',
    'the flaps are still folded. somebody has drawn portholes on in marker.',
    'a cat tells you it is "seaworthy in principle". you agree that is where it is worthy.',
  ], { r: 4.4, speaker: 'THE CARDBOARD BOAT' });

  // 4 · a painting of a boat, on an easel at the water's edge (painted both sides)
  const paintCell = A.panel(7.2, 3.4, (g, W, H) => {
    g.fillStyle = '#8ec4dc'; g.fillRect(0, 0, W, H * 0.52);
    g.fillStyle = '#3f7fa8'; g.fillRect(0, H * 0.52, W, H * 0.48);
    g.fillStyle = '#2f6a8a'; g.beginPath();
    g.moveTo(W * 0.18, H * 0.58); g.lineTo(W * 0.82, H * 0.58); g.lineTo(W * 0.72, H * 0.84); g.lineTo(W * 0.28, H * 0.84); g.closePath(); g.fill();
    g.fillStyle = '#f2c14e'; g.fillRect(W * 0.18, H * 0.55, W * 0.64, H * 0.045);
    g.fillStyle = '#d8c4a0'; g.fillRect(W * 0.48, H * 0.16, W * 0.025, H * 0.42);
    g.fillStyle = '#f6f2ea'; g.beginPath(); g.moveTo(W * 0.5, H * 0.18); g.lineTo(W * 0.68, H * 0.52); g.lineTo(W * 0.5, H * 0.52); g.closePath(); g.fill();
    g.globalAlpha = 0.6; g.strokeStyle = '#ffffff'; g.lineWidth = H * 0.012;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(W * (0.05 + i * 0.17), H * (0.9 - (i % 2) * 0.04)); g.lineTo(W * (0.13 + i * 0.17), H * (0.9 - (i % 2) * 0.04)); g.stroke(); }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(30,22,14,.7)'; g.fillRect(W * 0.28, H * 0.86, W * 0.44, H * 0.12);
    g.fillStyle = '#ffe9a8'; g.font = `italic bold ${H * 0.08}px ${FONTS.SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('"THE ESCAPE", oil on board', W * 0.5, H * 0.92);
  }, 96);
  // A SLIM gilt frame on a real easel, not a 7 x 3.6 m brown slab. That slab was
  // the biggest untextured mass on the quay and it read as a fallen mast.
  const pry = 1.62, pcx = 93.6, pcz = 74.6, pcy = 0.55;
  const pf2 = frame(pcx, pcy, pcz, pry);
  for (const [ox, oy, ow, oh] of [[0, 1.82, 7.5, 0.2], [0, -0.02, 7.5, 0.2], [-3.65, 0.9, 0.2, 1.9], [3.65, 0.9, 0.2, 1.9]]) {
    b.box(pf2.px(ox, 0), pcy + oy - oh / 2, pf2.pz(ox, 0), ow, oh, 0.26, 0x8a6a3a, { ry: pry, ao: 0, mat: 'metal' });
  }
  b.box(pcx, pcy, pcz, 7.2, 3.4, 0.1, 0x2a2620, { ry: pry, ao: 0 });               // the canvas backing, thin
  for (const s2 of [-1, 1]) b.sign(paintCell, pcx + Math.sin(pry) * s2 * 0.09, pcy + 1.7, pcz + Math.cos(pry) * s2 * 0.09, 7.2, 3.4, { ry: pry + (s2 > 0 ? 0 : Math.PI) });
  // the easel: three legs and a shelf
  for (const [ex, ez, tx2, tz2] of [[-2.6, -0.2, -0.5, -1.5], [2.6, -0.2, 0.5, -1.5], [0, 0.25, 0, 1.6]]) {
    const a1 = [pf2.px(ex, 0), pcy - 0.1, pf2.pz(ex, 0)];
    const a2 = [pf2.px(ex + tx2, tz2), T.ground(pf2.px(ex + tx2, tz2), pf2.pz(ex + tx2, tz2)) - 0.1, pf2.pz(ex + tx2, tz2)];
    b.tube([a1, a2], 0.11, PAL.wood, { rseg: 5, seg: 3 });
  }
  b.box(pf2.px(0, -0.22), pcy - 0.14, pf2.pz(0, -0.22), 6.4, 0.16, 0.44, PAL.wood, { ry: pry, ao: 0 });
  T.act('boat_paint', 95.2, 71.8, 'A painting of a boat', [
    'it is a painting of a boat. it is propped at the water\u2019s edge, facing out to sea.',
    'the plaque says: "THE ESCAPE", oil on board. it is beautifully done.',
    'a cat stands beside it, looking out, and sighs contentedly. "she\u2019s a good ship," he says.',
  ], { r: 4.2, speaker: 'THE PAINTING' });

  // 5 · a perfect boat with a real sail, chained to the quay
  boat(T, {
    x: 91.0, y: -0.38, z: 69.6, len: 8.0, wid: 3.0, ry: -0.12, depth: 1.7,
    hull: 0xf2ead4, deck: 0xd8c4a0, trim: 0x3a6ea5, stripeCell: bootTop('#f2ead4', '#3a6ea5'),
    name: nameCell('THE KEY', '#2a5480', '#eaf6ff'), foam: 0.02,
    cabin: { len: 2.0, wid: 2.2, h: 1.2, at: -1.8, color: 0xeef4f8, roof: 0x3a6ea5, door: 0x8a5a34 },
    mast: { at: 0.8, h: 6.4, side: 1, color: 0xd9b483 }, sailCell,
  });
  // the mast is also a scratching post, because of course it is
  for (let i = 0; i < 5; i++) b.torus(91.0 + Math.sin(-0.12) * 0.8, 1.2 + i * 0.85, 69.6 + Math.cos(-0.12) * 0.8, 0.22 - i * 0.008, 0.075, i % 2 ? 0xc9a271 : 0xe4c69a, { rx: -Math.PI / 2, seg: 9, tseg: 3 });
  loafCat(b, 91.4, 1.28, 70.9, 1.4, PAL.fur[3], { ry: -0.4 });
  b.tube([[92.6, 0.75, 69.9], [93.1, -0.1, 70.0], [EDGE + 0.2, QY - 0.9, 70.2]], 0.14, 0x5a5a58, { rseg: 5, seg: 10, mat: 'metal' });
  b.box(92.8, 0.55, 69.9, 1.2, 1.5, 0.5, 0x6a6a68, { ry: -0.12, ao: 0, mat: 'metal' });          // absurd padlock
  b.torus(92.8, 1.5, 69.9, 0.45, 0.13, 0x6a6a68, { seg: 12, tseg: 5, ry: Math.PI / 2, mat: 'metal' });
  T.act('boat_chain', 94.6, 69.6, 'The good boat', [
    'this one is perfect. it is also chained to the quay with a padlock the size of a microwave.',
    'the key hangs on a hook behind the harbourmaster. the hook is behind glass. the glass is behind a cat.',
    '"safety," the cat explains, not opening her eyes.',
  ], { r: 4.2, speaker: 'THE GOOD BOAT' });

  // ── harbourmaster's hut ──────────────────────────────────────────────────
  const hf = frame(101.0, QY, 73.6, 0.55);
  block(b, hf, 6.4, 4.4, 5.0, 0xc6dee6, { quoins: true, plinthColor: PAL.stone, bandColor: 0xf0f6f6, sink: 0.4 });
  tileRoof(b, hf, 6.4, 0, 5.0, 0x55707e, { top: 4.4, alongX: true, pitch: 0.35, kind: 'slate', ridge: 0x3c525c });
  doorUnit(b, hf, -1.6, 2.52, { w: 1.8, h: 2.9, color: 0x1d3557, humanSide: 1, humanSignCell: T.humansLabel() });
  windowUnit(b, hf, 1.7, 2.5, 1.8, 1.9, 1.8, { trim: 0x1d3557, cushion: true, cushionColor: 0xe8514a });
  loafCat(b, hf.px(2.2, 2.86), hf.y + 1.98, hf.pz(2.2, 2.86), 1.2, PAL.fur[5], { ry: hf.ry + 1.5 });
  const hmSign = T.plaque(4.6, 0.9, [{ t: 'HARBOURMASTER', s: 0.5, c: '#eaf6ff' }, { t: 'in. always in.', s: 0.24, c: '#9fd8ff', weight: 'italic bold' }], { bg: '#1d3557', border: '#f2c14e', borderW: 0.06, dpu: 130 });
  b.box(hf.px(0, 2.55), hf.y + 3.3, hf.pz(0, 2.55), 4.8, 1.0, 0.24, 0x1d3557, { ry: hf.ry, ao: 0 });
  b.sign(hmSign, hf.px(0, 2.7), hf.y + 3.8, hf.pz(0, 2.7), 4.6, 0.9, { ry: hf.ry, glow: true });
  // lookout + bell
  b.box(hf.x, hf.y + 6.3, hf.z, 2.6, 2.2, 2.6, 0xc6dee6, { ry: hf.ry, ao: 0 });
  b.cone(hf.x, hf.y + 8.5, hf.z, 2.2, 1.6, 0x3a6ea5, { seg: 8, ry: hf.ry, ao: 0 });
  b.quad(hf.px(0, 1.33), hf.y + 7.3, hf.pz(0, 1.33), 1.8, 1.4, PAL.glass, { ry: hf.ry, mat: 'win' });
  wash(b, hf.px(0, 1.5), hf.y + 7.3, hf.pz(0, 1.5), 3.2, 2.6, hf.ry);
  b.cyl(hf.px(2.0, 0), hf.y + 4.9, hf.pz(2.0, 0), 0.1, 0.12, 1.6, 0x4a4238, { seg: 6, mat: 'metal', ao: 0 });
  b.cyl(hf.px(2.0, 0), hf.y + 5.9, hf.pz(2.0, 0), 0.2, 0.55, 0.7, PAL.gold, { seg: 10, mat: 'metal', ao: 0 });
  // tide board
  const tide = T.plaque(2.2, 1.4, [{ t: 'TIDE', s: 0.26, c: '#eaf6ff' }, { t: 'OUT', s: 0.34, c: '#ffcb4a' }, { t: 'forever', s: 0.2, c: '#9fd8ff', weight: 'italic bold' }], { bg: '#12283f', border: '#8fb8c0', borderW: 0.05, dpu: 130 });
  b.cyl(hf.px(-3.7, 1.6), hf.y, hf.pz(-3.7, 1.6), 0.12, 0.14, 2.2, PAL.wood, { seg: 6, ao: 0.4, aoBase: hf.y });
  b.box(hf.px(-3.7, 1.6), hf.y + 2.2, hf.pz(-3.7, 1.6), 2.5, 1.6, 0.16, 0x8a6238, { ry: hf.ry, ao: 0 });
  b.sign(tide, hf.px(-3.7, 1.7), hf.y + 3.0, hf.pz(-3.7, 1.7), 2.2, 1.4, { ry: hf.ry });
  T.colBox(hf.x, hf.z, 6.8, 5.4, hf.ry);
  T.act('harbourmaster', hf.px(0, 4.4), hf.pz(0, 4.4), "Harbourmaster's hut", [
    'the tide board says OUT. underneath, in smaller letters: "forever".',
    'the harbourmaster is in. the harbourmaster is always in. that is the entire job.',
    'the logbook on the counter lists arrivals in a neat column. the departures column has never been ruled.',
  ], { r: 4.0, speaker: 'HARBOURMASTER' });

  // ── BOATS ARE FOR CATS (double-sided, at the top of the quay) ────────────
  const bfc = T.plaque(6.4, 2.0, [
    { t: 'BOATS ARE FOR CATS', s: 0.5, c: '#fff4dc', outline: '#123048' },
    { t: 'thank you for understanding', s: 0.22, c: '#9fd8ff', weight: 'italic bold' },
  ], { bg: '#1d3557', bg2: 'rgba(255,255,255,.14)', border: '#f2c14e', border2: '#12283f', borderW: 0.045 });
  bigSign(T, 99.0, 63.4, 0.1, 6.4, 2.0, bfc, { y: T.ground(99, 63.4), postH: 5.2, glow: true });
  T.act('boatsign', 99.0, 61.0, 'Harbour sign', [
    'BOATS ARE FOR CATS. thank you for understanding.',
    'under it, scratched into the post: "i understand. i just want to go home."',
    'under THAT, in fresh paint: "we know. we like you."',
  ], { r: 4.2, speaker: 'HARBOUR SIGN' });
  lamppost(b, 102.4, QY, 70.0, { h: 5.0 });
  lamppost(b, 94.8, QY, 65.6, { style: 'globe', h: 4.4, ry: 1.2 });
  lamppost(b, 101.6, QY, 77.2, { style: 'globe', h: 4.7, ry: -0.4 });
  for (let i = 0; i < 3; i++) bench(b, 102.6, QY, 74.4 + i * 2.6, -Math.PI / 2, { len: 2.4 });
}

// ═════════════════════════════════════════════════════════════════════════════
// THE WATCHTOWER'S HANDRAILS (Contract O — Ben: "all ramps on or in buildings
// should have handrails to help keep players from falling off"). Measured with
// the shared helper (kit.js catRail → candy/architecture/rails.js railRun):
//   1 · THE SPIRAL STAIR inside the drum: its outer side drops to the flagstones
//       (1.5 u at the third tread, 4.5 at the landing) through the 0.65 u gap to
//       the wall. The iron balusters were there (interiors.js), a picture of a
//       rail with no collider; they get a turned timber handrail that follows
//       the helix, an iron mid rail and GATED colliders on the baluster line —
//       solid only while the visitor's feet are within 1.0 under that tread
//       (the helix only lifts him within 0.95 of it: under that he is walking
//       UNDER the flight, through the doorway it spirals over) up to a double
//       jump over it. The inner side is the newel: now solid (r 0.3), so the
//       walkable's inner edge (0.46) can never be passed. The landing's end is
//       the keeper's rope (unchanged).
//   2 · THE FLIGHT's cheeks: the upper steps stand 1.2–2.25 over the grass
//       beside them; an iron balustrade each side from the drum ledge down to
//       the second step, a gold-balled newel at the top of each.
//   3 · THE DRUM LEDGE: the lower drum's top ring (walkable at LY + 0.62) is
//       1.2–1.5 over the grass on 70% of its round; a low iron fence on its rim,
//       continuous through the short arcs that measured 1.08–1.19, from the
//       west side of the flight (110–145°: the lighthouse path arrives there
//       over a drop under 1.0 — left open) round the back to the east cheek's
//       newel, cut only where the keeper's cottage wall already stands on the
//       rim (48–60°) — the fence dies into its MASONRY (not its collider) from
//       the west, and the short stretch from its gable to the east newel
//       (60–74°) is a stone parapet with a coping. Every post wears a gold
//       ball and the fence has a mid rail (the flight's treatment); it stands
//       on the terrace the upper tier now leaves flat (r 4.6 → 5.4).
//   The gallery round the lantern is NOT a walkable (the keeper's rope ends the
//   climb at the half-landing): its iron railing stays a picture.
//   KNOWN, not mine: the keeper's desk (interiors.js watchInterior, R.solid
//   under treads 5–6) is solid at every height, so on those treads only the
//   band by the newel (r 0.52–1.24) is passable; gate it to the ground floor.
// Stair rails merge into the district kit (they stay when the shell fades as
// you walk in); the flight and the fence into the tower's shell (they fade
// with it). +0 draw calls.
// ═════════════════════════════════════════════════════════════════════════════
function watchRails(T, sb, W) {
  const ctx = T.ctx, S = TOWER_STAIR, { LX, LZ, LY, FL } = W;
  // 1 · the spiral: a point per baluster (tread centres), and the landing's end
  //     at the rope's outer post (which stands in for the last baluster)
  const RR = 2.35;
  const yAt = (i) => FL + S.y0 + S.dy * Math.min(i, S.n - 1) + S.tread;
  const pts = [];
  for (let i = 0; i < S.n; i++) { const a = S.a0 + i * S.da; pts.push([LX + Math.cos(a) * RR, LZ + Math.sin(a) * RR, yAt(i)]); }
  const aEnd = S.a0 + (S.n - 1) * S.da + S.land;
  pts.push([LX + Math.cos(aEnd) * RR, LZ + Math.sin(aEnd) * RR, yAt(S.n - 1)]);
  catRail(ctx, T.b, pts, {
    site: 'cat_tower_stair', edge: 'spiral, outer side', out: 1, style: spiralStyle(), mid: true,
    force: true, gate: true, gateLo: 1.0, below: () => FL + 0.1,
    have: [[LX + Math.cos(aEnd) * 2.3, LZ + Math.sin(aEnd) * 2.3]],
  });
  // the newel: r 0.16 + the visitor's 0.36 keeps his centre outside the
  // helix's inner edge (0.46) and no more — the band past the keeper's desk
  // (interiors.js, under treads 5–6) is narrow enough already
  ctx.colliders.push({ x: LX, z: LZ, r: 0.16 });

  // 2 + 3 · the flight's cheeks and the drum-ledge fence meet at a newel on
  // each cheek, on the second-highest step, on the ledge's rim (RB)
  if (!(W.FN > 0) || typeof W.fTop !== 'function') return;
  const { FN, FRUN, FZ1, FZ0, fTop } = W;
  const XS = 1.42, dzJ = FZ1 + FRUN * 1.05, RB = Math.hypot(XS, dzJ);
  const cz = (i) => FZ0 - (i + 0.5) * FRUN;                               // step i's centre (dz)
  const k = (fTop(FN - 2) - fTop(1)) / (cz(FN - 2) - cz(1));              // the nosing line's slope
  const yLine = (dz) => fTop(1) + (dz - cz(1)) * k;
  const stepAt = (dz) => fTop(Math.min(FN - 1, Math.max(0, Math.floor((FZ0 - dz) / FRUN))));
  const dzB = cz(1);
  const newels = [[LX + XS, LZ + dzJ], [LX - XS, LZ + dzJ]];
  const flightStyle = wroughtStyle({ tall: newels, foot: (x, z) => stepAt(z - LZ), gold: PAL.gold });
  for (const s of [1, -1]) {
    catRail(ctx, sb, [[LX + s * XS, LZ + dzJ, yLine(dzJ)], [LX + s * XS, LZ + dzB, yLine(dzB)]], {
      site: 'cat_tower_flight', edge: s > 0 ? 'east cheek' : 'west cheek', out: s, style: flightStyle,
      mid: true, force: true, claim: T,
    });
  }
  // The fence: from the west side (145°, where the path arrives over a drop
  // under 1.0) round the back to the east cheek's newel — except where a WALL
  // already stands on the ledge's rim: the keeper's cottage's south-west corner
  // reaches to r 5.0 at 35–70° (its collider, and the drum, were there first).
  // The ring is cut into runs round every solid wall box within 0.3 of it, and
  // each run is carried one step INTO the wall so it dies against it.
  const yL = LY + 0.61, aW = (145 / 180) * Math.PI, aE = Math.atan2(dzJ, XS) + Math.PI * 2;
  const walls = (ctx.colliders || []).filter((c) => c && c.box && c.solid !== false && !c.rail
    && !(typeof c.h === 'number' && c.h <= 1.6) && Math.hypot(c.x - LX, c.z - LZ) < RB + 8);
  // `face`: measure to the DRAWN wall, not its collider — a building's colBox
  // stands 0.2 proud of the masonry all round, and a run stopped on the box
  // ended in mid-air under the cottage's eave
  const wallDist = (a, face = false) => {                                // ring point at angle a → nearest wall box
    const x = LX + Math.cos(a) * RB, z = LZ + Math.sin(a) * RB;
    let best = Infinity;
    for (const c of walls) {
      const dx = x - c.x, dz = z - c.z, cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0);
      const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;             // ground.js's box frame
      const inset = face && ((c.w || 0) > 5 || (c.d || 0) > 5) ? 0.2 : 0;
      const qx = Math.abs(lx) - (c.w || 0) / 2 + inset, qz = Math.abs(lz) - (c.d || 0) / 2 + inset;
      const d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
      if (d < best) best = d;
    }
    return best;
  };
  const STEP = 0.01, runs = [];
  let cur = null;
  for (let a = aW; a <= aE + 1e-9; a += STEP) {
    const free = wallDist(a) >= 0.3;
    if (free && !cur) {                                                  // back into the wall we left
      let a0 = a; while (a0 - STEP > aW && wallDist(a0 - STEP, true) > -0.08) a0 -= STEP;
      cur = [a0, a]; runs.push(cur);
    } else if (free) cur[1] = a;
    else if (cur) {                                                      // on into the wall ahead
      let a1 = cur[1]; while (a1 + STEP < aE && wallDist(a1 + STEP, true) > -0.08) a1 += STEP;
      cur[1] = a1; cur = null;
    }
  }
  if (cur) cur[1] = aE;
  const freeEnd = [LX + Math.cos(aW) * RB, LZ + Math.sin(aW) * RB];
  for (const [a0, a1] of runs) {
    if ((a1 - a0) * RB < 0.5) continue;
    // A short stretch BETWEEN two walls (the cottage's gable and the east
    // cheek's newel, 60°–74°) is masonry, not ironwork: a stone parapet the
    // height of the rail, with a coping, butting into both. As an iron stub it
    // ran in under the cottage's eave and read as a rail ending in mid-air.
    if ((a1 - a0) * RB < 2.0) {
      const pts = arcPts(LX, LZ, RB, a0, a1, yL, 0.6), cols = [];
      let len = 0, dMax = -Infinity, dMin = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, ry = Math.atan2(ux, uz);
        sb.box(mx, yL - 0.06, mz, 0.3, 1.0, l + 0.05, 0xe3d7bf, { ry, ao: 0 });
        sb.box(mx, yL + 0.94, mz, 0.42, 0.11, l + 0.1, 0xf4ecd8, { ry, ao: 0 });
        const c = { x: mx, z: mz, w: 0.3, d: l + 0.06, rot: Math.atan2(-ux, uz), box: true, h: 1e4, rail: 'cat_tower_base', deckY: yL, railTop: yL + 3 };
        ctx.colliders.push(c); cols.push(c);
        T.claim(mx, mz, 0.7, l + 0.2, ry);
        const dr = yL - T.ground(mx + (mx - LX) / RB * 0.5, mz + (mz - LZ) / RB * 0.5);
        len += l; dMax = Math.max(dMax, dr); dMin = Math.min(dMin, dr);
      }
      RAILS.push({ site: 'cat_tower_base', edge: `drum ledge parapet ${Math.round(a0 * 180 / Math.PI) % 360}°–${Math.round(a1 * 180 / Math.PI) % 360}°`,
        len: +len.toFixed(2), spans: cols.length, built: cols.length, dropMax: dMax, dropMin: dMin, cols, gated: false, note: 'stone parapet', drops: [] });
      continue;
    }
    const pts = arcPts(LX, LZ, RB, a0, a1, yL);
    // the flight's treatment carried round: a gold ball on every post and a mid rail
    catRail(ctx, sb, pts, {
      site: 'cat_tower_base', edge: `drum ledge rim ${Math.round(a0 * 180 / Math.PI) % 360}°–${Math.round(a1 * 180 / Math.PI) % 360}°`,
      out: 1, force: true, claim: T, mid: true,
      style: wroughtStyle({ tall: [freeEnd], gold: PAL.gold, goldAll: true }),
      have: [newels[0]],
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// THE WATCHTOWER + NOT-AN-EXIT BEACH
// ═════════════════════════════════════════════════════════════════════════════
export function buildWatchtower(T) {
  const b = T.b, A = T.A;
  const LX = 214, LZ = 31, LY = T.ground(LX, LZ);
  const TH = 19.0;

  // ── the tower — ENTERABLE at the bottom (see architecture/interiors.js) ───
  const sb = T.shell('watch');
  const FL = LY + 1.6;                      // the ground-floor floor level
  const bands = 7, bandH = TH / bands, RIN = 3.05;
  sb.cyl(LX, LY - 1.2, LZ, 5.4, 5.9, 1.8, 0xcdbd9e, { seg: 18, ao: 0 });
  // The upper tier stands STRAIGHT up from the lower drum's top, so that top is
  // a flat TERRACE (r 4.6 → 5.4) — the ledge the plinth walkable says it is
  // (LY + 0.62 out to 5.35), with its railing standing on its rim. It was a
  // cone (r 5.2 at its foot), which left a 0.2 lip: the visitor on the ledge
  // waded in its slope and the rail read as planted on the drum's face.
  sb.cyl(LX, LY + 0.6, LZ, 4.6, 4.62, 1.0, 0xe3d7bf, { seg: 18, ao: 0 });
  // stone copings (a lip on each tier's top edge, same 18-gon phase as the
  // drums) and two bed joints down the battered face: a plinth, not a pipe
  sb.cyl(LX, LY + 0.52, LZ, 5.47, 5.47, 0.1, 0xf0e6d0, { seg: 18, ao: 0 });
  sb.cyl(LX, FL - 0.08, LZ, 4.7, 4.7, 0.1, 0xf4ecd8, { seg: 18, ao: 0 });
  for (const [yj, rj] of [[LY - 0.2, 5.622], [LY + 0.2, 5.511]]) sb.cyl(LX, yj, LZ, rj + 0.012, rj + 0.014, 0.05, 0xa89878, { seg: 18, open: true, ao: 0 });
  sb.cyl(LX, LY + 1.1, LZ, 4.625, 4.625, 0.04, 0xc9bb9e, { seg: 18, open: true, ao: 0 });
  // the first two bands are a ring wall with a doorway in it
  const DOOR_A = Math.PI / 2;               // the door faces +Z, toward the sign
  let wallSegs = [];
  for (let i = 0; i < bands; i++) {
    const y0 = LY + 1.6 + i * bandH, r0 = 3.5 - i * 0.19, r1 = 3.5 - (i + 1) * 0.19;
    if (i < 2) {
      const segs = ringWall(sb, LX, y0, LZ, (r0 + r1) / 2 - 0.02, bandH + 0.02, i % 2 ? 0xf4f0e6 : 0xd8402e, {
        seg: 18, th: (r0 - RIN) + 0.1, gapAng: i === 0 ? DOOR_A : null, gapHalf: 0.3, lintel: i === 0 ? 2.55 : 0, ao: i === 0 ? 0.5 : 0,
        gapWiden: i === 0 ? 0.5 : 0,
      });
      // ONLY the bottom band becomes solid. Band 1 sits above the door head, so
      // colliding it would brick the doorway up again (a collider has a top but
      // no bottom) — which is exactly what used to happen: the tower looked open
      // and was not enterable.
      if (i === 0) wallSegs = wallSegs.concat(segs);
    } else {
      sb.cyl(LX, y0, LZ, r1, r0, bandH + 0.02, i % 2 ? 0xf4f0e6 : 0xd8402e, { seg: 18, ao: 0 });
    }
  }
  // THE FLIGHT up onto the plinth and in through the door: six even steps from
  // the grass to the door's own threshold, each block standing on the ground
  // and the walkable reading the same tops. (Three blocks used to climb to
  // LY + 0.6 / 1.6 / 2.6 while the walkable said 0.6 / 1.1 / 1.6: the top one
  // stood a metre proud of the threshold, a slab the visitor waded through on
  // his way to the door, and between it and the door the drum's lower ledge cut
  // a metre-deep trench across the approach.) The top step runs 0.1 into the
  // drum, a centimetre under its top, so the two never fight for one plane.
  // The flight's ground is CLAIMED (the tower's own claim stops at the drum, so
  // nature planted an agave on the third step), and its foot stops short of the
  // big sign's east post.
  const FN = 6, FRUN = 0.58, FZ1 = 4.5, FZ0 = FZ1 + FN * FRUN;
  T.claim(LX, LZ + (FZ1 + FZ0) / 2 + 0.3, 3.6, FZ0 - FZ1 + 0.6, 0);
  const fFoot = Math.min(T.ground(LX - 1.5, LZ + FZ0), T.ground(LX + 1.5, LZ + FZ0), T.ground(LX, LZ + FZ0 + 0.3));
  const fRise = (FL - fFoot) / FN;
  const fTop = (i) => fFoot + (i + 1) * fRise - (i === FN - 1 ? 0.01 : 0);
  for (let i = 0; i < FN; i++) {
    const z1 = FZ0 - i * FRUN, z0 = z1 - FRUN, base = Math.min(fFoot, T.ground(LX, LZ + z1)) - 0.6;
    sb.box(LX, base, LZ + (z0 + z1) / 2, 3.0, fTop(i) - base, FRUN, 0xcdbd9e, { ao: 0, shade: i % 2 ? 0.96 : 1 });
  }
  T.ctx.walkables.push({
    id: 'cat_tower_plinth',
    test(x, z) {
      const dx = x - LX, dz = z - LZ, d = Math.hypot(dx, dz);
      if (d < 4.55) return FL + 0.02;
      // the flight wins over the drum's ledge where they overlap
      if (Math.abs(dx) < 1.5 && dz > FZ1 - 0.1 && dz < FZ0) return fTop(Math.min(FN - 1, Math.max(0, Math.floor((FZ0 - dz) / FRUN))));
      if (d < 5.35) return LY + 0.62;
      return null;
    },
  });
  // ── the spiral stair, as a walkable helix ────────────────────────────────
  // Same numbers the treads are built from (interiors.js TOWER_STAIR). The
  // height is only offered when it is within a STEP of where the visitor's feet
  // actually are: the flight spirals right past the doorway at two metres, and
  // a plain height test would pick him up off the threshold and stand him on it.
  {
    const S = TOWER_STAIR, TWO_PI = Math.PI * 2;
    const iMax = (S.n - 1) + S.land / S.da;
    T.ctx.walkables.push({
      id: 'cat_tower_stair',
      test(x, z) {
        const dx = x - LX, dz = z - LZ, rr = Math.hypot(dx, dz);
        if (rr < S.rIn || rr > S.rOut) return null;
        let a = Math.atan2(dz, dx);
        while (a < S.a0) a += TWO_PI;
        while (a >= S.a0 + TWO_PI) a -= TWO_PI;
        const i = (a - S.a0) / S.da;
        if (i > iMax) return null;
        const y = FL + S.y0 + S.dy * Math.min(i, S.n - 1) + S.tread;
        const py = T.ctx.systems.player?.position.y;
        if (py != null && y > py + 0.95) return null;      // duck under it instead
        return y;
      },
    });
    // The keeper's rope at the top of the flight is SOLID: without it you walk
    // off the end of the landing and fall four and a half metres onto the
    // flagstones, which is a poor reward for climbing the stairs.
    // It is only solid while you are actually UP there: a collider has a top but
    // no bottom, so left armed it would also be an invisible wall across the
    // ground floor, under the stairs.
    const aEnd = S.a0 + (S.n - 1) * S.da + S.land;
    const ropeY = FL + S.y0 + (S.n - 1) * S.dy + S.tread;
    const ropeBlock = T.wall(LX + Math.cos(aEnd) * 1.45, LZ + Math.sin(aEnd) * 1.45, 2.3, 0.36, -aEnd, ropeY + 1.4);
    ropeBlock.solid = false;
    T.anim((t, dt, dl, c) => {
      const py = c?.systems?.player?.position.y;
      ropeBlock.solid = py != null && py > ropeY - 1.3;
    });
  }
  const topY = LY + 1.6 + TH;
  // gallery
  sb.cyl(LX, topY, LZ, 3.9, 3.3, 0.4, 0xe3d7bf, { seg: 18, ao: 0 });
  sb.cyl(LX, topY + 0.4, LZ, 3.9, 3.9, 0.16, 0xc2b295, { seg: 18, ao: 0 });
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; sb.box(LX + Math.cos(a) * 3.7, topY + 0.5, LZ + Math.sin(a) * 3.7, 0.12, 1.0, 0.12, 0x3a4a4c, { ry: -a, ao: 0, mat: 'metal' }); }
  sb.torus(LX, topY + 1.45, LZ, 3.7, 0.1, 0x3a4a4c, { rx: -Math.PI / 2, seg: 20, tseg: 5, mat: 'metal' });
  loafCat(sb, LX + 2.7, topY + 0.56, LZ + 2.3, 1.4, PAL.fur[2], { ry: 0.9 });
  // lantern room: an open cage so the eye is visible from every side
  sb.cyl(LX, topY + 0.56, LZ, 2.6, 2.6, 0.3, 0x2f3a3c, { seg: 12, ao: 0 });
  sb.cyl(LX, topY + 3.86, LZ, 2.6, 2.6, 0.3, 0x2f3a3c, { seg: 12, ao: 0 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.39; sb.box(LX + Math.cos(a) * 2.42, topY + 0.8, LZ + Math.sin(a) * 2.42, 0.2, 3.1, 0.2, 0x2f3a3c, { ry: -a, ao: 0, mat: 'metal' }); }
  sb.cone(LX, topY + 4.16, LZ, 3.1, 2.2, 0xd8402e, { seg: 12, ao: 0 });
  sb.sph(LX, topY + 6.5, LZ, 0.42, PAL.gold, { seg: 8, rings: 6 });
  catEars(sb, LX, topY + 5.5, LZ, 1.5, 2.0, 0xd8402e, { inner: PAL.gold, seg: 8, ry: 0.6 });

  // ── THE CAT EYE ───────────────────────────────────────────────────────────
  // The lens is on the 'lamp' material, not 'glow': a lighthouse whose lamp only
  // lights at full dark reads as a dead lighthouse all evening. This one is lit
  // from dusk, and the fresnel rings around it catch the light so the LENS is
  // visible, not just a glow.
  const eye = T.part((p) => {
    p.sph(0, 0, 0, 1.95, 0xcf8f28, { seg: 18, rings: 12, sz: 0.55, mat: 'lamp' });
    p.sph(0, 0, 0.5, 1.7, 0xdeb455, { seg: 16, rings: 10, sz: 0.3, mat: 'lamp' });
    p.box(0, -1.55, 0.85, 0.5, 3.1, 0.4, 0x120c08, { ao: 0 });                                  // slit pupil
    p.sph(-0.55, 0.5, 0.9, 0.42, 0xd8cba4, { seg: 9, rings: 6, sz: 0.4, mat: 'lamp' });          // glint
    p.torus(0, 0, 0.2, 2.0, 0.2, 0x2f3a3c, { seg: 20, tseg: 6, mat: 'metal' });
    // fresnel rings: horizontal prisms banded round the lens
    for (let i = -2; i <= 2; i++) p.torus(0, i * 0.62, 0.1, Math.sqrt(Math.max(0.12, 3.8 - (i * 0.62) * (i * 0.62))) * 0.99, 0.11, 0xe0b25c, { seg: 18, tseg: 5, mat: 'lamp', sz: 0.6 });
  }, 'lens');
  eye.position.set(LX, topY + 2.3, LZ);
  // ── the sweeping searchlight ──────────────────────────────────────────────
  // It used to be an 80-unit cone at flat 0.3 opacity, which crossed the whole
  // island and painted a hard-edged BRIGHT WEDGE over Purrliament Square at
  // night. Now it is 34 long, tilted down at the ground near the tower, and its
  // alpha is baked per-vertex so it fades to nothing along its length and
  // around its rim — no hard edge anywhere.
  const BL = 34, BR = 5.0;
  const beamGeo = new THREE.ConeGeometry(BR, BL, 20, 6, true);
  beamGeo.translate(0, -BL / 2, 0);
  beamGeo.rotateX(Math.PI / 2);
  {
    const p = beamGeo.attributes.position, n = p.count;
    const col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const z = -p.getZ(i);                                  // 0 at the lens, BL at the tip
      const t = Math.min(1, Math.max(0, z / BL));
      const a = Math.pow(1 - t, 1.8) * (0.25 + 0.75 * Math.pow(1 - t, 0.4));
      col[i * 4] = 1; col[i * 4 + 1] = 0.86; col[i * 4 + 2] = 0.58; col[i * 4 + 3] = a;
    }
    beamGeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  }
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffd88a, vertexColors: true, transparent: true, opacity: 0.0,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    forceSinglePass: true,   // additive: one pass is the same picture (Contract J)
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(LX, topY + 2.3, LZ);
  beam.rotation.order = 'YXZ';
  beam.rotation.x = -0.30;                  // aimed down at the island, not out to sea
  beam.frustumCulled = false;
  beam.renderOrder = 7;
  T.group.add(beam);
  // the searchlight is a lamp like every other lamp in town: it comes on with
  // sky.lampMix, not with sunset, so it is not sweeping the island at dawn
  T.anim((t, dt, dl, c, lamp) => {
    const ev = lamp != null ? lamp : (1 - dl);
    const a = t * 0.42;
    beam.rotation.y = a;
    eye.rotation.y = a;
    beamMat.opacity = ev * 0.16;
    beam.visible = beamMat.opacity > 0.004;
    // the bright ellipse the beam leaves on the ground, chasing the cone
    const r = Math.cos(0.30) * BL * 0.62;
    spotPool.position.set(LX + Math.sin(a) * r, T.ground(LX + Math.sin(a) * r, LZ + Math.cos(a) * r) + 0.3, LZ + Math.cos(a) * r);
    spotPool.visible = beam.visible;
    spotMat.opacity = ev * 0.5;
  });
  const spotMat = new THREE.MeshBasicMaterial({ map: T.blob, color: 0xffcf82, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true });
  const spotPool = new THREE.Mesh(new THREE.PlaneGeometry(15, 22).rotateX(-Math.PI / 2), spotMat);
  spotPool.frustumCulled = false; spotPool.renderOrder = 7;
  T.group.add(spotPool);
  // No PointLight here: the six on Main Street and in the Square do more work.
  // The lens carries an additive halo and throws a pool at the tower's foot.
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; halo(b, LX + Math.cos(a) * 1.6, topY + 2.3, LZ + Math.sin(a) * 1.6, 2.6); }
  pool(b, LX, LY + 0.75, LZ, 7.5);

  // ── keeper's cottage ──────────────────────────────────────────────────────
  const kf = frame(LX + 7.6, T.ground(LX + 7.6, LZ + 5.4), LZ + 5.4, 0.5);
  block(b, kf, 8.0, 4.6, 6.4, 0xf2e9d4, { quoins: true, plinthColor: PAL.stone });
  tileRoof(b, kf, 8.0, 0, 6.4, 0xd8402e, { top: 4.6, alongX: true, pitch: 0.35, ridge: 0x9e2c1e });
  doorUnit(b, kf, -2.0, 3.22, { w: 2.0, h: 3.1, color: 0x2f4a5a, humanSide: 1, humanSignCell: T.humansLabel() });
  windowUnit(b, kf, 2.0, 3.2, 1.8, 2.2, 2.0, { trim: 0x2f4a5a, cushion: true, flowers: true });
  b.box(kf.px(2.6, -1.0), kf.y + 4.6, kf.pz(2.6, -1.0), 1.0, 2.2, 1.0, 0xf2e9d4, { ry: kf.ry, ao: 0 });
  b.box(kf.px(2.6, -1.0), kf.y + 6.7, kf.pz(2.6, -1.0), 1.3, 0.3, 1.3, PAL.stoneDark, { ry: kf.ry, ao: 0 });
  T.colBox(kf.x, kf.z, 8.4, 6.8, kf.ry, kf.y + 4.6);
  // the tower: the ring wall is solid, the doorway is not, and the footprint is
  // still CLAIMED so nobody else plants anything in it
  T.solidify(wallSegs, FL + bandH * 2);
  T.claimRing(LX, LZ, 8.5, 8.5, 0);
  // the doorway's head: a stone lintel bedded into the curve of the ring wall
  // (its back meets the flanking segments at x ±1.35) and a keystone. Its
  // underside is at the head of the gap (FL + 2.55); the leaf, 2.4 tall,
  // swings out beneath it. No jambs: the leaf hangs inside the wall's depth and
  // its open edge passes where a jamb would stand.
  sb.box(LX, FL + 2.56, LZ + 3.62, 2.7, 0.31, 0.5, 0xe8dcc4, { ao: 0 });
  sb.box(LX, FL + 2.87, LZ + 3.64, 2.84, 0.07, 0.56, 0xf4ecd8, { ao: 0 });
  sb.box(LX, FL + 2.56, LZ + 3.68, 0.42, 0.6, 0.58, 0xf4ecd8, { ao: 0 });
  // floorY sits on the flagstone disc watchInterior lays (FL + 0.08), not on the
  // bare plinth: the flattened landmark core reaches FL + 0.02 here
  const watchRoom = T.room({ id: 'watch', x: LX, z: LZ, w: RIN * 2, d: RIN * 2, rot: 0, y: FL, floorY: FL + 0.1, h: bandH * 2, label: 'The Watchtower' });
  T.door({
    id: 'watch', room: watchRoom, y: FL, ry: 0, w: 1.9, h: 2.5, color: 0x2f4a5a, field: 0x3b5c6e, trim: 0x24394a, flap: 0xf2e9d4, style: 'panel',
    x: LX + Math.cos(DOOR_A) * 3.3, z: LZ + Math.sin(DOOR_A) * 3.3, r: 3.4,
    say: 'the keeper is up the stairs. she has been up the stairs for eleven years.', speaker: 'THE WATCHTOWER',
  });
  watchInterior(T, frame(LX, FL, LZ, 0), { rIn: RIN });

  const watchCell = T.plaque(5.4, 1.8, [
    { t: 'THE WATCHTOWER', s: 0.46, c: '#fff4dc', outline: '#5a1a10' },
    { t: 'we are just looking out for you', s: 0.22, c: '#ffd0a8', weight: 'italic bold' },
  ], { bg: '#b8341e', border: '#f2c14e', border2: '#7a1c0e', borderW: 0.05 });
  bigSign(T, LX - 1.0, LZ + 9.0, 0.2, 5.4, 1.8, watchCell, { postH: 4.8, glow: true });
  T.act('watchtower', LX - 1.0, LZ + 11.4, 'The Watchtower', [
    'the lens is a cat’s eye, two metres across, and the pupil is a vertical slit.',
    'it does not point out to sea. it sweeps the island. "we are just looking out for you."',
    'at night the beam finds you, holds for a moment, and moves on. it feels almost affectionate.',
  ], { r: 4.6, speaker: 'THE WATCHTOWER' });

  // ── HANDRAILS (Contract O): the spiral, the flight's cheeks, the drum ledge.
  //    Built last, so the fence can stop where the keeper's cottage wall
  //    already guards the ledge (see watchRails) ──────────────────────────────
  watchRails(T, sb, {
    LX, LZ, LY, FL,
    FN: typeof FN !== 'undefined' ? FN : 0, FRUN: typeof FRUN !== 'undefined' ? FRUN : 0,
    FZ1: typeof FZ1 !== 'undefined' ? FZ1 : 0, FZ0: typeof FZ0 !== 'undefined' ? FZ0 : 0,
    fTop: typeof fTop !== 'undefined' ? fTop : null,
  });
  // ── THE GROUNDS: the ring the fence guards is the keeper's garden (lawn,
  //    flagstone apron, crystal-grass, candy mushrooms, stones, the sea bench,
  //    a telescope, a cat on the plinth) — see outskirts_yard.js ─────────────
  buildWatchYard(T, { LX, LZ, LY, FL, cottage: { x: kf.x, z: kf.z, w: 8.0, d: 6.4, ry: kf.ry } });

  // ═══ NOT-AN-EXIT BEACH: the sign forest ════════════════════════════════════
  const BX = 230, BZ = -6;
  const msgs = [
    ['NO SWIMMING', '#c2261a', 0.0], ['REALLY', '#c2261a', 0.55], ['WE MEAN IT', '#a8201a', -0.5],
    ['THE CURRENT IS BAD', '#8a2f22', 0.3], ['THERE ARE SHARKS', '#8a2f22', -0.25],
    ['WE HIRED THE SHARKS', '#7a2f22', 0.8], ['WE HAVE A RAFT TOO', '#6a3a22', -0.7],
    ['YOUR RAFT IS OUR RAFT NOW', '#6a3a22', 0.15], ['WHERE WOULD YOU EVEN GO', '#5a4030', 0.62],
    ['STOP', '#c2261a', -0.9], ['SERIOUSLY', '#a8201a', 0.42], ['SWIM AND WE WILL BE SAD', '#4a5a3a', -0.15],
    ['AND SO WILL YOU', '#4a5a3a', 0.9], ['THE SEA IS ALSO CATS', '#2f4a5a', -0.42],
  ];
  msgs.forEach((m, i) => {
    const a = -1.25 + (i / (msgs.length - 1)) * 2.5;
    const rad = 6.5 + (i % 4) * 3.4 + (i % 3) * 1.2;
    const x = BX + Math.sin(a) * rad * 0.9 - (i % 2) * 1.6;
    const z = BZ + Math.cos(a) * rad - 4;
    const y = T.ground(x, z);
    const ph = 3.4 - (i % 5) * 0.32;
    const ry = -a * 0.7 + m[2] * 0.45 + Math.PI;
    const w = Math.min(4.0, 1.2 + m[0].length * 0.17), h = w * 0.3;
    const cell = T.plaque(w, h, [{ t: m[0], s: 0.66, c: '#fff4dc', outline: 'rgba(0,0,0,.45)' }], { bg: m[1], border: '#f6ecd8', borderW: 0.07, grime: 0.1 + (i % 4) * 0.06, dpu: 128 });
    b.cyl(x, y, z, 0.13, 0.16, ph, [PAL.wood, PAL.woodDark, PAL.woodLight][i % 3], { seg: 6, rz: m[2] * 0.1, ao: 0.5, aoBase: y });
    b.box(x, y + ph - h - 0.15, z, w + 0.2, h + 0.2, 0.14, 0x6a5238, { ry, rz: m[2] * 0.1, ao: 0 });
    b.sign(cell, x + Math.sin(ry) * 0.09, y + ph - h / 2 - 0.15, z + Math.cos(ry) * 0.09, w, h, { ry, rz: m[2] * 0.1 });
    b.sign(cell, x - Math.sin(ry) * 0.09, y + ph - h / 2 - 0.15, z - Math.cos(ry) * 0.09, w, h, { ry: ry + Math.PI, rz: -m[2] * 0.1 });
  });
  // the raft they mentioned, deflated, with a cat asleep on it
  const rx = BX - 5.5, rz = BZ + 4.5, ry0 = T.ground(rx, rz);
  b.torus(rx, ry0 + 0.3, rz, 1.7, 0.42, 0xe8a02c, { rx: -Math.PI / 2, seg: 16, tseg: 6, sy: 0.5 });
  b.cyl(rx, ry0 + 0.12, rz, 1.4, 1.4, 0.16, 0xd8902a, { seg: 14, ao: 0 });
  b.box(rx + 1.9, ry0 + 0.1, rz + 0.6, 0.14, 0.1, 2.4, PAL.wood, { ry: 0.5, ao: 0 });
  const raftSign = T.plaque(2.4, 0.7, [{ t: 'OUR RAFT', s: 0.44, c: '#5a2008' }, { t: '(and yours)', s: 0.24, c: '#8a3a10', weight: 'italic bold' }], { bg: '#f2c14e', border: '#b8431e', borderW: 0.07, dpu: 140 });
  b.cyl(rx + 2.4, ry0, rz - 1.4, 0.1, 0.12, 1.6, PAL.wood, { seg: 6, ao: 0 });
  b.sign(raftSign, rx + 2.4, ry0 + 1.8, rz - 1.32, 2.4, 0.7, {});
  // lifeguard chair, facing inland
  const gx = BX + 4.0, gz = BZ - 9.5, gy = T.ground(gx, gz);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.cyl(gx + sx * 1.0, gy, gz + sz * 1.0, 0.14, 0.17, 4.0, PAL.wood, { seg: 6, rz: -sx * 0.09, rx: sz * 0.09, ao: 0.5, aoBase: gy });
  b.box(gx, gy + 3.9, gz, 2.6, 0.22, 2.4, PAL.woodLight, { ao: 0 });
  b.box(gx, gy + 4.1, gz, 2.6, 1.5, 0.2, PAL.woodLight, { ao: 0 });
  b.box(gx, gy + 4.1, gz - 1.1, 2.6, 1.1, 0.2, PAL.woodLight, { ao: 0 });
  b.box(gx, gy + 5.6, gz, 3.2, 0.2, 2.8, 0xe8514a, { ao: 0 });
  for (const s of [-1, 1]) b.cyl(gx + s * 1.3, gy + 4.1, gz + 1.1, 0.08, 0.1, 1.5, PAL.wood, { seg: 5, ao: 0 });
  sittingCat(b, gx, gy + 4.3, gz - 0.3, 2.0, PAL.fur[3], { ry: 0.4, seg: 9, rings: 6 });
  T.col(gx, gz, 1.6);
  T.act('beach', BX - 2.0, BZ - 1.0, 'Not-An-Exit Beach', [
    'fourteen signs. NO SWIMMING. REALLY. WE MEAN IT. THE CURRENT IS BAD. THERE ARE SHARKS.',
    'then: WE HIRED THE SHARKS. then: WE HAVE A RAFT TOO. then: YOUR RAFT IS OUR RAFT NOW.',
    'the last one, low down, hand-painted and newer than the rest: SWIM AND WE WILL BE SAD. AND SO WILL YOU.',
  ], { r: 7.0, speaker: 'NOT-AN-EXIT BEACH' });
}

// ═════════════════════════════════════════════════════════════════════════════
// YARN HILL
// ═════════════════════════════════════════════════════════════════════════════
export function buildYarnHill(T) {
  const b = T.b;
  const YX = 188, YZ = -63, YY = T.ground(YX, YZ);

  // plinth
  b.cyl(YX, YY - 0.6, YZ, 7.4, 8.0, 1.4, 0xc2b295, { seg: 18, ao: 0 });
  b.cyl(YX, YY + 0.8, YZ, 6.4, 7.2, 1.1, 0xd8cbb0, { seg: 18, ao: 0 });
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; b.box(YX + Math.cos(a) * 7.6, YY - 0.6, YZ + Math.sin(a) * 7.6, 1.2, 0.5, 1.0, i % 2 ? 0xcdbd9e : 0xb5a68a, { ry: -a, ao: 0 }); }

  // ── the colossal ball of yarn ─────────────────────────────────────────────
  // The strand bands used to be four near-identical dark pinks over a dark core,
  // which read as one unlit black torus at distance. Now: a BRIGHT warm core
  // with high-contrast wound strands, so the ball reads as wool from anywhere.
  const BY = YY + 1.9 + 6.6, R = 6.8;
  b.sph(YX, BY, YZ, R, 0xf07098, { seg: 22, rings: 14, flat: true });
  const cols = [0xff9dbe, 0xe8558c, 0xffc2d8, 0xd23c72, 0xff86ac];
  for (let i = 0; i < 22; i++) {
    const a1 = i * 1.13, a2 = i * 0.71;
    b.torus(YX, BY, YZ, R * 1.012, 0.42, cols[i % cols.length], { seg: 20, tseg: 5, rx: a1, ry: a2, rz: i * 0.37 });
  }
  // lantern posts round the plinth, so the landmark is never a silhouette-void
  const yarnLanterns = [[0.30, 8.9], [1.28, 9.8], [2.24, 8.4], [3.30, 9.5], [4.28, 8.7], [5.42, 9.9]];
  for (let i = 0; i < 6; i++) {
    const [a, rad2] = yarnLanterns[i];
    const lx = YX + Math.cos(a) * rad2, lz = YZ + Math.sin(a) * rad2;
    const ly = T.ground(lx, lz);
    b.cyl(lx, ly, lz, 0.16, 0.22, 3.2, 0x3a4a4c, { seg: 8, mat: 'metal', ao: 0.5, aoBase: ly });
    b.cyl(lx, ly + 3.2, lz, 0.42, 0.3, 0.8, PAL.amber, { seg: 8, mat: 'glow', ao: 0 });
    b.cone(lx, ly + 4.0, lz, 0.52, 0.42, 0x3a4a4c, { seg: 8, ao: 0 });
    halo(b, lx, ly + 3.6, lz, 1.5);
    pool(b, lx, ly + 0.16, lz, 3.4);
    T.col(lx, lz, 0.45);
  }
  // loose strand trailing down the hill to the north-east. It used to run 34u
  // and snake straight through the rocks at the gym; now it stops short.
  const strand = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = -0.5 + t * 2.6;
    const rad = R * 0.97 + t * 2;
    let x, y, z;
    if (t < 0.34) { x = YX + Math.sin(a * 3) * rad * 0.9; y = BY - Math.cos(t * 5.2) * R * 0.5 + 1.2; z = YZ + Math.cos(a * 3) * rad * 0.9; }
    else {
      const u = (t - 0.34) / 0.66;
      x = YX + 5 + u * 10 + Math.sin(u * 6) * 1.8;
      z = YZ + 7 + u * 9 + Math.cos(u * 4.5) * 2.0;
      y = T.ground(x, z) + 0.36 + (1 - u) * 3.4;
    }
    strand.push([x, y, z]);
  }
  b.tube(strand, 0.4, 0xff86ac, { rseg: 6, seg: 52 });
  const tip = strand[strand.length - 1];
  for (let i = 0; i < 6; i++) b.cyl(tip[0], tip[1], tip[2], 0.05, 0.1, 1.5 + (i % 3) * 0.5, 0xe85c92, { seg: 4, rz: -0.9 + i * 0.3, ry: i * 1.1, ao: 0 });
  // a few balls that have rolled off
  for (let i = 0; i < 4; i++) {
    const x = YX + 9 + i * 2.4 + (i % 2) * 1.6, z = YZ + 8 + i * 2.2;
    const y = T.ground(x, z) + 1.1;
    b.sph(x, y, z, 1.1, cols[i % cols.length], { seg: 12, rings: 8 });
    for (let k = 0; k < 4; k++) b.torus(x, y, z, 1.112, 0.1, cols[(i + k + 2) % cols.length], { seg: 12, tseg: 3, rx: k * 0.9, ry: k * 0.6 });
    T.col(x, z, 1.1);
  }

  const yarnCell = T.plaque(5.0, 1.9, [
    { t: 'THE GREAT BALL', s: 0.44, c: '#fff0f6', outline: '#5a1030' },
    { t: 'DO NOT UNRAVEL', s: 0.26, c: '#ffc0da' },
    { t: 'a monument to restraint', s: 0.18, c: '#f0a8c8', weight: 'italic bold' },
  ], { bg: '#b02a5c', border: '#f2c14e', border2: '#7a1a3e', borderW: 0.045 });
  bigSign(T, YX - 3.0, YZ + 10.5, 0.35, 5.0, 1.9, yarnCell, { postH: 4.8 });
  for (let i = 0; i < 3; i++) { const a = 0.5 + i * 1.1; bench(b, YX + Math.cos(a) * 11.5, T.ground(YX + Math.cos(a) * 11.5, YZ + Math.sin(a) * 11.5), YZ + Math.sin(a) * 11.5, -a + Math.PI / 2, { len: 2.8 }); }
  // a viewing telescope pointed hopefully out to sea
  const tx = YX - 10.5, tz = YZ + 6.0, ty = T.ground(tx, tz);
  b.cyl(tx, ty, tz, 0.22, 0.3, 1.7, 0x3a4a4c, { seg: 8, mat: 'metal', ao: 0.4, aoBase: ty });
  b.cyl(tx, ty + 1.9, tz, 0.3, 0.42, 1.9, 0x2f3a3c, { seg: 10, center: true, rz: 0.95, ry: -1.9, mat: 'metal', ao: 0 });
  b.cyl(tx - 0.8, ty + 2.5, tz - 0.5, 0.2, 0.2, 0.3, 0x546f78, { seg: 8, mat: 'glow', ao: 0 });
  const scope = T.plaque(1.6, 0.5, [{ t: 'VIEWING SCOPE', s: 0.3, c: '#eaf6ff' }, { t: 'nothing out there', s: 0.22, c: '#9fd8ff', weight: 'italic bold' }], { bg: '#2f4a5a', border: '#8fb8c0', borderW: 0.07, dpu: 160 });
  b.sign(scope, tx, ty + 1.0, tz + 0.34, 1.6, 0.5, {});
  T.col(YX, YZ, 8.0); T.col(tx, tz, 0.8);
  T.act('yarn', YX - 3.0, YZ + 12.8, 'The Great Ball', [
    'THE GREAT BALL — DO NOT UNRAVEL. it is fourteen metres across and faintly warm.',
    'one strand has come loose and runs all the way down the hill. nobody has pulled it.',
    'the small print: "a monument to restraint". a cat sits beside it, paw twitching, holding on.',
  ], { r: 5.4, speaker: 'THE GREAT BALL' });
}

// ═════════════════════════════════════════════════════════════════════════════
// CATNIP COMMONS — bandstand + statue only (nature owns the park)
// ═════════════════════════════════════════════════════════════════════════════
export function buildCommons(T) {
  const b = T.b;
  const BX = 145, BZ = -53, BY = T.ground(BX, BZ);

  // ── bandstand ─────────────────────────────────────────────────────────────
  b.cyl(BX, BY - 0.9, BZ, 6.6, 7.0, 1.3, 0xc2b295, { seg: 16, ao: 0 });
  for (let i = 0; i < 3; i++) b.cyl(BX, BY - 0.55 + i * 0.28, BZ, 6.3 - i * 0.45, 6.6 - i * 0.45, 0.3, 0xd8cbb0, { seg: 16, ao: 0 });
  b.cyl(BX, BY + 0.4, BZ, 5.6, 5.6, 0.3, 0xb98b58, { seg: 16, ao: 0 });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; b.box(BX + Math.cos(a) * 5.55, BY + 0.35, BZ + Math.sin(a) * 5.55, 0.7, 0.22, 0.6, [0xc2935f, 0xa87a4c][i % 2], { ry: -a, ao: 0 }); }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.39;
    const cx = BX + Math.cos(a) * 5.0, cz = BZ + Math.sin(a) * 5.0;
    column(b, cx, BY + 0.7, cz, 0.28, 4.6, 0xf6ead0, { seg: 9, flutes: false });
    // fretwork brackets
    for (const s of [-1, 1]) b.box(cx + Math.cos(a + s * 0.35) * 0.9, BY + 4.5, cz + Math.sin(a + s * 0.35) * 0.9, 1.5, 0.5, 0.12, 0xf6ead0, { ry: -a + Math.PI / 2, ao: 0 });
    if (i % 2 === 0) for (let k = 0; k < 4; k++) b.box(BX + Math.cos(a + 0.2) * 5.0, BY + 1.0 + k * 0.28, BZ + Math.sin(a + 0.2) * 5.0, 2.6, 0.12, 0.1, 0x2a8f8a, { ry: -a + Math.PI / 2, ao: 0 });
  }
  b.cyl(BX, BY + 5.3, BZ, 6.3, 6.3, 0.34, 0xf6ead0, { seg: 16, ao: 0 });
  b.cone(BX, BY + 5.64, BZ, 6.1, 4.6, 0x2a8f8a, { seg: 16, ao: 0 });
  for (let i = 0; i < 16; i++) {                                  // hip ribs down the roof
    const a = i / 16 * Math.PI * 2;
    b.cyl(BX + Math.cos(a) * 3.05, BY + 7.9, BZ + Math.sin(a) * 3.05, 0.1, 0.12, 5.4, 0x1f6f6b,
      { seg: 4, center: true, rz: Math.cos(a) * 0.59, rx: -Math.sin(a) * 0.59, ao: 0 });
  }
  b.cyl(BX, BY + 10.2, BZ, 0.5, 0.9, 0.7, 0xf6ead0, { seg: 10, ao: 0 });
  b.sph(BX, BY + 12.1, BZ, 0.5, PAL.gold, { seg: 9, rings: 6 });
  catEars(b, BX, BY + 10.8, BZ, 1.3, 1.8, 0x1f6f6b, { inner: PAL.gold, seg: 8, ry: 0.5 });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.39, a2 = (i + 1) / 8 * Math.PI * 2 + 0.39;
    bunting(b, BX + Math.cos(a) * 5.3, BY + 5.3, BZ + Math.sin(a) * 5.3, BX + Math.cos(a2) * 5.3, BY + 5.3, BZ + Math.sin(a2) * 5.3, ['#e8514a', '#f2c14e', '#2a8f8a', '#f6f2ea'], { n: 4, sag: 0.55 });
  }
  // steps + a forgotten music stand
  for (let i = 0; i < 3; i++) b.box(BX + 6.4 + i * 0.7, BY - 0.3 - i * 0.35, BZ, 1.2, 0.45, 4.0 - i * 0.5, 0xd8cbb0, { ao: 0 });
  b.cyl(BX - 1.5, BY + 0.7, BZ + 1.2, 0.1, 0.14, 1.5, 0x3a3229, { seg: 6, mat: 'metal', ao: 0 });
  b.box(BX - 1.5, BY + 2.2, BZ + 1.2, 1.0, 0.7, 0.08, 0x3a3229, { rx: -0.5, ao: 0, mat: 'metal' });
  const bandCell = T.plaque(3.4, 0.8, [{ t: 'THE COMMONS BANDSTAND', s: 0.38, c: '#fff4dc' }, { t: 'every evening. forever.', s: 0.24, c: '#ffd9a8', weight: 'italic bold' }], { bg: '#1f6f6b', border: '#f2c14e', borderW: 0.06, dpu: 130 });
  b.sign(bandCell, BX, BY + 1.5, BZ + 5.62, 3.4, 0.8, {});
  T.col(BX, BZ, 6.0);
  T.act('bandstand', BX, BZ + 8.4, 'The bandstand', [
    'THE COMMONS BANDSTAND — every evening. forever. the "forever" was added later, in different paint.',
    'sheet music is still on the stand. the piece is called "Stay Another Night (reprise)".',
    'the band is very good. the band has had a lot of time to practise.',
  ], { r: 4.6, speaker: 'BANDSTAND' });

  // ── statue: the first cat to say no ───────────────────────────────────────
  const SX = 134, SZ = -62, SY = T.ground(SX, SZ);
  b.cyl(SX, SY - 0.3, SZ, 2.6, 2.9, 0.7, 0xb9a887, { seg: 12, ao: 0 });
  b.box(SX, SY + 0.4, SZ, 3.0, 0.4, 3.0, 0xd8cbb0, { ry: 0.3, ao: 0 });
  b.box(SX, SY + 0.8, SZ, 2.4, 2.6, 2.4, 0xe6d9bd, { ry: 0.3, ao: 0.4, aoBase: SY });
  b.box(SX, SY + 3.4, SZ, 2.9, 0.35, 2.9, 0xd8cbb0, { ry: 0.3, ao: 0 });
  sittingCat(b, SX, SY + 3.75, SZ, 4.4, 0xba8544, { ry: 0.75, mat: 'metal', carve: true, whiskers: false, inner: 0x8f6530, sclera: 0xf4e8ce, pupil: 0x30220e, socket: 0xa8763a, muzzle: 0xd2a05e, nose: 0x8f6530, tailSide: 1, seg: 12, rings: 8 });
  // a raised paw, palm out: "no"
  b.cyl(SX + Math.sin(1.15) * 0.6, SY + 5.9, SZ + Math.cos(1.15) * 0.6, 0.22, 0.26, 1.5, 0xba8544, { seg: 8, rz: -0.75, ry: 1.15, mat: 'metal', ao: 0 });
  b.sph(SX + Math.sin(1.15) * 1.45, SY + 7.0, SZ + Math.cos(1.15) * 1.45, 0.45, 0xba8544, { seg: 9, rings: 6, mat: 'metal', sz: 0.55, ry: 1.15 });
  const noCell = T.plaque(2.2, 1.0, [
    { t: 'CONDUCTOR WHISKERS', s: 0.3, c: '#f6ecd2', family: FONTS.SERIF },
    { t: 'the first cat to say no', s: 0.2, c: '#e0c98a', weight: 'italic bold' },
    { t: 'he played until the last ferry left', s: 0.16, c: '#c8b088', weight: 'italic bold' },
  ], { bg: '#7a5a30', border: '#3f2c16', borderW: 0.05, dpu: 140 });
  b.sign(noCell, SX + Math.sin(0.3) * 1.23, SY + 2.0, SZ + Math.cos(0.3) * 1.23, 2.2, 1.0, { ry: 0.3 });
  T.col(SX, SZ, 2.8);
  T.act('statue', SX + 3.4, SZ + 1.6, 'Conductor Whiskers', [
    'CONDUCTOR WHISKERS — the first cat to say no. his paw is raised, palm out.',
    'the inscription: "he played until the last ferry left." it does not say where the ferry went.',
    'someone leaves a fish here every Thursday. nobody has ever seen who.',
  ], { r: 4.0, speaker: 'THE STATUE' });
}

