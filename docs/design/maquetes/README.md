# Maquetes: v6 «Atlântico» (aprovada) e v5 (visual substituído)

> **14 out 2026: a direcção aprovada é a v6 «Atlântico»** ([`v6-atlantico/`](v6-atlantico/)), contrato visual das issues #183 (home v6) e #184 (página de spot v6). O **visual** das v5 (calcário, Cinzel, rumos de portulano, ar de carta náutica) foi **recusado** pelo Pedro; as pastas [`spot/`](spot/) e [`home/`](home/) ficam como referência da arquitectura da informação e dos dados, **não** do aspecto.
>
> Mantém-se das v5: a IA das duas páginas, o **ranking único**, a **escala 0–10 e as bandas** (#210), a **regra de ouro** (abaixo), a régua de 48 h e a cena 3D do terreno. Muda: paleta e rampa das bandas (ver [`v6-atlantico/cores.md`](v6-atlantico/cores.md)), tipografia (Barlow Condensed + Barlow), fotografia, mapa da home ao lado do «VAI.», vento em partículas; e o âmbito passa a **só surf e kite**.

| Pasta | O que é | Issue |
|---|---|---|
| [`v6-atlantico/`](v6-atlantico/) | **v6 «Atlântico» (aprovada)**: `index.html` (home) e `guincho.html` (spot), capturas, paleta, créditos das fotos, paridade | #183, #184 |
| [`spot/`](spot/) | v5 (visual substituído): página de spot (Guincho), veredicto, diorama 3D, régua de 48 h, Porquê, Estudar o spot | IA de #184 |
| [`home/`](home/) | v5 (visual substituído): home «Costa viva», frase nacional, os três melhores, a costa em 3D, régua por blocos | IA de #183 |
| [`modalidades-def.json`](modalidades-def.json) | A definição única das modalidades (na v6 só se usam as entradas `kite` e `surf`) | #183, #184 |
| [`modalidades-avalia.js`](modalidades-avalia.js) | O motor de notas, o mesmo ficheiro nas duas páginas (browser e node) | #183, #184 |
| [`teste-paridade-guincho.js`](teste-paridade-guincho.js) | Teste de paridade das maquetes v5: o Guincho dá a mesma nota no spot e na home | #183, #184 |

As maquetes v5 são `index.html` autocontidos (dados, geografia, motor e poster embutidos); precisam de rede para as fontes, o MapLibre GL 4.7.1 (unpkg) e o relevo (AWS Terrain Tiles, terrarium). A v6 traz as fontes e o MapLibre em `v6-atlantico/lib/` e só precisa de rede para o relevo. A previsão é inventada (14–16 out 2026), mas coerente hora a hora, e é a mesma nas duas versões (`v6-atlantico/verifica-paridade.js`: 0 diferenças).

## A regra de ouro

1. **Um único objecto de dados por spot e por hora.** A nota, a frase, a cor do mar, a régua, o Porquê, a tabela hora a hora, a lista dos três melhores e os rótulos do mapa leem todos a mesma entrada (vento, rajada, direcção, onda, período, maré, sol) e a mesma avaliação. Nenhum bloco calcula a sua própria versão.
2. **Nenhum número duplicado.** Um valor aparece uma vez com o seu significado; se aparece em dois sítios, é o mesmo número, vindo do mesmo objecto, na mesma hora. O inventário do site actual encontrou o contrário (o hero a dizer 15 kt e os instrumentos 12 kt; 1,4 m / 11,1 s contra 1,5 m / 8,1 s; picos diferentes no painel e na régua). É exactamente isso que estas maquetes proíbem.
3. **Máximos sempre com «até».** Rajadas, tectos e limites dizem-se com «até»: «rajadas até 28», «até às 19h», «até 2,4 m». Nunca «rajadas 28».

Corolários:
- **Uma só definição das modalidades** (`modalidades-def.json`) e **um só motor** (`modalidades-avalia.js`). Não há limiares de nota em mais nenhum sítio.
- **Um só ranking**: na home, a lista dos três melhores, o melhor da régua e os rótulos do mapa saem da mesma chamada. O ranking usa o mesmo motor de notas da página de spot.
- **Uma só chave de memória** para a modalidade: `localStorage['ventu.modalidade']`, com o mesmo formato nas duas páginas (ver «O selector» abaixo).
- **A cor é só do veredicto.** O mar, a nota e a régua usam a mesma escala de bandas (Não dá < 3 ≤ Fraco < 5 ≤ Dá < 7 ≤ Bom < 9 ≤ Muito bom; Noite à parte).

## O selector de modalidades (igual nas duas páginas)

> **v6: só Kite e Surf.** O menu «Mais», Windsurf, Foil, Bodyboard, Wakeboard e Onda grande ficam fora de âmbito por agora; o que está abaixo descreve as v5 e serve para o modelo de dados continuar extensível. A chave `ventu.modalidade` mantém o formato `{d, v}`.


- Visíveis: **Kite** e **Surf**. Menu **«Mais ⌄»**: Windsurf, Foil, Bodyboard, Wakeboard.
- **Foil** tem vertentes: Wing / Kite foil / Surf foil (sub-selector em linha).
- **Onda grande** não é modalidade: é um **modo do surf** (Normal / Onda grande) e só aparece nos spots com `ondaGrande` (Nazaré), a partir de 4 m (`mostraDesde`).
- **Wakeboard** só nos spots da lista `aguaPlana` (Lagoa de Albufeira, Lagoa de Óbidos). Num spot de mar: «Não é spot de wakeboard: precisa de água plana», mar cinzento e sugestões de água plana perto.
- Memória: `ventu.modalidade` = `{"d": "<modalidade>", "v": {"<modalidade>": "<vertente ou modo>"}}`, por exemplo `{"d":"foil","v":{"foil":"wing","surf":"normal"}}`. `?d=` e `?v=` na URL têm prioridade.
- **Atenção:** a maquete da home ainda grava uma string simples em `ventu.modalidade` e a vertente de foil numa segunda chave, `ventu.foil`, com chaves próprias (`wing`, `wake`, `bigwave`). A implementação segue o formato do spot (`{d, v}`, chaves `wakeboard`, `foil`+`v`, `surf`+`v: ondaGrande`) nas duas páginas, e não usa `ventu.foil`.

## O que ficou de fora deste PR

Ficheiros pesados ou de trabalho, que não entram no repositório (nenhum ficheiro aqui passa de 1 MB):
- `_build/` das duas maquetes (`maquete-v2/_build`, ~205 MB; `maquete-home-v1/_build`, ~234 MB): pacotes `.deb` do Chromium, DEM (`el6.npy`, tiles), capturas de cada ronda (`shots/`), logs, `data.json`, `poster.jpg`, `template.html`, `build_data.py`, `assemble.py`, `shot.sh`.
- `geo.json` de cada maquete (spot ~400 KB, home ~250 KB): a geografia (terra/mar OSM, zonas de profundidade, isóbatas, troços de mar por spot, rumos). Já vai embutido em cada `index.html`; não se duplica.
- Ficam só as fontes leves que explicam as regras: `home/fontes/nucleo.js` (ranking, blocos, frases), `home/fontes/LEIA-ME.md`, `home/fontes/critica.md` e `spot/fontes/verifica-paridade.js`. O `teste-paridade-guincho.js` lê os dois `index.html` com Playwright; os caminhos no ficheiro são os do ambiente onde foi feito e servem de referência para o teste do repositório.

Contexto da auditoria que levou a estas maquetes (inventário de erros do site actual e benchmark de UX/UI): não está no repositório; o essencial está resumido nas issues.

