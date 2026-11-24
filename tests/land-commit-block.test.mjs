import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { commitBlockOf } from '../skills/build/scripts/land-commit-block.mjs';

test('an untracked task path starting with a dash is added as a path, not an option', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-block-'));
  execFileSync('git', ['-C', root, 'init', '-q']);
  fs.writeFileSync(path.join(root, '-n'), 'x\n');
  fs.writeFileSync(path.join(root, 'a.txt'), 'y\n');
  const task = { number: 1, title: 'feat: add files', files: [{ path: '-n' }, { path: 'a.txt' }] };
  const block = commitBlockOf({ task, planId: 'p', root });
  execFileSync('sh', ['-c', block.split('\n')[0]], { cwd: root });
  const staged = execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.deepEqual(staged.sort(), ['-n', 'a.txt']);
});
