// THE GREAT CUPCAKE — landmark giant_cupcake (-88, -18). Thirty units of
// cupcake: a stepped wafer plinth, a fluted wrapper, a piped frosting swirl
// with a readable spiral ridge, a cherry at 30 units, and ONE ENORMOUS BITE
// out of the north side that you can walk straight into.
//
// SILHOUETTE FIRST. Everything here is sized for the game camera (distance 31,
// FOV 30) seen from the candy_cupcake path to the south-east: the plinth gives
// it a base to stand on, the swirl gives it a spiral, the cherry gives it a
// full stop, and a 28-unit clear apron (claimed against vegetation) means you
// actually see all three at once instead of a pink wall behind a lollipop.
import { C, SPRINKLE, doorway, windowPane, signpost, lamppost, softGlow, arcCyl, plaque } from './kit.js';
import * as IN from './interiors.js';
import { railRun, caneStyle, arcPts, landingFloor, gateSolid, GATE } from './rails.js';

const X = -88, Z = -18;
// The two ways in, as WORLD angles (atan2(dz, dx)): +Z is south, −Z is north,
// +X is east.
//
// THE BITE FACES EAST-SOUTH-EAST (0.30 rad), not north. Round 3 of review:
// "a flat lavender wall and olive decking in near-black shadow at midday, no
// crater visible". Both halves of that are the same bug — the bite used to face
// due NORTH, which is the one bearing on this island that never sees the sun
// AND is never in front of the default iso camera (azimuth π/4 ⇒ the lens sits
// to the SOUTH-EAST looking north-west). Everything in the mouth was therefore
// rendering as flat ambient. Turned to 0.30 rad the crater faces the morning
// sun, the meadow path and the camera all at once.
const DOOR_A = Math.PI / 2, BITE_A = 0.30;
const DOOR_HW = 0.28, BITE_HW = 0.60;          // half-widths, radians
// THE FRONT DOOR (Contract O). Clear opening DOOR_W × DOOR_H above the sill:
// "much too big" is the joke, so it is the biggest door in Candyland. The
// wrapper is CUT for it (DOOR_CW either side of DOOR_A, up to the lintel), the
// chocolate reveal lines the cut, and the jamb colliders stop exactly on the
// reveal's inner faces — the ring's own gap was 5 u wide behind a 1.6 u door.
const DOOR_W = 1.9, DOOR_H = 2.9, DOOR_CW = 0.18;
const REVEAL_Z0 = 5.7, REVEAL_Z1 = 6.9;          // the reveal's depth, as offsets from Z

export function buildCupcake(A) {
  const { B, world } = A;
  const y = world.height(X, Z);
  const r = A.rng('cupcake');
  A.mark('great_cupcake', X, y, Z);

  const WR_B = 6.2, WR_T = 8.4, WR_H = 10.0;      // wrapper
  const CAKE_Y = y + 9.8, CAKE_H = 3.4;
  const BAL_Y = y + 10.4, BAL_R0 = 8.4, BAL_R1 = 10.5;
  const RAMP_R0 = 10.8, RAMP_R1 = 13.2;
  const FLOOR_Y = y + 0.12, UPPER_Y = y + 9.9, ROOM_R = 6.25;
  const PLINTH = [[11.9, 0.62], [10.0, 0.62], [8.2, 0.62]];   // stepped wafer base

  // The cupcake is ENTERABLE and two storeys: the wrapper + cake shell ghosts
  // while you are inside, the frosting cap hides, and the room (hall, spiral
  // frosting staircase, mezzanine bedroom) only exists while you are in it.
  const E = A.building({
    id: 'great_cupcake', name: 'the Great Cupcake', x: X, z: Z,
    radius: ROOM_R + 0.5, rot: 0, floorY: FLOOR_Y, pad: 0.2, tall: true, flat: true,
    // 12% shell, not the default 28%. From the mezzanine the game camera looks
    // down through the cake's lid, the wrapper AND the balcony at once: three
    // stacked 28% ghosts read as a glass drum sealed over the stairwell and
    // double-imaged every rail behind it (rails critique, round 3). The wafer
    // panelling inside is the room's wall; the shell only has to whisper.
    ghost: 0.88,
  });
  const W = E.wall, R = E.roof;
  const inGap = (a, c, hw) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))) < hw;
  const bitten = (a) => inGap(a, BITE_A, BITE_HW);

  // ── stepped wafer plinth ──────────────────────────────────────────────────
  // Three wafer treads, each notched at the door AND at the bite, so the base
  // reads as a stepped plinth from the path and as a bitten one from the north,
  // with a processional slot cut down to ground level at each way in.
  {
    // ANNULAR treads, built from wedge boxes — not stacked discs. A disc of
    // radius 8.2 would fill the ground floor of the hall with 1.9 units of
    // wafer and bury the front door in it, and a walkable disc would let the
    // player stroll out across the door notch on thin air.
    // Two arcs: past the door round to the bite, and past the bite back to the door.
    const SEGS = [[DOOR_A + DOOR_HW, BITE_A + Math.PI * 2 - BITE_HW], [BITE_A + BITE_HW, DOOR_A - DOOR_HW]];
    const R_IN = WR_B + 0.1;                       // clear of the wrapper's foot
    let top = y;
    PLINTH.forEach(([rad, hh], k) => {
      top += hh;
      const r0 = k === PLINTH.length - 1 ? R_IN : PLINTH[k + 1][0];
      const rm = (r0 + rad) / 2;
      for (const [a0, a1] of SEGS) {
        const n = Math.max(3, Math.round(((a1 - a0) * rm) / 1.2));
        for (let i = 0; i < n; i++) {
          const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
          B.waffleBox(rad - r0, top - y, ((a1 - a0) / n) * rm + 0.3, {
            at: [X + Math.cos(a) * rm, y + (top - y) / 2, Z + Math.sin(a) * rm], rot: [0, -a, 0],
            color: (i + k) % 2 ? C.waferPale : C.wafer,
          });
        }
        // an icing nosing along the front edge of the tread
        const nn = Math.max(4, Math.round(((a1 - a0) * rad) / 1.15));
        for (let i = 0; i <= nn; i++) {
          const a = a0 + ((a1 - a0) * i) / nn;
          B.sph('icing', 0.3, 5, 4, { at: [X + Math.cos(a) * (rad - 0.06), top, Z + Math.sin(a) * (rad - 0.06)], scale: [1, 0.7, 1], color: k % 2 ? C.icingPink : C.icing });
        }
        // Each tread's walk runs in to where the tread above it ends (rad − 0.1
        // of THAT tread): inset at both edges they left a 0.15-u crack between
        // treads, all the way round, and a walker who followed one dropped
        // 1.2–1.9 to the lawn inside the plinth (Contract O re-audit). The top
        // tread still stops short of the wrapper.
        A.deckArcRing(X, Z, k === PLINTH.length - 1 ? r0 + 0.05 : r0 - 0.1, rad - 0.1, a0 - 0.03, a1 + 0.03, top);
      }
    });
    for (let i = 0; i < 30; i++) {          // sprinkles over the treads (instanced, ~free)
      const a = r.range(0, 6.283);
      if (bitten(a)) continue;
      const rad = r.range(6.7, 11.5);
      const step = rad > 10.0 ? 1 : (rad > 8.2 ? 2 : 3);
      A.inst.sprinkles.push({
        x: X + Math.cos(a) * rad, y: y + step * 0.62 + 0.12, z: Z + Math.sin(a) * rad,
        rx: 1.57, ry: r.range(0, 6.28), rz: r.range(0, 3), color: SPRINKLE[i % SPRINKLE.length],
      });
    }
  }

  // ── wrapper: a fluted paper cup, with a wedge bitten out of the north ─────
  {
    const a0 = BITE_A + BITE_HW, a1 = BITE_A + Math.PI * 2 - BITE_HW;
    // ...and CUT for the front door: the two long arcs either side of it, and
    // the piece of wrapper above the lintel (the flare puts the paper in front
    // of the door's upper half, so an uncut wrapper buried the door in pink)
    const hc = Math.max(0, world.height(X, Z + WR_B + 0.35) - y) + DOOR_H + 0.5;
    arcCyl(W, 'matte', WR_T, WR_B, WR_H, 34, a0, DOOR_A - DOOR_CW, { at: [X, y + WR_H / 2, Z], color: C.icingPink, open: true });
    arcCyl(W, 'matte', WR_T, WR_B, WR_H, 34, DOOR_A + DOOR_CW, a1, { at: [X, y + WR_H / 2, Z], color: C.icingPink, open: true });
    const rCut = WR_B + (WR_T - WR_B) * (hc / WR_H);
    arcCyl(W, 'matte', WR_T, rCut, WR_H - hc, 34, DOOR_A - DOOR_CW, DOOR_A + DOOR_CW, { at: [X, y + hc + (WR_H - hc) / 2, Z], color: C.icingPink, open: true });
    // The two torn edges of the paper, in near-white, plus a scalloped icing lip
    // running up the OUTSIDE of each. They are what frames the mouth from the
    // path: the void itself is permanently in the cupcake's own shadow, so the
    // thing that has to read at distance is the bright edge around it.
    for (const a of [a0, a1]) {
      W.box('matte', 3.4, WR_H, 0.42, {
        at: [X + Math.cos(a) * (WR_B + 1.3), y + WR_H / 2, Z + Math.sin(a) * (WR_B + 1.3)],
        rot: [0, -a, 0], color: 0xfff0f6,
      });
      for (let i = 0; i <= 9; i++) {
        const rr = WR_B + (WR_T - WR_B) * (i / 9) + 0.28;
        W.sph('icing', 0.46 + 0.14 * Math.abs(Math.sin(i * 2.2)), 6, 5, {
          at: [X + Math.cos(a) * rr, y + 0.3 + (WR_H - 0.6) * (i / 9), Z + Math.sin(a) * rr],
          rot: [0, -a, 0], scale: [1, 1.15, 0.7], color: i % 2 ? C.icing : C.icingPink,
        });
      }
    }
  }
  // ── THE BITE: a three-storey crater ───────────────────────────────────────
  // Somebody took a bite out of a building. What is left is a CONCAVE SCOOP —
  // widest and deepest at the top, where the teeth went in, tapering down to a
  // walk-in mouth at ground level — with the cake's own strata cut open across
  // the whole face of it: pale sponge, two seams of raspberry jam, a crumb
  // crust at the bottom. Ten units of it, top to bottom: three storeys.
  //
  // It is drawn on `glowWarm` (faintly emissive by day, properly lit at night)
  // and lit by its own warm PointLight, because even facing east-south-east the
  // inside of a scoop is a shadowed hollow and albedo alone will not carry it.
  const CR = { NA: 17, NL: 12, DEPTH: 3.9, doorU: 0.47, doorV: 0.30 };
  const RIMR = (v) => WR_B + (WR_T - WR_B) * v;                    // the wrapper's own profile
  // Depth: a cosine hump across the mouth, opening out toward the rim, floored
  // at 4.5 so the scoop never eats into the spiral staircase inside. Deep at the
  // top ⇒ the cake and the balcony above it overhang the mouth, which is the one
  // read that says BITE rather than DOORWAY.
  // A PLATEAU across the mouth, not a cosine: a cosine dish blends smoothly back
  // into the wrapper at each edge, which reads as a bay window. Teeth cut
  // STRAIGHT IN, so the floor of the scoop is flat over the middle 62% and the
  // last 38% is a near-vertical wall of cut sponge — and it is those two walls,
  // catching the light at a different angle from the floor, that make the hole
  // read as three-dimensional at thirty units.
  const CRAD = (u, v) => {
    const t = Math.max(0, Math.min(1, (1 - Math.abs(u)) / 0.38));
    return Math.max(4.5, RIMR(v) - CR.DEPTH * (t * t * (3 - 2 * t)) * (0.26 + 0.74 * Math.min(1, v * 1.3)));
  };
  {
    const { NA, NL } = CR;
    // The cut face of the cake, band by band. Bands are DELIBERATELY uneven —
    // evenly spaced stripes on a curved wall read as a wrapper, not as a cake
    // sliced open — and there is a thin toffee lamina between the two jam seams
    // to break the pale sponge up.
    const band = (v) => (
      v < 0.10 ? 0xc9884a :          // baked crust at the foot
      v < 0.26 ? 0xefd6a2 :          // dense sponge
      v < 0.33 ? 0xdd2440 :          // ── raspberry jam seam ──
      v < 0.50 ? 0xfae7bd :          // light sponge
      v < 0.55 ? 0xb8863f :          // a lamina of burnt toffee
      v < 0.70 ? 0xfff2da :          // light sponge
      v < 0.77 ? 0xc9142f :          // ── second jam seam ──
      v < 0.93 ? 0xf7e6c4 : 0xfffaf0 // crumb, and the pale top layer
    );
    const jamAt = (v) => (v >= 0.26 && v < 0.33) || (v >= 0.70 && v < 0.77);
    for (let j = 0; j < NL; j++) {
      const v = (j + 0.5) / NL, hh = WR_H / NL + 0.16;
      for (let i = 0; i < NA; i++) {
        const u = -1 + (2 * (i + 0.5)) / NA;
        if (Math.abs(u) < CR.doorU && v < CR.doorV) continue;       // the walk-in mouth
        // the seams UNDULATE across the mouth. Dead-level bands on a curved wall
        // read as a sweet wrapper; a seam that wanders reads as a cut through
        // something that was baked
        const vv = v + 0.030 * Math.sin(u * 4.1 + j * 0.35);
        const col = band(vv), jam = jamAt(vv);
        const a = BITE_A + u * BITE_HW;
        const rr = CRAD(u, v);
        // a solid wedge of cake from the cut face out to the wrapper: the bite
        // is a volume removed, not a sheet of wallpaper over a hole
        const th = Math.max(0.55, RIMR(v) + 0.6 - rr);
        const wdt = ((2 * BITE_HW) / NA) * rr + 0.26;
        W.box(jam ? 'matteFlat' : 'glowWarm', th, hh, wdt, {
          at: [X + Math.cos(a) * (rr + th / 2), y + WR_H * v, Z + Math.sin(a) * (rr + th / 2)],
          rot: [0, -a, 0], color: col,
        });
        // crumb: a scatter of half-buried lumps on the cut face, so it reads as
        // torn sponge and not as tiling
        if ((i + j * 3) % 3 === 0) {
          W.ico(jam ? 'matteFlat' : 'glowWarm', 0.30 + 0.22 * ((i * 7 + j) % 3), 0, {
            at: [X + Math.cos(a) * (rr - 0.1), y + WR_H * v + 0.2, Z + Math.sin(a) * (rr - 0.1)],
            rot: [i * 0.7, j * 1.1, 0.4], color: col,
          });
        }
      }
      // the two torn side walls of the crater, so you never see its edge-on
      // zero thickness from the side
      for (const s of [-1, 1]) {
        const a = BITE_A + s * BITE_HW;
        const r0 = CRAD(s, v), r1 = RIMR(v) + 0.6;
        W.box('glowWarm', r1 - r0 + 1.6, hh, 0.5, {
          at: [X + Math.cos(a) * ((r0 + r1) / 2 - 0.8), y + WR_H * v, Z + Math.sin(a) * ((r0 + r1) / 2 - 0.8)],
          rot: [0, -a, 0], color: band(v),
        });
      }
    }

    // ── the jam runs ─────────────────────────────────────────────────────────
    // A seam of jam cut open does not sit still: it beads at the cut and runs
    // down the sponge below it. Ten runs under each seam, different lengths,
    // is what turns a red band into something that was recently food.
    for (const sv of [0.295, 0.735]) {
      for (let i = 0; i < 11; i++) {
        const u = -0.94 + (1.88 * i) / 10, a = BITE_A + u * BITE_HW;
        const run = 0.5 + 1.9 * Math.abs(Math.sin(i * 2.31 + sv * 9));
        const rr = CRAD(u, sv - 0.02) - 0.12;
        W.sph('matteFlat', 0.34, 6, 4, {
          at: [X + Math.cos(a) * rr, y + WR_H * sv - run * 0.42, Z + Math.sin(a) * rr],
          rot: [0, -a, 0], scale: [0.5, 0.35 + run * 0.95, 0.75], color: 0xcf1b36,
        });
        W.sph('gloss', 0.26, 6, 4, {
          at: [X + Math.cos(a) * (rr - 0.08), y + WR_H * sv - run * 0.86, Z + Math.sin(a) * (rr - 0.08)],
          scale: [0.9, 1.05, 0.9], color: 0xe8304c,
        });
      }
    }

    // ── TOOTH SCALLOPS all the way round the rim of the crater ───────────────
    // The void itself is a hollow; what has to read at thirty units is the
    // bright bitten EDGE around it. Up one side, across the top, down the other.
    const rimPt = (t) => {
      // t = 0..3 : 0–1 up the left edge, 1–2 across the top, 2–3 down the right
      if (t <= 1) return { u: -1, v: t };
      if (t <= 2) return { u: -1 + (t - 1) * 2, v: 1 };
      return { u: 1, v: 3 - t };
    };
    const NS = 34;
    for (let i = 0; i <= NS; i++) {
      const t = (i / NS) * 3;
      const { u, v } = rimPt(t);
      const top = t > 1 && t < 2;                      // the row of teeth across the lip
      const a = BITE_A + u * BITE_HW;
      const wob = 0.42 + 0.30 * Math.abs(Math.sin(i * 2.05));
      const rr = RIMR(v) + (top ? 0.05 : 0.35);
      const sz = (0.55 + wob * 0.6) * (top ? 1.12 : 1);
      W.sph('icing', sz, 7, 5, {
        at: [X + Math.cos(a) * rr, y + WR_H * Math.min(v, 0.995) - (top ? wob * 0.9 : 0), Z + Math.sin(a) * rr],
        rot: [0, -a, 0], scale: [0.85, 1.05, 1], color: i % 2 ? 0xfff4fa : C.icingPink,
      });
      // and a second, shorter row of sponge teeth just inside the icing ones
      if (top && i % 2 === 0) {
        W.sph('glowWarm', sz * 0.8, 7, 5, {
          at: [X + Math.cos(a) * (rr - 1.1), y + WR_H - wob * 1.9, Z + Math.sin(a) * (rr - 1.1)],
          rot: [0, -a, 0], scale: [0.9, 1.2, 1], color: 0xf7e6c4,
        });
      }
    }

    // ── the walk-in mouth: jambs and a lintel ────────────────────────────────
    const dV = CR.doorV, dRad = CRAD(0, dV * 0.5);
    for (const s of [-1, 1]) {
      const a = BITE_A + s * CR.doorU * BITE_HW;
      W.box('glowWarm', 1.1, WR_H * dV, 0.5, {
        at: [X + Math.cos(a) * (dRad + 0.55), y + (WR_H * dV) / 2, Z + Math.sin(a) * (dRad + 0.55)],
        rot: [0, -a, 0], color: 0xf0d7a4,
      });
    }
    W.sph('icing', 1.6, 9, 6, {
      at: [X + Math.cos(BITE_A) * (dRad + 0.2), y + WR_H * dV + 0.15, Z + Math.sin(BITE_A) * (dRad + 0.2)],
      rot: [0, -BITE_A, 0], scale: [0.4, 0.42, 1.6], color: C.icingPink,
    });

    // ── colliders: the cut face, with the mouth left open ────────────────────
    for (let i = 0; i < NA; i++) {
      const u = -1 + (2 * (i + 0.5)) / NA;
      if (Math.abs(u) < CR.doorU) continue;
      const a = BITE_A + u * BITE_HW;
      const rr = CRAD(u, 0.14);
      A.collideBox(X + Math.cos(a) * rr, Z + Math.sin(a) * rr, 0.7, ((2 * BITE_HW) / NA) * rr + 0.3, -a, y + WR_H);
    }
    // the back of the mouth, three units in, so you cannot walk through the cake
    {
      const rr = CRAD(0, 0.1) - 0.3;
      A.collideBox(X + Math.cos(BITE_A) * rr, Z + Math.sin(BITE_A) * rr, 0.6, 2 * CR.doorU * BITE_HW * rr + 0.4, -BITE_A, y + WR_H);
    }

    // ── the warm light in the hollow ─────────────────────────────────────────
    // Not on A.light(): those are the LANTERNS and the day/night loop puts them
    // out at dawn. A bite in permanent self-shadow needs light at MIDDAY, so
    // this one burns constantly (the village gives up a lamp to pay for it).
    const glx = X + Math.cos(BITE_A) * (CRAD(0, 0.55) + 2.0);
    const glz = Z + Math.sin(BITE_A) * (CRAD(0, 0.55) + 2.0);
    // a constant anchor of the shared lamp pool (always lit, so it holds a
    // slot whenever its light can reach the frame) — both tiers
    A.lampPool.add({ x: glx, y: y + 5.4, z: glz, color: 0xffca82, dist: 21, decay: 2 }).level = 58;
    // and a hot ember line along the lower jam seam, so the glow has a source
    for (let i = 0; i <= 6; i++) {
      const u = -0.86 + (1.72 * i) / 6, a = BITE_A + u * BITE_HW;
      const rr = CRAD(u, 0.36);
      W.sph('glowWarm', 0.3, 7, 5, { at: [X + Math.cos(a) * (rr - 0.1), y + WR_H * 0.36, Z + Math.sin(a) * (rr - 0.1)], scale: [1, 0.7, 1], color: 0xffd9a0 });
    }
    // rubble heaped against the foot of the cut face — it is what fell out of
    // the hole, and it is the cheapest depth cue in the scene: a pile of lumps
    // at the bottom of a wall tells the eye the wall is set back
    for (let i = 0; i < 16; i++) {
      const u = -0.88 + (1.76 * (i % 8)) / 7 + (i > 7 ? 0.1 : 0);
      const a = BITE_A + u * BITE_HW;
      const rad = CRAD(u, 0.06) + 0.5 + (i > 7 ? 1.5 : 0) + (i % 3) * 0.4;
      const px = X + Math.cos(a) * rad, pz = Z + Math.sin(a) * rad;
      const s = 0.42 + 0.5 * Math.abs(Math.sin(i * 1.83));
      B.ico('matteFlat', s, 0, {
        at: [px, world.height(px, pz) + s * 0.5, pz], rot: [i * 0.7, i * 1.3, i * 0.4],
        scale: [1.25, 0.85, 1.1], color: i % 4 === 1 ? 0xd42038 : (i % 2 ? 0xefd6a2 : 0xc9884a),
      });
    }
  }

  const tilt = Math.atan2(WR_T - WR_B, WR_H);
  const NRIB = 30;
  // Contract O: the pleats that fall inside the front-door cut (i = 7, 8 at
  // DOOR_A ∓ 0.105) used to stand full height IN the opening, sill to head and
  // with no collider, so the drawn clear width was 0.8 behind a 1.9 collider
  // gap. They keep the pleat rhythm only on the wrapper piece over the lintel
  // (from the cut height up, the same hc as the wrapper block above).
  const hcRib = Math.max(0, world.height(X, Z + WR_B + 0.35) - y) + DOOR_H + 0.5;
  for (let i = 0; i < NRIB; i++) {
    const a = (i / NRIB) * Math.PI * 2;
    if (bitten(a)) continue;
    const rm = (WR_B + WR_T) / 2 + 0.18;
    if (inGap(a, DOOR_A, DOOR_CW + 0.07)) {
      const h0 = hcRib + 0.08, h1 = WR_H / 2 + (WR_H + 0.2) * Math.cos(tilt) / 2, hm = (h0 + h1) / 2;
      const rr = rm + (hm - WR_H / 2) * Math.tan(tilt);
      W.cyl('matte', 0.42, 0.3 + 0.12 * (h0 / WR_H), (h1 - h0) / Math.cos(tilt), 5, {
        at: [X + Math.cos(a) * rr, y + hm, Z + Math.sin(a) * rr],
        rot: [0, -a, -tilt], color: i % 2 ? 0xfff3f8 : C.pink,
      });
      continue;
    }
    W.cyl('matte', 0.42, 0.3, WR_H + 0.2, 5, {
      at: [X + Math.cos(a) * rm, y + WR_H / 2, Z + Math.sin(a) * rm],
      rot: [0, -a, -tilt], color: i % 2 ? 0xfff3f8 : C.pink,
    });
  }
  // wrapper rim — a PARTIAL torus. Laid flat by rot.x=π/2 it sweeps from world
  // angle −rot.y, so yawing by −a0 starts the arc at the edge of the bite.
  W.tor('gloss', WR_T + 0.15, 0.3, 7, 28, {
    at: [X, y + WR_H, Z], rot: [Math.PI / 2, -(BITE_A + BITE_HW), 0],
    arc: Math.PI * 2 - BITE_HW * 2, color: C.syrup,
  });

  // ── cake ──────────────────────────────────────────────────────────────────
  // The sponge stays WHOLE. The bite eats the wrapper right up to the rim, and
  // the cake + balcony above it become the overhanging lip of the mouth — which
  // is what makes the void read as a bite rather than as a doorway, without
  // notching a balcony the player is supposed to be able to walk all the way round.
  // Its LID is on the roof builder: from inside, the game camera looks down
  // through the cake's top at the whole room, and a ghosted 9-u disc over the
  // mezzanine sealed the stairwell and every rail round it under glass. The roof
  // hides while you are inside; outside the three pieces are the same closed
  // drum as before (the underside faces down, so only a low camera sees it).
  W.cyl('matteFlat', 9.3, 8.2, CAKE_H, 26, { at: [X, CAKE_Y + CAKE_H / 2, Z], color: C.chocMilk, open: true });
  W.disc('matteFlat', 8.2, 26, { at: [X, CAKE_Y, Z], rot: [Math.PI / 2, -Math.PI / 2, 0], color: C.chocMilk });
  R.disc('matteFlat', 9.3, 26, { at: [X, CAKE_Y + CAKE_H, Z], rot: [-Math.PI / 2, Math.PI / 2, 0], color: C.chocMilk });
  for (let i = 0; i < 18; i++) {   // crumb bumps
    const a = r.range(0, 6.283), h = r.range(0.2, 0.85);
    W.ico('matteFlat', h, 0, { at: [X + Math.cos(a) * 9.1, CAKE_Y + r.range(0.4, CAKE_H - 0.3), Z + Math.sin(a) * 9.1], color: r.chance(0.5) ? C.chocMilk : 0x8f5a30 });
  }
  // (the scalloped tooth marks round the mouth are drawn with the crater above)

  // ── frosting swirl ────────────────────────────────────────────────────────
  // A PIPED rosette: 5 turns from the cake rim in to the point, rising on a
  // t^1.28 curve so it domes instead of coning, 13.4 units tall so the cherry
  // lands at 30. TWO things make the SPIRAL read from the path, which is the
  // whole job: the ribbon alternates tone HALF-TURN BY HALF-TURN (a helix of
  // bands, not a smooth gradient), and a deeper-pink ridge bead runs along the
  // ribbon's outer lip so the spiral has a drawn edge instead of a soft seam.
  const TOP = CAKE_Y + CAKE_H;
  // 78 blobs, not 94, at 7 × 5 instead of 8 × 6: the crater below eats about
  // eight thousand triangles and the swirl is where they come from. At the game
  // camera the ribbon is identical; the saving is a fifth of the whole cupcake.
  const N = 78, SW_H = 13.4, TURNS = 5.0;
  const BAND_A = 0xffb2d6, BAND_B = 0xfff4f9, RIDGE = 0xf0609f;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = 0.6 + t * Math.PI * 2 * TURNS;
    const rad = 8.1 * Math.pow(1 - t, 0.58) + 0.34;
    const yy = TOP - 0.9 + SW_H * Math.pow(t, 1.28);
    const blob = 1.55 * (1 - 0.44 * t) + 0.3;
    R.sph('icing', blob, 7, 5, {
      at: [X + Math.cos(a) * rad, yy, Z + Math.sin(a) * rad], scale: [1, 0.84, 1],
      color: Math.floor(t * TURNS) % 2 ? BAND_A : BAND_B,
    });
    if (i % 2 === 0) {           // the spiral's lip — this is the edge you see
      R.sph('icing', blob * 0.46, 6, 4, {
        at: [X + Math.cos(a) * (rad + blob * 0.62), yy + blob * 0.3, Z + Math.sin(a) * (rad + blob * 0.62)],
        scale: [1, 0.78, 1], color: RIDGE,
      });
    }
    if (i % 3 === 0) {
      A.inst.sprinkles.push({
        x: X + Math.cos(a) * (rad + r.range(-0.7, 0.7)), y: yy + blob * 0.78, z: Z + Math.sin(a) * (rad + r.range(-0.7, 0.7)),
        rx: r.range(0, 3), ry: r.range(0, 6.28), rz: r.range(0, 3), color: SPRINKLE[i % SPRINKLE.length],
      });
    }
  }
  // a fat collar of frosting oozing over the cake rim, so no bare cake shows —
  // and over the bite it hangs down into the void like a torn curtain
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const drip = 0.5 + 0.5 * Math.abs(Math.sin(i * 1.9));
    const over = bitten(a) ? 1.0 : 0;
    R.sph('icing', 1.05, 8, 6, {
      at: [X + Math.cos(a) * 8.95, TOP - 0.5 - drip * 0.7 - over, Z + Math.sin(a) * 8.95],
      scale: [1, 0.75 + drip * 1.1 + over * 0.5, 1], color: over ? 0xffc2dd : 0xffa8cc,
    });
  }
  // ── the cherry, at thirty units ───────────────────────────────────────────
  const CH = TOP - 0.9 + SW_H + 2.05;
  R.sph('gloss', 2.6, 16, 12, { at: [X, CH, Z], color: 0xf4123c });
  R.sph('gloss', 0.8, 8, 6, { at: [X - 0.95, CH + 1.85, Z + 0.7], color: 0xff90ac });
  R.tor('gloss', 1.02, 0.2, 6, 14, { at: [X, CH + 2.3, Z], rot: [Math.PI / 2, 0, 0], color: 0xc4072a });
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    R.cyl('matte', 0.2, 0.22, 0.72, 6, { at: [X + t * 1.7, CH + 2.5 + t * 1.9 - t * t * 0.7, Z], rot: [0, 0, -0.5 - t * 0.5], color: 0x2f6b2a });
  }
  R.ico('matteFlat', 0.9, 0, { at: [X + 2.2, CH + 4.5, Z + 0.25], scale: [1.7, 0.3, 1.1], rot: [0, 0.6, 0.3], color: 0x3f8f3a });
  // a beacon on the stalk: the tallest thing for a hundred units deserves one
  R.sph('glowWarm', 0.36, 8, 6, { at: [X + 1.95, CH + 4.25, Z], color: 0xffd9a0 });
  softGlow(R, X + 1.95, CH + 4.25, Z, 3.0);
  A.mark('cupcake_cherry', X, CH, Z);
  A.mark('cupcake_bite', X + Math.cos(BITE_A) * 8.4, y, Z + Math.sin(BITE_A) * 8.4);

  // ── balcony ring on the wrapper rim ───────────────────────────────────────
  // On the SHELL builder: from inside the cupcake this ring is a lid straight
  // across the camera's sight line, so it has to ghost with the rest of the shell.
  // NOTCHED over the bite. It used to be a solid disc, which meant the mouth of
  // the bite — its scalloped teeth, its pale hollow, the frosting drooling into
  // it — lived permanently under an overhanging lid, in the cupcake's own cast
  // shadow, invisible from every angle the game camera can reach. Cut the ring
  // and the iso camera looks straight down into it.
  {
    const bA0 = BITE_A + BITE_HW + 0.05, bA1 = BITE_A + Math.PI * 2 - BITE_HW - 0.05;
    const r0 = BAL_R0 - 0.2, rm = (r0 + BAL_R1) / 2, n = Math.round(((bA1 - bA0) * rm) / 1.25);
    for (let i = 0; i < n; i++) {
      const a = bA0 + ((bA1 - bA0) * (i + 0.5)) / n;
      W.waffleBox(BAL_R1 - r0, 0.3, ((bA1 - bA0) / n) * rm + 0.35, {
        at: [X + Math.cos(a) * rm, BAL_Y, Z + Math.sin(a) * rm], rot: [0, -a, 0], color: i % 2 ? C.waferPale : C.wafer,
      });
    }
    A.deckArcRing(X, Z, BAL_R0, BAL_R1 - 0.3, bA0 + 0.03, bA1 - 0.03, BAL_Y + 0.2);
    // the railing (and the rails across the two cut ends) is built with the
    // ramp's, below — cupcakeRails() — so the three meet where they should
    for (let i = 0; i < 12; i++) {                                 // icing corbels
      const a = (i / 12) * Math.PI * 2 + 0.26;
      if (bitten(a)) continue;
      W.sph('icing', 0.85, 8, 6, { at: [X + Math.cos(a) * (BAL_R1 - 0.9), BAL_Y - 0.45, Z + Math.sin(a) * (BAL_R1 - 0.9)], rot: [0, -a, 0], scale: [0.6, 1.1, 1.5], color: C.icing });
    }
  }

  // ── spiral wafer ramp up to the balcony ───────────────────────────────────
  // 1.28 turns, not 1.72: at 1.72 the last stretch of ramp swung round at radius
  // 12 straight across the FRONT of the bite and the landing hung over the
  // mouth — from the approach the crater was seen through a wafer trellis. It
  // now stops 0.4 rad short of the crater's edge.
  const A0 = Math.PI / 2, SWEEP = Math.PI * 1.28;
  const RMID = (RAMP_R0 + RAMP_R1) / 2;
  const STEPS = 46;
  for (let i = 0; i < STEPS; i++) {
    const t = (i + 0.5) / STEPS, a = A0 + SWEEP * t;
    const gy = world.height(X + Math.cos(a) * RMID, Z + Math.sin(a) * RMID);
    const ry = gy + 0.2 + (BAL_Y + 0.2 - (gy + 0.2)) * t;
    const px = X + Math.cos(a) * RMID, pz = Z + Math.sin(a) * RMID;
    const seg = (SWEEP / STEPS) * RMID + 0.35;
    B.waffleBox(RAMP_R1 - RAMP_R0, 0.26, seg, { at: [px, ry, pz], rot: [0, -a, 0], color: i % 2 ? C.wafer : C.waferPale });
    // support (the railing comes from cupcakeRails)
    if (i % 5 === 2) {
      const g2 = world.height(px, pz);
      const hgt = ry - g2;
      if (hgt > 1.2) B.stripeCyl(0.3, 0.36, hgt, { at: [px, (ry + g2) / 2, pz], variant: 0, seg: 8 });
    }
  }
  A.deckSpiral(X, Z, RAMP_R0, RAMP_R1 - 0.2, A0, SWEEP, world.height(X, Z + RMID) + 0.2, BAL_Y + 0.2);
  // ── the landing: the ramp used to STOP IN MID-AIR ────────────────────────
  // The spiral runs at radius 12.0 and the balcony deck only reaches 10.2, so
  // the last tread ended 1.8 units short of anything, floating. This is the
  // bridge across that gap: a wafer landing from the ramp's top tread inward to
  // the balcony, with the same railing, registered as a walkable segment.
  {
    const aEnd = A0 + SWEEP;
    const cx = Math.cos(aEnd), cz = Math.sin(aEnd);
    const ax = X + cx * (RAMP_R1 - 0.1), az = Z + cz * (RAMP_R1 - 0.1);
    const bx = X + cx * (BAL_R0 + 0.6), bz = Z + cz * (BAL_R0 + 0.6);
    const ly = BAL_Y + 0.2, span = (RAMP_R1 - 0.1) - (BAL_R0 + 0.6);
    B.waffleBox(2.9, 0.28, span + 0.5, {
      at: [(ax + bx) / 2, ly - 0.04, (az + bz) / 2], rot: [0, Math.atan2(cx, cz), 0], color: C.waferPale,
    });
    A.deckSeg(ax, az, bx, bz, 1.5, ly, ly, 0);
    // a prop under the outer corner, so the landing is visibly held up
    const g2 = world.height(ax, az);
    if (ly - g2 > 1.2) B.stripeCyl(0.32, 0.38, ly - g2, { at: [ax, (ly + g2) / 2, az], variant: 0, seg: 8 });
  }

  cupcakeRails(A, W, {
    y, BAL_Y, BAL_R0, BAL_R1, RAMP_R0, RAMP_R1, A0, SWEEP, RMID, CAKE_TOP: CAKE_Y + CAKE_H, WR_B,
    yA: world.height(X, Z + RMID) + 0.2, PLINTH,
  });
  // ── the walks up here must not be shoved by things down there ────────────
  // A collider with no top is solid to the sky: a lollipop planted under the
  // ramp stands in the middle of the ramp nine units up (the scripted climb
  // stuck on one), a crumb in the bite reaches the balcony. At world:ready,
  // every topless collider whose footprint lies under the ramp, the landing or
  // the balcony becomes solid only for walkers down at ITS level (a live rule
  // on `solid`, like the gated rails). Anything that switches it off later
  // (architecture.js disarms props in rooms) still can.
  {
    const aE = A0 + SWEEP, bA0 = BITE_A + BITE_HW + 0.05, bA1 = BITE_A + Math.PI * 2 - BITE_HW - 0.05;
    const inSweep = (a, a0, a1) => { let d = a - a0; d = ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); return d <= a1 - a0; };
    const cxE = Math.cos(aE), czE = Math.sin(aE);
    const under = (x, z) => {
      const dx = x - X, dz = z - Z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
      if (r >= RAMP_R0 - 0.2 && r <= RAMP_R1 + 0.2 && inSweep(a, A0, aE)) return true;
      if (r >= BAL_R0 - 0.2 && r <= BAL_R1 + 0.2 && inSweep(a, bA0, bA1)) return true;
      const along = dx * cxE + dz * czE, perp = -dx * czE + dz * cxE;
      return along >= BAL_R0 && along <= RAMP_R1 + 0.3 && Math.abs(perp) <= 1.8;
    };
    A.ctx.events.on('world:ready', () => {
      const P = () => A.ctx.systems?.player?.position;
      let n = 0;
      for (const c of A.ctx.colliders) {
        if (!c || c.rail || (typeof c.h === 'number' && c.h < 1e4)) continue;
        const d0 = Object.getOwnPropertyDescriptor(c, 'solid');
        if (c.solid === false || (d0 && d0.get)) continue;
        const R = c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0);
        if (!(R > 0) || R > 4) continue;
        let hit = under(c.x, c.z);
        for (let k = 0; k < 6 && !hit; k++) { const a = k * Math.PI / 3; hit = under(c.x + Math.cos(a) * R, c.z + Math.sin(a) * R); }
        if (!hit) continue;
        const lim = world.height(c.x, c.z) + 2.3;
        let base = c.solid;
        Object.defineProperty(c, 'solid', {
          configurable: true, enumerable: true,
          get() { if (base === false) return false; const p = P(); return !p || p.y < lim; },
          set(v) { base = v; },
        });
        n++;
      }
      if (n) console.warn('[candy/arch] cupcake: ' + n + ' topless props under the ramp/balcony now stop at their own level');
    });
  }

  // ── front door + doorstep ─────────────────────────────────────────────────
  const dz = Z + WR_B + 0.35;
  const dy = world.height(X, dz);
  // the REVEAL: a chocolate-sponge portal through the thickness of the cake —
  // two jambs and a lintel lining the cut in the wrapper, DOOR_W apart, deep
  // enough (REVEAL_Z0..Z1) that the flared paper never shows its cut edge
  const rz = Z + (REVEAL_Z0 + REVEAL_Z1) / 2, rd = REVEAL_Z1 - REVEAL_Z0;
  for (const s of [-1, 1]) B.box('matteFlat', 0.42, DOOR_H + 0.55, rd, { at: [X + s * (DOOR_W / 2 + 0.21), dy + (DOOR_H + 0.55) / 2, rz], color: 0x6b3a2a });
  B.box('matteFlat', DOOR_W + 0.94, 0.55, rd, { at: [X, dy + DOOR_H + 0.275, rz], color: 0x6b3a2a });
  // the icing surround on the portal's face, the keystone a glacé cherry
  const dp = doorway(B, X, dy, Z + REVEAL_Z1, 0, { w: DOOR_W, h: DOOR_H, depth: 0.4, frame: C.icing, knob: 0xd42038, baseColor: C.icingPink });
  E.door({ x: X, y: dy - 0.02, z: dz - 0.12, rot: 0, w: DOOR_W, h: DOOR_H + 0.02, color: C.chocolate, swing: 1, r: 3.0, say: 'The door is warm, and much too big, and it opens anyway.' });
  // the sill (through the reveal) and a wafer doorstep, both level with the
  // hall floor and WALKABLE (Contract A): ground → step → sill → hall
  const sillY = FLOOR_Y;
  B.waffleBox(DOOR_W + 0.84, Math.max(0.12, sillY - dy + 0.1), rd, { at: [X, sillY - Math.max(0.12, sillY - dy + 0.1) / 2, rz], color: C.waferPale });
  A.deckRRect(X, rz, DOOR_W + 0.1, rd + 0.3, 0, sillY);
  B.waffleBox(3.4, Math.max(0.14, sillY - dy + 0.12), 1.5, { at: [X, sillY - Math.max(0.14, sillY - dy + 0.12) / 2, Z + REVEAL_Z1 + 0.75], color: C.wafer });
  A.deckRRect(X, Z + REVEAL_Z1 + 0.75, 3.4, 1.5, 0, sillY);
  // porch lamps, either side of the portal
  for (const s of [-1, 1]) {
    B.cyl('matte', 0.1, 0.12, 0.5, 6, { at: [X + s * 1.55, dy + 3.25, Z + REVEAL_Z1 + 0.2], rot: [0, 0, s * 0.5], color: C.licorice });
    B.sph('glowWarm', 0.34, 9, 7, { at: [X + s * 1.8, dy + 3.1, Z + REVEAL_Z1 + 0.2], color: 0xfff3cc });
    softGlow(B, X + s * 1.8, dy + 3.1, Z + REVEAL_Z1 + 0.2, 2.4);
  }
  A.light(X, dy + 3.4, dz + 0.9, 0xffc98a, 14, 72);

  // ── windows ───────────────────────────────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.62;
    const rr = 8.9;
    windowPane(W, X + Math.cos(a) * rr, CAKE_Y + 1.7, Z + Math.sin(a) * rr, Math.atan2(Math.cos(a), Math.sin(a)), { w: 1.2, h: 1.2, frame: C.icing, pink: i % 2 === 0 });
  }
  for (const a of [Math.PI * 0.78, Math.PI * 0.22]) {
    const rr = WR_B + (WR_T - WR_B) * 0.45 + 0.3;
    windowPane(W, X + Math.cos(a) * rr, y + 4.6, Z + Math.sin(a) * rr, Math.atan2(Math.cos(a), Math.sin(a)), { w: 1.0, h: 1.0, frame: C.icing });
  }

  // ── signpost, fence, colliders ────────────────────────────────────────────
  const sy = world.height(X + 4.5, Z + 11.5);
  signpost(B, X + 4.5, sy, Z + 11.5, [
    { id: 'to_cupcake', dir: Math.atan2(-0.4, -1) },
    { id: 'to_meadow', dir: Math.atan2(-0.7, -0.7) },
    { id: 'to_pier', dir: Math.atan2(0.6, 0.8) },
  ], { h: 3.6, variant: 0 });
  A.collide(X + 4.5, Z + 11.5, 0.6);
  // The name board: a wafer board between two mint posts, lettered on BOTH
  // faces, beside the path where it reaches the plinth. It was a bare sign quad
  // (the sign material is double-sided) turned the opposite way to its posts —
  // a unit clear of either — and it stood across the foot of the spiral ramp,
  // so you walked up through it and, from the ramp above, read it backwards:
  // "3HT TAERG". Now it stands off the ramp's outer edge (r ≈ 15–17).
  {
    const sx = X - 5.0, sz = Z + 15.2, sg = world.height(sx, sz);
    const ux = 1.7, uz = -0.6, ul = Math.hypot(ux, uz);          // the post line
    const yaw = Math.atan2(-uz, ux), PH = 3.35, PO = 2.0;          // board faces +Z turned by yaw (SSE)
    plaque(B, 'cupcake', 3.6, 1.4, { at: [sx, sg + 2.4, sz], rot: [0, yaw, 0], both: true, pad: 0.2, t: 0.16, color: C.waferPale });
    for (const s of [-1, 1]) {
      const px = sx + s * (ux / ul) * PO, pz = sz + s * (uz / ul) * PO;
      B.stripeCyl(0.15, 0.17, PH, { at: [px, sg + PH / 2, pz], variant: 1, seg: 7 });
      B.sph('gloss', 0.22, 8, 6, { at: [px, sg + PH + 0.1, pz], scale: [1, 0.8, 1], color: C.pink });
      A.collide(px, pz, 0.25);
    }
  }
  A.readSign('cupcake', X - 5.0, Z + 15.2, 3.4, 'Read: The Great Cupcake');

  // ── the bite: the second way in ───────────────────────────────────────────
  // A wafer tongue of crumbs spills out of the mouth and down the notch in the
  // plinth, so the way in is legible from thirty units away and walkable.
  {
    const rot = -BITE_A;                              // local +X points out of the mouth
    // The tongue is what announces the mouth from thirty units out: a bright
    // wafer apron spilling from the hollow, down the notch in the plinth and
    // out onto the meadow, edged in icing so it separates from the mint ground.
    for (let i = 0; i < 6; i++) {
      const rad = WR_B - 1.4 + i * 1.9;
      const wdt = 7.4 - i * 0.5;
      B.waffleBox(1.95, 0.24, wdt, {
        at: [X + Math.cos(BITE_A) * rad, y + 0.15, Z + Math.sin(BITE_A) * rad],
        rot: [0, rot, 0], color: i % 2 ? C.wafer : C.waferPale,
      });
      for (const s of [-1, 1]) {
        const px = X + Math.cos(BITE_A) * rad - Math.sin(BITE_A) * s * wdt * 0.5;
        const pz = Z + Math.sin(BITE_A) * rad + Math.cos(BITE_A) * s * wdt * 0.5;
        B.sph('icing', 0.34, 5, 4, { at: [px, y + 0.22, pz], scale: [1, 0.7, 1], color: i % 2 ? C.icingPink : C.icing });
      }
    }
    A.deckSeg(X + Math.cos(BITE_A) * (WR_B - 1.2), Z + Math.sin(BITE_A) * (WR_B - 1.2),
      X + Math.cos(BITE_A) * 12.6, Z + Math.sin(BITE_A) * 12.6, 2.7, y + 0.24, y + 0.24, 0);
    // CRUMBS — player-sized, because that is the whole gag. A crumb you could
    // shelter behind is the only thing that tells you how big the mouth above
    // it is; a scatter of 0.4-unit pebbles told you nothing at all. Six boulders
    // of sponge on and around the tongue, each with a collider, each with its
    // own crust of icing where the frosting tore off with it.
    const CRUMBS = [[0.34, 9.8, 1.85], [-0.46, 11.6, 1.35], [0.62, 13.2, 1.05],
      [-0.18, 15.4, 2.15], [0.08, 8.6, 0.95], [-0.72, 8.9, 1.25], [0.86, 16.8, 1.5]];
    for (let i = 0; i < CRUMBS.length; i++) {
      const [da, rad, s] = CRUMBS[i];
      const a = BITE_A + da;
      const px = X + Math.cos(a) * rad, pz = Z + Math.sin(a) * rad;
      const gy = world.height(px, pz);
      B.ico('matteFlat', s, 0, { at: [px, gy + s * 0.62, pz], rot: [r.range(0, 3), r.range(0, 3), r.range(0, 3)], scale: [1.25, 0.9, 1.1], color: i % 2 ? 0xf0d7a4 : 0xe8c79b });
      // the torn frosting cap, and a smear of jam where it broke
      B.sph('icing', s * 0.5, 8, 6, { at: [px + s * 0.2, gy + s * 1.1, pz - s * 0.15], scale: [1.25, 0.42, 1.15], color: i % 2 ? C.icingPink : 0xffc2dd });
      if (i % 2 === 0) B.sph('matteFlat', s * 0.34, 7, 5, { at: [px - s * 0.5, gy + s * 0.72, pz + s * 0.5], scale: [1.2, 0.6, 1], color: 0xd42038 });
      // a TOP (Contract O): topless, a crumb was a pillar to the sky — the one
      // under the balcony's west end shoved you off the balcony into the bite
      A.ctx.colliders.push({ x: px, z: pz, r: s * 1.15, h: gy + Math.max(1.65, s * 1.5) });
      for (let k = 0; k < 3; k++) {
        const aa = r.range(0, 6.283), rr2 = s * r.range(1.3, 2.2);
        const qx = px + Math.cos(aa) * rr2, qz = pz + Math.sin(aa) * rr2;
        B.ico('matteFlat', r.range(0.16, 0.34), 0, { at: [qx, world.height(qx, qz) + 0.16, qz], rot: [r.range(0, 3), r.range(0, 3), 0], color: 0xe8c79b });
      }
    }
    // two lanterns on brackets driven into the cut face, so the way in glows
    // after dark — and so the crater has something man-made in it for scale
    for (const s of [-1, 1]) {
      const a = BITE_A + s * BITE_HW * 0.72;
      const face = CRAD(s * 0.72, 0.42);
      const bx2 = X + Math.cos(a) * (face + 0.9), bz2 = Z + Math.sin(a) * (face + 0.9);
      B.box('matte', 1.4, 0.14, 0.14, { at: [X + Math.cos(a) * (face + 0.5), y + 4.9, Z + Math.sin(a) * (face + 0.5)], rot: [0, -a, 0], color: C.licorice });
      B.cyl('matte', 0.09, 0.1, 0.75, 6, { at: [bx2, y + 4.5, bz2], color: C.licorice });
      B.sph('glowWarm', 0.58, 10, 8, { at: [bx2, y + 3.9, bz2], color: 0xfff3cc });
      B.sph('icing', 0.32, 8, 5, { at: [bx2, y + 4.24, bz2], scale: [1, 0.5, 1], color: C.lampHood });
      softGlow(B, bx2, y + 3.9, bz2, 3.6);
    }
    A.mark('cupcake_bite_mouth', X + Math.cos(BITE_A) * 9.0, y, Z + Math.sin(BITE_A) * 9.0);
    A.interact({
      id: 'candy_cupcake_bite', x: X + Math.cos(BITE_A) * 11.0, z: Z + Math.sin(BITE_A) * 11.0, r: 3.4,
      label: 'Look at the bite',
      onInteract(ctx) {
        ctx.systems.story?.set('saw_cupcake_bite', true);
        ctx.systems.ui?.say('Something took a bite out of a building. The tooth marks are scalloped, and enormous, and about nine feet apart. The edges are still soft.', { speaker: 'The Great Cupcake', duration: 7 });
      },
    });
  }

  A.collideRingGaps(X, Z, WR_B + 0.2, 16, CAKE_Y + CAKE_H, [
    { a: DOOR_A, w: 0.20 },                      // the front door
    { a: BITE_A, w: BITE_HW + 0.06 },            // the bite
  ]);
  // ...and the door's own jambs, closing the ring's gap down to the reveal:
  // the collider gap is DOOR_W, on the reveal's inner faces, the whole way through
  for (const s of [-1, 1]) {
    const x0 = DOOR_W / 2, x1 = 2.95;
    A.collideBox(X + s * (x0 + x1) / 2, Z + (REVEAL_Z0 + REVEAL_Z1) / 2, x1 - x0, REVEAL_Z1 - REVEAL_Z0, 0, CAKE_Y + CAKE_H);
  }
  A.claimCircle(X, Z, WR_B + 0.4);

  cupcakeInterior(A, E, { X, Z, y, FLOOR_Y, UPPER_Y, ROOM_R, CAKE_Y, CAKE_H, WR_H, dz });
  E.finish();

  // ── the 28-unit clear apron ───────────────────────────────────────────────
  // Registered LAST, after every prop of ours is down, so nothing of ours gets
  // nudged out by it. Vegetation's clearance pass reads these as taken ground
  // and blanks its canes and lollipops, which is the only reason the whole
  // silhouette — plinth, swirl, cherry — is visible from the path at all.
  A.claimApron(X, Z, 13.8, 28.0, { r: 3.6 });
  // ...and the RAMP's own footprint, which the apron (13.8 out) and the wrapper
  // ring (6.6 in) both missed: lollipops and gummy bears grew straight up
  // through the spiral — a blue bear's head through the deck and the railing
  // at mid-climb, lollipop discs through the rail. Two rows of claim circles
  // along the ramp and the landing: the inner row over the deck, the outer one
  // for canopies that would lean in over the outer rail. Vegetation's clearance
  // pass blanks a tree whose trunk is 0.8 inside a circle, so 2.4-u circles
  // clear trunks out to ~1.6 either side of each row. The row starts 0.3 rad up
  // the ramp: the foot is at grade, and `game.teleport` still lands a walker
  // there (it steps out of every circle, solid or not). h 0.01: a claim is not
  // a wall — the camera's collider passes read a circle with no h as six
  // units of trunk, and these must not start dollying the lens on the ramp.
  {
    const a0 = A0 + 0.3, a1 = A0 + SWEEP + 0.13;
    for (const [rr, cr] of [[(RAMP_R0 + RAMP_R1) / 2, 2.4], [RAMP_R1 + 1.0, 2.4]]) {
      const n = Math.ceil(((a1 - a0) * rr) / 1.6);
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        A.ctx.colliders.push({ x: X + Math.cos(a) * rr, z: Z + Math.sin(a) * rr, r: cr, h: 0.01, solid: false, apron: true });
      }
    }
  }

  A.interact({
    id: 'candy_cupcake_knock', x: X, z: dz + 3.4, r: 2.4, label: 'Knock on the Great Cupcake',
    onInteract(ctx) {
      const lines = [
        'The door is warm and smells of vanilla. Something enormous shifts inside. "…is it Tuesday?"',
        'A slot opens at eye height. A single huge sparkling eye. "Upstairs is for RESIDENTS."',
        'A voice like a very polite avalanche: "We are full. We are always exactly one guest full."',
      ];
      const n = (ctx.systems.story?.get('cupcake_knocks') || 0) % lines.length;
      ctx.systems.story?.set('cupcake_knocks', n + 1);
      ctx.systems.ui?.say(lines[n], { speaker: 'The Great Cupcake', duration: 6.5 });
      ctx.systems.particles?.burst?.({ x: X, y: dy + 3.2, z: dz, count: 14, color: [C.icing, C.icingPink], speed: 2.4, life: 0.9, size: 0.2, gravity: -5, spread: 1.6 });
    },
  });

  return { top: CH, balconyY: BAL_Y };
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * HANDRAILS (Contract O) — outside. Ben: "all ramps on or in buildings should
 * have handrails to help keep players from falling off." The spiral ramp had
 * a cane every other tread on its OUTER edge only, the landing six canes and
 * the balcony eighteen, and not one collider between them: you could walk off
 * the ramp's inner edge from nine units up, off either side of the landing, or
 * straight off the balcony onto the plinth. Now:
 *   · the ramp is railed both sides from where it leaves the plinth (measured:
 *     inner edge against the tread it overhangs, outer edge against the lawn),
 *   · the landing is railed round its open end and both open sides,
 *   · the balcony is railed all round, open only where the landing meets it,
 *     with a rail across each cut end at the bite,
 *   · the balcony's INNER edge gets an invisible collider along the cake's
 *     flank — the cake is the wall there, you just used to be able to walk
 *     into it (and out of the bottom of it onto the plinth),
 *   · the notch ends of the upper treads (the door slot and the bite slot)
 *     get short railings where they stand more than 1.2 over the slot.
 * Every one of these rails stands over ground somebody walks on (the plinth,
 * the lawn), so their colliders are GATED: solid only while the visitor is up
 * at that level (rails.js).
 */
function cupcakeRails(A, W, G) {
  const { B, ctx, world } = A;
  const { y, BAL_Y, BAL_R1, A0, SWEEP, CAKE_TOP, WR_B, yA, PLINTH } = G;
  const floor = landingFloor(world);
  const inGap = (a, c, hw) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))) < hw;
  // the stepped plinth under everything: what a walker stepping off lands on
  const R_IN = WR_B + 0.1;
  const plinthAt = (x, z) => {
    const r = Math.hypot(x - X, z - Z);
    if (r < R_IN || r > PLINTH[0][0]) return -Infinity;
    const a = Math.atan2(z - Z, x - X);
    if (inGap(a, DOOR_A, DOOR_HW) || inGap(a, BITE_A, BITE_HW)) return -Infinity;
    let top = y;
    for (const [rad, hh] of PLINTH) { if (r <= rad) top += hh; }
    return top;
  };
  const below = (x, z) => Math.max(floor(x, z), plinthAt(x, z));
  // ONE family for the whole cupcake, inside and out (railFamily): bubblegum
  // canes with cherry finials on the ramp, the landing, the plinth and every
  // rail indoors; classic red canes with lemon gumdrops round the balcony —
  // one finial colour per tier, not the sprinkle cycle, which on four stacked
  // turns of spiral read as a picket of confetti.
  const cane = railFamily(2, CHERRY);
  const caneW = railFamily(0, C.yellow);
  const LY = BAL_Y + 0.2;
  const aEnd = A0 + SWEEP;
  const yRamp = (a) => yA + (LY - yA) * ((a - A0) / SWEEP);
  const cx = Math.cos(aEnd), cz = Math.sin(aEnd);
  const R = (rad, tan, yy = LY) => [X + cx * rad - cz * tan, Z + cz * rad + cx * tan, yy];
  const RO = RAMP_R1_RAIL, RI = RAMP_R0_RAIL, RB = BAL_R1 - 0.3;
  const HALF = 1.4;                                      // landing rails (deckSeg halfW 1.5)
  const sideIn = Math.sqrt(RI * RI - HALF * HALF), sideB = Math.sqrt(RB * RB - HALF * HALF);
  const gIn = Math.atan2(HALF, sideIn), gB = Math.atan2(HALF, sideB);
  const base = { site: 'great_cupcake', gate: true, below };

  // the spiral ramp — both sides, from where they leave the plinth / lawn
  railRun(ctx, B, arcPts(X, Z, RO, A0, aEnd, yRamp), { ...base, edge: 'ramp outer', out: 1, style: cane, lead: 1 });
  railRun(ctx, B, arcPts(X, Z, RI, A0, aEnd - gIn, yRamp), { ...base, edge: 'ramp inner', out: -1, style: cane, lead: 1 });
  // the landing: round its open end and down its far side to the balcony
  railRun(ctx, B, [R(RO, 0), R(RO, HALF), R(sideB, HALF)], { ...base, edge: 'landing end + far side', out: 1, style: cane, force: true });
  railRun(ctx, B, [R(sideIn, -HALF), R(sideB, -HALF)], { ...base, edge: 'landing near side', out: -1, style: cane, force: true });
  // the balcony: all round, open where the landing arrives, closed across both cut ends
  const bA0 = BITE_A + BITE_HW + 0.05, bA1 = BITE_A + Math.PI * 2 - BITE_HW - 0.05;
  const RC = 8.85;                                       // the cake's flank at head height
  railRun(ctx, W, arcPts(X, Z, RB, bA0, aEnd - gB, LY), { ...base, edge: 'balcony outer (a)', out: 1, style: caneW, force: true });
  railRun(ctx, W, arcPts(X, Z, RB, aEnd + gB, bA1, LY), { ...base, edge: 'balcony outer (b)', out: 1, style: caneW, force: true });
  for (const [a, out, nm] of [[bA0, 1, 'balcony cut end (bite, east)'], [bA1, -1, 'balcony cut end (bite, west)']]) {
    railRun(ctx, W, [[X + Math.cos(a) * RC, Z + Math.sin(a) * RC, LY], [X + Math.cos(a) * RB, Z + Math.sin(a) * RB, LY]],
      { ...base, edge: nm, out, style: caneW, force: true });
  }
  railRun(ctx, W, arcPts(X, Z, RC, bA0, bA1, LY), {
    ...base, edge: 'balcony inner (the cake flank)', out: -1, force: true, noPosts: true, noRail: true, h: CAKE_TOP - LY,
    note: 'invisible: the cake is the wall',
  });
  // the notch ends of the treads: door slot and bite slot — the same canes as
  // the ramp that climbs away beside them (they were fat piped-icing dumbbells)
  const ends = [
    [DOOR_A + DOOR_HW, 1, 'door slot, east'], [DOOR_A - DOOR_HW, -1, 'door slot, west'],
    [BITE_A + BITE_HW, 1, 'bite slot, south'], [BITE_A - BITE_HW, -1, 'bite slot, north'],
  ];
  for (const [a0, out, nm] of ends) {
    let top = y;
    PLINTH.forEach(([rad, hh], k) => {
      top += hh;
      const rIn = k === PLINTH.length - 1 ? R_IN : PLINTH[k + 1][0];
      const r0 = rIn + 0.15, r1 = rad - 0.12;
      const pts = [];
      for (const rr of [r0, r1]) {
        const a = a0 + (out > 0 ? 1 : -1) * (0.16 / rr);     // 0.16 in from the cut face
        pts.push([X + Math.cos(a) * rr, Z + Math.sin(a) * rr, top]);
      }
      railRun(ctx, B, pts, { ...base, edge: `plinth tread ${k + 1} end (${nm})`, out, style: cane, below: floor });
    });
  }
  // the plinth's outermost step: the lawn falls away under the north side (the
  // ramp's high end), so there the bottom tread stands up to ~1.8 over it — a
  // railing where it does, an open step everywhere else
  railRun(ctx, B, arcPts(X, Z, PLINTH[0][0] - 0.14, DOOR_A + DOOR_HW, BITE_A + Math.PI * 2 - BITE_HW, y + PLINTH[0][1]),
    { ...base, edge: 'plinth bottom step (west arc)', out: 1, style: cane, below: floor });
  railRun(ctx, B, arcPts(X, Z, PLINTH[0][0] - 0.14, BITE_A + BITE_HW, DOOR_A - DOOR_HW, y + PLINTH[0][1]),
    { ...base, edge: 'plinth bottom step (east arc)', out: 1, style: cane, below: floor });
}
const CHERRY = 0xd42038;          // the cherry on top, the keystone, the finials
/**
 * The cupcake's railing, one family everywhere (Contract O: "rails read as part
 * of the building"): rails.js's candy cane — striped post, striped top rail,
 * licorice mid rail on stairs, a gumdrop finial — in stripe colourway
 * `variant`, one finial colour, and a FOOT: a dome of piped frosting where each
 * post meets the wafer, so it stands on the deck instead of stabbing through it.
 * Keys: 'stripe', 'gloss', 'licorice', 'icing' — the main builder has them all;
 * the shell and the interior builders collapse gloss/licorice/icing onto their
 * one matte, and carry 'stripe' (the interior's rails are its only stripes:
 * +1 draw call, and only while you are inside).
 */
function railFamily(variant, knob) {
  const st = caneStyle({ variant, knob });
  return {
    post(B, x, y, z, h, i) {
      st.post(B, x, y, z, h, i);
      B.sph('icing', 0.2, 8, 3, { at: [x, y, z], thetaLen: Math.PI / 2, scale: [1, 0.55, 1], color: C.icing });
    },
    rail: st.rail,
  };
}
const RAMP_R1_RAIL = 13.02;       // ramp walkable 10.8 … 13.0: rails just inside both edges
const RAMP_R0_RAIL = 10.9;

// ─────────────────────────────────────────────────────────────────────────────
/**
 * INSIDE THE GREAT CUPCAKE — two storeys.
 * Ground: a round hall lined with wafer panelling, and a spiral of piped
 * frosting for a staircase, winding round a column of the stuff.
 * Mezzanine: a bed the size of a small boat, a window seat looking out over
 * Lollipop Meadow, and the cherry overhead glowing red through the ceiling.
 */
function cupcakeInterior(A, E, G) {
  const { X, Z, y, FLOOR_Y, UPPER_Y, ROOM_R, CAKE_Y, CAKE_H, dz } = G;
  const I = E.in;
  const F = IN.frameAt(X, FLOOR_Y, Z, 0);
  const STAIR_R = 2.6, HALF_W = 1.5, TURNS = 2.5;
  const A0 = Math.PI / 2;                                  // start at the front door
  const CEIL = CAKE_Y + CAKE_H - 0.15;

  // ── ground hall ───────────────────────────────────────────────────────────
  I.cyl('matte', ROOM_R, ROOM_R, 0.2, 24, { at: [X, FLOOR_Y - 0.1, Z], color: 0xd8b07a });
  I.tor('icing', ROOM_R - 0.15, 0.12, 5, 26, { at: [X, FLOOR_Y + 0.06, Z], rot: [Math.PI / 2, 0, 0], color: C.icingPink });
  A.deckRing(X, Z, 0, ROOM_R + 0.15, FLOOR_Y);
  // wafer wall panels (a cylinder seen from inside shows nothing — panels do)
  const NP = 12;
  for (let i = 0; i < NP; i++) {
    const a = (i / NP) * Math.PI * 2;
    const pw = 2 * Math.PI * ROOM_R / NP + 0.25;
    // leave the doorway panel out — and the whole north side, which is bite
    if (Math.abs(Math.atan2(Math.sin(a - A0), Math.cos(a - A0))) < 0.3) continue;
    if (Math.abs(Math.atan2(Math.sin(a - BITE_A), Math.cos(a - BITE_A))) < BITE_HW) continue;
    I.waffleBox(0.22, UPPER_Y - FLOOR_Y - 0.2, pw, {
      at: [X + Math.cos(a) * (ROOM_R + 0.1), (FLOOR_Y + UPPER_Y) / 2, Z + Math.sin(a) * (ROOM_R + 0.1)],
      rot: [0, -a, 0], color: i % 2 ? C.wafer : C.waferPale,
    });
  }
  // ── the frosting-swirl staircase ──────────────────────────────────────────
  const rise = UPPER_Y - FLOOR_Y;
  const NT = 46;
  for (let i = 0; i <= NT; i++) {
    const t = i / NT, a = A0 + t * TURNS * Math.PI * 2;
    const ty = FLOOR_Y + rise * t;
    I.box('icing', HALF_W * 2, 0.18, 1.15, {
      at: [X + Math.cos(a) * STAIR_R, ty, Z + Math.sin(a) * STAIR_R], rot: [0, -a, 0],
      color: i % 2 ? 0xffd0e4 : 0xffe6f2,
    });
    if (i % 2 === 0) {
      I.sph('icing', 0.42, 7, 5, { at: [X + Math.cos(a) * (STAIR_R + HALF_W - 0.1), ty + 0.1, Z + Math.sin(a) * (STAIR_R + HALF_W - 0.1)], scale: [1, 0.75, 1], color: 0xffa8cc });
    }
  }
  A.stairSpiral(X, Z, A0, TURNS, STAIR_R, STAIR_R, HALF_W, FLOOR_Y, UPPER_Y);
  // the piped column the stair winds around
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    I.sph('icing', 1.0 - t * 0.18, 8, 6, { at: [X, FLOOR_Y + 0.4 + rise * t, Z], scale: [1, 0.62, 1], color: t % 0.4 < 0.2 ? C.icing : 0xffd0e4 });
  }

  // ── mezzanine ─────────────────────────────────────────────────────────────
  const MEZ_R0 = STAIR_R + HALF_W + 0.05;
  for (let i = 0; i < 16; i++) {           // an annular floor from 16 wedges
    const a = (i / 16) * Math.PI * 2, rm = (MEZ_R0 + ROOM_R) / 2;
    I.waffleBox(ROOM_R - MEZ_R0, 0.2, 2 * Math.PI * rm / 16 + 0.3, {
      at: [X + Math.cos(a) * rm, UPPER_Y - 0.1, Z + Math.sin(a) * rm], rot: [0, -a, 0],
      color: i % 2 ? C.wafer : C.waferPale,
    });
  }
  A.deckRing(X, Z, MEZ_R0, ROOM_R + 0.15, UPPER_Y);
  // A NEWEL: a fat bubblegum cane on a frosting foot with an icing collar, and
  // on top either a glowing cherry lamp (the stair head — it replaces the
  // ceiling lamp that hung, cord and all, from a ceiling the camera never
  // draws, and so read as a salt shaker parked on the rail) or a glacé cherry.
  let lampAt = null;
  const newel = (x, z, lamp) => {
    const y0 = UPPER_Y, NH = 1.3;
    I.sph('icing', 0.42, 10, 3, { at: [x, y0, z], thetaLen: Math.PI / 2, scale: [1, 0.5, 1], color: C.icing });
    I.stripeCyl(0.19, 0.23, NH, { at: [x, y0 + NH / 2, z], variant: 2, seg: 8 });
    I.tor('icing', 0.22, 0.08, 5, 12, { at: [x, y0 + NH, z], rot: [Math.PI / 2, 0, 0], color: C.icing });
    I.cyl('icing', 0.26, 0.24, 0.1, 10, { at: [x, y0 + NH + 0.05, z], color: C.icingPink });
    if (lamp) {
      I.sph('glowWarm', 0.3, 12, 9, { at: [x, y0 + NH + 0.38, z], color: 0xe8283f });
      I.cyl('licorice', 0.025, 0.03, 0.26, 4, { at: [x + 0.06, y0 + NH + 0.75, z], rot: [0, 0, -0.3], color: 0x3f7a2a });
      softGlow(I, x, y0 + NH + 0.38, z, 1.5);
      lampAt = [x, z];
    } else {
      I.sph('gloss', 0.26, 10, 8, { at: [x, y0 + NH + 0.33, z], color: CHERRY });
      I.cyl('licorice', 0.022, 0.028, 0.3, 4, { at: [x + 0.07, y0 + NH + 0.7, z], rot: [0, 0, -0.35], color: 0x3f7a2a });
    }
  };
  // ── HANDRAILS (Contract O), inside ────────────────────────────────────────
  // The frosting stair had no rail at all on its open side (a nine-unit drop to
  // the hall by the top turn), the stairwell had a ring of 0.6-unit licorice
  // stubs with no collider, and nothing stopped you walking off the TOP tread
  // into the flight below. Now: a handrail (+ mid rail) up the open side of the
  // stair, the same round the stairwell — both measured, so both leave
  // themselves open along the last turn where stair and mezzanine are a stride
  // apart (that is the way off) — a rail across the head of the stair, and a
  // collider for the piped newel the stair winds round. The SAME candy canes
  // as the ramp outside (railFamily): from the mezzanine you see both at once
  // through the bite, and a dusty-pink icing tube beside a striped cane read as
  // two buildings. Where the ring opens for the stair, a fat cane NEWEL stands
  // at each end: a lamp newel at the stair head, a cherry-capped one opposite.
  {
    const total = TURNS * Math.PI * 2, aTop = A0 + total;
    const ys = (u) => FLOOR_Y + rise * (u / total);
    // the highest tread of the flight(s) under (x, z) that is below `yy`, else the hall floor
    const stairBelow = (x, z, yy) => {
      const dx = x - X, dz = z - Z, r = Math.hypot(dx, dz);
      let best = FLOOR_Y;
      if (Math.abs(r - STAIR_R) <= HALF_W) {
        let a = Math.atan2(dz, dx) - A0; a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        for (let u = a; u <= total; u += Math.PI * 2) { const h = ys(u); if (h < yy + 0.3 && h > best) best = h; }   // level counts: you step across
      }
      return best;
    };
    const base = { site: 'great_cupcake', gate: true, style: railFamily(2, CHERRY) };
    const RS = STAIR_R + HALF_W - 0.1;
    const stairPts = [];
    for (let u = 0, n = Math.ceil(total * RS / 1.55); u <= n; u++) {
      const uu = total * (u / n), a = A0 + uu;
      stairPts.push([X + Math.cos(a) * RS, Z + Math.sin(a) * RS, ys(uu)]);
    }
    // off the stair's open side you land on the hall floor — or step onto the
    // mezzanine, where it is within a stride
    const offStair = (x, z, yy) => (UPPER_Y - yy <= 1.2 ? UPPER_Y : FLOOR_Y);
    railRun(A.ctx, I, stairPts, { ...base, edge: 'interior stair, open side', out: 1, mid: true, lead: 1, leadBack: true, below: offStair });
    railRun(A.ctx, I, [[X + Math.cos(aTop) * 1.05, Z + Math.sin(aTop) * 1.05, UPPER_Y], [X + Math.cos(aTop) * (MEZ_R0 + 0.1), Z + Math.sin(aTop) * (MEZ_R0 + 0.1), UPPER_Y]],
      { ...base, edge: 'interior stair, head', out: -1, force: true, below: stairBelow });
    const ringPts = arcPts(X, Z, MEZ_R0 + 0.1, aTop, aTop + Math.PI * 2, UPPER_Y);
    const well = railRun(A.ctx, I, ringPts, { ...base, edge: 'mezzanine stairwell', out: -1, below: stairBelow });
    // the newels: the lamp newel at the stair head (aTop, where the head rail
    // meets the ring), and a cherry newel wherever else the ring changes from
    // open to railed. arcPts steps ≤ POST_GAP, so span k is segment k of ringPts.
    newel(ringPts[0][0], ringPts[0][1], true);
    const built = well.drops.map((d) => d[0] !== '·');
    for (let k = 0; k < built.length - 1; k++) {
      if (built[k] !== built[k + 1]) newel(ringPts[k + 1][0], ringPts[k + 1][1], false);
    }
    // THE BITE, UP HERE. The mezzanine deck runs out to the panelling all the
    // way round, and so do the upper wafer panels — but the ring of wall
    // colliders (collideRingGaps, r 6.4) is cut for the bite, because down at
    // the ground that gap is the crater's walk-in mouth. So over the bite the
    // panelling had nothing behind it: you walked through the wafer and fell
    // ten units into the crater (the biggest drop in the building). The panels
    // are the wall there, so it gets the wall's collider on the panel line —
    // inner face at ROOM_R + 0.1, where the ring's is — gated to the mezzanine,
    // with the crater mouth running underneath. Overlaps the ring either side.
    railRun(A.ctx, I, arcPts(X, Z, ROOM_R + 0.22, BITE_A - BITE_HW - 0.1, BITE_A + BITE_HW + 0.1, UPPER_Y), {
      ...base, edge: 'mezzanine outer edge at the bite', out: 1, force: true, noPosts: true, noRail: true,
      note: 'invisible: the wafer panelling is the wall',
    });
    // the piped newel: the stair's inner edge is the column, which had no collider
    A.ctx.colliders.push({ x: X, z: Z, r: 1.0 });
  }
  for (let i = 0; i < NP; i++) {           // upper wall panels
    const a = (i / NP) * Math.PI * 2 + Math.PI / NP;
    const pw = 2 * Math.PI * ROOM_R / NP + 0.25;
    I.waffleBox(0.22, CEIL - UPPER_Y, pw, {
      at: [X + Math.cos(a) * (ROOM_R + 0.1), (UPPER_Y + CEIL) / 2, Z + Math.sin(a) * (ROOM_R + 0.1)],
      rot: [0, -a, 0], color: i % 2 ? C.waferPale : C.wafer,
    });
  }

  // a bed the size of a small boat — along the wall, clear of the stairwell.
  // (It stood across the head of the stair, half of it hanging over the well,
  // with a solid collider that walled the top turn down to a 0.5-unit lane.)
  const ba = Math.PI * 0.585, BR = 5.3, BW = 1.9, BL = 4.4;
  const bx = X + Math.cos(ba) * BR, bz = Z + Math.sin(ba) * BR;
  const tx = -Math.sin(ba), tz = Math.cos(ba);           // along the wall
  I.box('licorice', BW, 0.5, BL, { at: [bx, UPPER_Y + 0.25, bz], rot: [0, -ba, 0], color: C.licoriceSoft });
  I.sph('gloss', 1.7, 10, 7, { at: [bx, UPPER_Y + 0.6, bz], rot: [0, -ba, 0], scale: [0.56, 0.34, 1.3], color: C.pink });
  I.sph('icing', 0.85, 8, 6, { at: [bx + tx * 1.5, UPPER_Y + 0.95, bz + tz * 1.5], rot: [0, -ba, 0], scale: [1.05, 0.5, 0.8], color: C.cream });
  I.box('licorice', BW + 0.1, 1.5, 0.28, { at: [bx + tx * 2.2, UPPER_Y + 1.0, bz + tz * 2.2], rot: [0, -ba, 0], color: C.licorice });
  {
    // solid only up on the mezzanine: the hall runs underneath it
    const c = { x: bx, z: bz, w: BW, d: BL, rot: ba, box: true };   // no top, as before (a solid bed)
    gateSolid(c, A.ctx, UPPER_Y - GATE);
    A.ctx.colliders.push(c);
  }

  // the window seat, looking out at Lollipop Meadow (-110, -45)
  const wa = Math.atan2(-45 - Z, -110 - X);
  const wx = X + Math.cos(wa) * (ROOM_R - 0.55), wz = Z + Math.sin(wa) * (ROOM_R - 0.55);
  I.waffleBox(1.0, 0.45, 2.6, { at: [wx, UPPER_Y + 0.22, wz], rot: [0, -wa, 0], color: C.waferPale });
  for (const s of [-1, 1]) I.sph('gloss', 0.42, 7, 5, { at: [wx - Math.cos(wa) * 0.1 + Math.sin(wa) * s * 0.8, UPPER_Y + 0.6, wz - Math.sin(wa) * 0.1 - Math.cos(wa) * s * 0.8], scale: [1, 0.55, 1], color: s > 0 ? C.icingMint : C.icingLemon });
  // a hole in the panelling to look through
  I.box('windowWarm', 0.1, 1.5, 2.2, { at: [X + Math.cos(wa) * (ROOM_R + 0.12), UPPER_Y + 1.45, Z + Math.sin(wa) * (ROOM_R + 0.12)], rot: [0, -wa, 0], color: 0xfff0d0 });

  // ── the cherry skylight ───────────────────────────────────────────────────
  // On the ROOF builder, which hides while you are inside: the game camera is
  // always above this ceiling, so indoors the skylight was only ever seen from
  // on top — a flat red disc floating over the stairwell, blotting out the
  // flights and the rail round them. Its glow stays in the room.
  E.roof.cyl('glowWarm', 1.5, 1.5, 0.12, 16, { at: [X, CEIL, Z], color: 0xff3a56 });
  E.roof.tor('icing', 1.55, 0.16, 5, 18, { at: [X, CEIL - 0.06, Z], rot: [Math.PI / 2, 0, 0], color: C.icing });
  IN.softLight(I, X, CEIL - 0.6, Z, 3.4);

  // lamps: the upper room's is the newel lamp at the stair head (above)
  IN.ceilingLamp(I, F, -3.0, 3.4, 2.0, { glow: 2.2, hood: C.icingMint });
  if (lampAt) E.lamp(lampAt[0], UPPER_Y + 1.8, lampAt[1], 0xffb27a);

  // a gag you can press
  A.interact({
    id: 'cupcake_bed', x: bx, z: bz, r: 2.6, label: 'Sit on the enormous bed',
    onInteract(ctx) {
      ctx.systems.ui?.say('The mattress is warm, and it is breathing, very slowly, in time with the walls. There is a dent in it the exact size and shape of a person in a sun hat.', { speaker: 'The Great Cupcake', duration: 7.5 });
      ctx.systems.story?.set('cupcake_bed', true);
    },
  });
}
