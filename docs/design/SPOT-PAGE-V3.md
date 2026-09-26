# Página de spot — spec v3 («um painel, um eixo»)

Estende docs/design/SPOT-PAGE.md (contrato v2). Onde esta spec contradiz a v2, manda esta.
Direcção: Atlantic Editorial Ops. Um acento (--verdict). Movimento só quando significa algo.

## 0. Princípios que esta versão acrescenta
1. **Um eixo de tempo visível.** A régua de 48 h é a espinha da página. A tabela «Hora a hora» é o detalhe dessa régua, não um segundo eixo. O meteograma sai.
2. **Hierarquia de acções: 1 primária, o resto discreto.** Só «Como chegar» é botão cheio. Tudo o resto é botão fantasma ou ícone, todos com 44 px de altura.
3. **Proveniência numa linha calma.** No hero, só uma linha em fg-muted. Os chips vivem em «Como sabemos».
4. **Cor = significado.** Vermelho só para perigo real (avisos §0). Confiança baixa é âmbar em texto, sem fundo.
5. **Nada cortado, nada sobreposto** a 390 px e a 1440 px.

## 1. Veredicto (#agora)
Desktop (≥1024): grelha 12 colunas.
- Colunas 1–7: «← Voltar aos spots» (text-meta) · região · coordenadas (mono) · H1 nome (display, clamp(40px, 5vw, 64px)) · linha de tempo «qua 23 set, 04:00» + pill Agora/Previsão.
- Colunas 8–12, alinhado à direita: score (mono, 104 px, --verdict) · «/100» · banda (display, letter-spacing .18em) · frase de porquê (getSpotScoreFactors, 1 linha, fg-muted).
- Linha de acções por baixo do nome, altura 44 px, gap 8 px, por esta ordem:
  - [Como chegar] (primário cheio, único);
  - [♡] [🔔 Alerta] [▶ Câmara] (fantasmas; Câmara só se houver livecam);
  - [⋯ Mais] (Partilhar, Check-in).
  Os ícones são Lucide. Os botões fantasmas mostram rótulo a partir de ≥640 px e só ícone abaixo disso, sempre com aria-label.
- Linha de proveniência (text-meta, fg-muted): «Modelo Open-Meteo · confiança baixa · actualizado há 12 h · Como sabemos →».
  - «confiança baixa» em âmbar (texto) só se baixa;
  - «há 12 h» em âmbar só se passar o TTL de frescura que o projecto já usa;
  - com correcção observada no «agora»: «Onda corrigida pela boia CSA92 · vento da estação Cabo Raso»;
  - o link leva a #como-sabemos.
Mobile (<640): nome e score na mesma linha se couber (score 64 px à direita), senão o score por baixo. Acções numa linha só: [Como chegar] a ocupar o espaço livre + 3 ícones + Mais. Nunca 3 linhas.

## 2. Barra fixa
- Desktop: tabs de modalidade (mini-score) à esquerda; à direita, chip «71 · 04:00 · Agora» + âncoras «Resumo · Hora a hora · No local · Chegar».
- Mobile: as tabs deslizam na horizontal com edge-fade à direita; o chip score+hora fica fixo à direita, com fundo sólido (bg-base) e um gradiente de 24 px à esquerda, para as tabs desaparecerem por baixo dele. Âncoras escondidas no mobile.
- Aparece com translateY(-100% → 0) + opacity em 200 ms quando o hero sai do ecrã.

## 3. Régua de 48 h (#quando) — a espinha
- Altura: 128 px no desktop, 104 px no mobile (barras), mais 24 px de eixo.
- Barras: cor do escalão de cada hora a 28 % de opacidade; a hora escolhida a 100 %; a hora «agora» com um traço vertical de 1 px em fg.
- Noite sombreada (sunTimes) como já está.
- Janelas: a janela ≥60 mais forte fica como uma faixa por trás das barras (--verdict a 8 %), com a etiqueta por cima: «melhor: qua 13–19h · pico 16h (85)». Regras da etiqueta:
  - o pico procura-se SÓ dentro da janela visível;
  - se a janela cobrir >70 % das 48 h, a etiqueta diz «bom quase todo o período · pico qui 16h (85)».
- Tooltip no hover (só desktop, pointer:fine): hora · score · onda m/s · vento kt dir. Segue o cursor com transform, 120 ms. Nas horas com banda ensemble, a onda aparece como intervalo («1,0–1,9 m») em vez do valor único.
- Faixa de incerteza (banda ensemble P10–P90 por hora): uma marca por hora por baixo do eixo, numa escala ÚNICA para as 48 h visíveis — normalizar hora a hora faria a mesma incerteza parecer maior numa hora do que noutra — mais uma linha em palavras para a hora escolhida («Ondas entre 1,0 e 1,9 m»). Sem siglas na régua: P10/P50/P90, membros e ME/RMSE por horizonte vivem em «Como sabemos» (§8). Caixa reservada: a faixa e a linha existem SEMPRE (placeholder NBSP quando a hora não tem banda) e o botão «Agora» mantém a caixa quando já não acção («disabled» + invisível), senão a régua mudava de altura ao arrastar. Os números vêm do formatador dos cartões (`getInstrumentFmt(locale).f1`): uma casa decimal sempre — «Ondas entre 1,0 e 1,9 m», não «1 e 1,9» — e a vírgula ou o ponto do idioma, porque um `isPt ? 'pt-PT' : 'en-GB'` local escrevia «1.4 m» dentro de uma frase em espanhol, alemão ou francês.
- Eixo: rótulos com prevenção de colisão em PÍXEIS (mede a largura do texto, gap mínimo de 8 px); a prioridade é mudança de dia > 12h > 6h.
- Mudança de modalidade: as barras animam scaleY com stagger de 6 ms por barra (máximo 240 ms no total).

## 4. Instrumentos (#instrumentos)
Mantém-se tal como está (S2B). Só três ajustes:
- o painel de detalhe abre com grid-template-rows 0fr → 1fr em 240 ms;
- a borda do cartão aberto usa --verdict a 40 %;
- o chip do vento usa a mesma classificação do score (classifyWind: onshore / side-onshore / side-offshore / offshore → «Onshore / Cross-on / Cross-off / Offshore»), para acabar com a divergência de 40–67,5°.

## 5. Hora a hora (#previsao) — o detalhe da régua
- O meteograma SAI. A informação dele já está na régua (score), nos instrumentos (vento/onda/maré) e na tabela.
- Título «Hora a hora» (igual à âncora).
- Desktop: tabela com a 1.ª coluna fixa, separadores de dia (linha + rótulo «qua 23»), a coluna «agora» com contorno fg/30 e a coluna escolhida com fundo --verdict/12 e contorno --verdict. Linhas: Score · Ondas · Período · Vento · Rajada · Direcção · Maré · Água. Chips de dia por cima («Hoje · Amanhã · qui 25 …») fazem scroll até ao dia. Tipo 13 px mono, altura de linha 36 px.
- Mobile (<768): lista vertical, uma linha por hora, 56 px de altura, agrupada por dia com cabeçalho fixo («Quarta, 23»):
  `04:00 | [71] | 1,5 m · 13 s | ↘ 7 kt (21) | ↑ a encher`
  - a linha escolhida tem fundo --verdict/12;
  - tocar numa linha muda o índice;
  - mostra as primeiras 24 h e depois «Mostrar mais 24 h».
- Sincronização em ambos os sentidos, como a S3 fez (0 re-renders da tabela por passo).

## 6. Contexto (desktop ≥1024)
- Linha A: «No local» (colunas 1–8) | «Perto daqui» (colunas 9–12).
- Linha B: «Chegar e estar» a toda a largura, com 3 colunas internas:
  - [mapa mínimo + Direcções + Google Maps];
  - [Estacionamento · Comer · Dormir];
  - [Maré ideal · Regra local · Perigos · Instalações].
  - A foto do spot fica como faixa de 160 px no topo do bloco (object-fit cover, lazy, com dimensões fixas).
- Linha C: «Como sabemos» a toda a largura. Os chips de proveniência vivem SÓ aqui.
- «Perto daqui»: cada linha tem um mosaico de score (cor do escalão), o nome sem truncar e a distância. Clicar leva ao spot mantendo ?sport=.
Tablet (640–1023): 2 colunas; «Chegar e estar» a toda a largura, com 2 colunas internas.
Mobile: os accordions ficam como estão.

## 7. Movimento (tabela única da página)
| Elemento | Propriedades | Duração | Curva |
|---|---|---|---|
| Count-up do score | texto | ≤320 ms | out-expo |
| Cursor/selecção da régua | transform | 200 ms | cubic-bezier(.16,1,.3,1) |
| Barras ao mudar modalidade | transform scaleY | 160 ms + stagger 6 ms | idem |
| Inversão de foco do cartão | background, color | 240 ms | idem |
| Painel de detalhe / accordion | grid-template-rows | 240 ms | ease-in-out |
| Barra fixa entra/sai | transform, opacity | 200 ms | ease-out |
| Coluna/linha escolhida na tabela | background | 150 ms | ease-out |
| Scroll de âncora | smooth, com scroll-margin | nativo | — |
- prefers-reduced-motion: tudo instantâneo; sem count-up; sem stagger; o scroll de âncora fica auto.
- Nada começa em opacity 0 à espera de um observer: a página está legível no primeiro frame.

## 8. Critérios de aceitação
- 0 erros na consola (inclui #418) em PT/EN, desktop/mobile, claro/escuro.
- CLS ≤ 0,05 (Lighthouse, mediana de 3); nenhuma secção muda de altura com a hora escolhida (§1 hero, §3 régua, §4 cartão Onda).
- O conteúdo da rota existe no HTML EXPORTADO: o `<main>` nunca pode vir vazio. Nenhuma fronteira RSC com `fallback={null}` embrulha a página — o `<footer>` segue `</main>`, era o primeiro conteúdo pintado e saltava ~4700 px quando a fronteira resolvia (0,7133 de CLS só nesse entry, ~0,85 no total a 390 px). A rota do spot reserva a dobra com o esqueleto do segmento e o botão «Agora» da régua existe desde o primeiro paint (senão entrava numa linha `flex-wrap` já medida e forçava a quebra: 29 → 60 px e +31 px em tudo o que está abaixo, a 390 px). Provas em `tests/e2e/spot-page-cls.spec.ts`.
- Nenhum texto cortado com reticências nos nomes de spots; nenhuma sobreposição a 390 px, 768 px e 1440 px (teste E2E de colisão por bounding boxes para o eixo da régua, a barra fixa e as acções do hero).
- Alvos ≥ 44 px fora de tabelas.
- No máximo 8 tamanhos de letra em main (escala: 11, 13, 15, 18, 24, 32, 48/64, 104).
