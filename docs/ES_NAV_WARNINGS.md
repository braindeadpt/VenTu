# Avisos ES de texto — NAVTEX / NAVAREA III / METAREA II (Instituto Hidrográfico de la Marina)

> Investigação (2026-08-31) para a camada cross-border dos avisos à navegação:
> **se a API GeoJSON espanhola não aparecer, o que existe em texto que possamos
> parsear como fallback** dos «Avisos a los navegantes» (`source: 'es'`)?
> O estado de código — `ES_NAV_WARNINGS_URL` (GeoJSON) + degradação `es:[]` —
> está em `scripts/lib/ihCoastalWarnings.js` e `scripts/fetch-ih-coastal-warnings.js`.

## 1. Esclarecimento de nomenclatura (importante)

O pedido falava de «boletim NAVTEX/METAREA II do IHM» — a investigação revelou
que há **três coisas distintas**, e só uma é realmente emitida pelo IHM:

| Área / produto | Autoridade emissora | O que é |
| --- | --- | --- |
| **NAVAREA III** (avisos de navegação) | **IHM / Armada Espanhola** (Cádiz) | Avisos de navegação *em vigor* (exercícios, plataformas, minas, zonas perigosas) — a categoria certa para a nossa camada de segurança. |
| **METAREA II** (boletins met-ocean) | **França** (per WWMIWS) | Previsões de alto mar; **não** são avisos de navegação. O IHM **não** emite METAREA II. |
| **NAVTEX** (518 kHz) | Rede de estações (Coruña `[D]`, Tarifa `[G]`, Cabo de la Nao, …) | Canal de transmissão (não uma fonte): a estação de **Coruña** retransmite os avisos NAVAREA III do IHM **e** os boletins met METAREA II (AEMET) para o NW ibérico. |

Ou seja: **o «boletim METAREA II do IHM» não existe como tal** — o que o IHM
publica em texto é a lista de **avisos NAVAREA III em vigor** (e os boletins
semanais GAN), e a NAVTEX de Coruña é o canal que os leva ao mar, incluindo as
águas da Galiza / foz do Minho que nos interessam (Moledo do Minho).

## 2. Fontes candidatas de texto (concretas)

### A) NAVAREA III em vigor — tabela HTML (a fonte recomendada)

- **URL**: `https://armada.defensa.gob.es/ihm/Aplicaciones/Navareas/Index_Navareas_xml_en.html` (EN) · `…/Index_Navareas_xml.html` (ES)
- **Formato real**: uma **tabela HTML** (o «_xml» no nome é histórico), sem JS para a listagem:
  - `Number` → ex. `0129/2026` (ref);
  - `General Area` → ex. `EASTERN MEDITERRANEAN SEA` (a nossa heurística de região);
  - `Subject` → ex. `REPAIR IN SUBMARINE CABLE SYSTEM` (categoria);
  - `Preview` → anchor `#divVisorNavarea` com o texto completo do aviso (o detalhe com coordenadas pode estar carregado por JS no visor).
- **Acessibilidade**: o site devolve **HTTP 500 a scrapers/bots** (testado 2026-08-31: `read_url`/curl directos falham; via proxy de leitura funciona). Precisa de UA de browser e talvez retry; **não** há API JSON documentada.
- **Observação importante da amostra (31/08/2026)**: dos **18 avisos em vigor, TODOS são Mediterrâneo / Mar Negro** — **nenhum no Atlântico NW** nesse dia. Os avisos da costa NW (Galiza/Rías) aparecem nesta lista quando existirem, mas a lista não é «costeira» por omissão: é preciso filtrar por `General Area` (ex. `ATLANTIC`, `NW SPAIN`, `GALICIA`, `FINISTERRE`).

### B) Buscador de Avisos (GAN — «Grupo de Avisos a los Navegantes») — backend JSON/XML, mas JS-driven

- **URL**: `https://armada.defensa.gob.es/ihm/Aplicaciones/Avisos/Index_GAN_xml.html` (v2, busca JSON) · `…/Index_GAN_v1.html` (v1, «Carga XML»)
- **Formato**: app de busca com separadores («Grupo en vigor», «Correcciones al Catálogo», «Búsqueda por Carta», …) — os dados carregam **via XHR** (v1 carrega XML; v2 JSON). A lista vazia sem JS (`read_url` devolve só o shell).
- **Categoria**: são os **avisos semanais de correcção de cartas** (Preliminares P / Temporales T / generales G / permanentes) — **não** avisos de perigo em vigor. Relevantes como fonte secundária de «avisos a los navegantes», mas **provavelmente não** a categoria que queremos na linha de segurança do spot.
- **Para usar**: é preciso **reversar o endpoint XHR** (inspecionar o tráfego do browser; o v1 aponta para um ficheiro XML em `Aplicaciones/Avisos/`).

### C) NAVTEX (Coruña `[D]`, 518 kHz) — sem feed oficial de texto online

- O IHM **não publica um feed de texto online dos boletins NAVTEX**.
- A **WWMIWS** (`https://wwmiws.wmo.int/index.php/metareas/affiche/2`) retransmite os **boletins METAREA II** (meteorológicos — Coruña, Monsanto, Tarifa, …), confirmando que a estação de Coruña está ativa — mas são **previsões**, não avisos de navegação.
- Streams NAVTEX de terceiros (SDR/agregadores) existem mas **não são autoritativos** nem estruturados — descartados para produção.

## 3. Plano de integração (se a API GeoJSON não aparecer)

O código já está preparado para `ES_NAV_WARNINGS_URL` (GeoJSON, mesmo shape do IH).
Para o fallback de **texto**, o passo natural é:

1. **Parser de tabela HTML** (fonte A) em `scripts/lib/ihCoastalWarnings.js`:
   `fetchEsNavWarningsFromHtml()` — pede a página NAVAREA III (UA de browser,
   retry 2×), extrai as linhas da tabela e normaliza para o shape ES existente:
   - `ref` ← `Number` (ex. `0129/2026`);
   - `category` ← `Subject`;
   - `url` ← página + anchor;
   - `source: 'es'`, **`polygons: []`** (sem geometria).
2. **Cobertura por heurística de texto** em vez de point-in-polygon:
   - filtro por `General Area` (Atlântico NW / Galicia / Cantábrico / Estrecho) +
     keywords do `Subject`; coordenadas do detalhe (quando o visor as tiver) para
     o `warningCoversSpot` atual.
   - a secção (`CoastalNavWarnings`) mostra o **bloco ES só-texto** (sem overlay
     no mapa — `data-coastal-polygons` não dispara sem polígonos).
3. **Degradação** igual à atual: parser falhar ou lista sem avisos relevantes →
   `es:[]` + log, `exit 0` (nunca bloqueia a pipeline).
4. **Attribution**: NAVTEX/NAVAREA é informação de segurança para navegantes
   (reprodução livre com fonte) — manter «IHM / Armada · Avisos a los
   navegantes» no rodapé da secção, como já está.

## 4. Passos seguintes (verificação pendente)

- [ ] Reversar o XHR do Buscador GAN (fonte B) — se devolver JSON com coordenadas, é melhor que a tabela NAVAREA.
- [ ] Confirmar se o texto completo do aviso NAVAREA (visor `#divVisorNavarea`) inclui coordenadas parseáveis.
- [ ] Medir a cadência de atualização da lista NAVAREA (a amostra de hoje não tem avisos Atlântico — validar com um dia em que existam).
- [ ] Decidir o gate: NAVAREA III é *global espanhol* (Med incluído) — filtrar sempre por área antes de anexar a spots PT.

## 5. Ligações no repo

- `scripts/lib/ihCoastalWarnings.js` — `fetchEsNavWarnings` (GeoJSON, env `ES_NAV_WARNINGS_URL`) + nota de investigação anterior.
- `scripts/fetch-ih-coastal-warnings.js` — grava `ih-coastal-warnings.json` (warnings + coverage + `es`).
- `src/components/spots/CoastalNavWarnings.tsx` — sub-bloco «Avisos a los navegantes (ES, cross-border)».
- `docs/ROADMAP.md` (2026-08-31) — nota de sessão original.
