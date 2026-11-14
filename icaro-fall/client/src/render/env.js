// Ambiente comum: luzes, céu em gradiente, sol, nuvens, mar animado, ilhotas com palmeiras, névoa.
import * as THREE from 'three';
import { C, vcToon, own } from './palette.js';
import { Builder, addPalm } from './geo.js';
import { makeRng } from '../../../shared/rng.js';

export function createEnvironment(scene) {
  scene.fog = new THREE.Fog(C.skyHorizon, 120, 420);
  scene.background = new THREE.Color(C.skyHorizon);

  const sunDir = new THREE.Vector3(0.4, 1, 0.3).normalize(); // luz vem de (−0,4, −1, −0,3)
  const sun = new THREE.DirectionalLight('#FFF4D6', 2.2);
  sun.position.copy(sunDir).multiplyScalar(50);
  const hemi = new THREE.HemisphereLight('#BFE9FF', '#7FD8C8', 0.9);
  scene.add(sun, sun.target, hemi);

  // céu: esfera invertida com gradiente vertical (segue a câmera)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(C.skyTop) }, hor: { value: new THREE.Color(C.skyHorizon) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; varying vec3 vDir;
      void main(){ float h = clamp(normalize(vDir).y, 0.0, 1.0); vec3 c = mix(hor, top, pow(h, 0.55));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(560, 24, 12), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(22, 16, 12), new THREE.MeshBasicMaterial({ color: C.sun, fog: false }));
  const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(34, 16, 12), new THREE.MeshBasicMaterial({ color: '#FFF3B0', fog: false, transparent: true, opacity: 0.35, depthWrite: false }));
  const sunPos = new THREE.Vector3(-0.45, 0.62, -0.64).normalize().multiplyScalar(520);
  sunBall.position.copy(sunPos); sunGlow.position.copy(sunPos);
  const skyGroup = new THREE.Group();
  skyGroup.add(sky, sunGlow, sunBall);

  // nuvens (grupos de 3–5 esferas), uma malha só
  const rng = makeRng(4242);
  const cb = new Builder();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.5, d = 230 + rng() * 150, y = 70 + rng() * 70;
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const r = 9 + rng() * 12;
      cb.sphere(r, '#ffffff', { p: [Math.cos(a) * d + (k - n / 2) * r * 1.1, y + rng() * 4, Math.sin(a) * d + rng() * 8], s: [1.2, 0.6, 1] }, 10, 7);
    }
  }
  const clouds = new THREE.Mesh(cb.build(), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }));
  skyGroup.add(clouds);
  scene.add(skyGroup);

  // mar: disco polar denso perto da câmera; ondas por deslocamento de vértices no shader (coordenadas de mundo)
  const NR = 56, NA = 72;
  const pos = [], idx = [];
  for (let r = 0; r <= NR; r++) {
    const rad = r === 0 ? 0 : 1.6 * (Math.pow(1.062, r) - 1) / 0.062; // cresce geometricamente até ~700 m
    for (let a = 0; a < NA; a++) {
      const t = (a / NA) * Math.PI * 2;
      pos.push(Math.cos(t) * rad, 0, Math.sin(t) * rad);
    }
  }
  for (let r = 0; r < NR; r++) for (let a = 0; a < NA; a++) {
    const a1 = (a + 1) % NA, k0 = r * NA + a, k1 = r * NA + a1, k2 = (r + 1) * NA + a, k3 = (r + 1) * NA + a1;
    idx.push(k0, k3, k2, k0, k1, k3);
  }
  const seaGeo = new THREE.BufferGeometry();
  seaGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  seaGeo.setIndex(idx);
  seaGeo.computeVertexNormals();
  const seaU = { uTime: { value: 0 }, uOff: { value: new THREE.Vector2() } };
  const seaMat = new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.85 });
  seaMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = seaU.uTime; sh.uniforms.uOff = seaU.uOff;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec2 uOff; varying float vWave;
        // 3 ondas: amplitude total ~0,12 m, comprimento ~6 m, período ~2,4 s
        vec3 seaWave(vec2 p){
          float k = 6.2832 / 6.0, w = 6.2832 / 2.4;
          vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.5, 0.86), d3 = vec2(0.2, -0.98);
          float a1 = dot(p, d1) * k + uTime * w, a2 = dot(p, d2) * k * 1.7 + uTime * w * 1.3, a3 = dot(p, d3) * k * 0.45 + uTime * w * 0.7;
          float h = 0.06 * sin(a1) + 0.025 * sin(a2) + 0.035 * sin(a3);
          vec2 g = 0.06 * k * cos(a1) * d1 + 0.025 * k * 1.7 * cos(a2) * d2 + 0.035 * k * 0.45 * cos(a3) * d3;
          return vec3(h, g);
        }`)
      .replace('#include <beginnormal_vertex>', `
        vec2 wp = position.xz + uOff;
        float fade = 1.0 - smoothstep(25.0, 95.0, length(position.xz));
        vec3 wv = seaWave(wp) * fade;
        vec3 objectNormal = normalize(vec3(-wv.y * 2.5, 1.0, -wv.z * 2.5));
        vWave = wv.x;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, position.y + wv.x, position.z);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWave;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83, 0.97, 1.0), smoothstep(0.045, 0.115, vWave) * 0.55);');
  };
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.frustumCulled = false; sea.renderOrder = 1;
  const deep = new THREE.Mesh(new THREE.CircleGeometry(900, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: C.waterDeep }));
  deep.frustumCulled = false;
  scene.add(deep, sea);

  let scenery = null;
  const env = {
    sunDir,
    waterY: 0,
    setWaterY(y) { env.waterY = y; sea.position.y = y; deep.position.y = y - 2.5; },
    /** Ilhotas com palmeiras: lista de { x, z, r } (topo ~0,25 r acima da água). */
    setIslets(list, waterY) {
      if (scenery) { scene.remove(scenery); scenery.geometry.dispose(); scenery = null; }
      if (!list || !list.length) return;
      const b = new Builder();
      const rg = makeRng(99);
      for (const it of list) {
        const h = it.r * 0.28;
        b.sphere(it.r, C.sand, { p: [it.x, waterY - h * 0.25, it.z], s: [1, h / it.r, 1] }, 16, 8);
        const n = 2 + Math.floor(rg() * 3);
        for (let i = 0; i < n; i++) {
          const a = rg() * Math.PI * 2, d = rg() * it.r * 0.45;
          addPalm(b, it.x + Math.cos(a) * d, waterY + h * 0.55, it.z + Math.sin(a) * d, rg() * 6, 4.5 + rg() * 2);
        }
      }
      scenery = new THREE.Mesh(b.build(), vcToon());
      scene.add(scenery);
    },
    update(time, camera) {
      seaU.uTime.value = time % 3600;
      const cx = camera.position.x, cz = camera.position.z;
      sea.position.x = cx; sea.position.z = cz;
      seaU.uOff.value.set(cx, cz);
      deep.position.x = cx; deep.position.z = cz;
      skyGroup.position.copy(camera.position);
      clouds.rotation.y = time * 0.004;
    },
    dispose() {
      env.setIslets(null);
      for (const o of [sky, sunBall, sunGlow, clouds, sea, deep]) { o.geometry.dispose(); o.material.dispose(); }
      scene.remove(skyGroup, sea, deep, sun, sun.target, hemi);
    },
  };
  return env;
}
