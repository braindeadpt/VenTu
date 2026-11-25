-- ============================================================
-- VenTu — Self-service account deletion
-- Run once in Supabase SQL Editor after supabase-auth-profiles.sql.
-- supabase-alerts.sql / supabase-directory.sql are NOT hard prerequisites:
-- each cleanup block is guarded by to_regclass() and simply has nothing to
-- scrub when the table does not exist — but in production all three are
-- applied, so apply this one LAST for the full sweep.
-- ============================================================
-- Everything runs in the single transaction of the RPC call: either every
-- step succeeds or the account is not deleted at all (no half-scrubbed
-- state). What happens, in order:
--
-- 1. LEGACY ALERTS — alert_subscriptions is keyed by EMAIL, not user_id
--    (E1 legacy, pre-account), so nothing cascades there. Without this
--    delete, the «your alerts are erased» promise broke for anyone who
--    subscribed with the same address they later used for the account.
--
-- 2. DIRECTORY — personal data is scrubbed BEFORE the user row delete
--    because the protect triggers restore owner_user_id/verified_by on
--    UPDATE for any non-admin JWT: they cannot tell a user write apart
--    from the FK ON DELETE SET NULL action, and by the time that action
--    fires the account no longer exists, so is_ventu_admin() can never
--    be true there — the cascade alone leaves dangling references to the
--    deleted account (proven in supabase/tests/test-delete-account.sql).
--    The updates here therefore run inside a transaction-local bypass GUC
--    (ventu.delete_own_account_cleanup) that only this RPC can set — the
--    PostgREST API executes no arbitrary SET, and the setting dies with
--    the transaction. What is removed vs kept, and why:
--      · UNVERIFIED listings owned by the caller with source 'submitted'
--        (id 'sub-%'), plus their directory_profiles rows, are DELETED:
--        a never-published submission is the owner's personal draft, not
--        public business content, and with the account gone it could never
--        be managed or meaningfully moderated again.
--      · VERIFIED listings STAY — they are vetted public business content
--        (a school/shop does not cease to exist because the manager left)
--        — but orphaned: owner_user_id becomes NULL. Curated/OSM-sourced
--        rows are never deleted either, verified or not.
--      · The account EMAIL is nulled in directory_listings/email and
--        directory_profiles/email wherever it matches exactly (case
--        insensitive), owned or not: the register form copies it from the
--        account silently, so it is personal data — unlike the phone or
--        website, which the user typed deliberately as business contacts.
--      · verified_by / reviewed_by are nulled where they reference the
--        caller: those FKs are NO ACTION, so without this step the user
--        delete fails with a foreign-key violation for ANY admin who ever
--        verified a listing or reviewed a claim. The cost is losing «which
--        admin» moderated those rows; the alternative — a dangling
--        reference or a blocked erasure — is worse.
--    What deliberately stays: business names, addresses, phones, websites
--    of published listings (public directory content), and the row-level
--    moderation audit timestamps. A post-condition then verifies no
--    ownership reference survives: if production still runs a pre-bypass
--    version of the directory triggers (manual apply-order mistake), the
--    whole deletion aborts loudly instead of leaving dangling references.
--
-- 3. DELETE FROM auth.users — every user-keyed personal table cascades
--    (profiles, favorites, check-ins/passport, alert prefs, telegram link,
--    the caller's own directory claims with their contact_email).
--
-- No rate limit here: deletion is a rare authenticated action and Supabase
-- Auth already throttles sessions. The function is still locked down as an
-- RPC: executable only by authenticated users, never by anon/PUBLIC.
--
-- Idempotent in effect: a second call fails fast with 'not authenticated'
-- because the session is already dead.

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- ── 1. Alertas legacy E1 (keyed por email — não cascateiam) ──
  IF v_email IS NOT NULL AND to_regclass('public.alert_subscriptions') IS NOT NULL THEN
    DELETE FROM alert_subscriptions WHERE lower(email) = lower(v_email);
  END IF;

  -- ── 2. Directório: rascunhos apagados, negócio publicado órfão+scrub ──
  IF to_regclass('public.directory_listings') IS NOT NULL THEN
    PERFORM set_config('ventu.delete_own_account_cleanup', 'on', true);

    -- 2a. Submissões nunca publicadas do próprio (rascunhos pessoais) —
    -- perfis primeiro, a ficha depois.
    DELETE FROM directory_profiles
    WHERE entry_id IN (
      SELECT id FROM directory_listings
      WHERE owner_user_id = v_uid
        AND verified = false
        AND source = 'submitted'
        AND id LIKE 'sub-%'
    );

    DELETE FROM directory_listings
    WHERE owner_user_id = v_uid
      AND verified = false
      AND source = 'submitted'
      AND id LIKE 'sub-%';

    -- 2b. Tudo o resto que o utilizador detinha fica órfão (conteúdo de
    -- negócio verificado, ou origem curada/OSM). Sem o bypass do trigger
    -- esta escrita era revertida e a referência sobrevivia à conta.
    UPDATE directory_listings SET owner_user_id = NULL WHERE owner_user_id = v_uid;
    UPDATE directory_profiles SET owner_user_id = NULL WHERE owner_user_id = v_uid;

    -- 2c. Email pessoal da conta — copiado para a ficha pelo formulário de
    -- registo — sai de qualquer ficha/perfil onde coincida exactamente.
    IF v_email IS NOT NULL THEN
      UPDATE directory_listings SET email = NULL WHERE lower(email) = lower(v_email);
      UPDATE directory_profiles SET email = NULL WHERE lower(email) = lower(v_email);
    END IF;

    -- 2d. Refs de moderação NO ACTION — sem isto, o DELETE de auth.users
    -- falhava com FK violation para qualquer admin que tivesse moderado.
    UPDATE directory_listings SET verified_by = NULL WHERE verified_by = v_uid;
    UPDATE directory_claims SET reviewed_by = NULL WHERE reviewed_by = v_uid;

    -- Pós-condição: nenhuma referência de ownership pode sobreviver. Se o
    -- directório aplicado em produção for uma versão ANTERIOR ao bypass
    -- (ordem de aplicação manual errada), os triggers revertiam 2b em
    -- silêncio — melhor falhar alto e abortar a eliminação (rollback total)
    -- do que deixar fichas ligadas a uma conta inexistente.
    IF EXISTS (SELECT 1 FROM directory_listings WHERE owner_user_id = v_uid)
       OR EXISTS (SELECT 1 FROM directory_profiles WHERE owner_user_id = v_uid) THEN
      RAISE EXCEPTION 'directory cleanup incomplete — reapply supabase-directory.sql before supabase-delete-account.sql';
    END IF;

    PERFORM set_config('ventu.delete_own_account_cleanup', 'off', true);
  END IF;

  -- ── 3. A linha-mãe: cascateia todos os dados pessoais keyados por user_id ──
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
