export const ORDER_COLUMNS = ["id", "customerId", "status", "total"];

// Totals are signed: a refund is a negative order.
export function ordersToCsv(orders) {
  const rows = orders.map((o) =>
    [o.id, o.customerId, o.status, (o.totalCents / 100).toFixed(2)].join(","),
  );
  return [ORDER_COLUMNS.join(","), ...rows].join("\n") + "\n";
}
