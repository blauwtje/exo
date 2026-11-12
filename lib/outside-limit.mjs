const RATE_LIMITED = /HTTP Error 429|answered 429|Too Many Requests|rate-limited, retry later/i;
const REFUSED = /HTTP Error 403|Forbidden/i;
const SERVER = /HTTP Error 5\d\d/i;

export function classifyOutsideFailure({ status, text } = {}) {
  const message = String(text ?? '');
  if (status === 429 || RATE_LIMITED.test(message)) return 'rate-limited';
  if (status === 403 || REFUSED.test(message)) return 'refused';
  if (status >= 500 || SERVER.test(message)) return 'server';
  return 'other';
}
