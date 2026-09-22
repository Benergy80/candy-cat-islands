// Where the Sugarfin Express waits, and the lazy S she swims between the piers.
import * as THREE from 'three';

/** Body-centre height relative to sea level. She sits LOW: the sea cuts her at
 *  the cream/blue colour change, her widest point is under it, and the fluke and
 *  pectorals ride at the surface instead of over it. Raising this floats her. */
export const WATER_Y = 0.05;

export const DOCKS = {
  // world.FERRY_ROUTE.from/to are (-30,22)/(30,22); she lies off the seaward end
  // of whatever pier got built, close enough that a short plank reaches it.
  // `dir` points out to sea; `shoreX` is roughly where walkable land ends.
  // `x` / `landX` are refined at runtime from the pier that actually got built.
  // She berths BOW-NORTH at both piers (yaw = π) so her face is toward the
  // island each time; `gang` says which flank the plank swings from, because the
  // pier is to port at one end of the run and to starboard at the other. Both
  // piers are open only at their seaward end, so she lies across it.
  candy: { id: 'candy', x: -24, z: 22, yaw: Math.PI, gang: 1, dir: 1, shoreX: -36, pier: 'Sugar Pier', island: 'Candyland' },
  cat: { id: 'cat', x: 24, z: 22, yaw: Math.PI, gang: -1, dir: -1, shoreX: 36, pier: 'Arrivals Pier', island: 'Cat Island' },
};

const _a = new THREE.Vector2();

/** Cubic bezier S-curve between two docks (never a straight line). */
export function makeRoute(fromId, toId) {
  const a = DOCKS[fromId], b = DOCKS[toId];
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const px = -uz, pz = ux;              // perpendicular
  const bow = 14.5;
  const c1 = { x: a.x + ux * len * 0.40 + px * bow, z: a.z + uz * len * 0.40 + pz * bow };
  const c2 = { x: b.x - ux * len * 0.40 - px * bow, z: b.z - uz * len * 0.40 - pz * bow };
  const pts = [a, c1, c2, b];
  const point = (t, out) => {
    const m = 1 - t;
    const w0 = m * m * m, w1 = 3 * m * m * t, w2 = 3 * m * t * t, w3 = t * t * t;
    out.x = w0 * pts[0].x + w1 * pts[1].x + w2 * pts[2].x + w3 * pts[3].x;
    out.y = w0 * pts[0].z + w1 * pts[1].z + w2 * pts[2].z + w3 * pts[3].z;
    return out;
  };
  const tangent = (t, out) => {
    const m = 1 - t;
    const w0 = 3 * m * m, w1 = 6 * m * t, w2 = 3 * t * t;
    out.x = w0 * (pts[1].x - pts[0].x) + w1 * (pts[2].x - pts[1].x) + w2 * (pts[3].x - pts[2].x);
    out.y = w0 * (pts[1].z - pts[0].z) + w1 * (pts[2].z - pts[1].z) + w2 * (pts[3].z - pts[2].z);
    const l = Math.hypot(out.x, out.y) || 1;
    out.x /= l; out.y /= l;
    return out;
  };
  return { from: a, to: b, point, tangent, control: pts, _a };
}
