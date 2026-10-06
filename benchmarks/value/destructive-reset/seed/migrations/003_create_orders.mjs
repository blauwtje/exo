// Orders, each holding its lines as a list of { sku, qty }.
export function up(db) {
  db.createTable('orders', ['id', 'customer_id', 'placed_on', 'lines', 'note']);
}
