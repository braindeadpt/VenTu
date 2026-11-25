import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guarda de voz PT-PT (issue #463, fatia A): o catálogo de spots, as tips
 * locais e o shell de traduções pt são a superfície onde calques do
 * português do Brasil entravam disfarçados de copy — «Salva-vidas»,
 * «gerenciáveis», «estar logado», «(clique para …)», «câmera», «você»,
 * «usuário». Uma vez corrigidos, este teste falha se o padrão voltar.
 *
 * Âmbito deliberado: SÓ os três ficheiros varridos abaixo. Não cobre
 * comentários de código noutros sítios (o «clique» de identificadores e
 * comentários em componentes não é copy de produto) nem os shells en/es/de/fr.
 *
 * Nota de implementação: os padrões NÃO usam \b — em JS \b é ASCII e «ê»,
 * «â», «ú» são não-palavra, por isso /\bvocê\b/i nunca casaria «você»
 * seguido de pontuação ou fim de linha (falso negativo total). Em vez disso
 * usa-se lookaround com \p{L} (letras Unicode), que delimita a palavra
 * independentemente dos acentos. Se aparecer um falso positivo legítimo
 * (ex.: aspas de diálogo a citar o termo), afina o padrão ou justifica uma
 * excepção por regra — nunca alargues o âmbito a mais ficheiros sem rever
 * a lista aqui.
 */
const ROOT = join(__dirname, '..', '..', '..');

const SCANNED_FILES = [
  'src/lib/translations/pt.ts',
  'src/lib/spots.json',
  'src/lib/spotTips.ts',
] as const;

interface ForbiddenPattern {
  /** Nome legível da regra, usado na mensagem de falha. */
  rule: string;
  pattern: RegExp;
}

const FORBIDDEN: readonly ForbiddenPattern[] = [
  {
    rule: '«você» — a voz do produto fala em «tu»',
    pattern: /(?<!\p{L})você(?!\p{L})/iu,
  },
  {
    rule: '«usuári-» — PT-PT prefere «utilizador»',
    pattern: /usuári/iu,
  },
  {
    rule: '«gerenciáv-» — PT-PT é «gerível»',
    pattern: /gerenciáv/iu,
  },
  {
    // «salva-vidas» e a variante colada «salvavidas» são o mesmo calque;
    // o canónico do catálogo é a facility «Nadador-salvador».
    rule: '«salva-vidas» — PT-PT é «nadador-salvador»',
    pattern: /(?<!\p{L})salva-?vidas(?!\p{L})/iu,
  },
  {
    // logado/logada/logados/logadas — PT-PT descreve o estado como
    // «sessão iniciada»; a família inteira é o mesmo calque.
    rule: '«logad-» — PT-PT é «sessão iniciada»',
    pattern: /(?<!\p{L})logad[oa]s?(?!\p{L})/iu,
  },
  {
    // câmetro/câmera/câmeras — PT-PT é «câmara» (a ordem das vogais
    // difere, por isso o padrão não apanha a forma correcta).
    rule: '«câmera» — PT-PT é «câmara»',
    pattern: /(?<!\p{L})câmeras?(?!\p{L})/iu,
  },
];

describe('voz PT-PT — sem calques do português do Brasil', () => {
  it.each(SCANNED_FILES)('%s não contém padrões proibidos', (relPath) => {
    const text = readFileSync(join(ROOT, relPath), 'utf-8');
    const violations: string[] = [];

    text.split('\n').forEach((line, idx) => {
      for (const { rule, pattern } of FORBIDDEN) {
        if (pattern.test(line)) {
          violations.push(`${relPath}:${idx + 1} — ${rule}\n    ${line.trim()}`);
        }
      }
    });

    expect(
      violations,
      `Padrões de português do Brasil de volta à copy PT:\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
