// Read-only camera probe: body visibility per view at 3 framings + mode-2 steering test.
import { chromium } from '/Users/benstagl/candy-cat-islands/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root = '/Users/benstagl/candy-cat-islands';
const views = JSON.parse(fs.readFileSync(path.join(root, 'tools/views.json'), 'utf8'));
for (const f of fs.readdirSync(path.join(root, 'tools/views'))) if (f.endsWith('.json')) { try { Object.assign(views, JSON.parse(fs.readFileSync(path.join(root, 'tools/views', f), 'utf8'))); } catch {} }
const want = ['candy_arrival','cat_arrival','cat_plaza','cat_park','cat_gym','cat_harbor','cat_lighthouse','cat_citizens_loaves','candy_lake','cat_citizens_main_noon','ferry_arrival_candy','sky_dawn_harbor','candy_cupcake_wide','candy_village','cat_main_street','cat_meow_donalds','cat_residential','candy_forest','candy_meadow','candy_river'];
const list = want.filter((n) => views[n] && views[n].pos && !views[n].free);
const lockDir = path.join(root, 'renders/.locks'); fs.mkdirSync(lockDir, { recursive: true });
let slot = null;
async function acquire() { const t0 = Date.now(); while (true) { for (let i = 0; i < 2; i++) { const p = path.join(lockDir, 'slot' + i); try { const st = fs.statSync(p); if (Date.now() - st.mtimeMs > 6*60*1000) fs.rmSync(p, { recursive: true, force: true }); } catch {} try { fs.mkdirSync(p); slot = p; return; } catch {} } if (Date.now() - t0 > 15*60*1000) throw new Error('slot timeout'); await new Promise((r) => setTimeout(r, 1500)); } }
const release = () => { if (slot) { try { fs.rmSync(slot, { recursive: true, force: true }); } catch {} slot = null; } };
process.on('exit', release);
await acquire();
const touch = setInterval(() => { try { const t = new Date(); fs.utimesSync(slot, t, t); } catch {} }, 60000);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const t0 = Date.now();
await page.goto('http://127.0.0.1:8787/?shot=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 300000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(0), 's; views', list.length);
const configs = [
  { name: 'shipped', apply: null },
  { name: 'ad_0.44_34', apply: { elevation: 0.44, distance: 34 } },
  { name: 'overhead_mode3', mode: 3 },
];
const rows = [];
for (const name of list) {
  const v = views[name];
  for (const c of configs) {
    const r = await page.evaluate(({ v, c }) => {
      const g = window.game, cam = g.ctx.systems.camera;
      cam.setMode(1);
      g.setTime(v.time ?? 12); g.teleport(v.pos[0], v.pos[1]);
      const p = {}; if (v.az !== undefined) p.azimuth = v.az; if (v.el !== undefined) p.elevation = v.el; if (v.dist !== undefined) p.distance = v.dist; if (v.fov !== undefined) p.fov = v.fov;
      // reset to shipped defaults first so configs don't leak
      cam.setParams({ elevation: 0.64, distance: 31, fov: 30, ...p });
      if (c.apply) cam.setParams(c.apply);
      if (c.mode) cam.setMode(c.mode);
      cam.snap(); g.setView(null);
      if (v.walk) g.walk({ x: v.walk.x, y: v.walk.y }, v.walk.n || 30);
      g.step(30, 1 / 30);
      const bv = cam.bodyVisibility();
      const pl = g.ctx.systems.player.position, cp = g.ctx.camera.position;
      const eff = Math.hypot(cp.x - pl.x, cp.y - pl.y - 1.15, cp.z - pl.z);
      return { vis: bv.visible / bv.total, by: bv.rays.filter((x) => !x.clear).map((x) => x.pt + ':' + x.by[0]).slice(0, 2), eff: +eff.toFixed(1), el: +cam.current.elevation.toFixed(2), occLift: +(cam.occLift ?? 0).toFixed(2), fading: cam.fading, culled: cam.culled };
    }, { v, c });
    rows.push({ view: name, cfg: c.name, ...r });
    console.log(name.padEnd(24), c.name.padEnd(15), 'vis', r.vis.toFixed(2), 'effDist', r.eff, 'lift', r.occLift, 'fading', r.fading, r.by.join(' | '));
  }
}
// mode-2 steering test: hold D (x=1) and then S (y=-1) in open ground
const m2 = await page.evaluate(() => {
  const g = window.game, cam = g.ctx.systems.camera, pl = g.ctx.systems.player;
  const out = {};
  for (const [label, dir] of [['hold_D', { x: 1, y: 0 }], ['hold_S', { x: 0, y: -1 }], ['hold_W', { x: 0, y: 1 }]]) {
    cam.setMode(1); g.teleport(-110, -45); cam.setParams({ elevation: 0.64, distance: 31, azimuth: Math.PI * 0.25 }); cam.snap();
    cam.setMode(2); g.step(10, 1 / 30);
    const s0 = { x: pl.position.x, z: pl.position.z };
    const trace = [];
    for (let i = 0; i < 12; i++) { g.walk(dir, 10); trace.push({ t: ((i + 1) / 3).toFixed(2), x: +pl.position.x.toFixed(1), z: +pl.position.z.toFixed(1), facing: +pl.facing.toFixed(2), camAz: +cam.current.azimuth.toFixed(2) }); }
    const last = trace[trace.length - 1];
    let path = 0, px = s0.x, pz = s0.z; for (const p of trace) { path += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; }
    out[label] = { net: +Math.hypot(last.x - s0.x, last.z - s0.z).toFixed(1), path: +path.toFixed(1), trace };
  }
  cam.setMode(1);
  return out;
});
for (const [k, v] of Object.entries(m2)) console.log('MODE2', k, 'path', v.path, 'net displacement', v.net, JSON.stringify(v.trace.map((p) => [p.x, p.z, p.facing, p.camAz])));
fs.writeFileSync('/Users/benstagl/candy-cat-islands/tools/camprobe.json', JSON.stringify({ rows, m2, errs }, null, 1));
const agg = {}; for (const r of rows) { (agg[r.cfg] ||= []).push(r.vis); }
for (const [k, a] of Object.entries(agg)) console.log('MEAN', k, (a.reduce((s, x) => s + x, 0) / a.length).toFixed(3), 'fully-visible', a.filter((x) => x === 1).length + '/' + a.length, 'hidden(<=0.4)', a.filter((x) => x <= 0.4).length);
if (errs.length) console.log('page errors:', errs.slice(0, 5));
clearInterval(touch); await browser.close(); release();
