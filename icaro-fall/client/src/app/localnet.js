// Modo offline (sem servidor): roda a sala (server/room.js) dentro do navegador e expõe a mesma
// interface de createNet(). Usado no build de página única (demonstração solo contra bots).
import { Room } from '../../../server/room.js';
import { TICK } from '../../../shared/constants.js';

export function createLocalNet() {
  const handlers = new Map();
  let room = null, id = null, timer = 0;
  const now = () => performance.now();

  function emit(type, data) {
    const list = handlers.get(type);
    if (!list) return;
    for (const fn of list.slice()) {
      try { fn(data); } catch (err) { console.error(`[localnet] erro no handler de '${type}'`, err); }
    }
  }
  // entrega assíncrona, como numa rede de verdade (evita reentrância) — clona para isolar os dois lados
  const deliver = (msg) => { const m = JSON.parse(JSON.stringify(msg)); setTimeout(() => emit(m.t, m), 0); };

  const net = {
    url: 'local',
    status: 'idle',
    offset: 0, rtt: 0, synced: true, local: true,
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
      return () => { const a = handlers.get(type); const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
    },
    send(msg) {
      if (!room || msg.t === 'ping') return !!room;
      const m = JSON.parse(JSON.stringify(msg));
      setTimeout(() => room && room.handle(id, m, now()), 0);
      return true;
    },
    serverNow: now,
    connect() {
      if (room) return;
      room = new Room({});
      net.status = 'open';
      setTimeout(() => {
        emit('open');
        id = room.connect(deliver, now());
        timer = setInterval(() => room.update(now()), TICK * 1000);
      }, 0);
    },
    retry() { net.connect(); },
    close() { clearInterval(timer); room = null; net.status = 'closed'; },
  };
  return net;
}
