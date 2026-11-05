import test from 'node:test';
import assert from 'node:assert/strict';
import { answerOf, plainLine, renderRunReport } from '../skills/gate/scripts/gate-report.mjs';

test('the answer counts failing checks and manual checks in one line', () => {
  assert.equal(answerOf(['PASS a', 'DONE Task 1: x'], 0), 'All checks passed.');
  assert.equal(answerOf(['FAIL a', 'UNPLANNED b'], 1), '2 checks failed. Fix these first. 1 thing is left for you to try by hand.');
  assert.equal(answerOf(['FAIL a'], 2), '1 check failed. Fix these first. 2 things are left for you to try by hand.');
});

test('the report opens with the answer and fills every section from the template', () => {
  const text = renderRunReport({ answer: 'All checks passed.', proofs: 'Landed: none', checks: ['PASS a'], context: ['- x: 1k'], manual: ['Open it.'] });
  const lines = text.split('\n');
  assert.equal(lines[0], 'All checks passed.');
  assert.equal(lines.filter((line) => line.startsWith('## ')).length, 4);
  assert.ok(text.includes('\nLanded: none\n'));
  assert.ok(text.includes('\nworks a\n'));
  assert.ok(text.includes('\n- Open it.\n'));
  assert.ok(!text.includes('{{'));
  assert.ok(!text.includes('<!--'));
});

test('a status word at the start of a check line becomes plain words', () => {
  assert.equal(plainLine('PASS unplanned-paths'), 'works unplanned-paths');
  assert.equal(plainLine('FAIL success-criterion'), 'broken success-criterion');
  assert.equal(plainLine('FIX-ONLY a.md (abc)'), 'fix only a.md (abc)');
  assert.equal(plainLine('DONE Task 1: x'), 'done Task 1: x');
  assert.equal(plainLine('nothing to change'), 'nothing to change');
});

test('the rendered report holds no all-caps status word from check lines', () => {
  const text = renderRunReport({ answer: 'a', proofs: 'p', checks: ['PASS a', 'FAIL b'], context: [], manual: [] });
  assert.ok(text.includes('\nworks a\nbroken b\n'));
});
