import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { planTaskTrailer } from '#plan-tasks';
import { landedTasks } from '../benchmarks/sweep.mjs';

function git(directory, ...args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

function commit(directory, subject, trailer) {
  git(directory, 'commit', '--quiet', '--allow-empty', '-m', subject, '-m', trailer);
}

test('landedTasks counts distinct Plan-task numbers in the form land-task writes, across refs', () => {
  const repository = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-landed-')));
  try {
    git(repository, 'init', '--quiet', '-b', 'main');
    git(repository, 'config', 'user.email', 'test@example.com');
    git(repository, 'config', 'user.name', 'test');
    commit(repository, 'one', planTaskTrailer('flow-plan', 1));
    commit(repository, 'two', planTaskTrailer('flow-plan', 2));
    git(repository, 'checkout', '--quiet', '-b', 'wave');
    commit(repository, 'two again', planTaskTrailer('flow-plan', 2));
    commit(repository, 'three', 'Plan-task: 3');
    git(repository, 'checkout', '--quiet', 'main');
    assert.equal(landedTasks(repository), 3);
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
});
