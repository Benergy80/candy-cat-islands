// Measure the candyCreatures system's own draw-call / triangle cost by toggling
// its group off and diffing renderer.info.
import { chromium } from 'playwright';
const PORT = 8787;
const views = [
  { name: 'meadow-day', pos: [-113, -36], time: 12 },
  { name: 'forest-day', pos: [-198, -18], time: 14 },
  { name: 'river-day', pos: [-124, 28], time: 13 },
  { name: 'pier-dusk', pos: [-50, 26], time: 19.5 },
  { name: 'forest-night', pos: [-205, -28], time: 22.5 },
  { name: 'village-night', pos: [-140, 40], time: 23 },
];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 180000 });

const rows = await page.evaluate(async (views) => {
  const g = window.game;
  const grp = g.ctx.systems.candyCreatures.group;
  const out = [];
  for (const v of views) {
    g.setTime(v.time); g.teleport(v.pos[0], v.pos[1]); g.setView(null);
    g.step(60, 1 / 30);
    const on = { ...g.stats() };
    const forced = grp.visible;
    grp.visible = false;
    g.ctx.renderer.render(g.ctx.scene, g.ctx.camera);
    const off = { calls: g.ctx.renderer.info.render.calls, triangles: g.ctx.renderer.info.render.triangles };
    grp.visible = forced;
    g.ctx.renderer.render(g.ctx.scene, g.ctx.camera);
    const visible = grp.children.filter((c) => c.visible).map((c) => c.name);
    out.push({ name: v.name, total: on.calls, mine: on.calls - off.calls, tris: on.triangles - off.triangles, totalTris: on.triangles, visible });
  }
  return out;
}, views);
for (const r of rows) console.log(r.name.padEnd(15), 'creature calls', String(r.mine).padStart(3), ' tris', String(r.tris).padStart(7), ' | scene', r.total, r.totalTris, '\n   ', r.visible.join(', '));
await browser.close();
