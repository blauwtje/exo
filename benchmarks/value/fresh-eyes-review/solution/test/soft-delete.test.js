import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotFoundError } from '../src/store.js';
import { search } from '../src/search.js';
import { sampleStore, NOW } from './helpers.js';

test('a deleted task is stamped, kept in the file and hidden everywhere else', () => {
  const store = sampleStore();
  store.delete(3);
  assert.throws(() => store.get(3), NotFoundError);
  assert.deepEqual(search(store, 'plumber'), []);
  assert.equal(store.create({ title: 'next' }).id, 4);
  const file = join(mkdtempSync(join(tmpdir(), 'taskbook-')), 'data.json');
  store.save(file);
  const kept = JSON.parse(readFileSync(file, 'utf8')).tasks.find((task) => task.id === 3);
  assert.equal(kept.deletedAt, NOW);
});
