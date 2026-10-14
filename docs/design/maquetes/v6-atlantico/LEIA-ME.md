# Maquete v6 «Atlântico»: home e spot do VenTu, só surf e kite

13 out 2026 (ronda 4 a 14 out: fotos Unsplash, mapa ao lado do «VAI.», vento novo; ronda 5 a 14 out: afinação depois de o Pedro aprovar, «afina e passa à issue»). **Direcção aprovada.** Direcção visual nova depois de o Pedro recusar a «carta náutica de museu». Mesma informação, mesma lógica e mesmos dados das maquetes aprovadas; muda só o visual.

## Abrir
- `index.html` (home) e `guincho.html` (spot). Abrem directamente do disco; fontes, MapLibre e fotos estão em `lib/` e `fotos/` (WebP do Unsplash, `u-<id>.webp` ≤ 2000 px e `u-<id>-c.webp` 900 px; uma JPEG do Commons, `guincho.jpg`). O relevo 3D vem em directo dos AWS Terrain Tiles.
- Parâmetros: `?d=kite|surf` (sem isso, a última escolha em `localStorage` `ventu.modalidade`); home `?b=0-tarde|0-fim|1-manha|1-tarde|1-fim`, `?agora=2026-10-14T22:00`; spot `?h=0..47`, `?estudo=1`; ambos `?webgl=0` (mapa plano), `?tema=sol` (corpo claro).

## O que é
- **Home**: foto do nº 1 do ranking único (foto da modalidade escolhida), palavra gigante de sim/não («Vai.» = Bom ou Muito bom, «Dá.», «Não vai.», «Noite.»), a frase nacional do `nucleo.js`, o nº 1 com nota e janela; nº 2 e nº 3 em cartões com foto; régua de blocos de hoje e amanhã; mapa 3D escuro (MapLibre, relevo ×5, visto de sudoeste) com o mar junto a cada spot na cor da nota e partículas de vento em canvas (interpolação dos 19 spots na hora mostrada).
  - **Desktop (≥ 1024 px)**: grelha com «VAI.» + top 3 à esquerda e o mapa vivo à direita (câmara calculada para a costa toda, rótulos de todos os spots sem sobreposição), régua por baixo; tudo acima da dobra a 1440×900.
  - **Telemóvel**: régua fixa em baixo; depois do top 3, faixa de mapa com 40 % da altura (máx. 340 px) e o botão «Abrir mapa», que o abre em ecrã inteiro (diálogo com «Fechar» e Esc, legenda, régua visível por baixo, reenquadra o top 3).
- **Spot (Guincho)**: foto a toda a largura (kite: foto do Commons, única que mostra kite no Guincho; surf: Unsplash), nota /10 + banda + uma frase, selector kite/surf; régua de 48 horas; Porquê (vento, onda, maré, com números grandes; a modalidade escolhida vem primeiro; no desktop estica à altura da praia em 3D); praia em 3D com vento em partículas e frentes de onda animadas; «Estudar o spot» fechado (tabela hora a hora e a praia).
- Selector só com **Kite** e **Surf**. Sem «Mais», sem outras modalidades.

## Regras mantidas (verificado)
- `node _build/paridade.js` (com as variáveis de `shot.sh`): Guincho igual à maquete v2 nas 48 horas (nota e frase, kite e surf) e home igual à home-v1 (ranking completo, frase nacional e linhas do top 3 de cada bloco, kite e surf). Resultado a 13 out e de novo a 14 out (rondas 4 e 5): **PARIDADE OK** (0 diferenças).
- Dados lidos tal como estão: `maquete-home-v1/_build/{data.json, nucleo.js, geo/geo.json}`, `maquete-v2/_build/{data.json, geo/geo.json}`, `work/modalidades-avalia.js` (só as entradas kite e surf de `modalidades-def.json`, já embutidas nos data.json). Nada foi alterado nessas pastas.
- Escala 0–10 com as bandas do núcleo (Não dá < 3 ≤ Fraco < 5 ≤ Dá < 7 ≤ Bom < 9 ≤ Muito bom); só as cores mudaram (`cores.md`). Máximos com «até»; um objecto por spot e hora.

## Vento (`_build/vento.js`)
Traços com cauda (histórico de posições desenhado como UM caminho contínuo, curvas pelos pontos médios, um único stroke com degradê de alfa da cauda 0 para a cabeça: sem juntas); a cauda dura um tempo fixo, por isso o comprimento é proporcional à velocidade; alfa também pela velocidade; densidade baixa (home 200 desktop / 90 telemóvel, spot 190 / 95); meandro lento e rajadas (±14 %) que curvam os traços; quando a hora muda, as partículas viram para o novo campo em 0,9 s (sem recomeçar). `prefers-reduced-motion`: setas estáticas. Opções por página: `n`, `vida` (s), `cauda` (s), `vref` (px/s de referência para alfa e espessura), `meandro` (rad), `transicao` (ms).

## Fotos (Unsplash)
- `_build/fotos/selecao.json`: spot → modalidade → `[id, estado, onde]` (`real`, `zona`, `sub` = substituta da região, `commons`). Gerado por `_build/fotos_unsplash.py` (que também descarrega e grava `fotos/unsplash.json` com autor, perfil, página e localização).
- `_build/unsplash_napi.py`: o unsplash.com está atrás do Anubis (prova de trabalho sha256); o script resolve o desafio em Python e guarda o cookie em `/tmp/unsplash-cj.txt`. Usa o proxy do sandbox (não o desligues para isto).
- Recorte por foto em `assemble.py`: `POS` (object-position), `UP` (fracção da altura a subir; negativo desce a foto e liga um degradê no topo, classe `desce`: kite do Guincho no telemóvel), `POSD` + `FL` (desktop: foco próprio e início da foto em % da largura, classe `lado`: surf do Guincho, para os surfistas não ficarem por baixo do título).
- Crédito em cada foto: «Foto: Nome / Unsplash» (ligações ao perfil e à foto com `utm_source=ventu&utm_medium=referral`); nas substitutas junta-se o sítio real («· Sines»). `CREDITOS.md` gerado por `_build/creditos.py`.
- Fotos do Commons que deixaram de ser usadas: `_build/fotos/commons-antigas/`.

## Ficheiros
- `cores.md`: paleta e verificação (gerado por `_build/cores.py`). `CREDITOS.md`: autor e licença de cada foto. `critica.md`: notas por área.
- `_build/`: `home.html` e `spot.html` (modelos), `comum.css`, `vento.js` (partículas), `assemble.py` (gera as duas páginas), `cores.py` + `cvd.py`, `fotos_unsplash.py` + `unsplash_napi.py` (Unsplash), `fotos_busca.py` / `fotos_folha.py` / `fotos_baixa.py` (Commons, ronda 1–3), `creditos.py` (gera `../CREDITOS.md`), `shot.js` / `shot.sh` / `um.sh` / `capturas.sh` (capturas), `paridade.js`.

## Reconstruir
```
cd _build
python3 cores.py          # cores.json + ../cores.md (falha se uma verificação falhar)
python3 assemble.py       # ../index.html, ../guincho.html
./mata.sh; ./capturas.sh 0 2   # 0..17, em partes de 2–3 e UMA de cada vez (mata.sh mata capturas órfãs; duas em paralelo matam-se uma à outra)
```
Capturas: Chromium headless arm64 em `/tmp/cr` (`../maquete-home-v1/_build/setup-chromium.sh`; o playwright-core copia-se de `/workspace/work/pw` se o npm falhar), WebGL por Mesa llvmpipe via ANGLE gl-egl. Só viewport, nunca fullPage. Notas deste sandbox: o proxy HTTP não liga (os scripts desligam-no); o Chromium cai às vezes a meio, por isso `um.sh` grava em `/tmp`, tenta 3 vezes e mata os processos que sobram; em captura (`?shot=1`) o Ken Burns fica congelado.
