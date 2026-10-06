// Rows that count toward a customer's billing total.
export function keepBillable(rows) {
  return rows.filter((row) => row.status === 'settled' && row.amountMinor > 0);
}
