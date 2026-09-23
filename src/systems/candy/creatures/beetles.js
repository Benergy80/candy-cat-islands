// JELLYBEAN BEETLES — 52 glossy bean-shaped bugs that walk the meadow and the
// forest floor in short nose-to-tail TRAINS, wandering in long arcs. They
// notice the player from 7 units away and bolt; get right on top of one and the
// whole neighbourhood scatters with a squeak.
//
// Critique fix: they were faceless pills on black stick legs. A jellybean is a
// GLOSSY object, so the beetle now carries a real specular streak down its
// shell, a separate head segment in a paler tint, two proper eyes (white +
// pupil), and legs in its own body tint instead of near-black toothpicks. The
// gloss and the eyes survive the per-instance tint via applyTagShade — without
// it a white highlight on a purple beetle is just "slightly brighter purple".
import * as THREE from 'three';
import { rng, hash } from '../../../core/util.js';
import { CANDY } from '../../../core/palette.js';
import { Pool, part, mergeParts, shadeAxis, applyTagShade, TAU, walkable, turnToward, pathShoulder, uiToast, uiSay, HIT, WET } from './common.js';

// Contract A body (units of the beetle's scale): shell, head, eyes and the
// splayed legs all sit inside one circle at the pivot.
export const BEETLE_BODY = { r: 0.46 };

// Candyland's vegetation is wall-to-wall, so most beetles live on the licorice
// path shoulders where you can actually see them; the rest wander the deep floor.
const ZONES = [
  { x: -112, z: -40, r: 22, n: 16, path: 0.85 },   // Lollipop Meadow lane
  { x: -204, z: -22, r: 30, n: 18, path: 0.65 },   // Gummy Forest floor
  { x: -150, z: 34, r: 26, n: 10, path: 0.9 },     // main licorice road
  { x: -88, z: -18, r: 16, n: 8, path: 0.6 },      // around the Great Cupcake
];
const HUES = [CANDY.gummyRed, CANDY.gummyOrange, CANDY.gummyYellow, CANDY.gummyGreen, CANDY.gummyBlue, CANDY.gummyPurple, CANDY.syrup];

function beetleGeo() {
  // shell (abdomen): the big candy mass, dark at the belly, bright on top
  const body = part(new THREE.SphereGeometry(1, 8, 5), { scale: [0.225, 0.195, 0.36] });
  shadeAxis(body, 'y', -0.17, 0.15, 0x6b5560, 0xffffff);
  // a shell seam so the two elytra read as two halves
  const seam = part(new THREE.BoxGeometry(0.022, 0.05, 0.52), { pos: [0, 0.175, -0.03], color: 0x7a6270 });
  // GLOSS: a long specular streak lying along the shell's shoulder. tag +1, so
  // applyTagShade forces it to near-white on every hue.
  const gloss = part(new THREE.SphereGeometry(1, 6, 3),
    { pos: [0.085, 0.155, 0.03], rot: [0, 0, -0.22], scale: [0.045, 0.02, 0.16], tag: 1, color: 0xffffff });
  const gloss2 = part(new THREE.SphereGeometry(1, 5, 3),
    { pos: [-0.10, 0.14, -0.09], scale: [0.026, 0.016, 0.07], tag: 1, color: 0xffffff });
  // head segment: a distinct, paler ball with a collar behind it, so the beetle
  // has a FRONT instead of being a pill with dots on it
  const head = part(new THREE.SphereGeometry(1, 7, 4), { pos: [0, 0.035, 0.335], scale: [0.155, 0.145, 0.145] });
  shadeAxis(head, 'y', -0.1, 0.16, 0x8a7280, 0xfff6ec);
  const parts = [
    body, seam, gloss, gloss2, head,
    part(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 8), { pos: [0, 0.015, 0.245], rot: [1.5708, 0, 0], color: 0xb59aa8 }),
    // antennae — body tint, not licorice sticks
    part(new THREE.ConeGeometry(0.02, 0.2, 3, 1, true), { pos: [0.075, 0.14, 0.38], rot: [-0.8, 0, -0.32], color: 0x9c8290 }),
    part(new THREE.ConeGeometry(0.02, 0.2, 3, 1, true), { pos: [-0.075, 0.14, 0.38], rot: [-0.8, 0, 0.32], color: 0x9c8290 }),
  ];
  // eyes: white ball + dark pupil, both tag-locked so they stay an EYE on a
  // yellow beetle as well as a purple one
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.SphereGeometry(1, 5, 3), { pos: [s * 0.095, 0.075, 0.40], scale: 0.062, tag: 1, color: 0xffffff }));
    parts.push(part(new THREE.SphereGeometry(1, 4, 2), { pos: [s * 0.105, 0.078, 0.445], scale: 0.034, tag: -1, color: 0xffffff }));
  }
  // six legs, in the body tint (0.42 grey × instanceColor = a darker version of
  // the beetle's own candy colour)
  for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 3; k++) {
    parts.push(part(new THREE.ConeGeometry(0.032, 0.21, 3, 1, true), {
      pos: [s * 0.175, -0.055, -0.17 + k * 0.18], rot: [0.22, 0, s * 1.12], color: 0x6b6b6b,
    }));
  }
  return mergeParts(parts);
}

export function create(env) {
  const { ctx, world, scene, shadowField, ground } = env;
  const r = rng(hash('candy-beetles'));
  const geo = beetleGeo();
  const mat = applyTagShade(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.22, metalness: 0.06, flatShading: false,
  }), { key: 'candy-beetle-gloss', hiColor: 0xfffdf6, loColor: 0x201118, hi: 0.93, lo: 0.96 });
  const N = ZONES.reduce((a, z) => a + z.n, 0);
  const pool = new Pool(scene, geo, mat, N, { name: 'jellybean-beetles', cast: true });
  const shade = shadowField.claim(N);

  const bugs = [];
  for (const zone of ZONES) {
    // Beetles travel in trains of 2–4, nose to tail. A loose scatter of 52 dots
    // reads as noise; short marching lines read as PURPOSE, and they break into
    // a lovely mess when the player stamps near one.
    let trainLeft = 0, leader = null;
    for (let k = 0; k < zone.n; k++) {
      let x = 0, z = 0, ok = false;
      for (let tries = 0; tries < 40 && !ok; tries++) {
        const a = r() * TAU, rr = Math.sqrt(r()) * zone.r;
        x = zone.x + Math.cos(a) * rr; z = zone.z + Math.sin(a) * rr;
        if (r() < zone.path) { const s = pathShoulder(world, x, z, 'candy', 0.6, 4.2, r); if (s) { x = s.x; z = s.z; } }
        ok = walkable(world, x, z, 2.6);
      }
      // Critique fix: a train used to be three identical clones at identical
      // spacing walking a dead-straight line. Now the leader is the biggest and
      // each follower is 10–28% smaller than the one in front (a duckling
      // line), the gaps are all different, every beetle scuttles on its own
      // clock, and each one holds a small lateral offset so the line is a
      // ragged CURVE rather than a ruler.
      const b = {
        x, z, zone, y: world.height(x, z), bump: 0, kind: 'beetle',
        head: r() * TAU, curve: (r() - 0.5) * 0.95, ct: r() * 3, base: 0.85 + r() * 0.5,
        speed: 0, scale: 1.3 + r() * 0.55, ph: r() * TAU, rate: 14 + r() * 7,
        lat: (r() - 0.5) * 0.5, sway: 0.5 + r() * 1.1, panic: 0, ahead: null, gap: 0, rank: 0,
      };
      if (trainLeft > 0 && leader) {
        b.ahead = leader; b.rank = leader.rank + 1;
        b.scale = Math.max(0.85, leader.scale * (0.72 + r() * 0.18));
        b.gap = (0.72 + r() * 0.52) * b.scale + 0.14;
        b.head = leader.head + (r() - 0.5) * 0.24;
        b.x = leader.x - Math.sin(leader.head) * b.gap;
        b.z = leader.z - Math.cos(leader.head) * b.gap;
        b.y = world.height(b.x, b.z);
        b.base = leader.base;
        trainLeft--;
      } else {
        trainLeft = r() < 0.62 ? 1 + Math.floor(r() * 4) : 0;   // trains of 2–5
      }
      leader = b;
      bugs.push(b);
    }
  }
  bugs.forEach((b, i) => { const h = HUES[Math.floor(r() * HUES.length)]; b.hue = h; pool.tint(i, h); });

  // ── secret: the Royal Jellybean, three times the size and far too dignified
  // to run from anybody. Lives in the deep Gummy Forest.
  const royal = bugs[ZONES[0].n + 3];
  royal.royal = true; royal.kind = 'royal_beetle'; royal.scale = 3.2; royal.base = 0.32; royal.zone = { x: -214, z: -34, r: 12 };
  royal.x = -214; royal.z = -34; royal.y = world.height(royal.x, royal.z);
  royal.ahead = null;                                     // royalty walks alone
  for (const b of bugs) if (b.ahead === royal) b.ahead = null;
  pool.tint(bugs.indexOf(royal), 0xffc93a);
  pool.flushColors();
  for (const b of bugs) { b.r = BEETLE_BODY.r * b.scale; b.sc = b.scale; b.yaw = b.head; b.body = BEETLE_BODY; }

  ctx.events.on('world:ready', () => {
    ctx.systems.interaction?.register({
      id: 'royal_jellybean', r: 3.2, label: 'Bow to the Royal Jellybean',
      getPos: () => royal,
      onInteract() {
        uiSay(ctx, 'The Royal Jellybean accepts your bow and continues walking.',
          { speaker: 'Royal Jellybean', duration: 4 });
        ctx.systems.particles?.burst({ x: royal.x, y: royal.y + 0.9, z: royal.z, count: 20, color: [0xffc93a, 0xfff0a0, 0xffffff], speed: 2.4, life: 1.3, size: 0.22, gravity: -3, spread: 1.1 });
        ctx.systems.story?.set('royal_jellybean', true);
      },
    });
  });

  let squeakCd = 0, scatters = 0;
  const api = {
    pool, bugs, name: 'beetles',
    bounds: { x: -155, z: -32, r: 105 },
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      const p = ctx.systems.player?.position;
      const night = 1 - (ctx.state.daylight ?? 1);
      squeakCd -= dt;
      let squeaked = false;
      for (let i = 0; i < bugs.length; i++) {
        const b = bugs[i];
        // ── notice the player ───────────────────────────────────────────────
        let fleeing = false;
        if (p) {
          const dx = b.x - p.x, dz = b.z - p.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 49 && !b.royal) {
            fleeing = true;
            b.head = turnToward(b.head, Math.atan2(dx, dz), dt * 9);
            b.panic = Math.max(b.panic, 1 - Math.sqrt(d2) / 7);
            if (d2 < 12.25 && squeakCd <= 0) {
              squeakCd = 14; squeaked = true;
              uiToast(ctx, '*squeak!* — the jellybean beetles scatter');
              // every beetle in the neighbourhood pops its own little burst, so
              // the toast has something to describe
              for (const o of bugs) {
                if (o.royal || Math.hypot(o.x - p.x, o.z - p.z) > 11) continue;
                ctx.systems.particles?.burst({ x: o.x, y: o.y + 0.25, z: o.z, count: 4, color: [o.hue, 0xffffff], speed: 2.6, life: 0.5, size: 0.13, gravity: -7, spread: 1.0 });
              }
              scatters++;
              if (scatters === 4) uiSay(ctx, 'You will never catch one. Nobody ever has.', { speaker: 'A passing thought', duration: 4 });
              ctx.systems.story?.set('beetles_scattered', scatters);
            }
          }
        }
        b.panic = Math.max(0, b.panic - dt * 0.7);
        let follow = 0, bx = b.x, bz = b.z;
        if (!fleeing) {
          if (b.ahead && !b.ahead.panic) {
            // Keep station behind the beetle in front, but OFF ITS AXIS: the
            // target sits a little to one side and drifts, so the train reads
            // as a curved queue of individuals instead of a rigid stack.
            const a = b.ahead;
            const off = b.lat + Math.sin(t * 0.6 * b.sway + b.ph) * 0.16;
            const tx = a.x - Math.sin(a.head) * b.gap + Math.cos(a.head) * off;
            const tz = a.z - Math.cos(a.head) * b.gap - Math.sin(a.head) * off;
            const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
            if (d > 0.04) b.head = turnToward(b.head, Math.atan2(dx, dz), dt * 3.0);
            follow = Math.min(2.6, d * 2.2);
            if (d > 6) { bx = tx; bz = tz; }                // snapped by terrain: re-form
          } else {
            // long lazy arcs, re-curving every few seconds — a leader that
            // curves is what makes the whole line behind it curve
            b.head += b.curve * dt;
            if ((b.ct -= dt) <= 0) { b.ct = 2.2 + r() * 2.6; b.curve = (r() - 0.5) * 1.05; }
            const dx = b.zone.x - b.x, dz = b.zone.z - b.z;
            if (Math.hypot(dx, dz) > b.zone.r) b.head = turnToward(b.head, Math.atan2(dx, dz), dt * 2.2);
          }
        }
        const cruise = b.ahead && !fleeing ? follow : b.base * (1 - night * 0.65);
        const want = (fleeing ? 4.6 : cruise) * (1 + b.panic * 0.8);
        b.speed += (want - b.speed) * Math.min(1, dt * 5);
        const nx = bx + Math.sin(b.head) * b.speed * dt;
        const nz = bz + Math.cos(b.head) * b.speed * dt;
        // Contract A, every frame: pushed clear of trunks, sticks and walls,
        // standing ON logs and benches, refused at the water's edge
        b.bump = Math.max(0, b.bump - dt);
        const res = ground.step(b, nx, nz, b.head, b.scale, BEETLE_BODY, 2.2);
        if (res & WET) b.head += 2.0 + r() * 1.2;             // bounce off water / river
        else if ((res & HIT) && b.bump <= 0 && !(b.ahead && !b.ahead.panic && !fleeing)) {
          // bumped a solid: a leader (or a loner, or a bolting bug) turns round;
          // a follower just slides along it and keeps station on the one ahead
          b.bump = 0.7; b.head += Math.PI + (r() - 0.5) * 1.2;
        }
        // own leg clock per beetle (was `i * 1.7`, which locked neighbours in a
        // train into a marching-band step and sold the "identical clones" read)
        const scuttle = Math.sin(t * b.rate + b.ph);
        const s = b.scale;
        const lift = Math.abs(scuttle) * 0.025 * s;
        pool.place(i, b.x, b.y + 0.195 * s + lift, b.z,
          b.head + scuttle * 0.16,
          s * (1 + scuttle * 0.04), s * (1 - scuttle * 0.05), s,
          0, scuttle * 0.09);
        // contact shadow — a beetle without one hovers over the frosting
        shade.set(i, b.x, b.y, b.z, s * 0.42, lift * 1.5, b.head);
      }
      if (squeaked) for (const b of bugs) if (p && Math.hypot(b.x - p.x, b.z - p.z) < 14) b.panic = 1;
      pool.flush();
    },
  };
  return api;
}
