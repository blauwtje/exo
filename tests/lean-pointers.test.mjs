// A delegate never sees the session hook that injects route-skills, so each
// delegate prompt and agent that writes code points to references/lean.md or
// carries a line of it word for word. The retired ladder.md stays unnamed
// outside the changelog and the recorded benchmark results.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LEAN_PATH = 'skills/route-skills/references/lean.md';
const DELEGATES = [
  'agents/build-task.md',
  'agents/build-ui.md',
  'skills/build/bug-fixer-prompt.md',
  'skills/build/review-fixer-prompt.md',
  'skills/find-cause/fixer-prompt.md',
];

function leanLines() {
  const source = fs.readFileSync(new URL(`../${LEAN_PATH}`, import.meta.url), 'utf8');
  return [...source.matchAll(/^- (.+)$/gm)].map((match) => match[1]);
}

test(`${LEAN_PATH} holds rule lines to carry`, () => {
  assert.ok(leanLines().length > 0);
});

for (const delegatePath of DELEGATES) {
  test(`${delegatePath} points to or carries ${LEAN_PATH}`, () => {
    const text = fs.readFileSync(new URL(`../${delegatePath}`, import.meta.url), 'utf8');
    const points = text.includes(LEAN_PATH);
    const carries = leanLines().some((line) => text.includes(line));
    assert.ok(points || carries, `${delegatePath} neither names ${LEAN_PATH} nor carries one of its lines`);
  });
}

test('no source file outside the changelog and benchmark results names ladder.md', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0');
  const self = 'tests/lean-pointers.test.mjs';
  const naming = tracked.filter((file) => file !== ''
    && file !== 'CHANGELOG.md'
    && file !== self
    && !file.startsWith('benchmarks/results/')
    && fs.existsSync(new URL(`../${file}`, import.meta.url))
    && fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').includes('ladder.md'));
  assert.deepEqual(naming, []);
});
