import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parseArgs } from '../skills/spec/scripts/search.mjs';

const script = new URL('../skills/spec/scripts/search.mjs', import.meta.url).pathname;
const urls = ['a', 'b', 'c', 'd', 'e'].map((id) => `https://www.reddit.com/r/x/comments/${id}/t/`);

test('five urls after one --url are all parsed', () => {
  assert.deepEqual(parseArgs(['--source', 'reddit', '--url', ...urls, '--run', 'r']).urls, urls);
});

test('a repeated --url accumulates', () => {
  assert.deepEqual(parseArgs(['--url', urls[0], '--url', urls[1]]).urls, urls.slice(0, 2));
});

test('a value no flag owns throws naming it', () => {
  assert.throws(() => parseArgs(['--source', 'web', 'reddit', '--query', 'x']), /reddit/);
  assert.throws(() => parseArgs(['stray', '--query', 'x']), /stray/);
});

test('the script exits non-zero and names an unowned value', () => {
  const run = spawnSync(process.execPath, [script, '--source', 'web', 'reddit', '--query', 'x', '--run', 'r'], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /reddit/);
});
