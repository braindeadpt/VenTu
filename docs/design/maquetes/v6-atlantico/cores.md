# Cores da maquete v6 (VenTu, surf e kite)

Gerado por `_build/cores.py` (não editar à mão). Simulação de daltonismo: Machado, Oliveira & Fernandes (2009), severidade 1,0, em RGB linear. ΔE em CIELAB D65: ΔE76 (distância euclidiana) e CIEDE2000. Contraste: WCAG 2.x.

## Escala da nota (0–10)

| Banda | Nota | Fill | Texto no fill | Contraste texto/fill | L* normal | L* deuteranopia | L* protanopia |
|---|---|---|---|---|---|---|---|
| Não dá | ≥ 0 | `#A8464A` | `#FFFFFF` | 5.77 ✅ | 43.1 | 46.0 | 37.8 |
| Fraco | ≥ 3 | `#4479EE` | `#04131F` | 4.66 ✅ | 53.0 | 51.0 | 56.6 |
| Dá | ≥ 5 | `#C99E2A` | `#04131F` | 7.52 ✅ | 67.3 | 69.0 | 64.7 |
| Bom | ≥ 7 | `#40DCD0` | `#04131F` | 11.06 ✅ | 80.1 | 77.8 | 83.5 |
| Muito bom | ≥ 9 | `#FFF07A` | `#04131F` | 16.10 ✅ | 93.9 | 93.9 | 92.2 |
| Noite |  | `#56677B` | `#FFFFFF` | 5.80 ✅ | 42.9 | 42.4 | 43.7 |

## Luminância monotónica e distância entre bandas vizinhas

Exigido: L* sobe com a nota em cada visão; ΔE ≥ 20 entre vizinhas em deuteranopia e protanopia (verificado com as duas métricas).

| Visão | L* (Não dá → Muito bom) | Monotónica | ΔE76 vizinhas | ΔE2000 vizinhas | Mínimo ΔE2000 |
|---|---|---|---|---|---|
| normal | 43.1 → 53.0 → 67.3 → 80.1 → 93.9  | ✅ | 85.1 · 128.0 · 83.7 · 73.1 ✅ | 39.5 · 59.9 · 40.5 · 35.5 ✅ | 35.5 |
| deuteranopia | 46.0 → 51.0 → 69.0 → 77.8 → 93.9 (#766D48 #0077EC #BCA931 #BAC0D2 #FFF080) | ✅ | 90.6 · 130.4 · 71.3 · 68.0 ✅ | 46.7 · 63.3 · 36.5 · 38.6 ✅ | 36.5 |
| protanopia | 37.8 → 56.6 → 64.7 → 83.5 → 92.2 (#5D594A #3487F2 #B29D11 #D0D0D0 #FFEA6F) | ✅ | 73.7 · 127.8 · 68.4 · 62.3 ✅ | 40.4 · 60.3 · 30.0 · 26.5 ✅ | 26.5 |

## Bandas como números grandes sobre o fundo escuro

Regra: a cor da banda só aparece como texto em números ≥ 24 px (≥ 3:1). Texto pequeno com cor de banda só a partir de 4,5:1; abaixo disso a banda aparece como fill com o seu texto.

| Banda | sobre abismo `#030E18` | sobre fundo `#071B2C` | sobre mar `#0C2A42` | Uso permitido como texto |
|---|---|---|---|---|
| Não dá | 3.37 | 3.03 | 2.55 | só ≥ 24 px |
| Fraco | 4.83 | 4.34 | 3.66 | só ≥ 24 px |
| Dá | 7.79 | 6.99 | 5.90 | qualquer tamanho |
| Bom | 11.45 | 10.29 | 8.67 | qualquer tamanho |
| Muito bom | 16.67 | 14.97 | 12.63 | qualquer tamanho |
| Noite | 3.35 | 3.01 | 2.54 | só ≥ 24 px |

## Interface

| Par | Contraste | Mínimo |
|---|---|---|
| espuma `#F3F8FB` / abismo `#030E18` | 18.18 ✅ | 4.5 |
| espuma `#F3F8FB` / fundo `#071B2C` | 16.33 ✅ | 4.5 |
| espuma `#F3F8FB` / mar `#0C2A42` | 13.77 ✅ | 4.5 |
| nevoa `#A9C2D4` / abismo `#030E18` | 10.51 ✅ | 4.5 |
| nevoa `#A9C2D4` / fundo `#071B2C` | 9.44 ✅ | 4.5 |
| nevoa `#A9C2D4` / mar `#0C2A42` | 7.97 ✅ | 4.5 |
| sol `#FFC93C` / abismo `#030E18` | 12.66 ✅ | 4.5 |
| sol `#FFC93C` / mar `#0C2A42` | 9.59 ✅ | 4.5 |
| gelo `#7FE7FF` / fundo `#071B2C` | 12.29 ✅ | 4.5 |
| ink `#04131F` / sol `#FFC93C` | 12.23 ✅ | 4.5 |
| espuma `#F3F8FB` sobre foto com véu (gradiente ≥ 72 % `#030E18` atrás do texto) | ver capturas | 4.5 |

### Variante clara «sol» (opcional, `?tema=sol`)

| Par | Contraste |
|---|---|
| espuma `#04131F` / abismo `#EEF4F8` | 16.93 ✅ |
| espuma `#04131F` / fundo `#FFFFFF` | 18.78 ✅ |
| nevoa `#38526A` / fundo `#FFFFFF` | 8.13 ✅ |
| nevoa `#38526A` / abismo `#EEF4F8` | 7.33 ✅ |
| sol `#9A6A00` / fundo `#FFFFFF` | 4.73 ✅ |
| gelo `#005F8A` / fundo `#FFFFFF` | 6.99 ✅ |

Na variante clara as notas aparecem sempre dentro do fill da banda (o amarelo «Muito bom» sobre branco daria 1,1:1).


## Resultado

Todas as verificações passam.
