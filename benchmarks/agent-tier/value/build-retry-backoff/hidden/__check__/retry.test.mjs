import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchUser } from '../src/client.mjs';
import { withRetry } from '../src/retry.mjs';

function flaky(failures, value = 'done') {
  let calls = 0;
  const task = async () => {
    calls += 1;
    if (calls <= failures) throw new Error(`failure ${calls}`);
    return value;
  };
  task.calls = () => calls;
  return task;
}

test('success on the first try never sleeps', async () => {
  const delays = [];
  assert.equal(await withRetry(flaky(0), { sleep: async (ms) => delays.push(ms) }), 'done');
  assert.deepEqual(delays, []);
});

test('delays double from delayMs', async () => {
  const delays = [];
  const task = flaky(3);
  assert.equal(await withRetry(task, { retries: 3, delayMs: 100, sleep: async (ms) => delays.push(ms) }), 'done');
  assert.deepEqual(delays, [100, 200, 400]);
  assert.equal(task.calls(), 4);
});

test('retries counts extra attempts and the last error is thrown', async () => {
  const task = flaky(10);
  await assert.rejects(withRetry(task, { retries: 2, sleep: async () => {} }), /failure 3/);
  assert.equal(task.calls(), 3);
});

test('retries of zero tries once', async () => {
  const task = flaky(1);
  await assert.rejects(withRetry(task, { retries: 0, sleep: async () => {} }), /failure 1/);
  assert.equal(task.calls(), 1);
});

test('a permanent error is not retried', async () => {
  let calls = 0;
  const task = async () => {
    calls += 1;
    throw Object.assign(new Error('forbidden'), { permanent: true });
  };
  await assert.rejects(withRetry(task, { sleep: async () => {} }), /forbidden/);
  assert.equal(calls, 1);
});

test('the task receives the attempt number', async () => {
  const seen = [];
  const task = async (attempt) => {
    seen.push(attempt);
    if (attempt < 3) throw new Error('again');
    return attempt;
  };
  assert.equal(await withRetry(task, { sleep: async () => {} }), 3);
  assert.deepEqual(seen, [1, 2, 3]);
});

test('defaults are 3 retries and a 100 ms base delay', async () => {
  const delays = [];
  const task = flaky(99);
  await assert.rejects(withRetry(task, { sleep: async (ms) => delays.push(ms) }));
  assert.equal(task.calls(), 4);
  assert.deepEqual(delays, [100, 200, 400]);
});

test('fetchUser retries through the injected sleep', async () => {
  const delays = [];
  let calls = 0;
  const fetcher = async (url) => {
    calls += 1;
    if (calls < 3) throw new Error('blip');
    return { url };
  };
  assert.deepEqual(await fetchUser(9, { fetcher, sleep: async (ms) => delays.push(ms), delayMs: 10 }), { url: '/users/9' });
  assert.deepEqual(delays, [10, 20]);
});

test('fetchUser gives up with the last error', async () => {
  const fetcher = async () => { throw new Error('still down'); };
  await assert.rejects(fetchUser(9, { fetcher, retries: 1, sleep: async () => {} }), /still down/);
});
