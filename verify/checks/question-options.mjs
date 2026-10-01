// Every exo question recommends option A, and no text states an assumption in
// place of asking. A finding is `{ path, line }`: the file and the 1-based line
// holding a `→ <letter>.` recommendation off A, a `(Recommended)` tag, or an `Assuming:` line. Every
// markdown and script file under skills/, agents/, output-styles/ and lib/ is read, listed skill or not, because
// the route-skills references sit outside the listed skills.

import fs from 'node:fs';
import path from 'node:path';

const RECOMMENDATION_OFF_A = /^\s*['"`]?→ (?!A\.)[A-Z]\./;
const RECOMMENDED_TAG = /\(Recommended\)/;
const ASSUMING = /^\s*(?:[-*]\s+)?Assuming:/;

export function questionOptionFindings(repository) {
  const files = [repository.skillsRoot, repository.join('agents'), repository.join('output-styles'), repository.join('lib')]
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => fs.readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(md|mjs)$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name)))
    .sort();
  const findings = [];
  for (const file of files) {
    repository.lines(file).forEach((text, index) => {
      if (RECOMMENDATION_OFF_A.test(text) || RECOMMENDED_TAG.test(text) || ASSUMING.test(text)) {
        findings.push({ path: repository.relative(file), line: index + 1 });
      }
    });
  }
  return findings;
}

export function checkQuestionOptions(report, repository) {
  const findings = questionOptionFindings(repository);
  report.assert(
    findings.length === 0,
    'question options',
    'every recommendation sits on A, none is tagged (Recommended), and no line opens with Assuming:',
    `recommendation off A, a (Recommended) tag or an Assuming: line at ${findings.map((finding) => `${finding.path}:${finding.line}`).join(', ')}`
  );
}
