export function report(items) {
  return items.map((item) => `${item.name}: ${item.score}`).join('\n');
}
