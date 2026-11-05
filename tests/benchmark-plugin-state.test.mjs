import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pluginDirty } from '../benchmarks/plugin-state.mjs';
import { git, tempDir } from './harness.mjs';

test('pluginDirty reads false for a clean repo and true after an edit', () => {
  const directory = tempDir('exo-plugin-state-');
  git(directory, 'init', '-q');
  fs.writeFileSync(path.join(directory, 'a.txt'), 'one\n');
  git(directory, 'add', 'a.txt');
  git(directory, 'commit', '-q', '-m', 'init');
  assert.deepEqual(pluginDirty([directory]), { [directory]: false });
  fs.writeFileSync(path.join(directory, 'a.txt'), 'two\n');
  assert.deepEqual(pluginDirty([directory]), { [directory]: true });
});
