import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const CALLERS = ['skills/build/scripts/land-gate.mjs', 'skills/build/scripts/fast-check.mjs', 'skills/build/scripts/land-proof.mjs'];

test('every check caller runs its command through runCheck', () => {
  for (const path of CALLERS) {
    const source = read(path);
    assert.match(source, /runCheck(Async)?\(/, path);
    assert.doesNotMatch(source, /runTreeSync|runCommand\(/, path);
  }
});

test('the build-task and fixer prompts name the run-check command line', () => {
  assert.match(read('skills/build/scripts/run-prompts.mjs'), /node \$\{RUN_CHECK\}/);
  assert.match(read('skills/build/review-fixer-prompt.md'), /lib\/run-check\.mjs/);
});
