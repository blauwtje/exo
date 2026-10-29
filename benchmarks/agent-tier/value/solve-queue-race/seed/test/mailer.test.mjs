import assert from 'node:assert/strict';
import test from 'node:test';
import { sendAll } from '../src/mailer.mjs';
import { runPool } from '../src/pool.mjs';

const transport = (log, failFirst = new Set()) => ({
  async send(message) {
    log.push(message.id);
    if (failFirst.delete(message.id)) throw new Error('smtp down');
  }
});

test('sendAll delivers every message in order', async () => {
  const log = [];
  const results = await sendAll([{ id: 'a' }, { id: 'b' }, { id: 'c' }], transport(log));
  assert.deepEqual(results.map((result) => result.id), ['a', 'b', 'c']);
  assert.deepEqual(log, ['a', 'b', 'c']);
});

test('sendAll retries a failed message once', async () => {
  const log = [];
  const results = await sendAll([{ id: 'a' }, { id: 'b' }], transport(log, new Set(['a'])));
  assert.deepEqual(results.map((result) => [result.id, result.ok, result.attempts]), [['a', true, 2], ['b', true, 1]]);
});

test('runPool keeps result order', async () => {
  const results = await runPool([async () => 1, async () => 2, async () => 3], 1);
  assert.deepEqual(results, [1, 2, 3]);
});
