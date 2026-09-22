// Static furniture that belongs to the creatures: the shepherd's bell on
// Lollipop Meadow, the sugar anthill and the dropped lollipop the sprinkle-ants
// are dismantling. All merged into ONE mesh (world-space geometry, 1 draw call).
import * as THREE from 'three';
import { CANDY } from '../../../core/palette.js';
import { part, mergeParts, TAU } from './common.js';
import { BELL } from './sheep.js';
import { antTrail } from './ants.js';
import { flowerParts } from './flowers.js';

export function create(env) {
  const { world, scene } = env;
  const parts = [];
  const put = (geo, o) => parts.push(part(geo, o));

  // ── shepherd's bell ────────────────────────────────────────────────────────
  const bh = world.height(BELL.x, BELL.z);
  put(new THREE.CylinderGeometry(0.12, 0.16, 2.1, 6), { pos: [BELL.x, bh + 1.05, BELL.z], color: CANDY.licorice });
  put(new THREE.BoxGeometry(0.9, 0.13, 0.13), { pos: [BELL.x - 0.3, bh + 2.05, BELL.z], color: CANDY.licorice });
  put(new THREE.SphereGeometry(0.34, 7, 4, 0, TAU, 0, 1.9), { pos: [BELL.x - 0.66, bh + 1.86, BELL.z], color: CANDY.caramel });
  put(new THREE.SphereGeometry(0.1, 5, 3), { pos: [BELL.x - 0.66, bh + 1.58, BELL.z], color: 0x6b4318 });
  put(new THREE.BoxGeometry(0.62, 0.34, 0.05), { pos: [BELL.x + 0.36, bh + 1.6, BELL.z], rot: [0, 0.2, 0], color: CANDY.cream });

  // ── sugar anthill ─────────────────────────────────────────────────────────
  const TRAIL = antTrail(world);
  const HILL = TRAIL[0], CRUMBS = TRAIL[TRAIL.length - 1];
  const ah = world.height(HILL[0], HILL[1]);
  put(new THREE.ConeGeometry(1.25, 0.85, 9), { pos: [HILL[0], ah + 0.42, HILL[1]], color: CANDY.sourSugar });
  put(new THREE.ConeGeometry(0.55, 0.5, 7), { pos: [HILL[0] + 0.7, ah + 0.24, HILL[1] + 0.5], color: 0xfff0e0 });
  put(new THREE.SphereGeometry(0.22, 6, 4), { pos: [HILL[0], ah + 0.8, HILL[1]], scale: [1, 0.5, 1], color: 0x30202a });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.7;
    put(new THREE.TetrahedronGeometry(0.16), { pos: [HILL[0] + Math.cos(a) * 1.5, ah + 0.1, HILL[1] + Math.sin(a) * 1.5], rot: [a, a, 0], color: CANDY.sprinkle[k % CANDY.sprinkle.length] });
  }

  // ── the dropped lollipop the ants are eating ──────────────────────────────
  const ch = world.height(CRUMBS[0], CRUMBS[1]);
  put(new THREE.CylinderGeometry(0.95, 0.95, 0.2, 12), { pos: [CRUMBS[0], ch + 0.16, CRUMBS[1]], rot: [1.35, 0, 0.3], color: CANDY.gummyRed });
  put(new THREE.CylinderGeometry(0.5, 0.5, 0.24, 10), { pos: [CRUMBS[0] + 0.02, ch + 0.17, CRUMBS[1] - 0.03], rot: [1.35, 0, 0.3], color: CANDY.cream });
  put(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 5), { pos: [CRUMBS[0] + 0.9, ch + 0.09, CRUMBS[1] + 0.9], rot: [0, 0.6, 1.5708], color: CANDY.cream });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + 1.9, rr = 1.2 + (k % 3) * 0.42;
    put(new THREE.TetrahedronGeometry(0.13 + (k % 2) * 0.05), {
      pos: [CRUMBS[0] + Math.cos(a) * rr, ch + 0.09, CRUMBS[1] + Math.sin(a) * rr], rot: [a, a * 1.7, 0],
      color: CANDY.sprinkle[k % CANDY.sprinkle.length],
    });
  }

  // ── the butterflies' flower beds ──────────────────────────────────────────
  // 13 beds, 4–6 blossoms each, folded into this same merged mesh: every flower
  // on Candyland costs zero extra draw calls, and gives the butterflies the one
  // thing they are allowed to land on.
  for (const g of flowerParts(world)) parts.push(g);

  const geo = mergeParts(parts);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, flatShading: true }));
  mesh.name = 'creature-props';
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  // Knee-high ambient decor must never push the camera around: the flower beds
  // sit right where the player walks in Lollipop Meadow, and without this the
  // capsule sweep treats a 1.5 u blossom as an obstruction and dollies the lens
  // in to four units. (Found the hard way — the first meadow render after the
  // flowers landed was a close-up of the visitor's hat.)
  mesh.userData.noOcclude = true;
  scene.add(mesh);

  return { name: 'props', mesh, update() {} };
}
