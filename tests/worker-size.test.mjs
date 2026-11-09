import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { agentHook } from '../hooks/agent-effort.mjs';
import { briefReads, normalizedReads, workerSize } from '../lib/worker-size.mjs';
import { tempDir } from './harness.mjs';

function folder() {
  const cwd = tempDir('worker-size-');
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

test('parenthesized text in a Reads line is prose, but a wrong path outside parentheses is still unresolved', () => {
  const cwd = folder();
  const size = (reads) => workerSize({ prompt: `Reads: ${reads}\nResult: .exo/r.md`, cwd });
  assert.deepEqual(size('b.txt (not hooks/agents), dir').unresolved, []);
  assert.equal(size('b.txt (not hooks/agents), dir').tokens, 1500);
  assert.deepEqual(size('b.txt (see hooks/agents and lib/x.mjs for context)').unresolved, []);
  assert.deepEqual(size('b.txt, hooks/agents (the folder)').unresolved, ['hooks/agents']);
  assert.deepEqual(briefReads('Reads: b.txt (not hooks/agents), dir', cwd), ['b.txt', 'dir']);
  assert.equal(normalizedReads('Reads: b.txt (not hooks/agents), dir', cwd), 'Reads: b.txt, dir');
});

test('a parenthesis inside a path word is kept', () => {
  const cwd = folder();
  fs.mkdirSync(path.join(cwd, 'app', '(group)'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'app', '(group)', 'page.txt'), 'x'.repeat(400));
  const size = workerSize({ prompt: 'Reads: app/(group)/page.txt\nResult: .exo/r.md', cwd });
  assert.deepEqual(size.unresolved, []);
  assert.equal(size.tokens, 200);
});

function repository(files) {
  const cwd = tempDir('worker-repo-');
  for (const [name, size] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
    fs.writeFileSync(path.join(cwd, name), 'x'.repeat(size));
  }
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['add', '-A'], { cwd });
  return cwd;
}

function dispatch(cwd, reads) {
  const tool_input = { subagent_type: 'general-purpose', description: 'work', prompt: `Reads: ${reads}\nResult: .exo/r.md` };
  return agentHook({ tool_name: 'Agent', cwd, tool_input }, 'on', () => false)?.hookSpecificOutput;
}

test('a bare file name with one tracked match is rewritten to its path and sized', () => {
  const cwd = repository({ 'web/src/card.jsx': 400, 'lib/other.mjs': 10 });
  const output = dispatch(cwd, 'card.jsx:1-5, lib/other.mjs');
  assert.equal(output.permissionDecision, 'allow');
  assert.match(output.updatedInput.prompt, /^Reads: web\/src\/card\.jsx:1-5, lib\/other\.mjs$/m);
});

test('a bare file name with several tracked matches is denied and the candidates are named', () => {
  const cwd = repository({ 'a/card.jsx': 10, 'b/card.jsx': 10 });
  const output = dispatch(cwd, 'card.jsx');
  assert.equal(output.permissionDecision, 'deny');
  assert.match(output.permissionDecisionReason, /card\.jsx[^\n]*a\/card\.jsx[^\n]*b\/card\.jsx/);
});

test('a bare file name with no tracked match is denied as a missing path', () => {
  const cwd = repository({ 'a/card.jsx': 10 });
  const output = dispatch(cwd, 'gone.jsx');
  assert.equal(output.permissionDecision, 'deny');
  assert.match(output.permissionDecisionReason, /do not exist: gone\.jsx/);
});

test('reads over budget move to a Search line, smallest fix first, and the dispatch is allowed', () => {
  const cwd = repository({ 'big.txt': 40000, 'mid.txt': 30000, 'small.txt': 200 });
  const output = dispatch(cwd, 'big.txt, mid.txt, small.txt');
  assert.equal(output.permissionDecision, 'allow');
  assert.match(output.updatedInput.prompt, /^Reads: big\.txt, small\.txt\nSearch: mid\.txt \(grep -n first, then read by range\)\nResult: \.exo\/r\.md$/m);
});

test('a single file over budget with no range is denied, alone or beside small reads', () => {
  const cwd = repository({ 'huge.txt': 70000, 'small.txt': 200 });
  assert.equal(dispatch(cwd, 'huge.txt').permissionDecision, 'deny');
  assert.equal(dispatch(cwd, 'huge.txt, small.txt').permissionDecision, 'deny');
});

test('fields sharing one line are each read, split at the next label', () => {
  const cwd = folder();
  const size = workerSize({ prompt: 'Reads: dir. Fetches: 2. Result: .exo/r.md', cwd });
  assert.equal(size.tokens, 1000 + 3200);
  assert.deepEqual(size.missing, []);
  assert.equal(workerSize({ prompt: 'Workers: 3; Reads: b.txt\nResult: .exo/r.md', cwd }).workers, 3);
});

test('a list marker, bold or indentation around a label is accepted and another label stays unread', () => {
  const cwd = folder();
  for (const line of ['- Reads: b.txt', '* Reads: b.txt', '1. Reads: b.txt', '**Reads:** b.txt', '  Reads: b.txt']) {
    const size = workerSize({ prompt: `${line}\nResult: .exo/r.md`, cwd });
    assert.equal(size.tokens, 500, line);
    assert.deepEqual(size.missing, [], line);
  }
  assert.deepEqual(workerSize({ prompt: 'Read first: b.txt\nResult: .exo/r.md', cwd }).missing, ['Reads']);
});

test('Fetches and Workers take their leading whole number and reject a value with none', () => {
  const cwd = folder();
  const size = workerSize({ prompt: 'Reads: none\nFetches: 2 (hard cap 3)\nWorkers: 4 (one per part)\nResult: .exo/r.md', cwd });
  assert.equal(size.tokens, 3200);
  assert.deepEqual(size.invalid, []);
  assert.equal(size.workers, 4);
  assert.deepEqual(workerSize({ prompt: 'Reads: none\nFetches: many (2)\nResult: .exo/r.md', cwd }).invalid, ['Fetches']);
  assert.equal(workerSize({ prompt: 'Workers: 1.5', cwd }).workers, undefined);
});

test('a Worktree line whose first path is a file leaves the base at the working directory', () => {
  const cwd = folder();
  const size = workerSize({ prompt: `Worktree: ${path.join(cwd, 'dir', 'a.txt')}\nReads: b.txt\nResult: .exo/r.md`, cwd });
  assert.deepEqual(size.unresolved, []);
  assert.equal(size.tokens, 500);
});

test('a label named inside parentheses or backticks in a Reads item does not split the line', () => {
  const cwd = folder();
  const prompt = 'Reads: b.txt, the code (find it with grep for Workers:, Reads:, Result: under lib/), `Result: x`\nResult: .exo/r.md';
  const size = workerSize({ prompt, cwd });
  assert.deepEqual(size.missing, []);
  assert.deepEqual(size.unresolved, []);
});

test('a web research brief with no Fetches line is sized by its distinct URLs, and refused as missing with none', () => {
  const cwd = folder();
  const listed = 'Sources: web\nSee https://example.com/a, https://example.com/b. and https://example.com/a\nResult: .exo/r.md';
  const size = workerSize({ prompt: listed, cwd, requireFetches: true });
  assert.deepEqual(size.invalid, []);
  assert.deepEqual(size.missing.filter((field) => field === 'Fetches'), []);
  assert.equal(size.tokens, 3200);
  const bare = workerSize({ prompt: 'Sources: web\nResult: .exo/r.md', cwd, requireFetches: true });
  assert.deepEqual(bare.invalid, []);
  assert.ok(bare.missing.includes('Fetches'));
});
