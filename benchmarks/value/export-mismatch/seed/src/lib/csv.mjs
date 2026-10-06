// Minimal RFC 4180 reader and writer: quoted fields, doubled quotes, CRLF or LF.

export function parseCsv(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      record.push(field);
      field = '';
      records.push(record);
      record = [];
    } else {
      field += char;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const [header, ...body] = records.filter((fields) => fields.length > 1 || fields[0] !== '');
  if (!header) return [];
  return body.map((fields) => Object.fromEntries(header.map((name, position) => [name, fields[position] ?? ''])));
}

function quote(value) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function formatCsv(header, rows) {
  return `${[header, ...rows].map((fields) => fields.map(quote).join(',')).join('\n')}\n`;
}
