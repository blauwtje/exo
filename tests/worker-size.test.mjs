import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { briefReads, normalizedReads, workerSize } from '../lib/worker-size.mjs';

function folder() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-size-'));
  fs.mkdirSync(path.join(cwd, 'dir'));
  fs.writeFileSync(path.join(cwd, 'dir', 'a.txt'), 'x'.repeat(2000));
  fs.writeFileSync(path.join(cwd, 'b.txt'), 'x'.repeat(1000));
  return cwd;
}

test('tokens sum folder and file bytes at 2 bytes per token plus 1600 per fetch', () => {
  const cwd = folder();
  const size = workerSize({ prompt: 'Reads: dir, b.txt\nFetches: 2\nResult: .exo/r.md', cwd });
  assert.equal(size.tokens, 1500 + 3200);
  assert.equal(size.budget, 30000);
  assert.deepEqual(size.missing, []);
});

test('Reads none counts zero and a missing line is reported', () => {
  const cwd = folder();
  assert.equal(workerSize({ prompt: 'Reads: none\nResult: .exo/r.md', cwd }).tokens, 0);
  assert.deepEqual(workerSize({ prompt: 'x', cwd }).missing, ['Reads', 'Result']);
  assert.deepEqual(workerSize({ prompt: 'Reads: none\nResult: out.txt', cwd }).missing, ['Result']);
});

test('a line range counts only the bytes of its lines in every form', () => {
  const cwd = folder();
  fs.writeFileSync(path.join(cwd, 'c.txt'), ['a'.repeat(100), 'b'.repeat(200), 'c'.repeat(300)].join('\n'));
  const tokens = (reads) => workerSize({ prompt: `Reads: ${reads}\nResult: .exo/r.md`, cwd }).tokens;
  assert.equal(tokens('c.txt:2-3'), 251);
  assert.equal(tokens('c.txt:L2-L3'), 251);
  assert.equal(tokens('c.txt#L2-L3'), 251);
  assert.equal(tokens('c.txt:3'), 150);
  assert.equal(tokens('c.txt:2-99'), 251);
  assert.equal(tokens('c.txt'), 301);
});

test('a backticked Result file is accepted', () => {
  const cwd = folder();
  assert.deepEqual(workerSize({ prompt: 'Reads: none\nResult: `.exo/r.md`', cwd }).missing, []);
});

test('a folder walk skips node_modules and .git', () => {
  const cwd = folder();
  for (const skipped of ['node_modules', '.git']) {
    fs.mkdirSync(path.join(cwd, 'dir', skipped));
    fs.writeFileSync(path.join(cwd, 'dir', skipped, 'big.txt'), 'x'.repeat(100000));
  }
  assert.equal(workerSize({ prompt: 'Reads: dir\nResult: .exo/r.md', cwd }).tokens, 1000);
});

test('every Reads form is sized and unresolved, invalid and largest are named', () => {
  const cwd = folder();
  const prompt = '- Reads: `b.txt#L1-L5` dir/a.txt:L1-L9, gone.txt\nFetches: x\nResult: .exo/r.md';
  const size = workerSize({ prompt, cwd });
  assert.equal(size.tokens, 1500);
  assert.deepEqual(size.unresolved, ['gone.txt']);
  assert.deepEqual(size.invalid, ['Fetches']);
  assert.deepEqual(size.largest, [
    { path: 'dir/a.txt', tokens: 1000 },
    { path: 'b.txt', tokens: 500 },
    { path: 'gone.txt', tokens: 0 },
  ]);
});

test('workers parses a positive integer Workers line and is undefined otherwise', () => {
  const cwd = folder();
  assert.equal(workerSize({ prompt: 'Workers: 3', cwd }).workers, 3);
  assert.equal(workerSize({ prompt: 'Workers: 0', cwd }).workers, undefined);
  assert.equal(workerSize({ prompt: 'Workers: many', cwd }).workers, undefined);
  assert.equal(workerSize({ prompt: 'x', cwd }).workers, undefined);
});

test('a Reads line keeps only path items: prose, none., trailing punctuation and globs', () => {
  const cwd = folder();
  fs.mkdirSync(path.join(cwd, 'hooks'));
  fs.writeFileSync(path.join(cwd, 'hooks', 'x.mjs'), 'x'.repeat(400));
  fs.writeFileSync(path.join(cwd, 'hooks', 'y.mjs'), 'x'.repeat(600));
  const size = (reads) => workerSize({ prompt: `Reads: ${reads}\nResult: .exo/r.md`, cwd });
  assert.deepEqual(size('none.').unresolved, []);
  assert.equal(size('None').tokens, 0);
  assert.deepEqual(size('hooks/*.mjs, the hook tests (find them with grep)').unresolved, []);
  assert.equal(size('hooks/*.mjs, the hook tests (find them with grep)').tokens, 500);
  assert.equal(size('`b.txt`, dir.').tokens, 1500);
  assert.deepEqual(size('hooks/*.txt').unresolved, ['hooks/*.txt']);
});

test('Reads paths resolve against the brief Worktree line when it names a folder', () => {
  const cwd = folder();
  const worktree = folder();
  fs.writeFileSync(path.join(worktree, 'only-here.md'), 'x'.repeat(200));
  const prompt = `Worktree: ${worktree}, branch \`x\`, at main\nReads: only-here.md\nResult: \`${worktree}/.exo/r.md\` (detail here)`;
  assert.deepEqual(workerSize({ prompt, cwd }).unresolved, []);
  assert.equal(workerSize({ prompt, cwd }).tokens, 100);
  assert.deepEqual(workerSize({ prompt, cwd }).missing, []);
});

test('normalizedReads rewrites a pure path or none line and leaves prose alone', () => {
  const cwd = folder();
  assert.equal(normalizedReads('Reads: none.\nResult: .exo/r.md', cwd), 'Reads: none\nResult: .exo/r.md');
  assert.equal(normalizedReads('Reads: `b.txt`, dir/a.txt.', cwd), 'Reads: b.txt, dir/a.txt');
  assert.equal(normalizedReads('Reads: b.txt and the tests', cwd), 'Reads: b.txt and the tests');
  assert.equal(normalizedReads('Reads: b.txt, dir', cwd), 'Reads: b.txt, dir');
  assert.deepEqual(briefReads('Reads: hooks/*.none, b.txt.', cwd), ['hooks/*.none', 'b.txt']);
});
