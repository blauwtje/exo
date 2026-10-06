import { NotFoundError } from '../util/errors.mjs';

const quotesByTenant = new Map();
const counters = new Map();

export function nextQuoteId(tenantId) {
  const next = (counters.get(tenantId) ?? 0) + 1;
  counters.set(tenantId, next);
  return `Q-${tenantId}-${next}`;
}

export function saveQuote(quote) {
  if (!quotesByTenant.has(quote.tenant)) quotesByTenant.set(quote.tenant, new Map());
  quotesByTenant.get(quote.tenant).set(quote.id, quote);
  return quote;
}

export function getQuote(tenant, id) {
  const quote = quotesByTenant.get(tenant.id)?.get(id);
  if (!quote) throw new NotFoundError(`unknown quote "${id}"`);
  return quote;
}

export function listQuotes(tenant) {
  return [...(quotesByTenant.get(tenant.id)?.values() ?? [])];
}
