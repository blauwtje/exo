import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { detailLogPath, forCaller, keepLines } from '#script-output';
import { tempDir } from './harness.mjs';

function tempRoot() {
  const root = tempDir('script-output-');
  spawnSync('git', ['init', '-q', root]);
  return root;
}

test('keepLines keeps the lines the caller reads and the trailing newline', () => {
  const text = 'Landed: 1\nnoise\nRoute: x\n';
  assert.equal(keepLines(text, (line) => !line.startsWith('noise')), 'Landed: 1\nRoute: x\n');
});

test('keepLines returns an empty string when nothing is read', () => {
  assert.equal(keepLines('a\nb\n', () => false), '');
});

test('forCaller returns the full text when nothing was cut', () => {
  assert.equal(forCaller({ root: tempRoot(), name: 'same', full: 'a\n', shown: 'a\n' }), 'a\n');
});

test('forCaller writes the full text to a log and names it in one Detail line', () => {
  const root = tempRoot();
  const output = forCaller({ root, name: 'cut', full: 'a\nb\n', shown: 'a\n' });
  const file = detailLogPath(root, 'cut');
  assert.equal(output, `a\nDetail: ${file}\n`);
  assert.equal(fs.readFileSync(file, 'utf8'), 'a\nb\n');
});
