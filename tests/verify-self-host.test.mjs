import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { selfHostPlan, selfHostingGap } from '../skills/verify/scripts/verify.mjs';

function repoWithBranch(changedFiles) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'self-host-'));
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, 'README.md'), 'start\n');
  git('add', '.');
  git('commit', '-q', '-m', 'start');
  git('checkout', '-q', '-b', 'branch');
  for (const file of changedFiles) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'changed\n');
  }
  git('add', '.');
  git('commit', '-q', '-m', 'change');
  return root;
}

const SCRIPT = 'skills/verify/scripts/verify.mjs';

test('selfHostingGap splits changed script and agent paths', () => {
  const root = repoWithBranch([SCRIPT, 'skills/build/review-fixer-prompt.md', 'agents/review-branch.md', 'lib/other.mjs']);
  assert.deepEqual(selfHostingGap(root, 'main'), { scripts: ['skills/build/review-fixer-prompt.md', SCRIPT], agents: ['agents/review-branch.md'] });
});

test('selfHostingGap ignores unrelated paths', () => {
  const root = repoWithBranch(['lib/other.mjs', 'skills/build/SKILL.md']);
  assert.deepEqual(selfHostingGap(root, 'main'), { scripts: [], agents: [] });
});

test('selfHostPlan re-executes the branch copy when the loaded plugin is the same repository', () => {
  const root = repoWithBranch([SCRIPT]);
  const running = path.join(repoWithBranch(['notes.txt']), 'verify.mjs');
  fs.writeFileSync(running, '');
  const plan = selfHostPlan({ root, base: 'main', running, pluginRoot: root });
  assert.equal(plan.reexec, path.join(root, SCRIPT));
  assert.equal(plan.note, null);
});

test('selfHostPlan does not re-execute when already running the branch copy', () => {
  const root = repoWithBranch([SCRIPT]);
  const running = fs.realpathSync(path.join(root, SCRIPT));
  assert.deepEqual(selfHostPlan({ root, base: 'main', running, pluginRoot: root }), { reexec: null, note: null });
});

test('selfHostPlan only notes changed agents', () => {
  const root = repoWithBranch(['agents/a.md', 'agents/b.md']);
  const plan = selfHostPlan({ root, base: 'main', running: path.join(os.tmpdir(), 'x', 'verify.mjs'), pluginRoot: root });
  assert.deepEqual(plan, { reexec: null, note: 'SELF-HOSTED agents=agents/a.md,agents/b.md' });
});

test('selfHostPlan does nothing for a repository that is not the loaded plugin', () => {
  const root = repoWithBranch([SCRIPT, 'agents/a.md']);
  const other = repoWithBranch(['notes.txt']);
  const plan = selfHostPlan({ root, base: 'main', running: path.join(other, SCRIPT), pluginRoot: other });
  assert.deepEqual(plan, { reexec: null, note: null });
});

test('selfHostPlan throws when the base ref does not resolve', () => {
  const root = repoWithBranch([SCRIPT]);
  assert.throws(() => selfHostPlan({ root, base: 'no-such-ref', running: path.join(os.tmpdir(), 'x', 'verify.mjs'), pluginRoot: root }), /no-such-ref/);
});
