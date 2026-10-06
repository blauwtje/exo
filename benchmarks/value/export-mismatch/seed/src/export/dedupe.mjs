// The processor redelivers events and the ledger export repeats entries; a
// repeated row counts once, at its first place.
export function dedupe(rows) {
  const seen = new Set();
  const kept = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    kept.push(row);
  }
  return kept;
}
