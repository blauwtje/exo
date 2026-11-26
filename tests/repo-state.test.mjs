import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { repoState } from '../lib/repo-state.mjs';
import { GIT_IDENTITY, tempDir } from './harness.mjs';

function fixture() {
  const root = fs.realpathSync(tempDir('repo-state-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, '.gitignore'), 'skip.txt\n');
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
  fs.writeFileSync(path.join(root, 'gone.txt'), 'g\n');
  git('add', '.');
  git('commit', '-q', '-m', 'feat: first', '-m', 'Plan-task: p/1');
  return { root, git };
}

function gitRuns(run) {
  const traces = tempDir('repo-state-trace-');
  const saved = process.env.GIT_TRACE2_EVENT;
  process.env.GIT_TRACE2_EVENT = traces;
  try {
    run();
  } finally {
    if (saved === undefined) delete process.env.GIT_TRACE2_EVENT;
    else process.env.GIT_TRACE2_EVENT = saved;
  }
  return fs.readdirSync(traces).flatMap((file) => fs.readFileSync(path.join(traces, file), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)))
    .filter((event) => event.event === 'start')
    .map((event) => event.argv.slice(3).join(' '));
}

test('reads answer from the repository', () => {
  const { root, git } = fixture();
  git('rm', '-q', 'gone.txt');
  fs.writeFileSync(path.join(root, 'skip.txt'), 's\n');
  const state = repoState(root);
  assert.equal(state.toplevel(), root);
  assert.equal(state.defaultBase(), null);
  assert.deepEqual(state.planCommits().map((commit) => commit.subject), ['feat: first']);
  assert.deepEqual([...state.stagedDeletions()], ['gone.txt']);
  assert.deepEqual(state.trackedPaths(['a.txt', 'skip.txt', 'none.txt']), ['a.txt']);
  assert.deepEqual([...state.ignoredPaths(['a.txt', 'skip.txt'])], ['skip.txt']);
  assert.deepEqual([...state.ignoredPaths(['a.txt'])], []);
  assert.equal(state.head().message, 'feat: first\n\nPlan-task: p/1');
  assert.match(state.head().sha, /^[0-9a-f]{40}$/);
});

test('each read runs git once until invalidate', () => {
  const { root } = fixture();
  const state = repoState(root);
  const readAll = () => {
    state.planCommits();
    state.stagedDeletions();
    state.trackedPaths(['a.txt', 'b.txt']);
    state.ignoredPaths(['a.txt', 'b.txt']);
    state.head();
  };
  const first = gitRuns(() => { readAll(); readAll(); });
  assert.equal(new Set(first).size, first.length, `repeated: ${first.join(' | ')}`);
  assert.equal(first.filter((argv) => argv.startsWith('ls-files')).length, 1);
  assert.equal(first.filter((argv) => argv.startsWith('check-ignore')).length, 1);
  state.invalidate();
  assert.equal(gitRuns(readAll).filter((argv) => argv.startsWith('ls-files')).length, 1);
});

test('invalidate shows a later git write', () => {
  const { root, git } = fixture();
  const state = repoState(root);
  assert.deepEqual([...state.stagedDeletions()], []);
  git('rm', '-q', 'gone.txt');
  assert.deepEqual([...state.stagedDeletions()], []);
  state.invalidate();
  assert.deepEqual([...state.stagedDeletions()], ['gone.txt']);
});
