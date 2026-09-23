// Keyboard/mouse input state. Systems read ctx.input; nobody else adds listeners for movement keys.
// Input contract v3 (docs/CAMERA_SPEC.md §6.2):
//   keys · down(code) · pressed · wheel     keyboard and wheel, unchanged
//   pointer.down        the LEFT button (0) is held: "use the item" (weapons.js)
//   pointer.orbit       the middle (1) or right (2) button is held: camera orbit only, never the item
//   pointer.button      the last e.button seen on a press or release
//   pointer.dragDX/DY   px dragged this frame with ANY button held (camera orbit)
//   pointer.mdx/mdy     px the mouse moved this frame with NO button held (the camera's V look)
//   axis() · virtual    movement; both read zero while moveLock > 0
//   axisRaw() · virtualRaw   the same, ignoring moveLock (the camera's look pan reads these);
//                       axisRaw(out) fills `out` instead of allocating
//   moveLock            frames of "the visitor stands still"; endFrame() counts it down, so
//                       whoever wants it held (the camera, while looking) sets it every frame
// touch.js writes virtual.x/.y, pointer.down/.orbit and dragDX/dragDY directly; all of that still works.
const BIT = [1, 4, 2, 8, 16];     // e.button → its bit in e.buttons (left, middle, right, back, forward)

export function createInput(canvas) {
  const keys = new Set();
  const stick = { x: 0, y: 0 };   // the one real virtual stick (debug.walk, touch.js)
  // What `virtual` hands out while movement is locked: it reads zero, and a write
  // (touch.js sets .x/.y every frame, before the player reads them) lands on the
  // real stick, so virtualRaw keeps seeing the thumb. Not frozen: writing to a
  // frozen object throws in a strict-mode module.
  const LOCKED = {
    get x() { return 0; }, set x(v) { stick.x = v; },
    get y() { return 0; }, set y(v) { stick.y = v; },
  };
  const setStick = (v) => { stick.x = Number(v?.x) || 0; stick.y = Number(v?.y) || 0; };
  // movement axis from WASD/arrows (x right, y forward); axisRaw(out) fills `out` instead of
  // allocating (the camera reads it every frame)
  const axisRaw = (out) => {
    let x = 0, y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    const l = Math.hypot(x, y) || 1, active = x !== 0 || y !== 0;
    if (out && typeof out === 'object') { out.x = x / l; out.y = y / l; out.active = active; return out; }
    return { x: x / l, y: y / l, active };
  };
  const input = {
    keys,
    down: (k) => keys.has(k),
    pressed: new Set(),         // keys pressed this frame (cleared by main each frame)
    wheel: 0,                    // accumulated wheel delta this frame
    pointer: { x: 0, y: 0, down: false, dragDX: 0, dragDY: 0, orbit: false, button: -1, mdx: 0, mdy: 0 },
    moveLock: 0,
    axis() { return input.moveLock > 0 ? { x: 0, y: 0, active: false } : axisRaw(); },
    axisRaw,
    // programmatic control (screenshot harness, tests, touch.js): assigning an
    // object copies its x/y into the stick
    get virtual() { return input.moveLock > 0 ? LOCKED : stick; },
    set virtual(v) { setStick(v); },
    get virtualRaw() { return stick; },
    set virtualRaw(v) { setStick(v); },
  };
  const P = input.pointer;
  let dragging = false, lx = 0, ly = 0;   // a press that began on the canvas is being tracked
  let hover = false;                       // P.x/P.y is a real hover position (the mdx/mdy baseline)
  let menuGuard = false;                   // a right press began on the canvas: eat its context menu wherever it ends
  const releaseAll = () => { P.down = false; P.orbit = false; dragging = false; menuGuard = false; };
  const press = (e) => {
    P.button = e.button;
    if (e.button === 0) P.down = true;
    else if (e.button === 1 || e.button === 2) { P.orbit = true; if (e.button === 2) menuGuard = true; }
    dragging = true; lx = e.clientX; ly = e.clientY;
  };
  // Per-button release: letting go of a right-drag while the left button is held
  // must not read as a left click (weapons.js fires the item on down → up).
  const lift = (e) => {
    P.button = e.button;
    if (e.button === 0) P.down = false;
    else if (e.button === 1 || e.button === 2) P.orbit = false;
    if (!P.down && !P.orbit) dragging = false;
    if (e.button === 2 && menuGuard) setTimeout(() => { menuGuard = false; }, 0);
  };

  window.addEventListener('keydown', (e) => { if (!keys.has(e.code)) input.pressed.add(e.code); keys.add(e.code); if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault(); });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); releaseAll(); hover = false; });
  canvas.addEventListener('wheel', (e) => { input.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('pointerdown', press);
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', releaseAll);
  window.addEventListener('pointermove', (e) => {
    // A second button pressed or released while another is held arrives as a
    // pointermove with e.button set (Pointer Events "chorded buttons"), never as
    // pointerdown/up. Only a real mouse carries a trustworthy e.buttons, so only
    // trusted mouse moves are reconciled; synthetic test events use down/up.
    if (e.isTrusted && e.pointerType === 'mouse') {
      const bit = e.button >= 0 ? BIT[e.button] || 0 : 0;
      if (bit) { if (!(e.buttons & bit)) lift(e); else if (e.target === canvas) press(e); }
      if (P.down && !(e.buttons & 1)) P.down = false;
      if (P.orbit && !(e.buttons & 6)) P.orbit = false;
      if (!e.buttons) dragging = false;
    }
    if (dragging) { P.dragDX += e.clientX - lx; P.dragDY += e.clientY - ly; lx = e.clientX; ly = e.clientY; hover = false; }
    else if (!e.buttons) { if (hover) { P.mdx += e.clientX - P.x; P.mdy += e.clientY - P.y; } hover = true; }
    else hover = false;           // a finger, or a button pressed off the canvas
    P.x = e.clientX; P.y = e.clientY;
  });
  // the pointer left the window: the next hover must not count the jump back in
  window.addEventListener('pointerout', (e) => { if (!e.relatedTarget) hover = false; });
  // right and middle belong to the camera: no context menu, no middle-button autoscroll
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('contextmenu', (e) => { if (menuGuard) e.preventDefault(); });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('auxclick', (e) => e.preventDefault());
  input.endFrame = () => {
    input.pressed.clear(); input.wheel = 0;
    P.dragDX = 0; P.dragDY = 0; P.mdx = 0; P.mdy = 0;
    if (input.moveLock > 0) input.moveLock = Math.max(0, input.moveLock - 1);
  };
  return input;
}
