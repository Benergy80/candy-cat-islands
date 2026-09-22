// Diagnose the exact fx_lantern_moths view + A/B the candy village day frame
// with the particle meshes hidden, to attribute what is actually on screen.
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const out = path.join(root, 'renders/fx'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.setDefaultTimeout(300000);
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto('http://127.0.0.1:8787/?shot=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 300000 });

// ── 1. exactly what render.mjs does for fx_lantern_moths ────────────────────
const diag = await page.evaluate(() => {
  const g = window.game, ctx = g.ctx;
  const P = ctx.systems.particles, amb = P.ambient;
  // count emit/fire calls per effect
  const counts = {};
  for (const f of amb.effects) {
    counts[f.id] = 0;
    if (f.emit) { const o = f.emit; f.emit = (a, b) => { counts[f.id]++; return o(a, b); }; }
    if (f.fire) { const o = f.fire; f.fire = (a, b) => { counts[f.id]++; return o(a, b); }; }
  }
  // ---- replicate shoot() for { free:[122,1], az:-0.92, el:0.5, dist:44, time:22, frames:180 }
  g.setTime(22);
  const y = g.world.height(122, 1) + 2;
  g.setView({ target: [122, y, 1], azimuth: -0.92, elevation: 0.5, distance: 44 });
  g.step(180, 1 / 30);

  const cam = ctx.camera; cam.updateMatrixWorld();
  const THREE = ctx.THREE, v = new THREE.Vector3();
  const SH = Object.fromEntries(Object.entries(P.SHAPES).map(([k, n]) => [n, k]));
  const meshes = []; ctx.scene.traverse((o) => { if (o.name && o.name.startsWith('particles:')) meshes.push(o); });
  const onscreen = [];
  let live = 0;
  for (const m of meshes) {
    const n = m.geometry.instanceCount;
    const ip = m.geometry.getAttribute('iPos').array, ia = m.geometry.getAttribute('iAttr').array;
    live += n;
    for (let i = 0; i < n; i++) {
      v.set(ip[i * 3], ip[i * 3 + 1], ip[i * 3 + 2]);
      const d = cam.position.distanceTo(v);
      v.project(cam);
      if (v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1 && v.z < 1) {
        const size = ia[i * 4], alpha = ia[i * 4 + 2];
        onscreen.push({
          shape: SH[Math.round(ia[i * 4 + 3]) % 16], px: +(size / (2 * d * Math.tan(cam.fov * Math.PI / 360)) * 1000).toFixed(0),
          a: +alpha.toFixed(2), sx: Math.round((v.x * 0.5 + 0.5) * 1600), sy: Math.round((1 - (v.y * 0.5 + 0.5)) * 1000),
          add: m.name.includes('additive'),
        });
      }
    }
  }
  return {
    state: { time: ctx.state.time, daylight: ctx.state.daylight, island: ctx.state.island, isFree: !!ctx.systems.camera.isFree() },
    player: { x: +ctx.systems.player.position.x.toFixed(1), z: +ctx.systems.player.position.z.toFixed(1) },
    obs: { x: +amb.obs.x.toFixed(1), z: +amb.obs.z.toFixed(1) },
    fog: { near: ctx.scene.fog.near, far: ctx.scene.fog.far },
    camPos: { x: +cam.position.x.toFixed(1), y: +cam.position.y.toFixed(1), z: +cam.position.z.toFixed(1) },
    stats: P.stats(), live, emits: counts,
    lanterns: amb.lanterns.map((n) => +n.toFixed(1)),
    onscreenCount: onscreen.length,
    onscreen: onscreen.slice(0, 40),
  };
});
console.log('=== fx_lantern_moths (exact view) ===');
console.log(JSON.stringify(diag, null, 1).slice(0, 4000));

// ── 2. candy_village day A/B with the particle meshes hidden ────────────────
for (const hide of [false, true]) {
  await page.evaluate((hide) => {
    const g = window.game, ctx = g.ctx;
    g.setTime(11); g.setView(null); g.teleport(-140, 40); g.step(60, 1 / 30);
    for (const k of ['normal', 'additive']) {
      const m = ctx.systems.particles.pools[k].mesh;
      m.userData._forceHide = hide;
      m.visible = hide ? false : m.geometry.instanceCount > 0;
    }
    ctx.renderer.render(ctx.scene, ctx.camera);
  }, hide);
  await page.screenshot({ path: path.join(out, hide ? 'ab_village_noparticles.png' : 'ab_village_particles.png'), type: 'png' });
}
console.log('A/B written: renders/fx/ab_village_particles.png, ab_village_noparticles.png');
console.log('errors:', errs.slice(0, 8));
await browser.close();
