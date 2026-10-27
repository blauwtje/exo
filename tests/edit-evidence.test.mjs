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

const run = (root, env = {}) => {
  const report = createReport();
  const lines = [];
  const log = console.log;
  console.log = (line) => lines.push(line);
  try {
    checkEditEvidence(report, { root }, { env });
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

test('a bad trailer is prefixed with the short sha of its commit', () => {
  const root = fixture();
  edit(root, 'good\n\nEvidence: none (typo fix)');
  edit(root, 'bad\n\nEvidence: tests/foo.mjs');
  const sha = git(root, 'rev-parse', '--short', 'HEAD');
  const r = run(root);
  assert.equal(r.FAIL, 1);
  assert.match(r.lines[0], new RegExp(`${sha} Evidence: tests/foo\\.mjs names neither`));
  assert.doesNotMatch(r.lines[0], new RegExp(`${git(root, 'rev-parse', '--short', 'HEAD~1')} Evidence`));
});

test('a malformed trailer fails even when no wording file changed', () => {
  const root = fixture();
  edit(root, 'code\n\nEvidence: tests/foo.mjs', 'lib/a.mjs');
  const r = run(root);
  assert.equal(r.FAIL, 1);
  assert.match(r.lines[0], /Evidence: tests\/foo\.mjs names neither/);
});

test('a well-formed result path not in the range passes when no wording file changed', () => {
  const root = fixture();
  edit(root, 'code\n\nEvidence: benchmarks/results/elsewhere.json', 'lib/a.mjs');
  const r = run(root);
  assert.equal(r.FAIL, 0);
  assert.equal(r.PASS, 1);
});

test('an empty or command-result value fails with text naming Proof when no wording file changed', () => {
  for (const value of ['', 'npm test → 12 pass']) {
    const root = fixture();
    edit(root, `code\n\nEvidence: ${value}`, 'lib/a.mjs');
    const r = run(root);
    assert.equal(r.FAIL, 1, value);
    assert.match(r.lines[0], /a command result goes in a `Proof: <command> → <result>` line/);
  }
});

test('a pending Evidence value from an unlanded task stands in for the missing trailer', () => {
  const root = fixture();
  edit(root, 'reword');
  assert.equal(run(root, { EXO_PENDING_EVIDENCE: 'none (typo fix)' }).FAIL, 0);
  assert.equal(run(root, { EXO_PENDING_EVIDENCE: '' }).FAIL, 1);
});

test('a pending Evidence value does not excuse an invalid committed trailer', () => {
  const root = fixture();
  edit(root, 'reword\n\nEvidence: none ()');
  assert.equal(run(root, { EXO_PENDING_EVIDENCE: 'none (typo fix)' }).FAIL, 1);
});
