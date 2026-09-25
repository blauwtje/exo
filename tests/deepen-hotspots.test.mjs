// hotspots.mjs prints the top paths by commit count over six months, so
// `audit-architecture` can scope an audit from churn without reading the tree itself.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { rankHotspots } from '../skills/audit-architecture/scripts/hotspots.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/audit-architecture/scripts/hotspots.mjs', import.meta.url));
const exists = () => true;

test('rankHotspots counts a path once per commit and orders by count then path', () => {
  const log = ['a.txt\na.txt\nb.txt', 'a.txt', 'c.txt'].join('\0');
  assert.deepEqual(rankHotspots(log, { top: 10, exists }), ['2 a.txt', '1 b.txt', '1 c.txt']);
});

test('rankHotspots cuts at top', () => {
  const log = ['a.txt\na.txt\nb.txt', 'a.txt', 'c.txt'].join('\0');
  assert.deepEqual(rankHotspots(log, { top: 1, exists }), ['2 a.txt']);
});

test('rankHotspots drops paths exists rejects', () => {
  const log = ['a.txt', 'b.txt'].join('\0');
  assert.deepEqual(rankHotspots(log, { top: 10, exists: (candidate) => candidate === 'a.txt' }), ['1 a.txt']);
});

function scratchRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-hotspots-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const run = spawnSync('git', ['-C', root, '-c', 'user.name=hotspots', '-c', 'user.email=hotspots@example.com', ...args], {
      encoding: 'utf8'
    });
    assert.equal(run.status, 0, `git ${args[0]} failed: ${run.stderr}`);
  };
  git('init', '-q', '-b', 'main');
  return { root, git };
}

function commit(git, root, file, message) {
  fs.writeFileSync(path.join(root, file), `${file}\n`);
  git('add', file);
  git('commit', '-qm', message);
}

test('the spawned script prints hotspots for a real repo, most-touched first', (t) => {
  const { root, git } = scratchRepo(t);
  commit(git, root, 'a.txt', 'feat: a');
  commit(git, root, 'b.txt', 'feat: b');
  fs.appendFileSync(path.join(root, 'a.txt'), 'again\n');
  git('commit', '-qam', 'feat: touch a again');

  const run = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '2 a.txt\n1 b.txt\n');
});

test('--top 1 prints only the top line', (t) => {
  const { root, git } = scratchRepo(t);
  commit(git, root, 'a.txt', 'feat: a');
  commit(git, root, 'b.txt', 'feat: b');
  fs.appendFileSync(path.join(root, 'a.txt'), 'again\n');
  git('commit', '-qam', 'feat: touch a again');

  const run = spawnSync(process.execPath, [SCRIPT, '--root', root, '--top', '1'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '2 a.txt\n');
});

test('a commit outside the six-month window prints the none line and exits 0', (t) => {
  const { root } = scratchRepo(t);
  fs.writeFileSync(path.join(root, 'old.txt'), 'old\n');
  const run = spawnSync('git', ['-C', root, '-c', 'user.name=hotspots', '-c', 'user.email=hotspots@example.com', 'add', 'old.txt'], {
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stderr);
  const commitRun = spawnSync(
    'git',
    ['-C', root, '-c', 'user.name=hotspots', '-c', 'user.email=hotspots@example.com', 'commit', '-qm', 'feat: old'],
    { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00', GIT_COMMITTER_DATE: '2020-01-01T00:00:00' } }
  );
  assert.equal(commitRun.status, 0, commitRun.stderr);

  const hotspots = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  assert.equal(hotspots.status, 0, hotspots.stderr);
  assert.equal(hotspots.stdout, 'hotspots: none in 6 months\n');
});

test('--top 0 is rejected', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--top', '0'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /^hotspots:/);
});

test('--top x is rejected', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--top', 'x'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /^hotspots:/);
});
