// Telas e HUD em HTML/CSS (PT-BR). Sem estado de jogo: recebe dados prontos de game.js.
import { MAX_PLAYERS } from '../../../shared/constants.js';

export const PLAYER_COLORS = [
  ['Vermelho', '#E53935'], ['Laranja', '#FB8C00'], ['Amarelo', '#FDD835'], ['Lima', '#A4D233'],
  ['Verde', '#2E9E44'], ['Menta', '#1DD3B0'], ['Azul-céu', '#3FA9F5'], ['Azul', '#1E63E9'],
  ['Marinho', '#1B2A6B'], ['Roxo', '#7B3FE4'], ['Magenta', '#D81B9A'], ['Rosa', '#FF8FC0'],
  ['Marrom', '#8D5A3B'], ['Branco', '#F5F5F5'], ['Grafite', '#4A4F5A'], ['Vinho', '#8E1B3A'],
];
// cor + símbolo (cheio nos slots 1–8, vazado nos 9–16)
const SYMBOLS = ['●', '▲', '■', '★', '◆', '♥', '⬮', '✚', '○', '△', '□', '☆', '◇', '♡', '⬯', '✛'];

const MAP_LABEL = { slide: 'Tobogã Radical', arena: 'Arena de Sobrevivência', jets: 'Labirinto de Jatos' };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function mapLabel(map) {
  if (!map) return '';
  return MAP_LABEL[map.id] || String(map.name || map.id).replace(/^[OA]s? /, '');
}

export function chipHtml(color) {
  const i = ((color | 0) % 16 + 16) % 16;
  return `<span class="chip" style="background:${PLAYER_COLORS[i][1]}" aria-hidden="true">${SYMBOLS[i]}</span>`;
}

function controlsHtml(device) {
  const kb =
    '<h3>Teclado e mouse</h3>' +
    '<div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ou setas — mover</div>' +
    '<div><kbd>Espaço</kbd> — pular</div>' +
    '<div><kbd>Espaço</kbd> no ar — pulo duplo com mergulho</div>' +
    '<div><kbd>Shift</kbd> ou <kbd>E</kbd> — mergulhar</div>' +
    '<div>Mouse — girar a câmera</div>';
  const pad =
    '<h3>Controle</h3>' +
    '<div>Analógico esquerdo — mover</div>' +
    '<div><kbd>A</kbd> — pular</div>' +
    '<div><kbd>B</kbd> ou <kbd>X</kbd> — mergulhar</div>' +
    '<div>Analógico direito — câmera</div>';
  const touch =
    '<h3>Toque</h3>' +
    '<div>Arraste à esquerda — mover</div>' +
    '<div>Arraste à direita — câmera</div>' +
    '<div>Botões — pular e mergulhar</div>';
  if (device === 'pad') return pad;
  if (device === 'touch') return touch;
  if (device === 'all') return kb + pad;
  return kb;
}

export function createUi() {
  const screens = { lobby: $('screen-lobby'), game: $('screen-game'), results: $('screen-results'), winner: $('screen-winner') };
  const el = {
    form: $('join-form'), name: $('name-input'), nameErr: $('name-error'), cards: [...document.querySelectorAll('.char-card')],
    myColor: $('my-color'), myChip: $('my-chip'), myColorName: $('my-color-name'),
    btnJoin: $('btn-join'), btnStart: $('btn-start'), startNote: $('start-note'), status: $('lobby-status'), btnRetry: $('btn-retry'),
    rosterTitle: $('roster-title'), rosterList: $('roster-list'), rosterEmpty: $('roster-empty'),
    howto: $('howto-body'), optMotion: $('opt-motion'),
    hudRound: $('hud-round'), hudMap: $('hud-map'), hudTimer: $('hud-timer'), hudTime: $('hud-time'), hudCount: $('hud-count'), feed: $('hud-feed'),
    intro: $('intro'), introRound: $('intro-round'), introName: $('intro-name'), introGoal: $('intro-goal'), introWatch: $('intro-watch'),
    countdown: $('countdown'),
    banner: $('banner'), bannerIcon: $('banner-icon'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    toast: $('toast'),
    spectate: $('spectate'), specNote: $('spec-note'), specName: $('spec-name'), specHint: $('spec-hint'), specPrev: $('spec-prev'), specNext: $('spec-next'),
    hint: $('hint'), hintFull: $('hint-full'), hintMin: $('hint-min'),
    progress: $('progress'), progressFill: $('progress-fill'), progressDot: $('progress-dot'),
    speed: $('speed'), speedState: $('speed-state'), speedFill: $('speed-fill'), speedVal: $('speed-val'),
    lockHint: $('lock-hint'),
    resultsKicker: $('results-kicker'), resultsTitle: $('results-title'), resultsBody: $('results-body'), resultsFoot: $('results-foot'),
    winnerTitle: $('winner-title'), podium: $('podium'), winnerFoot: $('winner-foot'), btnAgain: $('btn-again'),
    conn: $('conn'),
  };

  const cb = { join: null, start: null, char: null, retry: null, again: null, spectate: null, motion: null };
  let char = 'icaro';
  let current = null;
  let bannerTimer = 0, toastTimer = 0, hintTimer = 0, hintPinned = false;
  const last = {}; // cache p/ evitar escrita repetida no DOM a cada frame
  const setText = (key, node, text) => { if (last[key] !== text) { last[key] = text; node.textContent = text; } };
  const setHidden = (node, hidden) => { if (node.hidden !== hidden) node.hidden = hidden; };

  // ── Lobby ──
  function selectChar(c, notify = true) {
    char = c === 'penguin' ? 'penguin' : 'icaro';
    for (const card of el.cards) card.setAttribute('aria-checked', String(card.dataset.char === char));
    if (notify && cb.char) cb.char(char);
  }
  for (const card of el.cards) {
    card.addEventListener('click', () => { if (!card.disabled) selectChar(card.dataset.char); });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const other = el.cards.find((c) => c !== card);
        if (!other.disabled) { other.focus(); selectChar(other.dataset.char); }
        e.preventDefault();
      }
    });
  }
  function validName() {
    const n = el.name.value.trim().replace(/\s+/g, ' ');
    const ok = n.length >= 2 && n.length <= 14;
    el.nameErr.hidden = ok;
    el.name.setAttribute('aria-invalid', String(!ok));
    return ok ? n : null;
  }
  el.name.addEventListener('input', () => { if (!el.nameErr.hidden) validName(); });
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (el.btnJoin.hidden) { if (!el.btnStart.disabled && cb.start) cb.start(); return; }
    const n = validName();
    if (!n) { el.name.focus(); return; }
    if (cb.join) cb.join(n, char);
  });
  el.btnStart.addEventListener('click', () => cb.start && cb.start());
  el.btnRetry.addEventListener('click', () => cb.retry && cb.retry());
  el.btnAgain.addEventListener('click', () => cb.again && cb.again());
  el.specPrev.addEventListener('click', () => cb.spectate && cb.spectate(-1));
  el.specNext.addEventListener('click', () => cb.spectate && cb.spectate(1));
  el.optMotion.addEventListener('change', () => {
    document.documentElement.classList.toggle('reduce-motion', el.optMotion.checked);
    if (cb.motion) cb.motion(el.optMotion.checked);
  });
  el.howto.innerHTML = controlsHtml('all');
  el.hintFull.innerHTML = controlsHtml('kb');

  const ui = {
    on(ev, fn) { cb[ev] = fn; },
    get screen() { return current; },

    show(name) {
      if (current === name) return;
      current = name;
      // 'results' e 'winner' ficam por cima do HUD/cena; 'game' é a base durante a rodada
      setHidden(screens.lobby, name !== 'lobby');
      setHidden(screens.game, name !== 'game' && name !== 'results');
      setHidden(screens.results, name !== 'results');
      setHidden(screens.winner, name !== 'winner');
      if (name === 'lobby') {
        if (!el.name.disabled && !matchMedia('(pointer: coarse)').matches) el.name.focus({ preventScroll: true });
        else if (!el.btnStart.hidden) el.btnStart.focus({ preventScroll: true });
      } else if (name === 'winner') {
        el.btnAgain.focus({ preventScroll: true });
      } else if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    },

    setProfile({ name, char: c, reduceMotion }) {
      if (typeof name === 'string') el.name.value = name.slice(0, 14);
      if (c) selectChar(c, false);
      if (reduceMotion) { el.optMotion.checked = true; document.documentElement.classList.add('reduce-motion'); }
    },
    get char() { return char; },

    /** status: { text, error?, retry? } */
    setLobbyStatus({ text, error = false, retry = false }) {
      setText('status', el.status, text || '');
      el.status.classList.toggle('is-error', !!error);
      setHidden(el.btnRetry, !retry);
    },

    setLobby({ players, myId, joined, connected, pendingJoin }) {
      const me = players.find((p) => p.id === myId);
      setText('rosterTitle', el.rosterTitle, `Jogadores na sala (${players.length}/${MAX_PLAYERS})`);
      const html = players.map((p) =>
        `<li class="${p.id === myId ? 'me' : ''}">${chipHtml(p.color)}<span class="nm">${esc(p.name)}</span>` +
        `${p.id === myId ? '<span class="tag you">Você</span>' : ''}${p.bot ? '<span class="tag">Bot</span>' : ''}</li>`).join('');
      if (last.roster !== html) { last.roster = html; el.rosterList.innerHTML = html; }
      setHidden(el.rosterEmpty, players.length > 0);

      setHidden(el.btnJoin, joined);
      setHidden(el.btnStart, !joined);
      setHidden(el.startNote, !joined);
      el.btnJoin.disabled = !connected || pendingJoin;
      el.btnStart.disabled = !connected;
      el.name.disabled = joined;
      for (const card of el.cards) card.disabled = joined;
      setHidden(el.myColor, !me);
      if (me) {
        const i = ((me.color | 0) % 16 + 16) % 16;
        const chip = chipHtml(me.color);
        if (last.myChip !== chip) { last.myChip = chip; el.myChip.outerHTML = chip.replace('class="chip"', 'class="chip" id="my-chip"'); el.myChip = $('my-chip'); }
        setText('myColorName', el.myColorName, PLAYER_COLORS[i][0]);
      }
      if (joined && current === 'lobby' && (document.activeElement === document.body || document.activeElement === el.btnJoin || document.activeElement === el.name)) {
        el.btnStart.focus({ preventScroll: true });
      }
    },

    setConn(text) {
      setHidden(el.conn, !text);
      if (text) setText('conn', el.conn, text);
    },

    // ── Rodada ──
    setRoundInfo({ round, total, map }) {
      setText('hudRound', el.hudRound, `Fase ${round + 1}/${total} ·`);
      setText('hudMap', el.hudMap, mapLabel(map));
      el.feed.innerHTML = '';
      ui.hideBanner(true);
      setHidden(el.toast, true);
    },

    /** intro: null | { round, total, map, cap, watching } */
    setIntro(intro) {
      setHidden(el.intro, !intro);
      if (!intro) return;
      const key = `${intro.round}|${intro.map.id}|${intro.cap}|${intro.watching}`;
      if (last.intro === key) return;
      last.intro = key;
      const n = intro.cap;
      el.introRound.textContent = `Fase ${intro.round + 1} de ${intro.total}`;
      el.introName.textContent = mapLabel(intro.map);
      let goal;
      if (intro.map.id === 'jets') goal = 'Os jatos empurram para a água e os anéis afundam de fora para dentro. Vá para o centro pelas grades — o último de pé vence!';
      else if (intro.map.mode === 'survival') goal = 'Fique fora da água! Sobreviva até o tempo acabar para se classificar.';
      else goal = n === 1 ? 'Desça até a piscina! O primeiro a chegar vence.' : `Desça até a piscina! Os primeiros ${n} se classificam.`;
      el.introGoal.textContent = goal;
      setHidden(el.introWatch, !intro.watching);
      if (intro.watching) el.introWatch.textContent = intro.watching;
    },

    /** text: null | '3' | '2' | '1' | 'JÁ!' */
    setCountdown(text) {
      if (last.countdown === text) return;
      last.countdown = text;
      setHidden(el.countdown, !text);
      if (!text) return;
      el.countdown.textContent = text;
      el.countdown.classList.remove('tick', 'go');
      void el.countdown.offsetWidth; // reinicia a animação
      el.countdown.classList.add(text === 'JÁ!' ? 'go' : 'tick');
    },

    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      setText('time', el.hudTime, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      const low = s <= 10 && s > 0;
      if (last.low !== low) { last.low = low; el.hudTimer.classList.toggle('is-low', low); }
    },

    /** corrida: { mode:'race', qualified, cap } · sobrevivência: { mode:'survival', alive, final } */
    setCount(c) {
      const html = c.mode === 'survival'
        ? `Vivos ${c.alive}<small>· ${c.final ? 'Último de pé vence' : 'Sobreviva até o tempo acabar'}</small>`
        : `Qualificados ${c.qualified}/${c.cap}`;
      if (last.count === html) return;
      const first = last.count === undefined;
      last.count = html;
      el.hudCount.innerHTML = html;
      if (!first) { el.hudCount.classList.remove('pop'); void el.hudCount.offsetWidth; el.hudCount.classList.add('pop'); }
    },

    feed(text, kind) {
      const li = document.createElement('li');
      li.textContent = text;
      if (kind) li.className = kind;
      el.feed.prepend(li);
      while (el.feed.children.length > 3) el.feed.lastChild.remove();
      setTimeout(() => li.remove(), 3000);
    },

    /** kind: 'ok' | 'out' | 'info' */
    banner(kind, title, sub, ms = 2600) {
      clearTimeout(bannerTimer);
      el.banner.className = `banner ${kind}`;
      el.bannerIcon.textContent = kind === 'ok' ? '✓' : kind === 'out' ? '✕' : '';
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.hidden = false;
      if (ms > 0) bannerTimer = setTimeout(() => ui.hideBanner(), ms);
    },
    hideBanner(now = false) {
      clearTimeout(bannerTimer);
      if (el.banner.hidden) return;
      if (now) { el.banner.hidden = true; return; }
      el.banner.classList.add('leave');
      bannerTimer = setTimeout(() => { el.banner.hidden = true; }, 160);
    },

    toast(text, ms = 1500) {
      clearTimeout(toastTimer);
      el.toast.textContent = text;
      el.toast.hidden = true; void el.toast.offsetWidth; el.toast.hidden = false;
      toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
    },

    /** spec: null | { name, note, canSwitch } */
    setSpectate(spec) {
      setHidden(el.spectate, !spec);
      if (!spec) return;
      setText('specName', el.specName, spec.name || '—');
      setText('specNote', el.specNote, spec.note || 'Assistindo a');
      setHidden(el.specPrev, !spec.canSwitch); setHidden(el.specNext, !spec.canSwitch); setHidden(el.specHint, !spec.canSwitch);
    },

    // dica de controles: aberta nos primeiros 8 s da fase e enquanto Tab estiver pressionado
    showHint(ms = 8000) {
      clearTimeout(hintTimer);
      el.hint.classList.add('open');
      hintTimer = setTimeout(() => { if (!hintPinned) el.hint.classList.remove('open'); }, ms);
    },
    holdHint(v) {
      if (v === 'toggle') v = !hintPinned;
      hintPinned = !!v;
      if (hintPinned) { clearTimeout(hintTimer); el.hint.classList.add('open'); } else el.hint.classList.remove('open');
    },
    setHintVisible(v) { if (last.hintVis !== v) { last.hintVis = v; el.hint.style.visibility = v ? '' : 'hidden'; } },
    setDevice(device) {
      el.hintFull.innerHTML = controlsHtml(device);
      el.hintMin.innerHTML = device === 'pad' ? '<kbd>Start</kbd> controles' : '<kbd>Tab</kbd> controles';
      setHidden(el.hint, device === 'touch');
    },

    /** v: null (oculta) | { state, speed } */
    setSpeed(v) {
      setHidden(el.speed, !v);
      if (!v) return;
      const label = { ground: 'Correndo', air: 'No ar', dive: 'Mergulho', slide: 'Deslize' }[v.state] || '';
      setText('speedState', el.speedState, v.stun ? 'Tonto!' : label);
      const sp = Math.round(v.speed);
      setText('speedVal', el.speedVal, String(sp));
      const w = `${Math.min(100, Math.round((v.speed / 36) * 100))}%`;
      if (last.speedW !== w) { last.speedW = w; el.speedFill.style.width = w; }
      const slide = v.state === 'slide' || v.state === 'dive';
      if (last.slide !== slide) { last.slide = slide; el.speed.classList.toggle('is-slide', slide); }
    },

    /** p: null | 0..1 */
    setProgress(p) {
      setHidden(el.progress, p == null);
      if (p == null) return;
      const w = `${(p * 100).toFixed(1)}%`;
      if (last.prog !== w) { last.prog = w; el.progressFill.style.width = w; el.progressDot.style.left = w; }
    },

    setLockHint(show) { setHidden(el.lockHint, !show); },

    // ── Placar ──
    showResults({ title, kicker, results, myId, colors }) {
      el.resultsKicker.textContent = kicker;
      el.resultsTitle.textContent = title;
      const rows = results.slice().sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
      el.resultsBody.innerHTML = rows.map((r) => {
        const ok = r.status === 'qualified';
        return `<tr class="${r.id === myId ? 'me' : ''}"><td class="pos">${r.place != null ? `${r.place}º` : '—'}</td>` +
          `<td class="who">${chipHtml(colors.get(r.id) ?? 0)}<span>${esc(r.name)}</span>${r.id === myId ? '<span class="tag you">Você</span>' : ''}</td>` +
          `<td class="sit ${ok ? 'ok' : 'out'}">${ok ? '✓ Qualificado' : '✕ Eliminado'}</td></tr>`;
      }).join('');
      ui.show('results');
      const mine = el.resultsBody.querySelector('tr.me');
      if (mine && mine.scrollIntoView) mine.scrollIntoView({ block: 'nearest' });
    },
    setResultsFoot(text) { setText('resultsFoot', el.resultsFoot, text); },

    showWinner({ podium, winnerId, myId }) {
      const sorted = podium.slice().sort((a, b) => a.place - b.place);
      const w = sorted.find((p) => p.id === winnerId) || sorted[0];
      el.winnerTitle.textContent = w && w.id === myId ? 'VOCÊ VENCEU!' : `${w ? w.name : 'Alguém'} VENCEU!`;
      el.podium.innerHTML = sorted.slice(0, 3).map((p) =>
        `<li class="p${p.place}"><b>${p.place}º lugar</b>${chipHtml(p.color)}<span class="nm">${esc(p.name)}</span>` +
        `${p.id === myId ? '<span class="tag you">Você</span>' : ''}</li>`).join('');
      ui.show('winner');
    },
    setWinnerFoot(text) { setText('winnerFoot', el.winnerFoot, text); setHidden(el.winnerFoot, !text); },
  };

  return ui;
}
