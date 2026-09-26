// ship.mjs --routes and --verdict-current: the hand-run checks ship's
// SKILL.md otherwise asks the model to run itself before the route
// question. gh is a stand-in on PATH so `gh auth status` never reaches the
// network; --routes reads facts from a real git repository and an optional
// `.claude/exo.json`.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { commitFiles, fixture, git, gitRepository, run } from './harness.mjs';

const SHIP = fileURLToPath(new URL('../skills/ship/scripts/ship.mjs', import.meta.url));

async function shipRepository() {
  const seed = await gitRepository({ 'README.md': '# fixture\n' });
  const bareRoot = await fixture();
  const origin = path.join(bareRoot, 'origin.git');
  execFileSync('git', ['clone', '-q', '--bare', seed, origin]);
  const cloneRoot = await fs.realpath(await fixture());
  const workDir = path.join(cloneRoot, 'work');
  execFileSync('git', ['clone', '-q', origin, workDir]);
  return { workDir, origin };
}

// `gh auth status` is the only gh call --routes ever makes; `ok` decides
// whether the stand-in exits 0 or 1.
async function ghBin(ok) {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  const body = [
    '#!/usr/bin/env node',
    `process.exit(${ok ? 0 : 1});`,
    ''
  ].join('\n');
  await fs.writeFile(path.join(bin, 'gh'), body, { mode: 0o755 });
  return bin;
}

async function setShipSetting(workDir, value) {
  await fs.mkdir(path.join(workDir, '.claude'), { recursive: true });
  await fs.writeFile(path.join(workDir, '.claude', 'exo.json'), JSON.stringify({ ship: value }));
}

async function shipRoutes(workDir, { ghOk = true } = {}) {
  const bin = await ghBin(ghOk);
  return run(SHIP, ['--routes'], { cwd: workDir, env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
}

const MENU_FULL = [
  '1. **PR + merge (Recommended)**: push, open a pull request, merge it once checks pass',
  '2. **Open PR**: push and open a pull request, leave it open',
  '3. **Push**: push the branch, no pull request',
  '4. **Keep local**: nothing leaves this machine'
].join('\n') + '\n';
const MENU_PUSH_ONLY = ['1. **Push (Recommended)**: push the commits to origin', '2. **Keep local**: nothing leaves this machine'].join('\n') + '\n';

test('--routes: no origin remote rules out every route', async () => {
  const seed = await gitRepository({ 'README.md': '# fixture\n' });
  const outcome = await shipRoutes(seed);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'no origin remote; no route can run\n');
});

test('--routes: default branch unknown rules out every route', async () => {
  const { workDir } = await shipRepository();
  git(workDir, 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD');
  const outcome = await shipRoutes(workDir);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'default-branch=unknown; no route can run\n');
});

test('--routes: a feature branch with gh auth ok offers the full menu', async () => {
  const { workDir } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  const outcome = await shipRoutes(workDir, { ghOk: true });
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, MENU_FULL);
});

test('--routes: a feature branch with gh auth failing drops both pull-request routes', async () => {
  const { workDir } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  const outcome = await shipRoutes(workDir, { ghOk: false });
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, MENU_PUSH_ONLY);
});

test('--routes: the default branch offers push and keep local only', async () => {
  const { workDir } = await shipRepository();
  const outcome = await shipRoutes(workDir, { ghOk: true });
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, MENU_PUSH_ONLY);
});

test('--routes: ship=local always runs without a question', async () => {
  const { workDir } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  await setShipSetting(workDir, 'local');
  const outcome = await shipRoutes(workDir);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'route: local (set)\n');
});

test('--routes: ship=push runs without a question even on the default branch', async () => {
  const { workDir } = await shipRepository();
  await setShipSetting(workDir, 'push');
  const outcome = await shipRoutes(workDir);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'route: push (set)\n');
});

test('--routes: ship=pr-merge runs without a question when it can', async () => {
  const { workDir } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  await setShipSetting(workDir, 'pr-merge');
  const outcome = await shipRoutes(workDir, { ghOk: true });
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'route: pr-merge (set)\n');
});

test('--routes: ship=pr-merge on the default branch names why, then the menu', async () => {
  const { workDir } = await shipRepository();
  await setShipSetting(workDir, 'pr-merge');
  const outcome = await shipRoutes(workDir);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, `ship=pr-merge cannot run: on the default branch\n${MENU_PUSH_ONLY}`);
});

test('--routes: ship=open-pr with gh auth failing names why, then the menu', async () => {
  const { workDir } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  await setShipSetting(workDir, 'open-pr');
  const outcome = await shipRoutes(workDir, { ghOk: false });
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, `ship=open-pr cannot run: gh auth status failed\n${MENU_PUSH_ONLY}`);
});

test('--verdict-current: a matching patch-id prints current', async () => {
  const { workDir } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  const diff = execFileSync('git', ['diff', 'main...HEAD'], { cwd: workDir, encoding: 'utf8' });
  const patchId = execFileSync('git', ['patch-id', '--stable'], { cwd: workDir, encoding: 'utf8', input: diff }).trim().split(/\s+/)[0];
  const outcome = await run(SHIP, ['--verdict-current', patchId], { cwd: workDir });
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'current\n');
});

test('--verdict-current: a stale patch-id, or a further commit on the same branch, prints stale', async () => {
  const { workDir } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  const diff = execFileSync('git', ['diff', 'main...HEAD'], { cwd: workDir, encoding: 'utf8' });
  const patchId = execFileSync('git', ['patch-id', '--stable'], { cwd: workDir, encoding: 'utf8', input: diff }).trim().split(/\s+/)[0];
  await commitFiles(workDir, { 'feature.txt': 'y\n' }, 'feat: change feature again');
  const outcome = await run(SHIP, ['--verdict-current', patchId], { cwd: workDir });
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'stale\n');
});

test('--verdict-current: a matching patch-id on a checkout with no local default branch, only origin/main', async () => {
  const { workDir } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  const diff = execFileSync('git', ['diff', 'origin/main...HEAD'], { cwd: workDir, encoding: 'utf8' });
  const patchId = execFileSync('git', ['patch-id', '--stable'], { cwd: workDir, encoding: 'utf8', input: diff }).trim().split(/\s+/)[0];
  git(workDir, 'branch', '-D', 'main');
  const outcome = await run(SHIP, ['--verdict-current', patchId], { cwd: workDir });
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'current\n');
});

test('--verdict-current: a usage error when the patch-id is missing', async () => {
  const { workDir } = await shipRepository();
  const outcome = await run(SHIP, ['--verdict-current'], { cwd: workDir });
  assert.equal(outcome.code, 2, outcome.stderr);
  assert.equal(outcome.stdout, '');
});
