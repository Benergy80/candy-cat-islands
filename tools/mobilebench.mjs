// iPhone / mobile-tier benchmark (WAVE 3 Contract I). Read-only on game files.
//   node tools/mobilebench.mjs                                  # q=mobile,high × engine=webkit,chromium × 6 spots
//   node tools/mobilebench.mjs --q mobile --engine webkit --spots candy_village,cat_main_street
//   node tools/mobilebench.mjs --table-only                     # rebuild renders/w3_iphone/bench_table.md from the JSONs
// --q auto = no ?q= param (tier auto-detected as on a real phone; touch.js then also applies its shadow cap).
// Options: --device "iPhone 13" (landscape 844x390, hasTouch) · --pr auto|<n> (auto = the device's real pixel ratio for
//   the tier: mobile 1.5, high 2; shot mode otherwise pins 1) · --frames 45 · --toggle candy_village,cat_main_street
//   (visibility-toggle cross-check spots; "none" to skip) · --noshots · --label <suffix> · --outdir renders/w3_iphone
// Output: renders/w3_iphone/bench_<q>_<engine>[_<label>].json + .md, screenshots <q>_<engine>_<spot>.png, and
//   renders/w3_iphone/bench_table.md aggregating every bench_*.json in the folder.
// Metrics per spot: main-pass calls/tris (= game.stats(), three's renderer.info — NOTE r170 resets info AFTER the
//   shadow pass, so stats() never includes shadow draws), shadow-pass calls/tris (counted by a renderBufferDirect hook),
//   geometries, textures, programs, frameMs (the game's own number) and syncMs (render + 1-px readPixels, median of 3),
//   console errors, and per-system attribution (every top-level scene child is tagged with the system whose create()/
//   update() added it — main.js is instrumented in flight through page.route, never on disk).
import { chromium, webkit, devices } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';

const argv = process.argv.slice(2);
const args = Object.fromEntries(argv.map((a, i, arr) => a.startsWith('--') ? [a.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true] : []).filter(Boolean));
const PORT = args.port || 8787;
const root = path.resolve(new URL('..', import.meta.url).pathname);
const OUTDIR = path.resolve(root, args.outdir || 'renders/w3_iphone');
fs.mkdirSync(OUTDIR, { recursive: true });
const LABEL = args.label ? '_' + args.label : '';

// ── views (same merge rule as tools/render.mjs) ──────────────────────────────
const views = JSON.parse(fs.readFileSync(path.join(root, 'tools/views.json'), 'utf8'));
const vdir = path.join(root, 'tools/views');
if (fs.existsSync(vdir)) for (const f of fs.readdirSync(vdir)) if (f.endsWith('.json')) { try { Object.assign(views, JSON.parse(fs.readFileSync(path.join(vdir, f), 'utf8'))); } catch (e) { /* another builder's file mid-write */ } }
const SPOT_DEFS = {
  candy_village: { pos: [-140, 40], time: 11 },
  cat_main_street: views.cat_main_street || { pos: [118, 0], time: 12 },
  cat_plaza: views.cat_plaza || { pos: [78, 18], time: 11 },
  candy_forest: views.candy_forest || { pos: [-200, -20], time: 14 },
  candy_night: { pos: [-140, 40], time: 23 },
  sea_crossing: views.sea_crossing || { free: [0, 22], az: 0.5, el: 0.5, dist: 90, time: 17 },
};
const FRAMES = Number(args.frames || 45);
const SPOTS = String(args.spots || Object.keys(SPOT_DEFS).join(',')).split(',').filter(Boolean);
const QS = String(args.q || 'mobile,high').split(',').filter(Boolean);
const ENGINES = String(args.engine || 'webkit,chromium').split(',').filter(Boolean);
const TOGGLE = args.toggle === 'none' ? [] : String(args.toggle || 'candy_village,cat_main_street').split(',');
const DEVICE = args.device || 'iPhone 13';

// ── table-only mode ──────────────────────────────────────────────────────────
function fmtK(n) { return n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n); }
function tableFor(b) {
  const L = [`### ${b.q} · ${b.engine} (${b.device}, ${b.viewport.width}x${b.viewport.height}, pr ${b.env?.pixelRatio}, tier=${b.env?.state?.quality})`, '',
    '| spot | calls (main) | shadow calls | tris (main) | shadow tris | geoms | textures | programs | frameMs | syncMs | errors |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const s of b.spots) {
    if (s.failed) { L.push(`| ${s.spot} | FAILED: ${s.failed} |||||||||`); continue; }
    L.push(`| ${s.spot} | ${s.stats.calls} | ${s.hook?.shadow.calls ?? '–'} | ${fmtK(s.stats.triangles)} | ${fmtK(s.hook?.shadow.tris)} | ${s.stats.geometries} | ${s.stats.textures} | ${s.programs ?? '–'} | ${s.stats.frameMs?.toFixed(1)} | ${s.syncMs?.toFixed(1) ?? '–'} | ${s.errors.length} |`);
  }
  return L.join('\n');
}
function aggregate() {
  const files = fs.readdirSync(OUTDIR).filter((f) => /^bench_.*\.json$/.test(f)).sort();
  const benches = files.map((f) => { try { return JSON.parse(fs.readFileSync(path.join(OUTDIR, f), 'utf8')); } catch { return null; } }).filter(Boolean);
  const out = ['# iPhone bench — ' + new Date().toISOString(), '', 'calls/tris (main) = game.stats() = renderer.info (r170 excludes the shadow pass); shadow = extra GPU draws in the shadow map pass. Contract I goal on mobile: ≤ 220 calls, ≤ 550k tris.', ''];
  for (const b of benches) out.push(tableFor(b), '');
  // cross-grid: calls/tris per spot for every run
  if (benches.length > 1) {
    const spots = [...new Set(benches.flatMap((b) => b.spots.map((s) => s.spot)))];
    out.push('### Side by side (main calls / main tris / shadow calls)', '', '| spot | ' + benches.map((b) => `${b.q}·${b.engine}${b.label || ''}`).join(' | ') + ' |', '|---|' + benches.map(() => '---:').join('|') + '|');
    for (const sp of spots) out.push(`| ${sp} | ` + benches.map((b) => { const s = b.spots.find((x) => x.spot === sp); return s && !s.failed ? `${s.stats.calls} / ${fmtK(s.stats.triangles)} / ${s.hook?.shadow.calls ?? '–'}` : '–'; }).join(' | ') + ' |');
    out.push('');
  }
  fs.writeFileSync(path.join(OUTDIR, 'bench_table.md'), out.join('\n'));
  return out.join('\n');
}
if (args['table-only']) { console.log(aggregate()); process.exit(0); }

// ── concurrency gate (same protocol as render.mjs; heartbeat so a long run is never reaped as stale) ──
const MAX_SLOTS = Number(process.env.RENDER_SLOTS || 2);
const lockDir = path.join(root, 'renders/.locks'); fs.mkdirSync(lockDir, { recursive: true });
let slot = null, beat = null;
async function acquire() {
  const t0 = Date.now();
  while (true) {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const p = path.join(lockDir, 'slot' + i);
      try { const st = fs.statSync(p); if (Date.now() - st.mtimeMs > 6 * 60 * 1000) fs.rmSync(p, { recursive: true, force: true }); } catch {}
      try { fs.mkdirSync(p); slot = p; beat = setInterval(() => { try { const n = new Date(); fs.utimesSync(slot, n, n); } catch {} }, 30000); return; } catch {}
    }
    if (Date.now() - t0 > 30 * 60 * 1000) throw new Error('render slot wait timed out');
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
  }
}
function release() { if (beat) clearInterval(beat); beat = null; if (slot) { try { fs.rmSync(slot, { recursive: true, force: true }); } catch {} slot = null; } }
process.on('exit', release); process.on('SIGINT', () => { release(); process.exit(1); }); process.on('SIGTERM', () => { release(); process.exit(1); });

// ── in-flight instrumentation of main.js (tags each top-level scene child with the system that added it) ──
function instrumentMain(src) {
  const hits = {};
  const rep = (key, re, fn) => { const before = src; src = src.replace(re, fn); hits[key] = before !== src; };
  rep('sceneAdd', /const scene = new THREE\.Scene\(\);/, (m) => m + `
window.__benchSys = 'main';
{ const _add = scene.add; scene.add = function (...objs) { for (const o of objs) if (o && o.isObject3D && o.userData && !o.userData.__sys) o.userData.__sys = window.__benchSys; return _add.apply(this, objs); };
  const _att = scene.attach; scene.attach = function (o) { if (o && o.isObject3D && o.userData && !o.userData.__sys) o.userData.__sys = window.__benchSys; return _att.call(this, o); }; }`);
  rep('create', /try \{ ctx\.systems\[name\] = mod\.create\(ctx\)/, () => 'try { window.__benchSys = name; ctx.systems[name] = mod.create(ctx)');
  rep('update', /if \(sys\?\.update\) \{ try \{ sys\.update\(dt, ctx\);/, () => 'if (sys?.update) { try { window.__benchSys = name; sys.update(dt, ctx);');
  rep('afterLoop', /ctx\.input\.endFrame\(\);/, (m) => `window.__benchSys = 'main'; ` + m);
  return { src, hits };
}

// init script: record every WebGL extension the page asks for (and whether it got it)
const INIT = () => {
  window.__extReq = {};
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue; const orig = C.prototype.getExtension;
    C.prototype.getExtension = function (n) { const r = orig.call(this, n); window.__extReq[n] = !!r; return r; };
  }
};

// ── in-page helpers (serialised into the page) ───────────────────────────────
const PAGE_SETUP = () => {
  const g = window.game, ctx = g.ctx, R = ctx.renderer, scene = ctx.scene;
  const sysOf = (o) => { let t = o; while (t && t.parent && t.parent !== scene) t = t.parent; if (!t || t.parent !== scene) return o === scene ? 'scene' : '(unparented)'; return t.userData?.__sys || ('?' + (t.name || t.type)); };
  const B = window.__bench = { on: false, main: {}, shadow: {}, sysOf };
  const orig = R.renderBufferDirect;
  R.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
    if (!B.on) return orig.apply(this, arguments);
    const c0 = R.info.render.calls, t0 = R.info.render.triangles, p0 = R.info.render.points;
    orig.apply(this, arguments);
    const dc = R.info.render.calls - c0; if (!dc) return;
    const bucket = camera === ctx.camera ? B.main : B.shadow; const s = sysOf(object);
    const e = bucket[s] || (bucket[s] = { calls: 0, tris: 0, points: 0, objs: {} });
    e.calls += dc; e.tris += R.info.render.triangles - t0; e.points += R.info.render.points - p0;
    const on = object.name || object.type; e.objs[on] = (e.objs[on] || 0) + dc;
  };
  const gl = R.getContext();
  const attrs = gl.getContextAttributes();
  const exts = gl.getSupportedExtensions() || [];
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    state: { quality: ctx.state.quality, mobile: ctx.state.mobile, touch: ctx.state.touch },
    pixelRatio: R.getPixelRatio(), drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
    antialias: attrs.antialias, shadowType: R.shadowMap.type, shadowEnabled: R.shadowMap.enabled,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE), maxRenderbuffer: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS), maxTexUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    glRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    supportedExtensions: exts, userAgent: navigator.userAgent, dpr: window.devicePixelRatio, inner: [innerWidth, innerHeight],
    instrumented: Object.values(scene.children).filter((c) => c.userData?.__sys).length + '/' + scene.children.length,
  };
};

const PAGE_SPOT = async ({ v, frames }) => {
  const g = window.game, ctx = g.ctx;
  g.setTime(v.time ?? 12);
  if (v.pos) g.teleport(v.pos[0], v.pos[1]);
  if (v.az !== undefined || v.el !== undefined || v.dist !== undefined || v.fov !== undefined) {
    const p = {}; if (v.az !== undefined) p.azimuth = v.az; if (v.el !== undefined) p.elevation = v.el; if (v.dist !== undefined) p.distance = v.dist; if (v.fov !== undefined) p.fov = v.fov; g.setCameraParams(p);
  }
  if (v.free) { try { if (g.world.height(v.free[0], v.free[1]) > 0.6) g.teleport(v.free[0], v.free[1]); } catch (e) {} const y = v.y ?? (g.world.height(v.free[0], v.free[1]) + 2); g.setView({ target: [v.free[0], y, v.free[1]], azimuth: v.az ?? 0.78, elevation: v.el ?? 0.6, distance: v.dist ?? 120, fov: v.fov }); }
  else g.setView(null);
  if (v.call) for (const [p, a] of Object.entries(v.call)) { try { const parts = p.split('.'); let o = ctx.systems; for (let i = 0; i < parts.length - 1; i++) o = o?.[parts[i]]; const f = o?.[parts[parts.length - 1]]; if (typeof f === 'function') f.apply(o, Array.isArray(a) ? a : [a]); } catch (e) {} }
  g.step(frames, 1 / 30);
  return g.stats();
};

const PAGE_MEASURE = ({ toggle }) => {
  const g = window.game, ctx = g.ctx, R = ctx.renderer, scene = ctx.scene, B = window.__bench, gl = R.getContext();
  const render = () => { if (ctx.renderOverride) ctx.renderOverride(0); else R.render(scene, ctx.camera); };
  const px = new Uint8Array(4);
  // timing: render + readPixels forces completion (median of 3)
  const times = [];
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); times.push(performance.now() - t0); }
  times.sort((a, b) => a - b);
  const programs = R.info.programs?.length ?? null;   // read BEFORE the toggle pass (which must not add programs)
  // attribution pass
  B.main = {}; B.shadow = {}; B.on = true; render(); B.on = false;
  const sum = (bk) => Object.values(bk).reduce((a, e) => ({ calls: a.calls + e.calls, tris: a.tris + e.tris }), { calls: 0, tris: 0 });
  const hook = { main: sum(B.main), shadow: sum(B.shadow), bySys: {} };
  for (const s of new Set([...Object.keys(B.main), ...Object.keys(B.shadow)])) {
    const m = B.main[s] || { calls: 0, tris: 0, points: 0, objs: {} }, sh = B.shadow[s] || { calls: 0, tris: 0, objs: {} };
    const top = Object.entries(m.objs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + '×' + n).join(', ');
    hook.bySys[s] = { calls: m.calls, tris: m.tris, points: m.points, shadowCalls: sh.calls, shadowTris: sh.tris, topObjs: top };
  }
  // visibility-toggle cross-check (main pass via renderer.info; shadow via the hook). Only RENDERABLES are hidden —
  // hiding a whole group would also hide its lights, change the light count and recompile every lit program.
  let toggled = null;
  if (toggle) {
    render(); const base = { calls: R.info.render.calls, tris: R.info.render.triangles };
    const bySys = {}; for (const c of scene.children) { const s = c.userData?.__sys || ('?' + (c.name || c.type)); (bySys[s] = bySys[s] || []).push(c); }
    toggled = { base, bySys: {} };
    for (const [s, list] of Object.entries(bySys)) {
      const hid = []; for (const c of list) c.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) { o.visible = false; hid.push(o); } });
      B.main = {}; B.shadow = {}; B.on = true; render(); B.on = false;
      const sh = sum(B.shadow);
      toggled.bySys[s] = { dCalls: base.calls - R.info.render.calls, dTris: base.tris - R.info.render.triangles, shadowCallsLeft: sh.calls, groups: list.length };
      for (const o of hid) o.visible = true;
    }
    render();
  }
  return { syncMs: times[1], syncAll: times, programs, programsAfter: R.info.programs?.length ?? null, hook, toggled };
};

// scene-wide audit: per-system object counts, textures, material features Safari may lack, lights/shadows, system stats()
const PAGE_AUDIT = () => {
  const g = window.game, ctx = g.ctx, R = ctx.renderer, scene = ctx.scene, B = window.__bench;
  const per = {}; const texSeen = new Map(); const matSeen = new Set(); const matFlags = []; const lights = [];
  const P = (s) => per[s] || (per[s] = { objects: 0, meshes: 0, instanced: 0, instances: 0, skinned: 0, batched: 0, points: 0, lines: 0, sprites: 0, castShadow: 0, castShadowVisible: 0, vertsTotal: 0, trisTotal: 0, materials: new Set(), matSet: new Set(), customShaders: 0, shaderMaterials: 0, topLevel: 0, names: new Set() });
  for (const c of scene.children) { const p = P(B.sysOf(c)); p.topLevel++; if (c.name) p.names.add(c.name); }
  const texInfo = (t) => {
    const img = t.image; let w = 0, h = 0;
    if (Array.isArray(img)) { w = img[0]?.width || img[0]?.image?.width || 0; h = img[0]?.height || img[0]?.image?.height || 0; }
    else if (img) { w = img.width || img.videoWidth || 0; h = img.height || img.videoHeight || 0; }
    return { w, h };
  };
  const addTex = (t, where, sys) => {
    if (!t || !t.isTexture) return; let e = texSeen.get(t.uuid);
    if (!e) { const { w, h } = texInfo(t); e = { name: t.name || '', src: t.source?.uuid || t.uuid, w, h, type: t.type, minFilter: t.minFilter, magFilter: t.magFilter, mip: t.generateMipmaps, kind: t.isCubeTexture ? 'cube' : t.isDataTexture ? 'data' : t.isCanvasTexture ? 'canvas' : t.isCompressedTexture ? 'compressed' : t.isRenderTargetTexture || t.isFramebufferTexture ? 'rt' : 'image', aniso: t.anisotropy, users: new Set() }; texSeen.set(t.uuid, e); }
    e.users.add(sys + ':' + where);
  };
  const visible = (o) => { for (let t = o; t; t = t.parent) if (!t.visible) return false; return true; };
  scene.traverse((o) => {
    const s = B.sysOf(o); const p = P(s); p.objects++;
    if (o.isLight) { lights.push({ sys: s, type: o.type, name: o.name, castShadow: !!o.castShadow, mapSize: o.shadow ? [o.shadow.mapSize.x, o.shadow.mapSize.y] : null, intensity: +o.intensity?.toFixed?.(2), visible: visible(o) }); }
    if (o.isMesh) p.meshes++; if (o.isInstancedMesh) { p.instanced++; p.instances += o.count; } if (o.isSkinnedMesh) p.skinned++; if (o.isBatchedMesh) p.batched++;
    if (o.isPoints) p.points++; if (o.isLine) p.lines++; if (o.isSprite) p.sprites++;
    if ((o.isMesh || o.isPoints || o.isLine) && o.castShadow) { p.castShadow++; if (visible(o)) p.castShadowVisible++; }
    const geo = o.geometry;
    if (geo && geo.attributes?.position) {
      const n = o.isInstancedMesh ? o.count : 1; const pos = geo.attributes.position.count; const idx = geo.index ? geo.index.count : pos;
      p.vertsTotal += pos * n; if (o.isMesh) p.trisTotal += Math.floor(idx / 3) * n;
    }
    if (!o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue; p.materials.add(m.type); p.matSet.add(m.uuid);
      for (const k in m) { const v = m[k]; if (v && v.isTexture) addTex(v, k, s); }
      if (m.uniforms) for (const [k, u] of Object.entries(m.uniforms)) { const v = u?.value; if (v?.isTexture) addTex(v, 'u.' + k, s); else if (Array.isArray(v)) v.forEach((t) => t?.isTexture && addTex(t, 'u.' + k, s)); }
      if (matSeen.has(m.uuid)) continue; matSeen.add(m.uuid);
      const f = [];
      if (m.extensions) for (const [k, on] of Object.entries(m.extensions)) if (on) f.push('extensions.' + k);
      const src = (m.vertexShader || '') + '\n' + (m.fragmentShader || '');
      for (const m2 of src.matchAll(/#extension\s+(\w+)/g)) f.push('#extension ' + m2[1]);
      if (/gl_FragDepth/.test(src)) f.push('gl_FragDepth');
      if (/\btexelFetch\b|\btextureSize\b/.test(src) && m.isRawShaderMaterial) f.push('GLSL3 builtins in RawShader');
      if (m.isRawShaderMaterial && m.glslVersion !== '300 es') f.push('RawShaderMaterial GLSL1');
      if (m.transmission > 0) f.push('transmission (extra opaque pass + half-float RT)');
      if (m.alphaToCoverage) f.push('alphaToCoverage (no-op without MSAA)');
      if (m.wireframe) f.push('wireframe');
      if (m.clearcoat > 0) f.push('clearcoat');
      if (m.sheen > 0) f.push('sheen');
      if (m.iridescence > 0) f.push('iridescence');
      if (m.dispersion > 0) f.push('dispersion');
      if (m.logarithmicDepthBuffer) f.push('logDepth');
      if (!/^onBeforeCompile\s*\(\s*\/\*[^]*?\*\/\s*\)\s*\{\s*\}$|^onBeforeCompile\s*\(\s*\)\s*\{\s*\}$/.test(String(m.onBeforeCompile))) p.customShaders++;
      if (m.isShaderMaterial) p.shaderMaterials++;
      if (f.length) matFlags.push({ sys: s, obj: o.name || o.type, mat: m.name || m.type, flags: f });
    }
  });
  if (scene.background?.isTexture) addTex(scene.background, 'scene.background', 'scene');
  if (scene.environment?.isTexture) addTex(scene.environment, 'scene.environment', 'scene');
  const FLOAT = 1015, HALF = 1016, NEAREST = [1003, 1004, 1005];
  const textures = [...texSeen.values()].map((e) => ({ ...e, users: [...e.users].slice(0, 6), usersN: e.users.size }));
  const big = textures.filter((t) => t.w > 2048 || t.h > 2048);
  const floatLinear = textures.filter((t) => (t.type === FLOAT) && (!NEAREST.includes(t.minFilter) || !NEAREST.includes(t.magFilter)));
  const halfLinear = textures.filter((t) => (t.type === HALF) && (!NEAREST.includes(t.minFilter) || !NEAREST.includes(t.magFilter)));
  const texBySize = textures.slice().sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 15);
  const bySrc = new Map(); for (const t of textures) if (!bySrc.has(t.src)) bySrc.set(t.src, t);
  const texBytes = [...bySrc.values()].reduce((a, t) => a + t.w * t.h * 4 * (t.mip ? 1.33 : 1) * (t.kind === 'cube' ? 6 : 1), 0);
  const shadowBytes = lights.filter((l) => l.castShadow && l.mapSize).reduce((a, l) => a + l.mapSize[0] * l.mapSize[1] * 8, 0);
  const sysStats = {};
  for (const [n, s] of Object.entries(ctx.systems)) {
    if (typeof s?.stats === 'function') { try { const v = s.stats(); sysStats[n] = JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' ? +x.toFixed?.(3) : x))); } catch (e) { sysStats[n] = { error: String(e.message) }; } }
    if (s?.__loadError || s?.__error) sysStats[n] = { ...(sysStats[n] || {}), LOAD_OR_CREATE_ERROR: String(s.__loadError || s.__error?.message || s.__error) };
  }
  const perOut = {}; for (const [k, v] of Object.entries(per)) perOut[k] = { ...v, materials: [...v.materials].join(','), uniqueMaterials: v.matSet.size, matSet: undefined, names: [...v.names].slice(0, 8).join(',') };
  const topLevel = scene.children.map((c) => ({ sys: c.userData?.__sys || null, name: c.name, type: c.type, children: c.children.length }));
  return { perSystem: perOut, lights, textures: { count: textures.length, uniqueSources: bySrc.size, estMB: +(texBytes / 1048576).toFixed(1), shadowMapMB: +(shadowBytes / 1048576).toFixed(1), big, floatLinear, halfLinear, largest: texBySize }, materialFlags: matFlags, sysStats, topLevel, extRequested: Object.fromEntries(Object.entries(window.__extReq || {}).filter(([k]) => k !== 'WEBGL_debug_renderer_info')), info: { geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs?.length } };
};

// ── run ──────────────────────────────────────────────────────────────────────
async function runEngine(engineName) {
  const bt = engineName === 'webkit' ? webkit : chromium;
  const launchOpts = engineName === 'chromium' ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] } : {};
  await acquire();
  const browser = await bt.launch(launchOpts);
  try {
    for (const q of QS) {
      const t0 = Date.now();
      const dev = { ...devices[DEVICE] }; delete dev.defaultBrowserType;
      const viewport = { width: Number(args.w || 844), height: Number(args.h || 390) };
      const context = await browser.newContext({ ...dev, viewport, screen: { width: viewport.width, height: viewport.height } });
      await context.addInitScript(INIT);
      const page = await context.newPage();
      let instr = null;
      await page.route(/\/src\/main\.js(\?.*)?$/, async (route) => {
        const resp = await route.fetch(); const r = instrumentMain(await resp.text()); instr = r.hits;
        await route.fulfill({ response: resp, body: r.src, headers: { ...resp.headers(), 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
      });
      const log = []; let phase = 'load';
      page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') log.push({ phase, type: t, text: m.text().slice(0, 400) }); });
      page.on('pageerror', (e) => log.push({ phase, type: 'pageerror', text: String(e.message).slice(0, 400) }));
      const bench = { q, engine: engineName, label: LABEL, device: DEVICE, viewport, when: new Date().toISOString(), spots: [] };
      try {
        // q=auto: no ?q= at all, so main.js/touch.js detect the tier exactly as on a real phone
        await page.goto(`http://127.0.0.1:${PORT}/?shot=1${q === 'auto' ? '' : '&q=' + q}`, { waitUntil: 'load', timeout: 120000 });
        await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 420000, polling: 1000 });
        bench.loadSec = +((Date.now() - t0) / 1000).toFixed(1);
        bench.instrumentation = instr;
        // emulate the device's real backing-store ratio (shot mode pins 1): mobile tier caps 1.5, desktop tier 2
        const tier = await page.evaluate(() => window.game.ctx.state.quality);
        const pr = args.pr === undefined || args.pr === 'auto' ? Math.min(dev.deviceScaleFactor || 1, tier === 'mobile' ? 1.5 : 2) : Number(args.pr);
        await page.evaluate((pr) => { const R = window.game.ctx.renderer; if (Math.abs(R.getPixelRatio() - pr) > 1e-3) { R.setPixelRatio(pr); window.dispatchEvent(new Event('resize')); } }, pr);
        bench.env = await page.evaluate(PAGE_SETUP);
        bench.loadErrors = log.filter((e) => e.phase === 'load');
        console.log(`[${engineName} q=${q}] ready in ${bench.loadSec}s · tier=${bench.env.state.quality} webgl2=${bench.env.webgl2} pr=${bench.env.pixelRatio} aa=${bench.env.antialias} maxTex=${bench.env.maxTextureSize} instr=${JSON.stringify(instr)} tagged=${bench.env.instrumented}`);
        for (const spot of SPOTS) {
          const v = SPOT_DEFS[spot] || views[spot]; if (!v) { bench.spots.push({ spot, failed: 'unknown spot' }); continue; }
          phase = spot; const ts = Date.now();
          try {
            const stats = await page.evaluate(PAGE_SPOT, { v, frames: FRAMES });
            let shot = null;
            if (!args.noshots) { shot = path.join(OUTDIR, `${q}_${engineName}${LABEL}_${spot}.png`); await page.screenshot({ path: shot, type: 'png', scale: 'css', timeout: 300000 }); }
            const m = await page.evaluate(PAGE_MEASURE, { toggle: TOGGLE.includes(spot) });
            const audit = await page.evaluate(PAGE_AUDIT);
            const errors = log.filter((e) => e.phase === spot && e.type !== 'warning');
            const warnings = log.filter((e) => e.phase === spot && e.type === 'warning');
            bench.spots.push({ spot, view: v, stats, shot: shot && path.relative(root, shot), ...m, audit, errors, warnings: [...new Set(warnings.map((w) => w.text))].slice(0, 15), sec: +((Date.now() - ts) / 1000).toFixed(1) });
            console.log(`  ${spot}: calls=${stats.calls} (+${m.hook.shadow.calls} shadow) tris=${stats.triangles} (+${m.hook.shadow.tris} shadow) geoms=${stats.geometries} tex=${stats.textures} progs=${m.programs} frameMs=${stats.frameMs.toFixed(1)} syncMs=${m.syncMs.toFixed(1)} errors=${errors.length} (${((Date.now() - ts) / 1000).toFixed(0)}s)`);
          } catch (err) { bench.spots.push({ spot, failed: err.message.slice(0, 300), errors: log.filter((e) => e.phase === spot) }); console.log(`  ${spot}: FAILED ${err.message.slice(0, 200)}`); }
        }
      } catch (err) { bench.failed = err.message.slice(0, 400); bench.loadErrors = log.slice(0, 40); console.log(`[${engineName} q=${q}] FAILED: ${bench.failed}`); }
      bench.allErrors = [...new Set(log.filter((e) => e.type !== 'warning').map((e) => e.text))];
      bench.allWarnings = [...new Set(log.filter((e) => e.type === 'warning').map((e) => e.text))].slice(0, 40);
      const base = path.join(OUTDIR, `bench_${q}_${engineName}${LABEL}`);
      fs.writeFileSync(base + '.json', JSON.stringify(bench, null, 1));
      fs.writeFileSync(base + '.md', tableFor(bench) + '\n');
      await context.close().catch(() => {});
    }
  } finally { await browser.close().catch(() => {}); release(); }
}

try { for (const e of ENGINES) await runEngine(e); console.log('\n' + aggregate()); }
catch (err) { console.error('BENCH FAILED:', err.message); process.exitCode = 1; }
finally { release(); }
