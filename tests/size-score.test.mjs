import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BASELINE, scoreBytes } from '../evals/size.mjs';

const script = fileURLToPath(new URL('../evals/size.mjs', import.meta.url));

function scaffold(extra) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'size-'));
  const files = { ...Object.fromEntries(BASELINE.map((file) => [file, 'ab'])), ...extra };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

test('counts bytes of in-scope files and ignores tests and evals', () => {
  const root = scaffold({ 'lib/a.mjs': 'xxx', 'tests/t.mjs': 'yyyyyy', 'evals/e.mjs': 'zzzz' });
  assert.equal(scoreBytes(root), BASELINE.length * 2 + 3);
});

test('a missing baseline file gives no score', () => {
  const root = scaffold({});
  fs.rmSync(path.join(root, BASELINE[0]));
  assert.equal(scoreBytes(root), null);
});

test('the script prints one SCORE line for this repository', () => {
  const output = execFileSync('node', [script], { encoding: 'utf8' });
  assert.match(output, /^SCORE \d+\n$/);
});
