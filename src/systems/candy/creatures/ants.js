// SPRINKLE-ANTS — red-licorice carriers working a loop between a dropped
// lollipop and the sugar anthill, along the licorice road into Gumdrop Village.
// Each ant walks OUT empty on one lane, turns at the lollipop, picks a sprinkle
// up in its jaws and carries it HOME on the other lane, climbs the anthill and
// drops into the hole — then comes out again. One of them has picked up a
// sprinkle far too big for it.
//
// WAVE 3 polish (critic: "a bead necklace of hexagon plates — no single ant can
// be picked out"). The old ant was a dark lump whose sprinkle-tinted abdomen
// read as a plate, packed nose-to-tail so the plates overlapped. Now:
//   · ONE ANT = three separate glossy red-licorice segments (gaster, thorax,
//     big head) with a visible waist and neck, WHITE EYES with pupils, thin
//     dark jointed legs that step in a tripod gait (vertex shader), antennae;
//   · the cargo is a sprinkle rod 60% of the ant's body length, held CROSSWISE
//     in the jaws like a dog with a stick — never lying over the body;
//   · 1.5 body lengths of clear road between ants: one shared lane speed and a
//     queue (no ant may close to within MIN_GAP of the one ahead), so they can
//     never bunch into a chain;
//   · the column PARTS round the visitor and round Sour Patch Kids — each ant
//     swings out on a smooth arc, picks the side that is clear of walls, and if
//     neither side is clear it waits and the ants behind it queue.
import * as THREE from 'three';
import { rng, hash } from '../../../core/util.js';
import { CANDY } from '../../../core/palette.js';
import { Pool, part, mergeParts, shadeAxis, uiSay, turnToward } from './common.js';
import { flowerBeds } from './flowers.js';

// Contract A body, in units of the ant's scale (scale 1 = a 1 u long ant):
// thorax circle at the pivot, a probe over the gaster behind and one over the
// head in front. A carrier's front probe is widened to cover the crosswise
// sprinkle in its jaws, so the cargo is kept out of walls as well.
export const ANT_BODY = { r: 0.17, probes: [[-0.3, 0.17], [0.3, 0.15]] };
const CARRY_BODY = { r: 0.17, probes: [[-0.3, 0.17], [0.44, 0.36]] };
const GAG_BODY = { r: 0.17, probes: [[-0.3, 0.17], [0.46, 0.6]] };
// How fast an ant that stepped round a prop drifts back onto its lane (1/s).
const REJOIN = 4.5;

// Anthill → dropped lollipop, hugging the shoulder of candy_main where it runs
// into Gumdrop Village. DERIVED from the path polyline, 2.25 u off centre. The
// west end stops at x −142.6: the lollipop used to lie under a village lamp
// post at −144.4 (the ants' turn was shoved 1.75 u off it by that post).
const TRAIL_X = [-121, -127, -133, -139, -142.6];
const SHOULDER = 2.25;
let _trail = null;
/** [[x,z] …] along the north shoulder of candy_main — memoised, needs `world`. */
export function antTrail(world) {
  if (_trail) return _trail;
  const main = Object.values(world.PATHS || {}).find((p) => p && p.id === 'candy_main');
  const pts = main && main.points;
  _trail = TRAIL_X.map((x) => {
    if (!pts) return [x, 42];
    let best = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      let t = L2 > 0 ? ((x - ax) * vx + (40 - az) * vz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = ax + vx * t, pz = az + vz * t;
      const d = Math.hypot(px - x, pz - 40);
      if (!best || d < best.d) best = { d, px, pz, vx, vz, L: Math.sqrt(L2) || 1 };
    }
    let nx = -best.vz / best.L, nz = best.vx / best.L;
    if (nz < 0) { nx = -nx; nz = -nz; }                    // always the north shoulder
    return [best.px + nx * SHOULDER, best.pz + nz * SHOULDER];
  });
  return _trail;
}
export const antHill = (world) => antTrail(world)[0];
export const antCrumbs = (world) => antTrail(world)[antTrail(world).length - 1];

// ── the ant: 1 u long along +z, feet at y = 0 ────────────────────────────────
// aTag: +1 eye white, −1 pupil (both forced AFTER the instance tint, so the
// eyes stay white whatever the ant's hue), ±2 = the two tripod leg groups the
// vertex shader swings in antiphase. 0 = body.
const RED_LO = 0x7a0f1d, RED_HI = 0xff5a48, LEG = 0x3a0d14;
function limb(a, b, r0, r1, color, tag) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
  const e = new THREE.Euler().setFromQuaternion(q);
  return part(new THREE.CylinderGeometry(r1, r0, L, 4, 1, true), {
    pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [e.x, e.y, e.z], color, tag,
  });
}
function antGeo() {
  const seg = (pos, scale, lo, hi, y0, y1) => shadeAxis(part(new THREE.SphereGeometry(1, 8, 5), { pos, scale }), 'y', y0, y1, lo, hi);
  const parts = [
    // gaster — the big glossy candy drop at the back
    seg([0, 0.25, -0.28], [0.17, 0.155, 0.22], RED_LO, RED_HI, 0.12, 0.40),
    // gloss streak on it (tag +1 → pure white after the tint)
    part(new THREE.SphereGeometry(1, 6, 3), { pos: [0.045, 0.385, -0.25], scale: [0.045, 0.02, 0.1], color: 0xffffff, tag: 1 }),
    // waist: a thin dark petiole, so gaster / thorax read as separate pieces
    part(new THREE.SphereGeometry(1, 5, 3), { pos: [0, 0.225, -0.05], scale: [0.04, 0.04, 0.05], color: LEG }),
    seg([0, 0.235, 0.06], [0.085, 0.08, 0.115], RED_LO, RED_HI, 0.16, 0.31),     // thorax
    part(new THREE.SphereGeometry(1, 5, 3), { pos: [0, 0.255, 0.165], scale: 0.035, color: LEG }),   // neck
    seg([0, 0.28, 0.285], [0.125, 0.115, 0.115], RED_LO, RED_HI, 0.17, 0.39),     // head
  ];
  for (const s of [-1, 1]) {
    // big white eyes with dark pupils, proud of the head so they catch the sun
    parts.push(part(new THREE.SphereGeometry(1, 6, 4), { pos: [s * 0.066, 0.33, 0.36], scale: 0.056, color: 0xffffff, tag: 1 }));
    parts.push(part(new THREE.SphereGeometry(1, 5, 3), { pos: [s * 0.072, 0.335, 0.408], scale: 0.029, color: 0x1a0a10, tag: -1 }));
    // mandibles (they hold the sprinkle)
    parts.push(part(new THREE.ConeGeometry(0.022, 0.1, 4), { pos: [s * 0.04, 0.215, 0.4], rot: [Math.PI / 2, 0, s * 0.3], color: LEG }));
    // antennae: elbowed, with a club on the end so the tip survives at 2 px
    parts.push(limb([s * 0.04, 0.37, 0.3], [s * 0.1, 0.5, 0.35], 0.014, 0.012, LEG));
    parts.push(limb([s * 0.1, 0.5, 0.35], [s * 0.14, 0.47, 0.47], 0.012, 0.01, LEG));
    parts.push(part(new THREE.SphereGeometry(1, 4, 3), { pos: [s * 0.142, 0.468, 0.478], scale: 0.026, color: LEG }));
    // six thin jointed legs, splayed so the feet sit outside the body outline
    const HIP = [0.12, 0.06, 0.0], KNEE = [0.07, 0, -0.07], FOOT = [0.17, 0, -0.18];
    for (let k = 0; k < 3; k++) {
      const tag = (k === 1 ? -s : s) * 2;          // tripod: L1 R2 L3 vs R1 L2 R3
      const hip = [s * 0.055, 0.2, HIP[k]], knee = [s * 0.2, 0.3, HIP[k] + KNEE[k]], foot = [s * 0.3, 0.0, HIP[k] + FOOT[k]];
      parts.push(limb(hip, knee, 0.021, 0.018, LEG, tag));
      parts.push(limb(knee, foot, 0.018, 0.011, LEG, tag));
      parts.push(part(new THREE.SphereGeometry(1, 4, 2), { pos: knee, scale: 0.022, color: LEG, tag }));
    }
  }
  return mergeParts(parts);
}
/** The sprinkle: a capsule 0.6 long (60% of the ant), lying along x (crosswise). */
function sprinkleGeo() {
  const g = part(new THREE.CapsuleGeometry(0.058, 0.484, 3, 8), { rot: [0, 0, Math.PI / 2], color: 0xffffff });
  return mergeParts([shadeAxis(g, 'y', -0.06, 0.06, 0xc9c0cc, 0xffffff)]);
}

// Red licorice: tag shading for the eyes + a tripod leg swing, driven by a
// per-instance gait phase the CPU advances by distance walked (so a queued ant
// stands still instead of moonwalking).
function antMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aTag;
attribute float aGait;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
#if defined( USE_COLOR )
	vColor = mix( vColor, vec3( 1.0, 0.99, 0.96 ), step( 0.5, aTag ) * step( aTag, 1.5 ) );
	vColor = mix( vColor, vec3( 0.07, 0.03, 0.05 ), step( 0.5, -aTag ) * step( -aTag, 1.5 ) );
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float antLeg = step( 1.5, aTag ) - step( 1.5, -aTag );
float antW = clamp( 1.0 - transformed.y / 0.22, 0.0, 1.0 ) * abs( antLeg );
transformed.z += sin( aGait ) * antLeg * 0.075 * antW;
transformed.y += max( 0.0, cos( aGait ) * antLeg ) * 0.045 * antW;`);
  };
  mat.customProgramCacheKey = () => 'candy-ant-v2';
  return mat;
}

export function create(env) {
  const { ctx, world, scene, shadowField, ground } = env;
  const r = rng(hash('candy-ants'));

  // ── arc-length table with baked ground heights ─────────────────────────────
  const TRAIL = antTrail(world);
  const HILL = TRAIL[0], CRUMBS = TRAIL[TRAIL.length - 1];
  const samples = [];
  let total = 0;
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const [ax, az] = TRAIL[i], [bx, bz] = TRAIL[i + 1];
    const seg = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(2, Math.ceil(seg / 0.6));
    for (let k = 0; k < steps; k++) {
      const u = k / steps;
      const x = ax + (bx - ax) * u, z = az + (bz - az) * u;
      samples.push({ x, z, y: world.height(x, z), s: total + seg * u, dir: Math.atan2(bx - ax, bz - az), sh: 0 });
    }
    total += seg;
  }
  const last = TRAIL[TRAIL.length - 1];
  samples.push({ x: last[0], z: last[1], y: world.height(last[0], last[1]), s: total, dir: samples[samples.length - 1].dir, sh: 0 });
  const LEN = total;
  /** Trail point at arc length s (clamped to the trail) → { x, z, y (terrain), dir, sh (detour shift), dsh }. */
  function at(s, out) {
    out = out || {};
    s = s < 0 ? 0 : s > LEN ? LEN : s;
    let i = Math.min(samples.length - 2, Math.floor(s / LEN * (samples.length - 1)));
    while (i > 0 && samples[i].s > s) i--;
    while (i < samples.length - 2 && samples[i + 1].s < s) i++;
    const a = samples[i], b = samples[i + 1];
    const u = (s - a.s) / Math.max(1e-4, b.s - a.s);
    out.x = a.x + (b.x - a.x) * u; out.z = a.z + (b.z - a.z) * u; out.y = a.y + (b.y - a.y) * u; out.dir = a.dir;
    out.sh = a.sh + (b.sh - a.sh) * u; out.dsh = (b.sh - a.sh) / Math.max(1e-4, b.s - a.s);
    return out;
  }
  const _p = { x: 0, z: 0, y: 0, dir: 0, sh: 0, dsh: 0 };

  // ── the loop: a racetrack of two lanes RL either side of the trail ─────────
  // Outbound on the +RL lane from the anthill to the lollipop, a half-circle
  // turn at the lollipop (where the sprinkle is picked up), home on the −RL
  // lane, a half-circle turn over the top of the anthill (where it is dropped
  // down the hole). No ant ever teleports.
  const RL = 0.66;
  const S_A = 0.65;                 // hill turn centre: the turn's tip is in the hole
  const S_B = LEN - 1.35 - RL;      // lollipop turn centre: the tip stops at the lollipop's edge
  const LS = S_B - S_A, ARC = Math.PI * RL, LOOP = 2 * LS + 2 * ARC;
  /** Loop position u → { s, lat, carry (0..1) } */
  const _lp = { s: 0, lat: 0, carry: 0 };
  const sstep = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
  function loopAt(u, out) {
    u = ((u % LOOP) + LOOP) % LOOP;
    if (u < LS) { out.s = S_A + u; out.lat = RL; out.carry = 0; }
    else if (u < LS + ARC) { const th = (u - LS) / RL; out.s = S_B + RL * Math.sin(th); out.lat = RL * Math.cos(th); out.carry = sstep(0.35, 0.65, th / Math.PI); }
    else if (u < 2 * LS + ARC) { out.s = S_B - (u - LS - ARC); out.lat = -RL; out.carry = 1; }
    else { const th = (u - 2 * LS - ARC) / RL; out.s = S_A - RL * Math.sin(th); out.lat = -RL * Math.cos(th); out.carry = 1 - sstep(0.2, 0.5, th / Math.PI); }
    return out;
  }
  /** Half-width of the racetrack at arc length s (0 beyond the turn tips). */
  const halfW = (s) => {
    if (s >= S_A && s <= S_B) return RL;
    const d = s > S_B ? (s - S_B) / RL : (S_A - s) / RL;
    return d >= 1 ? -1 : RL * Math.sqrt(1 - d * d);
  };

  // ── Contract A: the column detours round solids ────────────────────────────
  // The shoulder this trail is derived from is not empty: Gumdrop Village's
  // south walls run a metre off it, a rope fence crosses it and a signpost
  // stands on it. Once the player's ground core is live (and again whenever the
  // collider list changes), the trail picks a sideways SHIFT per sample so both
  // lanes' bodies are clear of every solid and on dry land — chosen for the
  // whole trail at once (a small Viterbi pass: cost = distance off the shoulder
  // + swerve, never more than MAX_STEP between neighbours), so the column bends
  // round a signpost as ONE smooth line. Standing on a LOW prop is allowed but
  // costs extra, so the column goes round a bench rather than over its seat
  // (a crosswise sprinkle carried over a bench cut through the backrest).
  const SHIFTS = [];
  for (let k = -16; k <= 10; k++) SHIFTS.push(k * 0.25);          // −4 … +2.5 (south = −, onto the road)
  const NS = SHIFTS.length, MAX_STEP = 0.5, BAKE_SC = 1.24, CLEAR_PAD = 0.1, LOW_COST = 6;
  let bakedN = -1, bakedAt = -1e9;
  const riverHalf = (world.RIVER?.width ?? 0) * 0.5;
  // The butterflies' flower beds are decor with no collider, but an ant
  // wading through blossom stems reads as clipping just the same: the bake
  // steers round every stem unless there is truly no other way.
  const STEM_R = 0.3, STEM_COST = 400;
  let stems = null;
  function stemsNear() {
    if (stems) return stems;
    stems = [];
    for (const b of flowerBeds(world)) for (const f of b.flowers) {
      if (f.x > bx0 - 2 && f.x < bx1 + 2 && f.z > bz0 - 2 && f.z < bz1 + 2) stems.push(f.x, f.z, f.px, f.pz);
    }
    return stems;
  }
  // 0 = clear, LOW_COST = on a low prop, STEM_COST = in a flower bed, Infinity = blocked
  function laneCost(p, nx, nz, off, yaw, body) {
    const x = p.x + nx * off, z = p.z + nz * off;
    const fs = Math.sin(yaw), fc = Math.cos(yaw);
    const S = stemsNear();
    let cost = 0;
    for (let k = -1; k < body.probes.length; k++) {
      const o = k < 0 ? 0 : body.probes[k][0] * BAKE_SC;
      const rr = (k < 0 ? body.r : body.probes[k][1]) * BAKE_SC + CLEAR_PAD;
      const cx = x + fs * o, cz = z + fc * o;
      const q = ground.push(cx, cz, rr, cx, cz);
      if (q.hit && Math.abs(q.x - cx) + Math.abs(q.z - cz) > 1e-3) return Infinity;
      if (!cost) for (let j = 0; j < S.length; j += 4) {
        const m = rr + STEM_R;
        if (Math.hypot(cx - S[j], cz - S[j + 1]) < m || Math.hypot(cx - S[j + 2], cz - S[j + 3]) < m) { cost = STEM_COST; break; }
      }
    }
    if (world.height(x, z) < 0.9) return Infinity;
    if (world.riverDist(x, z) < riverHalf + 0.4) return Infinity;
    return cost + (ground.info(x, z).prop ? LOW_COST : 0);
  }
  const sampleCost = (p, c) => {
    const w = halfW(p.s);
    if (w < 0) return 0;                                  // beyond the turn tips: no ants here
    const nx = Math.cos(p.dir), nz = -Math.sin(p.dir);
    return laneCost(p, nx, nz, c + w, p.dir, ANT_BODY) + (w > 0.05 ? laneCost(p, nx, nz, c - w, p.dir + Math.PI, CARRY_BODY) : 0);
  };
  function bake() {
    const t0 = performance.now();
    const n = samples.length;
    const cost = new Float64Array(n * NS), from = new Int16Array(n * NS);
    let unsolved = 0, blocked = 0, onLow = 0, inBeds = 0;
    const lowAt = new Uint8Array(n * NS);
    for (let i = 0; i < n; i++) {
      let any = false;
      for (let k = 0; k < NS; k++) {
        const c0 = sampleCost(samples[i], SHIFTS[k]);
        const ok = c0 < 1e4;
        if (ok) any = true;
        if (ok && c0 > 0) lowAt[i * NS + k] = c0 >= STEM_COST ? 2 : 1;
        // the ends are pinned to the anthill and the lollipop: leaving them is expensive
        const own = (ok ? c0 : 1e4) + Math.abs(SHIFTS[k]) * (i === 0 || i === n - 1 ? 25 : 1);
        if (i === 0) { cost[k] = own; from[k] = -1; continue; }
        let best = Infinity, bj = -1;
        for (let j = 0; j < NS; j++) {
          const d = Math.abs(SHIFTS[k] - SHIFTS[j]);
          if (d > MAX_STEP + 1e-6) continue;
          const c = cost[(i - 1) * NS + j] + d * 2.0;
          if (c < best) { best = c; bj = j; }
        }
        cost[i * NS + k] = best + own; from[i * NS + k] = bj;
      }
      if (!any) unsolved++;
    }
    let k = 0;
    for (let j = 1; j < NS; j++) if (cost[(n - 1) * NS + j] < cost[(n - 1) * NS + k]) k = j;
    for (let i = n - 1; i >= 0; i--) {
      samples[i].sh = SHIFTS[k]; if (SHIFTS[k]) blocked++; if (lowAt[i * NS + k] === 1) onLow++; if (lowAt[i * NS + k] === 2) inBeds++;
      k = from[i * NS + k]; if (k < 0) k = 0;
    }
    bakeStats.blocked = blocked; bakeStats.unsolved = unsolved; bakeStats.onLowProp = onLow; bakeStats.inFlowerBed = inBeds; bakeStats.bakes++;
    bakeStats.maxShift = +samples.reduce((a, q) => Math.max(a, Math.abs(q.sh)), 0).toFixed(2);
    bakeStats.ms = +(performance.now() - t0).toFixed(1);
  }
  const bakeStats = { bakes: 0, blocked: 0, unsolved: 0, onLowProp: 0, maxShift: 0, ms: 0 };

  // ── the column ─────────────────────────────────────────────────────────────
  // Body length ≈ 1.15 u (scale 1.08–1.22: knee-high to the visitor, big
  // enough to pick out one ant at the game camera), 1.5 body lengths of road
  // between ants: SPACING ≈ 2.9 u along the loop. One lane speed for everyone
  // (different speeds are what bunched the old column into a chain) and a
  // queue: nobody closes to within MIN_GAP of the ant ahead.
  const N = Math.max(10, Math.floor(LOOP / 2.9));
  const SPACING = LOOP / N, MIN_GAP = 1.8, SPEED = 0.9;
  const GAG = 5;
  const antMat = antMaterial();
  const crumbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0 });
  const ants = new Pool(scene, antGeo(), antMat, N, { name: 'sprinkle-ants', cast: false, attrs: { aGait: 1 } });
  const crumbs = new Pool(scene, sprinkleGeo(), crumbMat, N, { name: 'ant-crumbs', cast: false });
  const aGait = ants.attr('aGait').array;
  // hue drift inside red licorice → cinnamon (instanceColor can only darken)
  const TINTS = [0xffffff, 0xfff0dc, 0xffe4e0, 0xfff6ee];
  // sprinkles: bright candy hues that sit well against red — never the ant's own red
  const SPRINKLE = [0xfff4f8, 0x3aa8ff, 0xffe23a, 0x5be27a, 0xb35bff, 0xff9ec4];

  const column = [];
  for (let i = 0; i < N; i++) {
    const sc = 1.08 + r() * 0.14;
    column.push({
      u: i * SPACING, du: 0, sc, scale: sc, ph: r() * 6.283, gait: r() * 6.283,
      x: 0, y: 0, z: 0, px: 0, pz: 0, ox: 0, oz: 0, head: 0, dside: 0, dk: 0, laneSide: 1, carry: 0, hold: 0,
      gag: i === GAG, kind: 'ant', init: false,
    });
    ants.tint(i, TINTS[i % TINTS.length]);
    crumbs.tint(i, SPRINKLE[(i * 5) % SPRINKLE.length]);
  }
  ants.flushColors(); crumbs.flushColors();
  const shade = shadowField.claim(N);

  // ── dynamic obstacles: the visitor + Sour Patch Kids near the trail ────────
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (const q of samples) { bx0 = Math.min(bx0, q.x); bx1 = Math.max(bx1, q.x); bz0 = Math.min(bz0, q.z); bz1 = Math.max(bz1, q.z); }
  bx0 -= 6; bx1 += 6; bz0 -= 6; bz1 += 6;
  const OBS_MAX = 12, obs = new Float64Array(OBS_MAX * 3);
  let nObs = 0;
  const nearTrail = (x, z) => x > bx0 && x < bx1 && z > bz0 && z < bz1;
  function gather(ctx) {
    nObs = 0;
    const pl = ctx.systems.player, pp = pl?.position;
    if (pp && !pl.onVehicle && nearTrail(pp.x, pp.z)) {
      obs[0] = pp.x; obs[1] = pp.z; obs[2] = (typeof pl.radius === 'number' ? pl.radius : 0.36) + 0.4; nObs = 1;   // + arms, hands and a margin
    }
    const kids = ctx.systems.sourPatch?.kids;
    if (Array.isArray(kids)) {
      for (let i = 0; i < kids.length && nObs < OBS_MAX; i++) {
        const k = kids[i];
        if (!k || typeof k.x !== 'number' || !(k.vis > 0.4) || !nearTrail(k.x, k.z)) continue;
        obs[nObs * 3] = k.x; obs[nObs * 3 + 1] = k.z; obs[nObs * 3 + 2] = (typeof k.r === 'number' ? k.r : 0.5) + 0.12; nObs++;
      }
    }
  }
  const _d = { x: 0, z: 0 };
  // Swing the target (gx,gz) out round every obstacle: full clearance while
  // the ant's body is alongside it, eased in/out over RAMP before and after, so
  // the ant arcs round instead of jumping. Returns 0 clear, 1 dodged, 2 blocked
  // (both sides run into a wall / water / too far off the road).
  const RAMP = 1.1;
  // An ant already swung out round the visitor or a kid has right of way: the
  // oncoming lane treats it as one more obstacle (listed once per frame from
  // last frame's positions), so the two lanes never walk through each other.
  const yielders = new Int16Array(64); let nYield = 0;
  function dodgeWith(a, gx, gz, tx, tz, nx, nz, side) {
    let x = gx, z = gz, any = 0;
    const sc = a.sc;
    for (let jj = 0; jj < nObs + nYield; jj++) {
      let ox, oz, orad;
      if (jj < nObs) { ox = obs[jj * 3]; oz = obs[jj * 3 + 1]; orad = obs[jj * 3 + 2]; }
      else {
        const b = column[yielders[jj - nObs]];
        if (b === a || b.laneSide === a.laneSide) continue;
        ox = b.x; oz = b.z; orad = (b.carry > 0.3 ? (b.gag ? 0.62 : 0.36) : 0.22) * b.sc;
      }
      const rx = x - ox, rz = z - oz;
      const along = Math.abs(rx * tx + rz * tz), lat = rx * nx + rz * nz;
      const core = orad + 0.55 * sc;
      if (along > core + RAMP) continue;
      const wide = orad + (a.carry > 0.3 ? (a.gag ? 0.62 : 0.36) : 0.22) * sc;
      const need = along <= core ? wide : wide * sstep(0, 1, 1 - (along - core) / RAMP);
      if (Math.abs(lat) >= need) continue;
      any |= jj < nObs ? 1 : 2;
      const nl = side * need;
      x += nx * (nl - lat); z += nz * (nl - lat);
    }
    _d.x = x; _d.z = z;
    return any;
  }
  // would a body of radius rr at (cx,cz) stand in a flower bed's stems?
  function inStems(cx, cz, rr) {
    const S = stemsNear(), m = rr + STEM_R;
    for (let j = 0; j < S.length; j += 4) if (Math.hypot(cx - S[j], cz - S[j + 1]) < m || Math.hypot(cx - S[j + 2], cz - S[j + 3]) < m) return true;
    return false;
  }
  // would (cx,cz) put ant a on top of an ant in the other lane?
  function clash(a, cx, cz) {
    for (let j = 0; j < N; j++) {
      const b = column[j];
      if (b === a || b.laneSide === a.laneSide) continue;
      const dx = b.x - cx, dz = b.z - cz, min = 0.78 * (a.sc + b.sc) * 0.5 + (b.carry > 0.3 || a.carry > 0.3 ? 0.18 : 0);
      if (dx * dx + dz * dz < min * min) return true;
    }
    return false;
  }
  function dodge(a, gx, gz, tx, tz, nx, nz, lx, lz) {
    // pick the side: remembered, else the side the ant already is on, else its lane's
    let side = a.dside;
    if (!side) {
      let best = 0, bd = Infinity;
      for (let j = 0; j < nObs; j++) {
        const d = Math.hypot(gx - obs[j * 3], gz - obs[j * 3 + 1]);
        if (d < bd) { bd = d; best = j; }
      }
      const lat = nObs ? (gx - obs[best * 3]) * nx + (gz - obs[best * 3 + 1]) * nz : 0;
      side = Math.abs(lat) > 0.12 ? Math.sign(lat) : a.laneSide;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const got = dodgeWith(a, gx, gz, tx, tz, nx, nz, side);
      a.dk = got & 1;
      if (!got) { a.dside = 0; return 0; }
      const cx = _d.x, cz = _d.z;
      const far = Math.hypot(cx - lx, cz - lz) > 2.6 || clash(a, cx, cz);
      const q = far ? null : ground.push(cx, cz, 0.2 * a.sc, cx, cz);
      const wall = far || (q.hit && Math.abs(q.x - cx) + Math.abs(q.z - cz) > 0.05) || world.height(cx, cz) < 0.9 || inStems(cx, cz, 0.22 * a.sc);
      if (!wall) { a.dside = side; _d.x = cx; _d.z = cz; return 1; }
      side = -side;
    }
    return 2;
  }

  // one step of placement for ant a at loop position u → writes a.x/a.z/a.y
  const _t = { x: 0, z: 0 };
  function target(a, u, out) {
    const lp = loopAt(u, _lp);
    const p = at(lp.s, _p);
    const nx = Math.cos(p.dir), nz = -Math.sin(p.dir);
    const off = lp.lat + p.sh;
    out.lx = p.x + nx * off; out.lz = p.z + nz * off;
    out.nx = nx; out.nz = nz; out.tx = Math.sin(p.dir); out.tz = Math.cos(p.dir);
    out.lat = lp.lat; out.carry = lp.carry;
    return out;
  }
  const _g = { lx: 0, lz: 0, nx: 0, nz: 0, tx: 0, tz: 0, lat: 0, carry: 0 };

  // start every ant ON its lane so debugPositions is sane before the first
  // Contract-A step; update() takes over from there
  for (const a of column) {
    const g = target(a, a.u, _g);
    a.x = a.px = g.lx; a.z = a.pz = g.lz; a.y = world.height(a.x, a.z);
    a.carry = g.carry; a.laneSide = g.lat >= 0 ? 1 : -1;
    a.head = g.lat >= 0 ? Math.atan2(g.tx, g.tz) : Math.atan2(-g.tx, -g.tz);
    a.r = ANT_BODY.r * a.sc; a.yaw = a.head; a.body = ANT_BODY; a.init = true;
  }

  ctx.events.on('world:ready', () => {
    ctx.systems.interaction?.register({
      id: 'ant_highway', x: (HILL[0] + CRUMBS[0]) / 2, z: (HILL[1] + CRUMBS[1]) / 2, r: 3.2,
      label: 'Study the sprinkle-ant highway',
      onInteract() {
        uiSay(ctx, 'Two lanes. Out empty, home with a sprinkle. One of them has picked up far too much sprinkle and will not discuss it.',
          { speaker: 'Sprinkle-Ant Highway 1', duration: 5 });
        ctx.systems.story?.set('saw_ant_highway', true);
      },
    });
  });

  const HILL_R = 1.25, HILL_H = 0.85, HILL_SLOPE = HILL_H / HILL_R;
  const counters = { dodging: 0, waiting: 0, blocked: 0 };
  return {
    name: 'ants', trailLength: LEN, loopLength: LOOP, spacing: SPACING, at, loopAt, column, bakeStats, samples, counters,
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      const night = 1 - (ctx.state.daylight ?? 1);
      const rejoin = Math.exp(-REJOIN * dt);
      const nCol = ctx.colliders ? ctx.colliders.length : 0;
      if (ground.live && nCol !== bakedN && t - bakedAt > 2) { bakedN = nCol; bakedAt = t; bake(); }
      gather(ctx);
      nYield = 0;
      for (let i = 0; i < N && nYield < yielders.length; i++) if (column[i].dk) yielders[nYield++] = i;
      const v = SPEED * (1 - night * 0.45) * dt;
      // 1) the queue: how far each ant may move this frame (last frame's gaps)
      for (let i = 0; i < N; i++) {
        const a = column[i], ahead = column[(i + 1) % N];
        let gap = ahead.u - a.u; if (gap <= 0) gap += LOOP;
        const f = gap <= MIN_GAP ? 0 : Math.min(1.3, (gap - MIN_GAP) / (SPACING - MIN_GAP));
        a.du = v * f;
      }
      counters.dodging = 0; counters.waiting = 0;
      for (let i = 0; i < N; i++) {
        const a = column[i];
        // 2) try the step; if the dodge is blocked both ways, wait where it is
        let u = a.u + a.du;
        let g = target(a, u, _g);
        let gx = g.lx + a.ox, gz = g.lz + a.oz;
        let res = nObs + nYield ? dodge(a, gx, gz, g.tx, g.tz, g.nx, g.nz, g.lx, g.lz) : (a.dside = 0, a.dk = 0, 0);
        if (res === 2 && a.du > 0) {
          counters.blocked++;
          u = a.u; g = target(a, u, _g); gx = g.lx + a.ox; gz = g.lz + a.oz;
          res = dodge(a, gx, gz, g.tx, g.tz, g.nx, g.nz, g.lx, g.lz);
        }
        if (u === a.u && a.du > 0) counters.waiting++;
        if (res === 1) { gx = _d.x; gz = _d.z; counters.dodging++; }
        a.u = u >= LOOP ? u - LOOP : u;
        a.carry = g.carry; a.laneSide = g.lat >= 0 ? 1 : -1;
        // 3) Contract A, every frame: solids push the body clear (remembered as
        // ox/oz so it flows round ONE side of a post, then drifts back onto its
        // lane); low props are walked over — y is the prop top.
        if (!a.init) { a.x = gx; a.z = gz; a.init = true; }
        const body = a.carry > 0.3 ? (a.gag ? GAG_BODY : CARRY_BODY) : ANT_BODY;
        ground.step(a, gx, gz, a.head, a.sc, body, Infinity);
        a.ox = (a.x - g.lx) * rejoin; a.oz = (a.z - g.lz) * rejoin;
        // heading follows where it actually went (arcs round a dodge, U-turns at the ends)
        const mx = a.x - a.px, mz = a.z - a.pz, moved = Math.hypot(mx, mz);
        if (moved > 0.15 * SPEED * dt) a.head = turnToward(a.head, Math.atan2(mx, mz), Math.min(1, dt * 7) * Math.PI);
        a.px = a.x; a.pz = a.z;
        a.gait += moved / (0.13 * a.sc) * Math.PI;
        aGait[i] = a.gait;

        // up the anthill and down the hole
        let y = a.y, pitch = 0;
        const hx = a.x - HILL[0], hz = a.z - HILL[1], hd = Math.hypot(hx, hz);
        if (hd < HILL_R) {
          y += HILL_H * (1 - hd / HILL_R) - (hd < 0.4 ? (0.4 - hd) / 0.4 * 0.62 : 0);
          const dot = hd > 1e-3 ? (Math.sin(a.head) * hx + Math.cos(a.head) * hz) / hd : 0;
          pitch = Math.atan(HILL_SLOPE * dot);
        }
        const sc = a.sc;
        const bob = Math.abs(Math.sin(a.gait)) * 0.012 * sc;
        const yaw = a.head + Math.sin(t * 5 + a.ph) * 0.05;
        const roll = Math.sin(a.gait) * 0.045 + (a.gag ? Math.sin(t * 3.1 + a.ph) * 0.08 : 0);
        ants.place(i, a.x, y + 0.01 + bob, a.z, yaw, sc, sc, sc, pitch, roll);
        // the sprinkle, crosswise in the jaws — picked up at the lollipop, dropped at the hole
        if (a.carry > 0.02) {
          const k = a.carry * sc;
          const fwd = 0.45 * sc, lift = (a.gag ? 0.3 : 0.23) * sc;
          const cx = a.x + Math.sin(yaw) * fwd * Math.cos(pitch), cz = a.z + Math.cos(yaw) * fwd * Math.cos(pitch);
          const cy = y + lift + bob * 1.5 - Math.sin(pitch) * fwd;
          const len = a.gag ? 1.9 : 1, fat = a.gag ? 1.75 : 1;
          crumbs.place(i, cx, cy, cz, yaw, k * len, k * fat, k * fat, pitch, roll * 1.4);
        } else crumbs.hide(i);
        shade.set(i, a.x, y - (hd < HILL_R ? 0.05 : 0), a.z, 0.4 * sc, 0, yaw);
      }
      ants.attr('aGait').needsUpdate = true;
      ants.flush(); crumbs.flush();
    },
  };
}
