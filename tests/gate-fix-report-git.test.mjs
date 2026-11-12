import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { repairLines } from '../skills/gate/scripts/gate-repair.mjs';
import { ledgerDirOf, takePending } from '../skills/gate/scripts/repair-round.mjs';
import { settleFixDiff } from '../skills/gate/scripts/fix-diff-settle.mjs';
import { findingsDigest } from '../skills/gate/scripts/merge-reviews.mjs';

const PLAN = [
  '# Plan',
  '',
  'Goal: g',
  'Success criterion: `npm run check`',
  '',
  '### Task 1: t',
  'Depends on: none | Files: `tests/proof.test.mjs` | Data: d | Evidence: none | Proof: node --test tests/proof.test.mjs | Acceptance: a',
  ''
].join('\n');

function git(root, ...args) {
  return spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root, encoding: 'utf8' });
}

function fixedRepo(fixedFile) {
  const root = mkdtempSync(path.join(tmpdir(), 'gate-fix-git-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 't');
  git(root, 'config', 'user.email', 't@example.com');
  mkdirSync(path.join(root, 'tests'));
  writeFileSync(path.join(root, 'tests', 'proof.test.mjs'), "import test from 'node:test';\ntest('p', () => {});\n");
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'seed');
  const preFixSha = git(root, 'rev-parse', 'HEAD').stdout.trim();
  writeFileSync(path.join(root, fixedFile), "import test from 'node:test';\ntest('q', () => {});\n");
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', `fix: round\n\nGuard: ${fixedFile}`);
  const fixSha = git(root, 'rev-parse', 'HEAD').stdout.trim();
  mkdirSync(path.join(root, '.exo'));
  const findings = path.join(root, '.exo', 'findings.md');
  writeFileSync(findings, 'no findings\n');
  return { root, preFixSha, fixSha, findings, findingsSha256: findingsDigest('no findings\n') };
}

function stillFixed(root, preFixSha) {
  return git(root, 'diff', '--quiet', preFixSha, 'HEAD').status !== 0;
}

async function report(fixedFile) {
  const repo = fixedRepo(fixedFile);
  const lines = await repairLines({ ...repo, planText: PLAN, planPath: path.join(repo.root, 'plan.md') });
  return { lines, kept: stillFixed(repo.root, repo.preFixSha), done: lines.some((line) => line.startsWith('LOOP next=done')) };
}

test('a fix that touches a plan Proof test is reverted and the report says so', async () => {
  const { lines, kept, done } = await report('tests/proof.test.mjs');
  assert.equal(kept, false);
  assert.equal(done, kept);
  assert.ok(lines.some((line) => line.startsWith('DISCARDED ')));
  assert.ok(lines.some((line) => line.includes('protected: tests/proof.test.mjs')));
  assert.ok(lines.some((line) => /^LOOP next=(fix|stop)/.test(line)));
});

test('a fix that touches only a new tests file is kept and the report says done', async () => {
  const { kept, done } = await report('tests/new-guard.test.mjs');
  assert.equal(kept, true);
  assert.equal(done, kept);
});

test('a fix-diff review that finds a new fix reverts the fix and the settle output carries a loop line that is not done', async () => {
  const repo = fixedRepo('tests/new-guard.test.mjs');
  const planPath = path.join(repo.root, 'plan.md');
  const first = await repairLines({ ...repo, planText: PLAN, planPath });
  assert.match(first.at(-1), /^LOOP next=done/);
  const pending = takePending(ledgerDirOf(repo.root, planPath));
  const verdict = 'verdict=PASS fix=1';
  const merged = { lines: [verdict], body: [verdict], status: 0 };
  const settled = settleFixDiff(pending, merged, { root: repo.root, planPath });
  assert.ok(settled.lines.some((line) => line.startsWith('DISCARDED ')));
  const loops = settled.lines.filter((line) => line.startsWith('LOOP '));
  assert.match(loops.at(-1), /^LOOP next=(fix|stop)/);
  assert.equal(stillFixed(repo.root, repo.preFixSha), false);
});
