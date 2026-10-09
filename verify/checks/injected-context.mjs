// hooks/session-start.mjs hands the text of hooks/session-rules.md to every
// session, so it is the one authored text no skill has to be invoked for. It is
// locked to the bytes it last measured at: growth fails, shrinking passes, and
// raising INJECTED_CONTEXT_LOCK is a hand edit in the commit that pays for the
// text. The settings line, the pointers and the Codex note the hook adds are
// generated or fixed elsewhere, so this check locks only the authored rules.

import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { INJECTED_CONTEXT_LOCK } from '../budgets.mjs';

const INJECTED_FILE = 'hooks/session-rules.md';

export function checkInjectedContext(report, repository) {
  const file = repository.join(INJECTED_FILE);
  if (!fs.existsSync(file)) {
    report.result('PASS', 'injected context budget', `${INJECTED_FILE} is absent, so the hook injects 0 bytes of rules against the ${INJECTED_CONTEXT_LOCK.bytes} locked on ${INJECTED_CONTEXT_LOCK.measured}`);
    return;
  }
  const bytes = Buffer.byteLength(fs.readFileSync(file, 'utf8').trimEnd(), 'utf8');
  if (bytes > INJECTED_CONTEXT_LOCK.bytes) {
    report.result('FAIL', 'injected context budget', `${INJECTED_FILE} injects ${bytes} bytes, over the ${INJECTED_CONTEXT_LOCK.bytes} locked on ${INJECTED_CONTEXT_LOCK.measured}; cut the text, or raise the lock in verify/budgets.mjs in the commit that pays for it`);
    return;
  }
  report.result('PASS', 'injected context budget', `${INJECTED_FILE} injects ${bytes} bytes against the ${INJECTED_CONTEXT_LOCK.bytes} locked on ${INJECTED_CONTEXT_LOCK.measured}`);
}
