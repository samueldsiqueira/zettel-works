// Mapa 1 — O Tobogã Radical (corrida).
// Pista em meia-cana serpenteando ladeira abaixo ao longo de -Z.
// Dados expostos para renderização: samples, HALF_W, CURVE, startPlatform, pads, buoys, finishS, totalS.
import { PHYS } from '../constants.js';
import { makeRng, smoothstep, clamp } from '../rng.js';

const N = 640; // amostras da linha central
const Z_END = -560;
const AMP = 40, K = (Math.PI * 2) / 220;
export const HALF_W = 5; // meia largura da pista
export const CURVE = 0.06; // seção em U: y = yc + CURVE * d²

// perfil de inclinação por trecho de comprimento de arco: [até s, dy/ds]
const PROFILE = [
  [60, -0.30], [170, -0.16], [215, 0.0], [320, -0.20], [350, 0.05],
  [470, -0.18], [515, 0.0], [650, -0.20], [1e9, 0.0],
];
function slopeAt(s) {
  for (const [end, k] of PROFILE) if (s < end) return k;
  return 0;
}

// samples[i] = { x, y, z, s, tx, tz }  (tx,tz = tangente horizontal unitária)
const samples = [];
{
  let s = 0, px = 0, pz = 0;
  for (let i = 0; i < N; i++) {
    const z = (Z_END * i) / (N - 1);
    const x = AMP * Math.sin(K * z) * smoothstep(0, 80, -z);
    if (i > 0) s += Math.hypot(x - px, z - pz);
    samples.push({ x, y: 0, z, s, tx: 0, tz: -1 });
    px = x; pz = z;
  }
  // altura: integra a inclinação suavizada
  const raw = samples.map((p) => slopeAt(p.s));
  const R = 10;
  let y = 0;
  for (let i = 1; i < N; i++) {
    let acc = 0, n = 0;
    for (let j = Math.max(0, i - R); j <= Math.min(N - 1, i + R); j++) { acc += raw[j]; n++; }
    y += (acc / n) * (samples[i].s - samples[i - 1].s);
    samples[i].y = y;
  }
  const yEnd = samples[N - 1].y;
  for (const p of samples) p.y -= yEnd; // fim da pista em y = 0
  for (let i = 0; i < N; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(N - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    samples[i].tx = (b.x - a.x) / l; samples[i].tz = (b.z - a.z) / l;
  }
}
const totalS = samples[N - 1].s;
const finishS = totalS - 28;

// plataforma de largada (plana), atrás do início da pista
const startPlatform = { x0: -7, x1: 7, z0: -1, z1: 16, y: samples[0].y + 1.5 };

const TC = { s: 0, d: 0, y: 0, tx: 0, tz: -1, i: 0 };
/** Coordenadas de pista do ponto (x,z): s (arco), d (lateral, + = direita da tangente), y central. */
export function trackCoords(x, z, out = TC) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < N; i += 8) {
    const p = samples[i], dd = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (dd < bd) { bd = dd; bi = i; }
  }
  const lo = Math.max(0, bi - 8), hi = Math.min(N - 1, bi + 8);
  for (let i = lo; i <= hi; i++) {
    const p = samples[i], dd = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (dd < bd) { bd = dd; bi = i; }
  }
  // projeta no segmento vizinho mais adequado
  let i0 = bi;
  if (bi > 0) {
    const p = samples[bi];
    if ((x - p.x) * p.tx + (z - p.z) * p.tz < 0) i0 = bi - 1;
  }
  if (i0 >= N - 1) i0 = N - 2;
  const a = samples[i0], b = samples[i0 + 1];
  const ex = b.x - a.x, ez = b.z - a.z, el2 = ex * ex + ez * ez;
  const u = ((x - a.x) * ex + (z - a.z) * ez) / el2; // pode sair de [0,1] nas pontas
  const uc = clamp(u, 0, 1);
  const el = Math.sqrt(el2);
  out.s = a.s + u * (b.s - a.s);
  out.y = a.y + uc * (b.y - a.y);
  out.tx = ex / el; out.tz = ez / el;
  // lateral: tangente (tx,tz) -> direita = (-tz, tx)... usamos d = cross
  out.d = (x - a.x) * -out.tz + (z - a.z) * out.tx;
  out.i = i0;
  return out;
}

/** Ponto de mundo a partir de (s, d). */
export function trackPoint(s, d = 0) {
  s = clamp(s, 0, totalS);
  let lo = 0, hi = N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].s <= s) lo = m; else hi = m; }
  const a = samples[lo], b = samples[hi];
  const u = (s - a.s) / (b.s - a.s || 1);
  const tx = a.tx + u * (b.tx - a.tx), tz = a.tz + u * (b.tz - a.tz);
  const tl = Math.hypot(tx, tz);
  const nx = -tz / tl, nz = tx / tl;
  return {
    x: a.x + u * (b.x - a.x) + nx * d,
    y: a.y + u * (b.y - a.y) + CURVE * d * d,
    z: a.z + u * (b.z - a.z) + nz * d,
    tx: tx / tl, tz: tz / tl,
  };
}

function trackHeight(x, z) {
  const c = trackCoords(x, z);
  if (c.s < -0.5 || c.s > totalS + 0.5 || Math.abs(c.d) > HALF_W + 1) return -Infinity;
  return c.y + CURVE * c.d * c.d;
}

// Aceleradores (setas no chão) e boias
const pads = [];
const buoys = [];
{
  const rng = makeRng(20240611);
  const padS = [75, 120, 185, 235, 290, 335, 380, 440, 492, 540, 600, 640];
  padS.forEach((s, id) => {
    const d = (id % 3 - 1) * 2.6;
    const p = trackPoint(s, d);
    pads.push({ id, s, d, r: 1.7, x: p.x, y: p.y, z: p.z, tx: p.tx, tz: p.tz });
  });
  let id = 0;
  for (let s = 55; s < finishS - 25; s += 11 + rng() * 9) {
    const d = (rng() * 2 - 1) * 3.6;
    if (pads.some((p) => Math.abs(p.s - s) < 7 && Math.abs(p.d - d) < 2.6)) continue;
    const p = trackPoint(s, d);
    buoys.push({ id: id++, s, d, r: 0.9, animal: Math.floor(rng() * 3), x: p.x, y: p.y + 0.5, z: p.z });
  }
}

const TMP = { s: 0, d: 0, y: 0, tx: 0, tz: -1, i: 0 };

export const slideMap = {
  id: 'slide',
  name: 'O Tobogã Radical',
  mode: 'race',
  timeLimit: 180,
  killY: -30,
  waterY: -1.5,
  // dados para renderização / bots
  samples, HALF_W, CURVE, startPlatform, pads, buoys, finishS, totalS,
  trackCoords, trackPoint,

  spawn(i) {
    const col = i % 4, row = Math.floor(i / 4) % 4;
    return { x: -4.5 + col * 3, y: startPlatform.y, z: 3 + row * 3, yaw: Math.PI };
  },

  groundAt(x, z, yRef, t, out) {
    const lim = yRef + PHYS.STEP_UP;
    const sp = startPlatform;
    let h = -Infinity, onTrack = false;
    if (x >= sp.x0 && x <= sp.x1 && z >= sp.z0 && z <= sp.z1 && sp.y <= lim) h = sp.y;
    const th = trackHeight(x, z);
    if (th > h && th <= lim) { h = th; onTrack = true; }
    if (h === -Infinity) return null;
    out.y = h; out.vx = out.vy = out.vz = 0;
    if (onTrack) {
      const e = 0.3;
      const hx = trackHeight(x + e, z), hz = trackHeight(x, z + e);
      let nx = hx === -Infinity ? 0 : -(hx - h) / e, nz = hz === -Infinity ? 0 : -(hz - h) / e;
      const l = Math.hypot(nx, 1, nz);
      out.nx = nx / l; out.ny = 1 / l; out.nz = nz / l;
      out.surf = 'water';
    } else {
      out.nx = 0; out.ny = 1; out.nz = 0; out.surf = 'normal';
    }
    return out;
  },

  affect(b, world) {
    const c = trackCoords(b.x, b.z, TMP);
    b.s = c.s; b.d = c.d;
    const onPlatform = b.z > 0 && b.y > startPlatform.y - 0.6;
    if (!onPlatform && c.s >= 0) {
      // paredes laterais
      const lim = HALF_W - 0.1;
      if (Math.abs(c.d) > lim) {
        const nx = -c.tz, nz = c.tx; // lateral unitária (d crescente)
        const over = Math.abs(c.d) - lim, sg = Math.sign(c.d);
        b.x -= nx * over * sg; b.z -= nz * over * sg;
        const vl = b.vx * nx + b.vz * nz;
        if (vl * sg > 0) { b.vx -= nx * vl * 1.3; b.vz -= nz * vl * 1.3; }
        b.d = lim * sg;
      }
      // fim da pista
      if (c.s > totalS - 0.6) {
        const o = c.s - (totalS - 0.6);
        b.x -= c.tx * o; b.z -= c.tz * o;
        const vt = b.vx * c.tx + b.vz * c.tz;
        if (vt > 0) { b.vx -= c.tx * vt; b.vz -= c.tz * vt; }
      }
    }
    // aceleradores
    if (b.grounded) {
      for (const p of pads) {
        if (Math.abs(p.s - c.s) > 3) continue;
        const dx = b.x - p.x, dz = b.z - p.z;
        if (dx * dx + dz * dz > p.r * p.r) continue;
        if (b.padId === p.id && world.t - b.padT < 1.0) continue;
        b.padId = p.id; b.padT = world.t;
        let sp = Math.hypot(b.vx, b.vz), dirx = p.tx, dirz = p.tz;
        if (sp > 4) { dirx = b.vx / sp * 0.5 + p.tx * 0.5; dirz = b.vz / sp * 0.5 + p.tz * 0.5; const l = Math.hypot(dirx, dirz) || 1; dirx /= l; dirz /= l; }
        sp = Math.min(Math.max(sp * PHYS.BOOST_MULT, PHYS.BOOST_MIN), PHYS.MAX_SPEED);
        b.vx = dirx * sp; b.vz = dirz * sp;
        if (b.state !== 'slide') { b.state = 'slide'; b.stateTime = 0; }
        world.events.push({ type: 'boost', id: p.id });
      }
    }
    // boias
    for (const q of buoys) {
      if (Math.abs(q.s - c.s) > 3 || world.popped.has(q.id)) continue;
      const dx = b.x - q.x, dy = b.y + 0.5 - q.y, dz = b.z - q.z;
      if (dx * dx + dy * dy + dz * dz > (q.r + 0.45) * (q.r + 0.45)) continue;
      world.popped.add(q.id);
      b.vx *= PHYS.BUOY_SLOW; b.vz *= PHYS.BUOY_SLOW;
      world.events.push({ type: 'pop', id: q.id });
    }
  },

  finished(b) { return b.s >= finishS && b.z < -20; },
  progress(b) { return clamp(b.s / finishS, 0, 1); },

  respawn(b) {
    const p = trackPoint(clamp(b.s, 2, totalS - 2), 0);
    b.x = p.x; b.y = p.y + 1; b.z = p.z;
    b.vx = b.vy = b.vz = 0; b.yaw = Math.atan2(p.tx, p.tz);
    b.state = 'air'; b.grounded = false; b.fell = false;
  },
};
