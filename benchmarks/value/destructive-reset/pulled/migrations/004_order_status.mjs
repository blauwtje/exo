// Orders get a lifecycle status.
export function up(db) {
  db.addColumn('orders', 'status', { default: 'open' });
  db.addColumn('orders', 'currency', { default: 'EUR' });
}
