import { record } from '../audit/trail.mjs';
import { ValidationError } from '../util/errors.mjs';
import { nextInvoiceNumber } from './numbering.mjs';

const DAY_MS = 86_400_000;
const PAYMENT_TERM_DAYS = 30;

export function generateInvoice(tenant, quote, { now = new Date() } = {}) {
  if (quote.tenant !== tenant.id) throw new ValidationError('the quote belongs to another tenant');
  const invoice = {
    number: nextInvoiceNumber(tenant),
    tenant: tenant.id,
    quoteId: quote.id,
    currency: quote.currency,
    lines: quote.lines,
    total: quote.total,
    issuedAt: now.toISOString(),
    dueAt: new Date(now.getTime() + PAYMENT_TERM_DAYS * DAY_MS).toISOString(),
  };
  record({ tenant: tenant.id, type: 'invoice.issued', ref: invoice.number });
  return invoice;
}
