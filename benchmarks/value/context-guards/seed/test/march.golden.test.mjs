import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runReport } from '../src/pipeline.mjs';

const at = (relative) => fileURLToPath(new URL(relative, import.meta.url));

// Snapshot of the March 2026 report. After an intended change to the numbers,
// refresh it with `UPDATE_GOLDEN=1 npm test`.
test('March 2026 report matches the golden snapshot', () => {
  const report = runReport({
    transactionsPath: at('../data/transactions-2026-03.csv'),
    fxPath: at('../data/fx-2026-03.csv'),
    merchantsPath: at('../data/merchants.csv'),
  });
  const goldenPath = at('./golden/march.json');
  if (process.env.UPDATE_GOLDEN) {
    fs.writeFileSync(goldenPath, `${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  assert.deepStrictEqual(report, JSON.parse(fs.readFileSync(goldenPath, 'utf8')));
});
