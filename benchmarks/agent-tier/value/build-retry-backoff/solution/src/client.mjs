import { withRetry } from './retry.mjs';

export async function fetchUser(id, { fetcher, ...retryOptions }) {
  return withRetry(() => fetcher(`/users/${id}`), retryOptions);
}
