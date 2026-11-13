// Sala de jogo (uma única sala global na PoC): lobby, rodadas, bots, qualificação e eliminação.
//
// A sala não conhece sockets nem relógio: recebe `send(msg)` por cliente e o instante `now` (ms) em
// cada chamada. Assim a lógica de partida roda igual no servidor real (server/app.js, Date.now())
// e nos testes (relógio virtual), como pede o RNF-11.
//
//   const room = new Room({ totalPlayers, timeLimit, introMs, roundEndMs, gameEndMs, seed, maps });
//   const id = room.connect(send, now);     // -> 'welcome'
//   room.handle(id, msg, now);              // mensagens do cliente (ver shared/protocol.js)
//   room.disconnect(id, now);
//   room.update(now);                       // ~60 Hz: simula bots, aplica regras, envia snapshots
import { TICK, NET_HZ, MAX_PLAYERS, COUNTDOWN_S, STATES, CHARACTERS, FLAG } from '../shared/constants.js';
import { createBody, createInput, placeBody, stepBody } from '../shared/physics.js';
import { MAPS } from '../shared/maps/index.js';
import { createBot, botThink } from '../shared/bot.js';
import { makeRng } from '../shared/rng.js';

const BOT_NAMES = [
  'Zé Tobogã', 'Dona Marola', 'Tia Onda', 'Chico Bolha', 'Mergulhão', 'Capivara Jr.', 'Vovó Turbo',
  'Paçoca', 'Cuscuz', 'Jabuti Veloz', 'Maria Jato', 'Tatu Bola', 'Pé de Pato', 'Sardinha',
  'Brigadeiro', 'Pamonha', 'Farofa', 'Tapioca', 'Caju', 'Espirro',
];

const SNAP_MS = 1000 / NET_HZ;
const MAX_CATCHUP = 120; // passos de simulação por update (acima disso o relógio dos bots é reajustado)
const ELIM_LINGER = 1.5; // s em que um eliminado ainda aparece no snap (para o cliente mostrar a queda)

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

function sanitizeName(name) {
  const s = [...String(name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim()].slice(0, 16).join('').trim();
  return s || 'Jogador';
}

const info = (p) => ({ id: p.id, name: p.name, char: p.char, color: p.color, bot: p.bot });

export class Room {
  constructor(opts = {}) {
    this.cfg = {
      totalPlayers: Math.min(Math.max(1, opts.totalPlayers ?? MAX_PLAYERS), MAX_PLAYERS), // humanos + bots
      timeLimit: opts.timeLimit ?? null, // s; sobrescreve map.timeLimit (testes)
      introMs: opts.introMs ?? 1500 + COUNTDOWN_S * 1000, // apresentação do mapa + contagem 3-2-1
      roundEndMs: opts.roundEndMs ?? 7000,
      gameEndMs: opts.gameEndMs ?? 12000,
      maps: opts.maps ?? MAPS,
    };
    this.rng = makeRng(opts.seed ?? (Date.now() & 0x7fffffff));
    this.clients = new Map(); // id -> { id, send, joined, name, char, color, bot:false }
    this.nextId = 1;
    this.phase = 'lobby'; // 'lobby' | 'round' | 'roundEnd' | 'gameEnd'
    this.match = null; // { index, parts, humanIds }
    this.round = null; // estado da rodada em andamento
    this.deadline = 0; // fim da pausa (roundEnd / gameEnd)
  }

  // ── conexões ────────────────────────────────────────────────────────────────

  connect(send, now) {
    const c = { id: this.nextId++, send, joined: false, name: '', char: CHARACTERS[0], color: 0, bot: false };
    this.clients.set(c.id, c);
    send({ t: 'welcome', id: c.id, now });
    return c.id;
  }

  disconnect(id, now) {
    const c = this.clients.get(id);
    if (!c) return;
    this.clients.delete(id);
    if (!c.joined) return;
    if (!this.match) { this.sendLobby(); return; }
    // desconexão durante a partida => eliminado (se ainda estava na disputa)
    const e = this.round && this.round.parts.find((q) => q.id === id);
    if (e) {
      e.client = null;
      if (this.phase === 'round' && e.status === null) this.eliminate(e, now);
    }
    // sem nenhum humano da partida conectado: encerra e volta ao lobby
    if (this.match && ![...this.match.humanIds].some((h) => this.clients.has(h))) this.toLobby();
    else this.sendLobby();
  }

  /** Clientes que já entraram (join). */
  joined() {
    return [...this.clients.values()].filter((c) => c.joined);
  }

  broadcast(msg) {
    for (const c of this.clients.values()) if (c.joined) c.send(msg);
  }

  /** Estado do lobby. Durante uma partida vai só para quem está aguardando (não tira ninguém do jogo). */
  sendLobby(only) {
    const msg = { t: 'lobby', players: this.joined().map(info) };
    if (only) { only.send(msg); return; }
    for (const c of this.clients.values()) {
      if (c.joined && !(this.match && this.match.humanIds.has(c.id))) c.send(msg);
    }
  }

  // ── mensagens do cliente ────────────────────────────────────────────────────

  handle(id, msg, now) {
    const c = this.clients.get(id);
    if (!c || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'ping': c.send({ t: 'pong', c: msg.c, now }); break;
      case 'join': this.onJoin(c, msg); break;
      case 'start': this.onStart(c, now); break;
      case 's': this.onState(c, msg, now); break;
      case 'pop': this.onPop(c, msg); break;
      default: break;
    }
  }

  onJoin(c, msg) {
    if (!c.joined) {
      const used = new Set(this.joined().map((q) => q.color));
      if (used.size >= MAX_PLAYERS) { c.send({ t: 'error', msg: 'Sala cheia' }); return; }
      let color = 0;
      while (used.has(color)) color++; // menor índice livre
      c.color = color;
      c.joined = true;
    }
    c.name = sanitizeName(msg.name);
    c.char = CHARACTERS.includes(msg.char) ? msg.char : CHARACTERS[0];
    if (this.match && !this.match.humanIds.has(c.id)) {
      // partida em andamento: aguarda no lobby assistindo e entra na próxima
      this.sendLobby();
      if (this.round) c.send(this.round.msg);
    } else if (!this.match) this.sendLobby();
  }

  onStart(c, now) {
    if (!c.joined) return;
    if (this.phase !== 'lobby') { c.send({ t: 'error', msg: 'Partida em andamento' }); return; }
    this.startMatch(now);
  }

  /** Estado reportado por um humano: atualiza o corpo-espelho e aplica as regras da rodada. */
  onState(c, msg, now) {
    const R = this.round;
    if (!R || (this.phase !== 'round' && this.phase !== 'roundEnd')) return;
    const e = R.byId.get(c.id);
    if (!e || e.bot || e.status === 'eliminated') return;
    const p = msg.p;
    if (!Array.isArray(p) || p.length < 7) return;
    for (let i = 0; i < 7; i++) if (!Number.isFinite(p[i]) || Math.abs(p[i]) > 1e5) return;
    const st = Number.isInteger(msg.st) && msg.st >= 0 && msg.st < STATES.length ? msg.st : 1;
    const t = (now - R.startAt) / 1000;
    if (t < 0) return; // contagem regressiva: todos parados na largada
    const b = e.body;
    b.x = p[0]; b.y = p[1]; b.z = p[2]; b.vx = p[3]; b.vy = p[4]; b.vz = p[5]; b.yaw = p[6];
    b.state = STATES[st]; b.grounded = st === 0 || st === 3;
    e.flags = msg.f & FLAG.STUN ? FLAG.STUN : 0;
    syncMirror(R.map, b);
    if (this.phase !== 'round' || e.status !== null) return;
    if (R.map.mode === 'race') { if (R.map.finished(b)) this.qualify(e, now); }
    else if (b.y < R.map.killY) this.eliminate(e, now);
  }

  onPop(c, msg) {
    const R = this.round;
    if (!R || this.phase !== 'round' || !R.map.buoys) return;
    const e = R.byId.get(c.id);
    if (!e || e.status === 'eliminated') return;
    if (!Number.isInteger(msg.id) || !R.map.buoys.some((q) => q.id === msg.id) || R.popped.has(msg.id)) return;
    R.popped.add(msg.id);
    this.broadcast({ t: 'pop', id: msg.id, by: c.id });
  }

  // ── partida ─────────────────────────────────────────────────────────────────

  startMatch(now) {
    const humans = this.joined().slice(0, MAX_PLAYERS);
    const parts = humans.map((c) => this.makeEntry(c, c));
    // completa com bots: nomes sem repetir, personagem aleatório, cores livres
    const used = new Set(humans.map((c) => c.color));
    const names = BOT_NAMES.filter((n) => !humans.some((c) => c.name === n));
    for (let i = names.length - 1; i > 0; i--) { // embaralha (Fisher-Yates)
      const j = Math.floor(this.rng() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    let color = 0;
    while (parts.length < this.cfg.totalPlayers) {
      while (used.has(color)) color++;
      used.add(color);
      const bot = {
        id: this.nextId++, name: names[parts.length % names.length], bot: true, color,
        char: CHARACTERS[Math.floor(this.rng() * CHARACTERS.length)],
      };
      const e = this.makeEntry(bot, null);
      e.brain = createBot(Math.floor(this.rng() * 0x7fffffff));
      parts.push(e);
    }
    this.match = { index: 0, parts, humanIds: new Set(humans.map((c) => c.id)) };
    this.startRound(now);
  }

  makeEntry(p, client) {
    return {
      id: p.id, name: p.name, char: p.char, color: p.color, bot: !!p.bot, client,
      brain: null, body: createBody(), input: createInput(), world: null,
      status: null, place: 0, elimT: 0, flags: 0, spawn: null,
    };
  }

  startRound(now) {
    const { index, parts } = this.match;
    const maps = this.cfg.maps, map = maps[index], n = parts.length;
    const final = index >= maps.length - 1;
    const R = this.round = {
      index, map, final, parts, n,
      cap: capFor(map, n), // mesma regra de qualifyCap(), mas respeitando cfg.maps
      timeLimit: this.cfg.timeLimit ?? map.timeLimit,
      startAt: now + this.cfg.introMs,
      simT: 0, // tempo de rodada já simulado para os bots
      popped: new Set(), // boias estouradas (compartilhado por todos os bots; humanos avisam via 'pop')
      qualified: 0, eliminated: 0,
      byId: new Map(parts.map((e) => [e.id, e])),
      lastSnap: -Infinity, msg: null,
    };
    parts.forEach((e, i) => {
      e.status = null; e.place = 0; e.elimT = 0; e.flags = 0;
      e.spawn = map.spawn(i, n);
      e.body = createBody();
      placeBody(e.body, e.spawn);
      e.body.state = 'ground'; e.body.grounded = true; // já de pé na largada durante a contagem
      syncMirror(map, e.body);
      e.input = createInput();
      e.world = { t: 0, popped: R.popped, events: [] };
    });
    R.msg = {
      t: 'round', round: index, mapId: map.id, cap: R.cap, timeLimit: R.timeLimit, startAt: R.startAt,
      players: parts.map((e) => ({ ...info(e), spawn: { x: r2(e.spawn.x), y: r2(e.spawn.y), z: r2(e.spawn.z), yaw: r3(e.spawn.yaw) } })),
    };
    this.phase = 'round';
    this.broadcast(R.msg);
  }

  /** Avança a sala até `now`. */
  update(now) {
    if (this.phase === 'lobby') return;
    if (this.phase === 'gameEnd') { if (now >= this.deadline) this.toLobby(); return; }
    const R = this.round;
    const t = (now - R.startAt) / 1000;
    if (t >= 0) {
      if (this.phase === 'round') this.checkSurvivors(now);
      // bots: passo fixo com acumulador. Na pausa de fim de rodada os de corrida continuam "assentando"
      // (sem IA); na arena ficam congelados, para um qualificado não afundar junto com a plataforma.
      let steps = 0;
      while (R.simT + TICK <= t && (this.phase === 'round' || (this.phase === 'roundEnd' && R.map.mode === 'race'))) {
        if (++steps > MAX_CATCHUP) { R.simT = t; break; }
        this.stepBots(now);
        R.simT += TICK;
      }
      if (this.phase === 'round' && t >= R.timeLimit) this.endRound(now);
    }
    if (this.phase !== 'round' && this.phase !== 'roundEnd') return; // a rodada pode ter acabado acima
    if (now - R.lastSnap >= SNAP_MS - 1) { R.lastSnap = now; this.sendSnap(t); }
    if (this.phase === 'roundEnd' && now >= this.deadline) this.afterRound(now);
  }

  stepBots(now) {
    const R = this.round, map = R.map;
    for (const e of R.parts) {
      if (!e.bot || e.status === 'eliminated') continue;
      const b = e.body, w = e.world, inp = e.input;
      w.t = R.simT; w.events.length = 0;
      if (e.status === null && this.phase === 'round') botThink(e.brain, b, map, w, inp, TICK);
      else { inp.mx = inp.mz = 0; inp.jump = inp.dive = false; } // já qualificado: para e comemora
      stepBody(b, inp, map, w, TICK);
      for (const ev of w.events) if (ev.type === 'pop') this.broadcast({ t: 'pop', id: ev.id, by: e.id });
      if (b.fell) {
        if (map.mode === 'race') map.respawn(b);
        else if (e.status === null) this.eliminate(e, now);
      }
      if (this.phase === 'round' && e.status === null && map.mode === 'race' && map.finished(b)) this.qualify(e, now);
    }
  }

  // ── regras de resultado (ver shared/protocol.js) ────────────────────────────

  active() {
    return this.round.parts.filter((e) => e.status === null);
  }

  setStatus(e, status, place) {
    e.status = status; e.place = place;
    e.elimT = this.round.simT;
    this.broadcast({ t: 'status', id: e.id, status, place });
  }

  /** Corrida: cruzou a chegada. Colocação = ordem de chegada; a rodada acaba quando as vagas enchem. */
  qualify(e, now) {
    const R = this.round;
    this.setStatus(e, 'qualified', ++R.qualified);
    if (R.qualified >= R.cap) this.endRound(now);
  }

  /** Eliminação durante a rodada (queda na arena, desconexão): ocupa a pior colocação ainda livre,
   *  então quem cai por último fica melhor colocado. */
  eliminate(e, now) {
    const R = this.round;
    this.setStatus(e, 'eliminated', R.n - R.eliminated++);
    if (R.map.mode === 'survival') this.checkSurvivors(now);
    else if (this.active().length === 0) this.endRound(now);
  }

  /** Sobrevivência: só acaba antes do tempo quando vivos <= cap (map.minAlive). As eliminações são
   *  processadas uma a uma, então se todos caírem juntos os últimos registrados ficam vivos até completar `cap`. */
  checkSurvivors(now) {
    const R = this.round;
    if (this.phase === 'round' && R.map.mode === 'survival' && this.active().length <= R.cap) this.endRound(now);
  }

  endRound(now) {
    if (this.phase !== 'round') return;
    const R = this.round, map = R.map;
    this.phase = 'roundEnd'; // antes dos setStatus: impede reentrada
    const rest = this.active();
    let place = R.qualified + 1;
    if (map.mode === 'survival' && !R.final) {
      // sobrevivência: todos os que ficaram de pé se qualificam (sem corte fixo)
      rest.forEach((e) => this.setStatus(e, 'qualified', place++));
      R.qualified = rest.length;
    } else {
      // corrida: quem não chegou está eliminado, em ordem de progresso; se ninguém chegou até o tempo
      // acabar, o de maior progresso leva a vaga (mantém a partida viva).
      // final (último de pé): se o tempo acabar com mais de um vivo, vence o maior progresso (mais perto
      // do centro) e os demais ficam eliminados em ordem de progresso.
      rest.sort((a, b) => map.progress(b.body) - map.progress(a.body));
      rest.forEach((e, i) => {
        const win = R.qualified === 0 && i === 0;
        this.setStatus(e, win ? 'qualified' : 'eliminated', place++);
      });
      if (R.qualified === 0 && rest.length) R.qualified = 1;
    }
    R.results = [...R.parts].sort((a, b) => a.place - b.place)
      .map((e) => ({ id: e.id, name: e.name, status: e.status, place: e.place }));
    this.deadline = now + this.cfg.roundEndMs;
    this.broadcast({ t: 'roundEnd', round: R.index, results: R.results, final: R.final, nextIn: this.cfg.roundEndMs });
  }

  afterRound(now) {
    const R = this.round;
    const next = R.parts.filter((e) => e.status === 'qualified').sort((a, b) => a.place - b.place);
    if (!next.length) { this.toLobby(); return; }
    if (R.final) {
      const podium = [...R.parts].sort((a, b) => a.place - b.place).slice(0, 3)
        .map((e) => ({ id: e.id, name: e.name, char: e.char, color: e.color, place: e.place }));
      this.phase = 'gameEnd';
      this.deadline = now + this.cfg.gameEndMs;
      this.broadcast({ t: 'gameEnd', winnerId: next[0].id, podium, lobbyIn: this.cfg.gameEndMs });
      return;
    }
    this.match.index++;
    this.match.parts = next;
    this.startRound(now);
  }

  /** Volta ao lobby: mantém os humanos conectados, descarta os bots. */
  toLobby() {
    this.phase = 'lobby';
    this.match = null;
    this.round = null;
    this.sendLobby();
  }

  // ── snapshots ───────────────────────────────────────────────────────────────

  sendSnap(t) {
    const R = this.round, rows = [];
    for (const e of R.parts) {
      let f = e.bot ? (e.body.stun > 0 ? FLAG.STUN : 0) : e.flags;
      if (e.status === 'qualified') f |= FLAG.QUALIFIED;
      else if (e.status === 'eliminated') {
        if (R.simT - e.elimT > ELIM_LINGER) continue; // eliminado sai do snap depois de um instante
        f |= FLAG.ELIMINATED;
      }
      const b = e.body;
      rows.push([e.id, r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz), r3(b.yaw), STATES.indexOf(b.state), f]);
    }
    this.broadcast({ t: 'snap', time: r3(t), p: rows });
  }
}

/** `cap` da rodada, pela regra do modo do mapa (ver qualifyCap em shared/maps/index.js):
 *  corrida = vagas (metade, arredondando p/ cima); sobrevivência = vivos que encerram a rodada antes do tempo. */
function capFor(map, n) {
  if (map.mode === 'survival') return Math.min(map.minAlive ?? 1, n);
  return Math.max(1, Math.ceil(n / 2));
}

/** Campos derivados que os ganchos do mapa esperam no corpo-espelho de um humano
 *  (o servidor não roda stepBody/affect neles): coordenadas de pista do tobogã. */
function syncMirror(map, b) {
  if (map.trackCoords) {
    const c = map.trackCoords(b.x, b.z);
    b.s = c.s; b.d = c.d;
  }
}
