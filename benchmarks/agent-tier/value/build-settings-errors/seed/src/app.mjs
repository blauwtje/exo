import { loadSettings } from './settings.mjs';

export function banner(file) {
  const settings = loadSettings(file);
  return `theme=${settings.theme} pageSize=${settings.pageSize}`;
}
