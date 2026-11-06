import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { mergeReviews } from '../skills/gate/scripts/merge-reviews.mjs';
import { git, tempDir } from './harness.mjs';

const SOURCE = 'const keep = 1;\nif (bad) skip();\nconst after = 2;\n';

function repo() {
  const root = tempDir('sweep-');
  git(root, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, 'a.js'), SOURCE);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}

const withSweep = (sweep) => [{ name: 'review-branch', text: `FINDINGS\n\na.js:2; defect; skip; bad branch; fix\n  Probe: true\n  Class: rule\n  Sweep: ${sweep}\n  Quote: if (bad) skip();\n` }];

test('a sweep that hits only the defect line keeps the finding as fix', () => {
  const merged = mergeReviews(withSweep('grep -n "skip()" a.js'), new Map(), ['a.js'], repo());
  assert.equal(merged.counts.fix, 1);
  assert.deepEqual(merged.sweepDemoted, []);
});

test('a sweep that hits a line the fix does not remove is demoted to report', () => {
  const merged = mergeReviews(withSweep('grep -n "const" a.js'), new Map(), ['a.js'], repo());
  assert.equal(merged.counts.fix, 0);
  assert.deepEqual(merged.sweepDemoted, ['a.js:2']);
});

test('a sweep that hits nothing at the pre-fix HEAD is demoted to report', () => {
  const merged = mergeReviews(withSweep('grep -L "skip()" a.js'), new Map(), ['a.js'], repo());
  assert.deepEqual(merged.sweepDemoted, ['a.js:2']);
});
