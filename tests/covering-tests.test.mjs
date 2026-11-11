import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { coveringTests } from '../lib/covering-tests.mjs';
import { checkCoveringTests } from '../verify/checks/covering-tests.mjs';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

function repo(files) {
  const root = tempDir('exo-covering-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

const FILES = {
  'agents/build-task.md': 'agent\n',
  'skills/build/scripts/land-task.mjs': 'code\n',
  'skills/build/references/workspace.md': 'doc\n',
  'tests/agents.test.mjs': "read('agents/build-task.md');\n",
  'tests/zeta.test.mjs': 'const f = "skills/build/scripts/land-task.mjs";\n',
  'tests/alpha.test.mjs': 'const d = `skills/build`;\n',
  'tests/slash.test.mjs': "const d = 'agents/';\n",
  'tests/near.test.mjs': "const f = 'agents/build-task.mdx'; const g = 'skills/builder';\n",
  'tests/helper.mjs': "'agents/build-task.md'\n"
};

test('a quoted literal equal to the changed path selects its test', () => {
  const root = repo(FILES);
  assert.deepEqual(coveringTests(root, ['agents/build-task.md']), ['tests/agents.test.mjs', 'tests/slash.test.mjs']);
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
  const passing = covering(repo({ 'agents/build-task.md': 'a\n', 'tests/agents.test.mjs': "read('agents/build-task.md'); 'x.mjs';\n", 'verify/checks/x.mjs': '' }));
  assert.match(passing[0], /^\[PASS\] covering tests: /);
  const failing = covering(repo({ 'agents/build-task.md': 'a\n', 'tests/agents.test.mjs': "read('agents/other.md');\n", 'verify/checks/x.mjs': '' }));
  assert.match(failing[0], /^\[FAIL\] covering tests: .*agents\/build-task\.md to tests\/agents\.test\.mjs/);
});

test('the real repository still maps agents/build-task.md to tests/agents.test.mjs', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  assert.match(covering(root)[0], /^\[PASS\] covering tests: /);
});

test('the covering-tests check fails when a check module is named by no test', () => {
  const unnamed = covering(repo({ 'agents/build-task.md': 'a\n', 'tests/agents.test.mjs': "read('agents/build-task.md');\n", 'verify/checks/lonely.mjs': '' }));
  assert.match(unnamed[0], /^\[FAIL\] covering tests: no tests\/\*\.test\.mjs names verify\/checks\/lonely\.mjs/);
});
