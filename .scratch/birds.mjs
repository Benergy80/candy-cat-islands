import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,400)));
await p.goto('http://127.0.0.1:8787/?shot=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 240000 });
const out = await p.evaluate(() => {
  const g = window.game, THREE = g.ctx.THREE;
  g.setTime(10); g.teleport(-120,-20); g.setCameraParams({ elevation: 0.3, distance: 52 }); g.setView(null);
  g.step(70, 1/30);
  const cc = g.ctx.systems.candyCreatures;
  const rt = cc.parts.birds.route;
  const mesh = cc.group.children.find(c => c.name === 'sugar-gliders');
  const m = new THREE.Matrix4(); const v = new THREE.Vector3();
  const rows = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m); v.setFromMatrixPosition(m);
    const sc = new THREE.Vector3().setFromMatrixScale(m);
    const ndc = v.clone().project(g.ctx.camera);
    rows.push({ i, x:+v.x.toFixed(1), y:+v.y.toFixed(1), z:+v.z.toFixed(1), s:+sc.x.toFixed(2),
                sx: Math.round((ndc.x*0.5+0.5)*1600), sy: Math.round((-ndc.y*0.5+0.5)*1000), depth:+ndc.z.toFixed(3) });
  }
  return { visible: mesh.visible, route: { ...rt }, cam: { x:+g.ctx.camera.position.x.toFixed(1), y:+g.ctx.camera.position.y.toFixed(1), z:+g.ctx.camera.position.z.toFixed(1) }, rows };
});
console.log('mesh.visible', out.visible, 'cam', out.cam);
console.log('route', JSON.stringify(out.route));
for (const r of out.rows) console.log(r);
await b.close();
