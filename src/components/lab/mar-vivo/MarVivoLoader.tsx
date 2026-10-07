'use client';

/**
 * Fronteira cliente do lab «Mar vivo». O mapa (maplibre-gl + shaders) vem num
 * chunk à parte via `next/dynamic` sem SSR — nenhuma outra rota o carrega.
 */
import dynamic from 'next/dynamic';
import type { MarVivoMapProps } from './MarVivoMap';
import { marVivoStrings } from './strings';

function Placeholder({ locale }: { locale: string }) {
  const s = marVivoStrings(locale);
  return (
    <section
      className="relative grid w-full place-items-center bg-[#0a1828]"
      style={{ height: 'calc(100svh - 4rem)', minHeight: 520 }}
      aria-busy="true"
    >
      <p role="status" className="text-sm text-slate-300">
        {s.loading}
      </p>
    </section>
  );
}

const MarVivoMap = dynamic(() => import('./MarVivoMap'), {
  ssr: false,
  loading: () => <Placeholder locale="pt" />,
});

export default function MarVivoLoader(props: MarVivoMapProps) {
  return <MarVivoMap {...props} />;
}
