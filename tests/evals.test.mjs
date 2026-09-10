// Structural check for the eval fixtures under evals/: every case names a
// verified skill by directory prefix and carries a prompt and one grader in
// the `claude plugin eval` layout. Behavior is judged by that runner, not here.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { EXPECTED_SKILLS } from '../verify/budgets.mjs';

const repositoryRoot = path.dirname(new URL('.', import.meta.url).pathname);
const evalsRoot = path.join(repositoryRoot, 'evals');
const GRADER_TYPES = ['regex', 'tool_used', 'tool_order', 'file_exists', 'llm', 'baseline'];
// Longest name first so `implementing-batch-x` resolves to implementing-batch, not implementing.
const skillsByLength = [...EXPECTED_SKILLS].sort((left, right) => right.length - left.length);

const caseNames = fs.existsSync(evalsRoot)
  ? fs.readdirSync(evalsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

test('evals/ holds at least one case', () => {
  assert.ok(caseNames.length > 0, 'no case directory under evals/');
});

for (const caseName of caseNames) {
  test(`eval case ${caseName} is complete`, () => {
    const skill = skillsByLength.find((name) => caseName === name || caseName.startsWith(`${name}-`));
    assert.ok(skill, `${caseName} does not start with a verified skill name`);

    const prompt = fs.readFileSync(path.join(evalsRoot, caseName, 'prompt.md'), 'utf8');
    assert.match(prompt, /^---\nname: .+\n/, `${caseName}/prompt.md lacks a name frontmatter line`);

    const gradersRoot = path.join(evalsRoot, caseName, 'graders');
    const graderFiles = fs.readdirSync(gradersRoot).filter((file) => file.endsWith('.md'));
    assert.ok(graderFiles.length > 0, `${caseName} has no grader`);
    for (const graderFile of graderFiles) {
      const grader = fs.readFileSync(path.join(gradersRoot, graderFile), 'utf8');
      const typeLine = grader.match(/^---\ntype: (\S+)\n/);
      assert.ok(typeLine && GRADER_TYPES.includes(typeLine[1]), `${caseName}/graders/${graderFile} has no supported type`);
    }
  });
}
