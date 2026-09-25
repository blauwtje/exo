// A description over DESCRIPTION_CHARS.ceiling fails, because the description
// standard in edit-skills caps it there; DESCRIPTION_CHARS.realistic is the aim
// that standard states. A skill named in PENDING_TRIM.description is held to
// PENDING_TRIM.ceilings.descriptionChars until its trim, and fails once it
// already meets the new ceiling. A total over DESCRIPTION_TOTAL_WARN warns,
// because every skill the model may invoke shares the always-loaded listing
// budget; a skill with disable-model-invocation: true stays out of that listing
// and the total. DESCRIPTION_TOTAL_LOCK fails that same total as soon as it
// passes what it last measured at: the ceiling catches one oversized addition,
// the lock catches the slow growth nobody decided on. DESCRIPTION_TOTAL_WARN is
// raised by hand in the commit that pays for the triggers, the same way the
// lock is.

import path from 'node:path';
import { readFrontmatter } from '../frontmatter.mjs';
import { DESCRIPTION_CHARS, DESCRIPTION_TOTAL_LOCK, DESCRIPTION_TOTAL_WARN, PENDING_TRIM } from '../budgets.mjs';

export function checkDescriptionBudgets(report, repository) {
  let total = 0;
  const overs = [];
  const unparsed = [];
  const pending = [];
  for (const file of repository.everySkillFile()) {
    const relative = repository.relative(file);
    const skill = path.basename(path.dirname(file));
    const parsed = readFrontmatter(repository.lines(file));
    if (parsed.errors.length > 0) {
      unparsed.push(relative);
      continue;
    }
    const length = (parsed.values.get('description') ?? '').length;
    if (parsed.values.get('disable-model-invocation') !== 'true') total += length;
    if (PENDING_TRIM.description.includes(skill)) {
      if (length <= DESCRIPTION_CHARS.ceiling) {
        overs.push(`${relative}: description is ${length} chars, within ${DESCRIPTION_CHARS.ceiling}: remove ${skill} from PENDING_TRIM.description in verify/budgets.mjs`);
      } else if (length > PENDING_TRIM.ceilings.descriptionChars) {
        overs.push(`${relative}: description is ${length} chars (> ${PENDING_TRIM.ceilings.descriptionChars} while pending its trim)`);
      } else {
        pending.push(skill);
      }
      continue;
    }
    if (length > DESCRIPTION_CHARS.ceiling) {
      overs.push(`${relative}: description is ${length} chars (> ${DESCRIPTION_CHARS.ceiling})`);
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
  if (total > DESCRIPTION_TOTAL_LOCK.chars) {
    report.result('FAIL', 'description budgets', `model-invocable description total is ${total} chars, over the ${DESCRIPTION_TOTAL_LOCK.chars} locked on ${DESCRIPTION_TOTAL_LOCK.measured}; shorten a description, or raise the lock in verify/budgets.mjs in the commit that pays for the text`);
    return;
  }
  if (total > DESCRIPTION_TOTAL_WARN.chars) {
    report.result('WARN', 'description budgets', `model-invocable description total is ${total} chars (> ${DESCRIPTION_TOTAL_WARN.chars}), pressing the ~1% listing budget shared with every installed skill`);
    return;
  }
  report.result('PASS', 'description budgets', `model-invocable descriptions total ${total} chars against the ${DESCRIPTION_TOTAL_LOCK.chars} locked on ${DESCRIPTION_TOTAL_LOCK.measured}; every skill is within ${DESCRIPTION_CHARS.ceiling} (pending trim: ${pending.join(', ') || 'none'})`);
}
