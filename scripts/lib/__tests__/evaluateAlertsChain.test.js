/**
 * evaluate-alerts.js — cadeia completa de alertas de forma HERMÉTICA.
 *
 * Requer scripts/evaluate-alerts.js (guard require.main → sem Supabase/rede ao
 * importar) e mocka o fetch global para servir o Supabase (prefs + favoritos +
 * chat Telegram), o Resend (email) e o Telegram (sendMessage). Com condições
 * com Agitação Marítima activa, valida a linha «Mar perigoso»:
 *   - EMAIL: linha com área + texto oficial do IPMA (seaWarningEmailLine) e
 *     o assunto com prefixo «⚠️ Mar perigoso — »;
 *   - TELEGRAM: a linha compacta (seaWarningLine) no tgText por spot.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { evaluateUserFavoritesAlerts } = require('../../evaluate-alerts.js');

const SEA = {
  areaCode: 'LSB',
  areaLabel: 'Lisboa',
  type: 'Agitação Marítima',
  level: 'orange',
  text: 'Ondulação de NW com ondas de 4 a 5 metros.',
  relevant: true,
};

const CONDITIONS = {
  guincho: { waveHeight: 2.0, wavePeriod: 12, windSpeed: 5, windDirection: 300, windGust: 7, waterTemp: 16 },
};

const PREFS = [
  {
    id: 1,
    user_id: 'u1',
    email: 'u1@example.com',
    locale: 'pt',
    sport: 'surf',
    min_score: 1,
    alert_mode: 'immediate',
    verified: true,
    verify_token: 'tok1',
    last_sent_at: null,
  },
];

function mockRes(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

let emailCaptured = null;
let tgCaptured = null;

function installMockFetch() {
  emailCaptured = null;
  tgCaptured = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opts = {}) => {
      const method = opts.method || 'GET';
      const u = String(url);
      if (u.includes('api.resend.com/emails')) {
        emailCaptured = JSON.parse(opts.body);
        return mockRes({ id: 'email1' }, 200);
      }
      if (u.includes('api.telegram.org/bot') && u.includes('/sendMessage')) {
        tgCaptured = JSON.parse(opts.body).text;
        return mockRes({ ok: true }, 200);
      }
      if (u.includes('/rest/v1/user_alert_prefs') && method === 'GET') {
        return mockRes(PREFS);
      }
      if (u.includes('/rest/v1/user_favorites')) {
        return mockRes([{ spot_id: 'guincho' }]);
      }
      if (u.includes('/rest/v1/user_telegram')) {
        return mockRes([{ chat_id: 123 }]);
      }
      // PATCH markUserPrefsSent e qualquer outro endpoint — resposta neutra.
      return mockRes({}, 200);
    }),
  );
  vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:test');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('evaluateUserFavoritesAlerts — cadeia hermética com Agitação Marítima', () => {
  it('PT: email com área+texto oficial e Telegram com a linha compacta', async () => {
    installMockFetch();
    const warnings = { source: 'ipma', fetchedAt: new Date().toISOString(), warnings: [SEA], spotWarnings: { guincho: [SEA] } };

    const result = await evaluateUserFavoritesAlerts(
      { guincho: 'guincho' },
      CONDITIONS,
      warnings,
      {},
    );

    // O alerta disparou (score 70 ≥ limiar 1) e foi enviado.
    expect(result.userPrefsCount).toBe(1);
    expect(result.userDigestSent).toBe(1);

    // EMAIL: assunto com o prefixo e a linha completa (área + texto oficial).
    expect(emailCaptured).not.toBeNull();
    expect(emailCaptured.subject).toMatch(/^⚠️ Mar perigoso — /);
    expect(emailCaptured.html).toContain(
      '⚠️ Mar perigoso — agitação marítima (laranja) — Lisboa: Ondulação de NW com ondas de 4 a 5 metros.',
    );
    expect(emailCaptured.html).toContain('guincho');

    // TELEGRAM: linha compacta por spot (mesma redacção do hero).
    expect(tgCaptured).not.toBeNull();
    expect(tgCaptured).toContain('• guincho — ');
    expect(tgCaptured).toContain('⚠️ Mar perigoso — agitação marítima (laranja)');
  });

  it('EN: «Dangerous sea» com área+texto no email e compacta no Telegram', async () => {
    installMockFetch();
    PREFS[0].locale = 'en';
    const warnings = { source: 'ipma', fetchedAt: new Date().toISOString(), warnings: [SEA], spotWarnings: { guincho: [SEA] } };

    await evaluateUserFavoritesAlerts({ guincho: 'guincho' }, CONDITIONS, warnings, {});

    expect(emailCaptured.subject).toMatch(/^⚠️ Dangerous sea — /);
    expect(emailCaptured.html).toContain(
      '⚠️ Dangerous sea — sea state warning (orange) — Lisboa: Ondulação de NW com ondas de 4 a 5 metros.',
    );
    expect(tgCaptured).toContain('⚠️ Dangerous sea — sea state warning (orange)');
    PREFS[0].locale = 'pt'; // restaura para os restantes testes
  });

  it('sem Agitação Marítima → NENHUMA linha «Mar perigoso» no email nem no Telegram', async () => {
    installMockFetch();
    const warnings = { source: 'ipma', fetchedAt: new Date().toISOString(), warnings: [], spotWarnings: { guincho: [] } };

    const result = await evaluateUserFavoritesAlerts(
      { guincho: 'guincho' },
      CONDITIONS,
      warnings,
      {},
    );
    expect(result.userDigestSent).toBe(1);

    expect(emailCaptured.subject).not.toMatch(/Mar perigoso|Dangerous sea/);
    expect(emailCaptured.html).not.toContain('Mar perigoso');
    expect(tgCaptured).not.toContain('Mar perigoso');
    expect(tgCaptured).not.toContain('Dangerous sea');
  });
});

describe('evaluateUserFavoritesAlerts — B4 warn (aviso oficial sem score)', () => {
  const WARNINGS = {
    source: 'ipma',
    fetchedAt: new Date().toISOString(),
    warnings: [SEA],
    spotWarnings: { guincho: [SEA] },
  };

  afterEach(() => {
    PREFS[0].warn = false;
    PREFS[0].min_score = 1;
    PREFS[0].alert_mode = 'immediate';
  });

  it('warn=true + aviso laranja + score abaixo → email/Telegram de aviso', async () => {
    installMockFetch();
    PREFS[0].warn = true;
    PREFS[0].min_score = 100; // nunca dispara por score

    const result = await evaluateUserFavoritesAlerts(
      { guincho: 'guincho' },
      CONDITIONS,
      WARNINGS,
      {},
      null,
    );

    expect(result.userDigestSent).toBe(1);
    expect(result.userWarnSent).toBe(1);
    // Email: assunto dedicado + linha de aviso com texto oficial, sem score.
    expect(emailCaptured.subject).toBe('VenTu — ⚠️ aviso oficial em 1 favorito(s)');
    expect(emailCaptured.html).toContain('Avisos oficiais em vigor nos teus favoritos');
    expect(emailCaptured.html).toContain('⚠️ Aviso laranja — Agitação Marítima — Lisboa');
    expect(emailCaptured.html).toContain('Ondulação de NW com ondas de 4 a 5 metros');
    expect(emailCaptured.html).not.toContain('score ');
    // Telegram: cabeçalho de aviso + linha compacta.
    expect(tgCaptured).toContain('aviso oficial em 1 favorito');
    expect(tgCaptured).toContain('⚠️ Aviso laranja — Agitação Marítima');
  });

  it('warn=false (default) → silêncio sem score, mesmo com aviso (E1c intacto)', async () => {
    installMockFetch();
    PREFS[0].min_score = 100;

    const result = await evaluateUserFavoritesAlerts(
      { guincho: 'guincho' },
      CONDITIONS,
      WARNINGS,
      {},
      null,
    );

    expect(result.userDigestSent).toBe(0);
    expect(result.userWarnSent).toBe(0);
    expect(emailCaptured).toBeNull();
    expect(tgCaptured).toBeNull();
  });

  it('warn=true mas só aviso amarelo → não dispara', async () => {
    installMockFetch();
    PREFS[0].warn = true;
    PREFS[0].min_score = 100;
    const warnings = {
      spotWarnings: { guincho: [{ type: 'Precipitação', level: 'yellow', areaLabel: 'Lisboa' }] },
    };

    const result = await evaluateUserFavoritesAlerts(
      { guincho: 'guincho' },
      CONDITIONS,
      warnings,
      {},
      null,
    );

    expect(result.userDigestSent).toBe(0);
    expect(emailCaptured).toBeNull();
  });

  it('perigo §0 do IH (arriba instável) dispara warn sem aviso IPMA', async () => {
    installMockFetch();
    PREFS[0].warn = true;
    PREFS[0].min_score = 100;
    const coastal = {
      warnings: [{ id: 7, ref: 'ANAV 42/26', category: 'Arriba instável — perigo' }],
      coverage: { guincho: [7] },
    };

    const result = await evaluateUserFavoritesAlerts(
      { guincho: 'guincho' },
      CONDITIONS,
      null,
      coastal,
      null,
    );

    expect(result.userWarnSent).toBe(1);
    expect(emailCaptured.html).toContain('Perigo na água (IH): ANAV 42/26');
  });

  it('cone NHC cobre o favorito → 🌀 no alerta', async () => {
    installMockFetch();
    PREFS[0].warn = true;
    PREFS[0].min_score = 100;
    const storms = {
      spotStorms: {
        guincho: [
          { name: 'Hanna', classificationLabel: 'Tempestade tropical', centerDistKm: 240 },
        ],
      },
    };

    const result = await evaluateUserFavoritesAlerts(
      { guincho: 'guincho' },
      CONDITIONS,
      null,
      {},
      storms,
    );

    expect(result.userWarnSent).toBe(1);
    expect(emailCaptured.html).toContain('🌀 Hanna — Tempestade tropical');
    expect(emailCaptured.html).toContain('cone de incerteza oficial (NOAA/NHC)');
  });

  it('score firing + warn no mesmo spot → prefixo ⚠️ e linha no item', async () => {
    installMockFetch();
    PREFS[0].warn = true;
    // min_score 1 → guincho dispara por score E tem aviso de vento (não-mar).
    const warnings = {
      spotWarnings: {
        guincho: [{ type: 'Vento', level: 'orange', areaLabel: 'Lisboa', text: 'Rajadas a 90 km/h.' }],
      },
    };

    const result = await evaluateUserFavoritesAlerts(
      { guincho: 'guincho' },
      CONDITIONS,
      warnings,
      {},
      null,
    );

    expect(result.userDigestSent).toBe(1);
    expect(result.userWarnSent).toBe(1);
    expect(emailCaptured.subject).toMatch(/^⚠️ VenTu — 1 favorito/);
    expect(emailCaptured.html).toContain('⚠️ Aviso laranja — Vento — Lisboa: Rajadas a 90 km/h.');
  });
});
