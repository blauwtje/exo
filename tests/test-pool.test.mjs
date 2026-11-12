import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parseTestPool, testPoolCommand } from '../lib/test-pool.mjs';
import { tempDir } from './harness.mjs';

test('a covering test runs with the node flags of the project test script', () => {
  const root = tempDir('test-pool-');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --import ./setup.mjs --test "tests/*.test.mjs"' } }));
  fs.writeFileSync(path.join(root, 'setup.mjs'), "process.env.POOL_SETUP = 'ran';\n");
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests', 'a.test.mjs'), "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\ntest('setup ran', () => assert.equal(process.env.POOL_SETUP, 'ran'));\n");
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const stdout = execSync(testPoolCommand(['tests/a.test.mjs']), { cwd: root, env: { ...env, EXO_TEST_POOL_TIMEOUT_MS: '30000' } }).toString();
  const [result] = parseTestPool(stdout);
  assert.equal(result.status, 0, result.output);
});
