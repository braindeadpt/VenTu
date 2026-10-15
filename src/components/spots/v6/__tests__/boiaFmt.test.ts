import { describe, expect, it } from 'vitest';
import { cm5, decimalV6, fmtAgeHours, fmtDistanceKm, horaCurta, idadeLeitura, ihAEnvelhecer, razaoDaFonte, skillSimples } from '../boiaFmt';
import { spotMedeSabe } from '@/lib/translations/spotPage/medeSabe';
import { waveCalibrationTag } from '@/lib/observedWave';

describe('fmtAgeHours (chip IH vs WMO da boia v6)', () => {
  it('formata horas sem zeros à direita', () => {
    expect(fmtAgeHours(1)).toBe('1h');
    expect(fmtAgeHours(1.0)).toBe('1h');
    expect(fmtAgeHours(5.2)).toBe('5.2h');
    expect(fmtAgeHours(0.3)).toBe('0.3h');
    expect(fmtAgeHours(12)).toBe('12h');
  });

  it('devolve n/d para valores inválidos ou negativos', () => {
    expect(fmtAgeHours(null)).toBe('n/d');
    expect(fmtAgeHours(undefined)).toBe('n/d');
    expect(fmtAgeHours(Number.NaN)).toBe('n/d');
    expect(fmtAgeHours(-1)).toBe('n/d');
  });
});

describe('fmtDistanceKm (chip IH vs WMO da boia v6)', () => {
  it('arredonda para km inteiros', () => {
    expect(fmtDistanceKm(56.4)).toBe('56 km');
    expect(fmtDistanceKm(60)).toBe('60 km');
  });

  it('devolve null sem distância', () => {
    expect(fmtDistanceKm(null)).toBeNull();
    expect(fmtDistanceKm(undefined)).toBeNull();
    expect(fmtDistanceKm(Number.NaN)).toBeNull();
    expect(fmtDistanceKm(-3)).toBeNull();
  });
});

describe('waveCalibrationTag (chip compacto cross-border)', () => {
  it('devolve null sem calibração', () => {
    expect(waveCalibrationTag(null, 'pt')).toBeNull();
    expect(waveCalibrationTag({} as never, 'pt')).toBeNull();
    expect(waveCalibrationTag({ calibration: undefined } as never, 'pt')).toBeNull();
  });

  it('formata o rótulo PT com ME e n', () => {
    const tag = waveCalibrationTag(
      {
        waveHeight: 2.4,
        calibration: { me: -0.9, n: 27, from: 'Cabo Silleiro × Faro', rawHeight: 3.3, deltaM: -0.9 },
      } as never,
      'pt',
    );
    expect(tag).not.toBeNull();
    expect(tag!.label).toBe('🔧 ref. PT (-0.9 m · n=27)');
    expect(tag!.title).toContain('ME -0.9 m (n=27)');
    expect(tag!.title).toContain('3.3 m');
    expect(tag!.title).toContain('2.4 m');
  });

  it('usa o rótulo ES×PT genérico quando falta o par e sinal positivo no ME', () => {
    const tag = waveCalibrationTag(
      { calibration: { me: 0.4, n: 5, rawHeight: 1.6, deltaM: 0.4 } } as never,
      'en',
    );
    expect(tag).not.toBeNull();
    expect(tag!.label).toBe('🔧 PT ref (+0.4 m · n=5)');
    expect(tag!.title).toContain('ME +0.4 m (n=5)');
    expect(tag!.title).toContain('height = 1.6 m');
  });

  it('devolve null para ME/n não finitos', () => {
    expect(
      waveCalibrationTag({ calibration: { me: Number.NaN, n: 27 } } as never, 'pt'),
    ).toBeNull();
  });
});

describe('decimalV6 (separador decimal da v6)', () => {
  it('PT troca o ponto entre dígitos por vírgula; EN não mexe', () => {
    expect(decimalV6('medido 2.3 m → 1.4 m (viés -0.9 m, n=4)', 'pt')).toBe('medido 2,3 m → 1,4 m (viés -0,9 m, n=4)');
    expect(decimalV6('measured 2.3 m', 'en')).toBe('measured 2.3 m');
  });

  it('nunca toca em pontos que não são decimais', () => {
    expect(decimalV6('Generated using E.U. Copernicus · CSA92/D.', 'pt')).toBe('Generated using E.U. Copernicus · CSA92/D.');
  });
});

describe('razaoDaFonte / ihAEnvelhecer', () => {
  const tv = {
    reasonNoMeta: 'sem meta',
    reasonWmoOnly: 'só wmo',
    reasonIhOnly: 'só ih',
    reasonFresherCloser: 'wmo mais fresca e próxima',
    reasonFresher: 'wmo mais fresca',
    reasonCloser: 'wmo mais próxima',
    reasonIhFresh: 'ih fresca',
  } as never;

  it('explica a escolha pela frescura e pela distância', () => {
    expect(razaoDaFonte(null, tv)).toBe('sem meta');
    expect(razaoDaFonte({ winner: 'wmo', reason: 'wmo-only' } as never, tv)).toBe('só wmo');
    expect(
      razaoDaFonte({ winner: 'ih', reason: 'ih-fresh', ihAgeHours: 1, wmoAgeHours: 5, ihDistanceKm: 60, wmoDistanceKm: 56 } as never, tv),
    ).toBe('wmo mais próxima');
    expect(
      razaoDaFonte({ winner: 'ih', reason: 'ih-fresh', ihAgeHours: 2.8, wmoAgeHours: 0.5, ihDistanceKm: 60, wmoDistanceKm: 56 } as never, tv),
    ).toBe('wmo mais fresca e próxima');
  });

  it('a primária a envelhecer só quando a WMO está mais fresca e o IH ainda ganha', () => {
    expect(ihAEnvelhecer({ reason: 'ih-fresh', ihAgeHours: 2.8, wmoAgeHours: 0.5 } as never)).toBe(true);
    expect(ihAEnvelhecer({ reason: 'ih-fresh', ihAgeHours: 1, wmoAgeHours: 5 } as never)).toBe(false);
    expect(ihAEnvelhecer({ reason: 'wmo-only', ihAgeHours: 2.8, wmoAgeHours: 0.5 } as never)).toBe(false);
    expect(ihAEnvelhecer(null)).toBe(false);
  });
});

describe('idadeLeitura (selo de frescura honesto da boia v6)', () => {
  const pt = spotMedeSabe.pt;
  // «agora» de referência: qui 15 out 2026, 14h de Lisboa (13:00Z, WEST)
  const AGORA = Date.parse('2026-10-15T13:00:00Z');
  const ha = (h: number) => new Date(AGORA - h * 3_600_000).toISOString();

  it('«agora» SÓ quando a leitura é fresca', () => {
    expect(idadeLeitura(ha(1), AGORA, true, 'pt', pt)).toEqual({ txt: 'agora', fresca: true });
    expect(idadeLeitura(ha(1), AGORA, false, 'pt', pt)?.txt).not.toBe('agora');
    expect(idadeLeitura(ha(1), AGORA, false, 'pt', pt)?.fresca).toBe(false);
  });

  it('antiga: a idade verdadeira, em minutos ou horas (até 12 h)', () => {
    expect(idadeLeitura(ha(0.66), AGORA, false, 'pt', pt)?.txt).toBe('há 40 min');
    expect(idadeLeitura(ha(5), AGORA, false, 'pt', pt)?.txt).toBe('há 5 h');
    expect(idadeLeitura(ha(9), AGORA, false, 'pt', pt)?.txt).toBe('há 9 h');
    expect(idadeLeitura(ha(9), AGORA, false, 'en', spotMedeSabe.en)?.txt).toBe('9 h ago');
  });

  it('de ontem: «leitura de ontem 18h» (hora civil de Lisboa)', () => {
    // 20 h antes das 14h de qui = qua 18h de Lisboa (17:00Z)
    expect(idadeLeitura(ha(20), AGORA, false, 'pt', pt)?.txt).toBe('leitura de ontem 18h');
    expect(idadeLeitura(new Date(Date.parse('2026-10-14T17:30:00Z')).toISOString(), AGORA, false, 'pt', pt)?.txt).toBe(
      'leitura de ontem 18h30',
    );
    expect(idadeLeitura(ha(20), AGORA, false, 'en', spotMedeSabe.en)?.txt).toBe("yesterday's reading, 18:00");
  });

  it('mais velha: dia da semana até 6 dias, depois a data', () => {
    expect(idadeLeitura(ha(3 * 24), AGORA, false, 'pt', pt)?.txt).toMatch(/^leitura de seg 14h$/);
    expect(idadeLeitura(ha(10 * 24), AGORA, false, 'pt', pt)?.txt).toMatch(/^leitura de 5 out$/);
  });

  it('sem hora válida ou no futuro: sem selo (não se inventa idade)', () => {
    expect(idadeLeitura(undefined, AGORA, false, 'pt', pt)).toBeNull();
    expect(idadeLeitura('não é data', AGORA, true, 'pt', pt)).toBeNull();
    expect(idadeLeitura(ha(-1), AGORA, false, 'pt', pt)).toBeNull();
  });

  it('horaCurta: PT «18h»/«18h05», outras línguas «18:05»', () => {
    expect(horaCurta(Date.parse('2026-10-14T17:00:00Z'), 'pt')).toBe('18h');
    expect(horaCurta(Date.parse('2026-10-14T17:05:00Z'), 'pt')).toBe('18h05');
    expect(horaCurta(Date.parse('2026-10-14T17:05:00Z'), 'de')).toBe('18:05');
    // inverno (WET = UTC)
    expect(horaCurta(Date.parse('2026-12-14T09:00:00Z'), 'pt')).toBe('9h');
  });

  it('as 5 línguas têm todas as chaves do selo e do skill', () => {
    for (const l of ['pt', 'en', 'es', 'de', 'fr'] as const) {
      const c = spotMedeSabe[l];
      expect(Object.keys(c).sort()).toEqual(Object.keys(pt).sort());
      for (const k of ['agora', 'haMin', 'haH', 'ontem', 'diaHora', 'data', 'skillBate', 'skillAcima', 'skillAbaixo', 'detalhes'] as const) {
        expect(c[k].length).toBeGreaterThan(0);
      }
    }
  });
});

describe('skillSimples (o skill da previsão numa frase de surfista)', () => {
  const pt = spotMedeSabe.pt;

  it('a frase do pedido: 92% a menos de meio metro e o mar 10 cm acima (ME +0,1)', () => {
    const s = skillSimples({ me: 0.1, dentro05: 0.92 }, pt)!;
    expect(s.frase).toBe(
      'A previsão costuma bater certo nesta boia: em 92% das vezes ficou a menos de meio metro do que ela mediu. O mar costuma vir 10 cm acima da previsão.',
    );
    // nada de jargão nem parênteses aninhados
    expect(s.frase).not.toMatch(/ME|RMSE|\bn=|\(|\)/);
  });

  it('ME negativo = o mar vem abaixo da previsão; ~0 = sem tendência', () => {
    expect(skillSimples({ me: -0.3, dentro05: 0.7 }, pt)!.frase).toMatch(/acerta muitas vezes.*70%.*30 cm abaixo/);
    expect(skillSimples({ me: 0.02, dentro05: 0.5 }, pt)!.frase).toMatch(/falha bastante.*só em 50%.*Sem tendência/);
  });

  it('sem taxa de acerto usa o erro médio (MAE) em cm e diz que já o disse', () => {
    const s = skillSimples({ me: 0.2, mae: 0.4 }, pt)!;
    expect(s.frase).toBe('Comparada com esta boia, a previsão costuma falhar por uns 40 cm. O mar costuma vir 20 cm acima da previsão.');
    expect(s.disseErro).toBe(true);
    expect(skillSimples({ me: 0.2, mae: 0.4, dentro05: 0.9 }, pt)!.disseErro).toBe(false);
  });

  it('ME não finito → null (degrada em silêncio)', () => {
    expect(skillSimples({ me: Number.NaN, dentro05: 0.9 }, pt)).toBeNull();
  });

  it('cm5 arredonda aos 5 cm', () => {
    expect(cm5(0.1)).toBe(10);
    expect(cm5(-0.12)).toBe(10);
    expect(cm5(0.13)).toBe(15);
    expect(cm5(0.02)).toBe(0);
  });
});
