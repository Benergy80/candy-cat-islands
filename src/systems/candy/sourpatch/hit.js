// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KID — GETTING HIT (wave 2 weapons contract).
//
// sourPatch.hit(kidRef, { weapon, power, from:{x,z}, kind }) lands here. Every
// reaction is cartoon and bloodless; nothing here is ever gory, the worst that
// happens to a Sour Patch Kid is that it becomes a puddle of sugar and sulks
// about it for twenty-five seconds.
//
//   salt shaker  (throw) → SHRIEK, fizz, shrink, sink into a sugar puddle,
//                          respawn at its own front door after 25 s
//   spray bottle /
//   lemon spritzer (spray) → the same melt, but wet: steam, wobble, "TOO SOUR"
//   bat / hammer (melee) → punted in a parabola away from `from` with a star
//                          burst, lands, dizzy 3 s, then flees (day) or goes
//                          straight back to hunting (night)
//   gumball      (throw) → stunned 2 s, wobbling, cross-eyed
//   anything else        → a generic flinch, and no exception
//
// WAVE 3 (Contract C — the new arsenal, matched on the canonical hit names):
//   'cannon'      (jawbreaker cannon) → BIG knockback, a long flight, 4 s dizzy
//   'whip'        (licorice whip)     → stagger: stumbles backwards, arms going
//   'poprocks'    (thrown, AOE)       → fizz panic: pops all over, zig-zags off
//   'gum'         (bubblegum blower)  → stuck to the spot in pink gum for 4 s
//   'marshmallow' (launcher)          → soft bonk, bounces twice, brief daze
//   'boomerang'   (peppermint)        → spins like a top, then a short daze
//   'water'       (water balloon)     → shrinks to fun-size for 9 s and flees
// Contract B: bounce(k, fx, fz, 6) — touching the INVINCIBLE visitor punts a
// kid 6 u away with a puff (never counts toward "gives up"). In a crowded
// plaza "straight away" is often a bench two metres off: the launch picks the
// clearest line (0.75-u probes riding the arc out to 6 u; straight away, then
// ±30…90°, then ±120/150° past the visitor's side, never through him; a high
// lob when hemmed in by pickets), a star punt that still meets a wall slides
// along its face instead of rebounding into the visitor, and a bounced kid
// cannot be bounced again for its flight plus 1.5 s — it used to ping-pong off
// the visitor every 0.6 s, going nowhere. A kid pinned in a fenced corner with
// the visitor standing in the only way out just hops and sees stars.
//
// Night rule: two hits inside 10 seconds and that kid is DONE — it gives up,
// walks home, and stays in for the rest of the night.
//
// WATER (Ben, 2026-09-23): waterMelt(k, x, z, surfaceY, kind, why) — a kid whose
// feet went into the sea, the Chocolate Lake or the syrup river (sourpatch.js
// decides; sourpatch/water.js holds the rule) SLUMPS AND MELTS over 1.6 s:
// arms up, then flattening, leaning over, shrinking and settling into the
// water while it steams and bubbles in its own colour. The pool it leaves is
// sourpatch/puddles.js. It is then 'gone' — the 'gone' clock only runs while
// it is NOT night — and re-forms at its own daytime spot (respawnSpot) after
// WATER_RESPAWN_SEC of day, or at the next dusk, whichever comes first.
// Emits 'sourpatch:melt' { id, i, name, x, z, color, kind, why }.
//
// The reaction owns the kid while it runs: brain(k) returns true and sourpatch
// skips the day/night brain for that kid. Nothing is allocated per frame.
// ─────────────────────────────────────────────────────────────────────────────
import { clamp, damp } from '../../../core/util.js';

export const RESPAWN_SEC = 25;      // sugar puddle → front door
export const SHRINK_SEC = 9;        // water balloon: fun-size for this long
export const WATER_MELT_SEC = 1.6;  // walked into water: slump → pool of liquid
export const WATER_RESPAWN_SEC = 90;  // …back after this much DAYTIME (or at the next dusk)
const SHRINK_TO = 0.55;             // …at this scale
const GRAV = 26;                    // the punt arc's gravity (fly mode)
const GIVEUP_WINDOW = 10;           // hit twice inside this and it goes home
const GIVEUP_HITS = 2;
// launch lines tried, radians off "away": the forward half first; the back
// two pairs only win when the kid is cornered (a fenced front garden) and the
// way out is past the visitor's side — never through him
const BOUNCE_FAN = [0, 0.52, -0.52, 1.05, -1.05, 1.57, -1.57, 2.09, -2.09, 2.62, -2.62];
const BOUNCE_PROBE = 0.75;          // spacing of the clear-line probes (u)
const BOUNCE_CD = 1.5;              // after landing, this long before another star bounce
const BOUNCE_VY = 7.2;              // star punt launch speed…
const BOUNCE_PEAK = BOUNCE_VY * BOUNCE_VY / (2 * GRAV);   // …and the top of its arc (≈ 1 u)
const LOB_VY = 10;                  // cornered (a fenced front garden): a high lob instead…
const LOB_PEAK = LOB_VY * LOB_VY / (2 * GRAV);            // …≈ 1.9 u, over the pickets
const _ln = { run: 0, ux: 0, uz: 0 };

const _o = {};                      // shared particle options bag — never allocate
function bag() { for (const k in _o) delete _o[k]; return _o; }

/** weapon id (+ kind) → reaction. Unknown weapons flinch; nothing throws. */
export function classify(weapon, kind) {
  const w = String(weapon || '').toLowerCase();
  // wave 3 arsenal: exact canonical names first, so 'gum' is not 'gumball'
  switch (w) {
    case 'cannon': case 'jawbreaker_cannon': case 'jawbreaker': case 'jawbreakers': return 'cannon';
    case 'whip': case 'licorice_whip': return 'stagger';
    case 'poprocks': case 'pop_rocks': case 'poprock': return 'panic';
    case 'gum': case 'bubblegum': case 'bubblegum_blower': case 'bubble': return 'stuck';
    case 'marshmallow': case 'marshmallows': case 'marshmallow_launcher': case 'marsh': return 'bounce';
    case 'boomerang': case 'peppermint_boomerang': case 'peppermint': return 'spin';
    case 'water': case 'water_balloon': case 'balloon': case 'balloons': return 'shrink';
    default: break;
  }
  if (w.includes('salt')) return 'dissolve';
  if (w.includes('spray') || w.includes('lemon') || w.includes('spritz') || w.includes('juice')) return 'melt';
  if (w.includes('fire') || w.includes('caramel') || w.includes('flame') || w.includes('torch')) return 'melt';
  if (w.includes('bat') || w.includes('hammer') || w.includes('mallet') || w.includes('club') || w.includes('candy_cane')) return 'bonk';
  if (w.includes('gumball') || w.includes('sling') || w.includes('pebble')) return 'stun';
  if (w.includes('cannon') || w.includes('jawbreaker')) return 'cannon';
  if (w.includes('whip') || w.includes('licorice')) return 'stagger';
  if (w.includes('poprock') || w.includes('pop_rock') || w.includes('fizz')) return 'panic';
  if (w.includes('bubble') || w.includes('gum')) return 'stuck';
  if (w.includes('marsh')) return 'bounce';
  if (w.includes('boomer') || w.includes('peppermint')) return 'spin';
  if (w.includes('water') || w.includes('balloon')) return 'shrink';
  if (kind === 'spray') return 'melt';
  if (kind === 'melee') return 'bonk';
  if (kind === 'throw') return 'stun';
  return 'flinch';
}

/**
 * D = { kids, V, rand, phase(), groundY, canStand(x,z), dist2d, moveTo, faceThing,
 *       say, puff, playerPos(), homeSpot(k), slide(x,z,k) → {x,z,nx,nz}|null,
 *       canFly(x,z,k) — canStand, and not into the side of a bench below its top }
 */
export function createHits(ctx, D) {
  const { kids, V, rand } = D;
  const counts = { dissolve: 0, melt: 0, bonk: 0, stun: 0, flinch: 0,
    cannon: 0, stagger: 0, panic: 0, stuck: 0, bounce: 0, spin: 0, shrink: 0, star: 0 };
  const byWeapon = Object.create(null);
  let total = 0, dissolvedTotal = 0, gaveUpTotal = 0, stomps = 0;
  let waterMelts = 0, waterRespawns = 0;
  const waterWhy = Object.create(null);
  let elapsed = 0;

  const P = () => ctx.systems.particles;
  const line = (pool, k) => pool[(k.lineIdx++) % pool.length];

  // ── particle beats ─────────────────────────────────────────────────────────
  function fizz(k, wet) {
    const o = bag();
    o.x = k.x + (rand() - 0.5) * 0.4; o.y = k.y + 0.55 + rand() * 0.7; o.z = k.z + (rand() - 0.5) * 0.4;
    if (wet) {
      // steam off a melting gummy: a fat column, not a sparkle
      o.shape = 'puff'; o.count = 4; o.color = [0xffffff, 0xeafff2, 0xfdffd6];
      o.speed = 0.5; o.up = 1.8; o.life = 1.3; o.lifeVar = 0.3; o.size = 0.40; o.sizeEnd = 1.15;
      o.gravity = 1.4; o.drag = 1.2; o.spread = 0.4; o.alpha = 0.55; o.fadeOut = 0.6;
      P()?.burst(o);
      const s = bag();
      s.x = o.x; s.y = o.y; s.z = o.z; s.shape = 'sparkle'; s.blend = 'add'; s.count = 2;
      s.color = [0xfdff8a, 0xffffff]; s.speed = 2.0; s.up = 1.0; s.life = 0.45; s.size = 0.5;
      s.sizeEnd = 0.02; s.gravity = -2; s.drag = 2; s.spread = 0.4; s.alpha = 1;
      P()?.burst(s);
      return;
    }
    o.shape = 'sparkle'; o.blend = 'add'; o.count = 6; o.color = [0xffffff, 0xeaf6ff, 0xfff3d8];
    o.speed = 2.8; o.up = 1.2; o.life = 0.55; o.lifeVar = 0.35; o.size = 0.58; o.sizeEnd = 0.02;
    o.gravity = -2.5; o.drag = 2.0; o.spread = 0.55; o.spin = 1.4; o.alpha = 1; o.fadeOut = 0.5;
    P()?.burst(o);
  }

  /** The sugar puddle it leaves behind: flat decals that stick to the ground. */
  function puddle(k) {
    const g = D.groundY(k.x, k.z);
    const o = bag();
    o.x = k.x; o.y = g + 0.14; o.z = k.z; o.count = 14; o.shape = 'soft'; o.flat = true;
    o.ground = 'stick'; o.floorY = g + 0.07;
    o.color = [k.color, 0xffffff, 0xfff0f8]; o.colorEnd = 0xffffff;
    o.speed = 1.5; o.up = 0.55; o.life = 7.5; o.lifeVar = 0.25;
    o.size = 0.5; o.sizeEnd = 0.92; o.sizeVar = 0.35;
    o.gravity = -7; o.drag = 0.6; o.spread = 0.3; o.alpha = 0.8; o.fadeIn = 0.06; o.fadeOut = 0.72;
    P()?.burst(o);
    P()?.ripple(k.x, g + 0.09, k.z, { ringColor: 0xffffff, ringSize: 2.8, ringLife: 1.1 });
  }

  /** BONK. A ring of fat stars, the oldest gag in the book. */
  function bonkStars(k) {
    const o = bag();
    o.x = k.x; o.y = k.y + 1.35 * k.scale; o.z = k.z; o.count = 14;
    o.shape = 'sparkle'; o.blend = 'add';
    o.color = [0xfff2a8, 0xffd23a, 0xffffff, 0xffb43a];
    o.speed = 5.2; o.up = 0.9; o.life = 0.7; o.lifeVar = 0.3;
    o.size = 0.95; o.sizeEnd = 0.05; o.sizeVar = 0.3;
    o.gravity = -3; o.drag = 1.8; o.spread = 0.3; o.spin = 2.4; o.alpha = 1; o.fadeOut = 0.55;
    P()?.burst(o);
  }

  /** The little stars that circle a dizzy head. */
  function dizzyStar(k, a) {
    const o = bag();
    o.x = k.x + Math.cos(a) * 0.52; o.y = k.y + 1.62 * k.scale; o.z = k.z + Math.sin(a) * 0.52;
    o.count = 1; o.shape = 'sparkle'; o.blend = 'add'; o.color = [0xffe27a, 0xfff6c8];
    o.speed = 0.1; o.up = 0.2; o.life = 0.55; o.size = 0.46; o.sizeEnd = 0.05;
    o.gravity = 0.4; o.drag = 1.5; o.spread = 0.05; o.spin = 1.2; o.alpha = 1; o.fadeOut = 0.6;
    P()?.burst(o);
  }

  function impact(k, color, count = 10) {
    const o = bag();
    o.x = k.x; o.y = k.y + 1.0 * k.scale; o.z = k.z; o.count = count;
    o.color = color; o.speed = 3.0; o.up = 0.8; o.life = 0.55; o.size = 0.18;
    o.gravity = -6; o.spread = 0.5; o.alpha = 0.9;
    P()?.burst(o);
  }

  // ── wave 3 particle beats ──────────────────────────────────────────────────
  /** Pop Rocks: tiny multicoloured cracks going off all over the body. */
  function popFizz(k) {
    const o = bag();
    o.x = k.x + (rand() - 0.5) * 0.7; o.y = k.y + 0.15 + rand() * 1.0; o.z = k.z + (rand() - 0.5) * 0.7;
    o.shape = 'sparkle'; o.blend = 'add'; o.count = 3;
    o.color = [0xff4fa0, 0x5fd4ff, 0xffe14a, 0x9bff6a, 0xffffff];
    o.speed = 4.2; o.up = 1.6; o.life = 0.32; o.lifeVar = 0.4; o.size = 0.44; o.sizeEnd = 0.02;
    o.gravity = -6; o.drag = 1.2; o.spread = 0.2; o.spin = 3; o.alpha = 1; o.fadeOut = 0.4;
    P()?.burst(o);
  }
  /** Bubblegum on the ground under the feet. big = the first splat. */
  function gumSplat(k, big) {
    const g = D.groundY(k.x, k.z);
    const o = bag();
    o.x = k.x; o.y = g + 0.12; o.z = k.z; o.count = big ? 9 : 2; o.shape = 'soft'; o.flat = true;
    o.ground = 'stick'; o.floorY = g + 0.06;
    o.color = [0xff6fb8, 0xff9fd2, 0xffc2e2]; o.colorEnd = 0xff9fd2;
    o.speed = big ? 1.1 : 0.2; o.up = 0.3; o.life = big ? 4.3 : 1.0; o.lifeVar = 0.1;
    o.size = big ? 0.6 : 0.55; o.sizeEnd = big ? 0.85 : 0.6; o.sizeVar = 0.25;
    o.gravity = -7; o.drag = 1.0; o.spread = 0.22; o.alpha = 0.95; o.fadeIn = 0.05; o.fadeOut = 0.3;
    P()?.burst(o);
    if (big) {                                   // …and the bubble it came out of, popping on its face
      const b = bag();
      b.x = k.x; b.y = k.y + 1.3 * k.scale; b.z = k.z; b.count = 5; b.shape = 'puff';
      b.color = [0xff8fcb, 0xffc2e2, 0xffffff]; b.speed = 1.8; b.up = 0.6; b.life = 0.5;
      b.size = 0.45; b.sizeEnd = 1.1; b.gravity = 0; b.drag = 2; b.spread = 0.3; b.alpha = 0.85; b.fadeOut = 0.6;
      P()?.burst(b);
    }
  }
  /** Water balloon: blue droplets and a ring on the ground. */
  function splash(k) {
    const o = bag();
    o.x = k.x; o.y = k.y + 1.2 * k.scale; o.z = k.z; o.count = 18;
    o.color = [0x7fd4ff, 0xbfeaff, 0xffffff, 0x4fb4ff]; o.speed = 3.6; o.up = 1.5; o.life = 0.65; o.lifeVar = 0.3;
    o.size = 0.17; o.gravity = -10; o.spread = 0.5; o.alpha = 0.9;
    P()?.burst(o);
    const g = D.groundY(k.x, k.z);
    P()?.ripple?.(k.x, g + 0.09, k.z, { ringColor: 0xbfeaff, ringSize: 2.4, ringLife: 0.8 });
  }
  /** Peppermint swirl round a spinning kid. */
  function swirl(k, a) {
    const o = bag();
    o.x = k.x + Math.cos(a) * 0.75; o.y = k.y + 0.75 * k.scale; o.z = k.z + Math.sin(a) * 0.75;
    o.count = 1; o.shape = 'sparkle'; o.blend = 'add'; o.color = [0xff2d4a, 0xffffff];
    o.speed = 0.6; o.up = 0.4; o.life = 0.4; o.size = 0.5; o.sizeEnd = 0.05;
    o.gravity = 0; o.drag = 1.5; o.spread = 0.05; o.spin = 2; o.alpha = 1; o.fadeOut = 0.5;
    P()?.burst(o);
  }
  /** Marshmallow: a soft white poof. */
  function marshPuff(k, n = 7) {
    const o = bag();
    o.x = k.x; o.y = k.y + 0.9 * k.scale; o.z = k.z; o.count = n; o.shape = 'puff';
    o.color = [0xffffff, 0xfff4fa, 0xffe6f2]; o.speed = 1.8; o.up = 0.5; o.life = 0.6;
    o.size = 0.42; o.sizeEnd = 0.95; o.gravity = 0; o.drag = 2; o.spread = 0.35; o.alpha = 0.85; o.fadeOut = 0.6;
    P()?.burst(o);
  }
  /** Bounced off the invincible visitor: rainbow sparks. */
  function starSpark(k) {
    const o = bag();
    o.x = k.x; o.y = k.y + 1.0 * k.scale; o.z = k.z; o.count = 12; o.shape = 'sparkle'; o.blend = 'add';
    o.color = [0xff5a5a, 0xffc93a, 0xfff36a, 0x6af28a, 0x5ab4ff, 0xc47aff];
    o.speed = 4.6; o.up = 1.0; o.life = 0.6; o.lifeVar = 0.3; o.size = 0.7; o.sizeEnd = 0.04;
    o.gravity = -3; o.drag = 1.8; o.spread = 0.3; o.spin = 2; o.alpha = 1; o.fadeOut = 0.5;
    P()?.burst(o);
  }

  /** Melting in water: steam off the top, bubbles in its own colour at the
   *  water line, and the odd ring spreading out from it. (Colour lists are
   *  built once per kid; nothing here allocates while it fizzes.) */
  const STEAM = [0xffffff, 0xf2fbff];
  const _wr = { ringColor: 0xffffff, ringSize: 1, ringLife: 0.9 };
  const wetCols = (k) => k._wetCols || (k._wetCols = [k.color, 0xffffff, k.color]);
  const splashCols = (k) => k._splashCols || (k._splashCols = [0xffffff, 0xd9f2ff, k.color]);
  function waterFizz(k, h, prog) {
    const o = bag();
    o.x = k.x + (rand() - 0.5) * 0.3; o.y = k.y + (0.9 - 0.5 * prog) * k.scale; o.z = k.z + (rand() - 0.5) * 0.3;
    o.shape = 'puff'; o.count = 2; o.color = STEAM;
    o.speed = 0.4; o.up = 1.6; o.life = 1.0; o.lifeVar = 0.3; o.size = 0.34; o.sizeEnd = 0.95;
    o.gravity = 1.2; o.drag = 1.2; o.spread = 0.3; o.alpha = 0.5; o.fadeOut = 0.6;
    P()?.burst(o);
    const b = bag();
    const a = rand() * 6.28, r = 0.25 + rand() * 0.45;
    b.x = k.x + Math.cos(a) * r; b.y = (Number.isFinite(h.wy) ? h.wy : k.y) + 0.05; b.z = k.z + Math.sin(a) * r;
    b.shape = 'soft'; b.count = 2; b.color = wetCols(k);
    b.speed = 0.5; b.up = 1.3; b.life = 0.5; b.lifeVar = 0.3; b.size = 0.15; b.sizeEnd = 0.22;
    b.gravity = 0.8; b.drag = 2; b.spread = 0.08; b.alpha = 0.9; b.fadeIn = 0.08; b.fadeOut = 0.35;
    P()?.burst(b);
    if (rand() < 0.3) {
      _wr.ringColor = k.color; _wr.ringSize = 1.6 + prog * 1.4; _wr.ringLife = 0.9;
      P()?.ripple?.(k.x, (Number.isFinite(h.wy) ? h.wy : k.y) + 0.03, k.z, _wr);
    }
  }

  /**
   * Its feet went into the water. Returns true if it started melting (false:
   * already a puddle). `why`: 'walk' | 'lunge' | 'flee' | 'panic' | 'fly' | … —
   * how it got there, for the verifier (a hunter must never melt from 'walk').
   */
  function waterMelt(k, wx, wz, surf, kind, why) {
    if (!k || melting(k)) return false;
    const h = enter(k, 'dissolve', WATER_MELT_SEC, { cause: 'water', fx: wx, fz: wz, wy: surf, kind: kind || 'water', why: why || 'walk' });
    h.fizzT = 0; h.puddled = false;
    k.gotHat = false; k.shrinkT = 0;
    D.say(k, line(V.SWIM || V.MELT, k), true);
    k.mouthOpen = 1; k.mouthWide = 1; k.squash = -0.2; k.hop = 0;
    // the splash it made going in
    const o = bag();
    o.x = wx; o.y = (Number.isFinite(surf) ? surf : k.y) + 0.15; o.z = wz; o.count = 16;
    o.color = splashCols(k); o.speed = 3.0; o.up = 1.6; o.life = 0.6; o.lifeVar = 0.3;
    o.size = 0.16; o.gravity = -10; o.spread = 0.35; o.alpha = 0.9;
    P()?.burst(o);
    _wr.ringColor = 0xffffff; _wr.ringSize = 2.4; _wr.ringLife = 0.9;
    P()?.ripple?.(wx, (Number.isFinite(surf) ? surf : k.y) + 0.03, wz, _wr);
    waterMelts++;
    const w = h.why; waterWhy[w] = (waterWhy[w] || 0) + 1;
    ctx.events.emit('sourpatch:melt', { id: k.i, i: k.i, name: k.name, x: wx, z: wz, color: k.color, kind: h.kind, why: h.why });
    // the neighbours back off the edge
    for (const o2 of kids) {
      if (o2 === k || o2.hurt || o2.vis < 0.5 || D.dist2d(o2.x, o2.z, k.x, k.z) > 5) continue;
      if (rand() < 0.5) { o2.squash = -0.18; o2.hopT = 0; }
    }
    return true;
  }

  // ── entering a reaction ────────────────────────────────────────────────────
  function clear(k) {
    k.hurt = null; k.air = 0; k.hurtHead = false;
  }
  function enter(k, mode, dur, extra) {
    const h = { mode, t: 0, dur, cause: '', fx: k.x, fz: k.z, vx: 0, vz: 0, vy: 0, spin: 0, fizzT: 0, said: false,
      dizzy: 0, bounces: 0, turn: 0, head: 0, sx: k.x, sz: k.z, yaw0: k.yaw };
    if (extra) Object.assign(h, extra);
    k.hurt = h; k.air = k.air || 0;
    k.state = 'idle';           // cancel steal/photobomb: they have other problems
    k.gotHat = false;
    return h;
  }

  function resolve(ref) {
    if (ref == null) return null;
    if (typeof ref === 'number') return kids[ref] || null;
    if (typeof ref === 'string') {
      const id = ref.startsWith('sourpatch_') ? Number(ref.slice(10)) : NaN;
      if (Number.isFinite(id)) return kids[id] || null;
      const low = ref.toLowerCase();
      return kids.find((k) => k.name.toLowerCase() === low) || null;
    }
    if (typeof ref === 'object') {
      if (kids.includes(ref)) return ref;
      if (Number.isFinite(ref.i) && kids[ref.i]) return kids[ref.i];
      if (Number.isFinite(ref.ki) && kids[ref.ki]) return kids[ref.ki];   // interaction entry
      if (ref.kid && kids.includes(ref.kid)) return ref.kid;
    }
    return null;
  }

  const melting = (k) => !!k.hurt && (k.hurt.mode === 'dissolve' || k.hurt.mode === 'gone' || k.hurt.mode === 'reform');

  // ── the public hook ────────────────────────────────────────────────────────
  function hit(kidRef, opts) {
    const k = resolve(kidRef);
    if (!k) return false;
    if (melting(k)) return false;                       // already a puddle
    // Already mid-punt: the same blow arriving twice (a stomp that both the
    // weapons system and our own 'player:stomp' listener saw, an area hit that
    // overlaps a melee arc) must not count as a second hit toward giving up.
    if (k.hurt && k.hurt.mode === 'fly' && k.hurt.t < 0.25) {
      return { i: k.i, name: k.name, reaction: 'bonk', weapon: String(opts?.weapon || ''), kind: String(opts?.kind || ''), gaveUp: !!k.gaveUp, streak: k.hitStreak || 0, duplicate: true };
    }
    const o = opts || {};
    const weapon = o.weapon == null ? '' : String(o.weapon);
    const kind = o.kind == null ? '' : String(o.kind);
    const power = Number.isFinite(o.power) ? clamp(o.power, 0.2, 4) : 1;
    const pp = D.playerPos();
    const fx = Number.isFinite(o.from?.x) ? o.from.x : (pp ? pp.x : k.x);
    const fz = Number.isFinite(o.from?.z) ? o.from.z : (pp ? pp.z : k.z + 1);
    const react = classify(weapon, kind);
    const night = D.phase() === 'hunting';

    total++;
    counts[react] = (counts[react] || 0) + 1;
    const wk = weapon || kind || 'unknown';
    byWeapon[wk] = (byWeapon[wk] || 0) + 1;

    // ── "two hits in ten seconds and I'm going home" ───────────────────────
    if (elapsed - (k.lastHitAt ?? -99) <= GIVEUP_WINDOW) k.hitStreak = (k.hitStreak || 0) + 1;
    else k.hitStreak = 1;
    k.lastHitAt = elapsed;
    k.hitsTaken = (k.hitsTaken || 0) + 1;
    let gaveUpNow = false;
    if (night && !k.gaveUp && k.hitStreak >= GIVEUP_HITS && react !== 'dissolve' && react !== 'melt') {
      k.gaveUp = true; gaveUpTotal++; gaveUpNow = true;
    }

    // knock direction: away from the swing
    let ax = k.x - fx, az = k.z - fz;
    const ad = Math.hypot(ax, az) || 1;
    ax /= ad; az /= ad;

    switch (react) {
      case 'dissolve':
      case 'melt': {
        const wet = react === 'melt';
        const h = enter(k, 'dissolve', wet ? 2.0 : 1.6, { cause: wet ? 'spray' : 'salt', fx, fz });
        h.fizzT = 0;
        D.say(k, line(wet ? V.MELT : V.SHRIEK, k), true);
        k.mouthOpen = 1; k.mouthWide = 1; k.squash = -0.22;
        impact(k, wet ? [0xfdff8a, 0xffffff, 0xd8ffe8] : [0xffffff, 0xeaf2ff], 16);
        dissolvedTotal++;
        ctx.events.emit('sourpatch:dissolved', { i: k.i, name: k.name, x: k.x, z: k.z, weapon, cause: h.cause });
        ctx.systems.ui?.toast(wet
          ? 'Sour Patch Kid melted. It\'ll be back. They always come back.'
          : 'Sour Patch Kid dissolved. It\'ll be back. They always come back.', 4.5);
        // the neighbours scatter
        for (const o2 of kids) {
          if (o2 === k || o2.hurt || D.dist2d(o2.x, o2.z, k.x, k.z) > 7) continue;
          if (rand() < 0.6) enter(o2, 'flee', 2.4 + rand() * 1.6, { fx: k.x, fz: k.z });
        }
        break;
      }
      case 'bonk': {
        const sp = 7.2 + power * 2.4;
        const h = enter(k, 'fly', 3.0, { fx, fz });
        h.vx = ax * sp; h.vz = az * sp; h.vy = 6.2 + power * 1.6;
        h.spin = (rand() < 0.5 ? -1 : 1) * (5 + rand() * 3);
        bonkStars(k);
        k.squash = -0.26; k.hop = 0;
        D.say(k, line(V.BONK, k), true);
        ctx.events.emit('sourpatch:bonk', { i: k.i, name: k.name, x: k.x, z: k.z, weapon });
        break;
      }
      case 'stun': {
        enter(k, 'stun', 2.0, { fx, fz });
        k.squash = -0.18;
        impact(k, [0xff6fb0, 0xffd23a, 0xffffff], 12);
        // shoved back a step, not launched
        k.x += ax * 0.45; k.z += az * 0.45;
        D.say(k, line(V.STUN, k), true);
        break;
      }
      // ── wave 3 arsenal ────────────────────────────────────────────────────
      case 'cannon': {                                  // a jawbreaker to the chest
        const sp = 11 + power * 2.2;
        const h = enter(k, 'fly', 4.0, { fx, fz, dizzy: 4.2, cause: 'cannon' });
        h.vx = ax * sp; h.vz = az * sp; h.vy = 8.5 + power * 0.9;
        h.spin = (rand() < 0.5 ? -1 : 1) * (9 + rand() * 4);
        bonkStars(k);
        impact(k, [0xff4f7a, 0xffd23a, 0x7fd4ff, 0xffffff], 20);
        k.squash = -0.28; k.hop = 0;
        D.say(k, line(V.CANNON, k), true);
        ctx.events.emit('sourpatch:bonk', { i: k.i, name: k.name, x: k.x, z: k.z, weapon });
        break;
      }
      case 'stagger': {                                 // licorice whip
        const h = enter(k, 'stagger', 1.25, { fx, fz });
        h.vx = ax; h.vz = az;
        k.squash = -0.16;
        impact(k, [0xd81e3a, 0x3a0a16, 0xff6f86], 10);
        D.say(k, line(V.WHIP, k), true);
        break;
      }
      case 'panic': {                                   // pop rocks
        const h = enter(k, 'panic', 3.2 + rand() * 0.8, { fx, fz });
        h.turn = 0; h.head = Math.atan2(ax, az);
        popFizz(k); popFizz(k);
        D.say(k, line(V.POPROCKS, k));
        break;
      }
      case 'stuck': {                                   // bubblegum
        enter(k, 'stuck', 4.0, { fx, fz, sx: k.x, sz: k.z, yaw0: k.yaw });
        gumSplat(k, true);
        k.squash = -0.22;
        D.say(k, line(V.GUM, k), true);
        break;
      }
      case 'bounce': {                                  // marshmallow
        const sp = 4.6 + power * 1.6;
        const h = enter(k, 'fly', 4.0, { fx, fz, dizzy: 1.3, bounces: 2, cause: 'marshmallow' });
        h.vx = ax * sp; h.vz = az * sp; h.vy = 5.4 + power * 0.8;
        h.spin = (rand() < 0.5 ? -1 : 1) * (2 + rand() * 2);
        marshPuff(k, 9);
        k.squash = -0.3; k.hop = 0;
        D.say(k, line(V.MARSH, k), true);
        break;
      }
      case 'spin': {                                    // peppermint boomerang
        const h = enter(k, 'spin', 1.7, { fx, fz });
        h.spin = (rand() < 0.5 ? -1 : 1) * (20 + power * 3);
        swirl(k, 0); swirl(k, Math.PI);
        k.squash = -0.14;
        D.say(k, line(V.SPIN, k), true);
        break;
      }
      case 'shrink': {                                  // water balloon
        k.shrinkT = SHRINK_SEC;
        splash(k);
        enter(k, 'flee', night ? 1.6 : 3.6, { fx, fz, cause: 'water' });
        k.squash = -0.24;
        D.say(k, line(V.WATER, k), true);
        break;
      }
      default: {
        enter(k, 'flinch', 0.6, { fx, fz });
        k.squash = -0.14;
        D.puff(k, 6, 1.1);
        D.say(k, line(V.FLINCH, k));
        break;
      }
    }

    if (gaveUpNow) {
      D.say(k, line(V.GIVEUP, k), true);
      ctx.systems.ui?.toast(`${k.name} gives up and goes home. The rest are still hungry.`, 3.5);
      ctx.events.emit('sourpatch:gaveup', { i: k.i, name: k.name });
    }
    ctx.events.emit('sourpatch:hit', { i: k.i, name: k.name, weapon, kind, reaction: react, gaveUp: !!k.gaveUp });
    return { i: k.i, name: k.name, reaction: react, weapon, kind, gaveUp: !!k.gaveUp, streak: k.hitStreak };
  }

  /** A stomp shockwave: everyone inside r gets knocked over and sees stars. */
  function stomp(x, z, r = 6) {
    stomps++;
    let n = 0;
    for (const k of kids) {
      if (melting(k) || k.vis < 0.35) continue;
      const d = D.dist2d(k.x, k.z, x, z);
      if (d > r) continue;
      const f = 1 - d / Math.max(0.5, r);
      let ax = k.x - x, az = k.z - z;
      const ad = Math.hypot(ax, az) || 1; ax /= ad; az /= ad;
      const h = enter(k, 'fly', 3.0, { fx: x, fz: z });
      h.vx = ax * (3.4 + f * 4.5); h.vz = az * (3.4 + f * 4.5); h.vy = 3.6 + f * 3.4;
      h.spin = (rand() < 0.5 ? -1 : 1) * (3 + rand() * 3);
      k.squash = -0.22;
      bonkStars(k);
      n++;
      if (n === 1) D.say(k, line(V.BONK, k), true);
    }
    if (n) ctx.events.emit('sourpatch:stomped', { x, z, r, kids: n });
    return n;
  }

  /** How far a kid can fly along (ux, uz) before the scenery stops it. The
   *  probes ride the arc (peak ≈ 1 u mid-flight), so a bench is cleared in
   *  the middle of the flight but not at take-off or on landing. */
  function clearRun(k, ux, uz, dist, peak) {
    let run = 0;
    for (let s = BOUNCE_PROBE; s <= dist + 1e-3; s += BOUNCE_PROBE) {
      const f = s / dist, x = k.x + ux * s, z = k.z + uz * s;
      const ok = D.canFly ? D.canFly(x, z, k, k.groundY + 4 * peak * f * (1 - f)) : D.canStand(x, z, k);
      if (!ok) break;
      run = s;
    }
    return run;
  }
  /** The clearest launch line for an arc of this peak → _ln. Straight away
   *  first; off-axis must be clearly longer to win (a 6-u run at 90° beats
   *  4.5 u straight, 5 u does not); a back line never passes through him. */
  function bestLine(k, fx, fz, a0, keep, dist, peak) {
    let best = -1e9;
    _ln.run = 0; _ln.ux = Math.sin(a0); _ln.uz = Math.cos(a0);
    for (let i = 0; i < BOUNCE_FAN.length; i++) {
      const da = BOUNCE_FAN[i], ux = Math.sin(a0 + da), uz = Math.cos(a0 + da);
      if (Math.abs(da) > 1.6) {
        const along = (fx - k.x) * ux + (fz - k.z) * uz;
        if (along > 0 && Math.abs((fx - k.x) * uz - (fz - k.z) * ux) < keep) continue;
      }
      const r = clearRun(k, ux, uz, dist, peak);
      const score = r - Math.abs(da) * 0.5;
      if (score > best) { best = score; _ln.run = r; _ln.ux = ux; _ln.uz = uz; }
      if (i === 0 && r >= dist) break;                    // straight away is open: go
    }
    return _ln;
  }
  /**
   * Contract B: a kid touched the INVINCIBLE visitor and is punted up to
   * `dist` u away from (fx, fz) along the clearest line, with a puff. Not a
   * hit: it never counts toward giving up, it does not interrupt a dissolve or
   * a flight already going, and it refuses during the post-landing cooldown.
   */
  function bounce(k, fx, fz, dist = 6) {
    if (!k || melting(k) || k.vis < 0.3) return false;
    if (k.hurt && (k.hurt.mode === 'fly' || k.hurt.mode === 'gone' || k.hurt.mode === 'sulk')) return false;
    if (k.bounceCd > 0) return false;                     // just landed from the last one
    let ax = k.x - fx, az = k.z - fz;
    const ad = Math.hypot(ax, az);
    if (ad < 1e-3) { ax = Math.sin(k.yaw); az = Math.cos(k.yaw); } else { ax /= ad; az /= ad; }
    const a0 = Math.atan2(ax, az);
    const keep = Math.min(0.8, ad * 0.85);                // how close to him a line may pass
    bestLine(k, fx, fz, a0, keep, dist, BOUNCE_PEAK);
    let run = _ln.run, vy = BOUNCE_VY;
    ax = _ln.ux; az = _ln.uz;
    if (run < dist * 0.75) {
      // hemmed in (a front garden, the fountain rim): lob it over the pickets
      bestLine(k, fx, fz, a0, keep, dist, LOB_PEAK);
      if (_ln.run > run + 0.5) { run = _ln.run; vy = LOB_VY; ax = _ln.ux; az = _ln.uz; }
    }
    const fly = Math.min(dist, run);                      // boxed in: straight up and down
    const T = 2 * vy / GRAV, sp = fly / T;                // lands `fly` away on flat ground
    const h = enter(k, 'fly', 3.0, { fx, fz, dizzy: 1.2, cause: 'star' });
    h.vx = ax * sp; h.vz = az * sp; h.vy = vy;
    k.bounceCd = T + BOUNCE_CD;
    h.spin = (rand() < 0.5 ? -1 : 1) * (6 + rand() * 3);
    k.squash = -0.26; k.hop = 0;
    D.puff(k, 12, 0.9);
    starSpark(k);
    counts.star++;
    ctx.events.emit('sourpatch:bounced', { i: k.i, name: k.name, x: k.x, z: k.z });
    return true;
  }

  // ── the reaction brain ─────────────────────────────────────────────────────
  /** Returns true when the reaction owns this kid's movement/pose this frame. */
  function brain(k, dt, t, p, dp) {
    if (k.bounceCd > 0) k.bounceCd -= dt;
    // a kid that has given up walks home the moment nothing else is happening
    if (!k.hurt && k.gaveUp && D.phase() === 'hunting') enter(k, 'gohome', 30);
    // water balloon: fun-size for SHRINK_SEC, whatever else is going on
    if (k.shrinkT > 0) {
      k.shrinkT -= dt;
      k.shrink += (SHRINK_TO - k.shrink) * Math.min(1, dt * 12);
      if (k.shrinkT <= 0) { k.shrinkT = 0; k.squash = -0.24; D.puff(k, 10, 0.5); }
    } else if (k.shrink !== 1) {
      k.shrink += (1 - k.shrink) * Math.min(1, dt * 7);
      if (Math.abs(1 - k.shrink) < 0.003) k.shrink = 1;
    }
    const h = k.hurt;
    if (!h) return false;
    h.t += dt;
    k.hurtHead = false;

    switch (h.mode) {
      // ── fizz, shrink, sink, puddle ──────────────────────────────────────
      case 'dissolve': {
        const prog = clamp(h.t / h.dur, 0, 1);
        if (h.cause === 'water') {
          // IN THE WATER: arms up for a beat, then it slumps — flattens, leans
          // over, shrinks and settles into the water — steaming and bubbling in
          // its own colour while the pool (puddles.js) spreads out from it
          k.moving = 0; k.gaitAmp = 0; k.hurtHead = true;
          k.armMode = prog < 0.4 ? 'up' : 'free';
          k.vis = Math.max(0.02, 1 - prog * (0.35 + 0.63 * prog));
          k.squash = -0.28 * Math.min(1, prog * 1.8); k.squashV = 0;
          k.lean = 0.12 + 0.5 * prog;
          k.air = -0.22 * prog;
          k.crouch = Math.max(k.crouch || 0, 0.5 * prog);
          k.sway = Math.sin(h.t * 19) * 0.3 * (1 - prog);
          k.headRoll = Math.sin(h.t * 15 + 1.1) * 0.34 * (1 - prog * 0.6);
          k.mouthOpen = 0.95 * (1 - prog * 0.5); k.mouthWide = 1;
          k.lookX = Math.sin(h.t * 14) * 0.8; k.lookY = 0.5; k.blink = 0;
          h.fizzT -= dt;
          if (h.fizzT <= 0) { h.fizzT = 0.11; waterFizz(k, h, prog); }
          if (prog >= 1) {
            // a pool of liquid now; the kid itself waits (invisible) at its own spot
            k.vis = 0; k.air = 0; k.squash = 0; k.lean = 0; k.sway = 0;
            const s = D.respawnSpot ? D.respawnSpot(k) : D.homeSpot(k);
            k.x = s.x; k.z = s.z; k.groundY = D.groundY(k.x, k.z); k.y = k.groundY;
            h.mode = 'gone'; h.t = 0; h.dur = WATER_RESPAWN_SEC; h.rx = s.x; h.rz = s.z;
            h.meltPhase = D.phase();
          }
          return true;
        }
        const wet = h.cause === 'spray';
        k.moving = 0; k.gaitAmp = 0; k.armMode = 'up'; k.hurtHead = true;
        k.vis = Math.max(0.02, 1 - prog);                   // shrinks away, evenly
        k.air = -0.34 * prog * prog;                        // and sinks in
        k.mouthOpen = 0.9; k.mouthWide = 1; k.lean = 0.05;
        const wob = (wet ? 26 : 32) * (1 - prog * 0.5);
        k.sway = Math.sin(h.t * wob) * 0.34 * (1 - prog * 0.4);
        k.headRoll = Math.sin(h.t * wob + 1.1) * 0.36 * (1 - prog * 0.4);
        k.lookX = Math.sin(h.t * 17) * 0.8; k.lookY = 0.4;
        k.blink = 0;
        h.fizzT -= dt;
        if (h.fizzT <= 0) { h.fizzT = wet ? 0.10 : 0.07; fizz(k, wet); }
        if (prog >= 1) {
          puddle(k);
          k.vis = 0; k.air = 0;
          const home = D.homeSpot(k);
          k.x = home.x; k.z = home.z; k.groundY = D.groundY(k.x, k.z); k.y = k.groundY;
          h.mode = 'gone'; h.t = 0; h.dur = Math.max(1, RESPAWN_SEC - h.dur);
        }
        return true;
      }
      // ── twenty-five seconds of being a puddle ───────────────────────────
      case 'gone': {
        k.vis = 0; k.moving = 0; k.gaitAmp = 0; k.air = 0; k.hurtHead = true;
        let back = h.t >= h.dur;
        if (h.cause === 'water') {
          // melted in water: gone for the rest of the night; back after
          // WATER_RESPAWN_SEC of daytime, or at the next dusk
          const ph = D.phase();
          if (ph === 'hunting') h.t -= dt;
          k.x = h.rx; k.z = h.rz;
          back = ph !== 'hunting' && (h.t >= h.dur || (ph === 'watching' && h.meltPhase !== 'watching'));
          if (back) waterRespawns++;
        } else {
          const home = D.homeSpot(k);
          k.x = home.x; k.z = home.z;
        }
        if (back) {
          h.mode = 'reform'; h.t = 0; h.dur = 0.9;
          k.yaw = k.desYaw = Math.atan2(p.x - k.x, p.z - k.z);
          k.squash = -0.24; k.hopT = 0;
          D.puff(k, 14, 0.9);
          const o = bag();
          o.x = k.x; o.y = k.y + 0.8; o.z = k.z; o.count = 12; o.shape = 'sparkle'; o.blend = 'add';
          o.color = [k.color, 0xffffff]; o.speed = 2.6; o.up = 1.2; o.life = 0.8; o.size = 0.6;
          o.sizeEnd = 0.04; o.gravity = -2; o.drag = 1.6; o.spread = 0.4; o.alpha = 1;
          P()?.burst(o);
          ctx.events.emit('sourpatch:respawn', { i: k.i, name: k.name, x: k.x, z: k.z });
        }
        return true;
      }
      case 'reform': {
        k.vis = Math.min(1, h.t / h.dur);
        k.moving = 0; k.gaitAmp = 0; k.armMode = 'up'; k.hurtHead = true;
        k.headRoll = Math.sin(h.t * 9) * 0.2 * (1 - h.t / h.dur);
        k.mouthWide = 0.8;
        if (!h.said && h.t > 0.25) { h.said = true; D.say(k, line(h.cause === 'water' && V.REFORM_WET ? V.REFORM_WET : V.REFORM, k)); }
        if (h.t >= h.dur) { k.vis = 1; clear(k); }
        return true;
      }
      // ── punted across the village ───────────────────────────────────────
      case 'fly': {
        h.vy -= GRAV * dt;
        k.air += h.vy * dt;
        const nx = k.x + h.vx * dt, nz = k.z + h.vz * dt;
        if (D.canFly ? D.canFly(nx, nz, k) : D.canStand(nx, nz, k)) { k.x = nx; k.z = nz; }
        else if (h.cause === 'star') {
          // a star punt never rebounds into the visitor it came off: it slides
          // along the face it hit (or just drops, at the shore or the salt)
          const s = D.slide ? D.slide(nx, nz, k) : null;
          if (s) {
            k.x = s.x; k.z = s.z;
            const vn = h.vx * s.nx + h.vz * s.nz;
            if (vn < 0) { h.vx -= vn * s.nx; h.vz -= vn * s.nz; }
            h.vx *= 0.8; h.vz *= 0.8;
          } else { h.vx = 0; h.vz = 0; }
        }
        else { h.vx *= -0.35; h.vz *= -0.35; }             // bonk off the scenery
        k.yaw += h.spin * dt; k.desYaw = k.yaw;
        k.moving = 0; k.gaitAmp = 0; k.armMode = 'run'; k.lean = 0.55; k.hurtHead = true;
        k.mouthOpen = 0.85; k.mouthWide = 0.9; k.headPitch = -0.25; k.headRoll = 0;
        h.fizzT -= dt;
        if (h.fizzT <= 0) { h.fizzT = 0.07; fizz(k, false); }
        if (k.air <= 0 && h.vy < 0) {
          // marshmallow: boing, boing
          if (h.bounces > 0 && h.vy < -2.5) {
            h.bounces--; k.air = 0; h.vy = -h.vy * 0.52; h.vx *= 0.62; h.vz *= 0.62; h.spin *= 0.6;
            k.squash = -0.3; marshPuff(k, 4);
            return true;
          }
          k.air = 0; k.squash = -0.28; k.hop = 0;
          D.puff(k, 10, 0.25);
          P()?.dust?.(k.x, D.groundY(k.x, k.z) + 0.1, k.z, { count: 8, color: 0xffe9f4, size: 0.4 });
          h.mode = 'dizzy'; h.t = 0; h.dur = h.dizzy > 0 ? h.dizzy : 3.0; h.said = false;
        }
        return true;
      }
      // ── three seconds of seeing stars ───────────────────────────────────
      case 'dizzy': {
        k.moving = 0; k.gaitAmp = 0; k.armMode = 'free'; k.air = 0; k.hurtHead = true;
        k.yaw += dt * 1.3; k.desYaw = k.yaw;
        k.headRoll = Math.sin(h.t * 7) * 0.42;
        k.sway = Math.sin(h.t * 5.4) * 0.26;
        k.lean = damp(k.lean, 0.12, 4, dt);
        k.lookX = Math.sin(h.t * 9) * 0.9; k.lookY = Math.cos(h.t * 7.2) * 0.4;
        k.mouthOpen = 0.35; k.mouthWide = 0.6; k.blink = 0;
        h.fizzT -= dt;
        if (h.fizzT <= 0) { h.fizzT = 0.16; dizzyStar(k, h.t * 4.2); }
        if (!h.said && h.t > 0.8) { h.said = true; D.say(k, line(V.DIZZY, k)); }
        if (h.t >= h.dur) {
          if (D.phase() === 'hunting' && !k.gaveUp) clear(k);           // right, where were we
          else { h.mode = 'flee'; h.t = 0; h.dur = 5.0; }
        }
        return true;
      }
      // ── legging it ──────────────────────────────────────────────────────
      case 'flee': {
        const away = Math.atan2(k.x - h.fx, k.z - h.fz);
        D.moveTo(k, k.x + Math.sin(away) * 8, k.z + Math.cos(away) * 8, 5.4, dt);
        k.armMode = 'run'; k.lean = 0.34; k.gaitAmp = Math.max(k.gaitAmp, 0.9);
        k.mouthOpen = 0.6; k.mouthWide = 0.85; k.air = 0;
        if (h.t >= h.dur) clear(k);
        return true;
      }
      // ── stunned: planted, wobbling, cross-eyed ──────────────────────────
      case 'stun': {
        const f = 1 - clamp(h.t / h.dur, 0, 1);
        k.moving = 0; k.gaitAmp = 0; k.armMode = 'free'; k.air = 0; k.hurtHead = true;
        k.sway = Math.sin(h.t * 13) * 0.28 * f;
        k.headRoll = Math.sin(h.t * 10.5 + 1) * 0.34 * f;
        k.lookX = Math.sin(h.t * 12) * 0.85; k.lookY = Math.sin(h.t * 8) * 0.4;
        k.lean = damp(k.lean, 0.08, 4, dt);
        k.mouthOpen = 0.3 * f; k.mouthWide = 0.5; k.blink = 0;
        if (h.t >= h.dur) {
          if (D.phase() === 'hunting' && !k.gaveUp) clear(k);
          else { h.mode = 'flee'; h.t = 0; h.dur = 3.0; }
        }
        return true;
      }
      // ── a poke with something it doesn't recognise ───────────────────────
      case 'flinch': {
        const f = 1 - clamp(h.t / h.dur, 0, 1);
        k.moving = 0; k.gaitAmp = 0; k.air = 0;
        k.lean = -0.30 * f;                              // recoil
        k.headRoll = Math.sin(h.t * 20) * 0.18 * f;
        k.mouthWide = 0.8; k.armMode = 'up';
        if (h.t >= h.dur) clear(k);
        return true;
      }
      // ── wave 3: licorice whip — stumbling backwards, arms windmilling ─────
      case 'stagger': {
        const f = 1 - clamp(h.t / h.dur, 0, 1);
        const sp = 3.8 * f * f;
        const nx = k.x + h.vx * sp * dt, nz = k.z + h.vz * sp * dt;
        if (D.canStand(nx, nz, k)) { k.x = nx; k.z = nz; }
        k.moving = 0; k.air = 0; k.hurtHead = true; k.armMode = 'up';
        k.gait += dt * 16 * f; k.gaitAmp = 0.9 * f;           // feet scrabbling
        k.lean = -0.42 * f;
        k.sway = Math.sin(h.t * 16) * 0.3 * f;
        k.headRoll = Math.sin(h.t * 12 + 1) * 0.32 * f;
        k.lookX = Math.sin(h.t * 14) * 0.8; k.lookY = 0.2;
        k.mouthOpen = 0.7 * f; k.mouthWide = 0.9; k.blink = 0;
        if (h.t >= h.dur) {
          if (D.phase() === 'hunting' && !k.gaveUp) clear(k);
          else { h.mode = 'flee'; h.t = 0; h.dur = 2.5; }
        }
        return true;
      }
      // ── wave 3: pop rocks — fizzing, popping, zig-zagging in a panic ─────
      case 'panic': {
        h.fizzT -= dt;
        if (h.fizzT <= 0) { h.fizzT = 0.07; popFizz(k); }
        h.turn -= dt;
        if (h.turn <= 0) {
          h.turn = 0.22 + rand() * 0.3;
          h.head = Math.atan2(k.x - h.fx, k.z - h.fz) + (rand() - 0.5) * 2.6;
        }
        D.moveTo(k, k.x + Math.sin(h.head) * 4, k.z + Math.cos(h.head) * 4, 6.6, dt);
        if (k.moving === 0) h.turn = 0;                    // ran into something: new direction
        k.armMode = 'up'; k.lean = 0.2; k.gaitAmp = Math.max(k.gaitAmp, 1); k.air = 0;
        k.hop = Math.abs(Math.sin(h.t * 17)) * 0.22;
        k.mouthOpen = 0.9; k.mouthWide = 1;
        k.lookX = Math.sin(h.t * 23) * 0.9;
        if (h.t >= h.dur) { k.hop = 0; clear(k); }
        return true;
      }
      // ── wave 3: bubblegum — glued to the spot, straining to pull free ────
      case 'stuck': {
        k.x = h.sx; k.z = h.sz;
        k.moving = 0; k.gaitAmp = 0; k.air = 0; k.hurtHead = true;
        const pull = Math.sin(h.t * 5.5);
        k.lean = 0.25 + pull * 0.3;
        k.armMode = pull > 0 ? 'reach' : 'run';
        if (pull > 0.6) k.squash = Math.max(k.squash, 0.12 * pull);    // stretched tall, pulling
        k.desYaw = h.yaw0 + Math.sin(h.t * 2.2) * 0.55; k.yaw = k.desYaw;
        k.sway = Math.sin(h.t * 3.1) * 0.12;
        k.headRoll = Math.sin(h.t * 4) * 0.2;
        k.lookX = Math.sin(h.t * 1.7) * 0.6; k.lookY = -0.6;           // looking down at the gum
        k.mouthOpen = 0.35 + Math.max(0, pull) * 0.3; k.mouthWide = 0.9;
        h.fizzT -= dt;
        if (h.fizzT <= 0) { h.fizzT = 0.45; gumSplat(k, false); }
        if (!h.said && h.t > 1.6) { h.said = true; D.say(k, line(V.GUM, k)); }
        if (h.t >= h.dur) {
          k.squash = -0.26; D.puff(k, 8, 0.3);                        // pop — free
          if (D.phase() === 'hunting' && !k.gaveUp) clear(k);
          else { h.mode = 'flee'; h.t = 0; h.dur = 2.5; }
        }
        return true;
      }
      // ── wave 3: peppermint boomerang — spinning like a top ──────────────
      case 'spin': {
        const f = 1 - clamp(h.t / h.dur, 0, 1);
        k.yaw += h.spin * (0.25 + 0.75 * f) * dt; k.desYaw = k.yaw;
        k.moving = 0; k.gaitAmp = 0; k.air = 0; k.hurtHead = true; k.armMode = 'free';
        k.hop = 0;
        k.lean = 0.05;
        k.headRoll = Math.sin(h.t * 8) * 0.25;
        k.lookX = Math.sin(h.t * 20) * 0.9; k.lookY = 0.3;
        k.mouthOpen = 0.6; k.mouthWide = 1; k.blink = 0;
        h.fizzT -= dt;
        if (h.fizzT <= 0) { h.fizzT = 0.08; swirl(k, h.t * 11); }
        if (h.t >= h.dur) { h.mode = 'dizzy'; h.t = 0; h.dur = 1.6; h.said = false; }
        return true;
      }
      // ── "fine. FINE. i'm going home." ───────────────────────────────────
      case 'gohome': {
        k.armMode = 'free'; k.air = 0; k.lean = 0.1;
        const d = D.moveTo(k, k.home.x, k.home.z, 5.2, dt);
        k.crouch = damp(k.crouch, 0.2, 3, dt);
        if (d < 1.2 || h.t > h.dur) {
          if (k.vis > 0.9) D.puff(k, 10, 0.8);
          k.vis = Math.max(0, k.vis - dt * 2.4);
          k.moving = 0;
          if (k.vis <= 0.01) { h.mode = 'sulk'; h.t = 0; h.dur = 1e9; }
        }
        return true;
      }
      case 'sulk': {
        k.vis = 0; k.moving = 0; k.gaitAmp = 0; k.air = 0; k.hurtHead = true;
        k.x = k.home.x; k.z = k.home.z;
        return true;
      }
      default: clear(k); return false;
    }
  }

  return {
    hit, stomp, bounce, brain, classify, clear, waterMelt,
    melting,
    /** true while it is melting / a pool / reforming because of WATER */
    inWater: (k) => !!k.hurt && k.hurt.cause === 'water',
    resolve,
    /** true while the kid is out of the game (puddle / sulking at home) */
    absent: (k) => !!k.hurt && (k.hurt.mode === 'gone' || k.hurt.mode === 'sulk'),
    tick(dt) { elapsed += dt; },
    /** phase changes wipe the small reactions but never interrupt a dissolve */
    reset(keepMelt = true) {
      for (const k of kids) {
        if (keepMelt && melting(k)) continue;
        if (k.hurt) clear(k);
        k.gaveUp = false; k.hitStreak = 0;
      }
    },
    counters: () => ({
      hits: total, byReaction: { ...counts }, byWeapon: { ...byWeapon },
      dissolved: dissolvedTotal, gaveUp: gaveUpTotal, stomps,
      water: { melts: waterMelts, respawns: waterRespawns, why: { ...waterWhy } },
    }),
  };
}
