// Protocolo WebSocket (JSON). Servidor = autoridade sobre a partida (lobby, relógio,
// qualificação, eliminação). Cada cliente simula o próprio personagem e reporta o estado.
//
// ── Cliente -> Servidor ───────────────────────────────────────────────────────
//  { t:'join', name, char }            char: 'icaro' | 'penguin'
//  { t:'start' }                       qualquer jogador no lobby; servidor completa com bots até MAX_PLAYERS
//  { t:'s', p:[x,y,z,vx,vy,vz,yaw], st, f }   estado próprio @ NET_HZ; st = índice em STATES; f = flags (FLAG.STUN)
//  { t:'pop', id }                     estourou a boia `id` (mapa 1)
//  { t:'ping', c }                     c = performance.now() do cliente
//
// ── Servidor -> Cliente ───────────────────────────────────────────────────────
//  { t:'welcome', id, now }            id do jogador; now = relógio do servidor (ms)
//  { t:'pong', c, now }
//  { t:'lobby', players:[PlayerInfo] } estado do lobby (também enviado ao voltar de uma partida)
//  { t:'round', round, mapId, cap, timeLimit, startAt, players:[PlayerInfo & {spawn:{x,y,z,yaw}}] }
//        round: 0..2 ; startAt = relógio do servidor (ms) em que t=0 (largada). Antes disso: contagem regressiva.
//        players = apenas os participantes desta rodada; os demais clientes assistem.
//  { t:'snap', time, p:[[id,x,y,z,vx,vy,vz,yaw,st,f], ...] }   @ NET_HZ; time = tempo da rodada (s)
//        f: FLAG.STUN | FLAG.QUALIFIED | FLAG.ELIMINATED
//  { t:'pop', id, by }                 boia estourada (by = id do jogador)
//  { t:'status', id, status, place }   status: 'qualified' | 'eliminated'; place = colocação (1 = primeiro)
//  { t:'roundEnd', round, results:[{id,name,status,place}], final, nextIn }
//        final=true se foi a última rodada; nextIn = ms até a próxima rodada / tela do vencedor
//  { t:'gameEnd', winnerId, podium:[{id,name,char,color,place}], lobbyIn }   lobbyIn = ms até voltar ao lobby
//  { t:'error', msg }
//
// PlayerInfo = { id, name, char, color, bot }   color = índice 0..15 na paleta de jogadores
//
// Regras de resultado (servidor), a partir do estado reportado / simulado:
//  - corrida ('race'): map.finished(body) => 'qualified' até encher `cap`; rodada acaba quando as vagas
//    enchem ou em timeLimit (quem não chegou: 'eliminated'). Na final, cap = 1 (vencedor); se o tempo acabar
//    sem vencedor, vence o maior map.progress(body).
//  - sobrevivência ('survival'): y < map.killY => 'eliminated'; rodada acaba quando vivos <= cap ou em
//    timeLimit (se sobrarem mais que `cap`, desempate por maior distância percorrida).
//  - desconexão durante a rodada => 'eliminated'.

export const DEFAULT_PORT = 3001;
export const WS_PATH = '/ws';

export const encode = (m) => JSON.stringify(m);
export function decode(raw) {
  try { return JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch { return null; }
}
