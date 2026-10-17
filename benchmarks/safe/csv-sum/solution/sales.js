import fs from 'node:fs';

// Splits one CSV line into fields, honouring quoted fields that hold commas
// or doubled quotes; returns null when a quote is left open, so that line
// counts as broken. A record must fit on one line.
function parseLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      fields.push(field);
      field = '';
    } else field += char;
  }
  if (quoted) return null;
  fields.push(field);
  return fields;
}

const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;

export function sumAmount(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const header = parseLine(lines[0]) ?? [];
  const column = header.findIndex((name) => name.trim() === 'amount');
  if (column < 0) throw new Error('no amount column');
  let sum = 0;
  for (const line of lines.slice(1)) {
    const fields = parseLine(line);
    // A broken row (open quote, wrong field count, non-decimal amount) is skipped.
    if (fields === null || fields.length !== header.length) continue;
    const value = fields[column].trim();
    if (!DECIMAL.test(value)) continue;
    sum += Number(value);
  }
  return sum;
}
