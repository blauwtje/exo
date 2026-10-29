import assert from 'node:assert/strict';
import { paginate } from './src/paginate.mjs';

const items = Array.from({ length: 25 }, (_, index) => index + 1);
assert.deepEqual(paginate(items, 1), items.slice(0, 10));
assert.deepEqual(paginate(items, 3), items.slice(20));
