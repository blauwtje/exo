// Every delegate dispatch names its model in the sentence that dispatches it,
// because an omitted model inherits the session's: a discovery dispatch from an
// opus session would silently run on opus.

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
