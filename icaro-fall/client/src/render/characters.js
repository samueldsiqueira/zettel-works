// Personagens Ícaro e Pinguim (docs/design.md §2–4): primitivas mescladas por nó do rig, animação por código.
// Origem nos pés; frente = +Z local; yaw = rotação em Y (yaw 0 olha +Z, igual à física).
import * as THREE from 'three';
import { C, playerColor, shade, vcToon, inkHull, symbolTexture, badgeTexture, arrowTexture, own } from './palette.js';
import { Builder, DEG } from './geo.js';

const PIVOT_Y = 0.8;
const SKIN = '#F2B48A', HAIR = '#C9792B', BAND = '#FFC83D', FEATHER = '#FFF8E7', SLIPPER = '#FF7A1A', CHEEK = '#FF9C8A';
const BEAK = '#FF9A1F', LENS = '#7FE3FF', FLOAT = '#FFD23F';

function node(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function part(parent, builder, mat) {
  const m = new THREE.Mesh(builder.build(), mat || vcToon());
  parent.add(m);
  return m;
}
function hullMesh(parent, geo) {
  const m = new THREE.Mesh(geo, inkHull());
  parent.add(m);
  return m;
}
function symbolDisc(parent, slot, x, y, z, tilt = 0) {
  const mat = own(new THREE.MeshBasicMaterial({ map: symbolTexture(slot), transparent: true }));
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), mat);
  m.position.set(x, y, z);
  m.rotation.set(tilt, Math.PI, 0, 'YXZ');
  parent.add(m);
  return m;
}

function buildIcaro(body, slot) {
  const col = playerColor(slot), short = shade(col, 0.7);
  const N = { body };
  let b = new Builder();
  b.cyl(0.2, 0.22, 0.22, short, { p: [0, -0.28, 0] });
  b.capsule(0.18, 0.2, SKIN, { p: [0, 0, 0] });
  b.cyl(0.215, 0.215, 0.24, col, { p: [0, 0.02, 0] });
  b.cyl(0.185, 0.215, 0.04, col, { p: [0, 0.16, 0] });
  b.cyl(0.215, 0.19, 0.04, col, { p: [0, -0.12, 0] });
  b.box(0.06, 0.05, 0.02, '#ffffff', { p: [0, 0.02, 0.215] });
  part(body, b);
  hullMesh(body, new THREE.CapsuleGeometry(0.232, 0.2, 4, 12)).position.y = -0.02;
  symbolDisc(body, slot, 0, 0.04, -0.222);

  // cabeça
  const head = N.head = node(body, 0, 0.48, 0);
  b = new Builder();
  b.sphere(0.29, SKIN, {}, 18, 14);
  b.add(new THREE.SphereGeometry(0.305, 16, 8, 0, Math.PI * 2, 0, 100 * DEG), HAIR, { p: [0, 0.02, -0.01], r: [-15 * DEG, 0, 0] });
  for (const x of [-0.13, 0, 0.13]) b.sphere(0.09, HAIR, { p: [x, 0.24, 0.17] }, 10, 8);
  b.torus(0.295, 0.022, BAND, { p: [0, 0.1, 0], r: [(90 - 10) * DEG, 0, 0] }, Math.PI * 2, 24);
  // folhinhas do louro
  for (const sx of [-1, 1]) b.sphere(0.05, BAND, { p: [sx * 0.27, 0.13, 0.12], s: [0.4, 1.3, 1], r: [0, 0, sx * -0.4] }, 8, 6);
  for (const sx of [-1, 1]) b.sphere(0.045, CHEEK, { p: [sx * 0.18, -0.06, 0.225], s: [1, 1, 0.3], r: [0, sx * 38 * DEG, 0] }, 10, 6);
  b.torus(0.04, 0.011, C.ink, { p: [0, -0.085, 0.283], r: [0.15, 0, Math.PI] }, Math.PI, 10);
  part(head, b);
  hullMesh(head, new THREE.SphereGeometry(0.312, 18, 14));
  b = new Builder();
  for (const sx of [-1, 1]) {
    b.sphere(0.045, C.ink, { p: [sx * 0.1, 0, 0.265], s: [1, 1.3, 0.5] }, 10, 8);
    b.sphere(0.014, '#ffffff', { p: [sx * 0.1 - 0.015, 0.02, 0.29] }, 6, 5);
  }
  N.eyes = part(node(head, 0, 0.01, 0), b).parent;

  for (const [k, sx] of [['L', 1], ['R', -1]]) {
    const arm = N['arm' + k] = node(body, sx * 0.26, 0.16, 0);
    b = new Builder();
    b.capsule(0.06, 0.24, SKIN, { p: [0, -0.18, 0] });
    b.sphere(0.075, SKIN, { p: [0, -0.34, 0] }, 10, 8);
    part(arm, b);
    const leg = N['leg' + k] = node(body, sx * 0.12, -0.3, 0);
    b = new Builder();
    b.capsule(0.075, 0.28, SKIN, { p: [0, -0.21, 0] });
    b.sphere(0.09, SLIPPER, { p: [0, -0.45, 0.03], s: [1, 0.5, 1.6] }, 10, 8);
    part(leg, b);
    const wing = N['wing' + k] = node(body, sx * 0.1, 0.2, -0.215);
    b = new Builder();
    b.sphere(0.05, BAND, {}, 8, 6);
    [0, 25, 50].forEach((a, i) => {
      const len = 0.17 - i * 0.012;
      const m = new THREE.Matrix4().makeRotationZ(-sx * a * DEG);
      b.sphere(len, FEATHER, { p: [0, len * 0.95, -0.01 * i], s: [0.5, 1, 0.22], m }, 10, 8);
    });
    part(wing, b);
  }
  N.sideSign = { L: 1, R: -1 };
  return N;
}

function buildPenguin(body, slot) {
  const col = playerColor(slot);
  const N = { body };
  let b = new Builder();
  b.sphere(0.38, col, { p: [0, -0.2, 0], s: [1, 1.45, 0.95] }, 20, 16);
  b.sphere(0.31, '#ffffff', { p: [0, -0.22, 0.2], s: [1, 1.42, 0.6] }, 18, 14);
  b.cone(0.07, 0.12, col, { p: [0, -0.62, -0.34], r: [-60 * DEG, 0, 0] });
  part(body, b);
  const hull = hullMesh(body, new THREE.SphereGeometry(0.38, 20, 16));
  hull.position.y = -0.2; hull.scale.set(1.045, 1.45 * 1.03, 0.95 * 1.045);
  symbolDisc(body, slot, 0, -0.05, -0.362, 0.08);

  const head = N.head = node(body, 0, 0.4, 0);
  b = new Builder();
  b.sphere(0.3, col, {}, 18, 14);
  b.sphere(0.24, '#ffffff', { p: [0, -0.03, 0.19], s: [1, 0.9, 0.5] }, 16, 12);
  b.cone(0.085, 0.17, BEAK, { p: [0, -0.06, 0.34], r: [90 * DEG, 0, 0] });
  for (const sx of [-1, 1]) {
    b.torus(0.065, 0.018, '#ffffff', { p: [sx * 0.09, 0.2, 0.215], r: [-35 * DEG, 0, 0] }, Math.PI * 2, 14);
    b.add(new THREE.CircleGeometry(0.06, 14), LENS, { p: [sx * 0.09, 0.2, 0.218], r: [-35 * DEG, 0, 0] });
  }
  b.torus(0.3, 0.016, C.ink, { p: [0, 0.18, 0], r: [(90 - 20) * DEG, 0, 0] }, Math.PI * 2, 24);
  part(head, b);
  hullMesh(head, new THREE.SphereGeometry(0.313, 18, 14));
  b = new Builder();
  for (const sx of [-1, 1]) {
    b.sphere(0.04, C.ink, { p: [sx * 0.1, 0, 0.292], s: [1, 1.3, 0.5] }, 10, 8);
    b.sphere(0.013, '#ffffff', { p: [sx * 0.1 - 0.013, 0.018, 0.312] }, 6, 5);
  }
  N.eyes = part(node(head, 0, 0.04, 0), b).parent;

  for (const [k, sx] of [['L', 1], ['R', -1]]) {
    const arm = N['arm' + k] = node(body, sx * 0.36, 0.12, 0);
    b = new Builder();
    b.sphere(0.26, col, { p: [0, -0.24, 0], s: [0.25, 1, 0.55] }, 12, 10);
    b.torus(0.1, 0.04, FLOAT, { p: [0, -0.12, 0], s: [0.8, 1.35, 1], r: [90 * DEG, 0, 0] }, Math.PI * 2, 14);
    part(arm, b);
    const leg = N['leg' + k] = node(body, sx * 0.14, -0.6, 0);
    b = new Builder();
    b.sphere(0.1, BEAK, { p: [0, -0.16, 0.08], s: [1.2, 0.4, 1.7] }, 10, 8);
    part(leg, b);
  }
  return N;
}

// ---------- poses ----------
const KEYS = ['bodyY', 'bodyRx', 'bodyRy', 'bodyRz', 'sy', 'headRx', 'headRz', 'armL', 'armR', 'armOut', 'legL', 'legR', 'liftL', 'liftR', 'wing'];
function blankPose() {
  const p = {};
  for (const k of KEYS) p[k] = 0;
  p.sy = 1;
  return p;
}
const TAU = Math.PI * 2;
const sin = Math.sin;

/** Estados visuais: idle | run | air | dive | slide | celebrate (+ overlays stun / flail). */
function targetPose(ch, T, mode, time) {
  const ic = ch.char === 'icaro';
  for (const k of KEYS) T[k] = 0;
  T.sy = 1;
  const breath = sin((time * TAU) / 2.4 + ch.seed);
  switch (mode) {
    case 'run': {
      const s = sin(ch.runPhase);
      if (ic) {
        T.legL = 40 * s; T.legR = -40 * s; T.armL = -50 * s; T.armR = 50 * s; T.armOut = 6;
        T.bodyRx = 8; T.bodyY = 0.04 * Math.abs(Math.cos(ch.runPhase)); T.headRx = -4; T.wing = 32;
      } else {
        T.bodyRz = 12 * s; T.bodyRy = 6 * s; T.bodyRx = 6;
        T.liftL = 0.06 * Math.max(0, s); T.liftR = 0.06 * Math.max(0, -s);
        T.legL = 22 * s; T.legR = -22 * s; T.armOut = 35 + 15 * sin(ch.runPhase * 2);
      }
      break;
    }
    case 'air': {
      const f = sin((time * TAU) / 0.18);
      if (ic) { T.armL = T.armR = 150; T.armOut = 18; T.legL = 30; T.legR = -20; T.wing = 60 + 15 * f; }
      else { T.armOut = 80 + 20 * f; T.legL = T.legR = -20; }
      break;
    }
    case 'dive':
      T.bodyRx = 90; T.bodyY = -0.45;
      if (ic) { T.armL = T.armR = 170; T.armOut = -4; T.wing = 70; }
      else { T.armL = T.armR = -10; T.armOut = 6; T.legL = T.legR = -70; }
      break;
    case 'slide': {
      const k = sin((time * TAU) / 0.16), roll = sin((time * TAU) / 0.6 + ch.seed);
      T.bodyRx = 86; T.bodyRy = 4 * roll;
      if (ic) { T.bodyY = -0.52; T.armL = T.armR = 170; T.armOut = -2; T.legL = 10 * k; T.legR = -10 * k; T.wing = 55; }
      else { T.bodyY = -0.44; T.armL = T.armR = -10; T.armOut = 20; T.legL = -70 + 15 * k; T.legR = -70 - 15 * k; }
      break;
    }
    case 'celebrate': {
      const w = sin((time * TAU) / 0.25);
      if (ic) { T.armL = 160 + 12 * w; T.armR = 160 - 12 * w; T.armOut = 22 + 15 * w; T.wing = 55 + 20 * w; T.legL = 8; T.legR = -8; }
      else { T.armOut = 120 + 25 * w; }
      break;
    }
    default: // idle
      T.sy = 1.015 + 0.015 * breath;
      if (ic) { T.armOut = 8; T.headRz = 3 * sin((time * TAU) / 4.8 + ch.seed); T.wing = 27.5 + 2.5 * breath; }
      else { T.bodyRz = 2 * breath; T.armOut = 18.5 + 3.5 * breath; }
  }
  if (ch.flail) {
    const f = sin((time * TAU) / 0.16);
    if (ic) { T.armL = 90 + 60 * f; T.armR = 90 - 60 * f; T.legL = 60 * f; T.legR = -60 * f; T.armOut = 30; }
    else { T.armOut = 80 + 70 * f; }
  }
  if (ch.stunT >= 0) {
    if (ch.stunT < 0.2) T.bodyRx += -25;
    else T.headRz = 12 * sin(((ch.stunT - 0.2) * TAU) / 0.33);
    if (mode !== 'dive' && mode !== 'slide') { T.armL = T.armR = -10; T.armOut = ic ? 14 : 12; }
  }
  return T;
}

const _starGeo = new THREE.OctahedronGeometry(0.07);
const _starMat = new THREE.MeshBasicMaterial({ color: '#FFD23F' });

export function createCharacter({ id, name, char, color, isLocal }) {
  const ch = {
    id, char: char === 'penguin' ? 'penguin' : 'icaro', slot: color | 0, isLocal: !!isLocal,
    seed: Math.random() * 10, runPhase: 0, stunT: -1, flail: false,
    hasState: false, mode: 'idle', state: 'ground', status: null, speed: 0, vy: 0,
    x: 0, y: 0, z: 0, yaw: 0, visYaw: 0,
    squash: 0, squashKind: 0, vanish: -1, gone: false, celebrateT: 0, blinkT: 2 + Math.random() * 3,
    pose: blankPose(), target: blankPose(),
  };
  const holder = ch.holder = new THREE.Group(); // só posição
  const tilt = ch.tilt = new THREE.Group(); // alinhamento ao chão (deslize) + yaw
  const root = ch.root = new THREE.Group(); // pulinho / giro / escala
  const body = new THREE.Group();
  body.position.y = PIVOT_Y;
  holder.add(tilt); tilt.add(root); root.add(body);
  const N = ch.nodes = ch.char === 'icaro' ? buildIcaro(body, ch.slot) : buildPenguin(body, ch.slot);
  ch.legBaseY = N.legL.position.y;

  // estrelas de tontura
  const stars = ch.stars = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(_starGeo, _starMat);
    s.position.set(Math.cos((i * TAU) / 3) * 0.35, 0, Math.sin((i * TAU) / 3) * 0.35);
    stars.add(s);
  }
  stars.position.y = 0.48 + 0.3 + 0.15;
  stars.visible = false;
  body.add(stars);

  // crachá
  const bt = badgeTexture(isLocal ? 'Você' : name, ch.slot);
  const badge = ch.badge = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: bt.texture, transparent: true, depthWrite: false, fog: false })));
  ch.badgeH = 0.36; ch.badgeAspect = bt.aspect;
  badge.scale.set(ch.badgeH * bt.aspect, ch.badgeH, 1);
  badge.position.y = 2.0;
  badge.renderOrder = 10;
  holder.add(badge);
  if (isLocal) {
    const ar = ch.arrow = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: arrowTexture(), transparent: true, depthWrite: false, fog: false })));
    ar.scale.set(0.28, 0.28, 1);
    ar.renderOrder = 10;
    holder.add(ar);
  }
  holder.visible = false; // até o primeiro setPlayerState
  return ch;
}

const _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qy = new THREE.Quaternion();

/** Aplica o estado vindo do app. fx: efeitos (pode ser null). */
export function setCharacterState(ch, st, fx) {
  if (!st) return;
  const first = !ch.hasState;
  const prevState = ch.state, prevStatus = ch.status;
  if (Number.isFinite(st.x)) ch.x = st.x;
  if (Number.isFinite(st.y)) ch.y = st.y;
  if (Number.isFinite(st.z)) ch.z = st.z;
  if (Number.isFinite(st.yaw)) ch.yaw = st.yaw;
  ch.state = st.state || 'ground';
  ch.speed = Number.isFinite(st.speed) ? st.speed : 0;
  ch.vy = Number.isFinite(st.vy) ? st.vy : 0;
  ch.status = st.status || null;
  const stunned = st.stun === true || st.stun > 0;
  if (stunned && ch.stunT < 0) ch.stunT = 0;
  if (!stunned) ch.stunT = -1;
  if (first) {
    ch.hasState = true; ch.visYaw = ch.yaw;
    if (ch.status === 'eliminated') { ch.gone = true; }
  } else {
    if (prevState !== 'air' && ch.state === 'air' && ch.vy > 2) { ch.squash = 0.27; ch.squashKind = 1; }
    if ((prevState === 'air' || prevState === 'dive') && (ch.state === 'ground')) { ch.squash = 0.25; ch.squashKind = -1; }
    if (ch.status === 'eliminated' && prevStatus !== 'eliminated' && !ch.gone) {
      ch.vanish = 0;
      if (fx) fx.emit('splash', ch);
    }
    if (ch.status !== 'eliminated' && prevStatus === 'eliminated') { ch.gone = false; ch.vanish = -1; }
    if (ch.status === 'qualified' && prevStatus !== 'qualified') ch.celebrateT = 0;
  }
  ch.holder.position.set(ch.x, ch.y, ch.z);
}

function lerpAngle(a, b, k) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return a + d * k;
}

/**
 * Avança a animação. ground = { y, nx, ny, nz } | null (superfície sob o personagem, para alinhar o deslize).
 */
export function updateCharacter(ch, dt, time, ground, fx, camPos) {
  if (!ch.hasState) return;
  const N = ch.nodes, ic = ch.char === 'icaro';
  // modo visual
  let mode;
  if (ch.status === 'qualified') mode = 'celebrate';
  else if (ch.state === 'slide') mode = 'slide';
  else if (ch.state === 'dive') mode = 'dive';
  else if (ch.state === 'air') mode = 'air';
  else mode = ch.speed > 0.6 ? 'run' : 'idle';
  ch.mode = mode;
  ch.flail = mode === 'air' && ch.vy < -16 && ch.stunT < 0;
  if (mode === 'run') {
    const dur = Math.min(0.8, 0.42 * (7 / Math.max(ch.speed, 0.1)));
    ch.runPhase += (dt * TAU) / dur;
  }
  if (ch.stunT >= 0) ch.stunT += dt;

  // suavização de pose (~100 ms; mergulho entra em ~120 ms)
  const T = targetPose(ch, ch.target, mode, time), P = ch.pose;
  const k = 1 - Math.exp(-dt / 0.045);
  for (const key of KEYS) P[key] += (T[key] - P[key]) * k;

  // squash & stretch de pulo / pouso
  let sx = 1, sy = P.sy;
  if (ch.squash > 0) {
    ch.squash -= dt;
    const u = Math.max(0, ch.squash) / 0.27, e = Math.sin(Math.min(1, u) * Math.PI);
    if (ch.squashKind > 0) { sx -= 0.1 * e; sy += 0.15 * e; } else { sx += 0.15 * e; sy -= 0.2 * e; }
  }

  // comemoração: pulinhos + giro a cada 2º pulo
  let hop = 0, spin = 0;
  if (mode === 'celebrate') {
    ch.celebrateT += dt;
    const ph = ch.celebrateT / 0.5, n = Math.floor(ph), f = ph - n;
    hop = (ic ? 0.3 : 0.25) * Math.sin(f * Math.PI);
    if (n % 2 === 1) spin = f * TAU;
  }

  const body = N.body;
  body.position.y = PIVOT_Y + P.bodyY;
  body.rotation.set(P.bodyRx * DEG, P.bodyRy * DEG, P.bodyRz * DEG);
  body.scale.set(sx, sy, sx);
  N.head.rotation.set(P.headRx * DEG, 0, P.headRz * DEG);
  N.armL.rotation.set(-P.armL * DEG, 0, P.armOut * DEG);
  N.armR.rotation.set(-P.armR * DEG, 0, -P.armOut * DEG);
  N.legL.rotation.x = -P.legL * DEG; N.legR.rotation.x = -P.legR * DEG;
  N.legL.position.y = ch.legBaseY + P.liftL; N.legR.position.y = ch.legBaseY + P.liftR;
  if (N.wingL) { N.wingL.rotation.z = -P.wing * DEG; N.wingR.rotation.z = P.wing * DEG; }

  // piscar
  ch.blinkT -= dt;
  let ey = 1;
  if (ch.blinkT < 0) {
    const u = -ch.blinkT / 0.12;
    if (u >= 1) ch.blinkT = 3 + Math.random() * 2; else ey = 1 - 0.9 * Math.sin(u * Math.PI);
  }
  N.eyes.scale.y = ey;

  // estrelas
  const st = ch.stars;
  st.visible = ch.stunT >= 0;
  if (st.visible) {
    st.rotation.y = (ch.stunT * TAU) / 0.8;
    for (const s of st.children) s.rotation.y = time * 6;
  }

  // yaw + alinhamento à superfície (só no deslize)
  ch.visYaw = lerpAngle(ch.visYaw, ch.yaw, 1 - Math.exp(-dt * 22));
  _qy.setFromAxisAngle(_up, ch.visYaw + spin);
  if (mode === 'slide' && ground && ch.y - ground.y < 0.3) _n.set(ground.nx, ground.ny, ground.nz); else _n.set(0, 1, 0);
  _qa.setFromUnitVectors(_up, _n).multiply(_qy);
  ch.tilt.quaternion.slerp(_qa, 1 - Math.exp(-dt * 14));

  // sumiço ao ser eliminado
  let scale = 1, sink = 0;
  if (ch.vanish >= 0) {
    ch.vanish += dt;
    const u = Math.min(1, ch.vanish / 0.3);
    scale = 1 - u * u; sink = -0.6 * u * u;
    if (u >= 1) {
      ch.vanish = -1; ch.gone = true;
      if (fx) fx.emit('puff', { x: ch.x, y: ch.y + 0.3 + sink, z: ch.z });
    }
  }
  ch.root.position.y = hop + sink;
  ch.root.scale.setScalar(Math.max(scale, 0.001));
  ch.holder.visible = !ch.gone;

  // crachá: oculto quando eliminado/qualificado; some com a distância (25 m → 45 m)
  const showBadge = !ch.gone && ch.status == null;
  ch.badge.visible = showBadge;
  if (showBadge && camPos) {
    const d = Math.hypot(camPos.x - ch.x, camPos.y - ch.y, camPos.z - ch.z);
    const o = d < 25 ? 1 : Math.max(0, 1 - (d - 25) / 20);
    ch.badge.material.opacity = o;
    ch.badge.visible = o > 0.02;
    // tamanho na tela quase constante (como um rótulo de HUD): encolhe de perto, cresce de longe
    const bs = ch.badgeH * Math.min(2.4, Math.max(0.45, d / 10));
    ch.badge.scale.set(bs * ch.badgeAspect, bs, 1);
    if (ch.arrow) ch.arrow.scale.setScalar(0.28 * Math.min(2.4, Math.max(0.6, d / 10)));
    const low = mode === 'slide' || mode === 'dive';
    const by = low ? 1.25 : 2.0;
    ch.badge.position.y += (by - ch.badge.position.y) * Math.min(1, dt * 10);
  }
  if (ch.arrow) {
    ch.arrow.visible = !ch.gone && ch.status == null;
    ch.arrow.position.y = ch.badge.position.y + 0.42 + 0.05 * Math.sin(time * 4);
  }
}
