// ── Everything the containment system nails to the ground on Cat Island ──────
// All of it merges into one vertex-coloured mesh + one atlas-signed mesh + one
// emissive night-glow mesh. Coordinates are world coordinates; y is sampled from
// world.height() so nothing floats.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hash } from '../../../core/util.js';
import { CAT } from '../../../core/palette.js';
import { paint, place } from './catmesh.js';
import { Builder, SignAtlas, panel, txt, fit, pawprint, figure, bigArrow, crossOut, F } from './props.js';

export const SPOTS = {
  // The Ferry Office sits just up the arrivals road from the pier (the pier plaza
  // itself belongs to the ferry system). Office and board are placed side by side
  // on the camera's perpendicular axis so neither ever hides the other.
  office:      { x: 57.6, z: 15.0 },
  window:      { x: 59.05, z: 16.45 },  // ticket window faces SE, at the arrivals road
  board:       { x: 63.6, z: 14.3 },
  tower:       { x: 40.5, z: 33.5 },
  // the roadside strip along the arrivals road: notice board, shop window, bus stop.
  // All sit just inside the path margin, where vegetation is excluded.
  posters:     { x: 84.6, z: 11.0 },
  shop:        { x: 94.4, z: 5.2 },
  busStop:     { x: 105.0, z: 1.0 },
  square:      { x: 152.0, z: 6.0 },
  guestNook:   { x: 204.0, z: 42.5 },   // east edge of Whisker Heights, on the lighthouse road
  bed:         { x: 204.6, z: 43.9 },
  smoothie:    { x: 206.0, z: -34.0 },
  tunnel:      { x: 209.5, z: -37.5 },
  // the boom gate stands back up the gym road: catArchitecture's fourteen-sign
  // forest owns the beach at (230,−6) and does not need our help
  beachGate:   { x: 214.0, z: -17.0, ry: 0 },
  loungers:    { x: 259.5, z: -17.0 },
  rowboat:     { x: 240.0, z: -13.0 },
  winch:       { x: 249.0, z: -9.0 },
  raftA:       { x: 258.0, z: -8.0 },
  cove:        { x: 251.0, z: -29.0 },
  raftB:       { x: 255.0, z: -33.0 },
  crates:      { x: 102.0, z: 60.0 },
  // the square's south-east quadrant was 25% empty paving; this cluster fills it
  kiosk:       { x: 160.5, z: 8.0 },
};

const SE = Math.PI * 0.25;          // house rule: signs face south-east → readable at the default camera azimuth
const NW = SE - Math.PI;

const ISLE = { x: 150, z: 0 };                 // Cat Island centre (world.ISLANDS.cat)

/**
 * Distance from (x,z) to the nearest prop any builder has already claimed.
 * `extra` carries this system's own placement-time reservations, so containment
 * props also spread out from each other without becoming player colliders.
 */
function clearance(ctx, x, z, extra = null) {
  let m = 99;
  for (const c of (ctx.colliders || [])) { const d = Math.hypot(x - c.x, z - c.z) - c.r; if (d < m) m = d; }
  if (extra) for (const c of extra) { const d = Math.hypot(x - c.x, z - c.z) - c.r; if (d < m) m = d; }
  return m;
}

/** Unit vector pointing away from the island centre (i.e. towards the sea). */
function seaward(x, z) {
  const dx = x - ISLE.x, dz = z - ISLE.z, d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
}

/** Slide a spot along its seaward ray until the ground sits at the waterline. */
function toWaterline(world, x, z, span = 16, target = 0.0) {
  const s = seaward(x, z);
  let best = { x, z, e: Math.abs(world.height(x, z) - target) };
  for (let k = -span; k <= span; k += 0.25) {
    const nx = x + s.x * k, nz = z + s.z * k;
    const e = Math.abs(world.height(nx, nz) - target);
    if (e < best.e) best = { x: nx, z: nz, e };
  }
  return best;
}

/**
 * Spiral search for the spot near (cx,cz) with the most room left over after
 * every prop already registered by another builder. Constraints keep a prop in
 * the terrain band its gag needs (beach / dry land / off the road / on the road).
 *   o = { rMax, step, need, hMin, hMax, slopeMax, pathMin, pathMax, pull, also }
 * `also` = [{dx,dz,need,hMin}] — attached props (a tunnel mouth, a parasol) that
 * must clear too, measured in the anchor's frame.
 */
function bestSpot(ctx, claims, cx, cz, o = {}) {
  const W = ctx.world;
  const need = o.need ?? 3, rMax = o.rMax ?? 12, step = o.step ?? 0.8;
  const hMin = o.hMin ?? 1.6, hMax = o.hMax ?? 99, slopeMax = o.slopeMax ?? 0.3;
  const pathMin = o.pathMin ?? 0, pathMax = o.pathMax ?? 1e4, pull = o.pull ?? 0.2;
  let best = null;
  for (let r = 0; r <= rMax + 1e-6; r += step) {
    const n = r < 0.05 ? 1 : Math.max(10, Math.round(r * 2.6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r * 0.43;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const h = W.height(x, z);
      if (h < hMin || h > hMax || W.slope(x, z) > slopeMax) continue;
      const pd = W.nearestPath(x, z, 'cat').d;
      if (pd < pathMin || pd > pathMax) continue;
      if (o.reject && o.reject(x, z)) continue;
      if (!o.mayBlockSigns && blocksSign(x, z)) continue;
      // maximise the WORST headroom across the whole cluster, capped so a spot
      // with acres of room doesn't beat a fine one that is nearer the author's
      let head = Math.min(clearance(ctx, x, z, claims) - need, 2.5), ok = true;
      for (const b of (o.also || [])) {
        const ax = x + b.dx, az = z + b.dz;
        if (W.height(ax, az) < (b.hMin ?? hMin)) { ok = false; break; }
        head = Math.min(head, Math.min(clearance(ctx, ax, az, claims) - (b.need ?? need), 2.5));
      }
      if (!ok) continue;
      const score = head * 2 - r * pull;
      if (!best || score > best.score) best = { x, z, head, score, r };
    }
  }
  return best;
}

/**
 * Move SPOTS[key] — and everything in `follow`, rigidly — to the best nearby
 * spot, then reserve the cluster's footprint so the rest of this build spreads
 * out from it. Returns a log row so the console shows what moved and why.
 */
function relocate(ctx, claims, key, follow, o = {}) {
  const p = SPOTS[key], need = o.need ?? 3;
  const was = { x: p.x, z: p.z };
  const before = clearance(ctx, p.x, p.z, claims);
  // bestSpot always evaluates r = 0 first, and the distance penalty means a
  // farther spot only wins when it is genuinely roomier — including for the
  // `also` props hanging off the anchor, which `before` cannot see. So whatever
  // comes back is >= staying put; no separate accept test is needed.
  const s = bestSpot(ctx, claims, p.x, p.z, o);
  if (s) {
    const dx = s.x - p.x, dz = s.z - p.z;
    p.x = +s.x.toFixed(2); p.z = +s.z.toFixed(2);
    for (const f of (follow || [])) { SPOTS[f].x = +(SPOTS[f].x + dx).toFixed(2); SPOTS[f].z = +(SPOTS[f].z + dz).toFixed(2); }
  }
  claims.push({ x: p.x, z: p.z, r: need });
  for (const b of (o.also || [])) claims.push({ x: p.x + b.dx, z: p.z + b.dz, r: b.need ?? 2 });
  return {
    key, at: [p.x, p.z], need, hard: o.hard ?? need,
    clear: s ? +(s.head + need).toFixed(2) : +before.toFixed(2),
    was: +before.toFixed(2),
    moved: +Math.hypot(p.x - was.x, p.z - was.z).toFixed(2),
    stuck: !s,
  };
}

/**
 * Purrliament Square's monument (152, 12.8) is the plaza's hero shot, and the
 * default camera sits up and to the +x/+z side of whatever it is looking at
 * (camera.js: forward = (−sin az, −cos az), az = π/4). Anything standing on that
 * line between the viewer and the monument steals the shot, so the exit signs
 * treat the corridor as solid.
 */
const MONUMENT = { x: 152, z: 12.8 };
const VIEW_DIR = { x: Math.SQRT1_2, z: Math.SQRT1_2 };   // monument → camera
export function blocksMonument(x, z) {
  const t = (x - MONUMENT.x) * VIEW_DIR.x + (z - MONUMENT.z) * VIEW_DIR.z;
  if (t < -1.5 || t > 30) return false;                  // behind it, or past the camera
  const px = MONUMENT.x + VIEW_DIR.x * t, pz = MONUMENT.z + VIEW_DIR.z * t;
  return Math.hypot(x - px, z - pz) < 3.6;
}

/**
 * SIGN-FACE KEEP-OUT. A sign you cannot read is not a sign, so nothing this
 * system plants — post, bollard, planter, lamp, kiosk — may stand in the 2.5 u
 * of air in front of a sign FACE. Faces are registered as they are finalised
 * during the placement pass (ours) or declared by hand (the arrivals signs,
 * which belong to catArchitecture and register no footprint of their own).
 * The normal points the way the sign is read FROM.
 */
const SIGN_FACES = [];
export function addSignFace(x, z, ry, reach = 2.5, half = 2.0) {
  SIGN_FACES.push({ x, z, nx: Math.sin(ry), nz: Math.cos(ry), reach, half });
  return SIGN_FACES[SIGN_FACES.length - 1];
}
export function blocksSign(x, z) {
  for (const f of SIGN_FACES) {
    const dx = x - f.x, dz = z - f.z;
    const t = dx * f.nx + dz * f.nz;                    // distance out from the face
    if (t < 0.15 || t > f.reach) continue;
    if (Math.abs(dz * f.nx - dx * f.nz) < f.half) return true;   // inside the board's width
  }
  return false;
}
/** The arrivals signs (cat/architecture/arrival.js) — read them, don't fence them. */
function declareForeignSignFaces() {
  addSignFace(43.4, 24.6, 0.5, 3.0, 2.6);        // DEPARTURES board at the pier
  addSignFace(47.6, 16.6, -0.38, 3.2, 4.1);      // POPULATION sign
  addSignFace(45.72, 31.93, 0.16, 2.6, 1.4);     // customs: ARRIVALS window
  addSignFace(48.88, 31.42, 0.16, 2.6, 1.4);     // customs: DEPARTURES (bricked up)
}

/** Four signposts on a ring, each free to slide along the ring to find room. */
function ringSpots(ctx, claims, c, n, rMin, rMax, o = {}) {
  const need = o.need ?? 1.2, mid = (rMin + rMax) / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = (i / n) * Math.PI * 2 + 0.72;
    let best = null;
    for (let r = rMin; r <= rMax + 1e-6; r += 0.5) for (let da = -0.55; da <= 0.55; da += 0.055) {
      const a = base + da, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (ctx.world.height(x, z) < (o.hMin ?? 2.5) || ctx.world.slope(x, z) > 0.3) continue;
      if (ctx.world.nearestPath(x, z, 'cat').d < (o.pathMin ?? 2.0)) continue;
      if (o.avoid && o.avoid(x, z)) continue;
      if (blocksSign(x, z)) continue;
      const head = Math.min(clearance(ctx, x, z, claims) - need, 1.8);
      const score = head * 2 - Math.abs(da) * 1.1 - Math.abs(r - mid) * 0.14;
      if (!best || score > best.score) best = { x, z, head, score };
    }
    if (!best) for (let da = 0; da <= 1.6 && !best; da += 0.1) for (const s of [1, -1]) {
      const a = base + da * s, x = c.x + Math.cos(a) * mid, z = c.z + Math.sin(a) * mid;
      if (o.avoid && o.avoid(x, z)) continue;
      if (blocksSign(x, z)) continue;
      best = { x, z, head: -99, score: -99, fallback: true }; break;
    }
    if (!best) best = { x: c.x + Math.cos(base) * mid, z: c.z + Math.sin(base) * mid, head: -99, score: -99, fallback: true };
    claims.push({ x: best.x, z: best.z, r: need });
    out.push(best);
  }
  return out;
}

/**
 * Cat Island gets built by several systems at once, so the roadside props find
 * their own kerb: we walk a path, sample both kerbs, and keep the spot with the
 * best clearance from everything already registered in ctx.colliders. SE-facing
 * kerbs win a bonus so the signage still reads at the default camera azimuth.
 */
function kerbSpot(ctx, claims, pathId, t0, t1, need, offsets = [3.0, 4.3, 5.7, 7.2, 8.8, 10.4]) {
  const P = ctx.world.PATHS.find((p) => p.id === pathId);
  if (!P) return null;
  let best = null;
  for (let t = t0; t <= t1; t += 0.0025) {
    const a = ctx.world.pointOnPolyline(P.points, t);
    const b = ctx.world.pointOnPolyline(P.points, Math.min(1, t + 0.006));
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;
    for (const s of [1, -1]) for (const off of offsets) {
      const x = a.x + nx * off * s, z = a.z + nz * off * s;
      if (ctx.world.height(x, z) < 1.6 || ctx.world.slope(x, z) > 0.3) continue;
      if (blocksSign(x, z)) continue;
      const cl = clearance(ctx, x, z, claims);
      const facesRoad = (-(nx * s) - (nz * s)) * 0.7071 > 0;
      // clearance dominates; then hug the kerb, then face the camera
      const score = Math.min(cl, need + 3) * 2 - off * 0.35 + (facesRoad ? 1.4 : 0);
      if (!best || score > best.score) best = { x, z, cl, score, off };
    }
  }
  return best;
}

/** Widest genuinely-open patch near (cx,cz) — used when a road kerb is not enough. */
function freeSpot(ctx, claims, cx, cz, rMax, need) {
  let best = null;
  for (let r = 2; r <= rMax; r += 1.1) {
    const n = Math.max(8, Math.round(r * 1.6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r * 0.37;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (ctx.world.height(x, z) < 1.8 || ctx.world.slope(x, z) > 0.25) continue;
      if (ctx.world.nearestPath(x, z, 'cat').d < 2.8) continue;
      if (blocksSign(x, z)) continue;
      const cl = clearance(ctx, x, z, claims);
      if (cl < need) continue;
      const score = Math.min(cl, need + 4) - r * 0.055;
      if (!best || score > best.score) best = { x, z, cl, score, r };
    }
  }
  return best;
}

export function buildScenery(ctx) {
  const { world, scene } = ctx;
  const H = (x, z) => world.height(x, z);
  const B = new Builder();          // opaque scenery
  const G = new Builder();          // night-glow, warm (window / lamp / lantern)
  const GC = new Builder();         // night-glow, cold (the strip lights underground)
  const GW = new Builder();         // ALWAYS lit (the tunnel lantern: it is dark in
                                    // there at noon too, and the mouth has to read)
  const atlas = new SignAtlas();
  allocSlots(atlas);
  const colliders = [];
  const R = rng(hash('cat-containment-scenery'));
  const claimedAtStart = (ctx.colliders || []).length;

  // ═══ PLACEMENT PASS ════════════════════════════════════════════════════════
  // Cat Island is built by four systems at once and containment goes LAST, so
  // every flexible prop here finds its own gap: architecture's buildings and
  // nature's 1100+ trunks are already in ctx.colliders, and `claims` holds the
  // footprints this pass has handed out so containment props also spread apart.
  // Fixed anchors (the pier, the gym, the square, the coast) are authored; only
  // the offset from them is negotiable, and each gag keeps the terrain band it
  // needs (dry land / beach / on the road / at the waterline).
  //
  // WORKAROUND: catArchitecture builds dense set-dressing out of thin posts and
  // signboards and registers no colliders for any of it, so a clearance search
  // is blind to the very clutter most likely to clash. Until there is a shared
  // "visual footprint" registry, the worst offenders are declared here by hand.
  // Sources: cat/architecture/outskirts.js (buildWatchtower → the beach sign
  // forest) and cat/architecture/arrival.js (buildArrival). Keep in step.
  const claims = [
    { x: 224.5, z: -1.5, r: 3.0, why: 'arch: "OUR RAFT (and yours)"' },
    { x: 234, z: -15.5, r: 3.2, why: 'arch: beach lifeguard chair' },
    { x: 43.4, z: 24.6, r: 3.4, why: 'arch: DEPARTURES board at the pier' },
    { x: 46.8, z: 29.2, r: 4.6, why: 'arch: customs booth' },
    { x: 38.2, z: 22.0, r: 6.0, why: 'arch: the welcome arch + bunting posts' },
  ];
  // The beach sign forest is a fan, not a blob — claiming it as one big circle
  // would shove our beach props 10 u out to sea, so mirror the actual layout.
  for (let i = 0; i < 14; i++) {
    const a = -1.25 + (i / 13) * 2.5, rad = 6.5 + (i % 4) * 3.4 + (i % 3) * 1.2;
    claims.push({ x: 230 + Math.sin(a) * rad * 0.9 - (i % 2) * 1.6, z: -10 + Math.cos(a) * rad, r: 2.4, why: 'arch: beach sign ' + i });
  }
  const moves = [];
  // RULE: nothing stands in front of a sign face. The arrivals signs go in first
  // (they are already built by the time we run), ours are added as they settle.
  SIGN_FACES.length = 0;
  declareForeignSignFaces();

  // ── kerbside props: "somewhere along the arrivals road" ───────────────────
  // `need` is the keep-out circle the search aims for, `hard` the prop's real
  // half-extent — a prop is only genuinely intersecting when clear < hard.
  const kerb = (key, pathId, t0, t1, need, hard, offsets) => {
    const from = { x: SPOTS[key].x, z: SPOTS[key].z };
    const s = kerbSpot(ctx, claims, pathId, t0, t1, need, offsets);
    if (s) { SPOTS[key].x = +s.x.toFixed(2); SPOTS[key].z = +s.z.toFixed(2); }
    claims.push({ x: SPOTS[key].x, z: SPOTS[key].z, r: need });
    moves.push({
      key, at: [SPOTS[key].x, SPOTS[key].z], need, hard,
      clear: +(s ? s.cl : clearance(ctx, SPOTS[key].x, SPOTS[key].z, claims)).toFixed(2),
      moved: +Math.hypot(SPOTS[key].x - from.x, SPOTS[key].z - from.z).toFixed(2),
    });
  };
  // each one claims the air in front of its own face the moment it lands, so the
  // next prob along the kerb cannot park itself in the shot
  kerb('posters',   'cat_main',       0.28, 0.47, 3.3, 2.9);   // 5.6-wide notice wall
  addSignFace(SPOTS.posters.x + Math.sin(SE) * 0.4, SPOTS.posters.z + Math.cos(SE) * 0.4, SE, 3.4, 2.5);
  kerb('shop',      'cat_main',       0.48, 0.60, 3.4, 3.0);   // 5.0-wide shopfront
  addSignFace(SPOTS.shop.x + Math.sin(SE + 0.35) * 1.5, SPOTS.shop.z + Math.cos(SE + 0.35) * 1.5, SE + 0.35, 3.0, 2.1);
  kerb('busStop',   'cat_main',       0.57, 0.70, 2.9, 2.5);   // 3.8-wide shelter
  addSignFace(SPOTS.busStop.x - Math.sin(SE) * 0.7, SPOTS.busStop.z - Math.cos(SE) * 0.7, SE, 2.6, 1.8);

  // ── the guest room needs a garden-sized gap in the built-out Heights ──────
  {
    const s = freeSpot(ctx, claims, 178, 48, 34, 4.6) || freeSpot(ctx, claims, 178, 48, 40, 3.4);
    if (s) {
      const dx = SPOTS.bed.x - SPOTS.guestNook.x, dz = SPOTS.bed.z - SPOTS.guestNook.z;
      SPOTS.guestNook.x = +s.x.toFixed(2); SPOTS.guestNook.z = +s.z.toFixed(2);
      SPOTS.bed.x = +(s.x + dx).toFixed(2); SPOTS.bed.z = +(s.z + dz).toFixed(2);
    }
    claims.push({ x: SPOTS.guestNook.x, z: SPOTS.guestNook.z, r: 4.6 });
    moves.push({ key: 'guestNook', at: [SPOTS.guestNook.x, SPOTS.guestNook.z], need: 4.6, hard: 3.9, moved: 0,
      clear: +clearance(ctx, SPOTS.guestNook.x, SPOTS.guestNook.z, []).toFixed(2) });
  }

  // ── the ferry office: off the arrivals road, clear of the customs booth and
  //    the architecture's own departures board, ticket window still roadside ──
  moves.push(relocate(ctx, claims, 'office', ['window'], {
    need: 3.8, hard: 3.2, rMax: 12, hMin: 2.6, slopeMax: 0.2, pathMin: 3.2, pathMax: 11, pull: 0.22,
    also: [{ dx: 2.9, dz: 2.9, need: 2.2 }],                 // ticket window + awning
  }));
  addSignFace(SPOTS.office.x + Math.sin(SE) * 2.2, SPOTS.office.z + Math.cos(SE) * 2.2, SE, 3.2, 1.8);
  moves.push(relocate(ctx, claims, 'board', null, {
    need: 2.6, hard: 2.2, rMax: 8, hMin: 2.6, slopeMax: 0.2, pathMin: 2.4, pathMax: 9.5, pull: 0.26,
  }));
  addSignFace(SPOTS.board.x + Math.sin(SE) * 0.14, SPOTS.board.z + Math.cos(SE) * 0.14, SE, 3.4, 2.3);
  addSignFace(SPOTS.board.x - Math.sin(SE) * 0.14, SPOTS.board.z - Math.cos(SE) * 0.14, SE + Math.PI, 3.0, 2.3);
  // ── lifeguard tower: must stay on the dry sand above the arrival beach ────
  // hMin 1.4 (was 1.1): at 1.1 a corner leg could still land below the tideline,
  // and a lifeguard tower paddling is not the joke we are telling
  moves.push(relocate(ctx, claims, 'tower', null, {
    need: 2.7, hard: 2.3, rMax: 10, hMin: 1.4, hMax: 3.6, slopeMax: 0.45, pull: 0.22,
  }));
  // ── smoothie stand + the tunnel mouth behind it, inside the gym grounds ───
  {
    const dx = +(SPOTS.tunnel.x - SPOTS.smoothie.x).toFixed(2);
    const dz = +(SPOTS.tunnel.z - SPOTS.smoothie.z).toFixed(2);
    moves.push(relocate(ctx, claims, 'smoothie', ['tunnel'], {
      // the tunnel mouth has to stay under Muscle Beach Gym (198,−26, r 18)
      need: 2.6, hard: 2.2, rMax: 6, hMin: 2.6, slopeMax: 0.28, pathMin: 2.2, pull: 0.4,
      also: [{ dx, dz, need: 3.4 }],                          // the tunnel arch behind it
      reject: (x, z) => Math.hypot(x + dx - 198, z + dz + 26) > 17.0,
    }));
  }
  // ── the boom gate: a kerbside checkpoint on the last leg of the gym road,
  //    aimed back down the road so you read it walking towards the beach ──────
  {
    kerb('beachGate', 'cat_gym', 0.68, 0.94, 3.6, 3.0, [3.2, 4.0, 4.8]);
    const P = world.PATHS.find((p) => p.id === 'cat_gym');
    if (P) {                      // point the board back at whoever is coming up the road
      const a = world.pointOnPolyline(P.points, 0.70), b = world.pointOnPolyline(P.points, 0.95);
      SPOTS.beachGate.ry = Math.atan2(a.x - b.x, a.z - b.z);
      const n = world.nearestPath(SPOTS.beachGate.x, SPOTS.beachGate.z, 'cat');
      SPOTS.beachGate.road = world.pointOnPolyline((n.path || P).points, n.t ?? 0.84);
    }
    const gry = SPOTS.beachGate.ry ?? NW;
    addSignFace(SPOTS.beachGate.x + Math.sin(gry) * 0.2, SPOTS.beachGate.z + Math.cos(gry) * 0.2, gry, 3.2, 2.9);
    addSignFace(SPOTS.beachGate.x - Math.sin(gry) * 0.2, SPOTS.beachGate.z - Math.cos(gry) * 0.2, gry + Math.PI, 3.2, 2.9);
  }
  // ── the square's dead quadrant: a newspaper kiosk, a bench with a tourist
  //    who never left, and a pillar papered in the same poster twelve times ──
  moves.push(relocate(ctx, claims, 'kiosk', null, {
    need: 3.0, hard: 2.4, rMax: 11, hMin: 3.2, slopeMax: 0.22, pathMin: 3.0, pathMax: 16, pull: 0.18,
    also: [{ dx: 4.6, dz: 1.2, need: 1.9 }, { dx: 1.4, dz: 4.4, need: 1.5 }],
  }));
  addSignFace(SPOTS.kiosk.x + Math.sin(SE) * 1.5, SPOTS.kiosk.z + Math.cos(SE) * 1.5, SE, 3.0, 1.8);
  // ── sun loungers, on the real sand out on the east shore ──────────────────
  // Sand, not lawn. terrain/ground.js fades the beach out with smooth(0.55, 2.7,
  // h), so by h ≈ 2.3 the ground is already reading green — the parasol was
  // standing on grass. Stay well inside the band that actually paints sandy.
  moves.push(relocate(ctx, claims, 'loungers', null, {
    need: 2.6, hard: 2.2, rMax: 9, hMin: 0.9, hMax: 1.9, slopeMax: 0.6, pull: 0.15,
  }));
  moves.push(relocate(ctx, claims, 'rowboat', null, { need: 2.8, hard: 2.4, rMax: 7, hMin: 1.5, hMax: 6, pull: 0.24 }));

  // ── the two rafts float: slide each to its own waterline first, so the
  //    winch that reels one of them in can then be placed within rope reach ──
  // target −0.2 rather than 0.0: a raft that is exactly ON the shoreline reads as
  // a plank lying on sand. Half a hand's width into the water and it floats.
  for (const k of ['raftA', 'raftB']) {
    const w = toWaterline(world, SPOTS[k].x, SPOTS[k].z, 18, -0.2);
    const moved = Math.hypot(w.x - SPOTS[k].x, w.z - SPOTS[k].z);
    SPOTS[k].x = +w.x.toFixed(2); SPOTS[k].z = +w.z.toFixed(2);
    moves.push({ key: k, at: [SPOTS[k].x, SPOTS[k].z], clear: +clearance(ctx, w.x, w.z, claims).toFixed(2), need: 0, moved: +moved.toFixed(2), waterline: +world.height(w.x, w.z).toFixed(2) });
  }
  // the winch hut has to stay within rope reach of the raft it reels in
  moves.push(relocate(ctx, claims, 'winch', null, {
    need: 2.5, hard: 2.1, rMax: 6, hMin: 1.8, hMax: 6, pull: 0.5,
    reject: (x, z) => Math.hypot(x - SPOTS.raftA.x, z - SPOTS.raftA.z) > 11.5,
  }));
  // the cove is a rock formation ~10u across; give it room to find a real gap
  moves.push(relocate(ctx, claims, 'cove', null, {
    need: 4.4, hard: 4.0, rMax: 9, hMin: 1.6, hMax: 6, slopeMax: 0.45, pull: 0.2,
  }));
  moves.push(relocate(ctx, claims, 'crates', null, {
    need: 2.6, hard: 2.0, rMax: 7, hMin: 1.6, pathMin: 2.2, pathMax: 9, pull: 0.26,
    also: [{ dx: 2.4, dz: -0.9, need: 1.1 }],                 // the oil barrel
  }));

  // helper: a flat sign face standing proud of a board in B
  const board = (slot, x, y, z, ry, w, h, frame = CAT.wood, backSlot = null) => {
    B.box(w + 0.24, h + 0.24, 0.18, frame, x, y, z, ry);
    atlas.face(slot, w, h, x + Math.sin(ry) * 0.12, y, z + Math.cos(ry) * 0.12, ry);
    if (backSlot) atlas.face(backSlot, w, h, x - Math.sin(ry) * 0.12, y, z - Math.cos(ry) * 0.12, ry + Math.PI);
  };
  const post = (x, z, h, r = 0.12, c = CAT.wood, y0 = null) => B.cyl(r, r * 1.15, h, 6, c, x, (y0 ?? H(x, z)) + h / 2, z);

  // ═══ 1. FERRY OFFICE + SCHEDULE BOARD ═════════════════════════ (Arrivals Pier)
  {
    const { x, z } = SPOTS.office, y = H(x, z), ry = SE; // ticket window faces the arrivals path
    B.box(4.8, 3.1, 4.0, CAT.cream, x, y + 1.55, z, ry);
    B.box(5.1, 0.4, 4.3, CAT.terracotta, x, y + 3.0, z, ry);
    B.cone(3.7, 1.7, 4, CAT.roofRed, x, y + 4.0, z, ry + Math.PI / 4);
    B.sph(0.28, 6, 4, CAT.gold, x, y + 4.95, z);
    B.box(0.1, 0.9, 1.5, CAT.gold, x, y + 5.35, z, ry);       // fish weathervane
    B.cone(0.34, 0.5, 3, CAT.gold, x + Math.sin(ry) * 0.8, y + 5.35, z + Math.cos(ry) * 0.8, ry, 0, Math.PI / 2);
    // ticket window on the NW face
    const fx = Math.sin(ry), fz = Math.cos(ry);
    const wx = x + fx * 2.05, wz = z + fz * 2.05;
    B.box(1.9, 1.4, 0.28, 0x2a2028, wx, y + 1.75, wz, ry);
    G.box(1.62, 1.12, 0.1, 0xffd98a, x + fx * 2.15, y + 1.75, z + fz * 2.15, ry);
    B.box(2.5, 0.2, 0.7, CAT.wood, x + fx * 2.25, y + 1.02, z + fz * 2.25, ry);   // counter ledge
    B.box(2.9, 0.22, 1.5, CAT.teal, x + fx * 2.6, y + 2.75, z + fz * 2.6, ry);     // awning
    for (const s of [-1, 1]) B.cyl(0.06, 0.06, 1.2, 4, CAT.wood, x + fx * 3.2 + fz * 1.2 * s, y + 2.2, z + fz * 3.2 - fx * 1.2 * s);
    board('tickets', x + fx * 2.12, y + 2.45, z + fz * 2.12, ry, 1.8, 0.52, CAT.navy);
    // Queue barrier. It used to snake straight OUT of the window, i.e. four gold
    // posts standing between the camera and the only readable sign on the
    // building. It now runs sideways along the frontage, so the queue is still
    // absurd and the window is still legible.
    for (let i = 0; i < 5; i++) {
      const along = 2.4 + i * 1.55, out = 0.5 + (i % 2) * 0.9;
      const qx = wx - fz * along + fx * out, qz = wz + fx * along + fz * out;
      post(qx, qz, 1.0, 0.07, CAT.gold);
      B.sph(0.11, 5, 4, CAT.gold, qx, H(qx, qz) + 1.05, qz);
    }
    // potted plant + bollards
    B.cyl(0.42, 0.34, 0.6, 6, CAT.terracotta, x + fx * 1.2 - fz * 2.9, y + 0.3, z + fz * 1.2 + fx * 2.9);
    B.sph(0.62, 6, 4, CAT.grassDark, x + fx * 1.2 - fz * 2.9, y + 1.0, z + fz * 1.2 + fx * 2.9, [1, 0.8, 1]);
    colliders.push({ x, z, r: 3.1 });

    // Schedule board — faces the town (SE) so arriving guests read it on the way
    // in. The BACK used to carry the identical CANCELLED artwork, which is why
    // the same board appeared to exist three times on one beach; it is now the
    // one honest sign on Cat Island, and it is a green arrow pointing DOWN.
    const b = SPOTS.board, by = H(b.x, b.z);
    for (const s of [-1, 1]) B.cyl(0.14, 0.17, 2.6, 6, CAT.wood, b.x + Math.cos(SE) * 1.5 * s, by + 1.3, b.z - Math.sin(SE) * 1.5 * s);
    board('schedule', b.x, by + 3.1, b.z, SE, 3.9, 2.2, CAT.navy, 'schedule_back');
    B.box(4.3, 0.28, 0.5, CAT.roofRed, b.x, by + 4.35, b.z, SE);
    colliders.push({ x: b.x, z: b.z, r: 1.1 });
  }

  // ═══ 2. LIFEGUARD TOWER (arrival beach) ══════════════════════════════════════
  {
    const { x, z } = SPOTS.tower, y = H(x, z);
    const DECK = y + 3.35;
    // Every leg is cut to ITS OWN ground and stood on a piling — a stone collar
    // and a wedge of heaped sand. The old tower used one length for all four
    // legs, so on a shelving beach the seaward pair simply ended in the water.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = x + sx * 0.95, lz = z + sz * 0.95;
      const gy = Math.min(H(lx, lz), y) - 0.35;                 // bite into the sand
      const hgt = DECK - gy;
      B.cyl(0.13, 0.16, hgt, 5, CAT.wood, lx, gy + hgt / 2, lz);
      B.cyl(0.34, 0.46, 0.75, 6, CAT.cobble, lx, gy + 0.5, lz);        // piling collar
      B.sph(0.58, 6, 4, CAT.sand, lx, gy + 0.28, lz, [1, 0.42, 1]);    // heaped sand
    }
    // cross-bracing, so four sticks read as one structure
    for (const s of [-1, 1]) {
      B.box(2.5, 0.14, 0.12, CAT.wood, x, y + 1.35, z + s * 0.95, 0, 0, 0.14 * s);
      B.box(0.12, 0.14, 2.5, CAT.wood, x + s * 0.95, y + 1.75, z, 0, 0.14 * s, 0);
    }
    B.box(2.6, 0.24, 2.6, CAT.wood, x, y + 3.35, z);
    for (const s of [-1, 1]) { B.box(2.6, 0.7, 0.14, CAT.cream, x, y + 3.9, z + s * 1.25); B.box(0.14, 0.7, 2.6, CAT.cream, x + s * 1.25, y + 3.9, z); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl(0.08, 0.08, 1.5, 4, CAT.wood, x + sx * 1.15, y + 4.4, z + sz * 1.15);
    B.box(3.2, 0.22, 3.2, CAT.roofRed, x, y + 5.2, z);
    B.cyl(0.05, 0.05, 1.6, 4, CAT.cream, x + 1.2, y + 6.1, z - 1.2);
    B.box(0.9, 0.55, 0.05, CAT.roofRed, x + 1.66, y + 6.6, z - 1.2, SE);
    // Ladder: two stiles planted on the ground UNDER the ladder foot (which is
    // not the ground under the tower), rungs spread between foot and deck, so it
    // can never end in mid-air over water again.
    {
      const lz = z + 1.5, lgy = Math.min(H(x, lz), y) - 0.1, lh = DECK - lgy + 0.2;
      for (const s of [-1, 1]) B.cyl(0.085, 0.095, lh, 5, CAT.wood, x + s * 0.52, lgy + lh / 2, lz);
      const n = Math.max(5, Math.round(lh / 0.62));
      for (let i = 0; i < n; i++) B.box(1.12, 0.11, 0.13, 0xb58a52, x, lgy + 0.4 + i * (lh - 0.7) / (n - 1), lz);
      B.sph(0.5, 6, 4, CAT.sand, x, lgy + 0.14, lz, [1.5, 0.35, 1]);   // sand kicked up at the foot
    }
    colliders.push({ x, z, r: 1.5 });
  }

  // ═══ 3. BUS STOP THAT GOES NOWHERE ═══════════════════════════════════════════
  {
    const { x, z } = SPOTS.busStop, y = H(x, z), ry = SE;
    const fx = Math.sin(ry), fz = Math.cos(ry);
    for (const s of [-1, 1]) B.cyl(0.1, 0.11, 2.7, 5, CAT.teal, x - fx * 0.8 + fz * 1.55 * s, y + 1.35, z - fz * 0.8 - fx * 1.55 * s);
    B.box(3.8, 0.18, 2.0, CAT.teal, x, y + 2.8, z, ry);
    B.box(3.6, 2.4, 0.16, CAT.cream, x - fx * 0.85, y + 1.6, z - fz * 0.85, ry);  // back wall
    B.box(3.4, 0.22, 0.55, CAT.wood, x, y + 0.62, z, ry);                        // bench
    for (const s of [-1, 1]) B.box(0.16, 0.5, 0.5, CAT.wood, x + fz * 1.4 * s, y + 0.27, z - fx * 1.4 * s, ry);
    board('bus', x - fx * 0.72, y + 1.9, z - fz * 0.72, ry, 1.5, 1.9, CAT.navy);
    // bus-stop flag on a pole, with a paw instead of a bus
    post(x + fz * 2.4, z - fx * 2.4, 3.2, 0.09, CAT.navy);
    B.box(0.9, 0.9, 0.1, CAT.gold, x + fz * 2.4, y + 3.4, z - fx * 2.4, ry);
    colliders.push({ x: x - fx * 0.85, z: z - fz * 0.85, r: 1.2 });
  }

  // ═══ 4. "MISSING: HUMAN" POSTER WALL ════════════════════════════════════════
  {
    const { x, z } = SPOTS.posters, y = H(x, z), ry = SE;
    const fx = Math.sin(ry), fz = Math.cos(ry);
    B.box(5.2, 3.6, 0.7, CAT.cream, x, y + 1.8, z, ry);
    B.box(5.6, 0.3, 0.95, CAT.terracotta, x, y + 3.7, z, ry);
    for (const s of [-1, 1]) B.box(0.5, 3.9, 0.95, CAT.terracotta, x + fz * 2.55 * s, y + 1.95, z - fx * 2.55 * s, ry);
    atlas.face('posters', 4.6, 3.0, x + fx * 0.38, y + 1.9, z + fz * 0.38, ry);
    // Bench + lamp, both slid off to the side: they used to sit dead in front of
    // the wall, which is the one thing a wall of posters cannot survive.
    const bx = x + fx * 1.6 + fz * 3.5, bz = z + fz * 1.6 - fx * 3.5;
    B.box(2.6, 0.2, 0.6, CAT.wood, bx, H(bx, bz) + 0.6, bz, ry + 1.57);
    for (const s of [-1, 1]) B.box(0.16, 0.5, 0.5, CAT.wood, bx + fx * 1.05 * s, H(bx, bz) + 0.25, bz + fz * 1.05 * s, ry + 1.57);
    post(x + fx * 0.4 - fz * 3.6, z + fz * 0.4 + fx * 3.6, 3.4, 0.1, CAT.navy);
    G.sph(0.3, 6, 4, 0xffe6a8, x + fx * 0.4 - fz * 3.6, y + 3.6, z + fz * 0.4 + fx * 3.6);
    colliders.push({ x, z, r: 2.4 });
  }

  // ═══ 5. SUITCASE IN A SHOP WINDOW ═══════════════════════════════════════════
  {
    const { x, z } = SPOTS.shop, y = H(x, z), ry = SE + 0.35;
    const fx = Math.sin(ry), fz = Math.cos(ry);
    B.box(4.6, 3.8, 3.0, CAT.cream, x, y + 1.9, z, ry);
    B.box(5.0, 0.35, 3.3, CAT.roofBlue, x, y + 3.95, z, ry);
    B.box(5.2, 0.26, 1.4, CAT.roofBlue, x + fx * 1.7, y + 3.1, z + fz * 1.7, ry);  // awning
    B.box(3.4, 2.0, 0.2, 0x1a2230, x + fx * 1.52, y + 1.85, z + fz * 1.52, ry);    // glass
    // the suitcase on a plinth inside the window
    B.box(1.5, 0.3, 0.8, CAT.wood, x + fx * 1.3, y + 0.95, z + fz * 1.3, ry);
    B.box(1.3, 0.85, 0.55, 0x8b3a2e, x + fx * 1.3, y + 1.55, z + fz * 1.3, ry);
    B.box(1.34, 0.13, 0.59, CAT.gold, x + fx * 1.3, y + 1.55, z + fz * 1.3, ry);
    B.torus(0.13, 0.035, 3, 8, 0x3a2a22, x + fx * 1.3, y + 2.02, z + fz * 1.3, Math.PI / 2, ry);
    board('suitcase', x + fx * 1.45, y + 2.62, z + fz * 1.45, ry, 2.1, 0.62, CAT.navy);
    colliders.push({ x, z, r: 2.5 });
  }

  // ═══ 6. FOUR EXIT SIGNS IN A CIRCLE AROUND PURRLIAMENT SQUARE ════════════════
  // The joke only lands if the four signs are visibly DIFFERENT signs arguing
  // with each other, so each gets its own atlas cell and its own text. Each one
  // aims its arrow back into the square and sways a few degrees either side —
  // confident, never still, and never actually pointing out of town.
  // SIX of them, not four, and they are now HIGHWAY signs: 4.5 u to the middle of
  // a 3.3-wide board, motorway green, a white arrow you could read from a moving
  // car. The gag was being told in 7-pixel sentences; it is now told in shapes,
  // and six posts on a ring guarantee three faces and three backs — i.e. three
  // arrows arguing with each other — in any single frame of the square.
  const ARROW_W = 3.3, ARROW_H = 1.12, ARROW_Y = 4.5, N_ARROWS = 6;
  const arrowSpots = [];
  {
    // each signpost slides along the ring until it finds room between the square's
    // buildings, planters and topiary — the circle survives, the collisions don't
    const ring = ringSpots(ctx, claims, SPOTS.square, N_ARROWS, 7.0, 11.0, {
      need: 1.5, hMin: 4.0, pathMin: 2.0, avoid: blocksMonument,
    });
    for (let i = 0; i < N_ARROWS; i++) {
      const x = +ring[i].x.toFixed(2), z = +ring[i].z.toFixed(2), y = H(x, z);
      B.cyl(0.19, 0.24, ARROW_Y - 0.15, 6, CAT.navy, x, y + (ARROW_Y - 0.15) / 2, z);
      B.cyl(0.26, 0.26, 0.26, 8, CAT.roofRed, x, y + ARROW_Y + 0.72, z);        // finial
      B.cyl(0.66, 0.82, 0.46, 8, CAT.navy, x, y + 0.23, z);                     // plinth
      B.torus(0.7, 0.09, 4, 10, CAT.gold, x, y + 0.46, z, Math.PI / 2);         // gold ring
      // the painted arrow runs along the board's width axis (cos ry, −sin ry),
      // so this ry is the one that has it pointing at the middle of the square
      const dx = SPOTS.square.x - x, dz = SPOTS.square.z - z, d = Math.hypot(dx, dz) || 1;
      const base = Math.atan2(-dz / d, dx / d);
      arrowSpots.push({
        x, y: y + ARROW_Y, z, base, phase: i * 1.37, rate: 0.13 + i * 0.021,
        slot: 'arrow' + i, w: ARROW_W, h: ARROW_H,
      });
      colliders.push({ x, z, r: 0.85 });
      addSignFace(x, z, base, 2.5, ARROW_W * 0.5);
      addSignFace(x, z, base + Math.PI, 2.5, ARROW_W * 0.5);
      moves.push({ key: 'arrow' + i, at: [x, z], clear: +(ring[i].head + 1.5).toFixed(2), need: 1.5, hard: 1.0, moved: 0, fallback: !!ring[i].fallback });
    }
  }

  // ═══ 7. GUEST NOOK + "YOUR" BED (Whisker Heights) ═══════════════════════════
  {
    const { x, z } = SPOTS.guestNook, y = H(x, z), ry = SE;
    const fx = Math.sin(ry), fz = Math.cos(ry);   // opening faces SE
    B.box(5.2, 3.2, 0.4, CAT.terracotta, x - fx * 2.0, y + 1.6, z - fz * 2.0, ry);
    for (const s of [-1, 1]) B.box(0.4, 3.2, 4.2, CAT.terracotta, x + fz * 2.4 * s, y + 1.6, z - fx * 2.4 * s, ry);
    B.box(5.8, 0.35, 4.8, CAT.roofGreen, x, y + 3.4, z, ry);
    B.cone(3.9, 1.3, 4, CAT.roofGreen, x, y + 4.2, z, ry + Math.PI / 4);
    B.box(4.8, 0.06, 4.0, 0xd9c6a4, x, y + 0.06, z, ry);                         // floor
    // bed
    const bd = SPOTS.bed;
    B.box(2.0, 0.45, 3.0, CAT.wood, bd.x, y + 0.3, bd.z, ry);
    B.box(1.9, 0.35, 2.8, 0xf2e3cf, bd.x, y + 0.68, bd.z, ry);
    B.box(1.9, 0.34, 1.7, 0x7fbfb2, bd.x - fx * 0.6, y + 0.9, bd.z - fz * 0.6, ry);  // blanket
    B.box(1.2, 0.3, 0.55, 0xffffff, bd.x + fx * 1.1, y + 0.95, bd.z + fz * 1.1, ry); // pillow
    B.box(2.2, 1.5, 0.2, CAT.wood, bd.x + fx * 1.6, y + 1.1, bd.z + fz * 1.6, ry);   // headboard
    pawHeadboard(B, bd.x + fx * 1.68, y + 1.45, bd.z + fz * 1.68, ry);
    // bedside lamp + rug
    B.cyl(0.25, 0.3, 0.5, 6, CAT.wood, bd.x - fz * 1.6, y + 0.25, bd.z + fx * 1.6);
    G.cone(0.34, 0.45, 6, 0xffe1a0, bd.x - fz * 1.6, y + 0.75, bd.z + fx * 1.6);
    B.cyl(1.3, 1.3, 0.04, 10, 0xc96a5a, x + fx * 1.3, y + 0.09, z + fz * 1.3);
    board('guest', x - fx * 1.78, y + 2.5, z - fz * 1.78, ry, 1.7, 0.5, CAT.gold);
    colliders.push({ x: x - fx * 2.1, z: z - fz * 2.1, r: 1.5 });
    for (const s of [-1, 1]) colliders.push({ x: x + fz * 2.5 * s, z: z - fx * 2.5 * s, r: 1.3 });
  }

  // ═══ 8. SMOOTHIE STAND + THE TUNNEL UNDER MUSCLE BEACH GYM ══════════════════
  {
    const { x, z } = SPOTS.smoothie, y = H(x, z), ry = SE;
    const fx = Math.sin(ry), fz = Math.cos(ry);
    B.box(3.0, 1.5, 1.8, 0xf2b6c6, x, y + 0.95, z, ry);
    B.box(3.3, 0.2, 2.1, CAT.cream, x, y + 1.78, z, ry);
    for (const s of [-1, 1]) B.cyl(0.07, 0.07, 1.9, 4, CAT.cream, x + fz * 1.35 * s, y + 2.7, z - fx * 1.35 * s);
    B.box(3.6, 0.16, 2.2, 0xff7aa2, x, y + 3.6, z, ry);
    for (const s of [-1, 1]) B.cyl(0.2, 0.2, 0.55, 6, CAT.furBlack, x + fz * 1.5 * s, y + 0.28, z - fx * 1.5 * s, 0, Math.PI / 2, 0);
    // ludicrous smoothie cup on the roof
    B.cyl(0.55, 0.42, 1.5, 10, 0xfff0f4, x - fz * 0.9, y + 4.5, z + fx * 0.9);
    B.sph(0.56, 8, 5, 0xff6f9c, x - fz * 0.9, y + 5.2, z + fx * 0.9, [1, 0.6, 1]);
    B.cyl(0.07, 0.07, 1.3, 5, 0x4ec3e8, x - fz * 0.9 + 0.2, y + 5.7, z + fx * 0.9, 0, 0, 0.35);
    colliders.push({ x, z, r: 1.9 });
  }
  {
    const { x, z } = SPOTS.tunnel, y = H(x, z), ry = NW + 0.25;    // mouth faces the stand
    const fx = Math.sin(ry), fz = Math.cos(ry);
    const wx = Math.cos(ry), wz = -Math.sin(ry);                   // the mouth's width axis

    // ── the bank it goes into ────────────────────────────────────────────────
    // The gym grounds are dead flat here (h ≈ 6.4 in every direction for 10 u),
    // so a portal on its own is a doorway standing in a field with nothing
    // behind it. Bank it: a grassy spoil mound humped over the first few metres
    // of the tunnel, which is also what hides the stub's ceiling from outside.
    // NOTE: every lump is kept OUT of the bore — flanks sit beside it, lids sit
    // above its ceiling — or the mound fills the doorway with green.
    //   bore: half-width 2.0, ceiling ≈ y + 3.42 − 0.41·d (it dives, see below)
    const lump = (d, off, up, r, sx, sy, sz, col, rx = 0) =>
      B.add(new THREE.SphereGeometry(r, 8, 5), col,
        x - fx * d + wx * off, y + up, z - fz * d + wz * off, ry, rx, 0, [sx, sy, sz]);
    // flanks — inner edge at |W| 2.2, i.e. just outside the bore's 2.0 half-width
    for (const s of [-1, 1]) lump(3.2, 4.4 * s, 0.5, 2.2, 1.00, 1.45, 1.80, CAT.grassDark);
    lump(2.4, 0, 4.10, 3.0, 1.60, 0.20, 1.15, CAT.grassDark, -0.12);              // lid over the mouth
    lump(6.2, 0, 2.25, 2.8, 1.50, 0.30, 1.10, CAT.grassDark, -0.16);              // lid, further in
    lump(9.6, 0, 0.80, 3.0, 1.30, 0.85, 1.00, CAT.grassDark);                     // and the back of the hump
    lump(4.6, 0, 3.30, 2.2, 1.15, 0.20, 0.95, CAT.grass);                         // sunlit crown
    for (const s of [-1, 1]) lump(0.9, 3.1 * s, 0.45, 1.5, 0.85, 0.95, 0.85, CAT.cobble);     // stone collar
    colliders.push({ x: x - fx * 3.6, z: z - fz * 3.6, r: 2.8 });
    colliders.push({ x: x - fx * 6.8, z: z - fz * 6.8, r: 2.6 });

    // pale stone shoulders so the mouth reads at distance
    for (const s of [-1, 1]) {
      B.box(1.3, 3.6, 1.8, CAT.cobble, x + fz * 2.25 * s, y + 1.8, z - fx * 2.25 * s, ry);
      B.box(1.5, 0.35, 2.0, CAT.cobbleDark, x + fz * 2.25 * s, y + 3.75, z - fx * 2.25 * s, ry);
    }
    B.box(5.8, 1.0, 2.0, CAT.cobble, x, y + 4.2, z, ry);
    B.box(1.0, 0.7, 2.2, CAT.cobbleDark, x, y + 4.25, z, ry);                     // keystone
    B.box(3.6, 0.5, 0.5, CAT.cobbleDark, x, y + 3.62, z, ry);                     // lintel lip

    // ── AND A REAL TUNNEL BEHIND IT ──────────────────────────────────────────
    // seven metres of lit, descending passage with timber sleepers and one
    // lantern, so the opening reads as somewhere you could go rather than a
    // black rectangle painted on stone. It dives at 24° to get under the gym
    // (and under the bank) fast.
    const DIVE = 0.42, cD = Math.cos(DIVE), sD = Math.sin(DIVE), DEP = 7.0;
    const tx = (d) => x - fx * d * cD, tz = (d) => z - fz * d * cD, ty = (d) => y - d * sD;
    const mid = DEP / 2;
    B.box(3.3, 0.30, DEP, CAT.sand, tx(mid), ty(mid) - 0.15, tz(mid), ry, -DIVE);          // floor
    B.box(4.0, 0.34, DEP, CAT.cobbleDark, tx(mid), ty(mid) + 3.25, tz(mid), ry, -DIVE);    // ceiling
    for (const s of [-1, 1]) {
      B.box(0.45, 3.3, DEP, CAT.cobble, tx(mid) + wx * 1.78 * s, ty(mid) + 1.55, tz(mid) + wz * 1.78 * s, ry, -DIVE);
    }
    B.box(3.7, 3.4, 0.7, 0x171219, tx(DEP), ty(DEP) + 1.55, tz(DEP), ry, -DIVE);           // the dark it leads to
    // sleepers: the perspective lines that make the passage read as depth
    for (let i = 0; i < 5; i++) {
      const d = 1.0 + i * 1.35;
      B.box(3.1, 0.16, 0.34, CAT.wood, tx(d), ty(d) + 0.04, tz(d), ry, -DIVE);
    }
    // one lantern, and the pool of light it throws on the floor
    const LD = 2.7, lx = tx(LD), lz = tz(LD), ly = ty(LD);
    B.cyl(0.04, 0.04, 0.55, 4, 0x2a2028, lx, ly + 2.92, lz);                               // cord
    B.torus(0.16, 0.035, 3, 8, 0x3a2a22, lx, ly + 2.66, lz, Math.PI / 2, ry);               // hoop
    GW.sph(0.30, 7, 5, 0xffd48a, lx, ly + 2.42, lz);                                       // the flame
    GW.cyl(0.95, 0.95, 0.05, 10, 0x7a4a1e, lx, ly + 0.06, lz, ry, -DIVE);                  // lamplight on the floor
    GC.box(2.2, 0.14, 0.12, 0x6fe4c8, x + fx * 0.55, y + 3.2, z + fz * 0.55, ry); // sickly strip light
    // hazard tape nobody respects
    for (let i = 0; i < 5; i++) B.box(0.62, 0.2, 0.12, i % 2 ? 0xffd24a : 0x2b2b30, x + fx * 0.85 + Math.cos(ry) * (i - 2) * 0.66, y + 1.5, z + fz * 0.85 - Math.sin(ry) * (i - 2) * 0.66, ry, 0, 0.1);
    // spoil heap + a forgotten dumbbell
    B.sph(1.4, 6, 4, CAT.cobble, x + fz * 3.6, y + 0.3, z - fx * 3.6, [1, 0.42, 1]);
    B.cyl(0.1, 0.1, 1.3, 5, CAT.furBlack, x + fz * 3.2 - fx * 1.4, y + 0.55, z - fx * 3.2 - fz * 1.4, 0, 0, Math.PI / 2);
    for (const s of [-1, 1]) B.cyl(0.34, 0.34, 0.34, 6, CAT.furBlack, x + fz * 3.2 - fx * 1.4 + Math.cos(ry) * 0.72 * s, y + 0.55, z - fx * 3.2 - fz * 1.4 - Math.sin(ry) * 0.72 * s, 0, 0, Math.PI / 2);
    board('tunnel', x + fx * 1.04, y + 4.86, z + fz * 1.04, ry, 2.6, 0.8, CAT.navy);   // flat on the arch cap, not proud of it
    for (const s of [-1, 1]) colliders.push({ x: x + Math.cos(ry) * 2.3 * s, z: z - Math.sin(ry) * 2.3 * s, r: 1.1 });
  }

  // ═══ 9a. THE CHECKPOINT ON THE ROAD TO NOT-AN-EXIT BEACH ════════════════════
  // catArchitecture owns the beach itself — a forest of fourteen NO SWIMMING
  // signs, a deflated "OUR RAFT (and yours)" and a lifeguard chair, all within
  // ~16 u of (230,−6). Containment does not compete with that: our boom gate and
  // welcome board stand back up the gym road, so you're stopped on the way IN and
  // the sign forest still gets a clean frame of its own.
  {
    const { x, z } = SPOTS.beachGate, y = H(x, z);
    const ry = SPOTS.beachGate.ry ?? NW;                  // faces back down the road
    // the sign's width axis is perpendicular to its normal; flip it so it points
    // away from the tarmac, and the boom then sweeps back across the road
    const gd = { x: Math.cos(ry), z: -Math.sin(ry) };
    const road = SPOTS.beachGate.road;
    if (road && (road.x - x) * gd.x + (road.z - z) * gd.z > 0) { gd.x = -gd.x; gd.z = -gd.z; }
    // big welcome board, readable from both sides of the gate
    for (const s of [-1, 1]) B.cyl(0.2, 0.24, 3.0, 6, CAT.wood, x + Math.cos(ry) * 2.1 * s, y + 1.5, z - Math.sin(ry) * 2.1 * s);
    board('beach', x, y + 3.9, z, ry, 5.4, 1.7, CAT.roofRed, 'beach_back');
    B.box(6.0, 0.3, 0.6, CAT.roofRed, x, y + 4.95, z, ry);
    // the small print, on its own posts beside it
    const sx = x + gd.x * 3.6, sz = z + gd.z * 3.6, sy = H(sx, sz);
    for (const s of [-1, 1]) B.cyl(0.13, 0.15, 3.5, 6, CAT.wood, sx + Math.cos(ry) * 1.35 * s, sy + 1.75, sz - Math.sin(ry) * 1.35 * s);
    board('closed', sx, sy + 2.55, sz, ry, 3.2, 1.2, CAT.navy);
    // hung from its crossbar on two chains, because a board with no visible means
    // of support is a board that floats
    B.box(3.4, 0.2, 0.24, CAT.wood, sx, sy + 3.55, sz, ry);
    for (const s of [-1, 1]) B.cyl(0.05, 0.05, 0.5, 4, 0x7d828a, sx + Math.cos(ry) * 1.1 * s, sy + 3.4, sz - Math.sin(ry) * 1.1 * s);

    // ── BOOM GATE: red/white hazard stripes you can read from the road ────────
    const gx = x - gd.x * 2.2, gz = z - gd.z * 2.2, gy = H(gx, gz);
    const RED = 0xe03a2a, WHITE = 0xfff4e2;
    B.cyl(0.34, 0.4, 1.5, 8, WHITE, gx, gy + 0.75, gz);                       // pivot drum
    B.cyl(0.2, 0.22, 2.6, 7, RED, gx, gy + 1.3, gz);                          // mast
    for (let i = 0; i < 6; i++) {
      B.box(0.98, 0.42, 0.44, i % 2 ? WHITE : RED,
        gx - gd.x * (0.75 + i * 0.98), gy + 1.5, gz - gd.z * (0.75 + i * 0.98), ry + 1.57);
    }
    colliders.push({ x: gx, z: gz, r: 0.8 });
    // ── the PAW STOP disc: a red dinner plate with a white paw on it, on the
    //    post the boom rests on, out at the far edge of the road where it is
    //    clear of the welcome board's face. No text at all — you stop because of
    //    the SHAPE, and read the sentences afterwards if you feel like it.
    {
      const rx2 = gx - gd.x * 6.4, rz2 = gz - gd.z * 6.4, ry2 = H(rx2, rz2);
      B.cyl(0.22, 0.26, 3.4, 7, WHITE, rx2, ry2 + 1.7, rz2);                  // rest / sign post
      B.cyl(0.26, 0.26, 0.3, 8, RED, rx2, ry2 + 1.6, rz2);                    // the rest collar
      const dy = ry2 + 3.5, nx = Math.sin(ry), nz = Math.cos(ry);
      B.cyl(1.08, 1.08, 0.18, 16, RED, rx2, dy, rz2, ry, Math.PI / 2);
      for (const s of [-1, 1]) B.torus(1.09, 0.12, 4, 16, WHITE, rx2 + nx * 0.1 * s, dy, rz2 + nz * 0.1 * s, 0, ry);
      // the paw itself, in geometry, on both faces (scaled THEN rotated, so the
      // pads lie flat in the disc's plane whichever way the gate ended up facing)
      const pad = (px, py, pz, sx2, sy2, sz2) => B.add(new THREE.SphereGeometry(0.5, 7, 5), WHITE, px, py, pz, ry, 0, 0, [sx2, sy2, sz2]);
      for (const s of [-1, 1]) {
        const px = rx2 + nx * 0.12 * s, pz = rz2 + nz * 0.12 * s;
        pad(px, dy - 0.18, pz, 0.94, 0.74, 0.16);
        for (let k = 0; k < 4; k++) {
          const a = -0.95 + k * 0.63;
          pad(px + Math.cos(ry) * Math.sin(a) * 0.66, dy + 0.32 + Math.cos(a) * 0.2, pz - Math.sin(ry) * Math.sin(a) * 0.66, 0.34, 0.44, 0.16);
        }
      }
      colliders.push({ x: rx2, z: rz2, r: 0.6 });
    }
    // a lifebuoy nailed permanently to a post — moved clear of the board's back
    // face ("YOU ARE STILL HERE" is 5.4 u wide and it was standing in it)
    const lx = x + gd.x * 7.2, lz = z + gd.z * 7.2, ly = H(lx, lz);
    B.cyl(0.11, 0.13, 2.2, 6, CAT.wood, lx, ly + 1.1, lz);
    B.torus(0.55, 0.18, 5, 10, 0xe8452f, lx, ly + 2.1, lz, 0, SE);
    B.torus(0.55, 0.19, 5, 10, CAT.cream, lx, ly + 2.1, lz, 0, SE + 0.6);
    colliders.push({ x, z, r: 1.4 });
  }

  // ═══ 9b. SUN LOUNGERS — cats sunbathing on the sand you may look at ════════
  {
    const { x, z } = SPOTS.loungers, y = H(x, z);
    B.cyl(0.09, 0.09, 2.7, 6, CAT.wood, x, y + 1.35, z);
    // ONE round canopy, not eight overlapping three-sided cones: the old fan
    // threw a starburst shadow across the sand. Two tiers keep the two-tone.
    B.cone(1.95, 0.62, 12, 0xff6f8f, x, y + 2.44, z);
    B.torus(1.94, 0.11, 4, 14, CAT.cream, x, y + 2.14, z, Math.PI / 2);            // scalloped rim
    B.cone(1.42, 0.52, 12, CAT.cream, x, y + 2.88, z);
    B.sph(0.15, 6, 4, CAT.gold, x, y + 3.22, z);
    for (let i = 0; i < 3; i++) {
      const cx = x + Math.cos(i * 2.1 + 0.6) * 2.0, cz = z + Math.sin(i * 2.1 + 0.6) * 2.0, cy = H(cx, cz);
      const cr = i * 1.3 + SE;
      B.box(1.1, 0.12, 1.6, i === 1 ? 0x7fbfb2 : 0xf5c86a, cx, cy + 0.42, cz, cr, -0.35);
      for (const s of [-1, 1]) B.cyl(0.05, 0.05, 0.5, 4, CAT.wood, cx + Math.cos(cr) * 0.5 * s, cy + 0.25, cz - Math.sin(cr) * 0.5 * s);
    }
    // a cooler with exactly one drink in it, and it is not for you
    B.box(0.9, 0.6, 0.62, 0x4ec3e8, x - 1.5, y + 0.3, z - 1.9, SE);
    B.box(0.95, 0.12, 0.66, CAT.cream, x - 1.5, y + 0.64, z - 1.9, SE);
    colliders.push({ x, z, r: 1.1 });
  }

  // ═══ 10. THE LONG BEACH: dry-docked rowboat + the reeling winch ═════════════
  {
    const { x, z } = SPOTS.rowboat, y = H(x, z), ry = SE - 0.9;
    B.sph(1.5, 8, 4, 0x9c5a3c, x, y + 0.95, z, [1.0, 0.45, 2.2]);
    B.box(2.2, 0.14, 0.5, CAT.cream, x, y + 1.25, z, ry);
    for (const s of [-1, 1]) B.box(1.4, 0.5, 0.4, CAT.wood, x + Math.cos(ry) * 1.1 * s, y + 0.3, z - Math.sin(ry) * 1.1 * s, ry);
    B.cyl(0.07, 0.07, 2.4, 4, CAT.wood, x + 1.4, y + 0.75, z + 0.9, 0, 0, 1.2);
    // OUT OF ORDER used to hang in mid-air over the hull. It now stands on its
    // own post and hangs off a bracket on two chains.
    const rsx = x - 0.4, rsz = z + 2.0, rsy = H(rsx, rsz);
    B.cyl(0.11, 0.13, 2.5, 6, CAT.wood, rsx, rsy + 1.25, rsz);
    B.box(2.2, 0.16, 0.2, CAT.wood, rsx, rsy + 2.5, rsz, SE);
    for (const s of [-1, 1]) B.cyl(0.045, 0.045, 0.42, 4, 0x7d828a, rsx + Math.cos(SE) * 0.7 * s, rsy + 2.29, rsz - Math.sin(SE) * 0.7 * s);
    board('rowboat', rsx, rsy + 1.78, rsz, SE, 2.0, 0.6, CAT.navy);
    addSignFace(rsx, rsz, SE, 2.5, 1.2);
  }
  {
    const { x, z } = SPOTS.winch, y = H(x, z), ry = SE;
    const fx = Math.sin(ry), fz = Math.cos(ry);
    B.box(3.2, 2.2, 2.6, CAT.wood, x, y + 1.1, z, ry);
    B.box(3.6, 0.22, 3.0, CAT.roofRed, x, y + 2.35, z, ry);
    B.cone(2.6, 0.9, 4, CAT.roofRed, x, y + 2.8, z, ry + Math.PI / 4);
    // the winch drum out front, rope leading to the raft
    const dx = x + fx * 2.6, dz = z + fz * 2.6, dy = H(dx, dz);
    for (const s of [-1, 1]) B.box(0.24, 1.1, 0.24, CAT.wood, dx + Math.cos(ry) * 0.8 * s, dy + 0.55, dz - Math.sin(ry) * 0.8 * s);
    B.cyl(0.42, 0.42, 1.6, 8, 0xb08d5a, dx, dy + 1.0, dz, 0, 0, Math.PI / 2 + ry * 0);
    B.cyl(0.08, 0.08, 0.9, 5, CAT.furBlack, dx + 0.95, dy + 1.0, dz, 0, 0, Math.PI / 2);
    colliders.push({ x, z, r: 2.0 });
  }

  // ═══ 11. HIDDEN COVE (the tunnel's far end) ═════════════════════════════════
  {
    const { x, z } = SPOTS.cove, y = H(x, z), ry = SE;
    const fx = Math.sin(ry), fz = Math.cos(ry);
    // two pale rock shoulders + an overhang, so the black mouth reads from far off
    for (const s of [-1, 1]) {
      B.sph(1.75, 6, 4, CAT.cobble, x + Math.cos(ry) * 3.7 * s - fx * 0.6, y + 1.3, z - Math.sin(ry) * 3.7 * s - fz * 0.6, [1, 1.6, 1.2]);
      B.sph(1.15, 5, 3, CAT.cobbleDark, x + Math.cos(ry) * 5.0 * s - fx * 1.6, y + 1.7, z - Math.sin(ry) * 5.0 * s - fz * 1.6, [1, 1.2, 1]);
    }
    B.sph(3.4, 7, 4, CAT.cobble, x - fx * 3.0, y + 2.4, z - fz * 3.0, [1.9, 1.0, 1.1]);
    B.box(7.0, 0.9, 2.6, CAT.cobbleDark, x - fx * 0.9, y + 3.5, z - fz * 0.9, ry, -0.08);
    B.box(3.6, 3.3, 1.6, 0x100d0c, x - fx * 0.2, y + 1.65, z - fz * 0.2, ry);
    GC.box(2.4, 0.12, 0.1, 0x8fe0ff, x + fx * 0.55, y + 3.0, z + fz * 0.55, ry);
    // driftwood, a paddle and a bundle of "supplies"
    for (let i = 0; i < 5; i++) {
      const px = x + R.range(-6, 6), pz = z + R.range(2, 7);
      B.cyl(0.18, 0.22, R.range(1.6, 3.0), 5, 0xa08a72, px, H(px, pz) + 0.2, pz, R() * 3, 0, Math.PI / 2);
    }
    const bx = x + fx * 2.6, bz = z + fz * 2.6, by = H(bx, bz);
    B.box(0.9, 0.7, 0.9, 0xb08a58, bx, by + 0.35, bz, ry + 0.4);
    B.cyl(0.055, 0.055, 2.0, 5, 0xa87f4c, bx + 0.7, by + 0.45, bz + 0.4, 0, 0, 1.25);
    B.box(0.5, 0.14, 0.34, 0xa87f4c, bx + 1.5, by + 0.9, bz + 0.5, ry, 0, 1.25);
    colliders.push({ x: x - fx * 2.2, z: z - fz * 2.2, r: 2.2 });
  }

  // ═══ 12. HARBOUR CRATES (where the fish lives) ══════════════════════════════
  {
    const { x, z } = SPOTS.crates, y = H(x, z);
    const stack = [[0, 0, 0, 1.2], [1.35, 0, 0.25, 1.1], [0.25, 1.22, 0.2, 1.0], [-1.2, 0, 0.6, 1.0]];
    for (const [ox, oy, oz, s] of stack) {
      B.box(1.2 * s, 1.15 * s, 1.2 * s, CAT.wood, x + ox, y + oy + 0.58 * s, z + oz, (ox + oz) * 0.7);
      B.box(1.24 * s, 0.16 * s, 1.24 * s, 0xb2895c, x + ox, y + oy + 0.9 * s, z + oz, (ox + oz) * 0.7);
    }
    B.cyl(0.6, 0.52, 1.1, 8, 0x6b7f8c, x + 2.4, y + 0.55, z - 0.9);
    // a tail hanging out of the top crate
    B.cone(0.22, 0.9, 4, 0xb8ccd6, x + 0.25, y + 2.05, z + 0.2, 0.4, 0, 0.9);
    colliders.push({ x, z, r: 1.8 });
    colliders.push({ x: x + 2.4, z: z - 0.9, r: 0.75 });
  }

  // ═══ 13. PURRLIAMENT SQUARE, SOUTH-EAST CORNER ══════════════════════════════
  // A quarter of the square was tan paving and nothing else. Three authored
  // shapes fill it, and all three are containment jokes: the paper that reports
  // nothing, the tourist who stopped leaving, and one poster repeated until it
  // is architecture.
  {
    const { x, z } = SPOTS.kiosk, y = H(x, z), ry = SE;
    const fx = Math.sin(ry), fz = Math.cos(ry);

    // ── THE DAILY NAP (newspaper kiosk) ──────────────────────────────────────
    B.box(2.9, 2.5, 2.1, CAT.cream, x, y + 1.25, z, ry);
    B.box(3.1, 0.3, 2.3, CAT.teal, x, y + 2.6, z, ry);
    B.cone(2.15, 1.1, 6, CAT.roofRed, x, y + 3.3, z, ry + Math.PI / 6);
    B.sph(0.22, 6, 4, CAT.gold, x, y + 3.95, z);
    B.box(2.4, 1.3, 0.22, 0x1a2230, x + fx * 1.06, y + 1.55, z + fz * 1.06, ry);    // hatch
    B.box(3.0, 0.22, 0.8, CAT.wood, x + fx * 1.35, y + 0.95, z + fz * 1.35, ry);    // counter
    B.box(3.2, 0.24, 1.5, 0xff8f5a, x + fx * 1.9, y + 2.42, z + fz * 1.9, ry, -0.16); // awning
    for (const s of [-1, 1]) B.cyl(0.06, 0.06, 1.5, 4, CAT.cream, x + fx * 2.55 + fz * 1.4 * s, y + 1.7, z + fz * 2.55 - fx * 1.4 * s);
    // stacks of an evening edition that never gets collected
    for (let i = 0; i < 3; i++) {
      const px = x + fx * 1.35 + fz * (i - 1) * 0.85, pz = z + fz * 1.35 - fx * (i - 1) * 0.85;
      for (let k = 0; k < 4 - (i % 2); k++) B.box(0.62, 0.07, 0.46, k % 2 ? 0xf4ecdc : 0xe6dcc4, px, y + 1.1 + k * 0.075, pz, ry + (k % 2 ? 0.1 : -0.08));
    }
    board('kiosk', x + fx * 1.26, y + 2.62, z + fz * 1.26, ry, 2.4, 0.68, CAT.navy);   // on the fascia band
    colliders.push({ x, z, r: 1.7 });

    // ── the tourist who stopped leaving (a bronze, on a bench) ───────────────
    const bx = x + 4.6, bz = z + 1.2, by = H(bx, bz), bry = ry + 1.1;
    const bfx = Math.sin(bry), bfz = Math.cos(bry);
    B.box(3.0, 0.26, 0.86, CAT.cobble, bx, by + 0.58, bz, bry);                      // seat
    B.box(3.0, 0.7, 0.2, CAT.cobble, bx - bfx * 0.42, by + 1.0, bz - bfz * 0.42, bry); // back
    for (const s of [-1, 1]) B.box(0.34, 0.6, 0.8, CAT.cobbleDark, bx + Math.cos(bry) * 1.28 * s, by + 0.3, bz - Math.sin(bry) * 1.28 * s, bry);
    {
      const BRONZE = 0x6d8f79, sxx = bx + Math.cos(bry) * 0.55, szz = bz - Math.sin(bry) * 0.55;
      B.box(0.74, 0.92, 0.52, BRONZE, sxx - bfx * 0.16, by + 1.2, szz - bfz * 0.16, bry, 0.18);   // torso, slumped
      B.sph(0.33, 8, 6, BRONZE, sxx + bfx * 0.12, by + 1.78, szz + bfz * 0.12, [1, 1.08, 0.95]);  // head, lolling
      B.sph(0.2, 6, 4, 0x5a7a66, sxx + bfx * 0.3, by + 1.62, szz + bfz * 0.3, [0.9, 0.55, 0.7]);  // chin on chest
      for (const s of [-1, 1]) B.box(0.26, 0.24, 0.9, BRONZE, sxx + Math.cos(bry) * 0.22 * s + bfx * 0.42, by + 0.82, szz - Math.sin(bry) * 0.22 * s + bfz * 0.42, bry, 0.1);  // thighs
      for (const s of [-1, 1]) B.box(0.24, 0.72, 0.24, BRONZE, sxx + Math.cos(bry) * 0.22 * s + bfx * 0.82, by + 0.38, szz - Math.sin(bry) * 0.22 * s + bfz * 0.82, bry);       // shins
      B.box(0.8, 0.58, 0.34, 0x7a5a3e, sxx + bfx * 1.35, by + 0.29, szz + bfz * 1.35, bry + 0.2);   // his suitcase, still packed
      B.box(0.84, 0.09, 0.38, CAT.gold, sxx + bfx * 1.35, by + 0.29, szz + bfz * 1.35, bry + 0.2);
      B.box(1.5, 0.34, 0.12, CAT.gold, bx + bfx * 0.62, by + 0.2, bz + bfz * 0.62, bry, -0.5);      // plaque in the paving
    }
    colliders.push({ x: bx, z: bz, r: 1.5 });

    // ── the wanted-poster pillar: one poster, twelve times, forever ──────────
    const px2 = x + 1.4, pz2 = z + 4.4, py2 = H(px2, pz2);
    B.cyl(0.68, 0.74, 3.5, 10, CAT.cream, px2, py2 + 1.75, pz2);
    B.cyl(0.9, 0.98, 0.32, 10, CAT.navy, px2, py2 + 0.16, pz2);
    B.cyl(0.92, 0.72, 0.3, 10, CAT.roofRed, px2, py2 + 3.6, pz2);
    B.cone(0.78, 0.62, 8, CAT.roofRed, px2, py2 + 4.05, pz2);
    B.sph(0.18, 6, 4, CAT.gold, px2, py2 + 4.42, pz2);
    for (let i = 0; i < 4; i++) {
      const a = ry + i * Math.PI / 2;
      atlas.face('wanted', 0.94, 1.5, px2 + Math.sin(a) * 0.73, py2 + 2.05, pz2 + Math.cos(a) * 0.73, a);
      atlas.face('wanted', 0.72, 1.15, px2 + Math.sin(a) * 0.73, py2 + 0.86, pz2 + Math.cos(a) * 0.73, a);
    }
    colliders.push({ x: px2, z: pz2, r: 0.95 });
  }

  // ── assemble ───────────────────────────────────────────────────────────────
  const mesh = B.build('containment-scenery');
  scene.add(mesh);
  const glow = G.build('containment-glow', { emissive: 0xffc773, emissiveIntensity: 0.0, vertexColors: true, roughness: 0.45 });
  if (glow) { glow.castShadow = false; scene.add(glow); }
  // the tunnel + cove strip lights need a cold emissive, which is a per-material
  // uniform — so they get their own (tiny, 2-box) mesh rather than glowing amber
  const glowCold = GC.build('containment-glow-cold', { emissive: 0x7fe8d8, emissiveIntensity: 0.0, vertexColors: true, roughness: 0.4 });
  if (glowCold) { glowCold.castShadow = false; scene.add(glowCold); }
  const glowWarm = GW.build('containment-glow-warm', { emissive: 0xffc773, emissiveIntensity: 1.2, vertexColors: true, roughness: 0.5 });
  if (glowWarm) { glowWarm.castShadow = false; glowWarm.receiveShadow = false; scene.add(glowWarm); }

  paintSigns(atlas, ctx);
  const signMesh = atlas.buildMesh();
  scene.add(signMesh);

  // The four exit signs each carry their own text, so they cannot be instances of
  // one geometry — they are four two-quad boards sharing the atlas material
  // (4 draw calls; the alternative was patching UV offsets into a cloned shader,
  // which is not worth it at 9 of a 30-call budget).
  const arrows = arrowSpots.map((a, i) => {
    const front = atlas.plane(a.slot, a.w, a.h);
    const back = atlas.plane(a.slot, a.w, a.h); back.rotateY(Math.PI);
    const m = new THREE.Mesh(mergeGeometries([front, back], false), atlas.material);
    m.castShadow = false; m.name = 'containment-arrow' + i;
    m.position.set(a.x, a.y, a.z); m.rotation.y = a.base;
    scene.add(m);
    return m;
  });

  // the tightest gap any containment prop ended up with, so a regression shows
  const sized = moves.filter((m) => m.hard > 0);
  const worst = sized.slice().sort((a, b) => (a.clear - a.hard) - (b.clear - b.hard))[0];
  const stats = {
    tris: B.tris(), glowTris: G.tris() + GC.tris() + GW.tris(), signs: atlas.planes.length,
    colliders: colliders.length, foreignColliders: claimedAtStart,
    tightest: worst ? `${worst.key} clear=${worst.clear} footprint=${worst.hard}` : 'n/a',
    intersecting: sized.filter((m) => m.clear < m.hard).map((m) => `${m.key}:${(m.clear - m.hard).toFixed(2)}`),
    spots: Object.fromEntries(Object.entries(SPOTS).map(([k, v]) => [k, [v.x, v.z]])),
  };
  console.warn('[catContainment/square]', JSON.stringify({
    kiosk: [SPOTS.kiosk.x, SPOTS.kiosk.z], bench: [SPOTS.kiosk.x + 4.6, SPOTS.kiosk.z + 1.2],
    pillar: [SPOTS.kiosk.x + 1.4, SPOTS.kiosk.z + 4.4],
    exits: arrowSpots.map((a) => [+a.x.toFixed(1), +a.z.toFixed(1)]),
  }));
  console.warn('[catContainment/scenery]', JSON.stringify(stats));
  console.warn('[catContainment/place]', JSON.stringify(moves));
  return { mesh, glow, glowCold, glowWarm, signMesh, atlas, arrows, arrowSpots, colliders, tris: B.tris(), stats };
}

function pawHeadboard(B, x, y, z, ry) {
  B.sph(0.3, 6, 3, 0xf0c8a0, x, y, z, [1, 1, 0.35]);
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI * 0.78 + i * Math.PI * 0.2;
    B.sph(0.11, 5, 3, 0xf0c8a0, x + Math.cos(a) * 0.42 * Math.cos(ry), y + 0.38 + Math.sin(a) * 0.2, z - Math.cos(a) * 0.42 * Math.sin(ry), [1, 1, 0.35]);
  }
}


// ── The SIX exit signs of Purrliament Square ─────────────────────────────────
// Motorway green, motorway white, one enormous pictogram arrow each. Six posts
// on the ring means three faces and three backs in any one frame of the square —
// i.e. you can SEE them disagreeing without walking up and reading a word.
// Index order matches the ring order; sign 5 (the honest one) is navy, and the
// only one that has stopped pretending to be an arrow.
const HW_GREEN = '#12a24f', HW_GREEN_D = '#0c8a41';
export const EXIT_SIGNS = [
  { slot: 'arrow0', bg: HW_GREEN, big: 'EXIT', sub: null, arrow: 'right',
    line: 'EXIT →, in green, official, and unarguable. It points back into the square.' },
  { slot: 'arrow1', bg: HW_GREEN, big: 'EXIT', sub: 'other way', arrow: 'left',
    line: '← EXIT (other way). It points at the sign you just read.' },
  { slot: 'arrow2', bg: HW_GREEN_D, big: 'EXIT?', sub: 'no', arrow: 'up',
    line: 'EXIT? ↑ (no). Somebody has answered their own signage. In paint.' },
  { slot: 'arrow3', bg: HW_GREEN, big: 'EXIT', sub: 'really', arrow: 'right',
    line: 'EXIT → (really). Identical to the first one. Pointing the opposite way.' },
  { slot: 'arrow4', bg: HW_GREEN_D, big: 'ALL EXITS', sub: 'this way', arrow: 'left',
    line: 'ALL EXITS ← (this way). All of them. Into the middle of the square.' },
  { slot: 'arrow5', bg: '#1d3557', big: 'YOU ARE HERE.', sub: 'forever', arrow: null,
    line: 'YOU ARE HERE. FOREVER. This one has stopped pretending, and it is the tidiest of the six.' },
];

function drawExitSign(g, w, h, a) {
  panel(g, w, h, a.bg, '#ffffff', 16);
  if (!a.arrow) {                                  // the honest sign: text only
    fit(g, a.big, w / 2, h * 0.38, 86, '#ffffff', w - 54);
    fit(g, a.sub.toUpperCase(), w / 2, h * 0.76, 56, '#ffd86b', w - 70);
    return;
  }
  const left = a.arrow === 'left';
  const tx = left ? w * 0.63 : w * 0.37;           // text on the far side of the arrow
  const ax = left ? w * 0.21 : w * 0.79, ay = h * 0.47;
  fit(g, a.big, tx, a.sub ? h * 0.42 : h * 0.50, 96, '#ffffff', w * 0.50);
  if (a.sub) fit(g, a.sub.toUpperCase(), tx, h * 0.80, 40, '#d8f0dd', w * 0.50);
  bigArrow(g, ax, ay, a.arrow, h * 0.82, '#ffffff');
}

// ── Sign artwork ─────────────────────────────────────────────────────────────
export function allocSlots(atlas) {
  atlas.alloc('schedule', 4, 2);
  atlas.alloc('posters', 4, 2);
  atlas.alloc('bus', 2, 2);
  atlas.alloc('beach', 4, 1);
  atlas.alloc('beach_back', 4, 1);
  for (let i = 0; i < EXIT_SIGNS.length; i++) atlas.alloc('arrow' + i, 2, 1);
  atlas.alloc('tickets', 2, 1);
  atlas.alloc('suitcase', 2, 1);
  atlas.alloc('closed', 2, 1);
  atlas.alloc('tunnel', 2, 1);
  atlas.alloc('guest', 2, 1);
  atlas.alloc('rowboat', 2, 1);
  atlas.alloc('kiosk', 2, 1);
  atlas.alloc('schedule_back', 2, 1);
  atlas.alloc('wanted', 1, 1);
}

export function paintSigns(atlas, ctx) {
  drawSchedule(atlas, 0);
  drawScheduleBack(atlas);
  drawPosters(atlas, false, ctx);
  drawWanted(atlas, false, ctx);
  atlas.draw('kiosk', (g, w, h) => {
    panel(g, w, h, '#f7efdc', '#1d3557', 8);
    fit(g, 'THE DAILY NAP', w / 2, h * 0.38, 62, '#1d3557', w - 26);
    fit(g, 'today: nothing happened · same as yesterday', w / 2, h * 0.76, 24, '#7a6a52', w - 26, 'italic');
  });
  atlas.draw('bus', (g, w, h) => {
    panel(g, w, h, '#12304a', '#f7efdc', 10);
    txt(g, 'BUS TIMETABLE', w / 2, 34, 26, '#ffd86b');
    g.strokeStyle = '#3d6a8e'; g.lineWidth = 2;
    const rows = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    rows.forEach((r, i) => {
      const y = 74 + i * 44;
      txt(g, r, 40, y, 24, '#f7efdc', 'bold', 'left');
      txt(g, '—', w - 46, y, 30, '#ff8f9c', 'bold', 'right');
      g.beginPath(); g.moveTo(24, y + 20); g.lineTo(w - 24, y + 20); g.stroke();
    });
    fit(g, 'service resumes never', w / 2, h - 34, 19, '#9fc4dd', w - 40, 'italic');
  });
  // Four signs that disagree with each other. All of them point at the square.
  for (const a of EXIT_SIGNS) atlas.draw(a.slot, (g, w, h) => drawExitSign(g, w, h, a));
  atlas.draw('tickets', (g, w, h) => {
    panel(g, w, h, '#1d3557', '#ffd86b', 8);
    fit(g, 'TICKETS  ·  ENQUIRIES  ·  DREAMS', w / 2, h / 2, 44, '#ffd86b', w - 30);
  });
  atlas.draw('suitcase', (g, w, h) => {
    panel(g, w, h, '#f7efdc', '#1d3557', 8);
    const name = (ctx?.params?.get?.('name') || 'THE HUMAN').toUpperCase().slice(0, 18);
    fit(g, `PACKED FOR: ${name}`, w / 2, h * 0.36, 40, '#1d3557', w - 26);
    fit(g, 'NOT FOR SALE · NOT FOR LEAVING', w / 2, h * 0.72, 26, '#c94b3a', w - 26);
  });
  atlas.draw('beach', (g, w, h) => {
    panel(g, w, h, '#c94b3a', '#f7efdc', 14);
    fit(g, 'NOT-AN-EXIT BEACH', w / 2, h * 0.42, 108, '#ffffff', w - 60);
    fit(g, 'a lovely beach  ·  no boats  ·  no swimming  ·  no', w / 2, h * 0.78, 34, '#ffe0c8', w - 60, 'italic');
  });
  atlas.draw('beach_back', (g, w, h) => {
    panel(g, w, h, '#c94b3a', '#f7efdc', 14);
    pawprint(g, 96, h * 0.5, 52, '#f7efdc');
    pawprint(g, w - 96, h * 0.5, 52, '#f7efdc');
    fit(g, 'YOU ARE STILL HERE', w / 2, h * 0.44, 92, '#ffffff', w - 300);
    fit(g, 'and that is wonderful news for everybody', w / 2, h * 0.79, 32, '#ffe0c8', w - 260, 'italic');
  });
  atlas.draw('closed', (g, w, h) => {
    panel(g, w, h, '#1d3557', '#ffd86b', 8);
    fit(g, 'BEACH CLOSED', w / 2, h * 0.34, 58, '#ffd86b', w - 26);
    fit(g, 'for the season. all of them.', w / 2, h * 0.7, 30, '#cfe2f0', w - 26, 'italic');
  });
  atlas.draw('tunnel', (g, w, h) => {
    panel(g, w, h, '#3a3f46', '#c8ccd2', 8);
    fit(g, 'GYM STORAGE', w / 2, h * 0.34, 52, '#e8ecf0', w - 26);
    fit(g, 'absolutely not a tunnel', w / 2, h * 0.72, 30, '#9aa4ae', w - 26, 'italic');
  });
  atlas.draw('guest', (g, w, h) => {
    panel(g, w, h, '#f2c14e', '#7a5518', 8);
    fit(g, 'GUEST ROOM  ·  YOURS!', w / 2, h * 0.36, 40, '#4a3410', w - 26);
    fit(g, 'permanently reserved', w / 2, h * 0.73, 26, '#7a5518', w - 26, 'italic');
  });
  atlas.draw('rowboat', (g, w, h) => {
    panel(g, w, h, '#f7efdc', '#8d5a34', 8);
    fit(g, 'OUT OF ORDER', w / 2, h * 0.36, 48, '#c94b3a', w - 26);
    fit(g, 'since 1998 · parts on order', w / 2, h * 0.73, 26, '#6b4a30', w - 26, 'italic');
  });
}

/**
 * The board agrees with the pier: NOTHING DEPARTS. The big line is dashes and a
 * CANCELLED stamp (and it never changes), the second line is the punchline —
 * ARRIVALS ONLY · ON TIME — and the joke that rots with each visit to the ticket
 * window lives in the small print, where small print belongs.
 *   stage 0: "aspirational" · 1: soon™ · 2: NEVER (typo?)
 */
export function drawSchedule(atlas, stage) {
  const SMALL = [
    'small print: the 15:00 is "aspirational". it has been aspirational since 1994',
    'small print: next departure soon™ · thank you for your patience',
    'small print: next departure NEVER · (typo? we are looking into it)',
  ];
  const small = SMALL[Math.min(2, stage)];
  atlas.draw('schedule', (g, w, h) => {
    panel(g, w, h, '#10283e', '#f7efdc', 12);
    g.fillStyle = '#0a1c2c'; g.fillRect(22, 22, w - 44, h - 44);
    txt(g, 'ARRIVALS PIER  ·  FERRY OFFICE', w / 2, 48, 28, '#7fb6dd');
    g.strokeStyle = '#2b5a80'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(40, 68); g.lineTo(w - 40, 68); g.stroke();

    // ── LEFT: the departure time, REDACTED. Not two neat grey bars (which read
    //    as text that failed to load) — a scribble of black marker gone over
    //    four times, with one digit still peeking out from under the end of it.
    const LX = w * 0.245, LY = 152;
    txt(g, 'DEPARTURES', LX, 104, 38, '#f7efdc');
    g.fillStyle = '#dfe9f0'; g.fillRect(LX - 168, LY - 40, 336, 80);         // the plate
    txt(g, '15:00', LX, LY, 66, '#14212c');                                   // what it said
    g.save();                                                                 // …and the marker
    g.strokeStyle = '#0d0d10'; g.lineCap = 'round'; g.lineJoin = 'round';
    const strokes = [[-150, -14, 128, 18], [-142, 16, 138, -12], [-156, 2, 150, 2], [-120, -26, 104, 26]];
    for (const [x0, y0, x1, y1] of strokes) {
      g.lineWidth = 26 + ((x0 + y1) % 7);
      g.beginPath(); g.moveTo(LX + x0, LY + y0); g.lineTo(LX + x1, LY + y1); g.stroke();
    }
    g.restore();
    txt(g, '0', LX + 148, LY + 6, 54, '#14212c');                             // the peeking digit
    fit(g, 'redacted by the harbourmaster (a cat)', LX, LY + 68, 21, '#8fb0c8', 320, 'italic');

    // ── RIGHT: a giant painted "→ HOME", painted over with a red X. Pure shape:
    //    you know what happened to the service before you read anything.
    const RX = w * 0.715, RY = 150;
    g.save(); g.globalAlpha = 0.92;
    bigArrow(g, RX + 96, RY, 'right', 150, '#f2e4c4');
    g.restore();
    fit(g, 'HOME', RX - 96, RY, 64, '#f2e4c4', 200);
    crossOut(g, RX + 20, RY, 210, '#e0322a', 30);

    // ── …and the stamp that has been on this board since 1994
    g.save();
    g.translate(w / 2, 300); g.rotate(-0.055);
    g.strokeStyle = '#ff5f52'; g.lineWidth = 7;
    g.strokeRect(-w * 0.31, -48, w * 0.62, 96);
    fit(g, 'CANCELLED', 0, 2, 108, '#ff5f52', w * 0.56);
    g.restore();
    // the punchline, promoted: the ferry runs — one way
    g.fillStyle = '#123b2c'; g.fillRect(30, h - 142, w - 60, 112);
    fit(g, 'ARRIVALS ONLY  ·  ON TIME', w / 2, h - 108, 50, '#7fe3a8', w - 90);
    fit(g, '06:00 · 09:00 · 12:00 · 15:00 · 18:00 · 21:00 — every three hours, forever',
      w / 2, h - 66, 26, '#9fe0c0', w - 220);
    fit(g, small, w / 2, h - 34, 23, '#9fc4dd', w - 250, 'italic');
    pawprint(g, 54, h - 54, 20, '#2b5a80');
    pawprint(g, w - 54, h - 54, 20, '#2b5a80');
  });
}

/**
 * The BACK of the schedule board. It used to be the identical CANCELLED artwork,
 * which is how one board came to look like three. It is now the only completely
 * honest sign on Cat Island, and it is a big green arrow pointing down.
 */
export function drawScheduleBack(atlas) {
  atlas.draw('schedule_back', (g, w, h) => {
    panel(g, w, h, '#17603f', '#eafbef', 12);
    bigArrow(g, w * 0.20, h * 0.50, 'down', h * 0.66, '#eafbef');
    fit(g, 'ARRIVALS', w * 0.62, h * 0.36, 78, '#ffffff', w * 0.62);
    fit(g, 'ALWAYS', w * 0.62, h * 0.72, 54, '#9fe0c0', w * 0.62);
  });
}

/** The single MISSING poster, repeated up the wanted pillar in the square. */
export function drawWanted(atlas, describeYou, ctx) {
  const name = (ctx?.params?.get?.('name') || 'THE HUMAN').toUpperCase().slice(0, 14);
  atlas.draw('wanted', (g, w, h) => {
    panel(g, w, h, describeYou ? '#ffe0dc' : '#f7efdc', '#c94b3a', 7);
    txt(g, 'MISSING', w / 2, 30, 30, '#c94b3a');
    figure(g, w / 2, 46, h * 0.54, '#2b2118', { suitcase: true, smile: describeYou ? '#ffe0dc' : null });
    fit(g, describeYou ? name : 'HUMAN', w / 2, h - 44, 30, '#2b2118', w - 22);
    fit(g, describeYou ? 'IF FOUND: keep it' : 'if found: keep it', w / 2, h - 18, 18, '#8d3a2c', w - 22, 'italic');
  });
}

/**
 * The "MISSING: HUMAN" wall — TWELVE identical posters in a 4 × 3 grid, each one
 * a big black silhouette of a person with a suitcase. Four different notices
 * with four different jokes needed six-pixel sentences to land; twelve of the
 * same poster lands as a pattern, from across the street, with no reading at
 * all. (The jokes moved to the interaction text, where they are actually read.)
 * After day 1 the paper turns pink, the figure is given a smile, and your own
 * name goes on all twelve.
 */
export function drawPosters(atlas, describeYou, ctx) {
  const name = (ctx?.params?.get?.('name') || 'THE HUMAN').toUpperCase().slice(0, 14);
  atlas.draw('posters', (g, w, h) => {
    panel(g, w, h, '#e9dcc0', '#8d5a34', 10);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(150,110,70,${0.05 + Math.random() * 0.1})`; g.fillRect(Math.random() * w, Math.random() * h, 5, 4); }
    const COLS = 4, ROWS = 3, PAD = 18, TOP = 42;
    const cw = (w - PAD * (COLS + 1)) / COLS, ch = (h - TOP - PAD * ROWS) / ROWS;
    txt(g, 'COMMUNITY NOTICES', w / 2, 26, 26, '#5a3d22');
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const cx = PAD + c * (cw + PAD) + cw / 2, cy = TOP + r * (ch + PAD) + ch / 2;
      const tilt = (((i * 37) % 7) - 3) * 0.014;      // hand-pinned, not printed
      g.save(); g.translate(cx, cy); g.rotate(tilt);
      g.fillStyle = 'rgba(0,0,0,.20)'; g.fillRect(-cw / 2 + 4, -ch / 2 + 5, cw, ch);
      g.fillStyle = describeYou ? '#ffdcd8' : '#f7efdc'; g.fillRect(-cw / 2, -ch / 2, cw, ch);
      g.strokeStyle = '#c94b3a'; g.lineWidth = 3; g.strokeRect(-cw / 2, -ch / 2, cw, ch);
      fit(g, 'MISSING', 0, -ch / 2 + 20, 26, '#c94b3a', cw - 14);
      figure(g, 0, -ch / 2 + 32, ch * 0.56, '#241c14', { suitcase: true, smile: describeYou ? '#ffdcd8' : null });
      fit(g, describeYou ? name : 'HUMAN', 0, ch / 2 - 20, 27, '#241c14', cw - 14);
      if (describeYou) {                                 // a stamp across every one
        g.save(); g.rotate(-0.22);
        g.strokeStyle = 'rgba(201,75,58,.85)'; g.lineWidth = 3;
        g.strokeRect(-cw * 0.40, -12, cw * 0.80, 30);
        fit(g, 'KEEP IT', 0, 3, 24, 'rgba(201,75,58,.9)', cw * 0.72);
        g.restore();
      }
      g.restore();
      g.beginPath(); g.fillStyle = '#c94b3a'; g.arc(cx, cy - ch / 2 + 8, 7, 0, 7); g.fill();  // pin
    }
  });
  drawWanted(atlas, describeYou, ctx);
}
