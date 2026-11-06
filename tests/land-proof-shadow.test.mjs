import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { readShadow, recordShadow } from '#suite-command';
import { runProof } from '../skills/build/scripts/land-proof.mjs';
import { LandingError } from '../skills/build/scripts/land-errors.mjs';
import { git } from './harness.mjs';
import { landingCheckout } from './land-task-fixture.mjs';

const TASK = { number: 1, section: '' };
const OPTIONS = (root) => ({ root, field: 'Proof', docker: { needed: () => false }, pendingEvidence: undefined });
const PASSING = "import { test } from 'node:test';\ntest('ok', () => {});\n";
const READS_APP = "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { greet } from '../src/app.js';\ntest('greets', () => assert.equal(greet(), undefined));\n";

delete process.env.NODE_TEST_CONTEXT;

async function greenCheckout() {
  const { root } = await landingCheckout();
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}\n');
  await fs.mkdir(path.join(root, 'tests'));
  await fs.writeFile(path.join(root, 'tests/app.test.mjs'), READS_APP);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'test: app');
  runProof(TASK, 'node --test', OPTIONS(root));
  return root;
}

test('a whole-suite proof with no full green yet logs no shadow row', async () => {
  const root = await greenCheckout();
  assert.deepEqual(readShadow(root), []);
});

test('a rerun after a full green also runs the changed test files and logs both outcomes', async () => {
  const root = await greenCheckout();
  await fs.writeFile(path.join(root, 'tests/new.test.mjs'), PASSING);
  runProof(TASK, 'node --test', OPTIONS(root));
  assert.deepEqual(readShadow(root), [{ command: 'node --test', files: 1, narrowed: 'pass', full: 'pass', missed: false }]);
});

test('the full suite still decides, and a failure only it finds is logged as missed', async () => {
  const root = await greenCheckout();
  await fs.writeFile(path.join(root, 'tests/new.test.mjs'), PASSING);
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() { return 1; }\n');
  assert.throws(() => runProof(TASK, 'node --test', OPTIONS(root)), LandingError);
  assert.deepEqual(readShadow(root), [{ command: 'node --test', files: 1, narrowed: 'pass', full: 'fail', missed: true }]);
});

test('after ten clean shadow runs only the changed tests run and the row says the full suite was skipped', async () => {
  const root = await greenCheckout();
  for (let run = 0; run < 10; run += 1) recordShadow(root, { command: 'node --test', files: 1, narrowed: 'pass', full: 'pass' });
  await fs.writeFile(path.join(root, 'tests/new.test.mjs'), PASSING);
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() { return 1; }\n');
  runProof(TASK, 'node --test', OPTIONS(root));
  assert.deepEqual(readShadow(root).at(-1), { command: 'node --test', files: 1, narrowed: 'pass', full: 'skipped', missed: false });
});
