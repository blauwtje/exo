import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gitStarts } from '../verify/git-trace.mjs';

test('gitStarts returns one entry per git process of a run', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'git-trace-'));
  const repo = path.join(base, 'repo');
  const traces = path.join(base, 'traces');
  fs.mkdirSync(repo);
  fs.mkdirSync(traces);
  execFileSync('git', ['init', '-q', repo]);
  for (let index = 0; index < 2; index++) {
    execFileSync('git', ['-C', repo, 'status'], { env: { ...process.env, GIT_TRACE2_EVENT: traces } });
  }
  const starts = gitStarts(traces);
  assert.equal(starts.length, 2);
  assert.deepEqual(starts[0].argv, starts[1].argv);
  assert.deepEqual(starts[0].argv, ['git', '-C', repo, 'status']);
});

test('gitStarts skips a git child whose sid has a slash', () => {
  const traces = fs.mkdtempSync(path.join(os.tmpdir(), 'git-trace-'));
  const line = (sid, time, argv) => JSON.stringify({ event: 'start', sid, time, argv }) + '\n';
  fs.writeFileSync(path.join(traces, 'a'), line('p-1', '2025-01-01T00:00:02.000000Z', ['/usr/bin/git', 'st']));
  fs.writeFileSync(path.join(traces, 'b'), line('p-1/c-2', '2025-01-01T00:00:03.000000Z', ['git', 'status']));
  fs.writeFileSync(path.join(traces, 'c'), line('q-3', '2025-01-01T00:00:01.000000Z', ['git', 'log']));
  assert.deepEqual(gitStarts(traces), [
    { time: '2025-01-01T00:00:01.000000Z', argv: ['git', 'log'] },
    { time: '2025-01-01T00:00:02.000000Z', argv: ['git', 'st'] }
  ]);
});
