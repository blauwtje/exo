import { matchingLines } from '../repository.mjs';

const SCOPE = /^(hooks|lib)\/.+\.mjs$/;
const RULE_TABLE_EXCEPTIONS = ['lib/guard-rules.mjs'];
const QUOTE = '[\'"`]';
const LITERAL_DENIES = [
  new RegExp(`\\bpermissionDecisionReason:\\s*${QUOTE}`),
  new RegExp(`\\bdeny\\b.*\\breason:\\s*${QUOTE}`),
  new RegExp(`\\bdeny\\(\\s*${QUOTE}`),
  new RegExp(`\\b(?:const|let)\\s+reason\\s*=\\s*${QUOTE}`),
  /_REASON\s*=/,
  /\bdeny:\s*`/
];

const LITERAL_DENY = new RegExp(LITERAL_DENIES.map((pattern) => `(?:${pattern.source})`).join('|'));

function isDenySource(relativePath) {
  return SCOPE.test(relativePath) && !RULE_TABLE_EXCEPTIONS.includes(relativePath);
}

export function checkDenyReasons(report, repository) {
  const files = repository.trackedFiles().filter((file) => isDenySource(repository.relative(file)));
  let failures = 0;
  for (const file of files) {
    const relativePath = repository.relative(file);
    for (const number of matchingLines(repository.text(file), LITERAL_DENY)) {
      failures += 1;
      report.result('FAIL', 'deny reasons', `${relativePath}:${number} builds a deny reason from a string literal: add a row to lib/guard-rules.mjs and read it with denyReason`);
    }
  }
  if (failures === 0) report.result('PASS', 'deny reasons', `${files.length} files in hooks/ and lib/ build every deny reason from the rule table`);
}
