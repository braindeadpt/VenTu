import localFont from 'next/font/local';

/**
 * Geist Mono — definida localmente em vez de vir do pacote `geist`.
 *
 * Porquê: o `geist/font/mono` define a fonte com `adjustFontFallback: false`,
 * ou seja o fallback monospace genérico não leva overrides de métricas. Numa
 * página densa em números `font-mono` (o spot: score, vento, ondas, tabela de
 * previsão), o swap da fonte reflui o texto ~3-4px por linha e acumula ~520px
 * até ao fundo da página — a assinatura de CLS ~0.65 a frio documentada em
 * `scripts/run-lighthouse-prod.js` (3/5 corridas no CI de 2026-09-23).
 *
 * Com `adjustFontFallback` (default 'Arial') o Next gera uma família
 * `GeistMono Fallback` com size-ascent/descent/line-gap-override, pelo que a
 * troca deixa de mover o layout. Mesmo ficheiro e mesma variável CSS do pacote
 * (`--font-geist-mono`), por isso nada muda visualmente quando a fonte carrega.
 */
export const geistMono = localFont({
  src: '../../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
  adjustFontFallback: 'Arial',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
});
