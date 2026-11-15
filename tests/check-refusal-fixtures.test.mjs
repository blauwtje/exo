import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkRefusalFixtures } from '../verify/checks/refusal-fixtures.mjs';
import { createRepository } from '../verify/repository.mjs';
import { REPOSITORY_ROOT as ROOT, tempDir } from './harness.mjs';

const CALLS = JSON.parse(fs.readFileSync(new URL('./fixtures/hook-refusal-calls.json', import.meta.url), 'utf8'));

function results(calls) {
  const root = tempDir('refusal-fixtures-');
  fs.mkdirSync(path.join(root, 'tests/fixtures'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tests/fixtures/hook-refusal-calls.json'), JSON.stringify(calls));
  fs.symlinkSync(path.join(ROOT, 'hooks'), path.join(root, 'hooks'));
  const found = [];
  checkRefusalFixtures({ result: (status, name, detail) => found.push({ status, detail }) }, createRepository(root));
  return found;
}

const ofRule = (id, expect) => CALLS.filter((call) => call.rule === id && call.expect === expect);

test('every fixture call gets its expected verdict from the hook entry points', () => {
  assert.deepEqual(results(CALLS), [{ status: 'PASS', detail: `${CALLS.length} real calls got their expected pass, note or deny` }]);
});

test('the table keeps the legitimate calls that were once refused', () => {
  for (const id of ['stash', 'shared-state', 'sleep', 'size-cap', 'fetches', 'fail-open']) assert.ok(ofRule(id, 'pass').length > 0, id);
  for (const id of ['stash', 'shared-state', 'commit-attribution']) assert.ok(ofRule(id, 'deny').length > 0, id);
});

test('a wrong expectation is reported with the rule and the verdict reached', () => {
  const wrong = [{ ...ofRule('stash', 'pass')[0], expect: 'deny' }];
  const [failure] = results(wrong);
  assert.equal(failure.status, 'FAIL');
  assert.match(failure.detail, /stash .* expected deny and got pass/);
});

test('a verdict of pass, note or deny is read from the hook output', () => {
  for (const verdict of ['pass', 'note', 'deny']) assert.ok(CALLS.some((call) => call.expect === verdict), verdict);
});
