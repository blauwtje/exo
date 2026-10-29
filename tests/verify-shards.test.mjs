import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { contextLimit, reviewShardTokens, softLimit } from '../lib/context-limits.mjs';
import { branchFiles, shardBranch } from '../skills/gate/scripts/review-shards.mjs';
import { git } from './harness.mjs';
import { editApp, landingCheckout } from './land-task-fixture.mjs';

const VERIFY = fileURLToPath(new URL('../skills/gate/scripts/gate.mjs', import.meta.url));

const file = ({ name, task, tokens, hunks = [{ start: 1, end: 10, tokens }] }) => ({ path: name, task, tokens, header: '', hunks });
const names = (shard) => shard.files.map((entry) => entry.path);

test('the shard budget is a positive share of the soft context limit', () => {
  assert.ok(Number.isInteger(reviewShardTokens()));
  assert.ok(reviewShardTokens() > 0 && reviewShardTokens() < softLimit(contextLimit()));
});

test('shardBranch keeps files that fit in one shard', () => {
  const shards = shardBranch([file({ name: 'a.js', task: 1, tokens: 100 }), file({ name: 'b.js', task: 2, tokens: 200 })], 1000);
  assert.equal(shards.length, 1);
  assert.deepEqual(names(shards[0]), ['a.js', 'b.js']);
});

test('shardBranch returns disjoint shards that each fit the budget and keep a task together', () => {
  const files = [file({ name: 'a1.js', task: 1, tokens: 400 }), file({ name: 'b1.js', task: 2, tokens: 400 }), file({ name: 'a2.js', task: 1, tokens: 400 }), file({ name: 'b2.js', task: 2, tokens: 400 }), file({ name: 'loose.js', task: null, tokens: 300 })];
  const shards = shardBranch(files, 1000);
  assert.deepEqual(shards.map(names), [['a1.js', 'a2.js'], ['b1.js', 'b2.js'], ['loose.js']]);
  const all = shards.flatMap(names);
  assert.deepEqual([...all].sort(), files.map((entry) => entry.path).sort());
  assert.ok(shards.every((shard) => shard.tokens <= 1000), JSON.stringify(shards.map((shard) => shard.tokens)));
  const holder = (name) => shards.findIndex((shard) => names(shard).includes(name));
  assert.equal(holder('a1.js'), holder('a2.js'));
});

test('shardBranch splits a file over the budget by hunk ranges that cover every hunk once', () => {
  const hunks = [{ start: 1, end: 5, tokens: 400 }, { start: 20, end: 30, tokens: 400 }, { start: 50, end: 60, tokens: 400 }];
  const shards = shardBranch([file({ name: 'big.js', task: 1, tokens: 1200, hunks })], 1000);
  assert.equal(shards.length, 2);
  const pieces = shards.flatMap((shard) => shard.files);
  assert.ok(pieces.every((piece) => piece.path === 'big.js' && piece.tokens <= 1000));
  assert.deepEqual(pieces.flatMap((piece) => piece.hunks.map((hunk) => hunk.start)), [1, 20, 50]);
  assert.ok(shards.every((shard) => shard.tokens <= 1000));
});

test('shardBranch returns one empty shard for no changed file', () => {
  assert.deepEqual(shardBranch([], 1000), [{ files: [], tokens: 0 }]);
});

async function branchOfTwoLargeFiles() {
  const { root, planPath } = await landingCheckout();
  git(root, 'switch', '-q', '-c', 'feat/fixture');
  await editApp(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): greet', '-m', 'Plan-task: fixture/1');
  const filler = (name) => `${`export const ${name} = "${'x'.repeat(60)}";\n`.repeat(600)}`;
  await fs.writeFile(path.join(root, 'src', 'one.js'), filler('one'));
  await fs.writeFile(path.join(root, 'src', 'two.js'), filler('two'));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): large');
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo', 'proof-fixture-task-1.txt'), 'pass\n');
  return { root, planPath };
}

const reviewsOnly = (root, planPath) => execFileSync('node', [VERIFY, '--plan', planPath, '--root', root, '--base', 'main', '--reviews-only'], {
  encoding: 'utf8', env: { ...process.env, EXO_RUN: '', EXO_RUN_DIR: '' }
}).trim().split('\n');

test('verify prints one DISPATCH Branch line and one review input per shard when the diff passes the budget', async () => {
  const { root, planPath } = await branchOfTwoLargeFiles();
  const lines = reviewsOnly(root, planPath);
  const dispatches = lines.filter((line) => line.startsWith('DISPATCH Branch '));
  assert.equal(dispatches.length, 2, lines.join('\n'));
  assert.match(dispatches[0], /^DISPATCH Branch 1\/2: .* input=\S+review-input-1\.md findings=\S+review-branch-1\.md/);
  assert.match(dispatches[1], /^DISPATCH Branch 2\/2: .* input=\S+review-input-2\.md findings=\S+review-branch-2\.md/);
  const inputs = await Promise.all([1, 2].map((number) => fs.readFile(path.join(root, '.exo', `review-input-${number}.md`), 'utf8')));
  const covered = ['src/one.js', 'src/two.js', 'src/app.js'].map((name) => inputs.filter((input) => input.includes(`+++ b/${name}`)).length);
  assert.deepEqual(covered, [1, 1, 1], 'each changed file sits in exactly one shard');
  await assert.rejects(fs.access(path.join(root, '.exo', 'review-input.md')));
});

test('a diff that fits one reviewer stays one DISPATCH Branch line and review-input.md', async () => {
  const { root, planPath } = await landingCheckout();
  git(root, 'switch', '-q', '-c', 'feat/fixture');
  await editApp(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): greet', '-m', 'Plan-task: fixture/1');
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo', 'proof-fixture-task-1.txt'), 'pass\n');
  const lines = reviewsOnly(root, planPath);
  assert.equal(lines.filter((line) => line.startsWith('DISPATCH Branch')).length, 1);
  assert.ok(lines.some((line) => line.startsWith('DISPATCH Branch: ')));
  await fs.access(path.join(root, '.exo', 'review-input.md'));
});

test('verify --reviews-only copies a landed task Boundary line into the review input', async () => {
  const { root, planPath } = await landingCheckout();
  git(root, 'switch', '-q', '-c', 'feat/fixture');
  await editApp(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): greet', '-m', 'Plan-task: fixture/1');
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo', 'proof-fixture-task-1.txt'), 'pass\n');
  const plan = await fs.readFile(planPath, 'utf8');
  await fs.writeFile(planPath, plan.replace('Depends on: none\n', 'Depends on: none\n\nBoundary: in a path | out symlinks | test src/app.js\n'));
  reviewsOnly(root, planPath);
  const input = await fs.readFile(path.join(root, '.exo', 'review-input.md'), 'utf8');
  assert.match(input, /## Boundaries\n.*\nTask 1: Boundary: in a path \| out symlinks \| test src\/app\.js\n/);
});

test('branchFiles diffs against the merge base, so files only the base gained stay out', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'branch-files-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'init');
  git(root, 'switch', '-q', '-c', 'work');
  await fs.writeFile(path.join(root, 'branch.js'), 'a\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'branch change');
  git(root, 'switch', '-q', 'main');
  await fs.writeFile(path.join(root, 'main-only.js'), 'b\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'main change');
  git(root, 'switch', '-q', 'work');
  assert.deepEqual(branchFiles({ checkout: root, base: 'main', head: 'HEAD' }).map((entry) => entry.path), ['branch.js']);
});
