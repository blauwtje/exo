import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { locatedReads, workerSize } from '../lib/worker-size.mjs';
import { tempDir } from './harness.mjs';

function folder() {
  const cwd = tempDir('brief-reads-');
  const write = (name, text) => {
    fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
    fs.writeFileSync(path.join(cwd, name), text);
  };
  write('.exo/notes/b-fixes.md', Array.from({ length: 200 }, () => 'n'.repeat(99)).join('\n'));
  write('agents/orchestrator.md', 'o'.repeat(3000));
  write('docs/principles/README.md', 'p'.repeat(1000));
  write('CONTRIBUTING.md', 'c'.repeat(70000));
  write('tests/big.test.mjs', 't'.repeat(80000));
  return cwd;
}

const sized = (reads, cwd) => workerSize({ prompt: `Reads: ${reads}\nResult: .exo/r.md`, cwd });

test('a line range and a grep qualifier in prose keep a brief under budget', () => {
  const cwd = folder();
  const size = sized('.exo/notes/b-fixes.md lines 55-110 only; agents/orchestrator.md; docs/principles/README.md, then only the one page it names; CONTRIBUTING.md only by grep.', cwd);
  assert.deepEqual(size.unresolved, []);
  assert.equal(size.tokens, Math.round((56 * 100 - 1) / 2 + 1500 + 500));
  assert.ok(size.tokens < size.budget);
});

test('prose with a slash in a Reads item is not a path', () => {
  const cwd = folder();
  const reads = '.exo/notes/b-fixes.md lines 80-100 only; `git show e2a841d3 --stat` and only the hunks you need; docs/principles/README.md, then only the one page it names; the hook/lib code that gates Agent launches (find it with grep for `Reads:`, in hooks/ and lib/)';
  const size = sized(reads, cwd);
  assert.deepEqual(size.unresolved, []);
  assert.equal(size.tokens, Math.round((21 * 100 - 1) / 2 + 500));
});

test('a prose word that names a folder is not costed and a parenthesized range counts', () => {
  const cwd = folder();
  const size = sized('the hook tests (find them with grep), `.exo/notes/b-fixes.md` (lines 1-2), hook/lib code, none.', cwd);
  assert.deepEqual(size.unresolved, []);
  assert.equal(size.tokens, 100);
});

test('a named file with an extension that does not exist is still reported', () => {
  const cwd = folder();
  assert.deepEqual(sized('lib/missing.mjs lines 1-5, agents/orchestrator.md', cwd).unresolved, ['lib/missing.mjs']);
});

test('a brief with prose items keeps its Reads line as written', () => {
  const cwd = folder();
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['add', '.'], { cwd });
  const prompt = 'Reads: b-fixes.md lines 80-100 only; the hook/lib code (grep it)\nResult: .exo/r.md';
  assert.equal(locatedReads(prompt, cwd).prompt, 'Reads: .exo/notes/b-fixes.md lines 80-100 only; the hook/lib code (grep it)\nResult: .exo/r.md');
});

test('a leading ~/ in a Reads item resolves under the home directory', () => {
  const home = tempDir('brief-home-');
  fs.writeFileSync(path.join(home, 'notes.md'), 'n'.repeat(1000));
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    const size = sized('~/notes.md', folder());
    assert.deepEqual(size.unresolved, []);
    assert.equal(size.tokens, 500);
  } finally {
    process.env.HOME = saved;
  }
});
