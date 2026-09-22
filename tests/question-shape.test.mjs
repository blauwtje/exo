// Every exo question is plain numbered lines, `1. **Label (Recommended)**: text`
// first, answered with a digit. The model follows the shape by reading
// using-exo, so this test guards the text that states it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const USING_EXO = fs.readFileSync(new URL('../skills/using-exo/SKILL.md', import.meta.url), 'utf8');

function section(heading) {
  const start = USING_EXO.indexOf(`\n${heading}\n`);
  assert.ok(start !== -1, `${heading} exists`);
  const next = USING_EXO.indexOf('\n## ', start + heading.length + 2);
  return USING_EXO.slice(start, next === -1 ? undefined : next);
}

test('using-exo states one question shape with the recommended option first', () => {
  const shape = section('## A question');
  assert.ok(shape.includes('`<n>. **<Label>**: <what it does>`'));
  assert.ok(shape.includes('`1. **<Label> (Recommended)**: <what it does>`'));
  assert.ok(shape.includes('**The recommended option is number 1**'));
  assert.ok(!shape.includes('(<n>)'), 'the parenthesised numbering is gone');
  assert.ok(shape.includes('a structured question tool, a form or a picker is never used'));
  assert.ok(shape.includes('A reply of `1` carries out option 1 at once'));
});

test('the next stage keeps its fixed order and moves a recommended stop to number 1', () => {
  const nextStage = section('## The next stage');
  assert.ok(nextStage.includes('After `shaping`: 1. Planning, 2. Stop.'));
  assert.ok(nextStage.includes('After `planning`: 1. Implementing, 2. Stop.'));
  assert.ok(nextStage.includes('it moves to number 1 with `(Recommended)`'));
  assert.ok(nextStage.includes('**One model line.**'));
  assert.ok(!nextStage.includes('names its command, model and effort'));
});

test('designing offers its preview as two numbered options, the preview recommended', () => {
  const intake = fs.readFileSync(new URL('../skills/designing/references/intake.md', import.meta.url), 'utf8');
  const preview = intake.indexOf('1. **Browser preview (Recommended)**:');
  const decided = intake.indexOf('2. **Decide for me**:');
  assert.ok(preview !== -1 && preview < decided, 'the preview is option 1 and deciding for the user option 2');
  assert.ok(intake.includes('Two options in the shape `## A question` in `using-exo` gives end the message'));
  assert.ok(intake.includes('a sketch costs about 1,000 extra tokens'), 'the offer keeps its price');
  assert.ok(intake.includes('about 3,500 extra tokens per direction'), 'full comps keep theirs');
});
