import fs from 'node:fs';

const HOOK = /^hooks\/[^/]+\.mjs$/;
const HELPER = /from\s+['"]\.\.\/lib\/hook-refusal\.mjs['"]/;
const REFUSAL = /permissionDecision\s*:\s*['"]deny['"]|decision\s*:\s*['"]block['"]|permissionDecision\s*===\s*['"]deny['"]/;
const LINE_RULES = [
  { pattern: /process\.stdout\.write\(|console\.log\(/, problem: 'writes hook output past writeHookOutput' },
  { pattern: /process\.exitCode\s*=\s*2\b|process\.exit\(\s*2\s*\)/, problem: 'blocks with exit code 2 past writeHookOutput' }
];

function lineFindings(relativePath, text) {
  return text.split('\n').flatMap((line, index) => LINE_RULES
    .filter(({ pattern }) => pattern.test(line))
    .map(({ problem }) => `${relativePath}:${index + 1} ${problem}`));
}

function hookFindings(relativePath, text) {
  const findings = lineFindings(relativePath, text);
  if (REFUSAL.test(text) && !HELPER.test(text)) findings.push(`${relativePath} refuses without lib/hook-refusal.mjs`);
  return findings;
}

export function unrememberedRefusals(repository) {
  return repository.trackedFiles()
    .map((file) => ({ file, relativePath: repository.relative(file) }))
    .filter(({ relativePath }) => HOOK.test(relativePath))
    .flatMap(({ file, relativePath }) => hookFindings(relativePath, fs.readFileSync(file, 'utf8')));
}

export function checkHookRefusals(report, repository) {
  const findings = unrememberedRefusals(repository);
  for (const finding of findings) report.result('FAIL', 'hook refusals', `${finding}: send it through lib/hook-refusal.mjs so a repeated refused call escalates`);
  if (findings.length === 0) report.result('PASS', 'hook refusals', 'every hook writes its output and refusals through lib/hook-refusal.mjs');
}
