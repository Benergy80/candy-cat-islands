// ─────────────────────────────────────────────────────────────────────────────
// WINDOW LOAVES — "a loaf in every window."
//
// The Whisker Heights sign promises that every window has a sill wide enough to
// lie on and a cushion with a dent in it, and the architecture duly puts a cat
// on every GROUND-floor sill. The upper storeys — the ones that glow amber all
// night and are the whole silhouette of the neighbourhood from the green — were
// empty. Nine loaves, one InstancedMesh, no schedule, no opinions.
//
// Positions are derived from catHouse()'s own window maths (architecture/
// outskirts.js): upper window i=1 sits at lx = w*0.25 on the front face,
// sill height y0 = h - 3.3, and a loaf rides it at y0 + 0.18, lz = d/2 + 0.36,
// turned 1.6 rad so it lies ALONG the sill. If those houses ever move, these
// move with them only if this table is updated too — it is a copy, and it is
// the one fragile thing in this file.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Pool, merge } from './rig.js';
import { tileUV, furMaterial } from './fur.js';

const sph = (r, w, h) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, s) => new THREE.ConeGeometry(r, h, s);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const xf = (g, sx, sy, sz, tx = 0, ty = 0, tz = 0) => { g.scale(sx, sy, sz); g.translate(tx, ty, tz); return g; };

/**
 * A cat folded into a loaf. Head at +Z, origin on the cushion, and — the whole
 * point of the silhouette — TALL POINTED EARS and a tail that runs off the cat's
 * −X side and hangs BELOW y = 0, i.e. over the front lip of the sill.
 * The loaf is set down turned along the sill (see placeSillLoaves), so −X is the
 * outward face of the house: the tail dangles into the street.
 */
function loafGeo() {
  const body = xf(sph(0.34, 8, 5), 1.02, 0.84, 1.38, 0, 0.29, 0);
  const head = xf(sph(0.25, 7, 4), 1.02, 0.96, 1.00, 0, 0.41, 0.41);
  // ears: twice as tall as before, splayed, and clear of the skull dome. At
  // 30 m these two triangles are the only thing that says CAT rather than LUMP.
  const ears = [-1, 1].map((s) => ({
    g: (() => { const c = cone(0.108, 0.34, 5); c.rotateZ(-s * 0.34); c.rotateX(-0.12); c.translate(s * 0.146, 0.620, 0.352); return c; })(),
  }));
  // tail: over the edge and down. Six beads from the haunch, round the −X side,
  // finishing at y = −0.34 — clear daylight between it and the sill.
  const tail = [];
  const TP = [
    [-0.16, 0.21, -0.34], [-0.34, 0.16, -0.24], [-0.45, 0.06, -0.04],
    [-0.48, -0.09, 0.16], [-0.46, -0.23, 0.31], [-0.42, -0.34, 0.42],
  ];
  TP.forEach(([x, y, z], i) => tail.push({ g: xf(sph(0.094 - i * 0.010, 5, 3), 1, 0.92, 1, x, y, z) }));
  return merge([
    { g: body }, { g: head }, ...ears, ...tail,
    // paws tucked in front — the "bread" of the loaf
    { g: xf(sph(0.105, 5, 3), 1.55, 0.62, 0.86, 0, 0.085, 0.34), color: 0xfff4e6 },
    { g: xf(sph(0.105, 5, 3), 1.10, 0.80, 1.00, 0, 0.350, 0.585), color: 0xfff4e6 },
    // eyes shut: two contented slits. Nobody up there is awake.
    ...[-1, 1].map((s) => ({ g: (() => { const b = box(0.095, 0.026, 0.022); b.translate(s * 0.102, 0.436, 0.606); return b; })(), color: 0x2a2028 })),
  ]);
}

// x, z, ry, w, d, h — copied from buildHeights()'s `homes`, plus a resident
const HOMES = [
  [163, 34, 0.35, 10.0, 9.0, 9.0, 'tabby'],
  [178, 31, 0.05, 11.0, 9.5, 10.0, 'grey'],
  [193, 34, -0.32, 9.6, 9.0, 8.6, 'calico'],
  [201, 48, -1.45, 10.4, 9.2, 9.4, 'ginger'],
  [194, 62, -2.7, 9.8, 9.0, 8.8, 'tuxedo'],
  [178, 66, Math.PI, 11.0, 9.4, 9.6, 'white'],
  [162, 62, 2.6, 9.6, 9.0, 8.8, 'siamese'],
  [154, 48, 1.5, 10.2, 9.2, 9.2, 'black'],
  [190, 20, -0.2, 9.4, 8.8, 8.4, 'tabby'],
];

export function addSillPool(lib) {
  // A loaf in a lit window is BACKLIT: the amber pane behind it is the brightest
  // surface in the neighbourhood and the cat in front of it went to pure black.
  // Its own material carries a warm emissive (the room's lamp falling on its
  // back) that the citizens system ramps with nightfall.
  const m = furMaterial({ emissive: 0xffb45a, emissiveIntensity: 0 });
  lib.materials.sillMat = m;
  lib.pools.sillLoaf = new Pool('sillLoaf', loafGeo(), m, { fur: true, cast: false });
  return lib;
}

/** Place the loaves on the upper sills. Returns the nodes for the breathing pass. */
export function placeSillLoaves(lib, world) {
  const pool = lib.pools.sillLoaf;
  const nodes = [];
  const put = (x, z, ry, y, lx, lz, pattern, i, scale) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    const n = new THREE.Object3D();
    n.position.set(x + lx * c + lz * s, y, z - lx * s + lz * c);
    n.rotation.y = ry + 1.6;
    n.userData.s = scale;
    n.userData.ph = i * 1.7;
    n.scale.setScalar(scale);
    n.updateMatrix(); n.matrixWorld.copy(n.matrix);
    pool.add(n, { tile: tileUV(pattern) });
    nodes.push(n);
  };
  // the second coat in each house — a flatmate, and a second lit window
  const MATE = ['grey', 'tabby', 'tuxedo', 'white', 'calico', 'black', 'ginger', 'siamese', 'grey'];
  HOMES.forEach(([x, z, ry, w, d, h, pattern], i) => {
    const gy = Math.max(world.height(x, z), 0.4);
    const sy = gy + (h - 3.3) + 0.18;
    put(x, z, ry, sy, w * 0.25 + 0.30, d / 2 + 0.36, pattern, i, 1.5);
    // upper window i = 0 has the flower box; the loaf sits BEHIND the geraniums,
    // ears and tail clear above them. Skipped on two houses so the row of
    // windows isn't metronomic.
    if (i % 4 !== 3) put(x, z, ry, sy, -(w * 0.25) - 0.10, d / 2 + 0.30, MATE[i], i + 4, 1.38);
  });
  return nodes;
}

/** Nine sleeping cats, breathing, forever. */
export function breatheSills(nodes, el) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i], b = Math.sin(el * 1.15 + n.userData.ph);
    n.scale.set(n.userData.s * (1 - b * 0.012), n.userData.s * (1 + b * 0.030), n.userData.s * (1 - b * 0.012));
    n.updateMatrix(); n.matrixWorld.copy(n.matrix);
  }
}
