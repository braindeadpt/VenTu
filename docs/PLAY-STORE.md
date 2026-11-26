# VenTu — Materiais Play Store

Copy e respostas prontas para o upload na Play Console da TWA
(`surf.ventu.twa`). Assets em `docs/assets/play-store/`.
Ver `docs/ANDROID.md` para o pipeline técnico completo.

---

## 1. Store listing

### Nome da app
```
VenTu — Condições Náuticas
```
(30 caracteres máx. — temos 28)

### Descrição curta (máx. 80 caracteres)

**PT (pt-PT, default):**
```
Surf, kite e windsurf em Portugal — scores e previsão de 189 spots.
```
(68 caracteres)

**EN:**
```
Surf, kite and windsurf in Portugal — scores and forecasts for 189 spots.
```
(72 caracteres)

### Descrição longa (máx. 4000 caracteres)

**PT (pt-PT, default):**
```
O VenTu diz-te onde está a bombar — antes de saíres de casa.

189 spots em Portugal (continent e ilhas) com nota de 0 a 10 para a tua modalidade: surf, bodyboard, kitesurf, windsurf, wing foil, SUP e wakeboard. A nota é calculada hora a hora a partir de vento, ondulação, maré e corrente — e explicada fator a fator, sem caixas negras.

O QUE TENS NA APP

• Mapa da costa inteira com a nota de cada spot agora e nas próximas 48 horas
• Régua de 48 h por spot: lês a janela certa num relance
• Boia real do Instituto Hidrográfico quando há medição — não só modelo
• Marés, lua, sol, isóbatas, corrente de superfície e avisos IPMA no mesmo ecrã
• Livecams de 114 spots para veres o mar com os teus olhos
• Dawn Patrol: ao amanhecer, o resumo do que vale a pena hoje
• Alertas: marcas os spots favoritos e defines a nota mínima — avisamos quando algum alinha
• Favoritos e passaporte de sessões sincronizados em qualquer dispositivo
• 5 línguas: português, inglês, espanhol, alemão e francês

DADOS EM QUE CONFIAIS

Previsão Open-Meteo (ECMWF, GFS, ICON), observações do Instituto Hidrográfico, avisos oficiais IPMA/MeteoAlarm e qualidade da água APA. As fontes estão todas identificadas na app — é o mar, não é bruxedo.

GRÁTIS E OPEN SOURCE

Sem publicidade, sem subscrições, sem venda de dados. O código é aberto e tu é que mandas: github.com/braindeadpt/VenTu

Feito na costa portuguesa, para quem a lê.
```
(~1750 caracteres)

**EN:**
```
VenTu tells you where it's firing — before you leave the house.

189 spots across Portugal (mainland and islands) with a 0–10 score for your sport: surfing, bodyboarding, kitesurfing, windsurfing, wing foiling, SUP and wakeboarding. The score is computed hour by hour from wind, swell, tide and current — and explained factor by factor, no black boxes.

WHAT'S IN THE APP

• Map of the entire coast with every spot's score now and for the next 48 hours
• 48-hour timeline per spot: read the right window at a glance
• Real buoy data from the Portuguese Hydrographic Institute when measured — not just model output
• Tides, moon, sun, isobaths, surface current and IPMA weather warnings on one screen
• Livecams at 114 spots to see the sea with your own eyes
• Dawn Patrol: at sunrise, the summary of what's worth it today
• Alerts: favorite your spots and set the minimum score — we ping you when one lines up
• Favorites and session passport synced across devices
• 5 languages: Portuguese, English, Spanish, German and French

DATA YOU CAN TRUST

Open-Meteo forecasts (ECMWF, GFS, ICON), Portuguese Hydrographic Institute observations, official IPMA/MeteoAlarm warnings and APA water quality. Every source is credited in the app — it's the ocean, not magic.

FREE AND OPEN SOURCE

No ads, no subscriptions, no data selling. Open code and you're in charge: github.com/braindeadpt/VenTu

Made on the Portuguese coast, for the people who read it.
```

---

## 2. Data safety (Google Play → App content → Data safety)

| Pergunta | Resposta | Nota |
|---|---|---|
| A app recolhe dados? | **Sim** — parcialmente | |
| **Localização** — Localização aproximada | ❌ **Não recolhida** | Usada **apenas no dispositivo** quando o utilizador toca «localizar» — para centrar o mapa e ordenar spots por distância. Nunca transmitida: as previsões meteorológicas usam as coordenadas do **spot**, não a posição do utilizador. Os pedidos de mosaicos de mapa ao ver uma zona (CARTO/Esri CDN) são tráfego padrão de tiles, não ligado à identidade — verificar na revisão final se a Play exige declaração |
| **Informação pessoal** — Endereço de email | ✅ Recolhida · **não partilhada** · opcional | Apenas se o utilizador criar conta (magic link Supabase) para favoritos/alertas/passaporte |
| **Conteúdo do utilizador / Atividade** — Favoritos, check-ins do passaporte, preferências de alertas | ✅ Recolhidos · **não partilhados** · opcionais | Sincronizados na conta Supabase (ligados ao user ID) — só se o utilizador criar conta e usar estas features. Analytics GoatCounter é **anonimizado** (sem cookies, sem fingerprint, sem IP) — não conta como recolha na taxonomia da Play |
| IDs de dispositivo | ❌ Não | |
| Dados encriptados em trânsito? | **Sim** (HTTPS/TLS) | |
| Caminho para apagar dados? | **Sim — self-service** | Eliminação in-app na página Conta (PR #593) + o mesmo fluxo na web. Na ficha de data safety da Play, a pergunta «link web para pedido de eliminação» responde-se com **`https://ventu.surf/pt/conta/`** — mesmo sem sessão iniciada, essa página diz explicitamente que iniciar sessão permite eliminar a conta e os dados (a Google exige que o percurso seja fácil de encontrar, não um sign-in genérico); após login, a opção «Eliminar conta» está na própria página. Ver §5 passo 0 |
| Compromisso com a política de famílias? | Não aplicável — não é dirigida a crianças | |

Privacy policy URL: `https://ventu.surf/pt/privacidade/`

---

## 3. Content rating (questionário IARC)

| Pergunta | Resposta |
|---|---|
| Categoria da app | **Utilidade / Meteorologia / Desporto** |
| Violência, sangue, conteúdo sexual, drogas, linguagem ofensiva, apostas? | **Não** a todas |
| Conteúdo gerado pelo utilizador partilhado com outros? | **Não** — feedback vai para o maintainer, não é público; check-ins são privados |
| Partilha de localização com outros utilizadores? | **Não** |
| Compras dentro da app? | **Não** |
| Publicidade? | **Não** |
| Classificação esperada | **PEGI 3 / Everyone** |

---

## 4. Assets

| Asset | Ficheiro | Estado |
|---|---|---|
| Ícone 512×512 | `public/icon-maskable-512.png` (ou `icon-512.png`) | ✅ |
| Feature graphic 1024×500 | `docs/assets/play-store/feature-graphic.png` | ✅ |
| Screenshots telemóvel (1080×2400) | `s01-home.png` `s02-ventu.png` `s03-spot.png` `s04-mapa.png` | ✅ 4 reais |
| Screenshots TWA Revyl (extra, opcionais) | capturas da sessão de teste TWA 2026-11-25 | disponíveis em `E:/ventu-android/` se quisermos juntar |

> ⚠️ Os screenshots `s01`–`s04` foram capturados antes da unificação v6
> (homepage atual é a superfície `.v6h`). Antes do upload final convém
> recapturar — ver §5. As capturas TWA da sessão Revyl de 2026-11-25
> **já mostram** a UI v6 atual (noite, mapa com pills, spot sheet).

## 5. Checklist de upload (ordem)

0. ⬜ ⚠️ **Pré-production — aplicar o SQL da eliminação de conta no Supabase** (passo manual, SQL Editor do dashboard): a eliminação self-service da #593 só existe em produção depois deste passo — a app/web chamam o RPC `delete_own_account()` e sem ele o fluxo rebenta em runtime. Aplicar por esta ordem **obrigatória** (ver `supabase/README.md`):
   1. `supabase/supabase-admin-helpers.sql`
   2. `supabase/supabase-directory.sql` — reaplicar **mesmo** que já tenha sido aplicado antes: traz o bypass GUC dos protect triggers e a coluna `first_verified_at` (+ backfill)
   3. `supabase/supabase-delete-account.sql` — recusa-se a aplicar em voz alta se o directório estiver desactualizado; se o SQL Editor não mostrar erro, ficou bem
   
   São **duas** obrigações distintas na Play: (a) eliminação iniciada pelo utilizador na app e (b) **link web de eliminação declarado na ficha de data safety** — usar `https://ventu.surf/pt/conta/`, que mesmo sem sessão diz explicitamente que iniciar sessão permite eliminar a conta e os dados. Internal testing pode avançar já; production não
1. ⬜ Play Console → nova app «VenTu» (gratuita, categoria Weather ou Sports)
2. ⬜ Store listing: copy acima (PT default + EN), ícone, feature graphic, screenshots
3. ⬜ Privacy policy URL: `https://ventu.surf/pt/privacidade/`
4. ⬜ Data safety: tabela §2
5. ⬜ Content rating: §3
6. ⬜ Upload `E:/ventu-android/package/VenTu.aab` em **Internal testing**
7. ⬜ Após validar o primeiro upload: copiar fingerprint de *Setup → App integrity* para `public/.well-known/assetlinks.json` (array com **os dois** fingerprints — upload key + Play signing) e fazer deploy
8. ⬜ Testar internal track num device real: abre sem barra de URL, geolocalização, login magic link, offline
9. ⬜ Promover a Production
