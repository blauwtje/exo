import { readFileSync } from 'node:fs';

export const DEFAULTS = { theme: 'light', pageSize: 20 };

export function loadSettings(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return { ...DEFAULTS, ...parsed };
}
