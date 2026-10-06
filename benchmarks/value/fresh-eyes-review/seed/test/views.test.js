import test from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../src/search.js';
import { tagCounts, tasksWithTag } from '../src/tags.js';
import { summary } from '../src/stats.js';
import { toCsv, toJson } from '../src/export.js';
import { dueReminders } from '../src/reminders.js';
import { sampleStore } from './helpers.js';

const NOW = new Date('2026-03-01T10:00:00.000Z');

test('search matches title and tags, case-insensitively', () => {
  const store = sampleStore();
  assert.deepEqual(search(store, 'MILK').map((task) => task.id), [2]);
  assert.deepEqual(search(store, 'home').map((task) => task.id), [2, 3]);
  assert.deepEqual(search(store, '  '), []);
});

test('tag counts and lookups', () => {
  const store = sampleStore();
  assert.deepEqual(tagCounts(store), [
    { tag: 'home', count: 2 },
    { tag: 'errand', count: 1 },
    { tag: 'work', count: 1 },
  ]);
  assert.deepEqual(tasksWithTag(store, 'home').map((task) => task.id), [2, 3]);
});

test('summary counts by status and overdue', () => {
  const store = sampleStore();
  store.update(1, { status: 'done' });
  assert.deepEqual(summary(store, NOW), { total: 3, open: 2, done: 1, overdue: 1 });
});

test('csv quotes cells and lists tags with semicolons', () => {
  const store = sampleStore();
  store.create({ title: 'say "hi", twice' });
  const lines = toCsv(store).trimEnd().split('\n');
  assert.equal(lines[0], 'id,title,status,tags,dueAt,createdAt');
  assert.equal(lines[2], '2,buy milk,open,home;errand,,2026-03-01T10:00:00.000Z');
  assert.equal(lines[4].split(',')[1], '"say ""hi""');
});

test('json export lists every task', () => {
  const store = sampleStore();
  assert.equal(JSON.parse(toJson(store)).length, 3);
});

test('reminders are open tasks past due, oldest first', () => {
  const store = sampleStore();
  assert.deepEqual(dueReminders(store, NOW).map((task) => task.id), [3, 1]);
  store.update(3, { status: 'done' });
  assert.deepEqual(dueReminders(store, NOW).map((task) => task.id), [1]);
});
