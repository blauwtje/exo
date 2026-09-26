// The generator's command: where the map lands, when it is rebuilt, what it
// says where no map can be built, and what the map of this repository names.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { commitFiles, fixture, git, gitRepository, run } from './harness.mjs';
import { DEFAULT_CAP, renderMap } from '../skills/define-scope/scripts/map-render.mjs';
import { locateRepository, readTrackedFiles } from '../skills/define-scope/scripts/map-source.mjs';

const REPO_MAP = fileURLToPath(new URL('../skills/define-scope/scripts/repo-map.mjs', import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SENTINEL = 'left by the test\n';

const FILES = {
  'README.md': '# Fixture\n',
  'src/alpha.mjs': 'export function alpha() {\n  return "BODY_MARKER";\n}\n'
};

function repoMap(directory, ...args) {
  return run(REPO_MAP, args, { cwd: directory });
}

// Runs the generator in `directory` and returns the path it printed.
async function builtMap(directory, ...args) {
  const result = await repoMap(directory, ...args);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}

// A line ending in a slash opens a folder, and the two-space lines under it are
// its files, each up to the colon that starts its names.
function namedPathsIn(text) {
  const named = [];
  let folder = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('  ')) {
      const name = line.slice(2).split(': ')[0];
      named.push(`${folder}${name}`);
    } else if (line.endsWith('/')) {
      folder = line === './' ? '' : line;
    }
  }
  return named;
}

test('the map lands in the shared git directory and leaves the work tree alone', async () => {
  const root = await gitRepository(FILES);
  const result = await repoMap(path.join(root, 'src'));
  assert.equal(result.code, 0, result.stderr);
  const file = path.join(root, '.git', 'exo', 'map.md');
  assert.equal(result.stdout, `${file}\n`);
  const text = await fs.readFile(file, 'utf8');
  assert.ok(text.includes(`\ncommit: ${git(root, 'rev-parse', 'HEAD')}\n`), text);
  assert.ok(text.includes(`\ncap: ${DEFAULT_CAP}\n`), text);
  assert.ok(text.includes('\nfiles: 2 tracked, 2 named, 0 behind collapsed lines\n'), text);
  assert.ok(text.includes('\nsrc/\n  alpha.mjs: alpha\n'), text);
  assert.ok(!text.includes('BODY_MARKER'), text);
  assert.equal(git(root, 'status', '--porcelain'), '');
});

test('a linked worktree shares the map of its repository', async () => {
  const root = await gitRepository(FILES);
  const parent = await fs.realpath(await fixture());
  const linked = path.join(parent, 'linked');
  git(root, 'worktree', 'add', '-q', '-b', 'side', linked);
  assert.equal(await builtMap(linked), path.join(root, '.git', 'exo', 'map.md'));
});

test('a current map is left untouched and a commit that touches a path rebuilds it', async () => {
  const root = await gitRepository(FILES);
  const file = await builtMap(root);
  await fs.appendFile(file, SENTINEL);
  await builtMap(root);
  const untouched = await fs.readFile(file, 'utf8');
  assert.ok(untouched.endsWith(SENTINEL), 'a current map was rewritten');
  await commitFiles(root, { 'src/beta.mjs': 'export const beta = 2;\n' }, 'feat: add beta');
  await builtMap(root);
  const rebuilt = await fs.readFile(file, 'utf8');
  assert.ok(!rebuilt.includes(SENTINEL), rebuilt);
  assert.ok(rebuilt.includes(`\ncommit: ${git(root, 'rev-parse', 'HEAD')}\n`), rebuilt);
  assert.ok(rebuilt.includes('\n  beta.mjs: beta\n'), rebuilt);
});

test('a map built from a commit the repository no longer knows is rebuilt', async () => {
  const root = await gitRepository(FILES);
  const file = await builtMap(root);
  const text = await fs.readFile(file, 'utf8');
  const unknown = text.replace(/^commit: .*$/m, `commit: ${'1'.repeat(40)}`);
  await fs.writeFile(file, `${unknown}${SENTINEL}`);
  await builtMap(root);
  const rebuilt = await fs.readFile(file, 'utf8');
  assert.ok(!rebuilt.includes(SENTINEL), rebuilt);
});

test('asking for another cap rebuilds the map', async () => {
  const root = await gitRepository(FILES);
  const file = await builtMap(root);
  await fs.appendFile(file, SENTINEL);
  await builtMap(root, '--cap', '0');
  const rebuilt = await fs.readFile(file, 'utf8');
  assert.ok(!rebuilt.includes(SENTINEL), rebuilt);
  assert.ok(rebuilt.includes('\ncap: 0\n'), rebuilt);
});

test('a stored header that reads as a git option is rebuilt, never run', async () => {
  const root = await gitRepository(FILES);
  const file = await builtMap(root);
  const target = path.join(root, 'injected.txt');
  const text = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, text.replace(/^commit: .*$/m, `commit: --output=${target}`));
  await builtMap(root);
  await assert.rejects(fs.access(target), { code: 'ENOENT' });
  const rebuilt = await fs.readFile(file, 'utf8');
  assert.ok(rebuilt.includes(`\ncommit: ${git(root, 'rev-parse', 'HEAD')}\n`), rebuilt);
});

test('outside a repository nothing is written and one line says so', async () => {
  const directory = await fs.realpath(await fixture());
  const configDirectory = await fixture();
  const result = await run(REPO_MAP, [], { cwd: directory, env: { CLAUDE_CONFIG_DIR: configDirectory } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, 'no map: this directory is not inside a git repository\n');
  assert.deepEqual(await fs.readdir(directory), []);
  assert.deepEqual(await fs.readdir(configDirectory), []);
});

test('a repository without a commit gets no map', async () => {
  const root = await fs.realpath(await fixture());
  git(root, 'init', '-q', '-b', 'main');
  const result = await repoMap(root);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, 'no map: this repository has no commit yet\n');
  await assert.rejects(fs.access(path.join(root, '.git', 'exo')), { code: 'ENOENT' });
});

test('a cap that is neither 0 nor at least 500 bytes is refused, and so is an unknown option', async () => {
  const root = await gitRepository(FILES);
  for (const cap of ['12', 'many', '4000.5', '']) {
    const result = await repoMap(root, '--cap', cap);
    assert.equal(result.code, 1, `--cap ${cap}`);
    assert.match(result.stderr, /--cap takes 0 for no cap, or at least 500 bytes/);
  }
  const unknown = await repoMap(root, '--bogus');
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /usage: repo-map\.mjs \[--cap <bytes>\]/);
  await assert.rejects(fs.access(path.join(root, '.git', 'exo', 'map.md')), { code: 'ENOENT' });
});

test('with the cap lifted, the map of this repository names every skill, script and hook entry point', () => {
  const repository = locateRepository(REPOSITORY_ROOT);
  const files = readTrackedFiles(repository.top);
  const uncapped = renderMap({ commit: repository.commit, cap: 0, files });
  const named = new Set(namedPathsIn(uncapped.text));
  const listing = git(repository.top, 'ls-files', '--', 'skills/*/SKILL.md', 'skills/*/scripts/*', 'hooks/*');
  const entryPoints = listing.split('\n');
  assert.ok(entryPoints.length > 20, 'the pathspecs matched too little to prove anything');
  for (const entryPoint of entryPoints) assert.ok(named.has(entryPoint), `${entryPoint} is not named`);
  assert.ok(uncapped.text.includes(`\nfiles: ${files.length} tracked, ${files.length} named, 0 behind collapsed lines\n`));
  const capped = renderMap({ commit: repository.commit, cap: DEFAULT_CAP, files });
  assert.ok(Buffer.byteLength(capped.text) <= DEFAULT_CAP, `the capped map is ${Buffer.byteLength(capped.text)} bytes`);
});
