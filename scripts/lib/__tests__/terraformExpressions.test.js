import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  validateExpression,
  extractExpressions,
  extractMarkdownExpressions,
  validateTerraformFile,
  validateMarkdownFile,
  checkExpressionDrift,
} = require('../terraformExpressions.js');

const MAIN_TF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../terraform/main.tf',
);
const SECURITY_HEADERS_MD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/SECURITY-HEADERS.md',
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

describe('SECURITY-HEADERS.md WAF expressions (equivalências curl/painel)', () => {
  it('valida as 5 expressões reais do docs/SECURITY-HEADERS.md', () => {
    const result = validateMarkdownFile(SECURITY_HEADERS_MD);
    expect(result.count).toBe(5);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it('extrai as linhas **Filter:** e **Expression:** com a linha real (não atravessa linhas em branco)', () => {
    const md =
      '# Título\n\n' +
      '**Regra 1:**\n' +
      '\n' +
      '\n' +
      '- **Filter:** `starts_with(http.request.uri.path, "/embed/")`\n' +
      '- **Expression:** `ends_with(http.request.uri.path, "/sw.js")`\n' +
      '- **Expression:** `not starts_with(http.request.uri.path, "/api/")`\n' +
      '- qualquer outra linha com `backticks` não conta\n';
    const exprs = extractMarkdownExpressions(md);
    expect(exprs).toHaveLength(3);
    expect(exprs.map((e) => e.where)).toEqual(['markdown@L6', 'markdown@L7', 'markdown@L8']);
    expect(exprs[0].expression).toBe('starts_with(http.request.uri.path, "/embed/")');
    expect(exprs[2].expression).toBe('not starts_with(http.request.uri.path, "/api/")');
  });

  it('deteta expressão inválida no markdown com posição', () => {
    const md =
      '- **Expression:** `starts_with(http.request.uri.path "/x/")`\n' + // vírgula em falta
      '- **Expression:** `ends_with(http.request.uri.path, "/sw.js")`\n';
    const exprs = extractMarkdownExpressions(md);
    expect(exprs).toHaveLength(2);
    const bad = validateExpression(exprs[0].expression);
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/pos \d+:/);
    // a expressão válida do mesmo ficheiro passa
    expect(validateExpression(exprs[1].expression).ok).toBe(true);
  });
});

describe('drift terraform/ ↔ SECURITY-HEADERS.md', () => {
  it('não há drift entre o main.tf e o doc', () => {
    const tf = extractExpressions(require('fs').readFileSync(MAIN_TF, 'utf8'));
    const doc = extractMarkdownExpressions(require('fs').readFileSync(SECURITY_HEADERS_MD, 'utf8'));
    expect(tf).toHaveLength(5);
    expect(doc).toHaveLength(5);
    expect(checkExpressionDrift(tf, doc)).toEqual([]);
  });

  it('deteta expressão que só existe num lado', () => {
    const tf = [{ expression: 'starts_with(http.request.uri.path, "/a/")', where: 'main.tf inline@0' }];
    const doc = [{ expression: 'ends_with(http.request.uri.path, "/b.js")', where: 'markdown@L9' }];
    const problems = checkExpressionDrift(tf, doc);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('markdown@L9');
    expect(problems[1]).toContain('main.tf inline@0');
  });
});
