// CAPTAIN BRINE — a walrus in a captain's hat. Two meshes (body, head) so he can
// nod, turn and talk without extra draw calls.
import * as THREE from 'three';
import { Merger } from './geo.js';

// He lives under a striped awning, so every value here is pitched a stop or two
// brighter than looks right in isolation: fur that reads at noon on a beach is
// mud on the shaded fore-deck. The coat is RED (it was a blue that went black),
// the tusks and whiskers are white and thick enough to survive the game camera.
const C = {
  fur: 0xcfb9a2, furDark: 0xa89179, belly: 0xf3e5d2, tusk: 0xfffdf4,
  navy: 0x2c4d80, navyDark: 0x1b3358, gold: 0xffd063, nose: 0x6d4a3c, eye: 0x241c22,
  coat: 0xe0364f, coatDark: 0xb62438, cream: 0xfffaf0,
};

function ellipsoid(sx, sy, sz, seg = 12) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4));
  g.scale(sx, sy, sz);
  return g;
}

export function buildCaptain() {
  const group = new THREE.Group();
  group.name = 'captain-brine';

  // ── body ──
  const b = new Merger();
  b.add(ellipsoid(0.62, 0.66, 0.58, 14), C.fur, { y: 0.66 });
  b.add(ellipsoid(0.5, 0.34, 0.46, 12), C.belly, { y: 0.42, z: 0.24 });
  b.add(ellipsoid(0.52, 0.3, 0.48, 12), C.furDark, { y: 0.16 });
  // red coat + cream collar + gold buttons and epaulettes
  b.add(new THREE.CylinderGeometry(0.63, 0.55, 0.58, 14, 1, true), C.coat, { y: 0.78 });
  b.add(new THREE.CylinderGeometry(0.58, 0.6, 0.14, 14), C.coatDark, { y: 0.50 });
  b.add(new THREE.TorusGeometry(0.44, 0.09, 6, 16), C.cream, { rx: Math.PI / 2, y: 1.04 });
  for (const y of [0.66, 0.84, 1.0]) b.add(new THREE.SphereGeometry(0.075, 7, 6), C.gold, { y, z: 0.54 });
  for (const s of [1, -1]) b.add(new THREE.BoxGeometry(0.26, 0.08, 0.2), C.gold, { rz: -s * 0.35, x: s * 0.52, y: 1.0 });
  // flippers
  for (const s of [1, -1]) {
    b.add(ellipsoid(0.5, 0.17, 0.28, 10), C.coatDark, { rz: -s * 0.5, ry: s * 0.2, x: s * 0.68, y: 0.58, z: 0.08 });
    b.add(ellipsoid(0.16, 0.1, 0.2, 8), C.fur, { rz: -s * 0.5, x: s * 0.92, y: 0.44, z: 0.16 });
    b.add(ellipsoid(0.34, 0.14, 0.52, 10), C.furDark, { ry: s * 0.45, x: s * 0.3, y: 0.08, z: -0.34 });
  }
  const body = b.mesh({ roughness: 0.8, emissive: 0xffd9ac, emissiveIntensity: 0.1 });

  // ── head (pivots at the neck) ──
  const h = new Merger();
  h.add(ellipsoid(0.44, 0.42, 0.44, 14), C.fur, { y: 0.3 });
  // muzzle + moustache pads
  for (const s of [1, -1]) h.add(ellipsoid(0.26, 0.2, 0.24, 10), C.belly, { x: s * 0.15, y: 0.16, z: 0.33 });
  h.add(ellipsoid(0.12, 0.09, 0.09, 8), C.nose, { y: 0.29, z: 0.46 });
  // whiskers — 0.025 thick is a hair that aliases away; these are meant to be
  // seen from the pier
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) {
    h.add(new THREE.BoxGeometry(0.38, 0.05, 0.05), C.cream, { rz: -s * (0.1 + k * 0.18), ry: -s * 0.3, x: s * 0.38, y: 0.19 - k * 0.06, z: 0.44 });
  }
  // TUSKS — the one silhouette that says "walrus" from off the boat
  for (const s of [1, -1]) {
    h.add(new THREE.ConeGeometry(0.105, 0.66, 9), C.tusk, { rx: 0.16, x: s * 0.15, y: -0.19, z: 0.42 });
  }
  // eyes
  for (const s of [1, -1]) {
    h.add(new THREE.SphereGeometry(0.12, 10, 8), 0xfffdf6, { x: s * 0.19, y: 0.38, z: 0.35 });
    h.add(new THREE.SphereGeometry(0.072, 8, 6), C.eye, { x: s * 0.21, y: 0.36, z: 0.44 });
    h.add(new THREE.SphereGeometry(0.03, 6, 5), 0xffffff, { x: s * 0.24, y: 0.42, z: 0.47 });
    h.add(ellipsoid(0.13, 0.05, 0.06, 6), C.furDark, { x: s * 0.19, y: 0.50, z: 0.36 });
  }
  // captain's hat
  h.add(new THREE.CylinderGeometry(0.46, 0.42, 0.07, 16), C.navyDark, { y: 0.62 });
  h.add(new THREE.CylinderGeometry(0.36, 0.38, 0.26, 16), C.navy, { y: 0.77 });
  h.add(new THREE.CylinderGeometry(0.37, 0.37, 0.09, 16), C.navyDark, { y: 0.67 });
  h.add(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16), C.cream, { y: 0.9 });
  h.add(new THREE.BoxGeometry(0.16, 0.16, 0.04), C.gold, { y: 0.76, z: 0.37 });
  h.add(new THREE.ConeGeometry(0.2, 0.1, 12), C.navyDark, { rx: 1.4, y: 0.6, z: 0.42 });
  const head = h.mesh({ roughness: 0.78, emissive: 0xffd9ac, emissiveIntensity: 0.1 });
  head.position.set(0, 0.95, 0);

  group.add(body, head);
  return { group, body, head };
}
