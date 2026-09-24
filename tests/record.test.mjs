// The record relocates with EXO_SAVINGS_DIR, answers one enabled switch from
// EXO_SAVINGS or config.json, serializes concurrent updates behind a lock, and
// prunes sessions untouched for thirty days.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const RECORD = fileURLToPath(new URL('../skills/savings/scripts/record.mjs', import.meta.url));

function runModule(source, env) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--input-type=module', '-e', source],
      // The child's stdout is read, not displayed, and console.log paints a
      // boolean yellow once FORCE_COLOR is set in the terminal that started the
      // run; the assertions compare the value, so colour is switched off here.
      { env: { ...process.env, FORCE_COLOR: '0', ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
  });
}

const IMPORT = `import { recordFile, savingsEnabled, updateSession } from ${JSON.stringify(RECORD)};`;
const HOT_IMPORT = `import { hotFile, updateHotSession, updateSession } from ${JSON.stringify(RECORD)};`;

test('EXO_SAVINGS_DIR relocates the record away from the config directory', async () => {
  const configDirectory = await fixture();
  const savingsDirectory = path.join(configDirectory, 'cell-record');
  const result = await runModule(`${IMPORT} console.log(recordFile());`, { CLAUDE_CONFIG_DIR: configDirectory, EXO_SAVINGS_DIR: savingsDirectory });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), path.join(savingsDirectory, 'sessions.json'));
});

test('savingsEnabled reads EXO_SAVINGS first and config.json enabled second', async () => {
  const directory = await fixture();
  const check = (env) => runModule(`${IMPORT} console.log(savingsEnabled());`, { EXO_SAVINGS_DIR: directory, ...env });
  assert.equal((await check({})).stdout.trim(), 'true');
  await fs.writeFile(path.join(directory, 'config.json'), JSON.stringify({ enabled: false }));
  assert.equal((await check({})).stdout.trim(), 'false');
  assert.equal((await check({ EXO_SAVINGS: 'on' })).stdout.trim(), 'true');
  await fs.writeFile(path.join(directory, 'config.json'), JSON.stringify({ readGuard: false }));
  assert.equal((await check({ EXO_SAVINGS: 'off' })).stdout.trim(), 'false');
});

test('concurrent updates behind the lock lose no increment', async () => {
  const directory = await fixture();
  const increment = `${IMPORT} updateSession('s1', (session) => { session.guard.hookMs += 1; return true; });`;
  const writers = Array.from({ length: 8 }, () => runModule(increment, { EXO_SAVINGS_DIR: directory }));
  const results = await Promise.all(writers);
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  const sessions = JSON.parse(await fs.readFile(path.join(directory, 'sessions.json'), 'utf8'));
  assert.equal(sessions.s1.guard.hookMs, 8);
  assert.equal(await fs.access(path.join(directory, 'sessions.json.lock')).catch(() => 'absent'), 'absent');
});

test('a session untouched for thirty days is pruned, an undated one is kept', async () => {
  const directory = await fixture();
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  await fs.writeFile(path.join(directory, 'sessions.json'), JSON.stringify({
    stale: { touched: old, guard: { hookMs: 1, refusals: {} } },
    undated: { guard: { hookMs: 2, refusals: {} } }
  }));
  const result = await runModule(`${IMPORT} updateSession('fresh', () => true);`, { EXO_SAVINGS_DIR: directory });
  assert.equal(result.code, 0, result.stderr);
  const sessions = JSON.parse(await fs.readFile(path.join(directory, 'sessions.json'), 'utf8'));
  assert.deepEqual(Object.keys(sessions).sort(), ['fresh', 'undated']);
  assert.match(sessions.fresh.touched, /^\d{4}-\d{2}-\d{2}T/);
});

test('a record that does not parse is left untouched and the update throws', async () => {
  const directory = await fixture();
  const record = path.join(directory, 'sessions.json');
  await fs.writeFile(record, '{not json');
  const result = await runModule(`${IMPORT} updateSession('s1', () => true);`, { EXO_SAVINGS_DIR: directory });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /sessions\.json is not valid JSON/);
  assert.equal(await fs.readFile(record, 'utf8'), '{not json');
});

test('a lock older than the stale threshold is taken over', async () => {
  const directory = await fixture();
  const lock = path.join(directory, 'sessions.json.lock');
  await fs.mkdir(lock);
  const expired = new Date(Date.now() - 20_000);
  await fs.utimes(lock, expired, expired);
  const result = await runModule(`${IMPORT} updateSession('s1', () => true);`, { EXO_SAVINGS_DIR: directory });
  assert.equal(result.code, 0, result.stderr);
  const sessions = JSON.parse(await fs.readFile(path.join(directory, 'sessions.json'), 'utf8'));
  assert.deepEqual(Object.keys(sessions), ['s1']);
});

test('a live lock makes the waiter give up without writing', async () => {
  const directory = await fixture();
  await fs.mkdir(path.join(directory, 'sessions.json.lock'));
  const result = await runModule(`${IMPORT} updateSession('s1', () => true);`, { EXO_SAVINGS_DIR: directory });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /savings counter locked by another hook for over 8000 ms/);
  assert.equal(await fs.access(path.join(directory, 'sessions.json')).catch(() => 'absent'), 'absent');
});

test('updateHotSession writes only the hot file, twice leaves no lock', async () => {
  const directory = await fixture();
  const increment = `${HOT_IMPORT} updateHotSession('s1', (session) => { session.calls.n = (session.calls.n ?? 0) + 1; return true; });`;
  await runModule(increment, { EXO_SAVINGS_DIR: directory });
  const result = await runModule(increment, { EXO_SAVINGS_DIR: directory });
  assert.equal(result.code, 0, result.stderr);
  const hot = JSON.parse(await fs.readFile(path.join(directory, 'sessions', 's1.json'), 'utf8'));
  assert.equal(hot.calls.n, 2);
  assert.equal(await fs.access(path.join(directory, 'sessions.json')).catch(() => 'absent'), 'absent');
  assert.equal(await fs.access(path.join(directory, 'sessions', 's1.json.lock')).catch(() => 'absent'), 'absent');
});

test('updateHotSession rejects a session id that escapes the sessions directory', async () => {
  const directory = await fixture();
  const result = await runModule(`${HOT_IMPORT} updateHotSession('../x', () => true);`, { EXO_SAVINGS_DIR: directory });
  assert.notEqual(result.code, 0);
});

test('a seeded hot session keeps a refusal already recorded in sessions.json', async () => {
  const directory = await fixture();
  await fs.writeFile(path.join(directory, 'sessions.json'), JSON.stringify({
    s1: { guard: { hookMs: 0, refusals: { 'file.md': 1 } } }
  }));
  const result = await runModule(`${HOT_IMPORT} updateHotSession('s1', () => false);`, { EXO_SAVINGS_DIR: directory });
  assert.equal(result.code, 0, result.stderr);
  const hot = JSON.parse(await fs.readFile(path.join(directory, 'sessions', 's1.json'), 'utf8'));
  assert.deepEqual(hot.guard.refusals, { 'file.md': 1 });
});

test('a Stop updateSession folds the hot guard.refusals into the cold row', async () => {
  const directory = await fixture();
  await runModule(`${HOT_IMPORT} updateHotSession('s1', (session) => { session.guard.refusals['file.md'] = 1; return true; });`, { EXO_SAVINGS_DIR: directory });
  const result = await runModule(`${IMPORT} updateSession('s1', () => true);`, { EXO_SAVINGS_DIR: directory });
  assert.equal(result.code, 0, result.stderr);
  const sessions = JSON.parse(await fs.readFile(path.join(directory, 'sessions.json'), 'utf8'));
  assert.deepEqual(sessions.s1.guard.refusals, { 'file.md': 1 });
});

test('a pruned cold row loses its hot file too', async () => {
  const directory = await fixture();
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  await fs.writeFile(path.join(directory, 'sessions.json'), JSON.stringify({
    stale: { touched: old, guard: { hookMs: 1, refusals: {} } }
  }));
  await fs.mkdir(path.join(directory, 'sessions'), { recursive: true });
  await fs.writeFile(path.join(directory, 'sessions', 'stale.json'), JSON.stringify({ guard: { hookMs: 1, refusals: {} } }));
  const result = await runModule(`${IMPORT} updateSession('fresh', () => true);`, { EXO_SAVINGS_DIR: directory });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await fs.access(path.join(directory, 'sessions', 'stale.json')).catch(() => 'absent'), 'absent');
});

test('a stale lock directory of an ended session is removed', async () => {
  const directory = await fixture();
  const lock = path.join(directory, 'sessions', 'ended.json.lock');
  await fs.mkdir(lock, { recursive: true });
  const expired = new Date(Date.now() - 20000);
  await fs.utimes(lock, expired, expired);
  const result = await runModule(`${IMPORT} updateSession('fresh', () => true);`, { EXO_SAVINGS_DIR: directory });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await fs.access(lock).catch(() => 'absent'), 'absent');
});
