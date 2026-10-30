import { parseCsvRow } from './csv.mjs';
import { parseDuration } from './duration.mjs';
import { toRoman } from './roman.mjs';
import { median } from './stats.mjs';
import { wrapText } from './wrap.mjs';

export function runReport(lines, width) {
  const rows = lines.map(parseCsvRow);
  const names = rows.map(([name]) => name);
  const seconds = rows.map(([, duration]) => parseDuration(duration));
  return wrapText(`${toRoman(rows.length)} runs, median ${median(seconds)}s: ${names.join(', ')}`, width);
}
