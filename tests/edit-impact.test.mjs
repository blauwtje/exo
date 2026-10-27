import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';
import { impactNote, impactFields, importName, isTestPath } from '../lib/edit-impact.mjs';

let counter = 0;
const session = () => `impact-${process.pid}-${counter++}`;

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-impact-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

const LIB = {
  'src/dedupe.mjs': 'export const dedupe = (x) => x;\n',
  'src/pipeline.mjs': "import { dedupe } from './dedupe.mjs';\n",
  'src/other.mjs': "const d = require('./dedupe');\n",
  'src/unrelated.mjs': 'const dedupe = 1; // no import\n',
  'test/dedupe.test.mjs': "import { dedupe } from '../src/dedupe.mjs';\n",
  'README.md': "see 'src/dedupe.mjs'\n"
};

test('lists importers and the tests that load the file, nothing else', () => {
  const cwd = repo(LIB);
  const note = impactNote({ cwd, file: 'src/dedupe.mjs', sessionId: session() });
  assert.match(note, /^src\/dedupe\.mjs: Imported by src\/other\.mjs, src\/pipeline\.mjs\. Tests loading it: test\/dedupe\.test\.mjs\./);
  assert.doesNotMatch(note, /unrelated|README/);
});

test('fires once per file in a session, again in another session', () => {
  const cwd = repo(LIB);
  const id = session();
  assert.ok(impactNote({ cwd, file: path.join(cwd, 'src/dedupe.mjs'), sessionId: id }));
  assert.equal(impactNote({ cwd, file: 'src/dedupe.mjs', sessionId: id }), null);
  assert.ok(impactNote({ cwd, file: 'src/dedupe.mjs', sessionId: session() }));
});

test('no importers and no tests gives no note, and the file counts as seen', () => {
  const cwd = repo({ 'src/lonely.mjs': 'export {};\n' });
  const id = session();
  assert.equal(impactNote({ cwd, file: 'src/lonely.mjs', sessionId: id }), null);
  fs.writeFileSync(path.join(cwd, 'src/user.mjs'), "import './lonely.mjs';\n");
  assert.equal(impactNote({ cwd, file: 'src/lonely.mjs', sessionId: id }), null);
});

test('caps the list at 6 paths with a count of the rest, tests capped at 3', () => {
  const files = { 'src/core.mjs': 'export {};\n' };
  for (let i = 0; i < 8; i += 1) files[`src/user${i}.mjs`] = "import './core.mjs';\n";
  for (let i = 0; i < 5; i += 1) files[`test/t${i}.test.mjs`] = "import '../src/core.mjs';\n";
  const note = impactNote({ cwd: repo(files), file: 'src/core.mjs', sessionId: session() });
  assert.equal(note.match(/\b(src|test)\/[\w.]+\.mjs/g).length - 1, 6);
  assert.match(note, /Imported by (src\/user\d\.mjs(, )?){3} \(\+5\)\. Tests loading it: (test\/t\d\.test\.mjs(, )?){3} \(\+2\)\./);
});

test('skips test files, non-source files, missing files and paths outside cwd', () => {
  const cwd = repo(LIB);
  for (const file of ['test/dedupe.test.mjs', 'README.md', 'src/new.mjs', '../elsewhere.mjs']) {
    assert.equal(impactNote({ cwd, file, sessionId: session() }), null, file);
  }
  assert.equal(impactNote({ cwd, file: 'src/dedupe.mjs' }), null);
});

test('a search past EXO_EDIT_IMPACT_MS gives no note instead of stalling the edit', { skip: process.platform === 'win32' }, () => {
  const cwd = repo(LIB);
  const bin = repo({});
  const stallMs = 20000;
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nsleep ${stallMs / 1000}\n`, { mode: 0o755 });
  const saved = { path: process.env.PATH, ms: process.env.EXO_EDIT_IMPACT_MS };
  process.env.PATH = `${bin}${path.delimiter}${saved.path}`;
  process.env.EXO_EDIT_IMPACT_MS = '200';
  const started = Date.now();
  try {
    assert.equal(impactNote({ cwd, file: 'src/dedupe.mjs', sessionId: session() }), null);
    assert.ok(Date.now() - started < stallMs / 4);
  } finally {
    process.env.PATH = saved.path;
    if (saved.ms === undefined) delete process.env.EXO_EDIT_IMPACT_MS;
    else process.env.EXO_EDIT_IMPACT_MS = saved.ms;
  }
});

test('names: index files use the directory, tests are recognised across layouts', () => {
  assert.equal(importName('src/billing/index.js'), 'billing');
  assert.equal(importName('pkg/__init__.py'), 'pkg');
  assert.equal(importName('src/x.mjs'), null);
  for (const file of ['tests/a.js', 'src/__tests__/a.js', 'a.test.ts', 'a_spec.rb', 'pkg/test_a.py', 'spec/a.rb', 'a_test.go']) assert.ok(isTestPath(file), file);
  assert.ok(!isTestPath('src/latest.js'));
});

test('python and go style imports are found by the keyword pattern', () => {
  const cwd = repo({
    'app/money.py': 'x = 1\n',
    'app/views.py': 'from app.money import x\n',
    'app/note.py': '# money is nice\n',
    'tests/test_money.py': 'import money\n'
  });
  const note = impactNote({ cwd, file: 'app/money.py', sessionId: session() });
  assert.match(note, /Imported by app\/views\.py\. Tests loading it: tests\/test_money\.py\./);
});

test('dispatchEdit adds the note for Edit only on the first edit and ignores other tools', () => {
  const cwd = repo(LIB);
  const input = (tool_name, session_id) => ({ tool_name, session_id, cwd, tool_input: { file_path: path.join(cwd, 'src/dedupe.mjs') } });
  const id = session();
  assert.equal(impactFields({ ...input('Read', id) }), null);
  const first = dispatchEdit(input('Edit', id));
  assert.match(first.hookSpecificOutput.additionalContext, /Imported by/);
  assert.equal(dispatchEdit(input('Edit', id)), null);
});
