# Ícaro Fall — Arquitetura da PoC

```
icaro-fall/
  shared/      núcleo determinístico, sem dependências (cliente + servidor)
    constants.js   física, estados, flags
    physics.js     controlador do personagem: createBody / createInput / createWorld / placeBody / stepBody
    maps/          slide.js (Tobogã), arena.js (Arena), jets.js (Labirinto), index.js (MAPS, qualifyCap)
    protocol.js    mensagens WebSocket (documentadas no topo do arquivo)
    bot.js         IA dos bots (gera Input a partir do corpo + mapa)
  server/      Node + ws: lobby, rodadas, bots, qualificação/eliminação; serve dist/ em produção
  client/      Vite + Three.js
    index.html, src/main.js, src/app/*   shell: telas, HUD, entrada, rede, loop do jogo
    src/render/*                          GameView: cena 3D, personagens, mapas, efeitos, câmera
  test/        node --test
  docs/        requisitos.md, design.md, arquitetura.md
```

## Decisões

- **Simulação**: passo fixo `TICK = 1/60`. Cada cliente simula só o próprio personagem com `stepBody` e envia o
  estado a 20 Hz. O servidor simula os bots com o mesmo código e é a autoridade da partida (relógio,
  qualificação, eliminação, vagas). Sem anti-cheat (PoC).
- **Objetos de mapa determinísticos**: plataformas flutuantes e jatos são função pura do tempo da rodada `t`
  (`floatState(f, t)`, `jetAngle(j, t)`), então não trafegam na rede. O único estado de mapa sincronizado são as
  boias estouradas (`world.popped`, mensagem `pop`).
- **Relógio**: `round.startAt` é o instante (relógio do servidor, ms) em que `t = 0`. O cliente estima o offset com
  `ping/pong` e usa `t = (agoraServidor - startAt) / 1000`. Com `t < 0` é contagem regressiva: personagens parados.
- **Mapa = dados + ganchos** (`groundAt`, `affect`, `finished`, `progress`, `respawn`, `spawn`, `killY`, `mode`,
  `timeLimit`). A renderização lê os mesmos dados (amostras da pista, plataformas, anéis, grades, jatos), o que
  garante que o visual bate com a colisão.
- **Queda (`body.fell`)**: em mapa de corrida o dono do corpo chama `map.respawn(body)`; em sobrevivência o
  servidor elimina (`y < killY`).

## Contrato do GameView (client/src/render/index.js)

```js
const view = createGameView(canvas);       // dono do WebGLRenderer, cena, câmera, luzes, céu, água
view.loadMap(mapId);                       // 'slide' | 'arena' | 'jets' | null (cenário do lobby); descarta o anterior
view.addPlayer({ id, name, char, color, isLocal });   // char 'icaro'|'penguin'; color 0..15
view.removePlayer(id); view.clearPlayers();
view.setPlayerState(id, { x, y, z, yaw, state, speed, vy, stun, status });
        // chamado todo frame por jogador; state ∈ STATES; status: null | 'qualified' | 'eliminated'
        // 'eliminated' => o view esconde o personagem (após efeito); 'qualified' => pose de comemoração
view.popBuoy(id);                          // mapa 1: estoura a boia (efeito + some)
view.emit(type, { x, y, z });              // 'splash'|'boost'|'hit'|'land'|'dive'|'slideStart'|'jump'|'confetti'
view.setCamera({ targetId, yaw, pitch });  // órbita em 3ª pessoa controlada pelo app; o view suaviza o resto
view.update(t, dt);                        // t = tempo da rodada (move plataformas/jatos); dt = delta do frame
view.render();
view.resize(width, height);
view.dispose();
```
