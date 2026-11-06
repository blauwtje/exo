import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkStepReferences } from '../verify/checks/step-references.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const SKILL = '# Loop\n\n1. **Reproduce.**\n2. **Isolate.**\n3. **Fix.**\n4. **Retain.**\n';

function run(promptText) {
  const root = tempDir('step-references-');
  const folder = path.join(root, 'skills', 'find-cause');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'SKILL.md'), SKILL);
  fs.writeFileSync(path.join(folder, 'fixer-prompt.md'), promptText);
  const results = [];
  checkStepReferences({ assert: (ok, name, pass, fail) => results.push({ ok, detail: ok ? pass : fail }) }, createRepository(root));
  return results[0];
}

const load = 'Load the `exo:find-cause` skill and run only';

test('references that exist and avoid the forbidden list pass', () => {
  const result = run(`---\nforbidden-steps: 4\n---\n${load} Steps 2 to 3 and Step 1.\n`);
  assert.equal(result.ok, true);
});

test('a step the loaded skill lacks fails', () => {
  const result = run(`${load} Step 9.\n`);
  assert.equal(result.ok, false);
  assert.match(result.detail, /fixer-prompt\.md: 'Step 9' names step 9 that exo:find-cause lacks/);
});

test('a range end the loaded skill lacks fails', () => {
  const result = run(`${load} Steps 2-6.\n`);
  assert.equal(result.ok, false);
  assert.match(result.detail, /names step 5, 6 that exo:find-cause lacks/);
});

test('a step in the forbidden-steps front matter fails, inside a range too', () => {
  const result = run(`---\nforbidden-steps: 4\n---\n${load} Steps 2 to 4.\n`);
  assert.equal(result.ok, false);
  assert.match(result.detail, /'Steps 2 to 4' names forbidden step 4/);
});
