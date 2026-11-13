// Mapa 3 — Labirinto de Jatos. Geometria lida de shared/maps/jets.js (anéis, grades, pódio, jatos).
// Ângulo polar theta = atan2(z, x).
import * as THREE from 'three';
import { jetsMap, jetAngle, FLOOR_Y, LOW_BAND, HIGH_BAND, JET_RADIUS } from '../../../shared/maps/jets.js';
import { C, vcToon, toon, own, canvasTexture, checkerTexture, disposeTree } from './palette.js';
import { Builder, DEG, annulusGeo, flatRingGeo } from './geo.js';

const RING_EDGE = ['#FF7E5F', '#FFD23F', '#3FA9F5']; // interno → externo (progresso = cor mais quente)

function markTexture(up, color) {
  return canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (up) { ctx.moveTo(32, 10); ctx.lineTo(56, 52); ctx.lineTo(8, 52); } else { ctx.moveTo(32, 54); ctx.lineTo(56, 12); ctx.lineTo(8, 12); }
    ctx.closePath(); ctx.stroke(); ctx.fill();
  });
}

export function createJetsMap(env) {
  const map = jetsMap;
  const group = new THREE.Group();
  const b = new Builder();
  const BOT = -0.8;

  // ----- anéis: topo creme com bordas coloridas de 0,4 m; lateral branca -----
  map.rings.forEach((rg, i) => {
    const col = RING_EDGE[i % 3], e = 0.4;
    b.add(annulusGeo(rg.r0, rg.r0 + e, FLOOR_Y, BOT, 0, Math.PI * 2, 96), col);
    b.add(annulusGeo(rg.r0 + e, rg.r1 - e, FLOOR_Y, FLOOR_Y - 0.3, 0, Math.PI * 2, 96), C.sand2);
    b.add(annulusGeo(rg.r1 - e, rg.r1, FLOOR_Y, BOT, 0, Math.PI * 2, 96), col);
    // lateral branca (logo abaixo da borda colorida)
    b.add(annulusGeo(rg.r0 - 0.02, rg.r1 + 0.02, FLOOR_Y - 0.28, BOT, 0, Math.PI * 2, 96), '#ffffff');
  });

  // ----- grades: setor r ± halfR, ângulo a ± halfT/r -----
  for (const g of map.grates) {
    const ha = g.halfT / g.r, a0 = g.a - ha, a1 = g.a + ha, r0 = g.r - g.halfR, r1 = g.r + g.halfR;
    const fw = 0.2, y0 = FLOOR_Y - 0.22, seg = 6;
    // moldura
    b.add(annulusGeo(r0, r0 + fw, FLOOR_Y, y0, a0, a1, seg), '#ffffff');
    b.add(annulusGeo(r1 - fw, r1, FLOOR_Y, y0, a0, a1, seg), '#ffffff');
    b.add(annulusGeo(r0 + fw, r1 - fw, FLOOR_Y, y0, a0, a0 + fw / g.r, 1), '#ffffff');
    b.add(annulusGeo(r0 + fw, r1 - fw, FLOOR_Y, y0, a1 - fw / g.r, a1, 1), '#ffffff');
    // barras (6 por direção)
    for (let k = 1; k <= 6; k++) {
      const rr = r0 + fw + ((r1 - r0 - 2 * fw) * k) / 7;
      b.add(annulusGeo(rr - 0.04, rr + 0.04, FLOOR_Y - 0.02, y0 + 0.04, a0, a1, seg), C.metal);
      const aa = a0 + ((a1 - a0) * k) / 7, hw = 0.04 / g.r;
      b.add(annulusGeo(r0 + fw, r1 - fw, FLOOR_Y - 0.02, y0 + 0.04, aa - hw, aa + hw, 1), C.metal);
    }
    // boias de sustentação sob os cantos
    for (const [rr, aa] of [[r0 + 0.3, a0 + 0.3 / g.r], [r1 - 0.3, a0 + 0.3 / g.r], [r0 + 0.3, a1 - 0.3 / g.r], [r1 - 0.3, a1 - 0.3 / g.r]]) {
      b.cyl(0.26, 0.26, 0.9, C.warn, { p: [Math.cos(aa) * rr, FLOOR_Y - 0.65, Math.sin(aa) * rr] }, 8);
    }
  }

  // ----- pódio central -----
  const pd = map.podium;
  b.add(annulusGeo(pd.r - 0.4, pd.r, pd.y, BOT, 0, Math.PI * 2, 48), C.primary);
  b.add(annulusGeo(0, pd.r - 0.4, pd.y - 0.01, BOT, 0, Math.PI * 2, 48), '#ffffff');
  // torre: listras brancas/azuis + esfera amarela (só cenário)
  for (let i = 0; i < 7; i++) b.cyl(1.2, 1.2, 1, i % 2 ? C.info : '#ffffff', { p: [0, pd.y + 0.5 + i, 0] }, 20);
  b.sphere(1.5, C.primary, { p: [0, pd.y + 7.9, 0] }, 16, 12);
  b.cyl(1.5, 1.5, 0.3, C.accent, { p: [0, pd.y + 0.15, 0] }, 20);
  // arcos de chegada sobre as grades do canal interno
  const innerGrates = map.grates.filter((g) => g.r < map.rings[0].r0).map((g) => g.a).filter((a, i, arr) => arr.findIndex((q) => Math.abs(q - a) < 1e-6) === i);
  const arches = [];
  for (const a of innerGrates) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * (pd.r - 0.35), pd.y, Math.sin(a) * (pd.r - 0.35)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2), new THREE.Vector3(1, 1, 1));
    for (const sx of [-1, 1]) {
      b.cyl(0.18, 0.18, 2.9, C.accent, { p: [sx * 1.5, 1.45, 0], m }, 8);
      b.sphere(0.26, C.primary, { p: [sx * 1.5, 3.0, 0], m }, 8, 6);
    }
    b.box(3.2, 0.6, 0.16, '#ffffff', { p: [0, 2.75, 0], m });
    arches.push(m);
  }
  group.add(b.mesh(vcToon()));

  // piso quadriculado do pódio
  const chk = checkerTexture(8, 8);
  const floor = new THREE.Mesh(flatRingGeo(1.5, pd.r - 0.4, pd.y + 0.005, 48, 0, Math.PI * 2, 4), own(new THREE.MeshToonMaterial({ map: chk, gradientMap: toon('#fff').gradientMap })));
  group.add(floor);
  const chk2 = checkerTexture(10, 2);
  for (const m of arches) for (const sg of [1, -1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.5), own(new THREE.MeshBasicMaterial({ map: chk2 })));
    pl.position.set(0, 2.75, sg * 0.09);
    if (sg < 0) pl.rotation.y = Math.PI;
    const h = new THREE.Group(); h.applyMatrix4(m); h.add(pl); group.add(h);
  }

  // setas (chevrons ink) no piso apontando para cada grade
  {
    const tex = canvasTexture(64, 64, (ctx) => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 12; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(8, 46); ctx.lineTo(32, 18); ctx.lineTo(56, 46); ctx.stroke();
    });
    const pos = [], uv = [], idx = [];
    const addArrow = (r, a, dirOut) => { // quad 1×1 m centrado em (r, a), ponta para fora (dirOut=1) ou para dentro (−1)
      const ca = Math.cos(a), sa = Math.sin(a), k = pos.length / 3;
      const P = (dr, dt) => pos.push(ca * (r + dr) - sa * dt, FLOOR_Y + 0.02, sa * (r + dr) + ca * dt);
      P(-0.5 * dirOut, -0.5); P(-0.5 * dirOut, 0.5); P(0.5 * dirOut, 0.5); P(0.5 * dirOut, -0.5);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    };
    for (const g of map.grates) {
      for (const rg of map.rings) {
        if (Math.abs(rg.r1 - (g.r - g.halfR)) < 2.5) addArrow(rg.r1 - 1.0, g.a, 1);
        if (Math.abs(rg.r0 - (g.r + g.halfR)) < 2.5) addArrow(rg.r0 + 1.0, g.a, -1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    group.add(new THREE.Mesh(geo, own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }))));
  }

  // ----- jatos -----
  // Colisão: |Δθ|·r ≤ JET_RADIUS + raio do jogador, r ∈ [r0, r1], faixa vertical LOW_BAND / HIGH_BAND acima do piso.
  // Baixo (pular): tubo redondo ciano rente ao chão, linha contínua no piso, bocal ▲.
  // Alto (passar por baixo deslizando): cortina alta laranja com vão livre embaixo, linha tracejada, bocal ▼.
  const streak = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const xs = [5, 60, 130, 190, 30, 100, 160, 220], ys = [6, 20, 34, 50, 44, 58, 12, 28];
    for (let i = 0; i < 8; i++) { ctx.fillRect(xs[i], ys[i], 40, 3); ctx.fillRect(xs[i] - w, ys[i], 40, 3); }
  }, { repeat: true });
  const dashTex = canvasTexture(64, 8, (ctx) => { ctx.clearRect(0, 0, 64, 8); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 32, 8); }, { repeat: true });
  const markUp = markTexture(true, '#0FA3C4'), markDown = markTexture(false, '#D9650A');
  const coreGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false).rotateZ(-Math.PI / 2).translate(0.5, 0, 0); // eixo +X, de 0 a 1
  const shellGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).rotateZ(-Math.PI / 2).translate(0.5, 0, 0);
  const lineGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  const shellMats = [];
  const jets = map.jets.map((j) => {
    const low = j.low, band = low ? LOW_BAND : HIGH_BAND, col = low ? C.jetLow : C.jetHigh;
    const yc = FLOOR_Y + (band[0] + band[1]) / 2;
    const ry = low ? (band[1] - band[0]) / 2 - 0.06 : (band[1] - band[0]) / 2; // meia-altura visual
    const rz = low ? 0.3 : JET_RADIUS; // meia-largura visual (colisão: JET_RADIUS)
    const len = j.r1 - j.r0;
    const g = new THREE.Group(); // gira em Y; +X local = direção radial do jato
    const beam = new THREE.Group();
    beam.position.set(j.r0, yc, 0);
    const core = new THREE.Mesh(coreGeo, own(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthWrite: false })));
    core.scale.set(len, ry, rz);
    const st = streak.clone(); st.needsUpdate = true; st.repeat.set(len / 6, 1);
    const shellMat = own(new THREE.MeshBasicMaterial({ color: '#ffffff', map: st, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    shellMats.push(st);
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.scale.set(len, ry * 1.18, rz * 1.4);
    core.renderOrder = 5; shell.renderOrder = 6;
    beam.add(core, shell);
    g.add(beam);
    // linha projetada no piso, só sobre os anéis cobertos
    for (const rg of map.rings) {
      const a = Math.max(rg.r0, j.r0), e = Math.min(rg.r1, j.r1);
      if (e - a < 0.5) continue;
      let mat;
      if (low) mat = own(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false }));
      else {
        const dt = dashTex.clone(); dt.needsUpdate = true; dt.repeat.set((e - a) / 2, 1);
        mat = own(new THREE.MeshBasicMaterial({ color: col, map: dt, transparent: true, depthWrite: false }));
      }
      const ln = new THREE.Mesh(lineGeo, mat);
      ln.scale.set(e - a, 1, 0.3);
      ln.position.set(a, FLOOR_Y + 0.03, 0);
      ln.renderOrder = 2;
      g.add(ln);
    }
    // bocal flutuante: boia na água + mastro + bocal marcado (▲ baixo / ▼ alto)
    const nb = new Builder();
    const nx = j.r0 - 0.35;
    nb.sphere(0.5, '#ffffff', { p: [nx, 0.1, 0], s: [1, 0.7, 1] }, 12, 8);
    nb.torus(0.5, 0.12, col, { p: [nx, 0.15, 0], r: [90 * DEG, 0, 0] }, Math.PI * 2, 12);
    const topY = yc + (low ? 0.15 : ry * 0.75);
    nb.cyl(0.13, 0.13, topY, C.metal, { p: [nx, topY / 2, 0] }, 8);
    nb.box(0.6, low ? 0.6 : ry * 1.7, 0.62, low ? '#0FA3C4' : '#D9650A', { p: [nx, yc, 0] });
    nb.cyl(low ? 0.2 : 0.26, 0.3, 0.35, C.metal, { p: [nx + 0.4, yc, 0], r: [0, 0, 90 * DEG], s: low ? 1 : [1, 1, 1] }, 8);
    g.add(nb.mesh(vcToon()));
    const mk = low ? markUp : markDown;
    for (const sg of [-1, 1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), own(new THREE.MeshBasicMaterial({ map: mk })));
      pl.position.set(nx, yc, sg * 0.32);
      if (sg < 0) pl.rotation.y = Math.PI;
      g.add(pl);
    }
    const mt = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), own(new THREE.MeshBasicMaterial({ map: mk })));
    mt.rotation.y = -Math.PI / 2; mt.position.set(nx - 0.31, yc, 0);
    g.add(mt);
    group.add(g);
    return { j, g, core, shell, st, ry, rz, len, yc, col, acc: Math.random() };
  });

  env.setWaterY(map.waterY);
  env.setIslets([{ x: 100, z: 60, r: 13 }, { x: -110, z: 30, r: 11 }, { x: -30, z: -115, r: 14 }, { x: 40, z: 120, r: 10 }, { x: 120, z: -70, r: 12 }], map.waterY);

  return {
    id: 'jets', map, group, waterY: map.waterY,
    present: { x: 0, y: 1, z: 0, radius: 68, height: 34, fov: 55 },
    groundAt: (x, z, yRef, t, out) => map.groundAt(x, z, yRef, t, out),
    update(t, dt, time, fx) {
      const pulse = 1 + 0.08 * Math.sin(time * Math.PI * 2 * 5);
      const smooth = dt > 0 && dt < 0.2;
      for (const it of jets) {
        const a = jetAngle(it.j, t);
        it.g.rotation.y = -a; // theta = atan2(z, x)  =>  rotação Y de −theta leva +X a (cos, sin)
        it.core.scale.set(it.len, it.ry * (it.j.low ? pulse : 1), it.rz * pulse);
        it.st.offset.x = (it.st.offset.x - (20 / 6) * dt) % 1;
        if (fx && smooth) {
          // gotas ao longo do jato + leque na ponta
          it.acc += dt * it.len * 1.6;
          const ca = Math.cos(a), sa = Math.sin(a);
          while (it.acc > 1) {
            it.acc -= 1;
            const r = it.j.r0 + Math.random() * it.len, y = it.yc + (Math.random() - 0.5) * it.ry * 1.6;
            fx.drop(ca * r, y, sa * r, ca * 2 + (Math.random() - 0.5) * 2, 1 + Math.random(), sa * 2 + (Math.random() - 0.5) * 2, 0.4, 0.05 + Math.random() * 0.04, C.foam);
          }
          if (Math.random() < dt * 20) {
            const r = it.j.r1;
            fx.drop(ca * r, it.yc, sa * r, ca * 3 + (Math.random() - 0.5) * 4, 1 + Math.random() * 3, sa * 3 + (Math.random() - 0.5) * 4, 0.45, 0.09, it.col);
          }
        }
      }
      // chafariz no topo da torre
      if (fx && smooth && Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        fx.drop(0, map.podium.y + 9.4, 0, Math.cos(a) * 2.2, 5 + Math.random() * 2, Math.sin(a) * 2.2, 0.9, 0.12, C.foam);
      }
    },
    popBuoy() {},
    dispose() {
      disposeTree(group);
      for (const t of [streak, dashTex, markUp, markDown]) t.dispose();
      coreGeo.dispose(); shellGeo.dispose(); lineGeo.dispose();
    },
  };
}
