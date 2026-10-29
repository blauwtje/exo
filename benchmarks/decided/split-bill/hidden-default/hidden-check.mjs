import assert from 'node:assert/strict';
import { splitBill } from './src/bill.mjs';

assert.deepEqual(splitBill(100, 3), [34, 33, 33]);
assert.deepEqual(splitBill(10, 4), [3, 3, 2, 2]);
