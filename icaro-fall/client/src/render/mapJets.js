// Mapa 3 — Labirinto de Jatos. Geometria lida de shared/maps/jets.js (anéis, grades, pódio, jatos).
// Ângulo polar theta = atan2(z, x).
import * as THREE from 'three';
import { jetsMap, jetAngle, jetSpan, ringState, FLOOR_Y, LOW_BAND, HIGH_BAND, JET_RADIUS, SINK_WARN } from '../../../shared/maps/jets.js';
import { C, vcToon, own, canvasTexture, stripeTexture, gradientMap, disposeTree } from './palette.js';
import { Builder, DEG, annulusGeo, flatRingGeo } from './geo.js';

const RS = {}, SP = {};
const _warn = new THREE.Color(C.warn), _white = new THREE.Color('#ffffff'), _deep = new THREE.Color('#5FB6D6');
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
  const BOT = -0.8;
  const dangerTex = stripeTexture(C.danger, '#ffffff', 4, true);
  const arrowTex = canvasTexture(64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 12; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(8, 46); ctx.lineTo(32, 18); ctx.lineTo(56, 46); ctx.stroke();
  });

  // ----- anéis (+ grades ligadas a cada anel): um grupo por anel, desenhado em y = −ringState.drop -----
  const rings = map.rings.map((rg, i) => {
    const b = new Builder();
    const col = RING_EDGE[i % 3], e = 0.4;
    // topo creme com bordas coloridas de 0,4 m; lateral branca
    b.add(annulusGeo(rg.r0, rg.r0 + e, FLOOR_Y, BOT, 0, Math.PI * 2, 96), col);
    b.add(annulusGeo(rg.r0 + e, rg.r1 - e, FLOOR_Y, FLOOR_Y - 0.3, 0, Math.PI * 2, 96), C.sand2);
    b.add(annulusGeo(rg.r1 - e, rg.r1, FLOOR_Y, BOT, 0, Math.PI * 2, 96), col);
    b.add(annulusGeo(rg.r0 - 0.02, rg.r1 + 0.02, FLOOR_Y - 0.28, BOT, 0, Math.PI * 2, 96), '#ffffff');
    // grades: setor r ± halfR, ângulo a ± halfT/r (afundam junto com o anel g.ring)
    const mine = map.grates.filter((g) => g.ring === rg.id);
    for (const g of mine) {
      const ha = g.halfT / g.r, a0 = g.a - ha, a1 = g.a + ha, r0 = g.r - g.halfR, r1 = g.r + g.halfR;
      const fw = 0.2, y0 = FLOOR_Y - 0.22, seg = 6;
      b.add(annulusGeo(r0, r0 + fw, FLOOR_Y, y0, a0, a1, seg), '#ffffff');
      b.add(annulusGeo(r1 - fw, r1, FLOOR_Y, y0, a0, a1, seg), '#ffffff');
      b.add(annulusGeo(r0 + fw, r1 - fw, FLOOR_Y, y0, a0, a0 + fw / g.r, 1), '#ffffff');
      b.add(annulusGeo(r0 + fw, r1 - fw, FLOOR_Y, y0, a1 - fw / g.r, a1, 1), '#ffffff');
      for (let k = 1; k <= 6; k++) {
        const rr = r0 + fw + ((r1 - r0 - 2 * fw) * k) / 7;
        b.add(annulusGeo(rr - 0.04, rr + 0.04, FLOOR_Y - 0.02, y0 + 0.04, a0, a1, seg), C.metal);
        const aa = a0 + ((a1 - a0) * k) / 7, hw = 0.04 / g.r;
        b.add(annulusGeo(r0 + fw, r1 - fw, FLOOR_Y - 0.02, y0 + 0.04, aa - hw, aa + hw, 1), C.metal);
      }
      for (const [rr, aa] of [[r0 + 0.3, a0 + 0.3 / g.r], [r1 - 0.3, a0 + 0.3 / g.r], [r0 + 0.3, a1 - 0.3 / g.r], [r1 - 0.3, a1 - 0.3 / g.r]]) {
        b.cyl(0.26, 0.26, 0.9, C.warn, { p: [Math.cos(aa) * rr, FLOOR_Y - 0.65, Math.sin(aa) * rr] }, 8);
      }
    }
    const mat = own(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() }));
    const g = new THREE.Group();
    g.add(b.mesh(mat));
    // faixa de aviso: listras diagonais danger/branco sobre todo o topo (anel + grades), piscando
    const ovGeo = flatRingGeo(rg.r0, rg.r1, FLOOR_Y + 0.025, 96);
    { const uv = ovGeo.attributes.uv, n = Math.round((rg.r0 + rg.r1) * Math.PI / 3); for (let k = 0; k < uv.count; k++) uv.setXY(k, (Math.floor(k / 2) / 96) * n, (k % 2) * 2); }
    const ovMat = own(new THREE.MeshBasicMaterial({ map: dangerTex, transparent: true, opacity: 0, depthWrite: false }));
    const ov = new THREE.Mesh(ovGeo, ovMat);
    ov.visible = false; ov.renderOrder = 2;
    g.add(ov);
    // setas (chevrons ink) no piso deste anel apontando para as grades vizinhas
    const pos = [], uv = [], idx = [];
    const addArrow = (r, a, dirOut) => {
      const ca = Math.cos(a), sa = Math.sin(a), k = pos.length / 3;
      const P = (dr, dt) => pos.push(ca * (r + dr) - sa * dt, FLOOR_Y + 0.02, sa * (r + dr) + ca * dt);
      P(-0.5 * dirOut, -0.5); P(-0.5 * dirOut, 0.5); P(0.5 * dirOut, 0.5); P(0.5 * dirOut, -0.5);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    };
    for (const gr of map.grates) {
      if (Math.abs(rg.r1 - (gr.r - gr.halfR)) < 2.5) addArrow(rg.r1 - 1.0, gr.a, 1);
      if (Math.abs(rg.r0 - (gr.r + gr.halfR)) < 2.5) addArrow(rg.r0 + 1.0, gr.a, -1);
    }
    if (pos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      g.add(new THREE.Mesh(geo, own(new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }))));
    }
    group.add(g);
    return { rg, g, mat, ov, ovMat, grates: mine, gone: false, drop: 0 };
  });

  // ----- pódio central (refúgio final, nunca afunda) + torre (só cenário) -----
  const b = new Builder();
  const pd = map.podium;
  b.add(annulusGeo(pd.r - 0.4, pd.r, pd.y, BOT, 0, Math.PI * 2, 48), C.primary);
  b.add(annulusGeo(2.6, pd.r - 0.4, pd.y, BOT, 0, Math.PI * 2, 48), C.sand2);
  b.add(annulusGeo(0, 2.6, pd.y, BOT, 0, Math.PI * 2, 48), C.sand);
  for (let i = 0; i < 7; i++) b.cyl(1.2, 1.2, 1, i % 2 ? C.info : '#ffffff', { p: [0, pd.y + 0.5 + i, 0] }, 20);
  b.sphere(1.5, C.primary, { p: [0, pd.y + 7.9, 0] }, 16, 12);
  b.cyl(1.5, 1.5, 0.3, C.accent, { p: [0, pd.y + 0.15, 0] }, 20);
  group.add(b.mesh(vcToon()));

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
    void len;
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
    // linha projetada no piso (contínua = baixo, tracejada = alto): um trecho por anel coberto + um para o pódio
    const lines = [...map.rings.map((rg) => ({ ringId: rg.id, r0: rg.r0, r1: rg.r1 })), { ringId: -1, r0: 1.5, r1: map.podium.r }].map((seg) => {
      let mat, tex = null;
      if (low) mat = own(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false }));
      else {
        tex = dashTex.clone(); tex.needsUpdate = true;
        mat = own(new THREE.MeshBasicMaterial({ color: col, map: tex, transparent: true, depthWrite: false }));
      }
      const ln = new THREE.Mesh(lineGeo, mat);
      ln.renderOrder = 3; ln.visible = false;
      g.add(ln);
      return { ...seg, ln, mat, tex };
    });
    // bocal flutuante: boia na água + mastro + bocal marcado (▲ baixo / ▼ alto)
    const nb = new Builder();
    const pod = new THREE.Group();
    const nx = -0.35; // relativo a r0 (pod.position.x = r0)
    nb.sphere(0.5, '#ffffff', { p: [nx, 0.1, 0], s: [1, 0.7, 1] }, 12, 8);
    nb.torus(0.5, 0.12, col, { p: [nx, 0.15, 0], r: [90 * DEG, 0, 0] }, Math.PI * 2, 12);
    const topY = yc + (low ? 0.15 : ry * 0.75);
    nb.cyl(0.13, 0.13, topY, C.metal, { p: [nx, topY / 2, 0] }, 8);
    nb.box(0.6, low ? 0.6 : ry * 1.7, 0.62, low ? '#0FA3C4' : '#D9650A', { p: [nx, yc, 0] });
    nb.cyl(low ? 0.2 : 0.26, 0.3, 0.35, C.metal, { p: [nx + 0.4, yc, 0], r: [0, 0, 90 * DEG], s: low ? 1 : [1, 1, 1] }, 8);
    pod.add(nb.mesh(vcToon()));
    const mk = low ? markUp : markDown;
    for (const sg of [-1, 1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), own(new THREE.MeshBasicMaterial({ map: mk })));
      pl.position.set(nx, yc, sg * 0.32);
      if (sg < 0) pl.rotation.y = Math.PI;
      pod.add(pl);
    }
    const mt = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), own(new THREE.MeshBasicMaterial({ map: mk })));
    mt.rotation.y = -Math.PI / 2; mt.position.set(nx - 0.31, yc, 0);
    pod.add(mt);
    g.add(pod);
    group.add(g);
    return { j, g, beam, pod, lines, core, shell, st, ry, rz, yc, col, acc: Math.random(), fade: 1 };
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
      // anéis: afundam de fora para dentro; telegrafia em warn (listras piscando + cor de alerta + tremor + bolhas)
      for (const it of rings) {
        const s = ringState(it.rg.id, t, RS);
        const w = s.warn;
        let shake = 0;
        it.ov.visible = w > 0 || (s.drop > 0 && !s.gone);
        if (w > 0) {
          const left = (1 - w) * SINK_WARN, hz = left < 2 ? 3 : 1.5; // ≤ 3 Hz (área grande na tela)
          const on = Math.sin(time * Math.PI * 2 * hz) > 0;
          it.ovMat.opacity = (on ? 0.85 : 0.25) * Math.min(1, w * 6 + 0.3);
          it.mat.color.copy(_white).lerp(_warn, on ? 0.45 : 0.1);
          if (left < 3) shake = 0.03 * Math.sin(time * 75); // tremor de ±3 cm (só visual)
          if (fx && smooth) {
            for (const r of [it.rg.r0 - 0.3, it.rg.r1 + 0.3]) if (Math.random() < dt * 18) {
              const a = Math.random() * Math.PI * 2;
              fx.emit('bubbles', { x: Math.cos(a) * r, y: 0.1, z: Math.sin(a) * r }, { n: 1, r: 0.2 });
            }
          }
        } else if (s.drop > 0) {
          it.ovMat.opacity = 0.6;
          it.mat.color.copy(_white).lerp(s.gone ? _deep : _warn, s.gone ? 1 : 0.3);
          if (fx && smooth && !s.gone) for (let k = 0; k < 3; k++) {
            const a = Math.random() * Math.PI * 2, r = it.rg.r0 + Math.random() * (it.rg.r1 - it.rg.r0);
            if (Math.random() < dt * 40) fx.emit('bubbles', { x: Math.cos(a) * r, y: 0.1, z: Math.sin(a) * r }, { n: 1, r: 0.3 });
          }
        } else it.mat.color.copy(_white);
        if (s.gone) it.mat.color.copy(_deep);
        it.g.position.y = -s.drop + shake;
        it.drop = s.drop; it.gone = s.gone;
      }
      for (const it of jets) {
        const a = jetAngle(it.j, t);
        const sp = jetSpan(it.j, t, SP);
        const len = Math.max(0.01, sp.r1 - sp.r0);
        it.g.rotation.y = -a; // theta = atan2(z, x)  =>  rotação Y de −theta leva +X a (cos, sin)
        // liga/desliga com fade
        it.fade = smooth ? it.fade + ((sp.on ? 1 : 0) - it.fade) * Math.min(1, dt * 5) : (sp.on ? 1 : 0);
        const vis = it.fade > 0.02;
        it.beam.visible = vis;
        it.beam.position.x = sp.r0;
        it.core.material.opacity = 0.6 * it.fade; it.shell.material.opacity = 0.75 * it.fade;
        it.core.scale.set(len, it.ry * (it.j.low ? pulse : 1), it.rz * pulse);
        it.shell.scale.set(len, it.ry * 1.18, it.rz * 1.4);
        it.st.repeat.x = len / 6;
        it.st.offset.x = (it.st.offset.x - (20 / 6) * dt) % 1;
        // bocal flutuante acompanha r0; afunda quando o jato desliga; some quando recolhe para dentro da torre
        it.pod.position.x = sp.r0;
        it.pod.position.y = -(1 - it.fade) * 3.2;
        it.pod.visible = vis && sp.r0 > 2.2;
        for (const L of it.lines) {
          const ringOk = L.ringId < 0 || rings[L.ringId].drop === 0;
          const a0 = Math.max(L.r0, sp.r0), a1 = Math.min(L.r1, sp.r1);
          L.ln.visible = vis && ringOk && a1 - a0 > 0.4;
          if (L.ln.visible) {
            L.ln.position.set(a0, FLOOR_Y + 0.035, 0);
            L.ln.scale.set(a1 - a0, 1, 0.3);
            if (L.tex) L.tex.repeat.set((a1 - a0) / 2, 1);
            L.mat.opacity = 0.85 * it.fade;
          }
        }
        if (fx && smooth && sp.on) {
          // gotas ao longo do jato + leque na ponta
          it.acc += dt * len * 1.6;
          const ca = Math.cos(a), sa = Math.sin(a);
          while (it.acc > 1) {
            it.acc -= 1;
            const r = sp.r0 + Math.random() * len, y = it.yc + (Math.random() - 0.5) * it.ry * 1.6;
            fx.drop(ca * r, y, sa * r, ca * 2 + (Math.random() - 0.5) * 2, 1 + Math.random(), sa * 2 + (Math.random() - 0.5) * 2, 0.4, 0.05 + Math.random() * 0.04, C.foam);
          }
          if (Math.random() < dt * 20) {
            const r = sp.r1;
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
      for (const t of [streak, dashTex, markUp, markDown, dangerTex, arrowTex]) t.dispose();
      coreGeo.dispose(); shellGeo.dispose(); lineGeo.dispose();
    },
  };
}
