import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

const SCRIPT = path.resolve('skills/ship/scripts/pr-state.mjs');
const LOG_LINES = Array.from({ length: 30 }, (_, index) => `log line ${index + 1}`);

function gitIn(cwd, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function fakeGh(view, comments) {
  const bin = tempDir('exo-pr-state-bin-');
  const data = path.join(bin, 'data.json');
  fs.writeFileSync(data, JSON.stringify({ view, comments, log: LOG_LINES.join('\n') }));
  const script = [
    '#!/usr/bin/env node',
    `const data = JSON.parse(require('node:fs').readFileSync(${JSON.stringify(data)}, 'utf8'));`,
    "const args = process.argv.slice(2);",
    "if (args[0] === 'pr' && args[1] === 'view') console.log(JSON.stringify(data.view));",
    "else if (args[0] === 'run' && args[1] === 'view' && args.includes('--log-failed') && args.includes('777')) console.log(data.log);",
    "else if (args[0] === 'api') console.log(JSON.stringify(data.comments));",
    "else process.exit(1);"
  ].join('\n');
  fs.writeFileSync(path.join(bin, 'gh'), script, { mode: 0o755 });
  return bin;
}

function repository({ conflict }) {
  const root = tempDir('exo-pr-state-repo-');
  gitIn(root, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, 'f.txt'), 'base\n');
  gitIn(root, 'add', '.');
  gitIn(root, 'commit', '-q', '-m', 'base');
  if (conflict) {
    gitIn(root, 'checkout', '-q', '-b', 'feature');
    fs.writeFileSync(path.join(root, 'f.txt'), 'feature\n');
    gitIn(root, 'commit', '-qam', 'feature');
    gitIn(root, 'checkout', '-q', 'main');
    fs.writeFileSync(path.join(root, 'f.txt'), 'main\n');
    gitIn(root, 'commit', '-qam', 'main');
    gitIn(root, 'checkout', '-q', 'feature');
    spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'merge', 'main'], { cwd: root });
  }
  gitIn(root, 'update-ref', 'refs/remotes/origin/main', 'main');
  return root;
}

function stateOf(root, view, comments = []) {
  const bin = fakeGh(view, comments);
  const result = spawnSync(process.execPath, [SCRIPT, '--pr', '7'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const BASE_VIEW = { state: 'OPEN', mergeable: 'MERGEABLE', baseRefName: 'main', statusCheckRollup: [] };

test('a clean pull request prints each field as none or ok', () => {
  const out = stateOf(repository({ conflict: false }), BASE_VIEW);
  assert.match(out, /^State: OPEN$/m);
  assert.match(out, /^Mergeable: MERGEABLE$/m);
  assert.match(out, /^Conflicted files: none$/m);
  assert.match(out, /^Failing checks: none$/m);
  assert.match(out, /^Inline comments: none$/m);
  assert.match(out, /^Merge base: ok$/m);
});

test('a conflicted merge lists the file and a base ahead of HEAD is behind', () => {
  const out = stateOf(repository({ conflict: true }), { ...BASE_VIEW, mergeable: 'CONFLICTING' });
  assert.match(out, /^Mergeable: CONFLICTING$/m);
  assert.match(out, /^Conflicted files: f\.txt$/m);
  assert.match(out, /^Merge base: behind$/m);
});

test('a failing check prints its name and the last 20 log lines only', () => {
  const view = {
    ...BASE_VIEW,
    statusCheckRollup: [
      { name: 'unit', conclusion: 'FAILURE', detailsUrl: 'https://github.com/o/r/actions/runs/555/job/777' },
      { name: 'lint', conclusion: 'SUCCESS', detailsUrl: 'https://github.com/o/r/actions/runs/555/job/778' }
    ]
  };
  const out = stateOf(repository({ conflict: false }), view);
  assert.match(out, /^Failing checks:$/m);
  assert.match(out, /unit/);
  assert.doesNotMatch(out, /lint/);
  assert.match(out, /log line 30/);
  assert.match(out, /log line 11/);
  assert.doesNotMatch(out, /log line 10$/m);
});

test('inline comments print the file, line, author and text', () => {
  const comments = [{ path: 'a.mjs', line: 4, user: { login: 'reviewer' }, body: 'rename this' }];
  const out = stateOf(repository({ conflict: false }), BASE_VIEW, comments);
  assert.match(out, /^Inline comments:$/m);
  assert.match(out, /a\.mjs:4 reviewer: rename this/);
});
