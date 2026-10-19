import assert from 'node:assert/strict';
import test from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import { compactPlanFixture, compactTask } from './harness.mjs';

function evidenceProblems(tasks) {
  return planCheckReport(compactPlanFixture({ tasks }), {}).lines.filter((line) => line.includes('Evidence'));
}

const withEvidence = (task, value) => task.replace(' | Proof:', ` | Evidence: ${value} | Proof:`);

test('a plan changing a wording file with no Evidence field is flagged', () => {
  for (const file of ['skills/x/SKILL.md', 'skills/x/references/y.md', 'agents/z.md', 'hooks/session-routing.md', 'hooks/session-rules.md', 'harnesses/codex/host-note.md']) {
    const problems = evidenceProblems([compactTask({ number: 1, title: 'Edit wording', files: [file] })]);
    assert.equal(problems.length, 1, file);
    assert.match(problems[0], /Task 1/);
  }
});

test('one task with a valid Evidence field covers the plan', () => {
  for (const value of ['benchmarks/results/run.json', 'benchmarks/pressure/a/b.md', 'none (structural)']) {
    const problems = evidenceProblems([
      compactTask({ number: 1, title: 'Edit wording', files: ['skills/x/SKILL.md'] }),
      withEvidence(compactTask({ number: 2, title: 'Edit more', files: ['agents/z.md'] }), value)
    ]);
    assert.deepEqual(problems, [], value);
  }
});

test('an Evidence value outside the allowed forms is flagged', () => {
  for (const value of ['none ()', 'none', 'docs/x.md', 'done']) {
    const problems = evidenceProblems([withEvidence(compactTask({ number: 1, title: 'Edit wording', files: ['skills/x/SKILL.md'] }), value)]);
    assert.equal(problems.length, 1, value);
  }
});

test('a plan touching no wording file needs no Evidence field', () => {
  assert.deepEqual(evidenceProblems([compactTask({ number: 1, title: 'Change code', files: ['lib/a.mjs'] })]), []);
});

test('a reason holding parentheses is accepted as the verify check accepts it', () => {
  const problems = evidenceProblems([withEvidence(compactTask({ number: 1, title: 'Edit wording', files: ['skills/x/SKILL.md'] }), 'none (fix (typo))')]);
  assert.deepEqual(problems, []);
});

test('a Files folder entry holding wording needs an Evidence field', () => {
  for (const folder of ['skills/x/', 'skills/x/references/', 'agents/', 'hooks/', 'harnesses/codex/']) {
    const problems = evidenceProblems([compactTask({ number: 1, title: 'New skill', files: [folder] })]);
    assert.equal(problems.length, 1, folder);
  }
});

test('a backticked Evidence value is flagged because the trailer carries it verbatim', () => {
  const problems = evidenceProblems([withEvidence(compactTask({ number: 1, title: 'Edit wording', files: ['skills/x/SKILL.md'] }), '`benchmarks/results/a.json`')]);
  assert.equal(problems.length, 1);
});
