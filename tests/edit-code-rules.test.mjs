import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';
import { addedLineNumbers } from '../lib/added-lines.mjs';
import { tempDir } from './harness.mjs';

const OFF = () => false;
const DEEP = 'function deep(items) {\n  if (items) {\n    for (const item of items) {\n      if (item) {\n        return item;\n      }\n    }\n  }\n  return null;\n}\n';
const CLEAN = 'function tidy(items) {\n  return items ?? [];\n}\n';
let counter = 0;

function project(name, text) {
  const dir = tempDir('edit-rules-');
  const file = path.join(dir, name);
  if (text !== undefined) fs.writeFileSync(file, text);
  return { dir, file };
}

function run(tool_name, dir, tool_input) {
  counter += 1;
  return dispatchEdit({ tool_name, cwd: dir, session_id: `edit-rules-${process.pid}-${counter}`, tool_input }, OFF);
}

function decision(output) {
  return output?.hookSpecificOutput?.permissionDecision;
}

function denial(output) {
  assert.equal(decision(output), undefined, JSON.stringify(output));
  return output.hookSpecificOutput.additionalContext;
}

test('an Edit that adds a comment is refused with the comment rule', () => {
  const { dir, file } = project('a.mjs', 'export const a = 1;\n');
  const reason = denial(run('Edit', dir, { file_path: file, old_string: 'export const a = 1;', new_string: 'export const a = 1;\n// the answer' }));
  assert.match(reason, /the added code breaks the code rules/);
  assert.match(reason, /a\.mjs:2 comment/);
  assert.match(reason, /Fix for comment: remove it or make the code clearer\./);
});

test('an Edit that nests a block past the depth limit is refused with max-depth and the limit', () => {
  const { dir, file } = project('b.mjs', 'export const b = 1;\n');
  const reason = denial(run('Edit', dir, { file_path: file, old_string: 'export const b = 1;\n', new_string: `export const b = 1;\n${DEEP}` }));
  assert.match(reason, /max-depth nests 3 deep, at most 2/);
  assert.match(reason, /blocks nest at most 2 deep/);
});

test('an Edit that adds a function with too many parameters is refused with max-params', () => {
  const { dir, file } = project('c.mjs', 'export const c = 1;\n');
  const added = 'export const c = 1;\nexport function pack(a, b, c, d) {\n  return [a, b, c, d];\n}';
  const reason = denial(run('Edit', dir, { file_path: file, old_string: 'export const c = 1;', new_string: added }));
  assert.match(reason, /max-params takes 4 parameters, at most 3/);
});

test('a Write of a new file and a MultiEdit are checked on the lines they add', () => {
  const fresh = project('d.mjs');
  assert.match(denial(run('Write', fresh.dir, { file_path: fresh.file, content: DEEP })), /max-depth/);
  const multi = project('e.mjs', 'export const e = 1;\nexport const f = 2;\n');
  const edits = [{ old_string: 'export const e = 1;', new_string: 'export const e = 3;' }, { old_string: 'export const f = 2;', new_string: 'export const f = 2; // two' }];
  assert.match(denial(run('MultiEdit', multi.dir, { file_path: multi.file, edits })), /comment/);
});

test('an edit that adds clean lines to a file with an existing violation is allowed', () => {
  const { dir, file } = project('f.mjs', `${DEEP}// old note\n`);
  assert.equal(decision(run('Edit', dir, { file_path: file, old_string: 'return null;', new_string: 'return undefined;' })), undefined);
  assert.equal(decision(run('Write', dir, { file_path: file, content: `${DEEP}// old note\n${CLEAN}` })), undefined);
});

test('files land does not check and edits that match nothing are allowed', () => {
  const doc = project('notes.md', 'x\n');
  assert.equal(decision(run('Edit', doc.dir, { file_path: doc.file, old_string: 'x', new_string: '// y' })), undefined);
  const code = project('g.mjs', 'export const g = 1;\n');
  assert.equal(decision(run('Edit', code.dir, { file_path: code.file, old_string: 'absent', new_string: '// y' })), undefined);
});

test('addedLineNumbers numbers the lines that are new, ignoring moved and repeated ones', () => {
  assert.deepEqual([...addedLineNumbers('a\nb\nc', 'a\nx\nb\nc')], [2]);
  assert.deepEqual([...addedLineNumbers('', 'a\nb')], [1, 2]);
  assert.deepEqual([...addedLineNumbers('a\nb\nc\nd', 'a\nc\nb\nd')], []);
  assert.deepEqual([...addedLineNumbers('a\nb', 'a\nb')], []);
});

test('a Write whose only break is added comment lines lands with them stripped', () => {
  const { dir, file } = project('w.mjs');
  const content = 'export const a = 1;\n// the answer\nexport const b = 2; // two\n';
  const output = run('Write', dir, { file_path: file, content });
  assert.equal(output.hookSpecificOutput.updatedInput.content, 'export const a = 1;\nexport const b = 2;\n');
  assert.equal(output.hookSpecificOutput.updatedInput.file_path, file);
});

test('a Write with too deep nesting and a comment is still refused', () => {
  const { dir, file } = project('t.mjs');
  const content = `// note\n${DEEP}`;
  assert.match(denial(run('Write', dir, { file_path: file, content })), /max-depth/);
});

test('a Write keeps a shebang', () => {
  const { dir, file } = project('s.mjs');
  const content = '#!/usr/bin/env node\nconsole.log(1);\n';
  assert.equal(run('Write', dir, { file_path: file, content }), null);
});

test('a Write strip leaves untouched lines byte-identical', () => {
  const { dir, file } = project('b.mjs');
  const content = 'export const a = `x  \n  y`;   \n// note\nexport const b = 2;\n';
  const output = run('Write', dir, { file_path: file, content });
  assert.equal(output.hookSpecificOutput.updatedInput.content, 'export const a = `x  \n  y`;   \nexport const b = 2;\n');
});

test('a Write strip keeps a shellcheck directive', () => {
  const { dir, file } = project('d.sh');
  const content = '#!/bin/sh\n# shellcheck disable=SC2086\necho $1\n# a note\n';
  const output = run('Write', dir, { file_path: file, content });
  assert.equal(output.hookSpecificOutput.updatedInput.content, '#!/bin/sh\n# shellcheck disable=SC2086\necho $1\n');
});

test('a Write strip returns updatedInput without a permission decision', () => {
  const { dir, file } = project('p.mjs');
  const output = run('Write', dir, { file_path: file, content: '// note\nexport const a = 1;\n' });
  assert.equal(decision(output), undefined);
  assert.equal(output.hookSpecificOutput.updatedInput.content, 'export const a = 1;\n');
});
