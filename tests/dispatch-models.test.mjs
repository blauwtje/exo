// Every delegate dispatch names its model in the sentence that dispatches it,
// because a dispatch that names no model runs on the session's model: a
// discovery dispatch from an opus session would silently run on opus.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const skillsRoot = fileURLToPath(new URL('../skills/', import.meta.url));
const DISPATCH = '`general-purpose` delegate';
const MODEL_NAMES = ['`sonnet`', '`opus`', "the session's model", 'the model the skill under test runs on'];

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

test('every build goes to the implementer agent, and a design build keeps opus', () => {
  const skill = fs.readFileSync(path.join(skillsRoot, 'implementing', 'SKILL.md'), 'utf8');
  const dispatchStep = skill.match(/^5\. \*\*Dispatch the build\.\*\*.+$/m)[0];
  assert.ok(dispatchStep.includes('Each build goes to the `exo:implementer` agent'));
  const designTasks = fs.readFileSync(path.join(skillsRoot, 'implementing', 'references', 'design-tasks.md'), 'utf8');
  const designRoute = designTasks.match(/^- \*\*It names the chosen direction\.\*\*.+$/m)[0];
  assert.ok(designRoute.includes('`exo:implementer` agent'), 'a design build names the implementer agent');
  assert.ok(designRoute.includes('`opus`'), 'a design build keeps opus');
});
