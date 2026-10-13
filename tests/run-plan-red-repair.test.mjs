import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git } from './harness.mjs';
import { runPlan, setup } from './run-plan-fixture.mjs';

test('a no red proof refusal goes straight to one repair session, then stops blocked', async () => {
  const context = await setup();
  const text = await fs.readFile(context.plan, 'utf8');
  await fs.writeFile(context.plan, text.replace('Proof: node --version | Red: none (fixture)', 'Proof: node --version'));
  git(context.root, 'commit', '-q', '-am', 'docs: drop the Red field');
  await fs.appendFile(path.join(context.root, '.git', 'info', 'exclude'), '.exo/\n');
  await fs.mkdir(path.join(context.root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(context.root, '.exo', 'implementer-1.md'), 'Landed: a.txt\nProof:\n- `node --version`: pass\nUnresolved: none\n');
  const result = await runPlan(context, [{ edits: ['a.txt'], result: 'Worked on it.' }, { result: 'Nothing to repair.' }, { result: 'Unused.' }]);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.calls.length, 2, 'one task session and one repair session, no second try');
  assert.match(result.calls[1].stdin, /^Plan repair of task 1 /m);
  assert.match(result.calls[1].stdin, /tighten the Proof first/);
  assert.match(result.calls[1].stdin, /add `Red: none \(<reason>\)`/);
  assert.match(result.stdout, /Task 1 is blocked: .*no red proof/);
});
