#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { processOrders } from '../src/batch.mjs';
import { formatMoney } from '../src/money.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: orders.mjs <orders.json>');
  process.exit(2);
}

const results = processOrders(JSON.parse(readFileSync(file, 'utf8')));
let errors = 0;
for (const result of results) {
  if (result.error) {
    errors += 1;
    console.log(`${result.id} ${result.type} ERROR ${result.error}`);
  } else {
    console.log(`${result.id} ${result.type} ${formatMoney(result.cents)}`);
  }
}
console.log(`${results.length} orders, ${errors} errors`);
