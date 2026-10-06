import { record } from '../audit/trail.mjs';
import { roundCents } from '../pricing/rounding.mjs';
import { ValidationError } from '../util/errors.mjs';

export function creditNote(tenant, invoice, { share }) {
  if (!(share > 0 && share <= 1)) throw new ValidationError('share must be above 0 and at most 1');
  const amount = roundCents(invoice.total * share);
  record({ tenant: tenant.id, type: 'credit.issued', ref: invoice.number });
  return { tenant: tenant.id, invoice: invoice.number, currency: invoice.currency, amount };
}
