import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { leanPrincipleProblems } from '../verify/checks/reference-shape.mjs';

const OWNER = 'lib/references/lean.md';

function repository(overrides = {}) {
  return { text: (file) => overrides[file] ?? fs.readFileSync(file, 'utf8') };
}

test('the repository states every principle and every reader names the owner', () => {
  assert.deepEqual(leanPrincipleProblems(repository()), []);
});

test('a missing marker phrase fails', () => {
  const stripped = fs.readFileSync(OWNER, 'utf8').replace('pass-or-fail check', 'check');
  const problems = leanPrincipleProblems(repository({ [OWNER]: stripped }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /pass-or-fail check/);
});

test('a reader that no longer names the owner fails', () => {
  const file = 'agents/review-branch.md';
  const stripped = fs.readFileSync(file, 'utf8').replaceAll(OWNER, 'elsewhere');
  const problems = leanPrincipleProblems(repository({ [file]: stripped }));
  assert.deepEqual(problems, [`${file} does not name ${OWNER}`]);
});
