## O que muda

<!-- Uma frase clara. Problema → solução. Liga a issue se existir: "Fecha #123". -->

## Como testar

<!-- Passos para reproduzir/verificar. URLs, comandos, dados. -->

## Checklist

- [ ] `npx tsc --noEmit` e `npm run lint` limpos
- [ ] `npm test` verde (e `npm run test:guard-counts` se mexi em guardas)
- [ ] E2E da superfície tocada: `npm run test:e2e:core` (scores/mapa/spots) ou o spec específico
- [ ] Se muda visuais: correr **Record Visual Baselines** (`workflow_dispatch`) e commitar as PNG do Linux
- [ ] Se mexe em `public/data`/`scripts/`: `npm run data:validate` e `npm run spots:validate`
- [ ] Strings novas em `pt` **e** `en` (i18n); sem chaves mortas
- [ ] `docs/`/`README` actualizados quando o contrato mudou
- [ ] Sem segredos, tokens ou `.env*` no diff

## Notas para quem revê

<!-- Riscos, trade-offs, capturas, migrações manuais (SQL, DNS, secrets). -->
