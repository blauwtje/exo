import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { commitBlockOf } from '../skills/build/scripts/land-commit-block.mjs';
import { compactPlanFixture, git, run } from './harness.mjs';
import { PASS_REPORT, SCRIPT, compactCheckout, compactTask } from './land-task-fixture.mjs';

const planWith = (files, proof = 'node tests/app.test.mjs') => compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'feat(app): greet', files, proof })] });
const land = (root, planPath) => run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--report', '-'], { cwd: root, input: PASS_REPORT });
const commitCount = (root) => Number(git(root, 'rev-list', '--count', 'HEAD').trim());

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

test('a Files path that matches nothing is named and the task still lands', async () => {
  const { root, planPath } = await compactCheckout(planWith(['src/app.js', 'skills/repo-navigation/']));
  const before = commitCount(root);
  const landed = await land(root, planPath);
  assert.equal(landed.code, 0, landed.stderr);
  assert.match(landed.stdout, /^Files not found: skills\/repo-navigation\/$/m);
  assert.equal(commitCount(root), before + 1);
});

test('a Files directory that the change removed with git rm lands', async () => {
  const { root, planPath } = await compactCheckout(planWith(['src/app.js', 'old/']));
  fs.mkdirSync(path.join(root, 'old'));
  fs.writeFileSync(path.join(root, 'old/a.txt'), 'x\n');
  git(root, 'add', 'old');
  git(root, 'commit', '-q', '-m', 'add old');
  git(root, 'rm', '-r', '-q', 'old');
  const before = commitCount(root);
  const landed = await land(root, planPath);
  assert.equal(landed.code, 0, landed.stderr);
  assert.doesNotMatch(landed.stdout, /Files not found/);
  assert.equal(commitCount(root), before + 1);
});

test('an ignored untracked Files path is refused by name before the Proof runs', async () => {
  const marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'proof-marker-')), 'ran');
  const proof = `node -e "require('fs').writeFileSync('${marker}', '')"`;
  const { root, planPath } = await compactCheckout(planWith(['src/app.js', 'build/out.txt'], proof));
  fs.writeFileSync(path.join(root, '.gitignore'), 'build/\n');
  fs.mkdirSync(path.join(root, 'build'));
  fs.writeFileSync(path.join(root, 'build/out.txt'), 'x\n');
  const landed = await land(root, planPath);
  assert.equal(landed.code, 1);
  assert.match(landed.stderr, /Files path build\/out\.txt is ignored by git/);
  assert.equal(fs.existsSync(marker), false);
});
