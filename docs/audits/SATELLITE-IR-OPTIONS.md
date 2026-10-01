# Satélite IR sobre Portugal — alternativas ao GOES-East e melhorias

**Data:** 2026-10-01 · **Âmbito:** camada «Satélite IR (10 min)» ([`src/lib/goesIr.ts`](../src/lib/goesIr.ts))
**Estado:** relatório de investigação (sem mudanças de código)

---

## 1. O problema

Portugal continental (~9°W) fica no **limbo oriental do disco GOES-East**
(sub-satélite ~75°W). A imagem IR aí é esborratada por geometria — a linha de
visão do satélite atravessa ~65° de ângulo — e não por código. Verificado no
catálogo GIBS (out 2026): **não existe Meteosat/MSG/SEVIRI keyless** no NASA
GIBS; os geostacionários lá são GOES-East, GOES-West e Himawari (Pacífico).
O resultado prático: a camada IR atual vale para sistemas no Atlântico
central/Açores, mas sobre a Península é um borrão — e o utilizador não
percebe porquê.

## 2. Como fazem as apps de referência

### Windy
- Não usa um serviço de tiles de terceiros: **"Huge satellite dish, expensive
  equipment and a half year of development"** (anúncio oficial, 2019) — ~80 %
  do trabalho foi backend: recebem EUMETCast (dishes próprias), processam e
  publicam os próprios tiles. O endpoint `sat.windy.com/…` é privado e sem
  CORS para terceiros (404 verificado).
- O seu layer «Infra+» é **IR10.8 com paleta de realce de temperaturas**
  (azul ~240 K → vermelho ~200 K, esquema EUMETSAT) — realça topos de
  convecção, exactamente o que o nosso caso de uso quer.
- **Lição:** não há atalho — quem quer IR de qualidade sobre a Europa ou
  recebe EUMETCast, ou consome um serviço EUMETSAT (EUMETView).

### Ventusky / Zoom.earth
- Mesma arquitetura: ingestão própria (EUMETCast/XRIT) e tiles pré-renderizados
  no servidor, com paletas de realce de topos frios. Nenhum oferece API
  pública reutilizável.

### RAMMB/SLIDER (CIRA/Colorado State)
- Excelente para exploração manual (Meteosat-11 full disk real-time), mas a
  entrega é por JSON+JPEG sem CORS previsível e sem SLA — não serve embed em
  produção.

**Conclusão da secção:** para um site pequeno sem infra, o caminho profissional
é consumir o serviço oficial EUMETSAT (EUMETView WMS), que é o mesmo substracto
que Windy/Ventusky processam por conta própria.

## 3. Alternativas testadas (medições de 2026-10-01, do localhost)

### ⭐ 3.1 EUMETView WMS (EUMETSAT) — a alternativa séria

`https://view.eumetsat.int/geoserver/wms` — GeoServer oficial da EUMETSAT,
**sem registo nem API key**, `Access-Control-Allow-Origin: *` verificado no
header de resposta.

Camadas relevantes (catálogo completo via `GetCapabilities`, 255 layers):

| Layer | Produto | Cadência | Cobertura | Atraso observado |
|---|---|---|---|---|
| `msg_fes:ir108` | **SEVIRI IR10.8** (o clássico IR) | 15 min | disco completo 0° (±77° lat/lon) | ~1,5–2 h no GetCapabilities, mas slots recentes respondem 200 (ver nota) |
| `msg_rss:ir039_nrt` | **Rapid Scan IR3.9** | **5 min** | Europa + N de África (oeste até ~-64°) | ~5–10 min (12:00Z disponível às ~12:05Z) |
| `msg_fes:rgb_natural` | Natural Colour RGB | 15 min | disco 0° | idem fes |
| `msg_fes:rgb_airmass` | Airmass RGB | 15 min | disco 0° | idem fes |

Provas feitas:
- GetMap 512×512 em EPSG:3857 sobre Portugal continental: **HTTP 200,
  PNG RGB de 142 KB, 0,39–0,56 s** (3 amostras). Média de brilho 52 com
  desvio 35 — nuvens com contraste, não lavado.
- **Açores cobertos** (bbox -32°/-29° lon: 200, 156 KB).
- **1024×1024 funciona** (272 KB, 3,8 s — pedir tiles 256/512, não mais).
- RSS 5-min sobre PT: 200, 128 KB, 0,8 s.
- Tempos no passado remoto (2026-09-01) também respondem 200 → o arquivo
  histórico é consultável, útil para o carrossel.
- Nota de frescura: o `Default` no capabilities acaba ~2 h atrás, mas slots
  `time=` recentes respondem com dados (o RSS à hora exacta respondeu) — a
  janela prática deve ser descoberta empiricamente por camada (o `nrt` do
  RSS é a pista: near-real-time).

**Custos/risks:**
- É **WMS, não WMTS**: cada request é uma imagem recortada ao bbox pedido —
  Leaflet não tem `L.tileLayer.WMS` cacheável por tile com o mesmo desenho do
  nosso pool por frame; há `L.tileLayer.wms()` nativo, que funciona por tile
  (cada tile = 1 GetMap) e mantém o modelo {z}/{y}/{x}. Compatível com o
  nosso carrossel (um `wms` layer por frame com `time=` fixo).
- Sem SLA público de rate-limit documentado; being fair — pedir 12 frames ×
  ~30 tiles só quando a camada está ligada é tráfego modesto, mas convém
  cache HTTP (o `no-store` do GIBS não se aplica aqui; o GeoServer manda
  cache headers razoáveis) e ou o mesmo código de cap de raster pesadas.
- Atribuição exigida: «Copyright © EUMETSAT» (título do serviço).
- Paleta `raster` é a IR clássica (grayscale quente/frio). Para realce de
  topos convectivos à la Windy Infra+ teríamos de aplicar CSS filter ou
  processar por canvas (o nosso pipeline de máscara já faz canvas por tile,
  um LUT de paleta é mais um passo barato).

### 3.2 Manter GOES-East (status quo)
- Zero trabalho, já estável pós-fix de flashes.
- Continua inútil sobre a Península; aceitável apenas como «vista do
  Atlântico» com um hint claro na UI (já documentado no MAP-LAYERS.md).

### 3.3 NASA GIBS GOES **West** (`GOES-West_ABI_Band13_Clean_Infrared`)
- Existe no catálogo (verificado), mas põe Portugal no limbo **oriental do
  Pacífico** — pior que GOES-East. Descartado.

### 3.4 RainViewer / meteoblue / Weather Company
- RainViewer: radar-only gratuito; satélite não exposto na API pública free.
- meteoblue Satellite Tile API: requer chave comercial paga.
- Weather.com Imagery: contrato enterprise.
- Todos exigem registo/contrato → contra o princípio keyless do projecto.

## 4. Opções de resolução (recomendações)

### Opção A — «Substituir o motor» (recomendada)
Trocar o fonte da camada IR de GIBS/GOES-East para **EUMETView WMS
`msg_fes:ir108`** (15 min, disco 0°, Portugal no terceiro superior da
qualidade — nenhuma máscara de limbo necessária sobre a Europa).

- Implementação: novo `lib/meteosatIr.ts` (URL WMS por frame com `time=`),
  `L.tileLayer.wms()` por frame no mesmo pool do `useMapLayers`, bounds
  ±77°, atribuição EUMETSAT, CSP `img-src` += `view.eumetsat.int`.
- O carrossel de 10 min passa a 15 min (cadência do produto) — ajustar
  `GOES_IR_CADENCE_MIN` ou torná-la por-fonte.
- Esforço: ~1 dia incl. testes. Risco: dependência de um serviço estatal
  sem SLA (mitigável com fallback para GOES-East em erro persistente).

### Opção B — «A fonte certa para cada cena» (A + RSS)
Como A, mas com dois sub-modos: `msg_rss:ir039_nrt` (**5 min**) quando o
viewport está sobre a Europa (zoom ≥ ~4 e centro < -5° lon / > 30° lat) e
`msg_fes:ir108` fora. É o padrão que os players comerciais seguem
(rápido onde há dados, completo no resto).

- Esforço: A + ~0,5–1 dia (seleção por viewport, transição entre fontes).
- Ganho: carrossel de 5 min sobre PT — mais fluido que o GIBS actual (10 min).

### Opção C — «Melhorar o que há» (quick wins sobre o status quo)
Sem mudar de fonte, reduzir o custo de a camada existir:
1. **Hint de cobertura no badge** — «limbo GOES; Europa = Radar IPMA» já em
   docs, mas não na UI. Uma linha no tooltip do carrossel.
2. **Opacity ramp por ângulo de visão** — o limbo pode ser dithered com
   opacidade menor perto do leste do disco (o tile máscara já sabe o ratio
   de pixels «sem dados»).
3. **Paleta de realce tipo Infra+** — LUT de cores no pipeline de máscara
   (topos < 240 K azuis→vermelhos). Funciona igualmente bem sobre GOES
   East ou Meteosat; é o que faz a layer parecer «profissional».
- Esforço: ~2–4 h cada; nenhum quebra testes existentes (o LUT corre depois
  da máscara, no mesmo `tileload`).

### Opção D — Ingestão própria (Windy-style)
EUMETCast + decodificação XRIT + tiles próprios. Controla tudo, custo de
infra e manutenção alto — **não recomendado** à escala actual.

## 5. Melhorias transversais (independentes da fonte)

1. **Cache local dos frames do carrossel** (Cache API): o GIBS manda
   `no-store`; guardar o PNG já mascarado por slot devolve zoom-out instantâneo
   e reduz tráfego — o carrossel repete os mesmos 12 slots.
2. **Prefetch só do frame activo** (já parcialmente feito com warm) + cache →
   queda de ~50 % de pedidos no primeiro activate.
3. **Legenda de temperaturas** (TCT colour scale) ao lado do badge quando o
   realce estiver activo.
4. **`Cross-Origin-Resource-Policy` / CSP:** acrescentar
   `view.eumetsat.int` a `imgSrc` no CSPMeta + terraform headers quando a
   Opção A/B avançar.
5. **Observabilidade:** contar tiles 404/500 por fonte num contagem local
   (debug flag) para detetar mudanças de produto GIBS/EUMETSAT cedo — o
   histórico mostra que os produtos mudam sem aviso (o caso do «hoje vazio
   de manhã»).

## 6. Recomendação final

**Opção A (EUMETView `msg_fes:ir108`) como substituição do motor, com o quick
win nº 3 (paleta Infra+) da Opção C por cima.** É a que dá o aspecto
profissional que o projecto procura sobre Portugal com esforço de ~1 dia e
sem chaves nem infra. A Opção B é o passo seguinte natural quando a A estiver
estável. O GOES-East permanece como fallback de rede e para a vista do
Atlântico central (Açores) se algum dia quisermos as duas fontes como
sub-modos de «Satélite».

---

### Apêndice — comandos de verificação (reproduzíveis)

```bash
# Capabilities (255 layers)
curl -s 'https://view.eumetsat.int/geoserver/ows?service=WMS&version=1.3.0&request=GetCapabilities' -o caps.xml

# IR10.8 sobre Portugal (512px) — 200, ~140 KB, <1 s
curl -s -D - -o pt.png -H 'Origin: https://ventu.surf' \
'https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=msg_fes:ir108&styles=raster&crs=EPSG:3857&bbox=-1252344,4865942,-939471,5145377&width=512&height=512&format=image/png&time=2026-10-01T11:45:00.000Z' \
| grep -i access-control   # → access-control-allow-origin: *

# Rapid Scan 5-min
curl -s -o rss.png \
'https://view.eumetsat.int/geoserver/wms?...&layers=msg_rss:ir039_nrt&time=2026-10-01T12:00:00.000Z'

# GIBS: confirmar que NÃO há Meteosat
python3 -c "import re;xml=open('/tmp/gibs-caps.xml',errors='replace').read();\
print(re.findall(r'<ows:Identifier>([^<]*Meteosat[^<]*)</ows:Identifier>',xml) or 'NONE')"
```
