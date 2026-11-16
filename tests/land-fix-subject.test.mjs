import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fixLand } from '../skills/build/scripts/land-check.mjs';
import { commitFiles, git, tempDir } from './harness.mjs';

async function repoWith(subjects) {
  const root = await fs.realpath(tempDir('exo-subject-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'user@example.com');
  git(root, 'config', 'user.name', 'Jane Doe');
  for (const [index, subject] of subjects.entries()) await commitFiles(root, { [`f${index}`]: 'x' }, subject);
  await fs.writeFile(path.join(root, 'next'), 'x');
  return root;
}

test('a subject must be conventional only where the log already is', async () => {
  const conventional = await repoWith(['feat: a', 'fix: b', 'docs: c']);
  assert.throws(() => fixLand({ root: conventional, subject: 'Tidy things' }), /Conventional Commits/);
  const free = await repoWith(['Add a', 'Tidy b', 'feat: c']);
  assert.match(fixLand({ root: free, subject: 'Tidy things', body: 'Co-Authored-By: Someone' }), /Committed/);
});
