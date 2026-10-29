export function signup(users, rawEmail) {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`invalid email: ${rawEmail}`);
  if (users.some((user) => user.email === email)) throw new Error(`duplicate email: ${email}`);
  const user = { email };
  users.push(user);
  return user;
}
