// ─────────────────────────────────────────────────────────────────────────────
// THE UNDERSEA CAVE — the cats' forgotten service tunnel from under the Great
// Ball of Yarn (188, -64) to the Candy Palace cellar (-150, -36).
//
// The tunnel is REAL, WALKED geometry: a 330-unit winding corridor of rock
// candy with glowing sugar-crystal clusters, syrup stalactites, a sea-glass
// skylight at the midpoint with whale and fish shadows drifting over it, cat
// warning signs and a rest nook.  You enter through a hatch in the base of the
// yarn ball (needs story flag `helper_5`, Rusty's cave key), walk the whole
// thing, and climb out into the palace cellar — which fires
// escape:success {route:'cave'} and the `escaped_cave` flag.  It works in both
// directions.
//
// WHERE IT LIVES.  The corridor is built as a self-contained diorama around
// (1400, 0) — well outside the sea mesh and every other system's footprint —
// and is hidden unless the player is actually in it.  Three engine facts force
// this, and each one has killed a version of this tunnel:
//   1. a walkable is only accepted ABOVE world.height, so nothing can be built
//      under the real sea bed;
//   2. player.js clamps the feet to WADE_FLOOR (−0.85), so a floor "under the
//      sea" at y = −4 is silently ignored and you walk in mid-air over your own
//      corridor.  The floor therefore sits at +2.2 and the FICTION does the
//      work: signage, a sea-glass skylight and whale shadows say "undersea";
//   3. the sea surface is a transparent plane at y = 0 that would draw over
//      anything placed beneath it anyway.
// Everything outside the corridor here is deep water as far as player.js is
// concerned (world.height ≈ −7), which is a second, free containment fence
// behind the wall colliders.  The ends teleport you to the real hatch under the
// Great Ball of Yarn and the real palace cellar.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hash, clamp, damp } from '../../core/util.js';
import {
  createMaterials, createBuilder, makeSignAtlas, plate,
  softGlow, lightPool, bench, C, SPRINKLE,
} from '../candy/architecture/kit.js';
import {
  signMesh, signAtlas, Site, keyGeo, glowMat, beamField, itemSpot, keySpot, winchSpot,
  nearestPathPoint, yawTo, readYaw, armYaw, mapMarker, rustyHint, drainRustyHints,
  B as PB, paint, place, colorGlowMat, nightSign, poolMesh, decorTris, rockUnder, clearanceAt,
} from './parts.js';           // vehicles' kit; shared on purpose
import { clearanceClaim } from './ride.js';

const CX = 1400, CZ = 0;            // diorama origin
// CORRIDOR FLOOR DATUM. Two hard engine limits pin this number:
//   · player.js clamps the feet with `Math.max(groundAt().h, WADE_FLOOR)`, and
//     WADE_FLOOR is −0.85 — a walkable below that is simply ignored and you
//     float over your own tunnel (this is what "y ≈ −4.4, undersea" used to do);
//   · a walkable must also sit above world.height, which is ≈ −7 out here.
// So the floor rolls between +1.7 and +5.7 and the fiction does the rest.
const FY = 2.2;
const HW = 3.0;                     // corridor half width (walkable)
const ROCK_W = 13;                  // how far the rock mass extends outward
// ── THE SIGHTLINE RULE ───────────────────────────────────────────────────────
// The in-cave lens sits `CAM.distance * sin(elevation)` above the player and
// `* cos(elevation)` back from him: at (22, 0.95) that is 17.9 up / 12.7 out.
// The ray down to the player therefore clears height 1.4 × (offset) — so
// nothing within 18 units of the centreline may stand taller than ~5.6, or the
// camera's occlusion sweep dollies in to five units and you play the game
// looking at the top of your own hat. Walls are 4.4 at 4.2 units out, the
// mid band 5.2, and only the rampart beyond 22 units is allowed to be tall.
const WALL_H = 3.8;                 // corridor wall: a trench you can see into
const MID_H = 3.6;                 // rock band behind the walls: it sits right under
                                    // the lens, so it stays LOW — at 5.2 it filled a
                                    // third of every frame with flat purple
const CEIL_Y = FY + 40;             // the cavern roof: far above the lens, and
                                    // only there to keep direct sun out (its
                                    // shadow is what makes this read as a cave)
const CAM = { elevation: 0.95, distance: 22 };

// The hatch on Cat Island: in the plinth under the Great Ball of Yarn.
const YARN = { x: 188, z: -63 };
// Angle round the plinth. NOT the 45° quadrant: the ball of yarn trails its
// loose strand down the hill there and the tube ran straight across the door.
const HATCH_A = -0.25;
// Yaw that makes the door face OUT of the plinth: a Y-rotation θ sends local +Z to
// (sin θ, cos θ), and we want that to be the outward normal (cos A, sin A) → θ = π/2 − A.
// (A + π/2 only looks right at A = 0; at 45° it turned the doorway side-on into the hill.)
const HATCH_RY = Math.PI / 2 - HATCH_A;
const HATCH = { x: YARN.x + Math.cos(HATCH_A) * 8.9, z: YARN.z + Math.sin(HATCH_A) * 8.9 };   // clear of the plinth (r 8.0)
const HATCH_STAND = { x: YARN.x + Math.cos(HATCH_A) * 11.4, z: YARN.z + Math.sin(HATCH_A) * 11.4 };

const RAW = [
  [0, -150], [13, -133], [25, -113], [19, -93], [1, -77], [-18, -61], [-26, -40], [-16, -19],
  [4, -3], [21, 13], [26, 35], [13, 55], [-7, 71], [-24, 89], [-23, 111], [-8, 129], [2, 150],
];
const PATH = RAW.map(([x, z]) => [x, z * 0.85]);

export function create(ctx, escape) {
  const { world } = ctx;
  const group = new THREE.Group(); group.name = 'underseaCave'; group.visible = false; ctx.scene.add(group);
  ctx.colliders = ctx.colliders || [];
  ctx.walkables = ctx.walkables || [];
  const rnd = rng(hash('escape:cave'));

  // ── path geometry ─────────────────────────────────────────────────────────
  const seg = [];   // { ax, az, bx, bz, len, s0 } cumulative arc length
  let total = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    seg.push({ ax, az, bx, bz, len, s0: total, ux: (bx - ax) / len, uz: (bz - az) / len });
    total += len;
  }
  /** Nearest point on the corridor centreline. Returns { d, s, ux, uz, x, z }. */
  function nearest(lx, lz) {
    let best = null;
    for (const S of seg) {
      const wx = lx - S.ax, wz = lz - S.az;
      let t = (wx * S.ux + wz * S.uz) / S.len; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = S.ax + (S.bx - S.ax) * t, pz = S.az + (S.bz - S.az) * t;
      const d = Math.hypot(px - lx, pz - lz);
      if (!best || d < best.d) best = { d, s: S.s0 + S.len * t, ux: S.ux, uz: S.uz, x: px, z: pz };
    }
    return best;
  }
  function pointAt(s) {
    s = clamp(s, 0, total);
    for (const S of seg) if (s <= S.s0 + S.len) { const t = (s - S.s0) / S.len; return { x: S.ax + (S.bx - S.ax) * t, z: S.az + (S.bz - S.az) * t, ux: S.ux, uz: S.uz }; }
    const L = seg[seg.length - 1]; return { x: L.bx, z: L.bz, ux: L.ux, uz: L.uz };
  }
  /** Floor height along the corridor: a gentle roll plus a ramp at each end. */
  const RAMP = 16;
  function floorAt(s) {
    let y = FY + Math.sin(s * 0.055) * 0.32 + Math.sin(s * 0.171) * 0.13;
    if (s < RAMP) y += (1 - s / RAMP) * 3.5;
    if (s > total - RAMP) y += (1 - (total - s) / RAMP) * 3.2;
    return y;
  }
  const CAT_END = { s: 0, ...pointAt(0) };
  const PAL_END = { s: total, ...pointAt(total) };
  const MID_S = total * 0.5;
  const mid = pointAt(MID_S);
  const nookS = total * 0.68;
  const nookP = pointAt(nookS);
  const nook = { x: nookP.x - nookP.uz * 6.4, z: nookP.z + nookP.ux * 6.4, r: 4.6, y: floorAt(nookS) };
  const chambers = [
    { x: CAT_END.x, z: CAT_END.z, r: 6.4, y: floorAt(0) },
    { x: mid.x, z: mid.z, r: 8.2, y: floorAt(MID_S) },
    { x: nook.x, z: nook.z, r: nook.r, y: nook.y },
    { x: PAL_END.x, z: PAL_END.z, r: 6.2, y: floorAt(total) },
  ];
  /** True where the rock mass must not grow (chambers, the nook, the landings). */
  function clear(x, z, pad = 3.2) {
    for (const ch of chambers) if (Math.hypot(x - ch.x, z - ch.z) < ch.r + pad) return true;
    return false;
  }
  // stair + landing pads at both ends (geometry below matches these numbers)
  const catY = floorAt(0), catLand = catY + 2.9;
  const palY = floorAt(total), palLand = palY + 3.0;
  const pads = [
    { x: CAT_END.x, hw: 3.0, z0: CAT_END.z - 5.4, z1: CAT_END.z, yA: catLand, yB: catY },
    { x: CAT_END.x, hw: 3.0, z0: CAT_END.z - 9.6, z1: CAT_END.z - 5.4, yA: catLand, yB: catLand },
    { x: PAL_END.x, hw: 2.8, z0: PAL_END.z, z1: PAL_END.z + 5.4, yA: palY, yB: palLand },
    { x: PAL_END.x, hw: 2.8, z0: PAL_END.z + 5.4, z1: PAL_END.z + 9.8, yA: palLand, yB: palLand },
  ];
  function padAt(lx, lz) {
    for (const p of pads) {
      if (lz >= p.z0 && lz <= p.z1 && Math.abs(lx - p.x) <= p.hw) {
        return p.yA + (p.yB - p.yA) * ((lz - p.z0) / (p.z1 - p.z0));
      }
    }
    return null;
  }
  const padNear = (lx, lz, m = 3.2) => pads.some((p) => lz > p.z0 - m && lz < p.z1 + m && Math.abs(lx - p.x) < p.hw + m);

  // ── materials ─────────────────────────────────────────────────────────────
  const mats = createMaterials();
  mats.crystal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0, emissive: 0x6fe0ff, emissiveIntensity: 0.45, flatShading: true });
  mats.seaglass = new THREE.MeshStandardMaterial({ color: 0x63c7f0, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.34, emissive: 0x3fa8dc, emissiveIntensity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  mats.shaft = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x8fd8ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  // THE SEA ITSELF. The corridor is a trench with an open slot overhead (the
  // lens lives up there); these panels close the vault over the rock band on
  // both sides, so every frame has a lid of lit blue-green water in the top
  // third and the daylight has somewhere to come from.
  mats.sea = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.3,
    emissive: 0x1f86ad, emissiveIntensity: 0.3, side: THREE.DoubleSide, depthWrite: false, flatShading: true,
  });
  // Godrays get their OWN additive material, a quarter the strength of the
  // skylight's shaft: four of these in frame at the skylight's opacity turned
  // the whole corridor into a white-out.
  mats.ray = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0x8fd8ff, emissiveIntensity: 0.22, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    forceSinglePass: true,   // additive: order-free, one pass (the sea/sea-glass keep two: they are not)
  });
  // wet rock at the waterline: glossy, dark, and the only low-roughness thing
  // down here apart from the crystals
  mats.wet = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.18, flatShading: true });
  // THE FLOOR — its own material so the caustics live on the walkway and not on
  // every slab in the tunnel (walls share `matteFlat`).
  mats.floorLit = makeCausticMaterial();
  const atlas = makeSignAtlas(signEntries());
  mats.sign = new THREE.MeshStandardMaterial({
    map: atlas.tex, emissiveMap: atlas.tex, emissive: 0xffffff, emissiveIntensity: 0.45,
    roughness: 0.7, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const B = createBuilder(mats, atlas.uv);
  const at = (x, y, z) => [CX + x, y, CZ + z];

  // rock candy: PASTEL crystal, not cave mud. Nothing down here gets sun (the
  // roof sees to that), so every albedo has to carry itself under ambient plus
  // four crystal lamps — the old aubergine set rendered as a navy void with a
  // straw hat floating in it.
  // Pastel, but pulled off the lavender and toward sea-green/teal: this is a
  // tunnel UNDER WATER, and the old set was a sweet shop with the lights off.
  // Nothing goes properly dark (the roof keeps the sun off and there is no
  // bounce down here) — the darkening is a wet band at the floor line instead.
  const ROCK = [0x9fb4dd, 0x92a8d2, 0xae9fd6, 0x83bdd0, 0xa6bae2];
  const MID = [0x7286b8, 0x687cae, 0x7d8ec2];
  const DEEP = [0x45518a, 0x3c467c, 0x4f5c98];
  const FLOOR = [0x7f8fc4, 0x7684ba, 0x8a97cc];
  const WET = [0x3f5a7e, 0x365070, 0x486688];
  const RIM = 0xeafaff;
  const GEM = [0x7fe8ff, 0xb98cff, 0xff8fd0, 0x8fffd8];
  const crystalSpots = [];
  const caveCols = [];
  /** Oriented box collider (wave-2 contract) that keeps the walk in the corridor.
   *  `top` is an ABSOLUTE world height: player.js only treats a collider as solid
   *  while the feet are below it. */
  function wallCol(x, z, w, d, rot, top) {
    const c = { x: CX + x, z: CZ + z, w, d, rot, h: top, box: true };
    caveCols.push(c); ctx.colliders.push(c);
    return c;
  }
  /** A sugar-crystal cluster: six spikes, a glossy base, a glow, a floor pool
   *  and an entry in crystalSpots (the four PointLights ride the nearest ones). */
  function crystalCluster(cx, cz, y, gem, s = 1) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + cx;
      B.cone('crystal', (0.32 + (i % 3) * 0.15) * s, (1.4 + (i % 4) * 0.8) * s, 5, {
        at: at(cx + Math.cos(a) * 0.55 * s, y + (0.6 + (i % 3) * 0.5) * s, cz + Math.sin(a) * 0.55 * s),
        rot: [0.3 * Math.cos(a + i), a, 0.24 * Math.sin(i)], color: gem,
      });
    }
    B.ico('gloss', 0.8 * s, 0, { at: at(cx, y + 0.3, cz), scale: [1.3, 0.5, 1.3], color: 0x8f74b0 });
    softGlow(B, CX + cx, y + 1.4 * s, CZ + cz, 3.2 * s);
    lightPool(B, CX + cx, y, CZ + cz, 3.4 * s);
    crystalSpots.push({ x: CX + cx, y: y + 1.3 * s, z: CZ + cz, color: gem, s: 0 });
  }

  // ── the corridor: floor, low walls, rock band, rampart, arches ────────────
  {
    const STEP = 2.3;
    let k = -1;
    for (let s = 0; s <= total; s += STEP) {
      k++;
      const p = pointAt(s), y = floorAt(s);
      const ang = Math.atan2(p.ux, p.uz);
      const nx = -p.uz, nz = p.ux;
      // floor slab (overlapping, so the turns have no gaps) + a glossy walked
      // strip down the middle, which is what makes the corridor read as a route
      B.box('floorLit', (HW + 2.0) * 2, 1.1, STEP + 0.6, { at: at(p.x, y - 0.55, p.z), rot: [0, ang, 0], color: FLOOR[k % FLOOR.length] });
      B.box('gloss', HW * 1.35, 0.09, STEP + 0.4, { at: at(p.x, y + 0.035, p.z), rot: [0, ang, 0], color: 0x9fc4de });
      // a licorice inlay down the centre line: the eye follows it round the
      // bends, which is most of what makes a corridor read as a ROUTE
      B.stripeBox(0.62, 0.08, STEP + 0.3, { at: at(p.x, y + 0.075, p.z), rot: [0, ang, 0], variant: 1, axisH: STEP + 0.3 });
      for (const sd of [-1, 1]) {
        const wOff = HW + 1.45;
        const wx = p.x + nx * sd * wOff, wz = p.z + nz * sd * wOff;
        if (clear(wx, wz, 0.9)) continue;          // a chamber opens up here
        // THE WALL — 3.4 tall, twice the player, low enough to see over
        const hgt = WALL_H + ((k * 3 + (sd > 0 ? 1 : 2)) % 3) * 0.34;
        B.box('matteFlat', 2.3, hgt, STEP + 0.8, {
          at: at(wx, y + hgt / 2 - 0.4, wz), rot: [0, ang, sd * 0.05], color: ROCK[(k * 2 + (sd > 0 ? 1 : 2)) % ROCK.length],
        });
        // sugar rim along the top of the wall
        B.box('icing', 2.7, 0.3, STEP + 0.8, {
          at: at(wx, y + hgt - 0.42, wz), rot: [0, ang, sd * 0.05], color: RIM,
        });
        // and a kerb where the wall meets the floor
        B.box('icing', 0.7, 0.44, STEP + 0.7, {
          at: at(p.x + nx * sd * (HW - 0.05), y + 0.2, p.z + nz * sd * (HW - 0.05)), rot: [0, ang, 0], color: 0xd8f2f8,
        });
        // THE WATERLINE. A glossy near-black band along the foot of every wall:
        // the sea has been in here, and the low-roughness strip is the only
        // thing in the tunnel that throws a specular streak back at the lens.
        B.box('wet', 2.44, 1.15, STEP + 0.85, {
          at: at(wx, y + 0.12, wz), rot: [0, ang, sd * 0.05], color: WET[k % WET.length],
        });
        B.box('wet', 0.34, 0.16, STEP + 0.8, {
          at: at(p.x + nx * sd * (HW + 0.42), y + 0.66, p.z + nz * sd * (HW + 0.42)), rot: [0, ang, 0], color: 0xbfe8f2,
        });
        // chunky rock-candy facets on the inner face, so it is not a flat slab
        B.ico('matteFlat', 0.85 + ((k * 7 + sd) % 4) * 0.3, 0, {
          at: at(p.x + nx * sd * (HW + 0.15), y + 0.65 + ((k * 5 + sd) % 3) * 0.75, p.z + nz * sd * (HW + 0.15)),
          scale: [0.7, 1.25, 1.05], rot: [0, ang + k, 0.28 * sd], color: ROCK[(k + 2) % ROCK.length],
        });
        wallCol(wx, wz, 2.5, STEP + 1.0, ang, y + hgt + 2.6);
        // the mid band: bulk rock behind the wall, still under the sightline
        if (k % 2 === 0) {
          const mh = MID_H + ((k + sd) % 3) * 0.7, o2 = HW + 2.3 + 5.4;
          B.box('matteFlat', 9.2, mh, STEP * 2 + 2.2, {
            at: at(p.x + nx * sd * o2, y + mh / 2 - 0.9, p.z + nz * sd * o2), rot: [0, ang, sd * 0.05], color: MID[(k + (sd > 0 ? 0 : 1)) % MID.length],
          });
          // knobbly rock candy on top: this band sits right under the lens and
          // fills a third of the frame, and a bare 9-unit slab reads as a flat
          // purple plane rather than as the shoulder of a tunnel
          if (k % 4 === 0) {
            const o3 = o2 + ((k % 3) - 1) * 1.7;
            B.ico('matteFlat', 1.45 + ((k * 3 + sd) % 3) * 0.5, 0, {
              at: at(p.x + nx * sd * o3, y + mh - 1.1 + ((k + sd) % 2) * 0.45, p.z + nz * sd * o3),
              scale: [1.15, 0.72, 1.1], rot: [0.2 * sd, ang + k, 0.24], color: ROCK[(k * 2 + sd) % ROCK.length],
            });
          }
        }
        // the rampart: the ONLY tall rock, and it lives 26 units out where the
        // lens never goes. It is what stops the frame ending in flat nothing.
        if (k % 4 === 0) {
          B.box('matteFlat', 18, 11 + ((k + sd) % 3) * 2.5, STEP * 4 + 8, {
            at: at(p.x + nx * sd * 26, y + 4.2, p.z + nz * sd * 26), rot: [0, ang, sd * 0.06], color: DEEP[(k + 1) % DEEP.length],
          });
        }
        // ── THE SEA OVERHEAD ────────────────────────────────────────────
        // The lens sits 18 up and 13 back along the corridor, so the slot
        // directly above the walk has to stay open — but everything LATERAL of
        // the rock band is free frame, and that is where the water goes: two
        // translucent blue-green panels per bay, tilted so they lift away from
        // the trench and close the top third of every shot.
        if (k % 2 === 0) {
          // Inner edge at 16 units out: the frame is only ±9 wide where the
          // player stands, so anything closer than that stops being a lid over
          // the far end and becomes a slab of cyan across the middle of the
          // picture. Out here the near panels read as haze on the far rock and
          // the ones up the corridor close the top of the frame.
          const so = HW + 12.4, roll = -sd * 0.30;
          B.box('sea', 17.0, 0.5, STEP * 2 + 2.8, {
            at: at(p.x + nx * sd * so, y + 8.8, p.z + nz * sd * so), rot: [0, ang, roll],
            color: [0x2fa8c0, 0x36b6c6, 0x2b93b8][(k + (sd > 0 ? 0 : 1)) % 3],
          });
          // the lit "surface" line where the water meets the rampart
          B.box('sea', 2.4, 0.34, STEP * 2 + 2.8, {
            at: at(p.x + nx * sd * (HW + 6.2), y + 7.3, p.z + nz * sd * (HW + 6.2)), rot: [0, ang, roll], color: 0x7fdcf0,
          });
        }
      }
      // ── GODRAYS ───────────────────────────────────────────────────────────
      // Additive tapered cones from the water down onto the walkway, every
      // ~11 units, so three or four are in frame wherever you stand.
      if (k % 6 === 2 && !clear(p.x, p.z, 0.6)) {
        const sd = (k % 12 === 2) ? 1 : -1;
        const bx = p.x + nx * sd * 0.9, bz = p.z + nz * sd * 0.9;
        B.cone('ray', 2.1, 9.2, 12, { at: at(bx, y + 4.5, bz), rot: [0.1 * sd, ang, sd * 0.2], open: true, color: 0xd6f4ff });
        B.disc('ray', 1.9, 18, { at: at(bx, y + 0.07, bz), rot: [-Math.PI / 2, 0, 0], scale: [1, 1.25, 1], color: 0xbfeaff });
      }
      // candy dressing: props the cats left and sweets that rolled off a crate,
      // so the walk is not 340 units of rock
      if (k % 7 === 4 && !clear(p.x, p.z, 1.2)) {
        const sd = (k % 14 === 4) ? 1 : -1;
        B.stripeCyl(0.22, 0.28, 4.0, {
          at: at(p.x + nx * sd * (HW - 0.25), y + 1.6, p.z + nz * sd * (HW - 0.25)),
          rot: [0, ang, 0.36 * sd], variant: k % 4 === 0 ? 0 : 1, seg: 7,
        });
      }
      if (k % 3 === 1 && !clear(p.x, p.z, 1.0)) {
        const sd = k % 6 === 1 ? 1 : -1;
        for (let i = 0; i < 2; i++) {
          const off = HW - 1.0 - i * 0.55, along = (i - 0.5) * 0.8;
          B.ico("gloss", 0.2 + ((k + i) % 3) * 0.07, 0, {
            at: at(p.x + nx * sd * off + p.ux * along, y + 0.18, p.z + nz * sd * off + p.uz * along),
            scale: [1, 0.78, 1], color: SPRINKLE[(k + i) % SPRINKLE.length],
          });
        }
      }
      // an arch portal every ~32 u: you walk under it, it does not sit over you
      if (k % 9 === 2 && !clear(p.x, p.z, 1.0)) {
        for (const sd of [-1, 1]) {
          B.box('matteFlat', 1.7, 3.4, 1.2, { at: at(p.x + nx * sd * (HW + 0.05), y + 1.9, p.z + nz * sd * (HW + 0.05)), rot: [0, ang, sd * 0.34], color: DEEP[k % DEEP.length] });
        }
        B.box('matteFlat', HW * 2 + 1.0, 0.9, 1.2, { at: at(p.x, y + 4.0, p.z), rot: [0, ang, 0], color: DEEP[(k + 2) % DEEP.length] });
        B.box('icing', HW * 2 + 1.3, 0.26, 1.4, { at: at(p.x, y + 4.55, p.z), rot: [0, ang, 0], color: RIM });
        for (const sd of [-1, 1]) B.cone('crystal', 0.3, 1.1, 5, { at: at(p.x + nx * sd * (HW - 0.3), y + 3.5, p.z + nz * sd * (HW - 0.3)), rot: [Math.PI, 0, sd * 0.3], color: GEM[k % GEM.length] });
      }
      // sugar-crystal clusters every ~11 u, alternating sides
      if (k % 5 === 0 && s > 6 && s < total - 6) {
        const sd = (k % 10 === 0) ? 1 : -1;
        const cx = p.x + nx * sd * (HW - 0.45), cz = p.z + nz * sd * (HW - 0.45);
        const gem = GEM[k % GEM.length];
        if (clear(cx, cz, 0.5)) continue;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + s;
          B.cone('crystal', 0.32 + (i % 3) * 0.15, 1.4 + (i % 4) * 0.8, 5, {
            at: at(cx + Math.cos(a) * 0.55, y + 0.6 + (i % 3) * 0.5, cz + Math.sin(a) * 0.55),
            rot: [0.3 * Math.cos(a + i), a, -sd * 0.5 + 0.2 * Math.sin(i)], color: gem,
          });
        }
        B.ico('gloss', 0.8, 0, { at: at(cx, y + 0.3, cz), scale: [1.3, 0.5, 1.3], color: 0x8f74b0 });
        softGlow(B, CX + cx, y + 1.4, CZ + cz, 3.2);
        lightPool(B, CX + cx, y, CZ + cz, 3.4);
        crystalSpots.push({ x: CX + cx, y: y + 1.3, z: CZ + cz, color: gem, s });
      }
      // syrup stalactites, hanging off the wall heads
      if (k % 4 === 3) {
        const sd = (k % 8 === 3) ? -1 : 1;
        const dx = p.x + nx * sd * (HW - 0.5), dz = p.z + nz * sd * (HW - 0.5);
        const L = 0.9 + ((s * 0.7) % 2) * 0.8;
        if (clear(dx, dz, 0.5)) continue;
        B.cone('flow', 0.24, L, 6, { at: at(dx, y + WALL_H - 0.4 - L / 2, dz), rot: [Math.PI, 0, 0], color: 0xc4783c });
        B.ico("flow", 0.3, 0, { at: at(dx, y + WALL_H - 0.5 - L, dz), color: 0xc4783c });
        B.ico("flow", 0.7, 0, { at: at(dx, y + 0.07, dz), scale: [1, 0.09, 1], color: 0x9a5a2c });
      }
    }
  }

  // ── the shell: a ground plate under everything, a rock horizon, and a roof ─
  // No sky is ever in frame: the lens looks DOWN (pitch −55°, half-fov 15°), so
  // the far edge of the picture lands on the plate about 30 units out. The roof
  // is 40 up — far above the lens, never in shot — and exists only to keep the
  // sun off, which is what makes this read as a cave instead of a quarry.
  B.box('matteFlat', 170, 2.4, 400, { at: at(0, FY - 2.9, 0), color: 0x8a72b4 });   // same family as the floor: where it shows past a bend it must read as more rock, not a void
  for (const sd of [-1, 1]) {
    B.box('matteFlat', 150, 26, 10, { at: at(0, FY + 8, sd * 150), color: DEEP[1] });
    B.box('matteFlat', 10, 26, 320, { at: at(sd * 70, FY + 8, 0), color: DEEP[2] });
  }
  const roof = (() => {
    const g = new THREE.BoxGeometry(220, 3, 430);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3a2b4c, roughness: 0.95 }));
    m.position.set(CX, CEIL_Y, CZ); m.receiveShadow = false; m.castShadow = true;   // culled: never in shot, still in the shadow frustum
    m.name = 'cave_roof'; group.add(m); return m;
  })();

  // ── chambers: floors that widen the corridor ──────────────────────────────
  for (const ch of chambers) {
    B.cyl('floorLit', ch.r + 1.6, ch.r + 2.0, 1.1, 16, { at: at(ch.x, ch.y - 0.55, ch.z), color: FLOOR[1] });
    B.cyl('gloss', ch.r + 0.5, ch.r + 0.5, 0.08, 16, { at: at(ch.x, ch.y + 0.03, ch.z), color: 0x9fc4de });
    // the sea closes over the chamber too — eight panels on a ring, lifting
    // outward, with the open oculus left over the middle where the lens lives
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.39, rr = ch.r + 14.0;
      B.box('sea', 15.5, 0.5, 12.5, {
        at: at(ch.x + Math.cos(a) * rr, ch.y + 8.8, ch.z + Math.sin(a) * rr), rot: [0, -a, 0.30],
        color: [0x2fa8c0, 0x36b6c6, 0x2b93b8][i % 3],
      });
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = ch.r + 2.4;
      const bx = ch.x + Math.cos(a) * rr, bz = ch.z + Math.sin(a) * rr;
      if (nearest(bx, bz).d < HW + 1.6 || padNear(bx, bz)) continue;   // keep ways in/out open
      const hh = WALL_H + (i % 3) * 0.45;
      B.box('matteFlat', 4.4, hh, 4.4, { at: at(bx, ch.y + hh / 2 - 0.5, bz), rot: [0, -a, 0.08 * ((i % 3) - 1)], color: ROCK[i % ROCK.length] });
      B.box('icing', 4.6, 0.28, 4.6, { at: at(bx, ch.y + hh - 0.5, bz), rot: [0, -a, 0.08 * ((i % 3) - 1)], color: RIM });
      wallCol(bx, bz, 4.6, 4.6, -a, ch.y + hh + 2.6);
      B.box('matteFlat', 11, MID_H + 0.6, 7.0, { at: at(ch.x + Math.cos(a) * (rr + 7), ch.y + 2.2, ch.z + Math.sin(a) * (rr + 7)), rot: [0, -a, 0], color: MID[i % MID.length] });
      if (i % 4 === 0) B.box('matteFlat', 16, 12, 12, { at: at(ch.x + Math.cos(a) * (rr + 20), ch.y + 4.5, ch.z + Math.sin(a) * (rr + 20)), rot: [0, -a, 0], color: DEEP[i % DEEP.length] });
    }
  }

  // ── the two landings: rock cheeks + colliders, so a visitor who misses the
  // stair steps down into the chamber instead of off the edge of the world ──
  for (const [p, dir] of [[pads[1], -1], [pads[3], 1]]) {
    const top = Math.max(p.yA, p.yB), zc = (p.z0 + p.z1) / 2, zl = p.z1 - p.z0;
    for (const sd of [-1, 1]) {
      B.box('matteFlat', 1.6, WALL_H + 0.6, zl + 0.8, { at: at(p.x + sd * (p.hw + 0.8), top + (WALL_H + 0.6) / 2 - 0.5, zc), color: ROCK[(sd > 0 ? 1 : 3)] });
      B.box('icing', 1.8, 0.28, zl + 0.8, { at: at(p.x + sd * (p.hw + 0.8), top + WALL_H - 0.4, zc), color: RIM });
      wallCol(p.x + sd * (p.hw + 0.8), zc, 1.8, zl + 0.9, 0, top + WALL_H + 2.4);
    }
    // the blind end behind the stair head (clear of the doors, which are at ±10)
    const far = dir > 0 ? p.z1 + 1.7 : p.z0 - 1.7;
    B.box('matteFlat', p.hw * 2 + 3.2, WALL_H + 1.2, 1.8, { at: at(p.x, top + (WALL_H + 1.2) / 2 - 0.5, far), color: ROCK[2] });
    wallCol(p.x, far, p.hw * 2 + 3.2, 1.8, 0, top + WALL_H + 2.4);
  }

  // ═══════════════════════════════════════════════ CAT END (the hatch) ══════
  {
    const p = CAT_END, y = catY, ly = catLand;
    // stair up to the hatch landing (matches pads[0]: z0-5.4 → z0, catLand → y)
    for (let i = 0; i < 5; i++) {
      const zc = p.z - 0.54 - i * 1.08;
      B.box('matteFlat', 6.0, 1.2 + i * 0.58, 1.12, { at: at(p.x, y + 0.58 * (i + 1) - (1.2 + i * 0.58) / 2, zc), color: ROCK[(i + 1) % ROCK.length] });
      B.box('gloss', 5.4, 0.07, 1.0, { at: at(p.x, y + 0.58 * (i + 1) + 0.04, zc), color: 0xc3a9e4 });
    }
    // landing (pads[1]) under the hatch
    B.box('matteFlat', 6.6, 3.4, 4.4, { at: at(p.x, ly - 1.7, p.z - 7.5), color: ROCK[2] });
    // The hatch overhead: the underside of the yarn-ball plinth. It hangs at 5
    // — high enough that the lens ray (1.4 × offset) clears a 2.3-radius disc
    // while you stand under it, which a 3.4 ceiling did not.
    B.cyl('waffle', 2.3, 2.3, 0.5, 14, { at: at(p.x, ly + 5.0, p.z - 7.5), color: C.waferDark });
    B.tor('licorice', 2.35, 0.2, 6, 16, { at: at(p.x, ly + 4.8, p.z - 7.5), rot: [Math.PI / 2, 0, 0], color: C.licorice });
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; B.sph('gloss', 0.22, 7, 6, { at: at(p.x + Math.cos(a) * 1.9, ly + 4.7, p.z - 7.5 + Math.sin(a) * 1.9), color: C.yellow }); }
    for (const s2 of [-1, 1]) B.cyl('licorice', 0.14, 0.14, 4.6, 6, { at: at(p.x + s2 * 1.0, ly + 2.3, p.z - 6.2), color: C.licorice });
    for (let i = 0; i < 7; i++) B.cyl('licorice', 0.1, 0.1, 2.0, 5, { at: at(p.x, ly + 0.5 + i * 0.62, p.z - 6.2), rot: [0, 0, Math.PI / 2], color: C.licoriceSoft });
    // The arrival chamber is the first thing anyone sees underground, so it is
    // dressed: three crystal clusters round the rim, the cats' fish store, a
    // door mat and a line of paw prints heading off down the corridor.
    for (let i = 0; i < 3; i++) {
      const a = 1.1 + i * 1.75;
      crystalCluster(p.x + Math.cos(a) * 4.9, p.z + Math.sin(a) * 4.9, y, GEM[(i + 1) % GEM.length], 1.15);
    }
    B.box('matte', 3.2, 0.1, 1.9, { at: at(p.x, y + 0.06, p.z - 4.3), rot: [0, 0.06, 0], color: 0xc4566a });
    B.box('icing', 2.6, 0.06, 1.3, { at: at(p.x, y + 0.12, p.z - 4.3), rot: [0, 0.06, 0], color: 0xf0b6c4 });
    for (let i = 0; i < 6; i++) {
      const t = i / 5, pz = p.z - 3.2 + t * 5.6;
      for (const sd of [-1, 1]) {
        B.ico("licorice", 0.12, 0, { at: at(p.x + sd * 0.38 + Math.sin(t * 5.2) * 0.35, y + 0.07, pz), scale: [1, 0.2, 1.35], color: 0x7b62a0 });
      }
    }
    // fish crates: the cats have been storing things down here
    for (let i = 0; i < 4; i++) {
      const bx = p.x - 4.2 + (i % 2) * 1.6, bz = p.z + 2.6 + (i > 1 ? 1.7 : 0);
      B.box('waffle', 1.5, 1.1, 1.2, { at: at(bx, y + 0.55 + (i > 1 ? 1.1 : 0), bz), rot: [0, 0.3 * i, 0], color: C.wafer });
      B.box('waffle', 1.58, 0.14, 1.28, { at: at(bx, y + 1.12 + (i > 1 ? 1.1 : 0), bz), rot: [0, 0.3 * i, 0], color: C.waferDark });
      B.box('licorice', 1.62, 0.1, 0.22, { at: at(bx, y + 0.85 + (i > 1 ? 1.1 : 0), bz), rot: [0, 0.3 * i, 0], color: C.licoriceSoft });
    }
    B.signQuad('cave_nohumans', 4.6, 1.72, { at: at(p.x + 3.4, y + 2.6, p.z - 1.0), rot: [0, -0.7, 0.06] });
    B.signQuad('cave_hatch', 3.0, 0.76, { at: at(p.x, ly + 0.9, p.z - 6.3), rot: [0, Math.PI, 0] });
  }

  // ═══════════════════════════════════════════ MIDPOINT (the skylight) ══════
  const fishGroup = new THREE.Group(); group.add(fishGroup);
  {
    // The skylight sits LOW — 6.8 over the floor, on a ring of stubby piers —
    // because a 9-unit oculus drum this close to the walk is exactly the thing
    // the camera would dolly away from. You still crane up at it.
    const y = floorAt(MID_S), gy = y + 6.8, GR = 5.0;
    // sea-glass pane + the rock oculus ring it is set into
    B.disc('seaglass', GR, 22, { at: at(mid.x, gy, mid.z), rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const rr = GR + 1.1;
      B.box('matteFlat', 2.6, 1.5, 2.6, { at: at(mid.x + Math.cos(a) * rr, gy - 0.35, mid.z + Math.sin(a) * rr), rot: [0, -a, 0.16], color: ROCK[(i + 1) % ROCK.length] });
      B.box('icing', 2.4, 0.24, 2.4, { at: at(mid.x + Math.cos(a) * rr, gy + 0.45, mid.z + Math.sin(a) * rr), rot: [0, -a, 0.16], color: RIM });
      B.cone('crystal', 0.32, 1.4, 5, { at: at(mid.x + Math.cos(a) * (GR + 0.4), gy - 1.5, mid.z + Math.sin(a) * (GR + 0.4)), rot: [Math.PI + 0.22 * Math.cos(a), -a, 0.22 * Math.sin(a)], color: GEM[i % GEM.length] });
      // piers: four of them only, so the chamber stays open to the lens
      if (i % 4 === 1) {
        const pr = GR + 1.4;
        B.box('matteFlat', 1.5, gy - y - 0.9, 1.5, { at: at(mid.x + Math.cos(a) * pr, (gy + y) / 2 - 0.4, mid.z + Math.sin(a) * pr), rot: [0, -a, 0], color: MID[i % MID.length] });
      }
    }
    // the shaft of daylight coming down through the water
    B.cyl('shaft', GR - 0.4, 2.8, gy - y - 0.2, 18, { at: at(mid.x, (gy + y) / 2, mid.z), open: true, color: 0xbfeaff });
    B.disc('shaft', 3.0, 20, { at: at(mid.x, y + 0.06, mid.z), rot: [-Math.PI / 2, 0, 0], color: 0xbfeaff });
    B.signQuad('cave_glass', 3.4, 1.28, { at: at(mid.x - 5.2, y + 2.2, mid.z + 4.4), rot: [0, 0.9, 0] });
    // a bench for the view + a crystal lamp
    bench(B, CX + mid.x + 3.6, y, CZ + mid.z + 3.0, -0.9);
    // fish + one whale drifting over the glass (one instanced draw call)
    const fishGeo = (() => {
      const body = new THREE.SphereGeometry(0.5, 10, 7); body.scale(1.9, 0.62, 0.8);
      const tail = new THREE.ConeGeometry(0.42, 0.9, 5); tail.rotateZ(Math.PI / 2); tail.translate(-1.15, 0, 0); tail.scale(1, 1.1, 0.35);
      const g = mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()], false);
      body.dispose(); tail.dispose();
      return g;
    })();
    const fishMat = new THREE.MeshStandardMaterial({ color: 0x123246, roughness: 0.9, transparent: true, opacity: 0.62, depthWrite: false });
    const fish = new THREE.InstancedMesh(fishGeo, fishMat, 9);
    fish.name = 'cave_fish'; fish.castShadow = false; fish.receiveShadow = false;
    fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fish.frustumCulled = false;
    fishGroup.add(fish);
    fishGroup.userData.list = [];
    for (let i = 0; i < 9; i++) {
      const whale = i === 0;
      // radii kept inside the pane, or the silhouettes drift off the glass and
      // swim through solid rock
      fishGroup.userData.list.push({
        r: whale ? 6.2 : 1.4 + rnd() * 3.2, sp: (whale ? 0.11 : 0.42 + rnd() * 0.5) * (rnd() < 0.5 ? -1 : 1),
        ph: rnd() * 7, y: gy + (whale ? 3.0 : 0.8 + rnd() * 1.8), s: whale ? 4.2 : 0.6 + rnd() * 0.7,
        bob: 0.5 + rnd(),
      });
    }
    fishGroup.userData.mesh = fish;
    fishGroup.userData.geo = fishGeo; fishGroup.userData.mat = fishMat;
    fishGroup.position.set(CX + mid.x, 0, CZ + mid.z);
  }

  // ── fish EVERYWHERE, not only over the skylight ───────────────────────────
  // Eight silhouettes cruising above the sea panels, crossing the slot over the
  // walk. They ride with the player (see update) so the tunnel is never empty
  // water, at one extra draw call.
  const drift = new THREE.InstancedMesh(fishGroup.userData.geo, fishGroup.userData.mat, 8);
  drift.name = 'cave_fish_drift'; drift.castShadow = false; drift.receiveShadow = false;
  drift.instanceMatrix.setUsage(THREE.DynamicDrawUsage); drift.frustumCulled = false;
  group.add(drift);
  const driftList = [];
  for (let i = 0; i < 8; i++) {
    driftList.push({
      lane: -3 + (i % 4) * 7,                 // metres along the corridor, ahead/behind
      sp: (0.10 + (i % 3) * 0.045) * (i % 2 ? 1 : -1),
      ph: rnd() * 1, up: 8.6 + (i % 3) * 1.5, s: 0.75 + rnd() * 0.85,
    });
  }

  // ═══════════════════════════════════════════════════════ REST NOOK ════════
  {
    const y = nook.y;
    bench(B, CX + nook.x - 1.2, y, CZ + nook.z - 1.0, 2.2);
    B.box('waffle', 2.4, 0.9, 1.6, { at: at(nook.x + 1.8, y + 0.45, nook.z + 0.6), rot: [0, 0.4, 0], color: C.wafer });
    B.sph('glowWarm', 0.42, 10, 8, { at: at(nook.x + 1.8, y + 1.25, nook.z + 0.6), color: C.lampAmber });
    softGlow(B, CX + nook.x + 1.8, y + 1.25, CZ + nook.z + 0.6, 3.2);
    lightPool(B, CX + nook.x + 1.8, y, CZ + nook.z + 0.6, 2.6);
    // a cat-sized bedroll and three fish bones
    B.box('matte', 2.2, 0.3, 1.3, { at: at(nook.x - 2.4, y + 0.15, nook.z + 1.6), rot: [0, 0.25, 0], color: 0xc4566a });
    B.sph('icing', 0.5, 9, 7, { at: at(nook.x - 3.2, y + 0.42, nook.z + 1.5), scale: [1, 0.7, 1], color: C.cream });
    for (let i = 0; i < 3; i++) B.cyl('icing', 0.06, 0.06, 0.7, 5, { at: at(nook.x + 2.6 + i * 0.3, y + 0.06, nook.z + 2.0), rot: [0, i * 0.9, Math.PI / 2], color: C.cream });
    B.signQuad('cave_nook', 2.8, 1.05, { at: at(nook.x - 0.2, y + 2.5, nook.z - 2.6), rot: [0, 0.2, 0] });
    crystalSpots.push({ x: CX + nook.x + 1.8, y: y + 1.25, z: CZ + nook.z + 0.6, color: 0xffc46b, s: nookS });
  }

  // ═══════════════════════════════════════════ PALACE END (the cellar) ══════
  {
    const p = PAL_END, y = palY, ly = palLand;
    // royal-icing stair up to the cellar (matches pads[2])
    for (let i = 0; i < 6; i++) {
      const zc = p.z + 0.45 + i * 0.9;
      B.box('icing', 5.6, 1.0 + i * 0.5, 0.92, { at: at(p.x, y + 0.5 * (i + 1) - (1.0 + i * 0.5) / 2, zc), color: i % 2 ? C.icing : C.cream });
    }
    B.box('matteFlat', 6.2, 3.6, 4.4, { at: at(p.x, ly - 1.8, p.z + 7.6), color: ROCK[2] });
    // the chocolate door back into the cellar
    B.box('matte', 3.6, 4.0, 0.7, { at: at(p.x, ly + 2.0, p.z + 10.0), color: C.choc });
    B.box('matte', 2.7, 3.2, 0.3, { at: at(p.x, ly + 1.6, p.z + 9.65), color: C.chocMilk });
    B.box('icing', 4.0, 0.34, 0.9, { at: at(p.x, ly + 4.1, p.z + 10.0), color: C.icing });
    B.sph('gloss', 0.24, 8, 6, { at: at(p.x + 1.0, ly + 1.6, p.z + 9.45), color: C.teal });
    B.signQuad('cave_palace', 3.2, 1.2, { at: at(p.x, ly + 4.7, p.z + 9.5), rot: [0, 0, 0] });
    B.signQuad('cave_warn2', 3.6, 1.35, { at: at(p.x - 4.0, y + 2.4, p.z - 1.0), rot: [0, 0.55, -0.05] });
    // syrup seeping under the door (you are nearly home)
    B.sph('flow', 1.3, 12, 6, { at: at(p.x, ly + 0.06, p.z + 9.2), scale: [1, 0.08, 0.8], color: 0x8a4a22 });
    // dressing: the last chamber before home — crystals, and the palace's own
    // sugar sacks stacked against the rock where somebody gave up carrying them
    for (let i = 0; i < 2; i++) {
      const a = 2.1 + i * 2.3;
      crystalCluster(p.x + Math.cos(a) * 4.6, p.z + Math.sin(a) * 4.6, y, GEM[(i + 2) % GEM.length], 1.1);
    }
    for (let i = 0; i < 3; i++) {
      const sx = p.x + 3.4 - i * 0.5, sz = p.z - 2.4 + (i % 2) * 1.3;
      B.ico('icing', 0.95, 0, { at: at(sx, y + 0.62 + (i === 2 ? 0.95 : 0), sz), scale: [1, 0.78, 0.9], rot: [0, i * 0.7, 0.1], color: i % 2 ? C.cream : C.icing });
      B.cyl('licorice', 0.06, 0.06, 1.1, 5, { at: at(sx, y + 1.1 + (i === 2 ? 0.95 : 0), sz), rot: [0, 0, 0.4], color: C.licorice });
    }
    crystalSpots.push({ x: CX + p.x - 3.2, y: y + 1.6, z: CZ + p.z - 0.5, color: GEM[1], s: total - 2 });
  }

  const meshes = B.finish(group);
  if (meshes.seaglass) meshes.seaglass.castShadow = false;
  if (meshes.shaft) { meshes.shaft.castShadow = false; meshes.shaft.receiveShadow = false; }
  // the water overhead must not cast (it would stripe the walk with its own
  // panel shadows) and the floor only ever receives
  if (meshes.sea) { meshes.sea.castShadow = false; meshes.sea.receiveShadow = false; meshes.sea.renderOrder = -2; }
  if (meshes.ray) { meshes.ray.castShadow = false; meshes.ray.receiveShadow = false; }
  if (meshes.floorLit) meshes.floorLit.castShadow = false;

  // ── lights: four PointLights, and only while you are down here ────────────
  // The roof keeps the sun out, so the whole tunnel is ambient + crystals. The
  // hemisphere/fill pair is the "glow off a hundred metres of lit sugar" that
  // stops the rock reading as a silhouette; the four points ride the nearest
  // crystal clusters (see update).
  const lights = [];
  for (let i = 0; i < 4; i++) {
    const L = new THREE.PointLight(0x9fe0ff, 0, 26, 1.4);
    L.visible = false; group.add(L); lights.push(L);
  }
  // THE LIGHT IS THE READ. Lavender ambient made a sweet-shop cave with the
  // lights off; the same rock under an aqua sky / deep-blue bounce reads as
  // three hundred metres of water overhead, and it makes the pink and gold
  // crystals pop instead of blending into the walls.
  // In the SCENE, not in the hidden cave group: at intensity 0 outside it adds
  // exactly nothing, and a hemisphere light that joined the light list on the
  // way in recompiled every lit program in the game (the constant-light-count
  // rule of the frame-rate pass; the lamp pool adopts the four points above).
  const amb = new THREE.HemisphereLight(0x6fc8e0, 0x1c3a5c, 0);
  amb.name = 'cave_hemi';
  amb.position.set(CX, FY + 12, CZ); ctx.scene.add(amb);
  const fill = new THREE.AmbientLight(0x4a86ad, 0);
  group.add(fill);

  // ── the hatch on Cat Island (a real prop at the yarn ball) ────────────────
  // It has to read as A LOCKED DOOR from thirty units, which a door-shaped
  // brown box in a sand plinth never did ("stacked crates"). So: a painted
  // teal steel door with a brass porthole, iron strap hinges and rivets, set in
  // a dark steel frame banded with yellow-and-black hazard stripes, with a
  // GOLD CAT-HEADED PADLOCK on the hasp (the same gold, and the same cat, as
  // the cave key — that is how you know what the key opens) and a lantern on
  // each stone cheek that pools real light on the ground after dark. The
  // padlock is gone once the hatch is unlocked.
  const hatchGroup = new THREE.Group(); hatchGroup.name = 'cave_hatch'; ctx.scene.add(hatchGroup);
  const hatchFx = { locked: null, open: null, glowM: null, pools: null, board: null, lockAt: null, sparkT: 0, yard: null };
  // frame space → world xz (+Z out of the plinth, +X toward the hinge side)
  const hcs = Math.cos(HATCH_RY), hsn = Math.sin(HATCH_RY);
  const HW2 = (lx, lz) => [HATCH.x + lx * hcs + lz * hsn, HATCH.z - lx * hsn + lz * hcs];
  {
    const hy = world.height(HATCH.x, HATCH.z);
    const partMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
    const H = new THREE.Group(); H.name = 'cave_hatch_frame';
    H.position.set(HATCH.x, hy - 0.25, HATCH.z); H.rotation.y = HATCH_RY;
    hatchGroup.add(H);
    const STEEL = 0x2b3a40, STONE = 0xd2b98e, STONE_DK = 0xab916b, IRONK = 0x2a2628;
    const HAZ_Y = 0xffc414, HAZ_K = 0x1e1b19;
    const pieces = [
      { g: new THREE.BoxGeometry(3.0, 2.6, 0.5), at: [0, 1.3, -0.4], color: 0x14100e },      // the dark behind the door
      // stone surround: jambs, cheeks (+ caps), lintel, drip course, threshold, step
      { g: new THREE.BoxGeometry(0.75, 3.3, 1.0), at: [-2.02, 1.65, -0.15], color: STONE_DK },
      { g: new THREE.BoxGeometry(0.75, 3.3, 1.0), at: [2.02, 1.65, -0.15], color: STONE_DK },
      { g: new THREE.BoxGeometry(1.3, 1.6, 1.6), at: [-2.35, 0.8, 0.35], color: STONE },
      { g: new THREE.BoxGeometry(1.3, 1.6, 1.6), at: [2.35, 0.8, 0.35], color: STONE },
      { g: new THREE.BoxGeometry(1.44, 0.16, 1.74), at: [-2.35, 1.66, 0.35], color: STONE_DK },
      { g: new THREE.BoxGeometry(1.44, 0.16, 1.74), at: [2.35, 1.66, 0.35], color: STONE_DK },
      { g: new THREE.BoxGeometry(4.9, 0.6, 1.15), at: [0, 3.28, -0.1], color: STONE },
      { g: new THREE.BoxGeometry(5.1, 0.24, 1.3), at: [0, 3.7, -0.1], color: 0x7d6650 },
      { g: new THREE.BoxGeometry(4.8, 0.34, 1.2), at: [0, 0.1, 0.5], color: STONE_DK },
      { g: new THREE.BoxGeometry(5.4, 0.3, 1.2), at: [0, -0.2, 1.6], color: 0x8a7358 },
      // the steel door frame
      { g: new THREE.BoxGeometry(0.36, 2.95, 0.66), at: [-1.62, 1.48, 0.05], color: STEEL },
      { g: new THREE.BoxGeometry(0.36, 2.95, 0.66), at: [1.62, 1.48, 0.05], color: STEEL },
      { g: new THREE.BoxGeometry(3.6, 0.36, 0.66), at: [0, 2.83, 0.05], color: STEEL },
      // the hasp the padlock hangs on (frame side)
      { g: new THREE.BoxGeometry(0.66, 0.2, 0.1), at: [1.52, 1.3, 0.42], color: IRONK },
      // two iron brackets holding the name board on the drip course
      { g: new THREE.BoxGeometry(0.12, 0.62, 0.12), at: [-1.7, 4.02, 0.24], color: IRONK },
      { g: new THREE.BoxGeometry(0.12, 0.62, 0.12), at: [1.7, 4.02, 0.24], color: IRONK },
      // hazard bands: across the lintel face and down both steel jambs
      ...stripeQuads(4.7, 0.44, 13, 0.34, HAZ_Y, HAZ_K, [0, 3.28, 0.487]),
      ...stripeQuads(2.5, 0.24, 7, 0.22, HAZ_Y, HAZ_K, [-1.62, 1.42, 0.392], [0, 0, Math.PI / 2]),
      ...stripeQuads(2.5, 0.24, 7, 0.22, HAZ_Y, HAZ_K, [1.62, 1.42, 0.392], [0, 0, Math.PI / 2]),
    ];
    // a lantern on each cheek: iron post, base plate, cap (the glass glows, below)
    for (const s of [-1, 1]) {
      pieces.push(
        { g: new THREE.BoxGeometry(0.16, 0.8, 0.16), at: [s * 2.35, 2.12, 0.95], color: IRONK },
        { g: new THREE.CylinderGeometry(0.25, 0.25, 0.08, 6), at: [s * 2.35, 2.54, 0.95], color: IRONK },
        { g: new THREE.ConeGeometry(0.31, 0.28, 6), at: [s * 2.35, 3.16, 0.95], color: IRONK },
        { g: new THREE.TorusGeometry(0.08, 0.025, 4, 8), at: [s * 2.35, 3.36, 0.95], color: IRONK },
      );
    }
    const frame = makePart(pieces, partMat);
    frame.name = 'cave_hatch_surround';
    H.add(frame);

    // the door leaf, hinged on the −X (south) jamb so the padlock side faces
    // the default lens (on the other side the CAVE KEY fingerpost hid it)
    const DOOR = 0x2c8f95, DOOR_DK = 0x1c5b62, BRASS = 0xd9a441;
    const leafG = new THREE.Group();
    leafG.position.set(-1.35, 0, 0);
    H.add(leafG);
    const lp = [
      { g: new THREE.BoxGeometry(2.62, 2.5, 0.2), at: [1.35, 1.3, 0.14], color: DOOR },
      { g: new THREE.BoxGeometry(2.62, 0.2, 0.3), at: [1.35, 0.18, 0.16], color: DOOR_DK },
      { g: new THREE.BoxGeometry(2.62, 0.2, 0.3), at: [1.35, 2.44, 0.16], color: DOOR_DK },
      { g: new THREE.BoxGeometry(0.2, 2.1, 0.3), at: [0.14, 1.3, 0.16], color: DOOR_DK },
      { g: new THREE.BoxGeometry(0.2, 2.1, 0.3), at: [2.56, 1.3, 0.16], color: DOOR_DK },
      { g: new THREE.BoxGeometry(2.26, 0.14, 0.26), at: [1.35, 1.2, 0.16], color: DOOR_DK },
      // brass porthole: ring, glass, a glint
      { g: new THREE.TorusGeometry(0.37, 0.09, 6, 16), at: [1.35, 1.8, 0.3], color: BRASS },
      { g: new THREE.CircleGeometry(0.33, 14), at: [1.35, 1.8, 0.262], color: 0x78d8da },
      { g: new THREE.CircleGeometry(0.1, 8), at: [1.23, 1.92, 0.268], color: 0xeafffb },
      // a big cream paw on the lower panel: the cats' own service door
      { g: new THREE.CircleGeometry(0.22, 10), at: [1.35, 0.6, 0.252], color: 0xf1e2bf },
      // the door side of the hasp
      { g: new THREE.BoxGeometry(0.12, 0.3, 0.14), at: [2.5, 1.3, 0.33], color: IRONK },
    ];
    for (const [tx, ty] of [[-0.17, 0.2], [-0.06, 0.29], [0.06, 0.29], [0.17, 0.2]]) {
      lp.push({ g: new THREE.CircleGeometry(0.075, 8), at: [1.35 + tx, 0.6 + ty, 0.252], color: 0xf1e2bf });
    }
    for (const y of [0.55, 2.05]) {       // strap hinges + knuckles
      lp.push(
        { g: new THREE.BoxGeometry(1.1, 0.17, 0.07), at: [0.55, y, 0.33], color: IRONK },
        { g: new THREE.CylinderGeometry(0.1, 0.1, 0.38, 6), at: [-0.02, y, 0.22], color: IRONK },
      );
    }
    for (let i = 0; i < 7; i++) {          // rivets along the rails
      const x = 0.3 + i * 0.35;
      lp.push({ g: new THREE.SphereGeometry(0.05, 5, 3), at: [x, 0.18, 0.32], color: 0x9fb7b8 });
      lp.push({ g: new THREE.SphereGeometry(0.05, 5, 3), at: [x, 2.44, 0.32], color: 0x9fb7b8 });
    }
    const leaf = makePart(lp, partMat);
    leaf.name = 'cave_hatch_door';
    leafG.add(leaf);
    hatchGroup.userData.leaf = leafG;

    // the glowing bits: lantern glass (both states) + the padlock (locked only).
    // Two meshes, one visible at a time → one draw call either way.
    const glass = new PB();
    for (const s of [-1, 1]) glass.cyl(0.19, 0.21, 0.5, 6, 0xffe2a8, s * 2.35, 2.83, 0.95);
    const openGeo = glass.geometry();
    const lock = new PB().merge(glass);
    const LG = 0xffc93a, LG_DK = 0xe09a1c, LINK = 0x2a1a0c;
    const LX = 1.5, LY = 0.92, LZ = 0.52;
    lock.box(0.7, 0.5, 0.28, LG, LX, LY, LZ);
    lock.cyl(0.35, 0.35, 0.28, 12, LG, LX, LY - 0.25, LZ, Math.PI / 2);        // rounded chin
    for (const s of [-1, 1]) lock.add(new THREE.ConeGeometry(0.13, 0.26, 3), LG, LX + s * 0.27, LY + 0.33, LZ, 0, 0, -s * 0.32, [1, 1, 0.55]);   // ears
    lock.add(new THREE.TorusGeometry(0.14, 0.05, 5, 10, Math.PI), LG_DK, LX, LY + 0.3, LZ);     // shackle through the hasp
    for (const s of [-1, 1]) lock.sph(0.05, 5, 4, LINK, LX + s * 0.14, LY + 0.08, LZ + 0.15, [1, 1.35, 0.5]);   // eyes
    lock.add(new THREE.CircleGeometry(0.075, 10), LINK, LX, LY - 0.14, LZ + 0.145);             // keyhole
    lock.box(0.055, 0.16, 0.02, LINK, LX, LY - 0.25, LZ + 0.145);
    hatchFx.glowM = colorGlowMat(0xffffff, { intensity: 0.35, roughness: 0.4 });
    hatchFx.locked = new THREE.Mesh(lock.geometry(), hatchFx.glowM);
    hatchFx.open = new THREE.Mesh(openGeo, hatchFx.glowM);
    for (const m of [hatchFx.locked, hatchFx.open]) { m.castShadow = false; m.receiveShadow = false; m.userData.noFade = true; H.add(m); }
    hatchFx.locked.name = 'cave_hatch_padlock'; hatchFx.open.name = 'cave_hatch_lanterns';
    hatchFx.open.visible = false;
    { const [x, z] = HW2(LX, LZ + 0.2); hatchFx.lockAt = { x, y: hy - 0.25 + LY + 0.2, z }; }

    // the name board — hazard yellow, and it FITS now (signMesh shrinks text)
    try {
      const board = signMesh(4.3, 1.1, [
        { text: 'MAINTENANCE HATCH', size: 74, color: '#1e1b19' },
        { text: 'cave access · staff of cats only', size: 40, color: '#5a3a14', weight: 800 },
      ], { bg: '#ffd54a', borderColor: '#1e1b19', borderWidth: 12, cw: 640, ch: 164, pad: 16 });
      board.position.set(0, 4.36, 0.34);
      board.castShadow = false;
      H.add(board);
      hatchFx.board = nightSign(board, 0.5);
    } catch (e) { /* sign is decoration; never take the route down for it */ }

    // lamplight on the ground in front of the door (after dark)
    const pools = [];
    for (const s of [-1, 1]) { const [x, z] = HW2(s * 2.0, 2.3); pools.push({ x, z, r: 2.7 }); }
    hatchFx.pools = poolMesh(ctx, pools, 0xffb45a, { name: 'cave_hatch_pools' });

    // colliders, part 1: the two cheek circles exactly as they always were —
    // the hatch fingerpost's ground search (createKeyTrail, below) scores
    // against them, and its verified spot must not move. Part 2 (the boxes
    // that close the gaps these circles left) goes in after that search.
    for (const s of [-1, 1]) {
      ctx.colliders.push({
        x: HATCH.x + Math.sin(HATCH_A) * s * 2.3,
        z: HATCH.z - Math.cos(HATCH_A) * s * 2.3, r: 0.85, h: hy + 2.6,
      });
    }
  }
  /** Part 2: the stone cheeks and the closed door as SOLID oriented boxes.
   *  The circles alone left the cheek corners walk-through, and the old
   *  free-standing lamp post (now gone: the lanterns stand on the cheeks)
   *  had no collider at all — a cat stood inside it. */
  function hatchSolids() {
    for (const s of [-1, 1]) {
      const [x, z] = HW2(s * 2.35, 0.35);
      ctx.colliders.push({ x, z, w: 1.44, d: 1.74, rot: -HATCH_RY, box: true });
    }
    const [x, z] = HW2(0, -0.2);
    ctx.colliders.push({ x, z, w: 3.3, d: 0.9, rot: -HATCH_RY, box: true });
  }
  /** The key turned: the padlock drops off in a puff of gold. */
  function unlockVisual() {
    if (!hatchFx.locked || !hatchFx.locked.visible) return;
    hatchFx.locked.visible = false; hatchFx.open.visible = true;
    const L = hatchFx.lockAt;
    ctx.systems.particles?.burst?.({ x: L.x, y: L.y, z: L.z, count: 22, color: [0xffe07a, 0xffffff, 0xffb428], speed: 2.8, up: 1.2, life: 0.9, size: 0.24, sizeEnd: 0.04, gravity: -5, drag: 1.4, spread: 0.5, shape: 'sparkle', blend: 'add' });
  }

  // ── the cave key: a real object on the Lost Property plinth (Contract D) ──
  let keyTrail = null;
  try { keyTrail = createKeyTrail(ctx, escape); }
  catch (err) { console.error('[escape/cave] key trail failed', err); }
  hatchSolids();
  // ── the hatch yard: worn path, apron, paw prints, props (AFTER the key
  //    trail, so the hatch fingerpost's ground search is exactly as before)
  try { hatchFx.yard = buildHatchYard(ctx, { HW2, apron: keyTrail?.trail?.apron || null, post: keyTrail?.trail?.hatch || null }); }
  catch (err) { console.error('[escape/cave] hatch yard failed', err); }

  // ═══════════════════════════════════════════════════ walkable + state ═════
  let inCave = false, armCat = true, armPal = true, busy = false;
  ctx.walkables.push({
    id: 'underseaCave',
    test(x, z) {
      const lx = x - CX, lz = z - CZ;
      if (lx < -44 || lx > 44 || lz < -142 || lz > 142) return null;
      const pd = padAt(lx, lz);
      if (pd !== null) return pd;
      const n = nearest(lx, lz);
      if (n.d <= HW) return floorAt(n.s);
      for (const ch of chambers) if (Math.hypot(lx - ch.x, lz - ch.z) <= ch.r) return ch.y;
      return null;
    },
  });

  // ── entering / leaving ────────────────────────────────────────────────────
  function spawn(end) {
    const p = end === 'cat' ? CAT_END : PAL_END;
    const push = end === 'cat' ? 5.0 : -5.0;
    return { x: CX + p.x, z: CZ + p.z + push };
  }
  let camSave = null, azSet = null, azFree = 0;
  /** The yaw that puts the corridor square in frame: the lens looks ALONG the
   *  tunnel. Without it the default 45° island azimuth cuts the walk across the
   *  picture at thirty degrees and the corridor reads as a diagonal seam
   *  between two purple slabs instead of as a way through. */
  function corridorAz(lx, lz) {
    const n = nearest(lx, lz);
    return Math.atan2(-n.ux, -n.uz);
  }
  /** A corridor needs a steeper, closer lens than an island does — see the
   *  SIGHTLINE RULE at the top: the geometry is cut to THESE numbers.
   *  `at` is where he is about to stand (enterCave's spawn): the aim is taken
   *  from there, not from the island he is still standing on. */
  function caveCam(on, at = null) {
    const cam = ctx.systems.camera;
    if (!cam?.params || !cam.setParams) return;
    if (on && !camSave) {
      camSave = { elevation: cam.params.elevation, distance: cam.params.distance, azimuth: cam.params.azimuth };
      const p = at || ctx.systems.player?.position;
      const az = p ? corridorAz(p.x - CX, p.z - CZ) : cam.params.azimuth;
      cam.setParams({ elevation: CAM.elevation, distance: CAM.distance, azimuth: az });
      azSet = az; azFree = 0;
    } else if (!on && camSave) { cam.setParams(camSave); camSave = null; azSet = null; }
    cam.snap?.();
  }
  /** Keep the lens pointed down the tunnel, but hand it straight back the
   *  moment the player turns it himself (Q/E writes params.azimuth). */
  function followCorridor(dt) {
    const cam = ctx.systems.camera, p = ctx.systems.player?.position;
    if (!cam?.params || !cam.setParams || !p || azSet === null) return;
    if (Math.abs(wrapPi(cam.params.azimuth - azSet)) > 0.02) { azFree = 5; azSet = cam.params.azimuth; }
    if (azFree > 0) { azFree -= dt; return; }
    const want = corridorAz(p.x - CX, p.z - CZ);
    if (Math.abs(wrapPi(want - azSet)) < 0.01) return;
    cam.setParams({ azimuth: want });
    azSet = want;
  }
  let bubbles = null;
  function show(v, at = null) {
    group.visible = v; hatchGroup.visible = true;
    for (const L of lights) L.visible = v;
    amb.intensity = v ? 1.0 : 0;
    fill.intensity = v ? 0.40 : 0;
    caveCam(v, at);
    // a drifting field of bubbles, born on the walkway and rising through the
    // shafts — ~90 alive at any moment, all in the shared particle pool
    if (v && !bubbles) {
      bubbles = ctx.systems.particles?.emitter({
        x: CX, y: FY, z: CZ, rate: 21, area: 13, areaY: 2.4,
        color: [0xdff4ff, 0xffffff, 0xa8e4ff], size: 0.22, sizeEnd: 0.42, sizeVar: 0.6,
        life: 4.4, lifeVar: 0.4, gravity: 1.35, drag: 0.55, speed: 0.18, sway: 0.5, swayFreq: 1.3,
        alpha: 0.62, fadeIn: 0.2, shape: 'soft', blend: 'normal', range: 90,
        follow: () => {
          const pp = ctx.systems.player?.position;
          if (!pp) return null;
          const n = nearest(pp.x - CX, pp.z - CZ);
          return { x: pp.x, y: floorAt(n.s) + 0.5, z: pp.z };
        },
      }) || null;
    } else if (!v && bubbles) { bubbles.stop(); bubbles = null; }
    ctx.state.placeOverride = v ? 'The Undersea Cave' : null;
  }
  function enterCave(from = 'cat') {
    if (busy) return; busy = true;
    escape.start('cave', { from });
    escape.transition(() => {
      // Aim the lens from the SPAWN. show() still runs before the teleport (its
      // setParams pins the framing and the teleport is what lifts the pin), but
      // an aim taken from the cellar door or the hatch was 0.7-0.9 rad off the
      // corridor, and followCorridor swung it back through the whole fade-in.
      const s = spawn(from === 'palace' ? 'palace' : 'cat');
      inCave = true; show(true, s);
      ctx.systems.player?.teleport(s.x, s.z);
      if (from === 'palace') { armPal = false; armCat = true; } else { armCat = false; armPal = true; }
      escape.banner('The Undersea Cave', from === 'palace' ? 'the cats never sealed it' : 'no humans beyond this point', 4, 'candy');
      ctx.systems.ui?.setObjective?.(from === 'palace' ? 'Walk the tunnel to Cat Island' : 'Walk the tunnel to the Candy Palace');
      busy = false;
    }, { out: 0.4, hold: 0.5, in: 0.7 });
  }
  function leaveTo(where) {
    if (busy) return; busy = true;
    escape.transition(() => {
      inCave = false; show(false);
      if (where === 'palace') {
        const p = escape.palace?.cellarSpawn || { x: -150, z: -44 };
        ctx.systems.player?.teleport(p.x, p.z);
        escape.palace?.openCaveDoor?.(true);
        escape.success('cave', { from: 'cat' });
        escape.banner('The Palace Cellar', 'you are out — and it is dry', 4, 'candy');
        ctx.systems.ui?.setObjective?.('');
        ctx.systems.particles?.burst({ x: p.x, y: (escape.palace?.CF ?? 9) + 1, z: p.z, count: 24, color: [0xffffff, 0xffd6e8, 0x9fe6ff], speed: 2.6, life: 1.3, size: 0.2, gravity: -2.2, spread: 1.3, shape: 'sparkle', blend: 'add' });
      } else {
        ctx.systems.player?.teleport(HATCH_STAND.x, HATCH_STAND.z);
        ctx.events.emit('escape:start', { route: 'cave', from: 'palace', arrived: 'cat' });
        escape.banner('Yarn Hill', 'back on Cat Island. nobody saw you.', 4, 'cat');
        ctx.systems.ui?.setObjective?.('');
      }
      busy = false;
    }, { out: 0.4, hold: 0.5, in: 0.7 });
  }

  // ── interactables ─────────────────────────────────────────────────────────
  let hatchOpen = false;
  const hatchEntry = {
    id: 'cave_hatch', x: HATCH_STAND.x, z: HATCH_STAND.z, r: 3.2,
    label: 'Try the hatch',
    onInteract(c, self) {
      if (!c.systems.story?.get('helper_5')) {
        c.systems.ui?.say('Locked. A cat-shaped keyhole.', { speaker: 'The Hatch', duration: 5 });
        keyTrail?.lockedHint();
        return;
      }
      hatchOpen = true;
      unlockVisual();
      c.systems.ui?.say('The key turns with a sound like a purr. Cold air comes up the steps.', { speaker: 'The Hatch', duration: 5 });
      escape.after(1.1, () => enterCave('cat'));
    },
  };
  const capEntries = [
    hatchEntry,
    {
      id: 'cave_hatch_inside', x: CX + CAT_END.x, z: CZ + CAT_END.z - 7.5, r: 3.2,
      label: 'Climb back up the hatch',
      onInteract: () => { if (inCave) leaveTo('cat'); },
    },
    {
      id: 'cave_cellar_door', x: CX + PAL_END.x, z: CZ + PAL_END.z + 8.4, r: 3.4,
      label: 'Open the cellar door',
      onInteract: () => { if (inCave) leaveTo('palace'); },
    },
    {
      id: 'cave_sign_nohumans', x: CX + CAT_END.x + 3.4, z: CZ + CAT_END.z - 1.0, r: 3.0,
      label: 'Read the sign',
      onInteract: (c) => c.systems.ui?.say('NO HUMANS BEYOND THIS POINT (obviously). Underneath, in different paw: "or tourists. or the Regent. especially the Regent."', { speaker: 'Sign', duration: 7 }),
    },
    {
      id: 'cave_sign_glass', x: CX + mid.x - 4.6, z: CZ + mid.z + 4.0, r: 3.2,
      label: 'Read the sign',
      onInteract: (c) => c.systems.ui?.say('SEA GLASS — DO NOT TAP. The whale is sensitive. Above you, something enormous slides past and blots out the light for four whole seconds.', { speaker: 'Sign', duration: 8 }),
    },
    {
      id: 'cave_sign_nook', x: CX + nook.x, z: CZ + nook.z - 2.2, r: 3.0,
      label: 'Read the sign',
      onInteract: (c) => c.systems.ui?.say('REST NOOK — three fish deposit. Sit as long as you like. Somebody has been sleeping here, and recently.', { speaker: 'Sign', duration: 7 }),
    },
  ];
  ctx.events.on('world:ready', () => {
    const I = ctx.systems.interaction;
    // interaction.register() stores a COPY of the spec, so keep the entry it
    // returns — relabelling our own spec object never reached the prompt
    let hatchReg = null;
    if (I?.register) for (const s of capEntries) { try { const e = I.register(s); if (s === hatchEntry) hatchReg = e; } catch (e) {} }
    // keep the hatch label honest once the key is yours (plinth or Rusty)
    ctx.systems.story?.once?.('helper_5', () => {
      hatchEntry.label = 'Unlock the hatch';
      if (hatchReg) hatchReg.label = 'Unlock the hatch';
      try { if (I?.nearest?.() === hatchReg) ctx.systems.ui?.prompt?.(hatchReg.label, hatchReg); } catch (e) {}
    });
  });

  // ═══════════════════════════════════════════════════════ update ═══════════
  let lightT = 0;
  const api = {
    CX, CZ, FY, total, chambers,
    HATCH, HATCH_STAND,
    /** World-space corridor centreline — handy for tests and for NPC pathing. */
    waypoints: PATH.map(([x, z]) => ({ x: CX + x, z: CZ + z })),
    get inCave() { return inCave; },
    tunnelStart: spawn('cat'), tunnelEnd: spawn('palace'),
    enterCave, leaveCave: leaveTo,
    keyTrail,
    update(dt, c) {
      const p = c.systems.player?.position;
      const night = 1 - (c.state.daylight ?? 1);
      if (keyTrail) {
        try { keyTrail.update(dt, c); }
        catch (err) { if (!keyTrail.__warned) { keyTrail.__warned = true; console.error('[escape/cave] key trail update', err); } }
      }
      // hatch leaf swings open once unlocked
      const hl = hatchGroup.userData.leaf;
      if (hl) hl.rotation.y = damp(hl.rotation.y, hatchOpen ? 1.35 : 0, 4, dt);
      // the hatch after dark: lantern glass, the pools they throw, the board;
      // the padlock glints now and then so the eye finds it
      {
        const t = c.state.elapsed;
        const fl = 0.94 + 0.06 * Math.sin(t * 7.3) * Math.sin(t * 2.9);
        if (hatchFx.glowM) hatchFx.glowM.emissiveIntensity = (0.32 + 1.3 * night) * fl;
        hatchFx.pools?.set(night * 0.85 * fl);
        hatchFx.board?.(night);
        if (hatchFx.yard) {
          try { hatchFx.yard.update(dt, c, night); }
          catch (err) { if (!hatchFx.yard.__warned) { hatchFx.yard.__warned = true; console.error('[escape/cave] hatch yard update', err); } }
        }
        if (hatchFx.locked?.visible && p && Math.abs(p.x - HATCH.x) < 40 && Math.abs(p.z - HATCH.z) < 40) {
          hatchFx.sparkT -= dt;
          if (hatchFx.sparkT <= 0) {
            hatchFx.sparkT = 1.7;
            const L = hatchFx.lockAt;
            c.systems.particles?.sparkle?.(L.x, L.y, L.z, 0xffe07a, 3);
          }
        }
      }

      const near = p ? (Math.abs(p.x - CX) < 60 && Math.abs(p.z - CZ) < 170) : false;
      if (near !== group.visible) show(near);        // renders can just teleport in
      if (!near) return;
      inCave = true;

      // roof never occludes the player: drop it if the lens climbs above it
      roof.visible = c.camera.position.y < CEIL_Y - 1.5;

      // four lights riding the nearest crystal clusters
      lightT -= dt;
      if (lightT <= 0 && p) {
        lightT = 0.35;
        const sorted = crystalSpots
          .map((s) => ({ s, d: (s.x - p.x) * (s.x - p.x) + (s.z - p.z) * (s.z - p.z) }))
          .sort((a, b) => a.d - b.d);
        for (let i = 0; i < lights.length; i++) {
          const it = sorted[i];
          if (!it) { lights[i].intensity = 0; continue; }
          lights[i].position.set(it.s.x, it.s.y, it.s.z);
          lights[i].color.setHex(it.s.color);
        }
      }
      for (let i = 0; i < lights.length; i++) {
        lights[i].intensity = damp(lights[i].intensity, 2.2 + Math.sin(c.state.elapsed * 1.3 + i) * 0.3, 4, dt);
      }
      // keep the lens down the tunnel, and keep sky's billboards out of the
      // cave (see hideCelestials in palace.js — same not-ours bug)
      followCorridor(dt);
      hideCelestials(c);
      if (c.state.placeOverride !== 'The Undersea Cave') c.state.placeOverride = 'The Undersea Cave';

      // crystal shimmer + daylight coming through the sea glass
      mats.crystal.emissiveIntensity = 0.44 + Math.sin(c.state.elapsed * 1.7) * 0.07;
      mats.seaglass.emissiveIntensity = 0.2 + (1 - night) * 0.7;
      mats.shaft.emissiveIntensity = 0.14 + (1 - night) * 0.34;
      mats.shaft.opacity = 0.2 + (1 - night) * 0.2;
      // the water overhead: brighter and greener by day, near-black at night
      mats.sea.emissiveIntensity = 0.16 + (1 - night) * 0.34;
      mats.sea.opacity = 0.3 + (1 - night) * 0.16;
      mats.ray.emissiveIntensity = 0.16 + (1 - night) * 0.28;
      mats.ray.opacity = 0.11 + (1 - night) * 0.12;
      // caustics crawl across the walkway
      mats.floorLit.userData.uT.value = c.state.elapsed * 0.9;
      mats.floorLit.userData.uK.value = 0.7 + (1 - night) * 1.05;
      mats.glowWarm.emissiveIntensity = 1.7;
      mats.haloDisc.emissiveIntensity = 0.5; mats.haloDisc.opacity = 0.42; mats.haloDisc.visible = true;
      mats.sign.emissiveIntensity = 0.5;
      mats.flow.map.offset.y = (mats.flow.map.offset.y - dt * 0.12) % 1;

      // fish + whale shadows over the skylight
      const list = fishGroup.userData.list, fm = fishGroup.userData.mesh;
      if (fm) {
        for (let i = 0; i < list.length; i++) {
          const f = list[i], a = f.ph + c.state.elapsed * f.sp;
          _e.set(0, -a + (f.sp > 0 ? Math.PI / 2 : -Math.PI / 2), Math.sin(a * 2) * 0.12, 'YXZ');
          _q.setFromEuler(_e);
          _p.set(Math.cos(a) * f.r, f.y + Math.sin(a * f.bob) * 0.6, Math.sin(a) * f.r);
          _m.compose(_p, _q, _s.set(f.s, f.s, f.s));
          fm.setMatrixAt(i, _m);
        }
        fm.instanceMatrix.needsUpdate = true;
      }

      // drifting fish overhead, riding with the player down the corridor
      if (p) {
        const n = nearest(p.x - CX, p.z - CZ), fy = floorAt(n.s);
        const ux = n.ux, uz = n.uz, ax = -uz, az2 = ux;          // along / across
        for (let i = 0; i < driftList.length; i++) {
          const f = driftList[i];
          const t = ((f.ph + c.state.elapsed * f.sp) % 1 + 1) % 1;
          const across = -26 + t * 52;
          const along = f.lane;
          _p.set(
            p.x + ux * along + ax * across,
            fy + f.up + Math.sin(c.state.elapsed * 0.6 + i) * 0.5,
            p.z + uz * along + az2 * across,
          );
          _e.set(0, Math.atan2(ax, az2) + (f.sp > 0 ? 0 : Math.PI) + Math.PI / 2, Math.sin(c.state.elapsed * 1.4 + i) * 0.1, 'YXZ');
          _q.setFromEuler(_e);
          _m.compose(_p, _q, _s.set(f.s, f.s, f.s));
          drift.setMatrixAt(i, _m);
        }
        drift.instanceMatrix.needsUpdate = true;
      }

      // end triggers (armed only once you have walked away from them)
      if (p && !busy) {
        const dCat = Math.hypot(p.x - (CX + CAT_END.x), p.z - (CZ + CAT_END.z - 7.5));
        const dPal = Math.hypot(p.x - (CX + PAL_END.x), p.z - (CZ + PAL_END.z + 7.8));
        if (dCat > 13) armCat = true;
        if (dPal > 13) armPal = true;
        if (armCat && dCat < 3.4) leaveTo('cat');
        else if (armPal && dPal < 3.4) leaveTo('palace');
      }
    },
  };
  escape.enterCave = enterCave;
  escape.cave = api;

  {
    let tris = 0, n = 0;
    group.traverse((o) => {
      if (!o.isMesh) return; n++;
      const g = o.geometry, cnt = g.getIndex() ? g.getIndex().count : g.attributes.position.count;
      tris += (cnt / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    console.warn('[escape/cave]', JSON.stringify({
      meshes: n, triangles: Math.round(tris), pieces: B.stats.pieces,
      corridor: Math.round(total), crystals: crystalSpots.length, lights: lights.length,
      colliders: caveCols.length, wallH: WALL_H, cam: CAM,
      start: [Math.round(api.tunnelStart.x), Math.round(api.tunnelStart.z)],
    }));
  }
  return escape.register('cave', api);
}

// ── helpers ──────────────────────────────────────────────────────────────────
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
const _c = new THREE.Color();

const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/**
 * WORKAROUND (sky's bug, reported, same as palace.js): the sun and moon are
 * transparent depthTest-off billboards a few units from the lens, so they draw
 * OVER the world in the transparent pass — and the sky follows the camera, so
 * they follow you into a cave 1400 units from the island. sky updates before
 * escape, so switching them off here holds for the frame.
 */
let _celest = null;
function hideCelestials(c) {
  if (!_celest) {
    _celest = [c.scene.getObjectByName('moonDisc'), c.scene.getObjectByName('sunDisc')].filter(Boolean);
    if (!_celest.length) { _celest = null; return; }
  }
  for (const m of _celest) m.visible = false;
}

/**
 * The corridor floor, with moving CAUSTICS — the crossing bands of light that
 * say "there is water over your head" louder than any amount of blue rock.
 * A standard material with an onBeforeCompile patch: two crossed sine fields in
 * world XZ, sharpened with a power curve, added to the lit colour. No texture,
 * no second pass, one uniform (`uT`, driven from update).
 * The material is the floor's ALONE — walls share `matteFlat`, and caustics
 * running up a wall would read as a rendering fault, not as water.
 */
function makeCausticMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.04, flatShading: true });
  m.userData.uT = { value: 0 };
  m.userData.uK = { value: 1 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = m.userData.uT;
    sh.uniforms.uK = m.userData.uK;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCausP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCausP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCausP;\nuniform float uT;\nuniform float uK;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  {
    float cx = vCausP.x * 0.46, cz = vCausP.z * 0.46;
    float a1 = sin(cx * 1.10 + uT * 0.75) + sin(cz * 1.35 - uT * 0.55);
    float a2 = sin((cx + cz) * 0.78 + uT * 0.95) + sin((cx - cz) * 1.05 - uT * 0.62);
    float band = max(a1 + a2, 0.0) * 0.25;
    float caus = pow(band, 2.0);
    gl_FragColor.rgb += vec3(0.34, 0.78, 0.86) * caus * uK;
    gl_FragColor.rgb *= 1.0 - 0.30 * (1.0 - band);
  }`);
  };
  return m;
}

function makePart(pieces, material) {
  const geos = [];
  for (const p of pieces) {
    const g = p.g;
    if (p.rot) { g.rotateX(p.rot[0] || 0); g.rotateY(p.rot[1] || 0); g.rotateZ(p.rot[2] || 0); }
    if (p.at) g.translate(p.at[0], p.at[1], p.at[2]);
    const n = g.attributes.position.count;
    _c.set(p.color ?? 0xffffff);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.getIndex()) { const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const m = new THREE.Mesh(merged, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function signEntries() {
  const ink = '#20141c';
  return [
    {
      id: 'cave_nohumans', cw: 6, ch: 2,
      draw: (g, w, h) => plate(g, w, h, {
        bg: '#f4e6c8', edge: '#b02a3a', borderW: 6, grainColor: '#c9a05c',
        lines: [
          { text: 'NO HUMANS', size: 0.3, y: 0.3, color: '#b02a3a', fat: true },
          { text: 'BEYOND THIS POINT', size: 0.19, y: 0.62, color: ink, fat: true },
          { text: '( obviously )', size: 0.14, y: 0.85, color: '#7a5a68' },
        ],
      }),
    },
    {
      id: 'cave_hatch', cw: 4, ch: 1,
      draw: (g, w, h) => plate(g, w, h, {
        bg: '#3a2e26', edge: '#d9b36a', borderW: 5, grain: false,
        lines: [
          { text: 'MAINTENANCE ONLY', size: 0.34, y: 0.38, color: '#f0d9a8', fat: true },
          { text: 'yarn inspection · staff of cats', size: 0.22, y: 0.76, color: '#c2a482' },
        ],
      }),
    },
    {
      id: 'cave_glass', cw: 4, ch: 2,
      draw: (g, w, h) => plate(g, w, h, {
        bg: '#1f3c52', edge: '#8fd8ff', borderW: 5, grain: false,
        lines: [
          { text: 'SEA GLASS', size: 0.26, y: 0.26, color: '#bfeaff', fat: true },
          { text: 'do not tap', size: 0.2, y: 0.56, color: '#e8f6ff' },
          { text: 'the whale is sensitive', size: 0.14, y: 0.82, color: '#9fd8ff' },
        ],
      }),
    },
    {
      id: 'cave_nook', cw: 4, ch: 2,
      draw: (g, w, h) => plate(g, w, h, {
        bg: '#40304c', edge: '#ffc46b', borderW: 5, grain: false,
        lines: [
          { text: 'REST NOOK', size: 0.28, y: 0.3, color: '#ffd9a0', fat: true },
          { text: 'three fish deposit', size: 0.18, y: 0.62, color: '#f0e2d0' },
          { text: 'no yowling', size: 0.14, y: 0.85, color: '#c9b0d8' },
        ],
      }),
    },
    {
      id: 'cave_warn2', cw: 5, ch: 2,
      draw: (g, w, h) => plate(g, w, h, {
        bg: '#f4e6c8', edge: '#b02a3a', borderW: 5,
        lines: [
          { text: 'YOU ARE UNDER THE SEA', size: 0.2, y: 0.28, color: '#b02a3a', fat: true },
          { text: 'please do not mention this', size: 0.16, y: 0.58, color: ink },
          { text: 'to the ferry cat', size: 0.14, y: 0.83, color: '#7a5a68' },
        ],
      }),
    },
    {
      id: 'cave_palace', cw: 4, ch: 2,
      draw: (g, w, h) => plate(g, w, h, {
        bg: '#fff4e2', edge: '#6b2a58', borderW: 5, dots: true, dotColor: '#ffd1e6',
        lines: [
          { text: 'CANDY PALACE', size: 0.26, y: 0.3, color: '#6b2a58', fat: true },
          { text: 'cellar door', size: 0.19, y: 0.62, color: ink },
          { text: 'mind the drips', size: 0.13, y: 0.85, color: '#8a6a78' },
        ],
      }),
    },
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// THE CAVE KEY (wave 3, Contract D).
//
// Rusty's five-candy tier still hands the key over (story flag helper_5), but
// the key is now also a real object: a golden cat-headed key hovering over a
// red cushion on a stone plinth — the island's LOST PROPERTY display — on the
// lawn just below the Welcome Plaza, beside the harbour road. A gold light
// column + rising sparkles mark it from 40 u, and after dark the key glows.
// The trail to it: a LOST KEY? notice board on the arrivals road, a fingerpost
// at the plaza exit (key → plinth, winch → quay), a fingerpost + poster at the
// hatch pointing back west, one extra line from Rusty, a map marker.
// E on the plinth → helper_5 (the hatch already keys off it) + a toast that
// names the hatch; the map marker then moves to the hatch.
//
// Draw calls near it: plinth site 1 · key 1 · beam 1 (+ a sign site 1 at each
// of the arrivals board, the plaza fingerpost and the hatch).
// ═════════════════════════════════════════════════════════════════════════════
const KEY_HEX = 0xffc84a;

function createKeyTrail(ctx, escape) {
  const world = ctx.world;
  const story = () => ctx.systems.story;
  const ui = () => ctx.systems.ui;
  const fx = () => ctx.systems.particles;
  ctx.colliders = ctx.colliders || [];
  const atlas = signAtlas();
  const S = keySpot(ctx);
  const group = new THREE.Group(); group.name = 'escape_cave_key';
  ctx.scene.add(group);
  const cosR = Math.cos(S.ry), sinR = Math.sin(S.ry);
  /** plinth-local (x right, z toward the road) → world xz */
  const W = (lx, lz) => [S.x + lx * cosR + lz * sinR, S.z - lx * sinR + lz * cosR];

  // ── the plinth, the cushion, the Lost Property board (one mesh) ────────────
  const site = new Site();
  const STONE = 0xd8cfbf, STONE_DK = 0xb3a893, GOLDT = 0xf2c14a, VELVET = 0xd42a3c, WOODD = 0x5b3b24;
  site.cyl(1.2, 1.32, 0.7, 8, STONE_DK, 0, -0.15, 0, 0, Math.PI / 8);          // footing (sunk)
  site.cyl(0.92, 1.05, 0.22, 8, STONE, 0, 0.3, 0, 0, Math.PI / 8);             // step
  site.cyl(0.6, 0.68, 1.0, 8, STONE, 0, 0.9, 0, 0, Math.PI / 8);               // column
  site.cyl(0.66, 0.66, 0.08, 8, GOLDT, 0, 0.5, 0, 0, Math.PI / 8);             // brass bands
  site.cyl(0.62, 0.62, 0.08, 8, GOLDT, 0, 1.3, 0, 0, Math.PI / 8);
  site.cyl(0.9, 0.7, 0.24, 8, STONE_DK, 0, 1.5, 0, 0, Math.PI / 8);            // capital
  site.sph(0.5, 12, 6, VELVET, 0, 1.77, 0, [1.5, 0.5, 1.5]);                  // the cushion
  site.torus(0.7, 0.05, 4, 18, GOLDT, 0, 1.72, 0, Math.PI / 2);               // piping
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    site.cone(0.08, 0.26, 5, GOLDT, sx * 0.55, 1.58, sz * 0.55, 0, 0, Math.PI);   // tassels
  }
  site.face('plaque', 0.86, 0.4, 0, 0.9, 0.615);                                 // PLEASE DO NOT TOUCH
  // the Lost Property board: two posts, a roof cap, faces both sides
  {
    const bx = -2.5, bz = -0.7, yaw = 0.2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (ox) => [bx + ox * c, bz - ox * s];
    for (const ox of [-1.05, 1.05]) { const [px, pz] = P(ox); site.cyl(0.1, 0.12, 2.9, 6, WOODD, px, 1.05, pz); }
    site.box(2.36, 1.24, 0.12, WOODD, bx, 1.75, bz, 0, yaw);
    site.box(2.6, 0.14, 0.42, 0x8a3c2c, bx, 2.46, bz, 0, yaw);
    site.face('lostprop', 2.2, 1.1, bx + s * 0.07, 1.75, bz + c * 0.07, yaw);
    site.face('poster', 0.8, 1.1, bx - s * 0.07, 1.75, bz - c * 0.07, yaw + Math.PI);
    for (const ox of [-1.05, 1.05]) { const [px, pz] = W(...P(ox)); ctx.colliders.push({ x: px, z: pz, r: 0.28 }); }
  }
  // (the plinth mesh is built below, merged with the plaza fingerpost: one call)
  const plinthGeo = site.geometry();
  plinthGeo.applyMatrix4(new THREE.Matrix4().makeRotationY(S.ry).setPosition(S.x, S.gy, S.z));
  ctx.colliders.push({ x: S.x, z: S.z, r: 1.25 });
  // nothing grows on the display (nature re-tests its instances on world:ready)
  clearanceClaim(ctx, S.x - sinR * 0.2, S.z - cosR * 0.2, 7.5, 6.5, S.ry, 'cave_key_plinth');

  // ── the key itself ─────────────────────────────────────────────────────────
  const keyMat = glowMat(0xffb428, { intensity: 0.5 });
  const kb = keyGeo();
  const key = new THREE.Mesh(kb.geometry(), keyMat);
  key.name = 'cave_key'; key.castShadow = false;   // it floats: a shadow reads as a bug (and costs a pass)
  key.userData.noFade = true;
  const KEY_Y = S.gy + 2.95, KEY_S = 1.35;
  key.position.set(S.x, KEY_Y, S.z);
  key.scale.setScalar(KEY_S);
  group.add(key);

  const beams = beamField(ctx);
  const beamSlot = beams.add(KEY_HEX, { x: S.x, y: S.gy + 0.02, z: S.z, height: 18, width: 3.2, pool: 2.3 });

  // ── the trail ──────────────────────────────────────────────────────────────
  const trail = [];
  const WOOD = 0x6b4a30, CAP = 0xd2263a;
  /** a fingerpost: post, cap, arms [{ name, tx, tz, y }], optional poster */
  function fingerpost(x, z, arms, o = {}) {
    const f = new Site();
    const gy = world.height(x, z);
    f.cyl(0.15, 0.19, 4.5, 6, WOOD, x, gy + 1.8, z);
    f.sph(0.26, 8, 6, CAP, x, gy + 4.1, z);
    for (const a of arms) f.arm(a.name, 2.9, 0.64, x + Math.cos(a.yaw) * 1.3, gy + a.y, z - Math.sin(a.yaw) * 1.3, a.yaw);
    if (o.poster) {
      const r = o.posterYaw;
      f.box(0.92, 1.24, 0.08, WOOD, x + Math.sin(r) * 0.2, gy + 1.25, z + Math.cos(r) * 0.2, 0, r);
      f.face('poster', 0.82, 1.13, x + Math.sin(r) * 0.25, gy + 1.25, z + Math.cos(r) * 0.25, r);
      f.face('poster', 0.82, 1.13, x + Math.sin(r) * 0.15, gy + 1.25, z + Math.cos(r) * 0.15, r + Math.PI);
    }
    ctx.colliders.push({ x, z, r: 0.35 });
    if (o.into) { o.into.push(f.geometry()); return null; }   // merged into a bigger mesh
    const m = f.build(o.name || 'cave_key_post');
    m.castShadow = false;                           // thin post: not worth a shadow pass
    group.add(m); trail.push(m);
    clearanceClaim(ctx, x, z, 3.2, 3.2, 0, (o.name || 'cave_key_post') + '_claim');
    return m;
  }
  const armTo = (x, z, tx, tz, name, y) => ({ name, yaw: armYaw(x, z, tx, tz), y });

  // 1. the plaza exit: the road south out of the Welcome Plaza
  const WS = winchSpot(ctx);
  const plazaGeo = [];
  {
    const plaza = world.LANDMARKS.welcome_plaza;
    const sp = itemSpot(ctx, plaza.x + 5.5, plaza.z + 9.5, { radius: 5, need: 0.9, pathMin: 0.6, pathMax: 3.2, minH: 1, pull: 0.2, farSide: true, prefer: { x: plaza.x, z: plaza.z, w: 0.12 }, avoid: [{ x: S.x, z: S.z, r: 5 }] });
    const np = nearestPathPoint(world, sp.x, sp.z, 'cat');
    fingerpost(sp.x, sp.z, [
      armTo(sp.x, sp.z, S.x, S.z, 'key', 3.55),
      armTo(sp.x, sp.z, WS.x, WS.z, 'quay', 2.75),
    ], { poster: true, posterYaw: readYaw(sp.x, sp.z, np.x, np.z), name: 'cave_key_plazapost', into: plazaGeo });
    trail.plaza = sp;
  }
  // the display + the plaza fingerpost: ONE mesh (they share a frame)
  const plinth = new THREE.Mesh(mergeGeometries([plinthGeo, ...plazaGeo], false), atlas.material);
  plinth.name = 'cave_key_plinth'; plinth.castShadow = true; plinth.receiveShadow = true;
  plinth.userData.noFade = true;
  group.add(plinth);
  // 2. the arrivals road: a notice board you walk straight past off the ferry
  {
    const sp = itemSpot(ctx, 66, 16.5, { radius: 6, need: 1.1, pathMin: 0.7, pathMax: 3.2, minH: 1, pull: 0.3, farSide: true });
    const np = nearestPathPoint(world, sp.x, sp.z, 'cat');
    const r = readYaw(sp.x, sp.z, np.x, np.z), c = Math.cos(r), s = Math.sin(r);
    const f = new Site();
    const gy = world.height(sp.x, sp.z);
    for (const ox of [-0.85, 0.85]) f.cyl(0.09, 0.11, 2.9, 6, WOOD, sp.x + ox * c, gy + 1.0, sp.z - ox * s);
    f.box(2.0, 1.55, 0.1, WOOD, sp.x, gy + 1.62, sp.z, 0, r);
    f.box(2.2, 0.14, 0.4, CAP, sp.x, gy + 2.46, sp.z, 0, r);
    f.cyl(0.08, 0.08, 0.9, 6, WOOD, sp.x, gy + 2.9, sp.z);
    // two copies of the poster side by side, both faces (the cats did twelve)
    for (const ox of [-0.47, 0.47]) for (const side of [1, -1]) {
      const px = sp.x + ox * c * side, pz = sp.z - ox * s * side;
      f.face('poster', 0.86, 1.18, px + s * 0.065 * side, gy + 1.62, pz + c * 0.065 * side, side > 0 ? r : r + Math.PI, 0, ox * 0.06);
    }
    f.arm('plaza', 2.1, 0.46, sp.x + Math.cos(armYaw(sp.x, sp.z, S.x, S.z)) * 0.3, gy + 2.85, sp.z - Math.sin(armYaw(sp.x, sp.z, S.x, S.z)) * 0.3, armYaw(sp.x, sp.z, S.x, S.z));
    const m = f.build('cave_key_arrivals'); m.castShadow = false; group.add(m); trail.push(m);
    clearanceClaim(ctx, sp.x, sp.z, 3.6, 3.6, r, 'cave_key_arrivals_claim');
    for (const ox of [-0.85, 0.85]) ctx.colliders.push({ x: sp.x + ox * c, z: sp.z - ox * s, r: 0.25 });
    trail.arrivals = sp;
  }
  // the doorway itself: nature's boulders had piled up in front of it. Claimed
  // BEFORE the hatch post looks for ground, so the search knows the outcrop in
  // front of the door is going (it used to dodge it straight onto the bluff
  // boulder, whose lumps carry no collider, and stand the post inside it).
  const apron = clearanceClaim(ctx, HATCH.x + Math.cos(HATCH_A) * 4.2, HATCH.z + Math.sin(HATCH_A) * 4.2, 8.5, 8.5, 0, 'cave_hatch_apron');
  // 3. the hatch: "the key is back west, at the plaza" — on the open grass
  //    beside the door, never on the Yarn Hill boulders (itemSpot's rock test)
  {
    const perpX = -Math.sin(HATCH_A), perpZ = Math.cos(HATCH_A);
    const sp = itemSpot(ctx, HATCH_STAND.x + perpX * 3.6 + Math.cos(HATCH_A) * 0.8, HATCH_STAND.z + perpZ * 3.6 + Math.sin(HATCH_A) * 0.8,
      { radius: 3.5, need: 0.8, pathMin: -99, pathMax: 999, minH: 0.8, pull: 0.3, foot: 1.0,
        cleared: [{ x: apron.x, z: apron.z, w: apron.w, d: apron.d, rot: apron.rot }],
        avoid: [{ x: HATCH_STAND.x, z: HATCH_STAND.z, r: 2.4 }, { x: YARN.x, z: YARN.z, r: 9.6 }] });
    fingerpost(sp.x, sp.z, [armTo(sp.x, sp.z, S.x, S.z, 'plaza', 3.5)],
      { poster: true, posterYaw: readYaw(sp.x, sp.z, HATCH_STAND.x + Math.cos(HATCH_A) * 6, HATCH_STAND.z + Math.sin(HATCH_A) * 6), name: 'cave_key_hatchpost' });
    // the LOST KEY? board hangs 0.2 u off this post and is 0.9 u wide: make the
    // whole board solid (after the search, so the spot is unchanged), so a
    // walker stops at the board and not at the thin post behind it
    ctx.colliders.push({ x: sp.x, z: sp.z, r: 0.62 });
    trail.hatch = sp;
  }
  trail.apron = apron;


  // ── state + wiring ─────────────────────────────────────────────────────────
  let state = 'plinth';            // plinth → flying → taken | gone (Rusty's copy)
  let marker = 'plinth';           // plinth → hatch → done
  let entry = null, emitter = null, markerT = -1, flyT = 0, beamK = 1;
  const flyFrom = new THREE.Vector3();
  const _kp = { x: 0, y: 0, z: 0 };

  function syncMarker() {
    if (marker === 'done') { mapMarker(ctx, { id: 'cave_key', remove: true }); return; }
    if (marker === 'hatch') mapMarker(ctx, { id: 'cave_key', x: HATCH.x, z: HATCH.z, glyph: 'key', label: 'Cave hatch (use the key)' });
    else mapMarker(ctx, { id: 'cave_key', x: S.x, z: S.z, glyph: 'key', label: 'Cave key' });
  }
  function stopSparkles() { if (emitter) { emitter.stop?.(); emitter = null; } }
  function take() {
    if (state !== 'plinth') return;
    const p = ctx.systems.player?.position;
    state = 'flying'; flyT = 0; flyFrom.copy(key.position);
    if (entry) entry.enabled = false;
    stopSparkles();
    fx()?.sparkle?.(key.position.x, key.position.y, key.position.z, 0xffe07a, 18);
    fx()?.burst?.({ x: S.x, y: S.gy + 2.2, z: S.z, count: 26, color: [0xffe07a, 0xffffff, 0xffb428], speed: 3.4, up: 1.5, life: 0.9, size: 0.26, sizeEnd: 0.04, gravity: -4, drag: 1.6, spread: 0.6, shape: 'sparkle', blend: 'add' });
    story()?.set('found_cave_key', true);
    story()?.set('helper_5', true);                 // the hatch keys off this flag
    marker = 'hatch'; syncMarker();
    ui()?.toast('CAVE KEY! It opens the hatch under the Great Ball of Yarn — Yarn Hill, far east.', 6.5, { icon: 'spark' });
    ui()?.setObjective?.('Unlock the hatch under the Great Ball of Yarn', 'Yarn Hill, east of Catnip Commons · it is on your map (M)');
    ui()?.say?.('CLAIMED. Please sign here. …There is nobody here to sign for it. There never was.', { speaker: 'Lost Property', duration: 5.5 });
    ctx.events.emit('escape:item', { item: 'cave_key', x: p?.x ?? S.x, z: p?.z ?? S.z });
  }
  function vanish() {                  // Rusty handed over his copy: the display empties
    if (state !== 'plinth') return;
    state = 'gone'; key.visible = false;
    if (entry) entry.enabled = false;
    stopSparkles();
    fx()?.burst?.({ x: S.x, y: S.gy + 2.4, z: S.z, count: 10, color: [0xffffff, 0xffe07a], speed: 1.2, life: 0.8, size: 0.3, gravity: 0.5, spread: 0.4 });
  }

  ctx.events.on('world:ready', () => {
    const I = ctx.systems.interaction;
    // PROMPT PRIORITY: inventory pickups report themselves 0.9 u closer than
    // they are, and the weapons builder's ammo/weapon pickups can land beside
    // the plinth — the key reports 1.4 u closer, so standing at the display
    // always offers the key first.
    const kp = { x: S.x, z: S.z, y: KEY_Y };
    entry = I?.register?.({
      id: 'cave_key_plinth', x: S.x, z: S.z, y: KEY_Y, promptH: 1.0, r: 3.0,
      label: 'Take the cave key', onInteract: () => take(),
      getPos() {
        const q = ctx.systems.player?.position;
        if (!q) return kp;
        const dx = S.x - q.x, dz = S.z - q.z, d = Math.hypot(dx, dz);
        if (d < 0.001) return kp;
        const k = Math.min(1.4, d * 0.5);
        _kp.x = S.x - dx / d * k; _kp.z = S.z - dz / d * k; _kp.y = KEY_Y;
        return _kp;
      },
    }) || null;
    if (entry && state !== 'plinth') entry.enabled = false;
    if (state === 'plinth') {
      emitter = fx()?.emitter?.({
        x: S.x, y: S.gy + 2.0, z: S.z, rate: 7, area: 0.55, areaY: 0.6,
        color: [0xffe27a, 0xffffff, 0xffc84a], shape: 'sparkle', blend: 'add',
        speed: 0.12, vy: 1.7, vyJitter: 0.6, gravity: 0.3, drag: 0.2,
        life: 3.4, lifeVar: 0.3, size: 0.3, sizeEnd: 0.06, sizeVar: 0.4, range: 80,
      }) || null;
    }
    story()?.once?.('helper_5', () => { vanish(); if (marker === 'plinth') { marker = 'hatch'; syncMarker(); } });
    ctx.events.on('escape:start', (e) => { if (e?.route === 'cave') { marker = 'done'; syncMarker(); } });
    syncMarker();
    markerT = 2.0;                      // …and once more in case the map lands late
    rustyHint(ctx, (first) => (state === 'plinth' && !story()?.get('helper_5'))
      ? (first
        ? "Oh — and somebody lost a key. Cat-shaped. It's sat on the Lost Property plinth by the Welcome Plaza, glowing like it WANTS to be stolen. Opens the hatch under the Great Ball of Yarn. You didn't hear that from me."
        : "That key's still on the Lost Property plinth, top of the harbour road by the plaza. Hatch under the yarn ball. Free, which is the worst price.")
      : null);
  });

  // ── frame ──────────────────────────────────────────────────────────────────
  const api = {
    spot: S, trail,
    get state() { return state; },
    /** Same as pressing E at the plinth (tests + views). */
    take: () => take(),
    /** The hatch said no: point at the key. */
    lockedHint() {
      if (state === 'plinth') {
        ui()?.toast('The cave key is on the Lost Property plinth by the Welcome Plaza — look for the gold light (M: map).', 6, { icon: 'spark' });
        syncMarker();
      }
    },
    update(dt, c) {
      const t = c.state.elapsed;
      const night = 1 - (c.state.daylight ?? 1);
      atlas.night(night);
      if (markerT > 0 && (markerT -= dt) <= 0) syncMarker();
      drainRustyHints(ctx, dt);

      if (state === 'plinth') {
        key.position.y = KEY_Y + Math.sin(t * 1.6) * 0.09;
        const cam = c.camera.position;
        key.rotation.set(0, Math.atan2(cam.x - S.x, cam.z - S.z) + Math.sin(t * 0.9) * 0.55, Math.sin(t * 0.8) * 0.14);
      } else if (state === 'flying') {
        flyT += dt;
        const k = Math.min(1, flyT / 0.55);
        const p = c.systems.player?.position;
        const tx = p ? p.x : S.x, ty = p ? p.y + 1.3 : KEY_Y, tz = p ? p.z : S.z;
        const e = k * k * (3 - 2 * k);
        key.position.set(flyFrom.x + (tx - flyFrom.x) * e, flyFrom.y + (ty - flyFrom.y) * e + Math.sin(k * Math.PI) * 1.2, flyFrom.z + (tz - flyFrom.z) * e);
        key.rotation.y += dt * 14;
        key.scale.setScalar(KEY_S * (1 - 0.85 * e));
        if (k >= 1) {
          state = 'taken'; key.visible = false;
          fx()?.sparkle?.(tx, ty, tz, 0xffe07a, 12);
        }
      }
      keyMat.emissiveIntensity = 0.45 + 1.0 * night + Math.sin(t * 3.1) * 0.08;

      // the light column (billboarded in its shader): breathe, fade out once taken
      beamK = damp(beamK, state === 'plinth' ? 1 : 0, 2.5, dt);
      beams.set(beamSlot, beamK < 0.01 ? 0 : beamK * (0.9 + 0.6 * night) * (0.9 + 0.1 * Math.sin(t * 2.2)));
    },
  };
  console.warn('[escape/key]', JSON.stringify({
    key: [+S.x.toFixed(1), +S.z.toFixed(1)], clear: +S.clear.toFixed(2), edge: +S.edge.toFixed(2), fallback: S.fallback,
    plazaPost: [+trail.plaza.x.toFixed(1), +trail.plaza.z.toFixed(1)], arrivals: [+trail.arrivals.x.toFixed(1), +trail.arrivals.z.toFixed(1)],
    hatchPost: [+trail.hatch.x.toFixed(1), +trail.hatch.z.toFixed(1)], hatchPostRelaxed: trail.hatch.relaxed ?? -1, hatch: [+HATCH.x.toFixed(1), +HATCH.z.toFixed(1)],
    keyTris: Math.round(kb.tris()), plinthTris: Math.round(site.tris()),
  }));
  return api;
}

/** Yellow/black diagonal hazard stripes as flat quads for makePart (+Z face). */
function stripeQuads(w, h, n, slant, colA, colB, at, rot = null) {
  const out = [], sw = w / n, hw = w / 2, hh = h / 2;
  const cl = (v) => Math.max(-hw, Math.min(hw, v));
  for (let i = -1; i <= n; i++) {
    const x0 = -hw + i * sw - slant / 2;
    const xs = [cl(x0), cl(x0 + sw), cl(x0 + sw + slant), cl(x0 + slant)];
    if (xs[1] - xs[0] < 1e-3 && xs[2] - xs[3] < 1e-3) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([xs[0], -hh, 0, xs[1], -hh, 0, xs[2], hh, 0, xs[3], hh, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    out.push({ g, at, rot, color: (((i % 2) + 2) % 2) ? colB : colA });
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// THE HATCH YARD. The ledge in front of the hatch was one flat grey-olive plane
// (nature clears its plants off the hatch apron, and nothing replaced them).
// Now it is an authored patch:
//   · a worn dirt APRON at the door, and a dirt PATH that leaves it south —
//     between the hatch frame and the CAVE KEY fingerpost, between the
//     sea-view bench and the bluff boulder — and runs down toward the gym road,
//     which is the way back to the Welcome Plaza;
//   · a trail of cat PAW PRINTS from the apron out to a lookout on the cliff
//     corner (and some down the path);
//   · ~70 props in three sizes — moss clumps (their spore beads glow after
//     dark), pebble clusters, stray yarn balls with loose strands (they rolled
//     off the Great Ball), grass tufts that sway — bunched thickest along the
//     cliff edge and lining the path. The big ones are LOW PROPS (Contract A:
//     numeric h ≤ 1.6), so walkers step onto them instead of through them.
// Draw calls: ground 1 + props 1 (+ the props' shadow pass).
// ═════════════════════════════════════════════════════════════════════════════
const YARD_TAIL = [[200.25, -58.8], [199.85, -55.4], [198.95, -52.8], [199.9, -49.8], [199.4, -46.6], [198.8, -43.6]];
const YARD_SPUR = [[202.5, -66.9], [205.0, -67.8], [207.6, -69.0], [210.0, -70.1]];
const YARD_GROUND = 0x6f6d52;          // terrain's cat-ground albedo (terrain/paths.js GROUND_CAT)

function buildHatchYard(ctx, o) {
  const world = ctx.world;
  const R = rng(hash('escape:hatchyard'));
  const isl = world.ISLANDS?.cat;
  const GSTEP = isl?.radius ? (isl.radius * 2.36) / 208 : 1.34;
  // The ground mesh is a linear interpolation of a ~GSTEP grid: in hollows it
  // sits ABOVE world.height. The ring average minus the centre measures that
  // (slopes cancel out), so decals ride the rendered surface, never under it.
  const RING6 = [];
  for (let k = 0; k < 6; k++) RING6.push([Math.cos(k * Math.PI / 3) * GSTEP * 0.55, Math.sin(k * Math.PI / 3) * GSTEP * 0.55]);
  const surf = (x, z) => {
    const h = world.height(x, z);
    let s = 0; for (const [dx, dz] of RING6) s += world.height(x + dx, z + dz);
    const e = s / 6 - h;
    return h + (e > 0 ? e * 1.15 : 0);
  };
  const cols = ctx.colliders || [];
  const cleared = o.apron ? [{ x: o.apron.x, z: o.apron.z, w: o.apron.w, d: o.apron.d, rot: o.apron.rot }] : null;

  // ── geometry buffers for the ground mesh ───────────────────────────────────
  const P = [], CC = [], I = [];
  const _col = new THREE.Color(), _g = new THREE.Color(YARD_GROUND);
  const DIRT = new THREE.Color(0x8e714c), RUT = new THREE.Color(0x7c5f41), CROWN = new THREE.Color(0xa68659), SAND = new THREE.Color(0xbb9c6c);
  const EDGE = DIRT.clone().lerp(_g, 0.35);
  const CLS = [_g, EDGE, RUT, CROWN];
  function vert(x, y, z, c, jit = 0.1) {
    const k = 1 - jit + R() * jit * 2;
    P.push(x, y, z); CC.push(c.r * k, c.g * k, c.b * k);
    return P.length / 3 - 1;
  }
  function tri(a, b, c) {             // always face +Y
    const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2];
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny >= 0) I.push(a, b, c); else I.push(a, c, b);
  }

  // ── the path ribbon ────────────────────────────────────────────────────────
  const start = o.HW2(-1.0, 2.6), pinch = o.HW2(-3.4, 2.07);
  const pts = [start, pinch, ...YARD_TAIL];
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal', 0.5);
  const len = curve.getLength();
  const n = Math.max(12, Math.round(len / 0.42));
  const sp = curve.getSpacedPoints(n);
  const halfW = (s) => {
    let w = 0.8 + 0.1 * Math.sin(s * 0.83 + 0.4) + 0.05 * Math.sin(s * 2.1 + 1.3);
    if (s < 2) w += (2 - s) / 2 * 0.25;                    // it opens into the apron
    const tail = len - s; if (tail < 4) w *= 0.3 + 0.7 * tail / 4;   // and peters out
    return w;
  };
  const ROWS = [[-1.3, 0, -0.06, 0], [-1.0, 1, 0.045, 1], [-0.5, 1, 0.07, 2], [0, 1, 0.08, 3], [0.5, 1, 0.07, 2], [1.0, 1, 0.045, 1], [1.3, 0, -0.06, 0]];
  const center = [];
  let along = 0, prev = -1;
  for (let i = 0; i < sp.length; i++) {
    if (i > 0) along += Math.hypot(sp[i].x - sp[i - 1].x, sp[i].z - sp[i - 1].z);
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, L = Math.hypot(tx, tz) || 1;
    const nx = -tz / L, nz = tx / L, hw = halfW(along);
    center.push({ x: sp[i].x, z: sp[i].z, hw, s: along, tx: tx / L, tz: tz / L });
    const first = P.length / 3;
    for (const [f, core, dy, cls] of ROWS) {
      const x = sp[i].x + nx * f * hw, z = sp[i].z + nz * f * hw;
      const y = (core ? surf(x, z) : world.height(x, z)) + dy;
      const c = cls === 3 && R() < 0.14 ? SAND : CLS[cls];
      vert(x, y, z, c, cls ? 0.09 : 0.04);
    }
    if (prev >= 0) for (let r = 0; r < ROWS.length - 1; r++) { tri(prev + r, prev + r + 1, first + r); tri(prev + r + 1, first + r + 1, first + r); }
    prev = first;
  }

  // ── the apron: a worn fan at the door ──────────────────────────────────────
  const [ax, az] = o.HW2(0, 3.7);
  const AR = 2.2, K = 30;
  const RINGS = [[0.42, 0.075, 3], [0.78, 0.066, 2], [1.0, 0.045, 1], [1.24, -0.06, 0]];
  const c0 = vert(ax, surf(ax, az) + 0.075, az, CROWN, 0.05);
  const ringIdx = [];
  for (let k = 0; k < RINGS.length; k++) {
    const row = [];
    for (let j = 0; j < K; j++) {
      const a = j / K * Math.PI * 2;
      const rr = AR * (1 + 0.08 * Math.sin(3 * a + 0.7) + 0.05 * Math.sin(5 * a + 2.1) + (k === RINGS.length - 1 ? 0.06 * Math.sin(11 * a) : 0)) * RINGS[k][0];
      const x = ax + Math.cos(a) * rr, z = az + Math.sin(a) * rr;
      row.push(vert(x, (RINGS[k][2] ? surf(x, z) : world.height(x, z)) + RINGS[k][1], z, CLS[RINGS[k][2]], 0.08));
    }
    ringIdx.push(row);
  }
  for (let j = 0; j < K; j++) tri(c0, ringIdx[0][j], ringIdx[0][(j + 1) % K]);
  for (let k = 0; k < RINGS.length - 1; k++) for (let j = 0; j < K; j++) {
    const a = ringIdx[k][j], b = ringIdx[k][(j + 1) % K], c = ringIdx[k + 1][j], d = ringIdx[k + 1][(j + 1) % K];
    tri(a, c, b); tri(b, c, d);
  }

  // ── paw prints ─────────────────────────────────────────────────────────────
  const PAW = new THREE.Color(0x564536), PAW_D = new THREE.Color(0x6a5238);
  let prints = 0;
  function fan(cx, cz, rx, rz, fx, fz, y, c, seg) {
    const m = vert(cx, y, cz, c, 0.03);
    const ring = [];
    for (let j = 0; j < seg; j++) {
      const a = j / seg * Math.PI * 2, u = Math.cos(a) * rx, v = Math.sin(a) * rz;
      ring.push(vert(cx - fz * u + fx * v, y, cz + fx * u + fz * v, c, 0.03));
    }
    for (let j = 0; j < seg; j++) tri(m, ring[j], ring[(j + 1) % seg]);
  }
  function paw(x, z, fx, fz, onDirt, sc = 1.0) {
    const y = surf(x, z) + (onDirt ? 0.1 : 0.05);
    const c = onDirt ? PAW_D : PAW;
    fan(x, z, 0.12 * sc, 0.1 * sc, fx, fz, y, c, 8);
    for (const [u, v] of [[-0.12, 0.12], [-0.045, 0.18], [0.045, 0.18], [0.12, 0.12]]) {
      fan(x - fz * u * sc + fx * v * sc, z + fx * u * sc + fz * v * sc, 0.045 * sc, 0.05 * sc, fx, fz, y + 0.002, c, 6);
    }
    prints++;
  }
  function walkPrints(poly, step, side, onDirt, back = false, skip = 0) {
    const segs = [];
    let tot = 0;
    for (let i = 0; i < poly.length - 1; i++) { const L = Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]); segs.push({ a: poly[i], b: poly[i + 1], L, s0: tot }); tot += L; }
    let k = 0;
    for (let s = step * 0.5 + skip; s < tot; s += step, k++) {
      const S = segs.find((q) => s <= q.s0 + q.L) || segs[segs.length - 1];
      const t = (s - S.s0) / S.L;
      let fx = (S.b[0] - S.a[0]) / S.L, fz = (S.b[1] - S.a[1]) / S.L;
      const x0 = S.a[0] + (S.b[0] - S.a[0]) * t, z0 = S.a[1] + (S.b[1] - S.a[1]) * t;
      if (back) { fx = -fx; fz = -fz; }
      const off = (k % 2 ? 1 : -1) * 0.14 + side;
      paw(x0 - fz * off, z0 + fx * off, fx, fz, onDirt);
    }
  }
  walkPrints(YARD_SPUR, 0.6, 0);                       // out to the lookout
  const pathPoly = center.filter((c) => c.s > 1.5 && c.s < 9).map((c) => [c.x, c.z]);
  if (pathPoly.length > 2) walkPrints(pathPoly, 0.7, 0.18, true);

  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  gGeo.setAttribute('color', new THREE.Float32BufferAttribute(CC, 3));
  gGeo.setIndex(I);
  gGeo.computeVertexNormals();
  gGeo.computeBoundingSphere();
  const gMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.name = 'cave_hatch_yard_ground';
  ground.receiveShadow = true; ground.castShadow = false;
  ground.userData.noFade = true; ground.userData.noRay = true;
  ctx.scene.add(ground);

  // ── props ──────────────────────────────────────────────────────────────────
  const tris = decorTris(ctx, 204, -60, 24);
  const parts = [], meta = [];
  const put = (geo, color, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, sway = 0, glow = 0, base = 0, h = 1) => {
    parts.push(place(paint(geo, color), x, y, z, rx, ry, rz, sx, sy, sz));
    meta.push({ sway, glow, base, h });
  };
  const pick = (a) => a[Math.floor(R() * a.length) % a.length];
  const lowCols = [];
  function moss(x, z, s, gy) {
    const cA = pick([0x5c8a3c, 0x6d9a42, 0x527f36]), cB = pick([0x86b04e, 0x7aa848]);
    const a = R() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    put(new THREE.SphereGeometry(0.5, 7, 4), cA, x, gy + 0.02 * s, z, 0, a, 0, s, 0.42 * s, 0.9 * s);
    put(new THREE.SphereGeometry(0.34, 6, 4), cB, x + ca * 0.42 * s, gy + 0.03 * s, z + sa * 0.42 * s, 0, a, 0, s, 0.55 * s, s);
    put(new THREE.SphereGeometry(0.27, 6, 3), cA, x - sa * 0.36 * s, gy + 0.02 * s, z + ca * 0.36 * s, 0, a, 0, s, 0.5 * s, s);
    const beads = 3 + Math.floor(R() * 3);
    for (let i = 0; i < beads; i++) {
      const bA = R() * Math.PI * 2, bd = R() * 0.3 * s;
      const by = gy + 0.02 * s + 0.21 * s * Math.sqrt(Math.max(0, 1 - (bd / (0.5 * s)) ** 2));
      put(new THREE.SphereGeometry(0.035 + 0.025 * s, 4, 3), 0xd8ff84, x + Math.cos(bA) * bd, by, z + Math.sin(bA) * bd, 0, 0, 0, 1, 1, 1, 0, 1);
    }
    if (s >= 1.3) lowCols.push({ x, z, r: 0.48 * s, h: 0.22 * s });
  }
  function pebbles(x, z, s, gy) {
    const k = 2 + Math.floor(R() * 3);
    for (let i = 0; i < k; i++) {
      const r = (i === 0 ? 0.3 : 0.12 + R() * 0.12) * s;
      const a = R() * Math.PI * 2, d = i === 0 ? 0 : (0.3 + R() * 0.22) * s;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const sy = 0.58 + R() * 0.22;
      put(new THREE.SphereGeometry(r, 5, 3), pick([0xa39d93, 0x8b857b, 0xbdb3a0, 0x958a78, 0xb2a894]), px, world.height(px, pz) + r * sy * 0.55, pz, (R() - 0.5) * 0.5, R() * 6, (R() - 0.5) * 0.5, 1, sy, 1);
    }
    if (s >= 1.3) lowCols.push({ x, z, r: 0.3 * s, h: 0.3 * s * 0.8 });
  }
  function yarn(x, z, s, gy) {
    const r = 0.3 * s;
    const col = pick([0xff7aa8, 0x5fc8d8, 0xffd24a, 0xb07ae8, 0xff9a4a]);
    const yc = gy + r * 0.9;
    put(new THREE.SphereGeometry(r, 9, 6), col, x, yc, z, R(), R() * 6, R());
    put(new THREE.TorusGeometry(r * 0.99, 0.022 * s + 0.012, 4, 12), 0xfff3f6, x, yc, z, R() * 3, R() * 3, R() * 3);
    put(new THREE.TorusGeometry(r * 0.99, 0.02 * s + 0.012, 4, 12), 0xfff3f6, x, yc, z, R() * 3, R() * 3, R() * 3);
    // a loose strand wandering off along the ground
    // (each segment joins its two ground points, and the strand stops rather
    // than dangle off a drop — horizontal segments at stepped heights read as
    // a string floating up the cliff)
    let a = R() * Math.PI * 2, px = x + Math.cos(a) * r * 0.9, pz = z + Math.sin(a) * r * 0.9;
    let py = surf(px, pz) + 0.035;
    const seg = 0.28 * s + 0.1;
    for (let i = 0; i < 5; i++) {
      a += (R() - 0.5) * 1.1;
      const nx = px + Math.cos(a) * seg, nz = pz + Math.sin(a) * seg, ny = surf(nx, nz) + 0.035;
      if (Math.abs(ny - py) > seg * 0.6) break;
      const hz = Math.hypot(nx - px, nz - pz);
      put(new THREE.BoxGeometry(0.05 * s + 0.02, 0.035, Math.hypot(hz, ny - py) * 1.08), col,
        (px + nx) / 2, (py + ny) / 2, (pz + nz) / 2, -Math.atan2(ny - py, hz), Math.atan2(nx - px, nz - pz), 0);
      px = nx; pz = nz; py = ny;
    }
    if (s >= 0.95) lowCols.push({ x, z, r, h: r * 1.8 });
  }
  function tuft(x, z, s, gy) {
    const k = 5 + Math.floor(R() * 3);
    for (let i = 0; i < k; i++) {
      const h = (0.42 + R() * 0.36) * s, a = R() * Math.PI * 2, tilt = 0.14 + R() * 0.32;
      const bx = x + Math.cos(a) * 0.07 * s, bz = z + Math.sin(a) * 0.07 * s;
      const lx = Math.sin(tilt) * Math.cos(a), lz = Math.sin(tilt) * Math.sin(a);
      put(new THREE.ConeGeometry(0.05 * s + 0.02, h, 3), pick([0x9aa64a, 0x80983c, 0xb5b05a, 0x8fae4c, 0xa89c52]),
        bx + lx * h / 2, gy - 0.03 + Math.cos(tilt) * h / 2, bz + lz * h / 2, tilt * Math.sin(a), 0, -tilt * Math.cos(a), 1, 1, 1, 1, 0, gy - 0.03, h);
    }
  }
  const MAKE = { moss, pebble: pebbles, yarn, tuft };
  const RAD = { moss: 0.5, pebble: 0.42, yarn: 0.34, tuft: 0.3 };
  const CAP = { moss: 30, pebble: 34, yarn: 10, tuft: 38 };
  const SIZE = [0.74, 1.08, 1.6];
  const counts = { moss: 0, pebble: 0, yarn: 0, tuft: 0 }, bySize = [0, 0, 0];
  const placed = [];
  const distPoly = (poly, x, z) => {
    let d = Infinity;
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax0, az0] = poly[i], [bx0, bz0] = poly[i + 1];
      const vx = bx0 - ax0, vz = bz0 - az0, L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax0) * vx + (z - az0) * vz) / L2));
      const dd = Math.hypot(x - ax0 - vx * t, z - az0 - vz * t); if (dd < d) d = dd;
    }
    return d;
  };
  const cPoly = center.map((c) => [c.x, c.z]);
  const pathHW = (x, z) => { let best = Infinity, hw = 0.8; for (const c of center) { const d = Math.hypot(c.x - x, c.z - z); if (d < best) { best = d; hw = c.hw; } } return hw; };
  const post = o.post;
  function tryPlace(kind, si, x, z, strict = true) {
    if (counts[kind] >= CAP[kind]) return false;
    const s = SIZE[si] * (0.9 + R() * 0.2), rad = RAD[kind] * s;
    const h = world.height(x, z);
    if (h < 1.6) return false;
    const gx = world.height(x + 0.4, z) - world.height(x - 0.4, z), gz = world.height(x, z + 0.4) - world.height(x, z - 0.4);
    if (Math.hypot(gx, gz) / 0.8 > 1.3) return false;                    // not on the cliff face
    if (Math.hypot(x - YARN.x, z - YARN.z) < 9.4 + rad) return false;     // not on the plinth
    if (Math.hypot(x - ax, z - az) < AR * 1.05 + rad) return false;       // the apron stays walkable
    if (distPoly(cPoly, x, z) < pathHW(x, z) * 1.12 + rad) return false;
    if (distPoly(YARD_SPUR, x, z) < 0.45 + rad) return false;            // the prints stay readable
    if (post && Math.hypot(x - post.x, z - post.z) < 1.3 + rad) return false;
    if (clearanceAt(cols, x, z, 3, cleared) < rad + 0.12) return false;
    if (rockUnder(tris, world, x, z, rad * 0.8 + 0.15, 0.3)) return false;
    for (const q of placed) {
      const tight = (kind === 'tuft' || q.kind === 'tuft') ? 0.55 : 1;
      if (Math.hypot(x - q.x, z - q.z) < (rad + q.rad) * tight + 0.12) return false;
    }
    MAKE[kind](x, z, s, h);
    placed.push({ kind, x, z, rad });
    counts[kind]++; bySize[si]++;
    return true;
  }
  // the lookout at the end of the paw trail: a big yarn ball, a cairn, moss
  const [ex, ez] = YARD_SPUR[YARD_SPUR.length - 1];
  tryPlace('yarn', 2, ex - 0.4, ez - 1.25);
  tryPlace('pebble', 2, ex + 0.2, ez + 1.2);
  tryPlace('moss', 1, ex + 1.15, ez - 0.2);
  for (let i = 0; i < 5200 && placed.length < 118; i++) {
    const x = 194 + R() * 27, z = -79 + R() * 38;
    const pd = distPoly(cPoly, x, z), hw = pathHW(x, z);
    const lining = pd > hw * 1.12 && pd < hw + 2.0;
    const ledge = x > 196.5 && z < -58.2;
    if (!ledge && !lining) continue;
    const h = world.height(x, z);
    if (h < 1.6) continue;
    let lo = h;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; const hh = world.height(x + Math.cos(a) * 2.6, z + Math.sin(a) * 2.6); if (hh < lo) lo = hh; }
    const drop = h - lo;
    const edgeW = Math.max(0, Math.min(1, (drop - 1.7) / 1.5));
    const w = (ledge ? 0.2 : 0) + edgeW * 1.5 + (lining ? (z < -50 ? 0.4 : 0.16) : 0);
    if (R() > w) continue;
    const r = R();
    let kind;
    if (edgeW > 0.35) kind = r < 0.36 ? 'tuft' : r < 0.68 ? 'moss' : r < 0.92 ? 'pebble' : 'yarn';
    else if (lining) kind = r < 0.4 ? 'pebble' : r < 0.74 ? 'tuft' : r < 0.88 ? 'moss' : 'yarn';
    else kind = r < 0.34 ? 'pebble' : r < 0.62 ? 'moss' : r < 0.88 ? 'tuft' : 'yarn';
    const rs = R();
    tryPlace(kind, rs < 0.3 ? 0 : rs < 0.72 ? 1 : 2, x, z);
  }
  // measured before the props' own low colliders go in
  let pathMinClear = Infinity, pathInRock = 0, pathTight = null;
  for (const c of center) {
    if (c.s < 1.0) continue;                          // the first metre is the apron at the door frame
    const cl = clearanceAt(cols, c.x, c.z, 6, cleared) - c.hw;
    if (cl < pathMinClear) { pathMinClear = cl; pathTight = [+c.x.toFixed(1), +c.z.toFixed(1), +c.s.toFixed(1)]; }
    if (rockUnder(tris, world, c.x, c.z, c.hw * 0.8, 0.3)) pathInRock++;
  }
  for (const c of lowCols) cols.push(c);

  let props = null, propTris = 0;
  const U = { uTime: { value: 0 }, uNight: { value: 0 } };
  if (parts.length) {
    const g = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    const nV = g.attributes.position.count;
    const sway = new Float32Array(nV), glow = new Float32Array(nV);
    const pos = g.attributes.position;
    let v = 0;
    parts.forEach((p, i) => {
      const m = meta[i], cnt = p.attributes.position.count;
      for (let j = 0; j < cnt; j++, v++) {
        if (m.sway) sway[v] = m.sway * Math.max(0, Math.min(1, (pos.getY(v) - m.base) / m.h));
        glow[v] = m.glow;
      }
    });
    g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    propTris = (g.index ? g.index.count : nV) / 3;
    const pm = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 });
    pm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime; sh.uniforms.uNight = U.uNight;
      sh.vertexShader = 'attribute float aSway;\nattribute float aGlow;\nuniform float uTime;\nuniform float uNight;\nvarying float vGlow;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'transformed.x += sin(uTime * 1.9 + position.x * 0.8 + position.z * 0.6) * 0.07 * aSway;',
          'transformed.z += cos(uTime * 1.5 + position.z * 0.9 + position.x * 0.3) * 0.05 * aSway;',
          'vGlow = aGlow * uNight;',
        ].join('\n'));
      sh.fragmentShader = 'varying float vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * vGlow * 1.9;');
    };
    pm.customProgramCacheKey = () => 'escape-hatchyard-v1';
    props = new THREE.Mesh(g, pm);
    props.name = 'cave_hatch_yard_props';
    props.castShadow = true; props.receiveShadow = true;
    props.userData.noFade = true;
    ctx.scene.add(props);
  }
  console.warn('[escape/hatchyard]', JSON.stringify({
    pathLen: +len.toFixed(1), pathMinClear: +pathMinClear.toFixed(2), pathTight, pathInRock, prints,
    props: placed.length, counts, sizes: bySize, lowColliders: lowCols.length,
    groundTris: I.length / 3, propTris: Math.round(propTris),
  }));
  return {
    ground, props, placed, center, lowCols, prints,
    update(dt, c, night) { U.uTime.value = c.state.elapsed; U.uNight.value = night; },
  };
}
