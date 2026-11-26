import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { PLAN } from './land-task-fixture.mjs';

test('a --root outside any git repository is refused naming --root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-no-git-'));
  try {
    assert.throws(
      () => landTask({ planPath: path.join(root, 'plan.md'), planText: PLAN, number: 4, root }),
      (error) => /--root/.test(error.message) && !/ENOENT|\/null/.test(error.message),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
