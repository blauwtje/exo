import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { git, gitRepository, REPOSITORY_ROOT, run } from './harness.mjs';

const SCRIPT = path.join(REPOSITORY_ROOT, 'skills/save/scripts/handoff.mjs');

test('facts keeps the full path of an unstaged-only edit listed first', async () => {
  const root = await gitRepository({ 'lib/value.mjs': 'one\n', 'z.txt': 'z\n' });
  git(root, 'checkout', '-q', '-b', 'feature');
  fs.writeFileSync(path.join(root, 'lib/value.mjs'), 'two\n');
  const out = (await run(SCRIPT, ['facts', '--cwd', root])).stdout;
  assert.match(out, /^Uncommitted: lib\/value\.mjs$/m);
});
