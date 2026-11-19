import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { PLAN, landingCheckout } from './land-task-fixture.mjs';

test('an untracked dangling symlink does not crash landing with a raw ENOENT', async () => {
  const { root, planPath } = await landingCheckout();
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hi";\n}\n');
  await fs.symlink(path.join(root, 'src/missing-target'), path.join(root, 'src/note.md'));
  try {
    landTask({ planPath, planText: PLAN, number: 4, root });
  } catch (error) {
    assert.notEqual(error.code, 'ENOENT', error.message);
  }
});
