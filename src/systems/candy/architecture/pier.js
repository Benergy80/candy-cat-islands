// SUGAR PIER — landmark candy_dock (-42, 22). The player's first sight of
// Candyland: a candy-cane pier out over the sea toward the ferry route, a
// striped ticket booth, and a very cheerful welcome arch with a secret.
import { C, SPRINKLE, lamppost, bench, icingDrip, door, doorway } from './kit.js';
import * as IN from './interiors.js';
import { railRun, caneStyle } from './rails.js';

const Z = 22;               // the pier runs east along z = 22
const X_ROOT = -47.5;       // shore end of the deck
const X_HEAD = -27.6;       // seaward end (ferry route starts at -30, 22)
const X_WIDE = -33.6;       // head platform begins
const HALF = 2.8, HALF_WIDE = 4.6;

export function buildPier(A) {
  const { B, world } = A;
  const shoreY = world.height(-46, Z);
  const deck = shoreY + 0.62;
  A.mark('sugar_pier', (X_ROOT + X_HEAD) / 2, deck, Z);

  // ── substructure: licorice stringers + candy-cane piles ───────────────────
  for (const s of [-1, 1]) {
    B.box('licorice', X_HEAD - X_ROOT, 0.34, 0.3, { at: [(X_ROOT + X_HEAD) / 2, deck - 0.26, Z + s * 2.2], color: C.licorice });
  }
  B.box('licorice', X_HEAD - X_WIDE, 0.34, 0.3, { at: [(X_WIDE + X_HEAD) / 2, deck - 0.26, Z + 0], color: C.licorice });
  for (let x = X_ROOT + 0.8; x < X_HEAD; x += 3.3) {
    const wide = x > X_WIDE;
    for (const s of [-1, 1]) {
      const pz = Z + s * (wide ? HALF_WIDE - 0.5 : HALF - 0.4);
      const g = world.height(x, pz);
      const bot = Math.min(g - 0.4, -1.6);
      B.cyl('licorice', 0.28, 0.32, deck - bot, 8, { at: [x, (deck + bot) / 2, pz], color: C.licoriceSoft });
    }
  }

  // ── deck planks (wafer) ───────────────────────────────────────────────────
  for (let x = X_ROOT; x < X_HEAD; x += 0.92) {
    const wide = x > X_WIDE;
    const hw = wide ? HALF_WIDE : HALF;
    B.waffleBox(0.78, 0.17, hw * 2, { at: [x + 0.39, deck - 0.08, Z], color: (Math.round(x * 10) % 3 === 0) ? C.wafer : C.waferPale });
  }
  // deck edge trim
  for (const s of [-1, 1]) {
    B.box('matte', X_WIDE - X_ROOT, 0.12, 0.16, { at: [(X_ROOT + X_WIDE) / 2, deck + 0.04, Z + s * HALF], color: C.licoriceRed });
    B.box('matte', X_HEAD - X_WIDE, 0.12, 0.16, { at: [(X_WIDE + X_HEAD) / 2, deck + 0.04, Z + s * HALF_WIDE], color: C.licoriceRed });
  }
  B.box('matte', 0.16, 0.12, HALF_WIDE * 2, { at: [X_HEAD, deck + 0.04, Z], color: C.licoriceRed });
  A.deckRect(X_ROOT, X_WIDE, Z - HALF, Z + HALF, deck);
  A.deckRect(X_WIDE, X_HEAD, Z - HALF_WIDE, Z + HALF_WIDE, deck);

  // shore ramp so the deck meets the beach
  const rampX0 = X_ROOT - 3.2;
  const gA = world.height(rampX0, Z);
  for (let i = 0; i < 4; i++) {
    const t0 = i / 4, t1 = (i + 1) / 4;
    const x0 = rampX0 + (X_ROOT - rampX0) * t0, x1 = rampX0 + (X_ROOT - rampX0) * t1;
    B.waffleBox(x1 - x0 + 0.05, 0.17, HALF * 2, { at: [(x0 + x1) / 2, gA + (deck - gA) * ((t0 + t1) / 2) - 0.08, Z], color: C.waferPale });
  }
  A.deckRamp(rampX0, X_ROOT, Z - HALF, Z + HALF, gA, deck, 'x');

  // ── candy-cane posts + rope swags ─────────────────────────────────────────
  const postX = [-46.2, -42.4, -38.6, -34.8, -31, -28.2];
  const topY = deck + 1.55;
  postX.forEach((x, i) => {
    const wide = x > X_WIDE;
    for (const s of [-1, 1]) {
      const pz = Z + s * (wide ? HALF_WIDE - 0.28 : HALF - 0.22);
      B.stripeCyl(0.19, 0.21, 2.1, { at: [x, deck + 1.0, pz], variant: 0, seg: 9 });
      B.sph('gloss', 0.3, 10, 8, { at: [x, topY + 0.18, pz], color: SPRINKLE[i % SPRINKLE.length] });
    }
  });
  for (let i = 0; i < postX.length - 1; i++) {
    const mx = (postX[i] + postX[i + 1]) / 2, r = (postX[i + 1] - postX[i]) / 2;
    const wide = mx > X_WIDE;
    for (const s of [-1, 1]) {
      const pz = Z + s * (wide ? HALF_WIDE - 0.28 : HALF - 0.22);
      B.tor('matte', r, 0.055, 5, 12, { at: [mx, topY + 0.1, pz], rot: [0, 0, Math.PI], scale: [1, 0.3, 1], color: C.licorice, arc: Math.PI });
    }
  }

  pierRails(A, deck, postX, rampX0, gA);

  // ── mooring gumdrops + crates at the head ─────────────────────────────────
  for (const s of [-1, 1]) {
    const gz = Z + s * (HALF_WIDE - 1.1);
    B.cyl('gloss', 0.52, 0.66, 1.0, 10, { at: [X_HEAD + 0.9, deck + 0.5, gz], color: s > 0 ? C.green : C.purple });
    B.sph('gloss', 0.52, 10, 8, { at: [X_HEAD + 0.9, deck + 1.0, gz], color: s > 0 ? C.green : C.purple });
  }
  const r = A.rng('pier');
  for (let i = 0; i < 4; i++) {
    const x = -45 + i * 1.4 + r.range(-0.2, 0.2), z = Z - 1.9 + (i % 2) * 3.8;
    B.waffleBox(1.0, 0.9, 1.0, { at: [x, deck + 0.46, z], rot: [0, r.range(-0.4, 0.4), 0], color: C.wafer });
    B.sph('gloss', 0.34, 9, 7, { at: [x, deck + 1.05, z], color: SPRINKLE[i % SPRINKLE.length] });
    B.sph('gloss', 0.26, 9, 7, { at: [x + 0.3, deck + 0.99, z + 0.22], color: SPRINKLE[(i + 2) % SPRINKLE.length] });
  }
  // a donut life-ring on the rail
  B.tor('gloss', 0.6, 0.24, 8, 14, { at: [-39.6, deck + 1.3, Z + HALF - 0.05], rot: [0, Math.PI / 2, 0], color: C.pink });

  // ── lampposts (+ one point light) ─────────────────────────────────────────
  lamppost(B, -41.0, deck, Z - HALF + 0.5, { h: 3.6 });
  const pierLamp = lamppost(B, -41.0, deck, Z + HALF - 0.5, { h: 3.6 });
  lamppost(B, -30.2, deck, Z - HALF_WIDE + 0.7, { h: 3.6 });
  lamppost(B, -30.2, deck, Z + HALF_WIDE - 0.7, { h: 3.6 });
  // the pier's one PointLight hangs on an actual lamp head (r170 units:
  // intensity ~85 at distance 16, decay 2)
  A.light(pierLamp.x, pierLamp.y + 0.1, pierLamp.z, 0xffcf8a, 16, 85);

  // ── bench looking out to sea ──────────────────────────────────────────────
  bench(B, -36.6, deck, Z + HALF - 0.75, Math.PI, { A });
  bench(B, -36.6, deck, Z - HALF + 0.75, 0, { A });

  // ── ticket booth ──────────────────────────────────────────────────────────
  buildBooth(A, -43.6, 30.4, Math.PI);

  // ── welcome arch across the path ──────────────────────────────────────────
  buildWelcome(A);

  // ── the Sugar Pier board ─────────────────────────────────────────────────
  // Round 2: this was a 1.6 × 1.1 quad on one post, yawed −1.29 — which is the
  // direction the player is WALKING, so the iso camera (always behind and to
  // the south-east) saw nothing but its edge. It is now a proper two-post board
  // at twice the size, with a face on BOTH sides, squared to the approach so
  // the camera reads it on the way in and on the way back out.
  const SX = -48.4, SZ = 27.5;
  const sy = world.height(SX, SZ);
  const SROT = 0.93;                                  // normal → south-east, at the camera
  const nx = Math.sin(SROT), nz = Math.cos(SROT);
  const ex = Math.cos(SROT), ez = -Math.sin(SROT);    // along the board
  for (const s of [-1, 1]) {
    const px = SX + ex * s * 1.9, pz = SZ + ez * s * 1.9;
    B.stripeCyl(0.17, 0.2, 3.55, { at: [px, world.height(px, pz) + 1.78, pz], variant: 1, seg: 8 });
    B.sph('gloss', 0.28, 8, 6, { at: [px, world.height(px, pz) + 3.66, pz], color: s > 0 ? C.teal : C.yellow });
  }
  // the board now carries the WIDE cell (2.5 : 1) — same plate, bigger letters
  B.waffleBox(4.0, 1.72, 0.22, { at: [SX, sy + 2.5, SZ], rot: [0, SROT, 0], color: C.waferPale });
  B.signQuad('pier', 3.7, 1.48, { at: [SX + nx * 0.14, sy + 2.5, SZ + nz * 0.14], rot: [0, SROT, 0] });
  B.signQuad('pier', 3.7, 1.48, { at: [SX - nx * 0.14, sy + 2.5, SZ - nz * 0.14], rot: [0, SROT + Math.PI, 0] });
  icingDrip(B, SX, sy + 3.38, SZ, SROT + Math.PI / 2, 4.0, { color: C.icingPink, r: 0.2, drop: 0.3 });
  A.collide(SX, SZ, 0.9);
  A.readSign('pier', SX, SZ, 3.4, 'Read: Sugar Pier');
  // nothing grows in front of the first sign the player ever reads
  A.claimApron(SX, SZ, 1.2, 6.0, { r: 2.0 });

  beachGrounds(A, deck);

  return { head: { x: X_HEAD, y: deck, z: Z }, deck };
}

/**
 * HANDRAILS (Contract O). The big candy-cane posts and their licorice swags
 * were always a railing to look at and never one to lean on: nothing between
 * them, no colliders, and from x ≈ −36 seaward the deck stands 2.6–6 units over
 * the surf. Now a striped top rail runs post to post along both sides and round
 * the step onto the wide head, with a small cane between every pair of big
 * ones (≈ 1.3–1.4 u apart) and oriented box colliders on the rail line, so the
 * visitor, and anything else that walks the pier, stays on it.
 * Where the deck is only 0.6–0.8 over the beach (the landward half) the spans
 * are measured and left open: you can step off onto the sand, as you always
 * could. The HEAD is open on purpose: it is the ferry berth, and the
 * Sugarfin's gangplank lands across that edge (ferry.js pierEnd/footPenalty).
 */
function pierRails(A, deck, postX, rampX0, gA) {
  const { B, ctx } = A;
  const style = caneStyle({ variant: 0 });
  const zN = HALF - 0.22, zW = HALF_WIDE - 0.28;       // the big posts' lines
  const have = [];
  for (const x of postX) { const pz = x > X_WIDE ? zW : zN; have.push([x, Z + pz], [x, Z - pz]); }
  const XS = X_WIDE + 0.22;                             // the step onto the wide head
  for (const s of [1, -1]) {                            // +z is the south side
    const pts = [[X_ROOT + 0.2, Z + s * zN, deck]];
    for (const x of postX) if (x < X_WIDE) pts.push([x, Z + s * zN, deck]);
    pts.push([XS, Z + s * zN, deck], [XS, Z + s * zW, deck]);
    for (const x of postX) if (x > X_WIDE) pts.push([x, Z + s * zW, deck]);
    railRun(ctx, B, pts, { site: 'sugar_pier', edge: (s > 0 ? 'south' : 'north') + ' side + step', out: -s, style, have, lead: 1 });
    // the shore ramp: measured, never more than a stride off the sand
    railRun(ctx, B, [[rampX0, Z + s * (HALF - 0.1), gA], [X_ROOT, Z + s * (HALF - 0.1), deck]],
      { site: 'sugar_pier', edge: 'shore ramp ' + (s > 0 ? 'south' : 'north'), out: -s, style, open: 'measured only' });
  }
  railRun(ctx, B, [[X_HEAD - 0.1, Z - zW, deck], [X_HEAD - 0.1, Z + zW, deck]],
    { site: 'sugar_pier', edge: 'head (ferry berth)', out: 1, style, open: 'deliberately open: the ferry gangplank lands here' });
}

/**
 * THE BEACH. Round 3: "bare tan beach dome at the pier" — the pier, the booth
 * and the arch all stood on an empty sand dome, so none of them had a site and
 * the first thirty seconds of the game were spent walking across nothing.
 *
 * Everything here is a small authored cluster, hand-placed, checked against the
 * path and the water line: a sandcastle somebody has been working on for a very
 * long time, a picnic, two deckchairs, driftwood, and drifts of rock candy.
 */
function beachGrounds(A, deck) {
  const { B, world } = A;
  const r = A.rng('beach');
  const ok = (x, z, m = 2.0) => world.height(x, z) > 0.42 && !world.onPath(x, z, m)
    && !A.ctx.colliders.some((c) => !c.box && c.r > 0.3 && Math.hypot(x - c.x, z - c.z) < c.r + 1.1);

  // ── the sandcastle (and its curator) ──────────────────────────────────────
  {
    const x = -51.0, z = 17.6, y = world.height(x, z);
    if (y > 0.42) {
      const tiers = [[2.5, 0.8], [1.9, 0.8], [1.3, 0.9]];
      let ty = y;
      tiers.forEach(([rad, h], i) => {
        B.cyl('matteFlat', rad * 0.88, rad, h, 12, { at: [x, ty + h / 2, z], color: i % 2 ? 0xf4dfb4 : 0xe8cd99 });
        for (let k = 0; k < 4; k++) {                     // corner turrets
          const a = (k / 4) * Math.PI * 2 + 0.4 + i * 0.3;
          const px = x + Math.cos(a) * rad * 0.86, pz = z + Math.sin(a) * rad * 0.86;
          B.cyl('matteFlat', 0.24, 0.3, h + 0.5, 8, { at: [px, ty + (h + 0.5) / 2, pz], color: 0xf4dfb4 });
          B.cone('matteFlat', 0.34, 0.5, 8, { at: [px, ty + h + 0.75, pz], color: i % 2 ? C.icingPink : C.icingMint });
        }
        ty += h;
      });
      B.cyl('matte', 0.05, 0.06, 1.5, 5, { at: [x, ty + 0.75, z], color: C.licorice });
      A.inst.bunting.push({ x: x + 0.4, y: ty + 1.15, z, w: 0.8, h: 0.5, ry: 0.9, ph: 1.2, color: C.red });
      A.collide(x, z, 2.7);
      // bucket, spade, and a sign nobody asked for
      B.cyl('gloss', 0.3, 0.26, 0.5, 10, { at: [x + 3.0, y + 0.25, z + 1.2], rot: [0.2, 0, 0.25], color: C.blue });
      B.cyl('matte', 0.05, 0.05, 1.3, 5, { at: [x + 3.5, y + 0.5, z + 0.4], rot: [0, 0, 1.1], color: C.yellow });
      B.box('matte', 0.4, 0.06, 0.3, { at: [x + 4.1, y + 0.12, z + 0.15], rot: [0, 0.4, 0.1], color: C.yellow });
      A.interact({
        id: 'candy_sandcastle', x: x + 2.4, z: z + 1.6, r: 2.6, label: 'Look at the sandcastle',
        onInteract(ctx) {
          ctx.systems.ui?.say('Three storeys, four turrets, and a moat. The sand is set hard as toffee. Scratched into the top step: a tally of days, in blocks of five, going all the way round the castle twice.', { speaker: 'Sugar Beach', duration: 7.5 });
        },
      });
    }
  }

  // ── a picnic, laid for rather more people than are here ──────────────────
  {
    const x = -53.5, z = 25.4, y = world.height(x, z);
    if (y > 0.42) {
      B.stripeBox(3.2, 0.07, 2.6, { at: [x, y + 0.06, z], rot: [0, 0.35, 0], variant: 2, axisH: 2.0 });
      B.waffleBox(1.05, 0.7, 0.8, { at: [x - 1.0, y + 0.42, z - 0.5], rot: [0, 0.9, 0], color: C.wafer });
      B.tor('matte', 0.34, 0.07, 5, 12, { at: [x - 1.0, y + 0.82, z - 0.5], rot: [0, 0.9, 0], color: C.chocMilk });
      for (let i = 0; i < 5; i++) {
        const a = 0.35 + i * 1.25;
        B.cyl('icing', 0.26, 0.26, 0.06, 12, { at: [x + Math.cos(a) * 1.0, y + 0.11, z + Math.sin(a) * 0.8], color: C.cream });
        B.sph('gloss', 0.14, 7, 5, { at: [x + Math.cos(a) * 1.0, y + 0.2, z + Math.sin(a) * 0.8], color: SPRINKLE[i % SPRINKLE.length] });
      }
      B.cyl('gloss', 0.16, 0.2, 0.75, 9, { at: [x + 1.2, y + 0.44, z + 0.7], color: C.green });
      B.cyl('matte', 0.09, 0.09, 0.2, 7, { at: [x + 1.2, y + 0.9, z + 0.7], color: C.icing });
      A.collide(x, z, 1.6);
    }
  }

  // ── two deckchairs, facing the ferry route ───────────────────────────────
  for (const [cx, cz, ca] of [[-49.0, 30.6, -0.5], [-47.2, 32.2, -0.35]]) {
    if (!ok(cx, cz, 1.6)) continue;
    const y = world.height(cx, cz);
    const cs = Math.cos(ca), sn = Math.sin(ca);
    const P = (lx, ly, lz) => [cx + lx * cs + lz * sn, y + ly, cz - lx * sn + lz * cs];
    for (const s of [-1, 1]) {
      B.cyl('licorice', 0.06, 0.06, 1.0, 5, { at: P(s * 0.42, 0.36, 0.1), rot: [0.5, ca, 0], color: C.licorice });
      B.cyl('licorice', 0.06, 0.06, 1.0, 5, { at: P(s * 0.42, 0.36, -0.1), rot: [-0.5, ca, 0], color: C.licorice });
    }
    B.stripeBox(0.95, 0.07, 1.5, { at: P(0, 0.78, -0.42), rot: [-0.95, ca, 0], variant: 1, axisH: 1.5 });
    B.stripeBox(0.95, 0.07, 0.7, { at: P(0, 0.62, 0.3), rot: [-0.15, ca, 0], variant: 1, axisH: 0.7 });
    A.collide(cx, cz, 0.8);
  }

  // ── driftwood and rock candy ─────────────────────────────────────────────
  const SPOTS = [[-55.5, 20.0], [-50.5, 33.5], [-44.0, 15.0], [-58.0, 27.5], [-46.5, 34.8], [-53.0, 14.6]];
  SPOTS.forEach(([sx, sz], i) => {
    if (!ok(sx, sz, 2.2)) return;
    const y = world.height(sx, sz);
    if (i % 2 === 0) {
      // a bleached licorice log, washed up
      const a = r.range(0, 3.14), len = r.range(2.4, 3.8);
      B.cyl('matte', 0.34, 0.4, len, 8, { at: [sx, y + 0.36, sz], rot: [0.06, a, Math.PI / 2], color: C.waferDark });
      for (let k = 0; k < 3; k++) {
        const t = -len / 2 + len * ((k + 0.5) / 3);
        B.sph('gloss', r.range(0.14, 0.24), 7, 5, { at: [sx + Math.cos(a) * t, y + 0.68, sz - Math.sin(a) * t], color: SPRINKLE[(i + k) % SPRINKLE.length] });
      }
      A.collide(sx, sz, 1.5);
    } else {
      for (let k = 0; k < 5; k++) {
        const a = r.range(0, 6.283), d = r.range(0.2, 1.9);
        const qx = sx + Math.cos(a) * d, qz = sz + Math.sin(a) * d;
        const s = r.range(0.34, 1.05);
        B.cyl('gloss', s * 0.22, s * 0.6, s * 2.2, 6, {
          at: [qx, world.height(qx, qz) + s * 0.95, qz],
          rot: [r.range(-0.3, 0.3), r.range(0, 3), r.range(-0.3, 0.3)],
          color: [C.icingPink, C.icingMint, C.icingLemon, 0xe6d4ff][(i + k) % 4],
        });
      }
      A.collide(sx, sz, 1.8);
    }
  });

  // a lamp where the road meets the sand, and a bench looking at the sea
  {
    const p = A.freeSpot(-52.0, 22.4, 2.2);
    if (ok(p.x, p.z, 1.8)) { lamppost(B, p.x, world.height(p.x, p.z), p.z, { h: 3.6, variant: 1 }); A.collide(p.x, p.z, 0.8); }
    if (ok(-55.0, 17.2, 1.8)) bench(B, -55.0, world.height(-55.0, 17.2), 17.2, -0.9, { A });
  }
  void deck;
}

/**
 * THE TICKET BOOTH — and you can go in. Counter, timetable, and a lost-and-found
 * bin that contains forty-one hats and nothing else anybody ever carries.
 * Wall = striped shell (ghosts while you are inside) · Roof = the wafer cone
 * (hidden while you are inside) · In = the room.
 */
function buildBooth(A, x, z, rotY) {
  const { B, world } = A;
  const y = world.height(x, z);
  // h 3.0, not 2.7, and a 1.5 × 2.4 door, not 1.35 × 2.25 (Contract O: a door
  // that opens is at least 1.4 × 2.3 clear) — at 2.7 the lintel would have
  // been a 0.3 sliver under the eaves
  const w = 3.8, d = 3.3, h = 3.0, T = 0.3;
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  const fwd = (dz, dx = 0) => [x + sn * dz + cs * dx, z + cs * dz - sn * dx];
  const floorY = y + 0.3;
  const DOORW = 1.5, DOORH = 2.4;                   // clear opening above the floor

  const E = A.building({ id: 'ticket_booth', name: 'the ticket booth', x, z, w: w - T * 2, d: d - T * 2, rot: rotY, floorY, pad: 0.3 });
  const W = E.wall, R = E.roof;

  // striped walls: back, one solid side, one side with the door, counter front
  W.box('licorice', w, 0.3, d, { at: [x, y + 0.15, z], rot: [0, rotY, 0], color: C.licorice });
  const [bx, bz] = fwd(-d / 2 + T / 2);
  W.stripeBox(w, h, T, { at: [bx, floorY + h / 2, bz], rot: [0, rotY, 0], variant: 0, axisH: h });
  A.collideBox(bx, bz, w, T, rotY, floorY + h);
  // side with no door
  {
    const [px, pz] = fwd(0, -(w / 2 - T / 2));
    W.stripeBox(T, h, d, { at: [px, floorY + h / 2, pz], rot: [0, rotY, 0], variant: 0, axisH: h });
    A.collideBox(px, pz, T, d, rotY, floorY + h);
  }
  // side WITH the door: two stubs and a lintel
  const segD = (d - DOORW) / 2;
  for (const s of [-1, 1]) {
    const [px, pz] = fwd(s * (d + DOORW) / 4, w / 2 - T / 2);
    W.stripeBox(T, h, segD, { at: [px, floorY + h / 2, pz], rot: [0, rotY, 0], variant: 0, axisH: h });
    A.collideBox(px, pz, T, segD, rotY, floorY + h);
  }
  const [lx, lz] = fwd(0, w / 2 - T / 2);
  W.stripeBox(T, h - DOORH, DOORW + 0.02, { at: [lx, floorY + DOORH + (h - DOORH) / 2, lz], rot: [0, rotY, 0], variant: 0, axisH: h - DOORH });
  // front: counter below, header above, opening between
  const [fx, fz] = fwd(d / 2 - T / 2);
  W.stripeBox(w, 1.25, T, { at: [fx, floorY + 0.62, fz], rot: [0, rotY, 0], variant: 0, axisH: 1.25 });
  W.stripeBox(w, 0.6, T, { at: [fx, floorY + h - 0.3, fz], rot: [0, rotY, 0], variant: 0, axisH: 0.6 });
  A.collideBox(fx, fz, w, T, rotY, floorY + 1.5);       // counter-high: vaultable, not walkable
  const [cx2, cz2] = fwd(d / 2 + 0.25);
  B.waffleBox(w + 0.5, 0.16, 0.95, { at: [cx2, floorY + 1.32, cz2], rot: [0, rotY, 0], color: C.waferPale });

  // the door itself, on the landward side: an icing surround on the wall face
  // (clear opening = the wall gap, DOORW × DOORH), the leaf in the wall's
  // thickness, and a walkable sill + doorstep at floor level (Contract A)
  const dRot = rotY + Math.PI / 2;
  const [ox0, oz0] = fwd(0, w / 2);
  doorway(B, ox0, y, oz0, dRot, { w: DOORW, h: floorY - y + DOORH, frame: C.icing, arch: false, key: false, baseColor: C.icingPink });
  const [dx0, dz0] = fwd(0, w / 2 - T / 2);
  E.door({ x: dx0, y: floorY - 0.02, z: dz0, rot: dRot, w: DOORW, h: DOORH + 0.02, color: C.chocolate, swing: -1, r: 2.4, say: 'The hinge screams. Nobody comes.' });
  { const [sx0, sz0] = fwd(0, w / 2 - T / 2 + 0.1); A.deckRRect(sx0, sz0, DOORW + 0.1, T + 0.3, dRot, floorY); }
  { const [sx0, sz0] = fwd(0, w / 2 + 0.55);
    B.waffleBox(DOORW + 0.7, 0.36, 0.7, { at: [sx0, floorY - 0.18, sz0], rot: [0, dRot, 0], color: C.waferPale });
    A.deckRRect(sx0, sz0, DOORW + 0.7, 0.7, dRot, floorY); }

  // wafer roof + icing drip + candy-cane finial
  const [rx, rz] = fwd(0);
  R.waffleCone(w * 0.74, 1.0, 4, { at: [rx, floorY + h + 0.48, rz], rot: [0, rotY + Math.PI / 4, 0], color: C.wafer });
  icingDrip(R, rx, floorY + h + 0.06, rz, rotY, w + 0.5, { color: C.icingPink, r: 0.2, drop: 0.3 });
  icingDrip(R, rx, floorY + h + 0.06, rz, rotY + Math.PI / 2, d + 0.5, { color: C.icingPink, r: 0.2, drop: 0.3 });
  R.sph('gloss', 0.3, 10, 8, { at: [rx, floorY + h + 1.1, rz], color: C.red });

  // awning over the counter
  const [ax, az] = fwd(d / 2 + 0.55);
  B.stripeBox(w + 0.6, 0.12, 1.5, { at: [ax, y + 2.5, az], rot: [-0.22, rotY, 0], variant: 2, axisH: 1.5 });

  // signs: big ferry board on the header, fares beside the counter
  const [sx, sz] = fwd(d / 2 + 0.32);
  B.signQuad('ferry', w - 0.25, 0.56, { at: [sx, floorY + h - 0.3, sz], rot: [0, rotY, 0] });
  const [px2, pz2] = fwd(d / 2 + 0.33, -(w / 2 - 0.45));
  B.signQuad('fares', 1.0, 0.72, { at: [px2, y + 1.0, pz2], rot: [0, rotY, 0] });

  // a bell and a little stack of tickets on the counter
  B.sph('gloss', 0.16, 8, 6, { at: [cx2 + cs * 1.0, floorY + 1.48, cz2 - sn * 1.0], color: C.yellow });
  B.box('matte', 0.5, 0.1, 0.35, { at: [cx2 - cs * 0.9, floorY + 1.44, cz2 + sn * 0.9], rot: [0, rotY + 0.3, 0], color: C.cream });

  // ── inside ────────────────────────────────────────────────────────────────
  const I = E.in, F = IN.frameAt(x, floorY, z, rotY);
  const iw = w - T * 2, id = d - T * 2;
  A.deckRRect(x, z, iw, id, rotY, floorY);
  A.claim(x, z, w + 0.4, d + 0.4, rotY);
  IN.floor(I, F, iw, id, { a: 0xb98a53, b: 0xa87a48, skirt: C.icingPink });
  // clerk's shelf under the counter + the ledger with no departures column
  I.waffleBox(iw, 0.1, 0.5, { at: F.p(0, 0.95, id / 2 - 0.3), rot: [0, rotY, 0], color: C.wafer });
  I.box('matte', 0.46, 0.12, 0.34, { at: F.p(-0.5, 1.06, id / 2 - 0.3), rot: [0, rotY + 0.2, 0], color: C.cream });
  I.box('matte', 0.44, 0.06, 0.3, { at: F.p(-0.5, 1.14, id / 2 - 0.32), rot: [0, rotY + 0.35, 0], color: 0xf2e6cf });
  // THE TIMETABLE
  I.box('matte', 2.0, 1.1, 0.06, { at: F.p(0.1, 1.85, -id / 2 + 0.06), rot: [0, rotY, 0], color: C.licorice });
  I.signQuad('timetable', 1.86, 0.96, { at: F.p(0.1, 1.85, -id / 2 + 0.1), rot: [0, rotY, 0] });
  // the lost & found
  const hb = IN.hatBin(I, F, -iw / 2 + 0.7, -id / 2 + 0.65, 0);
  A.collide(hb.x, hb.z, 0.55);
  IN.stool(I, F, iw / 2 - 1.0, -id / 2 + 0.55);        // out of the doorway's path
  const lamp = IN.ceilingLamp(I, F, 0.2, h - 0.85, -0.2, { glow: 1.9, hood: C.icingLemon });
  E.lamp(lamp.x, lamp.y - 0.1, lamp.z, 0xffd2a0);

  A.mark('ticket_booth', x, y, z);
  A.interact({
    id: 'candy_ticket_booth', x: x + sn * (d / 2 + 1.3), z: z + cs * (d / 2 + 1.3), r: 3.0,
    label: 'Buy a ferry ticket',
    onInteract(ctx) {
      const lines = [
        'FERRY → CAT ISLAND — one way? no, round trip! (probably)',
        'The booth is unstaffed. A handwritten card reads: "back in five minutes — 1884".',
        'Under the counter: a ledger of arrivals. There is no column for departures.',
      ];
      const n = (ctx.systems.story?.get('booth_reads') || 0) % lines.length;
      ctx.systems.story?.set('booth_reads', n + 1);
      ctx.systems.ui?.say(lines[n], { speaker: 'Ticket Booth', duration: 6 });
    },
  });
  const tp = F.p(0.1, 0, -id / 2 + 1.3);
  A.interact({
    id: 'booth_timetable', x: tp[0], z: tp[2], r: 1.7, label: 'Read the timetable',
    onInteract(ctx) { ctx.systems.ui?.say('SAILINGS — to Cat Island: hourly. RETURN TRIPS: ask on Cat Island. Someone has written "we did" underneath, in a different hand, very small.', { speaker: 'Timetable', duration: 7 }); },
  });
  const bp = F.p(-iw / 2 + 0.7, 0, -id / 2 + 1.5);
  A.interact({
    id: 'booth_lost_found', x: bp[0], z: bp[2], r: 1.6, label: 'Search the lost & found',
    onInteract(ctx) {
      ctx.systems.story?.set('found_hats', true);
      ctx.systems.ui?.say('Forty-one hats. No coats, no bags, no shoes — just hats, and every one the wrong way up, as though they were taken off very suddenly from below.', { speaker: 'Lost & Found', duration: 7.5 });
    },
  });
  E.finish();
}

function buildWelcome(A) {
  const { B, world } = A;
  // straddles candy_main just inland of the pier
  // Moved 9 units further up the road (the same polyline, t = 0.62). It used to
  // straddle candy_main FIVE units from the player's spawn, which meant the
  // first sign in the game was always seen from directly underneath and always
  // cropped by the top of the frame. From here you walk toward it and read it.
  const cx = -59.5, cz = 27.0, rotY = -1.2907;      // face along the path
  const px = 0.2747, pz = 0.9615;                  // path perpendicular
  const span = 5.45;
  const posts = [[cx + px * span, cz + pz * span], [cx - px * span, cz - pz * span]];
  let baseY = Math.min(world.height(posts[0][0], posts[0][1]), world.height(posts[1][0], posts[1][1]));
  // 7.0, not 8.0. The arch straddles the path six units from where the player
  // spawns, and at the game camera (elevation 0.64, distance 31) a board whose
  // top sat at baseY + 7.7 was sliced off by the top of the frame — the first
  // sign in the game, cropped. The board now tops out at baseY + 6.2 and still
  // clears the player by three and a half units.
  const H = 7.0;
  for (const [x, z] of posts) {
    const g = world.height(x, z);
    // plum + an icing bead, never licorice: a near-black collar at the foot of
    // the first thing the player ever sees reads as a hole in the ground
    B.cyl('matte', 0.85, 1.0, 0.5, 12, { at: [x, g + 0.25, z], color: C.plum });
    B.tor('icing', 0.92, 0.16, 6, 14, { at: [x, g + 0.5, z], rot: [Math.PI / 2, 0, 0], color: C.icingPink });
    B.stripeCyl(0.42, 0.46, H, { at: [x, g + 0.4 + H / 2, z], variant: 0, seg: 12 });
    B.sph('gloss', 0.62, 12, 9, { at: [x, g + 0.4 + H + 0.3, z], color: C.red });
    B.sph('icing', 0.5, 10, 7, { at: [x, g + 0.4 + H - 0.05, z], scale: [1, 0.5, 1], color: C.icing });
    A.collide(x, z, 1.05);
  }
  // board
  const by = baseY + 5.0;
  const bw = span * 2 + 0.6, bh = 2.9;
  B.waffleBox(bw, bh, 0.34, { at: [cx, by, cz], rot: [0, rotY, 0], color: C.waferPale });
  B.signQuad('welcome', bw - 0.35, bh - 0.3, { at: [cx + Math.sin(rotY) * 0.2, by, cz + Math.cos(rotY) * 0.2], rot: [0, rotY, 0] });
  B.signQuad('welcome', bw - 0.35, bh - 0.3, { at: [cx - Math.sin(rotY) * 0.2, by, cz - Math.cos(rotY) * 0.2], rot: [0, rotY + Math.PI, 0] });
  // icing scallops + gumdrops along the top
  icingDrip(B, cx, by + bh / 2 + 0.05, cz, rotY + Math.PI / 2, bw, { color: C.icing, r: 0.3, drop: 0.4, step: 0.75 });
  for (let i = 0; i <= 8; i++) {
    const t = -bw / 2 + (bw * i) / 8;
    B.sph('gloss', 0.3, 10, 8, { at: [cx + Math.cos(rotY) * t, by + bh / 2 + 0.42, cz - Math.sin(rotY) * t], color: SPRINKLE[i % SPRINKLE.length] });
  }
  // bunting swagged under the board
  for (let i = 0; i < 14; i++) {
    const t = -bw / 2 + (bw * (i + 0.5)) / 14;
    const sag = Math.sin((i + 0.5) / 14 * Math.PI) * 0.7;
    A.inst.bunting.push({
      x: cx + Math.cos(rotY) * t, y: by - bh / 2 - 0.25 - sag, z: cz - Math.sin(rotY) * t,
      w: 0.52, h: 0.62, ry: rotY, ph: i * 0.8, color: SPRINKLE[i % SPRINKLE.length],
    });
  }
  A.mark('welcome_arch', cx, by, cz);
  A.readSign('welcome', cx, cz, 5.5, 'Read the welcome sign');
  // NOTHING GROWS IN FRONT OF THE FIRST SIGN IN THE GAME. Round 3: "the arrival
  // board overlapped by a white candy prop" — a lollipop head four units up the
  // road, dead centre of the arrival view, straight across the bottom of
  // WELCOME TO CANDYLAND. The apron runs 14 units out and another 10 back down
  // the road toward the donut, which is the approach the camera actually uses.
  A.claimApron(cx, cz, 0, 14.0, { r: 3.0 });
  for (let i = 1; i <= 3; i++) {
    const t = i / 3;
    A.claimApron(cx - 0.9605 * 9 * t, cz + 0.2785 * 9 * t, 0, 6.5, { r: 3.0 });
  }
}
