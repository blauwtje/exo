import assert from 'node:assert/strict';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function tracker(delays) {
  const state = { sends: new Map(), inFlight: 0, peak: 0 };
  state.transport = {
    async send(message) {
      state.sends.set(message.id, (state.sends.get(message.id) ?? 0) + 1);
      state.inFlight += 1;
      state.peak = Math.max(state.peak, state.inFlight);
      await sleep(delays[message.id] ?? 1);
      state.inFlight -= 1;
    }
  };
  return state;
}

const messages = (count) => Array.from({ length: count }, (_, index) => ({ id: `m${index}` }));
const jitter = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`m${index}`, 2 + ((index * 7) % 5) * 3]));

export const cases = [
  {
    name: 'every message is sent once at concurrency 3 with uneven delays',
    run: async ({ load }) => {
      const { sendAll } = await load('src/mailer.mjs');
      const state = tracker(jitter(12));
      const results = await sendAll(messages(12), state.transport, { concurrency: 3 });
      assert.deepEqual([...state.sends.values()].filter((count) => count !== 1), []);
      assert.equal(state.sends.size, 12);
      assert.deepEqual(results.map((result) => result.id), messages(12).map((message) => message.id));
    }
  },
  {
    name: 'concurrency is honoured: more than one in flight, never above the limit',
    run: async ({ load }) => {
      const { sendAll } = await load('src/mailer.mjs');
      const state = tracker(jitter(10));
      await sendAll(messages(10), state.transport, { concurrency: 4 });
      assert.ok(state.peak >= 2, `peak ${state.peak}`);
      assert.ok(state.peak <= 4, `peak ${state.peak}`);
    }
  },
  {
    name: 'runPool runs each task once and keeps result order at any limit',
    run: async ({ load }) => {
      const { runPool } = await load('src/pool.mjs');
      for (const limit of [1, 2, 5, 50]) {
        const runs = new Array(9).fill(0);
        const tasks = runs.map((_, index) => async () => { runs[index] += 1; await sleep(1 + (index % 3) * 4); return index * 10; });
        const results = await runPool(tasks, limit);
        assert.deepEqual(runs, new Array(9).fill(1), `limit ${limit}`);
        assert.deepEqual(results, runs.map((_, index) => index * 10), `limit ${limit}`);
      }
    }
  },
  {
    name: 'a failing message is retried and reported without repeating the others',
    run: async ({ load }) => {
      const { sendAll } = await load('src/mailer.mjs');
      const state = tracker(jitter(6));
      const failing = new Set(['m2']);
      const send = state.transport.send;
      state.transport.send = async (message) => {
        await send(message);
        if (failing.delete(message.id)) throw new Error('smtp down');
      };
      const results = await sendAll(messages(6), state.transport, { concurrency: 3 });
      assert.deepEqual(results.map((result) => result.ok), [true, true, true, true, true, true]);
      assert.deepEqual([...state.sends].filter(([id, count]) => count !== (id === 'm2' ? 2 : 1)), []);
    }
  },
  {
    name: 'an empty list resolves to an empty result',
    run: async ({ load }) => {
      const { runPool } = await load('src/pool.mjs');
      assert.deepEqual(await runPool([], 3), []);
    }
  }
];
