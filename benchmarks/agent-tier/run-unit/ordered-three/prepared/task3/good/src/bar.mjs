import { percent } from './percent.mjs';

export function bar(part, total, width) {
  const filled = Math.round((percent(part, total) / 100) * width);
  return '#'.repeat(filled) + '-'.repeat(width - filled);
}
