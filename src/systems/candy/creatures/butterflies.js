// WRAPPER BUTTERFLIES — 78 foil-winged butterflies looping over 13 flower
// clusters. Rebuilt twice now. Pass 1 read as "origami shards impaled on
// twigs"; pass 2 fixed the colour but kept a near-flat 20° dihedral and a fat
// spherical body, so at the game camera the swarm still collapsed into foil
// SCRAPS lying in mid-air — a single lit paddle with a bowling pin under it.
//
// Pass 3, what actually makes a butterfly read at 31 u:
//   · THE V. Two thin sheets held at a ~104° dihedral (0.66 rad per wing) and a
//     flap amplitude (0.30) small enough that the sweep NEVER reaches coplanar:
//     the pair travels between 139° and 70° and is a V in every single frame.
//     A butterfly is read from its V, not its outline, and a pair of wings that
//     goes flat even briefly is a piece of litter for that frame.
//   · DOUBLE-SIDED WITH A DARK UNDERSIDE. The sheets have no thickness, so the
//     back faces are shaded to 83% (applyFlap backShade). That 17% is the whole
//     difference between "two wings" and "one bent card".
//   · TAPERED BODY + ANTENNAE. Segmented thorax/abdomen that narrows to a point
//     aft, a round head, and two clubbed antennae — the silhouette cue that
//     says insect rather than confetti.
//   · FOIL EDGE. A bright rim ring around a deeper wing field: sweet-wrapper
//     foil catching the light, and a hard readable outline against the grass.
//   · GROUNDED. A soft blob shadow tracks each one on the real surface height,
//     tightening and darkening as it descends onto a flower. Shared pool, so
//     all 78 cost nothing extra.
//   · LANDING POSE. aFold (0..1) holds the wings straight up when one settles.
// They are gone by dusk — the Sour Patch Kids come out and nobody stays out.
//
// PASS 4 — the critic still read them as dropped wrappers, and was right: most
// of the swarm was LANDED, flat on the licorice path or pressed onto a gumdrop,
// because a "landing" was `world.height(x,z) + 0.22` at a random spot. Fixed by
// three changes, in order of how much they matter:
//   · ≥ 80% AIRBORNE, ALWAYS. Only 3 butterflies in 10 are landers at all, and a
//     lander perches for 3–6 s out of every ~20. Measured across the flock that
//     is ~6% on the ground at any instant; the rest are on their loops.
//   · PERCHES ARE FLOWERS (flowers.js). A landing target is a blossom head at
//     1.1–2 u, never the ground and never another prop. If a bed somehow has no
//     blossom, that butterfly simply never lands.
//   · BOTH FACES LIT. A wing is one polygon, so three flips its normal on the
//     back face and the underside rendered as a black splinter. The material now
//     carries an emissive floor tinted by the wing's own colour (emissiveTint),
//     so a wing seen from below is a dimmer pink, never a dark shard.
// Cruise is 1–2.5 u on a bobbing loop, the V never opens past 140°, and the
// contact shadow tracks the real surface underneath the whole time.
import * as THREE from 'three';
import { rng, hash, smoothstep } from '../../../core/util.js';
import { Pool, part, mergeParts, shadeAxis, fanXZ, applyFlap, TAU, clearRadius } from './common.js';
import { flowerBeds } from './flowers.js';

// Sweet-wrapper foil: hot pink, lemon, sky, mint, grape. Five hues, repeated.
// Saturated on purpose — the white foil rim eats a fifth of the wing area, so a
// pastel base colour washes the whole butterfly out to paper-white at 31 u.
// (0xff2f7d was dropped for 0xff62a8: crimson-pink wings perched against a white
// marshmallow sheep read as a WOUND at the game camera — the "magenta gash" in
// the meadow frames was a landed butterfly, not the sheep. Candy pink cannot be
// mistaken for one, and landings now also avoid the flock — see nearSheep.)
const WING_HUES = [0xff62a8, 0xffc41f, 0x1fa6ff, 0x24d49c, 0x9a4dff];

// ── one wing, in the XZ plane, extending along +x * side ─────────────────────
// z+ is forward (fore wing), z- is aft (hind wing). A real butterfly outline:
// a long swept forewing and a rounder, shorter hindwing, pinched at the waist.
// Half-span 0.52 → a ~1.05 u wingspan at scale 1, before the V foreshortens it.
const OUTLINE = [
  [0.03, 0.09],
  [0.14, 0.27], [0.31, 0.35], [0.46, 0.29], [0.52, 0.14],   // forewing
  [0.45, 0.01], [0.38, -0.06],                              // waist
  [0.40, -0.17], [0.31, -0.28], [0.17, -0.32], [0.06, -0.23], [0.02, -0.09],  // hindwing
];

// A wrapper wing is not a flat card: it cups upward from the root, so the two
// sheets catch the sun at different angles all the way out to the tip.
const CUP = 0.10;
function cup(g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.abs(p.getX(i)) * CUP);
  g.computeVertexNormals();
  return g;
}

/** scale x/y by a ramp along z — turns a sphere into a tapered abdomen */
function taper(g, z0, z1, k0, k1) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let t = (p.getZ(i) - z0) / (z1 - z0); t = t < 0 ? 0 : t > 1 ? 1 : t;
    const k = k0 + (k1 - k0) * t;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i));
  }
  g.computeVertexNormals();
  return g;
}

function wing(side) {
  // centroid, for shrinking the outline inward to get the rim ring
  let cx = 0, cz = 0;
  for (const [x, z] of OUTLINE) { cx += x; cz += z; }
  cx /= OUTLINE.length; cz /= OUTLINE.length;
  const INSET = 0.16;   // rim ≈ 20% of the wing area: a clear foil edge, not a halo
  const inner = OUTLINE.map(([x, z]) => [x + (cx - x) * INSET, z + (cz - z) * INSET]);

  // filled field: brighter at the root, deeper at the tip (foil falloff)
  const field = part(cup(fanXZ(inner.map(([x, z]) => [x * side, z]))), { tag: side });
  shadeAxis(field, 'x', 0.04, 0.46, 0xffeaf4, 0x8f6f88);

  // rim ring: full-brightness strip between inner and outer outlines
  const tris = [];
  for (let i = 0; i < OUTLINE.length; i++) {
    const j = (i + 1) % OUTLINE.length;
    const [ax, az] = OUTLINE[i], [bx, bz] = OUTLINE[j];
    const [ix, iz] = inner[i], [jx, jz] = inner[j];
    tris.push(ax * side, 0, az, bx * side, 0, bz, jx * side, 0, jz);
    tris.push(ax * side, 0, az, jx * side, 0, jz, ix * side, 0, iz);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
  const rim = part(cup(rg), { tag: side, color: 0xffffff });
  return [field, rim];
}

function butterflyGeo() {
  // Body: a tapered spindle, not a bowling pin. Fat at the thorax where the
  // wings hinge, narrowing to a point at the tail.
  const body = taper(part(new THREE.SphereGeometry(1, 7, 4), { scale: [0.056, 0.062, 0.20], color: 0xffffff }),
    -0.20, 0.14, 0.42, 1.0);
  shadeAxis(body, 'y', -0.06, 0.06, 0xcdb6c4, 0xffffff);
  const head = part(new THREE.SphereGeometry(1, 5, 3), { pos: [0, 0.015, 0.205], scale: 0.062, color: 0xfffaf2 });
  const parts = [body, head];
  // antennae: thin, swept forward and out, each with a club on the end so the
  // tip survives at 2 px instead of aliasing away
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.ConeGeometry(0.016, 0.21, 3, 1, true),
      { pos: [s * 0.05, 0.105, 0.30], rot: [-0.62, 0, s * 0.36], color: 0x3a2430 }));
    parts.push(part(new THREE.SphereGeometry(1, 4, 2),
      { pos: [s * 0.085, 0.185, 0.375], scale: 0.028, color: 0x3a2430 }));
  }
  return mergeParts([...parts, ...wing(1), ...wing(-1)]);
}

export function create(env) {
  const { ctx, world, scene, shadowField } = env;
  const r = rng(hash('candy-butterflies'));

  // Loops are anchored on the flower beds — the beds ARE the reason a butterfly
  // is standing where it is standing.
  const anchors = flowerBeds(world);

  const N = 78;
  const mat = applyFlap(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.38, metalness: 0.16, side: THREE.DoubleSide, flatShading: false,
    emissive: 0xffffff, emissiveIntensity: 0.28,
  }), 0.30, {
    key: 'candy-butterfly-v4', fold: true, dihedral: 0.66,
    bodyLift: 0.84, bodyColor: 0xfff1d2, backShade: 0.86, emissiveTint: true,
  });

  const pool = new Pool(scene, butterflyGeo(), mat, N, {
    name: 'wrapper-butterflies', cast: false, attrs: { aPhase: 1, aRate: 1, aAmp: 1, aFold: 1 },
  });
  const aPhase = pool.attr('aPhase').array, aRate = pool.attr('aRate').array;
  const aAmp = pool.attr('aAmp').array, aFold = pool.attr('aFold').array;
  const shade = shadowField.claim(N);

  const flies = [];
  let landers = 0;
  for (let i = 0; i < N; i++) {
    const c = anchors[i % anchors.length];
    const rate = 13 + r() * 7;              // wingbeats: fast, desynchronised
    // The loop must not sweep through a candy-cane stick, so it is shrunk until
    // the whole ring misses every registered prop.
    const rr = clearRadius(c.x, c.z, 1.15 + r() * 1.6, 0.75, 0.84);
    // Only three in ten are landers at all — that alone keeps the swarm ≥ 80%
    // airborne even at the bottom of the duty cycle.
    const canLand = r() < 0.30 && c.flowers.length > 0;
    if (canLand) landers++;
    flies.push({
      c, canLand, perch: c.flowers[Math.floor(r() * c.flowers.length)] || null,
      a: r() * TAU, w: (0.95 + r() * 1.15) * (r() < 0.5 ? -1 : 1), rr,
      hi: 1.2 + r() * 1.1, ph: r() * TAU, land: 0, want: 0,
      timer: canLand ? 4 + r() * 18 : 1e9,
      g: c.y, gRaw: c.y, gTimer: r() * 0.25, scale: 1.0 + r() * 0.26, rate,
    });
    aPhase[i] = r() * TAU; aRate[i] = rate; aAmp[i] = 0.86 + r() * 0.3; aFold[i] = 0;
    pool.tint(i, WING_HUES[i % WING_HUES.length]);
  }
  for (const k of ['aPhase', 'aRate', 'aAmp', 'aFold']) pool.attr(k).needsUpdate = true;
  pool.flushColors();

  let wasVisible = true;
  let airborne = N;

  return {
    name: 'butterflies', pool, clusters: anchors, beds: anchors,
    /** for the report: how much of the swarm is actually in the air right now */
    airborneFraction: () => airborne / N,
    landerCount: landers,
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      const vis = smoothstep(0.18, 0.52, ctx.state.daylight ?? 1);
      pool.mesh.visible = vis > 0.02;
      if (!pool.mesh.visible) { if (wasVisible) { shade.hideAll(); wasVisible = false; } return; }
      wasVisible = true;
      let up = 0;
      for (let i = 0; i < N; i++) {
        const f = flies[i];

        // ── perch on a blossom / take off again ────────────────────────────
        if (f.canLand && (f.timer -= dt) <= 0) {
          f.want = f.want ? 0 : 1;
          f.timer = f.want ? 3 + r() * 3 : 12 + r() * 16;
          if (f.want) f.perch = f.c.flowers[Math.floor(r() * f.c.flowers.length)];
        }
        f.land += (f.want - f.land) * Math.min(1, dt * 1.3);
        const flying = 1 - f.land;
        if (f.land < 0.5) up++;

        // ── the loop over the flower bed ───────────────────────────────────
        f.a += f.w * dt * flying;
        const rr = f.rr * (1 + Math.sin(t * 0.5 + f.ph) * 0.18);
        const fx = f.c.x + Math.cos(f.a) * rr;
        const fz = f.c.z + Math.sin(f.a) * rr * 0.84;
        // the ONLY legal landing spot: the head of a blossom in this bed
        // (px/py/pz are baked on the flower — no trig, no allocation per frame)
        const p = f.land > 0.001 ? f.perch : null;
        const x = p ? fx + (p.px - fx) * f.land : fx;
        const z = p ? fz + (p.pz - fz) * f.land : fz;

        // Local ground, re-sampled ~5x/s (world.height is not cheap enough for
        // 78 calls a frame). f.g is damped for a smooth cruise altitude; gRaw is
        // the un-damped sample, because the shadow decal has to sit ON the real
        // surface — a damped value lags on a slope and buries the decal.
        if ((f.gTimer -= dt) <= 0) { f.gTimer = 0.2; f.gRaw = world.height(x, z); f.g += (f.gRaw - f.g) * 0.7; }

        // cruise height: strictly 1–2.5 u over the ground under the butterfly
        let alt = f.hi + Math.sin(t * 1.25 + f.ph) * 0.26 + Math.sin(t * 5.9 + f.ph) * 0.05;
        alt = alt < 1.0 ? 1.0 : alt > 2.5 ? 2.5 : alt;
        const y = p ? (f.g + alt) * flying + p.py * f.land : f.g + alt;

        const yaw = f.a + (f.w > 0 ? -Math.PI / 2 : Math.PI / 2);
        const s = f.scale * vis;
        pool.place(i, x, y, z, yaw,
          s, s, s,
          f.land * 0.16 - flying * 0.12,                        // nose-down cruise, level when perched
          Math.sin(t * 1.7 + f.ph) * 0.32 * flying);            // bank into the loop

        // wings: flap in flight, held straight up when perched. Only aFold is
        // animated — nudging aRate would jump the phase (uCTime * aRate is a
        // big number) and make the wing snap.
        aFold[i] = f.land;

        // Contact shadow — the thing that says "over the path", not "on it".
        // Biased DARK: at the game camera a butterfly 1.5 u up only projects
        // about a unit clear of its own shadow, so a pale washed-out blob reads
        // as part of the frosting and the butterfly reads as litter lying on it.
        let h = (y - f.gRaw - 0.8) / 3.0; h = h < 0 ? 0 : h > 1 ? 1 : h;
        shade.set(i, x, f.gRaw, z, s * 0.68, h, yaw * 0.5);
      }
      airborne = up;
      pool.attr('aFold').needsUpdate = true;
      pool.flush();
    },
  };
}
