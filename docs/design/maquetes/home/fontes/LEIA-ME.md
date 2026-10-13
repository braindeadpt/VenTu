# Maquete da home do VenTu, v1 («Costa viva» com o topo de «Agora, para ti»)

13 out 2026. Mesma família visual da maquete do spot aprovada (`work/maquete-v2/`).

## Entregáveis (em `work/maquete-home-v1/`)
- `index.html`: autocontido (dados, geografia, núcleo e poster embutidos; CDNs: Google Fonts, unpkg maplibre-gl 4.7.1; relevo em directo dos AWS Terrain Tiles, como no spot).
  Parâmetros: `?d=kite|surf|windsurf|wing|kitefoil|surffoil|bodyboard|wake|bigwave` (sem `?d=`, abre a última escolhida, guardada em `localStorage` `ventu.modalidade` / `ventu.foil`), `?b=0-tarde|0-fim|1-manha|1-tarde|1-fim`, `?agora=2026-10-14T22:00` (simula abrir a página a outra hora), `?webgl=0` (carta plana).
- Capturas (viewport, nunca fullPage; espera `__pronto` = mapa idle + fontes; refeitas a 13 out, ronda 5):
  - `captura-1440x900-surf.png`: desktop, surf, agora.
  - `captura-390x844-mais-aberto.png`: o menu «Mais» aberto. `captura-390x844-foil-wing.png`: Foil > Wing.
  - `extra-390-surf-bigwave-qui-tarde.png` (modo big wave do surf), `extra-390-wakeboard.png`, `extra-390-bodyboard.png`.
  - `captura-390x844-agora.png`: primeiro ecrã, kite, qua 14h.
  - `captura-390x844-surf-agora.png`: primeiro ecrã em surf.
  - `captura-390x844-kite-qui-tarde-mapa.png`: outra hora (amanhã à tarde), descido até à costa.
  - `captura-1440x900.png`: desktop, kite, agora.
  - `extra-390-mapa-agora.png` (a costa no telemóvel), `extra-390-fim-de-tarde-mapa.png` (luz dourada),
    `extra-390-noite-qua-22h.png` (faróis), `extra-390-escuro.png`, `extra-390-sem-webgl.png` (carta plana),
    `extra-1440-surf-qui-manha.png`, `extra-1440-escuro-noite.png`.

## Reconstruir
```
pip install --target /tmp/py shapely numpy pillow mapbox_vector_tile scipy matplotlib
cd _build/geo && python3 fetch.py && python3 vt2geo.py && python3 dem.py && python3 build_geo.py   # geo.json
cd .. && python3 build_data.py      # data.json (verifica que o Guincho = data.json do spot)
node teste.js [2026-10-14T22:00]    # frases e top 3 de todos os blocos, em texto
python3 assemble.py                 # ../index.html
./shot.sh ../captura.png 390 844 "d=surf&b=1-tarde" "scroll=470|dark|poster"   # Chromium headless + Mesa llvmpipe (ANGLE gl-egl)
node teste.js "" windsurf,wing,kitefoil,surffoil,bodyboard,wake,bigwave   # as modalidades derivadas
node interaccao.js [kite,surf,...,bigwave,memoria]   # (com as variáveis de shot.sh) todas as modalidades × blocos; em partes se o sandbox estiver lento
./shot.sh ../captura-390x844-mais-aberto.png 390 844 "" mais   # extra «mais» abre o menu antes da captura
```
`poster.jpg` = `./shot.sh poster.jpg 390 844 "" poster` (primeira pintura antes do WebGL, como no spot).

## Ficheiros-fonte
- `spots.py`: os 18 spots (coordenadas reais, orientação da praia, desportos, janelas).
- `build_data.py`: o único JSON. Guincho = fórmulas e chaves literais de `maquete-v2/_build/build_data.py` (o script falha se divergir).
- `nucleo.js`: notas (funções iguais às do spot, com a praia como parâmetro), bandas, janelas, blocos, ranking único, frase de cada linha e frase nacional. Corre no browser e em node.
- `template.html`: página. `geo/build_geo.py`: terra/mar OSM, fronteira, zonas de profundidade e isóbatas, troços de mar por spot, rumos.

## Ronda 5 (13 out): enquadramento móvel, troços por orientação, modalidades
- **Câmara no telemóvel** (`template.html`, `camMobile`/`enquadra`): centra o troço dos três melhores do bloco e da modalidade escolhidos na faixa do mapa que está à vista (do topo do mapa à régua fixa), com os pontos a ~64% da largura para os rótulos caberem no mar; zoom 5,45–6,75 (a costa lê-se sempre como Portugal). Refaz-se, animado, quando o top 3 muda; com `reduce` ou em captura, salta. O desktop mantém a península inteira (câmara fixa). A carta plana (sem WebGL) segue a mesma regra no telemóvel.
- **Troços de mar** (`geo/build_geo.py`): cada ponto de mar herda a orientação do troço de costa mais próximo (costa amostrada a 0,5 km, normal em ±3 km); um spot só alcança mar cuja costa olha para o mesmo lado que a praia (±50°, a costa a 1,5 km do spot é sempre dele, buracos ≤ 4 km fechados), até 46 km; entre os que lá chegam, fica o mais próximo; pedaços soltos do outro lado de um cabo ficam neutros. Corta naturalmente no Cabo de São Vicente, na Ponta de Sagres, no Cabo Raso, no Espichel e no Carvoeiro: o Martinhal (kite) só pinta a costa sul, a leste da Ponta de Sagres.
- **Modalidades** (`nucleo.js`, `MODS`): Kite e Surf visíveis; «Mais» (menu) com Windsurf, Foil (Wing / Kite foil / Surf foil, sub-selector em linha), Bodyboard, Wakeboard. Big wave é um modo do surf, só na Nazaré e só nos blocos com onda ≥ 4 m. Kite e surf ficam idênticos (saída do `teste.js` igual à anterior).
  - (Os limiares das modalidades derivadas desta ronda foram substituídos na ronda 6 pelos do spot.)

## Ronda 6 (13 out): uma só definição de modalidades com o spot
- **Fonte única**: `work/modalidades-def.json` (curvas, degraus, `comum`, lista `aguaPlana`), lida por `build_data.py` daqui e do spot e embutida em `data.json` → `modalidades`. A avaliação é `work/modalidades-avalia.js`, o mesmo ficheiro nas duas páginas (`assemble.py` embute-o antes do `nucleo.js`). `nucleo.js` deixou de ter curvas e limiares: as notas vêm de `ModAvalia`; as frases leem as mesmas curvas (pouco vento = a curva ainda no zero; rajado = degrau de rajada ou tecto; chuva = 1.º degrau de chuva; pouca onda / onda grande demais = tamanho abaixo de «Dá» antes/depois do pico; vento a estragar = `vento.desde` + `comum.estragaAcimaDe`).
- **Base = curvas do spot**: windsurf, wing, kite foil, surf foil, bodyboard e big wave (= `ondaGrande` do spot; aparece na Nazaré a partir de `ondaGrande.mostraDesde` = 4 m) mudaram para as do spot. Kite e surf iguais: `node teste.js` (e às 8h, 22h, qui 9h) dá a mesma saída de antes, letra a letra.
- **Surf: tolerância da janela** fixada em ±25° por spot (`surf.tol` no data.json), como a home aprovada; no Guincho é a meia largura da janela, como no spot.
- **Wakeboard**: só os spots da lista `aguaPlana` (Lagoa de Albufeira e Lagoa de Óbidos). Novo spot `lagoa-obidos` em `spots.py` (39,417 N, −9,217 W, pt.wikipedia «Lagoa de Óbidos», 39° 25′ N 9° 13′ O; `build_data.py` falha se as coordenadas divergirem da definição). Só wakeboard: fora dos rankings de kite e surf aprovados; sem troço de mar no `geo.json` (só o ponto no mapa).
- **Horas**: o data.json passou a 62 horas (qua 00h → sex 13h) para cobrir as 48 do spot; os blocos continuam a ser hoje e amanhã.
- **Paridade do Guincho**: `node ../../teste-paridade-guincho.js` (com o LD_LIBRARY_PATH do shot.sh) compara as duas páginas geradas: 8 modalidades × 48 horas, mais as entradas de cada hora e a definição embutida.
- Capturas refeitas: `captura-390x844-foil-wing.png` (`d=wing`), `extra-390-wakeboard.png` (`d=wake`), `extra-390-bodyboard.png` (`d=bodyboard`), `extra-390-surf-bigwave-qui-tarde.png` (`d=bigwave&b=1-tarde`).
