import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REFUSAL_HANDLERS, isRetryable, refusalHandler } from '../lib/refusal-handlers.mjs';
import { processStart } from '../lib/land-lock.mjs';
import { unfinishedMergeNote } from '../lib/merge-state.mjs';
import { removeWorktree } from '../skills/build/scripts/remove-worktree.mjs';
import * as errors from '../skills/build/scripts/land-errors.mjs';
import { git, run } from './harness.mjs';
import { SCRIPT, landingCheckout, editApp } from './land-task-fixture.mjs';

const NEXT_TASK = path.resolve('skills/build/scripts/next-task.mjs');
const SQUASH_CHECK = path.resolve('skills/build/scripts/squash-check.mjs');
const SHORT_LOCK_WAIT = { EXO_LAND_LOCK_MS: '300' };

function land(root, planPath, env = {}) {
  return run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root, env });
}

function conflictedSquash(root) {
  git(root, 'checkout', '-q', '-b', 'feat/other');
  fs.writeFileSync(path.join(root, 'src/app.js'), 'export function greet() { return "other"; }\n');
  git(root, 'commit', '-qam', 'other');
  git(root, 'checkout', '-q', '-');
  fs.writeFileSync(path.join(root, 'src/app.js'), 'export function greet() { return "main"; }\n');
  git(root, 'commit', '-qam', 'main');
  assert.throws(() => execFileSync('git', ['-C', root, 'merge', '--squash', 'feat/other'], { stdio: 'ignore' }));
}

test('a run pin refusal has its own kind and no exo-retry', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const refused = await land(root, planPath, { EXO_RUN_TASK: 'fixture/2' });
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /pins this run to fixture\/2/);
  assert.ok(refused.stderr.includes(`\n${refusalHandler('pin')}\n`), refused.stderr);
  assert.doesNotMatch(refused.stderr, /exo-retry/);
});

test('a land lock held by a live process is refused as lock with no exo-retry', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const gitDirectory = git(root, 'rev-parse', '--absolute-git-dir');
  fs.writeFileSync(path.join(gitDirectory, 'exo-land.lock'), `${process.pid}\n${processStart(process.pid)}\n`);
  const refused = await land(root, planPath, SHORT_LOCK_WAIT);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /another land-task holds/);
  assert.ok(refused.stderr.endsWith(`${refusalHandler('lock')}\n`), refused.stderr);
  assert.doesNotMatch(refused.stderr, /exo-retry/);
});

test('an unfinished squash merge is refused before any commit, with no exo-retry', async () => {
  const { root, planPath } = await landingCheckout();
  conflictedSquash(root);
  const head = git(root, 'rev-parse', 'HEAD');
  const refused = await land(root, planPath);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /unfinished merge \(unmerged paths: src\/app\.js\)/);
  assert.ok(refused.stderr.endsWith(`${refusalHandler('unfinished merge')}\n`), refused.stderr);
  assert.doesNotMatch(refused.stderr, /exo-retry/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
});

test('every refusal kind has a retry field, and only the four repairable kinds are retryable', () => {
  for (const [kind, row] of Object.entries(REFUSAL_HANDLERS)) {
    assert.equal(typeof row.retry, 'boolean', kind);
    assert.equal(isRetryable(kind), row.retry, kind);
  }
  const retryable = Object.keys(REFUSAL_HANDLERS).filter(isRetryable).sort();
  assert.deepEqual(retryable, ['outside Files', 'plan drift', 'proof failed', 'report missing']);
});

test('every LandingError kind thrown by the land path has a row in the table', () => {
  const types = Object.values(errors).filter((type) => type === errors.LandingError || type.prototype instanceof errors.LandingError);
  const kinds = types.map((type) => new type('x').kind);
  for (const kind of ['pin', 'lock', 'unfinished merge']) assert.ok(kinds.includes(kind), kind);
  for (const kind of kinds) assert.ok(kind in REFUSAL_HANDLERS, kind);
});

test('squash-check and remove-worktree refuse an unfinished merge with the note the land path prints', async () => {
  const { root } = await landingCheckout();
  git(root, 'branch', 'feat/spare');
  conflictedSquash(root);
  const note = unfinishedMergeNote(root);
  assert.ok(note);
  const check = await run(SQUASH_CHECK, ['--branch', 'feat/spare', '--root', root], { cwd: root });
  assert.equal(check.code, 1);
  assert.ok(check.stdout.includes(note), check.stdout);
  assert.throws(() => removeWorktree({ worktree: root, run: root, kept: true }), (error) => error.message.includes(note));
});

test('next-task prints the pinned task under EXO_RUN_TASK and nothing without a valid pin', async () => {
  const { root, planPath } = await landingCheckout();
  const next = (env) => run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root, env });
  const pinned = await next({ EXO_RUN_TASK: 'fixture/2' });
  assert.equal(pinned.code, 0);
  assert.match(pinned.stdout, /^Pinned: fixture\/2$/m);
  assert.doesNotMatch((await next({})).stdout, /^Pinned:/m);
  const invalid = await next({ EXO_RUN_TASK: 'nonsense' });
  assert.equal(invalid.code, 0);
  assert.doesNotMatch(invalid.stdout, /^Pinned:/m);
});
