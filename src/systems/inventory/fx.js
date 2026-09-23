// ─────────────────────────────────────────────────────────────────────────────
// WEAPON FX — the three beats every shot needs so you can SEE what it did:
//
//   1. a MUZZLE BURST at the weapon tip (a coloured, outlined star),
//   2. a TRAIL RIBBON along the projectile's path (camera-facing, white core,
//      coloured body, darker rim so it reads on the white paths as well as
//      on the grass),
//   3. an IMPACT SPLAT on the target (pink crackle-stars for Pop Rocks, a blue
//      splash ring for the balloon, a white sugar puff for the jawbreaker …).
//
// Sized off the visitor's head (≈ 0.6 u): bursts ~1.4 u, splats 2–3 u, so a
// shot reads at the game camera (31 u) and not only in a close-up.
//
// Cartoon sprites, not particles: every sprite is one instance of ONE
// InstancedMesh (an atlas of hand-drawn masks: R = body, G = white core,
// B = outline), tinted per instance. Every trail is a strip in ONE dynamic
// BufferGeometry. So all weapon FX together cost at most 2 draw calls, and
// only while something is actually on screen. Unlit + not tone-mapped on
// purpose: an effect is a signal, it should not go grey in the shade.
// No allocation per frame: fixed pools, recycled records, scratch vectors.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const CELL = { burst: 0, ring: 1, splat: 2, puff: 3, sparkle: 4, bonk: 5, drops: 6, swirl: 7 };

const SPR_MAX = 96;
const TR_MAX = 18, TR_N = 18;
const SEG = 0.32;                 // a trail commits a new point every 0.32 u

// ── the atlas (4 × 2 cells of 128 px) ────────────────────────────────────────
function atlas() {
  const C = 128, cols = 4, rows = 2;
  const W = C * cols, H = C * rows;
  const out = new Uint8Array(W * H * 4);
  const cv = document.createElement('canvas'); cv.width = cv.height = C;
  const g = cv.getContext('2d');
  /** draw(fn) into the scratch canvas, return its alpha as a Float32 mask */
  function mask(fn) {
    g.clearRect(0, 0, C, C);
    g.save(); g.translate(C / 2, C / 2); g.scale(C * 0.47, C * 0.47);     // 6% margin: no bleed between cells at low mips
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.lineCap = 'round';
    fn(g);
    g.restore();
    const d = g.getImageData(0, 0, C, C).data;
    const m = new Float32Array(C * C);
    for (let i = 0; i < C * C; i++) m[i] = d[i * 4 + 3] / 255;
    return m;
  }
  function put(cell, fill, core, line) {
    const cx = (cell % cols) * C, cy = Math.floor(cell / cols) * C;
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const i = y * C + x;
        // three.js flips Y on upload for DataTexture? no — we write rows bottom-up
        const o = ((H - 1 - (cy + y)) * W + (cx + x)) * 4;
        out[o] = Math.round(fill[i] * 255);
        out[o + 1] = Math.round(Math.min(core[i], fill[i]) * 255);
        out[o + 2] = Math.round(line[i] * 255);
        out[o + 3] = 255;
      }
    }
  }
  const star = (n, r0, r1, rot = 0) => (c) => {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * Math.PI * 2, r = i % 2 ? r1 : r0;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
  };
  const circle = (x, y, r) => (c) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); };
  const filled = (path) => (c) => { path(c); c.fill(); };
  const stroked = (path, w) => (c) => { path(c); c.lineWidth = w; c.stroke(); c.fill(); };

  // 0 BURST — eight chunky rays, long/short
  {
    const p = star(8, 0.92, 0.42, -Math.PI / 2);
    put(0, mask(filled(star(8, 0.84, 0.38, -Math.PI / 2))), mask(filled(star(8, 0.5, 0.24, -Math.PI / 2))), mask(stroked(p, 0.12)));
  }
  // 1 RING — a fat annulus with a white inner highlight line
  {
    const ann = (r0, r1) => (c) => { c.beginPath(); c.arc(0, 0, r1, 0, Math.PI * 2); c.arc(0, 0, r0, 0, Math.PI * 2, true); c.fill('evenodd'); };
    put(1, mask(ann(0.66, 0.88)), mask(ann(0.72, 0.78)), mask(ann(0.6, 0.94)));
  }
  // 2 SPLAT — a lobed blob with flung droplets
  {
    const blob = (k) => (c) => {
      c.beginPath();
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const r = k * (0.56 + 0.13 * Math.sin(a * 5 + 0.7) + 0.07 * Math.sin(a * 9 + 2.1));
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
    };
    const drops = (k) => (c) => {
      for (const [a, d, r] of [[0.3, 0.82, 0.09], [1.5, 0.86, 0.07], [2.6, 0.8, 0.1], [3.9, 0.84, 0.075], [5.1, 0.83, 0.085]]) {
        c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, r * k, 0, Math.PI * 2); c.fill();
      }
    };
    put(2,
      mask((c) => { blob(1)(c); c.fill(); drops(1)(c); }),
      mask((c) => { c.translate(-0.12, -0.14); blob(0.42)(c); c.fill(); }),
      mask((c) => { blob(1)(c); c.lineWidth = 0.12; c.stroke(); c.fill(); drops(1.55)(c); }));
  }
  // 3 PUFF — a cartoon cloud: white on top, the tint shows as shading below
  {
    const B = [[-0.42, 0.14, 0.34], [0.0, -0.18, 0.44], [0.42, 0.1, 0.36], [-0.18, 0.36, 0.3], [0.22, 0.36, 0.3], [0, 0.12, 0.42]];
    const cloud = (k, dy = 0) => (c) => { for (const [x, y, r] of B) { c.beginPath(); c.arc(x * 0.98, y * 0.98 + dy, r * k, 0, Math.PI * 2); c.fill(); } };
    put(3, mask(cloud(1)), mask(cloud(0.86, -0.1)), mask((c) => { c.lineWidth = 0.1; for (const [x, y, r] of B) { c.beginPath(); c.arc(x * 0.98, y * 0.98, r * 1.1, 0, Math.PI * 2); c.fill(); } }));
  }
  // 4 SPARKLE — a four-point crackle star (Pop Rocks)
  {
    const p = star(4, 0.94, 0.2, -Math.PI / 2);
    put(4, mask(filled(star(4, 0.86, 0.17, -Math.PI / 2))), mask(filled(star(4, 0.5, 0.1, -Math.PI / 2))), mask(stroked(p, 0.1)));
  }
  // 5 BONK — a lopsided comic impact star (hits)
  {
    const p = (k) => (c) => {
      c.beginPath();
      const R = [0.95, 0.4, 0.8, 0.38, 0.98, 0.42, 0.72, 0.36, 0.9, 0.4, 0.78, 0.38];
      for (let i = 0; i < R.length; i++) { const a = (i / R.length) * Math.PI * 2 - 0.3; c.lineTo(Math.cos(a) * R[i] * k, Math.sin(a) * R[i] * k); }
      c.closePath();
    };
    put(5, mask(filled(p(0.9))), mask(filled(p(0.5))), mask(stroked(p(0.96), 0.12)));
  }
  // 6 DROPS — a crown of splash droplets (water)
  {
    const D = (k) => (c) => {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.42, d = 0.62 + (i % 2) * 0.16;
        c.beginPath(); c.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.9, 0.11 * k, 0.19 * k, a + Math.PI / 2, 0, Math.PI * 2); c.fill();
      }
      c.beginPath(); c.ellipse(0, 0.25, 0.62 * k, 0.26 * k, 0, 0, Math.PI * 2); c.fill();
    };
    put(6, mask(D(1)), mask(D(0.55)), mask(D(1.35)));
  }
  // 7 SWIRL — a peppermint wheel (boomerang catch)
  {
    const wedge = (c) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 0.8, a, a + 0.5); c.closePath(); c.fill(); } };
    put(7, mask(circle(0, 0, 0.82)), mask((c) => { c.save(); c.globalCompositeOperation = 'source-over'; c.beginPath(); c.arc(0, 0, 0.82, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = 'destination-out'; wedge(c); c.restore(); }), mask((c) => { c.beginPath(); c.arc(0, 0, 0.93, 0, Math.PI * 2); c.fill(); }));
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const SPR_VS = /* glsl */`
attribute vec3 aTint;
attribute vec3 aCellAlpha;
varying vec2 vUv;
varying vec3 vTint;
varying float vAlpha;
void main() {
  float c = aCellAlpha.x;
  vec2 cell = vec2(mod(c, 4.0), 1.0 - floor(c / 4.0));
  vUv = (uv + cell) * vec2(0.25, 0.5);
  vTint = aTint;
  vAlpha = aCellAlpha.y;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  // depth bias: slide the vertex toward the eye ALONG its own view ray, so
  // the screen footprint is unchanged but a ring on bumpy ground (or a puff
  // on a kid's face) is not swallowed by the terrain / the body it hit
  mv.xyz += normalize(-mv.xyz) * aCellAlpha.z;
  gl_Position = projectionMatrix * mv;
}`;
const SPR_FS = /* glsl */`
uniform sampler2D map;
varying vec2 vUv;
varying vec3 vTint;
varying float vAlpha;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = max(t.r, t.b) * vAlpha;
  if (a < 0.02) discard;
  vec3 c = mix(vTint, vec3(1.0), t.g);
  c = mix(c, vTint * 0.36, clamp(t.b - t.r, 0.0, 1.0));
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;
const TR_VS = /* glsl */`
attribute vec3 aTint;
attribute vec2 aVA;
varying vec3 vTint;
varying vec2 vVA;
void main() {
  vTint = aTint;
  vVA = aVA;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const TR_FS = /* glsl */`
varying vec3 vTint;
varying vec2 vVA;
void main() {
  float d = abs(vVA.x);
  float a = vVA.y * (1.0 - smoothstep(0.8, 1.0, d));
  if (a < 0.02) discard;
  // a thin white-hot core, a SATURATED body, a darker rim: reads on the
  // pale paths and on the grass alike
  vec3 c = mix(vTint, vec3(1.0), (1.0 - smoothstep(0.0, 0.24, d)) * 0.85);
  c = mix(c, vTint * 0.45, smoothstep(0.62, 0.84, d));
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

export function createFx(ctx, parent) {
  const group = new THREE.Group();
  group.name = 'weapon-fx';
  parent.add(group);
  const map = atlas();

  // ── sprites ────────────────────────────────────────────────────────────────
  const sGeo = new THREE.PlaneGeometry(1, 1);
  const aTint = new THREE.InstancedBufferAttribute(new Float32Array(SPR_MAX * 3), 3);
  const aCA = new THREE.InstancedBufferAttribute(new Float32Array(SPR_MAX * 3), 3);
  aTint.setUsage(THREE.DynamicDrawUsage); aCA.setUsage(THREE.DynamicDrawUsage);
  sGeo.setAttribute('aTint', aTint);
  sGeo.setAttribute('aCellAlpha', aCA);
  const sMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map } }, vertexShader: SPR_VS, fragmentShader: SPR_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const sprites = new THREE.InstancedMesh(sGeo, sMat, SPR_MAX);
  sprites.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sprites.frustumCulled = false; sprites.castShadow = false; sprites.receiveShadow = false;
  sprites.count = 0; sprites.visible = false; sprites.renderOrder = 8;
  sprites.userData.noRay = true; sprites.userData.noFade = true;
  sprites.name = 'weapon-fx:sprites';
  group.add(sprites);

  const spr = [];
  for (let i = 0; i < SPR_MAX; i++) spr.push({ on: false });
  let sprNext = 0, rotSeq = 0;
  const _c = new THREE.Color();

  /**
   * One cartoon sprite. flat = lies on the ground (rings, puddles); else it
   * faces the camera. Scale eases from s0 to s1 over `life`, alpha pops in and
   * fades over the last (1 - hold) of it. Positional args: no option bags.
   */
  function sprite(cell, x, y, z, color, s0, s1, life, flat = false, alpha = 1, vy = 0, hold = 0.45, spin = 0, bias = -1) {
    let s = null;
    for (let k = 0; k < SPR_MAX; k++) {
      const j = (sprNext + k) % SPR_MAX;
      if (!spr[j].on) { s = spr[j]; sprNext = (j + 1) % SPR_MAX; break; }
    }
    if (!s) { s = spr[sprNext]; sprNext = (sprNext + 1) % SPR_MAX; }     // steal the oldest slot
    _c.set(color);
    s.on = true; s.cell = cell; s.x = x; s.y = y; s.z = z; s.r = _c.r; s.g = _c.g; s.b = _c.b;
    s.s0 = s0; s.s1 = s1; s.t = 0; s.life = Math.max(0.05, life); s.flat = flat; s.a = alpha;
    s.vy = vy; s.hold = hold; s.spin = spin; s.rot = (rotSeq++ * 2.39996) % (Math.PI * 2);
    // view-ray depth bias: decals barely (so a shoe in a puddle stays on top),
    // shock rings a lot (bumpy ground), billboards enough to clear the body hit
    s.bias = bias >= 0 ? bias : (flat ? 0.3 : 0.6);
    return s;
  }

  // ── trails ─────────────────────────────────────────────────────────────────
  const VN = TR_MAX * TR_N * 2;
  const tPos = new Float32Array(VN * 3), tTint = new Float32Array(VN * 3), tVA = new Float32Array(VN * 2);
  const tGeo = new THREE.BufferGeometry();
  const pA = new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage);
  const cA = new THREE.BufferAttribute(tTint, 3).setUsage(THREE.DynamicDrawUsage);
  const vA = new THREE.BufferAttribute(tVA, 2).setUsage(THREE.DynamicDrawUsage);
  tGeo.setAttribute('position', pA); tGeo.setAttribute('aTint', cA); tGeo.setAttribute('aVA', vA);
  {
    const idx = [];
    for (let j = 0; j < TR_MAX; j++) {
      for (let i = 0; i < TR_N - 1; i++) {
        const a = (j * TR_N + i) * 2, b = a + 2;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    tGeo.setIndex(idx);
  }
  tGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const tMat = new THREE.ShaderMaterial({
    vertexShader: TR_VS, fragmentShader: TR_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const ribbons = new THREE.Mesh(tGeo, tMat);
  ribbons.frustumCulled = false; ribbons.castShadow = false; ribbons.receiveShadow = false;
  ribbons.visible = false; ribbons.renderOrder = 7;
  ribbons.userData.noRay = true; ribbons.userData.noFade = true;
  ribbons.name = 'weapon-fx:trails';
  group.add(ribbons);

  const trails = [];
  for (let j = 0; j < TR_MAX; j++) trails.push({ on: false, live: false, n: 0, pts: new Float32Array(TR_N * 3), age: new Float32Array(TR_N), r: 1, g: 1, b: 1, w: 0.5, maxAge: 0.28, gen: 0 });

  /** Start a trail; returns a handle (slot * 1000 + generation) or -1. */
  function trail(color, width = 0.5, maxAge = 0.28) {
    let best = -1, bestAge = -1;
    for (let j = 0; j < TR_MAX; j++) {
      const t = trails[j];
      if (!t.on) { best = j; break; }
      if (!t.live && t.age[0] > bestAge) { bestAge = t.age[0]; best = j; }
    }
    if (best < 0) return -1;
    const t = trails[best];
    _c.set(color);
    t.on = true; t.live = true; t.n = 0; t.r = _c.r; t.g = _c.g; t.b = _c.b; t.w = width; t.maxAge = maxAge; t.gen = (t.gen + 1) % 1000;
    return best * 1000 + t.gen;
  }
  const slotOf = (h) => {
    if (h == null || h < 0) return null;
    const t = trails[(h / 1000) | 0];
    return t && t.gen === h % 1000 ? t : null;
  };
  function shift(t) {
    t.pts.copyWithin(0, 3, t.n * 3);
    t.age.copyWithin(0, 1, t.n);
    t.n--;
  }
  /** Move the trail's head to (x,y,z); commits a new point every SEG units. */
  function trailPush(h, x, y, z) {
    const t = slotOf(h);
    if (!t || !t.live) return;
    const P = t.pts;
    if (t.n === 0) {
      P[0] = x; P[1] = y; P[2] = z; P[3] = x; P[4] = y; P[5] = z; t.age[0] = 0; t.age[1] = 0; t.n = 2; return;
    }
    const hi = (t.n - 1) * 3, pi = hi - 3;
    P[hi] = x; P[hi + 1] = y; P[hi + 2] = z; t.age[t.n - 1] = 0;
    const d = Math.hypot(x - P[pi], y - P[pi + 1], z - P[pi + 2]);
    if (d > SEG) {
      if (t.n >= TR_N) shift(t);
      const ni = t.n * 3;
      P[ni] = x; P[ni + 1] = y; P[ni + 2] = z; t.age[t.n] = 0; t.n++;
    }
  }
  /** Let go: the trail stops following and fades out from the tail. */
  function trailEnd(h) { const t = slotOf(h); if (t) t.live = false; }

  // ── frame ──────────────────────────────────────────────────────────────────
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
  const _qf = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const _qr = new THREE.Quaternion(), _Z = new THREE.Vector3(0, 0, 1), _Y = new THREE.Vector3(0, 1, 0);
  const _cam = new THREE.Vector3(), _t = new THREE.Vector3(), _v = new THREE.Vector3(), _side = new THREE.Vector3();

  function update(dt) {
    const cam = ctx.camera;
    if (cam) cam.getWorldPosition(_cam);
    // sprites
    let n = 0;
    for (let i = 0; i < SPR_MAX; i++) {
      const s = spr[i];
      if (!s.on) continue;
      s.t += dt;
      const u = s.t / s.life;
      if (u >= 1) { s.on = false; continue; }
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
      const e = 1 - (1 - u) * (1 - u) * (1 - u);
      const size = s.s0 + (s.s1 - s.s0) * e;
      const a = s.a * Math.min(1, u / 0.06) * (u > s.hold ? 1 - (u - s.hold) / (1 - s.hold) : 1);
      _p.set(s.x, s.y, s.z); _s.set(size, size, size);
      if (s.flat) { _qr.setFromAxisAngle(_Y, s.rot); _q.multiplyQuaternions(_qr, _qf); }
      else if (cam) { _qr.setFromAxisAngle(_Z, s.rot); _q.multiplyQuaternions(cam.quaternion, _qr); }
      _m.compose(_p, _q, _s);
      sprites.setMatrixAt(n, _m);
      aTint.array[n * 3] = s.r; aTint.array[n * 3 + 1] = s.g; aTint.array[n * 3 + 2] = s.b;
      aCA.array[n * 3] = s.cell; aCA.array[n * 3 + 1] = a; aCA.array[n * 3 + 2] = s.bias;
      n++;
    }
    sprites.count = n;
    sprites.visible = n > 0;
    if (n) { sprites.instanceMatrix.needsUpdate = true; aTint.needsUpdate = true; aCA.needsUpdate = true; }

    // trails
    let any = false;
    for (let j = 0; j < TR_MAX; j++) {
      const t = trails[j];
      const base = j * TR_N * 2;
      if (t.on) {
        for (let i = 0; i < t.n; i++) if (!(t.live && i === t.n - 1)) t.age[i] += dt;
        while (t.n > 0 && t.age[0] > t.maxAge) shift(t);
        if (!t.live && t.n < 2) { t.on = false; t.n = 0; }
      }
      const n2 = t.on ? t.n : 0;
      // unused points collapse onto the head (or far below the world for a
      // dead trail) so the strip's spare quads have zero area
      const hx = n2 >= 2 ? t.pts[(n2 - 1) * 3] : 0, hy = n2 >= 2 ? t.pts[(n2 - 1) * 3 + 1] : -999, hz = n2 >= 2 ? t.pts[(n2 - 1) * 3 + 2] : 0;
      for (let i = 0; i < TR_N; i++) {
        const v0 = (base + i * 2) * 3, v1 = v0 + 3, a0 = (base + i * 2) * 2;
        if (i >= n2 || n2 < 2) {
          tPos[v0] = tPos[v1] = hx; tPos[v0 + 1] = tPos[v1 + 1] = hy; tPos[v0 + 2] = tPos[v1 + 2] = hz;
          tVA[a0 + 1] = tVA[a0 + 3] = 0;
          continue;
        }
        any = true;
        const P = t.pts;
        const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(n2 - 1, i + 1) * 3;
        _t.set(P[i1] - P[i0], P[i1 + 1] - P[i0 + 1], P[i1 + 2] - P[i0 + 2]);
        _v.set(_cam.x - P[i * 3], _cam.y - P[i * 3 + 1], _cam.z - P[i * 3 + 2]);
        _side.crossVectors(_t, _v);
        const L = _side.length();
        if (L < 1e-5) _side.set(0, 1, 0); else _side.multiplyScalar(1 / L);
        const k = 1 - Math.min(1, t.age[i] / t.maxAge);               // 1 at the head, 0 at the tail
        const along = i / (n2 - 1);
        // full strength for the first half of a point's life, then it thins
        // and fades: at the moment of impact the ribbon still links shooter
        // and target
        const w = t.w * (0.2 + 0.8 * Math.min(1, k * 1.8, 0.35 + along)) * 0.5;
        const alpha = Math.min(1, k * 2.2) * Math.min(1, along * 4 + 0.2);
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        tPos[v0] = x + _side.x * w; tPos[v0 + 1] = y + _side.y * w; tPos[v0 + 2] = z + _side.z * w;
        tPos[v1] = x - _side.x * w; tPos[v1 + 1] = y - _side.y * w; tPos[v1 + 2] = z - _side.z * w;
        tTint[v0] = tTint[v1] = t.r; tTint[v0 + 1] = tTint[v1 + 1] = t.g; tTint[v0 + 2] = tTint[v1 + 2] = t.b;
        tVA[a0] = -1; tVA[a0 + 1] = alpha; tVA[a0 + 2] = 1; tVA[a0 + 3] = alpha;
      }
    }
    ribbons.visible = any;
    if (any) { pA.needsUpdate = true; cA.needsUpdate = true; vA.needsUpdate = true; }
  }

  // ── composed beats (what volley / weapons call) ────────────────────────────
  /** Muzzle burst: a coloured star at the tip + a white flash inside it. */
  function muzzle(x, y, z, color, size = 1.4) {
    sprite(CELL.burst, x, y, z, color, size * 0.45, size, 0.24, false, 1, 0, 0.4);
    sprite(CELL.puff, x, y + 0.05, z, 0xffffff, size * 0.3, size * 0.8, 0.5, false, 0.85, 0.9, 0.3);
  }
  /** A ground shock ring. */
  function ring(x, y, z, color, size = 3, life = 0.5) {
    sprite(CELL.ring, x, y + 0.12, z, color, size * 0.25, size, life, true, 1, 0, 0.35, 0, 1.1);
  }
  /** Hit flash on a body: an outlined comic star. */
  function bonk(x, y, z, color, size = 1.5) {
    sprite(CELL.bonk, x, y, z, color, size * 0.5, size, 0.3, false, 1, 0, 0.5, 2.5);
  }
  function sparkle(x, y, z, color, size = 1.1, life = 0.32) {
    sprite(CELL.sparkle, x, y, z, color, size * 0.3, size, life, false, 1, 0.4, 0.4, 3);
  }
  function puff(x, y, z, color, size = 2.2, life = 0.6) {
    sprite(CELL.puff, x, y, z, color, size * 0.4, size, life, false, 1, 0.9, 0.5);
  }
  function splat(x, y, z, color, size = 2.2, life = 0.5, flat = false, hold = 0.55) {
    sprite(CELL.splat, x, y, z, color, size * 0.4, size, life, flat, 1, 0, hold);
  }
  function drops(x, y, z, color, size = 2.2) {
    sprite(CELL.drops, x, y, z, color, size * 0.4, size, 0.45, false, 1, 0.6, 0.45);
  }
  function swirl(x, y, z, color, size = 1.4) {
    sprite(CELL.swirl, x, y, z, color, size * 0.4, size, 0.32, false, 1, 0, 0.45, 9);
  }

  return {
    group, sprite, trail, trailPush, trailEnd, update,
    muzzle, ring, bonk, sparkle, puff, splat, drops, swirl, CELL,
    stats() {
      let s = 0, t = 0;
      for (const x of spr) if (x.on) s++;
      for (const x of trails) if (x.on) t++;
      return { calls: (sprites.visible ? 1 : 0) + (ribbons.visible ? 1 : 0), sprites: s, trails: t };
    },
  };
}
