// camera/hypot.js — Math.hypot for the camera's hot loops, without its allocation (BRIEF Contract J).
//
// V8's Math.hypot (Torque MathHypot) copies its arguments into a fresh FixedDoubleArray on every call, so the
// sweep's per-instance and per-mesh world scales (3 × Math.hypot each, thousands a sweep) and fadeBlockers()'s
// per-candidate scale (every frame) were a steady source of garbage. These run V8's exact algorithm — NaN /
// Infinity rules, the largest |x| as the normaliser, a Kahan-compensated sum of squares, sqrt(sum) × max — so
// they return the SAME double, bit for bit, as Math.hypot in Chrome (checked on 3M random and special triples in
// Chrome 153, Chromium 131 and node 22: 0 differ). What the camera decides from them therefore does not change.
// (Other engines round Math.hypot their own way; there these agree with V8, i.e. to the last bit or so.)

/** Math.hypot(a, b, c), bit-identical to V8's, no allocation. */
export function hypot3(a, b, c) {
  let nan = false, max = 0;
  const x = Math.abs(a), y = Math.abs(b), z = Math.abs(c);
  if (x !== x) nan = true; else if (x > max) max = x;
  if (y !== y) nan = true; else if (y > max) max = y;
  if (z !== z) nan = true; else if (z > max) max = z;
  if (max === Infinity) return Infinity;
  if (nan) return NaN;
  if (max === 0) return 0;
  let sum = 0, comp = 0, n, s, pre;
  n = x / max; s = n * n - comp; pre = sum + s; comp = (pre - sum) - s; sum = pre;
  n = y / max; s = n * n - comp; pre = sum + s; comp = (pre - sum) - s; sum = pre;
  n = z / max; s = n * n - comp; pre = sum + s; comp = (pre - sum) - s; sum = pre;
  return Math.sqrt(sum) * max;
}

/** Math.hypot(a, b), bit-identical to V8's, no allocation. */
export function hypot2(a, b) {
  let nan = false, max = 0;
  const x = Math.abs(a), y = Math.abs(b);
  if (x !== x) nan = true; else if (x > max) max = x;
  if (y !== y) nan = true; else if (y > max) max = y;
  if (max === Infinity) return Infinity;
  if (nan) return NaN;
  if (max === 0) return 0;
  let sum = 0, comp = 0, n, s, pre;
  n = x / max; s = n * n - comp; pre = sum + s; comp = (pre - sum) - s; sum = pre;
  n = y / max; s = n * n - comp; pre = sum + s; comp = (pre - sum) - s; sum = pre;
  return Math.sqrt(sum) * max;
}
