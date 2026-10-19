import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkProcessStructure } from '../verify/checks/process-structure.mjs';

const TAIL = '\n\n## Judgment\n\nKeep it.\n';
const ENEMY = 'Do the thing well. The enemy is the default. The overcorrection is a costume.';
const DIRECTION = 'Do the thing well. Produce a lit ground and every state. Avoid stock type and a costume.';

function run(opening) {
  const body = `---\nname: x\n---\n\n# X\n\n${opening}${TAIL}`;
  const repository = {
    processFiles: () => ['/r/skills/x/SKILL.md'],
    relative: () => 'skills/x/SKILL.md',
    text: () => body
  };
  let result;
  checkProcessStructure({ assert: (ok, name, pass, fail) => { result = { ok, fail }; } }, repository);
  return result;
}

test('enemy and overcorrection opening passes', () => {
  assert.equal(run(ENEMY).ok, true);
});

test('produce and avoid opening passes', () => {
  assert.equal(run(DIRECTION).ok, true);
});

test('opening with neither shape fails', () => {
  const result = run('Do the thing well. Make it nice.');
  assert.equal(result.ok, false);
  assert.match(String(result.fail), /opening contract failed/);
});

test('avoid without a produce sentence fails', () => {
  assert.equal(run('Do the thing well. Avoid stock type.').ok, false);
});
