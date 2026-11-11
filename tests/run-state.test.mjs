import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { appendStep, createRun, journalFile, listRuns, opsFile, readJournal, readState, resumePoint, runDir } from '../skills/build/scripts/run-state.mjs';
import { noteAttempt, noteSession, replayedSession, restoreResume, takePending } from '../skills/build/scripts/run-plan-resume.mjs';
import { tempDir } from './harness.mjs';

function repo() {
  const root = tempDir('exo-run-state-');
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'base'], { cwd: root });
  return root;
}

function inRun(root, id, body) {
  const before = process.env.EXO_RUN_DIR;
  process.env.EXO_RUN_DIR = runDir(root, id);
  try {
    return body();
  } finally {
    if (before === undefined) delete process.env.EXO_RUN_DIR;
    else process.env.EXO_RUN_DIR = before;
  }
}

const context = (root) => ({ root, planId: 'p', planAtStart: 'hash', plan: { tasks: [{ number: 1, title: 't', files: [] }, { number: 2, title: 'u', files: [] }] }, fingerprints: new Map(), failedAttempts: 0, retryNote: '', resumed: null });

test('a step lands in the journal and in the status record the board reads', () => {
  const root = repo();
  createRun(root, { id: 'r1', plan: 'docs/plans/x.md' });
  appendStep(root, 'r1', { kind: 'task-start', task: 2 });
  assert.deepEqual(readJournal(root, 'r1').map((s) => [s.kind, s.task]), [['task-start', 2]]);
  const [run] = listRuns(root);
  assert.equal(run.step.kind, 'task-start');
  assert.equal(run.step.task, 2);
  assert.equal(path.join(runDir(root, 'r1'), run.journal), journalFile(root, 'r1'));
  assert.equal(path.join(runDir(root, 'r1'), readState(root, 'r1').ops), opsFile(root, 'r1'));
});

test('the journal folds to the one finished session that nothing settled', () => {
  const steps = [{ kind: 'task-start', task: 1 }, { kind: 'session', task: 1, last: 'a' }, { kind: 'check', task: 1, passed: false }, { kind: 'attempt', task: 1, failedAttempts: 1, fingerprints: ['f'] }, { kind: 'task-start', task: 1 }, { kind: 'session', task: 1, last: 'b' }];
  const point = resumePoint(steps);
  assert.equal(point.pending.last, 'b');
  assert.equal(point.failedAttempts, 1);
  assert.deepEqual([...point.attempts.keys()], [1]);
  const done = resumePoint([...steps, { kind: 'commit', task: 1 }]);
  assert.equal(done.pending, null);
  assert.equal(done.attempts.size, 0);
});

test('a resumed run replays a finished session instead of spawning it again', () => {
  const root = repo();
  createRun(root, { id: 'r2', plan: 'docs/plans/x.md' });
  inRun(root, 'r2', () => noteSession(context(root), 2, { outcome: { timedOut: false }, parsed: { sessionId: 's9', cost: 0.5, model: 'm' }, last: 'Task 2: DONE', marker: null }));
  const second = context(root);
  inRun(root, 'r2', () => restoreResume(second, new Map(), new Set()));
  assert.equal(takePending(second, 1), null);
  const step = takePending(second, 2);
  assert.equal(step.last, 'Task 2: DONE');
  assert.equal(takePending(second, 2), null);
  const replay = replayedSession(second, step);
  assert.equal(replay.parsed.resultText, 'Task 2: DONE');
  assert.equal(replay.parsed.sessionId, 's9');
  assert.equal(replay.outcome.timedOut, false);
});

test('a replayed session clears the model switch of the session before it', () => {
  const root = repo();
  const ctx = { ...context(root), sessionFallback: { from: 'sonnet', to: 'haiku' } };
  replayedSession(ctx, { last: 'Task 2: DONE', sessionId: 's9', model: 'm' });
  assert.equal(ctx.sessionFallback, null);
});

test('a resumed run keeps the failed attempts of the task it was in', () => {
  const root = repo();
  createRun(root, { id: 'r3', plan: 'docs/plans/x.md' });
  const first = context(root);
  first.failedAttempts = 2;
  first.fingerprints.set(1, new Set(['a', 'b']));
  inRun(root, 'r3', () => noteAttempt(first, 1, { sessionId: 's1', retryNote: '\nretry', freeTried: true }));
  const failed = new Map();
  const free = new Set();
  const second = context(root);
  inRun(root, 'r3', () => restoreResume(second, failed, free));
  assert.equal(second.failedAttempts, 2);
  assert.deepEqual([...second.fingerprints.get(1)], ['a', 'b']);
  assert.equal(failed.get(1), 's1');
  assert.ok(free.has(1));
  assert.equal(second.retryNote, '\nretry');
});

test('a changed plan or a timed out session is not replayed', () => {
  const root = repo();
  createRun(root, { id: 'r4', plan: 'docs/plans/x.md' });
  const first = context(root);
  inRun(root, 'r4', () => noteSession(first, 1, { outcome: { timedOut: true }, parsed: {}, last: 'timed out', marker: null }));
  const timedOut = context(root);
  inRun(root, 'r4', () => restoreResume(timedOut, new Map(), new Set()));
  assert.equal(timedOut.resumed.pending, null);
  inRun(root, 'r4', () => noteSession(first, 1, { outcome: { timedOut: false }, parsed: {}, last: 'x', marker: null }));
  const drifted = { ...context(root), planAtStart: 'other' };
  inRun(root, 'r4', () => restoreResume(drifted, new Map(), new Set()));
  assert.equal(drifted.resumed.pending, null);
});

test('resumePoint keeps each gate step with its tree and leaves a pending session open', () => {
  const point = resumePoint([{ kind: 'session', task: 1 }, { kind: 'gate-step', step: 'checks', tree: 't1' }]);
  assert.equal(point.gateSteps.get('checks'), 't1');
  assert.equal(point.pending.task, 1);
});
