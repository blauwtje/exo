import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';
import { liveShells, shellStopDecision } from '../lib/live-shells.mjs';

const start = (toolId, command = 'npm test') => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: toolId, name: 'Bash', input: { command, run_in_background: true } }] } });
const started = (toolId, shellId) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: toolId, content: `Command running in background with ID: ${shellId}. Output is being written to: /tmp/${shellId}.output. You will be notified when it completes.` }] } });
const stop = (shellId) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `stop-${shellId}`, name: 'TaskStop', input: { task_id: shellId } }] } });
const finished = (shellId, status) => ({ type: 'user', message: { content: `<task-notification>\n<task-id>${shellId}</task-id>\n<status>${status}</status>\n</task-notification>` } });
const watch = (toolId) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: toolId, name: 'Monitor', input: { command: 'tail -f build.log | grep --line-buffered error', description: 'build errors', timeout_ms: 150000 } }] } });
const watching = (toolId, taskId) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: toolId, content: `Monitor started (task ${taskId}, expires in 2m 30s unless the source ends first; you get one notice at expiry — re-arm if you still need the watch). You will be notified on each event. Keep working — do not poll or sleep.` }] } });
const watchEvent = (taskId) => ({ type: 'attachment', attachment: { type: 'queued_command', prompt: `<task-notification>\n<task-id>${taskId}</task-id>\n<summary>Monitor event: "build errors"</summary>\n<event>1 error</event>\n</task-notification>` } });
const watchEnded = (taskId, status, summary) => ({ type: 'user', message: { content: `<task-notification>\n<task-id>${taskId}</task-id>\n<output-file>/tmp/${taskId}.output</output-file>\n<status>${status}</status>\n<summary>Monitor "build errors" ${summary}</summary>\n</task-notification>` } });
const foreground = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'fg', name: 'Bash', input: { command: 'ls' } }] } };

function transcript(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-shells-'));
  const file = path.join(dir, 'agent.jsonl');
  fs.writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  return file;
}

test('liveShells lists background shells that were started and neither stopped nor finished', () => {
  const file = transcript([start('t1'), started('t1', 'bg1'), start('t2'), started('t2', 'bg2'), start('t3'), started('t3', 'bg3'), start('t4'), started('t4', 'bg4'), foreground, stop('bg2'), finished('bg3', 'completed'), finished('bg4', 'running')]);
  assert.deepEqual(liveShells(file), ['bg1', 'bg4']);
});

test('liveShells is empty for a missing transcript, a foreground-only transcript and a failed or killed shell', () => {
  assert.deepEqual(liveShells(path.join(os.tmpdir(), 'exo-no-such-transcript.jsonl')), []);
  assert.deepEqual(liveShells(transcript([foreground])), []);
  assert.deepEqual(liveShells(transcript([start('t1'), started('t1', 'bg1'), start('t2'), started('t2', 'bg2'), finished('bg1', 'failed'), finished('bg2', 'killed')])), []);
});

const write = (file, extra) => ({ session_id: 's', agent_id: `shells-${process.pid}-${Math.random().toString(36).slice(2)}`, agent_transcript_path: file, tool_name: 'Write', tool_input: { file_path: '/repo/.exo/run/result.md', content: 'x' }, ...extra });

test('a result-file Write with a live background shell is refused once, naming the shell, then passes', () => {
  const file = transcript([start('t1'), started('t1', 'bg1')]);
  const input = write(file);
  const first = shellStopDecision(input);
  assert.match(first.deny, /TaskStop/);
  assert.match(first.deny, /bg1/);
  assert.equal(shellStopDecision(input), null);
});

test('a result-file Write passes once the shell is stopped', () => {
  const file = transcript([start('t1'), started('t1', 'bg1'), stop('bg1')]);
  assert.equal(shellStopDecision(write(file)), null);
});

test('only an agent Write to a result file is checked', () => {
  const file = transcript([start('t1'), started('t1', 'bg1')]);
  assert.equal(shellStopDecision(write(file, { agent_id: undefined })), null);
  assert.equal(shellStopDecision(write(file, { tool_name: 'Edit' })), null);
  assert.equal(shellStopDecision(write(file, { tool_input: { file_path: '/repo/lib/x.mjs' } })), null);
});

test('the edit dispatcher runs the shell-stop check and denies the result-file Write', () => {
  const file = transcript([start('t1'), started('t1', 'bg1')]);
  const output = dispatchEdit(write(file), () => false);
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /TaskStop/);
});

test('shell-stop adds no hook entry', () => {
  const hooks = JSON.parse(fs.readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(JSON.stringify(hooks), /live-shells/);
  assert.equal(hooks.hooks.PreToolUse.filter((entry) => entry.matcher === 'Edit|Write|MultiEdit').length, 1);
});

test('liveShells also lists a Monitor that was started and neither stopped nor ended', () => {
  const file = transcript([start('t1'), started('t1', 'bg1'), watch('m1'), watching('m1', 'mon1'), watchEvent('mon1'), watch('m2'), watching('m2', 'mon2'), watch('m3'), watching('m3', 'mon3'), watch('m4'), watching('m4', 'mon4'), watchEvent('mon4'), stop('mon2'), watchEnded('mon3', 'completed', 'stream ended'), watchEnded('mon4', 'failed', 'script failed (exit 1)')]);
  assert.deepEqual(liveShells(file), ['bg1', 'mon1']);
});

test('a Monitor event notice does not end the Monitor or a shell named after it', () => {
  const file = transcript([watch('m1'), watching('m1', 'mon1'), start('t1'), started('t1', 'bg1'), { type: 'user', message: { content: `<task-notification>\n<task-id>mon1</task-id>\n<summary>Monitor event: "x"</summary>\n<event>ok</event>\n</task-notification>\n<task-notification>\n<task-id>bg1</task-id>\n<status>completed</status>\n</task-notification>` } }]);
  assert.deepEqual(liveShells(file), ['mon1']);
});
