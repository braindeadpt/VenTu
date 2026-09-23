import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodeEntities, stripTags, htmlToText } = require('../sanitizeText.js');

/**
 * Estes casos são a regressão dos alertas do CodeQL (js/double-escaping e
 * js/incomplete-multi-character-sanitization) que motivaram a lib: o
 * strip por regex sozinho e a descodificação em cadeia deixavam markup vivo.
 */
describe('sanitizeText', () => {
  describe('decodeEntities (uma só passagem)', () => {
    it('descodifica entidades nomeadas e numéricas', () => {
      expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#8217;e&#8217;')).toBe(
        'a & b <c> "d" \'e\'',
      );
    });

    it('NÃO descodifica duas vezes: &amp;lt; fica como texto &lt;', () => {
      expect(decodeEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
    });

    it('deixa entidades desconhecidas intactas', () => {
      expect(decodeEntities('&foo; &')).toBe('&foo; &');
    });

    it('ignora code points inválidos', () => {
      expect(decodeEntities('&#0; &#x110000;')).toBe('&#0; &#x110000;');
    });
  });

  describe('stripTags (contrato: sem `<`/`>`)', () => {
    it('remove tags e descodifica entidades', () => {
      expect(stripTags('<p>Olá <b>mundo</b></p>')).toBe('Olá mundo');
    });

    it('não deixa passar markup escondido por escape duplo', () => {
      const out = stripTags('&amp;lt;img src=x onerror=alert(1)&amp;gt;');
      expect(out).not.toContain('<');
      expect(out).not.toContain('>');
    });

    it('resiste ao bypass de multi-caracteres `<<script>script>`', () => {
      const out = stripTags('<<script>script>alert(1)<</script>/script>');
      expect(out).not.toContain('<');
      expect(out).not.toContain('>');
    });

    it('aceita null/undefined sem rebentar', () => {
      expect(stripTags(null)).toBe('');
      expect(stripTags(undefined)).toBe('');
    });
  });

  describe('htmlToText', () => {
    it('mantém os links em parênteses e as quebras de bloco', () => {
      const out = htmlToText('<p>Vê <a href="https://ventu.surf/pt/">o mapa</a></p><div>Fim</div>');
      expect(out).toContain('o mapa (https://ventu.surf/pt/)');
      expect(out).toContain('\nFim');
    });

    it('garante o contrato «sem `<`/`>`» mesmo com escape duplo', () => {
      const out = htmlToText('<p>&amp;lt;b&amp;gt;negrito&amp;lt;/b&amp;gt;</p>');
      expect(out).not.toContain('<');
      expect(out).not.toContain('>');
    });
  });
});
