-- VenTu — alert_subscriptions: NÃO repor grants anon (fix histórico revertido)
--
-- Este ficheiro dava INSERT/UPDATE + sequência a `anon` como «quick fix» para
-- o formulário de subscrição falhar. Isso reabria escritas directas anónimas:
-- verify_token escolhido pelo cliente, sem limite por IP, emails de terceiros.
-- A subscrição legítima corre pelos RPCs SECURITY DEFINER (subscribe_alert),
-- não por escrita directa na tabela.
--
-- Conteúdo trocado por REVOKE/DROP: se um operador correr este ficheiro em
-- qualquer ponto da sequência, o resultado é sempre o estado endurecido
-- (mesmo que supabase-alerts-harden-legacy.sql ainda não tenha corrido).

REVOKE INSERT, UPDATE ON alert_subscriptions FROM anon, authenticated;
REVOKE USAGE, SELECT ON SEQUENCE alert_subscriptions_id_seq FROM anon;
DROP POLICY IF EXISTS "Allow anonymous alert insert" ON alert_subscriptions;
