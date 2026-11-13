// Simulação headless dos bots (N = 16) nos três mapas, com o mesmo passo fixo do servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBody, createInput, placeBody, stepBody } from '../shared/physics.js';
import { MAPS } from '../shared/maps/index.js';
import { createBot, botThink } from '../shared/bot.js';
import { TICK } from '../shared/constants.js';

const [slide, arena, jets] = MAPS;
const N = 16;

/** Roda n bots até o fim do tempo. done = instante em que terminou (corrida) ou caiu (sobrevivência); null = nenhum dos dois. */
function simulate(map, seed, n = N, skill) {
  const popped = new Set();
  const es = [];
  for (let i = 0; i < n; i++) {
    const body = createBody();
    placeBody(body, map.spawn(i, n));
    es.push({ bot: createBot(seed * 1000 + i, skill), body, inp: createInput(), world: { t: 0, popped, events: [] }, done: null, falls: 0 });
  }
  for (let k = 0; k * TICK < map.timeLimit; k++) {
    for (const e of es) {
      if (e.done !== null) continue;
      e.world.t = k * TICK; e.world.events.length = 0;
      botThink(e.bot, e.body, map, e.world, e.inp, TICK);
      stepBody(e.body, e.inp, map, e.world, TICK);
      if (e.body.fell) {
        e.falls++;
        if (map.mode === 'survival') { e.done = e.world.t; continue; }
        map.respawn(e.body);
      }
      if (map.mode === 'race' && map.finished(e.body)) e.done = e.world.t;
    }
  }
  return es;
}

const fmt = (xs) => xs.map((x) => (x === null ? '-' : x.toFixed(0))).join(' ');
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('bots: entrada é borda de 1 tick e a IA é determinística para a mesma semente', () => {
  const a = simulate(slide, 7, 4), b = simulate(slide, 7, 4);
  assert.deepEqual(a.map((e) => e.done), b.map((e) => e.done));
  assert.deepEqual(a.map((e) => [e.body.x, e.body.z]), b.map((e) => [e.body.x, e.body.z]));
  // habilidades variadas
  const skills = Array.from({ length: N }, (_, i) => createBot(1000 + i).skill);
  assert.ok(Math.max(...skills) - Math.min(...skills) > 0.5, 'dispersão de habilidade');
  // pulo/mergulho nunca ficam "segurados" por dois ticks seguidos
  const bot = createBot(3), body = createBody(), inp = createInput(), world = { t: 0, popped: new Set(), events: [] };
  placeBody(body, slide.spawn(0, N));
  let prev = false;
  for (let k = 0; k < 600; k++) {
    world.t = k * TICK; world.events.length = 0;
    botThink(bot, body, slide, world, inp, TICK);
    assert.ok(!(prev && (inp.jump || inp.dive)), `borda repetida no tick ${k}`);
    assert.ok(Math.hypot(inp.mx, inp.mz) <= 1 + 1e-9);
    prev = inp.jump || inp.dive;
    stepBody(body, inp, slide, world, TICK);
  }
});

test('tobogã: a maioria dos 16 bots termina dentro do tempo, com dispersão', () => {
  for (const seed of [1, 2]) {
    const es = simulate(slide, seed);
    const times = es.map((e) => e.done);
    const ok = times.filter((t) => t !== null).sort((a, b) => a - b);
    console.log(`  semente ${seed}: ${ok.length}/${N} terminaram; tempos (s): ${fmt(ok)}; boias estouradas ${es[0].world.popped.size}/${slide.buoys.length}`);
    assert.ok(ok.length >= 12, `terminaram ${ok.length}/${N}`);
    assert.ok(ok.at(-1) - ok[0] > 4, 'chegadas espalhadas');
    assert.ok(ok[0] > 20, 'ninguém termina rápido demais');
  }
});

test('arena: bots duram bem mais que um corpo parado, caem de forma escalonada e os craques chegam ao fim', () => {
  // referência: corpo parado na largada
  const still = createBody(), world = { t: 0, popped: new Set(), events: [] }, inp = createInput();
  placeBody(still, arena.spawn(0, N));
  while (!still.fell && world.t < arena.timeLimit) { world.events.length = 0; stepBody(still, inp, arena, world, TICK); world.t += TICK; }
  for (const seed of [1, 2]) {
    const es = simulate(arena, seed);
    const times = es.map((e) => e.done ?? arena.timeLimit).sort((a, b) => a - b);
    const falls = times.filter((t) => t < arena.timeLimit);
    const m = mean(times);
    console.log(`  16 bots, semente ${seed}: parado cai em ${world.t.toFixed(0)} s; média ${m.toFixed(0)} s; ${N - falls.length} vivos aos 180 s; quedas (s): ${fmt(falls)}`);
    assert.ok(m > world.t * 1.5, `média ${m.toFixed(1)} vs parado ${world.t.toFixed(1)}`);
    // escalonado: nenhum segundo concentra metade das quedas, e elas se espalham no tempo
    const perSecond = new Map();
    for (const t of falls) perSecond.set(Math.floor(t), (perSecond.get(Math.floor(t)) || 0) + 1);
    assert.ok(Math.max(...perSecond.values()) <= N / 2, 'não caem todos de uma vez');
    assert.ok(falls.at(-1) - falls[0] > 40, 'quedas espalhadas no tempo');
    assert.ok(falls.length >= 4 && falls.length < N, 'alguns caem, alguns sobrevivem');
  }
  // caso real: 8 participantes depois do corte do tobogã
  const alive = [1, 2, 3, 4, 5, 6].map((seed) => simulate(arena, seed, 8).filter((e) => e.done === null).length);
  console.log(`  8 bots: vivos aos 180 s por semente: ${alive.join(' ')} (média ${mean(alive).toFixed(1)})`);
  assert.ok(mean(alive) >= 1.5 && mean(alive) <= 5.5, `média de vivos ${mean(alive)}`);
  // bots de habilidade máxima conseguem sobreviver a rodada inteira
  const pros = simulate(arena, 9, 8, 1).filter((e) => e.done === null).length;
  console.log(`  8 craques (skill 1): ${pros} vivos aos 180 s`);
  assert.ok(pros >= 5, `craques vivos: ${pros}/8`);
});

/** Final: roda até sobrar um (regra do servidor) ou o tempo acabar. */
function lastStanding(seed, n) {
  const es = [];
  for (let i = 0; i < n; i++) {
    const body = createBody();
    placeBody(body, jets.spawn(i, n));
    es.push({ bot: createBot(seed * 1000 + i), body, inp: createInput(), world: { t: 0, popped: new Set(), events: [] }, done: null });
  }
  let alive = n, t = 0;
  for (let k = 0; k * TICK < jets.timeLimit && alive > 1; k++) {
    t = k * TICK;
    for (const e of es) {
      if (e.done !== null || alive <= 1) continue;
      e.world.t = t; e.world.events.length = 0;
      botThink(e.bot, e.body, jets, e.world, e.inp, TICK);
      stepBody(e.body, e.inp, jets, e.world, TICK);
      if (e.body.fell) { e.done = t; alive--; }
    }
  }
  return { alive, end: t, falls: es.map((e) => e.done).filter((x) => x !== null).sort((a, b) => a - b) };
}

test('labirinto (final): eliminações escalonadas e, quase sempre, um único de pé antes do tempo acabar', () => {
  for (const n of [8, 4]) {
    let single = 0;
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const seed of seeds) {
      const r = lastStanding(seed, n);
      if (r.alive === 1) single++;
      console.log(`  ${n} bots, semente ${seed}: quedas (s): ${fmt(r.falls)} -> ${r.alive === 1 ? `vencedor aos ${r.end.toFixed(0)} s` : `${r.alive} de pé aos 210 s`}`);
      assert.ok(r.alive >= 1, 'sempre sobra alguém (as quedas são processadas uma a uma)');
      assert.ok(r.falls[0] > 10, 'ninguém cai logo de cara');
      if (n === 8) assert.ok(r.falls.at(-1) - r.falls[0] > 30, 'eliminações espalhadas no tempo');
    }
    assert.ok(single >= seeds.length - 1, `um único sobrevivente em ${single}/${seeds.length} sementes`);
  }
});
