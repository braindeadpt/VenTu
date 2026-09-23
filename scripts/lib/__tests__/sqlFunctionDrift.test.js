/**
 * Testes do guard de drift das funções SQL (auditoria LOW8).
 *
 * Fixa o contrato: a mesma função public.* definida em dois ficheiros é drift
 * (o CREATE OR REPLACE faz ganhar a última aplicação, silenciosamente);
 * repetições no MESMO ficheiro são idempotência legítima; DROP não define.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { findDuplicateFunctionDefinitions } = require('../../check-sql-function-drift.js');

const def = (name) =>
  `CREATE OR REPLACE FUNCTION public.${name}()\nRETURNS BOOLEAN\nLANGUAGE sql\nAS $$ SELECT true; $$;`;

describe('check-sql-function-drift', () => {
  it('detecta a mesma função em dois ficheiros', () => {
    const dup = findDuplicateFunctionDefinitions([
      { file: 'a.sql', sql: def('is_ventu_admin') },
      { file: 'b.sql', sql: `-- copy\n${def('is_ventu_admin')}` },
    ]);
    expect(dup).toEqual([{ fn: 'is_ventu_admin', files: ['a.sql', 'b.sql'] }]);
  });

  it('não assinala definições únicas nem funções distintas por ficheiro', () => {
    const dup = findDuplicateFunctionDefinitions([
      { file: 'a.sql', sql: `${def('is_ventu_admin')}\n${def('check_rate_limit')}` },
      { file: 'b.sql', sql: def('request_client_ip') },
    ]);
    expect(dup).toEqual([]);
  });

  it('repetir a definição no mesmo ficheiro (idempotência) não é drift', () => {
    const dup = findDuplicateFunctionDefinitions([
      { file: 'a.sql', sql: `${def('check_rate_limit')}\n${def('check_rate_limit')}` },
    ]);
    expect(dup).toEqual([]);
  });

  it('ignora DROP FUNCTION (não é definição)', () => {
    const dup = findDuplicateFunctionDefinitions([
      { file: 'a.sql', sql: def('subscribe_alert') },
      { file: 'b.sql', sql: 'DROP FUNCTION IF EXISTS public.subscribe_alert(TEXT, TEXT, TEXT);' },
    ]);
    expect(dup).toEqual([]);
  });
});
