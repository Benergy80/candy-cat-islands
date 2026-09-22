// Keyboard/mouse input state. Systems read ctx.input; nobody else adds listeners for movement keys.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    down: (k) => keys.has(k),
    pressed: new Set(),         // keys pressed this frame (cleared by main each frame)
    wheel: 0,                    // accumulated wheel delta this frame
    pointer: { x: 0, y: 0, down: false, dragDX: 0, dragDY: 0 },
    axis() {                     // movement axis from WASD/arrows (x right, y forward)
      let x = 0, y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l, active: x !== 0 || y !== 0 };
    },
    // programmatic control (used by the screenshot harness / tests)
    virtual: { x: 0, y: 0 },
  };
  window.addEventListener('keydown', (e) => { if (!keys.has(e.code)) input.pressed.add(e.code); keys.add(e.code); if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault(); });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('wheel', (e) => { input.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  let last = null;
  canvas.addEventListener('pointerdown', (e) => { input.pointer.down = true; last = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerup', () => { input.pointer.down = false; last = null; });
  window.addEventListener('pointermove', (e) => { input.pointer.x = e.clientX; input.pointer.y = e.clientY; if (last) { input.pointer.dragDX += e.clientX - last.x; input.pointer.dragDY += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; } });
  input.endFrame = () => { input.pressed.clear(); input.wheel = 0; input.pointer.dragDX = 0; input.pointer.dragDY = 0; };
  return input;
}
