export function lineTotal(line) {
  return line.quantity * line.unitPriceMinor;
}

export function sumLines(lines) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export function formatMinor(minor) {
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  const whole = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${whole}.${String(absolute % 100).padStart(2, '0')}`;
}
