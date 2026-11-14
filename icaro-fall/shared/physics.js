// Controlador de personagem determinístico, usado pelo cliente (jogador local)
// e pelo servidor (bots). Sem dependências de renderização.
//
// Convenções: Y para cima, metros, segundos. yaw=0 olha para +Z;
// direção de frente = (sin(yaw), cos(yaw)).
//
// Contrato do mapa (ver shared/maps/*.js):
//   map.groundAt(x, z, yRef, t, out) -> out | null
//       out = { y, nx, ny, nz, vx, vy, vz, surf }  (superfície mais alta com y <= yRef + STEP_UP)
//   map.affect(body, world, dt)   // boosts, boias, jatos, paredes (muta body, empilha world.events)
//   map.killY                     // abaixo disto body.fell = true
import { PHYS, PLAYER } from './constants.js';

const G = { y: 0, nx: 0, ny: 1, nz: 0, vx: 0, vy: 0, vz: 0, surf: 'normal' };

export function createBody() {
  return {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    yaw: 0,
    state: 'air', // 'ground' | 'air' | 'dive' | 'slide'
    stateTime: 0,
    grounded: false,
    jumps: 0, // pulos usados desde o último contato com o chão
    surf: 'normal',
    stun: 0, // s restantes sem controle (atingido por jato)
    hitCd: 0,
    padId: -1, padT: -9,
    cp: 0, // checkpoint (uso do mapa)
    s: 0, d: 0, // coordenadas de pista (uso do mapa 1)
    dist: 0, // distância horizontal percorrida na rodada
    hits: 0,
    fell: false,
  };
}

export function createInput() {
  // mx,mz: direção desejada em espaço de mundo (|m| <= 1). jump/dive: borda de pressionamento (true só no tick do aperto).
  return { mx: 0, mz: 0, jump: false, dive: false };
}

export function createWorld() {
  return { t: 0, popped: new Set(), events: [] };
}

export function placeBody(b, sp) {
  b.x = sp.x; b.y = sp.y; b.z = sp.z; b.yaw = sp.yaw || 0;
  b.vx = b.vy = b.vz = 0;
  b.state = 'air'; b.stateTime = 0; b.grounded = false; b.jumps = 0;
  b.stun = 0; b.hitCd = 0; b.fell = false;
}

export function bodyHeight(b) {
  return b.state === 'dive' || b.state === 'slide' ? PLAYER.LOW_HEIGHT : PLAYER.HEIGHT;
}

export function hSpeed(b) {
  return Math.hypot(b.vx, b.vz);
}

function setState(b, s) {
  if (b.state !== s) { b.state = s; b.stateTime = 0; }
}

function turnToward(cur, target, maxStep) {
  let d = target - cur;
  d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  if (d > maxStep) d = maxStep; else if (d < -maxStep) d = -maxStep;
  return cur + d;
}

function startDive(b, mx, mz, vy, world) {
  const il = Math.hypot(mx, mz);
  let dx, dz;
  const sp = hSpeed(b);
  if (il > 0.1) { dx = mx / il; dz = mz / il; }
  else if (sp > 1) { dx = b.vx / sp; dz = b.vz / sp; }
  else { dx = Math.sin(b.yaw); dz = Math.cos(b.yaw); }
  // componente da velocidade atual na direção do mergulho
  const along = Math.max(0, b.vx * dx + b.vz * dz);
  let ns = Math.max(along + PHYS.DIVE_IMPULSE, PHYS.DIVE_MIN_SPEED);
  if (ns > PHYS.DIVE_CAP) ns = Math.max(along, PHYS.DIVE_CAP);
  b.vx = dx * ns; b.vz = dz * ns;
  b.vy = Math.max(b.vy, 0) * 0.3 + vy;
  b.yaw = Math.atan2(dx, dz);
  b.grounded = false;
  b.jumps = 2;
  setState(b, 'dive');
  world.events.push({ type: 'dive' });
}

/** Avança um corpo em dt segundos. `world.t` é o tempo da rodada no início do passo. */
export function stepBody(b, inp, map, world, dt) {
  const t = world.t;
  b.stateTime += dt;
  if (b.stun > 0) b.stun -= dt;
  if (b.hitCd > 0) b.hitCd -= dt;
  const ctrl = b.stun > 0 ? 0 : 1;
  let mx = inp.mx * ctrl, mz = inp.mz * ctrl;
  const il = Math.hypot(mx, mz);
  if (il > 1) { mx /= il; mz /= il; }
  const jump = inp.jump && ctrl, dive = inp.dive && ctrl;
  const px = b.x, py = b.y, pz = b.z;

  // superfície sob os pés (para velocidade da plataforma e inclinação)
  let g = b.grounded ? map.groundAt(b.x, b.z, b.y, t, G) : null;

  if (b.state === 'ground') {
    let tx = mx * PHYS.RUN_SPEED, tz = mz * PHYS.RUN_SPEED;
    if (g) {
      tx += g.vx + g.nx * PHYS.SLIP_SPEED;
      tz += g.vz + g.nz * PHYS.SLIP_SPEED;
    }
    const ex = tx - b.vx, ez = tz - b.vz;
    const el = Math.hypot(ex, ez), step = PHYS.GROUND_ACCEL * dt;
    if (el <= step) { b.vx = tx; b.vz = tz; }
    else { b.vx += (ex / el) * step; b.vz += (ez / el) * step; }
    if (il > 0.1) b.yaw = turnToward(b.yaw, Math.atan2(mx, mz), PHYS.TURN_RATE * dt);
    if (jump) {
      b.vy = PHYS.JUMP_V + (g ? Math.max(0, g.vy) : 0);
      b.grounded = false; b.jumps = 1;
      setState(b, 'air');
      world.events.push({ type: 'jump' });
    } else if (dive) {
      startDive(b, mx, mz, PHYS.DIVE_HOP_V, world);
    }
  } else if (b.state === 'air') {
    const before = hSpeed(b);
    b.vx += mx * PHYS.AIR_ACCEL * dt; b.vz += mz * PHYS.AIR_ACCEL * dt;
    const after = hSpeed(b), lim = Math.max(PHYS.RUN_SPEED, before);
    if (after > lim) { b.vx *= lim / after; b.vz *= lim / after; }
    if (il > 0.1) b.yaw = turnToward(b.yaw, Math.atan2(mx, mz), PHYS.TURN_RATE * dt);
    if ((jump || dive) && b.jumps < 2) startDive(b, mx, mz, PHYS.DJUMP_V, world);
  } else if (b.state === 'dive') {
    const sp = hSpeed(b);
    if (il > 0.1 && sp > 0.5) {
      const a = turnToward(Math.atan2(b.vx, b.vz), Math.atan2(mx, mz), PHYS.DIVE_TURN * dt);
      b.vx = Math.sin(a) * sp; b.vz = Math.cos(a) * sp; b.yaw = a;
    }
  } else if (b.state === 'slide') {
    let sp = hSpeed(b);
    if (il > 0.1 && sp > 0.5) {
      const a = turnToward(Math.atan2(b.vx, b.vz), Math.atan2(mx, mz), PHYS.SLIDE_TURN * dt);
      b.vx = Math.sin(a) * sp; b.vz = Math.cos(a) * sp;
    }
    if (g) { // gravidade ao longo da rampa
      b.vx += PHYS.GRAVITY * g.ny * g.nx * dt;
      b.vz += PHYS.GRAVITY * g.ny * g.nz * dt;
    }
    sp = hSpeed(b);
    if (sp > 1e-4) {
      const mu = PHYS.FRICTION[b.surf] ?? PHYS.FRICTION.normal;
      const dec = (mu * PHYS.GRAVITY + PHYS.SLIDE_DRAG * sp * sp) * dt;
      const ns = Math.max(0, sp - dec);
      b.vx *= ns / sp; b.vz *= ns / sp;
      sp = ns;
    }
    if (sp > 1) b.yaw = Math.atan2(b.vx, b.vz);
    if (jump) {
      b.vy = PHYS.JUMP_V; b.grounded = false; b.jumps = 1;
      setState(b, 'air');
      world.events.push({ type: 'jump' });
    } else if (sp < PHYS.SLIDE_EXIT_SPEED && b.stateTime > 0.3) {
      setState(b, 'ground');
    }
  }

  const sp = hSpeed(b);
  if (sp > PHYS.MAX_SPEED) { b.vx *= PHYS.MAX_SPEED / sp; b.vz *= PHYS.MAX_SPEED / sp; }

  // Integração + colisão com o chão
  if (b.grounded) {
    b.x += b.vx * dt; b.z += b.vz * dt;
    g = map.groundAt(b.x, b.z, b.y, t, G);
    const maxDrop = PHYS.STEP_DOWN + sp * dt * 0.9;
    if (g && g.y >= b.y - maxDrop) {
      b.vy = (g.y - b.y) / dt;
      b.y = g.y; b.surf = g.surf;
    } else {
      // saiu da borda / decolou de uma rampa
      b.grounded = false;
      b.vy = Math.min(Math.max(b.vy, 0), 12);
      if (b.state === 'slide') { b.jumps = 2; setState(b, 'dive'); }
      else { b.jumps = Math.max(b.jumps, 1); setState(b, 'air'); }
    }
  } else {
    b.vy -= PHYS.GRAVITY * dt;
    if (b.vy < -45) b.vy = -45;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    g = map.groundAt(b.x, b.z, py, t, G);
    if (g && b.y <= g.y && b.vy - g.vy <= 0) {
      b.y = g.y; b.vy = 0; b.grounded = true; b.jumps = 0; b.surf = g.surf;
      if (b.state === 'dive') {
        // impacto de barriga: entra em deslize com impulso inicial
        let s2 = hSpeed(b), dx, dz;
        if (s2 > 0.5) { dx = b.vx / s2; dz = b.vz / s2; }
        else { dx = Math.sin(b.yaw); dz = Math.cos(b.yaw); }
        s2 = Math.min(s2 + PHYS.SLIDE_LAND_BOOST, PHYS.MAX_SPEED);
        b.vx = dx * s2; b.vz = dz * s2;
        setState(b, 'slide');
        world.events.push({ type: 'slideStart' });
      } else {
        setState(b, 'ground');
        world.events.push({ type: 'land' });
      }
    }
  }

  map.affect(b, world, dt);

  b.dist += Math.hypot(b.x - px, b.z - pz);
  if (b.y < map.killY) b.fell = true;
}
