import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '../skills/spec/scripts/sources/reddit-bucket.mjs';
import { createHostState } from '../skills/spec/scripts/sources/host-state.mjs';
import { BlockedRoute } from '../skills/spec/scripts/sources/http.mjs';

const SETTINGS = { capacity: 3, refillMs: 400, waitCapMs: 65_000 };
const SEARCH = 'https://www.reddit.com/svc/shreddit/search/?q=x&type=posts';
const THREAD = 'https://www.reddit.com/comments/abc123.json?limit=500&raw_json=1';

function clientFor(stateDir, status = 200) {
  const pageFetch = async () => ({ status, text: 'ok' });
  return createClient({ pageFetch, stateDir, now: () => 0, sleep: async () => {} }, SETTINGS);
}

test('a client returns the page text for a 2xx answer', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-'));
  assert.equal(await clientFor(dir).get(SEARCH), 'ok');
});

test('search and thread reads keep separate host-state keys and a 5xx run opens only its own', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-'));
  for (let attempt = 0; attempt < 3; attempt += 1) await assert.rejects(clientFor(dir, 503).get(THREAD), BlockedRoute);
  const state = createHostState({ dir, now: () => 0 });
  assert.equal(state.isOpen('reddit.com/thread'), true);
  assert.equal(state.isOpen('reddit.com/search'), false);
  await assert.rejects(clientFor(dir).get(THREAD), /breaker/);
  assert.equal(await clientFor(dir).get(SEARCH), 'ok');
});
