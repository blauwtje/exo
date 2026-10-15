import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git } from './harness.mjs';
import { runPlan, setup, SPAWN_ONCE } from './run-plan-fixture.mjs';

test('a task that hits its turn cap saves its partial work and stops blocked, with no repair session', async () => {
  const context = await setup();
  await fs.appendFile(path.join(context.root, '.git', 'info', 'exclude'), '.exo/\n');
  const result = await runPlan(context, [{ edits: ['README.md'], subtype: 'error_max_turns', result: 'Ran out of turns.' }, { result: 'Unused.' }], SPAWN_ONCE);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.calls.length, 1, 'no repair session');
  assert.match(result.stdout, /Task 1 is blocked: hit --max-turns \d+/);
  const patch = await fs.readFile(path.join(context.root, '.exo', 'carry', 'task1-partial.patch'), 'utf8');
  assert.match(patch, /README\.md/);
  assert.equal(git(context.root, 'status', '--porcelain', '--untracked-files=no').trim(), '', 'the run tree is reset');
});

test('a plan session that hits its turn cap saves its partial work and stops blocked, with no repair session', async () => {
  const context = await setup();
  await fs.appendFile(path.join(context.root, '.git', 'info', 'exclude'), '.exo/\n');
  const result = await runPlan(context, [{ edits: ['a.txt'], subtype: 'error_max_turns', result: 'Ran out of turns.' }, { result: 'Unused.' }], ['--session', 'plan']);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.calls.length, 1, 'no repair session');
  assert.match(result.stdout, /Task 1 is blocked: hit --max-turns \d+/);
  const patch = await fs.readFile(path.join(context.root, '.exo', 'carry', 'task1-partial.patch'), 'utf8');
  assert.match(patch, /a\.txt/);
  assert.equal(git(context.root, 'status', '--porcelain', '--untracked-files=no').trim(), '', 'the run tree is reset');
});
