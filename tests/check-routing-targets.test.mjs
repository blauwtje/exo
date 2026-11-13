import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { unroutableTargets } from '../verify/checks/routing-targets.mjs';
import { tempDir } from './harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function sample(routing) {
  const root = tempDir('routing-targets-');
  fs.mkdirSync(path.join(root, 'skills/build'), { recursive: true });
  fs.mkdirSync(path.join(root, 'hooks'));
  fs.writeFileSync(path.join(root, 'skills/build/SKILL.md'), '# Build\n\n## Modes\n\nA request for `refactor` opens it.\n\n## Next\n');
  fs.writeFileSync(path.join(root, 'hooks/session-routing.md'), routing);
  fs.writeFileSync(path.join(root, 'hooks/session-rules.md'), '');
  return root;
}

test('a routed build directory and a documented mode pass', () => {
  assert.deepEqual(unroutableTargets(sample('Go to `exo:build refactor`.')), []);
});

test('a routed name that is no directory or mode fails', () => {
  assert.deepEqual(unroutableTargets(sample('Go to `design-ui`.')), ['hooks/session-routing.md: design-ui']);
});

test('a mode named alone fails, as it is no skill', () => {
  assert.deepEqual(unroutableTargets(sample('Go to `refactor`.')), ['hooks/session-routing.md: refactor']);
});

test('the shipped routing text passes', () => {
  assert.deepEqual(unroutableTargets(ROOT), []);
});
