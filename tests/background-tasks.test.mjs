import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { hasPendingBackgroundTask } from '#background-tasks';

function transcript(rows) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'background-tasks-')), 'transcript.jsonl');
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  return file;
}

function toolResult(id, text) {
  return { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] } };
}

const agentLaunch = (id) => toolResult(id, 'Async agent launched successfully.\nagentId: a1');
const bashLaunch = (id) => toolResult(id, 'Command running in background with ID: b1. Output is being written to: /tmp/b1.output');
const notification = (id) => `<task-notification><task-id>x</task-id><tool-use-id>${id}</tool-use-id><status>completed</status></task-notification>`;

test('a launched agent with no notification is pending', () => {
  assert.equal(hasPendingBackgroundTask(transcript([agentLaunch('toolu_a')])), true);
});

test('a background Bash command with no notification is pending', () => {
  assert.equal(hasPendingBackgroundTask(transcript([bashLaunch('toolu_b')])), true);
});

test('a launch whose notification is only queued is pending', () => {
  const rows = [agentLaunch('toolu_a'), { type: 'queue-operation', operation: 'enqueue', content: notification('toolu_a') }];
  assert.equal(hasPendingBackgroundTask(transcript(rows)), true);
});

test('a launch notified through a queued_command attachment is not pending', () => {
  const rows = [agentLaunch('toolu_a'), { type: 'queue-operation', operation: 'enqueue', content: notification('toolu_a') }, { type: 'attachment', attachment: { type: 'queued_command', prompt: notification('toolu_a') } }];
  assert.equal(hasPendingBackgroundTask(transcript(rows)), false);
});

test('a launch notified through a user entry is not pending', () => {
  const rows = [bashLaunch('toolu_b'), { type: 'user', message: { content: notification('toolu_b') } }];
  assert.equal(hasPendingBackgroundTask(transcript(rows)), false);
});

test('one unnotified launch among notified ones is pending', () => {
  const rows = [agentLaunch('toolu_a'), agentLaunch('toolu_c'), { type: 'user', message: { content: notification('toolu_a') } }];
  assert.equal(hasPendingBackgroundTask(transcript(rows)), true);
});

test('a transcript with no launches has no pending task', () => {
  assert.equal(hasPendingBackgroundTask(transcript([toolResult('toolu_x', 'ok')])), false);
});

test('a missing transcript has no pending task', () => {
  assert.equal(hasPendingBackgroundTask(path.join(os.tmpdir(), 'no-such-dir', 'transcript.jsonl')), false);
  assert.equal(hasPendingBackgroundTask(undefined), false);
});
