import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { GATED_TRIGGERS, evaluateIhHealthGate } = require('../ihHealthGate.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..', '..');

/** Meio-dia em Lisboa (dia) e 03:00 em Lisboa (noite) — limiares 3 h / 5 h. */
const DAY = new Date('2026-09-25T12:00:00Z').getTime();
const NIGHT = new Date('2026-09-25T02:00:00Z').getTime();
const hoursAgo = (nowMs, h) => new Date(nowMs - h * 3600_000).toISOString();

const meta = (nowMs, { full = 0.2, obs = 0.2 } = {}) => ({
  fullUpdatedAt: hoursAgo(nowMs, full),
  observationsUpdatedAt: hoursAgo(nowMs, obs),
});

const gate = (over = {}) =>
  evaluateIhHealthGate({ eventName: 'repository_dispatch', nowMs: DAY, ...over });

describe('ihHealthGate — sonda só quando há motivo', () => {
  it('gateia o ping (repository_dispatch) e só ele', () => {
    expect(GATED_TRIGGERS).toEqual(['repository_dispatch']);
  });

  it('schedule e workflow_dispatch sondam sempre (cadência do monitor)', () => {
    for (const eventName of ['schedule', 'workflow_dispatch', '']) {
      const d = evaluateIhHealthGate({ eventName, meta: meta(DAY), lastCommitAtMs: DAY - 60_000, nowMs: DAY });
      expect(d.probe, eventName).toBe(true);
      expect(d.gated, eventName).toBe(false);
    }
  });

  it('ping num sistema saudável não sonda', () => {
    const d = gate({
      meta: meta(DAY),
      lastCommitAtMs: DAY - 30 * 60_000,
      openIncidents: false,
    });
    expect(d.probe).toBe(false);
    expect(d.gated).toBe(true);
    expect(d.signals).toEqual([]);
    expect(d.reason).toMatch(/saltada/);
  });

  it('ping com pipeline-meta atrasado sonda (full ou obs)', () => {
    const full = gate({
      meta: meta(DAY, { full: 3.5, obs: 0.2 }),
      lastCommitAtMs: DAY - 60_000,
    });
    expect(full.probe).toBe(true);
    expect(full.signals).toContain('pipeline-meta');
    expect(full.reason).toMatch(/pipeline-meta\.json atrasado/);

    const obs = gate({
      meta: meta(DAY, { full: 0.2, obs: 4.0 }),
      lastCommitAtMs: DAY - 60_000,
    });
    expect(obs.probe).toBe(true);
    expect(obs.signals).toContain('pipeline-meta');
  });

  it('ping com último commit de dados atrasado sonda (mesmo com meta fresco)', () => {
    const d = gate({ meta: meta(DAY), lastCommitAtMs: DAY - 4.2 * 3600_000 });
    expect(d.probe).toBe(true);
    expect(d.signals).toContain('data-commit');
    expect(d.reason).toMatch(/último commit de public\/data/);
  });

  it('usa os limiares dos heartbeats: 4 h é atrasado de dia, fresco de noite', () => {
    const day = gate({ meta: meta(DAY, { full: 4, obs: 4 }), lastCommitAtMs: DAY - 60_000 });
    expect(day.probe).toBe(true);
    expect(day.metaStaleness.thresholdHours).toBe(3);
    expect(day.metaStaleness.isDaytime).toBe(true);

    const night = evaluateIhHealthGate({
      eventName: 'repository_dispatch',
      meta: meta(NIGHT, { full: 4, obs: 4 }),
      lastCommitAtMs: NIGHT - 4 * 3600_000,
      nowMs: NIGHT,
    });
    expect(night.probe).toBe(false);
    expect(night.metaStaleness.thresholdHours).toBe(5);
    expect(night.metaStaleness.isDaytime).toBe(false);
  });

  it('incidente aberto abre a sonda mesmo com o pipeline saudável (recuperação)', () => {
    const d = gate({ meta: meta(DAY), lastCommitAtMs: DAY - 60_000, openIncidents: true });
    expect(d.probe).toBe(true);
    expect(d.reason).toMatch(/incidente aberto/);
  });

  it('mostra o estado medido mesmo quando outro motivo abre a sonda', () => {
    const d = gate({
      meta: meta(DAY, { full: 6, obs: 6 }),
      lastCommitAtMs: DAY - 6 * 3600_000,
      openIncidents: true,
    });
    expect(d.probe).toBe(true);
    expect(d.reason).toMatch(/incidente aberto/);
    expect(d.reason).toMatch(/pipeline também atrasado/);
    expect(d.signals).toEqual(['pipeline-meta', 'data-commit']);
    expect(d.metaStaleness.stale).toBe(true);
    expect(d.dataCadence.stale).toBe(true);
  });

  it('IH_HEALTH_FORCE=1 sonda sempre', () => {
    const d = gate({ meta: meta(DAY), lastCommitAtMs: DAY - 60_000, force: true });
    expect(d.probe).toBe(true);
    expect(d.reason).toMatch(/forçada/);
  });

  it('fail-open: sem meta (ou meta ilegível) sonda', () => {
    const d = gate({ meta: null, lastCommitAtMs: DAY - 60_000 });
    expect(d.probe).toBe(true);
    expect(d.reason).toMatch(/sem timestamps|atrasado/);
  });

  it('API de commits indisponível não bloqueia o skip (o meta decide)', () => {
    const fresh = gate({ meta: meta(DAY), lastCommitAtMs: null });
    expect(fresh.probe).toBe(false);
    expect(fresh.signals).toContain('data-commit-desconhecido');

    const stale = gate({ meta: meta(DAY, { full: 5, obs: 5 }), lastCommitAtMs: null });
    expect(stale.probe).toBe(true);
  });

  it('sem meta E sem commit sonda (fail-open total)', () => {
    const d = gate({ meta: null, lastCommitAtMs: null });
    expect(d.probe).toBe(true);
  });

  it('meta com timestamps inválidos conta como atrasado', () => {
    const d = gate({
      meta: { fullUpdatedAt: 'não é data', observationsUpdatedAt: 'também não' },
      lastCommitAtMs: DAY - 60_000,
    });
    expect(d.probe).toBe(true);
  });
});

/** Blocos de passo do workflow (indentação `      - `), por nome. */
function workflowSteps(yml) {
  const lines = yml.replace(/\r\n/g, '\n').split('\n');
  const steps = [];
  let current = null;
  for (const line of lines) {
    if (/^ {6}- /.test(line)) {
      if (current) steps.push(current);
      // `- name: X` fica na mesma linha que abre o passo.
      const inline = /^ {6}- name:\s*(.+)$/.exec(line);
      current = { name: inline ? inline[1].trim() : '', text: line };
      continue;
    }
    if (!current) continue;
    current.text += `\n${line}`;
    const m = /^ {8}name:\s*(.+)$/.exec(line);
    if (m) current.name = m[1].trim();
  }
  if (current) steps.push(current);
  return steps;
}

describe('ih-health.yml — fiação do gate', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ih-health.yml'), 'utf-8');
  const steps = workflowSteps(yml);

  it('tem o passo do gate a correr scripts/ih-health-gate.js com id estável', () => {
    const gate = steps.find((s) => /ih-health-gate\.js/.test(s.text));
    expect(gate, 'passo do gate ausente do workflow').toBeTruthy();
    expect(gate.text).toMatch(/^ {8}id: gate$/m);
    expect(gate.text).toMatch(/GH_TOKEN/);
  });

  it('os dois passos de sonda dependem do output do gate', () => {
    const probes = steps.filter((s) => /^Probe /.test(s.name));
    expect(probes.map((p) => p.name)).toEqual([
      'Probe IH tide backend and alert on recovery',
      'Probe IPMA radar product and alert on recovery',
    ]);
    for (const p of probes) {
      expect(p.text, `${p.name}: sem if: do gate`).toMatch(
        /^ {8}if:\s*steps\.gate\.outputs\.probe == 'true'$/m,
      );
    }
  });

  it('o gate corre ANTES das sondagens', () => {
    const gateIdx = steps.findIndex((s) => /ih-health-gate\.js/.test(s.text));
    const firstProbe = steps.findIndex((s) => /^Probe /.test(s.name));
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(firstProbe);
  });
});
