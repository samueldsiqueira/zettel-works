import { slideMap } from './slide.js';
import { arenaMap } from './arena.js';
import { jetsMap } from './jets.js';

// Sequência de fases: Tobogã -> Arena -> Labirinto (final)
export const MAPS = [slideMap, arenaMap, jetsMap];
export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m]));

/** `cap` da rodada.
 *  - corrida: vagas de qualificação = metade dos participantes (arredondando p/ cima);
 *  - sobrevivência: número de vivos que encerra a rodada antes do tempo (map.minAlive). */
export function qualifyCap(roundIndex, nPlayers) {
  const map = MAPS[roundIndex];
  if (map.mode === 'survival') return Math.min(map.minAlive, nPlayers);
  return Math.max(1, Math.ceil(nPlayers / 2));
}
