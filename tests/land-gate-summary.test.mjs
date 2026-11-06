import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gateRefusal, recordPass } from '#check-cache';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { git } from './harness.mjs';
import { PLAN, landingCheckout, editApp } from './land-task-fixture.mjs';

const withLandGate = (command) => PLAN.replace('Branch: feat/fixture', `Branch: feat/fixture\nLand gate: ${command}`);
const FAILING = 'SUMMARY PASS=9 FAIL=1 WARN=0 UNRUN=0';
const CLEAN = 'SUMMARY PASS=9 FAIL=0 WARN=0 UNRUN=0';

test('a gate that exits 0 while its log ends FAIL=1 is refused and nothing commits', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  assert.throws(
    () => landTask({ planPath, planText: withLandGate(`echo '${FAILING}'`), number: 1, root }),
    /exited 0 but its log ends "SUMMARY PASS=9 FAIL=1/
  );
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('a cached pass whose kept log ends FAIL=1 is not trusted, so the gate runs and refuses', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  recordPass(root, 'exit 1', 5, undefined, FAILING);
  assert.throws(() => landTask({ planPath, planText: withLandGate('exit 1'), number: 1, root }), /Land gate "exit 1" failed/);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('a cached pass with no kept log is not trusted', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  recordPass(root, 'exit 1', 5);
  assert.throws(() => landTask({ planPath, planText: withLandGate('exit 1'), number: 1, root }), /Land gate "exit 1" failed/);
});

test('a cached pass whose kept log ends clean on this tree is skipped', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  recordPass(root, 'exit 1', 5, undefined, CLEAN);
  const output = landTask({ planPath, planText: withLandGate('exit 1'), number: 1, root });
  assert.match(output, /^Land gate "exit 1" skipped: its log shows a clean pass on this tree\.$/m);
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('a check gate needs a SUMMARY line, FAIL=0 and, unless static, WARN=0 UNRUN=0', () => {
  assert.match(gateRefusal('npm run check', 'ok'), /no SUMMARY line/);
  assert.match(gateRefusal('npm run check', 'SUMMARY PASS=9 FAIL=0 WARN=1 UNRUN=0'), /not FAIL=0 WARN=0 UNRUN=0/);
  assert.match(gateRefusal('npm run validate:static', FAILING), /FAIL=1/);
  assert.equal(gateRefusal('npm run validate:static', 'SUMMARY PASS=9 FAIL=0 WARN=2 UNRUN=3'), null);
  assert.equal(gateRefusal('npm run check', CLEAN), null);
  assert.equal(gateRefusal('node --test', 'pass 3'), null);
});

test('only the last SUMMARY line counts', () => {
  assert.equal(gateRefusal('npm run check', `${FAILING}\n${CLEAN}`), null);
  assert.match(gateRefusal('npm run check', `${CLEAN}\n${FAILING}`), /FAIL=1/);
});
