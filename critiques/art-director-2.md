# Art Direction pass 2 — whole world, end of build wave 2
Fresh-context art director. Judged from rendered frames only (`renders/tour3/*` — 56 views —
plus ~15 of my own in `renders/ad2/*`). Reference bar unchanged: FarmVille (readable chunky
props, saturated-but-quiet ground, authored density) and Pikmin (oversized lush nature, soft
light, strong silhouettes, tiny creatures with personality).

**Blind pick, whole game (was: Cat = TOSS-UP 4, Candy = THEIRS 5):**
Cat Island = **OURS (confidence 3)**. `cat_arrival`, `cat_night`, `cat_meow_donalds`,
`cat_citizens_loaves` and `sky_dawn_harbor` would each beat an average FarmVille frame on
writing and lighting. Candyland = **TOSS-UP (confidence 2)**. `palace_wide`,
`candy_cupcake_wide` and `candy_peak_wide` are genuinely strong; `candy_overview`,
`terrain_cliff_face` and `candy_forest` are still coloured rubble, just *denser* coloured
rubble. Wave 2 closed most of the gap by building three real landmarks on Candyland
(Palace, Cupcake, Frosting Peak) rather than by fixing the ground under them.

**The one headline finding of pass 2 is not on either island — it is between them.**
There is no sea and no terrain outside a radius around the player. See §2.0. Every frame that
critics (including me in pass 1) have been calling "milky white sea" is not water rendered
badly; it is **empty sky where the water and the far island should be**. `renders/ad2/
cat_from_north_sea.png` and `renders/ad2/candy_from_north_sea.png` show both islands as
props floating in a blue void with no landmass under them. That is the single biggest thing
standing between this and a world.

---

## 1. PASS-1 TOP 15 SCORECARD

| # | System | Pass-1 ask | Status | Evidence |
|---|--------|-----------|--------|----------|
| 1 | player/camera | capsule occlusion probe to the head; fade blockers; **cull meshes containing the lens**; ship 31 / 0.64 | **PARTLY — the worst item still open** | 31/0.64 shipped and the player reads as a human (`candy_peak`, `inv_caramelizer` — he has a face, freckles, a camera). But the player is **invisible or reduced to a floating hat in 14 of the 56 tour frames**: `candy_arrival`, `cat_arrival`, `cat_plaza`, `cat_park`, `cat_gym`, `cat_harbor`, `cat_lighthouse`, `cat_citizens_loaves`, `candy_lake` (hat only), `cat_citizens_main_noon` (hat only), `ferry_crossing`, `sea_crossing`, `sky_dawn_harbor`, `candy_cupcake_wide`. And the cull-when-lens-inside rule was *not* implemented: `candy_in_cupcake` is now a translucent ghost-soup of the whole landmark. |
| 2 | ui | close stale dialogue; cap toasts; landmark name not island name; anchor prompts | **PARTLY** | Landmark banners + subtitles are in and lovely ("mind the tails", "all motions carried by nap"). Minimap night-tints **on Candyland only** (`candy_night` purple vs `cat_night` still daytime green at 22:00). But **`Rasp: "…"` is still open with a literal ellipsis** in `candy_lake`, `candy_cupcake_bite`, `palace_throne`, `candy_dusk` — the exact bug pass 1 named. Banner goes stale ("Sugar Pier" while standing at the Candy Palace in `candy_palace`, at the Great Cupcake in `candy_cupcake_wide`, inside the cave in `cave_corridor`). Half the Cat landmarks fall back to the generic subtitle "Welcome! Stay as long as you like. Longer." |
| 3 | candy architecture | Great Cupcake: apron, stepped wafer base, frosting spiral, cherry at 30 u, a bite you can walk into | **RESOLVED (exterior)** | `candy_cupcake_wide` — wafer case, three frosting tiers with a visible spiral, cherry with a stem, a deck and wafer stair. Best silhouette on Candyland after the Palace. The bite itself still doesn't read (`candy_cupcake_bite` shows a red crystal shard in a black void). |
| 4 | cat architecture | raise the WELCOME banner so it clears 9 u | **RESOLVED** | `cat_arrival`, `occ_pier_walk` — the "THANK YOU FOR STAY[ING] / and staying. and staying." arch clears the path; nothing blocks the player there any more. |
| 5 | particles | cut the white speck field ~70%, tint per island, glow only at night | **NOT RESOLVED** | White specks are still in ~80% of frames and are worst where they hurt most: `candy_peak` (white dandruff on white frosting), `cat_lighthouse` and `cat_gym` (reads as snow on a Mediterranean island at 16:00), `candy_village` (4-point stars over everything), `candy_arrival` (a *cloud of white angular shards* mid-frame). |
| 6 | candy vegetation | break the gummy monoculture: three size tiers, clustered, ≤5 hues/cluster, walkable clearings | **PARTLY** | Size tiers landed. Clustering and hue discipline did not: `terrain_cliff_face` is ~10×12 near-identical bears in 14 hues on a uniform grid; `candy_forest` and `candy_overview` are the same charge. |
| 7 | sky | dawn ramp, moon disc + stars, visible horizon | **MOSTLY RESOLVED — best-executed item in the list** | `sky_dawn_harbor` (05:53) is a real apricot sunrise with mist and a lit lantern. `cam_moon_moment` is the prettiest frame in the game: moon with halo, star field, violet gradient, soft night clouds. **Horizon still absent** — but that is terrain's fault (§2.0), not sky's. |
| 8 | terrain | a real cliff at Gumdrop Cliffs: 12–18 u drop, two ledges, a beach, a bounce-down route | **PARTLY** | `terrain_cliff_face` now has a boulder-strewn slope running down to water. There is still no **edge** — no ledge, no drop, no vertigo, nothing you'd bounce *off*. |
| 9 | citizens | 20 cats on Main Street, a dozen in Catnip Commons, loaf cats in the Whisker Heights windows | **1 of 3** | **Loaf cats shipped and they are wonderful** (`cat_citizens_loaves` — real loaves in the lit windows at 19:12 under a "Curfew: the lantern cats will walk you home" toast). Main Street at noon has **4 cats** (`cat_citizens_main_noon`). Catnip Commons has **zero** (`cat_park`). |
| 10 | cat nature | texture the grey north-skyline blockout; retire the grey-box family; move the flyer out of the sign | **PARTLY** | The grey mass is gone from the skyline. The grey-box family is not retired — it moved: `cat_harbor` has a **pure-black untextured quad** lying on the grass at ~(104,56) and an unreadable brown tarp mass; `escape_canoe_cove` is ten pale-grey polystyrene domes; `inv_caramelizer` sits on a flat pale-grey ledge. A new repeated prop (white crumpled-paper shapes) now litters `cat_plaza`, `cat_square`, `cat_park`, `escape_catapult`, `sky_dawn_harbor`, and floats in the *sky* in `cat_meow_donalds`. |
| 11 | ferry | bow wave, wake, heel, fade own canopy, one thing to look at mid-strait | **MOSTLY RESOLVED** | `ferry_crossing`: Sugarfin is a purple narwhal with a candy-cane tusk, a striped awning, a cat captain, a life ring, a bow wave, escorting fish and a gull. Best single object in the game. Two misses: the wake is a **hard-edged grey-brown tapered quad** that reads as an oil slick, and **the player is not aboard / not visible** in either crossing frame. |
| 12 | terrain | re-grade the licorice path: warm brown-red, soft shoulder, mip the centre stripe | **PARTLY** | Warm brown landed (`candy_village`, `candy_forest`). The centre stripe still aliases into hot-pink scratch lines at every grazing angle (`candy_meadow`, `candy_village`, `candy_night`). |
| 13 | sour patch | soft radial falloff under the Kids instead of hard discs | **RESOLVED** | `candy_palace_night`, `candy_night` — the Kids glitter, their pools blend softly. The night hunt *looks* right even if it doesn't *stage* right (§12). |
| 14 | cat architecture | make Fish Harbor a fish harbour | **NOT RESOLVED** | `cat_harbor`, `sky_dawn_harbor`: no fish, no ice, no nets, no scales, no market front. Gus still has nothing to sell. It is now also the most **broken-looking** place on Cat Island (black quad, floating tarp, "THIS SIDE UP" wedge over the water). |
| 15 | candy vegetation | darken lollipop sticks at night; one bitten lollipop with carved initials | **NOT RESOLVED** | `candy_meadow` at noon: the sticks are now **unlit near-white cylinders** and the brightest object in frame — worse than pass 1, and now a daytime problem too. No bitten lollipop found. |

**Score: 3 resolved, 8 partly, 4 not done.** The two systems that did their homework are **sky**
(#7) and **ferry** (#11). The one that most needs to own its list again is **player/camera** (#1) —
it shipped the number and skipped the behaviour.

---

## 2.0 THE HEADLINE FINDING — THERE IS NO SEA AND NO LAND OUTSIDE A RADIUS AROUND THE PLAYER

Every pass-1 and pass-2 critic has written some version of "the sea is milky white paper" or
"the horizon disappears". It is worse and simpler than that: **the terrain mesh and the water
surface are only drawn in a bubble around the player.** Outside it there is nothing — not a
low-detail sea, not a fog colour, the *sky*.

Proof, two frames I shot for this pass:
- `renders/ad2/cat_from_north_sea.png` — free camera 150 u north of Cat Island, elevation 0.26.
  Yarn Hill's pink yarn ball, palms, umbrella trees, boulders, the maintenance hut, grass tufts
  and Candyland's whole candy skyline all **float in a featureless pale-blue void**. No island
  silhouette, no coastline, no water.
- `renders/ad2/candy_from_north_sea.png` — same from Candyland: lollipops, peppermint pines and
  the Palace hanging in air with nothing under them.

And the counter-proof that the water shader is actually **good**:
- `renders/ad2/strait_from_candy_shore.png` (pos −40,22 · el 0.40 · dist 34 · az −1.571) — the
  best frame I shot all pass. Turquoise with real wave lines, a depth gradient from deep teal to
  shallow aqua, shore foam, Sugarfin waiting under "BOARD HERE". **Nothing is wrong with the
  sea except its extent.**

What this costs, in shipped frames:
- `candy_peak_wide` — you climb Frosting Peak, the island's lookout, and the eastern half of the
  view is blank paper. There is no Cat Island on the horizon. The reward for the climb is nothing.
- `sea_crossing`, `world_overview`, `cat_overview`, `candy_overview` — the "sea" in all four is sky.
- `sky_dawn_harbor` — the beautiful apricot dawn has no water and no horizon line to put gold on.
- `cat_lighthouse` — "watching the sea. and you." There is no sea to watch.

**Fix (terrain + sky, one job):** draw the sea plane to the fog radius (a single 1200-unit plane,
one draw call, with the same shader at lower tessellation), keep a coarse terrain LOD for both
islands out to ≥ 400 units so each island keeps a silhouette, and put a real horizon line where
sea meets sky. Then `inv_saltgun`'s blown-out white foam noise needs a grazing-angle fix too: at
low view angles the foam/specular texture becomes a white camouflage blotch covering half the frame.

---

## 3. COHESION OF THE TWO ISLANDS

**Much better than pass 1, and now failing for a different reason.** Pass 1's charge was
"two different games". Wave 2 fixed the three worst symptoms: Candyland's ground came down
~35% in saturation and lost the wet sheen (`candy_village`, `candy_meadow`); Candyland grew
three real landmarks with authored silhouettes (`palace_wide`, `candy_cupcake_wide`,
`candy_peak_wide`); and the UI, dawn/dusk grade and night sky are now genuinely shared
(`cam_moon_moment` reads as the same world as `cat_night`).

What still breaks the family:
1. **The shared surface is missing** (§2.0). The one thing that should hold two islands
   together is not drawn.
2. **Two different "litter" languages, one per island, both at the same offensive density.**
   Candyland: the ground-shader sprinkle field (white/coloured chips, ~1 per 1.7 u, everywhere —
   `candy_arrival`, `candy_peak`, `candy_forest`). Cat Island: a **white crumpled-paper prop**
   scattered island-wide — I count 30+ in `cnt_schedule` alone, plus `cat_plaza`, `cat_square`,
   `cat_park`, `escape_catapult`, `sky_dawn_harbor`, `occ_pier_walk`, and **floating in the sky**
   in `cat_meow_donalds`. On mid-green grass at near-white value they read as discarded tissues.
   Neither island's litter reads as anything; both should be cut ~70% and dropped ~25% in value.
3. **Candyland's ground fell apart into blotches instead of becoming quiet.** The desaturation
   was applied as big airbrushed magenta stains over sage green with no logic to the boundary
   (`candy_arrival`, `candy_cupcake_bite`, `strait_from_candy_shore`, `candy_overview`). It
   reads as marbled meat or mould, not frosting over cake. Cat Island's grass by contrast is a
   single clean mid-green. Candyland needs the same discipline: one base tone, one darker tone
   for hollows, magenta reserved for the river and the syrup zones only.
4. **Architecture rhyme is now good** — gingerbread/wafer/icing on Candyland reads as
   confidently as terracotta/stucco/cypress on Cat Island. Keep it. The one hold-out is the
   **beige stucco cottage with a realistic white-mullion sash window** still standing on the
   candy island (`candy_river` upper-left, `candy_dusk`, and the same window on the Frosting
   Peak wafer tower in `candy_peak`). It is the only un-candy object left in the district.
5. **Plant language still doesn't rhyme.** Candyland: hard faceted gummies. Cat Island: palms,
   cypress, umbrella trees, agave, lavender — five ecologies, none shared. A single shared
   silhouette family (say: everything is built from the same 3 chunky masses, re-skinned) would
   sell "one world" more cheaply than any colour change.

---

## 4. DEAD ZONES (ranked by how much space × how little in it)

1. **Purrliament Square pavement (146…160, 0…14).** `cat_square`, `purrliament_el042_d52`:
   a 40-unit civic plaza, ~40% of frame, with **3–8 cats** in it at noon and nothing on the
   ground but shadows. The best-written building in the game faces an empty car park.
2. **Catnip Commons (128…155, −70…−45).** `cat_park`: a full-size civic park with **zero
   cats**, a bandstand with no band, ~14 picnic tables tumbled into a heap, and a giant flat
   teal cone that the camera ends up inside. Unchanged from pass 1 §2.10.
3. **Smuggler's Cove (228…245, 36…52).** `escape_canoe_cove`: "SMUGGLER'S COVE / nothing here"
   — and the sign is right. A pale-olive field, ten grey polystyrene domes, eight tan
   origami-crumple rocks, grass tufts. **There is no cove**: no inlet, no cliff, no hidden
   beach, no water you could launch from.
4. **The cave skylight chamber (under ~188,−64 → the palace cellar).** `cave_skylight`: a
   30-unit flat lilac disc with a striped path across it and nothing else. No shaft of light
   (it is called a skylight), no crystals worth the walk, no reward, no creature.
5. **The Candy Palace throne room.** `palace_throne`: 60% of frame is a bare olive-beige floor.
   The hero interior of the hero building has one throne, one barrel, and a flat purple quad
   floating in mid-air across the middle of the room.
6. **Main Street at noon (100…135, −6…6).** `cat_main_street`, `cat_citizens_main_noon`:
   the funniest set of shopfronts in the game, and **4 cats**. Shops open, nobody shopping.
7. **Cat Island's north-central interior (130…175, −45…−15).** `cat_overview`: a wide green
   shoulder between the hedge maze and the north coast with scattered single trees and nothing
   to walk to.
8. **Meow Donald's dining room.** `cat_in_meow`: half the room is empty booths and blank cream
   wall; no trays, no food, no fries, no milk on any table, 3 cats.
9. **Wing Nut Field apron (204…216, 6…18).** `escape_flyer_pad`: the flying machine sits in the
   shadow of a bush as an unreadable black mass; around it, empty grass and eight identical
   origami boulders.
10. **The frosting summit plateau (−180…−170, −66…−56).** `candy_peak`: a large flat white
    expanse whose only content is hard-edged navy shadow polygons and white speck dandruff.

## 5. WEAK TRANSITIONS

- **Ferry deck → Candyland.** `ferry_arrival_candy` is the worst transition in the game: the
  camera is jammed inside a candy-cane pole, a giant lollipop disc and a sand wedge; the
  WELCOME TO CANDYLAND sign is cut off mid-word ("CANDYLA"); the player is nowhere in frame.
  Coming home should be the money shot.
- **Candyland pier → inland.** `candy_arrival`: the player is hidden behind an unnamed tan
  dome the size of a house, and a cloud of white angular shards hangs in the middle distance.
- **Pier → Welcome Plaza on Cat Island.** Better than pass 1 (the arch clears), but
  `renders/ad2/walk_pier_plaza.png` — 100 frames of walking from (60,20) — ends with the
  terrain gone and plants floating over a blue void (§2.0), and `cat_plaza` puts a wall of
  black palm fronds across the lower-left quarter exactly where the player arrives.
- **Street → interior.** Every interior I looked at (`candy_in_cupcake`, `candy_in_house0`,
  `cat_in_purrbucks`, `cat_in_meow`) has the same failure: the **walls vanish along with the
  roof**, so you see straight out to grass, rocks and the neighbouring district. An interior
  needs to feel enclosed — hide the *roof*, keep the walls, and cull anything between lens and
  player rather than ghosting it.
- **Village → Chocolate Lake.** `candy_lake`: the pier deck occludes the player's whole body
  the moment he steps onto it, and the "CHOCOLATE LAKE / NO SWIMMING" sign has a string of
  orange gumdrops planted through its text.
- **Syrup river crossings.** The river is a flat fullbright slab (§7) — there is no bank, no
  shallowing, no edge, so "crossing the river" has no moment.

## 6. REPEATED IDEAS / CLONES

- **Gummy bears on a grid.** `terrain_cliff_face` — roughly 10 × 12 near-identical bears in
  14 hues, evenly spaced across a hillside. `candy_forest` and `candy_overview` repeat it.
- **Lollipops at one height.** `candy_cupcake_wide`, `candy_overview` — a field of ~30
  lollipops at the same stick height and near-identical disc size. Reads as a satellite farm.
- **Peppermint pine cones.** `candy_peak_wide` — ~40 identical striped cones down one slope.
- **Umbrella trees.** `sky_dawn_harbor` — ~25 green mushroom trees at one scale in an even
  scatter, the most obvious repeated field on Cat Island.
- **Lavender/purple spikes.** `cat_arrival`, `cnt_schedule`, `occ_pier_walk` — hundreds of one
  identical purple spike prop carpeting every green slope.
- **Agave rosettes.** `nat_agave_beach` — ~40 identical mint rosettes at one scale. Pass 1
  flagged 21 tan pyramids; the prop changed, the repetition didn't.
- **Pale-green low-poly bushes.** `cat_residential` — ~100 identical bushes at one scale in
  the lower-left quadrant.
- **Cone cypresses in rows.** `cat_square` left third — pass 1's "ring of ~14 identical dark
  cones" is still there.
- **Grey polystyrene domes / tan origami-crumple boulders.** The same two rock props appear at
  `escape_canoe_cove`, `escape_flyer_pad`, `nat_agave_beach`, `cat_gym`, `inv_caramelizer`,
  `purrliament_el042_d52` — always one hue, one scale, no bases, no contact shading.
- **Buff cats in a line.** `cat_gym` — six buff cats evenly spaced, facing camera, identical
  pose, nobody lifting. A character-select screen, not a gym.
- **Two identical green EXIT signs** 20 units apart in Purrliament Square (now readable as the
  "ALL EXITS THIS WAY" gag — keep it, but make the second one point somewhere absurd).
- **Fish-skeleton props** in an even scatter over the grass at Fish Harbor (`sky_dawn_harbor`).

## 7. SCALE

Mostly right, with three real failures.
- **Correct:** the Palace (`palace_wide`), the Great Cupcake (`candy_cupcake_wide`), Frosting
  Peak (`candy_peak_wide`), the yarn ball at Yarn Hill, Sugarfin, the Purrliament statue. All
  land in the 20–35 u landmark band and read from distance.
- **Player-to-world is right at 31 u** — he is ~1.7 and legible in `candy_peak`,
  `strait_from_candy_shore`, `escape_canoe_cove`, `inv_caramelizer`.
- **Failure 1 — foreground props are too close to the camera.** `candy_village`'s left third is
  an unreadable pink-striped mass; `candy_meadow`'s right edge is a white cylinder;
  `escape_catapult` and `cat_plaza` lose a quarter of frame to a single palm frond;
  `cat_in_purrbucks` has a full-height black lamp post down the centre of a shop interior.
  Nothing should be allowed within ~6 u of the lens.
- **Failure 2 — the giant candy isn't giant.** The brief says "giant candy = ridiculously big".
  The gumdrop boulders at Gumdrop Cliffs, the jelly-bean rocks and the "grandmother" gummies are
  all in the 2–5 u band. There is no single piece of candy on Candyland that makes the player
  feel small the way the Cupcake does. One 40-unit half-buried jawbreaker would do it.
- **Failure 3 — the Caramelizer is a 15-pixel nub** (`inv_caramelizer`). The most destructive
  object in the game should be an unmistakable chunky silhouette: brass tank, fat nozzle, a
  pilot flame, a pressure dial.

## 8. VISUAL NOISE

Candyland's density went from "empty" (pass 1) to **"over"**. `terrain_cliff_face` is the frame
that proves it: ~200 objects, 14+ hues at near-full saturation, uniform spacing, no clusters, no
clearings, no path through it. The brief's own rule — "max ~5 hues per scene cluster; density
without noise; clusters, not uniform scatter" — is being broken by the systems that grew fastest.

The four noise sources, in order of damage:
1. **Hue count.** `candy_overview`, `candy_forest`, `terrain_cliff_face` carry 12–14 hues in one
   frame. Pick 5 per cluster and repeat them; let hue change *between* clusters, not within.
2. **The two litter fields** (Candyland sprinkle chips; Cat Island white paper) — §3.2.
3. **The white speck particle field** — still in ~80% of frames, still reading as dust on the
   lens or snow (`cat_gym`, `cat_lighthouse`, `candy_peak`).
4. **Aliasing.** Three specific offenders that shimmer into noise: the pink-and-white diagonal
   stripe mass at Gumdrop Village's centre (`candy_village`, `candy_night` — it moirés badly),
   the licorice path centre stripe (hot-pink scratch lines at every grazing angle), and the
   ground sprinkle chips on slopes.

**Where density is right:** `cat_main_street`, `cat_meow_donalds`, `cat_night`, `candy_village`
street level, `cat_arrival`. All of them are dense *along a path* with clear ground in the middle
and signs as the punctuation. That is the model — apply it to the open ground.

## 9. PATH / LANDMARK READABILITY

- **Paths read well on Cat Island** (pale hex cobbles with paw prints against mid-green) and
  **adequately on Candyland** (warm brown licorice), except the aliasing stripe.
- **Signposts are the weak link.** In `candy_village` the SUGAR PIER arm crosses FROSTING PEAK;
  in `candy_meadow` the GREAT CUPCAKE arm intersects its neighbour; in `candy_lake` a string of
  gumdrops grows through the sign face; in `candy_peak` a candy-cane post bisects the best joke
  on the mountain ("214 steps / we counted. twice."). **Every signpost needs a 3-unit no-prop
  exclusion cylinder and non-overlapping arm angles.**
- **Landmark reveals work when the camera can see them** — the Palace, the Cupcake and the yarn
  ball all read from 100 m. The ones that don't announce themselves at all: Smuggler's Cove
  (nothing), Wing Nut Field (a black blob), the cave mouth, Catnip Commons, Fish Harbor.
- **The landmark banner is unreliable** — it says "Sugar Pier" at the Candy Palace, at the Great
  Cupcake and inside the cave; and `cat_harbor` shows the Candyland objective, a Candyland
  minimap and a "Sugar Pier" banner while standing on Cat Island.
- **The minimap goes solid blue inside the cave** (`cave_corridor`, `cave_skylight`) — the one
  place you actually need a map.

---

## 10. CAMERA FRAMING AT THE SHIPPED 31 u / 0.64 rad — RECOMMENDATION

**The distance is right. The elevation is wrong, and the occlusion system is the real problem.**

At 31 u the player finally reads as a human being (`candy_peak`, `inv_caramelizer` — freckles,
a straw hat, a camera round his neck). Do not change 31 and do not redesign the character.

At **0.64 rad (36.7°)** the lens sits above the eaves of every two-storey building on a slope.
Measured on the shipped frames: `cat_main_street` ≈ 55% roof tile, `cat_meow_donalds` ≈ 60%,
`cat_residential` ≈ 65%, `cat_night` ≈ 60%, `cat_tigers` lower quarter is one unlit roof.
The best-written surfaces in the game — shopfronts, signage, the cats — are compressed into
thin slivers between roof planes.

I shot the A/B. **Elevation 0.42 rad (24°) with distance 44–52 is decisively better:**
- `renders/ad2/main_street_el042_d44.png` — PURRBUCKS, THE FISH MONGER, FIRST NATIONAL ("your
  deposi…"), CLIP SNIP all legible in one frame, and a **Community Notices board covered in
  twelve "MISSING / HUMAN" posters** that is completely invisible at 0.64. That gag has been
  built and shipped and no player at the default camera has ever seen it.
- `renders/ad2/purrliament_el042_d52.png` — the statue plaque ("OUR BELOVED GUESTS / held close
  since 1847"), "ALL EXITS / THIS WAY", "YOU ARE HERE. FOREVER", "MICE KRISPIES / OPEN ALWAYS",
  "BOULANGERIE DU CHAT" all legible, and **twice as many cats visible** as at 0.64, because the
  street plane is now in frame.
- `renders/ad2/strait_from_candy_shore.png` (el 0.40, dist 34) is the single best-composed
  frame I produced: player centred, pier leading the eye, Sugarfin waiting, real water.

**Recommendation: ship `distance: 34, elevation: 0.44, fov: 30`**, with a per-zone override that
opens to `distance 50, elevation 0.40` inside landmark cores (so the reveal shows the whole
silhouette) and tilts to `elevation 0.60` on open ground where there is nothing to hide behind.

**But do not ship it until the occlusion system is fixed, because a lower camera makes the
current fade worse.** `main_street_el042_d44.png` shows the failure clearly: the entire left half
of the frame is a whole district mesh ghosted to ~0.3 alpha, so you see grass and trees *through*
the buildings. Required, and unchanged from pass 1:
1. Sweep a radius-1.2 capsule from lens to the player's **head**.
2. Fade only meshes with a bounding radius < ~5 u or `userData.fade` — **never district,
   terrain or landmark shells**. `yarn_hill_cave.png` shows a third of the yarn ball ghosted
   while the player is *still* invisible: worst of both.
3. **Cull outright any mesh whose bounding volume contains the lens.** `candy_in_cupcake` is
   still a translucent soup of the whole landmark with no player and no readable room.
4. **Nothing within 6 u of the lens.** `candy_village`, `candy_meadow`, `ferry_arrival_candy`,
   `cat_in_purrbucks` (a full-height street lamp down the centre of a shop interior),
   `cat_plaza` and `escape_catapult` (a palm frond over a quarter of the frame) all fail this.
5. **Acceptance test: the player must be visible in every one of these** — `candy_arrival`,
   `cat_arrival`, `cat_plaza`, `cat_park`, `cat_gym`, `cat_harbor`, `cat_lighthouse`,
   `cat_citizens_loaves`, `candy_lake`, `cat_citizens_main_noon`, `ferry_crossing`,
   `ferry_arrival_candy`, `yarn_hill_cave`, `sky_dawn_harbor`, `candy_cupcake_wide`.
   Today he is invisible or a floating hat in all fifteen.

Also: on the ferry the camera should ride the deck at ~0.35 rad so the crossing has a horizon,
and the cave needs a tighter `dist ≈ 24` so the corridor has walls instead of flat lilac planes.

## 11. MISSING INTERACTIONS / DEAD PROPS

Wave 2 added a lot of real verbs — doors open, shops have counters, the catapult has a sign, the
Caramelizer can be picked up, Rusty trades candy. These are the props that still do nothing:

- **The hedge maze centre (≈165,−42)** — `hedge_maze.png`: the player stands on a bare tan disc.
  There is no reward at the centre of the maze. Pass 1 asked; still nothing.
- **Fish Harbor (100,58)** — no fish, no ice, no nets, no gulls stealing, no scales, no crate
  you can knock over. Gus has nothing to sell. (Pass 1 #14, untouched.)
- **The picnic tables (135…160, −70…−45)** — ~14 tables, nothing on them, nobody at them, and
  they are now tumbled into an unreadable heap (`cat_park`, `hedge_maze` top right).
- **The bandstand (≈150,−60)** — still a stage with no band.
- **Fountains** — `occ_pier_walk`: the Milk Fountain's water is a flat cream disc with a hard
  edge and no motion, splash, coin toss or ripple. Same for the plaza fountain.
- **The lighthouse lamp (218,30)** — `cat_lighthouse` at 18:00 SUNDOWN: no lit lens, no beam.
  "watching the sea. and you." and the lamp is dark. Still the most obvious missed beat.
- **The cave mouth / MAINTENANCE HATCH (188,−64)** — `yarn_hill_cave.png`: a small brown board
  with a dark slot, no light spilling, no draught, no sound cue, no lure. The entrance to the
  best secret on the island is styled as a utility cupboard.
- **The Great Cupcake's bite (−88,−18)** — `candy_cupcake_bite`: the "Look at the bite"
  interaction sits in a near-black void and the bite itself reads as a red crystal shard.
- **Benches everywhere** — village, plaza, park, Whisker Heights. The player still cannot sit.
- **The gym (198,−26)** — six buff cats standing in a line, nobody lifting, no "try the bench".
- **The flying machine (210,12)** — `escape_flyer_pad`: an unreadable black mass with a
  patchwork wing. No propeller, no seat, no lever, nothing that says "this could fly".
- **Salt patches** — `inv_saltgun`: they land as a random scatter of white shards that read as
  broken glass. The whole point in the brief is that consecutive patches **form lines and rings
  that enclose safe ground**. Nothing in the frame communicates an enclosure.
- **Chocolate Lake (−200,48)** — a sign says "NO SWIMMING … U WILL FLOAT" and there is nothing
  to disobey; the surface is flat matte cocoa with no specular, no ripple, no viscosity.

## 12. DELIGHT OPPORTUNITIES (cheap, specific, funny)

1. **Loaf the rest of the windows.** `cat_citizens_loaves` shipped loaves in about four of
   twelve lit windows. Fill the other eight — and put one cat who is *almost* a loaf, mid-fold,
   and one window where the loaf is on the *outside* sill looking in.
2. **The MISSING HUMAN board pays off.** The Community Notices board on Main Street already
   carries twelve identical "MISSING / HUMAN" posters. Make one of them the *player* after he
   has been on the island an hour — same straw hat, same freckles.
3. **Sugarfin blows.** A single spout from the narwhal's blowhole at mid-crossing, and one fish
   that jumps the tusk. Twenty lines, and the 21-second crossing finally has a beat.
4. **The lighthouse beam** sweeps at 19:00 and stops *exactly* on the player, every time.
5. **"SPOT ME."** A cat pinned under a barbell at (200,−28) calling "spot me — SPOT ME" on a
   loop under the existing "SPOT YOUR FRIEND" sign. Written in pass 1; still free.
6. **The maze centre** = one bench, one very old cat, and a sign: "CONGRATULATIONS. / you may
   now leave the maze."
7. **The bitten lollipop** at (−120,−20): one giant lollipop with a bite exactly the size of
   the player's head, and initials carved in a nearby stick.
8. **Marshmallow sheep stuck to the licorice.** `candy_meadow` already has the sheep; glue one
   to the path so freeing it pops it off in a sugar burst and it sprints away trailing fluff.
9. **Sour Patch Kids queue for the last ferry at 19:30**, waving politely. "see you at seven
   thirty!" is already written into `candy_dusk`. Stage it.
10. **The peephole in the HUMANS door (≈184,44)** blinks when you get close.
11. **The cave's loose thread.** Yarn Hill's thread already trails down the hill — run it all
    the way *into* the maintenance hatch, so the cave entrance is signposted by the landmark
    above it instead of by a brown board.
12. **The Caramelizer scorch trophy.** The first thing you burn leaves a permanent black
    silhouette on the ground, and a passing cat puts a tiny "DO NOT" sign next to it.
13. **A rubber duck circling Chocolate Lake** and a pair of cat sunglasses on the shore.
14. **One 40-unit half-buried jawbreaker** somewhere on Candyland, with a ladder up it and a
    flag on top, so the island has one piece of candy that makes you feel small.

---

## 13. NIGHT ON BOTH ISLANDS (incl. tigers and the Sour Patch hunts)

**The night SKY is now the best thing in the game.** `cam_moon_moment` — a moon disc with a
halo, a real star field, a violet-to-rose gradient, soft night clouds, and the toast "The moon
is up. So are they." That is a shipped, working moment. Pass-1 #7 delivered.

**Candyland night — mixed, and one element ruins it.**
- Good: the Sour Patch Kids genuinely sparkle now, their light pools blend softly, and
  `candy_palace_night` has a dozen glittering kids converging on the player. The grade at 22:00
  by the falls is a proper deep violet.
- **The syrup river is a solid fullbright neon-magenta slab, day and night** (`candy_dusk`,
  `candy_palace`, `candy_palace_night`). It is unlit, has hard straight edges, and in
  `candy_palace` has a **rectangular notch cut out of it**. At night it is by a wide margin the
  brightest object on the island and it destroys the grade in every frame it touches. **This is
  the single most broken-looking element in the game.**
- `candy_night` (the village at 23:00) has drifted the other way: the grade is a warm
  amber-brown haze that reads as dusk under sodium lamps, not night. The clean blue-violet from
  the falls should apply here too.
- **Black vertical bars** stand next to lamp posts and lollipops all over the village at night
  (`candy_night`, and the same artifact on Main Street in `main_street_el042_d44.png`). They
  read as unlit flat quads. Somebody owns these and should find them.
- The giant lollipop **sticks are unlit near-white cylinders** and are the brightest objects in
  `candy_meadow` even at noon.
- Sugar-gliders and birds are still flying at 22:00 and 23:00. Roost them.

**Cat Island night — still the best-lit place in the game, and the threat doesn't land.**
- Good: warm window emissives, strung lanterns over Main Street, the Meow Donald's arches lit,
  lantern cats, "TIGER TIME — The cats are… bigger now. Get indoors.", "Curfew: the lantern cats
  will walk you home." `cat_night` and `cat_citizens_loaves` are both frames I'd ship.
- **The tigers do not read at the game camera.** In `cat_night` and `cat_tigers` they are long
  orange-and-white shapes lying along the street — from above they read as draught excluders or
  discarded scarves. `cat_tigers_close` proves the model is *excellent* (a real face, fangs,
  whiskers, big eyes) — but you only ever see the top of it. Two fixes: **give them emissive
  glowing eyes that are visible from above and behind** (the brief requires it and there are
  none), and **raise the prowl pose** — shoulders up, head up and swinging, so the silhouette
  from 24–37° is a cat, not a rug.
- **No staging of the hunt on either island.** At 22:00–23:00 the kids and the tigers stand
  around. Nothing converges, nothing circles, nothing closes. The threat exists in the toast
  text and nowhere in the image. Cheapest fix: when the player is within 20 u at night, every
  hunter turns to face him and takes two slow steps in; eyes light; the music of it is a pose.
- **The minimap never night-tints on Cat Island** — `cat_night` (22:00), `cat_tigers` (22:00)
  and `cat_citizens_loaves` (19:12) all still show a daytime-green map while Candyland's goes
  correctly purple.
- **No stars or moon are ever visible in a gameplay frame on Cat Island**, because the camera
  never contains sky. The look-up affordance that produced `cam_moon_moment` needs to be
  reachable (and advertised) on both islands.

## 14. THE TEN WORST SINGLE SPOTS (ranked)

1. **Inside the Great Cupcake (−88,−18).** `candy_in_cupcake`: the entire frame is translucent
   ghosted geometry with the outside world showing through it, no player, no readable room. The
   interior of the island's headline attraction is unshippable. (Pass 1's #1 spot, in a new form.)
2. **The syrup river, everywhere it appears.** `candy_dusk`, `candy_palace`,
   `candy_palace_night`: a fullbright neon-magenta slab with hard edges and a rectangular hole
   in it, unlit at every hour, occupying up to half the frame.
3. **Ferry arrival at Sugar Pier (−42,22).** `ferry_arrival_candy`: camera inside a candy-cane
   pole, a lollipop disc and a sand wedge; the WELCOME sign cut off mid-word; no player. This is
   the shot the player sees every time they come home.
4. **Fish Harbor (100,58).** `cat_harbor`: a pure-black untextured quad on the grass, a giant
   unreadable brown tarp standing in the middle of the frame, a "THIS SIDE UP" wedge hanging
   over the water, still no fish — *and* the HUD shows the Candyland objective, a Candyland
   minimap and a "Sugar Pier" banner while standing on Cat Island.
5. **Catnip Commons (140,−58).** `cat_park`: the camera ends up inside a flat teal cone that
   fills 60% of the frame, no player, zero cats, and a heap of tumbled picnic tables.
6. **Gumdrop Cliffs (−222,18).** `terrain_cliff_face`: ~200 objects, 14 hues, uniform spacing,
   no clusters, no clearing, no path, no cliff edge. The noise headline of the game.
7. **Under the Great Cupcake (−92,−22).** `candy_cupcake_bite`: near-black at 11:00 midday,
   floating dark pentagons under the deck, generic dark plank walkways instead of wafer, and
   the "bite" reading as a red mineral shard.
8. **The Candy Palace throne room.** `palace_throne`: 60% bare floor, an unlit flat purple quad
   floating across the middle of the room, and a `Rasp: "…"` panel still open.
9. **Smuggler's Cove (236,44).** `escape_canoe_cove`: no cove, no inlet, no boat, ten grey
   polystyrene domes on a golf-course green.
10. **Wing Nut Field (210,12).** `escape_flyer_pad`: the flying machine is an unreadable black
    mass in a bush's shadow with a patchwork wing that looks like a broken texture atlas.

*(Honourable mention: `cat_in_purrbucks`, where a full-height black street lamp stands down the
exact centre of a shop interior, and the room has no walls on two sides.)*

## 15. IS IT FUN TO EXPLORE YET? — A FRANK PARAGRAPH

Yes, for about forty minutes, and mostly because of the writing. What a player will remember,
in this order: **Sugarfin** — a purple narwhal with a candy-cane tusk and a cat captain who
ferries you between two islands, which is a whole game's worth of charm in one object; the
**Cat Island signage**, which is genuinely funny and gets funnier the longer you stay
("DEPARTURES: CANCELLED / ARRIVALS ONLY · ON TIME", "BILLIONS SERVED (mice)", "TRAVEL AGENCY —
HOME: ask about it / AWAY: sold out / ANYWHERE", "PURRLIAMENT: nine lives · one term · no
departures", "YOU ARE HERE. FOREVER", "NO FISH FOR HUMANS", "LIFT OR LEAVE (you can't leave)");
**the loaf cats in the lit windows at curfew**; **the moon moment**; **the Candy Palace**, which
is a real castle made of gingerbread and icing; and **the tigers at close range**, which are
adorable and wrong in exactly the right proportion. The two islands no longer feel like
different games. There is a shape of a real game here: arrive, be charmed, slowly notice you
cannot leave, find four ways out, get eaten trying.

What they will complain about, in this order: **"I can't see my guy."** In fifteen of the
fifty-six shipped tour frames the player is invisible, a floating hat, or a beige tube — behind a
roof, behind a pier deck, behind a palm frond, inside a landmark shell. That is not a polish
note, it is the core of third-person game feel and it is failing at nearly every landmark.
Second: **"the world is made of loose parts."** Walk to any coast and the sea and the far island
simply are not drawn; look at Gumdrop Cliffs and it is a bin of sweets tipped over a hill; look
at the syrup river and it is a magenta cut-out; look at Fish Harbor and there is a black
rectangle lying on the grass. Third: **"where is everybody?"** Main Street at noon has four cats,
Purrliament Square has three, Catnip Commons has none — a civilisation of cats with no cats in
it. Fourth: **"nothing is dangerous."** The night is written as a threat and staged as a
standing-around. Fix the camera, draw the sea, thin the scatter, and put fifteen more cats on
Main Street, and this stops being a very charming toy and starts being a place.

---

## 16. TWO LATE FINDINGS FROM MY OWN RENDERS (both change a conclusion above)

**A. The camera has a second, opposite failure mode: it collapses onto the player's face.**
`renders/ad2/candy_meadow_night.png` (pos −110,−45 · 23:00 · el 0.42 · dist 40 requested) came
back at an effective distance of roughly **4 units**. The player fills a third of the frame and
falls apart at that range: the two eyes are different sizes and different materials, the mouth
reads as a scream, and **both feet are detached and floating below the body**. Pass 1 said "dolly
in only as a last resort, never below 14". It is going to ~4. So the same system is both hiding
the player and shoving the lens into his teeth — which is why §10 is ranked first.

**B. Gumdrop Village is much better than any shipped frame of it.**
`renders/ad2/candy_village_dawn.png` (06:06, el 0.42, dist 40) shows a real village: gingerbread
cottages with wafer-tile roofs and candy-cane trim, lit windows at sunrise, shop fronts
(Sourly's, FIZZ BOMBS, "SOUR LEMON DROPS 2 for 1", Pip & Tucker), a proper Sugar Fountain built
as a pink carousel with liquorice pipes, and **nine Sour Patch Kids playing in the square** under
a "*squeak!* — the jellybean beetles scatter" toast. Pass 1's charge that the village was "the
most desaturated cluster in the frame" is now simply wrong — the village has never been
photographed properly. Two things still spoil it: **the player is invisible** (behind a striped
roof ridge that crosses the whole lower third), and two roof masses eat ~35% of frame, which is
the argument that lowering the camera is *not enough* on its own — the fade/cull must land first.

---

## 17. ADDENDUM — CATNIP COMMONS RE-SHOT (one new bug, two confirmations)

`renders/ad2/catnip_commons_low.png` (pos 140,−58 · 13:00 · el 0.42 · dist 50) came back after
the ranked list was written. It changes one thing and confirms two.

**NEW BUG — the player is standing on the bandstand roof.** He is dead centre of frame, on top of
the teal cone, above the finial line. Either `ctx.walkables` is treating the bandstand roof as
floor, or the landmark teleport is dropping him onto it. Roofs must not be standable, and
whatever put him there will put him on shop roofs on Main Street too. **Owner: cat architecture
(walkables/collider for the bandstand) with player/camera.** This belongs at roughly rank 9.

**CONFIRMED — the bandstand is fine, the camera was the problem.** At 0.42 it reads properly:
columns, benches inside, a lantern, and a legible sign ("THE COMMONS BANDSTAND"). `cat_park`'s
"camera inside a flat teal cone" was a framing failure, not a modelling one. More evidence for
rank 5.

**CONFIRMED — Catnip Commons is still empty.** Zero cats at 13:00 even at the better camera, so
rank 4 stands unchanged. And the picnic tables are worse than §4 said: the right third of the
frame is ~12 tables and benches in red/blue/yellow tumbled at random angles down a slope of tan
origami boulders. It does not read as a park, it reads as flood debris. Straighten them, sit
cats at them, and put something on them.

Two smaller things in the same frame: the bandstand roof throws the same hard-edged black shadow
spikes as `cat_park` (shadow-map filtering, sky/terrain), and there is a large white
crumpled-paper prop half-buried in the hedge at the lower right — the rank-8 prop again, at
landmark scale this time.

---

## RANKED TOP 15 — do these in this order
Each line: **rank · owning system · the fix.**

1. **player/camera** — Fix occlusion in *both* directions: sweep a radius-1.2 capsule from the
   lens to the player's **head**; fade only meshes with bounding radius < 5 u or `userData.fade`
   (never district / terrain / landmark shells); **cull outright any mesh whose volume contains
   the lens**; never dolly below 14 (it is collapsing to ~4 — `ad2/candy_meadow_night.png`);
   allow nothing within 6 u of the lens. Acceptance: the player is visible in `candy_arrival`,
   `cat_arrival`, `cat_plaza`, `cat_park`, `cat_gym`, `cat_harbor`, `cat_lighthouse`,
   `cat_citizens_loaves`, `candy_lake`, `cat_citizens_main_noon`, `ferry_crossing`,
   `ferry_arrival_candy`, `yarn_hill_cave`, `sky_dawn_harbor`, `candy_village_dawn`.

2. **terrain** — Draw the sea plane and a coarse island LOD out to the fog radius, so both
   islands keep a silhouette from off-shore and there is a horizon line where sea meets sky. The
   water shader is already good (`ad2/strait_from_candy_shore.png`); it simply is not drawn
   (`ad2/cat_from_north_sea.png`, `ad2/candy_from_north_sea.png`).

3. **terrain** — Rebuild the syrup river as a lit, shaded, banked liquid. It is currently an
   unlit fullbright magenta slab with hard straight edges and a rectangular notch cut out of it,
   and at night it is the brightest object on the island (`candy_dusk`, `candy_palace`,
   `candy_palace_night`).

4. **citizens** — Populate: **20 cats on Main Street at noon** (there are 4), **12 in
   Purrliament Square** (3–8), **12 in Catnip Commons** using the picnic tables and the
   bandstand (zero). A civilisation of cats currently has no cats in it.

5. **player/camera** — After #1, ship `distance: 34, elevation: 0.44, fov: 30`, with a landmark
   override to `distance 50 / elevation 0.40`. At 0.42 the Main Street "MISSING HUMAN" notice
   board, the Purrliament plaque and the tigers' faces all become visible for the first time
   (`ad2/main_street_el042_d44.png`, `ad2/purrliament_el042_d52.png`, `ad2/plaza_tigers_night.png`).

6. **candy vegetation** — Cluster, don't scatter. At Gumdrop Cliffs and the Gummy Forest: ≤ 5
   hues per cluster, bears in stands of 5–9 with walkable clearings between them, and kill the
   ~10 × 12 uniform grid (`terrain_cliff_face`, `candy_overview`).

7. **ui** — Close the `Rasp: "…"` panel when its beat ends (still open in four tour frames);
   keep the landmark banner in sync (it reads "Sugar Pier" at the Candy Palace, at the Great
   Cupcake and inside the cave); night-tint the **Cat Island** minimap; draw a real map inside
   the cave (it goes solid blue); and fix the island/objective state at Fish Harbor, which shows
   a Candyland objective and a Candyland minimap while you stand on Cat Island.

8. **cat nature** — Cut the white crumpled-paper prop ~70% and drop it 25% in value (30+ in one
   frame in `cnt_schedule`; airborne in `cat_meow_donalds`), and retire the pale-grey
   polystyrene domes and tan origami boulders — warm ochre tops, darker contact-shaded bases,
   three scales (`escape_canoe_cove`, `escape_flyer_pad`, `nat_agave_beach`, `yarn_hill_cave`).

9. **cat architecture** — Make Fish Harbor a fish harbour: fish on ice, hanging nets, two gulls,
   a knockable crate of catch, a market front for Gus, two lanterns. And delete the three broken
   objects there — the pure-black untextured quad on the grass, the floating brown tarp mass and
   the "THIS SIDE UP" wedge hanging over the water (`cat_harbor`). **Also: roofs are standable.**
   The player ends up on top of the Catnip Commons bandstand roof
   (`ad2/catnip_commons_low.png`, §17) — audit `ctx.walkables` and the landmark teleport so no
   roof in either district accepts the player.

10. **citizens** — Make the tigers read and make the hunt land: **emissive glowing eyes visible
    from above**, and a raised prowl pose (shoulders and head up, head swinging) so the
    silhouette at 24–37° is a cat, not a rug (`cat_night`, `cat_tigers`). Then stage it: within
    20 u at night every hunter turns to face the player, eyes light, two slow steps in.

11. **terrain** — Quiet the Candyland ground: sprinkle field to ~25% fill at half the chip size,
    damped on slopes and near prop silhouettes; and replace the airbrushed magenta blotches with
    one base tone plus one darker hollow tone, magenta reserved for the syrup zones. Right now it
    reads as marbled meat (`candy_arrival`, `candy_cupcake_bite`, `candy_veg_picnic`).

12. **candy architecture** — Make the Great Cupcake interior a room: cull the shell when the lens
    is inside, keep the walls, light it, furnish it — `candy_in_cupcake` is a translucent soup
    with no player and no readable space. Carve a bite you can actually walk into. And retire the
    last two un-candy objects on the candy island: the **grey filing-cabinet door** and the
    **white-mullion sash windows** on the Frosting Peak tower and the river cottage.

13. **escape/vehicles** — Make the four ways home read as machines and places: a visible
    propeller, seat and lever on the flying machine (currently a black mass with a patchwork wing
    that looks like a broken texture atlas); rope and counterweight on the catapult; an actual
    inlet, cliff and hidden beach at Smuggler's Cove ("nothing here" is presently accurate); and
    a real shaft of light plus one reward in the cave skylight chamber.

14. **particles** — Cut the global white speck field ~70%, tint it warm cream on Candyland and
    green-gold on Cat Island, make it glow only at night, and never draw a speck within 6 u of
    the lens. It reads as snow at 16:00 in `cat_gym` and `cat_lighthouse` and as dandruff on the
    frosting in `candy_peak`.

15. **candy vegetation** — Kill the brightest wrong thing on Candyland: the giant lollipop sticks
    are unlit near-white cylinders and are the brightest objects in `candy_meadow` at *noon*.
    Darken them, vary stick height and disc size so the lollipop field stops reading as a
    satellite farm, and while you are there add the bitten lollipop (a player-head-sized bite,
    initials carved in a nearby stick) at (−120,−20).

### Next ten, same format
16. **ferry** — Replace Sugarfin's hard-edged grey-brown wake quad with soft white foam, and put
    the player on the deck in the crossing frames (he is absent from both).
17. **inventory/weapons** — Give salt patches a readable shape (rings and lines that visibly
    *enclose* ground, not a scatter of glass shards) and give the Caramelizer a chunky
    silhouette — brass tank, fat nozzle, pilot flame; it is currently a 15-pixel nub in a shadow.
18. **cat architecture** — Put a lit lens and a sweeping beam on the Watchtower at 19:00. "watching
    the sea. and you." and the lamp is dark at SUNDOWN (`cat_lighthouse`).
19. **candy architecture / cat architecture** — Give every signpost a 3-unit no-prop exclusion
    cylinder and non-overlapping arm angles; four signs are currently unreadable because props
    grow through them (`candy_village`, `candy_meadow`, `candy_lake`, `candy_peak`).
20. **creatures** — Roost the birds and sugar-gliders at night (they still fly at 22:00–23:00),
    give them contact shadows over water, and stop them hovering unlit at head height beside the
    player (`candy_river`, `sea_crossing`).
21. **containment** — Stage the payoffs the signs already promise: the Sour Patch queue for the
    last ferry at 19:30, the peephole that blinks in the HUMANS door, the "spot me — SPOT ME" cat
    under the barbell, a reward at the centre of the hedge maze.
22. **sky** — Keep going: the dawn ramp and the moon are the best work in the game. Two gaps —
    the sea still doesn't take `horizonColor`/`sunColor` below ~10° of sun (it is dark violet
    under an orange sky at dawn), and the long-range haze at sundown flattens all of Cat Island
    to one beige value (`cat_lighthouse`).

**audio** — not judgeable from frames; nothing in this pass speaks to it.

---
*Pass 2 complete. 56 tour frames + 11 of my own (`renders/ad2/`). Read-only on `src/` and `tools/`.*
