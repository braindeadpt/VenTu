/**
 * Crédito de uma fotografia (#184): «Foto: Nome / Unsplash», com ligação ao
 * perfil e à página da foto (`utm_source=ventu&utm_medium=referral`); no
 * Commons, a licença exacta (CC BY-SA 3.0). Nas substitutas junta-se o sítio
 * real («· Sines»): nunca se mostra outro sítio como se fosse o spot.
 */
import type { FotoSpot } from '@/lib/spotFotos';

const autorDe = (f: FotoSpot) => f.autor.replace(/ from .*/, '');

export default function FotoCredito({ foto, rotulo, className }: { foto: FotoSpot; rotulo: string; className?: string }) {
  const ondeTxt = foto.estado === 'sub' || foto.estado === 'zona' ? ` · ${foto.onde}` : '';
  return (
    <p className={`credito-foto${className ? ' ' + className : ''}`} data-testid="foto-credito" data-estado={foto.estado}>
      {rotulo}:{' '}
      <a href={foto.perfil} target="_blank" rel="noopener noreferrer">
        {autorDe(foto)}
      </a>{' '}
      /{' '}
      <a href={foto.pagina} target="_blank" rel="noopener noreferrer">
        {foto.fonte === 'Unsplash' ? 'Unsplash' : `Commons, ${foto.lic}`}
      </a>
      {ondeTxt}
    </p>
  );
}
