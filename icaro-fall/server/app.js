// Servidor HTTP + WebSocket. Em produção também serve o cliente compilado (dist/).
// A lógica de partida fica em room.js; aqui só há transporte e o relógio (Date.now()).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DEFAULT_PORT, WS_PATH, encode, decode } from '../shared/protocol.js';
import { TICK } from '../shared/constants.js';
import { Room } from './room.js';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};

function sendFile(res, file, head) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  // arquivos com hash do Vite (assets/) podem ficar em cache; o index.html não
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
  if (head) res.end(); else fs.createReadStream(file).pipe(res);
}

/** Estáticos de dist/ com fallback para index.html (rotas do cliente). */
function serveStatic(req, res, dist) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  const head = req.method === 'HEAD';
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (!fs.existsSync(dist)) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Ícaro Fall — servidor de jogo no ar (WebSocket em ' + WS_PATH + ').\n'
      + 'Cliente: rode "npm run dev" (Vite) ou "npm run build" para servir dist/ por aqui.\n');
    return;
  }
  const file = path.join(dist, path.normalize(rel));
  if (file !== dist && !file.startsWith(dist + path.sep)) { res.writeHead(403).end(); return; } // fora de dist/
  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) { sendFile(res, file, head); return; }
    const index = path.join(dist, 'index.html');
    // arquivo com extensão que não existe é 404 de verdade; o resto cai no index.html
    if (path.extname(rel) || !fs.existsSync(index)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado\n');
      return;
    }
    sendFile(res, index, head);
  });
}

/** Lê um inteiro positivo de uma variável de ambiente (undefined se ausente/inválida). */
function envNum(name) {
  const v = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/**
 * Sobe o servidor. Opções (todas opcionais; o padrão vem do ambiente):
 *   port        PORT                porta HTTP/WS (0 = aleatória)
 *   totalPlayers BOTS               total de participantes por partida (humanos + bots), até MAX_PLAYERS
 *   timeLimit   TEST_TIME_LIMIT     s; encurta todas as rodadas (testes)
 *   introMs     TEST_INTRO_MS       ms entre 'round' e a largada
 *   roundEndMs  TEST_ROUND_END_MS   ms de pausa após 'roundEnd'
 *   gameEndMs   TEST_GAME_END_MS    ms de tela do vencedor antes de voltar ao lobby
 */
export function startServer(opts = {}) {
  const room = new Room({
    totalPlayers: opts.totalPlayers ?? envNum('BOTS'),
    timeLimit: opts.timeLimit ?? envNum('TEST_TIME_LIMIT'),
    introMs: opts.introMs ?? envNum('TEST_INTRO_MS'),
    roundEndMs: opts.roundEndMs ?? envNum('TEST_ROUND_END_MS'),
    gameEndMs: opts.gameEndMs ?? envNum('TEST_GAME_END_MS'),
    seed: opts.seed,
  });
  const dist = opts.dist ?? DIST;
  const server = http.createServer((req, res) => serveStatic(req, res, dist));
  const wss = new WebSocketServer({ server, path: WS_PATH, maxPayload: 4096 });

  wss.on('connection', (ws) => {
    const send = (msg) => { if (ws.readyState === ws.OPEN) ws.send(encode(msg)); };
    const id = room.connect(send, Date.now());
    ws.on('message', (raw) => {
      const msg = decode(raw);
      if (msg && typeof msg.t === 'string') room.handle(id, msg, Date.now());
    });
    ws.on('close', () => room.disconnect(id, Date.now()));
    ws.on('error', () => ws.terminate());
  });

  // laço da sala: o passo fixo fica no acumulador de room.update(), aqui só damos o relógio
  const timer = setInterval(() => room.update(Date.now()), TICK * 1000);

  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? envNum('PORT') ?? DEFAULT_PORT, () => resolve(server.address().port));
  });

  function close() {
    clearInterval(timer);
    for (const ws of wss.clients) ws.terminate();
    return new Promise((resolve) => wss.close(() => server.close(() => resolve())));
  }

  return { room, server, wss, ready, close };
}
