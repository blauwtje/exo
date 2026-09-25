// skills/show-savings/scripts/restate.mjs sends part of the route-skills body again as
// a session grows, and a long session receives it several times. The text is
// locked to the bytes it last measured at: growth fails, shrinking passes, and
// raising RESTATEMENT_LOCK is a hand edit in the commit that pays for the text.
// A renamed heading fails here as well, because the hook would then send nothing.

import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { RESTATED_SKILL, restatementText } from '#restatement';
import { RESTATEMENT_LOCK } from '../budgets.mjs';

export function checkRestatement(report, repository) {
  const file = repository.join(RESTATED_SKILL);
  if (!fs.existsSync(file)) {
    report.result('UNRUN', 'restatement budget', `${RESTATED_SKILL} is missing, so the restatement cannot be measured`);
    return;
  }
  let restated;
  try {
    restated = restatementText(repository.text(file));
  } catch (error) {
    report.result('FAIL', 'restatement budget', `${error.message}, so the restatement hook sends nothing; restore the heading or change RESTATED_HEADINGS in lib/restatement.mjs`);
    return;
  }
  const bytes = Buffer.byteLength(restated, 'utf8');
  if (bytes > RESTATEMENT_LOCK.bytes) {
    report.result('FAIL', 'restatement budget', `${RESTATED_SKILL} restates ${bytes} bytes, over the ${RESTATEMENT_LOCK.bytes} locked on ${RESTATEMENT_LOCK.measured}; cut the restated sections, or raise the lock in verify/budgets.mjs in the commit that pays for the text`);
    return;
  }
  report.result('PASS', 'restatement budget', `${RESTATED_SKILL} restates ${bytes} bytes against the ${RESTATEMENT_LOCK.bytes} locked on ${RESTATEMENT_LOCK.measured}`);
}
