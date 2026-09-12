// The ledger relocates with EXO_SAVINGS_DIR, answers one enabled switch from
// EXO_SAVINGS or config.json, serializes concurrent updates behind a lock, and
// prunes sessions untouched for thirty days.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const LEDGER = fileURLToPath(new URL('../skills/savings/scripts/ledger.mjs', import.meta.url));

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

const IMPORT = `import { ledgerFile, savingsEnabled, updateSession } from ${JSON.stringify(LEDGER)};`;

test('EXO_SAVINGS_DIR relocates the ledger away from the config directory', async () => {
  const configDirectory = await fixture();
  const savingsDirectory = path.join(configDirectory, 'cell-ledger');
  const result = await runModule(`${IMPORT} console.log(ledgerFile());`, { CLAUDE_CONFIG_DIR: configDirectory, EXO_SAVINGS_DIR: savingsDirectory });
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

test('a ledger that does not parse is left untouched and the update throws', async () => {
  const directory = await fixture();
  const ledger = path.join(directory, 'sessions.json');
  await fs.writeFile(ledger, '{not json');
  const result = await runModule(`${IMPORT} updateSession('s1', () => true);`, { EXO_SAVINGS_DIR: directory });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /sessions\.json is not valid JSON/);
  assert.equal(await fs.readFile(ledger, 'utf8'), '{not json');
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
  assert.match(result.stderr, /ledger locked by another hook for over 8000 ms/);
  assert.equal(await fs.access(path.join(directory, 'sessions.json')).catch(() => 'absent'), 'absent');
});
