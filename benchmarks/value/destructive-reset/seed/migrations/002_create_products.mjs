// Products on the shelf, priced in cents.
export function up(db) {
  db.createTable('products', ['id', 'sku', 'name', 'price_cents', 'stock']);
}
