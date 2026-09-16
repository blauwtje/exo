// Structural check for the eval fixtures under evals/: every case names a
// shipped skill by directory prefix and carries a prompt and one grader in
// the `claude plugin eval` layout. Behavior is judged by that runner, not here.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { OVERUSED_FONTS } from '../skills/designing/scripts/overused-fonts.mjs';

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

// `claude plugin eval` writes each run's report under evals/results/ unless
// --output-dir says otherwise; that directory holds output, never a case.
const RUNNER_OUTPUT_DIRECTORY = 'results';

const caseNames = fs.existsSync(evalsRoot)
  ? fs.readdirSync(evalsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== RUNNER_OUTPUT_DIRECTORY)
      .map((entry) => entry.name)
      .sort()
  : [];

test('evals/ holds at least one case', () => {
  assert.ok(caseNames.length > 0, 'no case directory under evals/');
});

// A grader is frontmatter and cannot import the banned list, so this one spells
// every family into its pattern; a copy left behind grades a run against faces
// the plugin no longer bans.
test('the face grader of designing-distinct-direction lists every banned family', () => {
  const label = 'designing-distinct-direction/graders/avoids-default-faces.md';
  const grader = path.join(evalsRoot, 'designing-distinct-direction', 'graders', 'avoids-default-faces.md');
  const { pattern } = frontmatter(grader, label);
  for (const family of OVERUSED_FONTS) {
    const listed = pattern.includes(`(${family}|`) || pattern.includes(`|${family}|`);
    assert.ok(listed, `${label} does not list ${family}`);
  }
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
