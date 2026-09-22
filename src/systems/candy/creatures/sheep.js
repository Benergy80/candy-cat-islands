// MARSHMALLOW SHEEP — a flock of 8 grazing Lollipop Meadow. They bounce-walk
// (no leg IK: the whole marshmallow hops and squashes), graze nose-down, and
// can be petted. A shepherd's bell stands in the meadow; ring it and the flock
// comes bouncing. Nobody has ever seen the shepherd.
import * as THREE from 'three';
import { rng, hash } from '../../../core/util.js';
import { Pool, part, mergeParts, shadeAxis, TAU, walkable, turnToward, uiToast, uiSay } from './common.js';

// The flock lives on the licorice lane through Lollipop Meadow — the only place
// in the meadow you can actually see the ground between the giant lollipops.
export const BELL = { x: -111.3, z: -35.0 };
const HOME = { x: -113, z: -36, r: 10 };
const LANE = [[-119, -14], [-116, -24], [-113, -34], [-110, -44], [-117, -53]];
const BLEATS = ['Baaa.', 'Mmbaa!', 'baa?', 'Baaaaaa~', '*soft marshmallow noises*', 'Baa. (This is the best day of its life.)'];
// Critique fix: the face and legs used to be 0x3b2731 — at the game camera
// (36 u, FOV 30) a sheep is ~60 px tall and near-black parts that small stop
// being a face and become a hole punched in a white marshmallow. They are now
// a warm plum, and the sheep has EYES, which is what actually makes it read as
// an animal rather than a rock with a smudge.
const FACE = 0x6a4152;     // dark enough to be a face from above, not a hole
const LEG = 0x5e3a48;
const HOOF = 0x38222d;     // the four dark corner dots that make the read

// Critique fix #3 (round 3): from the game's top-down lens a sheep was a white
// boulder. One smooth bumped sphere has no outline of its own, the legs were
// entirely inside the wool footprint, and there was no tail — so the only
// silhouette information in the frame was "white lump". Rebuilt for the ONE
// view that matters:
//   · the fleece is FIVE lobes (body, shoulder hump, two hip bumps, rump), so
//     the outline from overhead is a cloud with 3–4 readable bumps;
//   · four legs splay OUTWARD to hooves at ±0.58, past the fleece's ±0.51 —
//     four dark dots at the corners of the white mass, visible from straight up;
//   · the head sits low and forward, 0.43 u clear of the wool, in a darker plum
//     with a pale muzzle and ears that stick out sideways;
//   · a tail pokes out the back, so the sheep has a FRONT and a BACK from above.
// It is also ~15% bigger, which is most of what "reads at 36 u" costs.
function sheepGeo() {
  const parts = [];
  const lobe = (x, y, z, sx, sy, sz, bump) => {
    const g = part(new THREE.SphereGeometry(1, 7, 5), { pos: [x, y, z], scale: [sx, sy, sz], bump });
    shadeAxis(g, 'y', 0.30, 1.40, 0xe3bfcf, 0xffffff);
    parts.push(g);
  };
  // Fleece extents matter more than fleece shape: the head has to sit AHEAD of
  // the front edge and the tail BEHIND the back edge, or from straight overhead
  // the sheep is a white blob with no front, which is exactly the boulder read.
  // Fleece runs z −0.79 … +0.54, x ±0.51.
  lobe(0.00, 0.86, -0.06, 0.48, 0.45, 0.60, 0.07);   // body
  lobe(0.00, 1.06, 0.02, 0.33, 0.28, 0.33, 0.11);    // shoulder hump (back of the neck)
  lobe(-0.22, 1.02, -0.32, 0.29, 0.26, 0.31, 0.11);  // left hip bump
  lobe(0.23, 1.05, -0.27, 0.27, 0.24, 0.29, 0.11);   // right hip bump
  lobe(0.00, 0.74, -0.55, 0.30, 0.28, 0.24, 0.11);   // rump

  parts.push(
    // head — 0.43 u clear of the fleece front, so from straight above it is a
    // dark lobe sticking out of the white mass rather than a smudge inside it
    part(new THREE.SphereGeometry(1, 6, 4), { pos: [0, 1.02, 0.72], scale: [0.235, 0.245, 0.27], color: FACE }),
    part(new THREE.SphereGeometry(1, 5, 3), { pos: [0, 0.955, 0.945], scale: [0.145, 0.11, 0.12], color: 0xffd0e2 }),
    // tail: a wool puff with a dark stub, well out past the rump
    part(new THREE.SphereGeometry(1, 5, 3), { pos: [0, 0.80, -0.92], scale: 0.17, bump: 0.14, color: 0xfff3f8 }),
    part(new THREE.CylinderGeometry(0.045, 0.058, 0.22, 4), { pos: [0, 0.70, -0.96], rot: [0.5, 0, 0], color: LEG }),
    // bell on a strap down the chest — plum, never pillar-box red (a bright red
    // bar across a white marshmallow reads as a WOUND at the game camera)
    part(new THREE.BoxGeometry(0.11, 0.17, 0.045), { pos: [0, 0.86, 0.60], rot: [0.22, 0, 0], color: 0x6b3f4e }),
    part(new THREE.TetrahedronGeometry(0.125), { pos: [0, 0.74, 0.625], rot: [0.4, 0.6, 0], color: 0xf2c14e }),
  );

  for (const s of [-1, 1]) {
    // ears, out past the head's width — from overhead they give the dark blob
    // at the front a shape instead of being a smudge
    parts.push(part(new THREE.ConeGeometry(0.09, 0.28, 3, 1, true), { pos: [s * 0.27, 1.10, 0.645], rot: [0.25, 0, s * 1.15], color: FACE }));
    // eye white + pupil, proud of the dark face so they catch the sun
    parts.push(part(new THREE.SphereGeometry(1, 4, 3), { pos: [s * 0.132, 1.055, 0.895], scale: 0.075, color: 0xfffaf4 }));
    parts.push(part(new THREE.TetrahedronGeometry(0.046), { pos: [s * 0.142, 1.055, 0.940], rot: [0.4, 0.4, 0], color: 0x2a1a22 }));
    // four legs, splayed so the hooves land OUTSIDE the ±0.51 fleece outline —
    // four dark dots at the corners of the white mass, seen from straight up
    for (const zz of [1, -1]) {
      parts.push(part(new THREE.CylinderGeometry(0.115, 0.15, 0.74, 5, 1, true), {
        pos: [s * 0.39, 0.37, zz * 0.375], rot: [zz * 0.13, 0, -s * 0.34], color: LEG,
      }));
      parts.push(part(new THREE.SphereGeometry(1, 5, 3), {
        pos: [s * 0.58, 0.07, zz * 0.43], scale: [0.18, 0.13, 0.185], color: HOOF,
      }));
    }
  }
  return mergeParts(parts);
}

export function create(env) {
  const { ctx, world, scene, shadowField } = env;
  const r = rng(hash('candy-sheep'));
  const N = 8;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
  const pool = new Pool(scene, sheepGeo(), mat, N, { name: 'marshmallow-sheep', cast: true });
  const shade = shadowField.claim(N);

  const flock = [];
  for (let i = 0; i < N; i++) {
    let x = 0, z = 0, ok = false;
    for (let k = 0; k < 50 && !ok; k++) { const q = lanePoint(); x = q.x; z = q.z; ok = walkable(world, x, z, 3); }
    flock.push({
      x, z, y: world.height(x, z), head: r() * TAU, mode: r() < 0.6 ? 'graze' : 'walk',
      timer: 2 + r() * 7, tx: x, tz: z, scale: 1.34 + r() * 0.30, ph: r() * TAU,
      graze: 0, hop: 0, bell: 0, yTimer: 0,
    });
  }
  flock.forEach((s, i) => pool.tint(i, r() < 0.5 ? 0xffffff : 0xfff4e8));
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
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      for (let i = 0; i < N; i++) {
        const s = flock[i];
        s.bell = Math.max(0, s.bell - dt);
        s.hop = Math.max(0, s.hop - dt * 1.8);
        if ((s.timer -= dt) <= 0) {
          if (s.mode === 'graze') { s.mode = 'walk'; s.timer = 3 + r() * 5; pickTarget(s, s.bell > 0); }
          else { s.mode = 'graze'; s.timer = 4 + r() * 9; }
        }
        const walking = s.mode === 'walk';
        s.graze += ((walking ? 0 : 1) - s.graze) * Math.min(1, dt * 2.2);
        let speed = 0;
        if (walking) {
          const dx = s.tx - s.x, dz = s.tz - s.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.6) { s.mode = 'graze'; s.timer = 4 + r() * 8; }
          else {
            s.head = turnToward(s.head, Math.atan2(dx, dz), dt * 2.6);
            speed = (s.bell > 0 ? 3.0 : 1.35);
            const nx = s.x + Math.sin(s.head) * speed * dt;
            const nz = s.z + Math.cos(s.head) * speed * dt;
            if (walkable(world, nx, nz, 2.6)) { s.x = nx; s.z = nz; } else { s.mode = 'graze'; s.timer = 2; }
          }
        }
        if ((s.yTimer -= dt) <= 0) { s.yTimer = 0.2; s.y = world.height(s.x, s.z); }
        // a grazing sheep lifts its head and stares at anyone who comes close
        const pp = ctx.systems.player?.position;
        let watch = 0;
        if (pp && !walking) {
          const d = Math.hypot(pp.x - s.x, pp.z - s.z);
          if (d < 7) { watch = 1 - d / 7; s.head = turnToward(s.head, Math.atan2(pp.x - s.x, pp.z - s.z), dt * 2.2 * watch); }
        }
        s.graze *= 1 - watch * 0.85;

        const sc = s.scale;
        const bounce = walking ? Math.abs(Math.sin(t * (s.bell > 0 ? 8.5 : 5.4) + s.ph)) : 0;
        const hop = Math.sin(Math.min(1, s.hop) * Math.PI) * 0.55;
        const breathe = Math.sin(t * 1.5 + s.ph) * 0.015;
        const y = s.y + bounce * 0.2 * sc + hop - s.graze * 0.07;
        const squash = 1 - bounce * 0.11 + breathe;
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
