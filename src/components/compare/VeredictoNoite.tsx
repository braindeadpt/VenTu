/**
 * Cabeçalho do comparador de noite (opção A, 28/10): sem «Vencedor» pelo «0».
 * «Amanhã ganha <spot>» (a melhor próxima janela nas 24 h seguintes) ou
 * «Ninguém com janela boa nas próximas 24 horas». A janela fica no cartão do
 * spot (a nota aparece uma só vez).
 */
import { getTranslation } from '@/lib/i18n';
import Skeleton from '@/components/ui/Skeleton';
import { PilulaNoite } from '@/components/ui/NoiteJanela';

export default function VeredictoNoite({
  locale,
  pronto,
  vencedor,
  segundo,
}: {
  locale: string;
  /** As janelas já chegaram (antes disso, um esqueleto — nunca «ninguém» à espera do forecast). */
  pronto: boolean;
  vencedor: { slug: string; nome: string } | null;
  /** O segundo com janela nas 24 h («à frente de …»). */
  segundo: string | null;
}) {
  const tn = getTranslation(locale).noite;
  return (
    <div className="card-1 p-6 text-center border border-divider" data-compare-noite="">
      <PilulaNoite locale={locale} />
      {!pronto ? (
        <Skeleton className="h-16 mt-4 rounded-card" />
      ) : vencedor ? (
        <>
          <h2 className="text-h2 text-fg mt-3" data-compare-ganha={vencedor.slug}>
            {tn.ganhaAmanha.replace('{spot}', vencedor.nome)}
          </h2>
          <p className="text-fg-muted mt-1">
            {segundo ? tn.ganhaAmanhaSubVs.replace('{spot}', segundo) : tn.ganhaAmanhaSub}
          </p>
        </>
      ) : (
        <>
          <h2 className="text-h2 text-fg mt-3" data-compare-ninguem="">
            {tn.ninguem24h}
          </h2>
          <p className="text-fg-muted mt-1">{tn.ninguemSub}</p>
        </>
      )}
    </div>
  );
}
