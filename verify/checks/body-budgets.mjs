// Every SKILL.md stays under SKILL_BODY_LIMIT, frontmatter included, because a
// body is paid for on every run of its skill while a reference costs nothing
// until the step that opens it. A body over the limit moves its bulk to
// references/; the limit is never raised for one skill.

import { Buffer } from 'node:buffer';
import { SKILL_BODY_LIMIT } from '../budgets.mjs';

export function checkBodyBudgets(report, repository) {
  const oversized = [];
  let largest = { bytes: 0, file: '' };
  for (const file of repository.everySkillFile()) {
    const bytes = Buffer.byteLength(repository.text(file), 'utf8');
    const relative = repository.relative(file);
    if (bytes > largest.bytes) largest = { bytes, file: relative };
    if (bytes > SKILL_BODY_LIMIT.bytes) oversized.push(`${relative} is ${bytes} bytes`);
  }
  report.assert(
    oversized.length === 0,
    'skill body budgets',
    `every skill body is within ${SKILL_BODY_LIMIT.bytes} bytes; the largest is ${largest.file} at ${largest.bytes}`,
    `${oversized.join('; ')}; the limit is ${SKILL_BODY_LIMIT.bytes}: move bulk into references/ and name in the body the step that opens it`
  );
}
