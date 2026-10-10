// A skill body starts a paid run only when the user's request asks for one. A
// finding is `{ path, line }`: the file and the 1-based line of a markdown file
// under skills/, agents/ or output-styles/ naming `claude -p`, `pressure.mjs` or
// `benchmarks/run.mjs` without the user's request in the same line.

import fs from 'node:fs';
import path from 'node:path';

const PAID_RUN = /claude -p|pressure\.mjs|benchmarks\/run\.mjs/;
const TRIGGER = /\buser(?:'s)?\b.*\b(?:ask|asks|asked|request|requests|requested|invokes|invoked)\b/i;

export function paidRunFindings(repository) {
  const files = [repository.skillsRoot, repository.join('agents'), repository.join('output-styles')]
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => fs.readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(entry.parentPath, entry.name)))
    .sort();
  const findings = [];
  for (const file of files) {
    repository.lines(file).forEach((text, index) => {
      if (PAID_RUN.test(text) && !TRIGGER.test(text)) {
        findings.push({ path: repository.relative(file), line: index + 1 });
      }
    });
  }
  return findings;
}

export function checkPaidRuns(report, repository) {
  const findings = paidRunFindings(repository);
  report.assert(
    findings.length === 0,
    'paid runs',
    'every skill body line naming a paid run also names the user\'s request',
    `paid run without the user's request at ${findings.map((finding) => `${finding.path}:${finding.line}`).join(', ')}`
  );
}
