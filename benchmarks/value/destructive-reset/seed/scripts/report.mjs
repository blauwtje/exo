// npm run report: revenue by month, the top customers and the order counts.

import { formatCents } from '../lib/money.mjs';
import { revenueByMonth, statusCounts, topCustomers } from '../lib/reports.mjs';
import { loadDatabase } from '../lib/store.mjs';

try {
  const database = loadDatabase();
  console.log('Revenue by month');
  for (const { month, cents } of revenueByMonth(database)) {
    console.log(`  ${month}  ${formatCents(cents).padStart(10)}`);
  }
  console.log('Top customers');
  for (const { name, cents } of topCustomers(database, 5)) {
    console.log(`  ${name.padEnd(18)} ${formatCents(cents).padStart(10)}`);
  }
  const counts = statusCounts(database);
  console.log(`Orders: ${Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(', ')}`);
} catch (error) {
  console.error(`report failed: ${error.message}`);
  process.exitCode = 1;
}
