# Autocrítica: iterações e notas (0–10)

Capturas de cada ronda em `_build/shots/` (m1/d1 = ronda 1; r1–r3 = ronda 2; r4–r6 = ronda 3; finais em `../`).

| Área | R1 | R2 | R3 | Final (R4) |
|---|---|---|---|---|
| Identidade | 7 | 8,5 | 9 | 9 |
| Hierarquia | 7 | 8 | 9 | 9 |
| Tipografia | 8 | 8,5 | 9 | 9 |
| Cor | 6 | 8 | 9 | 9 |
| Ritmo | 7 | 8 | 9 | 9 |
| Cena 3D | 6 | 8 | 8,5 | 9 |
| Régua | 5 | 7,5 | 9 | 9 |
| Mobile | 6 | 7,5 | 8,5 | 9 |
| Coerência com o spot | 8 | 9 | 9,5 | 9,5 |

## Ronda 1 (m1, m1s, d1)
- Mar quase preto ao largo e a imagem de batimetria cortada por um tile do terreno (MapLibre não desenha bem `image` sobre terreno) → passou a zonas de profundidade vectoriais (5 níveis, ETOPO via terrarium).
- Enquadramento mostrava sobretudo a Galiza; borda dos dados visível no desktop → câmara refeita, dados alargados com anel z6.
- Régua: números a apertar, «fim de tarde» a partir, escape CSS errado («□gora») → números retirados (a cor chega), agulha de «agora» na barra.
- Erro de consola (anel da rosa como LinearRing) → LineString.

## Ronda 2 (r1–r3)
- Rótulos dos três melhores em cima dos troços de mar; «OCEANO ATLÂNTICO» cortado → coluna de rótulos no mar, com guias; topónimos presos aos limites.
- À noite, frase com dois «:» → a frase nacional passou a ter «corpo», e a noite diz «Noite na costa. Amanhã de manhã, kite muito bom em Moledo e em Viana…».
- Footer a cortar a coluna esquerda no desktop → Mar Largo + navegação no fim da coluna, nota curta.

## Ronda 3 (r4–r6)
- «10» a colidir com o nome nas linhas (dois dígitos) → coluna e corpo próprios.
- No escuro, rótulos do mapa com a cor de ecrã escuro sobre um mapa claro → o mapa usa sempre as cores de carta.
- Sem WebGL, o aviso tapava Viana → passou para a legenda.
- Surf ao fim da tarde dava «Bom das 19h ao pôr do sol» (3 minutos) → fora do bloco actual só contam horas com o sol ≥ 2° (uma hora de crepúsculo não é sessão).

## Ronda 4 (final)
- Rótulos cortados à esquerda no telemóvel («UINCHO») → mede-se a largura e, se não couber no mar, o rótulo vai para terra, à direita do ponto (como a toponímia dos portulanos).
- Rótulos da costa sul (Martinhal, Meia Praia) com a guia a cruzar o texto → ancorados abaixo e à direita.
- O Tejo e o Sado apareciam pintados como mar de spot → estuários retirados dos troços.
- Teste de interacção (`interaccao.js`): 10 estados (2 desportos × 5 blocos), 0 erros de consola, 0 NaN, sem overflow a 390 px; em todos, o 1.º da lista = melhor da régua = rótulos do mapa.

## O que ainda não é 10
- Cena 3D: à escala do país, o relevo (×5) lê-se pelo sombreado, não pela altura; o 3D é um plano oblíquo bonito, não uma montanha. Mais exagero deforma a costa.
- ~~Primeiro ecrã a 390 px começava na Galiza~~ → resolvido na ronda 5 (câmara dinâmica no troço dos três melhores).
- ~~Martinhal a pintar a costa oeste de Sagres~~ → resolvido na ronda 5 (troços limitados pela orientação da costa).
- Com os três melhores espalhados pela costa toda (ex.: bodyboard agora, Moledo + Arrifana + Tonel), o zoom desce a 5,45: lê-se Portugal, mas os troços ficam finos.
- Ao descer até ao mapa, o enquadramento feito para o primeiro ecrã deixa mar vazio em baixo (o troço fica no terço de cima); só se refaz ao mudar de bloco ou modalidade.
- Wakeboard e big wave têm um só spot nos dados (Lagoa, Nazaré): a lista mostra uma linha e o resto da costa fica neutro, como pedido. Com estes dados inventados, ambos ficam entre «não dá» e «fraco».
- Os troços de Lagoa de Albufeira são o mar em frente à lagoa (a lagoa em si não é desenhada como água de spot).

## Ronda 5 (13 out)
- Câmara móvel dinâmica, troços por orientação da costa, selector com «Mais», Foil com vertentes, big wave como modo do surf (ver LEIA-ME).
- Rótulos de terra (Porto, Lisboa…) já não tapam spots: empurram-se para leste até 48 px, ou saem. No telemóvel com o Norte enquadrado, a Galiza fica nomeada «Espanha».
- `interaccao.js`: 8 modalidades × 5 blocos + big wave (3 blocos) + memória após recarregar = 44 verificações, 0 falhas, 0 erros de consola; inclui os três melhores dentro do mapa e o rótulo de cada um. Saídas em `shots/interaccao-saida-{1,2,3}.txt`; `teste.js` em `shots/teste-saida.txt`.
