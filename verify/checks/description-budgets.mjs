// A description over PER_SKILL_LIMIT fails, because the description standard
// in skills-tool caps it there. A total over TOTAL_WARN warns, because every
// skill the model may invoke shares the always-loaded listing budget; a skill
// with disable-model-invocation: true stays out of that listing and the total.

import { readFrontmatter } from '../frontmatter.mjs';

const PER_SKILL_LIMIT = 400;
const TOTAL_WARN = 4000;

export function checkDescriptionBudgets(report, repository) {
  let total = 0;
  const overs = [];
  const unparsed = [];
  for (const file of repository.everySkillFile()) {
    const relative = repository.relative(file);
    const parsed = readFrontmatter(repository.lines(file));
    if (parsed.errors.length > 0) {
      unparsed.push(relative);
      continue;
    }
    const length = (parsed.values.get('description') ?? '').length;
    if (parsed.values.get('disable-model-invocation') !== 'true') total += length;
    if (length > PER_SKILL_LIMIT) {
      overs.push(`${relative}: description is ${length} chars (> ${PER_SKILL_LIMIT})`);
    }
  }
  if (unparsed.length > 0) {
    report.result('UNRUN', 'description budgets', `budget calculation blocked by unparsed frontmatter in ${unparsed.join(', ')}`);
    return;
  }
  if (overs.length > 0) {
    report.result('FAIL', 'description budgets', overs.join('; '));
    return;
  }
  if (total > TOTAL_WARN) {
    report.result('WARN', 'description budgets', `model-invocable description total is ${total} chars (> ${TOTAL_WARN}), pressing the ~1% listing budget shared with every installed skill`);
    return;
  }
  report.result('PASS', 'description budgets', `model-invocable descriptions total ${total} chars; every skill is within ${PER_SKILL_LIMIT}`);
}
