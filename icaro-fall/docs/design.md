# Ícaro Fall — Design (direção de arte + UI/UX)

Documento de implementação. Tudo é procedural: primitivas Three.js, cores chapadas, animação por código, HUD em HTML/CSS.
Convenções: metros; `+Y` cima; frente do personagem = `+Z` local; posições `(x, y, z)` relativas ao ponto entre os pés; ângulos em graus; tempos em ms.

## 1. Pilares visuais e paleta

**Pilares**
1. **Parque aquático ao meio-dia** — céu limpo, água turquesa, plástico colorido, branco para respiro. Nada escuro, nada realista.
2. **Formas infláveis** — tudo arredondado e gordinho; cantos com raio; nenhuma aresta viva em objetos de jogo.
3. **Leitura em 1 segundo** — perigo, bônus e chão seguro se distinguem por **forma + padrão + cor**, nunca só por cor.
4. **Exagero elástico** — squash & stretch, estouros e respingos em toda interação.

**Render**: `MeshToonMaterial` com gradientMap de 3 tons gerado por `DataTexture` (0,55 / 0,8 / 1,0). Contorno por casco invertido (`BackSide`, escala 1,04, cor `--ink`) só em cabeça e tronco dos personagens. Luz: 1 direcional `#FFF4D6` intensidade 2,2, direção (−0,4, −1, −0,3), com sombra; hemisférica céu `#BFE9FF` / chão `#7FD8C8` intensidade 0,9. Névoa linear `#CDEFFF` de 120 m a 420 m.

### Tokens globais

| Token | Hex | Uso |
|---|---|---|
| `--sky-top` | `#2FA8F5` | topo do céu (gradiente vertical) |
| `--sky-horizon` | `#CDEFFF` | horizonte e névoa |
| `--cloud` | `#FFFFFF` | nuvens (grupos de 3–5 esferas, raio 3–8 m) |
| `--sun` | `#FFE066` | sol (esfera emissiva raio 12 m, bem distante) |
| `--water` | `#19C6D9` | superfície da água |
| `--water-deep` | `#0E86B8` | fundo/água distante, silhuetas submersas |
| `--foam` | `#EAFBFF` | espuma, respingos, bordas de água |
| `--sand` | `#FFE2A8` | ilhas e decks |
| `--ink` | `#1B2140` | texto, contornos, fundo de pílulas do HUD |
| `--paper` | `#FFFFFF` | painéis |
| `--paper-2` | `#F1F6FF` | linhas alternadas, campos |
| `--primary` | `#FFD23F` | botão principal (texto `--ink`, contraste ~11:1) |
| `--primary-press` | `#F2B705` | botão pressionado / sombra dura |
| `--accent` | `#FF5FA2` | destaques, logo |
| `--info` | `#1E63E9` | links, foco |
| `--success` | `#12804A` | "Qualificado" (texto branco, ~4,9:1) |
| `--danger` | `#D92D3A` | "Eliminado", perigo (texto branco, ~4,8:1) |
| `--warn` | `#FF8A1F` | telegrafia, cronômetro final |
| `--boost` | `#FFF200` | setas aceleradoras |

Superfície da água: plano com `MeshStandardMaterial` `--water`, opacidade 0,85, roughness 0,15; ondas por deslocamento de vértices (amplitude 0,12 m, comprimento 6 m, período 2,4 s).

### 16 cores de jogador

Cada slot tem **cor + símbolo**. O símbolo aparece no crachá sobre a cabeça, no placar e num disco nas costas do personagem (diâmetro 0,18 m, `CanvasTexture` desenhada por código, símbolo branco com contorno `--ink` de 3 px). Slots 1–8 usam símbolo cheio; 9–16 o mesmo conjunto vazado (só contorno).

| # | Nome | Hex | Símbolo | # | Nome | Hex | Símbolo |
|---|---|---|---|---|---|---|---|
| 1 | Vermelho | `#E53935` | círculo cheio | 9 | Marinho | `#1B2A6B` | círculo vazado |
| 2 | Laranja | `#FB8C00` | triângulo cheio | 10 | Roxo | `#7B3FE4` | triângulo vazado |
| 3 | Amarelo | `#FDD835` | quadrado cheio | 11 | Magenta | `#D81B9A` | quadrado vazado |
| 4 | Lima | `#A4D233` | estrela cheia | 12 | Rosa | `#FF8FC0` | estrela vazada |
| 5 | Verde | `#2E9E44` | losango cheio | 13 | Marrom | `#8D5A3B` | losango vazado |
| 6 | Menta | `#1DD3B0` | coração cheio | 14 | Branco | `#F5F5F5` | coração vazado |
| 7 | Azul-céu | `#3FA9F5` | gota cheia | 15 | Grafite | `#4A4F5A` | gota vazada |
| 8 | Azul | `#1E63E9` | raio cheio | 16 | Vinho | `#8E1B3A` | raio vazado |

Regras: o jogador local tem sempre um marcador extra (seta branca ▼ de 0,25 m flutuando 0,35 m acima do crachá). Nenhum elemento de cenário usa as cores 1–16 saturadas em objetos menores que 2 m.

## 2. Personagem Ícaro

Garoto estilizado de parque aquático com asinhas de pena amarradas ao colete. Altura 1,60 m; cabeça = 36% da altura. Colisão: cápsula raio 0,40, altura total 1,60.

Cores fixas: pele `#F2B48A`, cabelo `#C9792B`, faixa/cera `#FFC83D`, penas `#FFF8E7`, chinelo `#FF7A1A`, olhos `--ink`, bochecha `#FF9C8A`.
**Cor do jogador**: colete (100%) e short (cor do jogador com luminosidade ×0,7).

| Parte | Primitiva | Dimensões | Posição (x, y, z) | Cor |
|---|---|---|---|---|
| Chinelos ×2 | esfera escala (1, 0,5, 1,6) | raio 0,09 | (±0,12, 0,05, 0,03) | chinelo |
| Pernas ×2 | cápsula | raio 0,075, comprimento 0,28 | pivô no quadril (±0,12, 0,50, 0); centro y 0,29 | pele |
| Short | cilindro | raio topo 0,20, base 0,22, altura 0,22 | (0, 0,52, 0) | jogador ×0,7 |
| Tronco | cápsula | raio 0,18, comprimento 0,20 | (0, 0,80, 0) | pele |
| Colete | cilindro (cantos chanfrados) | raio 0,215, altura 0,30 | (0, 0,82, 0) | **jogador** |
| Fivela do colete | caixa | 0,06 × 0,05 × 0,02 | (0, 0,82, 0,215) | `#FFFFFF` |
| Disco de símbolo | círculo | raio 0,09 | (0, 0,84, −0,22), virado para −Z | símbolo |
| Braços ×2 | cápsula | raio 0,06, comprimento 0,24 | pivô no ombro (±0,26, 0,96, 0); pende para baixo | pele |
| Mãos ×2 | esfera | raio 0,075 | ponta do braço (filha do braço, y −0,34) | pele |
| Cabeça | esfera | raio 0,29 | (0, 1,28, 0) | pele |
| Cabelo | hemisfério (`thetaLength` 100°) | raio 0,305 | (0, 1,30, −0,01), inclinado −15° em X | cabelo |
| Cachos ×3 | esfera | raio 0,09 | (−0,13 / 0 / +0,13, 1,52, 0,17) | cabelo |
| Faixa de louro | toro | raio 0,295, tubo 0,022 | (0, 1,38, 0), inclinado −10° em X | faixa |
| Olhos ×2 | esfera escala (1, 1,3, 0,5) | raio 0,045 | (±0,10, 1,29, 0,265) | `--ink` |
| Brilho dos olhos ×2 | esfera | raio 0,014 | (±0,085, 1,31, 0,29) | `#FFFFFF` |
| Bochechas ×2 | círculo | raio 0,04 | (±0,18, 1,22, 0,23), acompanha a curvatura | bochecha |
| Boca | toro, arco 180° | raio 0,04, tubo 0,01 | (0, 1,19, 0,28), arco para baixo | `--ink` |
| Asas ×2 (grupo) | 3 penas por asa | pivô (±0,10, 1,00, −0,21) | abertas 25° em repouso | — |
| Pena | esfera escala (0,25, 1, 0,5) | raio 0,13; penas em leque a 0°, 25°, 50° | filha da asa, aponta para fora/cima | penas |
| Cera da asa | esfera | raio 0,05 | no pivô de cada asa | faixa |

Envergadura total das asas: 0,70 m (não ultrapassam a cápsula). Olhos piscam: escala Y 1→0,1→1 em 120 ms a cada 3–5 s (aleatório).

## 3. Personagem Pinguim

Pinguim rechonchudo de óculos de natação e boias de braço. Altura 1,50 m; mesma cápsula (raio 0,40, altura 1,60).

Cores fixas: barriga/máscara `#FFFFFF`, bico e pés `#FF9A1F`, olhos `--ink`, óculos: aro `#FFFFFF`, lente `#7FE3FF`, tira `--ink`; boias de braço `#FFD23F`.
**Cor do jogador**: dorso do corpo, cabeça e nadadeiras (visto de trás, é a silhueta inteira). Barriga branca garante leitura mesmo nas cores escuras.

| Parte | Primitiva | Dimensões | Posição (x, y, z) | Cor |
|---|---|---|---|---|
| Pés ×2 | esfera escala (1,2, 0,4, 1,7) | raio 0,10 | (±0,14, 0,04, 0,08) | bico |
| Corpo | esfera escala (1, 1,45, 0,95) | raio 0,38 | (0, 0,60, 0) | **jogador** |
| Barriga | esfera escala (1, 1,45, 0,6) | raio 0,31 | (0, 0,58, 0,15) | branco |
| Disco de símbolo | círculo | raio 0,09 | (0, 0,75, −0,36), virado para −Z | símbolo |
| Cabeça | esfera | raio 0,30 | (0, 1,20, 0) | **jogador** |
| Máscara do rosto | esfera escala (1, 0,9, 0,5) | raio 0,24 | (0, 1,17, 0,15) | branco |
| Bico | cone, eixo em +Z | raio 0,085, altura 0,17 | (0, 1,14, 0,33) | bico |
| Olhos ×2 | esfera escala (1, 1,3, 0,5) | raio 0,04 | (±0,10, 1,24, 0,255) | `--ink` |
| Óculos ×2 (na testa) | toro + círculo interno | raio 0,065, tubo 0,018 | (±0,09, 1,40, 0,20), inclinados −35° em X | aro / lente |
| Tira dos óculos | toro | raio 0,30, tubo 0,015 | (0, 1,38, 0), inclinada −20° em X | `--ink` |
| Nadadeiras ×2 | esfera escala (0,25, 1, 0,55) | raio 0,26 | pivô no ombro (±0,36, 0,92, 0); pende para baixo, aberta 15° | **jogador** |
| Boias de braço ×2 | toro | raio 0,075, tubo 0,04 | filha da nadadeira, y −0,12 | boia |
| Rabinho | cone | raio 0,07, altura 0,12 | (0, 0,18, −0,34), aponta −Z e 30° para cima | **jogador** |

Pinguim não tem pernas: o andar é um bamboleio (ver seção 4).

## 4. Poses e animações

Rig: grupo `root` (pés) → `body` (pivô em y 0,80, centro da cápsula) → partes. Membros giram em X no pivô; **positivo = para frente**. Transição entre estados: interpolar ângulos em 100 ms (ease-out), salvo indicação.

| Estado | Ícaro | Pinguim | Tempos |
|---|---|---|---|
| **Idle** | respiração: escala Y do tronco 1,00↔1,03; braços abertos 8° (Z); cabeça inclina ±3° (Z); asas 25°↔30° | corpo balança ±2° (Z); nadadeiras 15°↔22° | ciclo 2400 ms, senoidal |
| **Andar/correr** | pernas ±40°; braços ±50° em fase oposta; `body` inclina 8° para frente; sobe/desce 0,04 m (2× por ciclo); cabeça compensa −4° | bamboleio: `body` rola ±12° (Z) e gira ±6° (Y); pés alternam 0,06 m para cima; nadadeiras abertas 35° balançando ±15°; inclina 6° | ciclo 420 ms na velocidade máxima; duração = 420 × (vmáx / v), teto 800 ms |
| **Pulo — saída** | estica: escala `body` (0,90, 1,15, 0,90) | igual | 120 ms, volta em 150 ms |
| **Pulo — no ar** | braços 150° (para cima); pernas +30° / −20°; asas abrem 60° e batem ±15° | nadadeiras abertas 80° batendo ±20°; pés para trás 20° | bater a cada 180 ms |
| **Pulo — pouso** | achata: escala (1,15, 0,80, 1,15) + poeira/respingo | igual | 100 ms, volta em 150 ms |
| **Mergulho** | `body` gira +90° em X (horizontal, cabeça à frente); braços 170° (estendidos à frente, juntos); pernas 0° retas; asas abertas 70° fixas | `body` +90°; nadadeiras coladas para trás −10°; bico aponta à frente; pés juntos | entra em 120 ms (ease-out); estica (0,92, 1,12, 0,92) nos primeiros 150 ms |
| **Deslize de barriga** | `body` a +90°, centro rebaixado para y 0,25; braços 170° à frente; pernas batem ±10°; rola ±4° (Z) | `body` a +90°, y 0,28; nadadeiras para trás −10° abertas 20°; pés batem ±15° | batida 160 ms; rolagem 600 ms |
| **Atingido/tonto** | recua: `body` −25° em X por 200 ms, depois cabeça balança ±12° (Z); braços caídos −10°; 3 estrelas `#FFD23F` (octaedro raio 0,06) orbitam a cabeça a raio 0,35, y +0,15 acima do topo | igual; nadadeiras caídas | total 800 ms; balanço 330 ms; órbita 1 volta / 800 ms |
| **Comemoração** | pulinhos de 0,30 m; braços 160° acenando ±15°; giro de 360° (Y) a cada 2º pulo; asas batendo | pulinhos de 0,25 m; nadadeiras 120° batendo ±25°; giro igual | pulo a cada 500 ms; aceno 250 ms; em loop |
| **Eliminado** | braços e pernas debatem ±60°; ao tocar a água: respingo grande, afunda 0,6 m e escala →0; some com "puf" (8 esferas `--foam`) | nadadeiras debatem ±70°; resto igual | debater 80 ms por batida; afundar 300 ms (ease-in) |

Altura visual no mergulho/deslize: ≤ 0,80 m (importante para os jatos altos do Mapa 3).

## 5. Direção de arte por mapa

Cenário comum: mar `--water` até o horizonte, 6–10 nuvens, 3–5 ilhotas (`--sand`, esfera achatada raio 8–15 m) com palmeiras (tronco: cilindro `#B9814F` raio 0,25, altura 5 m, inclinado 8°; copa: 6 cones achatados `#3FBF6B`, comprimento 2,5 m, em estrela caídos 30°).

### Mapa 1 — "Tobogã Radical"

- **Pista**: meia-cana de 700 m, largura útil 10 m, seção em arco de raio 8 m (bordas 1,7 m acima do centro) + lábio arredondado (tubo raio 0,25, `#FFFFFF`). Curvas em S com raio ≥ 35 m; queda total ~110 m.
- **Cor por setor** (orientação): 0–230 m `#FFD23F`; 230–470 m `#FF7E5F`; 470–700 m `#9B6BFF`. Faixa branca transversal de 1 m a cada 20 m.
- **Lâmina d'água**: faixa central de 4 m, `#BDF2FF` opacidade 0,45, com riscos brancos (0,15 × 1,5 m) correndo ladeira abaixo a 12 m/s.
- **Suportes**: pilares cilíndricos `#FFFFFF` raio 0,6 a cada 25 m, com anel `#FF5FA2` (toro) 1 m abaixo da pista, descendo até o mar.
- **Largada**: deck 14 × 8 m `--sand` com borda `#FFFFFF`; linha quadriculada `--ink`/branco (casas de 0,5 m, 1 m de profundidade); arco de 2 pilares `#FF5FA2` (raio 0,4, altura 5 m) + travessa (caixa 12 × 1,2 × 0,4) `--ink` com o nome da fase (CanvasTexture); barreira de largada: cilindro horizontal `#FFFFFF` listrado, some no "JÁ!".
- **Setas aceleradoras** (+50% velocidade): tapete 3 × 4 m rente ao chão (y +0,02), base `#FF8A1F`, 3 chevrons `--boost` emissivos (intensidade 1,5) apontando para a descida, rolando 1 chevron a cada 300 ms. Dois postes baixos (cone 0,4 m `--boost`) nas laterais para leitura à distância.
- **Boias-animal** (~1,2 m, material com brilho: roughness 0,25; balançam ±5° e flutuam ±0,05 m, ciclo 1600 ms; estouram ao contato — ver seção 6):
  - **Pato**: corpo esfera raio 0,50 escala (1, 0,8, 1,2) `#FFD23F`; cabeça esfera raio 0,28 em (0, 0,75, 0,35); bico cone achatado `#FF8A1F` raio 0,10 altura 0,18; asas: 2 esferas escala (0,3, 0,6, 1) raio 0,25 nas laterais; rabo cone raio 0,12 para cima; olhos `--ink` raio 0,04.
  - **Polvo**: cabeça esfera raio 0,50 escala (1, 1,1, 1) `#B26BFF` em y 0,65; 8 tentáculos: cápsulas raio 0,09 comprimento 0,35, em círculo de raio 0,40, abertas 35° para fora, ponta com esfera `#E2C6FF` raio 0,07; olhos brancos raio 0,10 com pupila `--ink` raio 0,05; bochechas `#FF8FC0`.
  - **Baiacu**: esfera raio 0,58 `#3FD6C2` em y 0,60, barriga (metade inferior) `#FFF3B0`; 14 espinhos: cones raio 0,06 altura 0,16 `#FFFFFF` distribuídos na metade superior; nadadeiras laterais e cauda: cones achatados `#FF8A1F`; boca: toro raio 0,06 `#FF5FA2`; olhos grandes brancos raio 0,11.
- **Chegada**: pórtico de 12 m de largura × 6 m de altura (pilares infláveis `#FFD23F` raio 0,6; faixa quadriculada no topo; 2 bandeirolas triangulares por pilar tremulando ±20°, 400 ms). Atrás, piscina 20 × 14 m, borda `#FFFFFF` de 1 m, água `--water` mais clara (`#5FE0EA`), profundidade visual 1 m. Confete ao cruzar.

### Mapa 2 — "Arena de Sobrevivência"

- **Plataforma central**: cilindro raio 14 m, altura 1,2 m (0,6 acima da água). Topo em 4 anéis concêntricos alternando `#FFF3D6` e `#FFE2A8` (raios 14 / 10,5 / 7 / 3,5) e estrela `#FF5FA2` de 2 m no centro. Lateral listrada vermelho `#E53935` / branco (12 gomos), como boia salva-vidas.
- **Encolhimento**: a faixa que vai sumir (1,5 m de borda) é marcada 3 s antes com listras diagonais `--danger`/branco (45°, 0,5 m) piscando a 2 Hz → 4 Hz no último segundo, mais bolhas na borda. Depois afunda 1,5 m em 600 ms e desaparece. Raio mínimo sugerido: 4 m.
- **Plataformas flutuantes** (~12): discos raio 2,0–3,5 m, altura 0,5 m (0,25 acima da água). Topo em 3 variações: `#7BE06A` (vitória-régia, com um corte em "V" de 20°), `#FF8FC0`, `#FFFFFF`; lateral `#FFFFFF` com toro `#1E63E9` na base (tubo 0,15). Padrão do topo: espiral branca de 0,2 m de traço (ajuda a ler rotação).
- **Movimento**: orbitam o centro em 2 trilhas (raios 20 m e 27 m) a 3–6°/s, sentidos opostos; balançam ±6° (pitch/roll), ciclo 2–3 s; inclinam mais 4° para o lado de quem pisa.
- **Telegrafia de submersão** (1500 ms antes): (1) anel branco no topo encolhe da borda ao centro em 1500 ms — sinal de forma, independente de cor; (2) topo pisca para `--warn` a 3 Hz → 6 Hz nos últimos 500 ms; (3) tremor ±2° a 12 Hz; (4) bolhas `--foam` subindo ao redor. Submersa: 0,8 m abaixo da superfície, visível como silhueta `--water-deep` por 2–4 s. **Retorno**: 1000 ms de bolhas no local, sobe em 400 ms com respingo em anel.
- **Ambiente**: 8 boias de sinalização (esfera raio 0,6 `#FF8A1F` + cilindro branco) num círculo de raio 40 m; arquibancada inflável ao fundo (caixas arredondadas em degraus, `#FF5FA2`/`#FFD23F`).

### Mapa 3 — "Labirinto de Jatos"

- **Planta (raios a partir do centro)**: torre 0–1,2 · pódio 1,2–5 · canal A 5–8 · anel interno 8–13 · canal B 13–16 · anel médio 16–21 · canal C 21–24 · anel externo (largada) 24–30.
- **Anéis**: altura 0,6 m acima da água; topo `#FFF3D6` com borda de 0,4 m — externo `#3FA9F5`, médio `#FFD23F`, interno `#FF7E5F` (progresso = cor mais quente). Lateral branca. Muretas do labirinto (se houver): caixas arredondadas altura 1,2 m, espessura 0,5 m, `#FFFFFF` com topo na cor do anel.
- **Grades de passagem**: plataformas 2,5 × 2,5 m sobre os canais, niveladas com os anéis. Moldura `#FFFFFF` (caixas de 0,2 m) + 6 barras por direção (caixas 0,08 m) `#8FA3B8` metálico (metalness 0,6); água visível por baixo. Em cada ponta, seta no chão do anel (chevron `--ink` de 1 m) apontando para a grade. Sugestão: 4 grades no canal C, 3 no B, 2 no A, desalinhadas entre si.
- **Pódio central**: raio 5 m, 1,0 m acima da água (rampa/degrau de 0,4 m), piso quadriculado `--ink`/branco (casas de 1 m) com borda `--primary`. Arco de chegada pequeno sobre a grade do canal A.
- **Torre**: cilindro raio 1,2 m, altura 7 m, listras horizontais `#FFFFFF`/`#1E63E9` de 1 m; topo com esfera `#FFD23F` raio 1,5 e chafariz de partículas. Cubo giratório em y 0,5–2,0 com os braços.
- **Braços de jato**: tubo `#8FA3B8` raio 0,15 saindo da torre até 2 m; dali em diante o jato vai até o raio 30 m.
  - **Jato baixo (pular)**: centro em y 0,45 acima do piso, diâmetro 0,5. Cor `#4FE3FF`. Bocal marcado com **▲**. Projeta no chão uma **linha contínua** `#4FE3FF` de 0,3 m de largura.
  - **Jato alto (passar por baixo mergulhando/deslizando)**: centro em y 1,45, diâmetro 0,6 (base a 1,15 m). Cor `#FF8A1F`. Bocal marcado com **▼**. Projeta no chão uma **linha tracejada** `#FF8A1F` (traço 1 m, vão 1 m).
  - Se o game design quiser que o jato alto apenas puna quem pula (dá para passar andando), subir o centro para y 2,2 — o visual não muda.
- **Como desenhar o jato**: (1) núcleo: cilindro na cor do jato, opacidade 0,55, sem escrita de profundidade, emissivo 0,4; (2) casca: cilindro 1,5× o diâmetro, opacidade 0,18, com riscos brancos correndo para fora a 20 m/s (CanvasTexture gerada por código, UV animado); (3) partículas: 40 gotas/s por 10 m de jato (esferas raio 0,05–0,09 `--foam`), nascem no eixo, saem com 2 m/s radial + gravidade, vida 400 ms; (4) impacto na ponta e contra muretas: leque de 12 gotas a cada 100 ms. O jato pulsa ±8% de diâmetro a 5 Hz.
- **Rotação sugerida**: 2 braços baixos + 2 altos alternados a 90°, 20–30°/s; segundo conjunto opcional em sentido contrário cobrindo só até o raio 16.

## 6. Efeitos e game feel

Partículas: `InstancedMesh` de esferas/quads com cor chapada; pool máximo de 600 instâncias; gravidade −18 m/s².

| Efeito | Gatilho | Especificação |
|---|---|---|
| Respingo pequeno | pouso em piso molhado, passos na lâmina d'água | 8 gotas `--foam` raio 0,05, velocidade 2–3 m/s em cone de 60°, vida 350 ms |
| Respingo grande | queda na água, eliminação | 28 gotas raio 0,06–0,12, 4–7 m/s em cone de 40° para cima, vida 700 ms + anel (toro achatado `--foam`) que cresce de 0,4 a 2,5 m e some em 500 ms |
| Estouro de boia | contato com boia-animal | boia escala 1→1,25 em 60 ms, some; 16 retalhos (quads 0,15 m na cor da boia) a 5–8 m/s, giro aleatório, vida 600 ms; estrela branca de 8 pontas de 1,2 m por 80 ms; texto "POP!" opcional; shake leve; hit-stop de 50 ms só para quem bateu |
| Rastro de deslize | deslizando no chão | 2 fitas `--foam` (largura 0,15 m, afastadas 0,3 m), opacidade 0,7→0 em 500 ms + 1 gota a cada 40 ms |
| Linhas de velocidade | boost ativo | 3D: 12 riscos brancos (0,03 × 1,5 m) ao redor do jogador, contra o movimento, vida 200 ms. Tela: vinheta radial de riscos brancos, opacidade 0,35, entra em 100 ms e sai em 300 ms. FOV +12° |
| Boost (pisar na seta) | contato com a seta | flash `--boost` no personagem (emissivo 1→0 em 250 ms), anel no chão de 1→3 m em 300 ms, shake leve |
| Golpe de jato | atingido por jato | 20 gotas na cor do jato, shake médio, estado "tonto" |
| Poeira de pouso | pouso em piso seco | 6 esferas `#FFFFFF` raio 0,08→0,2, opacidade 0,6→0 em 300 ms |
| Confete | qualificar / vencer | 60 quads 0,1 m nas cores 1–8, queda a 1,5 m/s com oscilação, 2 s |
| Pulo duplo | 2º pulo no ar | anel branco de 0,3→1,0 m sob os pés em 200 ms + 6 penas (Ícaro) ou 6 gotas (Pinguim) |

**Shake de câmera** (deslocamento aleatório com decaimento exponencial): leve 0,05 m / 150 ms; médio 0,12 m / 250 ms; forte 0,25 m / 400 ms (só eliminação própria e encolhimento da arena). Nunca acumular acima de 0,3 m.

## 7. Câmera

- **Padrão**: terceira pessoa em órbita. Distância 6,5 m; alvo 1,2 m acima dos pés; inclinação 18° para baixo (câmera ~3,2 m acima dos pés); FOV vertical 60°; near 0,1, far 600.
- **Controle**: mouse (pointer lock) — yaw livre, pitch de −10° a +55°; sensibilidade padrão 0,15°/px. Gamepad: analógico direito a 140°/s.
- **Seguimento**: posição com amortecimento de 120 ms; rotação com 80 ms. Sem input de câmera por 1,5 s e jogador em movimento: realinha atrás do jogador a 60°/s.
- **Deslize/mergulho**: distância 5,0 m, altura do alvo 0,7 m, inclinação 12°, FOV 68° (transição de 250 ms). No Tobogã, o yaw segue a tangente da pista com amortecimento de 300 ms.
- **Boost**: FOV 72°, distância +0,5 m, por toda a duração; volta em 400 ms.
- **Colisão**: esfera de 0,3 m lançada do alvo até a câmera; aproxima em 50 ms, afasta em 300 ms. A menos de 1,2 m, o personagem local fica com opacidade 0,35.
- **Espectador** (após eliminar/qualificar): segue outro jogador ativo; troca com clique / A. Arena: opção de câmera alta fixa (altura 30 m, inclinação 55°).
- **Lobby**: câmera fixa a 3,5 m do personagem, altura 1,2 m, FOV 40°; personagem gira 20°/s.

## 8. UI e HUD (HTML/CSS)

### Tipografia

- Display: **"Baloo 2"** (Google Fonts, pesos 600/800) → fallback `"Trebuchet MS", "Segoe UI", system-ui, sans-serif`.
- Texto: **"Nunito"** (600/800) → fallback `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Números (cronômetro, placar): Baloo 2 com `font-variant-numeric: tabular-nums`.

| Token | Tamanho / altura de linha | Uso |
|---|---|---|
| `--fs-hero` | `clamp(56px, 10vw, 128px)` / 1,0 | logo, contagem, "Qualificado!" |
| `--fs-h1` | 40px / 1,1 | títulos de tela |
| `--fs-h2` | 28px / 1,2 | nome da fase, subtítulos |
| `--fs-hud` | 24px / 1,0 | cronômetro, contadores |
| `--fs-body` | 18px / 1,4 | texto, botões, campos |
| `--fs-small` | 14px / 1,3 | dicas, crachás (mínimo absoluto) |

### Tokens de layout

- Espaços: `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 24 · `--sp-6` 32 · `--sp-7` 48 px.
- Raios: `--r-sm` 8 · `--r-md` 16 · `--r-lg` 24 · `--r-pill` 999 px.
- Sombras: `--sh-hard` `0 6px 0 var(--primary-press)` (botões; ao pressionar, translateY 4px e sombra 2px) · `--sh-panel` `0 8px 0 rgba(27,33,64,.25)` · `--sh-hud` `0 2px 8px rgba(27,33,64,.35)`.
- Pílula de HUD: fundo `rgba(27,33,64,.82)`, texto branco, padding 8×16, raio pill.
- Texto hero: branco, contorno `--ink` (`-webkit-text-stroke: 6px` + `paint-order: stroke fill`) e sombra `0 6px 0 var(--ink)`.
- Painel: fundo `--paper`, borda 4px `--ink`, raio `--r-lg`, padding `--sp-6`, largura máx. 560 px (placar: 720 px).
- Movimento: entradas 200 ms `cubic-bezier(.2,1.4,.4,1)` (leve overshoot); saídas 150 ms ease-in. Foco: contorno 3px `--info` + offset 2px, sempre visível.

### Fluxo de telas e microcopy (PT-BR)

1. **Título / lobby** — cena 3D ao fundo com o personagem escolhido.
   - Logo: **ÍCARO FALL** · subtítulo: "Corra, mergulhe e não caia na água!"
   - Campo: rótulo "Seu nome", placeholder "Digite seu apelido" (máx. 14 caracteres). Erro: "Escolha um nome com 2 a 14 caracteres."
   - Escolha de personagem: 2 cartões (160 × 200 px) — "Ícaro" / "Pinguim"; o selecionado ganha borda 4px `--info`, selo ✓ e texto "Selecionado".
   - Cor: "Sua cor" com chip + símbolo (atribuída automaticamente).
   - Botão principal: "Entrar na partida" → depois de entrar: "Estou pronto!" / "Cancelar pronto".
   - Lista: "Jogadores na sala (X/16)"; estados "Pronto" (✓) e "Aguardando…".
   - Status: "Aguardando mais jogadores…" · "A partida começa em N s" · "Conectando…" · "Sala cheia. Tente de novo em instantes." · "Conexão perdida. Reconectando…" · botão "Tentar de novo".
   - Link: "Como jogar" (abre o painel de controles abaixo).
2. **Apresentação da fase** (2,5 s) — faixa central: "Fase N de 3" + nome ("Tobogã Radical" / "Arena de Sobrevivência" / "Labirinto de Jatos") + objetivo:
   - Tobogã: "Desça até a piscina! Os primeiros N se classificam."
   - Arena: "Fique fora da água! Os últimos N de pé se classificam."
   - Labirinto: "Chegue ao pódio central! O primeiro a chegar vence."
3. **Contagem** — "3", "2", "1", "JÁ!" em `--fs-hero`, um por segundo; cada número entra com escala 1,6→1 em 250 ms; "JÁ!" em `--primary` e some em 600 ms.
4. **Jogo** — HUD (abaixo).
5. **Resultado individual** — faixa de largura total, 120 px de altura, no terço superior:
   - "QUALIFICADO!" (fundo `--success`, ícone ✓) + "Você ficou em Nº lugar".
   - "ELIMINADO" (fundo `--danger`, ícone ✕) + "Não foi dessa vez!".
   - Em seguida: "Assistindo a NOME" + dica "Clique para trocar de jogador".
   - Fim da rodada para todos: "Fim da rodada!" · tempo esgotado: "Tempo esgotado!".
6. **Placar da rodada** — título "Resultado — NOME DA FASE"; colunas "Posição", "Jogador", "Tempo", "Situação"; situação = "Qualificado" (✓ `--success`) ou "Eliminado" (✕ `--danger`); a linha do jogador local tem fundo `--paper-2`, borda 3px `--info` e selo "Você". Rodapé: "Próxima fase em N s".
7. **Próxima fase** — volta ao passo 2. Para eliminados: "Você está assistindo. Torça pelos seus amigos!".
8. **Vencedor** — "NOME VENCEU!" em hero, personagem em comemoração num pódio, confete; subtítulo "Campeão do Ícaro Fall" (se for o jogador local: "VOCÊ VENCEU!"); pódio com "2º lugar" e "3º lugar"; botões "Jogar de novo" (principal) e "Voltar ao início".

### HUD em jogo

Margem segura: 16 px (24 px ≥ 1280 px de largura) + `env(safe-area-inset-*)`.

| Posição | Elemento | Conteúdo |
|---|---|---|
| Topo-esquerda | pílula | "Fase N/3 · NOME DA FASE" (`--fs-small` + `--fs-body` 800) |
| Topo-centro | cronômetro | ícone de relógio + "M:SS" em `--fs-hud`; nos últimos 10 s: fundo `--warn`, texto `--ink`, pulso de escala 1→1,08 a cada 1 s |
| Topo-direita | contador | corrida: "Qualificados X/Y" · sobrevivência: "Vivos X" (ícone de pessoa); muda com "pop" de 150 ms |
| Topo-direita, abaixo | feed (máx. 3 linhas, 3 s cada) | "NOME se classificou!" · "NOME caiu na água!" |
| Centro | avisos transitórios (1,5 s) | "A arena vai encolher!" · "Acelera!" (boost) · "Último lugar classificável!" |
| Base-esquerda | dica de controles | visível nos primeiros 8 s de cada fase e ao segurar Tab / Select; depois recolhe para "Tab: controles" |
| Base-centro | barra de progresso (só Tobogã) | trilha de 240 × 8 px com marcador do jogador (símbolo) e bandeira no fim |

**Painel de controles** (texto final):
- Teclado e mouse: "WASD ou setas — mover" · "Espaço — pular" · "Espaço no ar — pulo duplo com mergulho" · "Shift ou E — mergulhar" · "Mouse — girar a câmera".
- Controle: "Analógico esquerdo — mover" · "A — pular" · "B ou X — mergulhar" · "Analógico direito — câmera".
- Teclas desenhadas como `<kbd>`: fundo branco, borda 2px `--ink`, raio 8 px, sombra `0 3px 0 var(--ink)`, mínimo 28 × 28 px. Mostrar o conjunto do último dispositivo usado.
- Primeiro clique no canvas: "Clique para jogar" (captura o mouse) · "Esc — soltar o mouse".

**Nomes sobre a cabeça**: elemento HTML projetado a 0,35 m acima do topo do personagem. Pílula `rgba(27,33,64,.82)`, texto branco 14 px peso 800, precedido de chip 14 × 14 px na cor do jogador com o símbolo em branco e borda branca de 2 px. Opacidade 1 até 25 m, cai linearmente até 0 em 45 m; escala mínima 0,8. Jogador local: texto "Você" + seta ▼. Eliminado/qualificado: crachá oculto.

### Responsividade

- Layout fluido em `rem`/`clamp`; alvo principal 1280 × 720 a 1920 × 1080.
- **< 900 px de largura**: pílulas do HUD em `--fs-body`; feed reduzido a 1 linha; dica de controles só no painel "Como jogar"; placar sem a coluna "Tempo".
- **< 600 px ou altura < 500 px**: painéis ocupam 100% da largura menos 16 px; cartões de personagem lado a lado em 50%; logo no mínimo do clamp. PoC é teclado/controle: em tela de toque sem controle, mostrar "Conecte um teclado ou controle para jogar.".
- Canvas sempre 100vw × 100vh; `devicePixelRatio` limitado a 2.

### Acessibilidade

- Contraste: texto ≥ 4,5:1 (texto grande ≥ 3:1). Texto nunca vai direto sobre a cena 3D: sempre em pílula/painel ou com contorno `--ink` ≥ 4 px.
- Nunca só cor: jogadores = cor + símbolo; qualificado/eliminado = cor + ✓/✕ + texto; jatos = cor + ▲/▼ + linha contínua/tracejada; submersão = anel que encolhe + tremor; boost = chevrons animados.
- Tamanhos mínimos: texto 14 px; alvos clicáveis 44 × 44 px; espaçamento entre alvos ≥ 8 px.
- Teclado: todos os menus navegáveis por Tab/Enter/Esc e por D-pad/A/B; foco inicial no campo de nome; foco sempre visível.
- Semântica: botões `<button>`, campo com `<label>`; `aria-live="polite"` para feed e status do lobby; `aria-live="assertive"` para "Qualificado!"/"Eliminado"; cronômetro com `role="timer"` e sem anúncio a cada segundo.
- `prefers-reduced-motion: reduce`: sem shake de câmera, sem linhas de velocidade na tela, sem variação de FOV, sem pulso/overshoot na UI (apenas fades de 150 ms), confete reduzido a 12 peças, piscadas de telegrafia limitadas a 2 Hz (o anel que encolhe permanece). Oferecer o mesmo como opção "Reduzir movimento" no lobby.
- Nenhum efeito pisca acima de 3 Hz em área maior que 25% da tela (a telegrafia de 6 Hz fica restrita ao topo de uma plataforma).
- Idioma: `<html lang="pt-BR">`; nomes de jogadores exibidos sem transformação para maiúsculas no placar.
