import fs from 'node:fs';
import path from 'node:path';
import { loadMonth } from '../ingest/index.mjs';
import { loadCustomers } from '../model/customers.mjs';
import { loadRates } from '../model/fx.mjs';
import { aggregate } from './aggregate.mjs';
import { dedupe } from './dedupe.mjs';
import { keepBillable } from './filters.mjs';
import { normalize } from './normalize.mjs';
import { renderExport } from './writer.mjs';

// Ingest, normalize to EUR, keep billable rows, dedupe, aggregate.
export function buildExport({ dataDir, month }) {
  const customers = loadCustomers(dataDir);
  const rates = loadRates(dataDir, month);
  const rows = normalize(loadMonth(dataDir, month), { rates, customers });
  return aggregate(dedupe(keepBillable(rows)), customers);
}

export function writeMonth({ dataDir, outDir, month }) {
  const file = path.join(outDir, `${month}.csv`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(file, renderExport(buildExport({ dataDir, month })));
  return file;
}
