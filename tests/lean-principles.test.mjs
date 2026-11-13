import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const OWNER = 'lib/references/lean.md';

test('lean push-back lines are stated and sourced', () => {
  const lean = fs.readFileSync(OWNER, 'utf8');
  assert.match(lean, /simpler approach exists/);
  assert.match(lean, /single-use code/);
  assert.match(lean, /trivial task/);
  const principles = fs.readFileSync('docs/principles/prompt.md', 'utf8');
  assert.match(principles, /2026-01-26/);
  assert.match(principles, /x\.com\/karpathy\/status\/2015883857489522876/);
});
