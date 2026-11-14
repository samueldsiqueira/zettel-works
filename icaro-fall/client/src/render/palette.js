// Paleta (docs/design.md §1), materiais toon e texturas desenhadas por código.
import * as THREE from 'three';

export const C = {
  skyTop: '#2FA8F5', skyHorizon: '#CDEFFF', cloud: '#FFFFFF', sun: '#FFE066',
  water: '#19C6D9', waterDeep: '#0E86B8', foam: '#EAFBFF', sand: '#FFE2A8', sand2: '#FFF3D6',
  ink: '#1B2140', paper: '#FFFFFF', primary: '#FFD23F', accent: '#FF5FA2', info: '#1E63E9',
  danger: '#D92D3A', warn: '#FF8A1F', boost: '#FFF200', coral: '#FF7E5F', violet: '#9B6BFF',
  palm: '#3FBF6B', trunk: '#B9814F', grass: '#7BE06A', metal: '#8FA3B8',
  jetLow: '#4FE3FF', jetHigh: '#FF8A1F',
};

export const PLAYER_COLORS = [
  '#E53935', '#FB8C00', '#FDD835', '#A4D233', '#2E9E44', '#1DD3B0', '#3FA9F5', '#1E63E9',
  '#1B2A6B', '#7B3FE4', '#D81B9A', '#FF8FC0', '#8D5A3B', '#F5F5F5', '#4A4F5A', '#8E1B3A',
];

export function playerColor(i) {
  return PLAYER_COLORS[(((i | 0) % 16) + 16) % 16];
}

/** Cor com luminosidade multiplicada (ex.: short do Ícaro = cor × 0,7). */
export function shade(hex, k) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * k));
  return '#' + c.getHexString();
}

// ---------- materiais ----------
let _grad = null;
export function gradientMap() {
  if (!_grad) {
    _grad = new THREE.DataTexture(new Uint8Array([140, 204, 255]), 3, 1, THREE.RedFormat);
    _grad.minFilter = _grad.magFilter = THREE.NearestFilter;
    _grad.generateMipmaps = false;
    _grad.needsUpdate = true;
  }
  return _grad;
}

const _mats = new Map();
/** Material toon de cor chapada (cacheado por cor+opções). */
export function toon(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  let m = _mats.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
    _mats.set(key, m);
  }
  return m;
}
/** Material toon que usa cores por vértice (malhas mescladas pelo Builder). */
export function vcToon(opts) {
  return toon('#ffffff', { vertexColors: true, ...opts });
}
export function glossy(opts) {
  const key = 'glossy' + (opts ? JSON.stringify(opts) : '');
  let m = _mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0, ...opts });
    _mats.set(key, m);
  }
  return m;
}
export function inkHull() {
  let m = _mats.get('hull');
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });
    _mats.set('hull', m);
  }
  return m;
}

// ---------- texturas por código ----------
export function canvasTexture(w, h, draw, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (opts.repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  if (opts.pixel) { tex.magFilter = THREE.NearestFilter; }
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Traça o caminho do símbolo do slot (0..7) centrado em (cx,cy) com "raio" r. */
function symbolPath(ctx, kind, cx, cy, r) {
  ctx.beginPath();
  switch (kind) {
    case 0: ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); break; // círculo
    case 1: ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.8); ctx.lineTo(cx - r, cy + r * 0.8); break; // triângulo
    case 2: ctx.rect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6); break; // quadrado
    case 3: // estrela
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r * 1.05;
        ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      break;
    case 4: ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.8, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.8, cy); break; // losango
    case 5: // coração
      ctx.moveTo(cx, cy + r * 0.95);
      ctx.bezierCurveTo(cx - r * 1.6, cy - r * 0.1, cx - r * 0.7, cy - r * 1.3, cx, cy - r * 0.45);
      ctx.bezierCurveTo(cx + r * 0.7, cy - r * 1.3, cx + r * 1.6, cy - r * 0.1, cx, cy + r * 0.95);
      break;
    case 6: // gota
      ctx.moveTo(cx, cy - r * 1.05);
      ctx.bezierCurveTo(cx + r * 0.3, cy - r * 0.4, cx + r * 0.85, cy, cx + r * 0.85, cy + r * 0.35);
      ctx.arc(cx, cy + r * 0.25, r * 0.85, 0.12, Math.PI - 0.12);
      ctx.bezierCurveTo(cx - r * 0.85, cy, cx - r * 0.3, cy - r * 0.4, cx, cy - r * 1.05);
      break;
    default: // raio
      ctx.moveTo(cx + r * 0.35, cy - r); ctx.lineTo(cx - r * 0.65, cy + r * 0.15); ctx.lineTo(cx - r * 0.05, cy + r * 0.15);
      ctx.lineTo(cx - r * 0.35, cy + r); ctx.lineTo(cx + r * 0.65, cy - r * 0.2); ctx.lineTo(cx + r * 0.05, cy - r * 0.2);
  }
  ctx.closePath();
}

/** Símbolo do slot de cor: 0–7 cheio (branco, contorno ink), 8–15 vazado (só contorno branco). */
export function drawSymbol(ctx, slot, cx, cy, r) {
  const kind = slot % 8, hollow = slot % 16 >= 8;
  ctx.lineJoin = 'round';
  symbolPath(ctx, kind, cx, cy, r);
  if (hollow) {
    ctx.lineWidth = r * 0.5; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.lineWidth = r * 0.26; ctx.strokeStyle = '#fff'; ctx.stroke();
  } else {
    ctx.lineWidth = r * 0.28; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fill();
  }
}

const _sym = new Map();
/** Disco de símbolo (costas do personagem). */
export function symbolTexture(slot) {
  let t = _sym.get(slot);
  if (!t) {
    t = canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = playerColor(slot);
      ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.fill();
      drawSymbol(ctx, slot, 64, 66, 30);
    });
    t.userData.own = false;
    _sym.set(slot, t);
  }
  return t;
}

export const FONT = '800 60px "Baloo 2", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';

/** Crachá: pílula ink + chip (cor + símbolo) + nome. Retorna { texture, aspect }. */
export function badgeTexture(name, slot) {
  const H = 112;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = FONT;
  const text = String(name ?? '').slice(0, 16) || '?';
  const tw = Math.ceil(probe.measureText(text).width);
  const W = Math.min(1024, tw + 150);
  const texture = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = 'rgba(27,33,64,0.85)';
    roundRect(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2); ctx.fill();
    // chip
    ctx.fillStyle = playerColor(slot);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(58, H / 2, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawSymbol(ctx, slot, 58, H / 2 + 1, 18);
    ctx.font = FONT; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 108, H / 2 + 4, W - 130);
  });
  texture.generateMipmaps = true;
  return { texture, aspect: W / H };
}

let _arrow = null;
export function arrowTexture() {
  if (!_arrow) {
    _arrow = canvasTexture(96, 96, (ctx) => {
      ctx.beginPath(); ctx.moveTo(12, 20); ctx.lineTo(84, 20); ctx.lineTo(48, 82); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = 14; ctx.strokeStyle = C.ink; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fill();
    });
    _arrow.userData.own = false;
  }
  return _arrow;
}

let _blob = null;
export function blobTexture() {
  if (!_blob) {
    _blob = canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
      g.addColorStop(0, 'rgba(15,30,70,0.55)'); g.addColorStop(0.6, 'rgba(15,30,70,0.35)'); g.addColorStop(1, 'rgba(15,30,70,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    });
    _blob.userData.own = false;
  }
  return _blob;
}

export function checkerTexture(nx, ny, a = C.ink, b = '#ffffff') {
  return canvasTexture(nx * 16, ny * 16, (ctx) => {
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      ctx.fillStyle = (x + y) % 2 ? a : b; ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }, { pixel: true, repeat: true });
}

export function stripeTexture(a, b, n = 8, diagonal = false) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = b; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = a;
    const sw = w / n;
    if (diagonal) {
      for (let i = -n; i < n * 2; i += 2) {
        ctx.beginPath(); ctx.moveTo(i * sw, 0); ctx.lineTo((i + 1) * sw, 0); ctx.lineTo((i + 1) * sw - h, h); ctx.lineTo(i * sw - h, h); ctx.fill();
      }
    } else for (let i = 0; i < n; i += 2) ctx.fillRect(i * sw, 0, sw, h);
  }, { repeat: true });
}

/** Faixa de texto (nome da fase no arco de largada etc.). */
export function textTexture(text, { w = 1024, h = 128, bg = C.ink, fg = '#fff' } = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.font = `800 ${Math.floor(h * 0.62)}px "Baloo 2", "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + h * 0.04, w - 40);
  });
}

/** Descarta geometrias/materiais/texturas de uma subárvore (materiais do cache são recriados sob demanda na GPU). */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (m.userData && m.userData.own) {
        for (const k of ['map', 'alphaMap', 'emissiveMap']) if (m[k] && m[k].userData.own !== false) m[k].dispose();
        m.dispose();
      }
    }
  });
}

/** Marca um material como pertencente ao dono (será descartado por disposeTree, junto com suas texturas). */
export function own(mat) {
  mat.userData.own = true;
  return mat;
}
