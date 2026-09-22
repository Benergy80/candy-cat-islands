// Island ground: one high-resolution vertex-coloured heightmesh per island.
//
// Heights come straight from world.height(). Everything else is authored here:
//   · zone colour  — swirl-warped frosting lobes / Mediterranean grass fields
//   · value model  — dips darker, crests lighter (local relief), slopes shaded
//   · aData mask   — per-vertex strengths for the fragment detail (vec4)
//   · fragment     — piped-frosting swirls, sprinkles, sugar sparkle, grass
//                    clumps, stone strata + a matching normal perturbation
//
// COLOUR NOTE: the scene is lit hard (sun 3.4 + hemi 0.8) and graded through
// ACES at exposure ~1.15, which lifts and desaturates everything. Albedos here
// are therefore deliberately DARKER and more chromatic than the colour you
// want on screen — e.g. mint albedo #4fa075 lands at ≈ rgb(96,172,128).
// tools/_terrain_probe.mjs predicts the rendered value of every zone offline.
import * as THREE from 'three';
import { Simplex2 } from '../../core/noise.js';
import { GLSL_NOISE, GLSL_AO, patchMaterial, smooth, clamp01, toward, quiet, colorOf, blurGrid } from './common.js';

const zoneN = new Simplex2(7711);
const swirlN = new Simplex2(3137);
const patchN = new Simplex2(4242);
const grainN = new Simplex2(9090);
// Edge breakup: every threshold in this file (zone seam, beach, lake rim, cliff
// foot) is jittered by this field in WORLD UNITS, so no boundary is ever a
// clean mathematical contour. Hard decal cuts were the readability complaint.
const edgeN = new Simplex2(5150);
// Two-scale value mottle (~46 u and ~12 u) so a flat frosting plane still has
// somewhere for the eye to land.
const mottleA = new Simplex2(2718);
const mottleB = new Simplex2(3141);
const jit = (x, z, s, amp) => edgeN.fbm(x * s, z * s, 2) * amp;

const SEG = 208;            // per island
const CLIP_DEPTH = -3.4;    // quads fully below this are dropped (sea hides them)

// ── zone albedos (see COLOUR NOTE above) ─────────────────────────────────────
const C = {
  pink: colorOf(0xbf4a7c), pinkDeep: colorOf(0x86355f),
  mint: colorOf(0x49a677), mintDeep: colorOf(0x3a7c62),
  vanilla: colorOf(0xd9a052), creamCrest: colorOf(0xefc9a2),
  grass: colorOf(0x6f9a46), grassDark: colorOf(0x47673a),
  grassDry: colorOf(0xa08f4c), meadow: colorOf(0x7aac4c),
  stone: colorOf(0x87817a),
};
const HX = {
  pinkDeep: 0x823b61, mintDeep: 0x3f7a62, vanilla: 0xd08a3e, creamCrest: 0xefc9a2,
  // The icing plateau on Frosting Peak was the BRIGHTEST surface in the aerial
  // (near-white 0xfdfbf6). Art direction: land it at ~0.78 value with sprinkle
  // relief, so it reads as thick royal icing rather than as a blown highlight.
  whipMid: 0xd9c4b2, whipTop: 0xd4ccc0, sugarSand: 0xe8dcc0, sandWet: 0x967f64,
  foam: 0xfffdf8, bankStain: 0x58202f, caramel: 0xa86c2d, caramelShore: 0xbe7f34,
  chocolate: 0x54301b, lilac: 0xb485e5, lakeLace: 0x8a5a33,
  cliffRock: 0x7d5f94, cliffLedge: 0xd6c2e4,
  pathDust: 0xa98b78, catPathDust: 0xa2957c, slopeRose: 0x7a3358,
  grassHi: 0xa8bd66, grassShade: 0x3c5a34, grassDry: 0x9a8d52, meadow: 0x70a04e,
  catSand: 0xd4af7f, catSandWet: 0x86725c, harbourDust: 0xb7a586, catShoulder: 0x5c5244,
  stoneLit: 0xaca399,
  plazaBase: 0x8e6236,          // Gumdrop Village square: toasted wafer
};

// ── Candyland: saturated frosting terrain ────────────────────────────────────
function candyPaint(world, x, z, h, grad, rel, coast, out, lakeSurf, sd) {
  // Domain warp first: the zone boundaries then read as frosting spread with a
  // palette knife instead of soft noise blobs.
  const wx = x + swirlN.fbm(x * 0.0082, z * 0.0082, 2) * 30;
  const wz = z + swirlN.fbm(x * 0.0082 + 21.7, z * 0.0082 - 9.3, 2) * 30;
  const nz = zoneN.fbm(wx * 0.0125, wz * 0.0125, 3);
  // Zone boundary width is measured in WORLD UNITS (divide the noise value by
  // its own gradient), because thresholding |nz| directly makes the transition
  // as wide as the local noise slope is shallow — a hard cut on a steep bit of
  // noise and a huge wash on a flat bit. `su` below is "signed units from the
  // strawberry/mint boundary", jittered so the boundary is never a clean curve.
  const E = 1.5;
  const gx = zoneN.fbm((wx + E) * 0.0125, wz * 0.0125, 3) - zoneN.fbm((wx - E) * 0.0125, wz * 0.0125, 3);
  const gz = zoneN.fbm(wx * 0.0125, (wz + E) * 0.0125, 3) - zoneN.fbm(wx * 0.0125, (wz - E) * 0.0125, 3);
  const gn = Math.hypot(gx, gz) / (2 * E) + 1e-7;
  const su = nz / gn + jit(x, z, 0.085, 2.1) + jit(x, z, 0.031, 1.7);
  // 5-unit blend band, noise-broken: no decal cut, no bright rim.
  const zt = smooth(-2.6, 2.6, su);                         // 0 strawberry → 1 mint
  const col = out.copy(C.pink).lerp(C.mint, zt);

  // Buttercream, but NOT as a rope on the seam. A bright vanilla line tracing
  // the zone boundary is exactly the "bright rim on a hard decal cut" that
  // reads as a sticker edge. Instead the cream appears as its own broken
  // lobes, deliberately kept OFF the seam (the `1 - seamNear` term), so the two
  // frostings simply blend into each other where they meet.
  const seamNear = 1 - smooth(1.0, 5.2, Math.abs(su));
  const rib = patchN.fbm(wx * 0.024 + 5.5, wz * 0.024 - 3.2, 2);
  const lobe = 1 - smooth(0.004, 0.017, Math.abs(rib + jit(x, z, 0.06, 0.003)));
  const van = clamp01(lobe * 0.70 * (1 - seamNear * 0.5));
  toward(col, HX.vanilla, van * 0.50);

  // mid-scale frosting blotches (value, not hue) + the two-scale ±8% mottle
  const blot = grainN.fbm(x * 0.055, z * 0.055, 2);
  col.multiplyScalar(0.90 + 0.22 * (blot * 0.5 + 0.5));
  col.multiplyScalar((1 + mottleA.fbm(x * 0.022, z * 0.022, 2) * 0.062 + mottleB.fbm(x * 0.082 + 9, z * 0.082 - 4, 2) * 0.034) * 0.94);

  // local relief: hollows go deep and syrupy, crests take a sugar dusting
  if (rel < 0) {
    col.multiplyScalar(1 + rel * 0.17);
    toward(col, zt > 0.5 ? HX.mintDeep : HX.pinkDeep, clamp01(-rel) * 0.44);
  } else {
    toward(col, HX.creamCrest, rel * 0.13);
  }

  // steep frosting takes a deeper rose shadow
  const st = smooth(0.035, 0.26, grad);
  col.multiplyScalar(1 - st * 0.26);
  toward(col, HX.slopeRose, st * 0.30);

  // whipped cream on Frosting Peak
  const dPeak = Math.hypot(x + 175, z + 62);
  const whip = clamp01(Math.max(smooth(8.6, 12.8, h + jit(x, z, 0.07, 0.5)), (1 - smooth(15, 30, dPeak)) * smooth(5.5, 9.5, h)));
  toward(col, HX.whipMid, whip * 0.82);
  toward(col, HX.whipTop, smooth(0.55, 1.0, whip) * 0.72);

  // ── river banks ───────────────────────────────────────────────────────────
  // A CARVED CHANNEL, not a decal: world.js already digs 1.7–2.6 units here, so
  // the banks are painted dark and syrup-stained all the way to the crust lip
  // (the raised white ridge itself is real geometry — see water.js
  // buildRiverLip). r3 read the river as "a flat decal" because the frosting ran
  // right up to the water at full brightness.
  const rd = world.riverDist(x, z) + jit(x, z, 0.10, 0.9);
  const bank = (1 - smooth(2.6, 9.5, rd)) * smooth(0.25, 1.4, h);
  toward(col, HX.bankStain, bank * 0.92);
  col.multiplyScalar(1 - bank * 0.26);
  const rHalf = world.RIVER.width * 0.5;
  const riverWet = (1 - smooth(rHalf + 0.3, rHalf + 2.6, rd)) * smooth(0.0, 1.0, h);
  toward(col, HX.sandWet, riverWet * 0.42);
  toward(col, HX.foam, (1 - smooth(rHalf - 0.2, rHalf + 1.1, rd)) * smooth(-0.2, 0.8, h) * 0.34);

  // Chocolate Lake: a caramel crust along the waterline and a chocolate-stained
  // basin below it (world.js carves the bowl; lakeSurf is the water level).
  const dl = Math.hypot(x - world.LAKE.x, z - world.LAKE.z) + jit(x, z, 0.09, 1.2);
  const basin = (1 - smooth(12, 20, dl)) * (1 - smooth(lakeSurf - 0.6, lakeSurf + 0.05, h));
  toward(col, HX.chocolate, basin * 0.80);
  // the caramel shore is a RING, not a wash: keep it inside ~1.2 units of the
  // waterline or the whole lake basin reads as tan mud
  const lakeRim = (1 - smooth(14, 21, dl)) * (1 - smooth(0.18, 1.2, Math.abs(h - lakeSurf)));
  toward(col, HX.caramelShore, lakeRim * 0.85);
  // a pale chocolate-foam lace exactly on the lake waterline (2 u ring)
  const lakeFoam = (1 - smooth(16, 22, dl)) * (1 - smooth(0.05, 0.75, Math.abs(h - lakeSurf + 0.15)));
  toward(col, HX.lakeLace, lakeFoam * 0.55);

  // ── Gumdrop Cliffs ────────────────────────────────────────────────────────
  // world.height() gives a 9-unit bluff here whose seaward rim runs at 0.8–1.0
  // rise/run — a real cliff that read as a lilac hill because nothing marked
  // the face. `rock` drives a banded stone material in the fragment shader.
  const dg = Math.hypot(x + 222, z - 18);
  const cliffZone = 1 - smooth(24, 58, dg + jit(x, z, 0.05, 3.5));
  toward(col, HX.lilac, cliffZone * 0.22);
  let rock = clamp01(smooth(0.30, 0.66, grad)) * (0.30 + 0.70 * cliffZone);
  rock = Math.max(rock, clamp01(smooth(0.10, 0.30, grad)) * cliffZone);
  rock *= clamp01(smooth(0.8, 2.2, h));                    // the beach below is sand, not rock
  toward(col, HX.cliffRock, rock * 0.86);
  col.multiplyScalar(1 - rock * 0.20);

  // beaches — white sugar sand, damp band, then a foam line at the water.
  // Bands are keyed off `sd` (signed WORLD-UNIT distance to the waterline), not
  // off height: on a shallow shelf a height band is 30 units wide and on a
  // steep one it vanishes, which is why the shore used to read as a stripe of
  // paint in some places and nothing at all in others.
  const sdj = sd + jit(x, z, 0.13, 1.25) + jit(x, z, 0.045, 1.0);
  const beach = (1 - smooth(1.2, 9.5, sdj)) * coast;
  toward(col, HX.sugarSand, beach * 0.95);
  const wet = (1 - smooth(0.4, 3.0, sdj)) * smooth(-2.5, -0.4, -sdj) * coast;
  toward(col, HX.sandWet, wet * 0.80);
  const foamL = (1 - smooth(0.0, 1.35, Math.abs(sdj - 0.25))) * coast;
  toward(col, HX.foam, foamL * 0.85);

  // path shoulders: a soft SUGAR-DUST verge, warm, not the cold near-black band
  // that used to widen the licorice by 2 units on each side.
  const np2 = world.nearestPath(x, z, 'candy');
  let pathT = 0, edgeAO = 0;
  if (np2.path) {
    const hwp = np2.path.width * 0.5;
    const dj = np2.d + jit(x, z, 0.30, 0.32);
    pathT = 1 - smooth(hwp + 0.1, hwp + 1.9, dj);
    // a narrow occlusion trough exactly at the kerb line
    edgeAO = 1 - smooth(0, 1.5, Math.abs(dj - (hwp + 0.15)));
  }
  toward(col, HX.pathDust, pathT * 0.30);

  // ── GUMDROP VILLAGE SQUARE ────────────────────────────────────────────────
  // world.js flattens this landmark core to a level pad, and r3 read it as "an
  // untextured bare pink slab" with the houses sitting on top of it. It gets a
  // real plaza: wafer/cookie cobbles with sprinkle grout, a worn track across
  // and a sugar kerb where it meets the frosting (see the fragment shader). The
  // raw 0..1 mask is carried through so the shader can find the kerb band.
  // (a village square is a MADE thing — the edge wobbles, but only a little, or
  // the kerb stops reading as one continuous ring)
  const dv = Math.hypot(x + 140, z - 40) + jit(x, z, 0.075, 1.5) + jit(x, z, 0.022, 1.1);
  let plazaRaw = clamp01(smooth(23.8, 19.0, dv));
  plazaRaw *= clamp01(1 - beach * 0.9) * (1 - clamp01(bank));
  toward(col, HX.plazaBase, clamp01(smooth(0.35, 0.85, plazaRaw)) * 0.88);

  // Props and plants own the saturation here; the ground stays a quiet
  // mid-tone so their silhouettes separate (brief: colour hierarchy).
  // Measured: props render at sat 0.55–0.63, so the ground wants ≈0.38–0.42 —
  // a third less, NOT the 0.13–0.20 that quiet(0.30) was producing.
  quiet(col, 0.14 * (1 - whip * 0.6) * (1 - pathT * 0.5));

  // ── PINK-ZONE GRADE (art direction, r3) ───────────────────────────────────
  // The strawberry frosting measured as saturated as the props standing on it
  // (S ≈ 0.7), so nothing separated. Pull ~15% of the chroma and ~8% of the
  // value out of the strawberry lobes ONLY — mint, cream, sand, rock, the
  // plaza, the paths and the whipped peak are all left alone.
  const pinkZone = clamp01(1 - zt) * (1 - whip) * (1 - beach * 0.9) * (1 - rock)
    * (1 - pathT * 0.6) * (1 - plazaRaw * 0.9);
  // measured after r4 pass 1: the value had already come down ~13% (the stronger
  // contact AO helps), but the CHROMA had barely moved — and chroma is the axis
  // the critic named. So most of the budget goes into quiet() now.
  quiet(col, 0.28 * pinkZone);
  col.multiplyScalar(1 - 0.035 * pinkZone);

  const dry = clamp01((1 - beach * 0.95) * (1 - wet));
  // SPRINKLES ARE AN ACCENT, NOT A GROUND COVER. Spread over the whole island
  // this field was being read (by every critic) as a uniform confetti scatter
  // belonging to vegetation. They now drift where people walk — along the
  // licorice paths, through Gumdrop Village and around Sugar Pier — and thin
  // out to almost nothing on the forest floor and in the meadow.
  let nearPath = 0;
  if (np2.path) nearPath = 1 - smooth(np2.path.width * 0.5 + 1.5, np2.path.width * 0.5 + 11.0, np2.d);
  const nearVillage = 1 - smooth(18, 44, Math.hypot(x + 140, z - 40));
  const nearDock = 1 - smooth(9, 28, Math.hypot(x + 42, z - 22));
  const spread = clamp01(Math.max(nearPath, Math.max(nearVillage, nearDock)));
  // ...and they DO land on the icing plateau (nonpareils on royal icing): the
  // (1 - whip * 1.15) term used to forbid them there, which is half of why the
  // plateau read as one blown-out white sheet.
  const sprinkle = clamp01(dry * (1 - whip * 0.35) * (1 - bank * 0.8) * (1 - pathT) * (1 - lakeRim)
    * (1 - plazaRaw * 0.7) * (0.08 + 0.92 * Math.max(spread, whip * 0.85)));
  const pipe = clamp01(dry * (1 - pathT) * (1 - lakeRim * 0.8) * (1 - bank * 0.55) * (1 - whip * 0.30)
    * (1 - plazaRaw));
  const gloss = clamp01(wet * 0.9 + bank * 0.55 + lakeRim * 0.45 + foamL * 0.4 + riverWet * 0.5);
  return {
    sprinkle, swirl: whip, wet: gloss, pipe, rock, plaza: plazaRaw,
    ao: clamp01(edgeAO * 0.85 + rock * 0.15 + clamp01(1 - Math.abs(plazaRaw - 0.30) * 4.5) * 0.55),
  };
}

// ── Cat Island: warm Mediterranean grass, sand, rocky bluffs ─────────────────
function catPaint(world, x, z, h, grad, rel, coast, out, _lakeSurf, sd) {
  const wx = x + swirlN.fbm(x * 0.0075 + 11, z * 0.0075 - 4, 2) * 22;
  const wz = z + swirlN.fbm(x * 0.0075 - 6, z * 0.0075 + 17, 2) * 22;
  const nz = zoneN.fbm(wx * 0.0125 + 40, wz * 0.0125 - 20, 3) + jit(x, z, 0.09, 0.055) + jit(x, z, 0.034, 0.045);
  const col = out.copy(C.grass).lerp(C.grassDark, clamp01(smooth(-0.30, 0.34, nz)));
  toward(col, HX.meadow, smooth(-0.55, -0.14, nz) * 0.58);

  // sun-dried hay patches
  const np = patchN.fbm(wx * 0.038 + 11, wz * 0.038 + 7, 2);
  const dry = smooth(0.10, 0.52, np + jit(x, z, 0.11, 0.07));
  toward(col, HX.grassDry, dry * 0.52);
  // deep-green shade patches at a second scale (~14 units) — the brief's
  // "darker patches"; without these the whole island measured 31 levels of
  // luminance from coast to coast
  const shade = patchN.fbm(wx * 0.072 - 21, wz * 0.072 + 33, 2);
  toward(col, HX.grassShade, smooth(0.12, 0.50, shade + jit(x, z, 0.14, 0.06)) * 0.42);

  const blot = grainN.fbm(x * 0.05 + 3, z * 0.05 - 8, 2);
  col.multiplyScalar(0.90 + 0.21 * (blot * 0.5 + 0.5));
  col.multiplyScalar((1 + mottleA.fbm(x * 0.020 + 31, z * 0.020 - 17, 2) * 0.062 + mottleB.fbm(x * 0.078 - 5, z * 0.078 + 12, 2) * 0.034) * 0.95);

  // local relief
  if (rel < 0) {
    col.multiplyScalar(1 + rel * 0.20);
    toward(col, HX.grassShade, clamp01(-rel) * 0.46);
  } else {
    toward(col, HX.grassHi, rel * 0.26);
  }
  const st = smooth(0.04, 0.28, grad);
  col.multiplyScalar(1 - st * 0.24);

  // rocky bluffs: lighthouse headland, Yarn Hill flanks, high ground
  const dLight = Math.hypot(x - 218, z - 30) + jit(x, z, 0.07, 1.6);
  const dYarn = Math.hypot(x - 188, z + 64) + jit(x, z, 0.06, 2.2);
  let stone = clamp01(smooth(0.085, 0.30, grad)) * smooth(3.0, 6.5, h);
  stone = Math.max(stone, (1 - smooth(6, 15, dLight)) * 0.85);
  stone = Math.max(stone, (1 - smooth(9, 20, dYarn)) * smooth(8.5, 11.5, h) * 0.9);
  stone = Math.max(stone, smooth(9.2, 11.6, h + jit(x, z, 0.08, 0.6)) * 0.7);
  col.lerp(C.stone, stone * 0.85);

  // beaches + foam line — constant-width rings keyed off the signed world-unit
  // distance to the waterline (see candyPaint)
  const sdj = sd + jit(x, z, 0.12, 1.2) + jit(x, z, 0.042, 0.95);
  const beach = (1 - smooth(1.1, 9.0, sdj)) * coast;
  toward(col, HX.catSand, beach * 0.95);
  const wet = (1 - smooth(0.4, 2.9, sdj)) * smooth(-2.5, -0.4, -sdj) * coast;
  toward(col, HX.catSandWet, wet * 0.74);
  const foamL = (1 - smooth(0.0, 1.30, Math.abs(sdj - 0.22))) * coast;
  toward(col, HX.foam, foamL * 0.80);

  // harbour flats get a trodden, sandier look
  const dh = Math.hypot(x - 100, z - 58) + jit(x, z, 0.10, 1.8);
  toward(col, HX.harbourDust, (1 - smooth(10, 22, dh)) * 0.38);

  const np2 = world.nearestPath(x, z, 'cat');
  let pathT = 0, edgeAO = 0;
  if (np2.path) {
    const hwp = np2.path.width * 0.5;
    const dj = np2.d + jit(x, z, 0.30, 0.32);
    pathT = 1 - smooth(hwp + 0.1, hwp + 1.9, dj);
    edgeAO = 1 - smooth(0, 1.5, Math.abs(dj - (hwp + 0.15)));
  }
  toward(col, HX.catPathDust, pathT * 0.30);

  quiet(col, 0.15 * (1 - stone * 0.5));

  const green = clamp01((1 - stone) * (1 - beach * 0.9) * (1 - pathT));
  return {
    sprinkle: green, swirl: clamp01(stone),
    wet: clamp01(wet * 0.9 + beach * 0.3 + foamL * 0.4),
    pipe: clamp01(green * (0.45 + dry * 0.55)),
    rock: clamp01(stone * 0.55), ao: clamp01(edgeAO * 0.85),
  };
}

// ── materials ────────────────────────────────────────────────────────────────
function candyMaterial(uniforms, peak) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.0 });
  return patchMaterial(m, {
    key: 'terrain-ground-candy',
    uniforms: { ...uniforms, uPeak: { value: new THREE.Vector2(peak.x, peak.z) } },
    vertexHead: /* glsl */`
      attribute vec4 aData; attribute vec3 aRock;
      varying vec4 vData; varying vec3 vRock; varying vec3 vWPos; varying vec3 vWNor;`,
    vertexBody: /* glsl */`
      vData = aData; vRock = aRock;
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWNor = normalize(mat3(modelMatrix) * objectNormal);`,
    fragmentHead: GLSL_NOISE + GLSL_AO + /* glsl */`
      varying vec4 vData; varying vec3 vRock; varying vec3 vWPos; varying vec3 vWNor;
      uniform float uTime; uniform float uDaylight; uniform vec2 uPeak;
      const vec2 PIPE_K = vec2(2.05, 1.22);      // ≈2.6 world units per swirl band
      vec2 gPipeG; float gPipeA; float gRock; float gPlaza; vec2 gPlazaG; float gWhipG; float gWhipD;
      float pipePhase(vec2 w, float n1, float n2){
        vec2 q = w + vec2(n1 - 0.5, n2 - 0.5) * 9.0;
        return dot(q, PIPE_K) + n1 * 6.0;
      }
      // Rotated + domain-warped lattice. An axis-aligned floor(w * k) grid is
      // what made the sprinkle layer read as a checkerboard from the air: the
      // cells lined up with the world axes and with each other. Rotating by an
      // irrational-ish angle and warping by a noise field breaks both.
      vec2 tWarpGrid(vec2 w, float k, float ang, float warp){
        vec2 q = w + vec2(tFbm(w * 0.031 + 4.1), tFbm(w * 0.031 - 7.3)) * warp;
        return mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * q * k;
      }`,
    fragmentColor: /* glsl */`
      {
        vec2 w = vWPos.xz;
        float vdist = length(vWPos - cameraPosition);
        // DISTANCE FADES, one per noise octave. Procedural noise is point-sampled
        // per pixel: once a pixel spans more than about half a cell the sampling
        // beats against the lattice and the ground grows soft moire blotches
        // (and shimmer in motion). Each octave therefore dies just before its own
        // cell size reaches the pixel footprint.
        float near  = 1.0 - smoothstep(45.0, 112.0, vdist);   // ~2.5 u features
        float dMid  = 1.0 - smoothstep(12.0, 42.0, vdist);    // ~0.7 u features
        float dFine = 1.0 - smoothstep(5.0, 17.0, vdist);     // ~0.15 u features
        gPipeG = vec2(0.0); gPipeA = 0.0;

        // creamy blotching at four scales so flat frosting never reads plastic.
        // The last one only exists inside 26 units: without it the frosting was
        // visibly BLURRY under the player's feet — the finest detail in the
        // whole material was a 0.74-unit blob.
        float n1 = tFbm(w * 0.075);
        float n2 = tVNoise(w * 0.40);
        float n3 = tVNoise(w * 1.35);
        float close = dMid;
        float n4 = tVNoise(w * 5.20 + vec2(3.7, -1.1));
        float blob = (n1 - 0.5) * 0.95 + (n2 - 0.5) * 1.05 * near + (n3 - 0.5) * 0.85 * dMid + (n4 - 0.5) * 0.70 * dFine;
        diffuseColor.rgb *= clamp(1.0 + 0.30 * blob, 0.45, 1.7);

        // ── Gumdrop Cliffs rock face ──────────────────────────────────────────
        // Steep ground gets vertical sugar-rock striations plus horizontal
        // bedding ledges, so a 45-degree bluff reads as a CLIFF and not as a
        // lilac hillside. Driven by the per-vertex slope mask (vRock.x).
        gRock = vRock.x * (0.45 + 0.55 * near);
        if (gRock > 0.01) {
          vec2 face = vec2(dot(w, vec2(0.78, -0.62)), dot(w, vec2(0.62, 0.78)));
          float vein = sin(face.x * 2.6 + tFbm2(w * 0.22) * 5.0);
          float ledge = sin(vWPos.y * 1.55 + tFbm2(w * 0.30 + 9.0) * 2.6);
          float shelf = smoothstep(0.55, 0.95, ledge);
          diffuseColor.rgb *= 1.0 + gRock * (vein * 0.16 + ledge * 0.10);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.30, 1.24, 1.34) + vec3(0.020, 0.017, 0.024),
                                 gRock * shelf * 0.55);
          diffuseColor.rgb *= 1.0 - gRock * smoothstep(0.45, 0.98, -ledge) * 0.22;
        }

        // ── GUMDROP VILLAGE SQUARE (-140, 40) ────────────────────────────────
        // r3: "an untextured bare pink slab". The flattened landmark core is now
        // a proper plaza — jittered wafer/cookie pavers, coloured sprinkle grout,
        // a worn diagonal track where everyone walks, and a pale sugar kerb
        // where it meets the frosting — so the houses bed into a surface instead
        // of standing on a flat pink disc. Same Voronoi construction as the Cat
        // Island cobbles, different confectionery.
        float pzRaw = vRock.z;
        gPlaza = smoothstep(0.30, 0.78, pzRaw);
        gPlazaG = vec2(0.0);
        if (gPlaza > 0.01) {
          vec2 cp = w / 1.18;
          vec2 pid = floor(cp), pf = fract(cp) - 0.5;
          float d1 = 9.0, d2 = 9.0; vec2 bid = pid;
          for (int yy = -1; yy <= 1; yy++) for (int xx = -1; xx <= 1; xx++) {
            vec2 o = vec2(float(xx), float(yy));
            vec2 cc = o + (vec2(tHash21(pid + o), tHash21(pid + o + 7.3)) - 0.5) * 0.80;
            float dd = length(pf - cc);
            if (dd < d1) { d2 = d1; d1 = dd; bid = pid + o; } else if (dd < d2) { d2 = dd; }
          }
          float grout = smoothstep(0.014, 0.098, d2 - d1);
          float rk2 = tHash21(bid + 2.9);
          vec3 wafer = mix(vec3(0.395, 0.232, 0.108), vec3(0.640, 0.452, 0.238), rk2);
          wafer *= 0.86 + 0.30 * tHash21(bid + 13.1);
          wafer *= 0.84 + 0.34 * smoothstep(0.36, 0.02, d1);            // domed pavers
          // wafer scoring on each biscuit
          float score = sin(dot(w, vec2(5.6, 3.9)) + rk2 * 6.28);
          wafer *= 1.0 + score * 0.085 * dMid;
          // SPRINKLE GROUT: coloured chips pressed into the gaps
          vec2 gg = w * 3.4;
          vec2 gid2 = floor(gg); vec2 gf = fract(gg) - 0.5;
          gf -= (vec2(tHash21(gid2 + 19.3), tHash21(gid2 + 27.1)) - 0.5) * 0.5;
          float chip = (1.0 - smoothstep(0.09, 0.17, length(gf))) * step(0.52, tHash21(gid2 + 31.7));
          vec3 gcol = vec3(0.105, 0.058, 0.042);
          gcol = mix(gcol, tSprinkleColor(tHash21(gid2 + 5.5)), chip * dMid * 0.95);
          vec3 pcol = mix(gcol, wafer, grout);
          // the worn track across the square: polished, dustier, grout filled in
          float trk = abs(dot(w - vec2(-140.0, 40.0), vec2(0.80, 0.60)) + tFbm(w * 0.055) * 5.2 - 2.6);
          float worn = 1.0 - smoothstep(1.8, 5.0, trk);
          pcol = mix(pcol, mix(pcol, vec3(0.520, 0.400, 0.262), 0.55) * 1.12, worn * 0.75);
          diffuseColor.rgb = mix(diffuseColor.rgb, pcol, gPlaza);
          // relief: paver domes + the kerb step
          gPlazaG = vec2(cos(w.x * 5.3), cos(w.y * 5.3)) * (1.0 - grout) * gPlaza * dMid;
        }

        // The KERB. It has to be drawn OUTSIDE the plaza branch: it sits where
        // gPlaza is still near zero (the outer half of the transition band), so
        // mixing it into the paver colour made it invisible. A pale pressed-sugar
        // edging, with the per-vertex AO trough from candyPaint just outside it.
        if (pzRaw > 0.02 && pzRaw < 0.92) {
          float kerb = 1.0 - smoothstep(0.0, 1.0, abs(pzRaw - 0.50) * 4.0);
          kerb *= 0.80 + 0.34 * tVNoise(w * 1.7);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.585, 0.492, 0.372), clamp(kerb, 0.0, 1.0) * 0.80);
        }

        // piped frosting swirls: broad bands with a cream highlight on the crest
        float pip = vData.w * near;
        if (pip > 0.01) {
          float ph = pipePhase(w, n1, n2);
          float band = sin(ph);
          diffuseColor.rgb *= 1.0 + pip * band * 0.19;
          // highlight the ridge crests, but back off where the frosting is
          // already bright (cream / whipped zones blow out otherwise)
          float room = 1.0 - smoothstep(0.20, 0.55, dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2)));
          diffuseColor.rgb *= 1.0 + pip * smoothstep(0.62, 1.0, band) * (0.10 + 0.22 * room);
          gPipeG = PIPE_K * cos(ph); gPipeA = pip;
        }

        // ── whipped-cream swirl on the peak ──────────────────────────────────
        // The icing plateau was the brightest surface in the whole aerial (it
        // mixed toward near-white 1.0). It now tops out around 0.78 and carries
        // real RELIEF: swirl ridges, a crystalline dimple field, and the
        // sprinkle layer is no longer forbidden up here (see candyPaint).
        float sw = vData.y;
        gWhipG = 0.0; gWhipD = 0.0;
        if (sw > 0.004) {
          vec2 d = w - uPeak;
          float r = length(d);
          float a = atan(d.y, d.x);
          float sp = sin(a * 5.0 + r * 0.42 + n1 * 4.4);
          float bandw = smoothstep(-0.35, 0.65, sp);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.780, 0.770, 0.748), sw * bandw * 0.66);
          diffuseColor.rgb *= 1.0 - sw * (1.0 - bandw) * 0.20;
          // sugar-crystal dimples: a coarse cell field that both shades and
          // tilts, so the plateau reads as set royal icing, not as paper
          float dimp = tVNoise(w * 2.3 + vec2(4.4, -2.7));
          diffuseColor.rgb *= 1.0 + (dimp - 0.5) * 0.26 * sw * dMid;
          gWhipG = sw; gWhipD = dMid;
        }

        // Sprinkles — a SPARSE accent, clustered, close to camera only.
        // Previously 72% of every 1.67-unit cell out to 168 units was filled,
        // which read across the whole island as uniform confetti litter (and
        // got blamed on vegetation). Now: ~12-18% of cells, gathered into
        // drifts by a noise field, smaller, gone by 95 units, and dimmed at
        // night so they do not glow like the ground beneath them is lit.
        float amt = vData.x * (1.0 - smoothstep(42.0, 95.0, vdist)) * mix(0.30, 1.0, uDaylight);
        if (amt > 0.02) {
          // drifts: a slow noise field decides where sprinkles gather at all
          float clus = smoothstep(0.44, 0.80, tFbm(w * 0.045 + vec2(7.3, -2.1)));
          // TWO warped lattices at different rotations and scales. One grid, at
          // any density, eventually reads as a grid; two incommensurate ones
          // read as scatter.
          for (int L = 0; L < 2; L++) {
            float k = L == 0 ? 0.60 : 0.83;
            float ang = L == 0 ? 0.73 : -1.31;
            vec2 g = tWarpGrid(w, k, ang, L == 0 ? 2.6 : 1.7);
            vec2 id = floor(g) + float(L) * 57.0, f = fract(g) - 0.5;
            float r1 = tHash21(id), r2 = tHash21(id + 11.7), r3 = tHash21(id + 23.1), r4 = tHash21(id + 41.3);
            if (r4 < (0.055 + 0.16 * clus)) {
              vec2 cc = (vec2(r1, r2) - 0.5) * 0.66;
              float a2 = r3 * 3.14159;
              vec2 p = f - cc;
              p = mat2(cos(a2), -sin(a2), sin(a2), cos(a2)) * p;
              float m = (1.0 - smoothstep(0.098, 0.132, abs(p.x))) * (1.0 - smoothstep(0.030, 0.046, abs(p.y)));
              diffuseColor.rgb = mix(diffuseColor.rgb, tSprinkleColor(r2), clamp(m * amt, 0.0, 1.0) * 0.92);
            }
          }
        }

        // sugar grain: brightest on damp sand and syrup banks. Rotated off the
        // world axes for the same reason as the sprinkles — a floor(w * 11)
        // lattice draws a visible pin-grid on a beach at close range.
        vec2 sg = mat2(0.803, -0.596, 0.596, 0.803) * w;
        float spk = smoothstep(0.955, 1.0, tHash21(floor(sg * 11.0))) * dMid;
        spk = max(spk, smoothstep(0.972, 1.0, tHash21(floor(sg * 27.0 + 3.3))) * dFine);
        diffuseColor.rgb *= 1.0 + spk * (0.20 + 0.55 * vData.z);

        // ── contact occlusion ────────────────────────────────────────────────
        // The soft dark ring where props meet the ground. This is what makes a
        // shadowless mid-day plane read as a surface objects are STANDING on.
        float ao = tContactAO(w);
        ao = mix(1.0, ao, 0.85 + 0.15 * uDaylight);
        diffuseColor.rgb *= ao;
        diffuseColor.rgb *= 1.0 - vRock.y * 0.10;          // path-kerb trough

        // the albedo is tuned for the hard midday grade; lift it a little at
        // night so the frosting stays readable instead of going to mud
        diffuseColor.rgb *= mix(1.14, 1.0, smoothstep(0.0, 0.55, uDaylight));
      }`,
    fragmentRough: /* glsl */`
      roughnessFactor = mix(roughnessFactor, 0.30, vData.z * 0.78);
      roughnessFactor = mix(roughnessFactor, 0.92, gRock * 0.8);
      roughnessFactor = mix(roughnessFactor, 0.74, gPlaza * 0.85);`,
    fragmentNormal: /* glsl */`
      {
        // the piped swirls get real relief, so the sun lights their crests
        if (gPipeA > 0.01) {
          vec3 wn = normalize(vWNor + vec3(-gPipeG.x, 0.0, -gPipeG.y) * 0.055 * gPipeA);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }
        if (gRock > 0.02) {
          vec2 w2 = vWPos.xz;
          vec2 rg = vec2(cos(dot(w2, vec2(0.78, -0.62)) * 2.6) * 0.55,
                         cos(dot(w2, vec2(0.62, 0.78)) * 0.9) * 0.20);
          vec3 wn = normalize(vWNor + vec3(-rg.x, 0.0, -rg.y) * 0.24 * gRock);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }
        // domed wafer pavers on the village square
        if (gPlaza > 0.02) {
          vec3 wn = normalize(vWNor + vec3(-gPlazaG.x, 0.0, -gPlazaG.y) * 0.085);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }
        // crystalline relief on the icing plateau. The COARSE octave (≈7 u) is
        // safe from the aerial; the fine one is faded with distance like every
        // other noise layer in this file, or the peak shimmers at 240 units.
        if (gWhipG > 0.02) {
          vec2 w3 = vWPos.xz;
          vec2 ig = (vec2(tVNoise(w3 * 0.90 + vec2(9.1, 0.0)), tVNoise(w3 * 0.90 + vec2(0.0, 9.1))) - 0.5) * 1.5
                  + (vec2(tVNoise(w3 * 2.30 + vec2(3.3, 0.0)), tVNoise(w3 * 2.30 + vec2(0.0, 3.3))) - 0.5) * 1.7 * gWhipD;
          vec3 wn = normalize(vWNor + vec3(-ig.x, 0.0, -ig.y) * 0.22 * gWhipG);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }
      }`,
  });
}

function catMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0 });
  return patchMaterial(m, {
    key: 'terrain-ground-cat',
    uniforms,
    vertexHead: /* glsl */`
      attribute vec4 aData; attribute vec3 aRock;
      varying vec4 vData; varying vec3 vRock; varying vec3 vWPos; varying vec3 vWNor;`,
    vertexBody: /* glsl */`
      vData = aData; vRock = aRock;
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWNor = normalize(mat3(modelMatrix) * objectNormal);`,
    fragmentHead: GLSL_NOISE + GLSL_AO + /* glsl */`
      varying vec4 vData; varying vec3 vRock; varying vec3 vWPos; varying vec3 vWNor;
      uniform float uTime; uniform float uDaylight;
      vec2 gTuftG; float gTuftA;`,
    fragmentColor: /* glsl */`
      {
        vec2 w = vWPos.xz;
        float vdist = length(vWPos - cameraPosition);
        // see the candy material: one distance fade per noise octave, so no layer
        // is ever sampled below its own cell size
        float near  = 1.0 - smoothstep(40.0, 105.0, vdist);   // ~1.8 u features
        float dMid  = 1.0 - smoothstep(11.0, 38.0, vdist);    // ~0.5 u features
        float close = 1.0 - smoothstep(5.0, 16.0, vdist);     // ~0.16 u features
        gTuftG = vec2(0.0); gTuftA = 0.0;

        float n1 = tFbm(w * 0.070);
        float n2 = tVNoise(w * 0.55);
        float n3 = tVNoise(w * 1.90);
        float n4 = tVNoise(w * 6.10 + vec2(-2.3, 5.9));
        float blob = (n1 - 0.5) * 1.05 + (n2 - 0.5) * 0.95 * near + (n3 - 0.5) * 0.85 * dMid + (n4 - 0.5) * 0.70 * close;
        diffuseColor.rgb *= clamp(1.0 + 0.28 * blob, 0.45, 1.7);

        // grass clumping: cool green in the tufts, dry olive between them
        float gr = vData.x;
        if (gr > 0.02) {
          float clump = smoothstep(0.42, 0.86, n2 + (n3 - 0.5) * 0.35);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.80, 0.97, 0.68), clump * gr * 0.42);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.10, 1.02, 0.72),
                                 smoothstep(0.62, 0.95, 1.0 - n2) * gr * vData.w * 0.34);
          // bladed relief so the lawn is not a flat sheet
          float ph = dot(w, vec2(3.1, 1.9)) + n1 * 7.0;
          gTuftG = vec2(3.1, 1.9) * cos(ph);
          gTuftA = gr * dMid;
          diffuseColor.rgb *= 1.0 + sin(ph) * 0.05 * gTuftA;
        }

        // stone strata on the bluffs
        float stn = vData.y;
        if (stn > 0.01) {
          float bandS = sin(vWPos.y * 2.1 + tFbm2(w * 0.35) * 3.4);
          diffuseColor.rgb *= 1.0 + stn * bandS * 0.14;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.70, 0.64), stn * smoothstep(0.55, 0.95, bandS) * 0.28);
        }

        // sugar-fine sand sparkle on the beaches (rotated off the world axes so
        // the hash lattice never draws a pin-grid on the sand)
        float sandy = vData.z * max(near, dMid);
        if (sandy > 0.02) {
          vec2 sg = mat2(0.803, -0.596, 0.596, 0.803) * w;
          float s = tHash21(floor(sg * 9.0));
          float s2 = tHash21(floor(sg * 24.0 + 7.1));
          diffuseColor.rgb *= 1.0 + (smoothstep(0.93, 1.0, s) * dMid + smoothstep(0.972, 1.0, s2) * close) * sandy * 0.38;
        }

        // Dawn/dusk bounce is strongly warm and the grass albedo answers it by
        // going olive-brown. Push the chroma back toward green while the light is
        // low — faded out at true night, where a desaturated ground is correct.
        float warmHour = (1.0 - smoothstep(0.30, 0.90, uDaylight)) * smoothstep(0.03, 0.30, uDaylight);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.88, 1.12, 0.94), warmHour * clamp(vData.x, 0.0, 1.0) * 0.85);

        // contact occlusion where props meet the ground (see the candy material)
        float ao = tContactAO(w);
        ao = mix(1.0, ao, 0.85 + 0.15 * uDaylight);
        diffuseColor.rgb *= ao;
        diffuseColor.rgb *= 1.0 - vRock.y * 0.10;
        diffuseColor.rgb *= mix(1.14, 1.0, smoothstep(0.0, 0.55, uDaylight));
      }`,
    fragmentRough: /* glsl */`
      roughnessFactor = mix(roughnessFactor, 0.44, vData.z * 0.6);`,
    fragmentNormal: /* glsl */`
      {
        if (gTuftA > 0.01) {
          vec3 wn = normalize(vWNor + vec3(-gTuftG.x, 0.0, -gTuftG.y) * 0.012 * gTuftA);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }
      }`,
  });
}

// ── builder ──────────────────────────────────────────────────────────────────
export function buildGround(ctx, id, uniforms, lakeSurf = 3.1) {
  const { world } = ctx;
  const isl = world.ISLANDS[id];
  const size = isl.radius * 2.36;
  const N = SEG, V = N + 1, step = size / N;
  const x0 = isl.center.x - size / 2, z0 = isl.center.z - size / 2;

  const H = new Float32Array(V * V);
  for (let j = 0; j < V; j++) {
    const z = z0 + j * step;
    for (let i = 0; i < V; i++) H[j * V + i] = world.height(x0 + i * step, z);
  }
  const at = (i, j) => H[Math.min(N, Math.max(0, j)) * V + Math.min(N, Math.max(0, i))];
  // local averages: ~4 units (micro bumps) and ~19 units (hills and hollows)
  const Hs = blurGrid(H, V, Math.max(1, Math.round(3.0 / step)));
  const Hw = blurGrid(H, V, Math.max(3, Math.round(14.0 / step)));
  // proximity to actual sea (not to any low ground) so beaches stay on the coast
  const wet0 = new Float32Array(V * V);
  for (let k = 0; k < V * V; k++) wet0[k] = H[k] < 0.15 ? 1 : 0;
  const Hc = blurGrid(wet0, V, Math.max(2, Math.round(7.0 / step)));

  const pos = new Float32Array(V * V * 3);
  const col = new Float32Array(V * V * 3);
  const dat = new Float32Array(V * V * 4);
  const rk = new Float32Array(V * V * 3);                  // aRock = (rock face, baked AO, plaza)
  const paint = id === 'candy' ? candyPaint : catPaint;
  const c = new THREE.Color();

  for (let j = 0; j < V; j++) {
    const z = z0 + j * step;
    for (let i = 0; i < V; i++) {
      const k = j * V + i, x = x0 + i * step, h = H[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const hx = (at(i + 1, j) - at(i - 1, j)) / (2 * step);
      const hz = (at(i, j + 1) - at(i, j - 1)) / (2 * step);
      const grad = Math.hypot(hx, hz);                     // rise / run
      // Signed distance to the waterline in WORLD UNITS: height over the local
      // slope. Every shore band (foam, wet sand, dry sugar sand) is keyed off
      // this so the rings keep a constant width on shallow and steep coasts
      // alike — height-keyed bands were 30 units wide on the flat shelves and
      // invisible on the bluffs.
      const gsm = Math.hypot((Hs[Math.min(V - 1, i + 2) + j * V] - Hs[Math.max(0, i - 2) + j * V]) / (4 * step),
        (Hs[i + Math.min(V - 1, j + 2) * V] - Hs[i + Math.max(0, j - 2) * V]) / (4 * step));
      const sd = Math.max(-40, Math.min(40, h / Math.max(0.055, Math.max(grad, gsm))));
      // relief: how high this point sits above its own neighbourhood
      const rel = Math.max(-1, Math.min(1, (h - Hw[k]) / 2.2));
      const mic = Math.max(-1, Math.min(1, (h - Hs[k]) / 0.55));
      const coast = clamp01(smooth(0.02, 0.30, Hc[k]));
      const d = paint(world, x, z, h, grad, rel, coast, c, lakeSurf, sd);
      // value shaping: dips sink, crests catch light, small bumps read too.
      // Measured lum10/90 across Cat Island was only 124/155 — 31 levels for a
      // whole island — so this is deliberately strong now.
      let f = 1 + 0.32 * rel + 0.18 * mic;
      if (h < 0.4) f = 1 + (f - 1) * 0.35;                 // keep the waterline clean
      f = Math.max(0.54, Math.min(1.42, f));
      f *= 1 - (d.ao || 0) * 0.17;                         // occlusion trough at the path kerb
      col[k * 3] = c.r * f; col[k * 3 + 1] = c.g * f; col[k * 3 + 2] = c.b * f;
      dat[k * 4] = d.sprinkle; dat[k * 4 + 1] = d.swirl; dat[k * 4 + 2] = d.wet; dat[k * 4 + 3] = d.pipe;
      rk[k * 3] = d.rock || 0; rk[k * 3 + 1] = d.ao || 0; rk[k * 3 + 2] = d.plaza || 0;
    }
  }

  const idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * V + i, b = a + 1, cc = a + V, dd = cc + 1;
    if (H[a] < CLIP_DEPTH && H[b] < CLIP_DEPTH && H[cc] < CLIP_DEPTH && H[dd] < CLIP_DEPTH) continue;
    idx.push(a, cc, b, b, cc, dd);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(dat, 4));
  geo.setAttribute('aRock', new THREE.BufferAttribute(rk, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = id === 'candy' ? candyMaterial(uniforms, world.LANDMARKS.frosting_peak) : catMaterial(uniforms);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain_ground_' + id;
  mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  return { mesh, tris: idx.length / 3, heights: H, grid: { x0, z0, step, N, V } };
}
