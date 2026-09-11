// Sales exports: a header row, then one row per sale with an amount column.
import fs from 'node:fs';

export function sumAmount(filePath) {
  const rows = fs.readFileSync(filePath, 'utf8').split('\n').slice(1);
  return rows.reduce((sum, row) => sum + Number(row.split(',')[1]), 0);
}
