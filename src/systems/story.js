// Story flags + simple quest state shared across islands. Other systems read/write flags.
//   ctx.systems.story.set('arrived_cat_island', true); story.get('x'); story.once('x', fn)
export function create(ctx) {
  const flags = {};
  const api = {
    flags,
    set(k, v = true) { const was = flags[k]; flags[k] = v; if (was !== v) ctx.events.emit('story:' + k, v); return v; },
    get(k) { return flags[k]; },
    once(k, fn) { if (flags[k]) { fn(flags[k]); return; } const off = ctx.events.on('story:' + k, (v) => { off(); fn(v); }); },
    update(dt, ctx) {},
  };
  return api;
}
