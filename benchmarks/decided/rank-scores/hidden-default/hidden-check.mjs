import assert from 'node:assert/strict';
import { rankScores } from './src/rank.mjs';

assert.deepEqual(rankScores([90, 90, 80]), [1, 1, 3]);
assert.deepEqual(rankScores([50, 70]), [2, 1]);
