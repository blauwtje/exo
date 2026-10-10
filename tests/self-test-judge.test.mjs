// The verifier self-test passes a reject scenario only when the check it names
// fails and no other check does: a mutation caught by the wrong check proves
// nothing about the check it was written to attack.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeScenario } from '../verify/self-test.mjs';

function output(...failed) {
  return [
    '[PASS] javascript syntax: 40 modules parse',
    ...failed.map((name) => `[FAIL] ${name}: something is off: here`),
    '[WARN] some warning: not a failure',
  ].join('\n');
}

const reject = { name: 'broken-process', check: 'process structure' };

test('a reject scenario failing on its named check alone passes', () => {
  assert.equal(judgeScenario(reject, { status: 1, output: output('process structure') }), null);
});

test('a reject scenario failing on another check fails, naming both checks', () => {
  const failure = judgeScenario(reject, { status: 1, output: output('skill body budgets') });
  assert.match(failure, /broken-process/);
  assert.match(failure, /process structure/);
  assert.match(failure, /skill body budgets/);
});

test('a reject scenario failing on its check plus another check fails', () => {
  const failure = judgeScenario(reject, { status: 1, output: output('process structure', 'skill body budgets') });
  assert.match(failure, /broken-process/);
  assert.match(failure, /skill body budgets/);
});

test('a reject scenario the verifier accepts fails', () => {
  const failure = judgeScenario(reject, { status: 0, output: output() });
  assert.match(failure, /broken-process/);
  assert.match(failure, /process structure/);
});

test('a reject scenario that exits non-zero with no failed check fails', () => {
  const failure = judgeScenario(reject, { status: 1, output: 'Error: crashed' });
  assert.match(failure, /broken-process/);
});

test('a reject scenario without a check name fails even when the verifier rejects it', () => {
  const failure = judgeScenario({ name: 'unnamed' }, { status: 1, output: output('process structure') });
  assert.match(failure, /unnamed/);
  assert.match(failure, /check/);
});

test('an accept scenario the verifier accepts passes', () => {
  assert.equal(judgeScenario({ name: 'benign', expect: 'accept' }, { status: 0, output: output() }), null);
});

test('an accept scenario the verifier rejects fails with its output', () => {
  const failure = judgeScenario({ name: 'benign', expect: 'accept' }, { status: 1, output: output('process structure') });
  assert.match(failure, /benign was rejected/);
  assert.match(failure, /process structure/);
});
