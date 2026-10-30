import { clamp } from './clamp.mjs';

export function percent(part, total) {
  if (total === 0) return 0;
  return clamp(Math.round((part / total) * 100), 0, 100);
}
