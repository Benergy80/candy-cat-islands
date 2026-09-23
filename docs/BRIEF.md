# Candyland & Cat Island — Builder Brief (READ FULLY BEFORE TOUCHING CODE)

A browser 3D exploration game in Three.js (r170, ES modules, no bundler). Isometric third-person
camera. Two islands joined by a ferry. Target feel: **FarmVille charm + Pikmin life** — chunky
readable silhouettes, saturated-but-harmonious colour, dense authored scenes, ambient motion
everywhere, jokes in the details. Magical, funny, strange, alive, AUTHORED. Never a tech demo.

**Candyland Island** — gummy forests, frosting terrain, syrup river, licorice paths, giant sweets,
edible architecture, tiny creatures, secrets. Sour Patch Kids live here: sparkling, cute,
mischievous by day; at night they hunt and eat humans (dark-funny, never graphic).

**Cat Island** — an absurd feline civilisation. Humans are welcomed but never allowed to leave.
Cats live in big houses, run shops (Meow Donald's!), work, lounge, gossip. Some are ludicrously
buff. Adorable first; wrongness leaks in through details; the cats actively (and comically) stop
you leaving.

## Run / render / inspect
- Dev server is ALREADY running at http://127.0.0.1:8787 (if not: `node tools/serve.mjs 8787 &`).
- Render a named view: `node tools/render.mjs --view candy_village` → `renders/candy_village.png`
- Custom: `node tools/render.mjs --pos -140,40 --time 22 --out renders/x.png [--az 0.78 --el 0.62 --dist 46]`
- Free camera (overview): `node tools/render.mjs --free -150,0 --el 0.8 --dist 240 --out renders/o.png`
- Whole tour: `node tools/render.mjs --all --filter candy --outdir renders/tour`
- Look at PNGs with the Read tool. **Write code first, then look; don't re-read many big images.**
- Views live in `tools/views.json`; ADD your own in `tools/views/<system>.json` (same schema, merged automatically).
- The render tool prints console errors — a broken system logs `[system X] failed to create`. Fix those.
- Renders use SwiftShader (software GL) so they are slow (~5 s each) but pixel-accurate. Real GPUs will be faster; still respect budgets.

## Architecture (src/)
- `main.js` composes systems in a fixed order and runs the loop. **Do not edit main.js or core/world.js.**
- Each system file exports `create(ctx)` → `{ update(dt, ctx), ...api }`. Only edit YOUR system file(s);
  you may add helper modules under `src/systems/<yours>/` or next to your file with a matching prefix.
- `ctx` = { THREE, scene, renderer, camera, world, events, input, state, systems, colliders, uiRoot, params, shot }
  - `ctx.state`: `time` (hours 0–24), `daylight` (0..1), `isNight`, `island` ('candy'|'cat'|'sea'), `elapsed`, `paused`, `ferry`
  - `ctx.events.on('night'|'day'|'interact'|'ferry:board'|'ferry:arrive'|'story:<flag>'|'camera:update', fn)`; emit your own with a namespace.
  - `ctx.colliders.push({ x, z, r })` for solid props (player slides around circles). Keep them generous but not annoying.
  - `ctx.input.axis()`, `ctx.input.down('KeyE')`, `ctx.input.pressed` — only player/camera consume movement keys.
- `core/world.js` (the map, read it): `ISLANDS`, `LANDMARKS` (named zones with x,z,r), `PATHS` (polylines w/ width),
  `RIVER`, `LAKE`, `FERRY_ROUTE`, `PLAYER_START`, `height(x,z)`, `normal(x,z)`, `slope(x,z)`, `islandAt(x,z)`,
  `islandMask(x,z,id)`, `onPath(x,z,margin)`, `nearestPath(x,z,island)`, `riverDist(x,z)`, `isFreeGround(x,z,opts)`,
  `pointOnPolyline(pts,t)`. Landmark cores are flattened; buildings go there. Sea level y=0.
- `core/util.js`: `rng(seed)` (seeded; ALWAYS seed placements so renders are deterministic), `mat(color,opts)`,
  `shadows(obj)`, `damp`, `lerp`, `smoothstep`, `hash(str)`, `Events`. `core/palette.js`: CANDY / CAT / SEA colours — use them.
- Shared APIs other systems expose (use them, don't reimplement):
  - `ctx.systems.interaction.register({ id, x, z, r, label, onInteract(ctx, self), getPos?() })` → entry (`.remove()`, `.enabled`)
  - `ctx.systems.ui.say(text, { speaker, duration })`, `.prompt(label|null)`, `.toast(text)`, `.banner(title, sub)`, `.setObjective(text)`
  - `ctx.systems.story.set(flag, v)`, `.get(flag)`, `.once(flag, fn)`
  - `ctx.systems.particles.burst({x,y,z,count,color|[colors],speed,life,size,gravity,spread})`, `.emitter({...,rate,follow?})` → `{stop()}`
  - `ctx.systems.player.position` (Vector3), `.velocity`, `.facing`, `.teleport(x,z)`, `.locked` (set true to freeze input), `.onFerry`
  - `ctx.systems.camera.params` ({azimuth, elevation, distance, fov}), `.basis()`, `.snap()`, `.setFree(v|null)`, `.setMode(n)`, `.looking`, `.recentre()`, `.controlAzimuth` (see docs/CAMERA_SPEC.md)
- Debug API in the browser: `window.game` (`setTime(h)`, `teleport(x,z)`, `step(n)`, `walk({x,y},n)`, `press('KeyE')`, `stats()`, `state()`).

## Art direction rules (everyone)
1. **Silhouette first.** Every object must read at the game camera distance (31 units, FOV 30; follow mode 22 u, FOV 42). Big simple masses, exaggerated proportions, rounded/chunky. No thin sticks that alias.
2. **Colour hierarchy.** Ground = quiet mid-tones; props = saturated; landmarks = the most saturated + biggest; paths clearly darker/lighter than ground. Use `palette.js`. Max ~5 hues per scene cluster; repeat them.
3. **Materials:** `MeshStandardMaterial` via `util.mat()` (roughness .55–.9, metalness 0). `flatShading:true` welcome on organic shapes. Vertex colours welcome. Procedural `CanvasTexture` allowed (small, e.g. 128–512px, `NearestFilter` for pixel-crisp stripes). Emissive for glowing bits. No `MeshBasicMaterial` on lit geometry.
4. **Shadows:** `castShadow`/`receiveShadow` on props (use `util.shadows`). InstancedMesh casts too.
5. **Motion everywhere:** sway, bob, blink, wag, spin, drift. Use `ctx.state.elapsed` + per-instance phase. Cheap: animate instance matrices or a shader uniform; never allocate per frame.
6. **Density without noise:** clusters, not uniform scatter. Vary scale/rotation/hue per instance. Put things along paths and around landmarks; leave breathing room on paths themselves.
7. **Scale:** player ≈1.7 tall. Houses 6–12 tall, big landmarks 20–35 tall. Giant candy = ridiculously big.
8. **Day/night:** read `ctx.state.daylight`. Night = windows glow (emissive), lanterns, eyes, fireflies. Limit real lights: ≤ 8 PointLights per island total (coordinate: architecture gets 6, NPCs 2). Prefer emissive sprites/glow meshes.
9. **Determinism:** seed every random with `rng(hash('your-system'))`.
10. **Performance budgets (whole game ≤ 450 draw calls, ≤ 1.3M triangles at the game camera):** terrain 25 calls/200k tris; sky 10; vegetation per island 40 calls/250k tris (InstancedMesh + merged geometry); architecture per island 60 calls/150k; NPCs per island 40 calls/80k; creatures 20; particles 6; ferry 15. Check with `game.stats()` printed by render.mjs.
11. **Everything is authored.** Name things. Signs with text (CanvasTexture). A joke or story beat per cluster. Secrets that reward wandering.

## Working method for builders
- Build → `node tools/render.mjs` your views (day AND night where relevant) → Read the PNGs → fix the biggest visible weakness → repeat until you'd proudly show it. Then write your report.
- Your final report (≤ 40 lines): what exists (with world coordinates), files touched, view names, exposed API/events, budgets measured (calls/tris), known weaknesses. Report honestly.
- Don't stall: if a shared API is missing, work around it locally and note it in the report.

## WAVE 2 — new features (added 2026-09-12 by Ben; these are requirements, not suggestions)
**Input contract v3 (everyone honours this; supersedes anything else; camera details in docs/CAMERA_SPEC.md):** WASD move · Shift run · Q/E turn camera · wheel zoom · **right/middle-drag = orbit (never uses the item; no context menu)** · **V (hold) = look around: the visitor stands still, WASD pans, mouse orbits, release returns · V (tap) = recentre behind the visitor** ·
**E / Enter = interact / open doors** · **Space = jump; Space again in the air = double jump with a flip** · **C (hold) = duck; C while running = slide;
C while airborne = STOMP (slam down, AOE knockback + dust)** · **R = dodge roll in the movement direction (i-frames, 0.6 s)** ·
**Left-click or X = use held item (attack / spray / fire / place salt / paddle / flap)** · **F = cycle held item** · **1 / 2 / 3 = camera mode**
(1 iso — you turn it, 2 FOLLOW = a tether that stays behind your travel, 3 top) · L (hold) look up · M map · H help. Nobody else binds these keys.
**Collision contract:** the player must never walk through walls, props, trunks, big bushes or rocks. `ctx.colliders` accepts circles `{x,z,r,h?}` AND
oriented boxes `{x,z,w,d,rot,h?,box:true}`; every builder registers accurate colliders for walls (as boxes, leaving a gap at doors), props, trunks, large
bushes/rocks. `ctx.walkables` for decks/floors/stairs. Buildings are ENTERABLE: doors are interactables (E opens/closes with a swing), interiors are real
rooms (floor, walls, furniture, an NPC or a gag) and the building's roof/upper storey hides (or fades) while the player is inside its footprint —
each architecture system exposes `api.interiors` and handles its own roofs.
**Weapons (found in the world):** Salt Shaker (throw), Candy-Cane Bat (melee), Gumball Slingshot (ranged), Lemon Spritzer & SPRAY BOTTLE (spray:
melts Sour Patch Kids into sugar puddles and dissolves SALT patches; makes cats flee), SALT GUN (places salt patches on the ground; consecutive
patches form lines/rings; Sour Patch Kids cannot cross salt, so enclosed areas are safe — `ctx.systems.weapons.saltPatches` = [{x,z,r}]),
and THE CARAMELIZER — a very destructive heat gun hidden in the world that burns up anything it shoots (props/plants scorch, shrink and vanish
with fire + ash; NPCs are hit with weapon 'fire'; limited fuel, refilled rarely). Destruction contract: `ctx.systems.weapons.burn(point, radius)`
calls every system's optional `api.onBurn(point, radius)` (systems remove/scorch their own instances) and falls back to shrinking small meshes.
**New landmarks in world.js:** candy_palace (-150,-36 r24, flattened), cave_entrance (188,-64 under the yarn ball), catapult (120,78 'The Big Fling'),
canoe_cove (236,44 'Smuggler's Cove'), flyer_pad (210,12 'Wing Nut Field'), helper_cat (92,44 'Under the Quay'); paths candy_palace + cat_catapult.
**Shared APIs (new systems):**
- `ctx.systems.inventory`: `add(itemId, n)`, `count(itemId)`, `has(itemId)`, `items` (ordered list of {id, name, kind:'weapon'|'tool'|'candy', count}), `held` (current weapon/tool id or null),
  `cycle()`, `registerPickup({ id, x, z, itemId, n, label, mesh?, respawn? })` → pickups are interactables; emits `inventory:pickup {itemId,n}`, `inventory:held {itemId}`.
  Candy is a currency: `inventory.count('candy')`; `spend('candy', n)`.
- `ctx.systems.weapons`: on Space/click uses `inventory.held`: melee arc (bat/hammer), throw (salt shaker/slingshot), spray (spray bottle/lemon spritzer),
  and calls enemy hooks: `ctx.systems.sourPatch.hit(kidRef, { weapon, power, from:{x,z} })` and `ctx.systems.catCitizens.hit(catRef, { weapon, power, from })`;
  enemy systems implement those (flee / dissolve / stun / hiss) and must not throw if a weapon they don't know is used. Weapons emits `weapon:use {weapon, hits}`.
- `ctx.systems.escape`: the ways back from Cat Island (cave, catapult, canoe, flying machine) — each emits `escape:start {route}` and `escape:success {route}`
  on arrival at Candyland (story flag `escaped_<route>`); vehicles set `player.onVehicle = true` and drive `player.position`; camera keeps following.
- Night on Cat Island: cats become TIGERS (citizens system) — big striped, glowing eyes, prowl; catching the player = comic scruff-carry to the guest bed
  (not death). Weapons make tigers flinch/flee. `catCitizens.isTigerTime()`.
- Helper cat 'Rusty' under the quay: candy economy via story flags: `helper_1` (1 candy → reveals Smuggler's Cove canoe), `helper_3` (3 → repairs the catapult),
  `helper_5` (5 → gives the cave key). He also sells the spray bottle's location for free ('the cats hate that thing').

## WAVE 3 — camera, online play, mobile, and Ben's feature list (added 2026-09-22; these are requirements)
Ben, verbatim: "we need the camera mode to be much more effective at showing the player as it navigates. Due to the density of the
world, it is hard to keep track of the player and see. How can we improve all of the camera perspectives so we can see around better?
Can we add a look around feature? can the camera dynamically follow us?" and "make a repo so we can try playing online. Also make
sure there is a mobile friendly version as well and make sure the key to the cave is easy to find and the wench for the catapult and
more weapons and ammo and invincibility stars that you can catch and some planes flying around and make the flying machine work
better and fly higher and for longer and make the map better with a history feature that shows where you have explored when
triggered. Make sure the characters and npc's do not clip through the objects in the game but instead walk on top of them."

### Hosting (orchestrator-owned)
The game is served statically (GitHub Pages, repo Benergy80/candy-cat-islands, path /candy-cat-islands/). Three.js is VENDORED at
vendor/three/ (import map in index.html); never import from node_modules or a CDN; every URL in the game must be relative. `renders/`
is a symlink to `renders.noindex/` and both are git-ignored, as are critique images.

### Ownership (one builder per line — NEVER edit a file you do not own; call other systems only through the contracts below)
- **camera**: src/systems/camera.js, src/systems/camera/*.js (new), src/core/input.js, src/systems/ui/hotbar.js (mode chip), tools/camvis.mjs, tools/views/camera.json. Spec: docs/CAMERA_SPEC.md. Does NOT edit ui.js.
- **map history**: src/systems/ui/minimap.js, src/systems/ui.js, src/systems/ui/style.js, src/systems/ui/glyphs.js.
- **touch / mobile**: src/systems/touch.js (new), index.html. No edits to input.js / ui.js / style.js / camera.js / main.js — it writes into
  ctx.input at runtime and injects its own <style> element.
- **escape items** (cave key + catapult winch): src/systems/escape/cave.js, escape/catapult.js, escape/parts.js.
- **flyer**: src/systems/escape/flyer.js (+ escape/ride.js if needed).
- **weapons + ammo**: src/systems/weapons.js, src/systems/inventory.js, src/systems/inventory/*.js.
- **powerups** (invincibility stars): src/systems/powerups.js (new).
- **planes**: src/systems/planes.js (new).
- **ground / collision core**: src/systems/player.js, src/systems/player/*.js.
- **NPC adopters** (start after the ground core has landed): cat/citizens.js (+ cat/citizens/*), candy/sourpatch.js (+ candy/sourpatch/*),
  candy/creatures.js (+ candy/creatures/*), ferry.js passengers if any walk.
- **orchestrator only**: src/main.js, src/core/world.js, docs/BRIEF.md, git.
Registered in main.js (update order): `touch` before `player` (it feeds input), `planes` after `sky`, `powerups` after `weapons`.
Views: add yours to tools/views/<system>.json (camera.json, maphistory.json, touch.json, escape_items.json, flyer.json, weapons3.json,
powerups.json, planes.json, ground.json, npc_ground.json) — never edit another system's views file.

### Contract A — ground & collision (player owns, everyone consumes)
- `ctx.systems.player.groundInfo(x, z)` → `{ h, deck, water, limit, floor, prop }`. `h` is where FEET rest: terrain, or a walkable deck,
  or the TOP of a LOW PROP. A low prop is any entry of ctx.colliders with numeric `h` ≤ 1.6 (crates, rocks, benches, kerbs, steps,
  planters, low walls): standing inside its footprint puts the feet at ground + h, ramped over the outer 0.3 u so it never pops.
  Colliders with h > 1.6, or without h, stay SOLID. `prop` is the collider you are standing on (or null).
- `ctx.systems.player.pushOut(x, z, r = 0.45)` → `{ x, z, hit }` resolves a circle against the SOLID colliders (circles AND oriented
  boxes) through a spatial hash the player rebuilds whenever ctx.colliders.length changes. Budget ≤ 0.02 ms per call (150 NPCs/frame).
- `ctx.systems.player.speedBoost` — number, default 1, read every frame (powerups sets 1.25 while a star is active).
- The VISITOR steps onto low props automatically while walking (no jump needed) and never intersects anything solid.
- EVERY walking NPC (cats, tigers, Sour Patch Kids, sheep, snails, beetles, ants, shopkeepers, ferry passengers) sets its y from
  groundInfo(x, z).h every frame and runs pushOut on its xz after moving; planners treat `hit` as "turn around". No NPC may intersect a
  prop, bench, wall, trunk or rock; on a low prop they WALK ON IT. Instanced/merged NPC meshes must still get per-instance y.
- The ground core builder audits ctx.colliders: how many carry `h`, and reports the props that need an `h` to become standable.

### Contract B — powerups (invincibility stars)
`ctx.systems.powerups`: `active` (bool) · `timeLeft` (s) · `stars` [{x,z,y,id,taken}] · events `powerup:star {on:true|false}`.
≥ 8 stars per island, ≥ 3 of them airborne (double-jump height, rooftops, or over the water for the flyer/canoe). Gold five-point star,
1.1 u, spinning + bobbing, sparkle trail, glow after dark, collect radius 1.6, respawn 120 s, toast "INVINCIBLE!", 10 s effect: the
player is invulnerable (set `player.invulnerable = true` every frame), speedBoost 1.25, rainbow-cycling flash on the visitor's
materials (restore EXACTLY on end — clone materials, never mutate shared ones), a HUD timer pill in ctx.uiRoot (own DOM, bottom
centre above the hotbar), a sting through ctx.systems.audio?.play?.('star') if it exists. Enemies (sourpatch/citizens builders) check
`ctx.systems.powerups?.active` and FLEE; touching the invincible visitor bounces them (knockback 6 u) with a puff.

### Contract C — weapons & ammo (canonical ids; both sides build to these names)
New weapons (≥ 5 of them, each with its own mesh, held pose, particle and hit name): `jawbreaker_cannon` (hit weapon 'cannon', ammo
'jawbreakers'), `licorice_whip` ('whip', no ammo), `poprocks` ('poprocks', thrown AOE fizz, ammo 'poprocks'), `bubblegum_blower`
('gum', sticks a kid in place 4 s, ammo 'gum'), `marshmallow_launcher` ('marshmallow', soft ranged bonk + knockback, ammo
'marshmallows'), `peppermint_boomerang` ('boomerang', returns, multi-hit, no ammo), `water_balloon` ('water', cats/tigers hate it and
flee 8 s, kids shrink, ammo 'balloons'). Ammo pickups: ≥ 30 per island in themed clusters near where each weapon is useful, respawn
60–90 s; caps roughly 2× today's; candy refills scaled; the hotbar shows counts; F cycles in a sensible order. Enemy reactions
(sourpatch + citizens adopters): cannon = big knockback + dizzy · whip = stagger · poprocks = fizz panic scatter · gum = stuck 4 s ·
marshmallow = bonk + bounce · boomerang = spin · water = flee / shrink. Unknown weapon names must never throw.

### Contract D — escape items (cave key, catapult winch)
Both become PHYSICAL, VISIBLE, MARKED objects with a trail to them, picked up with E; Rusty's candy routes remain as alternatives.
- Cave key: a golden cat-shaped key (≈1.2 u) on a red cushion on a stone plinth, glowing, with a sparkle column visible from 40 u,
  placed where you naturally pass on Cat Island and can see it from a path; "LOST KEY?" posters and a signpost arrow point to it;
  Rusty's dialogue names the place; a map marker via `ctx.systems.ui?.addMapMarker?.({ id:'cave_key', x, z, glyph:'key', label:'Cave key' })`.
  Picking it up sets story flag `helper_5` (the hatch already keys off it) and shows a toast naming the hatch under the yarn ball.
- Winch: a brass winch drum with a crank (≈1.4 u) sitting on the quay near Rusty's "Under the Quay" (92,44) or at Smuggler's Cove,
  sign "WINCH — property of The Big Fling", glowing; E picks it up (inventory tool `winch`), carry it to the catapult (128,74), E installs
  it → story flag `helper_3`; map marker `{ id:'winch', glyph:'winch' }`; a signpost at the catapult says where it is.

### Contract E — flyer (escape/flyer.js)
Ceiling 170 → 330 (soft); the altitude-bite curve softened; ENERGY: flapping spends it, gliding and thermals restore it; visible thermal
columns (warm shimmer particles) over six landmarks (Great Cupcake, Candy Palace, the Yarn Ball, the lighthouse, Meow-Donalds, Catnip
Commons) give lift; Shift = boost dash (1.5 s, 12 s cooldown); W/S pitch response ×1.5 with auto-level; banked turns; land ANYWHERE on
either island (gentle contact = landed; walk away; E remounts); the flyer respawns at Wing Nut Field after 60 s abandoned; HUD
altitude + energy bar (own DOM). Camera contract: while airborne set `ctx.state.flying = { alt, speed }` (null on the ground); the
camera honours it with a longer, lower framing (distance 44, elevation 0.38, FOV 40, follow azimuth). The OPEN bug "ground + sea
vanish from far cameras / the flyer at altitude" must be reproduced (render --pos over the sea with the flyer at 150 u) and fixed if it
is frustum/cull/far-plane related in your scope (camera far plane is 900 in main.js — ask the orchestrator to raise it if that is the
cause); otherwise document the exact cause.

### Contract F — planes (planes.js)
Four aircraft, ≤ 8 draw calls total, no cast shadows (a soft blob at most), propellers spin, banners ripple, nav lights blink at night,
authored loop paths with ≥ 30 u clearance above world.height + landmarks: a candy-striped biplane towing a banner (day "WELCOME TO
CANDYLAND", night "BE HOME BEFORE DARK") circling Candyland at 45–70 u; a MEOW AIR jet crossing at 110 u every ~90 s with a contrail;
a blimb ("SUGAR" one side, "CATNIP" the other, letters glow at night) drifting between the islands at 60 u; a squadron of three paper
planes looping over the Cat plaza at 20–30 u. Scale for the game camera (biplane span ≈ 6 u). Optional: the biplane drops one candy
pickup every 40 s (inventory.registerPickup, no respawn).

### Contract G — map history (ui/minimap.js + ui.js)
M cycles near → world → world + HISTORY → off (`ui.cycleMap()` keeps its signature). HISTORY = explored coverage: a 2-D grid (cell 3 u)
over both islands, marked within 12 u of the player (30 u while `ctx.state.flying`) once a second; on the world map: unexplored =
desaturated + light fog hatch, explored = full colour; a dotted trail of the last 800 samples fading with age; the ferry route; visited
landmarks lit; footer "Explored: Candyland 37% · Cat Island 12%"; persisted in localStorage key `cci.explored.v1` (survives reload),
`ui.resetHistory()` clears it. New API for other builders: `ui.addMapMarker({ id, x, z, glyph, label })` / `ui.removeMapMarker(id)` with
glyphs key, winch, star, ammo, weapon, plane (draw a generic dot for unknown glyphs). Both map modes must be tappable on touch.

### Contract H — touch / mobile (touch.js + index.html)
Detect `(pointer: coarse)` or touch. Left half: a virtual joystick → `ctx.input.virtual = {x, y}` (|v| ≤ 1; > 0.85 also holds
'ShiftLeft' in ctx.input.keys). Right half: drag → `ctx.input.pointer.dragDX/dragDY` (the camera orbits), pinch → `ctx.input.wheel`.
Buttons (≥ 56 px, semi-transparent, safe-area aware): A = Space, B = KeyX, E = KeyE, C = KeyC, R = KeyR, F = KeyF, CAM = cycles
Digit1/2/3, MAP = KeyM, ? = KeyH. Press = add to `ctx.input.pressed` once AND `ctx.input.keys` while held, delete on release — exactly
what keydown/keyup do, so no other system changes. Tap starts the title screen. Portrait shows a "rotate your phone" overlay.
Quality: on phones set `ctx.state.quality = 'mobile'`, renderer pixel ratio ≤ 1.5, shadow map ≤ 1024 (find the DirectionalLight by
traversing ctx.scene; dispose its old shadow map), hide keyboard hints. Inject your own <style> for small screens (scale the UI to fit).

### Verification standard (every builder)
`node --check` every file you touched · render ≥ 2 views (day AND night where relevant) with tools/render.mjs and READ the PNGs ·
zero CONSOLE ERRORS · draw calls ≤ your wave-1 budget + 6 · report ≤ 40 lines: what exists (coordinates), files, views, API, budgets,
known weaknesses. Never resume a giant context: write first, look once, fix the biggest visible weakness, repeat.

### Contract I — iPhone / mobile quality tier (added 2026-09-22)
main.js decides the tier BEFORE any system is created: `ctx.state.quality` = 'mobile' on phones (coarse pointer and a short side under
900 css px, or `?q=mobile`), else 'high' (`?q=high` forces desktop). `ctx.state.mobile` (bool) and `ctx.state.touch` (bool) are set too.
Renderer on mobile: no MSAA, pixel ratio ≤ 1.5, PCFShadowMap. Every heavy system reads `ctx.state.mobile` at create() and trims:
instanced vegetation/nature counts (≈ 45% of desktop), particle caps (≈ 40%), shadow casters (only the visitor, NPCs and buildings
cast; vegetation/props do not), shadow map ≤ 1024, sky (no volumetric mist / fewer clouds), terrain detail, architecture glow/emissive
extras, ferry/water (cheaper water shader path), draw-call goal ≤ 220 and ≤ 550k triangles at the game camera on mobile, no visible
popping. The tier must look like the same game — the art director's rules still apply — just lighter. Test with Playwright WebKit
(`playwright.webkit`, devices['iPhone 13'] / ['iPhone 15 Pro'], hasTouch) as the closest proxy to iOS Safari; report draw calls,
triangles, geometries, textures and frameMs per view. Safari rules: never rely on `performance.memory`; textures ≤ 2048; no
`OES_texture_float` linear filtering assumptions; unlock WebAudio on the first touch; `viewport-fit=cover` + safe-area insets;
home-screen PWA: manifest.webmanifest + apple-touch-icon (180 px) + theme-color; `-webkit-touch-callout: none`; no 100vh (use dvh /
window.innerHeight). Ownership for the tier pass: **world-tier** = candy/vegetation*, cat/nature*, candy/architecture*, cat/architecture*,
terrain*; **fx-tier** = sky*, particles.js, ferry.js; **pwa** = manifest.webmanifest, icons/ (new). index.html and touch.js stay with the touch owner.

### Contract J — frame-rate pass (added 2026-09-22, Ben: "optimize for frame rates at the end — it has gotten a bit choppy")
Runs LAST, after every WAVE 3 builder has landed. Measured in Ben's real Chrome (hardware GL) via claude-in-chrome (window.game.stats().fps / frameMs over ≥ 600 frames at candy_village, cat_main_street, cat_plaza, candy_night, sea_crossing), never in the SwiftShader harness. Targets on the M1 Pro at 2× DPR: ≥ 55 fps median, no frame > 40 ms outside loading; draw calls ≤ 450, triangles ≤ 1.3M (desktop). Method: per-system update() CPU timing (wrap each system's update in main.js's loop with performance.now() when ?prof=1), renderer.info per system (toggle groups), shadow-map cost, per-frame allocations (heap growth over 600 frames), texture uploads, instanced-attribute uploads (needsUpdate every frame), raycasts per frame (camera sweep, interaction), DOM/UI churn (querySelector/innerHTML per frame). Optimise the top hotspots only; every change guarded by measurement before/after; no visual regression (critic frames).

### Contract H2 — mobile controls that stay out of the way (added 2026-09-22; Ben: "mobile needs onscreen control buttons that are not in the way")
The first touch pass (renders/w3_touch/iphone13_landscape_cat_fix.png) covered ≈ 35% of the phone screen: six 90-px pastel discs bottom-right, four
round buttons top-right, a hotbar bottom-centre and the dialogue box mid-screen. Replace it with a layout that reads as part of the HUD:
- **Coverage budget:** all control DOM (joystick, buttons, chips) ≤ 16% of the landscape viewport area, measured from getBoundingClientRect();
  nothing but transient prompts inside the central 60% × 60% of the screen; the visitor and the ground ahead of him are never under a control.
- **Corners only.** Left thumb: the joystick (outer ring ≤ 120 px, appears where the thumb lands — floating stick — and fades when released).
  Right thumb: a compact ARC of three buttons — A jump (56 px) as the anchor, E/interact (48 px) and B/use (48 px) beside it. C duck, R roll and
  F cycle become 36-px ghost chips stacked along the right edge above the arc. Top-right: LOOK / camera-mode / map / help as 32-px icon chips in
  ONE row under the clock, not four 90-px discs.
- **Style:** thin 1.5-px cream outline, 30% fill at rest, full fill + slight scale on press, icon or a single letter, label only on the A/E/B
  arc; after 3 s without a touch the controls fade to 22% opacity, any touch restores them. No drop shadows or glows at rest.
- **Contextual:** the E chip only lights (and grows to 48 px) when interaction.nearest() is non-null; B shows the held item's glyph; the hotbar
  collapses on phones to one held-item chip (tap = F cycle, long-press opens the tray).
- **Dialogue and panels on phones (via touch.js's injected CSS, no ui.js edits):** the dialogue box docks bottom-centre above the arc, ≤ 40%
  width; the objective panel collapses to a single line chip top-left that expands on tap; toasts stack top-centre; banners stay top-centre.
- **Verification:** a Playwright iPhone 13 landscape + portrait screenshot set (game, dialogue open, map open, help open) READ by a critic, plus
  the coverage metric printed by the verifier (must be ≤ 16% landscape, ≤ 22% portrait) and a check that no control overlaps the minimap,
  the clock, the objective chip or the dialogue box.
Also fold in the camera spec's §8.4 requests: a LOOK button that holds `KeyV` while pressed, and `pointer.orbit = true` (not `pointer.down`)
for the right-thumb look drag once input.js ships `orbit`.

### Contract K — opening cinematic + title hand-off (added 2026-09-23; Ben: "When the game starts there should be a cinematic camera that
flies over Candyland introducing the audience to the world and lands on the player arriving at the pier, the camera flies around the player
and then lands at the camera position 2")
- New system `intro` (src/systems/intro.js, registered after `ui`). API: `takeover(handoff) → Promise` · `active` (bool) · `skip()` ·
  `play(tSeconds)` (debug: pose the flight at a time, for renders) · event `intro:cinematic:done`. Never runs under `ctx.shot` unless `?cinematic=1`.
- Title hand-off (ui.js / ui/title.js owner): when the title card is dismissed and `ctx.systems.intro?.takeover` exists, DO NOT restore the
  camera/time yourself — call `intro.takeover({ view: <the title's current free view>, saved: { time, frozen, fog } })` and let the intro
  restore everything when it ends or is skipped. Without an intro system, behave exactly as today.
- The flight (22–30 s, deterministic, Catmull-Rom over authored keyframes, driven by `camera.setFree({...})` each frame): starts from the
  title's hero view for continuity → sweeps over the Candy Palace (-150,-36) → the Great Cupcake (-92,-24) → the Gummy Forest → Gumdrop
  Village (-140,40) → descends to Sugar Pier (-50,26) where the visitor stands in his arrival pose (ferry docked) → one full orbit around him
  (≈5 s, distance 9→6, elevation 0.3, he looks at the camera at the end) → blends into camera MODE 2 (`setMode(2)`, `setFree(null)`, then a
  1.2 s `cinematic()` from the orbit's last pose to the follow framing if the API is there) → unlocks the player, HUD back, emits the event.
  Time of day eases from the title's dusk to the 9:30 morning as the camera lands (the day starts; `timeFrozen` restored to false).
- During the flight: `player.locked = true`, HUD hidden via `ui.showHud(false)` (ui owner adds it: hides every panel except a small
  "▸ skip" hint bottom-right), Sour Patch Kids/cats keep living. Any key / click / tap = skip: ease to the end state over 0.6 s.
- Verification: a real-flow Playwright run (no ?shot; ?intro=1): dismiss the title with a keydown, sample the camera every 0.5 s — it must
  pass within 60 u of palace, cupcake, village and pier in that order; end state = mode 2, `isFree()` false, player unlocked, HUD visible,
  time unfrozen; skip mid-flight lands in the same end state; six screenshots (tools/views/intro.json keyframes via `play(t)`); no errors.
