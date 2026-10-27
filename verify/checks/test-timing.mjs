import fs from 'node:fs';

const CLOCK = String.raw`(?:Date\.now\(\)|performance\.now\(\)|process\.hrtime\.bigint\(\))\s*-\s*[A-Za-z_][\w.]*`;
const LITERAL = String.raw`\d[\d_]*(?:\.\d+)?n?(?![\w.]|\s*[*/+-]\s*\w)`;
const COMPARE = String.raw`(?:<=|>=|<|>)`;
const ASSERT_CALL = /\bassert(?:\.\w+)?\(/;
const EXEMPT = /,\s*['"`]timing-ok:/;

function elapsedNames(text) {
  const declaration = new RegExp(String.raw`\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*${CLOCK}`, 'g');
  return [...text.matchAll(declaration)].map((match) => match[1]);
}

function boundPattern(text) {
  const elapsed = [CLOCK, ...elapsedNames(text).map((name) => String.raw`\b${name}\b`)].join('|');
  return new RegExp(String.raw`(?:(?:${elapsed})\s*${COMPARE}\s*${LITERAL})|(?:${LITERAL}\s*${COMPARE}\s*(?:${elapsed}))`);
}

export function elapsedBounds(text) {
  const bound = boundPattern(text);
  return text.split('\n')
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter(({ text: line }) => ASSERT_CALL.test(line) && bound.test(line) && !EXEMPT.test(line))
    .map(({ line }) => line);
}

export function checkTestTiming(report, repository) {
  const directory = repository.join('tests');
  const names = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => name.endsWith('.mjs')) : [];
  let offenders = 0;
  for (const name of names) {
    for (const line of elapsedBounds(fs.readFileSync(repository.join('tests', name), 'utf8'))) {
      offenders += 1;
      report.result('FAIL', 'test timing', `tests/${name}:${line} bounds one elapsed time by a literal; compare two timed runs, or start the assert message with 'timing-ok: <reason>'`);
    }
  }
  if (offenders === 0) report.result('PASS', 'test timing', `${names.length} test files bound no raw elapsed time by a literal`);
}
