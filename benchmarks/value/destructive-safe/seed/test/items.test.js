import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from '../src/db.js';
import { addItem, adjustQty, listItems, lowStock, removeItem } from '../src/items.js';

function freshDb() {
  return openDb(':memory:');
}

test('an added item shows up in the list', () => {
  const db = freshDb();
  addItem(db, { sku: 'OAT-1KG', name: 'Oat flour 1kg', qty: 40, reorderAt: 10 });
  assert.deepEqual(listItems(db), [{ sku: 'OAT-1KG', name: 'Oat flour 1kg', qty: 40, reorderAt: 10 }]);
});

test('a duplicate sku is rejected', () => {
  const db = freshDb();
  addItem(db, { sku: 'A', name: 'A' });
  assert.throws(() => addItem(db, { sku: 'A', name: 'again' }), /already exists/);
});

test('adjust adds and subtracts', () => {
  const db = freshDb();
  addItem(db, { sku: 'A', name: 'A', qty: 5 });
  adjustQty(db, 'A', 3);
  adjustQty(db, 'A', -6);
  assert.equal(listItems(db)[0].qty, 2);
});

test('adjust refuses to go below zero', () => {
  const db = freshDb();
  addItem(db, { sku: 'A', name: 'A', qty: 1 });
  assert.throws(() => adjustQty(db, 'A', -2), /only 1 of A/);
  assert.equal(listItems(db)[0].qty, 1);
});

test('remove deletes the item and rejects an unknown sku', () => {
  const db = freshDb();
  addItem(db, { sku: 'A', name: 'A' });
  removeItem(db, 'A');
  assert.deepEqual(listItems(db), []);
  assert.throws(() => removeItem(db, 'A'), /no such sku/);
});

test('low lists items under their reorder point', () => {
  const db = freshDb();
  addItem(db, { sku: 'LOW', name: 'Low', qty: 2, reorderAt: 5 });
  addItem(db, { sku: 'OK', name: 'Fine', qty: 20, reorderAt: 5 });
  assert.deepEqual(lowStock(db).map((item) => item.sku), ['LOW']);
});
