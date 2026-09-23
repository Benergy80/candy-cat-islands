// ─────────────────────────────────────────────────────────────────────────────
// LAMP POOL — the mobile tier's constant set of real PointLights.
//
// On the desktop tier the two architecture systems own twelve PointLights (six
// per island) plus Candyland's room light. Every lit fragment in the scene
// loops over every one of them — at intensity 0 by day too — and switching the
// room light's visibility recompiles every program. On the mobile tier
// (Contract I) both islands register their lamps here as ANCHORS instead, and a
// fixed pool of N lights (always visible, so the light count — and therefore
// every compiled program — never changes) follows the anchors nearest the
// visitor. A slot fades out before it moves and fades in where it lands, so a
// lamp never pops. The lantern globes, lit windows and additive light pools
// still glow at every lamp: they are emissive surfaces, not lights.
//
//   const pool = getLampPool(ctx, 3)
//   const a = pool.add({ x, y, z, color, dist, decay, priority? })
//   a.level = intensity you want right now (base × night)   — every frame
//   pool.update(dt)   — call from any system's update; runs once per frame
//
// Zero allocation per frame.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { damp } from '../../core/util.js';

const POOLS = new WeakMap();

export function getLampPool(ctx, n = 3) {
  let P = POOLS.get(ctx.scene);
  if (P) return P;
  const group = new THREE.Group(); group.name = 'world_lamp_pool';
  ctx.scene.add(group);
  const anchors = [];
  const slots = [];
  for (let i = 0; i < n; i++) {
    const light = new THREE.PointLight(0xffc98a, 0, 20, 2);
    light.position.set(0, -500, 0);
    group.add(light);
    slots.push({ light, anchor: null, k: 0 });
  }
  let lastT = -1;
  const want = new Array(n).fill(null);

  function score(a, px, pz) {
    if (!(a.level > 0.001)) return Infinity;
    if (a.priority) return -1;
    const d = Math.hypot(a.x - px, a.z - pz);
    return d > a.dist + 40 ? Infinity : d;
  }

  P = {
    group, anchors, slots,
    add(a) {
      const rec = { x: a.x, y: a.y, z: a.z, color: new THREE.Color(a.color ?? 0xffc98a), dist: a.dist ?? 20, decay: a.decay ?? 2, level: 0, priority: !!a.priority };
      anchors.push(rec);
      return rec;
    },
    update(dt) {
      const t = ctx.state.elapsed;
      if (t === lastT) return;
      lastT = t;
      const p = ctx.systems.player?.position;
      const px = p ? p.x : 0, pz = p ? p.z : 0;
      // the N best anchors (insertion into a fixed array: no allocation)
      for (let i = 0; i < n; i++) want[i] = null;
      for (let a = 0; a < anchors.length; a++) {
        const A = anchors[a], s = score(A, px, pz);
        if (s === Infinity) continue;
        for (let i = 0; i < n; i++) {
          if (!want[i] || s < want[i]._s) {
            for (let j = n - 1; j > i; j--) want[j] = want[j - 1];
            A._s = s; want[i] = A; break;
          }
        }
      }
      // keep slots that already hold a wanted anchor; fade the rest out, then
      // hand them a wanted anchor nobody holds
      for (const S of slots) {
        let wanted = false;
        for (let i = 0; i < n; i++) if (want[i] && want[i] === S.anchor) { wanted = true; break; }
        if (!wanted && S.anchor && S.k > 0.02) { S.k = damp(S.k, 0, 5, dt); continue; }
        if (!wanted) {
          S.anchor = null; S.k = 0;
          for (let i = 0; i < n; i++) {
            const A = want[i]; if (!A) continue;
            let held = false; for (const O of slots) if (O.anchor === A) { held = true; break; }
            if (held) continue;
            S.anchor = A; S.light.position.set(A.x, A.y, A.z); S.light.color.copy(A.color);
            S.light.distance = A.dist; S.light.decay = A.decay; break;
          }
        } else {
          // a moving anchor (the room light) follows its target
          S.light.position.set(S.anchor.x, S.anchor.y, S.anchor.z); S.light.color.copy(S.anchor.color);
          S.light.distance = S.anchor.dist; S.light.decay = S.anchor.decay;
        }
        if (S.anchor) S.k = damp(S.k, 1, 5, dt);
      }
      for (const S of slots) S.light.intensity = S.anchor ? S.anchor.level * S.k : 0;
    },
  };
  POOLS.set(ctx.scene, P);
  return P;
}
