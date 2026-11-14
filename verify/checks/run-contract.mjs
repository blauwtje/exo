const RUN_SCRIPTS = /^skills\/(build|gate)\/scripts\/[^/]+\.mjs$/;
const TURN_ENDING = /\b(end the turn|ends the turn|stop the run|stops the run)\b/;
const SPAWNERS = '(?:runTree|runTreeSync|spawnSync|execSync|execFileSync)';
const NODE_TEST = 'node -{2}test';
const NODE_TEST_ARRAY = "'node', \\['-{2}test'";
const NPM_CHECK = 'npm run (?:check|validate)';
const CHECK_SPAWN = new RegExp(`\\b${SPAWNERS}\\(\\s*(?:(?:proof|command|cfg\\.command)\\s*,\\s*\\{|[\`'"][^\`'"]*(?:${NPM_CHECK}|${NODE_TEST})|'npm', \\['run', '(?:check|validate)|${NODE_TEST_ARRAY}|testPoolCommand\\()`);
const DIRECT_CHECK_OWNERS = new Map([
  ['skills/build/scripts/changelog-task.mjs', 'runs the changelog proof itself']
]);
const PROSE_PAGES = ['skills/build/references/run-loop.md'];
const FULL_REVIEW_START = /`DISPATCH Branch/;
const SECOND_REVIEW_PROSE = /redispatch|round 2 or later/;
const GATE_PROSE = /^(skills\/gate\/.*\.md|agents\/review-branch\.md)$/;
const TABLE_POINTER = 'lib/run-outcomes.mjs';

function offendingLines(text, pattern) {
  return text.split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => pattern.test(line))
    .map(({ number }) => number);
}

function scriptFindings(repository, files) {
  const findings = [];
  for (const file of files.filter((name) => RUN_SCRIPTS.test(name))) {
    const text = repository.text(repository.join(file));
    const reviewStarts = offendingLines(text, FULL_REVIEW_START);
    for (const number of reviewStarts) findings.push(`${file}:${number} starts a full review outside exo:review-branch`);
    for (const number of offendingLines(text, TURN_ENDING)) findings.push(`${file}:${number} prints a stop line outside the outcome table`);
    if (DIRECT_CHECK_OWNERS.has(file)) continue;
    for (const number of offendingLines(text, CHECK_SPAWN)) findings.push(`${file}:${number} runs a check outside the check entry`);
  }
  return findings;
}

function secondReviewFindings(repository, files) {
  return files
    .filter((name) => GATE_PROSE.test(name))
    .flatMap((file) => offendingLines(repository.text(repository.join(file)), SECOND_REVIEW_PROSE)
      .map((number) => `${file}:${number} names a second full review step`));
}

function proseFindings(repository, files) {
  const findings = [];
  for (const file of PROSE_PAGES.filter((name) => files.includes(name))) {
    const text = repository.text(repository.join(file));
    for (const number of offendingLines(text, TURN_ENDING)) findings.push(`${file}:${number} holds a turn-ending rule outside the outcome table`);
    if (!text.includes(TABLE_POINTER)) findings.push(`${file} does not point to ${TABLE_POINTER}`);
  }
  findings.push(...secondReviewFindings(repository, files));
  return findings;
}

export function checkRunContract(report, repository) {
  const files = repository.trackedFiles().map((file) => repository.relative(file));
  const findings = [...scriptFindings(repository, files), ...proseFindings(repository, files)];
  report.assert(
    findings.length === 0,
    'run contract',
    'every build and gate stop and check path goes through the outcome table and the check entry',
    findings.join('; ')
  );
}
