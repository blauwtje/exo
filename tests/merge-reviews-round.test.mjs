import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ledgerRows } from '../skills/gate/scripts/merge-reviews.mjs';
import { outcome } from '../lib/run-outcomes.mjs';
import { git, tempDir } from './harness.mjs';

const MERGE = fileURLToPath(new URL('../skills/gate/scripts/merge-reviews.mjs', import.meta.url));

function openFindingRepo() {
  const root = tempDir('rounds-');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'init');
  git(root, 'switch', '-q', '-c', 'feat/x');
  fs.writeFileSync(path.join(root, 'a.js'), 'x\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat: a');
  fs.writeFileSync(path.join(root, 'code-rules.md'), 'FINDINGS\n\na.js:1 defect fix\n  Probe: true\n');
  return root;
}

function merge(root) {
  return execFileSync(process.execPath, [MERGE, '--root', root, '--base', 'main', '--report', path.join(root, 'code-rules.md')], { encoding: 'utf8' });
}

const rounds = (root) => [...new Set(ledgerRows(root).map((row) => row.round))];

test('a second merge at the same HEAD stays the same round and is not recurring', () => {
  const root = openFindingRepo();
  merge(root);
  const again = merge(root);
  assert.doesNotMatch(again, /BLOCKED recurring/);
  assert.deepEqual(rounds(root), [1]);
});

test('a merge after a fix commit is a new round and an unfixed finding recurs', () => {
  const root = openFindingRepo();
  merge(root);
  git(root, 'commit', '-q', '--allow-empty', '-m', 'fix: attempt');
  const next = merge(root);
  assert.match(next, /BLOCKED recurring/);
  assert.ok(next.includes(outcome('recurring finding').line), next);
  assert.deepEqual(rounds(root), [1, 2]);
});
