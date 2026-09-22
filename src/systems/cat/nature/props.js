// ─────────────────────────────────────────────────────────────────────────────
// CAT ISLAND NATURE — authored hero props.
// Everything here is baked into ONE merged world-space geometry (+ one water
// geometry and one sign geometry) so the whole set costs 3 draw calls.
// Contains: the Great Feather, the municipal koi pond + bridge, the topiary
// hedge maze, sea stacks, tide pools, gym cacti, the harbour fish rack, signs.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as W from '../../../core/world.js';
import { Parts, box, cyl, cone, octa, ico, tetra, frond, feather, disc, lumpy } from './geo.js';
import { TAU, groundOk, obstacleClear, shorePoint, shoreRadius } from './place.js';

const NAMES = ['position', 'normal', 'color', 'aMask', 'aSway', 'aPhase', 'aTint'];
const H = (x, z) => W.height(x, z);

/** BufferGeometry straight from a flat list of world-space triangle vertices. */
function rawGeo(v) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}
const V = (o, p) => { o.push(p[0], p[1], p[2]); };
const QUAD = (o, a, b, c, d) => { V(o, a); V(o, b); V(o, c); V(o, a); V(o, c); V(o, d); };

/** Flattest free spot near a nominal point (deterministic). */
function findSpot(nx, nz, searchR, clearR, rand, opts = {}) {
  let best = null;
  for (let i = 0; i < 150; i++) {
    const a = rand() * TAU, r = Math.sqrt(rand()) * searchR;
    const x = i === 0 ? nx : nx + Math.cos(a) * r, z = i === 0 ? nz : nz + Math.sin(a) * r;
    if (!groundOk(x, z, { pathMargin: clearR, maxSlope: 0.32, ...opts })) continue;
    let mn = 1e9, mx = -1e9;
    for (let k = 0; k < 10; k++) { const an = (k / 10) * TAU; const h = H(x + Math.cos(an) * clearR, z + Math.sin(an) * clearR); mn = Math.min(mn, h); mx = Math.max(mx, h); }
    const score = (mx - mn) + Math.hypot(x - nx, z - nz) * 0.06;
    if (!best || score < best.score) best = { x, z, score, mn, mx, h: H(x, z) };
  }
  if (!best) { const h = H(nx, nz); best = { x: nx, z: nz, score: 9, mn: h, mx: h, h }; }
  return best;
}

/**
 * A low dry-stone wall from (x0,z0) to (x1,z1): two courses of rough warm stone
 * following the ground, plus ONE oriented box collider with h set so the player
 * can hop it. These are the terrace risers on the interior ridge.
 */
function stoneWall(P, colliders, x0, z0, x1, z1, rand, hgt = 0.72, col = [0xbfae90, 0xa9977a, 0xd0c0a2]) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.round(L / 0.82));
  const yaw = Math.atan2(z1 - z0, x1 - x0);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const g = H(x, z) - 0.3;
    P.add(ico(0.44 + rand() * 0.1), col[i % col.length], {
      p: [x, g + 0.2, z], s: [1.15, 0.52, 0.82], r: [(rand() - 0.5) * 0.16, -yaw + (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.14], warp: lumpy(rand, 0.3),
    });
    if (i % 3 !== 2) P.add(ico(0.34 + rand() * 0.1), col[(i + 1) % col.length], {
      p: [x + (rand() - 0.5) * 0.2, g + 0.2 + hgt * 0.62, z + (rand() - 0.5) * 0.2], s: [1.1, 0.5, 0.8],
      r: [0, -yaw + (rand() - 0.5) * 0.5, 0], warp: lumpy(rand, 0.34),
    });
    if (i % 5 === 1) P.add(ico(0.2), 0x6f8f4a, { p: [x, g + 0.2 + hgt * 0.9, z], s: [1.4, 0.3, 1.2], warp: lumpy(rand, 0.4) });  // moss cap
  }
  colliders.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: L + 0.7, d: 0.95, rot: yaw, box: true, h: hgt + 0.35 });
  return { yaw, L };
}

export function buildProps(planner, rand) {
  const P = new Parts();           // merged opaque hero geometry
  const WP = new Parts();          // merged water discs
  const colliders = [], pois = [], perches = [], meta = {};
  const signs = [];                // { text, sub, x, z, yaw }

  // ── The Great Feather (Catnip Commons) ─────────────────────────────────────
  // ONE feather, not a shuttlecock: a tapering shaft leaning out of a stone
  // plinth, with barbs that all sweep back toward the base in three colour
  // bands. Placed clear of the bandstand collider at (145,-53).
  {
    const s = findSpot(143, -41, 6.5, 4.6, rand, { radius: 4.6 });
    const { x, z } = s, y = s.h - 0.2;
    meta.feather = { x, z, y };

    // plinth: three stone drums plus a cat-toy striped collar
    P.add(cyl(2.35, 2.75, 0.66, 10), 0xc4ab84, { p: [x, y, z] });
    P.add(cyl(1.85, 2.2, 0.6, 10), 0xd6c09a, { p: [x, y + 0.66, z] });
    P.add(cyl(1.3, 1.68, 0.7, 10), 0xbba173, { p: [x, y + 1.26, z] });
    for (let i = 0; i < 3; i++)
      P.add(cyl(0.95 - i * 0.06, 1.0 - i * 0.06, 0.3, 9), i % 2 ? 0x2a8f8a : 0xd52b1e, { p: [x, y + 1.96 + i * 0.3, z] });

    const BY = y + 2.86, LEN = 14.0, TILT = 0.52, AZ = 1.05;
    const dir = [Math.sin(TILT) * Math.cos(AZ), Math.cos(TILT), Math.sin(TILT) * Math.sin(AZ)];
    // vane spreads along `right`, folds gently along `fwd`
    const right = [Math.sin(AZ), 0, -Math.cos(AZ)];
    const fwd = [dir[1] * right[2] - dir[2] * right[1], dir[2] * right[0] - dir[0] * right[2], dir[0] * right[1] - dir[1] * right[0]];
    const at = (t, u, v) => [
      x + dir[0] * LEN * t + right[0] * u + fwd[0] * v,
      BY + dir[1] * LEN * t + right[1] * u + fwd[1] * v,
      z + dir[2] * LEN * t + right[2] * u + fwd[2] * v,
    ];
    // shaft (rachis): tapering, aligned with dir via a unit-vector quaternion
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir));
    const se = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    P.add(cyl(0.09, 0.34, LEN * 0.99, 6), 0x8d5a34, { p: [x, BY, z], r: [se.x, se.y, se.z], sway: 0.009, phase: 0.4 });

    // 22 barbs a side, each raked back toward the plinth, with alternating
    // length and rake so the outer edge reads combed instead of leaf-smooth.
    const NB = 22, T0 = 0.10;
    const halfW = (u) => 1.85 * Math.pow(Math.sin(Math.PI * (0.05 + 0.93 * u)), 0.5) * (1 - 0.2 * u);
    const comb = (i) => (i % 2 ? 1.08 : 0.93) * (i % 3 === 0 ? 1.04 : 1);
    const rake = (i) => 0.105 + (i % 3) * 0.016;
    const BANDS = [[0xf6f2ea, 0], [0x2a8f8a, 8], [0xd4308f, 15]];
    for (const sx of [-1, 1]) {
      for (let bi = 0; bi < BANDS.length; bi++) {
        const [col, i0] = BANDS[bi];
        const i1 = bi === BANDS.length - 1 ? NB : BANDS[bi + 1][1];
        const tri = [];
        for (let i = i0; i < i1; i++) {
          const ua = i / NB, ub = (i + 1) / NB;
          const ta = T0 + ua * (1 - T0), tb = T0 + ub * (1 - T0);
          const wa = halfW(ua) * comb(i), wb = halfW(ub) * comb(i + 1);
          QUAD(tri,
            at(ta, sx * 0.10, 0.05), at(tb, sx * 0.10, 0.05),
            at(tb - wb * rake(i + 1), sx * wb, wb * 0.22), at(ta - wa * rake(i), sx * wa, wa * 0.22));
        }
        if (tri.length) P.add(rawGeo(tri), col, { sway: 0.011, phase: bi * 1.6 + (sx > 0 ? 0.6 : 0) });
      }
    }
    // downy tuft where the vane meets the plinth
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      P.add(octa(0.34), 0xf6f2ea, { p: at(T0 * 0.5, Math.cos(a) * 0.3, Math.sin(a) * 0.3), s: [1, 0.7, 1], sway: 0.006, phase: i });
    }

    colliders.push({ x, z, r: 2.6 });
    planner.reserve(x, z, 6.5);
    pois.push({ id: 'nat_feather', x: x + 3.2, z: z + 2.6, r: 4.2, label: 'Look up at The Great Feather', speaker: 'The Great Feather', text: 'Nine storeys of temptation. A plaque lists the names of everyone who has jumped for it.' });
    signs.push({ text: 'THE GREAT FEATHER', sub: 'Do not jump. (Several have.)', x: x + 3.6, z: z + 3.4, yaw: 2.3 });
  }

  // ── CATNIP COMMONS: the bed itself ────────────────────────────────────────
  // Round 3's biggest gap: "the bed is a flat teal 20-u slab with ~14 blades".
  // (The teal slab, the white dome and the floating gold sphere in that frame
  // are NOT ground and are not ours — they are cat/architecture's Commons
  // bandstand at 145,-53 seen from directly above: a 12.6-u teal cone roof, its
  // cream finial and its gold ball. See the report.)
  //
  // What IS ours is the planting, and there was no bed under it at all. Here is
  // the ground the herb mass grows out of: a dark mulch plate with a WORN PATH
  // trodden in from the park road to a trampled hollow in the middle, a stone
  // edging round the rim, and three flattened cat-nests in the middle of the
  // hollow. cat/citizens owns the cats flopped in them.
  {
    const BX = 141, BZ = -64, BR = 13.6;
    const np = W.nearestPath(BX, BZ, 'cat');
    const ep = np.path ? W.pointOnPolyline(np.path.points, np.t) : { x: BX, z: BZ - BR };
    const dx = BX - ep.x, dz = BZ - ep.z, dL = Math.hypot(dx, dz) || 1;
    // trampled: 1 on bare trodden earth, 0 in deep planting. Continuous, so the
    // tall tier can be held right off it while the low tier fringes it.
    const worn = (x, z) => {
      const hd = Math.hypot(x - BX, z - BZ);
      const hollow = Math.max(0, Math.min(1, (4.6 - hd) / 2.2));
      let t = ((x - ep.x) * dx + (z - ep.z) * dz) / (dL * dL);
      t = Math.max(0, Math.min(1, t));
      const px = ep.x + dx * t, pz = ep.z + dz * t;
      const spur = Math.max(0, Math.min(1, (1.5 + t * 1.5 - Math.hypot(x - px, z - pz)) / 1.1));
      return Math.max(hollow, spur);
    };
    meta.bed = { x: BX, z: BZ, r: BR, ex: ep.x, ez: ep.z, worn };

    // mulch plate: a radial fan at ground + 0.07, wobbling rim, skipping the
    // paved road and anything already standing here (the bandstand, the statue)
    const RINGS = 8, SPOKES = 44;
    const rimR = (a) => BR * (0.9 + 0.12 * Math.sin(a * 3 + 0.7) + 0.07 * Math.sin(a * 5.3 - 2.1));
    const soil = [], worns = [];
    const pt = (a, k) => { const r = rimR(a) * k; const x = BX + Math.cos(a) * r, z = BZ + Math.sin(a) * r; return [x, H(x, z) + 0.07, z]; };
    for (let s = 0; s < SPOKES; s++) {
      const a0 = (s / SPOKES) * TAU, a1 = ((s + 1) / SPOKES) * TAU;
      for (let k = 0; k < RINGS; k++) {
        const k0 = k / RINGS, k1 = (k + 1) / RINGS;
        const am = (a0 + a1) / 2, km = (k0 + k1) / 2, rm = rimR(am) * km;
        const mx = BX + Math.cos(am) * rm, mz = BZ + Math.sin(am) * rm;
        if (W.onPath(mx, mz, 0.3)) continue;                     // the road keeps its cobbles
        if (!obstacleClear(mx, mz, 0.7)) continue;               // and the bandstand its floor
        const out = worn(mx, mz) > 0.3 ? worns : soil;
        if (k === 0) { V(out, pt(am, 0)); V(out, pt(a1, k1)); V(out, pt(a0, k1)); }
        else QUAD(out, pt(a0, k0), pt(a1, k0), pt(a1, k1), pt(a0, k1));
      }
    }
    const grain = (v) => 0.86 + 0.14 * Math.sin(v.x * 2.3 + v.z * 3.1) + 0.06 * Math.sin(v.x * 7.7 - v.z * 5.9);
    if (soil.length) P.add(rawGeo(soil), 0x4b3524, { tone: grain });
    if (worns.length) P.add(rawGeo(worns), 0x8c7350, { tone: grain });

    // stone edging: the rim reads as a BED, not a stain
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU + rand() * 0.05;
      const r = rimR(a) * (0.99 + rand() * 0.05);
      const x = BX + Math.cos(a) * r, z = BZ + Math.sin(a) * r;
      if (W.onPath(x, z, 1.2) || !obstacleClear(x, z, 0.8)) continue;
      P.add(ico(0.26 + rand() * 0.14), [0xc0ae8e, 0xa89578, 0xd2c3a4][i % 3], {
        p: [x, H(x, z) - 0.02, z], s: [1.25, 0.5, 0.9], r: [0, -a + (rand() - 0.5) * 0.5, 0], warp: lumpy(rand, 0.34),
      });
    }
    // three flattened nests in the hollow, and a cracked saucer nobody refills.
    // NOTE for cat/citizens: `catNature.meta.bed.flopSpots` is where a cat that
    // has overdone the catnip should be lying on its back. The nests are ours;
    // the cats in them are yours.
    meta.bed.flopSpots = [];
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.6, r = 1.5 + i * 0.5;
      const x = BX + Math.cos(a) * r, z = BZ + Math.sin(a) * r;
      P.add(disc(0.95 + rand() * 0.2, 9), 0x6d5940, { p: [x, H(x, z) + 0.1, z], r: [0, rand() * TAU, 0] });
      P.add(disc(0.6, 8), 0x7d6a4c, { p: [x, H(x, z) + 0.12, z], r: [0, rand() * TAU, 0] });
      meta.bed.flopSpots.push({ x, y: H(x, z) + 0.12, z, yaw: a + 1.2 });
    }
    P.add(cyl(0.42, 0.46, 0.1, 9), 0xe8e2d4, { p: [BX + 2.4, H(BX + 2.4, BZ - 1.6) + 0.08, BZ - 1.6] });
    pois.push({
      id: 'nat_bed', x: BX + 1.2, z: BZ + 3.6, r: 3.4, label: 'Look at the worn path',
      speaker: 'Catnip Commons', text: 'The path to the middle is worn to bare soil. Nobody mows it. Nobody has to: it is walked flat by cats going to lie down and think about nothing.',
    });
  }

  // ── Municipal koi pond + arched bridge (park, west side) ───────────────────
  {
    const s = findSpot(126, -70, 9, 7, rand);
    const R = 5.4, wy = s.mx + 0.42;
    meta.pond = { x: s.x, z: s.z, y: wy, r: R };
    // ── kerb ────────────────────────────────────────────────────────────────
    // Was 26 identical pale lumps on a ring, which is exactly what the art
    // director called polystyrene ("the big grey rocks at ≈128,-72"). Now:
    // a DARK wet course at the waterline, warm ochre stones in three values at
    // five different sizes on a wobbling radius, a companion pebble on every
    // other one, and moss packed into the joints.
    const n = 26;
    const KERB = [0xb0822f, 0xc08f4a, 0xa8763c, 0xcda264, 0x96692f];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = R + 0.24 + Math.sin(i * 2.3) * 0.34 + rand() * 0.22;
      const bx = s.x + Math.cos(a) * rr, bz = s.z + Math.sin(a) * rr;
      const g = H(bx, bz) - 0.9;
      // buried retaining course, dark and wet where it meets the water
      P.add(cyl(0.66, 0.82, Math.max(0.8, wy + 0.06 - g), 6), 0x5e4224, { p: [bx, g, bz] });
      const sz = 0.5 + (i % 5) * 0.13 + rand() * 0.2;
      P.add(ico(sz), KERB[(i * 3 + (rand() * 2 | 0)) % KERB.length], {
        p: [bx, wy + 0.1 + sz * 0.08, bz], s: [1.26, 0.58 + rand() * 0.26, 0.94 + rand() * 0.2],
        r: [(rand() - 0.5) * 0.3, -a + (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.3], warp: lumpy(rand, 0.32),
      });
      if (i % 2) {   // a smaller stone tumbled off the bank
        const pr = rr + 0.72 + rand() * 0.5, pa = a + 0.06;
        const px = s.x + Math.cos(pa) * pr, pz = s.z + Math.sin(pa) * pr;
        P.add(ico(0.22 + rand() * 0.16), KERB[(i + 2) % KERB.length], {
          p: [px, H(px, pz) - 0.1, pz], s: [1.2, 0.6, 1.0], r: [0, rand() * TAU, 0], warp: lumpy(rand, 0.34),
        });
      }
      if (i % 3 === 1) {   // moss in the joint
        const ma = a + TAU / n * 0.5, mr = rr - 0.1;
        const mx = s.x + Math.cos(ma) * mr, mz = s.z + Math.sin(ma) * mr;
        P.add(ico(0.3), 0x5f8f45, { p: [mx, wy + 0.1, mz], s: [1.3, 0.3, 1.1], warp: lumpy(rand, 0.4), sway: 0.01, phase: i });
      }
    }
    WP.add(disc(R - 0.1, 22), 0x2f8f94, { p: [s.x, wy, s.z] });

    // ── arched bridge: ONE continuous deck ribbon, not a pile of loose boards ─
    {
      const SEG = 12, span = R * 2 + 5.4, HW = 1.15, TH = 0.22, RAIL = 0.92;
      const node = (i) => {
        const t = i / SEG - 0.5, zz = s.z + t * span;
        const k = Math.cos(t * Math.PI) * 0.5 + 0.5;             // 1 at centre, 0 at the ends
        return { zz, k, ay: (H(s.x, zz) + 0.3) * (1 - k) + (wy + 1.75) * k };
      };
      for (let i = 0; i < SEG; i++) {
        const a = node(i), b = node(i + 1);
        const top = [];
        QUAD(top, [s.x - HW, a.ay, a.zz], [s.x + HW, a.ay, a.zz], [s.x + HW, b.ay, b.zz], [s.x - HW, b.ay, b.zz]);
        P.add(rawGeo(top), i % 2 ? 0x9e6f47 : 0x8d5a34, {});
        const skirt = [];
        for (const sx of [-1, 1]) QUAD(skirt,
          [s.x + sx * HW, a.ay, a.zz], [s.x + sx * HW, b.ay, b.zz],
          [s.x + sx * HW, b.ay - TH, b.zz], [s.x + sx * HW, a.ay - TH, a.zz]);
        QUAD(skirt, [s.x - HW, a.ay - TH, a.zz], [s.x - HW, b.ay - TH, b.zz], [s.x + HW, b.ay - TH, b.zz], [s.x + HW, a.ay - TH, a.zz]);
        P.add(rawGeo(skirt), 0x6f4b2c, {});
      }
      for (let i = 1; i < SEG; i += 2) {
        const a = node(i);
        if (a.k < 0.12) continue;
        for (const sx of [-1, 1]) P.add(box(0.15, RAIL, 0.15), 0x7a5535, { p: [s.x + sx * (HW - 0.1), a.ay, a.zz] });
      }
      for (const sx of [-1, 1]) {
        const rail = [], ax = s.x + sx * (HW - 0.1), w = 0.08;
        for (let i = 0; i < SEG; i++) {
          const a = node(i), b = node(i + 1);
          if (a.k < 0.1 && b.k < 0.1) continue;
          const ya = a.ay + RAIL, yb = b.ay + RAIL;
          QUAD(rail, [ax - w, ya, a.zz], [ax + w, ya, a.zz], [ax + w, yb, b.zz], [ax - w, yb, b.zz]);
          for (const s2 of [-1, 1]) QUAD(rail,
            [ax + s2 * w, ya, a.zz], [ax + s2 * w, yb, b.zz],
            [ax + s2 * w, yb - 0.14, b.zz], [ax + s2 * w, ya - 0.14, a.zz]);
        }
        if (rail.length) P.add(rawGeo(rail), 0xa9784d, {});
      }
    }
    // two stone benches facing the water
    for (const sx of [-1, 1]) {
      const bx = s.x + sx * (R + 2.6), bz = s.z + sx * 1.2, g = H(bx, bz) - 0.1;
      P.add(box(2.2, 0.24, 0.7), 0xd8c6a8, { p: [bx, g + 0.48, bz], r: [0, sx * 0.5, 0] });
      for (const t of [-0.8, 0.8]) P.add(box(0.3, 0.5, 0.6), 0xbfae94, { p: [bx + t * Math.cos(sx * 0.5), g, bz + t * Math.sin(sx * 0.5)] });
      perches.push({ x: bx, y: g + 0.72, z: bz, kind: 'bench' });
    }
    colliders.push({ x: s.x, z: s.z, r: R + 0.4 });
    planner.reserve(s.x, s.z, R + 4);
    pois.push({ id: 'nat_pond', x: s.x + R + 1.5, z: s.z - 2, r: 3.4, label: 'Read the pond notice', speaker: 'Pond Notice', text: 'The koi are municipal employees. Feeding them is bribery. Bribery is encouraged on Tuesdays.' });
    signs.push({ text: 'MUNICIPAL KOI POND', sub: 'The koi are on payroll', x: s.x + R + 2.2, z: s.z - 3.4, yaw: -1.1 });
  }

  // ── Topiary hedge maze (park, east side) ──────────────────────────────────
  // Each side of each ring is built as CONTINUOUS RUNS: one shared top height
  // per run, one unbroken cap sunk 0.14 into the wall (no coplanar faces, so
  // no z-fight slivers) and a rounded cap at every run end. Corridors are
  // 2.9 u wide and get their own litter/planting spots.
  {
    const s = findSpot(167, -44, 8, 13.0, rand, { radius: 13.0 });
    const MR = 12.2, DEPTH = 1.15, HH = 1.9;
    meta.maze = { x: s.x, z: s.z, r: MR + 0.9 };
    const BODY = 0x2f6b58, CAP = 0x58a481, LEAF = 0x3d7f66, FLECK = 0x6fb890;   // dark blue-green, LIT top
    const rings = [{ r: MR, gap: 'S' }, { r: 7.9, gap: 'E' }, { r: 4.0, gap: 'N' }];
    const topiarySpots = [], corridorSpots = [], accentSpots = [];
    const capFlowers = [];

    const world1 = (side, a, off) => (side.axis === 'z' ? { x: s.x + off, z: s.z + a } : { x: s.x + a, z: s.z + off });

    function hedgeRun(side, a0, a1) {
      const rot = side.axis === 'z' ? Math.PI / 2 : 0;
      const nSeg = Math.max(1, Math.round((a1 - a0) / 2.1));
      const segLen = (a1 - a0) / nSeg;
      const gs = [];
      let gmax = -1e9;
      for (let k = 0; k <= nSeg; k++) {
        const p = world1(side, a0 + k * segLen, side.fixed);
        const h = H(p.x, p.z); gs.push(h); gmax = Math.max(gmax, h);
      }
      const topY = gmax + HH;
      for (let k = 0; k < nSeg; k++) {
        const p = world1(side, a0 + (k + 0.5) * segLen, side.fixed);
        const bottom = Math.min(gs[k], gs[k + 1]) - 1.0;
        const hgt = topY - bottom;
        // baked value gradient: black-green in the corridor floor, lit at the
        // clipped top. A single flat colour is what made this read as plywood.
        const shade = (v) => 0.5 + 0.5 * Math.min(1, Math.max(0, (v.y - bottom - 0.9) / (hgt - 0.8)))
          + 0.05 * Math.sin(v.x * 17.3 + v.z * 11.9 + v.y * 7.1);
        P.add(box(segLen + 0.05, hgt, DEPTH), BODY, {
          p: [p.x, bottom, p.z], r: [0, rot, 0], tone: shade,
          warp: (v) => { if (v.y < hgt - 0.06) { v.x *= 1 + (rand() - 0.5) * 0.04; v.z *= 1 + (rand() - 0.5) * 0.07; } },
        });
      }
      // clipped-foliage lumps down both faces, and a BROKEN top edge: a hedge is
      // not a painted slab, and at the game camera the flat wall with its
      // machined bevel was the maze's biggest weakness
      {
        const nL = Math.max(3, Math.round((a1 - a0) / 1.6));
        for (let k = 0; k < nL; k++) {
          const c = world1(side, a0 + (k + 0.5) * ((a1 - a0) / nL), side.fixed);
          const ly = topY - 0.55 - (k % 4) * 0.44;
          for (const sgn of [-1, 1]) {
            const ox = side.axis === 'z' ? sgn * DEPTH * 0.44 : 0;
            const oz = side.axis === 'z' ? 0 : sgn * DEPTH * 0.44;
            P.add(ico(0.24 + rand() * 0.16), [LEAF, BODY, FLECK][k % 3], {
              p: [c.x + ox, ly, c.z + oz], s: [1, 0.88, 1], warp: lumpy(rand, 0.3),
              sway: 0.008, phase: k * 0.9 + sgn,
            });
            if (k % 4 === 1) P.add(tetra(0.13 + rand() * 0.06), k % 8 === 1 ? 0xf2e2a0 : FLECK, {
              p: [c.x + ox * 1.25, ly - 0.5, c.z + oz * 1.25], r: [rand() * 3, rand() * 3, rand() * 3], sway: 0.01, phase: k,
            });
          }
          // bumpy cap lumps riding the clipped top
          if (k % 2 === 0) P.add(ico(0.3 + rand() * 0.16), k % 4 ? CAP : LEAF, {
            p: [c.x + (rand() - 0.5) * 0.3, topY - 0.14 + rand() * 0.14, c.z + (rand() - 0.5) * 0.3],
            s: [1.1, 0.52 + rand() * 0.2, 1.0], r: [0, rand() * TAU, 0], warp: lumpy(rand, 0.3),
            sway: 0.014, phase: k * 1.3,
          });
        }
      }
      // ONE oriented box per run (wave-2 collision contract): the wall is solid
      // end to end and the three maze gaps stay genuinely walk-through.
      const mid = world1(side, (a0 + a1) / 2, side.fixed);
      const RUN = a1 - a0 + DEPTH, THICK = DEPTH + 0.3;   // + the foliage on both faces
      colliders.push(side.axis === 'z'
        ? { x: mid.x, z: mid.z, w: THICK, d: RUN, rot: 0, box: true }
        : { x: mid.x, z: mid.z, w: RUN, d: THICK, rot: 0, box: true });
      // rounded clipped top: a cylinder lying along the run, not a flat slab
      const capL = a1 - a0, capY = topY - 0.30;
      P.add(cyl(DEPTH * 0.5, DEPTH * 0.5, capL, 7), CAP, side.axis === 'z'
        ? { p: [mid.x, capY, mid.z - capL / 2], r: [Math.PI / 2, 0, 0], sway: 0.012, phase: (mid.x + mid.z) * 0.3 }
        : { p: [mid.x - capL / 2, capY, mid.z], r: [0, 0, -Math.PI / 2], sway: 0.012, phase: (mid.x + mid.z) * 0.3 });
      for (const end of [a0, a1]) {
        const e = world1(side, end, side.fixed);
        const eb = H(e.x, e.z) - 1.0;
        P.add(cyl(DEPTH * 0.5, DEPTH * 0.5, topY - 0.3 - eb, 7), BODY, { p: [e.x, eb, e.z] });
        P.add(octa(DEPTH * 0.5), CAP, { p: [e.x, capY, e.z], s: [1, 1, 1] });   // the run's rounded end
      }
      // a few flowering accents perched on the clipped top
      if (a1 - a0 > 4) capFlowers.push({ x: mid.x, z: mid.z, y: topY + 0.24, rot, len: a1 - a0 });
    }

    for (const ring of rings) {
      const r = ring.r;
      const sides = [
        { axis: 'x', fixed: -r, tag: 'N' }, { axis: 'x', fixed: r, tag: 'S' },
        { axis: 'z', fixed: -r, tag: 'W' }, { axis: 'z', fixed: r, tag: 'E' },
      ];
      for (const side of sides) {
        const steps = Math.max(4, Math.round((r * 2) / 2.1));
        const keep = [];
        for (let i = 0; i < steps; i++) {
          const t = (i + 0.5) / steps * 2 - 1;
          keep.push(!(side.tag === ring.gap && Math.abs(t) < 0.26));
        }
        let i = 0;
        while (i < steps) {
          if (!keep[i]) { i++; continue; }
          let j = i; while (j + 1 < steps && keep[j + 1]) j++;
          hedgeRun(side, (i / steps * 2 - 1) * r, ((j + 1) / steps * 2 - 1) * r);
          i = j + 1;
        }
      }
    }

    // ── THE WAY IN: two clipped gateposts flanking the outer gap ────────────
    // The outer ring's gap is on its S side (world1 → z = s.z + MR, |x| < 0.26·MR),
    // and from the game camera an unmarked 6 u hole in a hedge reads as a
    // mistake. Two stone posts with topiary finials say "entrance".
    {
      const gz = s.z + MR, half = MR * 0.26 + 0.62;
      for (const sx of [-1, 1]) {
        const px = s.x + sx * half, pz = gz;
        const gy = H(px, pz) - 0.8, ty = H(px, pz) + 2.55;
        P.add(cyl(0.58, 0.74, ty - gy, 8), 0xc9b79c, { p: [px, gy, pz] });
        P.add(cyl(0.7, 0.62, 0.22, 8), 0xdccbac, { p: [px, ty, pz] });
        // NO mask: in the merged prop mesh aTint defaults to 1, so aMask=1
        // would paint the finial pure white instead of hedge green
        P.add(ico(0.62), CAP, { p: [px, ty + 0.78, pz], s: [1, 1.08, 1], warp: lumpy(rand, 0.12), sway: 0.014, phase: sx * 2.1 });
        for (let k = 0; k < 3; k++)
          P.add(octa(0.2), k % 2 ? 0xff8a3c : 0x8e6bd4, { p: [px + Math.cos(k * 2.1) * 0.5, ty + 1.16, pz + Math.sin(k * 2.1) * 0.5], s: [1.2, 0.8, 1.2], sway: 0.03, phase: k + sx });
        colliders.push({ x: px, z: pz, r: 0.82 });
        planner.reserve(px, pz, 1.6);
      }
      meta.mazeEntrance = { x: s.x, z: gz };
    }

    // ── corridor floors: catnip, litter, lavender and marigold accents ──────
    const bands = [[7.9, MR], [4.0, 7.9]];
    // topiary cats stand in the roomy corridor CORNERS, one per quadrant
    for (const [ri, ro] of bands) {
      const c = (ri + ro) / 2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        topiarySpots.push({ x: s.x + sx * c, z: s.z + sz * c });
    }
    for (const [ri, ro] of bands) {
      const mid = (ri + ro) / 2;
      for (let q = 0; q < 4; q++) {
        const n = Math.max(5, Math.round(mid * 2 / 1.0));
        for (let k = 0; k < n; k++) {
          const along = ((k + 0.5) / n * 2 - 1) * (mid - 0.3) + (rand() - 0.5) * 0.5;
          const perp = (ri + 1.05 + rand() * (ro - ri - 2.1)) * (q % 2 ? 1 : -1);
          const lx = q < 2 ? along : perp, lz = q < 2 ? perp : along;
          const p = { x: s.x + lx, z: s.z + lz, y: H(s.x + lx, s.z + lz) };
          let clash = false;
          for (const tp of topiarySpots) if (Math.hypot(tp.x - p.x, tp.z - p.z) < 1.8) { clash = true; break; }
          if (clash) continue;
          (k % 5 === 2 ? accentSpots : corridorSpots).push(p);
        }
      }
    }
    // inner chamber: the contemplation floor
    for (let k = 0; k < 40; k++) {
      const lx = (rand() - 0.5) * 6.0, lz = (rand() - 0.5) * 6.0;
      if (Math.hypot(lx, lz) < 1.9) continue;
      corridorSpots.push({ x: s.x + lx, z: s.z + lz, y: H(s.x + lx, s.z + lz) });
    }
    // and something to contemplate in the middle of it
    {
      const cy = H(s.x, s.z) - 0.1;
      P.add(cyl(1.25, 1.45, 0.42, 9), 0xc9b79c, { p: [s.x, cy, s.z] });
      P.add(cyl(0.95, 1.1, 0.3, 9), 0xdccbac, { p: [s.x, cy + 0.42, s.z] });
      P.add(disc(0.92, 12), 0x2f8f94, { p: [s.x, cy + 0.7, s.z] });
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU;
        P.add(octa(0.14), 0xe4d6b8, { p: [s.x + Math.cos(a) * 1.04, cy + 0.74, s.z + Math.sin(a) * 1.04], s: [1, 0.7, 1] });
      }
      colliders.push({ x: s.x, z: s.z, r: 1.5 });
    }
    for (const cf of capFlowers) {
      const n = 3 + ((rand() * 2) | 0);
      for (let k = 0; k < n; k++) {
        const t = ((k + 0.5) / n * 2 - 1) * (cf.len * 0.34);
        const ox = cf.rot ? 0 : t, oz = cf.rot ? t : 0;
        const col = k % 2 ? 0x8e6bd4 : 0xff8a3c;
        P.add(octa(0.22), col, { p: [cf.x + ox, cf.y, cf.z + oz], s: [1.2, 0.8, 1.2], sway: 0.03, phase: t });
      }
    }

    meta.topiarySpots = topiarySpots;
    meta.corridorSpots = corridorSpots;
    meta.mazeAccents = accentSpots;
    planner.reserve(s.x, s.z, MR + 2.6);
    pois.push({ id: 'nat_maze', x: s.x, z: s.z + MR + 1.7, r: 3.6, label: 'Enter the Maze of Contemplation', speaker: 'Maze of Contemplation', text: 'Est. never. The hedges are trimmed nightly by cats who deny trimming anything.' });
    signs.push({ text: 'MAZE OF CONTEMPLATION', sub: 'There IS an exit. Probably.', x: s.x + 6.0, z: s.z + MR + 2.1, yaw: 0.1 });
  }

  // ── Welcome Plaza planter ring (the roundabout was bare paving) ───────────
  // Skips anything the architecture already owns, using its colliders.
  {
    const CX = 78, CZ = 18;
    let made = 0;
    for (let i = 0; i < 60 && made < 8; i++) {
      const a = i * 2.3999632;                       // golden-angle sweep
      const rad = 12.9 - (i % 3) * 0.8;
      const px = CX + Math.cos(a) * rad, pz = CZ + Math.sin(a) * rad;
      if (!obstacleClear(px, pz, 1.15) || !planner.grid.free(px, pz, 2.4)) continue;
      const g = H(px, pz) - 0.12;
      P.add(cyl(1.02, 1.18, 0.82, 9), 0xcdbda2, { p: [px, g, pz] });
      P.add(cyl(1.1, 1.1, 0.16, 9), 0xe4d6b8, { p: [px, g + 0.76, pz] });
      P.add(cyl(0.94, 0.94, 0.14, 9), 0x5a4632, { p: [px, g + 0.8, pz] });
      P.add(ico(0.7), 0x4f8a4a, { p: [px, g + 1.04, pz], s: [1.2, 0.8, 1.2], warp: lumpy(rand, 0.2) });
      for (let k = 0; k < 7; k++) {
        const aa = (k / 7) * TAU + i, rr = 0.26 + (k % 3) * 0.22;
        P.add(octa(0.2), [0xf2a0c0, 0xff8a3c, 0x8e6bd4, 0xf2c14e][(k + i) % 4], {
          p: [px + Math.cos(aa) * rr, g + 1.42 + (k % 2) * 0.13, pz + Math.sin(aa) * rr],
          s: [1.15, 0.8, 1.15], sway: 0.02, phase: k * 1.1 + i,
        });
      }
      colliders.push({ x: px, z: pz, r: 1.3 });
      planner.reserve(px, pz, 2.3);
      made++;
    }
    // a low flower ring just inside them: for each angle take the first radius
    // the architecture has not already claimed, so the ring stays continuous
    let ring = 0;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU + 0.052;
      for (const rad of [10.6, 11.5, 12.4, 9.9]) {
        const px = CX + Math.cos(a) * rad, pz = CZ + Math.sin(a) * rad;
        if (!obstacleClear(px, pz, 0.75) || !planner.grid.free(px, pz, 0.7)) continue;
        const g = H(px, pz) - 0.06;
        P.add(box(1.5, 0.3, 0.78), i % 2 ? 0x4f8a4a : 0x5d9a52, { p: [px, g, pz], r: [0, -a, 0] });
        P.add(octa(0.22), [0xf2c14e, 0xff8a3c, 0xf2a0c0, 0x8e6bd4][i % 4], { p: [px, g + 0.34, pz], s: [1.5, 0.75, 1.0], sway: 0.03, phase: i * 0.7 });
        planner.reserve(px, pz, 0.7);
        ring++;
        break;
      }
    }
    meta.plaza = { x: CX, z: CZ, r: 12.9, planters: made, ring };
    if (made) pois.push({ id: 'nat_plaza_beds', x: CX + 12.9, z: CZ + 2.2, r: 3.2, label: 'Read the bed label', speaker: 'Parks Department', text: 'BED 4 OF 10 — planted for arrivals. Replanted for every arrival. Nobody has needed a departure bed.' });
  }

  // ── INTERIOR RIDGE: the dry-stone walls of the olive terraces ─────────────
  // Round 3: the north-west quarter (x 118–150, z −20…20, and the crest at
  // ~135,−6) was 25% bare lawn. nature.js plants four authored clusters across
  // it — a cypress stand on the crest, a scree apron off its shoulder, these
  // olive terraces, and a lavender/sunflower block — with real lawn between.
  // The walls are the terraces' risers and the thing that says "somebody farms
  // here" rather than "grass, some trees".
  {
    const TX = 150, TZ = -30, ROT = 0.25;
    const ax = Math.cos(ROT), az = Math.sin(ROT);        // along the rows
    const px = -Math.sin(ROT), pz = Math.cos(ROT);       // across them
    meta.terraces = { x: TX, z: TZ, rot: ROT, walls: [] };
    for (const off of [-9.8, -3.3, 3.3, 9.8]) {
      const cx = TX + px * off, cz = TZ + pz * off;
      // shrink the run until BOTH ends stand on free ground rather than dropping
      // the whole wall: the outer risers ran into the Great Feather's apron and
      // two of four terraces silently vanished
      let x0, z0, x1, z1, ok = false;
      for (let half = 10.5 - Math.abs(off) * 0.18; half >= 4.0; half -= 1.1) {
        x0 = cx - ax * half; z0 = cz - az * half; x1 = cx + ax * half; z1 = cz + az * half;
        if (groundOk(x0, z0, { pathMargin: 2.0, obsPad: 0.4 }) && groundOk(x1, z1, { pathMargin: 2.0, obsPad: 0.4 })) { ok = true; break; }
      }
      if (!ok) continue;
      stoneWall(P, colliders, x0, z0, x1, z1, rand);
      meta.terraces.walls.push({ x0, z0, x1, z1 });
      for (let t = 0; t <= 1.0001; t += 0.2) planner.reserve(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0.85);
    }
    if (meta.terraces.walls.length) {
      const w = meta.terraces.walls[0];
      // the joke: a gate with no fence either side of it
      P.add(box(0.2, 1.5, 0.2), 0x8d5a34, { p: [w.x1 + ax * 1.4, H(w.x1 + ax * 1.4, w.z1 + az * 1.4) - 0.2, w.z1 + az * 1.4] });
      P.add(box(0.2, 1.5, 0.2), 0x8d5a34, { p: [w.x1 + ax * 3.0, H(w.x1 + ax * 3.0, w.z1 + az * 3.0) - 0.2, w.z1 + az * 3.0] });
      for (let k = 0; k < 3; k++)
        P.add(box(1.7, 0.14, 0.1), 0xa9784d, { p: [w.x1 + ax * 2.2, H(w.x1 + ax * 2.2, w.z1 + az * 2.2) + 0.3 + k * 0.42, w.z1 + az * 2.2], r: [0, -ROT, 0] });
      pois.push({
        id: 'nat_terrace', x: w.x1 + ax * 2.2, z: w.z1 + az * 2.2 + 2, r: 3.2, label: 'Open the gate',
        speaker: 'Terrace Gate', text: 'A gate. No fence on either side of it. The cats open it anyway, every time, and close it behind them.',
      });
      signs.push({ text: 'RIDGE TERRACES', sub: 'Olives, and one gate', x: TX + px * 11.5, z: TZ + pz * 11.5, yaw: ROT + 1.2, nominal: true });
    }
    // the lavender/sunflower block's kerb, one field further along the ridge
    const LX = 137, LZ = 19;
    if (groundOk(LX - 7, LZ - 4.4, { pathMargin: 2.0, obsPad: 0.4 }) && groundOk(LX + 7, LZ - 3.0, { pathMargin: 2.0, obsPad: 0.4 })) {
      stoneWall(P, colliders, LX - 7, LZ - 4.4, LX + 7, LZ - 3.0, rand, 0.58);
      for (let t = 0; t <= 1.0001; t += 0.2) planner.reserve(LX - 7 + 14 * t, LZ - 4.4 + 1.4 * t, 1.0);
      meta.ridgeBlock = { x: LX, z: LZ };
    }
  }

  // ── Sea stacks just offshore ──────────────────────────────────────────────
  meta.stacks = [];
  for (const [ang, hgt, rad] of [[2.15, 12.5, 2.4], [6.03, 10.5, 2.0], [4.35, 9.0, 1.7]]) {
    const p = shorePoint(ang, -(7 + rand() * 5));
    const base = H(p.x, p.z);
    if (base > 0.4) continue;
    P.add(cyl(rad * 0.62, rad, hgt, 7, 2), 0xc0a276, { p: [p.x, base - 0.6, p.z], warp: (v, i) => { v.x += (rand() - 0.5) * 0.55; v.z += (rand() - 0.5) * 0.55; } });
    P.add(cyl(rad * 0.5, rad * 0.72, 1.1, 7), 0x93744a, { p: [p.x + 0.2, base - 0.6 + hgt * 0.55, p.z], s: [1.35, 1, 1.35] });
    P.add(octa(rad * 0.6), 0xd6b784, { p: [p.x, base - 0.5 + hgt, p.z], s: [1.1, 0.6, 1.1], warp: lumpy(rand, 0.3) });
    meta.stacks.push({ x: p.x, y: base + hgt - 0.5, z: p.z });
    perches.push({ x: p.x, y: base + hgt - 0.4, z: p.z, kind: 'stack' });
    colliders.push({ x: p.x, z: p.z, r: rad * 0.95 });     // solid: you wade AROUND a sea stack
  }

  // ── Tide pools at Not-An-Exit Beach ───────────────────────────────────────
  {
    let made = 0;
    for (let i = 0; i < 60 && made < 7; i++) {
      const a = -0.35 + rand() * 0.72;
      const p = shorePoint(a, 0.6 + rand() * 4.5);
      const h = H(p.x, p.z);
      if (h < 0.2 || h > 2.2) continue;
      if (!planner.grid.free(p.x, p.z, 4)) continue;
      planner.reserve(p.x, p.z, 4.4);
      const R = 1.5 + rand() * 1.3, wy = h + 0.14;
      const n = 9;
      for (let k = 0; k < n; k++) {
        const an = (k / n) * TAU + rand() * 0.2, rr = R + 0.25;
        P.add(octa(0.34 + rand() * 0.3), k % 2 ? 0xc2a06a : 0xd4b686, { p: [p.x + Math.cos(an) * rr, H(p.x + Math.cos(an) * rr, p.z + Math.sin(an) * rr) - 0.1, p.z + Math.sin(an) * rr], s: [1.2, 0.8, 1.2], warp: lumpy(rand, 0.3) });
      }
      WP.add(disc(R, 10), 0x2f8f94, { p: [p.x, wy, p.z] });
      made++;
      if (made === 1) {
        meta.tidepool = { x: p.x, z: p.z };
        pois.push({ id: 'nat_tidepool', x: p.x + 2.2, z: p.z + 1.4, r: 3.2, label: 'Peer into the tide pool', speaker: 'Tide Pool', text: 'Tiny crabs. Tinier fish. A very small sign reading NOT AN EXIT EITHER.' });
        signs.push({ text: 'TIDE POOLS', sub: 'Look. Do not leave.', x: p.x + 3.2, z: p.z + 3.0, yaw: -2.4 });
      }
    }
  }

  // ── Chunky cacti above Muscle Beach Gym ───────────────────────────────────
  {
    let made = 0;
    for (let i = 0; i < 200 && made < 9; i++) {
      const a = rand() * TAU, r = 11 + rand() * 12;
      const x = 198 + Math.cos(a) * r, z = -26 + Math.sin(a) * r;
      if (!groundOk(x, z, { pathMargin: 2.6, maxSlope: 0.3 })) continue;
      if (!planner.grid.free(x, z, 2.4)) continue;
      planner.reserve(x, z, 2.6);
      const y = H(x, z) - 0.15, hgt = 2.8 + rand() * 1.8, rr = 0.38 + rand() * 0.14;
      P.add(cyl(rr * 0.92, rr, hgt, 7), 0x5f9a5e, { p: [x, y, z], warp: (v) => { v.x *= 1 + Math.sin(v.y * 3) * 0.06; } });
      P.add(octa(rr), 0x5f9a5e, { p: [x, y + hgt, z], s: [1, 0.8, 1] });
      const arms = 1 + ((rand() * 2) | 0);
      for (let k = 0; k < arms; k++) {
        const aa = rand() * TAU, ay = y + hgt * (0.42 + rand() * 0.2);
        const dx = Math.cos(aa), dz = Math.sin(aa);
        P.add(cyl(0.25, 0.28, 1.35, 6), 0x558f55, { p: [x + dx * rr * 0.6, ay, z + dz * rr * 0.6], r: [dz * 1.15, 0, -dx * 1.15] });
        const ex = x + dx * 1.55, ez = z + dz * 1.55;
        P.add(cyl(0.23, 0.26, 1.5 + rand() * 0.7, 6), 0x5f9a5e, { p: [ex, ay + 0.5, ez] });
        P.add(octa(0.26), 0xd4308f, { p: [ex, ay + 2.1 + rand() * 0.3, ez], s: [1, 0.8, 1] });
      }
      colliders.push({ x, z, r: 0.85 });
      made++;
    }
  }

  // ── Harbour fish-drying rack (beside the fishbone garden) ─────────────────
  {
    const s = findSpot(92, 70, 8, 3.2, rand, { minH: 1.0 });
    const y = s.h - 0.1;
    meta.rack = { x: s.x, z: s.z };
    for (const sx of [-1.9, 1.9]) P.add(box(0.22, 2.5, 0.22), 0x8d5a34, { p: [s.x + sx, y, s.z] });
    P.add(box(4.3, 0.18, 0.2), 0x9a6a44, { p: [s.x, y + 2.5, s.z] });
    for (let i = 0; i < 5; i++) {
      const fx = s.x - 1.6 + i * 0.8;
      P.add(cyl(0.03, 0.03, 0.4, 3), 0x3a3038, { p: [fx, y + 2.1, s.z] });
      P.add(octa(0.3), 0xdfe6ea, { p: [fx, y + 1.85, s.z], s: [0.4, 0.75, 1.25], sway: 0.06, phase: i * 1.7 });
      P.add(tetra(0.18), 0xdfe6ea, { p: [fx, y + 1.72, s.z - 0.42], s: [0.35, 0.9, 0.8], sway: 0.06, phase: i * 1.7 });
    }
    colliders.push({ x: s.x, z: s.z, r: 1.0 });
    planner.reserve(s.x, s.z, 3.5);
    pois.push({ id: 'nat_rack', x: s.x + 1.8, z: s.z + 1.8, r: 3, label: 'Inspect the drying rack', speaker: 'Harbour Notice', text: 'Fish dry here. Nobody guards them. Nobody needs to: everyone already knows who took the last one.' });
    signs.push({ text: 'FISHBONE GARDEN', sub: 'Planted by the harbour cats', x: s.x + 2.6, z: s.z + 2.6, yaw: -2.2 });
  }

  // ── Remaining signs ───────────────────────────────────────────────────────
  signs.push({ text: 'CATNIP COMMONS', sub: 'Roll responsibly', x: 133, z: -38, yaw: 0.4, nominal: true });
  signs.push({ text: 'YARN HILL', sub: 'Mind the tangles', x: 184, z: -52, yaw: 0.2, nominal: true });
  signs.push({ text: 'WHISKER HEIGHTS GROVE', sub: 'Olives picked by paw', x: 160, z: 58, yaw: -0.9, nominal: true });

  // sign posts go into the hero mesh; boards into their own atlas mesh
  const signGeos = [];
  // 1024² atlas of 256×128 cells: 4 × 8 = 32 slots. It was 512² (8 slots) and
  // the ninth sign — Whisker Heights Grove — silently vanished the moment the
  // ridge terraces got one.
  const texSize = 1024, cw = 256, ch = 128, acols = texSize / cw, MAXSIGNS = 14;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (canvas) { canvas.width = texSize; canvas.height = texSize; }
  const g2 = canvas ? canvas.getContext('2d') : null;
  signs.forEach((sg, idx) => {
    if (idx >= MAXSIGNS) return;
    if (sg.nominal) {
      const s = findSpot(sg.x, sg.z, 9, 2.6, rand);
      sg.x = s.x; sg.z = s.z;
    }
    const y = H(sg.x, sg.z) - 0.15;
    for (const sx of [-0.95, 0.95]) P.add(box(0.16, 2.35, 0.16), 0x8d5a34, { p: [sg.x + sx * Math.cos(sg.yaw), y, sg.z - sx * Math.sin(sg.yaw)] });
    P.add(box(2.4, 0.14, 0.2), 0x7a5535, { p: [sg.x, y + 2.35, sg.z], r: [0, sg.yaw, 0] });
    colliders.push({ x: sg.x, z: sg.z, r: 0.7 });
    planner.reserve(sg.x, sg.z, 2.4);
    // board: two back-to-back planes sharing the atlas cell
    const col = idx % acols, row = (idx / acols) | 0;
    const u0 = col * cw / texSize, v0 = 1 - (row + 1) * ch / texSize, u1 = u0 + cw / texSize, v1 = v0 + ch / texSize;
    for (const flip of [0, Math.PI]) {
      const g = new THREE.PlaneGeometry(2.2, 1.05);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      g.rotateY(sg.yaw + flip);
      g.translate(sg.x, y + 1.72, sg.z);
      signGeos.push(g.toNonIndexed());
    }
    if (g2) {
      const px = col * cw, py = row * ch;
      g2.fillStyle = '#f3e4c6'; g2.fillRect(px, py, cw, ch);
      g2.fillStyle = '#6b4426'; g2.fillRect(px, py, cw, 7); g2.fillRect(px, py + ch - 7, cw, 7);
      g2.fillRect(px, py, 7, ch); g2.fillRect(px + cw - 7, py, 7, ch);
      g2.fillStyle = '#3b2416'; g2.textAlign = 'center';
      let size = 30;
      g2.font = `bold ${size}px "Trebuchet MS", sans-serif`;
      while (g2.measureText(sg.text).width > cw - 34 && size > 14) { size -= 2; g2.font = `bold ${size}px "Trebuchet MS", sans-serif`; }
      g2.fillText(sg.text, px + cw / 2, py + 52);
      g2.fillStyle = '#7a5535'; g2.font = 'italic 19px "Trebuchet MS", sans-serif';
      g2.fillText(sg.sub, px + cw / 2, py + 84);
      g2.strokeStyle = '#c9a06a'; g2.lineWidth = 3;
      g2.beginPath(); g2.moveTo(px + 40, py + 64); g2.lineTo(px + cw - 40, py + 64); g2.stroke();
    }
  });
  meta.signs = signs.slice(0, MAXSIGNS);

  let signGeo = null;
  if (signGeos.length) {
    let total = 0; for (const g of signGeos) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of signGeos) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += n;
    }
    signGeo = new THREE.BufferGeometry();
    signGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    signGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    signGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    signGeo.computeBoundingSphere();
  }

  return {
    geo: P.build(NAMES),
    water: WP.build(['position', 'normal', 'color', 'aMask']),
    signGeo, signCanvas: canvas,
    colliders, pois, perches, meta,
  };
}
