import { describe, expect, it } from 'vitest';
import { parseBuoyCoherenceRefs } from '@/lib/calibrationRefs';

const rawWithRefs = {
  day: '20260814',
  fetchedAt: '2026-08-14T03:52:42.802Z',
  regions: {
    'Costa de Prata': {
      spotCount: 3,
      calibrationRefs: {
        '6200084→19': {
          esCode: '6200084',
          esName: 'Cabo Silleiro',
          ptRefCode: '19',
          ptRefName: 'Leixões',
          ptRefArea: 'Norte',
          pair: '6200084×19',
          me: -0.9,
          n: 23,
          spots: ['nazare', 'sao-martinho-porto', 'baleal'],
        },
      },
    },
    Algarve: {
      spotCount: 2,
      calibrationRefs: {
        '6200084→6201079': {
          esCode: '6200084',
          esName: 'Cabo Silleiro',
          ptRefCode: '6201079',
          ptRefName: 'Faro',
          ptRefArea: 'Algarve',
          pair: '6200084×6201079',
          me: -0.4,
          n: 12,
          spots: [],
        },
        // Sem esCode/ptRefCode → descartada.
        'broken→entry': { esCode: null, ptRefCode: '19', me: 0.1, n: 5 },
        // n inválido → descartada.
        '6200084→20': { esCode: '6200084', ptRefCode: '20', me: 0.1, n: 'x' },
      },
    },
    'sem refs': { spotCount: 9, calibrationRefs: {} },
  },
};

describe('parseBuoyCoherenceRefs', () => {
  it('extrai as referências PT por região (com nome, ME/n e spots)', () => {
    const d = parseBuoyCoherenceRefs(rawWithRefs);
    expect(d.hasData).toBe(true);
    expect(d.day).toBe('20260814');
    expect(d.fetchedAt).toBe('2026-08-14T03:52:42.802Z');
    // Regiões ordenadas alfabeticamente; «sem refs» não entra.
    expect(d.regions.map((r) => r.region)).toEqual(['Algarve', 'Costa de Prata']);
    const prata = d.regions[1];
    expect(prata.refs).toHaveLength(1);
    expect(prata.refs[0]).toMatchObject({
      key: '6200084→19',
      esCode: '6200084',
      esName: 'Cabo Silleiro',
      ptRefCode: '19',
      ptRefName: 'Leixões',
      ptRefArea: 'Norte',
      me: -0.9,
      n: 23,
    });
    expect(prata.refs[0].spots).toEqual(['nazare', 'sao-martinho-porto', 'baleal']);
  });

  it('descarta entradas sem shape utilizável e suporta region sem refs', () => {
    const d = parseBuoyCoherenceRefs(rawWithRefs);
    const algarve = d.regions[0];
    // Só a entrada válida sobrevive (esCode null e n:'x' são descartadas).
    expect(algarve.refs).toHaveLength(1);
    expect(algarve.refs[0].key).toBe('6200084→6201079');
    expect(algarve.refs[0].spots).toEqual([]);
  });

  it('ordena as refs por n decrescente dentro da região', () => {
    const d = parseBuoyCoherenceRefs({
      regions: {
        Norte: {
          calibrationRefs: {
            a: { esCode: 'x', ptRefCode: '19', me: 0, n: 5, spots: [] },
            b: { esCode: 'x', ptRefCode: '20', me: 0, n: 40, spots: [] },
            c: { esCode: 'x', ptRefCode: '21', me: 0, n: 12, spots: [] },
          },
        },
      },
    });
    expect(d.regions[0].refs.map((r) => r.n)).toEqual([40, 12, 5]);
  });

  it('parseia a auditoria de par subóptimo (ref não é a PT mais próxima)', () => {
    const d = parseBuoyCoherenceRefs({
      regions: {
        Algarve: {
          calibrationRefs: {
            '6200084→6201079': { esCode: '6200084', ptRefCode: '6201079', me: -0.9, n: 5, spots: ['zavial'] },
          },
          suboptimalRefs: 1,
          suboptimal: [
            {
              spot: 'zavial',
              esCode: '6200084',
              ptRefCode: '6201079',
              ptRefKm: 95,
              nearestPtCode: '4',
              nearestPtName: 'Sines',
              nearestPtKm: 40,
            },
          ],
        },
      },
    });
    const algarve = d.regions[0];
    expect(algarve.suboptimalRefs).toBe(1);
    expect(algarve.suboptimal).toEqual([
      {
        spot: 'zavial',
        esCode: '6200084',
        ptRefCode: '6201079',
        ptRefKm: 95,
        nearestPtCode: '4',
        nearestPtName: 'Sines',
        nearestPtKm: 40,
      },
    ]);
  });

  it('descarta entradas subóptimas sem shape utilizável e usa o array como contagem', () => {
    const d = parseBuoyCoherenceRefs({
      regions: {
        Norte: {
          calibrationRefs: {
            x: { esCode: 'a', ptRefCode: 'b', me: 0.1, n: 2, spots: [] },
          },
          suboptimal: [
            { esCode: 'a', ptRefCode: 'b', nearestPtCode: 'c' }, // sem spot → descartada
            {
              spot: 'moledo',
              esCode: 'a',
              ptRefCode: 'b',
              ptRefKm: 'x', // km inválido → null
              nearestPtCode: 'c',
              nearestPtName: 'Leixões',
              nearestPtKm: NaN, // não-finito → null
            },
          ],
        },
      },
    });
    const norte = d.regions[0];
    expect(norte.suboptimalRefs).toBe(1);
    expect(norte.suboptimal[0]).toMatchObject({
      spot: 'moledo',
      ptRefKm: null,
      nearestPtCode: 'c',
      nearestPtName: 'Leixões',
      nearestPtKm: null,
    });
  });

  it('devolve hasData=false para ausente, corrompido ou sem refs', () => {
    expect(parseBuoyCoherenceRefs(null).hasData).toBe(false);
    expect(parseBuoyCoherenceRefs('not-json').hasData).toBe(false);
    expect(parseBuoyCoherenceRefs([]).hasData).toBe(false);
    expect(
      parseBuoyCoherenceRefs({ regions: { Norte: { calibrationRefs: {} } } }).hasData,
    ).toBe(false);
    expect(parseBuoyCoherenceRefs({ regions: undefined }).hasData).toBe(false);
  });
});