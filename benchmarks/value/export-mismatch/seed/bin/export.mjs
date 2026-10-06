#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { writeMonth } from '../src/export/pipeline.mjs';
import { isMonth } from '../src/lib/dates.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    data: { type: 'string', default: 'data' },
    out: { type: 'string', default: 'exports' }
  }
});

const [month] = positionals;
if (!month || !isMonth(month)) {
  console.error('usage: node bin/export.mjs <YYYY-MM> [--data <dir>] [--out <dir>]');
  process.exit(2);
}

const file = writeMonth({ dataDir: path.resolve(values.data), outDir: path.resolve(values.out), month });
console.log(`wrote ${path.relative(process.cwd(), file)}`);
