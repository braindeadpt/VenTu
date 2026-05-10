// Content moderation rules for spot chat
// Simple, lightweight profanity/spam filter

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

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  reasonEn?: string;
  sanitized?: string;
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
  const lower = content.toLowerCase();
  const foundBadWord = BAD_WORDS_PT.find(word => lower.includes(word));
  if (foundBadWord) {
    // Sanitize — replace bad word with ***
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

// Rate limiting per user (simple in-memory)
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