import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

const SCRIPT = path.resolve('skills/ship/scripts/pr-state.mjs');
const VIEW = { state: 'OPEN', mergeable: 'MERGEABLE', baseRefName: 'main', statusCheckRollup: [] };

function gitIn(cwd, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function run({ withOrigin, argsLog }) {
  const root = tempDir('exo-pr-swallow-repo-');
  gitIn(root, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, 'f.txt'), 'base\n');
  gitIn(root, 'add', '.');
  gitIn(root, 'commit', '-q', '-m', 'base');
  if (withOrigin) gitIn(root, 'update-ref', 'refs/remotes/origin/main', 'main');
  const bin = tempDir('exo-pr-swallow-bin-');
  const script = [
    '#!/usr/bin/env node',
    'const args = process.argv.slice(2);',
    `if (args[0] === 'pr' && args[1] === 'view') console.log(${JSON.stringify(JSON.stringify(VIEW))});`,
    "else if (args[0] === 'api') { if (process.env.ARGS_LOG) require('node:fs').appendFileSync(process.env.ARGS_LOG, args.join(' ') + '\\n'); console.error('HTTP 502'); process.exit(1); }",
    'else process.exit(1);'
  ].join('\n');
  fs.writeFileSync(path.join(bin, 'gh'), script, { mode: 0o755 });
  return spawnSync(process.execPath, [SCRIPT, '--pr', '7'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ARGS_LOG: argsLog ?? '', PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  });
}

test('a failed comments api call is not reported as no inline comments', () => {
  const result = run({ withOrigin: true });
  assert.doesNotMatch(result.stdout, /^Inline comments: none$/m);
});

test('a missing origin ref is not reported as a behind merge base', () => {
  const result = run({ withOrigin: false });
  assert.doesNotMatch(result.stdout, /^Merge base: behind$/m);
});

test('the comments api call is paginated', () => {
  const argsLog = path.join(tempDir('exo-pr-swallow-log-'), 'args');
  run({ withOrigin: true, argsLog });
  assert.match(fs.readFileSync(argsLog, 'utf8'), /--paginate/);
});
