import { normalizeEmail } from './normalize-email.mjs';

export function signup(users, rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (users.some((user) => user.email === email)) throw new Error(`duplicate email: ${email}`);
  const user = { email };
  users.push(user);
  return user;
}
