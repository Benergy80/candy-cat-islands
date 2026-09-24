// The third-person camera (WAVE 3, docs/CAMERA_SPEC.md): three modes on keys 1 / 2 / 3, a look-around
// on V, an aim point that runs ahead of you, and a see-through window where the old lens dived into the
// scenery. Nothing here moves the visitor except V's look, which holds him still while it lasts.
//   1 ISO (default)  el 0.64 (0.50 in town cores), 31 u, fov 30. You own the orientation (Q/E, a drag);
//                    it never auto-yaws. Toast "Camera: iso — you turn it (Q/E)".
//   2 FOLLOW         el − 0.18 (never under 0.40), 31 × 0.72 = 22.3 u, fov 42, pitched up m2Pitch so a
//                    band of sky stays in frame (more as the occlusion lift would squeeze it under 4.5%).
//                    A ground tether (§4.2) hangs the lens behind your travel: A/D circle-strafe, S backs
//                    straight off, pure W on a path bends it toward the path, and the clear-side whiskers
//                    (§4.4) try a side when he is hidden. Q/E, a drag and tap V turn the tether.
//                    Toast "Camera: follow — turns with you".
//   3 TOP            el 1.10, 31 × 1.40 = 43.4 u, fov 30: the lay of the land. Toast "Camera: top — lay of
//                    the land". The mode toasts are MODE_TOAST; the chip (ui/hotbar.js) lights the mode.
//   Flying (ctx.state.flying) frames every mode at 44 / 0.38 / fov 40 behind the heading (Contract E).
//   Anything that owns the framing (interiors, the palace and the cave, vehicles, the ferry, a lock) gets
//   mode 1's framing in mode 2 from its first frame (its own setParams({azimuth}) + snap() is never
//   overwritten, even when it snaps before declaring itself); the mode label is kept.
//   WASD         moves along controlAzimuth, which chases the lens at basisRate
//                (0.87 rad/s, so the heading turns ≤ 0.9) while you hold a key
//                (a Q/E or a drag mid-walk bends your heading instead of jerking
//                it) and equals it when you stand
//   Q / E        rotate the world in eased 45° steps (E defers to "interact" when
//                something is in range, so it never fights the E key)
//   wheel        zoom, clamped; the further out you are the more the view tips down
//   drag         orbit: right or middle drag (input.js pointer.orbit: never uses the held item, no context
//                menu, no autoscroll); a left drag (pointer.down) and the touch thumb (touch.js writes
//                pointer.orbit) orbit too. Across = azimuth (0.006 rad/px), up/down = elevation (0.004 rad/px);
//                in mode 2 it turns the tether
//   L (hold)     LOOK UP — flattens to elevation 0.15, widens to fov 44 and
//                pitches the lens up while held, easing back on release
//   V (hold)     LOOK AROUND (CAMERA_SPEC §3) — held 0.18 s (or the mouse moves 6 px, or a
//                movement key goes down) the visitor stands still (input.moveLock) and the
//                view is yours: the mouse (no button) or any drag orbits a look yaw / pitch,
//                WASD pans the look point on a 40 u leash (10 u indoors; 14 u/s, Shift 26),
//                Q/E step it 45°, the wheel zooms ×0.7..1.6; +0.12 el, fov 40. Release
//                and it all eases home (λ8, yaw ≤ 2.5 rad/s); params.azimuth and
//                controlAzimuth are never touched, so WASD means what it meant. Space, C,
//                R, X, Enter, a left click, 1/2/3, E at something, a cinematic, snap(),
//                setFree(), a teleport, the pause, a lock (on foot), the ferry end it in 0.25 s.
//                On a vehicle / flying V only orbits (fov 48, no lock, no pan; the machine's own
//                keys — a flap, a stroke, a boost — do not end it; 1/2/3 and boarding / landing do).
//   V (tap)      RECENTRE behind the visitor: modes 1/3 snap to the 45° step nearest
//                facing + π; mode 2 swings the tether there (λ8, ≤ 3 rad/s)
//   lead         the aim point runs ahead of you, split in camera space (mode 1:
//                6.5 toward the lens, 3.5 away, 4.0 sideways; mode 2 and 3 have
//                their own, CAMERA_SPEC §2), ×1.2 at a run, × the zoom; near a path
//                it bends halfway toward the path 10 u ahead; it holds ~1 s after
//                you stop, and only 30% of a jump's rise reaches the frame
//   dead-zone    the target only chases the aim once it leaves a small ellipse
//                (0.7 as deep as it is wide), tighter the faster you go
//   reveal       stepping into a named landmark eases the lens out to ~40 for
//                2.5 s, so you see the whole silhouette of the thing you arrived at
//   density      (CAMERA_SPEC §4.5, camera/density.js) a 4 Hz sight fan over the collider circles
//                (r ≥ 0.75) behind him: in a thick prop band the lens tips up (+0.14·dK, mode 2
//                +0.20, × (1 − zoneK)) and back (×(1 + 0.10·dK), mode 2 0.08), ≤ 0.12 rad/s /
//                2.5 u/s; off in mode 3, owned, flying, under a shot, pinned
//   terrain      (§4.7) 8 ground samples lens → chest every frame: a rise in the sight line lifts
//                the lens (≤ 0.25 rad, λ3 up / λ1.5 down); the terrain lift, density's elevation
//                and the occlusion tilt share one ≤ 0.14 rad/s budget (A10)
//   whiskers     (§4.4) mode 2 only: blocked ≥ 2/5 for 0.35 s, the lens tries yaw offsets
//                {0, ±0.26, ±0.52} (three sight lines each against the local collider list) and
//                commits to a clearer side (≤ 0.5 rad/s); a manual orbit or tap V cancels it, a
//                straight walk does not. Mode 1 gets a hint instead: the chip pulses Q or E
//   pin          (§6.1) setParams({elevation | distance}) — a view's --el/--dist, an owner's
//                framing — holds density, whiskers and path alignment off until a teleport (or,
//                in live play, until he has walked 6 u); snap() and setFree(null) keep it
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
// basis() reads controlAzimuth, which never takes a shot's yaw, so WASD never
// flips under it.
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
// left is classified — THE LADDER AS A SENSOR (CAMERA_SPEC §5.2): the window
// below is the fix, and the lens only moves for what the window cannot open.
//
//   PATCHED — a hit on a mesh the window may cut (big masses, instanced clouds):
//              counted as blocked, opens the window, and is never faded or
//              tilted over. THE SPRING ARM (polish after the camera A/B): a
//              patched mass standing at the LENS — a surface on ≥ 2 body rays
//              with room for the lens in front of it, max(occDollyMin,
//              patchDollyFloor 0.55 × the mode's goal), 5.5 indoors — is dollied
//              past (patchDolly), not portholed: a window in a roof, a hill or a
//              wall that still fills 30-80% of the frame lost 11 of the 14 pairs
//              the critics gave the old camera. What stands nearer him than that
//              floor stays the window's.
//   0. CULL  — a mesh whose WORLD BOUNDING BOX contains the lens goes
//              visible = false for as long as that lasts. Gated to meshes under
//              occCullMax (18 u) across, because "the lens is inside my box" is
//              true of every island-scale merge all the time; without the gate
//              this rule deletes Candyland. Roofs are skipped — each
//              architecture system hides its own roof when you walk inside.
//   1. FADE  — an unpatched prop-sized mesh (world box under occFadeMaxDim)
//              dissolves to fadeOpacity over fadeTime. A big mass never ghosts:
//              the near-lens dither handles one right at the lens.
//   2. DOLLY — an UNPATCHED big mass (noCut / noFade / NEVER_FADE, a material
//              the patch may not touch) with room in front of it: pull the lens
//              to just inside the real hit point, never nearer than the floor,
//              max(occDollyMin 14, occDollyFloor 0.62 × the mode's goal)
//              outdoors, 5.5 inside a building.
//   3. TILT  — an unpatched mass too close to the player to get in front of.
//              Nothing publishes how tall it is, so the lift ESCALATES
//              occLiftStep per sweep while the body is still blocked, stops the
//              moment it clears, and unwinds once six sweeps run clean or the
//              visitor has walked 3 units away. Capped at occLiftMax (0.12),
//              eased at λ5 / λ2.5 and never faster than occLiftRate (0.14 rad/s);
//              it holds at the cap (no give-up) and the window / the silhouette
//              carry the rest.
//              Dolly and tilt run only while the window is shut (cutK < 0.5 and
//              not opening): once it carries the frame the lens releases to the
//              stop (λ3.5) and the tilt unwinds — except a dolly the sweep holds
//              in front of an UNPATCHED blocker, which the window cannot open
//              (a noCut wall behind a patched lollipop keeps its dolly while the
//              window opens on the lollipop), and the spring arm's (a patched
//              mass at the lens is dollied past, open window or not). The per-frame collider pass
//              (occlude(): a guess — colliders carry no mesh and mostly no
//              height) tilts ≤ colLiftMax (0.06) and dollies only alongside a
//              dolly / tilt the sweep is already running; mostly it opens the
//              window (the collider trigger, §5.1 (b)). SHELLS — big
//              userData.noFade masses (enterable buildings, the whale) the
//              sweep never fades or cuts — get rule 2 on their real triangles
//              only: a dolly to just in front of one when there is room.
//   5. INSTANCED — an InstancedMesh is never raycast (2000 instances), but its
//              instances ARE tested as spheres against the sight line, through
//              ONE round-robin cursor over (cloud, instance) so every instance
//              is eventually tested. A patched cloud's instance opens the window
//              (confirmed on its own triangles); an unpatched one dollies /
//              tilts harder (occInstStep) than a solid mesh.
//   6. PLINTH — a mass named like ground/masonry, or simply bigger than a
//              building, hit within occPlinthNear of the lens: patched, it grows
//              the window; unpatched, the tilt cap rises to occLiftPlinth (0.20)
//              and the dolly is forced to its floor.
//   ?cut=0 / params.cut = 0 is the fallback: the old ladder (the district fade
//              within occNearLens of the lens, and a GIVE-UP — a tilt at its cap
//              that still leaves him hidden relaxes to half the cap and the
//              blocker ghosts if it is a building, occFadeLastDim), same floor.
//   THE SEE-THROUGH WINDOW (camera/cutout.js, CAMERA_SPEC §5.1): big masses and
//              instanced clouds carry a shader patch; while a patched mass IN FRONT
//              OF THE LENS blocks one of his three axial body rays (hat, chest,
//              knees — not the offset rays beside him; an instance only when its
//              own triangles are hit, not just its sphere), or a wall/trunk
//              collider sits in the sight line between the lens and him two frames
//              running (a blocker the dolly already stands in front of does not
//              count), a dithered, feathered, rim-darkened ellipse around him
//              discards whatever stands IN FRONT of him, so his real body shows
//              through; its feather is a thin dithered lip (cutFeatherPx), not a ring of
//              dots. The NEAR-LENS CLIP discards patched geometry nearer the lens than
//              0.88 × clamp(nearDepthK 0.36 × lens distance, nearMin 2, nearMax 10) outright,
//              with a thin dithered lip beyond (a pavilion roof beside the lens, a rafter at it).
//              Free cameras and ?cut=0 / params.cut = 0 turn both off.
//   AND THE BACKSTOP: none of this can be relied on, so the VISITOR IS DRAWN
//   TWICE — see player/visitor.js. The second pass is a flat AMBER silhouette
//   (0xffab45 at 76%, unlit, no fog), depthFunc GreaterDepth, so it appears only
//   where something is in front of him. Where the window discards a blocker it
//   writes no depth, so his real body shows there and the amber pass draws
//   nothing. Amber-only is left for the §5.3 cases: terrain, a noCut landmark or
//   an unpatched mass, a blocker within 1 u in front of him, the feather band.
//   The camera may lose the argument with the geometry; the player never vanishes.
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
//   first, and resumes where it stopped. Those tests are COUNTED as before (the
//   budget decides which candidates a sweep reads, so what it finds is unchanged),
//   but they are ANSWERED by camera/bvh.js: a static tree per merged geometry,
//   bit-identical hits to three's Mesh.raycast in tens of microseconds a ray
//   instead of ~4.6 ms for one ray through the 50k-triangle Heights (Contract J:
//   sweep frames 8-14 ms → ≤ 1 ms on the M1 Pro, CAMERA_SPEC A13). The trees are
//   built while the world loads (world:ready) and, for meshes that come later, in
//   update()'s spare time; a mesh without one is raycast by three meanwhile.
//
// Public API (other systems + tools/render.mjs depend on these):
//   params {azimuth, elevation, distance, fov, minDist, maxDist,
//           leadSide, leadToward, leadAway, leadRun, lead2Away, lead2Side,
//           lead2Toward, lead3, deadZone, deadZoneDepth, hopK,
//           lookAhead (deprecated alias of leadAway),
//           fadeOpacity, fadeProbe, fadeRefresh, fadeMaxRadius, fadeHardMax,
//           fadeTime, fadeBack, occRadius, occHead, occSweep, occNearLens,
//           occFadeMaxDim, occFadeLastDim, occCullMax, occDollyFloor, occDollyMin, patchDollyFloor,
//           occLiftStep, occLiftMax, occLiftRate, occBudget, colLiftMax,
//           occInstMin, occInstK, occInstBudget, occInstStep, occInstFloor,
//           occPlinthNear, occLiftPlinth, zoneElev, zoneRise, zoneLambda,
//           revealDist, revealHold,
//           lookElev, lookFov, lookPitch, moonElev, moonDist, moonFov,
//           moonFovMax, moonDur, moonHold,
//           m2ElevOff, m2DistK, m2Fov, m2Pitch, m2PitchCap, m2SkyMin,
//           pathAlign, pathDelay, pathRate,
//           basisRate, flyDist, flyElev, flyFov, fovRate,
//           cut, cutRy, cutRx, cutGrow, cutHold, cutRise, cutFall, cutFeatherPx, nearDepthK, nearMin, nearMax,
//           lookHold, lookTapPx, lookYawK, lookElK, lookPan, lookPanRun, lookLeash,
//           lookLeashIn, lookTaper, lookElevLook, lookFovLook, lookFovVeh, lookIn,
//           lookOut, lookReturnRate, lookEndT, lookZoomMin, lookZoomMax, recentreRate,
//           densityElev1, densityElev2, densityDist1, densityDist2, densityRate, terrainLiftMax,
//           whiskerSteps, whiskerRate, whiskerMax, whiskerHold, whiskerGap}
//           (followLambda / followRecentre are gone: the mode-2 tether has no
//           timed recentre, CAMERA_SPEC §2; the V look's framing lift is lookElevLook,
//           not the spec's `lookElev`, which is hold-L's 0.15 and stays so)
//   basis() · snap() · setFree(v|null) · setParams(p) · isFree() · update(dt, ctx)
//           snap(): one call, deterministic — lead 0, look off (moveLock cleared), controlAzimuth =
//           the view, the tether behind the facing, density / terrain lift / cutK settled, the
//           mode's fov and pitch, matrixWorld and the window's uniforms written. setParams with
//           elevation or distance PINS (§6.1); snap() and setFree(null) keep the pin, a teleport
//           clears it. setFree(null) restores the MODE's fov (not p.fov).
//   look({on, yaw, pitch, pan:[dx, dz], zoom}) — the V look as a deterministic hook: sets the
//           look at full strength (yaw / pitch rad, pitch = the look's own elevation offset;
//           pan [dx, dz] = right / forward in the look basis, as WASD pans, leashed; zoom =
//           distance ×0.7..1.6) and holds it until look({on:false}), which eases home as a V
//           release does
//   recentre() — tap V · looking (0..1) · lookYaw · lookVehicle · lookState (QA) · playerScreen {x, y, on}
//           (his feet in CSS px of the canvas after the final pitch; on = in front of the lens
//           and inside the frame)
//   mode · setMode(1|2|3) (toasts MODE_TOAST) · reveal(seconds?) · revealing
//   shake(intensity, duration) · cinematic({target, azimuth, elevation, distance, fov, pitch, noTilt,
//           duration, in, hold, out}) → Promise with .cancel() (target: [x,y,z] | Vector3 | {x,y,z} |
//           () => any of those) · cinematicActive
//   moonMoment() → Promise|null (forces the night sky moment) · moonMomentDone · lookingUp (0..1)
//   events: 'camera:mode' n · 'camera:look' {on} · 'camera:hint' hint · 'camera:moon' {azimuth,
//           elevation, fov} · 'camera:update' cam — LAST in update(), after the final rotateX and
//           cam.updateMatrixWorld(true), so a listener reads this frame's pose, pitch included
//           (citizens.js's scruff carry relies on it)
//   introspection: fading · fadedList · culled · culledList · culledSizes · occDist · occLift ·
//                  dollyFloor · indoors · ladderHeld (the window carries the frame: no dolly/tilt) ·
//                  patchDolly (the spring arm's dolly for a patched mass at the lens, Infinity = off) ·
//                  occBlocked · occMs · sweepsDone (timed sweeps so far: a frame that raised it
//                  swept, A13) · blockerCount · sweepCount · accel (camera/bvh.js: stats(), ready(o))
//                  · current · target
//                  controlAzimuth (the movement basis) · tilt (tiltFor(baseDistance))
//                  · baseDistance · goalDistance · lead {x, z} (the aim's lead, §4.1)
//                  occYaw (the mode-2 whisker yaw) · densityK · terrainLift · pinned
//                  · hint {key 'Q'|'E'|null, t, seq} (mode 1's keycap hint; emits 'camera:hint')
//                  · densityState · whiskerState (QA, allocate) · density (the collider sensors:
//                    top(c), the local list, the fan — camera/density.js)
//                  · camMs {n, mean, p95, max, sweepP95, nonSweepP95, sweeps} — wall-clock ms of
//                    update() over the last 600 calls, sweep frames apart (§6.4, A13; QA only:
//                    allocates, and nothing in the camera reads it)
//                  occDebug({fromStop}?) — one unbudgeted sweep, reported not applied
//                    (fromStop: cast from the last sweep's undollied stop, as update() does)
//                  bodyVisibility() — five rays, whole scene (instances too),
//                    { visible, rawVisible, featherVisible, total, rays } — the QA
//                    number for "can you see him in this frame" (cut-aware, §5.4);
//                    a ray left shut carries cutWhy / excused (the §5.3 amber cases)
//                  cutK (the window, 0..1) · cutState (…, by / plainBy: what the
//                  window's reading holds) · cutout {isPatched, uniforms, stats, why}
//                  · isPatched(o)
import * as THREE from 'three';
import { damp, clamp, lerp, smoothstep } from '../core/util.js';
import { createCutout } from './camera/cutout.js';
import { createDensity, LOCAL_EVERY } from './camera/density.js';
import { createRayAccel } from './camera/bvh.js';
import { hypot2, hypot3 } from './camera/hypot.js';

const STEP = Math.PI / 4;
// The window reads the sweep's three AXIAL rays only (hat, chest, knees: bits 0-2). The two offset rays sit
// 0.66 u beside the body axis — just outside his silhouette (≈0.6 u at its widest) — so a lamp they graze
// stands BESIDE him, not in front of him, and must not open the window (A15). The ladder still reads all five.
const WIN_RAYS = 3;
const WIN_MASK = (1 << WIN_RAYS) - 1;
// cutHits carries this bit beside a mesh's window rays: a PATCHED plinth right at the lens (§5.2 rule 6: grow)
const PLINTH_BIT = 1 << 8;
// triangle tests per sweep for confirming instance-sphere hits on the instance's own geometry (window only)
const INST_CONFIRM_BUDGET = 12000;
// the see-through window's ellipse bounds (px at pixel ratio 1, CAMERA_SPEC §5.1)
const CUT_RMIN = 64, CUT_RMAX = 320;
// the dolly's floor inside a building (CAMERA_SPEC §5.2; outdoors it is max(occDollyMin, occDollyFloor × goal))
const INDOOR_FLOOR = 5.5;
// the spring arm for patched masses at the lens holds its dolly this many sweeps after its last reading
const PATCH_HOLD = 3;
// …and a mass already holding it keeps it with this much less room (u): hysteresis on the floor test
const PATCH_SLACK = 1.0;
// the sweep's five rays fan out from the stop to within this of the head → knees segment pair (the offset rays
// sit 0.66 u beside the body): the AABB broad phase pads each mesh's world box by it
const BUNDLE_PAD = 0.8;
// the lens is this much nearer than the sweep's stop (u): the window's reading is confirmed from the real lens
const WIN_CONFIRM_BACK = 0.5;
// ms a non-sweep frame may spend building the sweep's triangle trees (camera/bvh.js; A13 non-sweep p95 ≤ 1.5 ms)
const BUILD_MS = 0.6;
// …and world:ready may spend this long building them all before the first frame (loading, not play)
const PREBUILD_MS = 600;
const ease = (t) => t * t * (3 - 2 * t);
const MODE_TOAST = { 1: 'Camera: iso — you turn it (Q/E)', 2: 'Camera: follow — turns with you', 3: 'Camera: top — lay of the land' };
const OVERHEAD_EL = 1.10;     // mode 3 pitch
const OVERHEAD_K = 1.40;      // mode 3 distance multiplier
// mode 2 FOLLOW (CAMERA_SPEC §2, §4.2, §4.8)
const M2_MIN_EL = 0.40;       // the follow lens never goes flatter than this (town cores sit on it)
const TETHER_RATE = 0.6;      // rad/s: the geometric swing of the tether, capped
const AUTO_YAW = 1.1;         // rad/s: every automatic yaw together (swing + alignment)
const ORBIT_WAIT = 1.2;       // s: path alignment waits this long after a manual orbit
const ALIGN_RAMP = 0.6;       // s: path alignment ramps in over this
const ALIGN_L = 1.4;          // path alignment damping λ
const FLY_L = 1.2, FLY_RATE = 0.9;   // flying: the tether swings behind the heading at λ1.2, ≤ 0.9 rad/s
const FLY_FOV_L = 6;          // flying: take-off FOV ease, uncapped (flyer.js cameraCheck() wants ≥ 33 by 0.6 s)
// the aim point's lead (CAMERA_SPEC §4.1, §4.8)
const LEAD_GROW = 1.6, LEAD_DECAY = 0.9, LEAD_FLIP = 1.1;   // λ growing / decaying to zero / on a reversal
const LEAD_RATE = 8;          // u/s cap on the lead's motion
const PATH_AHEAD = 10;        // path anticipation looks this far along the path
const HOP_DROP_MAX = 3.5;     // hop damping never holds the aim more than this under the body (a long fall is followed)
// the night sky moment's framing budget, in radians of the vertical frame
const MOON_R = 0.067;         // angular RADIUS of the sky's moon disc at 780 units
const MOON_TOP = 0.045;       // …plus this much clear sky above it
const MOON_SEA = 0.055;       // …and this much sea/skyline under the horizon line
const MOON_BODY = 0.07;       // …and this much frame under the visitor, so he is IN the shot
const MOON_WINDOW = [21, 23.5];   // once a night, inside this hour window
// the V look (CAMERA_SPEC §3)
const LOOK_EL_MIN = 0.26, LOOK_EL_MAX = 1.25;   // the look's final elevation stays inside this
const LOOK_ON = Object.freeze({ on: true }), LOOK_OFF = Object.freeze({ on: false });   // 'camera:look' payloads (no allocation)
// keys that end a look at once (0.25 s ease) and then act as usual; E only with something in reach
const LOOK_END_KEYS = ['Space', 'KeyC', 'KeyR', 'KeyX', 'Enter', 'NumpadEnter', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'];
// …on a vehicle / flying only the mode keys: the look locks nothing there, so the machine's own keys (the
// flyer's Space flap and X boost, the canoe's Space stroke) already act as usual and must not end it
const LOOK_END_KEYS_VEH = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'];
// a movement key going down while V is still pending means "pan": the look starts at once
const LOOK_MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
// DENSITY / WHISKERS / TERRAIN (CAMERA_SPEC §4.4-4.8)
const DENS_EVERY = 0.25;      // s: the density sight fan runs at 4 Hz
const DENS_HOLD = 0.12;       // the held density goal moves only when the fan's reading differs by more than this
const DENS_EL_RATE = 0.12;    // rad/s: density's elevation response, capped (§4.8)
const DENS_DIST_RATE = 2.5;   // u/s: …and its distance response
const PIN_WALK = 6;           // u: in live play a pin (setParams el/dist) lets go once he is this far from where it was set
const WHISK_BLOCK = 0.35;     // s: the sweep's raw count ≥ 2/5 this long arms the whiskers (§4.4)
const WHISK_MANUAL = 2.5;     // s: …and never within this of a manual camera input
const WHISK_CLEAR = 1.5;      // s: candidate 0 clear this long unwinds the offset (λ0.8)
const WHISK_BEAT = 0.25;      // a candidate must beat the current one by this…
const TERRAIN_N = 8;          // world.height samples along lens → chest, every frame (§4.7)
const TERRAIN_M = 0.3;        // u: …the sight line keeps this clear of the ground
const HINT_BLOCK = 2, HINT_SHOW = 2, HINT_GAP = 60;   // mode 1's Q/E hint (§4.4): blocked ≥ 3/5 this long, pulse, once per
const CAM_MS_N = 600;         // camMs (§6.4, A13): update() calls in the rolling cost window

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
    minDist: 12, maxDist: 88, deadZone: 0.85,
    // LEAD (§2 lead row, §4.1): the aim runs ahead of the visitor, split in camera
    // space: toward the lens is the largest because at 0.64 the frame shows ~10 u of
    // ground on the lens side against ~22 u away. BASE values, × frameScale (the
    // zoom) × leadRun at a run; mode 2 (lead2*) and mode 3 (lead3) have their own.
    leadSide: 4.0, leadToward: 6.5, leadAway: 3.5, leadRun: 1.2,
    lead2Away: 3.0, lead2Side: 2.0, lead2Toward: 5.0, lead3: 3.5,
    deadZoneDepth: 0.7,       // the dead zone is an ellipse: this × the lateral half-width in depth
    hopK: 0.3,                // share of a jump's rise that reaches the aim point
    minElev: 0.26, maxElev: 1.12, tiltOut: 0.12, tiltIn: 0.24,
    // occLiftMax: the sweep's tilt cap (CAMERA_SPEC §5.2: 0.12, was 0.30 — the window carries the frame now)
    fadeOpacity: 0.15, fadeProbe: 0.55, fadeRefresh: 0.25, occLiftMax: 0.12,
    fadeTime: 0.12, fadeBack: 0.26,           // dissolve / restore, seconds
    // per-frame bounding-sphere fade: prop-sized separate meshes only (moving
    // cats, doors, signs). fadeHardMax caps even a userData.fade opt-in, so
    // nobody can dissolve a district through this path by accident.
    fadeMaxRadius: 5, fadeHardMax: 16,
    // the capsule sweep (see the header)
    occRadius: 1.2,           // capsule radius around the sight line
    occHead: 1.6,             // the sweep aims at position.y + this
    occSweep: 1 / 6,          // seconds between geometry sweeps (6 Hz)
    occNearLens: 6,           // (p.cut 0 fallback only) a big merged mesh hit this close to the lens may fade
    occFadeMaxDim: 12,        // "prop-sized": world bounding box, largest side
    occCullMax: 18,           // only a mesh this small may be culled for holding the lens
    occDollyFloor: 0.62,      // dolly never closer than this fraction of the mode's distance goal…
    occDollyMin: 14,          // …nor than this, outdoors (indoors the floor is INDOOR_FLOOR, 5.5) — §5.2
    // the spring arm for a PATCHED mass at the lens (see patchDolly): its own floor share, a little under the
    // unpatched dolly's (mode 1: 17 u, not 19.2 — a gazebo roof 18 u off him is at the lens there); ≥ occDollyMin
    patchDollyFloor: 0.55,
    occLiftStep: 0.07,        // the tilt escalates this much per blocked sweep
    occBudget: 40000,         // ray-triangle tests per sweep (merged meshes are huge)
    colLiftMax: 0.06,         // the COLLIDER tilt is a guess at heights: keep it at 3.4°
    occLiftRate: 0.14,        // rad/s: the occlusion tilt's rate cap (A10: automatic elevation ≤ 0.15 rad/s, with a margin)
    occFadeLastDim: 45,       // (p.cut 0 fallback only) last-resort ghost: a building may, a district may not
    // INSTANCED BLOCKERS (palm fronds, gummy trees). The sweep cannot raycast a
    // 2000-instance cloud, so it tests instance BOUNDING SPHERES against the
    // sight line, nearest first, inside a per-sweep budget.
    occInstMin: 0.75,         // ignore instances smaller than this (grass, petals)
    occInstK: 0.70,           // instance spheres are loose around fronds: shrink them
    occInstBudget: 2500,      // instance sphere tests per sweep
    occInstStep: 1.7,         // an UNPATCHED instanced hit escalates the tilt this much harder…
    occInstFloor: 0.62,       // …but obeys the same dolly floor as everything else (× goal, ≥ occDollyMin)
    // PLINTH / TERRAIN MASSES within occPlinthNear of the lens: a patched one only grows the window
    // (§5.2 rule 6); an unpatched one lets the tilt run to occLiftPlinth (0.20) and forces the dolly
    // to its floor.
    occPlinthNear: 8, occLiftPlinth: 0.20,
    // a hit this close to the ground is a kerb, a flowerbed rim or a district's
    // own pavement — the sight line grazes one of those in every frame there is
    occGroundMin: 1.2,
    // ZONE PITCH. Inside a town core the authored 0.64 rad fills half the frame
    // with roof tiles; easing to 0.50 rad and aiming a metre higher gives the
    // facades two thirds of the frame and puts a horizon back in the shot.
    zoneElev: 0.50, zoneRise: 1.0, zoneLambda: 2.2,
    // MODE 2 FOLLOW: mode 1's framing bent down (−0.18, floor 0.40) and in (×0.72),
    // a wider lens (42°, the visitor stays the same size) and an authored pitch
    // (lookAt() alone puts the top frame edge 5° under the horizon at fov 42).
    // m2Pitch 0.15, not the spec's 0.12: at el 0.46 / fov 42, 0.12 leaves the top
    // edge +0.0265 rad over the horizon = a 3.9% band, under A15's 4%; 0.15 gives
    // +0.0565 rad = 8.3% (16% in town cores at el 0.40), body ≈ 20% under centre.
    m2ElevOff: -0.18, m2DistK: 0.72, m2Fov: 42, m2Pitch: 0.15,
    // …and the ladder's occlusion lift, which steepens the lens to see over a blocker,
    // tips the horizon down with it: once the band would drop under m2SkyMin of the frame
    // height (A15's 4% + a margin), the pitch rises by what it takes to hold it, up to
    // m2PitchCap × the half-FOV (0.213 rad at fov 42, feet ≈ 88% down the frame), and the
    // lift stops there (0.089 rad at el 0.46, 0.149 in town cores). m2SkyMin 0 = off.
    m2PitchCap: 0.58, m2SkyMin: 0.045,
    // path alignment: 0.5 s of pure W on a path bends the tether 70% toward the
    // path's tangent, at ≤ pathRate rad/s
    pathAlign: 0.7, pathDelay: 0.5, pathRate: 1.1,
    // controlAzimuth chases the lens at this, rad/s. The spec's 0.9 is the limit on
    // the HEADING (A5); the visitor's own velocity lag shrinks as he speeds up out
    // of a slope, which turns 0.9 of basis into 0.912 of heading on the A5 route —
    // so the basis runs just under it (§10 allows 0.7-1.2).
    basisRate: 0.87,
    flyDist: 44, flyElev: 0.38, flyFov: 40,   // Contract E: the framing while ctx.state.flying
    fovRate: 12,                              // °/s cap on the per-mode FOV ease
    revealDist: 44, revealHold: 2.5,          // landmark reveal
    // hold L: look up. The elevation alone only flattens the view — the pitch
    // is what puts sky on the screen, because lookAt() always centres the body.
    lookElev: 0.15, lookFov: 44, lookPitch: 0.30,
    // the night sky moment. moonFov is the authored lens; a high moon widens it
    // (never past moonFovMax) rather than being cropped off the top of frame.
    moonElev: 0.12, moonDist: 26, moonFov: 44, moonFovMax: 58,
    moonDur: 5, moonHold: 2.5,
    // THE SEE-THROUGH WINDOW (CAMERA_SPEC §5.1, camera/cutout.js). cut 0 (or ?cut=0) = off.
    // Ellipse: ry = clamp(cutRy × the body's projected height, 64, 320 px)·grow, rx = cutRx·ry; grow eases
    // to cutGrow while ≥ 2 body rays are blocked by patched masses. It opens at λ cutRise when a body ray
    // is blocked by a patched mass (or a wall/trunk collider sits in the sight line two frames running),
    // stays open cutHold s after the last need, then closes at λ cutFall. Its feather is a thin dithered lip,
    // cutFeatherPx px wide (a 30 px ring of Bayer dots read as a fault, not a window). The near-lens clip runs
    // clamp(nearDepthK × lens distance, nearMin, nearMax) deep: patched geometry nearer than 0.88 of that is
    // discarded outright, a dithered lip beyond (the spec's 0.2 / 2..6 dither band, dithered all the way, left a
    // roof at 6-9 u from the lens as screen-door soup over half the frame — A15's "no near-lens object > 15%").
    cut: ctx.params?.get?.('cut') === '0' ? 0 : 1,
    cutRy: 1.25, cutRx: 0.8, cutGrow: 1.4, cutHold: 0.6, cutRise: 12, cutFall: 3, cutFeatherPx: 9,
    nearDepthK: 0.36, nearMin: 2, nearMax: 10,
    // V LOOK-AROUND (CAMERA_SPEC §3, §6.1). Held lookHold s — or lookTapPx of mouse motion, or a
    // movement key — it is a look; shorter and stiller it is a tap (recentre). Mouse: yaw −= dx·lookYawK,
    // el += dy·lookElK. WASD pans the look point lookPan u/s (lookPanRun with Shift), accel λ8, on a
    // lookLeash leash (lookLeashIn indoors) that tapers over its last lookTaper u. Framing: el +
    // lookElevLook, fov lookFovLook (lookFovVeh on a vehicle / flying), in at λ lookIn; release eases
    // home at λ lookOut, the yaw at ≤ lookReturnRate rad/s; a key / event that ends it takes lookEndT s.
    // The wheel zooms ×lookZoomMin..lookZoomMax. Tap V in mode 2 swings the tether at ≤ recentreRate rad/s.
    lookHold: 0.18, lookTapPx: 6, lookYawK: 0.0055, lookElK: 0.0035, lookPan: 14, lookPanRun: 26,
    lookLeash: 40, lookLeashIn: 10, lookTaper: 8, lookElevLook: 0.12, lookFovLook: 40, lookFovVeh: 48,
    lookIn: 9, lookOut: 8, lookReturnRate: 2.5, lookEndT: 0.25, lookZoomMin: 0.7, lookZoomMax: 1.6,
    recentreRate: 3,
    // DENSITY (§4.5, §2 density row): a sight fan over the collider circles tips the lens up and back in
    // thick prop bands — el +densityElev·dK·(1 − zoneK), distance ×(1 + densityDist·dK) (1: modes 1, 2: mode 2
    // proper; off in mode 3), dK damped at λ densityRate
    densityElev1: 0.14, densityElev2: 0.20, densityDist1: 0.10, densityDist2: 0.08, densityRate: 0.8,
    // TERRAIN WHISKER (§4.7): the extra elevation that clears a rise between the lens and him, capped
    terrainLiftMax: 0.25,
    // CLEAR-SIDE WHISKERS (§4.4), mode 2 only: candidate yaw offsets {0, ±steps}, eased at λ1.5 ≤ whiskerRate,
    // |offset| ≤ whiskerMax; a switch needs a better candidate for whiskerHold s and whiskerGap s since the last
    whiskerSteps: [0.26, 0.52], whiskerRate: 0.5, whiskerMax: 0.52, whiskerHold: 0.8, whiskerGap: 2.0,
  };
  // lookAhead is gone (§6.1): kept as a deprecated alias of leadAway
  Object.defineProperty(p, 'lookAhead', { enumerable: false, configurable: true, get: () => p.leadAway, set: (v) => { p.leadAway = v; } });
  const DIST_REF = 31;        // the framing the look-ahead / dead-zone were tuned at
  const target = new THREE.Vector3();
  const cur = { azimuth: p.azimuth, elevation: p.elevation, distance: p.distance };
  let free = null;
  let mode = 1;
  // MODE 2 TETHER (§4.2): a ground anchor A the lens hangs over, kept at Rh =
  // goalDist·cos(goalElev) from the visitor. The lens bearing IS the bearing of A.
  const anchor = { x: 0, z: 0, ok: false };      // ok = false: re-seed from cur.azimuth
  let turnTotal = 0, turnDone = 1, turnT = 1;    // Q/E: eased rotation of A (azDur)
  let orbitNow = 0;                              // drag rotation of A waiting for this frame
  let manualT = 99;                              // seconds since the last manual orbit (drag, Q/E)
  let fwdT = 0, alignK = 0;                      // path alignment: pure-W-on-a-path timer, ramp 0..1
  // pathAt()'s answer (no allocation): the tangent signed along travel (yaw) and, for the lead's
  // path anticipation, the direction from the visitor to the path point PATH_AHEAD u further on (ax, az)
  const pathHit = { on: false, yaw: 0, ax: 0, az: 0 };
  // LEAD (§4.1): the aim's offset ahead of the visitor (world xz), damped toward this frame's goal
  const lead = { x: 0, z: 0 };
  let hopRef = NaN;                              // feet y at the last grounded frame (hop damping)
  const giOut = { h: 0 };                        // groundInfo(x, z, out) scratch
  const axNow = { x: 0, y: 0, active: false };   // this frame's movement input (keys, else the stick)
  // MOVEMENT BASIS (§4.3): WASD reads ctrlAz, which chases the lens at basisRate
  // while a movement key is held and equals it when idle.
  let ctrlAz = p.azimuth;
  let occYaw = 0;                                // clear-side whisker yaw (§4.4): mode 2 proper only, else 0
  let modeFov = p.fov, pitchBase = 0;            // eased per-mode FOV (§2) and pitch (m2Pitch)
  let tiltNow = 0, baseDistNow = p.distance;     // tiltFor(baseDist) as last applied
  // ownership / flight / indoors flags, refreshed by status() (update, snap, setMode, setFree, setParams)
  let ownNow = false, flyNow = false, wasOwned = false, wasFlying = false, inNow = false;
  let lastPAz = p.azimuth;                       // p.azimuth as update() last left it (snap() never refreshes it)
  // Owner hand-off (§2 owned(), §7 "cave corridor azimuth not re-triggered by mode 2"). An owner's
  // transition is setParams({azimuth}) → snap() → declare itself (cave.js caveCam → snap → placeOverride),
  // so the snap runs one step too early, unowned, and in mode 2 it frames the follow lens. These two flags
  // let the next update() see what happened since the last one: azExt = somebody called
  // setParams({azimuth}); snapFresh = somebody called snap(). Both are cleared by update() right after
  // its ownership-start check.
  let azExt = false, snapFresh = false;
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
  let liftCap = p.occLiftMax;   // …which is taller when an UNPATCHED plinth is under the lens
  let giveUp = false;        // (p.cut 0 fallback only) the tilt was tried here and did not clear him
  const giveUpAt = new THREE.Vector3(NaN, 0, 0);
  // the instanced pass's round-robin cursor over (cloud, instance) (§5.2 rule 5: every instance is
  // eventually tested) and the window's instance bits, sticky over one full cycle of that cursor
  let instC = 0, instJ = 0, instAccCut = 0, instAccPlain = 0, instPrevCut = 0, instPrevPlain = 0;
  let cutPlinth = false;     // a PATCHED plinth right at the lens: the window grows (§5.2 rule 6)
  let winCarry = false;      // the window carries the frame this frame: the ladder holds still (§5.2)
  let sweepT = 0, occMs = 0;
  // the sweep's triangle accelerator (camera/bvh.js, Contract J / A13): a static tree per merged geometry, the
  // same hits as three's Mesh.raycast bit for bit; trees are queued by refreshCandidates() and built in update()'s
  // spare time, and a mesh without one yet is raycast by three exactly as before (cost, never the answer)
  const accel = createRayAccel({ minTris: 256 });
  // the see-through window's drive (§5.1): cutK eases toward 1 while cutNeed, holds cutHold s,
  // then closes; cutEff is what the shader and the QA see (× (1 − holdAng), 0 off screen / free)
  let cutKraw = 0, cutEff = 0, cutHoldT = 0, cutGrowK = 1, cutOnScr = true;
  let cutNeedA = false;         // (a) the sweep: a body ray blocked by a PATCHED mesh / instance cloud
  let cutRays = 0;              // how many body rays patched masses block (drives the grow)
  let cutAllPlain = false;      // every blocker the sweep sees is unpatched (gates the collider trigger)
  let colRun = 0;               // (b) consecutive frames occlude() found a wall/trunk collider in the sight line
  let colSweeps = 0;            // …and how many sweeps have run since it began
  let cutSweepClear = true;     // the last sweep saw no blocker at all on any body ray
  const cutO = { ry: 1.25, rx: 0.8, rMin: CUT_RMIN, rMax: CUT_RMAX, featherPx: 9, nearDepthK: 0.36, nearMin: 2, nearMax: 10 };
  let cine = null;
  let lookK = 0;                // hold-L look-up, eased 0..1
  // ── V LOOK (§3) ── vWas / downWas: V and the left button last frame (edges); vPend: V is down, not yet a
  // tap or a look (vT s, vMove px of motion, vPanned a movement key went down); lookOn: the look owns the
  // mouse, Q/E, the wheel and WASD (lookHook: set by look(o), held until look({on:false}); lookVeh: the
  // vehicle / flying variant); lookLive: some look offset is still non-zero (on, or easing home).
  let vWas = false, downWas = false, vPend = false, vT = 0, vMove = 0, vPanned = false;
  let lookOn = false, lookHook = false, lookVeh = false, lookLive = false;
  let vLookK = 0, lookYaw = 0, lookEl = 0, lookZoom = 0;        // strength 0..1, yaw / el (rad), zoom (log of ×)
  let lookZoomGoal = 0;         // where the wheel has put the zoom (log of ×); lookZoom follows it at λ lookIn
  let panX = 0, panZ = 0, panVX = 0, panVZ = 0, lookGY = NaN;  // the look point's offset (world xz), its velocity, ground y
  let lookTurnTotal = 0, lookTurnDone = 1, lookTurnT = 1;       // Q/E while looking: eased 45° steps of lookYaw
  let lookEndK = 1;                                              // 0→1 over lookEndT: a look ended by a key / event
  const lookEnd0 = { k: 0, yaw: 0, el: 0, zoom: 0, x: 0, z: 0 };
  let recOn = false;            // tap V in mode 2: the tether swings behind the facing (§3)
  // the ladder's latches, held still while looking (the look lens is not the framing the ladder serves)
  const ladKeep = { sweepLift: 0, sweepDolly: Infinity, lastDolly: Infinity, clearRun: 0, liftMaxRun: 0, giveUp: false, liftCap: 0, shellBy: null, shellDolly: Infinity, patchDolly: Infinity, patchHold: 0 };
  const ladAnchor = new THREE.Vector3(), ladGiveUpAt = new THREE.Vector3();
  // …and the lens distance while held: occDist rides the look's own distance (its zoom and its λ lookOut
  // return, 1:1) times ladHoldR, the share a dolly still held back as the look began, released at the dolly's
  // λ3.5 while the look is on (so a look that starts on a dollied lens does not pop out) and brought home WITH
  // the look's offsets on the way back: ladHoldR = ladBackG + (ladRelR − ladBackG)·(vLookK / ladRelK), where
  // ladRelR / ladRelK are the share and the look's strength at the release and ladBackG is the dolly goal of
  // the framing the look returns to (as a share of it, smoothed at the dolly's own λ16 in / λ3.5 out) — so the
  // lens is back on the dolly exactly as the look ends, never undollied until then and popped in after;
  // ladHeld: the ladder was held last frame
  let ladHoldR = 1, ladHeld = false, ladRelR = 1, ladRelK = 1, ladBackG = NaN;
  // …and the window's reading as the look began: he stands still while looking, so at the release it is the
  // right reading for the framing the look returns to (the look lens's own sweeps replaced it meanwhile)
  const winKeepCut = new Map(), winKeepPlain = new Map();
  const winKeep = { ok: false, instC: 0, instJ: 0, accC: 0, accP: 0, prevC: 0, prevP: 0 };
  const keepCutCb = (v, o) => { winKeepCut.set(o, v); }, keepPlainCb = (v, o) => { winKeepPlain.set(o, v); };
  const backCutCb = (v, o) => { cutHits.set(o, v); }, backPlainCb = (v, o) => { plainHits.set(o, v); };
  // his feet on screen (playerScreen, §6.4): CSS px of the canvas, after the final pitch
  const pScr = { x: 0, y: 0, on: false };
  const scrV = new THREE.Vector3(), scrSize = new THREE.Vector2();
  let moonDone = false;         // the night sky moment already ran this night
  let moonTick = 0.6;           // seconds until the next cheap window check
  let moonToastT = -1, moonToastText = '';
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), cineTgt = new THREE.Vector3();
  // ── THE COLLIDER SENSORS (§4.4-4.7; camera/density.js): the local list, top(c), the density fan ──
  const dens = createDensity(ctx);
  let localT = 0;               // s until the next local-list refresh (LOCAL_EVERY; snap() refreshes at once)
  // THE PIN (§6.1): a setParams carrying elevation or distance (a view's --el/--dist, an owner's framing) mutes
  // density, the whiskers and path alignment. It survives snap() and setFree(null); the 'player:teleport' event
  // clears it, and so does walking PIN_WALK u from where it was set — in live play only, never under ctx.shot.
  let pinned = false, pinX = NaN, pinZ = NaN;
  // DENSITY (§4.5): dK the reading (damped λ densityRate toward the held goal dKheld, which the 4 Hz fan moves
  // only by more than DENS_HOLD); densEl / densDist its applied responses (rad / u), rate-capped (§4.8)
  let dK = 0, dKheld = 0, densT = 0, densOcc = 0, densEl = 0, densDist = 0;
  // TERRAIN WHISKER (§4.7): the applied lift and this frame's goal
  let terrainLift = 0, terrainGoal = 0;
  let elBasePrev = NaN;         // last frame's base elevation (cur.elevation + tilt + breathing): A10's net budget
  const terrV = new THREE.Vector3();
  // CLEAR-SIDE WHISKERS (§4.4): candidate offsets [0, +s0, −s0, +s1, −s1] about the tether yaw, each one's last
  // clear share (3 sight lines against the local list; NaN = not yet read), evaluated one per frame round robin
  const wOff = new Float64Array(5), wClr = new Float64Array(5).fill(NaN);
  let wIdx = 0, wGoal = 0, wBlkT = 0, wBetT = 0, wBetK = -1, wSwT = 99, wZeroT = 0, wOn = false;
  // candidate 0's sweep reading (1 − raw blocked) taken while the lens stood on it, and where he was: it holds
  // while the lens is off to a side (the collider lines alone cannot see a merged district), until he walks 3 u
  let w0Sweep = 1, w0X = NaN, w0Z = NaN;
  let tetherAuto = 0;           // this frame's automatic tether yaw (swing + alignment / flight), rad
  let cineW = 0;                // this frame's cinematic weight (occYaw and density fade out under a shot)
  // mode 1's Q/E hint (§4.4): the key to pulse ('Q' / 'E' / null), how long it shows, the cooldown, the timer
  let hintKey = null, hintT = 0, hintCool = 0, hintBlkT = 0, hintSeq = 0;
  // camMs (§6.4): update()'s own wall-clock cost, a ring of the last CAM_MS_N calls, and which of them ran the
  // capsule sweep (sweptNow, set by update()). QA, and the tree builder's spare-time gate (camera/bvh.js: it never
  // builds on a sweep frame); what a frame SEES never depends on it.
  const camMsBuf = new Float32Array(CAM_MS_N), camMsSw = new Uint8Array(CAM_MS_N);
  let camMsI = 0, camMsN = 0, sweptNow = false, sweepsDone = 0;
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
  //
  // owned() (§2): somebody else authors the framing — an interior, the palace or
  // the cave (placeOverride), a vehicle, the ferry, a lock. Mode 2 then renders
  // EXACTLY as mode 1 (goals, p.fov, no pitch, yaw from p.azimuth, Q/E snaps),
  // so palace.js / cave.js / the cat interiors keep their framing in either mode.
  // Flying (Contract E) outranks both: 44 flat / 0.38 / fov 40, tether behind
  // the heading, in every mode.
  function owned(inside = indoors()) {
    const pl = ctx.systems.player;
    return !!(inside || ctx.state.placeOverride || pl?.onVehicle || pl?.onFerry || pl?.locked || ctx.state.ferry);
  }
  function status() { inNow = indoors(); ownNow = owned(inNow); flyNow = !!ctx.state.flying; }
  /** Mode 2 proper: the tether drives the yaw and the follow framing applies. */
  const follow = () => mode === 2 && !ownNow && !flyNow;
  /** Who drives the yaw: the tether (mode 2 proper, or any mode while flying) or p.azimuth. */
  const tetherOn = () => flyNow || (mode === 2 && !ownNow);
  const goalElev = () => {
    if (flyNow) return p.flyElev;
    if (mode === 3) return clamp(OVERHEAD_EL, p.minElev, p.maxElev);
    const e1 = clamp(lerp(p.elevation, Math.min(p.elevation, p.zoneElev), zoneK), p.minElev, p.maxElev);
    return mode === 2 && !ownNow ? clamp(e1 + p.m2ElevOff, M2_MIN_EL, p.maxElev) : e1;
  };
  const goalDist = () => {
    if (flyNow) return p.flyDist;                // flat: p.distance is ignored while flying
    const k = mode === 3 ? OVERHEAD_K : mode === 2 && !ownNow ? p.m2DistK : 1;
    return clamp(p.distance * k, p.minDist, p.maxDist);
  };
  const fovGoalMode = () => (flyNow ? p.flyFov : follow() ? p.m2Fov : p.fov);
  const pitchGoal = () => (follow() ? p.m2Pitch : 0);
  /** The landmark reveal runs in modes 1 and 2 only (§2), never while flying. */
  const revealEff = () => (mode === 3 || flyNow ? 0 : revealK);
  /** Distance goal including the landmark reveal ease-out. */
  const goalDistNow = () => { const d = goalDist(); return d + Math.max(0, p.revealDist - d) * revealEff(); };
  /** The wheel's distance (plus the reveal): what tiltFor() reads — never the
   *  mode-scaled cur.distance, so modes 2 and 3 add no tilt of their own (§2). */
  const baseDist = () => p.distance + Math.max(0, p.revealDist - p.distance) * revealEff();
  /** The dolly's floor (CAMERA_SPEC §5.2, A3): max(occDollyMin, k × the mode's distance goal) outdoors,
   *  INDOOR_FLOOR inside a building. Never pushes the lens OUT: every dolly reads min(dist, …). */
  const dollyFloor = (k = p.occDollyFloor) => (inNow ? INDOOR_FLOOR : Math.max(p.occDollyMin, goalDist() * k));

  // ── mode-2 tether (§4.2) ───────────────────────────────────────────────────
  const tetherR = () => Math.max(1, goalDist() * Math.cos(goalElev()));
  function seedAnchor(P, az, Rh) { anchor.x = P.x + Math.sin(az) * Rh; anchor.z = P.z + Math.cos(az) * Rh; anchor.ok = true; }
  /** This frame's movement input: the keys if any are held, else the virtual
   *  stick (touch, debug.walk) — both ignoring moveLock. Fills axNow. */
  function readAxis(inp) {
    const a = typeof inp.axisRaw === 'function' ? inp.axisRaw(axNow) : null;
    if (a && a.active) { if (a !== axNow) { axNow.x = a.x; axNow.y = a.y; axNow.active = true; } return axNow; }
    const v = inp.virtualRaw ?? inp.virtual;
    axNow.x = Number(v?.x) || 0; axNow.y = Number(v?.y) || 0; axNow.active = axNow.x !== 0 || axNow.y !== 0;
    return axNow;
  }
  const PATHS = Array.isArray(world.PATHS) ? world.PATHS : [];
  /**
   * Path anticipation's sensor (§4.1): the nearest world.PATHS segment on this
   * island within width/2 + 2.5 of (x, z) whose tangent lies within 53° of the
   * travel direction (|cos| > 0.6). Sets pathHit.yaw to that tangent signed
   * along travel, and pathHit.ax/az to the unit direction from (x, z) to the
   * path point PATH_AHEAD u further along the path in the travel sense (past
   * the path's end it carries on along the last segment). ~60 segments, run
   * once per frame, no allocation.
   */
  function pathAt(x, z, vx, vz) {
    pathHit.on = false;
    const sp = Math.hypot(vx, vz);
    if (sp < 1e-3) return false;
    const ux = vx / sp, uz = vz / sp;
    const isl = ctx.state.island || (x < 0 ? 'candy' : 'cat');
    let best = Infinity, tx = 0, tz = 0, bk = -1, bi = 0, bt = 0, bs = 1;
    for (let k = 0; k < PATHS.length; k++) {
      const P = PATHS[k];
      if (P.island !== isl || !P.points) continue;
      const pts = P.points, lim = (P.width || 0) * 0.5 + 2.5;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i][0], az = pts[i][1];
        const sx = pts[i + 1][0] - ax, sz = pts[i + 1][1] - az, L2 = sx * sx + sz * sz;
        if (L2 < 1e-6) continue;
        const t = clamp(((x - ax) * sx + (z - az) * sz) / L2, 0, 1);
        const d = hypot2(ax + sx * t - x, az + sz * t - z);
        if (d > lim || d >= best) continue;
        const L = Math.sqrt(L2), cx = sx / L, cz = sz / L, c = ux * cx + uz * cz;
        if (Math.abs(c) <= 0.6) continue;
        const s = c < 0 ? -1 : 1;
        best = d; tx = cx * s; tz = cz * s; bk = k; bi = i; bt = t; bs = s;
      }
    }
    if (best === Infinity) return false;
    pathHit.on = true; pathHit.yaw = Math.atan2(tx, tz);
    // walk PATH_AHEAD u along the polyline from the foot of the perpendicular, in the travel sense
    const pts = PATHS[bk].points;
    let qx = pts[bi][0] + (pts[bi + 1][0] - pts[bi][0]) * bt, qz = pts[bi][1] + (pts[bi + 1][1] - pts[bi][1]) * bt;
    let left = PATH_AHEAD, j = bs > 0 ? bi + 1 : bi, dx = tx, dz = tz;
    while (left > 0 && j >= 0 && j < pts.length) {
      const ex = pts[j][0] - qx, ez = pts[j][1] - qz, L = Math.hypot(ex, ez);
      if (L >= left) { qx += ex / L * left; qz += ez / L * left; left = 0; break; }
      if (L > 1e-6) { dx = ex / L; dz = ez / L; }
      qx = pts[j][0]; qz = pts[j][1]; left -= L; j += bs;
    }
    if (left > 0) { qx += dx * left; qz += dz * left; }       // past the end: straight on
    const ax = qx - x, az = qz - z, La = Math.hypot(ax, az);
    if (La > 1e-3) { pathHit.ax = ax / La; pathHit.az = az / La; } else { pathHit.ax = tx; pathHit.az = tz; }
    return true;
  }
  /**
   * Path alignment's goal azimuth (§4.2), or NaN while it is released. Runs the
   * timers: 0.5 s of pure-forward input on a path at sp > 1.5 arms it, it waits
   * 1.2 s after any manual orbit, ramps in over 0.6 s, and lets go at once on S,
   * A/D, a stop or leaving the path.
   */
  function alignGoal(dt, pl) {
    const v = pl.velocity;
    const sp = v ? Math.hypot(v.x, v.z) : 0;
    const pure = axNow.y > 0 && Math.abs(axNow.x) < 0.25 * axNow.y;
    // pathHit: this frame's pathAt(), run once by update() before the tether (the lead reads it too)
    // (off while pinned, §6.1: a view's --az / --el / --dist, an owner's framing)
    if (!(pure && sp > 1.5 && pathHit.on) || pinned) { fwdT = 0; alignK = 0; return NaN; }
    fwdT += dt;
    if (fwdT < p.pathDelay || manualT < ORBIT_WAIT) { alignK = 0; return NaN; }
    alignK = Math.min(1, alignK + dt / ALIGN_RAMP);
    const travel = Math.atan2(v.x, v.z);
    // − occYaw: a whisker offset is never baked into A and then unwound (§4.2)
    return lerpAngle(travel + Math.PI, pathHit.yaw + Math.PI, p.pathAlign) - occYaw;
  }
  /**
   * One frame of the tether; returns the new azimuth and moves A.
   *   · geometry: A = P + d̂·Rh, az = bearing of A. Strafing swings the view by
   *     v_lateral/Rh (0.35 rad/s walking), capped at TETHER_RATE; S pushes the
   *     lens straight back with no yaw at all; W is already "behind".
   *   · manual: drag rotates A about P at once, Q/E over azDur (eased).
   *   · automatic: path alignment in mode 2, "behind the heading" while flying;
   *     swing + automatic together stay under AUTO_YAW.
   */
  function tether(dt, pl) {
    const P = pl.position, Rh = tetherR();
    const az0 = cur.azimuth;
    if (!anchor.ok) seedAnchor(P, az0, Rh);
    const dx = anchor.x - P.x, dz = anchor.z - P.z, L = Math.hypot(dx, dz);
    // |d| ≈ 0 has no bearing; a jump (a teleport nobody snapped) re-seeds from the lens instead of whipping
    const swing = L >= 0.1 && L <= Rh * 4 ? clamp(wrap(Math.atan2(dx, dz) - az0), -TETHER_RATE * dt, TETHER_RATE * dt) : 0;
    let az = az0 + swing + orbitNow;
    orbitNow = 0;
    if (turnT < 1) { turnT = Math.min(1, turnT + dt / azDur); const e = ease(turnT); az += turnTotal * (e - turnDone); turnDone = e; }
    let step = 0;
    if (recOn && !flyNow) {
      // tap V (§3): the anchor swings behind the facing at λ8, never faster than recentreRate (the Q/E
      // snap's peak; 0.1% under it so a frame never reads over it); path alignment waits it out
      fwdT = 0; alignK = 0;
      const f = pl.facing;
      if (Number.isFinite(f)) {
        const e = wrap(f + Math.PI - az), cap = p.recentreRate * 0.999 * dt;
        const s = clamp(e * (1 - Math.exp(-8 * dt)), -cap, cap);
        az += s;
        if (Math.abs(e - s) < 1e-3) recOn = false;
      } else recOn = false;
    } else if (flyNow) {
      fwdT = 0; alignK = 0;
      const h = ctx.state.flying?.heading;
      if (Number.isFinite(h) && manualT >= ORBIT_WAIT) step = clamp(wrap(h + Math.PI - az) * (1 - Math.exp(-FLY_L * dt)), -FLY_RATE * dt, FLY_RATE * dt);
    } else {
      const want = alignGoal(dt, pl);
      if (want === want) step = clamp(wrap(want - az) * (1 - Math.exp(-ALIGN_L * dt)) * alignK, -p.pathRate * dt, p.pathRate * dt);
    }
    step = clamp(step, -AUTO_YAW * dt - swing, AUTO_YAW * dt - swing);
    tetherAuto = swing + step;                     // the automatic share (the whiskers stay inside AUTO_YAW with it)
    az = wrap(az + step);
    anchor.x = P.x + Math.sin(az) * Rh; anchor.z = P.z + Math.cos(az) * Rh;
    return az;
  }
  /**
   * Mode 2's horizon guard (§2 m2Pitch, A15's sky band). The ladder's lift raises the lens to
   * see over a blocker, which tips the whole frame down by the same angle and takes the sky band
   * with it. skyTop(half) is the angle the top frame edge must keep above the horizontal for a
   * band of m2SkyMin; modePitch() raises the pitch just enough to hold it (pitch turns the view
   * about the lens: the sight line over the blocker is unchanged, the visitor sits lower in frame),
   * never past m2PitchCap × half-FOV, and liftMaxNow() stops the lift where even that cap cannot
   * hold the band. Faded with the mode's own pitch: nothing in modes 1/3, owned, or flying.
   */
  const skyTop = (half) => half - Math.atan((1 - 2 * p.m2SkyMin) * Math.tan(half));
  function modePitch(pb, aim) {
    if (!(pb > 1e-4)) return 0;
    if (!(p.m2SkyMin > 0)) return pb;
    const half = cam.fov * Math.PI / 360;
    const cx = cam.position.x, cz = cam.position.z;
    const down = Math.atan2(cam.position.y - aim.y, Math.hypot(aim.x - cx, aim.z - cz));   // the lookAt's down angle
    const need = down - half + skyTop(half);                                                 // pitch that holds the band
    const extra = Math.max(0, need - pb) * Math.min(1, pb / Math.max(1e-4, p.m2Pitch));
    return Math.min(pb + extra, Math.max(pb, half * p.m2PitchCap));
  }
  /** The ladder's lift cap this frame for a lens at elevation `el` before the lift: in mode 2
   *  proper, no more than the capped pitch can still hold the sky band against. */
  function liftMaxNow(el) {
    if (!(p.m2SkyMin > 0) || !follow() || !(pitchBase > 1e-4)) return liftCap;
    const half = cam.fov * Math.PI / 360;
    return clamp(Math.max(pitchBase, half * p.m2PitchCap) + half - skyTop(half) - el, 0, liftCap);
  }
  /** The same horizon guard's whole room (rad) over a lens at `el` in mode 2 proper (Infinity when the guard is
   *  off): the occlusion tilt takes its share first (liftMaxNow), then the terrain lift, and density's
   *  elevation gets what is left — so density never tips the sky band out of the follow frame either. */
  function skyRoom(el) {
    if (!(p.m2SkyMin > 0) || !follow() || !(pitchBase > 1e-4)) return Infinity;
    const half = cam.fov * Math.PI / 360;
    return Math.max(pitchBase, half * p.m2PitchCap) + half - skyTop(half) - el;
  }
  /** One step of an automatic elevation source (§4.8, A10): its move `want` limited so that the frame's net
   *  automatic elevation change `net` (the other sources, signed) never grows past max(R, |net|) — it may
   *  always move the way that reduces it. Returns the step taken. */
  function elStep(want, net, R) {
    const M = Math.max(R, Math.abs(net));
    return clamp(want, -M - net, M - net);
  }
  // ── clear-side whiskers (§4.4), mode 2 only ─────────────────────────────
  /** Forget the whiskers' reading (a cut, a manual orbit, tap V, a change of owner / mode). occYaw is not touched. */
  function whReset() { wGoal = 0; wBlkT = 0; wBetT = 0; wBetK = -1; wSwT = 99; wZeroT = 0; wIdx = 0; wClr.fill(NaN); w0Sweep = 1; w0X = NaN; w0Z = NaN; }
  /**
   * The whisker offset is cancelled (a manual orbit or tap V, §4.4) or muted (owned, flying, pinned, another mode):
   * on the tether it is folded into the tether's own bearing (A re-seeds there), so the lens does not move and
   * the manual input acts from what you see; anything else just drops it (the mode-1 framing reads p.azimuth).
   */
  function whiskerBake() {
    if (occYaw !== 0) {
      if (tetherOn()) { cur.azimuth = wrap(cur.azimuth + occYaw); anchor.ok = false; }
      occYaw = 0;
    }
    whReset();
  }
  /** The candidate offsets from whiskerSteps: [0, +s0, −s0, +s1, −s1]. */
  function whOffsets() {
    const st = p.whiskerSteps || [0.26, 0.52];
    const s0 = Math.abs(Number(st[0]) || 0.26), s1 = Math.abs(Number(st[1]) || 0.52);
    wOff[0] = 0; wOff[1] = s0; wOff[2] = -s0; wOff[3] = s1; wOff[4] = -s1;
  }
  const W_LINES = [1.6, 1.05, 0.5];              // hat, chest, knees (§4.4)
  /** Candidate k's clear share (0..1): three sight lines body → candidate lens against the local list; the
   *  candidate the lens is on now also takes min(·, 1 − the sweep's raw blocked share). */
  function whEval(k, P, el, dist, aim) {
    lensAt(cur.azimuth + wOff[k], el, dist, aim, terrV);
    let clear = 0;
    for (let i = 0; i < W_LINES.length; i++) {
      if (!dens.lineBlocked(P.x, P.y + W_LINES[i], P.z, terrV.x, terrV.y, terrV.z)) clear++;
    }
    let c = clear / W_LINES.length;
    // the candidate the lens stands on takes the sweep's reading too (§4.4: "candidate 0 also takes min(·, 1 − rawBlocked)");
    // candidate 0 keeps the one it last had while the lens is off to a side, until he has walked 3 u from there
    if (Math.abs(wOff[k] - occYaw) < 0.05) {
      c = Math.min(c, 1 - occBlocked);
      if (k === 0) { w0Sweep = 1 - occBlocked; w0X = P.x; w0Z = P.z; }
    } else if (k === 0 && w0X === w0X) {
      if (Math.hypot(P.x - w0X, P.z - w0Z) <= 3) c = Math.min(c, w0Sweep); else { w0Sweep = 1; w0X = NaN; w0Z = NaN; }
    }
    wClr[k] = c;
    return c;
  }
  const whScore = (k, curK) => wClr[k] - 0.30 * Math.abs(wOff[k]) / Math.max(1e-6, Math.abs(wOff[4])) - (k === curK ? 0 : 0.25);
  function whCurIdx() { let b = 0; for (let k = 1; k < 5; k++) if (Math.abs(wOff[k] - wGoal) < Math.abs(wOff[b] - wGoal)) b = k; return b; }
  /**
   * One frame of the whiskers (mode 2 proper, on foot, not pinned, not looking). Armed while the last sweep's
   * raw blocked count is ≥ 2/5 for WHISK_BLOCK s, with no drag and WHISK_MANUAL s since any manual camera
   * input. One candidate per frame (a full cycle every 5 frames). A switch needs the best to beat the current
   * one by WHISK_BEAT for whiskerHold s, and whiskerGap s since the last switch; the offset unwinds (λ0.8) once
   * candidate 0 has been clear for WHISK_CLEAR s. occYaw eases at λ1.5, ≤ whiskerRate rad/s, and together with
   * the tether's automatic yaw never over AUTO_YAW (A10).
   */
  function whiskerStep(dt, P, el, dist, aim, dragNow) {
    whOffsets();
    wSwT += dt;
    const blocked = occBlocked * 5 >= 2 - 1e-6;
    wBlkT = blocked ? wBlkT + dt : 0;
    const armed = wBlkT >= WHISK_BLOCK && !dragNow && manualT >= WHISK_MANUAL;
    wOn = armed || occYaw !== 0 || wGoal !== 0;
    if (wOn) {
      whEval(wIdx, P, el, dist, aim);
      wIdx = (wIdx + 1) % 5;
      const ck = whCurIdx();
      let all = true;
      for (let k = 0; k < 5; k++) if (wClr[k] !== wClr[k]) { all = false; break; }
      let best = ck;
      if (all) for (let k = 0; k < 5; k++) if (whScore(k, ck) > whScore(best, ck) + 1e-9) best = k;
      if (armed && all && best !== ck && whScore(best, ck) >= whScore(ck, ck) + WHISK_BEAT) {
        if (wBetK === best) wBetT += dt; else { wBetK = best; wBetT = dt; }
      } else { wBetK = -1; wBetT = 0; }
      if (wBetK >= 0 && wBetT >= p.whiskerHold && wSwT >= p.whiskerGap) { wGoal = wOff[wBetK]; wSwT = 0; wBetK = -1; wBetT = 0; wZeroT = 0; }
      if (wGoal !== 0) {
        wZeroT = wClr[0] >= 1 - 1e-9 ? wZeroT + dt : 0;
        if (wZeroT >= WHISK_CLEAR) { wGoal = 0; wZeroT = 0; }
      }
    } else if (wBetK !== -1 || wBetT || wZeroT || wClr[0] === wClr[0]) {
      // idle: forget the readings, so the next arming reads a fresh cycle from where he is then
      wBetK = -1; wBetT = 0; wZeroT = 0; wIdx = 0; wClr.fill(NaN);
    }
    wGoal = clamp(wGoal, -p.whiskerMax, p.whiskerMax);
    if (occYaw !== wGoal) {
      const lam = wGoal === 0 ? 0.8 : 1.5;
      const cap = Math.min(p.whiskerRate * 0.999 * dt, Math.max(0, AUTO_YAW * 0.999 * dt - Math.abs(tetherAuto)));
      occYaw += clamp((wGoal - occYaw) * (1 - Math.exp(-lam * dt)), -cap, cap);
      if (Math.abs(occYaw - wGoal) < 1e-4) occYaw = wGoal;
      occYaw = clamp(occYaw, -p.whiskerMax, p.whiskerMax);
    }
  }

  // ── mode 1's hint (§4.4): not a yaw — when the sweep has read ≥ 3/5 body rays blocked for HINT_BLOCK s and a
  // ±45° step would see him clear (the whiskers' three sight lines), the chip pulses the Q or E keycap for
  // HINT_SHOW s, at most once per HINT_GAP s. E only when nothing is in reach (E is also "interact").
  const hintOut = { key: null, t: 0, seq: 0 };
  function hintStep(dt, pl, busyE) {
    hintCool = Math.max(0, hintCool - dt);
    if (hintT > 0) { hintT = Math.max(0, hintT - dt); if (hintT === 0) hintKey = null; }
    const P = pl?.position;
    if (mode !== 1 || ownNow || flyNow || lookLive || cine || !P) hintBlkT = 0;
    else {
      hintBlkT = occBlocked * 5 >= 3 - 1e-6 ? hintBlkT + dt : 0;
      if (hintBlkT >= HINT_BLOCK && hintCool <= 0) {
        hintBlkT = 0;
        const el = cur.elevation + tiltNow + densEl + occLift + terrainLift, dist = Math.min(cur.distance + densDist, occDist);
        for (let s = 0; s < 2; s++) {
          const d = s === 0 ? STEP : -STEP;          // Q turns +45°, E −45°
          if (d < 0 && busyE) continue;
          lensAt(cur.azimuth + d, el, dist, target, terrV);
          let clear = true;
          for (let i = 0; i < W_LINES.length && clear; i++) if (dens.lineBlocked(P.x, P.y + W_LINES[i], P.z, terrV.x, terrV.y, terrV.z)) clear = false;
          if (clear) {
            hintKey = d > 0 ? 'Q' : 'E'; hintT = HINT_SHOW; hintCool = HINT_GAP; hintSeq++;
            hintOut.key = hintKey; hintOut.t = hintT; hintOut.seq = hintSeq;
            ctx.events.emit('camera:hint', hintOut);
            break;
          }
        }
      }
    }
    hintOut.key = hintKey; hintOut.t = hintT; hintOut.seq = hintSeq;
  }

  // ── density (§4.5) ─────────────────────────────────────────────────────
  /** Density is forced to 0 in mode 3, while owned, flying, under a cinematic, or pinned (free: no update at all). */
  const densOff = () => mode === 3 || ownNow || flyNow || !!cine || pinned;
  /** The fan's reading → the held goal, which moves only when the reading differs from it by more than
   *  DENS_HOLD (so a lone 2/15 reading, goal 0.025, never moves a lens that holds 0). */
  function densRead() {
    const P = ctx.systems.player?.position;
    if (!P) { densOcc = 0; return; }
    dens.maybeRebuild();
    densOcc = dens.fan(P.x, P.y + 1.05, P.z, cur.azimuth + occYaw, cur.elevation + tiltNow);
    const g = smoothstep(0.10, 0.45, densOcc);
    if (Math.abs(g - dKheld) > DENS_HOLD) dKheld = g;
  }
  /** Density's responses for the current dK: the elevation (rad, × (1 − zoneK)) and the extra distance (u). */
  const densElGoal = () => dK * (follow() ? p.densityElev2 : p.densityElev1) * (1 - zoneK);
  const densDistGoal = () => dK * (follow() ? p.densityDist2 : p.densityDist1) * cur.distance;
  /** Refresh the local collider list around him: LOCAL_R, or as far as the lens itself reaches. */
  function refreshLocal() {
    const P = ctx.systems.player?.position;
    if (!P) return;
    const reach = (flyNow ? p.flyDist : cur.distance + densDist) * Math.cos(clamp(cur.elevation, 0, 1.5)) + 12;
    dens.refreshLocal(P.x, P.z, reach);
  }

  // ── terrain whisker (§4.7) ─────────────────────────────────────────────
  /**
   * The extra elevation (rad, 0..terrainLiftMax) the sight line lens → chest needs to pass TERRAIN_M over the
   * ground: TERRAIN_N world.height samples along it (the lens as it would stand without the terrain lift); where
   * the ground rises above the line − TERRAIN_M, the line from the chest would have to climb atan((h + margin −
   * chestY) / s) instead of its own angle. Terrain only (the window never opens it; decks and props are geometry).
   */
  function terrainNeed(P, lens) {
    const cy = P.y + 1.05;
    const lx = lens.x - P.x, lz = lens.z - P.z, ly = lens.y - cy;
    const Hl = Math.hypot(lx, lz);
    if (Hl < 1e-3) return 0;
    const eLine = Math.atan2(ly, Hl);
    let need = 0;
    for (let i = 0; i < TERRAIN_N; i++) {
      const t = (i + 0.5) / TERRAIN_N;
      const hT = world.height(P.x + lx * t, P.z + lz * t);
      if (hT > cy + ly * t - TERRAIN_M) need = Math.max(need, Math.atan2(hT + TERRAIN_M - cy, Hl * t) - eLine);
    }
    return clamp(need, 0, p.terrainLiftMax);
  }

  /** Rotate the tether by d radians, eased over azDur (Q/E in mode 2). */
  function turnTether(d) { turnTotal = turnTotal * (1 - turnDone) + d; turnDone = 0; turnT = 0; }
  /** Q / E: a manual orbit cancels the whiskers (§4.4): their offset folds into the tether, then the orbit acts. */
  function turnStep(d, tOn) { if (tOn) { whiskerBake(); turnTether(d); manualT = 0; alignK = 0; recOn = false; } else startSnap(d); }
  function resetTether() { turnTotal = 0; turnDone = 1; turnT = 1; orbitNow = 0; fwdT = 0; alignK = 0; recOn = false; }
  /** The tether is handing the yaw back to p.azimuth (2→1/3, landing, ownership):
   *  keep the bearing the lens has, including any whisker offset. */
  function handYawBack() {
    p.azimuth = wrap(cur.azimuth + occYaw); cur.azimuth = p.azimuth; occYaw = 0;
    azFrom = azTo = p.azimuth; azT = 1; lastPAz = p.azimuth;
  }

  // ── the aim point: lead, path anticipation, hop damping (§4.1) ─────────────
  /** Where the feet rest at (x, z): the ground core (low props count), else the terrain. */
  function groundH(x, z) {
    const pl = ctx.systems.player;
    if (typeof pl?.groundHeight === 'function') { const h = pl.groundHeight(x, z); if (Number.isFinite(h)) return h; }
    else if (typeof pl?.groundInfo === 'function') { const g = pl.groundInfo(x, z, giOut); if (g && Number.isFinite(g.h)) return g.h; }
    return world.height(x, z);
  }
  /**
   * The aim's height: 1.15 over the feet (+ the town-core rise, as before), but only hopK of a
   * jump's rise over the ground under him — or over the height he took off from, whichever is
   * higher, so a hop off a perch or out of a wade is measured from where he left, and a fall below
   * it is followed 1:1. Never more than HOP_DROP_MAX under the body (a long drop stays in frame).
   * Off while owned, on a vehicle or flying: P.y + 1.15 exactly as before.
   */
  function aimY(pl) {
    const P = pl.position, y = P.y + 1.15 + p.zoneRise * zoneK;   // a town aims at the shopfronts, not the kerb
    if (ownNow || flyNow || pl.onVehicle) { hopRef = NaN; return y; }
    if (!ctx.state.playerAirborne) { hopRef = P.y; return y; }
    const h = groundH(P.x, P.z);
    const hop = Math.max(0, P.y - (hopRef === hopRef ? Math.max(h, hopRef) : h));
    return y - Math.min((1 - p.hopK) * hop, HOP_DROP_MAX);
  }
  /**
   * One frame of the lead (§4.1). The goal splits the travel direction in camera space —
   * F = (−sin az, −cos az) up-screen on the ground, R = (cos az, −sin az) — into away / toward
   * the lens and sideways, each with its mode's base lead (§2), × smoothstep(0.5, 7, speed) ×
   * frameScale × leadRun at a run (the run is read off the speed as well as Shift, so a full
   * stick or debug.walk's 1.58 counts). Near a path it turns halfway toward the path point
   * PATH_AHEAD u ahead (magnitude kept). The lead damps toward the goal at λ1.6 growing, λ0.9
   * decaying (the view holds where you were heading for ~1 s), λ1.1 on a reversal, ≤ 8 u/s.
   */
  function updateLead(dt, pl, az) {
    let gx = 0, gz = 0;
    const v = pl?.velocity, vs = v ? Math.hypot(v.x, v.z) : 0;
    if (vs > 1e-3 && !lookOn) {                // looking (§3): the lead is off (its goal is 0, it decays)
      const Fx = -Math.sin(az), Fz = -Math.cos(az), Rx = Math.cos(az), Rz = -Math.sin(az);
      const f = (v.x * Fx + v.z * Fz) / vs, r = (v.x * Rx + v.z * Rz) / vs;
      let away, toward, side;
      if (follow()) { away = p.lead2Away; toward = p.lead2Toward; side = p.lead2Side; }
      else if (mode === 3 && !flyNow) { away = toward = side = p.lead3; }
      else { away = p.leadAway; toward = p.leadToward; side = p.leadSide; }
      const walk = (Number(pl.speed) || 7) * (Number.isFinite(pl.speedBoost) ? pl.speedBoost : 1);
      const runK = pl.running ? 1 : smoothstep(1.1 * walk, 1.4 * walk, vs);
      const s = smoothstep(0.5, 7, vs) * frameScale() * (1 + (p.leadRun - 1) * runK);
      const fl = f * (f >= 0 ? away : toward) * s, rl = r * side * s;
      gx = Fx * fl + Rx * rl; gz = Fz * fl + Rz * rl;
      if (pathHit.on) {
        const m = Math.hypot(gx, gz);
        if (m > 1e-4) {
          const a = Math.atan2(gx, gz), c = a + wrap(Math.atan2(pathHit.ax, pathHit.az) - a) * 0.5;
          gx = Math.sin(c) * m; gz = Math.cos(c) * m;
        }
      }
    }
    const lam = lead.x * gx + lead.z * gz < 0 ? LEAD_FLIP
      : gx * gx + gz * gz >= lead.x * lead.x + lead.z * lead.z ? LEAD_GROW : LEAD_DECAY;
    const k = 1 - Math.exp(-lam * dt);
    let mx = (gx - lead.x) * k, mz = (gz - lead.z) * k;
    const ml = Math.hypot(mx, mz), cap = LEAD_RATE * dt;
    if (ml > cap) { mx *= cap / ml; mz *= cap / ml; }
    lead.x += mx; lead.z += mz;
  }
  /** The aim point: the feet + the lead, at aimY(). */
  function desiredTarget(out) {
    const pl = ctx.systems.player;
    if (!pl?.position) return out.set(0, 2, 0);
    return out.set(pl.position.x + lead.x, aimY(pl), pl.position.z + lead.z);
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

  // ── V LOOK-AROUND (CAMERA_SPEC §3) ───────────────────────────────────────
  // The look is a set of OFFSETS on top of the gameplay framing — lookYaw, lookEl, lookZoom and the pan
  // (the look point's xz offset from the aim) — plus vLookK (the framing lift and the look lens). Nothing
  // the gameplay owns (p.azimuth, cur.*, controlAzimuth, the tether) is written by a look, so the return
  // is just the offsets easing to 0 and WASD means afterwards what it meant before.
  function lookZero() {
    vLookK = 0; lookYaw = 0; lookEl = 0; lookZoom = 0; lookZoomGoal = 0; panX = 0; panZ = 0; panVX = 0; panVZ = 0; lookGY = NaN;
    lookTurnTotal = 0; lookTurnDone = 1; lookTurnT = 1; lookEndK = 1; lookLive = false;
  }
  /** Off at once, no ease (snap(), setFree(), a teleport): a cut starts clean. */
  function lookReset() {
    if (lookOn) ctx.events.emit('camera:look', LOOK_OFF);
    lookOn = false; lookHook = false; vPend = false; winKeep.ok = false; winKeepCut.clear(); winKeepPlain.clear();
    lookZero(); ladHeld = false;
    if (ctx.input && ctx.input.moveLock > 0) ctx.input.moveLock = 0;
  }
  /** V released / look({on:false}): the offsets ease home (λ lookOut, the yaw ≤ lookReturnRate). */
  function lookRelease() {
    if (!lookOn) return;
    if (!lookVeh) windowRestore();               // he has not moved: the reading from before the look holds
    ladRelR = ladHoldR; ladRelK = vLookK; ladBackG = NaN;   // the dolly share comes home with the offsets
    lookOn = false; lookHook = false;
    if (ctx.input && ctx.input.moveLock > 0) ctx.input.moveLock = 0;
    ctx.events.emit('camera:look', LOOK_OFF);
  }
  /** Ended by a key or an event (§3 "ends the look immediately"): the offsets ease home over lookEndT s. */
  function lookEnd() {
    vPend = false;
    if (!lookOn) return;
    lookRelease();
    lookEnd0.k = vLookK; lookEnd0.yaw = lookYaw; lookEnd0.el = lookEl; lookEnd0.zoom = lookZoom; lookEnd0.x = panX; lookEnd0.z = panZ;
    lookEndK = 0; panVX = 0; panVZ = 0; lookTurnT = 1;
  }
  function lookStart(veh) {
    if (!lookOn) ctx.events.emit('camera:look', LOOK_ON);
    if (!lookLive) windowSave();                 // a fresh look (a look resumed on the way home keeps the first)
    lookOn = true; lookHook = false; lookVeh = veh; lookLive = true;
    lookEndK = 1; recOn = false;                     // a look continues from wherever a return had got to
    lookZoomGoal = lookZoom;                         // …its zoom included (the wheel moves the goal from there)
  }
  const lookLeash = () => (inNow ? p.lookLeashIn : p.lookLeash);
  /** WASD / arrows (or the stick) pan the look point in the look basis, on the leash (§3). */
  function lookPanStep(dt, inp) {
    const run = inp.keys.has('ShiftLeft') || inp.keys.has('ShiftRight');
    const spd = run ? p.lookPanRun : p.lookPan;
    const azL = cur.azimuth + occYaw + lookYaw, sa = Math.sin(azL), ca = Math.cos(azL);
    // F = (−sin, −cos) up-screen, R = (cos, −sin) right
    let gx = (-sa * axNow.y + ca * axNow.x) * spd, gz = (-ca * axNow.y - sa * axNow.x) * spd;
    const leash = lookLeash(), r = Math.hypot(panX, panZ);
    let ux = 0, uz = 0, kT = 1;
    if (r > 1e-6) {
      ux = panX / r; uz = panZ / r; kT = clamp((leash - r) / p.lookTaper, 0, 1);
      const out = gx * ux + gz * uz;
      if (out > 0) { gx -= ux * out * (1 - kT); gz -= uz * out * (1 - kT); }
    }
    const a = 1 - Math.exp(-8 * dt);
    panVX += (gx - panVX) * a; panVZ += (gz - panVZ) * a;
    // the taper holds the VELOCITY too (the λ8 lag would otherwise carry it past the taper): outward speed
    // ≤ spd × what is left of the leash / lookTaper, so the leash is approached, never hit
    if (r > 1e-6) {
      const out = panVX * ux + panVZ * uz, maxOut = spd * kT;
      if (out > maxOut) { panVX -= ux * (out - maxOut); panVZ -= uz * (out - maxOut); }
    }
    panX += panVX * dt; panZ += panVZ * dt;
    const r2 = Math.hypot(panX, panZ);
    if (r2 > leash) { panX *= leash / r2; panZ *= leash / r2; }
  }
  /**
   * One frame of V (§3), before any other camera input. Returns true while the look owns the mouse, Q/E,
   * the wheel and WASD (the caller then skips its own orbit / zoom / turn).
   *   · V down → pending; up within lookHold s and lookTapPx px → TAP (recentre); held, moved or panned → LOOK.
   *   · the look ends at once (lookEndT) on the keys of LOOK_END_KEYS, a left click, E with something in
   *     reach, a cinematic, the pause, a lock, the ferry, or a change of vehicle / flying.
   */
  function lookInput(dt, inp, pl, busyE) {
    const P = inp.pointer;
    const vNow = inp.keys.has('KeyV');
    const vEdge = vNow && !vWas; vWas = vNow;
    const click = !!P.down && !downWas; downWas = !!P.down;
    const veh = !!(pl?.onVehicle || flyNow);
    // a lock blocks the look on foot only: every vehicle boards through escape/ride.js mount(), which locks the
    // visitor (pl.locked) for the whole ride, and the vehicle / flying look is the orbit-only variant (§3). A
    // boarding or a landing still ends a look (veh !== lookVeh, below).
    const blocked = !!(cine || ctx.state.paused || (pl?.locked && !veh) || pl?.onFerry || ctx.state.ferry);
    if (lookOn) {
      let end = blocked || veh !== lookVeh || click || (busyE && inp.pressed.has('KeyE'));
      const endKeys = lookVeh ? LOOK_END_KEYS_VEH : LOOK_END_KEYS;
      if (!end && inp.pressed.size) for (let i = 0; i < endKeys.length; i++) if (inp.pressed.has(endKeys[i])) { end = true; break; }
      if (end) lookEnd();
      else if (!lookHook && !vNow) lookRelease();
    }
    if (vEdge && !lookOn && !blocked) { vPend = true; vT = 0; vMove = 0; vPanned = false; }
    if (vPend) {
      if (blocked) vPend = false;
      else if (!vNow) {
        vPend = false;
        // a TAP: short and still. On a vehicle / flying V only looks (§3).
        if (vT < p.lookHold && vMove < p.lookTapPx && !veh) api.recentre();
      } else {
        if (!vEdge) vT += dt;
        vMove += Math.abs(P.mdx) + Math.abs(P.mdy) + (P.down || P.orbit ? Math.abs(P.dragDX) + Math.abs(P.dragDY) : 0);
        if (!veh && inp.pressed.size) for (let i = 0; i < LOOK_MOVE_KEYS.length; i++) if (inp.pressed.has(LOOK_MOVE_KEYS[i])) { vPanned = true; break; }
        if (vT >= p.lookHold || vMove >= p.lookTapPx || vPanned) { vPend = false; lookStart(veh); }
      }
    }
    if (lookOn) {
      vLookK = lookHook ? 1 : damp(vLookK, 1, p.lookIn, dt);
      if (!lookVeh) inp.moveLock = 2;              // the visitor stands still (§6.2); refreshed every frame
      // the mouse with no button, or any drag (right / middle, a touch thumb): the look's yaw and pitch
      const orb = P.down || P.orbit;
      const mx = (P.mdx || 0) + (orb ? P.dragDX || 0 : 0), my = (P.mdy || 0) + (orb ? P.dragDY || 0 : 0);
      if (mx) lookYaw -= mx * p.lookYawK;
      if (my) lookEl += my * p.lookElK;           // clamped against the frame's elevation where it is composed
      if (!lookVeh) {
        if (inp.pressed.has('KeyQ')) lookTurn(+STEP);
        if (inp.pressed.has('KeyE') && !busyE) lookTurn(-STEP);
      }
      if (lookTurnT < 1) { lookTurnT = Math.min(1, lookTurnT + dt / azDur); const e = ease(lookTurnT); lookYaw += lookTurnTotal * (e - lookTurnDone); lookTurnDone = e; }
      // the wheel moves the zoom's goal; the zoom follows at λ lookIn (the lens rides it 1:1, so no notch pops)
      if (inp.wheel) lookZoomGoal = clamp(lookZoomGoal + inp.wheel * 0.035 / DIST_REF, Math.log(p.lookZoomMin), Math.log(p.lookZoomMax));
      if (lookZoom !== lookZoomGoal) {
        lookZoom = damp(lookZoom, lookZoomGoal, p.lookIn, dt);
        if (Math.abs(lookZoom - lookZoomGoal) < 1e-5) lookZoom = lookZoomGoal;
      }
      if (!lookVeh) lookPanStep(dt, inp); else { panX = 0; panZ = 0; panVX = 0; panVZ = 0; }
      lookLive = true;
    } else if (lookLive) lookReturn(dt);
    return lookOn;
  }
  function lookTurn(d) { lookTurnTotal = lookTurnTotal * (1 - lookTurnDone) + d; lookTurnDone = 0; lookTurnT = 0; }
  /** The way home: λ lookOut with the yaw capped at lookReturnRate (1% under it, so no frame reads over
   *  it), or — ended by a key / event — lookEndT s of ease. Snaps to exactly 0 once imperceptible. */
  function lookReturn(dt) {
    panVX = 0; panVZ = 0; lookTurnT = 1; lookTurnTotal = 0; lookTurnDone = 1;
    if (lookEndK < 1) {
      lookEndK = Math.min(1, lookEndK + dt / Math.max(1e-3, p.lookEndT));
      const w = 1 - ease(lookEndK);
      vLookK = lookEnd0.k * w; lookYaw = lookEnd0.yaw * w; lookEl = lookEnd0.el * w; lookZoom = lookEnd0.zoom * w;
      panX = lookEnd0.x * w; panZ = lookEnd0.z * w;
      if (lookEndK >= 1) lookZero();
      return;
    }
    const k = 1 - Math.exp(-p.lookOut * dt), cap = p.lookReturnRate * 0.99 * dt;
    lookYaw += clamp(-lookYaw * k, -cap, cap);
    lookEl -= lookEl * k; lookZoom -= lookZoom * k; panX -= panX * k; panZ -= panZ * k; vLookK -= vLookK * k;
    if (Math.abs(lookYaw) < 2e-3 && Math.abs(lookEl) < 1e-3 && Math.abs(lookZoom) < 1e-3 && Math.hypot(panX, panZ) < 0.05 && vLookK < 5e-3) lookZero();
  }
  function windowSave() {
    winKeepCut.clear(); winKeepPlain.clear();
    cutHits.forEach(keepCutCb); plainHits.forEach(keepPlainCb);
    winKeep.instC = instC; winKeep.instJ = instJ; winKeep.accC = instAccCut; winKeep.accP = instAccPlain;
    winKeep.prevC = instPrevCut; winKeep.prevP = instPrevPlain; winKeep.ok = true;
  }
  function windowRestore() {
    if (!winKeep.ok) return;
    winKeep.ok = false;
    cutHits.clear(); plainHits.clear();
    winKeepCut.forEach(backCutCb); winKeepPlain.forEach(backPlainCb);
    winKeepCut.clear(); winKeepPlain.clear();
    instC = winKeep.instC; instJ = winKeep.instJ; instAccCut = winKeep.accC; instAccPlain = winKeep.accP;
    instPrevCut = winKeep.prevC; instPrevPlain = winKeep.prevP;
    cutTally(instPrevCut | instAccCut, instPrevPlain | instAccPlain);
  }
  /** Hold the ladder's latches still across a sweep made while looking (the window still reads it). */
  function ladderSave() {
    ladKeep.sweepLift = sweepLift; ladKeep.sweepDolly = sweepDolly; ladKeep.lastDolly = lastDolly; ladKeep.clearRun = clearRun;
    ladKeep.liftMaxRun = liftMaxRun; ladKeep.giveUp = giveUp; ladKeep.liftCap = liftCap; ladKeep.shellBy = shellBy; ladKeep.shellDolly = shellDolly;
    ladKeep.patchDolly = patchDolly; ladKeep.patchHold = patchHold; nearPatchKeep.clear(); nearPatch.forEach(keepPatchCb);
    ladAnchor.copy(liftAnchor); ladGiveUpAt.copy(giveUpAt);
  }
  function ladderRestore() {
    sweepLift = ladKeep.sweepLift; sweepDolly = ladKeep.sweepDolly; lastDolly = ladKeep.lastDolly; clearRun = ladKeep.clearRun;
    liftMaxRun = ladKeep.liftMaxRun; giveUp = ladKeep.giveUp; liftCap = ladKeep.liftCap; shellBy = ladKeep.shellBy; shellDolly = ladKeep.shellDolly;
    patchDolly = ladKeep.patchDolly; patchHold = ladKeep.patchHold; nearPatch.clear(); nearPatchKeep.forEach(backPatchCb); nearPatchKeep.clear();
    liftAnchor.copy(ladAnchor); giveUpAt.copy(ladGiveUpAt);
  }
  /** playerScreen: his feet projected with the final matrix (call after cam.updateMatrixWorld). */
  function projectPlayer() {
    const P = ctx.systems.player?.position;
    if (!P || free) { pScr.on = false; return; }
    const e = cam.matrixWorld.elements;
    const dx = P.x - e[12], dy = P.y - e[13], dz = P.z - e[14];
    const depth = -(dx * e[8] + dy * e[9] + dz * e[10]);
    let nx, ny;
    if (depth > 1e-6) {
      // in front of the lens (w > 0) the projection keeps his side of the frame, however near the lens plane
      // he is (0 < depth ≤ near included: huge values, the right way round); `on` below still needs > near
      scrV.set(P.x, P.y, P.z).project(cam); nx = scrV.x; ny = scrV.y;
    } else {
      // at or behind the lens plane (w ≤ 0) the projection flips through the centre (or divides by 0): take his
      // side from view space instead — the camera's right / up axes, in NDC proportion — and push it far off
      const th = Math.tan(cam.fov * Math.PI / 360) || 1;
      nx = (dx * e[0] + dy * e[1] + dz * e[2]) / (th * (cam.aspect || 1));
      ny = (dx * e[4] + dy * e[5] + dz * e[6]) / th;
      const l = Math.hypot(nx, ny);
      if (l > 1e-9) { nx = nx / l * 1e3; ny = ny / l * 1e3; } else { nx = 0; ny = -1e3; }   // dead behind: below
    }
    if (ctx.renderer?.getSize) ctx.renderer.getSize(scrSize); else scrSize.set(1, 1);
    pScr.x = (nx * 0.5 + 0.5) * scrSize.x; pScr.y = (0.5 - ny * 0.5) * scrSize.y;
    pScr.on = depth > cam.near && nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1;
  }

  const api = {
    params: p, current: cur, target,
    /** Camera-relative forward/right on the ground plane (movement uses this).
     *  Reads controlAzimuth (§4.3), not the lens: it chases the lens at
     *  basisRate while you hold a key, and never takes a cinematic's yaw. */
    basis() { const az = ctrlAz; return { fx: -Math.sin(az), fz: -Math.cos(az), rx: Math.cos(az), rz: -Math.sin(az) }; },
    /** The movement basis azimuth (radians; the lens bearing once it has caught up). */
    get controlAzimuth() { return ctrlAz; },
    /** Current camera mode (1 iso / 2 follow / 3 top). */
    get mode() { return mode; },
    /** Switch mode. Emits 'camera:mode' and toasts; survives snap()/setFree(null).
     *  1→2 hangs the tether at the lens's current bearing (nothing whips); 2→1/3
     *  writes p.azimuth = the lens bearing once, so the view stays put. */
    setMode(n) {
      const m = n === 2 ? 2 : n === 3 ? 3 : 1;
      if (m === mode) return mode;
      status();
      if (follow()) handYawBack();                 // leaving the tether (not while owned / flying)
      occYaw = 0; whReset();
      mode = m;
      azFrom = azTo = p.azimuth; azT = 1;
      anchor.ok = false;                           // the next tether frame seeds A at cur.azimuth
      resetTether();
      ctrlAz = wrap(cur.azimuth + occYaw);
      ctx.events.emit('camera:mode', m);
      ctx.systems.ui?.toast?.(MODE_TOAST[m]);
      return mode;
    },
    /** Ease the lens out to params.revealDist for `secs`, then back — used when
     *  you arrive at a landmark so the whole silhouette lands in frame. */
    reveal(secs = p.revealHold) { revealT = Math.max(revealT, secs); },
    get revealing() { return revealK > 0.01; },

    snap() {
      status();
      lookReset();                                 // §6.4: a cut ends the look (and the lock) at once
      // ownership began in mode 2 and this snap is its cut (sourpatch eaten.js locks, then
      // snaps): the owned framing reads p.azimuth, which mode 2 never writes — keep the lens's
      // bearing, unless the owner has just aimed it (update() applies the same rule)
      if (ownNow && !wasOwned && mode === 2 && !flyNow && !azExt && p.azimuth === lastPAz) handYawBack();
      // a landing snapped before the next update: keep the lens behind the machine
      if (wasFlying && !flyNow && !follow()) handYawBack();
      wasOwned = ownNow; wasFlying = flyNow;
      occYaw = 0; whReset();                       // a cut starts with no whisker offset (§6.4)
      const pl0 = ctx.systems.player?.position;
      zoneK = pl0 ? zoneAt(pl0.x, pl0.z) : 0;    // settled, not damped: a screenshot gets one frame
      revealT = 0; revealK = 0;
      resetTether();
      if (tetherOn() && pl0) {
        // the tether snaps BEHIND: the facing (on foot) or the heading (flying) + π
        const f = flyNow ? ctx.state.flying.heading : ctx.systems.player?.facing;
        cur.azimuth = wrap((Number.isFinite(f) ? f : p.azimuth - Math.PI) + Math.PI);
        seedAnchor(pl0, cur.azimuth, tetherR());
      } else { cur.azimuth = p.azimuth; anchor.ok = false; }
      cur.elevation = goalElev(); cur.distance = goalDist();
      ctrlAz = wrap(cur.azimuth + occYaw);
      // the mode's lens and pitch at once (a screenshot gets one frame); a free
      // camera keeps the lens it was given
      modeFov = fovGoalMode(); pitchBase = pitchGoal();
      if (!free) { cam.fov = modeFov; cam.updateProjectionMatrix(); }
      baseDistNow = baseDist(); tiltNow = flyNow ? 0 : tiltFor(baseDistNow);
      // a teleport lands you inside a landmark zone; that is not an "arrival",
      // so swallow the banner that follows it (and keeps --view renders exact)
      revealMute = 0.8; lastHere = ctx.systems.ui?.here ?? null;
      azFrom = azTo = p.azimuth; azT = 1; cine = null; shakeAmp = 0; idle = 1;
      // the collider sensors settle at once (§4.5, §4.6, §6.4): density at its goal, then the local list
      // (the held goal restarts from 0, so a snap reads the same wherever the lens was before it: A12)
      dKheld = 0;
      if (densOff()) { dK = 0; densOcc = 0; } else { densRead(); dK = dKheld; }
      densT = DENS_EVERY;
      densDist = densDistGoal();
      const elB = cur.elevation + tiltNow;         // the framing's base elevation (no lift, no density)
      densEl = Math.max(0, Math.min(densElGoal(), skyRoom(elB)));
      refreshLocal(); localT = LOCAL_EVERY;
      const d0 = cur.distance + densDist;          // the framing's distance, density's response included
      // a cut starts on the body (§6.4): no lead, and no hop damping (the feet count as grounded)
      lead.x = 0; lead.z = 0; hopRef = pl0 ? pl0.y : NaN;
      desiredTarget(target);
      clearFades(); clearCull();
      cutHits.clear(); plainHits.clear(); shellBy = null; shellDolly = Infinity; colRun = 0; colSweeps = 0;
      nearPatch.clear(); patchDolly = Infinity; patchHold = 0;
      instC = 0; instJ = 0; instAccCut = 0; instAccPlain = 0; instPrevCut = 0; instPrevPlain = 0;
      cutTally(0, 0);                              // no reading from before the cut leaks into its first pass
      sweepLift = 0; sweepDolly = Infinity; lastDolly = Infinity; occLift = 0; occDist = d0;
      clearRun = 0; liftMaxRun = 0; giveUp = false; liftCap = p.occLiftMax; liftAnchor.set(NaN, 0, 0); giveUpAt.set(NaN, 0, 0);
      terrainLift = 0; terrainGoal = 0; elBasePrev = NaN;
      ctx.scene.updateMatrixWorld(true);
      refreshCandidates(); candT = 0; sweepT = 0;
      const el0 = elB + densEl;
      // Settle the sweep in one go, so a single-frame screenshot is right. Each
      // pass re-measures from the lens the previous pass asked for; inside a
      // snap the tilt only climbs, so ten passes always converge (and leave two
      // spare for the give-up latch to fire when the tilt is not working).
      const passes = free ? 1 : 10;
      for (let i = 0; i <= passes; i++) {
        const oc = occlude(target, cur.azimuth, cur.elevation + densEl, d0, Math.min(d0, occDist));
        colRun = oc.trig ? colRun + 1 : 0;
        // §5.2: the window settles open in a snap wherever it is needed (cutK is set directly below), and
        // then the ladder holds still: the lens stays at the stop, no tilt
        winCarry = p.cut !== 0 && !cutSweepClear && (cutNeedA || colTrigger());
        const colOk = colAssist();
        occLift = winCarry ? 0 : clamp(Math.max(oc.lift, sweepLift), 0, liftMaxNow(elB));
        occDist = Math.max(6, winCarry ? Math.min(d0, sweepDolly, shellDolly, patchDolly) : Math.min(d0, colOk ? oc.dist : d0, sweepDolly, shellDolly, patchDolly));
        place(cur.azimuth, el0 + occLift, Math.min(d0, occDist), target);
        if (free || i === passes) break;
        lensAt(cur.azimuth, el0 + occLift, d0, target, idealPos);
        lastSweepFrom.copy(idealPos); sweepAim.copy(target);
        // first pass looks at everything (a screenshot gets no second chance);
        // the rest only have to confirm the tilt, so they take a wide budget — except the last one when the lens
        // now stands dollied: it looks at everything again, so the window reads what the DOLLIED lens has in front
        // of him (a budgeted pass left the stop's first reading standing, a window open on nothing, for ~0.5 s)
        sweepCursor = 0;
        const all = i === 0 || (i === passes - 1 && Math.min(d0, occDist) < d0 - WIN_CONFIRM_BACK);
        sweepOcclusion(idealPos, cam.position, all ? Infinity : p.occBudget * 3);
        applyCull();
        if (colRun) colSweeps++;
      }
      if (!free && pl0) {
        // the terrain lift settles at its goal (§4.7: so --el on a slope is exact), from the lens the ladder settled
        lensAt(cur.azimuth, el0 + occLift, Math.min(d0, occDist), target, terrV);
        terrainGoal = terrainNeed(pl0, terrV); terrainLift = terrainGoal;
        // density's elevation keeps to the sky room the settled lifts leave (mode 2 proper)
        const dRoom = Math.max(0, Math.min(densEl, skyRoom(elB) - occLift - terrainLift));
        if (terrainLift > 0 || dRoom !== densEl) { densEl = dRoom; place(cur.azimuth, elB + densEl + occLift + terrainLift, Math.min(d0, occDist), target); }
        // one deterministic whisker reading (§6.4): every candidate, from the settled framing; no switch
        if (follow() && !pinned) { whOffsets(); for (let k = 0; k < 5; k++) whEval(k, pl0, elB + densEl + occLift + terrainLift, Math.min(d0, occDist), target); }
      }
      if (!free) {
        fadeBlockers(1, cam.position, target);
        const pb = modePitch(pitchBase, target);
        if (pb > 1e-4) cam.rotateX(pb);                 // the mode's pitch, after the final lookAt
        cam.updateMatrixWorld(true);
        // the window settled from the final pass (§5.1: snap() runs the sweep, then sets cutK directly)
        const need = p.cut !== 0 && (cutNeedA || colTrigger());
        cutKraw = need ? 1 : 0; cutHoldT = need ? p.cutHold : 0;
        cutGrowK = cutRays >= 2 || cutPlinth ? p.cutGrow : 1;
        writeCut(cutKraw);
      } else { cut.off(); cutKraw = 0; cutEff = 0; }
      projectPlayer();
      // not lastPAz: an owner's setParams({azimuth}) just before this snap must still read as the
      // owner's write at the next update() (that is how the cave's corridor aim got clobbered)
      snapFresh = true;
    },
    setFree(v) {
      free = v;
      lookReset();                                 // either way the look is over (§3, §6.4)
      clearFades(); clearCull();                  // a free camera frames the world, not the player
      // the window and the near-lens band are off under a free camera (free renders stay pixel-identical);
      // back on the player it re-opens from 0 as the sweep asks. The collider trigger's bookkeeping is
      // forgotten only when a free camera takes over: setFree(null) right after a snap() (render.mjs /
      // camvis: teleport → setCameraParams → setView(null)) keeps what that snap settled for this very
      // framing, so a collider the snap's sweep already found clear cannot re-fire the trigger for the
      // four frames before the next sweep and leave a closing window over an unblocked visitor (A15)
      cutKraw = 0; cutEff = 0; cutHoldT = 0; cutGrowK = 1;
      if (v) { colRun = 0; colSweeps = 0; }
      // the spring arm's reading likewise (a free camera frames something else); setFree(null) right after a snap()
      // keeps what that snap settled — reset here, the lens would ease out of its dolly and back in over the next
      // four sweeps (occ_whisker_night: 17 → 23.5 → 17 u, the window opening on the gazebo roof on the way)
      if (v) { patchDolly = Infinity; patchHold = 0; nearPatch.clear(); }
      if (v) cut.off();
      if (v) { const t = new THREE.Vector3(...v.target); if (v.fov) { cam.fov = v.fov; cam.updateProjectionMatrix(); } place(v.azimuth ?? p.azimuth, v.elevation ?? p.elevation, v.distance ?? p.distance, t); }
      // back to the follow camera: keep the mode, and do not read the landmark
      // we are standing in as a fresh arrival
      else {
        status();
        // the MODE's lens (not p.fov: that would ease every mode-2 view 30 → 42 during its frames)
        modeFov = fovGoalMode(); pitchBase = pitchGoal();
        cam.fov = modeFov; cam.updateProjectionMatrix();
        anchor.ok = false; resetTether();          // the tether resumes from cur.azimuth
        lead.x = 0; lead.z = 0;
        occYaw = 0; whReset();                     // …with no whisker offset (§6.4); the pin stays (§6.1)
        ctrlAz = wrap(cur.azimuth + occYaw);
        wasOwned = ownNow; wasFlying = flyNow;
        candT = 0; sweepT = 0; sweepLift = 0; sweepDolly = Infinity; lastDolly = Infinity; shellDolly = Infinity; clearRun = 0; liftMaxRun = 0; giveUp = false; liftCap = p.occLiftMax; liftAnchor.set(NaN, 0, 0); giveUpAt.set(NaN, 0, 0);
        revealMute = 0.8; revealT = 0; lastHere = ctx.systems.ui?.here ?? null;
      }
    },
    setParams(np) {
      Object.assign(p, np);
      // THE PIN (§6.1): an explicit elevation or distance mutes density, the whiskers and path alignment
      if (np.elevation !== undefined || np.distance !== undefined) {
        const P = ctx.systems.player?.position;
        pinned = true; pinX = P ? P.x : NaN; pinZ = P ? P.z : NaN;
        if (occYaw !== 0 || wGoal !== 0) { status(); whiskerBake(); }
      }
      if (np.azimuth !== undefined) { azFrom = azTo = np.azimuth; azT = 1; azExt = true; }
      // the "no extra tilt" reference follows an explicit distance, except while a
      // vehicle or the flight owns the distance (§2)
      if (np.distance !== undefined && !(ctx.systems.player?.onVehicle || ctx.state.flying)) distRef = np.distance;
      if (np.fov) {
        if (free) { cam.fov = np.fov; cam.updateProjectionMatrix(); }
        else {
          // an explicit fov is exact at once where the mode's lens is p.fov (modes 1/3,
          // owned); mode 2 and the flight keep their own lens
          status();
          const g = fovGoalMode();
          if (g === p.fov) { modeFov = g; cam.fov = g; cam.updateProjectionMatrix(); }
        }
      }
    },
    isFree: () => !!free,
    /** tiltFor(baseDistance) as last applied: 0 at the wheel default in every mode (§2). */
    get tilt() { return tiltNow; },
    /** The wheel's distance plus the landmark reveal (what the tilt reads). */
    get baseDistance() { return baseDistNow; },
    /** The mode's distance goal (before the reveal and the occlusion dolly). */
    get goalDistance() { status(); return goalDist(); },
    /** The aim point's lead ahead of the visitor, world xz (§4.1; a copy, for QA). */
    get lead() { return { x: lead.x, z: lead.z }; },
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
    /** How many timed sweeps update() has run (QA: a frame whose update() raised it was a sweep frame, A13). */
    get sweepsDone() { return sweepsDone; },
    /** The see-through window's strength this frame, 0..1 (§5.1; 0 off screen, free, cut 0, in a noTilt hold). */
    get cutK() { return cutEff; },
    /** The clear-side whisker yaw (rad, §4.4) on top of the tether: mode 2 proper only, 0 everywhere else. */
    get occYaw() { return occYaw; },
    /** Density (§4.5), 0..1: forced 0 in mode 3, owned, flying, under a shot, pinned; frozen while looking. */
    get densityK() { return dK; },
    /** The terrain whisker's lift (rad, §4.7, ≤ terrainLiftMax). */
    get terrainLift() { return terrainLift; },
    /** A setParams elevation / distance holds density, the whiskers and path alignment off (§6.1). */
    get pinned() { return pinned; },
    /** QA (allocates): density's fan reading, held goal, k, its applied el / dist, and the collider sensors. */
    get densityState() { return { occ: densOcc, held: dKheld, k: dK, el: densEl, dist: densDist, off: densOff(), terrainGoal, ...dens.stats }; },
    /** QA (allocates): the whiskers' state (§4.4). */
    get whiskerState() {
      return { on: wOn, goal: wGoal, yaw: occYaw, offsets: [...wOff], clear: [...wClr], blockT: wBlkT, betterT: wBetT, better: wBetK, sinceSwitch: wSwT, zeroClearT: wZeroT };
    },
    /** Mode 1's Q/E hint (§4.4): { key: 'Q' | 'E' | null, t: s left, seq } — shared object, read it, do not keep it. */
    get hint() { return hintOut; },
    /** The collider sensors (camera/density.js): top(c), the local list, the fan — for QA and tools. */
    get density() { return dens; },
    /** The window's inputs, for QA: need (a) from the sweep, the collider run (b), rays, grow, hold. */
    get cutState() {
      // by / plainBy: what the window's reading holds (mesh name → body-ray bits; '[inst]' = the instance clouds)
      const by = [], plainBy = [];
      cutHits.forEach((v, o) => by.push(`${o.name || o.type}:${v}`)); plainHits.forEach((v, o) => plainBy.push(`${o.name || o.type}:${v}`));
      if (lastInstCut) by.push(`[inst]:${lastInstCut}`); if (lastInstPlain) plainBy.push(`[inst]:${lastInstPlain}`);
      const shells = shellBy ? [shellBy.name || shellBy.type] : [];
      return { needSweep: cutNeedA, colRun, colSweeps, sweepClear: cutSweepClear, colTrigger: colTrigger(), allUnpatched: cutAllPlain, rays: cutRays, plinth: cutPlinth, carry: winCarry, inst: [instC, instJ], shells, grow: cutGrowK, hold: cutHoldT, raw: cutKraw, by, plainBy };
    },
    /** The sweep's triangle accelerator (camera/bvh.js): stats(), ready(o), build(o) — QA / tools. */
    get accel() { return accel; },
    /** The cutout module: isPatched(o), uniforms, stats (CAMERA_SPEC §5.1, §7). */
    get cutout() { return cut; },
    /** Is this mesh cut by the see-through window? (§7: never a NEVER_FADE / noCut / noFade mesh.) */
    isPatched(o) { return cut.isPatched(o); },
    /** Meshes currently hidden because the lens is inside them. */
    get culled() { return culled.size; },
    get culledList() { return [...culled.keys()].map((o) => o.name || o.type); },
    /** The culled meshes with their world size, largest bounding-box side (QA, A3: only ever ≤ occCullMax). */
    get culledSizes() {
      return [...culled.keys()].map((o) => {
        const bb = o.geometry?.boundingBox, sc = worldScale(o);
        const d = bb ? Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * sc : NaN;
        return { name: o.name || o.type, maxDim: +d.toFixed(2) };
      });
    },
    /** Inside a building this frame (the architecture systems' interiors; the dolly floor is 5.5 there, §5.2). */
    get indoors() { return inNow; },
    /** The dolly's floor this frame (§5.2, A3): max(occDollyMin, occDollyFloor × the mode's goal) outdoors, 5.5 inside. */
    get dollyFloor() { return dollyFloor(); },
    /** The window carries the frame (open or opening): the ladder's dolly and tilt hold still (§5.2). */
    get ladderHeld() { return winCarry; },
    /** The spring arm's dolly (u from the aim, Infinity when off): a PATCHED mass at the lens with room in front of it. */
    get patchDolly() { return patchDolly; },
    /** update()'s cost (§6.4, A13): wall-clock ms over the last CAM_MS_N calls, the sweep frames (6 Hz) apart.
     *  QA only (allocates): { n, mean, p95, max, sweepP95, nonSweepP95, sweeps }. */
    get camMs() {
      const n = camMsN, all = [], sw = [], ns = [];
      for (let i = 0; i < n; i++) { const v = camMsBuf[i]; all.push(v); (camMsSw[i] ? sw : ns).push(v); }
      const p95 = (a) => { if (!a.length) return null; a.sort((x, y) => x - y); return +a[Math.min(a.length - 1, Math.round(0.95 * (a.length - 1)))].toFixed(3); };
      const mean = n ? +(all.reduce((s, x) => s + x, 0) / n).toFixed(3) : null;
      return { n, mean, p95: p95(all.slice()), max: n ? +Math.max(...all).toFixed(3) : null, sweepP95: p95(sw), nonSweepP95: p95(ns), sweeps: sw.length };
    },
    /** One unbudgeted sweep from where the lens is now, reported rather than
     *  applied — the QA hook for "why can I not see him in this frame". The
     *  tilt/dolly control state and the window's reading are put back afterwards
     *  so asking the question moves nothing; the fade set is simply re-measured.
     *  occDebug({ fromStop: true }) casts from where update()'s last sweep cast
     *  (the undollied stop) with the real lens as the lens, i.e. what the window read;
     *  `window` then says what cutNeed would be from this one unbudgeted pass. */
    occDebug(o = {}) {
      const out = [];
      const keep = { sweepLift, sweepDolly, clearRun, liftMaxRun, giveUp, sweepCursor, occBlocked, occMs };
      const keepCut = { cutNeedA, cutSweepClear, cutRays, cutAllPlain, cutPlinth, lastInstCut, lastInstPlain, hits: new Map(cutHits), plain: new Map(plainHits) };
      const keepInst = { instC, instJ, instAccCut, instAccPlain, instPrevCut, instPrevPlain, shellBy, shellDolly, patchDolly, patchHold, near: new Map(nearPatch) };
      const from = o.fromStop && Number.isFinite(lastSweepFrom.x) ? lastSweepFrom : cam.position;
      // one clean round over every instance (the reading is this pass's alone)
      instC = 0; instJ = 0; instAccCut = 0; instAccPlain = 0; instPrevCut = 0; instPrevPlain = 0;
      sweepOcclusion(from, cam.position, Infinity, out);
      const r = {
        blocked: occBlocked, lift: +sweepLift.toFixed(3),
        dolly: Number.isFinite(sweepDolly) ? +sweepDolly.toFixed(2) : null,
        ms: +occMs.toFixed(2), candidates: sweepers.length,
        from: [from.x, from.y, from.z].map((x) => +x.toFixed(2)), lensBack: +from.distanceTo(cam.position).toFixed(2),
        window: { need: cutNeedA, rays: cutRays, clear: cutSweepClear, allUnpatched: cutAllPlain, plinth: cutPlinth },
        shell: shellBy ? shellBy.name || shellBy.type : null, shellDolly: Number.isFinite(shellDolly) ? +shellDolly.toFixed(2) : null,
        patchDolly: Number.isFinite(patchDolly) ? +patchDolly.toFixed(2) : null,
        nearPatch: [...nearPatch].map(([o, v]) => [o.name || o.type, +v.toFixed(2)]),
        hits: out.sort((a, b) => a.d - b.d),
      };
      ({ sweepLift, sweepDolly, clearRun, liftMaxRun, giveUp, sweepCursor, occBlocked, occMs } = keep);
      ({ cutNeedA, cutSweepClear, cutRays, cutAllPlain, cutPlinth, lastInstCut, lastInstPlain } = keepCut);
      ({ instC, instJ, instAccCut, instAccPlain, instPrevCut, instPrevPlain, shellBy, shellDolly, patchDolly, patchHold } = keepInst);
      nearPatch.clear(); keepInst.near.forEach((v, k) => nearPatch.set(k, v));
      cutHits.clear(); keepCut.hits.forEach((v, k) => cutHits.set(k, v));
      plainHits.clear(); keepCut.plain.forEach((v, k) => plainHits.set(k, v));
      return r;
    },

    /**
     * QA: how much of the visitor the lens can actually see from where it is
     * standing — five rays (hat, head, chest, hips, knees) against the WHOLE
     * scene, instanced vegetation included, with three.js doing the raycasting
     * rather than the budgeted sweep. Slow (tens of ms) and side-effect free;
     * this is the number the art director asks for ("body visibility 5/5"), not
     * something the camera runs per frame.
     *   → { visible, rawVisible, featherVisible, total,
     *       rays: [{ pt, clear, rawClear, feather, by:[name@dist], cutBy, cutWhy, excused }] }
     *   (cutWhy / excused on a ray that is not clear: cutout.why() — terrain, noCut, unpatched,
     *   nearBody, feather are the §5.3 amber cases; shut, low, outside are the window's own misses)
     * CUT-AWARE (CAMERA_SPEC §5.4): a hit is cut-clear when its mesh is patched, it sits in
     * front of the chest (view depth < uCutP.x) and over the feet line (y > uCutP.y), and it
     * projects inside the window's fully open core (e < 0.55) while cutK ≥ 0.5 — or it lies deep
     * enough in the near-lens band that every dither cell discards it. 0.55 ≤ e < 0.8 is the
     * feather band: reported apart (featherVisible), never as clear. A ray is clear when every
     * hit on it is cut-clear; `by` lists its first three hits, `cutBy` the first one the window
     * does not open.
     * Two readings of "a hit", on purpose:
     *   · rawClear / rawVisible — TODAY'S geometric answer, unchanged (A2 compares it with the
     *     pre-edit baseline): any userData.noFade mesh is skipped as if it were the visitor's own,
     *     and a mesh inside a hidden group (an interior shell nobody draws) still counts. noGhost is
     *     skipped the same way: it is what an owner writes INSTEAD of noFade on a shell the window
     *     may cut (the same meshes), so moving a shell from noFade to noGhost cannot move A2.
     *   · clear / visible — what is DRAWN: only the visitor's own meshes (his group, the silhouette)
     *     are skipped, a noFade mass (an enterable building's roof, a shack) blocks like anything
     *     else the window may not cut, and a mesh under a hidden ancestor is not there. So a ray can
     *     be rawClear and still not clear (a noFade roof the old metric never saw).
     */
    bodyVisibility() {
      const pl = ctx.systems.player?.position;
      const out = { visible: 0, rawVisible: 0, featherVisible: 0, total: 0, rays: [] };
      if (!pl) return out;
      const plg = ctx.systems.player?.group;
      const mine = (o) => { for (let n = o; n; n = n.parent) if (n.userData?.noFade || n.userData?.noGhost || n.userData?.silhouette || n === plg) return true; return false; };
      const own = (o) => { for (let n = o; n; n = n.parent) if (n.userData?.silhouette || n === plg) return true; return false; };
      const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
      const pts = [['hat', 1.78], ['head', 1.45], ['chest', 1.05], ['hips', 0.65], ['knees', 0.40]];
      out.total = pts.length;
      for (const [nm, dy] of pts) {
        tmp2.set(pl.x, pl.y + dy, pl.z).sub(cam.position);
        const L = tmp2.length();
        if (L < 1e-3) { out.visible++; out.rawVisible++; out.rays.push({ pt: nm, clear: true, rawClear: true, feather: false, by: [] }); continue; }
        qaRay.set(cam.position, tmp2.divideScalar(L));
        qaRay.near = 0.05; qaRay.far = L - 0.15;
        let hits = [];
        try { hits = qaRay.intersectObject(ctx.scene, true); } catch { hits = []; }
        const by = [];
        let nRaw = 0, blockBy = null, blockWhy = null, anyFeather = false;
        for (const h of hits) {
          const o = h.object;
          if (!o.visible) continue;
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          if (!m || m.depthWrite === false) continue;
          if (m.transparent && (m.opacity ?? 1) < 0.5) continue;
          if (/^(sky|cloud|star|sun|moon)/i.test(o.name || '')) continue;
          if (h.point.y - world.height(h.point.x, h.point.z) < 0.45) continue;   // the floor at his shoes
          if (L - h.distance < 0.8) continue;                                    // the deck he stands on
          const label = `${o.name || o.type}${o.isInstancedMesh ? '[inst]' : ''}@${h.distance.toFixed(1)}`;
          if (!mine(o)) { nRaw++; if (by.length < 3) by.push(label); }              // today's reading
          if (!own(o) && shown(o)) {                                               // what is drawn
            const c = cut.classify(h, cam);
            if (c === 'feather') anyFeather = true;
            else if (c !== 'clear' && !blockBy) { blockBy = label; blockWhy = cut.why(h, cam); }
          }
          if (blockBy && by.length >= 3) break;                  // neither answer can change any more
        }
        const rawClear = nRaw === 0, clear = !blockBy && !anyFeather, feather = !blockBy && anyFeather;
        if (clear) out.visible++;
        if (rawClear) out.rawVisible++;
        if (feather) out.featherVisible++;
        const ray = { pt: nm, clear, rawClear, feather, by };
        // cutWhy: why the window leaves that blocker in the picture, and whether §5.3 accepts it (excused)
        if (blockBy) { ray.cutBy = blockBy; ray.cutWhy = blockWhy; ray.excused = cut.excused(blockWhy); }
        else if (feather) { ray.cutWhy = 'feather'; ray.excused = true; }
        out.rays.push(ray);
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
    /** 0..1 — the V look's strength (§3): 1 while looking, easing to 0 on the way home. */
    get looking() { return vLookK; },
    /** The V look's own yaw offset (rad; 0 unless the mouse, a drag or Q/E moved it). */
    get lookYaw() { return lookYaw; },
    /** The V look (on, or the last one, easing home) is the vehicle / flying variant: orbit only, no pan (§3). */
    get lookVehicle() { return lookVeh; },
    /** QA: the V look's whole state (allocates; not for per-frame use). */
    get lookState() {
      return { on: lookOn, hook: lookHook, veh: lookVeh, pending: vPend, k: vLookK, yaw: lookYaw, el: lookEl,
        zoom: Math.exp(lookZoom), zoomGoal: Math.exp(lookZoomGoal), pan: [panX, panZ], ending: lookEndK < 1, recentring: recOn };
    },
    /** His feet on screen, CSS px of the canvas (y down), after the final pitch; on = in front of the
     *  lens and inside the frame. A shared object: read it, do not keep it. */
    get playerScreen() { return pScr; },
    /**
     * The V look as a deterministic hook (views, debug): { on, yaw, pitch, pan: [dx, dz], zoom }.
     * on (default true) sets the look at full strength — yaw / pitch (the look's own elevation offset)
     * in radians, pan [right, forward] in the look basis (as WASD pans it; clamped to the leash), zoom ×0.7..1.6 — with the
     * look lens at once, and holds it (V's release does not end it) until look({ on: false }), which
     * eases home exactly as a V release does. On a vehicle / flying it is the orbit-only variant.
     */
    look(o = {}) {
      if (!o || o.on === false) { lookRelease(); return false; }
      status();
      const pl = ctx.systems.player;
      lookStart(!!(pl?.onVehicle || flyNow));
      lookHook = true; vPend = false;
      lookTurnTotal = 0; lookTurnDone = 1; lookTurnT = 1;
      vLookK = 1;
      lookYaw = Number(o.yaw) || 0; lookEl = Number(o.pitch) || 0;
      const z = Number(o.zoom);
      lookZoom = Number.isFinite(z) && z > 0 ? clamp(Math.log(z), Math.log(p.lookZoomMin), Math.log(p.lookZoomMax)) : 0;
      lookZoomGoal = lookZoom;                     // at once: the lens rides it from the next frame (no dolly lag)
      panX = 0; panZ = 0; panVX = 0; panVZ = 0; lookGY = NaN;
      if (!lookVeh && Array.isArray(o.pan)) {
        // [dx, dz] in the LOOK basis, as WASD pans: dx to the right, dz forward (up-screen) — so pan [0, 38]
        // puts the look point 38 u ahead and him off the bottom of the frame (cam_look_offscreen). Stored in
        // world xz, as the pan always is (turning the look afterwards does not swing the look point).
        const dx = Number(o.pan[0]) || 0, dz = Number(o.pan[1]) || 0;
        const azL = cur.azimuth + occYaw + lookYaw, sa = Math.sin(azL), ca = Math.cos(azL);
        panX = ca * dx - sa * dz; panZ = -sa * dx - ca * dz;
        const r = Math.hypot(panX, panZ), L = lookLeash();
        if (r > L) { panX *= L / r; panZ *= L / r; }
      }
      if (!lookVeh && ctx.input) ctx.input.moveLock = 2;
      // the look lens at once (a view gets its frames, a debug call its first one)
      modeFov = lookVeh ? p.lookFovVeh : p.lookFovLook;
      if (!free) { cam.fov = modeFov; cam.updateProjectionMatrix(); }
      return true;
    },
    /**
     * Tap V (§3): recentre behind the visitor. Modes 1/3 (and owned mode 2) snap p.azimuth to the 45° step
     * nearest facing + π (the cave reads that as a manual turn, which it is); mode 2 swings the tether
     * behind the facing at λ8, ≤ recentreRate rad/s. Clears the path-alignment ramp. Not while flying.
     */
    recentre() {
      status();
      const f = ctx.systems.player?.facing;
      if (free || flyNow || !Number.isFinite(f)) return false;
      fwdT = 0; alignK = 0; manualT = 0;
      if (mode === 2 && !ownNow) { whiskerBake(); recOn = true; turnT = 1; turnTotal = 0; turnDone = 1; return true; }
      snapTo(Math.round((f + Math.PI) / STEP) * STEP);
      return true;
    },
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

      // ── who owns the framing this frame (§2) ────────────────────────────
      status();
      const pl = ctx.systems.player;
      const tOn = tetherOn() && !!pl?.position;
      if (!tOn) anchor.ok = false;                 // the tether re-seeds from cur.azimuth when it resumes
      // Ownership began in mode 2 (§2: owned mode 2 renders exactly as mode 1).
      //  · yaw: the owned framing reads p.azimuth, so start it from the lens's bearing,
      //    unless somebody wrote p.azimuth since our last frame (cave.js aims down its
      //    corridor, a view pins --az): that is the owner's aim, never overwrite it.
      //  · a snap() ran since our last frame (the owner's transition, or the view's):
      //    it framed the follow lens because the owner had not declared itself yet —
      //    redo it now, owned, so frame 1 is the cut mode 1 got (az, el/dist, p.fov, no pitch).
      //  · otherwise (walking in through a door, boarding) el/dist ease as in mode 1,
      //    but the lens and the pitch are mode 1's from the first owned frame.
      const ownerAz = azExt || p.azimuth !== lastPAz;
      if (ownNow && !wasOwned && mode === 2 && !flyNow) {
        if (!ownerAz) handYawBack();
        occYaw = 0; whReset();                     // owned: no whiskers (§2); the owner's aim, or the bearing kept above
        if (snapFresh && !cine) api.snap();
        else {
          modeFov = fovGoalMode(); pitchBase = 0;
          if (cam.fov !== modeFov) { cam.fov = modeFov; cam.updateProjectionMatrix(); }
        }
      }
      azExt = false; snapFresh = false;
      // Landed: modes 1/3 (and owned mode 2) keep the lens behind the machine
      // instead of whipping back to the pre-flight azimuth.
      if (wasFlying && !flyNow && !follow()) handYawBack();
      wasOwned = ownNow; wasFlying = flyNow;
      // the pin lets go once he has walked PIN_WALK u from where it was set (live play only, §6.1)
      if (pinned && !ctx.shot && pl?.position && Math.hypot(pl.position.x - pinX, pl.position.z - pinZ) >= PIN_WALK) pinned = false;
      // the local collider list (§4.6): occlude() and the whiskers read it; every LOCAL_EVERY s
      localT -= dt;
      if (localT <= 0) { localT = LOCAL_EVERY; refreshLocal(); }
      manualT += dt;
      readAxis(inp);
      // the path under his feet, once a frame: path alignment (tether) and the lead's anticipation read it
      if (pl?.position && pl.velocity) pathAt(pl.position.x, pl.position.z, pl.velocity.x, pl.velocity.z); else pathHit.on = false;

      // E is also "interact"; only rotate when nothing is in interaction range.
      // Q/E and drag rotate the tether in mode 2 (and while flying), p.azimuth otherwise.
      const busyE = !!ctx.systems.interaction?.nearest?.();
      // V (§3): tap = recentre, hold = look. While the look is on it owns the mouse, Q/E, the wheel and WASD.
      const looking = lookInput(dt, inp, pl, busyE);
      if (!looking) {
        if (inp.pressed.has('KeyQ')) turnStep(+STEP, tOn);
        if (inp.pressed.has('KeyE') && !busyE) turnStep(-STEP, tOn);
        if (inp.wheel) { p.distance = clamp(p.distance + inp.wheel * 0.035, p.minDist, p.maxDist); }
        // Drag orbits while ANY button is held: left sets pointer.down, right/middle
        // set pointer.orbit (input contract v3, CAMERA_SPEC §6.2); touch writes either.
        const orbiting = inp.pointer.down || inp.pointer.orbit;
        if (orbiting && inp.pointer.dragDX) {
          if (tOn) { whiskerBake(); orbitNow -= inp.pointer.dragDX * 0.006; manualT = 0; alignK = 0; recOn = false; }
          else { p.azimuth -= inp.pointer.dragDX * 0.006; azFrom = azTo = p.azimuth; azT = 1; }
        }
        if (orbiting && inp.pointer.dragDY) { p.elevation = clamp(p.elevation - inp.pointer.dragDY * 0.004, p.minElev, p.maxElev); if (tOn) { manualT = 0; alignK = 0; } }
      }

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
      // FOLLOW / flying: the tether (§4.2). It never writes p.azimuth — that
      // re-tripped cave.js's manual-turn detector every frame.
      tetherAuto = 0;
      if (tOn) cur.azimuth = tether(dt, pl);
      else if (azT < 1) {
        // eased 45° snap (falls back to damping for drag / external setParams)
        azT = Math.min(1, azT + dt / azDur); cur.azimuth = lerpAngle(azFrom, azTo, ease(azT)); if (azT >= 1) p.azimuth = azTo;
      } else cur.azimuth = lerpAngle(cur.azimuth, p.azimuth, 1 - Math.exp(-7 * dt));
      cur.elevation = damp(cur.elevation, goalElev(), 6, dt);
      cur.distance = damp(cur.distance, goalDistNow(), 5, dt);

      // ── clear-side whiskers (§4.4): mode 2 proper, on foot, not pinned; frozen while looking ──
      // (read against last frame's aim and lens: the sweep's reading they arm on is last frame's too)
      if (!(follow() && !pinned && pl?.position)) { if (occYaw !== 0 || wGoal !== 0 || wOn) whiskerBake(); wOn = false; }
      else if (!lookLive) {
        const held = vPend || ((inp.pointer.down || inp.pointer.orbit) && !!(inp.pointer.dragDX || inp.pointer.dragDY));
        whiskerStep(dt, pl.position, cur.elevation + tiltNow + densEl + occLift + terrainLift, Math.min(cur.distance + densDist, occDist), target, held);
      }
      // mode 1 gets a hint instead (§4.4): the chip pulses the Q or E keycap
      hintStep(dt, pl, busyE);

      // ── density (§4.5): the 4 Hz sight fan → dK; forced 0 in mode 3, owned, flying, under a shot, pinned;
      // frozen while looking. The distance response is here (≤ 2.5 u/s); the elevation one shares the
      // automatic-elevation budget with the occlusion tilt and the terrain lift, after the ladder (A10).
      if (!lookLive) {
        if (densOff()) { dK = 0; dKheld = 0; densT = 0; }
        else {
          densT -= dt;
          if (densT <= 0) { densT = DENS_EVERY; densRead(); }
          dK = damp(dK, dKheld, p.densityRate, dt);
        }
        densDist += clamp(densDistGoal() - densDist, -DENS_DIST_RATE * dt, DENS_DIST_RATE * dt);
      }

      // ── movement basis (§4.3) ───────────────────────────────────────────
      // While a movement key (or the stick) is held, controlAzimuth chases the
      // view at basisRate: tether swings (≤ 0.6 rad/s) pass straight through, a
      // Q/E or a fast drag bends the heading over ~0.9 s instead of jerking it.
      const viewAz = wrap(cur.azimuth + occYaw);
      if (axNow.active) ctrlAz = wrap(ctrlAz + clamp(wrap(viewAz - ctrlAz), -p.basisRate * dt, p.basisRate * dt));
      else ctrlAz = viewAz;

      // ── per-mode lens + pitch (§2) ──────────────────────────────────────
      // A mode change eases the FOV at λ5, ≤ fovRate °/s; the take-off does not
      // (flyer.js takes the camera over unless it reads ≥ 33° at 0.6 s).
      // …and the V look eases to its own lens (lookFovLook, lookFovVeh on a vehicle), capped the same way
      const fg = lookOn ? (lookVeh ? p.lookFovVeh : p.lookFovLook) : fovGoalMode();
      if (flyNow && !lookLive) modeFov = damp(modeFov, fg, FLY_FOV_L, dt);
      else { const nf = damp(modeFov, fg, 5, dt); modeFov += clamp(nf - modeFov, -p.fovRate * dt, p.fovRate * dt); }
      pitchBase = damp(pitchBase, pitchGoal(), 5, dt);
      baseDistNow = baseDist();
      tiltNow = flyNow ? 0 : tiltFor(baseDistNow);

      // ── dead-zone follow with the lead (§4.1) ───────────────────────────
      // The dead zone is an ellipse in camera space: dzW across the screen, deadZoneDepth × that
      // along it (screen-up); the target chases whatever the aim point leaves outside it.
      updateLead(dt, pl, viewAz);
      desiredTarget(tmp);
      const dzW = Math.max(1e-4, p.deadZone * frameScale() * (1 - 0.75 * Math.min(1, sp / 6)));
      const dzD = Math.max(1e-4, dzW * p.deadZoneDepth);
      const dx = tmp.x - target.x, dz2 = tmp.z - target.z;
      const sa = Math.sin(viewAz), ca = Math.cos(viewAz);
      const eDz = Math.hypot((dx * ca - dz2 * sa) / dzW, (dx * sa + dz2 * ca) / dzD);   // R·d / dzW, F·d / dzD
      const chase = 6.5 + Math.min(1, sp / 6) * 5;
      if (lookOn) {                               // looking (§3): no dead zone, the aim is chased as it is
        target.x = damp(target.x, tmp.x, chase, dt);
        target.z = damp(target.z, tmp.z, chase, dt);
      } else if (eDz > 1) {
        const k = 1 - 1 / eDz;
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
      // (and the V look outranks it, §2 "L … suppressed while looking")
      const wantLook = (!cine && !ctx.state.paused && inp.down('KeyL') && !lookOn && vLookK < 0.05) ? 1 : 0;
      lookK = damp(lookK, wantLook, wantLook > lookK ? 5.5 : 3.2, dt);

      // ── compose final view (+ look-up, + cinematic blend) ───────────────
      // The mode's pitch goes in BEFORE the blends, so the look-up and a shot
      // lerp it toward their own pitch exactly as they do the rest.
      let az = cur.azimuth + occYaw, el = cur.elevation + brEl + tiltNow, dist = cur.distance + densDist + brDist;
      let fovGoal = modeFov, pitch = pitchBase, holdAng = 0, keepM = 1;   // keepM: the mode pitch's share after the blends
      tmp.copy(target);
      const az0 = az, el0 = el, dist0 = dist;     // the gameplay framing, before any look offset
      if (lookLive) {
        // THE V LOOK (§3): its yaw on top of the view's (never into cur / p / controlAzimuth), the framing
        // lift (on foot) then its own pitch — which may not push the final elevation out of 0.26..1.25 —
        // the zoom, and the look point: the aim + the pan, riding the ground under it (groundInfo h + 1.15;
        // blended in over the first 4 u so the pan starts from the aim, not from a step)
        az += lookYaw;
        const base = el + (lookVeh ? 0 : p.lookElevLook * vLookK);
        lookEl = clamp(lookEl, Math.min(0, LOOK_EL_MIN - base), Math.max(0, LOOK_EL_MAX - base));
        el = base + lookEl;
        if (lookZoom !== 0) dist *= Math.exp(lookZoom);
        const r = Math.hypot(panX, panZ);
        if (r > 1e-4) {
          const gy = groundH(target.x + panX, target.z + panZ);
          lookGY = lookGY === lookGY && !lookHook ? damp(lookGY, gy, 10, dt) : gy;
          tmp.x += panX; tmp.z += panZ;
          tmp.y += smoothstep(0, 4, r) * (lookGY + 1.15 - target.y);
        } else lookGY = NaN;
      }
      if (lookK > 0.002) {
        el = lerp(el, p.lookElev, lookK);
        fovGoal = lerp(fovGoal, p.lookFov, lookK);
        pitch = lerp(pitch, p.lookPitch, lookK); keepM *= 1 - lookK;
      }
      cineW = 0;
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
          cineW = w;
          az -= occYaw * w;                        // the whisker offset fades out under a shot (§4.4)
          az = lerpAngle(az, o.azimuth ?? az, w);
          el = lerp(el, (o.elevation ?? el), w);
          dist = lerp(dist, o.distance ?? dist, w);
          tmp.lerp(cineTgt, w);
          if (o.fov) fovGoal = lerp(fovGoal, o.fov, w);
          pitch = lerp(pitch, o.pitch ?? 0, w); keepM *= 1 - w;
          if (o.noTilt) holdAng = w;
        }
      }
      // one place owns the lens: the look-up, the shot, or the authored default
      if (Math.abs(cam.fov - fovGoal) > 1e-3) { cam.fov = fovGoal; cam.updateProjectionMatrix(); }

      // big props must not sit between us and the visitor — pull the lens in, or
      // tip up and look over what the lens cannot get in front of. Two sources:
      // the cheap per-frame collider cylinders, and the capsule sweep's real
      // triangle hits (whichever asks for more, gets it).
      // While LOOKING — and until the way home is over (lookLive) — the ladder holds still (§3: the look lens
      // frames the look point, not the framing the ladder serves): the lens is never dollied (occDist rides the
      // look distance 1:1 — its zoom and its λ lookOut return — less any dolly the look began on, released at
      // λ3.5) nor tilted (occLift held), and the sweep's latches are put back after each sweep;
      // the window, the cull and the fades still read it. The collider pass is skipped while the look is on
      // (its sight line runs to the look point, not to him) and feeds only the window's trigger on the way
      // home. Holding through the return matters: a look that took him off screen shut the window, and a
      // ladder let go before the window has re-read the frame tilts over what the window would have opened.
      // On the way home the collider pass and the sweep read the framing the look returns to (az0/el0/dist0 on
      // the target), not the half-returned lens: that is the framing the ladder and the window serve.
      const ladHold = lookLive, lookBack = lookLive && !lookOn;
      // (density's elevation is part of the framing's elevation, §2: the collider pass measures from it)
      const elD = densEl * (1 - cineW);
      const want = lookOn ? occOut
        : lookBack ? occlude(target, az0, el0 + elD, dist0, Math.min(dist0, occDist))
          : occlude(tmp, az, el + elD, dist, Math.min(dist, occDist));   // occDist: where the lens stood last frame
      if (lookOn) { occOut.dist = dist; occOut.lift = 0; occOut.trig = false; }
      colRun = want.trig ? colRun + 1 : 0;       // the window's collider trigger needs two frames running
      if (!colRun) colSweeps = 0;
      // THE LADDER AS A SENSOR (§5.2). While the window carries the frame (open, or opening) the lens holds
      // still: occDist releases to the stop at λ3.5 and the tilt unwinds. Otherwise the sweep's dolly / tilt act
      // on UNPATCHED blockers only; the collider pass tilts (≤ colLiftMax) but — a guess that cannot tell a
      // patched wall from an unpatched one — only dollies alongside a dolly / tilt the sweep is running (colAssist()).
      winCarry = carries(holdAng);
      const colOk = colAssist();
      if (ladHold) {
        // nothing dollies during a look: the lens distance IS the look's (a zoom-out or the return after a
        // zoom-in would otherwise trail at the dolly's λ3.5 release), bar the share a dolly held back when the
        // look began — measured against the gameplay distance (dist0), not the look's, so a look({zoom}) is
        // not mistaken for a dolly — which releases at that same λ3.5 while the look is on, so the lens never
        // pops out. On the way home that share comes back with the look's own offsets (vLookK: λ lookOut after
        // a release, the lookEndT ease after a key) toward the dolly the returning framing wants (az0/el0/dist0
        // on the target: the collider pass and the sweep read exactly that framing here), so when the look ends
        // the lens already stands where the dolly holds it (no undollied hold, no λ16 pop-in after).
        if (!ladHeld) { ladHoldR = dist0 > 1e-6 ? Math.min(1, occDist / dist0) : 1; if (!lookOn) ladRelR = ladHoldR; }
        if (lookOn) ladHoldR = damp(ladHoldR, 1, 3.5, dt);
        else {
          const dg = winCarry ? Math.min(dist0, sweepDolly, shellDolly, patchDolly) : Math.min(colOk ? want.dist : dist0, sweepDolly, shellDolly, patchDolly);
          const gR = dist0 > 1e-6 ? clamp(dg / dist0, 0, 1) : 1;
          ladBackG = ladBackG === ladBackG ? damp(ladBackG, gR, gR < ladBackG ? 16 : 3.5, dt) : gR;
          const w = ladRelK > 1e-4 ? clamp(vLookK / ladRelK, 0, 1) : 0;
          ladHoldR = ladBackG + (ladRelR - ladBackG) * w;
        }
        occDist = dist * ladHoldR;
      } else {
        // while the window carries the frame the collider pass's guess lets go, but a dolly the sweep holds for an
        // UNPATCHED blocker (sweepDolly / shellDolly) stays — the window cannot open that one — and so does the spring
        // arm's (patchDolly: a patched mass at the LENS, which the window would only porthole)
        const dollyGoal = winCarry ? Math.min(dist, sweepDolly, shellDolly, patchDolly) : Math.min(colOk ? want.dist : dist, sweepDolly, shellDolly, patchDolly);
        occDist = dollyGoal < occDist ? damp(occDist, dollyGoal, 16, dt) : damp(occDist, dollyGoal, 3.5, dt);
      }
      ladHeld = ladHold;
      const ol0 = occLift;
      if (!ladHold) {
        const liftGoal = winCarry ? 0 : clamp(Math.max(want.lift, sweepLift), 0, liftMaxNow(el));
        // λ5 up / λ2.5 down (§4.8), and never faster than occLiftRate: a fresh 0.06 collider tilt at λ5 alone
        // swings the frame 0.28 rad/s, and A10 caps every automatic elevation at 0.15 rad/s
        const nl = damp(occLift, liftGoal, liftGoal > occLift ? 5 : 2.5, dt);
        occLift += clamp(nl - occLift, -p.occLiftRate * dt, p.occLiftRate * dt);
      }
      // A `noTilt` shot owns its ANGLES: the anti-occlusion lift would swing the
      // authored framing (17° of it) and tip the moon off the top of the frame.
      // The DOLLY still runs — pulling the lens in front of a blocker changes
      // nothing angular, and it is the only thing that keeps a merged district
      // out of the shot.
      // AUTOMATIC ELEVATION (A10: ≤ 0.15 rad/s together): the occlusion tilt moves first (its own occLiftRate cap),
      // then the terrain lift (§4.7: λ3 up / λ1.5 down, ≤ terrainLiftMax) and density's elevation (≤ 0.12 rad/s)
      // share what is left of the same occLiftRate budget. Both hold still while looking, as the ladder does.
      // (net: this frame's signed automatic change so far — the occlusion tilt and the base framing's own
      // automatic ease, e.g. the landmark reveal's tilt or the zone pitch)
      const elBase = cur.elevation + tiltNow + brEl;
      if (!ladHold) {
        const R = p.occLiftRate * dt;
        let net = (occLift - ol0) + (elBasePrev === elBasePrev ? elBase - elBasePrev : 0);
        lensAt(az, el + densEl * (1 - cineW) + occLift * (1 - holdAng), Math.min(dist, occDist), tmp, terrV);
        terrainGoal = pl?.position ? terrainNeed(pl.position, terrV) : 0;
        const nt = damp(terrainLift, terrainGoal, terrainGoal > terrainLift ? 3 : 1.5, dt);
        const dT = elStep(nt - terrainLift, net, R);
        terrainLift += dT; net += dT;
        // density's elevation, inside the mode-2 sky room the occlusion tilt and the terrain lift leave; a drop
        // the sky room forces may run as fast as the lifts that forced it rise (the net change stays in budget)
        const gD = Math.max(0, Math.min(densElGoal(), skyRoom(el) - occLift - terrainLift));
        const cDown = DENS_EL_RATE * dt + Math.max(0, occLift - ol0) + Math.max(0, dT);
        densEl += elStep(clamp(gD - densEl, -cDown, DENS_EL_RATE * dt), net, R);
      }
      elBasePrev = elBase;
      place(az, el + densEl * (1 - cineW) + (occLift + terrainLift) * (1 - holdAng), Math.min(dist, occDist), tmp);

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
        sweepT = 0; sweptNow = true; sweepsDone++;
        // Measure from the UNDOLLIED stop: if the sweep looked from where the
        // dolly already put the lens, the blocker would read as gone and the
        // lens would spring back out, one frame on, one frame off.
        // (…with every automatic lift the lens carries: the occlusion tilt, the terrain lift, density's elevation)
        if (lookBack) { lensAt(az0, el0 + densEl * (1 - cineW) + occLift + terrainLift, dist0, target, idealPos); sweepAim.copy(target); }
        else { lensAt(az, el + densEl * (1 - cineW) + occLift + terrainLift, dist, tmp, idealPos); sweepAim.copy(tmp); }
        lastSweepFrom.copy(idealPos);
        // the look lens's sweeps must not move the ladder's latches (on the way home they read the real framing)
        if (lookOn) ladderSave();
        sweepOcclusion(idealPos, cam.position);
        if (lookOn) ladderRestore();
        applyCull();
        if (colRun) colSweeps++;
      }
      fadeBlockers(dt, cam.position, tmp);
      // the accelerator's queue gets the frame's spare time: none on a sweep frame, BUILD_MS otherwise
      if (accel.pending && !sweptNow) accel.work(BUILD_MS);

      // ── the see-through window's strength (§5.1) ────────────────────────
      // Open (λ cutRise) while a patched mass blocks a body ray (the sweep) or a wall / trunk
      // collider has sat in the sight line two frames running (unless every blocker the sweep
      // sees is uncuttable); hold cutHold s after the last need; close at λ cutFall.
      const cutNeed = p.cut !== 0 && (cutNeedA || colTrigger());
      cutHoldT = cutNeed ? p.cutHold : Math.max(0, cutHoldT - dt);
      const cutGoal = cutHoldT > 0 ? 1 : 0;
      cutKraw = damp(cutKraw, cutGoal, cutGoal > cutKraw ? p.cutRise : p.cutFall, dt);
      if (cutKraw < 1e-4 && cutGoal === 0) cutKraw = 0;
      const growGoal = cutRays >= 2 || cutPlinth ? p.cutGrow : 1;
      cutGrowK = damp(cutGrowK, growGoal, growGoal > cutGrowK ? 8 : 2.5, dt);

      // Aim above the body LAST: the shake and the ground clamp both re-aim
      // with lookAt(), which would quietly undo it.
      pitch += (modePitch(pitchBase, tmp) - pitchBase) * keepM;   // the sky guard, faded like the mode pitch
      if (pitch > 1e-4) cam.rotateX(pitch);

      lastPAz = p.azimuth;
      // listeners (citizens.js's scruff carry) read cam.matrixWorld: make it this
      // frame's, pitch included, not the last render's
      cam.updateMatrixWorld(true);
      // the window's uniforms from this frame's final matrix (a `noTilt` shot's hold shuts it)
      writeCut(cutKraw * (1 - holdAng));
      projectPlayer();                           // playerScreen: the HUD's "you" marker reads it (§6.3)
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
   * Returns { dist, lift, trig } (lift in radians of extra elevation; trig = a wall or trunk collider,
   * padded r ≥ 1.2, enters the sight line more than 1.2 u in front of the aim point, in front of the
   * REAL lens (`lensD`, where the dolly has the lens: a collider it already stands in front of is not
   * in the picture) and under its height guess — the window's collider trigger (b), CAMERA_SPEC §5.1).
   * The object is reused: read it before the next call.
   */
  const occOut = { dist: 0, lift: 0, trig: false };
  function occlude(tgt, az, el, dist, lensD = dist) {
    // the LOCAL list (§4.6: everything within 40 u of him, refreshed every 0.5 s) — same math, ~10× fewer tests
    const cols = dens.local;
    const out = occOut;
    out.dist = dist; out.lift = 0; out.trig = false;
    // the trigger reads the REAL lens: a collider the old dolly has already put the lens in front of is
    // behind the picture (A15: the window exists only while something is in front of him)
    const trigFar = Math.min(dist, lensD) - cam.near;
    if (!cols || !cols.length) return out;
    const ce = Math.cos(el);
    const dx = Math.sin(az) * ce, dz = Math.cos(az) * ce, dy = Math.sin(el);
    const a = dx * dx + dz * dz;
    if (a < 1e-5) return out;
    // A collider's height is top(c) (camera/density.js, CAMERA_SPEC §4.5 — the one rule density, the
    // whiskers and this pass share): Contract-A relative h, a legacy absolute top read conservatively,
    // or a guess (6 u a circle, 8 u a box) where nobody published one. Compared in world y with the sight
    // line, which climbs dy per unit from the aim point (tgt.y). Two fixes:
    //   · DOLLY, for a mass sitting right in front of the lens. The lens may only come in to `floor`
    //     (dollyFloor(): 62% of the goal, never under 14 u outdoors, §5.2), which is what keeps it from
    //     diving into the candy forest to dodge a lollipop stick.
    //   · TILT, for a mass near the player, which the lens can never get in front of (≤ colLiftMax).
    // Dollying is only safe on a steep sight line: near the horizontal, the gap
    // between the player and a blocker is as likely to be the inside of a cat
    // house (walls are geometry, colliders are a few circles) as it is open air.
    // Below that, the tilt is the only fix — and it raises the angle anyway.
    const mayDolly = el > 0.45;
    const floor = dollyFloor();
    let best = dist, lift = 0, trig = false;
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
        // the two slabs, unrolled (no per-box arrays)
        let tmin = -Infinity, tmax = Infinity;
        const sx = hw + 0.4, sz = hd + 0.4;
        if (Math.abs(vx) < 1e-6) { if (px < -sx || px > sx) continue; }
        else { const ta = (-sx - px) / vx, tb = (sx - px) / vx; tmin = Math.max(tmin, Math.min(ta, tb)); tmax = Math.min(tmax, Math.max(ta, tb)); }
        if (Math.abs(vz) < 1e-6) { if (pz < -sz || pz > sz) continue; }
        else { const ta = (-sz - pz) / vz, tb = (sz - pz) / vz; tmin = Math.max(tmin, Math.min(ta, tb)); tmax = Math.min(tmax, Math.max(ta, tb)); }
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
      const trigOk = !trig && r >= 1.2 && t0 > 1.2 && t0 < trigFar;
      if (!trigOk && (t0 <= 1.2 || t0 >= best)) continue;
      const rise = dy * t0;                           // sight-line height at the blocker, over the aim point
      const topRel = dens.top(c) - tgt.y;             // the collider's top, over the aim point
      // the window's collider trigger (b): walls and trunks, never lamp posts or bollards
      if (trigOk && rise < topRel) trig = true;
      if (t0 <= 1.2 || t0 >= best) continue;
      if (mayDolly && r >= 1.2 && t0 - 0.5 >= floor) {
        if (rise < topRel) best = t0 - 0.5;
      } else if (t0 > 2.0 && r >= 1.5) {
        // A mass we cannot get in front of. Its height is often a guess — which is exactly why the tilt is
        // capped at colLiftMax: a false positive costs a slightly steeper frame, never the composition.
        if (rise < topRel) lift = Math.max(lift, clamp(Math.asin(clamp(topRel / t0, -1, 1)) - el, 0, p.colLiftMax));
      }
    }
    out.dist = Math.max(floor, best); out.lift = lift; out.trig = trig;
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
  const shells = [];                // SHELLS (shellable()): { o, bb } — read by their world box, never acted on
  const faded = new Map();          // mesh → { k, orig, mat }  (currently dissolving)
  const clones = new Map();         // mesh → { orig, mat }     (lazy fade material cache)
  const culled = new Map();         // mesh → true              (visible=false, lens inside it)
  const sweepFade = new Set();      // what the last capsule sweep asked to ghost
  const hit = new Set();
  const probes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const seg = new THREE.Vector3(), bc = new THREE.Vector3();
  let candT = 0;

  // ── the see-through window (CAMERA_SPEC §5.1; camera/cutout.js) ────────────
  // Big masses and instanced clouds carry a shader patch that opens a dithered,
  // feathered window around the visitor wherever a patched mass stands in front
  // of him. The sweep tells us when (cutNeed), update() drives cutK and writes the
  // uniforms after the final rotateX, bodyVisibility() reports what it opened.
  const cut = createCutout(ctx, {
    enabled: p.cut !== 0,
    bigDim: () => p.occFadeMaxDim,
    instanceable,
    ghostOf: (o) => { const s = faded.get(o); return s && s.mat && o.material === s.mat ? s.orig : null; },
  });
  // what the sweep saw, sticky per mesh because the triangle budget tests only some candidates per
  // sweep: patched mesh → the body rays it blocked at its last test; the same for unpatched blockers
  const cutHits = new Map(), plainHits = new Map();
  // the sweep's reading of SHELLS (shellable(): big noFade masses): the one its chest ray found in the sight
  // line (QA), and the dolly in front of it when there is room (shellDolly)
  let shellBy = null;
  let shellDolly = Infinity;    // the shells' own dolly (§5.2 rule 2 on their real triangles), this sweep
  const shellHit = new THREE.Vector3();
  // THE SPRING ARM FOR PATCHED MASSES AT THE LENS (polish after the camera A/B; A15 "no near-lens object covering
  // > 15% of a frame"). A cut-able mass in the LENS half of the sight line — a surface with room for the lens in
  // front of it (its dolly distance ≥ the floor) on ≥ 2 body rays — is not the window's to carry: the window
  // cuts a porthole in a roof / hill / wall that still fills 30-80% of the frame (all three critics, 11 of the 14
  // lost pairs). The lens dollies to just in front of the nearest-him such surface (patchDolly), never under the
  // floor; whatever stands nearer him than the floor stays the window's. Sticky per mesh like cutHits (the
  // triangle budget reaches some candidates only every few sweeps), dropped with the broad phase, held
  // PATCH_HOLD sweeps after its last reading so a mesh the budget skips does not nod the lens.
  let patchDolly = Infinity, patchHold = 0;
  const nearPatch = new Map(), nearPatchKeep = new Map();
  let pdMin = Infinity;
  const pdMinCb = (v) => { if (v < pdMin) pdMin = v; };
  const dropFarPatch = (v, o) => { if (!nearNow.has(o)) nearPatch.delete(o); };
  const keepPatchCb = (v, o) => { nearPatchKeep.set(o, v); }, backPatchCb = (v, o) => { nearPatch.set(o, v); };
  const nearNow = new Set();
  // main.js emits world:ready once every system has built its meshes and before the first render,
  // so every program compiles once, cut or not; later meshes are decided by refreshCandidates()
  ctx.events.on('world:ready', () => {
    if (!cut.enabled) return;
    clearFades(); clones.clear();              // a ghost cloned before the patch would never be cut
    try { cut.patchAll(); } catch (e) { console.log('[camera/cut] patch pass failed, the window stays shut:', e && e.message); }
    refreshCandidates();
  });
  // …and the sweep's triangle trees are built while the world is still loading (≤ PREBUILD_MS; ~0.3 s for the
  // ~0.8M triangles of both islands on the M1 Pro), whatever is left in update()'s spare time. Queued straight from
  // the scene (not through refreshCandidates(): the candidate lists keep their own schedule, cut or not)
  ctx.events.on('world:ready', () => {
    ctx.scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
      if (sweepable(o) || shellable(o)) accel.want(o);
    });
    accel.work(ctx.shot ? Infinity : PREBUILD_MS);   // (renders and camvis: all of them, whatever the machine)
  });

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
  //   userData.noGhost = never a ghost either, but the see-through window MAY cut it (an owner
  //   that fades or hides its own shells — enterable buildings — and still wants the window)
  function noFade(o) {
    if (o.userData.noFade || o.userData.noGhost) return true;
    if (NEVER_FADE.test(o.name || '')) return true;
    for (let n = o.parent; n; n = n.parent) {
      if (n.userData?.noFade || n.userData?.noGhost) return true;
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
   * A SHELL: a big mass its owner flags userData.noFade (an enterable building that fades or hides its own
   * walls, the docked whale's deck, the shack, the cave's props) — never the visitor, his silhouette or
   * anything noOcclude. sweepable() leaves these out (the sweep must never ghost them), so before §5.2 only the
   * collider pass ever moved the lens for them (to the collider's footprint: into the flared cupcake wall). The
   * sweep now gives them rule 2 on their real triangles and nothing else (never faded, culled, cut or tilted
   * over): the chest ray at the shells whose world box is on the sight line, and a dolly to just in front of the
   * nearest one when there is room (shellDolly, in sweepOcclusion()). Big only (> occFadeMaxDim): a key or a
   * star never counts.
   */
  function shellable(o) {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !noFade(o) || o.userData.noOcclude || o.userData.silhouette) return false;
    if (SKY_GROUND.test(o.name || '')) return false;
    const plg = ctx.systems.player?.group;
    for (let n = o; n; n = n.parent) {
      if (n === plg || n.name === 'sky') return false;
      if (n.userData && (n.userData.noOcclude || n.userData.silhouette)) return false;
    }
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
  function instanceable(o, anyCount = false) {
    if (!o.isInstancedMesh || (!anyCount && !o.count)) return false;
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
    shells.length = 0;
    ctx.scene.traverse((o) => {
      const g = o.geometry;
      if (!o.isMesh || !g) return;
      cut.visit(o);                                // the window's lazy pass: meshes added since world:ready
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
          accel.want(o);
          sweepers.push({
            o, bb, r: bs.radius * sc, maxDim, d: 0,
            tris: ((ix ? ix.count : (pos ? pos.count : 0)) / 3) | 0,
            big: maxDim > p.occFadeMaxDim,
            cullable: maxDim <= p.occCullMax && !isRoof(o),
          });
        }
      } else if (shellable(o)) {
        if (!g.boundingBox) { try { g.computeBoundingBox(); } catch { return; } }
        const bb = g.boundingBox;
        if (bb && Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * worldScale(o) > p.occFadeMaxDim) { shells.push({ o, bb }); accel.want(o); }
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
    return Math.max(hypot3(e[0], e[1], e[2]), hypot3(e[4], e[5], e[6]), hypot3(e[8], e[9], e[10]));
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
    // …and its program key: without it every ghost of a hooked material shares one wrapper's
    // source and the programs collide (CAMERA_SPEC §5.1)
    c.customProgramCacheKey = m.customProgramCacheKey;
    cut.adopt(c, m);                              // a ghost of a cut material is cut too
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
  const rayA = new THREE.Vector3(), rayD = new THREE.Vector3();
  const rightV = new THREE.Vector3(), headV = new THREE.Vector3();
  const tmpBox = new THREE.Box3();
  const rayEnds = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const rayHits = [];
  const blockedRays = [false, false, false, false, false];   // the sweep's per-ray reading (reused)
  const cullNow = new Set();
  const idealPos = new THREE.Vector3();
  const near = [];
  const rayDirs = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const lensRay = new THREE.Vector3();     // the window's confirming ray from the real lens (a dollied lens, see the sweep)
  const rayLens = [0, 0, 0, 0, 0];
  const testedNow = new Set(), fadeNow = new Set();
  const instM = new THREE.Matrix4(), instV = new THREE.Vector3(), sightV = new THREE.Vector3();
  const lensF = new THREE.Vector3();       // the REAL lens's view direction (to the chest), for the window's reading
  const lastSweepFrom = new THREE.Vector3(NaN, 0, 0);   // where update()'s last sweep cast from (occDebug({fromStop}))
  const byOffset = (a, b) => a.d - b.d;    // the broad phase's order (nearest the sight line first), made once
  // THE DOLLY'S UNIT. The lens dollies along stop → AIM (occDist is a distance from the aim point), and the aim
  // runs up to ~8 u ahead of the visitor (the lead, §4.1): a blocker's dolly distance is its distance from the aim
  // along that axis, not from his body — measured from the body, a walk toward the lens left the "dollied" lens
  // behind the very wall it was dollying past. sweepAim = the aim the sweep's stop was placed from (callers set it).
  const sweepAim = new THREE.Vector3(NaN, 0, 0), aimAxis = new THREE.Vector3(), aimFrom = new THREE.Vector3();
  let aimStop = 0;
  /** A point's dolly distance: the aim-to-point distance along the stop → aim axis (set by the sweep). */
  const aimT = (pt) => aimStop - ((pt.x - aimFrom.x) * aimAxis.x + (pt.y - aimFrom.y) * aimAxis.y + (pt.z - aimFrom.z) * aimAxis.z);

  /** Nearest intersection of one candidate with the current ray, or null. */
  function nearestHit(o, far) {
    rayHits.length = 0;
    rc.far = far;
    try { accel.raycast(o, rc, rayHits); } catch { return null; }
    let best = null;
    for (let i = 0; i < rayHits.length; i++) if (!best || rayHits[i].distance < best.distance) best = rayHits[i];
    return best;
  }
  /** View depth of a world point from the real lens (lensF set by the sweep). */
  const lensDepth = (pt, lens) => (pt.x - lens.x) * lensF.x + (pt.y - lens.y) * lensF.y + (pt.z - lens.z) * lensF.z;
  /**
   * The window's reading of one ray (§5.1 (a); A15 "only while something is in front of him"): the
   * nearest hit of the LAST nearestHit() call that lies in front of the REAL lens's near plane. The
   * sweep casts from the undollied stop, so with the old dolly (§5.2, until step 5) the nearest hit
   * can sit behind the lens the frame is drawn from: that mass is not in the picture and must not open
   * the window, but a surface of the same merged mesh further along the ray still may. `h` is that
   * call's nearest hit; when it is already in front (no dolly: always) it is the answer.
   */
  function frontHit(h, lens) {
    if (!h) return null;
    const nr = cam.near;
    if (lensDepth(h.point, lens) > nr) return h;
    let best = null;
    for (let i = 0; i < rayHits.length; i++) {
      const x = rayHits[i];
      if ((!best || x.distance < best.distance) && lensDepth(x.point, lens) > nr) best = x;
    }
    return best;
  }
  /**
   * The window's check of an instance-sphere hit (§5.1 (a)): does body ray k really meet THIS instance's
   * triangles (instM = its matrix), in front of the real lens and as a real blocker? The same CPU geometry
   * bodyVisibility() raycasts. Over INST_CONFIRM_BUDGET triangle tests in one sweep it answers with the
   * sphere (true), as before. The ladder never asks: its sphere logic is unchanged.
   */
  let confirmSpent = 0;
  const instProbe = new THREE.Mesh();
  function instConfirm(o, k, lens) {
    const gm = o.geometry;
    const pos = gm && gm.attributes && gm.attributes.position;
    if (!pos) return true;
    const tris = (gm.index ? gm.index.count : pos.count) / 3;
    if (confirmSpent + tris > INST_CONFIRM_BUDGET) return true;
    confirmSpent += tris;
    instProbe.geometry = gm; instProbe.material = o.material;
    instProbe.matrixWorld.multiplyMatrices(o.matrixWorld, instM);
    rc.set(rayA, rayDirs[k]); rc.near = 0.05; rc.far = rayLens[k] - 0.2;
    rayHits.length = 0;
    try { accel.raycast(instProbe, rc, rayHits); } catch { return true; }
    let best = null;
    for (let i = 0; i < rayHits.length; i++) {
      const x = rayHits[i];
      if ((!best || x.distance < best.distance) && lensDepth(x.point, lens) > cam.near) best = x;
    }
    return !!best && realBlocker(best, rayEnds[k]);
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

  /** Is every ancestor visible (is this mesh drawn at all)? */
  function shownTree(o) { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; }
  /**
   * The collider trigger (§5.1 (b)): a wall / trunk collider in the sight line two frames running
   * opens the window before the 6 Hz sweep can look. It is only a guess (colliders carry no mesh and
   * mostly no height), so the sweep has the last word: suppressed while every blocker the sweep sees
   * is uncuttable (the spec's rule), and — "driven by real blockage" — once a sweep since the trigger
   * began has found every body ray clear (a tall collider beside the sight line, not in front of him).
   */
  const colTrigger = () => colRun >= 2 && !cutAllPlain && !(colSweeps >= 1 && cutSweepClear);
  /**
   * §5.2 "runs only while cutK < 0.5": the window carries the frame — open (cutK ≥ 0.5), or opening (a need
   * within the last cutHold s: without this the lens would dip for the four frames the window takes to reach
   * 0.5, then creep back at λ3.5) — and it is cutting something: the sweep's window reading holds a blocker
   * (a collider false start the sweep has already found clear, open for its 0.6 s, must not nod the lens).
   * Never with the cut off, with the visitor off screen (last frame's window), or while a noTilt shot holds
   * the window shut (`hold` = holdAng: the dolly then runs, as the shot expects).
   */
  const carries = (hold) => p.cut !== 0 && cutOnScr && hold < 0.5 && !cutSweepClear && (cutKraw * (1 - hold) >= 0.5 || cutHoldT > 0);
  /**
   * May the collider pass DOLLY the lens? It is a guess (colliders carry no mesh and mostly no height), and it
   * cannot tell a patched wall — the window's — from an unpatched one. So with the window on its dolly only
   * adds to what the sweep itself is doing about an UNPATCHED blocker (the sweep's dolly or tilt is live,
   * hysteresis included); a collider the sweep sees nothing behind pulls nothing in (candy_meadow's 31 → 19.2 u
   * dolly is gone, §5.2 "Consequence"), and neither does one for a SHELL (a big noFade mass: the collider's
   * footprint is not the flared cupcake wall above it, and dollying to it pressed the lens into the wall — the
   * shells get their own dolly on real triangles, shellDolly). Its tilt (≤ colLiftMax 0.06) is left to §5.2's
   * own gate (only while the window is shut). In the p.cut 0 fallback the collider pass runs as the old ladder did.
   */
  const colAssist = () => p.cut === 0 || sweepLift > 0 || Number.isFinite(sweepDolly);

  /**
   * Write the window's uniforms for the lens as it now stands (call after the final rotateX and
   * cam.updateMatrixWorld). k = the strength this frame; off screen, free or cut 0 it is 0, and the
   * near-lens band is off with the cut. Sets cutEff (the getter, and what bodyVisibility() reads).
   */
  function writeCut(k) {
    const P = ctx.systems.player?.position;
    if (free || p.cut === 0 || !P) { cut.off(); cutEff = 0; if (free) cutKraw = 0; return; }
    cutO.ry = p.cutRy; cutO.rx = p.cutRx; cutO.featherPx = p.cutFeatherPx; cutO.nearDepthK = p.nearDepthK; cutO.nearMin = p.nearMin; cutO.nearMax = p.nearMax;
    const on = cut.write(cam, P, k, 1, cutGrowK, cutO);
    if (!on) cutKraw = 0;                       // he is off screen: the window shuts, and re-opens from 0
    cutOnScr = on;
    cutEff = on ? k : 0;
  }

  /**
   * The window's reading of the sweep (§5.1 (a), §5.2 classification): cutNeedA when any body ray
   * is blocked by a PATCHED mass or a cut instance cloud standing in front of the REAL lens (frontHit;
   * the sweep casts from the undollied stop); cutRays = how many rays those block (the
   * ellipse grows from 2); cutAllPlain = the sweep sees blockers and none of them is cut-able
   * (noCut / NEVER_FADE / unpatchable / prop-sized), which suppresses the collider trigger (b).
   */
  // (pre-built callbacks: the sweep runs inside update(), and for…of over a Map allocates an iterator)
  let tallyC = 0, tallyU = 0;
  const unfadeTested = (o) => { if (testedNow.has(o) && !fadeNow.has(o)) sweepFade.delete(o); };
  const fadeAdd = (o) => { sweepFade.add(o); };
  const orCut = (v) => { tallyC |= v; }, orPlain = (v) => { tallyU |= v; };
  const dropFarCut = (v, o) => { if (!nearNow.has(o)) cutHits.delete(o); };
  const dropFarPlain = (v, o) => { if (!nearNow.has(o)) plainHits.delete(o); };
  let lastInstCut = 0, lastInstPlain = 0;   // the last tally's instance bits (cutState, QA only)
  function cutTally(instCut, instPlain) {
    lastInstCut = instCut; lastInstPlain = instPlain;
    tallyC = instCut; tallyU = instPlain;
    cutHits.forEach(orCut); plainHits.forEach(orPlain);
    const cm = tallyC & WIN_MASK, um = tallyU & WIN_MASK;
    cutPlinth = (tallyC & PLINTH_BIT) !== 0;
    cutNeedA = cm !== 0;
    cutSweepClear = cm === 0 && um === 0;
    let n = 0; for (let m = cm; m; m >>>= 1) n += m & 1;
    cutRays = n;
    cutAllPlain = cm === 0 && um !== 0;
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
    if (!pl || (!sweepers.length && !insts.length)) { sweepFade.clear(); occBlocked = 0; sweepLift = 0; lastDolly = Infinity; cutHits.clear(); plainHits.clear(); nearPatch.clear(); patchDolly = Infinity; patchHold = 0; cutTally(0, 0); return 0; }

    // the dolly offset: how much nearer the real lens is than the rays' origin
    const lensBack = fromPos.distanceTo(lensPos);
    headV.set(pl.x, pl.y + p.occHead, pl.z);
    rayA.copy(fromPos);
    rayD.subVectors(headV, rayA);
    const segLen = rayD.length();
    if (segLen < 1e-3) { occBlocked = 0; return 0; }
    rayD.divideScalar(segLen);
    // the dolly axis (stop → aim); no aim known (a caller that set none): the sight line to the head
    aimFrom.copy(fromPos);
    if (Number.isFinite(sweepAim.x)) { aimAxis.subVectors(sweepAim, fromPos); aimStop = aimAxis.length(); }
    else aimStop = 0;
    if (aimStop > 1e-3) aimAxis.divideScalar(aimStop); else { aimAxis.copy(rayD); aimStop = segLen; }
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
    // the window only reads what the REAL lens has in front of it (frontHit)
    lensF.subVectors(rayEnds[1], lensPos);
    const lfl = lensF.length();
    if (lfl > 1e-4) lensF.divideScalar(lfl); else lensF.copy(rayD);

    // Broad phase once for the whole bundle: bounding sphere vs the centre
    // segment, padded by the capsule radius plus the body spread.
    const pad0 = p.occRadius + 0.9;
    near.length = 0;
    nearNow.clear();
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
      // (a mesh the rays cannot reach any more blocks nothing: a ghost the sweep asked for lets go here, where
      // before it waited to be tested again — never, once he had walked away from it)
      if (sd > r * r) { sweepFade.delete(o); continue; }
      // rule 0 — the lens is inside a room-sized mesh: cull it outright
      if (s.cullable) {
        tmpBox.copy(s.bb).applyMatrix4(o.matrixWorld).expandByScalar(0.35);
        if (tmpBox.containsPoint(lensPos)) { cullNow.add(o); continue; }
      }
      // the bundle can only meet a mesh inside its world bounding box (Mesh.raycast rejects on it too): a merged
      // district's sphere is ~100 u across and passes the test above from half the island, its box padded by the
      // bundle's spread does not — so the triangle budget goes to meshes the rays can actually hit (a mass at the
      // lens used to wait 4-5 sweeps behind district spheres for its turn)
      tmpBox.copy(s.bb).applyMatrix4(o.matrixWorld).expandByScalar(BUNDLE_PAD);
      if (!segBox(rayA, headV, tmpBox) && !segBox(rayA, rayEnds[2], tmpBox)) { sweepFade.delete(o); continue; }
      s.d = sd;
      near.push(s);
      nearNow.add(o);
    }
    // nearest the sight line first: those are the ones that actually hide him
    near.sort(byOffset);
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
    const blockedRay = blockedRays; blockedRay.fill(false);
    let needTilt = false, dollyBest = Infinity, lastResort = Infinity;
    let plinthNear = false, instHit = false;      // the two round-4 escalations (UNPATCHED blockers only)
    // §5.2: with the window on, a patched hit is the window's (blocked, cutNeed; never faded, dollied or tilted)
    // and the ladder only moves the lens for what the window cannot open; p.cut 0 = the old ladder
    const cutOn = p.cut !== 0;
    const floor = dollyFloor();
    const pFloor = dollyFloor(p.patchDollyFloor);    // the spring arm's (patched masses at the lens)
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
      if (accel.pending && !accel.ready(o)) accel.urgent(o);   // raycast by three this time; its tree comes next
      testedNow.add(o);
      if (log) log.push({ n: o.name || o.type, tested: 1, tris: s.tris, rays: nRays, off: +Math.sqrt(s.d).toFixed(1), d: 9999 });
      let cm = 0, um = 0;                      // body rays this mesh blocks: as a cut-able mass / not
      let pm = 0;                              // PLINTH_BIT: a patched plinth right at the lens (grows the window)
      let pdN = 0, pdBest = Infinity;          // the spring arm: rays with a patched surface the lens can stand in front of
      let conf = 0;                            // window rays to confirm from the real lens (the lens is dollied)
      // the window reads DRAWN blockers only: an interior shell inside a hidden group (candy
      // architecture hides a building's inner group until you enter) is raycast by the ladder
      // below but draws nothing, so it must not open the window
      const drawn = shownTree(o);
      // …and neither does the ladder: an undrawn mesh hides nothing (§5.2, the ladder as a sensor)
      if (!drawn) { cutHits.delete(o); plainHits.delete(o); nearPatch.delete(o); continue; }
      for (let k = 0; k < nRays; k++) {
        const L = rayLens[k];
        if (L < 1e-3) continue;
        rc.set(rayA, rayDirs[k]);
        rc.near = 0.05;
        const h = nearestHit(o, L - 0.2);
        // the window's reading: the nearest hit in front of the REAL lens (a mass the old dolly has already
        // put the lens in front of is not in the picture; the ladder below still reads `h`, untouched)
        const hc = drawn ? frontHit(h, lensPos) : null;
        if (hc && k < WIN_RAYS && realBlocker(hc, rayEnds[k])) {
          // a dollied lens (the spring arm makes that common) does not look along the stop's ray: a surface that
          // ray grazes just in front of the lens can miss the lens's own line to him, and the window would open
          // on nothing (A15). Such a reading is confirmed from the real lens below, after this ray's other uses
          if (lensBack > WIN_CONFIRM_BACK) conf |= 1 << k;
          else if (cut.isPatchedHit(hc)) cm |= 1 << k; else um |= 1 << k;
        }
        if (log && h) {
          log.push({
            n: o.name || o.type, ray: k, d: +h.distance.toFixed(1), dPlayer: +(L - h.distance).toFixed(1), dAim: +aimT(h.point).toFixed(1),
            aboveGround: +(h.point.y - world.height(h.point.x, h.point.z)).toFixed(2),
            maxDim: +s.maxDim.toFixed(1), big: s.big, real: realBlocker(h, rayEnds[k]),
            lensDepth: +lensDepth(h.point, lensPos).toFixed(1), window: hc ? (hc === h ? 'this' : 'further ' + hc.distance.toFixed(1)) : 'none',
          });
        }
        if (!realBlocker(h, rayEnds[k])) continue;
        // A PLINTH / TERRAIN MASS right under the lens (the giant cupcake's plinth: a featureless wall 8 units
        // from the lens and 30 across). Name it or measure it.
        const plinth = h.distance - lensBack <= p.occPlinthNear && (PLINTH.test(o.name || '') || s.maxDim > p.occFadeLastDim);
        // §5.2 classification — a hit on a PATCHED mesh: blocked (raw), the window's to open (cutNeed, via the
        // window's reading above), never faded, dollied or tilted; a patched plinth only grows the window (rule 6)
        if (cutOn && cut.isPatchedHit(h)) {
          blockedRay[k] = true; if (plinth) pm = PLINTH_BIT;
          // the spring arm: every surface of this mesh on the ray (nearestHit() left them in rayHits) that leaves
          // the lens room in front of it; the one nearest him decides (the lens must clear all of them)
          // (hysteresis: a mass already holding the arm keeps it with PATCH_SLACK u less room — a surface right at
          // the floor flickered in and out of room with the idle breathing, and the lens pumped 17 ↔ 21 u; the lens
          // then stands at the floor, a hair behind that surface, where the near-lens clip has already taken it)
          const fl = nearPatch.has(o) ? pFloor - PATCH_SLACK : pFloor;
          let pd = Infinity;
          for (let j = 0; j < rayHits.length; j++) {
            const x = rayHits[j];
            if (!realBlocker(x, rayEnds[k]) || !cut.isPatchedHit(x)) continue;
            const dA = aimT(x.point) - 0.7;
            if (dA >= fl && dA < pd) pd = dA;
          }
          if (pd < Infinity) { pdN++; if (pd < pdBest) pdBest = pd; }
          continue;
        }
        // rule 1 — fade: an unpatched prop-sized mesh. (The old "district within occNearLens of the lens" ghost,
        // 1b, runs only in the p.cut 0 fallback: with the window on, the near-lens dither does that job.)
        if ((!s.big || (!cutOn && h.distance - lensBack <= p.occNearLens)) && !noFade(o)) { fadeNow.add(o); continue; }
        // rules 2 / 3 — an UNPATCHED mass we must move around (noCut / noFade / NEVER_FADE / unpatchable)
        blockedRay[k] = true;
        const dPlayer = L - h.distance;        // how far in front of the visitor it sits
        const dAim = aimT(h.point);            // …and the dolly distance that puts the lens just in front of it
        // an unpatched plinth unlocks the taller tilt (occLiftPlinth) and forces the dolly to its floor
        if (plinth) {
          plinthNear = true;
          lastResort = Math.min(lastResort, Math.max(floor, dAim - 0.6));
        }
        if (dAim - 0.7 >= floor) { dollyBest = Math.min(dollyBest, dAim - 0.7); continue; }
        // Nothing in front of it to dolly to. p.cut 0 fallback only: if the tilt has already been tried here
        // and did not work (see giveUp below), ghosting the mass is the last thing left — allowed for a
        // building or a facility shell, never for an island-wide merge. With the window on there is no give-up.
        if (!cutOn && giveUp && s.maxDim <= p.occFadeLastDim && !noFade(o)) { fadeNow.add(o); blockedRay[k] = false; continue; }
        needTilt = true;
        if (dPlayer >= 4) lastResort = Math.min(lastResort, dAim - 0.7);
      }
      // the window's reading from the REAL lens, for the rays the stop's reading put in front of it (dollied lens)
      for (let k = 0; conf && k < WIN_RAYS; k++) {
        if (!(conf & (1 << k))) continue;
        conf &= ~(1 << k);
        lensRay.subVectors(rayEnds[k], lensPos);
        const Lr = lensRay.length();
        if (Lr < 1e-3) continue;
        lensRay.divideScalar(Lr);
        rc.set(lensPos, lensRay); rc.near = cam.near;
        spent += Math.max(1, s.tris);
        const hr = nearestHit(o, Lr - 0.2);
        if (hr && realBlocker(hr, rayEnds[k])) { if (cut.isPatchedHit(hr)) cm |= 1 << k; else um |= 1 << k; }
      }
      if (cm || pm) cutHits.set(o, cm | pm); else cutHits.delete(o);
      if (um) plainHits.set(o, um); else plainHits.delete(o);
      if (pdN >= 2) nearPatch.set(o, pdBest); else nearPatch.delete(o);
    }
    // a mesh the broad phase no longer puts near the sight line (or that is culled / hidden) blocks nothing
    cutHits.forEach(dropFarCut); plainHits.forEach(dropFarPlain); nearPatch.forEach(dropFarPatch);
    // the spring arm's dolly: the deepest any patched mass at the lens asks for, never under the floor
    pdMin = Infinity; nearPatch.forEach(pdMinCb);
    if (cutOn && pdMin < Infinity) { patchDolly = Math.max(pFloor, pdMin); patchHold = PATCH_HOLD; }
    else if (patchHold > 0) patchHold--;
    else patchDolly = Infinity;
    // SHELLS (shellable(): big noFade masses the sweep never fades, culls or cuts). Rule 2 on their REAL
    // triangles, and nothing else: the chest ray from the stop, at every drawn shell whose world box (+0.5 u) the
    // sight line crosses (≤ 16 shells exist, 0-2 near any sight line). Of every shell surface it meets, the one
    // NEAREST HIM decides: when it leaves room in front of it (≥ the floor) the lens may dolly to just in front of
    // it (shellDolly), past all of them; otherwise no dolly at all — stopping between two surfaces (a cupcake's
    // roof and its wall) reveals nothing. No tilt and no forced dolly: a lens pressed against a cupcake it cannot
    // get in front of shows a wall, not the visitor (§5.3 lets him read amber there until the shell is cut-able).
    // With the cut off the old collider pass handles them.
    shellBy = null; shellDolly = Infinity;
    if (cutOn && shells.length && rayLens[1] > 1e-3) {
      const L1 = rayLens[1];
      let farD = -1;
      for (let i = 0; i < shells.length; i++) {
        const o = shells[i].o;
        if (!o.visible || !o.parent || !shownTree(o)) continue;
        tmpBox.copy(shells[i].bb).applyMatrix4(o.matrixWorld).expandByScalar(0.5);
        if (!segBox(rayA, headV, tmpBox)) continue;
        rc.set(rayA, rayDirs[1]); rc.near = 0.05;
        nearestHit(o, L1 - 0.2);                       // fills rayHits with every surface of it on the ray
        for (let j = 0; j < rayHits.length; j++) {
          const h = rayHits[j];
          if (h.distance > farD && realBlocker(h, rayEnds[1])) { farD = h.distance; shellBy = o; shellHit.copy(h.point); }
        }
      }
      if (shellBy) {
        const dA = aimT(shellHit);
        if (dA - 0.7 >= floor) shellDolly = dA - 0.7;
        if (log) log.push({ n: shellBy.name || shellBy.type, shell: 1, d: +farD.toFixed(1), dPlayer: +(L1 - farD).toFixed(1), dAim: +dA.toFixed(1), room: dA - 0.7 >= floor });
      }
    }
    // ── INSTANCED BLOCKERS ────────────────────────────────────────────────
    // The round-3 plaza frame lost the visitor behind a wall of instanced palm
    // fronds that this sweep was not even looking at. Raycasting 2000 instances
    // is out of the question, so each instance is a SPHERE (shrunk by occInstK,
    // because a frond cloud's sphere is mostly air) tested against the sight
    // line. §5.2 rule 5: an instance of a PATCHED cloud is the window's (its own
    // triangles confirm it, cutNeed; it counts toward the grow), never the
    // ladder's; an UNPATCHED cloud's instance is dollied in front of, or tilted
    // over harder (occInstStep) than a solid mesh. ONE round-robin cursor over
    // (cloud, instance) resumes where the last sweep ran out of occInstBudget, so
    // every instance is eventually tested (not just each cloud's first ~2500);
    // it goes round at most once per sweep and closes a cycle each time it
    // passes cloud 0 — the window's instance bits are held over one full cycle
    // (instPrev*), so a blocker the budget reaches only every few sweeps still
    // holds the window open.
    confirmSpent = 0;
    if (insts.length && segLen > 1e-3) {
      sightV.subVectors(headV, rayA);
      const sightL2 = sightV.lengthSq() || 1e-6;
      const iFloor = inNow ? INDOOR_FLOOR : Math.max(p.occDollyMin, goalDist() * p.occInstFloor);
      const iBudget = budget === Infinity ? Infinity : p.occInstBudget;
      const nC = insts.length;
      if (instC >= nC) { instC = 0; instJ = 0; }
      const c0 = instC, j0 = instJ;
      let instSpent = 0, stopC = -1, stopJ = 0;
      for (let n = 0; n <= nC && stopC < 0; n++) {
        const i = (c0 + n) % nC;
        if (n > 0 && i === 0) { instPrevCut = instAccCut; instPrevPlain = instAccPlain; instAccCut = 0; instAccPlain = 0; }
        if (n === nC && j0 === 0) break;                     // back at the start: one full cycle
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
        // the start cloud from j0 on; its first j0 instances close the round
        const jA = n === 0 ? j0 : 0, jB = n === nC ? Math.min(j0, o.count) : o.count;
        const cloudCut = cut.isPatched(o), cloudDrawn = shownTree(o);
        const ladder = !(cutOn && cloudCut);                 // an unpatched cloud (or the cut off): the ladder's
        for (let j = jA; j < jB; j++) {
          if (instSpent >= iBudget) { stopC = i; stopJ = j; break; }
          instSpent++;
          o.getMatrixAt(j, instM);
          const e = instM.elements;
          const isc = Math.max(hypot3(e[0], e[1], e[2]), hypot3(e[4], e[5], e[6]), hypot3(e[8], e[9], e[10]));
          const r = gbs.radius * isc * wsc * p.occInstK;
          if (r < p.occInstMin) continue;
          instV.copy(gbs.center).applyMatrix4(instM).applyMatrix4(o.matrixWorld);
          const rr = r + p.occRadius * 0.6;
          if (segDist2(rayA, headV, instV) > rr * rr) continue;
          const tt = ((instV.x - rayA.x) * sightV.x + (instV.y - rayA.y) * sightV.y + (instV.z - rayA.z) * sightV.z) / sightL2;
          if (tt <= 0.02 || tt >= 0.98) continue;            // beside us, or behind the lens
          const dPlayer = segLen - tt * segLen;
          if (dPlayer < 1.2) continue;                       // the trunk we are standing against
          // the window counts it only when some of it stands in front of the REAL lens (see frontHit), on an
          // axial ray, and when the instance's own triangles confirm what its sphere suggests: a lollipop's
          // sphere (stick + head, r ≈ 5) is mostly air, and the window must not open on air (A15)
          const inPic = cloudDrawn && lensDepth(instV, lensPos) + rr > cam.near;
          for (let k = 0; k < rayEnds.length; k++) {
            if (segDist2(rayA, rayEnds[k], instV) < rr * rr) {
              blockedRay[k] = true;
              if (inPic && k < WIN_RAYS && instConfirm(o, k, lensPos)) { if (cloudCut) instAccCut |= 1 << k; else instAccPlain |= 1 << k; }
            }
          }
          if (log) log.push({ n: (o.name || o.type) + '[inst]', inst: j, d: +(tt * segLen).toFixed(1), dPlayer: +dPlayer.toFixed(1), r: +r.toFixed(2), lensDepth: +lensDepth(instV, lensPos).toFixed(1), window: inPic, ladder });
          if (!ladder) continue;                             // rule 5: the window's, never dollied or tilted
          instHit = true;
          const dAimI = aimT(instV);
          if (dAimI - 0.8 >= iFloor) dollyBest = Math.min(dollyBest, dAimI - 0.8);
          else { needTilt = true; lastResort = Math.min(lastResort, Math.max(iFloor, dAimI - 0.6)); }
        }
      }
      // out of budget: resume there next sweep; a round completed within the budget restarts from cloud 0
      if (stopC >= 0) { instC = stopC; instJ = stopJ; } else { instC = 0; instJ = 0; }
    }
    cutTally(instPrevCut | instAccCut, instPrevPlain | instAccPlain);
    // the tilt is allowed to run taller against a plinth than against a wall
    liftCap = plinthNear ? Math.max(p.occLiftMax, p.occLiftPlinth) : p.occLiftMax;

    // a mesh only stops ghosting once a sweep has actually looked at it again
    sweepFade.forEach(unfadeTested); fadeNow.forEach(fadeAdd);

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
        // GIVE-UP (§5.2 rule 4). With the window on there is none: a tilt at its cap holds there, and the
        // window / the silhouette carry the rest. In the p.cut 0 fallback (the old ladder) a tilt pinned at its
        // cap that STILL leaves him behind the thing relaxes to half the cap, latches until he has walked 3 u
        // away, and the last-resort ghost above takes over.
        if (!cutOn && sweepLift >= liftCap - 1e-6 && ++liftMaxRun >= 2) {
          giveUp = true; sweepLift = 0.5 * liftCap; giveUpAt.copy(pl);
        }
      }
    } else {
      clearRun++; liftMaxRun = 0;
      if (clearRun >= 6) giveUp = false;
      if (moved) { sweepLift = 0; liftAnchor.set(NaN, 0, 0); }
      else if (clearRun >= 6) { sweepLift = Math.max(0, sweepLift - p.occLiftStep); clearRun = 4; }
    }
    // Tilt maxed out and still hidden (an unpatched blocker): the dolly may come in to its floor, never past
    // it (§5.2, A3: max(14, 0.62 × goal) outdoors — a lens in the visitor's pocket is a different game — and
    // INDOOR_FLOOR inside a building). The silhouette pass keeps him visible from there.
    if (needTilt && sweepLift >= liftCap - 1e-6 && Number.isFinite(lastResort)) {
      dollyBest = Math.min(dollyBest, Math.max(floor, lastResort));
    }
    if (Number.isFinite(dollyBest)) dollyBest = Math.max(dollyBest, floor);
    // the dolly gets the same hold, for the same reason
    if (!Number.isFinite(dollyBest) && clearRun < 4) dollyBest = lastDolly;
    lastDolly = dollyBest;
    sweepDolly = dollyBest;
    occMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    return occBlocked;
  }

  /** visible=false while the lens is inside a mesh; restore when it leaves. */
  // (forEach with pre-built callbacks: it runs every sweep, and a spread / for…of allocates)
  const uncull = (v, o) => { if (cullNow.has(o)) return; o.visible = true; culled.delete(o); };
  const cullOne = (o) => {
    if (culled.has(o)) return;
    if (o.visible === false) return;           // somebody else (a roof) already hid it
    const s = faded.get(o);                     // a culled mesh must not keep a ghost material
    if (s) { if (o.material === s.mat) o.material = s.orig; faded.delete(o); }
    o.visible = false; culled.set(o, true);
  };
  function applyCull() {
    culled.forEach(uncull);
    cullNow.forEach(cullOne);
  }
  function clearCull() {
    for (const o of culled.keys()) o.visible = true;
    culled.clear(); cullNow.clear();
  }

  /** Does the segment a→b cross (or start inside) the box? Slab test, no allocation. */
  function segBox(a, b, box) {
    let t0 = 0, t1 = 1;
    for (let ax = 0; ax < 3; ax++) {
      const o = ax === 0 ? a.x : ax === 1 ? a.y : a.z, d = (ax === 0 ? b.x : ax === 1 ? b.y : b.z) - o;
      const lo = ax === 0 ? box.min.x : ax === 1 ? box.min.y : box.min.z, hi = ax === 0 ? box.max.x : ax === 1 ? box.max.y : box.max.z;
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    return true;
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
      const sc = Math.max(hypot3(e[0], e[1], e[2]), hypot3(e[4], e[5], e[6]), hypot3(e[8], e[9], e[10]));
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
    sweepFade.forEach(sweepHit);

    fadeUp = p.fadeTime > 0 ? dt / p.fadeTime : 1;
    fadeDown = p.fadeBack > 0 ? dt / p.fadeBack : 1;
    hit.forEach(fadeIn);
    faded.forEach(fadeOut);
  }
  // fadeBlockers()'s three passes (pre-built callbacks: it runs every frame, and for…of over a Set / Map allocates)
  let fadeUp = 0, fadeDown = 0;
  const sweepHit = (o) => {
    if (!o.parent) { sweepFade.delete(o); return; }        // left the scene
    if (o.visible && !culled.has(o)) hit.add(o);
  };
  const fadeIn = (o) => {
    if (culled.has(o)) return;
    let s = faded.get(o);
    if (!s) { s = { k: 0, orig: o.material, mat: null }; faded.set(o, s); }
    if (o.material !== s.orig && o.material !== s.mat) { s.orig = o.material; s.mat = null; }
    if (!s.mat) s.mat = ghostFor(o, s.orig);
    if (!s.mat) { faded.delete(o); return; }
    s.k = Math.min(1, s.k + fadeUp);
    setOpacity(s.mat, 1 - (1 - p.fadeOpacity) * s.k);
    o.material = s.mat;
  };
  const fadeOut = (s, o) => {
    if (hit.has(o) && !culled.has(o)) return;
    s.k = Math.max(0, s.k - fadeDown);
    if (s.k < 0.02) { if (o.material === s.mat) o.material = s.orig; faded.delete(o); return; }
    if (s.mat) { setOpacity(s.mat, 1 - (1 - p.fadeOpacity) * s.k); o.material = s.mat; }
  };
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
  /** An eased snap to an absolute azimuth (tap V's recentre in modes 1/3): writes p.azimuth at once. */
  function snapTo(goal) {
    azFrom = cur.azimuth; azTo = wrapNear(azFrom, goal); azT = 0; p.azimuth = azTo;
  }

  // ── night sky moment: when is the visitor free to be shown something? ──────
  /**
   * Inside somebody's building? Each architecture system publishes its own
   * `interiors`; nothing about the shape is promised beyond `inside`, so take
   * an array, a Map, a Set or a plain object and never throw on a system that
   * has not shipped them yet.
   */
  const ARCH = ['candyArchitecture', 'catArchitecture'];
  function indoors() {
    for (let a = 0; a < ARCH.length; a++) {
      let list = ctx.systems[ARCH[a]]?.interiors;
      if (!list) continue;
      // both systems publish arrays (the per-frame case: no allocation); anything else is converted
      if (!Array.isArray(list)) {
        if (list instanceof Map || list instanceof Set) list = [...list.values()];
        else { try { list = Object.values(list); } catch { continue; } }
      }
      for (let i = 0; i < list.length; i++) { const it = list[i]; if (it && it.inside === true) return true; }
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
  // a teleport ends a look at once (§3), whoever moved him (debug.teleport also snaps)
  // …and clears the pin (§6.1: render.mjs / camvis re-pin exactly the views that carry --el / --dist)
  ctx.events.on('player:teleport', () => { lookReset(); recOn = false; pinned = false; });

  // camMs (§6.4): time update() as main.js calls it. The wrapper only measures; update() itself is unchanged.
  const updateFrame = api.update;
  api.update = function update(dt, c) {
    sweptNow = false;
    const t0 = performance.now();
    updateFrame.call(api, dt, c);
    camMsBuf[camMsI] = performance.now() - t0; camMsSw[camMsI] = sweptNow ? 1 : 0;
    camMsI = (camMsI + 1) % CAM_MS_N; if (camMsN < CAM_MS_N) camMsN++;
  };

  api.snap();
  return api;
}
