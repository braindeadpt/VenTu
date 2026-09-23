import { describe, expect, it } from 'vitest';
import { scoreBand } from '@/lib/verdict/scoreBand';
import { formatHourLabel, formatHourLong, formatDayShort } from '@/lib/verdict/formatHourLabel';
import {
  formatWindowLabel,
  peakIndexInRange,
} from '@/lib/verdict/formatWindowLabel';
import {
  pickRailAxisLabelsPx,
  railAxisCandidates,
  type RailAxisLabelPlaced,
} from '@/lib/verdict/railAxisLabels';
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
  /** Scores com um único pico em `peaks` (índice → score); resto a 10. */
  const scoresWith = (peaks: Record<number, number>) => {
    const s = Array<number>(96).fill(10);
    for (const [i, v] of Object.entries(peaks)) s[Number(i)] = v;
    return s;
  };
  const lbl = (
    startIdx: number,
    endIdx: number,
    scores: readonly number[],
    windowStart = 0,
    windowEnd = 48,
    locale = 'pt',
  ) =>
    formatWindowLabel(
      HOURS,
      scores,
      { startIdx, endIdx },
      windowStart,
      windowEnd,
      locale,
    );

  it('mesmo dia: «ter 06–14h» + pico sem repetir o weekday', () => {
    // ter 15 → índices 6..13 são ter 06h..13h; fim exclusivo = 14h.
    expect(lbl(6, 13, scoresWith({ 10: 78 }))).toBe('ter 06–14h · pico 10h (78)');
  });

  it('passa a meia-noite: «ter 22h – qua 14h»', () => {
    expect(lbl(22, 37, scoresWith({ 30: 82 }))).toBe(
      'ter 22h – qua 14h · pico qua 06h (82)',
    );
  });

  it('acaba às 23h: fim exclusivo escreve «00h» do dia seguinte, nunca «24h»', () => {
    expect(lbl(18, 23, scoresWith({ 20: 70 }))).toBe(
      'ter 18h – qua 00h · pico ter 20h (70)',
    );
  });

  it('janela começou antes da janela visível: início é «agora»', () => {
    // Janela real 02h..20h mas a régua só mostra a partir de 10h.
    expect(lbl(2, 20, scoresWith({ 15: 90 }), 10, 48)).toBe(
      'agora–21h · pico ter 15h (90)',
    );
  });

  it('janela de 1 hora: «ter 06–07h»', () => {
    expect(lbl(6, 6, scoresWith({ 6: 65 }))).toBe('ter 06–07h · pico 06h (65)');
  });

  it('en: dias e palavras em inglês', () => {
    expect(lbl(6, 13, scoresWith({ 10: 78 }), 0, 48, 'en')).toBe(
      'Tue 06–14h · peak 10h (78)',
    );
  });

  it('pico fora da parte visível: anuncia o máximo VISÍVEL, nunca o escondido', () => {
    // Janela qua 06h..qui 06h mas a régua corta em qui 00h (48 h). O máximo
    // real (100 no índice 60, fora do ecrã) não pode ser anunciado — o pico
    // procura-se só em [30, 47]: qua 16h (85).
    const scores = scoresWith({ 40: 85, 60: 100 });
    expect(lbl(30, 70, scores)).toBe('qua 06h – qui 00h · pico qua 16h (85)');
  });

  it('pico na parte cortada atrás também não se anuncia', () => {
    // Janela 02h..20h visível a partir de 10h; máximo real às 04h (índice 4).
    expect(lbl(2, 20, scoresWith({ 4: 95, 15: 90 }), 10, 48)).toBe(
      'agora–21h · pico ter 15h (90)',
    );
  });

  it('cobre >70 % do eixo visível → «bom quase todo o período» + pico', () => {
    // Visível [5,47] = 43/48 ≈ 90 % — sem range de horas, com pico visível.
    expect(lbl(5, 50, scoresWith({ 40: 85 }))).toBe(
      'bom quase todo o período · pico qua 16h (85)',
    );
    // O limiar é estrito: 34/48 ≈ 71 % já é «quase todo»; 33/48 ≈ 69 % não.
    expect(lbl(5, 38, scoresWith({ 10: 70 }))).toContain(
      'bom quase todo o período',
    );
    expect(lbl(5, 37, scoresWith({ 10: 70 }))).not.toContain(
      'bom quase todo o período',
    );
  });

  it('en: «good almost the whole period»', () => {
    expect(lbl(5, 50, scoresWith({ 40: 85 }), 0, 48, 'en')).toBe(
      'good almost the whole period · peak Wed 16h (85)',
    );
  });

  it('janela fora da parte visível → null', () => {
    expect(lbl(60, 70, scoresWith({ 65: 80 }), 0, 48)).toBeNull();
  });
});

describe('peakIndexInRange — máximo dentro do intervalo', () => {
  it('primeiro índice em empate', () => {
    expect(peakIndexInRange([10, 80, 80, 40], 0, 3)).toBe(1);
    expect(peakIndexInRange([10, 80, 95, 40], 0, 2)).toBe(2);
  });
});

describe('pickRailAxisLabelsPx — etiquetas do eixo, colisão em píxeis', () => {
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
  // Font mono ~11 px ≈ 6,6 px por carácter — aproximação do canvas do
  // componente; os testes verificam a GEOMETRIA, não a fonte exacta.
  const measure = (s: string) => s.length * 6.6;
  const GAP = 8;
  const pick = (iso: string, width: number, n = 48, locale = 'pt') =>
    pickRailAxisLabelsPx(
      railAxisCandidates(hoursFrom(iso, n), locale),
      n,
      (i) => ((i + 0.5) / n) * width,
      measure,
      GAP,
    );
  /** Caixas de render devolvidas — nenhum par pode ficar a menos de GAP px. */
  const boxes = (labels: RailAxisLabelPlaced[]) =>
    labels.map((l) => ({ left: l.left, right: l.left + measure(l.label) }));
  const expectNoCollisions = (labels: RailAxisLabelPlaced[]) => {
    const bs = boxes(labels).sort((a, b) => a.left - b.left);
    for (let i = 1; i < bs.length; i++) {
      expect(bs[i].left - bs[i - 1].right).toBeGreaterThanOrEqual(GAP);
    }
    // Nada sai da régua.
    for (const b of bs) expect(b.left).toBeGreaterThanOrEqual(0);
  };

  it('candidatos: fronteiras de dia + 12h + múltiplos de 6h, por prioridade', () => {
    const cands = railAxisCandidates(hoursFrom('2026-09-21T23'), 'pt');
    expect(cands.find((c) => c.index === 0)).toMatchObject({
      label: 'seg 21',
      kind: 'day',
    });
    expect(cands.find((c) => c.index === 1)).toMatchObject({
      label: 'ter 22',
      kind: 'day',
    });
    expect(cands.find((c) => c.index === 7)).toMatchObject({
      label: '06h',
      kind: 'hour',
    });
    expect(cands.find((c) => c.index === 13)).toMatchObject({
      label: '12h',
      kind: 'noon',
    });
    // 00h não é candidato «hour» — é a fronteira de dia.
    expect(cands.some((c) => c.kind === 'hour' && c.label === '00h')).toBe(false);
  });

  it('desktop (1440 px): dias + 12h + 6h sem colisões', () => {
    const labels = pick('2026-09-21T00', 1440);
    expect(texts(labels)).toEqual([
      'seg 21', '06h', '12h', '18h', 'ter 22', '06h', '12h', '18h',
    ]);
    expectNoCollisions(labels);
  });

  it('mobile (358 px): menos etiquetas, sempre sem colisão em px', () => {
    const wide = pick('2026-09-21T02', 1440);
    const narrow = pick('2026-09-21T02', 358);
    expect(narrow.length).toBeLessThan(wide.length);
    // As fronteiras de dia são as últimas a cair.
    expect(narrow.some((l) => l.kind === 'day' && l.index === 22)).toBe(true);
    expectNoCollisions(narrow);
    expectNoCollisions(pick('2026-09-21T02', 768));
  });

  it('dia posterior prevalece sobre o parcial quando as caixas colidem', () => {
    // Começo às 23h: «seg 21» (idx 0) e «ter 22» (idx 1) colidem — a
    // etiqueta parcial sacrifica-se, como na versão por horas.
    const labels = pick('2026-09-21T23', 720);
    const byIndex = new Map(labels.map((l) => [l.index, l]));
    expect(byIndex.has(0)).toBe(false);
    expect(byIndex.get(1)).toMatchObject({ label: 'ter 22', kind: 'day' });
    expectNoCollisions(labels);
  });

  it('12h tem prioridade sobre os múltiplos de 6h em colisão', () => {
    // Régua muito estreita: só cabe uma etiqueta de hora entre dias — a do
    // meio-dia, não a das 06h/18h que lhe ficam coladas.
    const labels = pick('2026-09-21T00', 240);
    const byIndex = new Map(labels.map((l) => [l.index, l]));
    expect(byIndex.get(12)).toMatchObject({ label: '12h', kind: 'noon' });
    expect(byIndex.has(6)).toBe(false);
    expect(byIndex.has(18)).toBe(false);
    expectNoCollisions(labels);
  });

  it('dias são os últimos a cair — mesmo numa régua de 120 px', () => {
    // A 120 px só cabe ~1 etiqueta de dia + o que sobrar depois dela —
    // mas a prioridade garante que o eixo continua ancorado num dia.
    const labels = pick('2026-09-21T23', 120);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((l) => l.kind === 'day')).toBe(true);
    expectNoCollisions(labels);
  });

  it('etiqueta no índice 1 fica clampada dentro da régua (não sai à esquerda)', () => {
    const labels = pick('2026-09-21T23', 358);
    const day1 = labels.find((l) => l.index === 1);
    expect(day1).toBeDefined();
    expect(day1!.left).toBeGreaterThanOrEqual(0);
  });

  it('função pura: mesma entrada → mesma saída; candidatos não mutados', () => {
    const cands = railAxisCandidates(hoursFrom('2026-09-21T05'), 'pt');
    const snapshot = JSON.stringify(cands);
    const a = pickRailAxisLabelsPx(
      cands,
      48,
      (i) => ((i + 0.5) / 48) * 720,
      measure,
      GAP,
    );
    const b = pickRailAxisLabelsPx(
      cands,
      48,
      (i) => ((i + 0.5) / 48) * 720,
      measure,
      GAP,
    );
    expect(a).toEqual(b);
    expect(JSON.stringify(cands)).toBe(snapshot);
  });

  it('en: mesmos índices, rótulos de dia em inglês', () => {
    const labels = pick('2026-09-21T00', 1440, 48, 'en');
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
