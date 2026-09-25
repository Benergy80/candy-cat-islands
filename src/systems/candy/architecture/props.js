// SCATTERED CANDYLAND — licorice river bridges where the paths cross, a giant
// donut arch over the main road, the leaning candy bar, a jelly bean boulder
// field, junction signposts, benches, fences and wind-spinner lollipops.
import { C, SPRINKLE, bench, signpost, fenceLine, lamppost, plaque } from './kit.js';
import { railRun, caneStyle } from './rails.js';

export function buildProps(A) {
  const { B, world } = A;
  const r = A.rng('props');

  // ── licorice bridges (computed path × river crossings) ────────────────────
  bridge(A, -116.1, 38.8, -1.5208, 8.2, 2.4, { sign: true, variant: 0 });   // candy_main
  bridge(A, -131.1, 16.3, 2.78, 7.6, 2.0, { sign: false, variant: 1 });     // candy_north

  // ── the giant donut arch over candy_main ──────────────────────────────────
  donutArch(A, -70, 30, -1.292);

  // ── the leaning bar of Candyland ──────────────────────────────────────────
  candyBarTower(A, -163, 26);

  // ── jelly bean boulder fields ─────────────────────────────────────────────
  jellyBeans(A, -118, 22, 16, 30, r);
  jellyBeans(A, -196, 12, 13, 22, r);
  jellyBeans(A, -95, 52, 11, 16, r);

  // ── junction signposts ────────────────────────────────────────────────────
  post(A, -73.5, 33.6, [
    { id: 'to_pier', dir: Math.atan2(1, -0.3) },
    { id: 'to_village', dir: Math.atan2(-1, 0.28) },
    { id: 'to_cupcake', dir: Math.atan2(-0.55, -0.85) },
  ]);
  post(A, -112.5, -42.0, [
    { id: 'to_peak', dir: Math.atan2(-0.6, -0.8) },
    { id: 'to_cupcake', dir: Math.atan2(0.15, 0.99) },
    { id: 'to_village', dir: Math.atan2(-0.35, 0.94) },
    { id: 'to_meadow', dir: Math.atan2(0.9, -0.44) },
  ]);
  post(A, -171.5, 33.0, [
    { id: 'to_lake', dir: Math.atan2(-0.86, 0.51) },
    { id: 'to_village', dir: Math.atan2(0.95, 0.31) },
    { id: 'to_forest', dir: Math.atan2(-0.45, -0.89) },
    { id: 'to_nowhere', dir: Math.atan2(-0.62, -0.78) - 0.5 },
  ]);

  // ── benches and fences along the roads ────────────────────────────────────
  const gy = (x, z) => world.height(x, z);
  const benches = [[-62.5, 29.4, 1.9], [-92.5, 39.5, 2.6], [-104, 41.8, -0.7], [-158.5, 30.0, 1.2], [-183.5, 37.0, -1.1]];
  for (const [x, z, rot] of benches) {
    if (!isFinite(gy(x, z))) continue;
    bench(B, x, gy(x, z), z, rot, { A });
  }
  fenceLine(B, [[-96.5, 42.6], [-90, 41.0], [-84, 39.2]], gy, { tipColor: C.blue, A });
  fenceLine(B, [[-60.5, 31.6], [-55.5, 30.2], [-50.5, 28.0]], gy, { tipColor: C.yellow, A });
  fenceLine(B, [[-176.5, 35.2], [-182, 38.5], [-188, 41.5]], gy, { tipColor: C.purple, A });

  // a lamppost pair where the road leaves the pier, and one at the donut
  for (const [lx, lz, lv] of [[-58.5, 24.0, 1], [-66.5, 33.2, 0], [-78.0, 27.0, 1]]) {
    const p = A.freeSpot(lx, lz, 2.3);
    lamppost(B, p.x, gy(p.x, p.z), p.z, { h: 4.0, variant: lv });
    A.collide(p.x, p.z, 0.8);
  }

  // ── wind-spinner lollipops along the road network ─────────────────────────
  for (const p of world.PATHS) {
    if (p.island !== 'candy') continue;
    for (let i = 0; i < 14; i++) {
      const t = (i + 0.5) / 14;
      const q = world.pointOnPolyline(p.points, t);
      const a = r.range(0, 6.283), rad = r.range(4.5, 9);
      const x = q.x + Math.cos(a) * rad, z = q.z + Math.sin(a) * rad;
      if (!world.isFreeGround(x, z, { pathMargin: 2.0, avoidLandmarks: true })) continue;
      const y = world.height(x, z);
      // 0.11 not 0.07: a 0.07 stick is a single aliasing pixel at the game
      // camera, and the head then reads as a flower floating in the grass.
      B.stripeCyl(0.11, 0.13, 2.4, { at: [x, y + 1.2, z], variant: i % 3, seg: 7 });
      B.sph('gloss', 0.15, 6, 5, { at: [x, y + 2.42, z], color: C.licorice });
      A.inst.spinners.push({ x, y: y + 2.5, z, ry: r.range(0, 6.28), ph: r.range(0, 6.28), spd: r.range(0.2, 1.5), s: r.range(0.62, 0.92), color: SPRINKLE[i % SPRINKLE.length] });
      A.collide(x, z, 0.4);
    }
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
function bridge(A, cx, cz, dir, half, halfW, o = {}) {
  const { B, world } = A;
  const dx = Math.sin(dir), dz = Math.cos(dir);
  const ax = cx - dx * half, az = cz - dz * half;
  const bx = cx + dx * half, bz = cz + dz * half;
  const yA = world.height(ax, az) + 0.5, yB = world.height(bx, bz) + 0.5;
  const crown = 1.15;
  const N = 22;
  A.mark('bridge_' + Math.round(cx) + '_' + Math.round(cz), cx, (yA + yB) / 2 + crown, cz);
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const yy = yA + (yB - yA) * t + crown * Math.sin(Math.PI * t);
    B.box('licorice', halfW * 2, 0.22, (half * 2) / N + 0.12, { at: [x, yy, z], rot: [0, dir, 0], color: i % 2 ? C.licorice : C.licoriceSoft });
    if (i % 3 === 1) B.box('licorice', halfW * 2 + 0.2, 0.12, 0.14, { at: [x, yy + 0.15, z], rot: [0, dir, 0], color: C.licoriceRed });
  }
  // stringers + piers
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const t0 = i / 6, t1 = (i + 1) / 6, tm = (t0 + t1) / 2;
      const x = ax + (bx - ax) * tm - dz * s * (halfW - 0.1), z = az + (bz - az) * tm + dx * s * (halfW - 0.1);
      const y0 = yA + (yB - yA) * t0 + crown * Math.sin(Math.PI * t0);
      const y1 = yA + (yB - yA) * t1 + crown * Math.sin(Math.PI * t1);
      const seg = (half * 2) / 6;
      B.box('licorice', 0.18, 0.3, seg + 0.1, { at: [x, (y0 + y1) / 2 - 0.22, z], rot: [-Math.atan2(y1 - y0, seg), dir, 0], color: C.licorice });
    }
  }
  // candy-cane railing posts + rails (Contract O): the canes stood 2.3 apart
  // with a red rail between them and no collider — you walked straight through
  // into the syrup. Now ≈ 1.6 apart, and the rail line carries colliders
  // (gated: the river bed runs under the bridge).
  for (const s of [-1, 1]) {
    const n = Math.ceil((half * 2) / 1.6), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([ax + (bx - ax) * t - dz * s * (halfW - 0.12), az + (bz - az) * t + dx * s * (halfW - 0.12), yA + (yB - yA) * t + crown * Math.sin(Math.PI * t)]);
    }
    railRun(A.ctx, B, pts, {
      site: 'bridge_' + Math.round(cx) + '_' + Math.round(cz), edge: s > 0 ? 'left rail' : 'right rail', out: -s, force: true, gate: true,
      style: caneStyle({ variant: o.variant || 0, postR: 0.13, railR: 0.085, top: C.licoriceRed }),
    });
  }
  // approach piers in the syrup
  for (const t of [0.28, 0.72]) {
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const yy = yA + (yB - yA) * t + crown * Math.sin(Math.PI * t);
    const g = world.height(x, z);
    B.box('licorice', halfW * 1.6, yy - g + 0.4, 0.7, { at: [x, (yy + g) / 2 - 0.2, z], rot: [0, dir, 0], color: C.licoriceSoft });
  }
  A.deckSeg(ax, az, bx, bz, halfW - 0.05, yA, yB, crown);
  if (o.sign) {
    const sx = ax - dx * 1.6 - dz * 2.6, sz = az - dz * 1.6 + dx * 2.6;
    const sy = world.height(sx, sz);
    B.stripeCyl(0.1, 0.12, 1.9, { at: [sx, sy + 0.95, sz], variant: 2, seg: 6 });
    plaque(B, 'bridge', 1.15, 0.85, { at: [sx, sy + 2.2, sz], rot: [0, dir + Math.PI / 2, 0] });
    A.readSign('bridge', sx, sz, 2.8, 'Read the bridge sign');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function donutArch(A, x, z, dir) {
  const { B, world } = A;
  const y = world.height(x, z);
  const R = 7.6, TUBE = 2.6;
  const cy = y + 3.6;
  A.mark('donut_arch', x, cy, z);
  B.tor('matte', R, TUBE, 12, 30, { at: [x, cy, z], rot: [0, dir, 0], color: 0xe8b872 });
  // pink glaze over the top half + drips
  const nx = Math.cos(dir), nz = -Math.sin(dir);   // in-plane "right" direction
  const r = A.rng('donut');
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI * (i / 26);
    const px = x + nx * Math.cos(a) * R, py = cy + Math.sin(a) * R, pz = z + nz * Math.cos(a) * R;
    B.sph('icing', TUBE * 1.02, 8, 6, { at: [px, py, pz], rot: [0, dir, a], scale: [1, 1, 0.72], color: C.icingPink });
    if (i % 4 === 2 && a > 0.3 && a < Math.PI - 0.3) {
      B.sph('icing', TUBE * 0.5, 8, 6, { at: [px + Math.cos(a) * nx * TUBE * 0.75, py + Math.sin(a) * TUBE * 0.75 - 0.7, pz + Math.cos(a) * nz * TUBE * 0.75], scale: [1, 1.7, 0.7], color: C.icingPink });
    }
    if (i % 2 === 0) for (let k = 0; k < 3; k++) {
      const off = (k - 1) * TUBE * 0.55;
      A.inst.sprinkles.push({
        x: px + Math.cos(a) * nx * TUBE * 0.9 + Math.sin(dir) * off,
        y: py + Math.sin(a) * TUBE * 0.9,
        z: pz + Math.cos(a) * nz * TUBE * 0.9 + Math.cos(dir) * off,
        rx: r.range(0, 3), ry: r.range(0, 6.3), rz: r.range(0, 3), color: SPRINKLE[(i + k) % SPRINKLE.length],
      });
    }
  }
  // the CANDYLAND board hanging in the hole
  const by = cy + R - TUBE - 1.5;
  // A BOARD, not two coplanar quads. They used to sit at exactly the same
  // point, one flipped, and z-fought — which is what painted a mirrored
  // 'CANDYLAND' onto the far side of the arch.
  plaque(B, 'donut', 5.0, 2.0, { at: [x, by, z], rot: [0, dir, 0], both: true, t: 0.22, color: C.waferPale });
  B.box('matte', 5.2, 0.14, 0.14, { at: [x, by + 1.06, z], rot: [0, dir, 0], color: C.licorice });
  for (const s of [-1, 1]) B.cyl('matte', 0.06, 0.06, 1.2, 5, { at: [x + nx * s * 2.2, by + 1.65, z + nz * s * 2.2], color: C.licorice });
  // the donut's feet sink into two icing puddles
  for (const s of [-1, 1]) {
    const px = x + nx * s * R, pz = z + nz * s * R;
    B.sph('icing', 3.2, 12, 8, { at: [px, world.height(px, pz) + 0.1, pz], scale: [1, 0.22, 1], color: C.icing });
    A.collide(px, pz, 2.8);
  }
  A.readSign('donut', x, z + 4.0, 4.0, 'Read the arch');
}

// ─────────────────────────────────────────────────────────────────────────────
function candyBarTower(A, x, z) {
  const { B, world } = A;
  const y = world.height(x, z);
  A.mark('leaning_bar', x, y, z);
  const N = 7;
  let px = x, pz = z, py = y;
  for (let i = 0; i < N; i++) {
    const lean = i * 0.055;
    const h = 2.3;
    px += Math.sin(0.9) * 0.42; pz += Math.cos(0.9) * 0.42;
    const dark = i % 2 === 0;
    B.box('matteFlat', 5.4 - i * 0.25, h, 2.8 - i * 0.1, { at: [px, py + h / 2, pz], rot: [lean * 0.4, 0.9 + i * 0.09, lean], color: dark ? C.chocolate : C.chocMilk });
    // segment grooves
    for (let k = -1; k <= 1; k++) {
      B.box('matte', 0.12, h + 0.06, 2.9 - i * 0.1, { at: [px + k * 1.5 * Math.cos(0.9 + i * 0.09), py + h / 2, pz - k * 1.5 * Math.sin(0.9 + i * 0.09)], rot: [lean * 0.4, 0.9 + i * 0.09, lean], color: dark ? 0x4d3016 : 0x7d4a26 });
    }
    // gold wrapper on a couple of them
    if (i === 1 || i === 4) B.box('matte', 5.5 - i * 0.25, 0.9, 2.9 - i * 0.1, { at: [px, py + h * 0.5, pz], rot: [lean * 0.4, 0.9 + i * 0.09, lean], color: 0xe8c05a });
    py += h;
  }
  // a very optimistic prop stick
  B.cyl('matte', 0.14, 0.18, 9.0, 6, { at: [x + 3.4, y + 4.2, z + 2.6], rot: [0.2, 0.9, -0.36], color: C.licorice });
  B.box('matteFlat', 1.2, 0.4, 1.2, { at: [x + 5.2, y + 0.2, z + 3.6], color: C.stone });
  // sign
  const sy = world.height(x + 1.2, z - 4.4);
  B.cyl('matte', 0.1, 0.12, 2.0, 6, { at: [x + 1.2, sy + 1.0, z - 4.4], rot: [0, 0, 0.08], color: C.licorice });
  plaque(B, 'candybar', 1.25, 0.92, { at: [x + 1.26, sy + 2.35, z - 4.32], rot: [0, 0.4, 0.08] });
  A.readSign('candybar', x + 1.2, z - 4.4, 3.0, 'Read: do not push');
  for (let i = 0; i < 4; i++) A.collide(x + Math.sin(0.9) * i * 0.8, z + Math.cos(0.9) * i * 0.8, 2.6);
}

// ─────────────────────────────────────────────────────────────────────────────
function jellyBeans(A, cx, cz, rad, n, r) {
  const { B, world } = A;
  let placed = 0;
  for (let i = 0; i < n * 3 && placed < n; i++) {
    const a = r.range(0, 6.283), d = Math.sqrt(r()) * rad;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (!world.isFreeGround(x, z, { pathMargin: 1.8, riverMargin: 1.2, avoidLandmarks: true })) continue;
    const s = r.range(0.55, 2.2);
    const y = world.height(x, z) + s * 0.62;
    if (s > 1.5) {
      // the big ones are real geometry so they read as boulders
      B.sph('gloss', s, 9, 7, { at: [x, y, z], rot: [r.range(-0.2, 0.2), r.range(0, 3), r.range(-0.2, 0.2)], scale: [1.35, 0.95, 1], color: SPRINKLE[i % SPRINKLE.length] });
      A.collide(x, z, s * 1.2);
    } else {
      A.inst.beans.push({ x, y, z, s, ry: r.range(0, 6.283), rz: r.range(-0.3, 0.3), color: SPRINKLE[(i + 2) % SPRINKLE.length] });
    }
    placed++;
  }
}

function post(A, x, z, arms) {
  const { B, world } = A;
  const y = world.height(x, z);
  const s = signpost(B, x, y, z, arms, { h: 3.8, variant: 2 });
  A.collide(s.x, s.z, s.r);
}
