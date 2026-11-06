import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { readRuledOut, ruledOutFile, ruledOutText } from '../lib/ruled-out.mjs';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { LandingError } from '../skills/build/scripts/land-errors.mjs';
import { landingCheckout, PLAN } from './land-task-fixture.mjs';

test('a task that fails its proof leaves a ruled-out line the retry reads', async () => {
  const { root, planPath } = await landingCheckout();
  assert.throws(() => landTask({ planPath, planText: PLAN, number: 2, root }), LandingError);
  assert.throws(() => landTask({ planPath, planText: PLAN, number: 2, root }), LandingError);
  const lines = readRuledOut(root, 2);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^- tried .+; failed because .*Task 2/);
  assert.ok(fs.existsSync(ruledOutFile(root, 2)));
  assert.match(ruledOutText(root, 2), /^Ruled out for task 2 \(take none of these again\):\n- tried /);
  assert.equal(ruledOutText(root, 1), '');
});
