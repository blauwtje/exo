import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { refusalHandler } from '../lib/refusal-handlers.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/build/scripts/start-run.mjs', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'start-run-'));
  const repo = fs.realpathSync(base);
  git(repo, 'init', '-q', '-b', 'work');
  git(repo, 'config', 'user.email', 't@t');
  git(repo, 'config', 'user.name', 't');
  const plan = path.join(repo, 'docs', 'plans', 'demo.md');
  fs.mkdirSync(path.dirname(plan), { recursive: true });
  fs.writeFileSync(plan, [
    '# Demo', '', '## Goal', 'g', '', '## Plan basis', `Repository: ${repo}`, 'Branch: work', 'Worktree setup: none',
    'Land gate: node --version','Land: local', 'Commit: feat(x): y', 'Lint: none', 'Allow: none', '',
    '## Success criterion', '`true`', 'Red: none (demo plan)','Product run: none', '',
    '## Checkpoint', '- Blocks first: Task 1.', '- Parallel: none.', '- Shared state: none', '- Smallest safe split: one each', '',
    '## Tasks', '### Task 1: feat(x): one', 'Depends on: none | Files: `a.txt` | Data: d | Proof: true', '',
    '### Task 2: feat(x): two', 'Depends on: 1 | Files: `b.txt` | Data: d | Proof: true', '',
  ].join('\n'));
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'feat(x): one', '-m', 'Plan-task: demo/1');
  return { repo, plan, cache: path.join(base, 'cache') };
}

function run({ repo, plan, cache }, env) {
  const childEnv = { ...process.env, XDG_CACHE_HOME: cache };
  delete childEnv.CLAUDE_CODE_SESSION_ID;
  delete childEnv.EXO_RUN_TASK;
  Object.assign(childEnv, env);
  const result = spawnSync(process.execPath, [SCRIPT, '--plan', plan, '--root', repo, '--checkout', repo], { encoding: 'utf8', env: childEnv });
  assert.equal(result.status, 0, result.stderr);
}

const recordFile = (cache, id) => path.join(cache, 'exo', 'build', `${id}.json`);

test('start-run writes the session record with total from the plan and landed from the checkout', () => {
  const f = fixture();
  run(f, { CLAUDE_CODE_SESSION_ID: 'abc-1' });
  const record = JSON.parse(fs.readFileSync(recordFile(f.cache, 'abc-1'), 'utf8'));
  assert.equal(record.total, 2);
  assert.equal(record.landed, 1);
  assert.equal(record.plan, f.plan);
  assert.equal(record.checkout, f.repo);
});

test('start-run prunes stale records and leaves fresh ones', () => {
  const f = fixture();
  const directory = path.join(f.cache, 'exo', 'build');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'old.json'), JSON.stringify({ updatedAt: 1 }));
  fs.writeFileSync(path.join(directory, 'fresh.json'), JSON.stringify({ updatedAt: Date.now() }));
  run(f, { CLAUDE_CODE_SESSION_ID: 'abc-2' });
  assert.equal(fs.existsSync(path.join(directory, 'old.json')), false);
  assert.equal(fs.existsSync(path.join(directory, 'fresh.json')), true);
});

test('start-run writes nothing without a session id or with EXO_RUN_TASK set', () => {
  const f = fixture();
  run(f, {});
  run(f, { CLAUDE_CODE_SESSION_ID: 'abc-3', EXO_RUN_TASK: '2' });
  assert.equal(fs.existsSync(path.join(f.cache, 'exo')), false);
});

test('start-run stores an absolute checkout when --checkout is relative', () => {
  const f = fixture();
  const childEnv = { ...process.env, XDG_CACHE_HOME: f.cache, CLAUDE_CODE_SESSION_ID: 'abc-4' };
  delete childEnv.EXO_RUN_TASK;
  const result = spawnSync(process.execPath, [SCRIPT, '--plan', f.plan, '--root', f.repo, '--checkout', '.'], { cwd: f.repo, encoding: 'utf8', env: childEnv });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(recordFile(f.cache, 'abc-4'), 'utf8')).checkout, f.repo);
});

test('start-run still writes its record when pruning fails on an unremovable entry', () => {
  const f = fixture();
  const directory = path.join(f.cache, 'exo', 'build');
  fs.mkdirSync(path.join(directory, 'stuck.json'), { recursive: true });
  run(f, { CLAUDE_CODE_SESSION_ID: 'abc-5' });
  assert.equal(fs.existsSync(recordFile(f.cache, 'abc-5')), true);
});

test('start-run refuses a plan whose proof starts a nested claude, before it writes anything', () => {
  const f = fixture();
  const text = fs.readFileSync(f.plan, 'utf8').replace('Files: `b.txt` | Data: d | Proof: true', 'Files: `b.txt` | Data: d | Proof: claude -p measure');
  fs.writeFileSync(f.plan, text);
  git(f.repo, 'commit', '-q', '-am', 'chore: plan');
  const env = { ...process.env, XDG_CACHE_HOME: f.cache, CLAUDE_CODE_SESSION_ID: 'abc-6' };
  const result = spawnSync(process.execPath, [SCRIPT, '--plan', f.plan, '--root', f.repo, '--checkout', f.repo], { encoding: 'utf8', env });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /starts a nested claude/);
  assert.match(result.stderr, /Next: fix the plan.*plan-check\.mjs --loop --run --plan /s);
  assert.ok(result.stderr.endsWith(`\n${refusalHandler('start stop')}\n`), result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(f.cache, 'exo')), false);
  assert.equal(fs.existsSync(path.join(f.repo, '.exo')), false);
});

function runOutput({ repo, plan, cache }) {
  const result = spawnSync(process.execPath, [SCRIPT, '--plan', plan, '--root', repo, '--checkout', repo], { encoding: 'utf8', env: { ...process.env, XDG_CACHE_HOME: cache } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('start-run commits pre-existing work in its own trailerless commit and prints its sha before run started', () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.repo, 'a.txt'), 'tracked\n');
  git(f.repo, 'add', 'a.txt');
  git(f.repo, 'commit', '-q', '-m', 'chore: a');
  fs.writeFileSync(path.join(f.repo, 'a.txt'), 'changed\n');
  fs.writeFileSync(path.join(f.repo, 'new.txt'), 'untracked\n');
  fs.writeFileSync(f.plan, `${fs.readFileSync(f.plan, 'utf8')}\n`);
  const stdout = runOutput(f);
  const sha = git(f.repo, 'rev-parse', '--short', 'HEAD').trim();
  assert.equal(git(f.repo, 'log', '-1', '--format=%s').trim(), 'fix(run): keep work present before the run');
  assert.doesNotMatch(git(f.repo, 'log', '-1', '--format=%B'), /Plan-task:/);
  assert.deepEqual(git(f.repo, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean).sort(), ['a.txt', 'new.txt']);
  assert.equal(git(f.repo, 'status', '--porcelain', '--untracked-files=no').trim(), 'M docs/plans/demo.md');
  assert.ok(stdout.indexOf(sha) !== -1 && stdout.indexOf(sha) < stdout.indexOf('run started'), stdout);
});

test('start-run keeps the plan out of the pre-run commit when the checkout path is a symlink', () => {
  const f = fixture();
  const link = `${f.repo}-link`;
  fs.symlinkSync(f.repo, link);
  fs.writeFileSync(path.join(f.repo, 'new.txt'), 'untracked\n');
  fs.writeFileSync(f.plan, `${fs.readFileSync(f.plan, 'utf8')}\n`);
  const plan = path.join(link, 'docs', 'plans', 'demo.md');
  const result = spawnSync(process.execPath, [SCRIPT, '--plan', plan, '--root', f.repo, '--checkout', link], { encoding: 'utf8', env: { ...process.env, XDG_CACHE_HOME: f.cache } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(git(f.repo, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean), ['new.txt']);
});

test('start-run on a clean tree makes no commit', () => {
  const f = fixture();
  const before = git(f.repo, 'rev-parse', 'HEAD');
  const stdout = runOutput(f);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before);
  assert.doesNotMatch(stdout, /committed pre-existing work/);
});

test('start-run on a checkout off the plan Branch: commits nothing', () => {
  const f = fixture();
  git(f.repo, 'switch', '-q', '-c', 'other');
  fs.writeFileSync(path.join(f.repo, 'new.txt'), 'untracked\n');
  const before = git(f.repo, 'rev-parse', 'HEAD');
  runOutput(f);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before);
});

test('start-run stops before the pre-run commit and run started when a service the repo needs is down', () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.repo, 'compose.yaml'), 'services: {}\n');
  fs.writeFileSync(path.join(f.repo, 'new.txt'), 'untracked\n');
  const fakes = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-bin-'));
  for (const name of ['docker', 'open']) {
    fs.writeFileSync(path.join(fakes, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  }
  const before = git(f.repo, 'rev-parse', 'HEAD');
  const result = spawnSync(process.execPath, [SCRIPT, '--plan', f.plan, '--root', f.repo, '--checkout', f.repo], {
    encoding: 'utf8',
    env: { ...process.env, XDG_CACHE_HOME: f.cache, PATH: `${fakes}${path.delimiter}${process.env.PATH}` },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^start-run: docker not running: .*Next: /);
  assert.ok(result.stderr.endsWith(`\n${refusalHandler('start stop')}\n`), result.stderr);
  assert.doesNotMatch(result.stdout, /run started/);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before);
});
