# CAMERA_SPEC — Candyland & Cat Island (WAVE 3 camera)

Synthesised 2026-09-22 from four judged designs (genre 123 · authored 122 · readability 110 · incremental 98); **revision 2** (same day) after an adversarial review, see the Review log at the end. Base = **genre**; grafts: cut gated on real blockage + raw/cut-aware QA pair (readability, authored), `moveLock` + `owned()` mute + hop damping + local collider list (authored), static-neutrality check (incremental), edge marker (readability). Dropped: global lens change, authored zone-style table, mode-1 auto-yaw, right-click-tap / double-tap / trackpad-swipe gestures, always-on cut, Ctrl-drag orbit, the timed mode-2 "recentre" spring (the control basis does that job, §4.2).

**Ownership (BRIEF WAVE 3 line 118).** This file lives at `docs/CAMERA_SPEC.md` (the path the BRIEF names). The camera builder edits `src/systems/camera.js`, `src/core/input.js`, `src/systems/ui/hotbar.js`, creates `src/systems/camera/cutout.js`, `src/systems/camera/density.js`, `tools/views/camera.json`, `tools/camvis.mjs`. It does NOT edit ui.js, BRIEF.md, render.mjs, player.js, weapons.js, decal.js, touch.js, citizens.js: §8.4 lists the exact text to hand those owners. Nothing here needs main.js or world.js.

## 1. Goals and acceptance

Ben, verbatim: "we need the camera mode to be much more effective at showing the player as it navigates. Due to the density of the world, it is hard to keep track of the player and see. How can we improve all of the camera perspectives so we can see around better? Can we add a look around feature? can the camera dynamically follow us?"

Measured today (seed probe `tools/_tmp/camprobe.mjs` → `tools/_tmp/camprobe.json`, copied into the repo by the orchestrator, §8.4; `bodyVisibility` = clear body rays / 5, mode 1, shipped framing): mean **0.908** over the 13 gameplay views, 9/13 fully clear, `cat_residential` **0.4**, `cat_plaza` / `cat_park` / `candy_river` 0.8, `occ_silhouette` **0.0**; mode 3 mean 0.985. Mode 2 holding D for 4 s: 2.7 u net over 23.7 u path (a spiral). Only three baseline rows were untouched by the ladder (`occLift = 0`, no dolly): cat_gym, sky_dawn_harbor, candy_forest. Mode 3 is a map view: the body is ≈7% of frame height there, outside the 8-12% band, by design. **Nothing in A1-A15 is measurable until §8 step 0 (camvis + `renders.noindex/camvis/baseline.json`) has landed; it is the first commit and precedes any camera.js edit.**

**Probe set P (15, fixed order):** candy_arrival, cat_arrival, cat_plaza, cat_park, cat_gym, candy_lake, sky_dawn_harbor, candy_village, cat_main_street, cat_residential, candy_forest, candy_meadow, candy_river (tools/views.json) + occ_silhouette, occ_whisker_night (tools/views/player.json). Each at its own view params, run in modes 1, 2 and 3. Per probe camvis does, in this order: `camera.setMode(m)` → `setParams({azimuth: π/4, elevation: 0.64, distance: 31, fov: 30})` (reset, no view has been teleported yet so the pin it sets is about to be cleared) → `player.facing = wrap((view.az ?? π/4) + π)` (so a mode-2 snap lands on the view's own azimuth instead of whatever the previous walk left) → `teleport` (clears the pin, §6.1) → `setCameraParams(view el/dist/az/fov)` only if the view carries any (re-pins) → `setView(null)` → `call` → `walk` → `step(frames)`. Each row records `mode, facing, pinned, occDist, goalDistance, occLift, terrainLift, tilt, densityK, cutK, occYaw`.

Acceptance (all measured by `tools/camvis.mjs`, §8.1; "cut-aware" = `bodyVisibility().visible/total`, "raw" = `.rawVisible/total`):
- A1 Mode 1 over P: cut-aware mean ≥ 0.97, ≥ 13/15 at 1.0, **no probe < 0.8**; `occ_silhouette` ≥ 0.8, `cat_residential` ≥ 0.8.
- A2 Mode 1 raw mean ≥ 0.908 (no worse than today) and no probe more than 0.2 below its baseline. Mode 2 cut-aware mean ≥ 0.95, raw mean ≥ 0.75 and no probe raw < 0.4 (its sight line runs ~8 u through the prop band, §2); mode 3 cut-aware ≥ 0.98; no probe cut-aware < 0.8 in any mode.
- A3 Lens: `occDist ≥ 14` outdoors on every probe, ≥ 5.5 indoors; `culledList` only ever holds meshes ≤ 18 u.
- A4 Mode-2 steering from a snap at (-110,-45) (facing 5π/4, az π/4, 10 settle frames), 120 frames per key: net/path ≥ 0.85 for D, A and S, ≥ 0.95 for W; Σ|Δaz| ≤ 1.6 rad for D/A (pure geometry gives 7 u/s ÷ 20.0 u = 0.35 rad/s → 1.40 rad after the basis transient), ≤ 0.15 rad for S. Mid-walk drag: hold W throughout; on frames 10-25 feed `pointer.orbit = true, dragDX = +262 px` total (a 90° orbit); at 3.0 s |wrap(az − (travelYaw + π))| ≤ 0.1 rad and, after frame 25, no frame's automatic yaw exceeds 1.1 rad/s.
- A5 Basis: mode 1, hold W, press Q at frame 10: heading changes ≤ 0.9 rad/s and facing is within 0.05 rad of the new screen-up by 1.2 s; the visitor never stops.
- A6 Lead: run toward the lens (virtual 0,-1.58, 45 frames, frames 0) at (-110,-45): ground between feet and bottom frame edge along the travel line ≥ 14 u (≈10 today). Running away: ≥ 22 u to the top edge.
- A7 Look: `look({on, yaw 0.6, pan [0,18]})` 1 s + 3 s W-pan at (118,0): visitor moves < 0.05 u, look point ≥ 18 u away and ≤ 40 u; 0.6 s after release az/el within 0.02 rad and dist within 2% of pre-look, the return never exceeds 2.5 rad/s, `controlAzimuth` unchanged, `params.azimuth` unchanged. A V press with no mouse motion leaves `lookYaw == 0` (mdx/mdy are zeroed every frame).
- A8 Recentre: tap V (3 frames) in mode 1 with facing f: `params.azimuth` = 45°-multiple nearest f+π within 0.45 s. Mode 2, from a 90° offset: az within 0.05 rad of f+π within 0.8 s, ≤ 3 rad/s.
- A9 Input: synthetic right-button pointerdown/move/up on the canvas → 0 `weapon:use`, `contextmenu` defaultPrevented, az change = 0.006·dx. Middle-button `mousedown` defaultPrevented. Left click still fires; left held while the right button is pressed and released → `pointer.down` stays true and 0 `weapon:use`. Touch-style writes (`pointer.down = true` + dragDX, and `pointer.orbit = true` + dragDX) both orbit.
- A10 Rate guards on the scripted route R (§8.1) in each mode: auto yaw ≤ 1.1 rad/s (whiskers ≤ 0.5), auto elevation ≤ 0.15 rad/s, FOV ≤ 12°/s, auto yaw **exactly 0** in modes 1 and 3 outside cinematics and not flying.
- A11 Static neutrality (mode 1 only): reference = the `post5` camvis run (§8 step 5, after the ladder re-role, before steps 6-8) for every P view; additionally the pre-edit `baseline` for rows the old ladder never touched (`occDist == goalDist ± 0.01`, `occLift == 0`, `tilt == 0` in the baseline row). Every reference row with vis 1.0, no walk, and `densityK < 0.05`, `cutK == 0`, `terrainLift < 0.01` after the final run matches its reference camera position within 0.05 u, az/el within 0.002 rad, FOV within 0.01°.
- A12 Determinism: two consecutive `snap()` calls give equal `cam.matrixWorld` (1e-6) and equal `cutK`, `occYaw`, `densityK`, `terrainLift`; two camvis runs give identical JSON once the wall-clock fields (`camMs`, `occMs`, `frameMs`, `machine`) are stripped.
- A13 Performance (Ben's MacBook Pro 18,1 / M1 Pro / macOS 15.7, Chrome with hardware GL — not the SwiftShader harness; the JSON records `navigator.userAgent`): over 600 live frames at cat_residential, `camMs` p95 ≤ 1.5 ms on non-sweep frames and ≤ 6 ms on sweep frames (reported separately; the sweep runs at 6 Hz and already costs 2-6 ms, camera.js:105); `render.mjs` frameMs = median of ≥ 5 rendered frames at cat_plaza and candy_village within +10% of the same median on baseline with the cut active; draw calls +0.
- A14 Must-not-break views (§7) render with no PAGEERROR, no `[system X] update error`, no `view call: not a function`.
- A15 Critic frames (§9 views, day + night): the visitor's real body reads at a glance inside a feathered, dithered window that exists only while something is in front of him (in mode 2 inside town cores that is most of the time, and the critic judges it as a follow camera); no whole-district ghosting anywhere; no amber-only visitor except behind terrain, behind a `noCut` landmark or an unpatched mass, within 1 u of the body, or as the feather-band speckle (the same list as §5.3); no near-lens object covering > 15% of a frame; walking frames show more ground ahead of him than behind; mode-2 street frames look down the street axis and contain a sky band ≥ 4% of frame height (the `m2Pitch` of §2); street frames (cat_main_street, candy_village) ≥ 50% facade and ≤ 35% roof; look frames show the lit V chip segment, the caption and the "you" marker/edge chevron.

## 2. The three modes (keys 1/2/3 unchanged)

| | **1 ISO** (default) | **2 FOLLOW** (rebuilt) | **3 TOP** |
|---|---|---|---|
| job | stable authored diorama; **you** own the orientation | see where you are going; swings behind travel | lay of the land in dense places |
| elevation goal | `lerp(p.elevation, min(p.elevation, zoneElev 0.50), zoneK)` (as today) + density | `clamp(mode-1 goal − 0.18, 0.40, 1.12)` = 0.46 at default, 0.40 in town cores | 1.10 |
| distance goal | `p.distance` (31) × (1 + 0.10·dK) | `p.distance × 0.72` (22.3) × (1 + 0.08·dK) | `p.distance × 1.40` (43.4) |
| lens elevation | goal + `tiltFor(baseDist)` + `terrainLift` + `occLift`; `tiltFor(baseDist) = 0` at the wheel default **in every mode** (below) | same | same |
| pitch (after the final lookAt) | 0 | `m2Pitch` 0.12 rad: top frame edge +0.03 rad above horizontal on flat ground, +0.09 rad in town cores (with FOV 42, half-angle 0.3665, lookAt() alone puts the top edge 5.4° BELOW horizontal, so no sky could appear); the body sits ≈16% below frame centre | 0 |
| FOV | `p.fov` (30) | 42 (visitor size within 3% of mode 1) | `p.fov` (30) |
| yaw | player only: Q/E eased 45° (0.42 s), drag; **never auto-yaws** | tether + path alignment + whiskers (§4.2-4.4) | player only |
| lead base (walk / run ×1.2; × frameScale, §4.1) | side 4.0 · toward lens 6.5 · away 3.5 | away 3.0 · side 2.0 · toward 5.0 (×0.72 → 2.2 / 1.4 / 3.6 u) | 3.5 all directions (×1.40 → 4.9 u) |
| density (§4.5) | el +0.14·dK·(1 − zoneK), dist ×(1+0.10·dK) | el +0.20·dK·(1 − zoneK), dist ×(1+0.08·dK) | off |
| landmark reveal | on (unchanged) | on | off |

- **tiltFor is evaluated on the wheel/base distance, never on `cur.distance`:** `baseDist = p.distance + max(0, p.revealDist − p.distance)·revealK`; `el += tiltFor(baseDist)` (camera.js:639 today passes `cur.distance`, so mode 2's 22.3 u would add −0.11 rad and mode 3's 43.4 u +0.026 rad on top of the table). `distRef` is still rebased by `setParams({distance})` (not while `onVehicle || flying`), so `--dist` views stay exact and the landmark reveal keeps its slight tip-down. Mode 3 therefore renders at 1.10 exactly (it loses today's +0.026). Getter `tilt` exposes the value; §7 checks `current.elevation + tilt` against this table.
- Wheel edits `p.distance` (12..88, 0.035 u/px) in every mode; drag-Y edits `p.elevation` (0.26..1.12) in every mode; both persist across modes as today. FOV eases on a mode change at λ5, ≤ 12°/s (today it is instant); `snap()` and `setFree(null)` set `cam.fov` to the current mode's FOV goal directly.
- Q/E: modes 1/3 `startSnap(±45°)` as today (E only when `interaction.nearest()` is null). Mode 2: rotates the tether anchor by ±45° eased 0.42 s (§4.2); no offset that unwinds later. `followOff`/`followOffT`/`followLambda`/`followRecentre` are deleted.
- Drag: `dragDX·0.006` rad, `dragDY·0.004` rad, applied while `pointer.down || pointer.orbit` (§6.2). Modes 1/3 write `p.azimuth` (permanent). Mode 2 rotates the anchor (permanent until path alignment or tap V moves it).
- L (hold): unchanged in all modes (el 0.15, FOV 44, pitch 0.30); suppressed while looking (§3). `m2Pitch` is folded into the same `pitch` variable before the look-up and cinematic blends, so a cinematic lerps it toward its own `pitch ?? 0` exactly as it does `lookPitch`; it is scaled by `(1 − holdAng)` and is 0 while `owned()`.
- 1→2: anchor placed at the current lens bearing, so nothing whips; the camera gets behind you as you walk (the basis bends your heading to the view, §4.3) or at once on tap V. 2→1/3: `setMode` writes `p.azimuth = cur.azimuth + occYaw` once and zeroes `occYaw` (so a live whisker offset is kept, not dropped as a 30° jump). **Mode 2 no longer writes `p.azimuth` every frame** (today camera.js:598, which re-trips cave.js:774's manual-turn detector).
- Mode toasts: 1 "Camera: iso — you turn it (Q/E)", 2 "Camera: follow — turns with you", 3 "Camera: top — lay of the land".
- **owned()** = `indoors() || !!ctx.state.placeOverride || player.onVehicle || player.onFerry || player.locked || ctx.state.ferry`. While owned: density 0, whiskers 0, path alignment off, hop damping off, and **mode 2 renders exactly as mode 1** — mode-1 elevation/distance goals, `p.fov`, pitch 0, yaw from `p.azimuth`, Q/E → `startSnap` — so palace.js's `setParams({distance ≤ 17, elevation ≥ 0.95})`, the cave corridor aim (cave.js:764-778) and cat_in_meow keep their authored framing in either mode. The mode label persists; the tether resumes from `cur.azimuth` when ownership ends. Vehicles/ferry/cinematics keep the mode.
- **Flying (BRIEF Contract E, honoured verbatim).** While `ctx.state.flying` is truthy, every mode uses distance **44** (flat), elevation 0.38, FOV 40, yaw = tether behind the flyer's heading with alignment always on (λ1.2, ≤ 0.9 rad/s); `p.distance` is ignored and `distRef` is not rebased while `onVehicle || flying`. **Handshake with flyer.js:** `cameraCheck()` runs at `airT > 0.6` s and takes the camera over (its own `setParams` 44/0.38/40 + per-frame azimuth) unless `ctx.camera.fov ≥ 33` by then; so the take-off FOV ease is exempt from the 12°/s cap (λ6 uncapped: 39.5° at 0.5 s; **FOV ≥ 38 at 0.5 s** is the §7 check) and `snap()` while flying sets FOV 40 directly (`debugFly` calls `snap()`). Because `cameraCheck()` then returns early, the flyer never pins the camera (§6.1). Returns to the mode framing over 1.0 s after landing.

## 3. LOOK-AROUND: hold V (look), tap V (recentre)

- **Input.** V goes down → timer. Released < 0.18 s with < 6 px of mouse motion → **tap**. Held ≥ 0.18 s, or any mouse motion/drag/pan while down → **look** (`lookK` → 1 at λ9).
- **While looking** (street-level, NOT a map shot; 3 is the map):
  - The visitor stands still: `input.moveLock = 2` every frame (§6.2), so `axis()` and `virtual` read zero for player.js, canoe, flyer, touch. The world keeps running.
  - **Mouse motion, no button:** `lookYaw −= mdx·0.0055`, `lookEl += mdy·0.0035` (clamp final el 0.26..1.25). Any drag does the same. Touch right-thumb drag (dragDX/dragDY) does the same.
  - **WASD / arrows** (`axisRaw()`, or `virtualRaw` when the keyboard axis is idle, so a touch stick pans too): pan the look point in the look basis (az = `cur.azimuth + lookYaw`): 14 u/s, Shift 26 u/s, accel λ8; leash 40 u from the visitor (10 u indoors), speed tapering over the last 8 u; `y = groundInfo(x,z).h + 1.15` (fallback `world.height`). Look aim = `target + pan`.
  - **Q/E:** eased 45° steps on `lookYaw`. E only when nothing is interactable; otherwise E ends the look and interacts.
  - **Wheel:** temporary `lookZoom` (dist × 0.7..1.6). **L:** ignored.
  - Framing: `el += 0.12·lookK` (before drag pitch), FOV eases to 40 (λ5, ≤ 12°/s), lead and dead zone off, density and whiskers frozen at their current value.
  - Cut: ellipse stays centred on the visitor while he projects on screen; `cutK = 0` while he is off screen.
- **Return.** On release, `lookYaw`, `lookEl`, `pan`, `lookZoom` ease to 0 at λ8 (95% in 0.37 s); the yaw return is capped at **2.5 rad/s** (a 1.5 rad look takes ≈0.75 s, no whip-pan on the frame control comes back); FOV back at λ5. `p.azimuth`, `cur.azimuth`, `controlAzimuth` are never written by a look, so WASD means what it meant before.
- **Ends the look immediately (0.25 s ease), then the key acts normally:** Space, C, R, X, Enter, primary click, 1/2/3, E with an interactable in range; and any of: cinematic start, `snap()`, `setFree(v)`, teleport, `ctx.state.paused`, `player.locked` (covers being eaten by Sour Patch Kids, cutscenes, transitions), `onFerry`, `onVehicle`, `flying`.
- **On a vehicle / flying:** V is look-only: mouse orbit into `lookYaw/lookEl`, FOV up to 48, no `moveLock`, no pan; returns on release.
- **Tap V = recentre.** Modes 1/3: `startSnap` to the 45° multiple nearest `facing + π` (writes `p.azimuth`: the cave reads that as a manual turn, which is right). Mode 2: anchor swings to `facing + π` at λ8, ≤ 3 rad/s (the Q/E snap's peak rate). Tap V also clears whiskers and the path-alignment ramp. The chip reveals.
- **Movement basis while looking:** movement is locked, so no rule is needed; on release `controlAzimuth` is already equal to the gameplay azimuth (the look never touched it).
- **Discoverability:** chip gains a 4th segment `V look`, lit while looking, revealed 4 s on any V press; caption row `LOOKING · WASD pan · mouse orbit · wheel zoom · release V` while looking; "you" marker at his projected feet while looking, clamped to the frame edge with a chevron when he is off screen (hotbar.js overlay, §6.3). Teach toast once per session, never under `ctx.shot`: "Lost him? Hold V to look around · 3 = top view", fired when raw blocked ≥ 3/5 for 2 s or `densityK > 0.6` for 5 s. Help-card rows: §8.4.
- **Touch:** a LOOK button that holds `KeyV` in `ctx.input.keys` (request to the touch builder, Contract H pattern); no new input struct.
- Public: `camera.look(o)` (deterministic view/debug hook: `{on, yaw, pitch, pan:[dx,dz], zoom}` sets the look state at `lookK = 1` and holds it until `look({on:false})`), `camera.recentre()`, getter `looking` (0..1), event `camera:look {on}`.

## 4. DYNAMIC FOLLOW

### 4.1 Aim point (all modes)
`aim = feetGround + (0, 1.15 + zoneRise·zoneK + 0.3·hop, 0) + lead`, where `hop = max(0, P.y − groundInfo(P.x,P.z).h)` (30% of a jump reaches the frame; off while owned or on a vehicle: then `aim.y = P.y + 1.15` as today).
- Camera-space split: `F = (−sin az, −cos az)` (up-screen on the ground), `R = (cos az, −sin az)`; `v` = velocity xz, `sp = |v|`, `f = v·F/sp`, `r = v·R/sp`.
- `leadGoal = [F·f·(f ≥ 0 ? leadAway : leadToward) + R·r·leadSide] · s`, `s = smoothstep(0.5, 7, sp) · frameScale · (running ? 1.2 : 1)`, `frameScale = clamp(cur.distance / 31, 0.2, 1.8)` as today. **The §2 table gives BASE values (pre-frameScale)**; the effective lead at each mode's default distance is shown in brackets there. Why toward-lens is largest: at 0.64 the frame shows ~10 u of ground on the lens side against ~22 u away.
- **Path anticipation:** if the visitor is within `width/2 + 2.5` of a `world.PATHS` segment on his island and `|cos(v, tangent)| > 0.6`, rotate `leadGoal`'s direction halfway toward the direction of the path point 10 u ahead along the travel sign (magnitude unchanged). ~60 segments, scanned every frame.
- `lead` damps toward `leadGoal` at λ1.6 while growing, λ0.9 while decaying to zero (the view holds where you were heading ~1 s), λ1.1 on a reversal (`lead·leadGoal < 0`); rate cap 8 u/s.
- Dead zone: ellipse, `0.85·frameScale·(1 − 0.75·min(1, sp/6))` lateral × 0.7 of that in depth (screen-up axis). Chase λ `6.5 + 5·min(1, sp/6)` horizontal, λ4.2 vertical (as today).
- No rest/HUD bias (keeps A11 neutrality).

### 4.2 Mode-2 tether (replaces `followAz()` and camera.js:592-598)
- Ground anchor `A` (xz). Each frame: `Rh = goalDist·cos(goalElev)` (20.0 u at default); `d = A − P`; if `|d| < 0.1` set `d` from the current az; `A = P + d̂·Rh`; `az = atan2(d.x, d.z)` (the lens sits at `tgt + (sin az, ·, cos az)·dist`). Pure geometry: strafing swings the view by `v_lateral/Rh` (≈0.35 rad/s walking, ≈0.55 running, capped 0.6); S pushes the lens straight back with zero yaw.
- **Getting behind you is the control basis's job, not a spring's.** W is camera-relative (§4.3), so once `ctrlAz` has converged velocity = (−sin az, −cos az) and `travelYaw + π ≡ az` by construction: A/D circle-strafe at `v/Rh`, W is already "behind". A timed recentre could only ever act on the basis transient, so there is none; tap V (§3) is the explicit "behind me".
- **Path alignment** is the only automatic yaw goal: with path anticipation active (§4.1) for ≥ 0.5 s of pure-forward input (`ax.y > 0 && |ax.x| < 0.25·ax.y`, real or virtual) at `sp > 1.5`, the tether goal is `lerp(travelYaw + π, tangentYaw + π, pathAlign 0.7) − occYaw` (tangent signed along travel; `− occYaw` so a whisker offset is never baked into `A` and then unwound — `viewAz` includes `occYaw`, §4.3), so the lens hangs over the street behind you. Ramps in over 0.6 s; rotates `A` about `P` at λ1.4, ≤ 1.1 rad/s; releases at once on S, A/D, stop, drag, V, Q/E; waits 1.2 s after any manual orbit; never while standing. It never cancels whiskers.
- Q/E and drag rotate `A` about `P` (eased 0.42 s for Q/E). `snap()` in mode 2 puts `A` at `facing + π` (as `followAz` does today; camvis sets `facing` first, §1). Entering mode 2 sets `A` from the current `cur.azimuth`.

### 4.3 Movement basis: `controlAzimuth` (all modes)
- `basis()` reads `ctrlAz`, not `cur.azimuth`. `viewAz = cur.azimuth + occYaw` (never `lookYaw`, never cinematic yaw, so WASD never flips under the moon shot).
- Movement active (`axisRaw().active || virtualRaw ≠ 0`): `ctrlAz += clamp(wrap(viewAz − ctrlAz), −0.9·dt, +0.9·dt)`. Idle: `ctrlAz = viewAz`. `snap()`, `setFree(null)`, `setMode`: `ctrlAz = viewAz`.
- Effect: tether swings (≤0.6 rad/s) pass through, so circle-strafe feels native; a Q/E or fast drag mid-walk bends the heading over ~0.9 s instead of jerking it into a hedge. Works with analog/touch input (no latch to miss).

### 4.4 Clear-side yaw search ("whiskers"), mode 2 only
- Trigger: the last sweep's **raw** blocked count ≥ 2/5 for ≥ 0.35 s, on foot, `!owned()`, not flying, no V/drag, ≥ 2.5 s since manual camera input.
- Candidates: offsets {0, ±0.26, ±0.52} rad about the tether yaw. One candidate per frame, round robin (full cycle 5 frames). Each: 3 sight lines (hat 1.6, chest 1.05, knees 0.5) from the body to the candidate lens (`lensAt`) against the **local collider list** (§4.6, circles AND boxes): a circle blocks if the line passes within `r + 0.6` in xz at a height below `top(c)`; a box blocks by the same slab test occlude() uses today (camera.js:761-777) below `top(c)`. `top(c)` (§4.5) is world y. Candidate 0 also takes `min(·, 1 − rawBlocked)` from the sweep. `score = clear − 0.30·|off|/0.52 − 0.25·(≠ current)`.
- Switch only when the best beats the current by ≥ 0.25 continuously for 0.8 s and ≥ 2.0 s since the last switch. `occYaw` eases at λ1.5, ≤ 0.5 rad/s, |occYaw| ≤ 0.52; unwinds at λ0.8 once candidate 0 has been clear for 1.5 s. Cancelled only by a manual orbit (drag, Q/E) or tap V — never by path alignment, so whiskers survive a straight walk. Applied as `az += occYaw·(1 − cineW)`.
- Mode 1 gets a **hint, not a yaw**: when raw blocked ≥ 3/5 for 2 s and a ±45° step scores clear, the chip pulses the Q or E keycap for 2 s (at most once per 60 s).

### 4.5 Density (`src/systems/camera/density.js`)
- Spatial hash of `ctx.colliders` **circles** with `r ≥ 0.75` in 8 u cells (boxes excluded on purpose: walls are the cut's job). Rebuilt when `colliders.length` changes (checked in the 4 Hz refresh). It serves density only; occlude() and the whiskers read the local list (§4.6).
- **Collider top, one rule for density, whiskers and occlude():** `h` carries two conventions (player/ground.js:100-110 `classify()`, flyer.js `colTop()`): `h ≤ 1.6` is Contract-A ground-relative (a standable low prop), `1.6 < h < 1e4` is a legacy absolute world-y top, `h ≥ 1e4`/absent = unknown. So `top(c) = h ≤ 1.6 ? g + h : (h < 1e4 ? max(h, g + h) : g + guess)`, `g = world.height(c.x, c.z)`, guess 6 (circle) / 8 (box). `max(h, g + h)` is deliberately conservative for the ambiguous band (over-estimating a top costs a lift; under-estimating loses him). Sight-line heights are compared in world y: `chestY + d·tan(el)`.
- Sight fan at 4 Hz: 5 distances {2, 4, 7, 10, 14} u from the chest toward the lens bearing × 3 bearings {0, ±25°}. A sample is occupied if any circle within `r + 1.5` of it has `top(c)` above the sight-line height. `occ = occupied/15`; `dKgoal = smoothstep(0.10, 0.45, occ)`; the held goal changes only when the new value differs by > 0.12; `dK` damps at λ0.8; responses capped at 0.12 rad/s (el) and 2.5 u/s (dist). The elevation term is scaled by `(1 − zoneK)` (town cores are full of ≥ 0.75 circles; without this dK would put the lens back at 0.64 inside the very ZONES that keep the 0.50 street pitch); the distance term is not. FOV never changes with density.
- Forced 0: mode 3, `owned()`, flying, cinematic, free, `pinned` (§6.1). `snap()` sets `dK` to its goal directly.

### 4.6 Local collider list and `occlude()`
- Every 0.5 s (and in `snap()`): a plain linear scan of `ctx.colliders` for everything — circles of any radius and the ~1,064 oriented wall boxes — within 40 u of the visitor (≈300 of ~4,100; 4,100 hypot tests ≈ 0.05 ms). `occlude()` iterates this list instead of all colliders (~10× cheaper, same math, boxes and `r ≥ 0.45` circles still seen). The whiskers read the same list. The density hash (§4.5) is separate and circles-only.

### 4.7 Terrain whisker (all modes)
- Every frame: 8 samples of `world.height` along lens→chest; if terrain rises above `sightY − 0.3` at any sample, `terrainLift` goal = elevation needed to clear it by 0.3, capped 0.25 rad; λ3 up, λ1.5 down; applied with `occLift` and scaled by `(1 − holdAng)`. `snap()` sets `terrainLift` to its goal directly (so `--el` on a slope is exact). (The cut never opens terrain.) Today only the ground clamp (camera.js ~697, `cam.y ≥ ground + 1.6`) keeps the lens out of a slope, by pushing it straight up; rows it moved in the baseline are not A11 references (their `occDist`/position differ from the goal).

### 4.8 Nausea caps (every automatic motion; manual input is uncapped)
| source | max rate | smoothing | gate |
|---|---|---|---|
| tether swing | ≤ 0.6 rad/s (geometric) | none | moving only |
| path alignment | 1.1 rad/s | λ1.4, 0.6 s ramp | 0.5 s pure-W on a path; 1.2 s after manual orbit |
| whiskers | 0.5 rad/s, ≤ 0.52 rad | λ1.5 | 0.35 s blocked; 0.8 s better; 2 s between switches |
| density el / dist | 0.12 rad/s / 2.5 u/s | λ0.8 | 0.12 deadband, 4 Hz |
| terrain lift | ≤ 0.25 rad | λ3 / λ1.5 | 0.3 u margin |
| occlusion tilt | cap 0.12 rad (cut live) | λ5 / λ2.5 | only while `cutK < 0.5` |
| cut open / close | λ12 up / λ3 down | 0.6 s minimum open | collider trigger r ≥ 1.2 on 2 consecutive frames |
| lead | 8 u/s | λ1.6 / 0.9 / 1.1 | dead zone |
| mode / look FOV | 12°/s (take-off exempt, §2) | λ5 | mode change, V |
| control basis | 0.9 rad/s | none | while movement held |
| look return | 2.5 rad/s | λ8 | V release |

## 5. OCCLUSION: see-through cut first, the ladder as a sensor

### 5.1 Cutout (`src/systems/camera/cutout.js`)
- **Which meshes:** `sweepable(o)` meshes whose world `maxDim > occFadeMaxDim (12)` or whose name matches `STRUCTURAL` (`cat_*_`, `candyArch_`), plus every `instanceable(o)` cloud. Prop-sized meshes (≤ 12 u), cats, NPCs and creatures keep the per-frame ghost path. Never: `SkinnedMesh`, `Points`, `Sprite`, `Line`, `ShaderMaterial`/`RawShaderMaterial`, `transparent` materials, terrain/water/sky (already out via `SKY_GROUND`), `NEVER_FADE`, `userData.noFade|noOcclude|noCut` on the object or an ancestor, the player group and silhouettes.
- **Materials are shared across meshes (one material on 400 lollipops) but every exclusion above is per OBJECT**, so `patchAll` first collects `P` (materials of meshes to patch) and `X` (materials of excluded meshes). For every material in `P ∩ X` the EXCLUDED meshes get one cached unpatched copy made the `fadeMat` way (`clone()`, then copy `onBeforeCompile` and `customProgramCacheKey`, and point `userData` at the ORIGINAL's `userData` object so shared `{value}` uniforms keep animating) and the original is patched. A ferry deck sharing wood with a pier keeps a clean copy; a `noCut` landmark sharing a district material keeps its escape hatch; a ≤ 12 u prop sharing a merge's material is ghosted, never dithered. Log once: `[camera/cut] patched N materials · M copies for K excluded meshes`. `cutout.isPatched(o)` answers per object (§7).
- **When:** `ctx.events.on('world:ready', patchAll)` (main.js emits it before the first render, so no program compiles twice); afterwards a lazy pass inside the existing 4 Hz `refreshCandidates` traversal patches anything new (WeakSet `patched`).
- **Chaining (exact):**
  ```js
  const prevHook = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  const custom = prevKey !== THREE.Material.prototype.customProgramCacheKey;
  const baseKey = custom ? null : (prevHook ? prevHook.toString() : 'none');   // snapshot BEFORE replacing the hook
  m.customProgramCacheKey = function () { return (custom ? prevKey.call(this) : baseKey) + '|cut1'; };
  m.onBeforeCompile = function (sh, r) { if (prevHook) prevHook.call(this, sh, r); injectCut(sh); };
  m.userData.cut = true; m.needsUpdate = true;
  ```
  Most existing hooks (vegetation wind, cat nature, fur, terrain, sourpatch, creatures, items, visitor) set their own key; `escape/cave.js` (`makeCausticMaterial`, cave.js:1060-1084) does not, and the `baseKey` snapshot of its hook source covers it. `injectCut` runs AFTER `prevHook` and locates its anchors in the post-hook source: cave.js replaces `#include <dithering_fragment>` with itself + its caustic block, so the cut's rim multiply lands before the chunk and the caustics after it — the composed shader is rendered by `cave_corridor` / `cave_corridor_night` (§9). **Also fix `fadeMat()`:** it copies `onBeforeCompile` but not `customProgramCacheKey`; add `c.customProgramCacheKey = m.customProgramCacheKey`, or every ghost clone shares one wrapper source and programs collide.
- **Shader (three r170 chunks).** `injectCut` skips, and logs once, any material whose anchors are missing.
  - Vertex: prepend `uniform vec4 uCutWY; varying float vCutV; varying float vCutY;`; replace `#include <project_vertex>` with itself + `vCutV = -mvPosition.z; vCutY = dot(uCutWY, mvPosition);` (`mvPosition` is view space after the chunk, batching/instancing already applied; `uCutWY` = row 2 of `camera.matrixWorld`, so `vCutY` is world y).
  - Fragment: prepend uniforms `uCutC (cx, cy, 0, 0)`, `uCutR (rx, ry, k, 0)`, `uCutP (depth, feetY, nearK, near)`, the varyings and `float bayer4(vec2 p)` (4×4 matrix, `(v + 0.5) / 16`). Replace `#include <clipping_planes_fragment>` with itself +
    ```glsl
    float cutRim = 0.0;
    { vec2 q = (gl_FragCoord.xy - uCutC.xy) / uCutR.xy; float e = dot(q, q);
      float inFront = step(vCutV, uCutP.x) * step(uCutP.y, vCutY);
      float m = uCutR.z * inFront * (1.0 - smoothstep(0.55, 1.0, e));
      cutRim = uCutR.z * inFront * smoothstep(0.55, 1.0, e) * (1.0 - step(1.0, e));
      float nr = uCutP.z * (1.0 - smoothstep(0.35 * uCutP.w, uCutP.w, vCutV));
      if (max(m, nr) > bayer4(gl_FragCoord.xy)) discard; }
    ```
    and `#include <dithering_fragment>` with `gl_FragColor.rgb *= 1.0 - 0.2 * cutRim;` + itself (the feather band darkens so the hole reads as a window; skipped if the anchor is absent).
  - Depth/shadow materials are untouched: cut roofs still cast whole shadows.
- **Uniforms** (three shared `{value}` objects, written after the final `rotateX` **and a `cam.updateMatrixWorld(true)`** — the renderer refreshes `matrixWorld` only at render time, so projecting without it is one frame stale, tens of px during a look return — before `camera:update`, and at the end of `snap()` the same way): `uCutC` = chest (`P.y + 1.05`) projected to drawing-buffer px (`renderer.getDrawingBufferSize`, y up); `uCutR.y = clamp(1.25 × projected feet→hat height, 64, 320)·grow`, `uCutR.x = 0.8·ry`; `grow` eases ×1.4 (λ8 up, λ2.5 down) while ≥ 2 raw rays are blocked by patched masses; `uCutP = (chest view depth − 1.0, P.y + 0.35, nearK, clamp(0.2·camDist, 2, 6))`.
- **Strength `cutK`:** goal 1 while `cutNeed`. `cutNeed` = (a) the last sweep blocked a body ray with a PATCHED mesh or an instance, or (b) `occlude()` found, on two consecutive frames, a collider with `r ≥ 1.2` entering the sight line at `t0 > 1.2` (walls and trunks open the window within two frames; lamp posts, fence posts and bollards never strobe it) — except that (b) is suppressed while the last sweep's blockers were ALL unpatched (`noCut` / `NEVER_FADE` / unpatchable), the only decidable form of "unpatched blockers only": colliders are plain `{x,z,r}` records with no link to a mesh, so occlude() itself cannot know. Holds 0.6 s after the last need (the minimum open time), then falls at λ3; rises at λ12. Forced 0: free camera (`nearK` too: free renders stay pixel-identical), visitor off screen, `p.cut = 0`, and scaled by `(1 − holdAng)` (off under `noTilt` shots such as the moon moment; on under other cinematics). `snap()` runs the sweep, then sets `cutK` directly.

### 5.2 The ladder, re-roled
| rule | today | new |
|---|---|---|
| 0 CULL (lens inside a mesh ≤ 18 u) | on | unchanged |
| per-frame prop fade (r < 5) | ghost | unchanged (cats, doors, signs) |
| 1 FADE, `!big` sweep hit | ghost | unchanged for unpatched props |
| 1b district fade within 6 u of the lens | ghost | **removed**: the near-lens dither does it |
| 2 DOLLY (sweep + `occlude()`) | floor 62% of stop | runs only while `cutK < 0.5`; floor `max(14, 0.62·goalDist)` outdoors, 5.5 indoors; once the window is open `occDist` releases to `goalDist` (λ3.5) and the cut carries the frame. A sweep hit on a PATCHED mesh never dollies (it sets `cutNeed`) |
| 3 TILT (`sweepLift`) | +0.07/sweep to 0.30 (0.35 plinth) | unpatched sweep hits only, and only while `cutK < 0.5`; cap **0.12** (0.20 plinth); same hysteresis |
| collider tilt (`occlude`) | ≤ 0.12 | ≤ 0.06, only while `cutK < 0.5` |
| 4 GIVE-UP | tilt → 0 and latch; ghost ≤ 45 u | **removed** (hold at cap). In the `p.cut = 0` fallback the old ladder runs with give-up relaxing to `0.5·liftCap` instead of 0 |
| 5 INSTANCED | first ~2500 instances only; `askOwnersToHide` | sets `cutNeed` + grow; one round-robin cursor over (cloud, instance) so every instance is eventually tested; `askOwnersToHide` deleted |
| 6 PLINTH | taller tilt + forced dolly | sets grow only (the plinth is patched) |
| budget | 60k tests/sweep | 40k |
| `sweepOcclusion` classification | | a hit on a patched mesh: `blockedRaw[k] = true`, `cutNeed = true`, no fade/dolly/tilt; `allUnpatched` = every blocked ray's nearest hit is unpatched (gates §5.1 (b)) |

Consequence for the baselines: candy_meadow's 31 → 19.2 u dolly today comes from the collider pass on an `r ≥ 1.2` circle; under the new rule it opens the window instead and the lens stays at 31 u. That is why A11 takes its reference after this step (`post5`), not from the pre-edit run.

### 5.3 The amber silhouette (player/visitor.js, untouched)
Discarded fragments write no depth, so where the cut opens the **real body** shows and the `GreaterDepth` pass draws nothing. It remains the backstop, and the only place the visitor may read amber-only, in exactly these cases (A15 uses the same list): behind terrain, behind a `noCut` landmark or an unpatched mass, blockers within 1.0 u in front of him, and the feather band (a speckle, accepted). Silhouette on/off still follows `isFree()`.

### 5.4 QA metric
`bodyVisibility()` → `{ visible, rawVisible, featherVisible, total, rays: [{ pt, clear, rawClear, feather, by }] }`. A hit is cut-clear when its object is patched, its view depth < `uCutP.x`, `hit.point.y > uCutP.y`, and its projected point has `e < 0.55` (the fully open core) while `cutK ≥ 0.5` (or lies in the near band); `0.55 ≤ e < 0.8` counts as `feather` and is reported separately, never as clear (at e = 0.8 only 42% of those pixels are discarded); `rawClear` is today's geometric answer. camvis reports all three; A2 keeps raw honest.

## 6. Parameters, input, API

### 6.1 New/changed params (all live through `setParams`)
`cut 1` · `leadSide 4.0 leadToward 6.5 leadAway 3.5 leadRun 1.2` (mode 2: `lead2Away 3.0 lead2Side 2.0 lead2Toward 5.0`; mode 3 `lead3 3.5`) · `deadZoneDepth 0.7` · `hopK 0.3` · `m2ElevOff −0.18 m2DistK 0.72 m2Fov 42 m2Pitch 0.12` · `pathAlign 0.7 pathDelay 0.5 pathRate 1.1` · `basisRate 0.9` · `whiskerSteps [0.26, 0.52] whiskerRate 0.5 whiskerMax 0.52 whiskerHold 0.8 whiskerGap 2.0` · `densityElev1 0.14 densityElev2 0.20 densityDist1 0.10 densityDist2 0.08 densityRate 0.8` · `terrainLiftMax 0.25` · `lookHold 0.18 lookYawK 0.0055 lookElK 0.0035 lookPan 14 lookPanRun 26 lookLeash 40 lookElev 0.12 lookFovLook 40 lookIn 9 lookOut 8 lookReturnRate 2.5` · `cutRy 1.25 cutRx 0.8 cutGrow 1.4 cutHold 0.6 cutRise 12 cutFall 3 nearMin 2 nearMax 6` · `occLiftMax 0.12 occLiftPlinth 0.20 occBudget 40000 colLiftMax 0.06 occDollyMin 14` · `flyDist 44 flyElev 0.38 flyFov 40` · `fovRate 12`. Deleted: `followLambda`, `followRecentre`, `lookAhead` (kept as a deprecated alias = `leadAway`). Unchanged: everything else in the header list, incl. `zoneElev 0.50 zoneRise 1.0 tiltIn 0.24 tiltOut 0.12`.
- **Pin rule.** Any `setParams` carrying `elevation` or `distance` sets `pinned = true, pinAt = P`. While pinned: density 0, whiskers 0, path alignment off. The pin **persists through `snap()` and `setFree(null)`** and is cleared by the `'player:teleport'` event (player.js:310) and, in live play only (never under `ctx.shot`), once the visitor is 6 u from `pinAt`. render.mjs's `shoot()` order (teleport → `setCameraParams` → `setView(null)`) therefore pins exactly the views that carry `--el/--dist` and nothing else, in `--all` tours and camvis sessions alike, so probe order cannot leak a pin (A10/A11) and `--el/--dist` views render those exact goals (`tilt = 0`, §2). camvis writes `pinned` into every row. Zone pitch keeps lowering explicit elevations in town cores exactly as today. Owners that pin today: palace.js:960, cave.js:764, canoe.js:290 (distance 30); flyer.js:592 only in its fallback, which §2 keeps from running.

### 6.2 input.js (about 35 lines)
- `pointer.button` (last `e.button`); `pointer.down` true for **button 0 only** (weapons.js needs no edit); `pointer.orbit` true while button 1 or 2 is held (no Ctrl chord: Ctrl+W/S/D/H/F/M are browser shortcuts on Windows/Linux Chrome, and macOS already delivers Ctrl+click as button 2); `dragDX/dragDY` accumulate for any button; `pointer.mdx/mdy` accumulate every pointermove delta with no button held (for the V look) and are **zeroed in `endFrame()`** like `dragDX/dragDY`. Window `pointerup` clears `down` only when `e.button === 0` and `orbit` only when `e.button` is 1 or 2 (today it clears `down` for any button, so releasing a right-drag while the left button is held reads as a click and fires the item); `pointercancel` and `blur` clear both. Canvas `contextmenu` → `preventDefault`; canvas `mousedown` with `e.button === 1` and `auxclick` → `preventDefault` (middle-button autoscroll on Windows/Linux; `pointerdown.preventDefault` does not stop it). The camera orbits on `dragDX` whenever `pointer.down || pointer.orbit` (touch writes `down` directly today, Contract H, so it keeps working; §8.4 asks it to write `orbit` instead).
- `moveLock` (frames): `axis()` returns `{0,0,false}` while `moveLock > 0`; `virtual` becomes an accessor over `_virtual`: the getter returns `_virtual` when unlocked and a shared scratch `LOCKED {x:0,y:0}` when locked — re-zeroed in `endFrame()`, **not frozen** (touch.js:703 and debug.walk mutate `.x/.y` from strict-mode modules, where a write to a frozen object throws); the setter copies `x,y` into `_virtual` (debug.walk assigns whole objects). `axisRaw()` and `virtualRaw` (always `_virtual`) bypass the lock; `endFrame()` decrements it. The camera refreshes it to 2 each frame while looking, so a stopped camera cannot leave anyone frozen.
- Keys added: **V** only. Right/middle mouse become orbit. Everything else in the WAVE 2 contract is untouched.

### 6.3 hotbar.js
Chip becomes `1 iso · 2 follow · 3 top · V look` (4th `.cci-cam-seg[data-m=v]`, lit while `camera.looking > 0.05`; `CAM_KEYS` + `KeyV` reveal it); a caption row while looking; a Q/E keycap pulse hint (§4.4); a projected "you" marker + edge chevron overlay div in `ctx.uiRoot` while looking (positioned from `camera.playerScreen`); the teach toast via `ctx.systems.ui.toast`. hotbar.js injects its own `<style>` for the new classes (style.js is the map-history owner's).

### 6.4 Public API (add, never rename; header list kept verbatim)
Getters: `looking` (0..1), `cutK`, `occYaw`, `densityK`, `terrainLift`, `tilt`, `baseDistance`, `controlAzimuth`, `goalDistance`, `pinned`, `playerScreen {x, y, on}` (projected after the final `rotateX` + `updateMatrixWorld`), `camMs {mean, p95, max, sweepP95, nonSweepP95}` (rolling 600 frames around `update()`). Methods: `look(o)`, `recentre()`. Events: `camera:look {on}`. `bodyVisibility()` gains `rawVisible`/`rawClear`/`featherVisible`. `snap()` additionally: `lead = 0`, look off, `moveLock` cleared, `ctrlAz = viewAz`, tether `A` behind facing, `dK` and `terrainLift` settled at their goals, `cam.fov` = the mode's FOV goal, one deterministic whisker evaluation in mode 2, `cutK` from the final pass, the mode pitch applied, `cam.updateMatrixWorld(true)`, uniforms written. `setFree(null)` additionally resets lead, look, whiskers, path-alignment timers, `cutK`, and restores the MODE's FOV goal (not `p.fov`: today's `cam.fov = p.fov` would make every mode-2 view ease 30 → 42 during its frames). Neither clears the pin (§6.1). `setParams` semantics unchanged (+ pin, + no `distRef` rebase while `onVehicle || flying`).

## 7. Must not break (verify each with render.mjs before the final report)
| invariant | check |
|---|---|
| `snap()` converges in one call, deterministic, no `Math.random`/wall clock | A12; `--view candy_arrival` twice → identical stats and PNG hash |
| `tilt = 0` after every snap; `--az/--el/--dist/--fov` exact | `--view cat_residential` (el 0.68 → zone-lowered exactly as today), `--view candy_arrival` az −1.435 dist 44 reproduced |
| lens elevation = §2 table in every mode | camvis at candy_meadow (no zone, `densityK < 0.05`): `current.elevation + tilt` = 0.64 / 0.46 / 1.10 ± 0.01 in modes 1/2/3; at cat_main_street 0.50 / 0.40 / 1.10 ± 0.01 |
| free camera pixel-identical (cut and near dither off, no `camera:update`) | `--view world_overview`, `--view palace_throne`, `--view ferry_crossing` byte-compare to baseline |
| moon moment: `noTilt`/`holdAng`/`pitch`, moon + horizon + visitor framed, auto offsets 0 during the hold | `--view cam_moon_moment` vs `renders.noindex/tour3` reference; log `occYaw = densityK = cutK = 0` at w = 1 |
| `cinematic()` target fn/array/object forms + `promise.cancel` | ferry departure/hand-back, `escape_flyer_pad`, catapult flight render without errors |
| ferry's per-frame `setFree` + silhouette off via `isFree()` | `--view ferry_crossing`; `player.silhouetteOn === false` |
| no `NEVER_FADE` / `noCut` object is ever cut | camvis traverses the scene after `world:ready`: `cutout.isPatched(o) === false` for every mesh matching `NEVER_FADE` or carrying `noCut`/`noFade` (incl. the Sugarfin, via the material copies of §5.1); `--view ferry_deck` in mode 1: no `by[]` entry names a ferry mesh as cut-clear |
| interiors own their framing; roofs untouched; **in both modes** | `--view candy_in_house0`, `--view cat_in_meow`, `--view palace_throne_play`, `--view cave_corridor`, each plain and with `call camera.setMode 2`: `el/dist` equal what palace.js / cat architecture / cave.js set, `cam.fov == p.fov`, `occYaw = 0`, `densityK = 0`, pitch 0 |
| cave corridor azimuth not re-triggered by mode 2 | `--view cave_corridor` + `call camera.setMode 2`: `params.azimuth` written only by cave.js; Q/E there calls `startSnap` and cave.js:774 sees it |
| vehicle distance writes apply (canoe 30); flying framing is the camera's, not the flyer's | canoe view: `occYaw = densityK = 0`; `cam_flying` (§9, `debugFly` holds her at alt 60): 44 ± 1 / 0.38 ± 0.02 / FOV 40 ± 0.5 at frame 30, `cam.fov ≥ 38` at 0.5 s, `flyer` never enters its fallback (`params.distance` unchanged by flyer.js) |
| `camera:update` emitted last, after `rotateX` and `updateMatrixWorld` | camvis subscribes to `camera:update` during `cam_moon_moment` and `cam_follow_street`: `cam.matrixWorld` at the event already includes the pitch (differs from a fresh `lookAt` matrix by the authored `pitch`) — this is what citizens.js:464 (tiger carry) relies on; no carry view exists, so the invariant is checked directly |
| WASD never flips under the moon shot | A5 during `cam_moon_moment` (`controlAzimuth` unchanged) |
| mode 1 never auto-yaws (not flying) | A10 |
| perf budgets | A13 |

## 8. Implementation order (one Opus builder, ~11.5 h; one commit per step; re-run camvis after each)
0. **camvis.mjs + baseline** (1 h). New `tools/camvis.mjs`: copies render.mjs's `acquire()/release()` two-slot gate; opens `?shot=1`; sets `ctx.renderOverride = () => {}` (main.js:82) for simulation frames; per probe in modes 1/2/3 follows the §1 order exactly (setMode → reset params → facing → teleport → view params → setView(null) → call → walk → step), then `scene.updateMatrixWorld(true)` and reads `bodyVisibility` (all three numbers), the §1 row fields, `culledList`, `camMs`; scripts: steering (A4, incl. the mid-walk drag), basis (A5), lead (A6), look (A7, incl. the no-motion V press), recentre (A8), buttons (A9, synthetic `PointerEvent`/`MouseEvent`s on the canvas, count `weapon:use`), rate log on route R (teleport (178,48) walk W 300 frames; teleport (-200,-20) walk W 300 frames; each mode), the §7 scene-traversal and `camera:update` checks, perf (A13, run separately in hardware-GL Chrome via `?camvis=perf`). Writes `renders.noindex/camvis/<tag>.json` + `.md` table, with wall-clock fields in a separate `timing` block so A12's diff can drop them. Record `baseline` **before any camera edit**; the seed `tools/_tmp/camprobe.mjs` / `camprobe.json` (the genre reader's probe, committed by the orchestrator, §8.4) is the cross-check: baseline mode-1 raw mean ≈ 0.908, mode 3 ≈ 0.985, hold-D net 2.7 / path 23.7.
1. **input.js** (0.5 h): §6.2. Proof: A9, `moveLock` zeroes `axis()` and `virtual`, `virtualRaw` still reads the touch stick.
2. **`controlAzimuth` + mode-2 tether/path alignment + `setMode` handoff + tiltFor on `baseDist` + `m2Pitch`** (1.75 h). Proof: A4, A5; §7 lens-elevation row; `cam_follow_strafe`, `cam_follow_backpedal`, `cam_follow_street` renders (sky band visible).
3. **Lead, path anticipation, hop damping, dead-zone ellipse, FOV easing** (1 h). Proof: A6; `cam_walk_toward_lens`.
4. **Cutout + material copies + near dither + `cutK` drive + cut-aware `bodyVisibility` + `fadeMat` key fix** (2.5 h). Proof: A1/A2 mode 1; renders `occ_silhouette`, `cat_residential`, `cat_plaza`, `candy_forest`, `cam_cut_cupcake`, `cave_corridor`; §7 NEVER_FADE row; frameMs A13; a vegetation frame still sways (step two frames, diff).
5. **Ladder re-role** (1 h): §5.2. Proof: A3; `occ_*` set in player.json renders. **Record the `post5` camvis run here: it is A11's reference.**
6. **V look + tap recentre + `look()` hook + chip segment/caption/marker + toasts** (1.5 h). Proof: A7, A8; `cam_look_pan`, `cam_look_night`.
7. **density.js + local list + terrain whisker + mode-2 whiskers + flyer framing + owned()/pin** (1.75 h). Proof: A10, A11; `cam_dense_grove`, `cam_dense_heights`, `cam_follow_street`, `cam_flying`; §7 interior (both modes) / vehicle checks.
8. **Text + views + final run** (0.5 h): camera.js header (lines 1-14 and the API list; the silhouette is amber, not cream), `MODE_NAME` toasts, `tools/views/camera.json` (§9), §8.4 requests delivered in the report, full camvis, re-render of P + §9 (day and night) for the critics.
If time runs short, drop step 7's whiskers and path alignment first, then density; never drop 0, 1, 4 or 6.

### 8.4 Text handed to other owners (verbatim, via the orchestrator)
- **Orchestrator (git), before the builder starts:** commit this file at `docs/CAMERA_SPEC.md`; copy the genre reader's `camprobe.mjs` and `camprobe.json` from the review scratchpad to `tools/_tmp/camprobe.mjs` / `tools/_tmp/camprobe.json` and commit them (they are the only record of the pre-edit numbers in §1 and die with that session otherwise).
- **ui.js help card (map-history owner):** insert after the `L` row: `${kb('V')}<em>look around (hold) · tap = <b>behind me</b></em>`; replace the `Q`/`E` row with `${kb('Q', 'E')}<em>turn view · <b>right-drag</b> orbit · wheel zoom</em>`; row `1 2 3` text becomes `camera: iso · follow (swings behind you) · top`.
- **docs/BRIEF.md (orchestrator):** WAVE 2 line 71-75 → "Input contract v3: … · **V (hold) = look around: the visitor stands still, WASD pans, mouse orbits, release returns · V (tap) = recentre behind the visitor** · **right/middle-drag = orbit (never uses the item; no context menu)** · 1 iso (you turn it) · 2 FOLLOW = tether that stays behind your travel · 3 top. Nobody else binds these keys." Line 49: add `.setMode(n)`, `.looking`, `.recentre()`, `.controlAzimuth`. Line 53: "~46 units" → "31 units, FOV 30 (follow: 22 u, FOV 42)". WAVE 3 camera line: add `src/systems/camera/*.js`, `tools/camvis.mjs`. Contract E stays at distance 44 (this spec honours it).
- **touch.js (touch owner):** a LOOK button (≥ 56 px) that holds `KeyV` while pressed, Contract H pattern; and for the right-thumb look drag (touch.js:718-724) write `inp.pointer.orbit = true` instead of `inp.pointer.down = true` once input.js ships `orbit` (`'orbit' in inp.pointer`), so a slow touch orbit no longer hold-fires the held item (weapons.js:581-596 `readInput` reads `down`); the camera accepts either.
- **player.js INPUT header (ground owner):** add "V look-around / right-drag orbit belong to the camera". (No API change needed: the camera's `top(c)` rule mirrors `ground.js classify()`, §4.5.)
- **flyer.js (flyer owner):** may stop writing `params.distance` per frame once `ctx.state.flying` is honoured (harmless either way); keep `cameraCheck()`'s `fov ≥ 33` gate — the camera reaches ≥ 38 by 0.5 s.
- **citizens.js (NPC adopter, optional):** a `debugCarry(tigerKey?)` hook that starts the scruff-carry on demand would let a `cam_tiger_carry` view join §9; until then §7 checks the `camera:update` ordering directly.

## 9. Acceptance views: `tools/views/camera.json`
```json
{
  "cam_follow_strafe":    { "pos": [-110, -45], "time": 12, "call": { "camera.setMode": 2 }, "walk": { "x": 1, "y": 0, "n": 90 }, "frames": 0 },
  "cam_follow_backpedal": { "pos": [-110, -45], "time": 12, "call": { "camera.setMode": 2 }, "walk": { "x": 0, "y": -1, "n": 60 }, "frames": 0 },
  "cam_follow_street":    { "pos": [112, 2],    "time": 12, "call": { "camera.setMode": 2 }, "walk": { "x": 0, "y": 1, "n": 75 }, "frames": 0 },
  "cam_follow_street_night": { "pos": [112, 2], "time": 21, "call": { "camera.setMode": 2 }, "walk": { "x": 0, "y": 1, "n": 75 }, "frames": 0 },
  "cam_walk_toward_lens": { "pos": [-110, -45], "time": 12, "walk": { "x": 0, "y": -1.58, "n": 45 }, "frames": 0 },
  "cam_walk_away":        { "pos": [-110, -45], "time": 12, "walk": { "x": 0, "y": 1.58, "n": 45 }, "frames": 0 },
  "cam_look_pan":         { "pos": [118, 0],    "time": 12, "call": { "camera.look": { "on": true, "yaw": 0.6, "pan": [0, 18] } }, "frames": 30 },
  "cam_look_night":       { "pos": [118, 0],    "time": 22, "call": { "camera.look": { "on": true, "yaw": -0.9, "pitch": 0.1, "pan": [10, 10] } }, "frames": 30 },
  "cam_look_offscreen":   { "pos": [-140, 40],  "time": 11, "call": { "camera.look": { "on": true, "pan": [0, 38] } }, "frames": 30 },
  "cam_dense_grove":      { "pos": [-200, -20], "time": 14, "walk": { "x": 0, "y": 1, "n": 45 }, "frames": 0 },
  "cam_dense_heights":    { "pos": [178, 48],   "time": 15, "walk": { "x": 0, "y": 1, "n": 45 }, "frames": 0 },
  "cam_dense_meow":       { "pos": [128, -24],  "time": 12, "walk": { "x": 1, "y": 0, "n": 45 }, "frames": 0 },
  "cam_cut_cupcake":      { "pos": [-94, -24],  "time": 12, "frames": 45 },
  "cam_cut_cupcake_night":{ "pos": [-94, -24],  "time": 22, "frames": 45 },
  "cam_cut_residential":  { "pos": [178, 48],   "az": 0.78, "el": 0.68, "dist": 86, "time": 15, "frames": 40 },
  "cam_cave_corridor":    { "pos": [1376, -39], "time": 12, "frames": 70 },
  "cam_cave_corridor_night": { "pos": [1376, -39], "time": 22, "frames": 70 },
  "cam_cave_follow":      { "pos": [1376, -39], "time": 12, "call": { "camera.setMode": 2 }, "frames": 70 },
  "cam_palace_follow":    { "pos": [-153, -33.8], "az": 0.785, "time": 12, "call": { "camera.setMode": 2 }, "frames": 80 },
  "cam_meow_follow":      { "pos": [129, -25],  "az": 0.28, "el": 0.34, "dist": 16, "time": 12, "call": { "catArchitecture.enter": "meow", "camera.setMode": 2 }, "frames": 60 },
  "cam_overview_town":    { "pos": [118, 0],    "time": 12, "call": { "camera.setMode": 3 }, "frames": 45 },
  "cam_help_card":        { "pos": [-110, -45], "time": 12, "call": { "ui.showHint": true, "camera.look": { "on": true, "yaw": 0.3 } }, "frames": 10 },
  "cam_flying":           { "pos": [206.4, 6],  "time": 12, "call": { "escape.routes.flyer.debugFly": [206.4, 6, 60, -1.5708, true] }, "frames": 60 }
}
```
`cam_flying` uses the flyer's existing hook `escape.routes.flyer.debugFly(x, z, y, yaw, holdPos)` (flyer.js:1005; escape.js returns `{ api, routes }`, so the path is `routes.flyer`, as flyer.json already does): she hangs at altitude 60 over the pad, `airT` still advances, so `cameraCheck()` fires at 0.6 s and must find FOV ≥ 33 (§2). Every view is rendered day and night for the critic strip (night = `time` 22 unless given).

## 10. Risks the builder must watch
- Shader patch: anchors differ on some material (skip + log, never throw); a vegetation frame that stops swaying means the previous hook was not called first; a cave frame without caustics means `injectCut` searched the pre-hook source. Patched programs lose early-z; measure A13, and `p.cut = 0` / `?cut=0` restores today's ladder.
- Material copies: a copy that forgets to share `userData` freezes that material's wind/caustic uniforms on the excluded meshes; the count is logged, so a nonzero count with a still frame is the tell.
- Dollhouse: the window exposes shell interiors and back faces. It is gated on real blockage, feathered, rim-darkened, capped at 320 px and released after 0.6 s; `userData.noCut` is the per-landmark escape hatch. In mode 2 inside town cores it is open most of the time (A15 accepts this).
- The cut-aware metric flatters itself; always report raw and feather next to it and judge frames by eye.
- Tether feel: circle-strafe on A/D is genre-standard but new here; `basisRate` tunes 0.7-1.2 if Q/E mid-walk feels sluggish. With no recentre spring, "behind me" on a winding path depends on path alignment plus tap V.
- Whiskers and density use guessed or ambiguous collider heights (§4.5 `top(c)`); mode 2 only, rate-capped, committed, and the cut backs them up.
- External owners (cave azimuth, palace el/dist, canoe distance) are muted through `owned()`/`pinned`; if a new owned space forgets `placeOverride`, `indoors()` must still catch it. The flyer's fallback must never engage (§7 row).
- Any view that inherits params in `--all` mode can differ from a single-view render (existing quirk; the pin no longer leaks, but `p.azimuth`/`p.distance` still do).

## Review log (revision 2, 2026-09-22)
Adversarial review: 1 blocker, 12 majors, 20 minors. All blockers and majors are fixed above (file location §0/§8.4; tiltFor on `baseDist` §2; `m2Pitch` §2/A15; A4 1.6 rad + mid-walk drag; recentre spring removed, path-alignment goal `− occYaw`, whiskers survive walks §4.2/4.4; pin persists, cleared on teleport §6.1; local list by linear scan §4.6; dolly/tilt only while `cutK < 0.5` + the decidable collider trigger §5.1/5.2; A11 reference = `post5`; per-material copies for per-object exclusions §5.1; flying 44 flat + the 0.6 s / fov ≥ 33 handshake §2/§7; owned() mode 2 = mode 1 framing §2/§7; orbit = right/middle only, per-button releases §6.2; A12/A13 restated). Minors accepted as proposed: cam_flying signature; snap() settles terrainLift and the mode FOV; density × (1 − zoneK); A5 tolerance; updateMatrixWorld before projecting; cut-clear e < 0.55 + feather; collider trigger gated (r ≥ 1.2, 2 frames, 0.6 s open); look return 2.5 rad/s; camvis sets facing; 2→1 keeps occYaw; A10 "not flying"; A15 amber list = §5.3; cave.js key claim corrected + corridor views; mdx/mdy zeroed; mode-2 raw floor. Minors accepted in a different form, and why:
- *Frozen `ZERO` for the locked `virtual` getter* — rejected as stated: input.js's consumers are ES modules (strict mode), where `inp.virtual.x = …` on a frozen object throws; §6.2 uses a scratch object re-zeroed each frame instead.
- *Ask the ground owner for the audit's per-collider classification* — rejected: `ground.kindOf(c)` returns only a kind string, and the classification rule is three lines (ground.js:100-110), so §4.5 restates it locally with a conservative reading of the ambiguous band; no cross-owner API needed.
- *Mode 3: lead ×0.6 and FOV 28* — the lead change is taken (base 3.5), FOV 28 is rejected: it would change every mode-3 baseline frame and the map view's field for a 1% body-height gain; §1 declares mode 3 a map view outside the 8-12% band instead.
- *Flying: keep the 12°/s cap and require FOV ≥ 35 at 0.5 s* — the cap gives 36° at 0.5 s, a 1° margin over the check and 4° over `cameraCheck()`'s 33; §2 exempts the take-off ease (λ6, 39.5° at 0.5 s) and requires ≥ 38, since a take-off is a scene change, not a nausea case.
- *Tiger-carry view via a citizens hook* — the `camera:update` ordering is checked directly in camvis (§7); the `debugCarry()` request is listed in §8.4 as optional so the camera builder is not blocked on an NPC adopter.
- *"Delete the sky-band clause from A15"* — the alternative (an authored pitch) was taken because a follow camera with no horizon fails Ben's "see where you are going".
