// MARSHMALLOW SHEEP — a flock of 8 grazing Lollipop Meadow. They bounce-walk
// (no leg IK: the whole marshmallow hops and squashes), graze nose-down, and
// can be petted. A shepherd's bell stands in the meadow; ring it and the flock
// comes bouncing. Nobody has ever seen the shepherd.
import * as THREE from 'three';
import { rng, hash } from '../../../core/util.js';
import { Pool, part, mergeParts, shadeAxis, TAU, walkable, turnToward, wrapAngle, uiToast, uiSay, HIT, WET, LOD } from './common.js';

// Contract A body (units of the sheep's scale): a pivot circle as wide as the
// splayed hooves, plus a nose probe and a tail probe — a sheep is ~2.2 scale
// units long, and one circle long enough to cover its muzzle would hold it a
// metre off every fence it grazes past.
export const SHEEP_BODY = { r: 0.78, probes: [[0.62, 0.48], [-0.6, 0.5]] };

// The flock lives on the licorice lane through Lollipop Meadow — the only place
// in the meadow you can actually see the ground between the giant lollipops.
export const BELL = { x: -111.3, z: -35.0 };
const HOME = { x: -113, z: -36, r: 10 };
const LANE = [[-119, -14], [-116, -24], [-113, -34], [-110, -44], [-117, -53]];
const BLEATS = ['Baaa.', 'Mmbaa!', 'baa?', 'Baaaaaa~', '*soft marshmallow noises*', 'Baa. (This is the best day of its life.)'];
// WAVE 3 polish (critic, night frames): "the flock reads as grey faceted
// boulders — their dark faces disappear at night". A plum face and plum legs
// are simply black after dark, and a faceted 7×5 sphere IS a boulder. So:
//   · TOASTED-MARSHMALLOW face, ears and legs — a golden caramel that stays a
//     face against the white wool by day and stays visible by moonlight;
//   · big white eyes with dark pupils (they are what says "animal");
//   · the fleece is a CLOUD of smooth puffs — a bumpy outline from any angle,
//     not a flat-shaded rock;
//   · a faint moonlit self-glow after dark, tinted by each part's own colour
//     (applied in the material below), so the flock never sinks into the night.
// Still true from round 3: the head sits clear AHEAD of the fleece and the tail
// clear BEHIND it, and four dark hooves splay out past the fleece outline, so
// the sheep has a front, a back and four corners from straight overhead.
const FACE = 0xe7ad76;     // toasted marshmallow
const FACE_HI = 0xf8d6ae;
const LEG = 0xc98a58;
const HOOF = 0x4a2a22;     // chocolate: the four dark corner dots that make the read
function sheepGeo() {
  const parts = [];
  const puff = (x, y, z, sx, sy = sx, sz = sx, bump = 0.05) => {
    const g = part(new THREE.SphereGeometry(1, 8, 5), { pos: [x, y, z], scale: [sx, sy, sz], bump });
    shadeAxis(g, 'y', 0.35, 1.45, 0xe6c4d2, 0xffffff);
    parts.push(g);
  };
  // Fleece extents: z −0.80 … +0.56, x ±0.52 — the head starts 0.2 u ahead of
  // the front edge and the hooves stand out past the sides.
  puff(0.00, 0.86, -0.08, 0.44, 0.40, 0.56);           // core
  puff(0.00, 1.16, 0.20, 0.25);                        // back row, front → rear
  puff(0.00, 1.20, -0.16, 0.27);
  puff(0.00, 1.10, -0.46, 0.24);
  for (const x of [-1, 1]) {                           // flank rows
    puff(x * 0.29, 1.03, 0.26, 0.22);
    puff(x * 0.31, 1.06, -0.10, 0.23);
    puff(x * 0.28, 0.99, -0.44, 0.22);
    puff(x * 0.30, 0.76, 0.06, 0.22, 0.2, 0.26);
  }
  puff(0.00, 0.80, -0.62, 0.22, 0.22, 0.18);           // rump
  puff(0.00, 1.20, 0.47, 0.17, 0.15, 0.15, 0.08);      // forelock over the brow

  // head — toasted, lighter on top, well ahead of the fleece
  parts.push(shadeAxis(part(new THREE.SphereGeometry(1, 9, 6), { pos: [0, 1.0, 0.74], scale: [0.235, 0.245, 0.27], color: FACE }), 'y', 0.8, 1.2, FACE, FACE_HI));
  parts.push(part(new THREE.SphereGeometry(1, 7, 4), { pos: [0, 0.93, 0.965], scale: [0.14, 0.105, 0.11], color: 0xffc4d6 }));   // pink muzzle
  parts.push(part(new THREE.SphereGeometry(1, 5, 3), { pos: [0, 0.965, 1.055], scale: [0.05, 0.03, 0.03], color: 0x6a3040 }));  // nose
  // tail: a wool puff with a toasted stub, well out past the rump
  parts.push(part(new THREE.SphereGeometry(1, 7, 5), { pos: [0, 0.82, -0.92], scale: 0.16, bump: 0.08, color: 0xffffff }));
  parts.push(part(new THREE.CylinderGeometry(0.045, 0.058, 0.22, 5), { pos: [0, 0.72, -0.96], rot: [0.5, 0, 0], color: LEG }));
  // bell on a strap down the chest — plum strap, gold bell
  parts.push(part(new THREE.BoxGeometry(0.11, 0.17, 0.045), { pos: [0, 0.84, 0.6], rot: [0.22, 0, 0], color: 0x8a4a5e }));
  parts.push(part(new THREE.TetrahedronGeometry(0.125), { pos: [0, 0.72, 0.625], rot: [0.4, 0.6, 0], color: 0xf2c14e }));

  for (const s of [-1, 1]) {
    // ears out past the head's width, toasted outside, pink inside
    parts.push(part(new THREE.SphereGeometry(1, 6, 4), { pos: [s * 0.29, 1.08, 0.66], rot: [0, s * 0.35, s * 0.55], scale: [0.16, 0.05, 0.085], color: FACE }));
    parts.push(part(new THREE.SphereGeometry(1, 5, 3), { pos: [s * 0.3, 1.1, 0.675], rot: [0, s * 0.35, s * 0.55], scale: [0.11, 0.03, 0.05], color: 0xff9eb8 }));
    // big eyes: white, proud of the face, with a dark pupil and a catch-light
    parts.push(part(new THREE.SphereGeometry(1, 6, 4), { pos: [s * 0.125, 1.06, 0.9], scale: [0.085, 0.09, 0.07], color: 0xffffff }));
    parts.push(part(new THREE.SphereGeometry(1, 5, 3), { pos: [s * 0.132, 1.055, 0.955], scale: [0.05, 0.058, 0.035], color: 0x24141c }));
    parts.push(part(new THREE.SphereGeometry(1, 4, 3), { pos: [s * 0.115, 1.085, 0.985], scale: 0.016, color: 0xffffff }));
    // four toasted legs, splayed so the chocolate hooves land OUTSIDE the
    // fleece outline — four dark dots at the corners of the white mass
    for (const zz of [1, -1]) {
      parts.push(part(new THREE.CylinderGeometry(0.1, 0.13, 0.72, 7, 1, true), {
        pos: [s * 0.39, 0.38, zz * 0.375], rot: [zz * 0.13, 0, -s * 0.34], color: LEG,
      }));
      parts.push(part(new THREE.SphereGeometry(1, 6, 3), {
        pos: [s * 0.58, 0.07, zz * 0.43], scale: [0.17, 0.12, 0.18], color: HOOF,
      }));
    }
  }
  return mergeParts(parts);
}

// Night huddle: after dark the flock walks to the shepherd's bell and sleeps
// round it, heads in — a flock formation you can read from the path.
const NIGHT_ON = 0.3, NIGHT_OFF = 0.45;

export function create(env) {
  const { ctx, world, scene, shadowField, ground } = env;
  const r = rng(hash('candy-sheep'));
  const N = 8;
  // Smooth-shaded puffs (a flat-shaded sphere is a rock). The emissive is a
  // moonlit floor switched on after dark and multiplied by each part's own
  // vertex colour: white wool glows a soft lilac-white, the toasted face stays
  // caramel, the chocolate hooves stay dark — the flock keeps its read at night.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, emissive: 0xcfc6ff, emissiveIntensity: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor;');
  };
  mat.customProgramCacheKey = () => 'candy-sheep-moon';
  const pool = new Pool(scene, sheepGeo(), mat, N, { name: 'marshmallow-sheep', cast: true });
  const shade = shadowField.claim(N);

  const flock = [];
  for (let i = 0; i < N; i++) {
    let x = 0, z = 0, ok = false;
    for (let k = 0; k < 50 && !ok; k++) { const q = lanePoint(); x = q.x; z = q.z; ok = walkable(world, x, z, 3); }
    flock.push({
      x, z, y: world.height(x, z), head: r() * TAU, mode: r() < 0.6 ? 'graze' : 'walk',
      timer: 2 + r() * 7, tx: x, tz: z, scale: 1.34 + r() * 0.30, ph: r() * TAU,
      graze: 0, hop: 0, bell: 0, bump: 0, lie: 0, slot: null, kind: 'sheep',
    });
  }
  flock.forEach((s, i) => pool.tint(i, r() < 0.5 ? 0xffffff : 0xfff4e8));
  // debug circles are valid before the first Contract-A step (see creatures.debugPositions)
  for (const s of flock) { s.r = SHEEP_BODY.r * s.scale; s.sc = s.scale; s.yaw = s.head; s.body = SHEEP_BODY; }
  pool.flushColors();

  // a point strung along the meadow lane, so the flock reads as a flock
  function lanePoint() {
    const u = r() * (LANE.length - 1);
    const i = Math.min(LANE.length - 2, Math.floor(u)), f = u - i;
    const ax = LANE[i][0] + (LANE[i + 1][0] - LANE[i][0]) * f;
    const az = LANE[i][1] + (LANE[i + 1][1] - LANE[i][1]) * f;
    const dx = LANE[i + 1][0] - LANE[i][0], dz = LANE[i + 1][1] - LANE[i][1];
    const L = Math.hypot(dx, dz) || 1;
    const off = (0.6 + r() * 4.4) * (r() < 0.5 ? -1 : 1);
    return { x: ax - (dz / L) * off, z: az + (dx / L) * off };
  }

  function pickTarget(s, toBell = false) {
    if (toBell) {
      const a = r() * TAU, rr = 2.2 + r() * 3.6;
      s.tx = BELL.x + Math.cos(a) * rr; s.tz = BELL.z + Math.sin(a) * rr;
      return;
    }
    for (let k = 0; k < 24; k++) {
      const q = lanePoint();
      if (walkable(world, q.x, q.z, 3) && Math.hypot(q.x - s.x, q.z - s.z) < 22) { s.tx = q.x; s.tz = q.z; return; }
    }
  }

  // Contract A: a solid pushed this sheep — turn around. It picks a new lane
  // point BEHIND itself (or, answering the bell, another spot round the bell),
  // so it wanders off the other way instead of grinding along the fence.
  function turnAway(s) {
    if (s.bell > 0) { pickTarget(s, true); return; }
    const fx = Math.sin(s.head), fz = Math.cos(s.head);
    for (let k = 0; k < 16; k++) {
      const q = lanePoint();
      const dx = q.x - s.x, dz = q.z - s.z, d = Math.hypot(dx, dz);
      if (d > 2.5 && d < 22 && (dx * fx + dz * fz) < -0.2 * d && walkable(world, q.x, q.z, 3)) { s.tx = q.x; s.tz = q.z; return; }
    }
    s.tx = s.x - fx * 4; s.tz = s.z - fz * 4;
  }

  // ── night huddle ──────────────────────────────────────────────────────────
  // Two rings round the bell (5 close in, 3 behind the gaps), each slot tested
  // clear of solids and water once the ground core is up; sheep take the
  // nearest free slot and sleep there facing the bell.
  let slots = null, nightMode = false;
  function ensureSlots() {
    if (slots) return;
    slots = [];
    for (const [rad, n, a0] of [[2.8, 5, 0.3], [4.7, 3, 0.93]]) {
      const ok = [];
      for (let k = 0; k < 36; k++) {
        const a = a0 + (k / 36) * TAU, x = BELL.x + Math.cos(a) * rad, z = BELL.z + Math.sin(a) * rad;
        const q = ground.push(x, z, 1.15, x, z);
        const solid = q.hit && Math.abs(q.x - x) + Math.abs(q.z - z) > 0.05;
        // the outer ring sits in the GAPS of the inner one, never nose-to-tail behind a sheep
        const behind = slots.some((q) => q.rad < rad && Math.abs(wrapAngle(q.a - a)) < 0.5);
        if (!solid && !behind && walkable(world, x, z, 3, -1)) ok.push(a);
      }
      for (let j = 0; j < n; j++) {
        const want = a0 + (j / n) * TAU;
        let best = null, bd = Infinity;
        for (const a of ok) {
          if (slots.some((q) => q.rad === rad && Math.abs(wrapAngle(q.a - a)) < (TAU / n) * 0.6)) continue;
          const d = Math.abs(wrapAngle(a - want)); if (d < bd) { bd = d; best = a; }
        }
        if (best !== null) slots.push({ rad, a: best, x: BELL.x + Math.cos(best) * rad, z: BELL.z + Math.sin(best) * rad, taken: null });
      }
    }
  }
  function goHome(s) {
    ensureSlots();
    if (!s.slot) {
      let best = null, bd = Infinity;
      for (const q of slots) { if (q.taken) continue; const d = Math.hypot(q.x - s.x, q.z - s.z); if (d < bd) { bd = d; best = q; } }
      if (best) { best.taken = s; s.slot = best; }
    }
    s.mode = 'home'; s.timer = 1e9;
    if (s.slot) { s.tx = s.slot.x; s.tz = s.slot.z; } else pickTarget(s, true);
  }

  let petted = 0;
  ctx.events.on('world:ready', () => {
    flock.forEach((s, i) => {
      ctx.systems.interaction?.register({
        id: `sheep_${i}`, r: 2.9, label: 'Pet the marshmallow sheep',
        getPos: () => s,
        onInteract() {
          petted++;
          s.hop = 1; s.mode = 'graze'; s.graze = 0; s.timer = 2.5;
          uiSay(ctx, BLEATS[Math.floor(r() * BLEATS.length)], { speaker: 'Marshmallow Sheep', duration: 2.4 });
          ctx.systems.particles?.burst({ x: s.x, y: s.y + 1.5, z: s.z, count: 14, color: [0xff5c8d, 0xff9ec4, 0xffd6e8], speed: 2.0, life: 1.3, size: 0.3, gravity: -1.4, spread: 0.7 });
          ctx.systems.story?.set('sheep_petted', petted);
          if (petted === 3) uiToast(ctx, 'The flock has decided you are fine.');
        },
      });
    });
    ctx.systems.interaction?.register({
      id: 'shepherd_bell', x: BELL.x, z: BELL.z, r: 2.6, label: "Ring the shepherd's bell",
      onInteract() {
        uiSay(ctx, '*clonk* … *clonk-onk*', { speaker: "Shepherd's Bell", duration: 2.2 });
        uiToast(ctx, 'The flock comes bouncing. The shepherd does not.');
        ctx.systems.particles?.burst({ x: BELL.x, y: world.height(BELL.x, BELL.z) + 1.9, z: BELL.z, count: 12, color: [0xffe23a, 0xfff0a0], speed: 1.6, life: 0.9, size: 0.18, gravity: -3, spread: 0.4 });
        for (const s of flock) { s.bell = 9; s.mode = 'walk'; s.timer = 9; pickTarget(s, true); }
        ctx.systems.story?.set('bell_rung', true);
      },
    });
  });
  ctx.colliders = ctx.colliders || [];
  ctx.colliders.push({ x: BELL.x, z: BELL.z, r: 0.75 });

  return {
    name: 'sheep', flock, BELL,
    get night() { return nightMode; },
    slots: () => slots,
    /**
     * Authoring/views/tests: finish tonight's huddle now — every sheep is put
     * on its slot round the bell, lying down, facing in. Contract A still
     * resolves it on the next frame (a slot is only ever a target).
     */
    settle() {
      nightMode = true;
      for (const s of flock) {
        goHome(s);
        if (s.slot) { s.x = s.slot.x; s.z = s.slot.z; }
        s.mode = 'sleep'; s.lie = 1; s.bell = 0; s.hop = 0; s.graze = 1;
        s.head = Math.atan2(BELL.x - s.x, BELL.z - s.z);
      }
    },
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      const daylight = ctx.state.daylight ?? 1;
      mat.emissiveIntensity = Math.max(0, Math.min(1, (0.6 - daylight) / 0.5)) * 0.3;
      if (!nightMode && daylight < NIGHT_ON) {
        nightMode = true;
        for (const s of flock) if (s.bell <= 0) goHome(s);
      } else if (nightMode && daylight > NIGHT_OFF) {
        nightMode = false;
        for (const s of flock) {
          if (s.slot) { s.slot.taken = null; s.slot = null; }
          if (s.mode === 'home' || s.mode === 'sleep') { s.mode = 'graze'; s.timer = 1 + r() * 4; }
        }
      }
      const dtFrame = dt;
      for (let i = 0; i < N; i++) {
        const s = flock[i];
        const dt = LOD.step(s, dtFrame, s.x, s.y, s.z, 3);   // animation LOD (common.js)
        if (!dt) continue;
        s.bell = Math.max(0, s.bell - dt);
        s.hop = Math.max(0, s.hop - dt * 1.8);
        const settled = s.mode === 'home' || s.mode === 'sleep';
        if (!settled && (s.timer -= dt) <= 0) {
          if (nightMode && s.bell <= 0) goHome(s);
          else if (s.mode === 'graze') { s.mode = 'walk'; s.timer = 3 + r() * 5; pickTarget(s, s.bell > 0); }
          else { s.mode = 'graze'; s.timer = 4 + r() * 9; }
        }
        const homing = s.mode === 'home', sleeping = s.mode === 'sleep';
        const walking = s.mode === 'walk' || homing;
        s.graze += ((walking ? 0 : 1) - s.graze) * Math.min(1, dt * 2.2);
        s.bump = Math.max(0, s.bump - dt);
        let nx = s.x, nz = s.z;
        if (walking) {
          const dx = s.tx - s.x, dz = s.tz - s.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.6) { if (homing) s.mode = 'sleep'; else { s.mode = 'graze'; s.timer = 4 + r() * 8; } }
          else {
            s.head = turnToward(s.head, Math.atan2(dx, dz), dt * 2.6);
            const speed = s.bell > 0 ? 3.0 : homing ? 2.3 : 1.35;
            nx = s.x + Math.sin(s.head) * speed * dt;
            nz = s.z + Math.cos(s.head) * speed * dt;
          }
        }
        // asleep: turn to face the bell, heads in; shoved off its slot (a kid
        // barged through the flock) → get up and walk back
        if (sleeping) {
          s.head = turnToward(s.head, Math.atan2(BELL.x - s.x, BELL.z - s.z), dt * 1.2);
          if (s.slot && Math.hypot(s.slot.x - s.x, s.slot.z - s.z) > 1.4) goHome(s);
        }
        s.lie += ((sleeping ? 1 : 0) - s.lie) * Math.min(1, dt * 1.4);
        // a grazing sheep lifts its head and stares at anyone who comes close
        const pp = ctx.systems.player?.position;
        let watch = 0;
        if (pp && !walking && !sleeping) {
          const d = Math.hypot(pp.x - s.x, pp.z - s.z);
          if (d < 7) { watch = 1 - d / 7; s.head = turnToward(s.head, Math.atan2(pp.x - s.x, pp.z - s.z), dt * 2.2 * watch); }
        }
        s.graze *= 1 - watch * 0.85;
        // no sheep walks through another: a moving sheep is held off its
        // neighbours (a sheep length apart, eased), a still one is not shoved
        if (nx !== s.x || nz !== s.z) {
          for (let j = 0; j < N; j++) {
            if (j === i) continue;
            const o = flock[j], dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz), min = (s.scale + o.scale) * 0.78;
            if (d < min && d > 1e-3) { const k = (min - d) / d * (d < min * 0.7 ? 1 : 0.5); nx += dx * k; nz += dz * k; }
          }
        }
        // Contract A, every frame, walking or not: resolve the body against the
        // solids, stand on whatever is underfoot (a bench, a log), refuse water.
        const res = ground.step(s, nx, nz, s.head, s.scale, SHEEP_BODY, 2.6);
        if (homing && (res & (WET | HIT)) && s.bump <= 0) { s.bump = 0.7; s.head += (i & 1 ? 0.7 : -0.7); }   // sidestep, keep heading home
        else if (walking && !homing && (res & WET)) { s.mode = 'graze'; s.timer = 2; }
        else if (walking && !homing && (res & HIT) && s.bump <= 0) { s.bump = 1.2; turnAway(s); }

        const sc = s.scale;
        const bounce = walking ? Math.abs(Math.sin(t * (s.bell > 0 ? 8.5 : 5.4) + s.ph)) : 0;
        const hop = Math.sin(Math.min(1, s.hop) * Math.PI) * 0.55;
        const breathe = Math.sin(t * (1.5 - s.lie * 0.6) + s.ph) * (0.015 + s.lie * 0.02);
        // asleep = lying down: legs folded under (sunk below the turf), a little flatter
        const y = s.y + bounce * 0.2 * sc + hop - s.graze * 0.07 - s.lie * 0.42 * sc;
        const squash = 1 - bounce * 0.11 + breathe - s.lie * 0.06;
        pool.place(i, s.x, y, s.z, s.head + Math.sin(t * 1.1 + s.ph) * 0.12 * s.graze,
          sc * (1 + bounce * 0.05), sc * squash, sc * (1 + bounce * 0.03),
          s.graze * 0.26 + (1 - s.graze) * Math.sin(t * 2.3 + s.ph) * 0.03, Math.sin(t * 1.9 + s.ph) * 0.04);
        // contact shadow, pulling in tight as a bouncing sheep lands
        shade.set(i, s.x, s.y, s.z, sc * 0.82, (bounce * 0.2 * sc + hop) / 1.2, s.head);
      }
      pool.flush();
    },
  };
}
