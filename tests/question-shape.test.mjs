// Every exo question is plain numbered lines, `(1) Label (Recommended): clause`,
// answered with a digit. The model follows the shape by reading using-exo, so
// this test guards the text that states it.

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

test('using-exo states one question shape with a marked recommended option', () => {
  const shape = section('## A question');
  assert.ok(shape.includes('`(<n>) <Label> (Recommended): <what it does>`'));
  assert.ok(shape.includes('a structured question tool, a form or a picker is never used'));
  assert.ok(shape.includes('A reply of `1` carries out option 1 at once'));
});

test('the next stage keeps its fixed order and moves the model off the option line', () => {
  const nextStage = section('## The next stage');
  assert.ok(nextStage.includes('After `shaping`: (1) Planning, (2) Stop.'));
  assert.ok(nextStage.includes('After `planning`: (1) Implementing, (2) Implementing batch, (3) Stop.'));
  assert.ok(nextStage.includes('**One model line.**'));
  assert.ok(!nextStage.includes('names its command, model and effort'));
});
