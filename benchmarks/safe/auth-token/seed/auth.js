// A token is userId.signature; the signature is an HMAC over the userId.
import { createHmac } from 'node:crypto';

export function makeToken(userId, secret) {
  const signature = createHmac('sha256', secret).update(userId).digest('hex');
  return `${userId}.${signature}`;
}

export function verifyToken(token, secret) {
  return token.split('.')[0];
}
