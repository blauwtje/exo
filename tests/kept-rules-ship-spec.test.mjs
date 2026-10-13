import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { gateVerdict, stackOrder } from '../skills/ship/scripts/ship-gate.mjs';

test('spec: small or clear work asks no question and exo closes each choice', () => {
  const skill = fs.readFileSync(new URL('../skills/spec/SKILL.md', import.meta.url), 'utf8');
  const brief = fs.readFileSync(new URL('../skills/spec/references/brief.md', import.meta.url), 'utf8');
  assert.match(skill, /Diff fits one sentence[^\n]*code settles every point → no question/);
  assert.match(skill, /only what to build/);
  assert.match(brief, /closed by you, the code with its settling path, or exo/);
});

const open = { state: 'OPEN', mergeStateStatus: 'CLEAN', statusCheckRollup: [] };

test('gate: passed, skipped and neutral checks do not hold the merge', () => {
  const checks = ['SUCCESS', 'SKIPPED', 'NEUTRAL'].map((conclusion) => ({ name: 'ci', status: 'COMPLETED', conclusion }));
  assert.equal(gateVerdict({ ...open, statusCheckRollup: checks }), 'MERGE');
});

test('gate: a cancelled check holds the merge', () => {
  const checks = [{ name: 'ci', status: 'COMPLETED', conclusion: 'CANCELLED' }];
  assert.equal(gateVerdict({ ...open, statusCheckRollup: checks }), 'STOP conclusion=CANCELLED ci');
});

test('gate: a check not yet completed holds the merge, a commit status reads its state', () => {
  assert.equal(gateVerdict({ ...open, statusCheckRollup: [{ name: 'ci', status: 'IN_PROGRESS' }] }), 'STOP status=IN_PROGRESS ci');
  assert.equal(gateVerdict({ ...open, statusCheckRollup: [{ context: 'lint', state: 'PENDING' }] }), 'STOP state=PENDING lint');
});

test('order: every base comes before the pull request stacked on it', () => {
  const stacked = [
    { number: 2, baseRefName: 'a', headRefName: 'b' },
    { number: 1, baseRefName: 'main', headRefName: 'a' },
  ];
  assert.deepEqual(stackOrder(stacked), { order: [1, 2] });
});

test('order: base and head branches in a loop report a cycle', () => {
  const loop = [
    { number: 1, baseRefName: 'b', headRefName: 'a' },
    { number: 2, baseRefName: 'a', headRefName: 'b' },
  ];
  assert.deepEqual(stackOrder(loop), { cycle: [1, 2] });
});
