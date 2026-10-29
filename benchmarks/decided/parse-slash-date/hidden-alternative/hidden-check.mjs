import assert from 'node:assert/strict';
import { parseDate } from './src/date.mjs';

assert.equal(parseDate('03/04/2025'), '2025-03-04');
assert.equal(parseDate('12/25/2024'), '2024-12-25');
