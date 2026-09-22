import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
p.on('console', m => { if (/error|Error|WebGL/i.test(m.text())) console.log('CONSOLE', m.text().slice(0, 300)); });
await p.goto('http://127.0.0.1:8787/?shot=1'); await p.waitForFunction(() => window.game?.ready, null, { timeout: 300000 });
await p.evaluate(() => { const g = window.game; g.setTime(12); g.setView({ target: [150, 2, -150], azimuth: Math.PI, elevation: 0.35, distance: 120 }); g.step(6); });
await p.screenshot({ path: 'renders/_void_a.png' });
const info = await p.evaluate(() => {
  const g = window.game; const T = g.ctx.THREE; const out = {};
  g.ctx.systems.terrain.group.traverse(o => { if (o.isMesh && /ground|sea/.test(o.name)) { const m = o.material; out[o.name] = { type: m.type, transparent: m.transparent, depthWrite: m.depthWrite, side: m.side, fog: m.fog, hasCompileErr: !!(m.__err), programErr: null }; } });
  // swap to plain materials
  g.ctx.systems.terrain.group.traverse(o => { if (o.isMesh && /ground|sea/.test(o.name)) { o.userData.__origMat = o.material; o.material = new T.MeshStandardMaterial({ color: /sea/.test(o.name) ? 0x3a9ad0 : 0x88cc66 }); } });
  g.step(3); return out;
});
console.log(JSON.stringify(info));
await p.screenshot({ path: 'renders/_void_b.png' });
await b.close();
