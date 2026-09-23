// CHOCOLATE LAKE — landmark chocolate_lake (-200, 48), world.LAKE r 15.
// A tiered chocolate fountain out in the middle, a wafer boathouse with a swan
// paddle boat, and a fishing pier. The lake surface is a separate mesh
// (api.lakeSurface) so the terrain builder can take it over later.
import * as THREE from 'three';
import { C, SPRINKLE, createBuilder, bench, fenceLine, icingDrip, softGlow, door, windowPane, lamppost } from './kit.js';

export function buildLake(A) {
  const { B, world } = A;
  const L = world.LAKE;
  const X = L.x, Z = L.z;

  // ── the terrain system owns the chocolate surface; match its level ────────
  let minH = Infinity;
  for (let z = Z - 18; z <= Z + 18; z += 0.75) for (let x = X - 18; x <= X + 18; x += 0.75) minH = Math.min(minH, world.height(x, z));
  const WY = A.ctx.systems.terrain?.lakeSurface ?? Math.max(L.surface, minH + 1.18);
  const shoreAt = (ang) => {
    let rr = 1.0;
    for (; rr < L.r * 1.6; rr += 0.4) if (world.height(X + Math.cos(ang) * rr, Z + Math.sin(ang) * rr) > WY) break;
    return rr;
  };
  A.mark('chocolate_lake', X, WY, Z);

  // The terrain system owns the chocolate surface (bowl carved to LAKE.floor,
  // water at LAKE.surface); we only place buildings against its level. Verified
  // 2026-09-12: its mesh draws at y=2.0 — see the report note about its colour.
  buildChocolateFountain(A, X, Z, WY);

  // ── boathouse on the west shore, facing the water ─────────────────────────
  // +1.0 past the measured shore, not +2.2: the water is at LAKE.surface (2.0)
  // and the bank climbs ~0.5/unit here, so a couple of extra units put the
  // boathouse on a hillside with its slipway dangling.
  const bhA = 3.3, bhR = shoreAt(bhA) + 1.0;
  const bx = X + Math.cos(bhA) * bhR, bz = Z + Math.sin(bhA) * bhR;
  const boat = buildBoathouse(A, bx, bz, Math.atan2(-Math.cos(bhA), -Math.sin(bhA)), WY);

  // ── fishing pier on the south-west shore ──────────────────────────────────
  const fpA = 2.45, fpR = shoreAt(fpA);
  buildFishPier(A, X, Z, fpA, fpR, WY);

  // ── the big lake sign beside the road ─────────────────────────────────────
  // Round 2: it stood out on the shore facing the WATER, edge-on to everyone
  // walking the road, and half hidden behind the chocolate trees. It now stands
  // beside candy_main where the road turns down to the lake, square to the iso
  // camera, half again as big, with its own little clearing.
  const sx = -185.5, sz = 44.5;
  const sy = world.height(sx, sz);
  const srot = Math.PI / 4;                          // face the approach (and the camera)
  for (const s of [-1, 1]) {
    const px = sx + Math.cos(srot) * s * 2.5, pz = sz - Math.sin(srot) * s * 2.5;
    B.stripeCyl(0.22, 0.26, 4.0, { at: [px, world.height(px, pz) + 2.0, pz], variant: 3, seg: 8 });
    B.sph('gloss', 0.32, 8, 6, { at: [px, world.height(px, pz) + 4.1, pz], color: s > 0 ? C.caramel : C.icingMint });
  }
  B.waffleBox(5.6, 2.4, 0.28, { at: [sx, sy + 3.5, sz], rot: [0, srot, 0], color: C.waferPale });
  B.signQuad('lake', 5.3, 2.16, { at: [sx + Math.sin(srot) * 0.17, sy + 3.5, sz + Math.cos(srot) * 0.17], rot: [0, srot, 0] });
  B.signQuad('lake', 5.3, 2.16, { at: [sx - Math.sin(srot) * 0.17, sy + 3.5, sz - Math.cos(srot) * 0.17], rot: [0, srot + Math.PI, 0] });
  icingDrip(B, sx, sy + 4.7, sz, srot + Math.PI / 2, 5.6, { color: C.caramel, r: 0.24, drop: 0.32 });
  A.collide(sx, sz, 1.0);
  A.readSign('lake', sx, sz + 2.2, 3.8, 'Read: Chocolate Lake');
  A.claimApron(sx, sz, 1.4, 8.0, { r: 2.4 });
  bench(B, sx + 4.4, world.height(sx + 4.4, sz + 1.2), sz + 1.2, srot, { A });

  lakeShore(A, X, Z, WY, shoreAt, bx, bz);

  return { surface: null, boat, sparkle: [{ x: X, y: WY + 7.6, z: Z }] };
}

/**
 * THE SHORE. Round 3: "empty mud flats at the lake". The bank between the road
 * and the water was a bare brown annulus thirty units across with a boathouse
 * standing on it, so the boathouse had no site and the lake had no edge.
 *
 * What binds them now: a flagged path from the road down to the jetty, a
 * viewing terrace with a telescope pointed at the fountain, stacked cocoa
 * crates and barrels behind the boathouse, a rope line along the water (there
 * is a sign about swimming; nobody reads signs), lamps, and clusters of
 * marshmallow rock along the tideline.
 */
function lakeShore(A, X, Z, WY, shoreAt, bx, bz) {
  const { B, world } = A;
  const r = A.rng('lakeshore');
  const ok = (x, z, m = 1.8) => world.height(x, z) > WY + 0.12 && !world.onPath(x, z, m)
    && !A.ctx.colliders.some((c) => !c.box && c.r > 0.3 && Math.hypot(x - c.x, z - c.z) < c.r + 1.0);

  // ── the flagged path from the road sign down to the boathouse ────────────
  {
    const ax = -185.5, az = 46.5;
    const n = 15;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const px = ax + (bx - ax) * t + Math.sin(t * 5.2) * 1.5;
      const pz = az + (bz - az) * t + Math.cos(t * 4.1) * 1.4;
      const gy = world.height(px, pz);
      if (!(gy > WY + 0.05)) continue;
      const dir = Math.atan2(bx - ax, bz - az);
      B.waffleBox(2.3, 0.15, 1.4, { at: [px, gy + 0.08, pz], rot: [0, dir, 0], color: i % 2 ? C.waferPale : C.wafer });
      if (i % 4 === 2) {
        const qx = px + Math.cos(dir) * 1.9, qz = pz - Math.sin(dir) * 1.9;
        if (world.height(qx, qz) > WY) {
          B.stripeCyl(0.11, 0.13, 1.2, { at: [qx, world.height(qx, qz) + 0.6, qz], variant: 3, seg: 6 });
          B.sph('gloss', 0.18, 6, 5, { at: [qx, world.height(qx, qz) + 1.26, qz], color: SPRINKLE[i % SPRINKLE.length] });
        }
      }
    }
  }

  // ── the viewing terrace, aimed at the fountain ───────────────────────────
  // On the NEAR shore (angle −0.55 ⇒ east-south-east), which is the bank the
  // road arrives on and the one the game camera looks across; on the far side
  // it was a nice terrace nobody would ever see.
  {
    const a = -0.55, rad = shoreAt(a) + 2.2;
    const tx = X + Math.cos(a) * rad, tz = Z + Math.sin(a) * rad, ty = world.height(tx, tz);
    if (ty > WY) {
      const face = Math.atan2(X - tx, Z - tz);
      B.waffleCyl(3.1, 3.35, 0.44, 16, { at: [tx, ty + 0.22, tz], color: C.waferPale });
      B.tor('icing', 3.1, 0.15, 5, 20, { at: [tx, ty + 0.44, tz], rot: [Math.PI / 2, 0, 0], color: C.icingMint });
      A.deckRing(tx, tz, 0, 3.0, ty + 0.46);
      for (let i = 0; i < 7; i++) {                 // rail on the water side
        const aa = face - 1.25 + (2.5 * i) / 6;
        const px = tx + Math.sin(aa) * 3.0, pz = tz + Math.cos(aa) * 3.0;
        B.stripeCyl(0.12, 0.13, 1.15, { at: [px, ty + 1.02, pz], variant: 3, seg: 6 });
        B.sph('gloss', 0.19, 6, 5, { at: [px, ty + 1.66, pz], color: SPRINKLE[i % SPRINKLE.length] });
      }
      bench(B, tx - Math.sin(face) * 1.4, ty + 0.46, tz - Math.cos(face) * 1.4, face, { w: 2.4, A });
      // a telescope on a post, pointed at the chocolate fountain
      const px = tx + Math.sin(face + 0.9) * 2.1, pz = tz + Math.cos(face + 0.9) * 2.1;
      B.cyl('matte', 0.11, 0.16, 1.35, 8, { at: [px, ty + 1.13, pz], color: C.plum });
      B.cyl('gloss', 0.17, 0.24, 1.1, 10, { at: [px + Math.sin(face) * 0.2, ty + 1.95, pz + Math.cos(face) * 0.2], rot: [-1.15, face, 0], color: C.caramel });
      B.tor('matte', 0.2, 0.05, 5, 10, { at: [px, ty + 1.8, pz], rot: [Math.PI / 2, 0, 0], color: C.licorice });
      A.collide(px, pz, 0.6);
      A.interact({
        id: 'candy_lake_telescope', x: px, z: pz, r: 2.2, label: 'Look through the telescope',
        onInteract(ctx) {
          ctx.systems.ui?.say('The chocolate fountain, very close up. It is not running down. Watch it long enough and you can see that it is running UP, and that it has been for some time.', { speaker: 'Chocolate Lake', duration: 7.5 });
          ctx.systems.story?.set('saw_chocolate_lake', true);
        },
      });
    }
  }

  // ── working ground behind the boathouse: crates, barrels, sacks ──────────
  {
    const a = 3.72, rad = shoreAt(a) + 3.4;
    const cx = X + Math.cos(a) * rad, cz = Z + Math.sin(a) * rad;
    if (world.height(cx, cz) > WY) {
      for (let i = 0; i < 5; i++) {
        const qx = cx + r.range(-2.2, 2.2), qz = cz + r.range(-2.0, 2.0);
        const gy = world.height(qx, qz), s = r.range(0.8, 1.15);
        B.waffleBox(s, s * 0.9, s, { at: [qx, gy + s * 0.45, qz], rot: [0, r.range(0, 3), 0], color: i % 2 ? C.wafer : C.waferDark });
        if (i % 2 === 0) B.waffleBox(s * 0.86, s * 0.8, s * 0.86, { at: [qx + 0.1, gy + s * 1.3, qz - 0.05], rot: [0, r.range(0, 3), 0], color: C.waferPale });
      }
      for (const [dx, dz2] of [[2.6, 1.2], [3.3, -0.4]]) {
        const qx = cx + dx, qz = cz + dz2, gy = world.height(qx, qz);
        B.cyl('matte', 0.52, 0.58, 1.25, 12, { at: [qx, gy + 0.62, qz], color: C.chocGlaze });
        B.tor('matte', 0.56, 0.07, 5, 14, { at: [qx, gy + 0.95, qz], rot: [Math.PI / 2, 0, 0], color: C.caramel });
        B.tor('matte', 0.56, 0.07, 5, 14, { at: [qx, gy + 0.3, qz], rot: [Math.PI / 2, 0, 0], color: C.caramel });
        A.collide(qx, qz, 0.8);
      }
      A.collide(cx, cz, 2.4);
    }
  }

  // ── the rope line along the water, and its warning ───────────────────────
  for (let i = 0; i < 9; i++) {
    const a = 2.25 + i * 0.19;
    const rad = shoreAt(a) + 0.7;
    const px = X + Math.cos(a) * rad, pz = Z + Math.sin(a) * rad;
    const gy = world.height(px, pz);
    if (!(gy > WY - 0.1) || Math.hypot(px - bx, pz - bz) < 5.5) continue;
    B.cyl('matte', 0.17, 0.22, 1.25, 9, { at: [px, gy + 0.6, pz], color: C.plum });
    B.sph('gloss', 0.25, 8, 6, { at: [px, gy + 1.3, pz], color: i % 2 ? C.icingLemon : C.licoriceRed });
    if (i) {
      const a0 = 2.25 + (i - 1) * 0.19, r0 = shoreAt(a0) + 0.7;
      const qx = X + Math.cos(a0) * r0, qz = Z + Math.sin(a0) * r0;
      const mx = (px + qx) / 2, mz = (pz + qz) / 2;
      const len = Math.hypot(px - qx, pz - qz);
      if (len < 6) B.box('matte', 0.08, 0.08, len, { at: [mx, (gy + world.height(qx, qz)) / 2 + 1.02, mz], rot: [0, Math.atan2(px - qx, pz - qz), 0], color: C.licorice });
    }
  }

  // ── marshmallow rock along the tideline, and two lamps ───────────────────
  for (let k = 0; k < 8; k++) {
    const a = -1.35 + k * 0.78;
    const rad = shoreAt(a) + r.range(0.6, 3.2);
    const cx = X + Math.cos(a) * rad, cz = Z + Math.sin(a) * rad;
    if (!ok(cx, cz, 2.0)) continue;
    for (let i = 0; i < 4; i++) {
      const aa = r.range(0, 6.283), d = r.range(0.2, 1.8);
      const qx = cx + Math.cos(aa) * d, qz = cz + Math.sin(aa) * d;
      const s = r.range(0.4, 1.2);
      B.ico('matteFlat', s, 0, { at: [qx, world.height(qx, qz) + s * 0.45, qz], rot: [r.range(0, 3), r.range(0, 3), r.range(0, 3)], scale: [1.3, 0.8, 1.1], color: [0xfff6ee, 0xf6e0d0, 0xffe4f0][(k + i) % 3] });
    }
    A.collide(cx, cz, 1.7);
  }
  for (const a of [-0.95, 0.15, 2.6, 3.95]) {
    const rad = shoreAt(a) + 3.0;
    const px = X + Math.cos(a) * rad, pz = Z + Math.sin(a) * rad;
    if (!ok(px, pz, 2.2)) continue;
    const p = A.freeSpot(px, pz, 2.0);
    lamppost(B, p.x, world.height(p.x, p.z), p.z, { h: 3.6, variant: 3 });
    A.collide(p.x, p.z, 0.8);
  }
}

// ── the fountain out in the lake ────────────────────────────────────────────
function buildChocolateFountain(A, X, Z, WY) {
  const { B } = A;
  // plinth, driven well below whatever the terrain does
  const pBot = -2.5, pTop = WY + 0.35;
  B.cyl('matteFlat', 3.4, 4.4, pTop - pBot, 16, { at: [X, (pTop + pBot) / 2, Z], color: 0x3a2112 });
  B.cyl('matte', 3.6, 3.6, 0.5, 18, { at: [X, WY + 0.55, Z], color: C.chocolate });
  B.tor('gloss', 3.6, 0.26, 8, 22, { at: [X, WY + 0.8, Z], rot: [Math.PI / 2, 0, 0], color: C.caramel });

  const tiers = [[4.4, WY + 1.7], [3.3, WY + 3.4], [2.3, WY + 4.9], [1.35, WY + 6.0]];
  let prev = null;
  for (const [rad, ty] of tiers) {
    B.cyl('gloss', rad, rad * 0.52, 0.55, 18, { at: [X, ty, Z], color: C.chocMilk });
    B.tor('gloss', rad, 0.16, 7, 20, { at: [X, ty + 0.26, Z], rot: [Math.PI / 2, 0, 0], color: C.caramel });
    B.cyl('water', rad * 0.96, rad * 0.96, 0.05, 18, { at: [X, ty + 0.24, Z], color: 0x6b3d1e });
    if (prev) B.cyl('matte', prev[0] * 0.42, rad * 0.42, prev[1] - ty - 0.3, 10, { at: [X, (prev[1] + ty) / 2 - 0.15, Z], color: C.chocolate });
    else B.cyl('matte', rad * 0.4, 1.2, ty - WY - 0.6, 12, { at: [X, (ty + WY + 0.6) / 2 - 0.3, Z], color: C.chocolate });
    prev = [rad, ty];
  }
  // a swirl of chocolate on top
  B.sph('gloss', 1.1, 12, 9, { at: [X, WY + 6.8, Z], color: C.chocMilk });
  B.sph('gloss', 0.7, 10, 8, { at: [X, WY + 7.6, Z], color: C.caramel });
  B.sph('gloss', 0.38, 8, 6, { at: [X, WY + 8.15, Z], color: C.chocMilk });
  // cascades: rim → the tier below (and the last one into the lake). Lobed cone
  // shells, not flat ribbons, so each one reads as chocolate coming over a rim.
  const rims = [[1.35, WY + 6.25], [2.3, WY + 5.15], [3.3, WY + 3.65], [4.4, WY + 1.95]];
  const lands = [[1.62, WY + 5.2], [2.62, WY + 3.7], [3.66, WY + 2.0], [4.9, WY + 0.62]];
  for (let i = 0; i < rims.length; i++) {
    B.flowFall(X, Z, rims[i][1], lands[i][1], rims[i][0], lands[i][0], 6 + i * 2, {
      color: 0xc4823a, splash: 0x8a5426, splashR: 0.26 + i * 0.06, phase: i * 0.7, ripple: i === rims.length - 1,
    });
  }
  A.collide(X, Z, 5.0);
  A.mark('chocolate_fountain', X, WY + 7, Z);
}

// ── boathouse + jetty + swan paddle boat ────────────────────────────────────
/**
 * THE BOATHOUSE. Round 3: "the boathouse/boat don't read — a wafer slab in mud."
 * Both halves of that were the same mistake. The shed was an OPEN-FRONTED bay
 * in pale wafer, the same colour and the same material as the slipway ramp that
 * ran out of it, so at thirty units the whole thing was one flat trapezoid of
 * wafer lying on a brown bank — no door, no roof line, no scale.
 *
 * It is now a BUILDING: gingerbread walls under a red-and-cream striped gable,
 * a real door with a frame and a step, a window each side, a lantern, a board
 * over the door — and the slab is gone, replaced by a short jetty on licorice
 * piles with the boat tied alongside it.
 */
function buildBoathouse(A, x, z, rotY, WY) {
  const { B, world } = A;
  const y = world.height(x, z);
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  const P = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
  const xz = (p) => [p[0], p[2]];
  const W = 5.4, D = 4.8, H = 3.2, T = 0.34, DOORW = 1.7;
  const WALL = C.gingerbreadLight, TRIM = C.icingMint;
  const fl = 0.42;                                   // floor above local ground

  // plinth (plum, never licorice: a black slab on a brown bank is a hole)
  B.box('matte', W + 0.8, 0.46, D + 0.8, { at: P(0, 0.23, 0), rot: [0, rotY, 0], color: C.plum });
  B.tor('icing', Math.max(W, D) * 0.52, 0.14, 6, 18, { at: P(0, 0.46, 0), rot: [Math.PI / 2, rotY, 0], color: TRIM });

  // walls — back, two sides, a front with a real doorway cut in it
  const segW = (W - DOORW) / 2;
  B.box('matte', W, H, T, { at: P(0, fl + H / 2, -D / 2 + T / 2), rot: [0, rotY, 0], color: WALL });
  for (const s of [-1, 1]) {
    B.box('matte', T, H, D, { at: P(s * (W / 2 - T / 2), fl + H / 2, 0), rot: [0, rotY, 0], color: WALL });
    B.box('matte', segW, H, T, { at: P(s * (W + DOORW) / 4, fl + H / 2, D / 2 - T / 2), rot: [0, rotY, 0], color: WALL });
  }
  B.box('matte', DOORW + 0.12, H - 2.4, T, { at: P(0, fl + 2.4 + (H - 2.4) / 2, D / 2 - T / 2), rot: [0, rotY, 0], color: WALL });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.cyl('icing', 0.17, 0.17, H, { at: P(sx * W / 2, fl + H / 2, sz * D / 2), rot: [0, rotY, 0], color: TRIM });
  }

  // gable roof — red and cream, the loudest thing on a brown shore
  const over = 0.55, rise = D * 0.44, slope = Math.hypot(D / 2 + over, rise), ang = Math.atan2(rise, D / 2 + over);
  const ry = fl + H;
  for (const sz of [-1, 1]) {
    B.stripeBox(W + over * 2, 0.26, slope, { at: P(0, ry + rise / 2, sz * (D / 2 + over) / 2), rot: [sz * ang, rotY, 0], variant: 0, axisH: slope * 0.7 });
  }
  for (const sx of [-1, 1]) {
    B.cyl('matte', 1, 1, 1, 3, { at: P(sx * (W / 2 - 0.14), ry + rise / 3, 0), rot: [-Math.PI / 2, Math.PI / 2 + rotY, 0], scale: [D / 1.732, 0.28, rise / 1.5], color: WALL });
  }
  B.stripeCyl(0.15, 0.15, W + over * 2, { at: P(0, ry + rise + 0.12, 0), rot: [0, rotY, Math.PI / 2], variant: 0, seg: 8 });
  for (const sz of [-1, 1]) icingDrip(B, ...P(0, ry - 0.03, sz * (D / 2 + over)), rotY, W + over * 2, { color: TRIM, r: 0.2, drop: 0.3, step: 0.6 });

  // door, step, board and lantern
  const dp = P(0, 0, D / 2);
  door(B, dp[0], y + fl, dp[2], rotY, { w: DOORW, h: 2.35, frame: TRIM, color: C.chocolate, knob: C.yellow });
  B.box('matte', 2.2, 0.2, 0.8, { at: P(0, 0.52, D / 2 + 0.55), rot: [0, rotY, 0], color: C.icing });
  B.signQuad('boats', 2.0, 1.35, { at: P(0, fl + H + rise * 0.42, D / 2 + 0.1), rot: [0, rotY, 0] });
  for (const sx of [-1, 1]) {
    const p = P(sx * (W / 2 - 1.15), 0, D / 2);
    windowPane(B, p[0], y + fl + H * 0.58, p[2], rotY, { w: 0.85, h: 0.85, frame: TRIM });
  }
  {
    const lp = P(0, fl + H - 0.55, D / 2 + 0.5);
    B.cyl('matte', 0.09, 0.1, 0.55, 6, { at: [lp[0], lp[1] + 0.5, lp[2]], color: C.licorice });
    B.sph('glowWarm', 0.42, 9, 7, { at: lp, color: C.lampAmber });
    B.sph('icing', 0.3, 7, 5, { at: [lp[0], lp[1] + 0.34, lp[2]], scale: [1, 0.5, 1], color: C.lampHood });
    softGlow(B, lp[0], lp[1], lp[2], 3.0);
  }
  // oars stacked against the gable, a coil of licorice rope on the step
  for (const k of [0, 1]) B.cyl('matte', 0.08, 0.12, 2.9, 6, { at: P(W / 2 - 0.35 - k * 0.22, 1.5, D / 2 - 0.25), rot: [0.3 + k * 0.06, rotY, 0.32], color: k ? C.chocMilk : C.caramel });
  B.tor('matte', 0.42, 0.12, 6, 12, { at: P(-W / 2 + 0.9, 0.62, D / 2 + 0.7), rot: [Math.PI / 2, 0, 0], color: C.licorice });

  // walls are solid; the doorway is a gap
  const top = y + fl + H;
  { const p = P(0, 0, -D / 2); A.collideBox(p[0], p[2], W, T, rotY, top); }
  for (const s2 of [-1, 1]) {
    const p = P(s2 * W / 2, 0, 0); A.collideBox(p[0], p[2], T, D, rotY, top);
    const q = P(s2 * (W + DOORW) / 4, 0, D / 2); A.collideBox(q[0], q[2], segW, T, rotY, top);
  }
  A.claim(x, z, W + 0.6, D + 0.6, rotY);
  A.mark('boathouse', x, y, z);
  A.readSign('boats', ...xz(P(0, 0, D / 2 + 1.8)), 2.8, 'Read: Boats');

  // ── the jetty ─────────────────────────────────────────────────────────────
  // Out from the door, over the bank, and four units past the waterline. Level
  // with the boathouse floor, on licorice piles, so the whole group reads as a
  // building standing at the edge of a lake instead of sliding into it.
  let shoreT = 3.0;
  for (let t = 1.4; t < 20; t += 0.4) {
    const p = P(0, 0, D / 2 + t);
    shoreT = t;
    if (world.height(p[0], p[2]) < WY - 0.25) break;
  }
  const jLen = Math.min(17, shoreT + 4.2), jy = y + fl - 0.06, NJ = Math.max(6, Math.round(jLen / 1.05));
  for (let i = 0; i < NJ; i++) {
    const t = D / 2 + 0.9 + (jLen - 0.9) * ((i + 0.5) / NJ);
    const p = P(0, 0, t);
    B.waffleBox(2.6, 0.2, (jLen - 0.9) / NJ + 0.12, { at: [p[0], jy, p[2]], rot: [0, rotY, 0], color: i % 2 ? C.wafer : C.waferPale });
    if (i % 3 === 1) for (const s of [-1, 1]) {
      const q = P(s * 1.15, 0, t);
      const bot = Math.min(world.height(q[0], q[2]) - 0.5, WY - 1.8);
      B.cyl('licorice', 0.2, 0.24, jy - bot, 8, { at: [q[0], (jy + bot) / 2, q[2]], color: C.licoriceSoft });
      B.stripeCyl(0.11, 0.12, 1.05, { at: [q[0], jy + 0.55, q[2]], variant: 3, seg: 6 });
      B.sph('gloss', 0.17, 6, 5, { at: [q[0], jy + 1.12, q[2]], color: SPRINKLE[i % SPRINKLE.length] });
    }
  }
  {
    const a0 = P(0, 0, D / 2 + 0.9), a1 = P(0, 0, D / 2 + jLen);
    A.deckSeg(a0[0], a0[2], a1[0], a1[2], 1.3, jy + 0.1, jy + 0.1, 0);
  }
  // two mooring bollards at the head, and a rope hoop on the near one
  const moor = [];
  for (const s of [-1, 1]) {
    const p = P(s * 1.2, 0, D / 2 + jLen - 0.7);
    B.cyl('matte', 0.26, 0.32, 1.1, 10, { at: [p[0], jy + 0.55, p[2]], color: C.plum });
    B.sph('gloss', 0.34, 9, 7, { at: [p[0], jy + 1.2, p[2]], color: s > 0 ? C.green : C.purple });
    moor.push(p);
  }
  B.tor('matte', 0.3, 0.075, 5, 12, { at: [moor[0][0], jy + 0.9, moor[0][2]], rot: [1.2, rotY, 0], color: C.licorice });

  // ── the swan paddle boat, striped, tied alongside ────────────────────────
  const bb = createBuilder(A.mats, A.signUV, null, A.builderOpts);
  bb.stripeBox(1.72, 0.66, 3.5, { at: [0, 0, 0], variant: 0, axisH: 1.5 });
  bb.cyl('matte', 0.82, 0.82, 1.7, 3, { at: [0, 0, 1.95], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.62], color: C.cream });
  bb.box('matte', 1.46, 0.16, 3.62, { at: [0, 0.36, 0], color: C.licoriceRed });     // gunwale
  bb.box('matte', 1.3, 0.28, 3.0, { at: [0, 0.3, 0], color: 0xf2d9c0 });
  for (const sz of [-0.75, 0.75]) bb.box('matte', 1.25, 0.14, 0.5, { at: [0, 0.44, sz], color: C.pink });
  for (let i = 0; i < 6; i++) {                                                       // swan neck
    const t = i / 5;
    bb.cyl('matte', 0.26 - t * 0.08, 0.3 - t * 0.08, 0.48, 8, { at: [0, 0.6 + t * 1.5, -1.0 - Math.sin(t * 1.6) * 0.5], rot: [t * 0.55, 0, 0], color: C.cream });
  }
  bb.sph('matte', 0.42, 10, 8, { at: [0, 2.25, -1.55], color: C.cream });
  bb.cone('gloss', 0.17, 0.55, 7, { at: [0, 2.2, -2.0], rot: [-Math.PI / 2, 0, 0], color: C.orange });
  for (const sx of [-0.2, 0.2]) bb.sph('gloss', 0.08, 6, 5, { at: [sx, 2.38, -1.85], color: 0x1a1420 });
  bb.cyl('matte', 0.5, 0.5, 0.14, 10, { at: [0, 0.15, 1.9], rot: [0, 0, Math.PI / 2], color: C.licoriceRed });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    bb.box('matte', 1.3, 0.42, 0.08, { at: [0, 0.15 + Math.sin(a) * 0.42, 1.9 + Math.cos(a) * 0.42], rot: [a, 0, 0], color: C.waferPale });
  }
  const boatGroup = new THREE.Group();
  bb.finish(boatGroup);
  // Moored along the side of the jetty the CAMERA is on (local +X faces the
  // approach), nose out into the chocolate — on the far side the jetty stood
  // between the lens and the boat and all you saw was a swan's neck.
  const bp = P(2.7, 0, D / 2 + jLen - 2.2);
  const bY = Math.max(WY + 0.46, world.height(bp[0], bp[2]) + 0.55);
  boatGroup.position.set(bp[0], bY, bp[2]);
  boatGroup.rotation.y = rotY + Math.PI;
  boatGroup.scale.setScalar(1.25);
  A.addObject(boatGroup);
  // the painter: a short licorice rope from the bow up to the bollard
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const px = bp[0] + (moor[1][0] - bp[0]) * t, pz = bp[2] + (moor[1][2] - bp[2]) * t;
    B.sph('matte', 0.09, 5, 4, { at: [px, bY + 0.9 + Math.sin(Math.PI * t) * -0.25 + t * 0.15, pz], color: C.licorice });
  }
  // chocolate closing round the hull, so it reads as floating and not parked
  for (const k of [1.0, 1.35, 1.75]) {
    B.tor('gloss', k * 1.5, 0.09, 5, 18, { at: [bp[0], bY - 0.24, bp[2]], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.62], color: C.caramel });
  }
  return { obj: boatGroup, y0: bY, bob: { f: 1.1, a: 0.10, ph: 0.4 } };
}

// ── fishing pier ────────────────────────────────────────────────────────────
function buildFishPier(A, X, Z, ang, shoreR, WY) {
  const { B, world } = A;
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const ax = X + dx * (shoreR + 1.6), az = Z + dz * (shoreR + 1.6);   // on land
  const bx = X + dx * Math.max(2.0, shoreR - 7.0), bz = Z + dz * Math.max(2.0, shoreR - 7.0);
  const deck = Math.max(world.height(ax, az), WY + 0.9) + 0.1;
  const rotY = Math.atan2(dx, dz);
  const N = 14, len = Math.hypot(bx - ax, bz - az);
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    B.waffleBox(2.4, 0.18, len / N + 0.1, { at: [px, deck, pz], rot: [0, rotY, 0], color: i % 2 ? C.wafer : C.waferPale });
    if (i % 4 === 1) for (const s of [-1, 1]) {
      const qx = px - dz * s * 1.1, qz = pz + dx * s * 1.1;
      const bot = Math.min(world.height(qx, qz) - 0.4, WY - 1.6);
      B.cyl('licorice', 0.19, 0.22, deck - bot, 7, { at: [qx, (deck + bot) / 2, qz], color: C.licoriceSoft });
      B.stripeCyl(0.11, 0.12, 1.1, { at: [qx, deck + 0.6, qz], variant: 3, seg: 6 });
      B.sph('gloss', 0.17, 6, 5, { at: [qx, deck + 1.18, qz], color: SPRINKLE[i % SPRINKLE.length] });
    }
  }
  A.deckSeg(ax, az, bx, bz, 1.2, deck, deck, 0);
  // a bucket, a rod and one very hopeful chair
  B.cyl('matte', 0.34, 0.28, 0.6, 9, { at: [bx + dz * 0.7, deck + 0.4, bz - dx * 0.7], color: C.blue });
  B.cyl('matte', 0.05, 0.07, 3.0, 5, { at: [bx - dz * 0.6, deck + 1.1, bz + dx * 0.6], rot: [0.85, rotY + 1.2, 0], color: C.chocMilk });
  bench(B, ax + dx * 1.2, deck, az + dz * 1.2, rotY, { w: 1.6, A });
  fenceLine(B, [[ax - dz * 3.0, az + dx * 3.0], [ax - dz * 6.0, az + dx * 6.0]], (px, pz) => world.height(px, pz), { tipColor: C.caramel, A });
}
