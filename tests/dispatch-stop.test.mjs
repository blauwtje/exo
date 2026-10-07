// The Stop dispatcher runs proof-check, resume-plan and terse-check in
// one process: a fault in one handler leaves the rest running, and the first
// block wins, with proof-check before resume-plan, which a proof-check block skips;
// proof-check's ceiling systemMessage skips nothing and still reaches stdout.

import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { dispatchStop } from '../hooks/dispatch-stop.mjs';
import { stopHook as proofCheck } from '../skills/build/scripts/proof-check.mjs';

// In-process calls write state under the config directory, so point it at a scratch one.
process.env.CLAUDE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-stop-inprocess-'));

const execFileAsync = promisify(execFile);
const DISPATCHER = fileURLToPath(new URL('../hooks/dispatch-stop.mjs', import.meta.url));

function sandbox() {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-stop-config-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-stop-project-'));
  return { config, project };
}

function line(entry) {
  return `${JSON.stringify(entry)}\n`;
}

// A transcript where exo:build ran and the last reply claims done with no proof.
function unprovenTranscript(directory) {
  const file = path.join(directory, 'transcript.jsonl');
  const build = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Skill', input: { skill: 'exo:build' } }] } };
  const reply = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Task 1: GREEN. All tests pass.' }] } };
  fs.writeFileSync(file, line(build) + line(reply));
  return file;
}

async function dispatch(box, input) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: box.config, CLAUDE_PROJECT_DIR: box.project };
  const child = execFileAsync(process.execPath, [DISPATCHER], { env, cwd: box.project });
  child.child.stdin.end(input);
  return child;
}

test('a turn no handler objects to writes nothing', async () => {
  const box = sandbox();
  const { stdout } = await dispatch(box, JSON.stringify({ session_id: 's1', cwd: box.project }));
  assert.equal(stdout, '');
  assert.equal(dispatchStop({ session_id: 's1', cwd: box.project }), null);
});

test('the proof-check block is written as one hook output object', async () => {
  const box = sandbox();
  const input = { session_id: 's2', cwd: box.project, transcript_path: unprovenTranscript(box.project) };
  const expected = proofCheck(input);
  assert.equal(expected.decision, 'block');
  const { stdout } = await dispatch(box, JSON.stringify(input));
  assert.deepEqual(JSON.parse(stdout), expected);
  assert.equal(stdout.trim().split('\n').length, 1);
});

test('the block survives a handler that throws on a null cwd', () => {
  const box = sandbox();
  const input = { session_id: 's3', cwd: box.project, transcript_path: unprovenTranscript(box.project) };
  assert.deepEqual(dispatchStop(input), proofCheck(input));
  // A null cwd can make a handler throw; the dispatcher still returns the proof-check block.
  assert.deepEqual(dispatchStop({ ...input, cwd: null }), proofCheck({ ...input, cwd: null }));
});

test('unreadable input exits 0 with nothing on stdout', async () => {
  const box = sandbox();
  const { stdout } = await dispatch(box, 'not json');
  assert.equal(stdout, '');
});

test('a proof-check block leaves the resume-plan wait marker in place', () => {
  const box = sandbox();
  execFileSync('git', ['init', '--quiet'], { cwd: box.project });
  const waitMarker = path.join(box.project, '.git', 'exo', 'build.wait');
  fs.mkdirSync(path.dirname(waitMarker), { recursive: true });
  fs.writeFileSync(waitMarker, '');
  const input = { session_id: 's4', cwd: box.project, transcript_path: unprovenTranscript(box.project) };
  assert.equal(dispatchStop(input).decision, 'block');
  assert.equal(fs.existsSync(waitMarker), true);
});

test('an agent whose notification is only queued draws no block until the lead receives it', async () => {
  const box = sandbox();
  const transcriptPath = path.join(box.project, 'transcript.jsonl');
  const build = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Skill', input: { skill: 'exo:build' } }] } };
  const launch = { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_agent', content: 'Async agent launched successfully.' }] } };
  const text = '<task-notification><tool-use-id>toolu_agent</tool-use-id><status>completed</status></task-notification>';
  const queued = { type: 'queue-operation', operation: 'enqueue', content: text };
  const reply = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Task 1 GREEN. Waiting on task 2.' }] } };
  fs.writeFileSync(transcriptPath, line(build) + line(launch) + line(queued) + line(reply));
  const input = { session_id: 's6', cwd: box.project, transcript_path: transcriptPath };
  assert.equal((await dispatch(box, JSON.stringify(input))).stdout, '');
  fs.appendFileSync(transcriptPath, line({ type: 'user', message: { role: 'user', content: text } }) + line(reply));
  assert.equal(dispatchStop(input).decision, 'block');
});

// A transcript where a never-run proof drew five proof-check blocks and the last reply still names it.
function ceilingTranscript(directory) {
  const file = path.join(directory, 'transcript.jsonl');
  const build = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Skill', input: { skill: 'exo:build' } }] } };
  const reply = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '**Done:** wired.\nProof: node bin/report.js -> ok' }] } };
  const feedback = { type: 'user', isMeta: true, message: { role: 'user', content: 'Stop hook feedback:\nexo proof-check: No call this build turn backs "node bin/report.js".' } };
  fs.writeFileSync(file, line(build) + line(reply) + (line(feedback) + line(reply)).repeat(5));
  return file;
}

test('the proof-check ceiling systemMessage reaches stdout and leaves resume-plan running', async () => {
  const box = sandbox();
  execFileSync('git', ['init', '--quiet'], { cwd: box.project });
  const waitMarker = path.join(box.project, '.git', 'exo', 'build.wait');
  fs.mkdirSync(path.dirname(waitMarker), { recursive: true });
  fs.writeFileSync(waitMarker, '');
  const input = { session_id: 's5', cwd: box.project, transcript_path: ceilingTranscript(box.project) };
  const expected = { systemMessage: 'exo proof-check: report not verified; Unverified: node bin/report.js (no matching call after 5 blocks)' };
  assert.deepEqual(dispatchStop(input), expected);
  assert.equal(fs.existsSync(waitMarker), false);
  const { stdout } = await dispatch(box, JSON.stringify(input));
  assert.deepEqual(JSON.parse(stdout), expected);
});
