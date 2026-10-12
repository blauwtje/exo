import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../strip-comments.mjs', import.meta.url));

function withFile(name, text, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strip-comments-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  try {
    return run(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function strip(text, ...flags) {
  return withFile('a.mjs', text, (file) => {
    const run = spawnSync(process.execPath, [script, file, ...flags], { encoding: 'utf8' });
    return { ...run, file, after: fs.readFileSync(file, 'utf8') };
  });
}

test('lists each disallowed comment and a summary line, and exits 1', () => {
  const run = strip('const a = 1;\n// explain\nconst b = 2; // tail\n');
  const lines = run.stdout.trim().split('\n');
  assert.equal(run.status, 1);
  assert.equal(lines[0], `${run.file}:2 // explain`);
  assert.equal(lines[1], `${run.file}:3 const b = 2; // tail`);
  assert.equal(lines[2], 'comments=2 disallowed=2 lines=3 percent=66.7');
});

test('a file without disallowed comments exits 0', () => {
  const run = strip('const a = 1; // why: the API sorts by id\n');
  assert.equal(run.status, 0);
  assert.equal(run.stdout.trim(), 'comments=1 disallowed=0 lines=1 percent=0.0');
});

test('a doc comment above an export is disallowed', () => {
  const run = strip('/** Adds. */\nexport function add() {}\n');
  assert.equal(run.status, 1);
  assert.match(run.stdout, /:1 \/\*\* Adds\. \*\//);
});

test('--write removes standalone lines whole and trailing comments with their spaces', () => {
  const run = strip('const a = 1;\n// explain\nconst b = 2;   // tail\n', '--write');
  assert.equal(run.after, 'const a = 1;\nconst b = 2;\n');
});

test('--write drops a blank line left beside another blank line or at the file start', () => {
  assert.equal(strip('a();\n\n// c\n\nb();\n', '--write').after, 'a();\n\nb();\n');
  assert.equal(strip('// c\n\na();\n', '--write').after, 'a();\n');
  assert.equal(strip('a();\n\n\nb();\n// c\n', '--write').after, 'a();\n\n\nb();\n');
});

test('--write keeps an allowed comment and a shebang, and removes a block comment', () => {
  const text = '#!/usr/bin/env node\n/*\n one\n*/\nconst a = 1; // why: forced\n';
  assert.equal(strip(text, '--write').after, '#!/usr/bin/env node\nconst a = 1; // why: forced\n');
});

test('a folder is walked and non-code files are skipped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strip-comments-'));
  try {
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'a.mjs'), '// one\nconst a = 1;\n');
    fs.writeFileSync(path.join(dir, 'notes.md'), '// not code\n');
    const run = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.equal(run.stdout.trim().split('\n').at(-1), 'comments=1 disallowed=1 lines=2 percent=50.0');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
