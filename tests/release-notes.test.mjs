// release-notes.mjs renders one version's changelog section as a GitHub Release
// body: highlights first, the change sections in a fixed order, then the
// commands that upgrade an installed copy.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));

async function scratchCopy(changelog) {
  const directory = await fixture();
  for (const relative of ['release-notes.mjs', 'verify/changelog.mjs', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json']) {
    const target = path.join(directory, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(REPOSITORY, relative), target);
  }
  await fs.writeFile(path.join(directory, 'CHANGELOG.md'), changelog);
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

test('orders highlights, the change sections and the upgrade commands', async () => {
  const directory = await scratchCopy(CHANGELOG);
  const result = await run(path.join(directory, 'release-notes.mjs'), ['9.9.9'], { cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  const notes = result.stdout;
  const positions = ['## Highlights', '### Added', '### Fixed', '### Upgrade'].map((heading) => notes.indexOf(heading));
  assert.ok(positions.every((position) => position !== -1), notes);
  assert.deepEqual([...positions].sort((left, right) => left - right), positions, notes);
  assert.ok(notes.includes('claude plugin marketplace update blauwtje'), notes);
  assert.ok(notes.includes('claude plugin update exo@blauwtje'), notes);
  assert.ok(!notes.includes('older'), 'another version leaks into the notes');
});

test('a version without a dated section stops with a message', async () => {
  const directory = await scratchCopy(CHANGELOG);
  const result = await run(path.join(directory, 'release-notes.mjs'), ['1.2.3'], { cwd: directory });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /has no "## 1\.2\.3 - <date>" section/);
});
