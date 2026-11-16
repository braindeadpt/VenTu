import localFont from 'next/font/local';

/**
 * Display / headlines — Space Grotesk (SIL OFL 1.1, ver `space-grotesk/OFL.txt`).
 *
 * Os três ficheiros são os **mesmos bytes** que o `next/font/google` servia
 * (`spacegrotesk/v22`, subset `latin` — `subsets: ['latin']` era o que estava
 * configurado): 500, 600 e 700, as três faces discretas que o site usava.
 *
 * Porque não o woff2 variável: as baselines do gate de píxeis foram gravadas em
 * Linux com estes ficheiros, e a instância `wght 700` do variável não é
 * pixel-idêntica a eles naquele motor — os contornos batem, mas o avanço
 * acumulado (hinting/arredondamento) sai ~5 px mais estreito numa linha de
 * 40 px. Isso bastou para virar uma quebra de linha: «Calculadora de kite»
 * precisa de 353,2 px numa caixa de 358 px, e no variável cabia numa linha onde
 * antes partia em duas — −44 px (uma line-height) em `/calculadora-kite/` e
 * −52 px em `/diretorio/`. Vendorizar os estáticos elimina essa diferença na
 * origem em vez de reescrever as baselines para acomodar o desenho novo.
 *
 * Esteve em `next/font/google`, que descarrega os ficheiros durante o
 * `next build` e falhava o step Build de forma aleatória (`next/font/google
 * queries have exactly one entry`) — cada falha bloqueava o deploy da main. Com
 * `next/font/local` o build não faz nenhum pedido à rede; o next continua a
 * gerar o `@font-face`, a métrica de fallback e o preload como antes.
 *
 * Actualizar a fonte no futuro é substituir estes três ficheiros (e as
 * baselines do gate, num commit deliberado).
 */
export const spaceGrotesk = localFont({
  src: [
    { path: './space-grotesk/SpaceGrotesk-500.woff2', weight: '500', style: 'normal' },
    { path: './space-grotesk/SpaceGrotesk-600.woff2', weight: '600', style: 'normal' },
    { path: './space-grotesk/SpaceGrotesk-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});
