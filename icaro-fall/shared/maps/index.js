import { slideMap } from './slide.js';
import { arenaMap } from './arena.js';
import { jetsMap } from './jets.js';

// Sequência de fases: Tobogã -> Arena -> Labirinto (final)
export const MAPS = [slideMap, arenaMap, jetsMap];
export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m]));

/** Vagas de qualificação da rodada: metade (arredondando p/ cima); a final tem 1 vencedor. */
export function qualifyCap(roundIndex, nPlayers) {
  if (roundIndex >= MAPS.length - 1) return 1;
  return Math.max(1, Math.ceil(nPlayers / 2));
}
