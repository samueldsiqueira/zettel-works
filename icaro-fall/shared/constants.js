// Constantes compartilhadas entre cliente e servidor (sem dependências).

export const TICK = 1 / 60; // passo fixo da simulação (s)
export const NET_HZ = 20; // envio de estado / snapshots por segundo
export const MAX_PLAYERS = 16;
export const COUNTDOWN_S = 3; // contagem 3-2-1 antes de t=0

export const PLAYER = {
  RADIUS: 0.4,
  HEIGHT: 1.6, // em pé
  LOW_HEIGHT: 0.7, // mergulhando / deslizando
};

export const PHYS = {
  GRAVITY: 26,
  RUN_SPEED: 7,
  GROUND_ACCEL: 50,
  AIR_ACCEL: 14,
  JUMP_V: 9.5,
  DJUMP_V: 7.5, // impulso vertical do pulo duplo (entra em mergulho)
  DIVE_HOP_V: 5, // mergulho iniciado do chão (tecla dedicada)
  DIVE_IMPULSE: 5, // ganho de velocidade horizontal ao mergulhar
  DIVE_MIN_SPEED: 11, // velocidade horizontal mínima ao mergulhar
  DIVE_CAP: 20, // o mergulho sozinho não acelera além disto
  DIVE_TURN: 1.0, // rad/s de direção no ar durante mergulho
  SLIDE_LAND_BOOST: 3, // "impulso inicial" ao tocar o chão de barriga
  SLIDE_TURN: 2.2, // rad/s de direção durante o deslize
  SLIDE_EXIT_SPEED: 2.5, // abaixo disto o personagem levanta e volta a andar
  SLIDE_DRAG: 0.0083, // arrasto quadrático (v²)
  FRICTION: { normal: 0.3, grate: 0.3, water: 0.02 }, // atrito do deslize por superfície
  SLIP_SPEED: 10, // deriva (m/s por unidade de inclinação) andando em piso inclinado
  MAX_SPEED: 36,
  BOOST_MULT: 1.5, // aceleradores: +50%
  BOOST_MIN: 12,
  BUOY_SLOW: 0.45, // fator de velocidade ao estourar uma boia
  STEP_UP: 0.5,
  STEP_DOWN: 0.3,
  TURN_RATE: 14, // rad/s de giro do corpo andando
};

// Estados do personagem (índice = código de rede)
export const STATES = ['ground', 'air', 'dive', 'slide'];

export const CHARACTERS = ['icaro', 'penguin'];

// Flags de rede (bitmask)
export const FLAG = { STUN: 1, QUALIFIED: 2, ELIMINATED: 4 };
