import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { commentStats, countCommentLines, countHookDenials, ledgerTranscripts } from '../benchmarks/comment-count.mjs';
import { commitFiles, fixture, git, gitRepository } from './harness.mjs';

test('a branch counts the comment lines it adds and not the ones the seed had', async () => {
  const repository = await gitRepository({ 'src/old.js': '// seed note\nexport const old = 1;\n' });
  git(repository, 'checkout', '-b', 'feat/work');
  await commitFiles(repository, {
    'src/new.js': '// says what the next line does\nexport const value = 2;\n// and another note\nexport const other = 3;\n',
    'README.md': '# not code\n'
  }, 'feat: add value');
  assert.equal(countCommentLines(repository, 'feat/work'), 2);
});

test('a branch with clean added code counts zero', async () => {
  const repository = await gitRepository({ 'src/old.js': 'export const old = 1;\n' });
  git(repository, 'checkout', '-b', 'feat/work');
  await commitFiles(repository, { 'src/new.js': 'export const value = 2;\n' }, 'feat: add value');
  assert.equal(countCommentLines(repository, 'feat/work'), 0);
});

test('a missing branch falls back to HEAD', async () => {
  const repository = await gitRepository({ 'src/old.js': 'export const old = 1;\n' });
  await commitFiles(repository, { 'src/new.js': '// note\nexport const value = 2;\n' }, 'feat: add value');
  assert.equal(countCommentLines(repository, 'feat/none'), 1);
});

test('denials are counted in the main and subagent transcripts', async () => {
  const directory = await fixture();
  const main = path.join(directory, 'session.jsonl');
  const delegates = path.join(directory, 'session', 'subagents');
  await fs.mkdir(delegates, { recursive: true });
  await fs.writeFile(main, '{"text":"exo comment-guard: a.js adds comment lines"}\n{"text":"fine"}\n');
  await fs.writeFile(path.join(delegates, 'agent-1.jsonl'), '{"text":"exo comment-guard: b.js"}\n{"text":"exo comment-guard: c.js"}\n');
  await fs.writeFile(path.join(delegates, 'agent-1.meta.json'), 'exo comment-guard:');
  assert.equal(countHookDenials([main]), 3);
});

test('a missing ledger names no transcripts', () => {
  assert.deepEqual(ledgerTranscripts(null), []);
});

test('the stats carry the two counts of a cell', async () => {
  const repository = await gitRepository({ 'src/old.js': 'export const old = 1;\n' });
  git(repository, 'checkout', '-b', 'feat/work');
  await commitFiles(repository, { 'src/new.js': '// note\nexport const value = 2;\n' }, 'feat: add value');
  const stats = commentStats({ repository, branch: 'feat/work', transcripts: [], hiddenPass: true });
  assert.deepEqual(stats, { commentLines: 1, hookDenials: 0, hiddenPass: true });
});
