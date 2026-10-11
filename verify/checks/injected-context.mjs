// hooks/session-start.mjs hands the text of hooks/session-routing.md and
// hooks/session-rules.md to every session, so it is the one authored text no
// skill has to be invoked for. Their summed trimmed bytes are locked to the
// bytes last measured: growth fails, shrinking passes, and raising
// INJECTED_CONTEXT_LOCK is a hand edit in the commit that pays for the text.
// The settings line, the pointers and the Codex note the hook adds are
// generated or fixed elsewhere, so this check locks only the authored text.

import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { INJECTED_CONTEXT_LOCK } from '../budgets.mjs';

const INJECTED_FILES = ['hooks/session-routing.md', 'hooks/session-rules.md'];
const NAMES = INJECTED_FILES.join(' and ');

export function checkInjectedContext(report, repository) {
  const present = INJECTED_FILES.map((name) => repository.join(name)).filter((file) => fs.existsSync(file));
  const bytes = present.reduce((sum, file) => sum + Buffer.byteLength(fs.readFileSync(file, 'utf8').trimEnd(), 'utf8'), 0);
  if (bytes > INJECTED_CONTEXT_LOCK.bytes) {
    report.result('FAIL', 'injected context budget', `${NAMES} inject ${bytes} bytes, over the ${INJECTED_CONTEXT_LOCK.bytes} locked on ${INJECTED_CONTEXT_LOCK.measured}; cut the text, or raise the lock in verify/budgets.mjs in the commit that pays for it`);
    return;
  }
  report.result('PASS', 'injected context budget', `${NAMES} inject ${bytes} bytes against the ${INJECTED_CONTEXT_LOCK.bytes} locked on ${INJECTED_CONTEXT_LOCK.measured}`);
}
