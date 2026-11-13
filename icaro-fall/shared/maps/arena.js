// Mapa 2 — A Arena de Sobrevivência.
// Plataforma central que encolhe + plataformas flutuantes que orbitam, balançam e submergem.
// Tudo é função determinística do tempo da rodada (t), então cliente e servidor concordam sem sincronizar objetos.
// Dados expostos para renderização: center, centerRadius(t), floats, floatState(f, t, out).
import { PHYS } from '../constants.js';
import { makeRng, TAU, clamp, smoothstep } from '../rng.js';

const TOP_Y = 1.0; // topo das plataformas acima da água (água em y = 0)
const center = { y: TOP_Y, r0: 14, shrinkStart: 15, shrinkEnd: 105 };

/** Raio da plataforma central no tempo t (0 = sumiu). */
export function centerRadius(t) {
  const k = clamp((t - center.shrinkStart) / (center.shrinkEnd - center.shrinkStart), 0, 1);
  const r = center.r0 * (1 - k);
  return r < 1.2 ? 0 : r;
}

const floats = [];
{
  const rng = makeRng(77123);
  const rings = [
    { rho: 19.5, n: 6, w: 0.16, r: 3.1 },
    { rho: 27.5, n: 8, w: -0.12, r: 2.8 },
    { rho: 35.5, n: 9, w: 0.09, r: 2.9 },
  ];
  let id = 0;
  for (const rg of rings) {
    for (let i = 0; i < rg.n; i++) {
      floats.push({
        id: id++,
        rho: rg.rho, w: rg.w, a0: (i / rg.n) * TAU + rng() * 0.3,
        r: rg.r - rng() * 0.4,
        period: 13 + rng() * 8, phase: rng() * 20,
        tiltA: 0.07 + rng() * 0.07, tiltF: 0.7 + rng() * 0.8, tiltP: rng() * TAU,
        bobP: rng() * TAU,
      });
    }
  }
}

const SINK_T = 1.2; // s para afundar / emergir
export const WARN_T = 2.0; // s de aviso (telegrafia) antes de afundar

/** Estado de uma plataforma flutuante em t.
 *  out = { x, y, z, nx, ny, nz, vx, vz, sink (0..1 submersa), warn (0..1 aviso), solid } */
export function floatState(f, t, out = {}) {
  const a = f.a0 + f.w * t;
  const ca = Math.cos(a), sa = Math.sin(a);
  out.x = f.rho * ca; out.z = f.rho * sa;
  out.vx = -f.rho * f.w * sa; out.vz = f.rho * f.w * ca;
  // ciclo de submersão: o tempo submerso cresce ao longo da rodada
  const tt = Math.max(0, t);
  const down = 2.5 + 6 * clamp(tt / 170, 0, 1); // s submersa por ciclo
  const ph = (((tt + f.phase) % f.period) + f.period) % f.period;
  const startDown = f.period - down - SINK_T;
  let sink = 0;
  if (tt > 8) { // carência no início
    if (ph >= startDown) sink = Math.min(1, smoothstep(0, SINK_T, ph - startDown), smoothstep(0, SINK_T, f.period - ph));
    out.warn = ph >= startDown - WARN_T && ph < startDown ? (ph - (startDown - WARN_T)) / WARN_T : 0;
  } else out.warn = 0;
  out.sink = sink;
  const warnShake = out.warn > 0 ? 0.05 * Math.sin(tt * 30) : 0;
  out.y = TOP_Y - 0.1 + 0.12 * Math.sin(tt * 1.3 + f.bobP) - sink * 2.2;
  const tx = f.tiltA * Math.sin(tt * f.tiltF + f.tiltP) + warnShake;
  const tz = f.tiltA * Math.cos(tt * f.tiltF * 0.83 + f.tiltP);
  const l = Math.hypot(tx, 1, tz);
  out.nx = tx / l; out.ny = 1 / l; out.nz = tz / l;
  out.solid = out.y > 0.25;
  return out;
}

const FS = {};

export const arenaMap = {
  id: 'arena',
  name: 'A Arena de Sobrevivência',
  mode: 'survival',
  timeLimit: 180,
  killY: -0.5,
  waterY: 0,
  center, centerRadius, floats, floatState, TOP_Y, WARN_T,

  spawn(i, n = 16) {
    const a = (i / n) * TAU, r = 8.5;
    return { x: Math.cos(a) * r, y: TOP_Y, z: Math.sin(a) * r, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) };
  },

  groundAt(x, z, yRef, t, out) {
    const lim = yRef + PHYS.STEP_UP;
    let found = false, best = -Infinity;
    const R = centerRadius(t);
    if (R > 0 && x * x + z * z <= R * R && TOP_Y <= lim) {
      best = TOP_Y; found = true;
      out.nx = 0; out.ny = 1; out.nz = 0; out.vx = out.vy = out.vz = 0; out.surf = 'normal';
    }
    const rr = x * x + z * z;
    if (rr > 14 * 14) {
      for (const f of floats) {
        const rmin = f.rho - f.r, rmax = f.rho + f.r;
        if (rr < rmin * rmin || rr > rmax * rmax) continue;
        const s = floatState(f, t, FS);
        if (!s.solid) continue;
        const dx = x - s.x, dz = z - s.z;
        if (dx * dx + dz * dz > f.r * f.r) continue;
        const h = s.y - (s.nx * dx + s.nz * dz) / s.ny;
        if (h > lim || h <= best) continue;
        best = h; found = true;
        out.nx = s.nx; out.ny = s.ny; out.nz = s.nz;
        out.vx = s.vx; out.vy = 0; out.vz = s.vz; out.surf = 'normal';
      }
    }
    if (!found) return null;
    out.y = best;
    return out;
  },

  affect() {},
  finished() { return false; },
  progress() { return 0; },
  respawn(b) { b.fell = true; },
};
