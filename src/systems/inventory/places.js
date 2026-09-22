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
    label: 'Take the Salt Shaker',
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
    label: 'Take the Salt Gun',
    say: ['A salt gun, dropped in the grass by the SALT LINE sign. The hopper is full. Somebody has been drawing lines out here.'],
  });
  // Candy-Cane Bat — left on the grass beside the village bandstand. Measured
  // best of 80 candidates around it: 3.5 u clear, open sky, seen from 6 of 12.
  // (The old spot was in among the signpost forest and could not be found.)
  tool({
    id: 'pick_bat', x: -127.0, z: 58.5, itemId: 'bat', n: 1, r: 2.9,
    site: { x: -127.0, z: 58.5, radii: [0, 0.9, 1.8, 2.7], pad: 1.4, island: 'candy' },
    label: 'Take the Candy-Cane Bat',
    say: ['The village band leaves a spare candy cane on the grass by the bandstand. It is exactly bat-shaped. This is not an accident.'],
  });
  // Gumball Slingshot — on the steps of the Great Cupcake.
  tool({
    id: 'pick_slingshot', x: -88, z: -12, itemId: 'slingshot', n: 1, r: 2.9,
    site: { x: -88, z: -12, radii: [0.8, 1.8, 2.8], pad: 1.4, island: 'candy' },
    label: 'Take the Gumball Slingshot',
    say: ['A slingshot and a pocketful of gumballs, hidden under the cupcake steps. Sticky, but loaded.'],
  });
  // Lemon Spritzer — an offering at the Sour Shrine.
  tool({
    id: 'pick_spritzer', x: -215.6, z: -42.2, itemId: 'spritzer', n: 1, r: 2.9,
    site: { x: -215.6, z: -42.2, radii: [0.8, 1.8, 2.8], pad: 1.4, island: 'candy' },
    label: 'Take the Lemon Spritzer',
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
    label: 'Take the Caramelizer',
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

  console.warn('[inventory] tool sites: ' + sited.map((s) => `${s[0]}@${s[1]},${s[2]} (${s[3]})`).join(' · '));

  return out;
}
