import test from 'node:test';
import assert from 'node:assert/strict';
import { createBody, createInput, createWorld, placeBody, stepBody, hSpeed } from '../shared/physics.js';
import { MAPS, qualifyCap } from '../shared/maps/index.js';
import { TICK, PHYS } from '../shared/constants.js';

const [slide, arena, jets] = MAPS;

function run(map, seconds, ctl, b = createBody(), world = createWorld(), spawnI = 0) {
  if (!b._placed) { placeBody(b, map.spawn(spawnI, 16)); b._placed = true; }
  const inp = createInput();
  const n = Math.round(seconds / TICK);
  for (let i = 0; i < n; i++) {
    inp.mx = inp.mz = 0; inp.jump = inp.dive = false;
    if (ctl(b, inp, world, i) === false) break;
    world.events.length = 0;
    stepBody(b, inp, map, world, TICK);
    world.t += TICK;
  }
  return { b, world };
}

test('cap por rodada: corrida = metade; sobrevivência = minAlive', () => {
  assert.equal(qualifyCap(0, 16), 8);
  assert.equal(qualifyCap(1, 8), 2);
  assert.equal(qualifyCap(2, 5), 1);
});

test('fica parado no chão da largada em todos os mapas', () => {
  for (const m of MAPS) {
    const { b } = run(m, 2, () => {});
    assert.equal(b.grounded, true, m.id);
    assert.equal(b.state, 'ground', m.id);
    assert.ok(!b.fell, m.id);
  }
});

test('pulo duplo vira mergulho e o impacto vira deslize com impulso', () => {
  let sawDive = false, slideSpeed = 0;
  const { b } = run(jets, 3, (b, inp, w, i) => {
    // corre tangencialmente ao anel de largada
    const r = Math.hypot(b.x, b.z); inp.mx = -b.z / r; inp.mz = b.x / r;
    if (i === 40 || i === 55) inp.jump = true;
    if (b.state === 'dive') sawDive = true;
    if (b.state === 'slide' && !slideSpeed) slideSpeed = hSpeed(b);
    if (slideSpeed) return false;
  });
  assert.ok(sawDive, 'entrou em mergulho');
  assert.ok(slideSpeed >= PHYS.DIVE_MIN_SPEED, `deslize com impulso (${slideSpeed})`);
});

test('deslize em piso plano desacelera e volta a andar', () => {
  let slid = false;
  const b0 = createBody(); placeBody(b0, { x: -13, y: 1, z: 0 }); b0._placed = true;
  const { b } = run(arena, 8, (b, inp, w, i) => {
    if (i < 30) inp.mx = 1;
    if (i === 15 || i === 28) inp.jump = true;
    if (b.state === 'slide') slid = true;
    if (slid && b.state === 'ground') return false;
  }, b0);
  assert.ok(slid && b.state === 'ground' && !b.fell);
});

function slideBot(b, inp, w, i) {
  const c = slide.trackCoords(b.x, b.z);
  const p = slide.trackPoint(Math.max(c.s, 0) + 8, 0);
  const dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz) || 1;
  inp.mx = dx / l; inp.mz = dz / l;
  if (b.z > 0) { inp.mx = 0; inp.mz = -1; }
  if (b.state === 'ground' && b.stateTime > 0.15) inp.jump = true;
  else if (b.state === 'air' && b.stateTime > 0.12) inp.jump = true;
  if (b.fell) return false;
  if (slide.finished(b)) return false;
}

test('tobogã: bot que desliza termina bem dentro do tempo; andando é bem mais lento', () => {
  const a = run(slide, 180, slideBot);
  assert.ok(slide.finished(a.b), `terminou (s=${a.b.s.toFixed(0)}/${slide.finishS.toFixed(0)})`);
  assert.ok(!a.b.fell);
  console.log('  deslizando:', a.world.t.toFixed(1), 's; boias', a.world.popped.size, '/', slide.buoys.length, '; pista', slide.totalS.toFixed(0), 'm; y0', slide.samples[0].y.toFixed(1));
  assert.ok(a.world.t < 90);
  const w = run(slide, 180, (b, inp) => {
    const c = slide.trackCoords(b.x, b.z); const p = slide.trackPoint(Math.max(c.s, 0) + 8, 0);
    const dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz) || 1; inp.mx = dx / l; inp.mz = dz / l;
    if (b.z > 0) { inp.mx = 0; inp.mz = -1; }
    if (slide.finished(b)) return false;
  });
  console.log('  andando:', w.world.t.toFixed(1), 's', slide.finished(w.b));
  assert.ok(w.world.t > a.world.t * 1.1);
});

test('tobogã: paredes seguram quem empurra para o lado', () => {
  const { b } = run(slide, 20, (b, inp, w, i) => { inp.mx = 1; inp.mz = -0.3; if (i % 50 === 0) inp.jump = true; });
  assert.ok(!b.fell && Math.abs(b.d) <= slide.HALF_W + 0.2, `d=${b.d}`);
});

test('arena: parado no centro acaba na água quando a plataforma encolhe', () => {
  const { b, world } = run(arena, 180, (b) => { if (b.fell) return false; });
  assert.ok(b.fell);
  console.log('  caiu em t =', world.t.toFixed(1));
  assert.ok(world.t > 15 && world.t < 110);
});

test('arena: plataformas flutuantes são sólidas e carregam o jogador', () => {
  const f = arena.floats[0], s = arena.floatState(f, 1);
  const b = createBody(); placeBody(b, { x: s.x, y: s.y + 0.5, z: s.z }); b._placed = true;
  const world = createWorld(); world.t = 1;
  run(arena, 5, () => {}, b, world);
  const s2 = arena.floatState(f, world.t);
  assert.ok(!b.fell && b.grounded);
  assert.ok(Math.hypot(b.x - s2.x, b.z - s2.z) < f.r, 'continua em cima');
});

test('labirinto: jato atinge quem fica parado; cair na água elimina', () => {
  const { b } = run(jets, 40, () => {});
  assert.ok(b.hits > 0, 'foi atingido');
  const c = createBody(); placeBody(c, { x: 38.5, y: 3, z: 0 }); c._placed = true; // canal, entre as grades
  run(jets, 3, (b) => { if (b.fell) return false; }, c);
  assert.ok(c.fell);
});

test('labirinto: grades são pisáveis; anéis afundam de fora para dentro; pódio fica', () => {
  const g = jets.grates[0], o = {};
  assert.ok(jets.groundAt(Math.cos(g.a) * g.r, Math.sin(g.a) * g.r, 1, 0, o));
  assert.equal(jets.groundAt(46, 0, 1, 10, o).y, 1);
  assert.ok(jets.ringState(2, 45).warn > 0);
  const { b, world } = run(jets, 80, (b) => { if (b.fell) return false; b.hitCd = 9; });
  assert.ok(b.fell && world.t > 50 && world.t < 56, `anel externo afundou (t=${world.t})`);
  assert.ok(jets.groundAt(1, 1, 1, 209, o));
  assert.equal(jets.jetSpan(jets.jets[0], 200).r1, 4.5);
});
