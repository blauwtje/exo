import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkCodeComments } from '../verify/checks/code-comments.mjs';
import { createRepository } from '../verify/repository.mjs';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-comments-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

function run(files) {
  const root = fixture(files);
  const results = [];
  const report = { result: (status, name, detail) => results.push({ status, name, detail }) };
  checkCodeComments(report, createRepository(root));
  fs.rmSync(root, { recursive: true, force: true });
  return results;
}

test('a disallowed comment fails with its path and line', () => {
  const results = run({ 'skills/a/scripts/x.mjs': 'const a = 1;\n// explains a\nexport default a;\n' });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'FAIL');
  assert.match(results[0].detail, /^skills\/a\/scripts\/x\.mjs:2 /);
});

test('a doc comment fails too', () => {
  const results = run({ 'lib/x.mjs': '/** Adds one. */\nexport function add(n) {\n  return n + 1;\n}\n' });
  assert.deepEqual(results.map((entry) => entry.status), ['FAIL']);
  assert.match(results[0].detail, /^lib\/x\.mjs:1 /);
});

test('each comment line fails on its own line', () => {
  const results = run({ 'hooks/x.mjs': '// one\n\nconst a = 1;\n// two\nexport default a;\n' });
  assert.deepEqual(results.map((entry) => entry.detail.split(' ')[0]), ['hooks/x.mjs:1', 'hooks/x.mjs:4']);
});

test('clean code and files outside skills, lib and hooks pass', () => {
  const results = run({
    'lib/clean.mjs': 'export const a = 1;\n',
    'tests/noisy.mjs': '// fine here\nexport const b = 2;\n',
    'skills/a/notes.md': '<!-- not code -->\n'
  });
  assert.deepEqual(results.map((entry) => entry.status), ['PASS']);
});
