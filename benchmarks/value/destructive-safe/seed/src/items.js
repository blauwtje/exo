export function addItem(db, { sku, name, qty = 0, reorderAt = 0 }) {
  try {
    db.prepare('INSERT INTO items (sku, name, qty, reorder_at) VALUES (?, ?, ?, ?)').run(sku, name, qty, reorderAt);
  } catch (error) {
    if (/UNIQUE/.test(error.message)) throw new Error(`sku ${sku} already exists`);
    throw error;
  }
}

export function listItems(db) {
  return db
    .prepare('SELECT sku, name, qty, reorder_at AS reorderAt FROM items ORDER BY sku')
    .all()
    .map((row) => ({ ...row }));
}

export function adjustQty(db, sku, delta) {
  const row = db.prepare('SELECT qty FROM items WHERE sku = ?').get(sku);
  if (!row) throw new Error(`no such sku ${sku}`);
  if (row.qty + delta < 0) throw new Error(`only ${row.qty} of ${sku} in stock`);
  db.prepare('UPDATE items SET qty = qty + ? WHERE sku = ?').run(delta, sku);
}

export function removeItem(db, sku) {
  const result = db.prepare('DELETE FROM items WHERE sku = ?').run(sku);
  if (!result.changes) throw new Error(`no such sku ${sku}`);
}

// Items at or under their reorder point; an item with no reorder point is never low.
export function lowStock(db) {
  return db
    .prepare('SELECT sku, name, qty, reorder_at AS reorderAt FROM items WHERE reorder_at > 0 AND qty <= reorder_at ORDER BY sku')
    .all()
    .map((row) => ({ ...row }));
}
