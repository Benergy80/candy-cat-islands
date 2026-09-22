// Isometric third-person follow camera.
//   1 / 2 / 3    camera mode — 1 classic isometric (Q/E turn), 2 FOLLOW (azimuth
//                tracks the visitor's facing, Q/E offsets it and it re-centres
//                after 1.5 s of walking), 3 overhead (el 1.1, distance +40%)
//   Q / E        rotate the world in eased 45° steps (E defers to "interact" when
//                something is in range, so it never fights the E key)
//   wheel        zoom, clamped; the further out you are the more the view tips down
//   drag         orbit (any mouse button) — vertical drag changes elevation
//   L (hold)     LOOK UP — flattens to elevation 0.15, widens to fov 44 and
//                pitches the lens up while held, easing back on release
//   dead-zone    the target only chases the player once they leave a small box,
//                with look-ahead along the velocity so you see where you're going
//   reveal       stepping into a named landmark eases the lens out to ~40 for
//                2.5 s, so you see the whole silhouette of the thing you arrived at
//
// THE NIGHT SKY MOMENT. The sky system hangs a big cartoon moon 36-52° above the
// horizon all night, and the gameplay lens (elevation 0.64, fov 30) looks DOWN:
// the moon is never, at any azimuth, inside the frame. So once a night — the
// first time it is 21:00-23:30 with the visitor outdoors, on foot and in control
// — the camera takes 5 s for itself: it turns to the moon's horizontal bearing,
// drops to elevation 0.12 at 26 units, PITCHES up (the cinematic's `pitch`, the
// one thing a lookAt() follow camera cannot do), opens the lens from 44° only as
// far as that night's moon altitude demands (52-58°, so the moon, the horizon
// and the visitor all fit), holds 2.5 s with a toast, and eases back. Movement
// stays live the whole time —
// basis() keeps reading cur.azimuth, so WASD never flips under the shot.
//
// KEEPING THE VISITOR VISIBLE — a CAPSULE SWEEP from the lens to the head.
//
// Why a sweep and not a bounding-sphere test: almost nothing in this world is a
// separate mesh. The candy island's props are merged into ~12 island-scale
// meshes (candyArch_icing is 36k triangles and 195 units across), Cat Island's
// into cat_town_* and one cat_<district>_matte per district. The old
// prop-sized-only fade therefore matched nothing at all — every gameplay frame
// reported `fading: 0` while the art director was counting five frames in nine
// with the visitor behind something. So the test has to hit real triangles.
//
// Every occSweep seconds (6 Hz) we raycast five lines — hat, chest, knees and
// two shoulder-width offsets, i.e. the silhouette the capsule of radius
// occRadius sweeps — from the lens to the head (position.y + occHead). Broad
// phase is bounding sphere vs the segment; the candidate list itself is rebuilt
// 4 Hz. Terrain, sky, water, particles, instanced vegetation and anything that
// does not write depth are never candidates, and a hit is ignored when it sits
// under half a unit above the ground (a kerb grazes the knee ray wherever you
// stand) or within a unit of the body (the deck you are standing on). What is
// left is classified:
//
//   0. CULL  — a mesh whose WORLD BOUNDING BOX contains the lens goes
//              visible = false for as long as that lasts. Gated to meshes under
//              occCullMax across, because "the lens is inside my box" is true of
//              every island-scale merge all the time; without the gate this rule
//              deletes Candyland. Roofs are skipped — each architecture system
//              hides its own roof when you walk inside, and we must not fight it.
//   1. FADE  — the mesh dissolves to fadeOpacity over fadeTime. Prop-sized
//              meshes (world box under occFadeMaxDim) always. A big merged
//              district only when the hit sits within occNearLens of the lens —
//              i.e. the lens is buried in it and it is filling the screen
//              anyway. Ghosting a district from further out is what put a
//              translucent roof on the Arrivals hall, so it stays forbidden.
//   2. DOLLY — a big mass with room in front of it: pull the lens to just
//              inside the real hit point, floored at occDollyFloor of the stop.
//   3. TILT  — a big mass too close to the player to get in front of. Nothing
//              publishes how tall it is, so the lift ESCALATES occLiftStep per
//              sweep while the body is still blocked, stops the moment it
//              clears, and unwinds once six sweeps run clean or the visitor has
//              walked 3 units away. Capped at occLiftMax.
//   4. GIVE UP — a tilt pinned at its cap that STILL leaves him hidden is pure
//              composition damage, so after two such sweeps the lift drops back
//              to zero and latches off until he moves. What is left then is the
//              last-resort ghost: the blocker fades anyway, provided it is a
//              building rather than a district (occFadeLastDim). An island-wide
//              merge never ghosts — we would rather lose his shins than the
//              island — and the dolly may dip under its floor instead.
//   5. INSTANCED — an InstancedMesh is never raycast (2000 instances), but its
//              instances ARE tested as spheres against the sight line. A wall
//              of palm fronds is what swallowed the visitor in the round-3
//              plaza frame, and the sweep was not even looking at it. Owners
//              get asked first (hideInstancesNear(x,z,r), if any system has
//              one); otherwise the lens pushes in harder (occInstFloor) and
//              tilts harder (occInstStep) than it would for a solid mesh.
//   6. PLINTH — a mass named like ground/masonry, or simply bigger than a
//              building, hit within occPlinthNear of the lens: the cupcake's
//              plinth cannot be ghosted, cannot be dollied past and does not
//              clear at 0.30 rad. The tilt cap rises to occLiftPlinth (0.35)
//              and the dolly is forced in behind it.
//   AND THE BACKSTOP: none of this can be relied on, so the VISITOR IS DRAWN
//   TWICE — see player/visitor.js. The second pass is flat cream, depthFunc
//   GreaterDepth, so it appears only where something is in front of him. The
//   camera may lose the argument with the geometry; the player never vanishes.
//   A cheap per-frame bounding-sphere fade still runs on genuinely prop-sized
//   separate meshes, so a cat walking across the sight line ghosts instantly
//   instead of waiting for the next sweep. The docked Sugarfin (and anything
//   named ferry/whale, and any userData.noFade) is never ghosted at all.
//
// ZONE PITCH. 0.64 rad is country pitch. Inside a town core (the LANDMARKS
// listed in ZONES) it points at roof tiles — the architecture critics measured
// 50-65% roof and no horizon — so the lens eases to zoneElev (0.50 rad) and the
// aim point rises zoneRise, which gives the shopfronts two thirds of the frame.
// It only ever lowers the pitch, so an explicit --el keeps whatever it asked
// for if that is flatter.
//   Meshes opt out with userData.noFade / userData.noOcclude and opt in with
//   userData.fade (still capped at fadeHardMax on the per-frame path).
//   Cost: the survivors of the broad phase are 30-50k-triangle merged meshes,
//   so each sweep spends occBudget ray-triangle tests, nearest the sight line
//   first, and resumes where it stopped — 2-6 ms per sweep, 1-3% of frame time.
//
// Public API (other systems + tools/render.mjs depend on these):
//   params {azimuth, elevation, distance, fov, minDist, maxDist, lookAhead,
//           fadeOpacity, fadeProbe, fadeRefresh, fadeMaxRadius, fadeHardMax,
//           fadeTime, fadeBack, occRadius, occHead, occSweep, occNearLens,
//           occFadeMaxDim, occFadeLastDim, occCullMax, occDollyFloor,
//           occLiftStep, occLiftMax, occBudget,
//           occInstMin, occInstK, occInstBudget, occInstStep, occInstFloor,
//           occPlinthNear, occLiftPlinth, zoneElev, zoneRise, zoneLambda,
//           followLambda, followRecentre, revealDist, revealHold,
//           lookElev, lookFov, lookPitch, moonElev, moonDist, moonFov,
//           moonFovMax, moonDur, moonHold}
//   basis() · snap() · setFree(v|null) · setParams(p) · isFree()
//   mode · setMode(1|2|3) → emits 'camera:mode' · reveal(seconds?)
//   shake(intensity, duration) · cinematic({target, azimuth, elevation, distance, duration}) → Promise
//   moonMoment() → Promise|null (forces the night sky moment; emits 'camera:moon')
//   lookingUp (0..1)
//   introspection: fading · fadedList · culled · culledList · occDist · occLift ·
//                  occBlocked · occMs · blockerCount · sweepCount · current · target
//                  occDebug() — one unbudgeted sweep, reported not applied
//                  bodyVisibility() — five rays, whole scene (instances too),
//                    { visible, total, rays } — the QA number for "can you see
//                    him in this frame"
import * as THREE from 'three';
import { damp, clamp, lerp, smoothstep } from '../core/util.js';

const STEP = Math.PI / 4;
const ease = (t) => t * t * (3 - 2 * t);
const MODE_NAME = { 1: 'isometric', 2: 'follow', 3: 'overhead' };
const OVERHEAD_EL = 1.10;     // mode 3 pitch
const OVERHEAD_K = 1.40;      // mode 3 distance multiplier
// the night sky moment's framing budget, in radians of the vertical frame
const MOON_R = 0.067;         // angular RADIUS of the sky's moon disc at 780 units
const MOON_TOP = 0.045;       // …plus this much clear sky above it
const MOON_SEA = 0.055;       // …and this much sea/skyline under the horizon line
const MOON_BODY = 0.07;       // …and this much frame under the visitor, so he is IN the shot
const MOON_WINDOW = [21, 23.5];   // once a night, inside this hour window

export function create(ctx) {
  const cam = ctx.camera;
  const world = ctx.world;
  const p = {
    // Default stop. 28 / 0.55 rad (31.5°) framed the streets nicely but sent the
    // sight line straight through the 2-6 unit prop band — hedges, deck rims,
    // giant candy — and the visitor vanished in five gameplay frames out of
    // nine. 31 / 0.64 rad (36.7°) looks DOWN over that band while keeping the
    // 20-35 unit landmarks against the sky; the extra 3 units of distance pay
    // back the height so the visitor still reads at ~10% of frame height.
    azimuth: Math.PI * 0.25, elevation: 0.64, distance: 31, fov: 30,
    minDist: 12, maxDist: 88, lookAhead: 2.2, deadZone: 0.85,
    minElev: 0.26, maxElev: 1.12, tiltOut: 0.12, tiltIn: 0.24,
    fadeOpacity: 0.15, fadeProbe: 0.55, fadeRefresh: 0.25, occLiftMax: 0.30,
    fadeTime: 0.12, fadeBack: 0.26,           // dissolve / restore, seconds
    // per-frame bounding-sphere fade: prop-sized separate meshes only (moving
    // cats, doors, signs). fadeHardMax caps even a userData.fade opt-in, so
    // nobody can dissolve a district through this path by accident.
    fadeMaxRadius: 5, fadeHardMax: 16,
    // the capsule sweep (see the header)
    occRadius: 1.2,           // capsule radius around the sight line
    occHead: 1.6,             // the sweep aims at position.y + this
    occSweep: 1 / 6,          // seconds between geometry sweeps (6 Hz)
    occNearLens: 6,           // a big merged mesh hit this close to the lens may fade
    occFadeMaxDim: 12,        // "prop-sized": world bounding box, largest side
    occCullMax: 18,           // only a mesh this small may be culled for holding the lens
    occDollyFloor: 0.62,      // dolly never closer than this fraction of the stop…
    occLiftStep: 0.07,        // …and the tilt escalates this much per blocked sweep
    occBudget: 60000,         // ray-triangle tests per sweep (merged meshes are huge)
    colLiftMax: 0.12,         // the COLLIDER tilt is a guess at heights: keep it at 7°
    occFadeLastDim: 45,       // last-resort ghost: a building may, a district may not
    // INSTANCED BLOCKERS (palm fronds, gummy trees). The sweep cannot raycast a
    // 2000-instance cloud, so it tests instance BOUNDING SPHERES against the
    // sight line, nearest first, inside a per-sweep budget.
    occInstMin: 0.75,         // ignore instances smaller than this (grass, petals)
    occInstK: 0.70,           // instance spheres are loose around fronds: shrink them
    occInstBudget: 2500,      // instance sphere tests per sweep
    occInstStep: 1.7,         // an instanced hit escalates the tilt this much harder…
    occInstFloor: 0.62,       // …but obeys the same dolly floor as everything else
    // PLINTH / TERRAIN MASSES. A featureless plinth right under the lens cannot
    // be dollied past and is too tall to tip over at 0.30 rad — so when one is
    // within occPlinthNear of the lens the tilt is allowed to run to 0.35 rad
    // and the dolly is forced in behind it.
    occPlinthNear: 8, occLiftPlinth: 0.35,
    // a hit this close to the ground is a kerb, a flowerbed rim or a district's
    // own pavement — the sight line grazes one of those in every frame there is
    occGroundMin: 1.2,
    // ZONE PITCH. Inside a town core the authored 0.64 rad fills half the frame
    // with roof tiles; easing to 0.50 rad and aiming a metre higher gives the
    // facades two thirds of the frame and puts a horizon back in the shot.
    zoneElev: 0.50, zoneRise: 1.0, zoneLambda: 2.2,
    followLambda: 3, followRecentre: 1.5,     // mode 2
    revealDist: 44, revealHold: 2.5,          // landmark reveal
    // hold L: look up. The elevation alone only flattens the view — the pitch
    // is what puts sky on the screen, because lookAt() always centres the body.
    lookElev: 0.15, lookFov: 44, lookPitch: 0.30,
    // the night sky moment. moonFov is the authored lens; a high moon widens it
    // (never past moonFovMax) rather than being cropped off the top of frame.
    moonElev: 0.12, moonDist: 26, moonFov: 44, moonFovMax: 58,
    moonDur: 5, moonHold: 2.5,
  };
  const DIST_REF = 31;        // the framing the look-ahead / dead-zone were tuned at
  const target = new THREE.Vector3();
  const cur = { azimuth: p.azimuth, elevation: p.elevation, distance: p.distance };
  let free = null;
  let mode = 1;
  let followOff = 0, followOffT = 0;   // mode 2: temporary Q/E offset + seconds walked since
  let revealT = 0, revealK = 0, revealMute = 0, lastHere = null;
  let distRef = p.distance;   // "no extra tilt" reference — only wheel zoom tilts the view
  let azFrom = p.azimuth, azTo = p.azimuth, azT = 1, azDur = 0.42;   // eased Q/E snap
  let shakeAmp = 0, shakeT = 0, shakeDur = 1;
  let idle = 0;
  let occDist = p.distance, occLift = 0;
  let sweepDolly = Infinity;    // dolly asked for by the last capsule sweep
  let sweepLift = 0;            // escalating tilt asked for by the last capsule sweep
  let occBlocked = 0;           // body rays blocked at the last sweep, 0..1
  // sweep state (declared early: snap() runs during create(), before the occlusion section)
  const liftAnchor = new THREE.Vector3(NaN, 0, 0);   // where the tilt was last raised
  let clearRun = 0;          // consecutive clear sweeps (hysteresis, see below)
  let lastDolly = Infinity;
  let sweepCursor = 0;       // round-robin position inside the triangle budget
  let liftMaxRun = 0;        // consecutive sweeps with the tilt pinned at its cap
  let liftCap = p.occLiftMax;   // …which is taller when a plinth is under the lens
  let giveUp = false;        // the tilt was tried here and did not clear him
  const giveUpAt = new THREE.Vector3(NaN, 0, 0);
  let sweepT = 0, occMs = 0;
  let cine = null;
  let lookK = 0;                // hold-L look-up, eased 0..1
  let moonDone = false;         // the night sky moment already ran this night
  let moonTick = 0.6;           // seconds until the next cheap window check
  let moonToastT = -1, moonToastText = '';
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), cineTgt = new THREE.Vector3();
  cam.fov = p.fov; cam.updateProjectionMatrix();

  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const lerpAngle = (a, b, t) => a + wrap(b - a) * t;
  const toVec = (t, out) => {
    const v = typeof t === 'function' ? t() : t;
    if (!v) return out.set(0, 2, 0);
    if (Array.isArray(v)) return out.set(v[0], v[1] ?? 2, v[2]);
    if (v.isVector3) return out.copy(v);
    return out.set(v.x || 0, v.y ?? 2, v.z || 0);
  };

  /** Look-ahead and dead zone are tuned at the default stop; scale them with the
   *  zoom so the visitor stays framed whether you are nose-to-nose or way out. */
  const frameScale = () => clamp(cur.distance / DIST_REF, 0.2, 1.8);

  // ── ZONE PITCH: towns are looked at, not looked down on ────────────────────
  // 0.64 rad is the right pitch for open country — it clears the 2-6 unit prop
  // band. Inside a town it points at roofs: the architecture critics measured
  // 50-65% roof tile and no horizon in three frames of five. So in a town core
  // the lens eases to zoneElev and the aim point rises zoneRise, which trades
  // the roofs for shopfronts and puts the skyline back. It only ever LOWERS the
  // pitch, so a view that explicitly asks for something flatter keeps it.
  const ZONES = ['main_street', 'town_square', 'residential', 'welcome_plaza', 'meow_donalds', 'candy_village', 'fish_harbor']
    .map((id) => world.LANDMARKS?.[id]).filter((L) => L && Number.isFinite(L.r));
  function zoneAt(x, z) {
    let k = 0;
    for (let i = 0; i < ZONES.length; i++) {
      const L = ZONES[i];
      const d = Math.hypot(x - L.x, z - L.z);
      if (d < L.r) k = Math.max(k, smoothstep(L.r, L.r * 0.58, d));
    }
    return k;
  }
  let zoneK = 0;               // damped 0..1 "we are in a town core"

  // ── camera modes ───────────────────────────────────────────────────────────
  // The mode only bends the GOALS; p.elevation / p.distance stay the player's
  // own (wheel / drag / setParams) values, so 1→3→1 comes back to the framing
  // you left, and snap() / setFree(null) keep whatever mode is current.
  const goalElev = () => (mode === 3
    ? clamp(OVERHEAD_EL, p.minElev, p.maxElev)
    : clamp(lerp(p.elevation, Math.min(p.elevation, p.zoneElev), zoneK), p.minElev, p.maxElev));
  const goalDist = () => clamp(p.distance * (mode === 3 ? OVERHEAD_K : 1), p.minDist, p.maxDist);
  /** Mode 2 wants the lens BEHIND the visitor: the camera looks along (-sin az,
   *  -cos az) and the visitor faces (sin f, cos f), so az = facing + π. */
  const followAz = () => {
    const f = ctx.systems.player?.facing;
    return wrap((Number.isFinite(f) ? f : p.azimuth - Math.PI) + Math.PI + followOff);
  };
  /** Distance goal including the landmark reveal ease-out. */
  const goalDistNow = () => { const d = goalDist(); return d + Math.max(0, p.revealDist - d) * revealK; };

  function desiredTarget(out) {
    const pl = ctx.systems.player;
    if (!pl?.position) return out.set(0, 2, 0);
    out.copy(pl.position);
    out.y += 1.15 + p.zoneRise * zoneK;      // a town aims at the shopfronts, not the kerb
    if (pl.velocity) {
      tmp2.copy(pl.velocity).setY(0);
      const sp = tmp2.length();
      if (sp > 0.2) out.addScaledVector(tmp2.divideScalar(sp), p.lookAhead * frameScale() * Math.min(1, sp / 6));
    }
    return out;
  }

  /** Where the lens would stand for this framing (no side effects). */
  function lensAt(az, el, dist, tgt, out) {
    const ce = Math.cos(el);
    return out.set(tgt.x + Math.sin(az) * ce * dist, tgt.y + Math.sin(el) * dist, tgt.z + Math.cos(az) * ce * dist);
  }
  function place(az, el, dist, tgt) {
    lensAt(az, el, dist, tgt, cam.position);
    cam.lookAt(tgt);
  }

  const api = {
    params: p, current: cur, target,
    /** Camera-relative forward/right on the ground plane (movement uses this). */
    basis() { const az = cur.azimuth; return { fx: -Math.sin(az), fz: -Math.cos(az), rx: Math.cos(az), rz: -Math.sin(az) }; },
    /** Current camera mode (1 iso / 2 follow / 3 overhead). */
    get mode() { return mode; },
    /** Switch mode. Emits 'camera:mode' and toasts; survives snap()/setFree(null). */
    setMode(n) {
      const m = n === 2 ? 2 : n === 3 ? 3 : 1;
      if (m === mode) return mode;
      mode = m;
      followOff = 0; followOffT = 0;
      azFrom = azTo = p.azimuth; azT = 1;
      ctx.events.emit('camera:mode', m);
      ctx.systems.ui?.toast?.(`Camera: ${MODE_NAME[m]}`);
      return mode;
    },
    /** Ease the lens out to params.revealDist for `secs`, then back — used when
     *  you arrive at a landmark so the whole silhouette lands in frame. */
    reveal(secs = p.revealHold) { revealT = Math.max(revealT, secs); },
    get revealing() { return revealK > 0.01; },

    snap() {
      const pl0 = ctx.systems.player?.position;
      zoneK = pl0 ? zoneAt(pl0.x, pl0.z) : 0;    // settled, not damped: a screenshot gets one frame
      cur.azimuth = mode === 2 ? followAz() : p.azimuth;
      cur.elevation = goalElev(); cur.distance = goalDist();
      revealT = 0; revealK = 0;
      // a teleport lands you inside a landmark zone; that is not an "arrival",
      // so swallow the banner that follows it (and keeps --view renders exact)
      revealMute = 0.8; lastHere = ctx.systems.ui?.here ?? null;
      azFrom = azTo = p.azimuth; azT = 1; cine = null; shakeAmp = 0; idle = 1;
      desiredTarget(target);
      clearFades(); clearCull();
      sweepLift = 0; sweepDolly = Infinity; occLift = 0; occDist = cur.distance;
      clearRun = 0; liftMaxRun = 0; giveUp = false; liftCap = p.occLiftMax; liftAnchor.set(NaN, 0, 0); giveUpAt.set(NaN, 0, 0);
      ctx.scene.updateMatrixWorld(true);
      refreshCandidates(); candT = 0; sweepT = 0;
      const el0 = cur.elevation + tiltFor(cur.distance);
      // Settle the sweep in one go, so a single-frame screenshot is right. Each
      // pass re-measures from the lens the previous pass asked for; inside a
      // snap the tilt only climbs, so ten passes always converge (and leave two
      // spare for the give-up latch to fire when the tilt is not working).
      const passes = free ? 1 : 10;
      for (let i = 0; i <= passes; i++) {
        const oc = occlude(target, cur.azimuth, cur.elevation, cur.distance);
        occLift = clamp(Math.max(oc.lift, sweepLift), 0, liftCap);
        occDist = Math.max(6, Math.min(cur.distance, oc.dist, sweepDolly));
        place(cur.azimuth, el0 + occLift, Math.min(cur.distance, occDist), target);
        if (free || i === passes) break;
        lensAt(cur.azimuth, el0 + occLift, cur.distance, target, idealPos);
        // first pass looks at everything (a screenshot gets no second chance);
        // the rest only have to confirm the tilt, so they take a wide budget
        sweepCursor = 0;
        sweepOcclusion(idealPos, cam.position, i === 0 ? Infinity : p.occBudget * 3);
        applyCull();
      }
      if (!free) fadeBlockers(1, cam.position, target);
    },
    setFree(v) {
      free = v;
      clearFades(); clearCull();                  // a free camera frames the world, not the player
      if (v) { const t = new THREE.Vector3(...v.target); if (v.fov) { cam.fov = v.fov; cam.updateProjectionMatrix(); } place(v.azimuth ?? p.azimuth, v.elevation ?? p.elevation, v.distance ?? p.distance, t); }
      // back to the follow camera: keep the mode, and do not read the landmark
      // we are standing in as a fresh arrival
      else {
        cam.fov = p.fov; cam.updateProjectionMatrix();
        candT = 0; sweepT = 0; sweepLift = 0; sweepDolly = Infinity; clearRun = 0; liftMaxRun = 0; giveUp = false; liftCap = p.occLiftMax; liftAnchor.set(NaN, 0, 0); giveUpAt.set(NaN, 0, 0);
        revealMute = 0.8; revealT = 0; lastHere = ctx.systems.ui?.here ?? null;
      }
    },
    setParams(np) {
      Object.assign(p, np);
      if (np.azimuth !== undefined) { azFrom = azTo = np.azimuth; azT = 1; }
      if (np.distance !== undefined) distRef = np.distance;
      if (np.fov) { cam.fov = np.fov; cam.updateProjectionMatrix(); }
    },
    isFree: () => !!free,
    /** Introspection for the render/debug harness. */
    get fading() { return faded.size; },
    /** Which meshes are currently dissolved — names + world radii, for QA. */
    get fadedList() {
      return [...faded.keys()].map((o) => {
        const bs = o.geometry?.boundingSphere || { radius: 0 };
        const e = o.matrixWorld.elements;
        const sc = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
        return { name: o.name || o.type, r: +((bs ? bs.radius * sc : 0).toFixed(2)) };
      });
    },
    get occDist() { return occDist; },
    get occLift() { return occLift; },
    get blockerCount() { return cands.length; },
    /** How many meshes the capsule sweep is willing to raycast. */
    get sweepCount() { return sweepers.length; },
    /** Fraction of the five body rays still blocked after the last sweep (0..1). */
    get occBlocked() { return occBlocked; },
    /** Milliseconds the last capsule sweep cost (it runs at params.occSweep). */
    get occMs() { return occMs; },
    /** Meshes currently hidden because the lens is inside them. */
    get culled() { return culled.size; },
    get culledList() { return [...culled.keys()].map((o) => o.name || o.type); },
    /** One unbudgeted sweep from where the lens is now, reported rather than
     *  applied — the QA hook for "why can I not see him in this frame". The
     *  tilt/dolly control state is put back afterwards so asking the question
     *  does not move the camera; the fade set is simply re-measured. */
    occDebug() {
      const out = [];
      const keep = { sweepLift, sweepDolly, clearRun, liftMaxRun, giveUp, sweepCursor, occBlocked, occMs };
      sweepOcclusion(cam.position, cam.position, Infinity, out);
      const r = {
        blocked: occBlocked, lift: +sweepLift.toFixed(3),
        dolly: Number.isFinite(sweepDolly) ? +sweepDolly.toFixed(2) : null,
        ms: +occMs.toFixed(2), candidates: sweepers.length,
        hits: out.sort((a, b) => a.d - b.d),
      };
      ({ sweepLift, sweepDolly, clearRun, liftMaxRun, giveUp, sweepCursor, occBlocked, occMs } = keep);
      return r;
    },

    /**
     * QA: how much of the visitor the lens can actually see from where it is
     * standing — five rays (hat, head, chest, hips, knees) against the WHOLE
     * scene, instanced vegetation included, with three.js doing the raycasting
     * rather than the budgeted sweep. Slow (tens of ms) and side-effect free;
     * this is the number the art director asks for ("body visibility 5/5"), not
     * something the camera runs per frame.
     *   → { visible, total, rays: [{ pt, clear, by:[name@dist] }] }
     */
    bodyVisibility() {
      const pl = ctx.systems.player?.position;
      const out = { visible: 0, total: 0, rays: [] };
      if (!pl) return out;
      const mine = (o) => { for (let n = o; n; n = n.parent) if (n.userData?.noFade || n.userData?.silhouette || n === ctx.systems.player?.group) return true; return false; };
      const pts = [['hat', 1.78], ['head', 1.45], ['chest', 1.05], ['hips', 0.65], ['knees', 0.40]];
      out.total = pts.length;
      for (const [nm, dy] of pts) {
        tmp2.set(pl.x, pl.y + dy, pl.z).sub(cam.position);
        const L = tmp2.length();
        if (L < 1e-3) { out.visible++; out.rays.push({ pt: nm, clear: true, by: [] }); continue; }
        qaRay.set(cam.position, tmp2.divideScalar(L));
        qaRay.near = 0.05; qaRay.far = L - 0.15;
        let hits = [];
        try { hits = qaRay.intersectObject(ctx.scene, true); } catch { hits = []; }
        const by = [];
        for (const h of hits) {
          const o = h.object;
          if (!o.visible || mine(o)) continue;
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          if (!m || m.depthWrite === false) continue;
          if (m.transparent && (m.opacity ?? 1) < 0.5) continue;
          if (/^(sky|cloud|star|sun|moon)/i.test(o.name || '')) continue;
          if (h.point.y - world.height(h.point.x, h.point.z) < 0.45) continue;   // the floor at his shoes
          if (L - h.distance < 0.8) continue;                                    // the deck he stands on
          by.push(`${o.name || o.type}${o.isInstancedMesh ? '[inst]' : ''}@${h.distance.toFixed(1)}`);
          if (by.length >= 3) break;
        }
        if (!by.length) out.visible++;
        out.rays.push({ pt: nm, clear: !by.length, by });
      }
      return out;
    },

    /** Screen shake. intensity ≈ world units of wobble, duration in seconds. */
    shake(intensity = 0.5, duration = 0.45) {
      shakeAmp = Math.max(shakeAmp, intensity); shakeT = duration; shakeDur = Math.max(0.05, duration);
    },

    /**
     * Ease to a framing, hold there, then ease back to the follow camera.
     *   cinematic({ target: [x,y,z] | Vector3 | ()=>pos,
     *               azimuth, elevation, distance, fov, pitch, noTilt,
     *               duration: 3, in: 0.8, hold: 1.4, out: 0.8 })
     * Any framing field left out keeps the live follow value, so you can, say,
     * only push in. `pitch` (radians) aims the lens ABOVE the target without
     * moving it — the only way to get sky in frame, since place() always
     * lookAt()s the body. `noTilt` hands the shot its authored ANGLES: the
     * anti-occlusion lift keeps tracking (so the way out lands on the right
     * numbers) but stops steepening the frame while the shot holds; the dolly
     * still runs, because pulling the lens in front of a blocker costs the
     * composition nothing. Returns a Promise that resolves once the camera is
     * back on the player; call .cancel() on it to skip straight to the way out.
     */
    cinematic(o = {}) {
      const dur = o.duration ?? 3;
      const tIn = o.in ?? dur * 0.28, tOut = o.out ?? dur * 0.28;
      const tHold = o.hold ?? Math.max(0, dur - tIn - tOut);
      if (cine) cine.done?.();                 // a new shot supersedes the old one
      let done;
      const promise = new Promise((res) => { done = res; });
      const self = { o, tIn, tHold, tOut, t: 0, done };
      cine = self;
      promise.cancel = () => { if (cine === self) self.t = Math.max(self.t, self.tIn + self.tHold); };
      return promise;
    },
    get cinematicActive() { return !!cine; },
    /** 0..1 — how far into the hold-L look-up the lens currently is. */
    get lookingUp() { return lookK; },
    /** Has this night's sky moment already been spent? */
    get moonMomentDone() { return moonDone; },

    /**
     * THE NIGHT SKY MOMENT — the shot that exists because the moon cannot
     * otherwise be seen (see the header). Fires itself once a night, 21:00 to
     * 23:30, outdoors and on foot; call it directly to force it (the debug
     * hook, and the cam_moon_moment view). Returns the cinematic's Promise, or
     * null when there is no moon above the horizon to look at.
     */
    moonMoment() {
      const md = ctx.systems.sky?.moonDir;
      if (!md || md.y <= 0.02) return null;                     // no moon up yet
      moonDone = true;
      // The lens looks along (-sin az, -cos az): turn that onto the moon's
      // horizontal bearing so the shot is aimed at the thing, not near it.
      const az = Math.atan2(-md.x, -md.z);
      const mEl = Math.asin(clamp(md.y, -1, 1));
      // FRAMING, solved rather than guessed. The moon rides 36-52° up across
      // the window, so 44° of lens cannot hold both it and the horizon: widen
      // only as far as the altitude demands, and no further than moonFovMax.
      const needHalf = (mEl + MOON_R + MOON_TOP + Math.max(MOON_SEA, p.moonElev + MOON_BODY)) * 0.5;
      const fov = clamp(Math.max(p.moonFov, needHalf * 2 * 180 / Math.PI), p.moonFov, p.moonFovMax);
      const half = fov * Math.PI / 360;
      // Priorities, in order: the moon must be in frame, then the horizon, then
      // the visitor's head at the bottom edge. A near-midnight moon is simply
      // too high for all three and the sea goes, not the moon.
      const centre = Math.max(
        mEl + MOON_R + MOON_TOP - half,                         // moon inside the top
        Math.min(half - MOON_SEA, half - p.moonElev - MOON_BODY),   // sea in / visitor in
      );
      const shot = api.cinematic({
        azimuth: az, elevation: p.moonElev, distance: p.moonDist, fov,
        pitch: centre + p.moonElev, noTilt: true,
        duration: p.moonDur, in: (p.moonDur - p.moonHold) * 0.48,
        hold: p.moonHold, out: (p.moonDur - p.moonHold) * 0.52,
      });
      moonToastText = ctx.state.island === 'cat'
        ? 'The moon is up. The cats are… bigger.'
        : 'The moon is up. So are they.';
      // Fire it now, not on the hold: the UI shows ONE toast at a time and
      // Candyland chatters all night, so the line needs the queue's head start.
      moonToastT = 0.06;
      ctx.events.emit('camera:moon', { azimuth: az, elevation: mEl, fov });
      return shot;
    },

    update(dt, ctx) {
      if (free) return;
      const inp = ctx.input;

      // ── input ───────────────────────────────────────────────────────────
      // 1 / 2 / 3 pick the camera mode (the wave-2 input contract).
      if (inp.pressed.has('Digit1') || inp.pressed.has('Numpad1')) api.setMode(1);
      if (inp.pressed.has('Digit2') || inp.pressed.has('Numpad2')) api.setMode(2);
      if (inp.pressed.has('Digit3') || inp.pressed.has('Numpad3')) api.setMode(3);
      // E is also "interact"; only rotate when nothing is in interaction range.
      const busyE = !!ctx.systems.interaction?.nearest?.();
      const turn = (d) => { if (mode === 2) { followOff = clamp(followOff + d, -Math.PI, Math.PI); followOffT = 0; } else startSnap(d); };
      if (inp.pressed.has('KeyQ')) turn(+STEP);
      if (inp.pressed.has('KeyE') && !busyE) turn(-STEP);
      if (inp.wheel) { p.distance = clamp(p.distance + inp.wheel * 0.035, p.minDist, p.maxDist); }
      if (inp.pointer.down && inp.pointer.dragDX) {
        if (mode === 2) { followOff = clamp(followOff - inp.pointer.dragDX * 0.006, -Math.PI, Math.PI); followOffT = 0; }
        else { p.azimuth -= inp.pointer.dragDX * 0.006; azFrom = azTo = p.azimuth; azT = 1; }
      }
      if (inp.pointer.down && inp.pointer.dragDY) p.elevation = clamp(p.elevation - inp.pointer.dragDY * 0.004, p.minElev, p.maxElev);

      const sp = ctx.state.playerSpeed || 0;
      // town core? (eases the pitch down and the aim point up — see ZONES)
      const plp = ctx.systems.player?.position;
      zoneK = damp(zoneK, plp ? zoneAt(plp.x, plp.z) : 0, p.zoneLambda, dt);

      // ── landmark reveal ─────────────────────────────────────────────────
      // The UI banners the landmark you walk into; ease out so the whole thing
      // fits, then come back to the playing framing.
      const here = ctx.systems.ui?.here ?? null;
      if (revealMute > 0) { revealMute -= dt; lastHere = here; }
      else if (here !== lastHere) { lastHere = here; if (here) revealT = p.revealHold; }
      if (revealT > 0) { revealT -= dt; revealK = damp(revealK, 1, 3.2, dt); }
      else revealK = damp(revealK, 0, 2.2, dt);

      // ── azimuth ─────────────────────────────────────────────────────────
      if (mode === 2) {
        // FOLLOW: the world turns as the visitor turns. Q/E (and drag) hold a
        // temporary offset that unwinds once you have walked for a moment.
        if (sp > 0.6) followOffT += dt; else followOffT = Math.min(followOffT, p.followRecentre);
        if (followOff !== 0 && followOffT >= p.followRecentre) followOff = damp(followOff, 0, 2.2, dt);
        cur.azimuth = wrap(lerpAngle(cur.azimuth, followAz(), 1 - Math.exp(-p.followLambda * dt)));
        p.azimuth = azFrom = azTo = cur.azimuth; azT = 1;    // 2 → 1 must not whip round
      } else if (azT < 1) {
        // eased 45° snap (falls back to damping for drag / external setParams)
        azT = Math.min(1, azT + dt / azDur); cur.azimuth = lerpAngle(azFrom, azTo, ease(azT)); if (azT >= 1) p.azimuth = azTo;
      } else cur.azimuth = lerpAngle(cur.azimuth, p.azimuth, 1 - Math.exp(-7 * dt));
      cur.elevation = damp(cur.elevation, goalElev(), 6, dt);
      cur.distance = damp(cur.distance, goalDistNow(), 5, dt);

      // ── dead-zone follow with look-ahead ────────────────────────────────
      desiredTarget(tmp);
      const dz = p.deadZone * frameScale() * (1 - 0.75 * Math.min(1, sp / 6));
      const dx = tmp.x - target.x, dz2 = tmp.z - target.z;
      const d = Math.hypot(dx, dz2);
      const chase = 6.5 + Math.min(1, sp / 6) * 5;
      if (d > dz) {
        const k = (d - dz) / d;
        target.x = damp(target.x, target.x + dx * k, chase, dt);
        target.z = damp(target.z, target.z + dz2 * k, chase, dt);
      }
      target.y = damp(target.y, tmp.y, 4.2, dt);

      // ── idle "breathing" ────────────────────────────────────────────────
      idle = clamp(idle + (sp > 0.6 ? -dt * 4 : dt * 0.55), 0, 1);
      const br = smoothstep(0.25, 1, idle);
      const t = ctx.state.elapsed;
      const brEl = Math.sin(t * 0.37) * 0.0075 * br;
      const brDist = Math.sin(t * 0.29 + 1.3) * 0.42 * br;

      // ── the night sky moment ────────────────────────────────────────────
      // Cheap: a clock test six times a second, and only then the system pokes.
      moonTick -= dt;
      if (moonTick <= 0) { moonTick = 0.45; tryMoonMoment(); }
      if (moonToastT > 0 && (moonToastT -= dt) <= 0) { ctx.systems.ui?.toast?.(moonToastText, 4.4); moonToastT = -1; }

      // ── look up (hold L) ────────────────────────────────────────────────
      // A cinematic outranks it; so does the pause. The pitch is the half that
      // actually shows sky (see lookPitch).
      const wantLook = (!cine && !ctx.state.paused && inp.down('KeyL')) ? 1 : 0;
      lookK = damp(lookK, wantLook, wantLook > lookK ? 5.5 : 3.2, dt);

      // ── compose final view (+ look-up, + cinematic blend) ───────────────
      let az = cur.azimuth, el = cur.elevation + brEl + tiltFor(cur.distance), dist = cur.distance + brDist;
      let fovGoal = p.fov, pitch = 0, holdAng = 0;
      tmp.copy(target);
      if (lookK > 0.002) {
        el = lerp(el, p.lookElev, lookK);
        fovGoal = lerp(fovGoal, p.lookFov, lookK);
        pitch = p.lookPitch * lookK;
      }
      if (cine) {
        cine.t += dt;
        let w;
        if (cine.t < cine.tIn) w = ease(cine.t / Math.max(1e-3, cine.tIn));
        else if (cine.t < cine.tIn + cine.tHold) w = 1;
        else if (cine.t < cine.tIn + cine.tHold + cine.tOut) w = ease(1 - (cine.t - cine.tIn - cine.tHold) / Math.max(1e-3, cine.tOut));
        else { w = 0; cine.done?.(); cine = null; }
        if (cine) {
          const o = cine.o;
          toVec(o.target ?? tmp, cineTgt);
          az = lerpAngle(az, o.azimuth ?? az, w);
          el = lerp(el, (o.elevation ?? el), w);
          dist = lerp(dist, o.distance ?? dist, w);
          tmp.lerp(cineTgt, w);
          if (o.fov) fovGoal = lerp(fovGoal, o.fov, w);
          pitch = lerp(pitch, o.pitch ?? 0, w);
          if (o.noTilt) holdAng = w;
        }
      }
      // one place owns the lens: the look-up, the shot, or the authored default
      if (Math.abs(cam.fov - fovGoal) > 1e-3) { cam.fov = fovGoal; cam.updateProjectionMatrix(); }

      // big props must not sit between us and the visitor — pull the lens in, or
      // tip up and look over what the lens cannot get in front of. Two sources:
      // the cheap per-frame collider cylinders, and the capsule sweep's real
      // triangle hits (whichever asks for more, gets it).
      const want = occlude(tmp, az, el, dist);
      const dollyGoal = Math.min(want.dist, sweepDolly);
      occDist = dollyGoal < occDist ? damp(occDist, dollyGoal, 16, dt) : damp(occDist, dollyGoal, 3.5, dt);
      const liftGoal = clamp(Math.max(want.lift, sweepLift), 0, liftCap);
      occLift = damp(occLift, liftGoal, liftGoal > occLift ? 5 : 2.5, dt);
      // A `noTilt` shot owns its ANGLES: the anti-occlusion lift would swing the
      // authored framing (17° of it) and tip the moon off the top of the frame.
      // The DOLLY still runs — pulling the lens in front of a blocker changes
      // nothing angular, and it is the only thing that keeps a merged district
      // out of the shot.
      place(az, el + occLift * (1 - holdAng), Math.min(dist, occDist), tmp);

      // ── shake ───────────────────────────────────────────────────────────
      if (shakeT > 0) {
        shakeT -= dt;
        const k = shakeAmp * Math.max(0, shakeT / shakeDur) ** 1.4;
        cam.position.x += Math.sin(t * 47.3) * k;
        cam.position.y += Math.sin(t * 61.7 + 1.7) * k * 0.8;
        cam.position.z += Math.sin(t * 53.1 + 3.1) * k;
        cam.lookAt(tmp.x + Math.sin(t * 39.1) * k * 0.25, tmp.y, tmp.z + Math.sin(t * 43.7) * k * 0.25);
        if (shakeT <= 0) shakeAmp = 0;
      }

      // keep the lens out of the ground
      const gh = world.height(cam.position.x, cam.position.z) + 1.6;
      if (cam.position.y < gh) { cam.position.y = gh; cam.lookAt(tmp); }

      // anything left standing in the way dissolves to a translucent ghost
      candT += dt;
      if (candT >= p.fadeRefresh) { candT = 0; refreshCandidates(); }
      sweepT += dt;
      if (sweepT >= p.occSweep) {
        sweepT = 0;
        // Measure from the UNDOLLIED stop: if the sweep looked from where the
        // dolly already put the lens, the blocker would read as gone and the
        // lens would spring back out, one frame on, one frame off.
        lensAt(az, el + occLift, dist, tmp, idealPos);
        sweepOcclusion(idealPos, cam.position);
        applyCull();
      }
      fadeBlockers(dt, cam.position, tmp);

      // Aim above the body LAST: the shake and the ground clamp both re-aim
      // with lookAt(), which would quietly undo it.
      if (pitch > 1e-4) cam.rotateX(pitch);

      ctx.events.emit('camera:update', cam);
    },
  };

  /**
   * The things fadeBlockers() cannot dissolve: InstancedMesh vegetation, and the
   * merged whole-village meshes (one mesh, 100-unit bounding sphere — fading it
   * would dissolve a whole island). Those we solve with the lens instead, by
   * treating ctx.colliders as cylinders on the sight line:
   *   · pull IN, in front of the blocker, when there is room to do so;
   *   · otherwise tip the view UP so the sight line passes over the blocker —
   *     much gentler than slamming a 25-unit camera to 5, and the right answer
   *     for the tall thin posts you can end up standing against.
   * Returns { dist, lift } (lift in radians of extra elevation).
   */
  function occlude(tgt, az, el, dist) {
    const cols = ctx.colliders;
    const out = { dist, lift: 0 };
    if (!cols || !cols.length) return out;
    const ce = Math.cos(el);
    const dx = Math.sin(az) * ce, dz = Math.cos(az) * ce, dy = Math.sin(el);
    const a = dx * dx + dz * dz;
    if (a < 1e-5) return out;
    // Nobody publishes a collider height, so the two fixes assume different
    // things — and that is the whole trick:
    //   · DOLLY, for a mass sitting right in front of the lens. Giant candy is
    //     20-35 units tall, so up there we must NOT assume props are short.
    //     The lens may only come in to `floor` (62% of the stop), which is what
    //     keeps it from diving into the candy forest to dodge a lollipop stick.
    //   · TILT, for a mass near the player, which the lens can never get in
    //     front of. Here we assume ~6 units (village props, posts, benches);
    //     guessing tall would tip the camera up in every dense street.
    // Dollying is only safe on a steep sight line: near the horizontal, the gap
    // between the player and a blocker is as likely to be the inside of a cat
    // house (walls are geometry, colliders are a few circles) as it is open air.
    // Below that, the tilt is the only fix — and it raises the angle anyway.
    const mayDolly = el > 0.45;
    const floor = Math.max(6, dist * 0.62);
    let best = dist, lift = 0;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      let r, t0;
      if (c.box) {
        // oriented wall: slab test in the box's own frame (wave-2 collider contract)
        const hw = (c.w || 0) * 0.5, hd = (c.d || 0) * 0.5;
        if (hw <= 0 || hd <= 0) continue;
        r = Math.max(hw, hd) + 0.5;
        const rot = c.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
        const ox = tgt.x - c.x, oz = tgt.z - c.z;
        const px = ox * cs + oz * sn, pz = -ox * sn + oz * cs;
        const vx = dx * cs + dz * sn, vz = -dx * sn + dz * cs;
        let tmin = -Infinity, tmax = Infinity;
        for (const [o, v, h] of [[px, vx, hw + 0.4], [pz, vz, hd + 0.4]]) {
          if (Math.abs(v) < 1e-6) { if (o < -h || o > h) { tmin = Infinity; break; } continue; }
          const ta = (-h - o) / v, tb = (h - o) / v;
          tmin = Math.max(tmin, Math.min(ta, tb)); tmax = Math.min(tmax, Math.max(ta, tb));
        }
        if (!(tmin < tmax) || tmax <= 0) continue;
        t0 = Math.max(tmin, 0);
      } else {
        r = (c.r || 0) + 0.5;
        if (r < 0.95) continue;                    // specks never move the camera at all
        const ox = tgt.x - c.x, oz = tgt.z - c.z;
        const bb = 2 * (ox * dx + oz * dz);
        const cc = ox * ox + oz * oz - r * r;
        const disc = bb * bb - 4 * a * cc;
        if (disc <= 0) continue;
        t0 = (-bb - Math.sqrt(disc)) / (2 * a);    // where the sight line enters it
      }
      if (t0 <= 1.2 || t0 >= best) continue;
      const rise = dy * t0;                           // sight-line height at the blocker
      if (mayDolly && r >= 1.2 && t0 - 0.5 >= floor) {
        if (rise < (c.h ?? 14) - 1.0) best = t0 - 0.5;
      } else if (t0 > 2.0 && r >= 1.5) {
        // A mass we cannot get in front of. Nobody publishes collider heights,
        // so this guess is wrong as often as it is right — which is exactly why
        // the tilt is capped at 7°: a false positive costs a slightly steeper
        // frame, never the authored composition.
        const top = (c.h ?? 6) - 1.0;
        if (rise < top) lift = Math.max(lift, clamp(Math.asin(clamp(top / t0, -1, 1)) - el, 0, p.colLiftMax));
      }
    }
    out.dist = Math.max(floor, best); out.lift = lift;
    return out;
  }

  // ── blocker fade ───────────────────────────────────────────────────────────
  // Anything standing between the lens and the visitor dissolves to a
  // translucent silhouette and comes back when it clears. Candidates are
  // refreshed a few times a second; the per-frame test is a bounding-sphere /
  // segment distance, so it costs a handful of dot products per mesh.
  const cands = [];                 // per-frame sphere fade: prop-sized separate meshes
  const sweepers = [];              // capsule sweep: { o, bb, r, maxDim, big, cullable }
  const insts = [];                 // instanced blockers: { o, r, cloud, n }
  const faded = new Map();          // mesh → { k, orig, mat }  (currently dissolving)
  const clones = new Map();         // mesh → { orig, mat }     (lazy fade material cache)
  const culled = new Map();         // mesh → true              (visible=false, lens inside it)
  const sweepFade = new Set();      // what the last capsule sweep asked to ghost
  const hit = new Set();
  const probes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const seg = new THREE.Vector3(), bc = new THREE.Vector3();
  let candT = 0;

  /**
   * Candidate blockers: every non-instanced, PROP-SIZED mesh in the scene.
   *
   * The size gate is the whole point. A merged district ("cat_arrival_matte":
   * one mesh holding the ferry hall, its roof, the pier deck and the bollards)
   * is a single Object3D, so dissolving it dissolves the district — which is
   * exactly the regression critics saw: a see-through Arrivals roof, bollards
   * floating over a missing pier, ghost sheets across the plaza. Those masses
   * belong to the dolly and the tilt in occlude(), never to the fade.
   *
   *   userData.noFade = true   never dissolve me (the player, his decals)
   *   userData.fade   = true   consider me even if I am over fadeMaxRadius — for
   *                            a prop-sized mesh whose bounding sphere is loose
   *                            (a long thin awning). Still capped at
   *                            fadeHardMax, and structural meshes are never in.
   */
  const STRUCTURAL = /^(terrain|sky|cloud|star|sun|moon|water|sea|river|lake|cat_[a-z0-9]+_|candyArch_)/i;
  /**
   * NEVER a ghost, at any size, on any path. The docked Sugarfin is a 20-unit
   * character parked between the plaza and the pier: dissolving it read as a
   * bug, not as a courtesy, in every arrival frame. The lens may still be
   * INSIDE it (rule 0 culls that) and it may still push the lens around — it
   * simply never goes translucent. Anything a builder marks userData.noFade
   * gets the same protection here.
   */
  const NEVER_FADE = /^(sugarfin|whale|ferry)/i;
  function noFade(o) {
    if (o.userData.noFade) return true;
    if (NEVER_FADE.test(o.name || '')) return true;
    for (let n = o.parent; n; n = n.parent) {
      if (n.userData?.noFade) return true;
      if (NEVER_FADE.test(n.name || '')) return true;
    }
    return false;
  }
  const isStructural = (o) => {
    if (STRUCTURAL.test(o.name || '')) return true;
    for (let n = o.parent; n; n = n.parent) if (n.name === 'terrain' || n.name === 'sky') return true;
    return false;
  };

  /**
   * What the capsule sweep is allowed to raycast. Wider than the fade list —
   * merged districts and island-scale candy merges belong here, because they
   * are what the sight line actually hits — but it still drops the four things
   * that are scenery rather than obstruction:
   *   · the ground, the sea, the paths, the river and the lake (the sight line
   *     grazes the ground at the shoes in every single frame; treating that as
   *     occlusion pins the tilt at its cap forever) and the sky dome;
   *   · particle sheets and any material that does not write depth — a glow
   *     disc, a light spill, a haze quad hides nothing;
   *   · InstancedMesh vegetation — thousands of instances to raycast. It is NOT
   *     ignored any more (a wall of opaque palm fronds swallowed the visitor in
   *     the round-3 plaza frame): it goes to the instanced pass below, which
   *     tests instance bounding SPHERES instead of triangles;
   *   · userData.noFade (the visitor himself) and userData.noOcclude (an
   *     opt-out for any builder who wants their mesh left alone).
   */
  const SKY_GROUND = /^(terrain_(ground|sea|path|river|lake)|sky|cloud|star|sun|moon|water|sea|river|lake|particles|fx_)/i;
  /** Names that mean "a big dumb mass of ground or masonry" (see the plinth rule). */
  const PLINTH = /plinth|pedestal|podium|plateau|terrain|mound|hillside|bluff|cliff|foundation|_base\b|base_/i;
  function sweepable(o) {
    if (!o.isMesh || o.isInstancedMesh) return false;
    if (o.userData.noFade || o.userData.noOcclude) return false;
    if (SKY_GROUND.test(o.name || '')) return false;
    for (let n = o.parent; n; n = n.parent) {
      if (n.name === 'sky') return false;
      if (n.userData && n.userData.noOcclude) return false;
    }
    // a mesh we are currently ghosting is wearing a transparent material of our
    // own making — it must stay a candidate or it can never be re-tested, and it
    // would sit at 15% opacity forever
    if (faded.has(o)) return true;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.depthWrite === false) return false;
    if (m.transparent && (m.opacity ?? 1) < 0.9) return false;
    return true;
  }

  /**
   * An InstancedMesh worth testing: big enough instances to hide a person, a
   * material that writes depth, not sky/ground/particles. Grass, petals and
   * confetti are excluded by occInstMin — they hide nothing and there are
   * thousands of them.
   */
  function instanceable(o) {
    if (!o.isInstancedMesh || !o.count) return false;
    if (o.userData.noFade || o.userData.noOcclude || o.userData.noInstOcclude) return false;
    if (SKY_GROUND.test(o.name || '')) return false;
    for (let n = o.parent; n; n = n.parent) {
      if (n.name === 'sky') return false;
      if (n.userData && (n.userData.noOcclude || n.userData.noInstOcclude)) return false;
    }
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.depthWrite === false) return false;
    if (m.transparent && (m.opacity ?? 1) < 0.9) return false;
    return true;
  }

  function refreshCandidates() {
    cands.length = 0;
    sweepers.length = 0;
    insts.length = 0;
    ctx.scene.traverse((o) => {
      const g = o.geometry;
      if (!o.isMesh || !g) return;
      if (!g.boundingSphere) { try { g.computeBoundingSphere(); } catch { return; } }
      const bs = g.boundingSphere;
      if (!bs || !Number.isFinite(bs.radius)) return;

      if (instanceable(o)) {
        // the whole cloud's sphere (all instances) — the broad phase that keeps
        // a forest on the other side of the island out of the inner loop
        if (!o.boundingSphere) { try { o.computeBoundingSphere(); } catch { /* keep going */ } }
        const sc = worldScale(o);
        const r = bs.radius * sc;
        if (r >= p.occInstMin) insts.push({ o, r, cloud: o.boundingSphere || null, n: o.count, d: 0 });
      }

      if (sweepable(o)) {
        if (!g.boundingBox) { try { g.computeBoundingBox(); } catch { return; } }
        if (g.boundingBox) {
          const sc = worldScale(o);
          const bb = g.boundingBox;
          const maxDim = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * sc;
          const ix = g.index, pos = g.attributes && g.attributes.position;
          sweepers.push({
            o, bb, r: bs.radius * sc, maxDim, d: 0,
            tris: ((ix ? ix.count : (pos ? pos.count : 0)) / 3) | 0,
            big: maxDim > p.occFadeMaxDim,
            cullable: maxDim <= p.occCullMax && !isRoof(o),
          });
        }
      }

      // the cheap per-frame path stays prop-sized only
      if (o.isInstancedMesh || noFade(o)) return;
      if (bs.radius > p.fadeHardMax * 3 && o.userData.fade !== true) return;
      if (isStructural(o)) return;
      cands.push(o);
    });
  }

  const worldScale = (o) => {
    const e = o.matrixWorld.elements;
    return Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
  };
  /** Architecture systems hide their own roofs when you step inside; never touch one. */
  function isRoof(o) {
    if (o.userData.roof) return true;
    if (/roof|ceiling|upper/i.test(o.name || '')) return true;
    for (let n = o.parent; n; n = n.parent) if (n.userData?.roof || /roof|ceiling|upper/i.test(n.name || '')) return true;
    return false;
  }

  function fadeMat(m) {
    const c = m.clone();                    // Material.copy() deep-clones userData,
    c.transparent = true; c.depthWrite = false;   // so shader uniforms may not survive
    c.userData = m.userData;                      // — keep the original reference
    if (m.onBeforeCompile) c.onBeforeCompile = m.onBeforeCompile;
    return c;
  }
  function setOpacity(m, v) { if (Array.isArray(m)) { for (const x of m) x.opacity = v; } else m.opacity = v; }
  /** The ghost version of this mesh's material — cloned once, reused forever, so
   *  a material shared by 400 lollipops is never faded globally. */
  function ghostFor(o, orig) {
    let c = clones.get(o);
    if (!c || c.orig !== orig) {
      let mat = null;
      // a material that refuses to clone (exotic userData) simply never fades
      try { mat = Array.isArray(orig) ? orig.map(fadeMat) : fadeMat(orig); }
      catch { o.userData.noFade = true; }
      c = { orig, mat }; clones.set(o, c);
    }
    return c.mat;
  }

  // ── capsule sweep ──────────────────────────────────────────────────────────
  // Five lines from the lens to the visitor's head, spread over the silhouette
  // the occRadius capsule sweeps: hat, chest, knees, one shoulder and the other
  // shin (a diagonal reads the whole body). Anything they hit is classified into
  // cull / fade / dolly / tilt (see the header). Runs at occSweep, not per
  // frame: the survivors of the broad phase are 30k-triangle merged districts,
  // and raycasting those 60 times a second would cost more than the rest of
  // the camera put together.
  const rc = new THREE.Raycaster();
  const qaRay = new THREE.Raycaster();     // bodyVisibility() only — unbudgeted, on demand
  rc.firstHitOnly = true;                  // honoured by three-mesh-bvh if it ever lands
  const rayA = new THREE.Vector3(), rayD = new THREE.Vector3();
  const rightV = new THREE.Vector3(), headV = new THREE.Vector3();
  const tmpBox = new THREE.Box3();
  const rayEnds = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const rayHits = [];
  const cullNow = new Set();
  const idealPos = new THREE.Vector3();
  const near = [];
  const rayDirs = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const rayLens = [0, 0, 0, 0, 0];
  const testedNow = new Set(), fadeNow = new Set();
  const instM = new THREE.Matrix4(), instV = new THREE.Vector3(), sightV = new THREE.Vector3();

  /**
   * Builders may expose `hideInstancesNear(x, z, r)` — the vegetation system
   * hiding its own fronds around the visitor is a better answer than anything
   * the lens can do about them. Nobody ships it yet, so the call is defensive on
   * purpose: the day catNature or candyVegetation grows one, the camera starts
   * using it with no further change here.
   */
  function askOwnersToHide(pl) {
    if (!pl) return;
    for (const k in ctx.systems) {
      const sys = ctx.systems[k];
      const f = sys && sys.hideInstancesNear;
      if (typeof f === 'function') { try { f.call(sys, pl.x, pl.z, p.occRadius + 1.6); } catch { /* a hook must never break the camera */ } }
    }
  }

  /** Nearest intersection of one candidate with the current ray, or null. */
  function nearestHit(o, far) {
    rayHits.length = 0;
    rc.far = far;
    try { o.raycast(rc, rayHits); } catch { return null; }
    let best = null;
    for (let i = 0; i < rayHits.length; i++) if (!best || rayHits[i].distance < best.distance) best = rayHits[i];
    return best;
  }

  /**
   * Is this hit a real obstruction, or the floor?
   * Two things the sight line touches in almost every frame and must ignore:
   *   · ground-hugging geometry — a path edge, a flowerbed kerb, a merged
   *     district's own pavement. The shoes ray grazes something at ankle height
   *     wherever you stand, and treating that as occlusion pinned the tilt at
   *     its cap in every test frame.
   *   · the deck or step the visitor is standing ON, right under the sample
   *     point we were aiming at.
   */
  function realBlocker(h, end) {
    if (!h || !h.point) return false;
    if (h.point.distanceToSquared(end) < 1.0) return false;
    return h.point.y - world.height(h.point.x, h.point.z) >= p.occGroundMin;
  }

  /**
   * One sweep.
   *   `fromPos` — the UNDOLLIED stop the rays are cast from (stable; see the
   *               note in update()).
   *   `lensPos` — where the lens actually is, for the two rules that are about
   *               the real camera: the cull, and "is this hit at the lens".
   * Fills sweepFade / cullNow and sets sweepDolly + sweepLift for the control
   * loop in update(). Returns the fraction of body rays that stayed blocked.
   */
  function sweepOcclusion(fromPos, lensPos = fromPos, budget = p.occBudget, log = null) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    const pl = ctx.systems.player?.position;
    cullNow.clear();
    sweepDolly = Infinity;
    if (!pl || (!sweepers.length && !insts.length)) { sweepFade.clear(); occBlocked = 0; sweepLift = 0; lastDolly = Infinity; return 0; }

    // the dolly offset: how much nearer the real lens is than the rays' origin
    const lensBack = fromPos.distanceTo(lensPos);
    headV.set(pl.x, pl.y + p.occHead, pl.z);
    rayA.copy(fromPos);
    rayD.subVectors(headV, rayA);
    const segLen = rayD.length();
    if (segLen < 1e-3) { occBlocked = 0; return 0; }
    rayD.divideScalar(segLen);
    // ground-plane right vector of the sight line — the body's screen width
    rightV.set(-rayD.z, 0, rayD.x);
    const rl = rightV.length();
    if (rl > 1e-4) rightV.divideScalar(rl); else rightV.set(1, 0, 0);

    const sh = p.occRadius * 0.55;          // shoulder offset inside the capsule
    rayEnds[0].copy(headV);                                                    // hat
    rayEnds[1].set(pl.x, pl.y + 1.05, pl.z);                                   // chest
    rayEnds[2].set(pl.x, pl.y + 0.50, pl.z);                                   // knees
    rayEnds[3].set(pl.x + rightV.x * sh, pl.y + 1.15, pl.z + rightV.z * sh);   // one shoulder
    rayEnds[4].set(pl.x - rightV.x * sh, pl.y + 0.50, pl.z - rightV.z * sh);   // the other shin

    // Broad phase once for the whole bundle: bounding sphere vs the centre
    // segment, padded by the capsule radius plus the body spread.
    const pad0 = p.occRadius + 0.9;
    near.length = 0;
    for (let i = 0; i < sweepers.length; i++) {
      const s = sweepers[i];
      const o = s.o;
      if (!o.visible || !o.parent) continue;
      const bs = o.geometry.boundingSphere;
      if (!bs) continue;
      bc.copy(bs.center).applyMatrix4(o.matrixWorld);
      const sc = worldScale(o);
      const r = bs.radius * sc + pad0;
      const sd = segDist2(rayA, headV, bc);
      if (sd > r * r) continue;
      // rule 0 — the lens is inside a room-sized mesh: cull it outright
      if (s.cullable) {
        tmpBox.copy(s.bb).applyMatrix4(o.matrixWorld).expandByScalar(0.35);
        if (tmpBox.containsPoint(lensPos)) { cullNow.add(o); continue; }
      }
      s.d = sd;
      near.push(s);
    }
    // nearest the sight line first: those are the ones that actually hide him
    near.sort((a, b) => a.d - b.d);

    for (let k = 0; k < rayEnds.length; k++) {
      rayDirs[k].subVectors(rayEnds[k], rayA);
      rayLens[k] = rayDirs[k].length();
      if (rayLens[k] > 1e-3) rayDirs[k].divideScalar(rayLens[k]);
    }

    // TRIANGLE BUDGET. This world's props are merged: a single candidate can be
    // 50k triangles, and testing every candidate every sweep cost 20-60 ms.
    // So each sweep spends occBudget ray-triangle tests, nearest candidate
    // first, and resumes where it left off — a full rotation takes a few sweeps
    // and the hysteresis below is what holds the answer steady across them.
    const blockedRay = [false, false, false, false, false];
    let needTilt = false, dollyBest = Infinity, lastResort = Infinity;
    let plinthNear = false, instHit = false;      // the two round-4 escalations
    const floor = Math.max(6, goalDist() * p.occDollyFloor);
    testedNow.clear(); fadeNow.clear();
    let spent = 0;
    if (sweepCursor >= near.length) sweepCursor = 0;
    for (let n = 0; n < near.length; n++) {
      const idx = (sweepCursor + n) % near.length;
      const s = near[idx];
      // a 36k-triangle merged district is not worth five rays: head, chest and
      // knees already describe the silhouette, and the two shoulder rays are
      // there for narrow props (a post, a lamp, a cat) which are cheap anyway
      const nRays = s.tris > 6000 ? 3 : rayEnds.length;
      const cost = Math.max(1, s.tris) * nRays;
      if (n >= 1 && spent > 0 && spent + cost > budget) { sweepCursor = idx; break; }
      spent += cost;
      if (n === near.length - 1) sweepCursor = 0;
      const o = s.o;
      if (cullNow.has(o) || !o.visible) continue;
      testedNow.add(o);
      if (log) log.push({ n: o.name || o.type, tested: 1, tris: s.tris, rays: nRays, off: +Math.sqrt(s.d).toFixed(1), d: 9999 });
      for (let k = 0; k < nRays; k++) {
        const L = rayLens[k];
        if (L < 1e-3) continue;
        rc.set(rayA, rayDirs[k]);
        rc.near = 0.05;
        const h = nearestHit(o, L - 0.2);
        if (log && h) {
          log.push({
            n: o.name || o.type, ray: k, d: +h.distance.toFixed(1), dPlayer: +(L - h.distance).toFixed(1),
            aboveGround: +(h.point.y - world.height(h.point.x, h.point.z)).toFixed(2),
            maxDim: +s.maxDim.toFixed(1), big: s.big, real: realBlocker(h, rayEnds[k]),
          });
        }
        if (!realBlocker(h, rayEnds[k])) continue;
        // rule 1 — fade. Prop-sized always; a merged district only when the hit
        // is right at the lens, i.e. we are standing inside the thing.
        if ((!s.big || h.distance - lensBack <= p.occNearLens) && !noFade(o)) { fadeNow.add(o); continue; }
        // rules 2 / 3 — a mass we must move around
        blockedRay[k] = true;
        const dPlayer = L - h.distance;        // how far in front of the visitor it sits
        // A PLINTH / TERRAIN MASS right under the lens. The giant cupcake's
        // plinth is a featureless tan wall 8 units from the lens and 30 across:
        // it cannot be ghosted (it is half the landmark), the dolly cannot get
        // in front of it, and 0.30 rad of tilt does not clear it. Name it or
        // measure it — either way it unlocks the taller tilt and forces a dolly.
        if (h.distance - lensBack <= p.occPlinthNear && (PLINTH.test(o.name || '') || s.maxDim > p.occFadeLastDim)) {
          plinthNear = true;
          lastResort = Math.min(lastResort, Math.max(floor, dPlayer - 0.6));
        }
        if (dPlayer - 0.7 >= floor) { dollyBest = Math.min(dollyBest, dPlayer - 0.7); continue; }
        // Nothing in front of it to dolly to. If the tilt has already been
        // tried here and did not work (see giveUp below), ghosting the mass is
        // the last thing left — allowed for a building or a facility shell, but
        // never for an island-wide merge, which would dissolve half the game.
        if (giveUp && s.maxDim <= p.occFadeLastDim && !noFade(o)) { fadeNow.add(o); blockedRay[k] = false; continue; }
        needTilt = true;
        if (dPlayer >= 4) lastResort = Math.min(lastResort, dPlayer - 0.7);
      }
    }
    // ── INSTANCED BLOCKERS ────────────────────────────────────────────────
    // The round-3 plaza frame lost the visitor behind a wall of instanced palm
    // fronds that this sweep was not even looking at. Raycasting 2000 instances
    // is out of the question, so each instance is a SPHERE (shrunk by occInstK,
    // because a frond cloud's sphere is mostly air) tested against the sight
    // line: cheap enough that the whole cloud fits in one sweep's budget.
    // What we do about it, in order: ask the owner to hide the instances, dolly
    // in front of them, and failing that tilt harder than a solid mesh would.
    if (insts.length && segLen > 1e-3) {
      sightV.subVectors(headV, rayA);
      const sightL2 = sightV.lengthSq() || 1e-6;
      const iFloor = Math.max(5.5, goalDist() * p.occInstFloor);
      let instSpent = 0;
      for (let i = 0; i < insts.length && instSpent < p.occInstBudget; i++) {
        const s = insts[i];
        const o = s.o;
        if (!o.visible || !o.parent || !o.count) continue;
        const gbs = o.geometry.boundingSphere;
        if (!gbs) continue;
        const wsc = worldScale(o);
        // whole-cloud reject first: a forest on the far shore costs one test
        const cl = o.boundingSphere;
        if (cl) {
          bc.copy(cl.center).applyMatrix4(o.matrixWorld);
          const cr = cl.radius * wsc + p.occRadius + 1.5;
          if (segDist2(rayA, headV, bc) > cr * cr) continue;
        }
        const cnt = Math.min(o.count, p.occInstBudget - instSpent);
        for (let j = 0; j < cnt; j++) {
          instSpent++;
          o.getMatrixAt(j, instM);
          const e = instM.elements;
          const isc = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
          const r = gbs.radius * isc * wsc * p.occInstK;
          if (r < p.occInstMin) continue;
          instV.copy(gbs.center).applyMatrix4(instM).applyMatrix4(o.matrixWorld);
          const rr = r + p.occRadius * 0.6;
          if (segDist2(rayA, headV, instV) > rr * rr) continue;
          const tt = ((instV.x - rayA.x) * sightV.x + (instV.y - rayA.y) * sightV.y + (instV.z - rayA.z) * sightV.z) / sightL2;
          if (tt <= 0.02 || tt >= 0.98) continue;            // beside us, or behind the lens
          const dPlayer = segLen - tt * segLen;
          if (dPlayer < 1.2) continue;                       // the trunk we are standing against
          instHit = true;
          for (let k = 0; k < rayEnds.length; k++) if (segDist2(rayA, rayEnds[k], instV) < rr * rr) blockedRay[k] = true;
          if (log) log.push({ n: (o.name || o.type) + '[inst]', inst: j, d: +(tt * segLen).toFixed(1), dPlayer: +dPlayer.toFixed(1), r: +r.toFixed(2) });
          if (dPlayer - 0.8 >= iFloor) dollyBest = Math.min(dollyBest, dPlayer - 0.8);
          else { needTilt = true; lastResort = Math.min(lastResort, Math.max(iFloor, dPlayer - 0.6)); }
        }
      }
      if (instHit) askOwnersToHide(pl);
    }
    // the tilt is allowed to run taller against a plinth than against a wall
    liftCap = plinthNear ? Math.max(p.occLiftMax, p.occLiftPlinth) : p.occLiftMax;

    // a mesh only stops ghosting once a sweep has actually looked at it again
    for (const o of sweepFade) if (testedNow.has(o) && !fadeNow.has(o)) sweepFade.delete(o);
    for (const o of fadeNow) sweepFade.add(o);

    let blocked = 0;
    for (let k = 0; k < blockedRay.length; k++) if (blockedRay[k]) blocked++;
    occBlocked = blocked / rayEnds.length;

    // HYSTERESIS. The sweep looks along the lifted sight line, so the moment the
    // tilt works the blocker disappears from the measurement — unwind it at the
    // same speed and the camera nods up and down forever. So: climb at once,
    // unwind only after six consecutive clear sweeps (~1 s) or when the
    // visitor has walked 3 units away from wherever the tilt was raised, which
    // is the honest signal that the obstacle is behind us.
    const moved = Number.isFinite(liftAnchor.x) && liftAnchor.distanceTo(pl) > 3;
    if (giveUp && Number.isFinite(giveUpAt.x) && giveUpAt.distanceTo(pl) > 3) { giveUp = false; liftMaxRun = 0; }
    if (needTilt) {
      clearRun = 0;
      if (!giveUp) {
        // an instanced wall of fronds gets a harder push than a solid wall: the
        // sweep can only see it coarsely, so it has to commit when it does
        sweepLift = Math.min(liftCap, sweepLift + p.occLiftStep * (instHit ? p.occInstStep : 1));
        liftAnchor.copy(pl);
        // A tilt that has run all the way to its cap and STILL leaves him
        // behind the thing is pure composition damage: it steepens every frame
        // and buys nothing. Give up on it, remember the spot, and let the fade
        // above take over until the visitor has walked 3 units away.
        if (sweepLift >= liftCap - 1e-6 && ++liftMaxRun >= 2) {
          giveUp = true; sweepLift = 0; giveUpAt.copy(pl);
        }
      }
    } else {
      clearRun++; liftMaxRun = 0;
      if (clearRun >= 6) giveUp = false;
      if (moved) { sweepLift = 0; liftAnchor.set(NaN, 0, 0); }
      else if (clearRun >= 6) { sweepLift = Math.max(0, sweepLift - p.occLiftStep); clearRun = 4; }
    }
    // Tilt maxed out and still hidden: the dolly may come in past its floor —
    // but ONLY inside something. A 6-unit lens in the open is not a rescue, it
    // is a different game: it puts the camera in the visitor's pocket and
    // throws away the composition, which is exactly what a critic caught it
    // doing on every close approach. Outdoors the floor is the floor, and the
    // silhouette pass is what keeps him visible from there.
    const hardFloor = indoors() ? 5.5 : floor;
    if (needTilt && sweepLift >= liftCap - 1e-6 && Number.isFinite(lastResort)) {
      dollyBest = Math.min(dollyBest, Math.max(hardFloor, lastResort));
    }
    if (Number.isFinite(dollyBest)) dollyBest = Math.max(dollyBest, hardFloor);
    // the dolly gets the same hold, for the same reason
    if (!Number.isFinite(dollyBest) && clearRun < 4) dollyBest = lastDolly;
    lastDolly = dollyBest;
    sweepDolly = dollyBest;
    occMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    return occBlocked;
  }

  /** visible=false while the lens is inside a mesh; restore when it leaves. */
  function applyCull() {
    for (const o of [...culled.keys()]) {
      if (cullNow.has(o)) continue;
      o.visible = true; culled.delete(o);
    }
    for (const o of cullNow) {
      if (culled.has(o)) continue;
      if (o.visible === false) continue;         // somebody else (a roof) already hid it
      const s = faded.get(o);                     // a culled mesh must not keep a ghost material
      if (s) { if (o.material === s.mat) o.material = s.orig; faded.delete(o); }
      o.visible = false; culled.set(o, true);
    }
  }
  function clearCull() {
    for (const o of culled.keys()) o.visible = true;
    culled.clear(); cullNow.clear();
  }

  /** Squared distance from sphere centre to the segment a→b. */
  function segDist2(a, b, c) {
    seg.subVectors(b, a);
    const L = seg.lengthSq() || 1e-6;
    let t = ((c.x - a.x) * seg.x + (c.y - a.y) * seg.y + (c.z - a.z) * seg.z) / L;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = a.x + seg.x * t - c.x, dy = a.y + seg.y * t - c.y, dz = a.z + seg.z * t - c.z;
    return dx * dx + dy * dy + dz * dz;
  }

  function fadeBlockers(dt, camPos, tgt) {
    hit.clear();
    // Probe the whole body — hat, chest, shoes — so nothing clips the silhouette
    // anywhere along it. The probes ride the player, not the look-ahead target.
    const pl = ctx.systems.player?.position;
    const bx = pl ? pl.x : tgt.x, bz = pl ? pl.z : tgt.z, by = pl ? pl.y : tgt.y - 1.15;
    probes[0].set(bx, by + 1.78, bz);
    probes[1].set(bx, by + 0.95, bz);
    probes[2].set(bx, by + 0.12, bz);
    for (let i = 0; i < cands.length; i++) {
      const o = cands[i];
      if (!o.visible || !o.parent) continue;
      if (!o.geometry.boundingSphere) { try { o.geometry.computeBoundingSphere(); } catch { continue; } }
      const bs = o.geometry.boundingSphere;
      if (!bs) continue;
      const e = o.matrixWorld.elements;
      const sc = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
      const r = bs.radius * sc;
      if (r < 0.06) continue;                      // specks are not worth a clone
      // prop-sized only: a roof, a deck, a district or a hillside is never faded
      if (r >= p.fadeMaxRadius && o.userData.fade !== true) continue;
      if (r >= p.fadeHardMax) continue;            // even an opt-in cannot dissolve a district
      bc.copy(bs.center).applyMatrix4(o.matrixWorld);
      // cheap reject: the sphere has to be nearer the player than the lens is
      const pad = r + p.fadeProbe, pad2 = pad * pad;
      let blocks = false;
      for (let k = 0; k < 3 && !blocks; k++) if (segDist2(camPos, probes[k], bc) < pad2) blocks = true;
      if (blocks) hit.add(o);
    }
    // …plus whatever the last capsule sweep asked for (the merged districts and
    // the big props the sphere test can never see)
    for (const o of sweepFade) {
      if (!o.parent) { sweepFade.delete(o); continue; }      // left the scene
      if (o.visible && !culled.has(o)) hit.add(o);
    }

    const up = p.fadeTime > 0 ? dt / p.fadeTime : 1;
    const down = p.fadeBack > 0 ? dt / p.fadeBack : 1;
    for (const o of hit) {
      if (culled.has(o)) continue;
      let s = faded.get(o);
      if (!s) { s = { k: 0, orig: o.material, mat: null }; faded.set(o, s); }
      if (o.material !== s.orig && o.material !== s.mat) { s.orig = o.material; s.mat = null; }
      if (!s.mat) s.mat = ghostFor(o, s.orig);
      if (!s.mat) { faded.delete(o); continue; }
      s.k = Math.min(1, s.k + up);
      setOpacity(s.mat, 1 - (1 - p.fadeOpacity) * s.k);
      o.material = s.mat;
    }
    for (const [o, s] of faded) {
      if (hit.has(o) && !culled.has(o)) continue;
      s.k = Math.max(0, s.k - down);
      if (s.k < 0.02) { if (o.material === s.mat) o.material = s.orig; faded.delete(o); continue; }
      if (s.mat) { setOpacity(s.mat, 1 - (1 - p.fadeOpacity) * s.k); o.material = s.mat; }
    }
  }
  /** Restore every faded blocker (used when the follow camera hands over). */
  function clearFades() {
    for (const [o, s] of faded) { if (o.material === s.mat) o.material = s.orig; }
    faded.clear(); sweepFade.clear();
  }

  /** Tips down as you zoom out, and flattens toward the horizon as you zoom in
   *  (0 at the reference distance, so tools/render.mjs --el/--dist stay exact). */
  function tiltFor(dist) {
    if (dist >= distRef) return clamp((dist - distRef) / Math.max(1, p.maxDist - distRef), 0, 1) * p.tiltOut;
    return -clamp((distRef - dist) / Math.max(1, distRef - p.minDist), 0, 1) * p.tiltIn;
  }
  function startSnap(delta) {
    azFrom = cur.azimuth; azTo = wrapNear(azFrom, (azT < 1 ? azTo : p.azimuth) + delta); azT = 0; p.azimuth = azTo;
  }
  function wrapNear(from, to) { return from + wrap(to - from); }

  // ── night sky moment: when is the visitor free to be shown something? ──────
  /**
   * Inside somebody's building? Each architecture system publishes its own
   * `interiors`; nothing about the shape is promised beyond `inside`, so take
   * an array, a Map, a Set or a plain object and never throw on a system that
   * has not shipped them yet.
   */
  function indoors() {
    for (const k of ['candyArchitecture', 'catArchitecture']) {
      let list = ctx.systems[k]?.interiors;
      if (!list) continue;
      if (list instanceof Map || list instanceof Set) list = [...list.values()];
      else if (!Array.isArray(list)) { try { list = Object.values(list); } catch { continue; } }
      for (const it of list) if (it && it.inside === true) return true;
    }
    return false;
  }
  /** A 5 s shot is a gift when you are wandering and an insult when you are not. */
  function moonBusy() {
    const pl = ctx.systems.player;
    return !!(cine || free || ctx.state.paused || ctx.state.ferry
      || pl?.locked || pl?.onFerry || pl?.onVehicle || indoors());
  }
  function tryMoonMoment() {
    const h = ctx.state.time;
    // re-arm for the next night once the window is well behind (or ahead of) us
    if (h < MOON_WINDOW[0] - 1 || h > MOON_WINDOW[1] + 0.1) moonDone = false;
    // renders are single frames of a fixed world: a 5 s shot would hijack every
    // night view in the game. Only an explicit api.moonMoment() runs under ?shot.
    if (moonDone || ctx.shot) return;
    if (h < MOON_WINDOW[0] || h > MOON_WINDOW[1]) return;
    if (moonBusy()) return;
    api.moonMoment();
  }

  // If the UI ever emits its location banner as an event, take it straight —
  // otherwise the poll on ctx.systems.ui.here in update() does the same job.
  ctx.events.on('ui:banner', () => { if (revealMute <= 0) api.reveal(); });

  api.snap();
  return api;
}
