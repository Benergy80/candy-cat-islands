// ─────────────────────────────────────────────────────────────────────────────
// PLANES — the sky over both islands is inhabited (WAVE 3 · Contract F)
//
//   BANNER BIPLANE  a candy-cane biplane (span 6.9 u: banded wings, spiral
//                   fuselage, peppermint cowl) flown by a gummy bear in goggles
//                   and a streaming scarf who waves at you. Tows a 21 u banner —
//                   "WELCOME TO CANDYLAND" by day, "BE HOME BEFORE DARK" once the
//                   lamps come on — round the rim of Candyland at 45-50 u (35-40 u
//                   over the rim meadows; one lap ≈ 46 s). Every 40 s it drops a
//                   wrapped sweet on a peppermint parachute; the sweet lands as a
//                   real inventory pickup (no respawn, ≤ 3 waiting).
//   MEOW AIR JET    a white-and-orange airliner with cat ears on the nose, a
//                   curling cat's TAIL for a fin and MEOW AIR in big letters down
//                   both flanks. Crosses both islands at 110 u every 90 s on a new
//                   lane each pass — picked to dodge the clouds — laying two soft,
//                   puffy contrails that spread, drift and fade.
//   CATBLIMP        a pink-and-mint gored blimp with a cat face and twitching
//                   ears; "SUGAR" on the port flank, "CATNIP" to starboard (the
//                   letters glow at night); rounded gondola with striped awnings,
//                   a cat captain looking out of the front window (a passenger to
//                   starboard), bunting, big engine pods with pusher props, and
//                   rounded fins. Drifts a slow oval over the strait at 59-62 u.
//   PAPER PLANES    three giant paper darts (6.2 u; pink ruled paper, a Meow
//                   Donald's menu, sky-blue) circling Welcome Plaza (78,18) at
//                   20-24 u over the cobbles, follow-the-leader, with a
//                   loop-the-loop every lap (tops out at 30 u).
//
// You see them by holding L (look up), from the flying machine, in overviews —
// and in the ordinary game camera through their soft ground shadows (the
// biplane's cross sweeping over you) and the parachutes drifting down. They
// see through HALF the scene fog (so they stay crisp), and a sky-bounce fill
// lights the undersides the ground sees. Every one carries red (port) / green
// (starboard) wingtip lights and a white strobe after dark.
//
// HOW IT IS DRAWN (5 draw calls, ~13k triangles, zero cast shadows)
//   • body   ONE SkinnedMesh for every opaque aircraft part. Each aircraft,
//            propeller, ear, paper plane, banner segment, the pilot's scarf and
//            waving paw, and the parachute is a bone; bones are not in the scene
//            graph — update() writes their matrixWorld directly (rigid parts
//            have identity bind inverses, so each part is authored in its own
//            bone's frame).
//   • decal  a second SkinnedMesh on the SAME skeleton for everything that
//            needs a texture: the rippling banner (a 9-bone chain that follows
//            the biplane's own flight path, with a travelling wave), SUGAR /
//            CATNIP flank lettering, MEOW AIR livery, gondola windows. One
//            1024² CanvasTexture atlas + a matching emissive atlas.
//   • fx     soft contrail tubes + propeller blur discs (streaks that turn with
//            the blades), CPU-written vertex-alpha strips.
//   • lights nav lights / beacons / strobes as additive points (night only).
//   • blobs  soft ground shadows (instanced, 6 quads; leaning with the sun, day only).
//
// API  ctx.systems.planes
//   aircraft            live { biplane, jet, blimp, paper:[3] } → {x,y,z,heading[,active]}
//   drops               pickups this system registered (inventory objects)
//   hold                true = aircraft stop advancing (props/ripple still run)
//   debugTeleport(name, t, hold?, lane?)  put 'biplane'|'blimp'|'jet'|'paper' at path
//                       parameter t∈[0,1) (jet: fraction of pass `lane`, default the current one)
//   debugPose({ biplane, blimp, jet, paper, jetLane }, hold=true)   several at once (views)
//   debugLookUp(name)   aim the game camera at an aircraft with the hold-L lens (views)
//   debugFrame(name, {rel, az, el, dist, fov, dx, dy, dz})  park the free camera on an aircraft (views)
//   debugTeleport('jet', [x, z])  put the jet abeam of (x,z) on its current lane
//   debugDrop(x, z, k)  hang a parachute over (x,z) at fall fraction k (0..1)
//   dropCandy()         release a parachute from the biplane now → bool
//   where(name) → {x,y,z} · pathPoint(name, t) → {x,y,z}
//   clearance() → min clearance of each route over terrain + measured landmark tops
//   stats() → { calls, tris, bones }
// EVENTS  'planes:drop' {x,z} (release; x,z = landing spot) · 'planes:landed' {x,z,id}
//         'planes:flyover' {name:'biplane'|'jet'} when one passes over the visitor
//         (also calls ctx.systems.audio?.play?.('plane'|'jet') if audio grows that API)
// Views   tools/views/planes.json
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, hash, clamp, lerp, smoothstep, TAU } from '../core/util.js';

const G = 9.8;
// Decorative sky furniture never takes part in raycasts: weapons.js casts
// against the whole scene, and a SkinnedMesh would CPU-skin every vertex of a
// world-sized bounding sphere for each shot.
const NO_RAY = () => {};
const UP = new THREE.Vector3(0, 1, 0);

// Tallest things in the world, measured 2026-09-22 with a max-height grid over
// every mesh in the scene (4 u cells). Routes keep ≥ 30 u over these.
export const OBSTACLE_TOPS = [
  { id: 'frosting_lookout', x: -182, z: -57, r: 12, top: 46.7 },
  { id: 'candy_palace', x: -150, z: -36, r: 16, top: 45.3 },
  { id: 'watchtower', x: 214, z: 30, r: 8, top: 38.4 },
  { id: 'giant_cupcake', x: -88, z: -18, r: 12, top: 37.8 },
  { id: 'clock_mast', x: 168, z: -1, r: 6, top: 35.5 },
  { id: 'purrliament', x: 152, z: -10, r: 9, top: 27.8 },
  { id: 'gummy_grandfather', x: -228, z: -16, r: 8, top: 27.8 },
  { id: 'yarn_ball', x: 188, z: -63, r: 9, top: 27.2 },
];

// ── authored routes ──────────────────────────────────────────────────────────
// Closed centripetal Catmull-Rom loops through [x, y, z]; y is absolute.
export const ROUTES = {
  // Round the rim of Candyland, clockwise on the map, low enough to read from
  // the ground (45-50 u, i.e. 35-40 u over the rim meadows) and never closer
  // than 30 u to anything under it: measured 2026-09-22 against a 2-u max-height
  // grid of every mesh in the scene (8 u footprint). It stays well clear of the
  // palace, the lookout on Frosting Peak and the Great Cupcake.
  biplane: {
    speed: 13,
    pts: [
      [-60, 50.5, 34], [-80, 46, 62], [-120, 45, 80], [-168, 45, 76], [-214, 45, 56],
      [-248, 46, 18], [-247, 46, -30], [-224, 46, -80], [-172, 46, -99], [-122, 47, -90],
      [-82, 50.5, -64], [-54, 47, -22],
    ],
  },
  // A slow oval over the strait: Sugar Pier's end ↔ Main Street, 60 u.
  blimp: {
    speed: 4.6,
    pts: [
      [-30, 60, 22], [-16, 61, -28], [28, 62, -52], [78, 62, -40], [108, 61, -6],
      [106, 60, 44], [72, 59, 78], [20, 60, 84], [-20, 60, 64],
    ],
  },
  // Tight circles over the open cobbles of Welcome Plaza (ground 4.5): 20-24 u
  // above them, the loop-the-loop topping out at 30 u.
  paper: { x: 78, z: 18, r: 12.5, alt: 44, loopR: 3.8, speed: 9, loopTime: 2.6, loopAt: 1.2, delays: [0, 0.95, 1.9], lateral: [0, 3.0, -3.0] },
  jet: { alt: 110, speed: 64, period: 90, half: 560, first: 10 },
};

/** Arc-length LUT of a closed Catmull-Rom loop. at(s, out) wraps s. */
export function buildLoop(pts, n = 2048) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  curve.arcLengthDivisions = 4000;
  const len = curve.getLength();
  const P = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { curve.getPointAt(i / n, v); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
  return {
    len, n, P,
    at(s, out) {
      let f = (s / len) % 1; if (f < 0) f += 1; f *= n;
      const i0 = Math.floor(f) % n, t = f - Math.floor(f), i1 = (i0 + 1) % n;
      out.x = P[i0 * 3] + (P[i1 * 3] - P[i0 * 3]) * t;
      out.y = P[i0 * 3 + 1] + (P[i1 * 3 + 1] - P[i0 * 3 + 1]) * t;
      out.z = P[i0 * 3 + 2] + (P[i1 * 3 + 2] - P[i0 * 3 + 2]) * t;
      return out;
    },
  };
}

/** Paper plane j's position at time t (ground circle + a loop-the-loop per lap). */
export function paperPos(t, j, out) {
  const R = ROUTES.paper;
  const w = R.speed / R.r;                          // rad/s round the plaza
  const tt = t - R.delays[j];
  const th = w * tt;
  const rr = R.r + R.lateral[j];
  const c = Math.cos(th), s = Math.sin(th);
  let x = R.x + rr * c, z = R.z + rr * s;
  let y = R.alt + 1.3 * Math.sin(th * 2 + 0.4) + 0.4 * Math.sin(tt * 1.7 + j);
  // loop window: once per lap, loopTime seconds long, starting at angle loopAt
  const lapT = TAU / w;
  let m = (tt - R.loopAt / w) % lapT; if (m < 0) m += lapT;
  if (m < R.loopTime) {
    const ph = TAU * m / R.loopTime;
    const k = R.loopR;
    // forward along the circle's tangent (-s, c), up by the loop
    x += -s * k * Math.sin(ph); z += c * k * Math.sin(ph);
    y += k * (1 - Math.cos(ph));
  }
  out.x = x; out.y = y; out.z = z;
  return out;
}

// ── palette (sRGB hex; vertex colours are converted to linear on the way in) ─
const C = {
  red: 0xe8263f, white: 0xfff8ee, pink: 0xffb3d1, mint: 0xa8f0d1, choc: 0x4a2a17, lic: 0x1a1218,
  gold: 0xffd23a, orange: 0xff8c1a, bear: 0xff9a1f, bearLight: 0xffc070, glass: 0xcfefff,
  jetWhite: 0xfbf8f2, jetOrange: 0xf0963c, jetTabby: 0xd8742a, navy: 0x1d3557, grey: 0x8a8a94, earPink: 0xffa3b8,
  gummy: 0xff3355, cream: 0xfff4e6, cocoa: 0x7a4a2a, eye: 0x1a1218, nose: 0xff7fa6,
  paperW: 0xffc4dd, paperY: 0xffd95a, paperB: 0xa9dcff, mdRed: 0xe0453a, blueLine: 0x4aa2ff, peach: 0xff7fa8,
  creaseW: 0xd98aae, creaseY: 0xd09a30, creaseB: 0x6fa6d8,
  capBlue: 0x2c4a86, tabby: 0xf29a3a, tabbyDark: 0xc8661e, brass: 0xe8b64a,
};

// ── geometry kit: merged, skinned, per-triangle coloured ─────────────────────
const _c = new THREE.Color();
const _v = new THREE.Vector3(), _n = new THREE.Vector3();
function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
class Kit {
  constructor() { this.P = []; this.N = []; this.C = []; this.U = []; this.SI = []; this.SW = []; this.I = []; this.GL = []; this.FL = []; this.glow = 0; this.fill = 0; }
  get count() { return this.P.length / 3; }
  vert(x, y, z, nx, ny, nz, col, u, v, b0, b1 = 0, w1 = 0) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(col.r, col.g, col.b); this.U.push(u, v);
    this.SI.push(b0, b1, 0, 0); this.SW.push(1 - w1, w1, 0, 0); this.GL.push(this.glow); this.FL.push(this.fill);
  }
  /** Rigid part. color: hex or fn(x,y,z [part-local centroid], X,Y,Z [aircraft-local]) → hex. */
  part(geo, m, color, bone, { flip = false, both = false } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pre = g.attributes.position.array.slice();
    if (m) g.applyMatrix4(m);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const fn = typeof color === 'function' ? color : null;
    if (!fn) _c.setHex(color);
    for (let i = 0; i < p.length; i += 9) {
      if (fn) {
        _c.setHex(fn((pre[i] + pre[i + 3] + pre[i + 6]) / 3, (pre[i + 1] + pre[i + 4] + pre[i + 7]) / 3, (pre[i + 2] + pre[i + 5] + pre[i + 8]) / 3,
          (p[i] + p[i + 3] + p[i + 6]) / 3, (p[i + 1] + p[i + 4] + p[i + 7]) / 3, (p[i + 2] + p[i + 5] + p[i + 8]) / 3));
      }
      const order = flip ? [0, 6, 3] : [0, 3, 6];
      for (const j of order) { const s = flip ? -1 : 1; this.vert(p[i + j], p[i + j + 1], p[i + j + 2], n[i + j] * s, n[i + j + 1] * s, n[i + j + 2] * s, _c, 0, 0, bone); }
      if (both) for (const j of [0, 6, 3]) this.vert(p[i + j], p[i + j + 1], p[i + j + 2], -n[i + j], -n[i + j + 1], -n[i + j + 2], _c, 0, 0, bone);
    }
    geo.dispose(); if (g !== geo) g.dispose();
  }
  /** One flat triangle; a/b/c = [x,y,z]; bones per corner; both = also the back face. */
  tri(a, b, c, color, bones, both = true) {
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _n.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _v.cross(_n).normalize();
    _c.setHex(color);
    const bs = Array.isArray(bones) ? bones : [bones, bones, bones];
    this.vert(...a, _v.x, _v.y, _v.z, _c, 0, 0, bs[0]); this.vert(...b, _v.x, _v.y, _v.z, _c, 0, 0, bs[1]); this.vert(...c, _v.x, _v.y, _v.z, _c, 0, 0, bs[2]);
    if (both) { this.vert(...a, -_v.x, -_v.y, -_v.z, _c, 0, 0, bs[0]); this.vert(...c, -_v.x, -_v.y, -_v.z, _c, 0, 0, bs[2]); this.vert(...b, -_v.x, -_v.y, -_v.z, _c, 0, 0, bs[1]); }
  }
  /** A square rope/strut whose two ends ride two different bones. */
  link(boneA, a, boneB, b, hw, color, dirHint = [0, 0, -1]) {
    const d = new THREE.Vector3(...dirHint).normalize();
    const u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize().multiplyScalar(hw);
    const w = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar(hw);
    const ring = (p) => [[p[0] + u.x + w.x, p[1] + u.y + w.y, p[2] + u.z + w.z], [p[0] - u.x + w.x, p[1] - u.y + w.y, p[2] - u.z + w.z],
      [p[0] - u.x - w.x, p[1] - u.y - w.y, p[2] - u.z - w.z], [p[0] + u.x - w.x, p[1] + u.y - w.y, p[2] + u.z - w.z]];
    const A = ring(a), B = ring(b);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.tri(A[i], A[j], B[j], color, [boneA, boneA, boneB], true);
      this.tri(A[i], B[j], B[i], color, [boneA, boneB, boneB], true);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.GL, 1));
    g.setAttribute('aFill', new THREE.Float32BufferAttribute(this.FL, 1));
    if (this.I.length) g.setIndex(this.I);
    return g;
  }
}

/** Swept, tapered wing slab centred on x=0 (span along x, chord along z). */
function sweptWing(span, thick, chord, sweep, taper) {
  const g = new THREE.BoxGeometry(span, thick, chord, 2, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), f = Math.abs(x) / (span / 2);
    p.setZ(i, z * (1 - taper * f) + chord * 0.5 * taper * f - Math.abs(x) * sweep);
  }
  g.computeVertexNormals();
  return g;
}
/** A cylinder from a to b (aircraft-local). */
function tube(a, b, r0, r1 = r0, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = new THREE.Vector3().subVectors(B, A); const L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  return { g, m: new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)) };
}

// ── atlas (map + emissive) ───────────────────────────────────────────────────
const AT = 1024;
// 16 px gutters between cells so mipmaps never bleed one cell into the next
const RECT = {
  bannerDay: [0, 0, 1024, 120], bannerNight: [0, 136, 1024, 120],
  sugar: [0, 272, 640, 120], catnip: [0, 408, 640, 120],
  meow: [0, 544, 1024, 200], paw: [656, 272, 112, 112], gondola: [784, 272, 240, 60],
};
const FAT = '"Arial Black", "Trebuchet MS", system-ui, sans-serif';
/** atlas uv for a rect at (u,v) ∈ [0,1]², u left→right, v bottom→top. */
function uvAt(rect, u, v) { const [x, y, w, h] = rect; return [(x + 2 + u * (w - 4)) / AT, 1 - (y + 2 + (1 - v) * (h - 4)) / AT]; }

function fitFont(g, text, maxW, px, weight = '900') {
  let size = px;
  for (; size > 12; size -= 2) { g.font = `${weight} ${size}px ${FAT}`; if (g.measureText(text).width <= maxW) break; }
  return size;
}
function makeAtlas(renderer) {
  const cv = document.createElement('canvas'); cv.width = AT; cv.height = AT;
  const gv = document.createElement('canvas'); gv.width = AT; gv.height = AT;
  const g = cv.getContext('2d'), e = gv.getContext('2d');
  g.clearRect(0, 0, AT, AT); e.fillStyle = '#000'; e.fillRect(0, 0, AT, AT);
  g.textAlign = e.textAlign = 'center'; g.textBaseline = e.textBaseline = 'middle';
  g.lineJoin = e.lineJoin = 'round';

  const stripes = (ctx2, x, y, w, h, a, b, step = 24) => {
    ctx2.save(); ctx2.beginPath(); ctx2.rect(x, y, w, h); ctx2.clip();
    ctx2.fillStyle = a; ctx2.fillRect(x, y, w, h); ctx2.fillStyle = b;
    for (let i = -h; i < w + h; i += step * 2) { ctx2.beginPath(); ctx2.moveTo(x + i, y + h); ctx2.lineTo(x + i + step, y + h); ctx2.lineTo(x + i + step + h, y); ctx2.lineTo(x + i + h, y); ctx2.fill(); }
    ctx2.restore();
  };
  // ── banner, day: cream cloth, candy-stripe hems, red letters ──
  {
    const [x, y, w, h] = RECT.bannerDay;
    g.fillStyle = '#fff7ea'; g.fillRect(x, y, w, h);
    stripes(g, x, y, w, 14, '#e8263f', '#fff7ea', 14); stripes(g, x, y + h - 14, w, 14, '#e8263f', '#fff7ea', 14);
    const txt = 'WELCOME TO CANDYLAND';
    const s = fitFont(g, txt, w - 150, 80);
    g.lineWidth = 7; g.strokeStyle = '#7a1024'; g.strokeText(txt, x + w / 2, y + h / 2 + 3);
    g.fillStyle = '#e8263f'; g.fillText(txt, x + w / 2, y + h / 2 + 3);
    // gumdrops at both ends
    for (const [cx, col] of [[x + 34, '#5be27a'], [x + 64, '#3aa8ff'], [x + w - 34, '#ffe23a'], [x + w - 64, '#b35bff']]) {
      g.fillStyle = col; g.beginPath(); g.arc(cx, y + h / 2 + 8, 13, Math.PI, 0); g.lineTo(cx + 13, y + h / 2 + 18); g.lineTo(cx - 13, y + h / 2 + 18); g.fill();
    }
    void s;
  }
  // ── banner, night: plum cloth, glowing letters, and a pair of eyes at each end ──
  {
    const [x, y, w, h] = RECT.bannerNight;
    g.fillStyle = '#2b1842'; g.fillRect(x, y, w, h);
    stripes(g, x, y, w, 12, '#2b1842', '#6a3a8e', 12); stripes(g, x, y + h - 12, w, 12, '#2b1842', '#6a3a8e', 12);
    const txt = 'BE HOME BEFORE DARK';
    fitFont(g, txt, w - 170, 80); e.font = g.font;
    g.lineWidth = 6; g.strokeStyle = '#120818'; g.strokeText(txt, x + w / 2, y + h / 2 + 3);
    g.fillStyle = '#ffe9a8'; g.fillText(txt, x + w / 2, y + h / 2 + 3);
    e.fillStyle = '#d9b860'; e.fillText(txt, x + w / 2, y + h / 2 + 3);
    for (const cx of [x + 48, x + w - 48]) {
      for (const dx of [-12, 12]) {
        g.fillStyle = '#c8ff3a'; g.beginPath(); g.ellipse(cx + dx, y + h / 2, 8, 5, 0, 0, TAU); g.fill();
        e.fillStyle = '#b8ff2a'; e.beginPath(); e.ellipse(cx + dx, y + h / 2, 8, 5, 0, 0, TAU); e.fill();
        g.fillStyle = '#120818'; g.fillRect(cx + dx - 1.5, y + h / 2 - 4, 3, 8);
      }
    }
  }
  // ── blimp lettering: fat letters with a cream outline, transparent ground ──
  for (const [key, txt, fill, glow] of [['sugar', 'SUGAR', '#ff2f5c', '#ff5c8a'], ['catnip', 'CATNIP', '#23a04a', '#5dff8f']]) {
    const [x, y, w, h] = RECT[key];
    fitFont(g, txt, w - 40, 112); e.font = g.font;
    g.lineWidth = 16; g.strokeStyle = '#fff8ee'; g.strokeText(txt, x + w / 2, y + h / 2 + 5);
    g.lineWidth = 5; g.strokeStyle = '#3a1020'; g.strokeText(txt, x + w / 2, y + h / 2 + 5);
    g.fillStyle = fill; g.fillText(txt, x + w / 2, y + h / 2 + 5);
    e.fillStyle = glow; e.fillText(txt, x + w / 2, y + h / 2 + 5);
  }
  // ── MEOW AIR fuselage flank (symmetric, reads both sides): an orange cheat-
  //    line low down, a row of windows, and the name BIG above them — it is the
  //    one thing anyone should be able to read off the jet ──
  {
    const [x, y, w, h] = RECT.meow;
    g.fillStyle = '#f0963c'; g.fillRect(x, y + h - 30, w, 18);
    g.fillStyle = '#1d3557'; g.fillRect(x, y + h - 12, w, 6);
    for (let i = 0; i < 26; i++) {
      const cx = x + 30 + i * ((w - 60) / 25);
      g.fillStyle = '#1d3557'; g.beginPath(); g.roundRect(cx - 8, y + h - 62, 16, 22, 7); g.fill();
      e.fillStyle = '#ffcf6a'; e.beginPath(); e.roundRect(cx - 7, y + h - 61, 14, 20, 6); e.fill();
    }
    const txt = 'MEOW AIR';
    fitFont(g, txt, 790, 150); e.font = g.font;
    const ty = y + 70;
    g.lineWidth = 12; g.strokeStyle = '#fbf8f2'; g.strokeText(txt, x + w / 2, ty);
    g.lineWidth = 5; g.strokeStyle = '#0e1d33'; g.strokeText(txt, x + w / 2, ty);
    g.fillStyle = '#e8741c'; g.fillText(txt, x + w / 2, ty);
    e.fillStyle = '#7a4a18'; e.fillText(txt, x + w / 2, ty);      // logo lights after dark
    // a cat head either side of the name
    for (const cx of [x + w / 2 - 462, x + w / 2 + 462]) {
      g.fillStyle = '#1d3557'; g.beginPath(); g.arc(cx, ty + 4, 34, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(cx - 32, ty - 8); g.lineTo(cx - 24, ty - 44); g.lineTo(cx - 6, ty - 24); g.fill();
      g.beginPath(); g.moveTo(cx + 32, ty - 8); g.lineTo(cx + 24, ty - 44); g.lineTo(cx + 6, ty - 24); g.fill();
      g.fillStyle = '#f0963c'; g.beginPath(); g.arc(cx, ty + 4, 27, 0, TAU); g.fill();
      g.fillStyle = '#1d3557'; g.fillRect(cx - 14, ty - 2, 7, 11); g.fillRect(cx + 7, ty - 2, 7, 11);
      g.beginPath(); g.moveTo(cx - 5, ty + 14); g.lineTo(cx + 5, ty + 14); g.lineTo(cx, ty + 20); g.fill();
    }
  }
  // ── paw print for the jet's belly ──
  {
    const [x, y] = RECT.paw;
    g.fillStyle = '#fff8ee';
    g.beginPath(); g.ellipse(x + 56, y + 70, 27, 23, 0, 0, TAU); g.fill();
    for (const [dx, dy] of [[-30, 34], [-11, 21], [11, 21], [30, 34]]) { g.beginPath(); g.ellipse(x + 56 + dx, y + dy + 4, 10, 12.5, dx * 0.01, 0, TAU); g.fill(); }
  }
  // ── gondola windows ──
  {
    const [x, y, w, h] = RECT.gondola;
    for (let i = 0; i < 4; i++) {
      const cx = x + 32 + i * 64;
      g.fillStyle = '#fff4e6'; g.beginPath(); g.roundRect(cx - 26, y + 6, 52, h - 12, 12); g.fill();
      g.fillStyle = '#2a3d66'; g.beginPath(); g.roundRect(cx - 20, y + 12, 40, h - 24, 9); g.fill();
      g.fillStyle = '#9fd4ff'; g.fillRect(cx - 14, y + 16, 6, 10);
      e.fillStyle = '#ffc860'; e.beginPath(); e.roundRect(cx - 20, y + 12, 40, h - 24, 9); e.fill();
    }
  }
  const mk = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
    t.needsUpdate = true; return t;
  };
  return { map: mk(cv), glow: mk(gv) };
}

function makeBlobTexture() {
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 128;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 384, 128);
  g.filter = 'blur(2px)'; g.fillStyle = '#fff';
  // cell 0: a plane seen from above, nose at the top — chunky, so it reads on busy ground
  g.fillRect(53, 8, 22, 108); g.fillRect(6, 30, 116, 28); g.fillRect(34, 94, 60, 18);
  g.filter = 'none';
  // cell 1: soft ellipse
  const rg = g.createRadialGradient(192, 64, 4, 192, 64, 60);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.55, 'rgba(255,255,255,0.85)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(128, 0, 128, 128);
  // cell 2: a paper dart from above, nose at the top
  g.filter = 'blur(2px)'; g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(256 + 64, 6); g.lineTo(256 + 118, 120); g.lineTo(256 + 64, 104); g.lineTo(256 + 10, 120); g.closePath(); g.fill();
  g.filter = 'none';
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

// ── the system ───────────────────────────────────────────────────────────────
export function create(ctx) {
  const world = ctx.world;
  const group = new THREE.Group();
  group.name = 'planes';
  group.userData.noRay = true;
  group.userData.noFade = true; group.userData.noOcclude = true;
  ctx.scene.add(group);

  const bLoop = buildLoop(ROUTES.biplane.pts);
  const mLoop = buildLoop(ROUTES.blimp.pts);

  // ── bones ──────────────────────────────────────────────────────────────────
  const K = 9;                 // banner bones
  const BANNER_L = 21, BANNER_H = 3.3, SEG = BANNER_L / (K - 1);
  const ROPE = 9, SAG = 3.3;   // path distance to the banner pole, and how far below the path it hangs
  const B = {}; let nb = 0;
  B.biplane = nb++; B.prop = nb++; B.banner = nb; nb += K;
  for (const k of ['jet', 'blimp', 'blimpPropL', 'blimpPropR', 'earL', 'earR', 'paper0', 'paper1', 'paper2', 'candy', 'canopy', 'scarf', 'wave']) B[k] = nb++;
  const bones = [], inv = [];
  for (let i = 0; i < nb; i++) { const b = new THREE.Bone(); b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; b.name = 'planes_bone' + i; bones.push(b); inv.push(new THREE.Matrix4()); }
  for (let k = 0; k < K; k++) inv[B.banner + k].makeTranslation(0, 0, k * SEG);
  const skeleton = new THREE.Skeleton(bones, inv);
  const BM = bones.map((b) => b.matrixWorld);       // write targets
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -600, 0);

  // ── build the body ─────────────────────────────────────────────────────────
  const kb = new Kit();
  const kd = new Kit();
  const lights = [];           // [bone, x, y, z, hexColour, mode, size, phase]

  // BIPLANE ── +Z forward, +Y up, +X = port (left wing). Span 6.9 u: a candy-
  // cane biplane — white upper wing with red bands, red lower wing with white
  // bands, a spiral-striped fuselage, a peppermint cowl, and a gummy bear in
  // goggles and a streaming scarf sitting up in the open cockpit, waving.
  {
    const b = B.biplane;
    kb.fill = 0.3;                // sky-bounce on the undersides: they are what the ground sees
    kb.glow = 0.16;               // and a candy-lantern glow after dark, so it is not a black cut-out
    const spiral = (x, y, z) => ((Math.floor(y * 1.6 + (Math.atan2(z, x) / TAU) * 2 + 8) % 2) ? C.red : C.white);
    kb.part(new THREE.CylinderGeometry(0.8, 0.34, 4.7, 14, 10), M(0, 0.05, -0.3, Math.PI / 2), spiral, b);  // fuselage z ∈ [-2.65, 2.05]
    // peppermint cowl: a squashed dome in red/white wedges, gold ring, gold spinner
    kb.part(new THREE.SphereGeometry(0.84, 16, 10), M(0, 0.05, 2.05, 0, 0, 0, 1, 1, 0.62),
      (x, y) => ((Math.floor((Math.atan2(y, x) / TAU + 0.5) * 10) % 2) ? C.red : C.white), b);
    kb.part(new THREE.TorusGeometry(0.8, 0.09, 6, 20), M(0, 0.05, 1.95), C.gold, b);
    kb.glow = 0.4;
    kb.part(new THREE.ConeGeometry(0.3, 0.62, 10), M(0, 0.05, 2.78, Math.PI / 2), C.gold, b);
    kb.glow = 0.16;
    // wings: box + elliptical tip caps, banded along the span
    const band = (a, c) => (x) => ((Math.floor((x + 31) / 0.62) % 2) ? a : c);
    const wing = (w, y, z, chord, colFn, capCol) => {
      kb.part(new THREE.BoxGeometry(w, 0.22, chord, 10, 1, 1), M(0, y, z), colFn, b);
      for (const sx of [-1, 1]) {
        kb.part(new THREE.CylinderGeometry(chord / 2, chord / 2, 0.22, 12, 1, false, sx > 0 ? 0 : Math.PI, Math.PI),
          M(sx * w / 2, y, z, 0, 0, 0, 0.46, 1, 1), capCol, b);
      }
    };
    wing(6.2, 1.44, 0.55, 1.5, band(C.red, C.white), C.red);          // upper: white with red bands
    wing(5.4, -0.36, 0.62, 1.34, band(C.white, C.red), C.red);        // lower: red with white bands
    kb.glow = 0;
    for (const sx of [-1, 1]) for (const dz of [0.12, 0.98]) kb.part(new THREE.BoxGeometry(0.16, 1.58, 0.16), M(sx * 2.35, 0.54, dz), C.lic, b);
    for (const sx of [-1, 1]) kb.part(new THREE.BoxGeometry(0.13, 0.86, 0.13), M(sx * 0.42, 1.0, 0.62, 0, 0, -sx * 0.25), C.lic, b);
    // peppermint roundels on the upper wing's top and the lower wing's belly
    const mint = (x, y, z) => ((Math.floor((Math.atan2(z, x) / TAU + 0.5) * 8) % 2) ? C.red : C.white);
    for (const sx of [-1, 1]) {
      kb.part(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), M(sx * 2.0, 1.56, 0.55), mint, b);
      kb.part(new THREE.CylinderGeometry(0.52, 0.52, 0.05, 16), M(sx * 1.75, -0.48, 0.62), mint, b);
    }
    // tail: banded stabiliser + a red fin with a gumdrop cap
    kb.part(new THREE.BoxGeometry(2.6, 0.14, 1.0, 6, 1, 1), M(0, 0.14, -2.45), band(C.red, C.white), b);
    kb.part(new THREE.BoxGeometry(0.15, 1.35, 1.05), M(0, 0.8, -2.47), (x, y) => (y > 0.2 ? C.red : C.white), b);
    kb.part(new THREE.SphereGeometry(0.36, 8, 6), M(0, 1.45, -2.55, 0, 0, 0, 0.42, 0.75, 1.2), C.gummy, b);
    // undercarriage: licorice wheels with gold hubs
    for (const sx of [-1, 1]) {
      kb.part(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 12), M(sx * 0.95, -1.15, 0.95, 0, 0, Math.PI / 2), C.lic, b);
      kb.part(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 8), M(sx * 0.95, -1.15, 0.95, 0, 0, Math.PI / 2), C.gold, b);
      kb.part(new THREE.BoxGeometry(0.12, 0.9, 0.12), M(sx * 0.66, -0.72, 0.95, 0, 0, sx * 0.45), C.lic, b);
    }
    kb.part(new THREE.BoxGeometry(1.9, 0.1, 0.1), M(0, -1.15, 0.95), C.lic, b);
    // open cockpit (behind the upper wing, so the pilot is never hidden by it)
    kb.part(new THREE.TorusGeometry(0.47, 0.09, 6, 16), M(0, 0.64, -0.82, Math.PI / 2), C.choc, b);
    kb.part(new THREE.BoxGeometry(0.72, 0.34, 0.05), M(0, 0.84, -0.3, -0.42), C.glass, b);   // windscreen
    // the pilot: a gummy bear, head well above the rim
    kb.fill = 0.34;
    kb.part(new THREE.SphereGeometry(0.4, 10, 8), M(0, 0.72, -0.86), C.bear, b);                   // body
    kb.part(new THREE.SphereGeometry(0.45, 12, 10), M(0, 1.2, -0.84), C.bear, b);                  // head
    for (const sx of [-1, 1]) kb.part(new THREE.SphereGeometry(0.17, 8, 6), M(sx * 0.31, 1.58, -0.88), C.bear, b);  // round ears
    kb.part(new THREE.SphereGeometry(0.2, 8, 6), M(0, 1.06, -0.46, 0, 0, 0, 1.05, 0.8, 0.9), C.bearLight, b);  // muzzle
    kb.part(new THREE.SphereGeometry(0.075, 6, 4), M(0, 1.12, -0.29), C.lic, b);                  // nose
    kb.part(new THREE.TorusGeometry(0.455, 0.055, 6, 20), M(0, 1.3, -0.84, Math.PI / 2), C.choc, b);   // goggle strap
    for (const sx of [-1, 1]) {
      kb.glow = 0.5;
      kb.part(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), M(sx * 0.18, 1.3, -0.44, Math.PI / 2), C.glass, b);  // lenses
      kb.glow = 0;
      kb.part(new THREE.TorusGeometry(0.16, 0.05, 6, 12), M(sx * 0.18, 1.3, -0.4), C.gold, b);       // brass rims
    }
    kb.part(new THREE.TorusGeometry(0.33, 0.11, 6, 14), M(0, 0.92, -0.84, Math.PI / 2), C.red, b);   // scarf round the neck
    // the scarf's streaming tail and a waving paw each ride their own bone
    kb.part(new THREE.BoxGeometry(0.2, 0.08, 1.6, 1, 1, 6), M(0, 0, -0.8),
      (x, y, z) => ((Math.floor((z + 4) / 0.32) % 2) ? C.red : C.white), B.scarf);
    kb.part(new THREE.CylinderGeometry(0.1, 0.13, 0.62, 8), M(0, 0.31, 0), C.bear, B.wave);
    kb.part(new THREE.SphereGeometry(0.15, 8, 6), M(0, 0.66, 0), C.bearLight, B.wave);
    kb.fill = 0.3;
    // propeller (own bone, hub at the origin, spins about +Z) — the blur disc is in fx
    kb.part(new THREE.BoxGeometry(0.24, 3.1, 0.09), null, (x, y) => ((Math.floor(y * 2.2 + 20) % 2) ? C.red : C.white), B.prop);
    kb.part(new THREE.SphereGeometry(0.16, 6, 4), M(0, 0, 0.06), C.gold, B.prop);
    // banner pole + gumdrop weight (on banner bone 0) and the tow rope
    kb.part(new THREE.BoxGeometry(0.18, BANNER_H + 0.6, 0.18), M(0, 0.05, 0.12), C.lic, B.banner);
    kb.part(new THREE.SphereGeometry(0.36, 8, 6), M(0, -BANNER_H / 2 - 0.42, 0.12, 0, 0, 0, 1, 0.8, 1), C.gummy, B.banner);
    kb.link(b, [0, -0.05, -2.66], B.banner, [0, BANNER_H / 2 + 0.22, 0.14], 0.08, C.lic, [0, -0.3, -1]);
    kb.fill = 0;
    // nav lights: red to port, green to starboard, a white strobe on the fin, a red belly beacon
    lights.push([b, 3.5, 1.44, 0.55, 0xff2a2a, 0, 1.25, 0], [b, -3.5, 1.44, 0.55, 0x2aff5a, 0, 1.25, 0.3],
      [b, 0, 1.72, -2.58, 0xffffff, 2, 1.25, 0.15], [b, 0, -0.62, -0.9, 0xff3030, 1, 1.0, 0.55]);
  }

  // BANNER CLOTH (decal) — both faces, blended across the 9-bone chain
  const bannerVerts = [];      // [index, u, v, face]
  {
    const NU = 40, NV = 2;
    for (const face of [1, -1]) {
      const base = kd.count;
      for (let j = 0; j <= NV; j++) {
        for (let i = 0; i <= NU; i++) {
          const u = i / NU, v = j / NV;
          const z = -u * BANNER_L, y = (v - 0.5) * BANNER_H;
          const f = u * (K - 1); const k = Math.min(K - 2, Math.floor(f)); const w = f - k;
          _c.setHex(0xffffff);
          bannerVerts.push([kd.count, u, v, face]);
          kd.vert(face * 0.03, y, z, face, 0, 0, _c, 0, 0, B.banner + k, B.banner + k + 1, w);
        }
      }
      for (let j = 0; j < NV; j++) {
        for (let i = 0; i < NU; i++) {
          const a = base + j * (NU + 1) + i, b2 = a + 1, c2 = a + NU + 1, d = c2 + 1;
          if (face > 0) kd.I.push(a, b2, d, a, d, c2); else kd.I.push(a, d, b2, a, c2, d);
        }
      }
    }
  }

  // JET ── MEOW AIR
  {
    const b = B.jet;
    kb.fill = 0.26;
    const belly = (x, y, z, X, Y) => (Y < -0.42 ? C.jetOrange : C.jetWhite);
    kb.part(new THREE.CylinderGeometry(1.1, 1.1, 11, 14, 4), M(0, 0, 0.5, Math.PI / 2), belly, b);
    kb.part(new THREE.SphereGeometry(1.1, 14, 8), M(0, 0, 6.0, 0, 0, 0, 1, 1, 2.0),
      (x, y, z, X, Y, Z) => (Z > 6.9 && Z < 7.9 && Y > 0.1 ? C.navy : (Y < -0.42 ? C.jetOrange : C.jetWhite)), b);
    kb.part(new THREE.CylinderGeometry(1.1, 0.42, 3.8, 14, 2), M(0, 0.22, -6.9, Math.PI / 2 - 0.06), belly, b);
    for (const sx of [-1, 1]) {
      kb.part(new THREE.ConeGeometry(0.52, 1.0, 4), M(sx * 0.62, 1.22, 4.8, 0, Math.PI / 4, -sx * 0.28), C.jetOrange, b);
      kb.part(new THREE.ConeGeometry(0.3, 0.6, 4), M(sx * 0.6, 1.2, 5.05, 0, Math.PI / 4, -sx * 0.28), C.earPink, b);
    }
    kb.part(sweptWing(15.2, 0.28, 2.9, 0.42, 0.45), M(0, -0.5, 1.0), (x) => (Math.abs(x) > 6.1 ? C.jetOrange : C.jetWhite), b);
    kb.part(sweptWing(5.8, 0.2, 1.6, 0.5, 0.4), M(0, 0.45, -7.5), (x) => (Math.abs(x) > 2.1 ? C.jetOrange : C.jetWhite), b);
    for (const sx of [-1, 1]) {
      kb.part(new THREE.CylinderGeometry(0.6, 0.5, 2.4, 12), M(sx * 3.4, -1.2, 1.05, Math.PI / 2), C.grey, b);
      kb.part(new THREE.CylinderGeometry(0.63, 0.63, 0.22, 12), M(sx * 3.4, -1.2, 2.3, Math.PI / 2), C.jetOrange, b);
      kb.part(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 10), M(sx * 3.4, -1.2, 2.42, Math.PI / 2), C.lic, b);
      kb.part(new THREE.BoxGeometry(0.22, 0.55, 1.3), M(sx * 3.4, -0.72, 1.2), C.grey, b);
    }
    // the fin is a cat's tail: tabby-ringed, curling forward, white tip
    const pts = [[0, 0.7, -6.3], [0, 2.1, -7.5], [0, 3.5, -8.1], [0, 4.8, -7.9], [0, 5.6, -7.1], [0, 5.75, -6.15]];
    for (let i = 0; i < pts.length - 1; i++) {
      const r0 = 0.62 - i * 0.05, r1 = 0.62 - (i + 1) * 0.05;
      const { g, m } = tube(pts[i], pts[i + 1], r0, r1, 10);
      kb.part(g, m, i === pts.length - 2 ? C.jetWhite : (i % 2 ? C.jetTabby : C.jetOrange), b);
      if (i > 0) kb.part(new THREE.SphereGeometry(r0, 10, 6), M(...pts[i]), i % 2 ? C.jetTabby : C.jetOrange, b);
    }
    kb.part(new THREE.SphereGeometry(0.4, 10, 6), M(...pts[pts.length - 1]), C.jetWhite, b);
    // livery panels (decal): MEOW AIR both flanks, paw on the belly
    for (const side of [1, -1]) {
      const NU = 12, NV = 4, base = kd.count, z0 = -4.6, z1 = 4.6, a0 = -0.42, a1 = 1.1, r = 1.135;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const u = i / NU, v = j / NV, z = z0 + (z1 - z0) * (side > 0 ? 1 - u : u), a = a0 + (a1 - a0) * v;
        const [U, V] = uvAt(RECT.meow, u, v);
        _c.setHex(0xffffff);
        kd.vert(side * r * Math.cos(a), r * Math.sin(a), z + 0.5, side * Math.cos(a), Math.sin(a), 0, _c, U, V, b);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = base + j * (NU + 1) + i, b2 = a + 1, c2 = a + NU + 1, d = c2 + 1;
        kd.I.push(a, b2, d, a, d, c2);     // u runs nose→tail on port, tail→nose on starboard: outward both sides
      }
    }
    {
      const base = kd.count; _c.setHex(0xffffff);
      const q = [[-0.62, -0.9], [0.62, -0.9], [0.62, 3.3], [-0.62, 3.3]];
      const uvq = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let i = 0; i < 4; i++) { const [U, V] = uvAt(RECT.paw, uvq[i][0], uvq[i][1]); kd.vert(q[i][0], -1.15, q[i][1], 0, -1, 0, _c, U, V, b); }
      kd.I.push(base, base + 1, base + 2, base, base + 2, base + 3);   // faces −Y (seen from the ground)
    }
    kb.fill = 0;
    const tipZ = -1.0;          // swept tip: 1.0 − 7.6·0.42 + taper shift ≈ −1.5 … −0.9
    lights.push([b, 7.7, -0.5, tipZ - 0.6, 0xff2a2a, 0, 1.7, 0], [b, -7.7, -0.5, tipZ - 0.6, 0x2aff5a, 0, 1.7, 0.5],
      [b, 7.6, -0.5, tipZ - 0.9, 0xffffff, 2, 1.6, 0.1], [b, -7.6, -0.5, tipZ - 0.9, 0xffffff, 2, 1.6, 0.1],
      [b, 0, -1.25, 0.8, 0xff3030, 1, 1.6, 0.2], [b, 0, 1.18, 1.8, 0xff3030, 1, 1.5, 0.65], [b, 0, 6.3, -6.15, 0xffffff, 2, 1.5, 0.4]);
  }

  // CATBLIMP
  const BLIMP_R = 4.2, BLIMP_L = 12.5;
  const blimpRadius = (z) => { const t = z / BLIMP_L; let r = BLIMP_R * Math.sqrt(Math.max(0, 1 - t * t)); if (z < 0) r *= 1 - 0.22 * t * t; return r; };
  {
    const b = B.blimp;
    const env = new THREE.SphereGeometry(1, 20, 14);
    env.rotateX(Math.PI / 2);
    const p = env.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) * BLIMP_L; const t = z / BLIMP_L; const k = z < 0 ? 1 - 0.22 * t * t : 1;
      p.setXYZ(i, p.getX(i) * BLIMP_R * k, p.getY(i) * BLIMP_R * k, z);
    }
    env.computeVertexNormals();
    kb.glow = 0.34;               // a paper-lantern blimp after dark
    kb.part(env, null, (x, y, z) => {
      if (z > 11.2 || z < -11.8) return C.cream;
      return (Math.floor((Math.atan2(y, x) / TAU + 0.5) * 14 + 0.5) % 2) ? C.pink : C.mint;
    }, b);
    kb.glow = 0;
    // cat face on the nose
    for (const sx of [-1, 1]) {
      kb.part(new THREE.SphereGeometry(0.72, 10, 8), M(sx * 1.3, 1.05, 10.85, 0, 0, 0, 1, 1, 0.7), C.eye, b);
      kb.part(new THREE.SphereGeometry(0.22, 6, 5), M(sx * 1.18, 1.32, 11.35), 0xffffff, b);
      for (const k of [-1, 0, 1]) kb.part(new THREE.BoxGeometry(2.3, 0.14, 0.14), M(sx * 2.05, -0.15 + k * 0.32, 11.25, 0, sx * 0.35, sx * k * 0.2), C.lic, b);
    }
    kb.part(new THREE.SphereGeometry(0.42, 8, 6), M(0, 0.1, 12.35, 0, 0, 0, 1.2, 0.8, 0.8), C.nose, b);
    kb.part(new THREE.BoxGeometry(1.0, 0.13, 0.13), M(0, -0.55, 12.12), C.lic, b);
    kb.fill = 0.22;
    // tail fins: chunky rounded paddles (half-buried ellipsoids, swept back),
    // gummy red with a cream tip — never flat slabs
    const finGeo = (h) => {
      const g = new THREE.SphereGeometry(1, 12, 8); const q = g.attributes.position;
      for (let i = 0; i < q.count; i++) {
        const y = q.getY(i);
        q.setXYZ(i, q.getX(i) * 0.34, y * h, q.getZ(i) * 2.3 - 0.62 * Math.max(0, y) * h);
      }
      g.computeVertexNormals(); return g;
    };
    // band edges sit on the sphere's latitude rows (cos 45°, cos 67.5°), so no row is split into a zigzag
    const fin = (h) => (x, y) => (y > 0.66 * h ? C.cream : (y > 0.42 * h ? C.mint : C.gummy));
    const rTail = blimpRadius(-9.6);
    kb.glow = 0.14;
    kb.part(finGeo(3.4), M(0, rTail - 0.2, -9.6), fin(3.4), b);
    kb.part(finGeo(2.9), M(0, -rTail + 0.2, -9.6, 0, 0, Math.PI), fin(2.9), b);
    for (const sx of [-1, 1]) kb.part(finGeo(3.4), M(sx * (rTail - 0.2), 0, -9.6, 0, 0, -sx * Math.PI / 2), fin(3.4), b);
    kb.glow = 0;
    // the gondola: a rounded car (superellipsoid), cream over a cocoa keel with
    // a pink sash, candy-striped awnings over the windows, and a cat looking
    // out of the front window on each side (the port one is the captain)
    const GZ = 0.9, GY = -5.3, GH = [1.45, 1.0, 3.3];
    {
      const g = new THREE.BoxGeometry(2, 2, 2, 6, 8, 10); const q = g.attributes.position;
      for (let i = 0; i < q.count; i++) {
        const x = q.getX(i), y = q.getY(i), z = q.getZ(i);
        const n = Math.pow(Math.abs(x) ** 6 + Math.abs(y) ** 6 + Math.abs(z) ** 6, 1 / 6);
        q.setXYZ(i, x / n * GH[0], y / n * GH[1], z / n * GH[2]);
      }
      g.computeVertexNormals();
      kb.part(g, M(0, GY, GZ), (x, y) => (y > -0.26 ? C.cream : (y > -0.52 ? C.pink : C.cocoa)), b);   // row edges at ±0.25/0.5 of the half-height
    }
    for (const dz of [-1.2, 3.1]) for (const sx of [-1, 1]) kb.part(new THREE.BoxGeometry(0.22, 0.75, 0.22), M(sx * 0.7, -4.15, dz, 0, 0, sx * 0.25), C.choc, b);
    for (const sx of [-1, 1]) {
      // awning over the windows, sloping out and down
      kb.part(new THREE.BoxGeometry(0.66, 0.09, 4.2, 1, 1, 8), M(sx * 1.62, -4.6, 0.05, 0, 0, -sx * 0.55),
        (x, y, z) => ((Math.floor((z + 10) / 0.525) % 2) ? C.red : C.white), b);   // stops short of the front window: that one is the captain's
      // engine pod on an outrigger behind the car, pusher prop at its tail
      kb.part(new THREE.BoxGeometry(2.1, 0.26, 0.66), M(sx * 2.1, -5.15, -2.55, 0, sx * 0.35, 0), C.choc, b);
      kb.part(new THREE.CylinderGeometry(0.8, 0.56, 2.5, 12), M(sx * 3.1, -5.15, -3.5, Math.PI / 2), C.gummy, b);
      kb.part(new THREE.SphereGeometry(0.8, 12, 8), M(sx * 3.1, -5.15, -2.25, 0, 0, 0, 1, 1, 0.62), C.cream, b);
      kb.part(new THREE.TorusGeometry(0.74, 0.09, 6, 16), M(sx * 3.1, -5.15, -2.95), C.gold, b);
      // a cat in the front window, looking out (captain's hat to port)
      const cx = sx * 1.45, cy = -5.1, cz = 2.8, k = 1.3;      // head scale
      const fur = sx > 0 ? C.tabby : C.grey;
      kb.part(new THREE.SphereGeometry(0.46 * k, 12, 8), M(cx, cy, cz), fur, b);
      kb.part(new THREE.SphereGeometry(0.22 * k, 8, 6), M(cx + sx * 0.36 * k, cy - 0.12 * k, cz, 0, 0, 0, 0.8, 0.75, 1.2), C.cream, b);
      kb.part(new THREE.SphereGeometry(0.08 * k, 6, 4), M(cx + sx * 0.55 * k, cy - 0.04 * k, cz), C.nose, b);
      for (const dz of [-0.17, 0.17]) {
        kb.part(new THREE.SphereGeometry(0.085 * k, 6, 4), M(cx + sx * 0.41 * k, cy + 0.1 * k, cz + dz * k), C.eye, b);
        kb.part(new THREE.ConeGeometry(0.2 * k, 0.42 * k, 4), M(cx + sx * 0.05, cy + 0.46 * k, cz + dz * 1.6 * k, dz * 1.2, Math.PI / 4, 0), fur, b);
      }
      kb.part(new THREE.SphereGeometry(0.19, 8, 6), M(cx + sx * 0.35, cy - 0.62, cz + 0.55), fur, b);    // paw on the sill
      if (sx > 0) {
        kb.part(new THREE.CylinderGeometry(0.36 * k, 0.36 * k, 0.12, 12), M(cx, cy + 0.44 * k, cz), C.capBlue, b);
        kb.part(new THREE.CylinderGeometry(0.27 * k, 0.3 * k, 0.22, 12), M(cx, cy + 0.44 * k + 0.16, cz), C.white, b);
        kb.part(new THREE.BoxGeometry(0.14, 0.12, 0.14), M(cx + 0.33 * k, cy + 0.46 * k, cz), C.gold, b);
      }
    }
    // bunting: two strings of flags, envelope → gondola nose and gondola tail → envelope
    {
      const FLAG = [C.pink, C.mint, C.gold, 0x6ec3ff, C.red];
      const string = (a, c, sag) => {
        const n = Math.max(2, Math.round(Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) / 0.72));
        const P = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          P.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t]);
        }
        for (let i = 0; i < n; i++) {
          kb.link(b, P[i], b, P[i + 1], 0.045, C.lic, [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1], P[i + 1][2] - P[i][2]]);
          const m = [(P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2 - 0.62, (P[i][2] + P[i + 1][2]) / 2];
          kb.tri(P[i], P[i + 1], m, FLAG[i % FLAG.length], b);
        }
      };
      const zf = 8.6, zb = -7.4;
      string([0, -blimpRadius(zf) + 0.25, zf], [0, -4.5, GZ + GH[2] - 0.35], 0.5);
      string([0, -4.5, GZ - GH[2] + 0.35], [0, -blimpRadius(zb) + 0.25, zb], 0.45);
    }
    kb.fill = 0;
    // ears (own bones so they can twitch), pivot at the base
    kb.glow = 0.3;
    for (const [bone] of [[B.earL, 1], [B.earR, -1]]) {
      kb.part(new THREE.ConeGeometry(1.15, 2.1, 4), M(0, 1.0, 0, 0, Math.PI / 4, 0), (x, y, z, X, Y, Z) => C.pink, bone);
      kb.part(new THREE.ConeGeometry(0.62, 1.3, 4), M(0, 0.78, 0.42, 0, Math.PI / 4, 0), C.earPink, bone);
    }
    kb.glow = 0;
    // pusher props
    for (const bone of [B.blimpPropL, B.blimpPropR]) {
      kb.part(new THREE.BoxGeometry(0.26, 2.7, 0.08), null, (x, y) => ((Math.floor(y * 2 + 20) % 2) ? C.gummy : C.cream), bone);
      kb.part(new THREE.SphereGeometry(0.24, 8, 6), null, C.gold, bone);
    }
    // lettering (decal): SUGAR to port (+X), CATNIP to starboard (−X)
    for (const [side, rect] of [[1, RECT.sugar], [-1, RECT.catnip]]) {
      const NU = 18, NV = 4, base = kd.count, z0 = -6.4, z1 = 7.6, a0 = -0.36, a1 = 0.36;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const u = i / NU, v = j / NV;
        const z = side > 0 ? z1 - (z1 - z0) * u : z0 + (z1 - z0) * u;
        const a = a0 + (a1 - a0) * v, r = blimpRadius(z) + 0.08;
        const [U, V] = uvAt(rect, u, v);
        _c.setHex(0xffffff);
        kd.vert(side * r * Math.cos(a), r * Math.sin(a), z, side * Math.cos(a), Math.sin(a), 0, _c, U, V, b);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = base + j * (NU + 1) + i, b2 = a + 1, c2 = a + NU + 1, d = c2 + 1;
        kd.I.push(a, b2, d, a, d, c2);     // u runs nose→tail on port, tail→nose on starboard: outward both sides
      }
    }
    // gondola windows (decal), both sides
    for (const side of [1, -1]) {
      const base = kd.count; _c.setHex(0xffffff);
      const zs = side > 0 ? [3.3, -1.3] : [-1.3, 3.3];
      const q = [[zs[0], -5.5], [zs[1], -5.5], [zs[1], -4.78], [zs[0], -4.78]];
      const uvq = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let i = 0; i < 4; i++) { const [U, V] = uvAt(RECT.gondola, uvq[i][0], uvq[i][1]); kd.vert(side * 1.468, q[i][1], q[i][0], side, 0, 0, _c, U, V, b); }
      kd.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    // nav lights: red to port and green to starboard on the side fins' tips and
    // the gondola nose, white tail strobe, red beacons top and bottom
    const finTip = rTail - 0.2 + 3.3;
    lights.push([b, 0, 4.4, 0.5, 0xff3030, 1, 2.0, 0.4], [b, 0, 0.4, -12.9, 0xffffff, 2, 1.7, 0.0],
      [b, finTip, 0, -11.6, 0xff2a2a, 0, 1.6, 0], [b, -finTip, 0, -11.6, 0x2aff5a, 0, 1.6, 0],
      [b, 1.25, -5.6, 3.95, 0xff2a2a, 0, 1.1, 0], [b, -1.25, -5.6, 3.95, 0x2aff5a, 0, 1.1, 0],
      [b, 0, -6.25, 1.0, 0xff3030, 1, 1.5, 0.75]);
  }

  // PAPER PLANES — giant darts (5.3 u nose to tail) with a real dihedral, so
  // the centre fold reads as a valley and the wing folds as creases; printed
  // ruled lines / a menu band on top; lit from within (paper is translucent),
  // so they stay paper-white or pastel from below too.
  const PS = 2.0;
  {
    const looks = [[C.paperW, C.blueLine, C.creaseW], [C.paperY, C.mdRed, C.creaseY], [C.paperB, C.peach, C.creaseB]];   // pink ruled, menu yellow, sky blue
    const S = (p) => [p[0] * PS, p[1] * PS, p[2] * PS];
    const mix3 = (A, Bp, Cp, u, v, lift) => [A[0] + u * (Bp[0] - A[0]) + v * (Cp[0] - A[0]), A[1] + u * (Bp[1] - A[1]) + v * (Cp[1] - A[1]) + lift, A[2] + u * (Bp[2] - A[2]) + v * (Cp[2] - A[2])];
    kb.fill = 0.62; kb.glow = 0.3;              // translucent by day, pale in moonlight
    for (let j = 0; j < 3; j++) {
      const b = B['paper' + j];
      const [wc, kc, cc] = looks[j];
      const nose = S([0, 0.02, 1.65]), tc = S([0, -0.03, -1.45]), kbt = S([0, -0.5, -1.45]);
      for (const sx of [1, -1]) {
        const ml = S([sx * 0.52, 0.13, -1.45]), tl = S([sx * 1.38, 0.44, -1.45]);
        kb.tri(nose, tc, ml, wc, b); kb.tri(nose, ml, tl, wc, b);      // inner + outer panel: the fold between them is a crease
        // printing on the outer panel: two ruled lines (white), one fat menu band (yellow), one stripe (blue)
        const bands = j === 0 ? [[0.3, 0.06], [0.64, 0.06]] : j === 1 ? [[0.36, 0.26]] : [[0.5, 0.12]];
        for (const [f, wdt] of bands) {
          kb.tri(mix3(nose, ml, tl, 0.1, 0.06, 0.03), mix3(nose, ml, tl, 1 - f, f, 0.03), mix3(nose, ml, tl, 1 - f - wdt, f + wdt, 0.03), kc, b);
        }
      }
      kb.tri(nose, kbt, tc, cc, b);                                   // keel
      kb.tri([nose[0], nose[1] + 0.03, nose[2] - 0.1], [tc[0] + 0.1, tc[1] + 0.035, tc[2]], [tc[0] - 0.1, tc[1] + 0.035, tc[2]], cc, b);   // the centre fold
      // glow-stick wingtips (the one concession to aviation law) and a tail blinker
      lights.push([b, 1.38 * PS, 0.44 * PS, -1.45 * PS, 0xff3a3a, 0, 0.8, j * 0.3], [b, -1.38 * PS, 0.44 * PS, -1.45 * PS, 0x3aff6a, 0, 0.8, j * 0.3],
        [b, 0, 0.05, -1.45 * PS, 0xffffff, 2, 0.75, j * 0.37]);
    }
    kb.fill = 0; kb.glow = 0;
  }

  // PARACHUTE SWEET
  {
    const cb = B.candy, pb = B.canopy;
    kb.glow = 0.55;               // a sweet you can find in the dark
    kb.part(new THREE.SphereGeometry(0.46, 12, 8), M(0, 0, 0, 0, 0, 0, 1.4, 1, 1), (x, y, z) => ((Math.floor(x * 5 + Math.atan2(z, y) + 20) % 2) ? C.gummy : C.white), cb);
    kb.part(new THREE.ConeGeometry(0.34, 0.52, 7), M(0.9, 0, 0, 0, 0, Math.PI / 2), C.gold, cb);
    kb.part(new THREE.ConeGeometry(0.34, 0.52, 7), M(-0.9, 0, 0, 0, 0, -Math.PI / 2), C.gold, cb);
    kb.glow = 0;
    const canopy = new THREE.SphereGeometry(1.8, 14, 5, 0, TAU, 0, Math.PI / 2);
    canopy.scale(1, 0.62, 1);
    kb.part(canopy, null, (x, y, z) => ((Math.floor((Math.atan2(z, x) / TAU + 0.5) * 14) % 2) ? C.red : C.white), pb, { both: true });
    kb.part(new THREE.SphereGeometry(0.2, 6, 4), M(0, 1.15, 0), C.gold, pb);
    for (const [x, z] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) kb.link(pb, [x, 0, z], cb, [x * 0.12, 0.38, z * 0.12], 0.035, C.lic, [x, -2.4, z]);
    lights.push([cb, 0, 0, 0, 0xff6fb0, 0, 1.3, 0]);
  }

  // ── meshes ─────────────────────────────────────────────────────────────────
  const bodyGeo = kb.build();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0, emissive: 0x1b1418 });
  const uGlow = { value: 0 };
  // Sky-bounce fill: faces turned away from the sun get lit by the sky (the
  // aircraft are nearly always seen from BELOW, i.e. their shadow side), and
  // paper is translucent. uSunV is the sun in view space, uDay the daylight.
  const uSunV = { value: new THREE.Vector3(0, 1, 0) }, uDay = { value: 1 };
  // Aircraft read through HALF the scene's distance fog: a biplane 100 u up
  // should look like a biplane, not a grey speck (sky.js patches fog_fragment
  // for aerial perspective; scaling the depth keeps that look, just further out).
  const FOG_K = '0.5';
  const fogVert = (vs) => vs.replace('#include <fog_vertex>', '#include <fog_vertex>\n#ifdef USE_FOG\nvFogDepth *= ' + FOG_K + ';\n#endif');
  const FILL_GLSL = '(0.35 + 0.65 * (1.0 - max(dot(normal, uSunV), 0.0)))';
  bodyMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = uGlow; sh.uniforms.uSunV = uSunV; sh.uniforms.uDay = uDay;
    sh.vertexShader = fogVert(sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nattribute float aFill;\nvarying float vGlow;\nvarying float vFill;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvGlow = aGlow;\nvFill = aFill;'));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform float uDay;\nuniform vec3 uSunV;\nvarying float vGlow;\nvarying float vFill;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * (vGlow * uGlow + vFill * uDay * ' + FILL_GLSL + ');');
  };
  bodyMat.customProgramCacheKey = () => 'planes_body_glow_v2';
  const body = new THREE.SkinnedMesh(bodyGeo, bodyMat);
  body.name = 'planes_body';

  const atlas = makeAtlas(ctx.renderer);
  const decalGeo = kd.build();
  const decalMat = new THREE.MeshStandardMaterial({
    map: atlas.map, emissiveMap: atlas.glow, emissive: 0xffffff, emissiveIntensity: 0,
    roughness: 0.72, metalness: 0, alphaTest: 0.45, side: THREE.FrontSide,
  });
  decalMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunV = uSunV; sh.uniforms.uDay = uDay;
    sh.vertexShader = fogVert(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDay;\nuniform vec3 uSunV;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.3 * uDay * ' + FILL_GLSL + ';');
  };
  decalMat.customProgramCacheKey = () => 'planes_decal_v2';
  const decal = new THREE.SkinnedMesh(decalGeo, decalMat);
  decal.name = 'planes_decal';
  for (const m of [body, decal]) {
    m.bindMode = THREE.DetachedBindMode;
    m.bind(skeleton, new THREE.Matrix4());
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    m.userData.noFade = true; m.userData.noOcclude = true; m.userData.noInstOcclude = true; m.userData.noRay = true;
    m.raycast = NO_RAY;
    group.add(m);
  }

  // banner UVs: day / night rows of the atlas
  const bannerUV = decalGeo.attributes.uv;
  function setBannerText(night) {
    const rect = night ? RECT.bannerNight : RECT.bannerDay;
    for (const [i, u, v, face] of bannerVerts) { const [U, V] = uvAt(rect, face > 0 ? u : 1 - u, v); bannerUV.setXY(i, U, V); }
    bannerUV.needsUpdate = true;
  }
  let bannerNight = null;

  // ── fx: contrails + prop blur discs ───────────────────────────────────────
  // Contrails: per engine a chain of rings, each ring 5 verts (left, centre,
  // right, up, down) with alpha only at the centre, so the two crossed strips
  // read as a soft round tube from any angle instead of a flat ribbon.
  // Prop discs: a centre + four rings (hub, blade body, tip band, soft edge),
  // with two bright streaks that trail each blade and turn with it.
  const TM = 48;                          // contrail segments per engine
  const TV = 5;                           // verts per contrail ring
  const DISC = 24;                        // verts per disc ring
  const DR = [0.3, 0.84, 0.97, 1.06];     // disc ring radii (× prop radius)
  const nTrail = 2 * (TM + 1) * TV;
  const nDiscV = 1 + DR.length * DISC;
  const nDisc = 3 * nDiscV;
  const fxPos = new Float32Array((nTrail + nDisc) * 3);
  const fxCol = new Float32Array((nTrail + nDisc) * 4).fill(1);
  const fxIdx = [];
  for (let e = 0; e < 2; e++) for (let i = 0; i < TM; i++) {
    const a = (e * (TM + 1) + i) * TV, n = a + TV;       // 0 L · 1 C · 2 R · 3 U · 4 D
    for (const [p, q] of [[0, 1], [1, 2], [3, 1], [1, 4]]) fxIdx.push(a + p, a + q, n + q, a + p, n + q, n + p);
  }
  const trailIdxCount = fxIdx.length;
  const DISCS = [[B.prop, 1.62, 1], [B.blimpPropL, 1.45, 1], [B.blimpPropR, 1.45, -1]];
  for (let d = 0; d < 3; d++) {
    const c0 = nTrail + d * nDiscV, dir = DISCS[d][2];
    const ring = (k, i) => c0 + 1 + k * DISC + (i % DISC);
    for (let i = 0; i < DISC; i++) fxIdx.push(c0, ring(0, i), ring(0, i + 1));
    for (let k = 0; k < DR.length - 1; k++) for (let i = 0; i < DISC; i++) fxIdx.push(ring(k, i), ring(k + 1, i), ring(k + 1, i + 1), ring(k, i), ring(k + 1, i + 1), ring(k, i + 1));
    fxCol.set([1, 0.97, 0.97, 0.16], c0 * 4);
    for (let i = 0; i < DISC; i++) {
      // the blades lie along ±Y of the prop bone (θ = 90°, 270°); a streak trails each
      const th = i / DISC * TAU;
      let lobe = 0;
      for (const tb of [Math.PI / 2, Math.PI * 1.5]) { let dlt = ((tb - th) * dir) % TAU; if (dlt < 0) dlt += TAU; lobe = Math.max(lobe, Math.exp(-dlt * 1.9)); }
      fxCol.set([1, 0.95, 0.96, 0.2 + 0.4 * lobe], ring(0, i) * 4);
      fxCol.set([1, 0.92, 0.94, 0.3 + 0.5 * lobe], ring(1, i) * 4);
      fxCol.set([1, 0.42, 0.5, 0.62 + 0.25 * lobe], ring(2, i) * 4);
      fxCol.set([1, 0.62, 0.66, 0], ring(3, i) * 4);
    }
  }
  for (let i = 0; i < nTrail; i++) fxCol[i * 4 + 3] = 0;
  const fxGeo = new THREE.BufferGeometry();
  fxGeo.setAttribute('position', new THREE.BufferAttribute(fxPos, 3).setUsage(THREE.DynamicDrawUsage));
  fxGeo.setAttribute('color', new THREE.BufferAttribute(fxCol, 4).setUsage(THREE.DynamicDrawUsage));
  fxGeo.setIndex(fxIdx);
  fxGeo.setDrawRange(trailIdxCount, Infinity);
  const fxMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
  fxMat.onBeforeCompile = (sh) => { sh.vertexShader = fogVert(sh.vertexShader); };
  fxMat.customProgramCacheKey = () => 'planes_fx_v2';
  const fx = new THREE.Mesh(fxGeo, fxMat);
  fx.name = 'planes_fx'; fx.frustumCulled = false; fx.renderOrder = 2;
  fx.userData.noFade = true; fx.userData.noOcclude = true; fx.raycast = NO_RAY;
  group.add(fx);
  const discLocal = [];                   // unit ring directions
  for (let i = 0; i < DISC; i++) discLocal.push([Math.cos(i / DISC * TAU), Math.sin(i / DISC * TAU)]);

  // ── nav lights ──────────────────────────────────────────────────────────────
  const NL = lights.length;
  const lPos = new Float32Array(NL * 3), lCol = new Float32Array(NL * 3), lBlink = new Float32Array(NL * 3);
  lights.forEach((l, i) => { _c.setHex(l[4]); lCol.set([_c.r, _c.g, _c.b], i * 3); lBlink.set([l[5], l[7], l[6]], i * 3); });
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3).setUsage(THREE.DynamicDrawUsage));
  lGeo.setAttribute('aCol', new THREE.BufferAttribute(lCol, 3));
  lGeo.setAttribute('aBlink', new THREE.BufferAttribute(lBlink, 3));
  const lMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 800 }, uFogFar: { value: 500 } },
    vertexShader: /* glsl */`
      attribute vec3 aCol; attribute vec3 aBlink;
      uniform float uTime, uNight, uScale, uFogFar;
      varying vec3 vCol; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float t = uTime + aBlink.y;
        float on;
        if (aBlink.x > 1.5) { float f = fract(t * 0.9); on = step(f, 0.045) + step(abs(f - 0.13), 0.03); }
        else if (aBlink.x > 0.5) { float f = fract(t * 0.75); on = smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.18, 0.34, f)); }
        else { on = 0.88 + 0.12 * sin(t * 7.0); }
        float d = max(-mv.z, 0.1);
        vA = clamp(on, 0.0, 1.0) * uNight * (1.0 - smoothstep(uFogFar * 1.4, uFogFar * 2.6, d));
        vCol = aCol;
        gl_PointSize = clamp(aBlink.z * 1.9 * uScale / d, 6.0, 72.0) * (0.5 + 0.5 * clamp(on, 0.0, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float core = 1.0 - smoothstep(0.0, 0.32, r);
        float halo = 1.0 - smoothstep(0.15, 1.0, r);
        float a = (core * 0.9 + halo * halo * 0.55) * vA;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vCol * a + vec3(core * vA * 0.55), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const navPoints = new THREE.Points(lGeo, lMat);
  navPoints.name = 'planes_lights'; navPoints.frustumCulled = false; navPoints.renderOrder = 3;
  navPoints.userData.noFade = true; navPoints.userData.noOcclude = true; navPoints.raycast = NO_RAY;
  group.add(navPoints);
  const lightLocal = lights.map((l) => new THREE.Vector3(l[1], l[2], l[3]));

  // ── blob shadows ──────────────────────────────────────────────────────────
  const NBLOB = 6;             // biplane, banner, blimp, paper ×3
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(Math.PI / 2);
  const aCell = new THREE.InstancedBufferAttribute(new Float32Array([0, 1, 1, 2, 2, 2]), 1);
  const aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(NBLOB), 1).setUsage(THREE.DynamicDrawUsage);
  blobGeo.setAttribute('aCell', aCell); blobGeo.setAttribute('aAlpha', aAlpha);
  const blobMat = new THREE.MeshBasicMaterial({
    map: makeBlobTexture(), color: 0x140a20, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  blobMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;\nattribute float aAlpha;\nvarying float vBlobA;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x = (vMapUv.x + aCell) / 3.0;\nvBlobA = aAlpha;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBlobA;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vBlobA;');
  };
  blobMat.customProgramCacheKey = () => 'planes_blob_v2';
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, NBLOB);
  blobs.name = 'planes_blobs'; blobs.frustumCulled = false; blobs.castShadow = false; blobs.receiveShadow = false;
  blobs.userData.noFade = true; blobs.userData.noOcclude = true; blobs.userData.noInstOcclude = true;
  blobs.renderOrder = 1; blobs.raycast = NO_RAY;
  group.add(blobs);

  // ── state ───────────────────────────────────────────────────────────────────
  let T = 0;                               // flight clock (stops while paused or held)
  let TR = 0;                              // rotor / ripple clock (stops only while paused)
  let sB = 0.12 * bLoop.len;               // biplane arc offset
  let sM = 0.9 * mLoop.len;                // blimp arc offset
  let tP = 0;                              // paper clock offset
  let jetOff = ROUTES.jet.period - ROUTES.jet.first;
  const api = {};
  const air = {
    biplane: { x: 0, y: 0, z: 0, heading: 0 }, jet: { x: 0, y: 0, z: 0, heading: 0, active: false },
    blimp: { x: 0, y: 0, z: 0, heading: 0 }, paper: [0, 1, 2].map(() => ({ x: 0, y: 0, z: 0, heading: 0 })),
  };

  // scratch
  const p0 = new THREE.Vector3(), pA = new THREE.Vector3(), pB = new THREE.Vector3(), f = new THREE.Vector3();
  const acc = new THREE.Vector3(), up = new THREE.Vector3(), xa = new THREE.Vector3(), ya = new THREE.Vector3();
  const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), q1 = new THREE.Quaternion(), s1 = new THREE.Vector3(), v1 = new THREE.Vector3();
  const bannerP = Array.from({ length: K }, () => new THREE.Vector3());
  const tangent = new THREE.Vector3(), nrm = new THREE.Vector3();
  const jetA = new THREE.Vector3(), jetDir = new THREE.Vector3(), jetSide = new THREE.Vector3();
  let jetLane = -1, jetLen = 1;
  const tint = new THREE.Color(), white = new THREE.Color(0xffffff), nightTint = new THREE.Color(0x707c9c);   // moonlit contrails
  const e1 = new THREE.Euler();
  const EARS = [[B.earL, 1, 0], [B.earR, -1, 2.1]];
  const PAPER = [B.paper0, B.paper1, B.paper2];

  function pose(m, pos, fwd, upHint) {
    xa.crossVectors(upHint, fwd); if (xa.lengthSq() < 1e-8) xa.set(1, 0, 0); xa.normalize();
    ya.crossVectors(fwd, xa).normalize();
    m.makeBasis(xa, ya, fwd).setPosition(pos);
  }
  const heading = (fw) => Math.atan2(fw.x, fw.z);
  const store = (o, pos, fw) => { o.x = pos.x; o.y = pos.y; o.z = pos.z; o.heading = heading(fw); };

  // ── BIPLANE + BANNER ─────────────────────────────────────────────────────────
  function flyBiplane(t, w) {
    const sp = ROUTES.biplane.speed, s = sB + t * sp, d = 7;
    bLoop.at(s - d, pA); bLoop.at(s, p0); bLoop.at(s + d, pB);
    f.subVectors(pB, pA).normalize();
    acc.copy(pB).add(pA).addScaledVector(p0, -2).multiplyScalar(sp * sp / (d * d));
    up.set(0, G, 0).add(acc).normalize();
    p0.y += 0.45 * Math.sin(t * 0.8);
    pose(BM[B.biplane], p0, f, up);
    store(air.biplane, p0, f);
    // propeller
    m1.makeRotationZ(w * 31).setPosition(0, 0.05, 2.66);
    BM[B.prop].multiplyMatrices(BM[B.biplane], m1);
    // the pilot's scarf streams and snaps; the other paw waves at whoever is below
    m1.makeRotationFromEuler(e1.set(0.1 + 0.1 * Math.sin(w * 13.1), 0.22 + 0.26 * Math.sin(w * 9.3), 0.3 * Math.sin(w * 17.3))).setPosition(0.12, 0.92, -1.14);
    BM[B.scarf].multiplyMatrices(BM[B.biplane], m1);
    m1.makeRotationFromEuler(e1.set(0.25, 0, -(0.6 + 0.42 * Math.sin(w * 5.2)))).setPosition(0.4, 0.98, -0.8);
    BM[B.wave].multiplyMatrices(BM[B.biplane], m1);
    // banner: each bone sits ON the flight path, ROPE + k·SEG behind, a wave running down it
    for (let k = 0; k < K; k++) {
      const sk = s - ROPE - k * SEG;
      bLoop.at(sk, bannerP[k]);
      bLoop.at(sk + 1.5, pA); bLoop.at(sk - 1.5, pB);
      tangent.subVectors(pA, pB); tangent.y = 0; tangent.normalize();
      nrm.set(-tangent.z, 0, tangent.x);
      const kk = k / (K - 1);
      const lat = (0.08 + 0.8 * Math.pow(kk, 1.25)) * Math.sin(w * 8.2 - k * 0.95) + 0.3 * kk * Math.sin(w * 1.7 - k * 0.4);
      bannerP[k].addScaledVector(nrm, lat);
      bannerP[k].y += -SAG + 0.45 * Math.sin(t * 0.8 - 0.3) - 0.35 * kk + 0.16 * kk * Math.sin(w * 10.5 - k * 1.4);
    }
    for (let k = 0; k < K; k++) {
      if (k === 0) f.subVectors(bannerP[0], bannerP[1]); else f.subVectors(bannerP[k - 1], bannerP[k]);
      f.normalize();
      pose(BM[B.banner + k], bannerP[k], f, UP);
    }
  }

  // ── JET ──────────────────────────────────────────────────────────────────────
  // Each pass gets a fresh seeded lane; of eight seeded candidates it takes the
  // one that stays furthest from the clouds (sky.clouds, read from their live
  // instance matrices) over the middle 600 u, so the jet and its contrail never
  // plough through a cloud where you can see it.
  const CLOUD_C = [];                      // scratch: [x, y, z, s] × n (filled per lane, reused)
  function readClouds() {
    let n = 0;
    const kids = ctx.systems.sky?.clouds?.group?.children;
    if (!kids) return 0;
    for (const mesh of kids) {
      const arr = mesh.instanceMatrix?.array; if (!arr) continue;
      for (let i = 0; i < mesh.count; i++) {
        const o = i * 16, sc = Math.hypot(arr[o], arr[o + 1], arr[o + 2]);
        if (sc < 1) continue;
        CLOUD_C[n * 4] = arr[o + 12]; CLOUD_C[n * 4 + 1] = arr[o + 13]; CLOUD_C[n * 4 + 2] = arr[o + 14]; CLOUD_C[n * 4 + 3] = sc; n++;
      }
    }
    return n;
  }
  function laneMargin(nc, ax, y, az, dx, dz, half) {
    let best = 999;
    for (let i = 0; i < nc; i++) {
      const px = CLOUD_C[i * 4] - ax, pz = CLOUD_C[i * 4 + 2] - az, s = CLOUD_C[i * 4 + 3];
      const along = px * dx + pz * dz;
      if (along < half - 330 || along > half + 330) continue;
      const lat = Math.abs(px * dz - pz * dx) - (s * 1.05 + 12);
      const vert = Math.abs(CLOUD_C[i * 4 + 1] - y) - (s * 0.55 + 6);
      best = Math.min(best, Math.max(lat, vert * 2));
    }
    return best;
  }
  function jetLaneFor(k) {
    const J = ROUTES.jet;
    const r = rng(hash('planes-jet') + k * 7919);
    const nc = readClouds();
    let best = -Infinity, bAng = 0, bCx = 0, bCz = 0, bY = J.alt;
    for (let c = 0; c < 8; c++) {
      const ang = r.range(-0.42, 0.42) + (k % 2 ? Math.PI : 0);
      const cx = r.range(-30, 30), cz = r.range(-45, 45), y = J.alt + r.range(-4, 6);
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const m = nc ? laneMargin(nc, cx - dx * J.half, y, cz - dz * J.half, dx, dz, J.half) : 0;
      if (m > best + 1e-6) { best = m; bAng = ang; bCx = cx; bCz = cz; bY = y; }
      if (!nc) break;
    }
    jetDir.set(Math.cos(bAng), 0, Math.sin(bAng));
    jetA.set(bCx - jetDir.x * J.half, bY, bCz - jetDir.z * J.half);
    jetSide.crossVectors(UP, jetDir).normalize();
    jetLen = J.half * 2;
    jetLane = k;
  }
  let trailOn = false;
  function flyJet(t) {
    const J = ROUTES.jet;
    const jt = t + jetOff;
    const k = Math.floor(jt / J.period), tau = jt - k * J.period;
    if (k !== jetLane) jetLaneFor(k);
    const D = tau * J.speed;
    if (D <= jetLen) {
      p0.copy(jetA).addScaledVector(jetDir, D);
      up.copy(UP).addScaledVector(jetSide, 0.04 * Math.sin(t * 0.5));
      pose(BM[B.jet], p0, jetDir, up.normalize());
      store(air.jet, p0, jetDir); air.jet.active = true;
    } else { BM[B.jet].copy(HIDDEN); air.jet.active = false; }
    // contrails: two strips behind the engines, age = time since that air was laid
    const maxAge = 11, trailLen = Math.min(J.speed * maxAge, jetLen);
    const head = Math.min(D, jetLen);
    const alive = tau < jetLen / J.speed + maxAge;
    if (!alive) { if (trailOn) { fxGeo.setDrawRange(trailIdxCount, Infinity); trailOn = false; } return; }
    if (!trailOn) { fxGeo.setDrawRange(0, Infinity); trailOn = true; }
    for (let e = 0; e < 2; e++) {
      const ex = e ? -3.4 : 3.4;
      for (let i = 0; i <= TM; i++) {
        const xL = head - (i / TM) * trailLen;
        const x = Math.max(0, xL);
        const age = tau - x / J.speed;
        let a = 0.78 * smoothstep(0.03, 0.35, age) * (1 - smoothstep(maxAge * 0.35, maxAge, age)) * (0.86 + 0.14 * Math.sin(x * 0.13 + e * 2.3));
        if (xL < 0 || age < 0) a = 0;
        // puffs are fixed in the air (phase from distance along the lane), and spread with age
        const w = (0.45 + age * 0.46) * (1 + 0.3 * Math.sin(x * 0.19 + e * 1.9));
        const drift = Math.sin(age * 0.45 + x * 0.035 + e) * age * 0.16;
        v1.copy(jetA).addScaledVector(jetDir, x).addScaledVector(jetSide, ex + drift);
        v1.y += -1.2 + age * 0.1;
        const o = (e * (TM + 1) + i) * TV, P = o * 3;
        fxPos[P] = v1.x + jetSide.x * w; fxPos[P + 1] = v1.y; fxPos[P + 2] = v1.z + jetSide.z * w;
        fxPos[P + 3] = v1.x; fxPos[P + 4] = v1.y; fxPos[P + 5] = v1.z;
        fxPos[P + 6] = v1.x - jetSide.x * w; fxPos[P + 7] = v1.y; fxPos[P + 8] = v1.z - jetSide.z * w;
        fxPos[P + 9] = v1.x; fxPos[P + 10] = v1.y + w * 0.8; fxPos[P + 11] = v1.z;
        fxPos[P + 12] = v1.x; fxPos[P + 13] = v1.y - w * 0.8; fxPos[P + 14] = v1.z;
        fxCol[(o + 1) * 4 + 3] = a;           // only the core is opaque: the edges fade to nothing
      }
    }
  }

  // ── BLIMP ────────────────────────────────────────────────────────────────────
  function flyBlimp(t, w) {
    const s = sM + t * ROUTES.blimp.speed;
    mLoop.at(s - 9, pA); mLoop.at(s, p0); mLoop.at(s + 9, pB);
    f.subVectors(pB, pA); f.y = 0; f.normalize();
    const yaw = 0.05 * Math.sin(t * 0.23);
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    f.set(f.x * c + f.z * sn, 0.035 * Math.sin(t * 0.27), -f.x * sn + f.z * c).normalize();
    p0.y += 0.9 * Math.sin(t * 0.31);
    pose(BM[B.blimp], p0, f, UP);
    store(air.blimp, p0, f);
    m1.makeRotationZ(w * 19).setPosition(3.1, -5.15, -4.9); BM[B.blimpPropL].multiplyMatrices(BM[B.blimp], m1);
    m1.makeRotationZ(-w * 19 + 0.7).setPosition(-3.1, -5.15, -4.9); BM[B.blimpPropR].multiplyMatrices(BM[B.blimp], m1);
    for (let i = 0; i < 2; i++) {
      const bone = EARS[i][0], sx = EARS[i][1], ph = EARS[i][2];
      const flick = Math.pow(Math.max(0, Math.sin(w * 0.83 + ph)), 18);
      const r = blimpRadius(5.8);
      q1.setFromEuler(e1.set(-0.25 - flick * 0.5, 0, -sx * (0.38 + flick * 0.35)));
      m1.compose(v1.set(sx * r * 0.55, r * 0.8, 5.8), q1, s1.set(1, 1, 1));
      BM[bone].multiplyMatrices(BM[B.blimp], m1);
    }
  }

  // ── PAPER PLANES ─────────────────────────────────────────────────────────────
  function flyPaper(t, w, cam) {
    const e = 0.05;
    for (let j = 0; j < 3; j++) {
      paperPos(t - e, j, pA); paperPos(t, j, p0); paperPos(t + e, j, pB);
      f.subVectors(pB, pA).normalize();
      acc.copy(pB).add(pA).addScaledVector(p0, -2).multiplyScalar(1 / (e * e));
      up.set(0, G, 0).add(acc).normalize();
      pose(BM[PAPER[j]], p0, f, up);
      // paper flutter: a little roll about the nose
      m1.makeRotationZ(0.1 * Math.sin(w * 11 + j * 2.1) + 0.05 * Math.sin(w * 23 + j));
      BM[PAPER[j]].multiply(m1);
      // never through the lens: a plane inside 18 u of the camera shrinks away
      // (gone by 9 u) instead of filling the frame with a pastel triangle
      if (cam) {
        const dc = p0.distanceTo(cam.position);
        if (dc < 18) { const k = Math.max(0.001, clamp((dc - 9) / 9, 0, 1)); const kk = k * k * (3 - 2 * k); m1.makeScale(kk, kk, kk); BM[PAPER[j]].multiply(m1); }
      }
      store(air.paper[j], p0, f);
    }
  }

  // ── CANDY DROPS ──────────────────────────────────────────────────────────────
  const DROP_EVERY = 40, DROP_MAX_WAITING = 3, DROP_MAX_TOTAL = 60, CANDY_LIFT = 1.55;
  const drop = { active: false, t: 0, T: 1, x0: 0, y0: 0, z0: 0, xl: 0, zl: 0, yl: 0, vx: 0, vz: 0, landed: false, t2: 0, side: 1 };
  let dropClock = DROP_EVERY - 22;        // first drop ~22 s in
  let dropSeq = 0;
  const drops = [];
  const NO_DROP = ['candy_village', 'candy_palace', 'giant_cupcake', 'candy_dock', 'chocolate_lake', 'sour_shrine'];
  function landingOk(x, z) {
    if (world.islandAt(x, z) !== 'candy') return false;
    if (!world.isFreeGround(x, z, { pathMargin: 0.2, riverMargin: 1.6, avoidLandmarks: true, minHeight: 1.1 })) return false;
    for (const id of NO_DROP) { const l = world.LANDMARKS[id]; if (l && Math.hypot(x - l.x, z - l.z) < l.r + 4) return false; }
    const cols = ctx.colliders || [];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.box) {
        const ca = Math.cos(c.rot || 0), sa = Math.sin(c.rot || 0), dx = x - c.x, dz = z - c.z;
        if (Math.abs(dx * ca + dz * sa) < (c.w || 1) / 2 + 1.6 && Math.abs(-dx * sa + dz * ca) < (c.d || 1) / 2 + 1.6) return false;
      } else if (Math.hypot(x - c.x, z - c.z) < (c.r || 0) + 1.6) return false;
    }
    for (const w of ctx.walkables || []) { const wy = w.test?.(x, z); if (wy != null && wy > world.height(x, z) + 0.6) return false; }
    return true;
  }
  function findLanding(x, z) {
    if (landingOk(x, z)) return [x, z];
    for (let r = 3; r <= 30; r += 3) for (let a = 0; a < 12; a++) {
      const ang = a / 12 * TAU + r * 0.37, px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
      if (landingOk(px, pz)) return [px, pz];
    }
    return null;
  }
  function waiting() { let n = 0; for (const p of drops) if (p && !p.taken) n++; return n; }
  function startDrop(x0, y0, z0, xl, zl, vx, vz, k0 = 0) {
    const yl = world.height(xl, zl) + CANDY_LIFT;
    Object.assign(drop, { active: true, t: 0, x0, y0, z0, xl, zl, yl, vx, vz, landed: false, t2: 0, side: (dropSeq % 2) ? 1 : -1 });
    drop.T = 1.2 + Math.max(2, (y0 - 4.5 - yl) / 3.1);
    drop.t = k0 * drop.T;
  }
  function releaseFromBiplane() {
    if (drop.active) return false;
    if (waiting() >= DROP_MAX_WAITING || dropSeq >= DROP_MAX_TOTAL) return false;
    const a = air.biplane;
    if (world.islandAt(a.x, a.z) !== 'candy') return false;
    const fx0 = Math.sin(a.heading), fz0 = Math.cos(a.heading);
    const spot = findLanding(a.x + fx0 * 12, a.z + fz0 * 12);
    if (!spot) return false;
    startDrop(a.x, a.y - 1.3, a.z, spot[0], spot[1], fx0 * ROUTES.biplane.speed, fz0 * ROUTES.biplane.speed);
    ctx.events.emit('planes:drop', { x: spot[0], z: spot[1] });
    return true;
  }
  function land() {
    const inv = ctx.systems.inventory;
    const id = 'planes_drop_' + (++dropSeq);
    let p = null;
    try {
      p = inv?.registerPickup?.({ id, x: drop.xl, z: drop.zl, itemId: 'candy', n: 1, label: 'Pick up the air-dropped sweet', variant: 'wrapper', tint: 0xff4f9a }) || null;
    } catch (err) { console.warn('[planes] registerPickup failed', err?.message || err); }
    if (p) {
      drops.push(p);
      p.mapId = id;              // inventory.take() removes a pickup's own map marker
      try { ctx.systems.ui?.addMapMarker?.({ id, x: drop.xl, z: drop.zl, glyph: 'candy', label: 'Air-dropped sweet' }); } catch { /* optional */ }
    }
    const pl = ctx.systems.player?.position;
    if (pl && Math.hypot(pl.x - drop.xl, pl.z - drop.zl) < 70) ctx.systems.ui?.toast?.('Air drop! A sweet on a parachute just landed nearby.', 3.2);
    ctx.events.emit('planes:landed', { x: drop.xl, z: drop.zl, id });
  }

  function flyDrop(dt) {
    if (!drop.active) { BM[B.candy].copy(HIDDEN); BM[B.canopy].copy(HIDDEN); return; }
    const d = drop;
    if (!d.landed) {
      d.t += dt;
      const k = Math.min(1, d.t / d.T);
      const inert = (1 - Math.exp(-2.2 * d.t)) / 2.2 * (1 - k);
      const e = smoothstep(0, 1, k);
      const sway = Math.sin(d.t * 1.6) * 0.7 * Math.min(1, d.t / 2) * (1 - k * 0.6);
      const hx = d.x0 + (d.xl - d.x0) * e + d.vx * inert * 0.35;
      const hz = d.z0 + (d.zl - d.z0) * e + d.vz * inert * 0.35;
      const fall = d.t < 1.2 ? 1.8 * d.t * d.t : 2.6 + (d.t - 1.2) * ((d.y0 - 2.6 - d.yl) / Math.max(0.1, d.T - 1.2));
      const y = Math.max(d.yl, d.y0 - fall);
      const open = smoothstep(0.35, 1.3, d.t);
      const swing = Math.sin(d.t * 1.6 + 0.6) * 0.16 * open;
      q1.setFromEuler(e1.set(0, d.t * 0.5 + d.side, swing));
      m1.compose(v1.set(hx + sway, y, hz), q1, s1.set(1, 1, 1));
      BM[B.candy].copy(m1);
      m2.compose(v1.set(0, 2.6 * (0.55 + 0.45 * open), 0), q1.identity(), s1.set(0.15 + 0.85 * open, 0.2 + 0.8 * open, 0.15 + 0.85 * open));
      BM[B.canopy].multiplyMatrices(m1, m2);
      if (k >= 1) { d.landed = true; d.t2 = 0; land(); }
    } else {
      d.t2 += dt;
      // the sweet is now the inventory's; the canopy settles and crumples
      BM[B.candy].copy(HIDDEN);
      const c = Math.min(1, d.t2 / 0.9);
      q1.setFromEuler(e1.set(0, d.side, 0.4 * c));
      const gy = world.height(d.xl, d.zl);
      m1.compose(v1.set(d.xl + 1.2 * c, lerp(d.yl + 2.6, gy + 0.2, c), d.zl), q1, s1.set(1 + 0.25 * c, 1 - 0.85 * c, 1 + 0.25 * c));
      BM[B.canopy].copy(m1);
      if (d.t2 > 2.4) { d.active = false; }
    }
  }

  // ── per-frame helpers ────────────────────────────────────────────────────────
  function writeProps() {
    for (let d = 0; d < 3; d++) {
      const bone = DISCS[d][0], r = DISCS[d][1];
      const m = BM[bone].elements;
      const c0 = nTrail + d * nDiscV;
      // a hair in front of the blades so the two never z-fight
      const ox = m[8] * 0.06 + m[12], oy = m[9] * 0.06 + m[13], oz = m[10] * 0.06 + m[14];
      fxPos[c0 * 3] = ox; fxPos[c0 * 3 + 1] = oy; fxPos[c0 * 3 + 2] = oz;
      for (let k = 0; k < DR.length; k++) {
        const rk = r * DR[k];
        for (let i = 0; i < DISC; i++) {
          const lx = discLocal[i][0] * rk, ly = discLocal[i][1] * rk, o = (c0 + 1 + k * DISC + i) * 3;
          fxPos[o] = m[0] * lx + m[4] * ly + ox; fxPos[o + 1] = m[1] * lx + m[5] * ly + oy; fxPos[o + 2] = m[2] * lx + m[6] * ly + oz;
        }
      }
    }
  }
  const blobM = new THREE.Matrix4();
  // lean: 1 = cast along the true sun direction, 0 = straight down. A shadow
  // 40 u from its aircraft reads as a stray smudge, so they lean only partway.
  const LK = world.LAKE;
  const groundY = (x, z, decks) => {            // terrain, the sea, Chocolate Lake's surface
    let h = Math.max(world.height(x, z), 0.12);
    if (decks) {                                // …and plaza floors / decks / low props (Contract A)
      const gh = ctx.systems.player?.groundHeight?.(x, z);
      if (typeof gh === 'number' && gh === gh) h = Math.max(h, gh);
    }
    return (LK && Math.hypot(x - LK.x, z - LK.z) < LK.r + 1) ? Math.max(h, LK.surface ?? 0) : h;
  };
  function blob(i, pos, hd, w, l, alpha, sun, lean) {
    if (alpha <= 0.002 || !sun || sun.y < 0.2) { aAlpha.array[i] = 0; return; }
    const kx = sun.x * lean / sun.y, kz = sun.z * lean / sun.y;
    let h = groundY(pos.x, pos.z, false);
    let gx = pos.x - kx * (pos.y - h), gz = pos.z - kz * (pos.y - h);
    h = groundY(gx, gz, false); gx = pos.x - kx * (pos.y - h); gz = pos.z - kz * (pos.y - h);
    h = groundY(gx, gz, true);
    q1.setFromAxisAngle(UP, hd);
    blobM.compose(v1.set(gx, h + 0.35, gz), q1, s1.set(w, 1, l));
    blobs.setMatrixAt(i, blobM);
    aAlpha.array[i] = alpha * clamp(1.3 - (pos.y - h) / 200, 0.35, 1) * smoothstep(0.2, 0.42, sun.y);
  }

  let markerT = 0, overB = false, overJ = false;
  function flyover(name) {
    ctx.events.emit('planes:flyover', { name });
    try { ctx.systems.audio?.play?.(name === 'jet' ? 'jet' : 'plane'); } catch { /* audio is optional */ }
  }
  const mkBiplane = { id: 'plane_biplane', x: 0, z: 0, glyph: 'plane', label: 'Banner biplane' };
  const mkBlimp = { id: 'plane_blimp', x: 0, z: 0, glyph: 'plane', label: 'SUGAR / CATNIP blimp' };

  function update(dt, c) {
    const st = c.state;
    if (!st.paused) { TR += dt; if (!api.hold) T += dt; }
    const t = T, tr = TR;           // tr: rotor / ripple / flutter clock, keeps running under hold
    flyBiplane(t, tr);
    flyJet(t);
    flyBlimp(t, tr);
    flyPaper(t + tP, tr, c.camera);
    // drops
    if (!st.paused) {
      dropClock += dt;
      if (dropClock >= DROP_EVERY && !api.hold) { if (releaseFromBiplane()) dropClock = 0; else dropClock = DROP_EVERY - 3; }
      flyDrop(dt);
    }
    writeProps();
    fxGeo.attributes.position.needsUpdate = true;
    if (trailOn) fxGeo.attributes.color.needsUpdate = true;

    // light: contrail tint, glow, nav lights
    const sky = c.systems.sky;
    const day = st.daylight ?? 1;
    const lamp = sky?.lampMix ?? (st.isNight ? 1 : 0);
    tint.copy(nightTint).lerp(white, clamp(day * 1.2, 0, 1));
    if (sky?.horizonColor) tint.lerp(sky.horizonColor, 0.18 * (1 - Math.abs(day * 2 - 1)));
    fxMat.color.copy(tint);
    decalMat.emissiveIntensity = 1.6 * lamp;
    uGlow.value = lamp;
    uDay.value = clamp(day * 1.3, 0, 1);
    if (sky?.sunDir) uSunV.value.copy(sky.sunDir).transformDirection(c.camera.matrixWorldInverse);
    bodyMat.emissive.setRGB(0.012 + 0.02 * day, 0.009 + 0.015 * day, 0.012 + 0.015 * day);
    const night = sky?.lampsOn ?? st.isNight;
    if (night !== bannerNight) { bannerNight = night; setBannerText(night); }
    const nightK = clamp(Math.max(lamp, 1 - day * 1.6), 0, 1);
    navPoints.visible = nightK > 0.01;
    if (navPoints.visible) {
      for (let i = 0; i < NL; i++) { v1.copy(lightLocal[i]).applyMatrix4(BM[lights[i][0]]); lPos[i * 3] = v1.x; lPos[i * 3 + 1] = v1.y; lPos[i * 3 + 2] = v1.z; }
      lGeo.attributes.position.needsUpdate = true;
      const u = lMat.uniforms;
      u.uTime.value = tr; u.uNight.value = nightK;
      const cam = c.camera;
      u.uScale.value = c.renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360));
      u.uFogFar.value = c.scene.fog ? c.scene.fog.far : 600;
    }
    // soft ground shadows
    const sun = sky?.sunDir;
    // as dark as the world's own cast shadows, or it does not read as one
    const sa = 0.86 * clamp(day * 1.4 - 0.2, 0, 1);
    blob(0, air.biplane, air.biplane.heading, 7.2, 6.0, sa, sun, 0.5);
    v1.set(0, 0, 0).applyMatrix4(BM[B.banner + (K >> 1)]);
    p0.set(v1.x, v1.y, v1.z);
    const bh = Math.atan2(BM[B.banner].elements[12] - BM[B.banner + K - 1].elements[12], BM[B.banner].elements[14] - BM[B.banner + K - 1].elements[14]);
    blob(1, p0, bh, 1.9, BANNER_L * 0.92, sa * 0.8, sun, 0.5);
    blob(2, air.blimp, air.blimp.heading, 9.5, 27, sa * 0.9, sun, 0.5);
    for (let j = 0; j < 3; j++) blob(3 + j, air.paper[j], air.paper[j].heading, 2.9 * PS, 3.3 * PS, sa * 0.85, sun, 0.2);
    blobs.instanceMatrix.needsUpdate = true; aAlpha.needsUpdate = true;
    blobs.visible = sa > 0.002;

    // fly-overs: a hook for audio / ambient chatter (edge-triggered, no allocation while idle)
    const pl = c.systems.player?.position;
    if (pl) {
      const nb = Math.hypot(air.biplane.x - pl.x, air.biplane.z - pl.z) < 45;
      const nj = air.jet.active && Math.hypot(air.jet.x - pl.x, air.jet.z - pl.z) < 90;
      if (nb && !overB) flyover('biplane');
      if (nj && !overJ) flyover('jet');
      overB = nb; overJ = nj;
    }

    // map markers (the map updates a marker in place when the id repeats)
    markerT -= dt;
    if (markerT <= 0) {
      markerT = 0.25;
      const ui = c.systems.ui;
      for (let i = 0; i < drops.length; i++) {       // belt and braces: a taken sweet leaves the map
        const p = drops[i];
        if (p.taken && !p._mapGone) { p._mapGone = true; try { ui?.removeMapMarker?.(p.mapId || p.id); } catch { /* optional */ } }
      }
      if (typeof ui?.addMapMarker === 'function') {
        try {
          mkBiplane.x = air.biplane.x; mkBiplane.z = air.biplane.z; ui.addMapMarker(mkBiplane);
          mkBlimp.x = air.blimp.x; mkBlimp.z = air.blimp.z; ui.addMapMarker(mkBlimp);
        } catch { /* the map is optional */ }
      }
    }
  }

  // ── public API ───────────────────────────────────────────────────────────────
  Object.assign(api, {
    group, aircraft: air, drops, hold: false, routes: ROUTES,
    meshes: { body, decal, fx, lights: navPoints, blobs },
    update,
    debugTeleport(name, t = 0, hold = false, lane = null) {
      const at = Array.isArray(t) ? t : null;       // jet only: [x, z] = put it abeam of that point
      t = at ? 0 : ((Number(t) % 1) + 1) % 1;
      if (name === 'biplane') sB = t * bLoop.len - T * ROUTES.biplane.speed;
      else if (name === 'blimp') sM = t * mLoop.len - T * ROUTES.blimp.speed;
      else if (name === 'paper') { const w = ROUTES.paper.speed / ROUTES.paper.r; tP = t * TAU / w - T; }
      else if (name === 'jet') {
        const J = ROUTES.jet; const k = lane != null ? Math.max(0, Math.floor(lane)) : Math.max(0, Math.floor((T + jetOff) / J.period));
        if (at) { jetLaneFor(k); t = clamp(((at[0] - jetA.x) * jetDir.x + (at[1] - jetA.z) * jetDir.z) / jetLen, 0, 0.999); }
        jetOff = k * J.period + t * (2 * J.half) / J.speed - T;
      }
      if (hold) api.hold = true;
      update(0, ctx);
      return api.where(name);
    },
    setHold(v = true) { api.hold = !!v; },
    /** Several at once, for views: debugPose({ biplane: 0.76, blimp: 0.2, jet: 0.5, paper: 0.1 }, hold). */
    debugPose(map = {}, hold = true) {
      for (const [n, t] of Object.entries(map)) if (n !== 'jetLane') api.debugTeleport(n, t, false, n === 'jet' ? (map.jetLane ?? 1) : null);
      if (hold) api.hold = true;
      return map;
    },
    /** Screenshot helper: turn the game camera toward an aircraft and hold the
     *  same lens as holding L (elevation 0.15, fov 44, pitch 0.30). */
    debugLookUp(name = 'biplane', seconds = 30) {
      const cam = ctx.systems.camera, pl = ctx.systems.player?.position, a = api.where(name);
      if (!cam || !pl || !a) return null;
      const dx = a.x - pl.x, dz = a.z - pl.z, d = Math.hypot(dx, dz) || 1;
      const azimuth = Math.atan2(-dx / d, -dz / d);
      cam.setParams?.({ azimuth }); cam.snap?.();
      cam.cinematic?.({ azimuth, elevation: 0.15, fov: 44, pitch: 0.30, duration: seconds, in: 0.05, hold: seconds - 0.3, out: 0.25 });
      return { azimuth, dist: d };
    },
    /** Screenshot helper: park the free camera on an aircraft. rel = azimuth
     *  relative to its heading (π/2 = its port side, -π/2 starboard, 0 behind). */
    debugFrame(name = 'biplane', o = {}) {
      const cam = ctx.systems.camera, a = api.where(name);
      if (!cam?.setFree || !a) return null;
      const v = { target: [a.x + (o.dx || 0), a.y + (o.dy || 0), a.z + (o.dz || 0)], azimuth: o.az ?? (a.heading + (o.rel ?? Math.PI / 2)),
        elevation: o.el ?? 0.12, distance: o.dist ?? 40, fov: o.fov ?? 40 };
      cam.setFree(v);
      return v;
    },
    debugDrop(x, z, k = 0.5) {
      const y0 = world.height(x, z) + 48;
      startDrop(x - 6, y0, z - 4, x, z, 8, 5, clamp(k, 0, 0.98));
      flyDrop(0);
      return { x, z, y: BM[B.candy].elements[13] };
    },
    dropCandy() { dropClock = 0; return releaseFromBiplane(); },
    where(name) {
      if (name === 'shadow') {                      // the biplane's ground shadow (views)
        blobs.getMatrixAt(0, m2); const e = m2.elements;
        return { x: +e[12].toFixed(2), y: +e[13].toFixed(2), z: +e[14].toFixed(2), heading: air.biplane.heading, alpha: +aAlpha.array[0].toFixed(3) };
      }
      const a = name === 'paper' ? air.paper[0] : air[name];
      return a ? { x: +a.x.toFixed(2), y: +a.y.toFixed(2), z: +a.z.toFixed(2), heading: +a.heading.toFixed(3) } : null;
    },
    pathPoint(name, t) {
      const o = new THREE.Vector3();
      if (name === 'biplane') bLoop.at(t * bLoop.len, o); else if (name === 'blimp') mLoop.at(t * mLoop.len, o);
      else if (name === 'paper') { const w = ROUTES.paper.speed / ROUTES.paper.r; paperPos(t * TAU / w, 0, o); }
      return { x: o.x, y: o.y, z: o.z };
    },
    /** Minimum clearance of each route over terrain and the measured landmark tops. */
    clearance() {
      const out = {};
      const test = (name, sampler, n, foot) => {
        let min = Infinity, at = null;
        for (let i = 0; i < n; i++) {
          const p = sampler(i / n);
          let top = world.height(p.x, p.z);
          for (const o of OBSTACLE_TOPS) if (Math.hypot(p.x - o.x, p.z - o.z) < o.r + foot) top = Math.max(top, o.top);
          const cl = p.y - top;
          if (cl < min) { min = cl; at = { x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +p.y.toFixed(1), over: +top.toFixed(1) }; }
        }
        out[name] = { min: +min.toFixed(1), at };
      };
      test('biplane', (u) => api.pathPoint('biplane', u), 600, 4);
      test('blimp', (u) => api.pathPoint('blimp', u), 600, 13);
      test('jet', (u) => ({ x: -560 + 1120 * u, y: ROUTES.jet.alt - 4, z: 0 }), 400, 8);
      return out;
    },
    stats() {
      const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
      return { calls: [body, decal, fx, navPoints, blobs].filter((m) => m.visible).length, tris: Math.round(tris(bodyGeo) + tris(decalGeo) + fxIdx.length / 3 + NBLOB * 2), bones: nb };
    },
  });

  setBannerText(false); bannerNight = false;
  update(0, ctx);
  console.warn(`[planes] 4 aircraft · ${api.stats().tris} tris · ≤5 draw calls (body, decal, fx, lights, blobs) · ${nb} bones`);
  return api;
}
