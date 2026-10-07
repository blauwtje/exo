// resume-plan.mjs blocks a stop once while the plan named in the build
// marker has an open task; a clear or compaction starts no build by itself.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, planFixture, run, taskSection } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/build/scripts/resume-plan.mjs', import.meta.url));
const SESSION_HOOK = fileURLToPath(new URL('../hooks/session-start.mjs', import.meta.url));

const PLAN = planFixture({ tasks: [
  taskSection({ number: 1, title: 'Greet', files: ['- Create: `src/app.js`'], subject: 'feat(app): greet' }),
  taskSection({ number: 2, title: 'Style', dependsOn: 'Task 1', files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
] });

const SESSION_ID = 'build-session';
const HOUR_MS = 60 * 60 * 1000;

async function checkout({ marker, writtenAt = new Date() }) {
  const root = await gitRepository({ 'docs/plans/fixture.md': PLAN });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const markerPath = path.join(git(root, 'rev-parse', '--absolute-git-dir'), 'exo', 'build.active');
  if (marker) {
    await fs.mkdir(path.dirname(markerPath), { recursive: true });
    await fs.writeFile(markerPath, `${planPath}\n${root}\n${SESSION_ID}\n${writtenAt.toISOString()}\n`);
  }
  return { root, planPath, markerPath };
}

function stopInput(root, stopHookActive, sessionId = SESSION_ID) {
  return JSON.stringify({ hook_event_name: 'Stop', cwd: root, session_id: sessionId, stop_hook_active: stopHookActive });
}

async function exists(file) {
  return fs.access(file).then(() => true, () => false);
}

test('a stop with the marker and an open task blocks with the next task', async () => {
  const { root, planPath } = await checkout({ marker: true });
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): greet', '-m', 'Plan-task: 1');
  const result = await run(SCRIPT, ['stop'], { input: stopInput(root, false) });
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, 'block');
  assert.equal(output.reason, `exo:build step 3 on ${planPath}.`);
});

test('wait marks the run waiting, so the next stop does not block, and the stop after that blocks again', async () => {
  const { root, planPath } = await checkout({ marker: true });
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): greet', '-m', 'Plan-task: 1');
  const waitPath = path.join(git(root, 'rev-parse', '--absolute-git-dir'), 'exo', 'build.wait');
  const waitResult = await run(SCRIPT, ['wait'], { cwd: root });
  assert.equal(waitResult.code, 0, waitResult.stderr);
  assert.equal(waitResult.stdout, '');
  assert.equal(await exists(waitPath), true);

  const waitingStop = await run(SCRIPT, ['stop'], { input: stopInput(root, false) });
  assert.equal(waitingStop.code, 0, waitingStop.stderr);
  assert.equal(waitingStop.stdout, '');
  assert.equal(await exists(waitPath), false);

  const nextStop = await run(SCRIPT, ['stop'], { input: stopInput(root, false) });
  assert.equal(nextStop.code, 0, nextStop.stderr);
  const output = JSON.parse(nextStop.stdout);
  assert.equal(output.decision, 'block');
  assert.equal(output.reason, `exo:build step 3 on ${planPath}.`);
});

test('wait without a live marker writes nothing and leaves no mark', async () => {
  const { root } = await checkout({ marker: false });
  const waitPath = path.join(git(root, 'rev-parse', '--absolute-git-dir'), 'exo', 'build.wait');
  const result = await run(SCRIPT, ['wait'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(await exists(waitPath), false);
});

test('a stop that already follows a block does not block again', async () => {
  const { root } = await checkout({ marker: true });
  const result = await run(SCRIPT, ['stop'], { input: stopInput(root, true) });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('a stop without the marker does not block', async () => {
  const { root } = await checkout({ marker: false });
  const result = await run(SCRIPT, ['stop'], { input: stopInput(root, false) });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('a stop after every task landed does not block', async () => {
  const { root } = await checkout({ marker: true });
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): greet', '-m', 'Plan-task: 1');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): style', '-m', 'Plan-task: 2');
  const result = await run(SCRIPT, ['stop'], { input: stopInput(root, false) });
  assert.equal(result.stdout, '');
});

test('a stop with a marker older than six hours does not block and removes the marker', async () => {
  const { root, markerPath } = await checkout({ marker: true, writtenAt: new Date(Date.now() - 7 * HOUR_MS) });
  const result = await run(SCRIPT, ['stop'], { input: stopInput(root, false) });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(await exists(markerPath), false);
});

test('a stop from another session does not block and removes the marker', async () => {
  const { root, markerPath } = await checkout({ marker: true });
  const result = await run(SCRIPT, ['stop'], { input: stopInput(root, false, 'another-session') });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(await exists(markerPath), false);
});

async function sessionContext(root, source) {
  const home = await fixture();
  const stdout = execFileSync(process.execPath, [SESSION_HOOK], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', source, cwd: root, session_id: 'resume-plan-test' }),
    env: { ...process.env, CLAUDE_CONFIG_DIR: home },
    encoding: 'utf8'
  });
  return JSON.parse(stdout).hookSpecificOutput.additionalContext;
}

for (const source of ['clear', 'compact', 'startup']) {
  test(`the session hook on ${source} names no running plan`, async () => {
    const { root } = await checkout({ marker: true });
    const context = await sessionContext(root, source);
    assert.ok(!context.includes('A plan is running'), context.slice(0, 300));
  });
}

test('a stop does not block while a background launch is pending or only queued, and blocks once it has notified', async () => {
  const { root } = await checkout({ marker: true });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-plan-'));
  const launch = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_agent', content: 'Async agent launched successfully.' }] } };
  const text = '<task-notification><tool-use-id>toolu_agent</tool-use-id></task-notification>';
  const queued = { type: 'queue-operation', operation: 'enqueue', content: text };
  const notice = { type: 'user', message: { role: 'user', content: text } };
  const stopWith = async (rows) => {
    const transcriptPath = path.join(dir, `${rows.length}.jsonl`);
    await fs.writeFile(transcriptPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
    const input = { ...JSON.parse(stopInput(root, false)), transcript_path: transcriptPath };
    return run(SCRIPT, ['stop'], { input: JSON.stringify(input) });
  };
  assert.equal((await stopWith([launch])).stdout, '');
  assert.equal((await stopWith([launch, queued])).stdout, '');
  assert.equal(JSON.parse((await stopWith([launch, queued, notice])).stdout).decision, 'block');
});
