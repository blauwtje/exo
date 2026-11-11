import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixDiffRanges } from '../skills/gate/scripts/fix-diff-scope.mjs';

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

test('a deleted file keeps its path in the ranges', () => {
  const root = mkdtempSync(join(tmpdir(), 'fix-scope-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'user@example.com');
  git(root, 'config', 'user.name', 'Jane Doe');
  writeFileSync(join(root, 'gone.txt'), 'a\nb\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'rm', '-q', 'gone.txt');
  git(root, 'commit', '-qm', 'delete');
  const ranges = fixDiffRanges(root, base);
  rmSync(root, { recursive: true });
  assert.deepEqual([...ranges.keys()], ['gone.txt']);
});
