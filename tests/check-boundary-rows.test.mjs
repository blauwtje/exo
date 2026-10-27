import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBoundaryRows } from '../verify/checks/boundary-rows.mjs';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';

const PLAN = [
  '# Plan', '', '### Task 1: guard the path', '',
  'Depends on: none | Files: `src/guard.mjs`, `tests/guard.test.mjs` | Risk: security boundary | Boundary: in a/b | out ../x | test tests/guard.test.mjs | Proof: node --test tests/guard.test.mjs', ''
].join('\n');

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-boundary-rows-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

function boundaryRows(root) {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try { checkBoundaryRows(createReport(), createRepository(root)); } finally { console.log = original; }
  return lines[0];
}

test('a Boundary test file with an out-of-scope test title passes', () => {
  const root = repo({ 'docs/specs/p.md': PLAN, 'tests/guard.test.mjs': "test('rejects an out-of-scope path', () => {});\n" });
  assert.match(boundaryRows(root), /^\[PASS\] boundary rows: /);
});

test('a Boundary test file without an out-of-scope title fails and names the file', () => {
  const root = repo({ 'docs/specs/p.md': PLAN, 'tests/guard.test.mjs': "test('rejects a path', () => {});\n// out-of-scope\n" });
  assert.match(boundaryRows(root), /^\[FAIL\] boundary rows: p\.md task 1: tests\/guard\.test\.mjs holds no test/);
});

test('a Boundary test file not on disk, or no specs folder, passes', () => {
  assert.match(boundaryRows(repo({ 'docs/specs/p.md': PLAN })), /^\[PASS\] boundary rows: /);
  assert.match(boundaryRows(repo({})), /^\[PASS\] boundary rows: /);
});

test('a spec that does not parse fails and names the spec', () => {
  const root = repo({ 'docs/specs/broken.md': '### Task 1: x\n\nDepends on: soon\n' });
  assert.match(boundaryRows(root), /^\[FAIL\] boundary rows: broken\.md does not parse: /);
});

test('the real repository passes', () => {
  assert.match(boundaryRows(fileURLToPath(new URL('..', import.meta.url))), /^\[PASS\] boundary rows: /);
});
