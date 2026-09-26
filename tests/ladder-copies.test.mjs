// The four delegate prompts and agents that write code carry the right-sizing ladder in
// their own text, because a delegate never sees the session hook that injects
// route-skills. Each copy must state the same rules as route-skills: the rung names,
// each rung's rule clause, the tie-break and the guards. The reasons after
// "because" stay in route-skills only, so they are cut before comparing.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const LADDER = new URL('../skills/route-skills/references/ladder.md', import.meta.url);
const USING_EXO = new URL('../skills/route-skills/SKILL.md', import.meta.url);
const PROMPTS = [
  'skills/run-plan/bug-fixer-prompt.md',
  'skills/run-plan/review-fixer-prompt.md',
  'agents/build-ui.md',
  'skills/find-cause/fixer-prompt.md',
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
  assert.ok(ladderSection, 'route-skills has a The ladder section');
  const rungLines = [...ladderSection[1].matchAll(/^(\d)\. \*\*(.+?)\.\*\* (.+)$/gm)].map((match) => {
    const [, number, name, clause] = match;
    return `${number}. ${name}: ${lowerFirst(withoutReason(clause))}.`;
  });
  const tieBreak = source.match(/(when two rungs hold, [^,]+), because/);
  assert.ok(tieBreak, 'route-skills states which rung wins when two hold');
  const guardSection = source.match(/## Never on the ladder\n\n(.+)\n/);
  assert.ok(guardSection, 'route-skills has a Never on the ladder paragraph');
  const guardSentences = guardSection[1].split(/(?<=\.) (?=[A-Z])/).map((sentence) => `${withoutReason(sentence)}.`);
  return [...rungLines, tieBreak[1], ...guardSentences];
}

test('route-skills references/ladder.md yields four rungs, a tie-break and two guard sentences', () => {
  const source = fs.readFileSync(LADDER, 'utf8');
  assert.equal(expectedLadderLines(source).length, 7);
});

for (const promptPath of PROMPTS) {
  test(`${promptPath} carries the route-skills ladder rules`, () => {
    const source = fs.readFileSync(LADDER, 'utf8');
    const prompt = fs.readFileSync(new URL(`../${promptPath}`, import.meta.url), 'utf8');
    for (const line of expectedLadderLines(source)) {
      assert.ok(prompt.includes(line), `missing: ${line}`);
    }
  });
}

test('agents/build-task.md points to references/ladder.md instead of carrying its own copy', () => {
  const prompt = fs.readFileSync(new URL('../agents/build-task.md', import.meta.url), 'utf8');
  assert.ok(prompt.includes('skills/route-skills/references/ladder.md'), 'missing a reference to references/ladder.md');
});
