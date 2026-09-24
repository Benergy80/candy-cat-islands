// ─────────────────────────────────────────────────────────────────────────────
// LAMP POOL — the game's constant set of real PointLights (both tiers).
//
// three shades every visible PointLight for every lit fragment — at intensity
// 0 by day too — and every change in the NUMBER of lights recompiles every lit
// program in the scene (the desktop dusk used to link 87 programs in one frame:
// 0.87 s with a warm shader cache, ~8.7 s cold). So nothing in the world owns a
// PointLight any more: lamps, room lights, the palace and cave lamps register
// ANCHORS here, and a fixed pool of N lights (always visible, so the light
// count — and therefore every compiled program — never changes) follows the
// anchors that matter to the frame. A slot fades out before it moves and fades
// in where it lands, so a lamp never pops. The lantern globes, lit windows and
// additive light pools still glow at every lamp: they are emissive surfaces.
//
//   const pool = getLampPool(ctx)          // N = 3 on mobile, DESKTOP_SLOTS on desktop
//   const a = pool.add({ x, y, z, color, dist, decay, priority? })
//   a.level = intensity you want right now (base × night)   — any time
//   a.x/y/z = where it is (a moving anchor just writes these)
//
// Which anchors get a slot (evaluated once per frame, in scene.onBeforeRender,
// with the camera the frame is drawn with — i.e. after every system updated):
//   · lit (level > 0) and its sphere of influence (centre, `dist`: three cuts a
//     PointLight to exactly 0 beyond `distance`) intersects the view frustum —
//     a lamp whose light cannot reach any visible pixel is never worth a slot;
//   · `priority` anchors first (the room you are standing in, the visitor's
//     own night fill), then by how much of the frame the light can reach: its
//     cutoff radius over its distance from the lens (the size of its sphere
//     of influence on screen), × level^¼ (a bright street lamp outranks a
//     lantern at the same size). When no more than N anchors pass the frustum
//     test — the normal case — the frame is exactly what N separate lights
//     would have drawn; past N the lights that reach the least go dark first
//     (their globes, halos and pools still glow: those are emissive).
//
// ADOPTION. A PointLight that some system still adds to the scene itself (the
// visitor's night fill, the Sour Patch eye lights, the ferry's deck lanterns,
// the tiger lanterns) is ADOPTED at world:ready: it keeps its owner, who keeps
// driving its visible / intensity / colour / position exactly as before, but
// its layers are cleared so three never adds it to the light list; the pool
// mirrors it as an anchor instead (level = intensity while it is shown). Set
// `light.userData.poolExempt = true` before world:ready to keep a light out of
// the pool (its owner then owns the recompiles it causes).
//
// THE SEA WITHOUT POINT LIGHTS (desktop, setWater). Every point-light slot is
// code in every lit program even when the light is skipped, and on the sea —
// by far the heaviest fragment shader — that code alone costs ~1.5 ms of GPU at
// the sea crossing (register pressure, measured with all six slots skipped).
// terrain/water.js therefore keeps a TWIN of the sea material compiled without
// the point-light loop, and the pool swaps it in for any frame where no lit
// slot's sphere of influence can touch a sea fragment (a conservative test
// against the sea mesh's own quads: common.js seaDistance, built by water.js):
// a point light contributes exactly 0 beyond its cutoff distance, so that
// frame is the same frame. By day that is every frame but the ones with a lit
// room by the shore. (Only pool slots are tested: a PointLight added to the
// scene after world:ready is never adopted — it would also change the light
// count, which nothing may do — and the twin would not see it.)
//
// Zero allocation per frame.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { damp } from '../../core/util.js';

const POOLS = new WeakMap();
/** Desktop pool size: the most lit lights whose reach is in frame at any
 *  street-level night view. Fish Harbor's Main Street at 22:00 has nine (its
 *  six street lamps, the two tiger lanterns and the visitor's fill — six slots
 *  darkened the tigers' cobbles and the tower's wash, 0.8% of the frame), and
 *  a survey of 37 night views found nothing nearer than 112 u left out at
 *  nine. A dark slot costs one uniform test per fragment (sky.js skips it);
 *  what a slot still costs is code in every lit program, which the sea — the
 *  heaviest shader — is spared by day (see setWater). */
export const DESKTOP_SLOTS = 9;
const MOBILE_SLOTS = 3;

export function getLampPool(ctx, n) {
  let P = POOLS.get(ctx.scene);
  if (P) { if (n > P.slots.length) P.grow(n); return P; }
  const N0 = n ?? (ctx.state?.mobile ? MOBILE_SLOTS : DESKTOP_SLOTS);
  const group = new THREE.Group(); group.name = 'world_lamp_pool';
  ctx.scene.add(group);
  const anchors = [];
  const adopted = [];     // { light, anchor }
  const slots = [];
  let rendered = false, snapNext = false;
  let lastT = -1, candidates = 0, maxCandidates = 0;
  let water = null, waterLit = null;   // see setWater
  const want = [];
  function addSlot() {
    const light = new THREE.PointLight(0xffc98a, 0, 20, 2);
    light.position.set(0, -500, 0);
    group.add(light);
    slots.push({ light, anchor: null, k: 0 });
    want.push(null);
  }
  for (let i = 0; i < N0; i++) addSlot();

  // scratch
  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const sph = new THREE.Sphere();

  function score(a, cp) {
    if (!(a.level > 0.001)) return Infinity;
    sph.center.set(a.x, a.y, a.z); sph.radius = a.dist;
    if (!frustum.intersectsSphere(sph)) return Infinity;
    if (a.priority) return -1e9;
    // lower is better: minus the on-screen size of its reach, brightness-weighted
    const dx = a.x - cp.x, dy = a.y - cp.y, dz = a.z - cp.z;
    const dCam = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz) - a.dist * 0.5);
    return -(a.dist / dCam) * Math.sqrt(Math.sqrt(a.level));
  }
  const shown = (o) => { for (let t = o; t; t = t.parent) if (!t.visible) return false; return true; };
  function mirrorAdopted() {
    const pl = ctx.systems.player?.position;
    for (let i = 0; i < adopted.length; i++) {
      const { light: L, anchor: A } = adopted[i];
      const e = L.matrixWorld.elements;          // fresh: scene.updateMatrixWorld() ran first
      A.x = e[12]; A.y = e[13]; A.z = e[14];
      A.level = shown(L) ? L.intensity : 0;
      A.color.copy(L.color); A.dist = L.distance > 0 ? L.distance : 60; A.decay = L.decay;
      // the visitor's own night fill always keeps its slot (it is what keeps
      // him the brightest thing on screen after dark)
      if (pl) { const px = A.x - pl.x, pz = A.z - pl.z; A.priority = px * px + pz * pz < 2.25 && A.dist <= 10; }
    }
  }

  function run(camera, dt) {
    mirrorAdopted();
    camera.updateMatrixWorld();
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    const n = slots.length;
    // the N best anchors (insertion into a fixed array: no allocation)
    for (let i = 0; i < n; i++) want[i] = null;
    candidates = 0;
    for (let a = 0; a < anchors.length; a++) {
      const A = anchors[a], s = score(A, camera.position);
      if (s === Infinity) continue;
      candidates++;
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
      if (!wanted && S.anchor && S.k > 0.02 && !snapNext) { S.k = damp(S.k, 0, 5, dt); continue; }
      if (!wanted) {
        S.anchor = null; S.k = 0;
        for (let i = 0; i < n; i++) {
          const A = want[i]; if (!A) continue;
          let held = false; for (const O of slots) if (O.anchor === A) { held = true; break; }
          if (held) continue;
          S.anchor = A; break;
        }
      }
      // a moving anchor (the room light, an adopted lantern) is followed
      if (S.anchor) {
        const A = S.anchor;
        S.light.position.set(A.x, A.y, A.z); S.light.color.copy(A.color);
        S.light.distance = A.dist; S.light.decay = A.decay;
        // the first frame after a time jump lands lit, not faded
        S.k = snapNext ? 1 : damp(S.k, 1, 5, dt);
      }
    }
    for (const S of slots) {
      S.light.intensity = S.anchor ? S.anchor.level * S.k : 0;
      S.light.updateMatrixWorld();
    }
    if (candidates > maxCandidates) maxCandidates = candidates;
    if (water) {
      // can any lit slot reach a sea fragment? (sphere vs the sea's slab and
      // its footprint; three cuts a PointLight to exactly 0 at `distance`)
      let lit = false;
      for (const S of slots) {
        const L = S.light; if (!(L.intensity > 0)) continue;
        const r = L.distance; if (!(r > 0)) { lit = true; break; }
        const p = L.position;
        const dy = p.y > water.yTop ? p.y - water.yTop : p.y < water.yBot ? water.yBot - p.y : 0;
        if (dy >= r) continue;
        if (water.dist(p.x, p.z) < Math.sqrt(r * r - dy * dy)) { lit = true; break; }
      }
      if (lit !== waterLit) { waterLit = lit; water.apply(lit); }
    }
  }

  P = {
    group, anchors, slots, adopted,
    add(a) {
      const rec = { x: a.x, y: a.y, z: a.z, color: new THREE.Color(a.color ?? 0xffc98a), dist: a.dist ?? 20, decay: a.decay ?? 2, level: 0, priority: !!a.priority, _s: 0 };
      anchors.push(rec);
      return rec;
    },
    /** More slots — only before the first render (after it, the count is fixed). */
    grow(n) {
      if (rendered) { console.warn('[lamppool] grow(' + n + ') after the first render ignored: the light count is fixed'); return; }
      while (slots.length < n) addSlot();
    },
    /** Adopt every PointLight in the scene that is not a pool slot (see the header). */
    adopt() {
      const found = [];
      ctx.scene.traverse((o) => {
        if (!o.isPointLight || o.parent === group || o.userData.poolExempt || o.userData.poolAdopted) return;
        found.push(o);
      });
      for (const L of found) {
        L.userData.poolAdopted = true;
        L.layers.disableAll();                 // three skips it when it builds the light list
        const A = P.add({ x: 0, y: -500, z: 0, color: L.color, dist: L.distance > 0 ? L.distance : 60, decay: L.decay });
        A.name = L.name || (L.parent && L.parent.name) || (L.parent && L.parent.parent && L.parent.parent.name) || 'light';
        adopted.push({ light: L, anchor: A });
      }
      return found.length;
    },
    /** Compatibility: the pool now runs itself before every render (see the header). */
    update() {},
    /**
     * The sea twin (see the header): `dist(x, z)` = a lower bound on the
     * distance to any sea fragment, `yBot`/`yTop` = the sea surface's height
     * range, `apply(lit)` = called (before the frame's render list is built)
     * whenever "a lit slot can reach the sea" changes.
     */
    setWater(w) { water = w; waterLit = null; },
    stats() {
      let lit = 0; for (const S of slots) if (S.light.intensity > 0) lit++;
      return { slots: slots.length, anchors: anchors.length, adopted: adopted.length, lit, candidates, maxCandidates, waterLit,
        held: slots.map((S) => (S.anchor ? (S.anchor.name || 'anchor') + '@' + Math.round(S.anchor.x) + ',' + Math.round(S.anchor.z) + ' k' + S.k.toFixed(2) : '-')) };
    },
  };

  // run once per frame with the frame's camera (after every system updated),
  // chained onto scene.onBeforeRender, never replacing a hook
  const prev = ctx.scene.onBeforeRender;
  ctx.scene.onBeforeRender = function (renderer, sc, camera, target) {
    if (prev) prev.call(this, renderer, sc, camera, target);
    if (!camera || !camera.isCamera || target) return;
    rendered = true;
    const t = ctx.state.elapsed;
    if (t === lastT) return;
    const dt = lastT < 0 ? 1 / 30 : Math.min(0.25, t - lastT);
    lastT = t;
    try { run(camera, dt); } catch (err) { if (!P.warned) { P.warned = true; console.error('[lamppool] failed', err); } }
    snapNext = false;
  };
  // a time jump lands with the lamps already where they belong (no cross-fade)
  ctx.events?.on?.('time:set', () => { snapNext = true; });
  ctx.events?.on?.('world:ready', () => { P.adopt(); });

  POOLS.set(ctx.scene, P);
  return P;
}
