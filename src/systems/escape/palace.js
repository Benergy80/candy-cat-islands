// ─────────────────────────────────────────────────────────────────────────────
// THE CANDY PALACE — Candyland's biggest piece of edible architecture, and the
// Cat Island escape route's destination.  Landmark `candy_palace` (-150, -36).
//
//   · a 27×27 chocolate-brick PLINTH (top = TER, 3.8 above the flattened core)
//   · a royal-icing GRAND STAIR up the east face, off the candy_palace path
//   · a gingerbread CURTAIN WALL with gumdrop battlements + a chocolate
//     PORTCULLIS gate (interactable, winches up)
//   · four LOLLIPOP-SWIRL TURRETS with waffle-cone roofs and bunting between
//   · a wedding-cake KEEP: 4 frosted tiers + a sugar-glass dome, 34 units of it
//   · a real THRONE ROOM inside tier 1 (walkable, wall colliders, gummy throne,
//     banners, a candy chandelier, 2 lamps, and the Regent's forwarding address)
//   · a sunken CHOCOLATE CELLAR behind the throne, and the cave door in its
//     north wall
//
// Everything merges into one mesh per material.  The keep's upper tiers and the
// cellar ceiling live in their own "cover" builders so they can fade to 15%
// while the player is inside — an isometric camera cannot see through a roof.
//
// Exposed on the escape api: api.palace = { PX, PZ, GY, TER, CF, cellarDoor,
//   throneDoor, enterCellar(), interiors } and ctx.systems.escape.api.interiors.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hash, clamp, damp } from '../../core/util.js';
import {
  createMaterials, createBuilder, makeSignAtlas, plate,
  icingDrip, softGlow, lightPool, lamppost, C, SPRINKLE,
} from '../candy/architecture/kit.js';

const PX = -150, PZ = -36;          // world centre (LANDMARKS.candy_palace)
const HALF = 13.5;                  // plinth half-width
const WALL_R = 12.4;                // curtain wall centreline
const KEEP_R = 9.0;                 // keep outer radius
const KEEP_IN = 7.7;                // throne room inner radius
const SLAB = 0.8;                   // terrace slab thickness
const STAIR = { x0: -3.6, x1: -1.0, z0: -6.6, z1: -2.1 };   // cellar stairwell hole
const CELL = { x0: -7.5, x1: 1.0, z0: -11.0, z1: -6.6 };    // cellar room
const BRICK_UNIT = 2.4;
const KH_AT = { x: 3.0, z: 2.7 };    // WAVE 4: the King's-half stool, relative to the throne (south side, clear of the chandelier's shadow in the iso lens)

export function create(ctx, escape) {
  const { world } = ctx;
  const group = new THREE.Group(); group.name = 'candyPalace'; ctx.scene.add(group);
  ctx.colliders = ctx.colliders || [];
  ctx.walkables = ctx.walkables || [];

  // ── ground level: the landmark core is flattened but only 85%, so take the
  // highest sample under the footprint and bed the plinth into the rest.
  let gMax = -99, gMin = 99;
  for (let x = -HALF; x <= HALF; x += 2.25) for (let z = -HALF; z <= HALF; z += 2.25) {
    const h = world.height(PX + x, PZ + z); if (h > gMax) gMax = h; if (h < gMin) gMin = h;
  }
  // The landmark flat is only 85%, so the "flat" core still rolls ±2. Sit the
  // terrace just above the core height (not the highest corner, or the grand
  // stair would start seven units up in the air) and let the plinth bed into
  // the rise on the north-west side.
  let cellMax = -99;
  for (let x = CELL.x0; x <= CELL.x1; x += 0.75) for (let z = CELL.z0; z <= CELL.z1; z += 0.75) cellMax = Math.max(cellMax, world.height(PX + x, PZ + z));
  const GY = world.height(PX, PZ) + 0.3;
  const CF = Math.max(cellMax + 0.15, GY + 0.25);        // cellar floor
  const TER = Math.max(GY + 3.8, CF + 2.55 + SLAB);      // terrace / throne-room floor
  const CEIL = TER - SLAB;                               // cellar ceiling

  const rnd = rng(hash('escape:palace'));

  // ── materials ──────────────────────────────────────────────────────────────
  const mats = createMaterials();
  mats.brick = new THREE.MeshStandardMaterial({ map: makeBrickTexture(), vertexColors: true, roughness: 0.82, metalness: 0 });
  mats.glass = new THREE.MeshStandardMaterial({ color: 0xdff6ff, roughness: 0.08, metalness: 0.02, transparent: true, opacity: 0.42, emissive: 0x9fe4ff, emissiveIntensity: 0.05, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true });   // flat panes: one pass (A/B 0 px)
  mats.stainA = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, emissive: 0xff4a86, emissiveIntensity: 0.06 });
  mats.stainB = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, emissive: 0x54d6ff, emissiveIntensity: 0.06 });
  const atlas = makeSignAtlas(signEntries());
  mats.sign = new THREE.MeshStandardMaterial({
    map: atlas.tex, emissiveMap: atlas.tex, emissive: 0xffffff, emissiveIntensity: 0,
    roughness: 0.7, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });

  // cover materials: clones, so their opacity can be driven independently
  const COVER_KEYS = ['brick', 'icing', 'matte', 'matteFlat', 'gloss', 'licorice', 'stripe', 'waffle', 'glass', 'stainA', 'stainB', 'haloDisc', 'glowWarm', 'sign'];
  const coverMats = {}; for (const k of COVER_KEYS) coverMats[k] = mats[k].clone();
  const roofMats = {}; for (const k of COVER_KEYS) roofMats[k] = mats[k].clone();
  const ceilMats = { icing: mats.icing.clone() };
  const cellMats = { brick: mats.brick.clone(), icing: mats.icing.clone() };
  const matSets = [mats, coverMats, roofMats, ceilMats, cellMats];

  const B = createBuilder(mats, atlas.uv);                // the palace itself
  const U = createBuilder(coverMats, atlas.uv);           // the keep's tier-1 SHELL
  const R = createBuilder(roofMats, atlas.uv);            // the cake above it + dome
  const S = createBuilder(ceilMats, atlas.uv);            // the throne room's lid
  const K = createBuilder(cellMats, atlas.uv);            // the cellar ceiling slab

  // ── local helpers ──────────────────────────────────────────────────────────
  const at = (x, y, z) => [PX + x, y, PZ + z];
  const interactables = [];
  const lights = [];
  const cols = { always: [], terrace: [], cellar: [] };
  /** Oriented box collider (contract) + inscribed circles so the player is solid
   *  against it even on a build that only understands circles.
   *  `h` is an ABSOLUTE world height, not a wall height: player.js drops a
   *  collider as soon as the feet are above it (that is how you jump a fence),
   *  so a palace wall 9.6 tall standing on a terrace at y=13 must publish 22.6.
   *  Passing the local height here is the silent way to build a palace you can
   *  walk straight through. */
  function wall(list, x, z, w, d, rotY = 0, h = 1e5) {
    const c = { x: PX + x, z: PZ + z, w, d, rot: rotY, h, box: true };
    list.push(c); ctx.colliders.push(c);
    // circle spacing: the gap between two circles of radius r spaced s apart is
    // sealed for a 0.36-radius player while s/2 < r + 0.36, so r*2.2 is safe and
    // costs a third fewer entries in the global collider list.
    const r = Math.min(w, d) * 0.5, n = Math.max(1, Math.round((Math.max(w, d) - 2 * r) / (r * 2.2)) + 1);
    const along = w >= d ? 1 : 0, len = Math.max(w, d) - 2 * r;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : -len / 2 + (len * i) / (n - 1);
      const dx = along ? t : 0, dz = along ? 0 : t;
      const cx = PX + x + dx * Math.cos(rotY) + dz * Math.sin(rotY);
      const cz = PZ + z - dx * Math.sin(rotY) + dz * Math.cos(rotY);
      const cc = { x: cx, z: cz, r, h };
      list.push(cc); ctx.colliders.push(cc);
    }
  }
  function post(list, x, z, r, h = 1e5) { const c = { x: PX + x, z: PZ + z, r, h }; list.push(c); ctx.colliders.push(c); }

  /** Gingerbread brick box: UVs scaled so the icing courses keep a world size. */
  function brickBox(bb, w, h, d, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const sx = Math.max(w, d) / BRICK_UNIT, sy = Math.max(h, 0.2) / BRICK_UNIT;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
    return bb.add('brick', g, o);
  }
  function brickCyl(bb, rt, rb, h, seg, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open);
    const uv = g.attributes.uv;
    const sx = (2 * Math.PI * Math.max(rt, rb)) / BRICK_UNIT, sy = h / BRICK_UNIT;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
    return bb.add('brick', g, o);
  }

  // ═══════════════════════════════════════════════════════════ PLINTH ════════
  // Skirt: four battered chocolate-brick walls; the inside is hollow (nothing
  // ever sees it except the cellar, which has its own walls).
  {
    const yb = gMin - 3.0, yt = TER - SLAB;
    for (let s = 0; s < 4; s++) {
      const a = s * Math.PI / 2;
      const nx = Math.round(Math.cos(a)), nz = Math.round(Math.sin(a));
      const cx = nx * (HALF - 1.5), cz = nz * (HALF - 1.5);
      brickBox(B, nx ? 3.0 : HALF * 2, yt - yb, nx ? HALF * 2 : 3.0, { at: at(cx, (yb + yt) / 2, cz), color: C.chocMilk });
    }
    // base course + cornice: the two shadows that make it read as masonry
    for (const [y, over, col] of [[GY + 0.35, 0.9, C.choc], [TER - SLAB - 0.25, 0.75, C.gingerbreadDark]]) {
      for (let s = 0; s < 4; s++) {
        const a = s * Math.PI / 2, nx = Math.round(Math.cos(a)), nz = Math.round(Math.sin(a));
        B.box('matte', nx ? 1.0 : (HALF + over) * 2, 0.7, nx ? (HALF + over) * 2 : 1.0,
          { at: at(nx * (HALF + over * 0.4), y, nz * (HALF + over * 0.4)), color: col });
      }
    }
    // ── relief ────────────────────────────────────────────────────────────
    // From the path below, each plinth face is 27 × 3.5 units of unbroken
    // gingerbread, which is the one thing a candy palace must never look like.
    // So: chocolate pilasters, a blind arcade of arched niches between them,
    // rock-candy panes that light up at night, and a run of icing drips under
    // the cornice.
    {
      const y0 = GY + 0.8, y1 = TER - SLAB - 0.55, faceH = Math.max(1.2, y1 - y0), midY = (y0 + y1) / 2;
      for (let s = 0; s < 4; s++) {
        const a = s * Math.PI / 2;
        const nX = Math.round(Math.cos(a)), nZ = Math.round(Math.sin(a));
        const tX = -nZ, tZ = nX;                       // tangent along the face
        const ry = Math.atan2(nX, nZ);
        const east = nX > 0;                           // the grand stair lands here
        const put = (u, out) => [nX * (HALF + out) + tX * u, nZ * (HALF + out) + tZ * u];
        for (let i = -2; i <= 2; i++) {                // pilasters
          const u = i * 5.4;
          if (east && Math.abs(u) < 5.2) continue;
          const [px, pz] = put(u, -0.15);
          const [cx, cz] = put(u, 0.12);
          B.box('matte', 1.5, faceH + 1.1, 1.1, { at: at(px, midY + 0.2, pz), rot: [0, ry, 0], color: C.choc });
          B.box('icing', 1.7, 0.3, 1.3, { at: at(cx, y1 + 0.25, cz), rot: [0, ry, 0], color: C.icing });
          B.sph('gloss', 0.62, 9, 7, { at: at(cx, y1 + 0.75, cz), color: SPRINKLE[(s * 2 + i + 6) % SPRINKLE.length] });
        }
        for (let i = -2; i <= 1; i++) {                // blind arcade between them
          const u = i * 5.4 + 2.7;
          if (east && Math.abs(u) < 5.4) continue;
          const [rx, rz] = put(u, -0.35);
          const [fx, fz] = put(u, 0.02);
          B.box('licorice', 3.2, faceH * 0.72, 0.7, { at: at(rx, midY - 0.25, rz), rot: [0, ry, 0], color: 0x3a2a1e });
          B.box('stainA', 1.7, faceH * 0.42, 0.34, { at: at(fx, midY - 0.1, fz), rot: [0, ry, 0], color: (s + i) % 2 ? 0xff7aa8 : 0x7ad4ff });
          B.sph('icing', 1.75, 12, 7, { at: at(fx, midY + faceH * 0.36 - 0.25, fz), scale: [1, 0.46, 0.2], rot: [0, ry, 0], color: C.icing });
          B.box('icing', 3.4, 0.24, 0.4, { at: at(fx, midY - faceH * 0.36 - 0.25, fz), rot: [0, ry, 0], color: C.cream });
        }
        // icing running off the cornice, the length of the face.
        // NB: icingDrip/lamppost/bench take WORLD coordinates — at() is only for
        // the builder calls.
        icingDrip(B, PX + nX * (HALF + 0.7), y1 + 0.6, PZ + nZ * (HALF + 0.7), ry + Math.PI / 2, HALF * 2 - 1.5, { r: 0.28, drop: 0.5, color: C.icing });
      }
    }

    // terrace slab, split around the stairwell hole; the piece over the cellar
    // is built by K so it can fade when you are down there.
    const slabY = TER - SLAB / 2;
    const pieces = [
      [-HALF, HALF, -HALF, CELL.z0], [-HALF, CELL.x0, CELL.z0, CELL.z1], [CELL.x1, HALF, CELL.z0, CELL.z1],
      [-HALF, STAIR.x0, STAIR.z0, STAIR.z1], [STAIR.x1, HALF, STAIR.z0, STAIR.z1],
      [-HALF, HALF, STAIR.z1, HALF],
      [-HALF, HALF, CELL.z1, STAIR.z0],
    ];
    // The whole terrace deck lives in K: when the player is in the cellar the
    // deck above him fades to 15%, which is the only way an isometric camera
    // can look into a sunken room.
    pieces.push([CELL.x0, CELL.x1, CELL.z0, CELL.z1]);
    for (const [x0, x1, z0, z1] of pieces) {
      if (x1 - x0 < 0.01 || z1 - z0 < 0.01) continue;
      brickBox(K, x1 - x0, SLAB, z1 - z0, { at: at((x0 + x1) / 2, slabY, (z0 + z1) / 2), color: C.gingerbread });
      // icing pavement on top of each piece (never over the stairwell void)
      K.box('icing', Math.max(0.2, x1 - x0 - 0.5), 0.1, Math.max(0.2, z1 - z0 - 0.5), { at: at((x0 + x1) / 2, TER + 0.02, (z0 + z1) / 2), color: C.icingLemon });
    }
    // Solid chocolate fill inside the skirt, cut around the cellar and the
    // stairwell. Without it, fading the deck exposes a hollow shell.
    const IN = HALF - 3;
    const fill = [
      [-IN, CELL.x0, -IN, CELL.z1], [CELL.x1, IN, -IN, CELL.z1],
      [-IN, STAIR.x0, CELL.z1, STAIR.z1], [STAIR.x1, IN, CELL.z1, STAIR.z1],
      [-IN, IN, STAIR.z1, IN],
    ];
    for (const [x0, x1, z0, z1] of fill) {
      if (x1 - x0 < 0.05 || z1 - z0 < 0.05) continue;
      B.box('matte', x1 - x0, TER - SLAB - yb, z1 - z0, { at: at((x0 + x1) / 2, (yb + TER - SLAB) / 2, (z0 + z1) / 2), color: C.choc });
    }

    // plinth colliders — gap on the east face for the grand stair. They stand
    // just proud of the terrace lip, so they are also its parapet.
    const PT = TER + 0.6;
    wall(cols.always, 0, -HALF + 0.5, HALF * 2, 1.2, 0, PT);
    wall(cols.always, 0, HALF - 0.5, HALF * 2, 1.2, 0, PT);
    wall(cols.always, -HALF + 0.5, 0, 1.2, HALF * 2, 0, PT);
    wall(cols.always, HALF - 0.5, -8.6, 1.2, 9.8, 0, PT);
    wall(cols.always, HALF - 0.5, 8.6, 1.2, 9.8, 0, PT);
  }

  // ═════════════════════════════════════════════════════ GRAND STAIR ═════════
  // Royal icing, east face, landing straight onto the candy_palace path.
  const STEPS = 12, SX0 = HALF, SX1 = HALF + 11.5, SHW = 3.6;
  const SY = world.height(PX + SX1, PZ) + 0.1;    // where the stair meets the ground
  const PLZ = world.height(PX + SX1 + 3.4, PZ) + 0.22;
  {
    const run = SX1 - SX0;
    for (let i = 0; i < STEPS; i++) {
      const t = i / STEPS, t1 = (i + 1) / STEPS;
      const x = SX1 - run * t1, w = run / STEPS;
      const yTop = SY + (TER - SY) * t1;
      const thick = 0.5 + (TER - SY) / STEPS;
      B.box('icing', w + 0.02, thick, SHW * 2 + (1 - t) * 1.6, { at: at(x + w / 2, yTop - thick / 2, 0), color: i % 2 ? C.icing : C.cream });
      B.box('gloss', w * 0.96, 0.09, SHW * 2 + (1 - t) * 1.6, { at: at(x + w / 2, yTop + 0.04, 0), color: C.icingPink });
    }
    // balustrades: candy-cane newels, gumdrop caps, an icing rail
    for (const s of [-1, 1]) {
      const zz = s * (SHW + 0.75);
      for (let i = 0; i <= 4; i++) {
        const t = i / 4, x = SX1 - run * t, y = SY + (TER - SY) * t;
        B.stripeCyl(0.3, 0.34, 2.2, { at: at(x, y + 1.1, zz + s * (1 - t) * 0.5), variant: 0, seg: 9 });
        B.sph('gloss', 0.42, 9, 7, { at: at(x, y + 2.3, zz + s * (1 - t) * 0.5), color: SPRINKLE[i % SPRINKLE.length] });
      }
      const L = Math.hypot(run, TER - SY);
      B.box('icing', L, 0.26, 0.4, { at: at((SX0 + SX1) / 2, (SY + TER) / 2 + 1.8, zz + s * 0.25), rot: [0, 0, Math.atan2(TER - SY, run)], color: C.cream });
      wall(cols.always, (SX0 + SX1) / 2, zz + s * 0.3, run, 0.7, 0, TER + 1.6);
    }
    // approach plaza + two candy-cane obelisks at the foot
    B.box('matte', 7.4, 2.2, 9.8, { at: at(SX1 + 3.4, PLZ - 1.1, 0), color: C.licoriceSoft });
    // lamps: the palace has no PointLights outdoors (island budget), so the
    // night read comes from emissive gumdrop lanterns + their additive pools
    for (const s of [-1, 1]) {
      lamppost(B, PX + SX1 + 5.4, PLZ, PZ + s * 4.4, { h: 4.0, variant: 0 });
      post(cols.always, SX1 + 5.4, s * 4.4, 0.55);
    }
    for (const [lx, lz] of [[WALL_R - 1.6, -6.2], [WALL_R - 1.6, 6.2], [-WALL_R + 1.6, -6.2], [-WALL_R + 1.6, 6.2], [0, WALL_R - 1.6], [0, -WALL_R + 1.6]]) {
      lamppost(B, PX + lx, TER, PZ + lz, { h: 3.6, variant: 2 });
      post(cols.terrace, lx, lz, 0.55);
    }
    for (const s of [-1, 1]) {
      B.stripeCyl(0.5, 0.66, 5.4, { at: at(SX1 + 1.6, PLZ + 2.7, s * 4.2), variant: 2, seg: 10 });
      B.sph('gloss', 0.8, 10, 8, { at: at(SX1 + 1.6, PLZ + 5.7, s * 4.2), color: s > 0 ? C.purple : C.teal });
      post(cols.always, SX1 + 1.6, s * 4.2, 0.8);
    }
  }

  // ═══════════════════════════════════════════════════ CURTAIN WALL ══════════
  const GATE_HW = 2.8;   // half-width of the gate opening (east face)
  {
    const H = 4.6, T = 1.3, yc = TER + H / 2;
    const runs = [
      [0, -WALL_R, WALL_R * 2 + T, T],            // north
      [0, WALL_R, WALL_R * 2 + T, T],             // south
      [-WALL_R, 0, T, WALL_R * 2 - T],            // west
      [WALL_R, -(WALL_R + GATE_HW) / 2, T, WALL_R - GATE_HW],   // east, north of the gate
      [WALL_R, (WALL_R + GATE_HW) / 2, T, WALL_R - GATE_HW],    // east, south of the gate
    ];
    for (const [x, z, w, d] of runs) {
      brickBox(B, w, H, d, { at: at(x, yc, z), color: C.gingerbread });
      B.box('icing', w + 0.2, 0.34, d + 0.2, { at: at(x, TER + H + 0.1, z), color: C.icing });
      wall(cols.terrace, x, z, w, d, 0, TER + H);
    }
    // gumdrop battlements
    const merlon = (x, z) => {
      const c = SPRINKLE[(Math.abs(Math.round(x * 3 + z * 7)) % SPRINKLE.length)];
      B.box('matte', 0.9, 0.8, 0.9, { at: at(x, TER + H + 0.6, z), color: C.icing });
      B.sph('gloss', 0.55, 8, 7, { at: at(x, TER + H + 1.25, z), scale: [1, 0.9, 1], color: c });
    };
    for (let i = -8; i <= 8; i++) {
      const t = (i / 8) * WALL_R;
      merlon(t, -WALL_R); merlon(t, WALL_R);
      if (Math.abs(t) < WALL_R - 0.6) { merlon(-WALL_R, t); if (Math.abs(t) > GATE_HW + 0.7) merlon(WALL_R, t); }
    }
  }

  // ═══════════════════════════════════════════════════════ TURRETS ═══════════
  const turretTops = [];
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? 1 : -1, sz = i % 2 ? 1 : -1;
    const x = sx * WALL_R, z = sz * WALL_R, R = 2.6, H = 11.2;
    brickCyl(B, R * 0.92, R, H, 14, { at: at(x, TER + H / 2, z), color: C.gingerbreadLight });
    // lollipop swirl: three stripe tori winding up the drum
    for (let k = 0; k < 7; k++) {
      B.stripeTor(R * 1.02, 0.3, 5, 18, { at: at(x, TER + 0.9 + k * 1.5, z), rot: [Math.PI / 2, k * 0.5, 0], variant: k % 2 ? 2 : 0 });
    }
    B.box('icing', R * 2.5, 0.4, R * 2.5, { at: at(x, TER + H + 0.2, z), color: C.icing });
    icingDrip(B, PX + x, TER + H + 0.1, PZ + z, 0, R * 2.3, { r: 0.26, drop: 0.4, color: C.icingPink });
    B.waffleCone(R * 1.45, 4.6, 14, { at: at(x, TER + H + 2.6, z), color: C.wafer });
    B.sph('gloss', 0.5, 9, 7, { at: at(x, TER + H + 5.0, z), color: C.red });
    // pennant
    B.cyl('licorice', 0.07, 0.07, 2.4, 5, { at: at(x, TER + H + 6.2, z), color: C.licorice });
    B.plane('matte', 1.5, 0.9, { at: at(x + 0.75, TER + H + 6.9, z), rot: [0, Math.PI / 2, 0], color: SPRINKLE[i] });
    turretTops.push({ x, z, y: TER + H + 5.4 });
    post(cols.terrace, x, z, R + 0.3);
    // one warm PointLight per pair of turrets is plenty; emissive does the rest
    B.sph('glowWarm', 0.42, 9, 7, { at: at(x + (sx * -1) * (R + 0.25), TER + 4.2, z), color: C.lampAmber });
    softGlow(B, PX + x + (sx * -1) * (R + 0.25), TER + 4.2, PZ + z, 2.6);
  }

  // ═════════════════════════════════════════════════════ GATEHOUSE ═══════════
  const gateY = TER, gateH = 5.2;
  {
    const x = WALL_R;
    // arch shoulders + lintel
    for (const s of [-1, 1]) brickBox(B, 2.2, gateH + 1.4, 1.2, { at: at(x, gateY + (gateH + 1.4) / 2, s * (GATE_HW + 1.1)), color: C.gingerbreadDark });
    brickBox(B, 2.2, 1.6, GATE_HW * 2 + 2.2, { at: at(x, gateY + gateH + 0.8, 0), color: C.gingerbreadDark });
    for (let i = -3; i <= 3; i++) B.sph('gloss', 0.34, 8, 6, { at: at(x + 1.15, gateY + gateH + 0.8, i * 0.8), color: SPRINKLE[(i + 3) % SPRINKLE.length] });
    // candy-cane gateposts
    for (const s of [-1, 1]) {
      B.stripeCyl(0.42, 0.5, gateH + 2.6, { at: at(x + 0.55, gateY + (gateH + 2.6) / 2, s * (GATE_HW + 1.5)), variant: 0, seg: 10 });
      B.sph('gloss', 0.62, 10, 8, { at: at(x + 0.55, gateY + gateH + 3.0, s * (GATE_HW + 1.5)), color: C.yellow });
      post(cols.terrace, x + 0.55, s * (GATE_HW + 1.5), 0.62);
    }
    B.signQuad('palace_main', 7.6, 2.85, { at: at(x + 1.12, gateY + gateH + 0.85, 0), rot: [0, Math.PI / 2, 0] });
  }

  // ═══════════════════════════════════════════════════════ THE KEEP ═════════
  const KY = TER, T1 = 9.6;                       // tier-1 height
  const doorHalf = 1.45;
  {
    const N = 22, rMid = (KEEP_R + KEEP_IN) / 2, segW = (2 * Math.PI * rMid) / N + 0.16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const aw = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(aw) < 0.19) continue;          // east doorway
      const x = Math.cos(a) * rMid, z = Math.sin(a) * rMid;
      // tier 1 is built by U (the cover): it fades with the roof, so the camera
      // can see the throne room from outside instead of clipping through a wall.
      brickBox(U, KEEP_R - KEEP_IN, T1, segW, { at: at(x, KY + T1 / 2, z), rot: [0, -a, 0], color: i % 3 ? C.gingerbread : C.gingerbreadLight });
      wall(cols.terrace, x, z, KEEP_R - KEEP_IN, segW, -a, KY + T1);
    }
    // doorway frame
    for (const s of [-1, 1]) brickBox(U, KEEP_R - KEEP_IN, T1, 1.0, { at: at(rMid, KY + T1 / 2, s * (doorHalf + 0.5)), color: C.gingerbreadDark });
    brickBox(U, KEEP_R - KEEP_IN + 0.4, 1.5, doorHalf * 2 + 2.0, { at: at(rMid, KY + 4.6, 0), color: C.gingerbreadDark });
    U.sph('icing', doorHalf + 0.9, 12, 7, { at: at(rMid + 0.2, KY + 5.35, 0), scale: [0.24, 0.62, 1], color: C.icing });
    // steps up to the door + a porch canopy on candy-cane posts
    for (let i = 0; i < 2; i++) B.box('icing', 1.1, 0.22, doorHalf * 2 + 2.2, { at: at(KEEP_R + 0.6 + i * 1.0, KY + 0.11 - i * 0.02, 0), color: C.cream });
    for (const s of [-1, 1]) {
      B.stripeCyl(0.22, 0.26, 4.2, { at: at(KEEP_R + 1.7, KY + 2.1, s * (doorHalf + 0.9)), variant: 1, seg: 8 });
      B.sph('gloss', 0.3, 8, 6, { at: at(KEEP_R + 1.7, KY + 4.3, s * (doorHalf + 0.9)), color: C.green });
    }
    B.box('waffle', 2.6, 0.24, doorHalf * 2 + 2.6, { at: at(KEEP_R + 1.2, KY + 4.45, 0), color: C.waferPale });
    icingDrip(B, PX + KEEP_R + 1.2, KY + 4.4, PZ + 0, Math.PI / 2, doorHalf * 2 + 2.4, { r: 0.2, drop: 0.3 });

    // ── tier-1 outside: buttresses, stained rock-candy windows, drips
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * (KEEP_R + 0.1), z = Math.sin(a) * (KEEP_R + 0.1);
      U.stripeCyl(0.34, 0.44, T1 * 0.86, { at: at(x, KY + T1 * 0.43, z), variant: 3, seg: 8 });
      U.sph('gloss', 0.5, 8, 7, { at: at(x, KY + T1 * 0.86 + 0.3, z), color: C.caramel });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.52;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.5) continue;
      // stainedWindow() is module scope and cannot see at() — it takes WORLD
      // coords. Passing the palace-local ones built twenty windows at (0,y,0),
      // out over the channel between the islands.
      stainedWindow(U, PX + Math.cos(a) * (KEEP_R - 0.3), KY + 5.9, PZ + Math.sin(a) * (KEEP_R - 0.3), -a + Math.PI / 2, 2.3, 3.8, i % 2 ? 'stainA' : 'stainB', true);
    }
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      U.sph('icing', 0.44, 7, 5, { at: at(Math.cos(a) * (KEEP_R + 0.12), KY + T1 - 0.35 - 0.3 * (i % 3), Math.sin(a) * (KEEP_R + 0.12)), scale: [1, 1.9 + (i % 3) * 0.7, 1], color: C.icing });
    }
  }

  // ── the cake above the throne room (cover builder: fades when you are in) ──
  const tiers = [
    { r: 6.6, y0: KY + T1 - 0.5, h: 7.2, col: C.icingPink, body: 0xffd0e2 },
    { r: 4.7, y0: KY + T1 + 6.3, h: 5.8, col: C.icingMint, body: 0xd6f5e6 },
    { r: 3.3, y0: KY + T1 + 11.7, h: 3.6, col: C.icingLemon, body: 0xfff0bc },
  ];
  {
    // The tier-1 ceiling (the throne room's lid) + a frosting shelf. It gets a
    // builder of its own because it needs a THIRD behaviour: while you are
    // inside it fades to nothing but stays `visible`, so it keeps casting into
    // the shadow map. That shadow is the whole reason the room reads as indoors
    // — and at 15% opacity the disc, seen edge-on six units from the lens,
    // stacked into a solid slab across the middle of the frame instead.
    S.cyl('icing', KEEP_R + 0.3, KEEP_R + 0.3, 0.7, 22, { at: at(0, KY + T1 + 0.35, 0), color: C.icing });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      S.sph('icing', 0.5, 7, 5, { at: at(Math.cos(a) * (KEEP_R + 0.28), KY + T1 + 0.3, Math.sin(a) * (KEEP_R + 0.28)), scale: [1, 2.2, 1], color: C.icing });
    }
    let prevTop = KY + T1 + 0.7;
    for (const [ti, t] of tiers.entries()) {
      // sponge, NOT gingerbread: the brick map multiplied these pastel bodies
      // into mud and the whole keep read as a brick tower with icing on it.
      R.cyl('matte', t.r * 0.97, t.r, t.h, 20, { at: at(0, t.y0 + t.h / 2, 0), color: t.body });
      for (let j = 0; j < 2; j++) {                    // jam layers
        R.cyl('gloss', t.r * 0.985 - j * 0.01, t.r * 1.005, 0.34, 20, { at: at(0, t.y0 + t.h * (0.34 + j * 0.33), 0), color: j ? 0xd8407a : 0x8a4fd0 });
      }
      R.cyl('icing', t.r + 0.45, t.r + 0.45, 0.55, 20, { at: at(0, t.y0 + t.h + 0.2, 0), color: t.col });
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        R.sph('icing', 0.42, 7, 5, { at: at(Math.cos(a) * (t.r + 0.42), t.y0 + t.h + 0.1, Math.sin(a) * (t.r + 0.42)), scale: [1, 2.0 + (i % 3) * 0.6, 1], color: t.col });
      }
      // stained windows + candy-cane ribs
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + ti * 0.4;
        stainedWindow(R, PX + Math.cos(a) * (t.r - 0.22), t.y0 + t.h * 0.52, PZ + Math.sin(a) * (t.r - 0.22), -a + Math.PI / 2, 1.6, 2.5, i % 2 ? 'stainB' : 'stainA', true);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        R.stripeCyl(0.2, 0.24, t.h * 0.9, { at: at(Math.cos(a) * (t.r + 0.1), t.y0 + t.h * 0.45, Math.sin(a) * (t.r + 0.1)), variant: ti % 2 ? 0 : 2, seg: 6 });
      }
      prevTop = t.y0 + t.h;
    }
    // sugar-glass dome + rock-candy finial
    const dy = prevTop + 0.6;
    R.sph('glass', 3.4, 18, 10, { at: at(0, dy, 0), thetaLen: Math.PI / 2 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      R.tor('gloss', 3.42, 0.1, 5, 14, { at: at(0, dy, 0), rot: [Math.PI / 2, 0, 0], scale: [1, 1, 1], color: C.icing, arc: Math.PI });
      R.cyl('gloss', 0.09, 0.09, 3.4, 5, { at: at(Math.cos(a) * 1.7, dy + 1.7, Math.sin(a) * 1.7), rot: [0, -a, 0.78], color: C.icing });
    }
    R.cyl('icing', 0.55, 1.1, 0.9, 12, { at: at(0, dy + 3.4, 0), color: C.icing });
    R.stripeCyl(0.22, 0.3, 1.8, { at: at(0, dy + 4.5, 0), variant: 0, seg: 8 });
    R.sph('gloss', 0.85, 12, 9, { at: at(0, dy + 5.6, 0), color: C.red });
    R.cyl('licorice', 0.08, 0.08, 0.9, 5, { at: at(0, dy + 6.3, 0), rot: [0.2, 0, 0.3], color: C.licorice });
    R.sph('icing', 0.3, 8, 6, { at: at(0, dy + 6.35, 0), scale: [1, 0.5, 1], color: C.icing });
  }
  const PEAK = KY + T1 + 11.7 + 3.6 + 0.6 + 5.6;   // world y of the cherry

  // ═════════════════════════════════════════════════════ THRONE ROOM ═════════
  const throneAt = { x: -5.2, z: 0 };
  {
    // runner from the door to the throne (the floor itself is the terrace slab;
    // a full disc here would roof over the stairwell void)
    B.box('matte', KEEP_IN * 1.9, 0.09, 2.4, { at: at(0.6, TER + 0.24, 0), color: C.licoriceRed });
    for (let i = -4; i <= 4; i++) B.box('gloss', 0.5, 0.1, 2.2, { at: at(0.6 + i * 1.5, TER + 0.29, 0), color: C.yellow });
    // the gummy throne
    const tx = throneAt.x, tz = throneAt.z;
    B.box('matte', 2.6, 0.5, 3.2, { at: at(tx - 0.3, TER + 0.3, tz), color: C.chocMilk });
    B.box('icing', 2.9, 0.2, 3.5, { at: at(tx - 0.3, TER + 0.62, tz), color: C.icing });
    B.sph('gloss', 1.25, 12, 9, { at: at(tx, TER + 1.5, tz), scale: [1, 0.75, 1.15], color: C.purple });
    B.sph('gloss', 1.5, 12, 10, { at: at(tx - 1.15, TER + 2.7, tz), scale: [0.55, 1.5, 1.0], color: C.purple });
    for (const s of [-1, 1]) {
      B.cyl('licorice', 0.16, 0.16, 2.0, 7, { at: at(tx + 0.1, TER + 1.85, tz + s * 1.15), rot: [0, 0, 0], color: C.licorice });
      B.sph('gloss', 0.34, 8, 6, { at: at(tx + 1.1, TER + 1.95, tz + s * 1.15), color: SPRINKLE[s > 0 ? 0 : 2] });
      B.stripeCyl(0.16, 0.2, 3.4, { at: at(tx - 1.6, TER + 1.7, tz + s * 1.6), variant: 0, seg: 7 });
      B.sph('gloss', 0.34, 8, 6, { at: at(tx - 1.6, TER + 3.5, tz + s * 1.6), color: C.teal });
    }
    // the gag: the Regent has gone. A sticky puddle, a dropped crown, a note.
    // NB the 'flow' material is depthWrite:false — a 3-unit disc parked 0.75
    // above the floor (which is what this used to be) does not read as a puddle
    // ON the seat, it reads as a magenta polygon hovering over the carpet. So:
    // one small puddle bedded INTO the seat cushion (top = TER+0.72), a drip
    // over the front edge, and the rest of the Regent on the rug where gravity
    // put him.
    B.sph('flow', 1.02, 12, 6, { at: at(tx - 0.2, TER + 0.745, tz), scale: [1, 0.055, 1.08], color: 0xc06fd8 });
    B.sph('flow', 0.26, 8, 6, { at: at(tx + 0.95, TER + 0.46, tz + 0.35), scale: [1, 1.5, 1], color: 0xc06fd8 });
    B.sph('flow', 0.9, 12, 6, { at: at(tx + 1.7, TER + 0.15, tz + 0.55), scale: [1, 0.06, 1.3], color: 0xc06fd8 });
    B.sph('flow', 0.5, 10, 6, { at: at(tx + 2.6, TER + 0.15, tz - 0.7), scale: [1, 0.06, 1.1], color: 0xbc64d0 });
    B.tor('gloss', 0.45, 0.16, 6, 12, { at: at(tx + 2.1, TER + 0.28, tz + 1.4), rot: [1.35, 0.4, 0], color: C.yellow });
    for (let i = 0; i < 6; i++) B.cone('gloss', 0.13, 0.3, 5, { at: at(tx + 2.1 + Math.cos(i) * 0.42, TER + 0.42, tz + 1.4 + Math.sin(i) * 0.42), rot: [1.35, 0.4, 0], color: C.yellow });
    B.signQuad('palace_note', 1.9, 1.3, { at: at(tx - 1.6, TER + 3.0, tz), rot: [0, Math.PI / 2, 0] });
    // WAVE 4 (bridge builder): a little licorice stool by the throne's left arm,
    // where the King's half of the boarding pass waits (see KINGS_HALF below)
    B.cyl('licorice', 0.22, 0.3, 0.86, 8, { at: at(tx + KH_AT.x, TER + 0.43, tz + KH_AT.z), color: C.licorice });
    B.cyl('gloss', 0.42, 0.36, 0.14, 12, { at: at(tx + KH_AT.x, TER + 0.9, tz + KH_AT.z), color: C.yellow });
    B.sph('matte', 0.4, 12, 7, { at: at(tx + KH_AT.x, TER + 1.0, tz + KH_AT.z), scale: [1, 0.34, 1], color: C.licoriceRed });

    // banners on the wall
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.45) continue;
      const x = Math.cos(a) * (KEEP_IN - 0.2), z = Math.sin(a) * (KEEP_IN - 0.2);
      B.box('matte', 0.12, 4.6, 1.5, { at: at(x, TER + 5.4, z), rot: [0, -a, 0], color: [C.red, C.blue, C.green, C.purple][i % 4] });
      B.cone('matte', 1.06, 0.9, 3, { at: at(x, TER + 2.95, z), rot: [Math.PI, -a, 0], scale: [0.72, 1, 1], color: [C.red, C.blue, C.green, C.purple][i % 4] });
      B.cyl('licorice', 0.1, 0.1, 1.9, 6, { at: at(x - Math.cos(a) * 0.12, TER + 7.72, z - Math.sin(a) * 0.12), rot: [Math.PI / 2, -a, 0], color: C.licorice });
    }
    // candy chandelier
    const cy = TER + 7.1;
    B.cyl('licorice', 0.07, 0.07, 2.3, 5, { at: at(0.4, cy + 1.5, 0), color: C.licorice });
    B.tor('gloss', 2.0, 0.18, 6, 20, { at: at(0.4, cy, 0), rot: [Math.PI / 2, 0, 0], color: C.icingPink });
    B.tor('gloss', 1.25, 0.14, 6, 16, { at: at(0.4, cy + 0.55, 0), rot: [Math.PI / 2, 0, 0], color: C.icingLemon });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      B.sph('glowWarm', 0.3, 9, 7, { at: at(0.4 + Math.cos(a) * 2.0, cy - 0.3, Math.sin(a) * 2.0), color: C.lampAmber });
      B.cone('gloss', 0.2, 0.5, 6, { at: at(0.4 + Math.cos(a) * 2.0, cy + 0.22, Math.sin(a) * 2.0), color: SPRINKLE[i % SPRINKLE.length] });
    }
    softGlow(B, PX + 0.4, cy, PZ, 4.4);
    // The chandelier is the only thing lighting this room: the tier-1 ceiling
    // stays in the shadow pass while you are inside (that shadow is what makes
    // an interior read as indoors), so without a real lamp under it the throne
    // room is a dark green box.
    {
      const L = new THREE.PointLight(0xffd6a0, 0, 26, 1.3);
      L.position.set(PX + 0.4, cy - 0.4, PZ);
      L.visible = false; group.add(L);
      lights.push({ light: L, base: 3.6, interior: true });
    }
    // two wall lamps (real PointLights, only alive while you are inside)
    for (const s of [-1, 1]) {
      const lx = 1.6, lz = s * 6.4;
      B.cyl('licorice', 0.12, 0.12, 1.1, 6, { at: at(lx, TER + 3.2, lz), rot: [s * 0.5, 0, 0], color: C.licorice });
      B.sph('glowWarm', 0.46, 10, 8, { at: at(lx, TER + 3.7, lz - s * 0.4), color: C.lampAmber });
      B.sph('icing', 0.3, 8, 6, { at: at(lx, TER + 4.1, lz - s * 0.4), scale: [1, 0.5, 1], color: C.lampHood });
      softGlow(B, PX + lx, TER + 3.7, PZ + lz - s * 0.4, 2.8);
      const L = new THREE.PointLight(0xffc178, 0, 21, 1.35);
      L.position.set(PX + lx, TER + 3.7, PZ + lz - s * 0.4);
      L.visible = false; group.add(L);
      lights.push({ light: L, base: 2.6, interior: true });
    }
    // a rug-side table with a half-eaten fish (a cat has been here)
    B.cyl('waffle', 0.7, 0.6, 0.9, 10, { at: at(3.4, TER + 0.55, -3.6), color: C.waferPale });
    B.sph('gloss', 0.45, 9, 7, { at: at(3.4, TER + 1.15, -3.6), scale: [1.5, 0.5, 0.8], color: 0xe8c8a0 });

    // ── THE FLOOR ITSELF ──────────────────────────────────────────────────
    // Tier 1 stands ON the terrace slab, so the throne room's floor was the
    // same lemon icing as the courtyard outside — and with the shell cut away
    // for the interior camera there was nothing at all to say where the room
    // stopped. A chocolate-and-caramel chequer does both jobs: it draws the
    // room's edge and it takes two fifths of the frame off beige duty.
    // Laid as tiles, not a disc, because the cellar stairwell is a HOLE in this
    // floor (x −3.6…−1.0, z −6.6…−2.1) and a disc would roof it over.
    {
      const T = 1.12, N = 8, R2 = (KEEP_IN - 0.25) * (KEEP_IN - 0.25);
      for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
        const fx = i * T, fz = j * T;
        if (fx * fx + fz * fz > R2) continue;
        if (fx > STAIR.x0 - T * 0.6 && fx < STAIR.x1 + T * 0.6 && fz > STAIR.z0 - T * 0.6 && fz < STAIR.z1 + T * 0.6) continue;
        B.box('gloss', T - 0.05, 0.2, T - 0.05, { at: at(fx, TER + 0.0, fz), color: (i + j) % 2 ? 0x6b4126 : 0xd9b98c });
      }
      // an icing kerb round the room, so the chequer has an edge
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const rr = KEEP_IN - 0.1;
        B.box('icing', 1.3, 0.26, 0.5, { at: at(Math.cos(a) * rr, TER + 0.05, Math.sin(a) * rr), rot: [0, -a, 0], color: i % 2 ? C.icing : C.icingPink });
      }
    }

    // ── FLOOR DRESSING ────────────────────────────────────────────────────
    // Tier 1 is 15 units across and its floor is the terrace's lemon icing: two
    // fifths of every interior frame was bare beige. Everything below sits in
    // the southern half and along the runner, and NOTHING may cross the
    // stairwell void (x −3.6…−1.0, z −6.6…−2.1) or it floats over a hole.
    {
      // THE RUG: plum ground, cream border, a lattice of gold diamonds, fringe.
      const RX = 0.4, RZ = 0.3, RW = 13.2, RD = 4.4;      // z spans −1.9 … 2.5
      B.box('matte', RW, 0.05, RD, { at: at(RX, TER + 0.135, RZ), color: 0x6b2a58 });
      B.box('matte', RW - 0.9, 0.06, RD - 0.9, { at: at(RX, TER + 0.15, RZ), color: 0x8a3a6e });
      for (const s of [-1, 1]) {
        B.box('gloss', RW - 0.4, 0.07, 0.26, { at: at(RX, TER + 0.165, RZ + s * (RD / 2 - 0.55)), color: C.icingLemon });
        B.box('gloss', 0.26, 0.07, RD - 0.4, { at: at(RX + s * (RW / 2 - 0.55), TER + 0.165, RZ), color: C.icingLemon });
        for (let i = 0; i < 14; i++) {                       // fringe
          B.cyl('icing', 0.055, 0.055, 0.55, 4, { at: at(RX + s * (RW / 2 + 0.22), TER + 0.15, RZ - 3.0 + i * 0.46), rot: [Math.PI / 2, 0, 0], color: C.cream });
        }
      }
      for (let i = -4; i <= 4; i++) for (const s of [-1, 1]) {
        B.box('gloss', 0.62, 0.06, 0.62, { at: at(RX + i * 1.42, TER + 0.17, RZ + s * 1.24), rot: [0, Math.PI / 4, 0], color: i % 2 ? C.icingLemon : C.icingPink });
      }

      // CANDLESTICKS: two flanking the throne, two by the door. Tall, thin and
      // GLOWING, which is what stops a wide floor reading as empty.
      for (const [cx2, cz2, h] of [[-3.4, -2.9, 2.9], [-3.4, 2.9, 2.9], [5.4, -2.6, 2.4], [5.4, 2.6, 2.4]]) {
        B.cyl('gloss', 0.42, 0.52, 0.22, 10, { at: at(cx2, TER + 0.14, cz2), color: C.caramel });
        B.cyl('licorice', 0.12, 0.16, h, 8, { at: at(cx2, TER + 0.25 + h / 2, cz2), color: C.licoriceSoft });
        B.tor('gloss', 0.34, 0.08, 5, 10, { at: at(cx2, TER + 0.25 + h * 0.52, cz2), rot: [Math.PI / 2, 0, 0], color: C.caramel });
        B.cyl('icing', 0.19, 0.21, 0.9, 8, { at: at(cx2, TER + h + 0.7, cz2), color: C.cream });
        B.sph('glowWarm', 0.17, 8, 6, { at: at(cx2, TER + h + 1.22, cz2), scale: [1, 1.7, 1], color: C.lampAmber });
        softGlow(B, PX + cx2, TER + h + 1.25, PZ + cz2, 1.7);
      }

      // THE CANDY BUFFET, laid for a coronation nobody came to: a long cloth
      // table, a tiered cake, bowls of gumballs, a punch bowl gone sticky.
      const BZ = 5.3;
      B.box('waffle', 6.2, 0.18, 1.7, { at: at(0.2, TER + 1.02, BZ), color: C.waferPale });
      B.box('matte', 6.4, 0.95, 1.9, { at: at(0.2, TER + 0.5, BZ), color: C.icingPink });
      B.box('gloss', 6.5, 0.16, 2.0, { at: at(0.2, TER + 0.14, BZ), color: C.syrup });
      for (let i = 0; i < 6; i++) B.sph('icing', 0.34, 8, 6, { at: at(-2.6 + i * 1.05, TER + 0.15, BZ - 0.95), scale: [1, 0.55, 0.7], color: C.cream });
      // tiered cake
      for (let i = 0; i < 3; i++) {
        const r = 0.78 - i * 0.2;
        B.cyl('matte', r, r + 0.04, 0.42, 12, { at: at(-1.9, TER + 1.32 + i * 0.46, BZ), color: 0xffe6c0 });
        B.cyl('icing', r + 0.08, r + 0.08, 0.12, 12, { at: at(-1.9, TER + 1.54 + i * 0.46, BZ), color: i % 2 ? C.icingPink : C.icingMint });
      }
      B.sph('gloss', 0.16, 8, 6, { at: at(-1.9, TER + 2.78, BZ), color: C.red });
      // gumball bowls + a lollipop bouquet + the punch
      for (let i = 0; i < 3; i++) {
        const bx = -0.3 + i * 1.15;
        B.cyl('gloss', 0.42, 0.28, 0.34, 10, { at: at(bx, TER + 1.28, BZ), color: C.icing });
        for (let k = 0; k < 5; k++) B.sph('gloss', 0.16, 7, 6, { at: at(bx + Math.cos(k * 1.3) * 0.18, TER + 1.5, BZ + Math.sin(k * 1.3) * 0.18), color: SPRINKLE[(i * 2 + k) % SPRINKLE.length] });
      }
      B.cyl('gloss', 0.5, 0.4, 0.5, 12, { at: at(2.6, TER + 1.36, BZ), color: C.icing });
      B.cyl('flow', 0.44, 0.44, 0.1, 12, { at: at(2.6, TER + 1.6, BZ), color: 0xe0559a });
      B.cyl('waffle', 0.3, 0.34, 0.5, 8, { at: at(1.8, TER + 1.36, BZ - 0.5), color: C.wafer });
      for (let k = 0; k < 4; k++) {
        B.cyl('licorice', 0.04, 0.04, 1.0, 4, { at: at(1.8 + (k - 1.5) * 0.1, TER + 1.9, BZ - 0.5), rot: [0.1 * k, 0, 0.12 * (k - 1.5)], color: C.licorice });
        B.stripeTor(0.24, 0.07, 4, 10, { at: at(1.8 + (k - 1.5) * 0.16, TER + 2.42, BZ - 0.5), rot: [0, 0, 0], variant: k % 2 ? 0 : 2 });
      }

      // THE GUARDS: nothing left of them but helmets, boots and their halberds
      // stacked where they fell out of. (Nobody is guarding anything.)
      for (const s of [-1, 1]) {
        const gx = 4.2, gz = s * 2.0;
        B.sph('gloss', 0.42, 10, 7, { at: at(gx, TER + 0.34, gz), scale: [1, 0.85, 1], thetaLen: Math.PI / 2, color: C.stone });
        B.tor('gloss', 0.44, 0.07, 5, 12, { at: at(gx, TER + 0.3, gz), rot: [Math.PI / 2, 0, 0], color: C.stoneDark });
        B.cone('gloss', 0.11, 0.5, 6, { at: at(gx, TER + 0.92, gz), color: s > 0 ? C.red : C.blue });   // plume spike
        for (let i = 0; i < 5; i++) B.sph('matte', 0.1, 6, 5, { at: at(gx, TER + 0.95 + i * 0.1, gz), scale: [1.5, 1, 1.5], color: s > 0 ? C.red : C.pink });
        // the boots, still standing, toes out
        for (const t of [-1, 1]) B.box('licorice', 0.3, 0.34, 0.5, { at: at(gx + 0.75, TER + 0.17, gz + t * 0.22), rot: [0, t * 0.25, 0], color: C.licorice });
        // halberd leaning on the wall behind them
        B.cyl('licorice', 0.07, 0.07, 3.4, 6, { at: at(gx + 1.5, TER + 1.6, gz + s * 0.5), rot: [s * 0.16, 0, -0.2], color: C.licoriceSoft });
        B.cone('gloss', 0.2, 0.6, 5, { at: at(gx + 1.16, TER + 3.3, gz + s * 0.78), rot: [s * 0.16, 0, -0.2], color: C.stone });
        // and a sugar puddle where the guard used to be
        B.sph('flow', 0.52, 10, 6, { at: at(gx + 0.1, TER + 0.14, gz - 0.55), scale: [1, 0.06, 1], color: 0xd8a8ec });
      }

      // a dropped tray, a rolled gumball and a cat's pawprints leading out:
      // the last five seconds before everybody left in a hurry
      B.cyl('gloss', 0.6, 0.6, 0.06, 12, { at: at(2.2, TER + 0.16, -4.2), rot: [0.2, 0.3, 0.5], color: C.stone });
      for (let i = 0; i < 4; i++) B.sph('gloss', 0.18, 7, 6, { at: at(2.9 + i * 0.55, TER + 0.25, -4.0 + Math.sin(i * 2.1) * 0.5), color: SPRINKLE[(i + 3) % SPRINKLE.length] });
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        for (const s of [-1, 1]) B.ico('matte', 0.09, 0, { at: at(1.2 + t * 5.6, TER + 0.15, 3.4 - t * 1.2 + s * 0.3), scale: [1, 0.25, 1.4], color: 0xc9a8d8 });
      }
    }
  }

  // ═══════════════════════════════════════════════ STAIRWELL + CELLAR ════════
  const CELL_MID = { x: (CELL.x0 + CELL.x1) / 2, z: (CELL.z0 + CELL.z1) / 2 };
  const caveDoorAt = { x: -3.2, z: CELL.z0 };
  {
    // stair down (north edge of the throne room)
    const n = 8, run = STAIR.z1 - STAIR.z0;
    for (let i = 0; i < n; i++) {
      const t = i / n, t1 = (i + 1) / n;
      const z = STAIR.z1 - run * t1, y = TER - (TER - CF) * t1;
      B.box('matte', STAIR.x1 - STAIR.x0, 0.7, run / n + 0.02, { at: at((STAIR.x0 + STAIR.x1) / 2, y + 0.35, z + run / n / 2), color: i % 2 ? C.choc : C.chocGlaze });
      B.box('gloss', (STAIR.x1 - STAIR.x0) * 0.9, 0.07, run / n * 0.85, { at: at((STAIR.x0 + STAIR.x1) / 2, y + 0.72, z + run / n / 2), color: C.icing });
    }
    // stairwell kerbs (always solid: they are also the throne-room hole's rim)
    for (const s of [-1, 1]) {
      const x = s < 0 ? STAIR.x0 - 0.25 : STAIR.x1 + 0.25;
      B.box('icing', 0.5, 0.8, run + 0.6, { at: at(x, TER + 0.3, (STAIR.z0 + STAIR.z1) / 2), color: C.icing });
      for (let i = 0; i <= 3; i++) B.sph('gloss', 0.28, 8, 6, { at: at(x, TER + 0.78, STAIR.z1 - (run / 3) * i), color: SPRINKLE[i % 6] });
      wall(cols.always, x, (STAIR.z0 + STAIR.z1) / 2, 0.5, run + 0.6, 0, TER + 1.1);
    }
    B.signQuad('palace_cellar', 2.0, 1.35, { at: at(STAIR.x1 + 0.55, TER + 1.7, (STAIR.z0 + STAIR.z1) / 2), rot: [0, Math.PI / 2, 0] });

    // ── the cellar room: chocolate walls, syrup drips, sprinkle casks ────────
    const wx0 = CELL.x0, wx1 = CELL.x1, wz0 = CELL.z0, wz1 = CELL.z1;
    B.box('matte', wx1 - wx0 + 1.6, 0.5, wz1 - wz0 + 1.6, { at: at(CELL_MID.x, CF - 0.25, CELL_MID.z), color: C.choc });
    B.box('gloss', wx1 - wx0, 0.08, wz1 - wz0, { at: at(CELL_MID.x, CF + 0.02, CELL_MID.z), color: C.chocGlaze });
    const W = 0.8, WH = CEIL - CF;
    const walls = [
      [CELL_MID.x, wz0 - W / 2, wx1 - wx0 + W * 2, W],
      [wx0 - W / 2, CELL_MID.z, W, wz1 - wz0],
      [wx1 + W / 2, CELL_MID.z, W, wz1 - wz0],
      [(wx0 + STAIR.x0) / 2, wz1 + W / 2, STAIR.x0 - wx0, W],
      [(STAIR.x1 + wx1) / 2, wz1 + W / 2, wx1 - STAIR.x1, W],
    ];
    for (const [x, z, w, d] of walls) {
      if (w <= 0.05) continue;
      B.box('matte', w, WH, d, { at: at(x, CF + WH / 2, z), color: C.choc });
      wall(cols.cellar, x, z, w, d, 0, CEIL);
    }
    // syrup drips from the ceiling + a slow puddle (this is the joke on the sign)
    for (let i = 0; i < 7; i++) {
      const x = wx0 + 1.2 + rnd() * (wx1 - wx0 - 2.4), z = wz0 + 0.9 + rnd() * (wz1 - wz0 - 1.8);
      const L = 0.5 + rnd() * 0.9;
      B.cone('flow', 0.19, L, 6, { at: at(x, CEIL - L / 2, z), rot: [Math.PI, 0, 0], color: 0x8a4a2a });
      B.sph('flow', 0.5 + rnd() * 0.4, 10, 6, { at: at(x, CF + 0.06, z), scale: [1, 0.1, 1], color: 0x7a3f22 });
    }
    // casks of sprinkles + a shelf of jars. They live against the WEST wall in a
    // 2×2 cluster: a row along the stair side (z = wz1 - 1.1) stood their r 0.7
    // colliders straight across the stair landing (x -3.6..-1.0), and once the
    // collision core stopped letting the visitor slip between them the cave door
    // was walled off (Ben, 2026-09-22: "barrels blocking the entry to the cave").
    for (let i = 0; i < 4; i++) {
      const x = wx0 + 1.05 + (i % 2) * 1.35, z = wz0 + 1.15 + Math.floor(i / 2) * 1.4;
      B.cyl('matte', 0.62, 0.7, 1.5, 12, { at: at(x, CF + 0.75, z), color: C.chocMilk });
      for (const y of [0.35, 1.15]) B.tor('licorice', 0.66, 0.08, 5, 12, { at: at(x, CF + y, z), rot: [Math.PI / 2, 0, 0], color: C.licorice });
      B.cyl('gloss', 0.56, 0.56, 0.12, 12, { at: at(x, CF + 1.54, z), color: SPRINKLE[i % 6] });
      post(cols.cellar, x, z, 0.7);
    }
    B.box('waffle', 2.6, 0.16, 0.6, { at: at(wx0 + 2.0, CF + 1.7, wz0 + 0.7), color: C.waferPale });
    for (let i = 0; i < 5; i++) B.cyl('gloss', 0.2, 0.22, 0.5, 8, { at: at(wx0 + 1.0 + i * 0.5, CF + 2.0, wz0 + 0.7), color: SPRINKLE[(i + 2) % 6] });
    // a lantern on a hook + its light
    B.sph('glowWarm', 0.4, 10, 8, { at: at(wx1 - 1.2, CF + 1.9, CELL_MID.z), color: C.lampAmber });
    B.cyl('licorice', 0.05, 0.05, 0.9, 5, { at: at(wx1 - 1.2, CF + 2.5, CELL_MID.z), color: C.licorice });
    softGlow(B, PX + wx1 - 1.2, CF + 1.9, PZ + CELL_MID.z, 3.0);
    lightPool(B, PX + wx1 - 1.2, CF, PZ + CELL_MID.z, 2.4);
    {
      const L = new THREE.PointLight(0xffb46a, 0, 18, 1.35);
      L.position.set(PX + wx1 - 1.2, CF + 1.9, PZ + CELL_MID.z); L.visible = false; group.add(L);
      lights.push({ light: L, base: 2.8, interior: true });
    }
    // the cave door: frame + sign (the leaf itself swings, below)
    B.box('matte', 3.4, 3.0, 0.5, { at: at(caveDoorAt.x, CF + 1.5, wz0 - 0.1), color: C.chocGlaze });
    B.box('icing', 3.8, 0.3, 0.62, { at: at(caveDoorAt.x, CF + 3.05, wz0 - 0.1), color: C.icing });
    B.signQuad('palace_cavedoor', 2.6, 0.95, { at: at(caveDoorAt.x, CF + 3.55, wz0 + 0.1), rot: [0, 0, 0] });
    B.signQuad('palace_drips', 2.2, 1.5, { at: at(wx0 + 0.42, CF + 1.9, CELL_MID.z + 0.4), rot: [0, Math.PI / 2, 0] });
  }

  // ═════════════════════════════════════ moving parts (doors + portcullis) ═══
  const partMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 });
  // keep door: two chocolate leaves with icing panels, hinged at the jambs
  const leaves = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(PX + KEEP_R - 0.55, TER + 0.05, PZ + s * doorHalf);
    const m = makePart([
      { g: new THREE.BoxGeometry(0.28, 3.9, doorHalf), at: [0, 1.95, -s * doorHalf / 2], color: C.choc },
      { g: new THREE.BoxGeometry(0.12, 3.2, doorHalf * 0.62), at: [0.2, 1.95, -s * doorHalf / 2], color: C.icing },
      { g: new THREE.SphereGeometry(0.18, 8, 6), at: [0.24, 1.9, -s * doorHalf * 0.9], color: C.yellow },
    ], partMat);
    g.add(m); group.add(g);
    leaves.push({ g, open: s * 1.25, closed: 0, k: 0 });
  }
  // portcullis: a chocolate lattice that winches up into the gatehouse
  const portG = new THREE.Group();
  portG.position.set(PX + WALL_R, TER, PZ);
  {
    const pieces = [];
    for (let i = -3; i <= 3; i++) pieces.push({ g: new THREE.CylinderGeometry(0.16, 0.16, 5.0, 6), at: [0, 2.5, i * 0.92], color: C.choc });
    for (let i = 0; i < 4; i++) pieces.push({ g: new THREE.BoxGeometry(0.26, 0.26, GATE_HW * 2 + 0.4), at: [0, 0.6 + i * 1.35, 0], color: C.chocMilk });
    for (let i = -3; i <= 3; i++) pieces.push({ g: new THREE.ConeGeometry(0.2, 0.5, 6), at: [0, -0.2, i * 0.92], rot: [Math.PI, 0, 0], color: C.chocGlaze });
    portG.add(makePart(pieces, partMat));
  }
  group.add(portG);
  // cellar cave door leaf
  const caveLeaf = new THREE.Group();
  caveLeaf.position.set(PX + caveDoorAt.x - 1.35, CF, PZ + CELL.z0 - 0.1);
  caveLeaf.add(makePart([
    { g: new THREE.BoxGeometry(2.7, 2.8, 0.22), at: [1.35, 1.4, 0], color: C.chocMilk },
    { g: new THREE.BoxGeometry(2.2, 0.16, 0.3), at: [1.35, 2.2, 0], color: C.icing },
    { g: new THREE.BoxGeometry(2.2, 0.16, 0.3), at: [1.35, 0.7, 0], color: C.icing },
    { g: new THREE.SphereGeometry(0.2, 8, 6), at: [2.4, 1.4, 0.16], color: C.teal },
  ], partMat));
  group.add(caveLeaf);

  // ═══════════════════════════════════════════════════════ bunting ══════════
  const buntList = [];
  for (let i = 0; i < 4; i++) {
    const a = turretTops[i], b = turretTops[(i + 1) % 4];
    const n = 11;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const y = a.y + (b.y - a.y) * t - 2.6 * Math.sin(Math.PI * t) - 0.7;
      buntList.push({ x: PX + x, y, z: PZ + z, w: 0.8, h: 1.0, ry: Math.atan2(b.x - a.x, b.z - a.z), ph: (i * 7 + k) * 0.7, color: SPRINKLE[(i + k) % SPRINKLE.length] });
    }
  }
  let bunting = null;
  if (buntList.length) {
    const bm = new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide });
    bunting = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), bm, buntList.length);
    bunting.name = 'palace_bunting'; bunting.castShadow = false; bunting.receiveShadow = true;
    bunting.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // the matrices are only written by the flutter (update), so the bounds come
    // from the flag anchors + room for the swing: culled like everything else
    {
      const bb = new THREE.Box3(), v = new THREE.Vector3();
      for (const it of buntList) bb.expandByPoint(v.set(it.x, it.y, it.z));
      bunting.boundingSphere = bb.getBoundingSphere(new THREE.Sphere());
      bunting.boundingSphere.radius += 2;
      bunting.frustumCulled = true;
    }
    const col = new THREE.Color();
    buntList.forEach((it, i) => bunting.setColorAt(i, col.set(it.color)));
    group.add(bunting);
  }

  // ═══════════════════════════════════════════════════════ finish ═══════════
  const meshes = B.finish(group);
  const coverMeshes = U.finish(group);
  const roofMeshes = R.finish(group);
  const ceilMeshes = S.finish(group);
  const cellMeshes = K.finish(group);
  for (const set of [meshes, coverMeshes, roofMeshes, ceilMeshes, cellMeshes]) {
    for (const k of ['glass', 'stainA', 'stainB']) if (set[k]) set[k].castShadow = false;
  }
  const coverList = Object.values(coverMeshes);
  const roofList = Object.values(roofMeshes);
  const cellList = Object.values(cellMeshes);

  // ═══════════════════════════════════════════════ walkables + interiors ═════
  const inHole = (x, z) => x > STAIR.x0 && x < STAIR.x1 && z > STAIR.z0 && z < STAIR.z1;
  const inSquare = (x, z) => Math.abs(x) <= HALF && Math.abs(z) <= HALF;
  const inCellar = (x, z) => x > CELL.x0 - 0.1 && x < CELL.x1 + 0.1 && z > CELL.z0 - 0.1 && z < CELL.z1 + 0.1;
  ctx.walkables.push({
    id: 'candyPalace',
    test(x, z) {
      const lx = x - PX, lz = z - PZ;
      if (lx < -HALF - 2 || lx > HALF + 20 || lz < -HALF - 2 || lz > HALF + 2) return null;
      const py = ctx.systems.player?.position?.y;
      // grand stair (outside the plinth, east)
      if (lx >= SX0 && lx <= SX1 + 0.6 && Math.abs(lz) <= SHW + 0.5) {
        return SY + (TER - SY) * clamp((SX1 - lx) / (SX1 - SX0), 0, 1);
      }
      if (lx > SX1 && lx < SX1 + 7.1 && Math.abs(lz) <= 4.9) return PLZ;   // approach plaza
      if (!inSquare(lx, lz)) return null;
      // cellar stair
      if (inHole(lx, lz)) return CF + (TER - CF) * clamp((lz - STAIR.z0) / (STAIR.z1 - STAIR.z0), 0, 1);
      // cellar floor
      if (inCellar(lx, lz) && (py === undefined || py < TER - 1.1)) return CF;
      // terrace / throne room. Gated so it never yanks a player who is on the
      // ground outside or down in the cellar up onto the roof of his own house.
      if (py === undefined) return TER;
      if (py > TER - 2.2) return TER;
      // inside the solid plinth (a teleport landed here) — pop up to the terrace
      if (world.height(x, z) < TER - 1.0 && !inCellar(lx, lz)) return TER;
      return null;
    },
  });

  const interiors = [
    { id: 'palace_throne', x: PX, z: PZ, w: KEEP_R * 2, d: KEEP_R * 2, inside: false, test: (x, z, y) => Math.hypot(x - PX, z - PZ) < KEEP_R - 0.2 && y > TER - 1.2 },
    { id: 'palace_cellar', x: PX + CELL_MID.x, z: PZ + CELL_MID.z, w: CELL.x1 - CELL.x0, d: CELL.z1 - CELL.z0, inside: false, test: (x, z, y) => y < TER - 1.2 && x - PX > CELL.x0 - 0.6 && x - PX < CELL.x1 + 0.6 && z - PZ > CELL.z0 - 0.6 && z - PZ < CELL.z1 + 1.0 },
  ];

  // ═══════════════════════════════════════════════════ interactables ════════
  // ═══════════════════════════════ THE KING'S HALF (WAVE 4, bridge builder) ═══
  // Half a MEOW AIR boarding pass on a stool by the Gummy Throne. The Mayor
  // hands over the other half with the citizenship medal; with both, the flare
  // at the top of the rainbow bridge calls the jet (escape/ending.js).
  // Story flag `pass_candy`. One textured quad (one draw call), hidden once taken.
  const kingsHalf = (() => {
    const wx = PX + throneAt.x + KH_AT.x, wz = PZ + throneAt.z + KH_AT.z, wy = TER + 1.5;
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d');
    const edge = () => { g.beginPath(); g.moveTo(8, 10); g.lineTo(206, 10); for (let k = 0, y = 10; y < 118; y += 12, k++) g.lineTo(k % 2 ? 206 : 220, Math.min(118, y + 6)); g.lineTo(206, 118); g.lineTo(8, 118); g.closePath(); };
    edge(); g.fillStyle = '#2b2442'; g.fill();
    g.save(); g.translate(5, 5); g.scale(0.955, 0.92); edge(); g.restore();
    const gr = g.createLinearGradient(0, 10, 0, 118); gr.addColorStop(0, '#fff1b8'); gr.addColorStop(0.55, '#ffc94a'); gr.addColorStop(1, '#f0a52c');
    g.fillStyle = gr; g.fill();
    g.fillStyle = '#ef4f84'; g.fillRect(14, 20, 184, 16);
    g.fillStyle = '#fff6ec'; g.font = '900 13px "Nunito", sans-serif'; g.textBaseline = 'middle'; g.fillText('BOARDING PASS · HALF', 22, 28.5);
    g.fillStyle = '#2b2442'; g.font = '900 30px "Baloo 2", "Trebuchet MS", sans-serif'; g.fillText('MEOW AIR', 20, 62);
    g.font = '800 17px "Nunito", sans-serif'; g.fillText('SEAT 1A · TO: AWAY', 22, 95);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.45, metalness: 0.05, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const ticket = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), mat);
    ticket.name = 'palace_kings_half';
    ticket.position.set(wx, wy, wz);
    ticket.rotation.set(0, Math.PI / 2, 0.0);
    ticket.rotateX(-0.42);                                            // propped against the pillow, facing the door (+x)
    ticket.castShadow = true;
    group.add(ticket);
    const kh = { x: wx, y: wy, z: wz, ticket, taken: false, entry: null };
    ctx.colliders.push({ x: wx, z: wz, r: 0.42, h: 1.05 });           // the stool (a low prop you can stand on)
    const take = (quiet) => {
      if (kh.taken) return;
      kh.taken = true; ticket.visible = false;
      if (kh.entry) kh.entry.enabled = false;
      if (quiet) return;
      ctx.systems.particles?.burst?.({ x: wx, y: wy, z: wz, count: 26, color: [0xffd84d, 0xffffff, 0xff8fb6], speed: 3.2, life: 1.1, size: 0.22, gravity: -2, spread: 0.8, shape: 'sparkle', blend: 'add' });
      ctx.systems.ui?.toast?.('Got: the King\u2019s half of a boarding pass');
      if (!ctx.systems.story?.get('pass_cat')) ctx.systems.ui?.say?.('Half a boarding pass. MEOW AIR, seat 1A, destination: AWAY. The torn edge has tooth marks. The other half must be somewhere very official.', { speaker: 'The King\u2019s half' });
    };
    kh.take = take;
    interactables.push(kh.entry = {
      id: 'palace_kings_half', x: wx + 1.3, z: wz, r: 1.9,
      label: 'Take the King\u2019s half',
      onInteract(c) { c.systems.story?.set('pass_candy', true); },
    });
    ctx.events.on('story:pass_candy', (v) => { if (v) take(false); });
    return kh;
  })();

  let portOpen = false, doorOpen = false, caveOpen = false;
  const sayLine = (t, speaker) => ctx.systems.ui?.say(t, { speaker, duration: 6 });

  interactables.push({
    id: 'palace_gate', x: PX + WALL_R + 1.3, z: PZ, r: 3.0,
    label: 'Raise the portcullis',
    onInteract(c, self) {
      portOpen = !portOpen;
      self.label = portOpen ? 'Lower the portcullis' : 'Raise the portcullis';
      c.systems.ui?.toast(portOpen ? 'The portcullis winches up, dripping.' : 'The portcullis clatters down.');
      c.systems.particles?.burst({ x: PX + WALL_R, y: TER + 1.2, z: PZ, count: 12, color: [0x8a4a2a, 0xd98b2b], speed: 2.2, life: 0.7, size: 0.18, gravity: -7, spread: 1.4 });
    },
  });
  interactables.push({
    id: 'palace_door', x: PX + KEEP_R + 1.6, z: PZ, r: 3.0,
    label: 'Open door',
    onInteract(c, self) {
      doorOpen = !doorOpen;
      self.label = doorOpen ? 'Close door' : 'Open door';
      if (doorOpen) sayLine('The doors swing in on their own hinges. Inside: a throne, and nobody on it.', 'The Candy Palace');
    },
  });
  interactables.push({
    id: 'palace_throne_sit', x: PX + throneAt.x + 1.8, z: PZ + throneAt.z, r: 2.4,
    label: 'Sit on the Gummy Throne',
    onInteract(c) {
      c.systems.story?.set('sat_on_throne');
      sayLine('You sit. It is warm. It is slightly sticky. Somewhere below, something unbolts a door.', 'The Gummy Throne');
      c.systems.particles?.burst({ x: PX + throneAt.x, y: TER + 2.2, z: PZ + throneAt.z, count: 20, color: [0xb35bff, 0xff6fb0, 0xffffff], speed: 2.4, life: 1.2, size: 0.2, gravity: -2, spread: 1.1, shape: 'sparkle', blend: 'add' });
    },
  });
  interactables.push({
    id: 'palace_sign', x: PX + WALL_R + 3.6, z: PZ + 3.4, r: 3.0,
    label: 'Read the notice',
    onInteract: () => sayLine('THE CANDY PALACE — home of the Gummy Regent (deposed). Below, in smaller icing: "deposed by whom is not your business".', 'Notice'),
  });
  interactables.push({
    id: 'palace_cellar_sign', x: PX + STAIR.x0 - 1.0, z: PZ + (STAIR.z0 + STAIR.z1) / 2, r: 2.6,
    label: 'Read the sign',
    onInteract: () => sayLine('CELLAR: mind the drips. Somebody has added, in chocolate: "and the draught. and the cat."', 'Sign'),
  });

  // the cave door is owned here but driven by the cave route
  const cellarDoor = {
    id: 'palace_cave_door', x: PX + caveDoorAt.x, z: PZ + CELL.z0 + 1.2, r: 2.8,
    label: 'Open the cave door',
    onInteract(c, self) {
      const cave = escape.routes?.cave;
      if (!cave || !escape.enterCave) { sayLine('The door is bolted from the other side. Something is scratching at it.', 'Cellar'); return; }
      caveOpen = true;
      escape.enterCave('palace');
    },
  };
  interactables.push(cellarDoor);

  ctx.events.on('world:ready', () => {
    const I = ctx.systems.interaction;
    if (I?.register) for (const s of interactables) { try { I.register(s); } catch (e) { /* ignore */ } }
  });

  // ═══════════════════════════════════════════════════════ update ═══════════
  let coverK = 1, roofK = 1, ceilK = 1, cellK = 1, insideAny = false, camSave = null;
  /** Ease a cloned material set toward `want` opacity; hide it outright once it
   *  is effectively gone (a 2%-opaque wedding cake still costs a draw call and
   *  still hazes everything behind it). */
  function fadeSet(matSet, meshList, k, want, dt) {
    const nk = damp(k, want, 6, dt);
    if (Math.abs(nk - k) < 0.002) return k;
    for (const key in matSet) {
      const m = matSet[key]; if (!m || !m.isMaterial) continue;
      const glass = key === 'glass';
      const tr = nk < 0.985 || glass;
      // three bakes `transparent` into the program (#define OPAQUE forces alpha
      // to 1): a flip without needsUpdate left the lid and the cellar slab
      // OPAQUE over the room whenever they had been drawn before you walked in
      // (which, once the palace is frustum-culled, depended on where the lens
      // had been at load). Recompile on the flip only.
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = glass ? 0.42 * nk : nk;
      m.depthWrite = nk > 0.6 && !glass;
    }
    for (const mesh of meshList) mesh.visible = nk > 0.02;
    return nk;
  }
  const api = {
    PX, PZ, GY, TER, CF, PEAK, interiors, cellarDoor,
    /** WAVE 4: where the King's half of the boarding pass waits ({x,y,z,taken}). */
    kingsHalf,
    caveDoorPos: { x: PX + caveDoorAt.x, y: CF, z: PZ + CELL.z0 + 1.6 },
    /** Where the cave spits you out (and where you stand to go back). */
    cellarSpawn: { x: PX + CELL_MID.x + 1.6, z: PZ + CELL_MID.z + 0.6 },
    openCaveDoor(v = true) { caveOpen = v; },
    update(dt, c) {
      const t = c.state.elapsed;
      const night = 1 - (c.state.daylight ?? 1);
      // WAVE 4: the King's half glints (a slow gold pulse + a sparkle now and then)
      if (!kingsHalf.taken) {
        kingsHalf.ticket.material.emissiveIntensity = 0.32 + 0.22 * (0.5 + 0.5 * Math.sin(t * 2.6));
        const pp = c.systems.player?.position;
        if (pp && Math.floor(t / 1.7) !== Math.floor((t - dt) / 1.7) && Math.abs(pp.x - kingsHalf.x) < 20 && Math.abs(pp.z - kingsHalf.z) < 20) {
          c.systems.particles?.sparkle?.(kingsHalf.x, kingsHalf.y + 0.35, kingsHalf.z, 0xffe38a);
        }
      }
      for (const m of matSets) {
        if (m.windowWarm) m.windowWarm.emissiveIntensity = 0.04 + night * 1.3;
        if (m.glowWarm) m.glowWarm.emissiveIntensity = 0.12 + night * 1.8;
        if (m.glowSour) m.glowSour.emissiveIntensity = 0.1 + night * 2.0;
        if (m.stainA) m.stainA.emissiveIntensity = 0.05 + night * 1.85;
        if (m.stainB) m.stainB.emissiveIntensity = 0.05 + night * 1.75;
        if (m.glass) m.glass.emissiveIntensity = 0.04 + night * 0.85;
        if (m.haloDisc) { m.haloDisc.emissiveIntensity = night * 0.95; m.haloDisc.opacity = night * 0.8; m.haloDisc.visible = night > 0.04; }
        if (m.sign) m.sign.emissiveIntensity = night * 0.3;
        if (m.flow) m.flow.map.offset.y = (m.flow.map.offset.y - dt * 0.25) % 1;
      }

      const p = c.systems.player?.position;
      const px = p ? p.x : 0, pz = p ? p.z : 0, py = p ? p.y : 0;
      // interiors
      let any = false;
      for (const it of interiors) {
        const now = p ? it.test(px, pz, py) : false;
        if (now !== it.inside) {
          it.inside = now;
          c.events.emit(now ? 'interior:enter' : 'interior:exit', { id: it.id, x: it.x, z: it.z });
          if (now) c.systems.ui?.banner(it.id === 'palace_cellar' ? 'The Palace Cellar' : 'The Throne Room', it.id === 'palace_cellar' ? 'mind the drips' : 'the Gummy Regent is not in', 2.6, 'candy');
        }
        any = any || now;
      }
      if (any !== insideAny) {
        // an isometric camera cannot stand back inside a 15-unit room: pull in
        // and steepen while the player is indoors, and hand the framing back on
        // the way out. The room is 15 units across: at distance 21 / elevation
        // 0.88 the LENS ITSELF stood outside the keep wall and half the frame
        // was the faded shell. Steeper is the only way in — at elevation 1.0 the
        // lens is 8.9 back and 14.3 up, i.e. inside the room, looking down at
        // the throne instead of through a wall at it.
        const cam = c.systems.camera;
        if (cam?.params) {
          if (any) { camSave = { distance: cam.params.distance, elevation: cam.params.elevation }; cam.setParams?.({ distance: Math.min(camSave.distance, 17), elevation: Math.max(camSave.elevation, 0.95) }); }
          else if (camSave) {
            // leaving the cellar INTO THE CAVE (its diorama sits at x≈1400) must not restore the island framing
            // over the cave's own 0.95 / 22 lens — the cave sets and clears its params itself (2026-09-24)
            const pl = c.systems.player?.position;
            const intoCave = !!pl && Math.abs(pl.x - 1400) < 500;
            if (!intoCave) cam.setParams?.(camSave);
            camSave = null;
          }
        }
        // the HUD names the place you are actually standing in (ui reads it)
        c.state.placeOverride = any
          ? (interiors[1].inside ? 'The Palace Cellar' : 'The Throne Room')
          : null;
      }
      insideAny = any;
      if (any) {
        const want = interiors[1].inside ? 'The Palace Cellar' : 'The Throne Room';
        if (c.state.placeOverride !== want) c.state.placeOverride = want;
        hideCelestials(c);
      }
      // THE ROOF GOES. Twenty-two units of wedding cake and a sugar dome sit
      // between an isometric lens and the throne; fading them to 15% only turns
      // the whole frame milky, so while you are inside they are switched off
      // outright and only the tier-1 SHELL stays, at a fifth, to keep the room
      // walled. The shell (ceiling disc included) is still in the shadow pass,
      // which is what stops the interior reading as a sunlit floor with ghosts
      // standing on it. The terrace deck fades the same way from the cellar.
      // …and so does the SHELL. Twenty percent sounded careful and rendered as
      // a milky beige mass across half of every interior frame — the lens
      // cannot get further back than the room is wide, so it is always looking
      // through one wall at the far one. Cut away entirely: floor, furniture,
      // and the terrace beyond, which is how an isometric game shows a room.
      // The lid (S, below) keeps casting, so the floor still sits in shade.
      coverK = fadeSet(coverMats, coverList, coverK, any ? 0 : 1, dt);
      // the lid: invisible while you are inside, but never `visible = false` —
      // a hidden mesh is dropped from the shadow pass too
      ceilK = fadeSet(ceilMats, [], ceilK, any ? 0 : 1, dt);
      roofK = fadeSet(roofMats, roofList, roofK, any ? 0 : 1, dt);
      cellK = fadeSet(cellMats, cellList, cellK, interiors[1].inside ? 0.12 : 1, dt);
      // colliders that only exist at one level
      const onTerrace = py > TER - 1.2;
      for (const c2 of cols.terrace) { if (c2.__x === undefined) { c2.__x = c2.x; } c2.x = onTerrace ? c2.__x : 1e5; }
      for (const c2 of cols.cellar) { if (c2.__x === undefined) { c2.__x = c2.x; } c2.x = onTerrace ? 1e5 : c2.__x; }
      // lamps only burn while somebody is inside (keeps the island light budget)
      for (const L of lights) {
        const want = L.interior ? (insideAny ? L.base * (0.8 + night * 0.2) : 0) : L.base * night;
        L.light.intensity = damp(L.light.intensity, want, 5, dt);
        L.light.visible = L.light.intensity > 0.02;
      }
      // doors + portcullis
      for (const lf of leaves) { lf.k = damp(lf.k, doorOpen ? 1 : 0, 5, dt); lf.g.rotation.y = lf.open * lf.k; }
      portG.position.y = TER + damp(portG.position.y - TER, portOpen ? 5.1 : 0, 3.4, dt);
      caveLeaf.rotation.y = damp(caveLeaf.rotation.y, caveOpen ? -1.3 : 0, 4, dt);
      // bunting flutter
      if (bunting) {
        for (let i = 0; i < buntList.length; i++) {
          const it = buntList[i];
          const ph = it.ph + t * 2.1;
          _e.set(Math.sin(ph) * 0.42, it.ry, Math.sin(ph * 0.7 + 1.1) * 0.28, 'YXZ');
          _q.setFromEuler(_e);
          _m.compose(_p.set(it.x, it.y + Math.sin(ph * 1.3) * 0.05, it.z), _q, _s.set(it.w, it.h, 1));
          bunting.setMatrixAt(i, _m);
        }
        bunting.instanceMatrix.needsUpdate = true;
      }
    },
  };

  // budget report
  {
    let tris = 0, n = 0;
    group.traverse((o) => {
      if (!o.isMesh) return; n++;
      const g = o.geometry, cnt = g.getIndex() ? g.getIndex().count : g.attributes.position.count;
      tris += (cnt / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    console.warn('[escape/palace]', JSON.stringify({
      meshes: n, triangles: Math.round(tris), pieces: B.stats.pieces + U.stats.pieces + R.stats.pieces + S.stats.pieces + K.stats.pieces,
      colliders: cols.always.length + cols.terrace.length + cols.cellar.length,
      GY: +GY.toFixed(2), TER: +TER.toFixed(2), CF: +CF.toFixed(2), top: +PEAK.toFixed(1),
    }));
  }

  escape.palace = api;
  escape.interiors = (escape.interiors || []).concat(interiors);
  return escape.register('palace', api);
}

// ── helpers ──────────────────────────────────────────────────────────────────
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
const _c = new THREE.Color();

/**
 * WORKAROUND — not our bug, but it lands in our frame. sky.js draws the sun and
 * moon as transparent, depthTest-off billboards a few units from the lens; the
 * transparent pass runs AFTER the opaque one, so they paint over a room's
 * floor. Indoors, with the lens steepened to 0.88, the moon came down into shot
 * as a big flat magenta polygon hovering a metre over the throne-room carpet.
 * sky updates before escape in main.js's order, so switching them off here
 * sticks for the frame; the moment you step outside sky turns them back on.
 * REPORTED: sky should give these meshes depthTest (or park them on a layer the
 * interior camera does not draw).
 */
let _celest = null;
export function hideCelestials(c) {
  if (!_celest) {
    const s = c.scene;
    _celest = [s.getObjectByName('moonDisc'), s.getObjectByName('sunDisc')].filter(Boolean);
    if (!_celest.length) { _celest = null; return; }
  }
  for (const m of _celest) m.visible = false;
}

/** Merge a handful of primitives into ONE vertex-coloured mesh (doors, grates). */
function makePart(pieces, material) {
  const geos = [];
  for (const p of pieces) {
    const g = p.g;
    if (p.rot) g.rotateX(p.rot[0] || 0), g.rotateY(p.rot[1] || 0), g.rotateZ(p.rot[2] || 0);
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
  // exact bounds (the part only ever moves as a whole, with its group): culled
  // on both tiers, main pass and shadow pass
  merged.computeBoundingSphere();
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = true;
  return m;
}

/**
 * A stained rock-candy window: a recessed dark reveal, four jewel panes, an
 * icing arch and mullions, and (at night) a soft spill on the wall around it.
 * Faces +Z in the local frame of rotY.
 */
function stainedWindow(B, x, y, z, rotY, w, h, key, arch = false) {
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  const px = (d) => x + sn * d, pz = (d) => z + cs * d;
  // reveal: a dark recess so the window is a HOLE, not a sticker
  B.box('licorice', w + 0.5, h + 0.5, 0.5, { at: [px(-0.2), y, pz(-0.2)], rot: [0, rotY, 0], color: 0x2a1f30 });
  B.box('matte', w + 0.9, h + 0.9, 0.22, { at: [px(0.04), y, pz(0.04)], rot: [0, rotY, 0], color: C.icing });
  B.box('licorice', w + 0.2, h + 0.2, 0.3, { at: [px(0.16), y, pz(0.16)], rot: [0, rotY, 0], color: 0x2a1f30 });
  // TWO tall jewel panes, not four small ones: at the game's 40-unit camera a
  // 2×2 grid of 0.7-unit panes reads as confetti stuck on the wall, while two
  // big slabs of colour read as a lit window.
  const cols = [0xff4a6e, 0x5ad0ff, 0xffd23a, 0x8a5bff];
  const pick = Math.abs(Math.round(x * 7 + z * 3)) % 4;
  for (let i = 0; i < 2; i++) {
    const ox = (i ? 1 : -1) * w * 0.24;
    B.box(key, w * 0.42, h * 0.86, 0.12, { at: [px(0.26) + cs * ox, y, pz(0.26) - sn * ox], rot: [0, rotY, 0], color: cols[(pick + i) % 4] });
  }
  B.sph(key, w * 0.24, 10, 8, { at: [px(0.3), y + h * 0.04, pz(0.3)], scale: [1, 1, 0.3], rot: [0, rotY, 0], color: 0xfff0a8 });
  B.box('matte', 0.12, h + 0.18, 0.16, { at: [px(0.32), y, pz(0.32)], rot: [0, rotY, 0], color: C.icing });
  B.box('matte', w + 0.14, 0.12, 0.16, { at: [px(0.32), y, pz(0.32)], rot: [0, rotY, 0], color: C.icing });
  if (arch) {
    B.sph('icing', w * 0.62, 12, 7, { at: [px(0.1), y + h / 2 + 0.1, pz(0.1)], scale: [1, 0.55, 0.22], rot: [0, rotY, 0], color: C.icing });
    B.box('icing', w + 1.0, 0.26, 0.34, { at: [px(0.12), y - h / 2 - 0.28, pz(0.12)], rot: [0, rotY, 0], color: C.icing });
  }
  B.plane('haloDisc', (w + 0.5) * 1.9, (h + 0.5) * 1.6, { at: [px(0.42), y, pz(0.42)], rot: [0, rotY, 0] });
}

/** Gingerbread with piped-icing courses. */
function makeBrickTexture() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#b9763f'; g.fillRect(0, 0, S, S);
  const rows = 4, cell = S / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * cell * 0.5;
    for (let cI = -1; cI < rows + 1; cI++) {
      const x = cI * cell + off, y = r * cell;
      g.fillStyle = ['#c08249', '#b06f38', '#c98d52', '#a96a35'][(r * 3 + cI + 8) % 4];
      g.fillRect(x + 3, y + 3, cell - 6, cell - 6);
    }
  }
  g.strokeStyle = '#fff6e8'; g.lineWidth = 4; g.lineCap = 'round';
  for (let r = 0; r <= rows; r++) { g.beginPath(); g.moveTo(0, r * cell); g.lineTo(S, r * cell); g.stroke(); }
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * cell * 0.5;
    for (let cI = -1; cI < rows + 1; cI++) { const x = cI * cell + off; g.beginPath(); g.moveTo(x, r * cell); g.lineTo(x, (r + 1) * cell); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// ── signs ────────────────────────────────────────────────────────────────────
function signEntries() {
  const cream = '#fff4e2', ink = '#3a2430', red = '#c4173a', plum = '#6b2a58';
  return [
    {
      id: 'palace_main', cw: 8, ch: 3,
      draw: (g, w, h) => plate(g, w, h, {
        bg: cream, edge: plum, borderW: 6, dots: true, dotColor: '#ffd1e6',
        lines: [
          { text: 'THE CANDY PALACE', size: 0.3, y: 0.3, color: plum, fat: true },
          { text: 'home of the Gummy Regent', size: 0.15, y: 0.62, color: ink },
          { text: '( deposed )', size: 0.13, y: 0.84, color: red },
        ],
      }),
    },
    {
      id: 'palace_cellar', cw: 3, ch: 2,
      draw: (g, w, h) => plate(g, w, h, {
        bg: '#e8d2b4', edge: '#6b4126', borderW: 5,
        lines: [
          { text: 'CELLAR', size: 0.3, y: 0.34, color: '#5a3318', fat: true },
          { text: 'mind the drips', size: 0.16, y: 0.68, color: ink },
        ],
      }),
    },
    {
      id: 'palace_drips', cw: 3, ch: 2,
      draw: (g, w, h) => plate(g, w, h, {
        bg: '#f2e0c6', edge: '#8f5527', borderW: 5,
        lines: [
          { text: 'DO NOT LICK', size: 0.2, y: 0.26, color: red, fat: true },
          { text: 'the walls', size: 0.16, y: 0.52, color: ink },
          { text: 'we know who does', size: 0.12, y: 0.78, color: '#8a6a78' },
        ],
      }),
    },
    {
      id: 'palace_cavedoor', cw: 4, ch: 1,
      draw: (g, w, h) => plate(g, w, h, {
        bg: '#2f2038', edge: '#7fd8ff', borderW: 5, grain: false,
        lines: [
          { text: 'UNDERSEA CAVE →', size: 0.34, y: 0.36, color: '#9fe6ff', fat: true },
          { text: 'bring a light. and a cat.', size: 0.2, y: 0.74, color: '#d6c2ea' },
        ],
      }),
    },
    {
      id: 'palace_note', cw: 3, ch: 2,
      draw: (g, w, h) => plate(g, w, h, {
        bg: '#fffdf4', edge: '#c9a05c', borderW: 4, grain: false,
        lines: [
          { text: 'GONE', size: 0.24, y: 0.24, color: ink, fat: true },
          { text: 'back never', size: 0.17, y: 0.52, color: ink },
          { text: '— the Regent', size: 0.13, y: 0.78, color: '#8a6a78' },
        ],
      }),
    },
  ];
}
