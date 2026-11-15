import assert from 'node:assert/strict';
import test from 'node:test';
import { tempDir } from './harness.mjs';
import { fixturePath, runSearch } from './fixtures/search-cli.mjs';

const ids = ['a', 'b', 'c', 'd', 'e'];
const urls = ids.map((id) => `https://www.reddit.com/r/x/comments/${id}/t/`);
const BRAVE = '/Applications/Brave Browser.app';
const RUNNING = {
  running: true,
  pages: [
    { match: 'morechildren', status: 404 },
    { match: '/_/', status: 404 },
    { match: '/comments/', file: fixturePath('reddit-thread.json') },
  ],
};

function threadsRead(args) {
  const run = runSearch(['--source', 'reddit', ...args, '--run', tempDir('search-args-')], RUNNING);
  const reads = run.events.filter((event) => event.kind === 'evaluate').map((event) => event.url.match(/\/comments\/(\w+)\.json/)?.[1]);
  return reads.filter(Boolean).sort();
}

test('five urls after one --url are all parsed', () => {
  assert.deepEqual(threadsRead(['--url', ...urls]), ids);
});

test('a repeated --url accumulates', () => {
  assert.deepEqual(threadsRead(['--url', urls[0], '--url', urls[1]]), ['a', 'b']);
});

test('a value no flag owns exits 2 naming it', () => {
  const unowned = runSearch(['--source', 'web', 'reddit', '--query', 'x', '--run', 'r']);
  assert.equal(unowned.status, 2);
  assert.match(unowned.stderr, /reddit/);
  const stray = runSearch(['stray', '--query', 'x']);
  assert.equal(stray.status, 2);
  assert.match(stray.stderr, /stray/);
});

test('--login is a flag with no value and needs no query', () => {
  const run = runSearch(['--source', 'reddit', '--login'], { installed: [BRAVE], platform: 'darwin' });
  assert.equal(run.status, 0);
  assert.equal(run.stderr, '');
  assert.ok(run.events.find((event) => event.kind === 'spawn').args.includes('https://www.reddit.com/login/'));
});

test('a login that cannot find a browser prints one blocked line naming the fix', () => {
  const missing = runSearch(['--source', 'reddit', '--login'], { installed: [], platform: 'darwin' });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /^status: blocked reddit .*install one/);
  const found = runSearch(['--source', 'reddit', '--login'], { installed: [BRAVE], platform: 'darwin' });
  assert.equal(found.stdout, '');
});

test('--login with another source exits 2 without a browser', () => {
  const run = runSearch(['--source', 'web', '--login'], { installed: [BRAVE], platform: 'darwin' });
  assert.equal(run.status, 2);
  assert.deepEqual(run.events, []);
});
