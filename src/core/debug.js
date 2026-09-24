// window.game — debug/automation API used by tools/render.mjs and by agents
// exploring the game. Keep this stable; add, don't rename.
export function installDebug(ctx, loop) {
  const api = {
    ready: false,
    ctx,
    setTime(hour) { ctx.state.time = ((hour % 24) + 24) % 24; ctx.state.timeFrozen = true; ctx.events.emit('time:set', ctx.state.time); },
    freezeTime(v = true) { ctx.state.timeFrozen = v; },
    /** Teleport to (x,z), nudged to the nearest spot clear of registered colliders (so views never land on a signpost). */
    teleport(x, z) {
      const cols = ctx.colliders || []; const clear = (px, pz) => !cols.some((c) => Math.hypot(px - c.x, pz - c.z) < (c.r || 0) + 0.45);
      let tx = x, tz = z;
      if (!clear(x, z)) { outer: for (let r = 0.8; r <= 6; r += 0.8) for (let a = 0; a < 12; a++) { const px = x + Math.cos(a / 12 * Math.PI * 2) * r, pz = z + Math.sin(a / 12 * Math.PI * 2) * r; if (clear(px, pz) && ctx.world.height(px, pz) > 0.3) { tx = px; tz = pz; break outer; } } }
      ctx.systems.player?.teleport(tx, tz); ctx.systems.camera?.snap();
    },
    /** Free camera for screenshots/overviews. Pass null to return to follow mode. */
    setView(v) { ctx.state.fogScale = v && v.distance > 120 ? v.distance / 60 : 1; ctx.systems.camera?.setFree(v); },
    setCameraParams(p) { ctx.systems.camera?.setParams(p); ctx.systems.camera?.snap(); },
    /** Run n fixed-dt frames (only meaningful when ?shot=1 disabled the RAF loop). */
    /** Simulation frames are cheap; only the last 2 frames are actually rendered (software GL is slow). */
    step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) loop.tick(dt, i >= n - 2); },
    /** Simulate held movement for n frames (dir = {x,y} camera-relative). */
    walk(dir, n = 30, dt = 1 / 30) { ctx.input.virtual = dir; for (let i = 0; i < n; i++) loop.tick(dt, i >= n - 1); ctx.input.virtual = { x: 0, y: 0 }; },
    press(code) { ctx.input.pressed.add(code); ctx.input.keys.add(code); loop.tick(1 / 30); ctx.input.keys.delete(code); },
    stats() { const r = ctx.renderer.info; return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs?.length ?? 0, fps: loop.fps, frameMs: loop.frameMs }; },
    /** Per-system update() cost (needs ?prof=1): {name: {ms, max, n}}; prof(true) returns and resets. */
    prof(reset = false) { const out = {}; for (const k in loop.prof) { const r = loop.prof[k]; out[k] = { ms: +r.ms.toFixed(2), avg: r.n ? +(r.ms / r.n).toFixed(3) : 0, max: +r.max.toFixed(2), n: r.n }; if (reset) { r.ms = 0; r.max = 0; r.n = 0; } } return out; },
    player() { const p = ctx.systems.player; return p ? { x: p.position.x, y: p.position.y, z: p.position.z, island: ctx.state.island } : null; },
    state() { return { time: ctx.state.time, daylight: ctx.state.daylight, isNight: ctx.state.isNight, island: ctx.state.island, ferry: ctx.state.ferry }; },
    world: ctx.world,
    log: [],
  };
  window.game = api;
  return api;
}
