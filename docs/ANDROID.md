# VenTu Android — TWA (Play Store)

VenTu é uma PWA (`public/manifest.json`); a app Android é uma
**Trusted Web Activity** gerada com Bubblewrap — o mesmo modelo da
app OficinaOS Trade (`app.oficinaos.trade.twa`). A TWA corre o site
full-screen sem barra de browser, com ícone próprio e splash.

| Decisão | Valor |
|---|---|
| Package ID | `surf.ventu.twa` (imutável após publicar) |
| Host TWA | `ventu.surf` |
| App name | `VenTu` |
| Ícone | `https://ventu.surf/icon-512.png` |
| Maskable | `https://ventu.surf/icon-maskable-512.png` |
| Launch | `https://ventu.surf/pt/` (start_url do manifest) |
| Geolocalização | **sim** — o botão «localizar» do mapa precisa de `ACCESS_FINE_LOCATION` |
| Notificações | não (ainda não há web push na PWA) |

## Estado actual

- ✅ Manifest válido e instalável (testado: Chrome «Add to Home screen»)
- ✅ Ícones PNG reais gerados no build (`scripts/generate-favicons.mjs`):
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (safe zone 62%)
- ✅ Screenshots Play Store reais: `tmp-device-test/revyl/*.png` (1080×2400)
- ✅ Keystore de upload: `E:\ventu-android\ventu-upload.keystore` (alias `ventu`,
  RSA 2048, password em `keystore-password.txt` ao lado — **backup offline dos dois**)
- ✅ `public/.well-known/assetlinks.json` com o SHA256 do upload key
  (se usares Play App Signing, junta o fingerprint de *App integrity*)
- ✅ Página de privacidade: `/{pt,en,es,de,fr}/privacidade/` + link no footer
- ✅ Conta Google Play Console criada
- ✅ JDK 17 instalado (`C:\Program Files\Eclipse Adoptium\jdk-17.0.21.10002-hotspot`)
- ⬜ Projeto `android/` — gerar com Bubblewrap **ou** PWABuilder.com
  (o SDK ~1.5GB só é preciso para builds locais; o PWABuilder gera o pacote
  online e assina com o keystore de E:)

## Pipeline

### 1. Toolchain (uma vez por máquina)

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
# Android SDK cmdline-tools: https://developer.android.com/studio#command-tools
# ou Android Studio → SDK Manager (platform-tools + platform android-36 + build-tools)
npm i -g @bubblewrap/cli
bubblewrap doctor   # confirma JDK + SDK
```

### 2. Gerar o projeto Android

```bash
bubblewrap init --manifest https://ventu.surf/manifest.json
# Package ID:   surf.ventu.twa
# App name:     VenTu
# Host:         ventu.surf
# Launch URL:   https://ventu.surf/pt/
# Icon:         https://ventu.surf/icon-512.png
# Maskable:     https://ventu.surf/icon-maskable-512.png
# Geolocation:  yes  (botão «localizar» do mapa)
# Notifications: no
cd android/  # o bubblewrap cria a pasta com gradle project + twa-manifest.json
```

### 3. Keystore + assetlinks (Digital Asset Links)

```bash
# UMA VEZ — guardar fora do repo (passwords seguras, backup offline!)
keytool -genkeypair -v -keystore ventu-upload.keystore -alias ventu \
  -keyalg RSA -keysize 2048 -validity 10000

# SHA256 para o assetlinks:
keytool -list -v -keystore ventu-upload.keystore -alias ventu | grep SHA256
```

`public/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "surf.ventu.twa",
    "sha256_cert_fingerprints": ["AA:BB:...:FF"]
  }
}]
```

> Se usares **Play App Signing** (recomendado): a Google volta a assinar com
> o certificado dela — depois do primeiro upload, copia o fingerprint de
> *Play Console → Setup → App integrity* para o assetlinks (podem coexistir
> os dois fingerprints no array). Sem isto a TWA mostra a barra de URL.
>
> ⚠️ **GitHub Pages + dotfiles:** o `upload-pages-artifact` (v4+) exclui
> ficheiros pastas que começam por `.` por defeito — sem
> `include-hidden-files: true` no `deploy.yml` o assetlinks fica no repo mas
> responde 404 em produção e a TWA abre com barra de URL. O guard
> `scripts/check-security-headers.sh` valida isto após cada deploy.

### 4. Build

```bash
cd android
bubblewrap build          # gera app-release-signed.apk + app-release-bundle.aab
# ou ./gradlew bundleRelease
```

O **AAB** é o que se sobe para a Play Store; o **APK** serve para testar.

### 5. Testar

```bash
# Dispositivo real via adb:
adb install app-release-signed.apk

# Revyl cloud device:
revyl device install --app app-release-signed.apk
revyl device launch
```

Checklist de teste TWA: abre sem barra de URL (assetlinks OK) ·
geolocalização no mapa · login Supabase magic link · offline/SW ·
links externos (Fontes, GitHub) abrem fora da TWA.

### 6. Play Console

1. Criar conta ($25) em play.google.com/console
2. Nova app → nome «VenTu», app gratuita, categoria *Sports* ou *Weather*
3. **Privacy policy URL** — criar a página primeiro (ver estado acima)
4. Store listing: ícone 512 (`icon-maskable-512.png` é full-bleed),
   feature graphic 1024×500, ≥2 screenshots telemóvel (temos 4 reais em
   `tmp-device-test/revyl/`), descrição curta+longa (reusar copy do manifest)
5. Content rating (questionário IARC) — meteorologia/desporto, sem conteúdo sensível
6. Data safety — declarar: geolocalização (aproximada), email (auth Supabase),
   analytics anonimizados (GoatCounter)
7. Release → Internal testing → AAB → validar → Production

## Notas

- A TWA herda tudo da PWA: SW/offline, i18n, auth — não há código nativo extra.
- Atualizações da app raramente precisam de rebuild: o site muda, a TWA segue.
  Rebuild só para mudar package/name/icons/scopes de permissões.
- `versionCode` tem de subir a cada upload na Play Console
  (`app/build.gradle` → `versionCode`/`versionName`).
