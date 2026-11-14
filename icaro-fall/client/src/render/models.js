// Modelos GLB dos personagens (assets/models/*.glb): carga assíncrona com cache, clone por jogador.
// Contrato do GLB: 1 un = 1 m, origem nos pés, frente +Z, malha skinned única, materiais só com cor;
// material "CorJogador" (ou "Colete", nome antigo) recebe a cor do jogador;
// clipes: Idle, Run, Jump, Dive, Slide, Stun, Celebrate (ausente => Idle).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { playerColor, shade } from './palette.js';

// import.meta.glob tolera arquivo ausente (ex.: pinguim.glb ainda não gerado) sem quebrar o build.
const URLS = import.meta.glob('../../../assets/models/*.glb', { query: '?url', import: 'default', eager: true });
const FILE = { icaro: 'icaro.glb', penguin: 'pinguim.glb' };
const PLAYER_MATERIALS = ['CorJogador', 'Colete'];

function urlFor(char) {
  const f = FILE[char];
  for (const k of Object.keys(URLS)) if (k.endsWith('/' + f)) return URLS[k];
  return null;
}

async function fetchBuffer(url) {
  if (url.startsWith('data:')) { // página única: evita fetch de data: (pode ser bloqueado por CSP)
    const i = url.indexOf(',');
    const meta = url.slice(0, i), body = url.slice(i + 1);
    const bin = /;base64/i.test(meta) ? atob(body) : decodeURIComponent(body);
    const u8 = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    return u8.buffer;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao carregar ${url}`);
  return res.arrayBuffer();
}

const cache = new Map(); // char -> Promise<{ scene, clips: Map } | null>

/** Resolve com o modelo-base (compartilhado) ou null se não existir / falhar. Nunca rejeita. */
export function loadModel(char) {
  if (!cache.has(char)) {
    const url = urlFor(char);
    const p = !url ? Promise.resolve(null) : fetchBuffer(url)
      .then((buf) => new Promise((ok, err) => new GLTFLoader().parse(buf, '', ok, err)))
      .then((gltf) => {
        const clips = new Map();
        for (const c of gltf.animations || []) clips.set(c.name, c);
        if (!clips.has('Idle')) throw new Error(`${FILE[char]}: sem clipe Idle`);
        return { scene: gltf.scene, clips };
      })
      .catch((e) => { console.info(`[render] modelo ${char} indisponível, usando o procedural:`, e.message || e); return null; });
    cache.set(char, p);
  }
  return cache.get(char);
}

/** Instância por jogador: esqueleto e materiais próprios, cor do jogador aplicada. */
export function instantiateModel(base, slot) {
  const root = cloneSkinned(base.scene);
  const col = playerColor(slot);
  const mats = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = false;
    o.userData.sharedGeo = true; // geometria é do modelo-base (cache)
    o.frustumCulled = false; // a caixa da pose de repouso não vale para mergulho/deslize
    const conv = (m) => {
      if (!mats.has(m)) {
        const c = m.clone();
        c.userData.own = true;
        if (PLAYER_MATERIALS.includes(m.name)) c.color.set(col);
        else if (m.name === 'Short') c.color.set(shade(col, 0.7)); // design.md: short = cor do jogador × 0,7
        mats.set(m, c);
      }
      return mats.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [name, clip] of base.clips) { const a = mixer.clipAction(clip); a.setLoop(THREE.LoopRepeat, Infinity); actions[name] = a; }
  return { root, mixer, actions, materials: [...mats.values()] };
}
