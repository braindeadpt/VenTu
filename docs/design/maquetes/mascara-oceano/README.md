# Máscara do oceano — /mapa satélite (#302)

Antes/depois do `/pt/mapa/?basemap=sat&wind=0` (build:e2e local, Chromium 150, ANGLE gl-egl).
«Antes» = o mesmo build com `public/geo/ocean-mask/` bloqueado (= satélite Esri cru da main).

| Vista | Coordenadas | 1440 | 390 |
|---|---|---|---|
| São Jacinto | 40.70, -8.76, z13 | `sao-jacinto-1440.png` | `sao-jacinto-390.png` |
| Ericeira | 38.98, -9.42, z14 | `ericeira-1440.png` | `ericeira-390.png` |
| Ria Formosa | 37.0, -7.9, z12 | `ria-formosa-1440.png` | `ria-formosa-390.png` |

PNG em paleta de 256 cores (peso do repo) — o gradiente do «fundo» aparece com
mais degraus aqui do que no ecrã.
