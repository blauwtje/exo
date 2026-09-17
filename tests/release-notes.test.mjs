// release-notes.mjs renders one version's changelog section as a GitHub Release
// body: highlights first, the change sections under release headings, the pull
// requests since the previous tag, the upgrade commands and a compare link.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));

async function scratchCopy(changelog) {
  const directory = await fixture();
  for (const relative of ['release-notes.mjs', 'verify/changelog.mjs', 'package.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json']) {
    const target = path.join(directory, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(REPOSITORY, relative), target);
  }
  await fs.writeFile(path.join(directory, 'CHANGELOG.md'), changelog);
  return directory;
}

function git(directory, args) {
  const identity = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'tag.gpgSign=false', '-c', 'commit.gpgSign=false'];
  execFileSync('git', [...identity, ...args], { cwd: directory, stdio: 'ignore' });
}

function commit(directory, subject) {
  git(directory, ['commit', '--allow-empty', '--quiet', '-m', subject]);
}

async function releasedCopy(changelog, pullRequestSubject) {
  const directory = await scratchCopy(changelog);
  git(directory, ['init', '--quiet']);
  commit(directory, 'chore(release): 9.9.8');
  git(directory, ['tag', 'v9.9.8']);
  commit(directory, pullRequestSubject);
  commit(directory, 'fix: a direct commit');
  git(directory, ['tag', 'v9.9.9']);
  return directory;
}

const CHANGELOG = [
  '# Changelog', '', '## Unreleased', '',
  '## 9.9.9 - 2026-09-20', '',
  '### Fixed', '', '- a fix', '',
  '### Highlights', '', '- **Settings.** One place for them.', '',
  '### Added', '', '- a skill', '',
  '## 9.9.8 - 2026-09-19', '', '### Fixed', '', '- older', ''
].join('\n');

test('orders highlights, the change sections, pull requests, the upgrade commands and the compare link', async () => {
  const directory = await releasedCopy(CHANGELOG, 'feat: a merged change (#7)');
  const result = await run(path.join(directory, 'release-notes.mjs'), ['9.9.9'], { cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  const notes = result.stdout;
  const positions = ['## Highlights', '## New', '## Fixed', '## Pull requests', '## Upgrade', 'Every commit since v9.9.8'].map((heading) => notes.indexOf(heading));
  assert.ok(positions.every((position) => position !== -1), notes);
  assert.deepEqual([...positions].sort((left, right) => left - right), positions, notes);
  assert.ok(notes.includes('claude plugin marketplace update blauwtje'), notes);
  assert.ok(notes.includes('claude plugin update exo@blauwtje'), notes);
  assert.ok(!notes.includes('older'), 'another version leaks into the notes');
  assert.ok(notes.includes('- #7 a merged change'), notes);
  assert.ok(!notes.includes('a direct commit'), 'a commit without a pull request is listed');
  assert.ok(notes.includes('https://github.com/blauwtje/exo/compare/v9.9.8...v9.9.9'), notes);
});

test('a release without pull requests says every change went straight to main', async () => {
  const directory = await releasedCopy(CHANGELOG, 'feat: another direct commit');
  const result = await run(path.join(directory, 'release-notes.mjs'), ['9.9.9'], { cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes('No pull requests: every change went straight to `main`.'), result.stdout);
});

test('a version without a dated section stops with a message', async () => {
  const directory = await scratchCopy(CHANGELOG);
  const result = await run(path.join(directory, 'release-notes.mjs'), ['1.2.3'], { cwd: directory });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /has no "## 1\.2\.3 - <date>" section/);
});
