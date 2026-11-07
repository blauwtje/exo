const CHALLENGE_STATUS = new Set([403, 429, 503]);
const CHALLENGE_BODY = /<title>\s*just a moment|cf-chl|verification successful|checking your browser/i;
const AGE_MARKER = /\b18\s*\+|are you (over|at least|older)|age verification|verify your age|over (the age of )?18|adults? only|adult content/i;
const ENTER_WORD = /\b(enter|i am (over )?18|i'm (over )?18|yes)\b/i;
const GATE_TEXT_LIMIT = 1500;
const CHALLENGE_TEXT_LIMIT = 4000;

export function isCloudflare(headers) {
  return Boolean(headers.get('cf-mitigated')) || /cloudflare/i.test(headers.get('server') ?? '');
}

export function blockReason({ status, headers, html, text }) {
  if (CHALLENGE_STATUS.has(status) && isCloudflare(headers)) return 'challenge';
  if (CHALLENGE_BODY.test(html) && text.length < CHALLENGE_TEXT_LIMIT) return 'challenge';
  if (status === 401 || status === 403) return 'not-public';
  if (status >= 400) return null;
  if (text === '') return 'empty';
  if (text.length < GATE_TEXT_LIMIT && AGE_MARKER.test(text) && ENTER_WORD.test(text)) return 'age-gate';
  return null;
}

export class BlockedPage extends Error {
  constructor(reason, runDir, url) {
    super(`status: blocked ${reason}; open it in your browser and save the text with: node fetch.mjs --save ${runDir} ${url} < text`);
    this.reason = reason;
  }
}
