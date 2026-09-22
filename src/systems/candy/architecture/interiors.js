// ─────────────────────────────────────────────────────────────────────────────
// INTERIOR KIT — the furniture of Candyland.
//
// Everything here is drawn into a building's INTERIOR builder (E.in), which is
// hidden whenever the player is outside the footprint, so a room costs nothing
// until you are standing in it. Budget discipline: no sphere above 8×6, no
// icing drips, no decorative repetition — a whole one-room home is ~900 tris.
//
// Local space: `frameAt(x, z, rot)` gives p(lx, ly, lz) → world, with +X across
// the room, +Z toward the front door, matching kit's frame().
// ─────────────────────────────────────────────────────────────────────────────
import { C, SPRINKLE, softGlow } from './kit.js';

export function frameAt(x, y, z, rot) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return {
    rot,
    p: (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs],
    /** local yaw → world yaw */
    r: (a = 0) => rot + a,
  };
}

/** Plank floor. Two tones so the room reads as boards, not a slab. */
export function floor(B, F, w, d, o = {}) {
  const n = Math.max(3, Math.round(w / 0.9));
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + (w * (i + 0.5)) / n;
    B.box('matte', w / n - 0.03, 0.14, d, { at: F.p(lx, -0.07, 0), rot: [0, F.rot, 0], color: i % 2 ? (o.a || 0xc79a62) : (o.b || 0xb98a53) });
  }
  // skirting so the floor meets the walls without a light leak
  for (const sz of [-1, 1]) B.box('matte', w, 0.22, 0.1, { at: F.p(0, 0.11, sz * (d / 2 - 0.06)), rot: [0, F.rot, 0], color: o.skirt || C.icing });
  for (const sx of [-1, 1]) B.box('matte', 0.1, 0.22, d, { at: F.p(sx * (w / 2 - 0.06), 0.11, 0), rot: [0, F.rot, 0], color: o.skirt || C.icing });
}

/**
 * A gumdrop bed: a licorice frame, a domed gumdrop mattress, a pillow.
 * `s` scales the whole thing (the children's beds are 0.7).
 */
export function gumdropBed(B, F, lx, lz, a, s = 1, color = C.pink) {
  const w = 1.15 * s, len = 2.1 * s, hy = 0.34 * s;
  const rot = F.r(a);
  const at = (dx, dy, dz) => F.p(lx + dx * Math.cos(a) + dz * Math.sin(a), dy, lz - dx * Math.sin(a) + dz * Math.cos(a));
  B.box('licorice', w + 0.14, hy, len + 0.14, { at: at(0, hy / 2, 0), rot: [0, rot, 0], color: C.licoriceSoft });
  for (const sz of [-1, 1]) B.box('licorice', w + 0.2, 0.42 * s, 0.12, { at: at(0, hy + 0.16 * s, sz * (len / 2 + 0.02)), rot: [0, rot, 0], color: C.licorice });
  // the mattress is one big gumdrop
  B.sph('gloss', w * 0.62, 9, 6, { at: at(0, hy + 0.1 * s, 0), scale: [1, 0.5, len / (w * 1.24)], color });
  B.sph('icing', 0.28 * s, 8, 6, { at: at(0, hy + 0.28 * s, -len * 0.33), scale: [1.5, 0.55, 1], color: C.cream });
  return { x: at(0, 0, 0)[0], z: at(0, 0, 0)[2], r: Math.max(w, len) * 0.45 };
}

/**
 * A wafer table with cookie cutters laid out on it. The cutters are
 * unmistakably person-shaped, and that is the joke.
 */
export function waferTable(B, F, lx, lz, a, o = {}) {
  const w = o.w || 1.9, d = o.d || 1.1, hy = o.h || 0.78;
  const rot = F.r(a);
  const at = (dx, dy, dz) => F.p(lx + dx * Math.cos(a) + dz * Math.sin(a), dy, lz - dx * Math.sin(a) + dz * Math.cos(a));
  B.waffleBox(w, 0.11, d, { at: at(0, hy, 0), rot: [0, rot, 0], color: C.waferPale });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.box('licorice', 0.11, hy, 0.11, { at: at(sx * (w / 2 - 0.16), hy / 2, sz * (d / 2 - 0.14)), rot: [0, rot, 0], color: C.licorice });
  }
  // the cutters
  for (let i = 0; i < (o.cutters ?? 2); i++) {
    const cx = -w * 0.26 + i * w * 0.32;
    cookieCutter(B, at(cx, hy + 0.07, 0.02), rot + (i % 2 ? 0.5 : -0.35), o.cutterColor || 0xd9d3e8, 0.9 - i * 0.08);
  }
  if (o.bowl !== false) {
    B.sph('gloss', 0.2, 8, 6, { at: at(w * 0.3, hy + 0.14, 0), scale: [1, 0.6, 1], color: C.sour });
    B.tor('icing', 0.21, 0.045, 5, 12, { at: at(w * 0.3, hy + 0.16, 0), rot: [Math.PI / 2, 0, 0], color: C.icing });
  }
  return { x: at(0, 0, 0)[0], z: at(0, 0, 0)[2], r: Math.max(w, d) * 0.5 };
}

/** A flat person-shaped cutter: head, body, two arms, two legs. 6 thin boxes. */
export function cookieCutter(B, p, rot, color, s = 1) {
  const T = 0.045;
  const put = (dx, dz, w, d) => B.box('matte', w * s, T, d * s, { at: [p[0] + dx * s * Math.cos(rot) + dz * s * Math.sin(rot), p[1], p[2] - dx * s * Math.sin(rot) + dz * s * Math.cos(rot)], rot: [0, rot, 0], color });
  put(0, -0.2, 0.2, 0.2);      // head
  put(0, 0.05, 0.26, 0.34);    // body
  put(-0.22, 0.02, 0.2, 0.09); // arms
  put(0.22, 0.02, 0.2, 0.09);
  put(-0.08, 0.32, 0.09, 0.24); // legs
  put(0.08, 0.32, 0.09, 0.24);
}

/** A fridge with a padlock that is much too good for a fridge. */
export function fridge(B, F, lx, lz, a, o = {}) {
  const w = 0.92, d = 0.72, h = 1.85;
  const rot = F.r(a);
  const at = (dx, dy, dz) => F.p(lx + dx * Math.cos(a) + dz * Math.sin(a), dy, lz - dx * Math.sin(a) + dz * Math.cos(a));
  B.box('matte', w, h, d, { at: at(0, h / 2, 0), rot: [0, rot, 0], color: o.color || 0xe8eef0 });
  B.box('matte', w + 0.04, 0.06, d + 0.04, { at: at(0, h * 0.62, 0), rot: [0, rot, 0], color: 0xb9c2c8 });
  B.box('matte', 0.06, h * 0.5, 0.07, { at: at(w * 0.36, h * 0.3, d / 2 + 0.02), rot: [0, rot, 0], color: 0x9aa4ab });
  // hasp + padlock
  B.box('matte', 0.2, 0.1, 0.06, { at: at(-w * 0.1, h * 0.34, d / 2 + 0.03), rot: [0, rot, 0], color: 0x7d838a });
  B.box('gloss', 0.17, 0.21, 0.1, { at: at(-w * 0.1, h * 0.26, d / 2 + 0.07), rot: [0, rot, 0], color: 0xe0b23a });
  B.tor('gloss', 0.075, 0.028, 5, 10, { at: at(-w * 0.1, h * 0.36, d / 2 + 0.07), rot: [0, rot, 0], color: 0xcfd6da, arc: Math.PI });
  // a chain, for a fridge
  for (let i = 0; i < 5; i++) B.tor('matte', 0.075, 0.022, 4, 8, { at: at(-w * 0.34 + i * 0.16, h * 0.52, d / 2 + 0.04), rot: [0, rot, i % 2 ? 1.57 : 0], color: 0x9aa4ab });
  if (o.note !== false) B.signQuad('houserules', 0.38, 0.28, { at: at(w * 0.12, h * 0.78, d / 2 + 0.035), rot: [0, rot, 0.08] });
  return { x: at(0, 0, 0)[0], z: at(0, 0, 0)[2], r: 0.6 };
}

/** A framed portrait hung on a wall. `id` = a portraitN atlas cell. */
export function portrait(B, F, id, lx, ly, lz, a, w = 0.8, h = 0.8) {
  const rot = F.r(a);
  const at = (dx, dy, dz) => F.p(lx + dx * Math.cos(a) + dz * Math.sin(a), dy, lz - dx * Math.sin(a) + dz * Math.cos(a));
  B.box('matte', w + 0.12, h + 0.12, 0.06, { at: at(0, ly, 0), rot: [0, rot, 0], color: 0x6b4126 });
  B.signQuad(id, w, h, { at: at(0, ly, 0.045), rot: [0, rot, 0] });
}

/**
 * A rug that is, unmistakably, a marshmallow sheep — flattened. Nobody in the
 * house will meet your eye about it.
 */
export function sheepRug(B, F, lx, lz, a, s = 1) {
  const rot = F.r(a);
  const at = (dx, dy, dz) => F.p(lx + dx * Math.cos(a) + dz * Math.sin(a), dy, lz - dx * Math.sin(a) + dz * Math.cos(a));
  B.sph('icing', 0.95 * s, 9, 6, { at: at(0, 0.035, 0), scale: [1.15, 0.045, 0.85], color: 0xfff6ee });
  for (let i = 0; i < 7; i++) {   // a fleece of squashed puffs
    const an = (i / 7) * Math.PI * 2;
    B.sph('icing', 0.3 * s, 7, 5, { at: at(Math.cos(an) * 0.72 * s, 0.05, Math.sin(an) * 0.5 * s), scale: [1, 0.13, 1], color: 0xfffaf2 });
  }
  // head, splayed, with X eyes
  B.sph('matte', 0.3 * s, 8, 6, { at: at(0, 0.05, -0.85 * s), scale: [1, 0.13, 1.15], color: 0x3a3048 });
  for (const sx of [-1, 1]) for (const d of [-1, 1]) {
    B.box('matte', 0.11 * s, 0.02, 0.03 * s, { at: at(sx * 0.11 * s, 0.075, -0.92 * s), rot: [0, rot + d * 0.78, 0], color: 0xfffaf2 });
  }
  // four little legs, pointing at the four corners of the room
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.cyl('matte', 0.055 * s, 0.05 * s, 0.42 * s, 5, { at: at(sx * 0.62 * s, 0.045, sz * 0.42 * s), rot: [Math.PI / 2, rot + sx * sz * 0.6, 0], color: 0x3a3048 });
  }
}

/** A ceiling lamp: a hanging gumdrop, an emissive globe, a soft bloom. */
export function ceilingLamp(B, F, lx, ly, lz, o = {}) {
  const p = F.p(lx, ly, lz);
  B.cyl('matte', 0.035, 0.035, o.drop || 0.5, 5, { at: [p[0], p[1] + (o.drop || 0.5) / 2 + 0.26, p[2]], color: C.licorice });
  B.sph('matte', 0.3, 8, 6, { at: [p[0], p[1] + 0.3, p[2]], scale: [1, 0.55, 1], color: o.hood || C.icingPink });
  B.sph('glowWarm', 0.26, 9, 7, { at: [p[0], p[1], p[2]], color: o.color || C.lampAmber });
  // ×0.55. Round 3: "interior bloom blowing out corners in the house interiors."
  // These rooms are 5 × 4 with a 2.5 ceiling, so a 2.6-unit additive halo hung
  // in the middle of one reaches the skirting board in every direction and the
  // whole room washes to white. The globe is emissive on its own account; the
  // bloom only has to say "there is a light here".
  softGlow(B, p[0], p[1], p[2], (o.glow ?? 2.0) * 0.55);
  return { x: p[0], y: p[1], z: p[2] };
}

/** A stubby three-legged stool. */
export function stool(B, F, lx, lz, color = C.wafer) {
  const p = F.p(lx, 0, lz);
  B.cyl('matte', 0.26, 0.24, 0.1, 9, { at: [p[0], 0.52 + p[1], p[2]], color });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    B.cyl('licorice', 0.05, 0.06, 0.52, 5, { at: [p[0] + Math.cos(a) * 0.16, p[1] + 0.26, p[2] + Math.sin(a) * 0.16], rot: [Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18], color: C.licorice });
  }
}

/** A wall shelf with a row of jars. */
export function shelf(B, F, lx, ly, lz, a, w = 1.3, n = 4) {
  const rot = F.r(a);
  const at = (dx, dy, dz) => F.p(lx + dx * Math.cos(a) + dz * Math.sin(a), dy, lz - dx * Math.sin(a) + dz * Math.cos(a));
  B.waffleBox(w, 0.07, 0.28, { at: at(0, ly, 0), rot: [0, rot, 0], color: C.wafer });
  for (let i = 0; i < n; i++) {
    const t = -w / 2 + (w * (i + 0.5)) / n;
    B.cyl('gloss', 0.11, 0.12, 0.26, 7, { at: at(t, ly + 0.17, 0), rot: [0, rot, 0], color: SPRINKLE[i % SPRINKLE.length] });
    B.sph('icing', 0.1, 6, 5, { at: at(t, ly + 0.31, 0), scale: [1, 0.5, 1], color: C.icing });
  }
}

/** A bin of hats. One shoe. No coats. */
export function hatBin(B, F, lx, lz, a) {
  const rot = F.r(a);
  const at = (dx, dy, dz) => F.p(lx + dx * Math.cos(a) + dz * Math.sin(a), dy, lz - dx * Math.sin(a) + dz * Math.cos(a));
  B.waffleBox(1.15, 0.62, 0.85, { at: at(0, 0.31, 0), rot: [0, rot, 0], color: C.wafer });
  B.box('licorice', 1.2, 0.08, 0.9, { at: at(0, 0.63, 0), rot: [0, rot, 0], color: C.licorice });
  const HAT = [0xf5294f, 0x2f95ff, 0xffc81e, 0x3fd45f, 0xa93cff];
  for (let i = 0; i < 5; i++) {
    const dx = -0.34 + (i % 3) * 0.34, dz = -0.18 + Math.floor(i / 3) * 0.3, ry = i * 1.1;
    B.cyl('matte', 0.14, 0.16, 0.16, 8, { at: at(dx, 0.78 + (i % 2) * 0.1, dz), rot: [0.4 * (i % 2 ? 1 : -1), rot + ry, 0], color: HAT[i] });
    B.cyl('matte', 0.3, 0.3, 0.04, 10, { at: at(dx, 0.7 + (i % 2) * 0.1, dz), rot: [0.4 * (i % 2 ? 1 : -1), rot + ry, 0], color: HAT[i] });
  }
  B.signQuad('lostfound_in', 0.7, 0.35, { at: at(0, 0.42, 0.44), rot: [0, rot, 0] });
  return { x: at(0, 0, 0)[0], z: at(0, 0, 0)[2], r: 0.7 };
}

/** A soft additive bloom with no geometry of its own (re-exported for rooms). */
export function softLight(B, x, y, z, size = 2.2) { softGlow(B, x, y, z, size); }
