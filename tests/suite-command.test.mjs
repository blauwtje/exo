// wholeSuiteKeys tells a whole-suite run from one narrowed to some tests.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wholeSuiteKeys } from '../lib/suite-command.mjs';

test('wholeSuiteKeys keys a whole-suite segment and skips one narrowed by an argument', () => {
  assert.deepEqual(wholeSuiteKeys('npm test'), ['npm test']);
  assert.deepEqual(wholeSuiteKeys('npm run test'), ['npm test']);
  assert.deepEqual(wholeSuiteKeys('CI=1 npm test > .exo/log 2>&1'), ['npm test']);
  assert.deepEqual(wholeSuiteKeys('npx vitest run'), ['npx vitest']);
  assert.deepEqual(wholeSuiteKeys('npm test -- tests/tax.test.ts'), []);
  assert.deepEqual(wholeSuiteKeys('npm test -- due-tone'), []);
  assert.deepEqual(wholeSuiteKeys('npm install'), []);
  assert.deepEqual(wholeSuiteKeys('npm test && npm run lint'), ['npm test', 'npm lint']);
  assert.deepEqual(wholeSuiteKeys('npm test | tail -5'), ['npm test']);
});
