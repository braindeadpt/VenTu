# Maquetes v5: página de spot e home

Aprovadas pelo Pedro a 13 out 2026. São o **contrato visual** das issues #184 (página de spot v5: diorama 3D) e #183 (home v5: Costa viva). Substituem os contratos v4 do PR #199 para estas duas páginas.

| Pasta | O que é | Issue |
|---|---|---|
| [`spot/`](spot/) | Página de spot (Guincho): veredicto, diorama 3D, régua de 48 h, Porquê, Estudar o spot | #184 |
| [`home/`](home/) | Home «Costa viva»: frase nacional, os três melhores, a costa em 3D, régua por blocos | #183 |
| [`modalidades-def.json`](modalidades-def.json) | A definição única das modalidades: curvas, degraus, limiares e a lista de água plana | #183, #184 |
| [`modalidades-avalia.js`](modalidades-avalia.js) | O motor de notas, o mesmo ficheiro nas duas páginas (browser e node) | #183, #184 |
| [`teste-paridade-guincho.js`](teste-paridade-guincho.js) | Teste de paridade das maquetes: o Guincho dá a mesma nota no spot e na home | #183, #184 |

Cada `index.html` é autocontido (dados, geografia, motor e poster embutidos). Para o abrir, descarrega-o e abre-o no browser; precisa de rede para as fontes (Google Fonts), o MapLibre GL 4.7.1 (unpkg) e o relevo (AWS Terrain Tiles, terrarium). Parâmetros úteis: `?d=` (modalidade), `?webgl=0` (carta plana). A previsão é inventada (14–16 out 2026), mas coerente hora a hora.

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
