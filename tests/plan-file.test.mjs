import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { newestPlan } from '../skills/build/scripts/plan-file.mjs';
import { tempDir } from './harness.mjs';

function write(root, location, mtime) {
  const [folder, name] = location.split('/');
  const dir = path.join(root, 'docs', folder);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, '# plan\n');
  fs.utimesSync(file, mtime, mtime);
  return file;
}

test('newestPlan returns null without a docs folder', () => {
  assert.equal(newestPlan(tempDir('plan-file-')), null);
});

test('newestPlan reads docs/plans alone and skips decisions files', () => {
  const root = tempDir('plan-file-');
  const plan = write(root, 'plans/a.md', 1000);
  write(root, 'plans/a-decisions.md', 2000);
  assert.equal(newestPlan(root), plan);
});

test('newestPlan picks the newest across specs and plans', () => {
  const root = tempDir('plan-file-');
  write(root, 'plans/old.md', 1000);
  const fresh = write(root, 'specs/new.md', 2000);
  assert.equal(newestPlan(root), fresh);
});
