import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { validateExpression, extractExpressions, validateTerraformFile } = require(
  '../terraformExpressions.js',
);

const MAIN_TF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../terraform/main.tf',
);

// Garantia: as expressões WAF versionadas em terraform/ nunca regridem para
// sintaxe que o Cloudflare Ruleset Engine rejeite no apply (parêntesis,
// strings, funções, operadores infix, sets, subscripts).
describe('terraform WAF expressions (ruleset engine syntax)', () => {
  it('valida as 5 expressões reais do terraform/main.tf', () => {
    const result = validateTerraformFile(MAIN_TF);
    expect(result.count).toBe(5);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it('extrai as expressões do HCL (heredoc + inline com escapes)', () => {
    const hcl = `expression = <<-EOT
  starts_with(http.request.uri.path, "/embed/")
EOT
resource "x" {
  expression = "ends_with(http.request.uri.path, \\"/sw.js\\")"
}`;
    const exprs = extractExpressions(hcl);
    expect(exprs).toHaveLength(2);
    expect(exprs[0].expression).toBe('starts_with(http.request.uri.path, "/embed/")');
    expect(exprs[1].expression).toBe('ends_with(http.request.uri.path, "/sw.js")');
  });

  it('aceita as construções válidas do ruleset engine', () => {
    const valid = [
      'starts_with(http.request.uri.path, "/api/")',
      'ends_with(http.request.uri.path, ".html")',
      'not starts_with(http.request.uri.path, "/embed/")',
      'http.request.method in {"GET" "POST"}',
      'http.request.uri.path contains "/articles/"',
      'http.request.uri.path matches "^/admin"',
      'http.request.uri.path == "/pt/"',
      'any(http.request.headers["content-type"][*] contains "json")',
      'lower(http.host) == "www.cloudflare.com"',
      '(starts_with(http.request.uri.path, "/a/") or starts_with(http.request.uri.path, "/b/")) and not ends_with(http.request.uri.path, "/skip/")',
    ];
    for (const expr of valid) {
      const r = validateExpression(expr);
      expect(r.ok, `deveria aceitar: ${expr} — ${r.errors.join('; ')}`).toBe(true);
    }
  });

  it('rejeita sintaxe inválida', () => {
    const invalid = [
      'starts_with(http.request.uri.path "/embed/")', // vírgula em falta
      'starts_with(/data/)', // token inválido
      'starts_with(http.request.uri.path, )', // argumento vazio
      'starts_with(http.request.uri.path', // parêntesis não fechado
      '(starts_with(http.request.uri.path, "/x/")', // parêntesis desequilibrado
      'starts_with(http.request.uri.path, "/x"', // ) em falta no fim
      'foobar(http.request.uri.path, "/x/")', // função desconhecida
      'starts_with("literal", "/x/")', // fonte não pode ser literal (semântica)
      'starts_with(http.request.uri.path)', // arity: faltam os 2 argumentos
      'http.request.uri.path + 2', // operador fora da linguagem
      'starts_with(http.request.uri.path, "unterminated)', // string não terminada
      'http.request.uri.path starts_with "/api"', // starts_with NÃO é operador infix
      'http.request.method in {GET "POST"}', // set sem aspas
      '', // expressão vazia
    ];
    for (const expr of invalid) {
      const r = validateExpression(expr);
      expect(r.ok, `deveria rejeitar: ${expr}`).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it('mensagens de erro apontam posição', () => {
    const r = validateExpression('starts_with(http.request.uri.path, )');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/pos \d+:/);
  });
});
