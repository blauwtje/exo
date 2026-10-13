// A test file over TEST_FILE_CAP bytes fails the static check, naming the file,
// so a large test file is split before it lands.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { TEST_FILE_CAP } from '../verify/budgets.mjs';
import { checkTestSize } from '../verify/checks/test-size.mjs';

function verdict(root) {
  const report = createReport();
  const printed = [];
  const log = console.log;
  console.log = (line) => printed.push(String(line));
  try {
    checkTestSize(report, createRepository(root));
  } finally {
    console.log = log;
  }
  return { counts: report.counts(), detail: printed.join('\n') };
}

test('a test file over the cap fails and is named', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-test-size-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests', 'small.test.mjs'), '// small\n', 'utf8');
  fs.writeFileSync(path.join(root, 'tests', 'big.test.mjs'), `// ${'x'.repeat(TEST_FILE_CAP.bytes)}\n`, 'utf8');
  const { counts, detail } = verdict(root);
  assert.equal(TEST_FILE_CAP.bytes, 40 * 1024);
  assert.equal(counts.FAIL, 1, detail);
  assert.match(detail, /tests\/big\.test\.mjs/);
  assert.doesNotMatch(detail, /small\.test\.mjs/);
});
