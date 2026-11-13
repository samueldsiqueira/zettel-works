// Entrada: teclado, mouse (pointer lock + arrastar), Gamepad API e toque (joystick virtual + 2 botões).
// O jogo consulta `move` (eixos relativos à câmera), consome bordas de pulo/mergulho no tick fixo
// e consome o delta de câmera a cada frame.

const MOUSE_SENS = (0.15 * Math.PI) / 180; // rad por px (design §7)
const PAD_LOOK_YAW = (140 * Math.PI) / 180; // rad/s
const PAD_LOOK_PITCH = (90 * Math.PI) / 180;
const DEADZONE = 0.2;

const isTyping = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export function createInputManager(canvas) {
  const keys = new Set();
  let jumpEdge = false, diveEdge = false;
  let lookYaw = 0, lookPitch = 0;
  let padMove = { x: 0, y: 0 };
  let touchMove = { x: 0, y: 0 };
  let padPrev = [];
  let drag = null; // { id, x, y, moved }
  const listeners = { spectate: [], help: [], click: [], device: [], lock: [] };
  const fire = (ev, ...a) => { for (const fn of listeners[ev]) fn(...a); };

  const input = {
    /** true durante a partida: captura teclas de jogo (impede rolagem/tab) e permite pointer lock */
    enabled: false,
    /** permite capturar o mouse ao clicar (desligado como espectador) */
    allowLock: false,
    device: 'kb', // último dispositivo usado: 'kb' | 'pad' | 'touch'
    lastLookAt: -1e9, // performance.now() do último movimento de câmera feito pelo jogador
    get locked() { return document.pointerLockElement === canvas; },
    /** eixos de movimento relativos à câmera: x = direita, y = frente; |v| <= 1 */
    get move() {
      let x = 0, y = 0;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      if (x || y) { const l = Math.hypot(x, y); return { x: x / l, y: y / l }; }
      if (padMove.x || padMove.y) return padMove;
      return touchMove;
    },
    /** bordas capturadas por evento desde o último consumo (não se perdem entre frames) */
    consumeEdges() { const e = { jump: jumpEdge, dive: diveEdge }; jumpEdge = diveEdge = false; return e; },
    peekEdges() { return { jump: jumpEdge, dive: diveEdge }; },
    clearEdges() { jumpEdge = diveEdge = false; },
    /** delta de câmera acumulado (rad). yaw > 0 = olhar para a direita; pitch > 0 = olhar para baixo */
    consumeLook() { const l = { yaw: lookYaw, pitch: lookPitch }; lookYaw = lookPitch = 0; return l; },
    on(ev, fn) { listeners[ev].push(fn); },
    poll, releaseLock, dispose,
  };

  function setDevice(d) {
    if (input.device !== d) { input.device = d; fire('device', d); }
  }
  function addLook(dy, dp) {
    lookYaw += dy; lookPitch += dp;
    input.lastLookAt = performance.now();
  }

  // ── Teclado ──
  function onKeyDown(e) {
    if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code;
    const gameKey = c === 'Space' || c === 'Tab' || c.startsWith('Arrow') || c.startsWith('Shift') || /^Key[WASDE]$/.test(c);
    if (!gameKey) return;
    if (!input.enabled) return;
    e.preventDefault();
    setDevice('kb');
    if (e.repeat) return;
    keys.add(c);
    if (c === 'Space') jumpEdge = true;
    else if (c === 'ShiftLeft' || c === 'ShiftRight' || c === 'KeyE') diveEdge = true;
    else if (c === 'ArrowLeft') fire('spectate', -1);
    else if (c === 'ArrowRight') fire('spectate', 1);
    else if (c === 'Tab') fire('help', true);
  }
  function onKeyUp(e) {
    keys.delete(e.code);
    if (e.code === 'Tab' && input.enabled) fire('help', false);
  }
  function onBlur() { keys.clear(); padMove = { x: 0, y: 0 }; }

  // ── Mouse / ponteiro ──
  function onPointerDown(e) {
    if (e.pointerType === 'touch') return; // toque usa os controles virtuais
    if (e.button !== 0 && e.button !== 2) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ok */ }
  }
  function onPointerMove(e) {
    if (e.pointerType === 'touch') return;
    if (input.locked) { addLook(e.movementX * MOUSE_SENS, e.movementY * MOUSE_SENS); return; }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 4) addLook(dx * MOUSE_SENS * 1.6, dy * MOUSE_SENS * 1.6);
  }
  function onPointerUp(e) {
    if (e.pointerType === 'touch' || !drag || drag.id !== e.pointerId) return;
    const wasClick = drag.moved <= 4 && e.button === 0;
    drag = null;
    if (!wasClick || input.locked) return;
    setDevice('kb');
    fire('click');
    if (input.enabled && input.allowLock && canvas.requestPointerLock) {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch { /* sem suporte */ }
    }
  }
  function onLockChange() { fire('lock', input.locked); }
  function releaseLock() { if (input.locked) document.exitPointerLock(); }
  const noMenu = (e) => e.preventDefault();

  // ── Gamepad ──
  function axis2(ax, ay) {
    const l = Math.hypot(ax, ay);
    if (l < DEADZONE) return null;
    const k = Math.min(1, (l - DEADZONE) / (1 - DEADZONE)) / l;
    return { x: ax * k, y: ay * k };
  }
  function poll(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) { padMove = { x: 0, y: 0 }; padPrev = []; return; }
    const m = axis2(pad.axes[0] || 0, pad.axes[1] || 0);
    padMove = m ? { x: m.x, y: -m.y } : { x: 0, y: 0 };
    const r = axis2(pad.axes[2] || 0, pad.axes[3] || 0);
    if (r) { addLook(r.x * PAD_LOOK_YAW * dt, r.y * PAD_LOOK_PITCH * dt); }
    const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const edge = (i) => btn(i) && !padPrev[i];
    let used = !!m || !!r;
    if (input.enabled) {
      if (edge(0)) { jumpEdge = true; used = true; }
      if (edge(1) || edge(2)) { diveEdge = true; used = true; }
      if (edge(9)) { fire('help', 'toggle'); used = true; }
      if (edge(14)) { fire('spectate', -1); used = true; }
      if (edge(15)) { fire('spectate', 1); used = true; }
    }
    for (let i = 0; i < pad.buttons.length; i++) padPrev[i] = btn(i);
    if (used) setDevice('pad');
  }

  // ── Toque: joystick virtual (metade esquerda) + arrastar câmera (metade direita) + 2 botões ──
  let touchUi = null;
  const touches = new Map(); // id -> { kind, x0, y0, x, y }
  function ensureTouchUi() {
    if (touchUi) return;
    touchUi = document.createElement('div');
    touchUi.className = 'touch-ui';
    touchUi.innerHTML =
      '<div class="t-stick"><i></i></div>' +
      '<button type="button" class="t-btn t-dive" aria-label="Mergulhar">Mergulho</button>' +
      '<button type="button" class="t-btn t-jump" aria-label="Pular">Pulo</button>';
    const css = document.createElement('style');
    css.textContent =
      '.touch-ui{position:fixed;inset:0;pointer-events:none;z-index:5}' +
      '.touch-ui[hidden]{display:none}' +
      '.t-stick{position:absolute;left:28px;bottom:84px;width:120px;height:120px;border-radius:50%;background:rgba(27,33,64,.35);border:3px solid rgba(255,255,255,.7)}' +
      '.t-stick i{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px;border-radius:50%;background:#fff;border:3px solid #1B2140}' +
      '.t-btn{position:absolute;pointer-events:auto;width:88px;height:88px;border-radius:50%;border:4px solid #1B2140;font:800 16px/1 "Baloo 2",system-ui,sans-serif;color:#1B2140;box-shadow:0 5px 0 #1B2140;touch-action:none;user-select:none;-webkit-user-select:none}' +
      '.t-jump{right:24px;bottom:84px;background:#FFD23F}.t-dive{right:124px;bottom:148px;background:#FF5FA2;width:76px;height:76px}' +
      '.t-btn:active{transform:translateY(3px);box-shadow:0 2px 0 #1B2140}';
    document.head.appendChild(css);
    document.body.appendChild(touchUi);
    touchUi.querySelector('.t-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); if (input.enabled) jumpEdge = true; });
    touchUi.querySelector('.t-dive').addEventListener('pointerdown', (e) => { e.preventDefault(); if (input.enabled) diveEdge = true; });
  }
  function updateStick() {
    if (!touchUi) return;
    const knob = touchUi.querySelector('.t-stick i');
    knob.style.transform = `translate(${touchMove.x * 34}px, ${-touchMove.y * 34}px)`;
    touchUi.hidden = !(input.enabled && input.allowLock);
  }
  function onTouchStart(e) {
    if (!input.enabled) return;
    ensureTouchUi(); setDevice('touch');
    for (const t of e.changedTouches) {
      const kind = t.clientX < window.innerWidth * 0.45 ? 'move' : 'look';
      touches.set(t.identifier, { kind, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, moved: 0 });
    }
    e.preventDefault();
    updateStick();
  }
  function onTouchMove(e) {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier);
      if (!s) continue;
      if (s.kind === 'move') {
        let dx = (t.clientX - s.x0) / 48, dy = (t.clientY - s.y0) / 48;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        touchMove = l < 0.15 ? { x: 0, y: 0 } : { x: dx, y: -dy };
      } else {
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        s.moved += Math.abs(dx) + Math.abs(dy);
        addLook(dx * MOUSE_SENS * 2, dy * MOUSE_SENS * 2);
      }
      s.x = t.clientX; s.y = t.clientY;
    }
    if (e.cancelable) e.preventDefault();
    updateStick();
  }
  function onTouchEnd(e) {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier);
      if (!s) continue;
      if (s.kind === 'move') touchMove = { x: 0, y: 0 };
      else if (s.moved < 8) fire('click');
      touches.delete(t.identifier);
    }
    updateStick();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onBlur);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('contextmenu', noMenu);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  canvas.addEventListener('touchcancel', onTouchEnd);

  input.refreshTouchUi = updateStick;

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onBlur);
    document.removeEventListener('pointerlockchange', onLockChange);
    if (touchUi) touchUi.remove();
  }

  return input;
}
