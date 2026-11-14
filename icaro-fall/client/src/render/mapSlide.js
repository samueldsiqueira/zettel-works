// Mapa 1 — Tobogã Radical. Desenha exatamente os dados de colisão de shared/maps/slide.js.
import * as THREE from 'three';
import { slideMap, HALF_W, CURVE } from '../../../shared/maps/slide.js';
import { C, vcToon, toon, glossy, own, canvasTexture, checkerTexture, stripeTexture, textTexture, disposeTree } from './palette.js';
import { Builder, DEG, addPalm } from './geo.js';

const SECTOR = ['#FFD23F', '#FF7E5F', '#9B6BFF'];
const sectorOf = (s) => (s < 230 ? 0 : s < 470 ? 1 : 2);

/**
 * Varre um perfil (d lateral, h altura relativa ao centro) ao longo das amostras [i0, i1].
 * profile: [{ d, h, nd, nh }] (normal no espaço do perfil); arestas entre pontos consecutivos; `brk` quebra a tira.
 * colorAt(i, j) -> cor do segmento i, aresta j. uvAt opcional (d, s) -> [u, v].
 */
function sweep(samples, i0, i1, profile, colorAt, uvAt) {
  const pos = [], nor = [], col = [], uv = [], idx = [];
  const c = new THREE.Color();
  const slope = (i) => {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    return (b.y - a.y) / (b.s - a.s || 1);
  };
  const put = (i, q, m) => {
    const p = samples[i], lx = -p.tz, lz = p.tx;
    pos.push(p.x + lx * q.d, p.y + q.h, p.z + lz * q.d);
    let nx = lx * q.nd - p.tx * m * q.nh, ny = q.nh, nz = lz * q.nd - p.tz * m * q.nh;
    const l = Math.hypot(nx, ny, nz) || 1;
    nor.push(nx / l, ny / l, nz / l);
    col.push(c.r, c.g, c.b);
    if (uvAt) { const t = uvAt(q.d, p.s); uv.push(t[0], t[1]); }
  };
  for (let i = i0; i < i1; i++) {
    const m0 = slope(i), m1 = slope(i + 1);
    for (let j = 0; j < profile.length - 1; j++) {
      const a = profile[j], b = profile[j + 1];
      if (a.brk) continue;
      if (colorAt) c.set(colorAt(i, j)); else c.set('#ffffff');
      const k = pos.length / 3;
      put(i, a, m0); put(i, b, m0); put(i + 1, b, m1); put(i + 1, a, m1);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (uvAt) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------- boias-animais (origem na base; ~1,5 m; frente = +Z) ----------
function eye(b, x, y, z, r, pupil = true) {
  b.sphere(r, '#ffffff', { p: [x, y, z] }, 10, 8);
  if (pupil) b.sphere(r * 0.52, C.ink, { p: [x * 1.02, y, z + r * 0.62] }, 8, 6);
}
function duckGeo() {
  const b = new Builder(), Y = '#FFD23F';
  b.sphere(0.5, Y, { p: [0, 0.42, 0], s: [1, 0.8, 1.2] }, 16, 12);
  b.sphere(0.28, Y, { p: [0, 0.9, 0.35] }, 14, 10);
  b.cone(0.11, 0.2, C.warn, { p: [0, 0.86, 0.68], r: [90 * DEG, 0, 0], s: [1.3, 1, 0.6] });
  for (const sx of [-1, 1]) {
    b.sphere(0.25, '#FFC21A', { p: [sx * 0.46, 0.45, -0.05], s: [0.3, 0.6, 1] }, 10, 8);
    b.sphere(0.045, C.ink, { p: [sx * 0.13, 0.98, 0.58] }, 8, 6);
  }
  b.cone(0.13, 0.26, Y, { p: [0, 0.72, -0.55], r: [-25 * DEG, 0, 0] });
  return b.build();
}
function octopusGeo() {
  const b = new Builder(), P = '#B26BFF';
  b.sphere(0.5, P, { p: [0, 0.68, 0], s: [1, 1.1, 1] }, 16, 12);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.39;
    const m = new THREE.Matrix4().makeRotationY(a);
    b.capsule(0.09, 0.35, P, { p: [0, 0.2, 0.46], r: [-55 * DEG, 0, 0], m });
    b.sphere(0.08, '#E2C6FF', { p: [0, 0.07, 0.68], m }, 8, 6);
  }
  for (const sx of [-1, 1]) {
    eye(b, sx * 0.19, 0.8, 0.41, 0.1);
    b.sphere(0.07, '#FF8FC0', { p: [sx * 0.33, 0.62, 0.36], s: [1, 0.7, 0.4] }, 8, 6);
  }
  b.torus(0.05, 0.015, C.ink, { p: [0, 0.62, 0.49], r: [0, 0, Math.PI] }, Math.PI, 8);
  return b.build();
}
function pufferGeo() {
  const b = new Builder(), T = '#3FD6C2';
  b.sphere(0.58, T, { p: [0, 0.62, 0] }, 18, 14);
  b.add(new THREE.SphereGeometry(0.59, 18, 8, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.42), '#FFF3B0', { p: [0, 0.62, 0] });
  let n = 0;
  for (let ring = 0; ring < 3; ring++) {
    const cnt = [1, 5, 8][ring], el = [90, 55, 22][ring] * DEG;
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * Math.PI * 2 + ring * 0.5 + 0.3;
      if (ring === 2 && Math.abs(Math.sin(a)) < 0.45 && Math.cos(a) > 0) continue; // livra o rosto
      const dir = new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const m = new THREE.Matrix4().compose(dir.clone().multiplyScalar(0.64).add(new THREE.Vector3(0, 0.62, 0)), q, new THREE.Vector3(1, 1, 1));
      b.cone(0.07, 0.18, '#ffffff', { m }, 6);
      n++;
    }
  }
  for (const sx of [-1, 1]) {
    b.cone(0.16, 0.3, C.warn, { p: [sx * 0.66, 0.6, -0.05], r: [0, 0, -sx * 90 * DEG], s: [1, 1, 0.3] }, 6);
    eye(b, sx * 0.24, 0.84, 0.44, 0.12);
  }
  b.cone(0.2, 0.34, C.warn, { p: [0, 0.62, -0.68], r: [-90 * DEG, 0, 0], s: [0.3, 1, 1] }, 6);
  b.torus(0.065, 0.028, C.accent, { p: [0, 0.6, 0.575] }, Math.PI * 2, 12);
  return b.build();
}
const BUOY_COLORS = ['#FFD23F', '#B26BFF', '#3FD6C2'];

export function createSlideMap(env) {
  const map = slideMap, S = map.samples, N = S.length, sp = map.startPlatform;
  const group = new THREE.Group();
  const anim = []; // funções (t, time, dt)

  // índice da amostra em s
  const idxAt = (s) => { let i = 0; while (i < N - 1 && S[i].s < s) i++; return i; };
  const iFin = idxAt(map.finishS);

  // ----- pista: superfície interna (colisão: y = yc + CURVE·d², |d| ≤ HALF_W) -----
  const inner = [];
  for (let j = 0; j <= 12; j++) {
    const d = -HALF_W + (j * 2 * HALF_W) / 12, g = 2 * CURVE * d, l = Math.hypot(g, 1);
    inner.push({ d, h: CURVE * d * d, nd: -g / l, nh: 1 / l });
  }
  const tint = (hex, k) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();
  const POOL_TILE = '#D8F6FF';
  const trackGeo = sweep(S, 0, N - 1, inner, (i, j) => {
    const s = S[i].s;
    if (i >= iFin + 3) return (Math.floor(s / 2) + j) % 2 ? POOL_TILE : '#ffffff';
    if (i >= iFin && i < iFin + 3) return (i + j) % 2 ? C.ink : '#ffffff'; // linha de chegada quadriculada
    if (s % 20 < 1.15) return '#ffffff';
    const base = SECTOR[sectorOf(s)];
    return j === 0 || j === 11 ? tint(base, 0.35) : base;
  });
  const track = new THREE.Mesh(trackGeo, vcToon());
  group.add(track);

  // casco externo + lábio arredondado (tubo branco raio 0,25 na borda)
  const topH = CURVE * HALF_W * HALF_W; // 1,5 m
  const W = HALF_W + 0.42;
  const outer = [
    { d: HALF_W, h: topH, nd: 0, nh: 1 }, { d: W, h: topH, nd: 0, nh: 1, brk: true },
    { d: W, h: topH, nd: 1, nh: 0 }, { d: W, h: 0.45, nd: 1, nh: 0, brk: true },
    { d: W, h: 0.45, nd: 0.5, nh: -0.87 }, { d: 3.3, h: -0.6, nd: 0.5, nh: -0.87, brk: true },
    { d: 3.3, h: -0.6, nd: 0, nh: -1 }, { d: -3.3, h: -0.6, nd: 0, nh: -1, brk: true },
    { d: -3.3, h: -0.6, nd: -0.5, nh: -0.87 }, { d: -W, h: 0.45, nd: -0.5, nh: -0.87, brk: true },
    { d: -W, h: 0.45, nd: -1, nh: 0 }, { d: -W, h: topH, nd: -1, nh: 0, brk: true },
    { d: -W, h: topH, nd: 0, nh: 1 }, { d: -HALF_W, h: topH, nd: 0, nh: 1 },
  ];
  group.add(new THREE.Mesh(sweep(S, 0, N - 1, outer, (i, j) => (j === 0 || j === 12 ? '#ffffff' : tint(SECTOR[sectorOf(S[i].s)], 0.55))), vcToon()));
  for (const sg of [-1, 1]) {
    const tube = [];
    for (let k = 0; k <= 8; k++) {
      const a = -(k / 8) * Math.PI * 2;
      tube.push({ d: sg * (HALF_W + 0.2) + Math.cos(a) * 0.25, h: topH + 0.02 + Math.sin(a) * 0.25, nd: Math.cos(a), nh: Math.sin(a) });
    }
    group.add(new THREE.Mesh(sweep(S, 0, N - 1, tube, null), toon('#ffffff')));
  }

  // lâmina d'água corrente (faixa central de 4 m)
  const sheet = [];
  for (let j = 0; j <= 4; j++) { const d = -2 + j; sheet.push({ d, h: CURVE * d * d + 0.05, nd: 0, nh: 1 }); }
  const streakTex = canvasTexture(128, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(189,242,255,0.45)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const xs = [10, 38, 62, 90, 112, 24, 76, 100], ys = [10, 120, 60, 190, 20, 200, 150, 90];
    for (let i = 0; i < 8; i++) { ctx.fillRect(xs[i], ys[i], 5, 62); ctx.fillRect(xs[i], ys[i] - h, 5, 62); }
  }, { repeat: true });
  const sheetMat = own(new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, depthWrite: false }));
  const sheetMesh = new THREE.Mesh(sweep(S, 0, iFin + 4, sheet, null, (d, s) => [(d + 2) / 4, s / 6]), sheetMat);
  sheetMesh.renderOrder = 2;
  group.add(sheetMesh);
  anim.push((t, time, dt) => { streakTex.offset.y = (streakTex.offset.y - (12 / 6) * dt) % 1; });

  // piscina de chegada: água mais clara cobrindo o fundo da calha após o pórtico
  const POOL_H = 0.4, pd = Math.sqrt(POOL_H / CURVE);
  const pool = [{ d: -pd, h: POOL_H, nd: 0, nh: 1 }, { d: 0, h: POOL_H, nd: 0, nh: 1 }, { d: pd, h: POOL_H, nd: 0, nh: 1 }];
  const poolMesh = new THREE.Mesh(sweep(S, iFin + 3, N - 1, pool, null), own(new THREE.MeshStandardMaterial({ color: '#5FE0EA', roughness: 0.15, transparent: true, opacity: 0.72, depthWrite: false })));
  poolMesh.renderOrder = 2;
  group.add(poolMesh);

  // deck em volta da piscina (acompanha a pista; só cenário — as paredes da calha impedem a saída)
  const DW = 10;
  const deck = [
    { d: -DW, h: -2.2, nd: -1, nh: 0 }, { d: -DW, h: topH, nd: -1, nh: 0, brk: true },
    { d: -DW, h: topH, nd: 0, nh: 1 }, { d: -W, h: topH, nd: 0, nh: 1, brk: true },
    { d: W, h: topH, nd: 0, nh: 1 }, { d: DW, h: topH, nd: 0, nh: 1, brk: true },
    { d: DW, h: topH, nd: 1, nh: 0 }, { d: DW, h: -2.2, nd: 1, nh: 0 },
  ];
  const i0d = Math.max(0, iFin - 4);
  group.add(new THREE.Mesh(sweep(S, i0d, N - 1, deck, (i, j) => (j === 2 || j === 4 ? ((Math.floor(S[i].s / 2)) % 2 ? C.sand : C.sand2) : '#ffffff')), vcToon()));

  // ----- estático mesclado: pilares, largada, pórtico, cenário -----
  const b = new Builder();
  const frame = (p, extraY = 0) => new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y + extraY, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p.tx, p.tz)), new THREE.Vector3(1, 1, 1));

  // tampa do fim da pista + deck final
  {
    const e = map.trackPoint(map.totalS, 0), m = frame(e);
    b.box(2 * DW, topH + 2.2, 0.6, '#ffffff', { p: [0, (topH - 2.2) / 2, 0.3], m });
    b.box(2 * DW, topH + 2.2, 5, C.sand, { p: [0, (topH - 2.2) / 2 - 0.02, 3.1], m });
    const pm = (x, z) => new THREE.Vector3(x, topH, z).applyMatrix4(m);
    for (const [x, z, yw] of [[-7, 3.5, 0.5], [7, 3.5, 2.5], [0, 4.2, 4]]) { const v = pm(x, z); addPalm(b, v.x, v.y - 0.1, v.z, yw, 4.5); }
  }
  // pilares a cada 25 m
  for (let s = 14; s < map.finishS - 12; s += 25) {
    const p = map.trackPoint(s, 0), bot = map.waterY - 2, h = p.y - 0.6 - bot;
    b.cyl(0.6, 0.6, h, '#ffffff', { p: [p.x, bot + h / 2, p.z] }, 10);
    b.torus(0.85, 0.22, C.accent, { p: [p.x, p.y - 1.7, p.z], r: [90 * DEG, 0, 0] }, Math.PI * 2, 14);
    b.box(7, 0.5, 1.2, '#ffffff', { p: [0, -0.86, 0], m: frame(p) });
  }
  // plataforma de largada (colisão: retângulo x0..x1, z0..z1 em y)
  const cx = (sp.x0 + sp.x1) / 2, cz = (sp.z0 + sp.z1) / 2, sw = sp.x1 - sp.x0, sd = sp.z1 - sp.z0;
  b.box(sw, 1, sd, C.sand, { p: [cx, sp.y - 0.5, cz] });
  b.box(sw + 0.5, 0.9, sd + 0.5, '#ffffff', { p: [cx, sp.y - 0.52, cz] });
  for (let i = 0; i < 3; i++) b.box(sw - 2, 0.02, 0.25, C.sand2, { p: [cx, sp.y + 0.005, sp.z0 + 4.5 + i * 3] });
  // arco de largada
  for (const sx of [-1, 1]) {
    b.cyl(0.4, 0.4, 7, C.accent, { p: [sx * 7.9, sp.y + 2.3, sp.z0 + 0.4] }, 12);
    b.sphere(0.55, C.primary, { p: [sx * 7.9, sp.y + 5.9, sp.z0 + 0.4] }, 10, 8);
  }
  b.box(16.6, 1.3, 0.45, C.ink, { p: [0, sp.y + 5.0, sp.z0 + 0.4] });
  // torre de rocha sob a largada (fica sempre abaixo da pista)
  {
    const top = sp.y - 1.0, bot = map.waterY - 2, mz = 12.2, layers = 5, hh = (top - bot) / layers;
    for (let i = 0; i < layers; i++) {
      const y1 = top - i * hh, r1 = 12 + i * hh * 0.14, r0 = 12 + (i + 1) * hh * 0.14;
      b.cyl(r1, r0, hh, i % 2 ? '#EFC58A' : '#F7D9A4', { p: [0, y1 - hh / 2, mz] }, 20);
    }
    b.cyl(12.3, 12.3, 0.5, C.grass, { p: [0, top - 0.15, mz] }, 20);
    addPalm(b, -9, top, 19, 0.5, 5); addPalm(b, 9.5, top, 17.5, 2.6, 4.4); addPalm(b, 2, top, 21.5, 4, 5.5);
  }
  // pórtico de chegada
  const fin = map.trackPoint(map.finishS, 0), fm = frame(fin);
  for (const sx of [-1, 1]) {
    b.cyl(0.6, 0.6, 9, C.primary, { p: [sx * 6.3, 3.3, 0], m: fm }, 14);
    b.sphere(0.75, C.accent, { p: [sx * 6.3, 7.9, 0], m: fm }, 12, 8);
  }
  b.box(13.4, 1.4, 0.5, '#ffffff', { p: [0, 6.6, 0], m: fm });
  // colinas ao redor
  for (const [x, z, r, h, col] of [[-150, -120, 60, 46, '#7BD66A'], [165, -260, 75, 60, '#6CCB7A'], [-170, -420, 70, 40, '#7BD66A'], [150, -30, 50, 34, '#8FE07A'], [120, -560, 55, 30, '#6CCB7A'], [-60, -640, 60, 36, '#8FE07A']]) {
    b.sphere(r, col, { p: [x, map.waterY - 4, z], s: [1, h / r, 1] }, 18, 10);
    b.sphere(r * 0.55, C.sand, { p: [x + r * 0.6, map.waterY - 3, z + r * 0.5], s: [1, 0.12, 1] }, 14, 6);
  }
  // cones dos aceleradores
  for (const p of map.pads) for (const sg of [-1, 1]) {
    const q = map.trackPoint(p.s, p.d + sg * 1.85);
    b.cone(0.22, 0.5, C.boost, { p: [q.x, q.y + 0.25, q.z] }, 8);
  }
  group.add(b.mesh(vcToon()));

  // textos / quadriculados
  const nameTex = textTexture('TOBOGÃ RADICAL');
  for (const sg of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(15, 1.1), own(new THREE.MeshBasicMaterial({ map: nameTex })));
    m.position.set(0, sp.y + 5.0, sp.z0 + 0.4 + sg * 0.235);
    if (sg < 0) m.rotation.y = Math.PI;
    group.add(m);
  }
  const chk = checkerTexture(28, 2);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(sw, 1).rotateX(-Math.PI / 2), own(new THREE.MeshBasicMaterial({ map: chk })));
  line.position.set(cx, sp.y + 0.02, sp.z0 + 0.5);
  group.add(line);
  const chk2 = checkerTexture(24, 2);
  const banner = new THREE.Group();
  banner.applyMatrix4(fm);
  for (const sg of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 1.2), own(new THREE.MeshBasicMaterial({ map: chk2 })));
    m.position.set(0, 6.6, sg * 0.26);
    if (sg < 0) m.rotation.y = Math.PI;
    banner.add(m);
  }
  // bandeirolas
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.45, 0, 0, -0.45, 0, 1.5, 0, 0], 3));
  flagGeo.computeVertexNormals();
  const flags = [];
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) {
    const f = new THREE.Mesh(flagGeo, own(new THREE.MeshBasicMaterial({ color: k ? C.accent : C.info, side: THREE.DoubleSide })));
    f.position.set(sx * 6.9, 5.2 - k * 1.4, 0);
    f.userData.base = sx > 0 ? 0 : Math.PI; f.userData.ph = k * 1.3 + sx;
    banner.add(f); flags.push(f);
  }
  group.add(banner);
  anim.push((t, time) => { for (const f of flags) f.rotation.y = f.userData.base + 20 * DEG * Math.sin((time * Math.PI * 2) / 0.4 + f.userData.ph); });

  // barreira de largada (some no "JÁ!", t >= 0)
  const barTex = stripeTexture(C.danger, '#ffffff', 16);
  barTex.repeat.set(2, 1);
  const barrier = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, sw + 1.2, 10).rotateZ(Math.PI / 2), own(new THREE.MeshBasicMaterial({ map: barTex })));
  barrier.position.set(cx, sp.y + 0.85, sp.z0 + 1.3);
  group.add(barrier);
  anim.push((t) => { barrier.visible = t < 0; });

  // ----- setas aceleradoras: tapetes moldados à pista (colisão: círculo r=1,7 no centro) -----
  {
    const pos = [], uv = [], idx = [];
    const NA = 5, NL = 6, PW = 3.0, PL = 3.6;
    for (const p of map.pads) {
      const k0 = pos.length / 3;
      for (let a = 0; a <= NL; a++) for (let c = 0; c <= NA; c++) {
        const ds = (a / NL - 0.5) * PL, dd = (c / NA - 0.5) * PW;
        const q = map.trackPoint(p.s + ds, p.d + dd);
        pos.push(q.x, q.y + 0.07, q.z);
        uv.push(c / NA, (a / NL) * 3);
      }
      for (let a = 0; a < NL; a++) for (let c = 0; c < NA; c++) {
        const k = k0 + a * (NA + 1) + c;
        idx.push(k, k + NA + 2, k + 1, k, k + NA + 1, k + NA + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const tex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = C.warn; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = C.boost; ctx.lineWidth = 26; ctx.lineJoin = 'miter';
      for (const oy of [0, h, -h]) { ctx.beginPath(); ctx.moveTo(10, 96 + oy); ctx.lineTo(64, 36 + oy); ctx.lineTo(118, 96 + oy); ctx.stroke(); }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 6, h); ctx.fillRect(w - 6, 0, 6, h);
    }, { repeat: true });
    const m = new THREE.Mesh(g, own(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
    group.add(m);
    anim.push((t, time, dt) => { tex.offset.y = (tex.offset.y - dt / 0.3) % 1; });
  }

  // ----- boias-animais -----
  const geos = [duckGeo(), octopusGeo(), pufferGeo()];
  const buoyMat = glossy();
  const buoys = new Map();
  const buoyGroup = new THREE.Group();
  for (const q of map.buoys) {
    const m = new THREE.Mesh(geos[q.animal % 3], buoyMat);
    const tp = map.trackPoint(q.s, q.d);
    m.position.set(q.x, q.y - 0.5, q.z);
    m.rotation.order = 'YXZ';
    m.rotation.y = Math.atan2(-tp.tx, -tp.tz); // de frente para quem desce
    m.scale.setScalar(1.3);
    buoyGroup.add(m);
    buoys.set(q.id, { m, q, baseY: q.y - 0.5, pop: -1, ph: q.id * 1.7 });
  }
  group.add(buoyGroup);

  env.setWaterY(map.waterY);
  env.setIslets([{ x: -70, z: -200, r: 13 }, { x: 80, z: -90, r: 10 }, { x: 75, z: -380, r: 14 }, { x: -85, z: -520, r: 11 }, { x: 60, z: 60, r: 12 }], map.waterY);

  return {
    id: 'slide', map, group, waterY: map.waterY,
    present: { x: 0, y: sp.y - 4, z: -22, radius: 44, height: 16, fov: 55 },
    groundAt: (x, z, yRef, t, out) => map.groundAt(x, z, yRef, t, out),
    update(t, dt, time) {
      for (const f of anim) f(t, time, dt);
      for (const bu of buoys.values()) {
        if (bu.pop >= 0) {
          bu.pop += dt;
          if (bu.pop > 0.07) { bu.m.visible = false; bu.pop = -1; } else bu.m.scale.setScalar(1.3 * (1 + (0.25 * bu.pop) / 0.06));
        } else if (bu.m.visible) {
          const w = (time * Math.PI * 2) / 1.6 + bu.ph;
          bu.m.position.y = bu.baseY + 0.05 + 0.05 * Math.sin(w);
          bu.m.rotation.z = 5 * DEG * Math.sin(w * 0.5 + 1); bu.m.rotation.x = 4 * DEG * Math.cos(w * 0.5);
        }
      }
    },
    popBuoy(id, fx) {
      const bu = buoys.get(id);
      if (!bu || !bu.m.visible || bu.pop >= 0) return;
      bu.pop = 0;
      if (fx) fx.emit('pop', { x: bu.q.x, y: bu.q.y + 0.2, z: bu.q.z }, { color: BUOY_COLORS[bu.q.animal % 3] });
    },
    dispose() {
      for (const g of geos) g.dispose();
      buoyGroup.clear();
      disposeTree(group);
    },
  };
}
