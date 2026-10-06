// Plain text table: a header row, then one row per object, columns padded to fit.
export function table(rows, columns) {
  const cells = [columns.map((column) => column.title), ...rows.map((row) => columns.map((column) => String(row[column.key])))];
  const widths = columns.map((_, index) => Math.max(...cells.map((line) => line[index].length)));
  return cells.map((line) => line.map((text, index) => text.padEnd(widths[index])).join('  ').trimEnd()).join('\n') + '\n';
}
