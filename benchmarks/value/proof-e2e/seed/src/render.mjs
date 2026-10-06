export function formatAmount(value) {
  return value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// The text report: a table, `top` limits the categories shown, and a Total
// line always covers every category.
export function renderText(summary, { top = null } = {}) {
  const shown = top === null ? summary : summary.slice(0, top);
  const hidden = summary.length - shown.length;
  const width = Math.max(8, ...shown.map((entry) => entry.category.length));
  const lines = [`${'Category'.padEnd(width)}  ${'Count'.padStart(5)}  ${'Total'.padStart(12)}`];
  for (const entry of shown) {
    lines.push(`${entry.category.padEnd(width)}  ${String(entry.count).padStart(5)}  ${formatAmount(entry.total).padStart(12)}`);
  }
  if (hidden > 0) lines.push(`... and ${hidden} more ${hidden === 1 ? 'category' : 'categories'}`);
  const grand = summary.reduce((sum, entry) => sum + entry.total, 0);
  lines.push(`${'Total'.padEnd(width)}  ${String(summary.reduce((n, entry) => n + entry.count, 0)).padStart(5)}  ${formatAmount(grand).padStart(12)}`);
  return `${lines.join('\n')}\n`;
}
