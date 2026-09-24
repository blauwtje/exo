// The four delegate prompts and agents that write code carry the right-sizing ladder in
// their own text, because a delegate never sees the session hook that injects
// using-exo. Each copy must state the same rules as using-exo: the rung names,
// each rung's rule clause, the tie-break and the guards. The reasons after
// "because" stay in using-exo only, so they are cut before comparing.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const USING_EXO = new URL('../skills/using-exo/SKILL.md', import.meta.url);
const PROMPTS = [
  'agents/implementer.md',
  'skills/implementing/bug-fixer-prompt.md',
  'skills/implementing/review-fixer-prompt.md',
  'agents/design-builder.md',
];

function withoutReason(clause) {
  const reasonStart = clause.indexOf(', because ');
  const rule = reasonStart === -1 ? clause : clause.slice(0, reasonStart);
  return rule.replace(/\.$/, '');
}

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function expectedLadderLines(source) {
  const ladderSection = source.match(/## The ladder\n([\s\S]*?)\n## Never on the ladder/);
  assert.ok(ladderSection, 'using-exo has a The ladder section');
  const rungLines = [...ladderSection[1].matchAll(/^(\d)\. \*\*(.+?)\.\*\* (.+)$/gm)].map((match) => {
    const [, number, name, clause] = match;
    return `${number}. ${name}: ${lowerFirst(withoutReason(clause))}.`;
  });
  const tieBreak = source.match(/(when two rungs hold, [^,]+), because/);
  assert.ok(tieBreak, 'using-exo states which rung wins when two hold');
  const guardSection = source.match(/## Never on the ladder\n\n(.+)\n/);
  assert.ok(guardSection, 'using-exo has a Never on the ladder paragraph');
  const guardSentences = guardSection[1].split(/(?<=\.) (?=[A-Z])/).map((sentence) => `${withoutReason(sentence)}.`);
  return [...rungLines, tieBreak[1], ...guardSentences];
}

test('using-exo yields four rungs, a tie-break and two guard sentences', () => {
  const source = fs.readFileSync(USING_EXO, 'utf8');
  assert.equal(expectedLadderLines(source).length, 7);
});

for (const promptPath of PROMPTS) {
  test(`${promptPath} carries the using-exo ladder rules`, () => {
    const source = fs.readFileSync(USING_EXO, 'utf8');
    const prompt = fs.readFileSync(new URL(`../${promptPath}`, import.meta.url), 'utf8');
    for (const line of expectedLadderLines(source)) {
      assert.ok(prompt.includes(line), `missing: ${line}`);
    }
  });
}
