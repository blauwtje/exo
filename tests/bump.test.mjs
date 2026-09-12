// bump.mjs raises the version in all three manifests together and turns the
// changelog's Unreleased heading into the new version's heading, or changes
// nothing when a file lacks what it rewrites.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const MANIFESTS = ['package.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json'];

async function scratchCopy(changelog) {
  const directory = await fixture();
  for (const relative of ['bump.mjs', ...MANIFESTS]) {
    const target = path.join(directory, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(REPOSITORY, relative), target);
  }
  await fs.writeFile(path.join(directory, 'CHANGELOG.md'), changelog);
  return directory;
}

async function readManifest(directory, relative) {
  return JSON.parse(await fs.readFile(path.join(directory, relative), 'utf8'));
}

async function versions(directory) {
  const packageManifest = await readManifest(directory, 'package.json');
  const plugin = await readManifest(directory, '.claude-plugin/plugin.json');
  const marketplace = await readManifest(directory, '.claude-plugin/marketplace.json');
  const listed = marketplace.plugins.find((entry) => entry.name === plugin.name);
  return [packageManifest.version, plugin.version, listed.version];
}

test('a patch bump raises every manifest and dates the Unreleased heading', async () => {
  const directory = await scratchCopy('# Changelog\n\n## Unreleased\n\n- a change\n\n## 0.1.0 - 2026-09-10\n');
  const [, pluginVersion] = await versions(directory);
  const [major, minor, patch] = pluginVersion.split('.').map(Number);
  const expected = `${major}.${minor}.${patch + 1}`;
  const result = await run(path.join(directory, 'bump.mjs'), [], { cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await versions(directory), [expected, expected, expected]);
  const changelog = await fs.readFile(path.join(directory, 'CHANGELOG.md'), 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(changelog.includes(`## Unreleased\n\n## ${expected} - ${today}\n\n- a change\n`), changelog);
});

test('a changelog without an Unreleased heading stops the bump before any file changes', async () => {
  const directory = await scratchCopy('# Changelog\n\n## 0.1.0 - 2026-09-10\n');
  const before = await versions(directory);
  const result = await run(path.join(directory, 'bump.mjs'), [], { cwd: directory });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /has no "## Unreleased" heading/);
  assert.deepEqual(await versions(directory), before);
});
