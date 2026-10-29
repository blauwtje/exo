import assert from 'node:assert/strict';

async function setup(load, stock = { apple: 10, pear: 3 }) {
  const { Cart } = await load('src/cart.mjs');
  const { createInventory } = await load('src/inventory.mjs');
  const inventory = createInventory(stock);
  return { cart: new Cart(inventory), inventory };
}

export const cases = [
  {
    name: 'Cart.add refuses quantities that are not positive integers and leaves stock untouched',
    run: async ({ load }) => {
      const { cart, inventory } = await setup(load);
      for (const qty of [0, -2, 1.5, NaN, '3', undefined, Infinity]) {
        assert.throws(() => cart.add('apple', qty), Error, `qty ${String(qty)}`);
      }
      assert.equal(inventory.level('apple'), 10);
      assert.equal(cart.quantity('apple'), 0);
    }
  },
  {
    name: 'Cart.add refuses more than the stock and an unknown sku, and changes nothing',
    run: async ({ load }) => {
      const { cart, inventory } = await setup(load);
      assert.throws(() => cart.add('pear', 4), Error);
      assert.throws(() => cart.add('plum', 1), Error);
      assert.equal(inventory.level('pear'), 3);
      assert.equal(inventory.level('plum'), 0);
      assert.equal(cart.quantity('pear'), 0);
    }
  },
  {
    name: 'Cart.add can take the last unit',
    run: async ({ load }) => {
      const { cart, inventory } = await setup(load);
      cart.add('pear', 3);
      assert.equal(inventory.level('pear'), 0);
      assert.equal(cart.quantity('pear'), 3);
    }
  },
  {
    name: 'import reports bad rows with their line and keeps stock non-negative',
    run: async ({ load }) => {
      const { importRows } = await load('src/import.mjs');
      const { cart, inventory } = await setup(load);
      const result = importRows(cart, [
        { sku: 'apple', qty: '2' },
        { sku: 'apple', qty: '-5' },
        { sku: 'pear', qty: '4' },
        { sku: 'apple', qty: '1.5' },
        { sku: 'apple', qty: '' },
        { sku: 'apple', qty: 'abc' },
        { sku: 'plum', qty: '1' },
        { sku: 'pear', qty: '3' }
      ]);
      assert.equal(result.added, 2);
      assert.deepEqual(result.rejected.map((entry) => entry.line), [2, 3, 4, 5, 6, 7]);
      assert.ok(result.rejected.every((entry) => typeof entry.reason === 'string' && entry.reason.length > 0));
      assert.equal(inventory.level('apple'), 8);
      assert.equal(inventory.level('pear'), 0);
      assert.equal(inventory.level('plum'), 0);
      assert.equal(cart.quantity('apple'), 2);
    }
  },
  {
    name: 'import stops taking a sku once its stock is used up',
    run: async ({ load }) => {
      const { importRows } = await load('src/import.mjs');
      const { cart, inventory } = await setup(load);
      const result = importRows(cart, [{ sku: 'pear', qty: '2' }, { sku: 'pear', qty: '2' }, { sku: 'pear', qty: '1' }]);
      assert.equal(result.added, 2);
      assert.deepEqual(result.rejected.map((entry) => entry.line), [2]);
      assert.equal(inventory.level('pear'), 0);
    }
  },
  {
    name: 'the handler still answers 400 for a bad quantity and 409 for too little stock',
    run: async ({ load }) => {
      const { addToCart } = await load('src/http.mjs');
      const { cart, inventory } = await setup(load);
      for (const qty of [0, -1, 2.5, '2', null]) {
        assert.equal(addToCart(cart, { sku: 'apple', qty }).status, 400, `qty ${String(qty)}`);
      }
      assert.equal(addToCart(cart, { sku: 'pear', qty: 4 }).status, 409);
      assert.equal(addToCart(cart, { sku: 'apple', qty: 4 }).status, 200);
      assert.equal(inventory.level('apple'), 6);
    }
  }
];
