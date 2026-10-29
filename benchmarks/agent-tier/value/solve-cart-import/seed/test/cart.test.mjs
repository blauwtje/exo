import assert from 'node:assert/strict';
import test from 'node:test';
import { Cart } from '../src/cart.mjs';
import { addToCart } from '../src/http.mjs';
import { importRows } from '../src/import.mjs';
import { createInventory } from '../src/inventory.mjs';

const fresh = () => new Cart(createInventory({ apple: 10, pear: 3 }));

test('add reserves stock', () => {
  const cart = fresh();
  cart.add('apple', 4);
  assert.equal(cart.quantity('apple'), 4);
  assert.equal(cart.available('apple'), 6);
});

test('the handler rejects a zero quantity', () => {
  const cart = fresh();
  assert.equal(addToCart(cart, { sku: 'apple', qty: 0 }).status, 400);
  assert.equal(cart.available('apple'), 10);
});

test('the handler answers 200 for a valid quantity', () => {
  const cart = fresh();
  assert.deepEqual(addToCart(cart, { sku: 'pear', qty: 2 }), { status: 200, quantity: 2 });
});

test('import adds valid rows', () => {
  const cart = fresh();
  const result = importRows(cart, [{ sku: 'apple', qty: '2' }, { sku: 'pear', qty: '1' }]);
  assert.deepEqual(result, { added: 2, rejected: [] });
  assert.equal(cart.available('apple'), 8);
});
