// The heavy-run wrapper runs a command once per code state across sessions.
// Each test uses a temporary git repository, a temporary cache root and a fake
// heavy command that appends a line to a counter file on every run.

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const WRAPPER = fileURLToPath(new URL('../hooks/heavy-run.mjs', import.meta.url));

function fixture({ repository = true } = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-run-')));
  const work = path.join(base, 'work');
  fs.mkdirSync(work);
  const cache = path.join(base, 'cache');
  const counter = path.join(base, 'counter');
  if (repository) {
    const run = (...args) => execFileSync('git', args, { cwd: work, stdio: 'ignore' });
    run('init', '-q');
    fs.writeFileSync(path.join(work, 'a.txt'), 'one\n');
    run('add', '.');
    run('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'first');
  }
  return { base, work, cache, counter };
}

function start(f, command, { session = 's1', env = {} } = {}) {
  const child = spawn('node', [WRAPPER, '--session', session, '--', command], {
    cwd: f.work,
    env: { ...process.env, EXO_HEAVY_CACHE: f.cache, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const done = new Promise((resolve) => {
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('close', (code, signal) => resolve({ code, signal, out, err }));
  });
  return { child, done };
}

function runs(f) {
  return fs.existsSync(f.counter) ? fs.readFileSync(f.counter, 'utf8').split('\n').filter(Boolean).length : 0;
}

const counting = (f, tail = '') => `echo run >> ${f.counter}${tail}`;

test('the same command on unchanged code runs once and the second call is a cache hit', async () => {
  const f = fixture();
  const command = counting(f);
  const first = await start(f, command).done;
  const second = await start(f, command).done;
  assert.equal(first.code, 0);
  assert.equal(second.code, 0);
  assert.equal(runs(f), 1);
  assert.match(second.err, /already ran green at \d{4}-/);
  assert.equal(first.err, '');
});

test('the wrapper exits with the child code and forwards its output', async () => {
  const f = fixture();
  const result = await start(f, 'echo hello; exit 3').done;
  assert.equal(result.code, 3);
  assert.equal(result.out, 'hello\n');
});

test('a failed run is never stored, so the next call runs again', async () => {
  const f = fixture();
  const command = counting(f, '; exit 1');
  assert.equal((await start(f, command).done).code, 1);
  assert.equal((await start(f, command).done).code, 1);
  assert.equal(runs(f), 2);
});

test('two wrappers started at once run the command once; the second waits and exits green', async () => {
  const f = fixture();
  const command = counting(f, '; sleep 1');
  const first = start(f, command, { session: 'holder' });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const second = start(f, command, { session: 'waiter' });
  const [one, two] = await Promise.all([first.done, second.done]);
  assert.equal(one.code, 0);
  assert.equal(two.code, 0);
  assert.equal(runs(f), 1);
  assert.match(two.err, /waiting for session holder/);
  assert.match(two.err, /already ran green/);
});

test('a waiter takes over and runs after a red holder', async () => {
  const f = fixture();
  const command = counting(f, '; sleep 1; exit 1');
  const first = start(f, command, { session: 'holder' });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const second = start(f, command, { session: 'waiter' });
  const [one, two] = await Promise.all([first.done, second.done]);
  assert.equal(one.code, 1);
  assert.equal(two.code, 1);
  assert.equal(runs(f), 2);
});

test('a changed file, a new untracked file or a different command runs again', async () => {
  const f = fixture();
  const command = counting(f);
  await start(f, command).done;
  fs.writeFileSync(path.join(f.work, 'a.txt'), 'two\n');
  await start(f, command).done;
  assert.equal(runs(f), 2);
  fs.writeFileSync(path.join(f.work, 'new.txt'), 'x\n');
  await start(f, command).done;
  assert.equal(runs(f), 3);
  await start(f, command + '; true').done;
  assert.equal(runs(f), 4);
  const again = await start(f, command + '; true').done;
  assert.equal(runs(f), 4);
  assert.equal(again.code, 0);
});

test('outside a git repository there is no cache, only the lock', async () => {
  const f = fixture({ repository: false });
  const command = counting(f);
  await start(f, command).done;
  await start(f, command).done;
  assert.equal(runs(f), 2);
});

test('a green result older than 24 hours no longer stands in for a run', async () => {
  const f = fixture();
  const command = counting(f);
  await start(f, command).done;
  const directory = path.join(f.cache, 'results');
  const [name] = fs.readdirSync(directory);
  const file = path.join(directory, name);
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  result.finishedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  fs.writeFileSync(file, JSON.stringify(result));
  await start(f, command).done;
  assert.equal(runs(f), 2);
});

test('results older than 7 days are pruned on a wrapper run', async () => {
  const f = fixture();
  const directory = path.join(f.cache, 'results');
  fs.mkdirSync(directory, { recursive: true });
  const old = path.join(directory, 'old.json');
  fs.writeFileSync(old, '{}');
  const eightDays = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  fs.utimesSync(old, eightDays, eightDays);
  await start(f, 'true').done;
  assert.equal(fs.existsSync(old), false);
});

test('a lock whose holder process is gone is taken over without waiting', async () => {
  const f = fixture();
  const command = counting(f, '; sleep 2');
  const holder = start(f, command, { session: 'ghost' });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const owner = JSON.parse(fs.readFileSync(path.join(f.cache, 'locks', fs.readdirSync(path.join(f.cache, 'locks'))[0], 'owner.json'), 'utf8'));
  process.kill(owner.childPid, 'SIGKILL');
  holder.child.kill('SIGKILL');
  await holder.done;
  assert.equal(fs.readdirSync(path.join(f.cache, 'locks')).length, 1);
  const taker = await start(f, command, { session: 'taker' }).done;
  assert.equal(taker.code, 0);
  assert.doesNotMatch(taker.err, /waiting/);
  assert.equal(runs(f), 2);
});

test('a signalled run exits 128 plus the signal and is not stored', async () => {
  const f = fixture();
  const command = counting(f, '; exec sleep 30');
  const running = start(f, command);
  await new Promise((resolve) => setTimeout(resolve, 500));
  running.child.kill('SIGTERM');
  const result = await running.done;
  assert.equal(result.code, 143);
  assert.equal(fs.existsSync(path.join(f.cache, 'results')), false);
  assert.equal(fs.readdirSync(path.join(f.cache, 'locks')).length, 0);
});
