// Content moderation rules for spot chat
// Simple, lightweight profanity/spam filter
// 
// ⚠️  NOTE: This is CLIENT-SIDE ONLY. Determined abusers can bypass it.
//     The REAL protection is in supabase-schema.sql RLS policies:
//     - Content length: 1-280 chars (enforced at DB level)
//     - Rate limit: max 1 msg per username per 10 seconds (enforced at DB level)
//     - For production, add Cloudflare Turnstile/hCaptcha or Supabase Edge Functions

const BAD_WORDS_PT = [
  'caralho', 'foda', 'merda', 'puta', 'crl', 'fodasse',
  'paneleiro', 'cona', 'piça', 'bosta', 'cabrão', 'filho da puta',
  'fdp', 'crlh', 'fck', 'shit', 'bitch', 'asshole',
];

const SPAM_PATTERNS = [
  /(.+?)\1{4,}/, // Same text repeated 5+ times
  /[A-Z]{10,}/, // ALL CAPS screaming
  /(https?:\/\/\S+).*(https?:\/\/\S+).*(https?:\/\/\S+)/, // 3+ links
];

const MAX_MESSAGE_LENGTH = 280;
const MIN_MESSAGE_LENGTH = 1;
const MAX_USERNAME_LENGTH = 30;
const MIN_USERNAME_LENGTH = 2;

// Characters rejected in usernames (matches server-side validate_username)
const USERNAME_INVALID_CHARS = /[<>"':;{}\\[\\]|\\^~@#$%&*=+]/;
const USERNAME_RESERVED = /bot|test|spam|xss|admin|moderator|system/i;
const USERNAME_STARTS_NUMBER = /^[0-9]/;

// HTML tag pattern (matches server-side sanitize_content)
const HTML_TAG_PATTERN = /<[^>]+>/gi;
const EVENT_HANDLER_PATTERN = /on\w+\s*=\s*["']?[^"'> ]*/gi;
const JS_PROTOCOL_PATTERN = /javascript:/gi;
const DATA_PROTOCOL_PATTERN = /data:/gi;

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  reasonEn?: string;
  sanitized?: string;
}

function containsBadWord(text: string): string | undefined {
  const lower = text.toLowerCase();
  return BAD_WORDS_PT.find(word => lower.includes(word));
}

/**
 * Strip HTML tags and dangerous content from text.
 * Mirrors server-side sanitize_content() in supabase-chat-cleanup.sql
 */
export function sanitizeContent(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(HTML_TAG_PATTERN, '');
  cleaned = cleaned.replace(EVENT_HANDLER_PATTERN, '');
  cleaned = cleaned.replace(JS_PROTOCOL_PATTERN, '');
  cleaned = cleaned.replace(DATA_PROTOCOL_PATTERN, '');
  return cleaned.trim();
}

/**
 * Validate username format.
 * Mirrors server-side validate_username() in supabase-chat-cleanup.sql
 */
export function validateUsername(username: string): { valid: boolean; reason?: string } {
  if (!username || username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    return { valid: false, reason: 'Username must be 2-30 characters' };
  }
  if (USERNAME_INVALID_CHARS.test(username)) {
    return { valid: false, reason: 'Username contains invalid characters' };
  }
  if (USERNAME_RESERVED.test(username)) {
    return { valid: false, reason: 'Username is reserved' };
  }
  if (USERNAME_STARTS_NUMBER.test(username)) {
    return { valid: false, reason: 'Username cannot start with a number' };
  }
  return { valid: true };
}

export function moderateMessage(content: string, locale: string = 'pt'): ModerationResult {
  const isPT = locale === 'pt';
  
  // Check length
  if (content.length > MAX_MESSAGE_LENGTH) {
    return {
      allowed: false,
      reason: isPT ? `Mensagem muito longa (max ${MAX_MESSAGE_LENGTH} caracteres)` : `Message too long (max ${MAX_MESSAGE_LENGTH} chars)`,
      reasonEn: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)`,
    };
  }
  
  if (content.trim().length < MIN_MESSAGE_LENGTH) {
    return {
      allowed: false,
      reason: isPT ? 'Mensagem vazia' : 'Empty message',
      reasonEn: 'Empty message',
    };
  }
  
  // Check for bad words
  const foundBadWord = containsBadWord(content);
  if (foundBadWord) {
    let sanitized = content;
    const regex = new RegExp(foundBadWord, 'gi');
    sanitized = sanitized.replace(regex, '***');
    
    return {
      allowed: true,
      reason: isPT ? 'Conteúdo moderado automaticamente' : 'Content auto-moderated',
      reasonEn: 'Content auto-moderated',
      sanitized,
    };
  }
  
  // Check spam patterns
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(content)) {
      return {
        allowed: false,
        reason: isPT ? 'Detectado como spam' : 'Detected as spam',
        reasonEn: 'Detected as spam',
      };
    }
  }
  
  return { allowed: true };
}

export function moderateUsername(username: string, locale: string = 'pt'): ModerationResult {
  const isPT = locale === 'pt';
  
  // Check length
  if (username.length > MAX_USERNAME_LENGTH) {
    return {
      allowed: false,
      reason: isPT ? `Nome muito longo (max ${MAX_USERNAME_LENGTH} caracteres)` : `Name too long (max ${MAX_USERNAME_LENGTH} chars)`,
      reasonEn: `Name too long (max ${MAX_USERNAME_LENGTH} chars)`,
    };
  }
  
  if (username.trim().length < MIN_USERNAME_LENGTH) {
    return {
      allowed: false,
      reason: isPT ? 'Nome muito curto (min 2 caracteres)' : 'Name too short (min 2 chars)',
      reasonEn: 'Name too short (min 2 chars)',
    };
  }
  
  // Check for bad words in username
  const foundBadWord = containsBadWord(username);
  if (foundBadWord) {
    return {
      allowed: false,
      reason: isPT ? 'Nome contém linguagem inapropriada' : 'Name contains inappropriate language',
      reasonEn: 'Name contains inappropriate language',
    };
  }
  
  return { allowed: true };
}

// Rate limiting per user (simple in-memory — UX helper, NOT real security)
// ⚠️  Resets on page reload (F5). Real rate limit is enforced by RLS at DB level.
const userMessageCounts: Record<string, { count: number; lastReset: number }> = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 messages per minute

export function checkRateLimit(username: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const userData = userMessageCounts[username] || { count: 0, lastReset: now };
  
  // Reset window
  if (now - userData.lastReset > RATE_LIMIT_WINDOW) {
    userData.count = 0;
    userData.lastReset = now;
  }
  
  userData.count++;
  userMessageCounts[username] = userData;
  
  if (userData.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW - (now - userData.lastReset)) / 1000);
    return { allowed: false, retryAfter };
  }
  
  return { allowed: true };
}

// Chat rules display text
export const CHAT_RULES = {
  pt: [
    'Respeita todos os riders',
    'Sem insultos ou linguagem ofensiva',
    'Máximo 5 mensagens por minuto',
    'Fala apenas de surf, vento e ondas',
    'Não spam nem publicidade',
  ],
  en: [
    'Respect all riders',
    'No insults or offensive language',
    'Max 5 messages per minute',
    'Talk about surf, wind and waves only',
    'No spam or advertising',
  ],
};
