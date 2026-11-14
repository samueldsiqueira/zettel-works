# Ícaro Fall — Documento de Requisitos da PoC

Versão 1.0 — 2026-11-13. Base: SDD do cliente (seções §1 a §6) e decisões do tech lead (DT-xx).
Público: equipe de desenvolvimento. Jogo original: nomes, personagens, fases e assets não podem ser copiados de jogos existentes.

Convenções:

- **RF-xx** = requisito funcional; **RNF-xx** = requisito não funcional; **AMB-xx** = ambiguidade/contradição do SDD; **DT-xx** = decisão do tech lead; **CA-xx** = critério de aceite; **PEN-xx** = pendência para o cliente.
- Coluna "Origem" aponta a seção do SDD (§) e/ou a decisão (DT) que sustenta o requisito.
- Itens marcados **[proposta]** são resoluções sugeridas por este documento, ainda não validadas pelo tech lead nem pelo cliente. Valores numéricos marcados assim são pontos de partida para ajuste (tuning).

---

> **Decisões do cliente (prevalecem sobre qualquer resolução/proposta abaixo que conflite):**
> 1. **Mapa 2 (Arena):** não há linha de chegada; a rodada dura o tempo inteiro e **todos os que estiverem vivos ao fim do tempo avançam** (o corte pode ficar acima ou abaixo de 50%). Só encerra antes se restarem 2 ou menos.
> 2. **Mapa 3 (Labirinto):** final de sobrevivência — **último de pé vence**. Cair na água elimina. Os anéis afundam de fora para dentro para garantir desfecho dentro do tempo; se o tempo acabar com mais de um vivo, vence quem estiver mais perto do centro.
> 3. **Colisão entre jogadores:** fora da PoC.
> 4. **Pinguim:** diferença apenas visual; mesma física do Ícaro.

## 1. Escopo

### 1.1 Dentro do escopo da PoC

- Jogo 3D no navegador (Three.js + Vite) com servidor Node.js via WebSocket (DT-01).
- Uma sala de até 16 participantes; vagas vazias preenchidas por bots simulados no servidor (DT-01).
- Lobby com nome e escolha de personagem (Ícaro ou Pinguim) (DT-09).
- Movimentação: andar, pulo, pulo duplo com mergulho, deslize de barriga (§2).
- Três fases em ordem fixa: Tobogã Radical (corrida), Arena de Sobrevivência (sobrevivência), Labirinto de Jatos (final) (§4, §5).
- Cortes 16 -> 8 -> 4 -> 1 vencedor, com cronômetro por fase (§3, DT-02).
- Entrada por teclado + mouse e por gamepad (§6, DT-07).
- Modo espectador simples para eliminados e tela de resultado final.

### 1.2 Fora do escopo da PoC

- Anti-cheat e validação de movimento no servidor (DT-08).
- Contas, login, persistência, ranking histórico, matchmaking, múltiplas salas simultâneas **[proposta]**.
- Reconexão à partida em andamento **[proposta]**.
- Builds nativos para console e suporte a dispositivos móveis/toque (ver AMB-11).
- Colisão física entre jogadores (empurrar/agarrar) **[proposta]**, ver AMB-14.
- Loja, cosméticos, progressão, chat de texto/voz.
- Arte final, trilha sonora e dublagem: a PoC usa modelos estilizados simples e efeitos sonoros mínimos (opcionais).
- Conformidade formal de acessibilidade (WCAG); "acessibilidade" é tratada como facilidade de jogar (AMB-15).
- Remapeamento de controles, localização além de pt-BR.

---

## 2. Requisitos funcionais

### 2.1 Lobby e sala

| ID | Requisito | Origem |
|---|---|---|
| RF-01 | O jogador acessa o jogo pelo navegador, informa um nome e escolhe o personagem (Ícaro ou Pinguim) antes de entrar na sala. | §2, DT-09 |
| RF-02 | A sala comporta no máximo 16 participantes. Ao iniciar a partida, o servidor preenche as vagas vazias com bots até completar 16. | DT-01 |
| RF-03 | O lobby exibe a lista de participantes (nome e personagem) atualizada em tempo real. | DT-09 |
| RF-04 | A partida inicia quando qualquer jogador humano aciona "Iniciar" no lobby, com contagem regressiva visível para todos. **[proposta]** | AMB-16 |
| RF-05 | Conexões recebidas com a partida em andamento ou com a sala cheia são recusadas com mensagem clara ("partida em andamento" / "sala cheia"). **[proposta]** | AMB-16 |
| RF-06 | Bots recebem nome e personagem atribuídos pelo servidor e são identificáveis como bots no lobby. **[proposta]** | DT-01 |

### 2.2 Personagem e movimentação

| ID | Requisito | Origem |
|---|---|---|
| RF-10 | Há dois personagens jogáveis: Ícaro (humano estilizado) e Pinguim. A diferença é apenas visual; física e área de colisão são idênticas. **[proposta]** | §2, AMB-08 |
| RF-11 | Cada jogador é identificado por nome flutuante sobre o personagem e por uma cor distinta. **[proposta]** | §2, AMB-08 |
| RF-12 | O personagem anda em qualquer direção relativa à câmera, com animação de caminhada. | §2 |
| RF-13 | No chão, a ação de pulo executa um pulo simples. | §2, DT-07 |
| RF-14 | No ar, a ação de pulo executa o pulo duplo (um por salto), que já coloca o personagem em mergulho (corpo estendido para frente). | §2, DT-07 |
| RF-15 | A ação dedicada de mergulho, usada no ar, coloca o personagem em mergulho e consome o pulo duplo. No chão, não tem efeito. **[proposta]** | DT-07, AMB-07 |
| RF-16 | Tocar o chão em mergulho inicia o deslize de barriga com impulso inicial na direção do movimento. | §2 |
| RF-17 | Durante o deslize a velocidade decai por atrito (menor em rampas descendentes); abaixo de um limiar o personagem se levanta e volta a andar. | §2 |
| RF-18 | Para retomar o deslize após se levantar, o jogador precisa repetir pulo + pulo duplo/mergulho. | §2, §4 |
| RF-19 | Câmera em terceira pessoa segue o jogador, controlada por mouse ou analógico direito. | DT-07 |

### 2.3 Controles

| ID | Requisito | Origem |
|---|---|---|
| RF-20 | Teclado: WASD ou setas movem; Espaço pula; Espaço no ar faz pulo duplo com mergulho; Shift ou E mergulha. | §6, DT-07 |
| RF-21 | Gamepad (Gamepad API do navegador): analógico esquerdo move; A pula; B ou X mergulha; analógico direito controla a câmera. | §6, DT-07 |
| RF-22 | Teclado e gamepad funcionam simultaneamente, sem tela de configuração. | §6 |
| RF-23 | O lobby exibe um resumo dos controles. **[proposta]** | §1, §6 |

### 2.4 Estrutura da partida

| ID | Requisito | Origem |
|---|---|---|
| RF-30 | A partida tem três fases em ordem fixa: Mapa 1 -> Mapa 2 -> Mapa 3. | §3, §5 |
| RF-31 | Cada fase começa com todos posicionados na largada e contagem regressiva; o movimento só é liberado no zero. **[proposta]** | AMB-09 |
| RF-32 | Cada fase tem cronômetro regressivo controlado pelo servidor: 180 s (Mapa 1), 180 s (Mapa 2), 210 s (Mapa 3). | §3, DT-03, DT-04, DT-05 |
| RF-33 | Nas fases 1 e 2, o número de vagas é `ceil(n/2)`, onde `n` é o número de participantes no início da fase. | §3, DT-02 |
| RF-34 | O servidor é a autoridade sobre lobby, cronômetro, qualificação, eliminação e vencedor; os clientes apenas exibem esse estado. | DT-08 |
| RF-35 | O HUD exibe: nome da fase, cronômetro, contador de qualificados/vagas (ou vivos/vagas no Mapa 2) e o estado do jogador ("Qualificado" / "Eliminado"). | §3 |
| RF-36 | Ao fim de cada fase, uma tela de resultado lista qualificados e eliminados antes da próxima fase. | §3 |
| RF-37 | Jogadores eliminados passam a assistir à partida como espectadores (câmera seguindo um participante ativo) até o resultado final. **[proposta]** | AMB-13 |
| RF-38 | Jogador que se desconecta durante a partida é tratado como eliminado; `n` e as vagas da fase corrente não são recalculados. **[proposta]** | AMB-02 |
| RF-39 | Se, ao fim de uma fase, restar apenas um qualificado, ele é declarado vencedor e a partida termina. Se ninguém se qualificar na fase 1, qualifica-se o participante com maior progresso na pista. **[proposta]** | AMB-12 |
| RF-40 | Ao fim da partida, a tela final exibe o vencedor e permite voltar ao lobby. | §3, DT-05 |

### 2.5 Mapa 1 — "O Tobogã Radical" (corrida)

| ID | Requisito | Origem |
|---|---|---|
| RF-50 | Pista descendente em formato de toboágua, com curvas, bordas laterais e linha de chegada no fim. | §4, DT-03 |
| RF-51 | A largada fica em plataforma acima da pista: os jogadores saltam para a pista e podem entrar em deslize com o mergulho. | §4, AMB-09 |
| RF-52 | Aceleradores (setas no chão) aumentam a velocidade em 50% por tempo limitado ao serem tocados. Parâmetros iniciais: fator 1,5 sobre a velocidade atual, duração 2 s, sem acúmulo (um novo toque renova a duração). **[proposta para os parâmetros]** | §4, AMB-10 |
| RF-53 | Obstáculos (boias e infláveis em forma de animais) estouram ao contato e reduzem a velocidade do jogador (inicial: -40%). **[proposta para o valor]** | §4, AMB-10 |
| RF-54 | O estouro de um obstáculo é visível para todos; o obstáculo reaparece após 5 s. **[proposta]** | AMB-10 |
| RF-55 | Sair dos limites da pista devolve o jogador ao último checkpoint. **[proposta]** | AMB-13 |
| RF-56 | Cruzar a linha de chegada qualifica o jogador enquanto houver vagas. A fase termina quando as vagas enchem ou o tempo acaba; quem não chegou é eliminado. | §3, §5, DT-02 |

### 2.6 Mapa 2 — "A Arena de Sobrevivência"

| ID | Requisito | Origem |
|---|---|---|
| RF-60 | Plataforma central circular cercada por água, com plataformas flutuantes ao redor. | §4 |
| RF-61 | A plataforma central encolhe progressivamente ao longo da rodada. | DT-04 |
| RF-62 | As plataformas flutuantes orbitam, balançam e submergem periodicamente, com dificuldade crescente. | §4, DT-04 |
| RF-63 | Cair na água elimina o participante imediatamente. | §4, DT-04 |
| RF-64 | A rodada termina quando o número de vivos for <= vagas ou aos 180 s. Não há linha de chegada: "qualificado" = vivo ao fim da rodada. | DT-04 |
| RF-65 | Se aos 180 s houver mais vivos que vagas, qualificam-se os de maior pontuação de movimento (distância percorrida na rodada, apurada pelo servidor); os demais são eliminados. | DT-04 |
| RF-66 | Se quedas simultâneas deixarem menos vivos que vagas, as vagas restantes são preenchidas pelos últimos a cair (ordem de registro no servidor). **[proposta]** | AMB-04 |
| RF-67 | O movimento das plataformas é determinístico a partir do relógio do servidor, de modo que todos os clientes vejam as mesmas posições. | DT-08, RNF-05 |

### 2.7 Mapa 3 — "O Labirinto de Jatos" (final)

| ID | Requisito | Origem |
|---|---|---|
| RF-70 | Arena circular formada por anéis concêntricos separados por canais de água; largada no anel externo e chegada no pódio central. | §4, DT-05 |
| RF-71 | A travessia entre anéis é feita por grades (plataformas pequenas) que exigem pulos precisos. | §4, DT-05 |
| RF-72 | Braços de jato giratórios varrem os anéis. Jatos baixos são evitados pulando; jatos altos, passando por baixo em deslize. | §4, DT-05 |
| RF-73 | Ser atingido por um jato empurra o jogador na direção do jato (sem eliminar). | DT-05 |
| RF-74 | Cair na água devolve o jogador ao último checkpoint (um por anel alcançado). | DT-05 |
| RF-75 | Os padrões dos jatos (velocidade, sentido, altura, intervalos) variam ao longo da fase de forma pseudoaleatória, a partir de semente definida pelo servidor e idêntica para todos. **[proposta]** | §4, AMB-05 |
| RF-76 | O primeiro a chegar ao pódio central vence e a partida termina. | DT-05 |
| RF-77 | Se ninguém chegar em 210 s, vence quem estiver mais perto do centro no instante do fim do tempo. | DT-05 |

### 2.8 Bots e rede

| ID | Requisito | Origem |
|---|---|---|
| RF-80 | Bots são simulados no servidor e, para os clientes, comportam-se como jogadores remotos (posição, animação, qualificação, eliminação). | DT-01 |
| RF-81 | Bots conseguem concluir as três fases com desempenho variado e falível (um humano atento deve conseguir vencê-los). **[proposta]** | DT-01 |
| RF-82 | O cliente simula o movimento do jogador local e envia seu estado ao servidor, que o retransmite aos demais. | DT-08 |
| RF-83 | Jogadores remotos e bots são exibidos com interpolação entre os estados recebidos. | DT-08 |
| RF-84 | Eventos de partida (chegada, queda na água, estouro de obstáculo) são confirmados pelo servidor antes de produzirem efeito de regra (qualificação/eliminação). | DT-08 |

---

## 3. Requisitos não funcionais

| ID | Requisito | Origem |
|---|---|---|
| RNF-01 | Cliente em Three.js + Vite; servidor em Node.js com WebSocket. | DT-01 |
| RNF-02 | Funciona nas versões atuais de Chrome, Edge e Firefox em desktop, sem instalação de plugins. **[proposta]** | DT-01 |
| RNF-03 | Meta de 60 fps (mínimo aceitável 30 fps) com 16 personagens em cena, em notebook com vídeo integrado recente. **[proposta]** | §1 |
| RNF-04 | Envio de estado do jogador a cerca de 20 Hz; retransmissão pelo servidor na mesma ordem de grandeza. **[proposta]** | DT-08 |
| RNF-05 | O cronômetro exibido no cliente difere do servidor em no máximo 0,5 s; elementos móveis dos mapas são sincronizados pelo relógio do servidor. **[proposta]** | DT-08 |
| RNF-06 | O jogo permanece jogável com latência de até 150 ms (sem travar o movimento local). **[proposta]** | DT-08 |
| RNF-07 | Visual cartunesco e vibrante: cores saturadas, formas simples, iluminação clara. | §1 |
| RNF-08 | Fácil de aprender: no máximo três ações além do movimento (pulo, pulo duplo/mergulho, câmera), sem tutorial obrigatório. | §1, §6 |
| RNF-09 | Sem anti-cheat na PoC: o servidor confia na posição enviada pelo cliente. Limitação aceita e documentada. | DT-08 |
| RNF-10 | Um único processo de servidor atende uma sala; estado apenas em memória, sem banco de dados. **[proposta]** | DT-01 |
| RNF-11 | A lógica de partida do servidor (vagas, corte, desempate, término de fase) é isolada de rede e renderização, permitindo testes automatizados. **[proposta]** | DT-02, DT-04 |
| RNF-12 | Todo conteúdo (nomes, personagens, mapas, modelos, sons) é original ou de licença livre compatível, com registro da origem. | Briefing |
| RNF-13 | Interface em português do Brasil. **[proposta]** | — |
| RNF-14 | Parâmetros de jogabilidade (tempos, velocidades, fatores, número de vagas) ficam centralizados em configuração para ajuste sem alterar a lógica. **[proposta]** | §3, §4 |
| RNF-15 | Cliente e servidor sobem localmente com um comando cada, e o jogo é acessível por outras máquinas da mesma rede. **[proposta]** | DT-01 |

---

## 4. Ambiguidades e contradições do SDD

### 4.1 Resolvidas por decisão do tech lead

| ID | Problema no SDD | Resolução adotada |
|---|---|---|
| AMB-01 | §3: limite "rigoroso" mas definido como faixa "de 3 a 4 minutos". | Valores fixos: 180 s (Mapa 1), 180 s (Mapa 2), 210 s (Mapa 3). (DT-03/04/05) |
| AMB-03 | §3 e §5 exigem "cruzar a chegada", mas o Mapa 2 (§4) é de sobrevivência e não tem chegada. | No Mapa 2, "cruzar a chegada" = estar vivo ao fim da rodada; termina com <= 50% vivos ou em 180 s; desempate por distância percorrida. (DT-04) |
| AMB-05a | §4: Mapa 3 descrito como "labirinto", "arena circular" e "pista" ao mesmo tempo, sem objetivo definido. | Anéis concêntricos com canais de água, largada externa e pódio central; travessia por grades. (DT-05) |
| AMB-06 | §3 fala em "Qualificado" e corte de 50% nas três fases, mas não define como se chega a um vencedor. | Mapa 3 é a final: primeiro a chegar ao centro vence; sem chegada em 210 s, vence o mais próximo do centro. Cortes 16 -> 8 -> 4 -> 1. (DT-01, DT-05) |
| AMB-07a | §2 diz que o pulo duplo já estende o corpo (mergulho); §6 lista "pulo, pulo duplo e mergulho" como três ações. | Espaço no ar = pulo duplo com mergulho; existe também tecla dedicada de mergulho (Shift/E; B/X no gamepad). (DT-07) |
| AMB-11a | §6 cita "PC/console acoplado", sem definir plataforma. | Plataforma é o navegador; gamepads via Gamepad API. (DT-01, DT-07) |
| AMB-12a | §3 "avançando metade" x §5 "corte pode superar 50%". | Metade é o teto de vagas (`ceil(n/2)`); a corrida termina com vagas cheias ou fim do tempo, e quem não chegou é eliminado. (DT-02) |
| AMB-17 | SDD não define tamanho da sala nem o que ocorre com poucos jogadores. | Sala de 16; bots completam as vagas. (DT-01) |
| AMB-18 | SDD não define autoridade de simulação. | Movimento local no cliente; servidor decide o estado da partida. (DT-08) |

### 4.2 Encontradas na análise — resolução proposta

| ID | Problema | Resolução proposta |
|---|---|---|
| AMB-02 | §3 exige eliminar "no mínimo 50%", mas `ceil(n/2)` com `n` ímpar elimina menos de 50% (ex.: n=5 -> 3 vagas, 40% eliminados). Com bots, `n` é sempre 16/8/4, mas a regra não cobre desconexões nem fases anteriores com menos qualificados que vagas. | `n` é fixado no início da fase; desconexão = eliminação (RF-38). Aceitar que com `n` ímpar o corte fique abaixo de 50%. Cliente deve confirmar (PEN-02). |
| AMB-04 | Mapa 2: quedas simultâneas podem deixar menos vivos que vagas; o SDD não prevê. | Preencher as vagas pelos últimos a cair, por ordem de registro no servidor (RF-66). |
| AMB-05 | §4: jatos em "padrões aleatórios" x "jatos contínuos formam barreiras" que exigem "pulos precisos" — aleatoriedade pura torna a fase injusta e impossível de sincronizar entre clientes. | Padrões pseudoaleatórios a partir de semente do servidor, com restrição de que sempre exista passagem possível (RF-75). |
| AMB-07 | A tecla dedicada de mergulho não tem comportamento definido no chão; §2 afirma que o deslize só se retoma com pulo duplo + extensão. | Mergulho só no ar, consumindo o pulo duplo; no chão não faz nada (RF-15). Alternativa a avaliar em playtest: mergulho rasteiro a partir do chão (PEN-05). |
| AMB-08 | §2: Pinguim serve "para diferenciar jogadores", mas dois modelos não diferenciam 16 participantes; não diz se há diferença de jogabilidade; "caminhada humana padrão" não se aplica ao Pinguim. | Diferença apenas visual; nome flutuante e cor por jogador; Pinguim com animação própria de caminhada (RF-10, RF-11). |
| AMB-09 | §4: "começam pulando na pista" não define a largada. | Plataforma de largada elevada, contagem regressiva e salto para a pista (RF-31, RF-51). |
| AMB-10 | §4: "+50% velocidade" sem base, duração ou acúmulo; "reduz velocidade" sem valor; não diz se o obstáculo estourado some para todos. | Parâmetros iniciais de RF-52 a RF-54, ajustáveis (RNF-14). |
| AMB-11 | §6 sugere console como alvo; a decisão por navegador não cobre console nem dispositivos móveis. | Console e mobile fora do escopo; apenas navegador desktop (seção 1.2). Cliente deve confirmar (PEN-06). |
| AMB-12 | Casos-limite não previstos: ninguém cruza a chegada no Mapa 1; resta um único qualificado antes da final. | RF-39: qualifica o de maior progresso se ninguém chegar; qualificado único vence de imediato. |
| AMB-13 | SDD não define queda para fora da pista (Mapa 1) nem o que o eliminado faz depois. | Retorno ao checkpoint no Mapa 1 (RF-55); eliminado vira espectador (RF-37). |
| AMB-14 | SDD não menciona colisão entre jogadores, comum no gênero. | Sem colisão jogador-jogador na PoC: o modelo com movimento decidido pelo cliente produz resultados inconsistentes entre telas. Personagens se atravessam. (PEN-04) |
| AMB-15 | §1: "acessibilidade" sem definição (facilidade de uso ou acessibilidade para pessoas com deficiência?). | Interpretada como facilidade de jogar (RNF-08). (PEN-07) |
| AMB-16 | SDD não descreve lobby, início de partida nem entrada tardia. | Qualquer humano inicia; entradas durante a partida são recusadas; sala única (RF-04, RF-05, RNF-10). |
| AMB-19 | Mapa 2: a "distância percorrida" do desempate não é definida; plataformas móveis carregam o jogador parado, e a posição vem do cliente (manipulável). | Servidor soma o deslocamento horizontal entre estados recebidos, sem descontar o arrasto da plataforma. Imprecisão aceita na PoC; desempate entre pontuações iguais por ordem de entrada na sala. |
| AMB-20 | Mapa 3: critério "mais perto do centro" não diz como medir. | Distância horizontal ao centro do pódio no instante em que o tempo acaba, apurada pelo servidor; empate decide-se pelo anel mais interno já alcançado e, persistindo, por quem o alcançou primeiro. |

---

## 5. Critérios de aceite

### 5.1 Lobby e sala (RF-01 a RF-06)

- **CA-01** Dado um jogador na tela inicial, quando informa nome, escolhe Pinguim e entra, então aparece na lista do lobby de todos os conectados com esse nome e personagem.
- **CA-02** Dado um lobby com 3 humanos, quando a partida é iniciada, então a fase 1 começa com 16 participantes, sendo 13 bots.
- **CA-03** Dada uma partida em andamento, quando um novo navegador tenta entrar, então recebe a mensagem "partida em andamento" e não entra na fase.
- **CA-04** Dada uma sala com 16 humanos, quando um 17º tenta entrar, então recebe "sala cheia".

### 5.2 Movimentação e controles (RF-10 a RF-23)

- **CA-10** Dado o personagem no chão, quando o jogador pressiona Espaço, então ele pula; quando pressiona Espaço de novo no ar, então sobe novamente e assume a pose de mergulho.
- **CA-11** Dado que o pulo duplo já foi usado, quando o jogador pressiona Espaço no ar outra vez, então nada acontece até tocar o chão.
- **CA-12** Dado o personagem em mergulho, quando toca o chão, então passa a deslizar de barriga com velocidade inicial maior que a de caminhada.
- **CA-13** Dado o personagem deslizando em terreno plano, quando a velocidade cai abaixo do limiar, então ele se levanta e volta a andar; para deslizar de novo é preciso pulo + mergulho.
- **CA-14** Dado o personagem no ar após um pulo simples, quando o jogador pressiona Shift ou E, então ele entra em mergulho e o pulo duplo fica indisponível.
- **CA-15** Dado um gamepad conectado, quando o jogador usa analógico esquerdo, A e B/X, então obtém os mesmos efeitos de WASD, Espaço e Shift.
- **CA-16** Dado o jogador em jogo, quando move o mouse ou o analógico direito, então a câmera orbita o personagem e a direção de "frente" acompanha a câmera.
- **CA-17** Dados um Ícaro e um Pinguim executando as mesmas entradas no mesmo trecho, então percorrem a mesma distância no mesmo tempo.

### 5.3 Estrutura da partida (RF-30 a RF-40)

- **CA-20** Dada a contagem regressiva de largada, quando o jogador tenta se mover antes do zero, então o personagem não sai do lugar.
- **CA-21** Dada uma fase com 16 participantes, então o HUD mostra 8 vagas; com 8 participantes, 4 vagas.
- **CA-22** Dados dois clientes na mesma fase, quando comparados no mesmo instante, então seus cronômetros diferem em no máximo 0,5 s.
- **CA-23** Dado um jogador eliminado, quando a fase seguinte começa, então ele assiste como espectador e não controla personagem.
- **CA-24** Dado um jogador que fecha o navegador durante uma fase, então consta como eliminado no resultado da fase e as vagas não mudam.
- **CA-25** Dada uma partida completa, então as fases ocorrem na ordem Tobogã -> Arena -> Labirinto e os participantes são 16, 8 e 4.
- **CA-26** Dada a tela final, quando o jogador escolhe voltar, então retorna ao lobby e pode iniciar nova partida.

### 5.4 Mapa 1 (RF-50 a RF-56)

- **CA-30** Dado um jogador deslizando, quando passa sobre um acelerador, então sua velocidade aumenta 50% pelo tempo configurado e depois volta ao normal.
- **CA-31** Dado um jogador deslizando, quando toca um inflável, então o inflável estoura para todos os clientes e a velocidade do jogador cai.
- **CA-32** Dado um inflável estourado, quando passa o tempo de reposição, então ele reaparece para todos.
- **CA-33** Dadas 8 vagas, quando o 8º participante cruza a chegada, então a fase termina e os 8 restantes são eliminados.
- **CA-34** Dados 5 qualificados aos 180 s, então a fase termina, apenas esses 5 avançam e os outros 11 são eliminados.
- **CA-35** Dado um jogador que sai dos limites da pista, então reaparece no último checkpoint sem ser eliminado.

### 5.5 Mapa 2 (RF-60 a RF-67)

- **CA-40** Dado um participante que cai na água, então é marcado como eliminado para todos e o contador de vivos diminui.
- **CA-41** Dados 8 participantes e 4 vagas, quando o 4º cai (restam 4), então a rodada termina e os 4 vivos se qualificam.
- **CA-42** Dados 6 vivos aos 180 s com 4 vagas, então qualificam-se os 4 com maior distância percorrida e os outros 2 são eliminados.
- **CA-43** Dados 5 vivos e 4 vagas, quando 2 caem no mesmo instante, então o último registrado a cair se qualifica junto com os 3 vivos.
- **CA-44** Dada a rodada em andamento, quando o tempo avança, então o raio da plataforma central aos 150 s é visivelmente menor que no início.
- **CA-45** Dados dois clientes observando a mesma plataforma flutuante, então ela está na mesma posição e no mesmo estado (emersa/submersa) em ambos.

### 5.6 Mapa 3 (RF-70 a RF-77)

- **CA-50** Dado um jogador em pé no caminho de um jato alto, quando o jato o alcança, então é empurrado; se estiver deslizando, passa por baixo sem ser empurrado.
- **CA-51** Dado um jato baixo se aproximando, quando o jogador pula no tempo certo, então não é empurrado.
- **CA-52** Dado um jogador que já alcançou o segundo anel, quando cai na água, então reaparece no checkpoint do segundo anel.
- **CA-53** Dado o primeiro jogador que pisa no pódio central, então é declarado vencedor para todos e a partida termina.
- **CA-54** Dado que ninguém chegou ao centro em 210 s, então vence o participante com menor distância ao centro naquele instante.
- **CA-55** Dados dois clientes, então os braços de jato estão no mesmo ângulo e com o mesmo padrão em ambos.

### 5.7 Bots e rede (RF-80 a RF-84)

- **CA-60** Dada uma partida com 1 humano e 15 bots, então os bots se movem, alguns se qualificam e outros são eliminados em cada fase, e a partida chega a um vencedor sem intervenção.
- **CA-61** Dados dois humanos na mesma fase, quando um se move, então o outro o vê se mover de forma contínua (sem saltos visíveis em rede local).
- **CA-62** Dado um cliente que informa ter cruzado a chegada, então só aparece como "Qualificado" depois da confirmação do servidor.

### 5.8 Não funcionais

- **CA-70** Dada a máquina de referência com 16 personagens na tela, então a taxa de quadros média é >= 30 fps (meta 60).
- **CA-71** Dado um repositório recém-clonado, quando os comandos de inicialização documentados são executados, então cliente e servidor sobem e outra máquina da rede consegue entrar na sala.
- **CA-72** Dada a suíte de testes do servidor, então há testes automatizados para: cálculo de vagas, término de fase por vagas e por tempo, desempate do Mapa 2 e vencedor do Mapa 3 por proximidade.

---

## 6. Riscos e pendências

### 6.1 Riscos

| ID | Risco | Impacto | Mitigação |
|---|---|---|---|
| R-01 | Movimento decidido pelo cliente permite trapaça (teleporte, velocidade) e afeta qualificação, desempate do Mapa 2 e vencedor do Mapa 3. | Alto se a PoC for exposta ao público | Aceito na PoC (RNF-09); uso restrito a demonstrações; registrar como dívida para o produto. |
| R-02 | A sensação do deslize (atrito, impulso, rampas) exige muito ajuste e é o centro da jogabilidade. | Alto | Parâmetros centralizados (RNF-14); validar o Mapa 1 cedo, antes dos demais. |
| R-03 | Elementos móveis (plataformas, jatos) fora de sincronia entre clientes geram quedas "injustas". | Médio | Movimento determinístico pelo relógio do servidor (RF-67, RF-75, RNF-05). |
| R-04 | Bots precisam navegar três mapas com mecânicas diferentes; bots fracos ou travados tiram o sentido do corte. | Médio | Bots guiados por rotas pré-definidas por mapa, com variação de erro; CA-60 como critério mínimo. |
| R-05 | Desempenho no navegador com 16 personagens animados, água e efeitos. | Médio | Modelos simples, medir cedo em máquina de referência (CA-70). |
| R-06 | Sem colisão entre jogadores, a experiência pode parecer menos "caótica" que o esperado para o gênero. | Médio (expectativa do cliente) | Explicitar ao cliente (PEN-04). |
| R-07 | Desempate do Mapa 2 por distância favorece correr em círculos e é impreciso sobre plataformas móveis. | Baixo | Aceito na PoC (AMB-19); reavaliar critério após playtest. |
| R-08 | Suporte a gamepad varia entre navegadores e modelos de controle. | Baixo | Testar com um controle padrão Xbox; demais modelos sem garantia. |
| R-09 | Originalidade: gênero muito associado a jogos conhecidos; risco de semelhança em nomes, personagens e fases. | Médio (jurídico) | RNF-12; revisão de nomes e visual antes de qualquer divulgação. |

### 6.2 Pendências para o cliente

| ID | Pendência | Padrão adotado enquanto não houver resposta |
|---|---|---|
| PEN-01 | Confirmar a interpretação das três fases: Mapa 2 sem linha de chegada e Mapa 3 como final com um único vencedor. | DT-04 e DT-05 |
| PEN-02 | Confirmar a regra de corte: metade arredondada para cima; desconexão conta como eliminação; corte pode ficar abaixo de 50% com número ímpar. | RF-33, RF-38 |
| PEN-03 | Confirmar os tempos: 180 s / 180 s / 210 s dentro da faixa de 3 a 4 minutos. | DT-03/04/05 |
| PEN-04 | Jogadores devem colidir e se empurrar? Exige mudar o modelo de rede e aumenta o esforço. | Sem colisão (AMB-14) |
| PEN-05 | Mergulho a partir do chão é desejado, ou o deslize só começa com pulo duplo? | Só no ar (RF-15) |
| PEN-06 | Console e dispositivos móveis são alvo do produto final? Afeta escolhas de tecnologia além da PoC. | Apenas navegador desktop |
| PEN-07 | O que "acessibilidade" significa em §1: facilidade de jogar ou recursos para pessoas com deficiência (daltonismo, remapeamento, etc.)? | Facilidade de jogar (RNF-08) |
| PEN-08 | O Pinguim deve ter alguma diferença de jogabilidade? O personagem é só visual? | Só visual (RF-10) |
| PEN-09 | Valores de jogabilidade em aberto: duração do acelerador, redução por obstáculo, reposição de infláveis, força do empurrão dos jatos. | Valores iniciais de RF-52 a RF-54, ajustados em playtest |
| PEN-10 | Critério de sucesso da PoC: quem avalia, com quantos jogadores humanos simultâneos e em que ambiente (rede local ou internet). | Demonstração em rede local com 2 a 4 humanos + bots |
| PEN-11 | Bots são aceitáveis na demonstração e devem ser identificados como tal para o jogador? | Sim, identificados no lobby (RF-06) |
| PEN-12 | Nível de arte e áudio esperado na PoC (modelos simples x arte próxima do final; com ou sem som). | Modelos simples, som opcional |
