import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getTelegramBotUsername,
  isTelegramAlertsEnabled,
  isTelegramLinked,
  telegramDeepLink,
} from '@/lib/userTelegram';

describe('userTelegram helpers', () => {
  const prevBot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = 'VenTuAlertsBot';
  });

  afterEach(() => {
    if (prevBot === undefined) delete process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    else process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = prevBot;
  });

  it('reads bot username without @', () => {
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = '@VenTuAlertsBot';
    expect(getTelegramBotUsername()).toBe('VenTuAlertsBot');
    expect(isTelegramAlertsEnabled()).toBe(true);
  });

  it('hides feature when username missing', () => {
    delete process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    expect(isTelegramAlertsEnabled()).toBe(false);
  });

  it('builds deep link', () => {
    expect(telegramDeepLink('abc123')).toBe('https://t.me/VenTuAlertsBot?start=abc123');
  });

  it('detects linked chat', () => {
    expect(isTelegramLinked(null)).toBe(false);
    expect(
      isTelegramLinked({
        user_id: 'u',
        chat_id: null,
        link_token: 'x',
        link_token_expires: null,
        linked_at: null,
      }),
    ).toBe(false);
    expect(
      isTelegramLinked({
        user_id: 'u',
        chat_id: 42,
        link_token: null,
        link_token_expires: null,
        linked_at: '2026-01-01',
      }),
    ).toBe(true);
  });
});
