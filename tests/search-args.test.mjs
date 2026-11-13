import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { loginReddit, parseArgs } from '../skills/spec/scripts/search.mjs';
import { BlockedRoute } from '../skills/spec/scripts/sources/http.mjs';

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

test('--login is a flag with no value and needs no query', () => {
  assert.deepEqual(parseArgs(['--source', 'reddit', '--login']), { source: 'reddit', login: true });
});

test('a login that cannot find a browser prints one blocked line naming the fix', async () => {
  const open = async () => {
    throw new BlockedRoute('reddit blocked: no Brave or Google Chrome found; install one, then run search.mjs --source reddit --login');
  };
  assert.match(await loginReddit(open), /^status: blocked reddit .*install one/);
  assert.equal(await loginReddit(async () => {}), null);
});

test('--login with another source exits 2 without a browser', () => {
  const run = spawnSync(process.execPath, [script, '--source', 'web', '--login'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
});
