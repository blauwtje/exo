import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDatabase } from '../lib/store.mjs';
import { addColumn, createTable, findRow, getTable, insertRow } from '../lib/tables.mjs';

function shelfDatabase() {
  const database = emptyDatabase();
  createTable(database, 'shelves', ['id', 'label']);
  return database;
}

test('createTable starts empty and keeps the column names', () => {
  const database = shelfDatabase();
  assert.deepEqual(Object.keys(getTable(database, 'shelves').columns), ['id', 'label']);
  assert.deepEqual(getTable(database, 'shelves').rows, []);
});

test('createTable refuses a name that is taken', () => {
  const database = shelfDatabase();
  assert.throws(() => createTable(database, 'shelves', ['id']), /already exists/);
});

test('getTable names the table it cannot find', () => {
  assert.throws(() => getTable(emptyDatabase(), 'ghosts'), /no table ghosts/);
});

test('insertRow fills the columns the caller left out', () => {
  const database = shelfDatabase();
  const row = insertRow(database, 'shelves', { id: 'shl-1' });
  assert.deepEqual(row, { id: 'shl-1', label: null });
  assert.equal(getTable(database, 'shelves').rows.length, 1);
});

test('insertRow rejects a column the table does not have', () => {
  const database = shelfDatabase();
  assert.throws(() => insertRow(database, 'shelves', { id: 'shl-1', colour: 'red' }), /no column colour/);
  assert.equal(getTable(database, 'shelves').rows.length, 0);
});

test('addColumn registers the column and its default', () => {
  const database = shelfDatabase();
  addColumn(database, 'shelves', 'capacity', { default: 12 });
  assert.equal(getTable(database, 'shelves').columns.capacity, 12);
});

test('rows inserted after addColumn carry the default', () => {
  const database = shelfDatabase();
  addColumn(database, 'shelves', 'capacity', { default: 12 });
  assert.equal(insertRow(database, 'shelves', { id: 'shl-2' }).capacity, 12);
  assert.equal(insertRow(database, 'shelves', { id: 'shl-3', capacity: 4 }).capacity, 4);
});

test('addColumn without a default uses null', () => {
  const database = shelfDatabase();
  addColumn(database, 'shelves', 'owner');
  assert.equal(getTable(database, 'shelves').columns.owner, null);
});

test('findRow returns the row with that id or undefined', () => {
  const database = shelfDatabase();
  insertRow(database, 'shelves', { id: 'shl-1', label: 'tea' });
  insertRow(database, 'shelves', { id: 'shl-2', label: 'jam' });
  assert.equal(findRow(database, 'shelves', 'shl-2').label, 'jam');
  assert.equal(findRow(database, 'shelves', 'shl-9'), undefined);
});
