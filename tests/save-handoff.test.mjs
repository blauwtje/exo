import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { commitFiles, git, gitRepository, REPOSITORY_ROOT, run } from './harness.mjs';

const SCRIPT = path.join(REPOSITORY_ROOT, 'skills/save/scripts/handoff.mjs');

async function handoffRepository() {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  git(root, 'checkout', '-q', '-b', 'feature');
  const printed = (await run(SCRIPT, ['path', '--cwd', root])).stdout.trim();
  const short = git(root, 'rev-parse', '--short', 'HEAD').trim();
  fs.mkdirSync(path.dirname(printed), { recursive: true });
  fs.writeFileSync(printed, `Written: 2026-01-01, last commit ${short}, branch feature\nSee \`a.txt\` and \`gone/file.md\`.\n`);
  return { root, short };
}

test('path prints one line', async () => {
  const { root } = await handoffRepository();
  const result = await run(SCRIPT, ['path', '--cwd', root]);
  assert.equal(result.stdout.trim().split('\n').length, 1);
});

test('facts prints the head short hash and the path lists', async () => {
  const { root, short } = await handoffRepository();
  await commitFiles(root, { 'b.txt': 'b\n' }, 'feat: add b');
  fs.writeFileSync(path.join(root, 'c.txt'), 'c\n');
  const head = git(root, 'rev-parse', '--short', 'HEAD').trim();
  const out = (await run(SCRIPT, ['facts', '--cwd', root])).stdout;
  assert.match(out, new RegExp(`^Written: \\d{4}-\\d{2}-\\d{2}, last commit ${head}, branch feature$`, 'm'));
  assert.match(out, /^Committed: b\.txt$/m);
  assert.match(out, /^Uncommitted: c\.txt$/m);
  assert.notEqual(head, short);
});

test('stale prints the later commit, the changed path and the missing path', async () => {
  const { root } = await handoffRepository();
  await commitFiles(root, { 'b.txt': 'b\n' }, 'feat: add b');
  const out = (await run(SCRIPT, ['stale', '--cwd', root])).stdout;
  assert.match(out, /^Commits since: 1$/m);
  assert.match(out, /feat: add b/);
  assert.match(out, /^Changed since: b\.txt$/m);
  assert.match(out, /^Missing: gone\/file\.md$/m);
  assert.doesNotMatch(out, /Missing: a\.txt/);
});

test('stale without a handoff exits 1 with one stderr line', async () => {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  const result = await run(SCRIPT, ['stale', '--cwd', root]);
  assert.equal(result.code, 1);
  assert.equal(result.stderr.trim().split('\n').length, 1);
});
