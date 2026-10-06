// install.sh, run under a temporary home with EXO_REPO pointing at a local copy
// of this checkout, clones and installs, pulls on a second run, refuses a
// folder that is not a clone, and stops before writing when node is missing.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const SCRIPT = path.join(ROOT, 'install.sh');
const BASH = spawnSync('sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim();
const GIT = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();

// maintenance.auto=false: a commit would otherwise detach a `git maintenance run --auto`
// that packs the loose objects and deletes them while the clone copies them.
function git(cwd, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

// A repository holding this checkout's files, so the clone carries uncommitted work too.
function sourceRepository(base) {
  const source = path.join(base, 'source');
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  for (const file of listed.stdout.split('\0').filter(Boolean)) {
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(source, file));
  }
  git(source, 'init', '-q');
  git(source, 'add', '-A');
  git(source, 'commit', '-q', '-m', 'test: fixture');
  return source;
}

function sandbox(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'install-sh-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'home');
  const bin = path.join(base, 'bin');
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\n', { mode: 0o755 });
  const environment = {
    HOME: home,
    USERPROFILE: home,
    PATH: [bin, path.dirname(process.execPath), path.dirname(GIT), '/usr/bin', '/bin'].join(path.delimiter)
  };
  return { base, home, bin, environment };
}

function install(environment, cwd, ...args) {
  return spawnSync(BASH, [SCRIPT, ...args], { cwd, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

test('a fresh run clones and installs, and a second run pulls the clone', (t) => {
  const { base, home, environment } = sandbox(t);
  const source = sourceRepository(base);
  // file:// makes git honour --depth 1, so the pull below runs on a shallow clone.
  const env = { ...environment, EXO_REPO: `file://${source}` };

  const first = install(env, base, '--harness', 'codex', '--yes');
  assert.equal(first.status, 0, first.stderr + first.stdout);
  assert.match(first.stdout, /Cloning exo into/);
  const clone = path.join(home, '.exo');
  assert.ok(fs.existsSync(path.join(clone, '.git')), 'the clone lands in ~/.exo');
  assert.ok(fs.existsSync(path.join(home, '.agents', 'skills', 'build', 'SKILL.md')), 'a skill is installed');

  fs.writeFileSync(path.join(source, 'pulled.txt'), 'new\n');
  git(source, 'add', '-A');
  git(source, 'commit', '-q', '-m', 'test: second commit');
  const second = install(env, base, '--harness', 'codex', '--yes');
  assert.equal(second.status, 0, second.stderr + second.stdout);
  assert.match(second.stdout, /Updating exo in/);
  assert.ok(fs.existsSync(path.join(clone, 'pulled.txt')), 'the second run pulls the new commit');
});

test('a folder at EXO_DIR that is not a clone is refused and left intact', (t) => {
  const { base, home, environment } = sandbox(t);
  const folder = path.join(home, '.exo');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'keep.txt'), 'mine\n');
  const result = install({ ...environment, EXO_REPO: path.join(base, 'nowhere') }, base, '--yes');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a git clone/);
  assert.deepEqual(fs.readdirSync(folder), ['keep.txt']);
  assert.equal(fs.readFileSync(path.join(folder, 'keep.txt'), 'utf8'), 'mine\n');
});

test('a missing or old node is named and nothing is written', (t) => {
  const { base, home, bin } = sandbox(t);
  fs.symlinkSync(GIT, path.join(bin, 'git'));
  const environment = { HOME: home, PATH: bin };

  const missing = install(environment, base, '--yes');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Node\.js is missing; install Node\.js 22 or newer/);
  assert.equal(missing.stderr.trim().split('\n').length, 1, 'one line');

  fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\necho 20\n', { mode: 0o755 });
  const old = install(environment, base, '--yes');
  assert.equal(old.status, 1);
  assert.match(old.stderr, /is too old; install Node\.js 22 or newer/);
  assert.ok(!fs.existsSync(path.join(home, '.exo')), 'nothing is cloned');
});
