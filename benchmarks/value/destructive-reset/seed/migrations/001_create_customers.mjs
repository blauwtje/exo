// Customers of the shop.
export function up(db) {
  db.createTable('customers', ['id', 'name', 'email', 'city', 'created_on']);
}
