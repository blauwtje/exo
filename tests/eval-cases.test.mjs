import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkEvalCases } from '../verify/checks/eval-cases.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const SMOKE = '---\ntags: [smoke, tune]\nmax_turns: 10\n---\nDo it.\n';
const SKILL_GRADER = '---\ntype: tool_used\ntool: Skill\ninput_match: \'"skill"\'\n---\nLoads.\n';
const LLM_GRADER = '---\ntype: llm\nweight: 1\n---\nJudge.\n';

const GOOD = {
  'evals/a/prompt.md': SMOKE,
  'evals/a/graders/skill.md': SKILL_GRADER,
  'evals/b/prompt.md': '---\ntags: [holdout]\nmax_turns: 10\n---\nDo it.\n',
  'evals/b/case.yaml': 'schema_version: "1.1"\nname: b\ncontext:\n  scaffold_script: scaffold.sh\n',
  'evals/b/scaffold.sh': 'true\n',
  'evals/b/graders/judge.md': LLM_GRADER
};

function outcome(changes = {}) {
  const files = { ...GOOD, ...changes };
  for (const [name, text] of Object.entries(files)) if (text === null) delete files[name];
  return checkOutcome(checkEvalCases, createRepository(tree(files)));
}

test('documented cases pass', () => {
  const result = outcome();
  assert.equal(result.ok, true, result.detail);
});

const BAD = {
  'a case without prompt.md': { 'evals/b/prompt.md': null },
  'a case without a grader': { 'evals/b/graders/judge.md': null },
  'an unknown prompt key': { 'evals/b/prompt.md': '---\nmaxturns: 10\n---\nDo it.\n' },
  'an unknown case.yaml key': { 'evals/b/case.yaml': 'schema_version: "1.1"\nname: b\ngraders: []\n' },
  'a missing scaffold file': { 'evals/b/scaffold.sh': null },
  'an unknown grader type': { 'evals/b/graders/judge.md': '---\ntype: judge\n---\nJudge.\n' },
  'a Skill grader without max 0 or input_match': { 'evals/a/graders/skill.md': '---\ntype: tool_used\ntool: Skill\n---\nLoads.\n' },
  'a smoke case with an llm grader': { 'evals/a/graders/judge.md': LLM_GRADER },
  'a suite without a smoke case': { 'evals/a/prompt.md': '---\ntags: [tune]\nmax_turns: 10\n---\nDo it.\n' },
  'a suite whose only tag is smoke-test': { 'evals/a/prompt.md': '---\ntags: [smoke-test, tune]\nmax_turns: 10\n---\nDo it.\n' },
  'a case with neither tune nor holdout': { 'evals/b/prompt.md': '---\nmax_turns: 10\n---\nDo it.\n' },
  'a case with both tune and holdout': { 'evals/b/prompt.md': '---\ntags: [tune, holdout]\nmax_turns: 10\n---\nDo it.\n' },
  'a case prompt quoted in a skill': {
    'evals/b/prompt.md': '---\ntags: [holdout]\nmax_turns: 10\n---\nShorten the build skill, it is too long.\n',
    'skills/x/SKILL.md': 'Example: Shorten the build skill, it is too long.\n'
  },
  'a case prompt quoted in an agent': {
    'evals/b/prompt.md': '---\ntags: [holdout]\nmax_turns: 10\n---\nShorten the build skill, it is too long.\n',
    'agents/x.md': 'Shorten the build skill, it is too long.\n'
  },
  'a case prompt quoted in a principle': {
    'evals/b/prompt.md': '---\ntags: [holdout]\nmax_turns: 10\n---\nShorten the build skill, it is too long.\n',
    'principles/x.md': 'Shorten the build skill, it is too long.\n'
  }
};

for (const [label, changes] of Object.entries(BAD)) {
  test(`fails ${label}`, () => {
    assert.equal(outcome(changes).ok, false);
  });
}

test('a Skill grader with max 0 passes', () => {
  const grader = '---\ntype: tool_used\ntool: Skill\nmin: 0\nmax: 0\n---\nNo skill.\n';
  assert.equal(outcome({ 'evals/a/graders/skill.md': grader }).ok, true);
});

test('a short prompt that appears in a skill passes', () => {
  assert.equal(outcome({ 'skills/x/SKILL.md': 'Do it.\n' }).ok, true);
});
