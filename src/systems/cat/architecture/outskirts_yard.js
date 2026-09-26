// ─────────────────────────────────────────────────────────────────────────────
// THE WATCHTOWER GROUNDS (called from outskirts.js buildWatchtower, after the
// drum-ledge fence). The fence used to guard an empty lot: the plinth stood on
// bare, smeared terrain with nothing round it. Now the ring between the
// plinth's foot and the path is the keeper's garden:
//   · a LAWN: one decal mesh laid EXACTLY on the rendered terrain (the terrain
//     grid, subdivided — see surface()), with a crisp painted texture (blades,
//     clover, daisies, pebbles, crystal chips) tiled in world space, its rim
//     and the path through it faded out by vertex alpha — 1 draw call;
//   · a FLAGSTONE APRON round the plinth's foot (two courses, running bond,
//     crisp slabs with mossy joints) with a planting strip against the drum;
//   · ~60 props in three sizes, in clusters: purple crystal-grass, candy
//     mushrooms (their sugar dots glow after dark), stones with moss, a bench
//     and a lamppost against the plinth under the fence (sea side), a brass
//     telescope that is NOT pointed at the sea, and a black cat loafing on the
//     plinth's upper tier (amber eyes; they glow at night) — plus a ginger one
//     asleep on the bench.
// Everything but the lawn merges into the district kit (+0 draw calls). Props
// keep clear of the path, the flight, the keeper's cottage and the flyer's
// take-off corridor (escape/flyer.js RUNWAY: nothing with a collider north of
// z 21.8 west of x 217.5). Big stones and mid mushrooms are LOW PROPS (Contract
// A: h ≤ 1.6, you step onto them); big mushrooms, the bench, the lamppost, the
// telescope and the cat are solid. Every footprint is claimed, so nature does
// not plant through them.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL, lamppost, bench, loafCat } from './parts.js';
import { rod } from './kit.js';
import { rng, hash } from '../../../core/util.js';

const TERRAIN_SEG = 208;             // terrain/ground.js SEG (the island's grid)
const TILE = 2.6;                    // world units per lawn texture tile
const CRYSTAL = [0x8e6bd4, 0x7a55c8, 0x9d7fe0, 0xb49cf0, 0x6a48b8];
const STONES = [0xb8ab94, 0x9a8c74, 0xcfc0a6, 0x8f8a80, 0xa99d86];
const FLAGS = [0xd8cbb0, 0xcdbd9e, 0xc4b394, 0xe0d4bb, 0xbcab8c, 0xd2c3a4];
const MOSS = [0x5b7f3a, 0x6f9446, 0x4f7234];
const CAPS = [0xff6fa8, 0x6fd6b8, 0xffd45a, 0xb48cf0, 0xe8514a];
const STEM = 0xf6ecd8, GILL = 0xf0d9c0, DOT = 0xfff4e0;

/**
 * The RENDERED terrain height at (x, z): terrain/ground.js draws Cat Island as
 * a 208 × 208 grid of world.height samples, each cell split along its
 * (i+1, j)–(i, j+1) diagonal. world.height itself is smoother than that in the
 * hollows, so a decal laid on world.height floats or sinks by centimetres.
 */
function surface(world) {
  const isl = world.ISLANDS.cat, size = isl.radius * 2.36, step = size / TERRAIN_SEG;
  const x0 = isl.center.x - size / 2, z0 = isl.center.z - size / 2;
  const f = (x, z) => {
    const fx = (x - x0) / step, fz = (z - z0) / step;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const X = x0 + i * step, Z = z0 + j * step;
    const ha = world.height(X, Z), hb = world.height(X + step, Z), hc = world.height(X, Z + step);
    if (u + v <= 1) return ha + u * (hb - ha) + v * (hc - ha);
    const hd = world.height(X + step, Z + step);
    return hd + (1 - u) * (hc - hd) + (1 - v) * (hb - hd);
  };
  f.grid = { x0, z0, step };
  return f;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function polyDist(px, pz, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}

// ── the lawn's texture: painted once, tiled in world space ──────────────────
function lawnCanvas(px, R) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d'), k = px / 512;
  g.fillStyle = '#66823f'; g.fillRect(0, 0, px, px);
  // every mark is drawn with its wrapped copies, so the tile has no seam
  const wrap = (x, y, r, draw) => {
    for (const ox of [-px, 0, px]) for (const oy of [-px, 0, px]) {
      const X = x + ox, Y = y + oy;
      if (X < -r || X > px + r || Y < -r || Y > px + r) continue;
      draw(X, Y);
    }
  };
  // 1 · broad soft patches (a lusher green, a drier one): no two tiles read alike
  const PATCH = [[88, 118, 50], [124, 138, 72], [78, 104, 46], [128, 126, 80], [96, 128, 56]];
  for (let i = 0; i < 30; i++) {
    const x = R() * px, y = R() * px, r = (34 + R() * 70) * k, c = PATCH[i % PATCH.length], a = 0.35 + R() * 0.25;
    wrap(x, y, r, (X, Y) => {
      const gr = g.createRadialGradient(X, Y, 0, X, Y, r);
      gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`);
      gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(X, Y, r, 0, Math.PI * 2); g.fill();
    });
  }
  // 2 · soil specks between the blades
  g.fillStyle = '#3f5426';
  for (let i = 0; i < 420; i++) {
    const x = R() * px, y = R() * px, r = (0.7 + R() * 0.9) * k;
    wrap(x, y, r, (X, Y) => { g.beginPath(); g.arc(X, Y, r, 0, Math.PI * 2); g.fill(); });
  }
  // 3 · blades, dark to light (the light ones on top are what reads as crisp)
  g.lineCap = 'round';
  const BLADES = [['#4a6629', 900], ['#5a7a33', 1100], ['#6c8f40', 1000], ['#80a34b', 700], ['#9bb85c', 320], ['#b3c76c', 110]];
  for (const [col, n] of BLADES) {
    g.strokeStyle = col;
    for (let i = 0; i < n; i++) {
      const x = R() * px, y = R() * px, len = (6 + R() * 9) * k, a = R() * Math.PI * 2, w = (1.3 + R() * 1.3) * k;
      const ex = Math.cos(a) * len, ey = Math.sin(a) * len, bend = (R() - 0.5) * len * 0.5;
      wrap(x, y, len + 2, (X, Y) => {
        g.lineWidth = w; g.beginPath(); g.moveTo(X, Y);
        g.quadraticCurveTo(X + ex * 0.5 - ey * bend / len, Y + ey * 0.5 + ex * bend / len, X + ex, Y + ey); g.stroke();
      });
    }
  }
  // 4 · clover
  for (let i = 0; i < 70; i++) {
    const x = R() * px, y = R() * px, r = (2.6 + R() * 1.4) * k, a0 = R() * Math.PI * 2;
    wrap(x, y, r * 3, (X, Y) => {
      for (let l = 0; l < 3; l++) {
        const a = a0 + l * 2.094;
        g.fillStyle = '#4c7530'; g.beginPath(); g.arc(X + Math.cos(a) * r, Y + Math.sin(a) * r, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#6a9642'; g.beginPath(); g.arc(X + Math.cos(a) * r * 1.1, Y + Math.sin(a) * r * 1.1, r * 0.45, 0, Math.PI * 2); g.fill();
      }
    });
  }
  // 5 · pebbles (a shadow, the stone, a lit edge)
  for (let i = 0; i < 16; i++) {
    const x = R() * px, y = R() * px, rx = (2.6 + R() * 2.6) * k, ry = rx * (0.6 + R() * 0.3), rot = R() * Math.PI;
    const tone = ['#9d968a', '#b0a58f', '#8a857c'][i % 3];
    wrap(x, y, rx * 2, (X, Y) => {
      g.fillStyle = 'rgba(40,48,24,0.55)'; g.beginPath(); g.ellipse(X + 1.4 * k, Y + 1.4 * k, rx, ry, rot, 0, Math.PI * 2); g.fill();
      g.fillStyle = tone; g.beginPath(); g.ellipse(X, Y, rx, ry, rot, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(236,230,214,0.6)'; g.beginPath(); g.ellipse(X - rx * 0.3, Y - ry * 0.3, rx * 0.4, ry * 0.35, rot, 0, Math.PI * 2); g.fill();
    });
  }
  // 6 · crystal chips (the crystal-grass seeds itself) and daisies
  for (let i = 0; i < 22; i++) {
    const x = R() * px, y = R() * px, s = (2.2 + R() * 2) * k, a = R() * Math.PI * 2;
    wrap(x, y, s * 2, (X, Y) => {
      g.fillStyle = i % 3 ? '#8e6bd4' : '#b8a0f2';
      g.beginPath(); g.moveTo(X + Math.cos(a) * s * 1.6, Y + Math.sin(a) * s * 1.6);
      g.lineTo(X + Math.cos(a + 2.2) * s, Y + Math.sin(a + 2.2) * s); g.lineTo(X + Math.cos(a - 2.2) * s, Y + Math.sin(a - 2.2) * s); g.fill();
    });
  }
  for (let i = 0; i < 44; i++) {
    const x = R() * px, y = R() * px, r = (1.7 + R() * 0.8) * k, a0 = R();
    wrap(x, y, r * 4, (X, Y) => {
      g.fillStyle = '#fbf6ea';
      for (let p = 0; p < 5; p++) { const a = a0 + p * 1.2566; g.beginPath(); g.arc(X + Math.cos(a) * r * 1.35, Y + Math.sin(a) * r * 1.35, r, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(X, Y, r * 0.85, 0, Math.PI * 2); g.fill();
    });
  }
  return cv;
}

// ── non-indexed triangle soup in the Kit's attribute layout (position, uv, normal)
function soup(tris) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((tris.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}
/** push triangle a, b, c ([x, y, z]) wound so its normal points along (nx, ny, nz) */
function triOut(out, a, b, c, nx, ny, nz) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * nx + cy * ny + cz * nz >= 0) out.push(...a, ...b, ...c); else out.push(...a, ...c, ...b);
}

// ── props (all into the district kit B) ──────────────────────────────────────
function crystalGrass(B, x, y, z, s, R) {
  B.sph(x, y + 0.02, z, 0.3 * s, R() < 0.5 ? 0x6d8a5a : 0x7d9a67, { seg: 6, rings: 3, sy: 0.4, flat: true });
  const n = 5 + Math.floor(R() * 4);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + R() * 0.7, rr = (0.04 + R() * 0.16) * s;
    const h = (0.5 + R() * 0.6) * s * (k === 0 ? 1.3 : 1), tilt = k === 0 ? 0.06 : 0.14 + R() * 0.34;
    B.cone(x + Math.cos(a) * rr, y - 0.03, z + Math.sin(a) * rr, (0.055 + R() * 0.045) * s, h, CRYSTAL[Math.floor(R() * CRYSTAL.length)],
      { seg: 3, ry: -a, rz: -tilt, flat: true, ao: 0 });
  }
}
function grassTuft(B, x, y, z, s, R) {
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + R() * 0.8;
    B.cone(x + Math.cos(a) * 0.05 * s, y - 0.02, z + Math.sin(a) * 0.05 * s, 0.05 * s, (0.28 + R() * 0.2) * s, R() < 0.5 ? 0x5f8a3c : 0x7aa24e,
      { seg: 3, ry: -a, rz: -(0.2 + R() * 0.3), flat: true, ao: 0 });
  }
}
function stone(B, x, y, z, r, R, moss = false) {
  const sy = 0.5 + R() * 0.3;
  B.sph(x, y + r * sy * 0.35, z, r, STONES[Math.floor(R() * STONES.length)],
    { seg: 6 + (R() < 0.5 ? 1 : 0), rings: 4, sx: 1 + R() * 0.35, sy, sz: 0.85 + R() * 0.2, ry: R() * Math.PI, flat: true });
  if (moss) B.sph(x + r * 0.08, y + r * sy * 1.1, z - r * 0.06, r * 0.62, MOSS[Math.floor(R() * MOSS.length)], { seg: 6, rings: 3, sy: 0.34, flat: true });
  return r * sy * 1.3;                                            // its top over the ground
}
function pebbles(B, x, y, z, R) {
  const n = 3 + Math.floor(R() * 3);
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, d = 0.1 + R() * 0.35, r = 0.07 + R() * 0.09;
    B.sph(x + Math.cos(a) * d, y + r * 0.2, z + Math.sin(a) * d, r, STONES[Math.floor(R() * STONES.length)], { seg: 5, rings: 3, sy: 0.6, flat: true });
  }
}
function moss(B, x, y, z, s, R) {
  B.sph(x, y + 0.02, z, 0.3 * s, MOSS[Math.floor(R() * MOSS.length)], { seg: 6, rings: 3, sy: 0.38, sx: 1.2, flat: true, ry: R() * 3 });
}
/** A candy mushroom H tall. o.stripes: a peppermint stem. Its sugar dots are on
 *  the 'glow' pool: cream by day, lit after dark (the town's night emissive). */
function mushroom(B, x, y, z, H, cap, R, o = {}) {
  const capR = H * (o.wide ?? 0.48), stemR = H * 0.11, capY = y + H * 0.7, sy = o.tall ? 0.95 : 0.72;
  B.cyl(x, y - 0.05, z, stemR * 0.88, stemR * 1.12, H * 0.72 + 0.05, STEM, { seg: 8, ao: 0.5, aoBase: y });
  if (o.stripes) for (let k = 0; k < 3; k++) B.cyl(x, y + H * (0.1 + k * 0.19), z, stemR * 1.08, stemR * 1.12, H * 0.06, 0xe8514a, { seg: 8, open: true, ao: 0 });
  B.cyl(x, capY - 0.03, z, capR * 0.93, capR * 0.93, 0.05, GILL, { seg: 10, ao: 0 });
  B.sph(x, capY, z, capR, cap, { seg: 10, rings: 4, phiLength: Math.PI / 2, sy });
  const n = o.dots ?? 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + R() * 0.6, ps = k === 0 ? 0.05 : 0.45 + R() * 0.6;
    B.sph(x + Math.cos(a) * Math.sin(ps) * capR, capY + Math.cos(ps) * capR * sy, z + Math.sin(a) * Math.sin(ps) * capR,
      capR * 0.13, DOT, { seg: 5, rings: 3, sy: 0.6, mat: 'glow' });
  }
  return { capR, top: H * 0.7 + capR * sy };
}
/** A brass telescope on a timber tripod, looking along (dx, dz) and down by `pitch`. */
function telescope(B, x, y, z, dx, dz, pitch) {
  const l = Math.hypot(dx, dz) || 1, fx = dx / l, fz = dz / l;
  const hub = [x, y + 1.2, z];
  for (let k = 0; k < 3; k++) {
    const a = Math.atan2(fz, fx) + Math.PI / 3 + k * (Math.PI * 2 / 3);
    rod(B, [x + Math.cos(a) * 0.58, y - 0.03, z + Math.sin(a) * 0.58], hub, 0.038, PAL.woodDark, { seg: 5 });
  }
  B.cyl(x, y + 1.1, z, 0.1, 0.12, 0.16, 0x3a4a4c, { seg: 8, mat: 'metal', ao: 0 });
  const cp = Math.cos(pitch), sp = Math.sin(pitch), D = [fx * cp, sp, fz * cp];
  const C = [x, y + 1.36, z], at = (t) => [C[0] + D[0] * t, C[1] + D[1] * t, C[2] + D[2] * t];
  rod(B, at(-0.55), at(0.5), 0.085, 0xc9a86a, { seg: 9, mat: 'metal' });           // the tube
  rod(B, at(0.42), at(0.7), 0.115, 0x9c6f3a, { seg: 9, mat: 'metal' });            // the dew shield
  B.cyl(...at(0.7), 0.1, 0.1, 0.02, 0x2b4450, { seg: 9, center: true, rx: Math.PI / 2 - pitch, ry: Math.atan2(fx, fz), mat: 'win', ao: 0 });
  rod(B, at(-0.75), at(-0.5), 0.045, 0x2f3a3c, { seg: 6, mat: 'metal' });          // eyepiece
  rod(B, [C[0], C[1] + 0.13, C[2]], [C[0] + D[0] * 0.3, C[1] + 0.13 + D[1] * 0.3, C[2] + D[2] * 0.3], 0.03, 0x2f3a3c, { seg: 5, mat: 'metal' });   // finder
  B.cyl(C[0], C[1] - 0.12, C[2], 0.05, 0.05, 0.14, 0x3a4a4c, { seg: 6, mat: 'metal', ao: 0 });
}

export function buildWatchYard(T, W) {
  const ctx = T.ctx, world = T.world, B = T.b;
  const { LX, LZ, LY, FL } = W;
  const R = rng(hash('cat-watch-yard'));
  const surf = surface(world);
  const MOBILE = !!T.mobile;
  const report = { lawnTris: 0, flags: 0, props: 0, sizes: [0, 0, 0], kinds: {}, colliders: 0, skipped: 0 };

  // ── zones ────────────────────────────────────────────────────────────────
  const PATH_PTS = (world.PATHS || []).find((p) => p.id === 'cat_lighthouse')?.points || [[178, 48], [200, 40], [218, 30]];
  const LANE = [[196.0, 41.6], [198.0, 41.18], [200.0, 40.68], [202.0, 39.8], [206.5, 38.6]];   // Whisker Heights' east lane (buildHeights)
  const pathD = (x, z) => Math.min(polyDist(x, z, PATH_PTS) - 1.2, polyDist(x, z, LANE) - 1.5);
  const cot = W.cottage;                                             // { x, z, w, d, ry } — the DRAWN block
  const cotD = (x, z) => {
    if (!cot) return Infinity;
    const dx = x - cot.x, dz = z - cot.z, c = Math.cos(cot.ry), s = Math.sin(cot.ry);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;                // kit frame: +X = (cos ry, −sin ry)
    const qx = Math.abs(lx) - cot.w / 2, qz = Math.abs(lz) - cot.d / 2;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
  };
  const inFlight = (x, z, m = 0) => Math.abs(x - LX) < 1.6 + m && z > LZ + 4.2 && z < LZ + 8.3 + m;
  // the big sign's posts and the Wing Nut Field signpost (escape/flyer.js, built after us)
  const KEEP = [[LX - 1.0 - 2.2, LZ + 9.4, 0.5], [LX - 1.0 + 2.2, LZ + 8.6, 0.5], [215.8, 25.1, 0.45], [217.7, 22.9, 0.45], [216.75, 24.0, 0.45], [211.2, 43.4, 0.9]];
  const inCorridor = (x, z, r = 0) => z - r < 21.8 && x - r < 217.5;
  const Rout = (a) => 12.4 + 1.1 * Math.sin(3 * a + 0.7) + 0.6 * Math.sin(7 * a + 2.1);

  // ── 1 · THE LAWN ─────────────────────────────────────────────────────────
  let lawnMesh = null;
  {
    const SUB = MOBILE ? 1 : 2, s = surf.grid.step / SUB, RM = 14.6;
    const gx0 = Math.floor((LX - RM - surf.grid.x0) / s), gx1 = Math.ceil((LX + RM - surf.grid.x0) / s);
    const gz0 = Math.floor((LZ - RM - surf.grid.z0) / s), gz1 = Math.ceil((LZ + RM - surf.grid.z0) / s);
    const NI = gx1 - gx0 + 1, NJ = gz1 - gz0 + 1, NV = NI * NJ;
    const pos = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), col = new Float32Array(NV * 4);
    for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) {
      const v = j * NI + i, x = surf.grid.x0 + (gx0 + i) * s, z = surf.grid.z0 + (gz0 + j) * s;
      const dx = x - LX, dz = z - LZ, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
      let al = r < 5.35 ? 0 : 1;                                     // tucked under the drum's battered foot
      al *= smooth(Rout(a), Rout(a) - 2.0, r);                       // the rim melts into the hillside
      al *= smooth(0.0, 0.9, pathD(x, z));                           // the path's cobbles stay the path
      if (cotD(x, z) < -0.3) al = 0;
      // the plinth's foot is in its own shadow; broad light and dry patches break the tile
      const ao = 0.74 + 0.26 * smooth(5.6, 7.0, r);
      const mott = 0.94 + 0.05 * Math.sin(x * 0.37 + z * 0.21) + 0.04 * Math.sin(z * 0.53 - x * 0.19 + 1.3);
      pos[v * 3] = x; pos[v * 3 + 1] = surf(x, z) + 0.035; pos[v * 3 + 2] = z;
      uv[v * 2] = x / TILE; uv[v * 2 + 1] = -z / TILE;
      col[v * 4] = ao * mott; col[v * 4 + 1] = ao * mott; col[v * 4 + 2] = ao * mott * 0.98; col[v * 4 + 3] = al;
    }
    const idx = [];
    for (let j = 0; j < NJ - 1; j++) for (let i = 0; i < NI - 1; i++) {
      const a = j * NI + i, b = a + 1, c = a + NI, d = c + 1;
      if (col[a * 4 + 3] + col[b * 4 + 3] + col[c * 4 + 3] + col[d * 4 + 3] < 0.01) continue;
      idx.push(a, c, b, b, c, d);                                   // the terrain's own diagonal: exact
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const tex = new THREE.CanvasTexture(lawnCanvas(MOBILE ? 256 : 512, rng(hash('cat-watch-lawn'))));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, ctx.renderer?.capabilities?.getMaxAnisotropy?.() || 4);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, vertexColors: true, transparent: true, depthWrite: false, roughness: 0.96, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const lawn = new THREE.Mesh(geo, mat);
    lawn.name = 'cat_watch_lawn';
    lawn.receiveShadow = true; lawn.castShadow = false;
    lawn.renderOrder = -1;                                           // the first transparent drawn: it IS the ground
    lawn.matrixAutoUpdate = false; lawn.updateMatrix();
    T.group.add(lawn);
    lawnMesh = lawn;
    report.lawnTris = idx.length / 3;
  }

  // ── 2 · THE FLAGSTONE APRON (two courses round the plinth's foot) ───────
  const AP0 = 6.0, AP1 = 7.45, FLAG_T = 0.075;
  const onApron = (x, z) => { const r = Math.hypot(x - LX, z - LZ); return r > AP0 - 0.05 && r < AP1 + 0.05 && !inFlight(x, z, 0.25) && cotD(x, z) > 0.05; };
  const groundAt = (x, z) => surf(x, z) + (onApron(x, z) ? FLAG_T : 0);
  {
    const courses = [[AP0, 6.72], [6.72, AP1]];
    courses.forEach(([r0, r1], ci) => {
      const rm = (r0 + r1) / 2, n = Math.round((Math.PI * 2 * rm) / 0.95), da = (Math.PI * 2) / n, ph = ci * da * 0.5;
      const cut = [], rin = [], rout = [];
      for (let k = 0; k < n; k++) { cut.push(ph + k * da + (R() - 0.5) * da * 0.34); rin.push(r0 + (R() - 0.5) * 0.08); rout.push(r1 + (R() - 0.5) * 0.08); }
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % n, a0 = cut[k], a1 = cut[k1] + (k1 === 0 ? Math.PI * 2 : 0), am = (a0 + a1) / 2;
        const ring = [[a0, rin[k]], [am, (rin[k] + rin[k1]) / 2 - 0.02], [a1, rin[k1]], [a1, rout[k1]], [am, (rout[k] + rout[k1]) / 2 + 0.02], [a0, rout[k]]]
          .map(([a, r]) => [LX + Math.cos(a) * r, LZ + Math.sin(a) * r]);
        let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[1]; } cx /= ring.length; cz /= ring.length;
        if (inFlight(cx, cz, 0.3) || cotD(cx, cz) < 0.15) continue;
        // a joint all round (the lawn shows through it as a mossy line)
        const pts = ring.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x - dx / l * 0.05, z - dz / l * 0.05]; });
        const tris = [], top = pts.map(([x, z]) => [x, surf(x, z) + FLAG_T + (R() - 0.5) * 0.012, z]);
        const bot = pts.map(([x, z]) => [x, surf(x, z) - 0.06, z]), C = [cx, surf(cx, cz) + FLAG_T, cz];
        for (let i = 0; i < pts.length; i++) {
          const i1 = (i + 1) % pts.length;
          triOut(tris, C, top[i], top[i1], 0, 1, 0);
          const ox = (pts[i][0] + pts[i1][0]) / 2 - cx, oz = (pts[i][1] + pts[i1][1]) / 2 - cz;
          triOut(tris, top[i], bot[i], bot[i1], ox, 0, oz);
          triOut(tris, top[i], bot[i1], top[i1], ox, 0, oz);
        }
        B._push(soup(tris), FLAGS[Math.floor(R() * FLAGS.length)], { x: 0, y: 0, z: 0, ao: 0, shade: 0.94 + R() * 0.1 });
        report.flags++;
      }
    });
  }

  // ── 3 · PROPS, in clusters ───────────────────────────────────────────────
  const placed = [];
  const fits = (x, z, r, o = {}) => {
    const d = Math.hypot(x - LX, z - LZ);
    if (d < (o.inner ?? 6.2) + r * 0.3 || d > Rout(Math.atan2(z - LZ, x - LX)) - 0.6) return false;
    if (pathD(x, z) < r + 0.3) return false;
    if (inFlight(x, z, r + 0.35) || cotD(x, z) < r + 0.35) return false;
    if ((o.col || r > 0.3) && inCorridor(x, z, r)) return false;
    for (const [kx, kz, kr] of KEEP) if (Math.hypot(x - kx, z - kz) < kr + r + 0.2) return false;
    for (const p of placed) if (Math.hypot(x - p.x, z - p.z) < (p.r + r) * (o.tight ?? 0.9)) return false;
    for (const c of ctx.colliders) {
      if (!c || c.solid === false || c.rail) continue;
      if (Math.abs(c.x - x) > 12 || Math.abs(c.z - z) > 12) continue;
      if (c.box) {
        const dx = x - c.x, dz = z - c.z, cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0);
        const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
        if (Math.abs(lx) < (c.w || 0) / 2 + r + 0.15 && Math.abs(lz) < (c.d || 0) / 2 + r + 0.15) return false;
      } else if (Math.hypot(c.x - x, c.z - z) < (c.r || 0) + r + 0.15) return false;
    }
    return true;
  };
  const note = (kind, size, x, z, r) => {
    placed.push({ x, z, r });
    report.props++; report.sizes[size]++; report.kinds[kind] = (report.kinds[kind] || 0) + 1;
    T.claim(x, z, r * 2 + 0.3, r * 2 + 0.3, 0);                     // nature plants round it, not through it
  };
  const lowCol = (x, z, r, h) => { T.col(x, z, r, Math.min(1.55, h)); report.colliders++; };
  const solidCol = (x, z, r) => { T.col(x, z, r); report.colliders++; };
  // try a spot, then a few nudges round it (deterministic)
  const spot = (a, r, rad, o = {}, tries = 10) => {
    for (let t = 0; t < tries; t++) {
      const aa = (a * Math.PI) / 180 + (t ? (R() - 0.5) * 0.3 : 0), rr = r + (t ? (R() - 0.5) * 1.4 : 0);
      const x = LX + Math.cos(aa) * rr, z = LZ + Math.sin(aa) * rr;
      if (fits(x, z, rad, o)) return [x, z];
    }
    report.skipped++;
    return null;
  };
  const put = {
    crystal(a, r, s, size) { const p = spot(a, r, 0.34 * s); if (!p) return null; crystalGrass(B, p[0], groundAt(...p), p[1], s, R); note('crystal', size, p[0], p[1], 0.34 * s); return p; },
    tuft(a, r) { const p = spot(a, r, 0.18); if (!p) return null; grassTuft(B, p[0], groundAt(...p), p[1], 1, R); note('tuft', 0, p[0], p[1], 0.18); return p; },
    pebbles(a, r) { const p = spot(a, r, 0.35, { tight: 0.6 }); if (!p) return null; pebbles(B, p[0], groundAt(...p), p[1], R); note('pebbles', 0, p[0], p[1], 0.35); return p; },
    stone(a, r, sr, size, mossy) {
      const p = spot(a, r, sr, { col: sr >= 0.35 }); if (!p) return null;
      const h = stone(B, p[0], groundAt(...p), p[1], sr, R, mossy);
      if (sr >= 0.35) lowCol(p[0], p[1], sr * 1.02, h);
      note('stone', size, p[0], p[1], sr); return p;
    },
    shroom(a, r, H, size, o = {}) {
      const p = spot(a, r, H * 0.5, { col: H > 0.6 }); if (!p) return null;
      const m = mushroom(B, p[0], groundAt(...p), p[1], H, o.cap ?? CAPS[Math.floor(R() * CAPS.length)], R, o);
      if (H >= 1.3) solidCol(p[0], p[1], m.capR * 0.85);             // nobody stands under a cap that low
      else if (H > 0.6) lowCol(p[0], p[1], m.capR * 0.9, m.top);     // …but a small one you step onto
      note('mushroom', size, p[0], p[1], m.capR); return p;
    },
    moss(a, r) { const p = spot(a, r, 0.3, { inner: 5.7, tight: 0.7 }); if (!p) return null; moss(B, p[0], surf(...p), p[1], 1, R); note('moss', 0, p[0], p[1], 0.3); return p; },
    footTuft(a) { const p = spot(a, 5.92, 0.24, { inner: 5.7, tight: 0.7 }, 4); if (!p) return null; crystalGrass(B, p[0], surf(...p), p[1], 0.62, R); note('crystal', 0, p[0], p[1], 0.22); return p; },
  };
  // A · THE SEA BENCH (the back of the tower, under the fence): a bench backed
  //     against the plinth, a lamppost beside it, a ginger cat asleep on it
  {
    const a = (-38 * Math.PI) / 180, r = 6.45, x = LX + Math.cos(a) * r, z = LZ + Math.sin(a) * r;
    const ry = Math.atan2(Math.cos(a), Math.sin(a));                 // the seat faces out, to the sea
    const tx = -Math.sin(a), tz = Math.cos(a), L = 2.3;
    const y = Math.min(groundAt(x + tx * 0.95, z + tz * 0.95), groundAt(x - tx * 0.95, z - tz * 0.95));
    bench(B, x, y, z, ry, { len: L });
    loafCat(B, x + tx * 0.45 + Math.cos(a) * 0.05, y + 0.66, z + tz * 0.45 + Math.sin(a) * 0.05, 0.82, PAL.fur[0], { ry: ry + 1.2, tailSide: -1 });
    placed.push({ x, z, r: 1.3 }); report.props += 2; report.sizes[2]++; report.sizes[1]++; report.kinds.bench = 1; report.kinds.cat = 1;
    const la = (-17 * Math.PI) / 180, lx = LX + Math.cos(la) * 6.55, lz = LZ + Math.sin(la) * 6.55;
    lamppost(B, lx, groundAt(lx, lz), lz, { h: 4.3, ry: la });
    placed.push({ x: lx, z: lz, r: 0.5 }); report.props++; report.sizes[2]++; report.kinds.lamppost = 1;
  }
  put.crystal(-55, 7.2, 1.2, 1); put.tuft(-50, 7.9); put.pebbles(-44, 8.0);
  put.shroom(-30, 9.4, 0.95, 1); put.shroom(-26, 10.1, 0.6, 1, { stripes: true }); put.shroom(-34, 10.2, 0.34, 0);
  put.stone(-8, 10.6, 0.95, 2, true); put.stone(-3, 9.6, 0.5, 1); put.stone(-12, 9.7, 0.38, 1); put.pebbles(-5, 11.4);
  put.crystal(-45, 11.2, 1.1, 1); put.crystal(-40, 12.0, 0.7, 0); put.tuft(-50, 11.4);
  put.shroom(-62, 11.0, 1.7, 2, { stripes: true, cap: 0xff6fa8, dots: 7 }); put.shroom(-68, 11.4, 0.45, 0); put.shroom(-57, 11.9, 0.36, 0);
  put.crystal(-20, 8.6, 0.8, 0); put.tuft(-14, 8.2);
  // B · EAST, between the tower and the rocks
  put.crystal(8, 8.1, 1.25, 1); put.shroom(15, 9.6, 0.42, 0); put.shroom(12, 10.1, 0.3, 0); put.tuft(3, 8.8);
  put.stone(2, 12.0, 0.62, 1, true); put.pebbles(6, 11.2); put.crystal(-2, 11.0, 0.75, 0);
  // C · NORTH, short of the runway's corridor
  put.stone(-100, 7.7, 0.55, 1, true); put.stone(-94, 8.3, 0.32, 0); put.crystal(-118, 8.0, 1.0, 1);
  put.shroom(-86, 8.6, 0.5, 0); put.shroom(-82, 8.2, 0.34, 0); put.tuft(-108, 7.6);
  // D · NORTH-WEST / WEST: the telescope, the big mushroom, stones
  let scope = null;
  {
    const p = spot(-160, 7.35, 0.55, { col: true }, 6);
    if (p) {
      const y = groundAt(...p), gx = 167.6, gz = 51.0;                // it is pointed at the guest house
      telescope(B, p[0], y, p[1], gx - p[0], gz - p[1], -0.06);
      solidCol(p[0], p[1], 0.5); note('telescope', 2, p[0], p[1], 0.6); scope = p;
    }
  }
  put.shroom(-133, 9.8, 1.9, 2, { cap: 0xe8514a, dots: 8 }); put.shroom(-126, 10.6, 0.8, 1, { cap: 0xffd45a }); put.shroom(-138, 10.8, 0.4, 0);
  put.crystal(-145, 7.4, 1.25, 1); put.crystal(-122, 10.4, 0.9, 1); put.tuft(-152, 8.2);
  put.stone(-178, 10.8, 1.05, 2, true); put.stone(-171, 11.6, 0.55, 1); put.stone(-184, 9.9, 0.4, 1); put.pebbles(-175, 9.4);
  put.shroom(168, 9.0, 0.85, 1, { cap: 0x6fd6b8 }); put.shroom(163, 9.6, 0.5, 0, { cap: 0x6fd6b8 }); put.shroom(172, 9.9, 0.32, 0);
  put.crystal(-195, 8.4, 0.95, 1); put.crystal(-200, 11.2, 1.15, 1); put.tuft(-190, 11.8);
  // E · SOUTH-WEST, lining the path in
  put.crystal(118, 7.7, 1.0, 1); put.stone(158, 7.9, 0.5, 1, true); put.pebbles(152, 8.6); put.tuft(124, 8.4);
  put.crystal(128, 11.4, 0.85, 0); put.shroom(113, 10.2, 0.45, 0);
  // F · THE PLANTING STRIP against the drum's foot, round the back
  for (let a = -170; a <= 20; a += 14) {
    if (a > -52 && a < -8) continue;                                 // the bench and the lamppost stand there
    if ((a / 14) % 2) put.footTuft(a); else put.moss(a, 5.95);
  }
  for (const a of [118, 134, 150, 166]) put.footTuft(a);

  // ── 4 · THE CAT ON THE PLINTH: a black cat loafing on the upper tier ─────
  {
    const a = (-125 * Math.PI) / 180, r = 4.15, L = 1.15, x = LX + Math.cos(a) * r, z = LZ + Math.sin(a) * r;
    const ry = 0.5 - a, y = FL + 0.02, fur = 0x2b2b30;
    loafCat(B, x, y, z, L, fur, { ry });
    const c = Math.cos(ry), s = Math.sin(ry), P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    for (const sx of [-1, 1]) {                                      // one eye open. then the other.
      const e = P(sx * 0.1 * L, 0.61 * L);
      B.sph(e[0], y + 0.45 * L, e[1], 0.048 * L, PAL.amber, { seg: 6, rings: 4, sy: 0.55, mat: 'glow' });
    }
    const n = P(0, 0.65 * L);
    B.sph(n[0], y + 0.39 * L, n[1], 0.03 * L, 0xd3697a, { seg: 5, rings: 3 });
    solidCol(x, z, 0.22);                                            // the ledge below still passes it
    report.kinds.cat = (report.kinds.cat || 0) + 1; report.props++; report.sizes[1]++;
  }

  // the joke the telescope carries
  if (scope) {
    T.act('watch_scope', scope[0], scope[1], 'Look through the telescope', [
      'a very good brass telescope. it is not pointed at the sea.',
      'it is pointed at the guest house. at one window. yours.',
      'a note is taped under the eyepiece: "guest still here. good."',
    ], { r: 2.3, speaker: 'THE TELESCOPE' });
  }
  if (lawnMesh) lawnMesh.userData.report = report;               // (probes read it here)
  return report;
}
