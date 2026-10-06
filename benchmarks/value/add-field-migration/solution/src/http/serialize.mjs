import { currencyOf } from '../models/account.mjs';

const INVOICE_FIELDS = ['id', 'number', 'accountId', 'status', 'issuedAt', 'dueDate', 'lines', 'currency', 'totalMinor'];

export function serializeInvoice(invoice) {
  const view = {};
  for (const field of INVOICE_FIELDS) {
    if (field in invoice) view[field] = invoice[field];
  }
  return view;
}

export function serializeAccount(account, org) {
  return {
    id: account.id,
    orgId: account.orgId,
    name: account.name,
    billingEmail: account.billingEmail ?? null,
    currency: currencyOf(account, org),
  };
}
