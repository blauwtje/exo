import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';
import { liveShells, shellStopDecision } from '../lib/live-shells.mjs';
import { tempDir } from './harness.mjs';

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
  const dir = tempDir('exo-shells-');
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

const write = (file, extra) => ({ session_id: `s-${process.pid}-${Math.random()}`, agent_id: `shells-${process.pid}-${Math.random().toString(36).slice(2)}`, agent_transcript_path: file, tool_name: 'Write', tool_input: { file_path: '/repo/.exo/run/result.md', content: 'x' }, ...extra });

test('a result-file Write with a live background shell is refused once, naming the shell, then passes', () => {
  const file = transcript([start('t1'), started('t1', 'bg1')]);
  const input = write(file);
  const first = shellStopDecision(input);
  assert.match(first.deny, /Background shells/);
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
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Background shells/);
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

test('liveShells lists a foreground Bash command the harness moved to the background', () => {
  const moved = (toolId, shellId, why) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: toolId, content: `Command ${why.replace('ID', `ID: ${shellId}`)}. Output is being written to: /tmp/${shellId}.output.` }] } });
  const file = transcript([
    foreground,
    moved('fg', 'bg1', 'was moved to the background (ID) after running for 180s'),
    { ...foreground, message: { content: [{ ...foreground.message.content[0], id: 'fg2' }] } },
    moved('fg2', 'bg2', 'did not complete within its 120s timeout and was moved to the background (ID)'),
    { ...foreground, message: { content: [{ ...foreground.message.content[0], id: 'fg3' }] } },
    moved('fg3', 'bg3', 'was moved to the background (ID) so that a message that arrived while it was running can reach you; it was not interrupted'),
    finished('bg2', 'completed')
  ]);
  assert.deepEqual(liveShells(file), ['bg1', 'bg3']);
});

test('a Bash redirect or tee to the result file is refused once while a shell runs', () => {
  const file = transcript([start('t1'), started('t1', 'bg1')]);
  const input = write(file, { tool_name: 'Bash', tool_input: { command: "cat > /repo/.exo/run/result.md <<'EOF'\nx\nEOF" } });
  assert.match(shellStopDecision(input).deny, /bg1/);
  assert.equal(shellStopDecision(input), null);
  const tee = write(file, { tool_name: 'Bash', tool_input: { command: 'echo x | tee -a /repo/.exo/run/result.md' } });
  assert.ok(shellStopDecision(tee));
});

test('the Bash dispatcher refuses a redirect to the result file while a shell runs', async () => {
  const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
  const file = transcript([start('t1'), started('t1', 'bg1')]);
  const input = write(file, { tool_name: 'Bash', cwd: process.cwd(), tool_input: { command: 'cat > /repo/.exo/run/result.md <<EOF\nx\nEOF' } });
  const output = await dispatchBash(input);
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /bg1/);
});

test('a Bash command writing no result file passes while a shell runs', () => {
  const file = transcript([start('t1'), started('t1', 'bg1')]);
  assert.equal(shellStopDecision(write(file, { tool_name: 'Bash', tool_input: { command: 'echo x > /tmp/a.txt' } })), null);
});

test('a scratch .exo write does not spend the refusal before the brief Result path', () => {
  const brief = { type: 'user', message: { content: 'Task\nResult: .exo/run/result.md' } };
  const file = transcript([brief, start('t1'), started('t1', 'bg1')]);
  const scratch = write(file, { tool_input: { file_path: '/repo/.exo/notes.md', content: 'x' } });
  assert.equal(shellStopDecision(scratch), null);
  const result = { ...scratch, tool_input: { file_path: '/repo/.exo/run/result.md', content: 'x' } };
  assert.match(shellStopDecision(result).deny, /bg1/);
});

test('the shell-stop step spends no refusal under an earlier deny', async () => {
  const { SHELL_STOP_STEP } = await import('../lib/lazy-steps.mjs');
  const file = transcript([start('t1'), started('t1', 'bg1')]);
  const input = write(file, { tool_name: 'Bash', tool_input: { command: 'echo x > /repo/.exo/run/result.md' } });
  assert.equal(await SHELL_STOP_STEP.run(input, [{ permissionDecision: 'deny' }]), null);
  const refused = await SHELL_STOP_STEP.run(input, []);
  assert.match(refused.hookSpecificOutput.permissionDecisionReason, /bg1/);
});

test('a Result path named only by a tool result is not the brief Result path', () => {
  const brief = { type: 'user', message: { content: 'Task\nResult: the path above' } };
  const read = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'r1', content: 'Result: .exo/other-task.md' }] } };
  const file = transcript([brief, read, start('t1'), started('t1', 'bg1')]);
  const result = write(file, { tool_input: { file_path: '/repo/.exo/run/answer.md', content: 'x' } });
  assert.match(shellStopDecision(result).deny, /bg1/);
});

test('a background start counts only in the first line of a Bash result', () => {
  const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/refusals/live-shells.json', import.meta.url), 'utf8'));
  for (const row of rows) {
    const result = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: row.result }] } };
    const quoted = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: `ls output\n${row.result}` }] } };
    assert.equal(liveShells(transcript([start('t1'), result])).length, row.live ? 1 : 0, row.result);
    assert.deepEqual(liveShells(transcript([start('t1'), quoted])), []);
  }
});
