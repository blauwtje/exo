export function parseAmount(raw) {
  const value = Number(String(raw).replace(/[$€,\s]/g, ''));
  if (Number.isNaN(value)) throw new Error(`bad amount "${raw}"`);
  return value;
}

// One entry per category: { category, count, total }. `sort` is "total"
// (largest first, ties by name) or "name".
export function summarize(rows, { sort = 'total' } = {}) {
  const groups = new Map();
  for (const row of rows) {
    const category = row.category.trim();
    const group = groups.get(category) ?? { category, count: 0, total: 0 };
    group.count += 1;
    group.total += parseAmount(row.amount);
    groups.set(category, group);
  }
  const entries = [...groups.values()];
  if (sort === 'name') return entries.sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return entries.sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : 1));
}
