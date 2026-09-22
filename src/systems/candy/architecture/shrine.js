// THE SOUR SHRINE — landmark sour_shrine (-218, -44), label '???'.
// A ring of giant sour-crusted gummy figures facing a stone with a very cute,
// very wrong face. At its feet: a lost & found nobody has claimed.
import { C, SPRINKLE, fenceLine } from './kit.js';

const X = -218, Z = -44;
const SOUR = [0xd6e87a, 0xf0a8c8, 0xa8d4f0, 0xf0cf8a, 0xc9a8e8, 0xef9494, 0xa8e8c0, 0xe8e0a0];

export function buildShrine(A) {
  const { B, world } = A;
  const y = world.height(X, Z);
  const r = A.rng('shrine');
  A.mark('sour_shrine', X, y, Z);

  // ── a dark sugar-crusted dais, so the clearing reads as a PLACE ───────────
  // stands PROUD of the grass (top at y+0.95) — at 0.43 it vanished under the
  // vegetation and the clearing stopped reading as a built place
  B.cyl('matteFlat', 9.0, 9.6, 1.5, 26, { at: [X, y + 0.2, Z], color: 0x4a4258 });
  B.cyl('matteFlat', 8.1, 8.1, 1.5, 26, { at: [X, y + 0.45, Z], color: 0x5d5473 });
  for (let i = 0; i < 16; i++) {   // radial sugar veins
    const a = (i / 16) * Math.PI * 2;
    B.box('matteFlat', 7.0, 0.12, 0.44, { at: [X + Math.cos(a) * 4.3, y + 0.94, Z + Math.sin(a) * 4.3], rot: [0, -a, 0], color: 0xa39cba });
  }
  for (let i = 0; i < 24; i++) {   // a sugar-crust kerb, so the edge has a lip
    const a = (i / 24) * Math.PI * 2;
    B.ico('matteFlat', 0.55, 0, { at: [X + Math.cos(a) * 9.3, y + 0.9, Z + Math.sin(a) * 9.3], rot: [0, a, 0.2], scale: [1, 0.7, 1], color: 0xd9d2e8 });
  }
  A.deckRing(X, Z, 0, 8.6, y + 0.95);

  // ── the stone ─────────────────────────────────────────────────────────────
  B.cyl('matteFlat', 3.2, 4.0, 1.1, 9, { at: [X, y + 1.35, Z], color: C.stoneDark });
  B.ico('matteFlat', 2.7, 0, { at: [X, y + 3.3, Z], scale: [1.0, 1.7, 0.85], rot: [0, 0.4, 0.05], color: C.stone });
  B.ico('matteFlat', 1.5, 0, { at: [X + 0.5, y + 6.1, Z - 0.2], scale: [1, 0.8, 0.85], rot: [0, 1.1, -0.18], color: C.stone });
  // the face sits PROUD of the stone: an icosahedron of circumradius 2.7 has an
  // inradius of only ~2.04 (×0.85 in z ⇒ 1.73), so a quad at Z+1.98 is buried
  // inside the rock on some facets
  B.signQuad('shrine_face', 3.3, 3.3, { at: [X, y + 3.5, Z + 2.34], rot: [0.05, 0, 0] });
  // sugar crust on the stone
  for (let i = 0; i < 46; i++) {
    const a = r.range(0, 6.283), h = r.range(0.8, 6.4), rr = (h > 5 ? 1.3 : 2.1) + r.range(-0.3, 0.5);
    A.inst.grains.push({ x: X + Math.cos(a) * rr, y: y + h, z: Z + Math.sin(a) * rr, s: r.range(0.09, 0.24), ry: r.range(0, 3), color: 0xf3f1ff });
  }

  // ── the ring of figures: taller than the forest, facing inward ────────────
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 1.178;   // phase so the gap faces the stone's face
    const rad = 6.4 + r.range(-0.35, 0.35);
    const fx = X + Math.cos(a) * rad, fz = Z + Math.sin(a) * rad;
    const fy = rad < 8.6 ? y + 0.95 : world.height(fx, fz) + 0.42;   // stand ON the dais
    gummyFigure(A, fx, fy, fz, Math.atan2(X - fx, Z - fz), r.range(5.4, 7.0), SOUR[i % SOUR.length], r);
    A.collide(fx, fz, 1.7);
  }

  // ── small sugar-crusted stones between them ───────────────────────────────
  for (let i = 0; i < 14; i++) {
    const a = r.range(0, 6.283), rad = r.range(9.8, 13.5);
    const px = X + Math.cos(a) * rad, pz = Z + Math.sin(a) * rad;
    const s = r.range(0.4, 1.1);
    B.ico('matteFlat', s, 0, { at: [px, world.height(px, pz) + s * 0.5, pz], rot: [r.range(0, 3), r.range(0, 3), r.range(0, 3)], color: r.chance(0.5) ? C.stone : C.stoneDark });
  }

  // ── the lost & found ──────────────────────────────────────────────────────
  buildLeftovers(A, y, r);

  // ── the sign, leaning, at the path end ────────────────────────────────────
  const sy = world.height(X + 2.0, Z + 8.6);
  for (const s of [-1, 1]) B.cyl('matte', 0.14, 0.16, 2.8, 6, { at: [X + 2.0 + s * 1.6, sy + 1.4, Z + 8.6 + s * 0.15], rot: [0.05, 0, s * 0.07], color: C.licorice });
  B.box('matte', 3.6, 1.5, 0.16, { at: [X + 2.0, sy + 2.5, Z + 8.6], rot: [0, 0.08, 0.03], color: C.licorice });
  B.signQuad('shrine', 3.4, 1.36, { at: [X + 2.0, sy + 2.5, Z + 8.7], rot: [0, 0.08, 0.03] });
  A.readSign('shrine', X + 2.0, Z + 9.6, 3.4, 'Read: ???');

  // glowing eyes in the undergrowth behind the ring (there are always more)
  for (let i = 0; i < 5; i++) {
    const a = r.range(0, 6.283), rad = r.range(12, 17);
    const px = X + Math.cos(a) * rad, pz = Z + Math.sin(a) * rad;
    const py = world.height(px, pz) + r.range(0.6, 1.3);
    for (const s of [-1, 1]) B.sph('glowSour', 0.11, 7, 5, { at: [px + s * 0.22, py, pz], color: 0xd8ff7a });
  }

  fenceLine(B, [[X + 6.5, Z + 10.5], [X + 10.5, Z + 8.0]], (px, pz) => world.height(px, pz), { h: 0.75, color: C.licorice, tipColor: 0x9bd63a, A });

  A.interact({
    id: 'candy_shrine_stone', x: X, z: Z + 4.2, r: 3.4, label: 'Approach the stone',
    onInteract(ctx) {
      ctx.systems.story?.set('found_sour_shrine', true);
      const lines = [
        'The face is beaming. It has far too many teeth and all of them are very clean.',
        'Wax has run down the stone in eight lines, one from each figure. It is not wax.',
        'Carved underneath, in a careful childish hand: "THANK YOU FOR COMING TO CANDYLAND".',
      ];
      const n = (ctx.systems.story?.get('shrine_reads') || 0) % lines.length;
      ctx.systems.story?.set('shrine_reads', n + 1);
      ctx.systems.ui?.say(lines[n], { speaker: 'The Stone', duration: 7 });
      ctx.systems.particles?.burst?.({ x: X, y: y + 3.2, z: Z + 1.4, count: 18, color: [0xd8ff7a, 0xf3f1ff], speed: 1.8, life: 1.4, size: 0.16, gravity: -1.4, spread: 2.4 });
    },
  });
  A.collide(X, Z, 3.0);
  return {};
}

// ── one giant sour gummy ────────────────────────────────────────────────────
function gummyFigure(A, x, y, z, rotY, h, color, r) {
  const { B } = A;
  const s = h / 4.2;
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  const P = (lx, ly, lz) => [x + (lx * cs + lz * sn) * s, y + ly * s, z + (-lx * sn + lz * cs) * s];
  const M = 'matteFlat';
  // legs
  for (const sx of [-1, 1]) {
    B.cyl(M, 0.42, 0.52, 1.15, 8, { at: P(sx * 0.6, 0.58, 0), rot: [0, rotY, sx * 0.06], scale: s, color });
    B.sph(M, 0.48, 8, 6, { at: P(sx * 0.62, 0.3, 0.12), scale: [s, s * 0.7, s * 1.1], color });
  }
  // body
  B.sph(M, 1.25, 11, 9, { at: P(0, 2.0, 0), scale: [s, s * 1.15, s * 0.9], color });
  B.sph('icing', 0.9, 9, 7, { at: P(0, 1.6, 0.7), scale: [s, s * 0.85, s * 0.55], color: 0xf6f4ff });  // sugar belly
  // arms
  for (const sx of [-1, 1]) {
    B.cyl(M, 0.32, 0.4, 1.3, 7, { at: P(sx * 1.25, 2.2, 0), rot: [0, rotY, sx * 0.55], scale: s, color });
    B.sph(M, 0.4, 8, 6, { at: P(sx * 1.6, 1.65, 0.1), scale: s, color });
  }
  // head
  B.sph(M, 1.0, 12, 10, { at: P(0, 3.5, 0), scale: [s, s * 0.95, s * 0.92], color });
  for (const sx of [-1, 1]) B.sph(M, 0.34, 8, 6, { at: P(sx * 0.72, 4.15, -0.1), scale: s, color });
  B.sph(M, 0.42, 8, 6, { at: P(0, 3.25, 0.78), scale: [s * 1.1, s * 0.8, s], color: 0xfff6ff });
  B.sph('matteFlat', 0.14, 6, 5, { at: P(0, 3.42, 1.06), scale: s, color: 0x2b2438 });
  // eyes (they glow at night)
  for (const sx of [-1, 1]) {
    B.sph('matteFlat', 0.26, 8, 6, { at: P(sx * 0.4, 3.75, 0.78), scale: s, color: 0x2b2438 });
    B.sph('glowSour', 0.15, 8, 6, { at: P(sx * 0.4, 3.78, 0.9), scale: s, color: 0xe8ff9a });
  }
  // a smile, because they are friendly
  B.tor('matteFlat', 0.3, 0.07, 5, 10, { at: P(0, 3.16, 0.92), rot: [0, rotY, Math.PI], scale: [s, s * 0.6, s], color: 0x2b2438, arc: Math.PI });
  // sugar crust grains all over
  for (let i = 0; i < 22; i++) {
    const a = r.range(0, 6.283), hh = r.range(0.4, 4.4), rr = (hh > 3 ? 1.05 : 1.35) + r.range(-0.15, 0.25);
    A.inst.grains.push({
      x: x + Math.cos(a) * rr * s, y: y + hh * s, z: z + Math.sin(a) * rr * s,
      s: r.range(0.06, 0.16), ry: r.range(0, 3), color: 0xf6f4ff,
    });
  }
}

// ── gnawed leftovers (cartoon, never graphic) ───────────────────────────────
function buildLeftovers(A, y, r) {
  const { B, world } = A;
  const at = (dx, dz) => {
    const onDais = Math.hypot(dx, dz) < 8.0;
    return [X + dx, onDais ? y + 0.95 : world.height(X + dx, Z + dz), Z + dz];
  };
  // ONE SNEAKER
  {
    const [px, py, pz] = at(3.1, 3.4);
    B.box('matte', 1.0, 0.42, 2.2, { at: [px, py + 0.2, pz], rot: [0, 0.6, 0.1], color: 0xe8eef5 });
    B.sph('matte', 0.55, 9, 7, { at: [px + 0.45, py + 0.35, pz - 0.75], scale: [0.95, 0.7, 1.1], rot: [0, 0.6, 0], color: 0xe8eef5 });
    B.box('matte', 1.05, 0.2, 2.25, { at: [px, py + 0.06, pz], rot: [0, 0.6, 0.1], color: 0xd94f7a });
    B.box('matte', 0.85, 0.7, 0.9, { at: [px - 0.3, py + 0.55, pz + 0.7], rot: [0, 0.6, 0.15], color: 0xe8eef5 });
    for (let i = 0; i < 3; i++) B.cyl('matte', 0.05, 0.05, 0.9, 5, { at: [px - 0.25, py + 0.6 + i * 0.12, pz + 0.45 - i * 0.2], rot: [0, 0.6, Math.PI / 2], color: 0xfff4e2 });
    B.sph('matteFlat', 0.3, 7, 6, { at: [px + 0.2, py + 0.5, pz + 1.15], scale: [1, 1, 0.6], color: 0x3a2430 }); // a bite
  }
  // A HAT
  {
    const [px, py, pz] = at(-3.6, 3.0);
    B.cyl('matte', 1.5, 1.55, 0.16, 14, { at: [px, py + 0.12, pz], rot: [0.1, 0.3, 0.12], color: 0x8a6a4a });
    B.cyl('matte', 0.85, 0.9, 0.9, 12, { at: [px + 0.06, py + 0.6, pz], rot: [0.1, 0.3, 0.12], color: 0x8a6a4a });
    B.tor('matte', 0.9, 0.1, 5, 12, { at: [px + 0.06, py + 0.28, pz], rot: [Math.PI / 2 + 0.1, 0.3, 0], color: 0x4a3a2a });
    B.box('matteFlat', 0.7, 0.5, 0.5, { at: [px - 0.7, py + 0.7, pz + 0.4], rot: [0, 0.6, 0.3], color: 0x6a5236 });
  }
  // A SUITCASE, still packed
  {
    const [px, py, pz] = at(0.4, 5.6);
    B.box('matte', 2.4, 1.5, 0.9, { at: [px, py + 0.75, pz], rot: [0, -0.35, 0.06], color: 0x7a4a2a });
    B.box('matte', 2.45, 0.16, 0.95, { at: [px, py + 0.75, pz], rot: [0, -0.35, 0.06], color: 0x3a2418 });
    for (const sx of [-0.7, 0.7]) B.box('matte', 0.2, 1.55, 0.98, { at: [px + sx * Math.cos(-0.35), py + 0.75, pz - sx * Math.sin(-0.35)], rot: [0, -0.35, 0.06], color: 0x3a2418 });
    B.tor('matte', 0.28, 0.07, 5, 10, { at: [px, py + 1.6, pz], rot: [Math.PI / 2, -0.35, 0], color: 0x3a2418 });
    B.box('matte', 0.5, 0.4, 0.1, { at: [px + 0.55, py + 0.4, pz + 0.5], rot: [0, -0.35, 0.15], color: 0xfff4e2 }); // a luggage tag
  }
  // a little pile of sunglasses, buttons and one map, tidily stacked
  const stack = at(-1.8, 6.4);
  B.box('matte', 1.4, 0.1, 1.0, { at: [stack[0], stack[1] + 0.06, stack[2]], rot: [0, 0.7, 0], color: 0xfff4e2 });
  B.box('matte', 1.0, 0.08, 0.5, { at: [stack[0], stack[1] + 0.16, stack[2]], rot: [0, 0.2, 0], color: 0x2b2438 });
  B.sph('gloss', 0.14, 7, 6, { at: [stack[0] + 0.4, stack[1] + 0.3, stack[2] + 0.2], color: 0xcfcfe0 });
  // lost & found sign over it
  B.cyl('matte', 0.08, 0.09, 1.7, 5, { at: [stack[0] - 1.0, stack[1] + 0.85, stack[2] + 0.4], rot: [0.06, 0, 0.1], color: C.licorice });
  B.signQuad('lost_found', 1.15, 0.85, { at: [stack[0] - 1.05, stack[1] + 1.95, stack[2] + 0.45], rot: [0, 0.35, 0.1] });
  A.readSign('lost_found', stack[0] - 1.0, stack[2] + 1.3, 2.6, 'Read: Lost & Found');
}
