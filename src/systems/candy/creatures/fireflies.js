// GLOWING NERDS — 80 candy-shard "fireflies" that only come out after dark.
// They are not insects. They are Nerds. They hum. Two swarms: deep in the Gummy
// Forest, and Nerd Hollow just west of Gumdrop Village.
//
// Round 3 critique: the swarm read as a field of hard little diamonds. It was.
// The bright bit of a nerd was a real emissive icosahedron — at the game camera
// that is an 8-px polygon with a crisp silhouette, and a crisp silhouette is a
// SHARD, not a light. Both halves are now sprites: a hot core whose alpha is
// ~1 for two pixels and zero well inside the quad, sitting in a wide coloured
// halo that also reaches zero alpha before its edge. Same two draw calls,
// 2.4k fewer triangles, and nothing in the frame has a hard edge any more.
import * as THREE from 'three';
import { rng, hash, smoothstep } from '../../../core/util.js';
import { Pool, glowMaterial, coreTexture, buildingRects, TAU, walkable } from './common.js';

const SWARMS = [
  { x: -208, z: -30, r: 27, n: 70 },   // Gummy Forest interior
  { x: -158, z: 20, r: 13, n: 40 },    // Nerd Hollow
  // Critique fix: the hollow sits just past the top edge of the candy_night
  // frame, so the village looked firefly-less at midnight. This swarm hangs on
  // the dark shoulder of the licorice road right where the houses stop — the
  // one you actually walk into on your way home.
  { x: -147, z: 33, r: 8.5, n: 38 },   // Gumdrop Village edge
];
const HUES = [0xff5c8d, 0x63e0ff, 0xffe23a, 0x7cff9a, 0xc07bff, 0xff8a3d, 0xfff0f5];

export function create(env) {
  const { ctx, world, scene } = env;
  const r = rng(hash('candy-nerd-fireflies'));
  const N = SWARMS.reduce((a, s) => a + s.n, 0);

  // core: a 2-px white centre with a radial falloff that is already at zero
  // alpha by 60% of the quad — no rim, no polygon, no diamond.
  const coreMat = glowMaterial(1.0, coreTexture());
  const nerds = new Pool(scene, new THREE.PlaneGeometry(1, 1), coreMat, N, { name: 'glowing-nerds', cast: false });
  // halo: the wide coloured bloom the core sits inside
  const halos = new Pool(scene, new THREE.PlaneGeometry(1, 1), glowMaterial(0.6), N, { name: 'nerd-glow', cast: false });
  halos.mesh.renderOrder = 3;
  nerds.mesh.renderOrder = 4;

  // the village swarm must not hang inside somebody's gingerbread front room
  const rooms = buildingRects(ctx);
  const indoors = (x, z) => {
    for (const b of rooms) if (Math.hypot(x - b.x, z - b.z) < b.rad) return true;
    return false;
  };

  const bugs = [];
  for (const sw of SWARMS) {
    for (let k = 0; k < sw.n; k++) {
      let x = 0, z = 0, ok = false;
      for (let tries = 0; tries < 30 && !ok; tries++) {
        const a = r() * TAU, rr = Math.sqrt(r()) * sw.r;
        x = sw.x + Math.cos(a) * rr; z = sw.z + Math.sin(a) * rr;
        ok = walkable(world, x, z, 1.0) && !indoors(x, z);
      }
      const i = bugs.length;
      bugs.push({
        x, z, g: world.height(x, z), rr: 0.8 + r() * 2.6, a: r() * TAU,
        w: (0.25 + r() * 0.55) * (r() < 0.5 ? -1 : 1), ph: r() * TAU,
        hi: 0.6 + r() * 2.4, rate: 0.9 + r() * 1.6, scale: 0.115 + r() * 0.085,
      });
      const hue = HUES[Math.floor(r() * HUES.length)];
      // the core keeps a washed-out version of the hue so it clips to white at
      // the centre and bleeds the nerd's colour on the way out
      const c = new THREE.Color(hue).lerp(new THREE.Color(0xffffff), 0.62);
      nerds.tintRGB(i, c.r, c.g, c.b); halos.tint(i, hue);
    }
  }
  nerds.flushColors(); halos.flushColors();

  return {
    name: 'fireflies', bugs,
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      const vis = 1 - smoothstep(0.02, 0.4, ctx.state.daylight ?? 1);
      nerds.mesh.visible = halos.mesh.visible = vis > 0.02;
      if (!nerds.mesh.visible) return;
      coreMat.opacity = vis;
      halos.mat.opacity = 0.85 * vis;
      const camQ = ctx.camera.quaternion;
      for (let i = 0; i < N; i++) {
        const b = bugs[i];
        b.a += b.w * dt;
        const x = b.x + Math.cos(b.a) * b.rr;
        const z = b.z + Math.sin(b.a) * b.rr * 0.85;
        const y = b.g + b.hi + Math.sin(t * 0.9 + b.ph) * 0.55 + Math.sin(t * 3.1 + b.ph * 2) * 0.1;
        const blink = Math.max(0, Math.sin(t * b.rate + b.ph));
        const s = b.scale * vis * (0.8 + blink * 0.45);
        // core quad ≈ 0.35 u across → a couple of pixels of solid white at 31 u
        nerds.billboard(i, x, y, z, s * (1.5 + blink * 0.9), camQ);
        halos.billboard(i, x, y, z, s * (5.2 + blink * 6.4), camQ);
      }
      nerds.flush(); halos.flush();
    },
  };
}
