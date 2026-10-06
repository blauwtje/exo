import fs from 'node:fs';
import { parseAmount } from './amount.mjs';
import { parseCsv } from './csv.mjs';
import { createFx } from './fx.mjs';
import { createLogger } from './logger.mjs';

// Reads the three files and returns the report: the EUR total in minor units
// (cents), the total per merchant and what was skipped.
export function runReport({ transactionsPath, fxPath, merchantsPath, log = createLogger() }) {
  const rows = parseCsv(fs.readFileSync(transactionsPath, 'utf8'));
  const names = Object.fromEntries(
    parseCsv(fs.readFileSync(merchantsPath, 'utf8')).map((m) => [m.merchant_id, m.name]),
  );
  const fx = createFx(fs.readFileSync(fxPath, 'utf8'), log);

  const seen = new Set();
  const perMerchant = new Map();
  const skipped = { pending: 0, failed: 0, duplicate: 0, unparseable: 0 };
  let counted = 0;
  let total = 0;

  log.info(`report start: ${rows.length} rows`);
  rows.forEach((row, index) => {
    const line = index + 2;
    if (seen.has(row.txn_id)) {
      skipped.duplicate++;
      log.warn(`skip row ${line}: duplicate txn_id ${row.txn_id} (keeping first)`);
      return;
    }
    seen.add(row.txn_id);
    if (row.status !== 'settled') {
      skipped[row.status] = (skipped[row.status] ?? 0) + 1;
      log.debug(`skip row ${line}: status=${row.status}`);
      return;
    }
    const amount = parseAmount(row.amount);
    if (amount === null) {
      skipped.unparseable++;
      log.warn(`skip row ${line}: unparseable amount "${row.amount}"`);
      return;
    }
    const minor = Math.round(amount * 100);
    const eurMinor = Math.round(minor * fx.rateFor(row.currency, row.date));
    total += eurMinor;
    counted++;
    perMerchant.set(row.merchant_id, (perMerchant.get(row.merchant_id) ?? 0) + eurMinor);
    log.debug(`row ${line} ${row.txn_id} ${row.merchant_id} amount="${row.amount}" ${row.currency} -> ${eurMinor} eur_minor`);
  });
  log.info(`report done: counted ${counted} of ${rows.length} rows`);

  const merchants = {};
  for (const id of [...perMerchant.keys()].sort()) {
    merchants[id] = { name: names[id] ?? id, total_minor: perMerchant.get(id) };
  }
  return {
    currency: 'EUR',
    total_minor: total,
    total_eur: (total / 100).toFixed(2),
    merchants,
    rows: { read: rows.length, counted, skipped },
  };
}
