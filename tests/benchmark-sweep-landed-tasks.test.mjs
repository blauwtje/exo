import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { planTaskTrailer } from '#plan-tasks';
import { landedTasks } from '../benchmarks/sweep.mjs';
import { git, tempDir } from './harness.mjs';

function commit(directory, subject, trailer) {
  git(directory, 'commit', '--quiet', '--allow-empty', '-m', subject, '-m', trailer);
}

test('landedTasks counts distinct Plan-task numbers in the form land-task writes, across refs', () => {
  const repository = fs.realpathSync(tempDir('sweep-landed-'));
  git(repository, 'init', '--quiet', '-b', 'main');
  commit(repository, 'one', planTaskTrailer('flow-plan', 1));
  commit(repository, 'two', planTaskTrailer('flow-plan', 2));
  git(repository, 'checkout', '--quiet', '-b', 'wave');
  commit(repository, 'two again', planTaskTrailer('flow-plan', 2));
  commit(repository, 'three', 'Plan-task: 3');
  git(repository, 'checkout', '--quiet', 'main');
  assert.equal(landedTasks(repository), 3);
});
