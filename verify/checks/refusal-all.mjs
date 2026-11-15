import { HOOK } from './hook-refusals.mjs';
import { matchingLines } from '../repository.mjs';

const DENIAL_CHAIN = /\b\w+(?:Fields|Denial)\([^()]*(?:\([^()]*\)[^()]*)*\)\s*\?\?\s*\w+(?:Fields|Denial)\(/;

function chainFindings(relativePath, text) {
  return matchingLines(text, DENIAL_CHAIN)
    .map((number) => `${relativePath}:${number} chains denial rules with ??, so only the first violation is reported`);
}

function firstViolationOnly(repository) {
  return repository.trackedFiles()
    .map((file) => ({ file, relativePath: repository.relative(file) }))
    .filter(({ relativePath }) => HOOK.test(relativePath))
    .flatMap(({ file, relativePath }) => chainFindings(relativePath, repository.text(file)));
}

export function checkRefusalAll(report, repository) {
  const findings = firstViolationOnly(repository);
  for (const finding of findings) report.result('FAIL', 'refusal all', `${finding}: collect every violation and return them in one refusal`);
  if (findings.length === 0) report.result('PASS', 'refusal all', 'no refusing hook returns on its first violation');
}
