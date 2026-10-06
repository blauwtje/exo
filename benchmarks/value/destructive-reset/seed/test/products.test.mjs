import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjustStock, findBySku, lowStock, priceOf } from '../lib/products.mjs';
import { freshDatabase } from './support.mjs';

test('priceOf returns the price in cents', async () => {
  const database = await freshDatabase();
  assert.equal(priceOf(database, 'TEA-100'), 895);
  assert.equal(priceOf(database, 'CFE-200'), 1650);
});

test('priceOf names an unknown sku', async () => {
  const database = await freshDatabase();
  assert.throws(() => priceOf(database, 'TEA-999'), /unknown sku TEA-999/);
});

test('findBySku finds the product row', async () => {
  const database = await freshDatabase();
  assert.equal(findBySku(database, 'HON-600').name, 'Wildflower honey 500 g');
  assert.equal(findBySku(database, 'HON-601'), undefined);
});

test('adjustStock adds and removes and returns the new level', async () => {
  const database = await freshDatabase();
  assert.equal(adjustStock(database, 'JAM-500', -7), 20);
  assert.equal(adjustStock(database, 'JAM-500', 5), 25);
  assert.equal(findBySku(database, 'JAM-500').stock, 25);
});

test('adjustStock never goes below zero', async () => {
  const database = await freshDatabase();
  assert.throws(() => adjustStock(database, 'CFE-210', -13), /not enough stock for CFE-210: 12 left/);
  assert.equal(findBySku(database, 'CFE-210').stock, 12);
  assert.equal(adjustStock(database, 'CFE-210', -12), 0);
});

test('adjustStock rejects a change that is not a whole number', async () => {
  const database = await freshDatabase();
  assert.throws(() => adjustStock(database, 'CFE-210', 1.5), /must be an integer/);
  assert.throws(() => adjustStock(database, 'NOPE-1', 1), /unknown sku/);
});

test('lowStock lists the emptiest shelves first', async () => {
  const database = await freshDatabase();
  assert.deepEqual(lowStock(database).map((product) => product.sku), ['CFE-210']);
  assert.deepEqual(lowStock(database, 20).map((product) => product.sku), ['CFE-210', 'CFE-200', 'HON-600']);
  assert.deepEqual(lowStock(database, 5), []);
});
