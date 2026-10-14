import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { landRun } from '../skills/build/scripts/land-run.mjs';
import { readGates, approveGates } from '../skills/build/scripts/run-state.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/build/scripts/land-run.mjs', import.meta.url));
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const gitOk = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' }).status === 0;
const write = (dir, file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};

// A bare origin, a main checkout on `main` and a run branch `feat` with one commit.
function fixture({ review = 'CLEAN\n\nCount: defect=0 concern=0question=0 fix=0\n', origin = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'land-run-'));
  const bare = path.join(dir, 'origin.git');
  const root = path.join(dir, 'work');
  fs.mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  write(root, '.gitignore', '.exo/\n');
  write(root, 'a.txt', 'a\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  if (origin) {
    git(dir, 'init', '-q', '--bare', '-b', 'main', bare);
    git(root, 'remote', 'add', 'origin', bare);
    git(root, 'push', '-q', 'origin', 'main');
  }
  git(root, 'switch', '-q', '-c', 'feat');
  write(root, 'b.txt', 'b\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'feat');
  const startedAt = new Date(Date.now() - 5000).toISOString();
  if (review !== null) write(root, '.exo/branch-review.md', review);
  const runDir = path.join(root, '.exo', 'run', 'r1');
  fs.mkdirSync(runDir, { recursive: true });
  const stubs = path.join(dir, 'bin');
  write(stubs, 'gh', '#!/bin/sh\necho "$@" >> "$GH_LOG"\n[ -n "$GH_FAIL" ] && { echo boom >&2; exit 1; }\necho https://example.test/pr/1\n');
  fs.chmodSync(path.join(stubs, 'gh'), 0o755);
  const opts = { root, runRoot: root, branch: 'feat', mode: 'local', runDir, success: '`true`', startedAt };
  const land = (patch = {}) => {
    const saved = { PATH: process.env.PATH, GH_LOG: process.env.GH_LOG, GH_FAIL: process.env.GH_FAIL };
    process.env.PATH = `${stubs}${path.delimiter}${saved.PATH}`;
    process.env.GH_LOG = path.join(dir, 'gh.log');
    process.env.GH_FAIL = patch.ghFail ? '1' : '';
    try { return landRun({ ...opts, ...patch }); } finally {
      for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };
  const refs = () => git(bare, 'for-each-ref', '--format=%(refname) %(objectname)');
  return { dir, bare, root, runDir, opts, land, refs, ghLog: path.join(dir, 'gh.log') };
}

test('local fast-forwards main in place, deletes the branch and pushes nothing', () => {
  const f = fixture();
  const before = f.refs();
  const r = f.land();
  assert.equal(r.phase, 'landed');
  assert.equal(r.pushed, null);
  assert.match(r.range, /^[0-9a-f]{7}\.\.[0-9a-f]{7}$/);
  assert.equal(git(f.root, 'symbolic-ref', '--short', 'HEAD'), 'main');
  assert.ok(fs.existsSync(path.join(f.root, 'b.txt')));
  assert.ok(!gitOk(f.root, 'rev-parse', '--verify', 'feat'));
  assert.equal(f.refs(), before);
});

test('local without origin lands and skips fetch', () => {
  const f = fixture({ origin: false });
  assert.equal(f.land().phase, 'landed');
  assert.ok(fs.existsSync(path.join(f.root, 'b.txt')));
});

test('push-main moves origin main', () => {
  const f = fixture();
  const r = f.land({ mode: 'push-main' });
  assert.equal(r.phase, 'landed');
  assert.equal(r.pushed, 'origin/main');
  assert.equal(git(f.bare, 'rev-parse', 'main'), git(f.root, 'rev-parse', 'main'));
  assert.ok(!f.refs().includes('refs/heads/feat'));
});

test('push-main and pr park without an origin', () => {
  for (const mode of ['push-main', 'pr']) {
    const f = fixture({ origin: false });
    const r = f.land({ mode });
    assert.equal(r.phase, 'parked');
    assert.equal(r.gate, 'no origin remote');
  }
});

test('pr pushes the branch and calls gh pr create, keeping the branch', () => {
  const f = fixture();
  const r = f.land({ mode: 'pr' });
  assert.equal(r.phase, 'landed');
  assert.equal(r.prUrl, 'https://example.test/pr/1');
  assert.equal(r.pushed, 'origin/feat');
  assert.equal(git(f.bare, 'rev-parse', 'feat'), git(f.root, 'rev-parse', 'feat'));
  assert.match(fs.readFileSync(f.ghLog, 'utf8'), /pr create --base main --head feat --fill/);
  assert.equal(git(f.root, 'symbolic-ref', '--short', 'HEAD'), 'feat');
});

test('a failing gh parks with the command as action', () => {
  const f = fixture();
  const r = f.land({ mode: 'pr', ghFail: true });
  assert.equal(r.phase, 'parked');
  assert.equal(readGates(f.runDir)[0].action, 'gh pr create --base main --head feat --fill');
});

test('a diverged remote branch in pr parks, origin unchanged, and approval forces once', () => {
  const f = fixture();
  const other = path.join(f.dir, 'other');
  git(f.dir, 'clone', '-q', f.bare, other);
  git(other, 'config', 'user.email', 't@t');
  git(other, 'config', 'user.name', 't');
  git(other, 'switch', '-q', '-c', 'feat');
  write(other, 'c.txt', 'c\n');
  git(other, 'add', '.');
  git(other, 'commit', '-qm', 'diverge');
  git(other, 'push', '-q', 'origin', 'feat');
  const before = f.refs();
  const r = f.land({ mode: 'pr' });
  assert.equal(r.phase, 'parked');
  assert.equal(f.refs(), before);
  const [gate] = readGates(f.runDir);
  assert.equal(gate.status, 'open');
  assert.equal(gate.source, 'land');
  assert.equal(gate.action, 'git push --force-with-lease origin feat');
  approveGates(f.runDir);
  assert.equal(f.land({ mode: 'pr' }).phase, 'landed');
  assert.equal(git(f.bare, 'rev-parse', 'feat'), git(f.root, 'rev-parse', 'feat'));
  assert.equal(readGates(f.runDir)[0].status, 'used');
});

test('a conflicting commit on origin main parks, aborts the rebase and changes no origin ref', () => {
  const f = fixture();
  const other = path.join(f.dir, 'other');
  git(f.dir, 'clone', '-q', f.bare, other);
  git(other, 'config', 'user.email', 't@t');
  git(other, 'config', 'user.name', 't');
  write(other, 'b.txt', 'conflict\n');
  git(other, 'add', '.');
  git(other, 'commit', '-qm', 'conflict');
  git(other, 'push', '-q', 'origin', 'main');
  const before = f.refs();
  const head = git(f.root, 'rev-parse', 'HEAD');
  const r = f.land({ mode: 'push-main' });
  assert.equal(r.phase, 'parked');
  assert.equal(r.gate, 'rebase conflict');
  assert.equal(f.refs(), before);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.root, 'status', '--porcelain', '--untracked-files=no'), '');
  assert.match(readGates(f.runDir)[0].action, /^rebase feat onto origin\/main yourself in /);
});

test('a rebase that moves the branch reruns the re-check; failure parks, approval lands', () => {
  const f = fixture();
  const other = path.join(f.dir, 'other');
  git(f.dir, 'clone', '-q', f.bare, other);
  git(other, 'config', 'user.email', 't@t');
  git(other, 'config', 'user.name', 't');
  write(other, 'd.txt', 'd\n');
  git(other, 'add', '.');
  git(other, 'commit', '-qm', 'd');
  git(other, 'push', '-q', 'origin', 'main');
  const r = f.land({ success: '`false`' });
  assert.equal(r.phase, 'parked');
  assert.match(r.gate, /^re-check failed/);
  assert.equal(git(f.root, 'rev-parse', 'main'), git(f.root, 'rev-parse', 'origin/main~1'));
  approveGates(f.runDir);
  assert.equal(f.land({ success: '`false`' }).phase, 'landed');
});

test('a local main ahead of origin main is the rebase target and keeps its commit', () => {
  const f = fixture();
  git(f.root, 'switch', '-q', 'main');
  write(f.root, 'c.txt', 'c\n');
  git(f.root, 'add', '.');
  git(f.root, 'commit', '-qm', 'local ahead');
  git(f.root, 'switch', '-q', 'feat');
  const r = f.land();
  assert.equal(r.phase, 'landed');
  assert.ok(fs.existsSync(path.join(f.root, 'b.txt')));
  assert.ok(fs.existsSync(path.join(f.root, 'c.txt')));
});

test('an unmoved branch skips the re-check', () => {
  const f = fixture();
  assert.equal(f.land({ success: '`false`' }).phase, 'landed');
});

test('review: FINDINGS with fix=0 lands; fix>=1, BLOCKED, missing and stale park', () => {
  const cases = [
    ['FINDINGS\n\nCount: defect=0 concern=1question=0 fix=0\n', 'landed'],
    ['FINDINGS\n\nCount: defect=1 concern=0 question=0 fix=1\n', 'parked'],
    ['BLOCKED\n', 'parked'],
    [null, 'parked'],
  ];
  for (const [review, phase] of cases) {
    const f = fixture({ review });
    const r = f.land();
    assert.equal(r.phase, phase, String(review));
    if (phase === 'parked') {
      assert.match(r.gate, /^review not clean/);
      assert.ok(!fs.existsSync(path.join(f.root, 'b.txt')) || git(f.root, 'symbolic-ref', '--short', 'HEAD') === 'feat');
    }
  }
  const stale = fixture();
  const r = stale.land({ startedAt: new Date(Date.now() + 60000).toISOString() });
  assert.equal(r.phase, 'parked');
  assert.match(r.gate, /older than the run/);
});

test('review: a landed review fix with a clean fix review lands; a fix-bearing, BLOCKED or older one parks', () => {
  const branchReview = 'FINDINGS\n\nCount: defect=1 concern=0question=0 fix=1\n';
  const cases = [
    ['CLEAN\n', 1, 'landed'],
    ['FINDINGS\n\n- concern: x.txt:1 stale name; defer\n', 1, 'landed'],
    ['FINDINGS\n\n- defect: x.txt:1 wrong value; fix\n', 1, 'parked'],
    ['BLOCKED\n', 1, 'parked'],
    ['CLEAN\n', -2, 'parked'],
  ];
  for (const [fixReview, offsetSeconds, phase] of cases) {
    const f = fixture({ review: branchReview });
    const file = path.join(f.root, '.exo', 'fix-review.md');
    write(f.root, '.exo/fix-review.md', fixReview);
    const at = fs.statSync(path.join(f.root, '.exo', 'branch-review.md')).mtimeMs / 1000 + offsetSeconds;
    fs.utimesSync(file, at, at);
    const r = f.land();
    assert.equal(r.phase, phase, `${fixReview.trim()} at ${offsetSeconds}s: ${r.gate}`);
    if (phase === 'parked') assert.match(r.gate, /^review not clean: branch review is FINDINGS with fix=1/);
  }
});

test('an approved land anyway gate skips the review once', () => {
  const f = fixture({ review: 'BLOCKED\n' });
  assert.equal(f.land().phase, 'parked');
  approveGates(f.runDir);
  assert.equal(f.land().phase, 'landed');
  assert.equal(readGates(f.runDir)[0].status, 'used');
});

test('tracked changes park as worktree dirty; no branch parks as no branch', () => {
  const f = fixture();
  write(f.root, 'a.txt', 'changed\n');
  assert.equal(f.land().gate, 'worktree dirty');
  assert.equal(fixture().land({ branch: null }).gate, 'no branch');
});

test('leftover CHANGELOG.md and docs markdown land as one docs commit; a task-listed doc and other files do not', () => {
  const f = fixture();
  write(f.root, 'plan.md', '# Plan\n\n### Task 1: x\nDepends on: none | Files: `docs/listed.md` | Proof: true\n');
  fs.writeFileSync(path.join(f.runDir, 'state.json'), JSON.stringify({ plan: path.join(f.root, 'plan.md') }));
  write(f.root, 'CHANGELOG.md', '## Unreleased\n');
  write(f.root, 'docs/specs/s.md', 's\n');
  write(f.root, 'docs/listed.md', 'l\n');
  const r = f.land();
  assert.equal(r.phase, 'landed', r.gate);
  assert.equal(git(f.root, 'log', '-1', '--format=%s'), 'docs: add plan documents');
  assert.equal(git(f.root, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort().join(','), 'CHANGELOG.md,docs/specs/s.md');
  assert.equal(git(f.root, 'status', '--porcelain', '--untracked-files=all').includes('docs/listed.md'), true);
});

test('a doc under a task-listed folder is not a plan document', () => {
  const f = fixture();
  write(f.root, 'plan.md', '# Plan\n\n### Task 1: x\nDepends on: none | Files: `docs/guide/` | Proof: true\n');
  fs.writeFileSync(path.join(f.runDir, 'state.json'), JSON.stringify({ plan: path.join(f.root, 'plan.md') }));
  write(f.root, 'CHANGELOG.md', '## Unreleased\n');
  write(f.root, 'docs/guide/x.md', 'x\n');
  assert.equal(f.land().phase, 'landed');
  assert.equal(git(f.root, 'show', '--name-only', '--format=', 'HEAD'), 'CHANGELOG.md');
  assert.equal(git(f.root, 'status', '--porcelain', '--untracked-files=all').includes('docs/guide/x.md'), true);
});

test('an unreadable plan with a leftover doc parks and commits nothing', () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.runDir, 'state.json'), JSON.stringify({ plan: path.join(f.root, 'missing.md') }));
  write(f.root, 'docs/specs/s.md', 's\n');
  const r = f.land();
  assert.equal(r.phase, 'parked');
  assert.match(r.gate, /^cannot read plan for plan docs: /);
  assert.equal(git(f.root, 'log', '-1', '--format=%s'), 'feat');
});

test('leftover plan docs commit before the rebase and land; no leftovers make no docs commit', () => {
  const f = fixture({ origin: false });
  write(f.root, 'plan.md', '# Plan\n\n### Task 1: x\nDepends on: none | Files: `b.txt` | Proof: true\n');
  fs.writeFileSync(path.join(f.runDir, 'state.json'), JSON.stringify({ plan: path.join(f.root, 'plan.md') }));
  write(f.root, 'docs/plan.md', 'p\n');
  assert.equal(f.land().phase, 'landed');
  assert.equal(git(f.root, 'log', '-1', '--format=%s'), 'docs: add plan documents');
  const g = fixture({ origin: false });
  assert.equal(g.land().phase, 'landed');
  assert.equal(git(g.root, 'log', '-1', '--format=%s'), 'feat');
});

test('a .worktrees run lands in the main checkout and removes its worktree', () => {
  const f = fixture();
  git(f.root, 'switch', '-q', 'main');
  const wt = path.join(f.root, '.worktrees', 'feat');
  git(f.root, 'worktree', 'add', '-q', wt, 'feat');
  write(wt, '.exo/branch-review.md', 'CLEAN\n\nCount: defect=0 concern=0 question=0 fix=0\n');
  const r = f.land({ runRoot: wt });
  assert.equal(r.phase, 'landed', r.gate);
  assert.ok(!fs.existsSync(wt));
  assert.ok(fs.existsSync(path.join(f.root, 'b.txt')));
  assert.match(r.cleanup, /worktree removed; branch deleted/);
});

test('a .worktrees run parks when the main checkout is not on the default branch', () => {
  const f = fixture();
  git(f.root, 'switch', '-q', 'main');
  const wt = path.join(f.root, '.worktrees', 'feat');
  git(f.root, 'worktree', 'add', '-q', wt, 'feat');
  write(wt, '.exo/branch-review.md', 'CLEAN\n');
  git(f.root, 'switch', '-q', '-c', 'other');
  const r = f.land({ runRoot: wt });
  assert.equal(r.phase, 'parked');
  assert.ok(fs.existsSync(wt));
});

test('the CLI prints one line and exits 0 landed, 3 parked', () => {
  const f = fixture();
  const args = ['--root', f.root, '--run-root', f.root, '--branch', 'feat', '--mode', 'local', '--run-dir', f.runDir,
    '--success', '`true`', '--started-at', f.opts.startedAt];
  const ok = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^land-run: landed \| .*\n$/);
  const g = fixture({ review: 'BLOCKED\n' });
  const parked = spawnSync(process.execPath, [SCRIPT, ...args.map((a) => (a === f.root ? g.root : a === f.runDir ? g.runDir : a))], { encoding: 'utf8' });
  assert.equal(parked.status, 3);
  assert.match(parked.stdout, /^land-run: parked \| gate: review not clean/);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 2);
});
