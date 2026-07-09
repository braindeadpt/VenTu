import { locales } from '@/lib/i18n'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import KiteCalculatorClient from '@/components/tools/KiteCalculatorClient'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateStaticParams() {
  return locales.map(locale => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const isPt = locale === 'pt'
  return {
    title: isPt
      ? 'Calculadora de tamanho de kite — VenTu'
      : 'Kite size calculator — VenTu',
    description: isPt
      ? 'Que tamanho de kite levar hoje? Calcula pelo teu peso, vento em nós e disciplina (twintip, strapless, foil) — com o vento real de 185 spots portugueses.'
      : 'Which kite size should you rig today? Calculate by weight, wind in knots and discipline (twintip, strapless, foil) — with live wind from 185 Portuguese spots.',
  }
}

export default async function CalculadoraKitePage({ params }: Props) {
  const { locale } = await params
  const isPt = locale === 'pt'

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link
          href={`/${locale}/ferramentas/`}
          className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {isPt ? 'Ferramentas' : 'Tools'}
        </Link>

        <div>
          <h1 className="font-display text-display-lg font-bold text-fg tracking-tight">
            {isPt ? 'Calculadora de kite' : 'Kite size calculator'}
          </h1>
          <p className="text-fg-muted mt-2">
            {isPt
              ? 'O tamanho certo depende do teu peso, do vento e do que vais fazer com ele. Usa o vento real de um spot ou define-o à mão.'
              : 'The right size depends on your weight, the wind and what you ride. Use live wind from a spot or set it manually.'}
          </p>
        </div>

        <KiteCalculatorClient locale={locale} />

        <section className="space-y-3 text-body-sm text-fg-muted">
          <h2 className="font-display text-h3 text-fg font-semibold">
            {isPt ? 'Como funciona' : 'How it works'}
          </h2>
          <p>
            {isPt
              ? 'Usamos a regra prática da indústria: tamanho (m²) ≈ peso (kg) × fator ÷ vento (kt). O fator varia com a disciplina — um twintip usa ~2.2, uma prancha de onda ~1.9 e um foil ~1.4, porque o foil gera muito menos resistência e precisa de muito menos força.'
              : 'We use the industry rule of thumb: size (m²) ≈ weight (kg) × factor ÷ wind (kt). The factor depends on discipline — a twintip uses ~2.2, a surfboard ~1.9 and a foil ~1.4, because the foil creates far less drag and needs far less power.'}
          </p>
          <p>
            {isPt
              ? 'Cada kite tem uma janela de vento — o intervalo em que anda confortável. Se o vento estiver perto do limite da janela, leva também o tamanho vizinho para a praia.'
              : 'Every kite has a wind window — the range where it rides comfortably. If the wind sits near the edge of the window, bring the neighbouring size to the beach too.'}
          </p>
          <p>
            {isPt ? (
              <>
                Não sabes onde está vento hoje?{' '}
                <Link href={`/${locale}/mapa/?sport=kitesurf`} className="text-accent hover:underline">
                  Vê o mapa de kitesurf
                </Link>
                {' '}com o vento em todos os spots.
              </>
            ) : (
              <>
                Not sure where the wind is today?{' '}
                <Link href={`/${locale}/mapa/?sport=kitesurf`} className="text-accent hover:underline">
                  Check the kitesurf map
                </Link>
                {' '}with live wind at every spot.
              </>
            )}
          </p>
        </section>
      </div>
    </div>
  )
}
