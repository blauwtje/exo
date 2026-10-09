// Every exo question is exactly one question per message, never a batch: a
// plain title, lettered
// options `- **(A) Label**: text`, and a closing `Recommended: (A), because`
// line. The shape lives only in the question reference; the route-skills body
// and each skill point at it, so this test guards the text that states it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nextStageReport } from '../skills/route-skills/scripts/next-stage.mjs';
import { assertQuestionShape } from './question-shape.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const USING_EXO = read('skills/route-skills/SKILL.md');
const QUESTION = read('skills/route-skills/references/question.md');

test('the question reference is the one place that defines the shape, with A recommended', () => {
  assert.ok(QUESTION.includes('`**<title>**`'));
  assert.ok(QUESTION.includes('`- **(A) Label**: what the user gets`'));
  assert.ok(QUESTION.includes('`Recommended: (A), because <why A beats the others>`'));
  assert.ok(QUESTION.includes('A is always the recommended option'));
  assert.ok(QUESTION.includes('## One question'));
  assert.ok(QUESTION.includes('A message asks exactly one question'));
  assert.ok(QUESTION.includes('the next comes only after the answer'));
  assert.ok(!QUESTION.includes('numbered'), 'no batch of numbered questions');
  assert.ok(!QUESTION.includes('batch'), 'no batch of questions');
  assert.ok(!QUESTION.includes('asks them all'), 'no message asks several questions');
  assert.ok(QUESTION.includes('**Three or four options.**'));
  assert.ok(QUESTION.includes('a question tool, a form or a picker is never used'));
  assert.ok(QUESTION.includes('`b`, `B` and `(b)` all pick B'));
  assert.ok(!QUESTION.includes('1a'), 'no reply answers several questions');
  assert.ok(!QUESTION.includes('Without an answer'), 'no line for a missing answer');
});

test('the example is one short question with three options and the recommendation last', () => {
  const example = QUESTION.match(/```text\n([\s\S]*?)```/)[1];
  assert.ok(/^\*\*[^*\n]+\?\*\*\n/.test(example), 'a plain bold title, no number');
  assert.ok(/\n\n- \*\*\(A\) [^\n]*\n- \*\*\(B\) [^\n]*\n- \*\*\(C\) [^\n]*\n\nRecommended: \(A\), because [^\n]*\n$/.test(example));
  assert.ok(!example.includes('\n\n\n'));
  assert.ok(!example.includes('---'));
  const words = example.replace(/\*\*\([A-D]\) [^*]*\*\*/g, '').split(/\s+/).filter(Boolean);
  // The reference aims under about 60 words; the slack keeps the bound on "about".
  assert.ok(words.length <= 70, `the example runs to ${words.length} words`);
});

// The old shape: middle-dot option lines, bold or not, and titles, the arrow
// reason, and the line for a missing answer.
const OLD_SHAPE = [/^\s*-\s+(\*\*)?[A-J] · /m, /\*\*\d+ · /, /^\s*['"`]?→ [A-Z]\. /m, /Without an answer,/];

function shippedFiles(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return shippedFiles(relative);
    return /\.(md|mjs|json)$/.test(entry.name) ? [relative] : [];
  });
}

test('no skill, agent, output style, hook, library, doc or check still states or emits the old shape', () => {
  const files = ['skills', 'agents', 'output-styles', 'hooks', 'lib', 'docs', 'verify']
    .filter((dir) => fs.existsSync(path.join(ROOT, dir)))
    .flatMap(shippedFiles);
  const stale = files.filter((file) => OLD_SHAPE.some((pattern) => pattern.test(read(file))));
  assert.deepEqual(stale, []);
});

test('no file keeps a second copy of the shape', () => {
  assert.ok(!fs.existsSync(new URL('../skills/spec/references/question-shape.md', import.meta.url)));
});

test('the route-skills body points at the question reference', () => {
  assert.ok(USING_EXO.includes('read `references/question.md` first'));
});

test('the next stage has no reference file; the script prints A as the recommended option', () => {
  assert.ok(!fs.existsSync(new URL('../skills/route-skills/references/next-stage.md', import.meta.url)));
  const report = nextStageReport({ after: 'spec', artifact: 'brief.md' });
  assert.ok(report.includes('- **(A) Build fresh**'));
  assert.ok(report.includes('- **(B) Adjust the brief**'));
  assert.ok(!report.includes('Build here'));
  assert.ok(report.includes('Recommended: (A)'));
});

test('design-ui offers its preview as one plain question, showing the looks on A', () => {
  const intake = read('skills/design-ui/references/intake.md');
  const offer = intake.match(/```text\n([\s\S]*?)```/)[1].replace(/^ {2}/gm, '');
  assertQuestionShape(offer);
  assert.ok(offer.indexOf('- **(A) ') < offer.indexOf('- **(B) ') && offer.indexOf('- **(B) ') < offer.indexOf('- **(C) '));
  assert.ok(!intake.includes('(Recommended)'), 'A is recommended by its line, not by a tag');
  assert.ok(!/\d\s*(extra )?tokens/.test(intake), 'intake names no token count to the user');
});
