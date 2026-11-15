import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runSearch } from './fixtures/search-cli.mjs';
import { tempDir } from './harness.mjs';
import { BlockedRoute, getText } from '../skills/spec/scripts/sources/http.mjs';
import { createHostState } from '../skills/spec/scripts/sources/host-state.mjs';

const gate = { dir: undefined, spacingMs: 0 };

test('state written by one instance is read by another on the same run dir', () => {
  const dir = tempDir('host-state-');
  createHostState({ dir, now: () => 1000 }).recordBudget('reddit.com', { remaining: 0, resetAt: 5000 });
  const other = createHostState({ dir, now: () => 2000 });
  assert.equal(other.budgetWaitMs('reddit.com'), 3000);
  assert.equal(createHostState({ dir, now: () => 6000 }).budgetWaitMs('reddit.com'), 0);
});

test('breaker opens after 3 consecutive 429 or 5xx and a success resets it', () => {
  const state = createHostState({ dir: tempDir('host-state-'), now: () => 0 });
  state.recordStatus('a.com', 429);
  state.recordStatus('a.com', 503);
  state.recordStatus('a.com', 200);
  state.recordStatus('a.com', 429);
  state.recordStatus('a.com', 500);
  assert.equal(state.isOpen('a.com'), false);
  state.recordStatus('a.com', 429);
  assert.equal(state.isOpen('a.com'), true);
  assert.equal(state.isOpen('b.com'), false);
});

test('blocked-URL memo is shared and keyed by normalized url', () => {
  const dir = tempDir('host-state-');
  createHostState({ dir }).recordBlocked('https://A.com/x#frag');
  assert.equal(createHostState({ dir }).isBlocked('https://a.com/x'), true);
  assert.equal(createHostState({ dir }).isBlocked('https://a.com/y'), false);
});

test('getText stops calling a host once its breaker is open', async () => {
  const dir = tempDir('host-state-');
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('no', { status: 429 });
  };
  const context = { fetchImpl, gate, stateDir: dir };
  for (let attempt = 0; attempt < 3; attempt += 1) await assert.rejects(getText('https://a.com/p', context), BlockedRoute);
  await assert.rejects(getText('https://a.com/q', context), /breaker is open for a\.com/);
  assert.equal(calls, 3);
});

function searchWithBudget(resetAt) {
  const dir = tempDir('host-state-');
  createHostState({ dir }).recordBudget('reddit.com/search', { remaining: 0, resetAt });
  const world = { running: true, platform: 'darwin', pages: [{ match: 'reddit.com', body: '' }] };
  return runSearch(['--source', 'reddit', '--query', 'x', '--run', dir], world);
}

test('bucket waits for the shared budget reset before taking a token', () => {
  const resetAt = Date.now() + 1500;
  const run = searchWithBudget(resetAt);
  const reads = run.events.filter((event) => event.kind === 'evaluate');
  assert.equal(reads.length, 1);
  assert.ok(reads[0].at >= resetAt);
});

test('the bucket refuses a wait over its cap without sleeping', () => {
  const start = Date.now();
  const run = searchWithBudget(start + 600000);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^status: blocked reddit rate limit wait of \d+ ms is over the 65000 ms cap/);
  assert.deepEqual(run.events, []);
  assert.ok(Date.now() - start < 30000);
});

test('getText memos a 403 url as blocked in the run dir', async () => {
  const dir = tempDir('host-state-');
  const fetchImpl = async () => new Response('no', { status: 403 });
  await assert.rejects(getText('https://a.com/private', { fetchImpl, gate, stateDir: dir }), BlockedRoute);
  assert.equal(createHostState({ dir }).isBlocked('https://a.com/private'), true);
});

test('the breaker cooldown follows EXO_HOST_COOLDOWN_MS', () => {
  const env = { EXO_HOST_COOLDOWN_MS: '5000' };
  const dir = tempDir('host-state-');
  const state = createHostState({ dir, now: () => 0, env });
  for (let attempt = 0; attempt < 3; attempt += 1) state.recordStatus('a.com', 429);
  assert.equal(state.isOpen('a.com'), true);
  const later = createHostState({ dir, now: () => 6000, env });
  assert.equal(later.isOpen('a.com'), false);
});

test('a stale lock file left by a dead process does not stop an update', () => {
  const dir = tempDir('host-state-');
  const lock = path.join(dir, 'host-state.lock');
  fs.writeFileSync(lock, '');
  const old = new Date(Date.now() - 600000);
  fs.utimesSync(lock, old, old);
  createHostState({ dir }).recordBlocked('https://a.com/x');
  assert.equal(createHostState({ dir }).isBlocked('https://a.com/x'), true);
  assert.equal(fs.existsSync(lock), false);
});

test('parallel processes recording into one run dir lose no entry', async () => {
  const { spawn } = await import('node:child_process');
  const dir = tempDir('host-state-');
  const module = path.resolve('skills/spec/scripts/sources/host-state.mjs');
  const code = `import { createHostState } from ${JSON.stringify(module)}; const s = createHostState({ dir: process.argv[1] }); for (let i = 0; i < 20; i += 1) s.recordBlocked('https://a.com/' + process.argv[2] + '-' + i);`;
  const runs = ['p', 'q', 'r'].map((name) => new Promise((resolve) => spawn(process.execPath, ['--input-type=module', '-e', code, dir, name]).on('close', resolve)));
  await Promise.all(runs);
  const state = createHostState({ dir });
  for (const name of ['p', 'q', 'r']) assert.equal(state.isBlocked(`https://a.com/${name}-19`), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'host-state.json'), 'utf8')).blocked.length, 60);
});

test('the breaker counts a 429 and a 5xx but not a 403 or 404', () => {
  const state = createHostState({ dir: tempDir('host-state-'), now: () => 0 });
  for (const status of [403, 404, 403]) state.recordStatus('b.com', status);
  assert.equal(state.isOpen('b.com'), false);
  for (const status of [429, 503, 429]) state.recordStatus('b.com', status);
  assert.equal(state.isOpen('b.com'), true);
});
