# HANDOFF — how this project is run (for any orchestrator picking it up)

Goal text: see the /goal in the session that started 2026-09-12 (summarised in docs/BRIEF.md header).

## Loop per system
1. Builder (Opus, fresh context) reads docs/BRIEF.md, owns exactly one system file, renders its views, iterates, reports.
2. Orchestrator renders the system's views (`node tools/render.mjs --view ...`), builds a critique set
   (`python3 tools/critique_set.py <system> <round> renders/a.png renders/b.png --refs farmville_wiki.png,pikmin3_wiki.jpg`).
3. Fresh Opus critic reads critiques/PROTOCOL.md + the set folder (never the builder summary); returns blind pick, scores, ONE biggest gap.
4. If critic does not strongly prefer ours → send the gap back to the builder (SendMessage to the same agent keeps its context) → re-render → new critic (fresh) → repeat. No fixed round count.
5. Update progress/status.json (status, round, verdict, gap, improvement, render) → `python3 tools/progress.py` → republish progress/index.html to the artifact (URL in memory file candy-cat-islands.md).
6. Between waves: fresh holistic art-director agent tours the whole world (all views + free overviews + a scripted walk) and lists inconsistencies/dead zones/scale problems/missing delight; orchestrator turns those into builder tasks.

## Gotchas
- Never use TaskOutput on an agent (dumps the JSONL transcript into context). Wait for completion notifications.
- Keep `caffeinate -dims` running. The dev server must be up (`node tools/serve.mjs 8787 &`).
- Renders are software-GL (~5 s each). `--all` renders the whole tour (~25 views ≈ 3 min).
- One system file with a syntax error only disables that system (dynamic import guard) — check the CONSOLE ERRORS line render.mjs prints.

## ROUND 2 PLAN (written 2026-09-12 after wave 1; execute after the planned restart)
State: all 16 systems built; every system through critic round 1 (verdicts: vegetation THEIRS 4, sky TOSS-UP 3, UI TOSS-UP 3,
particles THEIRS 4, player TOSS-UP 3, citizens THEIRS 4, nature THEIRS 4, sourpatch THEIRS 4) with fixes landed by finishers.
Not yet critiqued at all: terrain, candy architecture, creatures, cat architecture, containment, ferry, interaction/story.
Ferry + citizens fix rounds ended by API stalls with partial work (both load clean): ferry night lanterns/verification, citizens items 2–7.

Steps:
1. Art director pass #1 (fresh Opus, read-only): explore the whole world via renders + scripted walks, write critiques/art-director-1.md
   (inconsistencies, dead zones, weak transitions, repeated ideas, scale problems, visual noise, missing interactions, delight opportunities),
   ranked, with coordinates and view names.
2. Render the core tour (tools/views.json) fresh; build critique sets; run round-2 critics in parallel for ALL 16 systems
   (fresh Opus each, PROTOCOL.md, refs). Include the never-critiqued systems.
3. Merge each critic's biggest gap + art-director items + critiques/CROSS_FLAGS.md into ONE brief per system; spawn fresh short-context
   fixers (never resume a giant agent). Keep ≤ 8 concurrent agents to limit API stalls; each fixer: write → one render per view → report.
4. Repeat critic → fix until critics say OURS with confidence ≥ 4 or 'no meaningful weakness'.
5. Then: audio system (procedural WebAudio ambience + music per island + SFX hooks on events), a GPU performance pass (real Chrome
   FPS via claude-in-chrome javascript_tool: window.game.stats()), a second art-director pass, and a final playthrough script.
Notes: default camera distance is 21 (player finisher) — art director should judge whether 26–30 reads better for FarmVille generosity.

## PAUSE POINT — 2026-09-13 (weekly Opus limit hit; resumes after Sep 16 06:00 CT)
Build state: all 16+ systems load clean (spot-checked candy_village, cat_main_street, candy_night, cat_night, sea_crossing — no console errors).
Committed as "PAUSE: working build" on main. Dev server: `node tools/serve.mjs 8787 &` → http://127.0.0.1:8787.
Round 3 critics: UI = OURS 4 (done); all other systems TOSS-UP 3. Round-3 fixers LANDED: sky 4, UI 4, containment 3, vegetation 3,
terrain 3, cat nature 3, player/camera 4, sour patch 3, candy architecture 4, cat architecture 4, ferry 3.
Round-3 fixers KILLED MID-WAY by the limit (their partial edits are in the last commit and load clean, but the tasks are NOT done — redo them):
- citizens 3 (populate the square/streets, gym poses, loaf cats, tiger shadows, head variants, catnip flop cats)
- escape 3 (cave underwater feel: godrays/caustics/bubbles/fish; throne room magenta quad + framing; canoe/flyer/catapult reads; placeOverride)
- particles 3 (soft glints, day palette, village smoke/steam visible, halos scale with distance)
- creatures 3 (butterflies airborne, beetle variety, sheep silhouette, glider V overhead, fireflies soft, fish in river)
- pickups presentation (weapon pickups lifted/glowing/recoloured, own marker vocabulary, placement clearance)
- TERRAIN HOTFIX (FIXED 2026-09-13): the whole terrain system failed to import — a GLSL comment in src/systems/terrain/common.js
  wrote `noRoad` in backticks inside a JS template literal, which terminated the string ("Unexpected identifier 'noRoad'").
  main.js swallowed it as '[system terrain] failed to load', so ground + sea simply never existed; the 'shader NaN' theory was wrong.
  Lesson: never put backticks in GLSL comments; run `node --check` over src/**/*.js before any commit (all pass now).
Next when resuming: (1) terrain hotfix; (2) redo the five killed fixers as fresh short-context agents; (3) render the core tour;
(4) round-4 critics; (5) AD #2 leftovers: camera default 34/0.44 + landmark override, tiger eyes visible from above + staged hunt,
roofs standable (walkables audit), cupcake interior cull/furnish, white paper props on Cat Island; (6) audio system; (7) GPU perf pass.
