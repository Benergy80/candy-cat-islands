// Interaction registry. Any system can register an interactable:
//   ctx.systems.interaction.register({ id, x, z, r: 2.5, label: 'Talk to Marmalade', onInteract(ctx, self) {...}, getPos?: () => ({x,z}) })
// Player presses E / Enter when within r (Space is reserved for using the held item). The nearest one shows a prompt via ui.prompt().
// Returns the entry; call entry.remove() to unregister. Moving things pass getPos.
export function create(ctx) {
  const items = new Map(); let nextId = 1; let nearest = null;
  const api = {
    items,
    register(spec) {
      const id = spec.id || `i${nextId++}`;
      const e = { r: 2.6, ...spec, id, remove: () => items.delete(id) };
      items.set(id, e); return e;
    },
    nearest: () => nearest,
    update(dt, ctx) {
      const p = ctx.systems.player?.position; if (!p) return;
      let best = null, bestD = Infinity;
      for (const e of items.values()) {
        if (e.enabled === false) continue;
        const pos = e.getPos ? e.getPos() : e; const d = Math.hypot(pos.x - p.x, pos.z - p.z);
        if (d < e.r && d < bestD) { best = e; bestD = d; }
      }
      if (best !== nearest) { nearest = best; ctx.systems.ui?.prompt(best ? (best.label || 'Interact') : null, best); }
      const inp = ctx.input;
      if (best && (inp.pressed.has('KeyE') || inp.pressed.has('Enter'))) {
        ctx.events.emit('interact', best); best.onInteract?.(ctx, best);
      }
    },
  };
  return api;
}
