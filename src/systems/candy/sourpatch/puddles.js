// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KID — the pool of liquid a kid becomes when it walks into water.
//
// Ben, 2026-09-23: "If they touch water they should melt into a pool of liquid
// that is their color." One InstancedMesh (≤ MAX pools, one draw call, hidden
// entirely while no pool exists): a flat, slightly irregular blob in the KID'S
// OWN COLOUR, glossy (roughness 0.12 + a painted-on window highlight), with a
// lighter meniscus rim that fades to nothing at the edge. It spreads to
// FULL_R (1.4 u) while the kid slumps, FLOATS on the water surface (the sea's
// shore waves included), drifts a little (downstream on the river), fizzes a
// couple of bubbles and rings in its own colour, and after LIFE (25 s) has
// thinned and shrunk away into the water.
//
//   spawn(x, z, color, kidIndex, delay) → pool index
//   update(dt, t, daylight)            per frame (zero allocation)
//   list()                              debug: [{x, z, y, r, color, kid, age}]
//   active                              live pools right now
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const PUDDLE_LIFE = 25;       // s on the water before it has dissolved into it
const MAX = 10;
const GROW = 1.3;                    // s to spread to full size
export const PUDDLE_R = 1.4;         // full radius (u)
const FADE = 6;                      // the last seconds: thins and shrinks away
const LIFT = 0.05;                   // above the surface (plus polygon offset)
const DRIFT_TAU = 11;                // s: drift speed decays with this (total drift ≤ v × τ ≈ 0.9 u)
const SEAT = 0.9;                    // a pool is eased this far out onto deeper water

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _flow = { x: 0, z: 0 };
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

/** A unit disc with a lumpy edge, lying flat (normal +Y). UVs follow the
 *  lumps so the texture's rim traces the real outline. */
function blobGeometry(rand) {
  const SEG = 40;
  const pos = new Float32Array((SEG + 1) * 3), uv = new Float32Array((SEG + 1) * 2), nrm = new Float32Array((SEG + 1) * 3);
  const idx = [];
  const p1 = rand() * 6.28, p2 = rand() * 6.28, p3 = rand() * 6.28;
  uv[0] = 0.5; uv[1] = 0.5; nrm[1] = 1;
  for (let i = 0; i < SEG; i++) {
    const a = i / SEG * Math.PI * 2;
    const r = 1 + 0.075 * Math.sin(3 * a + p1) + 0.05 * Math.sin(5 * a + p2) + 0.03 * Math.sin(8 * a + p3);
    const v = i + 1;
    pos[v * 3] = Math.cos(a) * r; pos[v * 3 + 1] = 0; pos[v * 3 + 2] = -Math.sin(a) * r;
    uv[v * 2] = 0.5 + 0.5 * Math.cos(a); uv[v * 2 + 1] = 0.5 + 0.5 * Math.sin(a);
    nrm[v * 3 + 1] = 1;
    idx.push(0, v, i === SEG - 1 ? 1 : v + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Radial RGBA: a slightly deeper middle with a few thicker swirls, a lighter
 *  meniscus ring at 80–90 %, alpha falling to nothing at the edge. White-ish
 *  so the instance colour (the kid's own hue) comes through saturated. */
function puddleTexture(rand) {
  const S = 128, cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0.00, 'rgba(214,214,214,0.90)');
  grd.addColorStop(0.62, 'rgba(236,236,236,0.93)');
  grd.addColorStop(0.80, 'rgba(255,255,255,1.0)');
  grd.addColorStop(0.88, 'rgba(255,255,255,0.92)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0.0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  // thicker syrup swirls (a touch darker), never out at the rim
  for (let i = 0; i < 5; i++) {
    const a = rand() * 6.28, r = rand() * S * 0.26;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, rr = S * (0.06 + rand() * 0.07);
    const sg = g.createRadialGradient(x, y, 0, x, y, rr);
    sg.addColorStop(0, 'rgba(170,170,170,0.35)'); sg.addColorStop(1, 'rgba(170,170,170,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(x, y, rr, 0, 6.2832); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPuddles(ctx, water, rand) {
  const geo = blobGeometry(rand);
  const tex = puddleTexture(rand);
  const uGlow = { value: 0.12 }, uHi = { value: 0.45 };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: tex, transparent: true, depthWrite: false,
    roughness: 0.12, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  // syrup reads by its own colour even in moonlight (a touch of self-glow in
  // the instance hue), and "glossy" is a sharp window highlight near the
  // up-left of the blob that a flat disc's real specular only catches at one
  // camera angle
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPGlow = uGlow; sh.uniforms.uPHi = uHi;
    sh.fragmentShader = 'uniform float uPGlow;\nuniform float uPHi;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * uPGlow;
      #ifdef USE_MAP
      {
        vec2 q = (vMapUv - vec2(0.36, 0.64)) * vec2(1.0, 1.9);
        float hl = smoothstep(0.13, 0.02, length(q));
        vec2 q2 = (vMapUv - vec2(0.62, 0.40)) * vec2(1.0, 1.6);
        hl += 0.45 * smoothstep(0.06, 0.0, length(q2));
        totalEmissiveRadiance += vec3(hl) * uPHi;
      }
      #endif`);
  };
  mat.customProgramCacheKey = () => 'sourpatch-puddle';
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
  mesh.name = 'sourpatch_puddles';
  mesh.frustumCulled = false;            // instances live anywhere on the island
  mesh.renderOrder = 3;                  // after the sea (2), the river and the lake (1)
  mesh.castShadow = false; mesh.receiveShadow = false;
  for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, ZERO_M);
  mesh.visible = false;
  ctx.scene.add(mesh);

  const pools = [];
  for (let i = 0; i < MAX; i++) {
    pools.push({ on: false, x: 0, z: 0, x0: 0, z0: 0, y: 0, vx: 0, vz: 0, age: 0, r: 0,
      color: 0xffffff, kid: -1, rot: 0, spin: 0, sx: 1, sz: 1, ph: 0, bubT: 0, ringN: 0, born: 0, cols: [0xffffff, 0xffffff] });
  }
  const _b = {};                          // reused particle bag
  const _ring = { ringColor: 0xffffff, ringSize: 1, ringLife: 1.3 };   // reused ripple options
  function bag() { for (const k in _b) delete _b[k]; return _b; }
  let serial = 0;

  const api = {
    mesh, active: 0,
    /** A new pool at (x, z) in `color`, starting to spread `delay` s from now. */
    spawn(x, z, color, kid, delay = 0) {
      let slot = -1, oldest = -1, oa = -1;
      for (let i = 0; i < MAX; i++) {
        if (!pools[i].on) { slot = i; break; }
        if (pools[i].age > oa) { oa = pools[i].age; oldest = i; }
      }
      if (slot < 0) slot = oldest;
      const P = pools[slot];
      P.x0 = x; P.z0 = z;
      // the kid melted at the very edge of the water: ease the pool out toward
      // deeper water so its disc floats on the water instead of being cut in
      // half by the beach (or the river bank) it is lying against
      let bd = water.depth(x, z), ox = 0, oz = 0;
      for (let a = 0; a < 8; a++) {
        const ang = a / 8 * Math.PI * 2, cx = Math.cos(ang), cz = Math.sin(ang);
        const d = water.depth(x + cx * 1.3, z + cz * 1.3);
        if (d > bd + 0.02) { bd = d; ox = cx; oz = cz; }
      }
      x += ox * SEAT; z += oz * SEAT;
      P.on = true; P.x = x; P.z = z; P.age = -Math.max(0, delay); P.r = 0;
      P.color = color; P.cols[0] = color; P.kid = kid; P.rot = rand() * 6.28; P.spin = (rand() - 0.5) * 0.08;
      P.sx = 0.92 + rand() * 0.16; P.sz = 0.92 + rand() * 0.16; P.ph = rand() * 6.28;
      P.bubT = 0.4 + rand() * 0.4; P.ringN = 0; P.born = ++serial;
      // it drifts: downstream on the river, a slow wander on the sea and the lake
      water.flow(x, z, _flow);
      if (_flow.x || _flow.z) { P.vx = _flow.x * 0.08; P.vz = _flow.z * 0.08; }
      else if (ox || oz) { P.vx = ox * 0.05; P.vz = oz * 0.05; }             // off the shore
      else { const a = rand() * 6.28; P.vx = Math.cos(a) * 0.04; P.vz = Math.sin(a) * 0.04; }
      P.y = water.surfaceY(x, z, ctx.state.elapsed) + LIFT;
      mesh.setColorAt(slot, _c.setHex(color));
      mesh.instanceColor.needsUpdate = true;
      return slot;
    },

    update(dt, t, daylight) {
      let n = 0;
      for (let i = 0; i < MAX; i++) {
        const P = pools[i];
        if (!P.on) continue;
        P.age += dt;
        if (P.age >= PUDDLE_LIFE) { P.on = false; mesh.setMatrixAt(i, ZERO_M); continue; }
        n++;
        if (P.age < 0) { mesh.setMatrixAt(i, ZERO_M); continue; }
        // spread fast then settle (ease-out), a slow breathing wobble, and in
        // the last FADE seconds it thins and shrinks into the water
        const a = Math.min(1, P.age / GROW);
        const grow = 1 - (1 - a) * (1 - a) * (1 - a);
        const f = P.age > PUDDLE_LIFE - FADE ? (PUDDLE_LIFE - P.age) / FADE : 1;
        P.r = PUDDLE_R * grow * (0.25 + 0.75 * f * f);
        const sp = Math.exp(-P.age / DRIFT_TAU);
        P.x += P.vx * sp * dt; P.z += P.vz * sp * dt;
        P.rot += P.spin * dt;
        P.y = water.surfaceY(P.x, P.z, t) + LIFT;
        const wob = 1 + 0.035 * Math.sin(t * 2.3 + P.ph);
        _p.set(P.x, P.y, P.z);
        _q.setFromAxisAngle(_up, P.rot);
        _s.set(P.r * P.sx * wob, 1, P.r * P.sz * (2 - wob));
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(i, _m);
        // a couple of bubbles and the odd ring, in its own colour
        P.bubT -= dt;
        if (P.bubT <= 0 && f > 0.25 && P.age > 0.35) {
          P.bubT = 0.55 + rand() * 0.9;
          const ps = ctx.systems.particles;
          if (ps?.burst) {
            const o = bag(), ang = rand() * 6.28, rr = rand() * P.r * 0.65;
            o.x = P.x + Math.cos(ang) * rr; o.y = P.y + 0.04; o.z = P.z + Math.sin(ang) * rr;
            o.count = rand() < 0.4 ? 2 : 1; o.shape = 'soft';
            o.color = P.cols; o.speed = 0.25; o.up = 0.9; o.life = 0.55; o.lifeVar = 0.3;
            o.size = 0.13; o.sizeEnd = 0.2; o.sizeVar = 0.3; o.gravity = 0.6; o.drag = 2.2;
            o.spread = 0.05; o.alpha = 0.85; o.fadeIn = 0.1; o.fadeOut = 0.35;
            ps.burst(o);
          }
          if (ps?.ripple && (P.ringN++ % 3 === 0)) {
            _ring.ringColor = P.color; _ring.ringSize = P.r * 1.9; _ring.ringLife = 1.3;
            ps.ripple(P.x, P.y + 0.01, P.z, _ring);
          }
        }
      }
      api.active = n;
      mesh.visible = n > 0;
      if (n > 0) mesh.instanceMatrix.needsUpdate = true;
      // syrup keeps its colour in the dark; the highlight is a daytime thing
      uGlow.value = 0.10 + 0.22 * (1 - daylight);
      uHi.value = 0.18 + 0.32 * daylight;
    },

    /** Debug/verifier: every live pool (allocates — never call per frame). */
    list() {
      const out = [];
      for (let i = 0; i < MAX; i++) {
        const P = pools[i];
        if (!P.on) continue;
        out.push({ slot: i, x: +P.x.toFixed(2), z: +P.z.toFixed(2), y: +P.y.toFixed(2), x0: P.x0, z0: P.z0,
          r: +P.r.toFixed(2), color: P.color, kid: P.kid, age: +P.age.toFixed(2),
          meshColor: mesh.instanceColor ? '#' + _c.fromArray(mesh.instanceColor.array, i * 3).getHexString() : null });
      }
      return out;
    },
  };
  return api;
}
