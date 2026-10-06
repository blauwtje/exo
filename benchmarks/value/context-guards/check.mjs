// Hidden check for value-context-guards. Runs the real CLI, `bin/report.mjs`,
// over hidden CSV files and compares the report's totals; then runs the
// repository's own `npm test`. Usage: node check.mjs <repoDir>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(process.argv[2] ?? '.');
const data = path.join(repo, 'check-data');
const env = { ...process.env, LOG_LEVEL: 'error' };
const detail = [];

function report(transactions, fx, merchants) {
  const run = spawnSync(
    process.execPath,
    ['bin/report.mjs', '--transactions', transactions, '--fx', fx, '--merchants', merchants],
    { cwd: repo, env, encoding: 'utf8', timeout: 20_000, maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status !== 0) throw new Error(`report exited ${run.status}: ${(run.stderr || '').trim().slice(-200)}`);
  return JSON.parse(run.stdout);
}

const perMerchant = (result) =>
  Object.fromEntries(Object.entries(result.merchants).map(([id, m]) => [id, m.total_minor]));
const small = (name) => report(path.join(data, name), path.join(data, 'fx.csv'), path.join(data, 'merchants.csv'));
const marchReport = () =>
  report(
    path.join(data, 'march', 'transactions-2026-03.csv'),
    path.join(data, 'march', 'fx-2026-03.csv'),
    path.join(data, 'march', 'merchants.csv'),
  );
const march = JSON.parse(fs.readFileSync(path.join(data, 'march-expected.json'), 'utf8'));

// Each case returns an error text or null. Expected values of the small cases
// are worked out by hand from the rows in hidden/check-data/tx-*.csv; the March
// ones come from the generator, which sums the true amounts, not the report code.
const cases = [
  ['accounting parentheses are refunds', () => {
    const r = small('tx-parens.csv');
    return r.total_minor === 2475 ? null : `total ${r.total_minor}, want 2475 (100.00 - 30.25 - 45.00)`;
  }],
  ['thousands separators keep the whole amount', () => {
    const r = small('tx-thousands.csv');
    return r.total_minor === 1234688339 ? null : `total ${r.total_minor}, want 1234688339`;
  }],
  ['parenthesised amount with thousands separators', () => {
    const r = small('tx-both.csv');
    return r.total_minor === -599450 ? null : `total ${r.total_minor}, want -599450`;
  }],
  ['a rate gap longer than a weekend uses the latest earlier rate', () => {
    const r = small('tx-fx-gap.csv');
    const m = perMerchant(r);
    return r.total_minor === 13500 && m.M001 === 9500 && m.M002 === 4000
      ? null
      : `total ${r.total_minor} per merchant ${JSON.stringify(m)}, want 13500 {M001 9500, M002 4000}`;
  }],
  ['pending, failed, repeated and unreadable rows stay out', () => {
    const r = small('tx-controls.csv');
    const m = perMerchant(r);
    return r.total_minor === 5250 && m.M001 === 6250 && m.M002 === -1000
      ? null
      : `total ${r.total_minor} per merchant ${JSON.stringify(m)}, want 5250 {M001 6250, M002 -1000}`;
  }],
  ['March 2026 total', () => {
    const r = marchReport();
    return r.total_minor === march.total_minor ? null : `total ${r.total_minor}, want ${march.total_minor}`;
  }],
  ['March 2026 per-merchant totals', () => {
    const got = perMerchant(marchReport());
    const ids = Object.keys(march.merchants);
    const wrong = ids.filter((id) => got[id] !== march.merchants[id]);
    return wrong.length === 0 ? null : `${wrong.length} of ${ids.length} merchants differ (${wrong.slice(0, 5).join(', ')})`;
  }],
  ['npm test is green', () => {
    const run = spawnSync('npm', ['test'], { cwd: repo, env, encoding: 'utf8', timeout: 25_000, maxBuffer: 64 * 1024 * 1024 });
    return run.status === 0 ? null : `npm test exited ${run.status}`;
  }],
];

let defects = 0;
for (const [name, run] of cases) {
  let error;
  try {
    error = run();
  } catch (e) {
    error = e.message;
  }
  if (error) {
    defects++;
    detail.push(`${name}: ${error}`);
  }
}
console.log(JSON.stringify({ pass: defects === 0, defects, total: cases.length, detail }));
