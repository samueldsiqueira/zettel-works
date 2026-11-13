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
function simulate(map, seed, n = N) {
  const popped = new Set();
  const es = [];
  for (let i = 0; i < n; i++) {
    const body = createBody();
    placeBody(body, map.spawn(i, n));
    es.push({ bot: createBot(seed * 1000 + i), body, inp: createInput(), world: { t: 0, popped, events: [] }, done: null, falls: 0 });
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

test('arena: bots sobrevivem bem mais que um corpo parado e caem de forma escalonada', () => {
  // referência: corpo parado na largada
  const still = createBody(), world = { t: 0, popped: new Set(), events: [] }, inp = createInput();
  placeBody(still, arena.spawn(0, N));
  while (!still.fell && world.t < arena.timeLimit) { world.events.length = 0; stepBody(still, inp, arena, world, TICK); world.t += TICK; }
  for (const seed of [1, 2]) {
    const es = simulate(arena, seed);
    const times = es.map((e) => e.done ?? arena.timeLimit).sort((a, b) => a - b);
    const m = mean(times);
    console.log(`  semente ${seed}: parado cai em ${world.t.toFixed(0)} s; bots: média ${m.toFixed(0)} s; quedas (s): ${fmt(times)}`);
    assert.ok(m > world.t * 1.5, `média ${m.toFixed(1)} vs parado ${world.t.toFixed(1)}`);
    // escalonado: nenhum segundo concentra metade das quedas, e elas se espalham por mais de 40 s
    const perSecond = new Map();
    for (const t of times) perSecond.set(Math.floor(t), (perSecond.get(Math.floor(t)) || 0) + 1);
    assert.ok(Math.max(...perSecond.values()) <= N / 2, 'não caem todos de uma vez');
    assert.ok(times.at(-1) - times[0] > 40, 'quedas espalhadas no tempo');
    assert.ok(new Set(times.map((t) => Math.floor(t / 5))).size >= 5, 'vários momentos de eliminação');
  }
});

test('labirinto: bots chegam ao pódio antes do tempo acabar', () => {
  for (const seed of [1, 2]) {
    const es = simulate(jets, seed);
    const ok = es.map((e) => e.done).filter((t) => t !== null).sort((a, b) => a - b);
    const hits = es.reduce((a, e) => a + e.body.hits, 0), falls = es.reduce((a, e) => a + e.falls, 0);
    console.log(`  semente ${seed}: ${ok.length}/${N} no pódio; tempos (s): ${fmt(ok)}; jatos acertaram ${hits}x; quedas na água ${falls}`);
    assert.ok(ok.length >= 4, `chegaram ${ok.length}/${N}`);
    assert.ok(ok.at(-1) < jets.timeLimit);
  }
});
