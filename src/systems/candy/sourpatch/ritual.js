// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KIDS — THE DUSK RITUAL (Contract O, owner "ritual").
//
// Ben: "Instead of disappearing, when Sour Patch kids all look at you and run
// away at 7:30 they should all gather in their town and have a freaky ritual
// before returning as their zombie forms to hunt the player."
//
// THE CLOCK. The ritual keeps its own clock, rt, in seconds from the dusk
// freeze (18:30). A game hour is DAY_LENGTH_SEC / 24 = 12.5 s, so the whole
// rite is ≈ 3.2 game hours of evening — the hunt now begins at ≈ 21:42, not
// 19:30. rt runs on dt (a harness render with the clock frozen still plays the
// rite); a clock JUMP into the evening seeds it from the clock
// (rt = (time − 18.5) × 12.5): the kids are where the rite would have them.
//
//   0.0  THE FREEZE (sourpatch.js duskBrain stage 0, unchanged): all 24 stop
//        mid-pose, face the visitor exactly and tilt their heads. 3.2 s.
//   3.2  THE RUN: every kid turns as one and RUNS for the Sour Shrine
//        (LANDMARKS.sour_shrine, deep in the Gummy Forest) — hands behind its
//        back, grinning, ~7–8 u/s, along the licorice (sourpatch.js
//        strollBrain with the ring slot as its goal). One nobody can see, far
//        from the visitor, is put on the forest path's approach instead
//        (a column that runs the last 25–50 u up the licorice: THE PROCESSION);
//        by DUE (19:29) a straggler nobody can see is put at the shrine.
//  13.6  THE RINGS: two concentric rings on the grass round the dais — 11 at
//        r≈10.9, 12 at r≈13.2, each spot pushOut-tested at world:ready — and
//        Violet, the royal one, at the stone. All face the altar.
//        The chant: a unison sway and head tilt (one 3.2 s beat for all 24),
//        arms rising as the rite goes on, a hum + a giggle chant
//        (ctx.systems.audio.play('sourpatch_hum' / 'sourpatch_chant') when
//        audio exists; captions near the shrine), the eight candy-cane torches
//        lighting one by one round the ring (from 15.0, every 1.75 s), the
//        sugar-crystal altar (a crown on the stone + shards round its plinth)
//        swelling with light.
//  32.4  BACKS: all 24 turn their backs to the centre in one slow unison turn…
//  33.2  …and their eyes go DARK: black sockets, no glow, no grin light; the
//        torches gutter low; silence. A slow unison head tilt.
//  36.6  THE PULSE: a curtain of light rolls out of the altar across the rings,
//        the torches flare, and ring by ring they whirl round once and come
//        out of it ZOMBIE — the night rig: grin gaping, eyes lit (and hotter
//        for a while), the reach, the hunch.
//  40.0  THE HUNT, as today (cap 10, watchers, salt, water). The ones the
//        visitor can see (or within 42 u of him) hunt from where they stand;
//        the rest come for him out of the dark as they always did. The raid
//        pack musters out of the shrine now (raid.js 'muster').
//
// THE WATCHER. The visitor may watch from the shrine's edge. Stepping inside
// the outer ring (r − 0.5) once the rings are formed breaks it: every head
// SNAPS to him, the chant stops, 0.9 s later they ignite ZOMBIE where they
// stand (a pulse, no whirl) and at 1.7 s the hunt starts early.
// He does not have to be there: the rite runs if he is on Cat Island too.
// Dawn reversion is unchanged (sourpatch.js startDawn). The torches burn all
// night and go out at dawn.
//
// Meshes (sourpatch-owned, built at world:ready): the torches' poles + cups +
// the altar crystals (1 call, casts), the flames + their halos (1 call, a
// shader), the pulse curtain (1 call, only during the pulse) = +3 drawn (+1
// shadow). The two NPC PointLights (sourpatch's eye lights) are the altar and
// the torch fire while the rite runs — no new lights.
//
// Nothing here allocates per frame.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, smoothstep, damp } from '../../../core/util.js';

export const RIT_START_H = 18.5;                 // the dusk freeze (sourpatch.js)
/** The rite, in seconds of ritual clock from the freeze. */
export const RT = {
  FREEZE: 3.2,          // the stare (sourpatch.js duskBrain stage 0)
  DUE: 12.4,            // a straggler nobody can see is put at the shrine
  RINGS: 13.6,          // the rings are formed: the hum
  TORCH0: 15.0,         // the first torch…
  TORCH_GAP: 1.75,      // …and one more every this
  ALTAR0: 19.0, ALTAR1: 31.0,
  BACKS: 32.4,          // they turn their backs to the centre
  TURN: 1.1,            // …over this
  DARK: 33.2,           // their eyes go dark
  PULSE: 36.6,          // the pulse of light
  WHIRL: 0.8,           // s: the turn round (ring by ring)
  END: 40.0,            // the hunt
  SNAP_PULSE: 0.9,      // the snap: s until they ignite…
  SNAP_END: 1.7,        // …and until the hunt
};
/** The clock hour the rite hands over to the hunt. */
export const ritualEndH = (secPerH) => RIT_START_H + RT.END / secPerH;

const TAU = Math.PI * 2;
const NT = 8;                  // torches
const BEAT = 3.2;              // s: the unison sway
const RUN_MUL = 1.9;           // the run: strollBrain's walking speeds × this (≈ 5–8 u/s)
const RING_A = 10.9, RING_B = 13.2, NA = 11, NB = 12;
const TORCH_R = 9.9;
const ALT_R0 = 3.7, ALT_R1 = 8.0;  // the altar's pool of light on the dais (inner, outer)
const BEAM_W = 1.6, BEAM_H = 17;   // the up-light out of the crown (half width at its foot, height)
const SEE_R = 15;              // nobody is moved with the visitor this close
const WARP_FROM = 34;          // …or while it is this close to the shrine already
const KEEP_R = 42;             // at the hunt: kids this close to him (or in view) hunt from where they stand
const PITCH_UP = -0.3;         // heads up at the crown on the stone
const STUCK_SEC = 2.6;         // s no closer to its place on the run: give the walk up (see runBrain)
const EXIT_SEC = 6;            // s: making for one way out of the picture before it looks again
const ALTAR_COL = new THREE.Color(0xc4ff4a);
const FLAME_CORE = new THREE.Color(0xfffbd0), FLAME_MID = new THREE.Color(0xb6ff3c), FLAME_TIP = new THREE.Color(0x20c060);

// scratch
const _o = { x: 0, z: 0, hit: false };
const _pt = { x: 0, z: 0, tx: 1, tz: 0 };

export function createRitual(ctx, D) {
  const { world } = ctx;
  const { kids, V } = D;
  const SH = world.LANDMARKS.sour_shrine || { x: -218, z: -44 };
  const X = SH.x, Z = SH.z;
  const secPerH = () => (world.DAY_LENGTH_SEC || 300) / 24;
  const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const ease = (e) => e * e * (3 - 2 * e);
  const ni = (g) => { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; };

  // ── state ──────────────────────────────────────────────────────────────────
  let active = false, rt = 0, over = false, snapAt = -1, pending = -1, nights = 0;
  let hum = false, chantCd = 0, backsSaid = false, pulsed = false, revealSaid = false, runSaid = false, lastLit = -1;
  let outerR = RING_B, laidOut = false, yC = world.height(X, Z);
  let ringLvl = 0;
  let altarLvl = 0, altarFlash = 0, pulseT = -1, eyeK = 1, lightsOwned = false, nightLit = false, beamLvl = 0;
  const lit = new Float32Array(NT);              // the flames' drawn level (animated)
  const litAt = new Float32Array(NT);            // rt each one lights at (in lighting order)
  const flare = new Float32Array(NT);
  const ign = new Uint8Array(NT);                // lit tonight (its burst has fired)
  const stat = { nights: 0, warps: 0, placed: 0, stuck: 0, boxed: 0, allInRt: null, snaps: 0, reveals: 0, lit: 0, within14: 0, ringed: 0, slots: 0, torches: 0, snapRt: null };

  // ── the layout: torches, ring spots, the procession's approach ─────────────
  const torches = [];           // {x, z, y, a}
  const slotX = new Float32Array(kids.length), slotZ = new Float32Array(kids.length), slotRing = new Uint8Array(kids.length);
  const apX = new Float32Array(kids.length), apZ = new Float32Array(kids.length);
  const candX = [], candZ = [];
  const EX_MAX = 256, exX = new Float32Array(EX_MAX), exZ = new Float32Array(EX_MAX);
  let exN = 0;
  // the forest path, from the shrine outward (the licorice the procession runs up)
  const FP = (world.PATHS.find((q) => q.id === 'candy_forest')?.points || [[-170, 30], [-185, 0], [-200, -20], [X, Z]]).slice().reverse();
  function pathAt(s, out) {
    let acc = 0;
    for (let j = 0; j < FP.length - 1; j++) {
      const [x0, z0] = FP[j], [x1, z1] = FP[j + 1], L = dist2d(x0, z0, x1, z1);
      if (acc + L >= s || j === FP.length - 2) {
        const f = clamp((s - acc) / (L || 1), 0, 1.5);
        out.x = x0 + (x1 - x0) * f; out.z = z0 + (z1 - z0) * f; out.tx = (x1 - x0) / (L || 1); out.tz = (z1 - z0) / (L || 1);
        return out;
      }
      acc += L;
    }
    return out;
  }
  function solid(x, z, r) {
    const pl = ctx.systems.player;
    if (pl && typeof pl.pushOut === 'function') return pl.pushOut(x, z, r, _o).hit;
    return D.blocked(x, z, r);
  }
  const land = (x, z) => x < 0 && world.islandAt(x, z) === 'candy' && world.height(x, z) > 0.6 && !D.water.wet(x, z) && !D.water.terrainWet(x, z);
  function layout() {
    if (laidOut) return;
    laidOut = true;
    yC = world.height(X, Z);
    const pathA = Math.atan2(FP[1][1] - Z, FP[1][0] - X);          // the bearing the licorice comes in on
    // eight candy-cane torches just outside the dais kerb, in the gaps
    // between the statues (their light reaches the stone through them)
    for (let i = 0; i < NT; i++) {
      const a0 = i * TAU / NT;
      let got = null;
      for (const da of [0, 0.07, -0.07, 0.14, -0.14, 0.21, -0.21, 0.28, -0.28, 0.36, -0.36]) {
        for (const dr of [0, 0.35, -0.3, 0.7, 1.1]) {
          const a = a0 + da, r = TORCH_R + dr, x = X + Math.cos(a) * r, z = Z + Math.sin(a) * r;
          if (land(x, z) && !solid(x, z, 0.62)) { got = { x, z, a, y: world.height(x, z) }; break; }
        }
        if (got) break;
      }
      if (got) torches.push(got);
    }
    // lit one by one round the ring, starting beside the path
    const order = torches.map((t, i) => i).sort((i, j) => {
      const ai = ((torches[i].a - pathA) % TAU + TAU) % TAU, aj = ((torches[j].a - pathA) % TAU + TAU) % TAU;
      return ai - aj;
    });
    order.forEach((ti, n) => { litAt[ti] = RT.TORCH0 + n * RT.TORCH_GAP; });
    for (let i = torches.length; i < NT; i++) litAt[i] = 1e9;
    for (const t of torches) ctx.colliders?.push({ x: t.x, z: t.z, r: 0.3 });
    stat.torches = torches.length;
    // the rings
    const spots = [];
    const clear = (x, z, r) => {
      if (!land(x, z) || solid(x, z, r) || D.lowNear(x, z, r)) return false;
      for (const t of torches) if (dist2d(x, z, t.x, t.z) < 1.3) return false;
      for (const s of spots) if (dist2d(x, z, s.x, s.z) < 1.45) return false;
      return true;
    };
    const ring = (n, R, off, rmax, ringNo) => {
      for (let j = 0; j < n; j++) {
        const a0 = pathA + (j + off) / n * TAU;
        let got = null;
        for (const dr of [0, -0.35, 0.35, -0.7, 0.55, -1.0]) {
          const r = Math.min(rmax, R + dr);
          for (const da of [0, 0.05, -0.05, 0.1, -0.1, 0.16, -0.16, 0.22, -0.22, 0.29, -0.29]) {
            const a = a0 + da, x = X + Math.cos(a) * r, z = Z + Math.sin(a) * r;
            if (clear(x, z, 0.66)) { got = { x, z, ring: ringNo }; break; }
          }
          if (got) break;
        }
        if (got) spots.push(got);
      }
    };
    ring(NA, RING_A, 0.5, 11.9, 1);
    ring(NB, RING_B, 0, 13.75, 2);
    if (spots.length < kids.length - 1) ring(12, 12.05, 0.25, 12.7, 2);
    if (spots.length < kids.length - 1) ring(14, 14.6, 0.5, 15.6, 2);
    let rsum = 0, rn = 0;
    for (const s of spots) if (s.ring === 2) { rsum += dist2d(s.x, s.z, X, Z); rn++; }
    outerR = rn ? rsum / rn : RING_B;
    stat.slots = spots.length;
    let si = 0;
    for (const k of kids) {
      if (k.role === 'shrine') {
        // Violet, the royal one: at the stone, inside the statues' ring (her
        // day spot, where the ground core puts her against the plinth)
        const pl = ctx.systems.player;
        const q = pl && typeof pl.pushOut === 'function' ? pl.pushOut(k.anchor.x, k.anchor.z, k.r, _o) : { x: k.anchor.x, z: k.anchor.z };
        slotX[k.i] = q.x; slotZ[k.i] = q.z; slotRing[k.i] = 0;
        continue;
      }
      const s = spots[si++] || spots[(si - 1) % Math.max(1, spots.length)] || { x: X + 12, z: Z };
      slotX[k.i] = s.x; slotZ[k.i] = s.z; slotRing[k.i] = s.ring;
    }
    // the procession: a double file up the forest path, 25–52 u out
    let j = 0;
    for (const k of kids) {
      const sOut = 25 + j * 1.2, side = j % 2 ? 0.85 : -0.85;
      j++;
      pathAt(sOut, _pt);
      let x = _pt.x, z = _pt.z, ok = false;
      for (const lat of [side, 0, -side, side * 2, -side * 2, side * 3]) {
        const px = _pt.x - _pt.tz * lat, pz = _pt.z + _pt.tx * lat;
        if (land(px, pz) && !solid(px, pz, 0.62)) { x = px; z = pz; ok = true; break; }
      }
      if (!ok) { x = _pt.x; z = _pt.z; }
      apX[k.i] = x; apZ[k.i] = z;
    }
    // the ways out of the picture: points along all the licorice, every 5 u
    for (const q of world.PATHS) {
      if (q.island !== 'candy') continue;
      for (let j = 0; j < q.points.length - 1 && exN < EX_MAX; j++) {
        const [x0, z0] = q.points[j], [x1, z1] = q.points[j + 1], L = dist2d(x0, z0, x1, z1);
        for (let u = 0; u < L && exN < EX_MAX; u += 5) {
          const x = x0 + (x1 - x0) * u / L, z = z0 + (z1 - z0) * u / L;
          if (land(x, z) && !solid(x, z, 0.62)) { exX[exN] = x; exZ[exN] = z; exN++; }
        }
      }
    }
    // …and spots out in the trees all round, for when that is in view
    for (const R of [19, 23, 27, 33]) for (let a = 0; a < 18; a++) {
      const ang = a / 18 * TAU + R * 0.1, x = X + Math.cos(ang) * R, z = Z + Math.sin(ang) * R;
      if (land(x, z) && !solid(x, z, 0.62)) { candX.push(x); candZ.push(z); }
    }
    build();
  }

  // ── meshes ─────────────────────────────────────────────────────────────────
  const group = new THREE.Group(); group.name = 'sourpatch-ritual';
  let solidMesh = null, flameMesh = null, pulseMesh = null, flameMat = null, pulseMat = null;
  const uAltar = { value: 0 }, uLit = { value: new Float32Array(NT) }, uTime = { value: 0 }, uPulse = { value: 0 };
  const uRing = { value: 0 }, uSweep = { value: 0 };
  const uAltarG = { value: 0 }, uBeam = { value: 0 }, uHalo = { value: 3 };
  function paint(geo, fn) {
    const pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3), glow = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) { glow[i] = fn(pos.getX(i), pos.getY(i), pos.getZ(i), c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    return geo;
  }
  const RED = new THREE.Color(0xe8263e), CREAM = new THREE.Color(0xfff4ea), LIC = new THREE.Color(0x2b2438), GUM = new THREE.Color(0x9ad63a), SUGAR = new THREE.Color(0xeaffd2);
  /** A ground-hugging piece of the sigil for the flame shader (kind 2 ring
   *  strip / 3 slot mark), in world space. */
  function sigilGeo(pos, q, kind) {
    const n = pos.length / 3, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0).map((v, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    g.setAttribute('aC', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aQ', new THREE.BufferAttribute(new Float32Array(q), 2));
    g.setAttribute('aY', new THREE.BufferAttribute(new Float32Array(n), 1));
    return g;
  }
  function build() {
    const parts = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const t of torches) {
      // the pole: a candy cane, red and cream in a spiral
      const pole = ni(new THREE.CylinderGeometry(0.11, 0.15, 2.9, 10, 16));
      paint(pole, (x, y, z, c) => {
        const u = ((y + 1.45) * 1.25 + Math.atan2(z, x) / TAU) % 1;
        c.copy(u < 0.5 ? RED : CREAM); return 0;
      });
      pole.translate(t.x, t.y + 1.45 - 0.1, t.z);
      parts.push(pole);
      // a gumdrop foot and a licorice cup at the top
      const foot = ni(new THREE.SphereGeometry(0.34, 9, 6, 0, TAU, 0, Math.PI / 2));
      paint(foot, (x, y, z, c) => { c.copy(GUM); return 0; });
      foot.scale(1, 0.75, 1); foot.translate(t.x, t.y - 0.02, t.z);
      parts.push(foot);
      const cup = ni(new THREE.CylinderGeometry(0.36, 0.17, 0.4, 10, 1));
      paint(cup, (x, y, z, c) => { c.copy(LIC); return 0; });
      cup.translate(t.x, t.y + 2.95, t.z);
      parts.push(cup);
    }
    // THE ALTAR: a sugar-crystal crown on the stone and shards round its plinth
    const crystal = (x, y, z, h, r, rx, rz, ry, glow) => {
      const g = ni(new THREE.OctahedronGeometry(1, 0));
      g.scale(r, h / 2, r);
      g.translate(0, h / 2 - h * 0.1, 0);
      e.set(rx, ry, rz); q.setFromEuler(e); p.set(x, y, z); s.set(1, 1, 1);
      g.applyMatrix4(m4.compose(p, q, s));
      paint(g, (xx, yy, zz, c) => { c.copy(SUGAR); return glow * (0.55 + 0.45 * clamp((yy - y) / h, 0, 1)); });
      parts.push(g);
    };
    // (polish r1: the crown is THE centre of the circle — tall enough to stand
    // clear over the statues' heads from every side of the rings, so every
    // sightline into the circle ends on one lit thing, not on a heap of shapes)
    const top = yC + 7.0;
    crystal(X + 0.15, top - 0.3, Z - 0.1, 5.2, 1.0, 0.05, -0.04, 0.3, 1);
    const CR = [[0.85, 0.2, 2.8, 0.55, 0.38, 0.1], [-0.7, 0.5, 2.4, 0.5, -0.34, 0.25], [0.1, -0.85, 2.6, 0.52, 0.05, -0.4], [-0.45, -0.6, 1.9, 0.42, -0.3, -0.32], [0.65, -0.5, 2.0, 0.42, 0.34, -0.28], [-0.2, 0.85, 1.7, 0.4, -0.1, 0.42]];
    for (const [dx, dz, h, r, rz, rx] of CR) crystal(X + 0.15 + dx, top - 0.35, Z - 0.1 + dz, h, r, rx, rz, dx * 2, 1);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU + 0.3, rr = 2.85;
      // (none in front of the stone's face: one stood over its mouth)
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.4) continue;
      crystal(X + Math.cos(a) * rr, yC + 1.85, Z + Math.sin(a) * rr, 0.9 + (i % 3) * 0.3, 0.26 + (i % 2) * 0.06, Math.sin(a) * 0.35, -Math.cos(a) * 0.35, a, 0.8);
    }
    const geo = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uAltar = uAltar; sh.uniforms.uAltarCol = { value: ALTAR_COL };
      sh.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow;');
      sh.fragmentShader = 'uniform float uAltar;\nuniform vec3 uAltarCol;\nvarying float vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uAltarCol * vGlow * uAltar;');
    };
    mat.customProgramCacheKey = () => 'sourpatch-ritual-solid';
    solidMesh = new THREE.Mesh(geo, mat);
    solidMesh.name = 'sourpatch-ritual-torches';
    solidMesh.castShadow = true; solidMesh.receiveShadow = true;
    group.add(solidMesh);

    // THE FLAMES: a teardrop per torch + a camera-facing halo, one shader,
    // each torch's level from uLit[i]
    const fl = [];
    for (let i = 0; i < torches.length; i++) {
      const t = torches[i], cx = t.x, cy = t.y + 3.12, cz = t.z;
      const pts = [];
      for (let j = 0; j <= 8; j++) { const v = j / 8; pts.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(v, 0.75)) * 0.3 * (1 - v * 0.35), v * 1.05)); }
      const lathe = ni(new THREE.LatheGeometry(pts, 9));
      const n = lathe.attributes.position.count;
      const aT = new Float32Array(n).fill(i), aK = new Float32Array(n), aC = new Float32Array(n * 3), aQ = new Float32Array(n * 2), aY = new Float32Array(n);
      for (let v = 0; v < n; v++) { aY[v] = lathe.attributes.position.getY(v) / 1.05; aC[v * 3] = cx; aC[v * 3 + 1] = cy; aC[v * 3 + 2] = cz; }
      lathe.translate(cx, cy, cz);
      lathe.setAttribute('aT', new THREE.BufferAttribute(aT, 1)); lathe.setAttribute('aK', new THREE.BufferAttribute(aK, 1));
      lathe.setAttribute('aC', new THREE.BufferAttribute(aC, 3)); lathe.setAttribute('aQ', new THREE.BufferAttribute(aQ, 2));
      lathe.setAttribute('aY', new THREE.BufferAttribute(aY, 1));
      lathe.deleteAttribute('uv');
      fl.push(lathe);
      const quad = ni(new THREE.PlaneGeometry(2, 2));
      const m = quad.attributes.position.count;
      const bT = new Float32Array(m).fill(i), bK = new Float32Array(m).fill(1), bC = new Float32Array(m * 3), bQ = new Float32Array(m * 2), bY = new Float32Array(m);
      for (let v = 0; v < m; v++) { bQ[v * 2] = quad.attributes.position.getX(v); bQ[v * 2 + 1] = quad.attributes.position.getY(v); bC[v * 3] = cx; bC[v * 3 + 1] = cy; bC[v * 3 + 2] = cz; }
      quad.setAttribute('aT', new THREE.BufferAttribute(bT, 1)); quad.setAttribute('aK', new THREE.BufferAttribute(bK, 1));
      quad.setAttribute('aC', new THREE.BufferAttribute(bC, 3)); quad.setAttribute('aQ', new THREE.BufferAttribute(bQ, 2));
      quad.setAttribute('aY', new THREE.BufferAttribute(bY, 1));
      quad.deleteAttribute('uv');
      fl.push(quad);
    }
    // THE SIGIL: the two rings they stand on, drawn on the ground in sour
    // light — it draws itself round as the torches light (uSweep) — and a
    // bright mark under every place in them
    const ringR = [0, 0];
    { let a = 0, na = 0, b = 0, nb = 0;
      for (const k of kids) { if (k.role === 'shrine') continue; const r = dist2d(slotX[k.i], slotZ[k.i], X, Z); if (slotRing[k.i] === 1) { a += r; na++; } else { b += r; nb++; } }
      ringR[0] = na ? a / na : RING_A; ringR[1] = nb ? b / nb : RING_B; }
    const pathA0 = Math.atan2(FP[1][1] - Z, FP[1][0] - X);
    const strip = (R, half) => {
      const SEG = 128, pos = [], q = [];
      const at = (s2, side) => {
        const a = pathA0 + s2 / SEG * TAU, r = R + side * half, x = X + Math.cos(a) * r, z = Z + Math.sin(a) * r;
        pos.push(x, D.groundY(x, z) + 0.09, z); q.push(s2 / SEG, side);
      };
      for (let s2 = 0; s2 < SEG; s2++) { at(s2, -1); at(s2, 1); at(s2 + 1, 1); at(s2, -1); at(s2 + 1, 1); at(s2 + 1, -1); }
      return sigilGeo(pos, q, 2);
    };
    fl.push(strip(ringR[0], 0.34), strip(ringR[1], 0.34));
    { const pos = [], q = [], SEG = 10;
      for (const k of kids) {
        if (k.role === 'shrine') continue;
        const cx = slotX[k.i], cz = slotZ[k.i], cy = D.groundY(cx, cz) + 0.1, R = 0.85;
        for (let j = 0; j < SEG; j++) {
          const a0 = j / SEG * TAU, a1 = (j + 1) / SEG * TAU;
          pos.push(cx, cy, cz, cx + Math.cos(a1) * R, cy, cz + Math.sin(a1) * R, cx + Math.cos(a0) * R, cy, cz + Math.sin(a0) * R);
          q.push(0, 0, Math.cos(a1), Math.sin(a1), Math.cos(a0), Math.sin(a0));
        }
      }
      if (pos.length) fl.push(sigilGeo(pos, q, 3));
    }
    // THE ALTAR'S LIGHT (polish r1): the circle's one lit centre —
    //   kind 4  a pool of sour light on the dais all round the stone (it runs
    //           under the statues' feet, so they stand dark against it),
    //   kind 5  a halo round the crown (camera-facing),
    //   kind 6  a pale green up-light rising out of the crown (a ribbon turned
    //           to the camera about its own axis).
    {
      const pos = [], q = [], SEG = 72, RR = [ALT_R0, 4.9, 6.3, ALT_R1];
      const yDais = yC + 1.24;                     // (the dais top, measured: yC + 1.2)
      for (let s2 = 0; s2 < SEG; s2++) {
        const a0 = s2 / SEG * TAU, a1 = (s2 + 1) / SEG * TAU;
        for (let b = 0; b < RR.length - 1; b++) {
          const r0 = RR[b], r1 = RR[b + 1], t0 = (r0 - ALT_R0) / (ALT_R1 - ALT_R0), t1 = (r1 - ALT_R0) / (ALT_R1 - ALT_R0);
          const P = (a, r) => [X + Math.cos(a) * r, yDais, Z + Math.sin(a) * r];
          const v00 = P(a0, r0), v01 = P(a1, r0), v10 = P(a0, r1), v11 = P(a1, r1);
          pos.push(...v00, ...v11, ...v10, ...v00, ...v01, ...v11);
          q.push(t0, 0, t1, 0, t1, 0, t0, 0, t0, 0, t1, 0);
        }
      }
      fl.push(sigilGeo(pos, q, 4));
    }
    const crownX = X + 0.15, crownZ = Z - 0.1;
    const card = (kind, cx, cy, cz, verts) => {
      const n = verts.length, g = new THREE.BufferGeometry();
      const P = new Float32Array(n * 3), C3 = new Float32Array(n * 3), Q = new Float32Array(n * 2), Y = new Float32Array(n);
      verts.forEach(([qx, qy, yy], v) => {
        P[v * 3] = cx + qx; P[v * 3 + 1] = cy + (kind === 6 ? yy * BEAM_H : qy); P[v * 3 + 2] = cz;
        C3[v * 3] = cx; C3[v * 3 + 1] = cy; C3[v * 3 + 2] = cz; Q[v * 2] = qx; Q[v * 2 + 1] = qy; Y[v] = yy;
      });
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(n), 1));
      g.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
      g.setAttribute('aC', new THREE.BufferAttribute(C3, 3));
      g.setAttribute('aQ', new THREE.BufferAttribute(Q, 2));
      g.setAttribute('aY', new THREE.BufferAttribute(Y, 1));
      return g;
    };
    const QUAD = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, -1, 0], [1, 1, 0], [-1, 1, 0]];
    fl.push(card(5, crownX, yC + 8.9, crownZ, QUAD));
    { const B6 = []; const ST = 6;
      for (let j = 0; j < ST; j++) {
        const y0 = j / ST, y1 = (j + 1) / ST;
        B6.push([-1, 0, y0], [1, 0, y0], [1, 0, y1], [-1, 0, y0], [1, 0, y1], [-1, 0, y1]);
      }
      fl.push(card(6, crownX, yC + 8.2, crownZ, B6)); }
    if (fl.length) {
      const fgeo = mergeGeometries(fl, false);
      for (const g of fl) g.dispose();
      fgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(X, yC + 8, Z), 30);
      flameMat = new THREE.ShaderMaterial({
        uniforms: { uLit, uTime, uRing, uSweep, uAltarG, uBeam, uHalo, uCore: { value: FLAME_CORE }, uMid: { value: FLAME_MID }, uTip: { value: FLAME_TIP } },
        vertexShader: /* glsl */`
          attribute float aT; attribute float aK; attribute vec3 aC; attribute vec2 aQ; attribute float aY;
          uniform float uLit[${NT}]; uniform float uTime; uniform float uAltarG; uniform float uBeam; uniform float uHalo;
          varying float vY; varying float vK; varying float vA; varying vec2 vQ; varying float vL;
          void main() {
            float L = uLit[int(aT + 0.5)];
            vK = aK; vY = aY; vQ = aQ; vL = L;
            if (aK > 5.5) {
              // the up-light: a ribbon about its own (vertical) axis, turned
              // to the camera, narrowing as it climbs
              vec3 toC = cameraPosition - aC;
              vec3 rt = normalize(vec3(toC.z, 0.0, -toC.x) + vec3(1e-4, 0.0, 0.0));
              float w = ${BEAM_W.toFixed(2)} * mix(1.0, 0.45, aY) * (0.9 + 0.1 * sin(uTime * 1.7 + aY * 5.0));
              vec3 wp = aC + rt * aQ.x * w + vec3(0.0, aY * ${BEAM_H.toFixed(1)}, 0.0);
              vL = uBeam; vA = 1.0;
              gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
            } else if (aK > 4.5) {
              vec4 mv = modelViewMatrix * vec4(aC, 1.0);
              mv.xy += aQ * uHalo * (0.95 + 0.05 * sin(uTime * 2.3));
              gl_Position = projectionMatrix * mv;
              vL = uAltarG; vA = 1.0;
            } else if (aK > 1.5) {
              // the sigil and the altar's pool: already in world space, on the ground
              vL = aK > 3.5 ? uAltarG : 1.0; vA = 1.0;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            } else if (aK < 0.5) {
              vec3 l = position - aC;
              float fl = 1.0 + 0.16 * sin(uTime * 13.0 + aT * 2.1) + 0.08 * sin(uTime * 23.0 + aT);
              l.xz *= L * (1.0 + 0.1 * sin(uTime * 11.0 + aT * 3.0));
              l.y *= L * fl;
              l.x += sin(uTime * 7.0 + aT * 1.3 + aY * 3.0) * 0.07 * aY * L;
              l.z += cos(uTime * 6.3 + aT * 2.7 + aY * 2.0) * 0.07 * aY * L;
              vec4 mv = modelViewMatrix * vec4(aC + l, 1.0);
              gl_Position = projectionMatrix * mv;
              vec3 n = normalize(normalMatrix * normal);
              vA = 0.3 + 0.7 * abs(dot(n, normalize(-mv.xyz)));
            } else {
              vec4 mv = modelViewMatrix * vec4(aC + vec3(0.0, 0.42 * L, 0.0), 1.0);
              mv.xy += aQ * 1.25 * L * (0.92 + 0.08 * sin(uTime * 9.0 + aT));
              gl_Position = projectionMatrix * mv;
              vA = 1.0;
            }
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uTip; uniform float uRing; uniform float uSweep; uniform float uTime;
          varying float vY; varying float vK; varying float vA; varying vec2 vQ; varying float vL;
          void main() {
            if (vL < 0.01) discard;
            vec3 col; float a;
            if (vK > 5.5) {
              float e = 1.0 - abs(vQ.x); e = e * e * (3.0 - 2.0 * e);
              a = e * pow(1.0 - vY, 1.4) * smoothstep(0.0, 0.08, vY) * min(vL, 1.6) * 0.46 * (0.82 + 0.18 * sin(uTime * 2.6 - vY * 11.0));
              col = mix(uMid, uCore, e * 0.7);
            } else if (vK > 4.5) {
              float r = length(vQ);
              a = smoothstep(1.0, 0.0, r); a = a * a * 0.62 * min(vL, 1.8);
              col = mix(uCore, uMid, smoothstep(0.0, 0.6, r));
            } else if (vK > 3.5) {
              float r = vQ.x;
              a = pow(1.0 - r, 1.7) * min(vL, 1.8) * 0.5 * (0.84 + 0.16 * sin(r * 16.0 - uTime * 2.2));
              col = mix(uCore, uMid, 0.35 + 0.65 * r);
            } else if (vK > 2.5) {
              float r = length(vQ);
              a = (1.0 - smoothstep(0.15, 1.0, r)) * uRing * 1.1 * step(0.02, uSweep);
              col = mix(uCore, uMid, r);
            } else if (vK > 1.5) {
              float e = 1.0 - abs(vQ.y);
              float head = 1.0 - smoothstep(uSweep - 0.03, uSweep, vQ.x);
              a = e * e * uRing * head * (0.62 + 0.38 * sin(uTime * 2.4 - vQ.x * 44.0));
              col = uMid;
            } else if (vK < 0.5) {
              col = mix(mix(uCore, uMid, smoothstep(0.0, 0.5, vY)), uTip, smoothstep(0.5, 1.0, vY));
              a = pow(max(0.0, 1.0 - vY), 0.7) * vA;
            } else {
              float r = length(vQ);
              a = smoothstep(1.0, 0.0, r); a = a * a * 0.5 * min(1.0, vL);
              col = uMid;
            }
            if (a < 0.005) discard;
            gl_FragColor = vec4(col * 1.4, a);
            gl_FragColor = linearToOutputTexel(gl_FragColor);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
      });
      flameMesh = new THREE.Mesh(fgeo, flameMat);
      flameMesh.name = 'sourpatch-ritual-flames'; flameMesh.renderOrder = 4; flameMesh.visible = false;
      group.add(flameMesh);
    }

    // THE PULSE: a curtain of light rolling out of the altar
    const cg = new THREE.CylinderGeometry(1, 1, 3.6, 64, 1, true);
    cg.translate(0, 1.8, 0);
    pulseMat = new THREE.ShaderMaterial({
      uniforms: { uA: uPulse, uCol: { value: new THREE.Color(0xe4ff9a) } },
      vertexShader: 'varying float vH; void main() { vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uA; uniform vec3 uCol; varying float vH; void main() { float a = pow(1.0 - vH, 1.6) * uA; if (a < 0.004) discard; gl_FragColor = linearToOutputTexel(vec4(uCol * 1.6, a)); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    pulseMesh = new THREE.Mesh(cg, pulseMat);
    pulseMesh.name = 'sourpatch-ritual-pulse'; pulseMesh.visible = false; pulseMesh.renderOrder = 5;
    pulseMesh.position.set(X, yC + 0.4, Z);
    group.add(pulseMesh);
    ctx.scene.add(group);
  }
  let compiled = false;
  function precompile() {
    compiled = true;
    if (!flameMesh) return;
    // (the flame and pulse shaders compile behind the loading screen, not on
    // the frame the first torch lights)
    const fv = flameMesh.visible, pv = pulseMesh.visible;
    flameMesh.visible = true; pulseMesh.visible = true;
    try { if (ctx.renderer?.compile && ctx.camera) ctx.renderer.compile(group, ctx.camera, ctx.scene); } catch (e) { /* visuals only */ }
    flameMesh.visible = fv; pulseMesh.visible = pv;
  }
  ctx.events.on('world:ready', () => { try { layout(); } catch (e) { console.warn('[sourpatch/ritual] layout', e?.message || e); } });

  // ── helpers ────────────────────────────────────────────────────────────────
  // (one reused options bag for the shared particle pool: nothing allocated per burst)
  const _bo = { x: 0, y: 0, z: 0, count: 0, color: null, speed: 0, life: 0, size: 0, gravity: 0, spread: 0 };
  const IGNITE_COLS = [0xe4ff9a, 0xfff6c0, 0x7fe85a], PULSE_COLS = [0xe4ff9a, 0xffffff, 0xb6ff3c], EMBER_COLS = [0xe4ff9a, 0xb6ff3c];
  function burst(x, y, z, count, color, speed, life, size, gravity, spread) {
    const ps = ctx.systems.particles; if (!ps?.burst) return;
    _bo.x = x; _bo.y = y; _bo.z = z; _bo.count = count; _bo.color = color; _bo.speed = speed; _bo.life = life; _bo.size = size; _bo.gravity = gravity; _bo.spread = spread;
    ps.burst(_bo);
  }
  function audio(name, x = X, z = Z) { try { ctx.systems.audio?.play?.(name, { x, z }); } catch (e) { /* audio is optional */ } }
  function place(k, x, z) {
    k.x = x; k.z = z; k.px = x; k.pz = z; k.y = k.groundY = D.groundY(x, z); k.moving = 0;
  }
  const kidSeen = (k) => k.vis > 0.05 && D.inView(k.x, k.y, k.z);
  /** Where a far kid nobody can see is put to run the last stretch in: its
   *  place in the procession up the forest path, else a spot in the trees
   *  round the shrine nearest its bearing — never where he can see it. */
  function warpSpot(k, p) {
    const ok = (x, z) => dist2d(x, z, p.x, p.z) > SEE_R && !D.inView(x, D.groundY(x, z), z);
    if (ok(apX[k.i], apZ[k.i])) { _pt.x = apX[k.i]; _pt.z = apZ[k.i]; return _pt; }
    // out in the trees, as near its own place in the ring as it can be — and,
    // of the six nearest by bearing, the first with a clear run in to it
    const sb = Math.atan2(slotZ[k.i] - Z, slotX[k.i] - X);
    let n = 0;
    for (let j = 0; j < candX.length; j++) {
      let da = Math.atan2(candZ[j] - Z, candX[j] - X) - sb; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      let q = n < 6 ? n++ : (da < _wv[5] ? 5 : -1);
      if (q < 0) continue;
      while (q > 0 && _wv[q - 1] > da) { _wv[q] = _wv[q - 1]; _wc[q] = _wc[q - 1]; q--; }
      _wv[q] = da; _wc[q] = j;
    }
    let first = -1;
    for (let q = 0; q < n; q++) {
      const j = _wc[q];
      if (!ok(candX[j], candZ[j])) continue;
      if (first < 0) first = j;
      if (D.lineClear(candX[j], candZ[j], slotX[k.i], slotZ[k.i], k.r || 0.55) === 0) { first = j; break; }
    }
    if (first < 0) return null;
    _pt.x = candX[first]; _pt.z = candZ[first]; return _pt;
  }
  const _wc = new Int16Array(6), _wv = new Float32Array(6);
  function visitorInside(p) {
    const pl = ctx.systems.player;
    if (!pl || pl.onFerry || pl.onVehicle || p.x > 0) return false;
    if (dist2d(p.x, p.z, X, Z) > outerR - 0.5) return false;
    return (p.y ?? 0) - world.height(p.x, p.z) < 3.5;
  }
  const nearestKid = (p) => {
    let best = null, bd = 1e9;
    for (const k of kids) { if (!k.ritOn || k.vis < 0.5) continue; const d = dist2d(k.x, k.z, p.x, p.z); if (d < bd) { bd = d; best = k; } }
    return best;
  };

  // ── the rite's clock ───────────────────────────────────────────────────────
  /** sourpatch.js setPhase('watching'): tonight's rite begins (rt0: seconds
   *  since 18:30 by the clock; a JUMP poses the kids where the rite has them). */
  function start(rt0, jump) {
    if (!laidOut) layout();
    active = true; over = false; snapAt = -1; rt = Math.max(0, rt0);
    hum = rt >= RT.RINGS; chantCd = jump && hum ? 0.2 : 1.5; backsSaid = rt >= RT.BACKS; pulsed = rt >= RT.PULSE; revealSaid = rt >= RT.PULSE + 1; runSaid = rt > RT.FREEZE + 0.5;
    lastLit = -1; altarFlash = 0; pulseT = -1; nightLit = false;
    // (a jump into the rite: the torches already alight are simply burning)
    for (let i = 0; i < NT; i++) { ign[i] = rt >= litAt[i] ? 1 : 0; if (ign[i]) lit[i] = Math.max(lit[i], 1); flare[i] = 0; }
    nights++; stat.nights = nights; stat.allInRt = null; stat.snapRt = null;
    for (const k of kids) {
      k.ritOn = false; k.ritOwn = false; k.ritMode = ''; k.ritWarps = 0; k.ritJolt = false; k.armLift = 0;
    }
    if (jump && rt >= RT.FREEZE) pose(rt >= RT.DUE ? 'rings' : 'run');
  }
  /** Put the kids where the rite has them at rt: in their rings, or (the run)
   *  a procession up the forest path, the head of it at the shrine's edge. */
  function pose(mode) {
    let j = 0;
    for (const k of kids) {
      if (D.hits.melting(k) || D.hits.absent(k)) continue;
      if (k.hurt) D.hits.clear(k);
      begin(k);
      k.vis = 1; k.lie = 0; k.sit = 0; k.kick = 0; k.cross = 0;
      if (mode === 'rings' || k.role === 'shrine') {
        place(k, slotX[k.i], slotZ[k.i]);
        k.ritMode = 'ring'; k.state = 'ritual'; k.ritOwn = true;
        k.yaw = k.desYaw = Math.atan2(X - k.x, Z - k.z);
      } else {
        pathAt(15 + j * 1.6, _pt); j++;
        const lat = (j % 2 ? 0.8 : -0.8);
        let x = _pt.x - _pt.tz * lat, z = _pt.z + _pt.tx * lat;
        if (!land(x, z) || solid(x, z, k.r)) { x = _pt.x; z = _pt.z; }
        place(k, x, z);
        k.yaw = k.desYaw = Math.atan2(-_pt.tx, -_pt.tz);
        k.ritWarps = 2;                       // (already on its way in)
        D.navReset(k);
      }
    }
    stat.placed += j;
  }
  function begin(k) {
    k.ritOn = true; k.ritJolt = false; k.armLift = k.armLift || 0; k.ritBest = -1; k.ritStuck = 0;
    k.ritEx = -1; k.ritExUsed = -1; k.ritExT = 0; k.ritGX = NaN; k.ritGZ = NaN;
    k.ritStucks = 0; k.ritPX = k.x; k.ritPZ = k.z; k.ritQX = k.x; k.ritQZ = k.z;
    // (they turn as one — and go in a ripple, not a stampede into one lane)
    k.ritGo = RT.FREEZE + ((k.i * 7) % 12) * 0.11;
    const d = dist2d(k.x, k.z, slotX[k.i], slotZ[k.i]);
    if (d < 0.9) { k.ritMode = 'ring'; k.state = 'ritual'; }
    else { k.ritMode = 'run'; k.state = 'stroll'; k.strollT = 0; D.navReset(k); }
  }
  function snap(p) {
    snapAt = rt; stat.snaps++; stat.snapRt = +rt.toFixed(2);
    audio('sourpatch_snap', p.x, p.z);
    const near = nearestKid(p);
    if (near) D.say(near, V.SNAP[(near.lineIdx++) % V.SNAP.length], true);
    ctx.systems.ui?.toast(`Every head turns to you. The humming stops.`, 3.2);
    ctx.events.emit('sourpatch:ritual', { stage: 'snap', rt });
  }

  /** Once a frame while the phase is 'watching', before the kids. */
  function update(dt, t, p, onCandyP) {
    if (!active) return;
    rt += dt;
    if (pending >= 0) { const r0 = pending; pending = -1; start(r0, true); }
    // the run: a toast on Candyland (the freeze has its own)
    if (!runSaid && rt >= RT.FREEZE + 0.3) {
      runSaid = true;
      if (onCandyP) ctx.systems.ui?.toast(`…and then, all at once, the ${V.GANG} turn and run for the Gummy Forest.`, 4);
    }
    // the hum
    if (!hum && rt >= RT.RINGS) {
      hum = true;
      audio('sourpatch_hum');
      const d = dist2d(p.x, p.z, X, Z);
      if (onCandyP && snapAt < 0) ctx.systems.ui?.toast(d < 70 ? 'A low hum rises from the Sour Shrine.' : 'Somewhere deep in the Gummy Forest, something is humming.', 4);
    }
    // the chant (captions near the shrine)
    if (hum && snapAt < 0 && rt < RT.BACKS) {
      chantCd -= dt;
      if (chantCd <= 0) {
        chantCd = 4.2;
        audio('sourpatch_chant');
        if (dist2d(p.x, p.z, X, Z) < 40) D.say(null, V.CHANT[(nights * 3 + Math.floor(rt / 4.2)) % V.CHANT.length], true);
      }
    }
    // the torches, one by one
    for (let i = 0; i < torches.length; i++) {
      if (rt >= litAt[i] && !ign[i] && snapAt < 0) {
        ign[i] = 1; flare[i] = 1; lastLit = i; stat.lit = Math.max(stat.lit, litCount());
        const tt = torches[i];
        burst(tt.x, tt.y + 3.3, tt.z, 14, IGNITE_COLS, 2.4, 0.9, 0.18, -2, 0.3);
        audio('torch', tt.x, tt.z);
      }
    }
    if (!backsSaid && rt >= RT.BACKS && snapAt < 0) {
      backsSaid = true;
      const vi = kids.find((k) => k.role === 'shrine');
      if (vi && dist2d(p.x, p.z, X, Z) < 40) D.say(vi, V.HUSH[nights % V.HUSH.length], true);
    }
    if (!pulsed && snapAt < 0 && rt >= RT.PULSE) doPulse(p);
    if (snapAt >= 0 && !pulsed && rt - snapAt >= RT.SNAP_PULSE) doPulse(p);
    if (!revealSaid && pulsed && rt >= (snapAt >= 0 ? snapAt + RT.SNAP_PULSE + 0.4 : RT.PULSE + 1.4)) {
      revealSaid = true; stat.reveals++;
      const near = nearestKid(p);
      if (near && dist2d(p.x, p.z, near.x, near.z) < 45) D.say(near, V.REVEAL[(near.lineIdx++) % V.REVEAL.length], true);
      ctx.events.emit('sourpatch:ritual', { stage: 'reveal', rt });
    }
    // the watcher steps inside the ring
    if (snapAt < 0 && !pulsed && rt >= RT.DUE && visitorInside(p)) snap(p);
    // who is where (stats; the verifier's "within 14 u")
    let w = 0, r = 0;
    for (const k of kids) {
      if (D.hits.melting(k) || D.hits.absent(k)) continue;
      if (dist2d(k.x, k.z, X, Z) <= 14) w++;
      if (k.ritMode === 'ring') r++;
    }
    stat.within14 = w; stat.ringed = r;
    if (stat.allInRt == null && r >= countable()) stat.allInRt = +rt.toFixed(2);
    if (snapAt >= 0 ? rt - snapAt >= RT.SNAP_END : rt >= RT.END) over = true;
  }
  const countable = () => { let n = 0; for (const k of kids) if (!D.hits.melting(k) && !D.hits.absent(k)) n++; return n; };
  const litCount = () => { let n = 0; for (let i = 0; i < torches.length; i++) if (rt >= litAt[i] || snapAt >= 0 && pulsed) n++; return n; };
  function doPulse(p) {
    pulsed = true; pulseT = 0; altarFlash = 1;
    for (let i = 0; i < torches.length; i++) flare[i] = 1;
    audio('sourpatch_pulse');
    burst(X + 0.15, yC + 9.2, Z - 0.1, 40, PULSE_COLS, 7, 1.2, 0.3, -0.5, 1.2);
    const dP = dist2d(p.x, p.z, X, Z);
    if (dP < 45) { try { ctx.systems.camera?.shake?.(dP < 20 ? 0.35 : 0.18, 0.5); } catch (e) { /* optional */ } }
    else if (p.x > 0) ctx.systems.ui?.toast('Far across the water, deep in the Candy Kingdom\'s forest, a green light pulses once.', 4);
    ctx.events.emit('sourpatch:ritual', { stage: 'pulse', rt });
  }

  // ── the kids ───────────────────────────────────────────────────────────────
  /** A kid's frame while the rite runs (after the freeze). */
  function brain(k, dt, t, p, dp) {
    if (!k.ritOn) begin(k);
    k.blink = 0; k.blinkT = 9;
    if (snapAt >= 0) { snapBrain(k, dt, t, p); return; }
    if (k.ritMode === 'run') { runBrain(k, dt, t, p, dp); return; }
    ringBrain(k, dt, t, p);
  }
  function runBrain(k, dt, t, p, dp) {
    const sx = slotX[k.i], sz = slotZ[k.i];
    k.ritOwn = false;
    if (rt < k.ritGo) {
      // the beat before it goes: turned toward the forest, leaning into it
      k.moving = 0; k.desYaw = Math.atan2(X - k.x, Z - k.z);
      k.lie = damp(k.lie, 0, 8, dt); k.sit = damp(k.sit, 0, 8, dt); k.kick = damp(k.kick, 0, 8, dt); k.cross = damp(k.cross, 0, 8, dt);
      k.lean = damp(k.lean, 0.2, 6, dt); k.armMode = 'behind';
      return;
    }
    // out of sight and far away: on to the forest path, to run in with the
    // procession (never where he can see it go, or arrive)
    const far = dist2d(k.x, k.z, X, Z) > WARP_FROM, dv = dist2d(k.x, k.z, p.x, p.z), seen = kidSeen(k);
    if (far && k.ritWarps < 1 && !seen && dv > SEE_R) {
      const w = warpSpot(k, p);
      if (w) { place(k, w.x, w.z); k.ritWarps = 1; stat.warps++; D.navReset(k); k.strollT = 0; }
    }
    // …and in his sight, far from the shrine: it runs for the nearest way
    // OUT OF THE PICTURE — a point on the licorice well away from him, the
    // least crowded one near it (ten kids making for the one lane out of the
    // plaza jammed it solid) — and from out there the procession has it
    let gx = sx, gz = sz;
    if (far && k.ritWarps < 1 && (seen || dv <= SEE_R)) {
      if (k.ritEx < 0 || (k.ritExT += dt) > EXIT_SEC) pickExit(k, p);
      if (k.ritEx >= 0) {
        gx = exX[k.ritEx]; gz = exZ[k.ritEx];
        if (dist2d(k.x, k.z, gx, gz) < 2.5) { k.ritExUsed = k.ritEx; pickExit(k, p); if (k.ritEx >= 0) { gx = exX[k.ritEx]; gz = exZ[k.ritEx]; } }
      }
    } else if (k.ritEx >= 0) { k.ritEx = -1; D.navReset(k); k.strollT = 0; }
    // the deadline: a straggler nobody can see is simply there — or, if its
    // place in the ring is in view, out in the trees, to run the last of it in
    if (rt >= RT.DUE && !kidSeen(k) && dist2d(k.x, k.z, p.x, p.z) > SEE_R) {
      if (!D.inView(sx, D.groundY(sx, sz), sz)) {
        place(k, sx, sz); stat.placed++;
        k.ritMode = 'ring'; k.state = 'ritual'; k.yaw = k.desYaw = Math.atan2(X - k.x, Z - k.z);
        return;
      }
      if (k.ritWarps < 2 && dist2d(k.x, k.z, X, Z) > 30) {
        const w = warpSpot(k, p);
        if (w) { place(k, w.x, w.z); k.ritWarps = 2; stat.warps++; D.navReset(k); k.strollT = 0; }
      }
    }
    if (gx !== k.ritGX || gz !== k.ritGZ) { k.ritGX = gx; k.ritGZ = gz; k.ritBest = -1; D.navReset(k); k.strollT = 0; }
    D.stroll(k, dt, t, p, dp, gx, gz, RUN_MUL);
    // the rite's watchdog: no closer for STUCK_SEC (a yard it cannot find the
    // gate of, a crowd round the fountain) — the sunbather's give-up: put in
    // place unseen, else in at a front door (out at the shrine), else a breather
    const dNow = dist2d(k.x, k.z, gx, gz);
    if (dNow < k.ritBest - 1.2 || k.ritBest < 0) { k.ritBest = dNow; k.ritStuck = 0; }
    else if (k.state === 'stroll') {
      k.ritStuck += dt;
      if (k.ritStuck > (rt >= RT.DUE ? 1.2 : STUCK_SEC)) {
        k.ritStuck = 0; k.ritBest = dNow; stat.stuck++; k.ritStucks++;
        // BOXED IN: a third give-up within 3 u of where it gave up two
        // times ago — a gap between a house's walls, a knot of lamp posts and
        // fence ends the planner cannot see out of (the frustum says "in
        // view"; the walls round it mostly say otherwise). Rather than jog on
        // the spot through the rite: a puff of sugar and it is at the shrine.
        // (and past the deadline, any hold-up far from the shrine: the rite
        // does not wait for one kid in a knot of lamp posts)
        const late = rt >= RT.DUE && dist2d(k.x, k.z, X, Z) > 30;
        if ((late || (k.ritStucks >= 3 && dist2d(k.x, k.z, k.ritPX, k.ritPZ) < 3)) && dist2d(k.x, k.z, p.x, p.z) > 3) {
          if (kidSeen(k)) D.puff(k, 10, 0.8);
          place(k, sx, sz); stat.boxed++;
          k.ritMode = 'ring'; k.state = 'ritual'; k.ritEx = -1; k.yaw = k.desYaw = Math.atan2(X - k.x, Z - k.z);
          return;
        }
        k.ritPX = k.ritQX; k.ritPZ = k.ritQZ; k.ritQX = k.x; k.ritQZ = k.z;
        // (making for a way out: another one; else the sunbather's give-up)
        if (k.ritEx >= 0) { k.ritExUsed = k.ritEx; pickExit(k, p); }
        else D.giveUp(k, gx, gz);
      }
    }
    runLook(k, dt);
    const d = dist2d(k.x, k.z, sx, sz);
    if (d < 0.8 || (k.state === 'idle' && d < 2.8)) { k.ritMode = 'ring'; k.state = 'ritual'; k.ritEx = -1; }
    else if (k.state === 'idle') { k.state = 'stroll'; k.strollT = 0; }      // (arrived at a way out, or gave up in view: on again)
  }
  /** Hands behind its back, grinning, head down into the run. */
  function runLook(k, dt) {
    k.armMode = 'behind';
    k.lean = damp(k.lean, 0.3, 5, dt);
    k.mouthWide = damp(k.mouthWide, 0.8, 4, dt);
    k.eyesShut = 0; k.crouch = 0;
    k.lie = damp(k.lie, 0, 8, dt); k.sit = damp(k.sit, 0, 8, dt); k.kick = damp(k.kick, 0, 8, dt); k.cross = damp(k.cross, 0, 8, dt);
  }
  /** A way out of the picture for kid k: a licorice point 22+ u from the
   *  visitor and 4–50 u from the kid, the nearest after a crowding penalty
   *  (8 u for every other kid already making for one within 7 u of it) —
   *  and of the best four, the first it can run to in a straight line (the
   *  plaza's west lane is a single file between gumdrop bushes the planner
   *  cannot see through; the open ways out are a sprint). −1: none. */
  const _ec = new Int16Array(4), _ev = new Float32Array(4);
  function pickExit(k, p) {
    k.ritExT = 0;
    let n = 0;
    for (let j = 0; j < exN; j++) {
      if (j === k.ritExUsed) continue;
      const ex = exX[j], ez = exZ[j];
      const dk = dist2d(k.x, k.z, ex, ez);
      if (dk > 50 || dk < 4 || dist2d(ex, ez, p.x, p.z) < 22) continue;
      let crowd = 0;
      for (const o of kids) if (o !== k && o.ritEx >= 0 && o.ritMode === 'run' && dist2d(exX[o.ritEx], exZ[o.ritEx], ex, ez) < 7) crowd++;
      const c = dk + crowd * 8;
      // (keep the best four, sorted)
      let q = n < 4 ? n++ : (c < _ev[3] ? 3 : -1);
      if (q < 0) continue;
      while (q > 0 && _ev[q - 1] > c) { _ev[q] = _ev[q - 1]; _ec[q] = _ec[q - 1]; q--; }
      _ev[q] = c; _ec[q] = j;
    }
    k.ritEx = n ? _ec[0] : -1;
    for (let q = 0; q < n; q++) if (D.lineClear(k.x, k.z, exX[_ec[q]], exZ[_ec[q]], k.r || 0.55) === 0) { k.ritEx = _ec[q]; return; }
  }
  function ringBrain(k, dt, t, p) {
    const sx = slotX[k.i], sz = slotZ[k.i];
    const d = dist2d(k.x, k.z, sx, sz);
    if (d > 2.4 && rt < RT.PULSE) { k.ritMode = 'run'; k.state = 'stroll'; k.strollT = 0; D.navReset(k); runBrain(k, dt, t, p, 99); return; }   // (knocked out of its place)
    k.state = 'ritual'; k.ritOwn = true; k.moving = 0;
    if (d > 0.03) D.settleAt(k, sx, sz, dt, 3);
    k.lie = damp(k.lie, 0, 7, dt); k.sit = damp(k.sit, 0, 7, dt); k.kick = damp(k.kick, 0, 7, dt); k.cross = damp(k.cross, 0, 7, dt);
    k.hop = damp(k.hop, 0, 8, dt);
    const inA = Math.atan2(X - k.x, Z - k.z);
    if (rt < RT.BACKS) {
      // THE CHANT: all 24 on one beat
      const e = smoothstep(RT.RINGS - 1.5, RT.RINGS + 1.2, rt);
      const ph = (rt - RT.RINGS) * TAU / BEAT;
      k.desYaw = inA; k.yaw = D.angDamp(k.yaw, inA, 4, dt);
      k.sway = 0.14 * Math.sin(ph) * e;
      k.headRoll = 0.36 * Math.sin(ph - 0.7) * e;
      k.headYaw = damp(k.headYaw, 0, 6, dt); k.headBias = 0;
      k.lookX = damp(k.lookX, 0, 6, dt); k.lookY = damp(k.lookY, 0.7 * e, 3, dt);
      k.headPitch = damp(k.headPitch, PITCH_UP * e, 3, dt);
      const tf = torches.length ? litCount() / torches.length : 1;
      k.armMode = 'ritual';
      k.armLift = damp(k.armLift, e * (0.25 + 0.75 * tf) * (0.82 + 0.18 * Math.sin(ph * 0.5)), 3, dt);
      k.crouch = (0.06 + 0.1 * (0.5 + 0.5 * Math.sin(ph * 2))) * e;
      k.mouthOpen = hum ? (0.08 + 0.4 * Math.max(0, Math.sin(ph * 2))) * e : 0;
      k.mouthWide = damp(k.mouthWide, 0.55, 3, dt);
      k.eyesShut = damp(k.eyesShut, 0.4 * e, 2, dt);
      k.lean = damp(k.lean, -0.06 * e, 3, dt);
      k.ritSlit = 0.35; k.ritBrow = 0;
    } else if (rt < RT.PULSE) {
      // BACKS TO THE CENTRE, then the eyes go dark
      const e = ease(clamp((rt - RT.BACKS) / RT.TURN, 0, 1));
      k.yaw = k.desYaw = inA + Math.PI * e;                 // all the same way round
      k.sway = damp(k.sway, 0, 4, dt);
      k.headRoll = damp(k.headRoll, 0.44 * smoothstep(RT.DARK + 0.4, RT.PULSE - 0.3, rt), 3, dt);
      k.headPitch = damp(k.headPitch, 0.08, 3, dt); k.headYaw = damp(k.headYaw, 0, 6, dt);
      k.lookX = damp(k.lookX, 0, 8, dt); k.lookY = damp(k.lookY, 0, 8, dt);
      k.armMode = 'ritual'; k.armLift = damp(k.armLift, 0, 2.5, dt);
      k.crouch = damp(k.crouch, 0, 3, dt);
      k.mouthOpen = damp(k.mouthOpen, 0, 6, dt); k.mouthWide = damp(k.mouthWide, 0.1, 3, dt);
      k.eyesShut = damp(k.eyesShut, 0, 6, dt);
      k.lean = damp(k.lean, 0, 3, dt);
      k.ritSlit = rt >= RT.DARK ? 1 : 0.35; k.ritBrow = 0;
    } else {
      // THE PULSE: ring by ring they whirl round once and come out of it ZOMBIE
      const w0 = RT.PULSE + 0.12 + slotRing[k.i] * 0.16;
      const e = ease(clamp((rt - w0) / RT.WHIRL, 0, 1));
      if (!k.ritJolt && rt >= RT.PULSE) { k.ritJolt = true; k.squash = -0.24; k.squashV = 0; }
      k.yaw = k.desYaw = inA + Math.PI + TAU * e;
      if (e > 0.45) zombie(k, dt, t, p);
      else { k.ritSlit = 1; k.ritBrow = 0; k.armLift = damp(k.armLift, 0, 4, dt); }
    }
  }
  /** The night rig, revealed: gaping grin, eyes lit, the reach, the hunch. */
  function zombie(k, dt, t, p) {
    k.ritOwn = true;
    k.ritSlit = 1; k.ritBrow = 1;
    k.armMode = 'reach';
    k.mouthOpen = damp(k.mouthOpen, 0.95, 9, dt); k.mouthWide = damp(k.mouthWide, 1, 9, dt);
    k.crouch = damp(k.crouch, 0.82, 6, dt);
    k.lean = damp(k.lean, 0.2, 5, dt);
    k.eyesShut = 0;
    k.eyeBoost = damp(k.eyeBoost || 1, 1.5, 5, dt);
    k.sway = Math.sin(t * 3.1 + k.ph * 6.28) * 0.05;
    k.headRoll = damp(k.headRoll, Math.sin(t * 1.7 + k.ph * 6.28) * 0.16, 4, dt);
    k.headPitch = damp(k.headPitch, -0.05, 5, dt);
    // and the one nearest him has already found him
    const dp = dist2d(k.x, k.z, p.x, p.z);
    if (dp < 30) {
      let rel = Math.atan2(p.x - k.x, p.z - k.z) - k.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      k.headYaw = damp(k.headYaw, clamp(rel, -0.9, 0.9), 10, dt); k.lookX = clamp(rel * 1.3, -1, 1);
    } else { k.headYaw = damp(k.headYaw, 0, 5, dt); k.lookX = damp(k.lookX, 0, 5, dt); }
  }
  function snapBrain(k, dt, t, p) {
    const sT = rt - snapAt;
    k.ritOwn = true;
    if (k.ritMode === 'run') { k.moving = 0; k.state = 'ritual'; }
    const to = Math.atan2(p.x - k.x, p.z - k.z);
    // the heads first — at once — then the bodies come round after them
    k.desYaw = to; k.yaw = D.angDamp(k.yaw, to, sT < 0.25 ? 1.5 : 9, dt);
    let rel = to - k.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    k.headYaw = clamp(rel, -1.15, 1.15);
    k.lookX = clamp(rel * 1.3, -1, 1);
    k.lookY = clamp(((p.y ?? 0) + 1.2 - (k.y + 1.2 * k.scale)) / Math.max(2, dist2d(k.x, k.z, p.x, p.z)) * 2, -1, 1);
    k.sway = damp(k.sway, 0, 12, dt);
    k.headRoll = damp(k.headRoll, 0.3, 10, dt);
    k.mouthOpen = 0; k.eyesShut = 0; k.crouch = damp(k.crouch, 0, 8, dt);
    if (sT >= RT.SNAP_PULSE) zombie(k, dt, t, p);
    else { k.ritSlit = 0.35; k.ritBrow = 0; }
  }

  // ── the look: the rig's mood, the eyes, the torches, the altar, the lights ─
  /** The rig's night value while the rite runs (the freeze keeps nightMix):
   *  a half-night face through the run and the chant, full night (black
   *  sockets) from the dark beat on. */
  let rigN = -1;
  function rigNight(nightMix, dt) {
    if (!active || rt < RT.FREEZE) { rigN = nightMix; return nightMix; }
    let want = 0.55;
    if (snapAt >= 0) want = rt - snapAt >= RT.SNAP_PULSE ? 1 : 0.55;
    else if (rt >= RT.DARK) want = 1;
    rigN = rigN < 0 ? want : (want > rigN && want === 1 ? want : damp(rigN, want, 2.5, dt));
    return rigN;
  }
  /** After rig.setMood: the eyes' glow (dark beat 0, the reveal hotter). */
  function eyes(rig) {
    let k = 1;
    if (active && rt >= RT.FREEZE) {
      if (snapAt >= 0) k = rt - snapAt >= RT.SNAP_PULSE ? 1.35 + Math.max(0, 1 - (rt - snapAt - RT.SNAP_PULSE) * 1.6) : 1;
      else if (rt >= RT.PULSE) k = 1.35 + Math.max(0, 1.2 - (rt - RT.PULSE) * 1.5);
      else if (rt >= RT.DARK) k = Math.max(0, 1 - (rt - RT.DARK) / 0.35);
    }
    eyeK = k;
    if (k !== 1) rig.eyeScale?.(k);
  }
  /** Drive the flames, the altar and the pulse (every frame, any phase). */
  function post(dt, t, phase) {
    if (!laidOut || !flameMesh) return;
    if (!compiled) precompile();
    uTime.value = t;
    const nightNow = phase === 'hunting';
    let any = false;
    const dark = active && snapAt < 0 && rt >= RT.DARK && rt < RT.PULSE;
    for (let i = 0; i < torches.length; i++) {
      let want = 0;
      if (active && (rt >= litAt[i] || (snapAt >= 0 && pulsed))) want = dark ? 0.32 : 1;
      else if (nightNow) want = 1;
      if (flare[i] > 0) { flare[i] = Math.max(0, flare[i] - dt * 1.6); want += flare[i] * 0.9; }
      lit[i] = damp(lit[i], want, want > lit[i] ? 7 : (dark ? 1.4 : 2.5), dt);
      if (lit[i] < 0.004) lit[i] = 0;
      uLit.value[i] = lit[i];
      if (lit[i] > 0) any = true;
    }
    // the sigil: drawn round with the torches, dim in the dark beat, a flash
    // at the pulse, a faint scar all night, gone by day
    let rw = 0, sw = 1;
    if (active) {
      if (snapAt >= 0) rw = pulsed ? 1 : 0.6;
      else if (rt >= RT.PULSE) rw = 1.2;
      else if (rt >= RT.DARK) rw = 0.22;
      else if (rt >= RT.TORCH0 - 0.4) rw = 0.9;
      sw = snapAt >= 0 && pulsed ? 1 : clamp((rt - RT.TORCH0 + 0.4) / (NT * RT.TORCH_GAP), 0, 1);
    } else if (nightNow) rw = 0.35;
    ringLvl = damp(ringLvl, rw + altarFlash * 1.5, rw > ringLvl ? 4 : 1.5, dt);
    if (ringLvl < 0.003) ringLvl = 0;
    uRing.value = ringLvl; uSweep.value = sw;
    if (ringLvl > 0) any = true;
    // the altar
    let aw = 0;
    if (active) {
      if (snapAt >= 0) aw = pulsed ? 1 : 0.3;
      else if (rt >= RT.PULSE) aw = 1.1;
      else if (rt >= RT.DARK) aw = 0.18;
      else aw = rt < RT.ALTAR0 ? 0.08 * smoothstep(RT.RINGS, RT.ALTAR0, rt) : 0.08 + 0.92 * smoothstep(RT.ALTAR0, RT.ALTAR1, rt) * (0.86 + 0.14 * Math.sin(t * 2.2));
    } else if (nightNow) aw = 0.75 + 0.1 * Math.sin(t * 1.3);
    altarLvl = damp(altarLvl, aw, aw > altarLvl ? 3 : 1.6, dt);
    if (altarFlash > 0) altarFlash = Math.max(0, altarFlash - dt * 1.4);
    uAltar.value = altarLvl * 2.6 + altarFlash * 6;
    // the altar's light: the pool and the halo follow it (all night too);
    // the up-light out of the crown only while the rite runs
    const bw = active ? altarLvl * (snapAt >= 0 && !pulsed ? 0.6 : 1) : 0;
    beamLvl = damp(beamLvl, bw + altarFlash * 1.6, bw + altarFlash > beamLvl ? 4 : 0.9, dt);
    if (beamLvl < 0.004) beamLvl = 0;
    uAltarG.value = altarLvl < 0.004 && altarFlash === 0 ? 0 : altarLvl + altarFlash * 1.2;
    uBeam.value = beamLvl;
    uHalo.value = 2.4 + 2.4 * altarLvl + 4 * altarFlash;
    if (uAltarG.value > 0 || beamLvl > 0) any = true;
    flameMesh.visible = any;
    // the pulse curtain
    if (pulseT >= 0) {
      pulseT += dt;
      const f = pulseT / 1.1;
      if (f >= 1) { pulseT = -1; pulseMesh.visible = false; uPulse.value = 0; }
      else {
        const r = 2.5 + 34 * (1 - (1 - f) * (1 - f));
        pulseMesh.scale.set(r, 1 + 0.6 * (1 - f), r);
        uPulse.value = (1 - f) * (1 - f) * 0.9;
        pulseMesh.visible = true;
      }
    }
    // (embers off the lit torches, a few at a time)
    if (any && (Math.floor(t * 3) !== Math.floor((t - dt) * 3))) {
      const i = Math.floor(t * 3) % Math.max(1, torches.length), tt = torches[i];
      if (tt && lit[i] > 0.5) burst(tt.x, tt.y + 3.6, tt.z, 2, EMBER_COLS, 0.6, 1.4, 0.09, -1.2, 0.2);
    }
  }
  /** While the rite runs the two NPC eye lights are the altar and the fire.
   *  true = handled (sourpatch.js skips its nearest-hunter placement). */
  function lights(L, t) {
    if (!active || rt < RT.RINGS - 2 || !laidOut) { if (lightsOwned) releaseLights(L); return false; }
    lightsOwned = true;
    const a = L[0], f = L[1];
    a.visible = true; f.visible = true;
    // (polish r1) the altar: a green UP-LIGHT off the pool at the stone's feet,
    // in front of its face — the face, the lost & found and the statues'
    // flanks lit from below — and the crown's own glow over the statues'
    // heads, which the torches feed as they light
    a.color.setHex(0x9dff3a); a.distance = 40; a.decay = 2;
    a.position.set(X, yC + 2.3, Z + 4.9);
    a.intensity = 70 * altarLvl + 300 * altarFlash;
    let n = 0; for (let i = 0; i < torches.length; i++) n += lit[i];
    f.color.setHex(0xd6ff8a); f.distance = 36; f.decay = 2;
    f.position.set(X + 0.15, yC + 10.4, Z - 0.1);
    f.intensity = (40 * altarLvl + 9 * n) * (0.92 + 0.08 * Math.sin(t * 11) * Math.sin(t * 7.3)) + 200 * altarFlash;
    return true;
  }
  function releaseLights(L) {
    lightsOwned = false;
    for (const l of L) { l.color.setHex(0xb9ff5a); l.distance = 16; l.decay = 2; }
  }

  // ── hand-over ──────────────────────────────────────────────────────────────
  /** At the hunt: does this kid hunt from where it stands (the reveal was on
   *  screen, or it is close to him)? */
  function keeps(k, p, onCandyP) {
    if (!k.ritOn || !onCandyP) return false;
    return kidSeen(k) || dist2d(k.x, k.z, p.x, p.z) < KEEP_R;
  }
  /** The rite is over (the hunt), or the day came (a clock jump): let go. */
  function end(L) {
    if (active) nightLit = true;
    active = false; pending = -1;
    for (const k of kids) {
      if (!k.ritOn && !k.ritOwn) continue;
      k.ritOn = false; k.ritOwn = false; k.ritMode = ''; k.armLift = 0;
      if (k.eyeBoost) k.eyeBoost = 1;
      if (k.state === 'ritual' || k.state === 'stroll') k.state = 'idle';
    }
    if (L && lightsOwned) releaseLights(L);
  }

  return {
    group, RT, torches,
    get rt() { return rt; },
    get active() { return active; },
    get over() { return over; },
    get snapped() { return snapAt >= 0; },
    get pastFreeze() { return active && rt >= RT.FREEZE; },
    /** The run is on (sourpatch.js hands out more route plans a frame). */
    get running() { return active && rt >= RT.FREEZE && rt < RT.RINGS + 6 && snapAt < 0; },
    get outerR() { return outerR; },
    center: { x: X, z: Z },
    slot: (i) => ({ x: slotX[i], z: slotZ[i], ring: slotRing[i] }),
    start, update, brain, rigNight, eyes, post, lights, keeps, end,
    /** A render/debug pose: the rite at rt (applied once the phase is 'watching'). */
    debug(r0) { pending = Math.max(0, +r0 || 0); return true; },
    stats() {
      let lt = 0; for (let i = 0; i < torches.length; i++) if (lit[i] > 0.5) lt++;
      return { active, rt: +rt.toFixed(2), over, snapped: snapAt >= 0, torchesLit: lt, torches: torches.length, altar: +altarLvl.toFixed(2), eyeK: +eyeK.toFixed(2),
        outerR: +outerR.toFixed(2), ...stat, stage: stageName() };
    },
  };
  function stageName() {
    if (!active) return over ? 'over' : 'idle';
    if (snapAt >= 0) return rt - snapAt >= RT.SNAP_PULSE ? 'snap-reveal' : 'snap';
    if (rt < RT.FREEZE) return 'freeze';
    if (rt < RT.RINGS) return 'run';
    if (rt < RT.BACKS) return 'chant';
    if (rt < RT.DARK) return 'backs';
    if (rt < RT.PULSE) return 'dark';
    return 'reveal';
  }
}
