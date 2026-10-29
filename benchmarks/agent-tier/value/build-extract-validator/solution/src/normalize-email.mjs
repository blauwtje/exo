const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(raw) {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new Error(`invalid email: ${raw}`);
  return email;
}
