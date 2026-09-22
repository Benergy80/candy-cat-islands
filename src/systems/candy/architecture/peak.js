// FROSTING PEAK — landmark frosting_peak (-175, -62), the white summit.
// A giant wafer-cone lookout tower, a cherry-on-top monument at the very top,
// a candy-cane footbridge where the river is born, and a waffle cave (secret)
// on the north slope.
import { C, SPRINKLE, windowPane, door, icingDrip, bench, fenceLine, softGlow, lightPool, lamppost, plaque } from './kit.js';
import * as IN from './interiors.js';

export function buildPeak(A) {
  const { B, world } = A;
  const movers = [];
  buildMonument(A);
  buildLookout(A);
  buildRiverBridge(A);
  const cave = buildCave(A);
  buildReveal(A);
  return { movers, cave };
}

// ── the cherry on top ────────────────────────────────────────────────────────
/**
 * THE CHERRY MONUMENT. Round 2 of review: from the approach path nobody could
 * find it. It was 10 units tall on a WHITE summit, in a forest of 8-unit candy
 * canes, with a cherry so deeply saturated it read as a hole. So: half again as
 * tall, a brighter cherry with a real highlight, four candy-cane banner poles
 * that break the skyline, and an 18-unit apron claimed off the vegetation.
 */
function buildMonument(A) {
  const { B, world } = A;
  const X = -175, Z = -62, y = world.height(X, Z);
  A.mark('cherry_monument', X, y, Z);
  // The lookout cone stands EIGHT units away with a 5.4 radius, so a ring of
  // anything at radius 6–8 round the monument puts props inside the tower — the
  // lanterns have been doing it since wave 1 and the new banner poles joined
  // them. Anything that lands in the drum is dropped.
  const clearOfTower = (px, pz) => Math.hypot(px - -181.5, pz - -57.5) > 6.4;
  // stepped icing plinth
  // the summit is WHITE, so a white plinth vanishes into it: alternate icing
  // with icing-pink and ring every tier in syrup
  const tiers = [[6.0, 1.05], [4.7, 0.95], [3.6, 0.95]];
  const tierCols = [C.icingPink, C.icing, C.icingPink];
  let ty = y;
  tiers.forEach(([rad, h], ti) => {
    B.cyl('icing', rad - 0.2, rad, h, 20, { at: [X, ty + h / 2, Z], color: tierCols[ti] });
    B.tor('gloss', rad - 0.12, 0.2, 6, 22, { at: [X, ty + h, Z], rot: [Math.PI / 2, 0, 0], color: C.syrup });
    ty += h;
  });
  A.deckRing(X, Z, 0, 5.7, y + 1.05);
  A.deckRing(X, Z, 0, 4.5, y + 2.0);
  A.deckRing(X, Z, 0, 3.4, y + 2.95);
  // ── the column, and what is on top of it ─────────────────────────────────
  // ROUND 3: "the cherry must sit ON the tower, no black rod poking out." Both
  // faults were here. The monument carried a 3.4-unit cherry on a 6-unit column
  // eight units in front of the lookout — from every approach the two stacked
  // up and competed — and above the cherry ran nine dark-green cylinders that
  // at a hundred units read as a black aerial stuck in a tomato.
  //
  // So the CHERRY has moved onto the tower's roof, where it belongs and where
  // it is the tallest thing on the island. What stands here now is a piped
  // sugarloaf: shorter, paler, a plinth for the tower behind it rather than a
  // rival for it — and nothing thin sticking out of the top of anything.
  B.stripeCyl(1.25, 1.8, 3.4, { at: [X, ty + 1.7, Z], variant: 0, seg: 14 });
  B.tor('gloss', 1.42, 0.24, 7, 18, { at: [X, ty + 3.4, Z], rot: [Math.PI / 2, 0, 0], color: C.syrup });
  B.tor('icing', 1.9, 0.26, 7, 18, { at: [X, ty + 0.12, Z], rot: [Math.PI / 2, 0, 0], color: C.icing });
  const cy = ty + 3.4;
  for (let i = 0; i < 7; i++) {                    // a piped swirl of frosting
    const t = i / 6, a = t * Math.PI * 2.4;
    const rr = 1.55 * (1 - t * 0.82);
    B.sph('icing', 1.5 * (1 - t * 0.62), 10, 7, {
      at: [X + Math.cos(a) * rr * 0.42, cy + 0.5 + t * 3.0, Z + Math.sin(a) * rr * 0.42],
      scale: [1, 0.82, 1], color: i % 2 ? C.icingPink : C.icing,
    });
  }
  B.sph('gloss', 1.15, 14, 10, { at: [X, cy + 4.3, Z], scale: [1, 0.95, 1], color: 0xff7fb5 });
  B.sph('gloss', 0.5, 10, 8, { at: [X, cy + 5.3, Z], color: C.red });
  A.mark('cherry_top', X, cy + 5.3, Z);
  // four candy-cane banner poles: vertical red-and-cream against a white summit
  // is the one thing on this whole hill that reads from the path
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.28;
    const px = X + Math.cos(a) * 7.8, pz = Z + Math.sin(a) * 7.8, gy = world.height(px, pz);
    if (!clearOfTower(px, pz)) continue;
    B.cyl('matte', 0.5, 0.66, 0.4, 10, { at: [px, gy + 0.2, pz], color: C.plum });
    B.stripeCyl(0.24, 0.3, 9.0, { at: [px, gy + 4.9, pz], variant: 0, seg: 9 });
    B.sph('gloss', 0.46, 9, 7, { at: [px, gy + 9.5, pz], color: SPRINKLE[i % SPRINKLE.length] });
    // a pennant, so the poles read as a monument and not as scaffolding
    for (let k = 0; k < 3; k++) {
      A.inst.bunting.push({ x: px, y: gy + 8.4 - k * 0.75, z: pz, w: 1.5, h: 0.9, ry: a + Math.PI / 2, ph: i * 1.3 + k, color: SPRINKLE[(i + k) % SPRINKLE.length] });
    }
    A.collide(px, pz, 0.55);
  }
  // glowing lanterns at the base (no extra point light — emissive only)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const px = X + Math.cos(a) * 6.9, pz = Z + Math.sin(a) * 6.9, gy = world.height(px, pz);
    if (!clearOfTower(px, pz)) continue;
    B.cyl('matte', 0.17, 0.24, 1.5, 7, { at: [px, gy + 0.75, pz], color: C.plum });
    B.sph('glowWarm', 0.46, 9, 7, { at: [px, gy + 1.8, pz], color: C.lampAmber });
    B.sph('icing', 0.3, 8, 5, { at: [px, gy + 2.15, pz], scale: [1, 0.5, 1], color: C.lampHood });
    softGlow(B, px, gy + 1.8, pz, 2.3);
    lightPool(B, px, gy, pz, 2.0);
  }
  // ── the plaque ────────────────────────────────────────────────────────────
  // It used to stand at Z + 5.9 facing due south — edge-on to everybody walking
  // up from the viewpoint — in the one annulus (5.4 to 8.6) that nothing had
  // claimed, so a candy cane grew straight through it. It now faces the
  // approach, on two posts, and the apron below starts at 4.2 instead of 8.6.
  const APP = Math.atan2(-64 - Z, -149 - X);        // toward the peak viewpoint
  const pRot = Math.PI / 2 - APP;
  const ppx = X + Math.cos(APP) * 7.0, ppz = Z + Math.sin(APP) * 7.0;
  const ppy = world.height(ppx, ppz);
  for (const s of [-1, 1]) {
    const qx = ppx + Math.cos(APP + Math.PI / 2) * s * 1.72, qz = ppz + Math.sin(APP + Math.PI / 2) * s * 1.72;
    B.stripeCyl(0.17, 0.2, 2.6, { at: [qx, world.height(qx, qz) + 1.3, qz], variant: 0, seg: 8 });
    B.sph('gloss', 0.28, 8, 6, { at: [qx, world.height(qx, qz) + 2.72, qz], color: s > 0 ? C.teal : C.yellow });
  }
  B.box('licorice', 3.6, 1.5, 0.2, { at: [ppx, ppy + 2.15, ppz], rot: [0, pRot, 0], color: C.licorice });
  B.signQuad('peak', 3.3, 1.32, { at: [ppx + Math.sin(pRot) * 0.14, ppy + 2.15, ppz + Math.cos(pRot) * 0.14], rot: [0, pRot, 0] });
  A.collide(ppx, ppz, 0.9);
  A.readSign('peak', ppx + Math.cos(APP) * 1.6, ppz + Math.sin(APP) * 1.6, 3.4, 'Read the summit plaque');
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; A.collide(X + Math.cos(a) * 3.0, Z + Math.sin(a) * 3.0, 2.4); }
  // keep the canes off the summit so the silhouette is whole from the path
  A.claimApron(X, Z, 4.2, 19.0, { r: 3.2 });
  summitGrounds(A, X, Z, y, APP);
}

/**
 * THE SUMMIT GROUNDS. Round 3: "bare white frosting slope at the peak" — the
 * monument and the tower stood on an empty white dome with nothing between
 * them, so neither had a site and the whole hill read as two props dropped on a
 * meringue. This is the ground they stand on: a flagged wafer path up from the
 * viewpoint, a rope line along it, a warming hut with a cocoa urn, two benches
 * facing the view, lamps, and drifts of rock candy pushed up out of the frosting.
 */
function summitGrounds(A, X, Z, y, APP) {
  const { B, world } = A;
  const r = A.rng('summit');
  const clearOfTower = (px, pz) => Math.hypot(px - -181.5, pz - -57.5) > 7.0 && Math.hypot(px - X, pz - Z) > 4.6;
  const ca = Math.cos(APP), sa = Math.sin(APP);
  const px2 = -sa, pz2 = ca;                       // across the path

  // ── the flagged approach ──────────────────────────────────────────────────
  for (let i = 0; i < 16; i++) {
    const rad = 6.2 + i * 1.55;
    const wob = Math.sin(i * 0.9) * 0.9;
    const fx = X + ca * rad + px2 * wob, fz = Z + sa * rad + pz2 * wob;
    const gy = world.height(fx, fz);
    if (!(gy > 0.4)) continue;
    B.waffleBox(2.6, 0.16, 1.5, { at: [fx, gy + 0.08, fz], rot: [0, Math.atan2(ca, sa), 0], color: i % 2 ? C.waferPale : C.wafer });
    for (const s of [-1, 1]) B.sph('icing', 0.26, 5, 4, { at: [fx + px2 * s * 1.4, gy + 0.16, fz + pz2 * s * 1.4], scale: [1, 0.7, 1], color: i % 3 ? C.icing : C.icingPink });
    // a rope line along the left-hand side, on short candy-cane stakes
    if (i % 3 === 1) {
      const sx = fx + px2 * 2.1, sz = fz + pz2 * 2.1, sy = world.height(sx, sz);
      B.stripeCyl(0.11, 0.13, 1.25, { at: [sx, sy + 0.62, sz], variant: 0, seg: 6 });
      B.sph('gloss', 0.19, 6, 5, { at: [sx, sy + 1.3, sz], color: SPRINKLE[i % SPRINKLE.length] });
      B.box('matte', 0.09, 0.09, 4.7, { at: [sx + ca * 2.3, sy + 1.05, sz + sa * 2.3], rot: [0, Math.atan2(ca, sa), 0], color: C.licorice });
    }
  }

  // ── drifts of rock candy pushed up out of the frosting ───────────────────
  const CRYST = [0xffd6e8, 0xd2f7e6, 0xfff0b0, 0xe6d4ff, 0xffffff];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.45, rad = 10.5 + r.range(0, 7);
    const cx = X + Math.cos(a) * rad, cz = Z + Math.sin(a) * rad;
    if (!clearOfTower(cx, cz) || !(world.height(cx, cz) > 0.4)) continue;
    for (let i = 0; i < 5; i++) {
      const aa = r.range(0, 6.283), dd = r.range(0.3, 2.3);
      const qx = cx + Math.cos(aa) * dd, qz = cz + Math.sin(aa) * dd;
      const s = r.range(0.42, 1.35);
      B.cyl('gloss', s * 0.24, s * 0.62, s * 2.5, 6, {
        at: [qx, world.height(qx, qz) + s * 1.05, qz],
        rot: [r.range(-0.26, 0.26), r.range(0, 3), r.range(-0.26, 0.26)], color: CRYST[(k + i) % CRYST.length],
      });
    }
    A.collide(cx, cz, 2.0);
  }

  // ── the warming hut: a wafer lean-to with a cocoa urn ────────────────────
  {
    const a = APP + 1.05, rad = 10.6;
    const hx = X + Math.cos(a) * rad, hz = Z + Math.sin(a) * rad, hy = world.height(hx, hz);
    if (hy > 0.4 && clearOfTower(hx, hz)) {
      const rot = Math.atan2(X - hx, Z - hz);
      const cs2 = Math.cos(rot), sn2 = Math.sin(rot);
      const P = (lx, ly, lz) => [hx + lx * cs2 + lz * sn2, hy + ly, hz - lx * sn2 + lz * cs2];
      B.waffleBox(3.4, 0.22, 2.4, { at: P(0, 0.11, 0), rot: [0, rot, 0], color: C.waferPale });
      B.waffleBox(3.4, 2.1, 0.26, { at: P(0, 1.15, -1.1), rot: [0, rot, 0], color: C.wafer });
      for (const s of [-1, 1]) B.stripeCyl(0.14, 0.16, 2.3, { at: P(s * 1.55, 1.15, 1.05), variant: 0, seg: 7 });
      B.stripeBox(3.9, 0.16, 2.9, { at: P(0, 2.42, 0.1), rot: [-0.26, rot, 0], variant: 2, axisH: 2.0 });
      icingDrip(B, ...P(0, 2.3, 1.45), rot, 3.9, { color: C.icingMint, r: 0.2, drop: 0.3 });
      // the urn, two mugs and a crate
      const u = P(-0.9, 0, -0.3);
      B.cyl('gloss', 0.42, 0.5, 0.9, 12, { at: [u[0], u[1] + 1.0, u[2]], color: C.chocMilk });
      B.cyl('icing', 0.46, 0.46, 0.12, 12, { at: [u[0], u[1] + 1.5, u[2]], color: C.icing });
      B.cyl('matte', 0.07, 0.07, 0.34, 5, { at: [u[0], u[1] + 1.15, u[2] + 0.5], rot: [1.2, 0, 0], color: C.licorice });
      for (let i = 0; i < 3; i++) {
        const m = P(0.3 + i * 0.42, 0, -0.25);
        B.cyl('gloss', 0.15, 0.13, 0.26, 8, { at: [m[0], m[1] + 0.98, m[2]], color: SPRINKLE[i % SPRINKLE.length] });
      }
      B.waffleBox(1.0, 0.85, 0.9, { at: P(1.1, 0.55, 0.55), rot: [0, rot + 0.3, 0], color: C.wafer });
      A.collide(hx, hz, 2.0);
      A.interact({
        id: 'candy_summit_cocoa', x: P(0, 0, 1.6)[0], z: P(0, 0, 1.6)[2], r: 2.4, label: 'Help yourself to cocoa',
        onInteract(ctx) {
          ctx.systems.ui?.say('The urn is hot. It is always hot. A card beside it says HELP YOURSELF, and under that, in the same hand, ONE EACH, and under that, much later, WE ARE COUNTING.', { speaker: 'Summit Hut', duration: 7.5 });
        },
      });
    }
  }

  // ── benches facing the view, and two lamps on the path ───────────────────
  for (const s of [-1, 1]) {
    const bx = X + Math.cos(APP + s * 0.55) * 8.6, bz = Z + Math.sin(APP + s * 0.55) * 8.6;
    if (!clearOfTower(bx, bz) || !(world.height(bx, bz) > 0.4)) continue;
    bench(B, bx, world.height(bx, bz), bz, Math.atan2(-Math.cos(APP), -Math.sin(APP)) + Math.PI, { w: 2.4, A });
  }
  for (const d of [9.5, 18.0]) {
    const lx = X + ca * d + px2 * 2.6, lz = Z + sa * d + pz2 * 2.6;
    if (!clearOfTower(lx, lz) || !(world.height(lx, lz) > 0.4)) continue;
    const p = A.freeSpot(lx, lz, 2.0);
    lamppost(B, p.x, world.height(p.x, p.z), p.z, { h: 3.4, variant: 0 });
    A.collide(p.x, p.z, 0.8);
  }
  // a sledge somebody left, and their hat
  {
    const sx = X + Math.cos(APP - 0.9) * 9.4, sz = Z + Math.sin(APP - 0.9) * 9.4;
    const sy = world.height(sx, sz);
    if (sy > 0.4 && clearOfTower(sx, sz)) {
      B.waffleBox(1.1, 0.14, 2.3, { at: [sx, sy + 0.3, sz], rot: [0, 0.7, 0.1], color: C.wafer });
      for (const s of [-1, 1]) B.cyl('licorice', 0.07, 0.07, 2.2, 6, { at: [sx + Math.cos(0.7) * s * 0.5, sy + 0.14, sz - Math.sin(0.7) * s * 0.5], rot: [Math.PI / 2, 0.7, 0], color: C.licoriceRed });
      B.cyl('matte', 0.22, 0.3, 0.22, 9, { at: [sx + 1.4, sy + 0.14, sz + 0.5], rot: [0.5, 0, 0.2], color: C.red });
      B.cyl('matte', 0.46, 0.46, 0.05, 11, { at: [sx + 1.4, sy + 0.05, sz + 0.5], rot: [0.5, 0, 0.2], color: C.red });
    }
  }
}

// ── the wafer-cone lookout ───────────────────────────────────────────────────
/**
 * THE FROSTING PEAK LOOKOUT — a wafer cone you can climb INSIDE. A spiral of
 * wafer treads winds up the cone (registered with A.stairSpiral, which returns
 * the flight nearest the player's own height, so three turns stacked over the
 * same footprint all work), up through the opening in the platform, and out
 * onto the gallery with the whole island underneath you.
 */
function buildLookout(A) {
  const { B, world } = A;
  const X = -181.5, Z = -57.5, y = world.height(X, Z);
  // 16.4 tall, not 13.2: from the approach path the cone's top third is all you
  // ever see over the shoulder of the summit, so the top third has to be the
  // loud part — a red-and-cream roof and a cherry, above hoop bands in
  // licorice-red that tell you the plain wafer drum underneath is a building.
  const H = 16.4, RB = 5.4, RT = 3.2;
  const FLOOR = y + 0.15, PY = y + H, PLAT = PY + 0.34;
  A.mark('lookout_tower', X, y, Z);

  const E = A.building({
    id: 'lookout_tower', name: 'the lookout tower', x: X, z: Z,
    radius: RB - 0.6, rot: 0, floorY: FLOOR, pad: 0.2, tall: true,
  });
  const W = E.wall, I = E.in;

  W.waffleCyl(RT, RB, H, 18, { at: [X, y + H / 2, Z], color: C.wafer });
  // hoop bands — licorice-red, fat enough to see from the path
  for (let i = 1; i < 6; i++) {
    const t = i / 6, rr = RB + (RT - RB) * t;
    W.tor('matte', rr + 0.1, 0.22, 5, 20, { at: [X, y + H * t, Z], rot: [Math.PI / 2, 0, 0], color: i % 2 ? C.licoriceRed : C.waferDark });
  }
  // spiralling windows (there are stairs in there, and now there really are)
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.6) / 7, a = i * 1.15;
    const rr = RB + (RT - RB) * t + 0.2;
    windowPane(W, X + Math.cos(a) * rr, y + H * t, Z + Math.sin(a) * rr, Math.atan2(Math.cos(a), Math.sin(a)), { w: 0.6, h: 0.9, frame: C.icing, pink: i % 2 === 1, sill: false });
  }
  // door at the base
  const da = Math.PI * 0.35;
  const dx = X + Math.cos(da) * (RB - 0.15), dz = Z + Math.sin(da) * (RB - 0.15);
  const dy = world.height(dx, dz);
  const dRot = Math.atan2(Math.cos(da), Math.sin(da));
  door(B, dx, dy, dz, dRot, { w: 1.3, h: 2.3, frame: C.icing, color: C.chocolate, knob: C.red, leaf: false });
  E.door({ x: dx, y: dy - 0.02, z: dz, rot: dRot, w: 1.25, h: 2.25, color: C.chocolate, swing: 1, r: 2.6, say: 'The card in the window still says CLOSED FOR COUNTING. The door was never locked.' });
  A.collideRing(X, Z, RB - 0.05, 14, y + H, da, 0.2);
  A.claimCircle(X, Z, RB + 0.3);
  A.claimApron(X, Z, RB + 1.6, 15.5, { r: 3.2 });

  // ── platform: an ANNULUS, so the stair can come up through the middle ─────
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r0 = RT + 0.15, r1 = 4.35, rm = (r0 + r1) / 2;
    B.waffleBox(r1 - r0, 0.32, 2 * Math.PI * rm / 16 + 0.3, { at: [X + Math.cos(a) * rm, PY + 0.16, Z + Math.sin(a) * rm], rot: [0, -a, 0], color: i % 2 ? C.waferPale : C.wafer });
  }
  B.tor('gloss', 4.35, 0.2, 6, 22, { at: [X, PY + 0.3, Z], rot: [Math.PI / 2, 0, 0], color: C.icingPink });
  B.tor('gloss', RT + 0.15, 0.14, 5, 16, { at: [X, PY + 0.36, Z], rot: [Math.PI / 2, 0, 0], color: C.icingPink });
  A.deckRing(X, Z, RT + 0.25, 4.15, PLAT);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const px = X + Math.cos(a) * 4.1, pz = Z + Math.sin(a) * 4.1;
    B.stripeCyl(0.12, 0.13, 1.1, { at: [px, PY + 0.85, pz], variant: 0, seg: 6 });
    B.sph('gloss', 0.18, 6, 5, { at: [px, PY + 1.42, pz], color: SPRINKLE[i % SPRINKLE.length] });
  }
  B.tor('licorice', 4.1, 0.09, 5, 24, { at: [X, PY + 1.3, Z], rot: [Math.PI / 2, 0, 0], color: C.licorice });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    B.stripeCyl(0.15, 0.16, 2.4, { at: [X + Math.cos(a) * 3.5, PY + 1.5, Z + Math.sin(a) * 3.5], variant: 2, seg: 7 });
  }
  // the roof: a BIG red-and-cream cone, and a cherry on it. This is the part of
  // the tower that clears the summit from the approach, so it carries the colour.
  B.stripeCyl(0.16, 5.7, 3.1, { at: [X, PY + 4.3, Z], variant: 0, seg: 18 });
  B.tor('gloss', 5.7, 0.22, 6, 22, { at: [X, PY + 2.78, Z], rot: [Math.PI / 2, 0, 0], color: C.syrup });
  // ── THE CHERRY, ON THE TOWER ─────────────────────────────────────────────
  // It used to be 1.35 units of red lost on the roof while a 3.4-unit cherry
  // stood on a column eight units away and the two fought. There is now exactly
  // one cherry on Frosting Peak and it is HERE, sitting straight on the cone at
  // 2.8 units, forty-two units off the deck — the tallest thing for a hundred
  // units in any direction, and unmistakably a cherry on a cone.
  B.tor('gloss', 1.25, 0.26, 7, 18, { at: [X, PY + 5.55, Z], rot: [Math.PI / 2, 0, 0], color: C.syrup });
  B.sph('matte', 2.8, 18, 14, { at: [X, PY + 7.9, Z], color: 0xff5566 });
  B.sph('matte', 1.55, 10, 8, { at: [X - 0.85, PY + 9.5, Z + 0.8], scale: [1, 0.78, 1], color: 0xffd8de });
  B.sph('matte', 0.95, 9, 7, { at: [X + 1.35, PY + 9.35, Z - 1.0], scale: [1, 0.8, 1], color: 0xff9fb0 });
  B.tor('icing', 1.05, 0.24, 6, 16, { at: [X, PY + 10.5, Z], rot: [Math.PI / 2, 0, 0], color: 0xffd3dc });
  // THE STALK. Round 3: "no black rod poking out." The old one was nine
  // cylinders of 0x2f6b2a — a colour that samples at 4% luminance and reads as
  // a black aerial against the sky. This one is fat, bright, leaf-green, and it
  // CURVES, so it reads as a stalk from any distance.
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    B.cyl('matte', 0.30 - t * 0.06, 0.34 - t * 0.06, 0.62, 7, {
      at: [X + Math.sin(t * 1.45) * 1.85, PY + 10.6 + t * 2.0, Z + 0.1],
      rot: [0, 0, -0.32 - t * 0.52], color: t < 0.5 ? 0x5fbf47 : 0x7ad45f,
    });
  }
  B.ico('matteFlat', 0.95, 0, { at: [X + 2.45, PY + 12.9, Z + 0.35], scale: [1.8, 0.3, 1.1], rot: [0, 0.5, 0.25], color: 0x8fe06a });
  B.sph('gloss', 0.3, 8, 6, { at: [X + 1.85, PY + 12.7, Z], color: 0xa8f07f });
  A.mark('cherry_tower', X, PY + 7.9, Z);
  // a scoop of ice cream leaning on the rail, because it is a cone after all
  B.sph('icing', 1.5, 12, 9, { at: [X + 2.6, PY + 1.4, Z - 2.0], scale: [1, 0.85, 1], color: C.icingMint });
  B.sph('icing', 1.0, 10, 8, { at: [X + 3.0, PY + 2.3, Z - 2.5], color: C.icingMint });
  // a big wind-spinner off the eaves (motion on the skyline)
  A.inst.spinners.push({ x: X + 4.4, y: PY + 3.2, z: Z + 1.2, ry: 0.4, ph: 0, spd: 1.8, s: 2.1, color: C.yellow });

  // ── inside: 214 steps (we counted) ───────────────────────────────────────
  // treads run from the newel out to the cone wall, so wherever you stand
  // inside the tower you are on a step — a narrow ribbon of stair in a cone you
  // cannot see into is impossible to stay on.
  const TURNS = 2.5, rA = 2.9, rB = 1.72, HALF = 2.3, HALF_B = 1.2;
  I.cyl('matte', RB - 0.1, RB - 0.1, 0.18, 18, { at: [X, FLOOR - 0.09, Z], color: 0xb98a53 });
  A.deckRing(X, Z, 0, RB - 0.05, FLOOR);
  const NT = 50;
  for (let i = 0; i <= NT; i++) {
    const t = i / NT, a = da + t * TURNS * Math.PI * 2;
    const rc = rA + (rB - rA) * t, ty = FLOOR + (PLAT - FLOOR) * t;
    const hw = HALF + (HALF_B - HALF) * t;
    I.waffleBox(hw * 2, 0.16, Math.max(0.5, 2 * Math.PI * rc / NT * TURNS + 0.3), {
      at: [X + Math.cos(a) * rc, ty, Z + Math.sin(a) * rc], rot: [0, -a, 0],
      color: i % 2 ? C.wafer : C.waferPale,
    });
    if (i % 3 === 0) I.cyl('licorice', 0.05, 0.05, 0.85, 5, { at: [X + Math.cos(a) * (rc + hw - 0.12), ty + 0.5, Z + Math.sin(a) * (rc + hw - 0.12)], color: C.licorice });
  }
  A.stairSpiral(X, Z, da, TURNS, rA, rB, HALF, FLOOR, PLAT, HALF_B);
  // the newel the stair winds around
  I.cyl('matte', 0.3, 0.34, H, 8, { at: [X, FLOOR + H / 2, Z], color: C.waferDark });
  // the counting: a slate, a stub of chalk, and a crate to sit on
  I.box('matte', 1.5, 1.05, 0.1, { at: [X - Math.cos(da) * (RB - 0.45), FLOOR + 1.5, Z - Math.sin(da) * (RB - 0.45)], rot: [0, Math.atan2(-Math.cos(da), -Math.sin(da)) + Math.PI, 0], color: C.licorice });
  I.signQuad('tally', 1.36, 0.92, { at: [X - Math.cos(da) * (RB - 0.52), FLOOR + 1.5, Z - Math.sin(da) * (RB - 0.52)], rot: [0, Math.atan2(-Math.cos(da), -Math.sin(da)) + Math.PI, 0] });
  IN.stool(I, IN.frameAt(X, FLOOR, Z, 0), -Math.cos(da) * 2.1, -Math.sin(da) * 2.1);
  const lamp = IN.ceilingLamp(I, IN.frameAt(X, FLOOR, Z, 0), 0, 2.9, 1.6, { drop: 0.4, glow: 2.2, hood: C.icingMint });
  E.lamp(lamp.x, lamp.y, lamp.z, 0xbff0d8);

  const ip = [X - Math.cos(da) * (RB - 1.8), Z - Math.sin(da) * (RB - 1.8)];
  A.interact({
    id: 'lookout_tally', x: ip[0], z: ip[1], r: 1.8, label: 'Read the slate',
    onInteract(ctx) {
      ctx.systems.story?.set('read_tally', true);
      ctx.systems.ui?.say('Tally marks in four blocks. The first three are crossed through and labelled "arrived". The fourth has one mark in it, drawn today, and it has not been labelled yet.', { speaker: 'Lookout Tower', duration: 7.5 });
    },
  });
  A.interact({
    id: 'candy_lookout_view', x: X, z: Z + 2.2, r: 3.0, label: 'Look out from the tower',
    getPos: () => ({ x: X, z: Z }),
    enabled: true,
    onInteract: (ctx) => ctx.systems.ui?.say('From up here you can see the whole island: the village, the pier, the cupcake — and eleven small figures in the meadow, all standing perfectly still, all facing this tower.', { speaker: 'Frosting Peak', duration: 7.5 }),
  });
  E.finish();
}

// ── candy-cane footbridge at the river source ────────────────────────────────
function buildRiverBridge(A) {
  const { B, world } = A;
  const CX = -170.4, CZ = -50.2;
  const px = 0.79, pz = -0.61;     // across the river
  const half = 6.4;
  const ax = CX - px * half, az = CZ - pz * half;
  const bx = CX + px * half, bz = CZ + pz * half;
  const yA = world.height(ax, az) + 0.55, yB = world.height(bx, bz) + 0.55;
  const crown = 1.1;
  const rotY = Math.atan2(px, pz);
  A.mark('peak_bridge', CX, (yA + yB) / 2, CZ);

  const N = 18;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const yy = yA + (yB - yA) * t + crown * Math.sin(Math.PI * t);
    B.waffleBox(3.6, 0.22, (half * 2) / N + 0.12, { at: [x, yy, z], rot: [0, rotY, 0], color: i % 2 ? C.wafer : C.waferPale });
  }
  for (const s of [-1, 1]) for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const x = ax + (bx - ax) * t - pz * s * 1.7, z = az + (bz - az) * t + px * s * 1.7;
    const yy = yA + (yB - yA) * t + crown * Math.sin(Math.PI * t);
    B.stripeCyl(0.17, 0.19, 1.5, { at: [x, yy + 0.75, z], variant: 0, seg: 7 });
    B.sph('gloss', 0.3, 7, 6, { at: [x, yy + 1.58, z], color: SPRINKLE[i % SPRINKLE.length] });
  }
  // A CANDY-CANE ARCH over the crown of the bridge. From the approach the
  // bridge is a flat ribbon lying in white snow and reads as nothing at all;
  // an arch is 5 units of red-and-cream standing UP out of the slope, and it
  // tells you from a hundred units away that there is a crossing here.
  {
    const my = yA + (yB - yA) * 0.5 + crown;
    for (const s of [-1, 1]) {
      const hx = CX - pz * s * 2.0, hz = CZ + px * s * 2.0;
      B.stripeCyl(0.26, 0.32, 4.6, { at: [hx, my + 2.3, hz], variant: 0, seg: 9 });
    }
    // the torus lies in its local XY plane, so a yaw of rotY swings its span
    // onto the bridge's CROSS axis — the arch stands across the deck
    B.stripeTor(2.0, 0.26, 6, 16, { at: [CX, my + 4.6, CZ], rot: [0, rotY, 0], arc: Math.PI, variant: 0 });
    B.sph('gloss', 0.5, 9, 7, { at: [CX, my + 6.7, CZ], color: C.red });
    for (const s of [-1, 1]) B.sph('gloss', 0.34, 7, 6, { at: [CX - pz * s * 2.0, my + 4.75, CZ + px * s * 2.0], color: s > 0 ? C.yellow : C.teal });
  }
  // rails follow the arch
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) {
    const t0 = i / 12, t1 = (i + 1) / 12, tm = (t0 + t1) / 2;
    const x = ax + (bx - ax) * tm - pz * s * 1.4, z = az + (bz - az) * tm + px * s * 1.4;
    const y0 = yA + (yB - yA) * t0 + crown * Math.sin(Math.PI * t0);
    const y1 = yA + (yB - yA) * t1 + crown * Math.sin(Math.PI * t1);
    const seg = (half * 2) / 12;
    B.box('matte', 0.15, 0.15, seg + 0.1, { at: [x, (y0 + y1) / 2 + 1.05, z], rot: [-Math.atan2(y1 - y0, seg), rotY, 0], color: C.licoriceRed });
  }
  A.deckSeg(ax, az, bx, bz, 1.45, yA, yB, crown);
  A.readSign('bridge', bx + px * 1.6, bz + pz * 1.6, 2.8, 'Read the bridge sign');
  B.stripeCyl(0.1, 0.12, 1.8, { at: [bx + px * 1.8, world.height(bx + px * 1.8, bz + pz * 1.8) + 0.9, bz + pz * 1.8], variant: 1, seg: 6 });
  plaque(B, 'bridge', 1.1, 0.8, { at: [bx + px * 1.82, world.height(bx + px * 1.8, bz + pz * 1.8) + 2.1, bz + pz * 1.82], rot: [0, rotY + Math.PI / 2, 0] });
}

// ── the reveal: where you first see the peak ─────────────────────────────────
/**
 * THE FIRST SIGHT OF FROSTING PEAK. candy_north runs (−140,−70) → (−175,−62)
 * and the whole summit — tower, monument, bridge — opens up about a third of
 * the way along it. Round 2 of review said nobody could find any of the three,
 * so this is a built VIEWPOINT at that spot: a wafer platform off the south
 * side of the path, two candy-cane posts framing the summit, a bench facing it
 * and a sign. `A.mark` publishes it, and architecture.js hands it to the camera
 * as great_cupcake / cherry_monument's `revealFrom`.
 */
function buildReveal(A) {
  const { B, world } = A;
  // a third of the way along the last leg of candy_north, 3.5 units off the road
  const px = -151.4, pz = -66.9;
  const dir = Math.atan2(-175 - -140, -62 - -70);       // toward the summit
  const off = A.freeSpot(px + 2.2, pz + 3.0, 2.0);
  const x = off.x, z = off.z, y = world.height(x, z);
  if (!(y > 0.4)) return;
  A.mark('peak_viewpoint', x, y, z);

  // a wafer terrace, so the spot reads as somewhere to stand
  B.waffleCyl(3.3, 3.5, 0.5, 12, { at: [x, y + 0.25, z], color: C.waferPale });
  B.tor('icing', 3.3, 0.16, 5, 20, { at: [x, y + 0.48, z], rot: [Math.PI / 2, 0, 0], color: C.icingPink });
  A.deckRing(x, z, 0, 3.2, y + 0.5);
  // two candy-cane posts framing the summit like a gunsight
  const fx = Math.cos(dir + Math.PI / 2), fz = Math.sin(dir + Math.PI / 2);
  for (const s of [-1, 1]) {
    const qx = x + fx * s * 2.6, qz = z + fz * s * 2.6;
    B.stripeCyl(0.2, 0.26, 5.2, { at: [qx, y + 3.1, qz], variant: 0, seg: 9 });
    B.sph('gloss', 0.42, 9, 7, { at: [qx, y + 5.85, qz], color: s > 0 ? C.teal : C.yellow });
    A.collide(qx, qz, 0.45);
    for (let k = 0; k < 3; k++) A.inst.bunting.push({ x: qx, y: y + 4.9 - k * 0.7, z: qz, w: 1.2, h: 0.8, ry: dir, ph: s + k, color: SPRINKLE[(k + (s > 0 ? 0 : 3)) % SPRINKLE.length] });
  }
  bench(B, x, y + 0.5, z, Math.atan2(Math.sin(dir), Math.cos(dir)) + Math.PI, { w: 2.4, A });
  // the sign, facing back down the road you walked up
  const sy = world.height(x + fx * 4.2, z + fz * 4.2);
  B.stripeCyl(0.15, 0.17, 3.0, { at: [x + fx * 4.2, sy + 1.5, z + fz * 4.2], variant: 1, seg: 8 });
  const srot = dir + Math.PI;
  plaque(B, 'peak', 2.7, 1.08, { at: [x + fx * 4.2, sy + 3.1, z + fz * 4.2], rot: [0, srot, 0], both: true });
  A.readSign('peak', x + fx * 4.2, z + fz * 4.2, 3.2, 'Read: Frosting Peak');
  A.interact({
    id: 'candy_peak_viewpoint', x, z, r: 3.4, label: 'Take in the view',
    onInteract(ctx) {
      ctx.systems.camera?.reveal?.(3.5);
      ctx.systems.story?.set('saw_frosting_peak', true);
      ctx.systems.ui?.say('The whole summit at once: the wafer tower, the cherry on its plinth, the little candy-cane bridge where the river starts. Somebody has scratched into the bench: "they wave back. do not wave back."', { speaker: 'Frosting Peak', duration: 8 });
    },
  });
  // Keep the canes out of the sightline. Not one big bald patch in the middle —
  // a widened clearing that follows candy_north all the way up to the summit,
  // so it reads as the avenue the road cuts through the cane forest and the
  // tower, the cherry and the bridge are all in view the whole way.
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    A.claimApron(x + (-177 - x) * t, z + (-60 - z) * t, 0, 7.0, { r: 3.4 });
  }
}

// ── the waffle cave (secret) ─────────────────────────────────────────────────
function buildCave(A) {
  const { B, world } = A;
  const X = -176.5, Z = -73.5;
  const y = world.height(X, Z);
  const W = 2.6, H = 3.4;
  A.mark('waffle_cave', X, y, Z);
  // dark interior, sunk into the slope
  // The dark inside is a POCKET — back wall, two cheeks and a ceiling, 2.8 deep,
  // tucked behind the waffle arch. It used to be a solid near-black slab, and
  // because the north slope falls away faster than the mouth does, half of it
  // stood proud of the snow: a black box on a white summit, visible from the
  // whole approach and reading as a rendering bug rather than as a cave.
  // Every piece is driven 8 units DOWN from a fixed top edge, so however fast
  // the north slope falls away behind the mouth the pocket stays buried in it.
  // Only the BACK is near-black. The cheeks and the ceiling are wafer, because
  // the north slope falls away faster than the mouth does and their outside
  // faces show: in dark chocolate they read as a black slab dumped on a white
  // summit, in wafer they read as more of the hillside the cave is cut into.
  const DK = 0x2f2018, TOP = y + H - 0.25, DEEP = 8;
  B.box('matteFlat', W * 1.95, DEEP, 0.5, { at: [X, TOP - DEEP / 2, Z - 2.9], color: DK });
  for (const s2 of [-1, 1]) B.waffleBox(0.5, DEEP, 3.0, { at: [X + s2 * W * 0.97, TOP - DEEP / 2, Z - 1.4], color: C.waferDark });
  B.waffleBox(W * 1.95, 0.5, 3.0, { at: [X, TOP, Z - 1.4], color: C.waferDark });
  B.box('matteFlat', W * 1.9, 0.3, 3.0, { at: [X, y + 0.1, Z - 1.4], color: 0x4a3524 });
  // waffle arch surround
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI * (i / 14);
    const px = X - Math.cos(a) * (W + 0.45), py = y + 0.2 + Math.sin(a) * (H - 0.1);
    B.waffleBox(1.0, 0.9, 1.5, { at: [px, py, Z + 0.25], rot: [0, 0, a - Math.PI / 2], color: i % 2 ? C.wafer : C.waferDark });
  }
  for (const s of [-1, 1]) B.waffleBox(1.0, 2.4, 1.5, { at: [X + s * (W + 0.45), y + 1.0, Z + 0.25], color: C.waferDark });
  // fallen waffle chunks
  const r = A.rng('cave');
  for (let i = 0; i < 9; i++) {
    const px = X + r.range(-6, 6), pz = Z + r.range(0.5, 6);
    const s = r.range(0.5, 1.3);
    B.waffleBox(s * 1.6, s, s * 1.4, { at: [px, world.height(px, pz) + s * 0.4, pz], rot: [r.range(-0.4, 0.4), r.range(0, 3), r.range(-0.3, 0.3)], color: r.chance(0.5) ? C.wafer : C.waferDark });
  }
  // the "closed" sign, nailed to nothing
  const sy = world.height(X + 4.0, Z + 2.4);
  B.cyl('matte', 0.09, 0.1, 2.0, 6, { at: [X + 4.0, sy + 1.0, Z + 2.4], rot: [0.12, 0, 0.16], color: C.licorice });
  plaque(B, 'cave', 1.15, 0.85, { at: [X + 4.06, sy + 2.2, Z + 2.48], rot: [0, 0.25, 0.16] });
  A.readSign('cave', X + 4.0, Z + 3.2, 2.8, 'Read the sign');
  // two sour eyes in the dark, watching
  for (const s of [-1, 1]) B.sph('glowSour', 0.14, 8, 6, { at: [X + s * 0.55, y + 1.5, Z - 1.9], color: 0xd8ff7a });
  A.interact({
    id: 'candy_waffle_cave', x: X, z: Z + 2.0, r: 3.0, label: 'Peer into the cave',
    onInteract(ctx) {
      ctx.systems.story?.set('found_waffle_cave', true);
      ctx.systems.ui?.say('Warm air, syrup and something older. Deep inside, two small lights blink — once, politely — and go out.', { speaker: 'Waffle Cave', duration: 7 });
      ctx.systems.particles?.burst?.({ x: X, y: y + 1.4, z: Z - 0.5, count: 16, color: [0xd8ff7a, 0x9bd63a], speed: 1.6, life: 1.3, size: 0.18, gravity: -1.2, spread: 2 });
    },
  });
  return { x: X, y, z: Z };
}
