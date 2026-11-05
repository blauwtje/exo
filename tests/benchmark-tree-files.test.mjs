import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { filesNamed, relativeFiles } from '../benchmarks/tree-files.mjs';
import { tempDir } from './harness.mjs';

function tree(files) {
  const root = tempDir('exo-tree-files-');
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), '');
  }
  return root;
}

test('relativeFiles lists every file below the directory as a relative path', () => {
  const root = tree(['a.txt', path.join('b', 'c.txt'), path.join('b', 'd', 'e.txt')]);
  assert.deepEqual(relativeFiles(root).sort(), ['a.txt', path.join('b', 'c.txt'), path.join('b', 'd', 'e.txt')]);
});

test('filesNamed keeps only the files with that name at any depth', () => {
  const root = tree(['result.json', path.join('x', 'result.json'), path.join('x', 'other.json'), path.join('y', 'z', 'result.json')]);
  assert.deepEqual(filesNamed(root, 'result.json').sort(), ['result.json', path.join('x', 'result.json'), path.join('y', 'z', 'result.json')]);
});
