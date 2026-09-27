// SUGAR-GLIDER BIRDS — a V of 5–7 that sweeps across the sky every half minute,
// wings flapping in a vertex-shader hook (one draw call for the whole flock).
//
// The hard part is that this camera has NO SKY. It looks down 0.64 rad with a
// 15° half-FOV — and under Candyland's lollipops the occlusion dolly pulls it
// to ~20 u and tilts it to ~46° — so the top of the frame points 30° BELOW the
// horizon. A point h units up is inside the frustum only while its distance
// from the lens D satisfies (camY − h) / D ≥ tan(30°); at camY ≈ 18 that means
// a 14-u-high flock has to be within FIVE units of the camera to be on screen
// at all. Pass 2 sidestepped this by flying at 5–8 u and toasting anyway, so
// the message said "a V of sugar-gliders" and the frame showed lollipops.
//
// Pass 3 asked the lens and took the best altitude it could frame — which in
// the forest and the meadow was 6.5 u, i.e. HEAD HEIGHT, and the frames showed
// a scatter of birds hanging among the lollipops while a toast announced a
// flypast. Pass 4 makes the altitude non-negotiable: the V always crosses at
// 14–18 u over the ground, the search only chooses WHERE along the lens axis it
// crosses (project the candidate, take the one highest-but-inside the frame),
// and the bearing is chosen from seven candidates by which one grazes the least
// scenery, so the formation never threads itself through a candy-cane pole.
// Bird scale and formation spread size off the true viewing distance. The toast
// still fires only when the flock projects inside the viewport: if the lens
// cannot contain a real flypast, the birds go over unseen and unadvertised.
//
// They also never fly through a roof: every enterable room published by the
// candy, palace and cat architecture systems is a no-fly cylinder, and the
// flock climbs to 14 u clear over any footprint it crosses.
import * as THREE from 'three';
import { rng, hash } from '../../../core/util.js';
import { Pool, ShadowField, part, mergeParts, shadeAxis, fanXZ, applyFlap, buildingRects, OBSTACLES, TAU, uiToast } from './common.js';

// Critique fix (same one the butterflies got): near-white hues on flat
// single-polygon wings made the flock read as white origami shards skimming the
// treetops. Sugar-gliders are CANDY animals — saturated backs, pale bellies —
// and their wings are rounded, cupped and carry a real tip gradient, with a
// resting dihedral so a still frame never catches one as a flat card.
const HUES = [0xff5c8d, 0x3aa8ff, 0xffd84a, 0x5be2a8, 0xb35bff];

// Swept rounded glider wing, in the XZ plane, extending along +x * side.
const WING = [
  [0.10, 0.13], [0.27, 0.17], [0.47, 0.16], [0.64, 0.10], [0.76, 0.00],
  [0.65, -0.10], [0.47, -0.15], [0.29, -0.17], [0.12, -0.14],
];
const CUP = 0.13;
function cup(g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.abs(p.getX(i)) * CUP);
  g.computeVertexNormals();
  return g;
}

function wing(side) {
  const g = cup(fanXZ(WING.map(([x, z]) => [x * side, z])));
  const p = part(g, { tag: side });
  // WAVE 5 birds-flicker polish: the old 0x5b4470 tips turned every hue near-black at range, and over
  // the strait (no bright sky behind) the V read as dark pins — the tint now survives to the tip
  shadeAxis(p, 'x', 0.1, 0.76, 0xfff6f0, 0xa58cc0);
  return p;
}

function birdGeo() {
  const body = part(new THREE.SphereGeometry(1, 6, 4), { scale: [0.125, 0.115, 0.34] });
  shadeAxis(body, 'y', -0.11, 0.11, 0x9d8bb2, 0xffffff);   // saturated back, pale belly (lifted, polish)
  const head = part(new THREE.SphereGeometry(1, 5, 3), { pos: [0, 0.05, 0.31], scale: 0.125 });
  shadeAxis(head, 'y', -0.1, 0.12, 0xd8c8dc, 0xfffaf4);
  const parts = [
    body, head,
    part(new THREE.ConeGeometry(0.045, 0.17, 4, 1, true), { pos: [0, 0.04, 0.45], rot: [Math.PI / 2, 0, 0], color: 0xff9a3d }),
    part(cup(fanXZ([[0, -0.28], [0.17, -0.64], [0, -0.5], [-0.17, -0.64]])), { color: 0xb9a4d2 }),
    wing(1), wing(-1),
  ];
  // eyes — twelve pale shapes with no faces was most of why the flock read as paper
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.SphereGeometry(1, 4, 2), { pos: [s * 0.075, 0.075, 0.375], scale: 0.045, color: 0xfffdf8 }));
    parts.push(part(new THREE.TetrahedronGeometry(0.03), { pos: [s * 0.082, 0.075, 0.405], color: 0x2b1c2a }));
  }
  return mergeParts(parts);
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
const _pt = new THREE.Vector3();
const _o = new THREE.Object3D();          // (polish) per-bird matrix in YXZ: yaw, then a LOCAL pitch, then roll

export function create(env) {
  const { ctx, world, scene } = env;
  const r = rng(hash('candy-sugargliders'));
  const N = 7;                                   // the V is 5–7 birds; 7 slots is the cap
  const mat = applyFlap(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide,
  }), 0.62, { key: 'candy-glider-v3', dihedral: 0.42, backShade: 0.84 });
  const pool = new Pool(scene, birdGeo(), mat, N, { name: 'sugar-gliders', cast: true, attrs: { aPhase: 1, aRate: 1, aAmp: 1 } });
  // WAVE 5 birds-flicker (Ben: "rainbow coloured birds that fly over the water
  // were disappearing and reappearing"). The V is a SKY event, not ground
  // wildlife, so it lives in its own root instead of the candy-creatures group:
  // that group is switched off whole the moment the lens crosses x = 40 (the
  // ferry's last third, the Arrivals Pier, Cat Island's west shore), which
  // deleted a flock in mid-frame over the strait. creatures.js lets a crossing
  // already under way fly on to its end (coast()). Same no-occlude flags as the
  // group, so the camera never dollies for a glider and the cut never eats one.
  const sky = new THREE.Group();
  sky.name = 'candy-creatures-sky';
  sky.userData.noOcclude = true; sky.userData.noInstOcclude = true; sky.userData.noFade = true;
  ctx.scene.add(sky);
  sky.add(pool.mesh);
  const aPhase = pool.attr('aPhase').array, aRate = pool.attr('aRate').array, aAmp = pool.attr('aAmp').array;
  // …and so do its shadows: a claim on the island's shared decal pool lived
  // under the same gate and blinked off the frosting with it. Its own 7-slot
  // pool in the sky root (+1 draw call) keeps the V and its shadows together.
  const skyShade = new ShadowField(sky, N);
  skyShade.pool.mesh.name = 'sugar-glider-shadows';
  const shade = skyShade.claim(N);
  const birds = [];
  for (let i = 0; i < N; i++) {
    // slot in the V, recomputed per crossing (the flock size changes)
    birds.push({ along: 0, lat: 0, ph: r() * TAU, scale: 0.92 + r() * 0.22, bob: r() * TAU, tr: 0, tp: 0 });
    aPhase[i] = r() * TAU; aRate[i] = 8 + r() * 3; aAmp[i] = 0.8 + r() * 0.45;
    pool.tint(i, HUES[Math.floor(r() * HUES.length)]);
  }
  pool.attr('aPhase').needsUpdate = true; pool.attr('aRate').needsUpdate = true; pool.attr('aAmp').needsUpdate = true; pool.flushColors();

  const route = { ax: 0, az: 0, dir: 0, alt: 16, active: false, t: 0, dur: 20, gap: 0, size: 6, side: 0, ground: 2, scale: 1.6, spread: 2.0, len: 150 };
  let lastPX = 0, lastPZ = 0, toastCd = 0, toasted = false, rects = null, lift = 0, wasVisible = false;
  // authoring hook: force a crossing to be at progress t, two frames from now
  // (the lens has to settle after a teleport before the aim means anything)
  let cueT = null, cueWait = 0;
  // the lens last frame: a re-aim is for a TELEPORT (one-frame jump), never for drift
  let lastCX = NaN, lastCZ = NaN, lastT = 0;
  let coasting = false;                         // creatures.js gate closed: finish the crossing, start nothing

  // ── in-frame guard (WAVE 5 birds-flicker) ──────────────────────────────────
  // A flock may only appear or vanish OFF-SCREEN. Round 4 re-aimed the V every
  // time the lens had drifted 20 u from where the crossing was solved — on the
  // Sugarfin that is every ~9 s of a steady crossing — and each re-aim lifted
  // the whole V out of the sky and dropped it back mid-frame (route.t ≈ 0.4). A
  // crossing now starts where no bird is in the frustum (slid back along its
  // line) and only ends once every bird has left it.
  const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
  function frustumNow() {
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    return _fr.setFromProjectionMatrix(_pm);
  }
  /** Any bird of the current V inside the (padded) frustum at progress rt? */
  function flockSeen(rt, t) {
    const fr = frustumNow();
    const LEN = route.len || 150;
    const fx = Math.sin(route.dir), fz = Math.cos(route.dir);
    const rx = Math.cos(route.dir), rz = -Math.sin(route.dir);
    const hx = route.ax - fx * LEN * 0.5 + rx * route.side + fx * LEN * rt;
    const hz = route.az - fz * LEN * 0.5 + rz * route.side + fz * LEN * rt;
    const boost = flockBoost(hx, hz);
    for (let i = 0; i < route.size; i++) {
      const b = birds[i];
      const w = (b.lat + Math.sin(t * 0.7 + b.ph) * 0.5) * boost;
      const x = hx + fx * b.along * boost + rx * w, z = hz + fz * b.along * boost + rz * w;
      // 3 u of pad: the lens may still move this frame (systems update before the camera)
      _sph.center.set(x, Math.max(route.ground, world.height(x, z)) + route.alt + lift, z);
      _sph.radius = 0.8 * b.scale * route.scale * boost + 3;
      if (fr.intersectsSphere(_sph)) return true;
    }
    return false;
  }
  /** (polish) the formation's minimum-screen-size factor for a head at (hx, hz): a wingspan
   *  (≈ 1.5 × scale) stays ≥ ~3.5 % of the frame height; capped at 2.4×. */
  function flockBoost(hx, hz) {
    const cp = ctx.camera.position;
    const ty = Math.max(route.ground, world.height(hx, hz)) + route.alt + lift;
    const dh = Math.hypot(hx - cp.x, ty - cp.y, hz - cp.z);
    const tanH = Math.tan((ctx.camera.fov || 40) * Math.PI / 360);
    return Math.min(2.4, Math.max(1, (0.046 * dh * tanH) / Math.max(0.3, route.scale * 0.95)));
  }
  function endRoute() {
    route.active = false; route.gap = 5 + r() * 10;
    pool.mesh.visible = false; shade.hideAll(); skyShade.flush(); wasVisible = false;
  }

  /** ≥14 u of air over every building footprint this system can see. */
  function clearanceAt(x, z) {
    if (!rects) rects = buildingRects(ctx);
    let need = 0;
    for (let k = 0; k < rects.length; k++) {
      const b = rects[k];
      const d = Math.hypot(x - b.x, z - b.z);
      const R = b.rad + 6;
      if (d < R) {
        const n = 14.5 * Math.min(1, (R - d) / 6);
        if (n > need) need = n;
      }
    }
    return need;
  }

  // ── aiming a flypast at a lens that points at the floor ────────────────────
  // Round 2 solved for "the highest altitude this lens can frame" and, when the
  // camera dollied in under the lollipops, happily settled for 6.5 u — which is
  // head height, and the frames showed a scatter of birds standing around in
  // mid-air among the props with a toast claiming a flypast. Round 3 inverts
  // the priority: THE ALTITUDE IS NOT NEGOTIABLE. The V always crosses at
  // 14–18 u over the ground (the brief's 12–20 band); the search only chooses
  // WHERE along the lens axis it crosses, by projecting the candidate point and
  // taking the one that lands highest-but-inside the frame. If no distance can
  // frame it, the flock still goes over at altitude and simply is not
  // advertised — an unseen high pass beats a visible impossible one.
  // 16–19.5 u, not 12–14: Candyland's grandmother gummy bears top out near 20 u
  // and the Gummy Forest canopy is 12–16, so a "12 u flypast" over the forest is
  // a flock flying THROUGH the trees. The brief's band is 12–20; this sits at
  // the top of it, which is the only part of the band that is actually sky.
  const ALT_MIN = 16, ALT_MAX = 19.5;
  const aims = [];
  function aimHigh(alt) {
    const cam = ctx.camera;
    _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const hl = Math.hypot(_dir.x, _dir.z) || 1;
    const fx = _dir.x / hl, fz = _dir.z / hl;
    aims.length = 0;
    // Probed the real village lens: camera y 24.9, pitch 0.64 rad, FOV 30. A
    // point 17 u over the ground projects to ndcY 0.88 at D = 8 and 2.35 at
    // D = 62 — i.e. the ONLY horizontal distance at which a legal flypast is
    // inside this frustum at all is right overhead, 5–14 u out. Searching from
    // D = 8 upward and aiming at mid-screen therefore picked the farthest,
    // most off-screen option every time, which is why the village frames kept
    // coming back with one bird in the corner or none. So: search from 5, and
    // aim at the TOP of the frame, where a thing you look up at belongs.
    for (let D = 5; D <= 62; D += 1.5) {
      const x = cam.position.x + fx * D, z = cam.position.z + fz * D;
      const g = Math.max(0, world.height(x, z));
      _pt.set(x, g + alt, z).project(cam);
      const inFront = _pt.z > -1 && _pt.z < 1;
      // …but not INTO the HUD: the objective card, the zone banner and the
      // toast own the top ~14% of the frame (ndcY 0.72–1.0), and aiming at
      // 0.72 parked the whole formation behind them. 0.5 is the highest band
      // that is still picture.
      const score = (inFront ? 2 : -2) - Math.abs(_pt.y - 0.50) - Math.abs(_pt.x) * 0.35;
      aims.push({ score, x, z, g, D, dist: Math.hypot(D, cam.position.y - (g + alt)) });
    }
    aims.sort((a, b) => b.score - a.score);
    return aims;
  }
  /**
   * How much solid scenery a crossing on this line would graze. Candyland's
   * grandmother gummy bears reach ~20 u, i.e. right through the flypast band,
   * so they count for much more than a lamp post: the round-3 forest frame had
   * a glider's wing buried in a grandmother's head. Trunk colliders cover
   * everything else (candy canes, lollipop sticks, signposts, fences).
   */
  let grans = null;
  function lineCost(ax, az, dir) {
    const fx = Math.sin(dir), fz = Math.cos(dir);
    let cost = 0;
    const g = OBSTACLES.grid;
    if (g) cost += g.lineCost(ax - fx * 26, az - fz * 26, ax + fx * 26, az + fz * 26, 2.6, 26);
    if (grans === null) grans = ctx.systems.candyVegetation?.grandmothers || [];
    for (let i = 0; i < grans.length; i++) {
      const b = grans[i];
      // perpendicular distance to the crossing line, clamped to its length
      const wx = b.x - ax, wz = b.z - az;
      const t = Math.max(-26, Math.min(26, wx * fx + wz * fz));
      const d = Math.hypot(wx - fx * t, wz - fz * t);
      if (d < 7) cost += 14 * (1 - d / 7);            // a 20 u bear is a wall
    }
    return cost;
  }
  function startRoute(offscreen = false) {
    const cam = ctx.camera;
    route.size = 5 + Math.floor(r() * 3);                       // 5, 6 or 7
    const alt = ALT_MIN + r() * (ALT_MAX - ALT_MIN);
    // Search aim point AND bearing together: the five best-framed crossings
    // crossed with seven bearings, scored on framing minus what each line would
    // fly through. A slightly worse-framed pass that misses the scenery beats a
    // perfectly framed one that puts a wing inside a gummy bear.
    const cands = aimHigh(alt);
    let pick = cands[0], bestDir = 0, bestScore = -Infinity, bestObstacle = 0;
    for (let c = 0; c < Math.min(6, cands.length); c++) {
      const a = cands[c];
      const base = Math.atan2(_dir.x, _dir.z) + Math.PI / 2;
      for (let k = 0; k < 7; k++) {
        const d = base + (k - 3) * 0.22;
        // FRAMING DOMINATES. The obstacle term is capped at 3 points so it can
        // only break ties between comparably-framed crossings — weighted any
        // harder it drags the whole flypast out over an empty field, which is
        // how the first village frame ended up with one bird in the corner.
        const obs = lineCost(a.x, a.z, d);
        const sc = a.score * 4 - Math.min(6, obs) * 0.5;
        if (sc > bestScore) { bestScore = sc; pick = a; bestDir = d; bestObstacle = obs; }
      }
    }
    route.alt = Math.max(12, Math.min(20, alt));
    route.ax = pick.x; route.az = pick.z; route.ground = pick.g;
    // size the birds off the viewing distance so the V reads at ~15–20% of the
    // frame whether it goes over at 13 u or 34
    // Scale, spread and travel all key off the true viewing distance, because a
    // crossing 9 u overhead and one 40 u out have to read as the same bird.
    route.scale = Math.max(0.62, Math.min(2.2, pick.dist * 0.05));
    // A close pass covers the frame in a blink at 7 u/s, so shorten its run.
    route.len = Math.max(50, Math.min(150, pick.dist * 5));
    // Round 2 used a deliberately shallow chevron (arms only 19° off the
    // travel axis) to fight the lens, and the result read as a scatter of loose
    // birds rather than a formation. A V is recognised by its ANGLE: the arms
    // now trail at ~36°, and the whole formation is tighter, so five birds are
    // unmistakably one shape instead of five separate animals.
    // The V's ARMS project onto screen-vertical, and this lens has only 15° of
    // that. Close overhead the formation must shrink or half of it hangs off
    // the top edge — which is what "a scatter, not a V" looked like.
    route.spread = route.scale;          // (polish) spacing keeps pace with the bird size, or big birds merge
    route.dir = bestDir + (r() - 0.5) * 0.10;
    route.dur = 17 + r() * 7;
    route.side = (r() - 0.5) * 1.2;
    // If even the best line still threads a grandmother gummy bear or a stand
    // of canes, DON'T FLY IT. Under the Gummy Forest canopy there is no sky to
    // cross — a flypast that has to clip a 20 u bear to exist is worse than no
    // flypast, so the flock waits for the player to reach open ground.
    if (bestObstacle > 8) {
      route.active = false; route.gap = 6 + r() * 6;
      pool.mesh.visible = false; shade.hideAll(); skyShade.flush(); wasVisible = false;
      return;
    }
    route.t = 0; route.active = true; toasted = false;
    route.camX = cam.position.x; route.camZ = cam.position.z;
    lift = 0;
    let mean = 0;
    for (let i = 0; i < N; i++) {
      const k = i - (route.size - 1) / 2;                        // symmetric for THIS size
      // WAVE 5 birds-flicker polish (critic: "3–4 bodies merge into one dark blob"): neighbours used
      // to sit 1.6 spreads apart with a 1.5-scale wingspan and spread ≈ scale — wingtip to wingtip.
      // Now 2.1 along / 1.9 across (≈ 2.8 scale between neighbours: a clear 1.5 body lengths of sky).
      birds[i].along = (-Math.abs(k) * 2.10 - r() * 0.16) * route.spread;
      birds[i].lat = k * 1.90 * route.spread;
      if (i < route.size) mean += birds[i].along / route.size;
    }
    // the whole V trails BEHIND its leader, so slide it forward onto the aim
    // point or the formation sits half a screen off to one side
    for (let i = 0; i < N; i++) birds[i].along -= mean;
    // a scheduled crossing enters from OFF-SCREEN: slide its start back along
    // the line until no bird is in the frame (a short close pass can begin
    // inside a wide lens at t = 0)
    if (offscreen) {
      const t = ctx.state.elapsed || 0;
      while (route.t > -1.2 && flockSeen(route.t, t)) route.t -= 0.05;
    }
  }
  startRoute();
  // A screenshot run steps ~2 s of game time before it shoots, so "already mid
  // crossing" has to mean 2 s BEFORE the flock reaches the aim point, not at it.
  route.t = 0.5 - Math.min(0.3, 2.2 / route.dur);

  return {
    name: 'birds', route,
    /** Put a flypast on screen at progress t — for authored shots and views. */
    cue(t = 0.45) { cueT = Math.max(0.05, Math.min(0.9, t)); cueWait = 0.2; },
    /** A crossing is in the air (creatures.js keeps it flying while its gate is shut). */
    airborne: () => route.active,
    /** creatures.js, gate shut (lens at x ≥ 40): fly the current crossing to its end, start nothing. */
    coast(dt, ctx) {
      if (!route.active) return;
      coasting = true;
      try { this.update(dt, ctx); } finally { coasting = false; }
    },
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      const p = ctx.systems.player?.position;
      const cam = ctx.camera.position;
      toastCd -= dt;
      // Bookkeeping first, on every call. A TELEPORT (the visitor jumps 40 u in
      // one frame, or the lens snaps 20 u in one frame — a snap can land a
      // frame behind the teleport) re-aims the crossing: the whole picture
      // changed, so nothing pops. Drift is NOT a teleport: the Sugarfin carries
      // the lens 60 u across the strait, and round 4's "20 u from where the
      // crossing was solved" test re-aimed the V mid-frame every ~9 s of the
      // ride (Ben: "disappearing and reappearing"). A lens that drifts away now
      // simply lets the V fly out of the picture. Frames this system did not
      // run (the creatures gate shut, paused) are a gap in the record, not a jump.
      const fresh = t - lastT < 0.25;
      lastT = t;
      let jumped = false;
      if (p) {
        jumped = fresh && (Math.hypot(p.x - lastPX, p.z - lastPZ) > 40
          || (lastCX === lastCX && Math.hypot(cam.x - lastCX, cam.z - lastCZ) > 20));
        lastPX = p.x; lastPZ = p.z;
        lastCX = cam.x; lastCZ = cam.z;
      }
      // Gliders are a daylight skyline event. After dusk a dark flock against a
      // dark sky is invisible, and a toast about a flypast nobody can see is
      // exactly the lie this pass is here to stop telling. No NEW crossing
      // starts after dusk; one already in the air finishes (off-screen) rather
      // than blinking out of a frame the visitor is watching.
      const dusk = (ctx.state.daylight ?? 1) < 0.35;
      if (dusk && !route.active) {
        if (wasVisible) { pool.mesh.visible = false; shade.hideAll(); skyShade.flush(); wasVisible = false; }
        route.gap = Math.max(route.gap, 4);
        return;
      }
      if (jumped) {
        if (coasting || dusk) { endRoute(); return; }        // a new picture, and no flock in it
        startRoute(); route.t = 0.5 - Math.min(0.3, 2.2 / route.dur);
      }
      if (!coasting && cueT !== null && (cueWait -= dt) <= 0) {
        startRoute(); route.t = cueT; cueT = null;
      }
      if (!route.active) {
        if ((route.gap -= dt) <= 0 && !coasting) startRoute(true);
        if (wasVisible) { pool.mesh.visible = false; shade.hideAll(); skyShade.flush(); wasVisible = false; }
        if (!route.active) return;
      }
      route.t += dt / route.dur;
      // …and it only ends once every bird has flown out of the frame (a lens
      // that turned to follow the V can still hold it at t = 1)
      if (route.t >= 1 && (route.t >= 1.8 || !flockSeen(route.t, t))) { endRoute(); return; }
      pool.mesh.visible = true; wasVisible = true;
      const LEN = route.len || 150;
      const fx = Math.sin(route.dir), fz = Math.cos(route.dir);
      const rx = Math.cos(route.dir), rz = -Math.sin(route.dir);
      const s0x = route.ax - fx * LEN * 0.5 + rx * route.side;
      const s0z = route.az - fz * LEN * 0.5 + rz * route.side;
      const hx = s0x + fx * LEN * route.t;
      const hz = s0z + fz * LEN * route.t;

      // no-fly: climb over any roof under the flock or on the line ahead, and
      // ease back down only once the tail is clear as well
      const need = Math.max(clearanceAt(hx, hz),
        clearanceAt(hx + fx * 10, hz + fz * 10),
        clearanceAt(hx - fx * 12, hz - fz * 12));
      lift += (Math.max(0, need - route.alt) - lift) * Math.min(1, dt * 1.6);

      const bank = Math.sin(t * 0.5) * 0.18;
      // WAVE 5 birds-flicker polish — at range the V shrank to dark vertical pins (ferryC f213–f263).
      // (1) A minimum screen size: the whole formation (bird size AND spacing, one factor, so it never
      //     re-clumps) grows so a wingspan stays ≥ ~3.5 % of the frame height however far the V flies.
      // (2) Each bird banks its wings toward the lens (≤ 0.65 rad), so a V crossing at lens height
      //     shows its coloured wing faces instead of knife edges. Both are smooth in the lens position.
      const cp = ctx.camera.position;
      const boost = flockBoost(hx, hz);
      for (let i = 0; i < N; i++) {
        if (i >= route.size) { pool.hide(i); shade.hide(i); continue; }
        const b = birds[i];
        const w = (b.lat + Math.sin(t * 0.7 + b.ph) * 0.5) * boost;
        const x = hx + fx * b.along * boost + rx * w;
        const z = hz + fz * b.along * boost + rz * w;
        const g = world.height(x, z);
        const y = Math.max(route.ground, g) + route.alt + lift + Math.sin(t * 1.1 + b.bob) * 0.45 + b.lat * 0.05;
        const s = b.scale * route.scale * boost;
        // tilt the wing plane toward the lens (a bank for a lens abeam, a dip or lift for one ahead or
        // behind): the wing's lit face — its top for a lens above, its belly for one below — turns to
        // the camera by up to 0.6 rad. The flip as the lens crosses the flock's plane is eased (~0.4 s),
        // which reads as a glider rocking its wings, never as a pop.
        const cx = cp.x - x, cy = cp.y - y, cz = cp.z - z;
        const cr = cx * rx + cz * rz, cf = cx * fx + cz * fz, hz2 = Math.hypot(cr, cf) || 1;
        const tilt = Math.max(-0.6, Math.min(0.6, Math.atan(hz2 / (Math.abs(cy) < 1e-3 ? 1e-3 : cy))));
        const e = Math.min(1, dt * 5);
        b.tr += (-tilt * cr / hz2 - b.tr) * e;
        b.tp += (tilt * cf / hz2 - b.tp) * e;
        _o.position.set(x, y, z);
        _o.rotation.set(b.tp + Math.sin(t * 0.9 + b.ph) * 0.05, route.dir, bank + Math.sin(t * 1.3 + b.ph) * 0.06 + b.tr, 'YXZ');
        _o.scale.set(s, s, s);
        _o.updateMatrix();
        pool.mesh.setMatrixAt(i, _o.matrix);
        // a shadow this far up is a wide grey smudge — but it is the thing that
        // tells you something just went over your head. Over the strait it lies ON the water
        // (polish: it used to sit on the seabed under the opaque sea, and nothing said "high")
        shade.set(i, x, Math.max(g, 0), z, s * 0.55, 1, route.dir);
      }
      pool.flush(); skyShade.flush();

      // Only promise a flypast the player can actually SEE — but at 16–19.5 u
      // the thing you see is usually not the birds. This camera points 20–30°
      // BELOW the horizon, so it frames the sky only from a long way back;
      // what always lands in frame is the V of bird-shaped shadows running
      // across the frosting. So the test projects the SHADOW, and the line
      // tells you to look down, not up.
      if (!toasted && toastCd <= 0 && route.t > 0.3 && route.t < 0.85 && p) {
        const gy = Math.max(route.ground, world.height(hx, hz));
        _pt.set(hx, gy, hz).project(ctx.camera);
        const shadowSeen = _pt.z > -1 && _pt.z < 1 && Math.abs(_pt.x) < 0.95 && Math.abs(_pt.y) < 0.95;
        _pt.set(hx, gy + route.alt + lift, hz).project(ctx.camera);
        const birdsSeen = _pt.z > -1 && _pt.z < 1 && Math.abs(_pt.x) < 0.92 && Math.abs(_pt.y) < 0.92;
        if (shadowSeen || birdsSeen) {
          toasted = true; toastCd = 40;
          uiToast(ctx, birdsSeen
            ? 'A V of sugar-gliders crosses, high and fast.'
            : `${route.size} shadows sweep across the path. Something went over, very high up.`);
          ctx.systems.story?.set('saw_sugargliders', true);
        }
      }
    },
  };
}
