// Every exo question is lettered options, `- **A · Label**: text`, with the
// recommendation on A. The shape lives only in the question reference; the
// route-skills body and each skill point at it, so this test guards the text
// that states it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const USING_EXO = read('skills/route-skills/SKILL.md');
const QUESTION = read('skills/route-skills/references/question.md');
const NEXT_STAGE = read('skills/route-skills/references/next-stage.md');

test('the question reference is the one place that defines the shape, with A recommended', () => {
  assert.ok(QUESTION.includes('`**<nr> · <title>**`'));
  assert.ok(QUESTION.includes('`- **A · Label**: what the user gets`'));
  assert.ok(QUESTION.includes('`→ A. <reason>`'));
  assert.ok(QUESTION.includes('A is always the recommended option'));
  assert.ok(QUESTION.includes('## A round of questions'));
  assert.ok(QUESTION.includes('## A single pick'));
  assert.ok(QUESTION.includes('a question tool, a form or a picker is never used'));
  assert.ok(QUESTION.includes('`a` and `1a` both pick A'));
});

test('the example puts one blank line before and after the options', () => {
  const example = QUESTION.match(/```text\n([\s\S]*?)```/)[1];
  assert.ok(/\n\n- \*\*A · [^\n]*\n(- \*\*[B-C] · [^\n]*\n)*\n→ A\. /.test(example));
  assert.ok(!example.includes('\n\n\n'));
});

test('no file keeps a second copy of the shape', () => {
  assert.ok(!fs.existsSync(new URL('../skills/spec/references/question-shape.md', import.meta.url)));
});

test('the route-skills body points at the question reference', () => {
  assert.ok(USING_EXO.includes('read `references/question.md` first'));
});

test('the next stage recommends continuing, and a context notice leaves the order alone', () => {
  assert.ok(NEXT_STAGE.includes('After `spec`: A Adjust the brief, B Build here.'));
  assert.ok(NEXT_STAGE.includes('**A is the recommended option**'));
  assert.ok(NEXT_STAGE.includes('**A context notice changes nothing here.**'));
  assert.ok(!NEXT_STAGE.includes('stopping is recommended'), 'a context notice no longer moves Stop first');
  assert.ok(!NEXT_STAGE.includes('stopping leads after every stage'), 'Stop no longer leads unconditionally');
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
