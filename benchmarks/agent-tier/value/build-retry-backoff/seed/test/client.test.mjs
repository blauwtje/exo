import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchUser } from '../src/client.mjs';

test('fetchUser asks for the user path', async () => {
  const user = await fetchUser(7, { fetcher: async (url) => ({ url }) });
  assert.deepEqual(user, { url: '/users/7' });
});

test('fetchUser passes a failure on', async () => {
  await assert.rejects(fetchUser(7, { fetcher: async () => { throw new Error('down'); } }), /down/);
});
