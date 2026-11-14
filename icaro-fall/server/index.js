// Ponto de entrada do servidor do Ícaro Fall:  node server/index.js
// Porta: PORT (padrão DEFAULT_PORT). Outras variáveis (BOTS, TEST_*): ver startServer() em app.js.
import { startServer } from './app.js';
import { WS_PATH } from '../shared/protocol.js';

const app = startServer();
app.ready.then(
  (port) => console.log(`[icaro-fall] servidor em http://localhost:${port}  (WebSocket em ${WS_PATH})`),
  (err) => { console.error('[icaro-fall] falha ao subir o servidor:', err.message); process.exit(1); },
);

const stop = () => app.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
