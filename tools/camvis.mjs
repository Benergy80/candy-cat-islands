// camvis — the camera acceptance instrument (docs/CAMERA_SPEC.md §1, §7, §8 step 0).
//
//   node tools/camvis.mjs --tag baseline                       # probe set P × modes 1/2/3 + every script
//   node tools/camvis.mjs --tag x --filter cat_ --script none  # a quick subset, no scripts
//   node tools/camvis.mjs --tag before --mode 1,2 --script none --s9 --shots renders/cam_before
//   node tools/camvis.mjs --tag perf --script perf [--gl hw] [--perf-frames 600]   # A13 (live loop, ?camvis=perf)
//   node tools/camvis.mjs --diff baseline,run2 [--allow-meta]  # offline: compare two runs minus the timing block (A12);
//                       exit 0 identical · 1 comparable rows differ · 2 not comparable (see "Isolation" below);
//                       with --allow-meta, 0/1 judge only the rows whose page history matches (the rest are listed)
//
// Options
//   --tag <name>        output renders.noindex/camvis/<tag>.json + <tag>.md (default "run")
//   --mode 1,2,3        modes for the probe rows (default all three)
//   --filter <substr>   only probe / §9 views whose name contains it
//   --script <list>     a4,a5,a6,a7,a8,a9,a10,s7,seed | all | none (default all; perf only when named)
//                       (a10 also runs d7, LAST on the page: camera step 7's own proof — the mode-2 whiskers switch,
//                       rate, survive a walk, cancel on tap V / drag / Q, 0 in mode 1 and pinned; the pin rule; density's
//                       forced-0 list; the terrain whisker on Frosting Peak's flank. "--script d7" runs it alone)
//                       (sway, only when named: vegetation still sways under the window's shader patch)
//                       (a6 also runs a6x, LAST on the page: why A6 reads what it reads — the same runs with the
//                       lead zeroed and/or the old ladder's lens moves held off, the flat-plane edge, the ground
//                       profile, and `predict`: what the gate would read once CAMERA_SPEC §8 step 5 lands. Not a gate.)
//                       (s7 also runs s7cave: the §7 cave-corridor-in-mode-2 regression, on a freshly
//                       reloaded page; "--script s7cave" runs it alone)
//                       (s7 (h) is the mode-2 horizon: the geometric sky band per frame and the RENDERED
//                       open sky in it at the last frame, skyBand(); "--script horizon" runs (h) alone)
//                       (seed = tools/_tmp/camprobe.mjs's own probe protocol, the §1 cross-check)
//                       (a7 also runs a7x, LAST on the page (after a6x): the look's edges — the lens riding the look
//                       zoom (zoom 0.7 return, zoom 1.6 at once, V + wheel), a look begun on a dollied lens (a
//                       synthetic noCut wall, and occ_silhouette in mode 2: out AND home again, back on the dolly),
//                       playerScreen across the lens plane, and the vehicle / flying look; "--script a7x" runs it alone)
//   --s9                also run every view in tools/views/camera.json (§9) as rows (view-major, own
//                       camera.setMode replaced by the row's mode; a view that asks for mode 3 also gets m3)
//   --shots <dir>       render each row at --w × --h (default 1600 × 1000) to <dir>/<view>_m<mode>.png
//   --p-src merged|viewsjson   how P names resolve: "merged" (default) = exactly what render.mjs --view uses
//                       (tools/views.json, then tools/views/*.json in readdir order, later files win);
//                       "viewsjson" = tools/views.json's own entry when it has one
//   --wait <min>        how long to queue for a render slot (default 15, as render.mjs)
//   --no-frame          skip the SwiftShader frameMs sample (A13's render-side number)
//   --seen              per row, also measure `seen`: the share of the visitor's body pixels the rendered
//                       frame draws with his real body (two extra renders per row; see seenBody()). The
//                       honest pixel answer next to vis/raw: it sees noFade roofs, shader-displaced heads,
//                       the window's dither and ghosts, which the raycast readings cannot. Where the window is
//                       open (cutK ≥ 0.05) a third render with its ellipse shut gives `seenShut` (what the window
//                       itself opens on him); --no-seen-shut skips it (rows then compare with pre-fx4 --seen runs)
//   --pin <commit>      serve the camera-owned sources (src/core/input.js, src/systems/camera.js,
//                       src/systems/ui/hotbar.js, src/systems/camera/*.js) from <commit> instead of the
//                       working tree, via request interception; everything else stays live. The pre-edit
//                       baseline is recorded with --pin b7ad15a (the commit before any camera edit).
//   --allow-meta        with --diff: compare two runs made with different arguments anyway (e.g. the pinned
//                       baseline against a live run), row by row wherever the page history still matches
//   --what-if noghost   measure an edit ANOTHER owner has been asked for, before it lands, without touching their
//                       file: the page is served src/systems/candy/architecture.js with its two enterable-shell flags
//                       (the wall and roof meshes of finish(), lines 389 / 394) reading userData.noGhost instead of
//                       noFade — exactly the requested edit, in flight (request interception, like --pin), so the
//                       cut decides those shells at world:ready as it would after the edit. Refuses to run unless
//                       the file holds exactly those two `mesh.userData.noFade = true` writes. Not the shipped
//                       world: meta.whatIf records it, --diff refuses to compare it with a plain run (unless
//                       --allow-meta), and out.whatIf lists the noGhost meshes the page ended up with.
//
// Acceptance (summary.accept, "## Acceptance" in the .md), whenever the run holds the full P in mode 1:
//   A1 and A2 as written in CAMERA_SPEC §1, next to the readings proposed for the orchestrator to ratify
//   (camera step 4 fix): A1§5.3 counts a shut ray whose blocker the spec itself leaves in the picture
//   because of where it STANDS — within 1 u in front of him ('nearBody') or terrain — as seen (a noCut /
//   noFade / unpatched blocker is NOT excused: occ_silhouette must still open); A2base reads the mode-1 raw
//   floor from renders.noindex/camvis/baseline.json (this instrument's own pre-edit run) instead of the seed
//   probe's 0.908. Both lines say "as written" / "proposed"; neither replaces the other.
// A11 (summary.A11, "## A11" in the .md; camera step 7), whenever mode-1 rows ran: static neutrality against
//   renders.noindex/camvis/post5.json and the baseline rows the old ladder never touched (a11Summary()).
// A3 (summary.A3, "## A3" in the .md; camera step 5), over every probe row that ran, in any mode or filter: the
//   ladder's occDist on EVERY frame of the row and at its end (row.a3, watched on camera:update) never under 14 u
//   outdoors / 5.5 u inside a building (or the undollied distance − 0.5 when that is shorter), and the cull only
//   ever holding meshes ≤ 18 u (camera.culledSizes). Scripts carry the same reading as `a3`, informational.
//
// Per probe, in this order (§1): setTime → camera.setMode(m) → setParams({azimuth π/4, elevation 0.64,
// distance 31, fov 30}) → player.facing = wrap((view.az ?? π/4) + π) → teleport → setCameraParams(view
// az/el/dist/fov) only if the view carries any → setView(null) (or the free view) → call → walk →
// step(frames) → scene.updateMatrixWorld(true) → bodyVisibility + the row fields. Simulation frames run
// with ctx.renderOverride = () => {} (main.js), so nothing renders unless --shots asks for a PNG.
//
// Rows hold only deterministic numbers; every wall-clock value (camMs, occMs, frameMs, machine, user
// agent, durations) lives in the separate `timing` block so two runs diff clean (A12). Getters that do
// not exist yet (tilt, cutK, occYaw, densityK, terrainLift, pinned, goalDistance, controlAzimuth, looking)
// read null; scripts whose feature does not exist yet report status "not implemented yet".
// Hooks later steps must keep (or this tool reports "not implemented yet"): camera.look(o),
// camera.recentre(), camera.cutout.isPatched(o) (or camera.isPatched(o)), ctx.input.pointer.orbit,
// ctx.input.moveLock, bodyVisibility().rawVisible / featherVisible / rays[].rawClear.
//
// Isolation (protocol 2). The world keeps simulating between rows (cats and tigers roam, timers run, the
// camera ladder keeps its latches), which has two consequences:
//   · Contamination. Right after its frames, before any screenshot, every row is checked for sticky world
//     state its own view did not set up: a tiger carrying the visitor off to bed (21:00+ on Cat Island),
//     player.locked / onFerry / onVehicle, a flight, a ferry crossing, a vehicle, a cinematic, a pause or
//     an open card, seen at any frame of the row (watched on camera:update) or still there at its end.
//     State the view's own `call` created (cam_flying's flight) is "authored" and excused. A contaminated
//     row is run once more on a freshly reloaded page, and the row keeps the retry's numbers and frame,
//     plus retried: true, contaminated: [what the FIRST attempt picked up], firstAttempt {vis, raw,
//     player, page}, and contaminatedOnRetry: [...] only when the fresh page was contaminated too (then
//     it is also listed in summary.contaminated: judge that frame by eye). When a row leaves authored
//     state behind, the page is reloaded before the NEXT row, which records reloadedBefore {left, by}.
//   · Comparability. A row depends on everything that ran on its page since the page loaded, so two runs
//     compare row-for-row ONLY when they were made with the same --mode, --filter, --s9, --p-src, --pin,
//     --script and --w/--h (renders do not count: --shots and the frame sample leave rows unchanged, e.g.
//     verify0_pinned_m13 and verify0_live_m13 are row-identical). Example: the mode-3 rows of a "--mode 1,3" run
//     are not the mode-3 rows of the default 1,2,3 run (candy_meadow m3's lens sits 1.9 u and 0.04 rad
//     apart, cat_park m3 reads vis 0.8 against 1.0, because a mode-2 block ran before them in one run
//     only); the mode-1 rows of those two runs are the same rows. Every row and script therefore records
//     page {seq, sig}: how many items ran on its page before it and a hash of their labels. --diff exits 2
//     when those arguments differ (unless --allow-meta), and compares only the rows/scripts whose page
//     history matches, listing the others as "not comparable".
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const nx = argv[i + 1];
  if (nx !== undefined && !nx.startsWith('--')) { args[a.slice(2)] = nx; i++; } else args[a.slice(2)] = true;
}
const root = path.resolve(new URL('..', import.meta.url).pathname);
const outDir = path.join(root, 'renders.noindex/camvis');
fs.mkdirSync(outDir, { recursive: true });

// ── offline diff (A12 / A11 helper) ───────────────────────────────────────────
if (args.diff) {
  const [a, b] = String(args.diff).split(',');
  const load = (t) => JSON.parse(fs.readFileSync(path.join(outDir, t + '.json'), 'utf8'));
  const A = load(a), B = load(b);
  const allow = !!args['allow-meta'];
  // the arguments a row depends on (header, "Isolation"); date/commit/tag/pinned are provenance, not composition
  // (renders do not change rows: verify0_pinned_m13, no shots, and verify0_live_m13, with shots, are row-identical)
  const COMP = ['modes', 'filter', 's9', 'pSrc', 'pin', 'scripts', 'w', 'h', 'protocol', 'whatIf'];
  const mv = (j, k) => { const m = j.meta || {}; return k === 'protocol' ? (m.protocol ?? 1) : (m[k] ?? null); };   // whatIf: null on runs that predate it
  const metaDiff = COMP.filter((k) => JSON.stringify(mv(A, k)) !== JSON.stringify(mv(B, k))).map((k) => `${k} ${JSON.stringify(mv(A, k))} vs ${JSON.stringify(mv(B, k))}`);
  const diffs = [];
  const walk = (x, y, p) => {   // returns the number of differences under p (the listing is capped, the count is not)
    if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y) || (x === null) !== (y === null)) { if (diffs.length < 200) diffs.push(`${p}: ${JSON.stringify(x)} ≠ ${JSON.stringify(y)}`); return 1; }
    if (x && typeof x === 'object') { let n = 0; for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) n += walk(x[k], y[k], p + '.' + k); return n; }
    if (x !== y) { if (diffs.length < 200) diffs.push(`${p}: ${JSON.stringify(x)} ≠ ${JSON.stringify(y)}`); return 1; }
    return 0;
  };
  const keyed = (j) => {
    const m = new Map();
    for (const r of j.rows || []) m.set(`P ${r.view} m${r.mode}`, r);
    for (const r of j.s9rows || []) m.set(`§9 ${r.view} m${r.mode}`, r);
    for (const [id, s] of Object.entries(j.scripts || {})) m.set(`script ${id}`, s);
    return m;
  };
  const hist = (x) => (x && x.page ? `${x.page.seq}:${x.page.sig}` : null);
  const strip = (x) => { const c = { ...x }; delete c.page; return c; };
  const KA = keyed(A), KB = keyed(B);
  let same = 0, differ = 0;
  const notComp = [], onlyA = [], onlyB = [];
  for (const [k, x] of KA) {
    if (!KB.has(k)) { onlyA.push(k); continue; }
    const y = KB.get(k), hx = hist(x), hy = hist(y);
    if (hx && hy && hx !== hy) { notComp.push(`${k} (page history ${hx} vs ${hy})`); continue; }
    // a run from before protocol 2 records no page history: its rows compare only when the composition
    // arguments match (pin changes the code under test, not what ran on the page)
    if ((!hx || !hy) && metaDiff.some((d) => !d.startsWith('pin '))) { notComp.push(`${k} (no page history recorded, and the composition arguments differ)`); continue; }
    if (walk(strip(x), strip(y), k)) differ++; else same++;
  }
  for (const k of KB.keys()) if (!KA.has(k)) onlyB.push(k);
  // run-wide fields: impl and errors always; the composition-dependent ones only when the arguments match
  let whole = walk(A.impl ?? null, B.impl ?? null, 'impl') + walk(A.errors ?? [], B.errors ?? [], 'errors');
  if (!metaDiff.length) for (const f of ['summary', 'frame', 'reloads', 'warnings']) whole += walk(A[f] ?? null, B[f] ?? null, f);
  console.log(`camvis diff ${a} vs ${b} (timing and provenance stripped)`);
  if (metaDiff.length) {
    console.log(`${allow ? 'NOTE' : 'NOT COMPARABLE'}: the runs were made with different arguments: ${metaDiff.join(' · ')}`);
    console.log(allow ? '  --allow-meta: comparing the rows/scripts whose page history still matches'
      : '  rows depend on what ran before them on the page (camvis header, "Isolation"), so row-for-row equality is not\n  expected; re-run with the same arguments, or pass --allow-meta to compare the rows whose page history matches');
  }
  console.log(`rows + scripts: ${same} identical · ${differ} differ · ${notComp.length} not comparable · ${onlyA.length} only in ${a} · ${onlyB.length} only in ${b}${whole ? ` · run-wide fields: ${whole} difference(s)` : ''}`);
  if (notComp.length) console.log('  not comparable (different page history: different rows ran before them, or a retry reloaded the page):\n    ' + notComp.slice(0, 30).join('\n    ') + (notComp.length > 30 ? `\n    … ${notComp.length - 30} more` : ''));
  if (onlyA.length) console.log(`  only in ${a}: ${onlyA.slice(0, 30).join(', ')}${onlyA.length > 30 ? ' …' : ''}`);
  if (onlyB.length) console.log(`  only in ${b}: ${onlyB.slice(0, 30).join(', ')}${onlyB.length > 30 ? ' …' : ''}`);
  if (diffs.length) console.log(`differences (first ${Math.min(60, diffs.length)}):\n  ` + diffs.slice(0, 60).join('\n  '));
  let code = differ || whole ? 1 : 0;
  if (!allow && (metaDiff.length || notComp.length || onlyA.length || onlyB.length)) code = 2;
  if (same + differ === 0) code = 2;
  const partial = notComp.length + onlyA.length + onlyB.length;
  if (code === 0) console.log(partial ? `identical over the ${same} rows/scripts that share a page history ONLY (${notComp.length} not comparable, ${onlyA.length + onlyB.length} in one run only)` : `identical: ${a} == ${b}`);
  process.exit(code);
}

const PORT = args.port || 8787;
const W = Number(args.w || 1600), H = Number(args.h || 1000);
const TAG = typeof args.tag === 'string' ? args.tag : 'run';
const MODES = String(args.mode || '1,2,3').split(',').map(Number).filter((m) => m === 1 || m === 2 || m === 3);
const FILTER = typeof args.filter === 'string' ? args.filter : null;
const ALL_SCRIPTS = ['a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 's7', 'seed'];
const scriptArg = typeof args.script === 'string' ? args.script : 'all';
const SCRIPTS = scriptArg === 'all' ? ALL_SCRIPTS : scriptArg === 'none' ? [] : scriptArg.split(',').map((s) => s.trim().toLowerCase());
const PERF = SCRIPTS.includes('perf');
const SHOTS = typeof args.shots === 'string' ? path.resolve(root, args.shots) : null;
const PSRC = args['p-src'] === 'viewsjson' ? 'viewsjson' : 'merged';
const PIN = typeof args.pin === 'string' ? args.pin : null;
const SEEN = !!args.seen;
const SEEN_SHUT = SEEN && !args['no-seen-shut'];
const WHATIF = (() => {
  const a = args['what-if'];
  if (a === undefined) return null;
  if (a !== 'noghost') { console.error(`--what-if: unknown "${a}" (noghost)`); process.exit(2); }
  const file = 'src/systems/candy/architecture.js', from = 'mesh.userData.noFade = true', to = 'mesh.userData.noGhost = true';
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const n = src.split(from).length - 1;
  if (n !== 2) { console.error(`--what-if noghost: expected 2 × "${from}" in ${file}, found ${n} (the file changed: re-check the request)`); process.exit(2); }
  return { kind: a, file, from, to, n, body: src.split(from).join(to) };
})();
const CAMERA_OWNED = /^src\/(core\/input\.js|systems\/camera\.js|systems\/ui\/hotbar\.js|systems\/camera\/[\w.-]+\.js)$/;
const pinCache = new Map();
function pinnedSource(rel) {
  if (!pinCache.has(rel)) {
    let body = null;
    try { body = execSync(`git show ${PIN}:${rel}`, { cwd: root, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { /* not in that commit */ }
    pinCache.set(rel, body);
  }
  return pinCache.get(rel);
}
async function applyPin(page, record) {
  if (!PIN) return;
  await page.route((u) => CAMERA_OWNED.test(new URL(u).pathname.replace(/^\//, '')), async (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\//, '');
    const body = pinnedSource(rel);
    if (body === null) { record[rel] = 'absent at pin → 404'; return route.fulfill({ status: 404, body: '' }); }
    let live = null; try { live = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { /* new file */ }
    record[rel] = live === body ? 'pinned (same as working tree)' : 'pinned (working tree differs)';
    return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body });
  });
}

// ── views, resolved exactly as render.mjs resolves --view ─────────────────────
const views = JSON.parse(fs.readFileSync(path.join(root, 'tools/views.json'), 'utf8'));
const viewsJsonOnly = JSON.parse(JSON.stringify(views));
const viewSrc = {}; for (const k of Object.keys(views)) viewSrc[k] = 'views.json';
const vdir = path.join(root, 'tools/views');
if (fs.existsSync(vdir)) for (const f of fs.readdirSync(vdir)) if (f.endsWith('.json')) {
  try { const j = JSON.parse(fs.readFileSync(path.join(vdir, f), 'utf8')); Object.assign(views, j); for (const k of Object.keys(j)) viewSrc[k] = 'views/' + f; }
  catch (e) { console.error('bad views file', f, e.message); }
}
let camViews = {};
try { camViews = JSON.parse(fs.readFileSync(path.join(vdir, 'camera.json'), 'utf8')); } catch { /* §9 file not there yet */ }

// Probe set P — 15, fixed order (§1). The first 13 are the seed probe's gameplay views.
const P = ['candy_arrival', 'cat_arrival', 'cat_plaza', 'cat_park', 'cat_gym', 'candy_lake', 'sky_dawn_harbor', 'candy_village',
  'cat_main_street', 'cat_residential', 'candy_forest', 'candy_meadow', 'candy_river', 'occ_silhouette', 'occ_whisker_night'];
const GAMEPLAY13 = new Set(P.slice(0, 13));
function resolveP(name) {
  if (PSRC === 'viewsjson' && viewsJsonOnly[name]) return { v: viewsJsonOnly[name], src: 'views.json' };
  return { v: views[name], src: viewSrc[name] };
}

// ── the page library (serialised into the page; must not close over node scope) ─
function pageLib() {
  const g = window.game, ctx = g.ctx, THREE = ctx.THREE, C = ctx.camera;
  const cam = () => ctx.systems.camera, pl = () => ctx.systems.player;
  const TAU = Math.PI * 2;
  const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const r = (x, n = 5) => (typeof x === 'number' ? (Number.isFinite(x) ? +x.toFixed(n) : String(x)) : (x ?? null));
  const _f = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
  const NOOP = () => {};
  ctx.renderOverride = NOOP;
  const impl = {
    look: typeof cam()?.look === 'function',
    recentre: typeof cam()?.recentre === 'function',
    orbit: 'orbit' in ctx.input.pointer,
    moveLock: 'moveLock' in ctx.input,
    isPatched: typeof cam()?.cutout?.isPatched === 'function' || typeof cam()?.isPatched === 'function',
    rawVisible: false,
  };
  const isPatched = (o) => { const c = cam(); if (typeof c?.cutout?.isPatched === 'function') return c.cutout.isPatched(o); if (typeof c?.isPatched === 'function') return c.isPatched(o); return null; };

  /** Camera-space readings. The quaternion is authoritative (matrixWorld is only refreshed at render). */
  const fwd = (out) => out.set(0, 0, -1).applyQuaternion(C.quaternion);
  const elevOf = (d) => Math.asin(Math.max(-1, Math.min(1, d.y / (d.length() || 1))));
  function viewAE() { fwd(_f); return { az: Math.atan2(-_f.x, -_f.z), el: -elevOf(_f) }; }
  const get = (k) => { const c = cam(); try { return c && (k in c) ? c[k] : null; } catch { return null; } };
  const num = (k, n = 5) => { const v = get(k); return typeof v === 'number' ? r(v, n) : (v ?? null); };
  /** Where the centre ray meets the aim surface (ground + 1.15): the look point, and the rendered lens distance. */
  function centreHit() {
    fwd(_f); const p = C.position;
    let prev = 0, t = 0;
    const f = (s) => p.y + _f.y * s - (g.world.height(p.x + _f.x * s, p.z + _f.z * s) + 1.15);
    if (f(0) < 0) return null;
    for (t = 0.25; t < 260; t += 0.25) { if (f(t) <= 0) break; prev = t; }
    if (t >= 260) return null;
    let a = prev, b = t;
    for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m; }
    return { t: b, x: p.x + _f.x * b, z: p.z + _f.z * b };
  }
  function resolveFn(pathStr) {
    const parts = pathStr.split('.');
    let o = ctx.systems;
    for (let i = 0; i < parts.length - 1; i++) o = o?.[parts[i]];
    const fn = o?.[parts[parts.length - 1]];
    return typeof fn === 'function' ? { o, fn } : null;
  }
  function viewParams(v) {
    const p = {};
    if (v.az !== undefined) p.azimuth = v.az; if (v.el !== undefined) p.elevation = v.el;
    if (v.dist !== undefined) p.distance = v.dist; if (v.fov !== undefined) p.fov = v.fov;
    return Object.keys(p).length ? p : null;
  }
  /** §1 order. opts.noStep stops before walk/step (scripts step themselves); opts.forceMode rewrites a
   *  view's own camera.setMode call to m; missing call targets are recorded, never thrown or logged. */
  function setup(v, m, opts = {}) {
    const c = cam(), P = pl();
    g.setTime(v.time ?? 12);
    c.setMode(m);
    c.setParams({ azimuth: Math.PI / 4, elevation: 0.64, distance: 31, fov: 30 });
    P.facing = wrap((v.az ?? Math.PI / 4) + Math.PI);
    if (v.pos) g.teleport(v.pos[0], v.pos[1]);
    const vp = viewParams(v);
    if (vp) g.setCameraParams(vp);
    if (v.free) {
      try { if (g.world.height(v.free[0], v.free[1]) > 0.6) g.teleport(v.free[0], v.free[1]); } catch { /* as render.mjs */ }
      const y = v.y ?? (g.world.height(v.free[0], v.free[1]) + 2);
      g.setView({ target: [v.free[0], y, v.free[1]], azimuth: v.az ?? 0.78, elevation: v.el ?? 0.6, distance: v.dist ?? 120, fov: v.fov });
    } else g.setView(null);
    const calls = [];
    if (v.call) for (const [p, a] of Object.entries(v.call)) {
      let list = Array.isArray(a) ? a : [a];
      if (p === 'camera.setMode' && opts.forceMode) list = [m];
      const f = resolveFn(p);
      if (!f) { calls.push({ path: p, status: 'missing' }); continue; }
      try { f.fn.apply(f.o, list); calls.push({ path: p, status: 'ok' }); } catch (e) { calls.push({ path: p, status: 'error', msg: String(e.message).slice(0, 120) }); }
    }
    authored = state(true);                              // what the view's own calls set up: excused (header, "Isolation")
    if (opts.watch) watchStart();
    if (opts.noStep) return calls;
    if (v.walk) g.walk({ x: v.walk.x, y: v.walk.y }, v.walk.n || 30);
    g.step(v.frames ?? 45, 1 / 30);
    ctx.scene.updateMatrixWorld(true);
    return calls;
  }
  /** Sticky world state (a tiger carrying the visitor off to bed at 21:00, a ferry crossing, a flight, an
   *  open card). CAUSES say what happened; the other entries (player.locked / onFerry / onVehicle,
   *  cinematic) are the flags those causes set. dom = false skips the DOM query (the per-frame watch).
   *  dirty() before a row: reload first. After a row: contamination() decides whether to retry it. */
  const STATE_ORDER = ['tiger carry', 'player.locked', 'player.onFerry', 'player.onVehicle', 'paused', 'flying', 'ferry crossing', 'vehicle', 'cinematic', 'ui card open'];
  const CAUSES = new Set(['tiger carry', 'paused', 'flying', 'ferry crossing', 'vehicle', 'ui card open']);
  function state(dom = true) {
    const r = [], P = pl(), c = cam();
    if (ctx.systems.catCitizens?.carrier) r.push('tiger carry');
    if (P?.locked) r.push('player.locked');
    if (P?.onFerry) r.push('player.onFerry');
    if (P?.onVehicle) r.push('player.onVehicle');
    if (ctx.state.paused) r.push('paused');
    if (ctx.state.flying) r.push('flying');
    if (ctx.state.ferry) r.push('ferry crossing');
    if (ctx.state.vehicle) r.push('vehicle');
    if (c?.cinematicActive) r.push('cinematic');
    if (dom && document.querySelector('.cci-cardwrap.cci-hit')) r.push('ui card open');
    return r;
  }
  const dirty = () => state(true);
  let authored = [], seen = null, seenOff = null;
  /** Watch every frame (camera:update fires once per non-free frame): read-only, so rows are unchanged. */
  function watchStart() { watchStop(); a3Reset(); const s = new Set(); seen = s; seenOff = ctx.events.on('camera:update', () => { for (const x of state(false)) s.add(x); a3Frame(); }); }
  function watchStop() { const s = seen; if (seenOff) seenOff(); seen = null; seenOff = null; return s ? STATE_ORDER.filter((x) => s.has(x)) : []; }
  function seenStates() { const d = new Set([...watchStop(), ...dirty()]); return STATE_ORDER.filter((x) => d.has(x)); }
  /**
   * A3 (CAMERA_SPEC §1, §5.2): the ladder's lens on every frame the watch sees (camera:update: the walk and the
   * step frames of a row, a script's whole run) and once more at the end. occDist must never sit under the floor
   * A3 names — 14 u outdoors, 5.5 u inside a building (camera.indoors) — or under the undollied distance itself
   * less 0.5 u (the breathing) when that is shorter (a lens nobody dollied passes whatever the zoom); and the cull
   * may only ever hold meshes ≤ 18 u (camera.culledSizes: the largest world bounding-box side). Read-only: the
   * getters change nothing, so rows are unchanged. Free-camera frames are skipped (the ladder does not run).
   */
  let a3 = null;
  function a3Reset() { a3 = { frames: 0, minMargin: Infinity, at: null, culledMax: 0, culledOver: [], indoors: false }; }
  function a3Frame() {
    const c = cam();
    if (!c || !a3 || c.isFree()) return;
    a3.frames++;
    const ind = get('indoors') === true, lim = ind ? 5.5 : 14;
    if (ind) a3.indoors = true;
    const d = c.current.distance, need = Math.min(lim, d - 0.5), mg = c.occDist - need;
    if (mg < a3.minMargin) { a3.minMargin = mg; a3.at = { frame: a3.frames, occDist: r(c.occDist, 3), need: r(need, 3), indoors: ind, dist: r(d, 3) }; }
    if (c.culled) for (const x of (get('culledSizes') || [])) {
      if (x.maxDim > a3.culledMax) a3.culledMax = x.maxDim;
      if (!(x.maxDim <= 18) && !a3.culledOver.includes(x.name)) a3.culledOver.push(x.name);
    }
  }
  function a3Read() {
    a3Frame();
    if (!a3 || !a3.frames) return null;
    return { frames: a3.frames, minMargin: r(a3.minMargin, 3), at: a3.at, indoors: a3.indoors, culledMax: r(a3.culledMax, 2), culledOver: a3.culledOver,
      pass: a3.minMargin >= -1e-3 && !a3.culledOver.length };
  }
  /** The states the view did not author: a cause its calls did not create, or any flag at all when its
   *  calls created none (a flight the view asked for excuses the locked/onVehicle flags it sets; a tiger
   *  carry during that flight would still count). */
  function contamination(states) {
    const auth = new Set(authored), all = new Set(states);
    return STATE_ORDER.filter((x) => all.has(x) && !auth.has(x) && (CAUSES.has(x) || auth.size === 0));
  }
  function undoSticky(v) {
    if (v.call && 'ui.showHint' in v.call) { try { ctx.systems.ui.showHint(false); } catch { /* ui optional */ } }
  }
  /** One row (§1 fields + the lens geometry the anomaly check needs). */
  function row(name, m, v, src, calls) {
    const c = cam(), P = pl().position;
    ctx.scene.updateMatrixWorld(true);
    let bv;
    try { bv = c.bodyVisibility(); } catch (e) { bv = { visible: 0, total: 5, rays: [], err: String(e.message) }; }
    if ('rawVisible' in bv) impl.rawVisible = true;
    const tot = bv.total || 5;
    const raw = bv.rawVisible ?? bv.visible, fth = bv.featherVisible ?? 0;
    const cp = C.position, tg = c.target;
    const gh = g.world.height(cp.x, cp.z);
    const ae = viewAE();
    const ch = centreHit();
    const cur = c.current, pp = c.params;
    return {
      view: name, mode: m, src, time: v.time ?? 12, viewParams: viewParams(v), calls: calls && calls.length ? calls : undefined,
      vis: r(bv.visible / tot, 3), raw: r(raw / tot, 3), feather: r(fth / tot, 3), total: tot,
      blocked: bv.rays.filter((x) => !(x.rawClear ?? x.clear)).map((x) => `${x.pt}:${x.by?.[0] ?? '?'}`),
      cutClear: bv.rays.filter((x) => x.clear && x.rawClear === false).map((x) => `${x.pt}:${x.by?.[0] ?? '?'}`),
      // what keeps a ray shut in the cut-aware reading (step 4+: bodyVisibility().rays[].cutBy — may name a
      // noFade mass today's raw reading skips; a feather ray has none)
      cutBlocked: bv.rays.filter((x) => !x.clear).map((x) => `${x.pt}:${x.cutBy ?? (x.feather ? 'feather' : x.by?.[0] ?? '?')}`),
      // why each ray the cut-aware reading keeps shut stays shut (step 4+: rays[].cutWhy, cutout.why()):
      // terrain / noCut / unpatched / nearBody / feather are CAMERA_SPEC §5.3's accepted amber cases
      // (excused), shut / low / outside are the window's own misses; null before the cut exists
      amber: typeof c.cutout?.why === 'function' ? bv.rays.filter((x) => !x.clear).map((x) => `${x.pt}:${x.cutWhy ?? '?'}${x.excused ? '' : '!'}`) : null,
      // why the window is open (step 4+: camera.cutState): sweep = (a) a patched mass in front of the REAL lens
      // blocks a body ray, col = (b) the wall/trunk collider trigger; null before the cut exists
      cutWhy: (() => { const s = get('cutState'); return s ? { sweep: !!s.needSweep, col: !!s.colTrigger, colRun: s.colRun, rays: s.rays, sweepClear: !!s.sweepClear, allUnpatched: !!s.allUnpatched } : null; })(),
      facing: r(wrap(pl().facing)), pinned: get('pinned'),
      occDist: r(c.occDist, 4), goalDistance: num('goalDistance', 4), occLift: r(c.occLift, 4),
      terrainLift: num('terrainLift', 4), tilt: num('tilt', 4), densityK: num('densityK', 4), cutK: num('cutK', 4), occYaw: num('occYaw', 4),
      culledList: c.culledList, fading: c.fading, occBlocked: r(c.occBlocked, 3),
      current: { azimuth: r(cur.azimuth, 4), elevation: r(cur.elevation, 4), distance: r(cur.distance, 4) },
      params: { azimuth: r(pp.azimuth, 4), elevation: r(pp.elevation, 4), distance: r(pp.distance, 4), fov: r(pp.fov, 3) },
      player: [r(P.x, 3), r(P.y, 3), r(P.z, 3)],
      lens: {
        pos: [r(cp.x, 3), r(cp.y, 3), r(cp.z, 3)], fov: r(C.fov, 3), az: r(ae.az, 4), el: r(ae.el, 4),
        toTarget: r(cp.distanceTo(tg), 3), eff: r(Math.hypot(cp.x - P.x, cp.y - P.y - 1.15, cp.z - P.z), 3),
        centre: ch ? r(ch.t, 3) : null, ground: r(gh, 3), clamp: Math.abs(cp.y - (gh + 1.6)) < 1e-3,
      },
      free: c.isFree(),
    };
  }
  function probe(name, v, m, src, opts = {}) {
    const t0 = performance.now();
    const calls = setup(v, m, { ...opts, watch: true });
    const during = watchStop();
    const out = row(name, m, v, src, calls);
    out.a3 = a3Read();
    // right after the probe, before any screenshot: did the world do something this view did not ask for?
    const bad = contamination([...during, ...dirty()]);
    if (authored.length) out.authoredState = authored.slice();
    if (bad.length) out.contaminated = bad;
    // with the window open, also the same pixels with its ellipse shut: what the window itself gives him
    if (opts.seen) out.seen = seenBody(opts.seenShut !== false && typeof out.cutK === 'number' && out.cutK >= 0.05);
    const timing = { ms: performance.now() - t0, camMs: get('camMs'), occMs: cam().occMs };
    return { row: out, timing };
  }
  /**
   * SEEN (--seen): the share of the visitor's body pixels the RENDERED frame draws with his real body —
   * the pixel answer to "can you see him", which raycasts cannot give (a noFade roof, a shader-displaced
   * lollipop head, the window's dither). Two renders of the current camera: (1) the frame as it is with
   * the silhouette pass and every depth-less effect hidden (particles, glows, 15% ghosts: they do not hide
   * him, and would make the number flicker) and every body mesh in flat magenta, (2) the body alone in
   * magenta. seen = pixels magenta in both / pixels magenta in (2). Everything is put back (materials,
   * every visible flag, as skyBand() does), so rows after it are unchanged; the frame itself is unlit.
   * withShut (the window is open): (1) once more with the window's ellipse strength at 0 (the near-lens
   * band as it is) → seenShut; seen − seenShut is the share of him the window itself opens (A15: a window
   * that opens nothing on him while nothing blocks him is open for nothing).
   */
  const SEEN_MAT = new THREE.MeshBasicMaterial({ color: 0xff00ff, fog: false, toneMapped: false });
  function seenBody(withShut = false) {
    const R = ctx.renderer, gl = R.getContext(), P = pl();
    if (!P?.group) return null;
    C.updateMatrixWorld(true);
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const sil = new Set();
    P.group.traverse((o) => { if (o.userData?.silhouette) o.traverse((q) => sil.add(q)); });
    const body = [];
    P.group.traverse((o) => { if (o.isMesh && !sil.has(o)) { for (let n = o; n; n = n.parent) if (!n.visible) return; body.push(o); } });
    if (!body.length) return null;
    const mats = body.map((o) => o.material);
    const vis0 = [];
    ctx.scene.traverse((o) => { vis0.push(o, o.visible); });
    const read = () => { R.setRenderTarget(null); R.render(ctx.scene, C); const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    const mag = (b, k) => b[k] >= 200 && b[k + 1] <= 70 && b[k + 2] >= 200;
    delete ctx.renderOverride;
    let A = null, B = null, S = null;
    try {
      for (const o of body) o.material = SEEN_MAT;
      for (const o of sil) o.visible = false;
      // effects that write no depth (sparkles, glows, rings, the camera's own 15% ghosts) do not hide him:
      // leave them out, so `seen` measures what the geometry lets through and does not flicker with particles
      ctx.scene.traverse((o) => {
        if (!o.visible) return;
        if (o.isPoints || o.isSprite || o.isLine) { o.visible = false; return; }
        if (!o.isMesh) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (m && m.depthWrite === false) o.visible = false;
      });
      A = read();
      if (withShut) {
        const u = cam().cutout?.uniforms?.uCutR?.value;
        if (u) { const k0 = u.z; u.z = 0; try { S = read(); } finally { u.z = k0; } }
      }
      const keep = new Set();
      for (const o of body) for (let n = o; n; n = n.parent) keep.add(n);
      ctx.scene.traverse((o) => { if (!keep.has(o) && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) o.visible = false; });
      B = read();
    } finally {
      body.forEach((o, i) => { o.material = mats[i]; });
      for (let i = 0; i < vis0.length; i += 2) vis0[i].visible = vis0[i + 1];
      ctx.renderOverride = NOOP;
    }
    let total = 0, drawn = 0, drawnS = 0;
    for (let k = 0; k < B.length; k += 4) if (mag(B, k)) { total++; if (mag(A, k)) drawn++; if (S && mag(S, k)) drawnS++; }
    const res = { seen: total ? r(drawn / total, 3) : null, px: total };
    if (S) res.seenShut = total ? r(drawnS / total, 3) : null;
    return res;
  }
  /** Render the current state for a screenshot (2 frames, as render.mjs renders the last two ticks). */
  function renderNow(n = 2) {
    delete ctx.renderOverride;
    const ms = [];
    for (let i = 0; i < n; i++) { const t = performance.now(); ctx.renderer.render(ctx.scene, C); ms.push(performance.now() - t); }
    ctx.renderOverride = NOOP;
    const info = ctx.renderer.info.render;
    return { ms, calls: info.calls, triangles: info.triangles };
  }
  /**
   * OPEN SKY in the geometric sky band, in rendered pixels (A15's sky band; §8 step 2 "sky band
   * visible"). The band (top frame edge → the lens's horizontal) is what the pitch controls; what
   * shows inside it is the world's business. So the current camera is rendered twice — as is, and
   * with every drawable outside the sky system (dome, sun, moon, stars, clouds, mist) hidden, lights
   * kept — and a band pixel is OPEN when the two renders agree (max channel difference ≤ 10: far
   * geometry fogged into the haze reads as sky, as it does to the eye). Raycasts cannot answer it:
   * the giant lollipops' vertex shader drops each head by up to ~6 u below where the CPU geometry
   * holds it. The canvas is left showing the real frame. A coarse ray grid over the BLOCKED pixels
   * names what fills them (names and lens distances only; its hit heights are not the rendered ones;
   * "unresolved" = the ray found no CPU geometry there, i.e. a shader-displaced head).
   *   → { bandPct (band, % of frame height), openPct (open pixels, % of the band), openFramePct (open
   *       pixels, % of the frame), colsOpen (of 16 columns, those with ≥ 25% of their band open), by }
   */
  const _rc = new THREE.Raycaster(), _ndc = new THREE.Vector2();
  const SKYNAME = /^(sky|cloud|star|sun|moon|mist)/i;
  function skyBand() {
    const R = ctx.renderer, gl = R.getContext();
    C.updateMatrixWorld(true);
    fwd(_f); const down = -elevOf(_f), half = C.fov * Math.PI / 360;
    const band = half - down > 0 ? (1 - Math.tan(down) / Math.tan(half)) / 2 : 0;
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, rows = Math.min(H, Math.floor(band * H));
    const out = { bandPct: r(band * 100, 2), rows, openPct: 0, openFramePct: 0, colsOpen: 0, cols: 16, by: {} };
    if (rows < 1) return out;
    const read = () => { R.setRenderTarget(null); R.render(ctx.scene, C); const b = new Uint8Array(W * rows * 4); gl.readPixels(0, H - rows, W, rows, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    // Rendering is not free of side effects: the tile culler (terrain/instcull.js, desktop on Cat Island's
    // district merges) hides meshes with nothing in view from onBeforeRender, and the camera's sweep and
    // bodyVisibility() skip hidden meshes. So every visible flag is put back afterwards: the checks that run
    // after this one see the scene an unrendered camvis frame would have.
    const vis0 = [];
    ctx.scene.traverse((o) => { vis0.push(o, o.visible); });
    delete ctx.renderOverride;
    let A, B;
    const hid = [];
    try {
      A = read();
      const sky = ctx.systems.sky, keep = new Set([sky?.group, sky?.clouds?.group, sky?.mist?.mesh].filter(Boolean));
      const walk = (o) => {
        if (keep.has(o)) return;
        if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) { o.visible = false; hid.push(o); }
        for (const ch of o.children) walk(ch);
      };
      walk(ctx.scene);
      B = read();
    } finally {
      for (const o of hid) o.visible = true;
      R.render(ctx.scene, C);                              // leave the canvas on the real frame
      ctx.renderOverride = NOOP;
      for (let i = 0; i < vis0.length; i += 2) vis0[i].visible = vis0[i + 1];
    }
    // readPixels rows run bottom-up: buffer row 0 is frame row H-1 … row rows-1 is the top edge
    const open = new Uint8Array(W * rows);
    let n = 0;
    for (let i = 0, k = 0; i < W * rows; i++, k += 4) {
      const d = Math.max(Math.abs(A[k] - B[k]), Math.abs(A[k + 1] - B[k + 1]), Math.abs(A[k + 2] - B[k + 2]));
      if (d <= 10) { open[i] = 1; n++; }
    }
    const cw = W / 16;
    for (let ci = 0; ci < 16; ci++) {
      let o = 0, t = 0;
      for (let y = 0; y < rows; y++) for (let x = Math.floor(ci * cw); x < Math.floor((ci + 1) * cw); x++) { t++; o += open[y * W + x]; }
      if (t && o / t >= 0.25) out.colsOpen++;
    }
    out.openPct = r(100 * n / (W * rows), 2);
    out.openFramePct = r(100 * n / (W * H), 3);
    // who fills the rest: 16 columns × 4 rows of the band, blocked pixels only
    let sampled = 0;
    for (let ci = 0; ci < 16; ci++) for (let ri = 0; ri < 4; ri++) {
      const x = Math.floor((ci + 0.5) * cw), yTop = Math.floor((ri + 0.5) * rows / 4);   // frame row from the top
      if (open[(rows - 1 - yTop) * W + x]) continue;
      sampled++;
      _ndc.set((x + 0.5) / W * 2 - 1, 1 - (yTop + 0.5) / H * 2);
      _rc.setFromCamera(_ndc, C); _rc.far = 3000;
      let hits = []; try { hits = _rc.intersectObject(ctx.scene, true); } catch { hits = []; }
      const h = hits.find((h) => {
        const o = h.object; if (!o.visible || o.isPoints || o.isSprite || o.isLine) return false;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.depthWrite === false || (m.transparent && (m.opacity ?? 1) < 0.5)) return false;
        return !SKYNAME.test(o.name || '') && !SKYNAME.test(o.parent?.name || '');
      });
      const key = h ? `${h.object.name || h.object.type}${h.object.isInstancedMesh ? '[inst]' : ''}` : 'unresolved';
      const e = out.by[key] || (out.by[key] = { n: 0, near: Infinity });
      e.n++; if (h) e.near = Math.min(e.near, h.distance);
    }
    for (const e of Object.values(out.by)) e.near = Number.isFinite(e.near) ? r(e.near, 1) : null;
    out.sampledBlocked = sampled;
    return out;
  }

  // ── helpers for the scripts ────────────────────────────────────────────────
  const sample = () => {
    const P = pl().position, ae = viewAE(), c = cam();
    return { x: P.x, y: P.y, z: P.z, facing: pl().facing, az: ae.az, el: ae.el, fov: C.fov, curAz: c.current.azimuth, curEl: c.current.elevation,
      pAz: c.params.azimuth, occLift: c.occLift, occYaw: get('occYaw'), cine: !!c.cinematicActive, flying: !!ctx.state.flying };
  };
  /** Hold a virtual stick for n frames; before(i) runs ahead of frame i. Returns per-frame samples. */
  function hold(dir, n, before) {
    const tr = [];
    for (let i = 0; i < n; i++) {
      if (before) before(i);
      ctx.input.virtual = { x: dir.x, y: dir.y };
      g.step(1, 1 / 30);
      tr.push(sample());
    }
    ctx.input.virtual = { x: 0, y: 0 };
    return tr;
  }
  const pathLen = (tr, x0, z0) => { let s = 0, px = x0, pz = z0; for (const p of tr) { s += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; } return s; };
  const rates = (tr, key, from = 1, scale = 30) => { const o = []; for (let i = Math.max(1, from); i < tr.length; i++) o.push(Math.abs(wrap(tr[i][key] - tr[i - 1][key])) * scale); return o; };
  const maxOf = (a) => a.reduce((m, x) => Math.max(m, x), 0);
  const sumOf = (a) => a.reduce((s, x) => s + x, 0);
  const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]; };
  const chk = (id, value, op, limit) => {
    const v = typeof value === 'number' ? r(value, 4) : value;
    const pass = value === null || value === undefined ? false
      : op === '<=' ? value <= limit : op === '>=' ? value >= limit : op === '<' ? value < limit : op === '>' ? value > limit : op === '==' ? value === limit : false;
    return { id, value: v, op, limit, pass };
  };
  const NI = (why) => ({ status: 'not implemented yet', why });
  /** "file ← caller file ← …" for the src frames of the current stack (who wrote a param). */
  function writerChain() {
    const files = [];
    for (const ln of (new Error().stack || '').split('\n').slice(2)) {
      const mm = /\/src\/([\w/.-]+\.js)/.exec(ln);
      if (mm && files[files.length - 1] !== mm[1]) files.push(mm[1]);
      if (files.length >= 3) break;
    }
    return files.length ? files.join(' ← ') : 'camvis';
  }
  /** Who wrote a camera param: the caller of setParams (cave.js, palace.js, 'harness' for debug.js's
   *  setCameraParams, 'camvis' for this tool), or 'camera.js:<fn>' when the camera wrote it itself. */
  function paramWriter() {
    const lines = (new Error().stack || '').split('\n').slice(2);
    for (let i = 0; i < lines.length; i++) {
      const mm = /at (?:(\S+) )?\(?[^()]*\/src\/([\w/.-]+\.js):\d+/.exec(lines[i]);
      if (!mm) continue;
      const fn = (mm[1] || '?').replace(/^Object\./, ''), file = mm[2];
      if (file !== 'systems/camera.js') return file === 'core/debug.js' ? 'harness' : file;
      if (!/setParams/.test(fn)) return 'camera.js:' + fn;
      for (let j = i + 1; j < lines.length; j++) {
        const m2 = /\/src\/([\w/.-]+\.js)/.exec(lines[j]);
        if (m2 && m2[1] !== 'systems/camera.js') return m2[1] === 'core/debug.js' ? 'harness' : m2[1];
      }
      return 'camvis';
    }
    return 'camvis';
  }
  /** Trap writes to camera.params[k] (who, how many, the last value per writer). Returns the undo. */
  function trapParam(k, rec) {
    const c = cam();
    let val = c.params[k];
    Object.defineProperty(c.params, k, {
      configurable: true, enumerable: true, get: () => val,
      set: (x) => { const w = paramWriter(); rec.count[w] = (rec.count[w] || 0) + 1; rec.last[w] = x; val = x; },
    });
    return () => Object.defineProperty(c.params, k, { configurable: true, enumerable: true, writable: true, value: val });
  }
  /** camera.js owned() (§2), restated: an interior (either architecture's `interiors[].inside`),
   *  placeOverride (palace, cave), a vehicle, the ferry, a lock. */
  function ownedNow() {
    const P = pl();
    if (ctx.state.placeOverride || P?.onVehicle || P?.onFerry || P?.locked || ctx.state.ferry) return true;
    for (const a of ['candyArchitecture', 'catArchitecture']) {
      let list = ctx.systems[a]?.interiors; if (!list) continue;
      if (!Array.isArray(list)) list = (list instanceof Map || list instanceof Set) ? [...list.values()] : Object.values(list);
      if (list.some((it) => it && it.inside === true)) return true;
    }
    return false;
  }
  /** Per-frame owned-framing trace (camera:update): FOV vs p.fov, the pitch after the final lookAt,
   *  the lens bearing vs params.azimuth (and vs an owner's last written azimuth, via ownerAz()). */
  function ownedTrace(ownerAz) {
    const c = cam(), tr = [];
    const off = ctx.events.on('camera:update', () => {
      fwd(_f); _d.copy(c.target).sub(C.position).normalize();
      const bearing = Math.atan2(C.position.x - c.target.x, C.position.z - c.target.z);
      const oa = ownerAz ? ownerAz() : null;
      tr.push({ fov: C.fov, pfov: c.params.fov, pitch: elevOf(_f) - elevOf(_d), bearing, pAz: c.params.azimuth, ownerAz: oa,
        el: c.current.elevation, dist: c.current.distance, owned: ownedNow() });
    });
    return { tr, off };
  }
  /** Walk out of every interior (open country, 20 frames), so the next entry re-runs the owners'
   *  edge-triggered framing (cave.js caveCam, palace.js, the interiors' inside flags). */
  function leaveInteriors() { g.teleport(-110, -45); g.setView(null); g.step(20, 1 / 30); }
  const MEADOW = { pos: [-110, -45], time: 12 };
  function settle(m, v, facing, frames = 10) {
    setup({ ...v, frames: 0 }, m, { noStep: true });
    if (facing !== undefined) pl().facing = facing;
    if (m === 2 || facing !== undefined) cam().snap();       // re-seat the lens on the facing just set
    g.step(frames, 1 / 30);
  }

  // A4 — mode-2 steering + mid-walk drag
  function a4() {
    const keys = { W: { x: 0, y: 1 }, A: { x: -1, y: 0 }, S: { x: 0, y: -1 }, D: { x: 1, y: 0 } };
    const out = { status: 'ok', setup: 'mode 2, snap at (-110,-45), facing 5π/4, az π/4, 10 settle frames, 120 frames per key', keys: {}, checks: [] };
    for (const [k, dir] of Object.entries(keys)) {
      settle(2, MEADOW, wrap(5 * Math.PI / 4));
      const s0 = pl().position.clone();
      const tr = hold(dir, 120);
      const last = tr[tr.length - 1];
      const net = Math.hypot(last.x - s0.x, last.z - s0.z), path = pathLen(tr, s0.x, s0.z);
      const yr = rates(tr, 'az');
      const sumDaz = sumOf(yr) / 30;
      out.keys[k] = { net: r(net, 3), path: r(path, 3), ratio: r(net / (path || 1), 4), sumAbsDaz: r(sumDaz, 4), maxYawRate: r(maxOf(yr), 4),
        azStart: r(tr[0].az, 4), azEnd: r(last.az, 4), trace: tr.filter((_, i) => i % 10 === 9).map((p) => [r(p.x, 2), r(p.z, 2), r(p.facing, 3), r(p.az, 3)]) };
      out.checks.push(chk(`${k} net/path`, net / (path || 1), '>=', k === 'W' ? 0.95 : 0.85));
      if (k === 'D' || k === 'A') out.checks.push(chk(`${k} Σ|Δaz|`, sumDaz, '<=', 1.6));
      if (k === 'S') out.checks.push(chk('S Σ|Δaz|', sumDaz, '<=', 0.15));
    }
    // mid-walk drag: W throughout; frames 10-25 feed orbit + 262 px in total (a 90° orbit)
    settle(2, MEADOW, wrap(5 * Math.PI / 4));
    const pt = ctx.input.pointer, hadOrbit = 'orbit' in pt;
    const tr = hold({ x: 0, y: 1 }, 120, (i) => {
      if (i >= 10 && i <= 25) { pt.orbit = true; pt.dragDX = 262 / 16; } else if (i === 26) pt.orbit = false;
    });
    if (!hadOrbit) delete pt.orbit; else pt.orbit = false;
    const i3 = 89;                                   // 3.0 s = the 90th frame
    const dx = tr[i3].x - tr[i3 - 3].x, dz = tr[i3].z - tr[i3 - 3].z;
    const travelYaw = Math.atan2(dx, dz);
    const off = Math.abs(wrap(tr[i3].az - (travelYaw + Math.PI)));
    const after = rates(tr, 'az', 26);
    const orbitDone = Math.abs(wrap(tr[25].az - tr[9].az));
    out.drag = { orbitApplied: r(orbitDone, 4), offBehindAt3s: r(off, 4), travelYaw: r(travelYaw, 4), azAt3s: r(tr[i3].az, 4), maxAutoYawAfter25: r(maxOf(after), 4),
      trace: tr.filter((_, i) => i % 10 === 9).map((p) => [r(p.x, 2), r(p.z, 2), r(p.az, 3)]) };
    out.checks.push(chk('drag: orbit applied (rad, 1.57 wanted)', orbitDone, '>=', 1.4));
    out.checks.push(chk('drag: |az − (travelYaw+π)| at 3.0 s', off, '<=', 0.1));
    out.checks.push(chk('drag: max auto yaw after frame 25 (rad/s)', maxOf(after), '<=', 1.1));
    return out;
  }
  // Seed replica: tools/_tmp/camprobe.mjs's hold-D protocol, for the §1 cross-check (net 2.7 / path 23.7)
  function seedHoldD() {
    const c = cam(), out = {};
    for (const [label, dir] of [['hold_D', { x: 1, y: 0 }], ['hold_S', { x: 0, y: -1 }], ['hold_W', { x: 0, y: 1 }]]) {
      c.setMode(1); g.teleport(-110, -45); c.setParams({ elevation: 0.64, distance: 31, azimuth: Math.PI * 0.25 }); c.snap();
      c.setMode(2); g.step(10, 1 / 30);
      const s0 = pl().position.clone();
      const tr = hold(dir, 120);
      const last = tr[tr.length - 1];
      out[label] = { net: r(Math.hypot(last.x - s0.x, last.z - s0.z), 2), path: r(pathLen(tr.filter((_, i) => i % 10 === 9), s0.x, s0.z), 2), pathFine: r(pathLen(tr, s0.x, s0.z), 2), facing0: r(tr[0].facing, 3) };
    }
    c.setMode(1);
    out.status = 'ok';
    out.note = 'replica of tools/_tmp/camprobe.mjs (path summed over 10-frame samples, as the seed did; pathFine = every frame)';
    return out;
  }

  // The seed probe's own loop, verbatim protocol (no facing reset, snap, step 30), for the §1 cross-check
  function seedProbe(list) {
    const c = cam(), rowsOut = [];
    for (const [name, v] of list) {
      for (const cfg of ['shipped', 'overhead_mode3']) {
        c.setMode(1);
        g.setTime(v.time ?? 12); g.teleport(v.pos[0], v.pos[1]);
        const p = {}; if (v.az !== undefined) p.azimuth = v.az; if (v.el !== undefined) p.elevation = v.el; if (v.dist !== undefined) p.distance = v.dist; if (v.fov !== undefined) p.fov = v.fov;
        c.setParams({ elevation: 0.64, distance: 31, fov: 30, ...p });
        if (cfg === 'overhead_mode3') c.setMode(3);
        c.snap(); g.setView(null);
        if (v.walk) g.walk({ x: v.walk.x, y: v.walk.y }, v.walk.n || 30);
        g.step(30, 1 / 30);
        const bv = c.bodyVisibility();
        const P = pl().position, cp = C.position;
        rowsOut.push({ view: name, cfg, vis: bv.visible / bv.total, eff: r(Math.hypot(cp.x - P.x, cp.y - P.y - 1.15, cp.z - P.z), 1),
          by: bv.rays.filter((x) => !x.clear).map((x) => x.pt + ':' + x.by[0]).slice(0, 2) });
      }
    }
    c.setMode(1);
    const mean = (cfg) => { const a = rowsOut.filter((x) => x.cfg === cfg).map((x) => x.vis); return r(a.reduce((q, x) => q + x, 0) / (a.length || 1), 4); };
    return { status: 'ok', note: 'tools/_tmp/camprobe.mjs protocol: setMode(1) → teleport → setParams({el .64, dist 31, fov 30, ...view}) → snap → setView(null) → step(30)', shippedMean: mean('shipped'), overheadMean: mean('overhead_mode3'), rows: rowsOut };
  }

  // A5 — mode 1, hold W, Q at frame 10
  function a5() {
    settle(1, MEADOW, wrap(Math.PI / 4 + Math.PI));
    const qAt = 10;
    let azAfter = null;
    const tr = hold({ x: 0, y: 1 }, 50, (i) => {
      if (i === qAt) { ctx.input.pressed.add('KeyQ'); ctx.input.keys.add('KeyQ'); }
      if (i === qAt + 1) { ctx.input.keys.delete('KeyQ'); azAfter = cam().params.azimuth; }
    });
    const hd = [];
    for (let i = 1; i < tr.length; i++) { const dx = tr[i].x - tr[i - 1].x, dz = tr[i].z - tr[i - 1].z; hd.push({ h: Math.atan2(dx, dz), sp: Math.hypot(dx, dz) * 30 }); }
    const hr = []; for (let i = qAt; i < hd.length; i++) hr.push(Math.abs(wrap(hd[i].h - hd[i - 1].h)) * 30);
    const at = qAt + 36;                              // 1.2 s after the press
    const up = wrap(azAfter + Math.PI);
    const facingErr = Math.abs(wrap(tr[at].facing - up));
    const sp = hd.slice(qAt).map((x) => x.sp);
    const minSp = Math.min(...sp), medSp = pct(sp, 0.5);
    return {
      status: 'ok', setup: 'mode 1 at (-110,-45), facing screen-up, hold W 50 frames (the route meets a prop at frame ~61), Q pressed on frame 10',
      azBefore: r(tr[qAt - 1].pAz, 4), azAfter: r(azAfter, 4), maxHeadingRate: r(maxOf(hr), 4), headingRateP95: r(pct(hr, 0.95), 4), facingErrAt1_2s: r(facingErr, 4), minSpeed: r(minSp, 3), medianSpeed: r(medSp, 3),
      trace: tr.filter((_, i) => i % 3 === 0).map((p, j) => [j * 3, r(p.x, 2), r(p.z, 2), r(p.facing, 3), r(p.az, 3), j * 3 >= 1 ? r(hd[j * 3 - 1]?.sp, 2) : null]),
      checks: [chk('heading change rate (rad/s)', maxOf(hr), '<=', 0.9), chk('facing vs new screen-up at 1.2 s (rad)', facingErr, '<=', 0.05), chk('never stops: min/median speed', minSp / (medSp || 1), '>=', 0.5)],
    };
  }

  // A6 — lead: ground along the travel line to the frame edge
  function edgeAlong(P0, dir, maxS = 120) {
    C.updateMatrixWorld(true);
    for (let s = 0; s <= maxS; s += 0.05) {
      const x = P0.x + dir.x * s, z = P0.z + dir.z * s;
      _v.set(x, g.world.height(x, z), z).project(C);
      if (_v.z > 1 || _v.x < -1 || _v.x > 1 || _v.y < -1 || _v.y > 1) {
        const edge = _v.z > 1 ? 'behind' : (Math.abs(_v.y) >= Math.abs(_v.x) ? (_v.y < 0 ? 'bottom' : 'top') : (_v.x < 0 ? 'left' : 'right'));
        return { dist: r(s, 2), edge };
      }
    }
    return { dist: maxS, edge: 'none' };
  }
  /** Where the frame's top / bottom edge (centre column) meets the plane through the ground under the feet: the
   *  flat-ground frame CAMERA_SPEC §4.1 reasons with ("~10 u of ground on the lens side against ~22 u away").
   *  Along the travel line, like edgeAlong(); null when that edge ray never comes down to the plane. */
  function flatEdge(P0, dir, which) {
    C.updateMatrixWorld(true);
    const gy = g.world.height(P0.x, P0.z);
    _w.set(0, which === 'top' ? 1 : -1, 0.5).unproject(C);
    const o = C.position, dx = _w.x - o.x, dy = _w.y - o.y, dz = _w.z - o.z;
    if (!(dy < -1e-6)) return null;
    const t = (gy - o.y) / dy;
    return r((o.x + dx * t - P0.x) * dir.x + (o.z + dz * t - P0.z) * dir.z, 2);
  }
  /** One A6 run (§1 reset in mode 1 at `spot`, virtual (0, y) for 45 frames, frames 0) and its reading: the
   *  ground along the travel line to the frame edge, plus why it is what it is — the aim's lead along the
   *  travel line (the lead minus the dead-zone chase lag), the lens the ladder left (occDist vs the goal, its
   *  lift), the ground profile along the travel line, the flat-plane edge and where the hat sits on screen. */
  function a6Run(spot, y, want) {
    const c = cam();
    setup({ ...spot, frames: 0 }, 1, { noStep: true });
    let air = 0;
    const dl = [], ll = [];                          // the ladder's lens per frame (before() sees the previous frame's)
    const tr = hold({ x: 0, y }, 45, (i) => { if (i) { dl.push(c.occDist); ll.push(c.occLift); } if (ctx.state.playerAirborne) air++; });
    dl.push(c.occDist); ll.push(c.occLift);
    const a = tr[tr.length - 6], b = tr[tr.length - 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const dir = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    const P0 = pl().position, T = c.target;
    const e = edgeAlong({ x: P0.x, z: P0.z }, dir);
    const g0 = g.world.height(P0.x, P0.z), gE = g.world.height(P0.x + dir.x * e.dist, P0.z + dir.z * e.dist);
    const lead = c.lead;
    const hatY = _w.set(P0.x, P0.y + (c.params.occHead ?? 1.6), P0.z).project(C).y;
    return { ...e, speed: r(L * 6, 3), wantEdge: want, aimAhead: r((T.x - P0.x) * dir.x + (T.z - P0.z) * dir.z, 3),
      lead: lead ? r(Math.hypot(lead.x, lead.z), 3) : null,
      lensDist: r(C.position.distanceTo(T), 3), occDist: r(c.occDist, 3), goalDistance: num('goalDistance', 3), occLift: r(c.occLift, 4),
      minOccDist: r(Math.min(...dl), 3), maxOccLift: r(Math.max(...ll), 4),
      groundRiseToEdge: r(gE - g0, 3), groundRise: [5, 10, 15, 20, 25].map((s) => r(g.world.height(P0.x + dir.x * s, P0.z + dir.z * s) - g0, 2)),
      flatEdge: flatEdge(P0, dir, want), hatNdcY: r(hatY, 3), airborneFrames: air };
  }
  function a6() {
    const out = { status: 'ok', setup: 'mode 1 at (-110,-45), virtual (0,∓1.58) 45 frames, frames 0 (cam_walk_toward_lens / cam_walk_away)', checks: [] };
    for (const [label, y, want, lim] of [['toward', -1.58, 'bottom', 14], ['away', 1.58, 'top', 22]]) {
      const m = a6Run(MEADOW, y, want);
      out[label] = m;
      out.checks.push(chk(`${label}: ground to the ${want} edge (u)`, m.edge === want ? m.dist : null, '>=', lim));
    }
    out.note = 'The spec gate (checks) is measured with the camera as shipped. What limits it is in script a6x (run last, on the same page, so the scripts after a6 keep their page history).';
    return out;
  }
  /** Hold the OLD ladder's lens moves off for fn(): its collider pass sees no colliders (hidden from the
   *  camera's own update() / snap() only; the visitor still collides), the sweep's dolly floors sit at the full
   *  stop and every lift cap is 0. Fades, culls, the lead and everything else run as shipped. This is roughly
   *  the lens CAMERA_SPEC §5.2 leaves once the cut carries the frame (occDist released to the goal, no tilt).
   *  Restored in finally. (If the camera reads the ground core while airborne — hop damping — the core sees the
   *  hidden list for that call; a6Run reports airborneFrames so such a run is visible.) */
  function holdLadder(fn) {
    const c = cam(), U = c.update, S = c.snap, P = c.params;
    const keep = { occDollyFloor: P.occDollyFloor, occInstFloor: P.occInstFloor, occLiftMax: P.occLiftMax, occLiftPlinth: P.occLiftPlinth };
    const bare = (f) => function (...a) { const cols = ctx.colliders; ctx.colliders = []; try { return f.apply(this, a); } finally { ctx.colliders = cols; } };
    c.update = bare(U); c.snap = bare(S);
    c.setParams({ occDollyFloor: 1, occInstFloor: 1, occLiftMax: 0, occLiftPlinth: 0 });
    try { return fn(); } finally { c.update = U; c.snap = S; c.setParams(keep); }
  }
  /** The mode-1 lead zeroed for fn() (restored in finally). */
  function noLead(fn) {
    const c = cam(), P = c.params, keep = { leadToward: P.leadToward, leadAway: P.leadAway, leadSide: P.leadSide };
    if (keep.leadToward === undefined) return fn();
    c.setParams({ leadToward: 0, leadAway: 0, leadSide: 0 });
    try { return fn(); } finally { c.setParams(keep); }
  }
  // A6x — why A6 reads what it reads (informational: nothing here is a gate; `predict` says what the spec gate
  // would read once the old ladder stops moving the lens, i.e. after CAMERA_SPEC §8 step 5)
  function a6x() {
    const out = { status: 'ok', setup: 'the A6 protocol at (-110,-45), 4 variants per direction: as shipped · lead 0 · old ladder held off (holdLadder) · both; plus the away run on a flat line at (85,15)' };
    const pick = (m) => ({ dist: m.dist, edge: m.edge, flatEdge: m.flatEdge, aimAhead: m.aimAhead, lead: m.lead, occDist: m.occDist, occLift: m.occLift, minOccDist: m.minOccDist, maxOccLift: m.maxOccLift, hatNdcY: m.hatNdcY, airborneFrames: m.airborneFrames });
    const c0 = cam(), U0 = c0.update, S0 = c0.snap;
    const KEYS = ['occDollyFloor', 'occInstFloor', 'occLiftMax', 'occLiftPlinth', 'leadToward', 'leadAway', 'leadSide'];
    const before = JSON.stringify(KEYS.map((k) => c0.params[k]));
    out.predict = [];
    for (const [label, y, want, lim] of [['toward', -1.58, 'bottom', 14], ['away', 1.58, 'top', 22]]) {
      const shipped = a6Run(MEADOW, y, want);
      const lead0 = noLead(() => a6Run(MEADOW, y, want));
      const held = holdLadder(() => a6Run(MEADOW, y, want));
      const heldLead0 = holdLadder(() => noLead(() => a6Run(MEADOW, y, want)));
      out[label] = { shipped: pick(shipped), lead0: pick(lead0), ladderHeld: pick(held), ladderHeldLead0: pick(heldLead0), groundRise: shipped.groundRise,
        // what the lead adds to the edge distance, with the ladder as shipped and with it held off
        leadGain: r(shipped.dist - lead0.dist, 2), leadGainLadderHeld: r(held.dist - heldLead0.dist, 2),
        // what the old ladder takes off it (dolly + tilt), with the lead on
        ladderCost: r(held.dist - shipped.dist, 2) };
      out.predict.push(chk(`${label}: ground to the ${want} edge, old ladder held off (u)`, held.edge === want ? held.dist : null, '>=', lim));
      if (label === 'away') out.predict.push(chk('away: top edge on the flat plane through the feet, old ladder held off (u)', held.flatEdge, '>=', lim));
    }
    // the same away run on a flat line (ground within ±0.5 u out to 25 u), as shipped: the spec's 22 u is a flat-ground number
    const flat = a6Run({ pos: [85, 15], time: 12 }, 1.58, 'top');
    out.flatLineAway = { pos: [85, 15], ...pick(flat), groundRise: flat.groundRise };
    out.predict.push(chk('away on a flat line at (85,15), as shipped (u)', flat.edge === 'top' ? flat.dist : null, '>=', 22));
    // the camera is handed back exactly as it was (the variants patch update/snap and a few params)
    out.restored = cam().update === U0 && cam().snap === S0 && JSON.stringify(KEYS.map((k) => cam().params[k])) === before;
    if (!out.restored) out.status = 'error: the camera was not handed back as it was (update/snap/params)';
    return out;
  }

  // A7 — look-around (needs camera.look)
  function a7() {
    if (!impl.look) return NI('camera.look() does not exist');
    const c = cam(), inp = ctx.input;
    setup({ pos: [118, 0], time: 12, frames: 10 }, 1);
    const P0 = pl().position.clone();
    const ae0 = viewAE(), ch0 = centreHit();
    const pre = { az: ae0.az, el: ae0.el, dist: ch0 ? ch0.t : null, ctrl: get('controlAzimuth'), pAz: c.params.azimuth };
    c.look({ on: true, yaw: 0.6, pan: [0, 18] });
    g.step(30, 1 / 30);
    inp.keys.add('KeyW'); g.step(90, 1 / 30); inp.keys.delete('KeyW');
    const P1 = pl().position.clone();
    const ch1 = centreHit();
    const lookFromVisitor = ch1 ? Math.hypot(ch1.x - P1.x, ch1.z - P1.z) : null;
    const moved = Math.hypot(P1.x - P0.x, P1.z - P0.z);
    c.look({ on: false });
    const tr = [];
    for (let i = 0; i < 30; i++) { g.step(1, 1 / 30); const ae = viewAE(), ch = centreHit(); tr.push({ az: ae.az, el: ae.el, dist: ch ? ch.t : null }); }
    const at = tr[17];                               // 0.6 s after release
    const yr = []; for (let i = 1; i < tr.length; i++) yr.push(Math.abs(wrap(tr[i].az - tr[i - 1].az)) * 30);
    const ctrl1 = get('controlAzimuth'), pAz1 = c.params.azimuth;
    // a V press with no mouse motion: stale motion first (endFrame must zero it), then hold V 20 frames
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 700, clientY: 500, bubbles: true, pointerType: 'mouse', buttons: 0 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 760, clientY: 520, bubbles: true, pointerType: 'mouse', buttons: 0 }));
    g.step(1, 1 / 30);
    const azV0 = viewAE().az;
    inp.pressed.add('KeyV'); inp.keys.add('KeyV'); g.step(20, 1 / 30);
    const azV1 = viewAE().az, lookYaw = get('lookYaw');
    inp.keys.delete('KeyV'); g.step(20, 1 / 30);
    return {
      status: 'ok', moved: r(moved, 4), lookFromVisitor: r(lookFromVisitor, 3),
      at0_6s: { daz: r(Math.abs(wrap(at.az - pre.az)), 4), del: r(Math.abs(at.el - pre.el), 4), distRatio: pre.dist && at.dist ? r(at.dist / pre.dist, 4) : null },
      maxReturnYawRate: r(maxOf(yr), 4), ctrlChange: pre.ctrl === null ? null : r(Math.abs(wrap(ctrl1 - pre.ctrl)), 6), pAzChange: r(Math.abs(wrap(pAz1 - pre.pAz)), 6),
      vNoMotion: { azChange: r(Math.abs(wrap(azV1 - azV0)), 6), lookYaw: lookYaw },
      checks: [
        chk('visitor moves (u)', moved, '<', 0.05), chk('look point ≥ 18 u', lookFromVisitor, '>=', 18), chk('look point ≤ 40 u', lookFromVisitor, '<=', 40),
        chk('az back within 0.6 s (rad)', Math.abs(wrap(at.az - pre.az)), '<=', 0.02), chk('el back within 0.6 s (rad)', Math.abs(at.el - pre.el), '<=', 0.02),
        chk('dist back within 0.6 s (|ratio−1|)', pre.dist && at.dist ? Math.abs(at.dist / pre.dist - 1) : null, '<=', 0.02),
        chk('return yaw rate (rad/s)', maxOf(yr), '<=', 2.5),
        chk('controlAzimuth unchanged', pre.ctrl === null ? null : Math.abs(wrap(ctrl1 - pre.ctrl)), '<=', 1e-6),
        chk('params.azimuth unchanged', Math.abs(wrap(pAz1 - pre.pAz)), '<=', 1e-6),
        chk('V with no motion: yaw change', Math.abs(wrap(azV1 - azV0)), '<=', 1e-6),
      ],
    };
  }

  // A8 — tap V recentre
  function tapV() { const inp = ctx.input; inp.pressed.add('KeyV'); inp.keys.add('KeyV'); g.step(3, 1 / 30); inp.keys.delete('KeyV'); }
  function a8() {
    if (!impl.recentre && !impl.look) return NI('no V handling / camera.recentre()');
    const c = cam(), f = 2.0;
    const out = { status: 'ok', facing: f, checks: [] };
    // mode 1
    settle(1, MEADOW, f);
    const want = Math.round((f + Math.PI) / (Math.PI / 4)) * (Math.PI / 4);
    tapV();
    const tr1 = []; for (let i = 0; i < 11; i++) { g.step(1, 1 / 30); tr1.push({ pAz: c.params.azimuth, az: viewAE().az }); }
    const e1 = Math.abs(wrap(tr1[10].pAz - want)), e1v = Math.abs(wrap(tr1[10].az - want));
    out.mode1 = { want: r(wrap(want), 4), pAzErr: r(e1, 5), viewAzErr: r(e1v, 5) };
    out.checks.push(chk('m1: params.azimuth = 45° multiple nearest f+π by 0.45 s', e1, '<=', 1e-3));
    // mode 2 from a 90° offset (one-frame orbit drag of 262 px)
    settle(2, MEADOW, f);
    const pt = ctx.input.pointer, hadOrbit = 'orbit' in pt;
    pt.orbit = true; pt.dragDX = 262; g.step(1, 1 / 30); pt.orbit = false; if (!hadOrbit) delete pt.orbit;
    g.step(15, 1 / 30);
    const off0 = Math.abs(wrap(viewAE().az - (f + Math.PI)));
    tapV();
    const tr2 = []; for (let i = 0; i < 21; i++) { g.step(1, 1 / 30); tr2.push(viewAE().az); }
    const e2 = Math.abs(wrap(tr2[20] - (f + Math.PI)));
    const rr = []; for (let i = 1; i < tr2.length; i++) rr.push(Math.abs(wrap(tr2[i] - tr2[i - 1])) * 30);
    out.mode2 = { offsetBefore: r(off0, 4), errAt0_8s: r(e2, 4), maxRate: r(maxOf(rr), 4) };
    out.checks.push(chk('m2: offset before tap ≈ 90°', off0, '>=', 1.2));
    out.checks.push(chk('m2: az within 0.05 of f+π by 0.8 s', e2, '<=', 0.05));
    out.checks.push(chk('m2: recentre rate (rad/s)', maxOf(rr), '<=', 3));
    return out;
  }

  // A7x — the look's edges (camera step 6 fix; runs LAST on the page, after a6x, so every other script keeps its page
  // history; it ends in the air). (1) The lens rides the look's own distance: a zoom-0.7 look is back within 2% at
  // 0.6 s after the release (§3 λ8, A7's own tolerance), look({zoom:1.6}) is at 1.6× by the 2nd frame, the wheel
  // while V is held moves a goal the zoom follows at λ lookIn with the lens on it, and a look begun on a DOLLIED lens
  // (a synthetic noCut wall on the sight line) never jumps — and comes HOME onto the dolly: within 2% of the pre-look
  // lens 0.6 s after the release, no return frame faster than the λ8 return, no pop once the look is over (step 6
  // fix 2; the same at occ_silhouette in mode 2, the natural dolly row, when it still starts dollied).
  // (2) playerScreen across the lens plane: a forward pan to 37.5 / 38 / 39.5 /
  // 40 u at (118,0) keeps him BELOW the frame (0 < depth ≤ near must not be un-flipped). (3) The vehicle / flying look
  // (§3): V + mouse while flying (debugFly): look on, veh, fov → lookFovVeh (48) at ≤ fovRate °/s, moveLock 0, pan 0,
  // the mouse feeds lookYaw, a flap (Space) does not end it, release eases home, params.azimuth unchanged.
  function a7x(occV) {
    if (!impl.look) return NI('camera.look() does not exist');
    const c = cam(), inp = ctx.input, out = { status: 'ok', checks: [] };
    const d2t = () => C.position.distanceTo(c.target);
    // The way home from a look begun on a dollied lens (l0 = the pre-look lens): n frames after look({on:false}).
    // λ8 bound: no frame may move the lens more than the λ8 return of the whole gap would on its first frame
    // (+5% and 0.02 u for the aim's own motion); `after`: the largest step once camera.looking is back to 0.
    const F8 = 1 - Math.exp(-8 / 30);
    function homeTrace(l0, n) {
      const lRel = d2t(), tr = [];
      for (let i = 0; i < n; i++) { g.step(1, 1 / 30); tr.push({ d: d2t(), k: get('looking') }); }
      const allow = Math.abs(lRel - l0) * F8 * 1.05 + 0.02;
      let maxStep = 0, prev = lRel; for (const x of tr) { maxStep = Math.max(maxStep, Math.abs(x.d - prev)); prev = x.d; }
      const endAt = tr.findIndex((x) => x.k === 0);
      let after = null; if (endAt >= 0) { after = 0; for (let i = endAt + 1; i < tr.length; i++) after = Math.max(after, Math.abs(tr[i].d - tr[i - 1].d)); }
      return { atRelease: r(lRel / l0, 4), at0_37s: r(tr[10].d / l0, 4), at0_6s: r(tr[17].d / l0, 4), at1_0s: r(tr[29].d / l0, 4), atEnd: r(tr[n - 1].d / l0, 4),
        maxStep: r(maxStep, 4), allowed: r(allow, 4), lookEndsFrame: endAt, maxStepAfter: r(after, 4), _err06: Math.abs(tr[17].d / l0 - 1), _excess: maxStep - allow, _after: after };
    }
    function homeChecks(tag, h) {
      out.checks.push(chk(`${tag}: lens/pre-look within 2% at 0.6 s after the release (|ratio−1|)`, h._err06, '<=', 0.02));
      out.checks.push(chk(`${tag}: no return frame faster than the λ8 return (u, excess)`, h._excess, '<=', 0));
      out.checks.push(chk(`${tag}: no pop once the look is over (max step, u)`, h._after, '<=', 0.05));
      delete h._err06; delete h._excess; delete h._after;
    }
    const zoomOf = () => { const s = c.lookState; return s && typeof s.zoom === 'number' ? s.zoom : null; };
    // (1a) zoom 0.7 for 1 s, release · (1b) zoom 1.6 at once
    setup({ ...MEADOW, frames: 30 }, 1);
    let d0 = d2t();
    c.look({ on: true, zoom: 0.7 }); g.step(30, 1 / 30);
    const dIn = d2t();
    c.look({ on: false });
    const tr = []; for (let i = 0; i < 30; i++) { g.step(1, 1 / 30); tr.push({ d: d2t() / d0, z: zoomOf() }); }
    let track = 0; for (const x of tr) if (x.z) track = Math.max(track, Math.abs(x.d / x.z - 1));
    out.zoomOut = { lensIn: r(dIn / d0, 4), at0_37s: r(tr[10].d, 4), at0_6s: r(tr[17].d, 4), at1_0s: r(tr[29].d, 4), maxLensVsZoom: r(track, 4) };
    out.checks.push(chk('zoom 0.7 look: lens back within 2% at 0.6 s (|ratio−1|)', Math.abs(tr[17].d - 1), '<=', 0.02));
    out.checks.push(chk('zoom 0.7 return: lens rides the look zoom (max |lens/zoom − 1|)', track, '<=', 0.02));
    setup({ ...MEADOW, frames: 30 }, 1);
    d0 = d2t();
    c.look({ on: true, zoom: 1.6 }); g.step(2, 1 / 30);
    const d2 = d2t() / d0;
    c.look({ on: false }); g.step(30, 1 / 30);
    out.zoomHook = { at2frames: r(d2, 4) };
    out.checks.push(chk('look({zoom:1.6}): lens at 1.6× by frame 2 (|ratio/1.6 − 1|)', Math.abs(d2 / 1.6 - 1), '<=', 0.02));
    // (1c) the wheel while V is held
    setup({ ...MEADOW, frames: 30 }, 1);
    d0 = d2t();
    inp.pressed.add('KeyV'); inp.keys.add('KeyV'); g.step(8, 1 / 30);
    inp.wheel = 300; g.step(1, 1 / 30);
    const wt = []; for (let i = 0; i < 20; i++) { g.step(1, 1 / 30); wt.push({ d: d2t() / d0, z: zoomOf() }); }
    inp.keys.delete('KeyV'); g.step(30, 1 / 30);
    let wTrack = 0, wStep = 0; for (let i = 0; i < wt.length; i++) { if (wt[i].z) wTrack = Math.max(wTrack, Math.abs(wt[i].d / wt[i].z - 1)); if (i) wStep = Math.max(wStep, Math.abs(wt[i].d - wt[i - 1].d)); }
    const goalW = Math.exp(300 * 0.035 / 31);
    out.wheel = { goal: r(goalW, 4), lensAt0_33s: r(wt[9].d, 4), lensAt0_67s: r(wt[19].d, 4), maxLensVsZoom: r(wTrack, 4), maxStepPerFrame: r(wStep, 4) };
    out.checks.push(chk('V + wheel 300 px: lens at the goal ×1.403 within 2% by 0.67 s', Math.abs(wt[19].d / goalW - 1), '<=', 0.02));
    out.checks.push(chk('V + wheel: lens rides the look zoom (max |lens/zoom − 1|)', wTrack, '<=', 0.02));
    // (1d) a look begun on a DOLLIED lens: a synthetic unpatched (noCut) 16 × 30 × 1 wall 24 u up the lens line
    // from the aim at MEADOW (mode 1) — the window may not cut it, so the sweep's rule-2 dolly pulls the lens in
    // front of it (with the sweep's triangle budget lifted for the script: a fresh 12-triangle mesh otherwise waits
    // for the round-robin cursor, several seconds behind the merged districts) — then a look. While the look holds
    // the ladder the dolly releases at its own λ3.5, as before this fix: the first frame may move the lens by
    // (dist − occDist)·(1 − e^(−3.5/30)) and no more (the naive occDist = dist would jump the whole gap at once).
    // The wall and the budget are put back afterwards.
    setup({ ...MEADOW, frames: 30 }, 1);
    const B0 = c.params.occBudget;
    const tg = c.target, azW = c.current.azimuth, elW = c.current.elevation, hd = 24 * Math.cos(elW);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 30, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    wall.name = 'camvis_a7x_wall'; wall.userData.noCut = true;
    wall.position.set(tg.x + Math.sin(azW) * hd, tg.y + 24 * Math.sin(elW), tg.z + Math.cos(azW) * hd); wall.rotation.y = azW;
    let od0 = null, gd0 = null, l0 = null, first = null, jump = 0, lens1s = null;
    try {
      c.params.occBudget = 1e9;
      ctx.scene.add(wall); wall.updateMatrixWorld(true);
      g.step(45, 1 / 30);
      od0 = get('occDist'); gd0 = get('goalDistance'); l0 = d2t();
      c.look({ on: true });
      let prev = l0;
      for (let i = 0; i < 30; i++) { g.step(1, 1 / 30); const d = d2t(); if (i === 0) first = Math.abs(d - l0); else jump = Math.max(jump, Math.abs(d - prev)); prev = d; }
      lens1s = prev;
      c.look({ on: false });
      out.dollied_home = homeTrace(l0, 45);
    } finally {
      ctx.scene.remove(wall); wall.geometry.dispose(); wall.material.dispose(); c.params.occBudget = B0;
    }
    g.step(30, 1 / 30);
    const gap = gd0 !== null && od0 !== null ? gd0 - od0 : null;
    const allow = gap !== null ? gap * (1 - Math.exp(-3.5 / 30)) + 0.1 : null;
    out.dollied = { occDist0: r(od0, 3), goal: r(gd0, 3), lens0: r(l0, 3), firstFrame: r(first, 4), allowed: r(allow, 4), naiveJump: r(gap, 3), laterMaxStep: r(jump, 4), lens1s: r(lens1s, 3) };
    out.checks.push(chk('look on a dollied lens: the wall dollied the lens first (goal − occDist, u)', gap, '>=', 3));
    out.checks.push(chk('look on a dollied lens: first-frame lens move ≤ the dolly\'s λ3.5 release (u, excess)', first !== null && allow !== null ? first - allow : null, '<=', 0));
    out.checks.push(chk('look on a dollied lens: no later frame moves more than the first (u, excess)', first !== null ? jump - first : null, '<=', 1e-3));
    if (out.dollied_home) homeChecks('look on a dollied lens, the way home', out.dollied_home);
    // (1e) the natural dolly row: occ_silhouette in mode 2 (the §1 order), a plain look for 1 s, then home. Its dolly
    // comes from the Great Cupcake shell (noFade, so the window may not cut it); if that ever changes (the requested
    // noGhost edit), the row no longer starts dollied and these checks are reported n/a — (1d) still covers it.
    if (occV && occV.pos) {
      setup(occV, 2);
      const l0e = d2t(), od = get('occDist'), gd = get('goalDistance');
      const pre = { lens0: r(l0e, 3), occDist0: r(od, 3), goal: r(gd, 3) };
      if (!(gd - l0e >= 2)) out.dolliedOcc = { ...pre, na: 'occ_silhouette m2 no longer starts dollied (goal − lens < 2 u): n/a, see (1d)' };
      else {
        c.look({ on: true }); g.step(30, 1 / 30);
        c.look({ on: false });
        const h = homeTrace(l0e, 60);
        out.dolliedOcc = { ...pre, ...h };
        homeChecks('occ_silhouette m2, a look on its dollied lens', out.dolliedOcc);
      }
    } else out.dolliedOcc = { na: 'no occ_silhouette view' };
    // (2) playerScreen across the lens plane
    setup({ pos: [118, 0], time: 12, frames: 30 }, 1);
    const sz = new THREE.Vector2(); ctx.renderer.getSize(sz);
    out.playerScreen = [];
    for (const dz of [37.5, 38, 39.5, 40]) {
      c.look({ on: true, pan: [0, dz] }); g.step(10, 1 / 30);
      const ps = c.playerScreen, e = C.matrixWorld.elements, P = pl().position;
      const depth = -((P.x - e[12]) * e[8] + (P.y - e[13]) * e[9] + (P.z - e[14]) * e[10]);
      out.playerScreen.push({ pan: dz, depth: r(depth, 4), x: r(ps.x, 1), y: r(ps.y, 1), on: ps.on });
      out.checks.push(chk(`pan [0,${dz}]: his feet below the frame (playerScreen.y − h, px)`, ps.on ? -1 : ps.y - sz.y, '>', 0));
      c.look({ on: false }); g.step(30, 1 / 30);
    }
    // (3) the vehicle / flying look, synthetic keys (the real-key run is tools/_tmp/fx6/proof.mjs)
    const fly = resolveFn('escape.routes.flyer.debugFly');
    if (!fly) { out.flying = 'no escape.routes.flyer.debugFly'; out.checks.push(chk('flying look: debugFly exists', false, '==', true)); return out; }
    setup({ pos: [206.4, 6], time: 12, frames: 0 }, 1, { noStep: true });
    fly.fn.call(fly.o, 206.4, 6, 60, -1.5708, true); g.step(40, 1 / 30);
    const pAz0 = c.params.azimuth, fov0 = C.fov;
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 800, clientY: 500, bubbles: true, pointerType: 'mouse', buttons: 0 }));
    g.step(1, 1 / 30);
    inp.pressed.add('KeyV'); inp.keys.add('KeyV');
    const ft = []; let lock = 0, pan = 0;
    for (let i = 0; i < 30; i++) { g.step(1, 1 / 30); const s = c.lookState; ft.push(C.fov); lock = Math.max(lock, inp.moveLock || 0); pan = Math.max(pan, Math.hypot(s.pan[0], s.pan[1])); }
    const sOn = c.lookState, y0 = c.lookYaw;
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: 500, bubbles: true, pointerType: 'mouse', buttons: 0 }));
    g.step(1, 1 / 30);
    const dYaw = c.lookYaw - y0;
    inp.pressed.add('Space'); g.step(1, 1 / 30); g.step(5, 1 / 30);
    const afterFlap = c.lookState.on;
    inp.keys.delete('KeyV');
    const yr = []; let py = c.lookYaw;
    for (let i = 0; i < 40; i++) { g.step(1, 1 / 30); ft.push(C.fov); yr.push(Math.abs(c.lookYaw - py) * 30); py = c.lookYaw; }
    let fr = 0; for (let i = 1; i < ft.length; i++) fr = Math.max(fr, Math.abs(ft[i] - ft[i - 1]) * 30);
    out.flying = { flying: !!ctx.state.flying, on: sOn.on, veh: sOn.veh, fov0: r(fov0, 2), fovAt1s: r(ft[29], 2), maxFovRate: r(fr, 2), moveLock: lock, pan: r(pan, 4), mouseDYaw: r(dYaw, 4),
      onAfterFlap: afterFlap, lookYawEnd: r(c.lookYaw, 5), lookingEnd: r(c.looking, 5), maxReturnRate: r(maxOf(yr), 3), pAzChange: r(Math.abs(wrap(c.params.azimuth - pAz0)), 6) };
    out.checks.push(chk('flying: V starts the vehicle look (on && veh)', !!(sOn.on && sOn.veh), '==', true));
    out.checks.push(chk('flying look: fov toward lookFovVeh 48 (fov at 1 s)', ft[29], '>=', 47));
    out.checks.push(chk('flying look: fov rate (°/s)', fr, '<=', 12.01));
    out.checks.push(chk('flying look: moveLock', lock, '==', 0));
    out.checks.push(chk('flying look: no pan (u)', pan, '<=', 0));
    out.checks.push(chk('flying look: mouse 100 px feeds lookYaw (|Δ + 0.55|)', Math.abs(dYaw + 0.55), '<=', 1e-6));
    out.checks.push(chk('flying look: a flap (Space) does not end it', afterFlap, '==', true));
    out.checks.push(chk('flying look: home after release (|lookYaw|, 1.3 s)', Math.abs(c.lookYaw), '<=', 1e-6));
    out.checks.push(chk('flying look: return rate (rad/s)', maxOf(yr), '<=', 2.5));
    out.checks.push(chk('flying look: params.azimuth unchanged', Math.abs(wrap(c.params.azimuth - pAz0)), '<=', 1e-6));
    return out;
  }

  // A9 — mouse buttons and touch-style writes
  function a9() {
    const c = cam(), inp = ctx.input, pt = inp.pointer, cv = ctx.renderer.domElement;
    const hadOrbit = 'orbit' in pt;
    const inv = ctx.systems.inventory;
    const prevHeld = inv?.held ?? null;
    let uses = 0;
    const off = ctx.events.on('weapon:use', () => { uses++; });
    try { inv?.give?.('bat'); } catch { /* inventory optional */ }
    const held = inv?.held ?? null;
    setup({ ...MEADOW, frames: 5 }, 1);
    const pe = (type, button, buttons, x, y, target = cv) => {
      const ev = new PointerEvent(type, { bubbles: true, cancelable: true, button, buttons, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true });
      target.dispatchEvent(ev); return ev;
    };
    const out = { status: impl.orbit ? 'ok' : 'not implemented yet', implemented: impl.orbit, held, checks: [] };
    // 1) right-button drag of 100 px
    let u0 = uses; const az0 = c.params.azimuth;
    pe('pointerdown', 2, 2, 800, 500); g.step(1, 1 / 30);
    pe('pointermove', -1, 2, 900, 500, window); g.step(1, 1 / 30);
    pe('pointerup', 2, 0, 900, 500, window); g.step(10, 1 / 30);
    const dAz = Math.abs(wrap(c.params.azimuth - az0));
    const ctxm = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, buttons: 0, clientX: 900, clientY: 500 });
    cv.dispatchEvent(ctxm);
    out.rightDrag = { uses: uses - u0, dAz: r(dAz, 5), want: 0.6, contextmenuPrevented: ctxm.defaultPrevented };
    out.checks.push(chk('right drag: weapon:use', uses - u0, '==', 0));
    out.checks.push(chk('right drag: contextmenu defaultPrevented', ctxm.defaultPrevented, '==', true));
    out.checks.push(chk('right drag 100 px: ||Δaz| − 0.6| (az change = 0.006·dx)', Math.abs(dAz - 0.6), '<=', 1e-3));
    // 1b) right tap (no drag) — the "never uses the item" case (informational)
    u0 = uses; pe('pointerdown', 2, 2, 800, 500); g.step(2, 1 / 30); pe('pointerup', 2, 0, 800, 500, window); g.step(10, 1 / 30);
    out.rightTapUses = uses - u0;
    // 2) middle button
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 1, buttons: 4, clientX: 800, clientY: 500 });
    cv.dispatchEvent(md);
    const ax = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1, buttons: 0, clientX: 800, clientY: 500 });
    cv.dispatchEvent(ax);
    pe('pointerup', 1, 0, 800, 500, window); g.step(2, 1 / 30);
    out.middle = { mousedownPrevented: md.defaultPrevented, auxclickPrevented: ax.defaultPrevented };
    out.checks.push(chk('middle mousedown defaultPrevented', md.defaultPrevented, '==', true));
    // 3) left click still fires
    g.step(30, 1 / 30);
    u0 = uses; pe('pointerdown', 0, 1, 800, 500); g.step(2, 1 / 30); pe('pointerup', 0, 0, 800, 500, window); g.step(10, 1 / 30);
    out.leftClickUses = uses - u0;
    out.checks.push(chk('left click fires (weapon:use)', uses - u0, '>=', 1));
    // 4) left held while the right button goes down and up
    g.step(30, 1 / 30);
    // Counted through frame 10: a spurious release-trigger at the right-up (frame 2) lands its melee
    // 'weapon:use' ~6 frames later (DUR 0.5 × RELEASE 0.34); a genuine hold-fire cannot start before
    // pT > 0.25 s (frame 7) and would land ~frame 13, outside the window.
    u0 = uses; pe('pointerdown', 0, 1, 800, 500); g.step(1, 1 / 30);
    pe('pointerdown', 2, 3, 800, 500); g.step(1, 1 / 30);
    pe('pointerup', 2, 1, 800, 500, window); g.step(1, 1 / 30);
    const downAfter = pt.down;
    g.step(8, 1 / 30);
    const usesHeld = uses - u0;
    pe('pointerup', 0, 0, 800, 500, window); g.step(30, 1 / 30);
    out.leftHeldRight = { pointerDownStays: downAfter, uses: usesHeld };
    out.checks.push(chk('left held + right press/release: pointer.down stays', downAfter, '==', true));
    out.checks.push(chk('left held + right press/release: weapon:use', usesHeld, '==', 0));
    // 5) touch-style writes both orbit
    let a0 = c.params.azimuth; pt.down = true; pt.dragDX = 50; g.step(1, 1 / 30); pt.down = false; g.step(1, 1 / 30);
    const dDown = Math.abs(wrap(c.params.azimuth - a0));
    a0 = c.params.azimuth; pt.orbit = true; pt.dragDX = 50; g.step(1, 1 / 30); pt.orbit = false; g.step(1, 1 / 30);
    const dOrbit = Math.abs(wrap(c.params.azimuth - a0));
    if (!hadOrbit) delete pt.orbit;
    out.touch = { downOrbit: r(dDown, 5), orbitOrbit: r(dOrbit, 5), want: 0.3 };
    out.checks.push(chk('touch pointer.down + 50 px: ||Δaz| − 0.3|', Math.abs(dDown - 0.3), '<=', 1e-3));
    out.checks.push(chk('touch pointer.orbit + 50 px: ||Δaz| − 0.3|', Math.abs(dOrbit - 0.3), '<=', 1e-3));
    off();
    try { if (inv && inv.held !== prevHeld) inv.held = prevHeld; } catch { /* keep going */ }
    return out;
  }

  // A10 — rate guards on route R
  function a10(modes) {
    const out = { status: 'ok', route: 'teleport (178,48) walk W 300 frames; teleport (-200,-20) walk W 300 frames', modes: {}, checks: [] };
    for (const m of modes) {
      const legs = [];
      let yawMax = 0, yawSum = 0, elMax = 0, fovMax = 0, whMax = 0;
      const yawAll = [], elAll = [];
      for (const leg of [{ pos: [178, 48], time: 15 }, { pos: [-200, -20], time: 14 }]) {
        setup({ ...leg, frames: 0 }, m, { noStep: true });
        const tr = hold({ x: 0, y: 1 }, 300);
        const yr = [], er = [], fr = [], wr = [];
        for (let i = 1; i < tr.length; i++) {
          if (tr[i].cine || tr[i].flying || tr[i - 1].cine) continue;
          yr.push(Math.abs(wrap(tr[i].az - tr[i - 1].az)) * 30);
          er.push(Math.abs(tr[i].el - tr[i - 1].el) * 30);
          fr.push(Math.abs(tr[i].fov - tr[i - 1].fov) * 30);
          if (typeof tr[i].occYaw === 'number' && typeof tr[i - 1].occYaw === 'number') wr.push(Math.abs(tr[i].occYaw - tr[i - 1].occYaw) * 30);
        }
        const P0 = tr[0], P1 = tr[tr.length - 1];
        legs.push({ from: leg.pos, net: r(Math.hypot(P1.x - P0.x, P1.z - P0.z), 2), yawMax: r(maxOf(yr), 4), yawSum: r(sumOf(yr) / 30, 6), yawP95: r(pct(yr, 0.95), 4),
          elMax: r(maxOf(er), 4), elP95: r(pct(er, 0.95), 4), fovMax: r(maxOf(fr), 4), whiskerMax: wr.length ? r(maxOf(wr), 4) : null,
          curElRateMax: r(maxOf(rates(tr, 'curEl')), 4), occLiftRateMax: r(maxOf(tr.slice(1).map((p, i) => Math.abs(p.occLift - tr[i].occLift) * 30)), 4) });
        yawMax = Math.max(yawMax, maxOf(yr)); yawSum += sumOf(yr) / 30; elMax = Math.max(elMax, maxOf(er)); fovMax = Math.max(fovMax, maxOf(fr)); whMax = Math.max(whMax, maxOf(wr));
        yawAll.push(...yr); elAll.push(...er);
      }
      out.modes[m] = { legs, yawMax: r(yawMax, 4), yawSum: r(yawSum, 6), elMax: r(elMax, 4), fovMaxDegS: r(fovMax, 4), elFramesOverCap: elAll.filter((x) => x > 0.15).length, yawFramesOverCap: yawAll.filter((x) => x > 1.1).length };
      out.checks.push(chk(`m${m}: auto yaw (rad/s)`, yawMax, '<=', 1.1));
      out.checks.push(chk(`m${m}: auto elevation (rad/s)`, elMax, '<=', 0.15));
      out.checks.push(chk(`m${m}: FOV rate (°/s)`, fovMax, '<=', 12));
      if (m !== 2) out.checks.push(chk(`m${m}: auto yaw Σ|Δaz| (exactly 0)`, yawSum, '<=', 1e-9));
      else out.checks.push(chk('m2: whisker yaw (rad/s)', typeof whMax === 'number' && whMax > 0 ? whMax : (get('occYaw') === null ? null : 0), '<=', 0.5));
    }
    return out;
  }

  // §7 checks
  /**
   * Mode-2 horizon (§2 m2Pitch, A15 sky band; s7 (h), or alone as "--script horizon"): the three
   * follow views, walked frame by frame in mode 2.
   *   · geometric: once the 1→2 lens/pitch ease has settled (from frame 30) the band between the top
   *     frame edge and the lens's horizontal, (1 − tan(down)/tan(half))/2, must stay ≥ 4% however far
   *     the ladder lifts the lens, and the visitor's feet must stay on screen (projected y ≤ 0.92);
   *   · rendered (§8 step 2 "sky band visible"): at the last frame, skyBand() counts the band pixels
   *     that actually show sky; the open sky must cover ≥ SKY_OPEN_MIN % of the frame, i.e. at least
   *     as much sky as an unobstructed A15 band of 4% of the frame height. The geometric check is the
   *     pitch's job; this one also fails when the world stands above the lens inside the band (Lollipop
   *     Meadow's giant heads, over a follow lens that is 8-11 u up), which no pitch can fix.
   */
  const SKY_OPEN_MIN = 4;           // open sky, % of the frame (A15's 4% band)
  function horizon(V) {
    const c = cam(), res = [];
    for (const nm of ['cam_follow_strafe', 'cam_follow_backpedal', 'cam_follow_street']) {
      const v = V[nm]; if (!v) { res.push({ view: nm, status: 'view missing' }); continue; }
      const calls = setup({ ...v, frames: 0 }, 2, { noStep: true, forceMode: true });
      const tr = []; const Pp = pl().position;
      const off = ctx.events.on('camera:update', () => {
        fwd(_f); const down = -elevOf(_f), half = C.fov * Math.PI / 360;
        const band = half - down > 0 ? (1 - Math.tan(down) / Math.tan(half)) / 2 : 0;
        _w.set(Pp.x, Pp.y, Pp.z).project(C);
        tr.push({ band, top: half - down, lift: c.occLift, feet: (1 - _w.y) / 2 });
      });
      const n = v.walk ? (v.walk.n || 30) : (v.frames ?? 45);
      for (let i = 0; i < n; i++) { ctx.input.virtual = v.walk ? { x: v.walk.x, y: v.walk.y } : { x: 0, y: 0 }; g.step(1, 1 / 30); }
      ctx.input.virtual = { x: 0, y: 0 };
      off();
      const late = tr.slice(30);
      const minBand = late.length ? Math.min(...late.map((x) => x.band)) : null, maxFeet = late.length ? Math.max(...late.map((x) => x.feet)) : null;
      const last = tr[tr.length - 1] || {};
      ctx.scene.updateMatrixWorld(true);
      const bv = c.bodyVisibility();
      const lensUp = C.position.y - g.world.height(Pp.x, Pp.z);
      const sky = skyBand();
      res.push({ view: nm, calls, frames: tr.length, minBandFrom30: r(minBand, 4), maxLiftFrom30: r(maxOf(late.map((x) => x.lift)), 4), maxFeetFrom30: r(maxFeet, 3),
        end: { band: r(last.band, 4), top: r(last.top, 4), lift: r(last.lift, 4), feet: r(last.feet, 3), occDist: r(c.occDist, 2), goalDist: r(c.goalDistance, 2), lensAboveFeet: r(lensUp, 2), vis: bv.visible, by: bv.rays.filter((x) => !x.clear).map((x) => x.pt + ':' + x.by[0]) },
        sky,
        checks: [chk(`${nm} m2: geometric sky band, min over frames 30..${tr.length}`, minBand, '>=', 0.04), chk(`${nm} m2: visitor's feet on screen (max projected y)`, maxFeet, '<=', 0.92),
          chk(`${nm} m2: rendered open sky in the band, % of the frame (last frame; A15 band 4%)`, sky.openFramePct, '>=', SKY_OPEN_MIN)] });
    }
    return res;
  }

  /**
   * SWAY (--script sway; CAMERA_SPEC §8 step 4, §10 "a vegetation frame that stops swaying means the
   * previous hook was not called first"): at candy_forest, only the vegetation / cat-nature meshes are
   * drawn, twice, one simulation frame (1/30 s) apart with the lens held still; the wind must move pixels.
   * Also reports how many of those meshes the see-through window patched. Visibility is put back.
   */
  function sway() {
    const R = ctx.renderer, gl = R.getContext(), c = cam();
    setup({ pos: [-200, -20], time: 14, frames: 45 }, 1);
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const veg = []; ctx.scene.traverse((o) => { if (o.isMesh && /^(candyveg_|cat_nature_)/.test(o.name || '')) veg.push(o); });
    const keep = new Set(); for (const o of veg) for (let n = o; n; n = n.parent) keep.add(n);
    const vis0 = []; ctx.scene.traverse((o) => { vis0.push(o, o.visible); });
    const only = () => ctx.scene.traverse((o) => { if (!keep.has(o) && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) o.visible = false; });
    const read = () => { R.render(ctx.scene, C); const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    let A, B;
    const pos = C.position.clone(), q = C.quaternion.clone();
    try {
      delete ctx.renderOverride; only(); A = read();
      ctx.renderOverride = NOOP;
      for (let i = 0; i < vis0.length; i += 2) vis0[i].visible = vis0[i + 1];
      g.step(1, 1 / 30);
      C.position.copy(pos); C.quaternion.copy(q); C.updateMatrixWorld(true);
      delete ctx.renderOverride; only(); B = read();
    } finally {
      ctx.renderOverride = NOOP;
      for (let i = 0; i < vis0.length; i += 2) vis0[i].visible = vis0[i + 1];
    }
    let moved = 0;
    for (let k = 0; k < A.length; k += 4) if (Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1]) + Math.abs(A[k + 2] - B[k + 2]) > 6) moved++;
    const patched = impl.isPatched ? veg.filter((o) => isPatched(o) === true).length : null;
    return { status: 'ok', vegMeshes: veg.length, patched, movedPx: moved, movedFrac: r(moved / (W * H), 4),
      checks: [chk('vegetation pixels that move in one 1/30 s step (lens still)', moved, '>', 1000)] };
  }

  function s7(V) {
    const out = { status: 'ok' };
    const c = cam();
    // (a) scene traversal: NEVER_FADE / noCut / noFade meshes are never cut
    {
      const NEVER = /^(sugarfin|whale|ferry)/i;
      let prot = 0, never = 0, flagged = 0; const bad = [];
      ctx.scene.traverse((o) => {
        if (!o.isMesh) return;
        let isNever = false, isFlag = false;
        for (let n = o; n; n = n.parent) { if (NEVER.test(n.name || '')) isNever = true; if (n.userData && (n.userData.noCut || n.userData.noFade)) isFlag = true; }
        if (!isNever && !isFlag) return;
        prot++; if (isNever) never++; if (isFlag) flagged++;
        if (impl.isPatched && isPatched(o) === true && bad.length < 20) bad.push(o.name || o.type);
      });
      out.traversal = impl.isPatched ? { status: 'ok', protectedMeshes: prot, neverFade: never, flagged, patchedViolations: bad, checks: [chk('protected meshes patched', bad.length, '==', 0)] }
        : { ...NI('camera.cutout.isPatched(o) does not exist (nothing is patched today)'), protectedMeshes: prot, neverFade: never, flagged };
    }
    // (b) ferry_deck in mode 1: no ferry mesh counted as cut-clear
    if (V.ferry_deck) {
      const calls = setup(V.ferry_deck, 1);
      const bv = c.bodyVisibility();
      const bad = bv.rays.filter((x) => x.clear && x.rawClear === false && (x.by || []).some((b) => /sugarfin|whale|ferry/i.test(b))).map((x) => x.pt);
      out.ferryDeck = { calls, free: c.isFree(), visible: bv.visible, rawVisible: bv.rawVisible ?? null, rays: bv.rays.map((x) => ({ pt: x.pt, clear: x.clear, rawClear: x.rawClear ?? null, by: x.by })), checks: [chk('ferry mesh cut-clear rays', bad.length, '==', 0)] };
      g.setView(null);
    }
    // (c) camera:update ordering — matrixWorld at the event must already include the pitch
    const camUpdate = (label, v, m, n) => {
      setup({ ...v, frames: 0 }, m, { noStep: true });
      C.updateMatrixWorld(true);                          // what the render after setup would leave
      const ev = [];
      const offE = ctx.events.on('camera:update', () => {
        const e = C.matrixWorld.elements;
        _w.set(-e[8], -e[9], -e[10]).normalize();         // forward as the event sees it
        fwd(_f);                                          // forward the lens was actually set to
        _d.copy(c.target).sub(C.position).normalize();    // the lookAt direction
        const stale = _w.angleTo(_f);
        ev.push({ stale, pitchQ: elevOf(_f) - elevOf(_d), pitchMW: elevOf(_w) - elevOf(_d), cine: !!c.cinematicActive,
          occYaw: get('occYaw'), densityK: get('densityK'), cutK: get('cutK'), basisYaw: (() => { const b = c.basis(); return Math.atan2(b.fx, b.fz); })() });
      });
      // the game renders right after update(), which refreshes matrixWorld: mimic that, so a stale
      // matrix at the event is exactly one frame old, as it would be in play
      const nn = v.walk ? (v.walk.n || 30) : n;
      for (let i = 0; i < nn; i++) {
        ctx.input.virtual = v.walk ? { x: v.walk.x, y: v.walk.y } : { x: 0, y: 0 };
        g.step(1, 1 / 30); C.updateMatrixWorld(true);
      }
      ctx.input.virtual = { x: 0, y: 0 };
      offE();
      const maxStale = maxOf(ev.map((x) => x.stale));
      const pq = ev.map((x) => x.pitchQ), pm = ev.map((x) => x.pitchMW);
      const maxPitch = maxOf(pq.map(Math.abs));
      const basisMove = maxOf(ev.slice(1).map((x, i) => Math.abs(wrap(x.basisYaw - ev[i].basisYaw))));
      const holdEv = ev.filter((x) => Math.abs(x.pitchQ) > 0.5 * maxPitch && maxPitch > 1e-4);
      return { label, events: ev.length, maxStale: r(maxStale, 6), maxPitchQ: r(maxPitch, 4), maxPitchMW: r(maxOf(pm.map(Math.abs)), 4),
        pitchMismatch: r(maxOf(ev.map((x) => Math.abs(x.pitchQ - x.pitchMW))), 6), basisYawMaxStep: r(basisMove, 6),
        atHold: holdEv.length ? { occYaw: holdEv[holdEv.length >> 1].occYaw, densityK: holdEv[holdEv.length >> 1].densityK, cutK: holdEv[holdEv.length >> 1].cutK } : null,
        checks: [chk(`${label}: matrixWorld at camera:update includes the final pose (rad)`, maxStale, '<=', 1e-6)] };
    };
    out.camUpdate = [];
    if (V.cam_moon_moment) out.camUpdate.push(camUpdate('cam_moon_moment', V.cam_moon_moment, 1, V.cam_moon_moment.frames ?? 80));
    const street = V.cam_follow_street || { pos: [112, 2], time: 12, call: { 'camera.setMode': 2 }, walk: { x: 0, y: 1, n: 75 }, frames: 0 };
    out.camUpdate.push(camUpdate('cam_follow_street', street, 2, 75));
    // (d) lens elevation = the §2 table (views.json's own candy_meadow / cat_main_street: default framing)
    out.lensElev = [];
    const table = { candy_meadow: [0.64, 0.46, 1.10], cat_main_street: [0.50, 0.40, 1.10] };
    for (const [nm, pos] of [['candy_meadow', [-110, -45]], ['cat_main_street', [118, 0]]]) {
      for (const m of [1, 2, 3]) {
        setup({ pos, time: 12, frames: 60 }, m);
        const tilt = get('tilt'), ae = viewAE();
        const sum = tilt === null ? null : c.current.elevation + tilt;
        const proxy = ae.el - c.occLift;                 // what the lens renders, minus the ladder's lift
        const want = table[nm][m - 1];
        out.lensElev.push({ view: nm, mode: m, curEl: r(c.current.elevation, 4), tilt: tilt === null ? null : r(tilt, 4), sum: sum === null ? null : r(sum, 4),
          renderedMinusLift: r(proxy, 4), densityK: get('densityK'), want, check: chk(`${nm} m${m}: current.elevation + tilt`, sum === null ? null : Math.abs(sum - want), '<=', 0.01),
          proxyCheck: chk(`${nm} m${m}: rendered el − occLift`, Math.abs(proxy - want), '<=', 0.01) });
      }
    }
    // (e) interiors own their framing, in both modes (§7). Every row first LEAVES (leaveInteriors), so
    // the owner's edge-triggered framing runs again on entry — before this, the m2 row ran right after
    // the m1 row, inside, and never saw cave.js / palace.js aim anything. Traps record who wrote
    // params.azimuth / elevation / distance during the frames; per frame from frame 1 the lens must be
    // p.fov with no pitch, looking along params.azimuth; at the end el/dist must be what the owner wrote
    // (cave 0.95 / 22, palace ≥ 0.95 / ≤ 17), and mode 2 must equal mode 1 (goals, lens, pitch).
    out.interiors = [];
    const OWNER = /^systems\/(escape|candy|cat)\//;
    for (const nm of ['candy_in_house0', 'cat_in_meow', 'palace_throne_play', 'cave_corridor']) {
      const v = V[nm]; if (!v) { out.interiors.push({ view: nm, status: 'view missing' }); continue; }
      let m1row = null;
      for (const m of [1, 2]) {
        leaveInteriors();
        const calls = setup(v, m, { noStep: true });
        const rec = {}; const undo = [];
        for (const k of ['azimuth', 'elevation', 'distance']) { rec[k] = { count: {}, last: {} }; undo.push(trapParam(k, rec[k])); }
        const ownerOf = (k) => { const ws = Object.keys(rec[k].last).filter((w) => OWNER.test(w)); return ws.length ? rec[k].last[ws[ws.length - 1]] : null; };
        const T = ownedTrace(() => ownerOf('azimuth'));
        if (v.walk) g.walk({ x: v.walk.x, y: v.walk.y }, v.walk.n || 30);
        g.step(v.frames ?? 45, 1 / 30);
        T.off(); for (const u of undo) u();
        ctx.scene.updateMatrixWorld(true);
        fwd(_f); _d.copy(c.target).sub(C.position).normalize();
        const tr = T.tr;
        const fovErr = maxOf(tr.map((x) => Math.abs(x.fov - x.pfov)));
        const pitchMax = maxOf(tr.map((x) => Math.abs(x.pitch)));
        const azErr = maxOf(tr.map((x) => Math.abs(wrap(x.bearing - x.pAz))));
        const ownAzErr = tr.some((x) => x.ownerAz !== null) ? maxOf(tr.filter((x) => x.ownerAz !== null).map((x) => Math.abs(wrap(x.bearing - x.ownerAz)))) : null;
        const selfAz = Object.entries(rec.azimuth.count).filter(([w]) => w.startsWith('camera.js')).reduce((a, [, n]) => a + n, 0);
        const owner = { azimuth: ownerOf('azimuth'), elevation: ownerOf('elevation'), distance: ownerOf('distance') };
        const endPitch = elevOf(_f) - elevOf(_d);
        const rowOut = { view: nm, mode: m, calls, frames: tr.length, ownedFrames: tr.filter((x) => x.owned).length,
          params: { elevation: r(c.params.elevation, 4), distance: r(c.params.distance, 4), azimuth: r(c.params.azimuth, 4), fov: r(c.params.fov, 3) },
          current: { elevation: r(c.current.elevation, 4), distance: r(c.current.distance, 4), azimuth: r(c.current.azimuth, 4) }, camFov: r(C.fov, 3),
          owner: { azimuth: r(owner.azimuth, 4), elevation: r(owner.elevation, 4), distance: r(owner.distance, 4) },
          lensPos: [r(C.position.x, 3), r(C.position.y, 3), r(C.position.z, 3)],
          occYaw: get('occYaw'), densityK: get('densityK'), pitch: r(endPitch, 5),
          frame1: tr[0] ? { fov: r(tr[0].fov, 3), pitch: r(tr[0].pitch, 5), bearing: r(tr[0].bearing, 4), pAz: r(tr[0].pAz, 4), ownerAz: r(tr[0].ownerAz, 4), el: r(tr[0].el, 4), dist: r(tr[0].dist, 3) } : null,
          azWriters: rec.azimuth.count, elWriters: rec.elevation.count, distWriters: rec.distance.count,
          checks: [
            chk(`${nm} m${m}: |cam.fov − p.fov|, every frame from frame 1`, fovErr, '<=', 0.01),
            chk(`${nm} m${m}: |pitch|, every frame from frame 1 (rad)`, pitchMax, '<=', 1e-4),
            chk(`${nm} m${m}: |lens bearing − params.azimuth|, every frame from frame 1`, azErr, '<=', 0.02),
            chk(`${nm} m${m}: params.azimuth writes by the camera itself`, selfAz, '==', 0),
            chk(`${nm} m${m}: frames owned (of ${tr.length})`, tr.filter((x) => x.owned).length, '==', tr.length),
          ] };
        if (ownAzErr !== null) rowOut.checks.push(chk(`${nm} m${m}: |lens bearing − the owner's written azimuth|, every frame from its first write`, ownAzErr, '<=', 0.02));
        if (owner.elevation !== null) rowOut.checks.push(chk(`${nm} m${m}: |current.elevation − the owner's elevation (${r(owner.elevation, 3)})|`, Math.abs(c.current.elevation - owner.elevation), '<=', 0.01));
        if (owner.distance !== null) rowOut.checks.push(chk(`${nm} m${m}: |current.distance − the owner's distance (${r(owner.distance, 3)})|`, Math.abs(c.current.distance - owner.distance), '<=', 0.05));
        if (m === 1) m1row = rowOut;
        else if (m1row) {
          rowOut.vsM1 = { el: r(c.current.elevation - m1row.current.elevation, 5), dist: r(c.current.distance - m1row.current.distance, 5), az: r(wrap(c.current.azimuth - m1row.current.azimuth), 5),
            fov: r(C.fov - m1row.camFov, 4), lens: r(Math.hypot(C.position.x - m1row.lensPos[0], C.position.y - m1row.lensPos[1], C.position.z - m1row.lensPos[2]), 4) };
          rowOut.checks.push(chk(`${nm} m2 = m1: |Δ current el| + |Δ az| (rad)`, Math.abs(rowOut.vsM1.el) + Math.abs(rowOut.vsM1.az), '<=', 0.005),
            chk(`${nm} m2 = m1: |Δ current distance|`, Math.abs(rowOut.vsM1.dist), '<=', 0.05), chk(`${nm} m2 = m1: |Δ fov|`, Math.abs(rowOut.vsM1.fov), '<=', 0.01));
        }
        out.interiors.push(rowOut);
      }
    }
    // (f) determinism: two consecutive snap() calls
    {
      const v = V.candy_arrival;
      setup(v, 1);
      c.snap(); C.updateMatrixWorld(true); const m1 = [...C.matrixWorld.elements]; const s1 = ['cutK', 'occYaw', 'densityK', 'terrainLift'].map(get);
      c.snap(); C.updateMatrixWorld(true); const m2 = [...C.matrixWorld.elements]; const s2 = ['cutK', 'occYaw', 'densityK', 'terrainLift'].map(get);
      const d = maxOf(m1.map((x, i) => Math.abs(x - m2[i])));
      out.determinism = { view: 'candy_arrival', maxMatrixDiff: d, state1: s1, state2: s2, checks: [chk('snap() twice: matrixWorld diff', d, '<=', 1e-6), chk('snap() twice: state equal', JSON.stringify(s1) === JSON.stringify(s2), '==', true)] };
    }
    // (h) mode-2 horizon: geometric band + rendered open sky (horizon(), above)
    out.horizon = horizon(V);
    // (g) flying framing (last: debugFly leaves the flyer in the air)
    if (V.cam_flying) {
      const v = V.cam_flying;
      const calls = setup(v, 1, { noStep: true });
      const writers = {}; let dVal = c.params.distance;
      Object.defineProperty(c.params, 'distance', {
        configurable: true, enumerable: true, get: () => dVal,
        set: (x) => { const k = writerChain(); writers[k] = (writers[k] || 0) + 1; dVal = x; },
      });
      const tr = [];
      for (let i = 0; i < (v.frames ?? 60); i++) { g.step(1, 1 / 30); const ch = centreHit(); tr.push({ fov: C.fov, el: viewAE().el, lens: C.position.distanceTo(c.target), centre: ch ? ch.t : null, flying: !!ctx.state.flying }); }
      Object.defineProperty(c.params, 'distance', { configurable: true, enumerable: true, writable: true, value: dVal });
      const f15 = tr[14], f30 = tr[29];
      out.flying = { calls, flyingAt30: f30.flying, at0_5s: { fov: r(f15.fov, 3) }, at30: { lens: r(f30.lens, 3), el: r(f30.el, 4), fov: r(f30.fov, 3) }, distanceWriters: writers,
        checks: [chk('flying: lens distance ≈ 44 (|Δ|)', Math.abs(f30.lens - 44), '<=', 1), chk('flying: elevation ≈ 0.38 (|Δ|)', Math.abs(f30.el - 0.38), '<=', 0.02),
          chk('flying: FOV ≈ 40 (|Δ|)', Math.abs(f30.fov - 40), '<=', 0.5), chk('flying: FOV at 0.5 s', f15.fov, '>=', 38),
          chk('flying: flyer never writes params.distance', Object.keys(writers).filter((k) => /flyer/.test(k)).length, '==', 0)] };
    }
    return out;
  }

  // §7 "cave corridor azimuth not re-triggered by mode 2", on a FRESH page (the runner reloads first):
  // setMode(2) → teleport(1376, -39) → setView(null) → step 70, exactly the live order (cave.js's caveCam
  // writes the corridor az and snaps BEFORE it sets placeOverride). Then mode 1 on the same page (after
  // leaving) as the reference. Checks: params.azimuth written only by cave.js; the lens looks along the
  // cave's corridor az on every frame; p.fov and pitch 0 from frame 1; mode 2's trace = mode 1's.
  function s7cave(frames = 70) {
    const c = cam();
    const runOne = (m) => {
      g.setTime(12);
      c.setMode(m);
      const rec = { count: {}, last: {} }, undo = trapParam('azimuth', rec);
      const T = ownedTrace(() => (rec.last['systems/escape/cave.js'] ?? null));
      g.teleport(1376, -39); g.setView(null);
      for (let i = 0; i < frames; i++) g.step(1, 1 / 30);
      T.off(); undo();
      const tr = T.tr;
      const first = tr.findIndex((x) => x.ownerAz !== null);
      return { mode: m, frames: tr.length, azWriters: rec.count, caveFirstWriteFrame: first + 1,
        fovErr: maxOf(tr.map((x) => Math.abs(x.fov - x.pfov))), pitchMax: maxOf(tr.map((x) => Math.abs(x.pitch))),
        caveAzErr: first < 0 ? null : maxOf(tr.slice(first).map((x) => Math.abs(wrap(x.bearing - x.ownerAz)))),
        trace: tr.map((x) => ({ fov: r(x.fov, 3), pitch: r(x.pitch, 5), bearing: r(x.bearing, 4), caveAz: r(x.ownerAz, 4), el: r(x.el, 4), dist: r(x.dist, 3), owned: x.owned })) };
    };
    const m2 = runOne(2);
    leaveInteriors();
    const m1 = runOne(1);
    const others2 = Object.entries(m2.azWriters).filter(([w]) => w !== 'systems/escape/cave.js').reduce((a, [, n]) => a + n, 0);
    const n = Math.min(m1.trace.length, m2.trace.length);
    let dB = 0, dE = 0, dD = 0, dF = 0;
    for (let i = 0; i < n; i++) { const a = m1.trace[i], b = m2.trace[i]; dB = Math.max(dB, Math.abs(wrap(a.bearing - b.bearing))); dE = Math.max(dE, Math.abs(a.el - b.el)); dD = Math.max(dD, Math.abs(a.dist - b.dist)); dF = Math.max(dF, Math.abs(a.fov - b.fov)); }
    const brief = (x) => ({ mode: x.mode, frames: x.frames, azWriters: x.azWriters, caveFirstWriteFrame: x.caveFirstWriteFrame, fovErr: r(x.fovErr, 4), pitchMax: r(x.pitchMax, 6), caveAzErr: r(x.caveAzErr, 5),
      frame1: x.trace[0], frame70: x.trace[x.trace.length - 1], trace: x.trace.filter((_, i) => i < 3 || i % 10 === 9) });
    return { status: 'ok', protocol: 'fresh page: setMode(2) → teleport(1376,-39) → setView(null) → step 70; then leave, setMode(1), the same', m2: brief(m2), m1: brief(m1),
      m2vsM1: { bearing: r(dB, 5), el: r(dE, 5), dist: r(dD, 4), fov: r(dF, 4) },
      checks: [
        chk('cave m2 (fresh page): params.azimuth writes by anyone but cave.js', others2, '==', 0),
        chk('cave m2: cave.js wrote the corridor azimuth (writes)', m2.azWriters['systems/escape/cave.js'] || 0, '>=', 1),
        chk('cave m2: |lens bearing − cave.js corridor az|, every frame from its first write', m2.caveAzErr, '<=', 0.02),
        chk('cave m2: cave.js wrote on frame 1', m2.caveFirstWriteFrame, '==', 1),
        chk('cave m2: |cam.fov − p.fov|, every frame from frame 1', m2.fovErr, '<=', 0.01),
        chk('cave m2: |pitch|, every frame from frame 1 (rad)', m2.pitchMax, '<=', 1e-4),
        chk('cave m1 (reference): |lens bearing − cave.js corridor az|', m1.caveAzErr, '<=', 0.02),
        chk('cave m2 = m1 per frame: max |Δ bearing| + |Δ el| (rad)', dB + dE, '<=', 0.005),
        chk('cave m2 = m1 per frame: max |Δ distance|', dD, '<=', 0.05),
        chk('cave m2 = m1 per frame: max |Δ fov|', dF, '<=', 0.01),
      ] };
  }


  /**
   * d7 — camera step 7 (CAMERA_SPEC §4.4-4.8, §6.1): the mode-2 whiskers, the pin, density's forced-0 list and the
   * terrain whisker, each against its own clause. Runs LAST on the page (it ends in the air), with a10 or alone.
   *   W  (50, 24) in mode 2, facing 5π/4 (the §1 protocol): the sweep reads him blocked, one side reads clear.
   *      W1 the whiskers commit to a side (|occYaw| ≥ 0.26 within 90 frames), never faster than 0.5 rad/s (the
   *      nausea cap, §4.8), never past 0.52 rad, and not before 0.35 s blocked + 0.8 s better (≥ 34 frames);
   *      W2 they survive a straight 1 s walk (path alignment never cancels them); W3 tap V cancels them with no
   *      jump (the offset folds into the tether: ≤ 0.1 rad on the tap frame, the recentre's own 3 rad/s);
   *      W4 a drag cancels them and moves the view by exactly the drag (0.006 rad/px); W5 Q cancels them, the
   *      view eases (≤ 0.1 rad/frame); W6 mode 1 at the same spot: occYaw exactly 0 every frame (the Q/E hint,
   *      if it fires, is recorded with the chip's keycap row); W7 pinned (--dist) mode 2: occYaw and densityK 0.
   *   P  the pin (§6.1): setParams({elevation}) pins; snap() and setFree(null) keep it; a teleport clears it;
   *      under ctx.shot walking 8 u away does not.
   *   D  density forced 0 (§4.5): a dense spot reads dK > 0 in mode 1 (control), then 0 in mode 3, pinned, inside
   *      Meow Donald's (owned) and flying (last).
   *   T  the terrain whisker (§4.7) on Frosting Peak's south flank (-188, -78), mode 1: snap() settles the lift
   *      at its goal (> 0, ≤ 0.25) and two snaps agree; the lens elevation carries it; walking uphill away, the
   *      automatic elevation never moves faster than 0.15 rad/s (A10's cap, the shared budget).
   */
  function d7() {
    const c = cam(), inp = ctx.input, out = { status: 'ok', checks: [] };
    if (get('occYaw') === null || get('pinned') === null || get('terrainLift') === null) return NI('occYaw / pinned / terrainLift getters missing');
    const SPOT = { pos: [50, 24], time: 12 };
    const bearing = () => viewAE().az;
    // W1
    setup({ ...SPOT, frames: 0 }, 2, { noStep: true });
    let first = -1, maxRate = 0, maxAbs = 0, prev = get('occYaw');
    for (let i = 0; i < 90; i++) { g.step(1, 1 / 30); const y = get('occYaw'); maxRate = Math.max(maxRate, Math.abs(y - prev) * 30); prev = y; maxAbs = Math.max(maxAbs, Math.abs(y)); if (y !== 0 && first < 0) first = i; }
    const w1 = { firstFrame: first, occYaw: r(prev, 4), goal: c.whiskerState?.goal ?? null, maxRate: r(maxRate, 4), maxAbs: r(maxAbs, 4), clear: (c.whiskerState?.clear || []).map((x) => r(x, 2)) };
    out.W1 = w1;
    out.checks.push(chk('W1 whiskers commit to a clear side within 90 frames (|occYaw|)', Math.abs(prev), '>=', 0.26));
    out.checks.push(chk('W1 whisker yaw rate (rad/s)', maxRate, '<=', 0.5));
    out.checks.push(chk('W1 |occYaw| ≤ whiskerMax', maxAbs, '<=', 0.52 + 1e-9));
    out.checks.push(chk('W1 not before 0.35 s blocked + 0.8 s better (first frame)', first, '>=', 34));
    // W2 — a straight walk (W, 1 s): the offset stays
    const g0 = c.whiskerState?.goal;
    const walkTr = hold({ x: 0, y: 1 }, 30);
    const minAbs = Math.min(...walkTr.map((x) => Math.abs(x.occYaw)));
    out.W2 = { goalBefore: g0, goalAfter: c.whiskerState?.goal ?? null, minAbsOccYaw: r(minAbs, 4), end: r(get('occYaw'), 4) };
    out.checks.push(chk('W2 a straight 1 s walk keeps the whisker offset (min |occYaw|)', minAbs, '>=', 0.2));
    // re-arm helper: back to the committed state at the spot
    const arm = () => { setup({ ...SPOT, frames: 0 }, 2, { noStep: true }); for (let i = 0; i < 150 && Math.abs(get('occYaw')) < 0.4; i++) g.step(1, 1 / 30); g.step(10, 1 / 30); return get('occYaw'); };
    // W3 — tap V
    let y0 = arm(); let b0 = bearing();
    inp.pressed.add('KeyV'); inp.keys.add('KeyV'); g.step(3, 1 / 30); inp.keys.delete('KeyV');
    const bPre = bearing(); g.step(1, 1 / 30);
    const bTap = bearing(), yTap = get('occYaw');
    let maxStep = Math.abs(wrap(bTap - bPre)); let pb = bTap;
    for (let i = 0; i < 20; i++) { g.step(1, 1 / 30); const b = bearing(); maxStep = Math.max(maxStep, Math.abs(wrap(b - pb))); pb = b; }
    out.W3 = { armed: r(y0, 4), occYawAfterTap: r(yTap, 4), tapFrameStep: r(Math.abs(wrap(bTap - bPre)), 4), maxStep20: r(maxStep, 4), holdStep: r(Math.abs(wrap(bPre - b0)), 4) };
    out.checks.push(chk('W3 tap V cancels the whiskers (occYaw after the tap)', Math.abs(yTap), '<=', 1e-9));
    out.checks.push(chk('W3 no jump: lens bearing per frame through the tap and the recentre (rad)', maxStep, '<=', 0.1));
    // W4 — a drag
    y0 = arm(); b0 = bearing();
    inp.pointer.orbit = true; inp.pointer.dragDX = 50; g.step(1, 1 / 30); inp.pointer.orbit = false;
    const bDrag = bearing(), yDrag = get('occYaw');
    out.W4 = { armed: r(y0, 4), occYawAfter: r(yDrag, 4), viewMove: r(wrap(bDrag - b0), 4), want: -0.3 };
    out.checks.push(chk('W4 a drag cancels the whiskers (occYaw after)', Math.abs(yDrag), '<=', 1e-9));
    out.checks.push(chk('W4 the view moves by the drag alone (|Δaz − (−0.3)|, rad)', Math.abs(wrap(bDrag - b0) + 0.3), '<=', 0.03));
    // W5 — Q
    y0 = arm(); pb = bearing();
    inp.pressed.add('KeyQ'); g.step(1, 1 / 30);
    const yQ = get('occYaw'); let qStep = 0;
    { let b = bearing(); qStep = Math.abs(wrap(b - pb)); pb = b; }
    for (let i = 0; i < 20; i++) { g.step(1, 1 / 30); const b = bearing(); qStep = Math.max(qStep, Math.abs(wrap(b - pb))); pb = b; }
    out.W5 = { armed: r(y0, 4), occYawAfter: r(yQ, 4), maxStep: r(qStep, 4) };
    out.checks.push(chk('W5 Q cancels the whiskers (occYaw after)', Math.abs(yQ), '<=', 1e-9));
    out.checks.push(chk('W5 the view eases through Q (max step per frame, rad)', qStep, '<=', 0.1));
    // W6 — mode 1 at the spot: never an automatic yaw; the Q/E hint instead
    setup({ ...SPOT, frames: 0 }, 1, { noStep: true });
    const h0 = c.hint ? c.hint.seq : null; let y1 = 0, az1 = 0, pa = bearing(), hintSeen = null, hintDom = false;
    for (let i = 0; i < 120; i++) {
      g.step(1, 1 / 30); y1 = Math.max(y1, Math.abs(get('occYaw'))); const b = bearing(); az1 += Math.abs(wrap(b - pa)); pa = b;
      if (c.hint && c.hint.seq !== h0 && !hintSeen) hintSeen = { key: c.hint.key, frame: i };
      if (hintSeen && !hintDom) { const e = ctx.uiRoot?.querySelector('.cci-cam-hint'); if (e && e.style.display !== 'none' && (e.textContent || '').includes(hintSeen.key)) hintDom = true; }
    }
    out.W6 = { maxAbsOccYaw: y1, yawSum: r(az1, 6), hint: hintSeen, hintKeycapShown: hintSeen ? hintDom : null };
    out.checks.push(chk('W6 mode 1: occYaw exactly 0 (max |occYaw|)', y1, '<=', 0));
    out.checks.push(chk('W6 mode 1: no automatic yaw (Σ|Δaz|)', az1, '<=', 1e-9));
    if (hintSeen) out.checks.push(chk('W6 the Q/E hint shows its keycap row in the chip', hintDom, '==', true));
    // W6b — where a 45° step does see him (Candy Village's west lane, found by search): the hint fires once he has
    // been ≥ 3/5 blocked for 2 s, names the key, and the chip shows it (at most once a minute: HINT_GAP)
    {
      setup({ pos: [-150, 68], time: 12, frames: 0 }, 1, { noStep: true });
      const s0 = c.hint ? c.hint.seq : null; let fired = null, dom = false, yawSum = 0, pa = bearing();
      for (let i = 0; i < 90; i++) {
        g.step(1, 1 / 30); const b = bearing(); yawSum += Math.abs(wrap(b - pa)); pa = b;
        if (c.hint && c.hint.seq !== s0 && !fired) fired = { key: c.hint.key, frame: i, t: r(c.hint.t, 2) };
        if (fired && !dom) { const e = ctx.uiRoot?.querySelector('.cci-cam-hint'); if (e && e.style.display !== 'none' && (e.textContent || '').includes(fired.key)) dom = true; }
      }
      out.W6b = { fired, keycapShown: dom, yawSum: r(yawSum, 6) };
      out.checks.push(chk('W6b mode 1 hint fires after ≥ 2 s blocked (frame, ≥ 59)', fired ? fired.frame : null, '>=', 59));
      out.checks.push(chk('W6b the chip shows the hinted keycap', dom, '==', true));
      out.checks.push(chk('W6b the hint never turns the view (Σ|Δaz|)', yawSum, '<=', 1e-9));
    }
    // W7 — pinned in mode 2
    setup({ ...SPOT, dist: 31, frames: 0 }, 2, { noStep: true });
    let y7 = 0, d7k = 0;
    for (let i = 0; i < 90; i++) { g.step(1, 1 / 30); y7 = Math.max(y7, Math.abs(get('occYaw'))); d7k = Math.max(d7k, get('densityK')); }
    out.W7 = { pinned: get('pinned'), maxAbsOccYaw: y7, maxDensityK: d7k };
    out.checks.push(chk('W7 pinned mode 2: whiskers and density stay 0 (max |occYaw| + max densityK)', y7 + d7k, '<=', 0));
    // P — the pin
    {
      setup({ ...SPOT, frames: 0 }, 1, { noStep: true });
      const s0 = get('pinned');
      c.setParams({ elevation: 0.6 }); const s1 = get('pinned');
      c.snap(); const s2 = get('pinned');
      g.setView(null); const s3 = get('pinned');
      const P0 = pl().position.clone();
      g.walk({ x: 0, y: 1 }, 45); const moved = Math.hypot(pl().position.x - P0.x, pl().position.z - P0.z); const s4 = get('pinned');
      g.teleport(SPOT.pos[0], SPOT.pos[1]); const s5 = get('pinned');
      out.P = { afterTeleportSetup: s0, afterSetParams: s1, afterSnap: s2, afterSetFreeNull: s3, afterWalk: s4, walked: r(moved, 2), afterTeleport: s5 };
      out.checks.push(chk('P setParams({elevation}) pins; snap() and setFree(null) keep it', !s0 && s1 && s2 && s3, '==', true));
      out.checks.push(chk('P under ctx.shot a walk (≥ 6 u) keeps the pin; a teleport clears it', s4 === true && moved >= 6 && s5 === false, '==', true));
      c.setParams({ elevation: 0.64 }); g.teleport(SPOT.pos[0], SPOT.pos[1]);
    }
    // D — density's forced-0 list (control first: a dense walk in mode 1)
    {
      const DENSE = { pos: [178, 48], time: 15 };
      setup({ ...DENSE, frames: 0 }, 1, { noStep: true }); g.walk({ x: 0, y: 1 }, 45); g.step(15, 1 / 30);
      const ctl = get('densityK');
      c.setMode(3); g.step(1, 1 / 30); const m3 = get('densityK');
      setup({ ...DENSE, frames: 0 }, 1, { noStep: true }); c.setParams({ distance: 31 }); g.walk({ x: 0, y: 1 }, 45); const pin = get('densityK');
      let own = null;
      const ca = ctx.systems.catArchitecture;
      if (typeof ca?.enter === 'function') { setup({ pos: [129, -25], time: 12, frames: 0 }, 2, { noStep: true }); try { ca.enter('meow'); } catch { /* optional */ } g.step(30, 1 / 30); own = { densityK: get('densityK'), occYaw: get('occYaw'), indoors: get('indoors') }; leaveInteriors(); }
      out.D = { control: r(ctl, 3), mode3: m3, pinned: pin, owned: own };
      out.checks.push(chk('D control: a dense walk reads densityK > 0 (mode 1)', ctl, '>', 0.05));
      out.checks.push(chk('D forced 0: mode 3, pinned (densityK sum)', m3 + pin, '<=', 0));
      if (own) out.checks.push(chk('D forced 0 while owned (inside Meow Donald\'s, mode 2): densityK + |occYaw|', own.densityK + Math.abs(own.occYaw), '<=', 0));
    }
    // T — the terrain whisker
    {
      const HILL = { pos: [-188, -78], time: 12 };
      setup({ ...HILL, frames: 0 }, 1, { noStep: true });
      c.snap(); C.updateMatrixWorld(true);
      const t1 = get('terrainLift'), m1 = [...C.matrixWorld.elements];
      c.snap(); C.updateMatrixWorld(true);
      const t2 = get('terrainLift'), m2 = [...C.matrixWorld.elements];
      const ds = c.densityState || {};
      const elNow = viewAE().el, parts = c.current.elevation + (get('tilt') || 0) + c.occLift + (ds.el || 0);
      out.T = { terrainLift: r(t1, 4), goal: r(ds.terrainGoal, 4), twoSnaps: [r(t1, 6), r(t2, 6)], matrixDiff: maxOf(m1.map((x, i) => Math.abs(x - m2[i]))), lensEl: r(elNow, 4), elWithoutTerrain: r(parts, 4) };
      out.checks.push(chk('T snap() settles the terrain lift at its goal (> 0 on the flank)', t1, '>', 0.02));
      out.checks.push(chk('T terrain lift ≤ terrainLiftMax', t1, '<=', 0.25 + 1e-9));
      out.checks.push(chk('T two snaps: terrainLift and matrixWorld equal', Math.abs(t1 - t2) + out.T.matrixDiff, '<=', 1e-9));
      out.checks.push(chk('T the lens elevation carries it (|el − (el without it) − terrainLift|)', Math.abs(elNow - parts - t1), '<=', 0.005));
      g.setView(null);
      const tr = hold({ x: 0, y: 1 }, 90);
      const er = []; for (let i = 1; i < tr.length; i++) if (!tr[i].cine && !tr[i - 1].cine) er.push(Math.abs(tr[i].el - tr[i - 1].el) * 30);
      out.T.walkElMax = r(maxOf(er), 4); out.T.endLift = r(get('terrainLift'), 4);
      out.checks.push(chk('T walking off the flank: automatic elevation rate (rad/s, A10)', maxOf(er), '<=', 0.15));
    }
    // D (flying, last: it leaves the flyer in the air)
    {
      const fly = resolveFn('escape.routes.flyer.debugFly');
      if (fly) {
        setup({ pos: [206.4, 6], time: 12, frames: 0 }, 2, { noStep: true });
        try { fly.fn.apply(fly.o, [206.4, 6, 60, -1.5708, true]); } catch { /* reported below */ }
        g.step(30, 1 / 30);
        out.Dfly = { flying: !!ctx.state.flying, densityK: get('densityK'), occYaw: get('occYaw'), terrainLift: r(get('terrainLift'), 4) };
        if (out.Dfly.flying) out.checks.push(chk('D forced 0 while flying (mode 2): densityK + |occYaw|', out.Dfly.densityK + Math.abs(out.Dfly.occYaw), '<=', 0));
      }
    }
    return out;
  }
  window.__cv = { d7, impl, a3Read, probe, renderNow, skyBand, seenBody, sway, horizon, undo: undoSticky, dirty, watchStart, watchStop, seenStates, a4, seedHoldD, seedProbe, a5, a6, a6x, a7, a7x, a8, a9, a10, s7, s7cave,
    ua: navigator.userAgent,
    gl: (() => { try { const gl = ctx.renderer.getContext(); const x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { return '?'; } })() };
  return impl;
}

// ── A13 perf page lib (live RAF loop; no render override) ─────────────────────
function perfLib(n) {
  const g = window.game, ctx = g.ctx, c = ctx.systems.camera;
  const s = { n: 0, ms: [], sweep: [], target: n };
  const orig = c.update;
  c.update = function (dt, cx) {
    const o0 = c.occMs; const t = performance.now();
    orig.call(this, dt, cx);
    const ms = performance.now() - t;
    if (s.n < s.target) { s.ms.push(ms); s.sweep.push(c.occMs !== o0); s.n++; }
  };
  window.__cvPerf = s;
  let gl = '?'; try { const x = ctx.renderer.getContext(); const e = x.getExtension('WEBGL_debug_renderer_info'); gl = e ? x.getParameter(e.UNMASKED_RENDERER_WEBGL) : x.getParameter(x.RENDERER); } catch { /* keep ? */ }
  return { ua: navigator.userAgent, gl };
}

// ── render-slot gate (copied from render.mjs; the slot is kept fresh while we hold it) ─
const MAX_SLOTS = Number(process.env.RENDER_SLOTS || 2);
const WAIT_MIN = Number(args.wait || 15);
const lockDir = path.join(root, 'renders/.locks'); fs.mkdirSync(lockDir, { recursive: true });
let slot = null, touchTimer = null;
async function acquire() {
  const t0 = Date.now();
  while (true) {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const p = path.join(lockDir, 'slot' + i);
      try { const st = fs.statSync(p); if (Date.now() - st.mtimeMs > 6 * 60 * 1000) fs.rmSync(p, { recursive: true, force: true }); } catch {}
      try { fs.mkdirSync(p); slot = p; touchTimer = setInterval(() => { try { const t = new Date(); fs.utimesSync(slot, t, t); } catch {} }, 60000); return; } catch {}
    }
    if (Date.now() - t0 > WAIT_MIN * 60 * 1000) throw new Error(`render slot wait timed out after ${WAIT_MIN} min`);
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
  }
}
function release() { if (touchTimer) clearInterval(touchTimer); touchTimer = null; if (slot) { try { fs.rmSync(slot, { recursive: true, force: true }); } catch {} slot = null; } }
process.on('exit', release); process.on('SIGINT', () => { release(); process.exit(1); }); process.on('SIGTERM', () => { release(); process.exit(1); });

/** --what-if noghost (header): serve the owner's file with the requested edit, before the page loads. */
async function routeWhatIf(page) {
  if (!WHATIF) return;
  await page.route((u) => new URL(u).pathname.replace(/^\//, '') === WHATIF.file,
    (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: WHATIF.body }));
}
/** …and record, per (re)loaded page, which meshes ended up noGhost and whether the cut took them. */
async function applyWhatIf(page) {
  if (!WHATIF) return;
  const names = await page.evaluate(() => {
    const ctx = window.game.ctx, cut = ctx.systems.camera?.cutout, list = [];
    ctx.scene.traverse((o) => { if (o.isMesh && o.userData.noGhost) list.push(`${o.name || o.type}${cut?.isPatched?.(o) ? '' : ' (not cut)'}`); });
    return list.sort();
  });
  if (out.whatIf && JSON.stringify(out.whatIf.meshes) !== JSON.stringify(names)) out.whatIf.differs = (out.whatIf.differs || 0) + 1;
  out.whatIf = out.whatIf || { kind: WHATIF.kind, edit: `${WHATIF.file}: ${WHATIF.n} × "${WHATIF.from}" → "${WHATIF.to}" (served in flight)`, n: names.length, meshes: names };
  console.log(`  what-if ${WHATIF.kind}: ${names.length} noGhost mesh(es) on this page`);
}

// ── run ───────────────────────────────────────────────────────────────────────
const T0 = Date.now();
const r3 = (x) => (typeof x === 'number' ? +x.toFixed(3) : x);
let commit = '?'; try { commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch {}
const out = {
  meta: { tag: TAG, commit, date: new Date().toISOString(), protocol: 2, modes: MODES, filter: FILTER, scripts: SCRIPTS, s9: !!args.s9, pSrc: PSRC, shots: SHOTS ? path.relative(root, SHOTS) : null, frame: !args['no-frame'], w: W, h: H, pin: PIN, pinned: {}, seen: SEEN, seenShut: SEEN_SHUT, whatIf: WHATIF ? `${WHATIF.kind}: ${WHATIF.file} ${WHATIF.from} → ${WHATIF.to}` : null },
  impl: null, rows: [], s9rows: [], summary: {}, scripts: {}, frame: {}, reloads: [], errors: [], warnings: 0, whatIf: null,
  timing: { machine: `${os.hostname()} · ${os.cpus()[0]?.model} · ${os.platform()} ${os.release()}`, userAgent: null, glRenderer: null, rows: {}, scripts: {}, frameMs: {}, reloads: [] },
};

await acquire();
const launchArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];
let browser;
try {
  if (PERF) {
    const hw = args.gl === 'hw';
    browser = await chromium.launch(hw ? { channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] } : { args: launchArgs });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await applyPin(page, out.meta.pinned);
    await page.goto(`http://127.0.0.1:${PORT}/?camvis=perf`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 300000 });
    const v = views.cat_residential;
    await page.evaluate((v) => {
      const g = window.game, c = g.ctx.systems.camera;
      g.setTime(v.time ?? 12); c.setMode(1); c.setParams({ azimuth: Math.PI / 4, elevation: 0.64, distance: 31, fov: 30 }); g.teleport(v.pos[0], v.pos[1]);
      const p = {}; if (v.az !== undefined) p.azimuth = v.az; if (v.el !== undefined) p.elevation = v.el; if (v.dist !== undefined) p.distance = v.dist; if (Object.keys(p).length) g.setCameraParams(p);
      g.setView(null);
    }, v);
    const N = Number(args['perf-frames'] || 600);
    const env = await page.evaluate(perfLib, N);
    await page.waitForFunction(() => window.__cvPerf.n >= window.__cvPerf.target, null, { timeout: 20 * 60 * 1000, polling: 500 });
    const s = await page.evaluate(() => window.__cvPerf);
    const p95 = (a) => { if (!a.length) return null; const q = [...a].sort((x, y) => x - y); return +q[Math.min(q.length - 1, Math.floor(0.95 * (q.length - 1) + 0.5))].toFixed(3); };
    const sw = s.ms.filter((_, i) => s.sweep[i]), ns = s.ms.filter((_, i) => !s.sweep[i]);
    const mean = (a) => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null;
    const hwOk = !/swiftshader|software|llvmpipe/i.test(env.gl);
    out.timing.userAgent = env.ua; out.timing.glRenderer = env.gl;
    out.timing.perf = { view: 'cat_residential', frames: s.n, mean: mean(s.ms), p95: p95(s.ms), max: +Math.max(...s.ms).toFixed(3), sweepFrames: sw.length, sweepP95: p95(sw), nonSweepP95: p95(ns), hardwareGL: hwOk };
    out.scripts.perf = { status: hwOk ? 'ok' : 'measured on software GL — not an A13 number (run with --gl hw on the M1 Pro)',
      checks: [{ id: 'camMs p95 non-sweep ≤ 1.5 ms', value: p95(ns), pass: hwOk && p95(ns) <= 1.5 }, { id: 'camMs p95 sweep ≤ 6 ms', value: p95(sw), pass: hwOk && p95(sw) <= 6 }] };
    console.log('perf', JSON.stringify(out.timing.perf), env.gl);
  } else {
    browser = await chromium.launch({ args: launchArgs });
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    // errors (and PAGEERRORs) are the zero-tolerance list; warnings are the systems' own build logs, counted only
    page.on('console', (m) => { if (m.type() === 'error') out.errors.push(m.text().slice(0, 240)); else if (m.type() === 'warning') out.warnings++; });
    page.on('pageerror', (e) => out.errors.push('PAGEERROR ' + e.message));
    await applyPin(page, out.meta.pinned);
    await routeWhatIf(page);
    await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 300000 });
    out.impl = await page.evaluate(pageLib);
    await applyWhatIf(page);
    const env = await page.evaluate(() => ({ ua: window.__cv.ua, gl: window.__cv.gl }));
    out.timing.userAgent = env.ua; out.timing.glRenderer = env.gl;
    console.log(`camvis ${TAG}: page ready in ${((Date.now() - T0) / 1000).toFixed(0)} s · impl ${JSON.stringify(out.impl)}`);
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    // Page history (header, "Isolation"): the labels of what ran on this page since it (re)loaded.
    let pageLog = [], lastLabel = null;
    const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
    const pageSig = () => ({ seq: pageLog.length, sig: fnv(pageLog.join('|')) });
    const reload = async (before, why, left) => {
      const t = Date.now();
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 300000 });
      await page.evaluate(pageLib);
      await applyWhatIf(page);
      pageLog = [];
      out.reloads.push({ before, why, left });
      out.timing.reloads.push({ before, s: +((Date.now() - t) / 1000).toFixed(1) });
      console.log(`  reloaded before ${before} (${why}: ${left.join(', ')}) in ${((Date.now() - t) / 1000).toFixed(0)} s`);
    };
    // the previous item left sticky state behind (state its view authored, e.g. cam_flying's flight, or a
    // contamination that survived its retry): reload before `label`, so it starts from a clean world
    const isolate = async (label) => {
      const d = await page.evaluate(() => window.__cv.dirty());
      if (!d.length) return null;
      const by = lastLabel;
      await reload(label, `left behind by ${by}`, d);
      return { left: d, by };
    };
    // one row: probe, then (before any screenshot) retry it once on a fresh page if it was contaminated
    const probeRow = async (name, v, m, src, opts) => {
      const label = `${name}_m${m}`;
      const iso = await isolate(label);
      const once = async () => {
        const pg = pageSig();
        const res = await page.evaluate(([name, v, m, src, opts]) => window.__cv.probe(name, v, m, src, opts), [name, v, m, src, opts]);
        pageLog.push(label); lastLabel = label;
        res.row.page = pg;
        return res;
      };
      let res = await once();
      if (iso) res.row.reloadedBefore = iso;
      out.timing.rows[label] = { ms: r3(res.timing.ms), camMs: res.timing.camMs, occMs: r3(res.timing.occMs) };
      const first = res.row.contaminated;
      if (first) {
        const fa = { contaminated: first, vis: res.row.vis, raw: res.row.raw, player: res.row.player, page: res.row.page };
        console.log(`  ${label}: CONTAMINATED by ${first.join(', ')} (vis ${res.row.vis}, visitor at ${JSON.stringify(res.row.player)}); re-running it on a fresh page`);
        await reload(label, 'retry of a contaminated row', first);
        res = await once();
        const again = res.row.contaminated;
        delete res.row.contaminated;
        Object.assign(res.row, { retried: true, contaminated: first, firstAttempt: fa });
        if (again) { res.row.contaminatedOnRetry = again; console.log(`  ${label}: STILL CONTAMINATED on a fresh page (${again.join(', ')}): kept, listed in summary.contaminated`); }
        out.timing.rows[label].retry = { ms: r3(res.timing.ms), camMs: res.timing.camMs, occMs: r3(res.timing.occMs) };
      }
      return res;
    };
    const flag = (rw) => (rw.retried ? ` RETRIED (first attempt: ${rw.contaminated.join(', ')}, vis ${rw.firstAttempt.vis})${rw.contaminatedOnRetry ? ' STILL CONTAMINATED: ' + rw.contaminatedOnRetry.join(', ') : ''}` : '');

    const shoot = async (name, m) => {
      if (!SHOTS) return;
      const ri = await page.evaluate(() => window.__cv.renderNow(2));
      const file = path.join(SHOTS, `${name}_m${m}.png`);
      await page.screenshot({ path: file, type: 'png', timeout: 240000 });
      out.timing.rows[`${name}_m${m}`].renderMs = ri.ms.map(r3);
      return file;
    };

    // probe set P, mode-major (fewest mode switches)
    const plist = P.filter((n) => !FILTER || n.includes(FILTER));
    for (const m of MODES) {
      for (const name of plist) {
        const { v, src } = resolveP(name);
        if (!v) { out.rows.push({ view: name, mode: m, status: 'view missing' }); continue; }
        const res = await probeRow(name, v, m, src, { seen: SEEN, seenShut: SEEN_SHUT });
        out.rows.push(res.row);
        const f = await shoot(name, m);
        await page.evaluate((v) => window.__cv.undo(v), v);
        const rw = res.row;
        console.log(`${name.padEnd(20)} m${m} vis ${rw.vis} raw ${rw.raw}${rw.seen ? ' seen ' + rw.seen.seen : ''} cutK ${rw.cutK} occDist ${rw.occDist} eff ${rw.lens.eff} p.dist ${rw.params.distance}${rw.lens.clamp ? ' CLAMP' : ''} ${rw.blocked.join(' | ')}${flag(rw)}${f ? ' → ' + path.relative(root, f) : ''}`);
        // A13 render-side sample: median of 5 rendered frames (after 1 warm-up) at cat_plaza / candy_village, mode 1
        if (m === 1 && !args['no-frame'] && (name === 'cat_plaza' || name === 'candy_village')) {
          const ri = await page.evaluate(() => window.__cv.renderNow(6));
          const ms = ri.ms.slice(1).sort((a, b) => a - b);
          out.timing.frameMs[name] = { median: r3(ms[2]), samples: ri.ms.slice(1).map(r3) };
          out.frame[name] = { calls: ri.calls, triangles: ri.triangles };
        }
      }
    }
    // §9 views (view-major; cam_flying last)
    if (args.s9) {
      for (const [name, v] of Object.entries(camViews)) {
        if (FILTER && !name.includes(FILTER)) continue;
        const own = v.call && v.call['camera.setMode'];
        const ms = [...MODES]; if (own && !ms.includes(own)) ms.push(own);
        for (const m of ms) {
          const res = await probeRow(name, v, m, 'views/camera.json', { forceMode: true, seen: SEEN, seenShut: SEEN_SHUT });
          out.s9rows.push(res.row);
          const f = await shoot(name, m);
          await page.evaluate((v) => window.__cv.undo(v), v);
          const rw = res.row;
          console.log(`§9 ${name.padEnd(24)} m${m} vis ${rw.vis} raw ${rw.raw} eff ${rw.lens.eff}${rw.calls ? ' calls ' + rw.calls.map((c) => c.path + ':' + c.status).join(',') : ''}${flag(rw)}${f ? ' → ' + path.relative(root, f) : ''}`);
        }
      }
    }

    // scripts (each records its page history, and any sticky state seen while it ran: informational,
    // since s7 authors a flight and a ferry deck on purpose; scripts are not retried)
    const run = async (id, fnSrc, arg, opts = {}) => {
      const label = `script ${id}`;
      await isolate(label);
      if (opts.fresh && pageLog.length) await reload(label, 'fresh page (the script\'s own protocol)', []);
      const pg = pageSig();
      await page.evaluate(() => window.__cv.watchStart());
      const t = Date.now();
      try { out.scripts[id] = await page.evaluate(fnSrc, arg); }
      catch (e) { out.scripts[id] = { status: 'error', error: String(e.message).slice(0, 400) }; }
      out.timing.scripts[id] = Date.now() - t;
      pageLog.push(label); lastLabel = label;
      const s = out.scripts[id];
      s.page = pg;
      const seenS = await page.evaluate(() => window.__cv.seenStates()).catch(() => []);
      if (seenS.length) s.stateSeen = seenS;
      // A3 over every frame the script ran (informational: A3 is judged on the probe rows)
      const a3s = await page.evaluate(() => window.__cv.a3Read()).catch(() => null);
      if (a3s) s.a3 = a3s;
      const ck = s.checks || [];
      console.log(`script ${id}: ${s.status}${ck.length ? ' · ' + ck.filter((c) => c.pass).length + '/' + ck.length + ' pass' : ''}${s.error ? ' · ' + s.error : ''}${seenS.length ? ' · state seen: ' + seenS.join(', ') : ''}`);
    };
    const V = {};
    for (const n of ['ferry_deck', 'cam_moon_moment', 'candy_in_house0', 'cat_in_meow', 'palace_throne_play', 'cave_corridor', 'candy_arrival', 'cam_follow_street', 'cam_follow_strafe', 'cam_follow_backpedal', 'cam_flying']) if (views[n]) V[n] = views[n];
    if (SCRIPTS.includes('a4')) { await run('a4', () => window.__cv.a4()); await run('a4seed', () => window.__cv.seedHoldD()); }
    if (SCRIPTS.includes('seed')) {
      const SEED13 = P.slice(0, 13).filter((n) => views[n]).map((n) => [n, views[n]]);
      await run('seed', (list) => window.__cv.seedProbe(list), SEED13);
    }
    if (SCRIPTS.includes('a5')) await run('a5', () => window.__cv.a5());
    if (SCRIPTS.includes('a6')) await run('a6', () => window.__cv.a6());
    if (SCRIPTS.includes('a7')) await run('a7', () => window.__cv.a7());
    if (SCRIPTS.includes('a8')) await run('a8', () => window.__cv.a8());
    if (SCRIPTS.includes('a9')) await run('a9', () => window.__cv.a9());
    if (SCRIPTS.includes('a10')) await run('a10', () => window.__cv.a10([1, 2, 3]));
    if (SCRIPTS.includes('s7')) await run('s7', (V) => window.__cv.s7(V), V);
    if (SCRIPTS.includes('s7') || SCRIPTS.includes('s7cave')) await run('s7cave', () => window.__cv.s7cave(70), undefined, { fresh: true });
    if (SCRIPTS.includes('horizon') && !SCRIPTS.includes('s7')) await run('horizon', (V) => ({ status: 'ok', horizon: window.__cv.horizon(V) }), V);
    if (SCRIPTS.includes('sway')) await run('sway', () => window.__cv.sway());
    // last, so every other script keeps the page history it had before a6x existed
    if (SCRIPTS.includes('a6') || SCRIPTS.includes('a6x')) await run('a6x', () => window.__cv.a6x());
    // …and after it the look's edges (camera step 6 fix), which ends in the air
    if (SCRIPTS.includes('a7') || SCRIPTS.includes('a7x')) await run('a7x', (v) => window.__cv.a7x(v), views.occ_silhouette || null);
    // …and last of all camera step 7's own proof (it ends in the air): with a10, or alone as "--script d7"
    if (SCRIPTS.includes('a10') || SCRIPTS.includes('d7')) await run('d7', () => window.__cv.d7());
    out.impl = await page.evaluate(() => window.__cv.impl);
  }
} catch (err) {
  console.error('CAMVIS FAILED:', err.stack || err.message); process.exitCode = 1;
  out.errors.push('CAMVIS FAILED ' + err.message);
} finally {
  await browser?.close().catch(() => {});
  release();
}

// ── summary ───────────────────────────────────────────────────────────────────
const mean = (a) => (a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(4) : null);
for (const m of MODES) {
  const rs = out.rows.filter((x) => x.mode === m && typeof x.vis === 'number');
  const g13 = rs.filter((x) => GAMEPLAY13.has(x.view));
  out.summary['m' + m] = {
    n: rs.length,
    cutMean15: mean(rs.map((x) => x.vis)), rawMean15: mean(rs.map((x) => x.raw)), featherMean15: mean(rs.map((x) => x.feather)),
    cutMean13: mean(g13.map((x) => x.vis)), rawMean13: mean(g13.map((x) => x.raw)),
    full15: rs.filter((x) => x.vis === 1).length, full13: g13.filter((x) => x.vis === 1).length,
    min: rs.length ? Math.min(...rs.map((x) => x.vis)) : null, minRaw: rs.length ? Math.min(...rs.map((x) => x.raw)) : null,
    below08: rs.filter((x) => x.vis < 0.8).map((x) => x.view),
    clamped: rs.filter((x) => x.lens?.clamp).map((x) => x.view),
    // A15 "a window that exists only while something is in front of him": open (cutK ≥ 0.05) with every
    // QA ray raw-clear and none of them opened by the window — a window cutting scenery for nothing
    // (with --seen: judged in pixels — the window opens < 0.5% of his body over its shut frame; without it, by the
    // rays: raw 5/5 and no ray opened by it, which misses a blocker raw skips, e.g. a 15% ghost)
    cutIdle: rs.filter((x) => typeof x.cutK === 'number' && x.cutK >= 0.05 && (typeof x.seen?.seenShut === 'number' ? x.seen.seen - x.seen.seenShut < 0.005 && x.raw === 1 : x.raw === 1 && !(x.cutClear || []).length))
      .map((x) => `${x.view} ${x.cutK}${typeof x.seen?.seenShut === 'number' ? ` (seen ${x.seen.seen} vs ${x.seen.seenShut} shut)` : ''}`),
    // §5.3 / A15: rows whose every shut ray is an accepted amber case (terrain, noCut / noFade, unpatched,
    // within 1 u, feather), and the rays that are not (the window's own misses: shut / low / outside)
    allExcused15: rs.filter((x) => Array.isArray(x.amber)).length ? rs.filter((x) => Array.isArray(x.amber) && x.amber.every((a) => !a.endsWith('!'))).length : null,
    unexcused: rs.filter((x) => Array.isArray(x.amber) && x.amber.some((a) => a.endsWith('!'))).map((x) => `${x.view} ${x.amber.filter((a) => a.endsWith('!')).join(',')}`),
  };
  const sn = rs.filter((x) => typeof x.seen?.seen === 'number');
  if (sn.length) Object.assign(out.summary['m' + m], { seenMean: mean(sn.map((x) => x.seen.seen)), seenMin: Math.min(...sn.map((x) => x.seen.seen)), seenBelow05: sn.filter((x) => x.seen.seen < 0.5).map((x) => `${x.view} ${x.seen.seen}`) });
}
const allRows = [...out.rows, ...out.s9rows].filter((x) => typeof x.vis === 'number');
out.summary.retried = allRows.filter((x) => x.retried).map((x) => `${x.view}_m${x.mode}: ${x.contaminated.join(', ')} → ${x.contaminatedOnRetry ? 'still contaminated on a fresh page: ' + x.contaminatedOnRetry.join(', ') : 'clean on a fresh page'}`);
out.summary.contaminated = allRows.filter((x) => x.contaminatedOnRetry).map((x) => `${x.view}_m${x.mode}`);
const seed = { m1RawMean13: 0.908, m3Mean13: 0.985, holdD: { net: 2.7, path: 23.7 } };
out.summary.seedCrossCheck = {
  m1RawMean13: { seed: seed.m1RawMean13, now: out.summary.m1?.rawMean13 ?? null },
  m3Mean13: { seed: seed.m3Mean13, now: out.summary.m3?.rawMean13 ?? null },
  holdD: { seed: seed.holdD, now: out.scripts.a4seed?.hold_D ?? null, a4D: out.scripts.a4?.keys?.D ? { net: out.scripts.a4.keys.D.net, path: out.scripts.a4.keys.D.path } : null },
};
out.summary.accept = acceptance();
out.summary.A3 = a3Summary();
out.summary.A11 = a11Summary();
out.timing.wallS = +((Date.now() - T0) / 1000).toFixed(1);
out.errors = [...new Set(out.errors)];

/**
 * A1 and A2's mode-1 clause (the camera step 4 proof), as written in CAMERA_SPEC §1 and as proposed for the
 * orchestrator to ratify (header, "Acceptance"). Only when the run holds the full P in mode 1 (no --filter).
 *   A1§5.3: a shut ray whose reason (cutout.why(), the row's `amber`) is 'nearBody' or 'terrain' counts as seen:
 *     the blocker stands within the 1 u the cut plane keeps, or is ground — §5.3 leaves both in the picture by
 *     design. noCut / noFade / unpatched / feather rays still count as shut.
 *   A2base: the mode-1 raw floor is this instrument's own pre-edit run (baseline.json), not the seed probe's 0.908
 *     (which reads candy_village at 1.0 where the §1 protocol reads 0.6).
 */
function acceptance() {
  const m1 = out.rows.filter((x) => x.mode === 1 && typeof x.vis === 'number');
  if (FILTER || m1.length !== P.length) return null;
  const GEOM = new Set(['nearBody', 'terrain']);
  const reason = (a) => a.slice(a.indexOf(':') + 1).replace(/!$/, '');
  const byView = (rs, k) => Object.fromEntries(rs.map((x) => [x.view, x[k]]));
  const m4 = (a) => +(a.reduce((q, x) => q + x, 0) / a.length).toFixed(4);
  const a1 = (val) => {
    const v = m1.map(val), at1 = v.filter((x) => x >= 1 - 1e-9).length, min = Math.min(...v);
    const at = (n) => val(m1.find((x) => x.view === n));
    const checks = [
      { id: 'cut-aware mean over P', value: m4(v), op: '>=', limit: 0.97 },
      { id: 'probes at 1.0', value: at1, op: '>=', limit: 13 },
      { id: 'lowest probe', value: +min.toFixed(4), op: '>=', limit: 0.8 },
      { id: 'occ_silhouette', value: at('occ_silhouette'), op: '>=', limit: 0.8 },
      { id: 'cat_residential', value: at('cat_residential'), op: '>=', limit: 0.8 },
    ];
    for (const c of checks) c.pass = c.value >= c.limit - 1e-9;
    return { pass: checks.every((c) => c.pass), checks, perProbe: Object.fromEntries(m1.map((x) => [x.view, +val(x).toFixed(4)])) };
  };
  const excusedGeom = (x) => (Array.isArray(x.amber) ? x.amber.filter((a) => !a.endsWith('!') && GEOM.has(reason(a))).length : 0);
  const res = {
    A1: a1((x) => x.vis),
    A1_5_3: { ...a1((x) => Math.min(1, x.vis + excusedGeom(x) / 5)), excusedRays: m1.filter((x) => excusedGeom(x)).map((x) => `${x.view} ${x.amber.filter((a) => GEOM.has(reason(a))).join(',')}`) },
  };
  let base = null;
  try { base = JSON.parse(fs.readFileSync(path.join(outDir, 'baseline.json'), 'utf8')); } catch { /* no baseline */ }
  const g13 = m1.filter((x) => GAMEPLAY13.has(x.view));
  const raw13 = m4(g13.map((x) => x.raw)), raw15 = m4(m1.map((x) => x.raw));
  const bRows = base ? (base.rows || []).filter((x) => x.mode === 1 && typeof x.raw === 'number') : [];
  const bRaw = byView(bRows, 'raw');
  const drops = m1.filter((x) => typeof bRaw[x.view] === 'number' && x.raw < bRaw[x.view] - 0.2 - 1e-9).map((x) => `${x.view} ${x.raw} vs ${bRaw[x.view]}`);
  const perProbe = { id: 'no probe raw more than 0.2 below its baseline.json row', value: drops.length, op: '==', limit: 0, pass: bRows.length === P.length && !drops.length, drops };
  res.A2m1 = { checks: [{ id: 'raw mean over the 13 (the seed number)', value: raw13, op: '>=', limit: 0.908, pass: raw13 >= 0.908 - 1e-9 }, perProbe] };
  res.A2m1.pass = res.A2m1.checks.every((c) => c.pass);
  if (bRows.length === P.length) {
    const b13 = m4(bRows.filter((x) => GAMEPLAY13.has(x.view)).map((x) => x.raw)), b15 = m4(bRows.map((x) => x.raw));
    res.A2m1_base = { baseline: { commit: base.meta?.commit ?? null, raw13: b13, raw15: b15 }, checks: [
      { id: 'raw mean over the 13 vs baseline.json', value: raw13, op: '>=', limit: b13, pass: raw13 >= b13 - 1e-9 },
      { id: 'raw mean over P vs baseline.json', value: raw15, op: '>=', limit: b15, pass: raw15 >= b15 - 1e-9 }, perProbe] };
    res.A2m1_base.pass = res.A2m1_base.checks.every((c) => c.pass);
  }
  return res;
}

/**
 * A3 (CAMERA_SPEC §1): over every probe row that ran (P in each mode, and the §9 rows with --s9), on every frame of
 * the row and at its end (the page's a3Read(), header): occDist ≥ 14 outdoors / ≥ 5.5 indoors (or the undollied
 * distance − 0.5 when that is shorter), and the cull only ever holding meshes ≤ 18 u. Scripts carry the same
 * reading as `a3` (informational: their frames walk, fly and ride, and A3 is written for the probes).
 */
function a3Summary() {
  const rows = [...out.rows, ...out.s9rows].filter((x) => x.a3);
  if (!rows.length) return null;
  const tag = (x) => `${x.view}_m${x.mode}`;
  const fails = rows.filter((x) => !x.a3.pass).map((x) => `${tag(x)}: occDist ${x.a3.at?.occDist} < ${x.a3.at?.need}${x.a3.culledOver.length ? ' · culled > 18 u: ' + x.a3.culledOver.join(', ') : ''}`);
  const low = rows.slice().sort((a, b) => a.a3.minMargin - b.a3.minMargin).slice(0, 5).map((x) => `${tag(x)} ${x.a3.at?.occDist} (floor ${x.a3.at?.need}${x.a3.at?.indoors ? ', indoors' : ''}, margin ${x.a3.minMargin})`);
  const perMode = {};
  for (const x of rows) {
    const k = (x.src === 'views/camera.json' ? 's9_' : '') + 'm' + x.mode;
    const e = perMode[k] || (perMode[k] = { n: 0, minOccDist: Infinity, pass: true });
    e.n++; e.minOccDist = Math.min(e.minOccDist, x.a3.at?.occDist ?? Infinity); e.pass = e.pass && x.a3.pass;
  }
  const indoorRows = rows.filter((x) => x.a3.indoors).map(tag);
  return { pass: !fails.length, rows: rows.length, fails, lowest: low, perMode, indoorRows,
    culledMax: Math.max(0, ...rows.map((x) => x.a3.culledMax || 0)), culledRows: rows.filter((x) => (x.culledList || []).length).map((x) => `${tag(x)} ${x.culledList.join(',')}`) };
}

/**
 * A11 static neutrality (CAMERA_SPEC §1; camera step 7), mode 1 only. References:
 *   · post5 (renders.noindex/camvis/post5.json, recorded at camera step 5 after the ladder re-role): every P row;
 *   · baseline (baseline.json, the pre-edit run) for the rows the old ladder never touched. baseline.json
 *     predates the goalDistance / tilt getters, so "untouched" is read as occLift == 0 and occDist within the
 *     idle breathing (±0.42 u, so 0.5) of the goal distance post5 records for the same view — the dolly never
 *     moved it. That picks the spec's own three (cat_gym, sky_dawn_harbor, candy_forest) plus candy_river
 *     (vis 0.8, so never a reference).
 * A reference row counts when it has vis 1.0 and its view has no walk, and THIS run's row has densityK < 0.05,
 * cutK == 0 and terrainLift < 0.01. It must match: lens position within 0.05 u, az / el within 0.002 rad, FOV
 * within 0.01°. Rows run on a page history other than the reference's are listed apart (not comparable).
 * A baseline comparison that fails while this row equals its post5 row (within the same tolerances) and post5
 * itself was already that far from the baseline is marked `inherited`: steps 1-5 moved it, the step being
 * judged did not. `pass` is A11 as written; `passExceptInherited` leaves the inherited ones out.
 */
function a11Summary() {
  const m1 = out.rows.filter((x) => x.mode === 1 && typeof x.vis === 'number');
  if (!m1.length) return null;
  const load = (t) => { try { return JSON.parse(fs.readFileSync(path.join(outDir, t + '.json'), 'utf8')); } catch { return null; } };
  const post5 = load('post5'), base = load('baseline');
  if (!post5) return { pass: false, why: 'renders.noindex/camvis/post5.json missing' };
  const byV = (j) => Object.fromEntries((j?.rows || []).filter((x) => x.mode === 1 && typeof x.vis === 'number').map((x) => [x.view, x]));
  const R5 = byV(post5), RB = byV(base);
  const hist = (x) => (x && x.page ? `${x.page.seq}:${x.page.sig}` : null);
  const refs = [], skipped = [], fails = [], notComparable = [];
  for (const x of m1) {
    const { v } = resolveP(x.view);
    const walk = !!(v && v.walk);
    const gate = [];
    if (walk) gate.push('walks');
    if (!(typeof x.densityK === 'number' && x.densityK < 0.05)) gate.push(`densityK ${x.densityK}`);
    if (x.cutK !== 0) gate.push(`cutK ${x.cutK}`);
    if (!(typeof x.terrainLift === 'number' && x.terrainLift < 0.01)) gate.push(`terrainLift ${x.terrainLift}`);
    const cands = [];
    const r5 = R5[x.view];
    if (r5 && r5.vis === 1) cands.push(['post5', r5]);
    const rb = RB[x.view];
    if (rb && rb.vis === 1 && rb.occLift === 0 && r5 && typeof r5.goalDistance === 'number' && Math.abs(rb.occDist - r5.goalDistance) <= 0.5) cands.push(['baseline', rb]);
    if (!cands.length) { skipped.push(`${x.view}: no reference (post5 vis ${r5 ? r5.vis : '–'})`); continue; }
    if (gate.length) { skipped.push(`${x.view}: ${gate.join(', ')}`); continue; }
    for (const [src, ref] of cands) {
      const dPos = Math.hypot(x.lens.pos[0] - ref.lens.pos[0], x.lens.pos[1] - ref.lens.pos[1], x.lens.pos[2] - ref.lens.pos[2]);
      const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
      const dAz = Math.abs(wrap(x.lens.az - ref.lens.az)), dEl = Math.abs(x.lens.el - ref.lens.el), dFov = Math.abs(x.lens.fov - ref.lens.fov);
      const e = { view: x.view, ref: src, dPos: +dPos.toFixed(4), dAz: +dAz.toFixed(5), dEl: +dEl.toFixed(5), dFov: +dFov.toFixed(4), pass: dPos <= 0.05 && dAz <= 0.002 && dEl <= 0.002 && dFov <= 0.01 };
      if (src === 'post5' && hist(ref) && hist(x) && hist(ref) !== hist(x)) { e.pageHistory = `${hist(x)} vs ${hist(ref)}`; notComparable.push(e); continue; }
      if (!e.pass && src === 'baseline' && r5) {
        const d5 = Math.hypot(x.lens.pos[0] - r5.lens.pos[0], x.lens.pos[1] - r5.lens.pos[1], x.lens.pos[2] - r5.lens.pos[2]);
        const same5 = d5 <= 0.05 && Math.abs(wrap(x.lens.az - r5.lens.az)) <= 0.002 && Math.abs(x.lens.el - r5.lens.el) <= 0.002 && Math.abs(x.lens.fov - r5.lens.fov) <= 0.01;
        const post5vsBase = Math.hypot(r5.lens.pos[0] - ref.lens.pos[0], r5.lens.pos[1] - ref.lens.pos[1], r5.lens.pos[2] - ref.lens.pos[2]);
        if (same5 && post5vsBase > 0.05) { e.inherited = true; e.post5VsBaseline = +post5vsBase.toFixed(4); }
      }
      refs.push(e);
      if (!e.pass) fails.push(`${x.view} vs ${src}: Δpos ${e.dPos} Δaz ${e.dAz} Δel ${e.dEl} Δfov ${e.dFov}${e.inherited ? ` (inherited: post5 is ${e.post5VsBaseline} u from the baseline too, this row equals post5)` : ''}`);
    }
  }
  const own = refs.filter((e) => !e.pass && !e.inherited);
  return { pass: refs.length > 0 && !fails.length, passExceptInherited: refs.length > 0 && !own.length, references: refs.length, refs, fails, skipped, notComparable, post5: post5.meta?.commit ?? null, baseline: base?.meta?.commit ?? null };
}

// ── write ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(outDir, TAG + '.json'), JSON.stringify(out, null, 1));
const md = [];
const f = (x, n = 3) => (x === null || x === undefined ? '–' : typeof x === 'number' ? String(+x.toFixed(n)) : String(x));
md.push(`# camvis · ${TAG}`, '', `commit ${commit} · ${out.meta.date} · protocol ${out.meta.protocol} · modes ${MODES.join(',')} · P from ${PSRC}${FILTER ? ' · filter ' + FILTER : ''}${args.s9 ? ' · §9' : ''} · scripts ${SCRIPTS.join(',') || 'none'} · ${W}×${H} · wall ${out.timing.wallS} s`, '');
md.push(`Comparable row-for-row only with runs made with the same --mode, --filter, --s9, --p-src, --pin, --script and --w/--h (header, "Isolation"); \`--diff\` enforces it. Retried rows: ${out.summary.retried.length} · still contaminated: ${out.summary.contaminated.join(', ') || 'none'}.`, '');
md.push(`impl: ${JSON.stringify(out.impl)}${PIN ? ` · camera-owned sources pinned to ${PIN}: ${JSON.stringify(out.meta.pinned)}` : ''}`, '');
md.push('## Summary (vis = cut-aware, raw = geometric; "13" = the seed probe\'s gameplay views)', '', '| mode | n | cut mean 13 | raw mean 13 | cut mean 15 | raw mean 15 | feather 15 | at 1.0 (13/15) | min | < 0.8 |', '|---|---|---|---|---|---|---|---|---|---|');
for (const m of MODES) { const s = out.summary['m' + m]; md.push(`| ${m} | ${s.n} | ${f(s.cutMean13)} | ${f(s.rawMean13)} | ${f(s.cutMean15)} | ${f(s.rawMean15)} | ${f(s.featherMean15)} | ${s.full13}/${s.full15} | ${f(s.min)} | ${s.below08.join(', ') || '–'} |`); }
md.push('', `Seed cross-check: m1 raw mean 13 = ${f(out.summary.seedCrossCheck.m1RawMean13.now)} (seed 0.908) · m3 mean 13 = ${f(out.summary.seedCrossCheck.m3Mean13.now)} (seed 0.985) · hold-D ${JSON.stringify(out.summary.seedCrossCheck.holdD.now)} (seed net 2.7 / path 23.7)`, '');
for (const m of MODES) { const s = out.summary['m' + m]; if (out.rows.some((x) => x.mode === m && typeof x.cutK === 'number')) md.push(`Window open for nothing (cutK ≥ 0.05 with raw 5/5 and, with --seen, < 0.5% of his pixels opened by it; else no ray opened by it), mode ${m}: ${s.cutIdle.join(', ') || 'none'}`, ''); }
for (const m of MODES) { const s = out.summary['m' + m]; if (s.allExcused15 !== null) md.push(`§5.3 amber, mode ${m}: ${s.allExcused15}/${s.n} rows have every shut ray in the accepted list (terrain, noCut/noFade, unpatched, within 1 u, feather); the window's own misses: ${s.unexcused.join('; ') || 'none'}`, ''); }
if (out.whatIf) md.push(`**WHAT-IF ${out.whatIf.kind}** (not the shipped world): ${out.whatIf.edit}; ${out.whatIf.n} noGhost mesh(es) on the page: ${out.whatIf.meshes.join(', ')}${out.whatIf.differs ? ` · the list differed on ${out.whatIf.differs} reloaded page(s)` : ''}`, '');
const acc = out.summary.accept;
if (acc) {
  const ck = (c) => `${c.pass ? 'PASS' : 'FAIL'} ${c.id}: ${f(c.value, 4)} (${c.op} ${f(c.limit, 4)})${c.drops?.length ? ' — ' + c.drops.join('; ') : ''}`;
  md.push('## Acceptance — camera step 4 proof (A1, A2 mode 1)', '', 'As written in CAMERA_SPEC §1, and as proposed for the orchestrator to ratify (header, "Acceptance"); the proposed lines are not the spec until it is amended.', '');
  md.push(`- **A1 as written: ${acc.A1.pass ? 'PASS' : 'FAIL'}** · ${acc.A1.checks.map(ck).join(' · ')}`);
  md.push(`- A1§5.3 (proposed: nearBody / terrain rays count as seen): ${acc.A1_5_3.pass ? 'PASS' : 'FAIL'} · ${acc.A1_5_3.checks.map(ck).join(' · ')} · excused: ${acc.A1_5_3.excusedRays.join('; ') || 'none'}`);
  md.push(`- **A2 mode 1 as written: ${acc.A2m1.pass ? 'PASS' : 'FAIL'}** · ${acc.A2m1.checks.map(ck).join(' · ')}`);
  if (acc.A2m1_base) md.push(`- A2base mode 1 (proposed: the floor is baseline.json @ ${acc.A2m1_base.baseline.commit}, raw ${acc.A2m1_base.baseline.raw13} over 13 / ${acc.A2m1_base.baseline.raw15} over P): ${acc.A2m1_base.pass ? 'PASS' : 'FAIL'} · ${acc.A2m1_base.checks.map(ck).join(' · ')}`);
  md.push('');
}
if (out.summary.A3) {
  const a = out.summary.A3;
  md.push('## A3 — the lens (occDist every frame of every probe row; the cull)', '', `- **A3: ${a.pass ? 'PASS' : 'FAIL'}** over ${a.rows} rows · per mode ${Object.entries(a.perMode).map(([k, e]) => `${k} ${e.pass ? 'pass' : 'FAIL'} (n ${e.n}, lowest occDist ${f(e.minOccDist, 2)})`).join(' · ')} · largest culled mesh ${f(a.culledMax, 2)} u (≤ 18) · indoor rows: ${a.indoorRows.join(', ') || 'none'}`,
    `- lowest margins: ${a.lowest.join(' · ')}`, `- rows with a culled mesh: ${a.culledRows.join(' · ') || 'none'}`, ...(a.fails.length ? [`- FAILS: ${a.fails.join(' · ')}`] : []), '');
}
if (out.summary.A11) {
  const a = out.summary.A11;
  md.push('## A11 — static neutrality (mode 1; references post5 + the untouched baseline rows)', '', `- **A11 as written: ${a.pass ? 'PASS' : 'FAIL'}** over ${a.references ?? 0} reference comparisons (post5 @ ${a.post5 ?? '–'}, baseline @ ${a.baseline ?? '–'}) · leaving out inherited baseline mismatches: ${a.passExceptInherited ? 'PASS' : 'FAIL'}${a.why ? ' · ' + a.why : ''}`,
    ...(a.refs || []).map((e) => `- ${e.pass ? 'PASS' : e.inherited ? 'FAIL (inherited)' : 'FAIL'} ${e.view} vs ${e.ref}: Δpos ${e.dPos} u · Δaz ${e.dAz} · Δel ${e.dEl} rad · Δfov ${e.dFov}°${e.inherited ? ` — post5 is ${e.post5VsBaseline} u from the baseline too` : ''}`),
    `- not references this run: ${(a.skipped || []).join(' · ') || 'none'}`, ...(a.notComparable?.length ? [`- not comparable (page history): ${a.notComparable.map((e) => `${e.view} ${e.pageHistory}`).join(' · ')}`] : []), '');
}
const why = (x) => (x.cutWhy ? [x.cutWhy.sweep ? 'sweep' : '', x.cutWhy.col ? 'col' : ''].filter(Boolean).join('+') || '–' : '');
md.push('## Rows', '', '| view | src | m | vis | raw | fth | cutK | cut why | amber | occDist | goalD | lift | tilt | pin | p.dist | cur.el | lens eff | lens y−ground | clamp | blocked | page | note |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const note = (x) => [x.retried ? `retried (first: ${x.contaminated.join(', ')}; vis ${x.firstAttempt.vis})` : '', x.contaminatedOnRetry ? `**STILL CONTAMINATED: ${x.contaminatedOnRetry.join(', ')}**` : '',
  x.reloadedBefore ? `fresh page (${x.reloadedBefore.by} left ${x.reloadedBefore.left.join(', ')})` : '', x.authoredState ? `authored: ${x.authoredState.join(', ')}` : ''].filter(Boolean).join('; ');
for (const x of [...out.rows, ...out.s9rows]) {
  if (typeof x.vis !== 'number') { md.push(`| ${x.view} | – | ${x.mode} | ${x.status || '?'} ||||||||||||||||`); continue; }
  md.push(`| ${x.view} | ${x.src} | ${x.mode} | ${f(x.vis)} | ${f(x.raw)} | ${f(x.feather)} | ${f(x.cutK)} | ${why(x)} | ${(x.amber || []).join(' ')} | ${f(x.occDist, 2)} | ${f(x.goalDistance, 2)} | ${f(x.occLift)} | ${f(x.tilt)} | ${f(x.pinned)} | ${f(x.params.distance, 2)} | ${f(x.current.elevation)} | ${f(x.lens.eff, 1)} | ${f(x.lens.pos[1] - x.lens.ground, 1)} | ${x.lens.clamp ? 'yes' : ''} | ${x.blocked.join('; ')} | ${x.page ? x.page.seq : '–'} | ${note(x)} |`);
}
if (out.reloads.length) md.push('', `Page reloads: ${out.reloads.map((x) => `before ${x.before} (${x.why}: ${x.left.join(', ')})`).join(' · ')}`);
if (out.summary.retried.length) {
  md.push('', '## Contamination (rows re-run once on a fresh page; each row keeps the retry\'s numbers and frame)', '');
  for (const x of allRows.filter((y) => y.retried)) {
    md.push(`- ${x.view} m${x.mode}: the first attempt picked up ${x.contaminated.join(', ')} (vis ${x.firstAttempt.vis}, raw ${x.firstAttempt.raw}, visitor at ${JSON.stringify(x.firstAttempt.player)}, after ${x.firstAttempt.page.seq} items on its page) → retry: vis ${x.vis}, raw ${x.raw}, visitor at ${JSON.stringify(x.player)}${x.contaminatedOnRetry ? ` · **STILL CONTAMINATED: ${x.contaminatedOnRetry.join(', ')}** (judge the frame by eye)` : ' · clean'}`);
  }
}
md.push('', '## Scripts', '');
for (const [id, s] of Object.entries(out.scripts)) {
  md.push(`### ${id} — ${s.status}${s.why ? ' (' + s.why + ')' : ''}`);
  const all = [...(s.checks || [])];
  for (const k of ['traversal', 'ferryDeck', 'determinism', 'flying']) if (s[k]?.checks) all.push(...s[k].checks); else if (s[k]?.status) md.push(`- ${k}: ${s[k].status}${s[k].why ? ' (' + s[k].why + ')' : ''}`);
  for (const c of s.camUpdate || []) all.push(...c.checks);
  for (const c of s.lensElev || []) { all.push(c.check.value === null ? c.proxyCheck : c.check); }
  for (const c of s.interiors || []) all.push(...(c.checks || []));
  for (const c of s.horizon || []) all.push(...(c.checks || []));
  for (const c of s.horizon || []) if (c.sky) md.push(`- ${c.view} m2 last frame: band ${c.sky.bandPct}% of height · open sky ${c.sky.openPct}% of the band (${c.sky.openFramePct}% of the frame) · ${c.sky.colsOpen}/16 columns ≥ 25% open · lens ${c.end.occDist}/${c.end.goalDist} u, ${c.end.lensAboveFeet} u over the feet · vis ${c.end.vis}/5 · band filled by ${Object.entries(c.sky.by).sort((a, b) => b[1].n - a[1].n).map(([k, e]) => `${k} ×${e.n}${e.near !== null ? ' @' + e.near : ''}`).join(', ') || '—'}`);
  for (const c of all) md.push(`- ${c.pass ? 'PASS' : 'FAIL'} ${c.id}: ${f(c.value, 4)} (${c.op || ''} ${c.limit ?? ''})`);
  for (const c of s.predict || []) md.push(`- (not a gate) ${c.pass ? 'would pass' : 'would fail'} ${c.id}: ${f(c.value, 4)} (${c.op || ''} ${c.limit ?? ''})`);
  if (id === 'a6x') for (const k of ['toward', 'away']) if (s[k]) md.push(`- ${k}: shipped ${s[k].shipped.dist} · lead 0 ${s[k].lead0.dist} · old ladder held off ${s[k].ladderHeld.dist} · both ${s[k].ladderHeldLead0.dist} (lead adds ${s[k].leadGain} / ${s[k].leadGainLadderHeld} with the ladder held; the ladder takes ${s[k].ladderCost}) · flat-plane edge ${s[k].shipped.flatEdge} / ${s[k].ladderHeld.flatEdge} held · ground rise at 5-25 u ${JSON.stringify(s[k].groundRise)}`);
  if (id === 'a4seed') md.push('- ' + JSON.stringify(s));
  if (id === 'seed') { md.push(`- shipped mean ${s.shippedMean} (seed 0.908) · overhead_mode3 mean ${s.overheadMean} (seed 0.985)`); for (const x of s.rows || []) if (x.vis < 1) md.push(`  - ${x.view} ${x.cfg} vis ${x.vis} eff ${x.eff} ${x.by.join(' | ')}`); }
  md.push('');
}
md.push('## Timing (wall clock; stripped for A12)', '', `machine ${out.timing.machine} · GL ${out.timing.glRenderer}`, '', `frameMs ${JSON.stringify(out.timing.frameMs)} · frame ${JSON.stringify(out.frame)}${out.timing.perf ? ' · perf ' + JSON.stringify(out.timing.perf) : ''}`, '');
md.push(`## Console: ${out.errors.length} error(s) · ${out.warnings} warning(s) (the systems' build logs)`, '', ...out.errors.slice(0, 30).map((e) => '- ' + e), '');
fs.writeFileSync(path.join(outDir, TAG + '.md'), md.join('\n'));
console.log(`wrote ${path.relative(root, path.join(outDir, TAG + '.json'))} (${out.rows.length} rows, ${out.s9rows.length} §9 rows, scripts ${Object.keys(out.scripts).join(',') || 'none'}) + .md · ${out.errors.length} console errors · ${out.warnings} warnings · ${out.reloads.length} page reload(s) · ${out.summary.retried.length} retried row(s), ${out.summary.contaminated.length} still contaminated · ${out.timing.wallS} s${PIN ? ' · pinned ' + JSON.stringify(out.meta.pinned) : ''}`);
if (out.summary.retried.length) console.log('retried: ' + out.summary.retried.join(' · '));
