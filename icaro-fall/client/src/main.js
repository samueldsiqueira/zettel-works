// Ponto de entrada do cliente: monta o GameView (render), rede, entrada, UI e o loop do jogo.
import './app/styles.css';
import * as render from './render/index.js';
import { createNet } from './app/net.js';
import { createLocalNet } from './app/localnet.js';
import { createInputManager } from './app/input.js';
import { createUi } from './app/ui.js';
import { createGame } from './app/game.js';

const canvas = document.getElementById('game');
const view = render.createGameView(canvas);
// build offline (VITE_OFFLINE=1): sala e bots rodam no próprio navegador, sem servidor
const net = import.meta.env.VITE_OFFLINE ? createLocalNet() : createNet();
const input = createInputManager(canvas);
const ui = createUi();
const game = createGame({ view, net, input, ui, lobbySpot: render.LOBBY ? render.LOBBY.spot(0, 1) : null });

function resize() {
  view.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

game.start();

// Depuração / testes automatizados
window.__game = {
  get state() { return game.state; },
  get body() { return game.body; },
  get world() { return game.world; },
  get view() { return view; },
  get net() { return net; },
  game,
};
