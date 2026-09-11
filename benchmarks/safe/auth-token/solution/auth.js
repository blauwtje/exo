import { createHmac, timingSafeEqual } from 'node:crypto';

export function makeToken(userId, secret) {
  const signature = createHmac('sha256', secret).update(userId).digest('hex');
  return `${userId}.${signature}`;
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;
  const userId = token.slice(0, separator);
  const given = Buffer.from(token.slice(separator + 1), 'utf8');
  const expected = Buffer.from(createHmac('sha256', secret).update(userId).digest('hex'), 'utf8');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}
