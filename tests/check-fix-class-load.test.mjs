import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkFixClassLoad } from '../verify/checks/fix-class-load.mjs';
import { createRepository } from '../verify/repository.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEXTS = ['agents/fix-review.md', 'skills/build/review-fixer-prompt.md', 'skills/find-cause/fixer-prompt.md', 'agents/build-task.md'];

function lines(edit) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-class-load-'));
  for (const file of TEXTS) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(root, file));
  }
  edit((file, change) => {
    const target = path.join(root, file);
    fs.writeFileSync(target, change(fs.readFileSync(target, 'utf8')));
  });
  const results = [];
  checkFixClassLoad({ result: (status, name, detail) => results.push(`[${status}] ${name}: ${detail}`) }, createRepository(root));
  return results;
}

const withoutReference = (text) => text.replaceAll('fix-class.md', 'other.md');

test('the shipped repair texts all pass', () => {
  assert.deepEqual(lines(() => {}).map((line) => line.slice(0, 6)), ['[PASS]']);
});

test('each repair text missing the reference is its own FAIL line naming the file', () => {
  const results = lines((edit) => {
    edit('agents/fix-review.md', withoutReference);
    edit('agents/build-task.md', withoutReference);
  });
  assert.equal(results.length, 2);
  assert.match(results[0], /^\[FAIL\] fix-class load: agents\/fix-review\.md /);
  assert.match(results[1], /^\[FAIL\] fix-class load: agents\/build-task\.md /);
});

test('the find-cause fixer must name the reference in its Shared block, not only before it', () => {
  const results = lines((edit) => edit('skills/find-cause/fixer-prompt.md', (text) => {
    const at = text.indexOf('## Shared block');
    return `${text.slice(0, at)}fix-class.md\n${withoutReference(text.slice(at))}`;
  }));
  assert.equal(results.length, 1);
  assert.match(results[0], /fixer-prompt\.md \(## Shared block\)/);
});
