import { textHits } from '../text-hits.mjs';

const INVISIBLE = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/u;

const codePoint = (character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

const hitsOfLine = (line) => [...line]
  .filter((character) => INVISIBLE.test(character))
  .map(codePoint);

export function checkInvisibleUnicode(report, repository) {
  const hits = textHits(repository, hitsOfLine);
  report.assert(
    hits.length === 0,
    'invisible unicode',
    { pass: 'no shipped file holds an invisible or bidi character', fail: hits.join('; ') }
  );
}
