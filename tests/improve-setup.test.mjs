import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SETUP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'improve', 'scripts', 'setup.mjs');

function git(cwd, ...args) {
  const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'improve-setup-'));
  git(root, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, 'code.txt'), 'hello world\n');
  fs.writeFileSync(path.join(root, 'check.mjs'), "import fs from 'node:fs';console.log('score ' + fs.readFileSync('code.txt','utf8').length);\n");
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  return root;
}

const run = (root, ...extra) => spawnSync('node', [SETUP, '--root', root, ...extra], { encoding: 'utf8' });
const base = ['--goal', 'g', '--command', 'node check.mjs', '--regex', 'score (\\d+)', '--direction', 'higher', '--scope', 'code.txt', '--readonly', 'check.mjs', '--tag', 't1'];

test('setup creates branch, worktree, config, baseline row, brief and the settled line', () => {
  const root = repo();
  const result = run(root, ...base);
  assert.equal(result.status, 0, result.stderr);
  const brief = path.join(fs.realpathSync(root), '.exo/improve/t1.brief.md');
  assert.match(result.stdout, /^tag=t1 branch=improve\/t1 worktree=\.worktrees\/improve-t1 score=12 limit=\d+ model=\S+ effort=\S+ brief=\S+\n$/);
  assert.equal(fs.realpathSync(result.stdout.trim().split('brief=')[1]), brief);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t1.json'), 'utf8'));
  assert.deepEqual([cfg.scope, cfg.readOnly, cfg.direction, cfg.worktree], [['code.txt'], ['check.mjs'], 'higher', '.worktrees/improve-t1']);
  assert.match(cfg.scorerHash, /^[0-9a-f]{64}$/);
  const rows = fs.readFileSync(path.join(root, '.exo/improve/t1.tsv'), 'utf8').trim().split('\n');
  assert.equal(rows[0], 'commit\tscore\tstatus\tdescription');
  assert.match(rows[1], /^[0-9a-f]+\t12\tkeep\tbaseline$/);
  assert.match(fs.readFileSync(brief, 'utf8'), /best so far 12/);
  assert.ok(fs.existsSync(path.join(root, '.worktrees/improve-t1')));
});

test('the limit is derived from the baseline run unless --limit is given', () => {
  const root = repo();
  const derived = Number(run(root, ...base).stdout.match(/limit=(\d+)/)[1]);
  assert.ok(derived >= 61 && derived < 120, `limit ${derived}`);
  assert.match(run(root, ...base, '--tag', 't9', '--limit', '7').stdout, /limit=7 /);
});

test('setup commits a --scorer path on the improve branch only', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'score.mjs'), "console.log('score 5');\n");
  const result = run(root, '--goal', 'g', '--command', 'node score.mjs', '--regex', 'score (\\d+)', '--direction', 'lower', '--scope', 'code.txt', '--scorer', 'score.mjs', '--tag', 't2');
  assert.equal(result.status, 0, result.stderr);
  assert.match(git(root, 'show', '--stat', '--format=%s', 'improve/t2'), /frozen scorer[\s\S]*score\.mjs/);
  assert.equal(git(root, 'ls-tree', '--name-only', 'main').includes('score.mjs'), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t2.json'), 'utf8')).readOnly, ['score.mjs']);
});

test('resume resets the worktree to the last kept row and prints the settled line', () => {
  const root = repo();
  assert.equal(run(root, ...base).status, 0);
  const tree = path.join(root, '.worktrees/improve-t1');
  const kept = git(tree, 'rev-parse', '--short', 'HEAD');
  fs.writeFileSync(path.join(tree, 'code.txt'), 'x\n');
  git(tree, 'commit', '-qam', 'unscored');
  const result = run(root, '--resume', '--tag', 't1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(tree, 'rev-parse', '--short', 'HEAD'), kept);
  assert.match(result.stdout, /^tag=t1 branch=improve\/t1 .*score=12 .*brief=\S+\n$/);
  assert.equal(run(root, '--resume').status, 0);
});

test('a missing required flag is a usage error', () => {
  const result = run(repo(), '--goal', 'g');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--command is required/);
});

test('a second setup with a taken tag gets a numeric suffix', () => {
  const root = repo();
  assert.equal(run(root, ...base).status, 0);
  const again = run(root, ...base);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /^tag=t1-2 branch=improve\/t1-2 worktree=\.worktrees\/improve-t1-2 /);
  assert.match(run(root, ...base).stdout, /^tag=t1-3 /);
});

test('no setup script swallows a failure', () => {
  const dir = path.dirname(SETUP);
  for (const name of ['setup.mjs', 'round.mjs']) assert.doesNotMatch(fs.readFileSync(path.join(dir, name), 'utf8'), /\} catch \{/);
});

test('a failed baseline run or scorer commit exits 2 and leaves no improve branch or worktree', () => {
  const root = repo();
  const wrong = run(root, '--goal', 'g', '--command', 'node check.mjs', '--regex', 'nomatch (\\d+)', '--direction', 'higher', '--scope', 'code.txt', '--tag', 't7');
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /score command failed on the baseline run/);
  const failing = run(root, '--goal', 'g', '--command', 'false', '--regex', 'score (\\d+)', '--direction', 'higher', '--scope', 'code.txt', '--tag', 't6');
  assert.equal(failing.status, 2);
  const missing = run(root, ...base, '--scorer', 'absent.mjs', '--tag', 't8');
  assert.equal(missing.status, 2);
  assert.equal(git(root, 'branch', '--list', 'improve/*'), '');
  assert.doesNotMatch(git(root, 'worktree', 'list'), /improve-t[678]/);
});

test('a scope, readonly or scorer entry that is absolute or outside the repo fails before any branch or worktree', () => {
  const root = repo();
  const cases = [['--scope', '../outside', 'scope'], ['--scope', '/abs/src', 'scope'], ['--scope', 'src/../../x', 'scope'], ['--readonly', '../check.mjs', 'readonly'], ['--scorer', '/abs/score.mjs', 'scorer']];
  for (const [flag, value, name] of cases) {
    const result = run(root, ...base.filter((_, at) => base[at] !== flag && base[at - 1] !== flag), flag, value, '--tag', 'tx');
    assert.equal(result.status, 2, `${flag} ${value}: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`--${name} entry`));
    assert.doesNotMatch(result.stderr, /\n\s+at /);
  }
  assert.equal(git(root, 'branch', '--list', 'improve/*'), '');
  assert.doesNotMatch(git(root, 'worktree', 'list'), /improve-tx/);
  assert.equal(fs.existsSync(path.join(root, '.worktrees')), false);
});

test('a read-only path that does not exist fails before any branch', () => {
  const root = repo();
  const result = run(root, ...base.slice(0, -2), '--readonly', 'nope.mjs', '--tag', 'ty');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /read-only path missing or empty: nope\.mjs/);
  assert.equal(git(root, 'branch', '--list', 'improve/*'), '');
});
