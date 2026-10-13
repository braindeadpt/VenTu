# Contratos visuais v4 — regras comuns

Referência: maquete v7 (`docs/design/contratos/maquete-v7.html`), validada em Chromium headless a 390×844 (mobile, touch) e a 1440×900, sem erros na consola nem overflow horizontal.

## Tokens (usar os do design system do repo; a maquete mapeia assim)
| Token maquete | Uso | Valor |
|---|---|---|
| --bg / --bg2 / --surface | fundo, fundo 2, cartões | #06121F / #0A2236 / #0E2A40 |
| --t1 / --t2 / --t3 | texto principal / secundário / terciário | #EAF4FB / #8FB3C9 / #5D7F95 |
| --epic / --good / --fair / --poor / --closed | tiers de score (80+ / 60+ / 40+ / 20+ / <20) | #2EE6A6 / #4CC9F0 / #F2C14E / #F28C5B / #5B6B7A |
| --danger | aviso de segurança | #FF5D5D |
| --land / --water / --sand | mapa | #13241C / #0B3350 / #C9B27A |
| --r | raio dos cartões | 18px |
| Vento (kn) | partículas e legenda | <8 azul · 8–15 verde-água · 15–22 amarelo · 22–30 laranja · >30 magenta |

Números: vírgula decimal PT (6,6), `font-variant-numeric: tabular-nums`. Score sempre 0–10 com 1 casa.

## Critérios mensuráveis (todos os PRs de UI)
1. `document.documentElement.scrollWidth === innerWidth` a 360, 390 e 1440 (nenhum overflow de página). Scrollers horizontais intencionais (`overflow-x:auto`) são permitidos.
2. Zero `pageerror` e zero `console.error` no fluxo completo do issue.
3. Alvos de toque ≥ 44×44 px a 390.
4. Contraste texto/fundo ≥ 4,5:1 (texto < 18 px) e ≥ 3:1 (≥ 18 px ou bold ≥ 14 px).
5. CLS ≤ 0,05 na rota; LCP não piora > 10 % vs main (Lighthouse do CI).
6. Animações: nenhuma partícula, crista ou linha de vento/ondulação desenhada sobre terra (máscara de terra). Pausam com `document.hidden` e fora do viewport.
7. `prefers-reduced-motion: reduce`: sem animação contínua; vento/ondulação em setas/linhas estáticas; transições ≤ 150 ms ou nenhuma.
8. Valores iguais em todos os sítios do ecrã (score, direcção, hora): a mesma fonte, nunca dois arredondamentos diferentes (ex.: 6,7 vs 6,6 é falha).
9. Nenhum placeholder visível («X min», «—» sem motivo, «lorem»).

## Estados obrigatórios em cada PR (screenshots no agent-verify a 390 e 1440)
| Estado | Como forçar | O que se espera |
|---|---|---|
| Normal | dados reais | igual à referência (layout, hierarquia, cores dos tiers) |
| Noite | hora > pôr do sol (mock de relógio) | mapa e texto iguais, régua marca noite (barras escurecidas), score do «agora» com nota «noite» |
| Vazio | spot/grade sem dados (fixture) | mensagem curta («Sem previsão para esta hora») no lugar do valor, sem zeros falsos, layout com a mesma altura |
| Erro | fetch do JSON falha (route abort) | cartão de erro discreto com «Tentar de novo», o resto da página funciona |
| A carregar | atrasar o JSON 2 s | skeletons com as dimensões finais (CLS 0), sem spinners centrados |
| Reduced motion | `reducedMotion: 'reduce'` | ver critério 7 |
| Tema | dark (default) e o tema «ocean» já existente | ambos sem texto ilegível |

Aprovação: Hark compara as screenshots do verify com as de referência (`*-390.png`, `*-1440.png`, `*-rm.png`) e Pedro valida no iPhone antes do merge.
