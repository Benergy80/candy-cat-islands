// ─────────────────────────────────────────────────────────────────────────────
// AUTHORED AMBIENT EFFECTS — every one is placed against world.LANDMARKS.
// Each effect is a descriptor with a world anchor, a distance range, a
// time-of-day intensity curve and either a continuous `rate` or a random
// `every:[min,max]` burst timer. Nothing runs unless the player is close enough,
// so the live particle count stays low no matter how many effects exist.
//
// All option bags are allocated once, up front, and mutated in place: the
// per-frame path allocates nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { rng, hash, clamp, smoothstep } from '../../core/util.js';
import { CANDY, CAT } from '../../core/palette.js';

const TAU = Math.PI * 2;

export function createAmbient(ctx, api) {
  // Thin wrapper over the particle API so prime() can inject `age0` into every
  // effect's option bag without each effect having to know about priming.
  let primeFrac = 0;
  // `curFx` is the effect whose emit() is running: every spawn is tallied on it
  // so tools/… probes can see which effects actually produced particles for a
  // given frame instead of guessing from anchor distances.
  let curFx = null;
  const P = {
    one(o) {
      if (curFx) curFx.n++;
      if (primeFrac <= 0) return api.one(o);
      o.age0 = primeFrac; const i = api.one(o); o.age0 = 0; return i;
    },
    ripple(x, y, z, o) { if (curFx) curFx.n++; return api.ripple(x, y, z, o); },
    footprint(x, y, z, a, o) { if (curFx) curFx.n++; return api.footprint(x, y, z, a, o); },
  };
  const world = ctx.world;
  const L = world.LANDMARKS;
  const rnd = rng(hash('ambient-fx'));
  const fx = [];

  const ALWAYS = () => 1;
  const DAY = (s) => s.daylight;
  const NIGHT = (s) => 1 - s.daylight;
  // DARK is NIGHT with a dead zone: everything lamp-shaped (halos, light pools,
  // moths) must be EXACTLY zero in daylight, never a faint disc at noon.
  const DARK = (s) => clamp((0.55 - s.daylight) / 0.42, 0, 1);
  /** 1 inside [a,b] hours, ramping in/out over `fade` hours. */
  const hours = (a, b, fade = 1.0) => (s) => {
    const t = s.time;
    return smoothstep(a - fade, a, t) * (1 - smoothstep(b, b + fade, t));
  };

  function add(def) { def.acc = 0; def.n = 0; def.timer = 0.2 + rnd() * 2; fx.push(def); return def; }
  const h = (x, z) => world.height(x, z);
  /** Channel-wise lerp of two hex colours. Integer math, allocates nothing. */
  function mixHex(a, b, t) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((ar + (br - ar) * t) | 0) * 65536 + ((ag + (bg - ag) * t) | 0) * 256 + ((ab + (bb - ab) * t) | 0);
  }

  // Where the player/camera is looking from, and the point it is looking AT
  // (aim = observer pushed along the view direction) — set once per frame by
  // update(). Field effects sample around the aim point, which is roughly the
  // middle of the screen; sampling around the player wasted most particles
  // behind the camera.
  const obs = { x: 0, z: 0 }, aim = { x: 0, z: 0 };
  let obsX = 0, obsZ = 0, aimX = 0, aimZ = 0;
  // Which island the VIEW is on. Free-camera screenshots (tools/views.json
  // "free": [...]) can leave the player on the other island entirely, and every
  // island-gated effect then reports intensity 0 — which is exactly how the
  // night street ended up with no particles at all.
  const islandNow = () => world.islandAt(obsX, obsZ) || ctx.state.island;
  // Scratch spawn point. pickPoint() returns false when the field does not
  // reach the view at all, so the caller spends nothing instead of filling a
  // landmark disc 80 units off camera (measured: that was ~85% of live
  // particles before this).
  let _sx = 0, _sz = 0;
  function pickPoint(f, spawnR) {
    const ox = aimX - f.x, oz = aimZ - f.z;
    const d0 = Math.hypot(ox, oz);
    if (d0 > f.r + spawnR) return false;
    const rr = f.r * f.r;
    for (let k = 0; k < 4; k++) {
      const a = rnd() * TAU, d = spawnR * Math.sqrt(rnd());
      const x = aimX + Math.cos(a) * d, z = aimZ + Math.sin(a) * d;
      const dx = x - f.x, dz = z - f.z;
      if (dx * dx + dz * dz <= rr) { _sx = x; _sz = z; return true; }
    }
    // fall back to the rim of the field nearest the view, lightly jittered
    const k = f.r * 0.9 / (d0 || 1);
    _sx = f.x + ox * k + (rnd() - 0.5) * 6;
    _sz = f.z + oz * k + (rnd() - 0.5) * 6;
    return true;
  }

  // ── lens hygiene ───────────────────────────────────────────────────────────
  // A 0.3-unit speck three units from the camera is ~60 px of white sitting on
  // the glass: it reads as a dirty lens, not as atmosphere, and it did so in
  // every frame of the round-2 review. NOTHING small and bright is allowed
  // inside LENS_R of ctx.camera — ever, day or night.
  const LENS_R = 6, LENS_R2 = LENS_R * LENS_R;
  function nearLens(x, y, z) {
    const c = ctx.camera.position;
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    return dx * dx + dy * dy + dz * dz < LENS_R2;
  }
  /** Spawn one speck unless it would land on the lens. */
  function speck(o) { if (nearLens(o.x, o.y, o.z)) return false; P.one(o); return true; }
  /** Is it dark enough for a speck to be allowed to GLOW? */
  const glowTime = () => ctx.state.daylight < 0.45;

  // ═══════════════════════════════════════════════════════════════════════════
  // CANDYLAND
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 1. Drifting sugar-dust motes over the meadow + the village ────────────
  // Normal-blended, near-opaque cream specks: additive white washed straight out
  // against Candyland's bright pastel ground in daylight (measured: 28 motes on
  // screen at ~8 px and none of them readable).
  // 'soft' = a procedural radial falloff in the fragment shader (see sSoft in
  // shaders.js): no texture, alpha reaching 0 at the quad edge, so a mote is a
  // fuzzy speck and never a flat axis-aligned chip. sizeVar 0.6 means the field
  // mixes ~0.15 pinpricks with ~0.6 fat flecks instead of one uniform grain.
  // Round-2 fix: this field was pure white at 0.38 across and it read as SNOW on
  // a Mediterranean island (and as dust on the lens up close). It is now ~1/3 as
  // dense, two thirds the size, never white, and tinted to the ground it drifts
  // over: warm cream on Candyland's frosting, green-gold over Cat Island.
  const MOTE_CANDY = [0xffeed2, 0xffe3bd, 0xfff4e2];   // warm cream / butter
  const MOTE_CAT = [0xe7dfa2, 0xd4d489, 0xf0e7c6];     // green-gold pollen
  const moteO = {
    shape: 'soft', blend: 'normal', color: MOTE_CANDY, colorEnd: 0xfff6e6,
    speed: 0.12, lateral: 1, vy: 0.10, vyJitter: 0.10, gravity: 0.02, drag: 0.15,
    life: 8, lifeVar: 0.35, size: 0.26, sizeVar: 0.5, sizeEnd: 0.15,
    alpha: 0.5, fadeIn: 0.22, fadeOut: 0.4, sway: 0.30, swayFreq: 0.55, wind: 0.22,
    x: 0, y: 0, z: 0,
  };
  // Glints alternate between a 4-point twinkle and a plain radial glow, both
  // procedural in the fragment shader (no texture, so SwiftShader matches the
  // browser) and both fading to zero alpha at the quad edge — never a hard chip.
  const moteGlintO = {
    shape: 'sparkle', blend: 'add', color: 0xfff4c8, speed: 0.1, vy: 0.08, gravity: 0,
    drag: 0.4, life: 1.6, lifeVar: 0.4, size: 0.7, sizeVar: 0.55, sizeEnd: 0.05,
    alpha: 0.85, fadeIn: 0.15, fadeOut: 0.6, spin: 0.8, x: 0, y: 0, z: 0,
  };
  function motes(f) {
    if (!pickPoint(f, 26)) return;
    const x = _sx, z = _sz;
    const y = h(x, z) + 0.5 + rnd() * 4.4;
    const cat = world.islandAt(x, z) === 'cat';
    // A mote only GLOWS after dark. In daylight an additive glint on a pastel
    // island is just a hotter white speck — which is exactly what read as snow.
    if (glowTime() && rnd() < 0.3) {
      const twinkle = rnd() < 0.55;
      moteGlintO.shape = twinkle ? 'sparkle' : 'glow';
      moteGlintO.size = twinkle ? 0.5 : 0.38;
      moteGlintO.alpha = twinkle ? 0.7 : 0.55;
      moteGlintO.color = cat ? 0xe4d98e : 0xffe6b4;
      moteGlintO.x = x; moteGlintO.y = y; moteGlintO.z = z;
      speck(moteGlintO);
    } else {
      moteO.color = cat ? MOTE_CAT : MOTE_CANDY;
      moteO.colorEnd = cat ? 0xf2ecd0 : 0xfff6e6;
      moteO.x = x; moteO.y = y; moteO.z = z;
      speck(moteO);
    }
  }
  // a few still hang in the lamplight after dark
  const MOSTLY_DAY = (s) => 0.3 + 0.7 * s.daylight;
  // rate 5, not 16: the two fields together were putting 32 specks/s into every
  // Candyland frame. At 5 each the layer is a drift, not a snowstorm.
  add({ id: 'sugar_motes_meadow', x: L.lollipop_meadow.x, z: L.lollipop_meadow.z, r: 30, range: 72, rate: 5, intensity: MOSTLY_DAY, emit: motes });
  add({ id: 'sugar_motes_village', x: L.candy_village.x, z: L.candy_village.z, r: 32, range: 70, rate: 5, intensity: MOSTLY_DAY, emit: motes });

  // ── 2. Sprinkles raining around The Great Cupcake ─────────────────────────
  const sprinkleO = {
    shape: 'confetti', blend: 'normal', color: CANDY.sprinkle,
    speed: 0.5, lateral: 1, vy: -1.6, vyJitter: 0.8, gravity: -2.2, drag: 0.7,
    life: 6, lifeVar: 0.2, size: 0.15, sizeVar: 0.35, alpha: 1,
    fadeIn: 0.05, fadeOut: 0.15, spin: 6, sway: 0.5, swayFreq: 2.6, wind: 0.35,
    ground: 'kill', x: 0, y: 0, z: 0, floorY: 0,
  };
  add({
    id: 'cupcake_sprinkles', x: L.giant_cupcake.x, z: L.giant_cupcake.z, r: 13, range: 62, rate: 13, intensity: ALWAYS,
    emit(f) {
      const a = rnd() * TAU, d = f.r * Math.sqrt(rnd());
      const x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d;
      sprinkleO.x = x; sprinkleO.z = z;
      sprinkleO.floorY = h(x, z) + 0.05;
      sprinkleO.y = sprinkleO.floorY + 15 + rnd() * 7;
      P.one(sprinkleO);
    },
  });

  // ── 3. Cotton-candy mist over Chocolate Lake (dawn) ───────────────────────
  const mistO = {
    shape: 'puff', blend: 'normal', color: [0xffd2e8, 0xffe9f4, 0xf6e2ff], colorEnd: 0xffffff,
    speed: 0.1, lateral: 1, vy: 0.05, vyJitter: 0.06, gravity: 0.01, drag: 0.25,
    life: 15, lifeVar: 0.3, size: 4.0, sizeVar: 0.4, sizeEnd: 9.5,
    alpha: 0.13, fadeIn: 0.3, fadeOut: 0.45, sway: 0.35, swayFreq: 0.3, wind: 0.55, spin: 0.1,
    x: 0, y: 0, z: 0,
  };
  const dawnMist = (s) => Math.max(hours(4.2, 8.6, 1.4)(s), 0.28 * (1 - s.daylight));
  add({
    id: 'lake_cottoncandy_mist', x: world.LAKE.x, z: world.LAKE.z, r: world.LAKE.r + 3, range: 76, rate: 2.4, intensity: dawnMist,
    emit(f) {
      const a = rnd() * TAU, d = f.r * Math.sqrt(rnd());
      const x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d;
      mistO.x = x; mistO.z = z;
      mistO.y = Math.max(h(x, z), world.LAKE.surface) + 0.5 + rnd() * 1.8;
      P.one(mistO);
    },
  });

  // ── 4. Sparkles on the syrup river ────────────────────────────────────────
  const riverPts = [];
  for (let i = 0; i <= 38; i++) {
    const t = 0.1 + (i / 38) * 0.86;
    const p = world.pointOnPolyline(world.RIVER.points, t);
    const y = h(p.x, p.z);
    if (y > -0.4) riverPts.push(p.x, y + 0.22, p.z);
  }
  const riverO = {
    shape: 'sparkle', blend: 'add', color: [0xffffff, 0xffd9ec, 0xffe9a8],
    speed: 0.25, lateral: 1, vy: 0.25, vyJitter: 0.2, gravity: -0.15, drag: 0.9,
    life: 1.1, lifeVar: 0.4, size: 0.5, sizeVar: 0.45, sizeEnd: 0.05,
    alpha: 0.95, fadeIn: 0.12, fadeOut: 0.55, spin: 0.9, x: 0, y: 0, z: 0,
  };
  add({
    id: 'river_sparkles', x: -126, z: 22, r: 0, range: 1e4, rate: 16, intensity: (s) => 0.25 + 0.75 * s.daylight,
    emit(f) {
      for (let tries = 0; tries < 4; tries++) {
        const i = ((rnd() * (riverPts.length / 3)) | 0) * 3;
        const x = riverPts[i], z = riverPts[i + 2];
        const dx = obsX - x, dz = obsZ - z;
        if (dx * dx + dz * dz < 3600) {
          riverO.x = x + (rnd() - 0.5) * world.RIVER.width * 0.8;
          riverO.y = riverPts[i + 1];
          riverO.z = z + (rnd() - 0.5) * world.RIVER.width * 0.8;
          speck(riverO); return;
        }
      }
    },
  });

  // ── 5. Gummy Forest fireflies (night) ─────────────────────────────────────
  const fireflyO = {
    shape: 'soft', blend: 'add', color: [CANDY.gummyGreen, CANDY.gummyBlue, CANDY.gummyPurple, 0xaaffdd],
    speed: 0.3, lateral: 1, vy: 0.06, vyJitter: 0.16, gravity: 0, drag: 0.5,
    life: 5.5, lifeVar: 0.4, size: 0.72, sizeVar: 0.45, sizeEnd: 0.42,
    alpha: 1, fadeIn: 0.15, fadeOut: 0.35, sway: 0.85, swayFreq: 1.5, flicker: true,
    x: 0, y: 0, z: 0,
  };
  // The insect itself: a small hot core inside the soft glow, so a firefly is a
  // bug with a lit abdomen instead of a vague green ground-glow.
  // Hot core: near-white, tiny, and it OUTLIVES nothing — it is re-lit every
  // 1.5 s inside the long-lived glow, so a firefly reads as a bug with a lit
  // abdomen (2–3 px of white in a 10 px green halo) instead of a soft blob.
  // Round-3 fix: at 0.16 → 0.05 units this core measured 2 px across at the game
  // camera and 1 px past 60 units — 121 of them live at once, every one of them
  // a hard little speck rather than a light. Half as many, twice as wide, so a
  // core is always a readable round bead inside its halo.
  const fireflyCoreO = {
    shape: 'glow', blend: 'add', color: 0xfaffee, speed: 0.1, vy: 0.05, gravity: 0, drag: 0.5,
    life: 1.7, lifeVar: 0.45, size: 0.32, sizeVar: 0.25, sizeEnd: 0.15,
    alpha: 1, fadeIn: 0.1, fadeOut: 0.4, flicker: true, x: 0, y: 0, z: 0,
  };
  function firefly(f, spawnR, lowY) {
    if (spawnR && !pickPoint(f, spawnR)) return;
    const x = _sx, z = _sz, y = h(x, z) + lowY + rnd() * 1.7;   // 0.5–2.2 above ground
    fireflyO.x = x; fireflyO.z = z; fireflyO.y = y;
    if (!speck(fireflyO)) return;              // never a green blob on the lens
    if (rnd() < 0.45) { fireflyCoreO.x = x; fireflyCoreO.y = y; fireflyCoreO.z = z; P.one(fireflyCoreO); }
  }
  add({
    id: 'forest_fireflies', x: L.gummy_forest.x, z: L.gummy_forest.z, r: 44, range: 84, rate: 26,
    primeSec: 5.5, intensity: NIGHT,
    emit(f) { firefly(f, 28, 0.5); },
  });
  // ...and a thin scatter of them anywhere in Candyland after dark, so the
  // village edge is never a dead black field
  add({
    id: 'candy_night_fireflies', follow: true, x: 0, z: 0, r: 0, range: 1e4, rate: 8, primeSec: 5.5,
    intensity: (s) => (islandNow() === 'candy' ? Math.max(0, 1 - s.daylight * 1.6) : 0),
    emit() {
      const a = rnd() * TAU, d = 5 + rnd() * 22;
      const x = aimX + Math.cos(a) * d, z = aimZ + Math.sin(a) * d;
      if (h(x, z) < 0.3) return;
      _sx = x; _sz = z;
      firefly(null, 0, 0.5);
    },
  });

  // ── 6. Chimney smoke over Gumdrop Village ─────────────────────────────────
  // Uses candyArchitecture.chimneys if that builder publishes them; otherwise a
  // hand-placed ring of house roofs around the village core (-140, 40).
  const FALLBACK_CHIMNEYS = [[-130.1, 49.9], [-149.9, 49.9], [-154.0, 40.0], [-149.9, 30.1], [-130.1, 30.1], [-140.0, 26.0]];
  let chimneys = null;
  function resolveChimneys() {
    const pub = ctx.systems.candyArchitecture?.chimneys;
    const out = [];
    if (Array.isArray(pub) && pub.length) {
      for (const c of pub) {
        const x = c.x ?? c[0], z = c.z ?? c[2] ?? c[1];
        const y = c.y ?? (h(x, z) + 6.5);
        out.push(x, y, z);
      }
    } else {
      for (const [x, z] of FALLBACK_CHIMNEYS) out.push(x, h(x, z) + 6.4, z);
    }
    return out;
  }
  // ROUND-3: a plume is 3–5 DISCRETE puffs, not a column of mist. The old bag
  // put ~13 thin puffs/second into one stack: they overlapped from the mouth
  // upwards and read as a single grey smear. The rule that makes puffs read as
  // puffs is spacing > diameter at birth: at vy 1.3 and 0.7 puffs/second per
  // stack they are born 1.9 units apart and start 1.8 units wide, so you can
  // count them off the roof; by the time they have swollen to 3 units they have
  // also faded, so they merge into haze on the way out instead of at the mouth.
  const smokeO = {
    shape: 'puff', blend: 'normal', color: 0xe3ded4, colorEnd: 0xfffaf0,
    speed: 0.16, lateral: 1, vy: 1.3, vyJitter: 0.22, gravity: 0.26, drag: 0.35,
    life: 5.4, lifeVar: 0.14, size: 0.9, sizeVar: 0.16, sizeEnd: 3.0,
    alpha: 0.62, fadeIn: 0.1, fadeOut: 0.46, spin: 0.3, sway: 0.22, swayFreq: 0.7, wind: 0.8,
    x: 0, y: 0, z: 0,
  };
  /** Cycle a flat [x,y,z,…] anchor list IN ORDER, skipping anchors further than
   *  `maxD` from the view. Random sampling over 12 roofs gave every stack an
   *  intermittent wisp instead of a column, so some chimneys (the pink stack in
   *  candy_night) were simply bare. */
  const cyc = { candy: 0, cat: 0 };
  function nextStack(arr, key, maxD) {
    const n = arr.length / 3, d2 = maxD * maxD;
    const cam = ctx.camera.position;
    for (let k = 0; k < n; k++) {
      const i = (cyc[key]++ % n) * 3;
      const dx = arr[i] - obsX, dz = arr[i + 2] - obsZ;
      if (dx * dx + dz * dz >= d2) continue;
      // ...but never the stack that is basically in the lens: a fat puff 9 units
      // from the camera is a grey veil over the frame corner. 81, not 196: at 14
      // units the guard was skipping most of Gumdrop Village's own roofs, which
      // is why candy_night had twelve chimneys and no smoke in it.
      const cx = arr[i] - cam.x, cy = arr[i + 1] - cam.y, cz = arr[i + 2] - cam.z;
      if (cx * cx + cy * cy + cz * cz < 81) continue;
      return i;
    }
    return -1;
  }
  // Smoke is LIT BY THE SCENE. The old night branch painted daylight-white
  // cotton (0xece7dd → 0xfffaf0 at alpha 0.52) at midnight — the loudest wrong
  // note in every night frame. Colour, alpha, size, life and wind now all scale
  // with ctx.state.daylight: after dark a stack breathes small, soft, dim grey.
  // The night grey still has to sit ABOVE the night sky and the dark roofs or
  // the plume disappears completely (measured: 0x5a5f68 at alpha 0.24 was
  // invisible at 23:00) — moonlit grey, half the luminance of the old white.
  const SMOKE_DAY = 0xa9a49b, SMOKE_DAY_END = 0xd2ccc2;
  // Night grey has to sit ABOVE the night sky and the dark roofs or the plume
  // vanishes (measured: 0x5a5f68 at alpha 0.24 was invisible at 23:00), so it is
  // moonlit grey-blue, and at night it is the MORE opaque of the two.
  const SMOKE_NIGHT = 0x9aa0aa, SMOKE_NIGHT_END = 0xb6bcc6;
  /** One puff from anchor `i` of `arr`, lit by the time of day. */
  function puffFrom(arr, i) {
    smokeO.x = arr[i] + (rnd() - 0.5) * 0.3;
    smokeO.y = arr[i + 1];
    smokeO.z = arr[i + 2] + (rnd() - 0.5) * 0.3;
    const d = clamp(ctx.state.daylight, 0, 1);
    const k = smoothstep(0, 0.5, d);
    smokeO.color = mixHex(SMOKE_NIGHT, SMOKE_DAY, k);
    smokeO.colorEnd = mixHex(SMOKE_NIGHT_END, SMOKE_DAY_END, k);
    smokeO.alpha = 0.66 - 0.06 * k;           // opaque enough to read as smoke
    smokeO.size = 0.86 + 0.10 * k;
    smokeO.sizeEnd = 2.8 + 0.4 * k;
    smokeO.life = 5.2 + 0.5 * k;
    smokeO.wind = 0.5 + 0.5 * k;              // a night plume rises, it doesn't smear
    P.one(smokeO);
  }
  add({
    // 12 stacks × ~0.7 puffs/s = 8.4/s, cycled IN ORDER so every roof in
    // Gumdrop Village is smoking at once and each one carries 3–5 live puffs
    // (life 5.2 s). Higher rates were what turned each column into a smear.
    id: 'village_chimney_smoke', x: L.candy_village.x, z: L.candy_village.z, r: 0, range: 86, rate: 11,
    primeSec: 5.2, intensity: (s) => 0.78 + 0.2 * s.daylight,
    emit(f) {
      if (!chimneys) chimneys = resolveChimneys();
      if (!chimneys.length) return;
      const i = nextStack(chimneys, 'candy', 74); if (i < 0) return;
      puffFrom(chimneys, i);
    },
  });

  // ── 7. Steam off the sugar fountain (village centre) ──────────────────────
  // The fountain is NOT at the village landmark centre (-140,40) — the
  // architecture builder put it at (-141,47) and publishes the spot as
  // landmarks.sugar_fountain. Anchoring on the landmark left a plume hovering
  // over empty plaza paving.
  // Heights read straight off candy/architecture/village.js buildFountain():
  // basin syrup at ground + 0.95 (rim +1.04), the four long jets LAND at radius
  // 2.95 / +1.02, the upper bowl runs at radius 1.9 / +3.5, the crown gumdrop is
  // centred +6.05 and the cherry tops out at +7.28. The old anchor (mark + 3.25)
  // was inside the pedestal, so both the steam and the fizz were emitted INSIDE
  // solid geometry and depth-tested away — which is why the fountain read as
  // dead stone in candy_night.
  const fMark = ctx.systems.candyArchitecture?.marks?.sugar_fountain
             || ctx.systems.candyArchitecture?.landmarks?.sugar_fountain;
  const FOUNTAIN = { x: fMark?.x ?? -141, z: fMark?.z ?? 47 };
  FOUNTAIN.g = fMark?.y ?? h(FOUNTAIN.x, FOUNTAIN.z);
  FOUNTAIN.y = FOUNTAIN.g + 7.1;       // sugar steam boiling off the crown
  FOUNTAIN.bowl = FOUNTAIN.g + 3.7;    // upper bowl waterline
  FOUNTAIN.pool = FOUNTAIN.g + 1.15;   // basin waterline, where the long jets land
  const steamO = {
    shape: 'puff', blend: 'normal', color: 0xfff3fa, colorEnd: 0xffd8ee,
    speed: 0.28, lateral: 1, vy: 1.15, vyJitter: 0.3, gravity: 0.28, drag: 0.6,
    life: 3.1, lifeVar: 0.28, size: 0.66, sizeVar: 0.3, sizeEnd: 2.3,
    alpha: 0.33, fadeIn: 0.14, fadeOut: 0.55, spin: 0.4, wind: 0.7, sway: 0.3, swayFreq: 1.1,
    x: 0, y: 0, z: 0,
  };
  const fountainGlintO = {
    shape: 'sparkle', blend: 'add', color: [0xffffff, 0xffe6f4, 0xfff0c0], speed: 1.1, up: 1.4, gravity: -5.0,
    drag: 0.6, life: 0.95, lifeVar: 0.4, size: 0.62, sizeVar: 0.35, sizeEnd: 0.18,
    alpha: 0.95, fadeIn: 0.08, fadeOut: 0.5, spread: 0.45, x: 0, y: 0, z: 0,
  };
  // fat white fizz where the four long jets hit the basin — normal-blended, so
  // it reads in daylight too (an additive splash on pink icing is invisible)
  const fizzO = {
    shape: 'soft', blend: 'normal', color: [0xffffff, 0xfff0f8], colorEnd: 0xffe6f2,
    speed: 1.5, lateral: 1, up: 1.8, gravity: -9, drag: 0.7,
    life: 0.85, lifeVar: 0.4, size: 0.3, sizeVar: 0.5, sizeEnd: 0.1,
    alpha: 0.85, fadeIn: 0.05, fadeOut: 0.45, spread: 0.5, x: 0, y: 0, z: 0,
  };
  // the four landing points of the long arcs (radius 2.95, quarter turns + 45°)
  const JETS = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    JETS.push(FOUNTAIN.x + Math.cos(a) * 2.95, FOUNTAIN.z + Math.sin(a) * 2.95);
  }
  let jetCursor = 0;
  add({
    id: 'sugar_fountain_steam', x: FOUNTAIN.x, z: FOUNTAIN.z, r: 0, range: 62, rate: 12,
    primeSec: 3.6, intensity: ALWAYS,
    emit() {
      // 1. steam off the boiling crown
      const a = rnd() * TAU, d = rnd() * 1.2;
      steamO.x = FOUNTAIN.x + Math.cos(a) * d; steamO.z = FOUNTAIN.z + Math.sin(a) * d;
      steamO.y = FOUNTAIN.y + rnd() * 0.8;
      P.one(steamO);
      // 2. fizz + glints where a jet lands in the basin (cycled, so all four run)
      const j = (jetCursor++ % 4) * 2;
      fizzO.x = JETS[j] + (rnd() - 0.5) * 0.5; fizzO.z = JETS[j + 1] + (rnd() - 0.5) * 0.5;
      fizzO.y = FOUNTAIN.pool;
      P.one(fizzO);
      if (rnd() < 0.55) {
        fountainGlintO.x = fizzO.x; fountainGlintO.z = fizzO.z;
        fountainGlintO.y = FOUNTAIN.pool + 0.15 + rnd() * 0.5;
        speck(fountainGlintO);
      }
      // 3. a glint on the upper bowl's overflow curtain
      if (rnd() < 0.3) {
        const b = rnd() * TAU;
        fountainGlintO.x = FOUNTAIN.x + Math.cos(b) * 2.1;
        fountainGlintO.z = FOUNTAIN.z + Math.sin(b) * 2.1;
        fountainGlintO.y = FOUNTAIN.bowl + rnd() * 0.3;
        speck(fountainGlintO);
      }
    },
  });

  // ── 7b. Soft round glints on the candy bushes and the village lamp heads ──
  // Round-3 note: the faceted white polygons sitting inside coloured halos in
  // candy_night are NOT these — they are candyCreatures' Glowing Nerds (an
  // IcosahedronGeometry body inside a glow plane, creatures/fireflies.js) and
  // candyVegetation's `crystal` shards. Everything in THIS file is a procedural
  // radial mask on a billboarded quad: `glow`/`soft` reach exactly zero alpha
  // (and zero slope) at the inscribed circle, the output is premultiplied, and
  // the vertex shader refuses to draw anything under ~3 px — so a particle glint
  // can never show a straight edge or a corner, at any distance.
  const BUSH_SPECIES = { gumdrop: 1, cotton: 1, mint: 1, marsh: 1, cream: 1 };
  const BUSH_CELL = 20;
  let bushArr = null, bushGrid = null;
  const bkey = (cx, cz) => cx * 8192 + cz;
  function bushInit() {
    const pos = [];                              // x, crownY, z, scale
    const list = ctx.systems.candyVegetation?.meshes;
    if (Array.isArray(list)) {
      for (const rec of list) {
        const m = rec.mesh;
        if (!BUSH_SPECIES[rec.id] || !m || !m.instanceMatrix) continue;
        const a = m.instanceMatrix.array;
        for (let i = 0; i < m.count; i++) {
          const o = i * 16, x = a[o + 12], z = a[o + 14];
          if (!(x < -20)) continue;              // Candyland only
          const s = Math.hypot(a[o], a[o + 1], a[o + 2]) || 0.6;
          const g = Math.max(a[o + 13], h(x, z));
          pos.push(x, g + 0.5 + s * 1.6, z, s);  // glints hang around the crown
        }
      }
    }
    bushArr = new Float32Array(pos);
    bushGrid = new Map();
    for (let i = 0; i < bushArr.length; i += 4) {
      const k = bkey(Math.floor(bushArr[i] / BUSH_CELL), Math.floor(bushArr[i + 2] / BUSH_CELL));
      let b = bushGrid.get(k); if (!b) { b = []; bushGrid.set(k, b); }
      b.push(i);
    }
  }
  /** Index of a real bush instance near the view, or -1. Allocates nothing. */
  function bushNear() {
    if (!bushGrid) bushInit();
    const cx = Math.floor(aimX / BUSH_CELL), cz = Math.floor(aimZ / BUSH_CELL);
    for (let tries = 0; tries < 7; tries++) {
      const b = bushGrid.get(bkey(cx + ((rnd() * 3) | 0) - 1, cz + ((rnd() * 3) | 0) - 1));
      if (b && b.length) return b[(rnd() * b.length) | 0];
    }
    return -1;
  }

  // village.js authors eight plaza/road lampposts, nudges each one with
  // A.freeSpot() and then registers a collider of EXACTLY r 0.8 on the post — so
  // the BUILT position can be recovered rather than guessed. Head centre is
  // ground + 0.34 + h(4.0) + R(0.62)*0.9 per kit.js lamppost().
  const VILLAGE_LAMP_SPOTS = [[-145.5, 43.5], [-136.5, 47.5], [-141.8, 52.4], [-133.0, 41.0],
    [-150.5, 38.5], [-127.5, 45.5], [-155.0, 45.5], [-142.5, 33.0]];
  const lampHeads = [];
  (function placeCandyLamps() {
    const cols = ctx.colliders || [];
    for (const [sx, sz] of VILLAGE_LAMP_SPOTS) {
      let bx = sx, bz = sz, bd = 12;
      for (const c of cols) {
        if (!(c.r > 0.78 && c.r < 0.82)) continue;
        const d = (c.x - sx) * (c.x - sx) + (c.z - sz) * (c.z - sz);
        if (d < bd) { bd = d; bx = c.x; bz = c.z; }
      }
      lampHeads.push(bx, h(bx, bz) + 4.90, bz);
    }
  })();

  // THREE SIZES. A field of identically sized glints reads as a texture; a
  // pinprick, a bead and a fat soft bloom read as light at different distances.
  const GLINT_SIZE = [0.36, 0.66, 1.15];
  const GLINT_ALPHA = [0.95, 0.62, 0.30];
  const GLINT_LIFE = [1.3, 2.1, 3.2];
  const GLINT_HUE = [0xffe9b8, 0xffd2e8, 0xfff6d0, 0xc8ffe6, 0xffc0d8, 0xffe6a0];
  const glintO = {
    shape: 'glow', blend: 'add', color: 0xffe9b8,
    speed: 0.1, lateral: 1, vy: 0.13, vyJitter: 0.12, gravity: 0, drag: 0.6,
    life: 2.1, lifeVar: 0.4, size: 0.6, sizeVar: 0.16, sizeEnd: 0.2,
    alpha: 0.8, fadeIn: 0.24, fadeOut: 0.56, sway: 0.22, swayFreq: 1.2, flicker: true,
    x: 0, y: 0, z: 0,
  };
  /** One soft round additive glint. `tier` 0/1/2 = pinprick / bead / bloom. */
  function glint(x, y, z, tier, hue) {
    const s = GLINT_SIZE[tier];
    glintO.size = s; glintO.sizeEnd = s * 0.42;   // shrinks, never to a hard dot
    glintO.alpha = GLINT_ALPHA[tier];
    glintO.life = GLINT_LIFE[tier];
    glintO.color = hue;
    glintO.x = x; glintO.y = y; glintO.z = z;
    speck(glintO);
  }
  const pickTier = () => { const q = rnd(); return q < 0.52 ? 0 : q < 0.86 ? 1 : 2; };
  add({
    id: 'candy_bush_glints', follow: true, x: 0, z: 0, r: 0, range: 1e4, rate: 10, primeSec: 3.2,
    intensity: (s) => (islandNow() === 'candy' ? 0.28 + 0.72 * (1 - s.daylight) : 0),
    emit() {
      const i = bushNear(); if (i < 0) return;
      const bs = bushArr[i + 3];
      const a = rnd() * TAU, d = (0.3 + rnd() * 0.8) * (0.7 + bs);
      glint(bushArr[i] + Math.cos(a) * d, bushArr[i + 1] + (rnd() - 0.4) * 0.8,
        bushArr[i + 2] + Math.sin(a) * d, pickTier(), GLINT_HUE[(rnd() * GLINT_HUE.length) | 0]);
    },
  });
  let candyLampCursor = 0;
  add({
    id: 'candy_lamp_glints', x: L.candy_village.x, z: L.candy_village.z, r: 0, range: 74,
    rate: 8, primeSec: 3.2, intensity: (s) => 0.15 + 0.85 * DARK(s),
    emit() {
      const n = lampHeads.length / 3;
      const j = (candyLampCursor++ % n) * 3;
      const x = lampHeads[j], y = lampHeads[j + 1], z = lampHeads[j + 2];
      const dx = obsX - x, dz = obsZ - z;
      if (dx * dx + dz * dz > 4900) return;       // 70 units
      const tier = pickTier();
      glint(x + (rnd() - 0.5) * 1.4, y + (rnd() - 0.45) * 1.2, z + (rnd() - 0.5) * 1.4,
        tier, tier === 2 ? 0xffab48 : 0xffdc9a);
    },
  });

  // ── 7c. Blossom petals + loose sprinkles over the village (day) ───────────
  const villagePetalO = {
    shape: 'leaf', blend: 'normal', color: [0xff9ecb, 0xffc2de, 0xfff0f6, 0xffd76e], colorEnd: 0xfff2f8,
    speed: 0.3, lateral: 1, vy: -0.55, vyJitter: 0.25, gravity: -0.35, drag: 0.9,
    life: 9, lifeVar: 0.25, size: 0.62, sizeVar: 0.3, alpha: 1,
    fadeIn: 0.05, fadeOut: 0.22, spin: 2.2, sway: 1.4, swayFreq: 1.6, wind: 0.9,
    ground: 'kill', floorY: 0, x: 0, y: 0, z: 0,
  };
  const villageChipO = {
    shape: 'confetti', blend: 'normal', color: CANDY.sprinkle, colorEnd: 0xffffff,
    speed: 0.4, lateral: 1, vy: -1.0, vyJitter: 0.5, gravity: -1.8, drag: 0.8,
    life: 7, lifeVar: 0.25, size: 0.22, sizeVar: 0.3, alpha: 1,
    fadeIn: 0.04, fadeOut: 0.16, spin: 6, sway: 0.7, swayFreq: 2.8, wind: 0.5,
    ground: 'kill', floorY: 0, x: 0, y: 0, z: 0,
  };
  add({
    id: 'village_petals', x: L.candy_village.x, z: L.candy_village.z, r: 30, range: 70, rate: 7,
    primeSec: 4.5, intensity: (s) => 0.22 + 0.78 * s.daylight,
    emit(f) {
      if (!pickPoint(f, 24)) return;
      const x = _sx, z = _sz;
      const o = rnd() < 0.75 ? villagePetalO : villageChipO;
      o.x = x; o.z = z;
      o.floorY = h(x, z) + 0.06;
      o.y = o.floorY + 4 + rnd() * 7;
      P.one(o);
    },
  });

  // ── 7d. Somebody walked here — prints on the chocolate paths ──────────────
  // A licorice road with nothing on it is a texture. A short trail of prints
  // leading off round the bend is a story, and it costs one flat decal each.
  // A GHOST WALKER marches along the licorice road near the view, one print per
  // emit, alternating feet. Because the prints live 17 s and land 2.4 a second,
  // there is always a 40-print trail leading off round the bend — and because
  // the walker is respawned whenever it strays out of view, the trail is on
  // screen in every frame instead of once every few seconds.
  const PRINT_CANDY = { color: 0x46281a, alpha: 0.4, size: 0.58, life: 17 };
  const PRINT_SOUR = { color: 0x2a5824, alpha: 0.42, size: 0.46, life: 15 };
  const walker = { x: 0, z: 0, dx: 0, dz: 1, foot: 1, off: 0, kit: PRINT_CANDY, alive: false };
  function respawnWalker() {
    // Anchored on the OBSERVER, not the aim point: the aim is 13 units up the
    // view direction, which on the village plaza put the whole trail behind the
    // fountain and under the gingerbread rooflines. The player's own feet are
    // the one spot guaranteed to be in frame and unoccluded.
    const near = world.nearestPath(obsX, obsZ, 'candy');
    if (!near.path || near.d > 26) { walker.alive = false; return false; }
    const pts = near.path.points;
    const t = clamp(near.t, 0, 0.985);
    const p0 = world.pointOnPolyline(pts, t);
    const p1 = world.pointOnPolyline(pts, Math.min(0.999, t + 0.012));
    let dx = p1.x - p0.x, dz = p1.z - p0.z;
    const dl = Math.hypot(dx, dz) || 1;
    const way = rnd() < 0.5 ? 1 : -1;
    walker.dx = dx / dl * way; walker.dz = dz / dl * way;
    // start well BEHIND, so the primed trail walks right past the player
    walker.x = p0.x - walker.dx * 17; walker.z = p0.z - walker.dz * 17;
    walker.off = (rnd() - 0.5) * near.path.width * 0.45;
    walker.kit = rnd() < 0.3 ? PRINT_SOUR : PRINT_CANDY;   // sour patch kids walk here too
    walker.alive = true;
    return true;
  }
  add({
    id: 'candy_path_prints', follow: true, x: 0, z: 0, r: 0, range: 1e4, rate: 2.4, primeSec: 16,
    intensity: () => (islandNow() === 'candy' ? 1 : 0),
    emit() {
      const wx = walker.x - obsX, wz = walker.z - obsZ;
      if (!walker.alive || wx * wx + wz * wz > 900) { if (!respawnWalker()) return; }
      const stride = walker.kit === PRINT_SOUR ? 0.66 : 0.95;
      walker.x += walker.dx * stride; walker.z += walker.dz * stride;
      walker.foot = -walker.foot;
      const side = walker.foot * 0.24;
      const px = walker.x - walker.dz * (walker.off + side);
      const pz = walker.z + walker.dx * (walker.off + side);
      const facing = Math.atan2(walker.dx, walker.dz);
      // the village plaza is architecture paving laid OVER the terrain, so a
      // decal at terrain height is buried under the flagstones — ask the
      // architecture where its walkable surface actually is
      const deck = ctx.systems.candyArchitecture?.getDeckHeight?.(px, pz);
      const gy = deck !== null && deck !== undefined ? Math.max(deck, h(px, pz)) : h(px, pz);
      // a FLAT quad's rotation is negated to point the toes down the road
      // (see the note on stepAt in particles.js)
      P.footprint(px, gy, pz, -(facing + side * 0.7 + (rnd() - 0.5) * 0.12), walker.kit);
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CAT ISLAND
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 8. Blossom petals over Whisker Heights ────────────────────────────────
  const petalO = {
    shape: 'leaf', blend: 'normal', color: [0xff87b4, 0xffa8c8, 0xffc4dc, 0xff6f9f], colorEnd: 0xffd6e6,
    speed: 0.35, lateral: 1, vy: -0.5, vyJitter: 0.3, gravity: -0.4, drag: 0.85,
    life: 9, lifeVar: 0.25, size: 0.5, sizeVar: 0.35, alpha: 1,
    fadeIn: 0.06, fadeOut: 0.2, spin: 2.4, sway: 1.3, swayFreq: 1.7, wind: 0.85,
    ground: 'kill', floorY: 0, x: 0, y: 0, z: 0,
  };
  add({
    id: 'whisker_heights_blossom', x: L.residential.x, z: L.residential.z, r: 34, range: 78, rate: 14, intensity: (s) => 0.5 + 0.5 * s.daylight,
    emit(f) {
      if (!pickPoint(f, 26)) return;
      const x = _sx, z = _sz;
      petalO.x = x; petalO.z = z;
      petalO.floorY = h(x, z) + 0.06;
      petalO.y = petalO.floorY + 5 + rnd() * 7;
      P.one(petalO);
    },
  });

  // ── 9. Catnip haze over Catnip Commons ────────────────────────────────────
  const hazeO = {
    shape: 'puff', blend: 'normal', color: [0xd4ff7a, 0xe8ffa8, 0xbcf05a], colorEnd: 0xf2ffd0,
    speed: 0.12, lateral: 1, vy: 0.12, vyJitter: 0.1, gravity: 0.02, drag: 0.3,
    life: 11, lifeVar: 0.3, size: 2.8, sizeVar: 0.4, sizeEnd: 6.8,
    alpha: 0.18, fadeIn: 0.3, fadeOut: 0.45, sway: 0.4, swayFreq: 0.4, wind: 0.5, spin: 0.15,
    x: 0, y: 0, z: 0,
  };
  const hazeSpeckO = {
    shape: 'sparkle', blend: 'add', color: [0xe6ff8a, 0xbaff66], speed: 0.3, vy: 0.35, vyJitter: 0.25,
    gravity: 0, drag: 0.6, life: 2.6, lifeVar: 0.5, size: 0.44, sizeVar: 0.5, sizeEnd: 0.05,
    alpha: 0.85, fadeIn: 0.2, fadeOut: 0.5, sway: 0.5, swayFreq: 2.0, x: 0, y: 0, z: 0,
  };
  add({
    id: 'catnip_haze', x: L.cat_park.x, z: L.cat_park.z, r: 26, range: 74, rate: 8, intensity: ALWAYS,
    emit(f) {
      if (!pickPoint(f, 24)) return;
      const x = _sx, z = _sz;
      const g = h(x, z);
      if (rnd() < 0.45) { hazeSpeckO.x = x; hazeSpeckO.z = z; hazeSpeckO.y = g + 0.5 + rnd() * 2.4; speck(hazeSpeckO); }
      else { hazeO.x = x; hazeO.z = z; hazeO.y = g + 0.9 + rnd() * 1.6; P.one(hazeO); }
    },
  });

  // ── 10. Harbour sea spray at the quay ─────────────────────────────────────
  // Shoreline sample points found by marching outward from Fish Harbor.
  const shore = [];
  (function findShore() {
    for (let a = 40; a <= 230; a += 10) {
      const ang = a * Math.PI / 180;
      for (let d = 6; d < 40; d += 1.2) {
        const x = L.fish_harbor.x + Math.cos(ang) * d, z = L.fish_harbor.z + Math.sin(ang) * d;
        if (h(x, z) < 0.0) { if (d < 30) shore.push(x, z); break; }
      }
    }
    if (!shore.length) shore.push(92, 72, 84, 68);
  })();
  const sprayO = {
    shape: 'soft', blend: 'normal', color: [0xffffff, 0xdff4ff], colorEnd: 0xffffff,
    speed: 2.4, lateral: 1, up: 2.0, gravity: -13, drag: 0.5,
    life: 1.2, lifeVar: 0.35, size: 0.32, sizeVar: 0.6, sizeEnd: 0.06,
    alpha: 0.9, fadeIn: 0.04, fadeOut: 0.45, spread: 1.8, ground: 'kill', floorY: -0.2,
    x: 0, y: 0.1, z: 0, count: 1,
  };
  const sprayMistO = {
    shape: 'puff', blend: 'normal', color: 0xffffff, speed: 0.4, lateral: 1, vy: 0.5, vyJitter: 0.3,
    gravity: -0.4, drag: 1.4, life: 2.2, lifeVar: 0.3, size: 0.8, sizeVar: 0.4, sizeEnd: 3.0,
    alpha: 0.22, fadeIn: 0.15, fadeOut: 0.6, wind: 0.9, spread: 1.6, x: 0, y: 0.3, z: 0,
  };
  add({
    // 58, not 74: at 70 units the 26-droplet burst was still firing while the
    // player stood on Main Street and every droplet was a sub-pixel waste.
    id: 'harbour_sea_spray', x: L.fish_harbor.x, z: L.fish_harbor.z, r: 0, range: 58, every: [0.7, 1.8], intensity: ALWAYS,
    fire() {
      // break on the stretch of shore nearest the player so it is always on screen
      let best = 0, bestD = Infinity;
      for (let i = 0; i < shore.length; i += 2) {
        const dx = shore[i] - obsX, dz = shore[i + 1] - obsZ;
        const d = dx * dx + dz * dz + rnd() * 220;
        if (d < bestD) { bestD = d; best = i; }
      }
      const x = shore[best], z = shore[best + 1];
      sprayO.x = x; sprayO.z = z;
      for (let k = 0; k < 22; k++) P.one(sprayO);
      sprayMistO.x = x; sprayMistO.z = z;
      for (let k = 0; k < 4; k++) P.one(sprayMistO);
      P.ripple(x, 0.05, z, { ringColor: 0xffffff, ringSize: 5.0, ringLife: 1.3 });
    },
  });

  // ── 11. Gulls' feathers, occasionally, over the harbour + main street ─────
  const featherO = {
    shape: 'leaf', blend: 'normal', color: [0xfbfaf5, 0xeceae2], colorEnd: 0xffffff,
    speed: 0.3, lateral: 1, vy: -0.35, vyJitter: 0.15, gravity: -0.2, drag: 1.2,
    life: 11, lifeVar: 0.2, size: 0.34, sizeVar: 0.25, alpha: 0.95,
    fadeIn: 0.05, fadeOut: 0.18, spin: 1.3, sway: 1.9, swayFreq: 1.15, wind: 0.7,
    ground: 'kill', floorY: 0, x: 0, y: 0, z: 0,
  };
  add({
    id: 'gull_feathers', follow: true, x: 0, z: 0, r: 0, range: 1e4, every: [2.5, 6.5],
    intensity: (s) => { const i = islandNow(); return i === 'cat' || i === 'sea' ? 0.4 + 0.6 * s.daylight : 0; },
    fire() {
      const a = rnd() * TAU, d = 6 + rnd() * 16;
      const x = obsX + Math.cos(a) * d, z = obsZ + Math.sin(a) * d;
      featherO.floorY = Math.max(h(x, z), 0) + 0.05;
      featherO.x = x; featherO.z = z; featherO.y = featherO.floorY + 11 + rnd() * 5;
      speck(featherO);
      if (rnd() < 0.4) { featherO.x = x + 1.5; featherO.y += 1.6; speck(featherO); }
    },
  });

  // ── 12. Meow Donald's fryer steam ─────────────────────────────────────────
  // The restaurant block is centred (129,-27.4), 17 × 11, flat roof at
  // ground+5.7 with a 0.5 parapet (cat/architecture/mainstreet.js). The extract
  // vent goes on the roof: at the old mid-wall height the plume was swallowed by
  // the building and invisible from Main Street, 25 units away.
  const FRYER = { x: L.meow_donalds.x + 6.5, z: L.meow_donalds.z - 5.0 };
  FRYER.y = h(L.meow_donalds.x, L.meow_donalds.z) + 6.5;
  const fryerO = {
    shape: 'puff', blend: 'normal', color: 0xfff1cf, colorEnd: 0xffffff,
    speed: 0.3, lateral: 1, vy: 1.45, vyJitter: 0.35, gravity: 0.45, drag: 0.8,
    life: 3.0, lifeVar: 0.3, size: 0.42, sizeVar: 0.35, sizeEnd: 2.3,
    alpha: 0.32, fadeIn: 0.14, fadeOut: 0.6, spin: 0.45, wind: 1.0, sway: 0.3, swayFreq: 1.1,
    x: 0, y: 0, z: 0,
  };
  add({
    id: 'meow_donalds_fryer_steam', x: FRYER.x, z: FRYER.z, r: 0, range: 60, rate: 10, intensity: (s) => 0.45 + 0.55 * s.daylight,
    emit() {
      fryerO.x = FRYER.x + (rnd() - 0.5) * 1.1; fryerO.z = FRYER.z + (rnd() - 0.5) * 1.1;
      fryerO.y = FRYER.y + rnd() * 0.4;
      P.one(fryerO);
    },
  });

  // ── 13. Lantern moths on Main Street (night) ──────────────────────────────
  // The six real lampposts, mirrored from cat/architecture/mainstreet.js (street
  // centreline CL + lampXs, 5.9 units off the kerb) because cat/architecture
  // publishes no lamp list. The old guesses used world.PATHS 'cat_main' at
  // 3.1/+4.1 and put the moths in mid-air between the lamps.
  // Resolves to, and verified against, the built posts:
  //   (96.8,1.5) (109.6,9.2) (114.8,-4.6) (124.2,6.5) (134.2,-4.0) (140.2,9.4)
  // with the lantern glass centred at ground + 6.35 + 0.37.
  const CAT_STREET_CL = [[96, 8.2], [104, 5.0], [112, 2.0], [120, 0.4], [128, 0.8], [136, 2.4], [146, 4.6]];
  const CAT_LAMP_XS = [99, 107.5, 116, 124.5, 133, 141.5];
  function streetZ(x) {
    const C = CAT_STREET_CL;
    for (let i = 0; i < C.length - 1; i++) {
      if (x <= C[i + 1][0] || i === C.length - 2) {
        const t = (x - C[i][0]) / (C[i + 1][0] - C[i][0]);
        return C[i][1] + (C[i + 1][1] - C[i][1]) * t;
      }
    }
    return C[0][1];
  }
  // lanterns = the 6 lamp heads, lampBase = the flagstones under them,
  // bulbs = the 60 strung lantern bulbs (5 spans × 12, sagging 1.7 and hung
  // 0.36 below the wire, exactly as mainstreet.js builds them).
  const lanterns = [], lampBase = [], lampTan = [], bulbs = [];
  (function placeLanterns() {
    const head = [];
    CAT_LAMP_XS.forEach((x, i) => {
      const side = i % 2 ? 1 : -1;
      const s = (streetZ(x + 0.5) - streetZ(x - 0.5)) / 1.0, len = Math.hypot(1, s);
      const lx = x + (s / len) * 5.9 * -side, lz = streetZ(x) + (-1 / len) * 5.9 * -side;
      const ly = h(lx, lz) + 0.45;
      // the amber glass is a 0.75-tall cylinder whose BASE sits at ly+5.9
      // (parts.js lamppost: y + h + 0.3, h = 5.6), so its centre — where the
      // architecture hangs its own halo too — is ly+6.27, not ly+5.9.
      lanterns.push(lx, ly + 6.27, lz);         // the glowing lantern box
      lampBase.push(lx, ly + 0.08, lz);         // the pool of light on the ground
      lampTan.push(1 / len, s / len);           // unit tangent ALONG the street
      head.push([lx, ly + 6.0, lz]);            // the wire anchor
    });
    for (let i = 0; i < head.length - 1; i++) {
      const a = head[i], c = head[i + 1];
      for (let k = 1; k < 13; k++) {
        const t = k / 13;
        bulbs.push(
          a[0] + (c[0] - a[0]) * t,
          a[1] + (c[1] - a[1]) * t - Math.sin(t * Math.PI) * 1.7 - 0.36,
          a[2] + (c[2] - a[2]) * t,
        );
      }
    }
  })();
  let mothCursor = 0, haloCursor = 0, bulbCursor = 0, poolCursor = 0;
  // Moths: cream-white (the halo behind them is amber, so an amber moth is
  // invisible), slow, and cycled one head at a time so all six posts keep
  // ~3 fluttering specks. rate = heads × 3 / life.
  const mothO = {
    shape: 'soft', blend: 'add', color: [0xfff8e4, 0xfff0c8, 0xfffdf4],
    speed: 0.42, lateral: 1, vy: 0.06, vyJitter: 0.24, gravity: 0, drag: 1.1,
    life: 4.2, lifeVar: 0.3, size: 0.5, sizeVar: 0.35, sizeEnd: 0.3,
    alpha: 1, fadeIn: 0.16, fadeOut: 0.34, sway: 1.5, swayFreq: 2.6, flicker: true,
    spread: 1.6, x: 0, y: 0, z: 0,
  };
  add({
    id: 'main_street_lantern_moths', x: L.main_street.x, z: L.main_street.z, r: 0, range: 72,
    rate: (CAT_LAMP_XS.length * 3) / 4.2, primeSec: 4.4, intensity: DARK,
    emit() {
      const n = lanterns.length / 3;
      const j = (mothCursor++ % n) * 3;
      const dx = obsX - lanterns[j], dz = obsZ - lanterns[j + 2];
      if (dx * dx + dz * dz > 5800) return;              // ~76 units
      mothO.x = lanterns[j]; mothO.y = lanterns[j + 1] + (rnd() - 0.45) * 1.5; mothO.z = lanterns[j + 2];
      speck(mothO);
    },
  });

  // ── 13b. The glow the lanterns cast (night) ───────────────────────────────
  // Every lamp head gets TWO additive halos — a hot core ~2.5× the bulb glass
  // (0.68 wide) and a wide soft bloom — plus an elliptical pool on the
  // flagstones (two overlapping flat discs offset along the street tangent,
  // because a single disc reads as a circular decal).
  //
  // Constant brightness trick: alpha ramps 0→A→0 (fadeIn .5 / fadeOut .5) and
  // the rate keeps exactly TWO generations alive per anchor, so the two
  // triangular envelopes sum to a rock-steady A. Anchors are cycled in order,
  // never sampled, so the whole chain is lit at once.
  // sizeEnd === size on BOTH of these, deliberately. The constant-brightness
  // trick keeps two generations alive per anchor; if their radii differ by even
  // 8% the sum of the two falloffs has a step in it, and a 200-px-wide step is
  // the concentric RING the round-3 critic saw in every light pool. Identical
  // radii + the fragment dither + the ring-free `pool` mask = a smooth falloff.
  const haloO = {
    shape: 'glow', blend: 'add', color: 0xffc169, speed: 0, vy: 0.01, gravity: 0, drag: 0,
    life: 6.0, lifeVar: 0, size: 2.4, sizeVar: 0, sizeEnd: 2.4,
    alpha: 0.72, fadeIn: 0.5, fadeOut: 0.5, x: 0, y: 0, z: 0,
  };
  const poolO = {
    shape: 'pool', blend: 'add', flat: true, color: 0xffa845, speed: 0, vy: 0, gravity: 0, drag: 0,
    life: 5.0, lifeVar: 0, size: 7.2, sizeVar: 0, sizeEnd: 7.2,
    alpha: 0.17, fadeIn: 0.5, fadeOut: 0.5, rotation: 0, x: 0, y: 0, z: 0,
  };
  const LAMP_D2 = 6400;   // 80 units: the whole street is lit, not just nearby
  // SIZE ATTENUATION. A halo is a glare artefact of the eye, not an object, so
  // its ANGULAR size should stay roughly constant down the street instead of
  // collapsing with 1/d like the fixture does. Growing the world-space radius
  // linearly with distance does exactly that: the far end of the bulb chain
  // keeps a readable bead of light, the near lamp does not become a balloon.
  // (Brightness still falls off, so depth still reads.)
  const atten = (base, d) => base * (0.72 + d * 0.0135);
  add({
    id: 'main_street_lamp_halos', x: L.main_street.x, z: L.main_street.z, r: 0, range: 78,
    rate: 2 * (CAT_LAMP_XS.length) / 6.0, primeSec: 6.2, intensity: DARK,
    emit() {
      const n = lanterns.length / 3;
      const j = (haloCursor++ % n) * 3;
      const x = lanterns[j], y = lanterns[j + 1], z = lanterns[j + 2];
      const dx = obsX - x, dz = obsZ - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > LAMP_D2) return;
      const d = Math.sqrt(d2);
      haloO.x = x; haloO.y = y; haloO.z = z;
      haloO.color = 0xffd089; haloO.size = haloO.sizeEnd = atten(2.1, d); haloO.alpha = 0.88;
      P.one(haloO);                                    // hot core, ~2.5× the glass
      haloO.color = 0xff9c3e; haloO.size = haloO.sizeEnd = atten(5.9, d); haloO.alpha = 0.34;
      P.one(haloO);                                    // soft bloom around it (the
      // metal shade hides the glass from above, so the bloom is what actually
      // tells you the lamp is lit from the game camera)
    },
  });
  add({
    id: 'main_street_bulb_halos', x: L.main_street.x, z: L.main_street.z, r: 0, range: 78,
    rate: 2 * (60 / 2) / 6.0, primeSec: 6.2, intensity: DARK,
    emit() {
      // every SECOND strung bulb (the architecture already draws its own small
      // halo on each one) so the wire reads as a continuous line of light
      const n = bulbs.length / 3;
      const j = ((bulbCursor++ * 2) % n) * 3;
      const x = bulbs[j], y = bulbs[j + 1], z = bulbs[j + 2];
      const dx = obsX - x, dz = obsZ - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > LAMP_D2) return;
      haloO.color = 0xffc169;
      haloO.size = haloO.sizeEnd = atten(1.55, Math.sqrt(d2));
      haloO.alpha = 0.4;
      haloO.x = x; haloO.y = y; haloO.z = z;
      P.one(haloO);
    },
  });
  add({
    id: 'main_street_light_pools', x: L.main_street.x, z: L.main_street.z, r: 0, range: 78,
    rate: 2 * (CAT_LAMP_XS.length * 2) / 5.0, primeSec: 5.4, intensity: DARK,
    emit() {
      const n = lampBase.length / 3;
      const k = poolCursor++;
      const j = (k >> 1) % n, j3 = j * 3, lobe = (k & 1) ? 1 : -1;
      const dx = obsX - lampBase[j3], dz = obsZ - lampBase[j3 + 2];
      if (dx * dx + dz * dz > LAMP_D2) return;
      poolO.x = lampBase[j3] + lampTan[j * 2] * 1.5 * lobe;
      poolO.y = lampBase[j3 + 1];
      poolO.z = lampBase[j3 + 2] + lampTan[j * 2 + 1] * 1.5 * lobe;
      P.one(poolO);
    },
  });

  // ── 13c. Night motes drifting through the lamplight ───────────────────────
  // Half warm (they belong to the lamps), half cool blue-white — warm motes in
  // front of a warm halo vanish, the cool ones keep the layer readable.
  // Cat Island's speck tint is GREEN-GOLD, not blue-white: amber where the lamps
  // reach, old-gold and catnip-green where they don't. (Cool blue-white read as
  // the same lens dust as the Candyland field.)
  const nightMoteO = {
    shape: 'soft', blend: 'add', color: [0xffe0a8, 0xf2d98e, 0xd8d47e, 0xc6cf74],
    speed: 0.1, lateral: 1, vy: 0.09, vyJitter: 0.1, gravity: 0.01, drag: 0.2,
    life: 7.5, lifeVar: 0.35, size: 0.28, sizeVar: 0.55, sizeEnd: 0.16,
    alpha: 0.5, fadeIn: 0.24, fadeOut: 0.4, sway: 0.32, swayFreq: 0.6, wind: 0.2, flicker: true,
    x: 0, y: 0, z: 0,
  };
  add({
    id: 'cat_street_night_motes', follow: true, x: 0, z: 0, r: 0, range: 1e4, rate: 6, primeSec: 6,
    intensity: (s) => (islandNow() === 'cat' ? clamp((1 - s.daylight) * 1.3, 0, 1) : 0),
    emit() {
      const a = rnd() * TAU, d = 6 + rnd() * 22;
      const x = aimX + Math.cos(a) * d, z = aimZ + Math.sin(a) * d;
      const g = h(x, z); if (g < 0.3) return;
      nightMoteO.x = x; nightMoteO.z = z; nightMoteO.y = g + 0.7 + rnd() * 5.4;
      speck(nightMoteO);
    },
  });

  // ── 13d. Cat Island chimney smoke ─────────────────────────────────────────
  // cat/architecture does NOT publish its chimneys, so mirror the placement
  // maths from cat/architecture/mainstreet.js: lot(x, side, off) frames the
  // shop, every shop() stacks a chimney at at(frame, 2.3, min(w,d)*0.3) and the
  // flue mouth sits at ground + h + 2.9. The bank (112.4) has a flat roof and
  // no stack, and Meow Donald's gets the fryer vent (effect 12) instead.
  //         x along street, side, lot off, w, d, h
  const CAT_SHOPS = [
    [100.5, -1, 9.6, 8.2, 7.6, 8.5], [109.4, -1, 9.6, 8.4, 7.6, 8.1],
    [117.6, -1, 9.6, 7.4, 7.2, 8.6], [127.6, -1, 9.6, 7.2, 7.2, 7.9],
    [135.2, -1, 9.6, 7.4, 7.2, 8.4], [143.0, -1, 9.6, 7.6, 7.4, 8.8],
    [103.0, 1, 9.6, 7.0, 6.6, 7.2], [128.6, 1, 9.6, 7.2, 6.8, 7.0],
    [137.4, 1, 9.6, 7.6, 6.8, 7.2],
  ];
  const catChimneys = [];
  for (const [x, side, off, w, d, hgt] of CAT_SHOPS) {
    const s = (streetZ(x + 0.5) - streetZ(x - 0.5)) / 1.0, len = Math.hypot(1, s);
    const nx = s / len, nz = -1 / len;
    const cx = x - nx * off * side, cz = streetZ(x) - nz * off * side;
    const ry = Math.atan2(nx * side, nz * side);        // the facade looks back at the street
    const a = ry + 2.3, dist = Math.min(w, d) * 0.3;
    catChimneys.push(
      cx + Math.sin(a) * dist,
      Math.max(h(cx, cz), 0.4) + hgt + 2.9,
      cz + Math.cos(a) * dist,
    );
  }
  add({
    id: 'cat_chimney_smoke', x: L.main_street.x, z: L.main_street.z, r: 0, range: 84, rate: 8,
    primeSec: 5.2, intensity: (s) => 0.78 + 0.2 * s.daylight,
    emit() {
      const i = nextStack(catChimneys, 'cat', 72); if (i < 0) return;
      puffFrom(catChimneys, i);
    },
  });

  // ── 13e. Sunlit dust under the shop awnings (DAY ONLY) ────────────────────
  // Round-3 note: by day the street must NOT reuse the night mote palette. This
  // is the only mote layer Cat Island gets between sunrise and dusk: warm,
  // normal-blended (never additive — an additive speck over sunlit cobbles is a
  // saturated pin-dot, which is exactly the note), and it lives in the SHADE in
  // front of the shop fronts and under the awnings, where real dust hangs in a
  // shaft of light. Over the open road there is nothing at all.
  const awnings = [];
  for (const [x, side, off, w, d] of CAT_SHOPS) {
    const s = (streetZ(x + 0.5) - streetZ(x - 0.5)) / 1.0, len = Math.hypot(1, s);
    const nx = s / len, nz = -1 / len;
    const cx = x - nx * off * side, cz = streetZ(x) - nz * off * side;
    const fx = cx + nx * (d * 0.5 + 0.9) * side, fz = cz + nz * (d * 0.5 + 0.9) * side;
    awnings.push(fx, Math.max(h(fx, fz), 0.4) + 2.3, fz);
  }
  const sunDustO = {
    shape: 'soft', blend: 'normal', color: [0xfff0cf, 0xffe4b4, 0xfff8e6], colorEnd: 0xfff6e4,
    speed: 0.08, lateral: 1, vy: 0.07, vyJitter: 0.08, gravity: 0.01, drag: 0.2,
    life: 7, lifeVar: 0.35, size: 0.32, sizeVar: 0.4, sizeEnd: 0.22,
    alpha: 0.42, fadeIn: 0.26, fadeOut: 0.4, sway: 0.2, swayFreq: 0.5, wind: 0.14,
    x: 0, y: 0, z: 0,
  };
  let awningCursor = 0;
  add({
    id: 'cat_awning_sundust', x: L.main_street.x, z: L.main_street.z, r: 0, range: 68, rate: 7,
    primeSec: 5, intensity: (s) => clamp((s.daylight - 0.35) / 0.45, 0, 1),
    emit() {
      const n = awnings.length / 3;
      const j = (awningCursor++ % n) * 3;
      const x = awnings[j], z = awnings[j + 2];
      const dx = obsX - x, dz = obsZ - z;
      if (dx * dx + dz * dz > 2100) return;       // ~46 units: on screen or not at all
      sunDustO.x = x + (rnd() - 0.5) * 4.2;
      sunDustO.z = z + (rnd() - 0.5) * 4.2;
      sunDustO.y = awnings[j + 1] + (rnd() - 0.5) * 2.6;
      speck(sunDustO);
    },
  });

  // ── 14. Shed fur drifting over Cat Island ─────────────────────────────────
  // A whole civilisation of cats sheds all day; on a breeze the tufts float.
  // This is the only thing that moves at street level on Cat Island by day —
  // without it Main Street measured 8 on-screen particles, all of them 8 px.
  // Tufts are 0.45 across, not 0.3: at the 46–56 unit game camera a 0.3 quad is
  // 12 px of cream on cream paving and simply does not read.
  // Warmer and smaller than it was: four near-white tufts at 0.45 across were
  // the Cat Island half of the "snow on a Mediterranean island" note. Ginger,
  // cream and tabby-tan now — cat colours, not paper colours.
  const furO = {
    shape: 'leaf', blend: 'normal', color: [0xf2e2c4, 0xe2cda8, 0xd0b795, 0xf7ecd6], colorEnd: 0xf8eeda,
    speed: 0.25, lateral: 1, vy: -0.14, vyJitter: 0.22, gravity: -0.12, drag: 1.1,
    life: 7.5, lifeVar: 0.3, size: 0.36, sizeVar: 0.4, alpha: 0.85,
    fadeIn: 0.08, fadeOut: 0.3, spin: 1.2, sway: 1.7, swayFreq: 1.25, wind: 0.9,
    ground: 'kill', floorY: 0, x: 0, y: 0, z: 0,
  };
  add({
    id: 'cat_fur_drift', follow: true, x: 0, z: 0, r: 0, range: 1e4, rate: 3.4, primeSec: 5,
    intensity: (s) => (islandNow() === 'cat' ? 0.4 + 0.6 * s.daylight : 0),
    emit() {
      const a = rnd() * TAU, d = 6 + rnd() * 20;
      const x = aimX + Math.cos(a) * d, z = aimZ + Math.sin(a) * d;
      const g = h(x, z);
      if (g < 0.3) return;                      // not out over the sea
      furO.x = x; furO.z = z;
      furO.floorY = g + 0.05;
      furO.y = g + 0.6 + rnd() * 4.2;           // in the street, not over the roofs
      speck(furO);
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SEA — whitecap glints wherever the player can see water
  // ═══════════════════════════════════════════════════════════════════════════
  // Sun glints on water, not a snowstorm over the island: rate 8 (was 20), 0.48
  // across (was 0.62), and never inside 16 units of the view — at 14 units a
  // whitecap sat on the beach in front of the player.
  // Round-3: the cyan in this palette was the one saturated additive speck that
  // could still land near a sunlit street (over water at the end of it), so the
  // set is now sun-white/cream, and the glint never shrinks to a hard dot.
  const capO = {
    shape: 'sparkle', blend: 'add', color: [0xfff8ec, 0xf3f7ff, 0xffefc6],
    speed: 0.15, lateral: 1, vy: 0.12, gravity: 0, drag: 0.6,
    life: 1.4, lifeVar: 0.5, size: 0.5, sizeVar: 0.45, sizeEnd: 0.16,
    alpha: 0.68, fadeIn: 0.18, fadeOut: 0.55, spin: 0.4, x: 0, y: 0.12, z: 0,
  };
  const capRingO = {
    shape: 'ring', blend: 'normal', flat: true, color: 0xffffff, speed: 0, vy: 0, gravity: 0,
    life: 2.2, size: 0.6, sizeEnd: 3.6, alpha: 0.22, fadeIn: 0.15, fadeOut: 0.7, rotation: 0,
    x: 0, y: 0.06, z: 0,
  };
  add({
    id: 'sea_whitecaps', follow: true, x: 0, z: 0, r: 0, range: 1e4, rate: 8, intensity: (s) => 0.2 + 0.8 * s.daylight,
    emit() {
      for (let tries = 0; tries < 3; tries++) {
        const a = rnd() * TAU, d = 16 + rnd() * 58;
        const x = obsX + Math.cos(a) * d, z = obsZ + Math.sin(a) * d;
        if (h(x, z) < -0.55) {
          if (rnd() < 0.08) { capRingO.x = x; capRingO.z = z; P.one(capRingO); }
          else { capO.x = x; capO.z = z; capO.y = 0.1 + rnd() * 0.25; speck(capO); }
          return;
        }
      }
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WEATHER — the rare Candyland sprinkle shower
  // ═══════════════════════════════════════════════════════════════════════════
  const showerO = {
    shape: 'confetti', blend: 'normal', color: CANDY.sprinkle,
    speed: 0.9, lateral: 1, vy: -3.2, vyJitter: 1.2, gravity: -4.0, drag: 0.9,
    life: 6, lifeVar: 0.2, size: 0.18, sizeVar: 0.4, alpha: 1,
    fadeIn: 0.03, fadeOut: 0.12, spin: 8, sway: 0.9, swayFreq: 3.0, wind: 0.6,
    ground: 'kill', floorY: 0, x: 0, y: 0, z: 0,
  };
  const shower = { active: 0, cool: 120 + rnd() * 110, said: false };
  let showerAcc = 0;
  function sprinkleShower(sec = 8) {
    shower.active = sec; shower.said = false;
    return sec;
  }

  // ── priming ───────────────────────────────────────────────────────────────
  // A fresh scene starts with zero particles and a mote field takes 8 s to
  // fill, so every screenshot (40–90 stepped frames) and every teleport shows
  // a half-empty world. prime() fast-forwards the fields that are in view.
  let primed = false, needPrime = 0;
  function prime(seconds = 3.2) {
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      const inten = f.intensity ? f.intensity(ctx.state, ctx) : 1;
      if (inten < 0.05) continue;
      if (f.follow) { f.x = obsX; f.z = obsZ; }
      const dx = obsX - f.x, dz = obsZ - f.z;
      const rr = f.range + (f.r || 0);
      if (dx * dx + dz * dz > rr * rr) continue;
      curFx = f;
      if (f.every) { f.fire(f, ctx); curFx = null; continue; }   // one burst is enough
      // primeSec lets an effect ask for a full cycle (the lantern chain needs
      // every anchor filled before the first frame, not 60% of them)
      const n = Math.min(190, Math.round(f.rate * inten * (f.primeSec ?? seconds)));
      for (let k = 0; k < n; k++) { primeFrac = 0.05 + rnd() * 0.5; f.emit(f, ctx); }
      primeFrac = 0;
      curFx = null;
    }
  }
  ctx.events.on('player:teleport', () => { if (primed) needPrime = 0.15; });
  ctx.events.on('ferry:arrive', () => { if (primed) needPrime = 0.6; });

  // ── runner ────────────────────────────────────────────────────────────────
  function update(dt, ctx) {
    const st = ctx.state;
    const pl = ctx.systems.player?.position;
    ctx.camera.updateMatrixWorld();   // the camera system just moved it; we read the matrix below
    let free = false;
    if (ctx.systems.camera?.isFree?.()) {
      // Free/overview camera (every "free" screenshot view): observe where the
      // view ray meets the TERRAIN, solved iteratively — a fixed y=2 plane
      // overshot the look-at point by 11 units on Main Street (ground there is
      // ~5.6 high), which dragged every field sample off the road and left the
      // night street looking empty.
      free = true;
      const cam = ctx.camera, m = cam.matrixWorld.elements;
      const dx = -m[8], dy = -m[9], dz = -m[10];
      let gx = cam.position.x, gz = cam.position.z, gy = 2;
      if (dy < -0.05) {
        for (let k = 0; k < 3; k++) {
          const t = Math.min(400, (cam.position.y - gy) / -dy);
          gx = cam.position.x + dx * t; gz = cam.position.z + dz * t;
          gy = Math.max(0, world.height(gx, gz));
        }
      }
      obsX = gx; obsZ = gz;
    } else if (pl) { obsX = pl.x; obsZ = pl.z; }
    else { obsX = ctx.camera.position.x; obsZ = ctx.camera.position.z; }
    obs.x = obsX; obs.z = obsZ;

    // aim point: 13 units along the camera's horizontal view direction, i.e.
    // roughly the middle of the screen (read straight off the matrix — no alloc).
    // A free camera already observes its look-at point, so aim = obs there.
    if (free) { aimX = obsX; aimZ = obsZ; }
    else {
      const me = ctx.camera.matrixWorld.elements;
      let vx = -me[8], vz = -me[10];
      const vl = Math.hypot(vx, vz);
      if (vl > 1e-4) { vx /= vl; vz /= vl; } else { vx = 0; vz = 0; }
      aimX = obsX + vx * 13; aimZ = obsZ + vz * 13;
    }
    aim.x = aimX; aim.z = aimZ;

    if (!primed) { primed = true; prime(); }
    else if (needPrime > 0) { needPrime -= dt; if (needPrime <= 0) { needPrime = 0; prime(2.2); } }

    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      const inten = f.intensity ? f.intensity(st, ctx) : 1;
      if (inten < 0.03) { f.acc = 0; continue; }
      if (f.follow) { f.x = obsX; f.z = obsZ; }
      const dx = obsX - f.x, dz = obsZ - f.z;
      const rr = f.range + (f.r || 0);
      if (dx * dx + dz * dz > rr * rr) { f.acc = 0; continue; }
      curFx = f;
      if (f.every) {
        f.timer -= dt * inten;
        if (f.timer <= 0) { f.timer = f.every[0] + rnd() * (f.every[1] - f.every[0]); f.fire(f, ctx); }
      } else {
        f.acc += dt * f.rate * inten;
        let guard = 0;
        while (f.acc >= 1 && guard++ < 40) { f.acc -= 1; f.emit(f, ctx); }
        if (f.acc > 6) f.acc = 0;
      }
      curFx = null;
    }

    // weather
    if (shower.active > 0) {
      if (!shower.said) {
        shower.said = true;
        ctx.systems.ui?.toast?.('A sprinkle shower! Open wide.');
      }
      shower.active -= dt;
      if (st.island === 'candy' || world.islandAt(obsX, obsZ) === 'candy') {
        showerAcc += dt * 60;                     // 60 sprinkles/s, frame-rate independent
        const n = Math.min(6, showerAcc | 0); showerAcc -= n;
        for (let k = 0; k < n; k++) {
          const a = rnd() * TAU, d = 30 * Math.sqrt(rnd());
          const x = obsX + Math.cos(a) * d, z = obsZ + Math.sin(a) * d;
          showerO.x = x; showerO.z = z;
          showerO.floorY = Math.max(h(x, z), -0.2) + 0.05;
          showerO.y = showerO.floorY + 18 + rnd() * 10;
          P.one(showerO);
        }
      }
    } else {
      shower.cool -= dt;
      if (shower.cool <= 0) {
        shower.cool = 150 + rnd() * 140;
        if (world.islandAt(obsX, obsZ) === 'candy' && !ctx.state.paused) sprinkleShower(8);
      }
    }
  }

  return {
    update, sprinkleShower, effects: fx, shore, obs, aim, FOUNTAIN, FRYER,
    lanterns, lampBase, bulbs, catChimneys, chimneys: () => chimneys,
    /** Debug: which effects actually spawned, and how much. */
    tally() {
      const out = [];
      for (const f of fx) if (f.n) out.push(f.id + ':' + f.n);
      return out.join(' ');
    },
  };
}
