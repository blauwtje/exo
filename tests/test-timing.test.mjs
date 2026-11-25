import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkTestTiming } from '../verify/checks/test-timing.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkTestTiming, createRepository(tree(files)));
}

const dateNow = ['Date', 'now'].join('.');
const performanceNow = ['performance', 'now'].join('.');
const processTicks = ['process.hr', 'time'].join('');
const uptime = ['process', 'uptime'].join('.');
const sleepHold = ['setTimeout(', 'resolve, 50)'].join('');
const sleepCall = ['sleep', '(200)'].join('');
const pauseCall = ['pause', '(5)'].join('');

test('a test that reads the clock fails', () => {
  for (const clock of [dateNow, performanceNow, processTicks, uptime]) {
    const result = run({ 'tests/a.test.mjs': `const t = ${clock}();\n` });
    assert.match(result.detail, /tests\/a\.test\.mjs:1/, clock);
  }
});

test('a test that waits a fixed time fails', () => {
  for (const hold of [sleepHold, sleepCall, pauseCall]) {
    const result = run({ 'tests/b.mjs': `await ${hold};\n` });
    assert.match(result.detail, /tests\/b\.mjs:1/, hold);
  }
});

test('a clock read outside tests passes', () => {
  const result = run({ 'lib/a.mjs': `const t = ${dateNow}();\n` });
  assert.equal(result.ok, true, result.detail);
});

test('a deferred hold, a date and a timeout option pass', () => {
  const result = run({ 'tests/a.test.mjs': 'await new Promise(setImmediate);\nconst d = new Date(0);\nrun({ timeout: 5000 });\n' });
  assert.equal(result.ok, true, result.detail);
});
