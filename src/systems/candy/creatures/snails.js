// GUMDROP SNAILS — 12 very slow, very sincere snails with sugar-crusted spiral
// shells. They leave a faint sugar trail behind them (particles). Poke one and
// it retracts into the shell with a wet little noise, then sheepishly re-emerges.
import * as THREE from 'three';
import { rng, hash } from '../../../core/util.js';
import { CANDY } from '../../../core/palette.js';
import { Pool, part, mergeParts, shadeAxis, TAU, walkable, turnToward, pathShoulder, uiSay } from './common.js';

const ZONES = [
  { x: -200, z: -20, r: 28, n: 6, path: 0.8 },   // Gummy Forest floor + forest path
  { x: -124, z: 26, r: 14, n: 3, path: 0.7 },    // syrup-river bank (candy_river view)
  { x: -112, z: -34, r: 16, n: 3, path: 0.95 },  // Lollipop Meadow lane
];
const SHELL_HUES = [0xff6a9c, 0x8be06a, 0x6ab8ff, 0xffc93a, 0xc07bff, 0xff8a4a];

function shellGeo() {
  const t = part(new THREE.TorusGeometry(0.23, 0.125, 4, 7), { rot: [0, Math.PI / 2, 0], scale: [0.62, 1, 1] });
  shadeAxis(t, 'y', -0.3, 0.3, 0x8a7080, 0xffffff);
  return mergeParts([
    t,
    part(new THREE.SphereGeometry(1, 5, 3), { scale: [0.1, 0.16, 0.16], color: 0xfff0f6 }),
  ]);
}

function bodyGeo() {
  const foot = part(new THREE.SphereGeometry(1, 6, 3), { pos: [0, 0, 0.04], scale: [0.14, 0.105, 0.34] });
  shadeAxis(foot, 'y', -0.1, 0.08, 0xa89098, 0xfffaf0);
  const parts = [
    foot,
    part(new THREE.SphereGeometry(1, 5, 3), { pos: [0, 0.05, 0.27], scale: [0.115, 0.1, 0.12], color: 0xfffaf0 }),
  ];
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.ConeGeometry(0.022, 0.2, 3, 1, true), { pos: [s * 0.055, 0.14, 0.29], rot: [-0.3, 0, -s * 0.28], color: 0xf7e6ee }));
    parts.push(part(new THREE.TetrahedronGeometry(0.048), { pos: [s * 0.08, 0.26, 0.33], color: 0x2a1820 }));
  }
  return mergeParts(parts);
}

export function create(env) {
  const { ctx, world, scene, shadowField } = env;
  const r = rng(hash('candy-snails'));
  const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });

  const snails = [];
  for (const zone of ZONES) {
    for (let k = 0; k < zone.n; k++) {
      let x = 0, z = 0, ok = false;
      for (let tries = 0; tries < 60 && !ok; tries++) {
        const a = r() * TAU, rr = Math.sqrt(r()) * zone.r;
        x = zone.x + Math.cos(a) * rr; z = zone.z + Math.sin(a) * rr;
        if (r() < zone.path) { const q = pathShoulder(world, x, z, 'candy', 1.0, 3.6, r); if (q) { x = q.x; z = q.z; } }
        ok = walkable(world, x, z, 2.4);
      }
      snails.push({ x, z, y: world.height(x, z), head: r() * TAU, curve: (r() - 0.5) * 0.3, scale: 1.45 + r() * 0.45, ph: r() * TAU, retract: 0, trail: r() * 0.5, yTimer: 0 });
    }
  }
  const N = snails.length;
  const shells = new Pool(scene, shellGeo(), shellMat, N, { name: 'snail-shells' });
  const bodies = new Pool(scene, bodyGeo(), bodyMat, N, { name: 'snail-bodies', cast: false });
  snails.forEach((s, i) => { shells.tint(i, SHELL_HUES[Math.floor(r() * SHELL_HUES.length)]); bodies.tint(i, 0xfff3e8); });
  shells.flushColors(); bodies.flushColors();
  const shade = shadowField.claim(N);

  const POKES = ['*shloop*', 'Nope. Nope nope nope.', '…', 'It was having a nice time.', 'Come back in an hour.'];
  let poked = 0;
  ctx.events.on('world:ready', () => {
    snails.forEach((s, i) => {
      ctx.systems.interaction?.register({
        id: `snail_${i}`, r: 2.2, label: 'Poke the gumdrop snail',
        getPos: () => s,
        onInteract() {
          s.retract = 1; poked++;
          uiSay(ctx, POKES[Math.min(poked - 1, POKES.length - 1)], { speaker: 'Gumdrop Snail', duration: 2.4 });
          ctx.systems.particles?.burst({ x: s.x, y: s.y + 0.45, z: s.z, count: 8, color: [CANDY.sourSugar, CANDY.cream, 0xffd6e8], speed: 1.4, life: 0.8, size: 0.11, gravity: -3, spread: 0.4 });
          ctx.systems.story?.set('snail_poked', poked);
        },
      });
    });
  });

  return {
    name: 'snails', snails,
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      for (let i = 0; i < N; i++) {
        const s = snails[i];
        s.retract = Math.max(0, s.retract - dt * 0.28);
        const hiding = s.retract > 0.02 ? 1 - Math.pow(1 - s.retract, 3) : 0;
        const crawl = (1 - hiding) * 0.26;
        s.head += s.curve * dt;
        if ((s.ph += dt) > 6) { s.ph = 0; s.curve = (r() - 0.5) * 0.4; }
        const nx = s.x + Math.sin(s.head) * crawl * dt;
        const nz = s.z + Math.cos(s.head) * crawl * dt;
        if (walkable(world, nx, nz, 2.0)) { s.x = nx; s.z = nz; } else s.head = turnToward(s.head, s.head + 1.8, dt * 2);
        if ((s.yTimer -= dt) <= 0) { s.yTimer = 0.4; s.y = world.height(s.x, s.z); }

        const sc = s.scale;
        const bob = Math.sin(t * 1.6 + i) * 0.012;
        const ripple = Math.sin(t * 4.5 + i * 2.1) * (1 - hiding);
        shells.place(i, s.x, s.y + 0.40 * sc + bob, s.z, s.head, sc, sc * (1 + ripple * 0.02), sc, 0, ripple * 0.05);
        const pull = hiding * 0.3;
        bodies.place(i, s.x - Math.sin(s.head) * pull, s.y + 0.11 * sc + bob * 0.5, s.z - Math.cos(s.head) * pull,
          s.head, sc * (1 - hiding * 0.35), sc * (1 - hiding * 0.6), sc * (1 - hiding * 0.72));

        shade.set(i, s.x, s.y, s.z, sc * 0.46, 0, s.head);

        // sugar trail
        if ((s.trail -= dt) <= 0 && crawl > 0.05) {
          s.trail = 0.42;
          ctx.systems.particles?.burst({
            x: s.x - Math.sin(s.head) * 0.3, y: s.y + 0.06, z: s.z - Math.cos(s.head) * 0.3,
            count: 1, color: [CANDY.sourSugar, 0xffe9f3], speed: 0.1, life: 4.0, size: 0.15, gravity: -0.04, spread: 0.22,
          });
        }
      }
      shells.flush(); bodies.flush();
    },
  };
}
