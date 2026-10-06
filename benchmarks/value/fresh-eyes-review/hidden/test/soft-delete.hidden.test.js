import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NotFoundError, TaskStore } from '../src/store.js';
import { search } from '../src/search.js';
import { tagCounts, tasksWithTag } from '../src/tags.js';
import { summary } from '../src/stats.js';
import { toCsv, toJson } from '../src/export.js';
import { dueReminders } from '../src/reminders.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CREATED = '2026-03-01T10:00:00.000Z';
const DELETED = '2026-03-02T08:30:00.000Z';
const NOW = new Date('2026-03-03T00:00:00.000Z');

function tempFile() {
  return join(mkdtempSync(join(tmpdir(), 'taskbook-hidden-')), 'data.json');
}

function rawTasks(file) {
  return JSON.parse(readFileSync(file, 'utf8')).tasks;
}

// 1 work, overdue; 2 home+errand; 3 home, overdue.
function build() {
  const clock = { value: CREATED };
  const store = new TaskStore({ now: () => clock.value });
  store.create({ title: 'write report', tags: ['work'], dueAt: '2026-02-27T09:00:00.000Z' });
  store.create({ title: 'buy milk', tags: ['home', 'errand'] });
  store.create({ title: 'call plumber', tags: ['home'], dueAt: '2026-02-20T09:00:00.000Z' });
  clock.value = DELETED;
  return store;
}

function cli(file, ...args) {
  const result = spawnSync(process.execPath, [join(ROOT, 'src', 'cli.js'), '--file', file, '--now', CREATED, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

test('hidden: delete keeps the record in the data file with deletedAt from the store clock', () => {
  const store = build();
  store.delete(2);
  const file = tempFile();
  store.save(file);
  const record = rawTasks(file).find((task) => task.id === 2);
  assert.ok(record, 'record 2 is still in the data file');
  assert.equal(record.title, 'buy milk');
  assert.equal(record.deletedAt, DELETED);
});

test('hidden: list and count hide a deleted task', () => {
  const store = build();
  store.delete(2);
  assert.deepEqual(store.list().map((task) => task.id), [1, 3]);
  assert.deepEqual(store.list({ status: 'open' }).map((task) => task.id), [1, 3]);
  assert.equal(store.count(), 2);
});

test('hidden: get treats a deleted task as unknown', () => {
  const store = build();
  store.delete(2);
  assert.throws(() => store.get(2), NotFoundError);
});

test('hidden: update treats a deleted task as unknown', () => {
  const store = build();
  store.delete(2);
  assert.throws(() => store.update(2, { status: 'done' }), NotFoundError);
});

test('hidden: a second delete of the same id is an unknown id', () => {
  const store = build();
  store.delete(2);
  assert.throws(() => store.delete(2), NotFoundError);
  const file = tempFile();
  store.save(file);
  assert.equal(rawTasks(file).find((task) => task.id === 2).deletedAt, DELETED);
});

test('hidden: search skips a deleted task', () => {
  const store = build();
  store.delete(2);
  assert.deepEqual(search(store, 'milk'), []);
  assert.deepEqual(search(store, 'home').map((task) => task.id), [3]);
});

test('hidden: tag counts skip a deleted task', () => {
  const store = build();
  store.delete(2);
  assert.deepEqual(tagCounts(store), [
    { tag: 'home', count: 1 },
    { tag: 'work', count: 1 },
  ]);
});

test('hidden: tag lookup skips a deleted task', () => {
  const store = build();
  store.delete(2);
  assert.deepEqual(tasksWithTag(store, 'home').map((task) => task.id), [3]);
  assert.deepEqual(tasksWithTag(store, 'errand'), []);
});

test('hidden: summary does not count a deleted task', () => {
  const store = build();
  store.delete(2);
  assert.deepEqual(summary(store, NOW), { total: 2, open: 2, done: 0, overdue: 2 });
});

test('hidden: csv export omits a deleted task', () => {
  const store = build();
  store.delete(2);
  const csv = toCsv(store);
  assert.ok(!csv.includes('buy milk'));
  assert.equal(csv.trimEnd().split('\n').length, 3);
});

test('hidden: json export omits a deleted task', () => {
  const store = build();
  store.delete(2);
  assert.deepEqual(JSON.parse(toJson(store)).map((task) => task.id), [1, 3]);
});

test('hidden: reminders skip a deleted task', () => {
  const store = build();
  store.delete(3);
  assert.deepEqual(dueReminders(store, NOW).map((task) => task.id), [1]);
});

test('hidden: a new task never reuses the id of a deleted newest task', () => {
  const store = build();
  store.delete(3);
  const created = store.create({ title: 'after delete' });
  assert.notEqual(created.id, 3);
  const file = tempFile();
  store.save(file);
  const ids = rawTasks(file).map((task) => task.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique in the data file');
  assert.equal(rawTasks(file).find((task) => task.id === 3).title, 'call plumber');
});

test('hidden: save and load keep a deleted record but hide it', () => {
  const store = build();
  store.delete(3);
  const file = tempFile();
  store.save(file);
  const loaded = TaskStore.load(file, { now: () => DELETED });
  assert.deepEqual(loaded.list().map((task) => task.id), [1, 2]);
  assert.equal(loaded.count(), 2);
  assert.throws(() => loaded.get(3), NotFoundError);
  assert.equal(loaded.create({ title: 'next' }).id, 4);
  loaded.save(file);
  assert.equal(rawTasks(file).filter((task) => task.deletedAt !== undefined).length, 1);
});

test('hidden: cli list and search hide a deleted task', () => {
  const file = tempFile();
  cli(file, 'add', 'alpha', '--tags', 'x');
  cli(file, 'add', 'bravo', '--tags', 'y');
  assert.equal(cli(file, 'rm', '2').status, 0);
  assert.equal(cli(file, 'list').out, '#1 [ ] alpha (x)\n');
  assert.equal(cli(file, 'search', 'bravo').out, '');
  assert.equal(cli(file, 'show', '2').status, 1);
});

test('hidden: cli export, tags and stats hide a deleted task', () => {
  const file = tempFile();
  cli(file, 'add', 'alpha', '--tags', 'x');
  cli(file, 'add', 'bravo', '--tags', 'y');
  cli(file, 'rm', '2');
  assert.ok(!cli(file, 'export', 'csv').out.includes('bravo'));
  assert.ok(!cli(file, 'export', 'json').out.includes('bravo'));
  assert.equal(cli(file, 'tags').out, 'x: 1\n');
  assert.match(cli(file, 'stats').out, /^total: 1$/m);
});

test('hidden: cli rm of an already deleted id exits 1', () => {
  const file = tempFile();
  cli(file, 'add', 'alpha');
  assert.equal(cli(file, 'rm', '1').status, 0);
  const again = cli(file, 'rm', '1');
  assert.equal(again.status, 1);
  assert.match(again.err, /no task #1/);
});

test('hidden: cli add after rm of the newest task takes a fresh id', () => {
  const file = tempFile();
  cli(file, 'add', 'alpha');
  cli(file, 'add', 'bravo');
  cli(file, 'rm', '2');
  assert.equal(cli(file, 'add', 'charlie').out, 'added #3\n');
  const tasks = rawTasks(file);
  assert.deepEqual(tasks.map((task) => task.id), [1, 2, 3]);
  assert.equal(tasks.find((task) => task.id === 2).title, 'bravo');
});
