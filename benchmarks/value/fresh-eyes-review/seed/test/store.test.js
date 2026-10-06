import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotFoundError, TaskStore } from '../src/store.js';
import { NOW, sampleStore } from './helpers.js';

test('create assigns increasing ids and stamps the store clock', () => {
  const store = sampleStore();
  const task = store.create({ title: '  walk dog ' });
  assert.equal(task.id, 4);
  assert.equal(task.title, 'walk dog');
  assert.equal(task.createdAt, NOW);
  assert.equal(task.status, 'open');
});

test('create refuses an empty title', () => {
  assert.throws(() => sampleStore().create({ title: '   ' }), TypeError);
});

test('get returns a copy and refuses an unknown id', () => {
  const store = sampleStore();
  store.get(1).title = 'changed';
  assert.equal(store.get(1).title, 'write report');
  assert.throws(() => store.get(99), NotFoundError);
});

test('update changes fields, keeps the id and stamps updatedAt', () => {
  const store = sampleStore();
  const task = store.update(2, { status: 'done', id: 50 });
  assert.equal(task.id, 2);
  assert.equal(task.status, 'done');
  assert.throws(() => store.update(99, { status: 'done' }), NotFoundError);
});

test('list filters by status and sorts by id', () => {
  const store = sampleStore();
  store.update(2, { status: 'done' });
  assert.deepEqual(store.list({ status: 'open' }).map((task) => task.id), [1, 3]);
  assert.deepEqual(store.list().map((task) => task.id), [1, 2, 3]);
});

test('delete removes the task and refuses an unknown id', () => {
  const store = sampleStore();
  store.delete(2);
  assert.throws(() => store.get(2), NotFoundError);
  assert.deepEqual(store.list().map((task) => task.id), [1, 3]);
  assert.equal(store.count(), 2);
  assert.throws(() => store.delete(99), NotFoundError);
});

test('save and load round-trip the tasks', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'taskbook-')), 'data.json');
  const store = sampleStore();
  store.save(file);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).version, 1);
  const loaded = TaskStore.load(file);
  assert.deepEqual(loaded.list(), store.list());
  assert.equal(loaded.create({ title: 'next' }).id, 4);
});

test('load of a missing file is an empty store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'taskbook-'));
  assert.equal(TaskStore.load(join(dir, 'none.json')).count(), 0);
});
