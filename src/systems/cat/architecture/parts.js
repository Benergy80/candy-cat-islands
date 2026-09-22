// ─────────────────────────────────────────────────────────────────────────────
// PARTS — the vocabulary of Cat Island: walls with sun-lounging sills, doors
// that are cat-sized with an apologetic little human door beside them, barrel
// roofs, awnings, lampposts, benches, topiary, and the sitting cat that shows
// up as a statue, a weathervane and a hood ornament.
//
// Every part writes into a Kit. Nothing here creates a Mesh.
// ─────────────────────────────────────────────────────────────────────────────
import { CAT } from '../../../core/palette.js';

export const PAL = {
  wall: [0xfaf0dc, 0xf0dcae, 0xe8c8a0, 0xefd9c0, 0xe3c9a8, 0xf3e3c6, 0xe6b894],
  wallWarm: [0xd9694a, 0xc9663f, 0xe08a5c],
  roof: [0xc94b3a, 0xb84232, 0xd2594a, 0xa8503c],
  trim: [0x2a8f8a, 0x1d3557, 0x3a6ea5, 0x4f8a5b, 0x8d5a34],
  stone: 0xcfc0a6, stoneDark: 0x9a8c74, stoneLight: 0xe3d7bf,
  // every bulb / lantern glass / lens in town: an amber SOLID, so daylight
  // shows dull amber glass and the night emissive has somewhere to travel.
  amber: 0xc98a30, amberPale: 0xd9a444, amberDeep: 0xa86c22,
  wood: 0x8d5a34, woodDark: 0x5e3a1f, woodLight: 0xb4834f,
  dark: 0x33281f, bronze: 0x9c6f3a, gold: 0xf2c14e, chrome: 0xc9d2d8,
  glass: 0x2b4450, leaf: 0x4f8a3a, leafLight: 0x7ab84e, flower: [0xff5f8a, 0xffd447, 0xff8c42, 0xd06bff, 0xffffff],
  cloth: [0xe8514a, 0x2a8f8a, 0xf2c14e, 0x3a6ea5, 0xf6f2ea],
  fur: [0xf0963c, 0x8a8a94, 0x2b2b30, 0xf6f2ea, 0xd9a066, 0xb8834a],
};

// ── prop colliders ───────────────────────────────────────────────────────────
// Street furniture is built by these helpers from a dozen call sites, so the
// colliders are collected here rather than at every call site. architecture.js
// installs the collector; `box` entries are the wave-2 oriented-box contract.
let COL = null;
/** fn = { box(x,z,w,d,rot,h), circle(x,z,r,h) } */
export function setCollector(fn) { COL = fn; }
/** The painted plank face every crate wears (an atlas cell, set once by
 *  architecture.js). Without it a crate is a flat grey box on the quay. */
let CRATE_FACE = null;
export function setCrateFace(cell) { CRATE_FACE = cell; }
const colBox = (x, z, w, d, rot, h) => { if (COL) COL.box(x, z, w, d, rot, h); };
const colCyl = (x, z, r, h) => { if (COL) COL.circle(x, z, r, h); };

// ── night spill primitives (all share the town-wide additive `spill` material,
//    so any number of them cost ONE draw call and nothing at all in daylight) ─
/** A warm pool of light lying flat on the ground, centre (x,y,z), radius r. */
export function pool(b, x, y, z, r) {
  b.hquad(x, y, z, r * 2, r * 2, 0xffffff, { mat: 'spill' });
}
/** A warm wash on a wall: centred quad facing +Z, turned by ry. */
export function wash(b, x, y, z, w, h, ry = 0) {
  b.quad(x, y, z, w, h, 0xffffff, { ry, mat: 'spill' });
}
/** A soft halo around a bulb: a cross of two additive quads, readable from any
 *  azimuth the isometric camera can reach. 2 quads = 4 tris. */
export function halo(b, x, y, z, r) {
  b.quad(x, y, z, r * 2, r * 2, 0xffffff, { mat: 'spill' });
  b.quad(x, y, z, r * 2, r * 2, 0xffffff, { ry: Math.PI / 2, mat: 'spill' });
}

/** A point `dist` out from a frame's centre, `ang` radians round from its front. */
export function at(f, ang, dist) {
  const a = f.ry + ang;
  return { x: f.x + Math.sin(a) * dist, z: f.z + Math.cos(a) * dist, ry: a, y: f.y };
}

/** A local frame: position + yaw. Local +Z is the FRONT of a building. */
export function frame(x, y, z, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return {
    x, y, z, ry, c, s,
    px: (lx, lz) => x + lx * c + lz * s,
    pz: (lx, lz) => z - lx * s + lz * c,
  };
}

// ── openings ─────────────────────────────────────────────────────────────────
/**
 * A big cat window with a deep sun-lounging sill.
 * f=frame, lx=offset along the wall, lz=wall plane (front face), y0=sill height.
 */
export function windowUnit(b, f, lx, lz, y0, w, h, o = {}) {
  const { ry } = f;
  const X = (a, c) => f.px(a, c), Z = (a, c) => f.pz(a, c);
  const trim = o.trim ?? PAL.trim[0];
  // reveal (recess frame)
  b.box(X(lx, lz + 0.02), f.y + y0, Z(lx, lz + 0.02), w + 0.36, h + 0.36, 0.22, o.frameColor ?? PAL.stoneLight, { ry, ao: 0.4, aoBase: f.y });
  // glass — cool and dark by day, lit from inside at night (mat 'win')
  b.quad(X(lx, lz + 0.14), f.y + y0 + h / 2, Z(lx, lz + 0.14), w, h, o.glassColor ?? PAL.glass, { ry, mat: 'win' });
  // the light that leaks out of it onto the plaster
  if (o.wash !== false) wash(b, X(lx, lz + 0.24), f.y + y0 + h * 0.52, Z(lx, lz + 0.24), (w + 0.4) * 1.55, (h + 0.4) * 1.7, ry);
  // muntins
  b.box(X(lx, lz + 0.17), f.y + y0, Z(lx, lz + 0.17), 0.09, h, 0.05, trim, { ry, ao: 0 });
  b.box(X(lx, lz + 0.17), f.y + y0 + h * 0.52, Z(lx, lz + 0.17), w, 0.09, 0.05, trim, { ry, ao: 0 });
  // sun-lounging sill: deep, with a cushion a cat has clearly flattened
  b.box(X(lx, lz + 0.3), f.y + y0 - 0.2, Z(lx, lz + 0.3), w + 0.7, 0.2, 0.85, PAL.stone, { ry, ao: 0 });
  if (o.cushion !== false) {
    const cc = o.cushionColor ?? PAL.cloth[(Math.abs(Math.round(lx * 7 + y0 * 3))) % PAL.cloth.length];
    // one slab, no corner blobs: at 0.13 radius they were invisible and cost
    // ~6.5k triangles across the town's ~90 windows.
    b.box(X(lx + (o.cushionOff ?? 0), lz + 0.34), f.y + y0, Z(lx + (o.cushionOff ?? 0), lz + 0.34), w * 0.62, 0.19, 0.62, cc, { ry, ao: 0 });
  }
  // shutters
  if (o.shutters !== false) for (const s of [-1, 1]) {
    b.box(X(lx + s * (w / 2 + 0.42), lz + 0.2), f.y + y0 + 0.02, Z(lx + s * (w / 2 + 0.42), lz + 0.2), 0.62, h + 0.2, 0.1, trim, { ry, ao: 0.3, aoBase: f.y });
    for (let i = 0; i < 2; i++) b.box(X(lx + s * (w / 2 + 0.42), lz + 0.27), f.y + y0 + 0.34 + i * (h * 0.42), Z(lx + s * (w / 2 + 0.42), lz + 0.27), 0.5, 0.1, 0.04, 0x000000, { ry, ao: 0, shade: 0.0001 });
  }
  // flower box, sometimes
  if (o.flowers) {
    b.box(X(lx, lz + 0.56), f.y + y0 - 0.18, Z(lx, lz + 0.56), w * 0.8, 0.3, 0.32, PAL.wood, { ry, ao: 0 });
    for (let i = 0; i < 3; i++) {
      const fx = lx - w * 0.28 + (i / 2) * w * 0.56;
      b.sph(X(fx, lz + 0.56), f.y + y0 + 0.2, Z(fx, lz + 0.56), 0.26, PAL.leafLight, { seg: 6, rings: 4, flat: true });
      b.sph(X(fx, lz + 0.6), f.y + y0 + 0.36, Z(fx, lz + 0.6), 0.13, PAL.flower[i % PAL.flower.length], { seg: 6, rings: 3 });
    }
  }
}

/** The panelled leaf itself, with its cat-flap. Authored in `f`'s frame at
 *  (lx, lz) — pass a hinge frame and lx = W/2 to get a leaf that swings. */
export function doorLeaf(b, f, lx, lz, W, H, leaf, o = {}) {
  const { ry } = f;
  const X = (a, c) => f.px(a, c), Z = (a, c) => f.pz(a, c);
  b.box(X(lx, lz + 0.18), f.y, Z(lx, lz + 0.18), W - 0.12, H - 0.1, 0.12, leaf, { ry, ao: o.ao ?? 0.5, aoBase: f.y });
  for (let i = 0; i < 3; i++) b.box(X(lx, lz + 0.25), f.y + 0.5 + i * (H - 1.1) / 2.6, Z(lx, lz + 0.25), W - 0.55, 0.11, 0.04, 0x000000, { ry, ao: 0, shade: 0.0001 });
  // cat flap (the part that actually gets used)
  b.box(X(lx, lz + 0.26), f.y + 0.06, Z(lx, lz + 0.26), 1.0, 0.9, 0.08, 0x2a2119, { ry, ao: 0 });
  b.box(X(lx, lz + 0.3), f.y + 0.12, Z(lx, lz + 0.3), 0.86, 0.76, 0.06, o.flap ?? 0xe8d9b8, { ry, ao: 0, rz: o.flapTilt ?? 0.12 });
}

/** The Cat Island doorway: a generous cat door with a cat-flap, plus the
 *  small, grudging human door beside it. */
export function doorUnit(b, f, lx, lz, o = {}) {
  const { ry } = f;
  const X = (a, c) => f.px(a, c), Z = (a, c) => f.pz(a, c);
  const W = o.w ?? 2.5, H = o.h ?? 3.5;
  const leaf = o.color ?? PAL.trim[4];
  // surround
  b.box(X(lx, lz + 0.02), f.y, Z(lx, lz + 0.02), W + 0.5, H + 0.45, 0.24, o.surround ?? PAL.stoneLight, { ry, ao: 0.5, aoBase: f.y });
  // arch head
  b.cyl(X(lx, lz + 0.08), f.y + H + 0.2, Z(lx, lz + 0.08), (W + 0.5) / 2, (W + 0.5) / 2, 0.24, o.surround ?? PAL.stoneLight, { ry, rx: Math.PI / 2, seg: 14, theta: Math.PI, thetaStart: 0, ao: 0 });
  // dark recess then the leaf (an ENTERABLE door leaves the leaf to door.js,
  // which hangs it on a hinge and swings it)
  if (o.recess !== false) b.box(X(lx, lz + 0.12), f.y, Z(lx, lz + 0.12), W, H, 0.1, 0x1b1410, { ry, ao: 0 });
  if (o.leaf !== false) {
    doorLeaf(b, f, lx, lz, W, H, leaf, o);
    // handle, at cat height
    b.sph(X(lx + W * 0.32, lz + 0.3), f.y + 1.5, Z(lx + W * 0.32, lz + 0.3), 0.13, PAL.gold, { seg: 6, rings: 4 });
  }
  // the human door
  if (o.human !== false) {
    const hx = lx + (o.humanSide ?? 1) * (W / 2 + 0.75);
    b.box(X(hx, lz + 0.02), f.y, Z(hx, lz + 0.02), 1.02, 2.0, 0.2, o.surround ?? PAL.stoneLight, { ry, ao: 0.4, aoBase: f.y });
    b.box(X(hx, lz + 0.14), f.y, Z(hx, lz + 0.14), 0.78, 1.82, 0.12, o.humanColor ?? 0xb8552f, { ry, ao: 0.4, aoBase: f.y });
    b.sph(X(hx + 0.26, lz + 0.22), f.y + 1.0, Z(hx + 0.26, lz + 0.22), 0.07, PAL.chrome, { seg: 6, rings: 4, mat: 'metal' });
    if (o.humanSign !== false && o.humanSignCell) b.sign(o.humanSignCell, X(hx, lz + 0.24), f.y + 2.16, Z(hx, lz + 0.24), 1.0, 0.3, { ry });
  }
  // step + doormat
  b.box(X(lx, lz + 0.62), f.y - 0.02, Z(lx, lz + 0.62), W + 1.0, 0.16, 1.0, PAL.stone, { ry, ao: 0 });
  if (o.mat !== false) b.box(X(lx, lz + 0.72), f.y + 0.14, Z(lx, lz + 0.72), W * 0.7, 0.05, 0.6, 0x6b5a3e, { ry, ao: 0 });
}

// ── masses ───────────────────────────────────────────────────────────────────
/**
 * The hollow version of a block: four wall slabs, a floor and a ceiling, with
 * door openings cut out of chosen faces. Face 0 = front (+lz), 1 = right (+lx),
 * 2 = back, 3 = left; a gap is { face, lx, w, h } where lx is measured along
 * that face (centre 0) — so the same authoring numbers that place a doorUnit
 * place the hole behind it.
 *   o = { t, sink, gaps, ceil, ceilColor, floor, floorColor, wallIn }
 */
export function roomShell(b, f, w, h, d, color, o = {}) {
  const { ry } = f;
  const X = (a, c) => f.px(a, c), Z = (a, c) => f.pz(a, c);
  const t = o.t ?? 0.5, base = o.sink ?? 0.9;
  const y0 = f.y - base, H = h + base;
  const gaps = o.gaps || [];
  const shade = { ry, ao: 0.9, aoBase: f.y, aoH: 2.4 };
  // Each face is authored in its own frame so the gap maths is one routine.
  const faces = [
    { len: w, off: d / 2 - t / 2, rot: 0 },
    { len: d, off: w / 2 - t / 2, rot: Math.PI / 2 },
    { len: w, off: d / 2 - t / 2, rot: Math.PI },
    { len: d, off: w / 2 - t / 2, rot: -Math.PI / 2 },
  ];
  const segs = [];               // world-space wall segments, for the colliders
  const slab = (p, len, rot) => {
    b.box(X(p[0], p[1]), y0, Z(p[0], p[1]), len, H, t, color, { ...shade, ry: ry + rot });
    segs.push({ x: X(p[0], p[1]), z: Z(p[0], p[1]), w: len, d: t, rot: ry + rot });
  };
  faces.forEach((fa, i) => {
    const c = Math.cos(fa.rot), s = Math.sin(fa.rot);
    // local→building coords for this face: along the face, then out to it
    const P = (a, out) => [a * c + out * s, -a * s + out * c];
    const mine = gaps.filter((g) => (g.face ?? 0) === i).sort((a2, b2) => a2.lx - b2.lx);
    const half = fa.len / 2 - (i % 2 ? t : 0);   // side walls stop short of the front/back slabs
    let cur = -half;
    for (const g of mine) {
      const g0 = g.lx - g.w / 2, g1 = g.lx + g.w / 2;
      if (g0 > cur) slab(P((cur + g0) / 2, fa.off), g0 - cur, fa.rot);
      cur = Math.max(cur, g1);
      const lp = P(g.lx, fa.off);
      // a window opening keeps its wall below the sill; a door does not
      if (g.y0) {
        b.box(X(lp[0], lp[1]), y0, Z(lp[0], lp[1]), g.w, base + g.y0, t, color, { ...shade, ry: ry + fa.rot });
        // …and that wall is SOLID. Without this the opening is a player-sized
        // hole straight through the building (it was possible to walk in through
        // Meow Donald's drive-thru hatch and out the other side). `top` is an
        // absolute world height, so the sill can still be vaulted.
        segs.push({ x: X(lp[0], lp[1]), z: Z(lp[0], lp[1]), w: g.w, d: t, rot: ry + fa.rot, top: f.y + g.y0 });
      }
      const lintel = H - base - g.h;
      if (lintel > 0.05) b.box(X(lp[0], lp[1]), f.y + g.h, Z(lp[0], lp[1]), g.w, lintel, t, color, { ry: ry + fa.rot, ao: 0 });
    }
    if (cur < half) slab(P((cur + half) / 2, fa.off), half - cur, fa.rot);
  });
  // Floor slab (its top sits 0.02 above f.y — the walkable height). It is
  // authored into `floorInto` (the town kit) rather than the shell: the shell
  // disappears while you are inside, and a room with no floor shows you the
  // hillside it was built on.
  if (o.floor !== false) {
    // `floorTop` is an ABSOLUTE world height (see T.padY): on a slope the floor
    // has to be laid over the highest ground in the footprint, not at the
    // building's centre height, or the hill comes up through the boards.
    const top = o.floorTop ?? (f.y + 0.02);
    const th = Math.max(0.12, top - (f.y - 0.4));
    (o.floorInto || b).box(f.x, top - th, f.z, w - t * 2 + 0.04, th, d - t * 2 + 0.04, o.floorColor ?? 0xc0ae8e, { ry, ao: 0 });
  }
  if (o.ceil) b.box(f.x, f.y + o.ceil, f.z, w - t * 1.6, 0.26, d - t * 1.6, o.ceilColor ?? PAL.stoneLight, { ry, ao: 0 });
  return segs;
}

/** Plastered block with plinth, quoins and an eaves band. Returns nothing.
 *  `o.hollow` (see roomShell) makes it a room you can walk into. */
export function block(b, f, w, h, d, color, o = {}) {
  const { ry } = f;
  const X = (a, c) => f.px(a, c), Z = (a, c) => f.pz(a, c);
  const base = o.sink ?? 0.9;
  const segs = o.hollow ? roomShell(b, f, w, h, d, color, { ...o.hollow, sink: base }) : null;
  if (!segs) b.box(f.x, f.y - base, f.z, w, h + base, d, color, { ry, ao: 0.9, aoBase: f.y, aoH: 2.4 });
  if (o.plinth !== false) b.box(f.x, f.y - base, f.z, w + 0.3, base + 0.55, d + 0.3, o.plinthColor ?? PAL.stone, { ry, ao: 0.7, aoBase: f.y - base, aoH: 1.6 });
  if (o.quoins) for (const sx of [-1, 1]) for (let i = 0; i < Math.floor(h / 1.55); i++) {
    const qw = i % 2 ? 0.55 : 0.85;
    b.box(X(sx * (w / 2 - qw / 2 + 0.06), 0), f.y + 0.6 + i * 1.55, Z(sx * (w / 2 - qw / 2 + 0.06), 0), qw, 0.72, d + 0.12, o.quoinColor ?? PAL.stoneLight, { ry, ao: 0.3, aoBase: f.y });
  }
  if (o.band !== false) b.box(f.x, f.y + h - 0.32, f.z, w + 0.36, 0.34, d + 0.36, o.bandColor ?? PAL.stoneLight, { ry, ao: 0 });
  return segs;
}

/**
 * The town's roofs. `kind` picks the material so a street is not one ribbed red
 * extrusion repeated twelve times:
 *   'tile'   barrel pantiles (terracotta / ochre) — rolls of clay down the slope
 *   'slate'  flat courses (grey/blue) — horizontal bands, no rolls, crisp ridge
 *   'copper' standing-seam sheet (verdigris) — thin raised seams, flat ridge cap
 * `pitch` (radians) is honoured over `h` when given: ~0.35 rad (20°) keeps the
 * ridge low so the FACADE, not the roof plane, is what the iso camera sees.
 */
export function tileRoof(b, f, w, h, d, color = PAL.roof[0], o = {}) {
  const { ry } = f;
  const y = f.y + (o.top ?? 0);
  const along = o.alongX !== false;                 // ridge parallel to the facade
  const rw = (along ? d : w) + 1.1, rd = (along ? w : d) + 1.1;
  const rry = ry + (along ? Math.PI / 2 : 0);
  if (o.pitch) h = Math.tan(o.pitch) * rw / 2;
  const kind = o.kind || 'tile';
  b.box(f.x, y - 0.28, f.z, w + 1.2, 0.34, d + 1.2, o.eave ?? PAL.stoneLight, { ry, ao: 0 });   // eaves
  const ribs = kind === 'tile' ? (o.ribs ?? Math.max(5, Math.round(rd / 0.95)))
    : kind === 'copper' ? Math.max(4, Math.round(rd / 1.15)) : 0;
  const ribR = kind === 'copper' ? 0.075 : 0.15;
  const shade = (c, k) => {
    const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, bl = (c & 255) * k;
    return (Math.min(255, r | 0) << 16) | (Math.min(255, g | 0) << 8) | Math.min(255, bl | 0);
  };
  b.roof(f.x, y, f.z, rw, h, rd, color, {
    ry: rry, ribs, ribR, ribColor: o.ribColor ?? (kind === 'copper' ? shade(color, 0.74) : color), ao: 0,
  });
  // slate: horizontal courses banded down both slopes (cheap, and it reads as
  // stone rather than clay from any distance)
  if (kind === 'slate') {
    const ang = Math.atan2(h, rw / 2), len = Math.hypot(rw / 2, h);
    const nC = Math.max(3, Math.round(len / 0.88));
    for (const s of [-1, 1]) for (let i = 1; i < nC; i++) {
      const t = i / nC;
      const lx = s * (rw / 2) * (1 - t), ly = h * t;
      const nx = Math.sin(ang) * s, ny = Math.cos(ang);
      const wx = f.x + (lx + nx * 0.05) * Math.cos(rry), wz = f.z - (lx + nx * 0.05) * Math.sin(rry);
      b.box(wx, y + ly + ny * 0.05, wz, 0.1, 0.08, rd - 0.06, shade(color, i % 2 ? 0.86 : 1.06), { ry: rry, ao: 0 });
    }
  }
  // the ridge: rolled clay for pantiles, a flat capping stone for everything else
  if (kind === 'tile') {
    const n = Math.max(3, Math.round(rd / 1.55));
    for (let i = 0; i < n; i++) {
      const t = -rd / 2 + rd * ((i + 0.5) / n);
      const lx = along ? t : 0, lz = along ? 0 : t;
      b.cyl(f.px(lx, lz), y + h - 0.02, f.pz(lx, lz), 0.21, 0.21, rd / n * 0.98, o.ridgeColor ?? PAL.roof[3], { seg: 6, open: true, center: true, ry: rry, rz: Math.PI / 2, ao: 0 });
    }
  } else {
    b.box(f.x, y + h - 0.12, f.z, 0.46, 0.2, rd - 0.02, o.ridgeColor ?? shade(color, kind === 'slate' ? 0.78 : 0.7), { ry: rry, ao: 0 });
  }
}

/**
 * A moulded cornice / parapet cap wrapped round the top of a shopfront. This is
 * the cheapest way to buy facade height: three thin slabs stepping out, and the
 * band the eye measures the building by grows without the roof growing with it.
 */
export function cornice(b, f, lx, lz, y, w, color, o = {}) {
  const { ry } = f, d = o.d ?? 0.5;
  b.box(f.px(lx, lz), y, f.pz(lx, lz), w, 0.18, d, color, { ry, ao: 0 });
  b.box(f.px(lx, lz + 0.08), y + 0.18, f.pz(lx, lz + 0.08), w + 0.3, 0.22, d + 0.16, o.capColor ?? color, { ry, ao: 0 });
  b.box(f.px(lx, lz + 0.02), y + 0.4, f.pz(lx, lz + 0.02), w - 0.2, 0.16, d + 0.04, color, { ry, ao: 0 });
  // dentils, so the band has a shadow line in it
  if (o.dentils !== false) {
    const n = Math.max(4, Math.round(w / 1.05));
    for (let i = 0; i < n; i++) b.box(f.px(lx - w / 2 + w * ((i + 0.5) / n), lz + 0.14), y - 0.18, f.pz(lx - w / 2 + w * ((i + 0.5) / n), lz + 0.14), w / n * 0.5, 0.2, d * 0.5, o.capColor ?? color, { ry, ao: 0 });
  }
}

/** A shallow balcony on a shopfront's first floor: slab, brackets, railing. */
export function balcony(b, f, lx, lz, y, w, o = {}) {
  const { ry } = f, dep = o.depth ?? 1.25, rail = o.rail ?? PAL.trim[1];
  b.box(f.px(lx, lz + dep / 2), y, f.pz(lx, lz + dep / 2), w, 0.2, dep, o.color ?? PAL.stoneLight, { ry, ao: 0 });
  for (const s of [-1, 1]) b.box(f.px(lx + s * (w / 2 - 0.2), lz + 0.34), y - 0.5, f.pz(lx + s * (w / 2 - 0.2), lz + 0.34), 0.22, 0.55, 0.7, o.color ?? PAL.stoneLight, { ry, rz: s * 0.5, ao: 0 });
  const n = Math.max(4, Math.round(w / 0.62));
  for (let i = 0; i < n; i++) {
    const bx = lx - w / 2 + w * ((i + 0.5) / n);
    b.box(f.px(bx, lz + dep - 0.14), y + 0.2, f.pz(bx, lz + dep - 0.14), 0.08, 0.86, 0.08, rail, { ry, ao: 0, mat: 'metal' });
  }
  for (const s of [-1, 1]) b.box(f.px(lx + s * (w / 2 - 0.05), lz + dep / 2), y + 0.2, f.pz(lx + s * (w / 2 - 0.05), lz + dep / 2), 0.08, 0.86, dep - 0.2, rail, { ry, ao: 0, mat: 'metal' });
  b.box(f.px(lx, lz + dep - 0.14), y + 1.06, f.pz(lx, lz + dep - 0.14), w, 0.12, 0.16, rail, { ry, ao: 0, mat: 'metal' });
  // a pot and a cat, because a balcony nobody uses is just a shelf
  if (o.pot !== false) {
    b.cyl(f.px(lx - w * 0.3, lz + dep * 0.55), y + 0.2, f.pz(lx - w * 0.3, lz + dep * 0.55), 0.26, 0.22, 0.4, 0xc8703f, { seg: 8, ao: 0 });
    b.sph(f.px(lx - w * 0.3, lz + dep * 0.55), y + 0.7, f.pz(lx - w * 0.3, lz + dep * 0.55), 0.32, PAL.leafLight, { seg: 7, rings: 4, sy: 0.7, flat: true });
  }
}

/** Flat roof with a parapet, sitting on a block of height `o.top`. */
export function flatRoof(b, f, w, d, color = PAL.stoneLight, o = {}) {
  const { ry } = f;
  const y = f.y + (o.top ?? 0);
  b.box(f.x, y - 0.1, f.z, w + 0.6, 0.24, d + 0.6, color, { ry, ao: 0 });
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    b.box(f.px(sx * w / 2, sz * d / 2), y + 0.14, f.pz(sx * w / 2, sz * d / 2), sx ? 0.34 : w + 0.6, o.parapet ?? 0.55, sz ? 0.34 : d + 0.6, color, { ry, ao: 0 });
  }
  if (o.cap !== false) for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    b.box(f.px(sx * w / 2, sz * d / 2), y + 0.14 + (o.parapet ?? 0.55), f.pz(sx * w / 2, sz * d / 2), sx ? 0.5 : w + 0.8, 0.16, sz ? 0.5 : d + 0.8, o.capColor ?? PAL.stoneDark, { ry, ao: 0 });
  }
}

/** A striped shop awning: sloped canopy + scalloped valance + tie rods. */
export function awning(b, f, lx, lz, y, w, stripeCell, o = {}) {
  const { ry } = f;
  const X = (a, c) => f.px(a, c), Z = (a, c) => f.pz(a, c);
  const dep = o.depth ?? 2.1, tilt = o.tilt ?? 0.42;
  const cz = lz + Math.cos(tilt) * dep / 2, cy = y - Math.sin(tilt) * dep / 2;
  b.box(X(lx, cz), cy, Z(lx, cz), w, 0.1, dep, o.under ?? 0xe7dcc8, { ry, rx: tilt, ao: 0 });
  b.sign(stripeCell, X(lx, cz + 0.02), cy + 0.07, Z(lx, cz + 0.02), w, dep, { ry, rx: -Math.PI / 2 + tilt });
  // valance with scallops
  const fz = lz + Math.cos(tilt) * dep, fy = y - Math.sin(tilt) * dep;
  b.sign(stripeCell, X(lx, fz + 0.03), fy - 0.22, Z(lx, fz + 0.03), w, 0.45, { ry });
  const n = Math.max(3, Math.round(w / 0.52));
  for (let i = 0; i < n; i++) {
    const sx2 = -w / 2 + w * ((i + 0.5) / n);
    b.sph(X(lx + sx2, fz + 0.02), fy - 0.44, Z(lx + sx2, fz + 0.02), w / n * 0.5, o.scallop ?? 0xf4ead6, { seg: 6, rings: 3, sy: 0.8, sz: 0.5 });
  }
  for (const s of [-1, 1]) b.cyl(X(lx + s * (w / 2 - 0.12), lz + 0.06), y - 0.05, Z(lx + s * (w / 2 - 0.12), lz + 0.06), 0.05, 0.05, dep + 0.1, 0x4a4038, { seg: 5, ry, rx: Math.PI / 2 + tilt, mat: 'metal', ao: 0 });
}

/** Fascia board over a shopfront carrying the shop's name. */
export function fascia(b, f, lx, lz, y, w, h, cell, color = PAL.trim[1], o = {}) {
  const { ry } = f;
  const X = (a, c) => f.px(a, c), Z = (a, c) => f.pz(a, c);
  b.box(X(lx, lz + 0.08), y, Z(lx, lz + 0.08), w, h, 0.3, color, { ry, ao: 0 });
  b.sign(cell, X(lx, lz + 0.25), y + h / 2, Z(lx, lz + 0.25), w - 0.24, h - 0.18, { ry, glow: o.glow });
  if (o.lamps !== false) for (const s of [-1, 1]) {
    b.cyl(X(lx + s * (w / 2 - 0.6), lz + 0.3), y + h + 0.05, Z(lx + s * (w / 2 - 0.6), lz + 0.3), 0.04, 0.04, 0.5, 0x3a332c, { seg: 5, ry, rx: 0.5, mat: 'metal', ao: 0 });
    b.cone(X(lx + s * (w / 2 - 0.6), lz + 0.62), y + h + 0.42, Z(lx + s * (w / 2 - 0.6), lz + 0.62), 0.2, 0.28, 0x3a332c, { seg: 8, ry, rx: Math.PI - 0.5, ao: 0 });
    b.sph(X(lx + s * (w / 2 - 0.6), lz + 0.62), y + h + 0.26, Z(lx + s * (w / 2 - 0.6), lz + 0.62), 0.11, PAL.amberPale, { seg: 6, rings: 4, mat: 'glow' });
    halo(b, X(lx + s * (w / 2 - 0.6), lz + 0.66), y + h + 0.24, Z(lx + s * (w / 2 - 0.6), lz + 0.66), 0.62);
  }
  // the sign itself is washed by its own two lamps
  if (o.glow) wash(b, X(lx, lz + 0.34), y + h * 0.5, Z(lx, lz + 0.34), w * 1.02, h * 2.4, ry);
}

/** Shop display window: wide, low, full of goods. */
export function shopWindow(b, f, lx, lz, y0, w, h, o = {}) {
  const { ry } = f;
  const X = (a, c) => f.px(a, c), Z = (a, c) => f.pz(a, c);
  b.box(X(lx, lz + 0.02), f.y + y0 - 0.28, Z(lx, lz + 0.02), w + 0.4, h + 0.5, 0.22, o.frameColor ?? PAL.trim[1], { ry, ao: 0.3, aoBase: f.y });
  b.quad(X(lx, lz + 0.15), f.y + y0 + h / 2, Z(lx, lz + 0.15), w, h, o.glassColor ?? PAL.glass, { ry, mat: 'win' });
  b.box(X(lx, lz + 0.2), f.y + y0 - 0.28, Z(lx, lz + 0.2), w + 0.3, 0.3, 0.4, PAL.stone, { ry, ao: 0 });
  if (o.goods) o.goods(b, f, lx, lz, f.y + y0 + 0.1);
  // a lit display window throws light on its own plaster AND on the flagstones
  if (o.wash !== false) {
    wash(b, X(lx, lz + 0.26), f.y + y0 + h * 0.55, Z(lx, lz + 0.26), w * 1.5, h * 1.9, ry);
    pool(b, X(lx, lz + 1.5), f.y + (o.poolLift ?? 0.2), Z(lx, lz + 1.5), w * 0.75);
  }
}

// ── street furniture ─────────────────────────────────────────────────────────
/**
 * Cat Island's street lighting comes in two patterns and they are mixed along
 * every street, never alternated: `style:'globe'` is the older municipal one —
 * a fluted post, a curved goose-neck arm and one frosted amber globe.
 */
export function lamppost(b, x, y, z, o = {}) {
  if (o.style === 'globe') return globeLamp(b, x, y, z, o);
  const h = o.h ?? 5.0;
  b.cyl(x, y, z, 0.32, 0.42, 0.5, PAL.stoneDark, { seg: 8, ao: 0 });
  b.cyl(x, y + 0.4, z, 0.11, 0.17, h, o.color ?? 0x2f3a3c, { seg: 8, mat: 'metal', ao: 0.4, aoBase: y });
  b.torus(x, y + h * 0.55, z, 0.2, 0.05, o.color ?? 0x2f3a3c, { rx: Math.PI / 2, seg: 10, tseg: 5, mat: 'metal' });
  const arms = o.arms ?? 1;
  for (let i = 0; i < arms; i++) {
    const a = o.ry ?? 0, dx = arms === 1 ? 0 : Math.cos(a + i * Math.PI) * 0.75, dz = arms === 1 ? 0 : -Math.sin(a + i * Math.PI) * 0.75;
    if (arms > 1) b.cyl(x + dx * 0.5, y + h + 0.2, z + dz * 0.5, 0.07, 0.07, 1.1, o.color ?? 0x2f3a3c, { seg: 5, center: true, rz: Math.PI / 2, ry: a + i * Math.PI, mat: 'metal', ao: 0 });
    // amber lantern glass (never white: it must read as dull amber glass by day)
    b.cyl(x + dx, y + h + 0.3, z + dz, 0.34, 0.24, 0.75, PAL.amber, { seg: 8, mat: 'glow', ao: 0 });
    b.cone(x + dx, y + h + 1.02, z + dz, 0.44, 0.4, o.color ?? 0x2f3a3c, { seg: 8, ao: 0 });
    b.sph(x + dx, y + h + 1.5, z + dz, 0.12, PAL.gold, { seg: 6, rings: 4 });
    halo(b, x + dx, y + h + 0.66, z + dz, o.halo ?? 1.5);
  }
  // a cat has left a paw-shaped dent in the base
  b.sph(x + 0.3, y + 0.1, z + 0.28, 0.12, PAL.stoneDark, { seg: 6, rings: 4, sy: 0.4 });
  if (o.collide !== false) colBox(x, z, 0.72, 0.72, 0, y + h + 1.6);
  // the pool it throws on the pavement (poolY lets the caller sit it on paving)
  if (o.pool !== false) pool(b, x, (o.poolY ?? y + 0.16), z, o.pool ?? 3.4);
}

/** The older municipal pattern: fluted post, goose-neck arm, one frosted globe. */
function globeLamp(b, x, y, z, o = {}) {
  const h = o.h ?? 4.6, col = o.color ?? 0x3d4a42, ry = o.ry ?? 0;
  b.cyl(x, y, z, 0.38, 0.5, 0.34, PAL.stoneDark, { seg: 8, ao: 0 });
  b.cyl(x, y + 0.3, z, 0.24, 0.34, 0.7, col, { seg: 8, mat: 'metal', ao: 0.4, aoBase: y });
  b.cyl(x, y + 0.98, z, 0.13, 0.2, h - 0.9, col, { seg: 8, mat: 'metal', ao: 0.3, aoBase: y });
  for (let i = 0; i < 6; i++) {                       // flutes
    const a = i / 6 * Math.PI * 2;
    b.cyl(x + Math.cos(a) * 0.19, y + 0.98, z + Math.sin(a) * 0.19, 0.035, 0.045, h - 1.4, col, { seg: 4, mat: 'metal', ao: 0 });
  }
  // the goose-neck: four short segments swinging over
  const arm = o.arm ?? 1.15;
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4, a = t * Math.PI * 0.5;
    const dx = Math.sin(ry) * arm * (1 - Math.cos(a)), dz = Math.cos(ry) * arm * (1 - Math.cos(a));
    b.cyl(x + dx, y + h + 0.1 + arm * Math.sin(a) * 0.55, z + dz, 0.075, 0.085, 0.55, col, { seg: 5, center: true, rz: Math.PI / 2 - (Math.PI / 2 - a), ry, mat: 'metal', ao: 0 });
  }
  const gx = x + Math.sin(ry) * arm, gz = z + Math.cos(ry) * arm, gy = y + h + 0.62;
  b.cyl(gx, gy - 0.02, gz, 0.2, 0.3, 0.26, col, { seg: 8, mat: 'metal', ao: 0 });
  b.sph(gx, gy - 0.5, gz, 0.46, PAL.amberPale, { seg: 10, rings: 7, mat: 'glow' });
  b.torus(gx, gy - 0.5, gz, 0.47, 0.045, col, { rx: -Math.PI / 2, seg: 12, tseg: 4, mat: 'metal' });
  halo(b, gx, gy - 0.5, gz, o.halo ?? 1.6);
  if (o.collide !== false) colBox(x, z, 0.8, 0.8, 0, y + h + 1.0);
  if (o.pool !== false) pool(b, gx, (o.poolY ?? y + 0.16), gz, o.pool ?? 3.6);
}

export function bench(b, x, y, z, ry = 0, o = {}) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const L = o.len ?? 2.6;
  for (const sx of [-1, 1]) {
    const [px, pz] = P(sx * (L / 2 - 0.24), 0);
    b.box(px, y, pz, 0.2, 0.55, 0.9, o.legColor ?? PAL.stoneDark, { ry, ao: 0.4, aoBase: y });
  }
  for (let i = 0; i < 3; i++) {
    const lz = -0.3 + i * 0.3;
    b.box(x + lz * s, y + 0.55, z + lz * c, L, 0.11, 0.24, o.color ?? PAL.wood, { ry, ao: 0 });
  }
  for (let i = 0; i < 3; i++) {
    const ly = 0.78 + i * 0.28, lz = -0.36;
    b.box(x + lz * s, y + ly, z + lz * c, L, 0.2, 0.1, o.color ?? PAL.wood, { ry, ao: 0, rx: 0.12 });
  }
  for (const sx of [-1, 1]) { const [px, pz] = P(sx * (L / 2 - 0.1), -0.34); b.box(px, y + 0.55, pz, 0.12, 0.72, 0.12, o.legColor ?? PAL.stoneDark, { ry, ao: 0 }); }
  if (o.collide !== false) colBox(x, z, L + 0.2, 1.0, ry, y + 0.95);
}

/**
 * A planted tub. `pot` picks the vessel (0 terracotta round · 1 painted
 * octagonal · 2 a glazed olive-jar) and `plant` picks what is in it
 * (0 flowers · 1 a clipped topiary cone · 2 a small olive · 3 trailing
 * geraniums) — a street's worth of identical terracotta drums with identical
 * flower blobs is the single most obvious tell that a town was generated.
 */
export function planter(b, x, y, z, r = 1.1, o = {}) {
  const pot = o.pot ?? 0, plant = o.plant ?? 0;
  const cols = [0xc8703f, 0xb8a88e, 0x6f8e7a], rims = [0xdd8a5a, 0xd2c4a8, 0x88a897];
  const col = o.color ?? cols[pot % 3], rim = o.rim ?? rims[pot % 3];
  const hgt = pot === 2 ? 1.25 : 0.95;
  if (pot === 1) {
    b.cyl(x, y, z, r, r * 0.8, hgt, col, { seg: 8, ao: 0.5, aoBase: y, ry: o.seed ?? 0 });
    for (let i = 0; i < 6; i++) { const a = (o.seed ?? 0) + i / 6 * Math.PI * 2; b.box(x + Math.cos(a) * r * 0.92, y + 0.2, z + Math.sin(a) * r * 0.92, 0.1, hgt - 0.4, r * 0.7, rim, { ry: -a, ao: 0 }); }
  } else if (pot === 2) {
    b.cyl(x, y, z, r * 0.66, r * 0.5, hgt * 0.35, col, { seg: 10, ao: 0.5, aoBase: y });
    b.sph(x, y + hgt * 0.6, z, r * 0.95, col, { seg: 11, rings: 7, sy: 0.78 });
    b.cyl(x, y + hgt * 0.92, z, r * 0.6, r * 0.72, 0.3, col, { seg: 10, ao: 0 });
  } else {
    b.cyl(x, y, z, r, r * 0.78, hgt, col, { seg: 10, ao: 0.5, aoBase: y });
  }
  b.torus(x, y + hgt - 0.02, z, r * (pot === 2 ? 0.63 : 1), 0.11, rim, { rx: -Math.PI / 2, seg: 12, tseg: 4 });
  const top = y + hgt + 0.18;
  if (plant === 1) {                                   // a clipped cone
    b.cone(x, y + hgt - 0.1, z, r * 0.82, r * 2.6, o.leaf ?? 0x3f7a35, { seg: 9, flat: true, ao: 0 });
    b.cone(x, y + hgt + r * 1.4, z, r * 0.5, r * 1.3, o.leaf2 ?? 0x4f8f40, { seg: 8, flat: true, ao: 0 });
  } else if (plant === 2) {                            // a small olive
    b.cyl(x, y + hgt - 0.1, z, 0.11, 0.16, r * 1.3, 0x8d7a5c, { seg: 6, ao: 0 });
    for (let i = 0; i < 3; i++) b.sph(x + Math.cos(i * 2.1) * r * 0.4, y + hgt + r * 1.25 + (i % 2) * 0.2, z + Math.sin(i * 2.1) * r * 0.4, r * 0.62, o.leaf ?? 0x7f9a62, { seg: 7, rings: 5, sy: 0.7, flat: true });
  } else {                                             // flowers, with or without trailers
    b.sph(x, y + hgt + 0.2, z, r * 0.92, o.leaf ?? PAL.leaf, { seg: 8, rings: 4, sy: 0.55, flat: true });
    const n = o.flowers ?? 5;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + (o.seed ?? 0), rr = r * 0.6;
      b.sph(x + Math.cos(a) * rr, top + 0.17 + (i % 3) * 0.12, z + Math.sin(a) * rr, 0.18, PAL.flower[(i + (o.seed ?? 0)) % PAL.flower.length], { seg: 6, rings: 3 });
    }
    if (plant === 3) for (let i = 0; i < 3; i++) {      // trailing over the rim
      const a = (o.seed ?? 0) + i * 2.3;
      b.sph(x + Math.cos(a) * r * 0.95, y + hgt * 0.6, z + Math.sin(a) * r * 0.95, r * 0.34, o.leaf ?? PAL.leafLight, { seg: 6, rings: 4, sy: 1.5, flat: true });
    }
  }
  if (o.collide !== false) colBox(x, z, r * 1.9, r * 1.9, 0, y + 1.3);
}

export function crate(b, x, y, z, s = 1, ry = 0, color = PAL.woodLight) {
  b.box(x, y, z, s, s * 0.85, s * 0.9, color, { ry, ao: 0.5, aoBase: y });
  b.box(x, y + s * 0.08, z, s + 0.04, 0.09, s * 0.94, PAL.woodDark, { ry, ao: 0 });
  b.box(x, y + s * 0.7, z, s + 0.04, 0.09, s * 0.94, PAL.woodDark, { ry, ao: 0 });
  b.box(x, y, z, s + 0.04, s * 0.85, 0.1, PAL.woodDark, { ry: ry + Math.PI / 2, ao: 0 });
  // painted planks + the stencil, on all four faces (2 tris each, one atlas)
  if (CRATE_FACE) for (let i = 0; i < 4; i++) {
    const a = ry + i * Math.PI / 2, off = i % 2 === 0 ? s * 0.47 : s * 0.53;
    b.sign(CRATE_FACE, x + Math.sin(a) * off, y + s * 0.4, z + Math.cos(a) * off, s * 0.84, s * 0.66, { ry: a });
  }
  // a coil of rope over one corner, because this is a quayside
  b.torus(x + Math.sin(ry + 0.8) * s * 0.4, y + s * 0.9, z + Math.cos(ry + 0.8) * s * 0.4, s * 0.19, s * 0.06, 0x9a8558, { rx: -Math.PI / 2, seg: 7, tseg: 3 });
  colBox(x, z, s, s * 0.92, ry, y + s * 0.85);
}

export function barrel(b, x, y, z, r = 0.5, h = 1.1, color = PAL.wood) {
  b.cyl(x, y, z, r * 0.88, r * 0.88, h, color, { seg: 10, ao: 0.6, aoBase: y });
  b.cyl(x, y + h * 0.2, z, r, r, h * 0.6, color, { seg: 10, ao: 0 });
  for (const t of [0.15, 0.5, 0.85]) b.torus(x, y + h * t, z, r * (t === 0.5 ? 1.02 : 0.92), 0.055, 0x554034, { rx: -Math.PI / 2, seg: 10, tseg: 4, mat: 'metal' });
  colBox(x, z, r * 1.8, r * 1.8, 0, y + h);
}

export function fence(b, pts, y, o = {}) {
  const col = o.color ?? 0xf3e7cf, hh = o.h ?? 1.1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / (o.spacing ?? 1.05)));
    for (let k = 0; k <= n; k++) {
      const t = k / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      const yy = o.ground ? o.ground(px, pz) : y;
      b.box(px, yy, pz, 0.14, hh, 0.14, col, { ry, ao: 0.4, aoBase: yy });
      b.cone(px, yy + hh, pz, 0.13, 0.18, col, { seg: 4, ry: ry + Math.PI / 4, ao: 0 });
    }
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const yy = o.ground ? o.ground(mx, mz) : y;
    for (const h2 of [hh * 0.3, hh * 0.72]) b.box(mx, yy + h2, mz, 0.07, 0.1, len, col, { ry, ao: 0 });
    if (o.collide !== false) colBox(mx, mz, 0.3, len, ry, yy + hh + 0.15);
  }
}

export function hedge(b, x, y, z, w, d, h, o = {}) {
  const ry = o.ry ?? 0;
  b.box(x, y, z, w, h, d, o.color ?? 0x3f7a35, { ry, ao: 0.6, aoBase: y, flat: true });
  const n = Math.max(2, Math.round(w / 0.8));
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + w * ((i + 0.5) / n);
    b.sph(x + lx * Math.cos(ry), y + h, z - lx * Math.sin(ry), w / n * 0.62, o.color2 ?? 0x4f8f40, { seg: 6, rings: 4, flat: true, sy: 0.75 });
  }
  if (o.collide !== false) colBox(x, z, w, d, ry, y + h + 0.35);
}

// ── the cat ──────────────────────────────────────────────────────────────────
/** A sitting cat of total height H, centred on (x,z), feet at y. */
export function sittingCat(b, x, y, z, H, color, o = {}) {
  const ry = o.ry ?? 0, m = o.mat, seg = o.seg ?? 9, rings = o.rings ?? 6;
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const g = { seg, rings, mat: m, flat: o.flat };
  let p = P(0, 0);
  b.sph(p[0], y + 0.30 * H, p[1], 0.30 * H, color, { ...g, sy: 1.06, sz: 0.92 });      // haunches
  p = P(0, 0.03 * H);
  b.sph(p[0], y + 0.60 * H, p[1], 0.235 * H, color, { ...g, sy: 1.02 });                // chest
  p = P(0, 0.04 * H);
  b.sph(p[0], y + 0.845 * H, p[1], 0.195 * H, color, { ...g, sy: 0.95, sz: 0.95 });     // head
  for (const sx of [-1, 1]) {
    p = P(sx * 0.125 * H, 0.02 * H);
    b.cone(p[0], y + 0.94 * H, p[1], 0.095 * H, 0.19 * H, color, { seg: 6, ry: ry + sx * 0.3, rz: -sx * 0.22, mat: m });
    p = P(sx * 0.125 * H, 0.035 * H);
    b.cone(p[0], y + 0.955 * H, p[1], 0.055 * H, 0.13 * H, o.inner ?? 0xe8a0a8, { seg: 5, ry: ry + sx * 0.3, rz: -sx * 0.22, mat: m });
  }
  p = P(0, o.carve ? 0.20 * H : 0.185 * H);
  b.sph(p[0], y + 0.80 * H, p[1], (o.carve ? 0.118 : 0.095) * H, o.muzzle ?? color, { ...g, sx: 1.45, sy: 0.82 });
  p = P(0, (o.carve ? 0.27 : 0.24) * H);
  b.cone(p[0], y + (o.carve ? 0.838 : 0.845) * H, p[1], (o.carve ? 0.05 : 0.032) * H, (o.carve ? 0.08 : 0.05) * H, o.nose ?? 0xd3697a, { seg: 5, rx: Math.PI / 2, mat: m });
  // A MONUMENTAL cat (o.carve) gets a carved face: at 8 m tall the proportional
  // 0.035·H eye is a dark notch, and the statue reads as a blank bronze blob.
  // Sclera + pupil + a brow ridge + whiskers, all in the same alloy but lighter.
  if (o.carve) {
    const pale = o.sclera ?? 0xf2e6cc, pup = o.pupil ?? 0x2a1f12;
    for (const sx of [-1, 1]) {
      // the eye SOCKET is sunk, the sclera stands proud of it and the pupil
      // proud of that — three shells, so the eye reads from any azimuth
      let q = P(sx * 0.082 * H, 0.146 * H);
      b.sph(q[0], y + 0.882 * H, q[1], 0.082 * H, o.socket ?? color, { seg: 9, rings: 6, sz: 0.45, mat: m });
      q = P(sx * 0.082 * H, 0.163 * H);
      b.sph(q[0], y + 0.882 * H, q[1], 0.070 * H, pale, { seg: 10, rings: 7, sz: 0.55, mat: m });
      q = P(sx * 0.082 * H, 0.192 * H);
      b.sph(q[0], y + 0.882 * H, q[1], 0.036 * H, pup, { seg: 8, rings: 5, sz: 0.55, mat: m });
      // two whiskers a side, hair-thin and PALE: three fat dark ones read as a
      // moustache and gave the statue a face like a walrus
      for (let k = 0; k < (o.whiskers === false ? 0 : 2); k++) {
        const w2 = P(sx * 0.112 * H, 0.215 * H);
        b.cyl(w2[0], y + (0.786 + k * 0.03) * H, w2[1], 0.008 * H, 0.008 * H, 0.24 * H, o.whisker ?? pale,
          { seg: 4, center: true, ry: ry + sx * (1.05 + k * 0.2), rz: Math.PI / 2, mat: m, ao: 0 });
      }
    }
  } else if (o.eyes !== false) for (const sx of [-1, 1]) {
    p = P(sx * 0.075 * H, 0.165 * H);
    b.sph(p[0], y + 0.875 * H, p[1], 0.035 * H, o.eye ?? 0x2b2b30, { seg: 6, rings: 4, mat: o.eyeMat ?? m });
  }
  for (const sx of [-1, 1]) {
    p = P(sx * 0.115 * H, 0.17 * H);
    b.cyl(p[0], y, p[1], 0.058 * H, 0.062 * H, 0.30 * H, color, { seg: 7, mat: m, ao: 0.5, aoBase: y });
    const q = P(sx * 0.115 * H, 0.245 * H);
    b.sph(q[0], y + 0.045 * H, q[1], 0.07 * H, color, { ...g, seg: 6, rings: 4 });
  }
  // curled tail
  if (o.tail !== false) {
    const pts = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7, a = -0.4 + t * 2.6, rr = (0.30 + t * 0.16) * H;
      const q = P(Math.cos(a) * rr * (o.tailSide ?? 1), Math.sin(a) * rr * 0.6 - 0.1 * H);
      pts.push([q[0], y + 0.07 * H + t * 0.06 * H, q[1]]);
    }
    b.tube(pts, 0.055 * H, o.tailColor ?? color, { rseg: 5, mat: m });
  }
}

/** Two cat ears on top of something (a dome, an arch, a lamp). */
export function catEars(b, x, y, z, r, h, color, o = {}) {
  const ry = o.ry ?? 0, m = o.mat;
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const sx of [-1, 1]) {
    const px = x + sx * r * c, pz = z - sx * r * s;
    b.cone(px, y, pz, r * 0.72, h, color, { seg: o.seg ?? 8, mat: m, rz: -sx * (o.splay ?? 0.16), ry, ao: 0 });
    b.cone(px, y + h * 0.1, pz + 0.001, r * 0.4, h * 0.7, o.inner ?? 0xe8a0a8, { seg: 6, mat: m, rz: -sx * (o.splay ?? 0.16), ry, ao: 0 });
  }
}

/** Classical column with base and capital. */
export function column(b, x, y, z, r, h, color = PAL.stoneLight, o = {}) {
  b.box(x, y, z, r * 2.6, 0.3, r * 2.6, color, { ao: 0.3, aoBase: y });
  b.cyl(x, y + 0.3, z, r * 0.88, r, h - 0.65, color, { seg: o.seg ?? 12, ao: 0.5, aoBase: y });
  if (o.flutes !== false) for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.5;
    b.cyl(x + Math.cos(a) * r * 0.95, y + 0.3, z + Math.sin(a) * r * 0.95, 0.06, 0.07, h - 0.7, o.fluteColor ?? 0xd8ccb2, { seg: 4, ao: 0 });
  }
  b.cyl(x, y + h - 0.35, z, r * 1.2, r * 0.92, 0.18, color, { seg: o.seg ?? 12, ao: 0 });
  b.box(x, y + h - 0.2, z, r * 2.7, 0.24, r * 2.7, color, { ao: 0 });
  if (o.collide !== false) colBox(x, z, r * 2.1, r * 2.1, 0, y + h);
}

/** Bunting: little triangular flags sagging between two points. */
export function bunting(b, ax, ay, az, bx, by, bz, colors, o = {}) {
  const n = o.n ?? 10, sag = o.sag ?? 1.0;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + (bz - az) * t]);
  }
  b.tube(pts, 0.045, o.cord ?? 0x6b5a44, { rseg: 4, seg: n * 2 });
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[i + 1];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, mz = (p[2] + q[2]) / 2;
    const ry = Math.atan2(q[0] - p[0], q[2] - p[2]) + Math.PI / 2;
    b.cone(mx, my + 0.02, mz, 0.22, 0.46, colors[i % colors.length], { seg: 3, rx: Math.PI, ry, ao: 0 });
  }
}

/** A flat stone paving disc with a border ring (thick, so sloping ground buries the rim). */
export function paving(b, x, y, z, r, o = {}) {
  const dep = o.depth ?? 1.6;
  b.cyl(x, y + 0.1 - dep, z, r, r, dep, o.color ?? CAT.cobble, { seg: o.seg ?? 28, ao: 0 });
  b.torus(x, y + 0.06, z, r - 0.3, 0.22, o.border ?? CAT.cobbleDark, { rx: -Math.PI / 2, seg: o.seg ?? 28, tseg: 5, ao: 0 });
  const rings = o.rings ?? 2;
  for (let k = 1; k <= rings; k++) b.torus(x, y + 0.09, z, r * (k / (rings + 1)), 0.1, o.border ?? CAT.cobbleDark, { rx: -Math.PI / 2, seg: 24, tseg: 4, ao: 0 });
}

/** A raised paved ribbon following a polyline (street / quay / path). */
export function ribbon(b, pts, width, yAt, color, o = {}) {
  const th = o.th ?? 0.32, lift = o.lift ?? 0.1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    const segs = Math.max(1, Math.round(len / (o.seg ?? 5)));
    for (let k = 0; k < segs; k++) {
      const t0 = k / segs, t1 = (k + 1) / segs, tm = (t0 + t1) / 2;
      const mx = ax + (bx - ax) * tm, mz = az + (bz - az) * tm;
      const y = Math.max(yAt(mx, mz), yAt(ax + (bx - ax) * t0, az + (bz - az) * t0), yAt(ax + (bx - ax) * t1, az + (bz - az) * t1)) + lift;
      b.box(mx, y - th, mz, width, th, len / segs + 0.35, color, { ry, ao: 0 });
      if (o.kerb) for (const s of [-1, 1]) b.box(mx + s * width / 2 * Math.cos(ry), y - th + 0.06, mz - s * width / 2 * Math.sin(ry), 0.34, th + 0.16, len / segs + 0.35, o.kerbColor ?? CAT.cobbleDark, { ry, ao: 0 });
    }
  }
}

/**
 * A small human, carved. Cat Island's statuary is bronze; the HUMAN in the
 * bronze cat's paw is pale painted limestone so it reads against the alloy at
 * forty metres — head, hat, arms up, two legs, a coat with a belt.
 * `H` is total height, feet at y, facing `ry`.
 */
export function humanFigure(b, x, y, z, H, o = {}) {
  const ry = o.ry ?? 0, m = o.mat;
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const skin = o.skin ?? 0xf3decb, coat = o.coat ?? 0xe8e2d2, hat = o.hat ?? 0xc0453a, trim = o.trim ?? 0x8a7a5e;
  let p;
  // legs
  for (const sx of [-1, 1]) {
    p = P(sx * 0.10 * H, 0);
    b.cyl(p[0], y, p[1], 0.062 * H, 0.072 * H, 0.40 * H, o.trousers ?? trim, { seg: 7, mat: m, ao: 0 });
    p = P(sx * 0.10 * H, 0.035 * H);
    b.box(p[0], y - 0.005 * H, p[1], 0.10 * H, 0.045 * H, 0.17 * H, 0x4a3a2a, { ry, mat: m, ao: 0 });   // boots
  }
  // body: a coat that tapers, with a belt
  p = P(0, 0);
  b.cyl(p[0], y + 0.38 * H, p[1], 0.135 * H, 0.155 * H, 0.30 * H, coat, { seg: 9, mat: m, ao: 0 });
  b.cyl(p[0], y + 0.66 * H, p[1], 0.115 * H, 0.135 * H, 0.06 * H, coat, { seg: 9, mat: m, ao: 0 });
  b.torus(p[0], y + 0.425 * H, p[1], 0.15 * H, 0.026 * H, trim, { rx: -Math.PI / 2, seg: 12, tseg: 4, mat: m });
  // arms, both raised (the plaque calls this waving)
  for (const sx of [-1, 1]) {
    p = P(sx * 0.145 * H, 0);
    b.cyl(p[0], y + 0.58 * H, p[1], 0.045 * H, 0.052 * H, 0.26 * H, coat, { seg: 6, rz: -sx * 0.62, ry, mat: m, ao: 0 });
    const q = P(sx * 0.30 * H, 0);
    b.cyl(q[0], y + 0.76 * H, q[1], 0.04 * H, 0.045 * H, 0.20 * H, skin, { seg: 6, rz: -sx * 0.22, ry, mat: m, ao: 0 });
    const r = P(sx * 0.345 * H, 0);
    b.sph(r[0], y + 0.965 * H, r[1], 0.055 * H, skin, { seg: 7, rings: 5, mat: m });
  }
  // head + a very small hat
  p = P(0, 0);
  b.cyl(p[0], y + 0.70 * H, p[1], 0.05 * H, 0.06 * H, 0.04 * H, skin, { seg: 7, mat: m, ao: 0 });      // neck
  b.sph(p[0], y + 0.815 * H, p[1], 0.098 * H, skin, { seg: 10, rings: 7, sy: 1.08, mat: m });
  const e = P(0, 0.085 * H);
  for (const sx of [-1, 1]) {
    const q = P(sx * 0.04 * H, 0.082 * H);
    b.sph(q[0], y + 0.835 * H, q[1], 0.018 * H, 0x2a2018, { seg: 6, rings: 4, sz: 0.5, mat: m });
  }
  b.sph(e[0], y + 0.80 * H, e[1], 0.022 * H, o.nose2 ?? 0xdcb79c, { seg: 6, rings: 4, mat: m });
  b.cyl(p[0], y + 0.885 * H, p[1], 0.096 * H, 0.102 * H, 0.018 * H, hat, { seg: 12, mat: m, ao: 0 });   // brim
  b.cyl(p[0], y + 0.90 * H, p[1], 0.068 * H, 0.072 * H, 0.085 * H, hat, { seg: 10, mat: m, ao: 0 });    // crown
  b.torus(p[0], y + 0.915 * H, p[1], 0.073 * H, 0.012 * H, trim, { rx: -Math.PI / 2, seg: 10, tseg: 4, mat: m });
  // a scarf, blowing, because the silhouette needs one asymmetric thing
  if (o.scarf !== false) {
    const q = P(-0.06 * H, -0.10 * H);
    b.box(q[0], y + 0.58 * H, q[1], 0.05 * H, 0.16 * H, 0.06 * H, o.scarfColor ?? 0x3a8f8a, { ry: ry + 0.4, rz: 0.5, mat: m, ao: 0 });
    b.torus(p[0], y + 0.695 * H, p[1], 0.075 * H, 0.022 * H, o.scarfColor ?? 0x3a8f8a, { rx: -Math.PI / 2, seg: 10, tseg: 4, mat: m });
  }
}

/**
 * A proper billboard: two lattice legs with cross-bracing, a framed hoarding
 * with a top rail and a maintenance walkway. A sign on two bare poles reads as
 * a sticker floating over a roof; this reads as a structure.
 */
export function billboard(b, f, lx, lz, y, w, h, cell, o = {}) {
  const { ry } = f, col = o.color ?? 0x4a4238, face = o.face ?? PAL.trim[1];
  const legX = w / 2 - 0.7, legH = o.legH ?? 2.0;
  for (const s of [-1, 1]) {
    const bx = lx + s * legX;
    for (const t of [-0.28, 0.28]) b.box(f.px(bx, lz + t), y, f.pz(bx, lz + t), 0.22, legH + 0.4, 0.22, col, { ry, ao: 0.4, aoBase: y, mat: 'metal' });
    for (let i = 0; i < 3; i++) {                              // X-bracing
      const y0 = y + 0.2 + i * (legH / 3);
      b.box(f.px(bx, lz), y0, f.pz(bx, lz), 0.1, 0.1, 0.68, col, { ry, rx: (i % 2 ? 1 : -1) * 0.7, ao: 0, mat: 'metal' });
    }
    b.box(f.px(bx, lz), y + legH + 0.4, f.pz(bx, lz), 0.26, 0.14, 0.7, col, { ry, ao: 0, mat: 'metal' });
  }
  // the hoarding: a framed board, not a bare quad
  const by = y + legH + 0.5;
  b.box(f.px(lx, lz), by, f.pz(lx, lz), w, h, 0.3, face, { ry, ao: 0 });
  b.box(f.px(lx, lz), by - 0.16, f.pz(lx, lz), w + 0.34, 0.2, 0.5, o.trimColor ?? col, { ry, ao: 0 });
  b.box(f.px(lx, lz), by + h - 0.04, f.pz(lx, lz), w + 0.34, 0.22, 0.5, o.trimColor ?? col, { ry, ao: 0 });
  for (const s of [-1, 1]) b.box(f.px(lx + s * (w / 2 + 0.08), lz), by, f.pz(lx + s * (w / 2 + 0.08), lz), 0.2, h, 0.44, o.trimColor ?? col, { ry, ao: 0 });
  b.sign(cell, f.px(lx, lz + 0.17), by + h / 2, f.pz(lx, lz + 0.17), w - 0.2, h - 0.22, { ry, glow: o.glow });
  if (o.back) b.sign(o.back, f.px(lx, lz - 0.17), by + h / 2, f.pz(lx, lz - 0.17), w - 0.2, h - 0.22, { ry: ry + Math.PI, glow: o.glow });
  // maintenance walkway + gooseneck lamps
  b.box(f.px(lx, lz + 0.42), by - 0.34, f.pz(lx, lz + 0.42), w - 0.5, 0.1, 0.55, col, { ry, ao: 0, mat: 'metal' });
  for (let i = 0; i < Math.max(3, Math.round(w / 3.0)); i++) {
    const gx = lx - w / 2 + w * ((i + 0.5) / Math.max(3, Math.round(w / 3.0)));
    b.box(f.px(gx, lz + 0.62), by - 0.34, f.pz(gx, lz + 0.62), 0.06, 0.5, 0.06, col, { ry, ao: 0, mat: 'metal' });
  }
  if (o.lamps !== false) for (const s of [-1, 1]) {
    const gx = lx + s * (w * 0.28);
    b.cyl(f.px(gx, lz + 0.3), by + h + 0.08, f.pz(gx, lz + 0.3), 0.05, 0.05, 0.6, col, { seg: 5, ry, rx: 0.55, mat: 'metal', ao: 0 });
    b.cone(f.px(gx, lz + 0.68), by + h + 0.5, f.pz(gx, lz + 0.68), 0.24, 0.3, col, { seg: 8, ry, rx: Math.PI - 0.55, ao: 0 });
    b.sph(f.px(gx, lz + 0.68), by + h + 0.34, f.pz(gx, lz + 0.68), 0.13, PAL.amberPale, { seg: 7, rings: 5, mat: 'glow' });
    halo(b, f.px(gx, lz + 0.72), by + h + 0.32, f.pz(gx, lz + 0.72), 0.8);
  }
  if (o.wash !== false) wash(b, f.px(lx, lz + 0.4), by + h * 0.5, f.pz(lx, lz + 0.4), w * 1.02, h * 2.0, ry);
}

/** A small board hung on a wrought bracket with two chains (CLOSED, SORRY, etc). */
export function hangingPlate(b, f, lx, lz, y, w, h, cell, o = {}) {
  const { ry } = f, col = o.color ?? 0x3a3229;
  // the bracket: a stub into the wall, an arm out, a diagonal stay
  b.box(f.px(lx, lz + 0.16), y, f.pz(lx, lz + 0.16), 0.1, 0.1, 0.34, col, { ry, ao: 0, mat: 'metal' });
  b.box(f.px(lx, lz + 0.34), y, f.pz(lx, lz + 0.34), w * 0.9, 0.09, 0.09, col, { ry, ao: 0, mat: 'metal' });
  b.cyl(f.px(lx, lz + 0.26), y - 0.24, f.pz(lx, lz + 0.26), 0.04, 0.04, 0.52, col, { seg: 5, ry, rz: 0.7, mat: 'metal', ao: 0 });
  // two chains: three links each, so the board hangs from something
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    b.torus(f.px(lx + s * w * 0.36, lz + 0.34), y - 0.1 - i * 0.15, f.pz(lx + s * w * 0.36, lz + 0.34), 0.06, 0.018, o.chain ?? col,
      { ry: ry + (i % 2 ? Math.PI / 2 : 0), seg: 8, tseg: 4, mat: 'metal' });
  }
  const by = y - 0.5 - h / 2;
  b.box(f.px(lx, lz + 0.34), by - h / 2, f.pz(lx, lz + 0.34), w + 0.16, h + 0.16, 0.1, o.frame ?? 0x6a5238, { ry, rz: o.rz ?? 0, ao: 0 });
  for (const s of [-1, 1]) b.sign(cell, f.px(lx, lz + 0.34 + s * 0.07), by, f.pz(lx, lz + 0.34 + s * 0.07), w, h, { ry: s > 0 ? ry : ry + Math.PI, rz: (o.rz ?? 0) * s, glow: o.glow });
}

/** A cat folded into a loaf, asleep. Length L, resting on y. Very cheap. */
export function loafCat(b, x, y, z, L, color, o = {}) {
  const ry = o.ry ?? 0, m = o.mat, seg = o.seg ?? 8, rings = o.rings ?? 5;
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let p = P(0, 0);
  b.sph(p[0], y + 0.30 * L, p[1], 0.34 * L, color, { seg, rings, mat: m, sz: 1.35, sy: 0.82 });
  p = P(0, 0.4 * L);
  b.sph(p[0], y + 0.40 * L, p[1], 0.25 * L, color, { seg, rings, mat: m, sy: 0.92 });
  for (const sx of [-1, 1]) {
    const q = P(sx * 0.14 * L, 0.38 * L);
    b.cone(q[0], y + 0.5 * L, q[1], 0.1 * L, 0.17 * L, color, { seg: 5, mat: m, ry: ry + sx * 0.25, rz: -sx * 0.3, ao: 0 });
  }
  // tail curled round the front
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5, a = -0.3 + t * 2.2;
    const q = P(Math.cos(a) * 0.42 * L * (o.tailSide ?? 1), Math.sin(a) * 0.44 * L - 0.1 * L);
    pts.push([q[0], y + 0.09 * L, q[1]]);
  }
  b.tube(pts, 0.075 * L, o.tailColor ?? color, { rseg: 4, seg: 10, mat: m });
}
