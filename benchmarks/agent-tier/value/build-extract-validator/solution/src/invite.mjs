import { normalizeEmail } from './normalize-email.mjs';

export function invite(inviter, rawEmail) {
  return { email: normalizeEmail(rawEmail), invitedBy: inviter.email };
}
