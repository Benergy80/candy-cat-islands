// Tiny geometry kit for the player character: build many coloured primitives and
// bake them into ONE vertex-coloured BufferGeometry so each animated rig node
// costs exactly one draw call.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();

/**
 * Accumulates primitives in a common local space.
 *   const b = part(); b.add(new THREE.SphereGeometry(1), 0xff0000, { pos:[0,1,0], scale:[1,.5,1] });
 *   const mesh = b.mesh(material);
 */
export function part() {
  const pos = [], nrm = [], col = [];
  const api = {
    /** @param opts {pos,rot,scale,bands:{size,offset,colors:[a,b]},tint} */
    add(geo, color, opts = {}) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      const s = typeof opts.scale === 'number' ? [opts.scale, opts.scale, opts.scale] : (opts.scale || [1, 1, 1]);
      _e.set(...(opts.rot || [0, 0, 0]));
      _q.setFromEuler(_e);
      _m.compose(_v.set(...(opts.pos || [0, 0, 0])), _q, new THREE.Vector3(s[0], s[1], s[2]));
      g.applyMatrix4(_m);
      const P = g.attributes.position.array;
      const N = g.attributes.normal ? g.attributes.normal.array : null;
      const n = g.attributes.position.count;
      _c.set(color);
      const bands = opts.bands;
      if (bands) _c2.set(bands.colors[1]);
      for (let i = 0; i < n; i++) {
        pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        if (N) nrm.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); else nrm.push(0, 1, 0);
        if (bands) {
          const y = P[i * 3 + 1] + (bands.offset || 0);
          const k = Math.floor(y / bands.size);
          const c = ((k % 2) + 2) % 2 ? _c2 : _c;
          col.push(c.r, c.g, c.b);
        } else {
          col.push(_c.r, _c.g, _c.b);
        }
      }
      geo.dispose?.();
      if (g !== geo) g.dispose?.();
      return api;
    },
    /** Chunky rounded box built from a scaled sphere (reads better than a cube at game distance). */
    blob(r, scale, color, opts = {}) {
      return api.add(new THREE.SphereGeometry(r, opts.seg || 12, opts.seg2 || 9), color, { ...opts, scale });
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeBoundingSphere();
      return g;
    },
    mesh(material) {
      const m = new THREE.Mesh(api.build(), material);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    },
    get count() { return pos.length / 9; },
  };
  return api;
}

/** A tapered limb segment: cylinder from y=0 down to y=-len with rounded ends. */
export function limb(b, color, { len, r0, r1, x = 0, z = 0, seg = 10 }) {
  b.add(new THREE.CylinderGeometry(r0, r1, len, seg, 1, true), color, { pos: [x, -len / 2, z] });
  b.add(new THREE.SphereGeometry(r0, seg, 6), color, { pos: [x, 0, z] });
  b.add(new THREE.SphereGeometry(r1, seg, 6), color, { pos: [x, -len, z] });
  return b;
}
