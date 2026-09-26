// What the repository map is made from: the export patterns, the package.json
// entry points, and the reads of a real repository, including the two it
// refuses: a link that points outside, and a commit id that reads as an option.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { commitFiles, fixture, git, gitRepository } from './harness.mjs';
import { exportedNames, locateRepository, readTrackedFiles, unchangedSince } from '../skills/define-scope/scripts/map-source.mjs';

const EXPORT_CASES = [
  ['functions, plain, async and generator', 'export function alpha() {}\nexport async function beta() {}\nexport function* gamma() {}\nexport function *delta() {}', ['alpha', 'beta', 'gamma', 'delta']],
  ['classes', 'export class Alpha {}\nexport abstract class Beta {}\nexport default class Gamma {}', ['Alpha', 'Beta', 'Gamma']],
  ['bindings', 'export const alpha = 1;\nexport let beta;\nexport var gamma;\nexport const enumerate = 2;', ['alpha', 'beta', 'gamma', 'enumerate']],
  ['TypeScript declarations', 'export interface Alpha {}\nexport type Beta = string;\nexport enum Gamma { A }\nexport const enum Delta { A }\nexport namespace Epsilon {}\nexport declare function zeta(): void;', ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'zeta']],
  ['lists, renamed and spread over lines', 'export { alpha, beta as gamma };\nexport {\n  delta, // kept\n  epsilon as zeta,\n};\nexport type { Eta, Theta as Iota } from "./types";', ['alpha', 'gamma', 'delta', 'zeta', 'Eta', 'Iota']],
  ['a namespace re-export', 'export * from "./all";\nexport * as alpha from "./alpha";', ['alpha']],
  ['CommonJS properties', 'exports.alpha = 1;\nmodule.exports.beta = () => {};\nmodule.exports = { gamma };', ['alpha', 'beta']],
  ['an anonymous default', 'export default function () {}\n', ['default']],
  ['a default expression', 'const alpha = 1;\nexport default alpha;', ['default']],
  ['a named default', 'export default function alpha() {}\nexport default async function beta() {}', ['alpha', 'beta']],
  ['text that only looks like an export', '// export function commented() {}\n * export function starred() {}\nconst text = "export function quoted() {}";\nexporter.alpha = 1;\nexport const { skipped } = source;', []],
  ['an empty file', '', []]
];

for (const [label, source, expected] of EXPORT_CASES) {
  test(`exported names: ${label}`, () => {
    assert.deepEqual(exportedNames(source), expected);
  });
}

const MANIFEST = JSON.stringify({
  scripts: { build: 'node build.mjs', test: 'node --test' },
  bin: './cli.mjs',
  main: './index.mjs',
  exports: { '.': './index.mjs', './feature': './feature.mjs' }
});

test('tracked files come back in git order with their names and entry points', async () => {
  const root = await gitRepository({
    'docs/guide.md': '# Guide\n',
    'package.json': MANIFEST,
    'src/alpha.mjs': 'export function alpha() {\n  return 1;\n}\n',
    'src/legacy.cjs': 'exports.legacy = 1;\n',
    'src/types.ts': 'export interface Shape {}\n',
    'tools/broken/package.json': '{ not json'
  });
  assert.deepEqual(readTrackedFiles(root), [
    { path: 'docs/guide.md', names: [] },
    { path: 'package.json', names: ['scripts build test; bin ./cli.mjs; main ./index.mjs; exports . ./feature'] },
    { path: 'src/alpha.mjs', names: ['alpha'] },
    { path: 'src/legacy.cjs', names: ['legacy'] },
    { path: 'src/types.ts', names: ['Shape'] },
    { path: 'tools/broken/package.json', names: [] }
  ]);
});

test('a tracked symbolic link is listed and never followed out of the repository', async (t) => {
  if (process.platform === 'win32') return t.skip('creating a symbolic link needs a privilege on Windows');
  const outside = path.join(await fixture(), 'outside.mjs');
  await fs.writeFile(outside, 'export function leaked() {}\n');
  const root = await gitRepository({ 'src/inside.mjs': 'export function inside() {}\n' });
  await fs.symlink(outside, path.join(root, 'src/link.mjs'));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'chore: track a link that points outside');
  assert.deepEqual(readTrackedFiles(root), [
    { path: 'src/inside.mjs', names: ['inside'] },
    { path: 'src/link.mjs', names: [] }
  ]);
});

test('a file past the size limit keeps its path and loses its names', async () => {
  const oversized = `export function bundled() {}\n${'/'.repeat(1024 * 1024)}\n`;
  const root = await gitRepository({ 'dist/bundle.js': oversized, 'src/small.js': 'export function small() {}\n' });
  assert.deepEqual(readTrackedFiles(root), [
    { path: 'dist/bundle.js', names: [] },
    { path: 'src/small.js', names: ['small'] }
  ]);
});

test('a tracked file the working tree no longer holds keeps its path', async () => {
  const root = await gitRepository({ 'src/gone.mjs': 'export function gone() {}\n' });
  await fs.rm(path.join(root, 'src/gone.mjs'));
  assert.deepEqual(readTrackedFiles(root), [{ path: 'src/gone.mjs', names: [] }]);
});

test('a repository is located from any folder inside it, with the commit it stands on', async () => {
  const root = await gitRepository({ 'src/deep/alpha.mjs': 'export const alpha = 1;\n' });
  const located = locateRepository(path.join(root, 'src/deep'));
  assert.deepEqual(located, { top: root, commit: git(root, 'rev-parse', 'HEAD') });
});

test('outside a repository nothing is located, and before the first commit no commit is', async () => {
  const directory = await fs.realpath(await fixture());
  assert.equal(locateRepository(directory), null);
  git(directory, 'init', '-q', '-b', 'main');
  assert.deepEqual(locateRepository(directory), { top: directory, commit: null });
});

test('a map is current only while HEAD holds the tree of the recorded commit', async () => {
  const root = await gitRepository({ 'src/alpha.mjs': 'export const alpha = 1;\n' });
  const first = git(root, 'rev-parse', 'HEAD');
  assert.equal(unchangedSince(root, first), true);
  await commitFiles(root, { 'src/beta.mjs': 'export const beta = 2;\n' }, 'feat: add beta');
  assert.equal(unchangedSince(root, first), false);
  assert.equal(unchangedSince(root, git(root, 'rev-parse', 'HEAD')), true);
  assert.equal(unchangedSince(root, '1'.repeat(40)), false);
});

test('a recorded commit that reads as a git option is refused before git sees it', async () => {
  const root = await gitRepository({ 'src/alpha.mjs': 'export const alpha = 1;\n' });
  await commitFiles(root, { 'src/beta.mjs': 'export const beta = 2;\n' }, 'feat: add beta');
  const target = path.join(root, 'injected.txt');
  assert.equal(unchangedSince(root, `--output=${target}`), false);
  await assert.rejects(fs.access(target), { code: 'ENOENT' });
});
