// SYRUP FISH — gummy fish that leap out of the syrup river and Chocolate Lake
// in fat parabolic arcs, with a splash at each end. Between leaps they blow a
// single bubble so you know where to watch.
//
// Round 3 critique: two of the eleven river stations were sitting almost
// exactly under the licorice bridges (t = 0.45 is 0.9 u from the candy_north
// crossing, t = 0.60 is 0.9 u from candy_main), so the frames showed a purple
// fish hanging in mid-air over a bridge deck rather than leaping out of water.
// Stations are now SEARCHED rather than hand-listed: a candidate has to be in
// the river channel, have a real water surface under it, and be clear of every
// path crossing — which is what a bridge is. Each leap also stamps an expanding
// ripple ring on the water at both ends of the arc, so the fish visibly comes
// OUT of the surface and goes back INTO it.
import * as THREE from 'three';
import { rng, hash } from '../../../core/util.js';
import { CANDY } from '../../../core/palette.js';
import { Pool, part, mergeParts, shadeAxis, rippleMaterial, TAU } from './common.js';

const HUES = [0xff5c8d, 0xffa23a, 0x63d2ff, 0x7ce38a, 0xffd84a, 0xc07bff];

/** A fan lying in the YZ plane (x = 0). pts = [[y,z], ...] */
function fin(pts) {
  const arr = [];
  for (let i = 1; i < pts.length - 1; i++) {
    arr.push(0, pts[0][0], pts[0][1], 0, pts[i][0], pts[i][1], 0, pts[i + 1][0], pts[i + 1][1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
  g.computeVertexNormals();
  return g;
}

function fishGeo() {
  const body = part(new THREE.SphereGeometry(1, 6, 4), { scale: [0.145, 0.235, 0.44] });
  shadeAxis(body, 'y', -0.2, 0.2, 0xb88ca0, 0xffffff);
  const parts = [
    body,
    part(new THREE.SphereGeometry(1, 4, 2), { pos: [0, 0.02, 0.4], scale: [0.09, 0.11, 0.11], color: 0xfff4ea }),
    part(new THREE.TetrahedronGeometry(0.055), { pos: [0.085, 0.09, 0.36], color: 0x1b1118 }),
    part(new THREE.TetrahedronGeometry(0.055), { pos: [-0.085, 0.09, 0.36], color: 0x1b1118 }),
    part(fin([[0.0, -0.36], [0.34, -0.66], [0.03, -0.5], [-0.30, -0.66]]), { color: 0xfff0f6 }),   // tail
    part(fin([[0.2, 0.06], [0.44, -0.1], [0.19, -0.24]]), { color: 0xfff0f6 }),                    // dorsal
    part(fin([[-0.16, 0.1], [-0.34, -0.02], [-0.15, -0.14]]), { color: 0xfff0f6 }),                // belly
    part(fin([[0.02, 0.14], [-0.13, -0.02], [0.02, -0.06]]), { pos: [0.13, 0, 0], rot: [0, 0, -0.5], color: 0xffe4ef }),
    part(fin([[0.02, 0.14], [-0.13, -0.02], [0.02, -0.06]]), { pos: [-0.13, 0, 0], rot: [0, 0, 0.5], color: 0xffe4ef }),
  ];
  return mergeParts(parts);
}

export function create(env) {
  const { ctx, world, scene } = env;
  const r = rng(hash('candy-fish'));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.22, metalness: 0.05, side: THREE.DoubleSide, flatShading: false,
  });

  // The terrain system owns the real water surfaces — ask it, and fall back to
  // the raw heightfield if it is not built yet.
  const T = ctx.systems.terrain;
  const riverY = (x, z) => (T?.riverSurfaceAt?.(x, z) ?? null) ?? world.height(x, z) + 0.05;
  const lakeY = T?.lakeSurface ?? Math.max(world.LAKE.surface, world.height(world.LAKE.x, world.LAKE.z) + 0.15);

  // ── station search: in the channel, on real water, never under a bridge ────
  // A bridge is exactly "a path crossing the river", so world.onPath() finds
  // every one of them (both licorice crossings and the candy-cane footbridge at
  // the source) without a hand-maintained list of coordinates.
  const onBridge = (x, z) => world.onPath(x, z, 3.2);
  const stations = [];
  {
    let lastT = -1;
    for (let t = 0.25; t <= 0.86; t += 0.01) {
      if (t - lastT < 0.045) continue;
      const p = world.pointOnPolyline(world.RIVER.points, t);
      if (onBridge(p.x, p.z)) continue;                       // a deck overhead
      const surf = T?.riverSurfaceAt ? T.riverSurfaceAt(p.x, p.z) : riverY(p.x, p.z);
      if (surf === null || surf === undefined) continue;       // no water here
      if (surf < world.height(p.x, p.z) - 0.1) continue;       // dry channel
      const p2 = world.pointOnPolyline(world.RIVER.points, Math.min(0.99, t + 0.03));
      const dx = p2.x - p.x, dz = p2.z - p.z, l = Math.hypot(dx, dz) || 1;
      stations.push({ x: p.x, z: p.z, y: surf + 0.04, dir: Math.atan2(dx / l, dz / l), kind: 'river' });
      lastT = t;
    }
  }
  for (let k = 0; k < 3; k++) {
    const a = r() * TAU, rr = 4 + r() * 7;
    const x = world.LAKE.x + Math.cos(a) * rr, z = world.LAKE.z + Math.sin(a) * rr;
    stations.push({ x, z, y: lakeY + 0.05, dir: r() * TAU, kind: 'lake' });
  }

  const N = stations.length;
  const pool = new Pool(scene, fishGeo(), mat, N, { name: 'syrup-fish', cast: false });

  // ── ripple rings ──────────────────────────────────────────────────────────
  // One instanced pool of flat annulus decals lying ON the water surface. A
  // ripple is spawned where the fish leaves the water and where it lands, plus
  // a slow idle one at each resting station, so a leap starts and ends in the
  // river instead of just popping into existence. Faded by tinting the instance
  // toward black (the material is additive), so no per-ripple material.
  const RIPPLES = 26;
  const rgeo = new THREE.PlaneGeometry(1, 1); rgeo.rotateX(-Math.PI / 2);
  const ripples = new Pool(scene, rgeo, rippleMaterial(0.85), RIPPLES, { name: 'syrup-ripples', cast: false });
  ripples.mesh.renderOrder = 2;
  const ring = []; let ringAt = 0;
  for (let i = 0; i < RIPPLES; i++) ring.push({ t: 1e9, life: 1, r0: 0.3, r1: 2, hue: new THREE.Color(0xffd9ec) });
  const ripple = (x, y, z, r1, life, hex) => {
    const k = ringAt++ % RIPPLES, e = ring[k];
    e.x = x; e.y = y + 0.035; e.z = z; e.t = 0; e.life = life; e.r0 = 0.35; e.r1 = r1;
    e.hue.setHex(hex);
  };

  const fish = stations.map((st, i) => {
    pool.tint(i, HUES[i % HUES.length]);
    const jumping = i % 3 !== 2;
    return {
      st, state: jumping ? 'jump' : 'rest', jt: jumping ? r() * 0.9 : 0,
      wait: 0.3 + r() * 1.6, dur: 0.9 + r() * 0.35, len: 2.6, drip: 0,
      apex: 1.8 + r() * 1.5, head: st.dir, scale: 1.7 + r() * 0.6,
      spin: (r() - 0.5) * 2.2, bub: r() * 2, idle: r() * 3,
    };
  });
  pool.flushColors();

  /** Choose an arc that both STARTS and ENDS in open water. */
  function pickLeap(f) {
    const lake = f.st.kind === 'lake';
    for (let k = 0; k < 8; k++) {
      const head = f.st.dir + (r() - 0.5) * (lake ? 3.0 : 1.0);
      const len = lake ? 2.6 + r() * 2.4 : 2.4 + r() * 1.8;
      const ex = f.st.x + Math.sin(head) * len, ez = f.st.z + Math.cos(head) * len;
      const wet = lake
        ? Math.hypot(ex - world.LAKE.x, ez - world.LAKE.z) < world.LAKE.r - 1.2
        : world.riverDist(ex, ez) < world.RIVER.width * 0.5 - 0.4 && !onBridge(ex, ez);
      if (wet || k === 7) { f.head = head; f.len = len; return; }
    }
  }

  // A leap nobody sees land is just a fish appearing and disappearing, so both
  // ends of the arc throw a fat syrup crown, stamp a ripple, and the fish trails
  // droplets off its tail on the way up.
  const splash = (f, x, z) => {
    ctx.systems.particles?.burst({
      x, y: f.st.y, z, count: 22, color: [CANDY.syrup, 0xff9ec4, CANDY.cream, 0xffe9f3],
      speed: 4.2, life: 0.95, size: 0.32, gravity: -9, spread: 0.75,
    });
    ripple(x, f.st.y, z, 4.0 + r() * 1.4, 1.6, 0xffe0f0);
  };

  return {
    name: 'fish', stations,
    update(dt, ctx) {
      for (let i = 0; i < N; i++) {
        const f = fish[i];
        if (f.state === 'rest') {
          // a slow idle ring at the station: "something is down there"
          if ((f.idle -= dt) <= 0) { f.idle = 2.4 + r() * 3.2; ripple(f.st.x, f.st.y, f.st.z, 2.4, 2.4, 0xffc9e4); }
          if ((f.bub -= dt) <= 0) {
            f.bub = 1.6 + r() * 2.4;
            ctx.systems.particles?.burst({ x: f.st.x, y: f.st.y, z: f.st.z, count: 2, color: [0xffffff, 0xffd6e8], speed: 0.7, life: 0.7, size: 0.11, gravity: -1.2, spread: 0.3 });
          }
          if ((f.wait -= dt) <= 0) {
            f.state = 'jump'; f.jt = 0; f.drip = 0;
            pickLeap(f);
            f.apex = 1.8 + r() * 1.6; f.dur = 0.95 + r() * 0.4;
            f.spin = (r() - 0.5) * 2.4;
            splash(f, f.st.x, f.st.z);
          }
          pool.hide(i);
          continue;
        }
        f.jt += dt;
        const u = f.jt / f.dur;
        if (u >= 1) {
          f.state = 'rest'; f.wait = 0.8 + r() * 2.2;
          splash(f, f.st.x + Math.sin(f.head) * f.len, f.st.z + Math.cos(f.head) * f.len);
          pool.hide(i);
          continue;
        }
        const x = f.st.x + Math.sin(f.head) * f.len * u;
        const z = f.st.z + Math.cos(f.head) * f.len * u;
        const y = f.st.y + f.apex * 4 * u * (1 - u);
        const vy = f.apex * 4 * (1 - 2 * u);
        const pitch = -Math.atan2(vy, f.len);
        const s = f.scale;
        pool.place(i, x, y, z, f.head, s, s, s, pitch, Math.sin(u * Math.PI * 2) * f.spin * 0.5);
        // droplets shaken off the tail at the top of the arc
        if ((f.drip -= dt) <= 0 && u > 0.12 && u < 0.7) {
          f.drip = 0.09;
          ctx.systems.particles?.burst({
            x: x - Math.sin(f.head) * 0.4 * s, y: y + 0.1, z: z - Math.cos(f.head) * 0.4 * s,
            count: 2, color: [CANDY.cream, 0xffe9f3], speed: 0.9, life: 0.7, size: 0.14, gravity: -7, spread: 0.5,
          });
        }
      }
      // ── ripples: expand and fade on the water surface ──────────────────────
      for (let k = 0; k < RIPPLES; k++) {
        const e = ring[k];
        if (e.t > e.life) { ripples.hide(k); continue; }
        e.t += dt;
        const u = Math.min(1, e.t / e.life);
        const rr = e.r0 + (e.r1 - e.r0) * (1 - (1 - u) * (1 - u));   // fast then easing out
        const a = (1 - u) * (1 - u) * 0.9;
        ripples.place(k, e.x, e.y, e.z, 0, rr, 1, rr);
        ripples.tintRGB(k, e.hue.r * a, e.hue.g * a, e.hue.b * a);
      }
      ripples.flush(); ripples.flushColors();
      pool.flush();
    },
  };
}
