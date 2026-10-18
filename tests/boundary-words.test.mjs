import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkBoundaryWords } from '../verify/checks/boundary-words.mjs';
import { createReport } from '../verify/report.mjs';

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const write = (dir, file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};

function fixture({ origin = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-words-'));
  const root = path.join(dir, 'work');
  fs.mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  write(root, 'skills/x.md', 'Run only this.\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  if (origin) {
    const bare = path.join(dir, 'origin.git');
    git(dir, 'init', '-q', '--bare', '-b', 'main', bare);
    git(root, 'remote', 'add', 'origin', bare);
    git(root, 'push', '-q', 'origin', 'main');
  }
  git(root, 'switch', '-q', '-c', 'feat');
  return root;
}

const run = (root) => {
  const report = createReport();
  checkBoundaryWords(report, { root }, { env: {} });
  return report.counts();
};

test('a branch behind origin/main is not failed for words main added', () => {
  const root = fixture();
  git(root, 'switch', '-q', 'main');
  write(root, 'skills/x.md', 'Run only this, only now.\n');
  git(root, 'commit', '-qam', 'main adds only');
  git(root, 'push', '-q', 'origin', 'main');
  git(root, 'switch', '-q', 'feat');
  assert.equal(run(root).FAIL, 0);
});

test('a branch commit that removes a word fails', () => {
  const root = fixture();
  write(root, 'skills/x.md', 'Run this.\n');
  git(root, 'commit', '-qam', 'drop only');
  const lines = [];
  const log = console.log;
  console.log = (line) => lines.push(String(line));
  let counts;
  try {
    counts = run(root);
  } finally {
    console.log = log;
  }
  assert.equal(counts.FAIL, 1);
  assert.match(lines.join('\n'), /\[FAIL\].*skills\/x\.md/);
});

test('a Drops line in the commit body allows the removal', () => {
  const root = fixture();
  write(root, 'skills/x.md', 'Run this.\n');
  git(root, 'commit', '-qam', 'drop only', '-m', 'Drops: only in skills/x.md');
  assert.equal(run(root).FAIL, 0);
});

test('no origin remote is UNRUN', () => {
  const root = fixture({ origin: false });
  assert.equal(run(root).UNRUN, 1);
});
