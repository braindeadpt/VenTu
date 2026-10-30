/**
 * Crédito de uma fotografia (#184): «Foto: Nome / Unsplash», com ligação ao
 * perfil e à página da foto (`utm_source=ventu&utm_medium=referral`); no
 * Commons, a licença exacta (CC BY-SA 3.0). Nas substitutas junta-se o sítio
 * real («· Sines»): nunca se mostra outro sítio como se fosse o spot.
 *
 * No telemóvel (< 640 px) a linha de texto tapava a foto: passa a uma pílula
 * «©» (`<details>`, sem JS) que abre o mesmo crédito, com as mesmas ligações,
 * ancorado ao mesmo canto. O CSS mostra só um dos dois (o outro fica com
 * `display:none`, fora da árvore de acessibilidade); ≥ 640 px fica o `<p>` de
 * sempre, intocado.
 */
import type { FotoSpot } from '@/lib/spotFotos';

const autorDe = (f: FotoSpot) => f.autor.replace(/ from .*/, '');

function Linha({ foto, rotulo }: { foto: FotoSpot; rotulo: string }) {
  const ondeTxt = foto.estado === 'sub' || foto.estado === 'zona' ? ` · ${foto.onde}` : '';
  return (
    <>
      {rotulo}:{' '}
      <a href={foto.perfil} target="_blank" rel="noopener noreferrer">
        {autorDe(foto)}
      </a>{' '}
      /{' '}
      <a href={foto.pagina} target="_blank" rel="noopener noreferrer">
        {foto.fonte === 'Unsplash' ? 'Unsplash' : `Commons, ${foto.lic}`}
      </a>
      {ondeTxt}
    </>
  );
}

export default function FotoCredito({ foto, rotulo, className }: { foto: FotoSpot; rotulo: string; className?: string }) {
  return (
    <>
      <p className={`credito-foto${className ? ' ' + className : ''}`} data-testid="foto-credito" data-estado={foto.estado}>
        <Linha foto={foto} rotulo={rotulo} />
      </p>
      <details className="credito-pilula" data-testid="foto-credito-m" data-estado={foto.estado}>
        <summary aria-label={`${rotulo}: ${autorDe(foto)}`}>
          <span aria-hidden="true">©</span>
        </summary>
        <p>
          <Linha foto={foto} rotulo={rotulo} />
        </p>
      </details>
    </>
  );
}
