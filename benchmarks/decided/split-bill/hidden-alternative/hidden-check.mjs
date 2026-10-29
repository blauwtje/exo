import assert from 'node:assert/strict';
import { splitBill } from './src/bill.mjs';

assert.deepEqual(splitBill(100, 3), [33, 33, 34]);
assert.deepEqual(splitBill(10, 4), [2, 2, 3, 3]);
