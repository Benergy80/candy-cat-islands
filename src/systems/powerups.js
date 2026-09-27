// ─────────────────────────────────────────────────────────────────────────────
// POWERUPS — INVINCIBILITY "SUGAR STARS" (wave 3 contract B; wave 5 contract Q
// gave them their own look: a rock-candy crystal cluster, see THE LOOK below).
//
// Two dozen Sugar Stars, twelve per island, hung where wandering pays off:
// on the licorice, on the Great Cupcake's summit balcony, over a river bridge
// at double-jump height, over the sea for the canoe, and one at the very top of
// the Big Fling's arc for anyone brave enough to be thrown through it. Catch one
// and the visitor is INVINCIBLE for 10 s: enemies flee (they read `active`),
// 25 % faster feet, two sugar hoops orbiting his waist, a candy-glass rim of
// rose / cream / mint round his silhouette, sugar sparkles spiralling up him,
// and a HUD pill that counts it down.
//
// READABILITY: a Sugar Star spins about its own axis (tipped back toward the
// lens), trails a candy-stripe corkscrew and wears a 3D SUGAR RING — a torus
// of three twisted pulled-sugar strands, rose / cream / mint — so it is never
// mistaken for the meadow's gem candies or a lollipop, and stands in a tall
// candy-cane beacon that marks its spot from across the island. No hue wheel
// anywhere (the rainbow ring was the Super Star cue) and no ink outline (a
// warm fresnel rim lifts the facets instead). The visitor keeps his own
// colours while invincible: the sheen lives on his silhouette, never his skin.
//
// PUBLIC API (ctx.systems.powerups):
//   active (bool) · timeLeft (s) · duration (10)
//   stars  [{ id, x, y, z, taken, island, kind, label }]   (y = star centre)
//   grant(secs?)      start / refresh the effect without a star (tests, cheats)
//   end()             stop the effect now (restores the visitor exactly)
//   collect(id|star)  collect a star as if touched
//   respawnAll()      every star back at once
//   nearest(x, z)     nearest untaken star
//   stage(id, dist?, bearing?)  stand the visitor beside a star, on its floor
//                     (views + tests); returns { x, y, z } or null
//   look / looks / setLook(name)  the pickup's design ('crystal' ships;
//                     'comet' and 'konpeito' are the runners-up; ?star=<name>)
// EVENTS: 'powerup:star' { on:true, id, x, z, duration } when the effect starts,
//         { on:false } when it ends · 'powerup:collect' { id, x, y, z } per star.
// WRITES (every frame while active): player.invulnerable = true,
//         player.speedBoost = 1.25 (set back to 1 at the end).
// READS (defensively): player.position/group/onVehicle/onFerry/groundInfo,
//         ctx.state.flying, particles.burst/sparkle/confetti/ripple, ui.toast,
//         ui.addMapMarker/removeMapMarker, audio.play, camera.shake/snap,
//         inventory.pickups (keeps stars off the pickups).
//
// DRAW CALLS: 3 + 2 shadow passes. Stars = one InstancedMesh (24 × one merged
//   look: crystals + ribbon, vertex-coloured, each piece glowing in its own
//   colour by its aGlow weight). Rings = one InstancedMesh of the sugar torus
//   (24 round the stars + the visitor's 2 hoops). Glow = one InstancedMesh
//   (premultiplied blend) of quads: a soft glow behind each star, a warm pool
//   of light under it (a "jump here" ring and a column of climbing chevrons
//   under the double-jump stars), a beacon beam per star, and — while the
//   effect runs — the visitor's orbiting sparkles and the sugar dashes at his feet.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, hash, clamp } from '../core/util.js';

const DURATION = 10;          // seconds of invincibility per star
const RESPAWN = 120;          // seconds before a taken star comes back
const COLLECT_R = 1.6;        // on foot: star centre ↔ body centre
const RIDE_R = 3.2;           // riding (canoe, flyer, catapult, ferry)
const MAGNET_R = 8.0;         // riding: a star this close homes in on you
const SPEED_BOOST = 1.25;
const BODY_Y = 0.9;           // feet → body centre
const GROUND_LIFT = 1.7;      // star centre above the floor (on-foot stars; the Sugar Star's tail hangs below)
const JUMP_LIFT = 4.3;        // needs the double jump: single-hop body centre peaks at 2.5 (+1.6 reach = 4.1, bob ±0.17)
const SEA_Y = 1.6;            // over-water stars (canoe height)
const SPARKLE_R = 70;         // stars further than this from the observer stay quiet
const DISCOVER_R = 26;        // seen from here → the star goes on the map
const BEAM_UP = 13;           // the beacon rises this far above the star
const BEAM_W = 1.3;           // beacon width (the hot core is a sixth of it)
const BEAM_NEAR = 120, BEAM_FAR = 185;   // beacons fade out between these lens distances
const ORBIT_N = 7;            // sugar sparkles circling the invincible visitor
const RING_R = 0.92;          // the sugar ring's radius, in the look's own units (clears the satellites' tips)
const RING_WAIST = -0.08;     // …centred this far up the crystal (its waist)
const RING_TILT = 0.35;       // ≈ 20° off level
const HOOP_R = 1.0;           // the visitor's two sugar hoops (world units)

// ── THE STARS ────────────────────────────────────────────────────────────────
// kind: ground (on the floor), deck (on a walkable roof/terrace), jump (double-
// jump height), sea (over water), sky (absolute y; riders and the flyer).
// Coordinates were measured (wave 3) against the colliders, a nothing-overhead
// ray test and a line-of-sight test from eight camera azimuths — every on-foot
// star is visible from the default iso camera. At runtime every ground/deck
// star is nudged again if some later prop has moved into its spot.
const SITES = [
  // ── Candyland ──────────────────────────────────────────────────────────────
  { id: 'candy_meadow',  island: 'candy', kind: 'ground', x: -103.4, z: -56.0, label: 'Lollipop Meadow' },
  { id: 'candy_village', island: 'candy', kind: 'ground', x: -138.1, z: 37.2,  label: 'Gumdrop Village' },
  { id: 'candy_forest',  island: 'candy', kind: 'ground', x: -194.8, z: -7.6,  label: 'Gummy Forest clearing' },
  { id: 'candy_lake',    island: 'candy', kind: 'ground', x: -180.3, z: 32.5,  label: 'Chocolate Lake path' },
  { id: 'candy_delta',   island: 'candy', kind: 'ground', x: -93.9,  z: 69.4,  label: 'Syrup Delta' },     // wave 5: 2 u off the candy canes its ring ran through
  { id: 'candy_cliffs',  island: 'candy', kind: 'ground', x: -217.3, z: 8.5,   label: 'top of Gumdrop Cliffs' },
  { id: 'candy_bridge',  island: 'candy', kind: 'jump',   x: -131.1, z: 16.3,  label: 'over the Syrup bridge (double jump)' },
  // hangs in the open just past the summit balcony's railing (tucked in against
  // the frosting it was hidden from most of the compass); reach out from the
  // rail. Wave 5: another 0.9 u out and a snugger sugar ring (ringK), so the
  // ring's far side clears the frosting instead of vanishing into it.
  { id: 'candy_cupcake', island: 'candy', kind: 'deck',   x: -84.57, z: -7.55, deck: [-85.1, -9.2], ringK: 0.8, label: 'Great Cupcake summit balcony, just past the railing' },
  // wave 5: over the top of the grand stair, square in front of the gate (the
  // runtime nudge used to park it IN the gate arch, its ring through the
  // jambs; inside the courtyard the gate hid it from the lens)
  { id: 'candy_palace',  island: 'candy', kind: 'deck',   x: -135.24, z: -36.1, deck: [-135.24, -36.1], label: 'Candy Palace grand stair, before the gate' },
  { id: 'candy_peak',    island: 'candy', kind: 'sky',    x: -175.0, z: -62.0, y: 36.0, label: 'above the Frosting Peak cherry' },
  { id: 'candy_fling',   island: 'candy', kind: 'sky',    x: -40.0,  z: 46.6,  y: 12.8, label: 'the Big Fling splashdown' },
  { id: 'candy_sea',     island: 'candy', kind: 'sea',    x: -86.0,  z: 97.0,  label: 'off the Syrup Delta' },
  // ── Cat Island ─────────────────────────────────────────────────────────────
  { id: 'cat_plaza',     island: 'cat', kind: 'ground', x: 70.0,  z: 19.7,  label: 'Welcome Plaza' },
  { id: 'cat_commons',   island: 'cat', kind: 'ground', x: 137.5, z: -46.9, label: 'Catnip Commons' },
  { id: 'cat_gym',       island: 'cat', kind: 'ground', x: 196.1, z: -15.3, label: 'Muscle Beach' },
  { id: 'cat_heights',   island: 'cat', kind: 'ground', x: 176.0, z: 40.3,  label: 'Whisker Heights' },
  { id: 'cat_harbor',    island: 'cat', kind: 'ground', x: 100.1, z: 52.7,  label: 'Fish Harbor' },
  { id: 'cat_beach',     island: 'cat', kind: 'ground', x: 228.6, z: -5.8,  label: 'Not-An-Exit Beach' },
  { id: 'cat_square',    island: 'cat', kind: 'jump',   x: 164.3, z: 21.0,  label: 'over the Heights road off Purrliament Square (double jump)' },
  // wave 5: off the front steps (it sat between the sign board and the keeper's
  // roof, half hidden) to just past the plinth terrace's edge on the lens side,
  // hung over the lower ledge: the ring clears the drum, the wall and the rail
  { id: 'cat_tower',     island: 'cat', kind: 'deck',   x: 216.55, z: 26.58, deck: [216.05, 27.45], label: 'Watchtower terrace, just past its edge' },
  { id: 'cat_yarn',      island: 'cat', kind: 'sky',    x: 188.0, z: -64.0, y: 30.0, label: 'above the Yarn Ball' },
  { id: 'cat_field',     island: 'cat', kind: 'sky',    x: 210.0, z: 12.0,  y: 15.0, label: 'over Wing Nut Field' },
  { id: 'cat_cove',      island: 'cat', kind: 'sea',    x: 250.0, z: 46.0,  label: 'off Smuggler\'s Cove' },
  { id: 'cat_fling',     island: 'cat', kind: 'sky',    x: 47.0,  z: 60.9,  y: 72.4, label: 'top of the Big Fling arc' },
];

// ── THE LOOK (wave 5, contract Q "stars-look") ───────────────────────────────
// Ben: "The stars look too much like Mario stars, make them look more unique
// to our game." The gold five-point star with eyes is gone. Three designs of
// this world were built and rendered side by side; each is ONE merged,
// vertex-coloured, flat-shaded mesh, so the pickups stay one InstancedMesh:
//   crystal  — the SUGAR STAR: a rock-candy crystal cluster (a tall pink shard
//              ringed by four candy-coloured satellites) on a glowing sugar-lump
//              heart, out of which a red-and-white candy-stripe ribbon
//              corkscrews away beneath as its tail (sparkles drip off its tip).
//   comet    — a peppermint bonbon in a twisted wrapper, chasing its own
//              rainbow tail round and round its spot.
//   konpeito — konpeitō (the Japanese "sugar star" sweet): a knobbly sugar ball
//              of rainbow nubs inside a tilted candy-striped sugar ring.
// Every vertex carries a glow weight (aGlow): how strongly that piece lights up
// after dark, in its OWN colour. The runners-up keep a navy inverted-hull
// outline; the Sugar Star dropped its (it read as a 2D sticker on the world).
const TAU = Math.PI * 2;
const INK = new THREE.Color(0x2b2442);
const C = (hex) => new THREE.Color(hex);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _gA = new THREE.Vector3(), _gB = new THREE.Vector3(), _gN = new THREE.Vector3(), _gC = new THREE.Vector3();

function meshBuilder() {
  const pos = [], col = [], glow = [];
  const put = (v, c, g) => { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); glow.push(g); };
  return {
    /** One triangle, turned to face away from `inside` (toward it if `inward`). */
    tri(a, b, c, color, g, inside = null, inward = false) {
      if (inside) {
        _gA.subVectors(b, a); _gB.subVectors(c, a); _gN.crossVectors(_gA, _gB);
        _gC.set((a.x + b.x + c.x) / 3 - inside.x, (a.y + b.y + c.y) / 3 - inside.y, (a.z + b.z + c.z) / 3 - inside.z);
        if ((_gN.dot(_gC) >= 0) === inward) { const t = b; b = c; c = t; }
      }
      put(a, color, g); put(b, color, g); put(c, color, g);
    },
    /** Both windings: an open sheet (ribbon, tail, wrapper) seen from either side. */
    tri2(a, b, c, color, g) { put(a, color, g); put(b, color, g); put(c, color, g); put(a, color, g); put(c, color, g); put(b, color, g); },
    geometry() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      return geo;
    },
  };
}

/** A faceted crystal: pointed foot, n-sided prism, pointed crown (+ ink hull). */
function gem(mb, o) {
  const D = o.dir.clone().normalize();
  const ref = Math.abs(D.y) < 0.92 ? V(0, 1, 0) : V(1, 0, 0);
  const U = new THREE.Vector3().crossVectors(D, ref).normalize();
  const W = new THREE.Vector3().crossVectors(D, U).normalize();
  const n = o.n || 6;
  const shell = (e, ink) => {
    const rr = o.r + e;
    const at = (h, i) => {
      const a = (i / n) * TAU + (o.roll || 0);
      return o.base.clone().addScaledVector(D, h).addScaledVector(U, Math.cos(a) * rr).addScaledVector(W, Math.sin(a) * rr);
    };
    const foot = o.base.clone().addScaledVector(D, -e * 1.4);
    const crown = o.base.clone().addScaledVector(D, o.len + e * 1.6);
    const inside = o.base.clone().addScaledVector(D, o.len * 0.5);
    const r0 = [], r1 = [];
    for (let i = 0; i < n; i++) { r0.push(at(o.baseH, i)); r1.push(at(o.len - o.tipH, i)); }
    const g = ink ? 0 : o.g;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const side = ink || o.cols[i % o.cols.length];
      mb.tri(foot, r0[i], r0[j], ink || o.foot || side, g, inside, !!ink);
      mb.tri(r0[i], r0[j], r1[j], side, g, inside, !!ink);
      mb.tri(r0[i], r1[j], r1[i], side, g, inside, !!ink);
      mb.tri(r1[i], r1[j], crown, ink || o.tips[i % o.tips.length], g * (o.tipGlow ?? 1), inside, !!ink);
    }
  };
  shell(0, null);
  if (o.outline) shell(o.outline, INK);
}

/** A ribbon through `n + 1` samples of f(u) → { p, w, up }, coloured per segment. */
function ribbon(mb, n, f, colorAt, g) {
  let prevA = null, prevB = null;
  for (let i = 0; i <= n; i++) {
    const s = f(i / n);
    const a = s.p.clone().addScaledVector(s.up, s.w * 0.5), b = s.p.clone().addScaledVector(s.up, -s.w * 0.5);
    if (prevA) {
      const c = colorAt(i - 1, (i - 0.5) / n);
      mb.tri2(prevA, prevB, b, c, g);
      mb.tri2(prevA, b, a, c, g);
    }
    prevA = a; prevB = b;
  }
}

/** Helix sample: width runs across the direction of travel, roughly vertical. */
function helixAt(u, o) {
  const th = o.th0 + u * o.turns * TAU * o.dir;
  const rad = (k) => (o.rFn ? o.rFn(k) : o.r0 + (o.r1 - o.r0) * Math.pow(k, o.rPow || 1));
  const r = rad(u);
  const y = o.y0 + (o.y1 - o.y0) * u;
  const p = V(Math.cos(th) * r, y, Math.sin(th) * r);
  const du = 1e-3, th2 = th + du * o.turns * TAU * o.dir, r2 = rad(Math.min(1, u + du));
  const q = V(Math.cos(th2) * r2, y + (o.y1 - o.y0) * du, Math.sin(th2) * r2);
  const T = q.sub(p).normalize();
  const R = V(Math.cos(th), 0, Math.sin(th));
  const up = new THREE.Vector3().crossVectors(T, R).normalize();
  if (up.y < 0) up.negate();
  return { p, w: o.w0 + (o.w1 - o.w0) * u, up };
}

// (A) THE SUGAR STAR — rock-candy crystal cluster + candy-stripe corkscrew tail
function crystalGeometry() {
  const mb = meshBuilder();
  // the heart: a glowing sugar lump the crystals grow out of
  const heart = new THREE.IcosahedronGeometry(0.24, 0).attributes.position;
  const cHeart = C(0xfff2c4), cHeart2 = C(0xffe08a);
  const hc = V(0, -0.3, 0);
  for (let i = 0; i < heart.count; i += 3) {
    const a = V(heart.getX(i), heart.getY(i), heart.getZ(i)).add(hc);
    const b = V(heart.getX(i + 1), heart.getY(i + 1), heart.getZ(i + 1)).add(hc);
    const c = V(heart.getX(i + 2), heart.getY(i + 2), heart.getZ(i + 2)).add(hc);
    mb.tri(a, b, c, (i / 3) % 2 ? cHeart : cHeart2, 1.25, hc);
  }
  // the big shard: rock-candy pink, alternate facets frosted lighter
  gem(mb, {
    base: V(0, -0.5, 0), dir: V(0.04, 1, -0.03), len: 1.28, r: 0.26, n: 6, baseH: 0.2, tipH: 0.38,
    cols: [C(0xff3d8f), C(0xffb3d5)], tips: [C(0xffe6f2), C(0xff7ab3)], foot: C(0xd23a82), g: 0.8, roll: 0.3,
  });
  // four satellites, splayed like a geode, one candy colour each
  const SAT = [
    { a: 0.35, tilt: 0.92, len: 0.76, r: 0.17, c: [0x2fc4ff, 0x9fe6ff], t: 0xd8f6ff },     // blue raspberry
    { a: 1.95, tilt: 1.02, len: 0.64, r: 0.16, c: [0xffcf2a, 0xffe98a], t: 0xfff6c8 },     // lemon
    { a: 3.45, tilt: 0.88, len: 0.72, r: 0.165, c: [0x39dd84, 0x9af2c0], t: 0xd8ffe8 },     // mint
    { a: 4.85, tilt: 0.98, len: 0.62, r: 0.155, c: [0x9a66ff, 0xcdb3ff], t: 0xeee4ff },     // grape
  ];
  for (const s of SAT) {
    const dir = V(Math.cos(s.a) * Math.sin(s.tilt), Math.cos(s.tilt), Math.sin(s.a) * Math.sin(s.tilt));
    gem(mb, {
      base: V(0, -0.34, 0).addScaledVector(dir, 0.1), dir, len: s.len, r: s.r, n: 6, baseH: 0.08, tipH: 0.2,
      cols: [C(s.c[0]), C(s.c[1])], tips: [C(s.t)], g: 0.8, roll: s.a,
    });
  }
  // the candy-stripe ribbon: out of the sugar-lump heart, a flare under the satellites, then twice
  // round and away into a tapering corkscrew tail (the crown stays clean)
  const red = C(0xff2d55), white = C(0xfff7f2);
  const H = {
    th0: 0.6, turns: 2.1, dir: 1, y0: -0.34, y1: -1.02, w0: 0.2, w1: 0.08,
    rFn: (u) => 0.16 * (1 - u) + 0.05 * u + 0.62 * Math.sin(Math.PI * Math.min(1, u * 1.9) * 0.5) * Math.pow(1 - u, 1.2),
  };
  ribbon(mb, 60, (u) => helixAt(u, H), (i) => ((i / 4 | 0) % 2 ? white : red), 0.5);
  const tipTh = H.th0 + H.turns * TAU * H.dir, tipR = H.rFn(1);
  return { geo: mb.geometry(), tip: V(Math.cos(tipTh) * tipR, H.y1, Math.sin(tipTh) * tipR) };
}

// (B) THE WRAPPED-CANDY COMET — a peppermint bonbon chasing its rainbow tail
function cometGeometry() {
  const mb = meshBuilder();
  const R0 = 0.6;                      // orbit radius of the candy's centre
  const HX = V(0, 0, R0);              // the candy (it travels toward +x)
  const rx = 0.25, rr = 0.23, LAT = 7, LON = 14;
  const red = C(0xff2d55), white = C(0xfff7f2);
  const ell = (la, lo, e) => V(HX.x + Math.sin(la) * (rx + e), HX.y + Math.cos(la) * Math.cos(lo) * (rr + e), HX.z + Math.cos(la) * Math.sin(lo) * (rr + e));
  for (const [e, ink] of [[0, null], [0.035, INK]]) {
    for (let i = 0; i < LAT; i++) {
      const la0 = -Math.PI / 2 + (i / LAT) * Math.PI, la1 = -Math.PI / 2 + ((i + 1) / LAT) * Math.PI;
      for (let j = 0; j < LON; j++) {
        const lo0 = (j / LON) * TAU, lo1 = ((j + 1) / LON) * TAU;
        const sw = ((j + i * 0.9) / LON) * 6;          // peppermint swirl, six stripes
        const c = ink || ((Math.floor(sw) % 2) ? white : red);
        const a = ell(la0, lo0, e), b = ell(la1, lo0, e), cc = ell(la1, lo1, e), d = ell(la0, lo1, e);
        mb.tri(a, b, cc, c, ink ? 0 : 0.7, HX, !!ink);
        mb.tri(a, cc, d, c, ink ? 0 : 0.7, HX, !!ink);
      }
    }
  }
  // twisted wrapper ends: a pinch, then a pleated cellophane fan
  const wrapA = C(0xfff0f7), wrapB = C(0xffc9e2);
  const N = 12;
  for (const sd of [1, -1]) {
    const ring = (x, rad, pleat) => {
      const out = [];
      for (let k = 0; k < N; k++) {
        const a = (k / N) * TAU, rp = rad * (pleat && k % 2 ? 0.66 : 1);
        out.push(V(HX.x + sd * x, HX.y + Math.cos(a) * rp, HX.z + Math.sin(a) * rp));
      }
      return out;
    };
    const r0 = ring(0.2, 0.12, false), r1 = ring(0.31, 0.05, false), r2 = ring(0.5, 0.25, true);
    for (let k = 0; k < N; k++) {
      const m = (k + 1) % N;
      mb.tri2(r0[k], r1[k], r1[m], wrapB, 0.35); mb.tri2(r0[k], r1[m], r0[m], wrapB, 0.35);
      const c = k % 2 ? wrapA : wrapB;
      mb.tri2(r1[k], r2[k], r2[m], c, 0.5); mb.tri2(r1[k], r2[m], r1[m], c, 0.5);
    }
  }
  // the tail: from the back twist, round behind the candy, rainbow banded
  const RB = [0xff4f7a, 0xff9a2e, 0xffe54a, 0x5be27a, 0x3aa8ff, 0xb35bff].map(C);
  const p0 = V(HX.x - 0.5, 0, HX.z), ph0 = Math.atan2(p0.x, p0.z), rad0 = Math.hypot(p0.x, p0.z);
  const SPAN = 3.4;
  ribbon(mb, 40, (u) => {
    const ph = ph0 - u * SPAN, rad = rad0 + (R0 - 0.02 - rad0) * Math.min(1, u * 2.5);
    return { p: V(Math.sin(ph) * rad, 0.06 * Math.sin(u * Math.PI), Math.cos(ph) * rad), w: 0.4 * Math.pow(1 - u, 0.85) + 0.03, up: V(0, 1, 0) };
  }, (i, u) => RB[Math.min(5, (u * 6) | 0)], 1.0);
  return { geo: mb.geometry(), tip: HX.clone() };
}

// (C) KONPEITŌ — a knobbly sugar star inside a candy-striped ring
function konpeitoGeometry() {
  const mb = meshBuilder();
  const body = new THREE.IcosahedronGeometry(0.34, 1).attributes.position;
  const o0 = V(0, 0, 0);
  const cB = C(0xffa8d0), cB2 = C(0xffcfe4);
  for (const [k, ink] of [[1, null], [(0.34 + 0.035) / 0.34, INK]]) {
    for (let i = 0; i < body.count; i += 3) {
      const a = V(body.getX(i), body.getY(i), body.getZ(i)).multiplyScalar(k);
      const b = V(body.getX(i + 1), body.getY(i + 1), body.getZ(i + 1)).multiplyScalar(k);
      const c = V(body.getX(i + 2), body.getY(i + 2), body.getZ(i + 2)).multiplyScalar(k);
      mb.tri(a, b, c, ink || ((i / 3) % 3 ? cB : cB2), ink ? 0 : 0.7, o0, !!ink);
    }
  }
  // twelve nubs at the icosahedron's corners, a rainbow of sugar
  const PH = (1 + Math.sqrt(5)) / 2;
  const dirs = [[-1, PH, 0], [1, PH, 0], [-1, -PH, 0], [1, -PH, 0], [0, -1, PH], [0, 1, PH], [0, -1, -PH], [0, 1, -PH], [PH, 0, -1], [PH, 0, 1], [-PH, 0, -1], [-PH, 0, 1]];
  const NUB = [[0xff5f93, 0xff9dbd], [0xff9a3c, 0xffc07e], [0xffd83a, 0xffea8a], [0x4fe08f, 0x9af0bf], [0x44b8ff, 0x93d6ff], [0xa77cff, 0xcbb2ff]];
  dirs.forEach((d, i) => {
    const dir = V(d[0], d[1], d[2]).normalize();
    const nc = NUB[i % NUB.length];
    gem(mb, { base: dir.clone().multiplyScalar(0.2), dir, len: 0.44, r: 0.13, n: 5, baseH: 0.08, tipH: 0.14,
      cols: [C(nc[0]), C(nc[1])], tips: [C(0xffffff)], g: 0.8, tipGlow: 1.3, roll: i, outline: 0.03 });
  });
  // the sugar ring, tilted like a little planet's
  const SEG = 36, RI = 0.66, RO = 0.84, TH = 0.07;
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.46, 0, 0.28));
  const white = C(0xfff7f2), pink = C(0xff5f9e);
  const pt = (a, r, y) => V(Math.cos(a) * r, y, Math.sin(a) * r).applyMatrix4(m);
  for (let k = 0; k < SEG; k++) {
    const a0 = (k / SEG) * TAU, a1 = ((k + 1) / SEG) * TAU;
    const c = ((k / 3) | 0) % 2 ? white : pink;
    const mid = pt((a0 + a1) / 2, (RI + RO) / 2, 0);
    const q = [[RO, TH], [RO, -TH], [RI, -TH], [RI, TH]];
    for (let f = 0; f < 4; f++) {
      const [ra, ya] = q[f], [rb, yb] = q[(f + 1) % 4];
      const A = pt(a0, ra, ya), B = pt(a0, rb, yb), Cc = pt(a1, rb, yb), Dd = pt(a1, ra, ya);
      mb.tri(A, B, Cc, c, 0.45, mid); mb.tri(A, Cc, Dd, c, 0.45, mid);
    }
  }
  return { geo: mb.geometry(), tip: null };
}

// THE SUGAR RING — the Sugar Star's own ring, a real 3D torus (it replaced a
// flat, camera-facing hue-wheel that read as the Super Star rainbow). Three
// pulled-sugar strands — rose, cream, mint, the crystal's own hues — twisted
// round each other like a candy cane: the twist's lumps are in the mesh, the
// crisp strand edges and grooves are drawn per pixel from aRope (x = turns
// round the tube, y = turns round the ring), so no tessellation can blur them.
// Tilted about 20° and orbiting slowly round the crystal's waist, depth-tested
// so its far side passes behind the crystal. Two larger ones orbit the visitor
// while he is invincible. Unit ring radius; the tube radius is ROPE_R.
const ROPE_TWISTS = 9;        // whole twists round the ring (integer: the seam must meet)
const ROPE_R = 0.085;         // tube radius / ring radius
function ropeGeometry(U = 64, Vn = 12) {
  const n = (U + 1) * (Vn + 1);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), rope = new Float32Array(n * 2);
  const P = (u, v, out) => {
    const ph = u * TAU, th = v * TAU;
    const rr = ROPE_R * (1 + 0.16 * Math.cos(3 * (v - ROPE_TWISTS * u) * TAU));    // three strands' lumps
    const rad = 1 + rr * Math.cos(th);
    return out.set(Math.cos(ph) * rad, rr * Math.sin(th), Math.sin(ph) * rad);
  };
  const p = new THREE.Vector3(), pu = new THREE.Vector3(), pv = new THREE.Vector3(), nn = new THREE.Vector3();
  const e = 1e-4;
  for (let i = 0; i <= U; i++) {
    for (let j = 0; j <= Vn; j++) {
      const u = i / U, v = j / Vn, k = i * (Vn + 1) + j;
      P(u, v, p);
      P(u + e, v, pu).sub(p); P(u, v + e, pv).sub(p);
      nn.crossVectors(pv, pu).normalize();                  // outward (checked at u = v = 0: +x)
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      nor[k * 3] = nn.x; nor[k * 3 + 1] = nn.y; nor[k * 3 + 2] = nn.z;
      rope[k * 2] = v; rope[k * 2 + 1] = u;
    }
  }
  const idx = [];
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < Vn; j++) {
      const a = i * (Vn + 1) + j, b = (i + 1) * (Vn + 1) + j, c = b + 1, d = a + 1;
      idx.push(a, d, b, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aRope', new THREE.BufferAttribute(rope, 2));
  geo.computeBoundingSphere();
  return geo;
}
// The ring material's shader patch: strand colour into the albedo, a satin
// sheen down each strand, a glassy fresnel edge and a night glow in its own hue.
const ROPE_VS_HEAD = 'attribute vec2 aRope;\nvarying vec2 vRope;\n';
const ROPE_FS_HEAD = `uniform vec3 uRopeA; uniform vec3 uRopeB; uniform vec3 uRopeC;
uniform float uRopeGlow; uniform float uRopeRim;
varying vec2 vRope;
`;
const ROPE_COLOR = `#include <color_fragment>
  float ropeS = fract(vRope.x - ${ROPE_TWISTS}.0 * vRope.y) * 3.0 + 0.5;
  float ropeK = mod(floor(ropeS), 3.0);
  float ropeF = fract(ropeS);
  vec3 ropeCol = ropeK < 0.5 ? uRopeA : (ropeK < 1.5 ? uRopeB : uRopeC);
  float ropeGroove = smoothstep(0.0, 0.16, ropeF) * smoothstep(1.0, 0.84, ropeF);
  ropeCol *= mix(0.58, 1.0, ropeGroove);
  diffuseColor.rgb *= ropeCol;`;
const ROPE_EMIT = `#include <emissivemap_fragment>
  {
    float ropeFr = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
    float ropeSheen = exp(-(ropeF - 0.5) * (ropeF - 0.5) * 30.0);
    totalEmissiveRadiance = ropeCol * uRopeGlow + ropeCol * ropeSheen * 0.16
      + vec3(1.0, 0.95, 0.9) * smoothstep(0.45, 1.0, ropeFr) * uRopeRim;
  }`;

// Per-look tuning: spin (rad/s), how far the axis tips back toward the lens,
// wobble, halo size / rays / swirl, glow colours, sparkle colours + rate.
const LOOKS = {
  crystal: {
    build: crystalGeometry, scale: 1.35, spin: 1.15, face: 0.35, wobble: 0.1, halo: 3.0, rays: 0, swirl: 1, ring: true,
    haloCol: [1.0, 0.72, 0.86], poolCol: [1.0, 0.5, 0.76], ringCol: [1.0, 0.45, 0.72],
    spark: [0xff4f9e, 0xfff0d6, 0x4fe0a6], sparkRate: 7, burst: [0xfff0d6, 0xff8cc4, 0xff4f9e, 0x4fe0a6],
    label: 'Sugar Star',
  },
  comet: {
    build: cometGeometry, scale: 1.1, spin: 2.5, face: -0.35, wobble: 0.06, halo: 3.5, rays: 0, swirl: 0, ring: false,
    haloCol: [1.0, 0.82, 0.55], poolCol: [1.0, 0.6, 0.4], ringCol: [1.0, 0.84, 0.3],
    spark: [0xff4f7a, 0xff9a2e, 0xffe54a, 0x5be27a, 0x3aa8ff, 0xb35bff], sparkRate: 8, burst: [0xffffff, 0xffe27a, 0xff4f7a, 0x3aa8ff],
    label: 'Candy Comet',
  },
  konpeito: {
    build: konpeitoGeometry, scale: 1.1, spin: 0.9, face: 0.2, wobble: 0.1, halo: 3.3, rays: 12, swirl: 0, ring: false,
    haloCol: [1.0, 0.72, 0.88], poolCol: [1.0, 0.55, 0.8], ringCol: [1.0, 0.7, 0.85],
    spark: [0xff9dbd, 0xffea8a, 0x9af0bf, 0x93d6ff, 0xffffff], sparkRate: 5, burst: [0xffffff, 0xff9dbd, 0xffea8a, 0x93d6ff],
    label: 'Konpeito',
  },
};
const LOOK_DEFAULT = 'crystal';

// ── glow quads: ONE premultiplied instanced mesh, several instance kinds ─────
// aKind 0 = soft glow behind a star (core + a candy swirl behind the heart; no
// ring — the ring is the 3D sugar torus now) · 1 = warm pool of light on the
// floor under it · 3 = the "jump here" ring · 4 = the star's beacon (a vertical
// beam that turns round its own axis to face the lens, a rose / cream / mint
// candy-cane twist climbing it; instance colour r = where the star sits along
// it, g = its strength, b = 1 under a sky star) · 5 = a sugar sparkle orbiting
// the invincible visitor · 6 = the dashed sugar ring at his feet (instance
// colour r = strength) · 7 = the chevron column under a double-jump star:
// rose and mint "^" climbing from the jump ring to the crystal (g = strength).
// Size comes from the instance scale (0 = hidden). Everything fades out in
// fog instead of adding the fog colour, like the particle system's pool.
const HALO_VS = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  attribute float aKind;
  varying vec2 vUv;
  varying float vPh;
  varying float vKind;
  varying vec3 vCol;
  void main() {
    float sx = length(instanceMatrix[0].xyz);
    float sy = length(instanceMatrix[1].xyz);
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #else
      vCol = vec3(1.0, 0.78, 0.32);
    #endif
    vec3 wc = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vPh = fract(sin(dot(wc.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
    vKind = aKind;
    vUv = position.xy;
    vec4 mvPosition;
    if ((aKind > 3.5 && aKind < 4.5) || aKind > 6.5) {
      vec2 tc = cameraPosition.xz - wc.xz;
      tc = tc / max(length(tc), 0.0001);
      vec3 side = vec3(tc.y, 0.0, -tc.x);
      mvPosition = modelViewMatrix * vec4(wc + side * (position.x * sx) + vec3(0.0, position.y * sy, 0.0), 1.0);
    } else if ((aKind > 0.5 && aKind < 1.5) || (aKind > 2.5 && aKind < 3.5) || (aKind > 5.5 && aKind < 6.5)) {
      mvPosition = modelViewMatrix * vec4(wc + vec3(position.x * sx, 0.0, -position.y * sx), 1.0);
    } else {
      mvPosition = modelViewMatrix * vec4(wc, 1.0);
      mvPosition.xy += position.xy * sx;
      if (aKind < 0.5) mvPosition.z -= min(0.14 * sx, 0.55);  // behind the cluster, not into the floor
    }
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const HALO_FS = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform float uIntensity;
  uniform float uPool;
  uniform float uSolid;
  uniform float uTime;
  uniform float uRays;
  uniform float uSwirl;
  varying vec2 vUv;
  varying float vPh;
  varying float vKind;
  varying vec3 vCol;
  // the Sugar Star's three hues, crisp bands (no hue wheel anywhere)
  vec3 sugarBand(float h) {
    float k = mod(floor(h * 3.0), 3.0);
    return k < 0.5 ? vec3(1.0, 0.31, 0.62) : (k < 1.5 ? vec3(1.0, 0.95, 0.86) : vec3(0.31, 0.88, 0.65));
  }
  void main() {
    vec3 col = vec3(0.0);
    float alpha = 0.0;      // premultiplied: 0 = pure additive glow
    if (vKind > 3.5 && vKind < 4.5) {
      // BEACON: a cream core wound with rose / cream / mint candy-cane bands
      // climbing it, glints riding up
      float x = vUv.x * 2.0;
      float y = vUv.y + 0.5;
      float ys = vCol.r;
      float soft = exp(-x * x * 4.5);
      float mid = exp(-x * x * 13.0);
      float core = exp(-x * x * 42.0);
      float up = clamp((y - ys) / max(1.0 - ys, 0.01), 0.0, 1.0);
      float below = clamp(y / max(ys, 0.01), 0.0, 1.0);
      // under a star on the floor the beam stands on it; under a sky star
      // (instance colour b = 1) it thins away to nothing
      float prof = y > ys ? pow(1.0 - up, 1.6) : (vCol.b > 0.5 ? below * below : mix(0.5, 1.0, below));
      prof *= smoothstep(0.0, 0.03, y);
      float g = fract(y * 8.0 - uTime * 0.65 + vPh);
      float glint = smoothstep(0.0, 0.05, g) * (1.0 - smoothstep(0.05, 0.24, g));
      float bh = y * 7.0 + x * 0.55 - uTime * 0.22 + vPh * 0.159;
      vec3 band = sugarBand(bh);
      float edge = abs(fract(bh * 3.0) - 0.5) * 2.0;             // 1 at a band's seam
      band *= mix(1.0, 0.8, smoothstep(0.75, 1.0, edge));
      vec3 c = mix(band, vec3(1.0, 0.97, 0.9), core * 0.8);
      float a = (soft * 0.42 + core * 0.7 + glint * soft * 0.6) * prof * vCol.g;
      // by day the core and the candy-cane bands lay down paint; the soft
      // flanks stay light, so a beam near the lens is never a haze over him
      float cover = clamp((core * 0.55 + mid * 0.5 + glint * soft * 0.4) * prof * vCol.g * uSolid * 0.8, 0.0, 0.74);
      col = c * (a * uIntensity * 0.95 + cover);
      alpha = cover;
    } else if (vKind > 6.5) {
      // "JUMP UP HERE": rose and mint chevrons climbing from the jump ring to
      // the crystal, so the two read as one thing
      float ax = abs(vUv.x) * 2.0;
      float k = vUv.y + 0.5;
      float ph = k * 4.0 + ax * 0.85 - uTime * 1.3 + vPh;
      float f = fract(ph);
      float chev = smoothstep(0.0, 0.07, f) * (1.0 - smoothstep(0.24, 0.32, f));
      float m = (1.0 - smoothstep(0.62, 0.95, ax)) * smoothstep(0.0, 0.14, k) * (1.0 - smoothstep(0.82, 1.0, k));
      float a = chev * m * vCol.g;
      vec3 c = mod(floor(ph), 2.0) < 0.5 ? vec3(1.0, 0.31, 0.62) : vec3(0.31, 0.88, 0.65);
      c = mix(c, vec3(1.0, 0.96, 0.9), (1.0 - smoothstep(0.0, 0.3, ax)) * 0.35);
      float cover = a * clamp(uSolid * 1.2, 0.0, 0.85);
      col = c * (a * (0.3 + uIntensity * 0.9) + cover);
      alpha = cover;
    } else if (vKind > 4.5 && vKind < 5.5) {
      // a four-point sugar sparkle, cream in the middle
      vec2 q = abs(vUv * 2.0);
      float v = sqrt(q.x) + sqrt(q.y);
      float shape = 1.0 - smoothstep(0.7, 0.9, v);
      if (shape <= 0.0) discard;
      float hot = exp(-dot(q, q) * 16.0);
      vec3 c = mix(vCol, vec3(1.0, 0.97, 0.92), hot * 0.85);
      float cover = shape * clamp(uSolid * 1.35, 0.0, 1.0);
      col = c * (shape * (0.3 + uIntensity * 0.85) + cover);
      alpha = cover;
    } else {
      float d = length(vUv) * 2.0;
      if (d > 1.0) discard;
      float ang = atan(vUv.y, vUv.x);
      if (vKind > 5.5) {
        // the visitor's ring: nine sugar dashes (rose, cream, mint) chasing round his feet
        float ring = 1.0 - smoothstep(0.04, 0.085, abs(d - 0.8));
        float turn = ang / 6.28318 - uTime * 0.18;
        float f = fract(turn * 9.0);
        float dash = smoothstep(0.1, 0.2, f) * (1.0 - smoothstep(0.86, 0.96, f));
        vec3 sc = sugarBand(floor(turn * 9.0) / 3.0 + 0.01);
        float a = ring * dash * vCol.r;
        float cover = a * clamp(uSolid * 1.2, 0.0, 0.9);
        col = sc * (a * (0.25 + uIntensity * 0.9) + cover);
        alpha = cover;
      } else if (vKind > 2.5) {
        // "jump here": a target ring on the floor under a double-jump star,
        // painted solid by day (premultiplied) and glowing by night
        float ring = 1.0 - smoothstep(0.0, 0.12, abs(d - 0.76));
        float inner = exp(-d * d * 4.0) * 0.35;
        float pulse = 0.8 + 0.2 * sin(uTime * 4.0 + vPh);
        float cover = ring * clamp(uSolid * 1.1, 0.0, 0.8) * pulse;
        col = vCol * (ring + inner) * (0.25 + uPool) * pulse + vCol * cover * 0.9;
        alpha = cover;
      } else if (vKind > 0.5) {
        float pool = exp(-d * d * 3.2) * (1.0 - smoothstep(0.7, 1.0, d));
        float breathe = 0.82 + 0.18 * sin(uTime * 2.3 + vPh);
        col = vCol * pool * breathe * uPool;
      } else {
        // soft glow: a warm core (+ slow rays for the konpeito) + a candy
        // swirl turning behind the heart. The ring is the 3D sugar torus.
        float core = exp(-d * d * 9.0);
        float rays = uRays > 0.5 ? pow(max(0.0, cos(ang * uRays + uTime * 0.7 + vPh)), 10.0) * (1.0 - d) : 0.0;
        float tw = 0.85 + 0.15 * sin(uTime * 3.1 + vPh);
        float glow = (core * 0.85 + rays * 0.55) * (1.0 - smoothstep(0.55, 1.0, d)) * tw;
        float sp = cos(ang - d * 11.0 + uTime * 2.4 + vPh);
        float swIn = uSwirl * smoothstep(0.03, 0.1, d) * (1.0 - smoothstep(0.26, 0.46, d));
        float armR = smoothstep(0.35, 0.75, sp) * swIn, armW = smoothstep(0.35, 0.75, -sp) * swIn;
        vec3 swirl = vec3(1.0, 0.31, 0.62) * armR + vec3(1.0, 0.95, 0.88) * armW;
        float swCover = armR * clamp(uSolid * 0.3, 0.0, 0.2);
        col = vCol * glow * uIntensity + swirl * (0.06 + uIntensity * 0.5) + vec3(1.0, 0.31, 0.62) * swCover;
        alpha = swCover;
      }
    }
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      col *= 1.0 - fogF;
      alpha *= 1.0 - fogF;
    #endif
    gl_FragColor = vec4(col, alpha);
  }
`;

// The visitor's candy-glass sheen while invincible, patched into CLONES of his
// materials only: a fresnel rim lights his silhouette in bands of the Sugar
// Star's rose / cream / mint running up his body and cycling (linear-light
// values: this is added to the lit radiance). His own colours stay put.
const RIM_GLSL = `#include <emissivemap_fragment>
  {
    float pwFr = 1.0 - clamp(abs(dot(normal, normalize(-vViewPosition))), 0.0, 1.0);
    float pwRim = smoothstep(0.3, 0.9, pwFr);
    float pwH = fract(vViewPosition.y * 0.42 - uStarT * 0.6) * 3.0;
    vec3 pwA = vec3(1.0, 0.08, 0.34), pwB = vec3(1.0, 0.87, 0.68), pwC = vec3(0.08, 0.74, 0.38);
    vec3 pwRb = pwH < 1.0 ? mix(pwA, pwB, pwH) : (pwH < 2.0 ? mix(pwB, pwC, pwH - 1.0) : mix(pwC, pwA, pwH - 2.0));
    totalEmissiveRadiance += pwRb * pwRim * uStarRim;
  }`;

// The Sugar Star's own three hues (rose, cream, mint) for the visitor's
// orbiting sparkles and heel glitter, and the crystal's candy colours for the
// confetti when one is caught. No hue wheel: the rainbow was the Mario cue.
const SUGAR = [0xff4f9e, 0xfff0d6, 0x4fe0a6];
const CANDY = [0xff4f9e, 0x3fcfff, 0xffd43a, 0x4fe0a6, 0x9a66ff, 0xfff0d6];
// HUD pill pictograms, one per look (24×24, ink outline, candy fills). The
// pill shows the look in play; the map pin + toast use glyphs.js 'sugarstar'.
const HUD_ICON = {
  crystal: '<svg viewBox="0 0 24 24">'
    + '<path class="o" d="M2.6 12.2 L8.2 14.6 L8 19.2 L3.2 17 Z" fill="#3fcfff"/>'
    + '<path class="o" d="M21.4 11.4 L15.8 14.6 L16 19.2 L20.8 16.6 Z" fill="#ffd43a"/>'
    + '<path class="o" d="M12 1.4 L16.1 6.2 V15.2 L12 20.2 L7.9 15.2 V6.2 Z" fill="#ff4f9e"/>'
    + '<path d="M12 1.4 L7.9 6.2 V15.2 L12 20.2 Z" fill="#ff9dcb"/>'
    + '<path class="o" d="M12 1.4 L16.1 6.2 V15.2 L12 20.2 L7.9 15.2 V6.2 Z" fill="none"/>'
    + '<path class="f" d="M7.9 6.2 L12 8.4 L16.1 6.2 M12 8.4 V20.2"/>'
    + '<path class="rk" d="M2.4 14.8 A9.8 4 -12 0 0 21.6 10.8"/><path class="rw" d="M2.4 14.8 A9.8 4 -12 0 0 21.6 10.8"/>'
    + '<path class="rr" d="M2.4 14.8 A9.8 4 -12 0 0 21.6 10.8"/><path class="rm" d="M2.4 14.8 A9.8 4 -12 0 0 21.6 10.8"/></svg>',
  comet: '<svg viewBox="0 0 24 24">'
    + '<path class="o" d="M16 5.2 A8.6 8.6 0 1 0 20.4 15.4 L17.6 14.2 A5.6 5.6 0 1 1 14.6 8 Z" fill="#ffe54a"/>'
    + '<path class="o" d="M13.4 5.4 L10.6 3 L10.8 8.4 Z" fill="#fff0f7"/><path class="o" d="M20.4 9 L23 6.8 L22.6 12 Z" fill="#fff0f7"/>'
    + '<circle class="o" cx="16.6" cy="8" r="3.9" fill="#ff2d55"/>'
    + '<path d="M14.2 6.4 q2.4 -1.4 4.4 .6 M13.4 9.2 q3 1 5.8 -.8" stroke="#fff7f2" stroke-width="1.5" fill="none"/></svg>',
  konpeito: '<svg viewBox="0 0 24 24">'
    + '<path class="o" d="M12 3 l2 2.6 l3.2 -.6 l.4 3.2 l3 1.4 l-1.6 2.8 l1.6 2.8 l-3 1.4 l-.4 3.2 l-3.2 -.6 L12 21 l-2 -2.6 l-3.2 .6 l-.4 -3.2 l-3 -1.4 L5 12 l-1.6 -2.8 l3 -1.4 l.4 -3.2 l3.2 .6 Z" fill="#ffa8d0"/>'
    + '<ellipse class="rk" cx="12" cy="12.6" rx="10.6" ry="3.6" transform="rotate(-14 12 12.6)"/>'
    + '<ellipse class="rw" cx="12" cy="12.6" rx="10.6" ry="3.6" transform="rotate(-14 12 12.6)"/></svg>',
};

const CSS = `
#ui .cci-star-pill {
  left: 50%; bottom: 140px; z-index: 22; pointer-events: none; display: none;
  align-items: center; gap: 9px; padding: 6px 14px 6px 7px; border-radius: 999px;
  white-space: nowrap;
}
#ui .cci-star-pill .sp-ico { width: 32px; height: 32px; flex: none; filter: drop-shadow(0 2px 0 rgba(43,36,66,.55)); }
#ui .cci-star-pill .sp-ico svg { width: 100%; height: 100%; display: block; overflow: visible; }
#ui .cci-star-pill .sp-ico .o { stroke: #2b2442; stroke-width: 1.5; stroke-linejoin: round; }
#ui .cci-star-pill .sp-ico .f { fill: none; stroke: #2b2442; stroke-width: .9; opacity: .45; }
#ui .cci-star-pill .sp-ico .rk { fill: none; stroke: #2b2442; stroke-width: 4.6; stroke-linecap: round; }
#ui .cci-star-pill .sp-ico .rw { fill: none; stroke: #fff7f2; stroke-width: 2.4; stroke-linecap: round; }
#ui .cci-star-pill .sp-ico .rr { fill: none; stroke: #ff4f9e; stroke-width: 2.4; stroke-dasharray: 2 4; }
#ui .cci-star-pill .sp-ico .rm { fill: none; stroke: #4fe0a6; stroke-width: 2.4; stroke-dasharray: 2 4; stroke-dashoffset: 2; }
#ui .cci-star-pill .sp-txt { display: flex; flex-direction: column; gap: 4px; }
#ui .cci-star-pill .sp-lbl { font: 800 13.5px/1 var(--fdisp, sans-serif); letter-spacing: .09em; color: var(--ink, #2f2748); }
#ui .cci-star-pill .sp-bar { width: 104px; height: 8px; border-radius: 999px; background: rgba(43,36,66,.16);
  border: 2px solid var(--edge, #2b2442); overflow: hidden; box-sizing: content-box; }
#ui .cci-star-pill .sp-bar i { display: block; height: 100%; width: 100%;
  background-image: linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0) 60%),
    linear-gradient(135deg, #ff4f9e 0 16.66%, #fff0d6 16.66% 33.33%, #4fe0a6 33.33% 50%,
      #ff4f9e 50% 66.66%, #fff0d6 66.66% 83.33%, #4fe0a6 83.33% 100%);
  background-size: 100% 100%, 18px 18px; background-position: 0 0, 0 0;
  animation: cci-sugar-twist .9s linear infinite; }
@keyframes cci-sugar-twist { to { background-position: 0 0, 18px 0; } }
#ui .cci-star-pill .sp-t { font: 800 21px/1 var(--fdisp, sans-serif); color: var(--ink, #2f2748);
  min-width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
#ui .cci-star-pill.warn .sp-t { color: #e23a6e; }
@media (max-width: 760px), (max-height: 520px) {
  #ui .cci-star-pill { gap: 6px; padding: 4px 10px 4px 5px; }
  #ui .cci-star-pill .sp-ico { width: 24px; height: 24px; }
  #ui .cci-star-pill .sp-lbl { font-size: 11px; }
  #ui .cci-star-pill .sp-bar { width: 72px; height: 6px; }
  #ui .cci-star-pill .sp-t { font-size: 16px; min-width: 34px; }
}
`;

export function create(ctx) {
  const { scene, world } = ctx;
  const rnd = rng(hash('powerups'));
  const N = SITES.length;

  // ── meshes ──────────────────────────────────────────────────────────────
  const starMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.38, metalness: 0.0, flatShading: true,
    emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.4,
  });
  // each piece glows in its OWN colour, weighted by its aGlow (an ink hull 0,
  // the sugar-lump heart hottest). The Sugar Star wears no ink outline: a
  // warm fresnel rim on its facets' grazing edges lifts it off the ground
  // instead, so it sits in the world like the other lit props.
  const starRim = { value: 0.3 };
  starMat.onBeforeCompile = (sh) => {
    if (!sh.fragmentShader.includes('#include <emissivemap_fragment>') || !sh.vertexShader.includes('#include <color_vertex>')) return;
    sh.uniforms.uSugarRim = starRim;
    sh.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n'
      + sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n\tvGlow = aGlow;');
    sh.fragmentShader = 'varying float vGlow;\nuniform float uSugarRim;\n' + sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
\ttotalEmissiveRadiance *= vColor.rgb * vGlow;
\t{
\t\tfloat sgFr = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
\t\ttotalEmissiveRadiance += vec3(1.0, 0.93, 0.86) * smoothstep(0.55, 0.97, sgFr) * uSugarRim * step(0.01, vGlow);
\t}`,
    );
  };
  starMat.customProgramCacheKey = () => 'powerup-sugarstar';
  // all three looks are built (a few hundred triangles each) so views, tests
  // and the critic can swap them with setLook(); the game ships LOOK_DEFAULT
  const looks = {};
  for (const k of Object.keys(LOOKS)) looks[k] = LOOKS[k].build();
  let lookName = LOOK_DEFAULT;
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('star') : null;
    if (q && looks[q]) lookName = q;
  } catch { /* no location: default look */ }
  let look = LOOKS[lookName];
  const starGeo = looks[lookName].geo;
  const starMesh = new THREE.InstancedMesh(starGeo, starMat, N);
  starMesh.name = 'powerups_stars';
  starMesh.castShadow = !ctx.state?.mobile; starMesh.receiveShadow = false;   // contract I: props cast no shadow on phones
  starMesh.frustumCulled = false;             // spread over both islands + the sky
  starMesh.userData.noFade = true;
  starMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // the sugar rings: [0,N) one round each star's waist · HOOP, HOOP+1 the two
  // that orbit the visitor while he is invincible
  const mobile = !!(ctx.state?.mobile || ctx.state?.quality === 'mobile');
  const ropeGeo = mobile ? ropeGeometry(40, 8) : ropeGeometry(64, 12);
  const ropeU = {
    uRopeA: { value: new THREE.Color(0xff4f9e) }, uRopeB: { value: new THREE.Color(0xfff0d6) }, uRopeC: { value: new THREE.Color(0x4fe0a6) },
    uRopeGlow: { value: 0.1 }, uRopeRim: { value: 0.4 },
  };
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.0, emissive: 0x000000 });
  ringMat.onBeforeCompile = (sh) => {
    if (!sh.fragmentShader.includes('#include <color_fragment>') || !sh.fragmentShader.includes('#include <emissivemap_fragment>')
      || !sh.vertexShader.includes('#include <uv_vertex>')) return;
    Object.assign(sh.uniforms, ropeU);
    sh.vertexShader = ROPE_VS_HEAD + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvRope = aRope;');
    sh.fragmentShader = ROPE_FS_HEAD + sh.fragmentShader
      .replace('#include <color_fragment>', ROPE_COLOR)
      .replace('#include <emissivemap_fragment>', ROPE_EMIT);
  };
  ringMat.customProgramCacheKey = () => 'powerup-sugarring';
  const HOOP = N, NR = N + 2;
  const ringMesh = new THREE.InstancedMesh(ropeGeo, ringMat, NR);
  ringMesh.name = 'powerups_rings';
  ringMesh.castShadow = !mobile; ringMesh.receiveShadow = false;
  ringMesh.frustumCulled = false;
  ringMesh.userData.noFade = true; ringMesh.userData.noOcclude = true; ringMesh.userData.noInstOcclude = true; ringMesh.userData.noRay = true;
  ringMesh.raycast = () => {};
  ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // The visitor's amber x-ray silhouette (player/visitor.js, opaque queue at
  // 9990, body at 9991) paints wherever scene depth is nearer the lens than
  // he is: drawn before it, the hoops orbiting him would print amber bands
  // across his body. Drawn after his body, they only depth-test against it.
  // The crystals too (he can stand behind one for a moment).
  ringMesh.renderOrder = 9992;
  starMesh.renderOrder = 9992;

  const haloMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uIntensity: { value: 0.5 }, uPool: { value: 0 }, uTime: { value: 0 }, uSolid: { value: 0 },
      uRays: { value: 6 }, uSwirl: { value: 1 },
    }]),
    vertexShader: HALO_VS, fragmentShader: HALO_FS,
    // premultiplied "over": rgb is added, alpha darkens what is behind — so a
    // fragment with alpha 0 is a plain additive glow and the rings can still
    // paint solid colour by day. One draw call for every glow in this system.
    transparent: true, depthWrite: false, depthTest: true, fog: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  // instances: [0,N) glows · [N,2N) floor pools / jump rings · [2N,3N) beacons
  //            [3N,4N) chevron columns (double-jump stars only)
  //            [ORB, ORB+ORBIT_N) the visitor's sparkles · FEET his ring
  const BEAM = N * 2, JCOL = N * 3, ORB = N * 4, FEET = N * 4 + ORBIT_N, NH = FEET + 1;
  const haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, NH);
  const kinds = new Float32Array(NH);
  kinds.fill(1, N, 2 * N); kinds.fill(4, BEAM, BEAM + N); kinds.fill(7, JCOL, JCOL + N); kinds.fill(5, ORB, ORB + ORBIT_N); kinds[FEET] = 6;
  for (let i = 0; i < N; i++) if (SITES[i].kind === 'jump') kinds[N + i] = 3;   // target ring
  haloGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 1));
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let ringsOn = true;                          // the look wears a sugar ring (the crystal does)
  function lookColours() {
    const cHalo = new THREE.Color().fromArray(look.haloCol), cPool = new THREE.Color().fromArray(look.poolCol);
    const cRing = new THREE.Color().fromArray(look.ringCol);
    for (let i = 0; i < N; i++) {
      haloMesh.setColorAt(i, cHalo);
      haloMesh.setColorAt(N + i, SITES[i].kind === 'jump' ? cRing : cPool);
    }
    haloMat.uniforms.uRays.value = look.rays;
    haloMat.uniforms.uSwirl.value = look.swirl;
    ringsOn = !!look.ring;
    if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
  }
  {
    const cOff = new THREE.Color(0, 0, 0), cTmp = new THREE.Color();
    for (let i = 0; i < N; i++) { haloMesh.setColorAt(BEAM + i, cOff); haloMesh.setColorAt(JCOL + i, cOff); }
    for (let j = 0; j < ORBIT_N; j++) haloMesh.setColorAt(ORB + j, cTmp.setHex(SUGAR[j % SUGAR.length]));
    haloMesh.setColorAt(FEET, cOff);
    lookColours();
    for (let i = 0; i < NH; i++) haloMesh.setMatrixAt(i, ZERO);
  }
  haloMesh.name = 'powerups_halos';
  haloMesh.frustumCulled = false; haloMesh.castShadow = false; haloMesh.receiveShadow = false;
  haloMesh.renderOrder = 5;
  haloMesh.userData.noFade = true; haloMesh.userData.noOcclude = true;
  haloMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  haloMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

  const group = new THREE.Group();
  group.name = 'powerups';
  for (let i = 0; i < NR; i++) ringMesh.setMatrixAt(i, ZERO);
  group.add(starMesh, ringMesh, haloMesh);
  scene.add(group);

  // ── star records (the public `stars` array holds these very objects) ───────
  const stars = SITES.map((s, i) => ({
    id: s.id, island: s.island, kind: s.kind, label: s.label,
    x: s.x, y: s.y ?? 3, z: s.z, taken: false,
    index: i, phase: rnd() * Math.PI * 2, spin: 1.9 + rnd() * 0.7,
    respawnT: 0, pop: 1, pull: 0, floorY: 0, dx: 0, dy: 0, dz: 0, sparkAcc: rnd(),
    discovered: false, airborne: s.kind !== 'ground', noPool: s.kind === 'sky' || (!!s.deck && !s.pool), ringK: s.ringK ?? 1,
  }));
  let placed = false;

  // ── placement (once every builder's colliders exist) ───────────────────────
  function clearance(x, z) {
    const cols = ctx.colliders || [];
    let near = 99;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!c) continue;
      let d;
      if (c.box) {
        const w = c.w || 1, dd = c.d || 1;
        const ca = Math.cos(c.rot || 0), sa = Math.sin(c.rot || 0);
        const dx = x - c.x, dz = z - c.z;
        const lx = Math.abs(dx * ca + dz * sa) - w / 2, lz = Math.abs(-dx * sa + dz * ca) - dd / 2;
        d = (lx < 0 && lz < 0) ? Math.max(lx, lz) : Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
      } else d = Math.hypot(x - c.x, z - c.z) - (c.r || 0);
      if (d < near) near = d;
    }
    return near;
  }
  function pickupClear(x, z, r = 2.2) {
    const pk = ctx.systems.inventory?.pickups;
    if (!Array.isArray(pk)) return true;
    for (let i = 0; i < pk.length; i++) {
      const p = pk[i];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.hypot(p.x - x, p.z - z) < r) return false;
    }
    return true;
  }
  function floorAt(x, z) {
    try {
      const g = ctx.systems.player?.groundInfo?.(x, z);
      if (g && Number.isFinite(g.h)) return Number.isFinite(g.floor) ? Math.max(g.h, g.floor) : g.h;
    } catch { /* ground core mid-rebuild: fall back to the terrain */ }
    return Math.max(world.height(x, z), 0);
  }
  // A roof deck is only reported by groundInfo while the visitor is already up
  // at its level (the architecture gates decks by reachability), so ask the
  // architecture systems for the raw deck height first.
  function deckAt(x, z) {
    let best = -Infinity;
    for (const name of ['candyArchitecture', 'catArchitecture']) {
      try {
        const h = ctx.systems[name]?.getDeckHeight?.(x, z);
        if (typeof h === 'number' && Number.isFinite(h)) best = Math.max(best, h);
      } catch { /* not ours to fix */ }
    }
    return Math.max(best, floorAt(x, z));
  }
  const standable = (x, z) => world.height(x, z) > 0.7 || floorAt(x, z) > 0.7;
  const inRiver = (x, z) => x < 0 && world.riverDist(x, z) < world.RIVER.width * 0.5 + 0.8;

  function place() {
    placed = true;
    const moved = [];
    for (const s of stars) {
      const site = SITES[s.index];
      let x = site.x, z = site.z;
      if (site.kind === 'ground' || (site.kind === 'deck' && !site.deck)) {
        const pad = site.kind === 'deck' ? 1.0 : 1.5;
        const deckY = site.kind === 'deck' ? deckAt(x, z) : 0;
        const ok = (px, pz) => standable(px, pz) && !inRiver(px, pz) && clearance(px, pz) >= pad && pickupClear(px, pz)
          && (site.kind !== 'deck' || deckAt(px, pz) > deckY - 0.3);      // stay up on the roof
        if (!ok(x, z)) {
          let found = null;
          for (let r = 0.8; r <= 5.6 && !found; r += 0.8) {
            for (let a = 0; a < 16; a++) {
              const ang = a / 16 * Math.PI * 2 + r * 0.7;
              const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
              if (ok(px, pz)) { found = { x: px, z: pz }; break; }
            }
          }
          if (found) { moved.push(`${s.id}→${found.x.toFixed(1)},${found.z.toFixed(1)}`); x = found.x; z = found.z; }
        }
      }
      if (site.kind === 'jump' && !pickupClear(x, z, 2.6)) {
        // an ammo pickup was dropped on the "jump here" ring: slide the star
        // along the same floor (the bridge deck stays the bridge deck)
        const f0 = floorAt(x, z);
        let found = null;
        for (let r = 1.2; r <= 4.8 && !found; r += 0.6) {
          for (let a = 0; a < 16; a++) {
            const ang = a / 16 * Math.PI * 2 + r * 0.7;
            const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
            if (pickupClear(px, pz, 2.6) && Math.abs(floorAt(px, pz) - f0) < 0.35 && clearance(px, pz) >= 1.2) { found = { x: px, z: pz }; break; }
          }
        }
        if (found) { moved.push(`${s.id}→${found.x.toFixed(1)},${found.z.toFixed(1)}`); x = found.x; z = found.z; }
      }
      s.x = x; s.z = z;
      if (site.kind === 'deck') s.floorY = site.deck ? deckAt(site.deck[0], site.deck[1]) : deckAt(x, z);
      else if (site.kind === 'sea') s.floorY = Math.max(0, world.height(x, z));
      else s.floorY = floorAt(x, z);
      if (site.kind === 'deck' || site.kind === 'ground') s.y = s.floorY + (site.lift ?? GROUND_LIFT);
      else if (site.kind === 'jump') s.y = s.floorY + JUMP_LIFT;
      else if (site.kind === 'sea') s.y = s.floorY + SEA_Y;
      else s.y = site.y ?? s.floorY + 12;
    }
    const count = (isl) => stars.filter((s) => s.island === isl).length;
    const air = (isl) => stars.filter((s) => s.island === isl && s.airborne).length;
    console.warn(`[powerups] ${N} ${look.label}s · candy ${count('candy')} (${air('candy')} airborne) · cat ${count('cat')} (${air('cat')} airborne)`
      + ` · 3 draw calls (+2 shadow) · ${starMesh.geometry.attributes.position.count / 3} tris/star + ${ropeGeo.index.count / 3} tris/sugar ring`
      + (moved.length ? ' · nudged ' + moved.join(' ') : ''));
  }
  ctx.events.on('world:ready', () => {
    try { place(); } catch (err) { console.error('[powerups] placement failed', err); }
    try { prewarmFlash(); } catch (err) { console.warn('[powerups] rim prewarm skipped', err?.message || err); }
  });

  // ── HUD pill (own DOM under ctx.uiRoot) ────────────────────────────────────
  const hud = { el: null, t: null, bar: null, p: 0, want: 0, lastT: '', lastHue: -1, lastBar: -1, warn: false, posT: 0, bottom: 140 };
  // the plate's glow ring breathes rose → cream → mint (12 precomputed steps:
  // no string building per frame, and no hue wheel)
  const GLOW_STEPS = (() => {
    const A = new THREE.Color(0xff4f9e), B = new THREE.Color(0xfff0d6), M = new THREE.Color(0x4fe0a6), c = new THREE.Color();
    const out = [];
    for (let k = 0; k < 12; k++) {
      const h = (k / 12) * 3;
      if (h < 1) c.copy(A).lerp(B, h); else if (h < 2) c.copy(B).lerp(M, h - 1); else c.copy(M).lerp(A, h - 2);
      out.push({
        shadow: '0 3px 0 rgba(43,36,66,.34), 0 10px 24px rgba(14,8,26,.4), inset 0 2px 0 rgba(255,255,255,.95), 0 0 0 3px #' + c.getHexString(THREE.SRGBColorSpace),
        ico: `rotate(${(Math.sin(k / 12 * TAU) * 9).toFixed(1)}deg) scale(${(1 + 0.06 * Math.cos(k / 6 * TAU)).toFixed(3)})`,
      });
    }
    return out;
  })();
  try {
    if (ctx.uiRoot && typeof document !== 'undefined') {
      if (!document.getElementById('cci-powerups-style')) {
        const st = document.createElement('style');
        st.id = 'cci-powerups-style';
        st.textContent = CSS;
        document.head.appendChild(st);
      }
      const el = document.createElement('div');
      el.className = 'cci cci-plate cci-star-pill';
      el.innerHTML = `<span class="sp-ico">${HUD_ICON[lookName]}</span>`
        + '<span class="sp-txt"><b class="sp-lbl">INVINCIBLE</b><span class="sp-bar"><i></i></span></span>'
        + '<b class="sp-t">10.0</b>';
      ctx.uiRoot.appendChild(el);
      hud.el = el; hud.t = el.querySelector('.sp-t'); hud.bar = el.querySelector('.sp-bar i');
      hud.ico = el.querySelector('.sp-ico');
    }
  } catch (err) { console.warn('[powerups] HUD pill unavailable', err?.message || err); }

  const shown = (el) => el && el.style.display !== 'none' && el.offsetHeight > 0;
  function hudPlace() {
    // bottom centre, above the hotbar — and above an open dialogue box, which
    // docks over the hotbar too. The box's nameplate pokes up out of its top
    // edge, so measure the highest of the two. A few times a second, not per frame.
    const root = ctx.uiRoot;
    const rootB = root.getBoundingClientRect().bottom || (typeof innerHeight === 'number' ? innerHeight : 0);
    let bottom = 26;
    const bar = root.querySelector('.cci-bar');
    if (shown(bar)) bottom = Math.max(bottom, rootB - bar.getBoundingClientRect().top + 12);
    const say = root.querySelector('.cci-say');
    if (shown(say) && parseFloat(say.style.opacity || '1') > 0.1) {
      let top = say.getBoundingClientRect().top;
      const np = say.querySelector('.cci-nameplate');
      if (shown(np)) top = Math.min(top, np.getBoundingClientRect().top);
      bottom = Math.max(bottom, rootB - top + 16);
    }
    hud.bottom = bottom;
    hud.el.style.bottom = bottom.toFixed(0) + 'px';
  }

  function hudUpdate(dt) {
    if (!hud.el) return;
    hud.want = effect.on ? 1 : 0;
    const was = hud.p;
    hud.p = clamp(hud.p + (hud.want > hud.p ? dt / 0.22 : -dt / 0.18), 0, 1);
    if (hud.p <= 0) { if (was > 0 || hud.el.style.display !== 'none') hud.el.style.display = 'none'; return; }
    if (hud.el.style.display === 'none') { hud.el.style.display = 'flex'; hud.posT = 0; }
    hud.posT -= dt;
    if (hud.posT <= 0) { hud.posT = 0.25; try { hudPlace(); } catch { /* layout read failed: keep last */ } }
    const e = hud.p;
    const back = 1 + 2.2 * Math.pow(e - 1, 3) + 1.2 * Math.pow(e - 1, 2);      // back-out ease
    const warn = effect.on && effect.left < 3;
    const shake = warn ? Math.sin(ctx.state.elapsed * 38) * 2.2 : 0;
    hud.el.style.opacity = clamp(e * 1.8, 0, 1).toFixed(3);
    hud.el.style.transform = `translateX(calc(-50% + ${shake.toFixed(1)}px)) translateY(${((1 - back) * 16).toFixed(1)}px) scale(${(0.88 + 0.12 * back).toFixed(3)})`;
    const txt = effect.on ? effect.left.toFixed(1) : '0.0';
    if (txt !== hud.lastT) { hud.lastT = txt; hud.t.textContent = txt; }
    // the bar empties from the right (a clip, so the twist's stripes never squash)
    const barK = Math.round(clamp(effect.on ? effect.left / effect.total : 0, 0, 1) * 400);
    if (barK !== hud.lastBar) { hud.lastBar = barK; hud.bar.style.clipPath = `inset(0 ${(100 - barK / 4).toFixed(2)}% 0 0)`; }
    if (warn !== hud.warn) { hud.warn = warn; hud.el.classList.toggle('warn', warn); }
    // sugar ring round the plate (rose → cream → mint), and the icon wobbles;
    // stepped, so the DOM is not rewritten every single frame
    const step = Math.floor(ctx.state.elapsed * 7) % 12;
    if (step !== hud.lastHue) {
      hud.lastHue = step;
      hud.el.style.boxShadow = GLOW_STEPS[step].shadow;
      hud.ico.style.transform = GLOW_STEPS[step].ico;
    }
  }

  // ── the visitor's rainbow rim (cloned materials, restored exactly) ─────────
  const flash = { list: [], seen: new Set(), clones: new Map(), cloneList: [], scanT: 0 };
  const rimU = { value: 0 }, rimT = { value: 0 };
  function rimPatch(sh) {
    if (!sh.fragmentShader.includes('#include <emissivemap_fragment>')) return;
    sh.uniforms.uStarRim = rimU; sh.uniforms.uStarT = rimT;
    sh.fragmentShader = 'uniform float uStarRim;\nuniform float uStarT;\n'
      + sh.fragmentShader.replace('#include <emissivemap_fragment>', RIM_GLSL);
  }
  const rimKey = () => 'powerup-star-rim';
  function flashMaterial(m) {
    if (!m || !m.emissive || !m.isMaterial) return null;
    // A material with its own shader patch (a held weapon's glow, say) would
    // lose it in a clone, and sharing the patch could steal its owner's uniform
    // handle. Leave those alone: the body is what needs to shine.
    // The visitor's own body material (player/visitor.js, one skinned mesh) is
    // the exception: it opts in with userData.flashChain, its patch runs first
    // and ours after it, and the clone shares its uniforms (night glow).
    if (m.userData?.powerupFlash) return null;              // already one of ours
    const chain = !!m.userData?.flashChain;
    if (!chain && Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) return null;
    let c = flash.clones.get(m);
    if (!c) {
      c = m.clone();
      c.name = (m.name || 'visitor') + '_starflash';
      c.userData = { ...m.userData, powerupFlash: true };
      if (chain) {
        const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey.bind(m);
        c.onBeforeCompile = (sh, r) => { base.call(m, sh, r); rimPatch(sh); };
        c.customProgramCacheKey = () => baseKey() + '|' + rimKey();
      } else {
        c.onBeforeCompile = rimPatch;
        c.customProgramCacheKey = rimKey;
      }
      flash.clones.set(m, c);
      flash.cloneList.push({ orig: m, clone: c });
    }
    return c;
  }
  function visitMesh(o) {
    if (!o.isMesh || o.userData?.silhouette || flash.seen.has(o)) return;
    flash.seen.add(o);
    const orig = o.material;
    if (Array.isArray(orig)) {
      let any = false;
      const arr = orig.map((m) => { const c = flashMaterial(m); if (c) any = true; return c || m; });
      if (!any) return;
      flash.list.push({ mesh: o, orig, clone: arr });
      o.material = arr;
    } else {
      const c = flashMaterial(orig);
      if (!c) return;
      flash.list.push({ mesh: o, orig, clone: c });
      o.material = c;
    }
  }
  function flashScan() {
    const g = ctx.systems.player?.group;
    if (g?.traverse) g.traverse(visitMesh);
  }
  function flashRestore() {
    for (let i = 0; i < flash.list.length; i++) {
      const e = flash.list[i];
      // someone else swapped this mesh's material mid-effect: theirs wins
      if (e.mesh.material === e.clone) e.mesh.material = e.orig;
    }
    flash.list.length = 0;
    flash.seen.clear();
  }
  // Compile the rim programs at load, against the real scene's lights, so the
  // first star you catch does not hitch on a shader compile.
  function prewarmFlash() {
    const g = ctx.systems.player?.group, r = ctx.renderer;
    if (!g?.traverse || typeof r?.compile !== 'function') return;
    const proxy = new THREE.Scene();
    const done = new Set();
    g.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData?.silhouette) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        const c = flashMaterial(m);
        if (!c || done.has(c)) continue;
        done.add(c);
        // the visitor is one SkinnedMesh now: compile the skinned variant
        const pm = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, c) : new THREE.Mesh(o.geometry, c);
        if (o.isSkinnedMesh) pm.bind(o.skeleton, o.bindMatrix);
        pm.castShadow = o.castShadow; pm.receiveShadow = o.receiveShadow;
        proxy.add(pm);
      }
    });
    if (proxy.children.length) r.compile(proxy, ctx.camera, ctx.scene);
  }
  const WHITE = new THREE.Color(1, 1, 1);
  function flashUpdate(dt, t) {
    flash.scanT -= dt;
    if (flash.scanT <= 0) { flash.scanT = 0.5; flashScan(); }      // held items come and go
    const left = effect.left;
    // The tourist keeps his own colours. A rose / cream / mint candy-glass rim
    // runs round his outline and a faint shimmer rides on top; the last 2.5 s strobe between that and
    // the plain tourist, faster and faster — "it's running out".
    let rim = 1.8, glow = 0.05 + 0.03 * Math.sin(t * 11);
    if (left < 2.5) {
      const rate = 10 + (2.5 - left) * 12;
      if (Math.sin(t * rate) <= 0) { rim = 0; glow = 0; }
    }
    const pop = effect.startT < 0.35 ? clamp(1 - effect.startT / 0.35, 0, 1) : 0;   // white-hot on pickup
    rimU.value = rim + pop * 1.6;
    rimT.value = t;
    const g = Math.max(glow, pop * 0.85);
    for (let i = 0; i < flash.cloneList.length; i++) {
      const { orig, clone } = flash.cloneList[i];
      const oe = orig.emissive;
      clone.emissive.setRGB(oe.r + WHITE.r * g, oe.g + WHITE.g * g * 0.96, oe.b + WHITE.b * g * 0.88);
      clone.emissiveIntensity = 1;
      if (clone.color && orig.color) clone.color.copy(orig.color);
    }
  }

  // ── the effect ─────────────────────────────────────────────────────────────
  const effect = { on: false, left: 0, total: DURATION, startT: 0, trailAcc: 0 };

  function begin(secs, star) {
    const pl = ctx.systems.player;
    const fresh = !effect.on;
    effect.on = true;
    effect.total = Math.max(secs, effect.left);
    effect.left = Math.max(secs, effect.left);
    effect.startT = 0;
    if (fresh) {
      flashScan();
      ctx.events.emit('powerup:star', { on: true, id: star?.id ?? null, x: star?.x ?? pl?.position?.x ?? 0, z: star?.z ?? pl?.position?.z ?? 0, duration: effect.left });
    }
    if (pl) { try { pl.invulnerable = true; pl.speedBoost = SPEED_BOOST; } catch { /* read-only player stub */ } }
    try { ctx.systems.ui?.toast?.('INVINCIBLE!', 2.6, { icon: 'sugarstar' }); } catch { /* ui optional */ }
    try { ctx.systems.audio?.play?.('star'); } catch { /* audio optional */ }
  }

  function finish() {
    if (!effect.on) return;
    effect.on = false; effect.left = 0;
    flashRestore();
    rimU.value = 0;
    const pl = ctx.systems.player;
    if (pl) {
      try { pl.speedBoost = 1; } catch { /* stub */ }
      try { if (!pl.rolling) pl.invulnerable = false; } catch { /* stub */ }
    }
    ctx.events.emit('powerup:star', { on: false });
  }

  // ── particles (one reused options bag per effect: no per-frame garbage) ────
  const P = () => ctx.systems.particles;
  const sparkO = {
    x: 0, y: 0, z: 0, count: 1, shape: 'sparkle', blend: 'add', color: 0xffffff,
    speed: 0.3, up: 0.5, life: 1.2, lifeVar: 0.3, size: 0.32, sizeEnd: 0.05, sizeVar: 0.3,
    gravity: -0.9, drag: 1.3, area: 0.55, areaY: 0.9, alpha: 1, fadeIn: 0.08, fadeOut: 0.5, spin: 1.6, flicker: true,
  };
  // a double-jump star drips glitter straight down onto the spot you jump
  // from, so its height reads (a star 4 u up otherwise looks like it floats
  // over whatever is behind it)
  const dripO = {
    x: 0, y: 0, z: 0, count: 1, shape: 'sparkle', blend: 'add', color: look.burst,
    speed: 0.2, vy: -0.6, vyJitter: 0.4, life: 1.15, lifeVar: 0.2, size: 0.36, sizeEnd: 0.1, sizeVar: 0.3,
    gravity: -3.2, drag: 0.4, area: 0.35, alpha: 1, fadeIn: 0.08, fadeOut: 0.4, spin: 1.8, flicker: true,
  };
  // blend flips per frame: additive glitter at night, solid chips by day
  // (additive sparkles vanish against a sunlit plaza). Small and quick, so the
  // trail reads as glitter off his heels, never as a smear round his feet.
  const trailO = {
    x: 0, y: 0, z: 0, count: 1, shape: 'sparkle', blend: 'add', color: SUGAR,
    speed: 1.1, up: 1.0, life: 0.6, lifeVar: 0.25, size: 0.42, sizeEnd: 0.06, sizeVar: 0.3,
    gravity: -1.6, drag: 1.4, area: 0.45, areaY: 1.2, alpha: 1, fadeIn: 0.05, fadeOut: 0.4, spin: 2.6,
  };
  const burstO = {
    x: 0, y: 0, z: 0, count: 26, shape: 'sparkle', blend: 'add', color: look.burst,
    speed: 6.5, up: 0.9, life: 0.9, lifeVar: 0.3, size: 0.6, sizeEnd: 0.05, sizeVar: 0.35,
    gravity: -3, drag: 2.4, spread: 0.4, alpha: 1, fadeIn: 0.03, fadeOut: 0.5, spin: 2.5,
  };
  const safe = (fn) => { try { fn(); } catch { /* particles optional */ } };
  /** Hot-path spawn: no closure, no garbage. */
  function emit(p, o) { try { p.burst(o); } catch { /* particles optional */ } }

  // ── map markers (a star goes on the map once you have seen it) ─────────────
  function mark(s, on) {
    const ui = ctx.systems.ui;
    try {
      if (on) ui?.addMapMarker?.({ id: 'star_' + s.id, x: s.x, z: s.z, glyph: 'star', label: 'Star — ' + s.label });
      else ui?.removeMapMarker?.('star_' + s.id);
    } catch { /* map markers are optional (contract G) */ }
  }

  function collect(s) {
    if (!s || s.taken) return false;
    s.taken = true; s.respawnT = RESPAWN; s.pull = 0;
    const x = s.x + s.dx, y = s.y + s.dy, z = s.z + s.dz;
    s.dx = s.dy = s.dz = 0;
    const p = P();
    if (p) {
      burstO.x = x; burstO.y = y; burstO.z = z;
      safe(() => p.burst(burstO));
      safe(() => p.confetti?.(x, y, z, { count: 22, color: CANDY, speed: 5.5, life: 1.4 }));
      const pl = ctx.systems.player?.position;
      if (pl) safe(() => p.ripple?.(pl.x, pl.y + 0.08, pl.z, { ringColor: look.burst[1], ringSize: 5.5, ringLife: 0.7 }));
    }
    try { ctx.systems.camera?.shake?.(0.25, 0.25); } catch { /* optional */ }
    mark(s, false);
    ctx.events.emit('powerup:collect', { id: s.id, x, y, z });
    begin(DURATION, s);
    return true;
  }

  // ── frame ──────────────────────────────────────────────────────────────────
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  let visitorFx = false;
  const _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _v = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
  const TWIRL_EVERY = 5.5, TWIRL_LEN = 0.55;
  let sparkFlip = 0;

  function hideStar(i) {
    starMesh.setMatrixAt(i, ZERO); haloMesh.setMatrixAt(i, ZERO); ringMesh.setMatrixAt(i, ZERO);
    haloMesh.setMatrixAt(N + i, ZERO); haloMesh.setMatrixAt(BEAM + i, ZERO); haloMesh.setMatrixAt(JCOL + i, ZERO);
  }

  function update(dt, ctx) {
    if (!placed) { try { place(); } catch (err) { console.error('[powerups] placement failed', err); } }
    const st = ctx.state;
    const t = st.elapsed;
    const night = 1 - clamp(st.daylight ?? 1, 0, 1);
    const pl = ctx.systems.player;
    const pp = pl?.position;
    const riding = !!(pl && (pl.onVehicle || pl.onFerry || st.flying || st.vehicle));
    // in a tiger's jaws (the scruff-carry, the raid's rainbow carry: onFerry, but not riding) — no star
    const held = !!(ctx.systems.catCitizens?.carrier || ctx.systems.catCitizens?.raid?.carrying);
    const cam = ctx.camera.position;
    const p = P();

    // glow after dark: brighter emissive + halo; a gentle halo by day too
    starMat.emissiveIntensity = 0.26 + 0.78 * night;       // glows its own colours, never blown to white
    haloMat.uniforms.uIntensity.value = 0.34 + 1.0 * night;
    haloMat.uniforms.uPool.value = 0.05 + 0.75 * night;
    haloMat.uniforms.uTime.value = t;
    haloMat.uniforms.uSolid.value = 0.75 * (1 - night);
    starRim.value = 0.18 + 0.3 * night;
    ropeU.uRopeGlow.value = 0.05 + 0.5 * night;
    ropeU.uRopeRim.value = 0.3 + 0.4 * night;

    const bx = pp ? pp.x : 0, by = pp ? pp.y + BODY_Y : 0, bz = pp ? pp.z : 0;
    for (let i = 0; i < N; i++) {
      const s = stars[i];
      if (s.taken) {
        if (!st.paused) s.respawnT -= dt;
        if (s.respawnT <= 0) {
          s.taken = false; s.pop = 0; s.respawnT = 0;
          if (s.discovered) mark(s, true);
          const dcx = s.x - cam.x, dcz = s.z - cam.z;
          if (p && dcx * dcx + dcz * dcz < 90 * 90) safe(() => p.sparkle?.(s.x, s.y, s.z, look.burst[1], 14));
        } else { hideStar(i); continue; }
      }
      if (s.pop < 1) s.pop = Math.min(1, s.pop + dt / 0.6);

      // pickup test (body centre ↔ star centre)
      let nearK = 1;
      if (pp && !st.paused && !held) {
        const dx = s.x + s.dx - bx, dy = s.y + s.dy - by, dz = s.z + s.dz - bz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const R = riding ? RIDE_R : COLLECT_R;
        if (d2 < R * R) { collect(s); hideStar(i); continue; }
        // riders: a star within MAGNET_R homes in (the flyer and the catapult
        // cannot be steered to the centimetre)
        const home = s.x - bx, homeY = s.y - by, homeZ = s.z - bz;
        const a2 = home * home + homeY * homeY + homeZ * homeZ;
        if (riding && a2 < MAGNET_R * MAGNET_R) s.pull = Math.min(1, s.pull + dt * 2.2);
        else s.pull = Math.max(0, s.pull - dt * 1.5);
        if (s.pull > 0) {
          const k = s.pull * s.pull;
          s.dx = -home * k; s.dy = -homeY * k; s.dz = -homeZ * k;
        } else s.dx = s.dy = s.dz = 0;
        const h2 = home * home + homeZ * homeZ;
        if (!s.discovered && h2 < DISCOVER_R * DISCOVER_R) { s.discovered = true; mark(s, true); }
        // the beacon steps back when you are right under it, so it never
        // washes over the visitor
        nearK = 0.3 + 0.7 * clamp((Math.sqrt(h2) - 2.5) / 4, 0, 1);
      } else if (pp) {
        const hx = s.x - bx, hz = s.z - bz;
        nearK = 0.3 + 0.7 * clamp((Math.sqrt(hx * hx + hz * hz) - 2.5) / 4, 0, 1);
      }

      // pose: turn to the lens, tip the axis back toward it (so the cluster
      // shows its side and the comet opens its orbit), wobble, spin about its
      // own axis with a quick extra whirl every few seconds, bob, pop in with
      // an overshoot
      const bob = Math.sin(t * 2.3 + s.phase) * 0.17;
      const e = s.pop;
      const popS = e >= 1 ? 1 : 1 + 2.4 * Math.pow(e - 1, 3) + 1.4 * Math.pow(e - 1, 2);
      const x = s.x + s.dx, y = s.y + s.dy + bob, z = s.z + s.dz;
      const cx = cam.x - x, cy = cam.y - y, cz = cam.z - z;
      const hd = Math.sqrt(cx * cx + cz * cz);
      const dCam = Math.sqrt(hd * hd + cy * cy);
      const far = clamp(dCam / 46, 1, 1.9);              // never shrinks to a speck
      const cyc = (t * (s.spin / 2.2) + s.phase) % TWIRL_EVERY;
      const tw = cyc < TWIRL_LEN ? cyc / TWIRL_LEN : 0;
      const twirl = tw > 0 ? (tw * tw * (3 - 2 * tw)) * TAU : 0;
      const wob = look.wobble;
      _e.set(-Math.atan2(cy, hd) * look.face + Math.sin(t * 1.3 + s.phase) * wob, Math.atan2(cx, cz),
        Math.sin(t * 1.9 + s.phase * 2) * wob);
      _q.setFromEuler(_e);
      _q2.setFromAxisAngle(_Y, t * look.spin * (s.spin / 2.2) + s.phase * 3 + twirl);
      _q.multiply(_q2);
      const sz = (s.kind === 'sky' ? 1.25 : 1) * popS * far;
      const ms = sz * look.scale;
      _m.compose(_p.set(x, y, z), _q, _s.set(ms, ms, ms));
      starMesh.setMatrixAt(i, _m);
      // the sugar ring: a 3D torus tilted ~20° round the crystal's waist; the
      // tilt swings slowly round it (an orbit) while the twist runs along it
      if (ringsOn) {
        const rr = RING_R * ms * s.ringK * (1 - 0.45 * s.pull);
        _e.set(RING_TILT + 0.05 * Math.sin(t * 0.9 + s.phase), t * 0.42 + s.phase * 2, 0);
        _q3.setFromEuler(_e);
        _q2.setFromAxisAngle(_Y, t * 0.6 + s.phase);
        _q3.multiply(_q2);
        _m.compose(_p.set(x, y + RING_WAIST * ms, z), _q3, _s.set(rr, rr, rr));
        ringMesh.setMatrixAt(i, _m);
      } else ringMesh.setMatrixAt(i, ZERO);
      // soft glow behind it (no ring: that is the torus now)
      const hs = look.halo * sz * (1 + 0.12 * night) * (0.96 + 0.04 * Math.sin(t * 3 + s.phase)) * (1 - 0.6 * s.pull);
      _m.makeScale(hs, hs, hs); _m.setPosition(x, y, z);
      haloMesh.setMatrixAt(i, _m);
      // a double-jump star: chevrons climb from its jump ring to the crystal
      if (s.kind === 'jump' && s.pull === 0) {
        const y0 = s.floorY + 0.35, y1 = y - 0.75 * ms;
        if (y1 - y0 > 0.5) {
          _m.makeScale(1.0, y1 - y0, 1.0); _m.setPosition(s.x, (y0 + y1) * 0.5, s.z);
          haloMesh.setMatrixAt(JCOL + i, _m);
          haloMesh.setColorAt(JCOL + i, _c.setRGB(0, popS, 0));
        } else haloMesh.setMatrixAt(JCOL + i, ZERO);
      } else if (s.kind === 'jump') haloMesh.setMatrixAt(JCOL + i, ZERO);
      // pool of light on the floor under it (none under a sky star or one hung
      // out past a railing: nothing under it to light)
      if (s.noPool || s.pull > 0) haloMesh.setMatrixAt(N + i, ZERO);
      else {
        const ps = (s.kind === 'jump' ? 2.6 : 3.6) * popS * (1 + bob * 0.4);
        _m.makeScale(ps, ps, ps); _m.setPosition(s.x, s.floorY + (s.kind === 'jump' ? 0.3 : 0.16), s.z);
        haloMesh.setMatrixAt(N + i, _m);
      }
      // beacon: from the floor (or a way under a sky star) to well above it
      // beacons are for finding a star from afar: they fade out far away and
      // step aside when the lens is close
      const beamK = popS * nearK * (1 - s.pull) * (1 - clamp((hd - BEAM_NEAR) / (BEAM_FAR - BEAM_NEAR), 0, 1))
        * (0.25 + 0.75 * clamp((hd - 10) / 14, 0, 1));
      if (beamK < 0.02) haloMesh.setMatrixAt(BEAM + i, ZERO);
      else {
        const yb = s.kind === 'sky' ? s.y - 8 : s.floorY + 0.05, yt = s.y + BEAM_UP;
        const H = yt - yb, bw = BEAM_W * (1 + (far - 1) * 0.9);
        _m.makeScale(bw, H, bw); _m.setPosition(s.x, (yb + yt) * 0.5, s.z);
        haloMesh.setMatrixAt(BEAM + i, _m);
        haloMesh.setColorAt(BEAM + i, _c.setRGB((s.y - yb) / H, beamK, s.kind === 'sky' ? 1 : 0));
      }

      // sparkle trail, only where someone could see it
      if (p && !st.paused) {
        const px = pp ? x - pp.x : 1e9, pz = pp ? z - pp.z : 1e9;
        if (hd < SPARKLE_R || px * px + pz * pz < SPARKLE_R * SPARKLE_R) {
          const jump = s.kind === 'jump';
          s.sparkAcc += dt * (jump ? 7 : look.sparkRate * (0.7 + 0.5 * night));
          if (s.sparkAcc >= 1) {
            s.sparkAcc -= 1;
            if (s.sparkAcc > 2) s.sparkAcc = 0;
            const o = jump && (i + (s.sparkAcc * 7 | 0)) % 3 !== 0 ? dripO : sparkO;
            // the sparkle tail leaves from the look's tail tip (the end of the
            // candy-stripe corkscrew, the comet's head), one stripe colour at
            // a time; solid chips by day, additive glitter by night
            const tip = looks[lookName].tip;
            if (tip && o === sparkO) {
              _v.copy(tip).applyQuaternion(_q).multiplyScalar(sz * look.scale);
              o.x = x + _v.x; o.y = y + _v.y; o.z = z + _v.z;
              o.area = 0.12; o.areaY = 0.1;
            } else { o.x = x; o.y = y - 0.15; o.z = z; if (o === sparkO) { o.area = 0.55; o.areaY = 0.9; } }
            o.color = look.spark[sparkFlip++ % look.spark.length];
            o.blend = night > 0.45 ? 'add' : 'normal';
            emit(p, o);
          }
        }
      }
    }

    // the effect itself
    if (effect.on) {
      if (!st.paused) { effect.left -= dt; effect.startT += dt; }
      if (effect.left <= 0) finish();
      else {
        if (pl) {
          try { pl.invulnerable = true; pl.speedBoost = SPEED_BOOST; } catch { /* stub */ }
        }
        flashUpdate(dt, t);
        if (pp) {
          // two sugar hoops (the star's own ring, grown) orbiting his waist
          // on crossed tilts — the silhouette change that says "invincible"
          // from across the island — sugar sparkles spiralling up round him,
          // and a dashed sugar ring chasing round his feet
          const strobe = effect.left < 2.5 && Math.sin(t * (10 + (2.5 - effect.left) * 12)) <= 0;
          const intro = clamp(effect.startT / 0.3, 0, 1);
          const hi = clamp(effect.startT / 0.45, 0, 1);
          const hoopIn = hi >= 1 ? 1 : 1 + 2.2 * Math.pow(hi - 1, 3) + 1.2 * Math.pow(hi - 1, 2);
          for (let j = 0; j < 2; j++) {
            const hr = strobe ? 0 : HOOP_R * (0.3 + 0.7 * hoopIn) * (1 + 0.03 * Math.sin(t * 5 + j * 2));
            _e.set(j ? 0.78 : 0.42, j ? Math.PI * 0.6 - t * 0.9 : t * 1.25, 0);
            _q3.setFromEuler(_e);
            _q2.setFromAxisAngle(_Y, j ? -t * 1.6 : t * 2.1);
            _q3.multiply(_q2);
            _m.compose(_p.set(pp.x, pp.y + (j ? 1.08 : 0.84), pp.z), _q3, _s.set(hr, hr, hr));
            ringMesh.setMatrixAt(HOOP + j, _m);
          }
          for (let j = 0; j < ORBIT_N; j++) {
            const a = t * 2.4 + j * (TAU / ORBIT_N);
            const hf = (j / ORBIT_N + t * 0.42) % 1;
            const fade = hf < 0.15 ? hf / 0.15 : hf > 0.82 ? (1 - hf) / 0.18 : 1;
            const rad = (0.95 + 0.12 * Math.sin(t * 3 + j)) * (0.6 + 0.4 * intro);
            const sc = strobe ? 0 : (0.52 + 0.14 * Math.sin(t * 9 + j * 1.7)) * fade * intro;
            _m.makeScale(sc, sc, sc); _m.setPosition(pp.x + Math.cos(a) * rad, pp.y + 0.15 + hf * 1.95, pp.z + Math.sin(a) * rad);
            haloMesh.setMatrixAt(ORB + j, _m);
          }
          const rs = 2.5 * (1 + 0.05 * Math.sin(t * 6)) * (0.5 + 0.5 * intro);
          _m.makeScale(rs, rs, rs); _m.setPosition(pp.x, pp.y + 0.07, pp.z);
          haloMesh.setMatrixAt(FEET, _m);
          haloMesh.setColorAt(FEET, _c.setRGB(strobe ? 0 : 1, 0, 0));
          visitorFx = true;
        }
        if (p && pp && !st.paused) {
          effect.trailAcc += dt * 22;
          let guard = 0;
          while (effect.trailAcc >= 1 && guard++ < 4) {
            effect.trailAcc -= 1;
            trailO.x = pp.x; trailO.y = pp.y + BODY_Y; trailO.z = pp.z;
            trailO.blend = night > 0.45 ? 'add' : 'normal';
            emit(p, trailO);
          }
          if (effect.trailAcc > 4) effect.trailAcc = 0;
        }
      }
    }
    if (visitorFx && !effect.on) {
      for (let j = 0; j < ORBIT_N; j++) haloMesh.setMatrixAt(ORB + j, ZERO);
      haloMesh.setMatrixAt(FEET, ZERO);
      ringMesh.setMatrixAt(HOOP, ZERO); ringMesh.setMatrixAt(HOOP + 1, ZERO);
      visitorFx = false;
    }
    starMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceColor.needsUpdate = true;
    hudUpdate(dt);
  }

  // stage() only (views + tests): is a spot free of thin props at his waist
  // and chest, and does the lens see him whole? (A signpost's arrow board
  // between him and the lens puts his x-ray silhouette across his body.)
  // Rays against the meshes near the spot — never per frame.
  const _rc = new THREE.Raycaster(), _ro = new THREE.Vector3(), _rd = new THREE.Vector3(), _bs = new THREE.Sphere();
  function bodyClear(px, py, pz, lens) {
    try {
      const near = [];
      const plg = ctx.systems.player?.group;
      scene.traverse((o) => {
        if (!o.isMesh || !o.visible || o.isSkinnedMesh || o.isInstancedMesh || !o.geometry) return;
        for (let n = o; n; n = n.parent) if (n === group || n === plg || n.userData?.silhouette) return;
        if (o.material?.transparent && o.material.depthWrite === false) return;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        _bs.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
        if (_bs.radius < 60 && _bs.distanceToPoint(_ro.set(px, py + 1, pz)) < 6) near.push(o);
      });
      for (const h of [0.75, 1.3]) {
        for (let a = 0; a < 8; a++) {
          _rc.set(_ro.set(px, py + h, pz), _rd.set(Math.cos(a / 8 * TAU), 0, Math.sin(a / 8 * TAU)));
          _rc.far = 0.6;
          if (_rc.intersectObjects(near, false).length) return false;
        }
      }
      if (lens) {
        for (const h of [0.35, 0.9, 1.5]) {
          _rc.set(_ro.set(px, py + h, pz), lens); _rc.far = 6;
          if (_rc.intersectObjects(near, false).length) return false;
        }
      }
    } catch { /* raycast unavailable: trust the colliders */ }
    return true;
  }

  /** Stand the visitor beside star `id` on its own floor (views + tests). */
  function stage(id, dist = 2.8, bearing = null) {
    if (!placed) place();
    const s = stars.find((q) => q.id === id);
    const pl = ctx.systems.player;
    if (!s || typeof pl?.teleport !== 'function') return null;
    let best = null;
    if (s.kind === 'sky' || s.kind === 'sea') {
      // nearest dry, clear ground
      for (let r = 2; r <= 44 && !best; r += 2) {
        for (let a = 0; a < 24; a++) {
          const an = (bearing ?? 0) + a / 24 * TAU;
          const px = s.x + Math.cos(an) * r, pz = s.z + Math.sin(an) * r;
          if (world.height(px, pz) > 0.8 && !inRiver(px, pz) && clearance(px, pz) >= 1.2) { best = { x: px, z: pz }; break; }
        }
      }
    } else {
      // Same floor as the star, clear of props, and by default off to one
      // SIDE of it as the lens sees it (never in front: he would hide it).
      const floor = (px, pz) => (s.kind === 'deck' ? deckAt(px, pz) : floorAt(px, pz));
      const tol = s.kind === 'jump' ? 0.9 : 0.45;
      const az = ctx.systems.camera?.current?.azimuth ?? ctx.systems.camera?.params?.azimuth ?? Math.PI / 4;
      const el = ctx.systems.camera?.current?.elevation ?? ctx.systems.camera?.params?.elevation ?? 0.64;
      const lens = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      const cands = [];
      // a star over a stair has no level floor round it: loosen once if needed
      for (const [tl, cl] of [[tol, 0.6], [Math.max(tol, 1.3), 0.4]]) {
       if (cands.length) break;
       for (const dd of [dist, dist * 0.7, dist * 1.35]) {
        for (let a = 0; a < 24; a++) {
          // a given bearing is tried first, then its neighbours
          const off = bearing === null ? 0 : ((a + 1) >> 1) * (a % 2 ? 1 : -1) * (TAU / 24);
          const an = bearing === null ? a / 24 * TAU : bearing + off;
          const px = s.x + Math.cos(an) * dd, pz = s.z + Math.sin(an) * dd;
          const f = floor(px, pz);
          if (Math.abs(f - s.floorY) > tl || !standable(px, pz)) continue;
          if (inRiver(px, pz) && f < world.height(px, pz) + 0.5) continue;      // a bridge deck is fine
          const c = clearance(px, pz);
          if (c < cl) continue;
          const score = bearing === null
            ? Math.min(c, 3) - 2 * Math.abs(Math.sin(an + az)) - (dd === dist ? 0 : 0.5)
            : 10 - Math.abs(off) * 3 - (dd === dist ? 0 : 0.5);
          cands.push({ x: px, z: pz, y: f, score });
        }
       }
      }
      // best first; the colliders only know posts and trunks, so the first few
      // are also ray-tested at waist and chest height: a signpost's arrow
      // board or a railing must not pass through him
      cands.sort((a, b) => b.score - a.score);
      for (let k = 0; k < cands.length && k < 10 && !best; k++) if (bodyClear(cands[k].x, cands[k].y, cands[k].z, lens)) best = cands[k];
      if (!best && cands.length) best = cands[0];
    }
    if (!best) return null;
    if (s.kind === 'deck' && pl.position) pl.position.y = (best.y ?? s.floorY) + 0.05;   // decks answer at their own level
    pl.teleport(best.x, best.z);
    // turn him half toward the lens, half toward the star: face and prize both read
    try {
      const az = ctx.systems.camera?.current?.azimuth ?? ctx.systems.camera?.params?.azimuth ?? Math.PI / 4;
      const sx = s.x - pl.position.x, sz = s.z - pl.position.z, sl = Math.hypot(sx, sz) || 1;
      pl.facing = Math.atan2(sx / sl + Math.sin(az) * 1.3, sz / sl + Math.cos(az) * 1.3);
    } catch { /* read-only facing: fine */ }
    // re-frame the follow camera on him (a free camera keeps its own aim:
    // snap() would re-centre it on the visitor)
    try { const cam = ctx.systems.camera; if (!cam?.isFree?.()) cam?.snap?.(); } catch { /* camera optional */ }
    return { x: pl.position.x, y: pl.position.y, z: pl.position.z };
  }

  const api = {
    group, stars, duration: DURATION, respawn: RESPAWN, collectRadius: COLLECT_R,
    get active() { return effect.on; },
    get timeLeft() { return effect.on ? Math.max(0, effect.left) : 0; },
    /** Start (or top up) the effect without a star. */
    grant(secs = DURATION) { begin(Math.max(0.1, +secs || DURATION), null); return effect.left; },
    /** Stop the effect now; the visitor's materials go back exactly as they were. */
    end() { finish(); },
    /** Collect a star as if touched (id or record). */
    collect(idOrStar) { const s = typeof idOrStar === 'string' ? stars.find((q) => q.id === idOrStar) : idOrStar; return collect(s); },
    respawnAll() { for (const s of stars) if (s.taken) s.respawnT = 0; },
    /** Which look the pickups wear: 'crystal' (the Sugar Star) | 'comet' | 'konpeito'. */
    get look() { return lookName; },
    looks: Object.keys(LOOKS),
    /** Swap the look (views, tests, the critic). Returns the look in play. */
    setLook(name) {
      if (!looks[name]) return lookName;
      lookName = name; look = LOOKS[name];
      starMesh.geometry = looks[name].geo;
      lookColours();
      burstO.color = look.burst; dripO.color = look.burst;
      if (hud.ico) hud.ico.innerHTML = HUD_ICON[name];
      return lookName;
    },
    nearest(x, z) {
      let best = null, bd = Infinity;
      for (const s of stars) { if (s.taken) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
      return best;
    },
    stage,
    update,
  };
  return api;
}
