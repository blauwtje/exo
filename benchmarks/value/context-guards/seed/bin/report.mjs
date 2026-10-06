#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { runReport } from '../src/pipeline.mjs';

const { values } = parseArgs({
  options: {
    transactions: { type: 'string', default: 'data/transactions-2026-03.csv' },
    fx: { type: 'string', default: 'data/fx-2026-03.csv' },
    merchants: { type: 'string', default: 'data/merchants.csv' },
  },
});

const report = runReport({
  transactionsPath: values.transactions,
  fxPath: values.fx,
  merchantsPath: values.merchants,
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
