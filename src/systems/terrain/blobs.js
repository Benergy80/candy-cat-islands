// ─────────────────────────────────────────────────────────────────────────────
// BLOB CONTACT SHADOWS — mobile tier only (docs/BRIEF.md Contract I).
//
// On the mobile tier no tree or rock casts into the shadow map, and a gummy bear
// standing on bright frosting with nothing under it floats. This lays one soft
// dark disc (radial alpha, conformed to the ground normal) under each tree /
// rock that asked for one: ONE InstancedMesh per island, packed per frame to
// what the camera sees by the same culler as the vegetation (terrain/
// instcull.js), 2 triangles a tree. It is a contact cue, not a sun shadow: it
// sits straight under the trunk, so it reads at every hour.
//
//   createBlobShadows(ctx, points, { name, opacity, culler })
//     points: [{ x, z, r }]   world position + disc radius
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

let RADIAL = null;
function radialTexture() {
  if (RADIAL) return RADIAL;
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.45, '#c8c8c8');
  grd.addColorStop(0.8, '#3c3c3c'); grd.addColorStop(1, '#000000');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  RADIAL = new THREE.CanvasTexture(cv);
  RADIAL.wrapS = RADIAL.wrapT = THREE.ClampToEdgeWrapping;
  return RADIAL;
}

export function createBlobShadows(ctx, points, o = {}) {
  const { world } = ctx;
  if (!points.length) return null;
  const geo = new THREE.PlaneGeometry(2, 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: o.opacity ?? 0.3, alphaMap: radialTexture(),
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, points.length);
  mesh.name = o.name || 'blob_shadows';
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.renderOrder = -1;                       // with the other ground decals
  mesh.userData.noOcclude = true;              // the camera's occlusion sweep ignores it
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  const p = new THREE.Vector3(), s = new THREE.Vector3();
  points.forEach((pt, i) => {
    const nn = world.normal(pt.x, pt.z);
    n.set(nn.x, nn.y, nn.z).normalize();
    q.setFromUnitVectors(up, n);
    m4.compose(p.set(pt.x, world.height(pt.x, pt.z) + 0.06, pt.z), q, s.set(pt.r, 1, pt.r));
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  if (o.culler) o.culler.add(mesh, { pad: 0.5 });
  return mesh;
}
