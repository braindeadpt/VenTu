/**
 * Unit tests for scripts/check-citation-cff.js (guard do CITATION.cff).
 *
 * Requer o módulo real (guard require.main → sem execução CLI). Cobre o
 * parser YAML mínimo e os caminhos do validador: ficheiro válido, campos
 * obrigatórios em falta, authors vazios/sem nome e DOI mal formado.
 */

import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseCff, validateCff, DOI_RE } = require('../../check-citation-cff.js');

const VALID = `cff-version: 1.2.0
message: >-
  If you use VenTu in your work, please cite the project.
title: "VenTu — Open-source water-sports conditions for Portugal"
authors:
  - name: "braindeadpt"
    website: "https://github.com/braindeadpt"
version: "1.0.0"
date-released: "2026"
license: MIT
url: "https://github.com/braindeadpt/VenTu"
repository-code: "https://github.com/braindeadpt/VenTu"
keywords:
  - surf
  - waves
preferred-citation:
  type: software
  authors:
    - family-names: "Zippenfenig"
      given-names: "Patrick"
  title: "Open-Meteo.com Weather API"
  url: "https://open-meteo.com/"
  doi: "10.5281/zenodo.7970649"
`;

describe('check-citation-cff — parser mínimo de YAML', () => {
  it('parseia top-level, listas e bloco aninhado (preferred-citation)', () => {
    const cff = parseCff(VALID);
    expect(cff['cff-version']).toBe('1.2.0');
    expect(cff.title).toBe('VenTu — Open-source water-sports conditions for Portugal');
    expect(Array.isArray(cff.authors)).toBe(true);
    expect(cff.authors[0].name).toBe('braindeadpt');
    expect(Array.isArray(cff.keywords)).toBe(true);
    expect(cff.keywords).toContain('waves');
    const pc = cff['preferred-citation'];
    expect(pc.type).toBe('software');
    expect(Array.isArray(pc.authors)).toBe(true);
    expect(pc.authors[0]['family-names']).toBe('Zippenfenig');
    expect(pc.doi).toBe('10.5281/zenodo.7970649');
    expect(pc.url).toBe('https://open-meteo.com/');
  });

  it('ignora comentários e linhas em branco', () => {
    const withComments = `# só um comentário\n\ncff-version: 1.2.0\n`;
    const cff = parseCff(withComments);
    expect(cff['cff-version']).toBe('1.2.0');
  });
});

describe('check-citation-cff — validador', () => {
  it('aceita um CITATION.cff válido', () => {
    const { ok, errors } = validateCff(VALID);
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
  });

  it('rejeita cff-version mal formada', () => {
    const { ok, errors } = validateCff(VALID.replace('cff-version: 1.2.0', 'cff-version: latest'));
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes('cff-version'))).toBe(true);
  });

  it('rejeita campos obrigatórios do spec em falta (title, message, authors)', () => {
    const { ok, errors } = validateCff(
      VALID.replace('\ntitle: "VenTu — Open-source water-sports conditions for Portugal"', ''),
    );
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes('title'))).toBe(true);

    const noAuthors = validateCff(VALID.replace(/^authors:\n  - name: "braindeadpt"\n    website: "https:\/\/github.com\/braindeadpt"\n/m, ''));
    expect(noAuthors.ok).toBe(false);
    expect(noAuthors.errors.some((e) => e.includes('authors'))).toBe(true);
  });

  it('rejeita entrada de author sem identificação', () => {
    // Entrada só com website, sem name nem family-names.
    const bad = VALID.replace(
      '  - name: "braindeadpt"\n    website: "https://github.com/braindeadpt"',
      '  - website: "https://github.com/braindeadpt"',
    );
    const { ok, errors } = validateCff(bad);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes('sem name nem family-names'))).toBe(true);
  });

  it('rejeita preferred-citation sem DOI válido', () => {
    const { ok, errors } = validateCff(VALID.replace('doi: "10.5281/zenodo.7970649"', 'doi: "zenodo.7970649"'));
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes('doi inválido'))).toBe(true);
  });

  it('rejeita preferred-citation em falta', () => {
    const { ok, errors } = validateCff(VALID.split('\npreferred-citation:')[0]);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes('preferred-citation'))).toBe(true);
  });

  it('DOI_RE aceita DataCite real e rejeita formatos quebrados', () => {
    expect(DOI_RE.test('10.5281/zenodo.7970649')).toBe(true);
    expect(DOI_RE.test('10.1000/xyz123')).toBe(true);
    expect(DOI_RE.test('zenodo.7970649')).toBe(false);
    expect(DOI_RE.test('10.x/abc')).toBe(false);
    expect(DOI_RE.test('10.5281/')).toBe(false);
  });

  // ── doi do projecto (nível superior, pós-publicação no Zenodo) ───────────
  it('aceita doi do projecto bem formado no topo', () => {
    const { ok, errors } = validateCff(
      VALID + '\ndoi: "10.5281/zenodo.1234567"',
    );
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
  });

  it('rejeita doi do projecto mal formado quando presente', () => {
    const { ok, errors } = validateCff(VALID + '\ndoi: "zenodo.1234567"');
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes('doi (projecto) inválido'))).toBe(true);
  });

  it('doi do projecto ausente é aceite (ainda não publicado)', () => {
    const { ok, errors } = validateCff(VALID);
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
  });
});
