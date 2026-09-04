import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { telegramApi, TelegramApiError, isActionableFailure } = require('../telegram');
const { exitCodeForError } = require('../../telegram-poll');

/** Minimal fetch Response-shaped object for the mocked global fetch. */
function httpRes(status, { statusText = '', body = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  };
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
});
afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  vi.unstubAllGlobals();
});

describe('telegramApi error classification', () => {
  it('502 (5xx) → transient: not actionable, status carried on the error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => httpRes(502, { statusText: 'Bad Gateway' })));
    const err = await telegramApi('getUpdates', {}).catch((e) => e);
    expect(err).toBeInstanceOf(TelegramApiError);
    expect(err.status).toBe(502);
    expect(err.actionable).toBe(false);
  });

  it('401 → actionable: token revoked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => httpRes(401, { body: { description: 'Unauthorized' } })),
    );
    const err = await telegramApi('getUpdates', {}).catch((e) => e);
    expect(err).toBeInstanceOf(TelegramApiError);
    expect(err.status).toBe(401);
    expect(err.actionable).toBe(true);
  });

  it('403 and 404 (unknown bot token) → actionable', async () => {
    for (const status of [403, 404]) {
      vi.stubGlobal('fetch', vi.fn(async () => httpRes(status, { statusText: 'Not Found' })));
      const err = await telegramApi('getUpdates', {}).catch((e) => e);
      expect(err.actionable).toBe(true);
      expect(err.status).toBe(status);
    }
  });

  it('429 (rate limit) → transient', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => httpRes(429, { statusText: 'Too Many Requests' })));
    const err = await telegramApi('getUpdates', {}).catch((e) => e);
    expect(err.actionable).toBe(false);
  });

  it('ok:false with HTTP 200 + auth description → actionable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => httpRes(200, { body: { ok: false, description: 'Unauthorized' } })),
    );
    const err = await telegramApi('getUpdates', {}).catch((e) => e);
    expect(err.actionable).toBe(true);
    expect(err.status).toBe(200);
  });

  it('network-level failure (fetch rejects) → transient with status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const err = await telegramApi('getUpdates', {}).catch((e) => e);
    expect(err).toBeInstanceOf(TelegramApiError);
    expect(err.status).toBe(0);
    expect(err.actionable).toBe(false);
  });

  it('missing token → dry-run result, never reaches the API', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await telegramApi('getUpdates', {});
    expect(res).toEqual({ ok: false, dryRun: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('poll exit-code decision (exitCodeForError)', () => {
  it('transient TelegramApiError → exit 0 (502 case)', () => {
    const err = new TelegramApiError('Telegram getUpdates: Bad Gateway', {
      status: 502,
      actionable: false,
    });
    expect(exitCodeForError(err)).toBe(0);
  });

  it('actionable TelegramApiError → exit 1 (401 case)', () => {
    const err = new TelegramApiError('Telegram getUpdates: Unauthorized', {
      status: 401,
      actionable: true,
    });
    expect(exitCodeForError(err)).toBe(1);
  });

  it('unclassified error (code bug not tied to the API) → exit 0 with distinct log', () => {
    expect(exitCodeForError(new Error('something broke in the merge'))).toBe(0);
  });
});

describe('isActionableFailure (pure classification)', () => {
  it('auth statuses are always actionable', () => {
    expect(isActionableFailure(401, 'Unauthorized')).toBe(true);
    expect(isActionableFailure(403, 'Forbidden')).toBe(true);
    expect(isActionableFailure(404, 'Not Found')).toBe(true);
  });

  it('5xx, 408/409/429 are transient', () => {
    expect(isActionableFailure(500, 'Internal')).toBe(false);
    expect(isActionableFailure(502, 'Bad Gateway')).toBe(false);
    expect(isActionableFailure(503, 'Unavailable')).toBe(false);
    expect(isActionableFailure(408, 'Request Timeout')).toBe(false);
    expect(isActionableFailure(409, 'Conflict')).toBe(false);
    expect(isActionableFailure(429, 'Too Many Requests')).toBe(false);
  });

  it('remaining 4xx (request-shape bug) is actionable', () => {
    expect(isActionableFailure(400, 'Bad Request: chat not found')).toBe(true);
    expect(isActionableFailure(405, 'Method Not Allowed')).toBe(true);
  });
});