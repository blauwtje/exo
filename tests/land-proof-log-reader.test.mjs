import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { cachedPass } from '#check-cache';
import { runProof } from '../skills/build/scripts/land-proof.mjs';
import { LandingError } from '../skills/build/scripts/land-errors.mjs';
import { cacheFile, landingCheckout } from './land-task-fixture.mjs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { readShadow, recordShadow } from '#suite-command';
import { git } from './harness.mjs';

const TASK = { number: 1, section: '' };
const OPTIONS = (root) => ({ root, field: 'Proof', docker: { needed: () => false }, pendingEvidence: undefined });
const printing = (...lines) => `printf '%s\\n' ${lines.map((line) => `'${line}'`).join(' ')}`;

for (const [name, command] of [
  ['a hash-prefixed node:test summary', printing('# tests 3', '# pass 2', '# fail 1')],
  ['a spec reporter summary', printing('ℹ tests 3', 'ℹ pass 2', 'ℹ fail 1')],
  ['a TAP log with a not ok line', printing('TAP version 13', 'ok 1 - a', 'not ok 2 - b', '1..2')],
]) {
  test(`runProof refuses ${name} that exits 0 and caches nothing`, async () => {
    const { root } = await landingCheckout();
    assert.throws(
      () => runProof(TASK, command, OPTIONS(root)),
      (error) => error instanceof LandingError && /exit 0 but its log reports 1 failing/.test(error.message)
    );
    assert.equal(cachedPass(root, command), null);
  });
}

test('runProof passes a clean node:test log and a rerun on the same tree is skipped', async () => {
  const { root } = await landingCheckout();
  const command = printing('# tests 3', '# pass 3', '# fail 0');
  runProof(TASK, command, OPTIONS(root));
  assert.match(runProof(TASK, command, OPTIONS(root)).tail[0], /not rerun/);
});

test('runProof passes an exit 0 command of unknown format but never caches it, so it runs again', async () => {
  const { root } = await landingCheckout();
  const command = 'echo all good';
  assert.deepEqual(runProof(TASK, command, OPTIONS(root)).tail, ['  all good']);
  assert.equal(cachedPass(root, command), null);
  assert.equal(JSON.parse(fs.readFileSync(cacheFile(root), 'utf8'))[command].log, undefined);
  assert.deepEqual(runProof(TASK, command, OPTIONS(root)).tail, ['  all good']);
});

const PASSING = "import { test } from 'node:test';\ntest('ok', () => {});\n";
const READS_APP = "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { greet } from '../src/app.js';\ntest('greets', () => assert.equal(greet(), undefined));\n";

delete process.env.NODE_TEST_CONTEXT;

async function greenCheckout() {
  const { root } = await landingCheckout();
  await fsp.writeFile(path.join(root, 'package.json'), '{"type":"module"}\n');
  await fsp.mkdir(path.join(root, 'tests'));
  await fsp.writeFile(path.join(root, 'tests/app.test.mjs'), READS_APP);
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
  await fsp.writeFile(path.join(root, 'tests/new.test.mjs'), PASSING);
  runProof(TASK, 'node --test', OPTIONS(root));
  assert.deepEqual(readShadow(root), [{ command: 'node --test', files: 1, narrowed: 'pass', full: 'pass', missed: false }]);
});

test('the full suite still decides, and a failure only it finds is logged as missed', async () => {
  const root = await greenCheckout();
  await fsp.writeFile(path.join(root, 'tests/new.test.mjs'), PASSING);
  await fsp.writeFile(path.join(root, 'src/app.js'), 'export function greet() { return 1; }\n');
  assert.throws(() => runProof(TASK, 'node --test', OPTIONS(root)), LandingError);
  assert.deepEqual(readShadow(root), [{ command: 'node --test', files: 1, narrowed: 'pass', full: 'fail', missed: true }]);
});

test('after ten clean shadow runs only the changed tests run and the row says the full suite was skipped', async () => {
  const root = await greenCheckout();
  for (let run = 0; run < 10; run += 1) recordShadow(root, { command: 'node --test', files: 1, narrowed: 'pass', full: 'pass' });
  await fsp.writeFile(path.join(root, 'tests/new.test.mjs'), PASSING);
  await fsp.writeFile(path.join(root, 'src/app.js'), 'export function greet() { return 1; }\n');
  runProof(TASK, 'node --test', OPTIONS(root));
  assert.deepEqual(readShadow(root).at(-1), { command: 'node --test', files: 1, narrowed: 'pass', full: 'skipped', missed: false });
});
