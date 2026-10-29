export function invite(inviter, rawEmail) {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`invalid email: ${rawEmail}`);
  return { email, invitedBy: inviter.email };
}
