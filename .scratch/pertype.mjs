import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
await p.goto('http://127.0.0.1:8787/?shot=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 240000 });
console.log(await p.evaluate(() => {
  const g = window.game.ctx.systems.candyCreatures;
  return g.group.children.filter(c=>c.isMesh).map(m => {
    const geo = m.geometry;
    const tri = ((geo.index ? geo.index.count : geo.attributes.position.count)/3)|0;
    return `${m.name.padEnd(24)} n=${String(m.isInstancedMesh?m.count:1).padStart(4)}  tris/inst=${String(tri).padStart(4)}  total=${tri*(m.isInstancedMesh?m.count:1)}  shadow=${m.castShadow}`;
  }).join('\n');
}));
await b.close();
