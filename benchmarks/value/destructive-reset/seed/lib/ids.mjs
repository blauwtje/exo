// Row ids look like ord-0016: a short prefix, a dash and a zero-padded counter.

export function nextId(rows, prefix, width = 4) {
  const lead = `${prefix}-`;
  let highest = 0;
  for (const row of rows) {
    if (typeof row.id !== 'string' || !row.id.startsWith(lead)) continue;
    const counter = row.id.slice(lead.length);
    if (/^\d+$/.test(counter)) highest = Math.max(highest, Number(counter));
  }
  return `${lead}${String(highest + 1).padStart(width, '0')}`;
}
