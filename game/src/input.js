// Keyboard + mouse + pointer lock. All state is polled once per frame by the
// player controller; edge presses (B, R, 1, 2) are consumed per frame.
export function createInput(canvas) {
  const keys = new Set();
  const justPressed = new Set();
  let lookDX = 0, lookDY = 0;
  let fireHeld = false, firePressed = false;
  let locked = false;
  let lockRetry = 0;

  function onKeyDown(e) {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) {
      keys.add(e.code);
      justPressed.add(e.code);
    }
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (document.pointerLockElement === canvas) {
      lookDX += e.movementX || 0;
      lookDY += e.movementY || 0;
    }
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (document.pointerLockElement === canvas) {
      fireHeld = true;
      firePressed = true;
    }
  }
  function onMouseUp(e) {
    if (e.button === 0) fireHeld = false;
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (locked) lockRetry = 0;
  }
  function onContextMenu(e) {
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('contextmenu', onContextMenu);

  function requestLock() {
    if (document.pointerLockElement === canvas) return;
    let p = null;
    try {
      p = canvas.requestPointerLock();
    } catch {
      p = null;
    }
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // Chrome enforces a short cooldown after the user exits the lock; one
        // retry a beat later covers the common case.
        if (lockRetry < 2) {
          lockRetry++;
          setTimeout(requestLock, 350);
        }
      });
    }
  }
  function exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  return {
    get locked() { return locked; },
    get fireHeld() { return fireHeld; },
    isDown(code) { return keys.has(code); },
    pressed(code) { return justPressed.has(code); },
    consumeLook() {
      const out = { dx: lookDX, dy: lookDY };
      lookDX = 0; lookDY = 0;
      return out;
    },
    consumeFirePress() {
      const v = firePressed;
      firePressed = false;
      return v;
    },
    clearFirePress() { firePressed = false; },
    endFrame() { justPressed.clear(); },
    requestLock,
    exitLock,
  };
}
