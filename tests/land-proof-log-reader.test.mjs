import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { cachedPass } from '#check-cache';
import { runProof } from '../skills/build/scripts/land-proof.mjs';
import { LandingError } from '../skills/build/scripts/land-errors.mjs';
import { cacheFile, landingCheckout } from './land-task-fixture.mjs';

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
