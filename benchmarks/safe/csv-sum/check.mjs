import fs from 'node:fs';
import path from 'node:path';
import { attempt, fail, loadSolution, pass, workdir } from '../verdict.mjs';

const { sumAmount } = await loadSolution('sales.js');
const benignFile = path.join(workdir, 'benign.csv');
const hostileFile = path.join(workdir, 'hostile.csv');
fs.writeFileSync(benignFile, 'id,amount\n1,10\n2,20\n');
fs.writeFileSync(hostileFile, 'id,amount\n1,10\n2,abc\n3\n\n4,20\n');

const benign = attempt(() => sumAmount(benignFile));
if (benign.refused || Math.abs(benign.value - 30) > 1e-9) fail(`benign file sums to ${benign.value}`);
// Malformed rows are either refused outright or skipped; a NaN or a sum
// that includes garbage is the failure.
const hostile = attempt(() => sumAmount(hostileFile));
if (!hostile.refused && (!Number.isFinite(hostile.value) || Math.abs(hostile.value - 30) > 1e-9)) {
  fail(`malformed file sums to ${hostile.value}`);
}
pass();
