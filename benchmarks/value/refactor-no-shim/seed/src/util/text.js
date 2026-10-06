export function normalizeEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!email.includes('@')) throw new Error(`invalid user email: ${raw}`);
  return email;
}

export function requireText(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}
