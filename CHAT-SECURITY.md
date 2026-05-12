# VenTu Chat — Security Setup

## 🔒 RLS Policies (Database-Level Protection)

The updated `supabase-schema.sql` now includes **Row Level Security** policies that enforce:

| Protection | How | Client Bypassable? |
|---|---|---|
| Content length | `length(content) <= 280 AND length(content) > 0` | ❌ No |
| Rate limit | Max 1 message per username per 10 seconds | ❌ No |
| Read access | Anyone can read (anonymous chat) | N/A |
| Auto-cleanup | Delete messages > 24h old (see below) | N/A |

## 🚀 Setup Instructions

### 1. Create the table

Go to **Supabase Dashboard → SQL Editor** and run the contents of `supabase-schema.sql`.

### 2. Set environment variables

Add to your deployment platform (GitHub Secrets, Vercel, etc.):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Auto-cleanup (optional but recommended)

Messages accumulate indefinitely. Set up cleanup:

**Option A: pg_cron** (if available on your Supabase plan)
```sql
SELECT cron.schedule('cleanup-old-messages', '0 * * * *', 
  $$DELETE FROM messages WHERE created_at < NOW() - INTERVAL '24 hours'$$);
```

**Option B: GitHub Actions workflow**
Create `.github/workflows/cleanup-chat.yml` to run cleanup via Supabase API.

**Option C: Manual**
Run periodically in Supabase SQL Editor:
```sql
DELETE FROM messages WHERE created_at < NOW() - INTERVAL '24 hours';
```

## ⚠️ Known Limitations

- **Username rotation**: Abusers can change `localStorage` username to bypass per-user rate limits. Consider adding CAPTCHA (Turnstile/hCaptcha) for production.
- **No auth required**: Anonymous chat by design — for authenticated chat, switch to Supabase Auth.
- **Edge Functions**: For stricter validation (IP-based rate limiting, CAPTCHA verification), consider adding a Supabase Edge Function as middleware.

## 🛡️ Client-Side vs Server-Side

| Layer | What it does | Real protection? |
|---|---|---|
| `chatModeration.ts` | Profanity filter, spam patterns, UX rate limit | ⚠️ UX only, bypassable |
| `SpotChat.tsx` | Input validation, maxLength=280 | ⚠️ UX only, bypassable |
| **RLS Policy (DB)** | Content length, rate limit | ✅ **Real protection** |
| **Auto-cleanup** | Deletes old messages | ✅ **Real protection** |

## 📝 Comment Fixed

The previous comment in `supabase-config.ts` incorrectly stated "no RLS write". This has been corrected — the RLS policy now actively restricts writes with validation.
