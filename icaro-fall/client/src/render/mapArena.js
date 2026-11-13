// Mapa 2 — Arena de Sobrevivência. Tudo segue centerRadius(t) e floatState(f, t) de shared/maps/arena.js.
import * as THREE from 'three';
import { arenaMap, centerRadius, floatState, WARN_T } from '../../../shared/maps/arena.js';
import { C, vcToon, toon, own, canvasTexture, stripeTexture, disposeTree } from './palette.js';
import { Builder, DEG, flatRingGeo } from './geo.js';

const TOP_COLORS = ['#7BE06A', '#FF8FC0', '#FFFFFF'];
const _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3(), _c = new THREE.Color(), _warn = new THREE.Color(C.warn), _white = new THREE.Color('#ffffff');
const FS = {};

function floatTopTexture(variant) {
  return canvasTexture(256, 256, (ctx, w) => {
    const bg = TOP_COLORS[variant], cx = w / 2;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, w);
    // borda mais escura + espiral (ajuda a ler orientação/inclinação)
    ctx.strokeStyle = variant === 2 ? '#BFD9FF' : 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 15; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const a = (i / 200) * Math.PI * 5, r = 8 + (i / 200) * 92;
      ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cx + Math.sin(a) * r);
    }
    ctx.stroke();
    if (variant === 0) { // vitória-régia: "V" pintado (a colisão é o disco inteiro, então não há recorte real)
      ctx.fillStyle = '#4FBF57';
      ctx.beginPath(); ctx.moveTo(cx, cx); ctx.lineTo(w, cx - 24); ctx.lineTo(w, cx + 24); ctx.fill();
    }
    ctx.strokeStyle = variant === 2 ? '#9FC4F5' : 'rgba(27,33,64,0.18)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(cx, cx, w / 2 - 6, 0, Math.PI * 2); ctx.stroke();
  });
}

export function createArenaMap(env) {
  const map = arenaMap, ctr = map.center, TOP = ctr.y;
  const group = new THREE.Group();

  // ----- plataforma central (raio = centerRadius(t)) -----
  const R0 = ctr.r0;
  const topTex = canvasTexture(512, 512, (ctx, w) => {
    const cx = w / 2, px = w / (2 * R0);
    const radii = [14, 10.5, 7, 3.5];
    radii.forEach((r, i) => { ctx.fillStyle = i % 2 ? C.sand : C.sand2; ctx.beginPath(); ctx.arc(cx, cx, r * px, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = C.accent; ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = (i % 2 ? 0.9 : 2.0) * px;
      ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cx + Math.sin(a) * r);
    }
    ctx.fill();
  });
  const center = new THREE.Group();
  const topMat = own(new THREE.MeshToonMaterial({ map: topTex, gradientMap: toon('#fff').gradientMap }));
  const top = new THREE.Mesh(flatRingGeo(0, 1, 0, 64), topMat);
  const sideTex = stripeTexture('#E53935', '#ffffff', 2);
  sideTex.repeat.set(12, 1);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.8, 64, 1, true), own(new THREE.MeshToonMaterial({ map: sideTex, gradientMap: toon('#fff').gradientMap })));
  side.position.y = -0.9;
  const dangerTex = stripeTexture(C.danger, '#ffffff', 4, true);
  // faixa de aviso (borda que vai sumir): listras diagonais piscando
  const bandGeo = flatRingGeo(0.9, 1, 0.025, 64);
  { // uv em faixa (u ao longo do perímetro)
    const uv = bandGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.floor(i / 2) / 64) * 40, i % 2);
  }
  const bandMat = own(new THREE.MeshBasicMaterial({ map: dangerTex, transparent: true, depthWrite: false }));
  const band = new THREE.Mesh(bandGeo, bandMat);
  center.add(top, side, band);
  center.position.y = TOP;
  group.add(center);
  let lastR = R0;

  // ----- plataformas flutuantes -----
  const topTexs = [0, 1, 2].map(floatTopTexture);
  const bodyGeos = new Map();
  const warnGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
  const floats = map.floats.map((f, i) => {
    const g = new THREE.Group();
    const key = f.r.toFixed(3);
    const bb = new Builder();
    bb.cyl(f.r, f.r * 0.94, 0.5, '#ffffff', { p: [0, -0.25, 0] }, 28);
    bb.torus(f.r * 0.96, 0.15, C.info, { p: [0, -0.5, 0], r: [90 * DEG, 0, 0] }, Math.PI * 2, 28);
    const body = new THREE.Mesh(bb.build(), vcToon());
    bodyGeos.set(key, body.geometry);
    const mat = own(new THREE.MeshToonMaterial({ map: topTexs[i % 3], gradientMap: toon('#fff').gradientMap }));
    const tp = new THREE.Mesh(flatRingGeo(0, f.r, 0.012, 28), mat);
    tp.rotation.y = i * 1.3;
    const wr = new THREE.Mesh(warnGeo, own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false })));
    wr.position.y = 0.04; wr.visible = false;
    g.add(body, tp, wr);
    group.add(g);
    return { f, g, mat, wr, solid: true, bub: 0 };
  });

  // ----- ambiente: boias de sinalização + arquibancada -----
  const b = new Builder();
  const buoyPos = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, r = 46;
    buoyPos.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const marks = new THREE.Group();
  for (const [x, z] of buoyPos) {
    const mb = new Builder();
    mb.sphere(0.9, C.warn, { p: [0, 0.1, 0] }, 12, 8);
    mb.cyl(0.22, 0.22, 1.6, '#ffffff', { p: [0, 1.3, 0] }, 8);
    mb.sphere(0.3, C.danger, { p: [0, 2.2, 0] }, 8, 6);
    const m = mb.mesh(vcToon());
    m.position.set(x, 0, z);
    marks.add(m);
  }
  group.add(marks);
  // arquibancada inflável em degraus (ao fundo, fora da área de jogo)
  for (let side2 = 0; side2 < 2; side2++) {
    const a0 = side2 ? 2.2 : -0.9;
    for (let k = 0; k < 5; k++) {
      const a = a0 + (k - 2) * 0.24, r = 66;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(_up, -a + Math.PI / 2), new THREE.Vector3(1, 1, 1));
      for (let st = 0; st < 4; st++) {
        b.box(14.5, 2.2, 3, (st + k) % 2 ? C.accent : C.primary, { p: [0, 0.6 + st * 1.8, -st * 2.8], m });
        b.cyl(1.1, 1.1, 14.5, '#ffffff', { p: [0, 1.7 + st * 1.8, 1.5 - st * 2.8], r: [0, 0, 90 * DEG], m }, 8);
      }
    }
  }
  group.add(b.mesh(vcToon()));

  env.setWaterY(map.waterY);
  env.setIslets([{ x: 95, z: 40, r: 13 }, { x: -100, z: 20, r: 11 }, { x: -40, z: -105, r: 14 }, { x: 50, z: 110, r: 10 }], map.waterY);

  return {
    id: 'arena', map, group, waterY: map.waterY,
    present: { x: 0, y: 1, z: 0, radius: 58, height: 26, fov: 55 },
    groundAt: (x, z, yRef, t, out) => map.groundAt(x, z, yRef, t, out),
    update(t, dt, time, fx) {
      const smooth = dt > 0 && dt < 0.2;
      // centro
      const R = centerRadius(t);
      center.visible = R > 0;
      if (R > 0) {
        top.scale.set(R, 1, R); side.scale.set(R, 1, R); band.scale.set(R, 1, R);
        const k = R / R0;
        topTex.repeat.set(k, k); topTex.offset.set(0.5 - k / 2, 0.5 - k / 2);
        sideTex.repeat.x = Math.max(2, Math.round(12 * k));
        // telegrafia: 3 s antes de começar a encolher e durante todo o encolhimento
        const shrinking = t > ctr.shrinkStart - 3 && t < ctr.shrinkEnd;
        band.visible = shrinking;
        if (shrinking) {
          const hz = R < 3 ? 4 : 2;
          bandMat.opacity = 0.55 + 0.45 * Math.sign(Math.sin(time * Math.PI * 2 * hz));
          if (fx && smooth && Math.random() < dt * 14) {
            const a = Math.random() * Math.PI * 2;
            fx.emit('bubbles', { x: Math.cos(a) * (R + 0.3), y: 0.1, z: Math.sin(a) * (R + 0.3) }, { n: 1, r: 0.2 });
          }
        }
      } else if (lastR > 0 && smooth && fx) {
        fx.emit('splash', { x: 0, y: 0.1, z: 0 });
      }
      lastR = R;
      // flutuantes
      for (const it of floats) {
        const s = floatState(it.f, t, FS);
        it.g.position.set(s.x, s.y, s.z);
        _n.set(s.nx, s.ny, s.nz);
        it.g.quaternion.setFromUnitVectors(_up, _n);
        const w = s.warn;
        it.wr.visible = w > 0;
        if (w > 0) {
          // (1) anel branco encolhendo da borda ao centro; (2) topo pisca laranja 3 Hz → 6 Hz no fim
          it.wr.scale.setScalar(Math.max(0.05, it.f.r * (1 - w)));
          const left = (1 - w) * WARN_T, hz = left < 0.5 ? 6 : 3;
          const on = Math.sin(time * Math.PI * 2 * hz) > 0;
          it.mat.color.copy(on ? _warn : _white);
          if (fx && smooth && Math.random() < dt * 10) fx.emit('bubbles', { x: s.x, y: 0.1, z: s.z }, { n: 1, r: it.f.r + 0.2 });
        } else if (s.sink > 0) {
          it.mat.color.copy(_c.set(C.waterDeep).lerp(_white, 1 - Math.min(1, s.sink * 1.5)));
          if (fx && smooth && s.sink > 0.3 && s.sink < 1 && Math.random() < dt * 8) fx.emit('bubbles', { x: s.x, y: 0.1, z: s.z }, { n: 1, r: it.f.r * 0.8 });
        } else it.mat.color.copy(_white);
        if (fx && smooth && s.solid !== it.solid) fx.ring(s.x, 0.15, s.z, it.f.r * 0.6, it.f.r * 1.5, 0.5, C.foam, 0.8);
        it.solid = s.solid;
      }
      for (let i = 0; i < marks.children.length; i++) {
        const m = marks.children[i];
        m.position.y = 0.08 * Math.sin(time * 1.6 + i * 1.9);
        m.rotation.z = 0.08 * Math.sin(time * 1.1 + i);
      }
    },
    popBuoy() {},
    dispose() { disposeTree(group); warnGeo.dispose(); for (const t of topTexs) t.dispose(); },
  };
}
