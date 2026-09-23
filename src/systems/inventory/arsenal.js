// ─────────────────────────────────────────────────────────────────────────────
// ARSENAL — wave-3 weapon + ammo geometry (Contract C).
//
// Same authoring convention as items.js: every builder receives a `part()`
// accumulator, y = 0 is the GRIP (where the fist closes) and the item grows
// along +Y (hand weapons) or sits on a vertical grip with the business end
// pointing +Z (guns, like the salt gun and the Caramelizer). Everything is
// baked into one vertex-coloured geometry per item, so an island of ammo is a
// handful of instanced draw calls. The `glow` channel marks the hot bits.
//
// COLOUR RULE (inherited): a weapon is never the colour of the place it lies
// in. Candyland is pastel frosting, Cat Island is sand and stone, so every
// silhouette gets one saturated body hue plus a hot accent.
//
// Also here: the projectile shapes (what actually flies) and the licorice LASH
// that uncoils out of the whip's fist for the crack.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const PI = Math.PI;

// ── weapons (held + pickup) ──────────────────────────────────────────────────

/** Jawbreaker Cannon — a stubby blue hand-mortar with a jawbreaker in its mouth. */
export function cannon(p) {
  p.box(0.13, 0.26, 0.11, 0x7a1f5c, { pos: [0, 0.12, -0.08], rot: [-0.24, 0, 0] });          // plum grip
  p.box(0.09, 0.07, 0.09, 0xffd21f, { pos: [0, 0.23, -0.02], glow: 0.25 });                   // brass trigger block
  p.cyl(0.175, 0.205, 0.66, 12, 0x2f56ff, { pos: [0, 0.35, 0.14], rot: [PI / 2, 0, 0] });   // fat royal-blue barrel
  for (const [z, c] of [[-0.12, 0xff4fa0], [0.12, 0xffd21f], [0.36, 0xff4fa0]]) {
    p.cyl(0.215, 0.215, 0.06, 12, c, { pos: [0, 0.35, z], rot: [PI / 2, 0, 0] });           // candy bands
  }
  p.add(new THREE.TorusGeometry(0.2, 0.055, 6, 14), 0xffd21f, { pos: [0, 0.35, 0.47], glow: 0.35 }); // muzzle lip
  // the jawbreaker poking out: layered stripes (bands in Y read as rings of candy)
  p.add(new THREE.SphereGeometry(0.165, 12, 9), 0xff2d4a,
    { pos: [0, 0.35, 0.47], bands: { size: 0.055, offset: 0.02, colors: [0xff2d4a, 0xfff2a8] }, glow: 0.18 });
  p.sph(0.17, 10, 7, 0xff4fa0, { pos: [0, 0.35, -0.2], scale: [1, 1, 0.8] });                // breech knob
  p.cyl(0.028, 0.028, 0.14, 5, 0x3a2a1a, { pos: [0, 0.5, -0.24], rot: [-0.5, 0, 0] });      // fuse
  p.sph(0.05, 6, 5, 0xffb03a, { pos: [0, 0.57, -0.28], glow: 1.0 });                          // lit tip
  p.box(0.05, 0.08, 0.1, 0xffd21f, { pos: [0, 0.57, 0.3] });                                  // sight
  for (const s of [-1, 1]) {                                                                   // side swirl discs
    p.cyl(0.11, 0.11, 0.03, 10, 0xffffff, { pos: [s * 0.215, 0.35, 0.06], rot: [0, 0, PI / 2] });
    p.box(0.035, 0.16, 0.035, 0xff2d4a, { pos: [s * 0.235, 0.35, 0.06], rot: [0.8, 0, 0] });
  }
}

/** Licorice Whip — red twisted handle, a coil of black licorice, a red popper. */
export function whip(p) {
  p.cyl(0.062, 0.07, 0.34, 8, 0xe0182f, { pos: [0, 0.17, 0] });                              // red licorice handle
  for (let i = 0; i < 4; i++) {                                                                // twist ridges
    p.box(0.15, 0.035, 0.035, 0x9a0c1c, { pos: [0, 0.05 + i * 0.08, 0], rot: [0, i * 0.8, 0.5] });
  }
  p.sph(0.085, 8, 6, 0xffd21f, { pos: [0, -0.01, 0], glow: 0.3 });                           // pommel
  p.cyl(0.08, 0.08, 0.04, 8, 0x1c1016, { pos: [0, 0.35, 0] });
  // three fat coils of black licorice hanging off the top of the handle
  for (let i = 0; i < 3; i++) {
    p.add(new THREE.TorusGeometry(0.2 - i * 0.02, 0.05, 6, 16), i === 1 ? 0x3a2030 : 0x241420,
      { pos: [0.16, 0.42 + i * 0.05, 0.0], rot: [0.25, 0.6 + i * 0.25, 0.1] });
  }
  // the tail: a short tapering drop + a red popper tassel
  p.cyl(0.04, 0.03, 0.32, 6, 0x241420, { pos: [0.34, 0.33, 0.02], rot: [0, 0, 0.35] });
  p.cone(0.07, 0.16, 6, 0xff2d4a, { pos: [0.4, 0.15, 0.02], rot: [0, 0, PI + 0.35], glow: 0.55 });
}

/** The lash itself: a tapering rope of licorice, length 1 along +Z (scaled per crack). */
export function lash(p) {
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, r = 0.07 - t0 * 0.035;
    p.cyl(r, r * 0.9, 1 / N + 0.012, 6, i % 2 ? 0x3a2030 : 0x241420, { pos: [0, 0, (i + 0.5) / N], rot: [PI / 2, 0, 0] });
  }
  p.cone(0.075, 0.16, 6, 0xff2d4a, { pos: [0, 0, 1.06], rot: [PI / 2, 0, 0], glow: 0.9 });
}

/** Pop Rocks — a crimped foil pouch with a starburst, fizzing crystals at the tear. */
export function poprocks(p) {
  p.box(0.34, 0.4, 0.11, 0xff3f9a, { pos: [0, 0.22, 0], glow: 0.08 });                      // hot-pink foil
  p.box(0.36, 0.06, 0.07, 0xffc4e4, { pos: [0, 0.445, 0] });                                  // crimped top
  p.box(0.36, 0.05, 0.07, 0xffc4e4, { pos: [0, 0.015, 0] });                                  // crimped bottom
  for (let i = 0; i < 6; i++) {                                                                // starburst on the front
    const a = i / 6 * PI * 2;
    p.box(0.05, 0.13, 0.02, 0xffe23a, { pos: [Math.sin(a) * 0.06, 0.22 + Math.cos(a) * 0.06, 0.062], rot: [0, 0, -a], glow: 0.55 });
  }
  p.box(0.1, 0.1, 0.02, 0xfff6c8, { pos: [0, 0.22, 0.066], rot: [0, 0, PI / 4], glow: 0.7 });
  p.box(0.05, 0.12, 0.02, 0x3aa8ff, { pos: [-0.11, 0.33, 0.06], rot: [0, 0, 0.5] });         // blue zig
  p.box(0.05, 0.1, 0.02, 0x3aa8ff, { pos: [-0.08, 0.26, 0.06], rot: [0, 0, -0.5] });
  for (let i = 0; i < 6; i++) {                                                                // crystals spilling out
    p.tet(0.04 + (i % 2) * 0.012, [0xff5fb0, 0x5fd8ff, 0xffe23a][i % 3],
      { pos: [0.12 + (i % 3) * 0.04, 0.48 + Math.floor(i / 3) * 0.05, (i % 2) * 0.04 - 0.02], rot: [i, i * 2, 0.3], glow: 0.9 });
  }
}

/** Bubblegum Blower — a pink bubble gun with a gumball hopper and a half-blown bubble. */
export function gumblower(p) {
  p.box(0.12, 0.24, 0.1, 0xc2186b, { pos: [0, 0.11, -0.05], rot: [-0.2, 0, 0] });             // magenta grip
  p.sph(0.17, 12, 9, 0xff2f8f, { pos: [0, 0.3, 0.06], scale: [0.95, 0.85, 1.45] });           // hot-pink body
  p.cyl(0.155, 0.155, 0.06, 12, 0x2fe0b0, { pos: [0, 0.3, 0.1], rot: [Math.PI / 2, 0, 0] });   // mint belly band
  p.box(0.07, 0.06, 0.09, 0x2fe0b0, { pos: [0, 0.2, 0.06] });                                 // mint trigger
  p.cyl(0.07, 0.09, 0.16, 10, 0x2fe0b0, { pos: [0, 0.31, 0.3], rot: [PI / 2, 0, 0] });       // mint nozzle
  p.add(new THREE.TorusGeometry(0.13, 0.03, 6, 16), 0xffffff, { pos: [0, 0.31, 0.39], glow: 0.4 }); // wand ring
  p.sph(0.2, 12, 9, 0xff8cc8, { pos: [0, 0.31, 0.57], glow: 0.4 });                          // the bubble
  p.sph(0.05, 6, 5, 0xffffff, { pos: [0.08, 0.4, 0.66], glow: 0.9 });                          // its highlight
  p.sph(0.15, 12, 8, 0xfff0f8, { pos: [0, 0.5, -0.02], glow: 0.18 });                          // gumball globe
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1;
    p.sph(0.05, 6, 5, [0xff3355, 0x3aa8ff, 0xffe23a, 0x5be27a, 0xb35bff, 0xff8c1a][i],
      { pos: [Math.cos(a) * 0.1, 0.46 + (i % 3) * 0.04, -0.02 + Math.sin(a) * 0.1], glow: 0.25 });
  }
  p.cyl(0.07, 0.07, 0.05, 8, 0xc2186b, { pos: [0, 0.64, -0.02] });                             // globe cap
}

/**
 * Marshmallow Launcher — NOT another striped tube (round-4 critique: it and
 * the cannon shared a silhouette). A short sky-blue body with a big flared
 * bell mouth, a coiled yellow spring at the back and, on top, a tall puffy
 * hopper of marshmallows: the cannon is a low log, this is a mushroom cloud.
 */
export function marsh(p) {
  p.box(0.12, 0.25, 0.1, 0x2a4f9a, { pos: [0, 0.11, -0.1], rot: [-0.22, 0, 0] });             // navy grip
  p.box(0.07, 0.06, 0.09, 0xffd21f, { pos: [0, 0.2, -0.02] });                                  // trigger
  p.cyl(0.13, 0.15, 0.4, 10, 0x4fb4ff, { pos: [0, 0.3, 0.1], rot: [PI / 2, 0, 0] });          // short sky-blue body
  p.cyl(0.3, 0.13, 0.26, 12, 0x2f8cff, { pos: [0, 0.3, 0.43], rot: [PI / 2, 0, 0] });         // flared bell mouth
  p.add(new THREE.TorusGeometry(0.29, 0.04, 6, 16), 0xffffff, { pos: [0, 0.3, 0.56], glow: 0.35 });   // white lip
  p.cyl(0.16, 0.16, 0.08, 10, 0xfffaf2, { pos: [0, 0.3, 0.5], rot: [PI / 2, 0, 0], glow: 0.3 }); // the loaded mallow
  for (let i = 0; i < 3; i++) {                                                                 // the coil spring
    p.add(new THREE.TorusGeometry(0.1, 0.03, 5, 12), 0xffd21f, { pos: [0, 0.3, -0.14 - i * 0.07], glow: 0.2 });
  }
  p.sph(0.08, 8, 6, 0xff4fa0, { pos: [0, 0.3, -0.36] });                                        // pull knob
  // the hopper: a pale glass cup on a neck, heaped with fat marshmallows
  p.cyl(0.06, 0.06, 0.1, 8, 0x2a4f9a, { pos: [0, 0.46, 0.08] });
  p.cyl(0.22, 0.12, 0.2, 12, 0xcfeaff, { pos: [0, 0.6, 0.08], glow: 0.18 });
  // puffy: squashed spheres, not cylinders (cylinders read as sugar cubes)
  const M = [[-0.11, 0.74, 0.02, 0.2], [0.12, 0.74, 0.04, -0.3], [0.0, 0.75, 0.2, 0.5], [0.01, 0.89, 0.07, 0.9], [-0.04, 0.79, -0.11, 0.1]];
  for (let i = 0; i < M.length; i++) {
    const [x, y, z, r] = M[i];
    p.sph(0.125, 9, 7, i === 3 ? 0xf0c890 : 0xfffaf2, { pos: [x, y, z], rot: [r, i * 0.8, r * 0.5], scale: [1, 0.82, 1], glow: 0.24 });
  }
}

/** Peppermint Boomerang — a red/white V with a peppermint swirl at the elbow. */
export function boomerang(p) {
  for (const s of [-1, 1]) {
    const a = s * 0.62;
    for (let i = 0; i < 4; i++) {
      const d = 0.06 + i * 0.11;
      p.box(0.115, 0.13, 0.07, i % 2 ? 0xffffff : 0xff1f3f,
        { pos: [Math.sin(a) * d, Math.cos(a) * d + 0.04, 0], rot: [0, 0, -a] });
    }
    p.sph(0.07, 8, 6, 0xff1f3f, { pos: [Math.sin(a) * 0.49, Math.cos(a) * 0.49 + 0.04, 0], scale: [1, 1, 0.5] });
  }
  p.cyl(0.14, 0.14, 0.09, 14, 0xffffff, { pos: [0, 0.0, 0], rot: [PI / 2, 0, 0] });            // the mint
  for (let i = 0; i < 6; i++) {                                                                 // swirl wedges
    const a = i / 6 * PI * 2;
    p.box(0.05, 0.12, 0.02, 0xff1f3f, { pos: [Math.sin(a) * 0.07, Math.cos(a) * 0.07, 0.048], rot: [0, 0, -a - 0.5], glow: 0.2 });
    p.box(0.05, 0.12, 0.02, 0xff1f3f, { pos: [Math.sin(a) * 0.07, Math.cos(a) * 0.07, -0.048], rot: [0, 0, -a - 0.5], glow: 0.2 });
  }
}

/** One water balloon (held), knot up. */
export function balloon(p) {
  p.sph(0.2, 12, 9, 0x2f9bff, { pos: [0, 0.2, 0], scale: [1, 1.12, 1], glow: 0.14 });
  p.sph(0.06, 6, 5, 0xd8f4ff, { pos: [0.08, 0.3, 0.12], glow: 0.9 });                          // wet highlight
  p.cone(0.05, 0.07, 6, 0x2f9bff, { pos: [0, 0.43, 0], rot: [PI, 0, 0] });                      // neck
  p.sph(0.035, 6, 5, 0x1f6fd8, { pos: [0, 0.47, 0] });                                           // knot
}

/** The weapon PICKUP for water balloons: a pail of them, blue/pink/yellow. */
export function balloonBucket(p) {
  p.cyl(0.3, 0.24, 0.36, 12, 0x2fe0b0, { pos: [0, 0.18, 0] });                                  // mint pail
  p.cyl(0.31, 0.31, 0.04, 12, 0x1a9a7a, { pos: [0, 0.36, 0] });
  p.add(new THREE.TorusGeometry(0.29, 0.022, 4, 16, PI), 0x3a3a48, { pos: [0, 0.36, 0], rot: [0, PI / 2, 0] }); // handle
  const B = [[0x2f9bff, 0.1, 0.46, 0.04], [0xff5fb0, -0.12, 0.44, -0.06], [0xffe23a, 0.0, 0.5, -0.14], [0x2f9bff, -0.05, 0.43, 0.14]];
  for (const [c, x, y, z] of B) {
    p.sph(0.15, 10, 7, c, { pos: [x, y, z], scale: [1, 1.1, 1], glow: 0.18 });
    p.sph(0.03, 5, 4, 0xffffff, { pos: [x + 0.05, y + 0.07, z + 0.1], glow: 0.9 });
  }
  p.box(0.2, 0.12, 0.01, 0xffffff, { pos: [0, 0.2, 0.28] });                                     // label
  p.box(0.14, 0.03, 0.012, 0x2f9bff, { pos: [0, 0.21, 0.29], glow: 0.4 });
}

// ── ammo (pickups only) ──────────────────────────────────────────────────────

// Round-4 critique: "the palace caches are identical macaron stacks and do
// not say which weapon they refill". So every cache now echoes its WEAPON:
// it sits in a crate painted in that weapon's colours, and a mini icon of
// the weapon rides on top (cheap: a handful of low-segment primitives).

/** A crate in the weapon's colours: body, a rim band, two corner posts. */
function crate(p, body, band, w = 0.54, d = 0.4, h = 0.16) {
  p.box(w, h, d, body, { pos: [0, h / 2, 0] });
  // the band wraps the SIDES at mid-height, so from the game camera's high
  // angle the crate's top still shows the weapon's body colour
  p.box(w + 0.02, 0.05, d + 0.02, band, { pos: [0, h * 0.55, 0], glow: 0.2 });
  p.box(w * 0.86, 0.02, d * 0.82, body, { pos: [0, h + 0.005, 0] });
  p.box(w * 0.5, 0.045, 0.012, 0xffffff, { pos: [0, h * 0.45, d / 2 + 0.006], glow: 0.35 });   // label strip
}

/** Jawbreakers: a royal-blue crate (the cannon's blue + pink bands), three big striped balls, a mini cannon. */
export function amJaw(p) {
  crate(p, 0x2f56ff, 0xff4fa0);
  const J = [[-0.14, 0.26, 0.02, 0xff2d4a, 0xfff2a8], [0.14, 0.26, -0.04, 0x5be27a, 0xffe23a], [0.0, 0.3, 0.12, 0xffffff, 0xff4fa0]];
  for (const [x, y, z, a, b] of J) {
    p.add(new THREE.SphereGeometry(0.14, 9, 7), a, { pos: [x, y, z], bands: { size: 0.05, offset: y % 0.05, colors: [a, b] }, glow: 0.14 });
  }
  // mini cannon riding on the back, muzzle up
  p.cyl(0.11, 0.12, 0.42, 8, 0x2f56ff, { pos: [0, 0.4, -0.13], rot: [-0.75, 0, 0] });
  p.cyl(0.125, 0.125, 0.05, 8, 0xff4fa0, { pos: [0, 0.36, -0.08], rot: [-0.75, 0, 0] });
  p.cyl(0.125, 0.125, 0.05, 8, 0xffd21f, { pos: [0, 0.47, -0.19], rot: [-0.75, 0, 0], glow: 0.3 });
  p.sph(0.09, 7, 5, 0xff2d4a, { pos: [0, 0.56, -0.28], glow: 0.2 });
}

/** Pop Rocks: a hot-pink crate, two big pouches standing in it, crystals spilling. */
export function amPop(p) {
  crate(p, 0xff3f9a, 0x3aa8ff, 0.5, 0.36);
  for (const s of [-1, 1]) {
    p.box(0.24, 0.32, 0.08, s < 0 ? 0xff3f9a : 0xc77dff, { pos: [s * 0.1, 0.34, 0], rot: [0, s * 0.3, s * 0.16], glow: 0.1 });
    p.box(0.25, 0.05, 0.06, 0xffc4e4, { pos: [s * 0.12, 0.51, 0], rot: [0, s * 0.3, s * 0.16] });
    p.box(0.1, 0.1, 0.02, 0xffe23a, { pos: [s * 0.1 + s * 0.02, 0.34, 0.05], rot: [0, s * 0.3, PI / 4], glow: 0.8 });
  }
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    p.tet(0.05, [0xff5fb0, 0x5fd8ff, 0xffe23a][i % 3], { pos: [Math.cos(a) * 0.27, 0.19, Math.sin(a) * 0.2], rot: [i, i * 1.3, 0], glow: 1.0 });
  }
}

/** Bubblegum: a magenta crate with a mint band, two bricks, and a big pink bubble on a mint nozzle. */
export function amGum(p) {
  crate(p, 0xff2f8f, 0x2fe0b0, 0.5, 0.38);
  const S = [[-0.1, 0.22, 0.04, 0.1], [0.08, 0.22, -0.06, -0.3]];
  for (let i = 0; i < S.length; i++) {
    const [x, y, z, r] = S[i];
    p.box(0.26, 0.1, 0.14, i ? 0xff85c8 : 0xff5fb0, { pos: [x, y, z], rot: [0, r, 0], glow: 0.06 });
    p.box(0.08, 0.105, 0.145, 0xffffff, { pos: [x, y, z], rot: [0, r, 0] });
  }
  p.cyl(0.05, 0.07, 0.16, 8, 0x2fe0b0, { pos: [0.02, 0.34, 0.0] });                             // mini nozzle
  p.sph(0.2, 10, 8, 0xff8cc8, { pos: [0.02, 0.58, 0.0], glow: 0.35 });                        // THE bubble
  p.sph(0.05, 6, 5, 0xffffff, { pos: [0.1, 0.66, 0.1], glow: 0.9 });
}

/** Marshmallows: a sky-blue crate heaped with mallows, a mini bell-mouth launcher on the back. */
export function amMarsh(p) {
  crate(p, 0x4fb4ff, 0xffd21f);
  const M = [[-0.13, 0.24, 0.05, 0xfffaf2], [0.13, 0.24, 0.02, 0xffe6f0], [0.0, 0.24, 0.14, 0xfffaf2], [0.02, 0.37, 0.06, 0xf0c890]];
  for (let i = 0; i < M.length; i++) {
    const [x, y, z, c] = M[i];
    p.sph(0.11, 8, 6, c, { pos: [x, y, z], rot: [0, i * 0.7, 0], scale: [1, 0.8, 1], glow: 0.14 });
  }
  p.cyl(0.08, 0.09, 0.26, 8, 0x4fb4ff, { pos: [0, 0.34, -0.14], rot: [-0.7, 0, 0] });         // mini launcher
  p.cyl(0.18, 0.08, 0.14, 9, 0x2f8cff, { pos: [0, 0.47, -0.25], rot: [-0.7, 0, 0] });
  p.sph(0.1, 7, 5, 0xffffff, { pos: [0, 0.53, -0.3], glow: 0.3 });
}

/** Three water balloons tied at the neck (already reads as its weapon — the harbor kept it). */
export function amBalloon(p) {
  const B = [[0x2f9bff, -0.13, 0.18, 0.02], [0x2fe0ff, 0.12, 0.17, -0.03], [0xff5fb0, 0.0, 0.2, 0.13]];
  for (const [c, x, y, z] of B) {
    p.sph(0.14, 10, 7, c, { pos: [x, y, z], scale: [1, 1.12, 1], glow: 0.16 });
    p.sph(0.03, 5, 4, 0xffffff, { pos: [x + 0.04, y + 0.07, z + 0.09], glow: 0.9 });
    p.cyl(0.018, 0.018, 0.2, 4, 0xffffff, { pos: [x * 0.5, y + 0.2, z * 0.5], rot: [z * 2, 0, -x * 2] });
  }
  p.sph(0.04, 6, 5, 0xffffff, { pos: [0, 0.4, 0.03] });
}

/** Gumballs: an orange crate (the slingshot's colour) of gumballs with a mini slingshot fork. */
export function amGumball(p) {
  crate(p, 0xffa22a, 0xff2d6f, 0.5, 0.38);
  const C = [0xff3355, 0x5be27a, 0x3aa8ff, 0xffe23a, 0xb35bff, 0xff8c1a];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * PI * 2;
    p.sph(0.08, 7, 5, C[i], { pos: [Math.cos(a) * 0.15, 0.22, Math.sin(a) * 0.1 + 0.04], glow: 0.14 });
  }
  p.sph(0.08, 7, 5, C[3], { pos: [0, 0.3, 0.04], glow: 0.14 });
  // mini slingshot on the back: warm-wood Y + pink rubber
  p.cyl(0.035, 0.04, 0.22, 6, 0xc07a2e, { pos: [0, 0.3, -0.14] });
  for (const s of [-1, 1]) {
    p.cyl(0.03, 0.035, 0.2, 6, 0xc07a2e, { pos: [s * 0.06, 0.48, -0.14], rot: [0, 0, -s * 0.45] });
    p.box(0.02, 0.14, 0.02, 0xff2d6f, { pos: [s * 0.08, 0.5, -0.11], rot: [0, 0, s * 0.6], glow: 0.35 });
  }
}

/** Salt: a cyan crate, the tall blue canister, and a mini shaker — refills the shaker AND the salt gun. */
export function amSalt(p) {
  crate(p, 0x5fd8ff, 0x1f7ad8, 0.48, 0.36);
  p.cyl(0.13, 0.13, 0.34, 10, 0x1f7ad8, { pos: [-0.08, 0.33, 0] });
  p.cyl(0.135, 0.135, 0.05, 10, 0xffffff, { pos: [-0.08, 0.51, 0], glow: 0.5 });
  p.box(0.18, 0.13, 0.02, 0xffffff, { pos: [-0.08, 0.34, 0.125] });
  p.sph(0.05, 7, 5, 0xffe23a, { pos: [-0.08, 0.32, 0.135], scale: [1, 1, 0.3] });
  p.cyl(0.07, 0.085, 0.16, 8, 0xfffdf6, { pos: [0.14, 0.24, 0.02] });                         // mini shaker
  p.cyl(0.06, 0.055, 0.06, 8, 0x2fc8f0, { pos: [0.14, 0.34, 0.02], glow: 0.3 });
  for (let i = 0; i < 3; i++) p.tet(0.04, 0xffffff, { pos: [Math.cos(i * 2.1) * 0.2, 0.19, Math.sin(i * 2.1) * 0.15], rot: [i, i, 0], glow: 0.8 });
}

// ── projectiles (what actually flies) ─────────────────────────────────────────
export function projJaw(p) {
  p.add(new THREE.SphereGeometry(0.22, 12, 9), 0xff2d4a, { bands: { size: 0.07, offset: 0.035, colors: [0xff2d4a, 0xfff2a8] }, glow: 0.2 });
}
export function projGum(p) {
  p.sph(0.3, 12, 9, 0xff8cc8, { glow: 0.3 });
  p.sph(0.08, 6, 5, 0xffffff, { pos: [0.12, 0.14, 0.14], glow: 0.9 });
}
export function projMarsh(p) {
  p.cyl(0.13, 0.13, 0.18, 10, 0xfffaf2, { glow: 0.2 });
  p.cyl(0.11, 0.11, 0.01, 10, 0xffe6c8, { pos: [0, 0.092, 0] });
}
export function projPouch(p) {
  p.box(0.3, 0.34, 0.1, 0xff3f9a, { glow: 0.15 });
  p.box(0.32, 0.05, 0.06, 0xffc4e4, { pos: [0, 0.19, 0] });
  p.box(0.09, 0.09, 0.02, 0xffe23a, { pos: [0, 0, 0.06], rot: [0, 0, PI / 4], glow: 0.7 });
}
export function projBalloon(p) {
  p.sph(0.22, 12, 9, 0x2f9bff, { scale: [1, 1.1, 1], glow: 0.2 });
  p.sph(0.06, 6, 5, 0xd8f4ff, { pos: [0.08, 0.1, 0.13], glow: 0.9 });
  p.sph(0.04, 6, 5, 0x1f6fd8, { pos: [0, 0.26, 0] });
}
/** The boomerang in flight lies FLAT (its V in the XZ plane) so it reads as a spinning disc of stripes. */
export function projRang(p) {
  boomerang(p);
}
