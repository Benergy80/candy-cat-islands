// Mid-crossing company: a pod of leaping gummy dolphins and one opportunistic
// seagull who lands on the horn. Both hide themselves when off duty (hidden
// objects cost no draw calls).
import * as THREE from 'three';
import { Merger } from './geo.js';
import { rng, hash, clamp } from '../../core/util.js';
import { CANDY } from '../../core/palette.js';

function ellipsoid(sx, sy, sz, seg = 12) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4));
  g.scale(sx, sy, sz);
  return g;
}

// ── gummy dolphins ───────────────────────────────────────────────────────────
// They escort the BOW, in pairs, close enough that you read them as company and
// not as scenery: three pairs inside 10 units of the bow wave, each pair leaping
// a beat apart, every fin double-sided so a dolphin on the far side of the arc
// is still a dolphin and not a dark sliver.
const POD = [
  //  side, lateral, along, phase — lateral must clear her 4.3 u half-beam plus
  //  their own body, or the pod swims THROUGH her
  [1, 8.4, 14.0, 0.00], [1, 10.2, 11.2, 0.13],
  [-1, 8.8, 12.6, 0.46], [-1, 10.6, 9.6, 0.59],
  [1, 11.4, 6.4, 0.74], [-1, 11.8, 5.2, 0.86],
];
/** Instances 0..n-1 are dolphins; instances n..2n-1 are the same geometry
 *  squashed flat on the water as that dolphin's blob shadow. Same InstancedMesh,
 *  so the whole pod plus its shadows is still ONE draw call — and a leaping
 *  dolphin with nothing under it reads as a sticker hovering over the sea. */
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
export function buildDolphins(count = 6) {
  const m = new Merger();
  m.add(ellipsoid(0.42, 0.46, 1.35, 12), 0xffffff, {});
  m.add(ellipsoid(0.3, 0.26, 0.6, 10), 0xfff3f6, { y: -0.16, z: 0.36 });
  m.add(new THREE.ConeGeometry(0.22, 0.75, 8), 0xffffff, { rx: 1.5, y: 0.02, z: 1.5 });
  m.add(ellipsoid(0.1, 0.42, 0.34, 8), 0xffffff, { y: 0.5, z: -0.15 });          // dorsal
  for (const s of [1, -1]) m.add(ellipsoid(0.5, 0.08, 0.26, 8), 0xffffff, { rz: -s * 0.5, x: s * 0.42, y: -0.2, z: 0.25 });
  m.add(ellipsoid(0.85, 0.09, 0.4, 8), 0xffffff, { z: -1.45 });                   // fluke
  m.add(new THREE.SphereGeometry(0.06, 6, 5), 0x2b2140, { x: 0.26, y: 0.16, z: 0.92 });
  m.add(new THREE.SphereGeometry(0.06, 6, 5), 0x2b2140, { x: -0.26, y: 0.16, z: 0.92 });
  const geo = m.geometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.0, side: THREE.DoubleSide });
  const N = Math.min(count, POD.length);
  const mesh = new THREE.InstancedMesh(geo, mat, N * 2);
  // the blob shadows are the grounding; a second real shadow pass on top of them
  // just doubles them up at an angle
  mesh.castShadow = false; mesh.frustumCulled = false; mesh.visible = false;
  const r = rng(hash('gummy-dolphins'));
  const pod = [];
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const [side, lateral, along, phase] = POD[i];
    pod.push({
      side, lateral, along, phase,
      rate: 0.46 + (i % 3) * 0.015, scale: r.range(0.72, 0.95),
      // WAVE 5 birds-flicker: each dolphin joins and leaves the pod only at the
      // BOTTOM of a dive (u wraps 1 → 0, 1.3 u under the sea), never mid-leap
      want: false, live: false, pres: 0, u: -1, leaving: false, grow: false,
    });
    col.setHex(r.pick([CANDY.gummyRed, CANDY.gummyGreen, CANDY.gummyBlue, CANDY.gummyYellow, CANDY.gummyPurple, CANDY.gummyOrange]));
    mesh.setColorAt(i, col);
    mesh.setColorAt(N + i, col);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  const dummy = new THREE.Object3D();
  const shade = new THREE.Color();
  const SHADOW_NEAR = new THREE.Color(0x14384f), SHADOW_FAR = new THREE.Color(0x4b86a4);
  mesh.userData.pod = pod;
  // WAVE 5 birds-flicker (Ben: rainbow-coloured things over the water
  // "disappearing and reappearing"). ferry.js used to switch the whole pod's
  // mesh on at 16–26 % of the crossing and off at 86 %, so every dolphin that
  // happened to be mid-leap — and every blob shadow on the water — blinked in
  // or out of the frame at once. Now: join() / leave() only set a wish; each
  // dolphin acts on it when its own dive passes its deepest point (under the
  // opaque strait), and its blob shadow grows / shrinks over ~0.25 s around
  // it. busy() is false once every dolphin has gone: then hide the mesh.
  // reset(on) is for poses and berths: everyone on (or off) at once.
  let lastE = null;
  mesh.userData.join = () => { for (const d of pod) d.want = true; };
  mesh.userData.leave = () => { for (const d of pod) d.want = false; };
  mesh.userData.busy = () => pod.some((d) => d.want || d.live || d.pres > 0);
  mesh.userData.reset = (on) => { for (const d of pod) { d.want = d.live = !!on; d.pres = on ? 1 : 0; d.u = -1; d.leaving = d.grow = false; } lastE = null; };
  /** Mid-strait beat: the lead dolphin throws a barrel roll. */
  mesh.userData.flip = (elapsed) => { pod[0].flipAt = elapsed; };
  mesh.userData.place = (px, pz, hx, hz, elapsed, splash) => {
    const rx = -hz, rz = hx;           // right-hand side vector
    const yaw = Math.atan2(hx, hz);
    const dt = lastE === null ? 0 : clamp(elapsed - lastE, 0, 0.1);
    lastE = elapsed;
    for (let i = 0; i < pod.length; i++) {
      const d = pod[i];
      const u = ((elapsed * d.rate + d.phase) % 1 + 1) % 1;
      // join / leave at the bottom of the dive only
      // (polish: a leaver commits on the way DOWN — u ≥ 0.86, already under the sea — and shrinks to
      // nothing by the bottom; a joiner grows from nothing on the way up, still under it. The probe saw
      // the old hard switch as a full-size body vanishing in frame at y −1.2, and the strait is not
      // perfectly opaque from the high ferry lens.)
      if (d.u >= 0 && u < d.u) {
        if (d.leaving) { d.live = false; d.leaving = false; }
        else if (!d.live && d.want) { d.live = true; d.grow = true; }
      }
      if (d.live && !d.want && !d.leaving && u >= 0.86 && u < 0.93) d.leaving = true;
      if (d.grow && u >= 0.14) d.grow = false;
      d.u = u;
      d.pres = clamp(d.pres + (d.live && !d.leaving ? dt : -dt) * 4, 0, 1);
      if (!d.live && d.pres <= 0) {
        mesh.setMatrixAt(i, ZERO); mesh.setMatrixAt(pod.length + i, ZERO);
        continue;
      }
      const arc = Math.sin(Math.PI * u);
      const y = -1.3 + 3.5 * arc;
      // they weave in and out a little as they run with her
      const lat = d.lateral + Math.sin(elapsed * 0.5 + d.phase * 6.3) * 0.7;
      const wx = px + hx * d.along + rx * lat * d.side;
      const wz = pz + hz * d.along + rz * lat * d.side;
      dummy.position.set(wx, y, wz);
      dummy.rotation.set(0, yaw, 0, 'YXZ');
      dummy.rotation.x = -Math.cos(Math.PI * u) * 1.05;
      dummy.rotation.z = Math.sin(Math.PI * u) * 0.22 * d.side;
      if (d.flipAt !== undefined) {
        const ft = (elapsed - d.flipAt) / 1.5;
        if (ft >= 0 && ft < 1) dummy.rotation.z += Math.PI * 2 * (ft * ft * (3 - 2 * ft));
        else if (ft >= 1) d.flipAt = undefined;
      }
      let gk = 1;
      if (d.leaving) gk = clamp((1 - u) / 0.14, 0, 1);
      else if (d.grow) gk = clamp(u / 0.14, 0, 1);
      dummy.scale.setScalar(d.live ? d.scale * gk * gk * (3 - 2 * gk) : 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // ── his shadow, flat on the sea: bigger and paler the higher he is ──
      const lift = Math.max(0, arc);
      dummy.position.set(wx, 0.07, wz);
      dummy.rotation.set(0, yaw, 0, 'YXZ');
      const blob = d.scale * (0.92 + lift * 0.5) * (d.pres * d.pres * (3 - 2 * d.pres));
      dummy.scale.set(blob, 0.01, blob);
      dummy.updateMatrix();
      mesh.setMatrixAt(pod.length + i, dummy.matrix);
      shade.copy(SHADOW_NEAR).lerp(SHADOW_FAR, Math.min(1, lift * 1.15));
      mesh.setColorAt(pod.length + i, shade);
      // splash out of the water and back into it
      if (splash && d.live) {
        const step = (1 / 30) * d.rate;
        if ((u > 0.10 && u - step <= 0.10) || (u > 0.90 && u - step <= 0.90)) splash(wx, wz, u > 0.5 ? 1.5 : 1);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  return mesh;
}

// ── seagull ──────────────────────────────────────────────────────────────────
export function buildSeagull() {
  const group = new THREE.Group();
  group.visible = false;
  const b = new Merger();
  b.add(ellipsoid(0.24, 0.25, 0.44, 12), 0xfdfbf4, {});
  b.add(ellipsoid(0.17, 0.17, 0.18, 10), 0xfdfbf4, { y: 0.24, z: 0.22 });        // head
  b.add(new THREE.ConeGeometry(0.055, 0.26, 7), 0xffa83c, { rx: 1.45, y: 0.22, z: 0.42 });
  b.add(new THREE.SphereGeometry(0.04, 6, 5), 0x2b2140, { x: 0.1, y: 0.3, z: 0.3 });
  b.add(new THREE.SphereGeometry(0.04, 6, 5), 0x2b2140, { x: -0.1, y: 0.3, z: 0.3 });
  b.add(ellipsoid(0.2, 0.06, 0.26, 8), 0xdfe4ea, { rx: -0.4, y: 0.06, z: -0.42 }); // tail
  for (const s of [1, -1]) b.add(new THREE.BoxGeometry(0.06, 0.16, 0.06), 0xffa83c, { x: s * 0.09, y: -0.24, z: 0.02 });
  const body = b.mesh({ roughness: 0.7 });
  body.name = 'gull-body';

  // ── both wings, ONE InstancedMesh ──
  // Two wing pivots were two draw calls for eight triangles of bird. The left
  // instance is the same geometry turned through π about Y (a negative scale
  // would flip its winding and show backfaces), and BOTH take the same +flap
  // about Z, which after that turn sends both tips up together.
  const w = new Merger();
  w.add(ellipsoid(0.52, 0.05, 0.24, 10), 0xfdfbf4, { x: 0.5 });
  w.add(ellipsoid(0.2, 0.045, 0.14, 8), 0x4a4f5c, { x: 0.92, z: -0.05 });
  const wings = new THREE.InstancedMesh(w.geometry(), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.7, metalness: 0,
  }), 2);
  wings.name = 'gull-wings';
  wings.castShadow = true;
  wings.frustumCulled = false;
  const dummy = new THREE.Object3D();
  /** flap: 0 = level, + = tips up. */
  wings.userData.flap = (angle) => {
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      dummy.position.set(s * 0.12, 0.1, 0);
      dummy.rotation.set(0, s > 0 ? 0 : Math.PI, angle, 'YXZ');
      dummy.updateMatrix();
      wings.setMatrixAt(i, dummy.matrix);
    }
    wings.instanceMatrix.needsUpdate = true;
  };
  wings.userData.flap(0.2);
  group.add(wings, body);
  return { group, body, wings };
}
