import { PAYMENT_TERMS_DAYS } from '../config.mjs';
import { nextSequence } from '../db/store.mjs';
import { buildInvoice } from '../models/invoice.mjs';
import { addDays, isIsoDate, today } from '../util/dates.mjs';
import { invalid, notFound } from '../util/errors.mjs';
import { accountCurrency, getAccount } from './accounts.mjs';

function normalizeLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw invalid('an invoice needs at least one line');
  return lines.map((line, index) => {
    const description = typeof line?.description === 'string' ? line.description.trim() : '';
    if (description === '') throw invalid(`line ${index + 1} needs a description`);
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw invalid(`line ${index + 1} needs a whole quantity`);
    if (!Number.isInteger(line.unitPriceMinor)) throw invalid(`line ${index + 1} needs a unit price in minor units`);
    return { description, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor };
  });
}

export function createInvoice(db, input) {
  const account = getAccount(db, input?.accountId);
  const lines = normalizeLines(input.lines);
  const issuedAt = input.issuedAt ?? today();
  const dueDate = input.dueDate ?? addDays(issuedAt, PAYMENT_TERMS_DAYS);
  if (!isIsoDate(issuedAt) || !isIsoDate(dueDate)) throw invalid('dates are written YYYY-MM-DD');
  const invoice = buildInvoice({
    sequence: nextSequence(db, 'invoice'),
    account,
    currency: accountCurrency(db, account.id),
    lines,
    issuedAt,
    dueDate,
    notes: input.notes,
  });
  db.invoices.push(invoice);
  return invoice;
}

export function getInvoice(db, id) {
  const invoice = db.invoices.find((candidate) => candidate.id === id);
  if (!invoice) throw notFound('invoice', id);
  return invoice;
}

export function listInvoices(db, { accountId } = {}) {
  return db.invoices
    .filter((invoice) => accountId === undefined || invoice.accountId === accountId)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.id.localeCompare(a.id));
}
