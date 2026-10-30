import { ttl } from './auth.mjs';

export function expiresAt(token) {
  return token.issuedAt + ttl * 1000;
}
