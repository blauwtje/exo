import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (file) => fs.readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');

test('spec names the fast route', () => {
  const spec = read('skills/spec/SKILL.md');
  assert.match(spec, /Fast route: under three files with a known proof, skip questions, plan and gate/);
  assert.match(spec, /one worktree worker/);
});

test('build points the fast route at No spec', () => {
  const build = read('skills/build/SKILL.md');
  assert.match(build, /## No spec\n\n[^\n]*fast route/);
});
