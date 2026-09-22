// ─────────────────────────────────────────────────────────────────────────────
// ESCAPE — the ways back from Cat Island, plus the place they lead to.
//
// This file is deliberately THIN: it owns nothing but the shared contract and a
// tiny deterministic scheduler. Every actual route lives in ./escape/<name>.js
// and is imported defensively, so two builders can add routes in parallel and a
// missing (or broken) route never takes the system down.
//
//   route module:  export function create(ctx, api) -> { update(dt, ctx)?, ... }
//
// Shared API (ctx.systems.escape.api):
//   routes                       { name: routeObject }
//   register(name, obj)          route self-registration
//   start(route, info?)          emits 'escape:start'  { route, ... }
//   success(route, info?)        emits 'escape:success' { route, ... } + story flag
//                                'escaped_<route>'
//   transition(fn, o?)           fade to black → run fn → fade back in. Driven by
//                                update(dt), so it is deterministic under
//                                game.step() in the screenshot harness.
//   after(secs, fn)              one-shot timer on the same clock
//   lock(v)                      freeze/unfreeze player input
//   say / banner / toast         thin, null-safe UI passthroughs
//
// Events emitted here: 'escape:start', 'escape:success', 'interior:enter',
// 'interior:exit' (the last two are re-emitted for route modules that own an
// interior, e.g. the palace).
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_NAMES = ['palace', 'cave', 'catapult', 'canoe', 'flyer'];

// Top-level await: main.js already `await import`s this module, so the routes
// are all resolved before create() runs and create() can stay synchronous.
const MODULES = [];
for (const name of ROUTE_NAMES) {
  try {
    const mod = await import('./escape/' + name + '.js');
    if (mod && typeof mod.create === 'function') MODULES.push([name, mod]);
  } catch (err) {
    console.warn('[escape] route "' + name + '" not loaded:', err?.message || err);
  }
}

export function create(ctx) {
  ctx.colliders = ctx.colliders || [];
  ctx.walkables = ctx.walkables || [];

  const routes = {};
  const updaters = [];
  const timers = [];

  const ui = () => ctx.systems.ui;

  const api = {
    ctx, routes,
    /** Route modules call this so other systems can find them by name. */
    register(name, obj = {}) {
      routes[name] = obj;
      if (typeof obj.update === 'function' && !updaters.includes(obj)) updaters.push(obj);
      return obj;
    },
    /** One-shot timer on the game clock (works under game.step()). */
    after(secs, fn) { timers.push({ t: Math.max(0, secs), fn }); return fn; },
    lock(v = true) { const p = ctx.systems.player; if (p) p.locked = !!v; },
    say(text, o) { try { ui()?.say(text, o); } catch (e) { /* UI may not exist yet */ } },
    banner(a, b, c, d) { try { ui()?.banner(a, b, c, d); } catch (e) {} },
    toast(t, s, o) { try { ui()?.toast(t, s, o); } catch (e) {} },
    /** Announce an attempt to leave. */
    start(route, info = {}) { ctx.events.emit('escape:start', { route, ...info }); },
    /** Arrived back on Candyland: flag + event. */
    success(route, info = {}) {
      try { ctx.systems.story?.set('escaped_' + route); } catch (e) {}
      ctx.events.emit('escape:success', { route, ...info });
    },
    /**
     * Fade out → run fn() → fade in, keeping the player frozen throughout.
     * Timing runs off update(dt) so a screenshot run (`game.step(n)`) plays it
     * exactly like a live frame loop does.
     */
    transition(fn, o = {}) {
      const p = ctx.systems.player;
      const wasLocked = p ? !!p.locked : false;
      if (p) p.locked = true;
      try { ui()?.fade(true, o.out ?? 0.35); } catch (e) {}
      api.after(o.hold ?? 0.42, () => {
        try { fn?.(); } catch (err) { console.error('[escape] transition body failed', err); }
        try { ctx.systems.camera?.snap?.(); } catch (e) {}
        try { ui()?.fade(false, o.in ?? 0.5); } catch (e) {}
        api.after(o.unlock ?? 0.12, () => { if (p) p.locked = wasLocked; });
      });
    },
  };

  for (const [name, mod] of MODULES) {
    try {
      const r = mod.create(ctx, api);
      if (r) {
        if (!routes[name]) routes[name] = r;
        if (typeof r.update === 'function' && !updaters.includes(r)) updaters.push(r);
      }
    } catch (err) {
      console.error('[escape] route "' + name + '" failed to create', err);
    }
  }
  console.warn('[escape]', JSON.stringify({ routes: Object.keys(routes), modules: MODULES.length }));

  return {
    api, routes,
    update(dt, c) {
      for (let i = timers.length - 1; i >= 0; i--) {
        const t = timers[i];
        t.t -= dt;
        if (t.t <= 0) { timers.splice(i, 1); try { t.fn(); } catch (err) { console.error('[escape] timer failed', err); } }
      }
      for (const r of updaters) {
        try { r.update(dt, c); }
        catch (err) { if (!r.__warned) { console.error('[escape] route update error', err); r.__warned = true; } }
      }
    },
  };
}
