// Port of Test-EvalReferenceTargets (verify.ps1:1440-1469): every reference file an
// expectation names exists under skills/. A case that expects a reference which
// was renamed away would otherwise grade a live run against a file nobody can load.

import fs from 'node:fs';
import path from 'node:path';

export function checkEvalReferenceTargets(report, repository) {
  const casesPath = repository.join('evals', 'cases.json');
  if (!fs.existsSync(casesPath)) {
    report.result('FAIL', 'evaluation reference targets', 'evals/cases.json is missing');
    return;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  } catch (error) {
    report.result('FAIL', 'evaluation reference targets', `cases.json is invalid: ${error.message}`);
    return;
  }

  const known = new Set(repository
    .walk(repository.skillsRoot, (file) => file.endsWith('.md') && path.basename(path.dirname(file)) === 'references')
    .map((file) => path.basename(file)));

  const problems = [];
  let expected = 0;
  for (const testCase of data.cases ?? []) {
    for (const reference of testCase.expected?.references ?? []) {
      expected += 1;
      if (!known.has(String(reference))) {
        problems.push(`case '${testCase.id}' expects unknown reference '${reference}'`);
      }
    }
  }

  report.assert(
    problems.length === 0,
    'evaluation reference targets',
    `${expected} expected references resolve to reference files that exist`,
    problems.join('; ')
  );
}
