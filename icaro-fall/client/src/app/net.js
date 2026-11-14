// Wrapper do WebSocket: eventos por tipo de mensagem, relógio sincronizado (ping/pong) e reconexão.
import { encode, decode, WS_PATH } from '../../../shared/protocol.js';

const PING_FAST_MS = 250; // rajada inicial para estimar o offset rápido
const PING_SLOW_MS = 2000;
const FAST_PINGS = 6;
const SAMPLES = 12;

export function defaultUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`;
}

/**
 * Eventos: 'open', 'close' ({ willRetry }), e um por tipo de mensagem do protocolo ('welcome', 'lobby', 'round', ...).
 * Relógio: serverNow() = relógio do servidor estimado (ms); usa a amostra de menor RTT entre as últimas.
 */
export function createNet(url = defaultUrl()) {
  const handlers = new Map();
  let ws = null;
  let retryTimer = 0, pingTimer = 0, attempts = 0, pingsSent = 0, closedByUser = false;
  let samples = []; // { rtt, off }

  const net = {
    url,
    status: 'idle', // 'idle' | 'connecting' | 'open' | 'closed'
    offset: 0, // serverNow - performance.now()
    rtt: 0,
    synced: false,
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
      return () => { const a = handlers.get(type); const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
    },
    send(msg) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try { ws.send(encode(msg)); return true; } catch { return false; }
    },
    serverNow() { return performance.now() + net.offset; },
    connect, retry, close,
  };

  function emit(type, data) {
    const list = handlers.get(type);
    if (!list) return;
    for (const fn of list.slice()) {
      try { fn(data); } catch (err) { console.error(`[net] erro no handler de '${type}'`, err); }
    }
  }

  function ping() {
    if (net.send({ t: 'ping', c: performance.now() })) pingsSent++;
    pingTimer = setTimeout(ping, pingsSent < FAST_PINGS ? PING_FAST_MS : PING_SLOW_MS);
  }

  function onPong(m) {
    const now = performance.now();
    const rtt = now - m.c;
    if (!(rtt >= 0) || rtt > 5000 || typeof m.now !== 'number') return;
    samples.push({ rtt, off: m.now + rtt / 2 - now });
    if (samples.length > SAMPLES) samples.shift();
    let best = samples[0];
    for (const s of samples) if (s.rtt < best.rtt) best = s;
    net.offset = best.off; net.rtt = best.rtt; net.synced = true;
  }

  function connect() {
    clearTimeout(retryTimer);
    closedByUser = false;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    net.status = 'connecting';
    let sock;
    try { sock = new WebSocket(url); } catch (err) { console.warn('[net] falha ao abrir', err); scheduleRetry(); return; }
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      attempts = 0; samples = []; pingsSent = 0; net.synced = false;
      net.status = 'open';
      emit('open');
      clearTimeout(pingTimer); ping();
    };
    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      const m = decode(ev.data);
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'pong') onPong(m);
      else if (m.t === 'welcome' && !net.synced && typeof m.now === 'number') net.offset = m.now - performance.now();
      emit(m.t, m);
    };
    sock.onerror = () => {};
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      clearTimeout(pingTimer);
      const was = net.status;
      net.status = 'closed';
      if (!closedByUser) scheduleRetry();
      emit('close', { willRetry: !closedByUser, wasOpen: was === 'open' });
    };
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    const delay = Math.min(5000, 800 * 2 ** Math.min(attempts, 3));
    attempts++;
    retryTimer = setTimeout(connect, delay);
  }

  function retry() { attempts = 0; connect(); }

  function close() {
    closedByUser = true;
    clearTimeout(retryTimer); clearTimeout(pingTimer);
    if (ws) { try { ws.close(); } catch { /* já fechado */ } }
  }

  return net;
}
