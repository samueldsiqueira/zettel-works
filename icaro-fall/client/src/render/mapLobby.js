// Cenário do lobby / vitrine (loadMap(null)): ilhota com deck circular e pódio de 3 degraus.
import * as THREE from 'three';
import { C, vcToon, own, checkerTexture, disposeTree } from './palette.js';
import { Builder, DEG, addPalm, annulusGeo, flatRingGeo } from './geo.js';

/**
 * Pontos úteis para o app posicionar personagens no lobby (y já é a altura do chão).
 *   LOBBY.podium[0..2]  — 1º, 2º e 3º lugar (de frente para +Z; use yaw 0)
 *   LOBBY.spot(i, n)    — n lugares em arco no deck, de frente para +Z
 */
export const LOBBY = {
  groundY: 0.5,
  radius: 7,
  center: { x: 0, y: 0.5, z: 0 },
  podium: [{ x: 0, y: 1.5, z: -1.6, r: 0.95 }, { x: -2.0, y: 1.15, z: -1.6, r: 0.95 }, { x: 2.0, y: 0.9, z: -1.6, r: 0.95 }],
  spot(i, n = 1) {
    if (n <= 1) return { x: 0, y: 0.5, z: 1.2, yaw: 0 };
    const perRow = Math.min(n, 8), row = Math.floor(i / perRow), k = i % perRow, cnt = Math.min(perRow, n - row * perRow);
    const a = (k - (cnt - 1) / 2) * 0.3, r = 3.2 + row * 1.6;
    return { x: Math.sin(a) * r * 1.3, y: 0.5, z: 0.4 + Math.cos(a) * r * 0.6 + row * 0.3, yaw: 0 };
  },
};

export function createLobbyMap(env) {
  const group = new THREE.Group();
  const b = new Builder();
  const Y = LOBBY.groundY, R = LOBBY.radius;
  // ilhota + deck
  b.sphere(16, C.sand, { p: [0, -1.2, -1], s: [1, 0.1, 0.9] }, 24, 8);
  b.add(annulusGeo(R - 0.5, R, Y, -0.6, 0, Math.PI * 2, 48), '#ffffff');
  b.add(annulusGeo(R - 2.8, R - 0.5, Y, Y - 0.3, 0, Math.PI * 2, 48), C.sand2);
  b.add(annulusGeo(0, R - 2.8, Y, Y - 0.3, 0, Math.PI * 2, 48), C.sand);
  // pódio
  const cols = [C.primary, '#DCE6F2', '#F0A868'];
  LOBBY.podium.forEach((p, i) => {
    b.cyl(p.r, p.r * 1.05, p.y - Y - 0.06, cols[i], { p: [p.x, Y + (p.y - Y - 0.06) / 2, p.z] }, 20);
    b.cyl(p.r * 1.03, p.r * 1.03, 0.12, '#ffffff', { p: [p.x, p.y - 0.06, p.z] }, 20);
  });
  // cenário
  addPalm(b, -5.2, Y, -3.6, 0.4, 5); addPalm(b, 5.4, Y, -3.2, 2.9, 4.4); addPalm(b, -9.5, 0.2, 1, 1.5, 4);
  b.sphere(0.5, C.accent, { p: [4.4, Y + 0.5, 2.6] }, 12, 8); // bola de praia
  b.sphere(0.505, '#ffffff', { p: [4.4, Y + 0.5, 2.6], s: [1, 1, 0.35] }, 12, 8);
  // guarda-sol
  b.cyl(0.06, 0.06, 2.6, '#ffffff', { p: [-4.6, Y + 1.3, 2.4] }, 6);
  b.cone(1.7, 0.7, C.info, { p: [-4.6, Y + 2.8, 2.4] }, 8);
  b.cone(1.72, 0.7, '#ffffff', { p: [-4.6, Y + 2.79, 2.4], r: [0, 22.5 * DEG, 0], s: [1, 0.98, 1] }, 4);
  // boia salva-vidas
  b.torus(0.55, 0.2, C.danger, { p: [-3.4, Y + 0.2, 4.2], r: [90 * DEG, 0, 0] }, Math.PI * 2, 16);
  group.add(b.mesh(vcToon()));
  const chk = checkerTexture(40, 1);
  const rim = new THREE.Mesh(flatRingGeo(R - 0.5, R, Y + 0.01, 48), own(new THREE.MeshBasicMaterial({ map: chk })));
  { const uv = rim.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, Math.floor(i / 2) / 48, i % 2); }
  group.add(rim);

  env.setWaterY(0);
  env.setIslets([{ x: 60, z: -50, r: 12 }, { x: -70, z: -30, r: 10 }, { x: -20, z: -90, r: 14 }, { x: 45, z: 70, r: 9 }], 0);

  return {
    id: null, map: null, group, waterY: 0,
    present: { x: 0, y: 1.3, z: -0.5, radius: 10.5, height: 2.6, fov: 45 },
    groundAt(x, z, yRef, t, out) {
      let y = -Infinity;
      for (const p of LOBBY.podium) if ((x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r && p.y <= yRef + 0.5) y = Math.max(y, p.y);
      if (y === -Infinity && x * x + z * z <= R * R && Y <= yRef + 0.5) y = Y;
      if (y === -Infinity) return null;
      out.y = y; out.nx = 0; out.ny = 1; out.nz = 0; out.vx = out.vy = out.vz = 0; out.surf = 'normal';
      return out;
    },
    update() {},
    popBuoy() {},
    dispose() { disposeTree(group); },
  };
}
