// ─────────────────────────────────────────────────────────────────────────────
// PICKUP MARKERS — the vocabulary that says "this one is YOURS to take".
//
// Round-2 critique: weapons read as environment-coloured props resting in
// scenery, and the only thing under them was the same white ring every
// interactable in the game wears. So pickups get their own two-part marker:
//
//   · a GROUND DISC — a soft filled pool of light in the item's hue with two
//     concentric rings in it, sitting on the terrain, breathing at ~0.4 Hz;
//   · a LIGHT SHAFT — an additive quad standing from that disc up to the
//     floating item, billboarded to the camera, flaring as it rises.
//
// Both are ONE InstancedMesh each: 2 draw calls for every pickup in the game,
// tinted per instance, distance-faded in JS so nothing glows out of the fog.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

/** Soft filled pool + two concentric rings, alpha-only so instanceColor tints it. */
function discTexture(S = 128) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1;
      const r = Math.hypot(u, v);
      let a = 0;
      if (r < 1) {
        const core = Math.pow(Math.max(0, 1 - r / 0.58), 1.7) * 0.52;
        const ring1 = Math.exp(-Math.pow((r - 0.66) / 0.060, 2)) * 0.95;
        const ring2 = Math.exp(-Math.pow((r - 0.90) / 0.032, 2)) * 0.50;
        const wash = Math.pow(Math.max(0, 1 - r), 1.1) * 0.15;
        a = Math.min(1, core + ring1 + ring2 + wash) * Math.min(1, (1 - r) / 0.06);
      }
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = (a * 255) | 0;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}

/** A column of light: bright and narrow at the disc, flaring and fading upward. */
function shaftTexture(W = 64, H = 128) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) {
    const t = 1 - (y + 0.5) / H;                     // 0 at the bottom of the quad
    const wf = 0.40 + 0.60 * t;
    const fade = Math.pow(1 - t, 1.35);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W * 2 - 1;
      const core = Math.exp(-Math.pow(u / (0.20 * wf + 0.05), 2)) * 0.85;
      const halo = Math.exp(-Math.pow(u / (0.62 * wf + 0.10), 2)) * 0.30;
      const a = Math.min(1, (core + halo) * fade);
      const i = (y * W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = (a * 255) | 0;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}

export function createMarkers(ctx, { cap = 48 } = {}) {
  const group = new THREE.Group();
  group.name = 'inventory-markers';
  ctx.scene.add(group);

  const discGeo = new THREE.PlaneGeometry(2, 2);     // radius 1 at scale 1
  discGeo.rotateX(-Math.PI / 2);
  const shaftGeo = new THREE.PlaneGeometry(1, 1);
  shaftGeo.translate(0, 0.5, 0);                     // pivot at the foot

  const discMat = new THREE.MeshBasicMaterial({
    map: discTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const shaftMat = new THREE.MeshBasicMaterial({
    map: shaftTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });

  let discs = null, shafts = null, capacity = 0;
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
  let nD = 0, nS = 0;

  function build(n) {
    if (discs) { group.remove(discs, shafts); discs.dispose(); shafts.dispose(); }
    discs = new THREE.InstancedMesh(discGeo, discMat, n);
    shafts = new THREE.InstancedMesh(shaftGeo, shaftMat, n);
    for (const m of [discs, shafts]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
      m.count = 0;
      m.userData.noRay = true; m.userData.noFade = true;
      for (let i = 0; i < n; i++) m.setColorAt(i, _c.setRGB(1, 1, 1));
    }
    discs.renderOrder = 3; shafts.renderOrder = 4;
    group.add(discs, shafts);
    capacity = n;
  }
  build(cap);

  const api = {
    group,
    /** Start a frame. */
    begin() { nD = 0; nS = 0; },

    /** Ground pool of light, lying on the terrain (quat orients it to the slope). */
    disc(x, y, z, r, color, gain, quat) {
      if (nD >= capacity) return;
      _p.set(x, y, z); _s.set(r, 1, r);
      _m.compose(_p, quat || _q.identity(), _s);
      discs.setMatrixAt(nD, _m);
      _c.set(color).multiplyScalar(gain);
      discs.setColorAt(nD, _c);
      nD++;
    },

    /** Column of light from the disc up to the item, billboarded by `yaw`. */
    shaft(x, y, z, w, h, yaw, color, gain) {
      if (nS >= capacity) return;
      _e.set(0, yaw, 0); _q.setFromEuler(_e);
      _p.set(x, y, z); _s.set(w, h, 1);
      _m.compose(_p, _q, _s);
      shafts.setMatrixAt(nS, _m);
      _c.set(color).multiplyScalar(gain);
      shafts.setColorAt(nS, _c);
      nS++;
    },

    /** Upload. Returns the number of live markers. */
    end() {
      if (nD > capacity * 0.9 || nS > capacity * 0.9) build(Math.max(nD, nS) + 16);
      discs.count = Math.min(nD, capacity);
      shafts.count = Math.min(nS, capacity);
      discs.visible = discs.count > 0; shafts.visible = shafts.count > 0;
      discs.instanceMatrix.needsUpdate = true; shafts.instanceMatrix.needsUpdate = true;
      if (discs.instanceColor) discs.instanceColor.needsUpdate = true;
      if (shafts.instanceColor) shafts.instanceColor.needsUpdate = true;
      return nD;
    },

    stats() {
      return {
        calls: (discs.visible ? 1 : 0) + (shafts.visible ? 1 : 0),
        triangles: (discs.count + shafts.count) * 2,
      };
    },
  };
  return api;
}
