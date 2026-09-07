import { HERO_BATHYMETRY } from '@/lib/generated/heroBathymetry';
import { cn } from '@/lib/cn';

/**
 * Textura batimétrica do hero — as isóbatas reais do IH (8/16/30 m) ao largo
 * da costa portuguesa, desenhadas por trás da copy.
 *
 * PORQUÊ ISTO E NÃO UMA FOTO: o hero não tinha atmosfera nenhuma — metade
 * esquerda era um bloco chapado de `--bg-base` (branco puro no tema claro).
 * A resposta óbvia seria uma imagem ou um vídeo; ambos custam bytes no
 * caminho do LCP, e um vídeo gerado seria decoração inventada num produto
 * cujo valor inteiro é não inventar nada.
 *
 * Estas linhas são dados: a mesma camada do IH que o mapa desenha e que o
 * `IsobathsStrip` lê. Vêm baked em ~7 KB dentro do bundle (ver
 * scripts/generate-hero-bathymetry.mjs), portanto zero pedidos de rede, zero
 * imagem a competir com o LCP, e o desenho é vector — nítido em qualquer
 * densidade de ecrã e tingido pelos tokens do tema, logo correcto nos dois.
 *
 * Profundidade lida como profundidade: a isóbata dos 8 m (a mais perto da
 * praia) é a mais presente; a dos 30 m afunda-se no fundo. A ordem de desenho
 * é a inversa da leitura, para que as linhas rasas fiquem por cima.
 */
/**
 * Troço mostrado: a costa sul, de Sagres ao Guadiana (lat 36.9–37.5,
 * lon -9.14 a -7.22).
 *
 * A escolha é de composição, não de estética inventada: das faixas todas, é a
 * que tem mais estrutura de contorno (76 vértices contra ~40 das seguintes) e
 * é a única que corre mesmo de nascente a poente — logo desenha linhas largas
 * a atravessar o hero em vez do rabisco quase vertical que a costa oeste dá
 * nesta proporção. Continua a ser batimetria real, no sítio real; só está
 * enquadrada onde tem alguma coisa para mostrar.
 */
const WINDOW = { x: 180, y: 2380, width: 820, height: 334 } as const;

export default function HeroBathymetry({ className }: { className?: string }) {
  /** Mais raso = mais presente. */
  const depthStyle: Record<number, { opacity: number; width: number }> = {
    30: { opacity: 0.30, width: 1.5 },
    16: { opacity: 0.45, width: 1.8 },
    8: { opacity: 0.7, width: 2.2 },
  };

  return (
    <div
      aria-hidden
      data-hero-bathymetry
      className={cn(
        // Só onde existe o wash chapado: a partir de `md` o mapa vive à
        // direita e a esquerda é fundo liso. No telemóvel o mapa ocupa a
        // largura toda — a textura ficaria POR CIMA dos tiles, a esconder a
        // única coisa que ali interessa. Mesma fronteira do scrim lateral.
        'pointer-events-none absolute inset-0 hidden overflow-hidden md:block',
        className,
      )}
    >
      <svg
        className="hero-bathymetry-svg absolute inset-0 h-full w-full text-accent"
        viewBox={`${WINDOW.x} ${WINDOW.y} ${WINDOW.width} ${WINDOW.height}`}
        // `slice` recorta: queremos o detalhe de uma carta a varrer o fundo,
        // não um mapinha de Portugal inteiro espremido no canto.
        preserveAspectRatio="xMinYMid slice"
        fill="none"
        focusable="false"
      >
        {[...HERO_BATHYMETRY]
          .sort((a, b) => b.depth - a.depth)
          .map((layer) => {
            const style = depthStyle[layer.depth] ?? { opacity: 0.25, width: 1.6 };
            return (
              <g
                key={layer.depth}
                stroke="currentColor"
                strokeWidth={style.width}
                strokeOpacity={style.opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
                // A linha dos 8 m «corre» devagar, como uma sonda a percorrer
                // o contorno. Só uma camada tem movimento: três seriam ruído.
                className={layer.depth === 8 ? 'hero-bathymetry-survey' : undefined}
              >
                {layer.paths.map((d, i) => (
                  <path key={i} d={d} />
                ))}
              </g>
            );
          })}

        {/* Sonda: um traço curto a correr ao longo da isóbata dos 8 m. É uma
            SEGUNDA passagem sobre os mesmos caminhos — pôr o tracejado na
            camada de base apagaria o contorno que queremos mais presente. */}
        <g
          className="hero-bathymetry-survey"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          fill="none"
        >
          {(HERO_BATHYMETRY.find((l) => l.depth === 8)?.paths ?? []).map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>
    </div>
  );
}
