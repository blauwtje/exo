// One line per customer with at least one row: count and EUR total.
export function aggregate(rows, customers) {
  const lines = new Map();
  for (const row of rows) {
    const customer = customers.get(row.customerId);
    if (!customer) throw new Error(`unknown customer ${row.customerId} in ${row.source} row ${row.id}`);
    const line = lines.get(customer.id) ?? {
      customerId: customer.id,
      customer: customer.name,
      billingCurrency: customer.currency,
      transactions: 0,
      totalMinor: 0
    };
    line.transactions += 1;
    line.totalMinor += row.amountEur;
    lines.set(customer.id, line);
  }
  return [...lines.values()].sort((a, b) => a.customerId.localeCompare(b.customerId));
}
