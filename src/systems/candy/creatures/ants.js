// SPRINKLE-ANTS — a 30-strong column marching along the licorice path edge into
// Gumdrop Village. Two lanes: the westbound lane walks out empty, the eastbound
// lane hauls sprinkle crumbs home to the sugar anthill. One of them is carrying
// something far too big for it.
import * as THREE from 'three';
import { rng, hash } from '../../../core/util.js';
import { CANDY } from '../../../core/palette.js';
import { Pool, part, mergeParts, shadeAxis, uiSay } from './common.js';

// Anthill → crumb pile, hugging the shoulder of candy_main where it runs into
// Gumdrop Village. Round 3 critique: "the ants must be findable". The old
// hand-typed line sat 4–7 u off the centreline of a 3.2 u path — i.e. out in
// the gumdrop bushes, not on the road at all. It is now DERIVED from the path
// polyline, 2.25 u off centre, which puts the column right on the licorice edge
// where you walk past it.
const TRAIL_X = [-121, -127, -133, -139, -145];
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

// Round 3 critique: "sprinkle ants must be findable — a visible dark line of
// 10–20 along the village path edge". They were neither dark nor findable: a
// bright sprinkle abdomen lit from above on a pale frosting path, at a scale
// where one ant was ~0.6 u long. Now the whole body is a deep chocolate mass
// with only the crown of the abdomen taking the sprinkle tint, they are half
// again as big, and the column is packed tighter so 20 of them read as ONE dark
// line rather than thirty separate dots.
function antGeo() {
  const abd = part(new THREE.SphereGeometry(1, 5, 3), { pos: [0, 0.02, -0.19], scale: [0.13, 0.12, 0.185] });
  shadeAxis(abd, 'y', 0.02, 0.13, 0x3d2530, 0xffffff);     // dark flanks, tinted crown
  const parts = [
    abd,
    part(new THREE.SphereGeometry(1, 4, 2), { pos: [0, 0.015, 0], scale: 0.09, color: 0x271520 }),
    part(new THREE.SphereGeometry(1, 4, 2), { pos: [0, 0.035, 0.15], scale: [0.095, 0.09, 0.095], color: 0x271520 }),
    part(new THREE.ConeGeometry(0.016, 0.17, 3, 1, true), { pos: [0.045, 0.10, 0.18], rot: [-0.8, 0, -0.35], color: 0x1d0f16 }),
    part(new THREE.ConeGeometry(0.016, 0.17, 3, 1, true), { pos: [-0.045, 0.10, 0.18], rot: [-0.8, 0, 0.35], color: 0x1d0f16 }),
  ];
  // six stubby legs — at 3× scale they are the thing that makes the line read
  // as marching insects instead of a dotted stripe painted on the path
  for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 3; k++) {
    parts.push(part(new THREE.ConeGeometry(0.018, 0.14, 3, 1, true), {
      pos: [s * 0.09, -0.03, -0.12 + k * 0.12], rot: [0.2, 0, s * 1.15], color: 0x1d0f16,
    }));
  }
  return mergeParts(parts);
}

export function create(env) {
  const { ctx, world, scene, shadowField } = env;
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
      samples.push({ x, z, y: world.height(x, z), s: total + seg * u, dir: Math.atan2(bx - ax, bz - az) });
    }
    total += seg;
  }
  const last = TRAIL[TRAIL.length - 1];
  samples.push({ x: last[0], z: last[1], y: world.height(last[0], last[1]), s: total, dir: samples[samples.length - 1].dir });
  const LEN = total;
  function at(s) {
    s = ((s % LEN) + LEN) % LEN;
    let i = Math.min(samples.length - 2, Math.floor(s / LEN * (samples.length - 1)));
    while (i > 0 && samples[i].s > s) i--;
    while (i < samples.length - 2 && samples[i + 1].s < s) i++;
    const a = samples[i], b = samples[i + 1];
    const u = (s - a.s) / Math.max(1e-4, b.s - a.s);
    return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, y: a.y + (b.y - a.y) * u, dir: a.dir };
  }

  const N = 30;
  const antMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 });
  const crumbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, flatShading: true });
  const ants = new Pool(scene, antGeo(), antMat, N, { name: 'sprinkle-ants', cast: false });
  const crumbs = new Pool(scene, part(new THREE.IcosahedronGeometry(0.14, 0), { color: 0xffffff }), crumbMat, N, { name: 'ant-crumbs', cast: false });

  const column = [];
  for (let i = 0; i < N; i++) {
    const lane = i % 2;                 // 0 = homeward (carrying), 1 = outbound (empty)
    const k = Math.floor(i / 2);
    column.push({
      lane, s: (k * 1.24 + (lane ? 0.62 : 0)) % LEN, side: lane ? 0.52 : -0.52,
      speed: 0.72 + r() * 0.16, ph: r() * 6.283, scale: 2.9 + r() * 0.6,
      big: i === 8 ? 2.9 : 1 + r() * 0.5,
    });
    ants.tint(i, CANDY.sprinkle[(i * 3 + lane) % CANDY.sprinkle.length]);
    crumbs.tint(i, CANDY.sprinkle[i % CANDY.sprinkle.length]);
  }
  ants.flushColors(); crumbs.flushColors();
  const shade = shadowField.claim(N);

  ctx.events.on('world:ready', () => {
    ctx.systems.interaction?.register({
      id: 'ant_highway', x: (HILL[0] + CRUMBS[0]) / 2, z: (HILL[1] + CRUMBS[1]) / 2, r: 3.2,
      label: 'Study the sprinkle-ant highway',
      onInteract() {
        uiSay(ctx, 'Two lanes. Right side hauls, left side returns. Someone painted a tiny line.',
          { speaker: 'Sprinkle-Ant Highway 1', duration: 5 });
        ctx.systems.story?.set('saw_ant_highway', true);
      },
    });
  });

  return {
    name: 'ants', trailLength: LEN, at,
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      const night = 1 - (ctx.state.daylight ?? 1);
      for (let i = 0; i < N; i++) {
        const a = column[i];
        const dir = a.lane ? 1 : -1;
        a.s += dir * a.speed * dt * (1 - night * 0.45);
        const p = at(a.s);
        const yaw = p.dir + (a.lane ? 0 : Math.PI);
        // sidestep offset perpendicular to travel + a wiggle
        const px = Math.cos(p.dir), pz = -Math.sin(p.dir);
        const wig = Math.sin(t * 7 + a.ph) * 0.06;
        const x = p.x + px * (a.side + wig), z = p.z + pz * (a.side + wig);
        const step = Math.abs(Math.sin(t * 13 + a.ph));
        const s = a.scale;
        ants.place(i, x, p.y + 0.1 * s + step * 0.015, z, yaw + Math.sin(t * 9 + a.ph) * 0.12, s, s, s, 0, Math.sin(t * 13 + a.ph) * 0.1);
        if (a.lane === 0) {
          const cs = a.big;
          crumbs.place(i, x + Math.sin(yaw) * 0.1, p.y + 0.26 * s + cs * 0.07 + step * 0.02, z + Math.cos(yaw) * 0.1,
            t * 0.6 + a.ph, cs, cs, cs, 0, Math.sin(t * 4 + a.ph) * 0.2);
        } else crumbs.hide(i);
        shade.set(i, x, p.y, z, s * 0.26, 0, yaw);
      }
      ants.flush(); crumbs.flush();
    },
  };
}
