// CANDY FLOWER BEDS — the thing the butterflies were missing.
//
// Round 2's butterflies landed on `world.height(x,z) + 0.22`, i.e. flat on the
// licorice road, and the frames showed exactly that: little foil lozenges lying
// on the path like dropped sweet wrappers. A butterfly only reads as alive when
// it is either airborne or standing on a FLOWER — so the flowers now exist.
//
// 13 beds on path shoulders and landmark clearings (the only open sightlines on
// this island), 4–6 blossoms each, all merged into the creature-props mesh —
// one draw call for every flower on Candyland. butterflies.js loops over the
// bed centres and perches on the blossom heads; nothing else may be landed on.
import * as THREE from 'three';
import { rng, hash } from '../../../core/util.js';
import { part, TAU, walkable } from './common.js';

// Beds sit on path shoulders, landmark cores and riverbanks — the open ground.
// Anywhere else the giant lollipops would swallow them.
export const BEDS = [
  [-116, -24], [-112, -37], [-110, -47], [-119, -55],   // Lollipop Meadow lane
  [-88, -18], [-85, -4],                                 // The Great Cupcake clearing
  [-196, -17], [-208, -33], [-186, 1],                   // Gummy Forest glades + forest path
  [-147, 32], [-132, 40],                                // Gumdrop Village allotments
  [-121, 31], [-104, 50],                                // syrup-river banks + delta road
];

// Candy-flower petals: the same five-hue wrapper family the butterflies wear,
// one step brighter, so a perched butterfly sits on a colour and not in it.
const PETAL = [0xff6fae, 0xffd24a, 0x6fd0ff, 0x7ce9b4, 0xb98cff, 0xff9a5c];
const STEM = 0x4f9e5c, LEAF = 0x63c273, CORE = 0xffe9a8;

let _cache = null;
/** [{ x, z, y, rr, flowers: [{ x, z, y, h, hue, s }] }] — memoised, seeded. */
export function flowerBeds(world) {
  if (_cache) return _cache;
  const r = rng(hash('candy-flowerbeds'));
  const beds = [];
  for (const [cx, cz] of BEDS) {
    let ax = cx, az = cz;
    for (let k = 0; k < 26 && !walkable(world, ax, az, 1.2, 0.9); k++) {
      ax = cx + (r() - 0.5) * 9; az = cz + (r() - 0.5) * 9;
    }
    const bed = { x: ax, z: az, y: world.height(ax, az), rr: 1.7 + r() * 1.0, flowers: [] };
    const n = 4 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      let fx = 0, fz = 0, ok = false;
      for (let tries = 0; tries < 20 && !ok; tries++) {
        const a = r() * TAU, rr = 0.7 + r() * bed.rr;
        fx = ax + Math.cos(a) * rr; fz = az + Math.sin(a) * rr;
        ok = walkable(world, fx, fz, 1.4, 0.9);
      }
      if (!ok) continue;
      const f = {
        x: fx, z: fz, y: world.height(fx, fz),
        h: 1.15 + r() * 0.8,                    // blossom head height over the ground
        tilt: (r() - 0.5) * 0.28, spin: r() * TAU,
        hue: PETAL[Math.floor(r() * PETAL.length)], s: 0.86 + r() * 0.44,
      };
      // the perch: the exact point a butterfly stands on, baked once so the
      // flight loop never does trig or allocates for it
      f.tx = Math.sin(f.tilt) * f.h * 0.35;
      f.px = f.x + f.tx; f.py = f.y + f.h + 0.13; f.pz = f.z;
      bed.flowers.push(f);
    }
    if (bed.flowers.length) beds.push(bed);
  }
  _cache = beds;
  return beds;
}

/** Merge-ready parts for every blossom — props.js folds these into its one mesh. */
export function flowerParts(world) {
  const out = [];
  for (const bed of flowerBeds(world)) {
    for (const f of bed.flowers) {
      const s = f.s, tx = f.tx;
      // stem (open cylinder — a flower is seen from above, the caps never show)
      out.push(part(new THREE.CylinderGeometry(0.036 * s, 0.058 * s, f.h, 5, 1, true),
        { pos: [f.x + tx * 0.5, f.y + f.h * 0.5, f.z], rot: [0, 0, -f.tilt], color: STEM }));
      // two leaves low on the stem — they stop it reading as a wire
      for (const sgn of [-1, 1]) {
        out.push(part(new THREE.SphereGeometry(1, 4, 2), {
          pos: [f.x + sgn * 0.17 * s, f.y + f.h * 0.4, f.z + sgn * 0.07 * s],
          rot: [0, sgn * 0.7, 0], scale: [0.21 * s, 0.035 * s, 0.11 * s], color: LEAF,
        }));
      }
      // five petals lying nearly flat around a pollen boss: a landing pad a
      // butterfly can visibly stand ON, at 1.1–2 u up where the loops are
      for (let k = 0; k < 5; k++) {
        const a = f.spin + (k / 5) * TAU;
        out.push(part(new THREE.SphereGeometry(1, 4, 2), {
          pos: [f.x + tx + Math.cos(a) * 0.20 * s, f.y + f.h + 0.02, f.z + Math.sin(a) * 0.20 * s],
          rot: [0, -a, 0], scale: [0.20 * s, 0.05 * s, 0.125 * s], color: f.hue,
        }));
      }
      out.push(part(new THREE.SphereGeometry(1, 5, 2), {
        pos: [f.x + tx, f.y + f.h + 0.055, f.z], scale: [0.115 * s, 0.075 * s, 0.115 * s], color: CORE,
      }));
    }
  }
  return out;
}

// The perch point lives on the flower itself as (px, py, pz) — see flowerBeds.
// Nothing in the flight loop allocates.
