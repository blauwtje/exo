import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResultRuns, splitFlowRuns } from '../../lib/benchmark-compare.mjs';

const HEADING = '## Comparison with the baseline';
const METRICS = ['cost', 'wall', 'tokens'];

function comparisonSection(markdown) {
  const start = markdown.indexOf(HEADING);
  if (start === -1) return null;
  const rest = markdown.slice(start + HEADING.length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

function excludedProblems(section, markdown) {
  const line = section.split('\n').find((entry) => entry.startsWith('Excluded:'));
  if (!line) return ['no Excluded: line'];
  const { bypassed } = splitFlowRuns(parseResultRuns(markdown));
  return bypassed
    .filter((run) => !new RegExp(`candidate row ${run.row}(?!\\d)`).test(line))
    .map((run) => `Excluded: line does not name candidate row ${run.row}`);
}

function verdictProblems(section) {
  const verdicts = section.split('\n').filter((entry) => entry.includes('Verdict:'));
  return METRICS
    .filter((metric) => !verdicts.some((entry) => entry.includes(`Verdict: ${metric}`)))
    .map((metric) => `no Verdict: line for ${metric}`);
}

function sectionProblems(markdown) {
  const section = comparisonSection(markdown);
  if (section === null) return [];
  const missing = /^Baseline:/m.test(section) ? [] : ['no Baseline: line'];
  return [...missing, ...excludedProblems(section, markdown), ...verdictProblems(section)];
}

export function checkBaselineHonesty(root) {
  const folder = path.join(root, 'benchmarks', 'results');
  if (!fs.existsSync(folder)) return [];
  const files = fs.readdirSync(folder).filter((name) => name.endsWith('.md'));
  return files.flatMap((name) => {
    const markdown = fs.readFileSync(path.join(folder, name), 'utf8');
    return sectionProblems(markdown).map((problem) => `${name}: ${problem}`);
  });
}

export function checkBaselineHonestyReport(report, repository) {
  const problems = checkBaselineHonesty(repository.root);
  if (!problems.length) {
    report.result('PASS', 'baseline honesty', 'every results comparison names its baseline, exclusions and verdicts');
    return;
  }
  for (const problem of problems) report.result('FAIL', 'baseline honesty', problem);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkBaselineHonesty(process.cwd());
  for (const problem of problems) console.error(problem);
  process.exit(problems.length ? 1 : 0);
}
