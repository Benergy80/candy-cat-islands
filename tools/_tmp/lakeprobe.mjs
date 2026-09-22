// Per-mesh on-screen colour readout for any view: which meshes own which
// pixels, and what hue/sat/value they actually render at. Cheap (small
// viewport, no screenshot) so it can be used to tune colour without burning a
// render slot.
//   node tools/_tmp/lakeprobe.mjs --view candy_lake [--step 14]
import { chromium } from 'playwright';
import fs from 'node:fs';
const a = Object.fromEntries(process.argv.slice(2).map((v, i, arr) => v.startsWith('--') ? [v.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true] : []).filter(Boolean));
const views = JSON.parse(fs.readFileSync('tools/views.json', 'utf8'));
for (const f of fs.readdirSync('tools/views')) if (f.endsWith('.json')) Object.assign(views, JSON.parse(fs.readFileSync('tools/views/' + f, 'utf8')));
let v;
if (a.view) v = { name: a.view, ...views[a.view] };
else {
  v = { name: 'custom', time: Number(a.time ?? 12), frames: 40 };
  if (a.pos) v.pos = String(a.pos).split(',').map(Number);
  if (a.free) v.free = String(a.free).split(',').map(Number);
  for (const k of ['az', 'el', 'dist', 'y']) if (a[k] !== undefined) v[k] = Number(a[k]);
}
const W = Number(a.w || 800), H = Number(a.h || 500), STEP = Number(a.step || 14);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
await p.goto('http://127.0.0.1:8787/?shot=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 300000 });
const out = await p.evaluate(({ v, STEP }) => {
  const g = window.game, ctx = g.ctx, T = ctx.THREE;
  g.setTime(v.time ?? 12);
  if (v.pos) g.teleport(v.pos[0], v.pos[1]);
  if (v.az !== undefined || v.el !== undefined || v.dist !== undefined) g.setCameraParams({ ...(v.az !== undefined ? { azimuth: v.az } : {}), ...(v.el !== undefined ? { elevation: v.el } : {}), ...(v.dist !== undefined ? { distance: v.dist } : {}) });
  if (v.free) { try { g.teleport(v.free[0], v.free[1]); } catch (e) {} const y = v.y ?? (ctx.world.height(v.free[0], v.free[1]) + 2); g.setView({ target: [v.free[0], y, v.free[1]], azimuth: v.az ?? 0.78, elevation: v.el ?? 0.6, distance: v.dist ?? 120 }); }
  else g.setView(null);
  g.step(v.frames ?? 40, 1 / 30);
  const gl = ctx.renderer.getContext();
  const BW = gl.drawingBufferWidth, BH = gl.drawingBufferHeight;
  const buf = new Uint8Array(BW * BH * 4);
  gl.readPixels(0, 0, BW, BH, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const px = (ix, iy) => { const k = ((BH - 1 - iy) * BW + ix) * 4; return [buf[k], buf[k + 1], buf[k + 2]]; };
  const rc = new T.Raycaster(); rc.far = 900;
  const ndc = new T.Vector2();
  const bins = new Map();
  const map = [];
  for (let iy = 2; iy < BH - 2; iy += STEP) { const row = []; map.push(row);
  for (let ix = 2; ix < BW - 2; ix += STEP) {
    ndc.set((ix / BW) * 2 - 1, -((iy / BH) * 2 - 1));
    rc.setFromCamera(ndc, ctx.camera);
    const hits = rc.intersectObjects(ctx.scene.children, true);
    let name = 'sky/none', dist = 0;
    for (const h of hits) {
      const o = h.object;
      if (!o.visible || !o.isMesh) continue;
      let vis = true; let q = o;
      while (q) { if (!q.visible) { vis = false; break; } q = q.parent; }
      if (!vis) continue;
      name = o.name || o.parent?.name || o.type; dist = h.distance; break;
    }
    const c = px(ix, iy);
    let e = bins.get(name);
    if (!e) { e = { n: 0, r: 0, g: 0, b: 0, sat: 0, val: 0, d: 0, lum: [] }; bins.set(name, e); }
    const mx = Math.max(...c), mn = Math.min(...c);
    e.n++; e.r += c[0]; e.g += c[1]; e.b += c[2];
    e.sat += mx > 0 ? (mx - mn) / mx : 0; e.val += mx / 255; e.d += dist;
    e.lum.push(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
    row.push(name);
  } }
  const total = [...bins.values()].reduce((s, e) => s + e.n, 0);
  const rows = [...bins.entries()].map(([name, e]) => {
    e.lum.sort((x, y) => x - y);
    return {
      name, pct: +(100 * e.n / total).toFixed(1),
      rgb: [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)],
      sat: +(e.sat / e.n).toFixed(3), val: +(e.val / e.n).toFixed(3),
      lumP5: Math.round(e.lum[(e.lum.length * 0.05) | 0]), lumP95: Math.round(e.lum[(e.lum.length * 0.95) | 0]),
      dist: +(e.d / e.n).toFixed(0),
    };
  }).sort((x, y) => y.pct - x.pct);
  return { view: v.name, size: [BW, BH], rows, map };
}, { v, STEP });
console.log(out.view, out.size.join('x'));
console.log('mesh'.padEnd(26), 'pct'.padStart(6), 'rgb'.padStart(16), 'sat'.padStart(7), 'val'.padStart(7), 'lum5'.padStart(6), 'lum95'.padStart(6), 'dist'.padStart(6));
const keyOf = new Map(out.rows.slice(0, 24).map((r, i) => [r.name, '0123456789abcdefghijklmn'[i]]));
for (const r of out.rows) console.log(keyOf.get(r.name) || '.', r.name.slice(0, 26).padEnd(26), String(r.pct).padStart(6), ('[' + r.rgb.join(',') + ']').padStart(16), String(r.sat).padStart(7), String(r.val).padStart(7), String(r.lumP5).padStart(6), String(r.lumP95).padStart(6), String(r.dist).padStart(6));
console.log('\nownership map (letters above):');
for (const row of out.map) console.log(row.map((n) => keyOf.get(n) || '.').join(''));
await b.close();
