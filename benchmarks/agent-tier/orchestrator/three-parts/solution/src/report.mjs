import { clamp } from './num.mjs';
import { slugify } from './text.mjs';

export function report(items) {
  return items.map((item) => `${slugify(item.name)}: ${clamp(item.score, 0, 100)}`).join('\n');
}
