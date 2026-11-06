import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cachedPass, judgeLog, recordPass } from '#check-cache';
import { landingCheckout, editApp } from './land-task-fixture.mjs';

const CLEAN = 'SUMMARY PASS=9 FAIL=0 WARN=0 UNRUN=0';
const NODE_PASS = 'ℹ tests 3\nℹ pass 3\nℹ fail 0\n';
const NODE_FAIL = '# tests 3\n# pass 2\n# fail 1\n';
const TAP_PASS = 'TAP version 13\nok 1 - a\nok 2 - b\n1..2\n';
const TAP_FAIL = 'TAP version 13\nok 1 - a\nnot ok 2 - b\n1..2\n';

test('node:test and TAP output are judged by their own counts', () => {
  assert.equal(judgeLog('node --test', NODE_PASS).pass, true);
  assert.equal(judgeLog('node --test', NODE_FAIL).pass, false);
  assert.match(judgeLog('node --test', NODE_FAIL).refusal, /1 failing/);
  assert.equal(judgeLog('tap run', TAP_PASS).pass, true);
  assert.equal(judgeLog('tap run', TAP_FAIL).pass, false);
});

test('output with no SUMMARY and no known shape is neither a pass nor a refusal', () => {
  assert.deepEqual(judgeLog('make lint', 'all good'), { pass: null, refusal: null });
});

test('a SUMMARY line outranks a node:test count', () => {
  assert.equal(judgeLog('npm run check', `${NODE_PASS}SUMMARY PASS=1 FAIL=1 WARN=0 UNRUN=0`).pass, false);
});

for (const [name, output, trusted] of [
  ['a clean SUMMARY log', CLEAN, true],
  ['a node:test log with fail 0', NODE_PASS, true],
  ['a node:test log with a failure', NODE_FAIL, false],
  ['a log of an unknown shape', 'all good', false],
  ['no log', undefined, false],
]) {
  test(`a cached pass is ${trusted ? '' : 'not '}trusted from ${name}`, async () => {
    const { root } = await landingCheckout();
    await editApp(root);
    recordPass(root, 'exit 1', 5, undefined, output);
    assert.equal(cachedPass(root, 'exit 1') !== null, trusted);
  });
}

test('a proved key is judged by the command it proves', async () => {
  const { root } = await landingCheckout();
  await editApp(root);
  recordPass(root, 'red-green:abc:exit 1', 5, undefined, NODE_FAIL);
  assert.equal(cachedPass(root, 'red-green:abc:exit 1', 'exit 1'), null);
  recordPass(root, 'red-green:abc:exit 1', 5, undefined, NODE_PASS);
  assert.notEqual(cachedPass(root, 'red-green:abc:exit 1', 'exit 1'), null);
});
