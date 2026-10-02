// Runs the test files under tests/, or only the files named after `--`
// (`npm test -- tests/tax.test.ts`), one file at a time, since every file
// posts to the same simulated ledger round-trip budget. With BENCH_SUITE_LOG
// set, each call first appends one JSON line naming its arguments and
// whether it ran the whole suite, so a benchmark can count full runs.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';

const files = process.argv.slice(2);
const full = files.length === 0;
const log = process.env.BENCH_SUITE_LOG;
if (log) {
  const entry = { ts: new Date().toISOString(), args: files, full, cwd: process.cwd() };
  fs.appendFileSync(log, `${JSON.stringify(entry)}\n`);
}
const targets = full ? ['tests/**/*.test.ts'] : files;
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...targets], { stdio: 'inherit' });
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
