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
import { signMesh } from './parts.js';           // vehicles' kit; shared on purpose

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
  mats.shaft = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x8fd8ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
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
    m.position.set(CX, CEIL_Y, CZ); m.receiveShadow = false; m.castShadow = true; m.frustumCulled = false;
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
  const amb = new THREE.HemisphereLight(0x6fc8e0, 0x1c3a5c, 0);
  amb.position.set(CX, FY + 12, CZ); group.add(amb);
  const fill = new THREE.AmbientLight(0x4a86ad, 0);
  group.add(fill);

  // ── the hatch on Cat Island (a real prop at the yarn ball) ────────────────
  const hatchGroup = new THREE.Group(); ctx.scene.add(hatchGroup);
  {
    const hy = world.height(HATCH.x, HATCH.z);
    const partMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
    // A doorway in a sand plinth is invisible from the game camera unless it
    // has a SURROUND that breaks the plinth's silhouette: buttress cheeks, a
    // stepped threshold out onto the grass, a lintel with a hazard band, and a
    // lamp. (At r = 7.5 the old frame was simply inside the plinth.)
    const frame = makePart([
      { g: new THREE.BoxGeometry(3.0, 2.6, 0.5), at: [0, 1.3, -0.4], color: 0x14100e },     // the dark behind the door
      { g: new THREE.BoxGeometry(4.4, 0.5, 1.1), at: [0, 2.85, -0.15], color: 0xa89070 },   // lintel
      { g: new THREE.BoxGeometry(4.6, 0.26, 1.3), at: [0, 3.2, -0.15], color: 0x6f5a44 },   // drip course
      { g: new THREE.BoxGeometry(0.9, 3.1, 1.0), at: [-1.95, 1.55, -0.15], color: 0x9a8468 }, // jambs
      { g: new THREE.BoxGeometry(0.9, 3.1, 1.0), at: [1.95, 1.55, -0.15], color: 0x9a8468 },
      { g: new THREE.BoxGeometry(1.3, 1.5, 1.6), at: [-2.3, 0.75, 0.4], color: 0x8a7358 },  // cheeks
      { g: new THREE.BoxGeometry(1.3, 1.5, 1.6), at: [2.3, 0.75, 0.4], color: 0x8a7358 },
      { g: new THREE.BoxGeometry(4.8, 0.34, 1.2), at: [0, 0.1, 0.5], color: 0x8a7358 },     // threshold
      { g: new THREE.BoxGeometry(5.4, 0.3, 1.2), at: [0, -0.2, 1.6], color: 0x7d6a52 },     // step down to the grass
      { g: new THREE.BoxGeometry(4.4, 0.18, 0.34), at: [0, 2.62, 0.42], color: 0xd9b36a },  // hazard band
      { g: new THREE.CylinderGeometry(0.12, 0.16, 2.6, 6), at: [-2.9, 1.3, 0.6], color: 0x3a4a4c },  // lamp post
      { g: new THREE.SphereGeometry(0.34, 9, 7), at: [-2.9, 2.75, 0.6], color: 0xffd79a },
    ], partMat);
    for (const s of [-1, 1]) {
      ctx.colliders.push({
        x: HATCH.x + Math.sin(HATCH_A) * s * 2.3,
        z: HATCH.z - Math.cos(HATCH_A) * s * 2.3, r: 0.85, h: hy + 2.6,
      });
    }
    frame.position.set(HATCH.x, hy - 0.25, HATCH.z);
    frame.rotation.y = HATCH_RY;
    hatchGroup.add(frame);
    const leafG = new THREE.Group();
    leafG.position.set(HATCH.x + Math.sin(HATCH_A) * 1.35, hy - 0.25, HATCH.z - Math.cos(HATCH_A) * 1.35);
    leafG.rotation.y = HATCH_RY;
    const leaf = makePart([
      { g: new THREE.BoxGeometry(2.7, 2.5, 0.26), at: [-1.35, 1.3, 0.14], color: 0xb09472 },
      { g: new THREE.BoxGeometry(2.4, 0.16, 0.32), at: [-1.45, 1.8, 0.14], color: 0x6b5540 },
      { g: new THREE.BoxGeometry(2.4, 0.16, 0.32), at: [-1.45, 0.5, 0.14], color: 0x6b5540 },
      // a cat-shaped keyhole: head + two ears
      { g: new THREE.CircleGeometry(0.19, 12), at: [-1.05, 1.0, 0.27], color: 0x14100e },
      { g: new THREE.ConeGeometry(0.1, 0.18, 3), at: [-1.18, 1.2, 0.27], color: 0x14100e },
      { g: new THREE.ConeGeometry(0.1, 0.18, 3), at: [-0.92, 1.2, 0.27], color: 0x14100e },
    ], partMat);
    leafG.add(leaf); hatchGroup.add(leafG);
    hatchGroup.userData.leaf = leafG;
    // a painted board over the lintel, so the hatch says what it is from the
    // path (the signs inside the tunnel are no use to anybody out here)
    try {
      const board = signMesh(3.9, 1.15, [
        { text: 'MAINTENANCE HATCH', size: 62, color: '#4a2f18' },
        { text: 'staff of cats only', size: 40, color: '#7a5a3a', weight: 700 },
      ], { bg: '#e8d3a8', borderColor: '#6b4a30', cw: 512, ch: 192 });
      board.position.set(HATCH.x + Math.cos(HATCH_A) * 0.62, hy + 3.55, HATCH.z + Math.sin(HATCH_A) * 0.62);
      board.rotation.y = HATCH_RY;
      board.castShadow = false;
      hatchGroup.add(board);
    } catch (e) { /* sign is decoration; never take the route down for it */ }
  }

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
   *  SIGHTLINE RULE at the top: the geometry is cut to THESE numbers. */
  function caveCam(on) {
    const cam = ctx.systems.camera;
    if (!cam?.params || !cam.setParams) return;
    if (on && !camSave) {
      camSave = { elevation: cam.params.elevation, distance: cam.params.distance, azimuth: cam.params.azimuth };
      const p = ctx.systems.player?.position;
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
  function show(v) {
    group.visible = v; hatchGroup.visible = true;
    for (const L of lights) L.visible = v;
    amb.intensity = v ? 1.0 : 0;
    fill.intensity = v ? 0.40 : 0;
    caveCam(v);
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
      inCave = true; show(true);
      const s = spawn(from === 'palace' ? 'palace' : 'cat');
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
        return;
      }
      hatchOpen = true;
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
    if (I?.register) for (const s of capEntries) { try { I.register(s); } catch (e) {} }
    // keep the hatch label honest once Rusty hands over the key
    ctx.systems.story?.once?.('helper_5', () => { hatchEntry.label = 'Unlock the hatch'; });
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
    update(dt, c) {
      const p = c.systems.player?.position;
      const night = 1 - (c.state.daylight ?? 1);
      // hatch leaf swings open once unlocked
      const hl = hatchGroup.userData.leaf;
      if (hl) hl.rotation.y = damp(hl.rotation.y, HATCH_RY + (hatchOpen ? -1.35 : 0), 4, dt);

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
