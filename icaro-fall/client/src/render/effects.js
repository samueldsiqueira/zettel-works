// Efeitos (docs/design.md §6): partículas em pool (InstancedMesh), anéis e sombras blob.
import * as THREE from 'three';
import { C, PLAYER_COLORS, blobTexture } from './palette.js';

const MAX_DROPS = 440, MAX_QUADS = 160, MAX_RINGS = 14, MAX_BLOBS = 40;
const GRAV = 18;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

function makePool(mesh, max) {
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // instanceColor precisa existir antes do primeiro render
  mesh.setColorAt(0, _c.set('#ffffff'));
  return { mesh, max, n: 0, items: Array.from({ length: max }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 0.1, s1: 0.1, g: GRAV, drag: 0, rx: 0, ry: 0, wx: 0, wy: 0, sway: 0, color: 0 })) };
}

export function createEffects(scene) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const drops = makePool(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAX_DROPS), MAX_DROPS);
  const quads = makePool(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }), MAX_QUADS), MAX_QUADS);
  scene.add(drops.mesh, quads.mesh);

  // anéis (respingo, boost, pulo duplo)
  const ringGeo = new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2);
  const starGeo = new THREE.CircleGeometry(1, 16); // estrela de 8 pontas
  {
    const p = starGeo.attributes.position;
    for (let i = 1; i < p.count; i++) if (i % 2 === 0) p.setXYZ(i, p.getX(i) * 0.4, p.getY(i) * 0.4, 0);
  }
  const rings = [];
  for (let i = 0; i < MAX_RINGS; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; m.renderOrder = 4;
    scene.add(m);
    rings.push({ m, life: 0, max: 1, r0: 1, r1: 1, star: false });
  }

  // sombras blob
  const blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), MAX_BLOBS);
  blobs.frustumCulled = false; blobs.count = 0; blobs.renderOrder = 3;
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(blobs);
  let nBlobs = 0;

  function spawn(pool, x, y, z, vx, vy, vz, life, s0, s1, color, g = GRAV, drag = 0) {
    let it;
    if (pool.n < pool.max) it = pool.items[pool.n++];
    else it = pool.items[(Math.random() * pool.max) | 0]; // pool cheio: recicla um qualquer
    it.x = x; it.y = y; it.z = z; it.vx = vx; it.vy = vy; it.vz = vz;
    it.life = it.max = life; it.s0 = s0; it.s1 = s1; it.g = g; it.drag = drag; it.color = color; it.sway = 0;
    it.rx = Math.random() * 6; it.ry = Math.random() * 6; it.wx = rnd(-10, 10); it.wy = rnd(-10, 10);
    return it;
  }
  function ring(x, y, z, r0, r1, life, color, opacity = 0.9, star = false) {
    let best = rings[0];
    for (const r of rings) { if (r.life <= 0) { best = r; break; } if (r.life < best.life) best = r; }
    best.life = best.max = life; best.r0 = r0; best.r1 = r1; best.op = opacity;
    best.m.geometry = star ? starGeo : ringGeo;
    best.star = star; best.m.rotation.set(0, 0, 0);
    best.m.material.color.set(color);
    best.m.position.set(x, y, z);
    best.m.visible = true;
  }
  function burst(pool, n, x, y, z, color, { speed = [2, 3], cone = 60, life = 0.35, size = [0.05, 0.05], up = 1, g = GRAV, shrink = true } = {}) {
    const half = (cone * Math.PI) / 360;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, tilt = Math.random() * half + (up ? 0 : Math.PI / 2 - half / 2);
      const sp = rnd(speed[0], speed[1]), sh = Math.sin(tilt) * sp;
      const s = rnd(size[0], size[1]);
      spawn(pool, x, y, z, Math.cos(a) * sh, Math.cos(tilt) * sp, Math.sin(a) * sh, life * rnd(0.75, 1.1), s, shrink ? s * 0.3 : s, color, g);
    }
  }

  const fx = {
    reduced,
    drop(x, y, z, vx, vy, vz, life, size, color = C.foam, g = GRAV) { spawn(drops, x, y, z, vx, vy, vz, life, size, size * 0.3, color, g); },
    ring,
    /** type: eventos do contrato + internos ('pop' com opts.color, 'puff', 'bubbles'). */
    emit(type, pos, opts = {}) {
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return;
      const { x, y, z } = pos;
      switch (type) {
        case 'splash':
          burst(drops, 28, x, y, z, C.foam, { speed: [4, 7], cone: 40, life: 0.7, size: [0.06, 0.12] });
          ring(x, y + 0.08, z, 0.4, 2.5, 0.5, C.foam);
          break;
        case 'slideStart':
          burst(drops, 8, x, y + 0.1, z, C.foam, { speed: [2, 3], cone: 60, life: 0.35, size: [0.05, 0.06] });
          break;
        case 'land':
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Math.random();
            spawn(drops, x, y + 0.08, z, Math.cos(a) * 1.6, 0.5, Math.sin(a) * 1.6, 0.3, 0.08, 0.2, '#ffffff', 0, 3);
          }
          break;
        case 'jump':
          ring(x, y + 0.05, z, 0.3, 1.0, 0.2, '#ffffff', 0.8);
          break;
        case 'dive':
          ring(x, y + 0.4, z, 0.3, 1.0, 0.2, '#ffffff', 0.8);
          for (let i = 0; i < 6; i++) spawn(quads, x, y + 0.6, z, rnd(-1.5, 1.5), rnd(0.5, 2), rnd(-1.5, 1.5), 0.5, 0.13, 0.05, '#FFF8E7', 5, 2);
          break;
        case 'boost':
          ring(x, y + 0.06, z, 1, 3, 0.3, C.boost);
          for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            spawn(drops, x + Math.cos(a) * 0.8, y + rnd(0.2, 1.3), z + Math.sin(a) * 0.8, 0, rnd(1, 3), 0, 0.25, 0.07, 0.02, C.boost, 0);
          }
          break;
        case 'hit':
          burst(drops, 20, x, y + 0.6, z, opts.color || C.jetLow, { speed: [3, 6], cone: 150, life: 0.45, size: [0.06, 0.11] });
          ring(x, y + 0.6, z, 0.2, 1.4, 0.18, '#ffffff', 0.9, true);
          break;
        case 'confetti': {
          const n = reduced ? 12 : 60;
          for (let i = 0; i < n; i++) {
            const it = spawn(quads, x + rnd(-2.5, 2.5), y + rnd(2.5, 5), z + rnd(-2.5, 2.5), rnd(-1, 1), rnd(-0.5, 1.5), rnd(-1, 1), rnd(1.6, 2.2), 0.12, 0.12, PLAYER_COLORS[i % 8], 3, 2);
            it.sway = rnd(2, 5);
          }
          break;
        }
        case 'pop': {
          const col = opts.color || C.primary;
          for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2, e = rnd(-0.2, 1), sp = rnd(5, 8), ch = Math.cos(e) * sp;
            spawn(quads, x, y, z, Math.cos(a) * ch, Math.sin(e) * sp, Math.sin(a) * ch, 0.6, 0.17, 0.1, i % 4 === 3 ? '#ffffff' : col, GRAV, 2.5);
          }
          ring(x, y, z, 0.3, 1.3, 0.12, '#ffffff', 1, true);
          ring(x, y - 0.4, z, 0.4, 1.6, 0.3, C.foam, 0.8);
          break;
        }
        case 'puff':
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            spawn(drops, x, y, z, Math.cos(a) * 2, rnd(0.5, 2), Math.sin(a) * 2, 0.4, 0.16, 0.03, C.foam, 2, 3);
          }
          break;
        case 'bubbles':
          for (let i = 0; i < (opts.n || 2); i++) {
            const a = Math.random() * Math.PI * 2, r = opts.r || 1;
            spawn(drops, x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0, rnd(0.6, 1.4), 0, 0.5, 0.09, 0.02, C.foam, 0);
          }
          break;
        default: // tipo desconhecido: ignora
      }
    },
    beginBlobs() { nBlobs = 0; },
    /** Sombra blob no chão (ground = {y,nx,ny,nz}); h = altura do personagem acima do chão. */
    blob(x, z, ground, h, size = 1) {
      if (nBlobs >= MAX_BLOBS || h > 12) return;
      const k = Math.max(0.25, 1 - h / 12);
      _n.set(ground.nx ?? 0, ground.ny ?? 1, ground.nz ?? 0);
      _q.setFromUnitVectors(_up, _n);
      _p.set(x, ground.y + 0.04, z);
      const s = 1.15 * size * (0.6 + 0.4 * k);
      _s.set(s, 1, s);
      blobs.setMatrixAt(nBlobs++, _m.compose(_p, _q, _s));
    },
    endBlobs() { blobs.count = nBlobs; blobs.instanceMatrix.needsUpdate = true; },
    update(dt, camera) {
      for (const pool of [drops, quads]) {
        const isQuad = pool === quads;
        let i = 0;
        while (i < pool.n) {
          const it = pool.items[i];
          it.life -= dt;
          if (it.life <= 0) { // remove trocando com o último
            pool.n--;
            pool.items[i] = pool.items[pool.n]; pool.items[pool.n] = it;
            continue;
          }
          it.vy -= it.g * dt;
          if (it.drag) { const d = Math.max(0, 1 - it.drag * dt); it.vx *= d; it.vz *= d; if (it.g < 6) it.vy *= d; }
          if (it.sway) { it.vy = Math.max(it.vy, -1.5); it.x += Math.sin(it.life * it.sway) * dt * 0.8; }
          it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
          const u = 1 - it.life / it.max;
          let s = it.s0 + (it.s1 - it.s0) * u;
          if (it.life < 0.08) s *= it.life / 0.08;
          _p.set(it.x, it.y, it.z);
          if (isQuad) { it.rx += it.wx * dt; it.ry += it.wy * dt; _q.setFromEuler(_e.set(it.rx, it.ry, 0)); } else _q.identity();
          _s.set(s, s, s);
          pool.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
          pool.mesh.setColorAt(i, _c.set(it.color));
          i++;
        }
        pool.mesh.count = pool.n;
        pool.mesh.instanceMatrix.needsUpdate = true;
        if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
      }
      for (const r of rings) {
        if (r.life <= 0) continue;
        r.life -= dt;
        if (r.life <= 0) { r.m.visible = false; continue; }
        const u = 1 - r.life / r.max, s = r.r0 + (r.r1 - r.r0) * (1 - (1 - u) * (1 - u));
        r.m.scale.setScalar(s);
        if (r.star && camera) r.m.quaternion.copy(camera.quaternion);
        r.m.material.opacity = r.op * (1 - u * u);
      }
    },
    clear() {
      drops.n = quads.n = 0; drops.mesh.count = quads.mesh.count = 0;
      for (const r of rings) { r.life = 0; r.m.visible = false; }
    },
    dispose() {
      for (const o of [drops.mesh, quads.mesh, blobs, ...rings.map((r) => r.m)]) { scene.remove(o); o.material.dispose(); }
      drops.mesh.geometry.dispose(); quads.mesh.geometry.dispose(); blobs.geometry.dispose(); ringGeo.dispose(); starGeo.dispose();
      drops.mesh.dispose(); quads.mesh.dispose(); blobs.dispose();
    },
  };
  return fx;
}
