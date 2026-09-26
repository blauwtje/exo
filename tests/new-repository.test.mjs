// A plan for a folder that is not a git repository yet runs end to end: the
// plan leaves no init step to the owner, and the run initialises a folder that
// holds only the plan's docs. Both rules are skill text the model reads, so
// this test guards the sentences that state them.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../skills/${relative}`, import.meta.url), 'utf8');
const WORKSPACE = read('run-plan/references/workspace.md');
const PLAN_SPEC = read('define-scope/references/task-list.md');

test('the workspace step initialises a folder that holds only the plan docs', () => {
  const outside = WORKSPACE.match(/^1\. \*\*Outside git, never\.\*\* .+$/m);
  assert.ok(outside, 'the outside-git rule exists');
  assert.ok(outside[0].includes('it runs `git init -b main`'));
  assert.ok(outside[0].includes('when it lists anything else, the run stops before any edit'));
  assert.ok(outside[0].includes('sits inside another repository'));
});

test('a plan for a new folder leaves no init step to the owner', () => {
  const basis = PLAN_SPEC.match(/^2\. `## Plan basis`: .+$/m);
  assert.ok(basis, 'the Plan basis rule exists');
  assert.ok(basis[0].includes('the executor runs `git init -b main` there before the first task'));
  assert.ok(basis[0].includes('never an init step for the owner'));
});
