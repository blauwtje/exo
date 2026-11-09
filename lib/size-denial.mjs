import { sizeReason } from './brief-denials.mjs';
import { fetchFields, fetchPages } from './brief-fetches.mjs';
import { fetchTokens } from './context-limits.mjs';

function splitAdvice(size, prompt) {
  const fetched = fetchFields(prompt, /^[ \t]*Fetches:[ \t]*(.*)$/im.exec(prompt)?.[1]?.trim(), false);
  const unit = fetched.callUnit * fetchTokens();
  const perWorker = Math.floor((size.budget - (size.tokens - fetchPages(fetched) * fetchTokens())) / unit);
  if (!fetched.count || perWorker < 1) return '';
  const workers = Math.ceil(fetched.count / perWorker);
  return ` Keep the asked total of ${fetched.count} Fetches and never lower it: split it over ${workers} workers of at most ${perWorker} Fetches each.`;
}

export function sizeDenial(size, context) {
  const reason = sizeReason(size, context);
  const overFetches = context.fetchDocs && !context.missing.length && !size.invalid.length && size.tokens > size.budget;
  return overFetches ? reason + splitAdvice(size, context.prompt) : reason;
}
