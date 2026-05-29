import { Space_Grotesk } from 'next/font/google';

/** Display / headlines — self-hosted via next/font (no runtime CDN). */
export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '700'],
});
