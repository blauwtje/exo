import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { recordPass, recordReview, greenCommit } from '#check-cache';
import { changedTestFiles, narrowedCommand, readShadow, recordShadow } from '#suite-command';
import { landingCheckout } from './land-task-fixture.mjs';

const PASS = 'ℹ tests 1\nℹ pass 1\nℹ fail 0\n';

test('no green commit means no narrowing', async () => {
  const { root } = await landingCheckout();
  assert.equal(greenCommit(root, 'node --test'), null);
  assert.equal(changedTestFiles(root, 'node --test'), null);
});

test('only test files changed since the last full green are listed', async () => {
  const { root } = await landingCheckout();
  recordPass(root, 'node --test', 5, undefined, PASS);
  assert.match(greenCommit(root, 'node --test'), /^[0-9a-f]{40}$/);
  assert.deepEqual(changedTestFiles(root, 'node --test'), []);
  await fs.mkdir(path.join(root, 'tests'), { recursive: true });
  await fs.writeFile(path.join(root, 'tests/a.test.mjs'), 'x\n');
  await fs.writeFile(path.join(root, 'src/app.js'), 'y\n');
  assert.deepEqual(changedTestFiles(root, 'node --test'), ['tests/a.test.mjs']);
});

test('an untrusted log does not set the green commit', async () => {
  const { root } = await landingCheckout();
  recordPass(root, 'node --test', 5, undefined, 'unknown');
  assert.equal(greenCommit(root, 'node --test'), null);
});

test('the shadow log keeps narrowed-versus-full outcomes', async () => {
  const { root } = await landingCheckout();
  recordShadow(root, { command: 'c', narrowed: 'pass', full: 'fail' });
  recordShadow(root, { command: 'c', narrowed: 'pass', full: 'pass' });
  assert.deepEqual(readShadow(root).map((row) => row.full), ['fail', 'pass']);
  assert.deepEqual(readShadow(root).map((row) => row.missed), [true, false]);
});

test('a later verdict without a log keeps the earlier green commit', async () => {
  const { root } = await landingCheckout();
  recordPass(root, 'node --test', 5, undefined, PASS);
  const green = greenCommit(root, 'node --test');
  await fs.writeFile(path.join(root, 'src/app.js'), 'z\n');
  recordReview(root, 'node --test', { verdict: 'CLEAN' });
  assert.equal(greenCommit(root, 'node --test'), green);
});

test('only a whole suite of a runner that takes files is narrowed', () => {
  assert.equal(narrowedCommand('node --test', ['tests/a.test.mjs']), "node --test 'tests/a.test.mjs'");
  assert.equal(narrowedCommand('npx vitest run', ['a.test.ts', 'b.test.ts']), "npx vitest run 'a.test.ts' 'b.test.ts'");
  assert.equal(narrowedCommand('python -m pytest', ['tests/test_a.py']), "python -m pytest 'tests/test_a.py'");
  for (const command of ['npm test', 'npm run check', 'node --test tests/x.test.mjs', 'node --test && npm run lint', 'node --test > out.log', 'node build.mjs']) {
    assert.equal(narrowedCommand(command, ['tests/a.test.mjs']), null, command);
  }
});
