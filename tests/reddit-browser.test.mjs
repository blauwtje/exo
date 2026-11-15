import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixturePath, runSearch } from './fixtures/search-cli.mjs';
import { tempDir } from './harness.mjs';

const BRAVE = '/Applications/Brave Browser.app';
const CHROME = '/Applications/Google Chrome.app';
const PAGES = [
  { match: 'morechildren', status: 404 },
  { match: '/_/', status: 404 },
  { match: '/svc/shreddit/', file: fixturePath('reddit-search.html') },
  { match: '/comments/', file: fixturePath('reddit-thread.json') },
];

function login(world) {
  return runSearch(['--source', 'reddit', '--login'], { platform: 'darwin', ...world });
}

function searchReddit(world, env) {
  return runSearch(['--source', 'reddit', '--query', 'caching', '--limit', '1', '--run', tempDir('reddit-browser-')], { platform: 'darwin', pages: PAGES, ...world }, env);
}

test('profile directory sits under the cache home', () => {
  const run = login({ installed: [BRAVE] });
  const flag = run.events.find((event) => event.kind === 'spawn').args.find((arg) => arg.startsWith('--user-data-dir='));
  assert.equal(flag, `--user-data-dir=${run.home}/exo/reddit-browser`);
});

test('browser lookup prefers Brave and names the fix when none is installed', () => {
  assert.match(login({ installed: [BRAVE, CHROME] }).events[0].args.join(' '), /Brave/);
  assert.match(login({ installed: [CHROME] }).events[0].args.join(' '), /Chrome/);
  const none = login({ installed: [] });
  assert.equal(none.status, 1);
  assert.match(none.stdout, /^status: blocked reddit .*no Brave or Google Chrome found/);
});

test('a running browser is reused and the fetch runs in the page with credentials', () => {
  const run = searchReddit({ installed: [BRAVE], running: true });
  assert.equal(run.status, 0);
  assert.equal(run.events.some((event) => event.kind === 'spawn'), false);
  const call = run.events.find((event) => event.kind === 'evaluate');
  assert.match(call.expression, /credentials: 'include'/);
  assert.equal(call.awaitPromise, true);
  assert.ok(run.events.some((event) => event.kind === 'closed'));
  assert.match(JSON.parse(run.lines[0]).url, /abc123/);
});

test('a missing browser is started with open on macOS', () => {
  const run = searchReddit({ installed: [BRAVE], running: false });
  const spawned = run.events.find((event) => event.kind === 'spawn');
  assert.equal(spawned.command, 'open');
  assert.deepEqual(spawned.args.slice(0, 4), ['-g', '-j', '-na', BRAVE]);
  assert.ok(spawned.args.some((arg) => arg.startsWith(`--user-data-dir=${run.home}/exo/reddit-browser`)));
});

test('a 403 inside the session is blocked with the login fix', () => {
  const run = searchReddit({ installed: [BRAVE], running: true, pages: [{ match: 'reddit.com', status: 403 }] });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^status: blocked reddit .*--login/);
});

test('login starts the browser on the login page', () => {
  const run = login({ installed: [BRAVE], running: false });
  assert.ok(run.events.find((event) => event.kind === 'spawn').args.includes('https://www.reddit.com/login/'));
});

test('start wait gives up per EXO_REDDIT_BROWSER_MS', () => {
  const run = searchReddit({ installed: [BRAVE], running: false, starts: false }, { EXO_REDDIT_BROWSER_MS: '5' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /did not start/);
});
