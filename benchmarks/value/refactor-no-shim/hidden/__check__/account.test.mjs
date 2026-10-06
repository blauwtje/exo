import assert from 'node:assert/strict';
import test from 'node:test';
import { Account } from '../src/models/account.js';
import * as barrel from '../src/models/index.js';
import { loadModels } from '../src/registry.js';

test('Account keeps the behavior of the old model', () => {
  const a = new Account({ id: 3, email: '  Zed@Example.COM ', name: ' Zed ' });
  assert.equal(a.email, 'zed@example.com');
  assert.equal(a.name, 'Zed');
  assert.equal(a.plan, 'free');
  assert.equal(a.displayName, 'Zed <zed@example.com>');
  assert.deepEqual(JSON.parse(JSON.stringify(a)), {
    kind: 'user', id: 3, email: 'zed@example.com', name: 'Zed', plan: 'free',
  });
  assert.deepEqual(Account.fromRow({ id: 9, email: 'q@r.st', name: 'Q', plan: 'pro' }).toJSON(), {
    kind: 'user', id: 9, email: 'q@r.st', name: 'Q', plan: 'pro',
  });
  assert.throws(() => new Account({ id: 1, email: 'nope', name: 'X' }), /^Error: invalid user email: nope$/);
  assert.throws(() => new Account({ id: 1, email: 'a@b.co', name: '' }), /^Error: name is required$/);
});

test('the models barrel exports exactly Account and PlanRecord', () => {
  assert.deepEqual(Object.keys(barrel).sort(), ['Account', 'PlanRecord']);
  assert.equal(barrel.Account, Account);
});

test('the registry loads the moved model by its config entry', async () => {
  const models = await loadModels();
  assert.deepEqual(Object.keys(models).sort(), ['Account', 'PlanRecord']);
  assert.equal(models.Account, Account);
});
