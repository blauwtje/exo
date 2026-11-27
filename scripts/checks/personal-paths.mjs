import { textHits } from '../lib/text-hits.mjs';

const SEPARATOR = String.raw`(?:\\\\|\\|/)`;
const PERSONAL_PATH = new RegExp(
  String.raw`(?<![\w.~/-])(?:/Users/|/home/|[A-Za-z]:${SEPARATOR}Users${SEPARATOR})([A-Za-z0-9._-]+)`,
  'gi'
);
const PLACEHOLDERS = new Set(['user', 'username', 'you', 'name', 'example', 'runner', 'shared', 'public']);

const hitsOfLine = (line) => [...line.matchAll(PERSONAL_PATH)]
  .filter((match) => !PLACEHOLDERS.has(match[1].toLowerCase()))
  .map((match) => match[0]);

export function checkPersonalPaths(report, repository) {
  const hits = textHits(repository, hitsOfLine);
  report.assert(
    hits.length === 0,
    'personal paths',
    { pass: 'no shipped file holds a personal absolute path', fail: hits.join('; ') }
  );
}
