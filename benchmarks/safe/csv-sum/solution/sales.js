import fs from 'node:fs';

// Reads one CSV record starting at `start`, honouring quoted fields that hold
// commas, doubled quotes or line breaks. Returns null when a quote is left
// open, so that record counts as broken.
function parseRecord(text, start) {
  const fields = [];
  let field = '';
  let quoted = false;
  let index = start;
  for (; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        // A closing quote must end the field; anything else means the quote was never balanced.
        const next = text[index + 1];
        if (next !== undefined && next !== ',' && next !== '\n' && next !== '\r') return null;
        quoted = false;
      } else field += char;
    } else if (char === '"' && (index === start || text[index - 1] === ',')) quoted = true;
    else if (char === ',') {
      fields.push(field);
      field = '';
    } else if (char === '\n') break;
    else if (char === '\r' && text[index + 1] === '\n') continue;
    else field += char;
  }
  if (quoted) return null;
  fields.push(field);
  return { fields, next: index + 1 };
}

// Splits the text into records; a record with an open quote is dropped
// together with its first line, and reading resumes on the next line.
function parseRecords(text) {
  const records = [];
  let start = 0;
  while (start < text.length) {
    const record = parseRecord(text, start);
    if (record === null) {
      const newline = text.indexOf('\n', start);
      if (newline < 0) break;
      records.push(null);
      start = newline + 1;
    } else {
      records.push(record.fields);
      start = record.next;
    }
  }
  return records;
}

const DECIMAL = /^([+-]?)(\d*)\.?(\d*)$/;

export function sumAmount(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const [headerRow, ...rows] = parseRecords(text);
  const header = headerRow ?? [];
  const column = header.findIndex((name) => name.trim() === 'amount');
  if (column < 0) throw new Error('no amount column');
  // Amounts are summed as integers scaled by the most decimal places seen,
  // so decimal fractions add exactly.
  const amounts = [];
  let scale = 0;
  for (const fields of rows) {
    // A broken row (open quote, wrong field count, non-decimal amount) is skipped.
    if (fields === null || fields.length !== header.length) continue;
    const match = DECIMAL.exec(fields[column].trim());
    if (!match || match[2] + match[3] === '') continue;
    amounts.push(match);
    scale = Math.max(scale, match[3].length);
  }
  let total = 0n;
  for (const [, sign, whole, fraction] of amounts) {
    const scaled = BigInt(whole + fraction.padEnd(scale, '0'));
    total += sign === '-' ? -scaled : scaled;
  }
  const digits = (total < 0n ? -total : total).toString().padStart(scale + 1, '0');
  const split = digits.length - scale;
  const result = `${total < 0n ? '-' : ''}${digits.slice(0, split)}${scale ? `.${digits.slice(split)}` : ''}`;
  return Number(result);
}
