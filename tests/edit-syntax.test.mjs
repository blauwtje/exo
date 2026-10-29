import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { syncBuiltinESMExports } from 'node:module';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';
import { postEditText, syntaxFields } from '../lib/edit-syntax.mjs';

const GOOD_AGENT = '---\nname: sample\ndescription: A sample agent.\n---\nbody\n';

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-syntax-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

const call = (cwd, toolName, toolInput) => ({
  cwd,
  tool_name: toolName,
  tool_input: toolInput,
  agent_type: 'build-task',
  session_id: `syntax-${process.pid}`
});

const write = (cwd, file, content) => call(cwd, 'Write', { file_path: path.join(cwd, file), content });

const as = (agentType, input) => ({ ...input, agent_type: agentType });

const edit = (cwd, file, change) => call(cwd, 'Edit', { file_path: path.join(cwd, file), ...change });

test('Write of a broken module is denied with the parse error', () => {
  const cwd = repo({});
  const fields = syntaxFields(write(cwd, 'a.mjs', 'const = 1;\n'));
  assert.equal(fields.permissionDecision, 'deny');
  assert.match(fields.permissionDecisionReason, /a\.mjs/);
  assert.match(fields.permissionDecisionReason, /SyntaxError/);
});

test('Write of valid .mjs, .cjs and .js passes', () => {
  const cwd = repo({});
  assert.equal(syntaxFields(write(cwd, 'a.mjs', 'export const x = 1;\n')), null);
  assert.equal(syntaxFields(write(cwd, 'b.cjs', 'module.exports = 1;\n')), null);
  assert.equal(syntaxFields(write(cwd, 'c.js', 'module.exports = 1;\n')), null);
});

test('Edit is checked against the post-edit file, replace_all honored', () => {
  const cwd = repo({ 'a.mjs': 'const x = 1;\nconst y = 1;\n' });
  const broken = syntaxFields(edit(cwd, 'a.mjs', { old_string: 'const y = 1;', new_string: 'const y = ;' }));
  assert.equal(broken.permissionDecision, 'deny');
  const fine = syntaxFields(edit(cwd, 'a.mjs', { old_string: '1', new_string: '2', replace_all: true }));
  assert.equal(fine, null);
  const half = syntaxFields(edit(cwd, 'a.mjs', { old_string: '= 1', new_string: '=', replace_all: true }));
  assert.equal(half.permissionDecision, 'deny');
});

test('Edit without replace_all changes only the first match', () => {
  const cwd = repo({ 'a.json': '{"a": 1, "b": 1}' });
  const input = edit(cwd, 'a.json', { old_string: '1', new_string: '1,' });
  assert.equal(postEditText(input), '{"a": 1,, "b": 1}');
  assert.equal(syntaxFields(input).permissionDecision, 'deny');
});

test('replacement text with dollar patterns is inserted literally', () => {
  const cwd = repo({ 'a.mjs': 'const x = 1;\n' });
  const input = edit(cwd, 'a.mjs', { old_string: '1', new_string: '"$&"' });
  assert.equal(postEditText(input), 'const x = "$&";\n');
});

test('MultiEdit applies each edit in order', () => {
  const cwd = repo({ 'a.mjs': 'const x = 1;\n' });
  const input = call(cwd, 'MultiEdit', {
    file_path: path.join(cwd, 'a.mjs'),
    edits: [{ old_string: 'x', new_string: 'y' }, { old_string: 'y = 1', new_string: 'y = (' }]
  });
  assert.equal(postEditText(input), 'const y = (;\n');
  assert.equal(syntaxFields(input).permissionDecision, 'deny');
});

test('an unmatched old_string or a missing file gives no decision', () => {
  const cwd = repo({ 'a.mjs': 'const x = 1;\n' });
  assert.equal(syntaxFields(edit(cwd, 'a.mjs', { old_string: 'nope', new_string: '(' })), null);
  assert.equal(syntaxFields(edit(cwd, 'gone.mjs', { old_string: 'a', new_string: '(' })), null);
});

test('.json is parsed', () => {
  const cwd = repo({});
  assert.equal(syntaxFields(write(cwd, 'a.json', '{"a": 1}')), null);
  const fields = syntaxFields(write(cwd, 'a.json', '{"a": }'));
  assert.equal(fields.permissionDecision, 'deny');
  assert.match(fields.permissionDecisionReason, /a\.json/);
});

test('frontmatter is checked for agents/ markdown and SKILL.md only', () => {
  const cwd = repo({});
  assert.equal(syntaxFields(write(cwd, 'agents/x.md', GOOD_AGENT)), null);
  const agent = syntaxFields(write(cwd, 'agents/x.md', 'no frontmatter\n'));
  assert.equal(agent.permissionDecision, 'deny');
  assert.match(agent.permissionDecisionReason, /frontmatter/);
  const skill = syntaxFields(write(cwd, 'skills/s/SKILL.md', 'no frontmatter\n'));
  assert.equal(skill.permissionDecision, 'deny');
  assert.equal(syntaxFields(write(cwd, 'docs/notes.md', 'no frontmatter\n')), null);
});

test('other file types give no decision', () => {
  const cwd = repo({});
  assert.equal(syntaxFields(write(cwd, 'a.py', 'def (:\n')), null);
});

test('only build-task and fix-review are checked', () => {
  const cwd = repo({});
  assert.equal(syntaxFields(as('exo:fix-review', write(cwd, 'a.mjs', 'const = 1;\n'))).permissionDecision, 'deny');
  assert.equal(syntaxFields(as('review-branch', write(cwd, 'a.mjs', 'const = 1;\n'))), null);
  assert.equal(syntaxFields(as(undefined, write(cwd, 'a.mjs', 'const = 1;\n'))), null);
});

test('other tools give no decision', () => {
  const cwd = repo({});
  assert.equal(syntaxFields(call(cwd, 'NotebookEdit', { file_path: path.join(cwd, 'a.mjs'), content: 'const = 1;' })), null);
});

test('dispatchEdit denies a broken edit and passes a good one', () => {
  const cwd = repo({});
  const denied = dispatchEdit(write(cwd, 'a.mjs', 'const = 1;\n'));
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  const allowed = dispatchEdit(write(cwd, 'a.mjs', 'export const x = 1;\n'));
  assert.notEqual(allowed?.hookSpecificOutput?.permissionDecision, 'deny');
});

test('a node --check that is killed on its timeout gives no decision', () => {
  const cwd = repo({});
  const real = childProcess.spawnSync;
  childProcess.spawnSync = () => ({ status: null, signal: 'SIGTERM', stderr: '', error: Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' }) });
  syncBuiltinESMExports();
  try {
    assert.equal(syntaxFields(write(cwd, 'a.mjs', 'export const x = 1;\n')), null);
  } finally {
    childProcess.spawnSync = real;
    syncBuiltinESMExports();
  }
});
