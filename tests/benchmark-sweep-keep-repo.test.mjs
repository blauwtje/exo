import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { keepRepository } from '../benchmarks/sweep.mjs';

const SWEEP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'sweep.mjs');

function git(directory, ...args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

function dryRun(...args) {
  return spawnSync(process.execPath, [SWEEP, ...args], { encoding: 'utf8', timeout: 60000 });
}

test('keepRepository copies the cell repository with its commits and excluded .exo/ files, and its origin', () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-keep-')));
  try {
    const cellRoot = path.join(base, 'cell');
    const repository = path.join(cellRoot, 'repo');
    fs.mkdirSync(repository, { recursive: true });
    git(repository, 'init', '--quiet', '-b', 'main');
    git(repository, 'config', 'user.email', 'test@example.com');
    git(repository, 'config', 'user.name', 'test');
    fs.writeFileSync(path.join(repository, 'a.txt'), 'a\n');
    git(repository, 'add', 'a.txt');
    git(repository, 'commit', '--quiet', '-m', 'one');
    fs.appendFileSync(path.join(repository, '.git', 'info', 'exclude'), '.exo/\n');
    fs.mkdirSync(path.join(repository, '.exo'));
    fs.writeFileSync(path.join(repository, '.exo', 'state.json'), '{}\n');
    const written = new Date('2020-01-02T03:04:05Z');
    fs.utimesSync(path.join(repository, '.exo', 'state.json'), written, written);
    git(path.join(cellRoot), 'init', '--quiet', '--bare', 'origin.git');
    const keep = path.join(base, 'keep');
    const kept = keepRepository(cellRoot, keep, 'flow-unit-2');
    assert.equal(kept, path.join(keep, 'flow-unit-2'));
    assert.equal(git(path.join(kept, 'repo'), 'rev-parse', 'HEAD'), git(repository, 'rev-parse', 'HEAD'));
    assert.equal(fs.readFileSync(path.join(kept, 'repo', '.exo', 'state.json'), 'utf8'), '{}\n');
    assert.equal(
      fs.statSync(path.join(kept, 'repo', '.exo', 'state.json')).mtimeMs,
      written.getTime(),
      'a kept file keeps its modification time, so a checkpoint can tell what was written after a point in the cell',
    );
    assert.ok(fs.existsSync(path.join(kept, 'origin.git', 'HEAD')), 'origin.git is kept beside the repository');
    assert.ok(!fs.existsSync(path.join(kept, 'tmp')), 'the cell tmp folder is not kept');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('--keep-repo names its folder in the dry run', () => {
  const run = dryRun('--set', 'flow', '--cells', 'flow-unit', '--keep-repo', '/tmp/kept-cells');
  assert.match(run.stdout, /^1 claude -p calls planned/);
  assert.match(run.stdout, /keeps each cell repository under \/tmp\/kept-cells/);
});

test('--keep-repo with the replay set is refused, since a replay cell is a worktree of this clone', () => {
  const run = dryRun('--set', 'replay', '--cases', '/nonexistent.json', '--keep-repo', '/tmp/kept-cells');
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /--keep-repo does not apply to the replay set/);
});
