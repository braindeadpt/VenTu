import { locales } from '@/lib/i18n'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import WetsuitCalculatorClient from '@/components/tools/WetsuitCalculatorClient'

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
      ? 'Calculadora de fato de neoprene — VenTu'
      : 'Wetsuit thickness calculator — VenTu',
    description: isPt
      ? 'Que fato de neoprene levar? Espessura recomendada pela temperatura real da água em 185 spots portugueses, com botas, luvas e capuz quando é preciso.'
      : 'Which wetsuit should you wear? Recommended thickness from live water temperature at 185 Portuguese spots, with boots, gloves and hood when needed.',
  }
}

export default async function CalculadoraFatoPage({ params }: Props) {
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
            {isPt ? 'Calculadora de fato' : 'Wetsuit calculator'}
          </h1>
          <p className="text-fg-muted mt-2">
            {isPt
              ? 'A espessura certa depende da água, não do ar. Escolhe um spot para usar a temperatura real, ou define-a à mão.'
              : 'The right thickness depends on the water, not the air. Pick a spot to use the live temperature, or set it manually.'}
          </p>
        </div>

        <WetsuitCalculatorClient locale={locale} />

        <section className="space-y-3 text-body-sm text-fg-muted">
          <h2 className="font-display text-h3 text-fg font-semibold">
            {isPt ? 'A água em Portugal' : 'Portuguese water'}
          </h2>
          <p>
            {isPt
              ? 'A costa oeste raramente sai dos 14–19°C — o 3/2 no verão e o 4/3 no inverno cobrem a maioria das sessões. O Algarve chega aos 21–22°C no fim do verão; o Norte cai aos 13–14°C em março, o mês mais frio da água (não janeiro — o mar atrasa-se dois meses em relação ao ar).'
              : 'The west coast rarely leaves 14–19°C — a 3/2 in summer and a 4/3 in winter cover most sessions. The Algarve reaches 21–22°C in late summer; the North drops to 13–14°C in March, the coldest water month (not January — the sea lags the air by about two months).'}
          </p>
          <p>
            {isPt
              ? 'O vento rouba mais calor do que a água: num dia de nortada, veste como se a água estivesse 1–2°C mais fria.'
              : 'Wind steals more heat than the water does: on a windy day, dress as if the water were 1–2°C colder.'}
          </p>
        </section>
      </div>
    </div>
  )
}
