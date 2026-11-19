import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { PLAN, landingCheckout } from './land-task-fixture.mjs';

const AWS_KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

test('a tracked file gaining a line "++ <key>" is refused although git diff shows it as "+++ <key>"', async () => {
  const { root, planPath } = await landingCheckout();
  await fs.appendFile(path.join(root, 'src/app.js'), `++ ${AWS_KEY}\n`);
  assert.throws(
    () => landTask({ planPath, planText: PLAN, number: 1, root }),
    /src\/app\.js.*AWS access key/
  );
});
