// release-notes.mjs renders one version's changelog section as a GitHub Release
// body: highlights first, then the change sections under release headings, each
// bullet followed by the pull request, merged branch or linked commit that added
// it, and a closing link to the full diff against the previous tag.

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
  for (const relative of ['release-notes.mjs', 'verify/changelog.mjs', 'package.json', '.claude-plugin/plugin.json']) {
    const target = path.join(directory, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(REPOSITORY, relative), target);
  }
  await fs.writeFile(path.join(directory, 'CHANGELOG.md'), changelog);
  return directory;
}

function git(directory, args) {
  const identity = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'tag.gpgSign=false', '-c', 'commit.gpgSign=false'];
  return execFileSync('git', [...identity, ...args], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

const header = ['# Changelog', '', '## Unreleased', ''];
const older = ['## 9.9.8 - 2026-09-19', '', '### Fixed', '', '- older', ''];

/** Writes CHANGELOG.md as the 9.9.9 section holding `lines` under their subsections, then commits it with `subject`. */
async function commitChangelog(directory, sections, subject) {
  const released = [];
  for (const [name, lines] of sections) released.push(`### ${name}`, '', ...lines, '');
  const text = [...header, '## 9.9.9 - 2026-09-20', '', ...released, ...older].join('\n');
  await fs.writeFile(path.join(directory, 'CHANGELOG.md'), text);
  git(directory, ['add', 'CHANGELOG.md']);
  git(directory, ['commit', '--quiet', '-m', subject]);
}

// Version 9.9.9 adds one line through a squashed pull request, one through a
// branch merged with --no-ff, one in a direct commit on main and one highlight
// in a direct commit; its Fixed section comes before Highlights in the file.
async function releasedCopy() {
  const directory = await scratchCopy([...header, ...older].join('\n'));
  git(directory, ['init', '--quiet', '--initial-branch=main']);
  git(directory, ['add', '.']);
  git(directory, ['commit', '--quiet', '-m', 'chore(release): 9.9.8']);
  git(directory, ['tag', 'v9.9.8']);

  const sections = new Map([['Fixed', []], ['Highlights', []], ['Added', []]]);
  sections.get('Fixed').push('- a squashed fix');
  await commitChangelog(directory, sections, 'fix: a squashed fix (#7)');

  git(directory, ['checkout', '--quiet', '-b', 'feat/skill']);
  sections.get('Added').push('- a skill');
  await commitChangelog(directory, sections, 'feat: a skill');
  git(directory, ['checkout', '--quiet', 'main']);
  git(directory, ['merge', '--quiet', '--no-ff', '--no-edit', 'feat/skill']);

  sections.get('Fixed').push('- a direct fix');
  await commitChangelog(directory, sections, 'fix: a direct fix');
  sections.get('Highlights').push('- **Settings.** One place for them.');
  await commitChangelog(directory, sections, 'docs: a highlight');
  git(directory, ['tag', 'v9.9.9']);
  return directory;
}

test('orders highlights and the change sections and closes with the full diff link', async () => {
  const directory = await releasedCopy();
  const result = await run(path.join(directory, 'release-notes.mjs'), ['9.9.9'], { cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  const notes = result.stdout;
  const positions = ['## Highlights', '## New', '## Fixed', 'Full diff: '].map((heading) => notes.indexOf(heading));
  assert.ok(positions.every((position) => position !== -1), notes);
  assert.deepEqual([...positions].sort((left, right) => left - right), positions, notes);
  assert.ok(notes.includes('Full diff: [v9.9.8...v9.9.9](https://github.com/blauwtje/exo/compare/v9.9.8...v9.9.9)'), notes);
  assert.ok(!notes.includes('older'), 'another version leaks into the notes');
  for (const gone of ['## Upgrade', '## Pull requests', 'claude plugin', 'Restart the session']) {
    assert.ok(!notes.includes(gone), `the notes still hold ${gone}`);
  }
});

test('a line added in a squashed pull request names the pull request', async () => {
  const directory = await releasedCopy();
  const result = await run(path.join(directory, 'release-notes.mjs'), ['9.9.9'], { cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.split('\n').includes('- a squashed fix (#7)'), result.stdout);
});

test('a line added on a merged branch names the branch', async () => {
  const directory = await releasedCopy();
  const result = await run(path.join(directory, 'release-notes.mjs'), ['9.9.9'], { cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.split('\n').includes('- a skill (branch `feat/skill`)'), result.stdout);
});

test('a line committed straight to main links its commit', async () => {
  const directory = await releasedCopy();
  const result = await run(path.join(directory, 'release-notes.mjs'), ['9.9.9'], { cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  for (const [line, subject] of [['- a direct fix', 'fix: a direct fix'], ['- **Settings.** One place for them.', 'docs: a highlight']]) {
    const sha = git(directory, ['log', '--format=%H', `--grep=^${subject}$`]);
    const short = git(directory, ['rev-parse', '--short', sha]);
    const expected = `${line} ([\`${short}\`](https://github.com/blauwtje/exo/commit/${sha}))`;
    assert.ok(result.stdout.split('\n').includes(expected), `${expected}\n${result.stdout}`);
  }
});

test('a version without a dated section stops with a message', async () => {
  const directory = await scratchCopy([...header, ...older].join('\n'));
  const result = await run(path.join(directory, 'release-notes.mjs'), ['1.2.3'], { cwd: directory });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /has no "## 1\.2\.3 - <date>" section/);
});
