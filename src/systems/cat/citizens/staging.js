// ─────────────────────────────────────────────────────────────────────────────
// SOCIAL STAGING — authored scenes, hand-placed like a set dresser.
//
// Left to themselves the cats each stood alone on their own mark with their feet
// together, which read as a shop-window display rather than a town. These scenes
// put them in pairs, trios, queues and huddles on real marks, facing each other,
// sitting on real bench seats, at the hours when it makes sense.
//
// A slot is:
//   { key, x, z, pose, face|faceAt:[x,z], look:'catkey', y?, yOff?, raised?, speed? }
//     y      absolute surface height (bench seats, decks — things world.height
//            knows nothing about). `raised` alone = stand on the floor table
//            height (see FLOORS in citizens.js) and never sink into it.
//     look   whose head the cat turns toward (the partner, not the player).
// Scenes are hour-scoped; outside their hours the normal schedules and the
// island-wide beats (7am sprint, noon sunbathe, 14:00 nap, promenade, watch)
// take over again.
// ─────────────────────────────────────────────────────────────────────────────

// Surfaces the citizens' feet must land on (computed from the builders' own maths):
//   Welcome Plaza bench seat   = ground(78,18)  + 0.14 + 0.66
//   Purrliament bench seat     = ground(152,6)  + 0.14 + 0.66
//   Main Street bench seat     = ground(x,z)    + 0.45 + 0.66
const PLAZA_BENCH_Y = 5.27;
const SQUARE_BENCH_Y = 7.35;
// Purrliament Square's flagstones and the one plinth slab that clears the
// ground (architecture/square.js: paving top = ground+0.20, slab 0 top +0.346).
const SQUARE_PAVE = 6.747;
const SQUARE_STEP = 6.893;
// Muscle Beach: the plank deck is 0.30 above the sand apron the citizens'
// FLOOR_DISCS know about, and the bench pad is 1.32 above the planks.
const GYM_DECK_Y = 6.821;
const GYM_BENCH_Y = 8.141;

export const SCENES = [
  // ── MUSCLE BEACH: the crew is ON the equipment ────────────────────────────
  // Five cats, five different lifts, all of them touching gym furniture the
  // architecture actually built: a seated press on the bench pad, a spotter
  // standing at the squat rack under the loaded barbell, and three more working
  // the open front planks where the afternoon sun and the camera both are.
  // Nobody stands in a straight line on bare sand any more.
  //   deck frame: centre (198,−26), ry 0.1 → world = (198 + lx·.995 + lz·.0998,
  //                                                   −26 − lx·.0998 + lz·.995)
  // ── MUSCLE BEACH: seven cats, seven stations, five different lifts ────────
  //
  // Geometry the staging has to obey: the player CANNOT stand on the plank deck
  // (it is one 22 × 14 box collider), so the game camera is always parked out on
  // the sand at z ≈ −18.5, looking at the deck THROUGH the 16 × 3 MUSCLE BEACH
  // banner — whose lower lip hides everything on the planks for ~6 u behind it.
  // So the named crew works the open sand apron in TWO clusters at different
  // depths, and two gym regulars hold the deck stations for the closer views
  // (cat_citizens_gym / cat_gym_close).
  //
  //   west cluster  — Tiny Gerald attempting the GIANT SAND DUMBBELL (182,−20),
  //                   Brick spotting, both of them entirely serious about it
  //   apron cluster — curl, press and flex spread across three depths in front
  //                   of the banner, each with a dumbbell in each paw
  //   deck stations — a seated press on the BENCH PAD and a lifter at the SQUAT
  //                   RACK, under the loaded barbell
  {
    id: 'gym_beach', hours: [8, 23],
    slots: [
      // — the giant dumbbell, west of the banner post —
      { key: 'gerald', x: 186.8, z: -23.6, pose: 'squat', faceAt: [184.4, -21.0], sink: 1 },
      { key: 'brick', x: 188.6, z: -21.9, pose: 'spot', faceAt: [186.8, -23.6], look: 'gerald', raised: 1 },
      // — the apron in front of the banner, three depths —
      { key: 'chad', x: 193.6, z: -14.3, pose: 'press', face: 0.66, raised: 1 },
      { key: 'biceps', x: 197.1, z: -15.4, pose: 'curl', face: 0.58, raised: 1 },
      { key: 'tank', x: 201.3, z: -13.5, pose: 'flex', face: 0.92, raised: 1 },
      // — the deck: the bench pad and the squat rack —
      { key: 'moose', x: 195.23, z: -28.54, pose: 'press', face: 0.74, y: GYM_BENCH_Y },
      { key: 'pebble', x: 195.13, z: -30.54, pose: 'curl', face: 0.62, look: 'moose', y: GYM_DECK_Y },
    ],
  },

  // ── WELCOME PLAZA: the gossip bench, actually on the bench ────────────────
  // Three on one seat, shoulder to shoulder, heads turned in; one neighbour
  // standing in front pretending not to listen. The plaza's south-west bench is
  // the only one the default camera can see past the lampposts and bunting.
  {
    id: 'gossip_bench', hours: [7, 13.8],
    slots: [
      { key: 'pemberpurr', x: 72.39, z: 21.59, pose: 'gossip', face: -0.873, look: 'doris', y: PLAZA_BENCH_Y },
      { key: 'doris', x: 72.94, z: 22.24, pose: 'sit', face: -0.873, look: 'winnifred', y: PLAZA_BENCH_Y },
      { key: 'winnifred', x: 73.49, z: 22.89, pose: 'gossip', face: -0.873, look: 'doris', y: PLAZA_BENCH_Y },
      { key: 'umbra', x: 74.3, z: 19.9, pose: 'chat', face: 0.85, look: 'doris' },
    ],
  },
  // …and at nap o'clock the same bench, same cats, fast asleep in a row.
  {
    id: 'gossip_bench_nap', hours: [13.8, 15.6],
    slots: [
      { key: 'pemberpurr', x: 72.39, z: 21.59, pose: 'loaf', face: -0.873, y: PLAZA_BENCH_Y },
      { key: 'doris', x: 72.94, z: 22.24, pose: 'sleep', face: -0.873, y: PLAZA_BENCH_Y },
      { key: 'winnifred', x: 73.49, z: 22.89, pose: 'loaf', face: -0.873, y: PLAZA_BENCH_Y },
    ],
  },

  // ── MAIN STREET: Pip busks, two cats stop to listen ──────────────────────
  {
    id: 'busking', hours: [8, 21.5],
    slots: [
      { key: 'pip', x: 116.3, z: 2.9, pose: 'fiddle', face: 0.85 },
      { key: 'dash', x: 114.5, z: 4.3, pose: 'chat', faceAt: [116.3, 2.9], look: 'pip' },
      { key: 'brioche', x: 117.9, z: 4.6, pose: 'stand', faceAt: [116.3, 2.9], look: 'pip' },
    ],
  },
  // ── MAIN STREET AT NOON: the busker draws a crowd, the street gets busy ──
  // Marks sit in the two bands the street props leave clear (z ≈ +3.4…+5.4 in
  // front of the north shopfronts, and z ≈ −4.5…−5.4 outside the Dispensary),
  // which is where the authored busking/queue scenes already stand.
  {
    id: 'main_noon', hours: [10.5, 14.2],
    slots: [
      { key: 'agatha', x: 112.9, z: 4.1, pose: 'sit', faceAt: [116.3, 2.9], look: 'pip' },
      { key: 'jogger', x: 111.4, z: 2.6, pose: 'stand', faceAt: [116.3, 2.9], look: 'pip' },
      { key: 'silas', x: 113.9, z: 5.7, pose: 'chat', faceAt: [116.3, 2.9], look: 'pip' },
      { key: 'velvet', x: 121.9, z: 3.8, pose: 'point', faceAt: [123.5, 6.0] },
      { key: 'persimmon', x: 120.9, z: -5.3, pose: 'queue', faceAt: [119.3, -4.9], look: 'reginald' },
    ],
  },

  // ── THE COMMONS BANDSTAND: "every evening. forever." ─────────────────────
  // The sign promises a concert every evening, so there is one: a conductor on
  // the grass in front of the steps and an audience in a fan round the east
  // side, outside the bandstand's own 6 u collider. The park kittens are
  // already running their ring twenty metres away.
  {
    id: 'commons_band', hours: [16, 19.4],
    slots: [
      { key: 'fennel', x: 151.9, z: -51.6, pose: 'point', faceAt: [145, -53] },
      { key: 'umbra', x: 153.6, z: -55.7, pose: 'sit', faceAt: [145, -53] },
      { key: 'pemberpurr', x: 154.8, z: -52.5, pose: 'sit', faceAt: [145, -53] },
      { key: 'doris', x: 153.3, z: -49.5, pose: 'gossip', faceAt: [145, -53], look: 'winnifred' },
      { key: 'winnifred', x: 151.6, z: -46.9, pose: 'sit', faceAt: [145, -53], look: 'doris' },
      { key: 'skein', x: 149.1, z: -45.0, pose: 'stand', faceAt: [145, -53] },
    ],
  },

  // ── THE CATNIP BED (nature's, ~141,−64): three cats absolutely gone ───────
  // The marks come from ctx.systems.catNature.meta.bed.flopSpots at boot (see
  // `flop` in citizens.js); the x/z here are only the fallback if nature has
  // not published any nests. Ends before the bandstand claims Fennel at 16:00.
  {
    id: 'catnip_bed', hours: [9.5, 15.8],
    slots: [
      { key: 'fennel', x: 137.6, z: -62.2, pose: 'nip', face: 1.2, flop: 0 },
      { key: 'biscuit', x: 141.4, z: -60.4, pose: 'nip', face: 2.7, flop: 1 },
      { key: 'tuna', x: 143.8, z: -64.6, pose: 'nip', face: 4.4, flop: 2 },
    ],
  },

  // ── MAIN STREET: two cats queueing at the Catnip Dispensary ──────────────
  {
    id: 'nip_queue', hours: [9, 13.5],
    slots: [
      { key: 'pawline', x: 117.7, z: -4.5, pose: 'queue', face: 2.30, look: 'reginald' },
      { key: 'reginald', x: 119.3, z: -4.9, pose: 'queue', faceAt: [117.7, -4.5], look: 'pawline' },
    ],
  },
  {
    id: 'nip_queue_pm', hours: [15.6, 19],
    slots: [
      { key: 'pawline', x: 117.7, z: -4.5, pose: 'queue', face: 2.30 },
      { key: 'persimmon', x: 119.3, z: -4.9, pose: 'queue', faceAt: [117.7, -4.5], look: 'pawline' },
    ],
  },
  // ── PURRBUCKS: Mocha behind the counter, three cats in line ──────────────
  {
    id: 'purrbucks_queue', hours: [7, 11.5],
    slots: [
      { key: 'mocha', x: 98.2, z: 3.3, pose: 'work', faceAt: [100.6, 2.4] },
      { key: 'dash', x: 99.7, z: 2.75, pose: 'sip', faceAt: [98.2, 3.3], look: 'mocha' },
      { key: 'reginald', x: 101.1, z: 2.2, pose: 'queue', faceAt: [99.7, 2.75], look: 'dash' },
      { key: 'mittens', x: 102.5, z: 1.65, pose: 'queue', faceAt: [101.1, 2.2] },
    ],
  },
  { id: 'purrbucks_day', hours: [11.5, 21], slots: [{ key: 'mocha', x: 98.2, z: 3.3, pose: 'hold', faceAt: [100.6, 2.4] }] },

  // ── PURRLIAMENT SQUARE: the Mayor holds the floor ────────────────────────
  // On the open flagstones south-east of the statue, where the default camera
  // gets them big and unblocked. The pair is laid out along the camera's
  // horizontal so BOTH read in profile: the Mayor waving, Bramble opposite him.
  {
    id: 'square_speech', hours: [7.5, 20],
    slots: [
      { key: 'mayor', x: 155.4, z: 12.6, pose: 'wave', face: 0.85, look: 'bramble', raised: 1 },
      { key: 'bramble', x: 152.6, z: 15.0, pose: 'point', faceAt: [155.4, 12.6], look: 'mayor', raised: 1 },
      { key: 'quillby', x: 158.2, z: 11.4, pose: 'work', face: -0.35, raised: 1 },
    ],
  },
  // two on the square bench: one keeping watch, one out cold
  {
    id: 'square_bench', hours: [7.5, 19],
    slots: [
      { key: 'oldtom', x: 158.55, z: 20.07, pose: 'sit', face: 0.386, y: SQUARE_BENCH_Y },
      { key: 'marmalade', x: 157.16, z: 20.63, pose: 'loaf', face: 0.386, y: SQUARE_BENCH_Y },
    ],
  },

  // ═══ PURRLIAMENT SQUARE, POPULATED ════════════════════════════════════════
  // Eighteen and a half metres of flagstone had five cats on it. A square is
  // only a square if there is a crowd in it, so here is one, staged in five
  // knots the way a set dresser would: a queue, an argument, a huddle round the
  // monument, three loaves cooking on the warm stone, and a pastry cart.

  // A QUEUE OF SIX curving in from the east and climbing the steps. Each cat
  // faces the back of the next one up the line, so the whole queue reads in
  // three-quarter profile from the game camera instead of as six backs.
  {
    id: 'square_queue', hours: [7.8, 19.5],
    slots: [
      { key: 'bobbin', x: 159.0, z: 3.6, pose: 'queue', faceAt: [157.6, 2.6], look: 'tilly', nudge: 1 },
      { key: 'tilly', x: 157.6, z: 2.6, pose: 'sit', faceAt: [156.3, 1.6], nudge: 1 },
      { key: 'barnaby', x: 156.3, z: 1.6, pose: 'queue', faceAt: [155.1, 0.5], look: 'oats', nudge: 1 },
      { key: 'oats', x: 155.1, z: 0.5, pose: 'chat', faceAt: [156.3, 1.6], look: 'barnaby', nudge: 1 },
      { key: 'maribel', x: 153.9, z: -0.6, pose: 'queue', faceAt: [152.6, -1.6], nudge: 1 },
      { key: 'hugo', x: 152.6, z: -1.6, pose: 'point', faceAt: [152, -6.5], y: SQUARE_STEP },
    ],
  },

  // FOUR ROUND THE MONUMENT, circling the plinth at ~5.4 u, all turned inward.
  // One is pointing at the raised bronze paw; two are disagreeing about it.
  {
    id: 'square_statue', hours: [7.8, 19.5],
    slots: [
      { key: 'clementine', x: 157.0, z: 15.1, pose: 'point', faceAt: [152, 12.8] },
      { key: 'dexter', x: 157.2, z: 10.3, pose: 'chat', faceAt: [155.0, 13.2], look: 'clementine' },
      { key: 'peony', x: 152.9, z: 7.6, pose: 'sit', faceAt: [152, 12.8], look: 'dexter' },
      { key: 'wallace', x: 147.2, z: 10.6, pose: 'stand', faceAt: [152, 12.8] },
    ],
  },

  // TWO ARGUING under one of the EXIT signposts. The signs are placed at
  // runtime on a ring 8–12.5 u out, so these two marks get nudged clear of
  // whatever ended up there (see `nudge` in citizens.js).
  {
    id: 'square_argue', hours: [7.8, 19.5],
    slots: [
      { key: 'horace', x: 160.5, z: 2.0, pose: 'point', faceAt: [161.8, 3.2], look: 'edna', nudge: 1 },
      { key: 'edna', x: 161.8, z: 3.2, pose: 'gossip', faceAt: [160.5, 2.0], look: 'horace', nudge: 1 },
    ],
  },

  // THREE LOAVES on the sunny flagstones west of the monument, just off the
  // road so the visitor has to walk round them. Nobody moves for anybody.
  {
    id: 'square_loaves', hours: [8.5, 18],
    slots: [
      { key: 'pudding', x: 145.2, z: 8.8, pose: 'loaf', face: 1.10 },
      { key: 'crumpet', x: 147.4, z: 7.6, pose: 'sleep', face: 2.05 },
      { key: 'dumpling', x: 143.6, z: 6.6, pose: 'loaf', face: 0.40 },
    ],
  },

  // THE PASTRY CART under the bakery's awning on the square's west edge.
  {
    id: 'square_vendor', hours: [7.8, 19.5],
    slots: [
      { key: 'florentine', x: 142.6, z: -0.9, pose: 'work', faceAt: [143.5, 0.7], look: 'bertie', nudge: 1 },
      { key: 'bertie', x: 143.5, z: 0.7, pose: 'queue', faceAt: [142.6, -0.9], look: 'florentine', nudge: 1 },
    ],
  },

  // ── THE BENCH-PAIR PATTERN, REPEATED ─────────────────────────────────────
  // Two cats side by side on a real seat with their heads turned in is the
  // single staging that reads best at game distance, so Main Street and the
  // Welcome Plaza get one each. `seat: 1` = "this is a bench slat": citizens.js
  // resolves the height from the bench kit's own maths at boot.
  {
    id: 'street_bench', hours: [7.5, 19.4],
    slots: [
      { key: 'nutmeg', x: 122.32, z: -5.05, pose: 'gossip', face: 0, look: 'olive', seat: 1 },
      { key: 'olive', x: 123.68, z: -5.05, pose: 'sit', face: 0, look: 'nutmeg', seat: 1 },
    ],
  },
  {
    id: 'street_pair', hours: [7.5, 19.4],
    slots: [
      { key: 'gilbert', x: 109.6, z: 6.7, pose: 'chat', faceAt: [110.7, 7.3], look: 'june', nudge: 1 },
      { key: 'june', x: 110.7, z: 7.3, pose: 'gossip', faceAt: [109.6, 6.7], look: 'gilbert', nudge: 1 },
    ],
  },
  {
    id: 'plaza_pair', hours: [7.5, 19.4],
    slots: [
      { key: 'rosalind', x: 81.5, z: 15.4, pose: 'point', faceAt: [82.6, 16.2], look: 'clive', nudge: 1 },
      { key: 'clive', x: 82.6, z: 16.2, pose: 'gossip', faceAt: [81.5, 15.4], look: 'rosalind', nudge: 1 },
    ],
  },

  // ── THE NIGHT WATCH: four sitters and two lanterns, out in the street ────
  // On the road itself, under the string lights, facing the visitor — the only
  // place on Main Street the default camera can see past the south-row roofs.
  {
    id: 'night_watch', hours: [19.6, 5.4],
    slots: [
      { key: 'silas', x: 112.2, z: 1.0, pose: 'watch', faceAt: [117, 4.2], lantern: 1 },
      { key: 'umbra', x: 115.6, z: -0.6, pose: 'watch', faceAt: [119, 3.0] },
      { key: 'agatha', x: 119.6, z: 0.2, pose: 'hoist', faceAt: [122.4, 3.5], lantern: 1 },
      { key: 'oldtom', x: 123.4, z: -1.0, pose: 'watch', faceAt: [126, 2.2] },
      { key: 'mittens', x: 109.6, z: 3.2, pose: 'stand', faceAt: [113.7, 3.5] },
    ],
  },
];

/** key → [{ h0, h1, slot }] with faces resolved. */
export function buildStageIndex() {
  const idx = new Map();
  for (const sc of SCENES) {
    const [h0, h1] = sc.hours;
    for (const slot of sc.slots) {
      if (slot.faceAt) slot.face = Math.atan2(slot.faceAt[0] - slot.x, slot.faceAt[1] - slot.z);
      const list = idx.get(slot.key) || [];
      list.push({ h0, h1, scene: sc.id, slot });
      idx.set(slot.key, list);
    }
  }
  return idx;
}

const inWindow = (h, h0, h1) => (h0 <= h1 ? h >= h0 && h < h1 : h >= h0 || h < h1);

/**
 * The plan for a staged cat at hour h, or null if nothing is staged.
 * Staged cats glide onto their mark (props' colliders can't shove them off it)
 * and hold the authored pose and facing.
 */
export function makeStageFn(index) {
  return function stage(cat, h) {
    const list = index.get(cat.key);
    if (!list) return null;
    for (const e of list) {
      if (!inWindow(h, e.h0, e.h1)) continue;
      const s = e.slot;
      return {
        act: 'post', x: s.x, z: s.z, pose: s.pose, face: s.face,
        speed: s.speed ?? 1.8, glide: 1,
        // `raised` forbids the pose from dropping the body below the surface —
        // right for a bench slat, wrong for a squat, which is entirely body-drop.
        raised: !s.sink && (!!s.raised || s.y !== undefined),
        look: s.look, y: s.y, scene: e.scene,
      };
    }
    return null;
  };
}

export default SCENES;
