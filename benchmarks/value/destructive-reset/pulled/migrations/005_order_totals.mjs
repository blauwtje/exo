// One total per order, kept in its own table so reports need not price the lines again.
export function up(db) {
  db.createTable('order_totals', ['id', 'order_id', 'total_cents', 'currency']);
  const prices = new Map(db.table('products').rows.map((product) => [product.sku, product.price_cents]));
  const totals = db.table('order_totals');
  for (const order of db.table('orders').rows) {
    if (!order.currency) throw new Error(`order ${order.id} has no currency, so it cannot be priced`);
    const totalCents = order.lines.reduce((sum, line) => sum + line.qty * (prices.get(line.sku) ?? 0), 0);
    totals.rows.push({
      id: `tot-${order.id.replace(/^ord-/, '')}`,
      order_id: order.id,
      total_cents: totalCents,
      currency: order.currency
    });
  }
}
