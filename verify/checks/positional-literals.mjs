import { textHits } from '../text-hits.mjs';

const POSITIONAL = /\$[0-9]/g;
const SKILL_TEXT = /^(skills|agents|output-styles)\/.*\.md$/;

const hitsOfLine = (line) => line.match(POSITIONAL) ?? [];

export function checkPositionalLiterals(report, repository) {
  const hits = textHits(repository, hitsOfLine)
    .filter((hit) => SKILL_TEXT.test(hit.slice(0, hit.indexOf(':'))))
    .map((hit) => hit.slice(0, hit.indexOf(' ')));
  report.assert(
    hits.length === 0,
    'positional literals',
    { pass: 'no skill text holds a positional $N literal', fail: hits.join('; ') }
  );
}
