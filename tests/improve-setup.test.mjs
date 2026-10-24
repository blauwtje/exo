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

test('setup creates branch, worktrees, config, baseline row and a settled line', () => {
  const root = repo();
  const result = run(root, ...base);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^tag=t1 branch=improve\/t1 worktree=\.worktrees\/improve-t1 next=\.worktrees\/improve-t1-next score=12 sd=0 limit=\d+ model=\S+ effort=\S+ no-overlap=false\n$/);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t1.json'), 'utf8'));
  assert.deepEqual(cfg.scope, ['code.txt']);
  assert.ok(cfg.hashes['check.mjs']);
  assert.equal(cfg.direction, 'higher');
  const rows = fs.readFileSync(path.join(root, '.exo/improve/t1.tsv'), 'utf8').trim().split('\n');
  assert.equal(rows[0], 'commit\tscore\tstatus\tdescription');
  assert.match(rows[1], /^[0-9a-f]+\t12\tkeep\tbaseline$/);
  assert.ok(fs.existsSync(path.join(root, '.worktrees/improve-t1-next')));
});

test('setup commits a --scorer path on the improve branch only', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'score.mjs'), "console.log('score 5');\n");
  const result = run(root, '--goal', 'g', '--command', 'node score.mjs', '--regex', 'score (\\d+)', '--direction', 'lower', '--scope', 'code.txt', '--scorer', 'score.mjs', '--tag', 't2');
  assert.equal(result.status, 0, result.stderr);
  assert.match(git(root, 'show', '--stat', '--format=%s', 'improve/t2'), /frozen scorer[\s\S]*score\.mjs/);
  assert.equal(git(root, 'ls-tree', '--name-only', 'main').includes('score.mjs'), false);
});

test('resume resets the worktree to the last kept row', () => {
  const root = repo();
  assert.equal(run(root, ...base).status, 0);
  const tree = path.join(root, '.worktrees/improve-t1');
  const kept = git(tree, 'rev-parse', '--short', 'HEAD');
  fs.writeFileSync(path.join(tree, 'code.txt'), 'x\n');
  git(tree, 'commit', '-qam', 'unscored');
  const result = run(root, '--resume', '--tag', 't1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(tree, 'rev-parse', '--short', 'HEAD'), kept);
  assert.match(result.stdout, /^tag=t1 .*score=12 /);
  assert.equal(run(root, '--resume').status, 0);
});

test('a built scorer that ignores damage is rejected', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'flat.mjs'), "console.log('score 7');\n");
  const result = run(root, '--goal', 'g', '--command', 'node flat.mjs', '--regex', 'score (\\d+)', '--direction', 'higher', '--scope', 'code.txt', '--scorer', 'flat.mjs', '--built-scorer', '--tag', 't3');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scorer rejected/);
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

test('every setup flag is named in SKILL.md and no failure is swallowed', () => {
  const dir = path.join(path.dirname(SETUP), '..');
  const skill = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
  for (const flag of ['--no-overlap', '--built-scorer', '--keep-margin', '--confirm', '--stop-after', 'STOP no-keep']) assert.ok(skill.includes(flag), `SKILL.md never passes ${flag}`);
  assert.doesNotMatch(skill, /truncate the largest scope file/);
  assert.doesNotMatch(skill, /except the probe/);
  assert.doesNotMatch(fs.readFileSync(SETUP, 'utf8'), /\} catch \{/);
});

test('a rejected built scorer leaves no improve branch or worktree', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'flat.mjs'), "console.log('score 7');\n");
  const result = run(root, '--goal', 'g', '--command', 'node flat.mjs', '--regex', 'score (\\d+)', '--direction', 'higher', '--scope', 'code.txt', '--scorer', 'flat.mjs', '--built-scorer', '--tag', 't5');
  assert.equal(result.status, 2);
  assert.equal(git(root, 'branch', '--list', 'improve/*'), '');
  assert.doesNotMatch(git(root, 'worktree', 'list'), /improve-t5/);
});

test('the settled line prints overlap=true after --no-overlap', () => {
  const root = repo();
  const result = run(root, ...base, '--no-overlap');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /overlap=true/);
  assert.match(run(root, '--resume', '--tag', 't1').stdout, /overlap=true/);
});

test('the sensitivity probe reads scope globs like the gate: * stays inside one directory', () => {
  const root = repo();
  fs.mkdirSync(path.join(root, 'src/deep'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/deep/a.ts'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'deep');
  const result = run(root, '--goal', 'g', '--command', 'node check.mjs', '--regex', 'score (\\d+)', '--direction', 'higher', '--scope', 'src/*.ts', '--built-scorer', '--tag', 't6');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no tracked scope file/);
});

test('a failed baseline run or scorer commit leaves no improve branch or worktree', () => {
  const root = repo();
  const wrong = run(root, '--goal', 'g', '--command', 'node check.mjs', '--regex', 'nomatch (\\d+)', '--direction', 'higher', '--scope', 'code.txt', '--tag', 't7');
  assert.equal(wrong.status, 2);
  const missing = run(root, ...base, '--scorer', 'absent.mjs', '--tag', 't8');
  assert.equal(missing.status, 2);
  assert.equal(git(root, 'branch', '--list', 'improve/*'), '');
  assert.doesNotMatch(git(root, 'worktree', 'list'), /improve-t[78]/);
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

test('--keep-margin, --confirm and --stop-after are stored in <tag>.json, off by default, and bad values fail before any branch', () => {
  const root = repo();
  assert.equal(run(root, ...base).status, 0);
  const plain = JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/t1.json'), 'utf8'));
  assert.deepEqual([plain.keepMargin, plain.confirm, plain.stopAfter], [0, false, 0]);
  const result = run(root, ...base.slice(0, -1), 'on', '--keep-margin', '1.5', '--confirm', '--stop-after', '4');
  assert.equal(result.status, 0, result.stderr);
  const on = JSON.parse(fs.readFileSync(path.join(root, '.exo/improve/on.json'), 'utf8'));
  assert.deepEqual([on.keepMargin, on.confirm, on.stopAfter], [1.5, true, 4]);
  for (const bad of [['--keep-margin', '-1'], ['--keep-margin', 'x'], ['--stop-after', '0'], ['--stop-after', '1.5']]) {
    const refused = run(root, ...base.slice(0, -1), 'bad', ...bad);
    assert.equal(refused.status, 2, bad.join(' '));
    assert.equal(git(root, 'branch', '--list', 'improve/bad'), '');
  }
});
