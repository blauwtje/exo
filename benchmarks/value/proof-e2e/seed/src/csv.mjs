// Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF, a leading BOM.
export function parseCsv(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      record.push(field);
      field = '';
      if (record.some((value) => value !== '')) records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  record.push(field);
  if (record.some((value) => value !== '')) records.push(record);

  const [header, ...body] = records;
  if (!header) return [];
  return body.map((values) => Object.fromEntries(header.map((name, index) => [name.trim(), values[index] ?? ''])));
}
