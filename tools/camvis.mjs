// camvis — the camera acceptance instrument (docs/CAMERA_SPEC.md §1, §7, §8 step 0).
//
//   node tools/camvis.mjs --tag baseline                       # probe set P × modes 1/2/3 + every script
//   node tools/camvis.mjs --tag x --filter cat_ --script none  # a quick subset, no scripts
//   node tools/camvis.mjs --tag before --mode 1,2 --script none --s9 --shots renders/cam_before
//   node tools/camvis.mjs --tag perf --script perf [--gl hw] [--perf-frames 600]   # A13 (live loop, ?camvis=perf)
//   node tools/camvis.mjs --diff baseline,run2                 # offline: compare two runs minus the timing block (A12)
//
// Options
//   --tag <name>        output renders.noindex/camvis/<tag>.json + <tag>.md (default "run")
//   --mode 1,2,3        modes for the probe rows (default all three)
//   --filter <substr>   only probe / §9 views whose name contains it
//   --script <list>     a4,a5,a6,a7,a8,a9,a10,s7,seed | all | none (default all; perf only when named)
//                       (seed = tools/_tmp/camprobe.mjs's own probe protocol, the §1 cross-check)
//   --s9                also run every view in tools/views/camera.json (§9) as rows (view-major, own
//                       camera.setMode replaced by the row's mode; a view that asks for mode 3 also gets m3)
//   --shots <dir>       render each row at --w × --h (default 1600 × 1000) to <dir>/<view>_m<mode>.png
//   --p-src merged|viewsjson   how P names resolve: "merged" (default) = exactly what render.mjs --view uses
//                       (tools/views.json, then tools/views/*.json in readdir order, later files win);
//                       "viewsjson" = tools/views.json's own entry when it has one
//   --wait <min>        how long to queue for a render slot (default 15, as render.mjs)
//   --no-frame          skip the SwiftShader frameMs sample (A13's render-side number)
//   --pin <commit>      serve the camera-owned sources (src/core/input.js, src/systems/camera.js,
//                       src/systems/ui/hotbar.js, src/systems/camera/*.js) from <commit> instead of the
//                       working tree, via request interception; everything else stays live. The pre-edit
//                       baseline is recorded with --pin b7ad15a (the commit before any camera edit).
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
  const load = (t) => { const j = JSON.parse(fs.readFileSync(path.join(outDir, t + '.json'), 'utf8')); delete j.timing; delete j.meta; return j; };
  const A = load(a), B = load(b);
  const diffs = [];
  const walk = (x, y, p) => {
    if (diffs.length > 200) return;
    if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y) || (x === null) !== (y === null)) { diffs.push(`${p}: ${JSON.stringify(x)} ≠ ${JSON.stringify(y)}`); return; }
    if (x && typeof x === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + '.' + k); return; }
    if (x !== y) diffs.push(`${p}: ${JSON.stringify(x)} ≠ ${JSON.stringify(y)}`);
  };
  walk(A, B, '');
  console.log(diffs.length ? `${diffs.length} difference(s):\n  ` + diffs.slice(0, 60).join('\n  ') : `identical (timing and meta stripped): ${a} == ${b}`);
  process.exit(diffs.length ? 1 : 0);
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
    if (opts.noStep) return calls;
    if (v.walk) g.walk({ x: v.walk.x, y: v.walk.y }, v.walk.n || 30);
    g.step(v.frames ?? 45, 1 / 30);
    ctx.scene.updateMatrixWorld(true);
    return calls;
  }
  /** World state that leaks from one view into the next in a shared session (a tiger carrying the
   *  visitor off to bed at 21:00, a ferry crossing, a flight, an open card): camvis reloads the page
   *  before the next view when any of it is present, so every row starts from a clean world. */
  function dirty() {
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
    if (document.querySelector('.cci-cardwrap.cci-hit')) r.push('ui card open');
    return r;
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
    const calls = setup(v, m, opts);
    const out = row(name, m, v, src, calls);
    const timing = { ms: performance.now() - t0, camMs: get('camMs'), occMs: cam().occMs };
    return { row: out, timing };
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
  function a6() {
    const out = { status: 'ok', setup: 'mode 1 at (-110,-45), virtual (0,∓1.58) 45 frames, frames 0 (cam_walk_toward_lens / cam_walk_away)', checks: [] };
    for (const [label, y, want, lim] of [['toward', -1.58, 'bottom', 14], ['away', 1.58, 'top', 22]]) {
      setup({ ...MEADOW, frames: 0 }, 1, { noStep: true });
      const tr = hold({ x: 0, y }, 45);
      const a = tr[tr.length - 6], b = tr[tr.length - 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const dir = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
      const P0 = pl().position;
      const e = edgeAlong({ x: P0.x, z: P0.z }, dir);
      out[label] = { ...e, speed: r(L * 6, 3), wantEdge: want };
      out.checks.push(chk(`${label}: ground to the ${want} edge (u)`, e.edge === want ? e.dist : null, '>=', lim));
    }
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
    // (e) interiors own their framing, in both modes; cave azimuth writers
    out.interiors = [];
    for (const nm of ['candy_in_house0', 'cat_in_meow', 'palace_throne_play', 'cave_corridor']) {
      const v = V[nm]; if (!v) { out.interiors.push({ view: nm, status: 'view missing' }); continue; }
      for (const m of [1, 2]) {
        const calls = setup(v, m, { noStep: true });
        const writers = {};
        let azVal = c.params.azimuth;
        Object.defineProperty(c.params, 'azimuth', {
          configurable: true, enumerable: true, get: () => azVal,
          set: (x) => { const k = writerChain(); writers[k] = (writers[k] || 0) + 1; azVal = x; },
        });
        if (v.walk) g.walk({ x: v.walk.x, y: v.walk.y }, v.walk.n || 30);
        g.step(v.frames ?? 45, 1 / 30);
        Object.defineProperty(c.params, 'azimuth', { configurable: true, enumerable: true, writable: true, value: azVal });
        ctx.scene.updateMatrixWorld(true);
        fwd(_f); _d.copy(c.target).sub(C.position).normalize();
        out.interiors.push({ view: nm, mode: m, calls, params: { elevation: r(c.params.elevation, 4), distance: r(c.params.distance, 4), azimuth: r(c.params.azimuth, 4), fov: r(c.params.fov, 3) },
          current: { elevation: r(c.current.elevation, 4), distance: r(c.current.distance, 4), azimuth: r(c.current.azimuth, 4) }, camFov: r(C.fov, 3),
          occYaw: get('occYaw'), densityK: get('densityK'), pitch: r(elevOf(_f) - elevOf(_d), 5), azWriters: writers,
          checks: [chk(`${nm} m${m}: cam.fov == p.fov`, Math.abs(C.fov - c.params.fov), '<=', 0.01),
            chk(`${nm} m${m}: current.azimuth follows params.azimuth`, Math.abs(wrap(c.current.azimuth - c.params.azimuth)), '<=', 0.02)] });
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

  window.__cv = { impl, probe, renderNow, undo: undoSticky, dirty, a4, seedHoldD, seedProbe, a5, a6, a7, a8, a9, a10, s7,
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

// ── run ───────────────────────────────────────────────────────────────────────
const T0 = Date.now();
const r3 = (x) => (typeof x === 'number' ? +x.toFixed(3) : x);
let commit = '?'; try { commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch {}
const out = {
  meta: { tag: TAG, commit, date: new Date().toISOString(), modes: MODES, filter: FILTER, scripts: SCRIPTS, s9: !!args.s9, pSrc: PSRC, shots: SHOTS ? path.relative(root, SHOTS) : null, w: W, h: H, pin: PIN, pinned: {} },
  impl: null, rows: [], s9rows: [], summary: {}, scripts: {}, frame: {}, reloads: [], errors: [], warnings: 0,
  timing: { machine: `${os.hostname()} · ${os.cpus()[0]?.model} · ${os.platform()} ${os.release()}`, userAgent: null, glRenderer: null, rows: {}, scripts: {}, frameMs: {} },
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
    await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 300000 });
    out.impl = await page.evaluate(pageLib);
    const env = await page.evaluate(() => ({ ua: window.__cv.ua, gl: window.__cv.gl }));
    out.timing.userAgent = env.ua; out.timing.glRenderer = env.gl;
    console.log(`camvis ${TAG}: page ready in ${((Date.now() - T0) / 1000).toFixed(0)} s · impl ${JSON.stringify(out.impl)}`);
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    // isolation: reload before `label` when the previous view left sticky world state behind
    const isolate = async (label) => {
      const d = await page.evaluate(() => window.__cv.dirty());
      if (!d.length) return null;
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 300000 });
      await page.evaluate(pageLib);
      out.reloads.push({ before: label, dirty: d });
      console.log(`  reloaded before ${label} (left behind: ${d.join(', ')})`);
      return d;
    };

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
        const iso = await isolate(`${name}_m${m}`);
        const res = await page.evaluate(([name, v, m, src]) => window.__cv.probe(name, v, m, src), [name, v, m, src]);
        if (iso) res.row.isolated = iso;
        out.rows.push(res.row);
        out.timing.rows[`${name}_m${m}`] = { ms: r3(res.timing.ms), camMs: res.timing.camMs, occMs: r3(res.timing.occMs) };
        const f = await shoot(name, m);
        await page.evaluate((v) => window.__cv.undo(v), v);
        const rw = res.row;
        console.log(`${name.padEnd(20)} m${m} vis ${rw.vis} raw ${rw.raw} occDist ${rw.occDist} eff ${rw.lens.eff} p.dist ${rw.params.distance}${rw.lens.clamp ? ' CLAMP' : ''} ${rw.blocked.join(' | ')}${f ? ' → ' + path.relative(root, f) : ''}`);
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
          const iso = await isolate(`${name}_m${m}`);
          const res = await page.evaluate(([name, v, m]) => window.__cv.probe(name, v, m, 'views/camera.json', { forceMode: true }), [name, v, m]);
          if (iso) res.row.isolated = iso;
          out.s9rows.push(res.row);
          out.timing.rows[`${name}_m${m}`] = { ms: r3(res.timing.ms), camMs: res.timing.camMs, occMs: r3(res.timing.occMs) };
          const f = await shoot(name, m);
          await page.evaluate((v) => window.__cv.undo(v), v);
          const rw = res.row;
          console.log(`§9 ${name.padEnd(24)} m${m} vis ${rw.vis} raw ${rw.raw} eff ${rw.lens.eff}${rw.calls ? ' calls ' + rw.calls.map((c) => c.path + ':' + c.status).join(',') : ''}${f ? ' → ' + path.relative(root, f) : ''}`);
        }
      }
    }

    // scripts
    const run = async (id, fnSrc, arg) => {
      await isolate(`script ${id}`);
      const t = Date.now();
      try { out.scripts[id] = await page.evaluate(fnSrc, arg); }
      catch (e) { out.scripts[id] = { status: 'error', error: String(e.message).slice(0, 400) }; }
      out.timing.scripts[id] = Date.now() - t;
      const s = out.scripts[id];
      const ck = s.checks || [];
      console.log(`script ${id}: ${s.status}${ck.length ? ' · ' + ck.filter((c) => c.pass).length + '/' + ck.length + ' pass' : ''}${s.error ? ' · ' + s.error : ''}`);
    };
    const V = {};
    for (const n of ['ferry_deck', 'cam_moon_moment', 'candy_in_house0', 'cat_in_meow', 'palace_throne_play', 'cave_corridor', 'candy_arrival', 'cam_follow_street', 'cam_flying']) if (views[n]) V[n] = views[n];
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
  };
}
const seed = { m1RawMean13: 0.908, m3Mean13: 0.985, holdD: { net: 2.7, path: 23.7 } };
out.summary.seedCrossCheck = {
  m1RawMean13: { seed: seed.m1RawMean13, now: out.summary.m1?.rawMean13 ?? null },
  m3Mean13: { seed: seed.m3Mean13, now: out.summary.m3?.rawMean13 ?? null },
  holdD: { seed: seed.holdD, now: out.scripts.a4seed?.hold_D ?? null, a4D: out.scripts.a4?.keys?.D ? { net: out.scripts.a4.keys.D.net, path: out.scripts.a4.keys.D.path } : null },
};
out.timing.wallS = +((Date.now() - T0) / 1000).toFixed(1);
out.errors = [...new Set(out.errors)];

// ── write ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(outDir, TAG + '.json'), JSON.stringify(out, null, 1));
const md = [];
const f = (x, n = 3) => (x === null || x === undefined ? '–' : typeof x === 'number' ? String(+x.toFixed(n)) : String(x));
md.push(`# camvis · ${TAG}`, '', `commit ${commit} · ${out.meta.date} · modes ${MODES.join(',')} · P from ${PSRC}${FILTER ? ' · filter ' + FILTER : ''} · ${W}×${H} · wall ${out.timing.wallS} s`, '');
md.push(`impl: ${JSON.stringify(out.impl)}${PIN ? ` · camera-owned sources pinned to ${PIN}: ${JSON.stringify(out.meta.pinned)}` : ''}`, '');
md.push('## Summary (vis = cut-aware, raw = geometric; "13" = the seed probe\'s gameplay views)', '', '| mode | n | cut mean 13 | raw mean 13 | cut mean 15 | raw mean 15 | feather 15 | at 1.0 (13/15) | min | < 0.8 |', '|---|---|---|---|---|---|---|---|---|---|');
for (const m of MODES) { const s = out.summary['m' + m]; md.push(`| ${m} | ${s.n} | ${f(s.cutMean13)} | ${f(s.rawMean13)} | ${f(s.cutMean15)} | ${f(s.rawMean15)} | ${f(s.featherMean15)} | ${s.full13}/${s.full15} | ${f(s.min)} | ${s.below08.join(', ') || '–'} |`); }
md.push('', `Seed cross-check: m1 raw mean 13 = ${f(out.summary.seedCrossCheck.m1RawMean13.now)} (seed 0.908) · m3 mean 13 = ${f(out.summary.seedCrossCheck.m3Mean13.now)} (seed 0.985) · hold-D ${JSON.stringify(out.summary.seedCrossCheck.holdD.now)} (seed net 2.7 / path 23.7)`, '');
md.push('## Rows', '', '| view | src | m | vis | raw | fth | occDist | goalD | lift | tilt | pin | p.dist | cur.el | lens eff | lens y−ground | clamp | blocked |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const x of [...out.rows, ...out.s9rows]) {
  if (typeof x.vis !== 'number') { md.push(`| ${x.view} | – | ${x.mode} | ${x.status || '?'} |||||||||||||`); continue; }
  md.push(`| ${x.view} | ${x.src} | ${x.mode} | ${f(x.vis)} | ${f(x.raw)} | ${f(x.feather)} | ${f(x.occDist, 2)} | ${f(x.goalDistance, 2)} | ${f(x.occLift)} | ${f(x.tilt)} | ${f(x.pinned)} | ${f(x.params.distance, 2)} | ${f(x.current.elevation)} | ${f(x.lens.eff, 1)} | ${f(x.lens.pos[1] - x.lens.ground, 1)} | ${x.lens.clamp ? 'yes' : ''} | ${x.blocked.join('; ')} |`);
}
if (out.reloads.length) md.push('', `Isolation reloads: ${out.reloads.map((x) => `before ${x.before} (${x.dirty.join(', ')})`).join(' · ')}`);
md.push('', '## Scripts', '');
for (const [id, s] of Object.entries(out.scripts)) {
  md.push(`### ${id} — ${s.status}${s.why ? ' (' + s.why + ')' : ''}`);
  const all = [...(s.checks || [])];
  for (const k of ['traversal', 'ferryDeck', 'determinism', 'flying']) if (s[k]?.checks) all.push(...s[k].checks); else if (s[k]?.status) md.push(`- ${k}: ${s[k].status}${s[k].why ? ' (' + s[k].why + ')' : ''}`);
  for (const c of s.camUpdate || []) all.push(...c.checks);
  for (const c of s.lensElev || []) { all.push(c.check.value === null ? c.proxyCheck : c.check); }
  for (const c of s.interiors || []) all.push(...(c.checks || []));
  for (const c of all) md.push(`- ${c.pass ? 'PASS' : 'FAIL'} ${c.id}: ${f(c.value, 4)} (${c.op || ''} ${c.limit ?? ''})`);
  if (id === 'a4seed') md.push('- ' + JSON.stringify(s));
  if (id === 'seed') { md.push(`- shipped mean ${s.shippedMean} (seed 0.908) · overhead_mode3 mean ${s.overheadMean} (seed 0.985)`); for (const x of s.rows || []) if (x.vis < 1) md.push(`  - ${x.view} ${x.cfg} vis ${x.vis} eff ${x.eff} ${x.by.join(' | ')}`); }
  md.push('');
}
md.push('## Timing (wall clock; stripped for A12)', '', `machine ${out.timing.machine} · GL ${out.timing.glRenderer}`, '', `frameMs ${JSON.stringify(out.timing.frameMs)} · frame ${JSON.stringify(out.frame)}${out.timing.perf ? ' · perf ' + JSON.stringify(out.timing.perf) : ''}`, '');
md.push(`## Console: ${out.errors.length} error(s) · ${out.warnings} warning(s) (the systems' build logs)`, '', ...out.errors.slice(0, 30).map((e) => '- ' + e), '');
fs.writeFileSync(path.join(outDir, TAG + '.md'), md.join('\n'));
console.log(`wrote ${path.relative(root, path.join(outDir, TAG + '.json'))} (${out.rows.length} rows, ${out.s9rows.length} §9 rows, scripts ${Object.keys(out.scripts).join(',') || 'none'}) + .md · ${out.errors.length} console errors · ${out.warnings} warnings · ${out.timing.wallS} s${PIN ? ' · pinned ' + JSON.stringify(out.meta.pinned) : ''}`);
