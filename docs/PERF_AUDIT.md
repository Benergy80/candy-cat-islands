# PERF AUDIT — 2026-09-22 (iPhone tier workflow auditor; WebKit + Chromium, iPhone 13 emulation)

Read by the final frame-rate pass (BRIEF Contract J). Numbers are the PRE-tier baseline; the mobile tier since landed (see git log).

## Baseline table
Every spot below measured the same in WebKit and Chromium at q=mobile, q=high and q=auto; only the timings differ. "Shadow" columns are the shadow-pass draws that game.stats() does not count. Contract I goal on mobile: ≤ 220 calls, ≤ 550k triangles.

| spot | calls (main) | + shadow calls | tris (main) | + shadow tris | geometries | textures | programs | WebKit ms/frame, mobile / high | Chromium ms/frame, mobile / high | Chromium frameMs, mobile / high | console errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| candy_village (-140,40 @11) | 218 | 99 | 726k | 392k | 276 | 30 | 104 | 11 / 14 | 447 / 1020 | 3.2 / 4.5 | 0 |
| cat_main_street (118,0 @12) | 334 | 142 | 1.08M | 647k | 396 | 39 | 115 | 16 / 17 | 724 / 1613 | 7.6 / 6.8 | 0 |
| cat_plaza (78,18 @11) | 325 | 129 | 1.12M | 579k | 407 | 44 | 120 | 16 / 17 | 541 / 1895 | 3.7 / 5.8 | 0 |
| candy_forest (-200,-20 @14) | 212 | 100 | 699k | 397k | 409 | 44 | 120 | 15 / 23 | 418 / 1102 | 3.5 / 3.6 | 0 |
| candy_night (-140,40 @23) | 262 | 99 | 738k | 392k | 424 | 50 | 212 | 31 / 44 | 496 / 1870 | 589 / 667 (shader recompile) | 0 |
| sea_crossing (free view (0,22), dist 90, @17) | 269 | 218 | 998k | 825k | 461 | 50 | 216 | 38 / 42 | 541 / 3097 | 4.4 / 3.7 | 0 |

"ms/frame" is one render forced to finish (median of 3). WebKit uses this Mac's Apple GPU; Chromium uses software GL. q=high draws 1 more shadow call than q=mobile (powerups is the only system that trims).

**Per system at the two key spots (q=mobile, WebKit): main calls / main tris, then + shadow calls / shadow tris**

| system | candy_village | cat_main_street |
|---|---|---|
| candyArchitecture | 57 / 195k, +40 / 180k | 57 / 195k, +40 / 180k (not culled) |
| catArchitecture | 2 / 2k | 62 / 194k, +28 / 184k |
| escape (palace, cave, items) | 39 / 73k, +25 / 60k | 41 / 76k, +28 / 63k |
| catCitizens | 0 | 44 / 128k, +11 / 77k |
| catNature | 4 / 4k | 39 / 210k, +15 / 83k |
| player (visitor) | 29 / 27k, +14 / 14k | 31 / 27k, +14 / 14k |
| candyVegetation | 18 / 168k, +8 / 73k | 0 |
| inventory | 18 / 32k | 16 / 25k |
| candyCreatures | 13 / 42k, +4 / 25k | 0 |
| terrain | 10 / 91k, +4 / 7k | 5 / 127k, +1 / 5k |
| catContainment | 2 / 13k, +1 / 12k | 12 / 20k, +2 / 19k |
| sourPatch | 9 / 32k, +3 / 21k | 9 / 32k, +3 / 21k |
| planes | 6 / 13k | 6 / 13k |
| sky | 4 / 29k | 4 / 29k |
| ferry | 3 / 2k | 4 / 2k |
| powerups | 2 / 2k | 2 / 2k |
| particles | 2 / 2k | 2 / 1k |

## Hotspots, ranked (desktop AND mobile relevance)
1. candyArchitecture: 57 calls / 195k tris + 40 shadow calls / 180k at EVERY spot, including Cat Island and the sea. Cause: candy/architecture/kit.js:364 and architecture.js:387/423 set frustumCulled=false on every merged mesh (bounds are already computed), and each merge spans the whole island (~100 u). Trim: turn culling back on (saves about 57 + 40 calls on Cat Island), split merges into 4–6 districts, and on mobile stop small trim (sprinkles, jellybeans, spinners) casting shadows.
2. escape (mostly the palace): 39–45 calls / 73–76k tris + 25–47 shadow calls at every spot. Cause: escape/palace.js:783/1086 and 3 sites in escape/cave.js set frustumCulled=false. Palace and cave each build their own full 2048x2560 sign atlas for a handful of signs (about 27 MB GPU each). Trim: turn culling on, size atlases to their content or share the candy one, no shadows from palace detail on mobile.
3. catArchitecture: 62 calls / 194k + 28 shadow / 184k at cat_main_street (45 shadow calls at sea_crossing). Many small same-material meshes (glow x8, metal x5, window x5, sign x5); 4 sign-atlas pages at 2048² (about 85 MB); cat_town_spill is never culled (still draws 2 calls from 275 u away). Trim: one mesh per material per district, shadows only from building shells, 1024 atlas pages on mobile.
4. shadow pass (all systems): +99 to +218 calls and +392k to +825k tris per frame that game.stats() never counts (three r170 resets its counters after the shadow pass). Low sun plus a 366-deep shadow box catches a slice across a whole island (218 shadow calls at sea_crossing). Trim: per Contract I, only the visitor, NPCs and buildings cast on mobile; a shorter shadow far plane; refresh the shadow map every 2–3 frames.
5. point lights (candyArchitecture 6 + catArchitecture 6, always visible even at intensity 0; +5 at night from sourPatch 2, ferry 2, player 1): every lit pixel loops over 12–17 lights, and the count change at dusk recompiles about 108 programs (104 → 212; first night frame 589–667 ms in Chromium). Trim: on mobile keep a small CONSTANT light count (0–4, pooled to the nearest lamps), switch lights by intensity instead of visibility, let emissive surfaces and halo discs carry the glow.
6. catNature: 39 calls / 210k + 15 shadow / 83k at cat_main_street (5358 instances, 16 casters). Trim: about 45% of instances on mobile, only trees (cypress, pine, palm, olive) cast shadows, simpler tree meshes.
7. catCitizens: 44 calls / 128k + 11 shadow / 77k for 68 cats (44 instanced meshes, one per body part; about 1.9k tris per cat). Trim: combine parts into 8 or fewer instanced meshes, a cheap single mesh beyond 40 u, cap at about 40 cats on mobile, blob shadows instead of the shadow map.
8. candyVegetation: 18 calls / 168k + 8 shadow / 73k at the village (3431 instances; the bulk is grass 660, ground mats 640, gumdrops 512, cotton 302). Trim: 45% of instances on mobile; only the gummy, lollipop and pine trees cast shadows.
9. player (visitor): 29–31 calls / 27k + 14 shadow calls for ONE character (18–20 part meshes plus 11 visitor_silhouette x-ray copies). Trim: merge the static parts by material (about 5 calls), one merged silhouette mesh drawn only when the visitor is hidden, cast shadows from one merged stand-in.
10. terrain: only 5–12 calls but 91–141k tris; both islands' ground (49.5k each) plus the sea (18k) always draw (candy ground draws from Cat Island). Trim: half-resolution ground grids and a roughly 6k-triangle sea on mobile.
11. textures (world-tier + escape + catContainment): 4 textures over 2048 px — candy architecture atlas 2048x2560, palace atlas 2048x2560, cave atlas 2048x2560, catContainment 2304x1792. About 221 MB of textures in total (8 canvas atlases hold about 186 MB, each with a same-size CPU canvas that iOS caps). Anisotropic filtering at 16 on the candy atlases. Trim: half-resolution atlases on mobile, anisotropy 4 or less, fix the two escape duplicates.
12. sky (shadow maps): sky.js hard-codes 4096² sun AND moon shadow maps; touch.js caps them to 1024 only when there is no ?q= param, so ?q=mobile keeps about 128 MB of shadow maps (the real-phone path gets about 8 MB). Trim: sky.js reads ctx.state.mobile at create() and uses 1024; drop the sea mist (12.4k tris) on mobile per Contract I.
13. inventory: 12–18 calls / 16–32k tris, no shadows (25 pickup pools). Trim: one instanced mesh per material, or draw only pools within about 60 u.
14. ferry: 20–22 calls / 27k near the pier and at sea (29 meshes, 16 shadow casters). Trim: merge the hull and deck meshes by material; no shadows from small parts on mobile.
15. candyCreatures + sourPatch: 13–20 and 9–16 calls (+4 and +3 shadow calls); creatures go from 13 calls by day to 20 at night (glow meshes). Minor; cap the night glow meshes on mobile.

## Mobile tier verification (after)
q=mobile: WebKit and Chromium, iPhone 13 landscape 844x390, pr 1.5, from tools/mobilebench.mjs --label vfy2. Shadow calls come from a scratch copy of the bench run with &shadowclock=0 (the stock bench shows +0 shadow on mobile; that is a measurement artefact of the redraw clock).

| spot | mobile calls WK / CR | mobile tris WK / CR | shadow calls (mobile) | geoms | tex | progs | errors WK/CR | ≤220 & ≤550k |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| candy_village | 162 / 162 | 387.3k / 387.3k | 57 | 210 | 27 | 82 | 0/0 | PASS |
| cat_main_street | 215 / 215 | 501.7k / 501.7k | 54 | 313 | 33 | 96 | 0/0 | PASS |
| cat_plaza | 214 / 214 | 436.2k / 436.2k | 47 | 335 | 38 | 101 | 0/0 | PASS |
| candy_forest | 131 / 131 | 283.4k / 283.4k | 59 | 358 | 38 | 103 | 0/0 | PASS |
| candy_night | 191 / 191 | 401.3k / 401.3k | 57 | 373 | 45 | 184 | 0/0 | PASS |
| sea_crossing | 194 / 194 | 464.0k / 464.0k | 116 | 377 | 45 | 186 | 0/0 | PASS |

q=high (WebKit = Chromium) against the audit baseline bench_high_webkit.json:

| spot | main calls | main tris | shadow calls | shadow tris | Δ |
|---|---:|---:|---:|---:|---|
| candy_village | 218 = 218 | 726.0k = 726.0k | 100 = 100 | 394.1k = | 0% |
| cat_main_street | 334 = 334 | 1.08M = | 143 = 143 | 649.6k = | 0% |
| cat_plaza | 325 = 325 | 1.12M = | 131 vs 130 | 581.1k vs 580.9k | +0.8% shadow calls |
| candy_forest | 212 = 212 | 699.2k vs 699.1k | 101 = 101 | 399.0k = | 0% |
| candy_night | 262 = 262 | 737.5k = | 100 = 100 | 393.9k = | 0% |
| sea_crossing | 269 = 269 | 998.3k vs 998.4k | 221 vs 219 | 838.0k vs 827.4k | +0.9% calls, +1.3% shadow tris (within 2%) |

Frame time (software GL, relative only): mobile frameMs is 2–7 vs 3–12 on high (WebKit). Texture memory is 97.5 MB vs 221 MB. Shadow maps are 8 MB (1×1024²) vs 128 MB.

Independent packed-vs-bypass pixel diff (instcull cullDebug.bypass, same frame, >8/255, 740,610 px). 104 gameplay-camera poses were tested (8 points × 8 azimuths + 4 walks each) plus the 6 spots: 0 px differ at every pose. Worst pose was 193 calls / 435.8k tris. Scenic and flying views (sky_crossing, sky_dawn_east, cam_flying, flyer_air_thermal, flyer_air_strait): 0 px differ from frustum and shadow packing alone. 212–828 px (≤0.11%) differ only when the vegetation maxDist ground-cover cut is included. Determinism (same frame rendered twice): 0 px. Console errors: 0.

## Critic on the mobile tier
score 7 same_game True
The mobile tier cuts too much vegetation close to the camera. candyVegetation drops to 36–47k tris against 160–168k on high. Trees also stop casting shadows: candyVegetation makes 0–1 shadow calls against 8–9 on high, and catNature makes 1 against 15. The result is that the first 10–25 m in front of the camera is bare ground with trees that float without shadows. Examples: the dawn village foreground (bottom-centre) loses its gumdrops, candy-cane clusters and grass tufts and shows only the swirled green-brown ground. The Gummy Forest and Welcome Plaza gummy trees and palms have no shadow under them. The Main Street meadow (left third) has about half the tufts and no shadows from trees, rocks or cats. The night meadow in front of the village is bare teal ground where high has dense dark grass blades, mushrooms and gumdrops. Fix: in the mobile tier, keep full-density ground scatter (candyveg_grass/mat/mint/gumdrop/cotton/cream plus the cat-island tufts and lavender) inside a ring of about 25 m around the player and fade it out past that. Turn castShadow back on for candyveg_gummy_mid, gummy_sap, lolli and pine and for the catNature tree and palm instances. If that is still too expensive, add a blob-shadow decal under each trunk. There is room at ground level: final mobile candy_forest is 131 calls / 283k tris and candy_village is 162 / 387k, against the ≤220 / ≤550k contract. Keep the scatter tied to the player, not the whole map, because flying views are already over budget (cam_flying 392 calls / 1.10M tris, sky_crossing 291 / 828k).
- Missing shadows where they matter: on mobile, gummy trees, palms, pines, rocks and cat citizens on grass cast no shadow (catNature 1 shadow call vs 15 on high). In the Gummy Forest and Welcome Plaza frames the trees read as floating cut-outs. Desktop tour3/candy_forest gets most of its Pikmin look from those shadows.
- Bald areas: mobile ground scatter is roughly 50–75% sparser in the near field. The worst spots are the dawn foreground, the night meadow, the shore slope behind the Sugarfin ferry (bare pink-brown sand where high has green tufts and flowers), and the Main Street meadow. The swirled candy ground is fine as a backdrop but looks muddy with nothing on it.
- Aliasing on mobile (pr 1.5, apparently no AA): visible stair-stepping on the ferry awning stripes, the lifebuoy, the lantern frame, roof tiles and tree canopies (mobile_final_ferry_lanterns, main street). High renders the same edges clean. Add FXAA/SMAA or MSAA on the mobile tier.
- The HUD crowds the scene at 844x390 on every tier. The dialogue box (~53% of screen width), the place card and the 'Tiger Time' or event banner stack over the centre 40–50% of the frame and hide the player (cat_night, candy_night, main_street, sea_crossing). On desktop the dialogue box takes about 3% of the frame. On iPhone, dock it at the bottom edge between the joystick and the buttons, shrink it to two lines, and auto-hide the place card while dialogue is open.
- Place cards go stale: 'Gummy Forest' shows over Gumdrop Village at night (the minimap says Gumdrop Village), 'Wing Nut Field' stays up while flying over Candyland (flyer_air_thermal), and 'Main Street' shows inside Meow Donald's.
- Dull water and placeholder areas on every tier: the sky_crossing and sea foreground is a flat grey-blue swirl with no sparkle or specular. The night harbour water is flat saturated blue. The cave corridor is flat pale-blue slabs with the camera inside a translucent wall. The palace escalator is a maroon box with a pink glow. The sky_night village has an unlit black stacked tower.

## Builder weaknesses (open items)
### world-tier
- cat_main_street is at 215 calls, only 5 under the cap. catCitizens still draws 44 calls / 128k tris with no mobile path (NPC adopter), and catContainment draws 12 calls.
- catContainment's 2304×1792 scenery canvas is still over 2048 on mobile. It belongs to the containment owner.
- The kit-tier defaults (culling, halved atlases) now change escape's mobile rendering from my file (candy/architecture/kit.js). It is pixel-checked at 0 px, but the escape owner should know. Their pending explicit fix would now change nothing.
- The maxDist cut on ground cover, from the first world-tier pass, is the only visual difference between packed and unpacked: 0 px at the gameplay spots, about 450–850 px (≤0.1% of the frame) of distant grass and flowers in flying views. Cells beyond 130–160 u can still pop by a few pixels.
- Instanced species still raycast only their packed instances. When a weapon shrinks a blade, the change is overwritten at the next repack, so a burned blade can reappear and another blade can briefly glitch. This comes from the first world-tier pass.
- The index buffer is rewritten and re-uploaded when the set of visible tiles changes, up to ~100k indices for the biggest Candyland merge. This happens in bursts while the camera turns, not every frame.
- Skipping an empty pass relies on a negative drawRange.count, which makes vendored three r170's renderBufferDirect return early. A three upgrade must re-check this. setProgram still runs for that mesh, but no draw is issued.
- The mobile tier uses more index memory: a static master index plus a dynamic copy per packed mesh (about 2× the index memory of the unpacked desktop merges; around 3–4 MB for both islands).
- Camera issue (camera-owned, not world-tier): at cat_monument the camera fades cat_heights_matte and un-fades it again while the lens is still 1.2 u inside the Heights roof, so a screenshot can show the roof slab. It reproduces identically with the original world-tier files.
- Desktop fly and sky views differ by ±1 call at frustum edges from the older baseline because the camera and flyer builders are changing framing at the same time. The 6 gameplay spots are identical.
### fx-tier
- The sea shader lives in terrain/water.js (world-tier), so the actual sea did not get a cheaper mobile path (fewer octaves, no refraction, about 18k tris). I only moved the ferry's own foam, bow wave and wake to Lambert. World-tier or the orchestrator needs to add a MOBILE branch in water.js.
- tools/mobilebench.mjs now reports +0 shadow calls at q=mobile, because its measurement renders don't advance the game and so never trigger the shadow redraw clock. Anyone comparing shadow numbers must set ctx.systems.sky.shadowClock=false (or load with ?shadowclock=0) before measuring.
- At midday gameplay spots the far-plane cut saves no shadow draws: the remaining draws are mostly meshes with frustumCulled=false (candyArchitecture about 40, escape about 25) plus the visitor's 14 part meshes, all outside my files.
- The 1024² shadow map is visibly softer (0.074–0.094 world units per texel in the gameplay box). normalBias is allowed up to 0.2 to avoid acne, which can leave a small gap where a small prop meets its shadow.
- Shadows of moving casters (visitor, NPCs, ferry) lag by up to one frame because the map is redrawn every 2nd frame at 60 fps.
- Ferry at night on mobile: the flat deck glow replaces the PointLight pool, so the life ring, rails and captain are no longer lit warm. Her main-pass draws are unchanged (20–23); merging her parts would mean editing ferry/whale.js, which is not in my list.
- Mobile scenic shots show 28 of the 54 clouds; they are the same shapes and positions as desktop.
- Live particle counts are about 45–57% of desktop rather than 40%, because lamp halos and light pools keep full rate. The pool caps themselves are 40%.
- Shader program jumps at dusk on mobile (88 → 170 → 253 programs at about 18:30 and 19:50) come from other systems' PointLights switching on; sky and ferry no longer change the light count.
- Sky culling uses the previous frame's camera with a 0.06 rad margin. A camera jump of more than about 3° in one frame from a downward view to a sky view could show the sky one frame late; the free-view snap re-grades on time:set.
- frameMs under software GL is not iPhone speed; the WebKit numbers use this Mac's Apple GPU.
### pwa
- The PWA is still not live on disk. index.html belongs to the touch owner and I did not edit it or tools/serve.mjs. The orchestrator or touch owner must run `node icons/src/link-pwa.mjs --apply` (or paste its 4 lines after </title>) once the touch builder has finished with index.html.
- The dev server keeps sending the manifest as application/octet-stream until someone restarts it after --apply, and I was told never to restart it. Chrome accepts the manifest anyway, and GitHub Pages already sends the correct type.
- Playwright WebKit cannot test Safari's actual Add to Home Screen flow. The iOS home-screen icon, the 'Candy & Cat' label and full-screen launch are checked from the markup and the files, not on a real iPhone. A 2-minute test on a real phone after deploy is still worth doing.
- iOS ignores the manifest's background_color for its launch screen and would need apple-touch-startup-image images, so iOS shows a plain launch screen before the dark loading screen. Only Android uses #0b0a12 on its splash.
- The manifest now uses the touch owner's theme-color and home-screen title. If either changes in index.html later, `node icons/src/link-pwa.mjs` reports the theme-color mismatch as FAIL and the title mismatch as WARN; the matching manifest value then needs to change too.