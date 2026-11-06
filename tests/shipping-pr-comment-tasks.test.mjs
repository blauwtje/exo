import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gitRepository, run } from './harness.mjs';
import { mergeReviews } from '../skills/gate/scripts/merge-reviews.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/ship/scripts/pr-comment-tasks.mjs', import.meta.url));

const STAND_IN = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "fs.appendFileSync(process.env.STAND_IN_LOG, process.argv.slice(2).join(' ') + '\\n');",
  "const graphql = process.argv[2] === 'api' && process.argv[3] === 'graphql';",
  "console.log(graphql ? process.env.STAND_IN_THREADS ?? '{}' : process.env.STAND_IN_COMMENTS);",
  ''
].join('\n');

const comments = [
  { id: 101, path: 'src/app.js', line: 2, body: 'rename this; it reads badly', user: { type: 'User' } },
  { id: 102, path: 'src/app.js', line: 3, body: 'guard the empty case', user: { type: 'User' } },
  { id: 103, path: null, line: null, body: 'overall this looks fine', user: { type: 'User' } }
];

const threadsResponse = (nodes) => ({ data: { repository: { pullRequest: { reviewThreads: { nodes } } } } });
const thread = (state, ...ids) => ({ ...state, comments: { nodes: ids.map((databaseId) => ({ databaseId })) } });

async function tasksFor(payload, threads = []) {
  const root = await gitRepository({ 'src/app.js': 'const a = 1;\nexport const greet = () => a;\nexport const wave = () => a;\n' });
  const bin = path.join(root, '..', `bin-${path.basename(root)}`);
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'gh'), STAND_IN, { mode: 0o755 });
  const log = path.join(bin, 'calls.log');
  const outcome = await run(SCRIPT, ['--pr', '7', '--root', root], {
    cwd: root,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, STAND_IN_LOG: log, STAND_IN_COMMENTS: JSON.stringify([payload]), STAND_IN_THREADS: JSON.stringify(threadsResponse(threads)) }
  });
  return { root, log, ...outcome };
}

test('each file-and-line review comment becomes one fix task and a general comment becomes none', async () => {
  const outcome = await tasksFor(comments);
  assert.equal(outcome.code, 0, outcome.stderr);
  const lines = outcome.stdout.trim().split('\n');
  assert.equal(lines.filter((line) => line.startsWith('TASK ')).length, 2);
  assert.ok(lines.includes('SKIP 103 no file and line'));
  assert.equal(lines.at(-1), 'TASKS 2 SKIPPED 1');
  assert.match(await fs.readFile(outcome.log, 'utf8'), /^api repos\/\{owner\}\/\{repo\}\/pulls\/7\/comments/);
});

test('each task file is a findings file the gate merge counts as one fix finding', async () => {
  const outcome = await tasksFor(comments);
  const files = outcome.stdout.split('\n').filter((line) => line.startsWith('TASK ')).map((line) => line.split('findings=')[1]);
  assert.equal(files.length, 2);
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const merged = mergeReviews([{ name: 'review-branch', text }], new Map(), null, outcome.root);
    assert.equal(merged.counts.fix, 1);
  }
});

test('a bot comment, a reply and a line absent at HEAD are skipped', async () => {
  const outcome = await tasksFor([
    { id: 1, path: 'src/app.js', line: 2, body: 'x', user: { type: 'Bot' } },
    { id: 2, path: 'src/app.js', line: 2, body: 'x', in_reply_to_id: 101, user: { type: 'User' } },
    { id: 3, path: 'src/app.js', line: 99, body: 'x', user: { type: 'User' } }
  ]);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.match(outcome.stdout, /SKIP 1 bot\nSKIP 2 reply\nSKIP 3 line absent at HEAD\nTASKS 0 SKIPPED 3\n/);
});

test('a comment in a resolved thread and one in an outdated thread are skipped with the reason', async () => {
  const outcome = await tasksFor(
    [
      { id: 201, path: 'src/app.js', line: 2, body: 'x', user: { type: 'User' } },
      { id: 202, path: 'src/app.js', line: 3, body: 'x', user: { type: 'User' } },
      { id: 203, path: 'src/app.js', line: 3, body: 'x', user: { type: 'User' } }
    ],
    [thread({ isResolved: true, isOutdated: false }, 201), thread({ isResolved: false, isOutdated: true }, 202), thread({ isResolved: false, isOutdated: false }, 203)]
  );
  assert.equal(outcome.code, 0, outcome.stderr);
  const lines = outcome.stdout.trim().split('\n');
  assert.ok(lines.includes('SKIP 201 resolved'));
  assert.ok(lines.includes('SKIP 202 outdated'));
  assert.ok(lines.some((line) => line.startsWith('TASK 203 ')));
  assert.equal(lines.at(-1), 'TASKS 1 SKIPPED 2');
});

test('a comment whose line is gone from the diff is outdated under the same rule', async () => {
  const outcome = await tasksFor([{ id: 301, path: 'src/app.js', line: null, original_line: 2, body: 'x', user: { type: 'User' } }]);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.match(outcome.stdout, /SKIP 301 outdated\nTASKS 0 SKIPPED 1\n/);
});

test('the thread state comes from one graphql call after the comments call', async () => {
  const outcome = await tasksFor(comments);
  const calls = (await fs.readFile(outcome.log, 'utf8')).trim().split('\n');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /^api graphql /);
});
