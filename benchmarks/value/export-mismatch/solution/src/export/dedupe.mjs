// The processor redelivers events and the ledger export repeats entries; keep
// the first row of each source and id.
export function dedupe(rows) {
  const seen = new Set();
  const kept = [];
  for (const row of rows) {
    const key = `${row.source}/${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
  }
  return kept;
}
