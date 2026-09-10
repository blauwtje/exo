// Port of Test-LineBudgets (verify.ps1:197-222): every process file stays inside
// its line ceiling, and the three files with a character ceiling report their
// measurement in the pass detail.

import path from 'node:path';
import {
  CHARACTER_BUDGETS,
  DEFAULT_REFERENCE_LINES,
  DEFAULT_SKILL_LINES,
  LINE_BUDGETS
} from '../budgets.mjs';

export function checkLineBudgets(report, repository) {
  const errors = [];
  const measured = [];
  for (const file of repository.processFiles()) {
    const relative = repository.relative(file);
    const count = repository.lines(file).length;
    const isSkill = path.basename(file) === 'SKILL.md';
    const limit = LINE_BUDGETS[relative] ?? (isSkill ? DEFAULT_SKILL_LINES : DEFAULT_REFERENCE_LINES);
    if (count > limit) {
      errors.push(`${relative} has ${count} lines; limit is ${limit}`);
    }
    // Character ceilings are file-specific on purpose: only the files this contract
    // constrains are measured, so untouched skills keep their line budget alone.
    const characterLimit = CHARACTER_BUDGETS[relative];
    if (characterLimit !== undefined) {
      const characters = repository.text(file).length;
      measured.push(`${relative} ${count} lines / ${characters} chars`);
      if (characters > characterLimit) {
        errors.push(`${relative} has ${characters} characters; limit is ${characterLimit}`);
      }
    }
  }
  report.assert(
    errors.length === 0,
    'line budgets',
    `all skill and reference files are within budget (${measured.join('; ')})`,
    errors.join('; ')
  );
}
