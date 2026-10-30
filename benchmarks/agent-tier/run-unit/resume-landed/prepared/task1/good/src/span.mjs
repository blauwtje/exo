export function span(values) {
  return Math.max(...values) - Math.min(...values);
}
