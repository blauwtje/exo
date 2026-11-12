import fs from 'node:fs';
import path from 'node:path';
import { GUARD_RULES } from '../../lib/guard-rules.mjs';

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

const DENY_WRITE = /permissionDecision\s*:\s*['"]deny['"]|\bdeny\s*:\s*denyReason|\bdeny\(/;
const DENY_OWNERS = /^(?:lib\/lazy-steps\.mjs|lib\/hook-refusal\.mjs|hooks\/run-[^/]+\.mjs)$/;
const FIXTURES = 'tests/fixtures/hook-refusal-calls.json';

export function strayDenies(repository) {
  return repository.trackedFiles()
    .map((file) => ({ file, relativePath: repository.relative(file) }))
    .filter(({ relativePath }) => /^(?:hooks|lib)\/[^/]+\.mjs$/.test(relativePath) && !DENY_OWNERS.test(relativePath))
    .filter(({ file }) => DENY_WRITE.test(fs.readFileSync(file, 'utf8')))
    .map(({ relativePath }) => `${relativePath} writes a deny outside lib/lazy-steps.mjs`);
}

export function incompleteDenyRows(fixtureTable) {
  const verdicts = new Map();
  for (const call of fixtureTable) verdicts.set(`${call.rule}|${call.expect}`, true);
  return GUARD_RULES
    .filter((row) => row.harm)
    .flatMap((row) => [
      row.allowed ? null : `${row.id} lacks its Do instead text`,
      verdicts.has(`${row.id}|pass`) ? null : `${row.id} lacks a pass fixture`,
      verdicts.has(`${row.id}|deny`) ? null : `${row.id} lacks a deny fixture`
    ])
    .filter(Boolean);
}

function readFixtures(repository) {
  const file = path.join(repository.root, FIXTURES);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

export function checkHookRefusals(report, repository) {
  const findings = [
    ...unrememberedRefusals(repository).map((finding) => `${finding}: send it through lib/hook-refusal.mjs so a repeated refused call escalates`),
    ...strayDenies(repository).map((finding) => `${finding}: deny only through refuse in lib/lazy-steps.mjs, on a guard-rules row with harm`),
    ...incompleteDenyRows(readFixtures(repository)).map((finding) => `${finding}: a guard-rules row with harm needs its Do instead text and a pass and a deny fixture in ${FIXTURES}`)
  ];
  for (const finding of findings) report.result('FAIL', 'hook refusals', finding);
  if (findings.length === 0) report.result('PASS', 'hook refusals', 'every hook writes its output and refusals through lib/hook-refusal.mjs');
}
