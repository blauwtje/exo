import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

const SCRIPT = path.resolve(import.meta.dirname, '../skills/edit-skills/scripts/rename-skill.mjs');

function write(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

function rename(root, from, to) {
  return spawnSync(process.execPath, [SCRIPT, '--from', from, '--to', to, '--root', root], { encoding: 'utf8' });
}

test('rename-skill moves the folder, rewrites mentions and leaves the CHANGELOG', () => {
  const root = tempDir('rename-skill-');
  write(root, 'skills/old/SKILL.md', 'name: old\n');
  write(root, 'README.md', 'use old here, not older\n');
  write(root, 'CHANGELOG.md', 'old stays\n');
  const ran = rename(root, 'old', 'fresh');
  assert.equal(ran.status, 0);
  assert.equal(ran.stdout, 'README.md 1\nskills/fresh/SKILL.md 1\n');
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), 'use fresh here, not older\n');
  assert.equal(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), 'old stays\n');
});

test('rename-skill refuses a missing skill folder', () => {
  const ran = rename(tempDir('rename-skill-'), 'old', 'fresh');
  assert.equal(ran.status, 1);
  assert.match(ran.stderr, /no skill folder at 'skills\/old'/);
});

test('rename-skill refuses a name that is not kebab-case', () => {
  const ran = rename(tempDir('rename-skill-'), 'Old', 'fresh');
  assert.equal(ran.status, 2);
  assert.match(ran.stderr, /kebab-case/);
});
