import fs from 'node:fs';
import { listedFiles } from './script-syntax.mjs';

const SEPARATOR = String.raw`(?:\\\\|\\|/)`;
const PERSONAL_PATH = new RegExp(
  String.raw`(?<![\w.~/-])(?:/Users/|/home/|[A-Za-z]:${SEPARATOR}Users${SEPARATOR})([A-Za-z0-9._-]+)`,
  'gi'
);
const PLACEHOLDERS = new Set(['user', 'username', 'you', 'name', 'example', 'runner', 'shared', 'public']);

function hitsIn(repository, file) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('\0')) return [];
  return text.split('\n').flatMap((line, index) => [...line.matchAll(PERSONAL_PATH)]
    .filter((match) => !PLACEHOLDERS.has(match[1].toLowerCase()))
    .map((match) => `${repository.relative(file)}:${index + 1} ${match[0]}`));
}

export function checkPersonalPaths(report, repository) {
  const hits = listedFiles(repository, () => true).flatMap((file) => hitsIn(repository, file));
  report.assert(
    hits.length === 0,
    'personal paths',
    { pass: 'no shipped file holds a personal absolute path', fail: hits.join('; ') }
  );
}
