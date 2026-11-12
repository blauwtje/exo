import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { refusalFixtureFindings, verdictOf } from '../verify/checks/refusal-fixtures.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CALLS = JSON.parse(fs.readFileSync(new URL('./fixtures/hook-refusal-calls.json', import.meta.url), 'utf8'));
const ofRule = (id, expect) => CALLS.filter((call) => call.rule === id && call.expect === expect);

test('every fixture call gets its expected verdict from the hook entry points', () => {
  assert.deepEqual(refusalFixtureFindings(ROOT, CALLS), []);
});

test('the table keeps the legitimate calls that were once refused', () => {
  for (const id of ['stash', 'shared-state', 'sleep', 'size-cap', 'fetches', 'fail-open']) assert.ok(ofRule(id, 'pass').length > 0, id);
  for (const id of ['stash', 'shared-state', 'commit-attribution']) assert.ok(ofRule(id, 'deny').length > 0, id);
});

test('a wrong expectation is reported with the rule and the verdict reached', () => {
  const wrong = [{ ...ofRule('stash', 'pass')[0], expect: 'deny' }];
  assert.match(refusalFixtureFindings(ROOT, wrong)[0], /stash .* expected deny and got pass/);
});

test('a verdict is read from the hook output', () => {
  assert.equal(verdictOf(''), 'pass');
  assert.equal(verdictOf('{"decision":"block"}'), 'deny');
  assert.equal(verdictOf('{"hookSpecificOutput":{"additionalContext":"x"}}'), 'note');
  assert.equal(verdictOf('{"hookSpecificOutput":{"updatedInput":{}}}'), 'pass');
});
