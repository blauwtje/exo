export function importRows(cart, rows) {
  const rejected = [];
  let added = 0;
  rows.forEach((row, index) => {
    try {
      cart.add(row.sku, Number(row.qty));
      added += 1;
    } catch (error) {
      rejected.push({ line: index + 1, reason: error.message });
    }
  });
  return { added, rejected };
}
