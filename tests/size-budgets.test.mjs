import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSizeBudgets } from '../verify/checks/size-budgets.mjs';
import { createRepository } from '../verify/repository.mjs';

function writeFile(root, relative) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, 'x\n');
}

test('a repository over a cap fails and the others pass, with evals/results not counted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-size-'));
  for (const relative of ['evals/a/prompt.md', 'evals/b/case.yaml', 'evals/results/run/prompt.md', 'tests/one.test.mjs', 'verify/checks/one.mjs']) {
    writeFile(root, relative);
  }
  const results = [];
  const report = { result: (status, name) => results.push([status, name]) };
  const caps = { files: 100, checkModules: 1, testFiles: 0, skillScripts: 0, evalCases: 2 };
  checkSizeBudgets(report, createRepository(root), caps);
  assert.deepEqual(results, [
    ['PASS', 'size files'],
    ['PASS', 'size checkModules'],
    ['FAIL', 'size testFiles'],
    ['PASS', 'size skillScripts'],
    ['PASS', 'size evalCases']
  ]);
});
