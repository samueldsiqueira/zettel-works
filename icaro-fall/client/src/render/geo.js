// Construção de malhas mescladas com cor por vértice (poucas draw calls).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _c = new THREE.Color();
export const DEG = Math.PI / 180;

export class Builder {
  constructor() { this.parts = []; this.base = null; }
  /** Adiciona uma geometria (toma posse). opts: p [x,y,z], r [rx,ry,rz] rad, s número|[x,y,z], m Matrix4 extra (pai). */
  add(geo, color, opts = {}) {
    const { p, r, s, m } = opts;
    _p.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0);
    _e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0, opts.order || 'XYZ');
    _q.setFromEuler(_e);
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1);
    _m.compose(_p, _q, _s);
    if (m) _m.premultiply(m);
    if (this.base) _m.premultiply(this.base);
    geo.applyMatrix4(_m);
    if (!geo.index) {
      const n = geo.attributes.position.count, idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') geo.deleteAttribute(k);
    if (color != null) {
      _c.set(color);
      const n = geo.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    this.parts.push(geo);
    return this;
  }
  sphere(r, color, opts, ws = 14, hs = 10) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, opts); }
  capsule(r, len, color, opts) { return this.add(new THREE.CapsuleGeometry(r, len, 4, 10), color, opts); }
  cyl(rt, rb, h, color, opts, seg = 16, open = false) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), color, opts); }
  cone(r, h, color, opts, seg = 10) { return this.add(new THREE.ConeGeometry(r, h, seg), color, opts); }
  box(w, h, d, color, opts) { return this.add(new THREE.BoxGeometry(w, h, d), color, opts); }
  torus(R, tube, color, opts, arc = Math.PI * 2, seg = 20) { return this.add(new THREE.TorusGeometry(R, tube, 6, seg, arc), color, opts); }
  get empty() { return this.parts.length === 0; }
  build() {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
  mesh(material) { return new THREE.Mesh(this.build(), material); }
}

/**
 * Sólido em setor de anel (topo + paredes interna/externa + tampas laterais se for setor), eixo Y.
 * Ângulo polar theta = atan2(z, x). Com uv no topo (u = ângulo normalizado, v = raio normalizado).
 */
export function annulusGeo(r0, r1, yTop, yBot, a0 = 0, a1 = Math.PI * 2, seg = 64) {
  const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  const pos = [], nor = [], idx = [];
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  const v = (x, y, z, nx, ny, nz) => { pos.push(x, y, z); nor.push(nx, ny, nz); return pos.length / 3 - 1; };
  for (let i = 0; i < seg; i++) {
    const ta = a0 + ((a1 - a0) * i) / seg, tb = a0 + ((a1 - a0) * (i + 1)) / seg;
    const ca = Math.cos(ta), sa = Math.sin(ta), cb = Math.cos(tb), sb = Math.sin(tb);
    // topo (normal +Y): ordem anti-horária vista de cima
    quad(v(r0 * ca, yTop, r0 * sa, 0, 1, 0), v(r0 * cb, yTop, r0 * sb, 0, 1, 0), v(r1 * cb, yTop, r1 * sb, 0, 1, 0), v(r1 * ca, yTop, r1 * sa, 0, 1, 0));
    // parede externa
    quad(v(r1 * ca, yTop, r1 * sa, ca, 0, sa), v(r1 * cb, yTop, r1 * sb, cb, 0, sb), v(r1 * cb, yBot, r1 * sb, cb, 0, sb), v(r1 * ca, yBot, r1 * sa, ca, 0, sa));
    // parede interna
    if (r0 > 1e-4) quad(v(r0 * cb, yTop, r0 * sb, -cb, 0, -sb), v(r0 * ca, yTop, r0 * sa, -ca, 0, -sa), v(r0 * ca, yBot, r0 * sa, -ca, 0, -sa), v(r0 * cb, yBot, r0 * sb, -cb, 0, -sb));
  }
  if (!full) {
    for (const [t, sg] of [[a0, -1], [a1, 1]]) {
      const c = Math.cos(t), s = Math.sin(t), nx = -s * sg, nz = c * sg;
      const A = v(r0 * c, yTop, r0 * s, nx, 0, nz), B = v(r1 * c, yTop, r1 * s, nx, 0, nz), Cc = v(r1 * c, yBot, r1 * s, nx, 0, nz), D = v(r0 * c, yBot, r0 * s, nx, 0, nz);
      if (sg > 0) quad(D, Cc, B, A); else quad(A, B, Cc, D);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Disco/anel plano horizontal (normal +Y) com uv planar: u = x/(2R)+0.5, v = z/(2R)+0.5 (R = uvR ou r1). */
export function flatRingGeo(r0, r1, y = 0, seg = 48, a0 = 0, a1 = Math.PI * 2, uvR = r1) {
  const pos = [], uv = [], nor = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = a0 + ((a1 - a0) * i) / seg, c = Math.cos(t), s = Math.sin(t);
    pos.push(r0 * c, y, r0 * s, r1 * c, y, r1 * s);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push((r0 * c) / (2 * uvR) + 0.5, (r0 * s) / (2 * uvR) + 0.5, (r1 * c) / (2 * uvR) + 0.5, (r1 * s) / (2 * uvR) + 0.5);
    if (i < seg) { const k = i * 2; idx.push(k, k + 2, k + 3, k, k + 3, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Palmeira (tronco inclinado + copa de 6 folhas) no Builder. */
export function addPalm(b, x, y, z, yaw = 0, h = 5, colors = { trunk: '#B9814F', leaf: '#3FBF6B' }) {
  const base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 8 * DEG)), new THREE.Vector3(1, 1, 1));
  b.cyl(0.2, 0.28, h, colors.trunk, { p: [0, h / 2, 0], m: base }, 7);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    // folha: cone achatado, saindo do topo e caindo 30°
    const leaf = new THREE.Matrix4().compose(new THREE.Vector3(0, h, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(1, 1, 1));
    leaf.premultiply(base);
    b.cone(0.55, 2.5, colors.leaf, { p: [0, -0.45, 1.1], r: [120 * DEG, 0, 0], s: [1, 1, 0.3], m: leaf }, 6);
  }
  b.sphere(0.35, colors.trunk, { p: [0, h, 0], m: base }, 8, 6);
}
