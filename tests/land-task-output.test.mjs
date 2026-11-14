import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landingForCaller } from '../skills/build/scripts/land-task.mjs';

const LANDING = [
  'Landed: task 1',
  'Proof: node --test: pass (exit 0, pass 3)',
  '  # tests 3',
  '  # pass 3',
  'Route: inline',
  'Then: run next',
  ''
].join('\n');

test('landingForCaller drops the indented proof tail', () => {
  const shown = landingForCaller(LANDING);
  assert.equal(shown.includes('# tests 3'), false);
  assert.match(shown, /^Proof: node --test: pass \(exit 0, pass 3\)$/m);
});

test('landingForCaller drops the lines the chained report repeats', () => {
  const shown = landingForCaller(LANDING, { followed: true });
  assert.doesNotMatch(shown, /^(?:Landed|Route|Then): /m);
  assert.match(shown, /^Proof: /m);
});

test('landingForCaller keeps the Landed line when nothing follows', () => {
  assert.match(landingForCaller(LANDING), /^Landed: task 1$/m);
});
