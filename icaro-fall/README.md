# Ícaro Fall

Prova de conceito de um *battle royale de plataforma* multiplayer no navegador: 16 competidores, três fases, metade
eliminada a cada fase.

| Fase | Mapa | Regra |
|---|---|---|
| 1 | **O Tobogã Radical** | Corrida de toboágua. Deslize de barriga, aceleradores (+50%) e boias que freiam. Metade se qualifica. |
| 2 | **A Arena de Sobrevivência** | A plataforma central encolhe; as flutuantes orbitam e afundam. Quem estiver vivo ao fim do tempo avança. |
| 3 | **O Labirinto de Jatos** | Final. Jatos giratórios empurram para a água e os anéis afundam de fora para dentro. Último de pé vence. |

## Rodar

```bash
npm install
npm run dev        # servidor de jogo (3001) + Vite (http://localhost:5173)
```

Produção: `npm run build && npm start` e abra `http://localhost:3001` (o servidor Node serve `dist/` e o WebSocket).
Para jogar com amigos, todos abrem o mesmo endereço; vagas vazias viram bots.

Testes: `npm test`.

## Controles

| Ação | Teclado | Gamepad |
|---|---|---|
| Mover | WASD / setas | Analógico esquerdo |
| Pular | Espaço | A |
| Pulo duplo + mergulho | Espaço no ar | A no ar |
| Mergulho | Shift ou E | B / X |
| Câmera | Mouse | Analógico direito |

Mergulhar e tocar o chão de barriga inicia o **deslize** com impulso. Quando perder velocidade e levantar, repita
pulo → pulo duplo para deslizar de novo.

## Documentação

- [`docs/requisitos.md`](docs/requisitos.md) — requisitos, ambiguidades do SDD e critérios de aceite
- [`docs/design.md`](docs/design.md) — direção de arte, personagens, UI/HUD
- [`docs/arquitetura.md`](docs/arquitetura.md) — estrutura, decisões técnicas e contratos
