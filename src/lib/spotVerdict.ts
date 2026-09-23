/**
 * Spot verdict — a single editorial line answering «devo ir?».
 *
 * Deterministic copy derived from the same data the page already shows
 * (score, hourly forecast, magic windows, tide schedule). No LLM, no
 * invented numbers: if a field is missing the phrase simply omits it.
 */

import type { Conditions } from './sportScore';
import type { HourlyCondition, MagicWindow } from './magicWindows';
import type { TideSchedule } from './tideSchedule';
import { getCardinalLabel, getWindRelationToCoast, type WindRelation } from './wind';

export type VerdictTone = 'epic' | 'good' | 'fair' | 'poor';

export interface SpotVerdict {
  headline: string;
  detail: string;
  tone: VerdictTone;
}

interface VerdictInput {
  scoreNow: number;
  conditions: Conditions;
  hourly: HourlyCondition[];
  windows: MagicWindow[];
  tide: TideSchedule | null;
  coastOrientation?: number;
  isPt: boolean;
  nowMs: number;
}

const HOUR_MS = 3_600_000;

function fmtHour(iso: string, isPt: boolean): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}h`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * A janela atravessa a meia-noite (hora de fim anterior à de início) — a
 * mesma regra do `formatBestWindowHours` da homepage. Sem o sufixo «(amanhã)»,
 * «23h–03h» lê-se como se a janela andasse para trás (o #63 apanhou isto nas
 * janelas da homepage; a manchete do veredicto tinha o mesmo defeito).
 */
function crossesMidnight(startIso: string, endIso: string): boolean {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return end.getHours() < start.getHours();
}

/** Sufixo de ambiguidade para janelas que entram pelo dia seguinte. */
function overnightSuffix(crosses: boolean, isPt: boolean): string {
  if (!crosses) return '';
  return isPt ? ' (amanhã)' : ' (tomorrow)';
}

function toneForScore(score: number): VerdictTone {
  if (score >= 80) return 'epic';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

const RELATION_PT: Record<WindRelation, string> = {
  offshore: 'offshore',
  onshore: 'onshore',
  cross: 'lateral',
};
const RELATION_EN: Record<WindRelation, string> = {
  offshore: 'offshore',
  onshore: 'onshore',
  cross: 'cross-shore',
};

const TIDE_PT: Record<string, string> = {
  high: 'maré alta',
  low: 'maré baixa',
  rising: 'maré a subir',
  falling: 'maré a descer',
};
const TIDE_EN: Record<string, string> = {
  high: 'high tide',
  low: 'low tide',
  rising: 'rising tide',
  falling: 'falling tide',
};

export function buildSpotVerdict(input: VerdictInput): SpotVerdict | null {
  const { scoreNow, conditions, hourly, windows, tide, coastOrientation, isPt, nowMs } = input;
  if (!hourly.length) return null;

  const now = new Date(nowMs);

  // ── Detail line: measured/forecast conditions right now ──
  const parts: string[] = [];
  if (conditions.waveHeight > 0) {
    const h = conditions.waveHeight.toFixed(1).replace('.', isPt ? ',' : '.');
    const dir = conditions.waveDirection > 0 ? ` ${getCardinalLabel(conditions.waveDirection)}` : '';
    parts.push(`${dir.trim() ? dir + ' ' : ''}${h} m`);
    if (conditions.wavePeriod > 0) parts.push(`${Math.round(conditions.wavePeriod)} s`);
  }
  if (conditions.windSpeed > 0) {
    const kt = Math.round(conditions.windSpeed * 1.94384);
    const cardinal = getCardinalLabel(conditions.windDirection);
    let rel = '';
    if (typeof coastOrientation === 'number') {
      const r = getWindRelationToCoast(conditions.windDirection, coastOrientation);
      rel = ` ${isPt ? RELATION_PT[r] : RELATION_EN[r]}`;
    }
    parts.push(
      isPt ? `vento ${cardinal} ${kt} kt${rel}` : `${cardinal} ${kt} kt${rel} wind`,
    );
  }
  if (tide) {
    parts.push((isPt ? TIDE_PT : TIDE_EN)[tide.phase] ?? tide.phaseLabel);
  }
  const detail = parts.join(' · ');

  // ── Headline: «agora» é decidido pelo scoreNow — o mesmo número que o
  // badge do herói e a linha de score da tabela mostram para a hora
  // corrente (dados actuais com correcções observadas). As janelas, já
  // pontuadas pelo mesmo scorer canónico, só enquadram o futuro — assim o
  // veredicto nunca contradiz o score visível do desporto seleccionado.
  const timed = windows
    .map((w) => ({
      w,
      startT: new Date(hourly[w.start]?.time ?? 0).getTime(),
      endT: new Date(hourly[w.end]?.time ?? 0).getTime() + HOUR_MS,
    }))
    .filter((x) => x.endT > nowMs)
    .sort((a, b) => a.startT - b.startT);

  const active = timed.find((x) => nowMs >= x.startT && nowMs < x.endT);
  const next = timed.find((x) => x.startT > nowMs);

  if (scoreNow >= 60) {
    const lead = scoreNow >= 80
      ? isPt ? 'Está épico agora' : "It's epic right now"
      : isPt ? 'Está a bombar agora' : "It's firing right now";
    const tone = scoreNow >= 80 ? 'epic' : 'good';
    if (active) {
      const until = fmtHour(hourly[active.w.end]?.time ?? '', isPt);
      return {
        headline: isPt ? `${lead} — aproveita até às ${until}` : `${lead} — window until ${until}`,
        detail,
        tone,
      };
    }
    if (next) {
      const startIso = hourly[next.w.start]?.time ?? '';
      const endIso = hourly[next.w.end]?.time ?? '';
      const s = fmtHour(startIso, isPt);
      const e = fmtHour(endIso, isPt);
      const overnight = overnightSuffix(crossesMidnight(startIso, endIso), isPt);
      return {
        headline: isPt ? `${lead} — janela ${s}–${e}${overnight}` : `${lead} — window ${s}–${e}${overnight}`,
        detail,
        tone,
      };
    }
    return { headline: lead, detail, tone };
  }

  // scoreNow < 60 mas a previsão tem uma janela a cobrir esta hora — o
  // modelo vê condições melhores que os dados actuais; reporta-se a janela
  // sem contradizer o badge (o tom segue o score actual).
  if (active) {
    const until = fmtHour(hourly[active.w.end]?.time ?? '', isPt);
    return {
      headline: isPt
        ? `Janela prevista em curso até às ${until}`
        : `Forecast window open until ${until}`,
      detail,
      tone: toneForScore(scoreNow),
    };
  }

  if (next) {
    const startIso = hourly[next.w.start]?.time ?? '';
    const endIso = hourly[next.w.end]?.time ?? '';
    const s = fmtHour(startIso, isPt);
    const e = fmtHour(endIso, isPt);
    const overnight = overnightSuffix(crossesMidnight(startIso, endIso), isPt);
    if (sameDay(new Date(next.startT), now)) {
      return {
        headline: isPt
          ? next.w.score >= 60
            ? `A próxima janela é ${s}–${e}${overnight} — ainda vais a tempo`
            : `Janela razoável ${s}–${e}${overnight} — margem curta`
          : next.w.score >= 60
            ? `Next window is ${s}–${e}${overnight} — still time to go`
            : `Fair window ${s}–${e}${overnight} — slim margin`,
        detail,
        tone: toneForScore(next.w.score),
      };
    }
    return {
      headline: isPt
        ? `Hoje fraco — amanhã ${s}–${e} é a janela`
        : `Weak today — tomorrow ${s}–${e} is the window`,
      detail,
      tone: toneForScore(next.w.score),
    };
  }

  return {
    headline: isPt
      ? scoreNow >= 40
        ? 'Condições marginais — sem janela clara nas próximas 24h'
        : 'Sem janela boa nas próximas 24h'
      : scoreNow >= 40
        ? 'Marginal conditions — no clear window in the next 24h'
        : 'No good window in the next 24h',
    detail,
    tone: toneForScore(scoreNow),
  };
}
