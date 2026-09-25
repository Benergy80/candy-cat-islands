// HANDRAILS (Contract O, "Ramps and handrails") — one helper for every raised
// walk in Candyland and the undersea cave. Ben: "all ramps on or in buildings
// should have handrails to help keep players from falling off."
//
//   railRun(ctx, B, pts, o) → the registry entry for that edge
//
// `pts` is a polyline ALONG a deck edge, [[x, z, y], …], y = the deck surface at
// that vertex; `o.out` (+1 / −1) says which side of the direction of travel is
// the DROP. Each segment is cut into spans of ≤ POST_GAP; every span is
// MEASURED (deck − whatever a walker stepping off would land on, 0.5 u out) and
// only spans whose drop is > MIN_DROP get a rail, unless `o.force`. So a ramp
// grows its rail where it leaves the ground, a stair gets one where it is worth
// falling off, and a stairwell rail leaves itself open exactly where the stair
// arrives (the drop there is one tread).
//
// A built span is: posts at both ends (≈ 1.6 u apart), a top rail at deck +
// RAIL_H, a mid rail when `o.mid` (stairs) — all drawn by `o.style` into the
// SITE'S OWN builder `B` (so they merge into meshes the site already draws:
// +0 draw calls) — and COLLIDERS: thin oriented boxes on the rail line, ≤ 1.2 u
// long, `{ x, z, w, d, rot, box:true, h, rail, deckY, railTop }`:
//   · h = RAIL_SOLID (1e4: SOLID, no top — see below), not a Contract-A
//     relative h: that is measured from the ground under the collider when
//     the spatial hash classifies it, and the candy decks are gated walkables,
//     so under a balcony rail it is the lawn ten units down and the rail would
//     be a knee-high hurdle on the lawn and nothing at all on the balcony;
//   · thin (0.24): solid to every walker, never a step, never a perch;
//   · ≤ 1.2 u long, so the camera's collider pass (r = half-length + 0.5) never
//     counts one as a wall to dolly in front of.
// A collider has no bottom, so a rail over walkable ground (a ramp
// over a plinth, a stairwell over a hall, a balcony over a lawn) would also be
// an invisible wall down there — and, having no top, one up there too, on the
// flight or gallery stacked over it. `o.gate` makes the span's colliders SOLID
// only while the visitor's feet are in a band round the deck (a live getter on
// `solid`, which ground.js reads on every query — the same rule as the Keeper's
// rope in cat/architecture/outskirts.js, without a per-frame update): from GATE
// (2.3) under it — below that the candy deck walkables would lift a walker onto
// the deck anyway (architecture.js: y − py ≤ 2.2), so the rail must stop him
// there too — to ABOVE (3.22: a double jump's apex + a margin, see below) over
// it, or over the highest perch within 1.5 u of it (liftPerchBands, once at
// world:ready) — and, over that, for as long as a jump that left the ground
// inside the band is in the air (gateSolid: the slope case). A rail nobody
// walks under (the shrine's dais rim) is simply not gated.
//
// Everything built is recorded in RAILS (site, edge, drop, spans, colliders):
// tools/_tmp/rails_*.mjs import this module in the page and print the audit.
import { SPRINKLE, C } from './kit.js';

export const RAIL_H = 1.05;        // top rail above the deck
export const POST_GAP = 1.6;       // posts every ≈ 1.6 u
export const MIN_DROP = 1.2;       // rail every edge that drops more than this
export const GATE = 2.3;
// …and stays solid while his feet are up to a double jump over the deck. The
// apex comes from the visitor's own moves (player.js GRAV, JUMP_H, JUMP2_V and
// DECK_LIFT, mirrored here — player.js does not export them; keep in step):
// the first hop's apex + the flip jump kicked from it + the deck clearance =
// 1.6 + 6.6²/34 + 0.035 = 2.92 in the continuous limit. The game integrates at
// the DISPLAY's rate: the harness's 1/30 s step undershoots that (2.77), while
// 120–144 Hz measured 2.96–2.97 on a flat deck and 3.01 on the cupcake ramp
// (the ground follow lags a slope), so a band cut at 2.9 let a 144 Hz double
// jump through the cupcake's mezzanine wall at the bite. APEX_MARGIN covers the
// frame-rate spread with room to spare. The band stays under the cake top over
// the bite (3.3) and the next cupcake flight (3.9); the only floors it reaches
// over a rail — the mezzanine and the lookout gallery, 3.0–3.35 over the last
// flights under them — are floors a DRAWN rail (their stairwell rails) already
// closes at that spot (tools/_tmp/rc_fix2 body_stack.js: 0 exposed points).
const P_GRAV = 17, P_JUMP_H = 1.6, P_JUMP2_V = 6.6, P_DECK_LIFT = 0.035;
export const JUMP_APEX = P_JUMP_H + (P_JUMP2_V * P_JUMP2_V) / (2 * P_GRAV) + P_DECK_LIFT;   // 2.916
const APEX_MARGIN = 0.3;
export const ABOVE = JUMP_APEX + APEX_MARGIN;                                             // 3.216
const MEAS_OUT = 0.5;              // drop is measured this far outside the edge
const COL_T = 0.24;                // collider thickness
const COL_SEG = 1.2;               // longest collider box
const COL_OVER = 0.1;              // (railTop, informational: the rail + this, at least…)
const COL_H = 3.0;                 // (…this far over the deck — about the double-jump apex, JUMP_APEX)
// h ≥ 1e4 is Contract A's third class, SOLID with no top: a rail is not a
// hurdle — nobody vaults it with a stray Space press on a ramp, nobody perches
// on it — and the camera's collider passes read a no-top box as ground + 8
// (camera/density.js topOf) instead of the max(h, g + h) an absolute top turns
// into, which up on the lookout gallery (h ≈ 35, g ≈ 17) walls every sight line.
export const RAIL_SOLID = 1e4;

/** Audit registry — one entry per railRun call (built or not). */
export const RAILS = [];

/**
 * What a walker stepping off at (x, z) lands on, ignoring decks: terrain, or
 * the wading floor where terrain is under the sea / the chocolate lake (the
 * feet stop there: player/ground.js floor = max(h, water − limit)).
 */
export function landingFloor(world) {
  const L = world.LAKE;
  return (x, z) => {
    const h = world.height(x, z);
    if (L) {
      const dx = x - L.x, dz = z - L.z;
      if (dx * dx + dz * dz < (L.r + 8) * (L.r + 8) && h < L.surface) return Math.max(h, L.surface - 0.32);
    }
    return h < 0 ? Math.max(h, -0.85) : h;
  };
}

/** A cylinder from a to b ([x,y,z]) on builder key `key` (or the stripe atlas when key === 'stripe'). */
export function segCyl(B, key, r, a, b, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const hz = Math.hypot(dx, dz), len = Math.hypot(hz, dy);
  if (len < 1e-3) return null;
  const rot = [Math.PI / 2 - Math.atan2(dy, hz), Math.atan2(dx, dz), 0];
  const at = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  // open-ended: the ends always bury themselves in a post or a knob
  if (key === 'stripe') return B.stripeCyl(r, r, len, { at, rot, variant: o.variant || 0, seg: o.seg || 6, open: true });
  return B.cyl(key, r, r, len, o.seg || 6, { at, rot, color: o.color, open: true });
}

// ── material languages ──────────────────────────────────────────────────────
/**
 * CANDY CANE (piers, bridges, the cupcake's ramp and balcony, the lookout):
 * striped posts with a sprinkle knob, a striped top rail, a licorice mid rail.
 * Uses only 'stripe' + 'gloss' + 'licorice' — keys every candy builder that
 * already draws candy canes carries.
 */
export function caneStyle(o = {}) {
  const v = o.variant ?? 0, pr = o.postR ?? 0.1, rr = o.railR ?? 0.075;
  return {
    post(B, x, y, z, h, i) {
      B.stripeCyl(pr, pr * 1.15, h, { at: [x, y + h / 2, z], variant: v, seg: 6 });
      B.ico('gloss', pr * 1.6, 0, { at: [x, y + h + 0.06, z], rot: [0.4, i * 0.7, 0], color: o.knob ?? SPRINKLE[i % SPRINKLE.length] });
    },
    rail(B, a, b, kind) {
      if (kind === 'top') {
        if (o.top === undefined) segCyl(B, 'stripe', rr, a, b, { variant: v });
        else segCyl(B, 'licorice', rr, a, b, { color: o.top, seg: 6 });
      } else segCyl(B, 'licorice', rr * 0.7, a, b, { color: o.mid ?? C.licoriceRed, seg: 5 });
    },
  };
}
/**
 * LICORICE (inside the lookout's wafer cone): licorice balusters with a gumdrop
 * knob and a licorice handrail — the balusters the stair always had, now with
 * something to hold on to. 'licorice' + 'gloss' only.
 */
export function licoriceStyle(o = {}) {
  const col = o.color ?? C.licorice;
  return {
    post(B, x, y, z, h, i) {
      B.cyl('licorice', 0.06, 0.07, h, 5, { at: [x, y + h / 2, z], color: col });
      B.ico('gloss', 0.11, 0, { at: [x, y + h + 0.04, z], color: o.knob ?? SPRINKLE[i % SPRINKLE.length] });
    },
    rail(B, a, b, kind) {
      segCyl(B, 'licorice', kind === 'top' ? 0.07 : 0.045, a, b, { color: kind === 'top' ? (o.rail ?? C.licoriceRed) : col, seg: 5 });
    },
  };
}
/**
 * PIPED ICING (sugar structures: the cupcake's frosting stair and stairwell):
 * fat icing posts with a bead on top, a piped rail. Keys 'icing' + 'gloss'
 * only, which a sub-builder collapses onto its one matte material.
 */
export function icingStyle(o = {}) {
  const pr = o.postR ?? 0.1;
  const a = o.colorA ?? C.icing, b = o.colorB ?? C.icingPink;
  return {
    post(B, x, y, z, h, i) {
      B.cyl('icing', pr, pr * 1.3, h, 6, { at: [x, y + h / 2, z], color: i % 2 ? a : b });
      B.ico('icing', pr * 1.9, 0, { at: [x, y + h + 0.03, z], scale: [1, 0.75, 1], color: b });
    },
    rail(B, p, q, kind) {
      segCyl(B, 'icing', kind === 'top' ? 0.085 : 0.055, p, q, { color: kind === 'top' ? b : a, seg: 6 });
    },
  };
}
/**
 * ROPE AND POSTS (the undersea cave): licorice stakes capped in rock-candy
 * rime, a caramel rope that sags between them (two pieces per span), a second
 * rope lower down on stairs.
 */
export function ropeStyle(o = {}) {
  const rope = o.rope ?? 0xc98a4a, stake = o.stake ?? C.licorice, cap = o.cap ?? 0xeafaff;
  return {
    post(B, x, y, z, h, i) {
      B.cyl('licorice', 0.1, 0.13, h + 0.1, 6, { at: [x, y + (h + 0.1) / 2 - 0.05, z], color: stake });
      B.ico('icing', 0.16, 0, { at: [x, y + h + 0.05, z], scale: [1, 0.7, 1], color: cap });
    },
    rail(B, p, q, kind) {
      const sag = kind === 'top' ? 0.16 : 0.1;
      const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - sag, (p[2] + q[2]) / 2];
      segCyl(B, 'matte', 0.05, p, m, { color: rope, seg: 5 });
      segCyl(B, 'matte', 0.05, m, q, { color: rope, seg: 5 });
    },
  };
}

// ── the run ─────────────────────────────────────────────────────────────────
/**
 * @param ctx   game ctx (colliders, systems.player for the gate)
 * @param B     the site's own builder
 * @param pts   [[x, z, y], …] along the edge (y = deck surface)
 * @param o     { site, edge, out: ±1, style, below(x, z, deckY), gate, mid, force,
 *                open: 'reason' (measure only), lead: spans added at each end of
 *                a built run (leadBack: only at its start), have: [[x,z]] existing
 *                posts to reuse, debug: {} collects the drop samples,
 *                h: rail height (RAIL_H), minDrop, world }
 * @returns the registry entry { site, edge, len, spans, built, dropMax, dropMin, cols }
 */
export function railRun(ctx, B, pts, o = {}) {
  const world = o.world || ctx.world;
  const below = o.below || landingFloor(world);
  const out = o.out ?? 1;
  const H = o.h ?? RAIL_H;
  const minDrop = o.minDrop ?? MIN_DROP;
  const style = o.style || caneStyle();

  // 1 · spans (equal subdivision of each polyline segment)
  const spans = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-3) continue;
    const n = Math.max(1, Math.ceil(len / (o.gap ?? POST_GAP) - 1e-6));
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const nx = uz * out, nz = -ux * out;          // outward normal (right of travel for out = +1)
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const s = {
        a: [ax + (bx - ax) * t0, az + (bz - az) * t0, ay + (by - ay) * t0],
        b: [ax + (bx - ax) * t1, az + (bz - az) * t1, ay + (by - ay) * t1],
        nx, nz, drop: -Infinity, need: false, built: false,
      };
      for (const f of [0.12, 0.5, 0.88]) {
        const x = s.a[0] + (s.b[0] - s.a[0]) * f, z = s.a[1] + (s.b[1] - s.a[1]) * f;
        const y = s.a[2] + (s.b[2] - s.a[2]) * f;
        const d = y - below(x + nx * MEAS_OUT, z + nz * MEAS_OUT, y);
        if (d > s.drop) s.drop = d;
        if (o.debug) (o.debug.samples || (o.debug.samples = [])).push([+(x + nx * MEAS_OUT).toFixed(2), +(z + nz * MEAS_OUT).toFixed(2), +y.toFixed(2), +d.toFixed(2)]);
      }
      s.need = !!o.force || s.drop > minDrop;
      spans.push(s);
    }
  }
  // 2 · which spans to build (lead spans soften the start of a ramp's rail)
  // `leadBack` only extends a run toward the START of the polyline (a ramp's or
  // a stair's foot): its far end is an arrival, and must stay exactly as open as measured.
  const lead = o.lead ?? 0, back = lead, fwd = o.leadBack ? 0 : lead;
  if (!o.open) {
    for (let i = 0; i < spans.length; i++) {
      if (!spans[i].need) continue;
      for (let k = Math.max(0, i - back); k <= Math.min(spans.length - 1, i + fwd); k++) spans[k].built = true;
    }
  }

  // 3 · draw: posts at every end of a built span, rails along it
  const have = o.have || [];
  const posted = [];
  const isHave = (x, z) => have.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 0.5);
  const post = (p, i) => {
    for (const q of posted) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05) return;
    posted.push(p);
    if (!isHave(p[0], p[1]) && !o.noPosts) style.post(B, p[0], p[2], p[1], H, i);
  };
  const entry = {
    site: o.site || '?', edge: o.edge || '?', len: 0, spans: spans.length, built: 0,
    dropMax: -Infinity, dropMin: Infinity, cols: [], gated: !!o.gate, note: o.open || o.note || '',
  };
  let pi = 0;
  for (const s of spans) {
    entry.len += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    if (s.drop > entry.dropMax) entry.dropMax = s.drop;
    if (s.drop < entry.dropMin) entry.dropMin = s.drop;
    if (!s.built) continue;
    entry.built++;
    post(s.a, pi++); post(s.b, pi++);
    const A = [s.a[0], s.a[2] + H, s.a[1]], Bt = [s.b[0], s.b[2] + H, s.b[1]];
    if (!o.noRail) style.rail(B, A, Bt, 'top');
    if (o.mid) style.rail(B, [s.a[0], s.a[2] + H * 0.5, s.a[1]], [s.b[0], s.b[2] + H * 0.5, s.b[1]], 'mid');
    // colliders on the rail line, ≤ COL_SEG long, absolute tops
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const m = Math.max(1, Math.ceil(len / COL_SEG - 1e-6));
    const ux = (s.b[0] - s.a[0]) / len, uz = (s.b[1] - s.a[1]) / len;
    const rot = Math.atan2(-ux, uz);              // ground.js: local z = −dx·sin + dz·cos = along the rail
    for (let k = 0; k < m; k++) {
      const t0 = k / m, t1 = (k + 1) / m, tm = (t0 + t1) / 2;
      const y0 = s.a[2] + (s.b[2] - s.a[2]) * t0, y1 = s.a[2] + (s.b[2] - s.a[2]) * t1;
      const c = {
        x: s.a[0] + (s.b[0] - s.a[0]) * tm, z: s.a[1] + (s.b[1] - s.a[1]) * tm,
        w: COL_T, d: len / m + 0.06, rot, box: true,
        h: RAIL_SOLID,
        rail: entry.site, deckY: Math.max(y0, y1), railTop: Math.max(y0, y1) + Math.max(H + COL_OVER, o.colH ?? COL_H),
      };
      if (o.gate) {
        gateSolid(c, ctx, Math.min(y0, y1) - GATE, Math.max(y0, y1) + ABOVE);
        c.inX = -s.nx; c.inZ = -s.nz;               // the deck side (the perch pass reads it)
        GATED.push(c); hookPerches(ctx);
      }
      ctx.colliders.push(c);
      entry.cols.push(c);
    }
  }
  if (!spans.length) { entry.dropMax = 0; entry.dropMin = 0; }
  if (o.debug) entry.debug = o.debug;
  entry.drops = spans.map((s) => (s.built ? '' : '·') + s.drop.toFixed(1));
  entry.len = +entry.len.toFixed(2);
  RAILS.push(entry);
  return entry;
}

/**
 * Make `c.solid` a LIVE rule: solid while the visitor's feet are in the band
 * (lo, hi) — from GATE under the deck this rail guards to a double jump over
 * it. Under the band he is on the ground the rail stands over; over it he is on
 * a higher flight or deck that happens to share the x,z (stacked stairs, a
 * gallery over the flights below). ground.js reads `solid` on every query, so
 * there is no per-frame bookkeeping; writes are ignored (the rule owns it).
 * The band is read off the collider (gateY, gateTop), so the perch pass below
 * can lift its top.
 *
 * …and while he is OVER the band in a jump that LEFT THE GROUND INSIDE it. A
 * band cut at a fixed height over this collider's deck is only a double jump
 * for a take-off from that deck: on a slope the take-off is higher. Run (or
 * slide along the rail) DOWN the cupcake ramp and double-jump, and the feet
 * pass over the colliders further down at 3.5–4 over THEIR deck — over any
 * fixed band that still leaves a stacked flight free — and he dropped eleven
 * units to the lawn. Nobody standing inside a rail's band has a reason to be
 * carried over its line, so the jump keeps the rail solid until he lands. The
 * take-off comes from the player's own events ('player:jump' carries the feet
 * y, 'player:land' / 'player:teleport' end it): no per-frame work here either.
 */
export function gateSolid(c, ctx, lo, hi = Infinity) {
  let pl = null;
  const air = takeoff(ctx);
  c.gateY = lo; c.gateTop = hi;
  Object.defineProperty(c, 'solid', {
    configurable: true, enumerable: true,
    get() {
      if (!pl) { pl = ctx.systems?.player || null; if (!pl || !pl.position) { pl = null; return true; } }
      const y = pl.position.y, b = c.gateY, t = c.gateTop;
      if (y > b && y < t) return true;
      const y0 = air.y;                                   // NaN on the ground
      return y >= t && y0 > b && y0 < t && !pl.grounded;
    },
    set(v) { void v; },
  });
}

// the feet y where the visitor's current jump left the ground (NaN while he is
// on it), one tracker per game — read by every gated collider's rule above
const TAKEOFF = new WeakMap();
function takeoff(ctx) {
  let a = TAKEOFF.get(ctx);
  if (a) return a;
  a = { y: NaN };
  TAKEOFF.set(ctx, a);
  const ev = ctx.events;
  if (ev?.on) {
    // the first jump (or an auto-hop) sets it; the flip jump keeps it: it is
    // the same flight. A jump pressed after walking off an edge starts from
    // where he is in the air, which is where the event says he is.
    ev.on('player:jump', (d) => { if (d && !d.double && Number.isFinite(d.y)) a.y = d.y; });
    ev.on('player:land', () => { a.y = NaN; });
    ev.on('player:teleport', () => { a.y = NaN; });
  }
  return a;
}

// ── perches: the top of a gated rail's band ──────────────────────────────────
// ABOVE allows for a double jump taken from the DECK. Something standable on
// the deck beside a rail lifts the take-off: from a 0.6-u rock beside the sour
// shrine's rim a double jump peaked 0.1 over the (then 2.9) band, the rail stopped being
// solid under him, and he landed six units past it. So once, at world:ready
// (every system has pushed its colliders by then), each gated rail collider
// looks for standable props within PERCH_R of it whose top is over its deck
// and within a double jump of it, and lifts its band's top to that perch +
// ABOVE. Tops as Contract A publishes them: h ≤ 1.6 stands on whatever is under
// it (this deck, on the deck side of the rail; the ground, outside), 1.6 < h <
// 1e4 is an absolute top. Nothing without a top (no h, h ≥ 1e4: walls, trunks,
// the rails themselves) is a perch.
const PERCH_R = 1.5;
const GATED = [];
/** Audit: every band the perch pass lifted — { site, x, z, deckY, gateTop, perch: [x, z, h, top] }. */
export const PERCHED = [];
const hooked = new WeakSet();
function hookPerches(ctx) {
  if (hooked.has(ctx) || !ctx.events?.on) return;
  hooked.add(ctx);
  ctx.events.on('world:ready', () => { try { liftPerchBands(ctx); } catch (e) { console.warn('[rails] perch pass failed', e); } });
}
export function liftPerchBands(ctx) {
  const world = ctx.world, cols = ctx.colliders || [];
  const cells = new Map(), key = (gx, gz) => gx * 131071 + gz;
  let maxR = 0;
  for (const p of cols) {
    if (!p || p.rail || typeof p.h !== 'number' || !(p.h > 0.02) || !(p.h < 1e4)) continue;
    if (!(Math.abs(p.x) < 5e4 && Math.abs(p.z) < 5e4)) continue;
    if (p.solid === false && !Object.getOwnPropertyDescriptor(p, 'solid')?.get) continue;   // disarmed for good (a live rule may come back)
    const br = p.box ? 0.5 * Math.hypot(p.w || 0, p.d || 0) : (p.r || 0);
    if (!(br > 0) || br > 6) continue;
    if (br > maxR) maxR = br;
    const k = key(Math.floor(p.x / 4), Math.floor(p.z / 4));
    let a = cells.get(k); if (!a) cells.set(k, a = []);
    a.push(p, br);
  }
  for (const g of GATED) {
    const reach = g.d / 2 + PERCH_R, span = Math.ceil((reach + maxR) / 4);
    const gx = Math.floor(g.x / 4), gz = Math.floor(g.z / 4);
    for (let ix = gx - span; ix <= gx + span; ix++) for (let iz = gz - span; iz <= gz + span; iz++) {
      const a = cells.get(key(ix, iz)); if (!a) continue;
      for (let j = 0; j < a.length; j += 2) {
        const p = a[j], br = a[j + 1];
        if (Math.hypot(p.x - g.x, p.z - g.z) - br > reach) continue;
        const ground = world.height(p.x, p.z);
        const onDeck = (p.x - g.x) * g.inX + (p.z - g.z) * g.inZ > 0;
        const top = p.h <= 1.6 ? (onDeck ? Math.max(g.deckY, ground) : ground) + p.h : p.h;
        if (!(top > g.deckY + 0.3 && top < g.deckY + ABOVE)) continue;
        if (top + ABOVE <= g.gateTop) continue;
        g.gateTop = top + ABOVE;
        PERCHED.push({ site: g.rail, x: +g.x.toFixed(2), z: +g.z.toFixed(2), deckY: +g.deckY.toFixed(2), gateTop: +g.gateTop.toFixed(2), perch: [+p.x.toFixed(2), +p.z.toFixed(2), +p.h.toFixed(2), +top.toFixed(2)] });
      }
    }
  }
  return PERCHED.length;
}

/** Points on an arc of radius r round (cx, cz) from angle a0 to a1 (world atan2(dz, dx)), y(a) for the deck. */
export function arcPts(cx, cz, r, a0, a1, y, step = POST_GAP) {
  const n = Math.max(1, Math.ceil((Math.abs(a1 - a0) * r) / step - 1e-6));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, typeof y === 'function' ? y(a, i / n) : y]);
  }
  return pts;
}
