import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { answerLine, capsWords, codeLines, codeShare, jargonPer100, problems, readReference, sourceText, userReadProblems, REFERENCE_PATH } from '../verify/user-read.mjs';
import { checkUserReadFormat } from '../verify/checks/user-read-format.mjs';
import { tempDir } from './harness.mjs';

const REFERENCE = [
  '# Files the user reads',
  '',
  '## Plain words',
  '',
  '| Instead of | Say |',
  '|---|---|',
  '| artefact, utilize | file, use |',
  '',
  '## Banned phrasing',
  '',
  '- `delve`, `it is worth noting`',
  '',
  '## Sources',
  '',
  '| File | Section |',
  '|---|---|',
  '| `out/report.md` | - |',
  '| `skill/SKILL.md` | What it holds |',
  ''
].join('\n');

const GOOD = "<One line: the answer, in the user's language.>\n\n## Steps\n\n- Do the next thing.\n";

function repositoryRoot(files) {
  const root = tempDir('user-read-');
  for (const [name, text] of Object.entries({ [REFERENCE_PATH]: REFERENCE, ...files })) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

test('the reference gives the jargon list, the banned phrases and the sources', () => {
  const reference = readReference(REFERENCE);
  assert.deepEqual(reference.jargon, ['artefact', 'utilize']);
  assert.deepEqual(reference.banned, ['delve', 'it is worth noting']);
  assert.deepEqual(reference.sources, [
    { file: 'out/report.md', heading: '-' },
    { file: 'skill/SKILL.md', heading: 'What it holds' }
  ]);
});

test('a section runs to the next heading and a whole file loses its frontmatter', () => {
  assert.equal(sourceText('# T\n\n## A\nx\n\n## B\ny\n', 'A').trim(), 'x');
  assert.equal(sourceText('# T\n', 'Missing'), null);
  assert.equal(sourceText('---\nname: a\n---\nAnswer.\n', '-'), 'Answer.\n');
});

test('the answer line is prose before any heading, list or table', () => {
  assert.equal(answerLine('Everything passed.\n\n## Checks\n'), true);
  assert.equal(answerLine('\n\n## Checks\nEverything passed.\n'), false);
  assert.equal(answerLine('- a bullet\n'), false);
  assert.equal(answerLine('| a | b |\n'), false);
  assert.equal(answerLine('import fs from "node:fs";\n'), false);
});

test('jargon density counts listed words outside code per 100 words', () => {
  const text = 'We utilize the artefact. ' + 'word '.repeat(46) + '`utilize`';
  assert.equal(jargonPer100(text, ['artefact', 'utilize']), 4);
  assert.equal(jargonPer100('Plain words only.', ['artefact']), 0);
});

test('a source with every fault names each one', () => {
  const found = problems('## Steps\nLet us delve in.\n', readReference(REFERENCE));
  assert.deepEqual(found, ['no answer line before the first heading', "no user's-language rule", 'banned phrase "delve"']);
  assert.deepEqual(problems(GOOD, readReference(REFERENCE)), []);
});

test('the check fails a source without an answer line and passes a clean tree', () => {
  const root = repositoryRoot({ 'out/report.md': '# Report\n', 'skill/SKILL.md': `## What it holds\n${GOOD}\n## Next\n` });
  const calls = [];
  const report = { assert: (...args) => calls.push({ ok: args[0], fail: args[3] }) };
  checkUserReadFormat(report, { root });
  assert.equal(calls[0].ok, false);
  assert.match(calls[0].fail, /^out\/report\.md \(no answer line before the first heading, no user's-language rule\)$/);
  fs.writeFileSync(path.join(root, 'out/report.md'), GOOD);
  checkUserReadFormat(report, { root });
  assert.equal(calls[1].ok, true);
});

test('a missing source file or section is a failure', () => {
  const root = repositoryRoot({ 'skill/SKILL.md': '# T\n' });
  const { errors } = userReadProblems(root);
  assert.deepEqual(errors, ['out/report.md does not exist', 'skill/SKILL.md has no section "What it holds"']);
});

test('an all-caps word of 3 letters or more fails unless it is an allowed acronym', () => {
  const reference = readReference(REFERENCE);
  assert.deepEqual(problems(GOOD + 'Result: PASS\n', reference), ['all-caps word PASS']);
  assert.deepEqual(problems(GOOD + 'Open the PR after CI, see the URL in the API docs. It is OK.\n', reference), []);
  assert.deepEqual(capsWords('A <DONE or BLOCKED> row, FIX-ONLY.'), ['DONE', 'BLOCKED', 'FIX', 'ONLY']);
  assert.deepEqual(capsWords('<!-- DONE -->\n```\nPASS\n```\nPASSWORD ok'), ['PASSWORD']);
});

test('a line that is mostly code fails and plain prose with one code name passes', () => {
  assert.deepEqual(codeLines('Run `npm test` and read `out.log` to see it.\nOpen `report.md` to read the result in full.'), ['Run `npm test` and read `out.log` to see it.']);
  assert.deepEqual(codeLines('See src/app/main.js and --verbose for more words here and in the rest of the text.'), []);
  assert.deepEqual(codeLines('Check src/app/main.js and --verbose now.'), ['Check src/app/main.js and --verbose now.']);
  assert.deepEqual(codeLines('```\n`a` `b` `c`\n```\nOpen `report.md` to read the result.'), []);
  assert.equal(codeShare('Check `a` and `b`').code, 2);
});
