import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

const REPO = path.resolve(import.meta.dirname, '..');

function pending(changelog) {
  const root = tempDir('release-pending-');
  for (const file of ['release-pending.mjs', 'verify/changelog.mjs']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(REPO, file), path.join(root, file));
  }
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), changelog);
  return spawnSync(process.execPath, [path.join(root, 'release-pending.mjs')], { encoding: 'utf8' }).stdout;
}

test('release-pending prints yes when Unreleased holds an entry', () => {
  assert.equal(pending('## Unreleased\n\n### Added\n- a change\n\n## 1.0.0 - 2026-01-01\n'), 'yes\n');
});

test('release-pending prints no when Unreleased is empty', () => {
  assert.equal(pending('## Unreleased\n\n## 1.0.0 - 2026-01-01\n'), 'no\n');
});
