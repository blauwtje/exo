export const ttl = 3600;

export function issue(userId, nowMs) {
  return { userId, issuedAt: nowMs };
}

export function isExpired(token, nowMs) {
  return nowMs - token.issuedAt > ttl * 1000;
}
