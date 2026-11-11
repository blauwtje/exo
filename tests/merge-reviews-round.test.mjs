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

function merge(root, ...extra) {
  return execFileSync(process.execPath, [MERGE, '--root', root, '--base', 'main', '--report', path.join(root, 'code-rules.md'), ...extra], { encoding: 'utf8' });
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
  fs.writeFileSync(path.join(root, 'a.js'), 'y\n');
  git(root, 'commit', '-q', '-am', 'fix: attempt');
  const next = merge(root, '--fix-base', git(root, 'rev-parse', 'HEAD~1').trim());
  assert.match(next, /BLOCKED recurring/);
  assert.ok(next.includes(outcome('recurring finding').line), next);
  assert.deepEqual(rounds(root), [1, 2]);
});

test('a concern is no CLUSTER line and a defect is one', () => {
  const root = openFindingRepo();
  fs.writeFileSync(path.join(root, 'code-rules.md'), 'FINDINGS\n\na.js:1 concern worry\n');
  assert.doesNotMatch(merge(root), /^CLUSTER/m);
  fs.writeFileSync(path.join(root, 'code-rules.md'), 'FINDINGS\n\na.js:1 concern worry fix\n  Probe: grep -q x a.js\n');
  assert.doesNotMatch(merge(root), /fix=[1-9]/);
});
