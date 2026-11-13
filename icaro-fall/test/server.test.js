// Servidor: regras da partida com relógio virtual (Room) + integração real por WebSocket.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { Room } from '../server/room.js';
import { startServer } from '../server/app.js';
import { MAPS } from '../shared/maps/index.js';
import { WS_PATH, encode, decode } from '../shared/protocol.js';
import { FLAG, MAX_PLAYERS } from '../shared/constants.js';

const [slide, arena, jets] = MAPS;

// ── utilidades ────────────────────────────────────────────────────────────────

/** Cliente falso ligado direto na sala (sem rede). */
function fakeClient(room, now, name, char = 'icaro') {
  const c = { msgs: [], of: (t) => c.msgs.filter((m) => m.t === t), last: (t) => c.of(t).at(-1) };
  c.id = room.connect((m) => c.msgs.push(structuredClone(m)), now);
  if (name !== undefined) room.handle(c.id, { t: 'join', name, char }, now);
  return c;
}

/** Avança o relógio virtual em passos de 1/60 s até `until()` ser verdadeiro (ou estourar `maxS`). */
function advance(room, clock, until, maxS, each) {
  const end = clock.now + maxS * 1000;
  while (!until() && clock.now < end) {
    clock.now += 1000 / 60;
    if (each) each();
    room.update(clock.now);
  }
  assert.ok(until(), 'condição não atingida no tempo esperado');
}

const state = (x, y, z, st = 0) => ({ t: 's', p: [x, y, z, 0, 0, 0, 0], st, f: 0 });

function checkResults(results, n) {
  assert.equal(results.length, n);
  assert.deepEqual(results.map((r) => r.place), Array.from({ length: n }, (_, i) => i + 1), 'colocações 1..n em ordem');
  const firstOut = results.findIndex((r) => r.status === 'eliminated');
  if (firstOut >= 0) assert.ok(results.slice(firstOut).every((r) => r.status === 'eliminated'), 'qualificados vêm primeiro');
}

// ── regras (relógio virtual) ──────────────────────────────────────────────────

test('lobby: nomes sanitizados, personagem válido, menor cor livre', () => {
  const room = new Room({ seed: 1 });
  const a = fakeClient(room, 0, '  Ana\u0007 com um nome comprido demais  ', 'penguin');
  const b = fakeClient(room, 0, '', 'dragao');
  const c = fakeClient(room, 0, 'Caio');
  assert.equal(a.of('welcome')[0].id, a.id);
  let players = c.last('lobby').players;
  assert.deepEqual(players.map((p) => p.color), [0, 1, 2]);
  assert.equal(players[0].name, 'Ana com um nome');
  assert.ok([...players[0].name].length <= 16);
  assert.equal(players[0].char, 'penguin');
  assert.equal(players[1].name, 'Jogador');
  assert.equal(players[1].char, 'icaro');
  assert.ok(players.every((p) => p.bot === false));
  room.disconnect(b.id, 0);
  const d = fakeClient(room, 0, 'Duda');
  players = d.last('lobby').players;
  assert.equal(players.find((p) => p.id === d.id).color, 1, 'reaproveita a menor cor livre');
  room.handle(a.id, { t: 'ping', c: 42 }, 1234);
  assert.deepEqual(a.last('pong'), { t: 'pong', c: 42, now: 1234 });
});

test('partida completa com 1 humano parado + 15 bots: 16 -> 8 -> 4 -> 1 e volta ao lobby', () => {
  const clock = { now: 1_000_000 };
  const room = new Room({ seed: 7 });
  const a = fakeClient(room, clock.now, 'Ana');
  const late = fakeClient(room, clock.now); // conecta mas só entra no meio da partida
  room.handle(a.id, { t: 'start' }, clock.now);

  const r0 = a.last('round');
  assert.equal(r0.round, 0);
  assert.equal(r0.mapId, 'slide');
  assert.equal(r0.players.length, MAX_PLAYERS);
  assert.equal(r0.cap, 8);
  assert.equal(r0.timeLimit, slide.timeLimit);
  assert.equal(r0.startAt, clock.now + 4500);
  assert.equal(r0.players.filter((p) => p.bot).length, 15);
  assert.equal(new Set(r0.players.map((p) => p.color)).size, 16, 'cores únicas 0..15');
  assert.equal(new Set(r0.players.map((p) => p.name)).size, 16, 'nomes únicos');
  assert.ok(r0.players.every((p) => Number.isFinite(p.spawn.x) && [...p.name].length <= 16));

  // contagem regressiva: ninguém se move
  advance(room, clock, () => clock.now >= r0.startAt - 50, 10);
  const pre = a.last('snap');
  assert.ok(pre.time < 0);
  assert.equal(pre.p.length, 16);
  for (const row of pre.p) {
    const sp = r0.players.find((p) => p.id === row[0]).spawn;
    assert.ok(Math.hypot(row[1] - sp.x, row[3] - sp.z) < 0.02, 'parado na largada');
  }
  assert.ok(Math.abs(a.of('snap').length - 4.45 * 20) <= 3, 'snapshots a ~20 Hz');

  // quem entra no meio fica no lobby assistindo
  room.handle(late.id, { t: 'join', name: 'Leo', char: 'penguin' }, clock.now);
  assert.equal(late.last('lobby').players.length, 2);
  assert.equal(late.last('round').round, 0);
  room.handle(late.id, { t: 'start' }, clock.now);
  assert.equal(late.last('error').t, 'error');
  const lobbiesA = a.of('lobby').length;

  // rodada 1: os bots correm; a humana fica parada e é eliminada quando as vagas enchem
  advance(room, clock, () => a.last('roundEnd'), slide.timeLimit + 5);
  const e0 = a.last('roundEnd');
  assert.equal(e0.round, 0);
  assert.equal(e0.final, false);
  assert.equal(e0.nextIn, 7000);
  checkResults(e0.results, 16);
  assert.equal(e0.results.filter((r) => r.status === 'qualified').length, 8);
  assert.equal(e0.results.find((r) => r.id === a.id).status, 'eliminated');
  const st0 = a.of('status');
  assert.equal(st0.length, 16, 'um status por participante');
  assert.deepEqual(st0.slice(0, 8).map((s) => [s.status, s.place]), Array.from({ length: 8 }, (_, i) => ['qualified', i + 1]));
  assert.ok(a.of('pop').length > 0, 'bots estouram boias');
  assert.ok(a.of('pop').every((p) => r0.players.some((q) => q.id === p.by)));
  assert.equal(a.of('lobby').length, lobbiesA, 'participante não recebe "lobby" durante a partida');
  const tEnd0 = (clock.now - r0.startAt) / 1000;
  assert.ok(tEnd0 > 20 && tEnd0 < 90, `rodada 1 acabou em ${tEnd0.toFixed(1)} s`);
  // qualificados continuam no snap com a flag
  advance(room, clock, () => a.last('snap').p.length === 8, 3);
  assert.ok(a.last('snap').p.every((row) => row[9] & FLAG.QUALIFIED));

  // rodada 2: arena só com os 8 qualificados
  advance(room, clock, () => a.of('round').length === 2, 8);
  const r1 = a.last('round');
  assert.equal(r1.mapId, 'arena');
  assert.equal(r1.cap, 4);
  assert.deepEqual(r1.players.map((p) => p.id).sort(), e0.results.slice(0, 8).map((r) => r.id).sort());
  assert.ok(Math.abs(r1.startAt - (r0.startAt + tEnd0 * 1000) - (7000 + 4500)) < 40, 'pausa de ~7 s + intro de 4,5 s');
  const nStatus = a.of('status').length;
  advance(room, clock, () => a.of('roundEnd').length === 2, arena.timeLimit + 10);
  const e1 = a.last('roundEnd');
  checkResults(e1.results, 8);
  assert.equal(e1.results.filter((r) => r.status === 'qualified').length, 4);
  // quem caiu por último fica melhor colocado: os status de eliminação saem do 8º para o 5º
  const st1 = a.of('status').slice(nStatus).filter((s) => s.status === 'eliminated');
  assert.deepEqual(st1.map((s) => s.place), [8, 7, 6, 5]);
  console.log(`  arena: rodada acabou em ${((clock.now - r1.startAt) / 1000).toFixed(1)} s`);

  // rodada 3: final com 4, um vencedor
  advance(room, clock, () => a.of('round').length === 3, 8);
  const r2 = a.last('round');
  assert.equal(r2.mapId, 'jets');
  assert.equal(r2.cap, 1);
  assert.equal(r2.players.length, 4);
  advance(room, clock, () => a.of('roundEnd').length === 3, jets.timeLimit + 10);
  const e2 = a.last('roundEnd');
  assert.equal(e2.final, true);
  checkResults(e2.results, 4);
  assert.equal(e2.results.filter((r) => r.status === 'qualified').length, 1);

  advance(room, clock, () => a.last('gameEnd'), 8);
  const g = a.last('gameEnd');
  assert.equal(g.winnerId, e2.results[0].id);
  assert.equal(g.lobbyIn, 12000);
  assert.deepEqual(g.podium.map((p) => p.place), [1, 2, 3]);
  assert.ok(g.podium.every((p) => p.name && p.char && Number.isInteger(p.color)));
  assert.ok(late.last('gameEnd'), 'espectador também recebe');

  // volta ao lobby: humanos conectados ficam, bots saem
  advance(room, clock, () => a.of('lobby').length > lobbiesA, 13);
  assert.deepEqual(a.last('lobby').players.map((p) => p.name), ['Ana', 'Leo']);
  assert.equal(room.phase, 'lobby');
});

test('arena: tempo esgotado desempata por distância percorrida; final sem chegada vence o maior progresso', () => {
  const clock = { now: 5000 };
  const room = new Room({ seed: 3, totalPlayers: 4, timeLimit: 5, maps: [arena, jets] });
  const cs = ['A', 'B', 'C', 'D'].map((n) => fakeClient(room, clock.now, n));
  const [a, b, c, d] = cs;
  room.handle(a.id, { t: 'start' }, clock.now);
  const r0 = a.last('round');
  assert.equal(r0.players.length, 4);
  assert.ok(r0.players.every((p) => !p.bot));
  assert.equal(r0.cap, 2);
  assert.equal(r0.timeLimit, 5);
  // A anda muito, B anda pouco, C e D ficam parados (todos em cima da plataforma central)
  let k = 0;
  advance(room, clock, () => a.last('roundEnd'), 12, () => {
    k++;
    if (k % 3) return;
    const w = (k % 120) / 120; // vai e volta
    room.handle(a.id, state(4 * (w < 0.5 ? w : 1 - w) * 2, 1, 0), clock.now);
    room.handle(b.id, state(-3 + 0.5 * (w < 0.5 ? w : 1 - w), 1, 0), clock.now);
    room.handle(c.id, state(0, 1, 3), clock.now);
    room.handle(d.id, { t: 's', p: [0, NaN, 0, 0, 0, 0, 0], st: 0, f: 0 }, clock.now); // inválido: ignorado
    room.handle(d.id, { t: 's', p: 'lixo' }, clock.now);
  });
  const e0 = a.last('roundEnd');
  checkResults(e0.results, 4);
  assert.deepEqual(e0.results.slice(0, 2).map((r) => [r.name, r.status]), [['A', 'qualified'], ['B', 'qualified']]);
  assert.ok(e0.results.slice(2).every((r) => r.status === 'eliminated'));
  assert.ok(Math.abs((clock.now - r0.startAt) / 1000 - 5) < 0.1, 'acabou no tempo limite');

  // final: ninguém chega; B está mais perto do pódio
  advance(room, clock, () => a.of('round').length === 2, 8);
  const r1 = a.last('round');
  assert.deepEqual(r1.players.map((p) => p.name).sort(), ['A', 'B']);
  advance(room, clock, () => a.of('roundEnd').length === 2, 12, () => {
    room.handle(a.id, state(40, 1, 0), clock.now);
    room.handle(b.id, state(15, 1, 0), clock.now);
    room.handle(c.id, state(0, 1.3, 0), clock.now); // eliminada na rodada anterior: não conta
  });
  const e1 = a.last('roundEnd');
  assert.equal(e1.final, true);
  assert.deepEqual(e1.results.map((r) => [r.name, r.status, r.place]), [['B', 'qualified', 1], ['A', 'eliminated', 2]]);
  advance(room, clock, () => a.last('gameEnd'), 8);
  assert.equal(a.last('gameEnd').winnerId, b.id);
});

test('arena: queda elimina; quedas simultâneas não deixam menos vivos que vagas; desconexão elimina', () => {
  const clock = { now: 0 };
  const room = new Room({ seed: 5, totalPlayers: 4, maps: [arena, jets] });
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((n) => fakeClient(room, clock.now, n));
  room.handle(a.id, { t: 'start' }, clock.now);
  const r0 = a.last('round');
  // antes da largada os estados são ignorados
  room.handle(a.id, state(0, -5, 0, 1), clock.now);
  advance(room, clock, () => clock.now >= r0.startAt + 500, 10);
  assert.equal(a.of('status').length, 0);
  // D sai e depois três "caem" no mesmo instante, com 2 vagas: só o primeiro registrado é eliminado
  room.disconnect(d.id, clock.now); // D desconecta: eliminado (4º)
  assert.deepEqual(a.last('status'), { t: 'status', id: d.id, status: 'eliminated', place: 4 });
  room.handle(a.id, state(0, -5, 0, 1), clock.now);
  room.handle(b.id, state(0, -5, 0, 1), clock.now);
  room.handle(c.id, state(0, -5, 0, 1), clock.now);
  const e0 = a.last('roundEnd');
  assert.ok(e0, 'rodada acabou quando vivos <= vagas');
  assert.deepEqual(e0.results.map((r) => [r.name, r.status]).sort(), [['A', 'eliminated'], ['B', 'qualified'], ['C', 'qualified'], ['D', 'eliminated']]);
  assert.equal(e0.results.find((r) => r.name === 'A').place, 3);
  // todos os humanos saem: a partida é encerrada e a sala volta ao lobby
  for (const x of [a, b, c]) room.disconnect(x.id, clock.now);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.match, null);
  room.update(clock.now + 100); // não quebra sem partida
});

// ── integração por WebSocket ──────────────────────────────────────────────────

/** Cliente ws de teste: guarda as mensagens e permite esperar por uma. */
function wsClient(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`);
  const c = { ws, msgs: [], waiters: [] };
  ws.on('message', (raw) => {
    const m = decode(raw);
    c.msgs.push(m);
    c.waiters = c.waiters.filter((w) => !w(m));
  });
  c.send = (m) => ws.send(encode(m));
  c.of = (t) => c.msgs.filter((m) => m.t === t);
  /** Resolve com a primeira mensagem (já recebida ou futura) que satisfaz `pred`. */
  c.wait = (pred, ms = 15000, from = 0) => new Promise((resolve, reject) => {
    const old = c.msgs.slice(from).find(pred);
    if (old) { resolve(old); return; }
    const timer = setTimeout(() => reject(new Error('timeout esperando mensagem')), ms);
    c.waiters.push((m) => { if (!pred(m)) return false; clearTimeout(timer); resolve(m); return true; });
  });
  c.open = new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return c;
}

test('integração WebSocket: lobby -> 3 rodadas -> gameEnd -> lobby, com tempos encurtados', async () => {
  const app = startServer({ port: 0, totalPlayers: 6, timeLimit: 3, introMs: 400, roundEndMs: 300, gameEndMs: 300, seed: 11, dist: '/nao/existe' });
  const port = await app.ready;
  const clients = [];
  try {
    // HTTP responde mesmo sem dist/
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);

    const a = wsClient(port), b = wsClient(port);
    clients.push(a, b);
    await Promise.all([a.open, b.open]);
    const wa = await a.wait((m) => m.t === 'welcome');
    const wb = await b.wait((m) => m.t === 'welcome');
    assert.ok(Math.abs(wa.now - Date.now()) < 2000);
    assert.notEqual(wa.id, wb.id);

    a.send({ t: 'join', name: 'Ana', char: 'icaro' });
    await a.wait((m) => m.t === 'lobby' && m.players.length === 1);
    b.send({ t: 'join', name: 'Beto', char: 'penguin' });
    const lobby = await a.wait((m) => m.t === 'lobby' && m.players.length === 2);
    assert.deepEqual(lobby.players, [
      { id: wa.id, name: 'Ana', char: 'icaro', color: 0, bot: false },
      { id: wb.id, name: 'Beto', char: 'penguin', color: 1, bot: false },
    ]);
    a.send({ t: 'ping', c: 5 });
    assert.equal((await a.wait((m) => m.t === 'pong')).c, 5);
    a.send('isto não é JSON'); // lixo não derruba a conexão
    a.send({ semTipo: true });

    // ── rodada 1 (tobogã): Ana "termina" teleportando o estado para a chegada; Beto fica parado
    b.send({ t: 'start' });
    const r0 = await a.wait((m) => m.t === 'round');
    assert.equal(r0.round, 0);
    assert.equal(r0.mapId, 'slide');
    assert.equal(r0.players.length, 6);
    assert.equal(r0.players.filter((p) => p.bot).length, 4);
    assert.equal(r0.cap, 3);
    assert.equal(r0.timeLimit, 3);
    assert.ok(r0.startAt > Date.now() && r0.startAt - Date.now() <= 400);
    const spawnB = r0.players.find((p) => p.id === wb.id).spawn;
    const reportB = setInterval(() => b.send(state(spawnB.x, spawnB.y, spawnB.z)), 50);
    try {
      const snap = await a.wait((m) => m.t === 'snap' && m.time > 0.3);
      assert.equal(snap.p.length, 6);
      assert.ok(snap.p.every((row) => row.length === 10 && row.every(Number.isFinite)));
      const fin = slide.trackPoint(slide.finishS + 3, 0);
      a.send(state(fin.x, fin.y, fin.z, 3));
      const stA = await a.wait((m) => m.t === 'status' && m.id === wa.id);
      assert.deepEqual(stA, { t: 'status', id: wa.id, status: 'qualified', place: 1 });
      a.send({ t: 'pop', id: slide.buoys[0].id });
      a.send({ t: 'pop', id: 99999 }); // boia inexistente: ignorada
      const pop = await b.wait((m) => m.t === 'pop' && m.by === wa.id);
      assert.equal(pop.id, slide.buoys[0].id);
      const snapQ = await b.wait((m) => m.t === 'snap' && m.p.some((row) => row[0] === wa.id && row[9] & FLAG.QUALIFIED));
      const rowA = snapQ.p.find((row) => row[0] === wa.id);
      assert.ok(Math.abs(rowA[1] - fin.x) < 0.01 && Math.abs(rowA[3] - fin.z) < 0.01, 'snap retransmite o estado reportado');
      assert.equal(rowA[8], 3);

      // quem conecta no meio recebe o lobby e a rodada em andamento
      const c = wsClient(port);
      clients.push(c);
      await c.open;
      c.send({ t: 'join', name: 'Caio', char: 'icaro' });
      assert.equal((await c.wait((m) => m.t === 'lobby')).players.length, 3);
      assert.equal((await c.wait((m) => m.t === 'round')).round, 0);
      await c.wait((m) => m.t === 'snap');
      c.ws.close();

      // tempo esgota (3 s): só Ana chegou
      const e0 = await a.wait((m) => m.t === 'roundEnd');
      assert.equal(e0.round, 0);
      assert.equal(e0.final, false);
      assert.equal(e0.nextIn, 300);
      checkResults(e0.results, 6);
      assert.deepEqual(e0.results.map((r) => r.status), ['qualified', 'eliminated', 'eliminated', 'eliminated', 'eliminated', 'eliminated']);
      assert.equal(e0.results[0].id, wa.id);
      const stB = await b.wait((m) => m.t === 'status' && m.id === wb.id);
      assert.equal(stB.status, 'eliminated');
      assert.equal(stB.place, 6, 'parado na largada: menor progresso');
    } finally { clearInterval(reportB); }

    // ── rodada 2 (arena): só Ana qualificada => vivos <= vagas logo na largada
    const r1 = await a.wait((m) => m.t === 'round' && m.round === 1);
    assert.equal(r1.mapId, 'arena');
    assert.deepEqual(r1.players.map((p) => p.id), [wa.id]);
    assert.equal(r1.cap, 1);
    const e1 = await a.wait((m) => m.t === 'roundEnd' && m.round === 1);
    assert.deepEqual(e1.results, [{ id: wa.id, name: 'Ana', status: 'qualified', place: 1 }]);

    // ── rodada 3 (final): Ana reporta estar em cima do pódio
    const r2 = await a.wait((m) => m.t === 'round' && m.round === 2);
    assert.equal(r2.mapId, 'jets');
    assert.equal(r2.cap, 1);
    await a.wait((m) => m.t === 'snap' && m.time > 0.05, 15000, a.msgs.indexOf(r2));
    a.send(state(0.5, jets.podium.y, 0.5));
    const e2 = await a.wait((m) => m.t === 'roundEnd' && m.round === 2);
    assert.equal(e2.final, true);
    const g = await b.wait((m) => m.t === 'gameEnd'); // Beto, eliminado, continua assistindo
    assert.equal(g.winnerId, wa.id);
    assert.deepEqual(g.podium, [{ id: wa.id, name: 'Ana', char: 'icaro', color: 0, place: 1 }]);
    assert.equal(g.lobbyIn, 300);

    // ── de volta ao lobby: humanos conectados, sem bots
    const back = await b.wait((m) => m.t === 'lobby', 15000, b.msgs.indexOf(g));
    assert.deepEqual(back.players.map((p) => p.name), ['Ana', 'Beto']);
    assert.ok(a.of('error').length === 0 && b.of('error').length === 0);
  } finally {
    for (const c of clients) c.ws.terminate();
    await app.close();
  }
});
