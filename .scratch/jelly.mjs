import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,300)));
await p.goto('http://127.0.0.1:8787/?shot=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 240000 });
console.log(await p.evaluate(() => {
  const g = window.game, THREE = g.ctx.THREE;
  g.setTime(19.5); g.teleport(-50,26); g.setView(null); g.step(70, 1/30);
  const cc = g.ctx.systems.candyCreatures;
  const mesh = cc.group.children.find(c=>c.name==='cottoncandy-jellyfish');
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  const cam = g.ctx.camera;
  const lines = [`visible=${mesh.visible} cam=${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},${cam.position.z.toFixed(1)}`];
  for (let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,m); v.setFromMatrixPosition(m);
    const s = new THREE.Vector3().setFromMatrixScale(m).x;
    const n = v.clone().project(cam);
    const inFrame = Math.abs(n.x)<1 && Math.abs(n.y)<1 && n.z>-1 && n.z<1;
    lines.push(`${i} world=(${v.x.toFixed(0)},${v.y.toFixed(1)},${v.z.toFixed(0)}) s=${s.toFixed(2)} screen=(${Math.round((n.x*.5+.5)*1600)},${Math.round((-n.y*.5+.5)*1000)}) dist=${cam.position.distanceTo(v).toFixed(0)} ${inFrame?'IN':'out'}`);
  }
  return lines.join('\n');
}));
await b.close();
