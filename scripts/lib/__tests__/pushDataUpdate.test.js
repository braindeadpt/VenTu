/**
 * Teste comportamental do scripts/push-data-update.sh num repo git temporário
 * (origin bare + clone «do runner»): os dados publicam-se na branch órfão
 * `ventu-data` — nunca na main — e a branch fica sempre com 1 commit (root
 * commit-tree + force-with-lease). O que o pipeline apagou localmente tem de
 * chegar à data-branch como deleção — sobretudo os ficheiros por spot de
 * public/data/forecasts/, frames de radar podados e o agregado
 * forecasts.json, que nunca é publicado.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', '..', 'push-data-update.sh');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdu-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_NOSYSTEM: '1',
  HOME: tmp,
};
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' }).trim();
const write = (root, rel, body) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
};

function setup() {
  const origin = path.join(tmp, 'origin.git');
  const seed = path.join(tmp, 'seed');
  const runner = path.join(tmp, 'runner');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  git(tmp, 'clone', '-q', origin, seed);
  // public/data está no .gitignore do repo real (o script usa add -f)
  write(seed, '.gitignore', 'public/data/\n*.backup\n');
  write(seed, 'public/data/forecasts/guincho.json', '{"v":1}\n');
  write(seed, 'public/data/forecasts/spot-removido.json', '{"v":1}\n');
  write(seed, 'public/data/radar/frames/old.png', 'old\n');
  write(seed, 'public/data/conditions.json', '{"v":1}\n');
  // Agregado legado ainda trackeado (estado da main antes de 25/10/2026).
  write(seed, 'public/data/forecasts.json', '{"guincho":[]}\n');
  git(seed, 'add', '.gitignore');
  git(seed, 'add', '-f', 'public/data');
  git(seed, 'commit', '-q', '-m', 'seed');
  git(seed, 'push', '-q', 'origin', 'HEAD:main');
  git(tmp, 'clone', '-q', origin, runner);
  return { origin, seed, runner };
}

const runScript = (runner) =>
  execFileSync('bash', [SCRIPT, 'auto: teste'], {
    cwd: runner,
    env: { ...process.env, ...GIT_ENV, GITHUB_ACTIONS: 'true' },
    encoding: 'utf8',
  });

const dataFiles = (origin) => git(origin, 'ls-tree', '-r', '--name-only', 'ventu-data').split('\n');
const dataShow = (origin, rel) => git(origin, 'show', `ventu-data:${rel}`);

describe('push-data-update.sh → ventu-data (repo git temporário)', () => {
  it('ficheiros por spot apagados pelo pipeline não voltam do origin; main intocada', { timeout: 60_000 }, () => {
    const { origin, seed, runner } = setup();
    // O pipeline no runner: regenera guincho, apaga o spot removido, poda o radar.
    write(runner, 'public/data/forecasts/guincho.json', '{"v":2}\n');
    fs.rmSync(path.join(runner, 'public/data/forecasts/spot-removido.json'));
    fs.rmSync(path.join(runner, 'public/data/radar/frames/old.png'));
    write(runner, 'public/data/radar/frames/new.png', 'new\n');
    write(runner, 'public/data/conditions.json', '{"v":2}\n');
    // Entretanto aterra outro commit na main — a data-branch é ortogonal.
    write(seed, 'README.md', 'x\n');
    git(seed, 'add', 'README.md');
    git(seed, 'commit', '-q', '-m', 'outro');
    git(seed, 'push', '-q', 'origin', 'HEAD:main');

    const out = runScript(runner);
    expect(out).toMatch(/Data published to ventu-data/);

    const files = dataFiles(origin);
    expect(files).toContain('public/data/forecasts/guincho.json');
    expect(files).not.toContain('public/data/forecasts/spot-removido.json');
    expect(files).not.toContain('public/data/radar/frames/old.png');
    expect(files).toContain('public/data/radar/frames/new.png');
    expect(files).not.toContain('public/data/forecasts.json');
    expect(files).not.toContain('README.md'); // código nunca entra na data-branch
    expect(dataShow(origin, 'public/data/forecasts/guincho.json')).toBe('{"v":2}');
    expect(dataShow(origin, 'public/data/conditions.json')).toBe('{"v":2}');
    // História da data-branch = 1 commit para sempre.
    expect(git(origin, 'rev-list', '--count', 'ventu-data')).toBe('1');
    // E a main fica como estava (o commit concorrente fica; os dados antigos
    // continuam lá — a limpeza é o `git rm --cached` da migração, não deste).
    expect(git(origin, 'ls-tree', '-r', '--name-only', 'main')).toContain('README.md');
  });

  it('o agregado forecasts.json nunca é publicado, mesmo que o artefacto o traga', { timeout: 60_000 }, () => {
    fs.rmSync(path.join(tmp, 'origin.git'), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, 'seed'), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, 'runner'), { recursive: true, force: true });
    const { origin, runner } = setup();
    // Artefacto de um run anterior à mudança: o agregado veio regenerado.
    write(runner, 'public/data/forecasts.json', '{"guincho":[1]}\n');
    write(runner, 'public/data/conditions.json', '{"v":3}\n');
    runScript(runner);
    const files = dataFiles(origin);
    expect(files).not.toContain('public/data/forecasts.json');
    expect(files).toContain('public/data/forecasts/guincho.json');
    expect(dataShow(origin, 'public/data/conditions.json')).toBe('{"v":3}');
  });

  it('ficheiros de outros bots (news.json, …) ficam como na data-branch, não como no artefacto', { timeout: 60_000 }, () => {
    fs.rmSync(path.join(tmp, 'origin.git'), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, 'seed'), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, 'runner'), { recursive: true, force: true });
    const { origin, seed, runner } = setup();
    // 1ª corrida cria a ventu-data (seed de main + overlay da worktree).
    write(runner, 'public/data/conditions.json', '{"v":4}\n');
    runScript(runner);
    // O bot das notícias publica um novo news.json/dawn-patrol.json na
    // data-branch (o equivalente a push-data-file.sh — amend ou não, o
    // update-data só precisa da ponta).
    git(seed, 'fetch', '-q', 'origin', 'ventu-data');
    git(seed, 'checkout', '-q', '-b', 'ventu-data', 'FETCH_HEAD');
    write(seed, 'public/data/news.json', '[{"v":"novo"}]\n');
    write(seed, 'public/data/dawn-patrol.json', '{"v":"novo"}\n');
    git(seed, 'add', '-f', 'public/data');
    // O bot publica como push-data-file.sh: root commit-tree + force push —
    // a data-branch mantém-se sempre com 1 commit.
    const botTree = git(seed, 'write-tree');
    const botSha = git(seed, 'commit-tree', botTree, '-m', 'auto: news');
    git(seed, 'push', '-q', '-f', 'origin', `${botSha}:refs/heads/ventu-data`);
    // O runner tem cópias velhas dos ficheiros dos outros bots no artefacto —
    // o exclude tem de impedir que regressem (bug do revert, 8568e4bc).
    write(runner, 'public/data/news.json', '[{"v":"antigo"}]\n');
    write(runner, 'public/data/dawn-patrol.json', '{"v":"antigo"}\n');
    write(runner, 'public/data/community-tips.json', '{}\n');

    runScript(runner);
    expect(dataShow(origin, 'public/data/news.json')).toBe('[{"v":"novo"}]');
    expect(dataShow(origin, 'public/data/dawn-patrol.json')).toBe('{"v":"novo"}');
    expect(dataShow(origin, 'public/data/conditions.json')).toBe('{"v":4}');
    // Ficheiro de outro bot que não existe na data-branch não entra pela mão deste.
    expect(dataFiles(origin)).not.toContain('public/data/community-tips.json');
    // E a branch continua com 1 commit (o root commit-tree substitui a ponta).
    expect(git(origin, 'rev-list', '--count', 'ventu-data')).toBe('1');
  });

  it('recusa correr fora do GitHub Actions', () => {
    let code = 0;
    try {
      execFileSync('bash', [SCRIPT], { cwd: tmp, env: { ...process.env, GITHUB_ACTIONS: '' }, stdio: 'pipe' });
    } catch (e) {
      code = e.status;
    }
    expect(code).toBe(1);
  });
});
