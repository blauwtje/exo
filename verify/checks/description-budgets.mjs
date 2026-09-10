// Port of Test-DescriptionBudgets (verify.ps1:665-694): a description over the
// per-skill ceiling warns, and so does a total that presses the always-loaded
// listing budget every installed skill shares.

import path from 'node:path';
import { readFrontmatter } from '../frontmatter.mjs';

const PER_SKILL_WARN = 650;
const TOTAL_WARN = 4000;

export function checkDescriptionBudgets(report, repository) {
  let total = 0;
  const overs = [];
  const unparsed = [];
  for (const file of repository.walk(repository.skillsRoot, (candidate) => path.basename(candidate) === 'SKILL.md')) {
    const relative = repository.relative(file);
    const parsed = readFrontmatter(repository.lines(file));
    if (parsed.errors.length > 0) {
      unparsed.push(relative);
      continue;
    }
    const length = (parsed.values.get('description') ?? '').length;
    total += length;
    if (length > PER_SKILL_WARN) {
      overs.push(`${relative}: description is ${length} chars (> ${PER_SKILL_WARN})`);
    }
  }
  if (unparsed.length > 0) {
    report.result('UNRUN', 'description budgets', `budget calculation blocked by unparsed frontmatter in ${unparsed.join(', ')}`);
    return;
  }
  if (total > TOTAL_WARN) {
    overs.push(`always-loaded description total is ${total} chars (> ${TOTAL_WARN}), pressing the ~1% listing budget shared with every installed skill`);
  }
  if (overs.length === 0) {
    report.result('PASS', 'description budgets', `descriptions total ${total} chars; every skill is within ${PER_SKILL_WARN}`);
  } else {
    report.result('WARN', 'description budgets', overs.join('; '));
  }
}
