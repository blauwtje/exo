import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { surfaceProblems } from '../verify/checks/module-surface.mjs';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-module-surface-'));
  spawnSync('git', ['init', '-q', root]);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

const body = 'function same(a) {\n  const b = a + 1;\n  const c = b * 2;\n  return c;\n}\n';

test('an export no tracked file imports fails', () => {
  const root = fixture({ 'lib/a.mjs': 'export const used = 1;\nexport const idle = 2;\n', 'lib/b.mjs': "import { used } from './a.mjs';\n" });
  assert.deepEqual(surfaceProblems(root, ['lib/a.mjs']), ['lib/a.mjs exports idle that no tracked file imports: drop the export']);
});

test('a test that imports the name dynamically counts', () => {
  const root = fixture({ 'lib/a.mjs': 'export const used = 1;\n', 'tests/a.test.mjs': "const { used } = await import('../lib/a.mjs');\n" });
  assert.deepEqual(surfaceProblems(root, ['lib/a.mjs']), []);
});

test('one function body defined in two modules fails', () => {
  const root = fixture({ 'lib/a.mjs': body, 'lib/b.mjs': body });
  const problems = surfaceProblems(root, ['lib/a.mjs', 'lib/b.mjs']);
  assert.match(problems.join(), /lib\/b\.mjs defines same with the same body as same in lib\/a\.mjs/);
});

test('a hash alias import counts as an import of the module', () => {
  const root = fixture({ 'lib/a.mjs': 'export const used = 1;\n', 'lib/b.mjs': "import { used } from '#a';\n" });
  assert.deepEqual(surfaceProblems(root, ['lib/a.mjs']), []);
});

test('a named import the relative module does not export fails', () => {
  const root = fixture({ 'lib/a.mjs': 'export const used = 1;\n', 'tests/a.test.mjs': "import { used, gone } from '../lib/a.mjs';\n" });
  assert.deepEqual(surfaceProblems(root, []), ['tests/a.test.mjs imports gone from lib/a.mjs, which does not export it']);
});

test('an unimported main export is an entry point and passes', () => {
  const root = fixture({ 'lib/a.mjs': 'export async function main() {\n  return 1;\n}\n' });
  assert.deepEqual(surfaceProblems(root, ['lib/a.mjs']), []);
});

test('a hash alias import of a name the module dropped fails', () => {
  const root = fixture({ 'package.json': '{"imports":{"#thing":"./lib/a.mjs"}}', 'lib/a.mjs': 'export const used = 1;\n', 'lib/b.mjs': "import { used, gone } from '#thing';\n" });
  assert.deepEqual(surfaceProblems(root, []), ['lib/b.mjs imports gone from lib/a.mjs, which does not export it']);
});

test('one arrow const body defined in two modules fails', () => {
  const arrow = 'const same = (a) => {\n  const b = a + 1;\n  const c = b * 2;\n  return c;\n};\n';
  const root = fixture({ 'lib/a.mjs': arrow, 'lib/b.mjs': arrow });
  assert.match(surfaceProblems(root, ['lib/a.mjs', 'lib/b.mjs']).join(), /lib\/b\.mjs defines same with the same body as same in lib\/a\.mjs/);
});

test('a relative import of a missing name under replay cases fails', () => {
  const root = fixture({ 'benchmarks/replay/cases/c/b.mjs': 'export const used = 1;\n', 'benchmarks/replay/cases/c/a.mjs': "import { used, gone } from './b.mjs';\n" });
  const problems = surfaceProblems(root, []);
  assert.ok(problems.some((problem) => problem.includes('imports gone')));
});
