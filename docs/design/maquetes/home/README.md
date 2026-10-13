# Home v5: Costa viva (maquete aprovada)

Contrato visual da issue #183. Aprovada pelo Pedro a 13 out 2026. Mesma família visual da [página de spot](../spot/). Ler primeiro a [regra de ouro](../README.md#a-regra-de-ouro).

- Maquete: [`index.html`](index.html) (autocontida). Parâmetros: `?d=kite|surf|windsurf|wing|kitefoil|surffoil|bodyboard|wake|bigwave`, `?b=0-tarde|0-fim|1-manha|1-tarde|1-fim` (bloco), `?agora=2026-10-14T22:00` (simula outra hora), `?webgl=0` (carta plana).
- Motor da home: [`fontes/nucleo.js`](fontes/nucleo.js) (bandas, janelas, blocos, **ranking único**, frase de cada linha e frase nacional), sobre `../modalidades-avalia.js`.
- Notas de construção e iterações: [`fontes/LEIA-ME.md`](fontes/LEIA-ME.md), [`fontes/critica.md`](fontes/critica.md).

## A informação, de cima para baixo

1. **Cabeçalho**: «Portugal · a costa» (h1) e o selector **Kite · Surf · Mais ⌄** (o mesmo da página de spot).
2. **Frase nacional**: a hora e uma frase editorial curta, derivada do ranking do bloco: «Nortada a apertar à volta de Lisboa: kite bom a muito bom do Guincho à Lagoa, até às 19h.» À noite: «Noite na costa. Amanhã de manhã, …».
3. **Os três melhores · agora** (ou do bloco escolhido): nota grande, spot e concelho, «Muito bom até às 19h», linha de apoio («nortada NNW 18–22 nós, rajadas até 28»), link para o spot.
4. **A costa em 3D** (MapLibre, terreno terrarium, câmara oblíqua vista do mar):
   - o **mar pintado por troços**: cada spot pinta só o mar da costa que olha para o mesmo lado que a praia (±50°, até 46 km); os troços cortam nos cabos (São Vicente, Sagres, Raso, Espichel, Carvoeiro); estuários fora;
   - rótulos dos três melhores no mar, com guias (ou em terra se não couberem), zonas de profundidade, isóbatas e rumos;
   - **telemóvel**: a câmara centra o troço dos três melhores do bloco e da modalidade (zoom 5,45–6,75; Portugal lê-se sempre) e refaz-se quando o top 3 muda; **desktop**: a península inteira, câmara fixa.
5. **Régua por blocos**, fixa em baixo no telemóvel: **hoje** (tarde, fim de tarde) e **amanhã** (manhã, tarde, fim de tarde). A cor de cada bloco é a da melhor nota da costa nesse período. Escolher um bloco muda a frase, os três melhores e o mar.
6. **Rodapé**: Todos os spots, Mapa da costa, Como lemos a nota.

## Regras

- **Um só ranking** por modalidade e bloco: a lista dos três melhores, o melhor da régua e os rótulos do mapa saem da mesma chamada (`ranking()` em `nucleo.js`). O ranking usa o **mesmo motor de notas** da página de spot: o Guincho dá a mesma nota nas duas páginas, nas 8 modalidades e nas 48 horas (`../teste-paridade-guincho.js`: 384 comparações, 0 diferenças).
- Fora do bloco actual, só contam horas com o sol ≥ 2° (uma hora de crepúsculo não é sessão).
- Máximos com «até».
- Sem WebGL: carta plana com a mesma regra de enquadramento no telemóvel. Poster antes do WebGL.
- `prefers-reduced-motion`: a câmara salta em vez de animar.
- Alvos de toque ≥ 44 px.
- Big wave: modo do surf, só na Nazaré e só nos blocos com onda ≥ 4 m. Wakeboard: só Lagoa de Albufeira e Lagoa de Óbidos; o resto da costa fica neutro.
- **Divergência conhecida da maquete**: grava `ventu.modalidade` como string simples e a vertente em `ventu.foil`. A implementação usa uma só chave com o formato da página de spot (ver [README](../README.md#o-selector-de-modalidades-igual-nas-duas-páginas)).

## Capturas (viewport, nunca página inteira)

| Captura | O que mostra |
|---|---|
| [`captura-390x844-agora.png`](capturas/captura-390x844-agora.png) | 390 px, kite, agora: **primeiro ecrã de referência** |
| [`captura-1440x900.png`](capturas/captura-1440x900.png) | 1440 px, kite, agora |
| [`captura-390x844-surf-agora.png`](capturas/captura-390x844-surf-agora.png) | Surf, agora |
| [`captura-390x844-kite-qui-tarde-mapa.png`](capturas/captura-390x844-kite-qui-tarde-mapa.png) | Outro bloco (amanhã à tarde), descido até à costa |
| [`extra-390-mapa-agora.png`](capturas/extra-390-mapa-agora.png) | O mapa no telemóvel, centrado nos três melhores |
| [`extra-390-noite-qua-22h.png`](capturas/extra-390-noite-qua-22h.png) | Noite |
| [`extra-390-escuro.png`](capturas/extra-390-escuro.png), [`extra-1440-escuro-noite.png`](capturas/extra-1440-escuro-noite.png) | Tema escuro |
| [`extra-390-sem-webgl.png`](capturas/extra-390-sem-webgl.png) | Sem WebGL (carta plana) |
| [`captura-390x844-mais-aberto.png`](capturas/captura-390x844-mais-aberto.png) | Menu «Mais» aberto |
| [`captura-390x844-foil-wing.png`](capturas/captura-390x844-foil-wing.png) | Foil › Wing |
| [`extra-390-wakeboard.png`](capturas/extra-390-wakeboard.png) | Wakeboard (só água plana) |
| [`extra-390-surf-bigwave-qui-tarde.png`](capturas/extra-390-surf-bigwave-qui-tarde.png) | Surf em modo onda grande (Nazaré) |
