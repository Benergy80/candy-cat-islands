// ─────────────────────────────────────────────────────────────────────────────
// WHERE THE THINGS ARE — the authored pickup layout.
// Called once at world:ready (so every builder's colliders exist). `clear(x,z,r)`
// is inventory.js's "is this a sane place to leave a gumdrop" test.
// Every sweet cluster is seeded, so two runs put the same candy in the same
// blades of grass and the screenshots are reproducible.
// ─────────────────────────────────────────────────────────────────────────────
import { rng, hash } from '../../core/util.js';

const CANDY_TINTS = [0xff3355, 0xff8c1a, 0xffe23a, 0x5be27a, 0x3aa8ff, 0xb35bff, 0xff6fae, 0x2fd8c0];
const VARIANTS = ['wrapper', 'lollipop', 'gumdrop', 'wrapper', 'lollipop', 'wrapper', 'gumdrop', 'lollipop'];

// Sweet clusters: [id, x, z, count, radius, spread-bias]
const CLUSTERS = [
  ['village', -138, 45, 9, 17],
  ['meadow', -110, -45, 7, 15],
  ['forest', -192, -14, 7, 16],
  ['lake', -199, 47, 6, 14],
  ['cupcake', -88, -18, 6, 13],
  ['pierpath', -70, 30, 5, 13],
];

// Cat Island: six sweets smuggled into town, hand-placed in the awkward corners.
const CAT_SWEETS = [
  ['cat_mcd', 131.5, -30.5, 'behind Meow Donald\'s bins'],
  ['cat_commons', 144, -53, 'in the catnip'],
  ['cat_harbor', 97, 53.5, 'between the fish crates'],
  ['cat_heights', 175, 44, 'under a hedge on Whisker Heights'],
  ['cat_plaza', 80.5, 13.5, 'in a Welcome Plaza planter'],
  ['cat_yarn', 185.5, -59.5, 'snagged in the yarn'],
];

// ── siting a hero pickup ─────────────────────────────────────────────────────
// Round-2 critique: "the salt gun clipped into a purple gumdrop; the Caramelizer
// sat inside the lighthouse's own shadow." A tool must never be INSIDE or BEHIND
// another prop, and it should stand somewhere the sun reaches and the path sees.
// So instead of one hand-typed coordinate + a blind spiral nudge, each tool now
// names an ANCHOR and we score a ring of candidates around it.

/** Distance from (x,z) to the nearest collider surface. `minR` ignores small ones. */
function clearanceAt(ctx, x, z, minR = 0) {
  let near = 99;
  for (const c of ctx.colliders || []) {
    let d;
    if (c.box) {
      const w = c.w || 1, dd = c.d || 1;
      if (Math.max(w, dd) < minR * 2) continue;
      const ca = Math.cos(c.rot || 0), sa = Math.sin(c.rot || 0);
      const dx = x - c.x, dz = z - c.z;
      const lx = Math.abs(dx * ca + dz * sa) - w / 2;
      const lz = Math.abs(-dx * sa + dz * ca) - dd / 2;
      d = (lx < 0 && lz < 0) ? Math.max(lx, lz) : Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
    } else {
      if ((c.r || 0) < minR) continue;
      d = Math.hypot(x - c.x, z - c.z) - (c.r || 0);
    }
    if (d < near) near = d;
  }
  return near;
}

/** A ring (or several) of candidate spots around an anchor. */
function ring(ax, az, radii, n = 20, a0 = 0) {
  const out = [];
  for (const r of radii) {
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      out.push({ x: ax + Math.cos(a) * r, z: az + Math.sin(a) * r, a, r });
    }
  }
  return out;
}

/**
 * Score candidates and return the winner:
 *   open  — clearance from EVERY prop (must beat `pad`; more is better)
 *   sun   — clearance from BIG props only, the cheap stand-in for "not in a
 *           tower's/boulder's shadow all afternoon"
 *   path  — wants to be ~3–4 u off the licorice, i.e. seen from the road but
 *           not standing in it
 * `bias(c)` lets a caller prefer a side (the front of a door, the sunny side).
 */
function pickSpot(ctx, clear, cands, { pad = 1.4, island = 'candy', bias = null } = {}) {
  const { world } = ctx;
  let best = null;
  for (const c of cands) {
    if (!clear(c.x, c.z, pad)) continue;
    const open = clearanceAt(ctx, c.x, c.z);
    if (open < pad) continue;
    const sun = clearanceAt(ctx, c.x, c.z, 2.0);
    const pd = world.nearestPath(c.x, c.z, island).d;
    // elbow room first, sunlight second, the road third — and a standing pull
    // back toward the anchor so a tool never wanders away from its own story.
    const score = Math.min(open, 4) * 2.0
      + Math.min(sun, 8) * 0.75
      + (pd < 10 ? 1.6 - Math.abs(pd - 3.2) * 0.28 : -0.8)
      - (c.r || 0) * 0.35
      + (bias ? bias(c) : 0);
    if (!best || score > best.score) {
      best = { x: c.x, z: c.z, score, open: +open.toFixed(2), sun: +sun.toFixed(2), path: +pd.toFixed(2) };
    }
  }
  return best;
}

/**
 * @param ctx      game context (colliders + every other system already exist)
 * @param clear    (x, z, r) → boolean: free ground, off the path, out of props
 * @param nudge    (x, z, r) → {x, z} | null: nearest clear spot, spiralling out
 * @returns array of registerPickup specs
 */
export function authorPickups(ctx, clear, nudge) {
  const { world } = ctx;
  const out = [];
  let n = 0;

  // ── sweets: seeded clusters, never on the licorice, never inside a prop ────
  for (const [tag, ax, az, count, rad] of CLUSTERS) {
    const rnd = rng(hash('inv-' + tag));
    let placed = 0;
    for (let tries = 0; tries < count * 40 && placed < count; tries++) {
      // ring-biased so a cluster reads as a scatter around a place, not a blob
      const a = rnd() * Math.PI * 2, d = rad * (0.25 + 0.75 * Math.sqrt(rnd()));
      const x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d;
      if (!clear(x, z, 1.25)) continue;
      if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 3.0)) continue;
      out.push({
        id: `candy_${tag}_${placed}`, x, z, itemId: 'candy', n: 1,
        variant: VARIANTS[(n + placed) % VARIANTS.length],
        tint: CANDY_TINTS[(n * 3 + placed * 5) % CANDY_TINTS.length],
      });
      placed++;
    }
    n += placed;
  }

  // ── six sweets hidden on Cat Island ───────────────────────────────────────
  for (let i = 0; i < CAT_SWEETS.length; i++) {
    const [id, x, z] = CAT_SWEETS[i];
    const p = nudge(x, z, 1.35) || nudge(x, z, 1.0) || { x, z };
    out.push({
      id, x: p.x, z: p.z, itemId: 'candy', n: 1,
      variant: VARIANTS[(i + 2) % VARIANTS.length], tint: CANDY_TINTS[(i * 3 + 1) % CANDY_TINTS.length],
    });
  }

  // ── the tools ─────────────────────────────────────────────────────────────
  const arch = ctx.systems.candyArchitecture;
  const band = arch?.landmarks?.bandstand || { x: -131, z: 53 };
  const booth = arch?.landmarks?.ticket_booth || { x: -45.6, z: 27.4 };

  const sited = [];
  /**
   * `site: { x, z, radii, pad, island, bias }` → score a ring of candidates
   * around the anchor and take the most open, sunniest, most path-visible one.
   * Falls back to the old spiral nudge, then to the literal coordinate.
   */
  const tool = (spec) => {
    if (spec.fixed) { out.push(spec); sited.push([spec.id, spec.x, spec.z, 'fixed']); return; }
    const s = spec.site;
    let p = null, how = 'nudge';
    if (s) {
      const b = pickSpot(ctx, clear, ring(s.x, s.z, s.radii, s.n || 24, s.a0 || 0.13),
        { pad: s.pad ?? 1.4, island: s.island || 'candy', bias: s.bias });
      if (b) { p = b; how = `open ${b.open} sun ${b.sun} path ${b.path}`; }
    }
    if (!p) p = nudge(spec.x, spec.z, 1.4) || nudge(spec.x, spec.z, 1.1) || { x: spec.x, z: spec.z };
    const { site, ...rest } = spec;
    out.push({ ...rest, x: p.x, z: p.z });
    sited.push([spec.id, +p.x.toFixed(1), +p.z.toFixed(1), how]);
  };

  // Salt Shaker — the west end of the ticket booth counter (the booth faces -Z).
  // Far enough along the counter that its prompt beats the booth's own.
  tool({
    id: 'pick_salt', x: booth.x - 2.15, z: booth.z - 1.95, itemId: 'salt', n: 1, fixed: true,
    y: (booth.y ?? world.height(booth.x, booth.z)) + 1.76, r: 2.4,
    label: 'Take the Salt Shaker', where: 'on the Sugar Pier ticket counter',
    say: ['Somebody left a salt shaker on the ticket counter. A card under it: "FOR THE WALK HOME. — the management"'],
  });
  // Salt Gun — a small clear patch BESIDE the SALT LINE sign, on the pier side,
  // where you read the rule and then find the thing that draws it. (Round 2 left
  // it in the grass at -52,30, half inside a purple gumdrop.)
  // -46.2,12.6 is 4.2 u from the sign, on GREEN GRASS: round 2's spot sat on the
  // white salt band itself, where a mint-and-white gun is invisible. Measured:
  // 1.78 u clear of any prop, 4.2 u clear of a big one, open sky, and a clean
  // sight line from all twelve directions.
  tool({
    id: 'pick_saltgun', x: -46.2, z: 12.6, itemId: 'saltgun', n: 1, r: 2.9,
    site: { x: -46.2, z: 12.6, radii: [0, 0.9, 1.8, 2.7], pad: 1.4, island: 'candy' },
    label: 'Take the Salt Gun', where: 'by the SALT LINE sign',
    say: ['A salt gun, dropped in the grass by the SALT LINE sign. The hopper is full. Somebody has been drawing lines out here.'],
  });
  // Candy-Cane Bat — left on the grass beside the village bandstand. Measured
  // best of 80 candidates around it: 3.5 u clear, open sky, seen from 6 of 12.
  // (The old spot was in among the signpost forest and could not be found.)
  tool({
    id: 'pick_bat', x: -127.0, z: 58.5, itemId: 'bat', n: 1, r: 2.9,
    site: { x: -127.0, z: 58.5, radii: [0, 0.9, 1.8, 2.7], pad: 1.4, island: 'candy' },
    label: 'Take the Candy-Cane Bat', where: 'by the village bandstand',
    say: ['The village band leaves a spare candy cane on the grass by the bandstand. It is exactly bat-shaped. This is not an accident.'],
  });
  // Gumball Slingshot — on the steps of the Great Cupcake.
  tool({
    id: 'pick_slingshot', x: -88, z: -12, itemId: 'slingshot', n: 1, r: 2.9,
    site: { x: -88, z: -12, radii: [0.8, 1.8, 2.8], pad: 1.4, island: 'candy' },
    label: 'Take the Gumball Slingshot', where: 'under the Great Cupcake steps',
    say: ['A slingshot and a pocketful of gumballs, hidden under the cupcake steps. Sticky, but loaded.'],
  });
  // Lemon Spritzer — an offering at the Sour Shrine.
  tool({
    id: 'pick_spritzer', x: -215.6, z: -42.2, itemId: 'spritzer', n: 1, r: 2.9,
    site: { x: -215.6, z: -42.2, radii: [0.8, 1.8, 2.8], pad: 1.4, island: 'candy' },
    label: 'Take the Lemon Spritzer', where: 'at the Sour Shrine',
    say: ['An offering at the shrine: one lemon, fitted with a trigger. The sour ones will hate this.'],
  });
  // Spray Bottle — the BACK alley behind the Fish Monger / Catnip Dispensary,
  // where nothing else is competing for the prompt (Rusty sells the tip). An
  // alley is narrow, so this one takes the widest patch it can find in it.
  // 110.5,-17.2 is the alley's one sunlit mouth: 5.7 u clear of anything big and
  // open to the sky, where round 2's spot was walled in and permanently in shade.
  tool({
    id: 'pick_spray', x: 110.5, z: -17.2, itemId: 'spray', n: 1, r: 2.9,
    site: { x: 110.5, z: -17.2, radii: [0, 0.9, 1.8, 2.7], pad: 1.4, island: 'cat' },
    label: 'Take the Spray Bottle',
    say: ['A plain plastic spray bottle, hidden in the alley behind the dispensary. Every cat on Main Street is pretending not to look at it.'],
  });
  // The Caramelizer — on the open lawn at the FOOT OF THE WATCHTOWER STEPS,
  // square on the approach. Round 2 had it at 220,29.4: round the tower's flank,
  // in the tower's own shadow, a tan lump against tan bluff rock.
  // 213,42 measured (raycast from 12 directions): the most SEEN and sunniest
  // square metre on the headland — 2.14 u clear of every prop, 6.0 u clear of
  // any big one, on the open lawn at the foot of the tower steps where the
  // approach looks straight at it. 220,29.4 (round 2) was round the tower's
  // flank; 212,36.6 turned out to be behind the CAT ISLAND billboard.
  tool({
    id: 'pick_caramelizer', x: 213.0, z: 42.0, itemId: 'caramelizer', n: 1, r: 3.2,
    site: { x: 213.0, z: 42.0, radii: [0, 0.9, 1.8, 2.7], pad: 1.4, island: 'cat' },
    label: 'Take the Caramelizer', map: false,          // the secret stays a secret
    say: ['THE CARAMELIZER, left burning at the foot of the tower steps. The keeper uses it for creme brulee, allegedly. The door is scorched black.'],
  });
  // Two fuel cans, hidden badly.
  tool({
    id: 'pick_fuel_gym', x: 202.5, z: -31.5, itemId: 'fuel', n: 1, r: 2.8, label: 'Take the fuel can',
    site: { x: 202.5, z: -31.5, radii: [0.8, 1.8, 2.8], pad: 1.4, island: 'cat' },
  });
  tool({
    id: 'pick_fuel_fling', x: 120.5, z: 75.5, itemId: 'fuel', n: 1, r: 2.8, label: 'Take the fuel can',
    site: { x: 120.5, z: 75.5, radii: [0.8, 1.8, 2.8], pad: 1.4, island: 'cat' },
  });

  // ── WAVE 3 weapons (Contract C) ─────────────────────────────────────────
  // Each one sits where it is USEFUL and where a path can see it: the two
  // anti-Kid heavies on Candyland's approaches, the anti-cat soft stuff on Cat
  // Island's arrival side. Every one gets a map marker (inventory.js).
  const W3 = [
    ['pick_poprocks', 'poprocks', -66.5, 37.5, 'candy', 'Take the Pop Rocks', 'by the Sugar Pier path',
      'A FREE SAMPLE stand for Pop Rocks, abandoned mid-shift. The sign says "DO NOT COMBINE WITH SODA OR CHILDREN."'],
    ['pick_cannon', 'jawbreaker_cannon', -124.5, -48.5, 'candy', 'Take the Jawbreaker Cannon', 'on the Candy Palace approach',
      'The palace salute cannon, loaded with jawbreakers. The plaque reads: "FOR CEREMONIAL USE." It is not ceremonial.'],
    ['pick_whip', 'licorice_whip', -190.5, -7.5, 'candy', 'Take the Licorice Whip', 'on the Gummy Forest path',
      'A licorice whip, hung on a trail sign. The Sour Patch Kids flinch when they walk past it. Good.'],
    ['pick_gum', 'bubblegum_blower', -157.5, 51.5, 'candy', 'Take the Bubblegum Blower', 'in Gumdrop Village',
      'A bubble gun loaded with extra-sticky gum. Anything it hits stays put for a bit.'],
    ['pick_marsh', 'marshmallow_launcher', 86.0, 27.5, 'cat', 'Take the Marshmallow Launcher', 'by the Welcome Plaza',
      'A welcome gift from the Cat Island tourist board, apparently. Soft. Harmless. Extremely bouncy.'],
    ['pick_balloons', 'water_balloon', 106.0, 47.5, 'cat', 'Take the Water Balloons', 'at Fish Harbor',
      'A pail of water balloons behind the fish crates. Every cat on the quay is suddenly very busy elsewhere.'],
    ['pick_boomerang', 'peppermint_boomerang', 150.5, -49.5, 'cat', 'Take the Peppermint Boomerang', 'in Catnip Commons',
      'A peppermint boomerang, lost in the Commons. It keeps coming back. So will you, probably.'],
  ];
  for (const [id, itemId, x, z, island, label, where, line] of W3) {
    tool({
      id, x, z, itemId, n: 1, r: 3.0, label, where, say: [line],
      site: { x, z, radii: [0, 1.2, 2.4, 3.6, 4.8], pad: 1.4, island, bias: (c) => (inBuilding(ctx, c.x, c.z) ? -50 : 0) },
    });
  }

  console.warn('[inventory] tool sites: ' + sited.map((s) => `${s[0]}@${s[1]},${s[2]} (${s[3]})`).join(' · '));

  // ── WAVE 3 ammo caches: >= 30 per island, themed, near where each is useful ─
  const counts = { candy: 0, cat: 0 };
  const cacheLog = [];
  for (const [cid, itemId, ax, az, want, rad, island, label] of CACHES) {
    const rnd = rng(hash('ammo-' + cid));
    const mine = [];
    let spread = rad;
    for (let tries = 0; tries < want * 90 && mine.length < want; tries++) {
      if (tries > 0 && tries % (want * 30) === 0) spread += 3;          // crowded spot: widen the ring
      const a = rnd() * Math.PI * 2, d = spread * (0.2 + 0.8 * Math.sqrt(rnd()));
      const x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d;
      if (world.islandAt(x, z) !== island) continue;
      if (!clear(x, z, 0.9)) continue;
      if (inBuilding(ctx, x, z)) continue;
      if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 2.2)) continue;
      mine.push({ x, z });
      out.push({
        id: `ammo_${cid}_${mine.length}`, x, z, itemId, n: 1,
        cache: { id: cid, x: ax, z: az, itemId, label, island },
      });
    }
    counts[island] += mine.length;
    cacheLog.push(`${cid}:${mine.length}/${want}`);
  }
  console.warn(`[inventory] ammo caches — candy ${counts.candy}, cat ${counts.cat} · ${cacheLog.join(' ')}`);

  return out;
}

// [id, ammo item, x, z, count, radius, island, map label]
const CACHES = [
  // Candyland: Sour Patch country — heavy stuff near the Kids' haunts
  ['c_palace', 'ammo_jawbreakers', -130, -53, 6, 7, 'candy', 'Jawbreakers'],
  ['c_forest', 'ammo_jawbreakers', -187, -25, 5, 7, 'candy', 'Jawbreakers'],
  ['c_meadow', 'ammo_poprocks', -103, -57, 6, 8, 'candy', 'Pop Rocks'],
  ['c_pier', 'ammo_poprocks', -76, 42, 4, 6, 'candy', 'Pop Rocks'],
  ['c_village', 'ammo_gum', -151, 58, 6, 8, 'candy', 'Bubblegum'],
  ['c_cupcake', 'ammo_gumballs', -97, -7, 5, 7, 'candy', 'Gumballs'],
  ['c_pier_salt', 'ammo_salt', -58, 13, 4, 6, 'candy', 'Salt'],
  ['c_lake', 'ammo_marshmallows', -183, 62, 4, 7, 'candy', 'Marshmallows'],
  // Cat Island: soft, wet and bouncy — cats hate water
  ['k_harbor', 'ammo_balloons', 104, 60, 7, 8, 'cat', 'Water balloons'],
  ['k_plaza', 'ammo_marshmallows', 72, 29, 5, 7, 'cat', 'Marshmallows'],
  ['k_commons', 'ammo_marshmallows', 146, -65, 5, 8, 'cat', 'Marshmallows'],
  ['k_commons_b', 'ammo_balloons', 131, -51, 4, 6, 'cat', 'Water balloons'],
  ['k_gym', 'ammo_jawbreakers', 205, -17, 5, 7, 'cat', 'Jawbreakers'],
  ['k_heights', 'ammo_poprocks', 186, 38, 5, 8, 'cat', 'Pop Rocks'],
  ['k_mcd', 'ammo_gum', 139, -37, 4, 6, 'cat', 'Bubblegum'],
  ['k_square', 'ammo_gumballs', 160, 17, 4, 7, 'cat', 'Gumballs'],
];

/** Inside an enterable building's footprint (either island), with a 1 u margin? */
function inBuilding(ctx, x, z) {
  for (const sys of [ctx.systems.catArchitecture, ctx.systems.candyArchitecture]) {
    const rooms = sys?.interiors;
    if (!Array.isArray(rooms)) continue;
    for (const r of rooms) {
      if (!r || typeof r !== 'object' || !Number.isFinite(r.x)) continue;
      const ca = Math.cos(r.rot || 0), sa = Math.sin(r.rot || 0);
      const dx = x - r.x, dz = z - r.z;
      const lx = Math.abs(dx * ca + dz * sa), lz = Math.abs(-dx * sa + dz * ca);
      if (lx < (r.w || 0) / 2 + 1 && lz < (r.d || 0) / 2 + 1) return true;
    }
  }
  return false;
}
