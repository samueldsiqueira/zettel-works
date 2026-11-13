// Loop do jogo: simulação local em passo fixo, rede, jogadores remotos interpolados, câmera e fluxo de telas.
import { TICK, NET_HZ, COUNTDOWN_S, STATES, FLAG, MAX_PLAYERS } from '../../../shared/constants.js';
import { createBody, createInput, createWorld, placeBody, stepBody, hSpeed } from '../../../shared/physics.js';
import { MAPS, MAP_BY_ID } from '../../../shared/maps/index.js';
import { mapLabel } from './ui.js';

const INTERP_DELAY = 0.1; // s de atraso na interpolação dos remotos
const EXTRAP_MAX = 0.25; // s de extrapolação por velocidade
const MAX_CATCHUP = 0.25; // s máximos de simulação acumulada por frame (aba em 2º plano, travadas)
const PITCH_MIN = (-10 * Math.PI) / 180, PITCH_MAX = (55 * Math.PI) / 180, PITCH_DEFAULT = (18 * Math.PI) / 180;
const REALIGN_IDLE_MS = 1500; // sem mexer na câmera por este tempo => auto-alinhamento
const QUALIFIED_HOLD_MS = 2000; // comemoração antes de virar espectador
const PREVIEW_ID = '__preview';
const STORE_KEY = 'icaro-fall:perfil';

const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const lerpAngle = (a, b, k) => a + wrapPi(b - a) * k;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r3 = (v) => Math.round(v * 1000) / 1000;

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveProfile(p) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* armazenamento indisponível */ }
}

export function createGame({ view, net, input, ui, lobbySpot }) {
  const spot = lobbySpot || { x: 0, y: 0, z: 0, yaw: 0 };
  const profile = loadProfile();
  const G = {
    phase: 'connecting', // connecting | lobby | intro | countdown | playing | spectating | results | gameEnd
    myId: null,
    joined: false,
    pendingJoin: false,
    lobbyPlayers: [],
    round: null,
    map: null,
    body: createBody(),
    world: createWorld(),
    t: 0, // tempo da rodada sincronizado (s)
  };
  const inp = createInput();
  const cam = { yaw: 0, pitch: PITCH_DEFAULT, targetId: null };
  const local = { active: false, control: false, awaiting: false, status: null, px: 0, py: 0, pz: 0, simT: 0, sendAcc: 0, qualifiedAt: 0 };
  const remotes = new Map(); // id -> { buf: [], cur: {...} }
  let spectateId = null, spectateLostAt = 0;
  let raf = 0, lastFrame = 0, running = false;
  let lobbyPreview = null; // { char, color }
  let lobbySpin = 0;
  let pendingLobbyAt = 0, endTimerAt = 0, lastErrorAt = 0, lastErrorMsg = '';
  let wasGo = false;
  let inMatch = false; // participei de alguma rodada desta partida (senão: cheguei com ela em andamento)
  let reduceMotion = !!profile.reduceMotion;

  ui.setProfile({ name: profile.name || '', char: profile.char || 'icaro', reduceMotion });

  // ───────────────────────── Lobby ─────────────────────────
  function refreshLobbyUi() {
    const connected = net.status === 'open' && G.myId != null;
    ui.setLobby({ players: G.lobbyPlayers, myId: G.myId, joined: G.joined, connected, pendingJoin: G.pendingJoin });
    let status;
    if (net.status !== 'open') status = { text: everConnected ? 'Conexão perdida. Reconectando…' : 'Conectando…', error: everConnected, retry: everConnected || connectFails > 1 };
    else if (lastErrorMsg && performance.now() - lastErrorAt < 6000) status = { text: lastErrorMsg, error: true };
    else if (G.pendingJoin) status = { text: 'Entrando…' };
    else if (!G.joined) status = { text: G.lobbyPlayers.length >= MAX_PLAYERS ? 'Sala cheia. Tente de novo em instantes.' : 'Escolha seu nome e personagem para entrar.' };
    else if (G.lobbyPlayers.length < 2) status = { text: 'Aguardando mais jogadores…' };
    else status = { text: 'Tudo pronto! Qualquer jogador pode iniciar a partida.' };
    ui.setLobbyStatus(status);
  }
  let everConnected = false, connectFails = 0;

  function setLobbyPreview() {
    const me = G.lobbyPlayers.find((p) => p.id === G.myId);
    const want = { char: me ? me.char : ui.char, color: me ? me.color : 7 };
    if (lobbyPreview && lobbyPreview.char === want.char && lobbyPreview.color === want.color) return;
    if (lobbyPreview) view.removePlayer(PREVIEW_ID);
    lobbyPreview = want;
    view.addPlayer({ id: PREVIEW_ID, name: me ? me.name : '', char: want.char, color: want.color, isLocal: true });
  }

  function enterLobby() {
    G.round = null; G.map = null; inMatch = false;
    local.active = local.control = local.awaiting = false; local.status = null;
    remotes.clear(); spectateId = null; pendingLobbyAt = 0; endTimerAt = 0;
    input.enabled = false; input.allowLock = false; input.releaseLock(); input.refreshTouchUi();
    view.loadMap(null);
    view.clearPlayers();
    lobbyPreview = null;
    setLobbyPreview();
    G.phase = net.status === 'open' ? 'lobby' : 'connecting';
    ui.setSpectate(null); ui.setIntro(null); ui.setCountdown(null); ui.hideBanner(true); ui.setLockHint(false);
    ui.show('lobby');
    refreshLobbyUi();
  }

  ui.on('char', () => { if (!G.round) setLobbyPreview(); });
  ui.on('join', (name, char) => {
    profile.name = name; profile.char = char; saveProfile(profile);
    lastErrorMsg = '';
    G.pendingJoin = net.send({ t: 'join', name, char });
    refreshLobbyUi();
  });
  ui.on('start', () => { lastErrorMsg = ''; net.send({ t: 'start' }); });
  ui.on('retry', () => net.retry());
  ui.on('again', () => enterLobby());
  ui.on('spectate', (dir) => switchSpectate(dir));
  ui.on('motion', (v) => { reduceMotion = v; profile.reduceMotion = v; saveProfile(profile); });

  // ───────────────────────── Rede ─────────────────────────
  net.on('open', () => { everConnected = true; connectFails = 0; ui.setConn(''); refreshLobbyUi(); });
  net.on('close', () => {
    connectFails++;
    const wasJoined = G.joined || G.pendingJoin;
    G.myId = null; G.joined = false; G.pendingJoin = false; G.lobbyPlayers = [];
    rejoin = wasJoined && !!profile.name;
    if (G.round) ui.setConn('Conexão perdida. Reconectando…');
    enterLobby();
  });
  let rejoin = false;

  net.on('welcome', (m) => {
    G.myId = m.id;
    if (G.phase === 'connecting') G.phase = 'lobby';
    if (rejoin && profile.name) { // reconexão: volta para a sala com o mesmo perfil
      rejoin = false;
      G.pendingJoin = net.send({ t: 'join', name: profile.name, char: profile.char || 'icaro' });
    }
    refreshLobbyUi();
  });

  net.on('lobby', (m) => {
    G.lobbyPlayers = Array.isArray(m.players) ? m.players : [];
    const inList = G.lobbyPlayers.some((p) => p.id === G.myId);
    if (inList) { G.joined = true; G.pendingJoin = false; }
    else if (!G.pendingJoin) G.joined = false;
    if (!G.round) {
      if (G.phase !== 'lobby' && G.phase !== 'connecting') enterLobby();
      else { setLobbyPreview(); refreshLobbyUi(); }
    } else if (G.phase === 'gameEnd' || G.round.ended) {
      enterLobby();
    } else {
      // lobby recebido no meio de uma rodada: só volta se a rodada realmente parou (sem snapshots)
      pendingLobbyAt = performance.now();
    }
  });

  net.on('error', (m) => {
    const raw = String(m.msg || 'Algo deu errado.');
    lastErrorMsg = /cheia/i.test(raw) ? 'Sala cheia. Tente de novo em instantes.'
      : /andamento/i.test(raw) ? 'Partida em andamento. Aguarde a próxima.' : raw;
    lastErrorAt = performance.now();
    if (G.pendingJoin) G.pendingJoin = false;
    if (G.round) ui.toast(lastErrorMsg, 2500);
    refreshLobbyUi();
    setTimeout(refreshLobbyUi, 6100);
  });

  net.on('round', (m) => startRound(m));

  net.on('snap', (m) => {
    if (!G.round || !Array.isArray(m.p)) return;
    pendingLobbyAt = 0;
    G.round.lastSnapAt = performance.now();
    for (const e of m.p) {
      const id = e[0];
      if (id === G.myId && G.round.me) continue;
      let r = remotes.get(id);
      if (!r) continue;
      const buf = r.buf;
      if (buf.length && m.time <= buf[buf.length - 1].time) {
        if (m.time < buf[buf.length - 1].time - 1) buf.length = 0; // relógio da rodada reiniciou
        else continue;
      }
      const fl = e[9] | 0;
      if ((fl & (FLAG.QUALIFIED | FLAG.ELIMINATED)) && !G.round.statuses.has(id)) {
        G.round.statuses.set(id, { status: fl & FLAG.ELIMINATED ? 'eliminated' : 'qualified', place: null, fromSnap: true });
      }
      buf.push({ time: m.time, x: e[1], y: e[2], z: e[3], vx: e[4], vy: e[5], vz: e[6], yaw: e[7], st: e[8], f: e[9] | 0 });
      if (buf.length > 30) buf.shift();
    }
  });

  net.on('pop', (m) => {
    if (!G.round) return;
    if (G.world.popped.has(m.id)) return;
    G.world.popped.add(m.id);
    view.popBuoy(m.id);
  });

  net.on('status', (m) => {
    const R = G.round;
    if (!R || !R.players.has(m.id)) return;
    const prev = R.statuses.get(m.id);
    R.statuses.set(m.id, { status: m.status, place: m.place });
    if (prev && prev.status === m.status && !prev.fromSnap) return;
    const info = R.players.get(m.id);
    if (m.id === G.myId && R.me) { onLocalStatus(m); return; }
    if (m.status === 'qualified') ui.feed(`${info.name} se classificou!`, 'ok');
    else ui.feed(G.map.mode === 'survival' ? `${info.name} caiu na água!` : `${info.name} foi eliminado!`, 'out');
    if (m.status === 'qualified' && G.map.mode === 'race' && R.me && !local.status) {
      const q = countStatus('qualified');
      if (q === R.cap - 1) ui.toast('Último lugar classificável!');
    }
  });

  net.on('roundEnd', (m) => {
    const R = G.round;
    if (!R) return;
    R.ended = true;
    for (const r of m.results || []) R.statuses.set(r.id, { status: r.status, place: r.place });
    local.control = false;
    input.enabled = false; input.allowLock = false; input.releaseLock(); input.refreshTouchUi();
    G.phase = 'results';
    endTimerAt = performance.now() + (m.nextIn || 0);
    R.final = !!m.final;
    const timeUp = G.t >= R.timeLimit - 0.5;
    const colors = new Map([...R.players.values()].map((p) => [p.id, p.color]));
    ui.hideBanner(true); ui.setSpectate(null); ui.setLockHint(false);
    ui.showResults({
      title: `Resultado — ${mapLabel(G.map)}`,
      kicker: timeUp ? 'Tempo esgotado!' : 'Fim da rodada!',
      results: m.results || [], myId: G.myId, colors,
    });
  });

  net.on('gameEnd', (m) => {
    G.phase = 'gameEnd';
    if (G.round) G.round.ended = true;
    endTimerAt = performance.now() + (m.lobbyIn || 0);
    input.enabled = false; input.allowLock = false; input.releaseLock();
    ui.setSpectate(null); ui.hideBanner(true);
    ui.showWinner({ podium: m.podium || [], winnerId: m.winnerId, myId: G.myId });
    // câmera no vencedor comemorando, se ele estiver na cena
    if (G.round && G.round.players.has(m.winnerId)) {
      spectateId = m.winnerId;
      const s = stateOf(m.winnerId);
      if (s) view.emit('confetti', { x: s.x, y: s.y + 1.5, z: s.z });
    }
  });

  // ───────────────────────── Rodada ─────────────────────────
  function startRound(m) {
    const map = MAP_BY_ID[m.mapId];
    if (!map) { console.warn('[game] mapa desconhecido', m.mapId); return; }
    const players = new Map();
    for (const p of m.players || []) players.set(p.id, p);
    const me = players.get(G.myId);
    if (me) inMatch = true;
    G.map = map;
    G.round = {
      index: m.round | 0, mapId: m.mapId, cap: m.cap, timeLimit: m.timeLimit || map.timeLimit, startAt: m.startAt,
      players, order: [...players.keys()], me: !!me, statuses: new Map(), ended: false, final: false, lastSnapAt: performance.now(),
    };
    G.world = createWorld();
    G.body = createBody();
    remotes.clear();
    pendingLobbyAt = 0; endTimerAt = 0; wasGo = false;
    lobbyPreview = null;

    view.loadMap(m.mapId);
    view.clearPlayers();
    for (const p of players.values()) {
      const isLocal = p.id === G.myId;
      view.addPlayer({ id: p.id, name: p.name, char: p.char, color: p.color, isLocal });
      if (!isLocal) {
        const sp = p.spawn || { x: 0, y: 0, z: 0, yaw: 0 };
        remotes.set(p.id, { buf: [], cur: { x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw || 0, state: 'ground', speed: 0, vy: 0, stun: false, status: null } });
      }
    }

    local.active = local.control = !!me;
    local.awaiting = false; local.status = null; local.simT = 0; local.sendAcc = 0; local.qualifiedAt = 0;
    if (me) {
      const sp = me.spawn || map.spawn(0, players.size);
      placeBody(G.body, sp);
      snapPrev();
      cam.yaw = sp.yaw || 0; // câmera atrás do personagem, olhando na direção do spawn
      cam.pitch = PITCH_DEFAULT;
      spectateId = null;
    } else {
      cam.pitch = PITCH_DEFAULT;
      spectateId = pickSpectate(0, null);
      const info = spectateId != null ? players.get(spectateId) : null;
      if (info && info.spawn) cam.yaw = info.spawn.yaw || 0;
    }
    input.clearEdges(); input.consumeLook();
    input.enabled = true; input.allowLock = !!me; input.lastLookAt = -1e9;
    if (!me) input.releaseLock();
    input.refreshTouchUi();

    G.phase = 'intro';
    ui.setRoundInfo({ round: G.round.index, total: MAPS.length, map });
    ui.setConn('');
    ui.show('game');
    ui.showHint(8000 + Math.max(0, m.startAt - net.serverNow()));
  }

  function snapPrev() { local.px = G.body.x; local.py = G.body.y; local.pz = G.body.z; }

  function countStatus(s) {
    let n = 0;
    for (const v of G.round.statuses.values()) if (v.status === s) n++;
    return n;
  }

  function onLocalStatus(m) {
    local.status = m.status;
    if (m.status === 'qualified') {
      local.control = false;
      local.qualifiedAt = performance.now();
      input.releaseLock();
      ui.banner('ok', 'QUALIFICADO!', m.place ? `Você ficou em ${m.place}º lugar` : '');
      view.emit('confetti', { x: G.body.x, y: G.body.y + 1.5, z: G.body.z });
    } else {
      local.active = local.control = local.awaiting = false;
      ui.banner('out', 'ELIMINADO', 'Não foi dessa vez!');
      view.emit('splash', { x: G.body.x, y: Math.max(G.body.y, 0), z: G.body.z });
      beginSpectate();
    }
  }

  function beginSpectate() {
    input.allowLock = false; input.releaseLock(); input.refreshTouchUi();
    spectateId = pickSpectate(0, null);
  }

  // candidatos: participantes ainda ativos; se não houver, os qualificados
  function spectateCandidates() {
    const R = G.round;
    const ids = R.order.filter((id) => !(id === G.myId && R.me));
    const active = ids.filter((id) => !R.statuses.has(id));
    if (active.length) return active;
    return ids.filter((id) => R.statuses.get(id)?.status === 'qualified');
  }
  function pickSpectate(dir, from) {
    const c = spectateCandidates();
    if (!c.length) return null;
    const i = c.indexOf(from);
    if (i < 0) return c[0];
    return c[(i + (dir || 1) + c.length) % c.length];
  }
  function isSpectating() {
    return !!G.round && !G.round.ended && (!G.round.me || local.status === 'eliminated' ||
      (local.status === 'qualified' && performance.now() - local.qualifiedAt > QUALIFIED_HOLD_MS));
  }
  function switchSpectate(dir) {
    if (!isSpectating()) return;
    const next = pickSpectate(dir, spectateId);
    if (next != null && next !== spectateId) {
      spectateId = next; spectateLostAt = 0;
      const s = stateOf(next);
      if (s) cam.yaw = s.yaw;
    }
  }
  input.on('spectate', (dir) => switchSpectate(dir));
  input.on('click', () => switchSpectate(1));
  input.on('help', (v) => ui.holdHint(v));
  input.on('device', (d) => ui.setDevice(d));
  ui.setDevice(input.device);

  // ───────────────────────── Simulação local ─────────────────────────
  function drainEvents() {
    const ev = G.world.events;
    if (!ev.length) return;
    const b = G.body;
    for (const e of ev) {
      if (e.type === 'pop') {
        net.send({ t: 'pop', id: e.id });
        G.world.popped.add(e.id);
        view.popBuoy(e.id);
      } else {
        view.emit(e.type, { x: b.x, y: b.y, z: b.z });
        if (e.type === 'boost') ui.toast('Acelera!', 1000);
      }
    }
    ev.length = 0;
  }

  function tick() {
    const b = G.body, w = G.world;
    const m = input.move;
    if (local.control && (m.x || m.y)) {
      // entrada relativa à câmera -> mundo. frente = (sin yaw, cos yaw); direita = (-cos yaw, sin yaw)
      const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
      inp.mx = s * m.y - c * m.x;
      inp.mz = c * m.y + s * m.x;
    } else { inp.mx = 0; inp.mz = 0; }
    const e = input.consumeEdges();
    inp.jump = local.control && e.jump;
    inp.dive = local.control && e.dive;

    snapPrev();
    w.t = local.simT;
    stepBody(b, inp, G.map, w, TICK);
    local.simT += TICK;
    drainEvents();

    if (b.fell) {
      if (G.map.mode === 'survival') {
        // o servidor decide a eliminação: para de simular e espera o 'status'
        view.emit('splash', { x: b.x, y: 0, z: b.z });
        local.active = false; local.control = false; local.awaiting = true;
        sendState();
      } else {
        view.emit('splash', { x: b.x, y: Math.max(b.y, 0), z: b.z });
        G.map.respawn(b);
        b.fell = false;
        snapPrev();
      }
    }
  }

  function sendState() {
    const b = G.body;
    net.send({
      t: 's',
      p: [r3(b.x), r3(b.y), r3(b.z), r3(b.vx), r3(b.vy), r3(b.vz), r3(b.yaw)],
      st: Math.max(0, STATES.indexOf(b.state)),
      f: b.stun > 0 ? FLAG.STUN : 0,
    });
  }

  function simulate(dt) {
    const t = G.t;
    if (t < 0) { // contagem: personagens parados, apertos descartados
      local.simT = 0; input.clearEdges(); wasGo = false;
      return;
    }
    if (!wasGo) { wasGo = true; input.clearEdges(); }
    if (local.active) {
      if (t - local.simT > MAX_CATCHUP) local.simT = t - MAX_CATCHUP; // aba em 2º plano / travada: não simula o atraso todo
      let guard = 0;
      while (local.active && local.simT + TICK <= t && guard++ < 32) tick();
    } else {
      input.clearEdges();
    }
    if ((local.active || local.awaiting) && local.status !== 'eliminated') {
      local.sendAcc += dt;
      const step = 1 / NET_HZ;
      if (local.sendAcc >= step) { local.sendAcc = Math.min(local.sendAcc - step, step); sendState(); }
    }
  }

  // ───────────────────────── Jogadores remotos ─────────────────────────
  function sampleRemote(r, rt) {
    const buf = r.buf, cur = r.cur;
    if (!buf.length) return cur;
    let a = buf[0], b = null;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].time <= rt) { a = buf[i]; b = buf[i + 1] || null; break; }
    }
    let x, y, z, yaw, vx, vy, vz, src;
    if (b) {
      const k = clamp((rt - a.time) / Math.max(1e-4, b.time - a.time), 0, 1);
      x = a.x + (b.x - a.x) * k; y = a.y + (b.y - a.y) * k; z = a.z + (b.z - a.z) * k;
      yaw = lerpAngle(a.yaw, b.yaw, k);
      vx = a.vx + (b.vx - a.vx) * k; vy = a.vy + (b.vy - a.vy) * k; vz = a.vz + (b.vz - a.vz) * k;
      src = k < 0.5 ? a : b;
      // teleporte (respawn): não interpola através do salto
      if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + Math.abs(b.z - a.z) > 12) { x = b.x; y = b.y; z = b.z; }
    } else {
      const ex = clamp(rt - a.time, 0, EXTRAP_MAX); // extrapolação curta pela velocidade
      x = a.x + a.vx * ex; y = a.y + a.vy * ex; z = a.z + a.vz * ex;
      yaw = a.yaw; vx = a.vx; vy = a.vy; vz = a.vz; src = a;
    }
    cur.x = x; cur.y = y; cur.z = z; cur.yaw = yaw; cur.vy = vy;
    cur.speed = Math.hypot(vx, vz);
    cur.state = STATES[src.st] || 'ground';
    cur.stun = !!(src.f & FLAG.STUN);
    cur.flagStatus = src.f & FLAG.ELIMINATED ? 'eliminated' : src.f & FLAG.QUALIFIED ? 'qualified' : null;
    return cur;
  }

  function stateOf(id) {
    if (id === G.myId && G.round && G.round.me) return G.body;
    const r = remotes.get(id);
    return r ? r.cur : null;
  }

  const outState = { x: 0, y: 0, z: 0, yaw: 0, state: 'ground', speed: 0, vy: 0, stun: false, status: null };
  function pushPlayers() {
    const R = G.round, t = G.t;
    const rt = t - INTERP_DELAY;
    for (const [id, r] of remotes) {
      const c = sampleRemote(r, rt);
      const st = R.statuses.get(id);
      c.status = st ? st.status : c.flagStatus || null;
      if (t < 0) { c.state = 'ground'; c.speed = 0; }
      view.setPlayerState(id, c);
    }
    if (R.me) {
      const b = G.body, o = outState;
      // interpola entre o tick anterior e o atual para telas acima de 60 Hz
      const k = local.active && t >= 0 ? clamp((t - local.simT) / TICK + 1, 0, 1) : 1;
      o.x = local.px + (b.x - local.px) * k; o.y = local.py + (b.y - local.py) * k; o.z = local.pz + (b.z - local.pz) * k;
      o.yaw = b.yaw; o.vy = b.vy; o.speed = hSpeed(b);
      o.state = t < 0 ? 'ground' : b.state;
      o.stun = b.stun > 0;
      o.status = local.status;
      view.setPlayerState(G.myId, o);
    }
  }

  // ───────────────────────── Câmera ─────────────────────────
  function updateCamera(dt) {
    const look = input.consumeLook();
    // yaw cresce no sentido anti-horário visto de cima (frente = sin/cos); olhar p/ a direita = yaw diminui
    cam.yaw = wrapPi(cam.yaw - look.yaw);
    cam.pitch = clamp(cam.pitch + look.pitch, PITCH_MIN, PITCH_MAX);
    const idle = performance.now() - input.lastLookAt > REALIGN_IDLE_MS;

    if (G.round) {
      const spectating = isSpectating() || G.phase === 'gameEnd';
      if (spectating) {
        const R = G.round;
        const st = spectateId != null ? R.statuses.get(spectateId) : null;
        const candidates = spectateCandidates();
        if (spectateId == null || !R.players.has(spectateId) || (!candidates.includes(spectateId) && G.phase !== 'gameEnd')) {
          // alvo saiu (eliminado/qualificado): espera 1 s para ver o desfecho e troca
          if (!spectateLostAt) spectateLostAt = performance.now();
          if (spectateId == null || performance.now() - spectateLostAt > 1000 || (st && st.status === 'eliminated' && candidates.length && performance.now() - spectateLostAt > 600)) {
            const next = pickSpectate(1, spectateId);
            if (next != null) spectateId = next;
            spectateLostAt = 0;
          }
        } else spectateLostAt = 0;
        cam.targetId = spectateId != null ? spectateId : (R.me ? G.myId : R.order[0]);
        const s = stateOf(cam.targetId);
        if (s && idle && cam.targetId !== G.myId) { // acompanha por trás do jogador assistido
          const sp = s.speed != null ? s.speed : 0;
          if (sp > 1.5) cam.yaw = lerpAngle(cam.yaw, s.yaw, 1 - Math.exp(-dt * 2.5));
        }
      } else {
        cam.targetId = G.myId;
        const b = G.body;
        const sp = hSpeed(b);
        if (idle && local.control && (b.state === 'slide' || b.state === 'dive') && sp > 8) {
          // deslize rápido: realinha suavemente atrás do personagem
          const want = Math.atan2(b.vx, b.vz);
          const d = wrapPi(want - cam.yaw);
          const maxStep = ((reduceMotion ? 50 : 90) * Math.PI / 180) * dt;
          cam.yaw = wrapPi(cam.yaw + clamp(d * Math.min(1, dt * 3.3), -maxStep, maxStep));
        }
      }
    } else {
      // lobby: câmera fixa de frente para o personagem (design §7)
      view.setCamera({ targetId: PREVIEW_ID, yaw: (spot.yaw || 0) + Math.PI, pitch: 0.12, distance: 5.4, fov: 40, height: 1.0 });
      return;
    }
    view.setCamera({ targetId: cam.targetId, yaw: cam.yaw, pitch: cam.pitch, distance: null, fov: null, height: null });
  }

  // ───────────────────────── HUD por frame ─────────────────────────
  function updateHud() {
    const R = G.round, t = G.t;
    if (!R) return;
    const watchingOnly = !R.me;
    if (!R.ended) {
      if (t < -COUNTDOWN_S) G.phase = 'intro';
      else if (t < 0) G.phase = 'countdown';
      else G.phase = isSpectating() ? 'spectating' : 'playing';
    }

    const showIntro = t < 0.2 && !R.ended;
    ui.setIntro(showIntro ? {
      round: R.index, total: MAPS.length, map: G.map, cap: R.cap,
      watching: watchingOnly ? (inMatch ? 'Você está assistindo. Torça pelos seus amigos!' : 'Partida em andamento. Você entra na próxima!') : '',
    } : null);
    let cd = null;
    if (!R.ended) {
      if (t >= -COUNTDOWN_S && t < 0) cd = String(Math.max(1, Math.ceil(-t)));
      else if (t >= 0 && t < 0.7) cd = 'JÁ!';
    }
    ui.setCountdown(cd);

    ui.setTimer(R.timeLimit - Math.max(0, t));
    if (G.map.mode === 'survival') ui.setCount({ mode: 'survival', alive: R.players.size - countStatus('eliminated'), final: R.cap <= 1 });
    else ui.setCount({ mode: 'race', qualified: countStatus('qualified'), cap: R.cap });

    const playing = R.me && local.active && !local.status && !R.ended;
    ui.setSpeed(playing && t >= 0 ? { state: G.body.state, speed: hSpeed(G.body), stun: G.body.stun > 0 } : null);
    ui.setHintVisible(R.me && !local.status && !R.ended);
    const progId = playing ? G.myId : null;
    ui.setProgress(G.map.id === 'slide' && progId != null && !R.ended ? G.map.progress(G.body) : null);
    ui.setLockHint(playing && t >= 0 && t < 12 && !input.locked && input.device === 'kb' && !local.everLocked);

    if (isSpectating() && t >= 0.2) {
      const info = R.players.get(cam.targetId);
      const n = spectateCandidates().length;
      ui.setSpectate({
        name: info ? info.name : '—',
        note: watchingOnly && !inMatch ? 'Partida em andamento · assistindo a' : 'Assistindo a',
        canSwitch: n > 1,
      });
    } else ui.setSpectate(null);

    if (R.ended && endTimerAt) {
      const s = Math.max(0, Math.ceil((endTimerAt - performance.now()) / 1000));
      if (G.phase === 'results') ui.setResultsFoot(R.final ? `Resultado final em ${s} s` : `Próxima fase em ${s} s`);
      else if (G.phase === 'gameEnd') ui.setWinnerFoot(s > 0 ? `Voltando ao lobby em ${s} s` : 'Voltando ao lobby…');
    }
  }
  input.on('lock', (locked) => { if (locked) local.everLocked = true; });

  // ───────────────────────── Frame ─────────────────────────
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    input.poll(dt);

    if (G.round) {
      G.t = (net.serverNow() - G.round.startAt) / 1000;
      if (G.round.me && !G.round.ended) simulate(dt);
      else input.clearEdges();
      pushPlayers();
      // 'lobby' chegou no meio da rodada e os snapshots pararam: a partida acabou no servidor
      if (pendingLobbyAt && now - pendingLobbyAt > 2500 && performance.now() - G.round.lastSnapAt > 2000) { enterLobby(); }
    } else {
      G.t = 0;
      lobbySpin = reduceMotion ? 0.4 : wrapPi(lobbySpin + dt * (20 * Math.PI / 180));
      if (lobbyPreview) {
        outState.x = spot.x; outState.y = spot.y; outState.z = spot.z; outState.yaw = (spot.yaw || 0) + lobbySpin; outState.state = 'ground';
        outState.speed = 0; outState.vy = 0; outState.stun = false; outState.status = null;
        view.setPlayerState(PREVIEW_ID, outState);
      }
      input.consumeLook(); input.clearEdges();
    }
    updateCamera(dt);
    updateHud();
    view.update(G.round ? G.t : now / 1000, dt);
    view.render();
  }

  function onVisibility() { lastFrame = performance.now(); }

  const game = {
    get state() { return G.phase; },
    get body() { return G.body; },
    get world() { return G.world; },
    get map() { return G.map; },
    get round() { return G.round; },
    get t() { return G.t; },
    get myId() { return G.myId; },
    get joined() { return G.joined; },
    get spectating() { return isSpectating() ? cam.targetId : null; },
    get local() { return local; },
    cam, remotes, view, net, input, ui,
    start() {
      if (running) return;
      running = true;
      document.addEventListener('visibilitychange', onVisibility);
      enterLobby();
      net.connect();
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
  return game;
}
