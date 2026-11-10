import fs from 'node:fs';

const SCOPE = /^(hooks|lib)\/.+\.mjs$/;
export const RULE_TABLE_EXCEPTIONS = ['lib/guard-rules.mjs'];
const QUOTE = '[\'"`]';
const LITERAL_DENIES = [
  new RegExp(`\\bpermissionDecisionReason:\\s*${QUOTE}`),
  new RegExp(`\\bdeny\\b.*\\breason:\\s*${QUOTE}`),
  new RegExp(`\\bdeny\\(\\s*${QUOTE}`),
  new RegExp(`\\b(?:const|let)\\s+reason\\s*=\\s*${QUOTE}`),
  /_REASON\s*=/,
  /\bdeny:\s*`/
];

export function literalDenyLines(text) {
  return text.split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => LITERAL_DENIES.some((pattern) => pattern.test(line)))
    .map(({ number }) => number);
}

function isDenySource(relativePath) {
  return SCOPE.test(relativePath) && !RULE_TABLE_EXCEPTIONS.includes(relativePath);
}

export function checkDenyReasons(report, repository) {
  const files = repository.trackedFiles().filter((file) => isDenySource(repository.relative(file)));
  let failures = 0;
  for (const file of files) {
    const relativePath = repository.relative(file);
    for (const number of literalDenyLines(fs.readFileSync(file, 'utf8'))) {
      failures += 1;
      report.result('FAIL', 'deny reasons', `${relativePath}:${number} builds a deny reason from a string literal: add a row to lib/guard-rules.mjs and read it with denyReason`);
    }
  }
  if (failures === 0) report.result('PASS', 'deny reasons', `${files.length} files in hooks/ and lib/ build every deny reason from the rule table`);
}
