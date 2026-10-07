import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Retenção dos frames do satélite MTG (scripts/fetch-mtg-ir.py) e a sua
 * publicação (scripts/push-data-update.sh).
 *
 * 7 out 2026: public/data/sat-mtg/frames chegou a 46 ficheiros / 36.6 MB com o
 * manifest a usar 4 — o CI parou no orçamento de public/data (32 MB). Duas
 * causas: (1) o caminho «tudo já em disco» do script reescrevia o manifest sem
 * podar e uma corrida morta a meio não podava nada; (2) o push-data-update.sh
 * faz checkout de origin/main e `cp -a` por cima — os frames podados voltavam
 * do origin em cada commit do bot (o mesmo bug que o radar já tinha tido).
 */
const root = process.cwd();
const SCRIPT = path.join(root, 'scripts/fetch-mtg-ir.py');

const hasPython = spawnSync('python3', ['--version']).status === 0;

/** Corre um snippet Python com o módulo fetch-mtg-ir carregado como `m`. */
function py(snippet: string): unknown {
  const code = [
    'import importlib.util, json, sys, tempfile, pathlib',
    `spec = importlib.util.spec_from_file_location("fetch_mtg_ir", ${JSON.stringify(SCRIPT)})`,
    'm = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(m)',
    snippet,
  ].join('\n');
  const out = execFileSync('python3', ['-c', code], { encoding: 'utf8' });
  const last = out.trim().split('\n').pop() ?? 'null';
  return JSON.parse(last);
}

const frame = (hhmm: string, kind = 'ir') =>
  `{"frameTime": "2026-10-07T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00.000Z", "imagePath": "sat-mtg/frames/${kind}-2026-10-07T${hhmm}.webp", "kind": "${kind}"}`;

describe.skipIf(!hasPython)('fetch-mtg-ir.py — retenção de frames', () => {
  it('MAX_FRAMES fica na janela do carrossel (12, como o GOES)', () => {
    expect(py('print(json.dumps(m.MAX_FRAMES))')).toBe(12);
  });

  it('retain_frames: mais recentes primeiro, sem duplicados, cortado ao máximo', () => {
    const frames = Array.from({ length: 20 }, (_, i) =>
      frame(String(Math.floor(i / 6)).padStart(2, '0') + String((i % 6) * 10).padStart(2, '0')),
    );
    const got = py(
      `fr = [${frames.join(',')}] + [${frame('0310')}]\n` +
        'r = m.retain_frames(fr)\n' +
        'print(json.dumps([f["frameTime"] for f in r]))',
    ) as string[];
    expect(got).toHaveLength(12);
    expect([...got].sort().reverse()).toEqual(got);
    expect(new Set(got).size).toBe(got.length);
    expect(got[0]).toBe('2026-10-07T03:10:00.000Z');
  });

  it('prune_frames apaga tudo o que o manifest não referencia (webp e png)', () => {
    const got = py(
      'd = pathlib.Path(tempfile.mkdtemp())\n' +
        'for n in ["ir-2026-10-07T0100.webp", "ir-2026-10-07T0110.webp", "vis-2026-10-06T1600.webp", "old.png", "notes.txt"]:\n' +
        '    (d / n).write_bytes(b"x")\n' +
        `removed = m.prune_frames(d, [${frame('0100')}, ${frame('0110')}])\n` +
        'print(json.dumps({"removed": removed, "left": sorted(p.name for p in d.iterdir())}))',
    ) as { removed: string[]; left: string[] };
    expect(got.removed.sort()).toEqual(['old.png', 'vis-2026-10-06T1600.webp']);
    expect(got.left).toEqual(['ir-2026-10-07T0100.webp', 'ir-2026-10-07T0110.webp', 'notes.txt']);
  });

  it('defensive_prune: deixa só o manifest actual; sem manifest não apaga nada', () => {
    const got = py(
      'd = pathlib.Path(tempfile.mkdtemp()); f = d / "frames"; f.mkdir()\n' +
        'for n in ["vis-2026-10-07T1650.webp", "ir-2026-10-06T2000.webp", "ir-2026-10-06T2010.webp"]:\n' +
        '    (f / n).write_bytes(b"x")\n' +
        'none = m.defensive_prune(f, d / "missing.json")\n' +
        'man = d / "sat-mtg.json"\n' +
        `man.write_text(json.dumps({"frames": [${frame('1650', 'vis')}]}))\n` +
        'removed = m.defensive_prune(f, man)\n' +
        'print(json.dumps({"none": none, "removed": removed, "left": sorted(p.name for p in f.iterdir())}))',
    ) as { none: string[]; removed: string[]; left: string[] };
    expect(got.none).toEqual([]);
    expect(got.removed.sort()).toEqual(['ir-2026-10-06T2000.webp', 'ir-2026-10-06T2010.webp']);
    expect(got.left).toEqual(['vis-2026-10-07T1650.webp']);
  });

  it('saída a 0.025°/px sobre a ROI (1400×960) e WebP q70 com alpha com perda', () => {
    const got = py('print(json.dumps({"size": list(m.OUTPUT_SIZE), "webp": m.WEBP_OPTIONS}))') as {
      size: number[];
      webp: { quality: number; alpha_quality: number };
    };
    expect(got.size).toEqual([1400, 960]);
    expect(got.webp.quality).toBeLessThanOrEqual(75);
    expect(got.webp.alpha_quality).toBeLessThanOrEqual(75);
  });
});

describe('fetch-mtg-ir.py — todos os caminhos que escrevem o manifest podam', () => {
  const script = readFileSync(SCRIPT, 'utf8');

  it('não sobra nenhum `img.save` com q85 fora do save_frame', () => {
    expect(script).not.toMatch(/quality=85/);
    expect(script.match(/save_frame\(img, OUT_DIR \/ name\)/g)).toHaveLength(2);
  });

  it('cada write_manifest em main() vem depois de um prune_frames', () => {
    const main = script.slice(script.indexOf('def main()'));
    const writes = [...main.matchAll(/write_manifest\(frames\)/g)].map((m) => m.index!);
    expect(writes.length).toBeGreaterThanOrEqual(2);
    for (const at of writes) {
      const before = main.slice(Math.max(0, at - 200), at);
      expect(before).toMatch(/frames = retain_frames\([^)]*\)\s*\n\s*prune_frames\(OUT_DIR, frames\)/);
    }
  });

  it('limpeza defensiva corre antes do fetch', () => {
    const main = script.slice(script.indexOf('def main()'));
    expect(main.indexOf('defensive_prune()')).toBeGreaterThan(0);
    expect(main.indexOf('defensive_prune()')).toBeLessThan(main.indexOf('DataStore(tok)'));
  });
});

describe('push-data-update.sh — frames podados não voltam do origin', () => {
  const sh = readFileSync(path.join(root, 'scripts/push-data-update.sh'), 'utf8');

  it('esvazia radar/frames e sat-mtg/frames depois do checkout e antes do cp -a', () => {
    const loop = sh.match(/for frames_dir in ([^;]+); do/);
    expect(loop, 'loop das pastas de frames').not.toBeNull();
    expect(loop![1].split(/\s+/)).toEqual(expect.arrayContaining(['radar/frames', 'sat-mtg/frames']));
    expect(sh.indexOf('for frames_dir in')).toBeLessThan(
      sh.indexOf('cp -a "$DATA_BACKUP/public-data/." public/data/'),
    );
    expect(sh.indexOf('for frames_dir in')).toBeGreaterThan(sh.indexOf('git checkout -f -B main origin/main'));
  });
});
