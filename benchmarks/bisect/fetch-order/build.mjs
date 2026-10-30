import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/batch.mjs';

const batch = `export async function fetchAll(ids, fetchOne) {
  const results = []
  await Promise.all(
    ids.map(async (id) => {
      results.push(await fetchOne(id))
    }),
  )
  return results
}
`;

const repro = `import assert from 'node:assert/strict'
import { fetchAll } from '../src/batch.mjs'

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchOne = async (id) => {
  await pause(1 + Math.floor(Math.random() * 10))
  return id.toUpperCase()
}

assert.deepEqual(await fetchAll(['a', 'b'], fetchOne), ['A', 'B'])
console.log('batch ok')
`;

buildHistory(dest, {
  name: 'fetch-order',
  seed: 127,
  count: 80,
  base: {
    'README.md': '# fetch-order\n\nFetches a batch of records in parallel.\n',
    [CORE]: batch,
    'test/batch.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['fetchChunks', 'fetchInChunks'], ['fetchFirst', 'fetchAny']],
    tweaks: [
      { subject: 'feat: export the default chunk size', append: 'export const DEFAULT_CHUNK_SIZE = 10' },
      { subject: 'feat: export the default attempt count', append: 'export const DEFAULT_ATTEMPTS = 3' },
    ],
  },
  steps: [
    {
      at: 0.1,
      subject: 'feat: add a settled variant',
      apply: (files) => append(files, CORE, "\nexport async function fetchAllSettled(ids, fetchOne) {\n  const outcomes = await Promise.allSettled(ids.map((id) => fetchOne(id)))\n  return outcomes.map((outcome) => (outcome.status === 'fulfilled' ? outcome.value : null))\n}\n"),
    },
    {
      at: 0.25,
      subject: 'feat: pass the position to the fetcher',
      apply: (files) => {
        edit(files, CORE, 'ids.map(async (id) => {', 'ids.map(async (id, index) => {');
        edit(files, CORE, 'results.push(await fetchOne(id))', 'results.push(await fetchOne(id, index))');
      },
    },
    {
      at: 0.4,
      subject: 'feat: add a retry wrapper',
      apply: (files) => append(files, CORE, '\nexport function withRetry(fetchOne, attempts = 3) {\n  return async (...args) => {\n    let failure\n    for (let attempt = 0; attempt < attempts; attempt++) {\n      try {\n        return await fetchOne(...args)\n      } catch (error) {\n        failure = error\n      }\n    }\n    throw failure\n  }\n}\n'),
    },
    {
      at: 0.55,
      subject: 'feat: fetch in chunks',
      apply: (files) => append(files, CORE, '\nexport async function fetchChunks(ids, fetchOne, size = 10) {\n  const out = []\n  for (let i = 0; i < ids.length; i += size) out.push(...(await fetchAll(ids.slice(i, i + size), fetchOne)))\n  return out\n}\n'),
    },
    {
      at: 0.7,
      subject: 'feat: add a timeout wrapper',
      apply: (files) => append(files, CORE, "\nexport function withTimeout(fetchOne, ms) {\n  return (...args) => Promise.race([\n    fetchOne(...args),\n    new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), ms)),\n  ])\n}\n"),
    },
    {
      at: 0.8,
      subject: 'feat: add a first-result fetch',
      apply: (files) => append(files, CORE, '\nexport function fetchFirst(ids, fetchOne) {\n  return Promise.race(ids.map((id) => fetchOne(id)))\n}\n'),
    },
  ],
});
