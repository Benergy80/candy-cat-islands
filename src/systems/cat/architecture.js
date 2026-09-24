// ─────────────────────────────────────────────────────────────────────────────
// CAT ISLAND ARCHITECTURE
//
// A warm Mediterranean seaside town built for cats-as-citizens: every door is
// cat-scale with a small apologetic human door beside it, every window has a
// deep sun-lounging sill, and every sign is cheerful about the fact that you
// are never leaving.
//
// Districts (world coords):
//   arrival     Arrivals Pier            42,22  → ferry at 30,22
//   plaza       Welcome Plaza            78,18
//   street      Main Street             118, 0
//   meow        Meow Donald's           128,-24
//   square      Purrliament Square      152, 6
//   heights     Whisker Heights         178,48
//   gym         Muscle Beach Gym        198,-26
//   harbor      Fish Harbor             100,58
//   watch       The Watchtower          218,30  + Not-An-Exit Beach 228,-6
//   yarn        Yarn Hill               188,-64
//   commons     bandstand + statue in Catnip Commons 140,-58 (nature owns the park)
//
// Technique: everything is authored into a Kit (see architecture/kit.js), which
// merges geometry per (district × material) so the whole town is ~20 meshes.
// All painted surfaces share one CanvasTexture atlas (architecture/signs.js).
//
// Exposed API: { group, getDeckHeight(x,z), districts, stats() }
// Also: pushes pier deck into ctx.walkables, buildings into ctx.colliders.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, hash, damp } from '../../core/util.js';
import { Kit, Part } from './architecture/kit.js';
import { SignAtlas, drawLines, board, stripes, catFace, humanFace, FONTS } from './architecture/signs.js';
import * as P from './architecture/parts.js';
import { setCollector, doorLeaf, frame } from './architecture/parts.js';
import { buildArrival, buildPlaza } from './architecture/arrival.js';
import { buildStreet, buildMeowDonalds } from './architecture/mainstreet.js';
import { buildSquare } from './architecture/square.js';
import { buildHeights, buildGym, buildHarbor, buildWatchtower, buildYarnHill, buildCommons } from './architecture/outskirts.js';
import { getLampPool } from '../terrain/lamppool.js';
import { createInstanceCuller, triangleTiles } from '../terrain/instcull.js';

// ── MOBILE TIER (docs/BRIEF.md Contract I) ───────────────────────────────────
// The town is authored identically on both tiers. On ctx.state.mobile:
//   · sign-atlas pages are halved to 1024² after they are painted, then laid
//     side by side on ONE 2048² page (textures ≤ 2048, a quarter of the
//     memory, the 2048 canvases released): every sign in town is one `sign0`
//     + one `signglow0` material, so the town pools and each shell pay one
//     sign call instead of one per page;
//   · a shell's ironwork folds into the shell's own matte (one call per shell
//     instead of two — a 1 m railing does not need its own sheen on a phone);
//   · every district's bulk matte (the casting town masses) is drawn through
//     the index runs of the 32 u tiles in view + the tiles its shadow needs
//     (terrain/instcull.js) — same calls, a fraction of the triangles;
//   · (both tiers since Contract J) the six street lamps are anchors of the
//     shared constant LAMP POOL (terrain/lamppool.js), not PointLights;
//   · the additive night spill is culled and skipped entirely by day;
//   · shadows come from the buildings only — the town-wide ironwork pool and
//     the small animated parts (signs, vanes, clock hands) do not cast;
//   · interior furniture (T.roomDetail) merges into a per-room mesh that is only
//     drawn while you can actually see into that room;
//   · the seven string-light spans over Main Street share one part (2 draw
//     calls instead of 14);
//   · the town-wide pools that cast no shadow (ironwork, bulbs, lamps, glass,
//     signs, spill) are drawn through the index runs of the 32 u tiles in view
//     (terrain/instcull.js) — still one call each, a fraction of the triangles.

export function create(ctx) {
  const { world } = ctx;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);

  const group = new THREE.Group();
  group.name = 'catArchitecture';
  ctx.scene.add(group);
  const MOBILE = !!ctx.state?.mobile;
  const lampPool = getLampPool(ctx);   // 3 slots on mobile, 9 on desktop (the pool decides)

  const atlas = new SignAtlas(2048);
  const kit = new Kit();
  const anims = [];        // { fn(t, dt, dl) }
  const pending = [];      // interactables, registered on world:ready
  const lights = [];
  const parts = [];        // standalone animated sub-objects
  const deck = [];         // walkable rectangles { x0,x1,z0,z1,y }
  const shells = [];       // fadeable building shells { id, p, holder, meshes, mats }
  const rooms = [];        // interiors { id, x, z, w, d, rot, y, h, inside, shell }
  const doorList = [];     // swinging doors { id, room, holder, open, t, blocker }
  const claims = [];       // build-time footprint claims, dissolved on frame 1
  let stoops = 0;          // entrance step runs (see T.stoop)
  ctx.colliders = ctx.colliders || [];
  ctx.walkables = ctx.walkables || [];

  let BLOB = null;   // the shared radial-falloff texture (see blobTexture)

  // ── the soft blob every light pool / bulb halo is painted with ─────────────
  // White in the middle falling to BLACK at the rim, alpha 1 everywhere: used
  // as an emissiveMap under additive blending, so the falloff comes from the
  // colour going to black (alphaMap would read the green channel and stay flat).
  function blobTexture(size = 128, power = 2.3) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const img = g.createImageData(size, size);
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x - c, y - c) / c);
      const v = Math.round(255 * Math.pow(1 - d, power));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  // ── shared materials ───────────────────────────────────────────────────────
  // NIGHT RULE for the whole town: nothing is authored white. Bulbs, lantern
  // glass and lenses are *amber solids* so they read as dull unlit amber glass
  // in daylight, and their emissive is pushed by (1 - daylight) at night —
  // deliberately kept below the level where ACES desaturates it back to cream.
  const mats = {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.0 }),
    // metalness 0.4 with no environment map rendered almost black (the giant
    // gym dumbbell read as a hole in the beach). 0.16 keeps the sheen and
    // still takes light from the sun and the hemisphere.
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.16 }),
    // filament / lantern glass / lighthouse lens
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.44, metalness: 0.0, emissive: 0xff9526, emissiveIntensity: 0.0 }),
    // window glass: cool, dark and reflective by day; warm from inside at night
    win: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.12, emissive: 0xffb055, emissiveIntensity: 0.0 }),
    // INTERIOR lamps: unlike the street bulbs these are on in the daytime too —
    // a shop with the lights off reads as a shop that is shut.
    lamp: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.0, emissive: 0xffc477, emissiveIntensity: 0.75 }),
    // soft additive light pools on the flagstones, wall washes under lit
    // windows, halos around bulbs. opacity rides (1 - daylight) so the whole
    // set contributes EXACTLY nothing in sunlight (additive × srcAlpha 0).
    spill: new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xff9633, emissiveMap: (BLOB = blobTexture()), emissiveIntensity: 0.0,
      transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, roughness: 1, metalness: 0,
    }),
  };

  // an additive decal needs no back-face pass (one draw, not two) — both tiers
  // since Contract J (A/B-diffed: 0 px at cat_night)
  mats.spill.forceSinglePass = true;

  // ── the shared authoring context handed to every district ──────────────────
  const T = {
    ctx, world, b: kit, A: atlas, THREE, P, anims, group,
    rnd: rng(hash('cat-architecture')),
    y: (x, z) => world.height(x, z),
    /** ground height, but never below a floor (keeps props out of the sea) */
    ground(x, z, min = 0.4) { return Math.max(world.height(x, z), min); },
    /**
     * The HIGHEST ground under a footprint. A room floor laid at the height of
     * the building's centre leaves the hillside standing up through the boards
     * at the back of the room — 72% of Purrbucks' floor was under grass — so
     * every enterable floor is laid at this height instead, with a threshold
     * step at the door.
     */
    padY(x, z, w, d, ry = 0, n = 7) {
      const c = Math.cos(ry), s = Math.sin(ry);
      let m = -Infinity;
      for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
        const lx = (-0.5 + i / (n - 1)) * w, lz = (-0.5 + k / (n - 1)) * d;
        m = Math.max(m, world.height(x + lx * c + lz * s, z - lx * s + lz * c));
      }
      return m;
    },

    // ── colliders ────────────────────────────────────────────────────────────
    // Wave-2 contract: walls are ORIENTED BOXES, props are circles. The old
    // circle chain is still emitted for every solid building, but as
    // `solid:false` CLAIMS — invisible to the player, still visible to every
    // system that reads ctx.colliders as "this ground is taken" (containment's
    // placement pass, nature's planting, citizens' idle spots, the camera).
    col(x, z, r, h) { ctx.colliders.push(h != null ? { x, z, r, h } : { x, z, r }); },
    /**
     * An oriented solid: the accurate wall/footprint the player collides with.
     * `ry` is a KIT yaw (local +X is (cos ry, −sin ry), the three.js Y rotation
     * this whole system authors in). player.js and camera.js read `rot` in the
     * opposite sense (local +X = (cos rot, sin rot)), so it is negated here —
     * get this wrong and every rotated wall is mirrored about its centre, which
     * leaves a player-sized hole at one corner of every building on a curve.
     */
    wall(x, z, w, d, ry = 0, h) {
      const c = { x, z, w, d, rot: -ry, box: true };
      if (h != null) c.h = h;
      ctx.colliders.push(c);
      return c;
    },
    /**
     * A BUILD-TIME footprint claim: circles over the footprint that say "this
     * ground is taken" to every system that reads ctx.colliders while the world
     * is being built (nature's planting, the citizens' idle spots, containment's
     * placement pass). They are not solid — the accurate wall boxes are — and
     * they DISSOLVE on the first frame (see `claims` below), so once the world
     * exists an interior is free ground you can stand in, be teleported into,
     * and see into without the camera treating the room as a cliff.
     */
    claim(x, z, w, d, ry = 0) {
      const c = Math.cos(ry), s = Math.sin(ry);
      // A chain of circles down the long axis leaves the four CORNERS unclaimed,
      // and a corner of a 17×11 restaurant is plenty of free ground for the
      // nature system to plant a cypress in — which is how a tree ended up
      // growing through Meow Donald's back booth. Tile the whole rectangle.
      const nx = Math.max(1, Math.round(w / 4.4)), nz = Math.max(1, Math.round(d / 4.4));
      const cw = w / nx, cd = d / nz, r = Math.hypot(cw, cd) * 0.5;
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        const lx = -w / 2 + cw * (i + 0.5), lz = -d / 2 + cd * (k + 0.5);
        const cl = { x: x + lx * c + lz * s, z: z - lx * s + lz * c, r, solid: false };
        claims.push(cl);
        ctx.colliders.push(cl);
      }
    },
    claimRing(x, z, w, d, ry = 0) { T.claim(x, z, w, d, ry); },
    /** Turn the wall segments roomShell() returned into solid colliders.
     *  A segment carrying its own `top` (the wall under a window sill) is only
     *  solid up to that height, so a hatch can be vaulted but not walked through. */
    solidify(segs, h) { for (const s of (segs || [])) T.wall(s.x, s.z, s.w, s.d + 0.1, s.rot, s.top != null ? s.top : h); },
    /** Solid building footprint: accurate box for the player + a claim chain. */
    colBox(x, z, w, d, ry = 0, h) {
      T.wall(x, z, w, d, ry, h);
      T.claim(x, z, w, d, ry);
    },

    // ── night lights (budget: 6) ─────────────────────────────────────────────
    light(x, y, z, color = 0xffb055, intensity = 1, dist = 26) {
      if (lights.length >= 6) return null;
      const a = lampPool.add({ x, y, z, color, dist, decay: 1.5 });
      a.peak = intensity; lights.push(a);
      return null;
    },

    // ── animation ────────────────────────────────────────────────────────────
    anim(fn) { anims.push(fn); return fn; },
    /** true on the mobile quality tier (see the header) */
    mobile: MOBILE,
    /**
     * Author a room's FURNITURE. Desktop: straight into the district kit, as
     * always. Mobile: the matte masses go to their own 'int_<id>' bucket, which
     * the update loop only draws while that room can be seen into (you are
     * inside, a door is open, or the shell is faded/ghosted).
     */
    roomDetail(id, fn) {
      if (!MOBILE) return fn();
      const prev = kit.d;
      kit.at('int_' + id);
      try { return fn(); } finally { kit.at(prev); }
    },
    /** A standalone merged object that can be moved/rotated each frame.
     *  Geometry is authored now, merged after the sign atlas is finalised. */
    part(build, name = 'part') {
      const holder = new THREE.Group();
      holder.name = 'cat_' + name;
      group.add(holder);
      const p = new Part();
      p.at(name);
      build(p);
      parts.push({ p, holder });
      return holder;
    },

    // ── interactables ────────────────────────────────────────────────────────
    act(id, x, z, label, lines, o = {}) {
      pending.push({ id, x, z, r: o.r ?? 3.0, label, lines, speaker: o.speaker ?? 'SIGN', onEach: o.onEach });
    },

    // ── sign factories ───────────────────────────────────────────────────────
    plaque(w, h, lines, o = {}) {
      return atlas.panel(w, h, (g, W, H) => {
        board(g, W, H, o);
        if (o.logo) o.logo(g, W, H);
        drawLines(g, W, H, lines, o);
        if (o.after) o.after(g, W, H);
      }, o.dpu ?? 76);
    },
    stripe(cols, n = 8, vertical = true) {
      const key = 'stripe' + cols.join('') + n + vertical;
      if (!T._cache[key]) T._cache[key] = atlas.cell(vertical ? 256 : 64, vertical ? 64 : 256, (g, W, H) => stripes(g, W, H, cols, n, vertical));
      return T._cache[key];
    },
    _cache: {},
    drawLines, board, stripes, catFace, humanFace, FONTS,

    /** the "HUMANS" label that appears over every little human door */
    humansLabel() {
      if (!T._cache.humans) T._cache.humans = T.plaque(1.0, 0.3, [{ t: 'HUMANS', s: 0.62, c: '#fdf4e2' }], { bg: '#7a4a2c', border: '#3d2415', borderW: 0.06, grime: 0.04, dpu: 150 });
      return T._cache.humans;
    },

    // ── pier deck registration ───────────────────────────────────────────────
    addDeck(x0, x1, z0, z1, y) { deck.push({ x0, x1, z0, z1, y }); },

    /**
     * A short flight of stone steps from the ground outside a door up to a
     * raised interior floor (see padY), and the walkable that makes them
     * climbable rather than a ledge the visitor pops onto. `f` is the building
     * frame, `lx` the door centre along the facade, `lz0` the outer wall face.
     */
    stoop(f, lx, lz0, w, toY) {
      const outX = f.px(lx, lz0 + 1.5), outZ = f.pz(lx, lz0 + 1.5);
      const fromY = world.height(outX, outZ);
      const rise = toY - fromY;
      if (rise < 0.16) return null;
      const n = Math.min(4, Math.max(1, Math.round(rise / 0.3)));
      const steps = [];
      for (let i = 0; i < n; i++) {
        const top = toY - (rise * (i + 1)) / (n + 1);
        const lz = lz0 + 0.42 + i * 0.66;
        kit.box(f.px(lx, lz), top - 1.3, f.pz(lx, lz), w, 1.3, 1.0, P.PAL.stone, { ry: f.ry, ao: 0 });
        steps.push({ lz, top });
      }
      const c = Math.cos(f.ry), s = Math.sin(f.ry);
      ctx.walkables.push({
        id: 'cat_stoop_' + (stoops++),
        test(x, z) {
          const dx = x - f.x, dz = z - f.z;
          const plx = dx * c - dz * s, plz = dx * s + dz * c;
          if (Math.abs(plx - lx) > w / 2) return null;
          for (let i = 0; i < steps.length; i++) if (Math.abs(plz - steps[i].lz) < 0.52) return steps[i].top;
          return null;
        },
      });
      return steps;
    },

    // ── ENTERABLE BUILDINGS ──────────────────────────────────────────────────
    /**
     * A building shell you can see through when you are inside it. Everything
     * authored into the returned builder (walls, roof, chimneys, awning boards)
     * merges into ONE mesh per opaque material and fades to 15% while the
     * player is in the room's footprint. Glass, signs and night spill are
     * forwarded to the town-wide pools (see Kit.overflow) so a hollow building
     * still costs two draw calls.
     */
    shell(id) {
      const p = new Part();
      p.at(id);
      p.overflow = kit;
      if (MOBILE) p.collapse = { metal: 'matte' };
      const holder = new THREE.Group();
      holder.name = 'cat_shell_' + id;     // camera.js: cat_*_ is structural, never auto-faded
      group.add(holder);
      const sh = { id, p, holder, meshes: [], mats: [], fade: 0 };
      shells.push(sh);
      return p;
    },
    /**
     * Register the walkable room inside a shell: floor height, footprint (for
     * the "am I inside" test), and the shell that hides while you are in it.
     *   { id, x, z, w, d, rot, y, h, shell, label }
     */
    room(o) {
      const r = {
        id: o.id, x: o.x, z: o.z, w: o.w, d: o.d, rot: o.rot || 0,
        y: o.y, h: o.h ?? 4.2, floorY: o.floorY ?? (o.y + 0.02),
        shell: shells.find((s) => s.id === (o.shell ?? o.id)) || null,
        label: o.label || o.id, inside: false, fade: 0, doors: [],
      };
      rooms.push(r);
      return r;
    },
    /**
     * A door that swings. `x,z` is the middle of the opening on the wall plane,
     * `ry` the wall's outward facing. Closed, it blocks the gap in the wall;
     * open, the blocker is off and the leaf has swung out of the way.
     */
    door(o) {
      const W = o.w ?? 1.9, H = o.h ?? 3.0, ry = o.ry || 0;
      const c = Math.cos(ry), s = Math.sin(ry);
      // hinge on the -X side of the opening (local X = (c,-s), local Z = (s,c))
      const side = o.hinge ?? -1;
      const hx = o.x + side * (W / 2) * c, hz = o.z - side * (W / 2) * s;
      const holder = T.part((p) => {
        doorLeaf(p, frame(0, 0, 0, 0), -side * W / 2, 0.0, W, H, o.color ?? P.PAL.wood, { flap: o.flap, ao: 0 });
        p.sph(-side * (W - 0.3), 1.45, 0.26, 0.13, P.PAL.gold, { seg: 6, rings: 4 });
      }, 'door_' + o.id);
      holder.position.set(hx, o.y, hz);
      holder.rotation.y = ry;
      // NB: collider `h` is a WORLD height (the player clears it when his feet
      // are above it), so it is the floor plus the head of the opening.
      const blocker = { x: o.x + s * 0.12, z: o.z + c * 0.12, w: W + 0.5, d: 0.6, rot: -ry, h: o.y + H, box: true };
      ctx.colliders.push(blocker);
      const d = {
        id: o.id, room: o.room, holder, blocker, base: ry, swing: o.swing ?? -1.85,
        open: false, t: 0, w: W, h: H, x: o.x, z: o.z,
      };
      doorList.push(d);
      if (o.room) o.room.doors.push(d);
      // the interactable itself: stand in front of it and press E
      const px = o.x + s * 1.5, pz = o.z + c * 1.5;
      pending.push({
        id: 'door_' + o.id, x: px, z: pz, r: o.r ?? 3.0, label: 'Open door',
        onInteract(c2, self) {
          d.open = !d.open;
          blocker.solid = !d.open;
          self.label = d.open ? 'Close door' : 'Open door';
          c2.systems.ui?.prompt(self.label, self);
          ctx.events.emit('interior:door', { id: d.id, open: d.open });
          if (o.say && d.open) c2.systems.ui?.say(o.say, { speaker: o.speaker ?? (o.room?.label || 'DOOR').toUpperCase() });
        },
      });
      return d;
    },

    // ── night light spill (free: one merged additive mesh for the whole town) ─
    /** Warm pool of light lying on the ground at (x,y,z), radius r. */
    pool(x, y, z, r) { kit.hquad(x, y, z, r * 2, r * 2, 0xffffff, { mat: 'spill' }); },
    /** Warm wash on a wall, centred on (x,y,z), facing +Z rotated by ry. */
    wash(x, y, z, w, h, ry = 0) { kit.quad(x, y, z, w, h, 0xffffff, { ry, mat: 'spill' }); },
    /** the radial-falloff texture, for systems that need their own glow mesh */
    get blob() { return BLOB; },
  };

  // every lamppost / bench / planter / crate / fence / hedge / column that
  // parts.js builds registers its own oriented box (wave-2 collision contract)
  setCollector({
    box: (x, z, w, d, rot, h) => T.wall(x, z, w, d, rot, h),
    circle: (x, z, r, h) => T.col(x, z, r, h),
  });

  // Every crate in town wears this painted plank face (see parts.js crate()):
  // one atlas cell, two triangles a side, and it turns forty grey boxes on the
  // quay into forty stencilled fish crates.
  P.setCrateFace(atlas.panel(1.0, 0.8, (g, W, H) => {
    const planks = ['#b4834f', '#a9794a', '#bd8d58', '#a37345'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = planks[i];
      g.fillRect(0, H * i / 4, W, H / 4 + 1);
      g.strokeStyle = 'rgba(66,42,20,.5)'; g.lineWidth = H * 0.016;
      g.beginPath(); g.moveTo(0, H * i / 4); g.lineTo(W, H * i / 4); g.stroke();
      // grain
      g.strokeStyle = 'rgba(90,60,30,.28)'; g.lineWidth = H * 0.006;
      for (let k = 0; k < 3; k++) {
        const y = H * (i / 4 + 0.07 + k * 0.06);
        g.beginPath(); g.moveTo(W * 0.05, y); g.bezierCurveTo(W * 0.35, y + H * 0.012, W * 0.62, y - H * 0.012, W * 0.95, y); g.stroke();
      }
    }
    // the stencil, half worn off
    g.save(); g.translate(W * 0.5, H * 0.46); g.rotate(-0.03);
    g.fillStyle = 'rgba(38,62,58,.8)';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${H * 0.24}px ${FONTS.SANS}`;
    g.fillText('FISH', 0, -H * 0.08);
    g.font = `bold ${H * 0.095}px ${FONTS.SANS}`;
    g.fillText('THIS WAY UP', 0, H * 0.13);
    // …and the arrow points down. it has always pointed down.
    g.strokeStyle = 'rgba(38,62,58,.8)'; g.lineWidth = H * 0.03; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W * 0.34, H * 0.02); g.lineTo(W * 0.34, H * 0.2);
    g.moveTo(W * 0.28, H * 0.13); g.lineTo(W * 0.34, H * 0.2); g.lineTo(W * 0.4, H * 0.13); g.stroke();
    g.restore();
    g.globalAlpha = 0.14; g.fillStyle = '#3a2a16'; g.fillRect(0, 0, W, H * 0.16);
  }, 84));

  // ── build the town ─────────────────────────────────────────────────────────
  const districts = [
    ['arrival', buildArrival], ['plaza', buildPlaza], ['street', buildStreet],
    ['meow', buildMeowDonalds], ['square', buildSquare], ['heights', buildHeights],
    ['gym', buildGym], ['harbor', buildHarbor], ['watch', buildWatchtower],
    ['yarn', buildYarnHill], ['commons', buildCommons],
  ];
  for (const [name, fn] of districts) {
    try { kit.at(name); fn(T); }
    catch (err) { console.error(`[cat/arch] district ${name} failed:`, err); }
  }

  // sign materials, one pair per atlas page (pages are allocated lazily)
  atlas.commit();
  if (MOBILE) {
    atlas.halve(4);
    const grid = atlas.combine();          // all pages → one (see the header)
    kit.remapPages(grid);
    for (const sh of shells) sh.p.remapPages(grid);
    for (const { p } of parts) p.remapPages(grid);
  }
  atlas.pages.forEach((p, i) => {
    mats['sign' + i] = new THREE.MeshStandardMaterial({ map: p.tex, vertexColors: true, roughness: 0.86, metalness: 0.0 });
    mats['signglow' + i] = new THREE.MeshStandardMaterial({ map: p.tex, emissiveMap: p.tex, emissive: 0xffffff, emissiveIntensity: 0.0, vertexColors: true, roughness: 0.8, metalness: 0.0 });
  });

  // ── fadeable shells, each with its OWN copy of the opaque materials ────────
  // (cloning is what lets one building dissolve without dissolving the town)
  let shellMeshes = 0, shellTris = 0;
  for (const sh of shells) {
    const m = { ...mats };
    sh.clones = {};
    for (const bk of sh.p.buckets.values()) {
      const k = bk.mat;
      if (!mats[k] || sh.clones[k]) continue;
      m[k] = mats[k].clone(); m[k].name = k + '_' + sh.id;
      sh.mats.push(m[k]); sh.clones[k] = m[k];
    }
    const r = sh.p.finish(m, sh.holder);
    sh.meshes = r.meshes; shellMeshes += r.meshes.length; shellTris += r.tris;
  }

  const report = {};
  const out = kit.finish(mats, group, report);
  let partMeshes = 0, partTris = 0;
  for (const { p, holder } of parts) {
    const r = p.finish(mats, holder); partMeshes += r.meshes.length; partTris += r.tris;
    // `noShadow` parts are hair-thin things (the string-light cords) whose
    // shadow is pure aliasing across a lit street.
    if (holder.userData.noShadow) for (const m of r.meshes) m.castShadow = false;
    // mobile: of the small moving parts only the door leaves (building) cast
    if (MOBILE && !/^cat_door_/.test(holder.name)) for (const m of r.meshes) m.castShadow = false;
  }

  // ── mobile packaging (see the header) ─────────────────────────────────────
  const spillMeshes = [];
  const roomDetail = [];      // { room, meshes, shown }
  // Both tiers (the desktop half since Contract J): the additive night spill is
  // frustum-culled (its bounds are exact — the kit used to leave it unculled, so
  // it drew 2 calls from Candyland), and skipped entirely by day, when additive
  // × opacity 0 adds exactly nothing to the frame.
  group.traverse((o) => {
    if (o.isMesh && o.material === mats.spill) { o.frustumCulled = true; spillMeshes.push(o); }
  });
  if (MOBILE) {
    for (const m of out.meshes) {
      if (m.material === mats.metal) m.castShadow = false;
    }
    for (const r of rooms) {
      const list = out.meshes.filter((m) => m.name === 'cat_int_' + r.id + '_matte');
      if (!list.length) continue;
      for (const m of list) m.visible = false;
      roomDetail.push({ room: r, meshes: list, shown: false });
    }
    for (const sh of shells) sh.meshMats = sh.meshes.map((m) => m.material);
    const culler = createInstanceCuller(ctx);
    for (const m of out.meshes) {
      // (not the spill: its visibility is the day/night switch above; not the
      // room furniture: roomDetail owns its visibility)
      if (m.material === mats.spill || /^cat_int_/.test(m.name)) continue;
      const pool = /^cat_town_/.test(m.name) && !m.castShadow;   // ironwork, bulbs, lamps, glass, signs
      const mass = m.material === mats.matte;                     // a district's casting bulk
      if (!pool && !mass) continue;
      try { culler.addIndexed(m, triangleTiles(m.geometry, 32)); } catch (e) { console.warn('[cat/arch] tile cull skipped', m.name, e.message); }
    }
  }
  /** can the camera see into this room right now? (mobile only) */
  function roomOpen(r) {
    if (r.inside || r.fade > 0.001) return true;
    for (const d of r.doors) if (d.open || d.t > 0.01) return true;
    const sh = r.shell;
    if (sh && sh.meshMats) for (let i = 0; i < sh.meshes.length; i++) {
      const m = sh.meshes[i];
      if (!m.visible || m.material !== sh.meshMats[i]) return true;   // ghosted or culled by the camera
    }
    return false;
  }

  // ── walkable pier deck ─────────────────────────────────────────────────────
  const getDeckHeight = (x, z) => {
    for (const d of deck) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d.y;
    return null;
  };
  ctx.walkables.push({ id: 'cat_pier', test: getDeckHeight });

  // ── walkable interior floors (and the tower's plinth ledges) ───────────────
  ctx.walkables.push({
    id: 'cat_interiors',
    test(x, z) {
      for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i];
        // kit yaw: local +X is (cos, -sin), so the inverse is (c, -s / s, c)
        const dx = x - r.x, dz = z - r.z, c = Math.cos(r.rot), s = Math.sin(r.rot);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) < r.w / 2 && Math.abs(lz) < r.d / 2) return r.floorY;
      }
      return null;
    },
  });

  // ── interactables (interaction system is created after us) ─────────────────
  function registerAll() {
    const I = ctx.systems.interaction;
    if (!I) return;
    for (const p of pending) {
      let i = 0;
      I.register({
        id: 'cat_' + p.id, x: p.x, z: p.z, r: p.r, label: p.label,
        onInteract(c, self) {
          if (p.onInteract) return p.onInteract(c, self);
          const line = p.lines[i % p.lines.length]; i++;
          c.systems.ui?.say(line, { speaker: p.speaker });
          p.onEach?.(c, i);
        },
      });
    }
  }
  let registered = false;
  const registerOnce = () => { if (registered) return; registered = true; registerAll(); };
  ctx.events.on('world:ready', registerOnce);

  // ── night ──────────────────────────────────────────────────────────────────
  const signGlowKeys = Object.keys(mats).filter((k) => k.startsWith('signglow'));
  let lastDl = -1;

  // ── interiors: roofs off while you are inside, doors that swing ────────────
  /** Is (x,z,y) inside this room's footprint? (a hair of margin at the door) */
  function insideRoom(r, p) {
    const dx = p.x - r.x, dz = p.z - r.z, c = Math.cos(r.rot), s = Math.sin(r.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < r.w / 2 + 0.5 && Math.abs(lz) < r.d / 2 + 0.5 && p.y > r.y - 2.2 && p.y < r.y + r.h + 1.5;
  }
  function applyFade(sh, k) {
    const op = 1 - 0.85 * k;
    for (const m of sh.mats) {
      const want = k > 0.006;
      // three.js bakes `transparent` into the program: flipping it without
      // needsUpdate leaves the shell rendering fully opaque at opacity 0.15.
      if (m.transparent !== want) { m.transparent = want; m.needsUpdate = true; }
      m.opacity = op; m.depthWrite = k < 0.5;
    }
    // Once you are properly inside, the shell goes away completely: half a dozen
    // overlapping ghost surfaces (walls, bands, roof, ceiling) stack up into a
    // milky haze over the room they are supposed to be revealing.
    for (const m of sh.meshes) { m.castShadow = k < 0.5; m.renderOrder = k > 0.006 ? 2 : 0; m.visible = k < 0.93; }
  }
  function setDoor(d, open) {
    d.open = open;
    d.blocker.solid = !open;
  }

  const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  const api = {
    group, districts: districts.map((d) => d[0]), getDeckHeight,
    /** [{ id, x, z, w, d, rot, y, inside }] — the enterable rooms of Cat Island */
    interiors: rooms,
    doors: doorList,
    /** Open every door of a room (and report it). api.enter('meow') */
    enter(id) { const r = rooms.find((k) => k.id === id); if (r) for (const d of r.doors) setDoor(d, true); return r || null; },
    exit(id) { const r = rooms.find((k) => k.id === id); if (r) for (const d of r.doors) setDoor(d, false); return r || null; },
    openDoor(id, open = true) { const d = doorList.find((k) => k.id === id); if (d) setDoor(d, open); return d || null; },
    stats: () => ({
      meshes: out.meshes.length + partMeshes + shellMeshes, triangles: Math.round(out.tris + partTris + shellTris),
      prims: kit.prims, parts: parts.length, shells: shells.length, rooms: rooms.length, doors: doorList.length,
      signPages: atlas.pages.length, lights: lights.length, acts: pending.length, buildMs: Math.round(ms),
    }),
    update(dt, c) {
      if (!registered && c.systems.interaction) registerOnce();
      // Frame 1: every other builder has placed its props against our footprint
      // claims, so let them go. What is left is the accurate wall geometry —
      // which is what the player, the camera and the interiors all want.
      if (claims.length) { for (const cl of claims) cl.r = 0; claims.length = 0; }
      // interiors
      const pp = c.systems.player?.position;
      if (pp) for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i];
        const ins = insideRoom(r, pp);
        if (ins !== r.inside) {
          r.inside = ins;
          c.events.emit(ins ? 'interior:enter' : 'interior:exit', { id: r.id, label: r.label });
        }
        const want = ins ? 1 : 0;
        if (Math.abs(r.fade - want) > 0.002) {
          r.fade = damp(r.fade, want, 9, dt);
          if (Math.abs(r.fade - want) <= 0.002) r.fade = want;
          if (r.shell) applyFade(r.shell, r.fade);
        }
      }
      for (let i = 0; i < doorList.length; i++) {
        const d = doorList[i];
        const want = d.open ? 1 : 0;
        if (Math.abs(d.t - want) > 0.001) {
          d.t = damp(d.t, want, 7, dt);
          if (Math.abs(d.t - want) <= 0.001) d.t = want;
          d.holder.rotation.y = d.base + d.t * d.swing;
        }
      }
      const dl = c.state.daylight ?? 1;
      // The sky system owns the lamp schedule (on ~18:50, full 19:24, out 06:21).
      // Everything that is a LAMP — bulbs, lantern glass, lit windows, the spill
      // pools, the six PointLights — rides that, so Main Street is not blazing at
      // dawn; (1 - daylight) is only the fallback if sky has not published it.
      const ev = c.systems.sky?.lampMix ?? Math.min(1, (1 - dl) * 1.25);
      if (Math.abs(ev - lastDl) > 0.004) {
        lastDl = ev;
        mats.glow.emissiveIntensity = ev * 1.55;   // bulbs: bright amber, NOT white
        mats.lamp.emissiveIntensity = 0.7 + ev * 0.9;   // interior lamps never go off
        mats.win.emissiveIntensity = ev * 1.15;    // lit rooms behind glass
        mats.spill.emissiveIntensity = ev * 1.0;   // pools + washes + halos
        mats.spill.opacity = ev;                   // additive × srcAlpha: 0 by day
        for (const k of signGlowKeys) mats[k].emissiveIntensity = ev * 1.15;
        // the fadeable shells own private copies of whatever they use: keep the
        // night glow on those in step with the town-wide originals
        for (const sh of shells) for (const k in sh.clones) if (mats[k].emissiveIntensity !== undefined) sh.clones[k].emissiveIntensity = mats[k].emissiveIntensity;
        for (const a of lights) a.level = a.peak * ev * 34;
        // additive spill × opacity 0 is invisible by day — skip the draw
        for (let i = 0; i < spillMeshes.length; i++) spillMeshes[i].visible = ev > 0.004;
      }
      // mobile: interior furniture only while the room can be seen into
      // (edge-triggered, so the camera's own per-mesh culling is never fought)
      for (let i = 0; i < roomDetail.length; i++) {
        const R = roomDetail[i], want = roomOpen(R.room);
        if (want !== R.shown) { R.shown = want; for (const m of R.meshes) m.visible = want; }
      }
      const t = c.state.elapsed;
      for (let i = 0; i < anims.length; i++) anims[i](t, dt, dl, c, ev);
    },
  };
  console.warn("[cat/arch]", JSON.stringify(api.stats()), JSON.stringify(report));
  return api;
}
