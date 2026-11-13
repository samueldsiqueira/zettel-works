// Mapa 3 — O Labirinto de Jatos (final, corrida até o pódio central).
// Anéis concêntricos separados por canais de água; travessia por grades; braços de jato giratórios.
// Ângulo polar: theta = atan2(z, x); x = r cos(theta), z = r sin(theta).
// Dados expostos para renderização: podium, rings, grates, jets, jetAngle(j, t), FLOOR_Y, LOW_BAND, HIGH_BAND.
import { PHYS, PLAYER } from '../constants.js';
import { makeRng, TAU, wrapAngle, clamp } from '../rng.js';

export const FLOOR_Y = 1.0; // água em y = 0
const podium = { r: 4, y: FLOOR_Y + 0.3 };
// do centro para fora; cp = índice de checkpoint ao pisar (0 = largada)
const rings = [
  { id: 0, r0: 13, r1: 19, cp: 2 },
  { id: 1, r0: 28, r1: 34, cp: 1 },
  { id: 2, r0: 43, r1: 50, cp: 0 },
];
const START_R = 47;

// grades de passagem: setores pequenos nos canais (2 por travessia)
const grates = [];
{
  const crossings = [
    { rs: [6.9, 10.1], angles: [0.4, 0.4 + Math.PI] },
    { rs: [21.9, 25.1], angles: [1.5, 1.5 + TAU / 3, 1.5 + (2 * TAU) / 3] },
    { rs: [36.9, 40.1], angles: [0.0, TAU / 4, TAU / 2, (3 * TAU) / 4] },
  ];
  let id = 0;
  for (const c of crossings) for (const a of c.angles) for (const r of c.rs) {
    grates.push({ id: id++, r, a: wrapAngle(a), halfR: 1.0, halfT: 1.15 }); // halfT em metros (tangencial)
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
        id: id++, r0: zn.r0, r1: zn.r1,
        low: i % 3 !== 2, // 2 baixos para cada alto
        a0: (i / zn.n) * TAU + rng() * 0.6 + (zi === 2 ? 0.5 : 0),
        w: zn.w * (i % 2 ? -1 : 1) * (0.85 + rng() * 0.3),
        wobA: 0.25 + rng() * 0.35, wobF: 0.25 + rng() * 0.3, wobP: rng() * TAU,
      });
    }
  });
}

/** Ângulo do jato em t (padrão pseudoaleatório determinístico). */
export function jetAngle(j, t) {
  return j.a0 + j.w * t + j.wobA * Math.sin(j.wobF * t + j.wobP);
}
function jetOmega(j, t) {
  return j.w + j.wobA * j.wobF * Math.cos(j.wobF * t + j.wobP);
}

function flat(out, y, surf) {
  out.y = y; out.nx = 0; out.ny = 1; out.nz = 0; out.vx = out.vy = out.vz = 0; out.surf = surf;
  return out;
}

export const jetsMap = {
  id: 'jets',
  name: 'O Labirinto de Jatos',
  mode: 'race',
  timeLimit: 210,
  killY: 0.1,
  waterY: 0,
  podium, rings, grates, jets, jetAngle, FLOOR_Y, LOW_BAND, HIGH_BAND, JET_RADIUS, START_R,

  spawn(i, n = 16) {
    const a = (i / n) * TAU + 0.35;
    return { x: Math.cos(a) * START_R, y: FLOOR_Y, z: Math.sin(a) * START_R, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) };
  },

  groundAt(x, z, yRef, t, out) {
    const lim = yRef + PHYS.STEP_UP;
    const r = Math.hypot(x, z);
    if (r <= podium.r) return podium.y <= lim ? flat(out, podium.y, 'normal') : null;
    if (FLOOR_Y > lim) return null;
    for (const rg of rings) if (r >= rg.r0 && r <= rg.r1) return flat(out, FLOOR_Y, 'normal');
    const th = Math.atan2(z, x);
    for (const g of grates) {
      if (Math.abs(r - g.r) > g.halfR) continue;
      if (Math.abs(wrapAngle(th - g.a)) * g.r > g.halfT) continue;
      return flat(out, FLOOR_Y, 'grate');
    }
    return null;
  },

  affect(b, world) {
    const r = Math.hypot(b.x, b.z);
    if (b.grounded) for (const rg of rings) if (r >= rg.r0 && r <= rg.r1 && rg.cp > b.cp) b.cp = rg.cp;
    if (b.hitCd > 0 || r < podium.r + 0.5) return;
    const th = Math.atan2(b.z, b.x);
    const y0 = b.y - FLOOR_Y;
    const y1 = y0 + (b.state === 'dive' || b.state === 'slide' ? PLAYER.LOW_HEIGHT : PLAYER.HEIGHT);
    for (const j of jets) {
      if (r < j.r0 - 0.3 || r > j.r1 + 0.3) continue;
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

  finished(b) { return Math.hypot(b.x, b.z) < podium.r - 0.3 && b.y >= podium.y - 0.05; },
  progress(b) { return clamp(1 - (Math.hypot(b.x, b.z) - podium.r) / (START_R - podium.r), 0, 1); },

  respawn(b) {
    const rg = rings.find((q) => q.cp === b.cp) || rings[2];
    const th = Math.atan2(b.z, b.x), rm = (rg.r0 + rg.r1) / 2;
    b.x = Math.cos(th) * rm; b.z = Math.sin(th) * rm; b.y = FLOOR_Y + 1.5;
    b.vx = b.vy = b.vz = 0; b.yaw = Math.atan2(-b.x, -b.z);
    b.state = 'air'; b.grounded = false; b.fell = false; b.stun = 0; b.hitCd = 1.5;
  },
};
