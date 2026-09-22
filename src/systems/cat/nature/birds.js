// ─────────────────────────────────────────────────────────────────────────────
// CAT ISLAND NATURE — birds.
// Seagulls wheel over Fish Harbor (something for the cats to stare at) and a
// flock of pigeons works Purrliament Square until you get too close.
// Two InstancedMeshes, matrices rewritten each frame (27 instances, no allocs).
// aSway doubles as the per-instance wing-flap amplitude for the bird shader.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as W from '../../../core/world.js';
import { rng, hash, damp } from '../../../core/util.js';

const TAU = Math.PI * 2;

export function createBirds(ctx, geoGull, geoPigeon, mat, geoBlob, matBlob) {
  const rand = rng(hash('cat-nature-birds'));
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

  // ── gulls ─────────────────────────────────────────────────────────────────
  // Two flocks, both low enough to stay inside a 46-unit game-camera frame:
  // the harbour (where the fish are) and the Commons (where the picnics are).
  const FLOCKS = [{ x: 100, z: 58, n: 8, r: [8, 20] }, { x: 145, z: -54, n: 7, r: [10, 24] }];
  const gulls = [];
  for (const f of FLOCKS) {
    for (let i = 0; i < f.n; i++) {
      const cx = f.x + (rand() - 0.5) * 20, cz = f.z + (rand() - 0.5) * 18;
      gulls.push({
        cx, cz, r: f.r[0] + rand() * (f.r[1] - f.r[0]), a: rand() * TAU,
        w: (0.2 + rand() * 0.22) * (rand() < 0.25 ? -1 : 1),
        // ≥ 9 units up: at 7 a wheeling gull grazed the pines and read as a
        // paper dart lying on the canopy rather than as a bird in the air
        y: W.height(cx, cz) + 9.5 + rand() * 8, bob: rand() * TAU, s: 0.85 + rand() * 0.3,
      });
    }
  }
  const gullMesh = new THREE.InstancedMesh(geoGull, mat, gulls.length);
  gullMesh.name = 'cat_nature_gulls';
  gullMesh.castShadow = false; gullMesh.receiveShadow = false;
  gullMesh.frustumCulled = false;
  setAttr(geoGull, gulls.length, (i) => [rand() * TAU, 0.9, [1, 1, 1]]);

  // ── pigeons ───────────────────────────────────────────────────────────────
  // Three squares work: Purrliament, the Commons bandstand, Welcome Plaza.
  const SQ = { x: 152, z: 6 };
  const HUBS = [{ x: 152, z: 6, n: 12, r: [11, 21] }, { x: 145, z: -53, n: 8, r: [8, 16] }, { x: 78, z: 18, n: 7, r: [11, 16] }];
  const pigeons = [];
  for (const hub of HUBS) {
    for (let i = 0; i < hub.n; i++) {
      const a = rand() * TAU, r = hub.r[0] + Math.sqrt(rand()) * (hub.r[1] - hub.r[0]);
      const hx = hub.x + Math.cos(a) * r, hz = hub.z + Math.sin(a) * r;
      pigeons.push({
        hub, hx, hz, x: hx, z: hz, y: W.height(hx, hz), ty: W.height(hx, hz),
        state: 0, t: rand() * 3, yaw: rand() * TAU, peck: rand() * TAU,
        wx: 0, wz: 0, s: 1.05 + rand() * 0.4, flap: 0, ca: rand() * TAU, cr: 13 + rand() * 9,
      });
    }
  }
  const pigeonMesh = new THREE.InstancedMesh(geoPigeon, mat, pigeons.length);
  pigeonMesh.name = 'cat_nature_pigeons';
  pigeonMesh.castShadow = false; pigeonMesh.receiveShadow = false;
  pigeonMesh.frustumCulled = false;
  setAttr(geoPigeon, pigeons.length, () => [rand() * TAU, 0, [0.86 + rand() * 0.2, 0.86 + rand() * 0.14, 0.9 + rand() * 0.1]]);

  function setAttr(geo, n, fn) {
    const phase = new Float32Array(n), sway = new Float32Array(n), tint = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const [p, s, c] = fn(i);
      phase[i] = p; sway[i] = s; tint[i * 3] = c[0]; tint[i * 3 + 1] = c[1]; tint[i * 3 + 2] = c[2];
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aSway', new THREE.InstancedBufferAttribute(sway, 1));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  }

  const pigeonSway = geoPigeon.attributes.aSway;

  // ── contact shadows ───────────────────────────────────────────────────────
  // A standing bird with no shadow floats, and round 3 read the whole flock as
  // "flat paper shapes lying on the grass". One tiny dark disc per pigeon,
  // pressed to the ground under it and scaled to zero the moment it takes off.
  const blobMesh = geoBlob ? new THREE.InstancedMesh(geoBlob, matBlob, pigeons.length) : null;
  if (blobMesh) {
    blobMesh.name = 'cat_nature_birdshadows';
    blobMesh.castShadow = false; blobMesh.receiveShadow = false;
    blobMesh.frustumCulled = false;
    blobMesh.renderOrder = -1;
  }

  function place(mesh, i, x, y, z, yaw, roll, pitch, s) {
    _e.set(pitch, yaw, roll, 'YXZ');
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(s, s, s));
    mesh.setMatrixAt(i, _m);
  }
  function blob(i, x, z, gy, air, s) {
    if (!blobMesh) return;
    const k = Math.max(0, 1 - air / 2.2) * s;
    _e.set(0, 0, 0, 'YXZ');
    _m.compose(_p.set(x, gy + 0.035, z), _q.setFromEuler(_e), _s.set(k, 1, k));
    blobMesh.setMatrixAt(i, _m);
  }

  const api = {
    meshes: blobMesh ? [gullMesh, pigeonMesh, blobMesh] : [gullMesh, pigeonMesh],
    gulls, pigeons,
    /** Where the gulls are right now — cats may want to stare. */
    gullPositions: () => gulls.map((g) => ({ x: g.cx + Math.cos(g.a) * g.r, y: g.y, z: g.cz + Math.sin(g.a) * g.r * 0.8 })),
    update(dt, t, player) {
      for (let i = 0; i < gulls.length; i++) {
        const g = gulls[i];
        g.a += g.w * dt;
        const x = g.cx + Math.cos(g.a) * g.r, z = g.cz + Math.sin(g.a) * g.r * 0.8;
        const y = g.y + Math.sin(t * 0.7 + g.bob) * 0.8;
        place(gullMesh, i, x, y, z, Math.atan2(-Math.sin(g.a) * g.w, Math.cos(g.a) * g.w * 0.8), -Math.sign(g.w) * 0.45, 0, g.s);
      }
      gullMesh.instanceMatrix.needsUpdate = true;

      const px = player ? player.x : 1e6, pz = player ? player.z : 1e6;
      let swayDirty = false;
      for (let i = 0; i < pigeons.length; i++) {
        const b = pigeons[i];
        b.t += dt;
        const d = Math.hypot(b.hx - px, b.hz - pz);
        if (b.state === 0) {
          if (b.t > 2.2) { b.t = 0; b.wx = (rand() - 0.5) * 2.4; b.wz = (rand() - 0.5) * 2.4; b.yaw = Math.atan2(b.wx, b.wz); }
          b.x = damp(b.x, b.hx + b.wx, 1.6, dt); b.z = damp(b.z, b.hz + b.wz, 1.6, dt);
          b.y = damp(b.y, W.height(b.x, b.z), 8, dt);
          b.peck += dt * 5;
          if (b.flap !== 0) { b.flap = 0; swayDirty = true; }
          if (d < 8.5) { b.state = 1; b.t = 0; b.ca = Math.atan2(b.z - pz, b.x - px); b.flap = 1.15; swayDirty = true; }
          // UPRIGHT at rest — the old idle pitch of 0.08 rad with a 0.85 peck
          // laid the bird on its face; now it stands and only DIPS to peck
          place(pigeonMesh, i, b.x, b.y, b.z, b.yaw, 0, Math.sin(b.peck) > 0.78 ? 0.62 : -0.06, b.s);
          blob(i, b.x, b.z, W.height(b.x, b.z), 0, b.s);
        } else {
          const target = b.state === 1
            ? { x: b.x + Math.cos(b.ca) * 7, y: W.height(b.x, b.z) + 9 + (i % 4), z: b.z + Math.sin(b.ca) * 7 }
            : (b.state === 2
              ? { x: b.hub.x + Math.cos(b.ca += dt * 0.55) * b.cr, y: W.height(b.hub.x, b.hub.z) + 10 + (i % 5) * 0.9, z: b.hub.z + Math.sin(b.ca) * b.cr * 0.8 }
              : { x: b.hx, y: W.height(b.hx, b.hz), z: b.hz });
          const k = b.state === 3 ? 2.2 : 1.5;
          const ox = b.x, oz = b.z;
          b.x = damp(b.x, target.x, k, dt); b.z = damp(b.z, target.z, k, dt); b.y = damp(b.y, target.y, k, dt);
          const vx = b.x - ox, vz = b.z - oz;
          if (vx * vx + vz * vz > 1e-5) b.yaw = damp(b.yaw, Math.atan2(vx, vz) + Math.round((b.yaw - Math.atan2(vx, vz)) / TAU) * TAU, 8, dt);
          if (b.state === 1 && b.t > 1.1) { b.state = 2; b.t = 0; b.ca = Math.atan2(b.z - b.hub.z, b.x - b.hub.x); }
          else if (b.state === 2 && b.t > 4 + (i % 5) && d > 12) { b.state = 3; b.t = 0; }
          else if (b.state === 3 && Math.abs(b.y - target.y) < 0.35 && Math.hypot(b.x - b.hx, b.z - b.hz) < 0.7) { b.state = 0; b.t = 0; b.flap = 0; swayDirty = true; }
          place(pigeonMesh, i, b.x, b.y, b.z, b.yaw, 0, -0.12, b.s);
          const gy = W.height(b.x, b.z);
          blob(i, b.x, b.z, gy, b.y - gy, b.s);
        }
        if (swayDirty) pigeonSway.array[i] = b.flap;
      }
      pigeonMesh.instanceMatrix.needsUpdate = true;
      if (blobMesh) blobMesh.instanceMatrix.needsUpdate = true;
      if (swayDirty) pigeonSway.needsUpdate = true;
    },
  };
  return api;
}
