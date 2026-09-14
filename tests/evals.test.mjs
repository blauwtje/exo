// Structural check for the eval fixtures under evals/: every case names a
// shipped skill by directory prefix and carries a prompt and one grader in
// the `claude plugin eval` layout. Behavior is judged by that runner, not here.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const evalsRoot = fileURLToPath(new URL('../evals/', import.meta.url));
const skillsRoot = fileURLToPath(new URL('../skills/', import.meta.url));
const GRADER_TYPES = ['regex', 'tool_used', 'tool_order', 'file_exists', 'llm', 'baseline'];
// Every skill the plugin ships, not only the ones budgets.mjs verifies: a case
// may pin the behavior of a skill whose shape the verifier does not police.
// Longest name first so `implementing-batch-x` resolves to implementing-batch, not implementing.
const skillsByLength = fs.readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
  .map((entry) => entry.name)
  .sort((left, right) => right.length - left.length);

// The runner parses frontmatter as YAML and refuses to load a case whose block
// does not parse, so this parses it the same way instead of matching lines.
function frontmatter(file, label) {
  const delimited = fs.readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  assert.ok(delimited, `${label} has no frontmatter block`);
  const document = parseDocument(delimited[1]);
  const messages = document.errors.map((error) => error.message);
  assert.deepEqual(messages, [], `${label} frontmatter is not valid YAML`);
  const fields = document.toJS();
  assert.ok(fields !== null && typeof fields === 'object' && !Array.isArray(fields), `${label} frontmatter is not a map`);
  return fields;
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
    assert.ok(skill, `${caseName} does not start with a shipped skill name`);

    const promptFile = path.join(evalsRoot, caseName, 'prompt.md');
    assert.ok(fs.existsSync(promptFile), `${caseName} has no prompt.md`);
    const promptFields = frontmatter(promptFile, `${caseName}/prompt.md`);
    assert.ok(
      typeof promptFields.name === 'string' && promptFields.name.length > 0,
      `${caseName}/prompt.md lacks a name frontmatter line`
    );

    const gradersRoot = path.join(evalsRoot, caseName, 'graders');
    assert.ok(fs.existsSync(gradersRoot), `${caseName} has no graders directory`);
    const graderFiles = fs.readdirSync(gradersRoot).filter((file) => file.endsWith('.md'));
    assert.ok(graderFiles.length > 0, `${caseName} has no grader`);
    for (const graderFile of graderFiles) {
      const graderLabel = `${caseName}/graders/${graderFile}`;
      const graderFields = frontmatter(path.join(gradersRoot, graderFile), graderLabel);
      assert.ok(GRADER_TYPES.includes(graderFields.type), `${graderLabel} has no supported type`);
    }
  });
}
