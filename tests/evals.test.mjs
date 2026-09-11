// Structural check for the eval fixtures under evals/: every case names a
// verified skill by directory prefix and carries a prompt and one grader in
// the `claude plugin eval` layout. Behavior is judged by that runner, not here.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { EXPECTED_SKILLS } from '../verify/budgets.mjs';

const evalsRoot = fileURLToPath(new URL('../evals/', import.meta.url));
const GRADER_TYPES = ['regex', 'tool_used', 'tool_order', 'file_exists', 'llm', 'baseline'];
// Longest name first so `implementing-batch-x` resolves to implementing-batch, not implementing.
const skillsByLength = [...EXPECTED_SKILLS].sort((left, right) => right.length - left.length);

// The runner reads frontmatter as a map, so a key may sit anywhere in the block.
function frontmatterBlock(text) {
  const delimited = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  return delimited === null ? null : delimited[1];
}

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

    const promptFile = path.join(evalsRoot, caseName, 'prompt.md');
    assert.ok(fs.existsSync(promptFile), `${caseName} has no prompt.md`);
    const promptFrontmatter = frontmatterBlock(fs.readFileSync(promptFile, 'utf8'));
    assert.ok(
      promptFrontmatter !== null && /^name: .+$/m.test(promptFrontmatter),
      `${caseName}/prompt.md lacks a name frontmatter line`
    );

    const gradersRoot = path.join(evalsRoot, caseName, 'graders');
    assert.ok(fs.existsSync(gradersRoot), `${caseName} has no graders directory`);
    const graderFiles = fs.readdirSync(gradersRoot).filter((file) => file.endsWith('.md'));
    assert.ok(graderFiles.length > 0, `${caseName} has no grader`);
    for (const graderFile of graderFiles) {
      const graderFrontmatter = frontmatterBlock(fs.readFileSync(path.join(gradersRoot, graderFile), 'utf8'));
      const typeLine = graderFrontmatter === null ? null : graderFrontmatter.match(/^type: (\S+)$/m);
      assert.ok(typeLine !== null && GRADER_TYPES.includes(typeLine[1]), `${caseName}/graders/${graderFile} has no supported type`);
    }
  });
}
