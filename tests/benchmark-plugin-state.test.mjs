import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pluginDirty } from '../benchmarks/plugin-state.mjs';

function git(directory, args) {
  execFileSync('git', ['-C', directory, ...args], { stdio: 'ignore' });
}

test('pluginDirty reads false for a clean repo and true after an edit', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-plugin-state-'));
  git(directory, ['init', '-q']);
  fs.writeFileSync(path.join(directory, 'a.txt'), 'one\n');
  git(directory, ['add', 'a.txt']);
  git(directory, ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init']);
  assert.deepEqual(pluginDirty([directory]), { [directory]: false });
  fs.writeFileSync(path.join(directory, 'a.txt'), 'two\n');
  assert.deepEqual(pluginDirty([directory]), { [directory]: true });
});
