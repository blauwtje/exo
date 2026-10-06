function cell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(records) {
  if (records.length === 0) return '';
  const rows = records.map((record) => record.toJSON());
  const header = Object.keys(rows[0]);
  const lines = [header.join(',')];
  for (const row of rows) lines.push(header.map((key) => cell(row[key])).join(','));
  return lines.join('\n') + '\n';
}
