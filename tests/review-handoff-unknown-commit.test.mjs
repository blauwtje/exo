import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { commitFiles, git, gitRepository, REPOSITORY_ROOT, run } from './harness.mjs';

const SCRIPT = path.join(REPOSITORY_ROOT, 'skills/save/scripts/handoff.mjs');

test('stale does not report zero commits when the written hash no longer resolves', async () => {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  git(root, 'checkout', '-q', '-b', 'feature');
  const printed = (await run(SCRIPT, ['path', '--cwd', root])).stdout.trim();
  fs.mkdirSync(path.dirname(printed), { recursive: true });
  fs.writeFileSync(printed, 'Written: 2026-01-01, last commit deadbee, branch feature\n');
  await commitFiles(root, { 'b.txt': 'b\n' }, 'feat: add b');
  const out = (await run(SCRIPT, ['stale', '--cwd', root])).stdout;
  assert.doesNotMatch(out, /^Commits since: 0$/m);
  assert.match(out, /unknown/i);
});
