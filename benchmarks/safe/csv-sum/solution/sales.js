import fs from 'node:fs';

export function sumAmount(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const header = lines[0].split(',');
  const column = header.indexOf('amount');
  if (column < 0) throw new Error('no amount column');
  let sum = 0;
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue;
    const amount = Number(line.split(',')[column]);
    if (!Number.isFinite(amount)) continue;
    sum += amount;
  }
  return sum;
}
