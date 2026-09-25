// Every exo question is plain numbered lines, `1. **Label (Recommended)**: text`
// first, answered with a digit. The model follows the shape through the core
// rule in the route-skills body and the question and next-stage references its
// callers read, so this test guards the text that states it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const USING_EXO = read('skills/route-skills/SKILL.md');
const QUESTION = read('skills/route-skills/references/question.md');
const NEXT_STAGE = read('skills/route-skills/references/next-stage.md');

test('the question reference states one shape with the recommended option first', () => {
  assert.ok(QUESTION.includes('`<n>. **<Label>**: <what it does>`'));
  assert.ok(QUESTION.includes('`1. **<Label> (Recommended)**: <what it does>`'));
  assert.ok(QUESTION.includes('**The recommended option is number 1**'));
  assert.ok(!QUESTION.includes('(<n>)'), 'the parenthesised numbering is gone');
  assert.ok(QUESTION.includes('a structured question tool, a form or a picker is never used'));
  assert.ok(QUESTION.includes('A reply of `1` carries out option 1 at once'));
});

test('the route-skills body keeps the core of the question shape', () => {
  assert.ok(USING_EXO.includes('recommended first, no question tool'));
  assert.ok(USING_EXO.includes('a reply of `1` carries out option 1 at once'));
});

test('the next stage keeps its fixed order and recommends the stop after every stage', () => {
  assert.ok(NEXT_STAGE.includes('After `define-scope`: 1. Stop, 2. Planning.'));
  assert.ok(NEXT_STAGE.includes('After `draft-plan`: 1. Stop, 2. Implementing.'));
  assert.ok(NEXT_STAGE.includes('**Stopping is recommended**'));
  assert.ok(NEXT_STAGE.includes('a clear loses nothing the next stage reads'));
  assert.ok(NEXT_STAGE.includes('**One model line.**'));
  assert.ok(!NEXT_STAGE.includes('names its command, model and effort'));
});

test('design-ui offers its preview as two numbered options, the preview recommended', () => {
  const intake = read('skills/design-ui/references/intake.md');
  const preview = intake.indexOf('1. **Browser preview (Recommended)**:');
  const decided = intake.indexOf('2. **Decide for me**:');
  assert.ok(preview !== -1 && preview < decided, 'the preview is option 1 and deciding for the user option 2');
  assert.ok(intake.includes('Two options in the question shape end the message'));
  assert.ok(intake.includes('a sketch costs about 1,000 extra tokens'), 'the offer keeps its price');
  assert.ok(intake.includes('about 3,500 extra tokens per direction'), 'full comps keep theirs');
});
