export interface HourlyCondition {
  time: string;
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
}

export interface MagicWindow {
  start: number;
  end: number;
  duration: number;
  score: number;
  reason: string;
  reasonEn: string;
}

export function computeMagicWindows(
  hourly: HourlyCondition[],
  spotType: string,
  spotBestWind: string,
  scores?: number[],
): MagicWindow[] {
  if (!hourly?.length) return [];

  // Canonical per-hour scores (same scorer as the forecast table and the
  // hero badge). When provided they drive window detection AND the window
  // score — one scale everywhere, so a window can never disagree with the
  // hourly score shown next to it. The heuristic below still runs to
  // produce the reason chips; without `scores` it also decides detection
  // (legacy callers like bestWindowToday).
  const canonical = Array.isArray(scores) && scores.length === hourly.length ? scores : null;

  const bestWindDirs = spotBestWind
    .split(',')
    .map((s) => {
      const dir = s.trim();
      const map: Record<string, number> = {
        N: 0,
        NNE: 22.5,
        NE: 45,
        ENE: 67.5,
        E: 90,
        ESE: 112.5,
        SE: 135,
        SSE: 157.5,
        S: 180,
        SSW: 202.5,
        SW: 225,
        WSW: 247.5,
        W: 270,
        WNW: 292.5,
        NW: 315,
        NNW: 337.5,
        Vário: -1,
        Variável: -1,
      };
      return map[dir] ?? -1;
    })
    .filter((d) => d >= 0);

  const scored = hourly.map((h, i) => {
    let heuristic = 0;
    const reasons: string[] = [];
    const reasonsEn: string[] = [];

    if (spotType === 'surf' || spotType === 'big-wave') {
      if (h.waveHeight >= 1.0 && h.waveHeight <= 2.5) {
        heuristic += 25;
        reasons.push('Ondas boas');
        reasonsEn.push('Good waves');
      } else if (h.waveHeight > 2.5) {
        heuristic +=20;
        reasons.push('Ondas grandes');
        reasonsEn.push('Big waves');
      }
      if (h.wavePeriod >= 10) {
        heuristic +=15;
        reasons.push('Período longo');
        reasonsEn.push('Long period');
      }
    }

    if (spotType === 'kitesurf') {
      const windKnots = h.windSpeed * 1.94384;
      if (windKnots >= 15 && windKnots <= 28) {
        heuristic +=30;
        reasons.push(`Vento ideal (${Math.round(windKnots)}kt)`);
        reasonsEn.push(`Ideal wind (${Math.round(windKnots)}kt)`);
      } else if (windKnots >= 10 && windKnots < 15) {
        heuristic +=15;
        reasons.push(`Vento leve (${Math.round(windKnots)}kt)`);
        reasonsEn.push(`Light wind (${Math.round(windKnots)}kt)`);
      }
    }

    if (spotType === 'windsurf') {
      const windKnots = h.windSpeed * 1.94384;
      if (windKnots >= 12 && windKnots <= 25) {
        heuristic +=30;
        reasons.push(`Vento bom (${Math.round(windKnots)}kt)`);
        reasonsEn.push(`Good wind (${Math.round(windKnots)}kt)`);
      } else if (windKnots >= 8 && windKnots < 12) {
        heuristic +=15;
        reasons.push(`Vento leve (${Math.round(windKnots)}kt)`);
        reasonsEn.push(`Light wind (${Math.round(windKnots)}kt)`);
      }
    }

    const windDir = h.windDirection;
    const isOffshore = bestWindDirs.some((d) => {
      const diff = Math.abs(windDir - d);
      return diff <= 45 || diff >= 315;
    });

    if (isOffshore) {
      heuristic +=25;
      reasons.push('Vento offshore');
      reasonsEn.push('Offshore wind');
    } else if (h.windSpeed < 5) {
      heuristic +=15;
      reasons.push('Vento fraco');
      reasonsEn.push('Light wind');
    }

    if (h.waterTemp >= 18) {
      heuristic +=5;
    }
    const waveVariance = i > 0 ? Math.abs(h.waveHeight - (hourly[i - 1]?.waveHeight || 0)) : 0;
    const windVariance = i > 0 ? Math.abs(h.windSpeed - (hourly[i - 1]?.windSpeed || 0)) : 0;
    if (waveVariance < 0.3 && windVariance < 5) {
      heuristic +=3;
    }
    const hourOfDay = new Date(h.time).getHours();
    if ((spotType === 'surf' || spotType === 'big-wave') && hourOfDay >= 6 && hourOfDay <= 10) {
      heuristic +=4;
    }

    return { hour: i, time: h.time, score: canonical ? (canonical[i] ?? 0) : heuristic, reasons, reasonsEn };
  });

  const windows: MagicWindow[] = [];
  let start = -1;
  let end = -1;

  // Invariant: no window longer than 24h, regardless of how many hours the
  // caller passes in. Longer runs are split into ≤24h segments; segments
  // shorter than 2h are dropped (same minimum as the run detection below).
  const MAX_WINDOW_HOURS = 24;

  const pushWindow = (s: number, e: number) => {
    if (e - s + 1 > MAX_WINDOW_HOURS) {
      for (let cs = s; cs <= e; cs += MAX_WINDOW_HOURS) {
        const ce = Math.min(cs + MAX_WINDOW_HOURS - 1, e);
        if (ce - cs >= 1) pushSegment(cs, ce);
      }
      return;
    }
    pushSegment(s, e);
  };

  const pushSegment = (s: number, e: number) => {
    const windowScores = scored.slice(s, e + 1);
    const avgScore = Math.floor(windowScores.reduce((a, b) => a + b.score, 0) / windowScores.length);
    const durationBonus = Math.min((e - s) * 2, 15);
    // Canonical path: window score = média das horas (mesma escala da
    // tabela). Legacy path: mantém o bónus de duração.
    const finalScore = Math.min(avgScore + (canonical ? 0 : durationBonus), 100);
    const allReasons = Array.from(new Set(windowScores.flatMap((x) => x.reasons)));
    const allReasonsEn = Array.from(new Set(windowScores.flatMap((x) => x.reasonsEn)));
    windows.push({
      start: s,
      end: e,
      duration: e - s + 1,
      score: finalScore,
      reason: allReasons.slice(0, 3).join(' + '),
      reasonEn: allReasonsEn.slice(0, 3).join(' + '),
    });
  };

  // Canonical scale: a window hour is a BOM-tier hour (≥60), matching the
  // «janelas de score ≥ 60» copy and the table. Legacy heuristic keeps 50.
  const minHourScore = canonical ? 60 : 50;
  for (let i = 0; i < scored.length; i++) {
    if (scored[i].score >= minHourScore) {
      if (start === -1) start = i;
      end = i;
    } else if (start !== -1 && end - start >= 1) {
      pushWindow(start, end);
      start = -1;
      end = -1;
    }
  }
  if (start !== -1 && end - start >= 1) {
    pushWindow(start, end);
  }

  return windows.sort((a, b) => b.score - a.score).slice(0, 3);
}
