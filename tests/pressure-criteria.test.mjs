import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { linesForCase, parseCriteria } from '../skills/edit-skills/scripts/pressure-grade.mjs';

const root = path.resolve(import.meta.dirname, '../benchmarks/pressure');

test('every pressure criteria file parses, so no pass line is untagged', () => {
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => fs.readdirSync(path.join(root, entry.name))
      .filter((name) => /^criteria.*\.md$/.test(name))
      .map((name) => path.join(root, entry.name, name)));
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.doesNotThrow(() => parseCriteria(fs.readFileSync(file, 'utf8')), file);
  }
});

test('build small-plan lines a command in the checkout can decide carry a run tag', () => {
  const parsed = parseCriteria(fs.readFileSync(path.join(root, 'build/criteria.md'), 'utf8'));
  const lines = linesForCase(parsed, 'case7-small-plan.txt');
  for (const name of ['Every task lands.', 'Nothing leaves the machine.']) {
    assert.equal(lines.find((line) => line.text.includes(name))?.tag.kind, 'run', name);
  }
});

test('the graded-run docs state no stale runs flag and a threshold example that tolerates one failed run in three', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /Add `--runs 3`/);
  const threshold = Number(/--grade --threshold ([\d.]+)/.exec(readme)?.[1]);
  assert.ok(threshold > 0 && threshold <= 2 / 3, `threshold ${threshold}`);
});
