/**
 * Teste comportamental do scripts/push-data-update.sh num repo git temporário
 * (origin bare + clone «do runner»): o que o pipeline apagou localmente tem de
 * chegar à main como deleção — sobretudo os ficheiros por spot de
 * public/data/forecasts/, que o `cp -a` (só acrescenta) deixava voltar do
 * origin como órfãos a cada commit do bot. E o agregado forecasts.json, que
 * deixou de ser publicado (25/10/2026), nunca volta a entrar.
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

describe('push-data-update.sh (repo git temporário)', () => {
  it('ficheiros por spot apagados pelo pipeline não voltam do origin', () => {
    const { origin, seed, runner } = setup();
    // O pipeline no runner: regenera guincho, apaga o spot removido, poda o radar.
    write(runner, 'public/data/forecasts/guincho.json', '{"v":2}\n');
    fs.rmSync(path.join(runner, 'public/data/forecasts/spot-removido.json'));
    fs.rmSync(path.join(runner, 'public/data/radar/frames/old.png'));
    write(runner, 'public/data/radar/frames/new.png', 'new\n');
    write(runner, 'public/data/conditions.json', '{"v":2}\n');
    // Entretanto aterra outro commit na main (o caso do rebase que o script evita).
    write(seed, 'README.md', 'x\n');
    git(seed, 'add', 'README.md');
    git(seed, 'commit', '-q', '-m', 'outro');
    git(seed, 'push', '-q', 'origin', 'HEAD:main');

    const out = execFileSync('bash', [SCRIPT, 'auto: teste'], {
      cwd: runner,
      env: { ...process.env, ...GIT_ENV, GITHUB_ACTIONS: 'true' },
      encoding: 'utf8',
    });
    expect(out).toMatch(/Data published to main/);

    const files = git(origin, 'ls-tree', '-r', '--name-only', 'main').split('\n');
    expect(files).toContain('public/data/forecasts/guincho.json');
    expect(files).not.toContain('public/data/forecasts/spot-removido.json');
    expect(files).not.toContain('public/data/radar/frames/old.png');
    expect(files).toContain('public/data/radar/frames/new.png');
    expect(files).toContain('README.md'); // o commit concorrente fica
    expect(git(origin, 'show', 'main:public/data/forecasts/guincho.json')).toBe('{"v":2}');
    expect(git(origin, 'show', 'main:public/data/conditions.json')).toBe('{"v":2}');
    expect(files).not.toContain('public/data/forecasts.json');
  });

  it('o agregado forecasts.json nunca é publicado, mesmo que o artefacto o traga', () => {
    fs.rmSync(path.join(tmp, 'origin.git'), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, 'seed'), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, 'runner'), { recursive: true, force: true });
    const { origin, runner } = setup();
    // Artefacto de um run anterior à mudança: o agregado veio regenerado.
    write(runner, 'public/data/forecasts.json', '{"guincho":[1]}\n');
    write(runner, 'public/data/conditions.json', '{"v":3}\n');
    execFileSync('bash', [SCRIPT, 'auto: teste'], {
      cwd: runner,
      env: { ...process.env, ...GIT_ENV, GITHUB_ACTIONS: 'true' },
      encoding: 'utf8',
    });
    const files = git(origin, 'ls-tree', '-r', '--name-only', 'main').split('\n');
    expect(files).not.toContain('public/data/forecasts.json');
    expect(files).toContain('public/data/forecasts/guincho.json');
    expect(git(origin, 'show', 'main:public/data/conditions.json')).toBe('{"v":3}');
  });

  it('ficheiros de outros bots (news.json, …) ficam como na main, não como no artefacto', () => {
    fs.rmSync(path.join(tmp, 'origin.git'), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, 'seed'), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, 'runner'), { recursive: true, force: true });
    const { origin, seed, runner } = setup();
    // O runner fez checkout com o news.json antigo; entretanto o bot das
    // notícias publica um novo na main (31/10/2026: 39d68a4f vs 8568e4bc).
    write(runner, 'public/data/news.json', '[{"v":"antigo"}]\n');
    write(runner, 'public/data/dawn-patrol.json', '{"v":"antigo"}\n');
    write(runner, 'public/data/community-tips.json', '{}\n');
    write(runner, 'public/data/conditions.json', '{"v":4}\n');
    write(seed, 'public/data/news.json', '[{"v":"novo"}]\n');
    write(seed, 'public/data/dawn-patrol.json', '{"v":"novo"}\n');
    git(seed, 'add', '-f', 'public/data');
    git(seed, 'commit', '-q', '-m', 'auto: news');
    git(seed, 'push', '-q', 'origin', 'HEAD:main');

    execFileSync('bash', [SCRIPT, 'auto: teste'], {
      cwd: runner,
      env: { ...process.env, ...GIT_ENV, GITHUB_ACTIONS: 'true' },
      encoding: 'utf8',
    });
    expect(git(origin, 'show', 'main:public/data/news.json')).toBe('[{"v":"novo"}]');
    expect(git(origin, 'show', 'main:public/data/dawn-patrol.json')).toBe('{"v":"novo"}');
    expect(git(origin, 'show', 'main:public/data/conditions.json')).toBe('{"v":4}');
    // Ficheiro de outro bot que não existe na main não entra pela mão deste.
    const files = git(origin, 'ls-tree', '-r', '--name-only', 'main').split('\n');
    expect(files).not.toContain('public/data/community-tips.json');
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
