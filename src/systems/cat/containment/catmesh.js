// ── Round low-poly cat, shared by every containment actor ─────────────────────
// One merged geometry → one InstancedMesh pool → ONE draw call for every cat the
// containment system spawns (greeters, the wave, lantern cats, lifeguard, clerk,
// nappers, rope crew, mayor). Per-instance colour tints the fur; vertex colours
// carry the muzzle/eye/inner-ear detail so no extra materials are needed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from '../../../core/util.js';

/** Paint a solid vertex colour onto a geometry (multiplied by instanceColor later). */
export function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!geo.attributes.uv) {
    const uv = new Float32Array(n * 2);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return geo;
}

/** scale → rotate → translate helper. */
export function place(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
  if (rz) geo.rotateZ(rz);
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
}

const FUR = 0xdedede;      // slightly dark so the muzzle/chest read lighter
const LIGHT = 0xffffff;
const EYE = 0x16161c;
const INNER_EAR = 0xffb9c4;

/**
 * A chunky sitting-ish cat, feet at y=0, ~0.95 tall, facing +Z.
 * ~244 triangles.
 */
export function makeCatGeometry() {
  const parts = [];
  // body (egg)
  parts.push(place(paint(new THREE.SphereGeometry(0.40, 8, 6), FUR), 0, 0.45, 0, 0, 0, 0, 1.05, 0.98, 1.22));
  // head
  parts.push(place(paint(new THREE.SphereGeometry(0.29, 8, 5), FUR), 0, 0.88, 0.26));
  // ears
  for (const s of [-1, 1]) {
    parts.push(place(paint(new THREE.ConeGeometry(0.115, 0.21, 4), FUR), s * 0.165, 1.07, 0.22, 0, Math.PI / 4, s * 0.22));
    parts.push(place(paint(new THREE.ConeGeometry(0.06, 0.13, 4), INNER_EAR), s * 0.165, 1.07, 0.28, 0, Math.PI / 4, s * 0.22));
  }
  // muzzle + chest bib (lighter than the fur tint)
  parts.push(place(paint(new THREE.SphereGeometry(0.14, 6, 3), LIGHT), 0, 0.80, 0.47, 0, 0, 0, 1.35, 0.85, 0.8));
  parts.push(place(paint(new THREE.SphereGeometry(0.17, 6, 3), LIGHT), 0, 0.46, 0.36, 0, 0, 0, 0.9, 1.25, 0.6));
  // eyes
  for (const s of [-1, 1]) parts.push(place(paint(new THREE.SphereGeometry(0.062, 4, 2), EYE), s * 0.115, 0.94, 0.46));
  // nose
  parts.push(place(paint(new THREE.ConeGeometry(0.045, 0.05, 3), 0xff9aa8), 0, 0.80, 0.60, Math.PI / 2));
  // tail
  parts.push(place(paint(new THREE.ConeGeometry(0.09, 0.66, 5), FUR), 0, 0.62, -0.46, -2.35));
  // paws
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(place(paint(new THREE.SphereGeometry(0.135, 5, 2), LIGHT), sx * 0.21, 0.10, sz * 0.28, 0, 0, 0, 1, 0.65, 1.25));
  }
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  return g;
}

/** A lantern / float-ring / prop puck that rides along with a cat. */
export function makeLanternGeometry() {
  const parts = [];
  parts.push(place(paint(new THREE.CylinderGeometry(0.17, 0.2, 0.34, 6), 0xfff0b0), 0, 0, 0));
  parts.push(place(paint(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 6), 0xffd86b), 0, 0.2, 0));
  parts.push(place(paint(new THREE.TorusGeometry(0.11, 0.02, 3, 8), 0x3a2a22), 0, 0.28, 0, Math.PI / 2));
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  return g;
}

/**
 * Fixed-slot instanced cat pool. Unused slots are parked at zero scale.
 *   const pool = createCatPool(ctx, 32);
 *   const id = pool.alloc(0xf0963c);
 *   pool.set(id, { x, y, z, ry, tilt: 0, scale: 1, squash: 1 });
 *   pool.hide(id); pool.free(id);
 */
export function createCatPool(ctx, count = 32) {
  const geo = makeCatGeometry();
  const material = mat(0xffffff, { vertexColors: true, flatShading: true, roughness: 0.85 });
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'containment-cats';
  ctx.scene.add(mesh);

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const used = new Array(count).fill(false);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) { mesh.setMatrixAt(i, ZERO); mesh.setColorAt(i, col.set(0xffffff)); }
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return {
    mesh, count,
    alloc(fur = 0xf0963c) {
      for (let i = 0; i < count; i++) if (!used[i]) { used[i] = true; mesh.setColorAt(i, col.set(fur)); mesh.instanceColor.needsUpdate = true; mesh.setMatrixAt(i, ZERO); mesh.instanceMatrix.needsUpdate = true; return i; }
      return -1;
    },
    free(i) { if (i < 0) return; used[i] = false; mesh.setMatrixAt(i, ZERO); mesh.instanceMatrix.needsUpdate = true; },
    tint(i, fur) { if (i < 0) return; mesh.setColorAt(i, col.set(fur)); mesh.instanceColor.needsUpdate = true; },
    hide(i) { if (i < 0) return; mesh.setMatrixAt(i, ZERO); mesh.instanceMatrix.needsUpdate = true; },
    set(i, o) {
      if (i < 0) return;
      const s = o.scale ?? 1, sq = o.squash ?? 1;
      dummy.position.set(o.x, o.y ?? 0, o.z);
      dummy.rotation.set(o.tilt ?? 0, o.ry ?? 0, o.roll ?? 0);
      dummy.scale.set(s, s * sq, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Small instanced pool for the lantern props the curfew cats carry. */
export function createLanternPool(ctx, count = 8) {
  const geo = makeLanternGeometry();
  const material = mat(0xffffff, { vertexColors: true, flatShading: true, roughness: 0.5, emissive: 0xffb347, emissiveIntensity: 0.0 });
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.name = 'containment-lanterns';
  ctx.scene.add(mesh);
  const dummy = new THREE.Object3D();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, ZERO);
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh, material,
    set(i, o) {
      dummy.position.set(o.x, o.y, o.z); dummy.rotation.set(0, o.ry ?? 0, 0);
      const s = o.scale ?? 1; dummy.scale.set(s, s, s); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix); mesh.instanceMatrix.needsUpdate = true;
    },
    hide(i) { mesh.setMatrixAt(i, ZERO); mesh.instanceMatrix.needsUpdate = true; },
  };
}
