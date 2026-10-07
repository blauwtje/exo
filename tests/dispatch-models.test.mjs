// Every delegate dispatch names its model in the sentence that dispatches it,
// because a dispatch that names no model runs on the session's model: a
// discovery dispatch from an opus session would silently run on opus.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { readKindTable } from '#model-kinds';
import { REVIEWER_AGENTS } from '../skills/verify/scripts/pick-reviewer.mjs';
import { fileURLToPath } from 'node:url';

const skillsRoot = fileURLToPath(new URL('../skills/', import.meta.url));
const DISPATCH = '`general-purpose` delegate';
const kindModels = new Set(Object.values(readKindTable().kinds).map((kind) => `\`${kind.model}\``));
const MODEL_NAMES = [...kindModels, "the session's model", 'the model the skill under test runs on'];

function sentencesNamingDispatch(text) {
  return text
    .split(/\n|(?<=\.)\s+(?=[A-Z0-9`*])/)
    .filter((sentence) => sentence.includes(DISPATCH));
}

test('every general-purpose delegate dispatch names its model', () => {
  const markdownPaths = fs.readdirSync(skillsRoot, { recursive: true })
    .filter((relativePath) => relativePath.endsWith('.md'));
  const unnamed = [];
  for (const relativePath of markdownPaths) {
    const text = fs.readFileSync(path.join(skillsRoot, relativePath), 'utf8');
    for (const sentence of sentencesNamingDispatch(text)) {
      if (!MODEL_NAMES.some((modelName) => sentence.includes(modelName))) {
        unnamed.push(`${relativePath}: ${sentence.slice(0, 120)}`);
      }
    }
  }
  assert.deepEqual(unnamed, []);
});

test('every review dispatch names the agents the printed reviewer picks and no model override', () => {
  for (const relativePath of ['verify/SKILL.md']) {
    const text = fs.readFileSync(path.join(skillsRoot, relativePath), 'utf8');
    const dispatch = text.match(/^.*`exo:review-branch` agent.*$/m)?.[0];
    assert.ok(dispatch, `${relativePath} does not dispatch \`exo:review-branch\``);
    for (const name of Object.values(REVIEWER_AGENTS)) {
      assert.ok(dispatch.includes(`\`exo:${name}\``), `${relativePath} does not name exo:${name}`);
    }
    assert.match(dispatch, /no model override/, `${relativePath} does not rule out a model override`);
  }
});

test('every build goes to the implementer agent, and a design build with a named direction goes to one design-ui delegate', () => {
  const unit = fs.readFileSync(path.join(skillsRoot, '..', 'agents', 'run-unit.md'), 'utf8');
  const dispatchStep = unit.match(/^3\. \*\*Dispatch the build\.\*\*.+$/m)[0];
  assert.ok(dispatchStep.includes('Each build goes to the `exo:build-task` agent'));
  const designTasks = fs.readFileSync(path.join(skillsRoot, 'build', 'references', 'design-tasks.md'), 'utf8');
  const designRoute = designTasks.match(/^- \*\*`direction named`\.\*\*.+$/m)[0];
  assert.ok(!designRoute.includes('`exo:build-task` agent'), 'a design build with a named direction does not go to the implementer agent');
  assert.ok(designRoute.includes('Dispatch one `general-purpose` delegate'), 'a design build with a named direction goes to one delegate');
  assert.ok(designTasks.includes('Load `design-ui` and enter it at Route rung 2.'), 'the delegate enters design-ui at rung 2');
});
