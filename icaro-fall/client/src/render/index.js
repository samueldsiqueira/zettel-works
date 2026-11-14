// GameView — contrato em docs/arquitetura.md ("Contrato do GameView").
//
//   const view = createGameView(canvas);
//   view.loadMap('slide' | 'arena' | 'jets' | null);
//   view.addPlayer({ id, name, char, color, isLocal }); view.removePlayer(id); view.clearPlayers();
//   view.setPlayerState(id, { x, y, z, yaw, state, speed, vy, stun, status });
//   view.popBuoy(id); view.emit(type, { x, y, z });
//   view.setCamera({ targetId, yaw, pitch });   // convenção em camera.js: yaw 0 => câmera em −Z olhando +Z
//   view.update(t, dt); view.render(); view.resize(w, h); view.dispose();
//
// Extensões opcionais (não quebram o contrato): setCamera aceita também { distance, fov, height };
// exports cameraBasis(yaw), CAMERA_DEFAULTS, LOBBY (pontos do cenário de lobby), PLAYER_COLORS.
import * as THREE from 'three';
import { createEnvironment } from './env.js';
import { createEffects } from './effects.js';
import { createCameraRig, cameraBasis, CAMERA_DEFAULTS } from './camera.js';
import { createCharacter, setCharacterState, updateCharacter } from './characters.js';
import { createSlideMap } from './mapSlide.js';
import { createArenaMap } from './mapArena.js';
import { createJetsMap } from './mapJets.js';
import { createLobbyMap, LOBBY } from './mapLobby.js';
import { PLAYER_COLORS, disposeTree } from './palette.js';

export { cameraBasis, CAMERA_DEFAULTS, LOBBY, PLAYER_COLORS };

const MAP_FACTORY = { slide: createSlideMap, arena: createArenaMap, jets: createJetsMap };
const G = {};

/**
 * opts (opcional): { shadows = true (shadow map do sol; false => sombras blob baratas), models = true (GLB; false => só procedural) }
 */
export function createGameView(canvas, opts = {}) {
  const useShadows = opts.shadows !== false, useModels = opts.models !== false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // preserva as cores saturadas da paleta, só comprime os realces
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = useShadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 800);
  camera.position.set(0, 6, -12);

  const env = createEnvironment(scene, { shadows: useShadows });
  env.buildEnvironment(renderer);
  const fx = createEffects(scene);
  const rig = createCameraRig(camera);
  const players = new Map();
  const playerLayer = new THREE.Group();
  scene.add(playerLayer);

  let stage = null; // módulo do mapa atual
  let time = 0, roundT = 0, disposed = false;
  const cam = { targetId: null, yaw: 0, pitch: CAMERA_DEFAULTS.pitch };
  const trail = new Map(); // id -> acumulador do rastro de deslize

  const view = {
    renderer, scene, camera, // expostos para depuração/testes

    loadMap(mapId) {
      if (stage) { scene.remove(stage.group); stage.dispose(); stage = null; }
      fx.clear();
      const make = MAP_FACTORY[mapId] || createLobbyMap;
      stage = make(env);
      // cenário recebe e projeta sombra (menos camadas transparentes/overlays)
      stage.group.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        const solid = m && !m.transparent && !m.isMeshBasicMaterial;
        o.receiveShadow = !!(m && !m.isMeshBasicMaterial);
        o.castShadow = !!solid;
      });
      scene.add(stage.group);
      rig.had = false;
    },

    addPlayer(p) {
      if (!p || p.id == null) return;
      if (players.has(p.id)) view.removePlayer(p.id);
      const ch = createCharacter(p, useModels);
      players.set(p.id, ch);
      playerLayer.add(ch.holder);
    },
    removePlayer(id) {
      const ch = players.get(id);
      if (!ch) return;
      playerLayer.remove(ch.holder);
      ch.dead = true;
      if (ch.model) ch.model.mixer.stopAllAction();
      disposeTree(ch.holder);
      ch.badge.material.map.dispose();
      players.delete(id); trail.delete(id);
    },
    clearPlayers() { for (const id of [...players.keys()]) view.removePlayer(id); },

    setPlayerState(id, st) {
      const ch = players.get(id);
      if (!ch || !st) return; // id desconhecido: ignora
      setCharacterState(ch, st, fx);
    },

    popBuoy(id) { if (stage && stage.popBuoy) stage.popBuoy(id, fx); },

    emit(type, pos) {
      fx.emit(type, pos);
      // feedback de câmera para eventos perto do jogador seguido
      const ch = players.get(cam.targetId);
      if (ch && pos && Number.isFinite(pos.x)) {
        const near = (pos.x - ch.x) ** 2 + (pos.z - ch.z) ** 2 < 9;
        if (near && type === 'boost') { rig.boost(); rig.shake(0.05, 0.15); }
        if (near && type === 'hit') rig.shake(0.12, 0.25);
      }
    },

    setCamera(c) {
      if (!c) return;
      if ('targetId' in c) cam.targetId = c.targetId;
      for (const k of ['yaw', 'pitch', 'distance', 'fov', 'height']) {
        if (k in c) { if (Number.isFinite(c[k])) cam[k] = c[k]; else delete cam[k]; }
      }
    },

    update(t, dt) {
      if (disposed) return;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      if (dt > 0.1) dt = 0.1;
      if (Number.isFinite(t)) roundT = t;
      time += dt;
      if (!stage) view.loadMap(null);
      stage.update(roundT, dt, time, fx);

      fx.beginBlobs();
      for (const ch of players.values()) {
        if (!ch.hasState) continue;
        const g = stage.groundAt(ch.x, ch.z, ch.y + 0.3, roundT, G);
        updateCharacter(ch, dt, time, g, fx, camera.position);
        if (!ch.gone) {
          if (!useShadows && g && g.y > stage.waterY - 0.2) fx.blob(ch.x, ch.z, g, Math.max(0, ch.y - g.y), ch.mode === 'slide' || ch.mode === 'dive' ? 1.3 : 1);
          // rastro do deslize
          if (ch.mode === 'slide' && ch.speed > 3) {
            const acc = (trail.get(ch.id) || 0) + dt;
            if (acc > 0.06) {
              trail.set(ch.id, 0);
              const s = Math.sin(ch.yaw), c = Math.cos(ch.yaw), side = Math.random() < 0.5 ? -0.3 : 0.3;
              fx.drop(ch.x - s * 0.6 + c * side, ch.y + 0.1, ch.z - c * 0.6 - s * side, -s * 1.5 + c * side * 3, 1.6 + Math.random(), -c * 1.5 - s * side * 3, 0.35, 0.07);
            } else trail.set(ch.id, acc);
          }
        }
      }
      fx.endBlobs();
      fx.update(dt, camera);

      const target = cam.targetId != null ? players.get(cam.targetId) : null;
      rig.update(dt, time, roundT, target && target.hasState ? target : null, cam, stage);
      // frustum de sombra: justo à frente do alvo; na órbita de apresentação cobre o mapa (mais largo, mais suave)
      if (target && target.hasState) {
        const b = cameraBasis(rig.yaw);
        env.updateShadow(rig.tx + b.forward.x * 9, rig.ty, rig.tz + b.forward.z * 9, 30);
      } else {
        const p = stage.present;
        env.updateShadow(p.x, p.y, p.z, Math.max(18, p.radius * 1.15));
      }
      env.update(time, camera);
    },

    render() { if (!disposed) renderer.render(scene, camera); },

    resize(width, height) {
      const w = Math.max(1, width | 0), h = Math.max(1, height | 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      view.clearPlayers();
      if (stage) { scene.remove(stage.group); stage.dispose(); stage = null; }
      fx.dispose(); env.dispose();
      renderer.dispose();
    },
  };

  view.loadMap(null);
  const w = canvas.clientWidth || canvas.width || 1280, h = canvas.clientHeight || canvas.height || 720;
  view.resize(w, h);
  return view;
}
