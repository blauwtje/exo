import { record } from '../audit/trail.mjs';
import { resolveOptions } from '../config/options.mjs';
import { priceCart } from '../pricing/engine.mjs';
import { nextQuoteId, saveQuote } from './store.mjs';

const DAY_MS = 86_400_000;

export function createQuote(tenant, items, { now = new Date() } = {}) {
  const options = resolveOptions(tenant);
  const priced = priceCart(tenant, items);
  const quote = {
    id: nextQuoteId(tenant.id),
    ...priced,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + options.quoteTtlDays * DAY_MS).toISOString(),
  };
  saveQuote(quote);
  record({ tenant: tenant.id, type: 'quote.created', ref: quote.id });
  return quote;
}

export function isExpired(quote, now = new Date()) {
  return new Date(quote.expiresAt).getTime() <= now.getTime();
}
