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

const PATHS = "import path from 'node:path';\n\nconst ROOT = '/srv/uploads';\n\nexport function resolveUpload(name) {\n  return path.join(ROOT, name);\n}\n\nexport function resolveAvatar(name) {\n  return path.join(ROOT, 'avatars', name);\n}\n";

function pathsRepo() {
  const root = repo();
  fs.writeFileSync(path.join(root, 'paths.js'), PATHS);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'paths');
  return root;
}

const siblingFinding = (range, quote) => `paths.js:${range}; defect; path traversal; unchecked join; fix\n  Probe: false\n  Class: path traversal\n  Sweep: grep -nE "return path\\.join\\(ROOT" paths.js\n  Quote: ${quote}\n`;

test('a sweep that also hits a sibling defect site keeps each finding as fix', () => {
  const text = `FINDINGS\n\n${siblingFinding('5-7', '  return path.join(ROOT, name);')}${siblingFinding('9-11', "  return path.join(ROOT, 'avatars', name);")}`;
  const merged = mergeReviews([{ name: 'review-branch', text }], new Map(), ['paths.js'], pathsRepo());
  assert.equal(merged.counts.fix, 2);
  assert.deepEqual(merged.sweepDemoted, []);
});

test('a sweep whose hits never show the quoted line is demoted to report', () => {
  const text = `FINDINGS\n\n${siblingFinding('5-7', "const ROOT = '/srv/uploads';")}`;
  const merged = mergeReviews([{ name: 'review-branch', text }], new Map(), ['paths.js'], pathsRepo());
  assert.equal(merged.counts.fix, 0);
  assert.deepEqual(merged.sweepDemoted, ['paths.js:5-7']);
});
