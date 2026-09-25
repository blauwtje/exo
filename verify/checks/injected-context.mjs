// hooks/session-start.sh hands the route-skills body to every session, so it is the
// one text no skill has to be invoked for and the most expensive exo owns. It is
// locked to the bytes it last measured at: growth fails, shrinking passes, and
// raising INJECTED_CONTEXT_LOCK is a hand edit in the commit that pays for the
// text. The hook keeps its whole output string under HOOK_OUTPUT_CAP in
// verify/budgets.mjs by cutting the tail of this body, never a pointer, so this
// check locks only the authored body.

import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { INJECTED_CONTEXT_LOCK } from '../budgets.mjs';

const INJECTED_SKILL = 'skills/route-skills/SKILL.md';

// Mirrors the hook: its awk drops every --- line and keeps what follows the
// second one, and its command substitution drops the trailing newlines. The
// settings line the hook appends after that is generated, not authored, so it
// stays out of the count.
function injectedBody(lines) {
  let fences = 0;
  const body = [];
  for (const line of lines) {
    if (line === '---') {
      fences += 1;
      continue;
    }
    if (fences >= 2) body.push(line);
  }
  return body.join('\n').replace(/\n+$/, '');
}

export function checkInjectedContext(report, repository) {
  const file = repository.join(INJECTED_SKILL);
  if (!fs.existsSync(file)) {
    report.result('UNRUN', 'injected context budget', `${INJECTED_SKILL} is missing, so the injected body cannot be measured`);
    return;
  }
  const bytes = Buffer.byteLength(injectedBody(repository.lines(file)), 'utf8');
  if (bytes > INJECTED_CONTEXT_LOCK.bytes) {
    report.result('FAIL', 'injected context budget', `${INJECTED_SKILL} injects ${bytes} bytes, over the ${INJECTED_CONTEXT_LOCK.bytes} locked on ${INJECTED_CONTEXT_LOCK.measured}; cut the body, or raise the lock in verify/budgets.mjs in the commit that pays for the text`);
    return;
  }
  report.result('PASS', 'injected context budget', `${INJECTED_SKILL} injects ${bytes} bytes against the ${INJECTED_CONTEXT_LOCK.bytes} locked on ${INJECTED_CONTEXT_LOCK.measured}`);
}
