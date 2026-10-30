import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { coveringTests } from '../lib/covering-tests.mjs';
import { checkCoveringTests } from '../verify/checks/covering-tests.mjs';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-covering-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

const FILES = {
  'agents/task-runner.md': 'agent\n',
  'skills/build/scripts/land-task.mjs': 'code\n',
  'skills/build/references/workspace.md': 'doc\n',
  'tests/agents.test.mjs': "read('agents/task-runner.md');\n",
  'tests/zeta.test.mjs': 'const f = "skills/build/scripts/land-task.mjs";\n',
  'tests/alpha.test.mjs': 'const d = `skills/build`;\n',
  'tests/slash.test.mjs': "const d = 'agents/';\n",
  'tests/near.test.mjs': "const f = 'agents/task-runner.mdx'; const g = 'skills/builder';\n",
  'tests/helper.mjs': "'agents/task-runner.md'\n"
};

test('a quoted literal equal to the changed path selects its test', () => {
  const root = repo(FILES);
  assert.deepEqual(coveringTests(root, ['agents/task-runner.md']), ['tests/agents.test.mjs', 'tests/slash.test.mjs']);
});

test('a literal naming an ancestor folder selects its test, with or without a trailing slash', () => {
  const root = repo(FILES);
  assert.deepEqual(coveringTests(root, ['skills/build/references/workspace.md']), ['tests/alpha.test.mjs']);
  assert.deepEqual(coveringTests(root, ['agents/other.md']), ['tests/slash.test.mjs']);
});

test('a folder entry expands to the files under it, sorted and without duplicates', () => {
  const root = repo(FILES);
  assert.deepEqual(coveringTests(root, ['skills/build/scripts/']), ['tests/alpha.test.mjs', 'tests/zeta.test.mjs']);
  assert.deepEqual(coveringTests(root, ['skills/build/']), ['tests/alpha.test.mjs', 'tests/zeta.test.mjs']);
});

test('near-miss literals, helpers and unrelated paths select nothing', () => {
  const root = repo(FILES);
  assert.deepEqual(coveringTests(root, ['docs/other.md']), []);
  assert.deepEqual(coveringTests(repo({ 'a.md': 'x' }), ['a.md']), []);
});

function covering(root) {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try { checkCoveringTests(createReport(), createRepository(root)); } finally { console.log = original; }
  return lines;
}

test('the covering-tests check passes when the known pair maps and fails when the scan loses it', () => {
  const passing = covering(repo({ 'agents/task-runner.md': 'a\n', 'tests/agents.test.mjs': "read('agents/task-runner.md');\n" }));
  assert.match(passing[0], /^\[PASS\] covering tests: /);
  const failing = covering(repo({ 'agents/task-runner.md': 'a\n', 'tests/agents.test.mjs': "read('agents/other.md');\n" }));
  assert.match(failing[0], /^\[FAIL\] covering tests: .*agents\/task-runner\.md to tests\/agents\.test\.mjs/);
});

test('the real repository still maps agents/task-runner.md to tests/agents.test.mjs', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  assert.match(covering(root)[0], /^\[PASS\] covering tests: /);
});
