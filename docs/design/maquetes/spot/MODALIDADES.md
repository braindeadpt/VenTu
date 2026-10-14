# Selector de modalidades: maquete do spot (Guincho)

Kite · Surf · «Mais ⌄» (menu: Windsurf, Foil, Bodyboard, Wakeboard). A escolha fica em localStorage `ventu.modalidade` ({d, v}); `?d=` e `?v=` na URL têm prioridade.
Foil tem um sub-selector Wing / Kite foil / Surf foil. A «Onda grande» passou a ser um modo do surf (Normal / Onda grande) e só aparece quando `spot.ondaGrande` é verdadeiro (no Guincho é falso).
Wakeboard no Guincho: sem nota. Diz «Não é spot de wakeboard: precisa de água plana», o mar fica cinzento («Não é spot»), no Porquê a onda aparece como «impede» e sugere Lagoa de Albufeira e Lagoa de Óbidos.

Fonte única (desde 13 out, partilhada com a home): `work/modalidades-def.json` → `_build/build_data.py` → `data.json` → `modalidades.def` (curvas e limiares de cada modalidade, vertente e modo) e `spot` (aguaPlana, ondaGrande, tipoAgua, aguaPlanaPerto, vento.bom/ideal).
A nota, a frase (e o motivo de uma nota baixa), a régua, a cor do mar, o Porquê e a ficha «A praia» saem todos da mesma avaliação, `work/modalidades-avalia.js` (embutido no index.html; o mesmo ficheiro corre na home). Não há limiares no JS.
A lista «Água plana perto» sai de `aguaPlana` na mesma definição (a lista única; a home usa-a para o wakeboard).

Paridade: com o Kite e o Surf, as 48 horas dão as mesmas notas e as mesmas frases da maquete aprovada (`node _build/verifica-paridade.js`). A única mudança é «rajadas X» passar a «rajadas até X».
Bases aprovadas guardadas em `_build/*.pre-modalidades.*`.

Paridade com a home: `node ../teste-paridade-guincho.js` (em `work/`) prova que o Guincho dá a mesma nota nas duas páginas em todas as modalidades e nas 48 horas.
