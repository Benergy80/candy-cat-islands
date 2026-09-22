// Headless screenshot harness.
//   node tools/render.mjs --out renders/x.png --pos -140,40 --time 12 [--az 0.78 --el 0.62 --dist 46] [--frames 60] [--w 1600 --h 1000] [--scale 2]
//   node tools/render.mjs --view candy_village            # named view from tools/views.json
//   node tools/render.mjs --all [--filter candy] [--outdir renders/tour]   # every named view, one browser session
//   node tools/render.mjs --free -175,-62 --az 0.8 --el 0.5 --dist 160 --out renders/overview.png   # free camera aimed at a point
// The page is opened with ?shot=1 so the RAF loop is off; frames are stepped deterministically.
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true] : []).filter(Boolean));
const PORT = args.port || 8787;
const W = Number(args.w || 1600), H = Number(args.h || 1000), SCALE = Number(args.scale || 1);
const root = path.resolve(new URL('..', import.meta.url).pathname);
const views = JSON.parse(fs.readFileSync(path.join(root, 'tools/views.json'), 'utf8'));
const vdir = path.join(root, 'tools/views');
if (fs.existsSync(vdir)) for (const f of fs.readdirSync(vdir)) if (f.endsWith('.json')) { try { Object.assign(views, JSON.parse(fs.readFileSync(path.join(vdir, f), 'utf8'))); } catch (e) { console.error('bad views file', f, e.message); } }

function parseView() {
  if (args.view) { const v = views[args.view]; if (!v) throw new Error('unknown view ' + args.view); return { name: args.view, ...v }; }
  const v = { name: 'custom', time: Number(args.time ?? 12), frames: Number(args.frames ?? 45) };
  if (args.pos) { const [x, z] = String(args.pos).split(',').map(Number); v.pos = [x, z]; }
  if (args.free) { const [x, z] = String(args.free).split(',').map(Number); v.free = [x, z]; }
  for (const k of ['az', 'el', 'dist', 'fov', 'y']) if (args[k] !== undefined) v[k] = Number(args[k]);
  if (args.walk) { const [x, y, n] = String(args.walk).split(',').map(Number); v.walk = { x, y, n }; }
  return v;
}

async function shoot(page, v, out) {
  await page.evaluate(async (v) => {
    const g = window.game; g.setTime(v.time ?? 12);
    if (v.pos) g.teleport(v.pos[0], v.pos[1]);
    if (v.az !== undefined || v.el !== undefined || v.dist !== undefined || v.fov !== undefined) {
      const p = {}; if (v.az !== undefined) p.azimuth = v.az; if (v.el !== undefined) p.elevation = v.el; if (v.dist !== undefined) p.distance = v.dist; if (v.fov !== undefined) p.fov = v.fov; g.setCameraParams(p);
    }
    if (v.free) { try { if (g.world.height(v.free[0], v.free[1]) > 0.6) g.teleport(v.free[0], v.free[1]); } catch (e) {} const y = v.y ?? (g.world.height(v.free[0], v.free[1]) + 2); g.setView({ target: [v.free[0], y, v.free[1]], azimuth: v.az ?? 0.78, elevation: v.el ?? 0.6, distance: v.dist ?? 120, fov: v.fov }); }
    else g.setView(null);
    // Optional: let a view call a system API before the frames run, e.g.
    //   "call": { "ferry.setProgress": 0.5 }   → ctx.systems.ferry.setProgress(0.5)
    if (v.call) for (const [path, args] of Object.entries(v.call)) {
      try {
        const parts = path.split('.');
        let o = g.ctx.systems;
        for (let i = 0; i < parts.length - 1; i++) o = o?.[parts[i]];
        const f = o?.[parts[parts.length - 1]];
        if (typeof f === 'function') f.apply(o, Array.isArray(args) ? args : [args]);
        else console.error('view call: not a function —', path);
      } catch (e) { console.error('view call failed', path, e.message); }
    }
    if (v.walk) g.walk({ x: v.walk.x, y: v.walk.y }, v.walk.n || 30);
    g.step(v.frames ?? 45, 1 / 30);
  }, v);
  await page.screenshot({ path: out, type: 'png', timeout: 240000 });
  const stats = await page.evaluate(() => ({ ...window.game.stats(), player: window.game.player(), state: window.game.state() }));
  return stats;
}

// ── concurrency gate: at most MAX_SLOTS renders at once (SwiftShader is CPU-heavy) ──
const MAX_SLOTS = Number(process.env.RENDER_SLOTS || 2);
const lockDir = path.join(root, 'renders/.locks'); fs.mkdirSync(lockDir, { recursive: true });
let slot = null;
async function acquire() {
  const t0 = Date.now();
  while (true) {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const p = path.join(lockDir, 'slot' + i);
      try { const st = fs.statSync(p); if (Date.now() - st.mtimeMs > 6 * 60 * 1000) fs.rmSync(p, { recursive: true, force: true }); } catch {}
      try { fs.mkdirSync(p); slot = p; return; } catch {}
    }
    if (Date.now() - t0 > 15 * 60 * 1000) throw new Error('render slot wait timed out');
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
  }
}
function release() { if (slot) { try { fs.rmSync(slot, { recursive: true, force: true }); } catch {} slot = null; } }
process.on('exit', release); process.on('SIGINT', () => { release(); process.exit(1); }); process.on('SIGTERM', () => { release(); process.exit(1); });
await acquire();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 300000 });

let results = [];
try {
if (args.all) {
  const outdir = args.outdir || 'renders/tour'; fs.mkdirSync(path.join(root, outdir), { recursive: true });
  for (const [name, v] of Object.entries(views)) {
    if (args.filter && !name.includes(args.filter)) continue;
    const out = path.join(root, outdir, name + '.png');
    const stats = await shoot(page, { name, ...v }, out); results.push({ name, out, ...stats }); console.log(name, '→', out, `calls=${stats.calls} tris=${stats.triangles}`);
  }
} else {
  const v = parseView(); const out = path.resolve(args.out || `renders/${v.name}.png`); fs.mkdirSync(path.dirname(out), { recursive: true });
  const stats = await shoot(page, v, out); results.push({ name: v.name, out, ...stats }); console.log(v.name, '→', out, JSON.stringify(stats));
}
if (errors.length) { console.log('CONSOLE ERRORS/WARNINGS:'); for (const e of [...new Set(errors)].slice(0, 20)) console.log('  ', e); }
} catch (err) { console.error('RENDER FAILED:', err.message); process.exitCode = 1; } finally { await browser.close().catch(() => {}); release(); }
