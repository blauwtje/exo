import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { commentDecision, DENY_MARKER } from '../hooks/comment-guard.mjs';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';

const DISPATCHER = path.join(import.meta.dirname, '..', 'hooks', 'dispatch-edit.mjs');
let counter = 0;

function freshSession() {
  counter += 1;
  return `cg-${process.pid}-${Date.now()}-${counter}`;
}

function editInput(toolInput, extra = {}) {
  return { tool_name: 'Edit', session_id: freshSession(), tool_input: { file_path: '/tmp/x/app.mjs', ...toolInput }, ...extra };
}

test('an edit that adds a comment line is denied with the marker, the line and the allowed list', () => {
  const output = commentDecision(editInput({ old_string: 'a();', new_string: 'a();\n// call a\nb();' }));
  assert.equal(output.permissionDecision, 'deny');
  assert.ok(output.permissionDecisionReason.startsWith(DENY_MARKER));
  assert.match(output.permissionDecisionReason, /\/\/ call a/);
  assert.match(output.permissionDecisionReason, /license header/);
  assert.match(output.permissionDecisionReason, /remove the comment or make the code clearer/i);
});

test('a comment line already in old_string is not new', () => {
  const output = commentDecision(editInput({ old_string: '// keep\na();', new_string: '// keep\nb();' }));
  assert.equal(output?.permissionDecision, undefined);
});

test('a why: comment is allowed', () => {
  const output = commentDecision(editInput({ old_string: 'a();', new_string: '// why: the platform needs it\na();' }));
  assert.equal(output?.permissionDecision, undefined);
});

test('a Write is checked against the file on disk', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-cg-'));
  try {
    const file = path.join(folder, 'old.mjs');
    fs.writeFileSync(file, '// kept\na();\n');
    const kept = commentDecision({ tool_name: 'Write', session_id: freshSession(), tool_input: { file_path: file, content: '// kept\nb();\n' } });
    assert.equal(kept?.permissionDecision, undefined);
    const added = commentDecision({ tool_name: 'Write', session_id: freshSession(), tool_input: { file_path: file, content: '// kept\n// new\nb();\n' } });
    assert.equal(added.permissionDecision, 'deny');
    const created = commentDecision({ tool_name: 'Write', session_id: freshSession(), tool_input: { file_path: path.join(folder, 'new.mjs'), content: '// hi\nb();\n' } });
    assert.equal(created.permissionDecision, 'deny');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('each MultiEdit edit is checked', () => {
  const output = commentDecision({
    tool_name: 'MultiEdit',
    session_id: freshSession(),
    tool_input: { file_path: '/tmp/x/app.mjs', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: 'c\n// note' }] }
  });
  assert.equal(output.permissionDecision, 'deny');
});

test('a prose file is not checked and gets no code standard', () => {
  const output = commentDecision(editInput({ file_path: '/tmp/x/notes.md', old_string: 'a', new_string: '// not code' }));
  assert.equal(output, null);
});

test('the first code edit per session and agent adds the code standard, never an allow', () => {
  const input = editInput({ old_string: 'a();', new_string: 'b();' }, { agent_id: 'ag1' });
  const first = commentDecision(input);
  assert.match(first.additionalContext, /No comments/);
  assert.equal(first.permissionDecision, undefined);
  assert.equal(commentDecision(input), null);
  const other = commentDecision({ ...input, agent_id: 'ag2' });
  assert.match(other.additionalContext, /No comments/);
});

test('a session or agent id that is not a file-name shape gets no standard and writes no state', () => {
  const input = editInput({ old_string: 'a();', new_string: 'b();' }, { session_id: '../escape' });
  assert.equal(commentDecision(input), null);
  assert.equal(commentDecision({ ...input, session_id: freshSession(), agent_id: 'a/b' }), null);
});

test('a denied edit does not use up the standard', () => {
  const input = editInput({ old_string: 'a();', new_string: '// x\nb();' });
  assert.equal(commentDecision(input).permissionDecision, 'deny');
  const clean = { ...input, tool_input: { ...input.tool_input, new_string: 'b();' } };
  assert.match(commentDecision(clean).additionalContext, /No comments/);
});

test('the dispatcher prints the deny as PreToolUse JSON, and nothing for a clean prose edit', () => {
  const run = (input) => spawnSync(process.execPath, [DISPATCHER], { input: JSON.stringify(input), encoding: 'utf8' });
  const denied = run(editInput({ old_string: 'a();', new_string: '// x\nb();' }));
  assert.equal(denied.status, 0);
  const parsed = JSON.parse(denied.stdout).hookSpecificOutput;
  assert.equal(parsed.hookEventName, 'PreToolUse');
  assert.equal(parsed.permissionDecision, 'deny');
  const prose = run(editInput({ file_path: '/tmp/x/notes.md', old_string: 'a', new_string: '// b' }));
  assert.equal(prose.stdout, '');
  assert.equal(run({}).stdout, '');
});

test('dispatchEdit returns the guard deny as one PreToolUse output', () => {
  const output = dispatchEdit(editInput({ old_string: 'a();', new_string: '// x\nb();' }));
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
});
