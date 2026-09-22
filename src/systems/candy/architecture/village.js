// GUMDROP VILLAGE — landmark candy_village (-140, 40), radius 34.
// Twelve gingerbread houses around an open plaza (kept clear for the Sour Patch
// Kids), a sugar fountain that actually runs, a licorice bandstand, a market
// row, signposts, fences, lampposts and wrapper bunting.
import { C, SPRINKLE, lamppost, bench, signpost, fenceLine, door, windowPane, icingDrip, caneRun, plaque } from './kit.js';
import { HOUSE_NAMES } from './signs.js';
import * as IN from './interiors.js';

const CX = -140, CZ = 44;          // plaza centre (the road junction is at -140,40)
const WALL_T = 0.42;               // wall thickness of an enterable house
const DOOR_GAP = 1.6;              // clear opening left between the front wall segments

const WALLS = [0xc07b42, 0xefd9c2, 0xcf8b4e, 0xb06a38, 0xf7c6da, 0xd39a60, 0xa96234, 0xc6e8dc, 0xc07b42, 0xe8cfa0, 0xb87a46, 0xead0e8];
const TRIMS = [C.icing, C.icingPink, C.icingMint, C.icingLemon];
const ROOFS = [C.wafer, 0xefa2c4, C.waferPale, 0xa8ddc8, C.waferDark, 0xf3c47e, C.wafer, 0xd8b0ea, C.waferPale, 0xefa2c4, C.waferDark, 0xa8ddc8];

// `home` = a Sour Patch family lives here and you can walk in. Those four are a
// little bigger than their neighbours so the iso camera can see into the room.
const HOUSES = [
  { x: -152, z: 48, w: 7.6, d: 6.4, h: 4.6, home: 'The Sournesses take in guests. Guests do not take themselves back out.' },
  { x: -146, z: 55, w: 5.6, d: 5.0, h: 5.4 },
  { x: -136, z: 56, w: 7.8, d: 6.6, h: 4.4, home: 'Something in here is still warm.' },
  { x: -128, z: 51, w: 5.8, d: 5.0, h: 5.0 },
  { x: -123, z: 46, w: 7.4, d: 6.4, h: 4.6, home: 'The table is set for one guest and nine hosts.' },
  { x: -152, z: 32, w: 6.0, d: 5.0, h: 4.8 },
  { x: -157, z: 41, w: 6.8, d: 5.6, h: 4.2 },
  { x: -147, z: 27, w: 5.6, d: 4.8, h: 5.2 },
  { x: -139, z: 26, w: 7.6, d: 6.4, h: 4.4, home: 'Eleven small chairs. One big one.' },
  { x: -130, z: 31, w: 5.8, d: 5.2, h: 4.6 },
  { x: -160, z: 48, w: 6.6, d: 5.4, h: 5.0 },
  { x: -137, z: 60, w: 5.4, d: 4.8, h: 4.4 },
];

export function buildVillage(A) {
  const { B, world } = A;
  const r = A.rng('village');
  A.mark('gumdrop_village', CX, world.height(CX, CZ), CZ);

  const eaves = [];
  HOUSES.forEach((hs, i) => {
    const rot = Math.atan2(CX - hs.x, CZ - hs.z);
    const e = buildHouse(A, { ...hs, rot, i, r });
    eaves.push(e);
  });

  // ── bunting between neighbouring houses ───────────────────────────────────
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [7, 8], [8, 9], [10, 0], [2, 11]];
  for (const [a, b] of pairs) stringBunting(A, eaves[a], eaves[b]);

  const fountain = buildFountain(A, -141, 47);
  buildBandstand(A, -131, 53);

  // ── market row along the east approach ────────────────────────────────────
  buildStall(A, -128.4, 35.4, 'stall_drops', 0.35, C.yellow);
  buildStall(A, -133.2, 33.2, 'stall_fizz', 0.1, C.blue);
  buildStall(A, -124.0, 42.6, 'stall_taffy', -1.5, C.pink);

  // ── signposts ─────────────────────────────────────────────────────────────
  const spY = world.height(-136.6, 43.2);
  const sp = signpost(B, -136.6, spY, 43.2, [
    { id: 'to_pier', dir: Math.atan2(1, -0.28) },
    { id: 'to_lake', dir: Math.atan2(-1, 0.36) },
    { id: 'to_peak', dir: Math.atan2(0.35, -1) },
    { id: 'to_cupcake', dir: Math.atan2(0.95, 0.3) },
  ], { h: 3.9 });
  A.collide(sp.x, sp.z, sp.r);
  A.readSign('village', -136.6, 43.2, 3.4, 'Read the signpost');

  // village welcome board on the east road
  const wbY = world.height(-126, 38.6);
  for (const s of [-1, 1]) B.stripeCyl(0.16, 0.18, 2.9, { at: [-126 + s * 1.5, wbY + 1.45, 38.6 + s * 0.1], variant: 1, seg: 8 });
  B.waffleBox(3.6, 1.5, 0.2, { at: [-126, wbY + 2.55, 38.6], rot: [0, 0.05, 0], color: C.waferPale });
  B.signQuad('village', 3.3, 1.28, { at: [-126, wbY + 2.55, 38.72], rot: [0, 0.05, 0] });
  B.signQuad('village', 3.3, 1.28, { at: [-126, wbY + 2.55, 38.48], rot: [0, Math.PI + 0.05, 0] });
  icingDrip(B, -126, wbY + 3.32, 38.6, Math.PI / 2 + 0.05, 3.6, { color: C.icingPink, r: 0.2, drop: 0.28 });
  A.readSign('village', -126, 38.6, 3.6, 'Read: Gumdrop Village');

  // ── plaza furniture (kept out of the middle) ──────────────────────────────
  // benches are SOLID now, so none of them may sit on a front path
  for (const [bx, bz, br] of [[-142.6, 50.6, -0.9], [-137.2, 49.6, 2.4], [-143.5, 39.5, 0.5]]) {
    const p = A.freeSpot(bx, bz, 1.6);
    bench(B, p.x, world.height(p.x, p.z), p.z, br, { A });
  }

  // ── lampposts: plaza ring + road ──────────────────────────────────────────
  // The first four are the PLAZA lamps and each one carries a real PointLight
  // (r170 physical units: intensity ~70 at distance 15, decay 2 ⇒ a pool you
  // can see the edge of, not a floodlight over the whole village). The lamp
  // collider is deliberately 0.8 — big enough that the vegetation clearance
  // pass blanks lollipops growing through the post.
  const lampSpots = [[-145.5, 43.5], [-136.5, 47.5], [-141.8, 52.4], [-133.0, 41.0], [-150.5, 38.5], [-127.5, 45.5], [-155.0, 45.5], [-142.5, 33.0]];
  const heads = [];
  lampSpots.forEach(([lx, lz], i) => {
    const p = A.freeSpot(lx, lz, 2.3);
    heads.push(lamppost(B, p.x, world.height(p.x, p.z), p.z, { h: 4.0, variant: i % 2 ? 1 : 0 }));
    A.collide(p.x, p.z, 0.8);
  });
  // THREE plaza PointLights, not four. The island budget is 6 for architecture
  // and the Great Cupcake's bite now burns one of them all day long (a crater in
  // permanent self-shadow needs light at MIDDAY, which a lantern cannot give).
  // The fourth lamp keeps its emissive globe, its bloom and its ground pool —
  // at the game camera nobody can tell which three are the real ones.
  for (let i = 0; i < 3; i++) {
    const L = heads[i];
    A.light(L.x, L.y + 0.1, L.z, i === 1 ? 0xffd6a0 : 0xffcf8a, 15, i < 2 ? 84 : 68);
  }

  // ── wind-spinner lollipops around the edges ───────────────────────────────
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r.range(-0.2, 0.2);
    const rad = r.range(20, 30);
    const x = CX + Math.cos(a) * rad, z = CZ + Math.sin(a) * rad * 0.85;
    if (!world.isFreeGround(x, z, { pathMargin: 1.6, avoidLandmarks: false })) continue;
    const y = world.height(x, z);
    B.stripeCyl(0.11, 0.13, 2.5, { at: [x, y + 1.25, z], variant: i % 3, seg: 7 });
    B.sph('gloss', 0.15, 6, 5, { at: [x, y + 2.52, z], color: C.licorice });
    A.inst.spinners.push({ x, y: y + 2.6, z, ry: r.range(0, 6.28), ph: r.range(0, 6.28), spd: r.range(0.2, 1.4), s: r.range(0.65, 0.95), color: SPRINKLE[i % SPRINKLE.length] });
    A.collide(x, z, 0.4);
  }

  // ── licorice fence lines along the plaza approach ─────────────────────────
  const gy = (x, z) => world.height(x, z);
  fenceLine(B, [[-133.5, 47.5], [-131.0, 44.5], [-130.0, 40.5]], gy, { tipColor: C.pink, A });
  fenceLine(B, [[-148.5, 50.5], [-150.5, 47.0], [-150.0, 43.0]], gy, { tipColor: C.green, A });

  return { sparkle: fountain.sparkle, steam: fountain.steam, splash: fountain.splash };
}

// ─────────────────────────────────────────────────────────────────────────────
function frame(x, y, z, rot) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return { p: (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs], rot };
}

function buildHouse(A, s) {
  const { world } = A;
  const { x, z, w, d, h, rot, i, r } = s;
  const y = world.height(x, z);
  const F = frame(x, y, z, rot);
  const wall = WALLS[i % WALLS.length], trim = TRIMS[i % TRIMS.length], roof = ROOFS[(i + 1) % ROOFS.length];
  const pink = i % 3 === 1;
  const name = HOUSE_NAMES[i % HOUSE_NAMES.length];
  const floorY = y + 0.28;
  const iw = w - WALL_T * 2, id = d - WALL_T * 2;      // the room inside the walls

  // An enterable house splits into three meshes: the SHELL (ghosts while you are
  // inside), the ROOF (hidden while you are inside) and the ROOM (drawn only
  // while you are inside). Everything else — plinth, porch, planting, nameplate
  // — stays on the shared merged builder.
  const E = s.home ? A.building({
    id: 'house_' + i, name, x, z, w: iw, d: id, rot, floorY, pad: 0.35,
  }) : null;
  const B = A.B;                       // porch / planting / signs (shared merge)
  const W = E ? E.wall : A.B;          // walls
  const R = E ? E.roof : A.B;          // roof

  // plinth
  B.box('matte', w + 0.5, 0.36, d + 0.5, { at: F.p(0, 0.1, 0), rot: [0, rot, 0], color: 0x453353 });

  if (E) {
    // ── hollow shell: four slabs with a gap at the door ─────────────────────
    const segW = (w - DOOR_GAP) / 2;
    W.box('matte', w, h, WALL_T, { at: F.p(0, 0.28 + h / 2, -d / 2 + WALL_T / 2), rot: [0, rot, 0], color: wall });
    for (const sx of [-1, 1]) {
      W.box('matte', segW, h, WALL_T, { at: F.p(sx * (w + DOOR_GAP) / 4, 0.28 + h / 2, d / 2 - WALL_T / 2), rot: [0, rot, 0], color: wall });
      W.box('matte', WALL_T, h, d - WALL_T * 2, { at: F.p(sx * (w / 2 - WALL_T / 2), 0.28 + h / 2, 0), rot: [0, rot, 0], color: wall });
    }
    // lintel over the doorway
    W.box('matte', DOOR_GAP + 0.1, h - 2.5, WALL_T, { at: F.p(0, 0.28 + 2.5 + (h - 2.5) / 2, d / 2 - WALL_T / 2), rot: [0, rot, 0], color: wall });
    // ── wall colliders: four runs, doorway left open ────────────────────────
    const P = (lx, lz) => F.p(lx, 0, lz);
    const bk = P(0, -d / 2 + WALL_T / 2); A.collideBox(bk[0], bk[2], w, WALL_T, rot, floorY + h);
    for (const sx of [-1, 1]) {
      const fr = P(sx * (w + DOOR_GAP) / 4, d / 2 - WALL_T / 2); A.collideBox(fr[0], fr[2], segW, WALL_T, rot, floorY + h);
      const sd = P(sx * (w / 2 - WALL_T / 2), 0); A.collideBox(sd[0], sd[2], WALL_T, d, rot, floorY + h);
    }
    A.deckRRect(x, z, iw, id, rot, floorY);
  } else {
    W.box('matte', w, h, d, { at: F.p(0, 0.28 + h / 2, 0), rot: [0, rot, 0], color: wall });
    A.collideBox(x, z, w, d, rot, floorY + h);
  }
  // claim the ground so vegetation's clearance pass keeps canes out of the house
  A.claim(x, z, w + 0.4, d + 0.4, rot);

  // corner icing beads
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    W.cyl('icing', 0.17, 0.17, h, { at: F.p(sx * w / 2, 0.28 + h / 2, sz * d / 2), rot: [0, rot, 0], color: trim });
  }

  // gable roof (ridge along local X)
  const over = 0.55, rise = d * 0.46;
  const slope = Math.hypot(d / 2 + over, rise);
  const ang = Math.atan2(rise, d / 2 + over);
  const ry = 0.28 + h;
  for (const sz of [-1, 1]) {
    R.waffleBox(w + over * 2, 0.26, slope, { at: F.p(0, ry + rise / 2, sz * (d / 2 + over) / 2), rot: [sz * ang, rot, 0], color: roof });
  }
  // gable end triangles (a 3-sided prism: apex up, base = the wall top) — wall,
  // not roof: they close the room off and must ghost with the rest of the shell
  for (const sx of [-1, 1]) {
    W.cyl('matte', 1, 1, 1, 3, {
      at: F.p(sx * (w / 2 - 0.14), ry + rise / 3, 0), rot: [-Math.PI / 2, Math.PI / 2 + rot, 0],
      scale: [d / 1.732, 0.28, rise / 1.5], color: wall,
    });
  }
  // ridge candy cane + icing drips on the eaves
  if (E) caneRun(R, 'matte', ...xz(F.p(0, ry + rise + 0.13, 0)), rot, w + over * 2, 0.16, { colorA: C.licoriceRed, colorB: C.cream });
  else B.stripeCyl(0.16, 0.16, w + over * 2, { at: F.p(0, ry + rise + 0.13, 0), rot: [0, rot, Math.PI / 2], variant: i % 3, seg: 8 });
  for (const sz of [-1, 1]) icingDrip(R, ...xz(F.p(0, ry - 0.04, sz * (d / 2 + over))), rot, w + over * 2, { color: trim, r: 0.22, drop: 0.34, step: 0.62 });

  // chimney (smoke hook) — rides with the roof
  const chx = F.p(w * 0.28, ry + rise * 0.55, -d * 0.18);
  R.box('matte', 0.72, 1.7, 0.72, { at: [chx[0], chx[1] + 0.5, chx[2]], rot: [0, rot, 0], color: C.chocMilk });
  R.box('icing', 0.92, 0.22, 0.92, { at: [chx[0], chx[1] + 1.42, chx[2]], rot: [0, rot, 0], color: trim });
  A.chimney(chx[0], chx[1] + 1.6, chx[2]);

  // door + porch
  const dz = d / 2;
  const dw = E ? 1.3 : 1.15, dh = E ? 2.3 : 2.1;
  const dp = door(B, ...xz(F.p(0, 0, dz)), rot, { w: dw, h: dh, y: 0, frame: trim, color: C.chocMilk, knob: SPRINKLE[i % SPRINKLE.length], leaf: !E });
  if (E) {
    const hp = F.p(0, 0, dz - WALL_T * 0.5);
    E.door({
      x: hp[0], y: floorY - 0.02, z: hp[2], rot, w: dw, h: dh, color: C.chocMilk, swing: 1, r: 2.4,
      say: s.home,
    });
  }
  for (const sx of [-1, 1]) {
    const pp = F.p(sx * (dw / 2 + 0.68), 0, dz + 1.0);
    B.stripeCyl(0.15, 0.17, 2.5, { at: [pp[0], y + 1.25, pp[2]], variant: (i + 1) % 3, seg: 8 });
    A.collide(pp[0], pp[2], 0.3);
  }
  R.waffleBox(3.1, 0.18, 1.35, { at: F.p(0, 2.6, dz + 0.65), rot: [0, rot, 0], color: roof });
  icingDrip(R, ...xz(F.p(0, 2.52, dz + 1.3)), rot, 3.1, { color: trim, r: 0.17, drop: 0.26, step: 0.5 });
  // step
  B.box('matte', 1.7, 0.18, 0.7, { at: F.p(0, 0.18, dz + 0.5), rot: [0, rot, 0], color: C.icing });
  if (E) B.box('matte', DOOR_GAP, 0.3, 0.5, { at: F.p(0, 0.14, dz - 0.1), rot: [0, rot, 0], color: C.icing });  // threshold

  // Windows: two on the front, one per side, one in each gable.
  // EXACTLY ONE pane per house is left unlit — a village where every window
  // glows reads as a lighting bug, and a village with three dark panes per
  // house reads as abandoned. The dark one is picked by house index so it
  // walks around the building from neighbour to neighbour, and it is NEVER on
  // the front: the two front panes always burn, because the front is what the
  // iso camera sees from the plaza after dark.
  const DARK = i % 4;                       // 0 = left side · 1 = right side · 2,3 = a gable
  for (const sx of [-1, 1]) {
    const p = F.p(sx * (w / 2 - 1.15), 0, dz);
    windowPane(W, p[0], y + 0.28 + h * 0.58, p[2], rot, { w: 0.95, h: 0.95, frame: trim, pink });
  }
  for (const sx of [-1, 1]) {
    const p = F.p(sx * (w / 2), 0, -0.3);
    windowPane(W, p[0], y + 0.28 + h * 0.56, p[2], rot + sx * Math.PI / 2, { w: 0.85, h: 0.85, frame: trim, pink: !pink, dark: DARK === (sx < 0 ? 0 : 1) });
    const q = F.p(sx * (w / 2 - 0.02), 0, 0);
    windowPane(W, q[0], y + ry + rise * 0.34, q[2], rot + sx * Math.PI / 2, { w: 0.62, h: 0.62, frame: trim, pink, sill: false, dark: DARK === (sx < 0 ? 2 : 3) });
  }

  // NAMEPLATE — hung from the front edge of the porch canopy, not pinned to the
  // wall behind it. On the wall it sat at y+2.6, which is within a centimetre of
  // the canopy's own height: from the iso camera the canopy lay straight across
  // it and every house in the village had its name sliced in half (round 3:
  // "the 'Dip & Ducks' stall sign sits under the clock HUD" — it was a house
  // called Pip & Pucker, with a porch roof through the middle of it). Out here
  // it hangs clear, faces the plaza, and sits half a unit lower in frame.
  {
    const np = F.p(0, 0, dz + 1.30);
    const ny = y + 2.16;
    for (const sx of [-1, 1]) {
      const hp = F.p(sx * 0.62, 0, dz + 1.26);
      B.cyl('matte', 0.045, 0.045, 0.36, 5, { at: [hp[0], ny + 0.48, hp[2]], color: C.licorice });
    }
    B.box('matte', 1.52, 0.7, 0.1, { at: [np[0], ny, np[2]], rot: [0, rot, 0], color: C.licorice });
    B.signQuad('name' + (i % HOUSE_NAMES.length), 1.4, 0.64, { at: F.p(0, 2.16, dz + 1.36), rot: [0, rot, 0] });
  }

  frontGarden(A, F, { x, z, w, d, rot, i, r, dz, trim });

  if (E) {
    houseInterior(A, E, IN.frameAt(x, floorY, z, rot), iw, id, h, i, name);
    E.finish();
  } else {
    A.interact({
      id: 'candy_house_' + i, x: dp.x + Math.sin(rot) * 0.9, z: dp.z + Math.cos(rot) * 0.9, r: 2.4,
      label: 'Knock on ' + name,
      onInteract(ctx) { ctx.systems.ui?.say(HOUSE_LINES[i % HOUSE_LINES.length], { speaker: name, duration: 6 }); },
    });
  }

  return { x, z, rot, eaveY: y + ry + 0.1, w, d, name, home: !!s.home, doorX: dp.x, doorZ: dp.z };
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * A FRONT GARDEN. Round 2 of review: "the bare mint ground beside the village
 * houses". Every house now gets a fenced plot in front of it — a picket run
 * down each side with a GATE left open on the path to the door (a solid fence
 * across your own doorstep is the most annoying thing a village can do to you),
 * three gumdrop shrubs of different sizes, a row of wafer stepping stones from
 * the step to the road, and, on every other house, a bench and a gag.
 *
 * Everything is nudged with A.freeSpot and skipped if it lands on a road, so a
 * garden never grows across candy_main.
 */
function frontGarden(A, F, s) {
  const { B, world } = A;
  const { x, z, w, d, rot, i, r, dz, trim } = s;
  const gy = (px, pz) => world.height(px, pz);
  const GATE = 1.5, DEEP = 3.4;                   // half-width of the gate, depth of the plot
  const onRoad = (p) => world.onPath(p[0], p[2], 1.2);

  // the picket boundary: two side runs and two front runs with a gate between
  const corner = (sx) => F.p(sx * (w / 2 + 0.9), 0, dz + DEEP);
  for (const sx of [-1, 1]) {
    const a = F.p(sx * (w / 2 + 0.9), 0, dz - 0.1), b = corner(sx);
    if (!onRoad(a) && !onRoad(b)) fenceLine(B, [[a[0], a[2]], [b[0], b[2]]], gy, { h: 0.82, gap: 0.92, tipColor: SPRINKLE[(i + (sx > 0 ? 0 : 2)) % SPRINKLE.length], A });
    const c = F.p(sx * GATE, 0, dz + DEEP);
    if (!onRoad(b) && !onRoad(c)) fenceLine(B, [[b[0], b[2]], [c[0], c[2]]], gy, { h: 0.82, gap: 0.92, tipColor: SPRINKLE[(i + 1) % SPRINKLE.length], A });
    // gatepost with a gumdrop finial
    if (!onRoad(c)) {
      B.box('licorice', 0.2, 1.15, 0.2, { at: [c[0], gy(c[0], c[2]) + 0.58, c[2]], rot: [0, rot, 0], color: C.licorice });
      B.sph('gloss', 0.24, 7, 6, { at: [c[0], gy(c[0], c[2]) + 1.24, c[2]], color: SPRINKLE[(i + 4) % SPRINKLE.length] });
    }
  }
  // stepping stones out of the gate
  for (let k = 0; k < 4; k++) {
    const p = F.p(0, 0, dz + 1.0 + k * 0.85);
    if (onRoad(p)) continue;
    B.waffleCyl(0.44, 0.44, 0.1, 7, { at: [p[0], gy(p[0], p[2]) + 0.06, p[2]], rot: [0, rot + k * 0.4, 0], color: k % 2 ? C.waferPale : C.wafer });
  }
  // gumdrop shrubs — three, different sizes, clustered not scattered
  const shrubs = [[-(w / 2 + 0.35), 1.0, 0.88], [w / 2 + 0.35, 1.0, 0.7], [-(w / 2 - 0.6), 2.6, 0.52], [w / 2 - 0.9, 2.4, 0.62]];
  shrubs.forEach(([lx, lz, gh0], k) => {
    const p = F.p(lx, 0, dz + lz);
    if (onRoad(p)) return;
    const sp = A.freeSpot(p[0], p[2], 0.9);
    const gh = gh0 * r.range(0.85, 1.15);
    B.sph('gloss', gh, 7, 5, { at: [sp.x, gy(sp.x, sp.z) + gh * 0.72, sp.z], scale: [1, 0.86, 1], color: SPRINKLE[(i + k + 1) % SPRINKLE.length] });
    B.ico('icing', gh * 0.5, 0, { at: [sp.x, gy(sp.x, sp.z) + gh * 1.12, sp.z], scale: [1, 0.42, 1], color: trim });
    A.collide(sp.x, sp.z, gh * 0.8);
  });
  // a flower bed of sugar-blossoms along the front wall
  for (let k = 0; k < 5; k++) {
    const p = F.p(-w / 2 + 0.8 + k * ((w - 1.6) / 4), 0, dz + 0.55);
    if (onRoad(p)) continue;
    const fy = gy(p[0], p[2]);
    B.cyl('matte', 0.045, 0.05, 0.42, 4, { at: [p[0], fy + 0.21, p[2]], color: 0x3f8f3a });
    B.ico('gloss', 0.21, 0, { at: [p[0], fy + 0.46, p[2]], rot: [0.3, k * 1.1, 0], scale: [1.2, 0.62, 1.2], color: SPRINKLE[(k * 2 + i) % SPRINKLE.length] });
  }
  // every other house gets somewhere to sit, and something to find
  if (i % 2 === 0) {
    const bp = F.p(-(w / 2 - 0.2), 0, dz + 2.5);
    if (!onRoad(bp)) {
      const sp = A.freeSpot(bp[0], bp[2], 1.5);
      bench(B, sp.x, gy(sp.x, sp.z), sp.z, rot + Math.PI, { w: 1.8, A });
    }
  } else {
    // a milk bottle on the step, and a very small pair of boots beside it
    const mp = F.p(w / 2 - 1.4, 0, dz + 0.95);
    if (!onRoad(mp)) {
      const my = gy(mp[0], mp[2]);
      B.cyl('icing', 0.13, 0.16, 0.4, 8, { at: [mp[0], my + 0.2, mp[2]], color: C.cream });
      B.sph('gloss', 0.1, 6, 5, { at: [mp[0], my + 0.43, mp[2]], color: C.red });
      for (const sx of [-1, 1]) B.box('licorice', 0.16, 0.2, 0.3, { at: [mp[0] + sx * 0.22, my + 0.1, mp[2] + 0.45], rot: [0, rot + sx * 0.2, 0], color: C.licoriceSoft });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * One room, one Sour Patch family. Gumdrop beds, a wafer table laid with
 * person-shaped cookie cutters, a padlocked fridge, portraits with far too many
 * teeth, and a rug that used to be a marshmallow sheep. Nothing graphic —
 * everything is just slightly, cheerfully wrong.
 */
function houseInterior(A, E, F, iw, id, h, i, name) {
  const I = E.in;
  const hw = iw / 2, hd = id / 2;
  IN.floor(I, F, iw, id, { a: 0xc79a62, b: 0xb98a53, skirt: C.icing });

  // beds along the back wall: one big, two small
  const beds = [
    IN.gumdropBed(I, F, -hw + 0.85, -hd + 1.25, 0, 1.0, SPRINKLE[i % SPRINKLE.length]),
    IN.gumdropBed(I, F, 0.35, -hd + 1.0, 0, 0.72, SPRINKLE[(i + 2) % SPRINKLE.length]),
    IN.gumdropBed(I, F, 1.55, -hd + 1.0, 0, 0.72, SPRINKLE[(i + 4) % SPRINKLE.length]),
  ];
  for (const b of beds) A.collide(b.x, b.z, b.r * 0.8);

  // the table, laid for company
  const t = IN.waferTable(I, F, -hw + 1.5, hd - 1.7, 0.25, { cutters: 2 + (i % 2) });
  A.collide(t.x, t.z, 0.8);
  IN.stool(I, F, -hw + 2.8, hd - 1.5);

  // the fridge nobody will discuss
  const fr = IN.fridge(I, F, hw - 0.75, -hd + 0.6, 0);
  A.collide(fr.x, fr.z, 0.55);

  // portraits
  IN.portrait(I, F, 'portrait' + (i % 4), -hw + 1.6, h * 0.74, -hd + 0.08, 0, 0.82, 0.82);
  IN.portrait(I, F, 'portrait' + ((i + 1) % 4), -hw + 0.06, h * 0.66, 0.3, Math.PI / 2, 0.66, 0.66);

  // the rug
  IN.sheepRug(I, F, 0.1, hd - 2.9, 0.3, 0.92);

  // shelf + lamps
  IN.shelf(I, F, hw - 0.08, h * 0.6, hd - 2.2, -Math.PI / 2, 1.2, 3);
  const lamp = IN.ceilingLamp(I, F, 0, h - 0.75, -0.2, { glow: 2.4 });
  E.lamp(lamp.x, lamp.y - 0.15, lamp.z, 0xffc07a);
  IN.ceilingLamp(I, F, -hw + 0.9, 1.15, -hd + 1.9, { drop: 0, glow: 1.3, hood: C.icingLemon });

  // the interactables
  const fp = F.p(hw - 0.75, 0, -hd + 1.5);
  A.interact({
    id: 'house_fridge_' + i, x: fp[0], z: fp[2], r: 1.7, label: 'Open the fridge',
    onInteract(ctx) {
      ctx.systems.ui?.say(FRIDGE_LINES[i % FRIDGE_LINES.length], { speaker: name, duration: 6.5 });
      ctx.systems.story?.set('opened_fridge', true);
    },
  });
  const pp = F.p(-hw + 1.6, 0, -hd + 0.9);
  A.interact({
    id: 'house_portrait_' + i, x: pp[0], z: pp[2], r: 1.7, label: 'Look at the family portrait',
    onInteract(ctx) { ctx.systems.ui?.say(PORTRAIT_LINES[i % PORTRAIT_LINES.length], { speaker: name, duration: 6.5 }); },
  });
}

const FRIDGE_LINES = [
  'Padlocked. Through the seam: something pale, something folded, and a shoe. The shoe is at the bottom, so it went in first.',
  'Padlocked, chained, and warm to the touch. A sticky note: "NOT FOOD. YET. — do not move the label."',
  'It hums. It is not plugged into anything. There is nothing in this village to plug it into.',
  'Locked. A small voice from inside the fridge says, quite pleasantly, "we\'re fine!"',
];
const PORTRAIT_LINES = [
  'Four smiling faces and eleven rows of teeth. In the background of the photo, slightly out of focus, a man in a sun hat is waving.',
  'A family portrait. Everyone is beaming. Somebody has helpfully labelled the guest in the back row: "lunch, 1987".',
  'They are all looking at the camera. Except the smallest one, who is looking at whoever was holding it.',
  'A holiday photo at Sugar Pier. Sixteen kids, one visitor, one arrow drawn in crayon pointing at the visitor.',
];

const xz = (p) => [p[0], p[1], p[2]];

const HOUSE_LINES = [
  'A tiny voice: "we\'re not home!" …a pause… "we\'re DEFINITELY not home."',
  'Something small and sparkling peers through the letterbox. "Ooooh. A soft one."',
  'The door opens two inches. A wave of lemon smell. "Come back at eight. Not nine. EIGHT."',
  'Nobody answers. Inside, forty tiny voices go completely silent at once.',
  'A note on the door: "gone hunting — back by moonrise — kettle\'s on for you!!"',
  'A small green hand slides a menu under the door. It is a menu of times, not foods.',
  'Giggling. Then a whisper: "he knocked! they never knock!"',
  'The letterbox snaps shut on your fingertip. "Sorry! Reflex! You\'re lovely though."',
  'A voice: "how many are you?" You say one. A long, disappointed "ohhhhh."',
  'Through the window: a table set for one guest, and eleven small chairs.',
  'A chirpy "WE\'RE OUT!" from a house with all its lights on.',
  'The door is warm. Something behind it is humming a very old song about visitors.',
];

// ─────────────────────────────────────────────────────────────────────────────
/**
 * THE SUGAR FOUNTAIN — rebuilt in round 4.
 *
 * What was wrong with the old one: three stacked dishes, a scalloped ring of
 * ten spheres round the basin (the "stair-stepped rim"), a syrup disc lying
 * exactly in the plane of the rim torus and three more ripple tori at the same
 * height (the z-fighting), and twenty-two jets thrown between dishes that each
 * passed straight through the dish below (the self-intersection). And the
 * camera had nothing but a bare 4.1 circle to dodge, so the lens walked into it.
 *
 * What it is now: TWO smooth bowls, nothing coplanar with anything (every water
 * surface sits a measured distance BELOW the rim that holds it, and every
 * ripple sits a measured distance above the water), a chunky syrup rim you can
 * read at thirty units, a crown gumdrop, and EIGHT clean arcs — four short ones
 * into the upper bowl, four long ones that clear its rim by a metre and land in
 * the basin. The solid body is its own merged group so the camera can ghost it.
 */
function buildFountain(A, x, z) {
  const { B, world } = A;
  const y = world.height(x, z);
  const SYRUP = 0xff7fb5, FOAM = 0xffe4f0, JET = 0xffb3d6;
  // Its own sub-group: `userData.fade` on the island-wide merged mesh would
  // dissolve every icing surface in Candyland at once.
  const S = A.sub('fountain', { gloss: true });
  const F = S.B;

  // ── basin ─────────────────────────────────────────────────────────────────
  // A step, a smooth 40-segment bowl, a solid plug of syrup INSIDE it (0.42
  // below the crest of the rim, so no two faces are ever in the same plane),
  // and one fat torus of syrup for the rim.
  F.cyl('matte', 4.34, 4.62, 0.36, 40, { at: [x, y + 0.18, z], color: C.icing });
  F.cyl('matte', 3.98, 4.30, 1.02, 40, { at: [x, y + 0.51, z], color: C.icingPink });
  F.cyl('gloss', 3.88, 3.88, 0.92, 40, { at: [x, y + 0.48, z], color: SYRUP });
  F.tor('gloss', 4.00, 0.32, 10, 44, { at: [x, y + 1.04, z], rot: [Math.PI / 2, 0, 0], color: C.syrup });

  // ── pedestal + the one upper bowl ─────────────────────────────────────────
  // a candy-cane stem, not a white one: behind a pale curtain of syrup a white
  // column just makes the middle of the fountain one undifferentiated white mass
  F.stripeCyl(0.62, 1.10, 2.30, { at: [x, y + 2.05, z], variant: 2, seg: 20 });
  F.tor('matte', 0.72, 0.14, 8, 20, { at: [x, y + 3.06, z], rot: [Math.PI / 2, 0, 0], color: C.icingPink });
  F.cyl('matte', 2.02, 0.78, 0.52, 32, { at: [x, y + 3.39, z], color: C.icing });
  F.cyl('gloss', 1.90, 1.90, 0.44, 32, { at: [x, y + 3.38, z], color: SYRUP });
  F.tor('gloss', 2.02, 0.19, 8, 34, { at: [x, y + 3.65, z], rot: [Math.PI / 2, 0, 0], color: C.syrup });

  // ── the crown gumdrop ─────────────────────────────────────────────────────
  F.cyl('matte', 0.36, 0.56, 1.62, 16, { at: [x, y + 4.45, z], color: C.icing });
  F.tor('matte', 0.74, 0.15, 8, 20, { at: [x, y + 5.22, z], rot: [Math.PI / 2, 0, 0], color: C.icing });
  F.sph('gloss', 1.06, 20, 14, { at: [x, y + 6.05, z], scale: [1, 0.94, 1], color: 0xff8fc2 });
  for (let i = 0; i < 7; i++) {                          // sugar crust on the gumdrop
    const a = (i / 7) * Math.PI * 2 + 0.3, t = 0.45 + 0.35 * Math.sin(i * 1.9);
    F.sph('matte', 0.17, 7, 5, { at: [x + Math.cos(a) * 1.02 * Math.cos(t), y + 6.05 + Math.sin(t) * 1.0, z + Math.sin(a) * 1.02 * Math.cos(t)], color: C.icing });
  }
  F.sph('gloss', 0.40, 12, 9, { at: [x, y + 7.28, z], color: C.red });
  F.cyl('matte', 0.06, 0.07, 0.5, 5, { at: [x, y + 7.66, z], rot: [0, 0, -0.4], color: 0x2f6b2a });
  F.ico('matte', 0.3, 0, { at: [x + 0.38, y + 7.9, z + 0.05], scale: [1.7, 0.3, 1.1], rot: [0, 0.5, 0.3], color: 0x3f8f3a });

  // ── the water: eight arcs, each of which crosses nothing ──────────────────
  // Long arcs are thrown to radius 3.0 before they drop past the upper bowl's
  // rim (2.02 + 0.19), so the jet passes a clear 0.8 outside it; short arcs
  // never leave the bowl they land in. Both sets start INSIDE the gumdrop, so
  // no jet ever shows a cut-off end hanging in mid-air.
  const arc = (a, p0, p1, p2, ra, rb) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    B.tubeArc(
      [x + ca * p0[0], y + p0[1], z + sa * p0[0]],
      [x + ca * p1[0], y + p1[1], z + sa * p1[0]],
      [x + ca * p2[0], y + p2[1], z + sa * p2[0]],
      ra, rb, { seg: 14, rad: 5, color: JET },
    );
    return [x + ca * p2[0], z + sa * p2[0]];
  };
  const splashes = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const [lx, lz] = arc(a, [0.72, 5.50], [3.25, 6.25], [2.95, 1.02], 0.13, 0.095);
    B.sph('icing', 0.46, 8, 6, { at: [lx, y + 1.00, lz], scale: [1.5, 0.34, 1.5], color: FOAM });
    B.sph('icing', 0.30, 7, 5, { at: [lx, y + 1.16, lz], color: 0xffffff });
    splashes.push({ x: lx, y: y + 1.12, z: lz });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const [sx2, sz2] = arc(a, [0.60, 5.40], [1.46, 5.06], [1.50, 3.66], 0.105, 0.08);
    B.sph('icing', 0.34, 7, 5, { at: [sx2, y + 3.64, sz2], scale: [1.5, 0.34, 1.5], color: FOAM });
  }
  // the upper bowl overflows into the basin as one continuous lobed curtain —
  // it runs at radius 1.98→2.45, a full half-unit inside the long jets
  // fill 0.44 ⇒ six SEPARATE ribbons with daylight between them. At the default
  // 0.68 with nine lobes the curtain closes into a drum and the fountain reads
  // as a white cylinder standing in a pink dish.
  B.flowFall(x, z, y + 3.58, y + 1.02, 1.94, 2.72, 6, { color: 0xff8fc2, splash: FOAM, splashR: 0.34, ripple: false, fill: 0.40 });

  // ripples: 0.06 PROUD of each syrup surface, never in its plane
  for (const rr of [1.15, 1.55]) B.tor('icing', rr, 0.065, 5, 24, { at: [x, y + 3.66, z], rot: [Math.PI / 2, 0, 0], color: 0xfff2f8 });
  for (const rr of [1.35, 2.05, 2.55, 3.30]) B.tor('icing', rr, 0.085, 5, 30, { at: [x, y + 1.00, z], rot: [Math.PI / 2, 0, 0], color: 0xfff2f8 });
  for (let i = 0; i < 18; i++) {                       // foam bobbing at the waterline
    const a = (i / 18) * Math.PI * 2 + 0.2;
    B.sph('icing', 0.26 + 0.1 * Math.abs(Math.sin(i * 2.3)), 6, 5, { at: [x + Math.cos(a) * 3.55, y + 0.92, z + Math.sin(a) * 3.55], scale: [1.3, 0.4, 1.3], color: 0xfff6fb });
  }
  // four gumdrop bollards ON the rim (no spout arcs — the rim is where people
  // sit, and an arc springing out of the seat is the thing that used to cross
  // the basin wall)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
    F.cyl('matte', 0.26, 0.32, 0.55, 10, { at: [x + ca * 4.06, y + 1.28, z + sa * 4.06], color: C.icing });
    F.sph('gloss', 0.52, 10, 8, { at: [x + ca * 4.06, y + 1.78, z + sa * 4.06], scale: [1, 1.12, 1], color: SPRINKLE[i % SPRINKLE.length] });
  }

  // ── the camera contract ───────────────────────────────────────────────────
  // A collider with a real HEIGHT, so the lens dollies in front of the fountain
  // instead of diving through it, plus fade on the body so a lens that ends up
  // inside it ghosts rather than clipping.
  A.ctx.colliders.push({ x, z, r: 4.5, h: y + 7.9 });
  for (const m of S.finish()) { m.userData.fade = true; m.userData.noOcclude = false; }
  A.mark('sugar_fountain', x, y, z);
  A.readSign('fountain', x + 5.4, z, 3.0, 'Read: the Sugar Fountain');
  B.stripeCyl(0.1, 0.12, 1.7, { at: [x + 5.6, y + 0.85, z], variant: 2, seg: 6 });
  plaque(B, 'fountain', 1.05, 0.76, { at: [x + 5.62, y + 1.9, z], rot: [0, Math.PI / 2, 0], both: true });
  return {
    sparkle: [{ x, y: y + 6.7, z }],
    steam: [{ x, y: y + 8.2, z }],
    // the fizz now sits exactly where the four long jets actually land
    splash: splashes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
function buildBandstand(A, x, z) {
  const { B, world } = A;
  const y = world.height(x, z);
  const R = 3.5;
  B.cyl('licorice', R + 0.3, R + 0.5, 0.55, 8, { at: [x, y + 0.28, z], rot: [0, Math.PI / 8, 0], color: C.licorice });
  B.waffleCyl(R, R, 0.2, 8, { at: [x, y + 0.64, z], rot: [0, Math.PI / 8, 0], color: C.waferPale });
  A.deckRing(x, z, 0, R - 0.1, y + 0.74);
  // steps on the plaza side
  for (let i = 0; i < 2; i++) B.box('matte', 2.0, 0.2, 0.6, { at: [x + 0.6 - i * 0.0, y + 0.18 + i * 0.22, z - R - 0.7 + i * 0.6], color: C.icing });
  // posts + roof
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = x + Math.cos(a) * (R - 0.35), pz = z + Math.sin(a) * (R - 0.35);
    B.cyl('licorice', 0.19, 0.22, 2.9, { at: [px, y + 2.2, pz], color: C.licorice });
    B.sph('gloss', 0.24, 6, 5, { at: [px, y + 3.7, pz], color: SPRINKLE[i % SPRINKLE.length] });
    A.collide(px, pz, 0.3);
  }
  B.cyl('licorice', R + 0.35, R + 0.35, 0.2, 8, { at: [x, y + 3.75, z], rot: [0, Math.PI / 8, 0], color: C.licorice });
  B.stripeCyl(0.1, R + 0.5, 1.7, { at: [x, y + 4.7, z], variant: 2, seg: 16, uvOffset: 0 });
  B.sph('gloss', 0.42, 10, 8, { at: [x, y + 5.7, z], color: C.red });
  B.cyl('matte', 0.1, 0.1, 0.6, 6, { at: [x, y + 5.9, z], color: C.licorice });
  // banner
  plaque(B, 'bandstand', 3.4, 1.2, { at: [x, y + 3.15, z - R - 0.22], rot: [0, Math.PI, 0], color: C.licorice });
  B.box('matte', 3.5, 0.12, 0.08, { at: [x, y + 3.78, z - R - 0.18], color: C.licorice });
  // instruments left out overnight
  B.cyl('gloss', 0.6, 0.6, 0.7, 12, { at: [x - 1.0, y + 1.1, z + 0.6], rot: [0, 0.3, 0], color: C.red });
  B.cyl('icing', 0.62, 0.62, 0.06, 12, { at: [x - 1.0, y + 1.46, z + 0.6], color: C.cream });
  B.cyl('gloss', 0.34, 0.42, 1.1, 8, { at: [x + 1.1, y + 1.3, z - 0.3], rot: [0.25, 0, 0.2], color: C.yellow });
  bench(B, x + 2.0, y + 0.74, z + 1.6, -2.2, { w: 1.8, A });
  A.mark('bandstand', x, y, z);
  A.readSign('bandstand', x, z + R + 1.4, 3.2, 'Read: Village Band');
}

// ─────────────────────────────────────────────────────────────────────────────
function buildStall(A, x, z, signId, rot, tint) {
  const { B, world } = A;
  const y = world.height(x, z);
  const F = frame(x, y, z, rot);
  B.waffleBox(2.9, 1.05, 1.3, { at: F.p(0, 0.55, 0), rot: [0, rot, 0], color: C.wafer });
  B.box('matte', 3.1, 0.12, 1.5, { at: F.p(0, 1.14, 0), rot: [0, rot, 0], color: C.licorice });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = F.p(sx * 1.45, 0, sz * 0.7);
    B.stripeCyl(0.11, 0.12, 2.6, { at: [p[0], y + 1.3, p[2]], variant: 0, seg: 7 });
  }
  B.stripeBox(3.4, 0.14, 1.9, { at: F.p(0, 2.72, 0.25), rot: [-0.3, rot, 0], variant: 2, axisH: 1.9 });
  plaque(B, signId, 1.5, 1.05, { at: F.p(0, 1.95, 0.74), rot: [0, rot, 0], color: C.wafer });
  // goods on the counter
  const r = A.rng('stall' + signId);
  for (let i = 0; i < 7; i++) {
    const p = F.p(-1.15 + i * 0.38, 0, r.range(-0.35, 0.35));
    const s = r.range(0.13, 0.23);
    B.sph('gloss', s, 8, 6, { at: [p[0], y + 1.2 + s, p[2]], color: i % 2 ? tint : SPRINKLE[i % SPRINKLE.length] });
  }
  B.cyl('gloss', 0.28, 0.28, 0.6, 10, { at: F.p(1.05, 1.5, -0.1), rot: [0, rot, 0], color: tint });
  B.cyl('icing', 0.3, 0.3, 0.1, 10, { at: F.p(1.05, 1.85, -0.1), rot: [0, rot, 0], color: C.icing });
  A.collide(x, z, 1.7);
  const front = F.p(0, 0, 1.9);
  A.readSign(signId, front[0], front[2], 2.4, 'Read the stall sign');
}

// ─────────────────────────────────────────────────────────────────────────────
function stringBunting(A, a, b) {
  if (!a || !b) return;
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len > 16 || len < 3) return;
  const n = Math.max(5, Math.round(len / 1.15));
  const ry = Math.atan2(dx, dz) + Math.PI / 2;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const sag = Math.sin(t * Math.PI) * (len * 0.14);
    A.inst.bunting.push({
      x: a.x + dx * t, y: a.eaveY + (b.eaveY - a.eaveY) * t - sag, z: a.z + dz * t,
      w: 0.5, h: 0.6, ry, ph: i * 0.9, color: SPRINKLE[i % SPRINKLE.length],
    });
  }
}
