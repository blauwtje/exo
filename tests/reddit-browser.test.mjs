import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findBrowser, loginBrowser, pageFetch, profileDirectory } from '../skills/spec/scripts/sources/reddit-browser.mjs';
import { BlockedRoute } from '../skills/spec/scripts/sources/http.mjs';

const ENV = { XDG_CACHE_HOME: '/tmp/cache-placeholder' };

function fakeSocketClass(reply, sent) {
  return class {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      sent.push(url);
      queueMicrotask(() => this.listeners.open?.({}));
    }
    addEventListener(name, handler) {
      this.listeners[name] = handler;
    }
    send(message) {
      sent.push(JSON.parse(message));
      queueMicrotask(() => this.listeners.message({ data: JSON.stringify({ id: 1, result: { result: { value: reply } } }) }));
    }
    close() {
      sent.push('closed');
    }
  };
}

function fakes({ reply, running = true, spawned = [], sent = [], exists = () => true }) {
  let portReady = running;
  const fetchImpl = async (url, options) => {
    if (!portReady) throw new Error('refused');
    const json = url.endsWith('/json/list') ? [{ type: 'page', url: 'https://www.reddit.com/', webSocketDebuggerUrl: 'ws://tab' }] : {};
    return { ok: true, json: async () => json, options };
  };
  return {
    env: ENV,
    platform: 'darwin',
    exists,
    fetchImpl,
    readFile: () => {
      if (!portReady) throw new Error('none');
      return '9222\n/devtools/browser/x';
    },
    spawn: (command, args) => {
      spawned.push({ command, args });
      portReady = true;
      return { unref() {} };
    },
    sleep: async () => {},
    WebSocketImpl: fakeSocketClass(reply, sent),
  };
}

test('profile directory sits under the cache home', () => {
  assert.equal(profileDirectory(ENV), '/tmp/cache-placeholder/exo/reddit-browser');
});

test('browser lookup prefers Brave and names the fix when none is installed', () => {
  assert.match(findBrowser({ platform: 'darwin', exists: () => true }), /Brave/);
  assert.match(findBrowser({ platform: 'darwin', exists: (file) => file.includes('Chrome') }), /Chrome/);
  assert.throws(() => findBrowser({ platform: 'darwin', exists: () => false }), BlockedRoute);
});

test('a running browser is reused and the fetch runs in the page with credentials', async () => {
  const spawned = [];
  const sent = [];
  const reply = { status: 200, text: '{"ok":true}' };
  const result = await pageFetch('https://www.reddit.com/comments/abc.json', fakes({ reply, spawned, sent }));
  assert.deepEqual(result, reply);
  assert.equal(spawned.length, 0);
  const call = sent.find((item) => item.method === 'Runtime.evaluate');
  assert.match(call.params.expression, /credentials: 'include'/);
  assert.equal(call.params.awaitPromise, true);
  assert.ok(sent.includes('closed'));
});

test('a missing browser is started with open on macOS', async () => {
  const spawned = [];
  await pageFetch('https://www.reddit.com/x', fakes({ reply: { status: 200, text: '' }, running: false, spawned }));
  assert.equal(spawned[0].command, 'open');
  assert.deepEqual(spawned[0].args.slice(0, 4), ['-g', '-j', '-na', '/Applications/Brave Browser.app']);
  assert.ok(spawned[0].args.some((arg) => arg.startsWith('--user-data-dir=/tmp/cache-placeholder/exo/reddit-browser')));
});

test('a 403 inside the session is blocked with the login fix', async () => {
  await assert.rejects(() => pageFetch('https://www.reddit.com/x', fakes({ reply: { status: 403, text: '' } })), /--login/);
});

test('login starts the browser on the login page', async () => {
  const spawned = [];
  await loginBrowser(fakes({ reply: {}, running: false, spawned }));
  assert.ok(spawned[0].args.includes('https://www.reddit.com/login/'));
});

test('start wait gives up per EXO_REDDIT_BROWSER_MS', async () => {
  const context = fakes({ reply: {}, running: false });
  context.spawn = () => ({ unref() {} });
  context.env = { ...ENV, EXO_REDDIT_BROWSER_MS: '5' };
  await assert.rejects(() => pageFetch('https://www.reddit.com/x', context), /did not start/);
});
