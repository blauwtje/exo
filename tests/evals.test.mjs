// Structural check for the eval fixtures under evals/: every case names a
// shipped skill by directory prefix and carries a prompt and one grader in
// the `claude plugin eval` layout, one of them free, and no llm criterion asks
// a judge where text sits. Behavior is judged by that runner, not here.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { OVERUSED_FONTS } from '../skills/designing/scripts/overused-fonts.mjs';

const evalsRoot = fileURLToPath(new URL('../evals/', import.meta.url));
const skillsRoot = fileURLToPath(new URL('../skills/', import.meta.url));
// Computed from the transcript: no judge call, and the same verdict on the same output.
const FREE_GRADER_TYPES = ['regex', 'tool_used', 'tool_order', 'file_exists'];
const GRADER_TYPES = [...FREE_GRADER_TYPES, 'llm', 'baseline'];
// Wording for where text sits or how it is laid out. The runner's judge answers
// one word and has read the same layout both ways, so layout is a regex grader's.
const STRUCTURAL_WORDING = /\b(?:opens? with|ends? (?:on|with)|on (?:its|their) own lines?|numbered)\b/i;
// Cases and llm graders older than the two rules above. Both lists only shrink:
// an entry leaves when its case gains a free grader or its criterion drops the
// wording, and no name is added.
const CASES_WITHOUT_A_FREE_GRADER = [
  'debug-fourth-patch',
  'implementing-asks-the-workspace',
  'implementing-batch-asks-the-workspace',
  'implementing-batch-finishes-on-the-question',
  'implementing-batch-two-file-floor',
  'implementing-runs-the-list',
  'implementing-workspace-follows-the-repository',
  'planning-reads-a-shaped-issue',
  'savings-relays-fenced',
  'savings-report-reads-cold',
  'shaping-clear-goal-needs-no-brief',
  'shaping-ends-on-the-stage-screen',
  'shaping-falls-back-to-the-file',
  'shaping-stores-in-issues',
  'using-exo-existing-helper',
  'using-exo-keeps-guard',
  'using-exo-names-the-rival-reading',
  'using-exo-native-input',
  'using-exo-replies-in-the-users-language'
];
const GRADERS_WITH_STRUCTURAL_WORDING = [
  'implementing-asks-the-workspace/graders/asks-before-building.md',
  'implementing-batch-asks-the-workspace/graders/asks-before-editing.md',
  'implementing-batch-finishes-on-the-question/graders/overview-then-options.md',
  'implementing-batch-two-file-floor/graders/edits-without-the-loop.md',
  'implementing-workspace-follows-the-repository/graders/recommends-the-current-branch.md',
  'shaping-ends-on-the-stage-screen/graders/ends-on-the-stage-screen.md',
  'shaping-falls-back-to-the-file/graders/writes-the-file.md',
  'shaping-stores-in-issues/graders/creates-the-issue.md',
  'using-exo-names-the-rival-reading/graders/names-the-rival-reading.md'
];
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
  // The runner ends the block at the first `---` it meets, inside a quoted value too, and then fails to load the case.
  assert.ok(!delimited[1].includes('---'), `${label} holds --- inside its frontmatter: write it as -{3} in a pattern`);
  const document = parseDocument(delimited[1]);
  const messages = document.errors.map((error) => error.message);
  assert.deepEqual(messages, [], `${label} frontmatter is not valid YAML`);
  const fields = document.toJS();
  assert.ok(fields !== null && typeof fields === 'object' && !Array.isArray(fields), `${label} frontmatter is not a map`);
  return fields;
}

// The judge reads `criteria:` when the frontmatter has one, and the body below it otherwise.
function judgedText(file, fields) {
  if (typeof fields.criteria === 'string') return fields.criteria;
  return fs.readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '');
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
    const graderTypes = [];
    for (const graderFile of graderFiles) {
      const graderLabel = `${caseName}/graders/${graderFile}`;
      const graderPath = path.join(gradersRoot, graderFile);
      const graderFields = frontmatter(graderPath, graderLabel);
      assert.ok(GRADER_TYPES.includes(graderFields.type), `${graderLabel} has no supported type`);
      graderTypes.push(graderFields.type);
      if (graderFields.type !== 'llm') continue;
      const wording = judgedText(graderPath, graderFields).match(STRUCTURAL_WORDING);
      const listed = GRADERS_WITH_STRUCTURAL_WORDING.includes(graderLabel);
      assert.ok(wording === null || listed, `${graderLabel} asks a judge about layout ("${wording?.[0]}"): check that with a regex grader and keep the criterion to what needs judgment`);
      assert.ok(wording !== null || !listed, `${graderLabel} no longer words layout: remove it from GRADERS_WITH_STRUCTURAL_WORDING`);
    }

    const hasFreeGrader = graderTypes.some((type) => FREE_GRADER_TYPES.includes(type));
    const listedWithout = CASES_WITHOUT_A_FREE_GRADER.includes(caseName);
    assert.ok(hasFreeGrader || listedWithout, `${caseName} has no free grader: add a ${FREE_GRADER_TYPES.join(', ')} grader for what the transcript decides without a judge`);
    assert.ok(!hasFreeGrader || !listedWithout, `${caseName} has a free grader now: remove it from CASES_WITHOUT_A_FREE_GRADER`);
  });
}

test('the two shrinking lists name only what exists under evals/', () => {
  for (const caseName of CASES_WITHOUT_A_FREE_GRADER) {
    assert.ok(caseNames.includes(caseName), `CASES_WITHOUT_A_FREE_GRADER names ${caseName}, which is not a case`);
  }
  for (const graderLabel of GRADERS_WITH_STRUCTURAL_WORDING) {
    assert.ok(fs.existsSync(path.join(evalsRoot, graderLabel)), `GRADERS_WITH_STRUCTURAL_WORDING names ${graderLabel}, which does not exist`);
  }
});
