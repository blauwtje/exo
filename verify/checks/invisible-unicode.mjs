import fs from 'node:fs';
import { listedFiles } from './script-syntax.mjs';

const INVISIBLE = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/u;

const codePoint = (character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

function hitsIn(repository, file) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('\0')) return [];
  return text.split('\n').flatMap((line, index) => [...line]
    .filter((character) => INVISIBLE.test(character))
    .map((character) => `${repository.relative(file)}:${index + 1} ${codePoint(character)}`));
}

export function checkInvisibleUnicode(report, repository) {
  const hits = listedFiles(repository, () => true).flatMap((file) => hitsIn(repository, file));
  report.assert(
    hits.length === 0,
    'invisible unicode',
    { pass: 'no shipped file holds an invisible or bidi character', fail: hits.join('; ') }
  );
}
