# Página de spot v5: diorama 3D (maquete aprovada, Guincho) (SUBSTITUÍDA pela v6)

> **Substituída (14 out 2026).** O visual desta maquete v5 (calcário, Cinzel, portulano, carta náutica) foi recusado pelo Pedro. O contrato de #184 é agora a **v6 «Atlântico»**: [`../v6-atlantico/`](../v6-atlantico/) (Página de spot v6: Atlântico). Esta pasta fica só como referência da arquitectura da informação, do ranking único, da escala 0–10 e da regra de ouro, que a v6 mantém. Não implementar o aspecto daqui.

Contrato visual da issue #184. Aprovada pelo Pedro a 13 out 2026. Ler primeiro a [regra de ouro](../README.md#a-regra-de-ouro).

- Maquete: [`index.html`](index.html) (autocontida). Parâmetros: `?d=kite|surf|windsurf|foil|bodyboard|wakeboard`, `?v=wing|kitefoil|surffoil|normal|ondaGrande`, `?h=<índice da hora 0–47>`, `?webgl=0` (carta plana, sem 3D).
- Regras das modalidades nesta página: [`MODALIDADES.md`](MODALIDADES.md).
- Paridade com a versão aprovada antes das modalidades: [`fontes/verifica-paridade.js`](fontes/verifica-paridade.js).

## A informação, de cima para baixo

1. **Cabeçalho**: nome do spot (h1, versaletes) e concelho; o selector **Kite · Surf · Mais ⌄** à direita.
2. **Veredicto**: a hora («qua 14 out, 14h · agora»), a **nota grande /10** na cor da banda e uma frase: «Muito bom para kite até às 19h», com a linha de apoio «nortada NNW 18–22 nós, rajadas até 28». Nota baixa = a frase diz o motivo (pouco vento, rajado, chuva, pouca onda, vento a estragar). À noite: sem nota, e a frase aponta para a próxima janela.
3. **Cena 3D** (MapLibre, terreno `raster-dem` terrarium, relevo ×1,5, câmara oblíqua vista do mar):
   - o **mar pintado pela nota** da hora (cor da banda; cinzento se a modalidade não se aplica ao spot);
   - **rumos de portulano** a irradiar do largo: os rumos de onde o vento é bom para esta praia em destaque, os outros esbatidos;
   - **isóbatas** aproximadas (com rótulo, ex. «10 m»), para ler a praia, não para navegar;
   - linhas de vento (brancas, a correr) e frentes de onda (curvas, dobradas pela profundidade);
   - legenda: vento, ondulação, rumos bons, isóbatas; atribuição OSM · OpenFreeMap · Terrain Tiles.
4. **Régua de 48 horas**: uma barra por hora na cor da banda, a noite tracejada, «agora» marcado, dias assinalados (QUI 15, SEX 16), setas ‹ › e teclado. Mudar a hora muda **tudo**: veredicto, mar, setas, Porquê e tabela.
5. **Porquê**: três fatores, **vento, onda e maré**, cada um com o valor da hora e o efeito («a favor», «pesa contra», «impede»).
6. **Estudar o spot** (recolhido, `<details>`): **hora a hora** (tabela: hora, nota, vento, rajadas até, direcção, onda, período, maré), **a praia** (a ficha do spot: orientação, janela de ondulação, terral), **como se lê** e **de onde vêm os dados**.

## Regras

- Um só objecto por hora; a nota, a frase, a régua, a cor do mar, o Porquê e a tabela saem da mesma avaliação (`../modalidades-avalia.js` sobre `../modalidades-def.json`). Não há limiares no código da página.
- Máximos com «até» («rajadas até 28», «até às 19h»).
- Sem WebGL: carta plana estática com a mesma cor do mar e a mesma informação (`extra-390-sem-webgl.png`). Primeira pintura com poster antes do WebGL.
- `prefers-reduced-motion`: sem linhas a correr nem animação de câmara.
- Alvos de toque ≥ 44 px (selector, menu Mais, setas da régua, barras).
- Tema escuro: ver `extra-390-escuro.png`.

## Capturas (viewport, nunca página inteira)

| Captura | O que mostra |
|---|---|
| [`modalidades-390x844-kite-agora.png`](capturas/modalidades-390x844-kite-agora.png) | 390 px, kite, agora: **primeiro ecrã de referência** |
| [`modalidades-1440x900-windsurf.png`](capturas/modalidades-1440x900-windsurf.png) | 1440 px, windsurf (desktop com o selector final) |
| [`captura-1440x900.png`](capturas/captura-1440x900.png) | 1440 px, kite, agora |
| [`extra-390-noite-qua-23h.png`](capturas/extra-390-noite-qua-23h.png) | Noite (qua 23h) |
| [`extra-390-escuro.png`](capturas/extra-390-escuro.png) | Tema escuro |
| [`extra-390-sem-webgl.png`](capturas/extra-390-sem-webgl.png) | Sem WebGL (carta plana) |
| [`extra-390-surf-sex-8h.png`](capturas/extra-390-surf-sex-8h.png) | Surf, outra hora |
| [`modalidades-390x844-mais-aberto.png`](capturas/modalidades-390x844-mais-aberto.png) | Menu «Mais» aberto |
| [`modalidades-390x844-foil-wing.png`](capturas/modalidades-390x844-foil-wing.png) | Foil › Wing |
| [`modalidades-390x844-wakeboard.png`](capturas/modalidades-390x844-wakeboard.png) | Wakeboard num spot de mar: «Não é spot», mar cinzento |

Nota: `captura-1440x900.png` e as `extra-*` são anteriores ao selector «Mais» e à regra do «até» (mostram «rajadas 28» e só Kite/Surf). Nesses dois pontos manda o `index.html` e as capturas `modalidades-*`.

