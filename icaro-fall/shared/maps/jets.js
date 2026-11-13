// Mapa 3 — O Labirinto de Jatos (final, sobrevivência: último de pé vence).
// Anéis concêntricos separados por canais de água; travessia por grades; braços de jato giratórios
// que empurram os jogadores para a água. Os anéis afundam de fora para dentro (ringState), forçando
// a travessia pelas grades até o pódio central; os jatos aceleram com o tempo.
// Ângulo polar: theta = atan2(z, x); x = r cos(theta), z = r sin(theta).
// Dados expostos para renderização: podium, rings, grates, jets, jetAngle(j, t), jetSpan(j, t, out),
// ringState(ringId, t, out), FLOOR_Y, LOW_BAND, HIGH_BAND, JET_RADIUS, SINK_WARN, SINK_TIME.
import { PHYS, PLAYER } from '../constants.js';
import { makeRng, TAU, wrapAngle, clamp, smoothstep } from '../rng.js';

export const FLOOR_Y = 1.0; // água em y = 0
const podium = { r: 4, y: FLOOR_Y };
// do centro para fora; sinkAt = instante (s) em que o anel começa a afundar
const rings = [
  { id: 0, r0: 13, r1: 19, sinkAt: 150 },
  { id: 1, r0: 28, r1: 34, sinkAt: 100 },
  { id: 2, r0: 43, r1: 50, sinkAt: 50 },
];
const START_R = 47;
export const SINK_WARN = 8; // s de aviso antes de afundar
export const SINK_TIME = 4; // s para afundar por completo
const SINK_DEPTH = 2.5;

const RS = { drop: 0, warn: 0, gone: false };
/** Estado de afundamento de um anel (e das grades ligadas a ele).
 *  out = { drop (m abaixo de FLOOR_Y), warn (0..1 aviso), gone (totalmente submerso) } */
export function ringState(ringId, t, out = {}) {
  const at = rings[ringId].sinkAt;
  out.warn = t >= at - SINK_WARN && t < at ? (t - (at - SINK_WARN)) / SINK_WARN : 0;
  out.drop = t <= at ? 0 : smoothstep(0, SINK_TIME, t - at) * SINK_DEPTH;
  out.gone = t >= at + SINK_TIME;
  return out;
}

// grades de passagem: setores pequenos nos canais (2 por travessia)
const grates = [];
{
  const crossings = [
    { ring: 0, rs: [6.9, 10.1], angles: [0.4, 0.4 + Math.PI] },
    { ring: 1, rs: [21.9, 25.1], angles: [1.5, 1.5 + TAU / 3, 1.5 + (2 * TAU) / 3] },
    { ring: 2, rs: [36.9, 40.1], angles: [0.0, TAU / 4, TAU / 2, (3 * TAU) / 4] },
  ];
  let id = 0;
  for (const c of crossings) for (const a of c.angles) for (const r of c.rs) {
    grates.push({ id: id++, ring: c.ring, r, a: wrapAngle(a), halfR: 1.0, halfT: 1.15 }); // halfT em metros (tangencial); afunda junto com o anel `ring` (o de fora)
  }
}

// jatos: braços que giram em torno do centro cobrindo [r0, r1]
export const LOW_BAND = [0, 0.75]; // altura relativa ao piso — pule por cima
export const HIGH_BAND = [1.0, 2.6]; // passe por baixo deslizando / mergulhando
export const JET_RADIUS = 0.35;
const jets = [];
{
  const rng = makeRng(990017);
  const zones = [
    { r0: 8.6, r1: 19, w: 0.42, n: 3 },
    { r0: 23.6, r1: 34, w: 0.30, n: 3 },
    { r0: 38.6, r1: 50, w: 0.21, n: 4 },
  ];
  let id = 0;
  zones.forEach((zn, zi) => {
    for (let i = 0; i < zn.n; i++) {
      jets.push({
        id: id++, ring: zi, r0: zn.r0, r1: zn.r1,
        low: i % 3 !== 2, // 2 baixos para cada alto
        a0: (i / zn.n) * TAU + rng() * 0.6 + (zi === 2 ? 0.5 : 0),
        w: zn.w * (i % 2 ? -1 : 1) * (0.85 + rng() * 0.3),
        wobA: 0.25 + rng() * 0.35, wobF: 0.25 + rng() * 0.3, wobP: rng() * TAU,
      });
    }
  });
}

const ACCEL = 0.0025; // os jatos aceleram: fator de velocidade = 1 + 2*ACCEL*t (~2x aos 200 s)
/** Ângulo do jato em t (padrão pseudoaleatório determinístico). */
export function jetAngle(j, t) {
  const tt = Math.max(0, t);
  return j.a0 + j.w * (tt + ACCEL * tt * tt) + j.wobA * Math.sin(j.wobF * tt + j.wobP);
}
/** Velocidade angular instantânea do jato (rad/s). */
export function jetOmega(j, t) {
  const tt = Math.max(0, t);
  return j.w * (1 + 2 * ACCEL * tt) + j.wobA * j.wobF * Math.cos(j.wobF * tt + j.wobP);
}
const JS = { r0: 0, r1: 0, on: true };
/** Alcance radial do jato em t. out = { r0, r1, on }.
 *  O jato desliga quando o anel dele afunda; os do anel interno recolhem para varrer o pódio no final. */
export function jetSpan(j, t, out = {}) {
  const at = rings[j.ring].sinkAt;
  if (j.ring === 0) {
    const k = smoothstep(0, SINK_TIME, t - at);
    out.r0 = j.r0 + (0.8 - j.r0) * k; out.r1 = j.r1 + (podium.r + 0.5 - j.r1) * k; out.on = true;
  } else {
    out.r0 = j.r0; out.r1 = j.r1; out.on = t < at + SINK_TIME * 0.5;
  }
  return out;
}

function flat(out, y, surf) {
  out.y = y; out.nx = 0; out.ny = 1; out.nz = 0; out.vx = out.vy = out.vz = 0; out.surf = surf;
  return out;
}

export const jetsMap = {
  id: 'jets',
  name: 'O Labirinto de Jatos',
  mode: 'survival',
  minAlive: 1, // final: último de pé vence
  timeLimit: 210,
  killY: 0.1,
  waterY: 0,
  podium, rings, grates, jets, jetAngle, jetOmega, jetSpan, ringState,
  FLOOR_Y, LOW_BAND, HIGH_BAND, JET_RADIUS, START_R, SINK_WARN, SINK_TIME,

  spawn(i, n = 16) {
    const a = (i / n) * TAU + 0.35;
    return { x: Math.cos(a) * START_R, y: FLOOR_Y, z: Math.sin(a) * START_R, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) };
  },

  groundAt(x, z, yRef, t, out) {
    const lim = yRef + PHYS.STEP_UP;
    const r = Math.hypot(x, z);
    if (r <= podium.r) return podium.y <= lim ? flat(out, podium.y, 'normal') : null;
    for (const rg of rings) {
      if (r < rg.r0 || r > rg.r1) continue;
      const y = FLOOR_Y - ringState(rg.id, t, RS).drop;
      return y <= lim ? flat(out, y, 'normal') : null;
    }
    const th = Math.atan2(z, x);
    for (const g of grates) {
      if (Math.abs(r - g.r) > g.halfR) continue;
      if (Math.abs(wrapAngle(th - g.a)) * g.r > g.halfT) continue;
      const y = FLOOR_Y - ringState(g.ring, t, RS).drop;
      return y <= lim ? flat(out, y, 'grate') : null;
    }
    return null;
  },

  affect(b, world) {
    if (b.hitCd > 0) return;
    const r = Math.hypot(b.x, b.z);
    if (r < 0.3) return;
    const th = Math.atan2(b.z, b.x);
    const y0 = b.y - FLOOR_Y;
    const y1 = y0 + (b.state === 'dive' || b.state === 'slide' ? PLAYER.LOW_HEIGHT : PLAYER.HEIGHT);
    for (const j of jets) {
      const sp = jetSpan(j, world.t, JS);
      if (!sp.on || r < sp.r0 - 0.3 || r > sp.r1 + 0.3) continue;
      const band = j.low ? LOW_BAND : HIGH_BAND;
      if (y1 < band[0] || y0 > band[1]) continue;
      const da = wrapAngle(th - jetAngle(j, world.t));
      if (Math.abs(da) * r > JET_RADIUS + PLAYER.RADIUS) continue;
      // atingido: empurrado na direção do giro + para fora
      const sg = Math.sign(jetOmega(j, world.t)) || 1;
      const rx = b.x / r, rz = b.z / r; // radial
      const tx = -rz * sg, tz = rx * sg; // tangencial no sentido do giro
      b.vx = tx * 8 + rx * 6.5; b.vz = tz * 8 + rz * 6.5; b.vy = 6.5;
      b.grounded = false; b.jumps = 2;
      b.state = 'air'; b.stateTime = 0;
      b.stun = 0.7; b.hitCd = 1.2; b.hits++;
      world.events.push({ type: 'hit', id: j.id });
      break;
    }
  },

  finished() { return false; },
  /** Proximidade do centro (0..1) — desempate se o tempo acabar com mais de um de pé. */
  progress(b) { return clamp(1 - (Math.hypot(b.x, b.z) - podium.r) / (START_R - podium.r), 0, 1); },
  respawn(b) { b.fell = true; },
};
