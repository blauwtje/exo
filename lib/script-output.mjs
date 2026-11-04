import fs from 'node:fs';
import path from 'node:path';
import { scratchPath } from '#scratch-path';

export function keepLines(text, reads) {
  const lines = text.split('\n');
  const last = lines.at(-1) === '' ? lines.pop() : null;
  const kept = lines.filter((line, index) => reads(line, index, lines));
  return `${kept.join('\n')}${last === null || kept.length === 0 ? '' : '\n'}`;
}

export function detailLogPath(root, name) {
  return scratchPath(root, path.join('logs', `${name}.log`));
}

export function forCaller({ root, name, full, shown }) {
  if (shown === full) return full;
  const file = detailLogPath(root, name);
  fs.writeFileSync(file, full);
  return `${shown}Detail: ${file}\n`;
}
