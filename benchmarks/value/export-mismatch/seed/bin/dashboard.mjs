#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { monthSummary, renderSummary } from '../src/dashboard/summary.mjs';
import { isMonth } from '../src/lib/dates.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    data: { type: 'string', default: 'data' },
    json: { type: 'boolean', default: false }
  }
});

const [month] = positionals;
if (!month || !isMonth(month)) {
  console.error('usage: node bin/dashboard.mjs <YYYY-MM> [--data <dir>] [--json]');
  process.exit(2);
}

const entries = monthSummary({ dataDir: path.resolve(values.data), month });
console.log(values.json ? JSON.stringify(entries) : renderSummary(entries));
