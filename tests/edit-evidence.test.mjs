import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkEditEvidence } from '../verify/checks/edit-evidence.mjs';
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

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-evidence-'));
  const root = path.join(dir, 'work');
  fs.mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  write(root, 'skills/x/SKILL.md', 'Run this.\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  const bare = path.join(dir, 'origin.git');
  git(dir, 'init', '-q', '--bare', '-b', 'main', bare);
  git(root, 'remote', 'add', 'origin', bare);
  git(root, 'push', '-q', 'origin', 'main');
  git(root, 'switch', '-q', '-c', 'feat');
  return root;
}

const run = (root) => {
  const report = createReport();
  const lines = [];
  const log = console.log;
  console.log = (line) => lines.push(line);
  try {
    checkEditEvidence(report, { root });
  } finally {
    console.log = log;
  }
  return { ...report.counts(), lines };
};
const edit = (root, message, file = 'skills/x/SKILL.md') => {
  write(root, file, `${Math.random()}\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', message);
};

test('a wording edit with no trailer fails', () => {
  const root = fixture();
  edit(root, 'reword');
  const r = run(root);
  assert.equal(r.FAIL, 1);
  assert.match(r.lines[0], /no commit since the merge base has an `Evidence:` trailer/);
});

test('none with a reason passes and none without fails', () => {
  const root = fixture();
  edit(root, 'reword\n\nEvidence: none (typo fix)');
  assert.equal(run(root).FAIL, 0);
  edit(root, 'again\n\nEvidence: none ()');
  const r = run(root);
  assert.equal(r.FAIL, 1);
  assert.match(r.lines[0], /Evidence: none \(\)/);
});

test('a result file in the range passes on any commit and an unchanged one fails', () => {
  const root = fixture();
  edit(root, 'reword');
  edit(root, 'result\n\nEvidence: benchmarks/results/a.json', 'benchmarks/results/a.json');
  assert.equal(run(root).FAIL, 0);
  edit(root, 'bad\n\nEvidence: benchmarks/results/other.json');
  const r = run(root);
  assert.equal(r.FAIL, 1);
  assert.match(r.lines[0], /other\.json names a file not added or changed/);
});

test('a trailer naming another path fails', () => {
  const root = fixture();
  edit(root, 'reword\n\nEvidence: tests/foo.mjs');
  assert.match(run(root).lines[0], /names neither/);
});

test('a branch with no wording change passes and a missing base is UNRUN', () => {
  const root = fixture();
  edit(root, 'code', 'lib/a.mjs');
  assert.equal(run(root).FAIL, 0);
  git(root, 'remote', 'remove', 'origin');
  assert.equal(run(root).UNRUN, 1);
});

test('a session-start text edit with no trailer fails', () => {
  for (const file of ['hooks/session-routing.md', 'hooks/session-rules.md', 'hooks/dispatch-rules.md', 'harnesses/codex/host-note.md']) {
    const root = fixture();
    edit(root, 'reword', file);
    const r = run(root);
    assert.equal(r.FAIL, 1, file);
  }
});

test('a code-only edit to the session-start injector needs no trailer', () => {
  const root = fixture();
  edit(root, 'reword', 'hooks/session-start.mjs');
  assert.equal(run(root).FAIL, 0);
});
