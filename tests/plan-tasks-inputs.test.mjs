import assert from 'node:assert/strict';
import os from 'node:os';
import test from 'node:test';
import { coversCompanion, driftOf, INPUT_UNREADABLE, isCovered, isUnreachableInput, inputPaths, parsePlan, relativeInputPaths } from '../lib/plan-tasks.mjs';

test('a relative input under a dot folder is an input', () => {
  const frame = { assumptions: ['- assume: the hint is `.exo/carry/task1-partial.patch`'], context: [] };
  assert.deepEqual(relativeInputPaths(frame), ['.exo/carry/task1-partial.patch']);
});

test('a parent path is not an input', () => {
  assert.deepEqual(relativeInputPaths({ assumptions: ['- assume: `../x/y.md`'], context: [] }), []);
});

const INPUT_FORMS = [
  ['a route with a param segment', '`/api/:id/items`', []],
  ['a route with a brace segment', '`/users/{id}/posts`', []],
  ['a route with an angle segment', '`/users/<id>/posts`', []],
  ['a glob', '`/tmp/*/out.txt`', []],
  ['a URL path whose first segment is absent', '`/zz-no-such-root/v1/items`', []],
  ['a route whose first segment matches a root folder in another case', '`/users/me`', []],
  ['a missing path under the tmp root', '`/tmp/some/file.md`', ['/tmp/some/file.md']],
  ['a missing path under the home folder', `\`${os.homedir()}/missing/notes.md\``, [`${os.homedir()}/missing/notes.md`]],
  ['a missing path under a system root', '`/var/backups/example-app`', []],
  ['a missing path under the etc root', '`/etc/zz-no-such/conf`', []],
  ['a path that only shares the tmp prefix', '`/tmpfoo/x/y.md`', []],
  ['a real path with a dotted name', '`/usr/bin/env`', ['/usr/bin/env']],
];

for (const [name, text, expected] of INPUT_FORMS) {
  test(`inputPaths reads ${name}`, () => {
    assert.deepEqual(inputPaths(`- assume: ${text}`), expected);
  });
}

const COMPANION_FORMS = [
  ['a module stylesheet of a component', ['src/Button.tsx'], 'src/Button.module.css', true],
  ['a test file of a source file', ['lib/a.mjs'], 'lib/a.test.mjs', true],
  ['a sibling of a listed multi-dot file', ['src/Button.module.css'], 'src/Button.tsx', true],
  ['the listed file itself', ['src/Button.tsx'], 'src/Button.tsx', false],
  ['a file whose stem only starts with the listed stem', ['src/Button.tsx'], 'src/ButtonGroup.tsx', false],
  ['a same-named file in another folder', ['src/Button.tsx'], 'other/Button.module.css', false],
  ['a same-named file in a nested folder', ['src/Button.tsx'], 'src/deep/Button.module.css', false],
  ['a file named like a dotfile companion', ['.env.example'], '.env.local', false],
  ['a dotfile stem with a dot suffix', ['.env'], '.env.local', false],
  ['a bare stem with no rest', ['src/Button.tsx'], 'src/Button.', false],
  ['a file without an extension', ['Makefile'], 'Makefile.bak', false],
  ['a folder entry', ['src/'], 'src/Button.module.css', false],
  ['a parent path escape', ['src/Button.tsx'], 'src/../Button.module.css', false],
  ['no listed files', [], 'src/Button.module.css', false],
];

for (const [name, entries, file, expected] of COMPANION_FORMS) {
  test(`coversCompanion reads ${name}`, () => {
    assert.equal(coversCompanion(entries, file), expected);
  });
}

test('isCovered stays exact for a same-stem file', () => {
  assert.equal(isCovered(['src/Button.tsx'], 'src/Button.module.css'), false);
});

const BOUNDARY = { in: 'a file path', out: 'a bad path, an empty file', test: 'tests/a.test.mjs' };

function boundaryOfTask(body) {
  return parsePlan(`### Task 1: t\n${body}\n`).tasks[0].boundary;
}

test('a Boundary line on its own line is read into task.boundary = { in, out, test }', () => {
  const body = 'Depends on: none\nBoundary: in a file path | out a bad path, an empty file | test tests/a.test.mjs';
  assert.deepEqual(boundaryOfTask(body), BOUNDARY);
});

test('a Boundary field in a compact task line is read into in, out and test', () => {
  const body = 'Depends on: none | Files: `lib/a.mjs` | Boundary: in a file path | out a bad path, an empty file | test tests/a.test.mjs | Proof: node --test';
  assert.deepEqual(boundaryOfTask(body), BOUNDARY);
});

test('a task without a Boundary line has boundary null', () => {
  assert.equal(boundaryOfTask('Depends on: none | Files: `lib/a.mjs`'), null);
});

test('a Boundary line missing its test part has boundary null', () => {
  assert.equal(boundaryOfTask('Depends on: none\nBoundary: in a file path | out a bad path'), null);
});

test('one predicate names both unreachable-input stop texts', () => {
  const frame = { assumptions: ['- assume: the notes are `/tmp/exo-absent/missing.md`'], context: [] };
  const [item] = driftOf({ files: [] }, os.tmpdir(), frame);
  assert.ok(isUnreachableInput(item));
  assert.ok(isUnreachableInput(`PLAN DRIFT ${item}`));
  assert.ok(isUnreachableInput(`Task 1: BLOCKED ${INPUT_UNREADABLE}: /tmp/x.md`));
  assert.ok(!isUnreachableInput('PLAN DRIFT region `greet` moved'));
});
