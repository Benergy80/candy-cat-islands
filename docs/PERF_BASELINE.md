# PERF BASELINE: desktop, hardware GL (Contract J). Measured 2026-09-24

Read this before any frame-rate change. It is the "before" for BRIEF Contract J. docs/PERF_AUDIT.md (the iPhone audit) covers draw calls and triangles; this document covers time: frame intervals, GPU and CPU milliseconds, hitches, and what each trim buys, measured on this Mac.

## How it was measured (reproduce with one command)

`node tools/fpsbench.mjs --label <name>` runs everything below. It opens Google Chrome headed (Playwright `channel: 'chrome'`, ANGLE Metal on the M1 Pro) at 1600×1000 CSS with deviceScaleFactor 2 (a 3200×2000 drawing buffer, MSAA on, desktop tier). The page loads without `?shot`, so the game's own RAF loop runs, with `?prof=1`. The bench dismisses the title with a real keydown, skips the cinematic until `intro:cinematic:done`, and holds both render-gate slots for the whole run. It also runs `caffeinate`. The load average is recorded in every section.

- **Spots** use the poses from tools/mobilebench.mjs (the same numbers as PERF_AUDIT): camera mode 1, default lens, then the view's own az/el/dist, then 150 settle frames and 600 sampled frames. `cat_residential` is added as CAMERA_SPEC A13's spot.
- **Per frame** the bench records:
  - the RAF interval;
  - main-thread work (from the RAF timestamp to the end of the tick);
  - update() time per system, plus game.prof();
  - renderer.render() CPU time;
  - a GPU timer query around renderer.render;
  - GL draws (main and shadow);
  - buffer and texture upload bytes and shader compiles (WebGL prototype counters);
  - camera sweep frames;
  - JS heap (precise memory info, gc() before each sample).
- **Attribution**: one hooked render gives main-pass and shadow-pass calls and triangles per system. It also counts the `frustumCulled=false` draws that are wholly off-screen, using the live per-instance spheres of instanced meshes.
- **Toggles, paired**: [base ×5, config ×5] with a GPU timer query around each render, after a 24-render GPU clock ramp. Apple GPUs down-clock between sparse renders, so each config gets its own base; base-vs-base reads ±0.03 ms. Two kinds of config run for every system:
  - hide the system's renderables, which gives its whole cost;
  - set `castShadow=false`, which gives its shadow-pass cost.
- **What-ifs**: hide the zero-intensity point lights, hide all point lights, pixel ratio 1.5 and 1, and a 2048 sun map. A toggle that changes the light count is flagged.
- **Dirty pass**: attribute and texture version bumps (re-uploads), material `needsUpdate` call sites, program re-evaluations per material, and DOM mutations.
- **Deep pass**: the V8 CPU profiler, and the sampling heap profiler with collected objects included, over 300 frames. Its fps is never used.
- **Dusk** runs on a fresh page, 18.3 → 20.0 h at game speed (21 s). **Cycle** calls setTime for every hour (and the half hours around dusk and dawn) and records lights, programs, compiles, and which systems' materials switched program. **Walks** hold live input for 4 × 15 s (never `game.walk`, which ticks synchronously and would itself be the hitch).
- **`--patch "file|from|to"`** serves a source file patched in flight (never on disk), so a proposed trim is measured on hardware before an owner edits anything. Every what-if row below was made this way.

Runs (renders/w3_perf/*.json + .md): `baseline` (7 spots + dusk + cycle + 60 s mode-2 walk), `walk_cat_m1`, `walk_candy_m1` (mode 1, running), `night_recheck`, `cut0`, and the what-ifs `wi_pool4`, `wi_water`, `wi_pool4_water`, `wi_dpr15`, `wi_pool4_water_dpr15`. Machine: MacBookPro M1 Pro, 16 GB, macOS 15.7 (Darwin 24.6), Chrome 153, ANGLE Metal. **The display is 120 Hz ProMotion**: a frame that misses 8.3 ms shows for 16.7 ms, so "60 fps" here means 8.3-16.7 ms of work. Load average 1.7-5.2 during the runs (a background macOS indexer, not the game). Console errors: 0 in every run.

## Verdict against Contract J (≥ 55 fps median at 2× DPR, no frame > 40 ms, ≤ 450 calls)

| | result |
|---|---|
| ≥ 55 fps median | Passes by day at 5 of 7 spots (57.5-62 fps; candy_forest is marginal). **Fails at night (27 fps) and on the sea crossing (19 fps)**, and during the whole dusk transition (27.5 fps). |
| no frame > 40 ms | **Fails.** At night, 63 of 600 frames go over 40 ms; at sea, 600 of 600. Dusk freezes for 869 ms with a warm shader cache (≈ 8.7 s when the programs have never been compiled on the machine, see "Programs" below), plus four more 150-170 ms compile hitches. The moon moment adds 145 ms at 21:00. The camera sweep reaches 27.6 ms on one frame. |
| ≤ 450 draw calls | Main pass passes everywhere (208-378). Main + shadow GL draws are 471 at cat_main_street, 478 at sea and **533 at cat_residential**. |
| ≤ 1.3M triangles | Main pass passes (≤ 1.27M, cat_residential). Main + shadow: up to 1.9M. |
| CAMERA_SPEC A13 | **Fails.** On sweep frames, camera update() p95 is 14.2 ms at cat_residential (limit 6), 8.4-14.2 at every spot, and 27.6 ms max on the Cat Island walk. Non-sweep p95 is 0.5-0.6 ms (limit 1.5, passes). |

**The game is GPU-bound, and the cause is concrete.** Main-thread work is 9-13 ms median (update() 2.3-4.8 ms, render() CPU 2.3-3.1 ms). GPU time at full clock is 12-16 ms by day, 33 ms at night and 52 ms at sea. Three measured causes, in order:

1. **Point lights.** 12 PointLights are visible all day at intensity 0 and 17 at night. three shades every visible light for every fragment, whatever its intensity.
2. **The sea shader.**
3. **The 3200×2000 buffer.**

The shadow pass (0.35-0.63 ms of GPU) and the 4096² map (2048 saves 0.2-0.3 ms) are not the problem.

## Baseline table (run `baseline`)

GPU at full clock = the paired-toggle base (render + timer query after a clock ramp). The live timer in the json reads about 1.7× higher because it includes DVFS down-clocking and queueing; use it only as a trend.

| spot | load 1m | fps median (mean) | frame p95 / max ms | frames > 25 / > 40 ms | main-thread work med / p95 ms | update() med / p95 | render() CPU med | GPU ms at full clock | GL draws / frame | calls main + shadow | tris main + shadow | point lights visible/lit | alloc KB/frame (sampled) | minor GCs / 600 f |
|---|---:|---|---|---|---|---|---:|---:|---:|---|---|---|---:|---:|
| candy_village (-140,40 @11) | 3.85 | 61.0 (69.6) | 17.7 / 25.0 | 0 / 0 | 9.0 / 12.9 | 2.3 / 5.3 | 2.3 | 12.1 | 318 | 218 + 100 | 746k + 402k | 12 / 1 | 1471 | 32 |
| cat_main_street (112,2 @12, dist 56) | 2.94 | 61.7 (63.2) | 24.1 / 27.4 | 12 / 0 | 9.9 / 14.9 | 3.2 / 7.2 | 2.7 | 14.4 | 471 | 330 + 141 | 1.00M + 647k | 12 / 1 | 1058 | 23 |
| cat_plaza (78,20 @11, dist 48) | 3.26 | 61.0 (62.5) | 24.3 / 32.5 | 12 / 0 | 9.4 / 14.1 | 3.1 / 5.9 | 2.7 | 14.1 | 419 | 292 + 127 | 1.09M + 572k | 12 / 1 | 1084 | 23 |
| candy_forest (-200,-20 @14) | 3.25 | 57.5 (54.2) | 24.9 / 37.4 | 22 / 0 | 9.0 / 12.8 | 2.3 / 5.8 | 2.4 | 16.0 | 309 | 208 + 101 | 716k + 407k | 12 / 1 | 1412 | 30 |
| candy_night (-140,40 @23) | 2.50 | **27.1** (33.9) | 43.1 / 57.7 | 413 / **63** | 9.5 / 15.5 | 2.4 / 7.1 | 3.1 | **32.8** | 358 | 258 + 100 | 755k + 402k | **17 / 17** | 1704 | 36 |
| sea_crossing (free 0,22, dist 90 @17) | 1.97 | **18.8** (18.7) | 59.7 / 63.1 | 600 / **600** | 13.1 / 18.0 | 4.8 / 7.2 | 3.0 | **51.8** | 478 | 257 + 221 | 951k + 846k | 12 / 1 | 1449 | 33 |
| cat_residential (178,48 @15, dist 86) | 1.66 | 62.1 (64.9) | 23.1 / 27.3 | 8 / 0 | 11.1 / 15.0 | 2.9 / 6.8 | 3.1 | 14.1 | **533** | 378 + 156 | 1.27M + 640k | 12 / 1 | 1112 | 24 |
| **dusk 18.3 → 20.0** (candy_village, fresh page) | 5.16 | **27.5** (27.1) | 44.7 / **869.4** | 534 / **153** | 10.2 | – | – | – | – | – | – | 15 → 17 | – | – |
| walk, mode 2 (village → pier, 60 s) | 2.50 | 55.6 (49.6) | 34.4 / 40.4 | 690 / 1 | 8.9 / 14.7 | – | – | – | – | – | – | 12 / 1 | – | 164 |
| walk, mode 1 run, Cat Island | 2.85 | 65.4 (73.6) | 20.3 / 49.5 | 44 / 3 | 9.7 / 13.9 | – | – | – | – | – | – | 12 / 1 | – | 173 |
| walk, mode 1 run, Candy forest → west coast → village | 4.70 | 55.9 (46.4) | 36.4 / 57.5 | 890 / 83 | 8.6 / 14.0 | – | – | – | – | – | – | 12 / 1 | – | 145 |

Walk notes: the mode-2 walk is the camera the game hands back after the intro. Both walks spend long stretches pressed against walls; see the `path` field in the json. The worst walk frames are GPU-bound (work 5-12 ms, interval 40-57 ms) and appear wherever the view fills with sea: the pier, the west coast at (-233,-52), and the mode-2 horizon.

## What the trims buy: measured what-ifs (sources patched in flight, fps median)

| run | candy_village | cat_main_street | cat_plaza | candy_forest | candy_night | sea_crossing | cat_residential | dusk 18.3 → 20 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| baseline | 61.0 | 61.7 | 61.0 | 57.5 | 27.1 | 18.8 | 62.1 | 27.5 fps, 153 frames > 40 ms, max 869 ms |
| mobile water shader only (`water.js` MOBILE → true) | – | – | 62.9 | – | 28.5 | 20.0 | – | – |
| **lamp pool, 4 slots, on desktop** (both architectures' `getLampPool(ctx, 4)`) | – | – | 117.6 | – | 79.4 | 38.8 | – | 61 fps, 8 frames > 40 ms, max 1225 ms |
| lamp pool 4 + mobile water | 119 | 119 | 116.3 | 60.6 | 103.1 | 48.3 | – | 61 fps, 7 > 40 ms, **max 8749 ms (cold shader compile, see below)** |
| pixel ratio 1.5 only (live, `--dpr 1.5`) | 119 | 119 | 119 | 116.3 | 55.2 | 32.2 | – | – |
| **lamp pool 4 + mobile water + DPR 1.5** | 120.5 | 120.5 | 120.5 | 120.5 | 119 | **62.5** | 120.5 | – |

Mode-1 running walk on Candy (forest → coast → village) with pool + water at DPR 2: 67.1 fps median (vs 55.9), 1 frame > 40 ms (vs 83). All what-if runs logged 0 console errors. They are not visual verdicts: the pool lights only the 4 nearest lamps, the mobile water drops noise octaves, and DPR 1.5 is softer. Each needs critic frames against baseline before it lands.

Per-toggle GPU savings at full clock (paired, ms saved of the base):

| saved GPU ms | village (12.1) | main street (14.4) | plaza (14.1) | forest (16.0) | night (32.8) | sea (51.8) | residential (14.1) |
|---|---:|---:|---:|---:|---:|---:|---:|
| hide the 11 zero-intensity point lights | 4.77 | 5.98 | 6.04 | 5.62 | – | 29.03 | 5.67 |
| hide all point lights | 5.06 | 6.51 | 6.41 | 5.86 | **25.54** (17 lights) | 29.15 | 6.11 |
| pixel ratio 1.5 | 4.18 | 4.51 | 4.70 | 5.98 | 12.28 | 21.20 | 4.13 |
| pixel ratio 1 | 7.25 | 7.98 | 8.09 | 10.41 | 21.29 | 36.40 | 7.32 |
| the one `terrain_sea` draw | ≈0 | 0.11 | 1.57 | ≈0 | 0.13 | **44.49** | 0.02 |
| whole shadow pass (100-221 draws) | 0.39 | 0.63 | 0.50 | 0.35 | 0.39 | 0.36 | 0.56 |
| sun shadow map 4096 → 2048 | 0.20 | 0.32 | 0.31 | 0.23 | – | 0.23 | 0.28 |
| cull the wholly off-screen `frustumCulled=false` objects (−draws) | 0.13 (−115) | 0.72 (−206) | 0.39 (−201) | 0.19 (−171) | 0.01 (−130) | 0.10 (−211) | 0.43 (−179) |
| the ferry's 2 deck lights only (17 → 15, night) | | | | | **9.77** | | |

At night the light cost is not linear: removing just 2 of the 17 lights saves 9.8 ms, while all 17 save 25.5. This is consistent with register pressure from 17 unrolled light iterations on top of heavy fragment shaders. Culling off-screen objects is mainly a CPU and draw-count win: it saves 1.2-2.1 ms of sync time at the cat spots and 4.2-5.0 ms at night, sea and residential. `?cut=0` (run `cut0`) leaves full-clock GPU unchanged at candy_village (12.07 → 12.34) and cat_plaza (14.07 → 13.87), so the camera cutout's `discard` costs nothing measurable on desktop. (At cat_residential cut=0 draws a different frame, with 81 fewer calls because the old ladder fades and culls, so it is not comparable.)

## Draw sources per system (baseline; main / shadow calls, and how many of the main calls are wholly off-screen)

| system | candy_village: main / shadow (off-screen) | GPU saved if hidden | cat_main_street: main / shadow (off-screen) | GPU saved if hidden | update() mean / p95 / max ms (village · main street) |
|---|---|---:|---|---:|---|
| candyArchitecture | 57 / 40 (21) | −9.88 ¹ | 57 / 40 (**57**) | 0.39 | 0.04 / 0.1 / 0.2 · 0.03 / 0.1 / 0.2 |
| catArchitecture | 2 / 0 (2) | 0.01 | 62 / 28 (0) | 1.04 | 0.01 / 0.1 / 0.1 · 0.02 / 0.1 / 0.1 |
| escape (palace, cave, items) | 39 / 25 (26) | 0.03 | 43 / 26 (37) | 0.20 | 0.04 / 0.1 / 0.2 · 0.04 / 0.1 / 0.2 |
| catCitizens | – | – | 44 / 11 (14) | 0.40 | 0.00 · **1.48 / 1.8 / 2.2** |
| catNature | 4 / 0 (4) | 0.04 | 39 / 15 (1) | 0.78 | 0.08 / 0.2 / 0.2 · 0.09 / 0.2 / 0.2 |
| player (visitor) | 27 / 14 (0) | 0.15 | 28 / 14 (0) | 0.09 | 0.08 / 0.2 / 0.2 · 0.07 / 0.2 / 0.2 |
| candyVegetation | 18 / 8 (0) | 0.10 | – | – | 0.00 · 0.00 |
| inventory | 18 / 0 (13) | 0.06 | 16 / 0 (5) | 0.07 | 0.04 / 0.1 / 0.2 · 0.05 / 0.1 / 0.2 |
| candyCreatures | 13 / 4 (4) | 0.01 | – | – | **0.78 / 0.9 / 1.1** · 0.00 |
| terrain | 12 / 4 (0) | 3.02 | 4 / 1 (0) | 2.00 | 0.00 · 0.00 |
| sourPatch | 9 / 3 (0) | 0.28 | 9 / 3 (9) | 0.21 | 0.45 / 0.6 / 1.4 · 0.48 / 0.6 / 2.3 |
| catContainment | 2 / 1 (2) | 0.02 | 11 / 2 (1) | −0.02 | 0.04 · 0.05 / 0.1 / 0.6 |
| planes | 6 / 0 (2) | 0.03 | 6 / 0 (4) | 0.07 | 0.13 / 0.2 / 0.4 · 0.13 / 0.2 / 1.1 |
| sky | 4 / 0 (3) | 0.57 | 4 / 0 (3) | 0.58 | 0.10 / 0.2 / 0.3 · 0.10 / 0.2 / 0.3 |
| ferry | 3 / 0 (3) | ≈0 | 3 / 0 (3) | 0.00 | 0.03 · 0.04 (sea view: 20 / 11) |
| particles | 2 / 0 | 0.90 | 2 / 0 | 0.10 | 0.06 · 0.04 |
| powerups | 2 / 1 | 0.06 | 2 / 1 | ≈0 | 0.02 · 0.02 |
| camera | – | – | – | – | 0.52 / 3.0 / **11.4** · 0.70 / 4.1 / **11.6** |
| ui | – | – | – | – | 0.27 / 0.5 / 0.6 · 0.32 / 0.5 / 1.0 |

¹ Negative means hiding made the frame slower. The village's buildings occlude sea and terrain that are expensive to shade; hiding them exposes that surface (early-z). At night the same toggle costs +30 ms. **The per-pixel cost of the ground and the sea, times the light count, is the GPU budget.** The full per-spot tables, with top objects and the off-screen names, are in renders/w3_perf/baseline.md.

## Lights and programs over the day/night cycle (run `baseline`, cycle + dusk)

- **Light inventory.** 3 DirectionalLights (sun, which casts 4096² with a box half of 38 and far 366 and is redrawn every frame; moon at intensity 0; skyFill), plus hemisphere and ambient.
  - PointLights that are always visible: candyArchitecture 6 and catArchitecture 6, at intensity 0 all day.
  - PointLights whose `visible` flips at runtime: player fill 1 (night), sourPatch eye lights 2 (on the two hunters within 34 u, `sourpatch.js:3397`), ferry 2 (children of the `sugarfin-deck` mesh, `whale.js:1151`), candyArchitecture room light 1, catCitizens tiger lanterns 2 (`citizens.js:2308`), escape palace and cave 8.
- **Count by hour.** 12 visible / 1 lit from 07:00 to 18:00. 17/17 from 18:30 to 05:00. 15/15 at 05:30-06:00. 15/4 at 06:30. The frame median follows it: 16.6 ms by day, 36-40 ms at night.
- **Every count change recompiles every lit program:**
  - 18:30: 87 links in one frame (865 ms render()), programs 237 → 325.
  - About 18:35, 18:48, 18:52 and 18:54 (18.59, 18.80, 18.87, 18.90 h): 148-171 ms hitches, each 1-2 links (night-only materials appearing for the first time).
  - 19:30: sour patch eyes flip 17 → 15 → 17.
  - 05:30 and 07:00: back down again.
  - 21:00: the camera's moon moment (window 21:00-23:30) turns the lens toward the sea. Main calls go 258 → 410 and 21 links take 145 ms. Materials that switched: catArchitecture 41, escape 32, ferry 17, catContainment 10.
- **Cold versus warm compile.** macOS caches compiled Metal shaders across browser launches, and my runs warmed that cache. The same 87-link dusk step took 0.87 s warm, but **8.7 s** when the light count was one no earlier run had compiled (the pool what-if). The first-ever 21:00 step took 1.34 s for 21 links versus 0.15 s later. So cold compiles cost about 64-100 ms per program and warm about 7-10 ms. **A first-time player's first dusk is a multi-second freeze.** A constant light count removes these compiles entirely, not just shortens them.

## CPU, allocation, uploads (baseline deep pass: CPU profiler + sampling heap profiler with collected objects)

- **Busy CPU** is 45-52% of wall time by day. GC is 0.5-0.8% of busy CPU (12-19 ms per 4.4-16 s). Minor GCs run 23-36 per 600 frames. No GC hitch was seen, but the allocation rate is high.
- **Allocation is 1.0-1.7 MB per frame (61-97 MB/s by day)**, by owning game frame:
  - `world.height()`: 130-345 KB/f. It returns a HeapNumber per call when not inlined across modules, `Math.hypot` adds 64-145 KB/f, and `distToPolyline` returns a new `{d, t}`.
  - three's render path, 350-680 KB/f: `setValueV3f` (boxing uniform3f arguments) 70-230 KB/f, and `getParameters` 108-243 KB/f from the program re-evaluations below.
  - `noise.js` 54-109, `deckY` (`candy/architecture.js:614`) 28-103, `citizens/brain.js` animate 68-73, `islandMask` 34-69, `player/ground.js` pushOut 23-63, `interaction.update` 28, camera `sweepOcclusion` / `occlude` 20-54 KB/f.
- **Program re-evaluations: 32-76 per frame.**
  - Transparent `DoubleSide` materials without `forceSinglePass`: three r170 `renderObject` / `prepareMaterial` draws every such object twice and sets `material.needsUpdate = true` twice per frame. 22-30 objects are affected: every `haloDisc`, `candyArch_flow`/`glass` (candy + escape), `terrain_river`/`waterfall`, `planes_fx`/`blobs`, `creature-shadows`, `syrup-ripples`, night jellyfish/nerd glows, sourPatch blobs, `cat_town_spill`, `sugarfin-foam`/`lampfx`, `cave_hatch_pools`, `bigfling_lamp_pools`, and inventory halos.
  - Program flips from a shared material: inventory `mats.matte` is used by pools with and without `instanceColor`, and the catNature material #310 by plain and instanced meshes; each flips twice a frame.
  - The shadow depth material flips 8-14 times a frame between instanced and plain casters.
- **Uploads**: 261-413 KB of buffer data per frame.
  - particles: 156 KB/f, 6 attributes re-uploaded at full cap (2400 + 1600 slots) whatever the live count (`particles/pool.js:157`);
  - catCitizens: 146 KB/f, all 44 instanceMatrix pools every frame;
  - candyCreatures 30-45, sourPatch 27, planes 10-22, inventory 15-20 KB/f.
  - Textures: 1 upload per frame (0.6 KB).
- **DOM**: 0-4 mutations per frame (say-text, chips, the night vignette pulse 1/f). Negligible.
- **Textures**: 58 textures, about 221 MB estimated. Four are over 2048: the candy, palace and cave sign atlases (2048×2560, anisotropy 16) and catContainment (2304×1792). This is GPU memory, not frame time.

## Camera sweep anatomy (A13)

| spot | sweep frames / 600 | camera update() p95 on sweep frames | its sweepOcclusion (occMs) p95 / max | raycast ms inside it (p95) | non-sweep p95 |
|---|---:|---:|---|---:|---:|
| candy_village | 49 | 11.2 | 11.0 / 11.0 | 10.5 | 0.5 |
| cat_main_street | 55 | 11.2 | 11.0 / 11.4 | 10.6 | 0.6 |
| cat_plaza | 55 | 8.4 | 8.2 / 8.4 | 7.9 | 0.5 |
| candy_forest | 60 | 11.2 | 11.0 / 12.1 | 10.7 | 0.5 |
| candy_night | 93 | 12.6 | 12.6 / 14.5 | 12.2 | 0.6 |
| cat_residential | 53 | **14.2** | 14.1 / 14.2 | 13.7 | 0.5 |
| walk, Cat Island (mode 1 run) | 344 / 4417 | 14.0 | 13.9 / **27.5** | 13.5 | 0.5 |

About 97% of a sweep is three's brute-force `Mesh.raycast` over the merged districts (`occBudget` 40000 ray-triangle tests at 6 Hz, `camera.js:390`). The whole-scene candidate refresh (`refreshCandidates`, 4 Hz) is only 0.5-0.7 ms, but it coincides with a sweep 2-24 times per 600 frames.

## Hotspots, ranked, each with an owner and a concrete trim

Numbers are this baseline's. The "expected" column comes from the what-if runs where one exists.

| # | owner | hotspot (evidence) | trim | expected |
|---|---|---|---|---|
| 1 | RENDER | **Point-light budget.** 12 lights at intensity 0 all day cost 4.8-6.0 ms of 12-16 ms GPU (29 ms at sea). 17 at night cost 25.5 of 32.8 ms. Every count change recompiles all lit programs: dusk 87 links (0.87 s warm, about 8.7 s cold), 148-171 ms follow-ups, and flips from sour patch eyes, tiger lanterns, the room light, the player fill and palace/cave. | Run `terrain/lamppool.js` on desktop too: `getLampPool(ctx, 4)` created at load, always visible, a count that never changes, driven only by intensity. Make every other PointLight an anchor (with `priority` where it must win): the player fill, sour patch eyes (`sourpatch.js:1096`), the ferry deck pair (`whale.js:1151`, children of a mesh), tiger lanterns (`citizens.js:1818`), the palace ×3+ and the cave, and the candy room light (`architecture.js:504`). Never toggle `PointLight.visible`. Let halos and emissive carry distant lamps. | Pool only: plaza 61 → 118 fps, night 27 → 79, sea 19 → 39, dusk 27.5 → 61 fps with 153 → 8 frames over 40 ms. Once every light is in the pool, dusk has no compile at all. |
| 2 | RENDER | **Sea shader** (`terrain/water.js`): the one `terrain_sea` draw costs 44.5 of 51.8 ms of GPU at the crossing, 1.6 ms at the plaza, and dominates every horizon view (the mode-2 walk, the moon moment, the west coast). | After #1, use the mobile water path on desktop (35 vs 57 noise lookups, `water.js:162`), or keep the desktop octaves only within about 60 u of the lens and fade to the mobile set beyond. Critic frames on sea_crossing, sky_crossing and a night harbour. | Water alone +1-1.5 fps (the lights dominate). On top of the pool: sea 38.8 → 48.3, night 79 → 103. |
| 3 | RENDER (orchestrator: main.js sets the pixel ratio) | **3200×2000 MSAA fill.** DPR 1.5 saves 4.1-6.0 ms by day, 12.3 at night and 21.2 at sea. | Dynamic resolution: pixel ratio 2 → 1.5 when the 1 s p90 frame interval goes over 18 ms, back to 2 under 12 ms (with hysteresis, changes at most every 2 s). Needs a `renderer.setPixelRatio` + `setSize` hook on a timer, not per frame. Or a fixed 1.75 cap. | Pool + water + DPR 1.5: **every spot ≥ 62.5 fps, 120 fps at 6 of 7, no frame over 40 ms**. |
| 4 | CAMERA | **Sweep-frame hitch (A13 FAIL)**: 8.4-14.2 ms p95 per sweep, 27.5 ms max, about 97% of it `Mesh.raycast` on merged districts. Once the GPU is fixed this is the visible 120 → 60 Hz stutter, 6 times a second. | (a) A BVH: vendor three-mesh-bvh (MIT) under vendor/, `computeBoundsTree()` lazily per sweeper geometry, `acceleratedRaycast` with `firstHitOnly` for the ladder rays; the triangle budget becomes unnecessary. (b) Without vendoring: a per-geometry XZ cell grid of triangle indices (about 8 u cells, built once), testing only cells the segment crosses. (c) As a stop-gap, time-slice the 40k budget across 3 consecutive frames (about 3.5 ms each) and offset `candT` so the 4 Hz refresh never lands on a sweep frame. | (a)/(b): sweep ≤ 1 ms, A13 passes. (c): about 4 ms per frame, which passes the 6 ms limit. |
| 5 | RENDER | **No culling on desktop** for the island-wide merges and several pools: 75-141 wholly off-screen objects are drawn per frame (candyArchitecture draws all 57 + 40 shadow on Cat Island; escape 38-49 + 25-49 shadow; catCitizens 44; inventory 12-18; creatures, sourPatch, planes, ferry, powerups). In the shadow pass three draws every `frustumCulled=false` caster regardless of the light frustum. | Flip the kit's tier default (`candy/architecture/kit.js:246`) so merges are culled on desktop too (bounds are exact, and it is pixel-verified on mobile), and use `instcull` tiles for the island-wide merges (desktop draws ≤ the same calls; casting tiles stay in the key light frustum). Set `frustumCulled=true` with bounds on `escape/palace.js:1097` and `cave.js:420`. For static pools: `computeBoundingSphere()` + pad, then cull. For moving pools (citizens `rig.js:86`, inventory `inventory.js:92`): recompute bounds at 2-4 Hz, or set `count` to the in-view subset. | −115 to −211 GL draws and 1.2-5.0 ms sync (mostly CPU) per frame; main + shadow draws ≤ 450 everywhere. |
| 6 | RENDER + CPU (each owner flips its own materials) | **Double-pass transparent materials**: 22-30 objects drawn twice with 2 `needsUpdate` each per frame; 32-76 program re-evaluations per frame (108-243 KB/f garbage in `getParameters`); plus the shared-material flips. | Set `forceSinglePass = true` on transparent DoubleSide materials (or `FrontSide` for flat decals, halo discs and pools): every `haloDisc`, `flow`, `glass`, `terrain_river`/`waterfall`, `planes_fx`/`blobs`, `creature-shadows`, `syrup-ripples`, the glows, sourPatch blobs, `cat_town_spill`, `sugarfin-foam`/`lampfx`, the cave/fling pools and the inventory halos. Give inventory's tinted pools and catNature's instanced meshes their own material. | −22 to −30 draws, about 30-70 fewer program evaluations per frame, about 0.3-0.8 ms CPU. |
| 7 | CPU (NPC adopter) | **catCitizens**: 1.4-1.75 ms of update() per frame (the largest system), 44 instanced part pools (44 main + 11 shadow draws, all unculled, 14-36 wholly off-screen), 146 KB/f of instanceMatrix re-uploads, 68-73 KB/f of allocations in `brain.js` animate. | (a) Animation LOD: cats beyond about 60 u, or off-screen, pose and `sync()` at 10-15 Hz, staggered; skip `instanceMatrix.needsUpdate` on pools whose instances did not move. (b) Merge parts: one `BatchedMesh` per material (fur, skin, eye, dark, cloth, prop, glow: ≤ 7 draws; three r170 with WEBGL_multi_draw), or a merged cat geometry with a part-index attribute and a bone-matrix DataTexture. (c) Remove the allocations in `brain.animate`. | −35 to −40 draws, about 1 ms CPU, −100 KB/f of uploads. |
| 8 | CPU (orchestrator owns core/world.js; ground and creatures call it) | **Allocation 1.0-1.7 MB/frame**, led by `world.height()` (130-345 KB/f) plus `Math.hypot` (64-145), `noise` (54-109), `islandMask`/`rawEdge`, `deckY` and `ground.pushOut`. | In world.js: replace `Math.hypot` with `Math.sqrt(dx*dx + dz*dz)` and give `distToPolyline` an out-param or scratch. Bake the height field once (terrain already bakes `FIELD_RECT` 512×272 for the water) and have the per-frame callers (player feet and ground, creatures, sourPatch, `deckY`) sample it bilinearly; keep `height()` exact for placement at create(). | About −0.5 to −0.9 MB/f, fewer minor GCs, about 0.5 ms CPU. |
| 9 | CPU (fx) | **Particles** re-upload 6 attributes at full cap every frame (156 KB/f) whatever the live count. | In `particles/pool.js:157`, `attr.clearUpdateRanges(); attr.addUpdateRange(0, count * itemSize)` for aPos, aCol and aAttr. | −140 KB/f of uploads. |
| 10 | RENDER (sky / fx) | **Shadow pass CPU**: 100-221 extra draws per frame (0.35-0.63 ms GPU; the 2048 map saves only 0.2-0.3 ms); redrawn every frame on desktop. | After #5, only casters in the light frustum draw. Also enable sky's `shadowClock` (mobile's redraw clock) on desktop at about 30 Hz. Keep 4096. | Halves shadow-pass CPU (about 0.4-2 ms sync). |
| 11 | CPU (ground core) | **Visitor**: 27-28 main + 14 shadow draws; 16-17 part meshes plus 11 `visitor_silhouette` copies drawn every frame even when he is not occluded (`player/visitor.js:343`). | Show the silhouette set only while the camera reports him blocked (`camera.occBlocked > 0` or `cutK > 0`). Merge static parts by material. Cast the shadow from one merged stand-in. | −11 to −20 draws. |
| 12 | CPU (weapons / inventory) | **Inventory**: 12-18 instanced pools (one per visual), all unculled (up to 13 of 18 wholly off-screen at the village), and a shared material flipping programs. | Pools draw only pickups within about 70 u (set `count`), then add bounds and culling; 2 BatchedMeshes (gloss and matte) instead of one pool per visual. | −10 to −16 draws. |
| 13 | CAMERA | **Moon-moment first-frame compile** at 21:00: 21 links, 145 ms warm and 1.34 s cold, and the lens then frames the sea. | Solved by #1 (constant light count). In addition, warm the moon framing with `renderer.compileAsync(scene, moonCam)` about 2 s before the cinematic (`KHR_parallel_shader_compile` is available). | Removes the 21:00 hitch. |
| 14 | CPU (NPC adopters) | **candyCreatures** 0.66-1.27 ms and **sourPatch** 0.39-0.67 ms of update(); more at the sea view. | Distance-based animation rate for creatures more than 60 u away. | About 0.5 ms. |
| 15 | RENDER (world-tier / escape) | **Textures**: about 221 MB, three 2048×2560 sign atlases at anisotropy 16 (candy plus two in escape, which duplicate each other). | Share the candy atlas with the palace and cave, or size atlases to their content; anisotropy ≤ 8. | Memory only (about 50-60 MB). |
| 16 | CPU (ferry) | **Ferry**: 20 main + 11 shadow draws near the pier and at sea; its deck lights are part of #1. | Merge static hull and deck parts by material; move the lights to the pool. | −10 to −15 draws in ferry views. |

**Order of work:** #1, then #2 and #3 (these three alone meet Contract J at every spot measured), then #4 (A13, and the 120 Hz stutter that becomes visible once the GPU is fixed), then #5 and #6 (draw calls and the shadow pass). #7-#16 are CPU headroom and hygiene.

## Acceptance protocol for the builders (before / after, same machine, nothing else rendering)

- `node tools/fpsbench.mjs --label after_<owner>` (everything, about 8 min). Compare with `renders/w3_perf/baseline.md`. For one spot: `--spots <spot> --no-deep --no-dirty`.
- To measure a trim before editing: `--patch "src/<file>|<from>|<to>"`.
- A dusk result is only comparable with the same Metal-cache state. Run `--dusk` twice and use the second run as the warm number. A first run after a light-count change is the cold number.
- Still required and unchanged:
  - `node tools/camvis.mjs` (camera), plus `--script perf --gl hw` for A13;
  - `node tools/mobilebench.mjs --q mobile` (≤ 220 calls and ≤ 550k tris at the six spots);
  - `node tools/render.mjs` views with 0 console errors, `node --check` on every touched file;
  - critic frames (no visual regression) for anything that changes pixels: the pool, water, DPR, culling and forceSinglePass.

## Caveats

- The live GPU timer (the `gpu` column in the bench md) is not a cost figure on ANGLE Metal. It spans command buffers at whatever clock DVFS chose, so it reads higher than the frame interval. For cost, use the paired toggles (full clock) and the frame interval.
- At candy_village and cat_residential the paired sync deltas carry a constant +3.5-4 ms offset (base-vs-base reads about 0, and every config "saves" about 3.7 ms of sync with about 0 GPU). Read GPU deltas there. The other spots' sync deltas are clean.
- A per-system "hide" toggle also removes lights parented under its meshes (the ferry deck lights). Such rows are flagged `(point lights 17→15!)` in the bench md.
- Programs grow across one session (231 → 575) as new places and times compile variants. Spots measured later in a session are not colder or hotter because of it; no compiles happened inside any day-spot sample.
- The walk's forward and back directions often pin the visitor against walls; use the `path` field in the json to see where each hitch happened.
