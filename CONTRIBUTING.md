# 🤙 Contribuir para VenTu Portugal

Obrigado por quereres ajudar! Este projeto é **open-source** e feito por surfistas, para surfistas. Toda a ajuda é bem-vinda!

## 🎯 Como Contribuir

### 1. Adicionar um Spot Novo

O modo mais fácil de contribuir é adicionar spots que conheces!

#### Dados necessários:
```typescript
{
  id: 'nome-do-spot',
  slug: 'nome-do-spot',
  name: 'Nome do Spot',
  nameEn: 'Spot Name',
  region: 'Região',
  regionEn: 'Region',
  lat: 38.000,      // latitude
  lon: -8.000,      // longitude
  type: 'surf',     // surf | kitesurf | windsurf | big-wave | foil | wakeboard | multisport
  difficulty: 'intermediate', // beginner | intermediate | advanced | expert | all
  bestWind: 'N, NW',
  bestSwell: 'SW, W',
  description: 'Descrição em PT do spot. O que faz dele especial?',
  descriptionEn: 'Description in EN. What makes it special?',
  facilities: ['Estacionamento', 'Escola surf', 'Restaurante'],
  hazards: ['Rochas', 'Correntes'],
  // Opcional:
  localSecret: true,
  secretLevel: 'semi-secret', // known | semi-secret | secret | deep-secret
  blueFlag: true,
  accessibleBeach: false,
}
```

#### Para adicionar:
1. Faz fork do repositório
2. Edita `src/lib/spots.ts`
3. Adiciona o spot na secção correta (Norte, Centro, Lisboa, Oeste, Algarve, Alentejo, Açores, Madeira)
4. Abre um Pull Request com `[Spot] Nome do Spot — Região`

### 2. Adicionar Webcams Open Source

As webcams comerciais (Beachcam MEO, Nazaré Waves) **não funcionam** em embeds. Mas se conheceres uma webcam que:
- Permite iframe embed
- Tem URL pública de stream
- É open-source ou permissiva

Adiciona em `src/lib/spots.ts` no campo `webcamUrl`!

**Formato aceite:**
- Iframe embed URL (`https://example.com/embed/cam`)
- YouTube Live URL
- HLS stream URL (`.m3u8`)

**NÃO aceite:**
- Blob URLs (nazarewaves.com)
- URLs com proteção CloudFront (beachcam.meo.pt)
- URLs que requerem login/autenticação

### 3. Corrigir Dados de um Spot

Se um spot tem info errada (coordenadas, dificuldade, vento ideal...):
1. Abre uma Issue com label `[Correction] Nome do Spot`
2. Explica o que está errado e qual a correção
3. Se quiseres, abre um PR com a correção

### 4. Melhorar o Surfability Score

O algoritmo do Surfability Score está em `src/lib/surfability.ts`. Se tens ideias para melhorar:
- Pesos das variáveis
- Novos fatores (ex: maré, temperatura do ar)
- Correções para tipos específicos de spots

Abre uma Issue com label `[Algorithm] Nome da sugestão`!

### 5. Traduções

Se quiseres adicionar um novo idioma (ex: FR, DE, ES):
1. Adiciona o locale em `src/lib/i18n.ts`
2. Traduz todas as strings
3. Abre um PR com `[Translation] Idioma`

## 🏷️ Labels de Issues

Usa estas labels quando abrires issues:

| Label | Uso |
|-------|-----|
| `[Spot]` | Adicionar novo spot |
| `[Correction]` | Corrigir dados existentes |
| `[Webcam]` | Adicionar webcam open source |
| `[Algorithm]` | Melhorar Surfability Score |
| `[Translation]` | Novo idioma |
| `[Bug]` | Bug report |
| `[Feature]` | Nova funcionalidade |

## 🧪 Testar antes de submeter

```bash
# Instalar dependências
npm install

# Build (verifica se compila)
npm run build

# Verifica se o SpotCard mostra o score corretamente
# E se a frontpage mostra o novo spot no mapa
```

## 📝 Checklist de PR

Antes de submeter um PR:
- [ ] O spot tem coordenadas corretas (verifica no Google Maps)
- [ ] A descrição é honesta e útil (não marketing)
- [ ] Os hazards estão completos (segurança primeiro!)
- [ ] O build passa (`npm run build`)
- [ ] Se é spot secreto, marca `localSecret: true`

## 💬 Comunidade

- Discute ideias nas Issues
- Partilha spots nos PRs
- Respeita os locais — spots secretos são secretos por uma razão 🤫

## 🌊 Filosofia

> "Feito por locals, para locals. Informação honesta, sem filtros."

Não façamos disto um clone do Beachcam. Vamos criar algo que os surfistas portugueses realmente precisam!

---

**Vamos lá!** 🤙 Abre uma Issue ou PR e contribui!
