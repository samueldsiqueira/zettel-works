// Página de teste do GameView (client/render-test.html). Parâmetros de URL:
//   map=slide|arena|jets|lobby   mapa (padrão lobby)
//   n=16                         nº de personagens (alternando icaro/penguin, cores 0..15)
//   pose=cycle|idle|run|air|dive|slide|stun|qualified|eliminated   (padrão cycle: cada um num estado, trocando a cada 2,5 s)
//   t=<s>                        tempo de rodada fixo (sem t: avança a partir de t0, padrão −1)
//   t0=<s>  speed=<x>            tempo inicial e escala de tempo
//   cam=<id>                     segue o jogador id (sem cam: órbita de apresentação)
//   yaw=<graus> pitch=<graus> dist=<m> fov=<graus> height=<m>   controle da câmera (arraste o mouse para girar)
//   at=<s>                       (slide) coloca os personagens ao redor do ponto s da pista
//   r=<m>                        (arena/jets) raio do círculo onde os personagens ficam
//   ev=<tipo>                    emite view.emit(tipo) a cada 1,2 s em cada personagem
//   pop=1                        (slide) estoura boias em sequência
//   hud=0                        esconde o painel de info
import { createGameView, LOBBY } from './render/index.js';
import { MAP_BY_ID } from '../../shared/maps/index.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) && Number.isFinite(parseFloat(q.get(k))) ? parseFloat(q.get(k)) : d);
const mapId = q.get('map') && q.get('map') !== 'lobby' ? q.get('map') : null;
const map = mapId ? MAP_BY_ID[mapId] : null;
const N = Math.round(num('n', 16));
const poseMode = q.get('pose') || 'cycle';
const DEG = Math.PI / 180;

const canvas = document.getElementById('c');
const view = createGameView(canvas);
view.loadMap(mapId);
view.setPlayerState('ninguem', { x: 0, y: 0, z: 0 }); // id desconhecido: deve ser ignorado
view.popBuoy(9999); view.emit('inexistente', { x: 0, y: 0, z: 0 }); view.emit('splash', null);

const NAMES = ['Ana', 'Beto', 'Carla', 'Duda', 'Edu', 'Fafá', 'Gui', 'Helô', 'Igor', 'Juju', 'Kaká', 'Lia', 'Max', 'Nina', 'Otto', 'Pietra'];
const players = [];
for (let i = 0; i < N; i++) {
  let sp;
  if (map) {
    sp = map.spawn(i, N);
    if (mapId === 'slide' && q.has('at')) {
      const s = num('at', 80) + 2.2 * Math.floor(i / 4), d = (i % 4 - 1.5) * 2.2;
      const p = map.trackPoint(s, d);
      sp = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(p.tx, p.tz) };
    } else if (q.has('r')) {
      const a = (i / N) * Math.PI * 2 + 0.2, r = num('r', 10);
      sp = { x: Math.cos(a) * r, y: sp.y, z: Math.sin(a) * r, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) };
    }
  } else if (i < 3 && N > 3) sp = { ...LOBBY.podium[i], yaw: 0 };
  else sp = LOBBY.spot(N > 3 ? i - 3 : i, N > 3 ? N - 3 : N);
  const pl = { id: i, name: NAMES[i % 16], char: i % 2 ? 'penguin' : 'icaro', color: i % 16, isLocal: String(i) === q.get('cam') && q.get('local') !== '0', sp };
  players.push(pl);
  view.addPlayer(pl);
}
view.addPlayer({ id: 'sem-estado', name: 'Fantasma', char: 'icaro', color: 3 }); // sem setPlayerState: não deve aparecer nem quebrar

const cam = { targetId: q.has('cam') ? Math.round(num('cam', 0)) : null, yaw: num('yaw', 180) * DEG, pitch: num('pitch', 18) * DEG };
if (q.has('yawrel') && cam.targetId != null && players[cam.targetId]) cam.yaw = players[cam.targetId].sp.yaw + num('yawrel', 0) * DEG;
for (const k of ['dist', 'fov', 'height']) if (q.has(k)) cam[k === 'dist' ? 'distance' : k] = num(k, 0);
view.setCamera(cam);
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.yaw -= (e.clientX - drag.x) * 0.15 * DEG * 2; cam.pitch = Math.max(-10 * DEG, Math.min(55 * DEG, cam.pitch + (e.clientY - drag.y) * 0.15 * DEG * 2));
  drag = { x: e.clientX, y: e.clientY };
  view.setCamera(cam);
});

const CYCLE = ['idle', 'run', 'air', 'dive', 'slide', 'stun', 'qualified', 'idle', 'eliminated'];
function stateFor(pl, clock) {
  const mode = poseMode === 'cycle' ? CYCLE[(pl.id + Math.floor(clock / 2.5)) % CYCLE.length] : poseMode;
  const st = { x: pl.sp.x, y: pl.sp.y, z: pl.sp.z, yaw: pl.sp.yaw || 0, state: 'ground', speed: 0, vy: 0, stun: 0, status: null };
  switch (mode) {
    case 'run': st.speed = 7; break;
    case 'air': st.state = 'air'; st.y += 0.9 + 0.3 * Math.sin(clock * 3 + pl.id); st.vy = 3 * Math.cos(clock * 3 + pl.id); break;
    case 'fall': st.state = 'air'; st.y += 1.5; st.vy = -20; break;
    case 'dive': st.state = 'dive'; st.y += 1.0; st.speed = 12; break;
    case 'slide': st.state = 'slide'; st.speed = 14; break;
    case 'stun': st.stun = 0.5; break;
    case 'qualified': st.status = 'qualified'; break;
    case 'eliminated': st.status = 'eliminated'; break;
    default:
  }
  return st;
}

const fixedT = q.has('t') ? num('t', 0) : null;
let t = fixedT ?? num('t0', -1), clock = 0, frames = 0, evAcc = 0, popAcc = 0, popId = 0, fps = 0, fpsAcc = 0, fpsN = 0;
const speed = num('speed', 1);
const info = document.getElementById('info');
if (q.get('hud') === '0') info.style.display = 'none';

function step(dt) {
  clock += dt;
  if (fixedT == null) t += dt * speed;
  for (const pl of players) view.setPlayerState(pl.id, stateFor(pl, clock));
  if (q.has('ev')) {
    evAcc += dt;
    if (evAcc > 1.2) { evAcc = 0; for (const pl of players) view.emit(q.get('ev'), pl.sp); }
  }
  if (q.get('pop') === '1' && map && map.buoys) {
    popAcc += dt;
    if (popAcc > 0.5) { popAcc = 0; view.popBuoy(map.buoys[popId++ % map.buoys.length].id); }
  }
  view.update(t, dt);
  view.render();
  frames++;
}

function fit() { view.resize(innerWidth, innerHeight); }
addEventListener('resize', fit);
fit();

let last = performance.now();
let running = q.get('manual') !== '1';
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running) step(dt);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  info.textContent = `map=${mapId || 'lobby'}  t=${t.toFixed(2)}  fps=${fps.toFixed(0)}  draw=${view.renderer.info.render.calls}  tris=${view.renderer.info.render.triangles}`;
  window.__frames = frames;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ganchos para automação (Playwright)
window.__view = view;
window.__step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) step(dt); return frames; };
window.__pause = (p = true) => { running = !p; };
window.__setT = (v) => { t = v; };
window.__info = () => ({ calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, fps });
