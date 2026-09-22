import { describe, expect, it } from 'vitest';
import { scoreBand } from '@/lib/verdict/scoreBand';
import { formatHourLabel, formatHourLong, formatDayShort } from '@/lib/verdict/formatHourLabel';
import { formatWindowLabel } from '@/lib/verdict/formatWindowLabel';
import { pickRailAxisLabels } from '@/lib/verdict/railAxisLabels';
import { isSafetyNavWarning, safetyNavWarnings } from '@/lib/verdict/navWarningSafety';
import ihCoastalWarnings from '../../../public/data/ih-coastal-warnings.json';
import { getScoreTierLabel } from '@/lib/sportScore';

describe('scoreBand — limites canónicos (80/60/40/20)', () => {
  it.each([
    [0, 'closed'],
    [19, 'closed'],
    [20, 'poor'],
    [39, 'poor'],
    [40, 'fair'],
    [59, 'fair'],
    [60, 'good'],
    [79, 'good'],
    [80, 'epic'],
    [100, 'epic'],
  ] as const)('score %i → banda %s', (score, key) => {
    expect(scoreBand(score).key).toBe(key);
  });

  it('labels batem certo com getScoreTierLabel (fonte canónica)', () => {
    for (const score of [0, 25, 45, 65, 90]) {
      const band = scoreBand(score);
      expect(band.labelPt).toBe(getScoreTierLabel(band.key, 'pt'));
      expect(band.labelEn).toBe(getScoreTierLabel(band.key, 'en'));
    }
  });

  it('clampa scores fora de 0–100', () => {
    expect(scoreBand(-5).key).toBe('closed');
    expect(scoreBand(140).key).toBe('epic');
  });
});

describe('formatHourLabel — hora local do spot', () => {
  it('devolve HH:mm da hora Open-Meteo (wall time Europe/Lisbon)', () => {
    expect(formatHourLabel('2026-09-17T14:00', 'pt')).toBe('14:00');
    expect(formatHourLabel('2026-09-17T06:00', 'en')).toBe('06:00');
  });

  it('não depende do fuso da máquina de teste', () => {
    // A string já é wall-time de Lisboa — o label tem de ser estável em qualquer TZ.
    expect(formatHourLabel('2026-03-29T03:00', 'pt')).toBe('03:00');
  });
});

describe('formatHourLong — rótulo acessível da hora', () => {
  it('pt: dia da semana + dia + mês + hora', () => {
    // 2026-09-17 é quinta-feira.
    expect(formatHourLong('2026-09-17T12:00', 'pt')).toBe('qui 17 set, 12:00');
  });

  it('en: mesmo formato com partes en-GB', () => {
    expect(formatHourLong('2026-09-17T12:00', 'en')).toBe('Thu 17 Sept, 12:00');
  });

  it('estável ao mudar de mês/dia', () => {
    expect(formatHourLong('2026-10-01T00:00', 'pt')).toBe('qui 1 out, 00:00');
  });
});

describe('formatDayShort — marcador de dia na régua', () => {
  it('pt: weekday 3 letras + dia', () => {
    expect(formatDayShort('2026-09-17T12:00', 'pt')).toBe('qui 17');
    expect(formatDayShort('2026-09-18T00:00', 'pt')).toBe('sex 18');
  });

  it('en: weekday curto + dia', () => {
    expect(formatDayShort('2026-09-17T12:00', 'en')).toBe('Thu 17');
  });
});

describe('formatWindowLabel — etiqueta «melhor» da régua', () => {
  // 96 h a partir de ter 15 set 2026, 00:00 (wall-time Open-Meteo).
  const HOURS = Array.from({ length: 96 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 15) + i * 3_600_000);
    const p = (v: number) => String(v).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00`;
  });
  const lbl = (
    startIdx: number,
    endIdx: number,
    peakIdx: number,
    peakScore: number,
    windowStart = 0,
    windowEnd = 48,
    locale = 'pt',
  ) =>
    formatWindowLabel(
      HOURS, startIdx, endIdx, peakIdx, peakScore, windowStart, windowEnd, locale,
    );

  it('mesmo dia: «ter 06–14h» + pico', () => {
    // ter 15 → índices 6..13 são ter 06h..13h; fim exclusivo = 14h.
    expect(lbl(6, 13, 10, 78)).toBe('ter 06–14h · pico ter 10h (78)');
  });

  it('passa a meia-noite: «ter 22h – qua 14h»', () => {
    expect(lbl(22, 37, 30, 82)).toBe('ter 22h – qua 14h · pico qua 06h (82)');
  });

  it('acaba às 23h: fim exclusivo escreve «00h» do dia seguinte, nunca «24h»', () => {
    expect(lbl(18, 23, 20, 70)).toBe('ter 18h – qua 00h · pico ter 20h (70)');
  });

  it('janela começou antes da janela visível: início é «agora»', () => {
    // Janela real 02h..20h mas a régua só mostra a partir de 10h.
    expect(lbl(2, 20, 15, 90, 10, 48)).toBe('agora–21h · pico ter 15h (90)');
  });

  it('janela de 1 hora: «ter 06–07h»', () => {
    expect(lbl(6, 6, 6, 65)).toBe('ter 06–07h · pico ter 06h (65)');
  });

  it('en: dias e palavras em inglês', () => {
    expect(lbl(6, 13, 10, 78, 0, 48, 'en')).toBe('Tue 06–14h · peak Tue 10h (78)');
  });

  it('janela fora da parte visível → null', () => {
    expect(lbl(60, 70, 65, 80, 0, 48)).toBeNull();
  });
});

describe('pickRailAxisLabels — etiquetas do eixo sem colisões', () => {
  // 48 h de horas wall-time Open-Meteo a partir de um instante dado.
  const hoursFrom = (iso: string, n = 48) => {
    const d = new Date(`${iso}:00Z`);
    const p = (v: number) => String(v).padStart(2, '0');
    return Array.from({ length: n }, (_, i) => {
      const t = new Date(d.getTime() + i * 3_600_000);
      return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:00`;
    });
  };
  const texts = (labels: { label: string }[]) => labels.map((l) => l.label);

  it('janela que começa às 23h: a fronteira de dia posterior prevalece à parcial', () => {
    // seg 21 set 23h → a mudança para ter 22 acontece no índice 1 — duas
    // etiquetas de dia a 1 h de distância colidem; fica a do dia completo.
    const labels = pickRailAxisLabels(hoursFrom('2026-09-21T23'), 'pt', 4);
    const byIndex = new Map(labels.map((l) => [l.index, l]));
    expect(byIndex.has(0)).toBe(false); // «seg 21» parcial sacrificado
    expect(byIndex.get(1)).toMatchObject({ label: 'ter 22', kind: 'day' });
    // Horas redondas seguem (06h no índice 7 — afastamento ≥4 respeitado).
    expect(byIndex.get(7)).toMatchObject({ label: '06h', kind: 'hour' });
    // Nenhum par fica a menos de 4 índices.
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i].index - labels[i - 1].index).toBeGreaterThanOrEqual(4);
    }
  });

  it('janela que começa às 00h: o dia ancora no índice 0, horas de 6 em 6', () => {
    const labels = pickRailAxisLabels(hoursFrom('2026-09-21T00'), 'pt', 4);
    expect(labels[0]).toMatchObject({ index: 0, label: 'seg 21', kind: 'day' });
    expect(texts(labels)).toEqual([
      'seg 21', '06h', '12h', '18h', 'ter 22', '06h', '12h', '18h',
    ]);
  });

  it('mobile (minGap 6) mostra menos etiquetas que desktop (minGap 4)', () => {
    // Começo às 02h: 06h fica a 4 índices da etiqueta de dia — desktop (≥4)
    // mostra-a, mobile (≥6) esconde-a.
    const win = hoursFrom('2026-09-21T02');
    const desktop = pickRailAxisLabels(win, 'pt', 4);
    const mobile = pickRailAxisLabels(win, 'pt', 6);
    expect(texts(desktop)).toEqual([
      'seg 21', '06h', '12h', '18h', 'ter 22', '06h', '12h', '18h', 'qua 23',
    ]);
    expect(mobile.length).toBeLessThan(desktop.length);
    expect(texts(mobile)).toEqual([
      'seg 21', '12h', '18h', 'ter 22', '06h', '12h', '18h', 'qua 23',
    ]);
    for (let i = 1; i < mobile.length; i++) {
      expect(mobile[i].index - mobile[i - 1].index).toBeGreaterThanOrEqual(6);
    }
  });

  it('hora redonda esconde-se quando colide com mudança de dia', () => {
    // Começo às 05h: 06h (índice 1) fica a 1 da etiqueta de dia → escondida.
    const labels = pickRailAxisLabels(hoursFrom('2026-09-21T05'), 'pt', 4);
    const byIndex = new Map(labels.map((l) => [l.index, l]));
    expect(byIndex.has(1)).toBe(false);
    expect(byIndex.get(7)).toMatchObject({ label: '12h', kind: 'hour' });
  });

  it('en: mesmos índices, rótulos de dia em inglês', () => {
    const labels = pickRailAxisLabels(hoursFrom('2026-09-21T00'), 'en', 4);
    expect(labels[0].label).toBe('Mon 21');
    expect(texts(labels)).toContain('06h');
  });
});

describe('isSafetyNavWarning — faixa §0 só com perigo para quem está na água', () => {
  // Excluídos — textos reais do ih-coastal-warnings.json: avisos para
  // embarcações (ajudas à navegação, obras portuárias, canais) e
  // informativos/administrativos. Todos continuam na «No local».
  it.each([
    // administrativos/informativos
    'Animais Marinhos - Interação',
    'Animais Marinhos - Avistamento',
    'Edital Nº 594/2018_Porto de Leixões',
    'EDITAL 653/2023 DA CAPITANIA DO PORTO DE CAMINHA',
    '1ª ALTERAÇÃO AO EDITAL 653/2023 DA CAPITANIA DO PORTO DE CAMINHA',
    'Normas de Segurança para a Navegação ',
    'Normas Especiais de Segurança Maritima e Portuária',
    'Requisitos de segurança maritima',
    'Regulamento de Exploração',
    'Portaria n.º 561/90 - Regulamento da Pesca no Rio Lima',
    'Pesca com arte-xávega - Locais Autorizados',
    'Cancelamento ANAV 200/25',
    'Aviso à navegação nº 68/2022',
    'Aviso a Navegação',
    'BARRA DE ALBUFEIRA - ABERTA A TODA A NAVEGAÇÃO.',
    'BARRA DE ALVOR - BARRA ABERTA.',
    // «segurança/perigo à navegação» genérico — sem palavra da lista não entra
    'PERIGO À NAVEGAÇÃO',
    'SEGURANÇA DA NAVEGAÇÃO - AVISO À NAVEGAÇÃO LOCAL',
    'SEGURANÇA À NAVEGAÇÃO - FAROLIM QUEBRA MAR APAGADO ',
    'segurança da navegação',
    'SEGURANÇA À NAVEGAÇÃO',
    'SEGURANÇA DA NAVEGAÇÃO - CAMPANHA CIENTÍFICA',
    'SEGURANÇA DA NAVEGAÇÃO - TRABALHOS DE PROLONGAMENTO DO QUEBRA-MAR DO PORTO DE LEIXÕES.',
    // ajudas à navegação e canais — perigo para barcos, não para banhistas
    'ASSINALAMENTO MARITIMO',
    'Assinalamento marítimo',
    'ASSINALAMENTO PROVISORIO',
    'Boia apagada',
    ' Bóia Apagada',
    'Boia 9 Canal Sul fora de posição',
    'BOIA RETIRADA',
    'Reposicionamento das boias no canal de Alvor',
    'ASSINALAMENTO MARÍTIMO - BOIA Nº 1M FORA DA POSIÇÃO',
    'BAIA DE SESIMBRA - FAROLIM ENFIAMENTO',
    'Farolim desativado',
    ' Cascais - Mastro e Sinais inoperativos',
    'SINAL SONORO PRAIA DA AGUDA ANTERIOR AVARIADO',
    'Mastro de Aviso de Temporal do Portinho da Ericeira',
    'Entrada do Porto de Lisboa – Assinalamento Marítimo',
    'ASSINALAMENTO MARÍTIMO - DESAPARECIMENTO DA BOIA ONDÓGRAFO NO PORTO DE PONTA DELGADA',
    'Substituição Boias Windfloat Atlantic',
    'AVISO À NAVEGAÇÃO - INSTALAÇÃO DE BOIA LiDAR FLS 200',
    // assoreamento/sondas/estado de barras — calado de embarcações
    'ASSOREAMENTO DA BARRA',
    'Assoreamento da Barra',
    'ALTERAÇÃO DE SONDAS MINIMAS',
    'BARRA DA RIA DE ALVOR – CONDICIONAMENTO  ',
    // obras e estruturas portuárias — aviso a embarcações
    "CAIS DA PENHA D'ÁGUIA DANIFICADO",
    'PONTÃO N.º 2 DANIFICADO',
    'PORTO DE ABRIGO DA CULATRA - QUEBRAMAR DANIFICADO',
    ' EDIFICAÇÃO CONSTRUÇÃO DE NOVO CAIS',
    ' Instalação de viveiro "Mar Salgado" na baía de Lagos',
    'PARQUE SUBAQUATICO OCEAN REVIVAL - ALTERAÇÃO LIMITES',
    'ÁREA PILOTO PRODUÇÃO AQUÍCOLA DA ARMONA - BÓIAS APAGADAS E FORA DE POSIÇÃO',
    'ZONA EM EVOLUÇÃO',
    'Delimitação por boias',
    // interdição só para embarcações (fundear/pairar) → fica fora
    'Interdição de fundear ou pairar no troço de canal em frente às infra-estruturas portuárias de Santa Luzia-Tavira',
    // fogo de artifício ≠ fogo real; plano de salvamento ≠ operação em curso
    'LANÇAMENTO DE FOGO DE ARTIFÍCIO',
    'Plano de Salvamento Marítimo Lagos',
    'PLANO DE SALVAMENTO MARÍTIMO',
  ])('não entra na faixa §0: %s', (category) => {
    expect(isSafetyNavWarning({ category })).toBe(false);
  });

  // Incluídos — um caso por grupo da lista de inclusão.
  it.each([
    // objectos/embarcações submersos ou à deriva
    'Embarcação submersa',
    'Embarcação parcialmente submersa',
    'Equipamento submerso',
    'BOIA À DERIVA',
    'BOIA N.5 DO CANAL PRINCIPAL À DERIVA',
    'Objeto à deriva (boia de navegação)',
    'NAUFRÁGIO POR ASSINALAR',
    'Contentor à deriva',
    'Objecto flutuante na entrada da barra',
    // arribas e derrocadas
    'AVISO DE ARRIBA INSTÁVEL. ÁREA DAS GRUTAS DE BENAGIL.',
    'Abatimento da cabeça do molhe Leste da Barra de Tavira',
    'Derrocada em falésia — zona balnear',
    // interdições/restrições de área ou de acesso à água/costa
    'INTERDIÇÃO DE ÁREA',
    'RESTRIÇÃO DE ACESSO  À GRUTA VALE DO COVO ',
    'Proibição de banhos na zona da arriba instável',
    // exercícios militares, fogo real, explosivos, minas
    'EXERCÍCIO MILITAR COM TIRO REAL — ZONA INTERDITA',
    'Detonação de explosivos na praia',
    // poluição e derrames
    'Derrame de hidrocarbonetos ao largo de Sines',
    'Poluição detectada na zona balnear',
    // operações de salvamento/busca em curso
    'Operação de busca e salvamento em curso',
  ])('perigo real incluído: %s', (category) => {
    expect(isSafetyNavWarning({ category })).toBe(true);
  });

  it('«segurança da navegação» + palavra da lista → entra', () => {
    expect(
      isSafetyNavWarning({
        category: 'SEGURANÇA DA NAVEGAÇÃO - EMBARCAÇÃO À DERIVA',
      }),
    ).toBe(true);
  });

  it('interdição de fundear/pairar é só para embarcações → fica fora', () => {
    expect(
      isSafetyNavWarning({
        category:
          'Interdição de fundear ou pairar no troço de canal em frente às infra-estruturas portuárias de Santa Luzia-Tavira',
      }),
    ).toBe(false);
  });

  it('collection orca_anavnet_point nunca entra, mesmo com outra categoria', () => {
    expect(
      isSafetyNavWarning({
        category: 'EMBARCAÇÃO À DERIVA',
        collection: 'orca_anavnet_point',
      }),
    ).toBe(false);
  });

  it('sem categoria → false (não inventa alarme)', () => {
    expect(isSafetyNavWarning({})).toBe(false);
    expect(isSafetyNavWarning({ category: null })).toBe(false);
  });

  it('safetyNavWarnings filtra preservando a ordem', () => {
    const list = [
      { id: 1, category: 'Animais Marinhos - Interação' },
      { id: 2, category: 'BOIA À DERIVA' },
      { id: 3, category: 'Edital Nº 1/2014' },
      { id: 4, category: 'INTERDIÇÃO DE ÁREA' },
    ];
    expect(safetyNavWarnings(list).map((w) => w.id)).toEqual([2, 4]);
    expect(safetyNavWarnings(null)).toEqual([]);
  });

  it('dados reais: menos de 15% dos avisos IH entram na faixa', () => {
    const inStrip = safetyNavWarnings(ihCoastalWarnings.warnings);
    const pct = (inStrip.length / ihCoastalWarnings.warnings.length) * 100;
    // Contagem para o relatório S2A-fix3.
    console.log(
      `faixa §0: ${inStrip.length}/${ihCoastalWarnings.warnings.length} avisos (${pct.toFixed(1)}%)`,
      inStrip.map((w) => w.category),
    );
    expect(pct).toBeLessThan(15);
  });
});
