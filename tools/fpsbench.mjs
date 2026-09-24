// Desktop FRAME-RATE bench on HARDWARE GL (BRIEF Contract J). Read-only on game files.
//
//   node tools/fpsbench.mjs --label baseline                  # everything: 7 spots + dusk + day/night cycle + 60 s walk
//   node tools/fpsbench.mjs --label x --spots candy_village,cat_plaza --frames 600
//   node tools/fpsbench.mjs --label x --dusk                  # only the dusk transition (18.3 → 20.0 at game speed)
//   node tools/fpsbench.mjs --label x --walk --walk-sec 60    # only the free walk (4 directions, live input)
//   node tools/fpsbench.mjs --label x --cycle                 # only the 24 h scan (point lights, programs, recompiles)
//   node tools/fpsbench.mjs --label x --spots cat_plaza --no-toggle --no-deep --no-dirty   # quick fps-only check
//   node tools/fpsbench.mjs --label x --spots sea_crossing --patch "src/systems/terrain/water.js|const MOBILE = !!ctx.state?.mobile;|const MOBILE = true;"
//                                            # WHAT-IF: measure a proposed trim with the file served patched in flight
//   other: --dpr 1.5 · --q high|mobile · --params "cut=0" · --reps 5 · --settle 150 · --deep-frames 300 · --no-whatif
//
// Giving any of --spots / --dusk / --walk / --cycle runs only those; giving none runs all of them.
// How it measures (why not the render harness): tools/render.mjs is SwiftShader in ?shot mode — no RAF loop, no
// frame rate. This opens Google Chrome HEADED (channel 'chrome', ANGLE Metal on the M1 Pro), 1600x1000 css at
// deviceScaleFactor 2 (the renderer caps at 2× → a 3200x2000 drawing buffer), WITHOUT ?shot so the game's own
// requestAnimationFrame loop runs, with ?prof=1 (main.js's per-system timing, game.prof()). The title card is
// dismissed with a real keydown and the opening cinematic skipped (intro.skip() until 'intro:cinematic:done').
// Both render-gate slots (renders/.locks, the render.mjs protocol) are held for the whole run so no SwiftShader
// render competes for the CPU, and the load average is recorded with every section. caffeinate keeps the display
// awake (a sleeping display stops vsync and RAF).
//
// Per spot (pose = tools/mobilebench.mjs SPOT_DEFS, i.e. the same numbers as docs/PERF_AUDIT.md; camera mode 1 with
// the default lens, then the view's own az/el/dist):
//   1. CLEAN SAMPLE  --frames RAF frames after a --settle: frame interval (RAF timestamps → fps median, p95, max,
//      frames > 16.7 / 25 / 40 ms), main-thread work per frame (RAF start → end of the game's tick), update() sum,
//      renderer.render() CPU, GPU time per frame (EXT_disjoint_timer_query_webgl2 around renderer.render: shadow +
//      main pass), per-system update() ms per frame (+ game.prof()), whole-scene traverse() and raycast time per
//      system per frame, GL draws / useProgram / buffer + texture upload bytes / shader compiles per frame (WebGL
//      prototype counters), camera sweep frames (camera.occMs changes), JS heap per frame (precise memory info;
//      gc() before the sample) → heap growth, allocation rate lower bound, minor-GC count.
//   2. ATTRIBUTION   one render with renderBufferDirect hooked: main-pass and shadow-pass calls / tris per system
//      (top-level scene child → the system whose create()/update() added it; main.js is instrumented IN FLIGHT via
//      page.route, never on disk), frustumCulled=false draws and how many of those are wholly OFF-SCREEN (wasted);
//      lights, shadow map, textures (size, anisotropy, estimated MB), shadow casters per system.
//   3. TOGGLES       render + readPixels (sync ms) and GPU timer per config, median of --reps: base, no shadow pass,
//      each system's renderables hidden (Δ = its whole cost, main + shadow), each system's castShadow off (Δ =
//      its shadow-pass cost), named objects (mist, silhouettes, sea …), and the off-screen frustumCulled=false
//      set hidden (= what turning frustum culling back on would save). Lights are never hidden in these (a light-
//      count change recompiles every lit program). Then WHAT-IFS (--no-whatif to skip): the zero-intensity point
//      lights hidden, all point lights hidden, pixel ratio 1.5 and 1, the sun's shadow map at 2048 — each measured
//      paired after a discarded render that absorbs the recompile / reallocation, and undone exactly. Pairing: Apple
//      GPUs down-clock between sparse renders, so each config gets its own base right before it after a clock ramp.
//   4. DIRTY         which attributes / textures are re-uploaded every frame (version bumps over --dirty-frames,
//      per system, bytes/frame) + DOM mutations per frame (MutationObserver) — Contract J's upload/DOM churn list.
//   5. DEEP          --deep-frames under the V8 CPU profiler (self + inclusive time by function and file, GC ms)
//      and the sampling heap profiler with collected objects (allocation rate, top allocation sites and the game
//      frame that owns them). Profiler overhead inflates these frames: never read fps from this pass.
// Dusk: a FRESH page (cold shader cache, as a first-time player) at --dusk-at, setTime(--dusk-from), clock running
//   at game speed to --dusk-to: every frame's interval, GL compiles/links, program count, visible/lit point lights,
//   shadow-casting directional lights. Cycle: setTime(h) for every hour (+ the dusk/dawn half hours), 30 frames
//   each: lights, programs, compiles, max frame. Walk: camera mode --walk-mode (2 = the follow camera the game
//   hands back after the intro), 4 live directions for --walk-sec total (ctx.input.virtual, as game.walk does,
//   but under the real RAF loop — game.walk itself ticks synchronously and would BE a hitch), hitches with position.
// Output: renders/w3_perf/<label>.json + <label>.md (the md is the human table; the json has every per-frame series).
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { spawn, execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const args = Object.fromEntries(argv.map((a, i, arr) => a.startsWith('--') ? [a.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true] : []).filter(Boolean));
const PORT = args.port || 8787;
const root = path.resolve(new URL('..', import.meta.url).pathname);
const OUTDIR = path.resolve(root, typeof args.outdir === 'string' ? args.outdir : 'renders/w3_perf');
fs.mkdirSync(OUTDIR, { recursive: true });
const LABEL = typeof args.label === 'string' ? args.label : 'run';
const num = (k, d) => (args[k] === undefined || args[k] === true ? d : Number(args[k]));
const FRAMES = num('frames', 600), SETTLE = num('settle', 150), DEEP_FRAMES = num('deep-frames', 300), REPS = num('reps', 5);
const DIRTY_FRAMES = num('dirty-frames', 30);
const W = num('w', 1600), H = num('h', 1000), DPR = num('dpr', 2), MODE = num('mode', 1), WALK_MODE = num('walk-mode', 2);
const GL = typeof args.gl === 'string' ? args.gl : 'hw';
const Q = typeof args.q === 'string' ? args.q : null;
const EXTRA = typeof args.params === 'string' ? args.params.replace(/^[?&]/, '') : '';
const DUSK_FROM = num('dusk-from', 18.3), DUSK_TO = num('dusk-to', 20.0);
const DUSK_AT = typeof args['dusk-at'] === 'string' ? args['dusk-at'] : 'candy_village';
const WALK_AT = typeof args['walk-at'] === 'string' ? args['walk-at'] : 'candy_village';
const WALK_SEC = num('walk-sec', 60), WALK_TIME = num('walk-time', 11);
// --patch "src/x.js|from|to;;src/y.js|from|to": serve those files with the substitution IN FLIGHT (never on disk) to
// measure a proposed trim on hardware before anyone edits the owner's file; a patch that matches nothing aborts.
const PATCHES = (typeof args.patch === 'string' ? args.patch : '').split(/;;(?=\/?src\/)/).filter(Boolean).map((x) => { const [file, from, to] = x.split('|'); if (!file || from === undefined || to === undefined) throw new Error('bad --patch ' + x); return { file: file.replace(/^\//, ''), from, to, hits: null }; });
const OBJ_TOGGLES = String(typeof args.objs === 'string' ? args.objs : 'mist,silhouette,terrain_sea,cloud').split(',').filter(Boolean);

// ── views (same merge rule as tools/render.mjs) and the spot poses (= tools/mobilebench.mjs SPOT_DEFS) ──────────
const views = JSON.parse(fs.readFileSync(path.join(root, 'tools/views.json'), 'utf8'));
const vdir = path.join(root, 'tools/views');
if (fs.existsSync(vdir)) for (const f of fs.readdirSync(vdir)) if (f.endsWith('.json')) { try { Object.assign(views, JSON.parse(fs.readFileSync(path.join(vdir, f), 'utf8'))); } catch { /* another builder's file mid-write */ } }
const SPOT_DEFS = {
  candy_village: { pos: [-140, 40], time: 11 },
  cat_main_street: views.cat_main_street || { pos: [118, 0], time: 12 },
  cat_plaza: views.cat_plaza || { pos: [78, 18], time: 11 },
  candy_forest: views.candy_forest || { pos: [-200, -20], time: 14 },
  candy_night: { pos: [-140, 40], time: 23 },
  sea_crossing: views.sea_crossing || { free: [0, 22], az: 0.5, el: 0.5, dist: 90, time: 17 },
  cat_residential: views.cat_residential || { pos: [178, 48], az: 0.78, el: 0.68, dist: 86, time: 15 },   // CAMERA_SPEC A13's spot
};
const DEFAULT_SPOTS = Object.keys(SPOT_DEFS);
const given = (k) => args[k] !== undefined;
const ALL = !given('spots') && !given('dusk') && !given('walk') && !given('cycle');
const SPOTS = ALL || args.spots === true || args.spots === 'all' ? DEFAULT_SPOTS : !given('spots') || args.spots === 'none' ? [] : String(args.spots).split(',').filter(Boolean);
const DO_DUSK = ALL || given('dusk'), DO_CYCLE = ALL || given('cycle'), DO_WALK = ALL || given('walk');
const DO_TOGGLE = !args['no-toggle'], DO_DEEP = !args['no-deep'], DO_DIRTY = !args['no-dirty'], DO_WHATIF = !args['no-whatif'];

// ── render gate: hold EVERY slot (nothing else renders while frame times are measured) ─────────────────────────
const MAX_SLOTS = Number(process.env.RENDER_SLOTS || 2);
const lockDir = path.join(root, 'renders/.locks'); fs.mkdirSync(lockDir, { recursive: true });
const held = []; let beat = null;
async function acquireAll() {
  const t0 = Date.now(); const WAIT = num('wait', 30);
  while (held.length < MAX_SLOTS) {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const p = path.join(lockDir, 'slot' + i); if (held.includes(p)) continue;
      try { const st = fs.statSync(p); if (Date.now() - st.mtimeMs > 6 * 60 * 1000) fs.rmSync(p, { recursive: true, force: true }); } catch { /* none */ }
      try { fs.mkdirSync(p); held.push(p); } catch { /* busy */ }
    }
    if (held.length >= MAX_SLOTS) break;
    if (Date.now() - t0 > WAIT * 60 * 1000) throw new Error(`render slots: waited ${WAIT} min for all ${MAX_SLOTS}`);
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
  }
  beat = setInterval(() => { const n = new Date(); for (const p of held) { try { fs.utimesSync(p, n, n); } catch { /* gone */ } } }, 30000);
}
function releaseAll() { if (beat) clearInterval(beat); beat = null; while (held.length) { try { fs.rmSync(held.pop(), { recursive: true, force: true }); } catch { /* gone */ } } }
let caf = null;
function cleanup() { releaseAll(); try { caf?.kill(); } catch { /* gone */ } }
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(1); }); process.on('SIGTERM', () => { cleanup(); process.exit(1); });

// ── in-flight instrumentation of main.js: tag each top-level scene child with the system that added it ─────────
function instrumentMain(src) {
  const hits = {};
  const rep = (key, re, fn) => { const b = src; src = src.replace(re, fn); hits[key] = b !== src; };
  rep('sceneAdd', /const scene = new THREE\.Scene\(\);/, (m) => m + `
window.__benchSys = 'main';
{ const _add = scene.add; scene.add = function (...objs) { for (const o of objs) if (o && o.isObject3D && o.userData && !o.userData.__sys) o.userData.__sys = window.__benchSys; return _add.apply(this, objs); };
  const _att = scene.attach; scene.attach = function (o) { if (o && o.isObject3D && o.userData && !o.userData.__sys) o.userData.__sys = window.__benchSys; return _att.call(this, o); }; }`);
  rep('create', /try \{ ctx\.systems\[name\] = mod\.create\(ctx\)/, () => 'try { window.__benchSys = name; ctx.systems[name] = mod.create(ctx)');
  rep('update', /try \{ sys\.update\(dt, ctx\);/, () => 'window.__benchSys = name; try { sys.update(dt, ctx);');
  rep('afterLoop', /ctx\.input\.endFrame\(\);/, (m) => `window.__benchSys = 'main'; ` + m);
  return { src, hits };
}

// ── init script: WebGL prototype counters (draws, programs, uploads, compiles), reset by the sampler every frame ─
const INIT = () => {
  const glc = window.__glc = { draw: 0, prog: 0, bufData: 0, bufDataB: 0, bufSub: 0, bufSubB: 0, tex: 0, texB: 0, compile: 0, link: 0 };
  const bpe = (a) => (a && a.BYTES_PER_ELEMENT) || 1;
  const dim = (s) => (s ? ((s.width || s.videoWidth || s.displayWidth || 0) * (s.height || s.videoHeight || s.displayHeight || 0)) : 0);
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue; const P = C.prototype;
    const wrap = (name, pre) => { const o = P[name]; if (typeof o !== 'function') return; P[name] = function () { pre(arguments); return o.apply(this, arguments); }; };
    for (const d of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) wrap(d, () => { glc.draw++; });
    wrap('useProgram', () => { glc.prog++; });
    wrap('bufferData', (a) => { glc.bufData++; const d = a[1]; glc.bufDataB += typeof d === 'number' ? d : (d && d.byteLength) || 0; });
    wrap('bufferSubData', (a) => { glc.bufSub++; const d = a[2]; if (!d || typeof d === 'number') return; const len = a[4]; glc.bufSubB += len ? len * bpe(d) : (d.byteLength || 0) - (a[3] || 0) * bpe(d); });
    wrap('texImage2D', (a) => { glc.tex++; glc.texB += a.length >= 9 ? (a[3] * a[4] * 4) || 0 : dim(a[5]) * 4; });
    wrap('texSubImage2D', (a) => { glc.tex++; glc.texB += a.length >= 9 ? (a[4] * a[5] * 4) || 0 : dim(a[6]) * 4; });
    wrap('texImage3D', (a) => { glc.tex++; glc.texB += (a[3] * a[4] * a[5] * 4) || 0; });
    wrap('texSubImage3D', (a) => { glc.tex++; glc.texB += (a[5] * a[6] * a[7] * 4) || 0; });
    wrap('compressedTexImage2D', (a) => { glc.tex++; glc.texB += (a[6] && a[6].byteLength) || 0; });
    wrap('compileShader', () => { glc.compile++; });
    wrap('linkProgram', () => { glc.link++; });
  }
};

// ── page library: installed once per page after the intro (update / render / traverse / raycast wrappers, sampler) ─
const PAGE_LIB = () => {
  const g = window.game, ctx = g.ctx, R = ctx.renderer, scene = ctx.scene, THREE = ctx.THREE, gl = R.getContext();
  const names = Object.keys(ctx.systems); const NS = names.length;
  const sysOf = (o) => { let t = o; while (t && t.parent && t.parent !== scene) t = t.parent; if (!t || t.parent !== scene) return o === scene ? 'scene' : '(unparented)'; return t.userData?.__sys || ('?' + (t.name || t.type)); };
  const fb = window.__fb = { names, NS, sysOf, cur: new Float64Array(NS), trav: new Float64Array(NS), travN: new Uint32Array(NS), ray: new Float64Array(NS), rayN: new Uint32Array(NS),
    curSys: -1, lastRenderMs: 0, gpuOn: false, qActive: false, frameIdx: -1, frames: 0, sample: null, timer: false };
  // per-system update() timing (the index is also who a traverse()/raycast() is charged to)
  names.forEach((n, i) => {
    const s = ctx.systems[n]; if (!s || typeof s.update !== 'function') return; const orig = s.update;
    s.update = function (dt, c) { const prev = fb.curSys; fb.curSys = i; const t0 = performance.now(); try { return orig.call(this, dt, c); } finally { fb.cur[i] += performance.now() - t0; fb.curSys = prev; } };
  });
  // whole-scene traversals (top-level call on the scene only)
  for (const m of ['traverse', 'traverseVisible']) {
    const orig = scene[m];
    scene[m] = function (cb) { const i = fb.curSys; const t0 = performance.now(); try { return orig.call(this, cb); } finally { if (i >= 0) { fb.trav[i] += performance.now() - t0; fb.travN[i]++; } } };
  }
  // raycasts (outermost call only: InstancedMesh.raycast runs Mesh.raycast per instance)
  let rayDepth = 0;
  for (const C of [THREE.Mesh, THREE.InstancedMesh, THREE.SkinnedMesh, THREE.BatchedMesh, THREE.Points, THREE.Line, THREE.LineSegments, THREE.Sprite]) {
    if (!C) continue; const P = C.prototype; if (!Object.prototype.hasOwnProperty.call(P, 'raycast')) continue; const orig = P.raycast;
    P.raycast = function (rc, out) {
      if (rayDepth++ > 0) { try { return orig.call(this, rc, out); } finally { rayDepth--; } }
      const i = fb.curSys; const t0 = performance.now();
      try { return orig.call(this, rc, out); } finally { rayDepth--; if (i >= 0) { fb.ray[i] += performance.now() - t0; fb.rayN[i]++; } }
    };
  }
  // renderer.render: CPU ms + a GPU timer query (shadow + main pass) while a sample runs
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); fb.timer = !!ext;
  const qPool = [], pending = [];
  const origRender = R.render; fb.rawRender = (s, c) => origRender.call(R, s, c);
  R.render = function (s, c) {
    let q = null;
    if (fb.gpuOn && ext && !fb.qActive) { q = qPool.pop() || gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); fb.qActive = true; }
    const t0 = performance.now();
    try { origRender.call(this, s, c); } finally {
      fb.lastRenderMs = performance.now() - t0;
      if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); fb.qActive = false; pending.push(q, fb.frameIdx); }
    }
  };
  const pollGpu = (b) => {
    while (pending.length) {
      const q = pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const idx = pending[1]; pending.splice(0, 2);
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (!disjoint && b && idx >= 0 && idx < b.n) b.gpu[idx] = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      qPool.push(q);
    }
  };
  fb.pollNow = () => { if (ext) pollGpu(fb.sample); };
  // a persistent frame counter (the dirty pass waits on it)
  const tick = () => { fb.frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  // lights, collected once (the sampler counts visible / lit ones per frame without traversing)
  const vis = (o) => { for (let t = o; t; t = t.parent) if (!t.visible) return false; return true; };
  fb.collectLights = () => { const pl = [], dl = []; scene.traverse((o) => { if (o.isPointLight || o.isSpotLight) pl.push(o); else if (o.isDirectionalLight) dl.push(o); }); fb.pl = pl; fb.dl = dl; return { point: pl.length, dir: dl.length }; };
  fb.collectLights();
  fb.lightNow = () => {
    let pv = 0, plit = 0, ds = 0;
    for (let i = 0; i < fb.pl.length; i++) { const l = fb.pl[i]; if (vis(l)) { pv++; if (l.intensity > 0) plit++; } }
    for (let i = 0; i < fb.dl.length; i++) { const l = fb.dl[i]; if (l.castShadow && vis(l)) ds++; }
    return pv | (plit << 8) | (ds << 16);
  };
  /** Start an n-frame sample. opts: { gpu, stopAtTime, lights, walk: {plan:[{x,y}], segMs, run} } */
  fb.startSample = (n, opts = {}) => {
    const b = fb.sample = { n, k: -1, count: 0, done: false, t: new Float64Array(n + 1), work: new Float32Array(n), upd: new Float32Array(n), ren: new Float32Array(n),
      gpu: new Float32Array(n).fill(NaN), heap: new Float64Array(n), sys: new Float32Array(n * NS), trav: new Float32Array(n * NS), ray: new Float32Array(n * NS), rayN: new Uint16Array(n * NS),
      draws: new Uint32Array(n), progUse: new Uint32Array(n), progs: new Uint16Array(n), compile: new Uint16Array(n), link: new Uint16Array(n), bufB: new Float64Array(n), texN: new Uint16Array(n), texB: new Float64Array(n),
      sweep: new Uint8Array(n), occ: new Float32Array(n), gtime: new Float32Array(n), px: new Float32Array(n), pz: new Float32Array(n), lights: new Uint32Array(n), stopAtTime: opts.stopAtTime ?? null, opts };
    const glc = window.__glc, cam = ctx.systems.camera; let lastOcc = cam ? cam.occMs : 0;
    const W = opts.walk || null; let seg = -1; const inp = ctx.input;
    const resetFrame = () => { fb.cur.fill(0); fb.trav.fill(0); fb.travN.fill(0); fb.ray.fill(0); fb.rayN.fill(0); glc.draw = 0; glc.prog = 0; glc.bufDataB = 0; glc.bufSubB = 0; glc.tex = 0; glc.texB = 0; glc.compile = 0; glc.link = 0; };
    const finish = () => { b.done = true; b.count = b.k; fb.gpuOn = false; if (W) { inp.virtual = { x: 0, y: 0 }; if (W.run) inp.keys.delete('ShiftLeft'); } };
    const step = (now) => {
      if (b.k >= 0) {
        const k = b.k;
        b.t[k + 1] = now; b.work[k] = performance.now() - now;
        let u = 0;
        for (let i = 0; i < NS; i++) { const j = k * NS + i; b.sys[j] = fb.cur[i]; u += fb.cur[i]; b.trav[j] = fb.trav[i]; b.ray[j] = fb.ray[i]; b.rayN[j] = Math.min(65535, fb.rayN[i]); }
        b.upd[k] = u; b.ren[k] = fb.lastRenderMs;
        b.heap[k] = performance.memory ? performance.memory.usedJSHeapSize : 0;
        b.draws[k] = glc.draw; b.progUse[k] = glc.prog; b.compile[k] = glc.compile; b.link[k] = glc.link; b.bufB[k] = glc.bufSubB + glc.bufDataB; b.texN[k] = glc.tex; b.texB[k] = glc.texB;
        b.progs[k] = R.info.programs ? R.info.programs.length : 0;
        const o = cam ? cam.occMs : 0; if (o !== lastOcc) { b.sweep[k] = 1; b.occ[k] = o; } lastOcc = o;
        b.gtime[k] = ctx.state.time; const p = ctx.systems.player && ctx.systems.player.position; if (p) { b.px[k] = p.x; b.pz[k] = p.z; }
        if (opts.lights) b.lights[k] = fb.lightNow();
        if (ext) pollGpu(b);
        b.k++;
        const el = now - b.t[0];
        if (b.k >= b.n || (b.stopAtTime !== null && ctx.state.time >= b.stopAtTime && ctx.state.time < b.stopAtTime + 6) || (W && el >= W.segMs * W.plan.length)) { finish(); return; }
      } else { b.t[0] = now; b.k = 0; }
      if (W) { const s = Math.floor((now - b.t[0]) / W.segMs); if (s !== seg && s < W.plan.length) { seg = s; inp.virtual = W.plan[s]; if (W.run) inp.keys.add('ShiftLeft'); } }
      resetFrame();
      fb.frameIdx = b.k;
      requestAnimationFrame(step);
    };
    fb.gpuOn = !!opts.gpu && !!ext;
    requestAnimationFrame(step);
    return true;
  };
  fb.dump = () => {
    const b = fb.sample, n = b.count, A = (x, m = 1) => Array.from(x.subarray(0, n * m));
    return { n, names, t: Array.from(b.t.subarray(0, n + 1)), work: A(b.work), upd: A(b.upd), ren: A(b.ren), gpu: A(b.gpu).map((v) => (Number.isFinite(v) ? v : null)), heap: A(b.heap),
      sys: A(b.sys, NS), trav: A(b.trav, NS), ray: A(b.ray, NS), rayN: A(b.rayN, NS), draws: A(b.draws), progUse: A(b.progUse), progs: A(b.progs), compile: A(b.compile), link: A(b.link),
      bufB: A(b.bufB), texN: A(b.texN), texB: A(b.texB), sweep: A(b.sweep), occ: A(b.occ), gtime: A(b.gtime), px: A(b.px), pz: A(b.pz), lights: A(b.lights) };
  };
  // which materials switched program (light-count change, new night variants …) and who shows how many renderables
  const arr = (m) => (Array.isArray(m) ? m : [m]);
  fb.snapPrograms = () => { const m2p = new Map(); scene.traverse((o) => { if (!o.material) return; for (const m of arr(o.material)) { if (!m || m2p.has(m)) continue; const pr = R.properties.get(m); m2p.set(m, pr && pr.currentProgram ? pr.currentProgram.id : null); } }); fb._m2p = m2p; };
  fb.diffPrograms = () => { const out = {}; const seen = new Set(); scene.traverse((o) => { if (!o.material) return; const s = sysOf(o); for (const m of arr(o.material)) { if (!m || seen.has(m)) continue; seen.add(m); const pr = R.properties.get(m); const cur = pr && pr.currentProgram ? pr.currentProgram.id : null; const had = fb._m2p && fb._m2p.has(m); const k = had ? s : s + '(new material)'; if (!had || fb._m2p.get(m) !== cur) out[k] = (out[k] || 0) + 1; } }); return out; };
  fb.visBySys = () => { const out = {}; scene.traverse((o) => { if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return; for (let t = o; t; t = t.parent) if (!t.visible) return; const s = sysOf(o); out[s] = (out[s] || 0) + 1; }); return out; };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { names, timer: fb.timer, lights: { point: fb.pl.length, dir: fb.dl.length }, glRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), ua: navigator.userAgent,
    dpr: window.devicePixelRatio, pixelRatio: R.getPixelRatio(), drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], antialias: gl.getContextAttributes().antialias,
    shadowType: R.shadowMap.type, quality: ctx.state.quality, mobile: ctx.state.mobile, maxAniso: (() => { const e = gl.getExtension('EXT_texture_filter_anisotropic'); return e ? gl.getParameter(e.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0; })(),
    parallelCompile: !!gl.getExtension('KHR_parallel_shader_compile'), tagged: scene.children.filter((c) => c.userData?.__sys).length + '/' + scene.children.length };
};

// ── pose a spot (mode, default lens, then the view's own numbers) ────────────────────────────────────────────
const PAGE_POSE = ({ v, mode }) => {
  const g = window.game, s = g.ctx.systems, c = s.camera;
  g.setTime(v.time ?? 12);
  try { if (c.mode !== mode) c.setMode(mode); c.setParams({ azimuth: Math.PI / 4, elevation: 0.64, distance: 31, fov: 30 }); } catch { /* older camera */ }
  if (v.pos) g.teleport(v.pos[0], v.pos[1]);
  if (v.az !== undefined || v.el !== undefined || v.dist !== undefined || v.fov !== undefined) {
    const p = {}; if (v.az !== undefined) p.azimuth = v.az; if (v.el !== undefined) p.elevation = v.el; if (v.dist !== undefined) p.distance = v.dist; if (v.fov !== undefined) p.fov = v.fov; g.setCameraParams(p);
  }
  if (v.free) { try { if (g.world.height(v.free[0], v.free[1]) > 0.6) g.teleport(v.free[0], v.free[1]); } catch { /* sea */ } const y = v.y ?? (g.world.height(v.free[0], v.free[1]) + 2); g.setView({ target: [v.free[0], y, v.free[1]], azimuth: v.az ?? 0.78, elevation: v.el ?? 0.6, distance: v.dist ?? 120, fov: v.fov }); }
  else g.setView(null);
  if (v.call) for (const [p, a] of Object.entries(v.call)) { try { const parts = p.split('.'); let o = s; for (let i = 0; i < parts.length - 1; i++) o = o?.[parts[i]]; const f = o?.[parts[parts.length - 1]]; if (typeof f === 'function') f.apply(o, Array.isArray(a) ? a : [a]); } catch { /* view call */ } }
  return { mode: c.mode, free: c.isFree?.(), time: g.ctx.state.time, player: g.player() };
};

const PAGE_WAIT_FRAMES = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r(k) : requestAnimationFrame(f)); requestAnimationFrame(f); });

// ── attribution render + scene audit ──────────────────────────────────────────────────────────────────────────
const PAGE_ATTR = () => {
  const fb = window.__fb, g = window.game, ctx = g.ctx, R = ctx.renderer, scene = ctx.scene, THREE = ctx.THREE, cam = ctx.camera;
  cam.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const sph = new THREE.Sphere(), isph = new THREE.Sphere(), im = new THREE.Matrix4();
  // an InstancedMesh's cached boundingSphere is whatever it was when last computed (instances move): test each
  // LIVE instance's sphere instead, without touching the object (read-only on game state)
  const offscreen = (o) => {
    const geo = o.geometry; if (!geo) return false;
    if (!geo.boundingSphere) { try { geo.computeBoundingSphere(); } catch { return false; } }
    const bs = geo.boundingSphere; if (!bs || !Number.isFinite(bs.radius)) return false;
    if (o.isInstancedMesh) {
      const n = o.count; if (!n) return true;
      for (let i = 0; i < n; i++) { o.getMatrixAt(i, im); im.premultiply(o.matrixWorld); isph.copy(bs).applyMatrix4(im); if (frustum.intersectsSphere(isph)) return false; }
      return true;
    }
    if (o.isSkinnedMesh || o.isBatchedMesh) return false;   // not judged
    sph.copy(bs).applyMatrix4(o.matrixWorld); return !frustum.intersectsSphere(sph);
  };
  const B = { main: {}, shadow: {} }; fb.offList = new Set();
  const orig = R.renderBufferDirect;
  R.renderBufferDirect = function (camera, sc, geometry, material, object) {
    const c0 = R.info.render.calls, t0 = R.info.render.triangles, p0 = R.info.render.points;
    orig.apply(this, arguments);
    const dc = R.info.render.calls - c0; if (!dc) return;
    const isMain = camera === cam, s = fb.sysOf(object), bk = isMain ? B.main : B.shadow;
    const e = bk[s] || (bk[s] = { calls: 0, tris: 0, points: 0, objs: {}, noCull: 0, off: 0, offTris: 0, offObjs: {} });
    const dt = R.info.render.triangles - t0; const on = object.name || object.type;
    e.calls += dc; e.tris += dt; e.points += R.info.render.points - p0; e.objs[on] = (e.objs[on] || 0) + dc;
    if (isMain && object.frustumCulled === false) { e.noCull += dc; if (offscreen(object)) { e.off += dc; e.offTris += dt; e.offObjs[on] = (e.offObjs[on] || 0) + dc; fb.offList.add(object); } }
  };
  try { fb.rawRender(scene, cam); } finally { R.renderBufferDirect = orig; }
  const top = (o, n = 6) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => k + '×' + v).join(', ');
  const bySys = {};
  for (const s of new Set([...Object.keys(B.main), ...Object.keys(B.shadow)])) {
    const m = B.main[s] || { calls: 0, tris: 0, points: 0, objs: {}, noCull: 0, off: 0, offTris: 0, offObjs: {} }, sh = B.shadow[s] || { calls: 0, tris: 0, objs: {} };
    bySys[s] = { calls: m.calls, tris: m.tris, points: m.points, shadowCalls: sh.calls, shadowTris: sh.tris, noCull: m.noCull, off: m.off, offTris: m.offTris, top: top(m.objs), offTop: top(m.offObjs, 5), shadowTop: top(sh.objs, 5) };
  }
  const sum = (bk) => Object.values(bk).reduce((a, e) => ({ calls: a.calls + e.calls, tris: a.tris + e.tris }), { calls: 0, tris: 0 });
  // scene audit
  const vis = (o) => { for (let t = o; t; t = t.parent) if (!t.visible) return false; return true; };
  const per = {}; const P = (s) => per[s] || (per[s] = { meshes: 0, instanced: 0, instances: 0, castVis: 0, noCullVis: 0, skinned: 0 });
  const lights = []; const tex = new Map(); const dbl = {};
  const texAdd = (t, s) => {
    if (!t || !t.isTexture || tex.has(t.uuid)) return; const img = t.image; const w = (img && (img.width || img.videoWidth)) || 0, h = (img && (img.height || img.videoHeight)) || 0;
    tex.set(t.uuid, { name: t.name || '', sys: s, w, h, aniso: t.anisotropy, mip: t.generateMipmaps, kind: t.isCanvasTexture ? 'canvas' : t.isDataTexture ? 'data' : t.isCubeTexture ? 'cube' : 'image', src: t.source?.uuid || t.uuid });
  };
  scene.traverse((o) => {
    const s = fb.sysOf(o);
    if (o.isLight) { const L = { sys: s, type: o.type, name: o.name, visible: vis(o), intensity: +(o.intensity || 0).toFixed(3), castShadow: !!o.castShadow, distance: o.distance };
      if (o.shadow && o.castShadow) { L.mapSize = [o.shadow.mapSize.x, o.shadow.mapSize.y]; const c = o.shadow.camera; if (c.isOrthographicCamera) L.box = { half: +(c.right).toFixed(1), near: c.near, far: +(c.far).toFixed(1) }; L.autoUpdate = o.shadow.autoUpdate; }
      lights.push(L); }
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
    const p = P(s); const v = vis(o);
    if (o.isMesh) p.meshes++; if (o.isInstancedMesh) { p.instanced++; p.instances += o.count; } if (o.isSkinnedMesh) p.skinned++;
    if (v && o.castShadow) p.castVis++; if (v && o.frustumCulled === false) p.noCullVis++;
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) { if (!m) continue; for (const k in m) { const t = m[k]; if (t && t.isTexture) texAdd(t, s); } if (m.uniforms) for (const k in m.uniforms) { const t = m.uniforms[k] && m.uniforms[k].value; if (t && t.isTexture) texAdd(t, s); } }
    if (v) for (const m of mats) if (m && m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass) { const key = s + ':' + (o.name || o.type); dbl[key] = (dbl[key] || 0) + 1; }
  });
  const T = [...tex.values()]; const bySrc = new Map(); for (const t of T) if (!bySrc.has(t.src)) bySrc.set(t.src, t);
  const estMB = [...bySrc.values()].reduce((a, t) => a + t.w * t.h * 4 * (t.mip ? 1.33 : 1) * (t.kind === 'cube' ? 6 : 1), 0) / 1048576;
  const aniso = {}; for (const t of T) aniso[t.aniso] = (aniso[t.aniso] || 0) + 1;
  const pointVis = lights.filter((l) => (l.type === 'PointLight' || l.type === 'SpotLight') && l.visible);
  return { main: sum(B.main), shadow: sum(B.shadow), bySys, per, lights, pointVisible: pointVis.length, pointLit: pointVis.filter((l) => l.intensity > 0).length,
    textures: { count: T.length, sources: bySrc.size, estMB: +estMB.toFixed(1), over2048: T.filter((t) => t.w > 2048 || t.h > 2048).map((t) => `${t.sys}:${t.name || t.kind} ${t.w}x${t.h} a${t.aniso}`), aniso,
      largest: T.slice().sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 10).map((t) => `${t.sys}:${t.name || t.kind} ${t.w}x${t.h} a${t.aniso}`) },
    info: { calls: R.info.render.calls, triangles: R.info.render.triangles, geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs?.length ?? 0 },
    offscreenObjects: fb.offList.size, doublePass: dbl };
};

// ── toggles: PAIRED base/config renders (render + readPixels = sync ms, timer query = GPU ms) ─────────────────────
// Apple GPUs down-clock between sparse renders, so one "base" measured once is no reference (a cold first base read
// 5× slower than the same draws a second later). Every config therefore gets its own base right before it, after a
// clock ramp: [1 discarded + reps base] [apply] [1 discarded + reps config] [undo]; Δ = median(base) − median(config).
const PAGE_TOGGLE = async ({ reps, objs, whatif }) => {
  const fb = window.__fb, ctx = window.game.ctx, R = ctx.renderer, scene = ctx.scene, gl = R.getContext(), glc = window.__glc;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const px = new Uint8Array(4); const runs = [];
  const isR = (o) => o.isMesh || o.isPoints || o.isLine || o.isSprite;
  const once = (keep, into) => {
    let q = null; if (ext && keep) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    const d0 = glc.draw; const t0 = performance.now();
    fb.rawRender(scene, ctx.camera);
    if (q) gl.endQuery(ext.TIME_ELAPSED_EXT);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (!keep) return;
    into.sync.push(performance.now() - t0); into.draws.push(glc.draw - d0); into.calls = R.info.render.calls; into.tris = R.info.render.triangles; if (q) into.qs.push(q);
  };
  const measure = (label, apply, undo, meta) => {
    const r = { label, meta, sync: [], draws: [], qs: [], calls: 0, tris: 0, base: { sync: [], draws: [], qs: [], calls: 0, tris: 0 } };
    once(false); for (let i = 0; i < reps; i++) once(true, r.base);
    const l0 = fb.lightNow();
    const undoData = apply ? apply() : null;
    const l1 = fb.lightNow();
    // a light parented under a hidden mesh leaves the light list too (three skips invisible subtrees): flag it,
    // because then the Δ includes a light-count change (and a program switch), not just the draws
    if (l1 !== l0) r.lightChange = `point lights ${l0 & 255}→${l1 & 255}`;
    try { once(false); for (let i = 0; i < reps; i++) once(true, r); } finally { if (undo) undo(undoData); }
    runs.push(r);
  };
  const hide = (list) => () => { const h = []; for (const o of list) if (o.visible) { o.visible = false; h.push(o); } return h; };
  const unhide = (h) => { for (const o of h) o.visible = true; };
  const noCast = (list) => () => { const h = []; for (const o of list) if (o.castShadow) { o.castShadow = false; h.push(o); } return h; };
  const reCast = (h) => { for (const o of h) o.castShadow = true; };
  const shadowsOff = () => { const a = R.shadowMap.autoUpdate; R.shadowMap.autoUpdate = false; R.shadowMap.needsUpdate = false; return a; };
  const shadowsOn = (a) => { R.shadowMap.autoUpdate = a; };
  const bySys = {}; const vis = (o) => { for (let t = o; t; t = t.parent) if (!t.visible) return false; return true; };
  scene.traverse((o) => { if (isR(o) && vis(o)) (bySys[fb.sysOf(o)] = bySys[fb.sysOf(o)] || []).push(o); });
  for (let i = 0; i < 24; i++) once(false);                            // ramp the GPU clock
  measure('base vs base', null, null, { kind: 'noise' });
  measure('no shadow pass', shadowsOff, shadowsOn, { kind: 'shadow' });
  for (const [s, list] of Object.entries(bySys)) {
    measure('hide ' + s, hide(list), unhide, { sys: s, kind: 'hide', n: list.length });
    const casters = list.filter((o) => o.castShadow);
    if (casters.length) measure('noCast ' + s, noCast(casters), reCast, { sys: s, kind: 'noCast', n: casters.length });
  }
  for (const re of objs) {
    const rx = new RegExp(re, 'i'); const list = []; scene.traverse((o) => { if (isR(o) && vis(o) && (rx.test(o.name || '') || (o.parent && rx.test(o.parent.name || '')))) list.push(o); });
    if (list.length) measure('obj ' + re, hide(list), unhide, { kind: 'obj', n: list.length, names: [...new Set(list.map((o) => o.name || o.type))].slice(0, 6) });
  }
  const off = fb.offList ? [...fb.offList] : [];
  if (off.length) {
    measure('cull off-screen, with shadows', hide(off), unhide, { kind: 'cull', n: off.length });
    const offCast = off.filter((o) => o.castShadow);
    if (offCast.length) measure('off-screen noCast', noCast(offCast), reCast, { kind: 'cullShadow', n: offCast.length });
  }
  measure('base vs base (end)', null, null, { kind: 'noise' });
  // WHAT-IFS (each recompiles or reallocates; the discarded first render absorbs it; undo restores exactly)
  if (whatif) {
    const pts = []; scene.traverse((o) => { if ((o.isPointLight || o.isSpotLight) && vis(o)) pts.push(o); });
    const unlit = pts.filter((l) => !(l.intensity > 0));
    if (unlit.length) measure('what-if: hide the ' + unlit.length + ' unlit point lights', hide(unlit), unhide, { kind: 'whatif', n: unlit.length });
    if (pts.length) measure('what-if: no point lights (' + pts.length + ')', hide(pts), unhide, { kind: 'whatif', n: pts.length });
    const pr = R.getPixelRatio();
    const setPR = (v) => { R.setPixelRatio(v); R.setSize(window.innerWidth, window.innerHeight); };
    measure('what-if: pixel ratio 1.5', () => { setPR(1.5); return pr; }, (v) => setPR(v), { kind: 'whatif' });
    measure('what-if: pixel ratio 1', () => { setPR(1); return pr; }, (v) => setPR(v), { kind: 'whatif' });
    const sun = scene.getObjectByName('sunLight');
    if (sun && sun.castShadow) {
      const setMap = (n) => { if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } sun.shadow.mapSize.set(n, n); };
      const was = sun.shadow.mapSize.x;
      if (was > 2048) measure('what-if: sun shadow map 2048 (from ' + was + ')', () => { setMap(2048); return was; }, (v) => setMap(v), { kind: 'whatif' });
    }
  }
  // the GPU timers (results only exist after control returns to the event loop)
  const qsAll = []; for (const r of runs) { for (const q of r.qs) qsAll.push([r, q, false]); for (const q of r.base.qs) qsAll.push([r.base, q, false]); }
  const t0 = performance.now();
  while (qsAll.some((x) => !x[2]) && performance.now() - t0 < 4000) {
    await new Promise((res) => setTimeout(res, 16));
    for (const x of qsAll) { if (x[2]) continue; if (gl.getQueryParameter(x[1], gl.QUERY_RESULT_AVAILABLE)) { x[2] = true; if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) (x[0].gpu = x[0].gpu || []).push(gl.getQueryParameter(x[1], gl.QUERY_RESULT) / 1e6); } }
  }
  for (const x of qsAll) gl.deleteQuery(x[1]);
  const med = (a) => { if (!a || !a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(3); };
  return runs.map((r) => { const bs = med(r.base.sync), cs = med(r.sync), bg = med(r.base.gpu), cg = med(r.gpu);
    return { label: r.label, meta: r.meta, lightChange: r.lightChange || null, baseSync: bs, syncMs: cs, dSync: bs != null && cs != null ? +(bs - cs).toFixed(3) : null, baseGpu: bg, gpuMs: cg, dGpu: bg != null && cg != null ? +(bg - cg).toFixed(3) : null,
      baseDraws: med(r.base.draws), draws: med(r.draws), dDraws: med(r.base.draws) - med(r.draws), calls: r.calls, dCalls: r.base.calls - r.calls, tris: r.tris, dTris: r.base.tris - r.tris }; });
};

// ── dirty: attribute / texture re-uploads per frame (version bumps) + DOM mutations per frame ──────────────────
const PAGE_DIRTY = async (n) => {
  const fb = window.__fb, ctx = window.game.ctx, scene = ctx.scene;
  const snap = new Map();
  const tb = (t) => { const i = t.image; const w = (i && (i.width || i.videoWidth)) || 0, h = (i && (i.height || i.videoHeight)) || 0; return w * h * 4; };
  const add = (obj, s, name, bytes) => { if (obj && typeof obj.version === 'number' && !snap.has(obj)) snap.set(obj, { v: obj.version, s, name, bytes }); };
  scene.traverse((o) => {
    const s = fb.sysOf(o), g = o.geometry, nm = o.name || o.type;
    if (g && g.attributes) { for (const k in g.attributes) { const a = g.attributes[k]; add(a, s, nm + '.' + k, a.array ? a.array.byteLength : 0); } if (g.index) add(g.index, s, nm + '.index', g.index.array ? g.index.array.byteLength : 0); }
    if (o.isInstancedMesh) { add(o.instanceMatrix, s, nm + '.instanceMatrix', o.instanceMatrix.array.byteLength); if (o.instanceColor) add(o.instanceColor, s, nm + '.instanceColor', o.instanceColor.array.byteLength); }
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) { if (!m) continue; for (const k in m) { const t = m[k]; if (t && t.isTexture) add(t, s, (m.name || m.type) + '.' + k + (t.name ? '(' + t.name + ')' : ''), tb(t)); } if (m.uniforms) for (const k in m.uniforms) { const t = m.uniforms[k] && m.uniforms[k].value; if (t && t.isTexture) add(t, s, (m.name || m.type) + '.u.' + k, tb(t)); } }
  });
  // program re-evaluation: three calls material.customProgramCacheKey() once per getProgram() (getParameters +
  // getProgramCacheKey, ~2 KB of garbage each); a material doing that every frame flips between program variants
  // (instanced/plain, instanceColor or not, skinned, morph, vertex alpha) or has needsUpdate set every frame.
  const THREE = ctx.THREE, R = ctx.renderer;
  const users = new Map(), mver = new Map();
  const sig = (o, m) => (o.isInstancedMesh ? 'I' + (o.instanceColor ? 'c' : '') : '') + (o.isSkinnedMesh ? 'S' : '') + (o.isBatchedMesh ? 'B' : '') + (o.geometry?.morphAttributes?.position ? 'M' : '') + (m.vertexColors && o.geometry?.attributes?.color?.itemSize === 4 ? 'A' : '') + (o.geometry?.attributes?.tangent ? 'T' : '') || 'plain';
  scene.traverse((o) => { if (!o.material) return; const s = fb.sysOf(o); for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (!m) continue; let u = users.get(m); if (!u) { users.set(m, u = { sys: new Set(), objs: new Set(), sigs: new Set() }); mver.set(m, m.version); } u.sys.add(s); u.objs.add(o.name || o.type); u.sigs.add(sig(o, m)); } });
  const bumps = new Map(); const nuDesc = Object.getOwnPropertyDescriptor(THREE.Material.prototype, 'needsUpdate');
  const stl = Error.stackTraceLimit; Error.stackTraceLimit = 40;
  if (nuDesc && nuDesc.set) Object.defineProperty(THREE.Material.prototype, 'needsUpdate', { configurable: true, get: nuDesc.get, set(v) {
    if (v === true) { const st = (new Error().stack || '').split('\n').slice(2).map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, ''));
      const top = st[0] || '?', src = st.find((l) => /(^|[ (])src\//.test(l)) || '?';
      const site = /vendor\/three/.test(top) ? 'three ' + top.split(' ')[0] + (this.transparent && this.side !== undefined ? ' (transparent double-sided → 2 passes)' : '') + ' ← ' + src : src;
      const u = users.get(this); const k = site + ' → ' + (u ? [...u.sys].join('+') + ':' + [...u.objs].slice(0, 2).join(',') : (this.name || this.type)); bumps.set(k, (bumps.get(k) || 0) + 1); }
    nuDesc.set.call(this, v); } });
  const gp = new Map(); const protoKey = THREE.Material.prototype.customProgramCacheKey; const own = [];
  THREE.Material.prototype.customProgramCacheKey = function () { gp.set(this, (gp.get(this) || 0) + 1); return protoKey.call(this); };
  for (const m of users.keys()) if (Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey')) { const f = m.customProgramCacheKey; own.push([m, f]); m.customProgramCacheKey = function () { gp.set(this, (gp.get(this) || 0) + 1); return f.call(this); }; }
  // DOM
  const dom = { total: 0, byType: {}, byTarget: {} };
  const desc = (t) => { const e = t.nodeType === 1 ? t : t.parentElement; if (!e) return '?'; if (e.id) return '#' + e.id; const c = typeof e.className === 'string' ? e.className.split(' ')[0] : ''; return e.tagName.toLowerCase() + (c ? '.' + c : ''); };
  const mo = new MutationObserver((recs) => { for (const r of recs) { dom.total++; const k = r.type + (r.attributeName ? ':' + r.attributeName : ''); dom.byType[k] = (dom.byType[k] || 0) + 1; const d = desc(r.target); dom.byTarget[d] = (dom.byTarget[d] || 0) + 1; } });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const f0 = fb.frames;
  await new Promise((r) => { const w = () => (fb.frames - f0 >= n ? r() : requestAnimationFrame(w)); requestAnimationFrame(w); });
  const frames = fb.frames - f0;
  mo.takeRecords().forEach(() => { dom.total++; }); mo.disconnect();
  THREE.Material.prototype.customProgramCacheKey = protoKey; for (const [m, f] of own) m.customProgramCacheKey = f;
  if (nuDesc) Object.defineProperty(THREE.Material.prototype, 'needsUpdate', nuDesc); Error.stackTraceLimit = stl;
  let gpTotal = 0; const gpList = [];
  for (const [m, c] of gp) { gpTotal += c; const u = users.get(m); const pr = R.properties.get(m); gpList.push({ mat: (m.name || m.type) + '#' + m.id, perFrame: +(c / frames).toFixed(2), sys: u ? [...u.sys].join('+') : '(internal: shadow depth / distance material)', objs: u ? [...u.objs].slice(0, 5).join(', ') : '', variants: u ? [...u.sigs].join('/') : '', programs: pr?.programs?.size ?? null, versionBumpsPerFrame: u ? +((m.version - mver.get(m)) / frames).toFixed(2) : null }); }
  gpList.sort((a, b) => b.perFrame - a.perFrame);
  let flip = 0; for (const [m, u] of users) if (u.sigs.size > 1) flip++;
  const multi = []; for (const [m, u] of users) { const pr = R.properties.get(m); if ((pr?.programs?.size ?? 0) > 1) multi.push({ mat: (m.name || m.type) + '#' + m.id, sys: [...u.sys].join('+'), programs: pr.programs.size, variants: [...u.sigs].join('/'), objs: [...u.objs].slice(0, 4).join(', ') }); }
  multi.sort((a, b) => b.programs - a.programs);
  const bySys = {}; const list = [];
  for (const [obj, e] of snap) {
    const dv = obj.version - e.v; if (dv <= 0) continue;
    const perFrame = Math.min(dv, frames) / frames; const bpf = e.bytes * perFrame;
    const S = bySys[e.s] || (bySys[e.s] = { n: 0, bytesPerFrame: 0, tex: 0, texBytesPerFrame: 0 });
    if (obj.isTexture) { S.tex++; S.texBytesPerFrame += bpf; } else { S.n++; S.bytesPerFrame += bpf; }
    list.push({ sys: e.s, name: e.name, bytes: e.bytes, perFrame: +perFrame.toFixed(2), tex: !!obj.isTexture });
  }
  list.sort((a, b) => b.bytes * b.perFrame - a.bytes * a.perFrame);
  const top = (o, k = 10) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).map(([x, v]) => ({ k: x, perFrame: +(v / frames).toFixed(2) }));
  return { frames, tracked: snap.size, bySys, top: list.slice(0, 25), programEval: { perFrame: +(gpTotal / frames).toFixed(2), needsUpdateSites: [...bumps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ k, perFrame: +(v / frames).toFixed(2) })), materials: users.size, sharedAcrossVariants: flip, top: gpList.slice(0, 20), multiProgram: multi.slice(0, 20), multiProgramCount: multi.length }, dom: { perFrame: +(dom.total / frames).toFixed(2), byType: top(dom.byType, 8), byTarget: top(dom.byTarget, 12) } };
};

// ── node-side statistics ────────────────────────────────────────────────────────────────────────────────────────
const sorted = (a) => a.filter((x) => x !== null && Number.isFinite(x)).sort((x, y) => x - y);
const q = (a, p) => { const s = sorted(a); if (!s.length) return null; return +s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))].toFixed(3); };
const mean = (a) => { const s = a.filter((x) => x !== null && Number.isFinite(x)); return s.length ? +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(3) : null; };
const mx = (a) => { const s = sorted(a); return s.length ? +s[s.length - 1].toFixed(3) : null; };
const r2 = (x) => (x === null || x === undefined ? null : +(+x).toFixed(2));

function summarise(d) {
  const n = d.n, NS = d.names.length;
  const dt = []; for (let k = 0; k < n; k++) dt.push(d.t[k + 1] - d.t[k]);
  const dur = (d.t[n] - d.t[0]) / 1000;
  const med = q(dt, 0.5);
  const over = (ms) => dt.filter((x) => x > ms).length;
  // heap: growth, allocation (sum of rises, a lower bound), GC drops
  let rise = 0, drops = 0, dropBytes = 0; for (let k = 1; k < n; k++) { const dd = d.heap[k] - d.heap[k - 1]; if (dd > 0) rise += dd; else if (dd < -65536) { drops++; dropBytes -= dd; } }
  const cpu = d.upd.map((u, k) => u + d.ren[k]);
  const per = [];
  for (let i = 0; i < NS; i++) {
    const s = [], tr = [], ry = [], rn = [];
    for (let k = 0; k < n; k++) { s.push(d.sys[k * NS + i]); tr.push(d.trav[k * NS + i]); ry.push(d.ray[k * NS + i]); rn.push(d.rayN[k * NS + i]); }
    const m = mean(s); if (!m && !mx(s)) continue;
    per.push({ sys: d.names[i], mean: m, p95: q(s, 0.95), max: mx(s), travMean: mean(tr), travMax: mx(tr), travFrames: tr.filter((x) => x > 0).length, rayMean: mean(ry), rayMax: mx(ry), raysPerFrame: mean(rn) });
  }
  per.sort((a, b) => b.mean - a.mean);
  // hitch anatomy: the slowest frames with who ran long in them
  const idx = dt.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([v, k]) => {
    const who = []; for (let i = 0; i < NS; i++) { const v2 = d.sys[k * NS + i]; if (v2 >= 0.5) who.push([d.names[i], +v2.toFixed(2)]); }
    who.sort((a, b) => b[1] - a[1]);
    return { frame: k, intervalMs: +v.toFixed(2), workMs: r2(d.work[k]), updMs: r2(d.upd[k]), renderMs: r2(d.ren[k]), gpuMs: r2(d.gpu[k]), compiles: d.compile[k], links: d.link[k], sweep: !!d.sweep[k], occMs: d.sweep[k] ? r2(d.occ[k]) : null, gtime: r2(d.gtime[k]), pos: [Math.round(d.px[k]), Math.round(d.pz[k])], who: who.slice(0, 5) };
  });
  // camera sweep anatomy (A13)
  const ci = d.names.indexOf('camera'); let sweep = null;
  if (ci >= 0) {
    const sw = [], ns = [], occ = [], trv = [], ray = [], both = [], refr = [];
    for (let k = 0; k < n; k++) { const c = d.sys[k * NS + ci], t = d.trav[k * NS + ci]; if (d.sweep[k]) { sw.push(c); occ.push(d.occ[k]); ray.push(d.ray[k * NS + ci]); if (t > 0) both.push(c); } else ns.push(c); if (t > 0) { trv.push(t); refr.push(c); } }
    sweep = { sweepFrames: sw.length, camP95Sweep: q(sw, 0.95), camMaxSweep: mx(sw), camP95NonSweep: q(ns, 0.95), occP95: q(occ, 0.95), occMax: mx(occ), rayP95OnSweep: q(ray, 0.95), refreshFrames: trv.length, traverseP95: q(trv, 0.95), traverseMax: mx(trv), camP95OnRefresh: q(refr, 0.95), sweepAndRefreshFrames: both.length, camP95SweepAndRefresh: q(both, 0.95) };
  }
  const gpuOk = d.gpu.filter((x) => x !== null);
  return {
    frames: n, seconds: +dur.toFixed(2), fpsMedian: med ? +(1000 / med).toFixed(1) : null, fpsMean: +(n / dur).toFixed(1), intervalMedian: med, intervalP95: q(dt, 0.95), intervalP99: q(dt, 0.99), intervalMax: mx(dt),
    displayInterval: q(dt, 0.05), over16: over(17.5), over25: over(25), over40: over(40),
    workMedian: q(d.work, 0.5), workP95: q(d.work, 0.95), workMax: mx(d.work), updMedian: q(d.upd, 0.5), updP95: q(d.upd, 0.95), updMax: mx(d.upd), renderMedian: q(d.ren, 0.5), renderP95: q(d.ren, 0.95), renderMax: mx(d.ren),
    cpuMedian: q(cpu, 0.5), cpuP95: q(cpu, 0.95), gpuMedian: q(gpuOk, 0.5), gpuP95: q(gpuOk, 0.95), gpuMax: mx(gpuOk), gpuFrames: gpuOk.length,
    drawsMedian: q(d.draws, 0.5), drawsMax: mx(d.draws), useProgramMedian: q(d.progUse, 0.5), bufKBPerFrame: r2(mean(d.bufB) / 1024), bufKBMax: r2(mx(d.bufB) / 1024), texUploadsPerFrame: mean(d.texN), texUploadsMax: mx(d.texN), texKBPerFrame: r2(mean(d.texB) / 1024),
    compiles: d.compile.reduce((a, b) => a + b, 0), links: d.link.reduce((a, b) => a + b, 0), programsStart: d.progs[0], programsEnd: d.progs[n - 1],
    heapStartMB: r2(d.heap[0] / 1048576), heapEndMB: r2(d.heap[n - 1] / 1048576), heapGrowthMB: r2((d.heap[n - 1] - d.heap[0]) / 1048576), allocMBps: r2(rise / 1048576 / dur), allocKBPerFrame: r2(rise / 1024 / n), gcDrops: drops, gcDropMB: r2(dropBytes / 1048576),
    perSystem: per, hitches: idx, sweep,
  };
}

// ── CPU profile + heap sampling aggregation ───────────────────────────────────────────────────────────────────
const shortUrl = (u) => (u || '').replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, '');
function aggCpu(p) {
  const parent = new Map(), byId = new Map();
  for (const nd of p.nodes) { byId.set(nd.id, nd); for (const c of nd.children || []) parent.set(c, nd.id); }
  const keyOf = (nd) => { const cf = nd.callFrame; const u = shortUrl(cf.url); return u ? `${cf.functionName || '(anon)'} ${u}:${cf.lineNumber + 1}` : (cf.functionName || '(native)'); };
  const fileOf = (nd) => shortUrl(nd.callFrame.url) || nd.callFrame.functionName || '(native)';
  const memo = new Map();
  const chain = (id) => { if (memo.has(id)) return memo.get(id); const nd = byId.get(id); const up = parent.has(id) ? chain(parent.get(id)) : { keys: new Set(), files: new Set() }; const r = { keys: new Set(up.keys), files: new Set(up.files) }; r.keys.add(keyOf(nd)); r.files.add(fileOf(nd)); memo.set(id, r); return r; };
  const self = new Map(), selfFile = new Map(), inc = new Map(), incFile = new Map(); let total = 0;
  for (let i = 0; i < p.samples.length; i++) {
    const id = p.samples[i]; const dt = (p.timeDeltas[i + 1] ?? 0) / 1000; if (dt <= 0) continue; total += dt;
    const nd = byId.get(id); const k = keyOf(nd), f = fileOf(nd);
    self.set(k, (self.get(k) || 0) + dt); selfFile.set(f, (selfFile.get(f) || 0) + dt);
    const c = chain(id); for (const x of c.keys) inc.set(x, (inc.get(x) || 0) + dt); for (const x of c.files) incFile.set(x, (incFile.get(x) || 0) + dt);
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, ms: +v.toFixed(1), pct: +(100 * v / total).toFixed(1) }));
  const g = (name) => +(self.get(name) || 0).toFixed(1);
  return { totalMs: +total.toFixed(1), idleMs: g('(idle)'), gcMs: g('(garbage collector)'), programMs: g('(program)'), selfTop: top(self, 30), selfFiles: top(selfFile, 20), incTop: top(inc, 40), incFiles: top(incFile, 25) };
}
function aggHeap(h, seconds, frames) {
  const site = new Map(), owner = new Map(), ownerFile = new Map(); let total = 0;
  const walk = (nd, own) => {
    const cf = nd.callFrame; const u = shortUrl(cf.url); const key = u ? `${cf.functionName || '(anon)'} ${u}:${cf.lineNumber + 1}` : (cf.functionName || '(native)');
    const mine = /(^|\/)src\//.test(u) ? key : own;
    if (nd.selfSize) {
      total += nd.selfSize; site.set(key, (site.get(key) || 0) + nd.selfSize);
      const o = mine || '(no game frame)'; owner.set(o, (owner.get(o) || 0) + nd.selfSize);
      const of = mine ? mine.split(' ')[1].replace(/:\d+$/, '') : '(no game frame)'; ownerFile.set(of, (ownerFile.get(of) || 0) + nd.selfSize);
    }
    for (const c of nd.children || []) walk(c, mine);
  };
  walk(h.head, null);
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, KBperFrame: +(v / 1024 / frames).toFixed(2), MBps: +(v / 1048576 / seconds).toFixed(3) }));
  return { totalMB: +(total / 1048576).toFixed(2), MBps: +(total / 1048576 / seconds).toFixed(3), KBperFrame: +(total / 1024 / frames).toFixed(2), sites: top(site, 25), owners: top(owner, 25), ownerFiles: top(ownerFile, 15) };
}

// ── run helpers ───────────────────────────────────────────────────────────────────────────────────────────────
const out = { meta: {}, spots: [], dusk: null, cycle: null, walk: null, console: [], pages: [] };
let phase = 'launch';
const load = () => os.loadavg().map((x) => +x.toFixed(2));
const log = (...a) => console.log(`[fpsbench ${new Date().toISOString().slice(11, 19)}]`, ...a);

async function launch() {
  const hw = GL === 'hw';
  return chromium.launch(hw
    ? { channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] }
    : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
}

async function openGame(browser, tag) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  let instr = null;
  await page.route(/\/src\/main\.js(\?.*)?$/, async (route) => {
    const resp = await route.fetch(); const r = instrumentMain(await resp.text()); instr = r.hits;
    await route.fulfill({ response: resp, body: r.src, headers: { ...resp.headers(), 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
  });
  for (const P of PATCHES) {
    await page.route((u) => new URL(u).pathname.replace(/^\//, '') === P.file, async (route) => {
      const resp = await route.fetch(); const src = await resp.text(); const parts = src.split(P.from); P.hits = parts.length - 1;
      await route.fulfill({ response: resp, body: parts.join(P.to), headers: { ...resp.headers(), 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
    });
  }
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') out.console.push({ page: tag, phase, type: t, text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => out.console.push({ page: tag, phase, type: 'pageerror', text: String(e.message).slice(0, 300) }));
  const url = `http://127.0.0.1:${PORT}/?prof=1${Q ? '&q=' + Q : ''}${EXTRA ? '&' + EXTRA : ''}`;
  const t0 = Date.now(); phase = 'load:' + tag;
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 300000, polling: 250 });
  const loadSec = +((Date.now() - t0) / 1000).toFixed(1);
  for (const P of PATCHES) if (!P.hits) throw new Error(`--patch matched nothing in ${P.file}: "${P.from}"`);
  if (PATCHES.length) out.meta.patches = PATCHES.map((P) => `${P.file}: "${P.from}" → "${P.to}" (${P.hits}×)`);
  // title card → a real keydown → the cinematic starts → skip it → wait for 'intro:cinematic:done' (or the end state)
  await page.evaluate(() => { window.__introDone = false; try { window.game.ctx.events.on('intro:cinematic:done', () => { window.__introDone = true; }); } catch { /* no events */ } });
  await page.waitForTimeout(800);
  await page.mouse.move(W / 2, H / 2);
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(600);
  let st = null;
  for (let i = 0; i < 40; i++) {
    st = await page.evaluate(() => { const s = window.game.ctx.systems;
      try { if (s.intro?.active) s.intro.skip(); } catch { /* none */ }
      return { done: window.__introDone, intro: !!s.intro?.active, free: !!s.camera?.isFree?.(), locked: !!s.player?.locked, mode: s.camera?.mode }; });
    if ((st.done || !st.intro) && !st.free && !st.locked) break;
    if (i === 10) await page.evaluate(() => { try { window.game.ctx.systems.ui?.skipIntro?.(); } catch { /* none */ } });
    await page.waitForTimeout(500);
  }
  await page.evaluate(PAGE_WAIT_FRAMES, 60);
  const env = await page.evaluate(PAGE_LIB);
  out.pages.push({ tag, url, loadSec, instrumentation: instr, introEnd: st, env });
  log(`${tag}: ready in ${loadSec}s · ${env.glRenderer} · dpr ${env.dpr} buffer ${env.drawingBuffer.join('x')} · tier ${env.quality} · timer ${env.timer} · tagged ${env.tagged} · intro ${JSON.stringify(st)}`);
  return { page, context, env };
}

async function sample(page, n, opts, timeoutMs = 180000) {
  await page.evaluate(() => { try { window.gc && window.gc(); } catch { /* none */ } });
  await page.evaluate(({ n, opts }) => window.__fb.startSample(n, opts), { n, opts });
  await page.waitForFunction(() => window.__fb.sample && window.__fb.sample.done, null, { polling: 200, timeout: timeoutMs });
  await page.waitForTimeout(120); await page.evaluate(() => window.__fb.pollNow());
  return page.evaluate(() => window.__fb.dump());
}

async function deepPass(page, frames) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  await cdp.send('HeapProfiler.enable');
  await page.evaluate(() => { try { window.gc && window.gc(); } catch { /* none */ } });
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await page.evaluate(({ n }) => window.__fb.startSample(n, { gpu: false }), { n: frames });
  await page.waitForFunction(() => window.__fb.sample.done, null, { polling: 200, timeout: 180000 });
  const seconds = (Date.now() - t0) / 1000;
  const { profile } = await cdp.send('Profiler.stop');
  const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');
  await cdp.send('Profiler.disable').catch(() => {}); await cdp.send('HeapProfiler.disable').catch(() => {}); await cdp.detach().catch(() => {});
  return { frames, seconds: +seconds.toFixed(2), cpu: aggCpu(profile), alloc: aggHeap(heap, seconds, frames) };
}

function slim(d) { // keep the per-frame series in the json, rounded
  const R = (a) => a.map((x) => (x === null ? null : Math.round(x * 100) / 100));
  const dt = []; for (let k = 0; k < d.n; k++) dt.push(Math.round((d.t[k + 1] - d.t[k]) * 100) / 100);
  return { interval: dt, work: R(d.work), upd: R(d.upd), render: R(d.ren), gpu: R(d.gpu), draws: d.draws, heapKB: d.heap.map((x) => Math.round(x / 1024)), compile: d.compile, progs: d.progs, sweep: d.sweep, gtime: R(d.gtime), lights: d.lights.some((x) => x) ? d.lights : undefined };
}

// ── run ───────────────────────────────────────────────────────────────────────────────────────────────────────
let commit = '?'; try { commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim() + (execSync('git status --porcelain src', { cwd: root }).toString().trim() ? '+dirty' : ''); } catch { /* no git */ }
out.meta = { label: LABEL, date: new Date().toISOString(), commit, machine: `${os.hostname()} · ${os.cpus()[0]?.model} ×${os.cpus().length} · ${os.platform()} ${os.release()} · ${Math.round(os.totalmem() / 2 ** 30)} GB`,
  args: { frames: FRAMES, settle: SETTLE, deepFrames: DEEP_FRAMES, reps: REPS, w: W, h: H, dpr: DPR, gl: GL, mode: MODE, walkMode: WALK_MODE, q: Q, params: EXTRA, spots: SPOTS, dusk: DO_DUSK && [DUSK_AT, DUSK_FROM, DUSK_TO], cycle: DO_CYCLE, walk: DO_WALK && [WALK_AT, WALK_SEC, WALK_TIME] },
  loadAtStart: load() };
const T0 = Date.now();
log(`waiting for all ${MAX_SLOTS} render slots…`);
await acquireAll();
log(`holding ${held.length} slots · load ${load().join(' ')}`);
try { spawn('caffeinate', ['-u', '-t', '5'], { stdio: 'ignore' }); caf = spawn('caffeinate', ['-d', '-i', '-w', String(process.pid)], { stdio: 'ignore' }); } catch { /* not macOS */ }

let browser;
try {
  browser = await launch();
  out.meta.browserVersion = browser.version();

  // ── dusk + cycle on a FRESH page (cold program cache: the first dusk a new player sees) ──
  if (DO_DUSK || DO_CYCLE) {
    const { page, context } = await openGame(browser, 'dusk');
    if (DO_DUSK) {
      phase = 'dusk';
      const v = { ...(SPOT_DEFS[DUSK_AT] || views[DUSK_AT]), time: DUSK_FROM };
      await page.evaluate(PAGE_POSE, { v, mode: MODE });
      await page.evaluate(PAGE_WAIT_FRAMES, SETTLE);
      await page.evaluate(() => window.__fb.collectLights());
      await page.evaluate(() => window.__fb.snapPrograms());
      const visPre = await page.evaluate(() => window.__fb.visBySys());
      const pre = await page.evaluate(() => ({ programs: window.game.ctx.renderer.info.programs?.length ?? 0, lights: window.__fb.lightNow() }));
      const loadAt = load();
      await page.evaluate(({ n, opts }) => window.__fb.startSample(n, opts), { n: 9000, opts: { gpu: true, stopAtTime: DUSK_TO, lights: true } });
      await page.evaluate(() => window.game.freezeTime(false));
      await page.waitForFunction(() => window.__fb.sample.done, null, { polling: 250, timeout: 120000 });
      await page.waitForTimeout(120); await page.evaluate(() => window.__fb.pollNow());
      const d = await page.evaluate(() => window.__fb.dump());
      await page.evaluate(() => window.game.freezeTime(true));
      const post = await page.evaluate(() => ({ programs: window.game.ctx.renderer.info.programs?.length ?? 0, stats: window.game.stats(), switched: window.__fb.diffPrograms(), vis: window.__fb.visBySys() }));
      const dVis = {}; for (const k of new Set([...Object.keys(visPre), ...Object.keys(post.vis)])) { const dd = (post.vis[k] || 0) - (visPre[k] || 0); if (dd) dVis[k] = dd; }
      const s = summarise(d);
      const L = (x) => ({ pointVisible: x & 255, pointLit: (x >> 8) & 255, dirShadow: (x >> 16) & 255 });
      const timeline = []; let prevL = -1, prevP = -1;
      for (let k = 0; k < d.n; k++) { if (d.lights[k] !== prevL || d.progs[k] !== prevP) { timeline.push({ frame: k, gtime: r2(d.gtime[k]), ...L(d.lights[k]), programs: d.progs[k], compiles: d.compile[k], intervalMs: r2(d.t[k + 1] - d.t[k]) }); prevL = d.lights[k]; prevP = d.progs[k]; } }
      const spikes = []; for (let k = 0; k < d.n; k++) { const iv = d.t[k + 1] - d.t[k]; if (iv > 40 || d.compile[k] > 0) spikes.push({ frame: k, gtime: r2(d.gtime[k]), intervalMs: r2(iv), workMs: r2(d.work[k]), renderMs: r2(d.ren[k]), gpuMs: r2(d.gpu[k]), compiles: d.compile[k], links: d.link[k], programs: d.progs[k], ...L(d.lights[k]) }); }
      out.dusk = { at: DUSK_AT, from: DUSK_FROM, to: DUSK_TO, load: loadAt, programsBefore: pre.programs, programsAfter: post.programs, lightsBefore: L(pre.lights), lightsAfter: L(d.lights[d.n - 1]), summary: s, spikes: spikes.slice(0, 60), spikeCount: spikes.length, timeline: timeline.slice(0, 80), series: slim(d), statsAfter: post.stats, programSwitchBySys: post.switched, visibleDeltaBySys: dVis };
      log(`dusk ${DUSK_FROM}→${DUSK_TO}: ${s.frames} frames ${s.seconds}s · fps med ${s.fpsMedian} · max ${s.intervalMax} ms · >40ms ${s.over40} · programs ${pre.programs}→${post.programs} · compiles ${s.compiles} links ${s.links} · load ${loadAt.join(' ')}`);
    }
    if (DO_CYCLE) {
      phase = 'cycle';
      const v = SPOT_DEFS[DUSK_AT] || views[DUSK_AT];
      await page.evaluate(PAGE_POSE, { v: { ...v, time: 0 }, mode: MODE });
      await page.evaluate(PAGE_WAIT_FRAMES, 60);
      const hours = [...Array(24).keys(), 5.5, 6.5, 18.5, 19.5].sort((a, b) => a - b);
      const rows = []; let prevVis = await page.evaluate(() => window.__fb.visBySys());
      for (const h of hours) {
        await page.evaluate(() => window.__fb.snapPrograms());
        await page.evaluate((h) => window.game.setTime(h), h);
        const d = await sample(page, 30, { gpu: false, lights: true }, 60000);
        const st = await page.evaluate(() => ({ stats: window.game.stats(), vis: window.__fb.lightNow(), daylight: window.game.ctx.state.daylight, night: window.game.ctx.state.isNight, switched: window.__fb.diffPrograms(), visBySys: window.__fb.visBySys() }));
        const dVis = {}; for (const k of new Set([...Object.keys(prevVis), ...Object.keys(st.visBySys)])) { const dd = (st.visBySys[k] || 0) - (prevVis[k] || 0); if (dd) dVis[k] = dd; } prevVis = st.visBySys;
        const dt = []; for (let k = 0; k < d.n; k++) dt.push(d.t[k + 1] - d.t[k]);
        rows.push({ hour: h, pointVisible: st.vis & 255, pointLit: (st.vis >> 8) & 255, dirShadow: (st.vis >> 16) & 255, programs: st.stats.programs, calls: st.stats.calls, compiles: d.compile.reduce((a, b) => a + b, 0), links: d.link.reduce((a, b) => a + b, 0), maxFrameMs: r2(Math.max(...dt)), medFrameMs: q(dt, 0.5), daylight: r2(st.daylight), night: st.night, programSwitchBySys: st.switched, visibleDeltaBySys: dVis });
      }
      out.cycle = { at: DUSK_AT, load: load(), rows };
      log('cycle: ' + rows.map((r) => `${r.hour}h:${r.pointVisible}/${r.pointLit}pl·${r.programs}p${r.compiles ? '·c' + r.compiles : ''}`).join(' '));
    }
    await context.close().catch(() => {});
  }

  // ── spots + walk on a second page ──
  if (SPOTS.length || DO_WALK) {
    const { page, context } = await openGame(browser, 'spots');
    for (const spot of SPOTS) {
      const v = SPOT_DEFS[spot] || views[spot]; if (!v) { out.spots.push({ spot, failed: 'unknown spot' }); continue; }
      phase = spot; const ts = Date.now();
      try {
        const pose = await page.evaluate(PAGE_POSE, { v, mode: MODE });
        await page.evaluate(PAGE_WAIT_FRAMES, SETTLE);
        await page.evaluate(() => window.game.prof(true));
        const loadAt = load();
        const d = await sample(page, FRAMES, { gpu: true });
        const prof = await page.evaluate(() => window.game.prof(true));
        const stats = await page.evaluate(() => window.game.stats());
        const cam = await page.evaluate(() => { const c = window.game.ctx.systems.camera; try { const m = c.camMs; return { camMs: m, sweeps: c.sweepCount, culled: c.culledList?.length ?? null, fading: c.fadedList?.length ?? null }; } catch { return null; } });
        const s = summarise(d);
        const row = { spot, pose: { ...v, frames: undefined }, posed: pose, load: loadAt, summary: s, prof, stats, camera: cam, series: slim(d) };
        log(`${spot}: fps med ${s.fpsMedian} (mean ${s.fpsMean}) · p95 ${s.intervalP95} · max ${s.intervalMax} ms · >40 ${s.over40} · work ${s.workMedian}/${s.workP95} · gpu ${s.gpuMedian}/${s.gpuP95} · draws ${s.drawsMedian} · calls ${stats.calls} · progs ${stats.programs} · alloc ${s.allocMBps} MB/s · load ${loadAt.join(' ')}`);
        phase = spot + ':attr'; row.attr = await page.evaluate(PAGE_ATTR);
        if (DO_TOGGLE) { phase = spot + ':toggle'; row.toggles = await page.evaluate(PAGE_TOGGLE, { reps: REPS, objs: OBJ_TOGGLES, whatif: DO_WHATIF }); await page.evaluate(PAGE_WAIT_FRAMES, 30); }
        if (DO_DIRTY) { phase = spot + ':dirty'; row.dirty = await page.evaluate(PAGE_DIRTY, DIRTY_FRAMES); }
        if (DO_DEEP) { phase = spot + ':deep'; row.deep = await deepPass(page, DEEP_FRAMES); log(`  deep: gc ${row.deep.cpu.gcMs} ms / ${row.deep.cpu.totalMs} ms · alloc ${row.deep.alloc.MBps} MB/s (${row.deep.alloc.KBperFrame} KB/frame)`); }
        row.sec = +((Date.now() - ts) / 1000).toFixed(1);
        out.spots.push(row);
      } catch (err) { out.spots.push({ spot, failed: err.message.slice(0, 400) }); log(`${spot}: FAILED ${err.message.slice(0, 200)}`); }
      fs.writeFileSync(path.join(OUTDIR, LABEL + '.json'), JSON.stringify(out, null, 1));   // incremental
    }
    if (DO_WALK) {
      phase = 'walk';
      const v = { ...(SPOT_DEFS[WALK_AT] || views[WALK_AT]), time: WALK_TIME, az: undefined, el: undefined, dist: undefined, free: undefined };
      await page.evaluate(PAGE_POSE, { v, mode: WALK_MODE });
      await page.evaluate(PAGE_WAIT_FRAMES, SETTLE);
      await page.evaluate(() => window.game.prof(true));
      const loadAt = load();
      const plan = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }];
      const d = await sample(page, Math.ceil(WALK_SEC * 130), { gpu: true, walk: { plan, segMs: WALK_SEC * 1000 / plan.length, run: !!args['walk-run'] } }, (WALK_SEC + 60) * 1000);
      const prof = await page.evaluate(() => window.game.prof(true));
      const s = summarise(d);
      const path_ = []; for (let k = 0; k < d.n; k += 60) path_.push([Math.round(d.px[k]), Math.round(d.pz[k])]);
      const long = []; for (let k = 0; k < d.n; k++) { const iv = d.t[k + 1] - d.t[k]; if (iv > 25) long.push({ frame: k, sec: r2((d.t[k] - d.t[0]) / 1000), intervalMs: r2(iv), workMs: r2(d.work[k]), gpuMs: r2(d.gpu[k]), compiles: d.compile[k], pos: [Math.round(d.px[k]), Math.round(d.pz[k])] }); }
      out.walk = { at: WALK_AT, mode: WALK_MODE, seconds: WALK_SEC, load: loadAt, summary: s, prof, path: path_, long: long.slice(0, 60), longCount: long.length, series: slim(d) };
      log(`walk: ${s.frames} frames ${s.seconds}s · fps med ${s.fpsMedian} · p95 ${s.intervalP95} · max ${s.intervalMax} · >25 ${s.over25} · >40 ${s.over40} · heap ${s.heapGrowthMB} MB · load ${loadAt.join(' ')}`);
    }
    await context.close().catch(() => {});
  }
} catch (err) { out.failed = String(err.stack || err.message).slice(0, 800); log('FAILED', out.failed); process.exitCode = 1; }
finally { await browser?.close().catch(() => {}); cleanup(); }

out.meta.loadAtEnd = load(); out.meta.wallSec = Math.round((Date.now() - T0) / 1000);
out.meta.consoleErrors = out.console.filter((c) => c.type !== 'warning').length;
fs.writeFileSync(path.join(OUTDIR, LABEL + '.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(OUTDIR, LABEL + '.md'), toMd(out));
log(`wrote ${path.relative(root, path.join(OUTDIR, LABEL + '.json'))} + .md · ${out.meta.wallSec}s · console errors ${out.meta.consoleErrors}`);

// ── markdown ──────────────────────────────────────────────────────────────────────────────────────────────────
function toMd(o) {
  const k = (n) => (n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));
  const f = (x, d = 1) => (x == null ? '–' : (+x).toFixed(d));
  const env = o.pages[0]?.env || {};
  const L = [`# fpsbench · ${o.meta.label}`, '',
    ...(o.meta.patches ? ['**WHAT-IF RUN — sources patched in flight (not on disk):** ' + o.meta.patches.join(' · '), ''] : []),
    `${o.meta.date} · commit ${o.meta.commit} · ${o.meta.machine} · Chrome ${o.meta.browserVersion} · GL ${env.glRenderer} · ${W}x${H} css @ dpr ${env.dpr} → buffer ${env.drawingBuffer?.join('x')} · tier ${env.quality} · MSAA ${env.antialias} · GPU timer ${env.timer} · wall ${o.meta.wallSec}s · load start ${o.meta.loadAtStart?.join(' ')} end ${o.meta.loadAtEnd?.join(' ')} · console errors ${o.meta.consoleErrors}`, '',
    'Frame interval = RAF timestamp deltas (the display is 120 Hz: 8.3 ms = 120 fps, 16.7 = 60). work = main-thread time from the frame\'s RAF start to the end of the game\'s tick; upd = sum of system update(); render = renderer.render() CPU; gpu = timer query around renderer.render (shadow + main pass). draws = every GL draw in the frame (main + shadow). Contract J: ≥ 55 fps median at 2× DPR, no frame > 40 ms, ≤ 450 calls (aim ≤ 300).', ''];
  if (o.spots.length) {
    L.push('## Spots', '', '| spot | load 1m | fps med (mean) | interval p95 / p99 / max ms | >16.7 / >25 / >40 | work med / p95 / max | upd med / p95 | render CPU med / p95 | GPU med / p95 / max | GL draws | calls main + shadow | tris main + shadow | programs | heap Δ MB · alloc MB/s · GC drops |', '|---|---:|---|---|---|---|---|---|---|---:|---|---|---:|---|');
    for (const s of o.spots) {
      if (s.failed) { L.push(`| ${s.spot} | FAILED ${s.failed} |`); continue; }
      const m = s.summary, a = s.attr;
      L.push(`| ${s.spot} | ${s.load[0]} | ${f(m.fpsMedian)} (${f(m.fpsMean)}) | ${f(m.intervalP95)} / ${f(m.intervalP99)} / ${f(m.intervalMax)} | ${m.over16} / ${m.over25} / ${m.over40} | ${f(m.workMedian)} / ${f(m.workP95)} / ${f(m.workMax)} | ${f(m.updMedian)} / ${f(m.updP95)} | ${f(m.renderMedian)} / ${f(m.renderP95)} | ${f(m.gpuMedian)} / ${f(m.gpuP95)} / ${f(m.gpuMax)} | ${m.drawsMedian} | ${a?.main.calls ?? s.stats.calls} + ${a?.shadow.calls ?? '–'} | ${k(a?.main.tris ?? s.stats.triangles)} + ${k(a?.shadow.tris)} | ${s.stats.programs} | ${f(m.heapGrowthMB, 2)} · ${f(m.allocMBps, 2)} · ${m.gcDrops} |`);
    }
    L.push('');
    for (const s of o.spots) {
      if (s.failed) continue;
      const m = s.summary, a = s.attr;
      L.push(`### ${s.spot}  (${s.posed?.mode === undefined ? '' : 'mode ' + s.posed.mode + ', '}${s.pose.pos ? 'pos ' + s.pose.pos.join(',') : 'free ' + s.pose.free?.join(',')} @ ${s.pose.time}${s.pose.dist ? ', dist ' + s.pose.dist : ''})`, '');
      L.push(`uploads/frame: ${f(m.bufKBPerFrame)} KB buffers (max ${f(m.bufKBMax)}), ${f(m.texUploadsPerFrame, 2)} textures (${f(m.texKBPerFrame)} KB) · useProgram/frame ${m.useProgramMedian} · compiles in sample ${m.compiles} · lights: ${a ? a.pointVisible + ' point visible (' + a.pointLit + ' lit)' : '–'} · textures ${a?.textures.count} (~${a?.textures.estMB} MB, aniso ${JSON.stringify(a?.textures.aniso)}) · offscreen frustumCulled=false objects ${a?.offscreenObjects ?? '–'}`, '');
      if (a?.doublePass && Object.keys(a.doublePass).length) L.push(`transparent DoubleSide materials without forceSinglePass (three draws each object TWICE and re-evaluates its program twice a frame): ${Object.entries(a.doublePass).map(([k2, v]) => k2 + (v > 1 ? '×' + v : '')).join(', ')}`, '');
      if (m.sweep) L.push(`camera: ${m.sweep.sweepFrames} sweep frames · camera update p95 ${f(m.sweep.camP95Sweep, 2)} ms on sweep frames (max ${f(m.sweep.camMaxSweep, 2)}), ${f(m.sweep.camP95NonSweep, 2)} otherwise · sweepOcclusion (occMs) p95 ${f(m.sweep.occP95, 2)} max ${f(m.sweep.occMax, 2)} · raycast ms on sweep frames p95 ${f(m.sweep.rayP95OnSweep, 2)} · ${m.sweep.refreshFrames} candidate-refresh frames (scene.traverse p95 ${f(m.sweep.traverseP95, 2)} max ${f(m.sweep.traverseMax, 2)}; camera p95 on them ${f(m.sweep.camP95OnRefresh, 2)}) · sweep+refresh in one frame: ${m.sweep.sweepAndRefreshFrames} (p95 ${f(m.sweep.camP95SweepAndRefresh, 2)})`, '');
      L.push('| system | update mean / p95 / max ms | traverse mean / max (frames) | raycast mean / max (rays/frame) | main calls / tris | shadow calls / tris | noCull / off-screen calls | Δ hide sync / gpu ms | Δ noCast sync / gpu ms | top objects |', '|---|---|---|---|---|---|---|---|---|---|');
      const tg = {}; if (s.toggles) { for (const t of s.toggles) if (t.meta?.sys) { tg[t.meta.sys] = tg[t.meta.sys] || {}; tg[t.meta.sys][t.meta.kind] = { sync: t.dSync, gpu: t.dGpu, lc: t.lightChange }; } }
      const sysSet = new Set([...m.perSystem.map((x) => x.sys), ...Object.keys(a?.bySys || {})]);
      const rows = [...sysSet].map((sy) => ({ sy, p: m.perSystem.find((x) => x.sys === sy), b: a?.bySys?.[sy], t: tg[sy] }));
      rows.sort((x, y) => ((y.b?.calls || 0) + (y.b?.shadowCalls || 0) + (y.p?.mean || 0) * 20) - ((x.b?.calls || 0) + (x.b?.shadowCalls || 0) + (x.p?.mean || 0) * 20));
      for (const { sy, p, b, t } of rows) {
        L.push(`| ${sy} | ${p ? `${f(p.mean, 3)} / ${f(p.p95, 2)} / ${f(p.max, 2)}` : '–'} | ${p && p.travFrames ? `${f(p.travMean, 3)} / ${f(p.travMax, 2)} (${p.travFrames})` : '–'} | ${p && p.raysPerFrame ? `${f(p.rayMean, 3)} / ${f(p.rayMax, 2)} (${f(p.raysPerFrame, 1)})` : '–'} | ${b ? `${b.calls} / ${k(b.tris)}` : '–'} | ${b ? `${b.shadowCalls} / ${k(b.shadowTris)}` : '–'} | ${b ? `${b.noCull} / ${b.off}` : '–'} | ${t?.hide ? `${f(t.hide.sync, 2)} / ${f(t.hide.gpu, 2)}${t.hide.lc ? ' (' + t.hide.lc + '!)' : ''}` : '–'} | ${t?.noCast ? `${f(t.noCast.sync, 2)} / ${f(t.noCast.gpu, 2)}` : '–'} | ${b?.top || ''}${b?.offTop ? ' · OFF-SCREEN: ' + b.offTop : ''} |`);
      }
      L.push('');
      if (s.toggles) {
        const b0 = s.toggles[0];
        L.push(`toggles (paired, median of ${REPS}; base ≈ ${f(b0?.baseSync, 2)} ms sync / ${f(b0?.baseGpu, 2)} ms GPU, ${b0?.baseDraws} GL draws; Δ = saved): ` + s.toggles.filter((t) => !t.meta?.sys).map((t) => `${t.label}${t.meta?.n ? ' [' + t.meta.n + ']' : ''}: Δ ${f(t.dSync, 2)} sync / ${f(t.dGpu, 2)} GPU ms, −${t.dDraws} draws`).join(' · '), '');
      }
      L.push('slowest frames: ' + m.hitches.slice(0, 5).map((h) => `${f(h.intervalMs)} ms (work ${f(h.workMs)}, gpu ${f(h.gpuMs)}${h.sweep ? ', SWEEP occ ' + f(h.occMs, 2) : ''}${h.compiles ? ', ' + h.compiles + ' compiles' : ''}: ${h.who.map((w) => w[0] + ' ' + w[1]).join(', ')})`).join(' · '), '');
      if (s.dirty) {
        const ds = Object.entries(s.dirty.bySys).sort((x, y) => (y[1].bytesPerFrame + y[1].texBytesPerFrame) - (x[1].bytesPerFrame + x[1].texBytesPerFrame));
        L.push(`re-uploads per frame (version bumps over ${s.dirty.frames} frames): ` + ds.map(([sy, v]) => `${sy} ${v.n} attr ${f(v.bytesPerFrame / 1024)} KB${v.tex ? ` + ${v.tex} tex ${f(v.texBytesPerFrame / 1024)} KB` : ''}`).join(' · '), '');
        L.push('top re-uploaded: ' + s.dirty.top.slice(0, 10).map((x) => `${x.sys}:${x.name} ${f(x.bytes / 1024)} KB ×${x.perFrame}`).join(' · '), '');
        const pe = s.dirty.programEval;
        if (pe?.needsUpdateSites?.length) L.push('material.needsUpdate = true per frame, by call site: ' + pe.needsUpdateSites.map((x) => `${x.k} ×${x.perFrame}`).join(' · '), '');
        if (pe) L.push(`program re-evaluations (getProgram → getParameters + cache key) per frame: ${pe.perFrame} · materials ${pe.materials}, ${pe.sharedAcrossVariants} shared across object variants, ${pe.multiProgramCount} holding >1 program · top: ` + pe.top.slice(0, 8).map((x) => `${x.sys}:${x.mat} ×${x.perFrame}/f [${x.variants}${x.programs > 1 ? ', ' + x.programs + ' programs' : ''}${x.versionBumpsPerFrame ? ', needsUpdate ' + x.versionBumpsPerFrame + '/f' : ''}] (${x.objs})`).join(' · '), '');
        L.push(`DOM mutations/frame ${s.dirty.dom.perFrame}: ` + s.dirty.dom.byTarget.slice(0, 8).map((x) => `${x.k} ${x.perFrame}`).join(' · '), '');
      }
      if (s.deep) {
        const c = s.deep.cpu, al = s.deep.alloc;
        L.push(`CPU profile (${s.deep.frames} frames, ${s.deep.seconds}s, profiler on): total ${c.totalMs} ms, idle ${c.idleMs}, GC ${c.gcMs}, (program) ${c.programMs}`, '');
        L.push('- inclusive by file: ' + c.incFiles.filter((x) => !/^\((idle|root|program)\)$/.test(x.k)).slice(0, 14).map((x) => `${x.k} ${x.pct}%`).join(' · '));
        L.push('- self by function: ' + c.selfTop.filter((x) => !/^\((idle|root|program)\)$/.test(x.k)).slice(0, 14).map((x) => `${x.k} ${x.pct}%`).join(' · '));
        L.push(`- allocation (sampled, incl. collected): ${al.MBps} MB/s = ${al.KBperFrame} KB/frame · by game frame: ` + al.owners.slice(0, 10).map((x) => `${x.k} ${x.KBperFrame} KB/f`).join(' · '), '');
      }
    }
  }
  if (o.dusk) {
    const d = o.dusk, m = d.summary;
    L.push(`## Dusk ${d.from} → ${d.to} at ${d.at} (fresh page, cold shader cache; game clock at normal speed)`, '',
      `load ${d.load.join(' ')} · ${m.frames} frames, ${m.seconds}s · fps med ${m.fpsMedian} · interval p95 ${m.intervalP95} · max ${m.intervalMax} ms · >25 ${m.over25} · >40 ${m.over40} · programs ${d.programsBefore} → ${d.programsAfter} · compiles ${m.compiles} · links ${m.links} · point lights visible/lit ${d.lightsBefore.pointVisible}/${d.lightsBefore.pointLit} → ${d.lightsAfter.pointVisible}/${d.lightsAfter.pointLit} · shadow-casting dir lights ${d.lightsBefore.dirShadow} → ${d.lightsAfter.dirShadow}`, '',
      '| game time | interval ms | work ms | render CPU | GPU | compiles / links | programs | point visible / lit | dir shadow |', '|---:|---:|---:|---:|---:|---|---:|---|---:|');
    for (const x of d.spikes.slice(0, 30)) L.push(`| ${f(x.gtime, 2)} | ${f(x.intervalMs)} | ${f(x.workMs)} | ${f(x.renderMs)} | ${f(x.gpuMs)} | ${x.compiles} / ${x.links} | ${x.programs} | ${x.pointVisible} / ${x.pointLit} | ${x.dirShadow} |`);
    L.push('', 'materials that switched program over the transition: ' + Object.entries(d.programSwitchBySys || {}).sort((a, b) => b[1] - a[1]).map(([x, v]) => x + ' ' + v).join(', '), '', 'visible renderables Δ: ' + Object.entries(d.visibleDeltaBySys || {}).map(([x, v]) => x + ' ' + (v > 0 ? '+' : '') + v).join(', '));
    L.push('', 'light / program timeline: ' + d.timeline.slice(0, 30).map((x) => `${f(x.gtime, 2)}h ${x.pointVisible}/${x.pointLit}pl ${x.dirShadow}ds ${x.programs}p`).join(' → '), '');
  }
  if (o.cycle) {
    const kv = (o2) => Object.entries(o2 || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6).map(([x, v]) => `${x} ${v > 0 && !/new/.test(x) ? '+' : ''}${v}`).join(', ');
    L.push(`## Day/night cycle at ${o.cycle.at} (setTime per hour, 30 frames each; load ${o.cycle.load.join(' ')})`, '', '| hour | point lights visible / lit | shadow dir lights | programs | compiles / links | median / max frame ms | main calls | materials that switched program | visible renderables Δ |', '|---:|---|---:|---:|---|---|---:|---|---|');
    for (const r of o.cycle.rows) L.push(`| ${r.hour} | ${r.pointVisible} / ${r.pointLit} | ${r.dirShadow} | ${r.programs} | ${r.compiles} / ${r.links} | ${f(r.medFrameMs)} / ${f(r.maxFrameMs)} | ${r.calls} | ${kv(r.programSwitchBySys)} | ${kv(r.visibleDeltaBySys)} |`);
    L.push('');
  }
  if (o.walk) {
    const w = o.walk, m = w.summary;
    L.push(`## Free walk ${w.seconds}s at ${w.at} (mode ${w.mode}, live input, 4 directions)`, '',
      `load ${w.load.join(' ')} · ${m.frames} frames · fps med ${m.fpsMedian} (mean ${m.fpsMean}) · interval p95 ${m.intervalP95} / p99 ${m.intervalP99} / max ${m.intervalMax} ms · >16.7 ${m.over16} · >25 ${m.over25} · >40 ${m.over40} · work med/p95/max ${m.workMedian}/${m.workP95}/${m.workMax} · GPU med/p95 ${m.gpuMedian}/${m.gpuP95} · heap Δ ${m.heapGrowthMB} MB · alloc ${m.allocMBps} MB/s · GC drops ${m.gcDrops} · compiles ${m.compiles}`, '',
      'path (every 60 frames): ' + w.path.map((p) => p.join(',')).join(' → '), '',
      'frames > 25 ms: ' + (w.long.length ? w.long.slice(0, 20).map((x) => `${x.sec}s ${x.intervalMs} ms (work ${x.workMs}, gpu ${x.gpuMs}${x.compiles ? ', ' + x.compiles + ' compiles' : ''}) @${x.pos.join(',')}`).join(' · ') : 'none'), '',
      'slowest frames: ' + m.hitches.slice(0, 5).map((h) => `${f(h.intervalMs)} ms (work ${f(h.workMs)}${h.sweep ? ', SWEEP' : ''}: ${h.who.map((x) => x[0] + ' ' + x[1]).join(', ')})`).join(' · '), '',
      'update() per system (mean / p95 / max ms): ' + m.perSystem.slice(0, 12).map((p) => `${p.sys} ${f(p.mean, 3)}/${f(p.p95, 2)}/${f(p.max, 2)}`).join(' · '), '');
  }
  const errs = o.console.filter((c) => c.type !== 'warning');
  L.push('## Console', '', errs.length ? errs.slice(0, 20).map((e) => `- [${e.page}/${e.phase}] ${e.type}: ${e.text}`).join('\n') : 'no errors', '', `warnings: ${o.console.length - errs.length}`, '');
  return L.join('\n');
}
