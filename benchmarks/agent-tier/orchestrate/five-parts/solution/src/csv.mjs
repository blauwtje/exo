export function parseCsvRow(line) {
  const fields = [''];
  let quoted = false;
  for (let at = 0; at < line.length; at += 1) {
    const char = line[at];
    if (quoted && char === '"' && line[at + 1] === '"') {
      fields[fields.length - 1] += '"';
      at += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push('');
    } else {
      fields[fields.length - 1] += char;
    }
  }
  return fields;
}
