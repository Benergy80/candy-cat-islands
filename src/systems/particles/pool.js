// Pooled particle storage + the instanced-quad renderer for ONE blend group.
// Structure-of-arrays, fixed capacity, swap-remove on death: no allocation ever
// happens after construction. The instance buffers ARE the simulation buffers
// for position/colour/params so there is nothing to copy at upload time.
import * as THREE from 'three';
import { VERT, FRAG } from './shaders.js';

export const SHAPES = { soft: 0, sparkle: 1, confetti: 2, ring: 3, leaf: 4, heart: 5, print: 6, puff: 7, glow: 8, pool: 9 };

export const FLAG_FLAT   = 1;  // quad lies in the XZ plane (decals, ripples)
export const FLAG_FLICKER = 2; // twinkle the alpha
export const FLAG_GROUNDKILL = 4; // die when it reaches the spawn-time ground height
export const FLAG_STICK = 8;   // settle on the ground instead of dying

const _c = new THREE.Color();

export class Pool {
  constructor(cap, additive, name) {
    this.cap = cap; this.count = 0; this.cursor = 0; this.additive = additive; this.name = name;
    const f3 = () => new Float32Array(cap * 3);
    this.pos = f3(); this.col = f3(); this.vel = f3(); this.c0 = f3(); this.c1 = f3();
    this.attr = new Float32Array(cap * 4);
    const f1 = () => new Float32Array(cap);
    this.age = f1(); this.life = f1(); this.size0 = f1(); this.size1 = f1(); this.alpha = f1();
    this.rot = f1(); this.spin = f1(); this.grav = f1(); this.drag = f1();
    this.sway = f1(); this.swayF = f1(); this.phase = f1(); this.wind = f1();
    this.floorY = f1(); this.fadeIn = f1(); this.fadeOut = f1();
    this.shape = new Uint8Array(cap); this.flags = new Uint8Array(cap);

    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('normal', base.attributes.normal);
    geo.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 3);
    this.aAttr = new THREE.InstancedBufferAttribute(this.attr, 4);
    this.aPos.setUsage(THREE.DynamicDrawUsage); this.aCol.setUsage(THREE.DynamicDrawUsage); this.aAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iColor', this.aCol);
    geo.setAttribute('iAttr', this.aAttr);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uViewH: { value: 1000 } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: true,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      // the fragment shader outputs colour*alpha (see shaders.js) so that a mask
      // which reaches zero contributes nothing at all — no rim, no seam
      premultipliedAlpha: true,
      defines: additive ? { PARTICLE_ADDITIVE: 1 } : {},
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });

    this.geo = geo; this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.renderOrder = additive ? 12 : 10;
    this.mesh.visible = false;
    this.mesh.name = 'particles:' + name;
  }

  /** Index of a free slot; recycles the oldest-cursor slot when saturated. */
  alloc() {
    if (this.count < this.cap) return this.count++;
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.cap; return i;
  }

  _move(a, b) { // copy particle a into slot b
    const p = this.pos, c = this.col, v = this.vel, s0 = this.c0, s1 = this.c1, at = this.attr;
    const a3 = a * 3, b3 = b * 3, a4 = a * 4, b4 = b * 4;
    p[b3] = p[a3]; p[b3 + 1] = p[a3 + 1]; p[b3 + 2] = p[a3 + 2];
    c[b3] = c[a3]; c[b3 + 1] = c[a3 + 1]; c[b3 + 2] = c[a3 + 2];
    v[b3] = v[a3]; v[b3 + 1] = v[a3 + 1]; v[b3 + 2] = v[a3 + 2];
    s0[b3] = s0[a3]; s0[b3 + 1] = s0[a3 + 1]; s0[b3 + 2] = s0[a3 + 2];
    s1[b3] = s1[a3]; s1[b3 + 1] = s1[a3 + 1]; s1[b3 + 2] = s1[a3 + 2];
    at[b4] = at[a4]; at[b4 + 1] = at[a4 + 1]; at[b4 + 2] = at[a4 + 2]; at[b4 + 3] = at[a4 + 3];
    this.age[b] = this.age[a]; this.life[b] = this.life[a];
    this.size0[b] = this.size0[a]; this.size1[b] = this.size1[a]; this.alpha[b] = this.alpha[a];
    this.rot[b] = this.rot[a]; this.spin[b] = this.spin[a];
    this.grav[b] = this.grav[a]; this.drag[b] = this.drag[a];
    this.sway[b] = this.sway[a]; this.swayF[b] = this.swayF[a]; this.phase[b] = this.phase[a];
    this.wind[b] = this.wind[a]; this.floorY[b] = this.floorY[a];
    this.fadeIn[b] = this.fadeIn[a]; this.fadeOut[b] = this.fadeOut[a];
    this.shape[b] = this.shape[a]; this.flags[b] = this.flags[a];
  }

  kill(i) { const last = --this.count; if (i !== last) this._move(last, i); }

  /**
   * Advance every live particle and write the instance buffers.
   * No allocations: everything is scalar math over typed arrays.
   */
  simulate(dt, elapsed, windX, windZ) {
    const { pos, vel, col, attr, c0, c1 } = this;
    let i = 0;
    while (i < this.count) {
      const a = (this.age[i] += dt);
      const L = this.life[i];
      if (a >= L) { this.kill(i); continue; }
      const t = a / L;
      const i3 = i * 3, i4 = i * 4;

      // integrate
      const dmp = 1 - Math.min(0.95, this.drag[i] * dt);
      let vx = vel[i3] * dmp, vy = (vel[i3 + 1] + this.grav[i] * dt) * dmp, vz = vel[i3 + 2] * dmp;
      const w = this.wind[i];
      if (w !== 0) { vx += windX * w * dt; vz += windZ * w * dt; }
      vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;

      let px = pos[i3] + vx * dt, py = pos[i3 + 1] + vy * dt, pz = pos[i3 + 2] + vz * dt;
      const sw = this.sway[i];
      if (sw !== 0) {
        const ph = this.phase[i] + elapsed * this.swayF[i];
        px += Math.cos(ph) * sw * dt;
        pz += Math.sin(ph * 0.77 + 1.3) * sw * dt;
      }

      const fl = this.flags[i];
      if (py < this.floorY[i]) {
        if (fl & FLAG_GROUNDKILL) { this.kill(i); continue; }
        if (fl & FLAG_STICK) { py = this.floorY[i]; vel[i3] = 0; vel[i3 + 1] = 0; vel[i3 + 2] = 0; }
      }
      pos[i3] = px; pos[i3 + 1] = py; pos[i3 + 2] = pz;

      // colour / size / alpha over life
      const cr = c0[i3] + (c1[i3] - c0[i3]) * t;
      const cg = c0[i3 + 1] + (c1[i3 + 1] - c0[i3 + 1]) * t;
      const cb = c0[i3 + 2] + (c1[i3 + 2] - c0[i3 + 2]) * t;
      col[i3] = cr; col[i3 + 1] = cg; col[i3 + 2] = cb;

      const fi = this.fadeIn[i], fo = this.fadeOut[i];
      let al = this.alpha[i];
      if (fi > 0 && t < fi) al *= t / fi;
      if (fo > 0 && t > 1 - fo) al *= (1 - t) / fo;
      if (fl & FLAG_FLICKER) al *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.phase[i] + elapsed * 7.3));

      const rot = (this.rot[i] += this.spin[i] * dt);
      attr[i4] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      attr[i4 + 1] = rot;
      attr[i4 + 2] = al;
      attr[i4 + 3] = this.shape[i] + ((fl & FLAG_FLAT) ? 16 : 0);
      i++;
    }
    this.geo.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    if (this.count > 0) {
      this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aAttr.needsUpdate = true;
    }
  }
}

/** Resolve a colour spec (number | '#hex' | THREE.Color) into linear rgb in `out` (3 floats at o). */
export function writeColor(spec, arr, o) {
  if (typeof spec === 'number') _c.setHex(spec);
  else if (spec && spec.isColor) _c.copy(spec);
  else if (typeof spec === 'string') _c.set(spec);
  else _c.setHex(0xffffff);
  arr[o] = _c.r; arr[o + 1] = _c.g; arr[o + 2] = _c.b;
}
