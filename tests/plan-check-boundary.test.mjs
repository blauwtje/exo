import assert from 'node:assert/strict';
import test from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import { compactPlanFixture } from './harness.mjs';

function boundaryLines(extraFields) {
  const task = [
    '### Task 1: feat(sandbox): confine the path',
    `Depends on: none | Files: \`lib/a.mjs\`, \`tests/a.test.mjs\` | Data: a path | Risk: security boundary${extraFields} | Proof: node --test tests/a.test.mjs`
  ].join('\n');
  return planCheckReport(compactPlanFixture({ tasks: [task] })).lines.filter((line) => line.includes('Boundary'));
}

test('a security-boundary task with no Boundary field is flagged with the field format', () => {
  const lines = boundaryLines('');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Task 1/);
  assert.match(lines[0], /Boundary: in <.+> \| out <.+> \| test <.+>/);
});

test('a security-boundary task whose Boundary test file is outside Files is flagged', () => {
  const lines = boundaryLines(' | Boundary: in a path | out a bad path | test tests/other.test.mjs');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /tests\/other\.test\.mjs/);
  assert.match(lines[0], /Boundary: in <.+> \| out <.+> \| test <.+>/);
});

test('a security-boundary task whose Boundary test file is in Files passes', () => {
  assert.deepEqual(boundaryLines(' | Boundary: in a path | out a bad path | test tests/a.test.mjs'), []);
});

test('a task without Risk: security boundary needs no Boundary field', () => {
  const task = '### Task 1: feat(a): change\nDepends on: none | Files: `lib/a.mjs` | Data: a path | Risk: dependency | Proof: node --test';
  const lines = planCheckReport(compactPlanFixture({ tasks: [task] })).lines.filter((line) => line.includes('Boundary'));
  assert.deepEqual(lines, []);
});
