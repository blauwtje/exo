// The runtime log keeps a test-like command that ran longer than the threshold,
// keyed by project, and forgets one unused for 30 days. Each test points the
// heavy cache root at a temporary directory.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  isLearnable,
  lastDuration,
  learnedCommands,
  projectOf,
  recordFinish,
  recordStart,
  touchLearned,
  wholeSuiteKeys,
  runtimeFile
} from '../lib/runtime-log.mjs';

const HOOK = fileURLToPath(new URL('../hooks/record-runtime.mjs', import.meta.url));
const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-01-01T00:00:00Z');

function withCache(body) {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-log-'));
  const saved = process.env.EXO_HEAVY_CACHE;
  process.env.EXO_HEAVY_CACHE = cache;
  try {
    return body(cache);
  } finally {
    if (saved === undefined) delete process.env.EXO_HEAVY_CACHE;
    else process.env.EXO_HEAVY_CACHE = saved;
    fs.rmSync(cache, { recursive: true, force: true });
  }
}

function run(command, { project = '/p', seconds, threshold = 60, session = 's1', startAt = T0 }) {
  recordStart({ sessionId: session, command, now: startAt });
  return recordFinish({
    sessionId: session,
    command,
    project,
    thresholdSeconds: threshold,
    now: startAt + seconds * 1000
  });
}

test('a test-like command over the threshold is learned for its project', () => {
  withCache(() => {
    const entry = run('npm test', { seconds: 90 });
    assert.equal(entry.seconds, 90);
    assert.equal(entry.lastUsed, new Date(T0 + 90_000).toISOString());
    assert.deepEqual(Object.keys(learnedCommands('/p')), ['npm test']);
    assert.deepEqual(learnedCommands('/other'), {});
  });
});

test('a run at or under the threshold learns nothing', () => {
  withCache(() => {
    assert.equal(run('npm test', { seconds: 60 }), null);
    assert.equal(run('npm test', { seconds: 5 }), null);
    assert.deepEqual(learnedCommands('/p'), {});
  });
});

test('a command that is not test-like is never learned', () => {
  withCache(() => {
    assert.equal(run('npm install', { seconds: 300 }), null);
    assert.equal(run('npm run build', { seconds: 300 }), null);
    assert.deepEqual(learnedCommands('/p'), {});
  });
});

test('watch, ui and dev modes are never learned', () => {
  for (const command of ['npm test --watch', 'playwright test --ui', 'playwright test --headed', 'npm run test dev', 'npm run test serve', 'npm run test start', 'npm install -D eslint', 'git checkout main', 'npm run build && npm test', 'EXO_HEAVY_FORCE=1 npm test']) {
    assert.equal(isLearnable(command), false, command);
  }
  for (const command of ['npm test', 'npm run e2e', 'cargo check', 'eslint .  # lint', 'make verify', 'pytest', 'npx vitest run']) {
    assert.equal(isLearnable(command), true, command);
  }
});

test('a shell wait loop or sleep is never learned', () => {
  for (const command of ['until gh pr checks 12 | grep -q pass; do sleep 30; done', 'until grep -q SUMMARY /tmp/check.log; do sleep 5; done', 'while ! npm test; do :; done', 'sleep 60 && npm test']) {
    assert.equal(isLearnable(command), false, command);
  }
  for (const command of ['npm test', 'pytest', 'npm run check']) {
    assert.equal(isLearnable(command), true, command);
  }
});

test('a command that reads remote state is never learned', () => {
  for (const command of ['gh pr checks 12', 'curl https://x/health-check', 'curl -s https://ci/api/test-results', 'ssh host npm test', 'FOO=1 gh run watch', 'npm test && git fetch', 'kubectl rollout status deploy/check']) {
    assert.equal(isLearnable(command), false, command);
  }
});

test('only the program or its script or subcommand counts as test-like', () => {
  for (const command of ['npm test', 'npm run check', 'pnpm vitest', 'pytest -x', 'go test ./...', 'cargo test', 'make lint', 'npx eslint .', 'python -m pytest', 'CI=1 npm test', 'uv run pytest', 'npm test 2>&1 | tail -5']) {
    assert.equal(isLearnable(command), true, command);
  }
  for (const command of ['node scripts/test-data.mjs', 'cat tests/a.test.mjs']) {
    assert.equal(isLearnable(command), false, command);
  }
});

test('touchLearned refreshes lastUsed of a learned command and ignores an unknown one', () => {
  withCache(() => {
    run('npm test', { seconds: 90 });
    touchLearned({ project: '/p', command: 'npm test', now: T0 + 20 * DAY_MS });
    touchLearned({ project: '/p', command: 'npm run lint', now: T0 + 20 * DAY_MS });
    assert.deepEqual(Object.keys(learnedCommands('/p')), ['npm test']);
    assert.equal(learnedCommands('/p')['npm test'].lastUsed, new Date(T0 + 20 * DAY_MS).toISOString());
    assert.equal(learnedCommands('/p')['npm test'].seconds, 90);
  });
});

test('touchLearned keeps the whole-suite duration of a learned command from the 30-day drop', () => {
  withCache(() => {
    run('npm test', { seconds: 90 });
    touchLearned({ project: '/p', command: 'npm test', now: T0 + 20 * DAY_MS });
    run('npm run lint', { seconds: 1, startAt: T0 + 40 * DAY_MS });
    assert.equal(lastDuration('/p', 'npm test'), 90);
  });
});

test('a finish with no start record learns nothing', () => {
  withCache(() => {
    const entry = recordFinish({ sessionId: 's1', command: 'npm test', project: '/p', thresholdSeconds: 60, now: T0 });
    assert.equal(entry, null);
    assert.deepEqual(learnedCommands('/p'), {});
  });
});

test('a start belongs to its session', () => {
  withCache(() => {
    recordStart({ sessionId: 's1', command: 'npm test', now: T0 });
    const entry = recordFinish({ sessionId: 's2', command: 'npm test', project: '/p', thresholdSeconds: 60, now: T0 + 90_000 });
    assert.equal(entry, null);
  });
});

test('a threshold of 0 learns nothing', () => {
  withCache(() => {
    assert.equal(run('npm test', { seconds: 90, threshold: 0 }), null);
    assert.deepEqual(learnedCommands('/p'), {});
  });
});

test('a later fast run keeps the command learned and refreshes its last use', () => {
  withCache(() => {
    run('npm test', { seconds: 90 });
    const entry = run('npm test', { seconds: 1, startAt: T0 + DAY_MS });
    assert.equal(entry.seconds, 90);
    assert.equal(entry.lastUsed, new Date(T0 + DAY_MS + 1000).toISOString());
    assert.equal(learnedCommands('/p')['npm test'].seconds, 90);
  });
});

test('a write drops entries unused for 30 days and keeps newer ones', () => {
  withCache(() => {
    run('npm test', { seconds: 90 });
    run('npm run e2e', { seconds: 90, startAt: T0 + 20 * DAY_MS });
    run('npm run lint', { seconds: 90, project: '/q', startAt: T0 + 40 * DAY_MS });
    assert.deepEqual(Object.keys(learnedCommands('/p')), ['npm run e2e']);
    assert.deepEqual(Object.keys(learnedCommands('/q')), ['npm run lint']);
  });
});

test('the log lives in runtimes.json under the heavy cache root', () => {
  withCache((cache) => {
    run('npm test', { seconds: 90 });
    assert.equal(runtimeFile(), path.join(cache, 'runtimes.json'));
    const log = JSON.parse(fs.readFileSync(runtimeFile(), 'utf8'));
    assert.deepEqual(Object.keys(log.learned['/p']), ['npm test']);
    assert.deepEqual(log.starts, {});
  });
});

test('a log that does not parse is rebuilt by the next write', () => {
  withCache(() => {
    fs.writeFileSync(runtimeFile(), '{broken');
    assert.deepEqual(learnedCommands('/p'), {});
    assert.equal(run('npm test', { seconds: 90 }).seconds, 90);
  });
});

test('the tool duration, not the time since the start, decides learning', () => {
  withCache(() => {
    const finish = (durationMs) =>
      recordFinish({ sessionId: 's1', command: 'npm test', project: '/p', thresholdSeconds: 60, durationMs, now: T0 + 120_000 });
    recordStart({ sessionId: 's1', command: 'npm test', now: T0 });
    assert.equal(finish(2_000), null);
    assert.deepEqual(learnedCommands('/p'), {});
    recordStart({ sessionId: 's1', command: 'npm test', now: T0 });
    assert.equal(finish(90_000).seconds, 90);
  });
});

test('the project is CLAUDE_PROJECT_DIR, else the hook input cwd', () => {
  const saved = process.env.CLAUDE_PROJECT_DIR;
  try {
    delete process.env.CLAUDE_PROJECT_DIR;
    assert.equal(projectOf({ cwd: '/from-cwd' }), '/from-cwd');
    process.env.CLAUDE_PROJECT_DIR = '/from-env';
    assert.equal(projectOf({ cwd: '/from-cwd' }), '/from-env');
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = saved;
  }
});

function runHook(input, cache) {
  const env = { ...process.env, EXO_HEAVY_CACHE: cache, CLAUDE_PROJECT_DIR: '/p' };
  return spawnSync('node', [HOOK], { input, env, encoding: 'utf8' });
}

// Runs the recorder on a Bash call to `npm test` whose start was booked
// `waitedMs` ago, with `heavy_after_seconds` at 60 in a temporary project.
function runHookAfterStart({ waitedMs, durationMs, settings = { heavy_after_seconds: 60 }, command = 'npm test' }) {
  return withCache((cache) => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-project-'));
    try {
      fs.mkdirSync(path.join(project, '.claude'));
      fs.writeFileSync(path.join(project, '.claude', 'exo.json'), JSON.stringify(settings));
      recordStart({ sessionId: 's1', command, now: Date.now() - waitedMs });
      const input = JSON.stringify({ tool_name: 'Bash', session_id: 's1', cwd: project, tool_input: { command }, duration_ms: durationMs });
      const env = { ...process.env, EXO_HEAVY_CACHE: cache, CLAUDE_CONFIG_DIR: project, CLAUDE_PROJECT_DIR: project };
      const result = spawnSync('node', [HOOK], { input, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return { learned: learnedCommands(project), duration: lastDuration(project, command) };
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });
}

test('the hook learns a command whose duration_ms is over the threshold', () => {
  assert.equal(runHookAfterStart({ waitedMs: 0, durationMs: 90_000 }).learned['npm test'].seconds, 90);
});

test('the hook leaves a permission wait before a fast run out of the duration', () => {
  assert.deepEqual(runHookAfterStart({ waitedMs: 120_000, durationMs: 2_000 }).learned, {});
});

test('the hook falls back to the time since the start without duration_ms', () => {
  assert.ok(runHookAfterStart({ waitedMs: 120_000 }).learned['npm test'].seconds >= 120);
});

test('the hook records a whole-suite duration with learning off while the suite guard is on, and nothing with both off', () => {
  const on = runHookAfterStart({ waitedMs: 0, durationMs: 33_000, settings: { heavy_after_seconds: 0, subagent_suite_after_seconds: 20 } });
  assert.equal(on.duration, 33);
  assert.deepEqual(on.learned, {});
  const off = runHookAfterStart({ waitedMs: 0, durationMs: 33_000, settings: { heavy_after_seconds: 0, subagent_suite_after_seconds: 0 } });
  assert.equal(off.duration, null);
});

test('the hook exits 0 and writes nothing on bad input or a call it ignores', () => {
  withCache((cache) => {
    for (const input of ['', 'not json', JSON.stringify({ tool_name: 'Read', tool_input: {} }), JSON.stringify({ tool_name: 'Bash', session_id: 's1', tool_input: { command: 'npm test' } })]) {
      const result = runHook(input, cache);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
    }
    assert.deepEqual(learnedCommands('/p'), {});
  });
});

test('hooks.json runs the recorder after a Bash call', () => {
  const hooks = JSON.parse(fs.readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
  const entry = hooks.hooks.PostToolUse.find((candidate) => candidate.matcher === 'Bash');
  assert.match(entry.hooks[0].command, /hooks\/record-runtime\.mjs/);
});

test('wholeSuiteKeys keys a whole-suite segment and skips one narrowed by an argument', () => {
  assert.deepEqual(wholeSuiteKeys('npm test'), ['npm test']);
  assert.deepEqual(wholeSuiteKeys('npm run test'), ['npm test']);
  assert.deepEqual(wholeSuiteKeys('CI=1 npm test > .exo/log 2>&1'), ['npm test']);
  assert.deepEqual(wholeSuiteKeys('npx vitest run'), ['npx vitest']);
  assert.deepEqual(wholeSuiteKeys('npm test -- tests/tax.test.ts'), []);
  assert.deepEqual(wholeSuiteKeys('npm test -- due-tone'), []);
  assert.deepEqual(wholeSuiteKeys('npm install'), []);
  assert.deepEqual(wholeSuiteKeys('npm test && npm run lint'), ['npm test', 'npm lint']);
  assert.deepEqual(wholeSuiteKeys('npm test | tail -5'), ['npm test']);
});

test('wholeSuiteKeys skips a leading time and its options', () => {
  assert.deepEqual(wholeSuiteKeys('time npm test 2>&1 | tail -40'), ['npm test']);
  assert.deepEqual(wholeSuiteKeys('time -p npm run test'), ['npm test']);
  assert.deepEqual(wholeSuiteKeys('CI=1 time npm test'), ['npm test']);
  assert.deepEqual(wholeSuiteKeys('time CI=1 npm test'), ['npm test']);
  assert.deepEqual(wholeSuiteKeys('time npm test -- tests/tax.test.ts'), []);
});

test('a time-prefixed command is learnable and records its whole-suite duration', () => {
  assert.equal(isLearnable('time npm test 2>&1 | tail -40'), true);
  assert.equal(isLearnable('time -p pytest'), true);
  assert.equal(isLearnable('time npm install'), false);
  withCache(() => {
    run('time npm test 2>&1 | tail -40', { seconds: 33, threshold: 20 });
    assert.equal(lastDuration('/p', 'npm test'), 33);
  });
});

test('a one-segment whole-suite run records its duration, fast or slow', () => {
  withCache(() => {
    assert.equal(lastDuration('/p', 'npm test'), null);
    run('npm test', { seconds: 5 });
    assert.equal(lastDuration('/p', 'npm test'), 5);
    run('npm run test', { seconds: 33, threshold: 20 });
    assert.equal(lastDuration('/p', 'npm test'), 33);
    assert.equal(lastDuration('/other', 'npm test'), null);
    assert.equal(learnedCommands('/p')['npm run test'].seconds, 33);
  });
});

test('a duration is recorded with the heavy threshold off', () => {
  withCache(() => {
    run('npm test', { seconds: 40, threshold: 0 });
    assert.equal(lastDuration('/p', 'npm test'), 40);
  });
});

test('a run narrowed to one file or with two whole-suite segments records no duration', () => {
  withCache(() => {
    run('npm test -- tests/tax.test.ts', { seconds: 40 });
    run('npm test && npm run lint', { seconds: 70, session: 's2' });
    assert.equal(lastDuration('/p', 'npm test'), null);
    assert.equal(lastDuration('/p', 'npm lint'), null);
  });
});

test('a duration unused for 30 days is dropped on the next write', () => {
  withCache(() => {
    run('npm test', { seconds: 5 });
    run('npm run check', { seconds: 5, session: 's2', startAt: T0 + 31 * DAY_MS });
    assert.equal(lastDuration('/p', 'npm test'), null);
    assert.equal(lastDuration('/p', 'npm check'), 5);
  });
});
