// The Stop dispatcher runs proof-check, resume-plan and terse-check in
// one process: a fault in one handler leaves the rest running, and the first
// block wins, with proof-check before resume-plan, which a proof-check block skips.

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
