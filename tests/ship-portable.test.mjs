import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const SHIP = path.resolve('skills/ship/scripts/ship.mjs');
const MISSING_GH = 'missing tool: gh on PATH; install it from https://cli.github.com';

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'exo-ship-'));
}

function run(args, { cwd, pathEntries }) {
  return spawnSync(process.execPath, [SHIP, ...args], { cwd, encoding: 'utf8', env: { ...process.env, PATH: pathEntries.join(path.delimiter) } });
}

function gitIn(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function repoOnFeatureBranch() {
  const root = makeDirectory();
  gitIn(root, 'init', '-q');
  gitIn(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '--allow-empty', '-m', 'first');
  gitIn(root, 'remote', 'add', 'origin', 'https://example.com/repo.git');
  gitIn(root, 'checkout', '-q', '-b', 'feature');
  return root;
}

function gitDirectory() {
  return path.dirname(spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim());
}

test('a missing gh prints the install line and exits 1', () => {
  const result = run(['--merge', '1'], { cwd: makeDirectory(), pathEntries: [makeDirectory()] });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), MISSING_GH);
});

test('a repo with local main and no origin/HEAD is offered the pull-request routes', () => {
  const stubs = makeDirectory();
  fs.writeFileSync(path.join(stubs, 'gh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const result = run(['--routes'], { cwd: repoOnFeatureBranch(), pathEntries: [stubs, gitDirectory(), '/bin'] });
  assert.match(result.stdout, /Push and merge/);
});

test('a feature branch without gh still gets the push and keep-local menu', () => {
  const result = run(['--routes'], { cwd: repoOnFeatureBranch(), pathEntries: [gitDirectory()] });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Keep local/);
  assert.doesNotMatch(result.stdout, /Push and merge/);
});

test('main with no upstream is pushed with -u and sets its upstream', () => {
  const root = makeDirectory();
  const remote = makeDirectory();
  gitIn(remote, 'init', '-q', '--bare');
  gitIn(root, 'init', '-q', '-b', 'main');
  gitIn(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '--allow-empty', '-m', 'first');
  gitIn(root, 'remote', 'add', 'origin', remote);
  const result = run(['--route', 'push'], { cwd: root, pathEntries: [gitDirectory()] });
  assert.equal(result.stdout.trim(), 'main pushed');
  gitIn(root, 'rev-parse', '--abbrev-ref', 'main@{upstream}');
});
