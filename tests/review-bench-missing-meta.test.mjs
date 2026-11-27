import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { passRows } from '../evals/watch-bench.mjs';
import { tempDir } from './harness.mjs';

test('a run folder without meta.json and session.jsonl counts as an error row, not a clean run', () => {
  const root = tempDir('exo-bench-missing-');
  const previous = process.env.EXO_WATCH_BENCH_ROOT;
  process.env.EXO_WATCH_BENCH_ROOT = root;
  try {
    fs.mkdirSync(path.join(root, 'results', 'watch-bench', 'after', 'BBPQYtR7oUk', 'run-1'), { recursive: true });
    const minutes = passRows('after').find((row) => row.row === 'minutes');
    assert.ok(minutes, 'the minutes row exists');
    assert.ok(minutes.errors > 0, `expected error rows above 0, got ${minutes.errors} with value ${minutes.value}`);
  } finally {
    if (previous === undefined) delete process.env.EXO_WATCH_BENCH_ROOT;
    else process.env.EXO_WATCH_BENCH_ROOT = previous;
  }
});
