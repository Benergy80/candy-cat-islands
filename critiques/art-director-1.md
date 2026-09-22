# Art Direction pass 1 — whole world, end of build wave 1
Fresh-context art director. Judged from rendered frames only (renders/tour1/* + renders/ad1/*).
Reference bar: FarmVille (readable chunky props, saturated-but-quiet ground, authored density)
and Pikmin (oversized lush nature, soft light, strong silhouettes, tiny creatures with personality).

**Blind pick, whole game:** Cat Island = TOSS-UP (confidence 4) — Main Street and the night street
would hold their own next to a FarmVille frame. Candyland = THEIRS (confidence 5) — at the game
camera it reads as coloured rubble, not a place. That gap *is* the headline finding: we shipped two
different games.

---

## BATCH 1 — the 25 core tour frames (renders/tour1)

### 0. A calibration warning about this tour
The per-system view files override `tools/views.json`. Every **Cat Island** tour frame was shot at a
generous distance (cat_arrival 52, cat_plaza 48, cat_main_street 56, cat_square 62, cat_residential
86, cat_gym 58, free cams for harbor/lighthouse/Meow Donald's) while every **Candyland** frame ran at
the real game default (**distance 21**). The tour therefore flatters Cat Island and slanders
Candyland. The only Cat frame at the true default is `cat_park` — and it is the worst frame in the
game (see 2.10). Batch 2 re-shoots Cat Island at 21 to compare like with like.

### 1. COHESION — do the two islands read as one game?
**No. This is the number one problem.** Put `candy_overview` next to `cat_overview` and nothing is
shared except the HUD and the sun angle.

- **Ground.** Candyland: hot magenta/mint with a wet specular sheen and an island-wide white confetti
  field. Cat Island: naturalistic mid-green grass, matte. Candyland's ground is *more saturated than
  its props*; Cat Island's is correctly quieter. Fix belongs to terrain: pull Candyland ground
  saturation/value down ~35% and kill the specular sheen (it reads as raw meat in `candy_river`,
  `candy_meadow`), and push Cat Island's grass ~10% warmer/yellower so the two sit in one family.
- **Plant language.** Candyland: hard low-poly faceted blobs. Cat Island: palms, cypress cones,
  umbrella trees, cacti, bamboo — five unrelated real-world ecologies, all smooth-shaded. Nothing
  rhymes across the strait.
- **Architecture.** Candyland's houses are beige stucco cottages with white window frames
  (`candy_river` left edge, `candy_dusk`) — the least candy-like objects on the candy island. Cat
  Island's buildings are confident, characterful and *better*. Candy architecture should be reading
  as wafer/biscuit/icing masses at 100 m, and currently reads as a generic village.
- **Sea + sky are the one shared surface and both are failing** (see 6 and 11). Fixing the water is
  the single cheapest cohesion win in the project: it is the frame that both islands sit inside.
- **Character style is consistent-ish** (chunky, big-headed) but the **player does not read as
  human** at game distance (`candy_peak`: a yellow hat with a body under it; the brim reads as a
  Saturn ring). Sour Patch Kids and cats both read better than the protagonist.
- **UI is genuinely consistent across both islands** — the rounded cream panels, the clock dial, the
  landmark banner. UI is the most cohesive system in the game. Keep it.

### 2. THE TOUR, FRAME BY FRAME (findings with coordinates)

**2.1 `world_overview` (free 0,0 d520, 12:00).** The sea is near-white milky grey — both islands
float on blank paper. No horizon, no whitecaps, no shipping, no rocks, no islets in 60 units of open
water between the piers. A single huge white cloud sits *in front of* Candyland's NW quadrant
(≈ -230,-60), occluding the island from the map view. The ferry-route dots crossing the strait read
as coloured litter on the water.

**2.2 `candy_overview` (free -150,0 d240).** Colour soup: 10+ hues at full saturation distributed
almost uniformly across 118 units of island. Landmark hierarchy is *inverted* — Gumdrop Village
(-140,40) is the most desaturated cluster in the frame while anonymous gumdrop scatter is the most
saturated. The lollipop field around (-120,-20)→(-90,-40) is a near-uniform grid of same-size
lollipops. The faceted icospheres along the north rim (-200,-70 → -150,-80) read as abstract low-poly
balls, not candy.

**2.3 `candy_arrival` (-50,26, 09:30) — THE FIRST FRAME OF THE GAME, and it is a mess.** A wafer roof
and a candy-cane pole crop 45% of the frame; the player is a 120 px figure in a gap; you cannot see
where to walk. A blizzard of white confetti chips floats in mid-air across the left half (ground
sprinkle field + particles) reading as blowing litter. The welcome sign top-left is cropped and its
text illegible ("populat…", "do not…"). The "Read: Sugar Pier" board's own text is a smudge. Seven UI
panels are on screen at once. **First 10 seconds of the game — this is where to spend the next day.**

**2.4 `candy_village` (-140,40, 11:00).** The player is standing **on top of the signpost's gumdrop
finial** (flagged in player-r1, still live). The signpost arms ("SUGAR PIER", "CHOCOLATE LAKE") are
~4× player height — signage is scaled for a billboard, not a village. No house is visible in the
"village" view. Path reads as asphalt with red road-markings.

**2.5 `candy_forest` (-200,-20, 14:00).** Unreadable. A purple and a yellow giant jellybean boulder
take 35% of the frame and hide the player; the camera never gets in front of them. Both are lit flat
with zero shading gradient. The "forest" reads as a low-poly rubble field — the gummy tree trunks are
so large that at distance 21 only bark is in frame. Ground here is mauve with dark red stripes: it
reads as muscle tissue.

**2.6 `candy_peak` (-160,-40, 16:00).** Whole frame in shadow and the shadow is near-black blue with
no bounce. A blurred airbrushed magenta ribbon (the frosting splat) runs down the middle — *soft*
painted terrain against *hard* faceted props, a style collision. Giant red/white striped cones on the
right read as circus tents lying on their sides, not frosting spires. Two blue birds are as large as
the player.

**2.7 `candy_meadow` (-110,-45, 12:00).** Best Candyland zone: marshmallow sheep are charming, "Pet
the marshmallow sheep" and "do not lick the tall ones" are exactly the tone we want. But: a giant
lollipop casts a soft **pure-black ellipse** over the path at ≈(-108,-42) that reads as a pit; one
sheep is sunk to the knees in terrain at ≈(-116,-38); another intersects the player; the "GREAT
CUPCAKE" signboard points into the ground.

**2.8 `candy_river` (-120,30, 13:00). There is no visible river.** The syrup is a flat matte pink
plane with a faint painted swirl, no flow, no banks, no specular, no depth cue — the player walks on
it without noticing. The giant gumdrops beside it (≈ -112,26) are smooth glossy balloons with one
specular dot; they are the biggest mass in frame and the least characterised.

**2.9 `candy_lake` (-190,40, 15:00).** The most monochrome frame in the game — ~85% brown/tan, no
focal point, no value hierarchy. Chocolate reads as a mud flat: matte, no gloss, no viscosity, no
crust at the rim. Reeds are tan faceted spikes (read as rock crystals); lily pads are flat green
hexagons with a pink triangle decal. The "CHOCOLATE LAKE / …will float" sign is rotated ~80° and half
out of frame. ("no swimming. no drinking. no." is a great line — nobody will read it.)

**2.10 `candy_cupcake` (-88,-18, 10:00).** At distance 21 the Great Cupcake is a wall of pink and
white vertical stripes with a window in it — the biggest landmark on the island is unreadable as a
cupcake from the game camera. The player stands on a small wafer deck that appears unsupported. A
"…CUPCAKE" sign is rotated ~60° and overlaps the deck.

**2.11 `candy_night` (-140,40, 23:00).** Night is not night: ground keeps full daytime saturation and
value, and every texture is legible. The Sour Patch Kids are excellent — dark faces, glowing eyes,
acid-green rim — but their light pools are **hard-edged flat green discs** on the ground. No lamp is
lit anywhere in the village and no window glows. Ambient toast still says "A V of sugar-gliders goes
over, low and fast" at 23:00.

**2.12 `candy_dusk` (-120,30, 19:12).** Best Candyland frame. "Chomp: don't be where we can find you.
we will find you." is the best writing on the island. But the pink river plane stays **fully bright
hot pink while everything else falls into shadow** — it reads as unlit/emissive and breaks the light.
Six text panels stacked on screen at once.

**2.13 `sea_crossing` (free 0,22 d90, 17:00). The sea is the worst material in the game** — muddy
grey-brown-violet marbling, like wet concrete, with no waves, no foam, no sun path, no shore line;
70% of this frame. At 09:00 (`cat_arrival`, `cat_harbor`) the same water is a decent teal, so the
water grade is swinging wildly with sun angle. **The player is standing on the open ocean at (0,22)**
— worth a containment check. The ferry (a blue narwhal with a striped awning) is one of the best
props in the game but sits in a hard-edged elliptical ripple decal. The mid-strait floating coloured
shapes read as litter, not fish.

**2.14 `cat_arrival` (46,22 d52, 10:00).** Excellent writing (DEPARTURES all CANCELLED / ARRIVALS ONLY
ON TIME; "THANK YOU FOR STAYING / and staying. and staying."; population "17 cats (you!)"). But:
**three black cylinders and four dark rings float unsupported in mid-air over the water at ≈(40..48,
14..20)**; the THANK YOU banner also floats with no posts; the arrivals shed roof is semi-transparent
and you can see through it; ~14 identical palms, several growing through the pier and the shed; five
identical cone conifers evenly spaced along the path.

**2.15 `cat_plaza` (78,20 d48, 11:00).** "YOU ARE HERE (FOREVER)", "THINGS TO DO: stay", "GENEROSITY
(ongoing)" — first-class. But the fountain water is an **opaque dark grey-green disc** (reads as
asphalt) with a plain white cylinder for a jet; the flowerbeds are flat coloured cards lying in
planters, repeated in 8 identical octagonal beds; confetti particles + flat-card flowers + floating
white paper shapes make this the noisiest frame on Cat Island; the plaza's tallest object is a lamp
post, so the "Welcome Plaza" has no landmark mass.

**2.16 `cat_main_street` (112,2 d56, 12:00).** The best zone in the game. PURRBUCKS / CATNIP
DISPENSARY / TRAVEL AGENCY (CLOSED) / CLIP SNIP FREE NAILS NO REFUNDS / THE FISH MONGER — NO FISH FOR
HUMANS. Problems: eight big roof planes fill 60% of the frame and every roof uses the identical
ribbed tile at the identical scale in only two colours; the street is the brightest value in frame
and washed out; **at midday on Main Street I count three cats.** It should be twenty.

**2.17 `cat_meow_donalds` (free 123,-20 d64, 12:30).** "BILLIONS SERVED (mice)" and "i'm purring it"
land. The golden arches are two separate yellow **cones** — they read as wizard hats, not arches.
Upper-left third of the frame (≈ 100..120, -50..-25) is bare green hill with four identical umbrella
trees: a real dead zone next to the island's busiest landmark. Three long thin brown poles lie
diagonally across the tent at ≈(150,-45) and read as an error.

**2.18 `cat_square` (152,8 d62, 14:00).** The giant tan cat statue is the best landmark mass in the
game and "PURRLIAMENT — nine lives · one term · no departures" is the best sign. But ~40% of the
frame is **empty pale tan pavement** with nothing on it, ringed by ~18 identical dark cypress cones
(flagged twice already, still there). Both clock faces are illegible blobs. The "← EXIT" sign points
at a wall. Four cats in the civic heart of the island at 14:00.

**2.19 `cat_residential` (178,48 d86, 15:00).** Eight houses sharing one roof texture, one turret
shape and one proportion, arranged on a ring — reads procedural. The cul-de-sac centre is an empty
tan disc. The surrounding rock/bush/shrub scatter is the same three props repeated ~60 times.
**"a loaf in every window" is written on the sign and there is not a single loaf cat in a window** —
the cheapest, funniest fix available anywhere in this project.

**2.20 `cat_park` (140,-58, distance 21 — the true game camera). THE WORST FRAME IN THE GAME.** The
entire image is behind a milky pale-green scrim at roughly 60% coverage, crossed by long translucent
green bars. It is the catnip haze (`fx_catnip_haze`) rendering as giant near-camera quads. Fainter
versions of the same veil are visible over `cat_plaza`'s fountain and across `cat_main_street`'s blue
awning, so this is island-wide, not local. Nothing in Catnip Commons is legible.

**2.21 `cat_gym` (197,-22 d58, 16:00).** "MUSCLE BEACH / LIFT OR LEAVE / (you can't leave)" and four
genuinely buff cats — great. But a ~30-unit grey barbell lies diagonally through the hedge-maze wall
and the terrain at ≈(185,-40); a **pure-black rectangular void** (a doorway with no interior) sits in
the rock wall at ≈(205,-35); the pink yarn strand from Yarn Hill clips through the big boulder; the
grass is dotted with ~40 flat card "flowers" that read as litter; some grass blades are cyan.

**2.22 `cat_harbor` (free 91,72 d48, 09:00).** "BOATS ARE FOR CATS / thank you for your
understanding" and Lifeguard Paws are great. But ~15 **plain grey/white boxes** are strewn across the
beach at ≈(85..105, 55..70) — untextured placeholder crates, the ugliest props in the game. A fish
harbour with no fish, no nets, no gulls, no crates of catch, no market. The player is not visible
anywhere in the frame.

**2.23 `cat_lighthouse` (free 214,31 d72, 18:00).** One of the two best frames: warm amber grade,
glowing windows, gulls, the whole town legible behind. But **the lighthouse lamp is dark at sundown
and there is no beam** — the single most obvious missed beat on the island. The sky is a flat amber
gradient with no sun disc and no cloud; the sea at the horizon is the same value as the sky, so the
horizon line disappears entirely.

**2.24 `cat_night` (112,2 d58, 22:00). The best frame in the game.** Warm window emissives, lantern
strings, a real blue night grade, cats out under curfew, "Curfew: the lantern cats will walk you
home." Problems: four or five **blown-out white smoke puffs** float above the roofs with no visible
chimney and are the brightest objects in frame; a white lens streak beside the catnip sign; the
minimap stays daytime green at 22:00; the landmark banner falls back to the generic "Cat Island"
instead of "Main Street" (same fallback bug as `cat_park`).

**2.25 `cat_overview` (free 150,0 d260).** Legible and charming, the strongest overview. Dead grass:
the NE quadrant (≈ 190..235, -40..20), the far north strip (≈ 120..170, -85..-70) and the west coast
below the harbour (≈ 75..95, 30..60). Palms read as black spiders from above.

### 3. THE PERSISTENT UI BUG (every Candyland frame)
A dialogue panel labelled **"Rasp"** with a body of literally `...` and an `E >` advance chevron is
open in **all eleven** Candyland tour frames, including the two overviews. It never closes, it eats
the bottom-centre of every shot, and its content is a placeholder ellipsis. This is the most-seen
defect in the game. (Cat Island's equivalent — "Pumpkin: A human! A real one!" — is also stuck open
in all 12 Cat frames, but at least it has text.)


---

## BATCH 2 — camera study + gap views (renders/ad1)

### 4. CAMERA FRAMING — the single highest-leverage change in the game
Default is `distance: 21, elevation: 0.70, fov: 30` (src/systems/camera.js l.42). I shot the same
spot at three stops:

| view | what you can see |
|---|---|
| `renders/tour1/candy_village.png` (d21) | a bench, a signpost, two gumdrop kids. No house. No fountain. No village. |
| `renders/ad1/village_d32.png` (**d32**) | the whole of Gumdrop Village: gingerbread houses with icing eaves, the Sugar Fountain, FIZZ BOMBS and SOUR LEMON DROPS shopfronts, candy-cane lamps, benches, the path junction. **A place.** |
| `renders/ad1/village_d44.png` (d44) | the village reads as a ring-plan town, but the player is completely hidden and near roofs eat the bottom third. |

**Recommendation: default `distance: 30–32` (I would ship 31), `elevation: 0.62–0.66`, fov 30
unchanged; keep minDist 10 / maxDist 84.** Nothing on Candyland was broken at the village — it was
invisible. The same test on Cat Island (`catsquare_d21.png`, `catres_d21.png`) shows the opposite
failure: at 21 the Cat plazas are *empty tan floors*, so Cat Island needs both the pull-back **and**
floor-level props.

Second camera finding: **the occlusion fade/dolly is not firing on the big near masses.**
`cat_dawn.png` (Main Street, 06:18) is 45% one red roof with the player fully hidden behind it;
`pier_walk.png` (walking inland from Sugar Pier) has no player in frame at all; `candy_forest`,
`cat_harbor`, `cat_residential` and `cove.png` all lose the player. Whatever the probe radius is, it
is missing roofs, giant jellybean boulders and rock masses. Nothing may sit between the lens and the
visitor for more than a beat.

Third: **the player reads fine as a human at 21–34** (`catsquare_d21.png`: hat, face, striped shirt,
camera on a strap, red shorts). The "reads as a cat" complaint from citizens-r1 is a *distance*
artifact from the d52–86 Cat views, not a model problem. Do not redesign the character; fix framing.

### 5. NEW FRAMES

**5.1 `ad1/candy_dawn.png` (-140,40, 06:18, d34) — the best Candyland frame in the project.** Lamps
glow warm with light pools, windows are lit, the fountain sparkles, kids stand in the square. This
*disproves* the "candy lamp heads are black voids" flag — the lighting is there, it was never framed.
Remaining: the lamp glow is a hard-edged disc on the ground plus a fat halo sprite that sorts in
front of its own post; the Sugar Fountain at (-141,48) is pink water in a pink basin in front of a
pink tier — the water is invisible; two near roofs eat the bottom third unfaded.

**5.2 `ad1/cat_dawn.png` (118,0, 06:18, d34).** Beautiful warm lantern street. But the bottom 45% is
one unfaded red roof and the player is gone. Up close the roof is a row of separate half-cylinder
tiles with **gaps you can see the dark interior through**, and the ridge has a missing-tile gash.

**5.3 `ad1/ferry_deck.png` (Sugarfin Express at Sugar Pier, 11:00).** Lovely boat: striped awning,
gem bunting, brass bell, life ring, porthole, "Board the Sugarfin Express". Two defects: **the
passenger deck under the awning is a pure black void** (unlit interior, reads as a hole in the boat),
and the awning is unshaded pure white/red so it is the brightest object in the frame. Also the
Candyland beach behind it is streaming white confetti chips into the sea, and a plain grey box prop
sits on the sand at ≈(-46,33).

**5.4 `ad1/sea_noon.png` (free -10,30, 12:00) — the cohesion frame.** Both islands in one shot:
foreground Cat Island (terracotta, teal, palms, stone), background Candyland (a bristly rainbow
hedge). They do not look like the same world. Also: the water at noon is decent (blue-teal with a
white shore band) but perfectly flat — no sparkle, no swell, no sun glitter; the distant water fades
into a milky band with **no horizon line and no sky**; and there is **no atmospheric perspective** —
Candyland is as saturated at 300 m as at 10 m, which is why the far coast reads as a hedge instead of
a landmass.

**5.5 `ad1/cove.png` (255,-29, 14:00) — the best water in the game.** Turquoise shallows with sand
reading through, darker blue offshore. Proof the water material can be great; `sea_crossing` at 17:00
being grey-brown mud is a *grade* problem, not a material one. The cove itself is under-rewarded: an
umbrella, two crates, a towel. A secret you crawl through a tunnel to reach needs a payoff — a raft
half-built, a bottle with a note, a cat who has been here since 1974. The tunnel mouth is a pure
black hole with hard polygon edges; the player is lost inside the rock.

**5.6 `ad1/tunnel.png` (202,-38, 13:00).** The best sign-writing cluster in the game: RECORDS board
(SNATCH · a bird · 0 m / ESCAPE · nobody), "HYDRATE WITH MILK", "SPOT YOUR FRIEND — they will not
leave", "NOT-AN-EXIT BEACH", "BEACH CLOSED". But the tunnel entrance reads as a vending machine — a
black rectangle in a grey box labelled GYM STORAGE — and the pink yarn strand from Yarn Hill snakes
across the grass and **ends in mid-air**; yarn balls are half-buried; the player is behind a rock.

**5.7 `ad1/pier_walk.png` (-50,26 walking inland 180 frames, d30).** What the player actually sees
leaving the pier: a **wall of undifferentiated coloured blobs**, no path visible, no landmark
visible, no horizon, and no player in frame. The ground splat here is arbitrary blotching (hot
magenta / olive / tan) unrelated to paths or height and reads as mould. This is the walk that decides
whether someone keeps playing.

### 6. DEV UI LEAK
A camera-mode chip row — `1 ISO · 2 FOLLOW · 3 TOP` — is rendered bottom-left in `ferry_deck.png`,
`sea_noon.png`, `cove.png` and `tunnel.png`. It looks like debug UI and it collides with the HELP
pill directly under it.

---

## BATCH 3 — the gaps batches 1–2 left (renders/ad3), fresh art director
Nine new frames + one camera check, shot 2026-09-12 against the **new** camera default
(`azimuth π/4, elevation 0.55, distance 28, fov 30`). Wave-2 systems are mid-build; I judge design,
not transient breakage, and I do not flag wave-2 features for being absent.

**Headline for this batch: the camera is now the worst system in the game.** Five of the nine frames
below contain **no visible player**, and one of them (`candy_dusk_cupcake`) is 100% the inside of a
single prop. Everything else in this report is downstream of that.

### 7. THE NEW FRAMES

**7.1 `ad3/ferry_cross.png` — mid-crossing, deck level (`?ferry=0.45`, 11:00, default cam).**
The best new frame. Sugarfin reads beautifully: candy horn, striped canopy, bunting, "SUGARF…" hull
lettering, escort dolphins, a real teal sea with a foam shore band and sparkle. Problems, in order:
- **Four flat sign-cards float in the empty sky over the strait at ≈(20…40, 6…12), ~8–14 units up**
  (top-right quadrant of frame) — billboards with no posts, plus one ladder-like object. The same
  defect appears in `candy_west_dusk`. Something is publishing signage without its supports.
- **The player is invisible on his own boat.** He is at (1.8, 4.6, 21.1) under the canopy; the canopy
  and the cabin sit between him and the lens for the whole 21.5 s crossing. The one scripted moment
  where the player is a passenger and we cannot see him.
- **No wake, no bow wave, no heel.** She is mid-ocean at speed on glass. One faint ripple ring.
- **The strait is too small to be a voyage.** At distance 28 both piers are in the same frame:
  Sugar Pier at frame-left, Arrivals Pier at frame-right. A 21-second crossing where you never lose
  sight of either shore reads as a pond, not a sea.
- Candyland from the water is **a bristly rainbow hedge with no landmark in its skyline** — no
  cupcake, no palace, no peak breaking the line. Nothing to sail *toward*.
- Candyland's beach at ≈(-46…-40, 28…34) is littered with **plain grey/white untextured boxes**
  (same placeholder family as the Fish Harbor crates) and streaming white confetti chips.
- An orange escort fish intersects the whale's rostrum at the horn root.

**7.2 `ad3/gym_tunnel.png` (205,-36, 15:00, default cam) — Muscle Beach tunnel.**
Unreadable. A dumbbell rack and a barbell crop the left 30%, the tunnel block crops the right 40%, no
player in frame. **The tunnel still reads as a kitchen appliance**: a grey box with a hard-edged pure
black rectangle in it, sitting on grass, no rock framing, no lintel, no light or depth inside, no
arrow, no worn track leading in. Nothing says "crawl through to the cove". The RECORDS board
(BENCH · Sgt. Biscuit 41 kg / SNATCH · a bird / ESCAPE · nobody) is the best thing here and it is
legible. Secondary: loose dumbbells are 2–3× player height and read as ordnance; the white speck
field (see 13) is over everything; flat card flowers hover at assorted heights above the grass.
Also `TIGER TIME — the cats are… bigger now` banners at **15:00 in full sun** (state bug).

**7.3 `ad3/cat_dawn_harbor.png` (100,56, 05:53 "SUNRISE") — dawn on Cat Island.**
**There is no dawn.** At 05:53 the frame is flat blue-black night: no warm horizon, no low sun, no
rim light, no colour temperature break. We cut from night straight to day and skip the single most
beautiful hour a Pikmin-alike owns. Fish Harbor also has **zero light sources** — not one lantern, lit
window or brazier — so the first landmark on the walk from the pier is the darkest place on the
island. The player IS visible here (open cobble path, ~90 px tall): proof d28 works where nothing
crowds the lens. Secondary: the "Talk to Fishmonger Gus" prompt floats ~250 px away from Gus; a pale
green pickup ring with a cookie sprite hovers unexplained at ≈(96,52); the flying-machine prop clips
through the "BOATS ARE FOR CATS" sign and its posts at ≈(94,60); the white speck field is identical
day and night, so at night it reads as lens dirt rather than fireflies.

**7.4 `ad3/candy_dusk_cupcake.png` (-92,-24, 19:36) — the worst frame ever rendered for this project.**
**100% of the screen is the inside of the Great Cupcake's frosting swirl**: one unbroken purple
low-poly mass, four UI panels floating on it, no player, no ground, no sky, no landmark. The camera
sat inside a landmark and neither faded it, dollied out of it, nor culled it. `candy_cupcake` was
already flagged as unreadable at d21 in batch 1; at d28 the landmark has become an opaque wall. Any
player who walks to the island's headline landmark gets this.

**7.5 `ad3/candy_west_dusk.png` (free -228,18 d92, 19:23) — far west coast / Gumdrop Cliffs.**
**There is no cliff.** "Gumdrop Cliffs — bouncy all the way down" promises a drop; the geometry
delivers eight big spheres on a slope. No face, no ledge, no beach below, no way down, nothing
bouncy. Behind them, ~200 gummy-bear trees in ten hues at full saturation, near-identical silhouette
and near-identical size, distributed almost uniformly for 60 units — this is the "colour rubble"
failure at its purest and it is the west half of the island. Dusk grade: sky is a flat dusty red
wash, props keep full daytime saturation, no long shadows, no warm key, no rim — dusk is a filter
over the same frame, not a different time of day. Secondary: white chevron spikes float mid-air among
the trees at ≈(-215,10); more postless sign-cards float in the sky top-left; three toasts stack in
the top centre; "Rasp: see you at seven thirty!" is good writing and the batch-1 `...` placeholder is
fixed.

**7.6 `ad3/cat_north_coast.png` (free 150,-72 d92, 11:00) — the north coast.**
Genuinely dense and the best-composed wide in the game: bandstand, hedge maze, cat statue on a
plinth, a pond with a timber bridge, picnic tables, a proper foam-edged beach with wet sand. Two big
problems. (a) **A large untextured pale-grey mass — a flat grey block and tower at ≈(120…150,
-80…-62) — is the island's entire northern skyline.** It reads as an unfinished blockout and it is
the first thing you see from the sea. (b) **Catnip Commons is empty of cats at midday** — I can find
one, maybe two, in a civic park the size of Main Street. Secondary: ~14 identical picnic tables in
five colours, scattered evenly, none in use; palms cloned at one size in a band that meets the
conifer band with no transition; thin brown driftwood sticks lie on the sand at ≈(148,-80) and read
as error geometry (same prop that reads as a mistake at Meow Donald's); the big grey rocks at
≈(128,-72) read as polystyrene. The catnip haze that ruined `cat_park` in batch 1 is gone — fixed.

**7.7 `ad3/pier_to_main_walk.png` (from 44,22, walked ~230 ticks toward Main Street, 10:30).**
The requested walk. What the player actually gets: **you walk 35 m from the Arrivals Pier and the
WELCOME TO CAT ISLAND arch becomes a full-screen wall.** The banner spans the path from roughly
y=3 to y=8 and the camera neither fades it nor lifts over it; the player is gone behind it. The
sleeping cat on a stack of books under the arch is lovely and nobody will see it from the game
camera. The prompt chip "Population sign" is on screen with the sign itself cropped out of frame.
This is the first 30 seconds of Cat Island.

**7.8 `ad3/candy_night_meadow.png` (-108,-42, 23:23) — night on Candyland.**
Night is real now (batch 1's "night is not night" is fixed): a true dark blue-violet grade, the
player is lit and visible, Sour Patch Kids sparkle in five hues, the signpost arms (GREAT CUPCAKE /
VILLAGE / LOLLIPOP MEADOW) are legible. Four faults: (a) **the giant lollipop sticks are pure white
and unlit, so at night they are the brightest objects in the frame** and four of them slice the
composition into vertical bands; (b) each Sour Patch Kid still stands on a **hard-edged flat pale
disc** and overlapping kids make scalloped shapes on the ground (batch 1 flag, still live); (c) the
ground's stripe texture aliases at grazing angles into **thin red diagonal scratch lines** across the
whole mid-ground; (d) a blue fish/rocket prop hovers just above the grass beside the player with no
context. Plus the ambient toast "A V of sugar-gliders goes over, low and fast" fires here at 23:23 —
the same line appeared in batch 1 at 23:00 and again in my 19:23 frame. The ambient line scheduler is
stuck.

**7.9 `ad3/cat_night_residential.png` (176,46, 23:00) — night on Cat Island.**
Charming: a warm glowing window with a planted window-box, a lamp pool on the cobbles, white picket
fences, two cats with a lit lantern (the lantern cats!), a door labelled **HUMANS**, "…T HOUSE /
…it always was." and the curfew banner. Faults: (a) **a giant dark-green cat topiary fills the centre
45% and hides the player** — the batch-1 "empty tan cul-de-sac" was filled with something the camera
cannot see past, so a dead zone became a camera wall; the topiary is one flat green with no night
shading and reads as a hole; (b) **the minimap is still daytime green at 23:00** (batch 1 flag,
still live); (c) **the landmark banner says "Cat Island" instead of "Whisker Heights"** while standing
in the landmark core (the generic-fallback bug, still live); (d) "Pick up Candy" floats detached from
any visible item; (e) no stars and no moon disc in the sky, just flat purple.

**7.10 `ad3/village_d28.png` (-140,40, 11:00) — the camera check, same spot as `tour1/candy_village`
(d21) and `ad1/village_d32` (d32).** At the new d28 / el 0.55 the village is *better* than d21 and
clearly *worse* than d32: still **no house in frame**, the Sugar Fountain is cut by the left edge,
and the player is half behind a candy-cane signpost pole with a red gumdrop over his shoulder. The
lost elevation is doing the damage — at el 0.55 the sightline runs straight through the 2–6 unit prop
band instead of over it. Also visible: **"Rasp: `...`" is still open with a literal ellipsis body**
(batch 1 §3, still live at the village); the licorice path is the darkest value in frame and reads as
asphalt with red road markings; the CHOCOLATE LAKE / SUGAR PIER arms are ~4 player-heights long.
Good: the ground here is mint green rather than hot magenta (terrain has been pulled down — real
improvement), and the jellybean beetle and sparkling kids are charming.

### 8. COHESION OF THE TWO ISLANDS — better than batch 1, still two games
Terrain has closed part of the gap (Candyland's ground is now mint/green near the village, the
specular sheen is gone from the frames I shot) and the **sea is genuinely good now** — teal, foam
shore band, wet-sand edge in `cat_north_coast` and `ferry_cross`. That was batch 1's cheapest
cohesion win and it landed. What still splits the two islands:
- **Silhouette language.** Cat Island builds *architecture* (bandstand, arch, turrets, plinths,
  bridges, fences) — objects with structure. Candyland builds *lumps* (spheres, bears, domes). Put
  `ad3/cat_north_coast.png` beside `ad3/candy_west_dusk.png`: one is a town, one is a bead spill.
- **Saturation discipline.** Cat Island holds ~5 hues per cluster. Candyland runs 10 at full
  chroma in a single field (`candy_west_dusk`). The rule in the brief is being honoured on one
  island only.
- **Density grammar.** Cat Island clusters (tables around the bandstand, fences along the street);
  Candyland scatters uniformly. Same note as batch 1, unchanged on the west half.
- **Shared vocabulary is still nearly empty.** The only objects that appear on both islands are the
  wooden arm-sign, the flat card flower and the white speck particle. None of them is a *good*
  shared object. Two cheap unifiers: put the ferry's candy-stripe on Cat Island's harbour poles
  (already partly there), and put Cat Island's picket/fence-and-plinth structure into Gumdrop Village
  so the candy island has at least one built edge.
- **Atmospheric perspective now exists** (`candy_west_dusk` background reads lighter) — keep pushing
  it; at 300 m Candyland should lose ~40% chroma, not 10%.

### 9. DEAD ZONES (coordinates)
- **Candyland gummy field, ≈(-215…-185, -5…35)** — 60 units of near-uniform gummy-bear trees; dense
  but informationally dead. Needs a clearing, a ruin, a stream crossing, a size break: 3 giant
  "grandmother" gummies at 3× scale and a bald patch you can actually walk through.
- **Gumdrop Cliffs, (-222,18) r22** — a named landmark with no landform. Nothing happens here.
- **Syrup Delta, (-98,72) r10** — no view exists in any views file; 35 rendered frames have never
  been there. Landmarks nobody ever photographs are landmarks nobody built.
- **Sour Shrine, (-218,-44) r8** — same: never rendered, labelled '???'.
- **Candyland shore, ≈(-52…-38, 26…36)** — sand plus grey placeholder boxes plus confetti, on the
  route every player walks first.
- **Cat Island NE quadrant, ≈(190…235, -40…20)** — flagged in batch 1, still bare in `cat_overview`.
- **Meow Donald's north hill, ≈(100…120, -50…-25)** — bare green with four identical umbrella trees,
  right beside the busiest landmark.
- **Catnip Commons, (140,-58) r30 — a *social* dead zone**: full of props, empty of cats at midday.
- **Fish Harbor, (100,58) r20** — no fish, no nets, no gulls, no catch, no market, no lights.

### 10. WEAK TRANSITIONS
- **Arrivals Pier → Welcome Plaza (44,22)→(78,18)**: the WELCOME arch is a full-screen wall
  (`pier_to_main_walk`). The single worst transition in the game because it is the first.
- **Sugar Pier → Gumdrop Village (-42,22)→(-140,40)**: batch 2's `pier_walk.png` — no path, no
  landmark, no horizon, a wall of blobs. Unchanged.
- **Sea → Candyland shore**: sand meets saturated ground with a hard seam and placeholder boxes.
- **Palm band → conifer band on Cat Island, ≈(160…180, -70…-55)**: two ecologies butt together with
  no intermediate species.
- **Gummy forest → Gumdrop Cliffs, ≈(-205…-222, 5…30)**: a hue change, not a place change.
- **Ferry arrival, both ends**: you disembark into clutter, not into a framed view of where to go.
  The moment the gangway drops is a free establishing shot and neither end uses it.

### 11. REPEATED IDEAS (the same object doing all the work)
1. **The gummy-bear tree** — one silhouette, hundreds of copies, hue-randomised (`candy_west_dusk`).
2. **The wooden arm-sign** — the game's only signage device, on both islands, at every scale.
3. **Cypress cones** (~18 at `cat_square`), **palms** (~14 at the pier), **umbrella trees** (4 at
   Meow Donald's) — cloned at one size each.
4. **Picnic tables** — ~14 identical, five colours, evenly spread (`cat_north_coast`).
5. **The ribbed roof tile** — one texture, one scale, two colours, eight roofs (`cat_main_street`).
6. **The turret house** — one plan × 8 on a ring (`cat_residential`).
7. **Flat card flowers** — on both islands, reading as litter at every distance.
8. **Grey untextured boxes** — harbour crates (85…105,55…70), candy beach (-46,33), the gym tunnel
   block (205,-36), north-coast rocks (128,-72), the grey skyline mass (120…150,-80…-62). This is
   one material failure showing up in five places.
9. **The hard-edged flat light disc** — Sour Patch Kids, lamps, lollipop shadows, fountain water.

### 12. SCALE PROBLEMS
- **Signage is billboard-scale.** The village signpost arms are ~4 player-heights (`village_d28`);
  the WELCOME arch banner spans the full path width at head height and is ~8 units tall.
- **Lollipop sticks are 2–3 units thick and pure white** — at night they out-bright the moon
  (`candy_night_meadow`).
- **Loose gym dumbbells are 2–3× the player** (`gym_tunnel`) and read as artillery, not weights.
- **Gumdrops are house-sized** but have house-sized *silhouettes* with zero detail, so they read as
  terrain, not candy.
- **The strait is 48 units wide** while each island is 118 in radius. The sea crossing — the game's
  one cinematic — happens in a channel narrower than Main Street is long (`ferry_cross`).
- **The Great Cupcake at (-88,-18)** is correctly huge and completely unreadable from the ground; a
  giant landmark needs a stand-off ring of 25–30 units of open ground so the camera can see it.

### 13. VISUAL NOISE — the white speck field is now the game's worst offender
A field of small **pure-white specks is drawn over every frame on both islands, day and night**
(`gym_tunnel`, `cat_north_coast`, `cat_dawn_harbor`, `ferry_cross`). In daylight it reads as dust on
the lens; at night it reads as the same dust, not as fireflies. It is the one element that touches
100% of frames and it makes everything look slightly dirty. Cut the count by ~70%, tint per island
(warm cream on Candyland, pale green-gold on Cat Island), make them glow only at night, and never
let them draw within ~6 units of the lens. Then: Candyland's ground confetti sprinkle + flat card
flowers + 10-hue props stack three noise fields on top of each other; and at night the ground stripe
texture aliases into thin red diagonal scratch lines (`candy_night_meadow`) — mip that texture down.
UI noise is real too: `ferry_cross` and `gym_tunnel` carry eight simultaneous UI surfaces (objective,
banner, two toasts, landmark card, dialogue, prompt chip, camera-mode chips, help pill, clock,
minimap). Cap ambient toasts at one, and suppress the camera-mode chip row unless a mode key was
pressed in the last few seconds.

### 14. PATH & LANDMARK READABILITY
- **Cat Island reads.** The pale hex cobble is the clearest wayfinding surface in the game; keep it.
- **Candyland's licorice path is the darkest value in every frame it appears in** and its red centre
  stripes read as road markings (`village_d28`, `candy_night_meadow`). Licorice should be a warm
  dark *brown-red* with a soft edge and a lighter sugar-dust shoulder, not near-black asphalt.
- **No landmark is legible from the sea.** From the ferry, Candyland's skyline is a flat bristly
  band with nothing tall in it (`ferry_cross`). The Great Cupcake, Frosting Peak and the Palace
  should be visible from the deck; that is what makes a crossing feel like an arrival.
- **The landmark banner still falls back to the island name** inside named landmark cores
  (`cat_night_residential` at (176,46) says "Cat Island", not "Whisker Heights").
- **Interaction prompts are not anchored to their objects** ("Talk to Fishmonger Gus" 250 px from
  Gus; "Pick up Candy" over a topiary; "Population sign" with the sign out of frame).
- **The minimap is the best-designed thing in the project** and it is still daytime-green at 23:00.

### 15. CAMERA FRAMING — judged on the new default (d28 / el 0.55 / fov 30)
**The distance change helped. The elevation change hurt more than the distance helped, and neither
matters until occlusion is fixed.**

Evidence from this batch, all at the new default:
| frame | player visible? | what filled the lens |
|---|---|---|
| `ad3/cat_dawn_harbor` (100,56) | **yes**, ~90 px | open cobble path — nothing in the way |
| `ad3/village_d28` (-140,40) | half | signpost pole + gumdrop; still no house in frame |
| `ad3/gym_tunnel` (205,-36) | **no** | dumbbell rack left, tunnel block right |
| `ad3/pier_to_main_walk` (≈78,18) | **no** | the WELCOME arch banner, 50% of frame |
| `ad3/cat_night_residential` (176,46) | **no** | the cul-de-sac topiary, centre 45% |
| `ad3/candy_dusk_cupcake` (-92,-24) | **no** | the inside of the Great Cupcake, 100% |
| `ad3/ferry_cross` (1.8,21) | **no** | the ferry's own canopy and cabin |

**Recommendation — ship `distance: 31, elevation: 0.64, fov: 30`** (minDist 10 / maxDist 84
unchanged). 31 is where batch 2's A/B landed (`ad1/village_d32` is the only frame in this project
where Gumdrop Village looks like a village) and 0.64 is the pitch that clears the 2–6 unit prop band
that el 0.55 stares straight into. Overhead multiplier and follow mode unchanged.

**But the number is the small half of this.** The occlusion probe is clearly a thin ray from lens to
the player's *feet*, and it is missing every big mass in the game: roofs, banners, canopies,
boulders, topiary, frosting. Required behaviour, in priority order:
1. Sweep a **capsule of radius ~1.2 from the lens to the player's head**, not a ray to the feet.
2. Any mesh the capsule intersects **alpha-fades to ~0.15 over 0.12 s** and restores over 0.3 s —
   roofs, canopies, banners, signs, boulders, topiary, landmark shells, the ferry's own awning.
   Fading is better than dollying: dollying breaks scale, fading keeps it.
3. **Hard floor: if the lens is inside a mesh's bounding volume, cull that mesh entirely.**
   `candy_dusk_cupcake` must be impossible.
4. Dolly in only as a last resort, never below 14, and always return to the player's chosen distance.
5. **The player must be visible in every frame.** That is the acceptance test: re-shoot the seven
   rows above and count heads.

Also: the player reads fine as a human at 28–34 (`candy_night_meadow`, `cat_dawn_harbor`) — batch 2
was right, do not redesign the character.

### 16. MISSING INTERACTIONS / DEAD PROPS
- **Fish Harbor (100,58)**: crates you cannot open, no fish anywhere in a fish harbour, no nets, no
  gulls, no ice, no scales, no market stall front. Gus has nothing to sell.
- **The ~14 picnic tables (135…160, -70…-45)**: no cats eating, nothing on them, no litter, no bins.
- **The bandstand (≈150,-60)**: a stage with no band. It is a stage.
- **The hedge maze (≈165,-42)**: no reward visible at its centre.
- **Benches** (village, plaza, park): the player cannot sit; a sit is two lines of code and reads as
  life in every screenshot thereafter.
- **Fountains** (Sugar Fountain -141,48; plaza fountain 78,18): opaque disc water, no coin toss, no
  splash, no interaction.
- **The lighthouse lamp (218,30)**: dark at sundown, no beam — still the most obvious missed beat on
  Cat Island (batch 1 §2.23).
- **The gym (198,-26)**: a RECORDS board that only reads, and a bench with no "try the bench" gag.
- **The gym tunnel mouth (205,-36)**: no lure, no light, no sound cue, no arrow — the entrance to a
  secret is styled like a storage cupboard.
- **The Chocolate Lake shore (-200,48)**: a sign says "no swimming. no drinking. no." and there is
  nothing to swim in, drink from, or disobey.

### 17. DELIGHT OPPORTUNITIES (cheap, specific, funny)
1. **"A loaf in every window."** Whisker Heights already says it on a sign (178,48). Put actual
   loaf-posed cats in the eight lit windows. Still the highest joke-per-line-of-code in the project.
2. **Sugarfin's crossing**: a cat stowaway in a crate on the deck who hisses when the camera finds
   him; a dolphin that does one flip at t=0.5; the captain's hat blowing off and being retrieved.
3. **The gym**: a cat pinned under a barbell at (200,-28) calling "spot me — SPOT ME" on a loop,
   under the existing "SPOT YOUR FRIEND" sign.
4. **Picnic tables**: one cat asleep face-down *on* a plate; one table upended with a fish skeleton
   under it and a very innocent cat beside it.
5. **The HUMANS door (≈184,44)**: a peephole that blinks when you get close.
6. **Marshmallow sheep (-110,-45)**: one is stuck to the licorice path; freeing it pops it off with
   a sugar burst and it sprints away trailing fluff.
7. **The lollipops (-120,-20)**: one giant lollipop with a bite taken out of it exactly the size of
   the player's head; initials carved on a stick nearby.
8. **Sour Patch Kids at 19:30**: they queue politely at the pier for the last ferry, waving. "see you
   at seven thirty!" is already written — stage it.
9. **Fish Harbor dawn**: gulls stealing from Gus's stall on a timer; one cat on the roof who catches
   nothing all day and is furious about it.
10. **Chocolate Lake**: a rubber duck slowly circling, and a pair of cat sunglasses on the shore.
11. **The tunnel (205,-36)**: two blinking eyes in the dark and a hand-lettered card: "HE IS FINE."
12. **Bandstand (150,-60)**: three cats who start playing only if the player stands still for 10 s,
    and stop the instant he moves.

### 18. NIGHT ON BOTH ISLANDS
**Candyland night is now good** (`candy_night_meadow`, 23:23): a true dark blue-violet grade, a lit
player, sparkling kids, legible signposts, coloured fireflies. Three fixes: the **giant lollipop
sticks must go dark at night** (they are currently the brightest objects in frame and they slice the
composition into vertical bands); the **Sour Patch light pools need a soft radial falloff** instead
of hard-edged discs that scallop where they overlap; and the ground stripe texture aliases into red
scratch lines at grazing angles.
**Cat Island night is the best-lit place in the game** (`cat_night_residential`, 23:00): warm window
emissives, a planted window-box, a lamp pool on cobbles, lantern cats, the HUMANS door. Fixes: the
topiary at (176,46) is one flat unlit green mass; **there are no stars and no moon disc** anywhere in
the night sky — the sky is a flat purple field, which is why the horizon disappears; the minimap
stays daytime green; and the landmark banner falls back to "Cat Island".
**Dawn does not exist on either island.** At 05:53, labelled SUNRISE, `cat_dawn_harbor` is flat
night. There must be a 20-minute warm ramp: low orange key, long shadows, mist on the water, lamps
and windows switching off one by one. Batch 2 found `ad1/candy_dawn.png` (06:18) was the best
Candyland frame ever shot — so the dawn grade exists at 06:18 and is simply absent at 05:53. Widen
the window, and put gold on the sea.

### 19. THE TEN WORST SINGLE SPOTS (ranked)
1. **(-92,-24) The Great Cupcake approach** — the camera renders the inside of the landmark
   (`candy_dusk_cupcake`). Total failure at the island's headline attraction.
2. **(≈78,18) The WELCOME arch on the pier→plaza walk** — first 30 seconds of Cat Island, player
   erased by a banner (`pier_to_main_walk`).
3. **(205,-36) The gym tunnel mouth** — the entrance to the island's best secret reads as a grey
   appliance with a black rectangle in it (`gym_tunnel`).
4. **(-222,18) Gumdrop Cliffs** — a named landmark with no landform and no cliff (`candy_west_dusk`).
5. **(120…150, -80…-62) The grey mass on the north skyline** — untextured blockout, the first thing
   visible from the northern sea (`cat_north_coast`).
6. **(-215…-185, -5…35) The uniform gummy field** — 60 units of the same tree in ten hues.
7. **(100,56) Fish Harbor at night/dawn** — zero lights, zero fish, grey boxes, on the main route.
8. **(176,46) The Whisker Heights cul-de-sac topiary** — a dead zone replaced by a camera wall.
9. **(-46…-38, 26…36) The Candyland shore by the pier** — placeholder boxes and blowing confetti in
   the game's second-ever frame.
10. **(140,-58) Catnip Commons at midday** — a full-size civic park with one cat in it.

---

## RANKED TOP 15 — do these in this order
Each line: **rank · owning system · the fix.**

1. **player/camera** — Sweep a radius-1.2 capsule from lens to the player's *head*; alpha-fade any
   mesh it touches to 0.15 in 0.12 s; **cull outright any mesh whose volume contains the lens**; then
   ship `distance: 31, elevation: 0.64, fov: 30`. Acceptance test: the player is visible in
   `candy_dusk_cupcake`, `pier_to_main_walk`, `gym_tunnel`, `cat_night_residential`, `ferry_cross`.
2. **ui** — Close dialogue panels when their beat ends (the "Rasp: `...`" panel is still open in every
   Candyland frame), cap ambient toasts at one on screen, hide the `1 ISO · 2 FOLLOW · 3 TOP` chips
   unless a mode key was pressed in the last 4 s, night-tint the minimap after dusk, use the landmark
   name instead of the island name inside a landmark core, and anchor prompt chips to their object
   ("Talk to Fishmonger Gus" is 250 px from Gus; "Pick up Candy" sits over a topiary).
3. **candy architecture** — Give the Great Cupcake (-88,-18) a 28-unit clear apron and a silhouette
   that reads from outside: a stepped wafer base, a frosting swirl with a visible spiral edge, a
   cherry on top at 30 units, and one enormous bite taken out of the north side you can walk into.
4. **cat architecture** — Raise the WELCOME TO CAT ISLAND banner at (≈78,18) so its underside clears
   9 units, or hang it from two ropes between slim posts; the first landmark of the island must not
   be a wall across the path.
5. **particles** — Cut the global white speck field by ~70%, tint it per island (warm cream on
   Candyland, green-gold on Cat Island), make it glow only at night, and never draw a speck within
   6 units of the lens. It currently reads as dust on the lens in 100% of frames.
6. **candy vegetation** — Break the gummy monoculture at (-215…-185, -5…35): three size tiers
   (0.6× / 1× / 3× "grandmother" gummies), clustered not scattered, max five hues per cluster, and at
   least two walkable clearings with something in them.
7. **sky** — Build dawn: a 05:30–06:30 warm ramp with a low orange key, long shadows, mist on the
   water and lamps switching off; add a moon disc and stars at night; and keep a visible horizon line
   so the sea stops fading into the sky (`cat_dawn_harbor`, `cat_night_residential`, `ferry_cross`).
8. **terrain** — Build an actual cliff at Gumdrop Cliffs (-222,18): a 12–18 unit drop with two ledges,
   a beach below, and a bounce-down route, so "bouncy all the way down" is a thing you can do.
9. **citizens** — Populate: twenty cats on Main Street at noon, a dozen in Catnip Commons (140,-58)
   using the tables and the bandstand, and **loaf cats in the eight lit windows at Whisker Heights**
   (178,48) — the sign already promises "a loaf in every window".
10. **cat nature** — Texture and break up the pale-grey blockout mass at (120…150, -80…-62) that is
    the island's entire northern skyline, and retire the untextured grey-box family everywhere it
    appears (harbour crates 85…105,55…70; north rocks 128,-72; the beach boxes at -46,33). While
    there: move the parked flying machine out of the "BOATS ARE FOR CATS" sign at (94,60).
11. **ferry** — Give Sugarfin a bow wave, a wake trail and a slight heel while crossing; fade her own
    canopy and cabin when they hide the passenger; and stage one thing to look at mid-strait (a
    stowaway cat in a deck crate, a dolphin flip at t=0.5) so a 21-second crossing has a beat.
12. **terrain** — Re-grade the licorice path: warm dark brown-red instead of near-black, a soft
    sugar-dust shoulder instead of a hard edge, and mip the centre stripe so it stops aliasing into
    red scratch lines at night (`candy_night_meadow`, `village_d28`).
13. **sour patch** — Replace the hard-edged flat light discs under the Kids with a soft radial
    falloff that additively blends where two kids overlap (`candy_night_meadow`, 23:23).
14. **cat architecture** — Make Fish Harbor (100,58) a fish harbour: fish on ice, hanging nets, two
    gulls, a crate of catch you can knock over, a market front for Gus, and two lanterns so it is not
    the darkest place on the route from the pier.
15. **candy vegetation** — Darken the giant lollipop sticks at night so they stop being the brightest
    objects in the frame, and put one bitten lollipop (a player-head-sized bite) with initials carved
    in a nearby stick at (-120,-20).
