import localFont from 'next/font/local';

/**
 * Display / headlines — Space Grotesk (SIL OFL 1.1, ver `space-grotesk/OFL.txt`).
 *
 * O ficheiro é o woff2 variável (wght 300–700) vendorizado em
 * `space-grotesk/SpaceGrotesk-wght.woff2`, com os mesmos glifos que o Google
 * servia (latin + latin-ext + vietnamese, fontRevision 2.0).
 *
 * Esteve em `next/font/google`, que descarrega o ficheiro durante o `next build`
 * e falhava o step Build de forma aleatória (`next/font/google queries have
 * exactly one entry`) — cada falha bloqueava o deploy da main. Com
 * `next/font/local` o build não faz nenhum pedido à rede; o next continua a
 * gerar o `@font-face`, a métrica de fallback e o preload como antes.
 */
export const spaceGrotesk = localFont({
  src: './space-grotesk/SpaceGrotesk-wght.woff2',
  weight: '300 700',
  style: 'normal',
  variable: '--font-display',
  display: 'swap',
});
