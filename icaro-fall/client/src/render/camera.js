// Câmera em 3ª pessoa (docs/design.md §7).
//
// CONVENÇÃO DE YAW/PITCH (a mesma da física em shared/physics.js):
//   - yaw = 0  => a câmera OLHA para +Z, ou seja, fica ATRÁS (em −Z) de um personagem que olha para +Z.
//   - direção horizontal de visão = (sin(yaw), cos(yaw)); logo, para "andar para onde a câmera olha",
//     use body.yaw = camera.yaw, ou os vetores de cameraBasis(yaw).
//   - yaw cresce girando a visão de +Z para +X.
//   - pitch > 0 => câmera acima do alvo olhando para baixo (padrão 18°); faixa útil −10°..+55° (em radianos).
import * as THREE from 'three';

/** Vetores de movimento relativos à câmera: forward (para onde ela olha) e right (direita da tela), no plano XZ. */
export function cameraBasis(yaw) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return { forward: { x: s, z: c }, right: { x: -c, z: s } };
}

export const CAMERA_DEFAULTS = { distance: 6.5, targetHeight: 1.2, pitch: (18 * Math.PI) / 180, fov: 60 };

const TAU = Math.PI * 2;
function angDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
}
const G = {};

export function createCameraRig(camera) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rig = {
    tx: 0, ty: 0, tz: 0, // alvo suavizado (pés)
    yaw: 0, pitch: CAMERA_DEFAULTS.pitch, dist: CAMERA_DEFAULTS.distance, th: CAMERA_DEFAULTS.targetHeight, fov: 60,
    lift: 0, pull: 1, had: false, boostT: 0, shakeAmp: 0, shakeT: 0, shakeDur: 0.2, orbit: 0, blend: 1,
    closeToTarget: false,
  };
  const look = new THREE.Vector3(), want = new THREE.Vector3();

  rig.shake = (amp, dur) => {
    if (reduced) return;
    rig.shakeAmp = Math.min(0.3, Math.max(rig.shakeAmp, amp)); rig.shakeDur = dur; rig.shakeT = dur;
  };
  rig.boost = () => { rig.boostT = 1.4; };

  /**
   * target: { x, y, z, state, speed } | null; ctl: { yaw, pitch, distance?, fov?, height? };
   * map: { groundAt(x,z,yRef,t,out), waterY, present: { x, y, z, radius, height } }.
   */
  rig.update = (dt, time, t, target, ctl, map) => {
    const k = (tau) => 1 - Math.exp(-dt / tau);
    let fovT = ctl.fov ?? 60;
    if (target) {
      const low = target.state === 'slide' || target.state === 'dive';
      const dx = target.x - rig.tx, dy = target.y - rig.ty, dz = target.z - rig.tz;
      if (!rig.had || dx * dx + dy * dy + dz * dz > 25 * 25) { // primeiro quadro ou teleporte: corta
        rig.tx = target.x; rig.ty = target.y; rig.tz = target.z;
        rig.yaw = ctl.yaw ?? 0; rig.pitch = ctl.pitch ?? CAMERA_DEFAULTS.pitch;
        rig.lift = 0;
      } else {
        const kp = k(0.07);
        rig.tx += dx * kp; rig.tz += dz * kp; rig.ty += dy * k(0.1);
      }
      rig.had = true;
      rig.yaw += angDelta(rig.yaw, ctl.yaw ?? 0) * k(0.08);
      rig.pitch += ((ctl.pitch ?? CAMERA_DEFAULTS.pitch) - rig.pitch) * k(0.08);
      if (rig.boostT > 0) rig.boostT -= dt;
      const boosting = rig.boostT > 0 || (target.speed || 0) > 24;
      let distT = ctl.distance ?? (low ? 5.0 : CAMERA_DEFAULTS.distance);
      const thT = ctl.height ?? (low ? 0.7 : CAMERA_DEFAULTS.targetHeight);
      if (ctl.fov == null && !reduced) fovT = boosting ? 72 : low ? 68 : 60;
      if (boosting && ctl.distance == null) distT += 0.5;
      rig.dist += (distT - rig.dist) * k(0.25 / 3);
      rig.th += (thT - rig.th) * k(0.25 / 3);

      const cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch);
      look.set(rig.tx, rig.ty + rig.th, rig.tz);
      // colisão simples: amostra o chão ao longo do raio alvo→câmera e levanta a câmera o necessário
      let lift = 0;
      const wy = map ? map.waterY : -1e9;
      for (let i = 1; i <= 4; i++) {
        const d = (rig.dist * i) / 4;
        const px = look.x - Math.sin(rig.yaw) * cp * d, pz = look.z - Math.cos(rig.yaw) * cp * d, py = look.y + sp * d;
        let floor = wy + 0.35;
        const g = map && map.groundAt ? map.groundAt(px, pz, py + 3, t, G) : null;
        if (g && Number.isFinite(g.y)) floor = Math.max(floor, g.y + 0.35 + (i === 4 ? 0.15 : 0));
        if (floor - py > 0) lift = Math.max(lift, (floor - py) * (4 / i));
      }
      rig.lift += (lift - rig.lift) * k(lift > rig.lift ? 0.05 : 0.3);
      want.set(look.x - Math.sin(rig.yaw) * cp * rig.dist, look.y + sp * rig.dist + rig.lift, look.z - Math.cos(rig.yaw) * cp * rig.dist);
      camera.position.copy(want);
      rig.closeToTarget = rig.dist < 1.2;
    } else {
      // sem alvo: órbita lenta de apresentação
      rig.had = false;
      const p = (map && map.present) || { x: 0, y: 1, z: 0, radius: 30, height: 12 };
      rig.orbit += dt * 0.12;
      const a = rig.orbit;
      want.set(p.x + Math.sin(a) * p.radius, p.y + p.height, p.z + Math.cos(a) * p.radius);
      look.set(p.x, p.y, p.z);
      camera.position.copy(want);
      fovT = ctl.fov ?? p.fov ?? 55;
      rig.tx = p.x; rig.ty = p.y; rig.tz = p.z;
    }
    camera.lookAt(look);
    if (rig.shakeT > 0) {
      rig.shakeT -= dt;
      const a = rig.shakeAmp * Math.max(0, rig.shakeT / rig.shakeDur) ** 2;
      camera.position.x += (Math.random() * 2 - 1) * a; camera.position.y += (Math.random() * 2 - 1) * a; camera.position.z += (Math.random() * 2 - 1) * a;
      if (rig.shakeT <= 0) rig.shakeAmp = 0;
    }
    rig.fov += (fovT - rig.fov) * k(0.12);
    if (Math.abs(camera.fov - rig.fov) > 0.01) { camera.fov = rig.fov; camera.updateProjectionMatrix(); }
  };
  return rig;
}
