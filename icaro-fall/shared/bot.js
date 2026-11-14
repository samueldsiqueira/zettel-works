// IA dos bots — pura e determinística dado o rng do bot (sem relógio, sem Math.random).
// O servidor chama botThink() a cada tick antes de stepBody(); a IA só preenche o Input
// (direção em espaço de mundo + bordas de pulo/mergulho), exatamente como um jogador humano.
//
//   const bot = createBot(seed);                 // habilidade sorteada a partir da semente
//   botThink(bot, body, map, world, input, dt);  // preenche input.mx/mz/jump/dive para este tick
//
// Cada bot tem uma `skill` em [0,1]. Ela controla tempos de reação, precisão e a chance de
// "não ver" um obstáculo, para que as corridas tenham dispersão e um humano atento consiga vencer.
// Como os objetos de mapa são função pura de `world.t`, a IA prevê posições futuras de
// plataformas e jatos chamando os mesmos ganchos do mapa (floatState, jetAngle).
import { PHYS } from './constants.js';
import { makeRng, wrapAngle, clamp } from './rng.js';

const JUMP_T = (2 * PHYS.JUMP_V) / PHYS.GRAVITY; // tempo de voo de um pulo simples em piso plano (~0,73 s)
const JUMP_REACH = PHYS.RUN_SPEED * JUMP_T; // alcance horizontal de um pulo correndo (~5,1 m)

/** Cria o "cérebro" de um bot. `skill` opcional (0 = desastrado, 1 = craque); por padrão vem da semente. */
export function createBot(seed, skill) {
  const rng = makeRng(seed);
  const sk = skill ?? clamp(0.05 + rng() * 1.05, 0, 1);
  return { seed, rng, skill: sk, mapId: null, mem: null };
}

/** Decide o Input deste tick. jump/dive são bordas: ficam true só no tick da decisão. */
export function botThink(bot, b, map, world, inp, dt) {
  inp.mx = inp.mz = 0; inp.jump = inp.dive = false;
  if (bot.mapId !== map.id) { // rodada nova: memória nova
    bot.mapId = map.id;
    bot.mem = INIT[map.id] ? INIT[map.id](bot, map) : {};
  }
  if (b.stun > 0) return inp; // sem controle (atingido por jato)
  const think = THINK[map.id];
  if (think) think(bot, b, map, world, inp, dt);
  return inp;
}

// ── utilidades ────────────────────────────────────────────────────────────────

function steer(inp, dx, dz, mag = 1) {
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) { inp.mx = inp.mz = 0; return; }
  inp.mx = (dx / l) * mag; inp.mz = (dz / l) * mag;
}

/** Tempo até o corpo (no ar) descer à altura yT. */
function airTime(b, yT) {
  const disc = b.vy * b.vy + 2 * PHYS.GRAVITY * (b.y - yT);
  if (disc <= 0) return 0;
  return (b.vy + Math.sqrt(disc)) / PHYS.GRAVITY;
}

/** Controle aéreo: acelera para que o ponto de pouso previsto caia em (tx, tz) daqui a `tr` s. */
function steerLanding(b, inp, tx, tz, tr) {
  if (tr < 0.04) return;
  const ex = tx - (b.x + b.vx * tr), ez = tz - (b.z + b.vz * tr);
  const k = 2 / (tr * tr * PHYS.AIR_ACCEL);
  let mx = ex * k, mz = ez * k;
  const l = Math.hypot(mx, mz);
  if (l > 1) { mx /= l; mz /= l; }
  inp.mx = mx; inp.mz = mz;
}

// ── Mapa 1: Tobogã ────────────────────────────────────────────────────────────

const TC = { s: 0, d: 0, y: 0, tx: 0, tz: -1, i: 0 };

function initSlide(bot) {
  const { rng, skill: sk } = bot;
  return {
    startDelay: (1 - sk) * 0.7 * rng(), // reação na largada
    lane: (rng() * 2 - 1) * 2.2, // faixa preferida
    wobA: (1 - sk) * 1.6 * rng(), wobF: 0.5 + rng(), wobP: rng() * 6.28, // zigue-zague de quem pilota mal
    rejump: 5 + sk * 8 + rng() * 2, // abaixo desta velocidade, pula + mergulha para reentrar em deslize
    tap: 0.2 + (1 - sk) * 1.0 * rng(), // demora para emendar o pulo quando fica "em pé"
    usePads: rng() < 0.15 + sk * 0.8, // mira os aceleradores?
    buoySee: 0.3 + sk * 0.6, // chance de perceber cada boia a tempo
    seen: new Map(), // boia id -> percebeu?
    stumble: 0.04 + (1 - sk) * 0.5, // tropeços por segundo: pula sem mergulhar e cai em pé (freia)
    noDive: -1,
  };
}

function thinkSlide(bot, b, map, world, inp, dt) {
  const M = bot.mem, t = world.t;
  if (t < M.startDelay) return;
  const c = map.trackCoords(b.x, b.z, TC);
  const s = Math.max(c.s, 0), d = c.d;
  const sp = Math.hypot(b.vx, b.vz);

  // faixa alvo: preferida -> acelerador à frente -> desvio de boias
  let lane = M.lane + M.wobA * Math.sin(t * M.wobF + M.wobP);
  let padAhead = Infinity;
  if (M.usePads) {
    for (const p of map.pads) {
      const ds = p.s - s;
      if (ds > 2 && ds < 38) { lane = p.d; padAhead = ds; break; }
    }
  }
  const look = 8 + sp * 0.7;
  for (const q of map.buoys) {
    const ds = q.s - s;
    if (ds < 0.5 || ds > look || world.popped.has(q.id)) continue;
    let sees = M.seen.get(q.id);
    if (sees === undefined) { sees = bot.rng() < M.buoySee; M.seen.set(q.id, sees); }
    if (!sees || Math.abs(q.d - lane) > 1.7) continue;
    const side = d >= q.d ? 1 : -1; // desvia para o lado em que já está
    let nl = q.d + side * 2.1;
    if (Math.abs(nl) > 4) nl = q.d - side * 2.1;
    lane = nl;
  }

  if (b.z > 0.5 && c.s < 1) {
    // plataforma de largada: corre para a boca da pista
    steer(inp, clamp((lane * 0.5 - b.x) * 0.3, -0.5, 0.5), -1);
  } else {
    const p = map.trackPoint(s + 5 + sp * 0.4, clamp(lane, -4, 4));
    steer(inp, p.x - b.x, p.z - b.z);
  }

  // deslize: pulo + pulo duplo (mergulho) e o impacto de barriga dá o impulso
  const padSoon = padAhead < sp * 0.9 + 2 && Math.abs(d - lane) < 2.2; // não decola em cima do acelerador
  if (b.state === 'ground') { if (b.stateTime > M.tap) inp.jump = true; }
  else if (b.state === 'air') { if (b.stateTime > 0.12 && b.jumps < 2 && t > M.noDive) inp.jump = true; }
  else if (b.state === 'slide') {
    if (sp < M.rejump && b.stateTime > 0.5 && !padSoon) inp.jump = true;
    else if (sp > 12 && bot.rng() < M.stumble * dt) { inp.jump = true; M.noDive = t + 1.2; } // erro: esquece o pulo duplo
  }
}

// ── Mapa 2: Arena ─────────────────────────────────────────────────────────────

const FS = {}, FS2 = {};

function initArena(bot, map) {
  const { rng, skill: sk } = bot;
  const c = map.center;
  // instante em que a plataforma central fica pequena demais para alcançar o 1º anel com um pulo
  const lastR = map.floats[0].rho - map.floats[0].r - JUMP_REACH + 1.6;
  const lastT = c.shrinkStart + (c.shrinkEnd - c.shrinkStart) * (1 - lastR / c.r0);
  return {
    // sai do centro com folga (craques) ou em cima da hora / tarde demais (desastrados)
    leaveT: lastT - 0.5 - sk * 7 - rng() * 3 + (1 - sk) * rng() * 3.5,
    // antecedência com que percebe que o apoio vai afundar: craques planejam, desastrados só reagem ao aviso
    react: 0.5 + rng() * 1.3 + sk * sk * 8,
    pref: map.floats.map(() => rng() * 2.5), // gosto pessoal por plataforma (espalha os bots)
    land: 0.8 + (1 - sk) * 0.5, // folga de pouso em relação à borda do alvo
    plan: sk > 0.35, // consulta o plano de fuga em vez de só reagir
    hold: sk > 0.75 ? 2 : 0, // cautela do plano: craques só contam com janelas de pulo folgadas
    horizon: 6 + sk * sk * 60, // quantos segundos à frente enxerga no plano
    reachK: 0.95 + (1 - sk) * 0.22 * rng(), // superestima o próprio pulo
    dwell: 2.0,
    target: null, nextPick: 0,
  };
}

function thinkArena(bot, b, map, world, inp) {
  const M = bot.mem, t = world.t;
  if (!b.grounded) {
    if (M.target) {
      const tr = airTime(b, map.TOP_Y - 0.1);
      const s = map.floatState(M.target, t + tr, FS);
      steerLanding(b, inp, s.x, s.z, tr);
    }
    return;
  }

  // em que estou pisando? (null = plataforma central)
  const R = map.centerRadius(t), rr = Math.hypot(b.x, b.z);
  const onCenter = R > 0 && rr <= R + 0.05;
  let sup = null, cx = 0, cz = 0, cvx = 0, cvz = 0, supR = R;
  if (!onCenter) {
    for (const f of map.floats) {
      const s = map.floatState(f, t, FS);
      if (Math.hypot(b.x - s.x, b.z - s.z) <= f.r + 0.1) {
        sup = f; cx = s.x; cz = s.z; cvx = s.vx; cvz = s.vz; supR = f.r;
        break;
      }
    }
    if (!sup) return;
  }
  if (M.target === sup) M.target = null; // chegou

  const mySafe = onCenter ? 99 : floatSafeFor(arenaPlan(map), sup, t);
  const alert = onCenter ? t >= M.leaveT : M.plan || mySafe < M.react;
  if (!alert) M.target = null;
  else if (t >= M.nextPick) {
    const c = pickFloat(M, b, map, t, sup, cx, cz, cvx, cvz, supR, mySafe);
    M.nextPick = t + (c ? 0.6 : 0.15); // escolhido o alvo, compromete-se com ele por um instante
    M.target = c;
  }

  const c = M.target;
  if (!c) {
    // fica perto do centro do apoio (na central, acompanha o encolhimento)
    let hx = cx, hz = cz;
    if (onCenter) {
      const k = rr > 1e-3 ? Math.min(rr, Math.max(0, R - 2)) / rr : 0;
      hx = b.x * k; hz = b.z * k;
    }
    const dx = hx - b.x, dz = hz - b.z, l = Math.hypot(dx, dz);
    if (l > 0.15) steer(inp, dx, dz, Math.min(1, l * 1.2));
    return;
  }

  // perseguição: vai para a borda voltada para onde o alvo estará e pula com corrida
  const s = map.floatState(c, t + JUMP_T, FS);
  let ux = s.x - cx - cvx * JUMP_T, uz = s.z - cz - cvz * JUMP_T;
  const D = Math.hypot(ux, uz) || 1;
  ux /= D; uz /= D;
  const reach = JUMP_REACH * M.reachK + c.r - M.land;
  const proj = (b.x - cx) * ux + (b.z - cz) * uz; // quanto já avancei rumo à borda
  const lat = Math.abs((b.x - cx) * -uz + (b.z - cz) * ux);
  const fromEdge = D - (supR - 0.45); // distância borda -> centro do alvo no pouso
  const go = fromEdge <= reach && s.solid;
  if (go) {
    const tx = s.x - (b.x + cvx * JUMP_T), tz = s.z - (b.z + cvz * JUMP_T);
    const dist = Math.hypot(tx, tz);
    const vrel = ((b.vx - cvx) * tx + (b.vz - cvz) * tz) / (dist || 1);
    const can = dist <= reach;
    if (can && (proj >= supR - 0.6 || (vrel > 5.5 && proj >= supR - 1.3))) { steer(inp, tx, tz); inp.jump = true; }
    else if (can && lat < 0.8) steer(inp, tx, tz); // embala rumo ao alvo
    else {
      // ainda fora de alcance / desalinhado: vai até a borda, sem passar dela
      const ex = cx + ux * (supR - 0.5) - b.x, ez = cz + uz * (supR - 0.5) - b.z, l = Math.hypot(ex, ez);
      if (l > 0.1) steer(inp, ex, ez, Math.min(1, l * 2));
    }
  } else {
    // posição de espera: recuado da borda, para ter corrida na hora de pular
    const back = Math.max(supR - 2.0, 0);
    const px = cx + ux * back, pz = cz + uz * back;
    const dx = px - b.x, dz = pz - b.z, l = Math.hypot(dx, dz);
    if (l > 0.15 || lat > 0.3) steer(inp, dx, dz, Math.min(1, l * 1.5));
  }
}

// Plano de fuga: como as plataformas são função pura do tempo, dá para calcular de trás para a frente,
// uma vez por mapa, até quando é possível ficar seco estando na plataforma i no instante t_k
// (ficando parado ou pulando para uma vizinha). Os bots que planejam consultam esta tabela (L); todos
// usam U (até quando cada plataforma fica sólida), o que evita duplicar aqui as constantes do mapa.
const PLAN = new WeakMap();
const PLAN_DT = 0.25, HOP_K = Math.round(JUMP_T / PLAN_DT);
const PLAN_REACH = JUMP_REACH * 0.9, PLAN_LAND = 1.1; // folgas conservadoras: o plano precisa ser executável

function arenaPlan(map, hold = 0) {
  let byHold = PLAN.get(map);
  if (!byHold) PLAN.set(map, byHold = []);
  let P = byHold[hold];
  if (P) return P;
  const F = map.floats, n = F.length;
  const K = Math.ceil(map.timeLimit / PLAN_DT) + HOP_K + 2;
  const solid = new Uint8Array(n * K), L = new Float32Array(n * K), U = new Float32Array(n * K);
  const px = new Float32Array(n * K), pz = new Float32Array(n * K);
  const lx = new Float32Array(n * K), lz = new Float32Array(n * K); // centro "lançado" (posição + velocidade * voo)
  const st = {};
  for (let i = 0; i < n; i++) for (let k = 0; k < K; k++) {
    const s = map.floatState(F[i], k * PLAN_DT, st), q = i * K + k;
    solid[q] = s.solid ? 1 : 0; px[q] = s.x; pz[q] = s.z;
    lx[q] = s.x + s.vx * JUMP_T; lz[q] = s.z + s.vz * JUMP_T;
  }
  for (let k = K - 1; k >= 0; k--) for (let i = 0; i < n; i++) {
    const q = i * K + k;
    U[q] = solid[q] && k < K - 1 ? U[q + 1] : k * PLAN_DT; // até quando esta plataforma segue sólida
    if (!solid[q] || k === K - 1) { L[q] = k * PLAN_DT; continue; }
    let v = L[q + 1];
    const k2 = k + HOP_K;
    if (k2 < K) for (let j = 0; j < n; j++) {
      const q2 = j * K + k2;
      if (j === i || !solid[q2] || L[q2] <= v) continue;
      const lim = F[i].r - 0.45 + PLAN_REACH + F[j].r - PLAN_LAND;
      const dx = px[q2] - lx[q], dz = pz[q2] - lz[q];
      if (dx * dx + dz * dz > lim * lim) continue;
      // plano cauteloso (hold > 0): a janela precisa durar, i.e. o mesmo pulo ainda é possível `hold` passos depois
      const q3 = q + hold, q4 = q2 + hold;
      if (k2 + hold >= K || !solid[q3] || !solid[q4]) continue;
      const ex = px[q4] - lx[q3], ez = pz[q4] - lz[q3];
      if (ex * ex + ez * ez <= lim * lim) v = L[q2];
    }
    L[q] = v;
  }
  P = { L, U, K, index: new Map(F.map((f, i) => [f, i])) };
  byHold[hold] = P;
  return P;
}

/** Até quando (tempo da rodada) dá para sobreviver estando em `f` no instante t, segundo o plano. */
function planUntil(P, f, t) {
  const k = clamp(Math.round(t / PLAN_DT), 0, P.K - 1);
  return P.L[P.index.get(f) * P.K + k];
}

/** Segundos até a plataforma `f` deixar de ser sólida, a partir de t (0 = já afundou). */
function floatSafeFor(P, f, t) {
  const k = clamp(Math.ceil(t / PLAN_DT), 0, P.K - 1);
  return Math.max(0, P.U[P.index.get(f) * P.K + k] - t);
}

/** Escolhe a plataforma para onde pular agora (alcançável, com previsão de órbita), ou null para ficar.
 *  Quem planeja (M.plan) compara "até quando sobrevivo" pelo plano, limitado ao seu horizonte de visão;
 *  os demais só olham quanto tempo a plataforma vizinha ainda fica à tona. */
function pickFloat(M, b, map, t, sup, cx, cz, cvx, cvz, supR, mySafe) {
  let best = null, bestScore = -Infinity, worst = null, worstGap = Infinity;
  const tl = t + 0.3 + JUMP_T;
  const maxReach = JUMP_REACH * M.reachK;
  const T = arenaPlan(map, M.hold), P = M.plan ? T : null;
  const see = (until) => Math.min(until - t, M.horizon);
  // valor de ficar onde estou. Quem planeja compara com o plano atual (`now`) e com o que sobra dele
  // se esperar mais um pouco (`later`): pula cedo para plataformas que duram mais, e pula de qualquer
  // jeito quando a janela do plano está fechando.
  let stay = -Infinity, now = -Infinity, later = -Infinity;
  if (sup && P) { now = see(planUntil(P, sup, t)); later = see(planUntil(P, sup, t + 1.2)); }
  else if (sup) stay = mySafe < 2.2 ? -Infinity : mySafe + 1.5;
  for (const c of map.floats) {
    if (c === sup) continue;
    const s = map.floatState(c, tl, FS);
    if (!s.solid) continue;
    let dx, dz, eta = 0;
    if (sup) { dx = s.x - (cx + cvx * (tl - t)); dz = s.z - (cz + cvz * (tl - t)); }
    else {
      dx = s.x; dz = s.z;
      // na central dá para correr pela borda ao encontro da plataforma
      const k = (supR - 0.45) / (Math.hypot(dx, dz) || 1);
      eta = Math.hypot(dx * k - b.x, dz * k - b.z) / 6;
    }
    const gap = Math.hypot(dx, dz) - (supR - 0.45) - (maxReach + c.r - M.land); // <= 0: alcançável
    if (gap < worstGap) { worstGap = gap; worst = c; }
    if (gap > (sup ? 0 : 1.0)) continue;
    const sf = floatSafeFor(T, c, tl + eta);
    if (sf < (P ? 0.6 : M.dwell) + eta) continue; // o plano pode usar plataformas-ponte de vida curta
    const val = P ? see(planUntil(P, c, tl + eta)) : sf;
    if (val <= stay + 0.01) continue; // só troca por coisa melhor
    if (sup && P && (val < now - 0.01 || !(sf > mySafe + 1 || val > later + 0.01))) continue;
    const score = val - eta * 3 + sf * 0.02 + M.pref[c.id] * (P ? 0.01 : 1);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (!best && mySafe < 0.4) best = worst; // desespero: tenta a menos pior
  return best;
}

// ── Mapa 3: Labirinto de Jatos (final, último de pé) ──────────────────────────
// Sobreviver: esquivar dos jatos, ficar longe das bordas, migrar para o anel de dentro pelas grades
// antes de o anel atual afundar e, por fim, aguentar no pódio enquanto os jatos o varrem.

const NAV = new WeakMap(); // map -> faixas sólidas radiais, de fora para dentro
const SP = {};

function jetsNav(map) {
  let segs = NAV.get(map);
  if (segs) return segs;
  segs = map.rings.map((g) => ({ kind: 'ring', lo: g.r0, hi: g.r1, id: g.id, sinkAt: g.sinkAt }));
  for (const r of new Set(map.grates.map((g) => g.r))) {
    const gs = map.grates.filter((g) => g.r === r);
    segs.push({ kind: 'grate', lo: r - gs[0].halfR, hi: r + gs[0].halfR, angles: gs.map((g) => g.a) });
  }
  segs.push({ kind: 'podium', lo: 0, hi: map.podium.r });
  segs.sort((a, b) => b.hi - a.hi);
  segs.forEach((s, i) => {
    s.next = segs[i + 1] || null;
    if (s.kind === 'ring') {
      s.angles = s.next.angles; // ângulos das grades da travessia para dentro
      s.nextRing = segs.slice(i + 1).find((q) => q.kind === 'ring') || null;
      s.travelR = s.lo + 1.3; // raio de espera: longe da borda de fora (um jato empurra quase 4 m para fora)
    }
  });
  NAV.set(map, segs);
  return segs;
}

function initJets(bot, map) {
  const { rng, skill: sk } = bot;
  return {
    jetFail: 0.01 + (1 - sk) * 0.16, // chance de não reagir a uma passagem de jato
    jitter: 0.02 + (1 - sk) * 0.23, // erro (s) no instante do pulo/mergulho de esquiva
    // atraso para começar a migrar depois que o anel avisa que vai afundar: craques vão cedo, desastrados tarde
    late: map.rings.map(() => 0.3 + rng() * 1.5 + (1 - sk) * (1 - sk) * rng() * (map.SINK_WARN + 1)),
    edgeErr: (1 - sk) * 0.22, // erro no ponto de decolagem das grades
    wrongGrate: (1 - sk) * 0.25,
    pace: 0.65 + 0.3 * sk, // ritmo de corrida pelo anel
    rho: 2.2 + rng() * 0.8, // raio em que fica no pódio
    podGap: 1.5 + 0.3 * rng() - (1 - sk) * 0.4, // vão (rad) abaixo do qual decide atravessar um jato
    podOver: 0.6 + 0.2 * rng(), // quanto pousa além do jato (rad)
    off: (rng() - 0.5) * 9, // posição de espera pessoal (m ao longo do anel), para não ficarem empilhados
    pod: null,
    ringId: -1, ang: 0, cross: false, hop: null, edge: 0.3,
    nextWin: 0, dodge: null, nextDodge: 0, threat: false, blindUntil: -1,
  };
}

/** O jato `j` varre o raio r em t? */
function jetCovers(map, j, t, r) {
  const sp = map.jetSpan(j, t, SP);
  return sp.on && r >= sp.r0 - 0.4 && r <= sp.r1 + 0.4;
}

/** Há uma janela sem jatos para atravessar pela grade no ângulo `a`? */
function crossingClear(map, seg, a, t) {
  const nr = seg.nextRing;
  for (const j of map.jets) {
    const sp = map.jetSpan(j, t, SP);
    if (!sp.on) continue;
    const dep = sp.r1 >= seg.lo && sp.r0 <= seg.lo; // varre a saída e a 1ª grade
    const arr = nr && sp.r1 >= nr.hi - 1 && sp.r0 <= nr.hi; // varre o anel de chegada
    if (dep) for (let tau = 0; tau <= 1.6; tau += 0.1) {
      if (Math.abs(wrapAngle(map.jetAngle(j, t + tau) - a)) * seg.lo < 1.7) return false;
    }
    if (arr) for (let tau = 2.0; tau <= 3.6; tau += 0.1) {
      if (Math.abs(wrapAngle(map.jetAngle(j, t + tau) - a)) * nr.hi < 2.2) return false;
    }
  }
  return true;
}

// Esquiva por simulação: como os jatos são determinísticos, o bot testa alguns roteiros simples
// ("corro para lá e pulo daqui a 0,2 s", "mergulho agora para cá"...) contra as posições futuras dos
// jatos e escolhe o mais barato que não é atingido. Isso resolve os casos em que um jato baixo e um
// alto chegam quase juntos, que uma regra "pula o baixo / mergulha sob o alto" não resolve.
const DODGE_H = 2.2, DODGE_DT = 1 / 30, DODGE_N = Math.round(DODGE_H / DODGE_DT) + 1;
const DIVE_AIR = (2 * PHYS.DIVE_HOP_V) / PHYS.GRAVITY; // voo do mergulho a partir do chão (~0,38 s)
const SLIDE_DEC = PHYS.FRICTION.normal * PHYS.GRAVITY + 1; // desaceleração aproximada do deslize
const JA = []; // ângulos previstos dos jatos ativos: JA[i][n]
const JLOW = [];

/** Primeiro instante em que o roteiro é atingido (Infinity = passa ileso). Reproduz por alto a física:
 *  v0: velocidade tangencial atual; dir: sentido da corrida (-1/0/+1; null = segue como está);
 *  kind: 0 nada, 1 pulo, 2 mergulho, 3 pulo e mergulho ao pousar; at: quando agir (s); sliding: já está deslizando? */
function scriptHit(map, nj, th, r, v0, dir, kind, at0, sliding) {
  let at = at0;
  const lim = map.JET_RADIUS + 0.4 + 0.45; // raio do jato + raio do corpo + folga
  let ang = th, v = v0, slide = sliding, acted = false, vDive = 0;
  for (let n = 0; n < DODGE_N; n++) {
    const u = n * DODGE_DT;
    let s = u - at;
    let y0 = 0, h = 1.6;
    if (kind === 3 && s >= JUMP_T) { kind = 2; at += JUMP_T; s -= JUMP_T; } // pousou: emenda o mergulho
    if ((kind === 1 || kind === 3) && s >= 0 && s < JUMP_T) { // no ar: mantém a velocidade da decolagem
      y0 = PHYS.JUMP_V * s - 0.5 * PHYS.GRAVITY * s * s;
      slide = false;
    } else if (kind === 2 && s >= 0 && s < DIVE_AIR) {
      if (!acted) { acted = true; vDive = dir * Math.max(PHYS.DIVE_MIN_SPEED, Math.max(0, v * dir) + PHYS.DIVE_IMPULSE); }
      y0 = PHYS.DIVE_HOP_V * s - 0.5 * PHYS.GRAVITY * s * s; h = 0.7; v = vDive;
    } else {
      if (kind === 2 && s >= DIVE_AIR && acted) { acted = false; slide = true; v = vDive + dir * PHYS.SLIDE_LAND_BOOST; }
      if (slide) { // deslizando até parar
        const a = Math.abs(v);
        if (a > PHYS.SLIDE_EXIT_SPEED) { h = 0.7; v -= Math.sign(v) * SLIDE_DEC * DODGE_DT; } else slide = false;
      } else if (dir !== null) { // correndo: acelera até a velocidade de corrida
        const tv = dir * PHYS.RUN_SPEED, dv = PHYS.GROUND_ACCEL * DODGE_DT;
        v = Math.abs(tv - v) <= dv ? tv : v + Math.sign(tv - v) * dv;
      }
    }
    for (let i = 0; i < nj; i++) {
      if (Math.abs(wrapAngle(ang - JA[i][n])) * r > lim) continue;
      const band = JLOW[i] ? map.LOW_BAND : map.HIGH_BAND;
      if (y0 + h >= band[0] - 0.1 && y0 <= band[1] + 0.15) return u;
    }
    ang += (v / r) * DODGE_DT;
  }
  return Infinity;
}

/** Decide a esquiva. `navDir` = sentido em que a navegação quer correr. Devolve true se assumiu o controle. */
function dodgeJets(bot, b, map, t, inp, r, th, rx, rz, tx, tz, radial, navDir, canDive) {
  const M = bot.mem;
  if (b.state !== 'ground' && b.state !== 'slide') return false;
  let P = M.dodge;
  if (P && (P.done || t > P.until)) P = M.dodge = null;
  if (t >= M.nextDodge && !(P && P.kind && t >= P.at - 0.05)) {
    M.nextDodge = t + 0.05;
    // jatos ativos que varrem este raio e suas posições futuras
    let nj = 0;
    for (const j of map.jets) {
      if (!jetCovers(map, j, t, r) && !jetCovers(map, j, t + DODGE_H, r)) continue;
      const row = JA[nj] || (JA[nj] = new Float64Array(DODGE_N));
      for (let n = 0; n < DODGE_N; n++) row[n] = map.jetAngle(j, t + n * DODGE_DT);
      JLOW[nj++] = j.low;
    }
    const vt = b.vx * tx + b.vz * tz;
    const sliding = b.state === 'slide';
    const base = nj ? scriptHit(map, nj, th, r, vt, navDir, 0, 0, sliding) : Infinity; // o que a navegação faria
    if (base === Infinity) { M.dodge = null; M.threat = false; return false; }
    if (!M.threat) { // ameaça nova: rolagem de atenção (desastrados às vezes não veem o jato chegando)
      M.threat = true;
      if (bot.rng() < M.jetFail) M.blindUntil = t + 1.8;
    }
    if (t < M.blindUntil) return false;
    // o roteiro em curso continua bom? então mantém (evita ficar trocando de ideia)
    const keep = P && !P.done && scriptHit(map, nj, th, r, vt, P.dir, P.kind, Math.max(0, P.at - t), sliding) === Infinity;
    // senão procura o roteiro mais barato que passa ileso (ou, se não houver, o que adia mais o impacto)
    let best = null, bestCost = Infinity, bestHit = base;
    if (keep) { best = P; P.until = t + DODGE_H; }
    const dirs = sliding ? [0] : navDir ? [navDir, -navDir, 0] : [0, 1, -1];
    for (const dir of keep ? [] : dirs) {
      const dc = dir === (sliding ? 0 : navDir) ? 0 : dir === 0 ? 0.4 : 1.6; // recuar custa mais que pular adiante
      for (let kind = 0; kind <= (canDive && !sliding ? 3 : 1); kind++) {
        if (kind >= 2 && dir === 0) continue;
        const step = kind >= 2 ? 0.15 : 0.1, max = kind === 0 ? 0 : kind >= 2 ? 0.6 : 0.9;
        for (let at = 0; at <= max + 1e-9; at += step) {
          let hit = scriptHit(map, nj, th, r, vt, dir, kind, at, sliding);
          // folga de tempo: o roteiro tem de funcionar mesmo agindo um pouco antes ou depois
          if (kind && hit === Infinity) hit = Math.min(scriptHit(map, nj, th, r, vt, dir, kind, Math.max(0, at - 0.09), sliding), scriptHit(map, nj, th, r, vt, dir, kind, at + 0.09, sliding));
          const cost = dc + (kind === 2 ? 2.5 : kind === 3 ? 3 : kind) + at * 0.2;
          if (hit === Infinity ? cost < bestCost : bestCost === Infinity && hit > bestHit) {
            best = { dir, kind, at: t + at, until: t + DODGE_H, done: false };
            if (hit === Infinity) bestCost = cost; else bestHit = hit;
          }
        }
      }
    }
    if (best && best !== P && best.kind) best.at += (bot.rng() - 0.5) * M.jitter; // erro de tempo
    P = M.dodge = best;
  }
  if (!P) return false;
  if (b.state === 'ground') {
    const k = P.dir;
    steer(inp, tx * k + rx * radial, tz * k + rz * radial, k ? 1 : Math.min(1, Math.abs(radial)));
  }
  if (P.kind && t >= P.at) {
    if (P.kind === 2) inp.dive = true; else inp.jump = true;
    if (P.kind === 3) { P.kind = 2; P.at = t + JUMP_T - 0.05; P.until = P.at + 0.5; } // mergulha assim que pousar
    else P.done = true;
  }
  return true;
}

/** Pódio (fim da final): os jatos do anel interno recolhem e passam a varrer o pódio. Não há espaço para
 *  deslizar, e pular correndo joga para fora; então o bot fica no meio do maior vão entre jatos e, quando
 *  o vão fecha, atravessa um jato BAIXO com um pulo curto em corda, pousando do outro lado. */
function thinkPodium(bot, b, map, t, inp, r, th, rx, rz, tx, tz) {
  const M = bot.mem, rho = M.rho;
  const radial = clamp((rho - r) * 1.2, -1, 1);
  if (M.pod) { // tomando impulso para atravessar um jato
    steer(inp, M.pod.x - b.x, M.pod.z - b.z);
    if (t >= M.pod.at) { inp.jump = true; M.hop = M.pod; M.pod = null; }
    return;
  }
  // jatos que varrem (ou estão prestes a varrer) o meu raio: vizinho de cada lado
  let aGap = Infinity, bGap = Infinity, ja = null, jb = null, n = 0; // a: lado theta crescente; b: decrescente
  for (const j of map.jets) {
    if (!jetCovers(map, j, t + 0.6, rho) && !jetCovers(map, j, t, r)) continue;
    n++;
    const d = wrapAngle(map.jetAngle(j, t) - th);
    const up = d >= 0 ? d : d + 2 * Math.PI, down = 2 * Math.PI - up;
    if (up < aGap) { aGap = up; ja = j; }
    if (down < bGap) { bGap = down; jb = j; }
  }
  if (!n) { inp.mx = rx * radial; inp.mz = rz * radial; return; }
  const gap = n === 1 ? 2 * Math.PI : aGap + bGap;
  if (gap < M.podGap && t >= M.blindUntil) {
    // vão fechando: escolhe um jato baixo para pular (de preferência o que chega mais rápido de frente)
    const pick = (j, side) => (j && j.low ? Math.abs(map.jetOmega(j, t)) + (map.jetOmega(j, t) * side < 0 ? 2 : 0) : -1);
    const sa = pick(ja, 1), sb = pick(jb, -1);
    const j = sa < 0 && sb < 0 ? null : sa >= sb ? ja : jb, side = j === ja ? 1 : -1;
    if (j) {
      if (bot.rng() < M.jetFail) { M.blindUntil = t + 0.5; return; } // hesitou
      const q = map.jetAngle(j, t + 0.45) + side * M.podOver; // pousa do outro lado do jato
      M.pod = { x: Math.cos(q) * rho, z: Math.sin(q) * rho, at: t + 0.1 + (bot.rng() - 0.5) * M.jitter };
      steer(inp, M.pod.x - b.x, M.pod.z - b.z);
      return;
    }
  }
  // caminha para o meio do vão
  const k = clamp(((aGap - bGap) / 2) * rho * 1.5, -1, 1);
  inp.mx = tx * k + rx * radial; inp.mz = tz * k + rz * radial;
  const l = Math.hypot(inp.mx, inp.mz);
  if (l > 1) { inp.mx /= l; inp.mz /= l; }
}

function thinkJets(bot, b, map, world, inp) {
  const M = bot.mem, t = world.t, rng = bot.rng;
  const segs = jetsNav(map);
  const r = Math.hypot(b.x, b.z) || 1e-6, th = Math.atan2(b.z, b.x);
  const rx = b.x / r, rz = b.z / r; // radial (para fora)
  const tx = -rz, tz = rx; // tangencial (theta crescente)

  if (!b.grounded) {
    if (M.hop) steerLanding(b, inp, M.hop.x, M.hop.z, airTime(b, map.FLOOR_Y));
    else {
      // pulo/mergulho de esquiva: mantém o rumo e corrige o raio para não sair do piso
      const sg = segs.find((q) => q.kind === 'ring' && q.id === M.ringId);
      const want = r < map.podium.r + 1 || !sg ? Math.min(M.rho, r) : sg.travelR + 0.5;
      const vr = b.vx * rx + b.vz * rz, vt = b.vx * tx + b.vz * tz;
      const k = clamp((want - (r + vr * 0.35)) * 0.8, -1, 1);
      if (b.state === 'dive') { const sgn = vt >= 0 ? 1 : -1; steer(inp, tx * sgn + rx * k, tz * sgn + rz * k); }
      else { inp.mx = rx * k; inp.mz = rz * k; }
    }
    return;
  }
  M.hop = null;
  const seg = segs.find((q) => r >= q.lo - 0.05 && r <= q.hi + 0.05);
  if (!seg) return;

  if (seg.kind === 'podium') { M.ringId = -1; thinkPodium(bot, b, map, t, inp, r, th, rx, rz, tx, tz); return; }

  if (seg.kind === 'grate') {
    // no meio da travessia: segue pela grade mais próxima
    let a = seg.angles[0];
    for (const q of seg.angles) if (Math.abs(wrapAngle(q - th)) < Math.abs(wrapAngle(a - th))) a = q;
    crossStep(M, map, inp, seg, a, r, th, rx, rz, tx, tz);
    return;
  }

  // ── sobre um anel ──
  if (M.ringId !== seg.id) {
    M.ringId = seg.id; M.cross = false;
    const order = [...seg.angles].sort((p, q) => Math.abs(wrapAngle(p - th)) - Math.abs(wrapAngle(q - th)));
    M.ang = order[rng() < M.wrongGrate ? 1 : 0]; // às vezes escolhe a grade mais longe
  }
  const radial = clamp((seg.travelR - r) * 0.8, -0.7, 0.7);
  const goT = seg.sinkAt - map.SINK_WARN + M.late[seg.id]; // hora de migrar
  const urgent = t > seg.sinkAt - 1.5; // o chão está indo embora: atravessa de qualquer jeito

  if (b.state === 'slide') {
    // deslizando (depois de mergulhar sob um jato): acompanha a curva do anel
    const sgn = b.vx * tx + b.vz * tz >= 0 ? 1 : -1;
    steer(inp, tx * sgn + rx * radial, tz * sgn + rz * radial);
  }
  const waitOff = t < goT - 2 ? M.off : 0; // até perto da hora, espera um pouco ao lado da grade
  const arc = wrapAngle(M.ang - th) * r + waitOff;
  const navDir = M.cross || Math.abs(arc) <= 0.5 ? 0 : Math.sign(arc);
  if (!M.cross && !urgent && dodgeJets(bot, b, map, t, inp, r, th, rx, rz, tx, tz, radial, navDir, true)) return;
  if (b.state === 'slide') return;

  // navegação: vai para o ângulo da grade e espera ali; na hora de migrar, aguarda uma janela e atravessa
  if (Math.abs(arc) > 1.2) M.cross = false;
  if (M.cross) { crossStep(M, map, inp, seg, M.ang, r, th, rx, rz, tx, tz); return; }
  if (Math.abs(arc) > 0.5) {
    const k = clamp(arc / 1.5, -1, 1);
    steer(inp, tx * k + rx * radial, tz * k + rz * radial, Math.min(1, Math.abs(k) + Math.abs(radial)) * (t > goT ? 1 : M.pace));
    return;
  }
  inp.mx = tx * clamp(arc, -0.4, 0.4) + rx * radial;
  inp.mz = tz * clamp(arc, -0.4, 0.4) + rz * radial;
  if (t >= goT && t >= M.nextWin) {
    M.nextWin = t + 0.1;
    if (urgent || crossingClear(map, seg, M.ang, t)) {
      M.cross = true;
      M.edge = 0.32 + (rng() - 0.6) * M.edgeErr;
    }
  }
}

/** Um passo da travessia: corre para dentro alinhado à grade e pula da borda mirando a próxima faixa. */
function crossStep(M, map, inp, seg, a, r, th, rx, rz, tx, tz) {
  const next = seg.next;
  const arc = wrapAngle(a - th) * r;
  const edgeDist = r - seg.lo;
  const L = next.hi - (next.kind === 'grate' ? 1.0 : next.kind === 'ring' ? 2.4 : 1.4); // raio de pouso
  const v = (seg.lo + 0.3 - L) / JUMP_T; // velocidade para o pulo cair no ponto certo
  const mag = edgeDist < 1.3 ? clamp(v / PHYS.RUN_SPEED, 0.35, 1) : 1;
  const k = clamp(arc * 1.5, -0.6, 0.6);
  if (seg.kind === 'ring' && Math.abs(arc) > 0.6 && edgeDist < 1.0) { // desalinhado: não se aproxima da borda
    inp.mx = tx * k; inp.mz = tz * k;
    return;
  }
  inp.mx = -rx * mag + tx * k; inp.mz = -rz * mag + tz * k;
  if (edgeDist <= M.edge) {
    inp.jump = true;
    M.hop = { x: Math.cos(a) * L, z: Math.sin(a) * L };
  }
}

const INIT = { slide: initSlide, arena: initArena, jets: initJets };
const THINK = { slide: thinkSlide, arena: thinkArena, jets: thinkJets };
